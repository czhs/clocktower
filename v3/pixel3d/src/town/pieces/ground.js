// ground (owner: ground agent). docs/TOWN.md §1, §4, §6. v1 art: pipgws packages/assets/scripts/ground.ts (read only).
// Render: tools/townpiece.sh ground shots/town-ground [--focus x,z]
//
// DESIGN NOTE
//   Signature: the round paved square of Hollowmere - concentric courses of grey setts (v1: polar courses round the
//   voting circle, lit upper-left rim / shaded lower-right rim per stone) inside a raised dressed-stone KERB ring
//   (11 cm, its outer face shows on the south half, inner face on the north half) and a flush course of long kerb
//   stones just inside it; the kerb is broken where every lane runs in. Around it: meadow grass with sprite tufts,
//   cobbled paths of rounded setts running down the MIDDLE of every lane (1-wide lanes fully paved, 3-4 wide lanes
//   get a 1.5-1.6 m path with grass verges; the four lower-ring lanes down to the cart road are ~1.25 m footpaths with a
//   meandering centre line and grass creeping between the edge setts) with a door spur to every door, the setts sinking into a worn-earth
//   fringe at their edge (no tile grid anywhere: every edge is a noise-wobbled distance field). The rutted cart road
//   behind the lower ring (two wheel ruts, a grassy crown, pebbles) runs out of town both ways: west over a plank
//   bridge across the river, east up into the hills. Beyond the 45x37 map the floor is forest floor with leaf
//   litter rising into rolling high ground (highest behind the clock tower), so no camera ever sees a world edge.
//   A river (the "Riverbend" of the boathouse, the mill's water) runs down the west side outside the forest rim
//   and bends east along the south, south of the cart road: water is the pixel3d post pass (src/world/water.js).
//   Palette rows (docs/TOWN.md §3): grass / grassDark / grassLight, forest, dirt, cobble, grout, plaza, kerb,
//   Lawns: 2-tone low-frequency clumps (lush dark / sunny light), dense tufts thinned into a worn strip along lanes,
//   none on door tiles (?quality=low halves the tufts). Plaza joints fade to the banded far LOD at viewHeight > 14.
//   ashlar (sun rims on setts), stone (rock, pebbles), dial (warm pebbles), autumn + trunk (leaf litter, twigs),
//   moss (moss in old grout), plank + timber (bridge). Pattern steps stay within 0.72..1.07 of a ramp.
//   640x360 read: the square must read as one big round stone floor with visible rings of stones (each sett
//   ~11x6 px at the gameplay camera, 1-px joints that are 1 px tall even on horizontal joints), the kerb as a
//   crisp line + cream rim, lanes as darker cobbled ribbons, grass as soft fields. At the overview camera the
//   joint lines fade out (sett period < 4.5 px) and only stone tone variation remains (no moire).
//   Everything is world-anchored and texel-exact (patterns are decided per pixel from world position with
//   screen-pixel line widths), so a whole-texel pan changes nothing.
//
// Contract: town floor FLAT at y = 0 for x -0.6..45.6, z -0.6..37.6 (every other piece stands on y = 0). The
// terrain rolls only outside it. api: heightAt(x, z), normalAt(x, z), terrain (createTerrain-like object), isWater,
// clear(x, z) (true where trees must not stand: river + banks, road, bridge), zoneAt(x, z), river / road polylines.
//
// CONTRACT-REQUEST (foliage): keep trees off api.clear(x, z) (river x -6..-1 down the west side, z 38.5..43 along the
//   south, the road leaving town west over the bridge at z 35 and east at z 35..42) and stand rim trees on
//   ctx.heightAt(x, z) (the high ground beyond the map rises up to ~8 m in the north). To let the south reach of the
//   river show at the gameplay camera, trees south of it (z > 43, x < 40) need h <= (z - 42.6) / 1.73.
//   The cart road (z 34..36.3 in town) is hidden by the south rim canopy at the gameplay camera: api.clear() now keeps
//   a meadow strip to z ~37.6 south of it; trees beyond need h <= (z - 34.2) / 1.73 (low shrubs / hedges only).
import * as THREE from 'three';
import { toonMaterial } from '../../materials/toon.js';
import { createGrass, viewArea } from '../../world/grass.js';
import { createWater } from '../../world/water.js';
import { noise2, fbm2 } from '../../core/noise.js';
import { Builder } from '../kit.js';
import { TOWN_PALETTE as P } from '../palette.js';

// ------------------------------------------------------------------------------------------------ constants
const TOWN = { x0: -0.6, x1: 45.6, z0: -0.6, z1: 37.6 };    // flat town floor (y = 0 exactly)
// LEAD round 6 (docs/TOWN.md §12.9): the SOUTH BAY (layout rows 36..41, x 15..29) where house-9 now stands south of the
// old road line: flat too, the forest floor carved out of it, the river swung south round it, the road dipped round
// house-9's front, no trees in it (api.clear)
const BAY = { x0: 14.6, x1: 30.4, z0: 33.5, z1: 42.25 };
const inFlat = (x, z) => (x >= TOWN.x0 && x <= TOWN.x1 && z >= TOWN.z0 && z <= TOWN.z1) || (x >= BAY.x0 && x <= BAY.x1 && z >= BAY.z0 && z <= BAY.z1);
const SHELF = { x0: -9.5, x1: 47.0, z0: -1.4, z1: 45.5 };   // low shelf (river valley); hills start beyond it
const WATER_LEVEL = -0.32;
const KERB = { r0: 8.45, r1: 9.0, top: 0.11, ring0: 8.0, widen: 0.3 };  // widen: lanes flare 0.3 m into the kerb gaps  // raised kerb ring + flush ring course (r about PLAZA)
const SETT = { cw: 0.34, sl: 0.44 };                       // square setts: course width, stone length (m)
const LANE_CELL = 0.40;                                    // lane setts (voronoi cell, m)
const CLUMP = { dark: 0.565, light: 0.435 };                // lawn clump thresholds on the baked mask
const SPAN = 0.6;                                          // distance-field ramp (m) each side of a border
const GRID0 = { cx: 22.5, cz: 12, size: 160, cell: 0.625 };  // terrain grid (the cameras never see its edge)
const BAKE = { x0: -20, z0: -10, x1: 66, z1: 52, res: 0.12 }; // zone-field texture area

// The river: down the west side outside the rim, bending east along the south behind the cart road, then away
// south-east. (x, z) polyline, half width ~1.35-1.75 m.
// The west reach meanders (+-1 m S-bends every ~10 m) while keeping the jetty (z 16.6, x -3.1) and the bridge (z 35, x -3.55) wet.
const RIVER = [[-2.0, -60], [-7.4, -42], [-3.4, -26], [-6.4, -14], [-3.5, -5], [-5.5, 3], [-3.7, 10], [-4.6, 15], [-3.6, 20],
  [-5.4, 26], [-3.7, 30.5], [-3.3, 36.2], [-1.8, 39.2], [1.5, 40.5], [6, 41.7], [10.5, 41.2], [13.6, 43.7], [17.5, 45.5], [22.5, 46.1], [27.5, 45.5], [31.4, 43.7], [34.5, 42.8],
  [39, 44.8], [44, 49], [49, 56], [55, 66], [61, 80], [66, 100]];
// The cart road: the town road (z 34..36, x 2..43) continued out of town both ways.
// LEAD round 6: in town it dips round house-9's front (layout south bay: arms x ~17-19 / 26-28, the front stretch z ~41; round 7: house-9 6 m south)
const ROAD = [[-46, 23.5], [-34, 24.6], [-24, 26.6], [-16, 30.2], [-10.6, 33.6], [-6.8, 35.0], [-3.6, 35.1], [-0.4, 35.0],
  [2, 35.0], [15.4, 35.0], [18.3, 37.4], [19.3, 40.4], [22.5, 41.05], [25.7, 40.4], [26.7, 37.4], [29.6, 35.0], [43, 35.0], [46.6, 35.3], [50.5, 36.6], [55, 38.6], [62, 40.6], [72, 41.4], [92, 41.8]];
const BRIDGE = { x: -3.55, z: 35.05, len: 5.2, w: 1.9 };   // plank bridge where the road crosses the river

/** Centripetal-free uniform Catmull-Rom resample of an (x, z) polyline at ~`step` m. Segments flagged by
 *  `keep(a, b)` stay straight (the in-town road), their end points are kept exactly. */
function catmull(pts, step, keep = () => false) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const l = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(1, Math.round(l / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (keep(p1, p2)) { out.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]); continue; }
      const t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
// the drawn river meanders: 1 m spline samples (no kinks in banks, shallow band or foam line)
const RIVER_S = catmull(RIVER, 1.0);
// the road: 2 m spline samples out in the woods, the in-town stretch (x 2..43, z 35) stays dead straight
const ROAD_S = catmull(ROAD, 2.0, (a, b) => a[1] === 35.0 && b[1] === 35.0);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const rectDist = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/** Distance from (x, z) to a polyline + the along-parameter (m) and the signed side of the nearest segment.
 *  Segments are precomputed once per polyline (bbox early-out: the spline polylines have 70-230 segments). */
const SEGS = new Map();
function segsOf(pts) {
  let S = SEGS.get(pts);
  if (S) return S;
  S = []; let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, l = Math.sqrt(l2);
    S.push({ ax, az, dx, dz, l2, l, acc, x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) });
    acc += l;
  }
  SEGS.set(pts, S);
  return S;
}
function polyDist(pts, x, z) {
  let best = Infinity, b2 = Infinity, along = 0, side = 1;
  for (const s of segsOf(pts)) {
    const ex = Math.max(s.x0 - x, 0, x - s.x1), ez = Math.max(s.z0 - z, 0, z - s.z1);
    if (ex * ex + ez * ez >= b2) continue;
    const t = clamp01(((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2);
    const qx = x - s.ax - s.dx * t, qz = z - s.az - s.dz * t, d2 = qx * qx + qz * qz;
    if (d2 < b2) { b2 = d2; along = s.acc + t * s.l; side = s.dx * (z - s.az) - s.dz * (x - s.ax) >= 0 ? 1 : -1; }
  }
  best = Math.sqrt(b2);
  return { d: best, along, side };
}

// ------------------------------------------------------------------------------------------------ height field
const riverHalf = (x, z) => 1.3 + 0.36 * noise2(x * 0.11 + 3.1, z * 0.11 - 1.7, 71) + 0.3 * noise2(x * 0.035 - 5.3, z * 0.035 + 2.2, 72);
function hillHeight(x, z) {
  const d = rectDist(SHELF, x, z);
  // tiny undulation on the shelf (positive only: no stray puddles), none on the town floor
  const dt = Math.min(rectDist(TOWN, x, z), rectDist(BAY, x, z));
  let h = dt > 0 ? 0.16 * noise2(x * 0.35, z * 0.35, 5) * smooth(0, 2.5, dt) : 0;
  if (d > 0) {
    // outward direction from the nearest shelf point (continuous round the corners)
    const nx = (x - Math.min(Math.max(x, SHELF.x0), SHELF.x1)) / d, nz = (z - Math.min(Math.max(z, SHELF.z0), SHELF.z1)) / d;
    const H = 4.2 + 4.0 * Math.max(0, -nz) + 0.6 * Math.max(0, nx) - 1.2 * Math.max(0, nz);
    h += H * smooth(0, 17, d) + 0.04 * Math.max(0, d - 17);         // gentle start, <= ~35 deg anywhere
    h += (fbm2(x * 0.036 + 7, z * 0.036 + 3, { seed: 9, octaves: 3 }) - 0.5) * 2 * 1.5 * smooth(0, 9, d);
    h += (noise2(x * 0.24, z * 0.24, 13) - 0.5) * 0.5 * smooth(0, 3, d);
  }
  return h;
}
function analyticHeight(x, z) {
  if (inFlat(x, z)) return 0;
  let h = hillHeight(x, z);
  const r = polyDist(RIVER_S, x, z);
  const w = riverHalf(x, z), edge = WATER_LEVEL - 0.05;
  if (r.d < w) {
    const q = r.d / w;
    h = Math.min(h, edge - 0.52 * (1 - q * q));
  } else {
    const bankW = 1.4 + 2.3 * Math.max(0, h);                          // valley walls <= ~34 deg
    const s = smooth(w, w + bankW, r.d);
    h = Math.min(h, edge + (h - edge) * s);
  }
  return h;
}

// ------------------------------------------------------------------------------------------------ build
export default function build(engine, ctx) {
  const t0 = performance.now();
  const L = ctx.layout;
  const PL = L.PLAZA, CI = L.CIRCLE;

  // ---------------------------------------------------------------- cobble strokes (lanes + door spurs)
  const strokes = [];
  const lane = (x0, x1, z, half) => strokes.push({ a: [x0, z], b: [x1, z], half, wob: 0.09 });
  const vlane = (x, z0, z1, half) => strokes.push({ a: [x, z0], b: [x, z1], half, wob: 0.09 });
  lane(8.8, 36.2, 9.5, 0.5);                        // top lane (the tower + top-arc doors); not under houses 14 / 4 (nudged in, round 6)
  // the corner cottages (house-14 / house-4, turned 45 deg, TOWN.md 11 + 12.1) get a DIAGONAL lane each instead of the
  // old straight z 13.5 corner lanes: out of the door along its 45 deg normal across the old lane line, then (the market
  // stall + barrel / crates sit right on the straight diagonal) round the stall's back corner and in to the kerb at ~37 deg.
  // Chaikin-rounded polyline of short strokes (same half / wob as the lanes); mirrored about x 22.5 for house-4.
  const diagLane = (h, mx) => {
    const P = (x, z) => [mx ? 45 - x : x, z];
    const d = h.doorPoint, n = h.doorNormal, s0 = 2.3;
    let pts = [[d.x, d.z], [d.x + n[0] * s0, d.z + n[1] * s0], P(13.0, 14.45), P(15.4, 16.25), P(16.3, 16.95)];
    for (let k = 0; k < 3; k++) {                                       // Chaikin, ends pinned (door + inside the kerb)
      const q = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        if (i > 0) q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
        if (i < pts.length - 2) q.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
      }
      q.push(pts[pts.length - 1]); pts = q;
    }
    for (let i = 0; i < pts.length - 1; i++) strokes.push({ a: pts[i], b: pts[i + 1], half: 0.5, wob: 0.09, diag: h.id });
  };
  const H = (id) => L.houses.find((h) => h.id === id);
  diagLane(H('house-14'), false); diagLane(H('house-4'), true);
  // side lanes: they end short of the side-row cottages (LEAD round 6: placed outlines, layout LAYOUT_DELTAS)
  lane(7.7, 16.5, 18.5, 0.5); lane(28.5, 37.3, 18.5, 0.5);
  lane(5.8, 16.5, 24.5, 0.5); lane(28.5, 38.5, 24.5, 0.5);
  // the lower-ring lanes down to the cart road: narrow (~1.25 m of setts + earth verge = ~2 m) footpaths whose
  // centre line meanders a little (a worn path, not a straight paved strip); edges wobble harder (grass creeping in)
  const wlane = (x, z0, z1, half, seed) => {
    const n = Math.ceil((z1 - z0) / 0.5);
    const cx = (z) => x + 0.2 * Math.sin((z - z0) * 0.55 + seed) + 0.09 * Math.sin((z - z0) * 1.37 + seed * 2.1);
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n;
      // taper in where the path leaves the square (no hard step at the kerb ring)
      strokes.push({ a: [cx(za) * (i ? 1 : 0) + x * (i ? 0 : 1), za], b: [cx(zb), zb], half, wob: 0.16, path: true });
    }
  };
  wlane(9.5, 24.5, 34.6, 0.62, 1.3); wlane(35.5, 24.5, 34.6, 0.62, 4.1);
  wlane(17.0, 24.5, 34.6, 0.62, 0.4); wlane(28.0, 24.5, 34.6, 0.62, 2.7);
  const laneSD = (x, z) => {
    let best = -9;
    for (const s of strokes) {
      const [ax, az] = s.a, [bx, bz] = s.b, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = clamp01(((x - ax) * dx + (z - az) * dz) / l2);
      best = Math.max(best, s.half - Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  // door spurs: from each door out along its normal until the lane path centre is reached
  for (const h of [...L.houses, L.clocktower]) {
    if (h.id === 'house-14' || h.id === 'house-4') continue;           // their diagonal lane starts at the door
    const [nx, nz] = h.doorNormal, p = h.doorPoint;
    let len = 0, hit = false;
    for (let s = 0.3; s < 1.8; s += 0.05) { if (laneSD(p.x + nx * s, p.z + nz * s) > 0.3) { len = s + 0.15; hit = true; break; } }
    if (h.id === 'house-9') { len = 0.9; hit = true; }                 // onto the cart road (it runs along its front)
    if (!hit) {
      // LEAD round 6: a door facing away from every lane (the side rows' chamfer / porch doors) gets a 0.9 m doorstep
      // spur plus a straight connector to the nearest lane / path point (no 3 m spur running off into the lawn)
      len = 0.9;
      const ex = p.x + nx * len, ez = p.z + nz * len;
      let best = null, bd = Infinity;
      for (const st of strokes) {
        if (st.spur) continue;
        const [ax, az] = st.a, [bx, bz] = st.b, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = clamp01(((ex - ax) * dx + (ez - az) * dz) / l2), qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(ex - qx, ez - qz);
        if (d < bd) { bd = d; best = [qx, qz]; }
      }
      if (best && bd < 6) strokes.push({ a: [ex, ez], b: best, half: 0.46, wob: 0.06, spur: true });
    }
    strokes.push({ a: [p.x, p.z], b: [p.x + nx * len, p.z + nz * len], half: 0.46, wob: 0.0, spur: true });
  }
  for (const s of strokes) {
    s.bb = [Math.min(s.a[0], s.b[0]) - s.half - 1, Math.min(s.a[1], s.b[1]) - s.half - 1, Math.max(s.a[0], s.b[0]) + s.half + 1, Math.max(s.a[1], s.b[1]) + s.half + 1];
  }
  const roadBB = [-50, 18, 96, 46];

  // ---------------------------------------------------------------- forest floor field (the rim + ',' row 1)
  const forestTiles = [];
  for (let x = 1; x < L.TOWN_W - 1; x++) if (L.groundAt(x, 1) === L.G.forest) forestTiles.push([x + 0.5, 1.45]);
  const IN = { x0: 1.0, x1: 44.0, z0: 1.15, z1: 36.0 };
  const forestSD = (x, z, wob) => {
    // positive in the forest: outside the inner town rect, or near a forest tile of row 1
    const dx = Math.max(IN.x0 - x, x - IN.x1), dz = Math.max(IN.z0 - z, z - IN.z1);
    let v = Math.max(dx, dz) + wob * 0.55;
    v = Math.min(v, Math.max(15.0 - x, x - 30.0, 33.0 - z, z - 42.0) + wob * 0.55);   // the south bay (lead round 6)
    if (z < 3.5) for (const [fx, fz] of forestTiles) if (Math.abs(fx - x) < 1.6) v = Math.max(v, 0.62 + wob * 0.3 - Math.hypot((x - fx) * 0.9, (z - fz) * 1.3));
    return v;
  };

  // ---------------------------------------------------------------- bake the zone field
  // R lanes (cobble SDF), G road (dirt SDF), B forest floor SDF, A grass variation noise; each SDF linear in
  // +-SPAN m around its border -> bilinear + 0.5 threshold = smooth per-pixel borders (JS samples the same data).
  const ZW = Math.round((BAKE.x1 - BAKE.x0) / BAKE.res), ZH = Math.round((BAKE.z1 - BAKE.z0) / BAKE.res);
  const field = new Uint8Array(ZW * ZH * 4);
  const enc = (v) => Math.round(clamp01(0.5 + v / (2 * SPAN)) * 255);
  const roadHalf = (x, z) => 1.0 + 0.16 * (noise2(x * 0.5, z * 0.5, 41) - 0.5) + 0.09 * (noise2(x * 1.9, z * 1.9, 42) - 0.5);
  for (let j = 0; j < ZH; j++) {
    const z = BAKE.z0 + (j + 0.5) * BAKE.res;
    for (let i = 0; i < ZW; i++) {
      const x = BAKE.x0 + (i + 0.5) * BAKE.res;
      const wob = (noise2(x * 1.7, z * 1.7, 31) - 0.5) + 0.5 * (noise2(x * 4.1, z * 4.1, 32) - 0.5);
      const wobF = wob + 1.6 * (noise2(x * 0.45, z * 0.45, 35) - 0.5);
      let cob = -SPAN;
      for (const s of strokes) {
        if (x < s.bb[0] || z < s.bb[1] || x > s.bb[2] || z > s.bb[3]) continue;
        const [ax, az] = s.a, [bx, bz] = s.b, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = clamp01(((x - ax) * dx + (z - az) * dz) / l2);
        cob = Math.max(cob, s.half + wob * s.wob * 2 + (s.path ? 0.1 * (noise2(x * 0.9, z * 0.9, 36) - 0.5) : 0) - Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      let road = -SPAN;
      if (x > roadBB[0] && x < roadBB[2] && z > roadBB[1] && z < roadBB[3]) {
        const r = polyDist(ROAD_S, x, z);
        const inTown = smooth(4, 1, Math.min(rectDist(TOWN, x, z), rectDist(BAY, x, z)));   // narrower track out in the woods
        const south = r.side > 0 ? 0.32 * smooth(0.3, 0.9, r.d) * inTown : 0;   // in town: wider on the south (open) side
        road = roadHalf(x, z) * (0.78 + 0.22 * inTown) + south + wob * 0.12 - r.d;
      }
      const fo = forestSD(x, z, wobF);
      // lawn clump mask: low-frequency (6-10 m blobs, gently warped) lush-dark / sunny-light patches
      const wx = x + 2.2 * (noise2(x * 0.09, z * 0.09, 37) - 0.5), wz = z + 2.2 * (noise2(x * 0.09 + 5, z * 0.09, 38) - 0.5);
      const gv = fbm2(wx * 0.14 + 50, wz * 0.14 + 50, { seed: 33, octaves: 3 });
      const o = (j * ZW + i) * 4;
      field[o] = enc(cob); field[o + 1] = enc(road); field[o + 2] = enc(fo); field[o + 3] = Math.round(clamp01(gv) * 255);
    }
  }
  const zoneTex = new THREE.DataTexture(field, ZW, ZH, THREE.RGBAFormat, THREE.UnsignedByteType);
  zoneTex.magFilter = zoneTex.minFilter = THREE.LinearFilter; zoneTex.generateMipmaps = false;
  zoneTex.wrapS = zoneTex.wrapT = THREE.ClampToEdgeWrapping; zoneTex.colorSpace = THREE.NoColorSpace; zoneTex.needsUpdate = true;
  const sample = (x, z, ch) => {
    const fx = Math.min(ZW - 1, Math.max(0, (x - BAKE.x0) / BAKE.res - 0.5)), fz = Math.min(ZH - 1, Math.max(0, (z - BAKE.z0) / BAKE.res - 0.5));
    const i = Math.min(ZW - 2, Math.floor(fx)), j = Math.min(ZH - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
    const g = (ii, jj) => field[(jj * ZW + ii) * 4 + ch] / 255;
    return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
  };
  const tBake = performance.now();

  // ---------------------------------------------------------------- decal tiles (layout decals: crack / pebbles / leaves)
  const decal = new Uint8Array(64 * 64);
  const DCODE = { crack: 1, pebbles: 2, leaves: 3 };
  for (const d of L.decals) if (DCODE[d.name]) decal[d.z * 64 + d.x] = DCODE[d.name] * 40;
  const decalTex = new THREE.DataTexture(decal, 64, 64, THREE.RedFormat, THREE.UnsignedByteType);
  decalTex.magFilter = decalTex.minFilter = THREE.NearestFilter; decalTex.generateMipmaps = false; decalTex.needsUpdate = true;

  // ---------------------------------------------------------------- terrain grid
  // LEAD (perf, quality tier): ?quality=low builds the grid at 1.25 m cells (1/4 the triangles; the town floor is flat,
  // the rolling rim and the river banks keep their shape at that scale). heightAt / normalAt follow the same grid.
  const GRID = { ...GRID0, cell: ctx.params?.get?.('quality') === 'low' ? GRID0.cell * 2 : GRID0.cell };
  const N = Math.round(GRID.size / GRID.cell), V = N + 1, gx0 = GRID.cx - GRID.size / 2, gz0 = GRID.cz - GRID.size / 2;
  const VY = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) VY[j * V + i] = analyticHeight(gx0 + i * GRID.cell, gz0 + j * GRID.cell);
  const hv = (i, j) => VY[Math.min(N, Math.max(0, j)) * V + Math.min(N, Math.max(0, i))];
  const VN = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const nx = hv(i - 1, j) - hv(i + 1, j), nz = hv(i, j - 1) - hv(i, j + 1), ny = 2 * GRID.cell, l = Math.hypot(nx, ny, nz);
    const o = (j * V + i) * 3; VN[o] = nx / l; VN[o + 1] = ny / l; VN[o + 2] = nz / l;
  }
  const pos = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = j * V + i;
    pos[k * 3] = gx0 + i * GRID.cell; pos[k * 3 + 1] = VY[k]; pos[k * 3 + 2] = gz0 + j * GRID.cell;
  }
  // diagonal a-c everywhere (heightAt matches it)
  const idx = new Uint32Array(N * N * 6);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * V + i, b = a + 1, d = a + V, c = d + 1, o = (j * N + i) * 6;
    idx[o] = a; idx[o + 1] = d; idx[o + 2] = c; idx[o + 3] = a; idx[o + 4] = c; idx[o + 5] = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(VN, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const cellOf = (x, z) => {
    const fx = (x - gx0) / GRID.cell, fz = (z - gz0) / GRID.cell;
    const i = Math.min(N - 1, Math.max(0, Math.floor(fx))), j = Math.min(N - 1, Math.max(0, Math.floor(fz)));
    return { i, j, u: Math.min(1, Math.max(0, fx - i)), v: Math.min(1, Math.max(0, fz - j)) };
  };
  const heightAt = (x, z) => {
    if (inFlat(x, z)) return 0;
    const { i, j, u, v } = cellOf(x, z);
    const a = hv(i, j), b = hv(i + 1, j), d = hv(i, j + 1), c = hv(i + 1, j + 1);
    return v >= u ? a + (c - d) * u + (d - a) * v : a + (b - a) * u + (c - b) * v;   // tris (a, d, c) / (a, c, b)
  };
  const normalAt = (x, z, target = new THREE.Vector3()) => {
    const { i, j, u, v } = cellOf(x, z);
    const n = (ii, jj) => { const o = (Math.min(N, jj) * V + Math.min(N, ii)) * 3; return [VN[o], VN[o + 1], VN[o + 2]]; };
    const A = n(i, j), B = n(i + 1, j), D = n(i, j + 1), C = n(i + 1, j + 1);
    const w = v >= u ? [1 - v, 0, u, v - u] : [1 - u, u - v, v, 0];     // weights a, b, c, d
    target.set(A[0] * w[0] + B[0] * w[1] + C[0] * w[2] + D[0] * w[3], A[1] * w[0] + B[1] * w[1] + C[1] * w[2] + D[1] * w[3], A[2] * w[0] + B[2] * w[1] + C[2] * w[2] + D[2] * w[3]);
    return target.normalize();
  };

  // ---------------------------------------------------------------- tones (all from TOWN_PALETTE, pattern steps 0.72..1.07)
  const tint = (r, f) => r.map((h) => '#' + new THREE.Color(h).multiplyScalar(f).getHexString());
  const mixRow = (a, b, f, m = 1) => a.map((h, i) => '#' + new THREE.Color(h).lerp(new THREE.Color(b[i]), f).multiplyScalar(m).getHexString());
  const laneCob = mixRow(P.cobble, P.plaza, 0.55, 1.04);              // lane setts: one step lighter, toward the plaza stone
  const TONES = [
    P.grass, P.grassDark, P.grassLight, P.forest, P.dirt, tint(P.dirt, 0.8), tint(P.dirt, 1.06),
    laneCob, tint(laneCob, 0.91), P.grout, P.plaza, tint(P.plaza, 0.92), tint(P.plaza, 1.05), P.kerb, P.ashlar,
    P.stone, P.autumn, P.trunk, P.moss, tint(P.dirt, 0.72), tint(P.grout, 0.8), P.dial, tint(P.stone, 0.78), tint(P.forest, 0.86), P.leaf,
    tint(P.grassDark, 0.87), mixRow(P.grassLight, P.mossTuft, 0.3, 1.03),   // 25 / 26: lawn clumps (lush dark / sunny light)
  ];
  const T = { grass: 0, grassDark: 1, grassLight: 2, forest: 3, clumpDark: 25, clumpLight: 26 };
  const toneArr = [];
  for (const r of TONES) for (const h of r) toneArr.push(new THREE.Color(h));
  const NT = TONES.length;
  const roadPts = ROAD_S.map(([x, z]) => new THREE.Vector2(x, z));

  const uniforms = {
    tGZone: { value: zoneTex }, tGDecal: { value: decalTex },
    uGZoneRect: { value: new THREE.Vector4(BAKE.x0, BAKE.z0, ZW * BAKE.res, ZH * BAKE.res) },
    uGT: { value: toneArr },
    uGPlaza: { value: new THREE.Vector4(PL.cx, PL.cz, KERB.ring0, KERB.r0) },
    uGCircle: { value: new THREE.Vector4(CI.cx, CI.cz, SETT.cw, SETT.sl) },
    uGRoad: { value: roadPts }, uGRoadN: { value: roadPts.length },
    uGMisc: { value: new THREE.Vector4(WATER_LEVEL, LANE_CELL, SPAN, KERB.r1) },
    uGMisc2: { value: new THREE.Vector4(ctx.night ? 1 : 0, KERB.widen, CLUMP.dark, CLUMP.light) },
  };
  const material = toonMaterial(engine, {
    color: 0xffffff, outline: 'depth', normalNoise: 0.15, uniforms,
    vertexHead: 'varying vec3 vGN;',
    vertex: 'vGN = normalize(mat3(modelMatrix) * objectNormal);',
    fragmentHead: GROUND_GLSL(NT, roadPts.length),
    tones: GROUND_TONES_GLSL,
  });
  if (ctx.params?.get?.('groundDebug')) { material.defines.GROUND_DEBUG = ''; }
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'ground-terrain'; mesh.castShadow = true; mesh.receiveShadow = true;
  // LEAD (perf, TOWN.md §12.4): the grid is DRAWN as 8x8 tiles (20 m) sharing its vertex buffers, each with its own
  // index + bounds, so frustum culling (colour, normal and the shadow camera) drops the ~90 % a gameplay view never
  // sees. `mesh` (the whole grid) stays the query / material object for other modules and is not added.
  const TILE = Math.round(40 / GRID.cell), tiles = [];
  for (let tj = 0; tj < N; tj += TILE) for (let ti = 0; ti < N; ti += TILE) {
    const n = Math.min(TILE, N - ti), m = Math.min(TILE, N - tj), tix = new Uint32Array(n * m * 6);
    let o = 0, y0 = Infinity, y1 = -Infinity;
    for (let j = tj; j < tj + m; j++) for (let i = ti; i < ti + n; i++) {
      const a = j * V + i, b = a + 1, d = a + V, c = d + 1;
      tix[o++] = a; tix[o++] = d; tix[o++] = c; tix[o++] = a; tix[o++] = c; tix[o++] = b;
      y0 = Math.min(y0, VY[a], VY[c]); y1 = Math.max(y1, VY[a], VY[c]);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', geo.attributes.position); tg.setAttribute('normal', geo.attributes.normal);
    tg.setIndex(new THREE.BufferAttribute(tix, 1));
    tg.boundingBox = new THREE.Box3(new THREE.Vector3(gx0 + ti * GRID.cell, y0 - 0.5, gz0 + tj * GRID.cell),
      new THREE.Vector3(gx0 + (ti + n) * GRID.cell, y1 + 0.5, gz0 + (tj + m) * GRID.cell));
    tg.boundingSphere = tg.boundingBox.getBoundingSphere(new THREE.Sphere());
    const tm = new THREE.Mesh(tg, material);
    tm.name = 'ground-terrain'; tm.castShadow = true; tm.receiveShadow = true;
    tiles.push(tm);
  }

  // ---------------------------------------------------------------- JS zone queries (mirror the shader decisions)
  const dPlaza = (x, z) => Math.hypot(x - PL.cx, z - PL.cz);
  const ZONE = { GRASS: 0, FOREST: 1, LANE: 2, VERGE: 3, ROAD: 4, CROWN: 5, PLAZA: 6, KERB: 7, BANK: 8, WATER: 9, ROCK: 10, BRIDGE: 11 };
  const inBridge = (x, z) => Math.abs(x - BRIDGE.x) < BRIDGE.len / 2 + 0.1 && Math.abs(z - BRIDGE.z) < BRIDGE.w / 2 + 0.15;
  const inBake = (x, z) => x > BAKE.x0 && z > BAKE.z0 && x < BAKE.x1 && z < BAKE.z1;
  const zoneAt = (x, z) => {
    const y = heightAt(x, z);
    if (inBridge(x, z)) return ZONE.BRIDGE;
    if (y < WATER_LEVEL) return ZONE.WATER;
    if (y < WATER_LEVEL + 0.14) return ZONE.BANK;
    if (normalAt(x, z).y < 0.66) return ZONE.ROCK;
    const dp = dPlaza(x, z), ib = inBake(x, z);
    const lw = dp > KERB.ring0 - 0.05 ? KERB.widen * (1 - smooth(KERB.r1, KERB.r1 + 0.6, dp)) : 0;   // = shader flare
    const cobIn = (ib ? sample(x, z, 0) - 0.5 : -0.5) * 2 * SPAN + lw;
    if (dp < KERB.r0) return cobIn > 0 && dp > KERB.ring0 ? ZONE.LANE : ZONE.PLAZA;
    if (dp < KERB.r1 + 0.02 && cobIn <= 0) return ZONE.KERB;
    if (cobIn > 0) return ZONE.LANE;
    if (cobIn > -0.2) return ZONE.VERGE;
    if (ib && sample(x, z, 1) > 0.5) return polyDist(ROAD_S, x, z).d < 0.2 ? ZONE.CROWN : ZONE.ROAD;
    if (!ib || sample(x, z, 2) > 0.5) return ZONE.FOREST;
    return ZONE.GRASS;
  };
  const tonesIdx = (x, z) => {
    if (zoneAt(x, z) === ZONE.FOREST) return T.forest;
    const a = (inBake(x, z) ? sample(x, z, 3) : 0.5) + 0.05 * (noise2(x * 3.1, z * 3.1, 39) - 0.5);
    return a > CLUMP.dark ? T.clumpDark : a < CLUMP.light ? T.clumpLight : T.grass;
  };
  const tonesAt = (x, z) => { const k = tonesIdx(x, z); return { hi: toneArr[k * 3].clone(), mid: toneArr[k * 3 + 1].clone(), sh: toneArr[k * 3 + 2].clone() }; };
  const colorAt = (x, z) => toneArr[tonesIdx(x, z) * 3 + 1].clone();
  const isWater = (x, z) => heightAt(x, z) < WATER_LEVEL;
  const clear = (x, z) => {
    if (heightAt(x, z) < WATER_LEVEL + 0.25) return true;
    const rv = polyDist(RIVER_S, x, z);
    if (rv.d < riverHalf(x, z) + 1.6) return true;
    // the south reach (seen from the north): keep a meadow strip on its far bank so it is not hidden behind crowns
    if (z > 37.5 && x < 40 && rv.d < riverHalf(x, z) + 3.4) return true;
    const rd = polyDist(ROAD_S, x, z);
    if (rd.d < 1.6) return true;
    if (rd.side > 0 && rd.d < 2.6 && x > -0.5 && x < 45.5) return true;     // in town: a meadow strip south of the road
    if (x > BAY.x0 - 0.6 && x < BAY.x1 + 0.6 && z > 35 && z < BAY.z1 + 0.6) return true;   // the south bay (lead round 6)
    // ... and its sight line: house-9's front faces the camera across the river, so no tree south of it may stand in
    // front of the gable / door (a 7 m pine at z 55 hid the door at the gameplay camera)
    if (x > 16.5 && x < 28.5 && z > 35 && z < 62) return true;
    return inBridge(x, z);
  };
  const isGrassZone = (x, z) => {
    const zn = zoneAt(x, z);
    return zn === ZONE.GRASS || zn === ZONE.CROWN || zn === ZONE.FOREST;
  };

  // ---------------------------------------------------------------- kerb ring + bridge (one Builder)
  const b = new Builder(engine, { name: 'ground-stone' });
  {
    // 72 dressed kerb stones; where a lane runs in, the run ends on a shorter dressed END stone placed exactly at
    // the (flared, wobbled) lane edge the shader paints, so the setts run right up to it (no bare slab wedge)
    const n = 72, SUB = 8;
    const P3 = (r, a, y) => new THREE.Vector3(PL.cx + Math.sin(a) * r, y, PL.cz - Math.cos(a) * r);
    const cobAt = (r, a) => (sample(PL.cx + Math.sin(a) * r, PL.cz - Math.cos(a) * r, 0) - 0.5) * 2 * SPAN + KERB.widen;
    const okA = (a) => [KERB.r0 - 0.02, (KERB.r0 + KERB.r1) / 2, KERB.r1 + 0.02].every((r) => cobAt(r, a) < -0.03);
    const okSpan = (a0, a1) => okA(a0) && okA(a1) && okA((a0 + a1) / 2);
    const block = (a0, a1, tn, end) => {
      const h = KERB.top + (end ? 0.012 : 0);
      const c = [P3(KERB.r0, a0, -0.06), P3(KERB.r0, a1, -0.06), P3(KERB.r0, a0, h), P3(KERB.r0, a1, h),
        P3(KERB.r1, a0, -0.06), P3(KERB.r1, a1, -0.06), P3(KERB.r1, a0, h - 0.008), P3(KERB.r1, a1, h - 0.008)];
      b.hexa(c, { tones: 'kerb', tint: tn });
    };
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + 0.0137, a1 = ((i + 1) / n) * Math.PI * 2 + 0.0137;
      const tn = [1, 0.95, 1.04, 0.97, 1.02][(i * 7) % 5];
      if (okSpan(a0, a1)) { block(a0, a1, tn, false); continue; }
      const d = (a1 - a0) / SUB;
      let k0 = 0, k1 = 0;
      while (k0 < SUB && okSpan(a0 + k0 * d, a0 + (k0 + 1) * d)) k0++;
      while (k1 < SUB - k0 && okSpan(a1 - (k1 + 1) * d, a1 - k1 * d)) k1++;
      if (k0 > 0) block(a0, a0 + k0 * d, 1.07, true);
      if (k1 > 0) block(a1 - k1 * d, a1, 1.07, true);
    }
  }
  const bridgePerches = [];
  {
    const { x: bx, z: bz, len, w } = BRIDGE;
    const n = 20, pw = len / n;
    const BOFS = [0.0089, 0.0053];   // anti-tie offset of the deck planks (swept: 32 -> 16 px crawl, the rest is water)
    const deckY = (u) => 0.16 + 0.16 * (1 - (2 * u - 1) ** 2);
    const V3 = (x, y, zz) => new THREE.Vector3(x, y, zz);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, x = bx - len / 2 + (i + 0.5) * pw;
      const tn = [1, 0.94, 1.04, 0.97][(i * 3) % 4];
      b.box(pw - 0.034, 0.07, w + (i % 3 === 1 ? 0.07 : 0), { tones: 'plank', tint: tn, at: [x + BOFS[0], deckY(u) - 0.07 + BOFS[1], bz + 0.0061] });
    }
    for (const s of [-1, 1]) {
      const z = bz + s * (w / 2 - 0.12);
      for (let i = 0; i < 4; i++) {                                     // stringers under the deck
        const u0 = i / 4, u1 = (i + 1) / 4;
        const x0 = bx - len / 2 + u0 * len, x1 = bx - len / 2 + u1 * len;
        const y0 = deckY(u0) - 0.07, y1 = deckY(u1) - 0.07;
        b.hexa([V3(x0, y0 - 0.16, z - 0.09), V3(x1, y1 - 0.16, z - 0.09), V3(x0, y0, z - 0.09), V3(x1, y1, z - 0.09),
          V3(x0, y0 - 0.16, z + 0.09), V3(x1, y1 - 0.16, z + 0.09), V3(x0, y0, z + 0.09), V3(x1, y1, z + 0.09)], { tones: 'timber' });
      }
      const posts = [0.04, 0.5, 0.96];
      for (const u of posts) {
        const x = bx - len / 2 + u * len, y = deckY(u);
        b.box(0.13, 0.86, 0.13, { tones: 'timber', at: [x + 0.0071, y - 0.09, z + s * 0.11] });
        bridgePerches.push(new THREE.Vector3(x, y + 0.78, z + s * 0.11));
      }
      for (let i = 0; i < 2; i++) {                                     // hand rails
        const ua = posts[i], ub = posts[i + 1];
        const xa = bx - len / 2 + ua * len, xb = bx - len / 2 + ub * len;
        const ya = deckY(ua) + 0.62, yb = deckY(ub) + 0.62, zz = z + s * 0.11;
        b.hexa([V3(xa, ya, zz - 0.05), V3(xb, yb, zz - 0.05), V3(xa, ya + 0.09, zz - 0.05), V3(xb, yb + 0.09, zz - 0.05),
          V3(xa, ya, zz + 0.05), V3(xb, yb, zz + 0.05), V3(xa, ya + 0.09, zz + 0.05), V3(xb, yb + 0.09, zz + 0.05)], { tones: 'plank', tint: 1.03 });
      }
    }
    for (const u of [0.33, 0.67]) for (const s of [-1, 1]) {           // piles in the water
      const x = bx - len / 2 + u * len;
      b.cylinder(0.11, 0.11, 0.9, { segments: 8, tones: 'timber', at: [x + 0.0053, WATER_LEVEL - 0.55, bz + s * (w / 2 - 0.12)] });
    }
    for (const s of [-1, 1]) {                                          // stone abutments at both banks
      const x = bx + s * (len / 2 - 0.25);
      b.box(0.62, 0.42, w + 0.36, { tones: 'stone', pattern: 'rubble', at: [x + 0.0047, -0.32, bz + 0.0031] });
    }
  }
  // the Riverbend landing: a plank jetty behind the boathouse (house-13) with a moored rowboat
  const JETTY = { x0: -0.75, x1: -3.05, z: 16.62, w: 0.95, y: 0.1 };
  {
    const { x0, x1, z, w, y } = JETTY, n = 9, pw = (x0 - x1) / n;
    for (let i = 0; i < n; i++) {
      const x = x0 - (i + 0.5) * pw;
      b.box(pw - 0.034, 0.06, w + (i % 4 === 2 ? 0.06 : 0), { tones: 'plank', tint: [1, 0.95, 1.04, 0.98][i % 4], at: [x + 0.0043, y - 0.06, z + 0.0061] });
    }
    for (const sd of [-1, 1]) {                                        // dark joists under the deck (its reflection reads as timber, not a pale slab)
      b.box(x0 - x1 - 0.12, 0.09, 0.1, { tones: 'timber', tint: 0.85, at: [(x0 + x1) / 2 + 0.0043, y - 0.15, z + sd * (w / 2 - 0.16) + 0.0061] });
    }
    for (const u of [0.42, 1]) for (const sd of [-1, 1]) {            // piles, the outer pair taller (mooring posts)
      const x = x0 - u * (x0 - x1) + 0.07, top = u === 1 ? y + 0.42 : y - 0.04;
      b.cylinder(0.075, 0.075, top - (WATER_LEVEL - 0.5), { segments: 8, tones: 'timber', at: [x + 0.0053, WATER_LEVEL - 0.5, z + sd * (w / 2 - 0.06)] });
    }
  }
  const stone = b.build({ name: 'ground-stone' });

  // rowboat: own tiny mesh, bobs one texel on the water (stepped, pure f(t)), snapped to the texel grid
  const boat = new THREE.Group();
  {
    const bb = new Builder(engine, { name: 'ground-boat' });
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const L2 = 0.95, W2 = 0.38, H = 0.3;                                 // half length (along z), half beam, depth
    // hull: midship block + tapered bow / stern blocks (planar trapezoids), rust-red bottom, dark topsides
    const hullSeg = (z0, z1, w0, w1, b0, b1, tones, ya = 0, yb = H) => bb.hexa([
      V3(-w0 * b0, ya, z0), V3(w0 * b0, ya, z0), V3(-w0, yb, z0), V3(w0, yb, z0),
      V3(-w1 * b1, ya, z1), V3(w1 * b1, ya, z1), V3(-w1, yb, z1), V3(w1, yb, z1)], { tones });
    const red = P.red, dark = P.timber, F = H - 0.11;                   // F = inside floor
    hullSeg(-0.45, 0.45, W2, W2, 0.62, 0.62, red, -0.1, 0.12);
    hullSeg(-0.45, 0.45, W2, W2, 1, 1, dark, 0.12, F);
    hullSeg(0.45, L2, W2, 0.06, 0.62, 0.5, red, -0.1, 0.12);
    hullSeg(0.45, L2, W2, 0.06, 1, 1, dark, 0.12, F);
    hullSeg(-L2 + 0.25, -0.45, 0.24, W2, 0.62, 0.62, red, -0.1, 0.12);
    hullSeg(-L2 + 0.25, -0.45, 0.24, W2, 1, 1, dark, 0.12, F);
    // gunwale walls round the open hull (outline stern -> bow on each side + the transom), cream top strake
    const outl = [[-L2 + 0.25, 0.24], [-0.45, W2], [0.45, W2], [L2, 0.06]];
    const wall = (ax, az, bx2, bz2, t, y0, y1a, y1b, tones) => {
      const dx = bx2 - ax, dz = bz2 - az, l = Math.hypot(dx, dz), nx = -dz / l * t, nz = dx / l * t;
      bb.hexa([V3(ax, y0, az), V3(bx2, y0, bz2), V3(ax, y1a, az), V3(bx2, y1b, bz2),
        V3(ax + nx, y0, az + nz), V3(bx2 + nx, y0, bz2 + nz), V3(ax + nx, y1a, az + nz), V3(bx2 + nx, y1b, bz2 + nz)], { tones });
    };
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const [z0, w0] = outl[i], [z1, w1] = outl[i + 1];
      // walls run along z; x = +-w (side sd); thickness inward
      const t = 0.055 * -sd;
      const yb = i === 2 ? H + 0.04 : H;
      wall(sd * w0, z0, sd * w1, z1, sd > 0 ? 0.055 : -0.055, F - 0.01, H, yb, dark);
      wall(sd * (w0 + 0.004), z0, sd * (w1 + 0.004), z1, sd > 0 ? 0.03 : -0.03, H - 0.035, H + 0.012, yb + 0.012, 'cream');
      void t;
    }
    wall(-0.24, -L2 + 0.25, 0.24, -L2 + 0.25, -0.055, F - 0.01, H, H, dark);                   // transom
    bb.box(0.5, 0.03, 1.15, { tones: 'plank', at: [0, F, 0.02] });                            // bottom boards
    bb.box(2 * W2 - 0.08, 0.05, 0.17, { tones: 'plank', tint: 1.05, at: [0, H - 0.1, 0.18] });   // thwart
    bb.box(0.5, 0.05, 0.15, { tones: 'plank', tint: 1.05, at: [0, H - 0.1, -0.5] });            // stern seat
    const g = bb.build({ name: 'ground-boat' });
    boat.add(g);
  }
  boat.position.set(-3.27, WATER_LEVEL - 0.13, 17.55);
  boat.name = 'ground-boat';
  engine.camera.snapObjectToTexel(boat);

  // ---------------------------------------------------------------- grass (sprites; ground tones at the root)
  const fps = [...L.houses, L.clocktower].map((h) => h.footprint);
  const onBuilding = (x, z) => fps.some((f) => x > f.x - 0.08 && x < f.x + f.w + 0.08 && z > f.z - 0.08 && z < f.z + f.d + 0.08);
  const objRects = L.objects.filter((o) => o.owner !== 'house').map((o) => o.rect);
  const onObject = (x, z) => objRects.some((r) => x > r.x + 0.05 && x < r.x + r.w - 0.05 && z > r.z + 0.05 && z < r.z + r.d - 0.05);
  const terrain = {
    mesh, tiles, heightAt, normalAt, colorAt, tonesAt, zoneAt, isGrass: isGrassZone, analyticHeightAt: analyticHeight,
    size: GRID.size, center: [GRID.cx, GRID.cz], waterLevel: WATER_LEVEL, ZONES: ZONE, zoneTexture: zoneTex, palette: P,
  };
  // quality tier (docs/TOWN.md §11): low = half the tufts (Poisson radius x sqrt 2)
  const lowQ = ctx.params?.get?.('quality') === 'low';
  const hash2 = (x, z, s) => { const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const cobAt = (x, z) => (inBake(x, z) ? sample(x, z, 0) - 0.5 : -0.5) * 2 * SPAN;   // m inside a lane path (< 0 outside)
  // grass creeps in between the outer setts of every lane (matches the shader's turf cells only loosely: sprites
  // overdraw the setts, so a few tufts on the edge stones read as grass growing in the joints)
  const laneEdgeGrass = (x, z) => { const c = cobAt(x, z); return c > 0 && c < 0.16 && dPlaza(x, z) > KERB.r1 + 0.3 && hash2(x, z, 3) < 0.35; };
  const grassTerrain = { ...terrain, isGrass: (x, z) => (isGrassZone(x, z) || (zoneAt(x, z) === ZONE.LANE && laneEdgeGrass(x, z))) && normalAt(x, z).y > 0.72 };
  // doors, doorsteps and doormats stay clear: a 1.5 m square on the door tile in front of every door
  const doorPts = [...L.houses, L.clocktower].filter((h) => h.doorPoint && h.doorNormal)
    .map((h) => [h.doorPoint.x + h.doorNormal[0] * 0.6, h.doorPoint.z + h.doorNormal[1] * 0.6]);
  const onDoor = (x, z) => doorPts.some(([dx, dz]) => Math.abs(x - dx) < 0.75 && Math.abs(z - dz) < 0.75);
  const ga = viewArea(engine, 3);
  const half = GRID.size / 2 - 1;
  const gaC = { x0: Math.max(ga.x0, GRID.cx - half), z0: Math.max(ga.z0, GRID.cz - half), x1: Math.min(ga.x1, GRID.cx + half), z1: Math.min(ga.z1, GRID.cz + half) };
  const rFor = (a, r, max) => Math.max(r, 1.02 * Math.sqrt(((a.x1 - a.x0) * (a.z1 - a.z0) * 0.76) / (max * 0.97)));   // = createGrass's cap (no warning)
  const grass = createGrass(engine, grassTerrain, {
    area: gaC, r: rFor(gaC, lowQ ? 0.13 : 0.09, lowQ ? 40000 : 80000), seed: 4, accent: 0.03, maxCount: lowQ ? 40000 : 80000,
    mask: (x, z) => {
      if (onBuilding(x, z) || onObject(x, z) || inBridge(x, z) || onDoor(x, z)) return false;
      const zn = zoneAt(x, z), hh = hash2(x, z, 1);
      if (zn === ZONE.FOREST) return noise2(x * 0.9, z * 0.9, 77) > 0.52 && hh < 0.4;   // forest floor: clumps only
      if (zn === ZONE.CROWN) return noise2(x * 2.2, z * 2.2, 78) > 0.35 && hh < 0.45;
      if (zn === ZONE.LANE) return true;
      // open lawn: dense, densest in the lush clumps; a worn, thinned strip along every lane / the kerb
      const k = tonesIdx(x, z);
      let keep = k === T.clumpDark ? 1 : k === T.clumpLight ? 0.62 : 0.85;
      const toLane = -cobAt(x, z), toKerb = dPlaza(x, z) - KERB.r1;
      keep *= 0.18 + 0.82 * smooth(0.25, 0.8, Math.min(toLane, toKerb + 0.1) + 0.12 * (noise2(x * 2.3, z * 2.3, 79) - 0.5));
      return hh < keep;
    },
    flowers: { fraction: 0.018, seed: 9, tints: [{ hex: P.flowerViolet, weight: 0.35 }, { hex: P.flowerWhite, weight: 0.3 }, { hex: P.flowerYellow, weight: 0.25 }, { hex: P.flowerRed, weight: 0.1 }] },
  });
  for (const m of grass.meshes) m.removeFromParent();

  // reeds and rushes: taller tufts in clumps along the waterline (only built when the river is in view)
  let reeds = null;
  if (ga.x0 < -0.8 || ga.z1 > 38) {
    const reedZone = (x, z) => { const y = heightAt(x, z); return y > WATER_LEVEL - 0.04 && y < WATER_LEVEL + 0.135 && !inBridge(x, z); };
    reeds = createGrass(engine, { ...terrain, isGrass: reedZone, tonesAt: (x, z) => ({ hi: toneArr[3].clone(), mid: toneArr[4].clone(), sh: toneArr[5].clone() }) }, {
      area: gaC, r: rFor(gaC, 0.15, 30000), seed: 21, accent: 0.06, heights: [0.15, 0.35, 0.5], scale: 1.45, maxCount: 30000, renderOrder: -9,
      mask: (x, z) => noise2(x * 0.8 + 3, z * 0.8, 81) > 0.5, flowers: false,
    });
    for (const m of reeds.meshes) m.removeFromParent();
  }

  // ---------------------------------------------------------------- water (post pass)
  let water = null;
  if (ctx.params?.get?.('water') !== '0') {
    // per time of day: the day river keeps a blue-green body (golden sky would otherwise milk it out), the night
    // river reflects a moonlit sky (not the near-black night sky) with a brighter body + a reading foam line
    const WTOD = {
      noon: { depthMax: 0.55, reflect: 0.2, solidReflect: 0.36 },
      morning: { depthMax: 0.55, reflect: 0.2, solidReflect: 0.36 },
      // golden: a clear green-blue body (no milky sky wash), warm glints, the banks' trees reflected
      golden: { depthMax: 0.5, reflect: 0.12, skyReflect: 0.05, solidReflect: 0.38, opacity: [0.62, 0.8, 0.94], light: 0.7,
        shallow: '#5F9C92', mid: '#3F7C8E', deep: '#28587A', transmit: '#A6C8C2', cloudReflect: 0.1,
        shoreColor: '#F4E2B4', waveColor: '#C8D8C8', sparkleColor: '#FFF0C8' },
      // night: a dark-blue body that still separates from the banks, a pale shore line, faint moon / lamp glints
      night: { depthMax: 0.7, reflect: 0.3, skyReflect: 0.3, solidReflect: 0.5, opacity: [0.7, 0.86, 0.96], foam: 0.5,
        skyColor: '#34507E', light: 0.5, shallow: '#3E6890', mid: '#2C5280', deep: '#1E3C66', transmit: '#8CA8CC',
        shoreColor: '#B4C8E4', waveColor: '#7E9CC8', sparkleColor: '#F2E8C0', sparkleRate: 0.05, cloudReflect: 0 },
    };
    water = createWater(engine, terrain, {
      level: WATER_LEVEL, seed: [-3.6, 18], maskCell: 0.25, maskExtent: 72, name: 'river', ...(WTOD[ctx.tod] ?? WTOD.noon),
      ...(lowQ ? { reflection: false } : {}),   // LEAD (quality tier): low skips the reflection scene render (sky-only reflection)
    });
    // the reflection render costs a scene render: only run it while the river can be on screen
    const vis = () => { const a = viewArea(engine, 4); return a.x0 < -0.5 || a.z1 > 38.2; };
    water.pass.enabled = vis();
    engine.onUpdate(() => { water.pass.enabled = vis(); });
  }

  const group = new THREE.Group();
  group.name = 'ground';
  group.add(...tiles, stone, boat, ...grass.meshes, ...(reeds ? reeds.meshes : []));

  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  engine.stats.ground = { grass: grass.count, reeds: reeds?.count ?? 0, bakeMs: Math.round(tBake - t0), ms: Math.round(performance.now() - t0) };
  const BOB = [0, 0, 1, 1, 1, 0, -1, -1];                                  // texels, one step every 1/3 s
  const boatY = boat.position.y;
  const update = (t) => {
    const tw = engine.camera.texelWorld ?? 12 / 360;
    boat.position.y = boatY + BOB[Math.floor(t * 3) % BOB.length] * tw * 1.15;
  };
  return {
    group, update,
    anchors: {
      perches: bridgePerches,
      spots: {
        plaza: V3(PL.cx, 0, PL.cz), bridge: V3(BRIDGE.x, 0.32, BRIDGE.z), jetty: V3(-2.6, 0.1, 16.62), boat: V3(-3.27, WATER_LEVEL + 0.2, 17.55),
        riverWest: V3(-3.6, WATER_LEVEL, 20), riverSouth: V3(18, WATER_LEVEL, 44.9), riverBend: V3(-1.6, WATER_LEVEL, 39.2),
        roadWest: V3(-10.6, heightAt(-10.6, 33.6), 33.6), roadEast: V3(50.5, heightAt(50.5, 36.6), 36.6),
      },
    },
    api: { heightAt, normalAt, terrain, isWater, clear, zoneAt, ZONES: ZONE, river: RIVER_S, road: ROAD_S, waterLevel: WATER_LEVEL, water },
    stats: { grass: grass.count, reeds: reeds?.count ?? 0, bakeMs: Math.round(tBake - t0), groundMs: Math.round(performance.now() - t0) },
  };
}

// ------------------------------------------------------------------------------------------------ GLSL
const GROUND_GLSL = (NT, NR) => /* glsl */`
  uniform sampler2D tGZone; uniform sampler2D tGDecal; uniform vec4 uGZoneRect;
  uniform vec3 uGT[${NT * 3}];
  uniform vec4 uGPlaza, uGCircle, uGMisc, uGMisc2;
  uniform vec2 uGRoad[${NR}]; uniform int uGRoadN;
  varying vec3 vGN;
  vec2 gH2(vec2 p) { return vec2(hash12(p + vec2(311.0, 7.0)), hash12(p + vec2(57.0, 113.0))); }
  // voronoi in cell units: x = distance to the nearest border, y = to the 2nd nearest, zw = nearest border normal
  vec4 gVoro(vec2 p, out vec2 cid) {
    vec2 n = floor(p), f = p - n, mg = vec2(0.0), mr = vec2(0.0); float md = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)); vec2 r = g + gH2(n + g) * 0.76 + 0.12 - f; float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
    float b1 = 8.0, b2 = 8.0; vec2 bn = vec2(0.0, 1.0);
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j)); vec2 r = g + gH2(n + g) * 0.76 + 0.12 - f; vec2 dd = r - mr;
      if (dot(dd, dd) > 1e-5) {
        float d = dot(0.5 * (mr + r), normalize(dd));
        if (d < b1) { b2 = b1; b1 = d; bn = normalize(dd); } else if (d < b2) { b2 = d; }
      }
    }
    cid = n + mg;
    return vec4(b1, b2, bn);
  }
  // signed lateral offset from the road centre line (m) + the segment normal
  float gRoad(vec2 p, out vec2 nrm) {
    float best = 1e9, sv = 0.0; nrm = vec2(0.0, 1.0);
    for (int i = 0; i < ${NR - 1}; i++) {
      vec2 a = uGRoad[i], b = uGRoad[i + 1], ab = b - a;
      float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
      vec2 q = p - a - ab * t; float d = length(q);
      if (d < best) { best = d; vec2 nn = normalize(vec2(-ab.y, ab.x)); nrm = nn; sv = dot(q, nn); }
    }
    return sv;
  }
  float gSeg(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return length(p - a - ab * t); }
`;

// (decal tile lookups: layout TOWN_W x TOWN_H = 45 x 43 since the round-7 south bay; the decal texture is 64 x 64)
const GROUND_TONES_GLSL = /* glsl */`
{
  vec2 wp = vToonWorld.xz;
  float tw = max(uTexelWorld, 0.012);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 sR = camR.xz / tw, sU = camU.xz / tw;                      // screen px per metre of world x / z
  #define GPX(n) length(vec2(dot((n), sR), dot((n), sU)))
  #define TOPX(d) vec2(dot((d), sR), dot((d), sU))
  vec2 sunXZ = normalize(uSunDir.xz + 1e-4);
  vec2 sunPx = normalize(TOPX(sunXZ));
  float minPx = min(GPX(vec2(1.0, 0.0)), GPX(vec2(0.0, 1.0)));   // px per metre, worst direction
  vec3 gn = normalize(vGN);
  float wy = vToonWorld.y;

  vec2 zuv = (wp - uGZoneRect.xy) / uGZoneRect.zw;
  bool inZ = zuv.x > 0.001 && zuv.y > 0.001 && zuv.x < 0.999 && zuv.y < 0.999;
  vec4 zf = inZ ? texture2D(tGZone, zuv) : vec4(0.0, 0.0, 1.0, 0.5);
  float span2 = 2.0 * uGMisc.z;
  float cobIn = (zf.r - 0.5) * span2;          // m inside the lane path (< 0 outside)
  float lowN = vnoise(wp * 0.9 + 17.0);        // low-frequency wear noise

  // lawn: 2-tone clumps (lush dark / sunny light) from the baked low-frequency mask, ragged 1-px-ish edges
  float cl = zf.a + 0.05 * (vnoise(wp * 3.1 + 39.0) - 0.5);
  int k = cl > uGMisc2.z ? 25 : (cl < uGMisc2.w ? 26 : 0);

  vec2 dpv = wp - uGPlaza.xy; float dP = max(length(dpv), 1e-3);
  // lanes flare into the kerb gaps (the kerb runs end on dressed end stones right at this widened edge)
  float lw = dP > uGPlaza.z - 0.05 ? uGMisc2.y * (1.0 - smoothstep(uGMisc.w, uGMisc.w + 0.6, dP)) : 0.0;
  float cobW = cobIn + lw;
  bool isLane = cobW > 0.0;
  float vergeW = clamp(1.8 / minPx, 0.2, 0.5);              // earth verge >= ~2 px at any zoom
  bool night = uGMisc2.x > 0.5;
  if (gn.y < 0.66) {
    // ---------------- rock on steep banks: strata + cracks
    float n1 = vnoise(vec2(dot(wp, vec2(0.7, 0.7)) * 1.1, wy * 4.2)) * 0.6 + vnoise(vec2(wp.x * 2.3 - wp.y, wy * 9.0)) * 0.4;
    k = n1 < 0.3 ? 22 : 15;
  } else if (wy < uGMisc.x + 0.04 + 0.13 * vnoise(wp * 0.45 + 2.0) && wy < -0.05) {
    // ---------------- river bank: wet mud at the waterline, a pebble beach in places, pebbly bed below
    k = wy < uGMisc.x + 0.05 ? (night ? 6 : 19) : (night ? 4 : 5);   // night: a lighter mud line keeps the shore
    vec2 pc = wp / 0.3, pi = floor(pc);
    vec2 po = gH2(pi + 9.0) * 0.5 + 0.25;
    vec2 dpx = TOPX((pc - pi - po) * 0.3);
    float pr = 1.3 + 1.1 * hash12(pi + vec2(23.0, 7.0));
    if (hash12(pi + vec2(3.0, 41.0)) > 0.55 && length(dpx) < pr) k = dot(dpx, sunPx) > pr * 0.35 ? 15 : 21;
  } else if (dP < uGPlaza.w && !(isLane && dP > uGPlaza.z)) {
    // ---------------- the square
    if (dP > uGPlaza.z) {
      // flush ring course of long kerb stones just inside the raised kerb (radial joints + the inner joint)
      vec2 rad = dpv / dP, tan_ = vec2(-rad.y, rad.x);
      float n = 96.0, u = (atan(dpv.y, dpv.x) / 6.2831853 + 0.5) * n + 0.31, fa = fract(u);
      float eA = min(fa, 1.0 - fa) * 6.2831853 * dP / n * GPX(tan_);
      float eIn = (dP - uGPlaza.z) * GPX(rad);
      float h = hash12(vec2(floor(u), 5.0));
      k = h < 0.33 ? 13 : (h < 0.66 ? 11 : 10);
      if (eA < 1.0 || eIn < 1.0) k = 9;
      else if (eIn < 2.0) k = dot(-rad, sunXZ) > 0.3 ? 14 : 11;
    } else {
      // concentric courses of setts about the voting circle (v1 plazaId / courseId)
      vec2 q = wp - uGCircle.xy; float r = max(length(q), 1e-3);
      vec2 rad = q / r, tan_ = vec2(-rad.y, rad.x);
      float cw = uGCircle.z, kc = floor(r / cw), fr = r / cw - kc, rm = (kc + 0.5) * cw;
      float n = max(6.0, floor(6.2831853 * rm / uGCircle.w + 0.5));
      float u = (atan(q.y, q.x) / 6.2831853 + 0.5) * n + hash12(vec2(kc, 3.0)) * n;
      float si = mod(floor(u), n), fa = fract(u), arc = 6.2831853 * r / n;
      float pR = GPX(rad), pT = GPX(tan_);
      float eIn = fr * cw * pR, eOut = (1.0 - fr) * cw * pR, e0 = fa * arc * pT, e1 = (1.0 - fa) * arc * pT;
      float eR = min(eIn, eOut), eT = min(e0, e1), e = min(eR, eT);
      float sh = hash12(vec2(kc * 7.0 + 1.0, si));
      bool inner = r < 6.9;
      k = sh < 0.4 ? 10 : (sh < 0.8 ? 11 : 12);
      if (inner && sh > 0.93) k = 13;
      bool sunk = sh > 0.992 && r > 1.8;                                   // the odd sunken / broken sett
      if (sunk) k = hash12(vec2(si, kc)) > 0.4 ? 20 : 19;
      float stonePx = min(cw * pR, arc * pT);
      // zoomed out past viewHeight 14 (the vote preset, overviews) the 1-px joints beat against the texel grid
      // (moire wedges where the courses run along the screen axes): fade to the banded far LOD everywhere
      if (stonePx > 4.5 && tw < 14.0 / 360.0) {
        if (sunk) { if (e < 1.0) k = 9; }
        else if (e < 1.0 || (eR < 1.8 && eT < 1.8)) {
          k = 9;
          if (r > 7.6 && vnoise(wp * 0.6 + 4.0) > 0.7) k = 18;           // moss in the old joints by the kerb (rare clumps)
        } else if (e < 2.0) {
          vec2 o = eR < eT ? (eIn < eOut ? -rad : rad) : (e0 < e1 ? -tan_ : tan_);
          float sd = dot(o, sunXZ);
          if (sd > 0.3) k = 14; else if (sd < -0.3) k = 11;
        }
      } else {
        // far LOD: one tone per band of 3 courses + a 1-px joint between bands where the band period >= 4 px
        float cb = cw * 3.0, kb = floor(r / cb), f3 = fract(r / cb);
        k = mod(kb, 2.0) < 1.0 ? 10 : 11;
        if (sh > 0.84) k = sh > 0.95 ? 13 : 12;                               // per-sett mottle (random, no beat)
        if (cb * pR > 4.0 && min(f3, 1.0 - f3) * cb * pR < 0.5) k = 9;
      }
      if ((uGPlaza.z - dP) * GPX(dpv / dP) < 1.0) k = 9;                 // the joint at the ring course
    }
  } else if (dP < uGMisc.w + 0.02 && !isLane) {
    k = 5;                                                  // under the kerb blocks (hidden; slivers read as earth joints)
  } else if (isLane) {
    // ---------------- cobbled lanes: rounded setts (voronoi), sun-side bevel, sinking into earth at the edge
    vec2 cid; float cell = max(uGMisc.y, 5.0 / minPx);          // far LOD: bigger setts, still >= 5 px (no flat strip)
    vec4 v = gVoro(wp / cell, cid);
    float ePx = v.x * cell * GPX(v.zw);
    float e2Px = v.y * cell * minPx * 1.15;
    float h = hash12(cid + vec2(11.0, 71.0));
    k = h < 0.5 ? 7 : 8;
    float stonePx = cell * minPx;
    bool edge = cobW < max(0.11, 1.2 / minPx) + 0.05 * (lowN - 0.5);
    bool far_ = uGMisc.y * minPx < 4.5;
    if (far_ && h > 0.82) k = 20;                                 // far LOD: a third, darker mottle tone
    if (stonePx > 4.5) {
      if (ePx < 1.0 || (ePx < 1.9 && e2Px < 1.9)) k = edge ? (lowN > 0.5 ? 18 : 5) : (far_ && h < 0.5 ? 8 : 9);
      else if (ePx < 2.0) {
        // the plaza's lighting language: a cream sun-side rim (ashlar hi), the shade side one step down
        float sd = dot(v.zw, sunXZ);
        if (sd > 0.55) k = 14; else if (sd > 0.3) k = 13; else if (sd < -0.35 && !edge) k = 8;
      }
    }
    if (edge && k == 7) k = 8;
    // grass creeping in between the outer setts (whole cells turn to turf, the sprites fill them)
    if (cobW < 0.16 + 0.12 * lowN && hash12(cid + vec2(5.0, 29.0)) > 0.62) k = cl > uGMisc2.z ? 25 : 0;
    // crack decals (layout 'crack' on lane tiles): a jagged 1-px line across a few setts
    vec2 tile = floor(wp);
    if (tile.x >= 0.0 && tile.y >= 0.0 && tile.x < 45.0 && tile.y < 43.0) {
      float dc = texture2D(tGDecal, (tile + 0.5) / 64.0).r * 255.0;
      if (dc > 20.0 && dc < 60.0) {
        vec2 a = tile + 0.25 + gH2(tile + 3.0) * 0.5, b1 = a + (gH2(tile + 5.0) - 0.5) * 0.5, c1 = b1 + (gH2(tile + 7.0) - 0.5) * 0.45;
        vec2 pp = TOPX(wp);
        float dd = min(gSeg(pp, TOPX(a), TOPX(b1)), gSeg(pp, TOPX(b1), TOPX(c1)));
        if (dd < 0.5) k = 20;
      }
    }
  } else if (cobW > -vergeW) {
    // ---------------- verge: worn earth hugging the setts, breaking up into the grass in clumps
    float out_ = -cobW, vs = vergeW / 0.2;
    float th = (0.075 + 0.11 * vnoise(wp * 5.0 + 2.0)) * vs;
    if (out_ < 0.05 * vs) k = 5; else if (out_ < th) k = 4;
  } else if (zf.g > 0.5) {
    // ---------------- the cart road: ruts, grassy crown, mottle, pebbles
    vec2 rn; float vr = gRoad(wp, rn);
    float rPx = GPX(rn);
    k = vnoise(wp * 1.6 + 31.0) > 0.62 ? 6 : 4;
    float wob = (vnoise(wp * 0.7 + 3.0) - 0.5) * 0.12;
    for (int s = 0; s < 2; s++) {
      float c = (s == 0 ? -0.46 : 0.46) + wob;
      float dd = (vr - c) * rPx;
      if (abs(dd) < 1.05) k = 19;                                  // the rut: a 2-px dark wet groove
      else if (abs(dd) < 1.7) k = 5;
      else if (dd > 1.7 && dd < 2.9 && s == 0) k = 6;              // the lit lip on the far side of each rut
      else if (dd < -1.7 && dd > -2.9 && s == 1) k = 6;
    }
    float crown = abs(vr - wob * 0.5);
    if (crown < 0.24 + 0.12 * vnoise(wp * 3.0)) k = vnoise(wp * 2.2 + 9.0) > 0.3 ? (vnoise(wp * 4.0 + 1.0) > 0.6 ? 0 : 1) : 4;
    // pebbles (2-4 px, lit on the sun side)
    vec2 pc = wp / 0.26, pi = floor(pc);
    vec2 po = gH2(pi + 5.0) * 0.5 + 0.25;
    vec2 dpx = TOPX((pc - pi - po) * 0.26);
    float pr = 1.2 + 0.9 * hash12(pi + vec2(23.0, 7.0));
    float dens = 0.8;
    vec2 tile = floor(wp);
    if (tile.x >= 0.0 && tile.y >= 0.0 && tile.x < 45.0 && tile.y < 43.0) {
      float dc = texture2D(tGDecal, (tile + 0.5) / 64.0).r * 255.0;
      if (dc > 60.0 && dc < 100.0) dens = 0.55;                // layout 'pebbles' decal: a stonier patch
    }
    if (hash12(pi + vec2(3.0, 41.0)) > dens && length(dpx) < pr && abs(abs(vr) - 0.46) > 0.12) k = dot(dpx, sunPx) > pr * 0.4 ? 21 : 5;
  } else if (zf.b > 0.5) {
    // ---------------- forest floor: darker earth-green, leaf litter, twigs, a few leaf drifts
    k = vnoise(wp * 0.5 + 8.0) > 0.55 ? 23 : 3;
    if (zf.b < 0.56) k = 1;                                    // grassy fringe at the rim
    vec2 tile = floor(wp);
    float dens = 0.9;
    if (tile.x >= 0.0 && tile.y >= 0.0 && tile.x < 45.0 && tile.y < 43.0) {
      float dc = texture2D(tGDecal, (tile + 0.5) / 64.0).r * 255.0;
      if (dc > 100.0) dens = 0.72;                             // layout 'leaves' decal: a leaf drift
    }
    float lc = max(0.15, tw * 4.5);                            // litter cell: >= 4.5 px wide at any zoom (no speckle)
    vec2 pc = wp / lc, pi = floor(pc);
    vec2 dpx = TOPX((pc - pi - (gH2(pi + 2.0) * 0.6 + 0.2)) * lc);
    float hh = hash12(pi + vec2(13.0, 1.0));
    if (hh > dens + 0.05 * clamp(tw / 0.033 - 1.0, 0.0, 1.0) && abs(dpx.x) < 1.0 && abs(dpx.y) < 0.55) k = hash12(pi + 4.0) > 0.72 ? 16 : 24;
    float tcs = max(0.9, tw * 27.0);
    vec2 tc = wp / tcs, ti = floor(tc);                        // twigs: rare 4-px strokes
    if (hash12(ti + vec2(71.0, 3.0)) > 0.86) {
      vec2 a = (ti + 0.3 + gH2(ti) * 0.4) * tcs, d = normalize(gH2(ti + 1.0) - 0.5 + 1e-3) * tcs * 0.145;
      vec2 pp = TOPX(wp);
      if (gSeg(pp, TOPX(a - d), TOPX(a + d)) < 0.5) k = 17;
    }
  }

  toonHi = uGT[k * 3]; toonMid = uGT[k * 3 + 1]; toonSh = uGT[k * 3 + 2];
  #ifdef GROUND_DEBUG
    { vec3 dc = vec3(gn.y < 0.66 ? 1.0 : 0.0, zf.r, zf.b); toonHi = dc; toonMid = dc; toonSh = dc; }
  #endif
  #undef GPX
  #undef TOPX
}
`;
