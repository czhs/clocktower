#!/usr/bin/env python3
"""Automated character checks (owner: tools) — CHARACTER_TECHNIQUES §8 measured on charpack renders.

Usage (normally run by tools/charpack.py on render-host; works anywhere with PIL + numpy):
  python3 tools/charcheck.py shots/char-<name>              # table + writes <dir>/charcheck.json
  python3 tools/charcheck.py shots/char-<name> --json       # JSON only on stdout
  python3 tools/charcheck.py shots/char-<name> --silhouette # also writes turnaround-silhouette.png
Input: the raw renders charpack keeps in <dir>/raw/ (each job = <job>/*.png + <job>.json with the stage's debug
info, i.e. window.__pixel.info().stats.char from scenes/char-stage.js). Key-colour background = exact mask.

Checks (value → PASS/WARN/FAIL; thresholds in LIMITS):
  height_px        character height in texels per facing (mask bbox) at the pack's viewHeight; target per spec.bodyPlan
                   (PLANS; biped 45..62 at vh 10, quadruped 26..50, hopper 22..50 …; spec.heightPx overrides; a spec
                   without bodyPlan but with quadruped leg parts / length > height is 'quadruped (inferred)')
  presence         silhouette area at S vs the mannequin (the cast reads at one on-screen size)
  head_frac        (head-bone joint → top of mask) / height; 1/4..1/3 (needs a 'head' or 'neck' bone)
  colors           distinct colours on the figure, per palette slot (nearest slot tone in Lab, ≥1 % of the slot)
  bw               pure black/white pixels on the figure (any channel set ≤ 12 or all ≥ 243)
  speckle          isolated pixels (colour shared with none of the 8 neighbours) per figure, max over facings
  ring             silhouette line against the WORLD: red outline-debug pixels on the mask ring (plain bg render,
                   ?outlineDebug=1) + green edge-highlight pixels on the figure; plus ring/inner luma ratio
  determinism      same t rendered twice (t=1, 1.5, 1) → identical
  facing_area      silhouette-area variation over the 8 facings: (max-min)/max < 40 %
  per clip (60 Hz renders, t_i = (i+.5)/60, so a 30 Hz grid boundary lies between samples 2k-1 and 2k):
    off_grid       image changes at odd samples (not on the 30 Hz key grid) — sub-grid motion / swimming root
    flicker        pixels changed between consecutive frames with the SAME displayed pose id (must be 0)
    cadence        intervals between pose changes in grid frames (e.g. 2,2,2 = on twos) and pose rate in Hz
    foot_slide     max planted-foot drift in texels during stance (travelling clips; needs foot bones)
    single_frame   drawings held ONE grid frame (or less) that differ visibly from both neighbours, except smear
                   contact keys (a smear visible during the hold) and clip switches (critic: x1 holds in turn/hurt)
  isolated_px      isolated pixels on the SIGNATURE part (spec.signature slot, else the lightest large slot) per facing:
                   dotted inner-line speckle on the hat etc. (want <= 2)
  face_lit         fraction of the face's skin pixels (head box: mask top -> head joint, facings S/SE/SW) in the skin
                   hi/mid tones on the noon plain turnaround (want >= 50 %; a brim shadow makes the face a dark mask)
  sig.<part>       every declared signature part (spec.signature string / array of slots or {part}): visible px, isolated
                   px and hi/mid tone share per facing; sig_ground.*: the parts vs the grass around the figure (sun/shade)
  <clip>.strobe / micro / hold_redraws / pose_read / key_speckle / final_hold / amplitude   1x readability at 30 Hz
                   (readability()); game.readable: the walk at the game speed (cycle from the gait's pose ids, drawings
                   shown per cycle, aliasing, holds, drawing change); cast_clips; night_freeze / night_pan
  pan              whole-texel camera pan with a frozen idle figure (pack job 'pan'): after the best integer shift the
                   figure box must be pixel-identical in every frame (0 px) and the shift must equal the root's
"""
import json, os, re, sys, glob
import numpy as np
from PIL import Image, ImageDraw

LIMITS = dict(height=(45, 62), head=(0.24, 0.36), speckle=6, ring_frac=0.05, facing_var=0.40, slide=0.5, colors_per_slot=5,
              sig_isolated=2, face_lit=0.5, sig_tone=0.5)
# Per body plan (spec.bodyPlan; tools round 05): texel height range at vh 10 (S facing and all facings), head fraction
# (None = not measured: the head is not the top of the figure), on-screen presence = silhouette area at S relative to
# the mannequin's area at vh 10 (the Clocktower cast must read at a similar size: v2 drew every player ~38 px tall).
# spec.heightPx = [lo, hi] overrides the height range. Ranges scale with 10 / vh.
PLANS = {
    # names = the spec.bodyPlan vocabulary of CHARACTERS.md §3 / CAST_PORTING §6
    'biped':        dict(height=(45, 62), head=(0.24, 0.36), area=(0.6, 1.6)),   # human, storyteller, green-hood, NPCs
    'uprightAnimal': dict(height=(36, 62), head=(0.24, 0.5), area=(0.5, 1.6)),   # chibi animals: frog, fox, goat, mole…
    'quadruped':    dict(height=(26, 50), head=None, area=(0.45, 1.6)),          # hound (longer than tall)
    'bird':         dict(height=(30, 58), head=(0.22, 0.5), area=(0.45, 1.6)),   # honk, chonk (horizontal body / ball)
    'hopper':       dict(height=(22, 50), head=None, area=(0.4, 1.4)),           # true hop: frog, toad (squat, wide)
    'limbless':     dict(height=(18, 44), head=None, area=(0.35, 1.4)),          # snail (shell + foot + stalks)
    'flier':        dict(height=(28, 60), head=None, area=(0.35, 1.6)),          # moth (hover height included)
    'longNeck':     dict(height=(42, 72), head=(0.1, 0.3), area=(0.5, 1.6)),     # cilantro (giraffe): head small on a neck
    'blob':         dict(height=(28, 56), head=None, area=(0.45, 1.6)),          # single-mass bodies
}
PLAN_ALIASES = {'upright': 'uprightAnimal', 'glider': 'limbless', 'quad': 'quadruped', 'longneck': 'longNeck',
                'uprightanimal': 'uprightAnimal', 'chibi': 'uprightAnimal'}
MANNEQUIN_AREA = 644   # silhouette px of characters/mannequin.js at S, vh 10 (shots/tools/mannequin, tools round 05)
# Clocktower v2 game speed (pipgws PLAYER_SPEED 150 px/s, sprite ~38 px tall, 4 drawings at ~13 fps): 3.95 body
# heights per second, a gait cycle ~0.31 s, ~1.2 heights per cycle; drawings held 2-4 grid frames at 30 Hz.
GAME = dict(h_per_s=3.95, cycle=(0.2, 0.5), h_per_cycle=(0.8, 1.8), hold=(2, 4), min_change=0.03)


QUAD_PARTS = re.compile(r'^(fore|hind|front|back)(leg|paw|foot|hoof)|^paw(F|H)|^hoof', re.I)


def plan_of(ci):
    """plan_of_base + per-spec overrides: spec.presence = [lo, hi] (module fix T13: a deliberately wide v1 head, frog 143 %)."""
    name, base = plan_of_base(ci)
    pr = (ci or {}).get('presence')
    if isinstance(pr, (list, tuple)) and len(pr) == 2:
        base = dict(base); base['area'] = (float(pr[0]), float(pr[1]))
    return name, base


def plan_of_base(ci):
    """(plan name, targets). spec.bodyPlan, else inferred: a spec.length longer than the height or quadruped leg parts
    (foreleg/hindPaw/frontPaw/pawFL…) → 'quadruped (inferred)' (the run-04 hound declared nothing and FAILed the biped
    45-62 height); otherwise biped."""
    ci = ci or {}
    p = ci.get('bodyPlan')
    if not p:
        quad = (ci.get('length') and float(ci['length']) > float(ci.get('height') or 9)) or \
            sum(1 for n in (ci.get('partNames') or []) if QUAD_PARTS.search(n)) >= 2
        if quad:
            base = dict(PLANS['quadruped'])
            if ci.get('heightPx'):
                base['height'] = tuple(ci['heightPx'])
            return 'quadruped (inferred)', base
    p = p or 'biped'
    p = PLAN_ALIASES.get(p, PLAN_ALIASES.get(str(p).lower(), p))
    if p not in PLANS:   # unknown name: biped targets, flagged in the plan name (height_px note)
        base = dict(PLANS['biped'])
        if ci.get('heightPx'):
            base['height'] = tuple(ci['heightPx'])
        return f'{p}? (unknown bodyPlan: biped targets)', base
    base = dict(PLANS[p])
    if (ci or {}).get('heightPx'):
        base['height'] = tuple((ci or {})['heightPx'])
    return p, base
KEY_DEFAULT = (0, 255, 0)
# upper-body changes of <= SPECK px on one frame = specks: scattered self-shadow texels sliding while the root glides
# (shadow map and screen texel grids are incommensurate; lighting known issue). A real redraw of a 48-px figure
# changes > 20 px, a 1-texel body shift > 100 px. (lead: 3 → 8 after the wanderer's hat-brim shadow gave 4-7 px specks)
SPECK = 8
DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']


# ------------------------------------------------------------------------------------------------ io
def load_job(raw, job):
    """→ (frames [np.uint8 HxWx3], meta dict (info json) or None)."""
    js = os.path.join(raw, job + '.json')
    meta = json.load(open(js)) if os.path.exists(js) else None
    files = glob.glob(os.path.join(raw, job, '*.png'))
    def idx(f):
        m = re.search(r'-(\d+)\.png$', f)
        return int(m.group(1)) if m else -1
    files.sort(key=idx)
    return [np.asarray(Image.open(f).convert('RGB')) for f in files], meta


def char_info(meta):
    try:
        return meta['info']['stats']['char']
    except (TypeError, KeyError):
        return None


def key_of(ci):
    return KEY_DEFAULT


def mask_of(img, key=KEY_DEFAULT):
    return np.any(img != np.array(key, np.uint8), axis=-1)


def luma(img):
    f = img.astype(np.float32) / 255.0
    return 0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]


def cell_box(ci, cell, W, H):
    """Region around one figure: root at (x, y) (pixel-edge coords); figure extends up by ~height px."""
    hp = ci['height'] / ci['texel']
    c = ci.get('cell', int(hp * 1.3))
    x0, x1 = int(cell['x'] - c / 2), int(cell['x'] + c / 2)
    y0, y1 = int(cell['y'] - hp * 1.35), int(cell['y'] + hp * 0.3)
    return max(0, x0), max(0, y0), min(W, x1), min(H, y1)


def bbox(m):
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


# ------------------------------------------------------------------------------------------------ colour
def srgb_to_lab(rgb):
    c = np.asarray(rgb, np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def color_report(pixels, palette):
    """pixels: Nx3 uint8 of figure pixels. → {slot: {n, top:[hex…]}}, total."""
    cols, counts = np.unique(pixels.reshape(-1, 3), axis=0, return_counts=True)
    out = {'total': int(len(cols))}
    if not palette:
        return out
    names, tones = [], []
    for n, ts in palette.items():
        for t in ts:
            names.append(n); tones.append(hex2rgb(t))
    lab_t = srgb_to_lab(np.array(tones))
    lab_c = srgb_to_lab(cols)
    w = np.array([0.5, 1.0, 1.0])  # lightness varies with light; weight chroma more
    d = (((lab_c[:, None, :] - lab_t[None, :, :]) * w) ** 2).sum(-1)
    slot = [names[i] for i in d.argmin(1)]
    per = {}
    for s, c, k in zip(slot, cols, counts):
        per.setdefault(s, []).append((int(k), '#%02X%02X%02X' % tuple(int(v) for v in c)))
    slots = {}
    for s, lst in per.items():
        tot = sum(k for k, _ in lst)
        lst.sort(reverse=True)
        sig = [(k, h) for k, h in lst if k >= 0.01 * tot]
        slots[s] = {'n': len(sig), 'px': tot, 'top': [h for _, h in sig[:6]]}
    out['slots'] = slots
    return out


def speckle_count(img, m):
    """Pixels inside the mask whose colour appears in none of their 8 neighbours."""
    H, W = m.shape
    p = np.pad(img.astype(np.int32), ((1, 1), (1, 1), (0, 0)), constant_values=-1)
    c = p[1:-1, 1:-1]
    same = np.zeros((H, W), bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            n = p[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx]
            same |= np.all(n == c, axis=-1)
    return int((m & ~same).sum())


def isolated_map(img, m):
    """Boolean map: pixels inside m whose colour appears in none of their 8 neighbours (speckle_count as a map)."""
    H, W = m.shape
    p = np.pad(img.astype(np.int32), ((1, 1), (1, 1), (0, 0)), constant_values=-1)
    c = p[1:-1, 1:-1]
    same = np.zeros((H, W), bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                same |= np.all(p[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx] == c, axis=-1)
    return m & ~same


def dilate(m, r=1):
    out = m.copy()
    p = np.pad(m, r)
    H, W = m.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= p[r + dy:r + dy + H, r + dx:r + dx + W]
    return out


def erode(m, r=1):
    return ~dilate(~m, r)


def largest_component(m):
    """Largest 8-connected component of a boolean map (BFS; figure-sized maps only)."""
    seen = np.zeros_like(m)
    best = []
    H, W = m.shape
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]:
            continue
        comp, stack = [], [(y0, x0)]
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        stack.append((yy, xx))
        if len(comp) > len(best):
            best = comp
    out = np.zeros_like(m)
    if best:
        ys, xs = zip(*best)
        out[list(ys), list(xs)] = True
    return out


def islands(m, min_px=3):
    """(module fix T2) number of 8-connected components of >= min_px in a boolean map (min-label propagation, numpy
    only: figure-sized crops). A detached boot / prop / hat shows up as an extra island."""
    if not m.any():
        return 0
    H, W = m.shape
    lab = np.where(m, np.arange(1, H * W + 1).reshape(H, W), 0).astype(np.int64)
    big = H * W + 10
    while True:
        p = np.pad(np.where(m, lab, big), 1, constant_values=big)
        nb = np.min(np.stack([p[1 + dy:1 + dy + H, 1 + dx:1 + dx + W] for dy in (-1, 0, 1) for dx in (-1, 0, 1)]), 0)
        new = np.where(m, np.minimum(lab, nb), 0)
        if np.array_equal(new, lab):
            break
        lab = new
    _, counts = np.unique(lab[m], return_counts=True)
    return int((counts >= min_px).sum())


def check_islands(res):
    """(module fix T2) islands per facing on the idle turnaround (key bg): > 1 = a detached part (floating boots passed
    as foot_slide n/a; a prop not touching the hand)."""
    if '_turn' not in res:
        return
    img, m_all, ci = res['_turn']
    H, W = m_all.shape
    per = {}
    for cell in ci['cells']:
        x0, y0, x1, y1 = cell_box(ci, cell, W, H)
        per[DIRS[cell['dir']]] = islands(m_all[y0:y1, x0:x1])
    res['islands'] = per


def tone_index(pixels, palette, w=(1.0, 1.0, 1.0)):
    """Nearest palette tone per pixel (Lab, weights w on L,a,b). → (slot names [N], tone idx 0 hi/1 mid/2 sh [N])."""
    names, idx, tones = [], [], []
    for n, ts in palette.items():
        for i, t in enumerate(ts):
            names.append(n); idx.append(i); tones.append(hex2rgb(t))
    if not tones or len(pixels) == 0:
        return np.array([], object), np.array([], int)
    cols, inv = np.unique(pixels.reshape(-1, 3), axis=0, return_inverse=True)
    lab_t = srgb_to_lab(np.array(tones)); lab_c = srgb_to_lab(cols)
    d = (((lab_c[:, None, :] - lab_t[None, :, :]) * np.array(w)) ** 2).sum(-1)
    best = d.argmin(1)[inv.reshape(-1)]
    return np.array(names, object)[best], np.array(idx)[best]


def signature_slot(ci, pixels):
    """spec.signature (stage meta), else the slot whose mid tone is within 6 L of the lightest mid and that covers the
    most figure pixels (the 'lightest mass' rule; an accent like a steel blade is light but small)."""
    pal = ci.get('palette') or {}
    if ci.get('signature') in pal:
        return ci['signature'], 'spec'
    for it in ci.get('sigList') or []:   # list form: the first slot item (or the slot of the first part item)
        sl = it['name'] if it.get('kind') == 'slot' else (ci.get('partSlots') or {}).get(it['name'])
        if sl in pal:
            return sl, 'spec list'
    if not pal:
        return None, None
    L = {n: float(srgb_to_lab(np.array([hex2rgb(ts[min(1, len(ts) - 1)])]))[0, 0]) for n, ts in pal.items()}
    top = max(L.values())
    cand = [n for n in pal if L[n] >= top - 6]
    names, _ = tone_index(pixels, pal, (0.5, 1, 1))
    return max(cand, key=lambda n: int((names == n).sum())), 'auto'


def ring_of(m):
    """Mask pixels with at least one 4-neighbour outside the mask, and the inward neighbour index."""
    p = np.pad(m, 1)
    out = np.zeros_like(m)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        out |= m & ~p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx]
    return out


def ring_luma_ratio(img, m):
    """Mean over ring pixels of luma(ring) / luma(pixel 2 steps inward, if inside the mask)."""
    L = luma(img)
    ring = ring_of(m)
    H, W = m.shape
    ys, xs = np.nonzero(ring)
    rats, dark = [], 0
    for y, x in zip(ys, xs):
        # inward direction: away from the outside neighbours
        vx = vy = 0
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            yy, xx = y + dy, x + dx
            if not (0 <= yy < H and 0 <= xx < W) or not m[yy, xx]:
                vx -= dx; vy -= dy
        if vx == 0 and vy == 0:
            continue
        yy, xx = y + 2 * np.sign(vy), x + 2 * np.sign(vx)
        if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not ring[yy, xx]:
            r = (L[y, x] + 0.02) / (L[yy, xx] + 0.02)
            rats.append(r)
            dark += r < 0.75
    if not rats:
        return None, None
    return float(np.mean(rats)), dark / len(rats)


# ------------------------------------------------------------------------------------------------ checks
def check_turnaround(raw, res, silhouette_out=None):
    frames, meta = load_job(raw, 'turn-key')
    ci = char_info(meta)
    if not frames or not ci:
        res['turnaround'] = {'error': 'no turn-key render'}
        return
    img = frames[0]
    H, W = img.shape[:2]
    key = key_of(ci)
    m_all = mask_of(img, key)
    vh = ci.get('vh', 10)
    plan, PL = plan_of(ci)
    lo, hi = [v * 10 / vh for v in PL['height']]
    figs = []
    pix = []
    for cell in ci['cells']:
        x0, y0, x1, y1 = cell_box(ci, cell, W, H)
        m = np.zeros_like(m_all); m[y0:y1, x0:x1] = m_all[y0:y1, x0:x1]
        b = bbox(m)
        if b is None:
            figs.append(None); continue
        f = {'dir': DIRS[cell['dir']] if cell.get('dir') is not None and cell['dir'] < 8 else cell.get('clip'),
             'h': int(b[3] - b[1]), 'w': int(b[2] - b[0]), 'area': int(m.sum()), 'speckle': speckle_count(img, m),
             'box': [int(v) for v in b]}
        figs.append(f)
        pix.append(img[m])
    ok = [f for f in figs if f]
    hs = [f['h'] for f in ok]
    areas = [f['area'] for f in ok]
    t = {'figures': ok, 'height_px': {'min': min(hs), 'max': max(hs), 'S': ok[0]['h'], 'range': [round(lo, 1), round(hi, 1)]},
         'facing_area_var': round((max(areas) - min(areas)) / max(areas), 3),
         'speckle_max': max(f['speckle'] for f in ok),
         'vh': vh, 'plan': plan, 'plan_head': PL['head'],
         'area_S': ok[0]['area'], 'area_rel': round(ok[0]['area'] / (MANNEQUIN_AREA * (10 / vh) ** 2), 2), 'area_range': PL['area'],
         'width_px': {'S': ok[0]['w'], 'max': max(f['w'] for f in ok)}}
    # head fraction (cell 0 = facing S): head joint screen y from the debug log
    log = ci.get('log') or []
    if log and 's' in log[0] and 'h' in log[0]['s']:
        hy = log[0]['s']['h'][1]
        top = ok[0]['box'][1]
        t['head_frac'] = round((hy - top) / ok[0]['h'], 3)
    allpix = np.concatenate(pix) if pix else np.zeros((0, 3), np.uint8)
    t['colors'] = color_report(allpix, ci.get('palette'))
    # isolated pixels on the signature part: the slot's pixels closed by 1 px (so 1-px line dots inside it count)
    sig, how = signature_slot(ci, allpix)
    if sig:
        names, _ = tone_index(img.reshape(-1, 3), ci['palette'], (0.5, 1, 1))
        sm = (names.reshape(m_all.shape) == sig) & m_all
        # per figure: the LARGEST connected piece of the slot (the hat itself; light blade/skin texels that happen to
        # be nearest a signature tone are not the signature shape), closed by 1 px so 1-px line dots inside it count
        region = np.zeros_like(m_all)
        for cell, f in zip(ci['cells'], figs):
            if not f:
                continue
            x0, y0, x1, y1 = cell_box(ci, cell, W, H)
            region[y0:y1, x0:x1] |= erode(dilate(largest_component(sm[y0:y1, x0:x1]), 1), 1) & m_all[y0:y1, x0:x1]
        iso = isolated_map(img, m_all) & region
        per = []
        for cell, f in zip(ci['cells'], figs):
            if not f:
                continue
            x0, y0, x1, y1 = cell_box(ci, cell, W, H)
            per.append(int(iso[y0:y1, x0:x1].sum()))
        t['signature'] = {'slot': sig, 'from': how, 'isolated_per_facing': per, 'isolated_max': max(per) if per else 0,
                          'region_px': int(region.sum())}
        res['_sig_iso'] = iso
        if silhouette_out:   # pack mode: show where (signature region dimmed outside, isolated px magenta), x4
            ok_b = [f['box'] for f in figs if f]
            X0 = max(0, min(b[0] for b in ok_b) - 3); X1 = min(W, max(b[2] for b in ok_b) + 3)
            Y0 = max(0, min(b[1] for b in ok_b) - 3); Y1 = min(H, max(b[3] for b in ok_b) + 3)
            vis = img.copy()
            vis[~m_all] = (58, 63, 74)
            vis[m_all & ~region] = vis[m_all & ~region] // 2 + 20
            vis[iso] = (255, 0, 255)
            crop = vis[Y0:Y1, X0:X1]
            Image.fromarray(crop).resize((crop.shape[1] * 4, crop.shape[0] * 4), Image.NEAREST).save(
                os.path.join(os.path.dirname(silhouette_out), 'turnaround-isolated.png'))
    t['bw_px'] = int(((allpix <= 12).all(-1) | (allpix >= 243).all(-1)).sum())
    # determinism: frames 0 and 2 rendered at the same t
    if len(frames) >= 3:
        t['deterministic'] = bool(np.array_equal(frames[0], frames[2]))
        t['det_px'] = int(np.any(frames[0] != frames[2], -1).sum())
    res['turnaround'] = t
    res['_turn'] = (img, m_all, ci)
    if silhouette_out:
        write_silhouettes(img, m_all, ci, ok, silhouette_out)


def write_silhouettes(img, m_all, ci, figs, out):
    # black figures on white, 1x enlarged x4, plus a 25 % thumbnail strip (recognisability check)
    H, W = m_all.shape
    xs0 = min(f['box'][0] for f in figs) - 4; xs1 = max(f['box'][2] for f in figs) + 4
    ys0 = min(f['box'][1] for f in figs) - 4; ys1 = max(f['box'][3] for f in figs) + 4
    sil = np.where(m_all[ys0:ys1, xs0:xs1, None], 24, 245).astype(np.uint8).repeat(3, -1)
    im = Image.fromarray(sil)
    big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
    small = im.resize((max(1, im.width // 4), max(1, im.height // 4)), Image.BOX).resize((im.width, im.height), Image.NEAREST)
    sheet = Image.new('RGB', (big.width, big.height + small.height * 2 + 8), (245, 245, 245))
    sheet.paste(big, (0, 0))
    sheet.paste(small.resize((small.width * 2, small.height * 2), Image.NEAREST), (0, big.height + 8))
    sheet.save(out)


def check_ring(raw, res):
    frames, meta = load_job(raw, 'turn-dbg')
    if not frames or '_turn' not in res:
        return
    img = frames[0]
    _, m, ci = res['_turn']
    if img.shape != m.shape + (3,):
        res['ring'] = {'error': 'size mismatch'}; return
    r = img.astype(np.int32)
    # outlineDebug paints LINEAR (1, .05, .05) / (.05, 1, .1) → sRGB (255, 63, 63) / (63, 255, 89): thresholds must
    # admit 63 (the old < 60 test saw 0 lines everywhere, so silhouette_line/inner_lines were vacuous; lead fix)
    red = (r[..., 0] > 200) & (r[..., 1] < 100) & (r[..., 2] < 100)
    green = (r[..., 1] > 200) & (r[..., 0] < 100) & (r[..., 2] < 120)
    ring = ring_of(m)
    # inner lines legitimately touch the silhouette (hat brim over the face, arm over the body at the edge): a line
    # is 'against the world' only if it is absent from the same render without a world (turn-dbg-key, lead fix)
    kf, _ = load_job(raw, 'turn-dbg-key')
    if kf and kf[0].shape == img.shape:
        k = kf[0].astype(np.int32)
        red_key = (k[..., 0] > 200) & (k[..., 1] < 100) & (k[..., 2] < 100)
        ring_red = red & ring & ~red_key
        key_ring_frac = float((red_key & ring).sum()) / max(1, int(ring.sum()))
    else:
        ring_red = red & ring
        key_ring_frac = 0.0
    out = {'ring_px': int(ring.sum()), 'ring_outline_px': int(ring_red.sum()),
           'inner_outline_px': int((red & m & ~ring).sum()), 'edge_highlight_px': int((green & m).sum())}
    out['ring_outline_frac'] = round(out['ring_outline_px'] / max(1, out['ring_px']), 3)
    # a material that outlines against EVERYTHING (e.g. 'full' instead of 'char') also lines the key background:
    # inner lines cover a few % of the ring, a silhouette line most of it
    out['ring_key_frac'] = round(key_ring_frac, 3)
    pf, _ = load_job(raw, 'turn-plain')
    if pf:
        ratio, dark = ring_luma_ratio(pf[0], m)
        if ratio is not None:
            out['ring_luma_ratio'] = round(ratio, 3)
            out['ring_dark_frac'] = round(dark, 3)
        # pixels of the figure that differ between the key and the plain render (world-dependent shading/lines)
        kimg = res['_turn'][0]
        out['fig_px_diff_key_vs_plain'] = int((np.any(kimg != pf[0], -1) & m).sum())
    res['ring'] = out


FACE_DIRS = (0, 1, 7)   # S, SE, SW: the face is visible


def check_face(raw, res):
    """face_lit on the noon plain turnaround: skin hi/mid share of the skin pixels in each front facing's head box."""
    frames, meta = load_job(raw, 'turn-plain')
    if not frames or '_turn' not in res:
        return
    _, m_all, ci = res['_turn']
    pal = ci.get('palette') or {}
    slot = ci.get('faceSlot') if ci.get('faceSlot') in pal else next((n for n in pal if re.search(r'skin|face', n, re.I)), None)
    cm = char_info(meta) or {}
    log = [e for e in (cm.get('log') or []) if e.get('hs')]
    if log:
        hs = log[-1]['hs']
    else:   # older stage logs: actor 0's head offset from its root, applied to every copy
        l0 = [e for e in (cm.get('log') or []) if e.get('s', {}).get('h')]
        hs = [[c['x'], c['y'] + l0[-1]['s']['h'][1] - l0[-1]['s']['r'][1]] for c in ci['cells']] if l0 else None
    if not slot or not hs or frames[0].shape[:2] != m_all.shape:
        res['face'] = {'error': 'no skin slot / head log'}
        return
    img = frames[0]
    H, W = m_all.shape
    per, lit_all, tot_all = {}, 0, 0
    sf, _ = load_job(raw, 'face-solo')                 # (module fix T4) face slot alone: unoccluded face px
    solo = mark_mask(sf[0]) if sf and sf[0].shape[:2] == m_all.shape else None
    cf, _ = load_job(raw, 'face-cover')                # (module fix, wave 5: T32) face slot + its hair / hood cover
    cov = mark_mask(cf[0]) if cf and cf[0].shape[:2] == m_all.shape else None
    for i, cell in enumerate(ci['cells']):
        if cell.get('dir') not in FACE_DIRS or i >= len(hs) or not hs[i]:
            continue
        x0, y0, x1, y1 = cell_box(ci, cell, W, H)
        mm = np.zeros_like(m_all); mm[y0:y1, x0:x1] = m_all[y0:y1, x0:x1]
        b = bbox(mm)
        if b is None:
            continue
        hy = int(round(hs[i][1]))
        box = np.zeros_like(mm); box[b[1]:min(H, hy + 2), x0:x1] = True
        px = img[mm & box]
        names, idx = tone_index(px, pal)
        skin = names == slot
        lit, tot = int((skin & (idx <= 1)).sum()), int(skin.sum())
        per[DIRS[cell['dir']]] = {'lit': lit, 'skin': tot, 'frac': round(lit / tot, 3) if tot else None}
        if solo is not None:
            un = int((solo & box & (np.arange(W)[None, :] >= x0) & (np.arange(W)[None, :] < x1)).sum())
            per[DIRS[cell['dir']]].update({'unocc': un, 'vis': round(tot / un, 3) if un else None})
            if cov is not None:   # the face px the hair cap / hood rim hides by design are not 'occluded'
                uc = int((cov & box & (np.arange(W)[None, :] >= x0) & (np.arange(W)[None, :] < x1)).sum())
                per[DIRS[cell['dir']]].update({'uncov': uc, 'vis_raw': per[DIRS[cell['dir']]]['vis'],
                                               'vis': round(min(1.0, tot / uc), 3) if uc else None})
        lit_all += lit; tot_all += tot
    res['face'] = {'slot': slot, 'per_facing': per, 'lit': lit_all, 'skin_px': tot_all,
                   'frac': round(lit_all / tot_all, 3) if tot_all else None}


def check_pan(raw, res, job='pan', key='pan'):
    """Whole-texel camera pan over a frozen idle figure: best integer shift per frame vs frame 0 over the figure box."""
    frames, meta = load_job(raw, job)
    ci = char_info(meta)
    if not frames or not ci:
        return
    log = align_log(ci.get('log') or [], meta.get('times', []), len(frames))
    if not log or not all(e and e.get('s') for e in log):
        res[key] = {'error': 'no log'}; return
    H, W = frames[0].shape[:2]
    hp = ci['height'] / ci['texel']
    rx, ry = log[0]['s']['r']
    x0, x1 = int(rx - hp * 0.75), int(rx + hp * 0.75)
    y0, y1 = int(ry - hp * 1.25), int(ry + hp * 0.3)
    ref = frames[0][y0:y1, x0:x1]
    worst, bad_shift, n = 0, 0, 0
    diffs = []
    for i in range(1, len(frames)):
        ex = (int(round(log[i]['s']['r'][0] - rx)), int(round(log[i]['s']['r'][1] - ry)))
        best = None
        for dy in range(ex[1] - 2, ex[1] + 3):
            for dx in range(ex[0] - 2, ex[0] + 3):
                if x0 + dx < 0 or y0 + dy < 0 or x1 + dx > W or y1 + dy > H:
                    continue
                d = int(np.any(frames[i][y0 + dy:y1 + dy, x0 + dx:x1 + dx] != ref, -1).sum())
                if best is None or d < best[0]:
                    best = (d, dx, dy)
        if best is None:
            continue
        n += 1
        diffs.append(best[0])
        worst = max(worst, best[0])
        bad_shift += (best[1], best[2]) != ex
    res[key] = {'frames': n, 'max_px': worst, 'frames_changed': sum(1 for d in diffs if d), 'shift_mismatch': bad_shift,
                'pan': ci.get('pan'), 'box': [x0, y0, x1, y1]}
    if key == 'night_pan':
        full = [int(np.any(frames[i] != frames[i - 1], -1).sum()) for i in range(1, len(frames))]
        res[key]['note'] = (f"night meadow, lantern=0, t frozen, whole-texel pan in one stepped-clock window (engine "
                            f"{meta['times'][0]:.3f}-{meta['times'][-1]:.3f} s: between steps of grain 12 fps, wind 3.5 fps, glow 7.5 Hz); figure-box diff after the best "
                            f"shift (unshifted whole-frame change {max(full) if full else 0} px = the pan itself)")


# inside [2.0, 2.0833): no step boundary of the world's stepped clocks (grade film grain 12 fps, lantern 8, glow 7.5,
# particles 4/6, grass wind 3.5 — t = 2.0 is a boundary of all of them). The grain alone changed 216k px per step.
NIGHT_TIMES = [2.0 + (i + 0.5) / 60 for i in range(5)]


def check_night_freeze(raw, res):
    """Character-only engine-time dependence at night: key background, tod night, stage clock frozen (t=1), engine
    time varied over 1 s. Any figure change = the character reads engine uTime (glow / flicker) and cannot be
    freeze-tested; 0 = night pans of this character are exact."""
    frames, meta = load_job(raw, 'night-freeze')
    if not frames:
        return
    m = np.logical_or.reduce([mask_of(f) for f in frames])
    d = [int((np.any(frames[i] != frames[0], -1) & m).sum()) for i in range(1, len(frames))]
    res['night_freeze'] = {'frames': len(d), 'max_px': max(d) if d else 0, 'frames_changed': sum(1 for x in d if x),
                           'note': f"key bg, night, t=1 frozen, engine t {', '.join(f'{x:g}' for x in meta['times'])}: figure px changed vs the first "
                                   f"(> 0: the character runs on engine time, e.g. a uTime glow)"}


def single_frame_drawings(log, crops, changed):
    """Runs of the same drawing id (stage 'd' without the FX part, else the pose id) lasting <= 1 grid frame (2 samples
    at 60 Hz) whose image differs from both neighbouring runs. Excludes runs with a visible smear (contact keys) and
    clip switches (the clip differs from the previous or the next run). The first and last (cut) runs are skipped."""
    ids = []
    for e in log:
        if not e:
            ids.append(None); continue
        ids.append(e['d'].split('|')[0] if e.get('d') else (e['p'][0] if e.get('p') else None))
    if not ids or any(i is None for i in ids):
        return []
    runs, s0 = [], 0
    for i in range(1, len(ids) + 1):
        if i == len(ids) or ids[i] != ids[s0]:
            runs.append((s0, i)); s0 = i
    clip = lambda r: ids[r[0]].split(':')[0]
    out = []
    for k in range(1, len(runs) - 1):
        a, b = runs[k]
        if b - a > 2:
            continue
        if clip(runs[k]) != clip(runs[k - 1]) or clip(runs[k]) != clip(runs[k + 1]):
            continue
        if any(log[j] and any(tok.startswith('s') for tok in str(log[j].get('x') or '').split(',')) for j in range(a, b)):
            continue   # smear contact key
        # visible: differs from the previous run's last frame AND the next run's first frame
        if np.array_equal(crops[a], crops[a - 1]) or np.array_equal(crops[b - 1], crops[b]):
            continue
        out.append({'g': a // 2, 'id': ids[a], 'hold': (b - a) / 2})
    return out


def check_clip(raw, job, res, _nofx=False):
    frames, meta = load_job(raw, job)
    ci = char_info(meta)
    if not frames or not ci:
        res.setdefault('clips', {})[job[5:]] = {'error': 'no render'}
        return
    key = key_of(ci)
    log = ci.get('log') or []
    times = meta.get('times', [])
    # union mask bbox over the clip (crop region for diffs)
    masks = [mask_of(f, key) for f in frames]
    union = np.logical_or.reduce(masks)
    b = bbox(union)
    if b is None:
        res.setdefault('clips', {})[job[5:]] = {'error': 'empty'}; return
    x0, y0, x1, y1 = b
    crops = [f[y0:y1, x0:x1] for f in frames]
    changed = [False] + [not np.array_equal(crops[i], crops[i - 1]) for i in range(1, len(crops))]
    ndiff = [0] + [int(np.any(crops[i] != crops[i - 1], -1).sum()) for i in range(1, len(crops))]
    # changes in the upper half of the figure vs the legs (legIK 'frame' re-solves the legs every frame by design);
    # upper-body changes of <= SPECK px on a frame count as 'specks' (self-shadow texels sliding while travelling)
    split = int((y1 - y0) * 0.5)
    nup = [0] + [int(np.any(crops[i][:split] != crops[i - 1][:split], -1).sum()) for i in range(1, len(crops))]
    # grid check: sample i at (i+.5)/60 → a 30 Hz boundary lies between samples 2k-1 and 2k
    off = [i for i in range(1, len(crops)) if changed[i] and i % 2 == 1]
    log = align_log(log, times, len(frames))
    pids = [e['p'][0] if e and e.get('p') else None for e in log]
    # flicker uses the stage's DRAWING id when logged (pose id + redraw counter + FX grid frame, scenes/char-stage.js):
    # dynamics-only redraws (chains, lean) and stepped FX are legitimate changes without a new clip frame (lead)
    dids = [e.get('d') if e else None for e in log]
    if any(dids):
        pids = dids
    flick = []
    for i in range(1, len(crops)):
        if pids and i < len(pids) and pids[i] is not None and pids[i] == pids[i - 1] and changed[i]:
            flick.append((i, ndiff[i]))
    ch_idx = [i for i in range(1, len(crops)) if changed[i]]
    intervals = [(b_ - a_) / 2 for a_, b_ in zip(ch_idx, ch_idx[1:])]
    dur = len(frames) / 60.0
    c = {'frames_60hz': len(frames), 'changes': len(ch_idx), 'off_grid': len(off), 'off_grid_at': off[:12],
         'off_grid_upper': sum(1 for i in off if nup[i] > SPECK), 'off_grid_upper_specks': sum(1 for i in off if 0 < nup[i] <= SPECK), 'flicker_upper_px': sum(nup[i] for i, _ in flick if nup[i] > SPECK),
         'flicker_frames': len(flick), 'flicker_px': sum(n for _, n in flick), 'flicker_at': [i for i, _ in flick[:12]],
         'pose_ids': len(set(p for p in pids if p)),
         'intervals': summarize_intervals(intervals),
         'pose_rate_hz': round(len(ch_idx) / dur, 2) if dur else None,
         'height_px_max': int(y1 - y0)}
    sfd = single_frame_drawings(log, crops, changed)
    c['single_frame'] = len(sfd)
    c['single_frame_at'] = [f"g{x['g']} {x['id']}" for x in sfd[:8]]
    # small changes (1..3 px) between frames are suspicious (shimmer)
    c['tiny_changes'] = sum(1 for n in ndiff if 0 < n <= 3)
    # foot slide (only when the root travels)
    if log and log[0] and (log[0].get('fa') or log[0].get('f')) and ci.get('texel'):
        c.update(foot_slide(log, ci['texel'], ci.get('yaw', 45), ci.get('pitch', 30)))
        c['loco_plan'] = ci.get('locoPlan')   # (lead r6) fly/glide: foot_slide n/a
    name = job[5:]
    clipm = (ci.get('clips') or {}).get(name) or {}
    c['loop'] = bool(clipm.get('loop', name in ('game', 'walk', 'run', 'idle', 'turn')))
    c.update(readability(crops, [m[y0:y1, x0:x1] for m in masks], log, loco=name in LOCO, loop=c['loop'], at=meta['job']['q'].get('at', 0.25)))
    # (module fix T5) held one-shots: final_hold / hold_redraws from the fx=0 copy (charpack job nofx-<clip>), so FX
    # lifetimes neither shorten the static tail nor hide a real pop inside the hold
    nf, nmeta = load_job(raw, f'nofx-{name}') if not c['loop'] else (None, None)
    nci = char_info(nmeta) if nf else None
    if nf and nci and len(nf) == len(frames) and nmeta.get('times') == times:
        nmasks = [mask_of(f, key) for f in nf]
        nb = bbox(np.logical_or.reduce(nmasks))
        if nb is not None:
            ncrops = [f[nb[1]:nb[3], nb[0]:nb[2]] for f in nf]
            nlog = align_log(nci.get('log') or [], nmeta.get('times', []), len(nf))
            r2 = readability(ncrops, [m[nb[1]:nb[3], nb[0]:nb[2]] for m in nmasks], nlog, loco=False, loop=False, at=nmeta['job']['q'].get('at', 0.25))
            for k_ in ('tail_static_s', 'final_delta', 'hold_redraws', 'hold_redraws_at'):
                if k_ in r2:
                    c[k_] = r2[k_]
            c['hold_src'] = 'fx=0 copy'
    # (module fix T15) key-to-key difference: px changed between consecutive DRAWINGS (vs the figure area); gaits: how
    # many visually distinct drawings (figure cropped to its own bbox: translation-free) vs distinct pose ids
    drawn = [i for i in range(len(crops)) if i == 0 or changed[i]]
    area = max(1, int(np.median([m[y0:y1, x0:x1].sum() for m in masks])))
    # authored KEY changes only (pose id p changes; dynamics redraws and FX frames skipped); not idle/turn (breathing
    # and facing steps are small by design)
    pk = [str((log[i].get('p') or [None])[0]) if i < len(log) and log[i] else None for i in range(len(crops))]
    if name not in LOCO and name not in ('idle', 'turn') and len(drawn) > 2:
        dl = [(ndiff[i] / area, i) for i in drawn[1:] if pk[i] != pk[i - 1] and not (i < len(log) and log[i] and log[i].get('x'))]
        if dl:
            c['key_delta_min'], c['key_delta_at'] = round(min(dl)[0], 3), f"g{min(dl)[1] // 2}"
    if name in LOCO and len(drawn) > 8:
        late = [i for i in drawn if i >= len(crops) // 3]
        imgs, ids = [], set()
        for i in late:
            mb = bbox(masks[i])
            if mb is None:
                continue
            im = frames[i][mb[1]:mb[3], mb[0]:mb[2]]
            if not any(r.shape == im.shape and np.any(r != im, -1).sum() < 0.03 * area for r in imgs):   # same look within 3 %
                imgs.append(im)
            pp = (log[i].get('p') or [None])[0] if i < len(log) and log[i] else None
            if pp:
                ids.add(':'.join(x for x in str(pp).split(':')[:-1] if not x.startswith('k')))
        c['distinct_images'], c['distinct_ids'] = len(imgs), len(ids)
        # (module fix T16, part) head height per gait drawing (head joint screen y above the root, px, median over the
        # window): the bob each drawing shows, and a one-sided limp (mirror drawings k and k + n/2 at different heights)
        hh = {}
        for i in late:
            e = log[i] if i < len(log) else None
            pp = (e.get('p') or [None])[0] if e else None
            if not pp or not e.get('s') or not e['s'].get('h'):
                continue
            k = ':'.join(x for x in str(pp).split(':')[:-1] if not x.startswith('k'))
            hh.setdefault(k, []).append(e['s']['r'][1] - e['s']['h'][1])
        if len(hh) >= 2:
            ks = sorted(hh)
            c['head_y'] = {k.split(':')[-1]: round(float(np.median(v)), 1) for k, v in ((k, hh[k]) for k in ks)}
            vals = list(c['head_y'].values()); n_ = len(vals)
            # limp only for alternating biped walks (hops, gallops and two-footed bird runs are not mirror-symmetric)
            alt = ci.get('locoPlan') in (None, 'biped', 'bird') and str(ci.get('bodyPlan') or '') not in ('quadruped', 'hopper', 'limbless', 'blob') and all(k.split(':')[-2] == 'walk' for k in hh)
            c['head_limp'] = round(max(abs(vals[j] - vals[j + n_ // 2]) for j in range(n_ // 2)), 1) if n_ % 2 == 0 and alt else None
    # (module fix T2) islands (8-connected components >= 3 px) on every distinct drawing vs the clip's first frame
    dm = [masks[i][y0:y1, x0:x1] for i in range(len(masks)) if (i == 0 or changed[i]) and not (i < len(log) and log[i] and log[i].get('x'))]   # FX-visible frames skipped
    # (lead, wave 3) dm is empty when an FX is visible on every captured frame (a steady talk bubble from f0): no row
    # (it used to raise IndexError at isl[0] and abort the whole pack — requin, opal)
    if 0 < len(dm) <= 80:
        isl = [islands(m) for m in dm]
        c['islands_first'], c['islands_max'] = isl[0], max(isl)
    # (lead, wave 3) a steady talk bubble (fx speech look-ahead) is visible on every frame, so the FX-skipping rows above
    # find no frame: take islands / key_delta from the fx=0 copy (charpack job nofx-talk) instead
    if not _nofx and ('islands_max' not in c or 'key_delta_min' not in c) and os.path.exists(os.path.join(raw, f'nofx-{name}.json')):
        sub = {}
        check_clip(raw, f'nofx-{name}', sub, _nofx=True)
        sc = (sub.get('clips') or {}).get(name) or {}
        for k_ in ('islands_first', 'islands_max', 'key_delta_min', 'key_delta_at'):
            if k_ in sc and k_ not in c:
                c[k_] = sc[k_]
    if name == 'game':
        c.update(game_speed(log, ci, meta, c))
    res.setdefault('clips', {})[name] = c


LOCO = ('walk', 'run', 'game')


def shift_img(a, dx, dy, fill=0):
    """a shifted by (dx, dy) whole px (content moves right/down), zero-filled."""
    out = np.full_like(a, fill)
    H, W = a.shape[:2]
    xs0, xs1 = max(0, -dx), min(W, W - dx); ys0, ys1 = max(0, -dy), min(H, H - dy)
    if xs1 > xs0 and ys1 > ys0:
        out[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx] = a[ys0:ys1, xs0:xs1]
    return out


def readability(crops, masks, log, loco=False, loop=True, at=0.25):
    """How a clip reads when played at 30 Hz at 1x (tools round 05). Works on the 30 Hz grid frames (60 Hz sample 2k =
    grid frame k), every image aligned on the logged root px (a travelling root does not count as a change).
      strobe        longest run of consecutive grid frames that each change visibly (> SPECK px; loco: > SPECK px in the
                    upper half), smear-visible frames excluded. >= 3 = the eye sees 30 Hz boil, not held drawings.
      micro         visible changes of 1..5 px (not loco): redraws too small to read at 1x — single-pixel pops.
      hold_redraws  (actions) changes > 8 px inside one authored pose (same pose id p) with no FX visible: chain/
                    personality settles inside a key hold (critic rule: 0 in holds >= 6 frames).
      pose_delta    (actions) max silhouette change vs the first grid frame (idle lead-in), as a share of its area, and
                    how long (grid frames) the drawing that shows it is held: a key under 10 % or held < 4 frames does
                    not read at 1x.
      tail_static   (actions) seconds at the end with no change (die / vote end on a held pose).
      amplitude     (loops) max silhouette change between any two grid frames / area (talk, idle breathing)."""
    n = len(crops)
    G = list(range(0, n, 2))
    if len(G) < 3:
        return {}
    r = [tuple(int(round(v)) for v in e['s']['r']) if e and e.get('s') else (0, 0) for e in log] if log else [(0, 0)] * n
    if len(r) < n:
        r = r + [r[-1]] * (n - len(r))
    H = crops[0].shape[0]
    split = H // 2
    ch = []   # per grid frame k >= 1: (px, upper px)
    for a, b in zip(G, G[1:]):
        dx, dy = r[a][0] - r[b][0], r[a][1] - r[b][1]
        prev = shift_img(crops[a], -dx, -dy) if (dx or dy) else crops[a]
        d = np.any(prev != crops[b], -1)
        if dx or dy:   # ignore the zero-filled border
            d &= shift_img(np.ones(d.shape, bool), -dx, -dy)
        ch.append((int(d.sum()), int(d[:split].sum())))
    smear = [bool(log and log[b] and any(t.startswith('s') for t in str(log[b].get('x') or '').split(','))) for b in G[1:]]
    fxvis = [bool(log and ((log[a] and log[a].get('x')) or (log[b] and log[b].get('x')))) for a, b in zip(G, G[1:])]
    vis = [(u > SPECK) if loco else (px > SPECK) for px, u in ch]
    best = cur = 0
    for v, sm in zip(vis, smear):
        cur = cur + 1 if (v and not sm) else 0
        best = max(best, cur)
    out = {'strobe': best, 'grid_changes': sum(1 for px, _ in ch if px)}
    area_med = max(1, int(np.median([m.sum() for m in masks])))
    if loco:
        big = [px / area_med for px, _ in ch if px > SPECK]
        if big:
            out['draw_change_min'] = round(min(big), 3)
            out['draw_change_med'] = round(float(np.median(big)), 3)
    if not loco:
        out['micro'] = sum(1 for px, _ in ch if 0 < px <= 5)
    area0 = max(1, int(masks[0].sum()))
    if not loop and not loco:
        pids = [str((log[i].get('p') or [None])[0]) if log and log[i] else None for i in G]
        hr = []
        for k in range(1, len(G)):
            if pids[k] is not None and pids[k] == pids[k - 1] and ch[k - 1][0] > 8 and not fxvis[k - 1]:
                hr.append((k, ch[k - 1][0]))
        out['hold_redraws'] = len(hr)
        out['hold_redraws_at'] = [f'g{k} {px}px' for k, px in hr[:8]]
        m0 = masks[G[0]]
        xs = []
        for i in G:
            dx, dy = r[G[0]][0] - r[i][0], r[G[0]][1] - r[i][1]
            mi = shift_img(masks[i], dx, dy) if (dx or dy) else masks[i]
            xs.append(int((mi ^ m0).sum()))
        # drawings = runs of grid frames without a visible change; the readable key is the biggest change among
        # drawings held >= 4 grid frames (a 1-frame smear/contact key is not what the eye keeps at 1x)
        runs, st0 = [], 0
        for k in range(1, len(G) + 1):
            if k == len(G) or ch[k - 1][0] > SPECK:
                runs.append((st0, k - st0)); st0 = k
        held = [(xs[a_], n_, a_) for a_, n_ in runs if n_ >= 4]
        top = max(held) if held else max((xs[a_], n_, a_) for a_, n_ in runs)
        out['pose_delta'] = round(top[0] / area0, 3)
        out['pose_delta_hold'] = top[1]
        out['pose_delta_at'] = f'g{top[2]}'
        out['pose_delta_any'] = round(max(xs) / area0, 3)
        # isolated px on the action's held keys (critic: the parry's dotted sash was invisible to the idle-only
        # isolated_px row): speckle of every drawing held >= 4 grid frames minus the idle lead-in's
        sp0 = speckle_count(crops[G[0]], masks[G[0]])
        ks = [(speckle_count(crops[G[a_]], masks[G[a_]]) - sp0, a_) for a_, n_ in runs if n_ >= 4 and a_ > 0]
        if ks:
            kmax = max(ks)
            out['key_speckle'] = int(kmax[0]); out['key_speckle_at'] = f'g{kmax[1]}'; out['key_speckle_idle'] = int(sp0)
        last = max([k for k, (px, _) in enumerate(ch) if px > SPECK], default=-1)
        out['tail_static_s'] = round((len(ch) - 1 - last) / 30, 2)
        out['final_delta'] = round(xs[-1] / area0, 3)   # last frame vs the idle lead-in (back to idle = ~0)
    elif loop and not loco:
        ms = [masks[i] for i in G]
        amp = 0
        for i in range(len(ms)):
            for j in range(i + 1, len(ms)):
                amp = max(amp, int((ms[i] ^ ms[j]).sum()))
        out['amplitude'] = round(amp / area0, 3)
    return out


def game_speed(log, ci, meta, c):
    """The walk at the Clocktower game speed (charpack job 'game': clip walk, speed = 3.95 x height m/s unless
    spec.game.speed; the gait picks walk/run by Froude). Cycle from touchdowns of foot 0 at drawing changes, travel per
    cycle in body heights, holds between drawings in grid frames, the smallest visible change between drawings as a
    share of the figure (root-aligned): a gait whose drawings differ < 3 % reads as a gliding block at 1x."""
    H = float(ci.get('height') or 1.4)
    q = (meta.get('job') or {}).get('q') or {}
    v = float(q.get('speed', 0) or 0)
    rows = [(i, e) for i, e in enumerate(log) if e and (e.get('fa') or e.get('f'))]
    out = {'game_speed_ms': round(v, 3), 'game_h_per_s': round(v / H, 2) if H else None, 'game_px_per_s': round(v / ci['texel'], 1)}
    pid = [str((e.get('p') or [None])[0]) if e else None for e in log]
    ch_idx = [i for i in range(1, len(pid)) if pid[i] != pid[i - 1]]
    iv = [(b - a) / 2 for a, b in zip(ch_idx, ch_idx[1:])]
    out['game_holds'] = summarize_intervals(iv)
    lo, hi = GAME['hold']
    out['game_bad_holds'] = sum(1 for x in iv if x < lo or x > hi)
    # cycle: from the Character's gait pose ids '<gait>:<clip>:<frame>:<cycle n>' (the last field counts cycles): the
    # period = 60 Hz samples between increments of the cycle counter of the gait the game speed settles in, and the
    # drawings of the clip that are actually SHOWN per cycle (at 4 H/s a 6-drawing cycle that lasts 6 grid frames shows
    # every other drawing: half the drawings never reach the screen). Hop/skip gaits never plant a foot on two
    # drawings, so foot-0 touchdowns measured a 0.43 s 'cycle' for a 4-drawing loop every 8 grid frames (refs run 05);
    # touchdowns stay the fallback for clips without such ids.
    parsed = []
    for i in [0] + ch_idx:
        f = (pid[i] or '').split(':')
        if len(f) >= 4 and f[-1].lstrip('-').isdigit() and f[-2].lstrip('-').isdigit():
            parsed.append((i, f[0], int(f[-2]), int(f[-1])))
    if parsed:
        gname = parsed[-1][1]
        seq = [x for x in parsed if x[1] == gname]
        inc = [seq[k][0] for k in range(1, len(seq)) if seq[k][3] != seq[k - 1][3]]
        if len(inc) >= 3:
            cyc = float(np.mean(np.diff(inc[1:]))) / 60.0 if len(inc) >= 3 else None
            per, sets = [], []
            for c0, c1 in zip(inc[1:], inc[2:]):
                st_ = frozenset(x[2] for x in seq if c0 <= x[0] < c1)
                per.append(len(st_)); sets.append(st_)
            # the shown subset differs between cycles (0,2,4 then 1,3,5): the cycle beats against the 30 Hz grid and
            # the walk visibly changes shape every few cycles (aliasing), worse than a consistently short cycle
            out['game_alias'] = len(set(sets)) > 1 and min(per) < ((ci.get('gait') or {}).get(gname) or 99)
            out['game_shown_sets'] = ' '.join(''.join(str(v) for v in sorted(x)) for x in sets[:6])
            authored = (ci.get('gait') or {}).get(gname) or len({x[2] for x in seq})
            out['game_cycle_s'] = round(cyc, 3)
            out['game_h_per_cycle'] = round(v * cyc / H, 2) if H else None
            out['game_gait'] = gname
            out['game_shown_per_cycle'] = int(min(per)) if per else None
            out['game_drawings_per_cycle'] = int(authored)
            out['game_cycle_by'] = f'pose ids ({gname}: cycle counter, {min(per) if per else "?"}/{authored} drawings shown per cycle)'
            return out
    if rows:
        F = np.array([e.get('fa') or e['f'] for _, e in rows], np.float64)
        idx = [i for i, _ in rows]
        y = F[:, 0, 1]
        planted = y <= y.min() + 0.015
        pos = {i: k for k, i in enumerate(idx)}
        st = [pos[i] for i in ch_idx if i in pos]
        td = [idx[st[k]] for k in range(1, len(st)) if planted[st[k]] and not planted[st[k - 1]]]
        if len(td) >= 2:
            cyc = (td[-1] - td[0]) / (len(td) - 1) / 60.0
            out['game_cycle_s'] = round(cyc, 3)
            out['game_h_per_cycle'] = round(v * cyc / H, 2) if H else None
            out['game_cycle_by'] = 'foot 0 touchdowns'
    return out


def align_log(log, times, n):
    """One log entry per rendered frame: the LAST entry whose t matches the frame time (the engine also renders
    t=0 at start-up, and a frame may be rendered more than once)."""
    if not times:
        return (log[-n:] if len(log) >= n else log + [None] * (n - len(log)))
    by_t = {}
    for e in log:
        by_t[round(e['t'], 3)] = e
    return [by_t.get(round(t, 3)) for t in times[:n]]


def summarize_intervals(iv):
    if not iv:
        return ''
    out, prev, n = [], None, 0
    for v in iv:
        v = int(v) if float(v).is_integer() else v
        if v == prev:
            n += 1
        else:
            if prev is not None:
                out.append(f'{prev}x{n}' if n > 1 else f'{prev}')
            prev, n = v, 1
    out.append(f'{prev}x{n}' if n > 1 else f'{prev}')
    return ','.join(str(x) for x in out)[:80]


def foot_slide(log, texel, yaw=45.0, pitch=30.0):
    """Planted-foot slide in texels, measured where the eye sees it: at DRAWING changes (first 60 Hz frame of each new
    pose id `p`; legIK 'pose' holds the whole drawing while the root glides, so the 60 Hz frames inside a hold are not
    foot slide — the critics' 1.21 'FAIL' on the keeper was 0.0 at drawing changes). Every foot of `fa` (spec.feet /
    the 4 paws of a quadruped), else the L/R pair `f`.
      planted   the CONTINUOUS foot (fa − sd: drawn minus the figure's texel snap) is within 1.5 cm of its 20th-percentile
                height in both drawings
      foot_slide_px        the drawn foot's move on screen (camera right/up, Chebyshev, texels): what the viewer sees
      foot_world_px        the continuous foot's move (snap removed), same units
      foot_slide_60hz_px   the old per-frame number (inside holds; informative)"""
    rows = [e for e in log if e and (e.get('fa') or e.get('f'))]
    if len(rows) < 6:
        return {}
    F = np.array([e.get('fa') or e['f'] for e in rows], np.float64)   # N x feet x 3, drawn
    SD = np.array([e.get('sd') or [0, 0, 0] for e in rows], np.float64)
    Wc = F - SD[:, None, :]                                           # continuous world
    nfeet = F.shape[1]
    Y, Pt = np.radians(yaw), np.radians(pitch)
    Rv = np.array([np.cos(Y), 0, -np.sin(Y)]); Uv = np.array([-np.sin(Pt) * np.sin(Y), np.cos(Pt), -np.sin(Pt) * np.cos(Y)])
    scr = lambda dv: float(max(abs(dv @ Rv), abs(dv @ Uv)) / texel)
    pid = [str((e.get('p') or [None])[0]) for e in rows]
    starts = [0] + [i for i in range(1, len(rows)) if pid[i] != pid[i - 1]]
    worst, worldw, worst60, pairs, at = 0.0, 0.0, 0.0, 0, None
    # stance test: the gait's own 'shown planted' flag per foot (stage log fp, LegGait displayFeet) when logged — a
    # hop/skim foot passing low over the ground is NOT planted (the height test paired it and reported 17-24 texels
    # of 'slide' on hop gaits, refs run 05); else the height test
    FP = np.array([e.get('fp') if e.get('fp') and len(e['fp']) == nfeet else [-1] * nfeet for e in rows], np.int8)
    by = 'gait' if (FP >= 0).all(0).any() else 'height'
    for k in range(nfeet):
        y = Wc[:, k, 1]
        if (FP[:, k] >= 0).all():
            planted = FP[:, k] == 1
        else:
            planted = y <= np.percentile(y, 20) + 0.015   # 20th percentile: an idle lead-in may stand lower than the gait plants
        for a, b in zip(starts, starts[1:]):
            # a clip switch (idle → walk lead-in) re-poses the feet: a step-in pop, not slide (the hound's 'walk 7.3'
            # was its idle→walk switch; inside the gait its paws stay within 0.005 m)
            if pid[a].split(':')[0] != pid[b].split(':')[0]:
                continue
            if planted[a] and planted[b]:
                d = scr(F[b, k] - F[a, k])
                worldw = max(worldw, scr(Wc[b, k] - Wc[a, k]))
                pairs += 1
                if d > worst:
                    worst, at = d, (k, a, b)
        i = 0
        while i < len(planted):
            if planted[i]:
                j = i
                while j + 1 < len(planted) and planted[j + 1]:
                    j += 1
                if j - i >= 3:
                    worst60 = max(worst60, max(scr(F[x, k] - F[i, k]) for x in range(i, j + 1)))
                i = j + 1
            else:
                i += 1
    moved = float(np.linalg.norm(Wc[-1, 0, [0, 2]] - Wc[0, 0, [0, 2]])) / texel
    return {'foot_slide_px': round(worst, 2) if pairs else None, 'foot_world_px': round(worldw, 2) if pairs else None,
            'foot_slide_60hz_px': round(worst60, 2), 'stance_by': by,
            'foot_pairs': pairs, 'feet': int(nfeet),
            'foot_slide_at': None if at is None else {'foot': at[0], 'from': pid[at[1]], 'to': pid[at[2]]},
            'root_travel_px': round(moved, 1), 'drawings': len(starts)}

def check_slide(raw, res):
    """Foot slide of the travelling clips at the profile facing (charpack jobs slide-<clip>, dir 2)."""
    for js in sorted(glob.glob(os.path.join(raw, 'slide-*.json'))):
        job = os.path.basename(js)[:-5]
        frames, meta = load_job(raw, job)
        ci = char_info(meta)
        if not ci:
            continue
        log = align_log(ci.get('log') or [], meta.get('times', []), len(frames) or len(meta.get('times', [])))
        if log and log[0] and (log[0].get('fa') or log[0].get('f')):
            res.setdefault('slide', {})[job[6:]] = foot_slide(log, ci['texel'], ci.get('yaw', 45), ci.get('pitch', 30))


def mark_mask(img):
    r, g, b = (img[..., i].astype(np.int32) for i in range(3))
    return (r > 110) & (b > 110) & (g < 110) & (np.abs(r - b) < 90) & (r - g > 60)


def check_sig_parts(raw, res):
    """Every declared signature part (spec.signature list: slots or part names), from the charpack 'mark-<i>' renders
    (same layout as turn-key, those parts pure magenta): visible px per facing, isolated px inside the part (closed by 1),
    hi/mid share of the part's own tones per facing on the noon plain turnaround."""
    if '_turn' not in res:
        return
    img, m_all, ci = res['_turn']
    pf, _ = load_job(raw, 'turn-plain')
    plain = pf[0] if pf and pf[0].shape == img.shape else None
    H, W = m_all.shape
    pal = ci.get('palette') or {}
    pslot = ci.get('partSlots') or {}
    iso_all = isolated_map(img, m_all)
    out = []
    for i, it in enumerate(ci.get('sigList') or []):
        fr, meta = load_job(raw, f'mark-{i}')
        if not fr or fr[0].shape != img.shape:
            out.append({'name': it['name'], 'error': 'no mark render'}); continue
        if it['kind'] == 'part' and it['name'] not in (ci.get('partNames') or []) and \
                it['name'] not in {re.sub(r'[LR]\d*$', '', n) for n in (ci.get('partNames') or [])}:
            out.append({'name': it['name'], 'error': f"no part named '{it['name']}' (spec.parts names: {', '.join((ci.get('partNames') or [])[:12])}…)"}); continue
        mk = mark_mask(fr[0]) & m_all
        slot = it['name'] if it['kind'] == 'slot' else (pslot.get(it['name']) or next((v for k, v in pslot.items() if re.sub(r'[LR]\d*$', '', k) == it['name']), None))
        tones = pal.get(slot) if isinstance(slot, str) else None
        px, iso, tone, okf = [], [], [], 0
        for cell in ci['cells']:
            x0, y0, x1, y1 = cell_box(ci, cell, W, H)
            mm = np.zeros_like(mk); mm[y0:y1, x0:x1] = mk[y0:y1, x0:x1]
            px.append(int(mm.sum()))
            reg = erode(dilate(mm, 1), 1) & m_all
            iso.append(int((iso_all & reg).sum()))
            if tones and plain is not None and mm.any():
                lab_t = srgb_to_lab(np.array([hex2rgb(t) for t in tones]))
                lab = srgb_to_lab(plain[mm])
                idx = (((lab[:, None, :] - lab_t[None]) ** 2).sum(-1)).argmin(1)
                fr_ = float((idx <= min(1, len(tones) - 1)).mean())
                tone.append(round(fr_, 2)); okf += fr_ >= LIMITS['sig_tone']
            else:
                tone.append(None)
        out.append({'name': it['name'], 'kind': it['kind'], 'slot': slot, 'px': px, 'iso': iso, 'iso_max': max(iso), 'tone': tone,
                    'tone_ok_facings': okf})
    res['sig_parts'] = out


def _cells_px(fr, ci, m):
    H, W = m.shape
    out = []
    for cell in ci['cells']:
        x0, y0, x1, y1 = cell_box(ci, cell, W, H)
        out.append(int(m[y0:y1, x0:x1].sum()))
    return out


def check_identity(raw, res, jobs=None):
    """(module fix, wave 3: T25) identity rows the wave-3 critics measured by hand.
    sig_outside.<part>: px of a signature PART outside the body drawn without it (mark-<i> vs hide-<i>), per facing S..SW
      — a tail/beak/ear that never leaves the silhouette at a facing does not read there (mincut tail at S/N, polly beak).
    prop_area.<part>: visible px of each held prop in the held vote pose per facing (prop-<j>) — a flat card/paddle
      edge-on at most facings (6/8 wave-3 props)."""
    out = []
    for i in range(16):
        if jobs is not None and f'hide-{i}' not in jobs:
            continue
        fm, meta = load_job(raw, f'mark-{i}')
        fh, _ = load_job(raw, f'hide-{i}')
        ci = char_info(meta) if fm else None
        if not fm or not fh or not ci or fm[0].shape != fh[0].shape:
            continue
        it = (ci.get('sigList') or [{}] * 16)[i] if i < len(ci.get('sigList') or []) else {}
        if it.get('kind') != 'part':
            continue
        part = mark_mask(fm[0])
        body = mask_of(fh[0], key_of(ci))
        px = _cells_px(fm[0], ci, part & ~body)
        tot = _cells_px(fm[0], ci, part)
        out.append({'name': it['name'], 'px': px, 'tot': tot})
    res['sig_outside'] = out
    pr = []
    for j in range(8):
        if jobs is not None and f'prop-{j}' not in jobs:
            break   # stale prop renders of an earlier run
        fp, meta = load_job(raw, f'prop-{j}')
        ci = char_info(meta)
        if not fp or not ci:
            break
        px = _cells_px(fp[0], ci, mark_mask(fp[0]))
        name = str(meta['job']['q'].get('mark'))
        pr.append({'name': name, 'px': px})
    res['prop_area'] = pr


def check_feet(raw, res, jobs=None):
    """(module fix T16) visible px of each foot (parts on the foot bone and below, '@<bone>' mark) on every game-speed gait
    drawing (feet-<k>-<foot>), per facing: a buried / hem-covered / hidden contact foot shows ~0 px."""
    per = {}
    names = {}
    for p in sorted(glob.glob(os.path.join(raw, 'feet-*.json'))):
        job = os.path.basename(p)[:-5]
        if jobs is not None and job not in jobs:
            continue
        _, k, fi = job.split('-')
        fr, meta = load_job(raw, job)
        ci = char_info(meta)
        if not fr or not ci:
            continue
        names[int(fi)] = str(meta['job']['q'].get('mark', '@?'))[1:]
        per.setdefault(int(k), {})[int(fi)] = _cells_px(fr[0], ci, mark_mask(fr[0]))
    if per:
        res['feet'] = {'per': per, 'names': names}


def _labels(m):
    """8-connected component labels of a small boolean map (numpy min-propagation, as islands())."""
    H, W = m.shape
    lab = np.where(m, np.arange(1, H * W + 1).reshape(H, W), 0).astype(np.int64)
    big = H * W + 10
    while True:
        p = np.pad(np.where(m, lab, big), 1, constant_values=big)
        nb = np.min(np.stack([p[1 + dy:1 + dy + H, 1 + dx:1 + dx + W] for dy in (-1, 0, 1) for dx in (-1, 0, 1)]), 0)
        new = np.where(m, np.minimum(lab, nb), 0)
        if np.array_equal(new, lab):
            return lab
        lab = new


def _eye_shapes(m):
    """[(cx, shape crop)] per eye component (>= 2 px), left to right."""
    b = bbox(m)
    if b is None:
        return []
    c = m[b[1]:b[3], b[0]:b[2]]
    lab = _labels(c)
    out = []
    for v in np.unique(lab[c]):
        cm = lab == v
        if cm.sum() < 2:
            continue
        bb = bbox(cm)
        out.append((bb[0], cm[bb[1]:bb[3], bb[0]:bb[2]]))
    return sorted(out, key=lambda x: x[0])


def check_shimmer(raw, res, jobs=None):
    """(module fix T25b) face-detail stability: the eye slot magenta through the idle and talk loops (eyes-<clip>). At every
    change of the eye mask each eye (8-connected component, left to right) is re-aligned on its own bbox and the changed
    px / eye px measured. A rigid head move or turn gives 0; a blink / eye count change is skipped (counted apart); pupils
    re-rasterised into new shapes every drawing (preservation) give a high median."""
    out = {}
    for p in sorted(glob.glob(os.path.join(raw, 'eyes-*.json'))):
        job = os.path.basename(p)[:-5]
        if jobs is not None and job not in jobs:
            continue
        fr, meta = load_job(raw, job)
        if not fr:
            continue
        ms = [mark_mask(f) for f in fr]
        fracs, skipped, prev = [], 0, None
        for i, m in enumerate(ms):
            if i and np.array_equal(m, ms[i - 1]):
                continue
            cur = _eye_shapes(m)
            if prev is not None:
                if len(cur) != len(prev) or not cur:
                    skipped += 1
                else:
                    d = t = 0
                    for (_, a0), (_, b0) in zip(cur, prev):
                        h, w = max(a0.shape[0], b0.shape[0]), max(a0.shape[1], b0.shape[1])
                        a = np.zeros((h, w), bool); a[:a0.shape[0], :a0.shape[1]] = a0
                        b = np.zeros((h, w), bool); b[:b0.shape[0], :b0.shape[1]] = b0
                        d += int((a ^ b).sum()); t += int(max(a.sum(), b.sum()))
                    fracs.append(d / max(1, t))
            prev = cur
        out[job[5:]] = {'changes': len(fracs), 'skipped': skipped, 'median': round(float(np.median(fracs)), 2) if fracs else 0.0,
                        'max': round(max(fracs), 2) if fracs else 0.0, 'eye_px': int(np.median([m.sum() for m in ms]))}
    if out:
        res['shimmer'] = out


def check_sig_ground(raw, res):
    """Signature parts against the meadow, per scene copy (sun copy, pillar-shadow copy) at noon and golden: median
    colour of the parts in the real render (mask from scene-mark-<tod>: the signature parts magenta) vs the median grass
    in a 2..5 px ring around the whole figure (mask from scene-markall-<tod>: every slot magenta) — the ground the
    figure is actually seen against, shaded or lit. Want hue >= 30 deg or |L| >= 25 % (sun); the shade copy's parts
    L >= +15 % over the shaded grass."""
    out = []
    for tod in ('noon', 'golden'):
        fr, meta = load_job(raw, f'scene-{tod}')
        mf, _ = load_job(raw, f'scene-mark-{tod}')
        af, _ = load_job(raw, f'scene-markall-{tod}')
        ci = char_info(meta)
        if not fr or not mf or not af or not ci or not (fr[0].shape == mf[0].shape == af[0].shape):
            continue
        s_ = int((meta.get('info') or {}).get('scale', 2) or 2)
        img, mk_img, all_img = fr[0][::s_, ::s_], mf[0][::s_, ::s_], af[0][::s_, ::s_]
        real = mark_mask(img)
        mk = mark_mask(mk_img) & ~real
        fig = mark_mask(all_img) & ~real
        H, W = mk.shape
        hp = ci['height'] / ci['texel']
        names = '+'.join(i['name'] for i in (ci.get('sigList') or []))
        for cell in ci['cells']:
            x, y = int(cell['x']), int(cell['y'])
            box = np.zeros_like(mk); box[max(0, int(y - hp * 1.4)):min(H, int(y + hp * 0.3)), max(0, int(x - hp)):min(W, int(x + hp))] = True
            part, figc = mk & box, fig & box
            if part.sum() < 4 or figc.sum() < 20:
                continue
            ring = dilate(figc, 5) & ~dilate(figc, 2) & box
            gp = img[ring]
            if len(gp) < 10:
                continue
            shade = bool(cell.get('shade'))
            if shade:   # the pillar shadow covers part of the ring: compare with its darkest quarter (the shaded grass)
                lum = luma(gp[None])[0]
                gp = gp[lum <= np.percentile(lum, 25)]
            pp = img[part]
            if not shade:   # (module fix T3) sun copy: the LIT half of the part (its shaded side is not what reads against lit grass;
                pl_ = luma(pp[None])[0]                     # the all-px median PASSed golden copies whose lit tone failed)
                pp = pp[pl_ >= np.median(pl_)]
            pc = np.median(pp, 0); gc = np.median(gp, 0)
            lp, lg = srgb_to_lab(np.array([pc]))[0], srgb_to_lab(np.array([gc]))[0]
            hue = lambda l: np.degrees(np.arctan2(l[2], l[1])) % 360
            dh = abs((hue(lp) - hue(lg) + 180) % 360 - 180)
            dl = (lp[0] - lg[0]) / max(1.0, lg[0])
            # shade copy: a part 15 % lighter than the shaded grass reads; so does one 25 % DARKER (a dark hat in the
            # pillar shadow is a clear dark shape — the old 'L >= +15 %' rule warned on it; within +-15 % it is lost)
            ok = (dl >= 0.15 or dl <= -0.25) if shade else (dh >= 30 or abs(dl) >= 0.25)
            out.append({'name': names, 'tod': tod + ('-shade' if shade else '-sun'), 'value': f"dH {dh:.0f} dL {dl:+.0%}",
                        'status': 'PASS' if ok else 'WARN',
                        'note': f"part #{''.join('%02X' % int(v) for v in pc)} vs grass #{''.join('%02X' % int(v) for v in gc)} in a 2-5 px ring round the figure" + (' (darkest quarter)' if shade else '') + "; "
                                + ('shade copy wants L >= +15 % or <= -25 %' if shade else 'part = its lit half; sun copy wants hue >= 30 deg or |L| >= 25 %')})
    res['sig_ground'] = out


# (lead, wave 3) the Clocktower game clips (playbook Clocktower-only rule): point, ghost and ghost-spent were missing
# here, so 7/8 wave-3 members PASSed cast_clips without them. run is optional (Storyteller fast travel only).
CAST_CLIPS = ('idle', 'walk', 'talk', 'vote', 'point', 'die', 'ghost', 'ghost-spent')


def check_cast(res, ci):
    have = set((ci.get('clips') or {}).keys())
    emote = ci.get('emote')
    miss = [c for c in CAST_CLIPS if c not in have]
    if ci.get('name') == 'storyteller':
        # the Storyteller never votes, dies or becomes a ghost (playbook Storyteller note)
        miss = [c for c in miss if c not in ('vote', 'die', 'ghost', 'ghost-spent')]
    if not emote or emote not in have:
        miss.append(f'emote({emote or "spec.emote unset"})')
    res['cast'] = {'missing': miss, 'emote': emote}


def check_clip_ids(raw):
    return sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(raw, 'clip-*.json')))


def check_errors(raw, res, jobs=None):
    errs = {}
    for js in glob.glob(os.path.join(raw, '*.json')):
        if jobs is not None and os.path.basename(js)[:-5] not in jobs and os.path.basename(js) != 'meta.json':
            continue
        try:
            m = json.load(open(js))
        except Exception:
            continue
        if not isinstance(m, dict):
            continue
        e = m.get('errors') or []
        if e:
            errs[os.path.basename(js)[:-5]] = e[:5]
        info = m.get('info') or {}
        if os.path.basename(js) == 'turn-key.json' and info:
            res['programs'] = info.get('programs')
            st = info.get('stages', {})
            n = max(1, len((char_info(m) or {}).get('cells', [1])))
            res['draw_calls_per_char'] = {'color': round(st.get('color', 0) / n, 2), 'normal': round(st.get('normal', 0) / n, 2)}
        if os.path.basename(js).startswith('clip-') and m.get('bench'):
            res.setdefault('bench', {})[os.path.basename(js)[5:-5]] = m['bench']
    res['page_errors'] = errs


# ------------------------------------------------------------------------------------------------ verdicts
def verdicts(res):
    v = []
    def add(name, value, status, note=''):
        v.append({'check': name, 'value': value, 'status': status, 'note': note})
    t = res.get('turnaround', {})
    if 'height_px' in t:
        h = t['height_px']; lo, hi = h['range']
        st = 'PASS' if lo <= h['S'] <= hi and lo <= h['min'] and h['max'] <= hi else ('WARN' if lo - 4 <= h['S'] <= hi + 4 else 'FAIL')
        add('height_px', f"S {h['S']} (min {h['min']} max {h['max']})", st, f'target {lo:.0f}-{hi:.0f} at vh {t["vh"]} (bodyPlan {t.get("plan", "biped")})')
    if 'head_frac' in t and t.get('plan_head', LIMITS['head']):
        hf = t['head_frac']; lo, hi = t.get('plan_head') or LIMITS['head']
        add('head_frac', hf, 'PASS' if lo <= hf <= hi else 'WARN', f"{lo}-{hi} of height (head joint→top), plan {t.get('plan', 'biped')}")
    if 'area_rel' in t:
        a0, a1 = t['area_range']
        add('presence', f"{t['area_rel']:.0%} ({t['area_S']} px, w {t['width_px']['S']}-{t['width_px']['max']})",
            'PASS' if a0 <= t['area_rel'] <= a1 else 'WARN', f"silhouette area at S vs the mannequin; plan {t['plan']} wants {a0:.0%}-{a1:.0%} (cast reads at one size)")
    if 'colors' in t and 'slots' in t['colors']:
        sl = t['colors']['slots']
        worst = max((s['n'] for s in sl.values()), default=0)
        add('colors/slot', ' '.join(f'{k}:{s["n"]}' for k, s in sl.items()), 'PASS' if worst <= LIMITS['colors_per_slot'] else 'WARN',
            f"total {t['colors']['total']}; ≤3 tones + outline + rim per slot")
    if 'bw_px' in t:
        add('pure_black_white', t['bw_px'], 'PASS' if t['bw_px'] == 0 else 'WARN')
    if 'speckle_max' in t:
        add('speckle', t['speckle_max'], 'PASS' if t['speckle_max'] <= LIMITS['speckle'] else 'WARN', 'isolated px per figure (eyes count)')
    if 'facing_area_var' in t:
        fv = t['facing_area_var']
        add('facing_area_var', f'{fv:.0%}', 'PASS' if fv < LIMITS['facing_var'] else 'WARN', '< 40 %')
    if 'signature' in t:
        sg = t['signature']
        add('isolated_px', f"{sg['slot']} max {sg['isolated_max']} {sg['isolated_per_facing']}",
            'PASS' if sg['isolated_max'] <= LIMITS['sig_isolated'] else 'WARN',
            f"isolated px on the signature part per facing S..SW (slot from {sg['from']}); want <= {LIMITS['sig_isolated']}")
    fc = res.get('face', {})
    if fc.get('frac') is not None:
        add('face_lit', f"{fc['frac']:.0%} ({fc['lit']}/{fc['skin_px']})",
            'PASS' if fc['frac'] >= LIMITS['face_lit'] else 'WARN',
            'skin hi/mid share of face px, noon S/SE/SW: ' + ' '.join(f"{k} {v['frac']}" for k, v in fc['per_facing'].items()))
        vis = [v['vis'] for v in fc['per_facing'].values() if v.get('vis') is not None]
    if res.get('islands'):
        isl = res['islands']
        add('islands', max(isl.values()), 'PASS' if max(isl.values()) <= 1 else 'WARN',
            'connected parts of the figure per facing (>= 3 px; > 1 = a detached boot / prop / hat), S..SW: ' + ' '.join(str(v) for v in isl.values()))
    if fc and 'frac' in fc and fc['frac'] is not None:
        if vis:   # (module fix T4) a face mostly under a brim / beak scored 96 % lit on its few visible px
            add('face_visible', f"{min(vis):.0%}", 'PASS' if min(vis) >= 0.6 else 'WARN',
                ('visible face px / face px not under the hair/hood cover (face slot + cover rendered alone, job '
                 'face-cover; raw = face slot alone), S/SE/SW: ' +
                 ' '.join(f"{k} {v.get('skin')}/{v.get('uncov')} (raw {v.get('vis_raw', 0):.0%})" for k, v in fc['per_facing'].items())
                 if any('uncov' in v for v in fc['per_facing'].values()) else
                 'visible face px / unoccluded face px (face slot rendered alone, job face-solo), S/SE/SW: ' +
                 ' '.join(f"{k} {v.get('skin')}/{v.get('unocc')}" for k, v in fc['per_facing'].items())) + '; want >= 60 %')
    if 'deterministic' in t:
        add('deterministic', t['deterministic'], 'PASS' if t['deterministic'] else 'FAIL', f"idle turnaround t=1 → 1.5 → 1 identical ({t.get('det_px', 0)} px differ)")
    for dn, dv in (res.get('det') or {}).items():
        add(f'{dn}.deterministic', f"{dv['px']} px", 'PASS' if dv['px'] == 0 else 'FAIL',
            f"mid-action t={dv['t']:.3f} rendered fresh, after t+0.7 and again (re-simulation): figure px that differ")
    r = res.get('ring', {})
    if 'ring_outline_px' in r:
        st = 'PASS' if r['ring_outline_frac'] <= LIMITS['ring_frac'] and r.get('ring_key_frac', 0) <= 0.3 else 'FAIL'
        add('silhouette_line', f"{r['ring_outline_px']}/{r['ring_px']} ring px", st,
            f"outline px against the world (outlineDebug red); ring lined w/o world {r.get('ring_key_frac', 0):.0%} (inner lines; >30 % = silhouette line)")
        add('inner_lines', r['inner_outline_px'], 'PASS' if r['inner_outline_px'] > 0 else 'WARN', 'internal depth lines (want > 0)')
        add('edge_highlights', r['edge_highlight_px'], 'PASS' if r['edge_highlight_px'] == 0 else 'WARN', 'none on characters')
    if 'ring_luma_ratio' in r:
        rr = r['ring_luma_ratio']
        add('ring_luma', rr, 'PASS' if rr >= 0.9 else 'WARN', f"ring/inner luma on plain ground (dark ring frac {r['ring_dark_frac']:.0%})")
    for name, c in (res.get('clips') or {}).items():
        if 'error' in c:
            add(f'{name}', c['error'], 'FAIL'); continue
        legs_only = c['off_grid'] > 0 and c['off_grid_upper'] == 0
        add(f'{name}.off_grid', f"{c['off_grid']} (upper {c['off_grid_upper']}, specks {c['off_grid_upper_specks']})", 'PASS' if c['off_grid'] == 0 else ('WARN' if legs_only else 'FAIL'),
            f"changes {c['changes']} @ {c['pose_rate_hz']} Hz; intervals {c['intervals']}" + ('; legs/specks only (legIK frame, or self-shadow specks)' if legs_only else ''))
        fl_legs = c['flicker_px'] > 0 and c['flicker_upper_px'] == 0
        add(f'{name}.flicker', f"{c['flicker_px']} (upper {c['flicker_upper_px']})", 'PASS' if c['flicker_px'] == 0 else ('WARN' if fl_legs else 'FAIL'),
            f"{c['flicker_frames']} same-pose frames changed; tiny changes {c['tiny_changes']}")
        if 'key_delta_min' in c:   # (module fix T15)
            add(f'{name}.key_delta', f"{c['key_delta_min']:.0%} ({c['key_delta_at']})", 'PASS' if c['key_delta_min'] >= 0.01 else 'WARN',
                'smallest px change between consecutive AUTHORED keys / figure area (FX frames, dynamics redraws, idle and turn skipped); < 1 % = two keys that read as one drawing at 1x')
        if 'distinct_images' in c:
            add(f'{name}.distinct', f"{c['distinct_images']} images / {c['distinct_ids']} drawing ids", 'PASS' if c['distinct_images'] >= c['distinct_ids'] else 'WARN',
                'visually distinct drawings (figure cropped to its own bbox) vs distinct gait drawing ids in the last 2/3 of the window; fewer images = drawings that look identical (snail glide 4 ids, 1 look)')
        if c.get('head_y'):   # (module fix T16, part)
            hv = list(c['head_y'].values())
            lim = c.get('head_limp')
            add(f'{name}.head_bob', f"{max(hv) - min(hv):.1f} px" + (f", limp {lim}" if lim is not None else ''),
                'WARN' if (lim is not None and lim >= 3) or max(hv) - min(hv) < 1 else 'PASS',
                'head height above the root per gait drawing: ' + ' '.join(f"{k}:{v}" for k, v in c['head_y'].items()) +
                '; want a bob >= 1 px and, on alternating biped/bird walks, mirror drawings (k, k+n/2) within 3 px (one-sided limp; the 3/4 view alone gives a rolling waddle 2-3 px)')
        if 'islands_max' in c:   # (module fix T2) a drawing with more detached parts than the clip's first frame
            add(f'{name}.islands', f"{c['islands_first']} -> max {c['islands_max']}", 'PASS' if c['islands_max'] <= max(1, c['islands_first']) else 'WARN',
                'connected parts per distinct drawing (>= 3 px) vs the first frame: a new island = a part detached from the body (boot, prop, hat)')
        if 'single_frame' in c:
            add(f'{name}.single_frame', c['single_frame'], 'PASS' if c['single_frame'] == 0 else 'WARN',
                'x1 holds (not smear/clip switch)' + (': ' + ', '.join(c['single_frame_at']) if c['single_frame_at'] else ''))
        sl = (res.get('slide') or {}).get(name) or {}
        if 'foot_slide_px' in c and (c['root_travel_px'] > 4 or name == 'turn' or sl):
            vals = [x for x in (c['foot_slide_px'], sl.get('foot_slide_px')) if x is not None]
            worst = max(vals) if vals else None
            wworld = max(c.get('foot_world_px') or 0, sl.get('foot_world_px') or 0)
            note = (f"drawn planted foot, texels at drawing changes, {c.get('feet', 2)} feet, stance by {c.get('stance_by', 'height')}: dir {res.get('pack_dir', 1)} {c['foot_slide_px']} "
                    f"({c.get('foot_pairs', 0)} pairs)" + (f", dir 2 profile {sl['foot_slide_px']} ({sl.get('foot_pairs', 0)} pairs)" if sl else '') +
                    f"; snap removed {c.get('foot_world_px')}" + (f"/{sl.get('foot_world_px')}" if sl else '') +
                    f"; 60 Hz in-hold {c.get('foot_slide_60hz_px')}; root travel {c['root_travel_px']} px")
            hover = str(c.get('loco_plan') or '') in ('fly', 'glide')
            if hover and worst is not None and c.get('stance_by') != 'gait':
                # (lead r6) fly/glide LegGait plans never plant a foot: "stance by height" counted the moth's dangling legs
                st = 'WARN'; worst = 'n/a'
                note = f"locomotion.plan {c.get('loco_plan')}: no planted feet (hover/glide) — slide not applicable; judge the 1x game GIF; " + note
            elif worst is None:
                st = 'WARN'; worst = 'n/a'
                note = ('no foot is shown planted in two consecutive drawings (hop/skim/glide gait, or stance < 1 drawing): '
                        'slide not measurable — judge the 1x game GIF; ') + note
            else:
                # the drawn foot may step +-1 texel and back while planted: the figure snaps to whole texels, the
                # Character plants the continuous foot (motion backlog). > 1.5 texels drawn (a 2-px step) = real slide (the snap-removed number
                # is informative: it also moves ~1 texel when the plant target is re-solved per drawing).
                if worst > 1.5:
                    st = 'WARN' if name in ('turn', 'die') else 'FAIL'
                    if name == 'die':
                        # (lead, cast wave 2; tools T11) stance is decided by height, so a collapse / roll / leg fold
                        # counts as slide (goat, fox, honk 8.94, chonk 8.33, green-hood 3.13 all false FAILs). WARN, keep the number.
                        note = 'die: the collapse itself is counted (stance by height, T11) - judge planted feet before the fall key by eye; ' + note
                elif worst >= 0.95:
                    st = 'WARN'; note = '~1-texel jitter of a planted foot (texel snap / per-drawing re-plant); ' + note
                else:
                    st = 'PASS'
            add(f'{name}.foot_slide', worst, st, note)
        if 'strobe' in c:
            add(f'{name}.strobe', c['strobe'], 'PASS' if c['strobe'] < 3 else 'FAIL',
                'longest run of consecutive grid frames that each change (> 8 px; loco: upper half), smears excluded; want < 3')
        if c.get('micro'):
            add(f'{name}.micro', c['micro'], 'WARN', 'changes of 1-5 px: single-pixel pops, unreadable at 1x')
        if 'hold_redraws' in c:
            add(f'{name}.hold_redraws', c['hold_redraws'], 'PASS' if c['hold_redraws'] == 0 else 'WARN',
                'changes > 8 px inside one authored key (no FX visible)' + (': ' + ', '.join(c['hold_redraws_at']) if c['hold_redraws_at'] else ''))
        if 'pose_delta' in c:
            ok = c['pose_delta'] >= 0.10 and c['pose_delta_hold'] >= 4
            add(f'{name}.pose_read', f"{c['pose_delta']:.0%} x{c['pose_delta_hold']}", 'PASS' if ok else 'WARN',
                f"max silhouette change vs the idle lead-in ({c['pose_delta_at']}) and its hold in grid frames; 1x read wants >= 10 % held >= 4")
        if 'key_speckle' in c:
            add(f'{name}.key_speckle', f"+{c['key_speckle']} ({c['key_speckle_at']})", 'PASS' if c['key_speckle'] <= LIMITS['speckle'] else 'WARN',
                f"isolated px on the held action keys minus the idle lead-in ({c['key_speckle_idle']}); dotted lines / specks a key adds (want <= {LIMITS['speckle']})")
        if name in ('die', 'vote') and 'tail_static_s' in c:
            fd = c.get('final_delta', 1)
            add(f'{name}.final_hold', f"{c['tail_static_s']} s, {fd:.0%} off idle", 'PASS' if c['tail_static_s'] >= 0.3 and fd >= 0.10 else 'FAIL',
                'the end of the clip is still and is NOT the idle pose (die: collapsed, vote: paw/wing up); a one-shot that '
                'returns to idle and stands still has 0 % (needs clip.hold)' + ('; measured on the fx=0 copy (FX excluded, T5)' if c.get('hold_src') else ''))
        if 'amplitude' in c and name not in ('idle', 'turn'):
            add(f'{name}.amplitude', f"{c['amplitude']:.0%}", 'PASS' if c['amplitude'] >= 0.03 else 'WARN', 'loop: max silhouette change between drawings (talk gesture must read at 1x, >= 3 %)')
        if name == 'game' and 'game_speed_ms' in c:
            G_ = GAME
            cyc = c.get('game_cycle_s'); hpc = c.get('game_h_per_cycle'); med = c.get('draw_change_med')
            bad = []
            if cyc is None or not (G_['cycle'][0] <= cyc <= G_['cycle'][1]):
                bad.append(f'cycle {cyc} s')
            if c.get('game_alias'):
                bad.append(f"aliasing: the shown {c.get('game_gait')} drawings change between cycles ({c.get('game_shown_sets')})")
            if c['game_bad_holds']:
                bad.append(f"{c['game_bad_holds']} holds outside 2-4")
            if med is None or med < G_['min_change']:
                bad.append(f'drawings differ {med}')
            warn = hpc is not None and not (G_['h_per_cycle'][0] <= hpc <= G_['h_per_cycle'][1])
            sh_, au_ = c.get('game_shown_per_cycle'), c.get('game_drawings_per_cycle')
            if sh_ is not None and au_ and sh_ < au_:
                warn = True
                bad_skip = f'; only {sh_}/{au_} {c.get("game_gait")} drawings reach the screen per cycle (cycle shorter than drawings x hold: lock the cycle at game speed)'
            else:
                bad_skip = ''
            add('game.readable', f"{c['game_h_per_s']} H/s cyc {cyc} s {hpc} H/cyc", 'FAIL' if bad else ('WARN' if warn else 'PASS'),
                f"Clocktower speed {c['game_speed_ms']} m/s = {c['game_px_per_s']} px/s at vh 10; cycle by {c.get('game_cycle_by')}; holds {c['game_holds']}; drawing change med {med} min {c.get('draw_change_min')}"
                + (f"; FAIL: {', '.join(bad)}" if bad else '') + bad_skip + ('; travel/cycle outside 0.8-1.8 H' if (hpc is not None and not (G_['h_per_cycle'][0] <= hpc <= G_['h_per_cycle'][1])) else '') + ' (v2: 0.31 s, 1.2 H/cycle)')
    cc = res.get('cast')
    if cc:
        add('cast_clips', 'all' if not cc['missing'] else 'missing ' + ','.join(cc['missing']), 'PASS' if not cc['missing'] else 'FAIL',
            'cast preset: idle,walk,talk,vote,point,die,ghost,ghost-spent + emote; run optional (spec.emote ' + str(cc.get('emote')) + ')')
    for nm, key in (('night_freeze', 'night_freeze'), ('night_pan', 'night_pan')):
        nf = res.get(key)
        if nf and 'max_px' in nf:
            add(nm, f"{nf['max_px']} px ({nf['frames_changed']}/{nf['frames']} fr)", 'PASS' if nf['max_px'] == 0 else ('WARN' if nm == 'night_freeze' else 'FAIL'), nf['note'])
    for sg in res.get('sig_parts', []):
        if 'error' in sg:
            add(f"sig.{sg['name']}", sg['error'], 'WARN'); continue
        tone_ok = sg['tone_ok_facings'] >= 6
        add(f"sig.{sg['name']}", f"px min {min(sg['px'])} iso max {sg['iso_max']} lit {sg['tone_ok_facings']}/8",
            'PASS' if sg['iso_max'] <= LIMITS['sig_isolated'] and tone_ok and min(sg['px']) > 0 else 'WARN',
            f"{sg['kind']} '{sg['name']}' (slot {sg['slot']}): visible px/facing {sg['px']}, isolated {sg['iso']}, hi/mid share {sg['tone']} (want >= 50 % in >= 6/8)")
    for so in res.get('sig_outside', []):   # (module fix T25a)
        low = [DIRS[i] for i, (p, t) in enumerate(zip(so['px'], so['tot'])) if p < 3]
        add(f"sig_outside.{so['name']}", f"min {min(so['px'])} px, < 3 px at {len(low)}/8", 'PASS' if len(low) <= 2 else 'WARN',
            f"px of the part OUTSIDE the body drawn without it, per facing S..SW {so['px']} (part visible {so['tot']}); "
            f"a signature part inside the silhouette does not read at 1x{' (' + ' '.join(low) + ')' if low else ''}; want >= 3 px at >= 6/8")
    for pa in res.get('prop_area', []):     # (module fix T25c)
        mx = max(pa['px']) or 1
        if mx < 4:   # hidden in the vote hold by design (scaled-away story props, ghost shells): no facing to judge
            add(f"prop_area.{pa['name']}", f"max {max(pa['px'])} px", 'PASS', 'not shown in the held vote pose (hidden prop) - nothing to judge'); continue
        edge = [DIRS[i] for i, p in enumerate(pa['px']) if p < 0.35 * mx]
        add(f"prop_area.{pa['name']}", f"min {min(pa['px'])} max {mx} px, edge-on {len(edge)}/8", 'PASS' if len(edge) <= 2 and min(pa['px']) > 0 else 'WARN',
            f"visible px of the held prop in the held vote pose per facing S..SW {pa['px']}; < 35 % of its best facing = edge-on/hidden"
            f"{' (' + ' '.join(edge) + ')' if edge else ''}; want <= 2/8")
    ft = res.get('feet')
    if ft:                                  # (module fix T16)
        per, names = ft['per'], ft['names']
        ks = sorted(per)
        def at(dir_):
            return {k: [per[k].get(fi, [0] * 8)[dir_] for fi in sorted(names)] for k in ks}
        se = at(1)
        hidden = sum(1 for k in ks for v in se[k] if v < 2)
        nfeet = len(names)
        worst_foot = max(sum(1 for k in ks if se[k][j] < 2) for j in range(nfeet))   # drawings in which one foot is not drawn
        st = 'PASS' if worst_foot * 2 < len(ks) and all(any(v >= 2 for v in se[k]) for k in ks) else 'WARN'
        add('game.feet_visible', f"SE min {min(min(v) for v in se.values())} px, hidden {hidden}/{len(ks) * nfeet}", st,
            'visible px of each foot (' + ','.join(names[f] for f in sorted(names)) + ') per game-speed gait drawing, SE: ' +
            ' | '.join(f"k{k} " + '/'.join(str(v) for v in se[k]) for k in ks) + '; S: ' +
            ' | '.join(f"k{k} " + '/'.join(str(v) for v in at(0)[k]) for k in ks) + '; E: ' +
            ' | '.join(f"k{k} " + '/'.join(str(v) for v in at(2)[k]) for k in ks) +
            '; < 2 px = the foot is not drawn there (buried by squash, under the hem); want a foot in every drawing at SE and no foot hidden in half the drawings or more')
    for cn, sm in (res.get('shimmer') or {}).items():   # (module fix T25b)
        add(f'{cn}.face_shimmer', f"median {sm['median']:.0%} max {sm['max']:.0%}", 'WARN' if sm['median'] > 0.5 and sm['eye_px'] >= 30 else 'PASS',
            f"eye slot through {cn} ({sm['changes']} eye changes compared, {sm['skipped']} blink/count changes skipped, ~{sm['eye_px']} eye px): "
            "changed px / eye px per eye re-aligned on its own bbox (a rigid head move = 0); informative below 30 eye px (a 2x3 eye legitimately becomes 3x3 with any head turn); WARN = eyes >= 30 px whose shape changes > 50 % at most drawings (pupils re-rasterised into new shapes)")
    for sv in res.get('sig_ground', []):
        add(f"sig_ground.{sv['name']}.{sv['tod']}", sv['value'], sv['status'], sv['note'])
    pn = res.get('pan')
    if pn and 'max_px' in pn:
        add('pan', f"{pn['max_px']} px ({pn['frames_changed']}/{pn['frames']} fr)",
            'PASS' if pn['max_px'] == 0 and pn['shift_mismatch'] == 0 else 'FAIL',
            f"whole-texel camera pan {pn['pan']}/frame, frozen idle; best-shift diff over the figure box; shift != root's in {pn['shift_mismatch']} fr")
    elif pn:
        add('pan', pn.get('error'), 'WARN')
    if res.get('page_errors'):
        add('page_errors', sum(len(v) for v in res['page_errors'].values()), 'FAIL', ', '.join(res['page_errors']))
    else:
        add('page_errors', 0, 'PASS')
    if 'draw_calls_per_char' in res:
        d = res['draw_calls_per_char']
        add('draw_calls/char', f"color {d['color']} normal {d['normal']}", 'PASS' if d['color'] <= 2 else 'WARN', 'incl. shadow map in the first stage')
    return v


def run(pack, silhouette=False, jobs=None, cast=None, pack_dir=1):
    """jobs: names rendered in THIS run (charpack passes them; rows of other raw jobs are skipped, so an --only run
    never reports stale clip numbers). None = every job in raw/ (standalone use)."""
    raw = os.path.join(pack, 'raw')
    res = {'pack_dir': pack_dir}
    want = (lambda j: True) if jobs is None else (lambda j: j in jobs)
    if want('turn-key'):
        check_turnaround(raw, res, os.path.join(pack, 'turnaround-silhouette.png') if silhouette else None)
        check_ring(raw, res)
        check_face(raw, res)
        check_islands(res)
        check_sig_parts(raw, res)
    has = lambda pre: jobs is None or any(j.startswith(pre) for j in jobs)
    if has('hide-') or has('prop-'):
        check_identity(raw, res, jobs)  # (module fix T25)
    if has('feet-'):
        check_feet(raw, res, jobs)      # (module fix T16)
    if has('eyes-'):
        check_shimmer(raw, res, jobs)   # (module fix T25b)
    if want('pan'):
        check_pan(raw, res)
    for j in (jobs if jobs is not None else [os.path.basename(x)[:-5] for x in glob.glob(os.path.join(raw, 'det-*.json'))]):
        if j.startswith('det-'):
            fr, meta = load_job(raw, j)
            if len(fr) >= 3:
                m = mask_of(fr[0]) | mask_of(fr[2])
                res.setdefault('det', {})[j[4:]] = {'px': int((np.any(fr[0] != fr[2], -1) & m).sum()), 't': meta['times'][0]}
    if want('night-pan'):
        check_pan(raw, res, 'night-pan', 'night_pan')
    if want('night-freeze'):
        check_night_freeze(raw, res)
    if want('scene-mark-noon'):
        check_sig_ground(raw, res)
    check_slide(raw, res) if jobs is None else None
    if jobs is not None:
        for j in jobs:
            if j.startswith('slide-'):
                frames, meta = load_job(raw, j)
                ci = char_info(meta)
                if ci:
                    log = align_log(ci.get('log') or [], meta.get('times', []), len(meta.get('times', [])))
                    if log and log[0] and (log[0].get('fa') or log[0].get('f')):
                        res.setdefault('slide', {})[j[6:]] = foot_slide(log, ci['texel'], ci.get('yaw', 45), ci.get('pitch', 30))
    for job in check_clip_ids(raw):
        if want(job):
            check_clip(raw, job, res)
    if cast is not None:
        check_cast(res, cast)
    check_errors(raw, res, jobs)
    res.pop('_turn', None)
    res.pop('_sig_iso', None)
    res['verdicts'] = verdicts(res)
    return res


def table(res):
    lines = [f"{'check':<24} {'status':<5} {'value':<34} note"]
    for v in res['verdicts']:
        lines.append(f"{v['check']:<24} {v['status']:<5} {str(v['value']):<34} {v['note']}")
    n = {s: sum(1 for v in res['verdicts'] if v['status'] == s) for s in ('PASS', 'WARN', 'FAIL')}
    lines.append(f"-- {n['PASS']} pass, {n['WARN']} warn, {n['FAIL']} fail")
    return '\n'.join(lines)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__); sys.exit(2)
    pack = args[0]
    res = run(pack, silhouette='--silhouette' in sys.argv)
    json.dump(res, open(os.path.join(pack, 'charcheck.json'), 'w'), indent=1)
    if '--json' in sys.argv:
        print(json.dumps(res))
    else:
        print(table(res))
        print('wrote', os.path.join(pack, 'charcheck.json'))
