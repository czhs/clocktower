#!/usr/bin/env python3
"""Whole-town render set (owner: town foundation lead). Runs ON the render host (tools/townshots.sh syncs + pulls).

  python3 tools/townshots.py <outdir> [--set integration|square|night|quality] [--jobs 'name:query;name:query']
                             [--q 'k=v&...'] [--t 2] [--par 4] [--bench 60]

Each job is a fresh page load of scenes/town.js (or another scene) rendered headless in parallel (--par at a time).
Writes <outdir>/<name>.png, sheet.png (contact sheet, half size), report.txt (status, colour / frame calls, tris,
programs, lights, cut, page errors, bench timings). Exit 1 if any render had page / shader errors.

Sets:
  integration  overview noon/golden/night, iso noon/golden, gameplay at the top / left / right / bottom of the square and
               on the dais (noon + night)
  quality      gameplay square noon + night at quality=high and quality=low, each with --bench (default 60 frames)
"""
import argparse, json, os, subprocess, sys
from PIL import Image, ImageDraw

SQ = {'top': '22.5,12.5', 'left': '15.5,19.5', 'right': '29.5,19.5', 'bottom': '22.5,27', 'dais': 'dais'}
SETS = {
    'integration': [
        ('ov-noon', 'cam=overview&tod=noon'), ('ov-golden', 'cam=overview&tod=golden'), ('ov-night', 'cam=overview&tod=night'),
        ('iso-noon', 'cam=iso&tod=noon'), ('iso-golden', 'cam=iso&tod=golden'),
        *[(f'gp-{k}-{tod}', f'focus={v}&tod={tod}') for k, v in SQ.items() for tod in ('noon', 'night')],
    ],
    'square': [(f'gp-{k}-{tod}', f'focus={v}&tod={tod}') for k, v in SQ.items() for tod in ('noon', 'golden', 'night')],
    'night': [(f'night-{k}', f'focus={v}&tod=night') for k, v in SQ.items()],
    'quality': [(f'q-{ql}-{tod}', f'tod={tod}&quality={ql}') for ql in ('high', 'low') for tod in ('noon', 'night')],
}

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--set', default='integration')
ap.add_argument('--jobs', default=None, help='name:query[;name:query...] (scene town; prefix "scene|" for another scene)')
ap.add_argument('--q', default='')
ap.add_argument('--t', default='2')
ap.add_argument('--par', type=int, default=4)
ap.add_argument('--bench', default=None)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
jobs = []
if a.jobs:
    for spec in a.jobs.split(';'):
        name, q = spec.split(':', 1)
        scene = 'town'
        if '|' in q: scene, q = q.split('|', 1)
        jobs.append((name, scene, q))
else:
    jobs = [(n, 'town', q) for n, q in SETS[a.set]]
bench = a.bench or ('60' if a.set == 'quality' else None)
extra = ('&' + a.q) if a.q else ''

results = {}
running = []
queue = list(jobs)


def start(job):
    name, scene, q = job
    path = os.path.join(a.out, name + '.png')
    cmd = ['node', 'tools/shot.mjs', scene, path, '--q', q + extra, '--t', a.t, '--timeout', '120000']
    if bench: cmd += ['--bench', bench]
    return (job, path, subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True))


par = 1 if bench else a.par            # timings: one page at a time on the GPU
while queue or running:
    while queue and len(running) < par: running.append(start(queue.pop(0)))
    job, path, p = running.pop(0)
    out, _ = p.communicate()
    results[job[0]] = (job, path, p.returncode, out)

failed = False
lines = [f'town shots -> {a.out}  (set {a.set if not a.jobs else "custom"}{", bench " + bench if bench else ""})', '']
for name, scene, q in jobs:
    job, path, code, out = results[name]
    bad = code != 0 or 'PAGE ERRORS' in out or 'CAPTURE FAILED' in out
    failed |= bad
    lines.append(f'[{"FAIL" if bad else "ok"}] {name}  ({scene}?{q}{extra})')
    for ln in out.splitlines():
        if ln.startswith('info:'):
            try:
                info = json.loads(ln[5:]); st = info.get('stats', {})
                bad_p = {k: v for k, v in st.get('pieces', {}).items() if v[3] != 'ok'}
                lines.append(f'      colour calls {info["stages"].get("color")}  frame calls {info["calls"]}  tris {info["tris"]}  programs {info["programs"]}'
                             f'  lights {st.get("townLights", 0)}  cut {json.dumps(st.get("cut"))}  quality {st.get("quality")}  townBuildMs {st.get("townBuildMs")}'
                             + (f'  NOT OK {bad_p}' if bad_p else ''))
            except Exception:  # noqa
                lines.append('      (info unparsable)')
        elif ln.startswith('bench:'):
            lines.append('      ' + ln)
        elif ('error' in ln.lower() or 'warning' in ln.lower() or 'FAILED' in ln or ln.startswith('PAGE')) and not ln.startswith('wrote'):
            lines.append('      ' + ln[:500])

outs = [os.path.join(a.out, n + '.png') for n, *_ in jobs if os.path.exists(os.path.join(a.out, n + '.png'))]
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
        sheet.paste(im, (x, y + 14)); d.text((x + 4, y + 1), os.path.basename(f), fill=(220, 220, 200))
    sheet.save(os.path.join(a.out, 'sheet.png'))
    lines.append(''); lines.append(f'wrote {len(outs)} renders + sheet.png')
open(os.path.join(a.out, 'report.txt'), 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
sys.exit(1 if failed else 0)
