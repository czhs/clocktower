#!/usr/bin/env python3
"""Sprite-sheet bake for 2D games (owner: tools). Runs ON render-host; from the Mac use:
    tools/charpack.sh --bake <name> [options]            # sync, bake remotely, pull out/sprites/
    (= tools/remote.sh python3 tools/bake.py <name> [options] && rsync render-host:pixel3d/out/sprites/ out/sprites/)

  python3 tools/bake.py <name> [--clips idle,walk,attack | --preset cast] [--dirs 8|4|1] [--ppm 36] [--yaw 0] [--pitch 30]
                        [--cell 96] [--tod noon] [--runtime auto] [--trim 1] [--frames N] [--out out/sprites]
                        [--suffix -iso] [--game 1] [--q extra=1]
  --preset cast   rows idle, walk, run, talk, vote, point, die, ghost, ghost-spent + the spec's emote (spec.emote), every one at all --dirs
  --game 1        the walk row travels at the Clocktower game speed (spec.game.speed, else 3.95 x height m/s): the
                  sheet's walk cadence is the one the game plays at its movement speed (json: clips.walk.speed)
  --cell          default: from max(height, spec.length) x ppm x 1.5, then automatically raised x1.35 (up to 3 times)
                  while any figure touches its cell border (quadrupeds, fliers, wings, smears); an explicit --cell is
                  kept (warning only); the room under the feet (pad) grows with it, capped at 0.3 x cell (lead w5:
                  the pad ran away and wrapped NPC sheets). --cell N is the SQUARE RENDER cell (N x N px per copy, feet anchored near the
                  bottom); the json/printed "cell WxH" is that square TRIMMED to the union bbox of all baked drawings
                  (+1 px, width kept symmetric about the anchor). So "--cell 132 -> cell 62x71" is normal, and a printed
                  height equal to N means some drawing reaches the top of the render cell (raise N or drop --cell). The
                  "re-baking at <c>" log lines are the automatic square growth; the final printed size is after trim.
  --fxcell figure (default) | fx   (module fix T21) figure: the cell and the trim box come from an fx=0 pass (figure only),
                  then the FX bake renders into that cell; FX pixels outside the figure box are cropped (warning per clip).
                  fx: the old behaviour (bubbles, glyphs and dust grow the cell). --q fx=0: one figure-only sheet (no FX).

Pipeline: 1 meta page load (clip lengths) → 1 page load of scenes/char-bake.js with every (clip, dir) copy in its own
cell, rendered at t = (i + .5)/30 for every 30 Hz grid frame i (loops: 2 periods, to find the real period from the
images) → per clip, the DISPLAYED frames (union of pose changes over the directions; holds kept) → packed sheet.
Loops are cut from the 2nd drawing of the settled gait; an authored LegGait walk/run whose start-up cycle skipped a
drawing (pose ids '<gait>:<clip>:k<n>:<drawing>:<cycle>') is re-cut from the first steady cycle, with a warning (lead w4).

Outputs (out/sprites/):
  <name><suffix>.png         RGBA, key colour → alpha 0. Row = clip-major, then direction (dirs order); column = frame.
  <name><suffix>.json        { image, cell:[w,h], anchor:[x,y], ppm, yaw, pitch, dirs:[S,SE,…], fps,
                               clips: { <clip>: { fps, loop, frames, holds:[grid frames per frame], row, period } },
                               shadow: { image, anchor, rx, ry }, warnings:[…] }
                             anchor = the feet point (character origin) inside each cell, pixel-edge coordinates
                             (x right, y down from the cell's top-left corner); place the cell at (pos - anchor).
                             A frame shows for holds[i] / fps seconds. holdLast (die/vote, clip.hold): keep showing the
                             last frame after the clip ends. clips.walk.speed: the m/s the cycle was baked at (--game 1).
  <name><suffix>-shadow.png  one cell: flat contact-shadow ellipse (radius 0.16 x height around the anchor, squashed by
                             sin(pitch)), alpha 0.45, separate layer so games can draw it under every sprite.
  <name><suffix>-preview.png the sheet on a neutral background, x2, with clip/dir labels (for looking at it).
Consistency with the in-game look: same toon ramp/outline pass as the game (character outline flag, no line against
the background), sun relative to the camera at the noon preset, no world shadow, poses on the 30 Hz grid.
"""
import json, os, subprocess, sys, time
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charcheck  # noqa: E402
from charpack import shot, opt  # noqa: E402

DIRS = charcheck.DIRS
KEY = (0, 255, 0)


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        print(__doc__); sys.exit(2)
    name = args.pop(0)
    clips_arg = opt(args, '--clips')
    dirs = opt(args, '--dirs', '8')
    ppm = float(opt(args, '--ppm', '36'))
    yaw = opt(args, '--yaw', '0')
    pitch = float(opt(args, '--pitch', '30'))
    cell = opt(args, '--cell')
    tod = opt(args, '--tod', 'noon')
    runtime = opt(args, '--runtime', 'auto')
    trim = opt(args, '--trim', '1') != '0'
    nframes = opt(args, '--frames')
    preset = opt(args, '--preset')
    game = opt(args, '--game', '0') == '1'
    out = opt(args, '--out', 'out/sprites')
    suffix = opt(args, '--suffix', '')
    extra = opt(args, '--q', '')
    fxcell = opt(args, '--fxcell', 'figure')
    os.makedirs(out, exist_ok=True)
    raw = os.path.join('shots', 'bake-raw', os.path.basename(name) + suffix)
    os.makedirs(raw, exist_ok=True)
    T0 = time.time()
    q = {'scale': 1, 'char': name, 'runtime': runtime, 'dirs': dirs, 'ppm': ppm, 'yaw': yaw, 'pitch': pitch, 'tod': tod}
    if clips_arg:
        q['clips'] = clips_arg
    if cell:
        q['cell'] = cell
    for kv in filter(None, extra.split('&')):
        k, _, v = kv.partition('=')
        q[k] = v

    # 1) meta (also gives the layout); small window is fine for the numbers
    m = shot({'name': 'meta', 'q': q, 'times': [0.5], 'size': '640x360'}, raw, scene='char-bake')
    ci = charcheck.char_info(m)
    if not ci:
        print('meta failed', m['errors'], file=sys.stderr); sys.exit(1)
    if preset == 'cast' and not clips_arg:
        have = list(ci['clips'].keys())
        want = ['idle', 'walk', 'run', 'talk', 'vote', 'point', 'die', 'ghost', 'ghost-spent'] + ([ci['emote']] if ci.get('emote') else [])
        q['clips'] = ','.join(c for c in want if c in have)
        missing = [c for c in want if c not in have]
        if missing:
            print('cast preset: spec lacks', missing, file=sys.stderr)
    if game:
        g = ci.get('game') or {}
        q['walkSpeed'] = float(g.get('speed') or round(charcheck.GAME['h_per_s'] * float(ci['height']), 3))
    explicit_cell = cell is not None
    if not explicit_cell:
        size = max(float(ci['height']), float(ci.get('length') or 0))
        c0 = int(np.ceil(size * ppm * 1.5)); c0 += c0 % 2
        q['cell'] = c0
    # (module fix T21) the cell is sized from the FIGURE: an fx=0 pass grows the square cell and gives the trim box, then
    # the FX bake (speech bubble, glyphs, dust) renders into that same cell/box. FX pixels outside the figure box are
    # cropped (counted in a warning) instead of growing every cell 1.5-2.5x (wave 3: polly 74→136, cilantro 92→234).
    # --fxcell fx = old behaviour (FX count in the bounds). --q fx=0 = one figure-only pass (an FX-free sheet).
    two_pass = fxcell == 'figure' and str(q.get('fx', '1')) != '0'
    q1 = dict(q, fx='0') if two_pass else q
    for attempt in range(4):
        res = bake_once(name, q1, raw, out, suffix, ppm, yaw, pitch, tod, trim, nframes, T0, quiet=two_pass)
        if res is None:
            sys.exit(1)
        if explicit_cell or not res['border'] or attempt == 3:
            break
        p1 = int(res['pad']) + int(res['below']) + 2
        if res['edges'] == {'bottom'} and p1 < int(q1['cell']) * 0.45:
            # (module fix T21) only the BOTTOM edge: a lying die pose / a neck toward the camera reaches below the feet
            # anchor. Raise the pad (room under the anchor) instead of growing the whole square cell (cilantro 92 → 234)
            print(f"  figure touches the cell BOTTOM at pad {res['pad']}: re-baking with pad {p1} (cell {q1['cell']})")
            q1['pad'] = p1
            continue
        c1 = int(np.ceil(int(q1['cell']) * 1.35)); c1 += c1 % 2
        print(f"  figure touches the cell border at cell {q1['cell']}: re-baking at {c1}")
        q1['cell'] = c1
        if 'bottom' in res['edges'] or 'pad' in q1:   # keep the room under the anchor the figure needs
            # (lead, between waves 5 and 6) cap the pad at 0.3 x the new cell: the `below` scan can follow the figure into
            # the NEXT row's figure (a raised vote prop / ghost hover directly under a lying die), so p1 ran away
            # (npc-elder 58 → 80 with pad 8 → 57, then 146 with the head of every frame wrapped to the cell bottom;
            # npc-sweeper, npc-vendor the same). A real lying die needs ≤ 0.3 x cell under the feet.
            want = p1 if 'bottom' in res['edges'] else int(res['pad'])
            q1['pad'] = max(round(c1 * 0.14), min(want, round(c1 * 0.3)))
    if two_pass:
        q['cell'] = q1['cell']
        if 'pad' in q1: q['pad'] = q1['pad']
        print(f"  figure-only pass: render cell {q1['cell']}, figure box {res['box']} -> baking with FX into the same cell")
        if bake_once(name, q, raw, out, suffix, ppm, yaw, pitch, tod, trim, nframes, T0, box=res['box']) is None:
            sys.exit(1)


def bake_once(name, q, raw, out, suffix, ppm, yaw, pitch, tod, trim, nframes, T0, box=None, quiet=False):
    m = shot({'name': 'meta', 'q': q, 'times': [0.5], 'size': '640x360'}, raw, scene='char-bake')
    ci = charcheck.char_info(m)
    if not ci:
        print('meta failed', m['errors'], file=sys.stderr); return None
    cellpx, cols, rows = ci['cell'], ci['cols'], ci['rows']
    clips = ci['clipList']
    W, H = cols * cellpx, rows * cellpx
    q['cell'] = cellpx
    lens = {}
    for c in clips:
        cm = ci['clips'].get(c, {'fps': 30, 'loop': True, 'frames': 2})
        lens[c] = cm
    maxf = int(nframes) if nframes else max(min(180, 2 * v['frames'] + 4) if v['loop'] else v['frames'] + 1 for v in lens.values())
    times = [(i + 0.5) / 30 for i in range(maxf)]

    # 2) the bake render
    b = shot({'name': 'bake', 'q': q, 'times': times, 'size': f'{W}x{H}'}, raw, scene='char-bake')
    if b['errors']:
        print('bake render errors:', b['errors'], file=sys.stderr)
    frames, meta = charcheck.load_job(raw, 'bake')
    ci = charcheck.char_info(meta)
    if not frames:
        return None
    cells = ci['cells']
    pad = ci['pad']
    warnings = []
    border = False
    below = 0
    edges = set()      # (module fix T21) which cell edges the figure touches: bottom only → more pad, not a bigger cell

    def cell_img(f, k):
        c = cells[k]
        x0, y0 = int(c['x'] - cellpx / 2), int(c['y'] - (cellpx - pad))
        return f[y0:y0 + cellpx, x0:x0 + cellpx]

    # 3) per clip: displayed frames = runs of the same pose ids (Character 'pose' events / stage sampler, all dirs
    #    together), else runs of identical images; loops → one cycle (first repeat of the 2nd drawing, so a start-up
    #    transition is skipped; image-exact period when there are no ids)
    log = charcheck.align_log(ci.get('log') or [], times, len(frames))
    plan = {}
    for r, clip in enumerate(clips):
        ks = [r * cols + c for c in range(cols)]
        seq = [[cell_img(f, k) for k in ks] for f in frames]  # [frame][dir]
        same_img = lambda i, j: all(np.array_equal(seq[i][d], seq[j][d]) for d in range(cols))
        ids = [tuple(e['p'][k] for k in ks) if e and e.get('p') else None for e in log]
        use_ids = all(x is not None for x in ids) and len(set(ids)) > 1
        cm = lens[clip]
        n = len(seq)
        runs, st = [], 0
        for i in range(1, n + 1):
            if i == n or (ids[i] != ids[st] if use_ids else not same_img(i, st)):
                runs.append((st, i - st, ids[st] if use_ids else None)); st = i
        period = None
        if cm['loop']:
            cyc = None
            if use_ids and len(runs) > 3:
                # gait drawings carry a running counter (ids never repeat): the cycle ends at the first later
                # drawing that looks the same as the 2nd one (≤ 2 % of the figure differs, all dirs)
                a0 = 1
                # a travelling clip may start in another gait (the run accelerates from rest through walk drawings):
                # start the cycle search at the 2nd drawing of the gait the clip settles in
                g_ = lambda r_: str(r_[2][0]).split(':')[0]
                if len(str(runs[-1][2][0]).split(':')) >= 4:
                    first = next((k for k in range(len(runs)) if all(g_(runs[j]) == g_(runs[-1]) for j in range(k, len(runs)))), 0)
                    a0 = min(len(runs) - 1, first + 1)
                def near(i, j):
                    for d in range(cols):
                        mi, mj = charcheck.mask_of(seq[i][d], KEY), charcheck.mask_of(seq[j][d], KEY)
                        diff = np.any(seq[i][d] != seq[j][d], -1).sum()
                        if diff > 0.02 * max(1, (mi | mj).sum()):
                            return False
                    return True
                gaitn = (ci.get('gait') or {}).get(clip)
                def gait_rep(bi, s):
                    # Character gait ids '<gait>:<clip>:<frame>:<cycle n>' (authored or procedural walk/run): the
                    # same frame one cycle later is the same drawing. Older 2-field ids '<gait>:<n>' count drawings:
                    # drawing k and k + poses-per-cycle are the same. (The 2-field parse read the CYCLE counter of
                    # 4-field ids, found no repeat and baked 60 walk frames for the hound's 8-drawing walk.)
                    fa_, fb_ = str(runs[s][2][0]).split(':'), str(runs[bi][2][0]).split(':')
                    try:
                        if len(fa_) >= 4 and len(fb_) >= 4:
                            return fa_[0] == fb_[0] and fa_[-2] == fb_[-2] and int(fb_[-1]) == int(fa_[-1]) + 1
                        ka = int(fa_[-1]); kb = int(fb_[-1])
                    except (ValueError, IndexError, TypeError):
                        return False
                    return bool(gaitn) and kb - ka == gaitn
                def find_cycle(s):
                    for test in (lambda bi: runs[bi][2] == runs[s][2], lambda bi: gait_rep(bi, s), lambda bi: near(runs[bi][0], runs[s][0])):
                        for bi in range(s + 2, len(runs)):
                            if test(bi):
                                return runs[s:bi], runs[bi][0] - runs[s][0]
                    return None, None
                cyc, period = find_cycle(a0)
                # (lead w4, maxflow) the cycle above starts in the START-UP cycle; when the gait skipped a drawing
                # there (short-duty waddle: pose ids k0, k1, k3, then 0..3 every later cycle) the sheet lost that
                # drawing. Ids '<gait>:<clip>:k<n>:<drawing>:<cycle>': if the cut shows fewer drawings than the settled gait,
                # cut again from the first run of cycle >= 1. Bakes whose cut already shows every drawing are unchanged.
                def dc(r_):
                    f_ = str(r_[2][0]).split(':')
                    try:
                        # authored LegGait ids only: legacy Gait ids '<gait>:<clip>:<frame>:<cycle>' alias drawings at
                        # game speed by design (wanderer run shows 0,2,4 then 0,1,3,5) and must keep the old cut
                        return (f_[-2], int(f_[-1])) if len(f_) >= 5 and f_[-3].startswith('k') else None
                    except ValueError:
                        return None
                if cyc and all(dc(r_) for r_ in runs[a0:]):
                    allk = {dc(r_)[0] for r_ in runs[a0:]}
                    if len({dc(r_)[0] for r_ in cyc}) < len(allk):
                        a1 = next((k for k in range(a0 + 1, len(runs)) if dc(runs[k])[1] >= 1), None)
                        c1, p1 = find_cycle(a1) if a1 is not None else (None, None)
                        if c1 and len({dc(r_)[0] for r_ in c1}) == len(allk):
                            warnings.append(f'{clip}: start-up cycle showed {len({dc(r_)[0] for r_ in cyc})}/{len(allk)} '
                                            f'drawings → cut from the first steady cycle instead')
                            cyc, period = c1, p1
                        else:
                            warnings.append(f'{clip}: baked cycle shows only {len({dc(r_)[0] for r_ in cyc})} of '
                                            f'{len(allk)} gait drawings (check spec.locomotion / gameSpeed.drawings)')
            if cyc is None and not cm.get('procedural') and cm['frames'] < n:
                # authored loop (e.g. walk/run keys over one cycle; legs from the distance-phased gait): the period is
                # the clip length when every direction repeats there (≤ 2 % of the figure differs)
                P_ = cm['frames']
                okp = True
                for i in range(min(P_, n - P_)):
                    for d_ in range(cols):
                        mi, mj = charcheck.mask_of(seq[i][d_], KEY), charcheck.mask_of(seq[i + P_][d_], KEY)
                        if np.any(seq[i][d_] != seq[i + P_][d_], -1).sum() > 0.02 * max(1, (mi | mj).sum()):
                            okp = False; break
                    if not okp:
                        break
                if okp:
                    period = P_
                    cyc = [(s0, min(l, period - s0), x) for s0, l, x in runs if s0 < period]
            if cyc is None:
                for p in range(1, n // 2 + 1):
                    if all(same_img(i, i + p) for i in range(n - p)):
                        period = p; break
                if period is None:
                    period = min(cm['frames'], n)
                    warnings.append(f'{clip}: no repeat found in {n} frames → first {period} grid frames')
                cyc = [(s0, min(l, period - s0), x) for s0, l, x in runs if s0 < period]
        else:
            span = min(n, cm['frames'])
            cyc = [(s0, min(l, span - s0), x) for s0, l, x in runs if s0 < span]
        starts = [s0 for s0, _, _ in cyc]
        holds = [l for _, l, _ in cyc]
        plan[clip] = {'starts': starts, 'holds': holds, 'period': period, 'fps': cm['fps'], 'loop': cm['loop'], 'by': 'pose ids' if use_ids else 'images'}
        for d in range(cols):
            if box is not None:
                break     # FX pass into the figure's cell (T21): FX at the border are cropped, counted below
            for i in starts:
                m_ = charcheck.mask_of(seq[i][d], KEY)
                e_ = {n_ for n_, hit in (('top', m_[0].any()), ('bottom', m_[-1].any()), ('left', m_[:, 0].any()), ('right', m_[:, -1].any())) if hit}
                # (module fix T21) a figure crossing into the NEXT row shows up as that row's 'top' too: give a top/bottom
                # touch to the cell that holds more figure px within 8 px of the shared edge (the owner)
                for side, sgn in (('top', -1), ('bottom', 1)):
                    if side not in e_:
                        continue
                    k_ = r * cols + d
                    c_ = cells[k_]
                    yb = int(c_['y'] - (cellpx - pad)) + (0 if side == 'top' else cellpx)   # image row of the shared edge
                    xs = slice(int(c_['x'] - cellpx / 2), int(c_['x'] - cellpx / 2) + cellpx)
                    fm = charcheck.mask_of(frames[i], KEY)
                    inside = fm[max(0, yb - 8):yb, xs].sum() if side == 'bottom' else fm[yb:yb + 8, xs].sum()
                    outside = fm[yb:yb + 8, xs].sum() if side == 'bottom' else fm[max(0, yb - 8):yb, xs].sum()
                    if outside > inside:
                        e_.discard(side)
                    elif side == 'bottom':
                        # how far it runs on below the edge (rows connected column-wise): the extra pad it needs
                        prev = fm[yb - 1, xs].copy(); j = 0
                        while yb + j < fm.shape[0] and j < 80:
                            rowm = fm[yb + j, xs]
                            grow = prev | np.roll(prev, 1) | np.roll(prev, -1)
                            if not (rowm & grow).any():
                                break
                            prev = rowm & grow; j += 1
                        below = max(below, j)
                edges |= e_
                if e_:   # (module fix T6) bottom edge too
                    warnings.append(f'{clip}/{DIRS[ci["dirs"][d]]}: figure touches the cell border (raise --cell)'); border = True; break

    # 4) trim to the union bbox of all used cells (common cell + anchor)
    ax, ay = cellpx // 2, cellpx - pad
    x0, y0, x1, y1 = 0, 0, cellpx, cellpx
    if box is not None:
        # (module fix T21) the figure-only pass's box; FX pixels outside it are cropped (FX frames counted per clip)
        x0, y0, x1, y1 = box
        for r, clip in enumerate(clips):
            nclip = 0
            for i in plan[clip]['starts']:
                for c in range(cols):
                    m_ = charcheck.mask_of(cell_img(frames[i], r * cols + c), KEY).copy()
                    m_[y0:y1, x0:x1] = False
                    if m_.any():
                        nclip += 1
            if nclip:
                warnings.append(f'{clip}: FX cropped at the figure cell in {nclip} frame(s) (the game draws its own bubbles; --fxcell fx keeps them)')
    elif trim:
        u = np.zeros((cellpx, cellpx), bool)
        for r, clip in enumerate(clips):
            for i in plan[clip]['starts']:
                for c in range(cols):
                    u |= charcheck.mask_of(cell_img(frames[i], r * cols + c), KEY)
        bb = charcheck.bbox(u)
        if bb:
            x0, y0, x1, y1 = max(0, bb[0] - 1), max(0, bb[1] - 1), min(cellpx, bb[2] + 1), min(cellpx, bb[3] + 2)
            # keep the anchor column centred (symmetric width) so mirrored use stays aligned
            half = max(ax - x0, x1 - ax)
            x0, x1 = max(0, ax - half), min(cellpx, ax + half)
    cw, chh = x1 - x0, y1 - y0
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    anchor = [int(ax - x0), int(ay - y0)]

    # 5) pack: row = clip-major then dir; RGBA with the key → transparent
    nrows = len(clips) * cols
    ncols = max(len(p['starts']) for p in plan.values())
    sheet = np.zeros((nrows * chh, ncols * cw, 4), np.uint8)
    out_clips = {}
    for r, clip in enumerate(clips):
        p = plan[clip]
        for c in range(cols):
            row = r * cols + c
            for j, i in enumerate(p['starts']):
                im = cell_img(frames[i], r * cols + c)[y0:y1, x0:x1]
                a = np.where(charcheck.mask_of(im, KEY), 255, 0).astype(np.uint8)
                sheet[row * chh:(row + 1) * chh, j * cw:(j + 1) * cw, :3] = np.where(a[..., None] > 0, im, 0)
                sheet[row * chh:(row + 1) * chh, j * cw:(j + 1) * cw, 3] = a
        out_clips[clip] = {'fps': p['fps'], 'loop': p['loop'], 'frames': len(p['starts']), 'holds': p['holds'],
                           'row': r * cols, 'period': p['period'], 'grid_frames': p['starts'], 'frames_by': p['by']}
        # one-shots that end on a held pose (cast: die collapses and stays, vote raises and holds): the game keeps the
        # last frame after the clip ends instead of returning to idle (spec clip.hold, else by name)
        if not p['loop'] and (lens[clip].get('hold') or clip in ('die', 'vote')):
            out_clips[clip]['holdLast'] = True
        if clip in ('walk', 'run') and q.get(clip + 'Speed'):
            out_clips[clip]['speed'] = q[clip + 'Speed']   # m/s the cycle was baked at (game speed with --game 1)
    base = os.path.join(out, os.path.basename(name) + suffix)   # char=../shots/<dir>/<variant> → <variant>.png
    Image.fromarray(sheet, 'RGBA').save(base + '.png')

    # contact-shadow layer (one cell)
    rx = 0.16 * ci['height'] * ppm
    ry = max(1.0, rx * np.sin(np.radians(pitch)))
    yy, xx = np.mgrid[0:chh, 0:cw]
    e = ((xx + 0.5 - anchor[0]) / rx) ** 2 + ((yy + 0.5 - anchor[1]) / ry) ** 2 <= 1
    sh = np.zeros((chh, cw, 4), np.uint8)
    sh[e] = (44, 52, 70, 115)
    Image.fromarray(sh, 'RGBA').save(base + '-shadow.png')

    meta_out = {'name': name, 'image': os.path.basename(base + '.png'), 'cell': [cw, chh], 'anchor': anchor,
                'ppm': ppm, 'yaw': float(yaw), 'pitch': pitch, 'tod': tod, 'dirs': [DIRS[d] for d in ci['dirs']], 'bodyPlan': ci.get('bodyPlan'),
                'height_m': ci['height'],
                'fps': 30, 'clips': out_clips, 'runtime': ci['runtime'],
                'shadow': {'image': os.path.basename(base + '-shadow.png'), 'anchor': anchor, 'rx': round(rx, 2), 'ry': round(ry, 2)},
                'warnings': warnings}
    json.dump(meta_out, open(base + '.json', 'w'), indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))

    # preview: x2 on neutral, labels
    k = 2
    pv = Image.new('RGB', (ncols * cw * k + 70, nrows * chh * k), (58, 63, 74))
    s_rgb = Image.fromarray(sheet[..., :3]); s_a = Image.fromarray(sheet[..., 3])
    shimg = Image.fromarray(sh[..., :3]); sha = Image.fromarray(sh[..., 3])
    for row in range(nrows):
        for j in range(out_clips[clips[row // cols]]['frames']):
            pv.paste(shimg.resize((cw * k, chh * k), Image.NEAREST), (70 + j * cw * k, row * chh * k), sha.resize((cw * k, chh * k), Image.NEAREST))
    pv.paste(s_rgb.resize((ncols * cw * k, nrows * chh * k), Image.NEAREST), (70, 0), s_a.resize((ncols * cw * k, nrows * chh * k), Image.NEAREST))
    d = ImageDraw.Draw(pv)
    for r, clip in enumerate(clips):
        for c in range(cols):
            d.text((4, (r * cols + c) * chh * k + 4), f'{clip}\n{DIRS[ci["dirs"][c]]}', fill=(225, 225, 210))
    pv.save(base + '-preview.png')
    print(f"baked {name}{suffix}: {len(clips)} clips x {cols} dirs, render cell {cellpx} -> trimmed cell {cw}x{chh} anchor {anchor}, sheet {sheet.shape[1]}x{sheet.shape[0]}, "
          f"frames {', '.join('%s:%d' % (c, v['frames']) for c, v in out_clips.items())}  ({time.time() - T0:.1f} s, render {b['secs']} s)")
    for w in warnings:
        print('  warning:', w)
    return {'border': border, 'edges': edges, 'pad': pad, 'below': below, 'warnings': warnings, 'box': (x0, y0, x1, y1)}


if __name__ == '__main__':
    main()
