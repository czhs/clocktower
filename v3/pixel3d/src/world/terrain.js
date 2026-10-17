// Terrain (owner: terrain agent). docs/TECHNIQUES.md §4.1-4.3.
//
//   const terrain = createTerrain(engine, opts)
//   terrain.mesh                      THREE.Mesh (toon material, zone-field texture), already added to scene
//   terrain.heightAt(x, z) -> y       height of the actual mesh triangle at (x,z) (analytic outside the mesh)
//   terrain.normalAt(x, z) -> Vector3 world normal, interpolated exactly like the GPU does (smooth, split at cliffs)
//   terrain.colorAt(x, z) -> Color    linear mid albedo of the zone at (x,z) (grass tints from this)
//   terrain.tonesAt(x, z) -> {hi, mid, sh}  linear day tones of the zone (grass copies these -> tuft = ground)
//   terrain.zoneAt(x, z) -> int       one of ZONES (same decision as the fragment shader)
//   terrain.isGrass(x, z) -> bool     where grass/flowers may grow (not rock, path, cobble, sand, under water)
//   terrain.size, terrain.waterLevel  (waterLevel = -Infinity when no water)
//   terrain.analyticHeightAt(x, z)    the smooth/terraced height function the mesh was built from
//
// Options (all optional; the original stub options keep their meaning):
//   size 64, segments (default size/0.25, max 384), seed 3, height 4 (fbm amplitude), frequency 0.035,
//   center [0,0]
//   waterLevel / water: {level, shoreBand 0.25, wetBand 0.1, shore: 'sand'|'mud', bounds?: {x,z,r}|{x,z,w,h},
//                        shoreSlope [0.35, 0.9]}
//                       (bounds limits where the shore sand is painted; default everywhere below level+band).
//                       The sand band follows the slope: full width where |grad h| < shoreSlope[0], only the
//                       wet band (waterline) where |grad h| > shoreSlope[1]. Steep basin banks are never rock:
//                       grass (or wet sand at the waterline) reaches the water.
//   terrace: true | {step 1.2, riser 0.2, roll 0.2}  quantise the hills into flat terraces with rock cliffs
//   plateaus: [{x, z, r, levels 1, gap 1.4, noise 0.25}]  raised mesas with cliff steps (step = cliffHeight)
//   cliffHeight 1.2 (step height used by plateaus when terrace is off)
//   flatten: [{x, z, r, h?, falloff = r*0.6}]       flat pads (h defaults to the terrain height at x,z)
//   basins: [{x, z, rx, rz = rx, rot 0, depth 1, edge 0.4}]  carved hollows (ponds); union of ellipses
//   paths: [{points: [[x,z],...], width 1.2, kind 'dirt'|'cobble', noise 0.5}]
//   zones: [{type: 'dirt'|'cobble'|'sand', x, z, r, noise 0.35}]   painted patches
//   palette: {grass:[hi,mid,sh], grassDark, grassLight, dirt, cobble, ...} sRGB hex overrides
//   grassVariation [0.36, 0.63] noise thresholds for light / dark grass patches (0,1 disables)
//   rockSlope 0.62 (normal.y below this = rock), normalNoise 0.15, zoneRes 0.125 m
//   cobbleCell 0.46 m, grout 0.04 m, lip 0.1 m (grass overhang fringe on cliff tops: hi-tone blades hanging
//   1-4 px over the riser, 0 = off), edgeLines false (true = cliff tops / basin banks also get the outline
//   pass's convex edge highlight; default: depth outline only there, the lip fringe defines the edge)
import * as THREE from 'three';
import { fbm2 } from '../core/noise.js';
import { toonMaterial } from '../materials/toon.js';

export const ZONES = { GRASS: 0, DIRT: 1, COBBLE: 2, ROCK: 3, SAND: 4, GRASS_DARK: 5, GRASS_LIGHT: 6, WET: 7 };
// tone-table slots after the zones: pattern accents
const ACC = { PEBBLE: 8, COBBLE_B: 9, GROUT: 10, CRACK: 11, SPECK: 12, COBBLE_HI: 13, DIRT_DARK: 14, DIRT_LIGHT: 15 };
const NTONES = 16;

// sRGB [hi, mid, sh]. Grass/dirt/cobble/stone from ART_DIRECTION (shrine), rock = T 2021 purple-grey family.
export const TERRAIN_PALETTE = {
  grass: ['#BBD985', '#75A558', '#3B6B5A'],
  grassDark: ['#AED27F', '#6C9C55', '#37655A'],
  grassLight: ['#C3DD8B', '#7DAB5C', '#3E6F5B'],
  // dirt: shadow lifted off the muddy #6E5452 (the ref's shaded dirt sits ~#8B736B..#967E73), plus a lighter
  // mottle tone, crack/pebble-rim tone and pebbles that stay #C2A58A-ish even in cloud shadow
  dirt: ['#B08A72', '#9C7A66', '#7A5E58'],
  dirtDark: ['#9A7864', '#86685A', '#674F4D'],
  dirtLight: ['#BE9A80', '#AA8A72', '#8B6F63'],
  pebble: ['#D4BB9E', '#C2A58A', '#A68E7E'],
  // cobble: lit stones land on #606C77 / #535B6B, cloud shadow on #444B5C at the darkest (the grout), never
  // below it: shaded cobble keeps a low contrast like the ref (stones ~#5A6672, grout ~#4E5A66)
  cobble: ['#6E7A85', '#606C77', '#57606C'],
  cobbleB: ['#616A78', '#535B6B', '#4D5563'],
  cobbleHi: ['#7D8994', '#6C7883', '#5A6370'],
  grout: ['#4E5667', '#485062', '#434957'],
  rock: ['#857A8E', '#625A74', '#47445F'],
  crack: ['#685F76', '#4B4560', '#38354E'],
  speck: ['#ABA0B0', '#8D8498', '#666079'],
  sand: ['#D8C79A', '#C2AE84', '#8D8A86'],
  wet: ['#B2AC93', '#9E9A86', '#76787E'],
};
const MUD = { sand: ['#A38C74', '#86705F', '#5F5459'], wet: ['#86705F', '#6E5C52', '#514752'] };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

export function createTerrain(engine, opts = {}) {
  const {
    size = 64, seed = 3, height = 4, frequency = 0.035, center = [0, 0],
    terrace = false, plateaus = [], cliffHeight = 1.2, flatten = [], basins = [], paths = [], zones = [],
    palette = {}, grassVariation = [0.36, 0.63], rockSlope = 0.62, normalNoise = 0.15, zoneRes = 0.125,
    cobbleCell = 0.46, grout = 0.04, lip = 0.1, edgeLines = false,
  } = opts;
  const segments = opts.segments ?? Math.min(384, Math.round(size / 0.25));
  const water = opts.water ?? (opts.waterLevel !== undefined && opts.waterLevel > -Infinity ? { level: opts.waterLevel } : null);
  const waterLevel = water ? water.level : -Infinity;
  const shoreBand = water?.shoreBand ?? 0.25, wetBand = water?.wetBand ?? 0.1;
  const shoreSlope = water?.shoreSlope ?? [0.35, 0.9];
  const terr = terrace === true ? {} : terrace || null;
  const step = terr?.step ?? cliffHeight, riser = terr?.riser ?? 0.2, roll = terr?.roll ?? 0.2;
  const hasCliffs = !!terr || plateaus.length > 0;
  const [cx, cz] = center;
  const x0 = cx - size / 2, z0 = cz - size / 2;

  // ---------------------------------------------------------------- analytic height
  const base = (x, z) => (fbm2(x * frequency + 10, z * frequency + 10, { seed, octaves: 4 }) - 0.5) * 2 * height;
  const plateauField = (x, z) => {
    let p = 0;
    for (let i = 0; i < plateaus.length; i++) {
      const P = plateaus[i], lv = P.levels ?? 1, gap = P.gap ?? 1.4, nz = P.noise ?? 0.25;
      const d = Math.hypot(x - P.x, z - P.z);
      const rn = P.r * (1 + nz * (fbm2(x * 0.32 + i * 13.1, z * 0.32 - i * 7.7, { seed: seed + 5, octaves: 3 }) - 0.5) * 2);
      p += lv * clamp01(0.5 + (rn - d) / (lv * gap));
    }
    return p;
  };
  // "crease field": cliffs sit where it crosses n + 0.5
  const crease = (x, z) => (terr ? base(x, z) / step : 0) + (plateaus.length ? plateauField(x, z) : 0);
  const E = 0.05;
  const creaseGrad = (x, z) => {
    const gx = (crease(x + E, z) - crease(x - E, z)) / (2 * E), gz = (crease(x, z + E) - crease(x, z - E)) / (2 * E);
    return [gx, gz];
  };
  // riser half-width in crease units, so every cliff is ~`riser` metres wide horizontally whatever the slope
  const riserU = (gm) => Math.min(0.45, Math.max(0.004, riser * gm / 2));
  const quant = (u, gm) => {
    const w = riserU(gm), fl = Math.floor(u);
    return fl + clamp01((u - fl - (0.5 - w)) / (2 * w));
  };
  const rollAt = (x, z) => (fbm2(x * 0.09 + 3, z * 0.09 + 3, { seed: seed + 11, octaves: 3 }) - 0.5) * 2 * roll;

  const flat = flatten.map((f) => ({ ...f, falloff: f.falloff ?? f.r * 0.6, h: f.h }));
  const bas = basins.map((b) => ({ rz: b.rx, rot: 0, depth: 1, edge: 0.4, ...b }));
  const preFlatten = (x, z) => {
    let h;
    if (hasCliffs) {
      const u = crease(x, z), [gx, gz] = creaseGrad(x, z), gm = Math.hypot(gx, gz);
      h = terr ? step * quant(u, gm) + rollAt(x, z) : base(x, z) + step * quant(u, gm);
    } else h = base(x, z);
    return h;
  };
  for (const f of flat) if (f.h === undefined) f.h = preFlatten(f.x, f.z);
  const basDepth = bas.length ? Math.max(...bas.map((b) => b.depth)) : 0;
  // basin carve weight (0 outside, 1 on the floor); > 0 and < 1 on the bank
  const basinT = (x, z) => {
    let t = 0;
    for (const b of bas) {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
      const lx = (dx * c - dz * s) / b.rx, lz = (dx * s + dz * c) / b.rz;
      t = Math.max(t, smoothstep(1, 1 - b.edge, Math.hypot(lx, lz)));
    }
    return t;
  };
  const analyticHeightAt = (x, z) => {
    let h = preFlatten(x, z);
    for (const f of flat) {
      const t = smoothstep(f.r + f.falloff, f.r, Math.hypot(x - f.x, z - f.z));
      if (t > 0) h += (f.h - h) * t;
    }
    // (single depth for overlapping ellipses; scenes with different depths use separate basins far apart)
    if (bas.length) h -= basinT(x, z) * basDepth;
    return h;
  };
  // on (or within ~a cell of) a cliff riser of the crease field
  const isRiserAt = (x, z, tol) => {
    if (!hasCliffs) return false;
    const u = crease(x, z), [gx, gz] = creaseGrad(x, z), gm = Math.hypot(gx, gz);
    if (gm < 1e-3) return false;
    return Math.abs(u - Math.floor(u) - 0.5) <= riserU(gm) + tol * gm;
  };

  // ---------------------------------------------------------------- grid with crease-snapped vertices
  const N = segments, cell = size / N, V = N + 1;
  const VX = new Float64Array(V * V), VZ = new Float64Array(V * V), VY = new Float64Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = j * V + i;
    let x = x0 + i * cell, z = z0 + j * cell;
    const edge = i === 0 || j === 0 || i === N || j === N;
    if (hasCliffs && !edge) {
      // Newton-project the vertex onto the nearest cliff crease (top or bottom of a riser) if it is close:
      // the cliff edges then run exactly along vertex chains -> clean curves, crisp rims.
      let px = x, pz = z, ok = false;
      for (let it = 0; it < 3; it++) {
        const u = crease(px, pz), [gx, gz] = creaseGrad(px, pz), gm = Math.hypot(gx, gz);
        if (gm < 1e-3) break;
        const w = riserU(gm), kk = Math.round(u - 0.5);
        let best = Infinity;
        for (let m = kk - 1; m <= kk + 1; m++) for (const c of [m + 0.5 - w, m + 0.5 + w]) if (Math.abs(c - u) < Math.abs(best - u)) best = c;
        const dist = (best - u) / gm;
        if (it === 0 && Math.abs(dist) > cell * 0.5) break;
        px += (gx / gm) * dist; pz += (gz / gm) * dist; ok = true;
        if (Math.abs(dist) < 1e-4) break;
      }
      if (ok && Math.hypot(px - x, pz - z) < cell * 0.6) { x = px; z = pz; }
    }
    VX[k] = x; VZ[k] = z; VY[k] = analyticHeightAt(x, z);
  }
  // bank vertices: on a basin slope (or next to one) and not on a cliff riser. They get smooth analytic
  // normals (no faceted creases -> no edge lines), are never painted as rock, and carry a depth-only flag.
  const BANK = new Uint8Array(V * V), RISER = new Int8Array(V * V).fill(-1);   // RISER: lazy (-1 = unknown)
  const riserV = (k) => {
    if (RISER[k] < 0) RISER[k] = isRiserAt(VX[k], VZ[k], cell * 0.75) ? 1 : 0;
    return RISER[k] === 1;
  };
  if (bas.length) {
    const BT = new Float32Array(V * V);
    for (let k = 0; k < V * V; k++) BT[k] = basinT(VX[k], VZ[k]);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i;
      let on = BT[k] > 0 && BT[k] < 1;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
        const t = BT[jj * V + ii];
        if ((t > 0 && t < 1) || (t > 0) !== (BT[k] > 0) || (t < 1) !== (BT[k] < 1)) on = true;
      }
      BANK[k] = on && !riserV(k) ? 1 : 0;
    }
  }
  const bankNormal = (v) => {
    const x = VX[v], z = VZ[v], e = cell * 0.6;
    const nx = analyticHeightAt(x - e, z) - analyticHeightAt(x + e, z), nz = analyticHeightAt(x, z - e) - analyticHeightAt(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    return [nx / l, (2 * e) / l, nz / l];
  };
  const bankCache = new Map();
  // two triangles per cell, diagonal chosen to best match the analytic surface (keeps creases sharp)
  const TRI = new Uint32Array(N * N * 6);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * V + i, b = a + 1, d = a + V, c = d + 1;
    const mx = (VX[a] + VX[b] + VX[c] + VX[d]) / 4, mz = (VZ[a] + VZ[b] + VZ[c] + VZ[d]) / 4;
    const hc = hasCliffs ? analyticHeightAt(mx, mz) : 0;
    const useAC = hasCliffs ? Math.abs((VY[a] + VY[c]) / 2 - hc) <= Math.abs((VY[b] + VY[d]) / 2 - hc) : ((i + j) & 1) === 0;
    const o = (j * N + i) * 6;
    if (useAC) TRI.set([a, d, c, a, c, b], o); else TRI.set([a, d, b, b, d, c], o);
  }
  const NT = N * N * 2;
  // face normals (area weighted) + auto-smooth corner normals (split where faces differ by > ~58°)
  const FN = new Float64Array(NT * 3);
  for (let t = 0; t < NT; t++) {
    const p = TRI[t * 3], q = TRI[t * 3 + 1], r = TRI[t * 3 + 2];
    const ux = VX[q] - VX[p], uy = VY[q] - VY[p], uz = VZ[q] - VZ[p];
    const vx = VX[r] - VX[p], vy = VY[r] - VY[p], vz = VZ[r] - VZ[p];
    FN[t * 3] = uy * vz - uz * vy; FN[t * 3 + 1] = uz * vx - ux * vz; FN[t * 3 + 2] = ux * vy - uy * vx;
  }
  const cnt = new Uint32Array(V * V + 1);
  for (let t = 0; t < NT * 3; t++) cnt[TRI[t] + 1]++;
  for (let k = 0; k < V * V; k++) cnt[k + 1] += cnt[k];
  const adj = new Uint32Array(NT * 3), fill = cnt.slice(0, V * V);
  for (let t = 0; t < NT * 3; t++) adj[fill[TRI[t]]++] = (t / 3) | 0;
  const COS_SMOOTH = Math.cos(THREE.MathUtils.degToRad(58)); // cliff top|riser (~80°) splits, riser facets merge
  const CN = new Float32Array(NT * 9);
  const cliffCache = new Map();
  const cliffNormal = (v) => {
    if (cliffCache.has(v)) return cliffCache.get(v);
    // gradient smoothed over ~1.2 m so small wiggles of the cliff line don't stripe the face with bands
    const x = VX[v], z = VZ[v], EB = 1.2;
    const gx = crease(x + EB, z) - crease(x - EB, z), gz = crease(x, z + EB) - crease(x, z - EB), gm = Math.hypot(gx, gz);
    let r = null;
    if (gm > 1e-3) { const k = 1 / Math.hypot(1, 0.12); r = [(-gx / gm) * k, 0.12 * k, (-gz / gm) * k]; }
    cliffCache.set(v, r);
    return r;
  };
  for (let t = 0; t < NT; t++) {
    const fl = Math.hypot(FN[t * 3], FN[t * 3 + 1], FN[t * 3 + 2]) || 1;
    const fx = FN[t * 3] / fl, fy = FN[t * 3 + 1] / fl, fz = FN[t * 3 + 2] / fl;
    for (let c = 0; c < 3; c++) {
      const v = TRI[t * 3 + c];
      let sx = 0, sy = 0, sz = 0;
      for (let a = cnt[v]; a < cnt[v + 1]; a++) {
        const f = adj[a], ax = FN[f * 3], ay = FN[f * 3 + 1], az = FN[f * 3 + 2], al = Math.hypot(ax, ay, az) || 1;
        if ((ax * fx + ay * fy + az * fz) / al >= COS_SMOOTH) { sx += ax; sy += ay; sz += az; }
      }
      let l = Math.hypot(sx, sy, sz) || 1;
      if (BANK[v]) {
        // basin bank: smooth analytic normal shared by every corner of the vertex (creases vanish)
        let bn = bankCache.get(v);
        if (!bn) { bn = bankNormal(v); bankCache.set(v, bn); }
        sx = bn[0]; sy = bn[1]; sz = bn[2]; l = 1;
      } else if (hasCliffs && fy < 0.5 && riserV(v)) {
        // cliff riser: shade with the analytic contour direction (smooth along the cliff, no facet stripes)
        const cn = cliffNormal(v);
        if (cn && cn[0] * fx + cn[1] * fy + cn[2] * fz > 0.3) { sx = cn[0]; sy = cn[1]; sz = cn[2]; l = 1; }
      }
      CN[t * 9 + c * 3] = sx / l; CN[t * 9 + c * 3 + 1] = sy / l; CN[t * 9 + c * 3 + 2] = sz / l;
    }
  }

  // ---------------------------------------------------------------- exact mesh queries
  const _bary = [0, 0, 0];
  const locate = (x, z) => {
    const ci = Math.floor((x - x0) / cell), cj = Math.floor((z - z0) / cell);
    for (let r = 0; r <= 1; r++) // search own cell first, then the ring (vertices move < 0.6 cell)
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (r === 1 && di === 0 && dj === 0) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        for (let s = 0; s < 2; s++) {
          const t = (j * N + i) * 2 + s, p = TRI[t * 3], q = TRI[t * 3 + 1], w = TRI[t * 3 + 2];
          const ax = VX[p], az = VZ[p], bx = VX[q] - ax, bz = VZ[q] - az, ex = VX[w] - ax, ez = VZ[w] - az;
          const den = bx * ez - bz * ex; if (Math.abs(den) < 1e-12) continue;
          const px = x - ax, pz = z - az;
          const l1 = (px * ez - pz * ex) / den, l2 = (bx * pz - bz * px) / den, l0 = 1 - l1 - l2;
          if (l0 >= -1e-6 && l1 >= -1e-6 && l2 >= -1e-6) { _bary[0] = l0; _bary[1] = l1; _bary[2] = l2; return t; }
        }
      }
    return -1;
  };
  const heightAt = (x, z) => {
    const t = locate(x, z);
    if (t < 0) return analyticHeightAt(x, z);
    return _bary[0] * VY[TRI[t * 3]] + _bary[1] * VY[TRI[t * 3 + 1]] + _bary[2] * VY[TRI[t * 3 + 2]];
  };
  const normalAt = (x, z, target = new THREE.Vector3()) => {
    const t = locate(x, z);
    if (t < 0) {
      const e = 0.05;
      return target.set(analyticHeightAt(x - e, z) - analyticHeightAt(x + e, z), 2 * e, analyticHeightAt(x, z - e) - analyticHeightAt(x, z + e)).normalize();
    }
    target.set(0, 0, 0);
    for (let c = 0; c < 3; c++) target.x += _bary[c] * CN[t * 9 + c * 3], target.y += _bary[c] * CN[t * 9 + c * 3 + 1], target.z += _bary[c] * CN[t * 9 + c * 3 + 2];
    return target.normalize();
  };

  // ---------------------------------------------------------------- zone fields (RGBA8, bilinear, thresholded at 0.5)
  // R dirt (paths + dirt patches), G cobble, B shore sand, A grass-variation noise. Each channel is a
  // clamped *linear* distance field, so bilinear filtering + a 0.5 threshold gives smooth, per-pixel-crisp
  // borders at screen resolution (no texel staircases, no blended colours).
  const ZN = Math.min(1024, Math.max(64, Math.round(size / zoneRes))), zc = size / ZN;
  const field = new Uint8Array(ZN * ZN * 4);
  const segs = paths.map((p, pi) => ({ kind: p.kind ?? 'dirt', width: p.width ?? 1.2, noise: p.noise ?? 0.5, pts: p.points, pi }));
  const SPAN = 0.6; // metres of linear ramp each side of a border
  const distToPath = (x, z, pts) => {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = clamp01(((x - ax) * dx + (z - az) * dz) / l2);
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    if (pts.length === 1) best = Math.hypot(x - pts[0][0], z - pts[0][1]);
    return best;
  };
  const wb = water?.bounds;
  const inWaterBounds = (x, z) => !wb || (wb.r !== undefined ? Math.hypot(x - wb.x, z - wb.z) < wb.r
    : Math.abs(x - wb.x) < wb.w / 2 && Math.abs(z - wb.z) < wb.h / 2);
  const enc = (v) => Math.round(clamp01(0.5 + v / (2 * SPAN)) * 255);
  for (let j = 0; j < ZN; j++) for (let i = 0; i < ZN; i++) {
    const x = x0 + (i + 0.5) * zc, z = z0 + (j + 0.5) * zc;
    let dirt = -SPAN, cob = -SPAN, sand = -SPAN;
    for (const p of segs) {
      const wob = (fbm2(x * 0.8 + p.pi * 31, z * 0.8, { seed: seed + 21, octaves: 3 }) - 0.5) * p.noise * p.width;
      const v = p.width / 2 + wob - distToPath(x, z, p.pts);
      if (p.kind === 'cobble') cob = Math.max(cob, v); else dirt = Math.max(dirt, v);
    }
    for (let zi = 0; zi < zones.length; zi++) {
      const Z = zones[zi], nz = Z.noise ?? 0.35;
      const rn = Z.r * (1 + nz * (fbm2(x * 0.45 + zi * 17.3, z * 0.45 - zi * 9.1, { seed: seed + 41, octaves: 3 }) - 0.5) * 2);
      const v = rn - Math.hypot(x - Z.x, z - Z.z);
      if (Z.type === 'cobble') cob = Math.max(cob, v); else if (Z.type === 'sand') sand = Math.max(sand, v); else dirt = Math.max(dirt, v);
    }
    if (water && inWaterBounds(x, z)) {
      const h = analyticHeightAt(x, z);
      if (h < waterLevel + shoreBand + 0.3) {
        // the band follows the slope: full sand band on gentle shelves, only the wet band on steep banks
        const e = 0.12;
        const g = Math.hypot(analyticHeightAt(x + e, z) - analyticHeightAt(x - e, z), analyticHeightAt(x, z + e) - analyticHeightAt(x, z - e)) / (2 * e);
        const gentle = smoothstep(shoreSlope[1], shoreSlope[0], g);
        const wob = (fbm2(x * 0.7 + 5, z * 0.7 + 5, { seed: seed + 51, octaves: 3 }) - 0.5) * 0.25 * gentle;
        const band = wetBand + (shoreBand - wetBand) * gentle;
        // height difference -> metres (shores are gentle; 4x makes the ramp steep enough to stay linear-ish)
        sand = Math.max(sand, (waterLevel + band + wob - h) * 4);
      }
    }
    const gv = fbm2(x * 0.22 + 50, z * 0.22 + 50, { seed: seed + 31, octaves: 3 });
    const o = (j * ZN + i) * 4;
    field[o] = enc(dirt); field[o + 1] = enc(cob); field[o + 2] = enc(sand); field[o + 3] = Math.round(clamp01(gv) * 255);
  }
  const zoneTex = new THREE.DataTexture(field, ZN, ZN, THREE.RGBAFormat, THREE.UnsignedByteType);
  zoneTex.magFilter = THREE.LinearFilter; zoneTex.minFilter = THREE.LinearFilter; zoneTex.generateMipmaps = false;
  zoneTex.wrapS = zoneTex.wrapT = THREE.ClampToEdgeWrapping; zoneTex.colorSpace = THREE.NoColorSpace;
  zoneTex.needsUpdate = true;
  const sampleField = (x, z, ch) => {
    const fx = Math.min(ZN - 1, Math.max(0, (x - x0) / zc - 0.5)), fz = Math.min(ZN - 1, Math.max(0, (z - z0) / zc - 0.5));
    const i = Math.min(ZN - 2, Math.floor(fx)), j = Math.min(ZN - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
    const g = (ii, jj) => field[(jj * ZN + ii) * 4 + ch] / 255;
    return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
  };

  // ---------------------------------------------------------------- tones
  const pal = { ...TERRAIN_PALETTE, ...(water?.shore === 'mud' ? MUD : {}), ...palette };
  const order = ['grass', 'dirt', 'cobble', 'rock', 'sand', 'grassDark', 'grassLight', 'wet', 'pebble', 'cobbleB', 'grout', 'crack', 'speck', 'cobbleHi', 'dirtDark', 'dirtLight'];
  const toneArr = [];
  for (const key of order) for (const hex of pal[key]) toneArr.push(new THREE.Color(hex));
  const tonesOf = (zone) => ({ hi: toneArr[zone * 3].clone(), mid: toneArr[zone * 3 + 1].clone(), sh: toneArr[zone * 3 + 2].clone() });

  const _n = new THREE.Vector3();
  const bankAt = (x, z) => bas.length > 0 && basinT(x, z) > 0 && !isRiserAt(x, z, cell * 0.75);
  const zoneAt = (x, z) => {
    if (normalAt(x, z, _n).y < rockSlope && !bankAt(x, z)) return ZONES.ROCK;
    if (sampleField(x, z, 1) > 0.5) return ZONES.COBBLE;
    if (sampleField(x, z, 0) > 0.5) return ZONES.DIRT;
    if (sampleField(x, z, 2) > 0.5) return heightAt(x, z) < waterLevel + wetBand ? ZONES.WET : ZONES.SAND;
    const a = sampleField(x, z, 3);
    if (a > grassVariation[1]) return ZONES.GRASS_DARK;
    if (a < grassVariation[0]) return ZONES.GRASS_LIGHT;
    return ZONES.GRASS;
  };
  const colorAt = (x, z) => toneArr[zoneAt(x, z) * 3 + 1].clone();
  const tonesAt = (x, z) => tonesOf(zoneAt(x, z));
  const isGrass = (x, z) => {
    const zn = zoneAt(x, z);
    if (zn !== ZONES.GRASS && zn !== ZONES.GRASS_DARK && zn !== ZONES.GRASS_LIGHT) return false;
    return heightAt(x, z) > waterLevel + 0.05 && _n.y > Math.max(rockSlope + 0.08, 0.7);
  };

  // ---------------------------------------------------------------- mesh
  const pos = new Float32Array(NT * 9);
  for (let t = 0; t < NT; t++) for (let c = 0; c < 3; c++) {
    const v = TRI[t * 3 + c], o = t * 9 + c * 3;
    pos[o] = VX[v]; pos[o + 1] = VY[v]; pos[o + 2] = VZ[v];
  }
  // aCliff: metres below the top edge of a cliff riser (per corner; -1 elsewhere) -> grass lip in the shader
  const cliffA = new Float32Array(NT * 3).fill(-1);
  if (hasCliffs) for (let t = 0; t < NT; t++) {
    const fl = Math.hypot(FN[t * 3], FN[t * 3 + 1], FN[t * 3 + 2]) || 1;
    if (FN[t * 3 + 1] / fl > 0.5) continue;
    const top = Math.max(VY[TRI[t * 3]], VY[TRI[t * 3 + 1]], VY[TRI[t * 3 + 2]]);
    for (let c = 0; c < 3; c++) cliffA[t * 3 + c] = top - VY[TRI[t * 3 + c]];
  }
  // aBank: 1 on basin banks (never rock). aEdge: > 0 on and next to steep faces (cliff risers, banks): those
  // pixels write FLAG_DEPTH_ONLY so cliff tops / bank creases get no convex edge highlight (the lip does it)
  const bankA = new Float32Array(NT * 3), edgeA = new Float32Array(NT * 3);
  const steepV = new Uint8Array(V * V);
  for (let t = 0; t < NT; t++) {
    const fl = Math.hypot(FN[t * 3], FN[t * 3 + 1], FN[t * 3 + 2]) || 1;
    if (FN[t * 3 + 1] / fl < 0.75) for (let c = 0; c < 3; c++) steepV[TRI[t * 3 + c]] = 1;
  }
  for (let t = 0; t < NT * 3; t++) {
    const v = TRI[t];
    bankA[t] = BANK[v];
    edgeA[t] = !edgeLines && (steepV[v] || BANK[v]) ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCliff', new THREE.BufferAttribute(cliffA, 1));
  geo.setAttribute('aBank', new THREE.BufferAttribute(bankA, 1));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edgeA, 1));
  geo.setAttribute('normal', new THREE.BufferAttribute(CN, 3));
  geo.computeBoundingBox(); geo.computeBoundingSphere();

  const uniforms = {
    tZone: { value: zoneTex },
    uZoneOrigin: { value: new THREE.Vector2(x0, z0) },
    uZoneSize: { value: size },
    uZoneTones: { value: toneArr },
    uWaterLevel: { value: water ? waterLevel : -1e4 },
    uWetBand: { value: wetBand },
    uRockSlope: { value: rockSlope },
    uGrassVar: { value: new THREE.Vector2(grassVariation[0], grassVariation[1]) },
    uCobble: { value: new THREE.Vector2(cobbleCell, grout) },
    uLip: { value: lip },
  };
  const material = toonMaterial(engine, {
    color: 0xffffff, outline: 'full', normalNoise, uniforms,
    vertexHead: 'attribute float aCliff, aBank, aEdge; varying vec3 vTerrN; varying float vCliff, vBank, vEdge;',
    vertex: 'vTerrN = normalize(mat3(modelMatrix) * objectNormal); vCliff = aCliff; vBank = aBank; vEdge = aEdge;',
    // lip blades are lit like the top they grow from
    lightNormal: '(terrLip > 0.5 ? viewMatrix[1].xyz : normal)',
    normalOverride: 'if (uPassMode == 1 && vEdge > 0.001) { gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, FLAG_DEPTH_ONLY); return; }',
    fragmentHead: /* glsl */`
      uniform sampler2D tZone; uniform vec2 uZoneOrigin; uniform float uZoneSize;
      uniform vec3 uZoneTones[${NTONES * 3}];
      uniform float uWaterLevel, uWetBand, uRockSlope; uniform vec2 uGrassVar, uCobble;
      varying vec3 vTerrN; varying float vCliff, vBank, vEdge; uniform float uLip;
      float terrLip = 0.0;
      float terrHash3(vec3 p) { return hash12(p.xy + vec2(p.z * 157.0, p.z * 113.0)); }
      float terrNoise3(vec3 p) {  // value noise, continuous across cliff facets (no per-face tangent seams)
        vec3 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f);
        float a = mix(mix(terrHash3(i), terrHash3(i + vec3(1, 0, 0)), u.x), mix(terrHash3(i + vec3(0, 1, 0)), terrHash3(i + vec3(1, 1, 0)), u.x), u.y);
        float b = mix(mix(terrHash3(i + vec3(0, 0, 1)), terrHash3(i + vec3(1, 0, 1)), u.x), mix(terrHash3(i + vec3(0, 1, 1)), terrHash3(i + vec3(1, 1, 1)), u.x), u.y);
        return mix(a, b, u.z);
      }
      // Voronoi in cell units: x = F2-F1 (border distance proxy), y = cell hash, zw = pixel - cell centre
      vec4 terrVoro(vec2 p) {
        vec2 i = floor(p), f = p - i; float d1 = 9.0, d2 = 9.0; vec2 c1 = vec2(0.0), r1 = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y));
          vec2 o = vec2(hash12(i + g + vec2(311.0, 7.0)), hash12(i + g + vec2(57.0, 113.0))) * 0.86 + 0.07;
          vec2 r = g + o - f; float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; c1 = i + g; r1 = r; } else if (d < d2) { d2 = d; }
        }
        return vec4(sqrt(d2) - sqrt(d1), hash12(c1 + vec2(11.0, 71.0)), -r1);  // zw: centre->pixel
      }
    `,
    tones: /* glsl */`
      {
        vec3 tn = normalize(vTerrN);
        vec4 zf = texture2D(tZone, (vToonWorld.xz - uZoneOrigin) / uZoneSize);
        int zone = 0;
        if (tn.y < uRockSlope && vBank < 0.5) zone = 3;
        else if (zf.g > 0.5) zone = 2;
        else if (zf.r > 0.5) zone = 1;
        else if (zf.b > 0.5) zone = vToonWorld.y < uWaterLevel + uWetBand ? 7 : 4;
        else if (zf.a > uGrassVar.y) zone = 5;
        else if (zf.a < uGrassVar.x) zone = 6;
        int k = zone;
        vec2 sxz = normalize(uSunDir.xz + 1e-4);
        if (zone == 2) {                       // cobblestones: voronoi stones, 2 tones, grout, sun-side bevel
          vec4 v = terrVoro(vToonWorld.xz / uCobble.x);
          float edge = v.x * uCobble.x;
          float rr = length(v.zw) * uCobble.x;               // distance from the stone centre (m)
          // grout: near the voronoi border, widened at the corners where two borders meet -> rounded stones
          if (edge < uCobble.y || (edge < uCobble.y * 2.6 && rr > uCobble.x * 0.42)) k = 10;
          else if (edge < uCobble.y * 2.4 && dot(normalize(v.zw + 1e-4), sxz) > 0.45) k = 13;
          else k = v.y > 0.5 ? 2 : 9;
        } else if (zone == 1) {                // dirt: lit mottle, faint dry cracks, pebbles (3-4 px, sun-side lit)
          float tw = max(uTexelWorld, 0.012);
          if (terrNoise3(vec3(vToonWorld.x * 1.7, 0.0, vToonWorld.z * 1.7) + 31.0) > 0.6) k = 15;
          vec4 cv = terrVoro(vToonWorld.xz / 0.62);
          float gate = terrNoise3(vec3(vToonWorld.x * 1.3, 0.0, vToonWorld.z * 1.3) + 57.0);
          if (cv.x * 0.62 < tw * 1.15 && gate > 0.56) k = 14;
          vec2 pc = vToonWorld.xz / 0.26, pi = floor(pc);
          float h = hash12(pi + vec2(3.0, 41.0));
          vec2 po = vec2(hash12(pi + vec2(5.0, 9.0)), hash12(pi + vec2(17.0, 3.0))) * 0.5 + 0.25;
          vec2 dv = (pc - pi - po) * 0.26;
          float pr = tw * (1.25 + 0.9 * hash12(pi + vec2(23.0, 7.0)));
          if (h > 0.66 && length(dv) < pr) k = dot(dv, -sxz) > pr * 0.45 ? 14 : 8;
        } else if (zone == 3) {                // rock: horizontal strata + cracks + pale specks (world space, along the face)
          vec3 q = vToonWorld * vec3(1.1, 4.2, 1.1);
          float n1 = terrNoise3(q) * 0.6 + terrNoise3(q * vec3(2.1, 2.6, 2.1) + 5.3) * 0.4;
          float sp = terrHash3(floor(vToonWorld * vec3(12.0, 16.0, 12.0)) + vec3(7.0, 19.0, 3.0));
          float clump = terrNoise3(vToonWorld * 0.9 + 21.0);
          if (n1 < 0.3) k = 11;
          else if (sp > 0.9 && clump > 0.62 && n1 > 0.42) k = 12;
          // grass overhang fringe on the cliff top: 1-px-wide blades hanging 1-4 px over the riser (screen
          // columns anchored to the world texel grid), in clumps; lit like the top (hi tone in sun)
          if (vCliff >= 0.0 && uLip > 0.0) {
            float tw = max(uTexelWorld, 0.012);
            vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            float upY = max(viewMatrix[1][1], 0.2);         // screen-up component of world up (cos pitch)
            float col = floor(dot(vToonWorld, camR) / tw);
            float clump = terrNoise3(vec3(vToonWorld.x * 2.6, 0.0, vToonWorld.z * 2.6) + 9.0);
            float blade = hash12(vec2(col, 17.0));
            float lipPx = 1.0 + floor(clump * 2.2 + blade * 1.8) * step(0.35, blade);
            lipPx = min(lipPx, 1.0 + uLip / tw);          // uLip caps the blade length (m)
            if (vCliff * upY / tw < lipPx) { k = 0; terrLip = 1.0; }
          }
        }
        toonHi = uZoneTones[k * 3]; toonMid = uZoneTones[k * 3 + 1]; toonSh = uZoneTones[k * 3 + 2];
        if (terrLip > 0.5) { toonMid = toonHi; toonSh = uZoneTones[1]; }   // blades: hi in sun, mid in shade
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.castShadow = true; mesh.receiveShadow = true;
  engine.scene.add(mesh);

  return {
    mesh, heightAt, normalAt, colorAt, tonesAt, zoneAt, isGrass, size, waterLevel, center: [cx, cz],
    analyticHeightAt, zoneTexture: zoneTex, ZONES, palette: pal,
  };
}
