#!/usr/bin/env bash
# Private access to the dev service on hshi-u1 (127.0.0.1:3001) through an SSH port forward.
# The dev service is never exposed via Funnel; this tunnel is the only way in.
#
#   scripts/dev.sh            # forward localhost:3001 -> hshi-u1:127.0.0.1:3001 (foreground, Ctrl-C to stop)
#   LOCAL_PORT=4001 scripts/dev.sh
#   scripts/dev.sh --status   # show dev unit status + health (no tunnel)
#   scripts/dev.sh --logs     # follow dev logs (journald)
set -euo pipefail
HOST="${CT_HOST:-hshi-u1}"
LOCAL_PORT="${LOCAL_PORT:-3001}"

case "${1:-}" in
  --status)
    exec ssh -o BatchMode=yes "$HOST" 'systemctl --user status clocktower-dev --no-pager -n 5; echo; curl -fsS http://127.0.0.1:3001/healthz; echo' ;;
  --logs)
    exec ssh -t "$HOST" 'journalctl --user -u clocktower-dev -f -o cat' ;;
  "") ;;
  *) echo "usage: $0 [--status|--logs]" >&2; exit 2 ;;
esac

ssh -o BatchMode=yes "$HOST" 'curl -fsS --max-time 3 http://127.0.0.1:3001/healthz' >/dev/null 2>&1 ||
  echo "warning: dev service on $HOST is not answering /healthz (systemctl --user status clocktower-dev)" >&2

echo "Dev server: http://localhost:${LOCAL_PORT}/   (SSH forward to $HOST 127.0.0.1:3001; Ctrl-C to stop)"
exec ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L "${LOCAL_PORT}:127.0.0.1:3001" "$HOST"
