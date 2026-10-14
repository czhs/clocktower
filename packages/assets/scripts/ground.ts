// Ground renderer: paints the whole 160x96 tile map pixel-by-pixel from the handcrafted ground
// codes (layout.ts), with domain-warped organic edges between soft materials, a geometric
// town-square circle, shorelines, contact shadows and 3/4-view walls. The result is sliced into
// 16x16 tiles and de-duplicated into a Tiled tileset (terrain.png) + ground layer indices.
import { G, interiorBuildingAt, townLayout, townMap, TS } from '../src/layout.js';
import { bayer, dpick, fbm, hash, Img, mix, type Color, type RGBA, vnoise } from './lib/img.js';

const W = townMap.width;
const H = townMap.height;
const P = 64; // texture period (px) so large areas de-duplicate into few tiles
const pm = (v: number) => ((v % P) + P) % P;

const code = (tx: number, ty: number): string => (tx < 0 || ty < 0 || tx >= W || ty >= H ? ' ' : townMap.ground[ty]![tx]!);

const SOFT = new Set<string>([G.grass, G.forest, G.dense, G.dirt, G.sand, G.soil, G.gravel, G.cobble, G.plaza, G.ring, G.water]);
const LOW = new Set<string>([G.dirt, G.sand, G.soil, G.gravel, G.cobble, G.plaza, G.ring, G.water, G.bridge]);
const SQ = townLayout.square;

// Building footprints (for contact shadows).
const footprint = new Uint8Array(W * H);
for (const b of townLayout.buildings) {
  const f = b.footprint;
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) footprint[y * W + x] = 1;
}
const isFp = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < W && ty < H && footprint[ty * W + tx] === 1;

/** Material at a pixel after warping and square override. */
function matAt(px: number, py: number): string {
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  let c = code(tx, ty);
  if (SOFT.has(c)) {
    const wx = px + (vnoise(px, py, 7, 101) - 0.5) * 9;
    const wy = py + (vnoise(px, py, 7, 202) - 0.5) * 9;
    const c2 = code(Math.floor(wx / TS), Math.floor(wy / TS));
    if (SOFT.has(c2)) c = c2;
  }
  if (tx < 96) {
    const d = Math.hypot(px + 0.5 - SQ.cx, py + 0.5 - SQ.cy);
    if (d <= SQ.r) {
      if (c === G.plaza || c === G.ring || c === G.grass || c === G.forest || c === G.dirt) c = d > SQ.r - 13 ? G.ring : G.plaza;
      else if (c === G.cobble && d <= SQ.r - 13) c = G.plaza;
    } else if (c === G.plaza || c === G.ring) c = G.grass;
  }
  return c;
}

// ---------------------------------------------------------------------------------------
// Palettes

const GRASS = ['#1f3128', '#28402e', '#324e35', '#3f5d3b', '#4d6b42'];
const FOREST = ['#151f1c', '#1c2a23', '#243327', '#2d3c2b'];
const DENSE = ['#0e1513', '#131c18', '#18231d'];
const DIRT = ['#3e2e24', '#4c392b', '#5a4532', '#68513a', '#755d43'];
const SAND = ['#4c4536', '#5a523f', '#686048', '#776c52'];
const SOIL = ['#22180f', '#2e2116', '#3b2b1d', '#4a3725'];
const GRAVEL = ['#3e3b42', '#4b4850', '#58545c', '#68636a', '#7a7477'];
const COBBLE = ['#4a4656', '#534e5f', '#5c5768', '#655f70'];
const PLAZA = ['#5b5664', '#65606e', '#706a78', '#7b7482'];
const RING = ['#4a3436', '#563e3e', '#624a46', '#6e554e'];
const WATER = ['#0f1c2e', '#14253a', '#1a3048', '#213b57', '#2a4866'];
const ROCK = ['#1f1b26', '#2a2532', '#36303f', '#433c4c', '#524a5a'];
const HEDGE_TOP = ['#162a1c', '#1d3523', '#25412a', '#305034', '#3d6040'];
const HEDGE_FACE = ['#0e1c13', '#132519', '#1a3020'];
const WALL_FACE = ['#353140', '#3f3a4a', '#4a4555', '#555060'];
const WALL_CAP = ['#4f4a58', '#5c5664', '#6a6472', '#77717f'];
const WOOD_BRIDGE = ['#2e2018', '#3d2b1f', '#4d3727', '#5c4330'];

const WOODS: string[][] = [
  ['#2e1f17', '#3a281d', '#463124', '#523a2b'],
  ['#33231a', '#412d21', '#4f3829', '#5d4331'],
  ['#2b2018', '#372a20', '#433428', '#4f3e30'],
  ['#36241c', '#452f24', '#543a2c', '#634535'],
];
const WALLPAPERS: { base: string; pat: string; wains: string[] }[] = [
  { base: '#3e2f45', pat: '#4d3b55', wains: ['#2a1d17', '#3a281d', '#4a3426'] },
  { base: '#2d3c42', pat: '#3a4b52', wains: ['#2a1d17', '#3a281d', '#4a3426'] },
  { base: '#46392a', pat: '#554634', wains: ['#2b1f19', '#3b2a21', '#4b362a'] },
  { base: '#2f3d2f', pat: '#3c4c3a', wains: ['#2a1d17', '#3a281d', '#4a3426'] },
  { base: '#4a2f31', pat: '#5a3a3c', wains: ['#2b1f19', '#3b2a21', '#4b362a'] },
];

function interiorIndex(tx: number, ty: number): number {
  const b = interiorBuildingAt(tx, ty);
  return b ? (townMap.styles[b.id]?.interior ?? 0) : 0;
}
function interiorKind(tx: number, ty: number): string {
  return interiorBuildingAt(tx, ty)?.kind ?? 'house';
}

// ---------------------------------------------------------------------------------------
// Materials

function grass(px: number, py: number): RGBA {
  const n = fbm(px, py, 16, 1, P) * 0.75 + vnoise(px, py, 4, 2, P) * 0.25;
  const h = hash(pm(px), pm(py), 3);
  if (h < 0.035) return mix(GRASS[4]!, '#7a8f55', 0.35);
  if (hash(pm(px), pm(py - 1), 3) < 0.035) return mix(GRASS[0]!, GRASS[1]!, 0.5);
  return dpick(GRASS, n * 1.05 - 0.02, px, py);
}
function forest(px: number, py: number): RGBA {
  const n = fbm(px, py, 12, 5, P);
  const h = hash(pm(px), pm(py), 6);
  if (h < 0.05) return mix('#4a3626', '#2a1f18', hash(pm(px), pm(py), 7));
  return dpick(FOREST, n, px, py);
}
function dirt(px: number, py: number): RGBA {
  const n = fbm(px, py, 10, 8, P);
  const h = hash(pm(px), pm(py), 9);
  if (h < 0.03) return col4(DIRT[4]!);
  if (hash(pm(px), pm(py - 1), 9) < 0.03) return col4(DIRT[0]!);
  return dpick(DIRT, 0.15 + n * 0.75, px, py);
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
function col4(c: Color): RGBA {
  return typeof c === 'string' ? (mix(c, c, 0) as RGBA) : c;
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
  // rounded corners
  if ((ly === 1 || ly === rh - 1) && (lx === 1 || lx === sw - 1)) return mix(mortar, pal[0]!, 0.5);
  let v = 0.25 + sid * 0.5;
  if (ly === 1 || lx === 1) v += 0.3;
  if (ly === rh - 1 || lx === sw - 1) v -= 0.3;
  v += (hash(pm(px), pm(py), seed + 2) - 0.5) * 0.25;
  return dpick(pal, v, px, py);
}

function water(px: number, py: number, shore: number): RGBA {
  const n = fbm(px, py, 16, 21, P);
  let v = 0.25 + n * 0.55;
  const wave = Math.sin(px * 0.3 + py * 1.3 + vnoise(px, py, 16, 22, P) * 9);
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
  const u = horizontalTravel ? px : py; // across planks
  const v = horizontalTravel ? py : px;
  const plank = Math.floor(pm(u) / 4);
  const pl = pm(u) % 4;
  let c = dpick(WOOD_BRIDGE, 0.35 + hash(plank, 0, 31) * 0.4 + vnoise(v, plank * 7, 6, 32) * 0.3, px, py);
  if (pl === 3) c = col4('#1c130e');
  if (pl === 0) c = mix(c, '#7a5a3e', 0.25);
  if ((pm(v) % 16 === 4 || pm(v) % 16 === 11) && pl === 1) c = col4('#7a7480'); // nails
  // railings along the water edges
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
  const n = vnoise(px, py, 3, 41) * 0.6 + vnoise(px, py, 7, 42) * 0.4;
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
  if (ly < 9 && vnoise(px, py, 5, 53) > 0.68) c = mix(c, '#3b5a32', 0.55); // moss
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
  // strata ledges
  const ledge = pm(py + Math.floor(vnoise(px, 0, 12, 63) * 6)) % 13;
  if (ledge === 0) v = 0.95;
  else if (ledge === 1) v = 0.05;
  let c = dpick(ROCK, v, px, py);
  if (!aboveIsCliff && ly < 4) {
    // grassy overhang
    const hang = 2 + Math.floor(hash(pm(px), 0, 64) * 3);
    if (ly < hang) c = dpick(['#18261d', '#22362a', '#2d4433'], ly === 0 ? 0.8 : 0.4, px, py);
    else if (ly === hang) c = col4('#0d120f');
  }
  if (!aboveIsCliff && ly < 12 && hash(pm(px), 1, 65) < 0.08 && ly < 4 + hash(pm(px), 2, 66) * 10) c = col4('#2a4430'); // vines
  if (below === 0) {
    const t = Math.max(0, (ly - 9) / 7);
    c = mix(c, '#07050a', t * 0.75);
  }
  return c;
}

// --- interiors ---------------------------------------------------------------------------

function floorWood(px: number, py: number, tx: number, ty: number): RGBA {
  const pal = WOODS[interiorIndex(tx, ty) % WOODS.length]!;
  const row = Math.floor(pm(py) / 4);
  const ly = pm(py) % 4;
  const off = Math.floor(hash(row, 0, 71) * 40);
  const seg = Math.floor((pm(px) + off) / 32);
  const segX = (pm(px) + off) % 32;
  if (ly === 3) return col4('#160e0a');
  if (segX === 0) return col4('#1c120d');
  const grain = vnoise(px * 0.25, py * 2, 3, 72 + row);
  let v = 0.3 + hash(seg, row, 73) * 0.35 + (grain - 0.5) * 0.35;
  if (ly === 0) v += 0.25;
  return dpick(pal, v, px, py);
}

function floorStone(px: number, py: number, tx: number, ty: number): RGBA {
  const chapel = interiorKind(tx, ty) === 'chapel';
  const pal = chapel ? ['#2b2733', '#35303f', '#3f3a4a', '#4a4456'] : ['#2d2a30', '#37333a', '#423d44', '#4d474e'];
  if (chapel) {
    // checkered flagstones
    const cx = Math.floor(pm(px) / 8);
    const cy = Math.floor(pm(py) / 8);
    const lx = pm(px) % 8;
    const ly = pm(py) % 8;
    if (lx === 0 || ly === 0) return col4('#18151d');
    let v = (cx + cy) % 2 === 0 ? 0.65 : 0.25;
    if (lx === 1 || ly === 1) v += 0.2;
    return dpick(pal, v + (hash(pm(px), pm(py), 74) - 0.5) * 0.2, px, py);
  }
  return stones(px, py, 8, 10, pal, '#17141a', 75);
}

function iwall(px: number, py: number, tx: number, ty: number): RGBA {
  const ly = py - ty * TS;
  const lx = px - tx * TS;
  const fl = (c: string) => c === G.floorWood || c === G.floorStone;
  const kind = interiorKind(tx, ty);
  const stoneRoom = kind === 'chapel' || kind === 'clocktower';
  const wp = WALLPAPERS[interiorIndex(tx, ty) % WALLPAPERS.length]!;
  const lower = fl(code(tx, ty + 1));
  const upper = !lower && code(tx, ty + 1) === G.iwall && fl(code(tx, ty + 2));
  if (lower || upper) {
    const fy = upper ? ly : ly + 16; // 0..31 across the two-tile face
    if (stoneRoom) {
      let c = stones(px, py, 6, 11, ['#2e2a36', '#383340', '#433d4b', '#4e4757'], '#1a1720', 81);
      if (fy < 3) c = col4(fy === 2 ? '#141118' : '#3a3444');
      if (fy >= 30) c = col4(fy === 31 ? '#0e0c12' : '#24202a');
      return c;
    }
    if (fy < 3) return col4(fy === 0 ? '#1a120e' : fy === 1 ? '#4a3426' : '#2a1d17'); // crown moulding
    if (fy < 20) {
      // wallpaper with a small damask motif
      const mx = pm(px) % 8;
      const my = (fy + 1) % 8;
      const motif = (mx === 3 && my === 3) || (mx === 4 && my === 4) || (mx === 3 && my === 5) || (mx === 2 && my === 4);
      let c = motif ? col4(wp.pat) : dpick([wp.base, wp.pat], 0.15 + vnoise(px, py, 6, 82) * 0.25, px, py);
      if (fy > 16) c = mix(c, '#0c0810', (fy - 16) * 0.08);
      return c;
    }
    if (fy === 20) return col4(wp.wains[2]!); // chair rail
    if (fy === 21) return col4('#140d0a');
    if (fy >= 30) return col4(fy === 31 ? '#0c0807' : '#1d1410'); // baseboard
    const panel = pm(px) % 12;
    if (panel === 0) return col4('#140d0a');
    if (panel === 1) return col4(wp.wains[2]!);
    return dpick(wp.wains, 0.35 + vnoise(px * 0.3, py * 2, 3, 83) * 0.3 + (fy === 22 ? 0.3 : 0), px, py);
  }
  // cap (wall seen from above)
  let c = dpick(['#16121b', '#1d1824', '#241e2c'], vnoise(px, py, 4, 84), px, py);
  const nb = (dx: number, dy: number) => fl(code(tx + dx, ty + dy)) || code(tx + dx, ty + dy) === G.doorway;
  if ((nb(1, 0) && lx >= 13) || (nb(-1, 0) && lx <= 2) || (nb(0, -1) && ly <= 2)) c = col4(stoneRoom ? '#4a4456' : '#3d2c22');
  if ((nb(1, 0) && lx === 15) || (nb(-1, 0) && lx === 0) || (nb(0, -1) && ly === 0)) c = col4('#0c090f');
  return c;
}

function doorway(px: number, py: number, tx: number, ty: number): RGBA {
  const ly = py - ty * TS;
  const lx = px - tx * TS;
  if (lx < 2 || lx > 13) return col4(lx === 1 || lx === 14 ? '#3d2c22' : '#16121b');
  // threshold stones with cool light spilling in from outside
  const base = stones(px, py, 4, 6, ['#2a2630', '#34303a', '#3e3944'], '#141118', 85);
  return mix(base, '#8aa0c8', Math.max(0, (ly - 6) / 10) * 0.35);
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

function baseColor(px: number, py: number): RGBA {
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  const m = matAt(px, py);
  switch (m) {
    case G.grass:
      return grass(px, py);
    case G.forest:
      return forest(px, py);
    case G.dense:
      return dpick(DENSE, fbm(px, py, 10, 91, P), px, py);
    case G.dirt:
      return dirt(px, py);
    case G.sand:
      return sand(px, py);
    case G.soil:
      return soil(px, py);
    case G.gravel:
      return gravel(px, py);
    case G.cobble:
      return stones(px, py, 6, 8, COBBLE, '#24212c', 33);
    case G.plaza: {
      const d = Math.hypot(px + 0.5 - SQ.cx, py + 0.5 - SQ.cy);
      if (d > SQ.r * 0.52 && d < SQ.r * 0.52 + 7) return stones(px, py, 7, 7, RING, '#241a1c', 35);
      return stones(px, py, 8, 12, PLAZA, '#2e2a36', 34);
    }
    case G.ring:
      return stones(px, py, 5, 9, RING, '#221819', 36);
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
    if (code(tx, ty - 1) === G.iwall) s = Math.max(s, ly < 5 ? 0.55 - ly * 0.1 : 0);
    if (code(tx - 1, ty) === G.iwall && lx < 3) s = Math.max(s, 0.4 - lx * 0.12);
    if (code(tx + 1, ty) === G.iwall && lx > 12) s = Math.max(s, 0.4 - (15 - lx) * 0.12);
    return s;
  }
  if (m === G.wall || m === G.hedge || m === G.cliff || m === G.iwall) return 0;
  if ((solidAbove(code(tx, ty - 1)) || isFp(tx, ty - 1)) && ly < 6) s = Math.max(s, (isFp(tx, ty - 1) ? 0.6 : 0.45) - ly * 0.08);
  if (isFp(tx - 1, ty) && lx < 5) s = Math.max(s, 0.45 - lx * 0.09);
  if (isFp(tx - 1, ty - 1) && !isFp(tx, ty - 1) && lx < 5 && ly < 5) s = Math.max(s, 0.35 - (lx + ly) * 0.05);
  // grass lip over lower ground
  if (LOW.has(m) && m !== G.bridge) {
    const up = matAt(px, py - 1);
    if (up === G.grass || up === G.forest || up === G.dense) s = Math.max(s, 0.3);
    else if (matAt(px, py - 2) === G.grass) s = Math.max(s, 0.15);
  }
  return s;
}

export function renderGround(): Img {
  const img = new Img(W * TS, H * TS);
  for (let py = 0; py < img.h; py++)
    for (let px = 0; px < img.w; px++) {
      const m = matAt(px, py);
      let c = baseColor(px, py);
      const s = shadowAmount(px, py, m);
      if (s > 0) c = mix(c, '#06040c', s);
      // grass edge highlight where it meets lower ground below
      if ((m === G.grass || m === G.forest) && LOW.has(matAt(px, py + 1)) && bayer(px, py) < 0.6) c = mix(c, '#6f8a52', 0.25);
      img.set(px, py, c);
    }
  return img;
}

/** Slice into unique 16x16 tiles. Returns tileset image + per-cell tile index (0-based). */
export function sliceTiles(img: Img, columns = 32): { tileset: Img; indices: number[]; count: number } {
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
