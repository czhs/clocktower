#!/usr/bin/env bash
# Serve the Hollowmere demo from render-host on its Tailscale address (owner: deploy; docs/DEMO.md §6).
# Run on the Mac:
#   tools/demo-serve.sh              # sync the tree (tools/remote.sh) + (re)start the server -> prints the URL
#   tools/demo-serve.sh start        # sync + start only if it is not running already
#   tools/demo-serve.sh stop | status | log [N]
#   tools/demo-serve.sh --no-sync restart
# Then open  http://<tailnet-ip>:8090/demo.html  on any machine in the tailnet (WebGL2 browser).
#
# The server is tools/demo-serve.py (python3 http.server + no-store caching) bound ONLY to <tailnet-ip>:8090 (never
# 0.0.0.0), started with nohup from ~/pixel3d; pid file ~/pixel3d/.demo-serve.pid, log ~/pixel3d/.demo-serve.log.
# Idempotent: restart stops only OUR server (pid file + matching command line), then checks the port is free and refuses
# if anything else holds it. It touches no other process on the machine.
# Overrides: DEMO_BIND (default <tailnet-ip>), DEMO_PORT (8090), PIXEL3D_HOST / PIXEL3D_RDIR (as tools/remote.sh).
set -euo pipefail
BIND=${DEMO_BIND:-<tailnet-ip>}
PORT=${DEMO_PORT:-8090}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" != "--here" ]]; then
  # ---------------------------------------------------------------- on the Mac: sync, then run this script remotely
  SYNC=1
  if [[ "${1:-}" == "--no-sync" ]]; then SYNC=0; shift; fi
  CMD=${1:-restart}; shift || true
  case "$CMD" in start|restart|stop|status|log) ;; *) echo "usage: $0 [--no-sync] [start|restart|stop|status|log [N]]" >&2; exit 2;; esac
  if [[ $SYNC == 1 && ( $CMD == start || $CMD == restart ) ]]; then "$ROOT/tools/remote.sh" true; fi
  exec "$ROOT/tools/remote.sh" --no-sync env DEMO_BIND="$BIND" DEMO_PORT="$PORT" bash tools/demo-serve.sh --here "$CMD" "$@"
fi

# ------------------------------------------------------------------ on render-host (cwd = ~/pixel3d, via tools/remote.sh)
shift
CMD=${1:-restart}
cd "$ROOT"
PIDF="$ROOT/.demo-serve.pid"
LOG="$ROOT/.demo-serve.log"
URL="http://$BIND:$PORT/demo.html"
[[ "$BIND" == "0.0.0.0" || "$BIND" == "::" || -z "$BIND" ]] && { echo "refusing to bind '$BIND'" >&2; exit 2; }

ours() {   # prints our server's pid if the pid file points at a live demo-serve.py process
  [[ -f "$PIDF" ]] || return 1
  local pid; pid=$(cat "$PIDF" 2>/dev/null) || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'demo-serve.py' || return 1
  echo "$pid"
}
port_users() { ss -Htlnp "sport = :$PORT" 2>/dev/null || true; }

stop() {
  local pid
  if pid=$(ours); then
    kill "$pid"
    for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    echo "stopped demo server (pid $pid)"
  else
    echo "demo server not running"
  fi
  rm -f "$PIDF"
}

check() {   # HTTP 200 for the page and for three (the import map's target)
  local ok=1
  for p in demo.html node_modules/three/build/three.module.js src/demo/main.js; do
    local code; code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://$BIND:$PORT/$p" || true)
    echo "  $code  /$p"; [[ "$code" == 200 ]] || ok=0
  done
  [[ $ok == 1 ]]
}

start() {
  local pid
  if pid=$(ours); then echo "demo server already running (pid $pid): $URL"; check; return; fi
  if ! ip -4 -o addr show 2>/dev/null | grep -qw "$BIND"; then
    echo "ERROR: $BIND is not an address of $(hostname) (Tailscale down?)" >&2; exit 4
  fi
  if [[ -n "$(port_users)" ]]; then
    echo "ERROR: port $PORT is already in use by something else; not touching it:" >&2; port_users >&2; exit 5
  fi
  [[ -f node_modules/three/build/three.module.js ]] || { echo "ERROR: node_modules/three missing (run tools/remote.sh true once)" >&2; exit 6; }
  if [[ -f "$LOG" && $(stat -c %s "$LOG") -gt 5000000 ]]; then mv -f "$LOG" "$LOG.1"; fi   # keep the log small
  echo "=== $(date '+%F %T') start $URL" >> "$LOG"
  nohup python3 -u tools/demo-serve.py --bind "$BIND" --port "$PORT" --dir "$ROOT" >> "$LOG" 2>&1 < /dev/null &
  echo $! > "$PIDF"
  for _ in $(seq 1 50); do [[ -n "$(port_users)" ]] && break; kill -0 "$(cat "$PIDF")" 2>/dev/null || break; sleep 0.1; done
  if ! pid=$(ours) || [[ -z "$(port_users)" ]]; then echo "ERROR: server did not come up; log tail:" >&2; tail -n 20 "$LOG" >&2; rm -f "$PIDF"; exit 7; fi
  echo "demo server running (pid $pid, log $LOG)"
  check || { echo "WARNING: some paths did not return 200" >&2; }
  echo "open: $URL"
}

case "$CMD" in
  start) start ;;
  restart) stop; start ;;
  stop) stop ;;
  status) if pid=$(ours); then echo "running (pid $pid): $URL"; port_users; check; else echo "not running"; port_users; exit 1; fi ;;
  log) tail -n "${2:-40}" "$LOG" 2>/dev/null || echo "(no log)" ;;
  *) echo "unknown command $CMD" >&2; exit 2 ;;
esac
