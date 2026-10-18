#!/usr/bin/env bash
# 1x real-time UI animation capture (owner: UI lead; module fix 2026-10-17, docs/UI.md §2.8 / §3.5).
#   tools/uigif.sh <scene> <out-dir> <t0> <dur> [x,y,w,h] [--q "k=v&..."] [--size 640x360] [--scale 2]
# Captures frames at t0 + k/30 + 0.001 s (k = 0 .. dur*30-1; the epsilon keeps k/30 from rounding down into the
# previous grid frame), then on the render host writes <out-dir>/anim.gif (30 fps, nearest x scale, optional crop in
# capture px) and <out-dir>/strip.png (every frame side by side, numbered), and copies them back. Frames stay in
# <out-dir>/f-NN.png. LOOK at both with the Read tool.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCENE=${1:?usage: tools/uigif.sh <scene> <out-dir> <t0> <dur> [x,y,w,h] [--q ..] [--size WxH] [--scale N]}; OUT=${2:?}; T0=${3:?}; DUR=${4:?}; shift 4
CROP=""; if [[ $# -gt 0 && "$1" != --* ]]; then CROP=$1; shift; fi
Q=""; SIZE=640x360; SCALE=2
while [[ $# -gt 0 ]]; do case "$1" in --q) Q=$2; shift 2;; --size) SIZE=$2; shift 2;; --scale) SCALE=$2; shift 2;; *) echo "uigif.sh: unknown option $1" >&2; exit 2;; esac; done
TIMES=$(awk -v t0="$T0" -v d="$DUR" 'BEGIN { n = int(d * 30 + 0.5); for (k = 0; k < n; k++) printf("%s%.4f", (k ? "," : ""), t0 + k / 30 + 0.001) }')
"$ROOT/tools/remote.sh" node tools/shot.mjs "$SCENE" "$OUT/f.png" --size "$SIZE" --times "$TIMES" ${Q:+--q "$Q"} | grep -v '^wrote' || true
"$ROOT/tools/remote.sh" --no-sync python3 - "$OUT" "$CROP" "$SCALE" <<'PY'
import sys, glob, re
from PIL import Image, ImageDraw
out, crop, s = sys.argv[1], sys.argv[2], int(sys.argv[3])
nat = lambda f: [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', f)]
fs = sorted(glob.glob(f'{out}/f-*.png'), key=nat)
ims = [Image.open(f).convert('RGB') for f in fs]
if crop:
    x, y, w, h = map(int, crop.split(','))
    ims = [i.crop((x, y, x + w, y + h)) for i in ims]
ims = [i.resize((i.width * s, i.height * s), Image.NEAREST) for i in ims]
# 30 fps in GIF centiseconds: 3,3,4 (= 33.3 ms average)
ims[0].save(f'{out}/anim.gif', save_all=True, append_images=ims[1:], duration=[30, 30, 40] * (len(ims) // 3 + 1), loop=0, optimize=False)
cols = min(len(ims), 10); W, H = ims[0].size; rows = (len(ims) + cols - 1) // cols
st = Image.new('RGB', (cols * (W + 2), rows * (H + 12)), (20, 18, 26)); d = ImageDraw.Draw(st)
for k, im in enumerate(ims):
    X, Y = (k % cols) * (W + 2), (k // cols) * (H + 12)
    st.paste(im, (X, Y + 12)); d.text((X + 2, Y), f'f{k}', fill=(230, 220, 190))
st.save(f'{out}/strip.png'); print(f'wrote {out}/anim.gif {out}/strip.png ({len(ims)} frames)')
PY
mkdir -p "$ROOT/$OUT"
rsync -az "${PIXEL3D_HOST:-render-host}:${PIXEL3D_RDIR:-pixel3d}/$OUT/anim.gif" "${PIXEL3D_HOST:-render-host}:${PIXEL3D_RDIR:-pixel3d}/$OUT/strip.png" "$ROOT/$OUT/"
echo "$OUT/anim.gif $OUT/strip.png"
