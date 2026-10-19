#!/usr/bin/env bash
# Town crawl check with per-piece attribution (owner: town foundation lead). docs/TOWN.md §7.
#   tools/towncrawl.sh <outdir> [--q 'focus=house-3&tod=noon'] [--pan 3,2] [--thr 2] [--crop x,y,w,h] [--pieces id,..]
# Syncs the tree to the render host (the one tools/remote.sh uses), renders there (tools/towncrawl.py), pulls <outdir>/
# back. Then LOOK at the PNGs / sheet.png and read report.txt. Exit 1 = a render had page / shader errors.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 1 ]] || { sed -n '2,6p' "$0"; exit 2; }
OUT=$1; shift
set +e
"$ROOT/tools/remote.sh" python3 tools/towncrawl.py "$OUT" "$@"
CODE=$?
set -e
mkdir -p "$ROOT/$OUT"
HOST=${PIXEL3D_HOST:-$(grep -m1 '^HOST=' "$ROOT/tools/remote.sh" | sed 's/^HOST=\${PIXEL3D_HOST:-//; s/}$//')}
rsync -az "$HOST:${PIXEL3D_RDIR:-pixel3d}/$OUT/" "$ROOT/$OUT/"
echo "pulled -> $OUT/"
exit $CODE
