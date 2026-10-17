// Runtime access to the baked portrait atlases (owner: portraits group): out/ui/portraits.{png,json} (icons + avatars)
// and out/ui/cast-portraits.{png,json} (the v2 strip). Browser only; deterministic (pure lookups).
//
//   const P = await loadPortraits();
//   P.icon('frog')  P.icon('rabbit', 'ghost')  P.avatar('owl', 'dead')  P.cell('fox', 0..4)  P.cell('fox/ghost')
//   P.walkFrame(t) -> 1..4 for a picker playing the walk in place (walk1..4 at 15 fps = game speed);
//   P.walkFrame(t, 'v2') -> the v2 picker cadence (castPortrait.ts: a step every 140 ms -> 4 grid frames = 7.5 fps)
//   loadPortraits(base, 'night') -> the night icon/avatar atlas (portraits-night.*: tier-A icons follow the scene tod)
import { PixelImage, loadImage, frameAt } from '../kit.js';

const promises = new Map();
export function loadPortraits(base = 'out/ui/', tod = 'noon') {
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
  return im;
}

export { PixelImage };
