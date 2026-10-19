#!/usr/bin/env bash
# Render one scene still (or several frames) to PNG.
#   tools/shot.sh char-stage shots/char-<id>/x.png --size 640x360 --q 'scale=1&char=<id>&clip=vote&frame=7&dir=1&bg=key' --t 1
#   tools/shot.sh char-stage shots/char-<id>/g8.png --size 640x360 --q 'scale=1&char=<id>&grid=turnaround&clip=talk&frame=0&fx=0&bg=plain' --t 1
#   options: [--t 2.5] [--times 0,0.05,0.1] [--size 1280x720] [--q 'k=v&k2=v'] [--gpu-info] [--bench N]
# Local by default; PIXEL3D_HOST=<ssh alias> renders remotely and copies the PNG(s) back. Then LOOK at the PNG.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 2 ]] || { sed -n '2,6p' "$0"; exit 2; }
SCENE=$1; OUT=$2; shift 2
"$ROOT/tools/remote.sh" node tools/shot.mjs "$SCENE" "$OUT" "$@"
HOST=${PIXEL3D_HOST:-local}
if [[ -n "$HOST" && "$HOST" != "local" ]]; then
  DIR=$(dirname "$OUT"); BASE=$(basename "$OUT" .png)
  mkdir -p "$ROOT/$DIR"
  rsync -az --include "$BASE*.png" --exclude '*' "$HOST:${PIXEL3D_RDIR:-charkit}/$DIR/" "$ROOT/$DIR/"
fi
