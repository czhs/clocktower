// Foliage atlas (owner: foliage). Every foliage drawing is a hand-built pixel sprite in ONE RGBA8 atlas, a column
// per sprite and a row per drawing (frame). Deformable sprites (grass tufts, tall grass, flowers, reeds, bush leaf
// clusters) are authored once as STROKES (blades bottom -> top) and every frame is derived by bending the strokes
// in whole texels (tips move most) and re-drawing them as connected 1-px lines, so a bent tuft is still a clean
// 1-px blade drawing, never a sheared / resampled one. Flakes (falling leaves, petals) are explicit drawings.
//
// Pixel encoding: A = coverage (255 / 0), R = class, G = 255 main / 128 highlight, B = 255.
//   R 255 BODY   (blade / leaf body: the material tones)
//   R 160 TIP    (tall grass tips, leaf-cluster sun tips: one band up / the tip tint)
//   R  96 BASE   (dense clump base, cluster underside: one band down = self-shadow)
//   R   0 BLOSSOM (flower blossom, cattail head, petal: the instance tint)
import * as THREE from 'three';
import { rng } from '../../core/noise.js';

export const CW = 16, CH = 24;            // cell size in texels (sprite quad = CW x CH screen texels)
// frame rows of deformable sprites. S = wind sway (tips 1 / 2 px), P = pushed by a walker (strong / medium,
// squashed), FLAT = trodden (squashed to ~45 %, blades splayed outward)
// D0 / D1 / DM1 = REST / S1 / SM1 with every attached blossom one texel lower (the flower BOB: a whole-blossom nod)
export const FR = { REST: 0, S1: 1, S2: 2, SM1: 3, SM2: 4, P3: 5, PM3: 6, FLAT: 7, P2: 8, PM2: 9, D0: 10, D1: 11, DM1: 12 };
export const NF = 13;
const DIP_BASE = { [FR.D0]: FR.REST, [FR.D1]: FR.S1, [FR.DM1]: FR.SM1 };
export const CLS = { BODY: 255, TIP: 160, BASE: 96, BLOSSOM: 0 };

// --------------------------------------------------------------------------------------------- deformation
/** [dx(f, h, rootX), squash] of frame `fr` for a pixel at relative height f (0 root .. 1 tip) of a stroke h px tall. */
function bend(fr, f, h, rootX) {
  const sgn = (fr === FR.SM1 || fr === FR.SM2 || fr === FR.PM3 || fr === FR.PM2) ? -1 : 1;
  switch (fr) {
    case FR.REST: return [0, 1];
    case FR.S1: case FR.SM1: return [sgn * (f > 0.62 ? 1 : 0), 1];
    case FR.S2: case FR.SM2: return [sgn * (f > 0.8 ? 2 : f > 0.42 ? 1 : 0), 1];
    case FR.P2: case FR.PM2: { const T = Math.max(2, Math.round(0.3 * h)); return [sgn * Math.round(T * Math.pow(f, 1.6)), 0.9]; }
    case FR.P3: case FR.PM3: { const T = Math.max(3, Math.round(0.5 * h)); return [sgn * Math.round(T * Math.pow(f, 1.3)), 0.72]; }
    case FR.FLAT: {
      const side = rootX < 0 ? -1 : rootX > 0 ? 1 : (h % 2 ? 1 : -1);
      return [side * Math.round(Math.min(5, 0.55 * h) * Math.pow(f, 1.2)), 0.42];
    }
  }
  return [0, 1];
}

// strokes: [{ h, pts: [[x, y, cls, g]] , rigid?: true (root clump: never bends), attach?: stroke index (blossom
// rides on that stroke's tip) }]
function drawFrame(put, strokes, fr, dip = 0) {
  const tips = [];
  strokes.forEach((s, si) => {
    if (s.attach !== undefined) return;
    let prev = null;
    const rootX = s.pts[0]?.[0] ?? 0;
    for (const [x, y, cls, g] of s.pts) {
      let nx = x, ny = y;
      if (!s.rigid) {
        const f = Math.min(1, (y + 1) / Math.max(1, s.h));
        const [dx, sq] = bend(fr, f, s.h, rootX);
        nx = x + dx; ny = Math.round(y * sq);
      }
      // connect to the previous pixel of the stroke with a 1-px line (bent blades stay continuous)
      if (prev && !s.rigid && !s.cluster) {
        const [px, py] = prev;
        const n = Math.max(Math.abs(nx - px), Math.abs(ny - py));
        for (let k = 1; k < n; k++) put(Math.round(px + (nx - px) * k / n), Math.round(py + (ny - py) * k / n), cls, g);
      }
      put(nx, ny, cls, g);
      prev = [nx, ny];
    }
    tips[si] = prev;
  });
  // attached blossoms / heads follow their stem's (bent) tip
  strokes.forEach((s) => {
    if (s.attach === undefined) return;
    const base = strokes[s.attach], tip = tips[s.attach];
    const top = base.pts[base.pts.length - 1];
    if (!tip || !top) return;
    for (const [x, y, cls, g] of s.pts) put(tip[0] + (x - top[0]), tip[1] + (y - top[1]) - dip, cls, g);
  });
}

// --------------------------------------------------------------------------------------------- sprites
/** Short grass tuft (world-grass recipe: a comb, solid 2-3 px root clump, 1-px blades leaning outward). */
function tuft(rand, size) {
  const hMax = [5, 7, 10][size];
  const w = [4, 5, 6][size] + (rand() < 0.5 ? 1 : 0);
  const x0 = -Math.floor(w / 2);
  const strokes = [];
  let last = -9;
  for (let c = 0; c < w; c++) {
    const bx = x0 + c;
    const centre = 1 - Math.abs((c - (w - 1) / 2) / (w / 2));
    if (c - last < 2 && rand() < 0.3) continue;
    last = c;
    const h = Math.max(2, Math.round(hMax * (0.35 + 0.45 * centre + 0.3 * rand())));
    let lean = bx < 0 ? -1 : bx > 0 ? 1 : 0;
    if (rand() < 0.35) lean = 0; else if (!lean) lean = rand() < 0.5 ? -1 : 1;
    const every = 3 + Math.floor(rand() * 2);
    let x = bx;
    const pts = [];
    for (let y = 0; y < h; y++) { if (y > 1 && y % every === 0 && lean && Math.abs(x + lean) <= 5) x += lean; pts.push([x, y, CLS.BODY, 255]); }
    strokes.push({ h, pts });
  }
  const root = { h: 99, rigid: true, pts: [] };
  const rootH = size === 0 ? 1 : 2;
  for (let x = x0; x < x0 + w; x++) for (let y = 0; y < rootH + (x > x0 && x < x0 + w - 1 ? 1 : 0); y++) root.pts.push([x, y, CLS.BODY, 255]);
  strokes.push(root);
  return strokes;
}

/** Tall grass clump: 7-10 long blades (12-19 px; edge variant 7-11 px), a dense self-shadowed base (~45 % of the
 *  blade: the dark mass that reads in sun), 3-px lighter tips (the light strokes that read in shade). */
function tallTuft(rand, edge = false) {
  const w = (edge ? 5 : 7) + Math.floor(rand() * 3);
  const x0 = -Math.floor(w / 2);
  const strokes = [];
  for (let c = 0; c < w; c++) {
    if (rand() < 0.12) continue;
    const bx = x0 + c;
    const centre = 1 - Math.abs((c - (w - 1) / 2) / (w / 2));
    const h = edge ? Math.round(6 + 4 * centre + 2 * rand()) : Math.round(11 + 6 * centre + 3 * rand());
    let lean = bx < -1 ? -1 : bx > 0 ? 1 : 0;
    if (rand() < 0.3) lean = -lean;
    const every = 3 + Math.floor(rand() * 3);
    let x = bx;
    const pts = [];
    for (let y = 0; y < h; y++) {
      if (y > 2 && y % every === 0 && lean && Math.abs(x + lean) <= 7) x += lean;
      pts.push([x, y, y >= h - 3 ? CLS.TIP : y < Math.round(h * 0.45) ? CLS.BASE : CLS.BODY, 255]);
    }
    strokes.push({ h, pts });
  }
  const root = { h: 99, rigid: true, pts: [] };
  for (let x = x0; x < x0 + w; x++) for (let y = 0; y < 2 + (x > x0 && x < x0 + w - 1 ? 2 : 0); y++) root.pts.push([x, y, CLS.BASE, 255]);
  strokes.push(root);
  strokes.massFill = true;    // solid lower mass (filled per frame after bending): no see-through speckle between blades
  return strokes;
}

// v1 tall clump: only called to keep the main rng stream (flowers, reeds, leaves) on its old drawings
function tallTuftV1(rand) {
  const w = 6 + Math.floor(rand() * 3);
  const x0 = -Math.floor(w / 2);
  const strokes = [];
  for (let c = 0; c < w; c++) {
    if (rand() < 0.18) continue;
    const bx = x0 + c;
    const centre = 1 - Math.abs((c - (w - 1) / 2) / (w / 2));
    const h = Math.round(9 + 7 * centre + 3 * rand());
    let lean = bx < -1 ? -1 : bx > 0 ? 1 : 0;
    if (rand() < 0.3) lean = -lean;
    const every = 3 + Math.floor(rand() * 3);
    let x = bx;
    const pts = [];
    for (let y = 0; y < h; y++) {
      if (y > 2 && y % every === 0 && lean && Math.abs(x + lean) <= 6) x += lean;
      pts.push([x, y, y >= h - 2 ? CLS.TIP : y < Math.round(h * 0.42) ? CLS.BASE : CLS.BODY, 255]);
    }
    strokes.push({ h, pts });
  }
  const root = { h: 99, rigid: true, pts: [] };
  for (let x = x0; x < x0 + w; x++) for (let y = 0; y < 2 + (x > x0 && x < x0 + w - 1 ? 1 : 0); y++) root.pts.push([x, y, CLS.BASE, 255]);
  strokes.push(root);
  return strokes;
}

// blossom shapes relative to the stem top (world flowers' shapes + a 5-px cup)
const BLOSSOMS = [
  [[0, 1, 255], [1, 1, 255], [0, 2, 128], [1, 2, 255]],
  [[0, 1, 255], [-1, 2, 255], [0, 2, 128], [1, 2, 255], [0, 3, 255]],
  [[-1, 1, 255], [0, 1, 255], [1, 1, 255], [0, 2, 128], [-1, 2, 255], [1, 2, 255]],
  [[-1, 1, 255], [1, 1, 255], [-1, 2, 255], [0, 2, 128], [1, 2, 255], [0, 1, 255]],
];
/** Flower: 1-px stem 4-8 px with a side leaf, a blossom riding the stem tip (+ a second, shorter one), blades. */
function flower(rand, v) {
  const strokes = [];
  const one = (x0, h, shape) => {
    const lean = rand() < 0.5 ? -1 : 1;
    const pts = [];
    let x = x0;
    for (let y = 0; y < h; y++) { if (y === Math.floor(h / 2) && rand() < 0.6) x += lean; pts.push([x, y, CLS.BASE, 255]); }
    const si = strokes.length;
    strokes.push({ h: h + 1, pts });
    if (h >= 5) strokes.push({ h: 3, pts: [[x0 - lean, 2, CLS.BASE, 255], [x0 - 2 * lean, 3, CLS.BASE, 255]] }); // side leaf
    const top = pts[pts.length - 1];
    strokes.push({ attach: si, pts: BLOSSOMS[shape].map(([bx, by, g]) => [top[0] + bx, top[1] + by - 1, CLS.BLOSSOM, g]) });
  };
  one(0, 5 + Math.floor(rand() * 4), v % 4);
  if (v % 2) one(rand() < 0.5 ? -3 : 3, 3 + Math.floor(rand() * 2), (v + 1) % 4);
  for (const bx of [-2, 2]) {
    const h = 2 + Math.floor(rand() * 3), pts = [];
    for (let y = 0; y < h; y++) pts.push([bx + (y > 1 ? Math.sign(bx) : 0), y, CLS.BASE, 255]);
    strokes.push({ h, pts });
  }
  // leaf rosette at the foot (dark: one band below the ground): the blossoms sit on a plant, not on air
  const ros = { h: 99, rigid: true, pts: [] };
  for (let x = -4; x <= 4; x++) ros.pts.push([x, 0, CLS.BASE, 255]);
  for (let x = -3; x <= 3; x++) ros.pts.push([x, 1, CLS.BASE, 255]);
  for (let x = -2; x <= 2; x++) if (x) ros.pts.push([x, 2, CLS.BASE, 255]);
  ros.pts.push([-5, 1, CLS.BASE, 255], [5, 1, CLS.BASE, 255], [-3, 3, CLS.BASE, 255], [3, 3, CLS.BASE, 255]);
  strokes.push(ros);
  return strokes;
}

/** Reed clump: 3-5 tall 1-px stalks (13-22 px) with 1-2 cattail heads (2x4) + flat blades at the foot. */
function reed(rand, v) {
  const strokes = [];
  const n = 3 + (v % 3);
  for (let k = 0; k < n; k++) {
    const x0 = Math.round((k - (n - 1) / 2) * 2 + (rand() - 0.5));
    const h = 13 + Math.floor(rand() * 9);
    const lean = rand() < 0.5 ? -1 : 1;
    const pts = [];
    let x = x0;
    for (let y = 0; y < h; y++) { if (y > 6 && y % 7 === 0 && rand() < 0.5) x += lean; pts.push([x, y, y < 3 ? CLS.BASE : CLS.BODY, 255]); }
    const si = strokes.length;
    strokes.push({ h, pts });
    if (k === Math.floor(n / 2)) {      // one cattail per clump (r4: a head on every other stalk read as static)
      // cattail: 2 px wide, 4 px tall, below a 1-px spike, riding the tip
      const t = pts[pts.length - 1];
      const head = [];
      for (let yy = -5; yy <= -2; yy++) for (const xx of [0, 1]) head.push([t[0] + xx, t[1] + yy, CLS.BLOSSOM, xx === 0 && yy === -2 ? 128 : 255]);
      strokes.push({ attach: si, pts: head });
    }
  }
  // flat blades at the foot (lean outward)
  for (const bx of [-3, -1, 2, 4]) {
    const h = 4 + Math.floor(rand() * 4), pts = [];
    let x = bx;
    for (let y = 0; y < h; y++) { if (y > 1 && y % 2 === 0) x += Math.sign(bx); pts.push([x, y, y < 2 ? CLS.BASE : CLS.BODY, 255]); }
    strokes.push({ h, pts });
  }
  return strokes;
}

/** Bush leaf cluster: 3-4 leaf shapes (3x2 .. 4x3 blobs) in a 7x7 area; top-left rim = TIP, bottom row = BASE. */
function leafCluster(rand) {
  const cells = new Map();
  const blobs = 3 + Math.floor(rand() * 2);
  for (let b = 0; b < blobs; b++) {
    const cx = Math.floor(rand() * 5) - 2, cy = 1 + Math.floor(rand() * 4);
    const w = 3 + Math.floor(rand() * 2), h = 2 + Math.floor(rand() * 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;     // round the corners
      cells.set(`${cx + x - 1},${cy + y}`, 1);
    }
  }
  const pts = [];
  for (const k of cells.keys()) {
    const [x, y] = k.split(',').map(Number);
    const up = cells.has(`${x},${y + 1}`), left = cells.has(`${x - 1},${y}`), down = cells.has(`${x},${y - 1}`);
    pts.push([x, y, (!up && !left) ? CLS.TIP : CLS.BODY, 255]);
  }
  pts.sort((a, b) => a[1] - b[1]);
  // one stroke (the cluster bends as one: relative height = its row)
  const ymax = Math.max(...pts.map((p) => p[1]));
  return [{ h: ymax + 1, pts, cluster: true }];
}

// flakes: explicit drawings per row (falling leaf flips, lying leaf, petals). [x, y, cls, g] relative to the root.
const LEAF_FLAKE = [   // >= 3x2 texels, two tones (body + a darker underside / stem): reads as a leaf, not a glint
  [[1, 3, 255, 255], [2, 3, 160, 255], [0, 2, 255, 255], [1, 2, 255, 255], [2, 2, 255, 255], [3, 2, 160, 255],
    [0, 1, 96, 255], [1, 1, 255, 255], [2, 1, 255, 255], [3, 1, 255, 255], [1, 0, 96, 255], [2, 0, 96, 255]],      // flat (4x4 oval)
  [[0, 0, 96, 255], [1, 0, 96, 255], [0, 1, 255, 255], [1, 1, 255, 255], [2, 1, 255, 255], [1, 2, 255, 255],
    [2, 2, 255, 255], [3, 2, 160, 255], [2, 3, 160, 255]],                                                            // tilted (diagonal)
  [[0, 0, 96, 255], [1, 0, 96, 255], [2, 0, 96, 255], [0, 1, 255, 255], [1, 1, 255, 255], [2, 1, 160, 255]],          // edge-on (3x2)
  [[2, 0, 96, 255], [3, 0, 96, 255], [1, 1, 255, 255], [2, 1, 255, 255], [3, 1, 255, 255], [0, 2, 160, 255],
    [1, 2, 255, 255], [2, 2, 255, 255], [1, 3, 160, 255]],                                                            // tilted the other way
  [[0, 0, 96, 255], [1, 0, 96, 255], [2, 0, 96, 255], [3, 0, 96, 255], [1, 1, 255, 255], [2, 1, 255, 255], [3, 1, 160, 255], [0, 1, 255, 255]], // lying (4x2)
];
const PETAL_FLAKE = [
  [[0, 0, 0, 255], [1, 0, 0, 128]],
  [[0, 0, 0, 128], [0, 1, 0, 255]],
  [[0, 0, 0, 255]],
  [[0, 0, 0, 255], [1, 1, 0, 128]],
  [[0, 0, 0, 255], [1, 0, 0, 255]],
];
export const FLAKE_ROWS = { leaf: { fall: [0, 1, 2, 3], lying: 4 }, petal: { fall: [0, 1, 2, 3], lying: 4 } };

// --------------------------------------------------------------------------------------------- atlas
/**
 * Build the foliage atlas. Returns { texture, grid: [cols, rows], cols: { tuft: [[s0], [s1], [s2]], tall, flower,
 * reed, leaf, flakeLeaf, flakePetal }, heights: { col -> px } }.
 */
export function buildFoliageAtlas(seed = 7) {
  const rand = rng(seed * 7919 + 29);
  const randT = rng(seed * 7919 + 431);   // tall grass: its own stream (the other sprites keep their drawings)
  const sprites = [], cols = { tuft: [[], [], []], tall: [], tallEdge: [], flower: [], reed: [], leaf: [], flakeLeaf: -1, flakePetal: -1 };
  for (let v = 0; v < 12; v++) { cols.tuft[v % 3].push(sprites.length); sprites.push({ strokes: tuft(rand, v % 3) }); }
  for (let v = 0; v < 6; v++) { cols.tall.push(sprites.length); sprites.push({ strokes: tallTuft(randT) }); tallTuftV1(rand); }
  for (let v = 0; v < 6; v++) { cols.flower.push(sprites.length); sprites.push({ strokes: flower(rand, v) }); }
  for (let v = 0; v < 4; v++) { cols.reed.push(sprites.length); sprites.push({ strokes: reed(rand, v) }); }
  for (let v = 0; v < 6; v++) { cols.leaf.push(sprites.length); sprites.push({ strokes: leafCluster(rand) }); }
  for (let v = 0; v < 3; v++) { cols.tallEdge.push(sprites.length); sprites.push({ strokes: tallTuft(randT, true) }); }
  cols.flakeLeaf = sprites.length; sprites.push({ rows: LEAF_FLAKE });
  cols.flakePetal = sprites.length; sprites.push({ rows: PETAL_FLAKE });
  const nC = sprites.length, W = nC * CW, H = NF * CH;
  const data = new Uint8Array(W * H * 4);
  sprites.forEach((sp, c) => {
    for (let fr = 0; fr < NF; fr++) {
      const put = (x, y, cls, g) => {
        const px = CW / 2 + x, py = y;
        if (px < 0 || px >= CW || py < 0 || py >= CH) return;
        const i = ((fr * CH + py) * W + c * CW + px) * 4;
        if (data[i + 3] && data[i] === 0 && cls !== 0) return;      // blossoms / heads win over blades
        data[i] = cls; data[i + 1] = g; data[i + 2] = 255; data[i + 3] = 255;
      };
      if (sp.rows) { const r = sp.rows[Math.min(fr, sp.rows.length - 1)]; for (const [x, y, cls, g] of r) put(x, y, cls, g); continue; }
      // leaf clusters bend gently: only sway frames are used (rows >= P are the same as their S counterpart)
      const cluster = sp.strokes[0]?.cluster;
      const fb = DIP_BASE[fr] ?? fr;
      const f2 = cluster ? ({ [FR.P3]: FR.S2, [FR.PM3]: FR.SM2, [FR.P2]: FR.S1, [FR.PM2]: FR.SM1, [FR.FLAT]: FR.S1 }[fb] ?? fb) : fb;
      // the trodden drawing (FLAT) is splayed blades with NO mass: the trodden lane shows the ground through it
      if (!sp.strokes.massFill || fb === FR.FLAT) { drawFrame(put, sp.strokes, f2, fr === fb ? 0 : 1); continue; }
      // tall grass: draw, then fill each row of the lower mass between its outermost blade pixels (dark BASE mass,
      // blades + tips fan out above it): rows of clumps then overlap as clean bands, not 1-px tone noise
      const px = [];
      drawFrame((x, y, cls, g) => px.push([x, y, cls, g]), sp.strokes, f2);
      const ymax = Math.max(...px.map((p) => p[1]));
      const fillH = Math.round(ymax * 0.5);
      const rows = new Map();
      for (const [x, y] of px) { if (y > fillH) continue; const r = rows.get(y) ?? [x, x]; rows.set(y, [Math.min(r[0], x), Math.max(r[1], x)]); }
      for (const [y, [a, b]] of rows) for (let x = a; x <= b; x++) put(x, y, CLS.BASE, 255);
      for (const [x, y, cls, g] of px) if (y > fillH) put(x, y, cls === CLS.BASE ? CLS.BODY : cls, g);
    }
  });
  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.flipY = false; texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, grid: [nC, NF], cols, data, W, H };
}
