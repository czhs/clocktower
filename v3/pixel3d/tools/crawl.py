#!/usr/bin/env python3
"""Crawl check for the pixel camera (runs on render-host via tools/remote.sh; needs PIL + numpy).

Frames are captures of scenes/_test-camera.js where only the camera moved (world time frozen).
Frame k was rendered with the camera displaced by (dx_k, dy_k) texels along camera right/up.
Static geometry must rasterise identically, i.e. frame k == frame 0 shifted by a whole number of
screen pixels, and that shift must track the true camera motion (round(d*scale) screen pixels).

  python3 tools/crawl.py shots/camera/pan-*.png --dx 0.3 [--dy 0] [--scale 2] [--border 16] [--search 3]
      --dx/--dy: camera displacement per frame in texels (frame k -> k*dx), or a comma list per frame
  Prints, per frame: expected screen shift, best-matching shift, differing pixels at the expected shift
  and at the best shift. PASS = every frame has 0 differing pixels at its expected shift.
  --lowres: frames are scale-1 captures (texel == pixel).
  --out diff.png: writes a contact strip of |frame_k - shifted frame_0| (magenta = differs).
  --gif out.gif [--crop x,y,w,h] [--zoom 3] [--fps 12]: zoomed (nearest) animation of the frames.
"""
import sys, glob, math
import numpy as np
from PIL import Image


def opt(name, default):
    if name in sys.argv:
        i = sys.argv.index(name); v = sys.argv[i + 1]; del sys.argv[i:i + 2]; return v
    return default


def per_frame(spec, n):
    if ',' in spec:
        v = [float(x) for x in spec.split(',')]
        assert len(v) == n, f'{len(v)} values for {n} frames'
        return v
    return [k * float(spec) for k in range(n)]


dx_s, dy_s = opt('--dx', '0'), opt('--dy', '0')
scale = float(opt('--scale', '2'))
border = int(opt('--border', '16'))
search = int(opt('--search', '3'))
out = opt('--out', None)
thr = int(opt('--thr', '0'))   # per-channel tolerance (0 = bit-exact)
gif = opt('--gif', None)
crop = opt('--crop', None)
zoom = int(opt('--zoom', '3'))
fps = float(opt('--fps', '12'))
files = [f for a in sys.argv[1:] for f in sorted(glob.glob(a))]
files = [f for f in files if not any(w in f.split('/')[-1] for w in ('diff', 'crop', 'sheet'))]
if len(files) < 2:
    print('need >= 2 frames'); sys.exit(2)
ims = [np.asarray(Image.open(f).convert('RGB')).astype(np.int16) for f in files]
dxs, dys = per_frame(dx_s, len(ims)), per_frame(dy_s, len(ims))
H, W, _ = ims[0].shape
ref = ims[0]


def diff_at(img, sx, sy):
    """# pixels where img(x, y) != ref(x - sx, y - sy) over the interior (sx,sy = image shift in px, y down)."""
    b = border + max(abs(sx), abs(sy))
    a = img[b:H - b, b:W - b]
    r = ref[b - sy:H - b - sy, b - sx:W - b - sx]
    d = np.abs(a - r).max(axis=2) > thr
    return int(d.sum()), d, b


def rnd(v):
    return int(math.floor(v + 0.5))


fails = 0
rows = []
print(f'{"frame":>5} {"cam dx,dy (tex)":>16} {"expect sx,sy":>12} {"diff@expect":>11} {"best sx,sy":>10} {"diff@best":>9}  file')
for k, img in enumerate(ims):
    # camera moved +dx texels right -> image moves left; camera moved +dy up -> image moves down (+y in PNG)
    ex, ey = -rnd(dxs[k] * scale), rnd(dys[k] * scale)
    n_exp, dmask, b = diff_at(img, ex, ey)
    best = min(((diff_at(img, ex + i, ey + j)[0], ex + i, ey + j) for i in range(-search, search + 1)
                for j in range(-search, search + 1)), key=lambda v: (v[0], abs(v[1] - ex) + abs(v[2] - ey)))
    ok = n_exp == 0
    fails += 0 if ok else 1
    print(f'{k:>5} {dxs[k]:>7.2f},{dys[k]:>7.2f} {ex:>6},{ey:>4} {n_exp:>11} {best[1]:>5},{best[2]:>3} {best[0]:>9}  '
          f'{files[k].split("/")[-1]} {"ok" if ok else "CRAWL"}')
    if out:
        vis = (img.mean(axis=2) * 0.5).astype(np.uint8)
        vis = np.stack([vis] * 3, axis=2)
        sub = vis[b:H - b, b:W - b]
        sub[dmask] = (255, 0, 255)
        rows.append(Image.fromarray(vis))
interior = (H - 2 * border) * (W - 2 * border)
print(f'{len(ims)} frames, interior ~{interior} px each: {"PASS" if fails == 0 else f"FAIL ({fails} frames crawl)"}')
if out and rows:
    sw = max(r.width for r in rows) // 2
    strip = Image.new('RGB', (sw * min(len(rows), 3), (rows[0].height // 2) * math.ceil(len(rows) / 3)))
    for k, r in enumerate(rows):
        strip.paste(r.resize((r.width // 2, r.height // 2), Image.NEAREST), ((k % 3) * sw, (k // 3) * (r.height // 2)))
    strip.save(out); print('wrote', out)
if gif:
    fr = [Image.open(f).convert('RGB') for f in files]
    if crop:
        x, y, w, h = [int(v) for v in crop.split(',')]
        fr = [im.crop((x, y, x + w, y + h)) for im in fr]
    fr = [im.resize((im.width * zoom, im.height * zoom), Image.NEAREST) for im in fr]
    fr[0].save(gif, save_all=True, append_images=fr[1:], duration=int(1000 / fps), loop=0, optimize=False)
    print('wrote', gif)
sys.exit(0 if fails == 0 else 1)
