#!/usr/bin/env bash
# HTTP smoke test against a running Clocktower server (curl + python3 only; no node needed).
#
#   scripts/smoke-test.sh                                       # $CT_PUBLIC_URL or https://clocktower.chrisshi.com
#   scripts/smoke-test.sh http://localhost:3001                 # dev via scripts/dev.sh tunnel
#   ssh hshi-u1 'bash -s http://127.0.0.1:3001' < scripts/smoke-test.sh   # on the host
#   scripts/smoke-test.sh <url> --no-lobby   # skip lobby creation (always use this on prod)
#   scripts/smoke-test.sh <url> --expect-version <sha>
#   scripts/smoke-test.sh <url> --resolver 8.8.8.8   # public DNS server used to pin https hosts
#
# For https URLs whose host is not localhost, the host is resolved through PUBLIC DNS (1.1.1.1 by
# default) and pinned with curl --resolve, so a stale local resolver cache cannot cause false
# failures; the resolver used is printed.
#
# Steps: /healthz, SPA index + deep link, create account (cookie jar), /api/me, create lobby,
# list lobbies, join ticket, sign out (session must be revoked). The passphrase and cookie are
# kept only in a temp dir that is deleted on exit; they are never printed.
# Cleanup limits: there is no account/lobby delete API, so the smoke account (name "smoke-<ts>")
# remains in the DB and the lobby ("smoke-<ts>", never joined) disposes via the server's idle
# timeout. On prod: run at most once per deploy and with --no-lobby.
#
# Exit codes: 0 all passed; 1 a check failed; 3 API not implemented yet (404) — core checks passed.
set -uo pipefail
BASE="${CT_PUBLIC_URL:-https://clocktower.chrisshi.com}"
DO_LOBBY=1; EXPECT_VERSION=""; RESOLVER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-lobby) DO_LOBBY=0 ;;
    --expect-version) EXPECT_VERSION="$2"; shift ;;
    --resolver) RESOLVER="$2"; shift ;;
    -*) echo "unknown arg $1" >&2; exit 2 ;;
    *) BASE="$1" ;;
  esac
  shift
done
BASE="${BASE%/}"
# Pin public https hosts via public DNS (stale local caches have returned NXDOMAIN/AAAA-only).
PIN=()
HOSTPART=$(sed -E 's#^https?://([^/:]+).*#\1#' <<<"$BASE")
if [[ $BASE == https://* && $HOSTPART != localhost && ! $HOSTPART =~ ^[0-9.]+$ ]]; then
  for r in ${RESOLVER:-1.1.1.1 8.8.8.8}; do
    PIP=$(dig +short +time=3 +tries=2 @"$r" "$HOSTPART" A 2>/dev/null | grep -E '^[0-9.]+$' | head -1)
    if [[ -n $PIP ]]; then PIN=(--resolve "$HOSTPART:443:$PIP"); echo "resolved $HOSTPART -> $PIP via public DNS $r"; break; fi
  done
  [[ ${#PIN[@]} -eq 0 ]] && echo "warning: could not resolve $HOSTPART via public DNS; using the system resolver" >&2
fi

TMP=$(mktemp -d "${TMPDIR:-/tmp}/ct-smoke.XXXXXX"); chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
JAR="$TMP/jar"; BODY="$TMP/body"
FAILS=0; PENDING=0; TS=$(date +%s)

pass() { printf '  PASS  %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; FAILS=$((FAILS + 1)); }
pend() { printf '  PEND  %s\n' "$*"; PENDING=$((PENDING + 1)); }
# req METHOD PATH [JSON] -> sets $CODE, body in $BODY
req() {
  local args=(-sS -o "$BODY" -w '%{http_code}' --max-time 15 -b "$JAR" -c "$JAR" -X "$1" ${PIN[@]+"${PIN[@]}"})
  [[ -n ${3:-} ]] && args+=(-H 'Content-Type: application/json' --data "$3")
  CODE=$(curl "${args[@]}" "$BASE$2" 2>"$TMP/err") || CODE=000
}
# jget EXPR -> python expression over `d` (parsed $BODY); prints result or empty
jget() { python3 -c 'import json,sys
try:
  d=json.load(open(sys.argv[1])); v=eval(sys.argv[2]); print("" if v is None else (json.dumps(v) if isinstance(v,(dict,list,bool)) else v))
except Exception: pass' "$BODY" "$1"; }

echo "smoke test: $BASE"
req GET /healthz
if [[ $CODE == 200 && $(jget 'd["ok"]') == true ]]; then
  pass "/healthz env=$(jget 'd["env"]') version=$(jget 'd.get("version")')"
  if [[ -n $EXPECT_VERSION && $(jget 'd.get("version")') != "$EXPECT_VERSION" ]]; then fail "version mismatch (expected $EXPECT_VERSION)"; fi
else fail "/healthz -> $CODE $(head -c 200 "$BODY" 2>/dev/null)"; fi

req GET /
if [[ $CODE == 200 ]] && grep -qi '<div id="app"' "$BODY"; then pass "SPA index served"; else fail "SPA index -> $CODE"; fi
req GET /lobby/smokeTestId
if [[ $CODE == 200 ]] && grep -qi '<div id="app"' "$BODY"; then pass "SPA deep link /lobby/<id>"; else fail "deep link -> $CODE"; fi
HDRS=$(curl -sS -D - -o /dev/null --max-time 10 ${PIN[@]+"${PIN[@]}"} "$BASE/healthz" | tr -d '\r')
grep -qi '^x-content-type-options: nosniff' <<<"$HDRS" && pass "nosniff header" || fail "missing X-Content-Type-Options"
grep -qi '^x-powered-by' <<<"$HDRS" && fail "X-Powered-By leaked" || pass "no X-Powered-By"

req GET /api/lobbies
if [[ $CODE == 401 ]]; then pass "unauthenticated GET /api/lobbies -> 401"
elif [[ $CODE == 404 ]]; then pend "GET /api/lobbies -> 404 (lobby API not implemented yet)"
else fail "unauthenticated GET /api/lobbies -> $CODE (expected 401)"; fi

req POST /api/auth/create "{\"displayName\":\"smoke-$TS\"}"
if [[ $CODE == 404 ]]; then
  pend "POST /api/auth/create -> 404 (account API not implemented yet); skipping account/lobby steps"
elif [[ $CODE == 200 || $CODE == 201 ]]; then
  PP_LEN=$(jget 'len(d["passphrase"])'); ACC=$(jget 'd["account"]["id"]')
  [[ -n $ACC && ${PP_LEN:-0} -ge 20 ]] && pass "create account (passphrase length $PP_LEN, not shown)" || fail "create account body shape"
  grep -q 'ct_session' "$JAR" && pass "session cookie set" || fail "no ct_session* cookie"
  if grep -qiE '^#HttpOnly_' "$JAR"; then pass "cookie HttpOnly"; else fail "cookie not HttpOnly"; fi
  req GET /api/me
  [[ $CODE == 200 && $(jget 'd["id"]') == "$ACC" ]] && pass "/api/me" || fail "/api/me -> $CODE"

  if [[ $DO_LOBBY == 1 ]]; then
    req POST /api/lobbies "{\"name\":\"smoke-$TS\",\"maxPlayers\":5}"
    LOBBY=$(jget 'd["lobby"]["id"]')
    if [[ ($CODE == 200 || $CODE == 201) && -n $LOBBY ]]; then pass "create lobby $LOBBY"
    elif [[ $CODE == 404 ]]; then pend "POST /api/lobbies -> 404 (not implemented yet)"
    else fail "create lobby -> $CODE $(head -c 200 "$BODY")"; fi
    if [[ -n $LOBBY ]]; then
      req GET /api/lobbies
      [[ $CODE == 200 && $(jget "any(l['id']=='$LOBBY' for l in d['lobbies'])") == true ]] && pass "lobby listed" || fail "list lobbies -> $CODE"
      req POST "/api/lobbies/$LOBBY/ticket" '{"intent":"player"}'
      [[ $CODE == 200 && -n $(jget 'd["ticket"]') && $(jget 'd["lobbyId"]') == "$LOBBY" ]] && pass "join ticket issued (not shown)" || fail "ticket -> $CODE"
      SSE=$(curl -sS -N --max-time 3 -b "$JAR" ${PIN[@]+"${PIN[@]}"} "$BASE/api/lobbies/stream" 2>/dev/null | head -c 4000)
      grep -q '"snapshot"' <<<"$SSE" && pass "SSE directory snapshot" || fail "SSE stream gave no snapshot"
    fi
  fi
  req POST /api/auth/signout '{}'
  [[ $CODE == 200 ]] && pass "sign out" || fail "sign out -> $CODE"
  req GET /api/me
  [[ $CODE == 401 ]] && pass "session revoked after sign-out" || fail "/api/me after sign-out -> $CODE"
else
  fail "create account -> $CODE $(head -c 200 "$BODY")"
fi

echo "result: $FAILS failed, $PENDING pending"
[[ $FAILS -gt 0 ]] && exit 1
[[ $PENDING -gt 0 ]] && exit 3
exit 0
