#!/usr/bin/env bash
# Props per-prop boards + crop GIFs from an ambientpack run (owner: props; runs ON THE RENDER HOST):
#   bash src/ambient/props/boards.sh shots/ambient-props/<run> <tag>
# Reads <run>/raw/play/f-NN.png (the 1x real-time frames, 30 Hz, walker at game speed) and writes
# <run>/board-<prop>.png (rows: idle / reaction (consecutive 30 Hz) / recovery (every 2nd frame)) and
# <run>/gif-<prop>.gif (1x real time crop, x2).
set -euo pipefail
RUN=$1; TAG=${2:-}
F="$RUN/raw/play/f-%02d.png"
# prop   box(x,y,w,h)        idle i0  reaction i0  recovery i0   gif i0  gif n
while read -r name box idle react rec g0 gn; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  python3 src/ambient/props/crops.py board "$RUN/board-$name.png" --k 3 --box "$box" --frames "$F" \
    --title "$name $TAG  (idle / reaction 30 Hz / recovery every 2nd frame)" \
    --rows "idle:$idle:12:2;reaction:$react:12:1;react+:$((react + 12)):12:1;recovery:$rec:12:2" >/dev/null
  python3 src/ambient/props/crops.py gif "$RUN/gif-$name.gif" --k 2 --box "$box" --frames "$F" --from "$g0" --n "$gn" >/dev/null
  echo "board-$name"
done <<'TABLE'
sign      440,160,140,110   6    34   58   20  110
fountain  290,215,130,90    10   60   84   48  90
chimes    250,160,85,85     10   62   88   48  90
lampA     320,135,70,110    250  60   86   48  100
scarecrow 115,150,90,95     10   84   110  68  100
well      185,95,105,110    10   80   106  66  100
gate      30,70,120,75      10   100  160  80  150
lampC     325,0,75,85       120  176  200  164 80
bell      450,70,105,135    250  328  360  312 110
TABLE
