#!/usr/bin/env bash
# Render a scene on render-host and copy PNG(s) back to ./shots/.
#   tools/shot.sh meadow shots/meadow.png [--t 3] [--times 0,0.05,0.1] [--size 1280x720] [--q debug=normals]
# Then view the PNG with the Read tool.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCENE=$1; OUT=$2; shift 2
"$ROOT/tools/remote.sh" node tools/shot.mjs "$SCENE" "$OUT" "$@"
DIR=$(dirname "$OUT"); BASE=$(basename "$OUT" .png)
mkdir -p "$ROOT/$DIR"
rsync -az --include "$BASE*.png" --exclude '*' "${PIXEL3D_HOST:-render-host}:${PIXEL3D_RDIR:-pixel3d}/$DIR/" "$ROOT/$DIR/"
