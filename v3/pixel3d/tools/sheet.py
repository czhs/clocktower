#!/usr/bin/env python3
"""Contact sheet / GIF helper (runs on render-host via tools/remote.sh; needs PIL).
  python3 tools/sheet.py sheet out.png a.png b.png ... [--cols 2] [--scale 0.5]
  python3 tools/sheet.py gif out.gif frame-*.png [--fps 30] [--scale 0.5]
  python3 tools/sheet.py diff out.png a.png b.png      # highlights changed pixels (crawl check), prints % changed
"""
import sys, glob
from PIL import Image, ImageDraw, ImageChops

def opt(name, default):
    if name in sys.argv:
        i = sys.argv.index(name); v = sys.argv[i + 1]; del sys.argv[i:i + 2]; return type(default)(v)
    return default

mode, out = sys.argv[1], sys.argv[2]
cols, scale, fps = opt('--cols', 2), opt('--scale', 0.5), opt('--fps', 30)
files = [f for a in sys.argv[3:] for f in sorted(glob.glob(a))]
ims = [Image.open(f).convert('RGB') for f in files]
if scale != 1:
    ims = [im.resize((int(im.width * scale), int(im.height * scale)), Image.NEAREST) for im in ims]
if mode == 'sheet':
    w, h = max(i.width for i in ims), max(i.height for i in ims)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (w * cols, (h + 14) * rows), (20, 20, 24))
    d = ImageDraw.Draw(sheet)
    for k, (im, f) in enumerate(zip(ims, files)):
        x, y = (k % cols) * w, (k // cols) * (h + 14)
        sheet.paste(im, (x, y + 14)); d.text((x + 4, y + 1), f.split('/')[-1], fill=(220, 220, 200))
    sheet.save(out)
elif mode == 'gif':
    ims[0].save(out, save_all=True, append_images=ims[1:], duration=int(1000 / fps), loop=0, optimize=False)
elif mode == 'diff':
    a, b = ims[0], ims[1]
    d = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 8 else 0)
    changed = sum(1 for v in d.getdata() if v) / (d.width * d.height)
    vis = Image.composite(Image.new('RGB', a.size, (255, 0, 255)), a.convert('L').convert('RGB'), d)
    vis.save(out); print(f'changed {changed * 100:.2f}% of pixels')
print('wrote', out)
