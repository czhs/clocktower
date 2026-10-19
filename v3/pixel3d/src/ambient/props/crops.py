#!/usr/bin/env python3
"""Props look-dev helper (owner: props; runs ON THE RENDER HOST via tools/remote.sh).
  python3 src/ambient/props/crops.py crops OUT.png --boxes 'x,y,w,h;...' [--k 3] [--labels a,b] IN1.png [IN2.png ...]
      one row per input image, one enlarged (x k, nearest) tile per box
  python3 src/ambient/props/crops.py strip OUT.png --box x,y,w,h --frames DIR/f-%02d.png --from i0 --n 20 [--cols 10] [--k 3]
                                     [--fps 30] [--title txt]
      consecutive 30 Hz frames of one crop, frame index + '*' when the crop changed vs the previous frame
  python3 src/ambient/props/crops.py gif OUT.gif --box x,y,w,h --frames DIR/f-%02d.png --from i0 --n N [--k 2]
      1x real-time crop GIF (30/40 ms alternating = 30 fps)
"""
import sys
import numpy as np
from PIL import Image, ImageDraw

a = sys.argv[1:]


def opt(name, d=None):
    if name in a:
        i = a.index(name); v = a[i + 1]; del a[i:i + 2]; return v
    return d


mode, out = a[0], a[1]
k = int(opt('--k', '3'))
if mode == 'crops':
    boxes = [tuple(map(int, b.split(','))) for b in opt('--boxes').split(';')]
    labels = (opt('--labels', '') or '').split(',')
    ims = [Image.open(f).convert('RGB') for f in a[2:]]
    tw = sum(b[2] * k + 4 for b in boxes); th = max(b[3] for b in boxes) * k + 16
    sheet = Image.new('RGB', (tw, th * len(ims)), (30, 32, 38)); d = ImageDraw.Draw(sheet)
    for r, im in enumerate(ims):
        x = 0
        for j, (bx, by, bw, bh) in enumerate(boxes):
            sheet.paste(im.crop((bx, by, bx + bw, by + bh)).resize((bw * k, bh * k), Image.NEAREST), (x, r * th))
            lab = (labels[j] if j < len(labels) and labels[j] else '') + f' [{a[2 + r].split("/")[-1]}]'
            d.text((x + 3, r * th + bh * k + 2), lab, fill=(220, 220, 220)); x += bw * k + 4
    sheet.save(out)
elif mode in ('strip', 'gif'):
    bx, by, bw, bh = map(int, opt('--box').split(','))
    pat = opt('--frames'); i0 = int(opt('--from', '0')); n = int(opt('--n', '20'))
    cols = int(opt('--cols', '10')); title = opt('--title', '')
    fr = [np.asarray(Image.open(pat % i).convert('RGB'))[by:by + bh, bx:bx + bw] for i in range(max(0, i0 - 1), i0 + n)]
    prev = fr[0] if i0 > 0 else None
    fr = fr[1:] if i0 > 0 else fr
    if mode == 'gif':
        g = [Image.fromarray(f).resize((bw * k, bh * k), Image.NEAREST).convert('P', palette=Image.ADAPTIVE, colors=255) for f in fr]
        g[0].save(out, save_all=True, append_images=g[1:], duration=[30 if i % 3 else 40 for i in range(len(g))], loop=0, disposal=1)
    else:
        rows = (len(fr) + cols - 1) // cols
        top = 16 if title else 0
        sheet = Image.new('RGB', (cols * (bw * k + 3), top + rows * (bh * k + 14)), (30, 32, 38)); d = ImageDraw.Draw(sheet)
        if title: d.text((4, 2), title, fill=(240, 220, 160))
        for j, f in enumerate(fr):
            x, y = (j % cols) * (bw * k + 3), top + (j // cols) * (bh * k + 14)
            sheet.paste(Image.fromarray(f).resize((bw * k, bh * k), Image.NEAREST), (x, y))
            ch = prev is not None and np.any(f != prev)
            d.text((x + 3, y + bh * k + 1), f'f{i0 + j}{" *" if ch else ""}', fill=(255, 120, 100) if ch else (200, 200, 200))
            prev = f
        sheet.save(out)
elif mode == 'board':
    # rows 'label:i0:n:step;...' of one crop: idle / reaction / recovery side by side, '*' = changed vs previous tile
    bx, by, bw, bh = map(int, opt('--box').split(','))
    pat = opt('--frames'); title = opt('--title', '')
    rows = [r.split(':') for r in opt('--rows').split(';')]
    cols = max(int(r[2]) for r in rows)
    sheet = Image.new('RGB', (90 + cols * (bw * k + 3), 16 + len(rows) * (bh * k + 14)), (30, 32, 38)); d = ImageDraw.Draw(sheet)
    d.text((4, 2), title, fill=(240, 220, 160))
    for ri, (lab, i0, n, step) in enumerate(rows):
        i0, n, step = int(i0), int(n), int(step)
        y = 16 + ri * (bh * k + 14)
        d.text((4, y + 4), lab, fill=(240, 220, 160)); d.text((4, y + 18), f'x{step} fr', fill=(160, 160, 160))
        prev = None
        for j in range(n):
            i = i0 + j * step
            f = np.asarray(Image.open(pat % i).convert('RGB'))[by:by + bh, bx:bx + bw]
            x = 90 + j * (bw * k + 3)
            sheet.paste(Image.fromarray(f).resize((bw * k, bh * k), Image.NEAREST), (x, y))
            ch = prev is not None and np.any(f != prev)
            d.text((x + 2, y + bh * k + 1), f'{i / 30:.2f}s{"*" if ch else ""}', fill=(255, 120, 100) if ch else (200, 200, 200))
            prev = f
    sheet.save(out)
print('wrote', out)
