#!/usr/bin/env bash
# Character pack: turnaround, contact strips, GIFs, 1x crops, in-scene shots and the automated checks (report.txt).
#   tools/charpack.sh <id> [--preset profile | --clips idle,walk] [--only turnaround|clips|scene] [--dir 1] [--vh 10]
#                     [--runtime auto|character|rig|spike] [--out shots/char-<id>] [--jobs 4] [--q 'k=v&k2=v'] [--raw]
#                     [--game-speed m/s] [--game 0]       (variant spec: <label> --q 'char=../shots/<dir>/<file>')
#   tools/charpack.sh --bake <id> [--preset profile | --clips a,b] [--dirs 8] [--game 1] [--ppm 36] [--out out/sprites]
# --preset profile = the clip list in game-profile.json (+ the spec's `emote`); --preset cast is an alias.
# Runs tools/charkit_pack.py (applies game-profile.json, then the upstream tools/charpack.py or tools/bake.py)
# LOCALLY by default. PIXEL3D_HOST=<ssh alias> renders on that host instead (see tools/remote.sh) and pulls <out>/
# back (raw/ only with --raw). Then LOOK at every PNG/GIF and read <out>/report.txt. Full pack: ~30-60 s on a GPU.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ $# -ge 1 ]] || { sed -n '2,10p' "$0"; exit 2; }
HOST=${PIXEL3D_HOST:-local}
LOCAL=0; [[ -z "$HOST" || "$HOST" == "local" ]] && LOCAL=1
if [[ "$1" == "--bake" ]]; then
  OUTB=out/sprites; for ((i=1; i<=$#; i++)); do [[ "${!i}" == "--out" ]] && { j=$((i+1)); OUTB=${!j}; }; done
  set +e; "$ROOT/tools/remote.sh" python3 tools/charkit_pack.py "$@"; CODE=$?; set -e
  if [[ $LOCAL == 0 ]]; then
    mkdir -p "$ROOT/$OUTB"; rsync -az "$HOST:${PIXEL3D_RDIR:-charkit}/$OUTB/" "$ROOT/$OUTB/"; echo "pulled → $OUTB/"
  fi
  exit $CODE
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
"$ROOT/tools/remote.sh" python3 tools/charkit_pack.py "$NAME" ${ARGS[@]+"${ARGS[@]}"}
CODE=$?
set -e
if [[ $LOCAL == 0 ]]; then
  mkdir -p "$ROOT/$OUT"
  EXCL=(--exclude 'raw/'); [[ $RAW == 1 ]] && EXCL=()
  rsync -az ${EXCL[@]+"${EXCL[@]}"} "$HOST:${PIXEL3D_RDIR:-charkit}/$OUT/" "$ROOT/$OUT/"
  echo "pulled → $OUT/"
else
  echo "outputs → $OUT/  (look at the PNG/GIFs, read $OUT/report.txt)"
fi
exit $CODE
