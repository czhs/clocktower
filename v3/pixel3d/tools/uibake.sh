#!/usr/bin/env bash
# Bake one UI group's atlas on the render host and copy it back (owner: UI lead; docs/UI.md §3.4).
#   tools/uibake.sh <group>|<group>:<name> [--q "tod=night"] [--strict]
# Result (Mac): out/ui/<group>.png + out/ui/<group>.json (the drop-in atlas) and shots/ui-<group>/bake/<group>-sheet.png
# (labelled x4 preview: LOOK at it with the Read tool). The host writes only into shots/ui-<group>/bake/ (never out/,
# so a parallel sync from another agent can never overwrite a fresh bake); the Mac copy in out/ui/ is the source of truth.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
G=${1:?usage: tools/uibake.sh <group> [--q ...] [--strict]}; shift
HOST=${PIXEL3D_HOST:-render-host}
RDIR=${PIXEL3D_RDIR:-pixel3d}
G0=${G%%:*}; N=${G#*:}          # '<group>:<name>' = second atlas (src/ui/<group>/<name>.bake.js -> out/ui/<name>.*)
"$ROOT/tools/remote.sh" node tools/uibake.mjs "$G" --out "shots/ui-$G0/bake" "$@"
mkdir -p "$ROOT/out/ui" "$ROOT/shots/ui-$G0/bake"
rsync -az "$HOST:$RDIR/shots/ui-$G0/bake/$N.png" "$HOST:$RDIR/shots/ui-$G0/bake/$N.json" "$ROOT/out/ui/"
rsync -az "$HOST:$RDIR/shots/ui-$G0/bake/$N-sheet.png" "$ROOT/shots/ui-$G0/bake/"
echo "out/ui/$N.png out/ui/$N.json shots/ui-$G0/bake/$N-sheet.png"
