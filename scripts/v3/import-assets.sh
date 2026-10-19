#!/usr/bin/env bash
# Copy the maintainer's local pixel3d baked outputs (out/sprites, out/sprites-tools, out/ui) into v3/assets/.
# PIXEL3D_DIR defaults to ../Projects/pixel3d next to this checkout's parent. Refuses private strings.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SRC=${PIXEL3D_DIR:-$HOME/Desktop/Projects/pixel3d}/out
[[ -d $SRC ]] || { echo "no $SRC (set PIXEL3D_DIR)" >&2; exit 1; }
rsync -a --delete --exclude .DS_Store --exclude README.md "$SRC/" "$ROOT/v3/assets/"
if grep -rlE '/Users/[a-z]|/home/[a-z]' "$ROOT/v3/assets"; then echo "import-assets: private paths above" >&2; exit 1; fi
find "$ROOT/v3/assets" -type f -size +5M | grep . && { echo "import-assets: file >5MB" >&2; exit 1; }
echo "imported $(find "$ROOT/v3/assets" -type f | wc -l | tr -d ' ') files"
