#!/usr/bin/env bash
# Character pack (owner: tools): turnaround, contact strips, GIFs, 1x crops, in-scene shots and charcheck numbers.
#   tools/charpack.sh <name> [--clips idle,walk | --preset cast] [--only turnaround|clips|scene] [--dir 1] [--vh 10]
#                     [--runtime auto|character|rig|spike] [--out shots/char-<name>] [--jobs 4] [--q k=v&k2=v] [--raw]
#                     [--game-speed m/s] [--game 0]      (variant spec: <name> + --q 'char=../shots/<dir>/<file>')
# Syncs the tree to render-host, runs tools/charpack.py there (parallel headless page loads of scenes/char-stage.js),
# pulls <out>/ back (raw/ only with --raw). Then LOOK at every PNG/GIF with the Read tool and read report.txt.
# Sprite sheets: tools/charpack.sh --bake <name> [--clips a,b | --preset cast] [--dirs 8] [--game 1] [--ppm 36] [--yaw 0|45] … (tools/bake.py)
# Typical: ~20-40 s for a full pack. Details of every output: header of tools/charpack.py.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 1 ]] || { sed -n '2,11p' "$0"; exit 2; }
if [[ "$1" == "--bake" ]]; then   # sprite bake: tools/charpack.sh --bake <name> [tools/bake.py options]
  shift
  OUTB=out/sprites; for ((i=1; i<=$#; i++)); do [[ "${!i}" == "--out" ]] && { j=$((i+1)); OUTB=${!j}; }; done
  set +e; "$ROOT/tools/remote.sh" python3 tools/bake.py "$@"; CODE=$?; set -e
  mkdir -p "$ROOT/$OUTB"
  rsync -az "${PIXEL3D_HOST:-render-host}:${PIXEL3D_RDIR:-pixel3d}/$OUTB/" "$ROOT/$OUTB/"
  echo "pulled → $OUTB/"; exit $CODE
fi
NAME=$1; shift
OUT="shots/char-$NAME"; RAW=0; ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT=$2; ARGS+=("$1" "$2"); shift 2 ;;
    --raw) RAW=1; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set +e
"$ROOT/tools/remote.sh" python3 tools/charpack.py "$NAME" "${ARGS[@]}"
CODE=$?
set -e
mkdir -p "$ROOT/$OUT"
EXCL=(--exclude 'raw/')
[[ $RAW == 1 ]] && EXCL=()
rsync -az ${EXCL[@]+"${EXCL[@]}"} "${PIXEL3D_HOST:-render-host}:${PIXEL3D_RDIR:-pixel3d}/$OUT/" "$ROOT/$OUT/"
echo "pulled → $OUT/"
exit $CODE
