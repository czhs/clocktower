#!/usr/bin/env bash
# Whole-town render set (owner: town foundation lead). docs/TOWN.md §7.
#   tools/townshots.sh <outdir> [--set integration|square|night|quality] [--jobs 'name:query;name:query'] [--q 'k=v'] [--bench N]
# Syncs the tree to the render host (the one tools/remote.sh uses), renders there (tools/townshots.py), pulls <outdir>/
# back. Then LOOK at the PNGs / sheet.png and read report.txt. Exit 1 = a render had page / shader errors.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 1 ]] || { sed -n '2,6p' "$0"; exit 2; }
OUT=$1; shift
set +e
"$ROOT/tools/remote.sh" python3 tools/townshots.py "$OUT" "$@"
CODE=$?
set -e
mkdir -p "$ROOT/$OUT"
HOST=${PIXEL3D_HOST:-$(grep -m1 '^HOST=' "$ROOT/tools/remote.sh" | sed 's/^HOST=\${PIXEL3D_HOST:-//; s/}$//')}
rsync -az "$HOST:${PIXEL3D_RDIR:-pixel3d}/$OUT/" "$ROOT/$OUT/"
echo "pulled -> $OUT/"
exit $CODE
