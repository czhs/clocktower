#!/usr/bin/env python3
# List the crawl-diff hot spots (owner: town foundation lead): townhot.py <crawl-dir> -> clusters of magenta (> thr) px
import sys
import numpy as np
from PIL import Image
d = np.asarray(Image.open(sys.argv[1] + '/crawl-diff.png').convert('RGB')).astype(int)
m = (d[..., 0] > 200) & (d[..., 1] < 80) & (d[..., 2] > 200)
ys, xs = np.nonzero(m)
pts = sorted(zip(xs.tolist(), ys.tolist()))
cl = []
for x, y in pts:
    for c in cl:
        if abs(c[0] - x) < 24 and abs(c[1] - y) < 24: c[2] += 1; break
    else: cl.append([x, y, 1])
print(len(pts), 'magenta px;', ' '.join(f'({x},{y})x{n}' for x, y, n in cl[:30]))
