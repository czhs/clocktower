#!/usr/bin/env bash
# Pull a render-host directory back to this tree (module fix T8: remote.sh only pushes).
#   tools/pull.sh shots/char-<name>/x           # copies render-host:<RDIR>/shots/char-<name>/x/ → ./shots/char-<name>/x/
#   tools/pull.sh out/sprites                   # only shots/ or out/ paths
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST=${PIXEL3D_HOST:-render-host}
RDIR=${PIXEL3D_RDIR:-pixel3d}
[[ $# -ge 1 ]] || { sed -n '2,4p' "$0"; exit 2; }
REL=${1#./}; REL=${REL%/}
case "$REL" in shots/?*|out/?*) ;; *) echo "pull.sh: only shots/<dir> or out/<dir>" >&2; exit 2 ;; esac
[[ "$REL" == *..* ]] && { echo "pull.sh: refusing '..'" >&2; exit 2; }
mkdir -p "$ROOT/$REL"
rsync -az "$HOST:$RDIR/$REL/" "$ROOT/$REL/"
echo "pulled $HOST:$RDIR/$REL/ → $REL/"
