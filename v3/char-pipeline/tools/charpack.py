#!/usr/bin/env python3
"""Character pack renderer (owner: tools). Runs ON the render host (tools/charpack.sh syncs, calls this, pulls results).

  python3 tools/charpack.py <name> [--clips idle,walk | --preset cast] [--only turnaround|clips|scene] [--dir 1] [--vh 10]
                            [--runtime auto|character|rig|spike] [--out shots/char-<name>] [--jobs 4] [--q extra=1&k=v]
                            [--game-speed <m/s>] [--game 0]
  --preset cast    clips idle, walk, run, talk, vote, point, die, ghost, ghost-spent + spec.emote (+ turn): the Clocktower cast list; adds the
                   cast_clips row (FAIL when one is missing) and the vote/die final_hold rows
  --game-speed     travel speed of the game-speed walk (default spec.game.speed, else 3.95 x height m/s = the v2
                   game's 150 px/s for a 38 px sprite); --game 0 skips the game-speed jobs

Renders scenes/char-stage.js with tools/shot.mjs (parallel page loads, several frames per load via --times) and
writes into <out>/ (default shots/char-<name>/):
  turnaround.png            idle at 8 facings (S SE E NE N NW W SW), 1x pixels enlarged x4, neutral background
  turnaround-plain.png      the same on grass-coloured ground (with shadows)       turnaround-vh12.png  at viewHeight 12.5
  turnaround-silhouette.png solid silhouettes x4 + a 25 % thumbnail (recognisability)
  turnaround-isolated.png   signature part bright (rest dimmed), its isolated px magenta (charcheck isolated_px), x4
  clip-<c>.png              contact strip: every DISPLAYED pose (dedup of 60 Hz renders), label f<grid frame> x<hold>
  clip-<c>-60hz.png         60 Hz frames around the action (red tick = image changed; must sit on even frames)
  clip-<c>.gif              30 fps loop, x4            clip-<c>-1x.gif  the same at 1x pixels, real time (judge THIS)
  clip-game.* / game-1x.gif / game-x3.gif / game-onion.png
                            the walk at the game speed (H-scaled): strip, and a FIXED-camera crossing over 1 m tiles at
                            1x and x3, real time 30 fps, + an onion still (every 4th grid frame) — charcheck game.readable
  scene-<tod>.png           meadow at noon / golden / night, 1280x720 (x2), character in sun + a copy in a pillar shadow
  scene-<tod>-crop.png      1x crop of the two characters, x4
  pan.png                   whole-texel camera pan (1,1 texel per 60 Hz frame, frozen idle on plain ground): figure box
                            of frame 0 / the last frame (re-aligned by the root's shift) / their diff (red), x4
  night jobs (no image)     night-freeze (character alone, key bg, t=1, engine time varied) and night-pan (night meadow,
                            lantern=0 cover=0, whole-texel pan inside one window of the world's stepped clocks)
  mark-<i> / scene-mark*    magenta renders of each declared signature part (sig.<part>, sig_ground rows)
  report.txt / charcheck.json   tools/charcheck.py numbers (table also printed)
  raw/                      raw renders + per-job JSON (stage debug log, info, errors) consumed by charcheck.py
Clip timing: frame i of a 60 Hz render is at t = (i + .5)/60 (30 Hz grid boundaries fall between odd and even
frames). Actions start at t = 0.25 s (idle before), so the strip shows the lead-in.
"""
import json, os, subprocess, sys, time, shutil
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charcheck  # noqa: E402

DIRS = charcheck.DIRS
KEY = (0, 255, 0)
NEUTRAL = (58, 63, 74)
LABEL = (225, 225, 210)


def opt(args, name, default=None):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default


# ------------------------------------------------------------------------------------------------ rendering
def shot(job, raw, scene='char-stage'):
    """job: {name, q: {...}, times: [...], size}. → writes raw/<name>/f*.png + raw/<name>.json"""
    d = os.path.join(raw, job['name'])
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d, exist_ok=True)
    q = '&'.join(f'{k}={v}' for k, v in job['q'].items())
    times = job.get('times', [1.0])
    cmd = ['node', 'tools/shot.mjs', scene, os.path.join(d, 'f.png'), '--size', job.get('size', '640x360'),
           '--q', q, '--times', ','.join(f'{t:.5f}' for t in times), '--timeout', '120000']
    if job.get('bench'):
        cmd += ['--bench', str(job['bench'])]
    if job.get('gpu'):
        cmd += ['--gpu-info']
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True)
    out = p.stdout + p.stderr
    info, bench, errors, gpu = None, None, [], None
    lines = out.splitlines()
    for i, ln in enumerate(lines):
        if ln.startswith('info: '):
            info = json.loads(ln[6:])
        elif ln.startswith('bench: '):
            bench = json.loads(ln[7:])
        elif ln.startswith('GPU:'):
            gpu = ln[4:].strip()[:200]
        elif 'Failed to load resource' in ln and '404' in ln:
            pass  # char-stage probes optional modules (e.g. src/chars/character.js not landed yet): not an error
        elif ln.startswith('PAGE ERRORS') or ln.startswith('CAPTURE FAILED') or '[pageerror]' in ln or ln.startswith('[error]'):
            errors.append(ln[:300])
            if ln.startswith('PAGE ERRORS'):
                errors += [x[:300] for x in lines[i + 1:i + 6]]
    meta = {'job': job, 'times': times, 'info': info, 'bench': bench, 'errors': errors, 'code': p.returncode, 'gpu': gpu,
            'secs': round(time.time() - t0, 1), 'warnings': [l[:200] for l in lines if l.startswith('[warning]')][:10]}
    json.dump(meta, open(os.path.join(raw, job['name'] + '.json'), 'w'))
    return meta


# ------------------------------------------------------------------------------------------------ images
def frames_of(raw, name):
    fr, meta = charcheck.load_job(raw, name)
    return fr, meta


def neutral(img, bg=NEUTRAL):
    m = charcheck.mask_of(img, KEY)
    out = img.copy()
    out[~m] = bg
    return out


def enlarge(a, k):
    return Image.fromarray(a).resize((a.shape[1] * k, a.shape[0] * k), Image.NEAREST)


def labelled_row(tiles, labels, k, pad=4, bg=(30, 32, 38), cols=None, marks=None):
    """tiles: list of HxWx3 arrays (same size) → sheet image (scaled x k) with a 12 px label line above each."""
    if not tiles:
        return Image.new('RGB', (8, 8), bg)
    h, w = tiles[0].shape[:2]
    cols = cols or len(tiles)
    rows = (len(tiles) + cols - 1) // cols
    W, H = w * k + pad, h * k + 14 + pad
    sheet = Image.new('RGB', (cols * W + pad, rows * H + pad), bg)
    d = ImageDraw.Draw(sheet)
    for i, (t, lab) in enumerate(zip(tiles, labels)):
        x, y = pad + (i % cols) * W, pad + (i // cols) * H
        sheet.paste(enlarge(t, k), (x, y + 14))
        d.text((x + 2, y + 1), lab, fill=LABEL)
        if marks and marks[i]:
            d.rectangle([x, y + 11, x + w * k - 1, y + 13], fill=(235, 60, 60))
    return sheet


def union_box(masks, margin, W, H):
    u = np.logical_or.reduce(masks)
    b = charcheck.bbox(u)
    if b is None:
        return 0, 0, W, H
    x0, y0, x1, y1 = b
    return max(0, x0 - margin), max(0, y0 - margin), min(W, x1 + margin), min(H, y1 + margin)


# ------------------------------------------------------------------------------------------------ outputs
def out_turnaround(raw, out, name, file):
    fr, meta = frames_of(raw, name)
    ci = charcheck.char_info(meta)
    if not fr or not ci:
        return None
    img = fr[0]
    H, W = img.shape[:2]
    if name.startswith('turn-key'):
        m = charcheck.mask_of(img, KEY)
    else:  # same layout as turn-key → its exact mask
        keyimg = frames_of(raw, 'turn-key')[0]
        m = charcheck.mask_of(keyimg[0] if keyimg and keyimg[0].shape == img.shape else img, KEY)
    tiles, labels = [], []
    hp = ci['height'] / ci['texel']
    cw = int(ci['cell'])
    for cell in ci['cells']:
        x0, y0 = int(cell['x'] - cw / 2), int(cell['y'] - hp * 1.3)
        x1, y1 = x0 + cw, int(cell['y'] + hp * 0.15)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        tiles.append(neutral(img[y0:y1, x0:x1]) if name.startswith('turn-key') else img[y0:y1, x0:x1])
        mm = m[y0:y1, x0:x1]
        b = charcheck.bbox(mm) if mm.shape == tiles[-1].shape[:2] else None
        hh = (b[3] - b[1]) if b else 0
        labels.append(f"{DIRS[cell['dir']]} {hh}px" if cell.get('dir') is not None and cell['dir'] < 8 else str(cell.get('clip')))
    w = min(t.shape[1] for t in tiles); h = min(t.shape[0] for t in tiles)
    tiles = [t[:h, :w] for t in tiles]
    labelled_row(tiles, labels, 4).save(os.path.join(out, file))
    return file


def out_clip(raw, out, clip, at):
    name = 'clip-' + clip
    fr, meta = frames_of(raw, name)
    ci = charcheck.char_info(meta)
    if not fr:
        return []
    H, W = fr[0].shape[:2]
    masks = [charcheck.mask_of(f, KEY) for f in fr]
    x0, y0, x1, y1 = union_box(masks, 3, W, H)
    crops = [neutral(f[y0:y1, x0:x1]) for f in fr]
    raw_crops = [f[y0:y1, x0:x1] for f in fr]
    files = []
    # displayed poses: runs of the same pose id (stage debug log; 'pose' events of the Character), else runs of
    # identical images. Label f<grid frame> x<hold in grid frames>; '~' = the image still changed inside the hold
    # (per-frame leg IK / shimmer — see charcheck off_grid/flicker).
    log = charcheck.align_log((ci or {}).get('log') or [], meta.get('times', []), len(fr))
    pids = [e['p'][0] if e and e.get('p') else None for e in log]
    # prefer the stage's drawing id without its FX part (lead): facing steps and dynamics-only redraws (scarf, lean)
    # keep the clip frame but are new drawings; FX stages are not (they show in the 60 Hz strip)
    if log and all(e and e.get('d') for e in log):
        pids = [e['d'].split('|')[0] for e in log]
    use_ids = all(p is not None for p in pids) and len(set(pids)) > 1
    uniq, labels, start = [], [], 0
    for i in range(1, len(raw_crops) + 1):
        brk = i == len(raw_crops) or (pids[i] != pids[start] if use_ids else not np.array_equal(raw_crops[i], raw_crops[start]))
        if brk:
            g0, hold = start // 2, (i - start) / 2
            moved = any(not np.array_equal(raw_crops[j], raw_crops[start]) for j in range(start + 1, i))
            uniq.append(crops[start]); labels.append(f'f{g0} x{hold:g}' + ('~' if moved else ''))
            start = i
    k = 4 if crops[0].shape[1] < 90 else 3
    cols = max(1, min(len(uniq), 1400 // (crops[0].shape[1] * k + 4)))
    labelled_row(uniq[:40], labels[:40], k, cols=cols).save(os.path.join(out, f'clip-{clip}.png')); files.append(f'clip-{clip}.png')
    # 60 Hz strip around the action (or the first 48 frames of a loop)
    clipm = (ci or {}).get('clips', {}).get(clip, {})
    if not clipm.get('loop', True):
        a = max(0, int((at - 0.1) * 60)); b = min(len(crops), a + 48)
    else:
        a, b = 0, min(len(crops), 48)
    marks = [i > 0 and not np.array_equal(raw_crops[i], raw_crops[i - 1]) for i in range(a, b)]
    labelled_row(crops[a:b], [f'{i}' for i in range(a, b)], 2, cols=16, marks=marks).save(os.path.join(out, f'clip-{clip}-60hz.png'))
    files.append(f'clip-{clip}-60hz.png')
    # GIF at 30 fps: even 60 Hz samples (just after each grid boundary)
    gif = [enlarge(c, 4).convert('P', palette=Image.ADAPTIVE, colors=255) for c in crops[0::2]]
    if gif:
        gif[0].save(os.path.join(out, f'clip-{clip}.gif'), save_all=True, append_images=gif[1:],
                    duration=[30 if i % 3 else 40 for i in range(len(gif))], loop=0, optimize=False, disposal=1)
        files.append(f'clip-{clip}.gif')
    return files


def out_pan(raw, out, res):
    fr, meta = frames_of(raw, 'pan')
    pn = res.get('pan') or {}
    ci = charcheck.char_info(meta)
    if not fr or 'box' not in pn or not ci:
        return []
    log = charcheck.align_log(ci.get('log') or [], meta.get('times', []), len(fr))
    x0, y0, x1, y1 = pn['box']
    r0, r1 = log[0]['s']['r'], log[-1]['s']['r']
    dx, dy = int(round(r1[0] - r0[0])), int(round(r1[1] - r0[1]))
    H, W = fr[0].shape[:2]
    if x0 + dx < 0 or y0 + dy < 0 or x1 + dx > W or y1 + dy > H:
        return []
    a = fr[0][y0:y1, x0:x1]
    b = fr[-1][y0 + dy:y1 + dy, x0 + dx:x1 + dx]
    d = np.where(np.any(a != b, -1)[..., None], np.array([235, 60, 60], np.uint8), (a // 3)).astype(np.uint8)
    labelled_row([a, b, d], ['frame 0', f'frame {len(fr) - 1} ({dx:+d},{dy:+d})', f"diff {pn.get('max_px')} px"], 4).save(os.path.join(out, 'pan.png'))
    return ['pan.png']


def out_scene(raw, out, tod):
    name = 'scene-' + tod
    fr, meta = frames_of(raw, name)
    ci = charcheck.char_info(meta)
    if not fr:
        return []
    img = fr[0]
    Image.fromarray(img).save(os.path.join(out, f'scene-{tod}.png'))
    files = [f'scene-{tod}.png']
    if ci and ci.get('cells'):
        s = (meta.get('info') or {}).get('scale', 2) or 2
        lo = img[::int(s), ::int(s)] if float(s).is_integer() else img
        H, W = lo.shape[:2]
        hp = ci['height'] / ci['texel']
        xs = [c['x'] for c in ci['cells']]; ys = [c['y'] for c in ci['cells']]
        x0, x1 = int(min(xs) - hp * 0.9), int(max(xs) + hp * 0.9)
        y0, y1 = int(min(ys) - hp * 1.35), int(max(ys) + hp * 0.35)
        crop = lo[max(0, y0):min(H, y1), max(0, x0):min(W, x1)]
        enlarge(crop, 4).save(os.path.join(out, f'scene-{tod}-crop.png'))
        files.append(f'scene-{tod}-crop.png')
    return files


# ------------------------------------------------------------------------------------------------ main
# (lead, wave 3) + point, ghost, ghost-spent (the game clips; 7/8 wave-3 members never authored them because this list
# omitted them). run stays in the list (rendered when the spec has it) but charcheck cast_clips treats it as optional.
CAST = ['idle', 'walk', 'run', 'talk', 'vote', 'point', 'die', 'ghost', 'ghost-spent']   # + the spec's emote (charcheck cast_clips)


def game_speed_of(ci, override=None):
    """Clocktower game travel speed for this body (m/s): spec.game.speed or spec.gameSpeed.v (char-stage specMeta maps
    both into ci.game), else 3.95 body heights per second
    (v2: 150 px/s for a ~38 px sprite)."""
    if override:
        return float(override)
    g = ci.get('game') or {}
    if g.get('speed'):
        return float(g['speed'])
    return round(charcheck.GAME['h_per_s'] * float(ci['height']) * float(g.get('hScale', 1)), 3)


def out_gif_1x(raw, out, clip):
    """clip-<c>-1x.gif: the clip at 1x pixels, real time (30 fps), neutral background — how it reads in the game."""
    fr, meta = frames_of(raw, 'clip-' + clip)
    if not fr:
        return []
    H, W = fr[0].shape[:2]
    masks = [charcheck.mask_of(f, KEY) for f in fr]
    x0, y0, x1, y1 = union_box(masks, 6, W, H)
    g = [Image.fromarray(neutral(f[y0:y1, x0:x1])).convert('P', palette=Image.ADAPTIVE, colors=255) for f in fr[0::2]]
    g[0].save(os.path.join(out, f'clip-{clip}-1x.gif'), save_all=True, append_images=g[1:],
              duration=[30 if i % 3 else 40 for i in range(len(g))], loop=0, optimize=False, disposal=1)
    return [f'clip-{clip}-1x.gif']


def out_game(raw, out, ci, speed, d, pitch=30.0, yaw=45.0):
    """game-1x.gif / game-x3.gif: the game-speed walk crossing a ground of 1 m tiles with a FIXED camera (the figure is
    pasted at its travelled screen position, root-aligned), real time 30 fps; first and last drawing as a still too.
    The camera in pixel3d follows the walker, so the clip GIFs cannot show travel speed; this one does."""
    fr, meta = frames_of(raw, 'clip-game')
    cm = charcheck.char_info(meta)
    if not fr or not cm:
        return []
    log = charcheck.align_log(cm.get('log') or [], meta.get('times', []), len(fr))
    tex = float(cm['texel']); hp = cm['height'] / tex
    th = np.radians(int(d) * 45.0); P = np.radians(pitch); Y = np.radians(yaw)
    times = meta['times']
    sel = list(range(0, len(fr), 2))
    disp = [(speed * max(0.0, times[i]) * np.sin(th) / tex, speed * max(0.0, times[i]) * np.cos(th) * np.sin(P) / tex) for i in sel]
    dxs = [p[0] for p in disp]; dys = [p[1] for p in disp]
    pad = int(hp * 0.9)
    W = int(max(dxs) - min(dxs) + 2 * pad); H = int(max(dys) - min(dys) + hp * 1.4 + pad)
    ox, oy = pad - min(dxs), int(hp * 1.3) - min(dys)
    # ground: 1 m checker in two grass tones (world grid projected with the camera yaw/pitch)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    a = (xx + 0.5 - ox) * tex; b = (yy + 0.5 - oy) * tex / np.sin(P)
    wx = a * np.cos(Y) + b * np.sin(Y); wz = -a * np.sin(Y) + b * np.cos(Y)
    chk = ((np.floor(wx) + np.floor(wz)) % 2).astype(bool)
    bg = np.where(chk[..., None], np.array([117, 165, 88], np.uint8), np.array([105, 152, 80], np.uint8)).astype(np.uint8)
    frames = []
    for k, i in enumerate(sel):
        f = fr[i]; m = charcheck.mask_of(f, KEY)
        r = log[i]['s']['r'] if log[i] and log[i].get('s') else [f.shape[1] / 2, f.shape[0] * 0.6]
        canvas = bg.copy()
        # contact shadow (as bake.py) under the travelled root
        cx, cy = ox + dxs[k], oy + dys[k]
        rx = 0.16 * hp * 1.0; ry = max(1.0, rx * np.sin(P))
        e = ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1
        canvas[e] = (canvas[e] * 0.62 + np.array([44, 52, 70]) * 0.38).astype(np.uint8)
        ys, xs = np.nonzero(m)
        tx = (xs - int(round(r[0])) + int(round(cx))); ty = (ys - int(round(r[1])) + int(round(cy)))
        ok = (tx >= 0) & (tx < W) & (ty >= 0) & (ty < H)
        canvas[ty[ok], tx[ok]] = f[ys[ok], xs[ok]]
        frames.append(canvas)
    files = []
    for k_, nm in ((1, 'game-1x.gif'), (3, 'game-x3.gif')):
        g = [enlarge(c, k_).convert('P', palette=Image.ADAPTIVE, colors=255) for c in frames]
        g[0].save(os.path.join(out, nm), save_all=True, append_images=g[1:], duration=[30 if i % 3 else 40 for i in range(len(g))],
                  loop=0, optimize=False, disposal=1)
        files.append(nm)
    # still: every 4th grid frame overlaid (onion skin) — spacing of drawings over the ground at game speed
    on = bg.copy()
    for k in range(0, len(frames), 4):
        diff = np.any(frames[k] != bg, -1)
        on[diff] = frames[k][diff]
    enlarge(on, 3).save(os.path.join(out, 'game-onion.png')); files.append('game-onion.png')
    return files


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        print(__doc__); sys.exit(2)
    name = args.pop(0)
    clips_arg = opt(args, '--clips')
    preset = opt(args, '--preset')
    only_arg = opt(args, '--only')
    only = set(only_arg.split(',')) if only_arg else None
    want = lambda g: only is None or g in only
    d = opt(args, '--dir', '1')
    vh = opt(args, '--vh', '10')
    runtime = opt(args, '--runtime', 'auto')
    out = opt(args, '--out', f'shots/char-{name}')
    jobs_n = int(opt(args, '--jobs', '4'))
    extra = opt(args, '--q', '')
    gspeed = opt(args, '--game-speed')
    no_game = opt(args, '--game', '1') == '0'
    at = 0.25
    raw = os.path.join(out, 'raw')
    os.makedirs(raw, exist_ok=True)
    base = {'scale': 1, 'char': name, 'runtime': runtime, 'vh': vh}
    if extra:
        for kv in extra.split('&'):
            k, _, v = kv.partition('=')
            base[k] = v
    T0 = time.time()

    # 1) meta: one quick load (key bg, all clips side by side) → clip list + lengths (+ the GPU line)
    meta = shot({'name': 'meta', 'q': {**base, 'bg': 'key', 'grid': 'clips', 'clip': 'idle'}, 'times': [1.0], 'gpu': True}, raw)
    ci = charcheck.char_info(meta)
    if not ci:
        print('meta render failed:', meta['errors'] or meta.get('warnings'), file=sys.stderr)
        sys.exit(1)
    have = list(ci['clips'].keys()) or ['idle']
    if clips_arg:
        clips = clips_arg.split(',')
    elif preset == 'cast':
        emote = ci.get('emote')
        clips = [c for c in CAST if c in have] + ([emote] if emote in have else []) + (['turn'] if ci['runtime'] == 'character' else [])
    else:
        clips = have
    # (module fix T10) '--clips game' is the game-speed walk job, not a spec clip: it used to render clip=game (no such
    # clip → no travel, 0 H/s) under the job name clip-game, colliding with the real game job's raw dir
    if 'game' in clips:
        clips = [c for c in clips if c != 'game']
        no_game = False
    loco_ok = 'walk' in have
    G = game_speed_of(ci, gspeed)
    print(f"char {ci['name']} runtime={ci['runtime']} height={ci['height']} m plan={charcheck.plan_of(ci)[0].replace(' ', '')}  clips={clips}  "
          f"game speed {G} m/s  gpu={meta.get('gpu')}  ({meta['secs']} s)")

    jobs = []
    sig = ci.get('sigList') or []
    if want('turnaround'):
        tq = {**base, 'grid': 'turnaround', 'clip': 'idle', 'dir': 0}
        jobs += [
            {'name': 'turn-key', 'q': {**tq, 'bg': 'key'}, 'times': [1.0, 1.5, 1.0]},
            {'name': 'turn-plain', 'q': {**tq, 'bg': 'plain'}, 'times': [1.0]},
            {'name': 'turn-dbg', 'q': {**tq, 'bg': 'plain', 'outlineDebug': 1}, 'times': [1.0]},
            # same with no world: its red pixels are the character's own inner lines (charcheck subtracts them)
            {'name': 'turn-dbg-key', 'q': {**tq, 'bg': 'key', 'outlineDebug': 1}, 'times': [1.0]},
            {'name': 'turn-key-vh12', 'q': {**tq, 'bg': 'key', 'vh': 12.5}, 'times': [1.0]},
        ]
        # one magenta-marked turnaround per declared signature part (charcheck sig.<part> rows)
        for i, it in enumerate(sig):
            jobs.append({'name': f'mark-{i}', 'q': {**tq, 'bg': 'key', 'mark': it['name']}, 'times': [1.0]})
            # (module fix T25a) the same turnaround WITHOUT that part: its px outside this body = the part's own outline
            jobs.append({'name': f'hide-{i}', 'q': {**tq, 'bg': 'key', 'mark': it['name'], 'hide': 1}, 'times': [1.0]})
        # (module fix T4) the face slot ALONE (every other part removed): unoccluded face px per facing (face_visible row)
        if ci.get('faceSlot'):
            jobs.append({'name': 'face-solo', 'q': {**tq, 'bg': 'key', 'mark': ci['faceSlot'], 'solo': 1}, 'times': [1.0]})
        # camera-pan stability: frozen idle (t=1), the camera target moves 1 texel right + 1 up per 60 Hz frame
        jobs.append({'name': 'pan', 'q': {**base, 'bg': 'plain', 'clip': 'idle', 'dir': d, 't': 1, 'pan': '1,1'},
                     'times': [(i + 0.5) / 60 for i in range(24)]})
    if want('clips'):
        for c in clips:
            m = ci['clips'].get(c, {'fps': 30, 'loop': True, 'frames': 60})
            cyc = m['frames'] / m['fps']
            # die / vote end on a held pose: render 0.8 s past the end so the hold shows in the strip and GIF
            dur = min(4.0, max(2.0, 2 * cyc)) if m['loop'] else at + cyc + (0.8 if c in ('die', 'vote') else 0.4)
            n = int(round(dur * 60))
            # travelling clips: no FX in the timing render (lead) — world-anchored dust scrolls under the following
            # camera every frame and would read as off-grid motion; dust/sparks are reviewed in the action clips
            fxq = {'fx': 0} if c in ('walk', 'run') else {}
            jobs.append({'name': f'clip-{c}', 'q': {**base, 'bg': 'key', 'clip': c, 'dir': d, 'at': at, **fxq},
                         'times': [(i + 0.5) / 60 for i in range(n)]})
            # (module fix T5) held one-shots also render without FX: charcheck takes final_hold / hold_redraws from this
            # copy (a vote sparkle or die wisp outliving the window FAILed final_hold; FX frames hid real pops)
            # (lead, wave 3) + talk: its steady speech bubble covers every frame, so islands / key_delta come from this copy
            if c in ('vote', 'die', 'talk'):
                jobs.append({'name': f'nofx-{c}', 'q': {**base, 'bg': 'key', 'clip': c, 'dir': d, 'at': at, 'fx': 0},
                             'times': [(i + 0.5) / 60 for i in range(n)]})
            # foot slide at the profile facing too (dir 2: a planted foot sliding along the view is invisible at dir 1)
            if c in ('walk', 'run') and str(d) != '2':
                jobs.append({'name': f'slide-{c}', 'q': {**base, 'bg': 'key', 'clip': c, 'dir': 2, 'fx': 0},
                             'times': [(i + 0.5) / 60 for i in range(120)]})
        # the walk at the Clocktower game speed (H-scaled), fixed-camera crossing GIF + readability row
        if loco_ok and not no_game:
            gq = {**base, 'bg': 'key', 'clip': 'walk', 'dir': d, 'fx': 0, 'speed': G}
            jobs.append({'name': 'clip-game', 'q': gq, 'times': [(i + 0.5) / 60 for i in range(96)]})
            if str(d) != '2':
                jobs.append({'name': 'slide-game', 'q': {**gq, 'dir': 2}, 'times': [(i + 0.5) / 60 for i in range(96)]})
            # (module fix T16) each foot magenta ('@<foot bone>') on every game-speed gait drawing at 8 facings: visible
            # foot px per drawing (buried / under-the-hem contact feet that foot_slide 'n/a' never saw)
            nd = int(((ci.get('gait') or {}).get('walk')) or 4)
            for fi, fb in enumerate(((ci.get('bones') or {}).get('all') or [])[:4]):
                for k in range(nd):
                    jobs.append({'name': f'feet-{k}-{fi}', 'q': {**base, 'bg': 'key', 'grid': 'turnaround', 'clip': 'walk', 'frame': k,
                                                               'speed': G, 'fx': 0, 'mark': '@' + fb}, 'times': [1.0]})
        # (module fix T25) flat-prop facing: each held prop magenta in the held vote pose at 8 facings (prop_area row);
        # face shimmer: the eye slot magenta through the talk (else idle) loop (face_shimmer row)
        if 'vote' in clips and ci.get('props') and 'vote' in ci['clips']:
            fv = max(0, int(ci['clips']['vote'].get('frames', 30)) - 1)
            for j, pn in enumerate(ci['props'][:3]):
                jobs.append({'name': f'prop-{j}', 'q': {**base, 'bg': 'key', 'grid': 'turnaround', 'clip': 'vote', 'frame': fv, 'fx': 0, 'mark': pn}, 'times': [1.0]})
        for ec in ([c for c in ('idle', 'talk') if c in ci['clips'] or c == 'idle'] if ci.get('eyeSlot') else []):
            jobs.append({'name': f'eyes-{ec}', 'q': {**base, 'bg': 'key', 'clip': ec, 'dir': d, 'at': at, 'fx': 0, 'mark': ci['eyeSlot']},
                         'times': [(i + 0.5) / 60 for i in range(120)]})
        # re-simulation determinism of the first action: mid-action t fresh, after t + 0.7, then t again
        acts = [c for c in clips if c in ci['clips'] and not ci['clips'][c].get('loop', True) and c != 'turn']
        if acts:
            a = acts[0]; m = ci['clips'][a]
            tm = at + round(0.4 * m['frames']) / m['fps'] + 0.5 / 60
            jobs.append({'name': f'det-{a}', 'q': {**base, 'bg': 'key', 'clip': a, 'dir': d, 'at': at}, 'times': [tm, tm + 0.7, tm]})
    if want('scene'):
        for tod in ('noon', 'golden', 'night'):
            sq = {**base, 'scale': 2, 'bg': 'meadow', 'tod': tod, 'shadow': 1, 'clip': 'idle', 'dir': d}
            jobs.append({'name': f'scene-{tod}', 'q': sq, 'size': '1280x720', 'times': [2.0]})
            if sig and tod != 'night':   # signature parts magenta / the whole figure magenta (charcheck sig_ground)
                jobs.append({'name': f'scene-mark-{tod}', 'q': {**sq, 'mark': ','.join(i['name'] for i in sig)}, 'size': '1280x720', 'times': [2.0]})
                jobs.append({'name': f'scene-markall-{tod}', 'q': {**sq, 'mark': ','.join(ci.get('palette') or {})}, 'size': '1280x720', 'times': [2.0]})
        # night, frozen: (a) the character alone (key bg) over 1 s of engine time with t=1 — 0 px unless it runs on
        # engine time; (b) a whole-texel pan over the night meadow inside one window of the stepped world clocks, no
        # lantern (the old t=1 night freeze changed ~200k px per frame: lantern 8 fps, wind 3.5 fps, glow uTime)
        jobs.append({'name': 'night-freeze', 'q': {**base, 'bg': 'key', 'tod': 'night', 'clip': 'idle', 'dir': d, 't': 1},
                     'times': [0.1, 0.35, 0.6, 0.85, 1.1]})
        jobs.append({'name': 'night-pan', 'q': {**base, 'bg': 'meadow', 'tod': 'night', 'lantern': 0, 'cover': 0, 'clip': 'idle', 'dir': d, 't': 1, 'pan': '1,1'},
                     'times': charcheck.NIGHT_TIMES})
    # biggest first (clip renders), so the pool finishes together
    jobs.sort(key=lambda j: -len(j.get('times', [])))
    with ThreadPoolExecutor(max_workers=jobs_n) as ex:
        metas = list(ex.map(lambda j: shot(j, raw), jobs))
    for j, m in zip(jobs, metas):
        flag = 'ERR ' if m['errors'] or m['code'] else ''
        print(f"  {flag}{j['name']:<16} {len(m['times']):>4} frames {m['secs']:>6.1f} s" + (f"  {m['errors'][:2]}" if m['errors'] else ''))

    # 2) presentation
    files = []
    if want('turnaround'):
        files += [f for f in (out_turnaround(raw, out, 'turn-key', 'turnaround.png'),
                              out_turnaround(raw, out, 'turn-plain', 'turnaround-plain.png'),
                              out_turnaround(raw, out, 'turn-key-vh12', 'turnaround-vh12.png')) if f]
    if want('clips'):
        for c in clips:
            files += out_clip(raw, out, c, at)
            files += out_gif_1x(raw, out, c)
        if any(j['name'] == 'clip-game' for j in jobs):
            files += out_clip(raw, out, 'game', at)
            files += out_gif_1x(raw, out, 'game')
            files += out_game(raw, out, ci, G, d, float(base.get('pitch', 30)), float(base.get('yaw', 45)))
    if want('scene'):
        for tod in ('noon', 'golden', 'night'):
            files += out_scene(raw, out, tod)

    # 3) checks (only the jobs rendered in this run: no stale rows after --only)
    rendered = {j['name'] for j in jobs}
    cast = ci if (preset == 'cast' or ci.get('bodyPlan') or ci.get('emote')) else None
    res = charcheck.run(out, silhouette=want('turnaround'), jobs=rendered, cast=cast, pack_dir=d)
    if want('turnaround'):
        files += ['turnaround-silhouette.png', 'turnaround-isolated.png']
        files += out_pan(raw, out, res)
    res['runtime'] = ci['runtime']
    res['pack_secs'] = round(time.time() - T0, 1)
    res['gpu'] = meta.get('gpu')
    res['host'] = os.uname().nodename
    res['game_speed'] = G
    json.dump(res, open(os.path.join(out, 'charcheck.json'), 'w'), indent=1)
    tab = charcheck.table(res)
    with open(os.path.join(out, 'report.txt'), 'w') as f:
        f.write(f"charpack {name}  runtime={ci['runtime']}  plan={charcheck.plan_of(ci)[0].replace(' ', '')}  vh={vh}  dir={d}  only={only_arg or 'all'}  "
                f"{res['pack_secs']} s\nhost {res['host']}  gpu {res['gpu']}\n\n{tab}\n\nfiles:\n" + '\n'.join(files) + '\n')
    print(tab)
    print(f"host {res['host']} gpu {res['gpu']}")
    print(f"files ({len(files)}): " + ' '.join(files))
    print(f'done in {res["pack_secs"]} s → {out}')


if __name__ == '__main__':
    main()
