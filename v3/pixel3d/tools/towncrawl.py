#!/usr/bin/env python3
"""Town crawl check with per-piece attribution (owner: town foundation lead). Runs ON the render host
(tools/towncrawl.sh syncs + pulls).

  python3 tools/towncrawl.py <outdir> [--q 'focus=house-3&tod=noon'] [--pan 3,2] [--thr 2] [--t 2] [--crop x,y,w,h] [--clouds]
                              [--pieces id,id]

Renders scenes/town.js twice at the same t (vignette 0, clouds 0, boxes=1): pan 0,0 and pan dx,dy (whole texels), at
scale 2. Static content must rasterise identically, i.e. c1 == c0 shifted by (-2dx, +2dy) screen px. Reports:
  - frame-wide differing interior pixels at |delta| > thr (per channel, 0..255) and at any delta (thr 0)
  - per piece: differing pixels inside that piece's screen box (engine.stats.screenBoxes, built at pan 0); a pixel in
    several boxes counts for each (pieces overlap on screen)
  - --crop x,y,w,h (1280x720 px of c0): the count inside that rectangle only
Writes c0.png, c1.png, crawl-diff.png (magenta = differs > thr, yellow = differs <= thr), report.txt.
PASS (exit 0) = no differing pixel above thr in the frame (or in the crop / listed pieces when given).
"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--q', default='')
ap.add_argument('--pan', default='3,2')
ap.add_argument('--thr', type=int, default=2)
ap.add_argument('--t', default='2')
ap.add_argument('--crop', default=None)
ap.add_argument('--pieces', default=None)
ap.add_argument('--border', type=int, default=16)
ap.add_argument('--clouds', action='store_true', help='keep cloud shadows on (same t: their texels must not crawl either)')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
px, py = [int(v) for v in a.pan.split(',')]
base = 'vignette=0' + ('' if a.clouds else '&clouds=0') + '&boxes=1' + ('&' + a.q if a.q else '')
procs, infos = [], {}
for name, pan in (('c0', '0,0'), ('c1', f'{px},{py}')):
    path = os.path.join(a.out, name + '.png')
    p = subprocess.Popen(['node', 'tools/shot.mjs', 'town', path, '--q', f'{base}&pan={pan}', '--t', a.t, '--timeout', '120000'],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    procs.append((name, p))
errs = []
for name, p in procs:
    out, _ = p.communicate()
    if p.returncode != 0 or 'PAGE ERRORS' in out: errs.append(name)
    for ln in out.splitlines():
        if ln.startswith('info:'): infos[name] = json.loads(ln[5:])
        elif 'PAGE' in ln or 'pageerror' in ln: print(ln[:300])
c0 = np.asarray(Image.open(os.path.join(a.out, 'c0.png')).convert('RGB')).astype(np.int16)
c1 = np.asarray(Image.open(os.path.join(a.out, 'c1.png')).convert('RGB')).astype(np.int16)
H, W, _ = c0.shape
S = 2
sx, sy = -px * S, py * S                       # camera right -> image left; camera up -> image down
b = a.border + max(abs(sx), abs(sy))
A = c1[b:H - b, b:W - b]
R = c0[b - sy:H - b - sy, b - sx:W - b - sx]
delta = np.abs(A - R).max(axis=2)
mask_hi = np.zeros((H, W), bool); mask_any = np.zeros((H, W), bool)
# mask in c0 coordinates (where the reference pixel is)
mask_hi[b - sy:H - b - sy, b - sx:W - b - sx] = delta > a.thr
mask_any[b - sy:H - b - sy, b - sx:W - b - sx] = delta > 0
lines = [f'town crawl -> {a.out}  q={a.q or "(gameplay square)"}  pan {px},{py} texels  thr {a.thr}/255  scale {S}',
         f'frame: {int(mask_hi.sum())} px > thr, {int(mask_any.sum())} px any delta (max delta {int(delta.max())})']
if errs: lines.append(f'PAGE ERRORS in {errs}')
boxes = infos.get('c0', {}).get('stats', {}).get('screenBoxes', {})
per = []
for pid, (x0, y0, x1, y1) in boxes.items():
    X0, Y0, X1, Y1 = x0 * S, y0 * S, x1 * S, y1 * S
    n_hi = int(mask_hi[Y0:Y1, X0:X1].sum()); n_any = int(mask_any[Y0:Y1, X0:X1].sum())
    per.append((pid, n_hi, n_any, (X0, Y0, X1, Y1)))
per.sort(key=lambda v: (-v[1], -v[2], v[0]))
lines.append('per piece (screen box at pan 0, 1280x720 px): id  >thr  any  box')
for pid, n_hi, n_any, bx in per: lines.append(f'  {pid:<11} {n_hi:>6} {n_any:>6}  {bx}')
fail = int(mask_hi.sum()) > 0
if a.crop:
    x, y, w, h = [int(v) for v in a.crop.split(',')]
    n = int(mask_hi[y:y + h, x:x + w].sum()); lines.append(f'crop {a.crop}: {n} px > thr, {int(mask_any[y:y + h, x:x + w].sum())} any'); fail = n > 0
if a.pieces:
    want = a.pieces.split(','); n = sum(v[1] for v in per if v[0] in want)
    lines.append(f'pieces {a.pieces}: {n} px > thr'); fail = n > 0
lines.append('PASS' if not fail else 'FAIL')
vis = (c0.mean(axis=2) * 0.5).astype(np.uint8)
vis = np.stack([vis] * 3, axis=2)
vis[mask_any & ~mask_hi] = (255, 230, 0)
vis[mask_hi] = (255, 0, 255)
Image.fromarray(vis).save(os.path.join(a.out, 'crawl-diff.png'))
open(os.path.join(a.out, 'report.txt'), 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
sys.exit(1 if fail or errs else 0)
