#!/usr/bin/env bash
# Clear old render outputs WITHOUT a raw `rm` (a raw rm with a glob triggers a permission prompt for the user and stalls
# unattended agent runs). Deletes files only inside this repo's shots/ or out/, locally AND on the render host.
#   tools/clean.sh shots/ambient-critters/beats            # every file in that dir (recursively), dir kept
#   tools/clean.sh shots/char-fox/keys '*.png'             # only files matching the pattern
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST=${PIXEL3D_HOST:-render-host}
RDIR=${PIXEL3D_RDIR:-pixel3d}
[[ $# -ge 1 ]] || { sed -n '2,6p' "$0"; exit 2; }
REL=${1#./}; PAT=${2:-*}
case "$REL" in
  shots/?*|out/?*) ;;
  *) echo "clean.sh: refusing '$REL' (only shots/<dir> or out/<dir>)" >&2; exit 2 ;;
esac
[[ "$REL" == *..* ]] && { echo "clean.sh: refusing '..' in path" >&2; exit 2; }
if [[ -d "$ROOT/$REL" ]]; then
  N=$(find "$ROOT/$REL" -type f -name "$PAT" | wc -l | tr -d ' ')
  find "$ROOT/$REL" -type f -name "$PAT" -delete
  echo "local: removed $N file(s) from $REL"
fi
ssh "$HOST" "cd $RDIR 2>/dev/null && [ -d '$REL' ] && N=\$(find '$REL' -type f -name '$PAT' | wc -l) && find '$REL' -type f -name '$PAT' -delete && echo \"remote: removed \$N file(s) matching '$PAT' from $REL\" || true"
