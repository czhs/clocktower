#!/usr/bin/env bash
# Run a command from the kit root — on THIS machine by default, or on a remote render host.
#   tools/remote.sh node tools/shot.mjs char-stage shots/x.png --q 'scale=1&char=mannequin' --t 1
#   tools/remote.sh python3 tools/charcheck.py shots/char-<id>
#   tools/remote.sh --no-sync <cmd>            # remote mode: skip the rsync
# Mode: PIXEL3D_HOST unset, empty or "local" → runs locally (just cd to the kit root).
#       PIXEL3D_HOST=<ssh alias>              → rsyncs this tree to <alias>:${PIXEL3D_RDIR:-charkit}/ (without
#       node_modules/, .git/, out/sprites/ and shots/ — except helper scripts shots/*/*.js|*.py), runs `npm install`
#       there when package.json changed, then runs the command there. PIXEL3D_ENV=<remote file> is sourced first
#       (e.g. a file that puts node on PATH). Pull results back with tools/pull.sh <dir>.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST=${PIXEL3D_HOST:-local}
SYNC=1
if [[ "${1:-}" == "--no-sync" ]]; then SYNC=0; shift; fi
[[ $# -ge 1 ]] || { sed -n '2,11p' "$0"; exit 2; }
if [[ -z "$HOST" || "$HOST" == "local" ]]; then
  cd "$ROOT"
  exec "$@"
fi
RDIR=${PIXEL3D_RDIR:-charkit}
PRE=""
[[ -n "${PIXEL3D_ENV:-}" ]] && PRE="source $(printf '%q' "$PIXEL3D_ENV") >/dev/null 2>&1; "
if [[ $SYNC == 1 ]]; then
  rsync -az --exclude node_modules --exclude .git --exclude 'out/sprites/' --include 'shots/' --include 'shots/*/' \
    --include 'shots/*/*.js' --include 'shots/*/*.py' --exclude 'shots/**' "$ROOT/" "$HOST:$RDIR/"
  ssh "$HOST" "mkdir -p $RDIR && cd $RDIR && ${PRE}if [ ! -d node_modules ] || [ package.json -nt node_modules/.installed ]; then npm install --no-audit --no-fund --silent && touch node_modules/.installed; fi"
fi
ssh "$HOST" "cd $RDIR && ${PRE}$(printf '%q ' "$@")"
