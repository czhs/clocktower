#!/usr/bin/env python3
"""Town piece pack (owner: town foundation lead). Runs ON the render host (tools/townpiece.sh syncs, runs it, pulls back).

  python3 tools/townpiece.py <piece> <outdir> [--yaws 0,45,90,180] [--focus <id>|x,z] [--vh N] [--ctx-vh N]
                            [--q 'k=v&k2=v'] [--t 2] [--tods noon,night] [--only iso|ctx]

Renders (in parallel, headless, each a fresh page load):
  iso-y000.png ...   scenes/town-piece.js: the piece alone on a neutral pad, noon, one per yaw (turntable)
  ctx-noon.png       scenes/town.js gameplay camera focused on the piece, whole town, strict=<piece>
  ctx-night.png      same at night (the camera-aware cut-away protects the focused piece: neighbours in front are cut)
  foliage (no --focus): ctx at 4 foci (north rim 22,6 / south rim 22,32 / oak 2,31 / oak2 + stump 41,31: ctx-<tod>-<k>.png)
                     and turntables framed on the west oak (focus 4,30, vh 14)
  clocktower: + ctx-tall-noon.png (vh 16, the whole tower from plinth to vane)
  houses / clocktower turntables auto-fit their bounding box (scenes/town-piece.js ?fit, unless --vh / --focus)
  crop-1x.png        the centre 320x180 texels of ctx-noon at 1 px per texel (true pixel size)
  crop-x3.png        the same crop scaled x3 (nearest) for inspection
  sheet.png          contact sheet of all of the above
  report.txt         per render: status, errors/warnings, colour-pass draw calls, the piece's [calls, tris, buildMs,
                     status] and frame stats.
Exit code 1 if any render had page/shader errors or failed (a render with errors is a failed render).
"""
import argparse, json, os, subprocess, sys
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('piece'); ap.add_argument('out')
ap.add_argument('--yaws', default='0,45,90,180')
ap.add_argument('--focus', default=None)
ap.add_argument('--vh', default=None)
ap.add_argument('--ctx-vh', default=None)
ap.add_argument('--q', default='')
ap.add_argument('--t', default='2')
ap.add_argument('--tods', default='noon,night')
ap.add_argument('--only', default=None)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
extra = ('&' + a.q) if a.q else ''
focus = a.focus or a.piece

jobs = []
FOLIAGE_FOCI = ['22,6', '22,32', '2,31', '41,31']
iso_focus, iso_vh = a.focus, a.vh
if a.piece == 'foliage' and not a.focus: iso_focus, iso_vh = iso_focus or '4,30', iso_vh or '14'
if a.only in (None, 'iso'):
    for y in [int(v) for v in a.yaws.split(',') if v.strip()]:
        q = f'piece={a.piece}&yaw={y}&tod=noon' + (f'&vh={iso_vh}' if iso_vh else '') + (f'&focus={iso_focus}' if iso_focus else '') + extra
        jobs.append((f'iso-y{y % 360:03d}', 'town-piece', q))
if a.only in (None, 'ctx'):
    foci = FOLIAGE_FOCI if (a.piece == 'foliage' and not a.focus) else [focus]
    for tod in a.tods.split(','):
        for k, fo in enumerate(foci):
            q = f'cam=gameplay&focus={fo}&tod={tod}&strict={a.piece}' + (f'&vh={a.ctx_vh}' if a.ctx_vh else '') + extra
            jobs.append((f'ctx-{tod}' + (f'-{k}' if len(foci) > 1 else ''), 'town', q))
    if a.piece == 'clocktower':
        jobs.append(('ctx-tall-noon', 'town', f'cam=gameplay&focus={focus}&tod=noon&vh=16&strict={a.piece}' + extra))

procs = []
for name, scene, q in jobs:
    path = os.path.join(a.out, name + '.png')
    p = subprocess.Popen(['node', 'tools/shot.mjs', scene, path, '--q', q, '--t', a.t], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    procs.append((name, scene, q, path, p))

failed = False
lines = [f'town piece pack: {a.piece} -> {a.out}', '']
for name, scene, q, path, p in procs:
    out, _ = p.communicate()
    bad = p.returncode != 0 or 'PAGE ERRORS' in out or 'CAPTURE FAILED' in out
    failed |= bad
    lines.append(f'[{"FAIL" if bad else "ok"}] {name}  ({scene}?{q})')
    for ln in out.splitlines():
        if ln.startswith('info:'):
            try:
                info = json.loads(ln[5:])
                st = info.get('stats', {})
                pc = st.get('pieces', {}).get(a.piece)
                lines.append(f'      colour calls {info["stages"].get("color")}  frame calls {info["calls"]}  tris {info["tris"]}  programs {info["programs"]}'
                             f'  piece[calls, tris, buildMs, status] {pc}  townBuildMs {st.get("townBuildMs")}  lights {st.get("townLights", 0)}')
            except Exception as e:  # noqa
                lines.append('      (info unparsable) ' + ln[:200])
        elif ('error' in ln.lower() or 'warning' in ln.lower() or 'FAILED' in ln or ln.startswith('PAGE')) and not ln.startswith('wrote'):
            lines.append('      ' + ln[:600])
        elif ln.startswith('  ') or ln.startswith('\t'):
            lines.append('      ' + ln[:600])

outs = [os.path.join(a.out, n + '.png') for n, *_ in jobs if os.path.exists(os.path.join(a.out, n + '.png'))]
ctx = os.path.join(a.out, 'ctx-noon.png') if os.path.exists(os.path.join(a.out, 'ctx-noon.png')) else os.path.join(a.out, 'ctx-noon-0.png')
if os.path.exists(ctx):
    im = Image.open(ctx).convert('RGB')
    s = max(1, round(im.height / 360))
    low = im.resize((im.width // s, im.height // s), Image.NEAREST)
    cx, cy = low.width // 2, low.height // 2
    crop = low.crop((cx - 160, cy - 90, cx + 160, cy + 90))
    crop.save(os.path.join(a.out, 'crop-1x.png'))
    crop.resize((960, 540), Image.NEAREST).save(os.path.join(a.out, 'crop-x3.png'))
    outs.append(os.path.join(a.out, 'crop-x3.png'))
if outs:
    ims = [Image.open(f).convert('RGB') for f in outs]
    ims = [i.resize((i.width // 2, i.height // 2), Image.NEAREST) for i in ims]
    cols = 3
    w, h = max(i.width for i in ims), max(i.height for i in ims)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (w * cols, (h + 14) * rows), (20, 20, 24))
    d = ImageDraw.Draw(sheet)
    for k, (im, f) in enumerate(zip(ims, outs)):
        x, y = (k % cols) * w, (k // cols) * (h + 14)
        sheet.paste(im, (x, y + 14)); d.text((x + 4, y + 1), f'{a.piece} / {os.path.basename(f)}', fill=(220, 220, 200))
    sheet.save(os.path.join(a.out, 'sheet.png'))
    lines.append(''); lines.append('wrote ' + ', '.join(os.path.basename(f) for f in outs) + ', crop-1x.png, sheet.png')
open(os.path.join(a.out, 'report.txt'), 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
sys.exit(1 if failed else 0)
