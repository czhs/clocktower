// Ground renderer: paints the whole tile map pixel-by-pixel from the handcrafted ground
// codes (layout.ts). Outdoors: domain-warped organic edges between soft materials, the round
// town square (raised kerb, concentric setts, the voting circle as a clock-dial ring with hour
// marks, a compass-rose inlay in the middle), cobbled paths that run down the middle of their
// lanes with grass verges, a rutted cart road, meadow grass and the forest rim. Indoors: the 15
// cottage rooms (seen big when you are inside), each with a wall treatment that echoes the
// cottage's outside walls, its own palette, floorboards / flagstones, a hearth slab and a few
// wall hangings. The result is sliced into 16x16 tiles and de-duplicated into a Tiled tileset
// (terrain.png) + ground layer indices.
import type { BuildingDef } from '@ct/protocol';
// (v3 WP5b) the world to paint: v2 by default, the v3 world in the CT_ASSETS_WORLD=v3 pass (scripts/lib/world.ts)
import { G, PROP_DEFS, townLayout, townMap, TOWN_W, TS } from './lib/world.js';
import { LX, LY } from './lib/draw.js';
import { bayer, dpick, fbm, hash, Img, mix, type Color, type RGBA, vnoise } from './lib/img.js';

const W = townMap.width;
const H = townMap.height;
const TOWN_H = townLayout.townBounds.h;
const P = 64; // texture period (px) for materials that only appear off the main town
const pm = (v: number) => ((v % P) + P) % P;

const code = (tx: number, ty: number): string => (tx < 0 || ty < 0 || tx >= W || ty >= H ? ' ' : townMap.ground[ty]![tx]!);
const inTown = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < TOWN_W && ty < TOWN_H;

/** Pseudo material: a cobble-lane tile outside the visible path (grass verge). */
const VERGE = 'v';
const SOFT = new Set<string>([G.grass, G.forest, G.dense, G.dirt, G.sand, G.soil, G.gravel, G.cobble, G.plaza, G.ring, G.water]);
const PAVED = new Set<string>([G.cobble, G.plaza, G.ring, G.gravel]);
const LOW = new Set<string>([G.dirt, G.sand, G.soil, G.gravel, G.cobble, G.plaza, G.ring, G.water, G.bridge]);
const GRASSY = new Set<string>([G.grass, G.forest, G.dense, VERGE]);
const PZ = townMap.plaza;
const CI = townLayout.circle!;
/** Normalised distance from the plaza centre (1 = plaza edge). */
const plazaD = (px: number, py: number) => Math.hypot((px + 0.5 - PZ.cx) / PZ.rx, (py + 0.5 - PZ.cy) / PZ.ry);
const KERB_W = 13;
const KERB_EDGE = 1 - KERB_W / Math.min(PZ.rx, PZ.ry);

const col4 = (c: Color): RGBA => mix(c, c, 0);

// Building footprints (for contact shadows).
const footprint = new Uint8Array(W * H);
for (const b of [...townLayout.buildings, ...townMap.landmarks]) {
  const f = b.footprint;
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) footprint[y * W + x] = 1;
}
const isFp = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < W && ty < H && footprint[ty * W + tx] === 1;

// =========================================================================================
// Paths: every cobble lane is shown as a path down the middle of the lane (narrower than the
// walkable lane when the lane is wide) plus a short spur to each door. Derived from the tile
// map: horizontal/vertical runs of >= 5 cobble tiles are lane strokes; adjacent parallel strokes
// form one lane whose centre line the path follows.

interface Slice {
  h: boolean; // horizontal (runs along x)
  a0: number; // along-axis extent (px, [a0, a1))
  a1: number;
  c: number; // across-axis centre (px)
  half: number;
  spur: boolean;
}
const isCob = (tx: number, ty: number) => code(tx, ty) === G.cobble && inTown(tx, ty);
function runLen(tx: number, ty: number, dx: number, dy: number): number {
  let n = 1;
  for (let k = 1; isCob(tx + dx * k, ty + dy * k); k++) n++;
  for (let k = 1; isCob(tx - dx * k, ty - dy * k); k++) n++;
  return n;
}
const hS = new Uint8Array(W * H);
const vS = new Uint8Array(W * H);
for (let ty = 0; ty < TOWN_H; ty++)
  for (let tx = 0; tx < TOWN_W; tx++) {
    if (!isCob(tx, ty)) continue;
    if (runLen(tx, ty, 1, 0) >= 5) hS[ty * W + tx] = 1;
    if (runLen(tx, ty, 0, 1) >= 5) vS[ty * W + tx] = 1;
  }
const HALF = [0, 8, 11, 12, 13, 13, 13, 13];
// where a lane runs into the square, the square's tiles still count as lane width (keeps the
// path centred instead of stepping sideways as the circle eats the lane's tiles)
const sq = (tx: number, ty: number) => code(tx, ty) === G.plaza || code(tx, ty) === G.ring;
const colHasV = new Uint8Array(W);
const rowHasH = new Uint8Array(H);
for (let ty = 0; ty < TOWN_H; ty++)
  for (let tx = 0; tx < TOWN_W; tx++) {
    if (vS[ty * W + tx]) colHasV[tx] = 1;
    if (hS[ty * W + tx]) rowHasH[ty] = 1;
  }
const vLike = (tx: number, ty: number) => tx >= 0 && tx < TOWN_W && (vS[ty * W + tx] === 1 || (sq(tx, ty) && colHasV[tx] === 1));
const hLike = (tx: number, ty: number) => ty >= 0 && ty < TOWN_H && (hS[ty * W + tx] === 1 || (sq(tx, ty) && rowHasH[ty] === 1));
const slicesAt: Slice[][] = Array.from({ length: W * H }, () => []);
function addSlice(s: Slice, tiles: [number, number][]) {
  for (const [x, y] of tiles) if (inTown(x, y)) slicesAt[y * W + x]!.push(s);
}
for (let ty = 0; ty < TOWN_H; ty++)
  for (let tx = 0; tx < TOWN_W; tx++) {
    const i = ty * W + tx;
    if (hS[i]) {
      let y0 = ty;
      let y1 = ty;
      while (hLike(tx, y0 - 1)) y0--;
      while (hLike(tx, y1 + 1)) y1++;
      const n = y1 - y0 + 1;
      const s: Slice = { h: true, a0: tx * TS, a1: (tx + 1) * TS, c: ((y0 + y1 + 1) * TS) / 2, half: HALF[Math.min(n, 7)]!, spur: false };
      const tiles: [number, number][] = [];
      for (let y = y0 - 1; y <= y1 + 1; y++) tiles.push([tx, y]);
      addSlice(s, tiles);
    }
    if (vS[i]) {
      let x0 = tx;
      let x1 = tx;
      while (vLike(x0 - 1, ty)) x0--;
      while (vLike(x1 + 1, ty)) x1++;
      const n = x1 - x0 + 1;
      const s: Slice = { h: false, a0: ty * TS, a1: (ty + 1) * TS, c: ((x0 + x1 + 1) * TS) / 2, half: HALF[Math.min(n, 7)]!, spur: false };
      const tiles: [number, number][] = [];
      for (let x = x0 - 1; x <= x1 + 1; x++) tiles.push([x, ty]);
      addSlice(s, tiles);
    }
  }
// door spurs: a door-wide path from each doorstep out into its lane
for (const b of townLayout.buildings) {
  const facing = townMap.styles[b.id]?.facing ?? 'south';
  const d = b.door;
  let s: Slice;
  if (facing === 'south') s = { h: false, a0: d.y * TS - 2, a1: d.y * TS + 40, c: d.x * TS + 8, half: 7, spur: true };
  else if (facing === 'east') s = { h: true, a0: d.x * TS - 2, a1: d.x * TS + 40, c: d.y * TS + 9, half: 7, spur: true };
  else s = { h: true, a0: d.x * TS + 18 - 40, a1: d.x * TS + 18, c: d.y * TS + 9, half: 7, spur: true };
  const tiles: [number, number][] = [];
  for (let y = d.y - 1; y <= d.y + 3; y++) for (let x = d.x - 3; x <= d.x + 3; x++) tiles.push([x, y]);
  addSlice(s, tiles);
}

/** Signed distance (px) to the nearest path edge: <= 0 is on the path. */
function pathSD(px: number, py: number): number {
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  if (!inTown(tx, ty)) return 99;
  const list = slicesAt[ty * W + tx]!;
  let best = 99;
  for (const s of list) {
    const along = s.h ? px : py;
    if (along < s.a0 || along >= s.a1) continue;
    if (s.spur && code(tx, ty) !== G.cobble) continue;
    const across = (s.h ? py : px) + 0.5;
    const wob = s.spur ? 0 : (vnoise(along, s.c, 6, 301) - 0.5) * 2.6;
    const sd = Math.abs(across - s.c) - (s.half + wob);
    if (sd < best) best = sd;
  }
  return best;
}

/** Material cache (filled once by renderGround). */
let MAT: string[] | null = null;
function matAt(px: number, py: number): string {
  if (MAT && px >= 0 && py >= 0 && px < W * TS && py < H * TS) return MAT[py * W * TS + px]!;
  return matRaw(px, py);
}
/** Material at a pixel after warping, the square override and path narrowing. */
function matRaw(px: number, py: number): string {
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  const raw = code(tx, ty);
  if (inTown(tx, ty)) {
    const d = plazaD(px, py);
    if (d <= 1 && raw !== G.dense) {
      if (d > KERB_EDGE) return raw === G.cobble && pathSD(px, py) <= 0 ? G.cobble : G.ring;
      return G.plaza;
    }
    if (raw === G.cobble || raw === G.grass || raw === G.forest || raw === G.dirt) {
      const sd = pathSD(px, py);
      if (sd <= 0) return G.cobble;
      if (raw === G.cobble) return VERGE;
    }
  }
  let c = raw;
  if (SOFT.has(c)) {
    const nx = vnoise(px, py, 7, 101) - 0.5;
    const ny = vnoise(px, py, 7, 202) - 0.5;
    let c2 = code(Math.floor((px + nx * 9) / TS), Math.floor((py + ny * 9) / TS));
    // paved edges stay tidier than natural ones
    if (PAVED.has(c) || PAVED.has(c2)) c2 = code(Math.floor((px + nx * 3) / TS), Math.floor((py + ny * 3) / TS));
    if (inTown(tx, ty) && (c2 === G.cobble || c2 === G.plaza || c2 === G.ring)) c2 = c === G.cobble ? G.grass : c;
    if (SOFT.has(c2)) c = c2;
  }
  if (inTown(tx, ty) && (c === G.plaza || c === G.ring || c === G.cobble)) c = G.grass;
  return c;
}

// ---------------------------------------------------------------------------------------
// Palettes

const GRASS = ['#1f3128', '#28402e', '#324e35', '#3f5d3b', '#4d6b42'];
const FOREST = ['#151f1c', '#1c2a23', '#243327', '#2d3c2b'];
const CANOPY = ['#070c0b', '#0c1512', '#111d17', '#17261c', '#1f3122', '#2a3f2a'];
const DIRT = ['#3e2e24', '#4c392b', '#5a4532', '#68513a', '#755d43'];
const SAND = ['#4c4536', '#5a523f', '#686048', '#776c52'];
const SOIL = ['#22180f', '#2e2116', '#3b2b1d', '#4a3725'];
const GRAVEL = ['#3e3b42', '#4b4850', '#58545c', '#68636a', '#7a7477'];
const COBBLE = ['#3e3a48', '#4a4554', '#555060', '#615b6b', '#6d6676'];
const PLAZA = ['#544f5e', '#5d5867', '#666070', '#6f6979', '#79727f'];
const PLAZA_IN = ['#57505c', '#615966', '#6a6270', '#736b78', '#7e7682'];
const SLATE = ['#3a3542', '#433d4b', '#4c4654', '#554f5d'];
const DIAL = ['#4e403e', '#5e4d48', '#6d5a52', '#7c675c', '#8b7566'];
const KERB = ['#3a3442', '#4a4352', '#5b5463', '#6c6573', '#7e7684', '#8f8894'];
const BRASS = ['#3e2c12', '#634a1e', '#8a6a2c', '#ad8a3e', '#cfae5c'];
const ROSE_L = ['#7c7584', '#8a8290', '#968e9c', '#a49ca8'];
const ROSE_D = ['#403a4a', '#4a4454', '#544d5e', '#5e5767'];
const WATER = ['#0f1c2e', '#14253a', '#1a3048', '#213b57', '#2a4866'];
const ROCK = ['#1f1b26', '#2a2532', '#36303f', '#433c4c', '#524a5a'];
const HEDGE_TOP = ['#162a1c', '#1d3523', '#25412a', '#305034', '#3d6040'];
const HEDGE_FACE = ['#0e1c13', '#132519', '#1a3020'];
const WALL_FACE = ['#353140', '#3f3a4a', '#4a4555', '#555060'];
const WALL_CAP = ['#4f4a58', '#5c5664', '#6a6472', '#77717f'];
const WOOD_BRIDGE = ['#2e2018', '#3d2b1f', '#4d3727', '#5c4330'];

// ---------------------------------------------------------------------------------------
// Generic cell renderer: any tessellation given as an id function gets 1 px joints on its
// top/left edges, a lit top-left rim and a shaded bottom-right rim (light from the upper left).

type IdFn = (px: number, py: number) => number;
function cells(id: IdFn, px: number, py: number, pal: readonly Color[], joint: Color, seed: number, o: { tone?: number; rim?: number; grain?: number; bias?: number } = {}): RGBA {
  const me = id(px, py);
  if (id(px - 1, py) !== me || id(px, py - 1) !== me) return col4(joint);
  const rim = o.rim ?? 0.26;
  let v = 0.5 + (o.bias ?? 0) + (hash(me, 0, seed) - 0.5) * (o.tone ?? 0.36);
  if (id(px - 2, py) !== me || id(px, py - 2) !== me) v += rim;
  if (id(px + 1, py) !== me || id(px, py + 1) !== me) v -= rim;
  v += (hash(px, py, seed + 1) - 0.5) * (o.grain ?? 0.16);
  return dpick(pal, v, px, py);
}

/** Running bond in local coordinates (non-periodic). */
function bondId(lx: number, ly: number, rh: number, sw: number, seed: number): number {
  const row = Math.floor(ly / rh);
  const off = (row & 1) * Math.floor(sw / 2) + Math.floor(hash(row, 0, seed) * 3);
  return row * 4099 + Math.floor((lx + off) / sw);
}

// ---------------------------------------------------------------------------------------
// Outdoor materials

function grass(px: number, py: number): RGBA {
  const n = fbm(px, py, 16, 1) * 0.75 + vnoise(px, py, 4, 2) * 0.25;
  const big = vnoise(px, py, 88, 5);
  const warm = vnoise(px, py, 52, 6);
  const h = hash(px, py, 3);
  if (h < 0.03) return mix(GRASS[4]!, '#7a8f55', 0.35 + big * 0.2);
  if (hash(px, py - 1, 3) < 0.03) return mix(GRASS[0]!, GRASS[1]!, 0.5);
  let c = dpick(GRASS, n * 1.05 - 0.04 + (big - 0.5) * 0.4, px, py);
  if (warm > 0.62) c = mix(c, '#5d6438', (warm - 0.62) * 0.55);
  else if (warm < 0.3) c = mix(c, '#203a36', (0.3 - warm) * 0.5);
  // wildflower drifts in the meadow (sparse, muted)
  if (inTown(Math.floor(px / TS), Math.floor(py / TS))) {
    const m = vnoise(px, py, 44, 9);
    if (m > 0.64) {
      const f = hash(Math.floor(px / 2), Math.floor(py / 2), 10);
      if (f < (m - 0.64) * 0.13 && (px & 1) === 0 && (py & 1) === 0) {
        const k = hash(Math.floor(px / 24), Math.floor(py / 24), 11);
        return col4(k < 0.45 ? '#d6d0dc' : k < 0.75 ? '#c9a94c' : '#9a7cb6');
      }
      if (f < (m - 0.64) * 0.13 && (px & 1) === 0 && (py & 1) === 1) return mix(c, '#14281c', 0.5);
    }
  }
  return c;
}
function forest(px: number, py: number): RGBA {
  const n = fbm(px, py, 16, 5);
  const h = hash(px, py, 6);
  if (h < 0.05) return mix('#4a3626', '#2a1f18', hash(px, py, 7));
  return dpick(FOREST, n, px, py);
}
/** Forest rim seen from above: a mat of tree crowns. */
function canopy(px: number, py: number): RGBA {
  const C = 11;
  const gx = Math.floor(px / C);
  const gy = Math.floor(py / C);
  let best = -1;
  let bv = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = (gx + i) * C + 2 + hash(gx + i, gy + j, 501) * (C - 4);
      const cy = (gy + j) * C + 2 + hash(gx + i, gy + j, 502) * (C - 4);
      const r = 6.5 + hash(gx + i, gy + j, 503) * 3.5;
      const nx = (px + 0.5 - cx) / r;
      const ny = (py + 0.5 - cy) / r;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const height = (1 - d) * (0.7 + hash(gx + i, gy + j, 504) * 0.6);
      if (height > best) {
        best = height;
        bv = 0.42 + (nx * LX + ny * LY) * 0.42 + Math.sqrt(1 - d) * 0.18;
      }
    }
  if (best < 0) return dpick(CANOPY, 0.05, px, py);
  bv += (vnoise(px, py, 2.5, 505) - 0.5) * 0.3 + (hash(px, py, 506) < 0.05 ? 0.2 : 0);
  return dpick(CANOPY, bv, px, py);
}
function dirt(px: number, py: number): RGBA {
  const n = fbm(px, py, 8, 8);
  const h = hash(px, py, 9);
  if (h < 0.03) return col4(DIRT[4]!);
  if (hash(px, py - 1, 9) < 0.03) return col4(DIRT[0]!);
  let v = 0.15 + n * 0.75;
  // cart road: two wheel ruts and a grassy crown
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  if (inTown(tx, ty) && code(tx, ty) === G.dirt) {
    let y0 = ty;
    let y1 = ty;
    while (code(tx, y0 - 1) === G.dirt) y0--;
    while (code(tx, y1 + 1) === G.dirt) y1++;
    const h2 = (y1 - y0 + 1) * TS;
    if (h2 >= 32) {
      const a = (py + 0.5 - y0 * TS) / h2;
      const wob = (vnoise(px, 0, 9, 511) - 0.5) * 0.05;
      for (const r of [0.3, 0.72]) {
        const dd = Math.abs(a - r - wob) * h2;
        if (dd < 2.2) v -= 0.32 - dd * 0.06;
        else if (dd < 3.2) v += 0.12;
      }
      const crown = Math.abs(a - 0.51 - wob) * h2;
      if (crown < 4 && hash(px, py, 512) < 0.3 - crown * 0.07) return dpick(GRASS, 0.35 + hash(px, py, 513) * 0.4, px, py);
    }
  }
  return dpick(DIRT, v, px, py);
}
function sand(px: number, py: number): RGBA {
  return dpick(SAND, fbm(px, py, 8, 11, P) * 0.9 + (hash(pm(px), pm(py), 12) < 0.05 ? 0.3 : 0), px, py);
}
function soil(px: number, py: number): RGBA {
  const r = pm(py) % 6;
  const base = r === 0 ? 0.05 : r === 1 ? 0.3 : r < 4 ? 0.75 : 0.5;
  return dpick(SOIL, base + (vnoise(px, py, 4, 13, P) - 0.5) * 0.4, px, py);
}
function gravel(px: number, py: number): RGBA {
  return dpick(GRAVEL, vnoise(px, py, 2, 14, P) * 0.7 + vnoise(px, py, 8, 15, P) * 0.3, px, py);
}

/** Running-bond stones: rows of height rh, stones of width sw (varying), mortar lines. */
function stones(px: number, py: number, rh: number, sw: number, pal: string[], mortar: string, seed: number): RGBA {
  const qy = pm(py);
  const row = Math.floor(qy / rh);
  const ly = qy - row * rh;
  const off = (row % 2) * Math.floor(sw / 2) + Math.floor(hash(row, 0, seed) * 3);
  const qx = pm(px + off);
  const sx = Math.floor(qx / sw);
  const lx = qx - sx * sw;
  const sid = hash(sx, row, seed + 1);
  if (ly === 0 || lx === 0) return col4(mortar);
  if ((ly === 1 || ly === rh - 1) && (lx === 1 || lx === sw - 1)) return mix(mortar, pal[0]!, 0.5);
  let v = 0.25 + sid * 0.5;
  if (ly === 1 || lx === 1) v += 0.3;
  if (ly === rh - 1 || lx === sw - 1) v -= 0.3;
  v += (hash(pm(px), pm(py), seed + 2) - 0.5) * 0.25;
  return dpick(pal, v, px, py);
}

// --- cobbled paths: rounded setts (jittered-grid Voronoi) -------------------------------
const SETT = 6;
function settId(px: number, py: number): number {
  const gx = Math.floor(px / SETT);
  const gy = Math.floor(py / SETT);
  let best = Infinity;
  let id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = (gx + i) * SETT + 1 + hash(gx + i, gy + j, 401) * (SETT - 2);
      const cy = (gy + j) * SETT + 1 + hash(gx + i, gy + j, 402) * (SETT - 2);
      const dx = px + 0.5 - cx;
      const dy = (py + 0.5 - cy) * 1.15;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        id = (gx + i) * 7919 + (gy + j) * 104729;
      }
    }
  return id;
}
function cobble(px: number, py: number): RGBA {
  const sd = pathSD(px, py);
  let c = cells(settId, px, py, COBBLE, '#262129', 33, { tone: 0.42, rim: 0.3, grain: 0.14 });
  // the edge of the path: setts sink into earth, moss in the joints
  if (sd > -2.5 && c[0] === 0x26 && c[1] === 0x21) c = col4(hash(px, py, 34) < 0.5 ? '#2f3a26' : '#3a2e24');
  if (sd > -1.2) c = mix(c, '#2a2220', 0.35);
  return c;
}
/** Grass verge beside a path (cobble lane tile that is not path): worn earth near the stones. */
function verge(px: number, py: number): RGBA {
  const e = pathSD(px, py);
  const g = grass(px, py);
  if (e < 1.6) return dpick(DIRT, 0.2 + hash(px, py, 35) * 0.3, px, py);
  if (e < 4) return bayer(px, py) < (4 - e) / 3.2 ? dpick(DIRT, 0.35 + hash(px, py, 36) * 0.35, px, py) : mix(g, '#5a5a36', 0.25);
  if (e < 7) return mix(g, '#56603a', (7 - e) * 0.05);
  return g;
}

// --- the square ------------------------------------------------------------------------
const TAU = Math.PI * 2;
/** Polar courses of setts around (cx, cy): course width cw from r0, stones ~sl px long. */
function courseId(px: number, py: number, cx: number, cy: number, r0: number, cw: number, sl: number, seed: number): number {
  const dx = px + 0.5 - cx;
  const dy = py + 0.5 - cy;
  const r = Math.hypot(dx, dy);
  const k = Math.floor((r - r0) / cw);
  const rm = r0 + (k + 0.5) * cw;
  const n = Math.max(6, Math.round((TAU * rm) / sl));
  const a = (Math.atan2(dy, dx) / TAU + 1) % 1;
  const s = Math.floor(a * n + hash(k, 0, seed) * n) % n;
  return (k + 50) * 1000 + s;
}
// Compass rose: 4 long points (N E S W) over 4 short diagonals, each split into a lit and a
// shaded half (the classic chart rose), on a disc ringed in dial stone.
const ROSE_LONG = 28;
const ROSE_SHORT = 18;
const ROSE_DISC = 33;
function triSign(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}
function inTri(x: number, y: number, a: [number, number], b: [number, number], c: [number, number]): boolean {
  const d1 = triSign(x, y, a[0], a[1], b[0], b[1]);
  const d2 = triSign(x, y, b[0], b[1], c[0], c[1]);
  const d3 = triSign(x, y, c[0], c[1], a[0], a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
/** Region of the rose: -1 outside, else point*2 + half (0 = the half clockwise of the tip). */
function roseRegion(dx: number, dy: number): number {
  let hit = -1;
  for (const p of [1, 3, 5, 7, 0, 2, 4, 6]) {
    const ang = -Math.PI / 2 + (p * Math.PI) / 4;
    const long = p % 2 === 0;
    const L = long ? ROSE_LONG : ROSE_SHORT;
    const spread = Math.PI / 4;
    const vr = long ? 8 : 5;
    const tip: [number, number] = [Math.cos(ang) * L, Math.sin(ang) * L];
    const A: [number, number] = [Math.cos(ang - spread) * vr, Math.sin(ang - spread) * vr];
    const B: [number, number] = [Math.cos(ang + spread) * vr, Math.sin(ang + spread) * vr];
    if (inTri(dx, dy, [0, 0], A, tip)) hit = p * 2;
    else if (inTri(dx, dy, [0, 0], tip, B)) hit = p * 2 + 1;
  }
  return hit;
}
/** Id function for everything inside the kerb (rose, inner courses, dial ring, outer courses). */
function plazaId(px: number, py: number): number {
  const dx = px + 0.5 - CI.cx;
  const dy = py + 0.5 - CI.cy;
  const r = Math.hypot(dx, dy);
  const R = CI.rx;
  if (r < ROSE_DISC + 2) {
    const rr = roseRegion(dx, dy);
    if (rr >= 0) return 900000 + rr;
    if (r < 3) return 900100;
    if (r >= ROSE_DISC) return 900200 + Math.floor(((Math.atan2(dy, dx) / TAU + 1) % 1) * 32);
    return 800000 + (courseId(px, py, CI.cx, CI.cy, 0, 5, 6, 61) % 100000);
  }
  if (r < R - 7) return courseId(px, py, CI.cx, CI.cy, ROSE_DISC + 2, 6, 8, 62);
  if (r < R + 7) {
    // dial ring: 24 dressed blocks (two per hour)
    const a = (Math.atan2(dy, dx) / TAU + 1.25) % 1; // 0 at the top
    return 700000 + Math.floor(a * 24 + 0.5) % 24;
  }
  return 600000 + (courseId(px, py, CI.cx, CI.cy, R + 7, 6, 8, 63) % 100000);
}
/** Hour marker inlay on the dial ring: 0 none, 1 mark, 2 its dark outline. */
function hourMark(px: number, py: number): number {
  const dx = px + 0.5 - CI.cx;
  const dy = py + 0.5 - CI.cy;
  const r = Math.hypot(dx, dy);
  const R = CI.rx;
  if (Math.abs(r - R) > 6) return 0;
  const a = (Math.atan2(dy, dx) / TAU + 1.25) % 1;
  const k = Math.round(a * 12) % 12;
  const off = (a * 12 - Math.round(a * 12)) * (TAU / 12) * r; // arc px from the mark's centre line
  const big = k % 3 === 0;
  const halfW = big ? 2.2 : 1.2;
  const halfL = big ? 4.6 : 3.2;
  const dr = Math.abs(r - R);
  if (k === 0) {
    // XII: a diamond
    const m = Math.abs(off) / 3.6 + dr / 5.2;
    return m <= 1 ? 1 : m <= 1.35 ? 2 : 0;
  }
  if (Math.abs(off) <= halfW && dr <= halfL) return 1;
  if (Math.abs(off) <= halfW + 1 && dr <= halfL + 1) return 2;
  return 0;
}
function plaza(px: number, py: number): RGBA {
  const dx = px + 0.5 - CI.cx;
  const dy = py + 0.5 - CI.cy;
  const r = Math.hypot(dx, dy);
  const R = CI.rx;
  const id = plazaId(px, py);
  // the dial ring
  if (id >= 700000 && id < 800000) {
    const hm = hourMark(px, py);
    if (hm === 1) {
      const t = 0.55 + (hash(px, py, 71) - 0.5) * 0.2 - (Math.abs(r - R) > 3 ? 0.12 : 0) - (dx + dy) * 0.0015;
      return dpick(BRASS, t + (bayer(px, py) - 0.5) * 0.1, px, py);
    }
    if (hm === 2) return col4('#2a2024');
    // dark rim lines on both edges of the ring
    if (Math.abs(r - (R - 7)) < 1 || Math.abs(r - (R + 7)) < 1) return col4('#2a2228');
    return cells(plazaId, px, py, DIAL, '#2e2428', 72, { tone: 0.22, rim: 0.2, grain: 0.12 });
  }
  if (id >= 900000) {
    if (id === 900100) return dpick(BRASS, 0.75 - (dx + dy) * 0.12, px, py);
    if (id >= 900200) return cells(plazaId, px, py, DIAL, '#2a2228', 73, { tone: 0.2, rim: 0.2, bias: -0.1 });
    const half = (id - 900000) % 2;
    const point = Math.floor((id - 900000) / 2);
    const long = point % 2 === 0;
    const me = id;
    const edge = plazaId(px - 1, py) !== me || plazaId(px, py - 1) !== me;
    if (edge) return col4('#26212c');
    const pal = half === 0 ? ROSE_L : ROSE_D;
    let v = (long ? 0.62 : 0.4) + (hash(px, py, 74) - 0.5) * 0.2;
    if (point === 0 && half === 0) v += 0.25; // north (towards the clock tower) is the brightest
    return dpick(pal, v, px, py);
  }
  if (id >= 800000) return cells(plazaId, px, py, SLATE, '#25212c', 75, { tone: 0.3, rim: 0.22 });
  const inner = id < 600000;
  const c = cells(plazaId, px, py, inner ? PLAZA_IN : PLAZA, '#2e2a35', inner ? 76 : 77, { tone: 0.3, rim: 0.24, grain: 0.14 });
  // gutter just inside the kerb
  const d = plazaD(px, py);
  if (d > KERB_EDGE - 0.012) return mix(c, '#1a1620', 0.45);
  return c;
}
/** Raised stone kerb around the square (outer face visible on the lower half). */
function kerbId(px: number, py: number): number {
  const dx = px + 0.5 - PZ.cx;
  const dy = py + 0.5 - PZ.cy;
  const r = Math.hypot(dx, dy);
  if (r > PZ.rx || r < PZ.rx - KERB_W) return -1;
  if (pathSD(px, py) <= 0 && code(Math.floor(px / TS), Math.floor(py / TS)) === G.cobble) return -2;
  const a = (Math.atan2(dy, dx) / TAU + 1) % 1;
  const course = r < PZ.rx - 6 ? 0 : 1;
  return course * 1000 + Math.floor(a * (course === 0 ? 60 : 56) + course * 0.5);
}
function kerb(px: number, py: number): RGBA {
  const dx = px + 0.5 - PZ.cx;
  const dy = py + 0.5 - PZ.cy;
  const r = Math.hypot(dx, dy);
  const outer = PZ.rx - r; // 0 at the outer edge
  // 3/4 view: the outer face of the kerb shows below the horizon line
  const face = dy > 8 && outer < 3 * Math.min(1, (dy - 8) / 40);
  if (face) return dpick(KERB, 0.12 - (dy / PZ.ry) * 0.1 + (hash(px, py, 81) - 0.5) * 0.12, px, py);
  if (outer < 0.9) return col4('#1c1822');
  const c = cells(kerbId, px, py, KERB, '#24202a', 82, { tone: 0.3, rim: 0.22 });
  return c;
}

function water(px: number, py: number, shore: number): RGBA {
  const n = fbm(px, py, 16, 21, P);
  let v = 0.25 + n * 0.55;
  const wave = Math.sin((pm(px) / P) * Math.PI * 2 * 3 + (pm(py) / P) * Math.PI * 2 * 13 + vnoise(px, py, 16, 22, P) * 9);
  if (wave > 0.93) v = 0.98;
  else if (wave > 0.85) v += 0.2;
  let c = dpick(WATER, v, px, py);
  if (hash(pm(px), pm(py), 23) < 0.003) c = col4('#8fb2c9');
  if (shore === 1) c = mix(c, '#6f8c99', 0.7);
  else if (shore === 2) c = mix(c, '#3f6078', 0.45);
  else if (shore === 3) c = mix(c, '#2a4866', 0.25);
  return c;
}

function bridge(px: number, py: number, tx: number, ty: number): RGBA {
  const run = (dx: number, dy: number) => {
    let n = 0;
    while (code(tx + dx * (n + 1), ty + dy * (n + 1)) === G.bridge) n++;
    return n;
  };
  const lx = px - tx * TS;
  const ly = py - ty * TS;
  const horizontalTravel = run(1, 0) + run(-1, 0) >= run(0, 1) + run(0, -1);
  const u = horizontalTravel ? px : py;
  const v = horizontalTravel ? py : px;
  const plank = Math.floor(pm(u) / 4);
  const pl = pm(u) % 4;
  let c = dpick(WOOD_BRIDGE, 0.35 + hash(plank, 0, 31) * 0.4 + vnoise(v, plank * 8, 8, 32, P) * 0.3, px, py);
  if (pl === 3) c = col4('#1c130e');
  if (pl === 0) c = mix(c, '#7a5a3e', 0.25);
  if ((pm(v) % 16 === 4 || pm(v) % 16 === 11) && pl === 1) c = col4('#7a7480');
  if (horizontalTravel) {
    if (code(tx, ty - 1) === G.water && ly < 3) c = ly === 2 ? col4('#1a120c') : dpick(['#3a2a1e', '#5a4330'], ly === 0 ? 0.9 : 0.4, px, py);
    if (code(tx, ty + 1) === G.water && ly > 12) c = ly === 13 ? col4('#5a4330') : ly === 15 ? col4('#140d09') : col4('#3a2a1e');
  } else {
    if (code(tx - 1, ty) === G.water && lx < 2) c = col4(lx === 0 ? '#3a2a1e' : '#1a120c');
    if (code(tx + 1, ty) === G.water && lx > 13) c = col4(lx === 15 ? '#140d09' : '#5a4330');
  }
  return c;
}

function hedge(px: number, py: number, tx: number, ty: number): RGBA {
  const lx = px - tx * TS;
  const ly = py - ty * TS;
  const faceBelow = code(tx, ty + 1) !== G.hedge;
  const n = vnoise(px, py, 4, 41, P) * 0.6 + vnoise(px, py, 8, 42, P) * 0.4;
  if (faceBelow && ly >= 10) {
    if (ly === 15) return col4('#070d09');
    return dpick(HEDGE_FACE, n * 0.9 + (ly < 12 ? 0.2 : 0), px, py);
  }
  let v = n;
  if (code(tx, ty - 1) !== G.hedge && ly < 2) v += 0.35;
  let c = dpick(HEDGE_TOP, v, px, py);
  if ((code(tx - 1, ty) !== G.hedge && lx === 0) || (code(tx + 1, ty) !== G.hedge && lx === 15)) c = col4('#0b150e');
  if (code(tx, ty - 1) !== G.hedge && ly === 0) c = col4('#0b150e');
  return c;
}

function stoneWall(px: number, py: number, tx: number, ty: number): RGBA {
  const lx = px - tx * TS;
  const ly = py - ty * TS;
  const capOnly = code(tx, ty + 1) === G.wall;
  const capH = capOnly ? 16 : 6;
  if (ly < capH) {
    let c = stones(px, py, 5, 8, WALL_CAP, '#2c2834', 51);
    if (code(tx, ty - 1) !== G.wall && ly === 0) c = col4('#1a1620');
    if (code(tx - 1, ty) !== G.wall && lx === 0) c = col4('#1a1620');
    if (code(tx + 1, ty) !== G.wall && lx === 15) c = col4('#1a1620');
    if (!capOnly && ly === capH - 1) c = col4('#24202c');
    return c;
  }
  let c = stones(px, py, 4, 7, WALL_FACE, '#1f1b26', 52);
  if (ly === 15) c = col4('#120f16');
  if (ly < 9 && vnoise(px, py, 4, 53, P) > 0.68) c = mix(c, '#3b5a32', 0.55);
  if (code(tx - 1, ty) !== G.wall && lx === 0) c = col4('#1a1620');
  if (code(tx + 1, ty) !== G.wall && lx === 15) c = col4('#1a1620');
  return c;
}

function cliff(px: number, py: number, tx: number, ty: number): RGBA {
  const ly = py - ty * TS;
  let below = 0;
  while (code(tx, ty + below + 1) === G.cliff) below++;
  const aboveIsCliff = code(tx, ty - 1) === G.cliff;
  const n = vnoise(px * 1.6, py * 0.35, 5, 61) * 0.6 + vnoise(px, py, 3, 62) * 0.4;
  let v = 0.2 + n * 0.7;
  const ledge = pm(py + Math.floor(vnoise(px, 0, 12, 63) * 6)) % 13;
  if (ledge === 0) v = 0.95;
  else if (ledge === 1) v = 0.05;
  let c = dpick(ROCK, v, px, py);
  if (!aboveIsCliff && ly < 4) {
    const hang = 2 + Math.floor(hash(pm(px), 0, 64) * 3);
    if (ly < hang) c = dpick(['#18261d', '#22362a', '#2d4433'], ly === 0 ? 0.8 : 0.4, px, py);
    else if (ly === hang) c = col4('#0d120f');
  }
  if (!aboveIsCliff && ly < 12 && hash(pm(px), 1, 65) < 0.08 && ly < 4 + hash(pm(px), 2, 66) * 10) c = col4('#2a4430');
  if (below === 0) {
    const jag = 11 + Math.floor(vnoise(px, 0, 5, 67) * 6);
    if (ly > jag) {
      const under = code(tx, ty + 1);
      return mix(under === G.forest ? forest(px, py) : grass(px, py), '#06040c', 0.55 - (ly - jag) * 0.06);
    }
    if (ly === jag) return col4('#0d0a12');
    const t = Math.max(0, (ly - 7) / 7);
    c = mix(c, '#07050a', t * 0.6);
  }
  return c;
}

// =========================================================================================
// Interiors. Each cottage room (11x9 tiles: wall caps round the edge, a two-tile back wall,
// six rows of floor) is seen big when you are inside, so it gets real detail: a ceiling beam,
// a wall that echoes the cottage's outer walls (wallpaper above wainscot for plaster cottages,
// limewash between timber posts, stone dado, brick, painted boards), floorboards (flagstones in
// stone cottages), a hearth slab in front of the fire, and small wall hangings in the gaps
// between the furniture. Palette: styles[id].interior (5 palettes x pattern variants).

interface IPal {
  paper: string[]; // wallpaper ground (3)
  motif: string;
  wash: string[]; // limewash (4)
  paint: string[]; // painted boards (4)
}
const IPALS: IPal[] = [
  { paper: ['#3f2f47', '#4b3953', '#56425e'], motif: '#6e5676', wash: ['#5e5460', '#6c626c', '#7a7078', '#888084'], paint: ['#332436', '#433046', '#523c56', '#614a64'] },
  { paper: ['#273a3e', '#30464b', '#3a5258'], motif: '#557074', wash: ['#566260', '#636f6c', '#717c78', '#808a84'], paint: ['#1e3234', '#2a4244', '#365254', '#446264'] },
  { paper: ['#4a3a28', '#574530', '#645038'], motif: '#84704c', wash: ['#6a5e4c', '#786c58', '#867a64', '#948870'], paint: ['#4a3420', '#5c4228', '#6e5232', '#80623e'] },
  { paper: ['#2e3c2c', '#384834', '#42543d'], motif: '#5c7254', wash: ['#5c6454', '#6a7260', '#78806c', '#868e78'], paint: ['#26341f', '#334428', '#405432', '#4e643c'] },
  { paper: ['#4a2a2e', '#583436', '#663e3e'], motif: '#845454', wash: ['#6a5a56', '#786662', '#86746e', '#94827a'], paint: ['#3e1e22', '#50282c', '#623236', '#743e40'] },
];
const WOODS: string[][] = [
  ['#2c1d15', '#3a281c', '#483224', '#563d2c', '#644834'],
  ['#2f2018', '#3e2b1f', '#4d3727', '#5c4330', '#6b4f39'],
  ['#2a2019', '#382b21', '#46362a', '#544133', '#624c3c'],
  ['#331f17', '#43291e', '#533426', '#633f2f', '#734b38'],
];
const BEAM = ['#160e0b', '#22160f', '#2e1e15', '#3b281c', '#4a3324'];
const FLAGS = ['#3a3438', '#453e42', '#50484c', '#5b5356', '#665e60'];

interface Hang {
  kind: number;
  x0: number; // room-local px
  w: number;
}
interface Room {
  b: BuildingDef;
  i: number;
  wall: string;
  pal: IPal;
  wood: string[];
  bw: number; // floorboard width
  flags: boolean;
  /** Fireplace (room-local px): left x, bottom y. */
  fire: { x: number; y: number } | null;
  hangs: Hang[];
}
const roomAt: (Room | undefined)[] = new Array(W * H);
for (const b of townLayout.buildings) {
  const st = townMap.styles[b.id];
  const r = b.interior;
  const idx = st?.interior ?? b.houseIndex ?? 0;
  const objs = townMap.objects.filter((o) => o.kind !== 'building' && o.x >= r.x && o.y >= r.y && o.x < r.x + r.w && o.y < r.y + r.h);
  const fp = objs.find((o) => o.kind === 'fireplace');
  // wall coverage by furniture (local px columns) to find gaps for hangings
  const covered = new Uint8Array(r.w * TS);
  for (const o of objs) {
    const d = PROP_DEFS[o.kind]!;
    if (d.flat) continue;
    const top = (o.y + 1) * TS - d.h;
    if (top >= (r.y + 2) * TS - 4) continue; // does not reach up the wall
    for (let x = o.x * TS - 2; x < o.x * TS + d.w + 2; x++) if (x - r.x * TS >= 0 && x - r.x * TS < covered.length) covered[x - r.x * TS] = 1;
  }
  const hangs: Hang[] = [];
  let run = 0;
  for (let x = TS + 3; x <= (r.w - 1) * TS - 3; x++) {
    const free = x < (r.w - 1) * TS - 3 && !covered[x];
    if (free) run++;
    else {
      if (run >= 12) {
        const x0 = x - run;
        const kind = Math.floor(hash(idx, hangs.length, 91) * 8);
        const w = Math.min(run - 4, kind === 2 ? 14 : 12);
        hangs.push({ kind, x0: x0 + Math.floor((run - w) / 2), w });
      }
      run = 0;
    }
  }
  const room: Room = {
    b,
    i: idx,
    wall: st?.wall ?? 'plaster',
    pal: IPALS[idx % IPALS.length]!,
    wood: WOODS[(idx * 3 + 1) % WOODS.length]!,
    bw: [6, 5, 7][idx % 3]!,
    flags: st?.wall === 'stone',
    fire: fp ? { x: (fp.x - r.x) * TS, y: (fp.y + 1 - r.y) * TS } : null,
    hangs,
  };
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomAt[y * W + x] = room;
}
const roomOf = (tx: number, ty: number) => (tx >= 0 && ty >= 0 && tx < W && ty < H ? roomAt[ty * W + tx] : undefined);

function floorWood(px: number, py: number, tx: number, ty: number): RGBA {
  const rm = roomOf(tx, ty);
  if (!rm) return dpick(WOODS[0]!, 0.5, px, py);
  const lx = px - rm.b.interior.x * TS;
  const ly = py - rm.b.interior.y * TS;
  let c: RGBA;
  if (rm.flags) {
    // big flagstones in irregular courses
    const rh = 13;
    const row = Math.floor((ly - 32) / rh);
    const id = (x: number, y: number) => {
      const rr = Math.floor((y - 32) / rh);
      const sw = 17 + Math.floor(hash(rr, rm.i, 92) * 9);
      const off = Math.floor(hash(rr, rm.i, 93) * sw);
      return rr * 4099 + Math.floor((x + off) / sw);
    };
    void row;
    c = cells((x, y) => id(x - rm.b.interior.x * TS, y - rm.b.interior.y * TS), px, py, FLAGS, '#211c20', 94 + rm.i, { tone: 0.34, rim: 0.2, grain: 0.14 });
    if (vnoise(px, py, 5, 95) > 0.74) c = mix(c, '#2a2226', 0.25);
  } else {
    // floorboards running across the room, staggered butt joints, nails, grain and knots
    const bw = rm.bw;
    const row = Math.floor(ly / bw);
    const vy = ly - row * bw;
    const L = 34 + Math.floor(hash(row, rm.i, 70) * 3) * 9;
    const q = lx + Math.floor(hash(row, rm.i, 71) * L);
    const seg = Math.floor(q / L);
    const sx = q - seg * L;
    const wood = rm.wood;
    const tone = (hash(seg, row, 73 + rm.i) - 0.5) * 0.34;
    if (vy === bw - 1) return mix(wood[0]!, wood[1]!, 0.25);
    if (sx === 0) return mix(wood[0]!, wood[1]!, 0.4);
    if ((sx === 2 || sx === L - 3) && vy === Math.floor(bw / 2) - 1) return mix(wood[0]!, '#6a6470', 0.25);
    const grain = vnoise(q * 0.35, row * 13 + vy * 3.1, 3, 72) - 0.5;
    let v = 0.46 + tone + grain * 0.28;
    if (vy === 0) v += 0.16;
    if (vy === bw - 2) v -= 0.1;
    // a knot now and then
    const kx = 6 + Math.floor(hash(seg, row, 75) * (L - 12));
    if (hash(seg, row, 76) < 0.22 && Math.abs(sx - kx) <= 1 && vy > 0 && vy < bw - 2) v -= 0.3;
    c = dpick(wood, v, px, py);
  }
  // hearth slab in front of the fire
  if (rm.fire) {
    const hx0 = rm.fire.x - 3;
    const hx1 = rm.fire.x + 35;
    const hy0 = rm.fire.y;
    const hy1 = rm.fire.y + 10;
    if (lx >= hx0 && lx < hx1 && ly >= hy0 && ly < hy1) {
      const hid = (x: number, y: number) => {
        const qx = x - rm.b.interior.x * TS;
        const qy = y - rm.b.interior.y * TS;
        if (qx < hx0 || qx >= hx1 || qy < hy0 || qy >= hy1) return -1;
        return Math.floor((qx - hx0) / 13);
      };
      if (ly === hy1 - 1 || lx === hx0 || lx === hx1 - 1) return col4('#1a1418');
      let h = cells(hid, px, py, ['#3e363a', '#4a4044', '#574b4e', '#64585a', '#72666a'], '#221c20', 96, { tone: 0.2, rim: 0.22 });
      const fx = rm.fire.x + 16;
      const ash = Math.hypot(lx - fx, (ly - hy0) * 1.6);
      if (ash < 9 && hash(px, py, 97) < 0.4 - ash * 0.04) h = col4(hash(px, py, 98) < 0.5 ? '#2a2224' : '#6a5a52');
      return mix(h, '#e0a050', Math.max(0, 0.16 - ash * 0.006));
    }
    // warm firelight pooled on the floor
    const fx = rm.fire.x + 16;
    const d = Math.hypot(lx - fx, (ly - rm.fire.y) * 1.25);
    if (d < 84) c = mix(c, '#d89048', (1 - d / 84) * 0.13);
  }
  // soft vignette into the front corners
  const ex = Math.min(lx - TS, rm.b.interior.w * TS - TS - lx);
  if (ex < 14) c = mix(c, '#0a0610', (14 - ex) * 0.012);
  return c;
}

function floorStone(px: number, py: number, _tx: number, _ty: number): RGBA {
  return stones(px, py, 8, 10, ['#2d2a30', '#37333a', '#423d44', '#4d474e'], '#17141a', 75);
}

/** One wall hanging pixel (room-local face coordinates), or null. */
function hanging(h: Hang, x: number, fy: number, rm: Room): RGBA | null {
  const u = x - h.x0;
  const w = h.w;
  if (u < 0 || u >= w) return null;
  const pal = rm.pal;
  const frame = ['#2a1a10', '#4a3018', '#6e4c24', '#9a7434'];
  switch (h.kind) {
    case 0:
    case 1: {
      // framed painting: a landscape (0) or a portrait (1)
      const top = h.kind === 0 ? 7 : 5;
      const bot = h.kind === 0 ? 16 : 18;
      if (fy < top || fy > bot) return fy === bot + 1 && u > 0 && u < w - 1 ? col4('#140c0c') : null;
      if (fy === top || fy === bot || u === 0 || u === w - 1) return dpick(frame, fy === top || u === 0 ? 0.85 : 0.35, x, fy);
      const iy = (fy - top - 1) / (bot - top - 1);
      if (h.kind === 0) {
        const hill = 0.55 + Math.sin(u * 0.9 + rm.i) * 0.12;
        if (iy < hill) return col4(iy < 0.25 ? '#8a8a9a' : '#6a7a8e');
        return col4(iy < hill + 0.18 ? '#4a6a44' : '#3a5434');
      }
      const cx = (w - 1) / 2;
      const head = Math.hypot(u - cx, (fy - top - 4) * 1.1);
      if (head < 2.2) return col4('#c8a488');
      if (iy > 0.55 && Math.abs(u - cx) < 3 + (iy - 0.55) * 6) return col4(pal.paint[2]!);
      return col4('#2a2230');
    }
    case 2: {
      // round mirror on a cord
      const cx = h.x0 + (w - 1) / 2;
      if (fy >= 3 && fy < 7 && Math.abs(x - cx) * 2 < 7 - fy) return null;
      if (fy >= 3 && fy <= 6 && Math.abs(x - cx - (fy - 6) * 0.9) < 0.6) return col4('#6a5a40');
      if (fy >= 3 && fy <= 6 && Math.abs(x - cx + (fy - 6) * 0.9) < 0.6) return col4('#6a5a40');
      const d = Math.hypot(x - cx, fy - 12);
      if (d < 4.2) return col4(x - cx + (fy - 12) < -1 ? '#c0c8d4' : '#7f8a9a');
      if (d < 5.6) return dpick(['#3e2c12', '#634a1e', '#8a6a2c', '#ad8a3e'], 0.6 - (fy - 12) * 0.08, x, fy);
      return null;
    }
    case 3: {
      // drying herbs on a peg
      if (fy === 6 && u > 1 && u < w - 2) return col4('#3a2616');
      if (fy >= 7 && fy <= 14 && (u === 3 || u === 6 || u === 9)) {
        const g = ['#3a5a34', '#5a6a3a', '#6a5a7a'][u % 3]!;
        return fy < 9 ? col4('#7a6040') : mix(g, '#000000', (fy - 9) * 0.05 + (hash(x, fy, 99) < 0.3 ? 0.2 : 0));
      }
      if (fy >= 10 && fy <= 13 && (u === 2 || u === 4 || u === 5 || u === 7 || u === 8 || u === 10) && hash(x, fy, 100) < 0.6) return col4('#4a6a3e');
      return null;
    }
    case 4: {
      // brass candle sconce
      const cx = h.x0 + Math.floor(w / 2);
      const dx = x - cx;
      if (fy >= 9 && fy <= 15 && Math.abs(dx) <= 1) return dpick(BRASS, 0.8 - dx * 0.3, x, fy);
      if (fy === 9 && Math.abs(dx) <= 2) return col4('#8a6a2c');
      if (fy >= 5 && fy <= 8 && dx === 0) return col4('#e8e0cc');
      if (fy === 4 && dx === 0) return col4('#ffd070');
      if (fy === 3 && dx === 0) return col4('#ffefb0');
      return null;
    }
    case 5: {
      // embroidered sampler
      if (fy < 6 || fy > 16) return null;
      if (fy === 6 || fy === 16 || u === 0 || u === w - 1) return dpick(frame, 0.5, x, fy);
      if ((fy === 9 || fy === 13) && u > 1 && u < w - 2 && (u + fy) % 2 === 0) return col4(pal.motif);
      if (fy === 11 && u > 2 && u < w - 3) return col4('#8a3a3a');
      return col4('#c8bca0');
    }
    case 6: {
      // shelf of plates
      if (fy === 13) return col4('#5a3c24');
      if (fy === 14) return col4('#1e140e');
      for (const k of [0, 1]) {
        const cx = h.x0 + 3 + k * 6;
        const d = Math.hypot(x - cx, (fy - 9) * 1.05);
        if (d < 2.9) return col4(d < 1.4 ? '#b8b0a4' : '#d8d0c4');
        if (d < 3.6) return col4('#3a5a8a');
      }
      return null;
    }
    default: {
      // horseshoe for luck
      const cx = h.x0 + (w - 1) / 2;
      const d = Math.hypot(x - cx, (fy - 10) * 1.1);
      if (fy <= 11 && d >= 2.2 && d < 3.8) return col4(fy < 9 ? '#8a8a96' : '#5a5a66');
      if (fy > 11 && fy <= 14 && Math.abs(Math.abs(x - cx) - 3) < 0.8) return col4('#5a5a66');
      return null;
    }
  }
}

/** The back wall's face (fy 0..31 from the ceiling beam down to the skirting). */
function wallFace(px: number, py: number, fy: number, rm: Room): RGBA {
  const lx = px - rm.b.interior.x * TS;
  const pal = rm.pal;
  // ceiling beam
  if (fy < 4) {
    if (fy === 0) return col4('#0c0809');
    if (fy === 3) return col4('#140d0b');
    return dpick(BEAM, (fy === 1 ? 0.7 : 0.45) + (vnoise(lx * 0.3, fy, 3, 101) - 0.5) * 0.3, px, py);
  }
  let c: RGBA | null = null;
  // hangings in the gaps between furniture
  for (const h of rm.hangs) {
    const hc = hanging(h, lx, fy, rm);
    if (hc) return hc;
  }
  const wall = rm.wall;
  const skirting = fy >= 30;
  if (skirting) c = col4(fy === 30 ? '#2a1c14' : '#120c0a');
  else if (wall === 'plaster') {
    // wallpaper over a panelled wainscot
    if (fy < 19) {
      const p = rm.i % 3;
      const base = dpick(pal.paper, 0.45 + (vnoise(px, py, 6, 102) - 0.5) * 0.3, px, py);
      let motif = false;
      if (p === 0) {
        // damask lattice
        const u = (lx + (Math.floor((fy - 4) / 8) % 2) * 4) % 8;
        const v = (fy - 4) % 8;
        motif = (u === 3 && v >= 2 && v <= 5) || (v === 3 && u >= 2 && u <= 4) || (u === 2 && v === 5) || (u === 4 && v === 5) || (u === 7 && v === 7);
      } else if (p === 1) {
        // regency stripes
        const u = lx % 7;
        motif = u === 0 || u === 1 || (u === 4 && (fy & 1) === 0);
      } else {
        // sprigs on a half-drop
        const col = Math.floor(lx / 6);
        const u = lx % 6;
        const v = (fy - 4 + (col % 2) * 3) % 6;
        motif = (u === 2 && v === 2) || (u === 3 && v === 1) || (u === 3 && v === 3) || (u === 2 && v === 3);
      }
      c = motif ? mix(pal.motif, base, 0.25) : base;
    } else if (fy === 19) c = col4('#6a4c32');
    else if (fy === 20) c = col4('#3a2818');
    else {
      // raised panels
      const pw = 12;
      const u = (lx - 16 + 6) % pw;
      const fyy = fy - 21; // 0..8
      const wood = rm.wood;
      if (u === 0) c = mix(wood[0]!, '#000000', 0.2);
      else if (u === 1 || fyy === 0) c = dpick(wood, 0.62, px, py);
      else if (u >= 3 && u <= pw - 2 && fyy >= 2 && fyy <= 7) {
        let v = 0.5;
        if (u === 3 || fyy === 2) v = 0.25;
        if (u === pw - 2 || fyy === 7) v = 0.75;
        c = dpick(wood, v + (bayer(px, py) - 0.5) * 0.1, px, py);
      } else c = dpick(wood, 0.42, px, py);
    }
  } else if (wall === 'timber') {
    // limewash between dark posts, a mid rail and a brace or two
    const post = (lx - 16 + 2) % 48;
    const isPost = post < 4;
    const rail = fy === 17 || fy === 18;
    const braceU = (lx - 16 + 2) % 48;
    const brace = !isPost && fy > 4 && fy < 17 && (Math.floor((lx - 16 + 2) / 48) + rm.i) % 2 === 0 && Math.abs(braceU - 4 - (16 - fy) * 1.2) < 1.6;
    if (isPost || rail || brace) {
      const v = isPost ? (post === 0 ? 0.65 : post === 3 ? 0.15 : 0.4) : rail ? (fy === 17 ? 0.6 : 0.25) : 0.4;
      c = dpick(BEAM, v + (vnoise(px * 0.5, py * 2, 3, 103) - 0.5) * 0.2, px, py);
    } else {
      c = dpick(pal.wash, 0.5 + (vnoise(px, py, 5, 104) - 0.5) * 0.35 + (hash(px, py, 105) < 0.03 ? -0.2 : 0), px, py);
      if (fy > 18) c = mix(c, '#20141a', 0.1);
    }
  } else if (wall === 'stone') {
    if (fy < 15) c = dpick(pal.wash, 0.55 + (vnoise(px, py, 5, 106) - 0.5) * 0.4, px, py);
    else if (fy === 15) c = col4('#5a3e28');
    else if (fy === 16) c = col4('#2a1a10');
    else c = cells((x, y) => bondId(x, y - 1, 5, 10, 107), px, py, ['#3e3840', '#4a434c', '#565058', '#625c64'], '#201c22', 108, { tone: 0.34, rim: 0.24 });
  } else if (wall === 'brick') {
    if (fy < 12) c = dpick(pal.wash, 0.5 + (vnoise(px, py, 5, 109) - 0.5) * 0.4, px, py);
    else if (fy === 12) c = col4('#5a3e28');
    else if (fy === 13) c = col4('#2a1a10');
    else c = cells((x, y) => bondId(x, y, 4, 9, 110), px, py, ['#4a2a26', '#5a3430', '#6a3e38', '#784a40'], '#2a1e1e', 111, { tone: 0.3, rim: 0.2 });
  } else {
    // painted board-and-batten
    const u = (lx - 16) % 9;
    if (fy === 12 || fy === 13) c = fy === 12 ? dpick(pal.paint, 0.85, px, py) : col4(mix(pal.paint[0]!, '#000000', 0.4));
    else if (u === 0) c = col4(mix(pal.paint[0]!, '#000000', 0.35));
    else if (u === 1) c = dpick(pal.paint, 0.8, px, py);
    else c = dpick(pal.paint, 0.45 + (vnoise(px * 0.4, py * 0.1 + u, 3, 112) - 0.5) * 0.3, px, py);
  }
  // shade under the beam, and into the corners
  if (fy < 7) c = mix(c!, '#0a0610', (7 - fy) * 0.07);
  const ex = Math.min(lx - TS, rm.b.interior.w * TS - TS - 1 - lx);
  if (ex < 8) c = mix(c!, '#0a0610', (8 - ex) * 0.05);
  return c!;
}

function iwall(px: number, py: number, tx: number, ty: number): RGBA {
  const ly = py - ty * TS;
  const lx = px - tx * TS;
  const fl = (c: string) => c === G.floorWood || c === G.floorStone;
  const rm = roomOf(tx, ty);
  const lower = fl(code(tx, ty + 1));
  const upper = !lower && code(tx, ty + 1) === G.iwall && fl(code(tx, ty + 2));
  if ((lower || upper) && rm) return wallFace(px, py, upper ? ly : ly + 16, rm);
  // cap (the top of a thick wall seen from above)
  let c = dpick(['#141017', '#1a151d', '#211b24'], vnoise(px, py, 5, 84) * 0.8 + (hash(px, py, 85) < 0.04 ? 0.3 : 0), px, py);
  const nb = (dx: number, dy: number) => fl(code(tx + dx, ty + dy)) || code(tx + dx, ty + dy) === G.doorway;
  const inner = nb(1, 0) ? 15 - lx : nb(-1, 0) ? lx : nb(0, -1) ? ly : 99;
  if (inner <= 3) {
    // timber sill along the room's edge
    if (inner === 0) return col4('#0b0809');
    return dpick(BEAM, inner === 1 ? 0.85 : inner === 2 ? 0.55 : 0.3, px, py);
  }
  // the beam's end where the back wall meets a side wall
  if (!nb(1, 0) && !nb(-1, 0) && !nb(0, -1)) {
    const down = code(tx, ty + 1);
    if (down === G.iwall && (fl(code(tx + 1, ty + 1)) || fl(code(tx - 1, ty + 1)))) c = mix(c, '#000000', 0.15);
  }
  return c;
}

function doorway(px: number, py: number, tx: number, ty: number): RGBA {
  const ly = py - ty * TS;
  const lx = px - tx * TS;
  if (lx < 2 || lx > 13) return lx === 1 || lx === 14 ? dpick(BEAM, 0.7, px, py) : col4('#141017');
  // threshold: a worn oak sill, then flagstones with daylight spilling in from outside
  if (ly < 3) return dpick(BEAM, ly === 0 ? 0.85 : 0.5, px, py);
  const base = cells((x, y) => bondId(x, y, 5, 7, 85), px, py, ['#2a2630', '#34303a', '#3e3944', '#48434e'], '#141118', 86, { tone: 0.3 });
  return mix(base, '#9ab0d0', Math.max(0, (ly - 5) / 11) * 0.35);
}

// ---------------------------------------------------------------------------------------

function shoreDist(px: number, py: number): number {
  for (let r = 1; r <= 3; r++) {
    if (matAt(px, py - r) !== G.water && matAt(px, py - r) !== G.bridge) return r;
    if (matAt(px - r, py) !== G.water || matAt(px + r, py) !== G.water) return r;
    if (r === 1 && matAt(px, py + 1) !== G.water) return 1;
  }
  return 0;
}

function baseColor(px: number, py: number, m: string): RGBA {
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  switch (m) {
    case G.grass:
      return grass(px, py);
    case VERGE:
      return verge(px, py);
    case G.forest:
      return forest(px, py);
    case G.dense:
      return canopy(px, py);
    case G.dirt:
      return dirt(px, py);
    case G.sand:
      return sand(px, py);
    case G.soil:
      return soil(px, py);
    case G.gravel:
      return gravel(px, py);
    case G.cobble:
      return inTown(tx, ty) ? cobble(px, py) : stones(px, py, 6, 8, COBBLE, '#24212c', 33);
    case G.plaza:
      return plaza(px, py);
    case G.ring:
      return kerb(px, py);
    case G.water:
      return water(px, py, shoreDist(px, py));
    case G.bridge:
      return bridge(px, py, tx, ty);
    case G.hedge:
      return hedge(px, py, tx, ty);
    case G.wall:
      return stoneWall(px, py, tx, ty);
    case G.cliff:
      return cliff(px, py, tx, ty);
    case G.floorWood:
      return floorWood(px, py, tx, ty);
    case G.floorStone:
      return floorStone(px, py, tx, ty);
    case G.iwall:
      return iwall(px, py, tx, ty);
    case G.doorway:
      return doorway(px, py, tx, ty);
    default:
      return col4('#09070d');
  }
}

function shadowAmount(px: number, py: number, m: string): number {
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  const lx = px - tx * TS;
  const ly = py - ty * TS;
  let s = 0;
  const solidAbove = (c: string) => c === G.wall || c === G.hedge || c === G.cliff;
  if (m === G.floorWood || m === G.floorStone) {
    if (code(tx, ty - 1) === G.iwall) s = Math.max(s, ly < 6 ? 0.5 - ly * 0.08 : 0);
    if (code(tx - 1, ty) === G.iwall && lx < 4) s = Math.max(s, 0.42 - lx * 0.1);
    if (code(tx + 1, ty) === G.iwall && lx > 12) s = Math.max(s, 0.3 - (15 - lx) * 0.09);
    return s;
  }
  if (m === G.wall || m === G.hedge || m === G.cliff || m === G.iwall || m === G.dense || isFp(tx, ty)) return 0;
  if ((solidAbove(code(tx, ty - 1)) || isFp(tx, ty - 1)) && ly < 6) s = Math.max(s, (isFp(tx, ty - 1) ? 0.6 : 0.45) - ly * 0.08);
  if (isFp(tx - 1, ty) && lx < 5) s = Math.max(s, 0.45 - lx * 0.09);
  if (isFp(tx - 1, ty - 1) && !isFp(tx, ty - 1) && lx < 5 && ly < 5) s = Math.max(s, 0.35 - (lx + ly) * 0.05);
  // the forest rim shades the grass at its foot
  if (inTown(tx, ty)) {
    for (let k = 1; k <= 6; k++) {
      if (matAt(px, py - k) === G.dense || matAt(px - k, py) === G.dense) {
        s = Math.max(s, 0.4 - k * 0.06);
        break;
      }
      if (k <= 3 && matAt(px + k, py) === G.dense) {
        s = Math.max(s, 0.25 - k * 0.07);
        break;
      }
    }
  }
  // grass lip over lower ground (paths are sunk a little; the kerb stands proud)
  if (LOW.has(m) && m !== G.bridge && m !== G.ring && m !== G.plaza) {
    const up = matAt(px, py - 1);
    if (GRASSY.has(up)) s = Math.max(s, 0.3);
    else if (GRASSY.has(matAt(px, py - 2))) s = Math.max(s, 0.15);
  }
  // the kerb throws a thin shadow onto the setts inside it (light from the upper left)
  if (m === G.plaza) {
    const dx = px + 0.5 - PZ.cx;
    const dy = py + 0.5 - PZ.cy;
    const r = Math.hypot(dx, dy);
    const toEdge = PZ.rx - KERB_W - r;
    if (toEdge < 3 && dx * LX + dy * LY < 0) s = Math.max(s, (0.28 * (3 - toEdge)) / 3 * Math.min(1, -(dx * LX + dy * LY) / r / 0.4));
  }
  return s;
}

export function renderGround(): Img {
  const img = new Img(W * TS, H * TS);
  const mat = new Array<string>(img.w * img.h);
  for (let py = 0; py < img.h; py++) for (let px = 0; px < img.w; px++) mat[py * img.w + px] = matRaw(px, py);
  MAT = mat;
  for (let py = 0; py < img.h; py++)
    for (let px = 0; px < img.w; px++) {
      const m = mat[py * img.w + px]!;
      let c = baseColor(px, py, m);
      const s = shadowAmount(px, py, m);
      if (s > 0) c = mix(c, '#06040c', s);
      // grass edge highlight where it meets lower ground below
      if ((m === G.grass || m === G.forest || m === VERGE) && LOW.has(matAt(px, py + 1)) && bayer(px, py) < 0.6) c = mix(c, '#6f8a52', 0.25);
      img.set(px, py, c);
    }
  return img;
}

/** Slice into unique 16x16 tiles. Returns tileset image + per-cell tile index (0-based). */
export function sliceTiles(img: Img, columns = 64): { tileset: Img; indices: number[]; count: number } {
  const w = img.w / TS;
  const h = img.h / TS;
  const map = new Map<string, number>();
  const tiles: Img[] = [];
  const indices = new Array<number>(w * h);
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const t = new Img(TS, TS);
      t.copy(img, 0, 0, tx * TS, ty * TS, TS, TS);
      const key = Buffer.from(t.data.buffer).toString('base64');
      let idx = map.get(key);
      if (idx === undefined) {
        idx = tiles.length;
        tiles.push(t);
        map.set(key, idx);
      }
      indices[ty * w + tx] = idx;
    }
  const rows = Math.ceil(tiles.length / columns);
  const tileset = new Img(columns * TS, rows * TS);
  tiles.forEach((t, i) => tileset.copy(t, (i % columns) * TS, Math.floor(i / columns) * TS));
  return { tileset, indices, count: tiles.length };
}
