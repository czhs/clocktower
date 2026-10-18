#!/usr/bin/env bash
# Sync this tree to render-host:~/pixel3d and run a command there.
#   tools/remote.sh node tools/shot.mjs scenes/meadow.html shots/meadow.png
#   tools/remote.sh --no-sync <cmd>
# Nothing executes on the Mac; it only edits and syncs. Syncs shots/*/*.{js,mjs,py,sh} helpers; never pushes
# out/sprites/ (module fix T8: a stale Mac copy overwrote fresh remote bakes). Pull results back with tools/pull.sh.
set -euo pipefail
HOST=${PIXEL3D_HOST:-render-host}
RDIR=${PIXEL3D_RDIR:-pixel3d}
if [[ "$HOST" == "game-host" || "$HOST" == *<tailnet-ip>* ]]; then
  echo "ERROR: pixel3d renders moved to render-host (the user's request: game-host / the 3060 is now the game server). Unset PIXEL3D_HOST or use render-host." >&2; exit 3
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYNC=1
if [[ "${1:-}" == "--no-sync" ]]; then SYNC=0; shift; fi
if [[ $SYNC == 1 ]]; then
  rsync -az --exclude node_modules --exclude .git --exclude 'out/sprites/' --include 'shots/' --include 'shots/*/' --include 'shots/*/*.js' --include 'shots/*/*.mjs' --include 'shots/*/*.py' --include 'shots/*/*.sh' --exclude 'shots/**' "$ROOT/" "$HOST:$RDIR/"
  ssh "$HOST" "cd $RDIR && source ~/clocktower/env.sh >/dev/null 2>&1; if [ ! -d node_modules ] || [ package.json -nt node_modules/.installed ]; then npm install --no-audit --no-fund --silent && touch node_modules/.installed; fi"
fi
ssh "$HOST" "cd $RDIR && source ~/clocktower/env.sh >/dev/null 2>&1; $(printf '%q ' "$@")"
