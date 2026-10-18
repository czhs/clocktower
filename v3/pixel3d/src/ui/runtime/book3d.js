// The 3D big book for a LIVE game page in a few draw calls (src/ui/runtime, additive to the asset library; first user:
// the Hollowmere demo, src/demo/gameui.js). The same book as src/ui/notebook/book3d.js (same model, poses, placement,
// per-book depth bias, materials, light, shadow and outline), drawn differently:
//   book3d.js createBook3D keeps the model as ~25 meshes (boards, page blocks, corners, spine, 5 leaves x sheet + print,
//   quill parts, ink) re-posed every drawing; each visible mesh costs a draw in the color pass, the normal / outline pass
//   and the shadow map: about +120 calls per open book in the demo (critic, demo UI r1).
//   Here a book is ONE mesh per material (leather, page, gold, ribbon, ink, print, quill, nib: at most 8). Each DRAWING
//   (a discrete pose: book3d.js BIG3D_DRAWINGS, 19 of them, at a model scale k) is merged once from a pose rig (a
//   createBook3D instance that is never added to a scene) into one geometry per material, in the book's tilt frame,
//   cached and shared by every reader; a reader's book swaps geometries when its drawing changes. The outline / normal
//   pass reads depth + normals + the per-material outline flag, so merging same-material parts changes no pixel.
//
//   installMergedBooks(hud, { yaw, visualH }) -> ctx   puts this context on hud._book3d BEFORE notebookContext(hud)
//        (src/ui/notebook/draw.js) runs, which then uses it instead of book3dContext (it returns hud._book3d when set).
//        ctx has the book3dContext contract: { books, view, add(fn), drawReader3d(view, m, opts) } + prewarm(k).
//   createMergedBook3D(engine, { mats, scale }) -> { root, mats, pose, k, setPose(pose), place(pl) }
//   prewarmMerged(engine, k)   merges every drawing at scale k (call behind a loading screen: no merge mid-game)
import * as THREE from 'three';
import { createBook3D, bookMaterials, placeBook3D, book3dState, bookPose, PLACE3D, BIG3D_DRAWINGS } from '../notebook/book3d.js';

const _merged = new Map();            // pose key -> { [material kind]: BufferGeometry }
let _rig = null;                       // the pose rig (one per page; its own materials never render)
const EMPTY = new THREE.BufferGeometry();
const poseKey = (p, k) => `${p.s}|${p.lift}|${p.phi}|${(p.leaves || []).map((l) => l.join(',')).join(';')}|${p.quill ?? '-'}|${k}`;

/** Concatenate non-indexed position + normal geometries (book3d.js / chars kit geometry: flat, position + normal). */
function concat(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    o += g.attributes.position.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

/** The merged geometries of one drawing (pose p at model scale k), in the book's tilt frame. */
export function mergedGeometry(engine, p, k = PLACE3D.scale) {
  const key = poseKey(p, k);
  const hit = _merged.get(key);
  if (hit) return hit;
  _rig ??= createBook3D(engine, {});
  _rig.k = k;
  _rig.setPose(p);
  const tilt = _rig.root.children[0];
  _rig.root.position.set(0, 0, 0); _rig.root.rotation.set(0, 0, 0); tilt.rotation.set(0, 0, 0);
  _rig.root.updateMatrixWorld(true);
  const kindOf = new Map(Object.entries(_rig.mats).filter(([, m]) => m?.isMaterial).map(([n, m]) => [m, n]));
  const parts = {};
  tilt.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const kind = kindOf.get(o.material);
    if (!kind) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g = g.applyMatrix4(o.matrixWorld);                 // tilt is identity at the root: matrixWorld = the tilt frame
    (parts[kind] ??= []).push(g);
  });
  const out = {};
  for (const [kind, geos] of Object.entries(parts)) { out[kind] = concat(geos); for (const g of geos) g.dispose(); }
  _merged.set(key, out);
  return out;
}

/** Merge every drawing at scale k now (19 merges; behind the loading screen). */
export function prewarmMerged(engine, k = PLACE3D.scale) {
  for (const [ph, f] of BIG3D_DRAWINGS) mergedGeometry(engine, bookPose(ph, f), k);
  return _merged.size;
}

/** One book as at most one mesh per material (see the file head). Same interface as book3d.js createBook3D. */
export function createMergedBook3D(engine, { mats = null, ghost = false, scale = PLACE3D.scale } = {}) {
  const M = mats || bookMaterials(engine, { ghost });
  const root = new THREE.Group(); root.name = 'book3d';
  const tilt = new THREE.Group(); root.add(tilt);
  const meshes = {};
  for (const [kind, m] of Object.entries(M)) {
    if (!m?.isMaterial) continue;
    const o = new THREE.Mesh(EMPTY, m);
    o.castShadow = !M.ghost; o.receiveShadow = false; o.visible = false; o.name = `book3d-${kind}`;
    tilt.add(o); meshes[kind] = o;
  }
  const book = {
    root, mats: M, pose: null, k: scale,
    setPose(p) {
      book.pose = p;
      const G = mergedGeometry(engine, p, book.k);
      for (const [kind, o] of Object.entries(meshes)) { const g = G[kind]; o.visible = !!g; o.geometry = g || EMPTY; }
      return book;
    },
    place(pl) {
      root.position.copy(pl.pos);
      root.rotation.set(0, pl.yaw, 0, 'YXZ');
      tilt.rotation.set(-pl.tilt, 0, 0);
      return book;
    },
  };
  book.setPose(bookPose('hold', 0));
  return book;
}

/**
 * book3d.js book3dContext with merged books (same placement, bias and visibility rules; see there). Installed on
 * hud._book3d so notebookContext picks it up. opts: { yaw() (camera yaw, rad), visualH: { id: m } }.
 */
export function installMergedBooks(hud, { yaw, visualH = {} } = {}) {
  if (hud._book3d) return hud._book3d;
  const engine = hud.engine;
  if (!engine?.pipeline) return null;
  const fns = [], books = new Map();
  let frame = 0;
  const view = { book3d: true, t: 0, get tok() { return hud.tok; } };
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  const depth = (p) => tmp.copy(p).dot(fwd);
  const ctx = {
    books, view, merged: true,
    add(fn) { fns.push(fn); return fn; },
    prewarm(k = PLACE3D.scale) { return prewarmMerged(engine, k); },
    drawReader3d(V, m, opts = {}) {
      const s = book3dState(V.t, opts);
      if (!s || !m) return null;
      const ghost = !!(opts.ghost ?? m.ghost);
      let e = books.get(m);
      if (e && e.ghost !== ghost) { engine.scene.remove(e.book.root); e = null; }
      if (!e) {
        const bias = { value: 0 };
        e = { ghost, bias, book: createMergedBook3D(engine, { mats: bookMaterials(engine, { ghost, bias }) }), frame: 0 };
        engine.scene.add(e.book.root);
        books.set(m, e);
      }
      const face = opts.face ?? m.face ?? m.actor?.st?.face ?? 0, cy = yaw ? yaw() : 0;
      const pl = placeBook3D(m.pos, face, cy, { ghost });
      if (opts.at) pl.pos = opts.at.clone();
      e.book.k = opts.scale ?? PLACE3D.scale;
      e.book.setPose(bookPose(s.phase, s.f)).place(pl);
      e.book.root.visible = true;
      engine.camera.snapObjectToTexel(e.book.root, { once: true });
      engine.camera.cam.getWorldDirection(fwd);
      const H = visualH[m.id] ?? m.height ?? 1.3;
      const centre = m.pos.clone(); centre.y += H * 0.5 + (ghost ? PLACE3D.ghostLift : 0);
      const P = PLACE3D;
      e.bias.value = Math.max(0, depth(e.book.root.position) + P.bookR * e.book.k - (depth(centre) - P.readerR) + P.gap);
      e.frame = frame;
      return { ...s, style: opts.at ? 'held3d' : 'big', dir: dirName(face - cy), pl };
    },
  };
  engine.onUpdate((tE) => {
    frame++;
    view.t = hud.clock ? hud.clock(tE) : tE;
    for (const fn of fns) fn(view);
    for (const e of books.values()) if (e.frame !== frame) e.book.root.visible = false;
  });
  hud._book3d = ctx;
  return ctx;
}
const dirName = (rel) => ['down', 'down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left'][((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
