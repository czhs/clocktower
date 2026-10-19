// Port-mode 3D big book (owner: notebook group; docs/UI.md §6 "3D big book"): draws the BAKED sprites of the 3D book
// (bookbig_<dir>_<phase>_<f> from out/ui/notebook{,-night}.{png,json}, rendered by bake3d.js) the way the 2D v2 game
// would: at the reader's feet minus the per-dir anchor (meta.bigBook.anchors[dir]). Used by the mock HUD option
// ?book=bigsprite to compare the port sprites with the live 3D book (same placement, same timing).
//   await preloadPortBook(tod)          (once, in an async setup: the atlas must be in memory before the first still)
//   drawPortBook(L, m, opts, yaw)       on L.world (tier A; the game uses avatar depth + epsilon instead)
import { loadImage } from '../kit.js';
import { book3dState, big3dFrameName } from './book3d.js';

const _atlas = new Map();
const nameOf = (tod) => (tod === 'night' ? 'notebook-night' : 'notebook');
/** Load out/ui/notebook{,-night}.{png,json} (cached). Resolves to { img, json, frames: Map } or null when missing. */
export async function preloadPortBook(tod = 'noon') {
  const n = nameOf(tod);
  if (!_atlas.has(n)) _atlas.set(n, (async () => {
    try {
      const json = await (await fetch(`out/ui/${n}.json`)).json();
      const img = await loadImage(`out/ui/${n}.png`);
      const a = { img, json, frames: new Map() };
      _atlas.set(n, a);
      return a;
    } catch (e) { console.warn(`port3d: ${n} atlas missing (${e.message})`); _atlas.set(n, null); return null; }
  })());
  return _atlas.get(n);
}
function frame(a, name) {
  if (!a.frames.has(name)) { const r = a.json.frames[name]; a.frames.set(name, r ? a.img.crop(r.x, r.y, r.w, r.h) : null); }
  return a.frames.get(name);
}
const dirName = (rel) => ['down', 'down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left'][((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];

/** Draw one reader's baked big book on L.world. Returns the state (or null: closed / atlas not loaded). */
export function drawPortBook(L, m, opts = {}, yaw = 0, tod = 'noon') {
  const a = _atlas.get(nameOf(tod));
  if (!a || a instanceof Promise || !m) return null;
  const s = book3dState(L.t, opts);
  if (!s) return null;
  const ghost = !!(opts.ghost ?? m.ghost), face = opts.face ?? m.face ?? m.actor?.st?.face ?? 0, dir = dirName(face - yaw);
  const img = frame(a, big3dFrameName(dir, s, ghost)), A = a.json.meta?.bigBook?.anchors?.[dir];
  if (!img || !A) return null;
  const q = L.at(m.pos);
  L.world.blit(img, q.x - A.x, q.y - A.y);
  return { ...s, style: 'bigsprite', dir, x: q.x, y: q.y };
}
