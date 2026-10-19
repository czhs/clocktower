#!/usr/bin/env python3
"""Fire look-dev strips (owner: fire). Runs ON THE RENDER HOST (tools/remote.sh python3 src/ambient/fire/firestrip.py ...).

  firestrip.py <frames_dir> <out_dir> <tod> name:x,y,w,h:t0:t1[:step] ...

frames_dir holds f-000.png ... rendered at t = (i + 0.5) / 30 (shot.mjs --times). For each job: strip-<name>-<tod>.png
(crop x3, every <step>-th 30 Hz frame from t0 to t1, max 24 tiles, '*' = changed vs previous tile) and
<name>-<tod>.gif (crop x3, 1x real time, 30 fps).
"""
import sys, os, glob
import numpy as np
from PIL import Image, ImageDraw

fdir, out, tod = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
files = sorted(glob.glob(os.path.join(fdir, 'f-*.png')), key=lambda f: int(os.path.basename(f)[2:-4]))
FT0 = float(os.environ.get('FT0', '0'))   # time of the first frame (frames are 1/30 s apart)
for job in sys.argv[4:]:
    parts = job.split(':')
    name, box, t0, t1 = parts[0], list(map(int, parts[1].split(','))), float(parts[2]), float(parts[3])
    step = int(parts[4]) if len(parts) > 4 else 2
    x, y, w, h = box
    i0, i1 = max(0, round((t0 - FT0) * 30)), min(len(files) - 1, round((t1 - FT0) * 30))
    crops = [Image.open(files[i]).convert('RGB').crop((x, y, x + w, y + h)) for i in range(i0, i1 + 1)]
    k = 3
    big = [c.resize((w * k, h * k), Image.NEAREST) for c in crops]
    big[0].save(os.path.join(out, f'{name}-{tod}.gif'), save_all=True, append_images=big[1:],
                duration=[30 if j % 3 else 40 for j in range(len(big))], loop=0, disposal=1)
    sel = list(range(0, len(crops), step))[:24]
    cols = 6
    rows = (len(sel) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (w * k + 4), rows * (h * k + 16)), (30, 32, 38))
    d = ImageDraw.Draw(sheet)
    prev = None
    for n, j in enumerate(sel):
        X, Y = (n % cols) * (w * k + 4), (n // cols) * (h * k + 16)
        sheet.paste(big[j], (X, Y))
        a = np.asarray(crops[j])
        ch = '*' if prev is not None and np.any(a != prev) else ' '
        prev = a
        d.text((X + 4, Y + h * k + 2), f't={FT0 + (i0 + j) / 30:.3f}{ch}', fill=(220, 220, 220))
    sheet.save(os.path.join(out, f'strip-{name}-{tod}.png'))
    print('wrote', name, len(crops), 'frames')
