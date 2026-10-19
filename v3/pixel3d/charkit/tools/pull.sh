#!/usr/bin/env bash
# Remote mode only: copy a render-host directory back into this tree (tools/remote.sh only pushes).
#   PIXEL3D_HOST=<alias> tools/pull.sh shots/char-<id>/x      # <alias>:<RDIR>/shots/char-<id>/x/ → ./shots/char-<id>/x/
#   PIXEL3D_HOST=<alias> tools/pull.sh out/sprites            # only shots/ or out/ paths
# In local mode (PIXEL3D_HOST unset or "local") the files are already here; this is a no-op.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST=${PIXEL3D_HOST:-local}
[[ $# -ge 1 ]] || { sed -n '2,5p' "$0"; exit 2; }
if [[ -z "$HOST" || "$HOST" == "local" ]]; then echo "pull.sh: local mode — nothing to pull ($1 is already here)"; exit 0; fi
RDIR=${PIXEL3D_RDIR:-charkit}
REL=${1#./}; REL=${REL%/}
case "$REL" in shots/?*|out/?*) ;; *) echo "pull.sh: only shots/<dir> or out/<dir>" >&2; exit 2 ;; esac
[[ "$REL" == *..* ]] && { echo "pull.sh: refusing '..'" >&2; exit 2; }
mkdir -p "$ROOT/$REL"
rsync -az "$HOST:$RDIR/$REL/" "$ROOT/$REL/"
echo "pulled $HOST:$RDIR/$REL/ → $REL/"
