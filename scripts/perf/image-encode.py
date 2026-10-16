#!/usr/bin/env python3
"""perf-audit: what would the runtime atlases cost in other encodings? (measurement only)
  CT_AGENT=perf-audit scripts/remote.sh python3 scripts/perf/image-encode.py packages/assets/generated/*.png
Prints: dims, GPU bytes (w*h*4), unique colours, alpha usage, PNG (as shipped), PNG re-optimised,
8-bit palette PNG (only lossless when <=256 colours), WebP lossless, WebP q90."""
import io, sys, os
from PIL import Image

def size(img, fmt, **kw):
    b = io.BytesIO(); img.save(b, fmt, **kw); return b.tell()

print(f"{'file':28} {'dims':>10} {'gpuMiB':>7} {'colors':>7} {'png KiB':>8} {'pngOpt':>8} {'pal8':>8} {'webpLL':>8} {'webp90':>8}")
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGBA')
    w, h = im.size
    cols = im.getcolors(maxcolors=1 << 24)
    ncol = len(cols) if cols else -1
    pal = '-'
    if 0 < ncol <= 256:
        q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE) if hasattr(Image, 'Quantize') else im.quantize(256, method=2)
        pal = f"{size(q, 'PNG', optimize=True)/1024:.0f}"
    try:
        ll = f"{size(im, 'WEBP', lossless=True, quality=100, method=6)/1024:.0f}"
        lq = f"{size(im, 'WEBP', quality=90, method=6)/1024:.0f}"
    except Exception as e:
        ll = lq = 'n/a'
    print(f"{os.path.basename(p):28} {f'{w}x{h}':>10} {w*h*4/2**20:7.1f} {ncol:7d} {os.path.getsize(p)/1024:8.0f} {size(im, 'PNG', optimize=True)/1024:8.0f} {pal:>8} {ll:>8} {lq:>8}")
