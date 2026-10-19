// Runtime access to the baked portrait atlases (owner: portraits group): out/ui/portraits.{png,json} (icons + avatars)
// and out/ui/cast-portraits.{png,json} (the v2 strip). Browser only; deterministic (pure lookups).
//
//   const P = await loadPortraits();
//   P.icon('frog')  P.icon('rabbit', 'ghost')  P.avatar('owl', 'dead')  P.cell('fox', 0..4)  P.cell('fox/ghost')
//   P.walkFrame(t) -> 1..4 for a picker playing the walk in place (walk1..4 at 15 fps = game speed);
//   P.walkFrame(t, 'v2') -> the v2 picker cadence (castPortrait.ts: a step every 140 ms -> 4 grid frames = 7.5 fps)
//   loadPortraits(base, 'night') -> the night icon/avatar atlas (portraits-night.*: tier-A icons follow the scene tod)
import { PixelImage, loadImage, frameAt, withHD } from '../kit.js';

const promises = new Map();
/**
 * opts.hd (wave 1, D=2; docs/UI.md §2.10): also load the HD atlas (portraits-hd{,-night}.*, src/ui/portraits/hd.js) and
 * attach it: every icon() / avatar() crop carries `.hd` (its 24x24 / 48x48 re-render), so a density view blits the
 * HD portrait with no other change; + iconHD(id, v) / avatarHD(id, v) (also the roster ids that have no 1x frame:
 * wanderer, keeper, hound, duelist) and goldFrame(avatar) keeps the HD twin. A missing HD atlas = the 1x behaviour.
 */
export function loadPortraits(base = 'out/ui/', tod = 'noon', { hd = false } = {}) {
  if (hd) return loadPortraitsWithHD(base, tod);
  const name = tod === 'night' ? 'portraits-night' : 'portraits';
  const key = base + name;
  if (!promises.has(key)) promises.set(key, (async () => {
    const [pj, cj, pi, ci] = await Promise.all([
      fetch(base + name + '.json').then((r) => r.json()), fetch(base + 'cast-portraits.json').then((r) => r.json()),
      loadImage(base + name + '.png'), loadImage(base + 'cast-portraits.png')]);
    const cache = new Map();
    const crop = (key, img, x, y, w, h) => {
      let v = cache.get(key);
      if (!v) { v = img.crop(x, y, w, h); cache.set(key, v); }
      return v;
    };
    const fr = (name) => { const r = pj.frames[name]; return r ? crop(name, pi, r.x, r.y, r.w, r.h) : null; };
    const suffix = (v) => (v && v !== 'alive' ? `/${v}` : '');
    return {
      json: pj, castJson: cj,
      /** 12x12 icon (anchor 6,6). variant: alive | ghost | ghost-spent | dead (players only; falls back to alive). */
      icon: (id, v) => fr(`icon_${id}${suffix(v)}`) || fr(`icon_${id}`),
      /** 24x24 avatar (anchor 12,12). */
      avatar: (id, v) => fr(`avatar_${id}${suffix(v)}`) || fr(`avatar_${id}`),
      /** 32x40 cast-portraits cell: key = id | id/ghost | id/ghost-spent | id/dead, i = frame (0 idle, 1..4 walk). */
      cell: (key, i = 0) => {
        const s = cj.sheets[key] || cj.sheets[key.split('/')[0]];
        if (!s) return null;
        const k = Math.min(i, s.frames - 1);
        return crop(`cell:${key}:${k}`, ci, s.x + k * cj.frameWidth, s.y, cj.frameWidth, cj.frameHeight);
      },
      frames: (key) => (cj.sheets[key]?.frames ?? 0),
      /** walk-in-place drawing at time t (s): walk1..4 held 2 grid frames (15 fps, game speed); 'v2' = 4 (7.5 fps). */
      walkFrame: (t, cadence = 'game') => 1 + frameAt(t, cadence === 'v2' ? 7.5 : 15, 4),
    };
  })());
  return promises.get(key);
}

/** Recolour a 24x24 avatar's frame into the gold "dock button" frame (v2: your portrait in a gold ring). */
export function goldFrame(av, T) {
  const im = av.clone();
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    if (!im.alpha(x, y)) continue;
    if (x === 0 || y === 0 || x === 23 || y === 23) im.set(x, y, T.goldLine);
    else if (x === 1 || y === 1) im.set(x, y, T.goldHi);
    else if (x === 22 || y === 22) im.set(x, y, T.goldSh);
  }
  if (av.hd) withHD(im, goldFrameHD(av.hd, T));        // (wave 1) the HD twin travels along (1x pixels unchanged)
  return im;
}

// ------------------------------------------------------------------------------------------------ D=2 (wave 1)
/**
 * The gold "dock button" frame on a 48x48 HD avatar (goldFrame at D=2): the 1-px ring -> goldLine, a 2-px bevel inside
 * it (goldHi top / left, goldSh bottom / right, gold where they meet), following the rounded [2, 1] corners.
 */
export function goldFrameHD(av, T) {
  const im = av.clone(), N = av.w;
  const out = (x, y) => x < 0 || y < 0 || x >= N || y >= N || !av.alpha(x, y);
  const ring = (x, y) => !out(x, y) && (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (out(x, y)) continue;
    if (ring(x, y)) { im.set(x, y, T.goldLine); continue; }
    const t = Math.min(x, y), b = Math.min(N - 1 - x, N - 1 - y);
    if (t <= 2 && t < b) im.set(x, y, t === 1 ? T.goldHi : T.gold);
    else if (b <= 2 && b < t) im.set(x, y, b === 1 ? T.goldSh : T.gold);
    else if (t <= 2 && b <= 2) im.set(x, y, T.gold);
  }
  return im;
}
const hdPromises = new Map();
/**
 * The HD (D=2) portraits atlas alone: out/ui/portraits-hd.{png,json} (night: portraits-hd-night.*), baked by
 * tools/uibake.sh portraits:portraits-hd[-night]. icon(id, v) 24x24, avatar(id, v) 48x48 (same names / variants as
 * the 1x loader), ids = every roster id (incl. the four without a 1x portrait). Rejects when the atlas is missing.
 */
export function loadPortraitsHD(base = 'out/ui/', tod = 'noon') {
  const name = tod === 'night' ? 'portraits-hd-night' : 'portraits-hd';
  const key = base + name;
  if (!hdPromises.has(key)) hdPromises.set(key, (async () => {
    const [j, im] = await Promise.all([fetch(base + name + '.json').then((r) => { if (!r.ok) throw new Error(`${name}.json ${r.status}`); return r.json(); }), loadImage(base + name + '.png')]);
    const cache = new Map();
    const fr = (n) => { let v = cache.get(n); if (v === undefined) { const r = j.frames[n]; v = r ? im.crop(r.x, r.y, r.w, r.h) : null; cache.set(n, v); } return v; };
    const suffix = (v) => (v && v !== 'alive' ? `/${v}` : '');
    return {
      json: j, ids: j.meta?.ids ?? [], density: j.meta?.density ?? 2,
      icon: (id, v) => fr(`icon_${id}${suffix(v)}`) || fr(`icon_${id}`),
      avatar: (id, v) => fr(`avatar_${id}${suffix(v)}`) || fr(`avatar_${id}`),
    };
  })());
  return hdPromises.get(key);
}
const withPromises = new Map();
function loadPortraitsWithHD(base, tod) {
  const key = base + tod;
  if (!withPromises.has(key)) withPromises.set(key, (async () => {
    const [P, H] = await Promise.all([loadPortraits(base, tod), loadPortraitsHD(base, tod).catch((e) => { console.warn('[portraits] no HD atlas:', e?.message || e); return null; })]);
    if (!H) return { ...P, hd: null, iconHD: () => null, avatarHD: () => null };
    const tag = (im, hd) => { if (im && hd && !im.hd) withHD(im, hd); return im; };
    return {
      ...P, hd: H,
      icon: (id, v) => tag(P.icon(id, v), H.icon(id, v)),
      avatar: (id, v) => tag(P.avatar(id, v), H.avatar(id, v)),
      /** 24x24 HD icon (null when the HD atlas lacks it). */
      iconHD: (id, v) => H.icon(id, v),
      /** 48x48 HD avatar. */
      avatarHD: (id, v) => H.avatar(id, v),
    };
  })());
  return withPromises.get(key);
}

export { PixelImage };
