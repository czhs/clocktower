#!/usr/bin/env python3
"""UI density evidence helpers for tools/demo-hd.mjs (owner: ui; runs on render-host, PIL).
   python3 tools/demo-hd.py zoom <in.png> <out.png> x y w h scale      crop (device px) + nearest upscale
   python3 tools/demo-hd.py pair <before.png> <after.png> <out.png> [label-before label-after]
        stack two images (before on top, after below, a 2-px magenta rule between; sizes may differ)"""
import sys
from PIL import Image

cmd = sys.argv[1]
if cmd == 'zoom':
    src, out = sys.argv[2], sys.argv[3]
    x, y, w, h, s = [int(v) for v in sys.argv[4:9]]
    im = Image.open(src).convert('RGBA').crop((x, y, x + w, y + h))
    im.resize((w * s, h * s), Image.NEAREST).save(out)
elif cmd == 'pair':
    a = Image.open(sys.argv[2]).convert('RGBA')
    b = Image.open(sys.argv[3]).convert('RGBA')
    o = Image.new('RGBA', (max(a.width, b.width), a.height + b.height + 6), (255, 0, 255, 255))
    o.paste(a, (0, 0)); o.paste(b, (0, a.height + 6))
    o.save(sys.argv[4]); print('wrote', sys.argv[4], o.size)
else:
    sys.exit('usage: demo-hd.py zoom|pair ...')
