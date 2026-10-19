#!/usr/bin/env bash
# Town piece pack (owner: town foundation lead). docs/TOWN.md §7.
#   tools/townpiece.sh <piece> <outdir> [--yaws 0,45,90,180] [--focus <id>|x,z] [--vh N] [--ctx-vh N]
#                      [--q 'k=v&k2=v'] [--t 2] [--tods noon,night] [--only iso|ctx]
# e.g. tools/townpiece.sh house-3 shots/house-3
#      tools/townpiece.sh props shots/props --focus 33,14
# Syncs the tree to the render host (the one tools/remote.sh uses), renders in parallel there (tools/townpiece.py: 4 isolated yaws at noon, the gameplay
# camera focused on the piece at noon and night, a 1x crop), builds sheet.png + report.txt and pulls <outdir>/
# back. Then LOOK at sheet.png / crop-x3.png / the individual PNGs with the Read tool and read report.txt.
# Exit code 1 = a render had page / shader errors (= failed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 2 ]] || { sed -n '2,10p' "$0"; exit 2; }
PIECE=$1; OUT=$2; shift 2
set +e
"$ROOT/tools/remote.sh" python3 tools/townpiece.py "$PIECE" "$OUT" "$@"
CODE=$?
set -e
mkdir -p "$ROOT/$OUT"
# pull from the same host tools/remote.sh renders on (its `HOST=${PIXEL3D_HOST:-...}` default line)
HOST=${PIXEL3D_HOST:-$(grep -m1 '^HOST=' "$ROOT/tools/remote.sh" | sed 's/^HOST=\${PIXEL3D_HOST:-//; s/}$//')}
rsync -az "$HOST:${PIXEL3D_RDIR:-pixel3d}/$OUT/" "$ROOT/$OUT/"
echo "pulled -> $OUT/"
exit $CODE
