// Port bake of the 3D big book (owner: notebook group; docs/UI.md §6 "3D big book"). Renders book3d.js through the real
// pixel3d pipeline (toon ramp, outlines, edge highlights, texel snap) from the GAMEPLAY camera (yaw 0, pitch 30°,
// orthographic, vh 12 = 30 texels per metre at 640x360) into PixelImages, one per facing x drawing:
//   bookbig_<dir>_<phase>_<f>, bookbigghost_<dir>_<phase>_<f>   (dirs = v2 point dir names, drawings = BIG3D_DRAWINGS)
// Each copy is placed exactly as the live book (placeBook3D) relative to a virtual reader whose FEET stand on a grid cell
// of the frame, so the anchor of every frame is the reader's feet: the 2D game draws it at feet - anchors[dir].
// Frames of one dir share one cell (the union of every drawing of that dir, alive + ghost, + 1 px), so the sprite never
// jumps between drawings. Lit like the mock HUD (sky.js preset + sunFor(tod)); no ground, no grade, key background
// (keyed to alpha 0, the outline pass never paints the background). Must run in a capture=1 page (tools/uibake.mjs).
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../../world/sky.js';
import { PixelImage } from '../kit.js';
import { createBook3D, bookMaterials, bookPose, placeBook3D, faceOfDir, DIRS3D, BIG3D_DRAWINGS } from './book3d.js';

const KEY = '#00FF00';
export const BAKE3D = { vh: 12, pitch: Math.PI / 6, cellW: 72, cellH: 60, feetY: 38 };

function grab(engine) {
  const c = engine.renderer.domElement, s = engine.pixelScale;
  const g = (grab.cv ||= document.createElement('canvas'));
  g.width = c.width; g.height = c.height;
  const x = g.getContext('2d', { willReadFrequently: true });
  x.drawImage(c, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const W = engine.lowW, H = engine.lowH, img = new PixelImage(W, H);
  let mixed = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = ((j * s) * c.width + i * s) * 4, o2 = ((j * s + s - 1) * c.width + i * s + s - 1) * 4;
    if (d[o] !== d[o2] || d[o + 1] !== d[o2 + 1] || d[o + 2] !== d[o2 + 2]) mixed++;
    if (!(d[o] === 0 && d[o + 1] === 255 && d[o + 2] === 0)) img.set(i, j, [d[o], d[o + 1], d[o + 2], 255]);
  }
  return { img, mixed };
}

/**
 * Render every big-book frame for one time of day. Returns { frames: [[name, PixelImage]], anchors: {dir: {x, y}},
 * cells: {dir: {w, h}}, mixed (max non-uniform texel blocks per render: must be 0) }.
 */
export async function renderBook3DFrames(engine, { tod = 'noon', ghosts = true } = {}) {
  const { sunFor, screenToGround } = await import('../../../scenes/char-stage.js');
  engine.camera.set({ target: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: BAKE3D.pitch, viewHeight: BAKE3D.vh });
  applyTimeOfDay(engine, tod, { ...sunFor(tod, (k, d) => d), shadowExtent: 24 });
  setClouds(engine, { scale: 0 });
  engine.style.sky.set(KEY);
  const { cellW: CW, cellH: CH, feetY } = BAKE3D;
  const cols = Math.floor(engine.lowW / CW), rows = Math.floor(engine.lowH / CH), per = cols * rows;
  const jobs = [];
  for (const ghost of ghosts ? [false, true] : [false]) for (const dir of DIRS3D) for (const [phase, f] of BIG3D_DRAWINGS) jobs.push({ ghost, dir, phase, f });
  const pools = { false: [], true: [] };
  const mats = { false: bookMaterials(engine, { ghost: false }), true: bookMaterials(engine, { ghost: true }) };
  const raw = [];
  let mixed = 0, t = 1;
  for (let b0 = 0; b0 < jobs.length; b0 += per) {
    const batch = jobs.slice(b0, b0 + per);
    for (const p of [...pools.false, ...pools.true]) p.root.visible = false;
    const used = { false: 0, true: 0 };
    const placed = batch.map((J, k) => {
      const pool = pools[J.ghost];
      if (used[J.ghost] >= pool.length) { const b = createBook3D(engine, { mats: mats[J.ghost] }); engine.scene.add(b.root); pool.push(b); }
      const book = pool[used[J.ghost]++];
      const c = k % cols, r = Math.floor(k / cols);
      const fx = c * CW + (CW >> 1), fy = r * CH + feetY;          // the feet texel (x right, y down) in the frame
      const feet = screenToGround(engine, fx + 0.5 - engine.lowW / 2, fy + 0.5 - engine.lowH / 2);
      book.setPose(bookPose(J.phase, J.f)).place(placeBook3D(feet, faceOfDir(J.dir), 0, { ghost: J.ghost }));
      book.root.visible = true;
      engine.camera.snapObjectToTexel(book.root, { once: true });
      return { ...J, fx, fy, x0: c * CW, y0: r * CH };
    });
    engine.renderAt(t); t += 1;
    const g = grab(engine);
    mixed = Math.max(mixed, g.mixed);
    for (const p of placed) raw.push({ ...p, img: g.img.crop(p.x0, p.y0, CW, CH), ax: p.fx - p.x0, ay: p.fy - p.y0 });
  }
  for (const p of [...pools.false, ...pools.true]) p.root.visible = false;
  // one cell per dir: the union bbox of every drawing (alive + ghost) of that dir, + 1 px
  const anchors = {}, cells = {}, frames = [];
  for (const dir of DIRS3D) {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const R of raw) if (R.dir === dir) for (let j = 0; j < R.img.h; j++) for (let i = 0; i < R.img.w; i++)
      if (R.img.alpha(i, j)) { x0 = Math.min(x0, i); y0 = Math.min(y0, j); x1 = Math.max(x1, i); y1 = Math.max(y1, j); }
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(CW - 1, x1 + 1); y1 = Math.min(CH - 1, y1 + 1);
    const R0 = raw.find((R) => R.dir === dir);
    anchors[dir] = { x: R0.ax - x0, y: R0.ay - y0 };
    cells[dir] = { w: x1 - x0 + 1, h: y1 - y0 + 1 };
    cells[dir].touchesEdge = x0 === 0 || y0 === 0 || x1 === CW - 1 || y1 === CH - 1;
  }
  for (const R of raw) {
    const c = cells[R.dir], a = anchors[R.dir];
    frames.push([`${R.ghost ? 'bookbigghost' : 'bookbig'}_${R.dir}_${R.phase}_${R.f}`, R.img.crop(R.ax - a.x, R.ay - a.y, c.w, c.h)]);
  }
  return { frames, anchors, cells, mixed };
}
