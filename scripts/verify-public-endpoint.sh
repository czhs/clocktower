#!/usr/bin/env bash
# Verify the PUBLIC production endpoint from outside the host (read-only + one WSS upgrade), and
# verify the dev service is not exposed.
#
#   scripts/verify-public-endpoint.sh [public-url] [--expect-version <sha>] [--resolver <ip>]
#   CT_PUBLIC_URL=https://clocktower.chrisshi.com scripts/verify-public-endpoint.sh
#   default public URL: $CT_PUBLIC_URL or https://clocktower.chrisshi.com (Cloudflare Tunnel)
#
# Name resolution: the hostname is resolved through PUBLIC DNS (default 1.1.1.1, falling back to
# 8.8.8.8; override with --resolver) and pinned with `curl --resolve`, so a stale local/MagicDNS
# cache (e.g. a cached NXDOMAIN, or AAAA-only answers on a host without an IPv6 route) cannot
# produce false failures. The resolver used is printed.
#
# Checks
#   1. public DNS A record
#   2. TLS: certificate valid for the name (curl verifies the chain) + subject/issuer/expiry
#   3. GET /healthz -> {ok:true} only (no env/version); /internal/version 404 publicly; the local
#      127.0.0.1:3000/internal/version -> env=production (+ version if given); CDN headers reported
#   4. GET / -> SPA shell; security headers survive the proxy (nosniff, X-Frame-Options)
#   5. WebSocket Upgrade on the Colyseus path (/<processId>/<roomId>) -> HTTP 101 (WSS works)
#   6. dev is private:
#        - the public hostname never answers env=development; https://host:3001 is not served
#        - live cloudflared ingress (metrics /config, else the unit's --config file) never targets :3001
#        - tailscale serve/funnel config never targets :3001
#        - :3001 and :3000 listen on 127.0.0.1 only; the tailnet IP refuses both
#   7. (optional) Tailscale Funnel: checked only if `tailscale funnel status --json` is non-empty
# Exit 0 only if every non-skipped check passed.
set -uo pipefail
URL="${CT_PUBLIC_URL:-https://clocktower.chrisshi.com}"; EXPECT_VERSION=""; RESOLVER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --expect-version) EXPECT_VERSION="$2"; shift ;;
    --resolver) RESOLVER="$2"; shift ;;
    -*) echo "unknown flag $1" >&2; exit 2 ;;
    *) URL="$1" ;;
  esac
  shift
done
URL="${URL%/}"
NAME=$(sed -E 's#^https?://([^/:]+).*#\1#' <<<"$URL")
[[ $URL == https://* ]] || { echo "public URL must be https://" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/scripts/lib/ops-env.sh"; ct_load_ops_env "$ROOT"
SSH_HOST="$(ct_require_host)"
FAILS=0; SKIPS=0
pass() { printf '  PASS  %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; FAILS=$((FAILS + 1)); }
skip() { printf '  SKIP  %s\n' "$*"; SKIPS=$((SKIPS + 1)); }
info() { printf '  ....  %s\n' "$*"; }

echo "public endpoint verification: $URL"

# 1. Public DNS --------------------------------------------------------------------------------
IP=""; USED=""
for r in ${RESOLVER:-1.1.1.1 8.8.8.8}; do
  IP=$(dig +short +time=3 +tries=2 @"$r" "$NAME" A 2>/dev/null | grep -E '^[0-9.]+$' | head -1)
  if [[ -n $IP ]]; then USED=$r; break; fi
done
if [[ -n $IP ]]; then
  pass "public DNS (resolver $USED): $NAME -> $IP"
else
  fail "no A record for $NAME via ${RESOLVER:-1.1.1.1/8.8.8.8}"
fi

if [[ -n $IP ]]; then
  RES=(--resolve "$NAME:443:$IP")
  # 2. TLS ------------------------------------------------------------------------------------
  CERT=$(echo | openssl s_client -connect "$IP:443" -servername "$NAME" 2>/dev/null | openssl x509 -noout -subject -issuer -enddate 2>/dev/null | tr '\n' ' ' | sed 's/  */ /g')
  if curl -sS -o /dev/null --max-time 15 "${RES[@]}" "$URL/healthz"; then pass "TLS certificate valid for $NAME ($CERT)"
  else fail "TLS/HTTPS failed for $NAME via $IP"; fi
  # 3. /healthz -------------------------------------------------------------------------------
  # v2.3 HOST-07: publicly only {"ok":true}; the exact version is checked on the host's loopback
  # /internal/version (this script runs on hshi-u1), which must 404 through the tunnel.
  HDR=$(mktemp); H=$(curl -sS --max-time 15 -D "$HDR" "${RES[@]}" "$URL/healthz" 2>&1)
  if python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get("ok") and "version" not in d and "env" not in d else 1)' "$H" 2>/dev/null; then
    pass "/healthz: $H"
  else fail "/healthz: ${H:0:200} (expected {\"ok\":true} without env/version)"; fi
  IV=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${RES[@]}" "$URL/internal/version" 2>/dev/null)
  [[ $IV == 404 ]] && pass "/internal/version not reachable publicly (404)" || fail "/internal/version via the tunnel -> $IV (expected 404)"
  if [[ -n $EXPECT_VERSION ]]; then
    LV=$(ssh -o BatchMode=yes "$SSH_HOST" "curl -fsS --max-time 5 http://127.0.0.1:${CT_PROD_PORT:-3000}/internal/version" 2>/dev/null)
    if python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get("env")=="production" and d.get("version")==sys.argv[2] else 1)' "$LV" "$EXPECT_VERSION" 2>/dev/null; then
      pass "local /internal/version: $LV"
    else fail "local /internal/version: ${LV:-no answer via ssh $SSH_HOST} (expected env=production, version $EXPECT_VERSION)"; fi
  fi
  CDN=$(tr -d '\r' <"$HDR" | grep -iE '^(server|cf-ray):' | tr '\n' ' ')
  info "edge headers: ${CDN:-none}"
  rm -f "$HDR"
  # 4. SPA + security headers --------------------------------------------------------------
  HDR=$(mktemp); BODY=$(curl -sS --max-time 15 -D "$HDR" "${RES[@]}" "$URL/" 2>/dev/null)
  if grep -q '<div id="app"' <<<"$BODY"; then pass "SPA shell served at /"; else fail "SPA shell not served at /"; fi
  H2=$(tr -d '\r' <"$HDR")
  grep -qi '^x-content-type-options: nosniff' <<<"$H2" && pass "X-Content-Type-Options survives the proxy" || fail "X-Content-Type-Options missing at the edge"
  grep -qi '^x-frame-options: deny' <<<"$H2" && pass "X-Frame-Options survives the proxy" || fail "X-Frame-Options missing at the edge"
  rm -f "$HDR"
  # 5. WSS upgrade --------------------------------------------------------------------------
  KEY=$(openssl rand -base64 16)
  UP=$(curl -sS --http1.1 -i --max-time 8 "${RES[@]}" \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H "Sec-WebSocket-Key: $KEY" \
    "$URL/verifyproc/verifyroom?sessionId=verify" 2>/dev/null | head -1 | tr -d '\r')
  if [[ $UP == *" 101"* ]]; then pass "WSS upgrade on the Colyseus path: $UP"; else fail "WSS upgrade: '${UP:-no response}'"; fi
  # 6a. dev never reachable through the public name -----------------------------------------
  if curl -sS -o /dev/null --max-time 8 --resolve "$NAME:3001:$IP" "https://$NAME:3001/healthz" 2>/dev/null; then
    fail "https://$NAME:3001 answered"
  else pass "https://$NAME:3001 not served"; fi
  [[ $H == *development* ]] && fail "public hostname serves the DEV service" || pass "public hostname does not serve dev"
fi

# 6b. host-side checks over SSH (private) -------------------------------------------------------
# Unit scope: CT_SYSTEMD_SCOPE=system|user|auto (auto: system unit if it exists, else --user).
# Live tunnel ingress: from cloudflared's local metrics endpoint (/config), whose address is taken
# from the unit's --metrics flag (or $CT_CLOUDFLARED_METRICS). Fallback: the unit's own --config
# file if readable; otherwise SKIP (never a stale file from elsewhere).
SCOPE="${CT_SYSTEMD_SCOPE:-auto}"
HOSTCHK=$(ssh -o BatchMode=yes "$SSH_HOST" "SCOPE=$SCOPE METRICS=${CT_CLOUDFLARED_METRICS:-} bash -s" <<'REMOTE' 2>/dev/null
sc() { local u=$1; shift
  if [ "$SCOPE" = system ] || { [ "$SCOPE" = auto ] && systemctl cat "$u" >/dev/null 2>&1; }; then systemctl "$@" "$u"; else systemctl --user "$@" "$u"; fi; }
scope_of() { if [ "$SCOPE" != auto ]; then echo "$SCOPE"; elif systemctl cat "$1" >/dev/null 2>&1; then echo system; else echo user; fi; }
echo "TUNNEL_SCOPE=$(scope_of clocktower-tunnel)"
echo "TUNNEL_ACTIVE=$(sc clocktower-tunnel is-active 2>/dev/null)"
UNIT=$(sc clocktower-tunnel cat 2>/dev/null)
CFG=$(grep -oE -- '--config[= ][^ ]+' <<<"$UNIT" | head -1 | sed -E 's/--config[= ]//; s#%h#'"$HOME"'#')
M=${METRICS:-$(grep -oE -- '--metrics[= ][^ ]+' <<<"$UNIT" | head -1 | sed -E 's/--metrics[= ]//')}
if [ -n "$M" ] && J=$(curl -fsS --max-time 3 "http://$M/config" 2>/dev/null); then
  echo "SRC=live cloudflared /config at $M"
  python3 -c 'import json,sys
for r in json.loads(sys.argv[1])["config"]["ingress"]: print("ING=%s -> %s" % (r.get("hostname") or "*", r.get("service")))' "$J"
elif [ -n "$CFG" ] && [ -r "$CFG" ]; then
  echo "SRC=$CFG"; grep -hE '^\s*-?\s*(hostname|service):' "$CFG" | sed 's/^/ING=/'
elif [ -n "$CFG" ]; then echo "UNREADABLE=$CFG (no metrics endpoint answered)"
fi
REMOTE
)
info "clocktower-tunnel: $(sed -n 's/^TUNNEL_SCOPE=//p' <<<"$HOSTCHK") unit, $(sed -n 's/^TUNNEL_ACTIVE=//p' <<<"$HOSTCHK")"
ING=$(sed -n 's/^ING=//p' <<<"$HOSTCHK")
SRC=$(sed -n 's/^SRC=//p' <<<"$HOSTCHK")
if [[ -z $ING ]]; then skip "tunnel ingress not inspectable as $SSH_HOST user ($(sed -n 's/^UNREADABLE=//p' <<<"$HOSTCHK"))"
elif grep -qE ':3001\b' <<<"$ING"; then fail "tunnel ingress references :3001 ($SRC): $(tr '\n' ';' <<<"$ING")"
elif ! grep -qE '127\.0\.0\.1:3000|localhost:3000' <<<"$ING"; then fail "tunnel ingress does not route to prod :3000 ($SRC): $(tr '\n' ';' <<<"$ING")"
else pass "tunnel ingress -> prod only, never :3001 ($SRC: $(tr '\n' ';' <<<"$ING" | tr -s ' '))"; fi
FS=$(ssh -o BatchMode=yes "$SSH_HOST" 'tailscale serve status --json 2>/dev/null; tailscale funnel status --json 2>/dev/null' 2>&1)
if grep -qE ':3001\b' <<<"$FS"; then fail "tailscale serve/funnel references :3001"; else pass "tailscale serve/funnel never targets :3001"; fi
for port in 3001 3000; do
  L=$(ssh -o BatchMode=yes "$SSH_HOST" "ss -Hltn 'sport = :$port'" 2>&1)
  if [[ -z $L ]]; then info "nothing listening on :$port"
  elif grep -vqE "127\.0\.0\.1:$port" <<<"$L"; then fail ":$port listens on a non-loopback address: $L"
  else pass ":$port bound to 127.0.0.1 only"; fi
done
TIP=$(ssh -o BatchMode=yes "$SSH_HOST" 'tailscale ip -4' 2>/dev/null | head -1)
if [[ -n $TIP ]]; then
  for port in 3001 3000; do
    if curl -sS -o /dev/null --max-time 5 "http://$TIP:$port/healthz" 2>/dev/null; then fail "reachable directly on tailnet IP $TIP:$port"; else pass "not reachable on tailnet IP $TIP:$port"; fi
  done
fi

# 7. optional Tailscale Funnel -------------------------------------------------------------------
FJ=$(ssh -o BatchMode=yes "$SSH_HOST" 'tailscale funnel status --json 2>/dev/null' 2>/dev/null | tr -d ' \n')
if [[ -z $FJ || $FJ == "{}" ]]; then skip "Tailscale Funnel not configured (optional)"
else
  FH=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(next(iter(d.get("AllowFunnel",{})),"").split(":")[0])' "$FJ" 2>/dev/null)
  if [[ -n $FH ]]; then
    FIP=$(dig +short @1.1.1.1 "$FH" A | grep -E '^[0-9.]+$' | head -1)
    B=$(curl -sS --max-time 10 ${FIP:+--resolve "$FH:443:$FIP"} "https://$FH/healthz" 2>/dev/null)
    [[ $B == *'"ok":true'* ]] && pass "Funnel https://$FH/healthz: $B" || fail "Funnel https://$FH/healthz: ${B:-no answer}"
  else skip "Funnel status present but no AllowFunnel host"; fi
fi

echo "result: $FAILS failed, $SKIPS skipped"
[[ $FAILS -eq 0 ]]
