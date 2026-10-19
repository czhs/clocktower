#!/usr/bin/env python3
"""Ambient pack (owner: ambient-core; docs/AMBIENT.md §Tools). Runs ON THE RENDER HOST via tools/ambientpack.sh.

  python3 tools/ambientpack.py <system>[,<system2>] [--out shots/ambient-<system>] [--dur 18] [--tod noon]
                               [--walker wanderer] [--q 'k=v&k2=v'] [--crop x,y,w,h] [--strip t0] [--scene ambient-stage]

Outputs (in --out):
  play-<tod>.gif        1x REAL-TIME playback at the gameplay camera (640x360, vh 10, scale 1): 30 fps (frame
                        durations alternate 30/40 ms = 33.3 ms average), the scripted walker at game speed
  strip-<tod>.png       20 consecutive 30 Hz frames from --strip t0 (default: 0.2 s before the first reaction),
                        cropped (--crop, default: around the system's first spot) and enlarged x3, frame times
                        under each tile: what the eye sees at real time, drawing by drawing
  holds.png             the cadence check on a still stage (ghost walker, still=1, only this system): red tick =
                        frame changed vs the previous one; must sit on even frames only, never two in a row
  report.txt / ambientcheck.json

Checks (report.txt):
  page_errors       0 page / console errors in every job
  holds             x1 drawings = 0 (a change at frame i AND at i+1 at 30 Hz, system rendered alone, nothing else
                    moving); odd_frame_changes = 0 (all changes on the 15 Hz ambient grid)
  deterministic     t=T rendered alone == t=T at the end of the sequence (0 px)
  reaction_lead     for systems that log flees (stats.flees, firstFlee 'T s@D m/V mps'): lead time
                    (D - 0.6 m contact) / V >= 0.3 s at game speed: the critter visibly reacts before the walker
                    is on it (unreadable reactions at game speed FAIL)
  calls             extra GL calls per frame with the system vs without (<= budget.glCalls x passes); updateMs
"""
import json, os, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw

args = sys.argv[1:]


def opt(name, default=None):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default


OUT = opt('--out')
DUR = float(opt('--dur', '18'))
TOD = opt('--tod', 'noon')
WALKER = opt('--walker', 'wanderer')
EXTRA = opt('--q', '')
CROP = opt('--crop')
STRIP = opt('--strip')
SCENE = opt('--scene', 'ambient-stage')
if not args:
    print(__doc__)
    sys.exit(2)
SYS = args[0]
OUT = OUT or f'shots/ambient-{SYS.split(",")[0].lstrip("_")}'
RAW = os.path.join(OUT, 'raw')
os.makedirs(RAW, exist_ok=True)


def fname(base, i, n):
    return base.replace('.png', f'-{str(i).zfill(2)}.png') if n > 1 else base


def shot(name, q, times, bench=0):
    d = os.path.join(RAW, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d, exist_ok=True)
    qs = '&'.join(f'{k}={v}' for k, v in q.items() if v is not None)
    if EXTRA:
        qs += '&' + EXTRA
    cmd = ['node', 'tools/shot.mjs', SCENE, os.path.join(d, 'f.png'), '--size', '640x360', '--q', qs,
           '--times', ','.join(f'{t:.5f}' for t in times), '--timeout', '180000']
    if bench:
        cmd += ['--bench', str(bench)]
    p = subprocess.run(cmd, capture_output=True, text=True)
    info, errors, benchr = None, [], None
    for ln in (p.stdout + p.stderr).splitlines():
        if ln.startswith('info: '):
            info = json.loads(ln[6:])
        elif ln.startswith('bench: '):
            benchr = json.loads(ln[7:])
        elif ln.startswith(('PAGE ERRORS', 'CAPTURE FAILED')) or '[pageerror]' in ln or ln.startswith('[error]'):
            errors.append(ln[:300])
    files = [fname(os.path.join(d, 'f.png'), i, len(times)) for i in range(len(times))]
    return {'name': name, 'info': info, 'errors': errors, 'code': p.returncode, 'files': files, 'times': times, 'bench': benchr}


def load(f):
    return np.asarray(Image.open(f).convert('RGB'))


base = {'scale': 1, 'systems': SYS, 'tod': TOD, 'strict': '1'}
n30 = int(DUR * 30)
t30 = [(i + 0.5) / 30 for i in range(n30)]
T_DET = round(t30[-1], 5)
jobs = {
    'play': (dict(base, walker=WALKER), t30, 0),
    'holds': (dict(base, walker='ghost', still=1), t30, 0),
    'det': (dict(base, walker='ghost', still=1), [T_DET], 0),
    'none': (dict(base, systems='', walker=WALKER, strict=None), [3.0], 60),
    'bench': (dict(base, walker=WALKER), [3.0], 60),
}
t0 = time.time()
with ThreadPoolExecutor(max_workers=5) as ex:
    res = dict(zip(jobs, ex.map(lambda kv: shot(kv[0], *kv[1]), jobs.items())))
rep, checks = [], {}


def row(name, ok, msg):
    checks[name] = {'ok': ok, 'msg': msg}
    rep.append(f'{"PASS" if ok else "FAIL"}  {name:16s} {msg}')


errs = sum(len(r['errors']) + (r['code'] != 0) for r in res.values())
row('page_errors', errs == 0, f'{errs} ' + ' | '.join(e for r in res.values() for e in r['errors'])[:400])

# ---- holds (cadence) on the still stage
H = [load(f) for f in res['holds']['files']]
diff = [0] + [int(np.any(H[i] != H[i - 1], axis=2).sum()) for i in range(1, len(H))]
changed = [d > 0 for d in diff]
x1 = sum(1 for i in range(1, len(changed) - 1) if changed[i] and changed[i + 1])
odd = sum(1 for i in range(1, len(changed)) if changed[i] and i % 2 == 1)
runs, cur = [], 1
for i in range(1, len(changed)):
    if changed[i]:
        runs.append(cur)
        cur = 1
    else:
        cur += 1
hist = {k: runs.count(k) for k in sorted(set(runs))}
row('holds', x1 == 0 and odd == 0, f'x1 drawings {x1}, odd-frame changes {odd}, hold lengths (30 Hz frames: count) {hist}')
# holds strip image: one column per frame, height = changed px (log), red tick if changed
W = max(1, len(diff))
img = Image.new('RGB', (W * 3 + 20, 80), (30, 32, 38))
dr = ImageDraw.Draw(img)
for i, d in enumerate(diff):
    if d:
        h = int(min(60, 8 * np.log2(1 + d)))
        dr.rectangle([10 + i * 3, 70 - h, 10 + i * 3 + 1, 70], fill=(230, 70, 60) if (i % 2 or (i + 1 < W and diff[i + 1])) else (120, 200, 120))
img.save(os.path.join(OUT, 'holds.png'))

# ---- determinism
A, B = load(res['det']['files'][0]), H[-1]
dpx = int(np.any(A != B, axis=2).sum())
row('deterministic', dpx == 0, f't={T_DET}: alone vs end of sequence {dpx} px')

# ---- reaction lead + stats
info = (res['play']['info'] or {}).get('stats', {})
amb = info.get('ambient', {})
path = info.get('path', {})
leads = []
for name in SYS.split(','):
    s = amb.get(name, {})
    ff = s.get('firstFlee')
    if ff:
        tt, rest = ff.split('s@')
        dd, vv = rest.split('m/')
        dd, vv = float(dd), float(vv.replace('mps', ''))
        lead = (dd - 0.6) / vv if vv > 0.05 else 9
        leads.append(lead)
        row(f'reaction_lead', lead >= 0.3, f'{name}: first flee at t={tt}s, walker {dd} m away at {vv} m/s -> lead {lead:.2f} s (want >= 0.30)')
if not leads:
    rep.append(f'INFO  reaction_lead    no flee logged by {SYS} (not a reacting system, or the walker never came near)')
calls_with = (res['bench']['info'] or {}).get('calls')
calls_without = (res['none']['info'] or {}).get('calls')
bw, bn = res['bench']['bench'] or {}, res['none']['bench'] or {}
rep.append(f'INFO  calls            {calls_with} with vs {calls_without} without -> +{(calls_with or 0) - (calls_without or 0)} GL calls/frame; '
           f'frame ms mean {bw.get("meanMs")} vs {bn.get("meanMs")}')
for name in SYS.split(','):
    s = amb.get(name, {})
    rep.append(f'INFO  stats {name}: ' + json.dumps(s))
rep.append(f'INFO  walker           {json.dumps(info.get("walker"))}  path {json.dumps(path)}')

# ---- GIF (1x real time) + strip
P = [load(f) for f in res['play']['files']]
gif = [Image.fromarray(p).convert('P', palette=Image.ADAPTIVE, colors=255) for p in P]
gif[0].save(os.path.join(OUT, f'play-{TOD}.gif'), save_all=True, append_images=gif[1:],
            duration=[30 if i % 3 else 40 for i in range(len(gif))], loop=0, optimize=False, disposal=1)
first = None
for name in SYS.split(','):
    ff = amb.get(name, {}).get('firstFlee')
    if ff:
        first = float(ff.split('s@')[0])
ts = float(STRIP) if STRIP else max(0.0, (first or 2.0) - 0.2)
i0 = min(len(P) - 20, max(0, int(ts * 30)))
if CROP:
    cx, cy, cw, ch = map(int, CROP.split(','))
else:
    cx, cy, cw, ch = 140, 90, 240, 160
k = 3
tiles = [Image.fromarray(P[i][cy:cy + ch, cx:cx + cw]).resize((cw * k, ch * k), Image.NEAREST) for i in range(i0, i0 + 20)]
cols = 5
sheet = Image.new('RGB', (cols * (cw * k + 4), 4 * (ch * k + 18)), (30, 32, 38))
d2 = ImageDraw.Draw(sheet)
for j, tl in enumerate(tiles):
    x, y = (j % cols) * (cw * k + 4), (j // cols) * (ch * k + 18)
    sheet.paste(tl, (x, y))
    ch_ = '*' if (i0 + j) > 0 and np.any(P[i0 + j] != P[i0 + j - 1]) else ' '
    d2.text((x + 4, y + ch * k + 3), f'f{i0 + j} t={t30[i0 + j]:.3f}{ch_}', fill=(220, 220, 220))
sheet.save(os.path.join(OUT, f'strip-{TOD}.png'))
# 1x full frames at a few moments for the record
for tt in [0.5, (first or 2) + 0.15, (first or 2) + 0.6, DUR * 0.6]:
    i = min(len(P) - 1, int(tt * 30))
    Image.fromarray(P[i]).save(os.path.join(OUT, f'frame-{TOD}-{t30[i]:.2f}.png'))

rep.insert(0, f'ambientpack {SYS}  tod={TOD} walker={WALKER} dur={DUR}s  ({time.time() - t0:.0f} s)  gpu={(res["play"]["info"] or {}).get("gpu", "?")[:80]}')
open(os.path.join(OUT, 'report.txt'), 'w').write('\n'.join(rep) + '\n')
json.dump({'checks': checks, 'stats': amb, 'path': path, 'diff': diff}, open(os.path.join(OUT, 'ambientcheck.json'), 'w'))
print('\n'.join(rep))
sys.exit(0 if all(c['ok'] for c in checks.values()) else 1)
