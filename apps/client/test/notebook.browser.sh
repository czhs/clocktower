#!/usr/bin/env bash
# Usage (from the repo root on hshi-u1, after pnpm build): bash apps/client/test/notebook.browser.sh
# Throwaway server on 127.0.0.1:3356 (temp DB) + the notebook browser check. Run from the notebook sandbox.
set -u
PORT=3356
DATA=$(mktemp -d /tmp/ct-nb-XXXX)
export NODE_ENV=test APP_ENV=test HOST=127.0.0.1 PORT=$PORT APP_PUBLIC_ORIGIN=http://127.0.0.1:$PORT \
  DATABASE_URL=file:$DATA/nb.db SESSION_SECRET=$(openssl rand -hex 32) PASSPHRASE_PEPPER=$(openssl rand -hex 32) \
  COOKIE_SECURE=false LOBBY_MAX_COUNT=8 LOBBY_IDLE_TIMEOUT_SEC=120 LIVEKIT_ROOM_PREFIX=test LOG_DIR=$DATA/logs CT_VERSION=nb
node --enable-source-maps apps/server/dist/server.js > $DATA/server.out 2>&1 &
SRV=$!
for i in $(seq 1 60); do curl -sf http://127.0.0.1:$PORT/healthz >/dev/null && break; sleep 0.5; done
OUT=${OUT:-$PWD/test-results/notebook} PORT=$PORT node apps/client/test/notebook.browser.mjs
RC=$?
kill $SRV; wait $SRV 2>/dev/null
echo "--- server log lines containing SECRET (must be 0):"; grep -c SECRET $DATA/server.out $DATA/logs/* 2>/dev/null
echo "--- server errors:"; grep -i '"level":"error"' $DATA/server.out | head -5
echo "--- notebooks in DB:"; (cd packages/db && node -e "const D=require('better-sqlite3');const d=new D('$DATA/nb.db');console.log(d.prepare('select match_id, length(data_json) n from notebooks').all())") 2>&1 | head
rm -rf $DATA
exit $RC
