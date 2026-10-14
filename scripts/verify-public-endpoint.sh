#!/usr/bin/env bash
# Verify the public production endpoint (Tailscale Funnel on hshi-u1) from OUTSIDE the host, over
# public DNS/Internet paths (not the tailnet), and verify the dev service is NOT publicly reachable.
#
#   scripts/verify-public-endpoint.sh [hostname] [--expect-version <sha>]
#   default hostname: hshi-u1.tailf28040.ts.net
#
# Checks
#   1. public DNS (1.1.1.1 / 8.8.8.8) resolves the name (Funnel publishes public A/AAAA records)
#   2. HTTPS with a valid certificate for the name (curl verifies the chain), cert details
#   3. GET /healthz over the public IP -> ok, env=production (+ version if given)
#   4. WebSocket Upgrade on the Colyseus path (/<processId>/<roomId>) -> HTTP 101 through Funnel
#   5. dev is private: public IP :3001 refused/unreachable; Funnel ports 443/8443/10000 never
#      answer with env=development; `tailscale funnel status --json` on hshi-u1 never targets
#      :3001; :3001 listens on 127.0.0.1 only; tailnet IP :3001 refused.
# Exit 0 only if every check passed.
set -uo pipefail
NAME="hshi-u1.tailf28040.ts.net"; EXPECT_VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --expect-version) EXPECT_VERSION="$2"; shift ;;
    -*) echo "unknown flag $1" >&2; exit 2 ;;
    *) NAME="$1" ;;
  esac
  shift
done
SSH_HOST="${CT_HOST:-hshi-u1}"
FAILS=0
pass() { printf '  PASS  %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; FAILS=$((FAILS + 1)); }
info() { printf '  ....  %s\n' "$*"; }

echo "public endpoint verification: https://$NAME"

# 1. Public DNS ---------------------------------------------------------------------------
IP=""
for r in 1.1.1.1 8.8.8.8; do
  IP=$(dig +short @"$r" "$NAME" A 2>/dev/null | grep -E '^[0-9.]+$' | grep -vE '^100\.' | head -1)
  [[ -n $IP ]] && break
done
if [[ -n $IP ]]; then
  pass "public DNS: $NAME -> $IP (resolver $r)"
else
  STATUS=$(dig @1.1.1.1 "$NAME" A 2>/dev/null | grep -oE 'status: [A-Z]+' | head -1)
  fail "public DNS has no A record for $NAME (${STATUS:-no answer}) — Funnel is not active"
fi

if [[ -n $IP ]]; then
  RES=(--resolve "$NAME:443:$IP")
  # 2. Certificate ----------------------------------------------------------------------
  CERT=$(echo | openssl s_client -connect "$IP:443" -servername "$NAME" 2>/dev/null | openssl x509 -noout -subject -issuer -enddate 2>/dev/null)
  if curl -sS -o /dev/null --max-time 15 "${RES[@]}" "https://$NAME/healthz"; then
    pass "TLS certificate valid for $NAME ($(echo "$CERT" | tr '\n' ' ' | sed 's/  */ /g'))"
  else
    fail "TLS/HTTPS failed for $NAME via $IP"
  fi
  # 3. /healthz -----------------------------------------------------------------------------
  H=$(curl -sS --max-time 15 "${RES[@]}" "https://$NAME/healthz" 2>&1)
  if python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get("ok") and d.get("env")=="production" and (not sys.argv[2] or d.get("version")==sys.argv[2]) else 1)' "$H" "$EXPECT_VERSION" 2>/dev/null; then
    pass "/healthz over Funnel: $H"
  else
    fail "/healthz over Funnel: ${H:0:200}"
  fi
  # 4. WSS upgrade --------------------------------------------------------------------------
  KEY=$(openssl rand -base64 16)
  UP=$(curl -sS --http1.1 -i --max-time 6 "${RES[@]}" \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H "Sec-WebSocket-Key: $KEY" \
    "https://$NAME/verifyproc/verifyroom?sessionId=verify" 2>/dev/null | head -1 | tr -d '\r')
  if [[ $UP == *" 101"* ]]; then pass "WSS upgrade through Funnel: $UP"; else fail "WSS upgrade through Funnel: '${UP:-no response}'"; fi
  # 5a. dev port on the public IP ------------------------------------------------------------
  for scheme in https http; do
    if curl -sS -o /dev/null --max-time 6 -k --resolve "$NAME:3001:$IP" "$scheme://$NAME:3001/healthz" 2>/dev/null; then
      fail "$scheme://$NAME:3001 answered publicly"
    else pass "$scheme://$NAME:3001 not reachable publicly"; fi
  done
  for p in 8443 10000; do
    B=$(curl -sS --max-time 6 --resolve "$NAME:$p:$IP" "https://$NAME:$p/healthz" 2>/dev/null)
    if [[ $B == *development* ]]; then fail "Funnel port $p serves the DEV service"; else pass "Funnel port $p does not serve dev (${B:0:60})"; fi
  done
fi

# 5b. host-side checks over SSH (private) ---------------------------------------------------
FS=$(ssh -o BatchMode=yes "$SSH_HOST" 'tailscale funnel status --json' 2>&1)
if [[ $FS == *3001* ]]; then fail "tailscale serve/funnel config references :3001 -> $FS"; else pass "funnel/serve config never targets :3001 ($(tr -d '\n ' <<<"$FS" | head -c 160))"; fi
L=$(ssh -o BatchMode=yes "$SSH_HOST" "ss -Hltn 'sport = :3001'" 2>&1)
if [[ -z $L ]]; then info "nothing listening on :3001 (dev service down?)"
elif grep -vqE '127\.0\.0\.1:3001' <<<"$L"; then fail ":3001 listens on a non-loopback address: $L"
else pass ":3001 bound to 127.0.0.1 only"; fi
TIP=$(ssh -o BatchMode=yes "$SSH_HOST" 'tailscale ip -4' 2>/dev/null | head -1)
if [[ -n $TIP ]]; then
  if curl -sS -o /dev/null --max-time 5 "http://$TIP:3001/healthz" 2>/dev/null; then fail "dev reachable on tailnet IP $TIP:3001"; else pass "dev not reachable on tailnet IP $TIP:3001"; fi
  if curl -sS -o /dev/null --max-time 5 "http://$TIP:3000/healthz" 2>/dev/null; then fail "prod reachable directly on tailnet IP $TIP:3000 (should be loopback only)"; else pass "prod not reachable directly on $TIP:3000 (loopback bind)"; fi
fi

echo "result: $FAILS failed"
[[ $FAILS -eq 0 ]]
