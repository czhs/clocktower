// house-8 — "Hearthstone Cabin". Owner: house-8 agent. Contract: docs/TOWN.md §4 (piece API) / §6 (scale rules).
//
// DESIGN NOTE (v1: pipgws packages/assets/scripts/houses/house-8.ts, read only)
//   Signature: a squat ROUND-LOG CABIN under a low, broad, thick gable of mossy cedar shakes, its gable end turned
//   to the camera, and a MASSIVE TAPERING FIELDSTONE CHIMNEY built up the outside of that gable, stepping in at two
//   sloped shoulders and rising a metre clear of the ridge to a slab cap on corner stones. Log corners cross and
//   stick out, showing pale END-GRAIN discs in a column at both front corners. Two small purple-shuttered windows
//   with marigold boxes flank the chimney; a board-and-batten gable above; an oxblood dutch door in the west side
//   wall with a stone step, a rag mat, two pots and a lantern; a split-log woodpile along the side wall; chopping
//   block + axe out back. At 640x360 it must read as: "brown log box + grey stone chimney stabbing up through a
//   green-brown roof" — the only cabin, the only centred exterior chimney in the ring.
//   Distinct from house-7 (red toadstool) and house-9 (moss/stone clockworks).
//   v1 (houses/house-8.ts) has a pent hood over a door in the west side wall. In 3D (fix round 4) a west-wall door was
//   edge-on at the gameplay camera (yaw 0), so the door now sits in a 45-degree CHAMFER of the south-west corner: an
//   open CORNER PORCH under the cabin's own roof corner (the classic log-cabin porch), carried by a corner post, the
//   west wall plate and the gable sill beam crossing over it; the door faces SW (toward the door tile 29,33 AND the
//   camera), so the leaf, its timber frame, the plank deck, the mat and the steps read square-ish at yaw 0.
//   Palette rows (docs/TOWN.md §3): logs = plank (per-log tint 0.96..1.04), end grain = dial, sills / gable beam /
//   door frame / gable boards = timber (vboards), shakes = plank ramp + two neighbours (x0.9 / x1.07), the butt-joint
//   underlayer = timber mid / plank sh / timber sh, moss = low cushion clumps along the courses (mossTuft mid / moss mid / moss sh, 3 kinds),
//   chimney + plinth = stone (rubble + proud stones), weatherings / cap = ashlar, window frames + porch / verge trim =
//   cream, glass = glass (glow at night), shutters = paintRamp(style.shutters '#4a2f6b'), door = paintRamp(v1
//   '#7a2e24' oxblood), mat = paintRamp('#4a2f6b'), pots = brick, flowers = flowerYellow / pumpkin / flowerRed (v1
//   marigolds), woodpile = trunk + dial, lantern / axe head = iron, light pools = brass sh '#7A6248' / glow sh.
//   Layout: footprint x 30..34, z 29..34 (4x5, facing west), door tile 29,33. Local frame = world axes, origin at the
//   footprint centre (32, 0, 31.5): x east, z south (camera side). The SW corner is chamfered on the log centre lines
//   (legs CH = 0.95 m): the door centre on the chamfer's outer face is at world (30.77, 33.48), 0.23 m from the game's
//   doorPoint (30, 33.5) and facing SW onto the door tile. The left south window gave way to the porch (one shuttered
//   window right of the chimney). The chimney breast projects 0.34 m south of the footprint (< 0.6 m rule); nothing
//   stands on the lane (x < 30) except the low flagstone steps (<= 0.3 m, 0.1 m tall) and the roof overhang.
//   Quality: ctx.quality === 'low' builds every log / post / woodpile round as a 4-sided (diamond) prism instead of an
//   octagon (12 tris instead of 32: the lit-top / dark-bottom banding and the V grooves stay) and the moss cushions as
//   4-sided, non-casting dressing.
import * as THREE from 'three';
import { Builder, M, wallWithOpenings, window_, door, flowerBox, setGlowLit, nightGlow } from '../kit.js';
import { TOWN_PALETTE as P, paintRamp } from '../palette.js';
import { toWorld } from '../api.js';
import { rng } from '../../core/noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- dimensions (metres, local frame)
const R = 0.13;                 // log half-thickness (octagon apothem)
const RC = R / Math.cos(Math.PI / 8);
const PITCH = 0.24;             // log course pitch (logs overlap 2 cm: closed walls, V grooves)
const PL = 0.2;                 // plinth top = floor / door sill
const XW = -1.62, XE = 1.62;    // side-wall log centre lines
const ZS = 2.36, ZN = -2.3;     // gable-wall log centre lines (south = camera side)
const OUTX = XE + R, OUTZS = ZS + R, OUTZN = ZN - R;   // outer faces: x +-1.75, z 2.49 / -2.43
const STUB = 0.14;              // log ends cross past the outer faces
const EAVE = 2.74, RIDGE = 4.17;
const COURSES_G = 10;           // gable walls (south/north): k = 0..9, centres PL + R + k*PITCH
const COURSES_S = 10;           // side walls: half a course higher
const yG = (k) => PL + R + k * PITCH;
const yS = (k) => PL + R + (k + 0.5) * PITCH;
// SW corner chamfer on the log centre lines: from A (west wall) to B (south wall); frame FC: origin = chamfer midpoint
// on the log centre line, local +z = outward normal (SW), local +x = from A toward B (ry -pi/4 maps +z -> (-.707, .707))
const CH = 0.95, CH_RUN = CH * Math.SQRT2;
const CA = { x: XW, z: ZS - CH }, CB = { x: XW + CH, z: ZS }, CHC = { x: XW + CH / 2, z: ZS - CH / 2 };
const POST_R = 0.15;                                            // chamfer end posts (octagonal, vertical)
const APEX = CH / Math.SQRT2;                                   // local z of the porch corner (centre lines)
// door in the chamfer: opening local x -DW/2..DW/2, sill PL, top DTOP
const DW = 0.82, DTOP = PL + 1.95;
const JAMB = 0.08;
const PLATE_K = 8;                                              // west-wall courses >= this run on over the porch
// chopping block beside the porch, SW of the corner post (cart-road verge, off the lane / door tile, inside the
// cut-away's footprint + 0.35 m margin)
const CHOP = { x: -2.32, z: 2.82 };
// south windows (glass centre y, width, height)
const WIN = { y: 1.29, w: 0.42, h: 0.58, xs: [0.99] };     // (the left one gave way to the corner porch)

const OXBLOOD = paintRamp('#7a2e24');
const STEP_H = 0.1;
// light-pool glow colours (palette: brass sh, glow sh): the lantern's dim pool, the open door's warm spill
const POOL = { dim: '#7A6248', open: '#C8803C' };
// cedar shakes: the plank ramp and two neighbours (tint 0.91 / 1.08), the underlayer seen in the butt joints,
// moss = the moss ramp's mid / sh only (never its pale hi: that read as lawn-green tiles)
const PLK = P.plank.map((h) => new THREE.Color(h));
const shade = (f) => PLK.map((c) => '#' + c.clone().multiplyScalar(f).getHexString());
const SHAKE = [P.plank, shade(0.91), shade(1.08)];
const UNDER = [P.timber[1], P.plank[2], P.timber[2]];
// moss clumps: light core (mossTuft mid over moss mid), mid, dark rim; never the moss ramp's pale hi
const MOSS = [P.moss[1], P.moss[1], P.moss[2]];
const MOSS_L = [P.mossTuft[1], P.moss[1], P.moss[2]];
const MOSS_M = MOSS;
const mix = (a, b2, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b2), t).getHexString();
const MOSS_D = [mix(P.moss[1], P.moss[2], 0.3), mix(P.moss[1], P.moss[2], 0.5), P.moss[2]];

// quality tier: set per build (ctx.quality === 'low'): logs / posts / rounds become 4-sided prisms (12 tris, not 32)
let LOW = false;
/** Octagonal log along x from x0 to x1 (centre y, z). Flats face +-y / +-z. Low tier: a diamond (vertices +-y / +-z). */
function logX(b, x0, x1, y, z, opts) {
  if (x1 - x0 < 0.02) return;
  const r = opts.r ?? RC;
  if (LOW) { b.box(x1 - x0, r * Math.SQRT2, r * Math.SQRT2, { ...opts, origin: 'center', at: [(x0 + x1) / 2, y, z], rx: Math.PI / 4 }); return; }
  b.push(M({ at: [x0, y, z], rz: -Math.PI / 2 }));
  b.cylinder(r, r, x1 - x0, { segments: 8, ...opts });
  b.pop();
}
/** Octagonal log along z from z0 to z1. */
function logZ(b, z0, z1, y, x, opts) {
  if (z1 - z0 < 0.02) return;
  const r = opts.r ?? RC;
  if (LOW) { b.box(r * Math.SQRT2, r * Math.SQRT2, z1 - z0, { ...opts, origin: 'center', at: [x, y, (z0 + z1) / 2], rz: Math.PI / 4 }); return; }
  b.push(M({ at: [x, y, z0], rx: Math.PI / 2 }));
  b.cylinder(r, r, z1 - z0, { segments: 8, ...opts });
  b.pop();
}
/** Vertical octagonal post (low tier: square) from y0 to y1 at (x, z). */
function post(b, x, z, r, y0, y1, opts) {
  b.cylinder(r, r, y1 - y0, { segments: LOW ? 4 : 8, ...opts, at: [x, y0, z] });
}
/** Pale end-grain disc 1 texel proud of a log end (bark ring left showing). dir = +-1 along the axis. */
function endX(b, xEnd, dir, y, z, tint = 1) {
  const x0 = dir > 0 ? xEnd : xEnd - 0.035;
  logX(b, x0, x0 + 0.035, y, z, { r: RC * 0.74, tones: 'dial', tint });
}
function endZ(b, zEnd, dir, y, x, tint = 1) {
  const z0 = dir > 0 ? zEnd : zEnd - 0.035;
  logZ(b, z0, z0 + 0.035, y, x, { r: RC * 0.74, tones: 'dial', tint });
}
/** [a0, a1] minus the holes [[h0, h1], ...] -> segments. */
function cut(a0, a1, holes) {
  let segs = [[a0, a1]];
  for (const [h0, h1] of holes) {
    const out = [];
    for (const [s0, s1] of segs) {
      if (h1 <= s0 || h0 >= s1) { out.push([s0, s1]); continue; }
      if (h0 > s0) out.push([s0, h0]);
      if (h1 < s1) out.push([h1, s1]);
    }
    segs = out;
  }
  return segs;
}
/** Hexahedron frustum against a back plane: bottom w0 x d0 at y0, top w1 x d1 at y1, back face at z = zb (front +z). */
function frustum(b, x, zb, w0, d0, y0, w1, d1, y1, opts) {
  const c = [];
  for (let i = 0; i < 8; i++) {
    const top = i & 2, w = top ? w1 : w0, d = top ? d1 : d0;
    c.push(V(x + (i & 1 ? 0.5 : -0.5) * w, top ? y1 : y0, zb + (i & 4 ? d : 0)));
  }
  b.hexa(c, opts);
}
/** Box between two points in the XY plane at depth z (rake boards, axe haft). */
function segXY(b, [x0, y0], [x1, y1], z, h, d, opts) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  b.box(len, h, d, { ...opts, origin: 'center', at: [(x0 + x1) / 2, (y0 + y1) / 2, z], rz: Math.atan2(y1 - y0, x1 - x0) });
}

/** One quad (two triangles) wound so its face normal points along `out` (single-sided, hidden faces never built). */
function quad(b, p, out, opts) {
  const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
  const q = n.dot(out) < 0 ? [p[0], p[3], p[2], p[1]] : p;
  b.tris([q[0], q[1], q[2], q[0], q[2], q[3]].flatMap((v) => [v.x, v.y, v.z]), opts);
}

/**
 * Coursed cedar shakes on one roof slope. P3(s, a, lf) maps (slope distance up from the eave, coordinate along the
 * ridge, lift off the slope plane) to a local point. Each of the n courses is a run of FLUSH shakes of varied width
 * (soft tone changes only: no gaps and no joint strips, so no outline grid); each course's butt stands proud of the
 * one below and is ragged (hand-split shakes of uneven length), which gives the course shadow lines. Joints are
 * staggered against the course below (>= 7 cm apart), so no line ever continues across courses.
 * Only the visible faces are built: each piece = its top quad + its butt quad (4 tris); a dark underlayer slab
 * closes the slope from below. Returns the course geometry for mossClumps().
 */
function shakeCourses(b, rnd, { P3, sl, n, a0, a1, w = [0.18, 0.32], th = 0.075, lift = 0.045 }) {
  const c0 = [];
  for (let i = 0; i < 8; i++) c0.push(P3(i & 4 ? sl : 0, i & 1 ? a1 : a0, i & 2 ? -0.025 : -th + 0.005));
  b.hexa(c0, { tones: UNDER, pattern: 'none' });
  const o = P3(0, 0, 0), up = P3(0, 0, 1).sub(o), down = o.clone().sub(P3(1, 0, 0));
  const cl = sl / n;
  let prev = [];
  for (let k = 0; k < n; k++) {
    const s0 = k * cl, s1 = Math.min(sl, (k + 1) * cl + 0.03);
    const lfTop = (s) => lift * (1 - (s - s0) / (s1 - s0));
    const top = (sa, sb, aa, ag, tones) => quad(b, [P3(sa, aa, lfTop(sa)), P3(sa, ag, lfTop(sa)), P3(sb, ag, lfTop(sb)), P3(sb, aa, lfTop(sb))], up, { tones, pattern: 'none' });
    const butt = (sb, aa, ag, tones) => quad(b, [P3(sb, aa, lift - th), P3(sb, ag, lift - th), P3(sb, ag, lfTop(sb)), P3(sb, aa, lfTop(sb))], down, { tones, pattern: 'none' });
    const joints = [];
    let a = a0 - rnd() * w[0];
    while (a < a1 - 1e-3) {
      let ae = a + w[0] + rnd() * w[1];
      for (let tries = 0; tries < 3 && prev.some((j) => Math.abs(j - ae) < 0.07); tries++) ae += 0.08;
      if (ae > a1 - 0.08) ae = a1;
      const aa = Math.max(a0, a), ag = Math.min(a1, ae);
      if (ag - aa > 0.01) {
        const sb = k === 0 ? s0 : s0 - [0, 0, 0.025, 0.04][Math.floor(rnd() * 4)];
        const tones = shakeTone(rnd);
        top(sb, s1, aa, ag, tones); butt(sb, aa, ag, tones);
      }
      if (ae < a1) joints.push(ae);
      a = ae;
    }
    prev = joints;
  }
  return { P3, cl, lift, nrm: up.normalize() };
}
const shakeTone = (rnd) => { const x = rnd(); return x < 0.5 ? SHAKE[0] : x < 0.8 ? SHAKE[1] : SHAKE[2]; };

/**
 * Moss cushions grown on the shakes: each clump [course, a centre, length along the course, kind] is a row of low
 * octagonal cushions of varied size hugging that course's butt (fattest mid-clump, tapering at the ends), a few
 * spilling up onto the next course, and a lighter crown cushion on the fat ones. kind 0 = bright (mossTuft core over
 * moss mid), 1 = mid (moss mid core over a darker rim), 2 = dark (small, shaded). Irregular soft-edged blobs that
 * follow the courses; no tiles. Cushions sit just into the shake surface (no floating gap, no coplanar faces).
 */
function mossClumps(b, rnd, { P3, cl, lift, nrm }, clumps) {
  const az = new THREE.Vector3(0, 0, 1), xa = new THREE.Vector3().crossVectors(nrm, az).normalize();
  const KIND = [[MOSS_M, MOSS_L], [MOSS_D, MOSS_M], [MOSS_D, MOSS_D]];
  const cushion = (s, a, r, h, tones, k) => {
    const s0 = k * cl;
    const lf = lift * (1 - Math.min(1, (s + r - s0) / cl)) - 0.008;      // sunk to the surface at its upper edge
    const m = new THREE.Matrix4().makeBasis(xa, nrm, az).setPosition(P3(s, a, lf));
    b.push(m);
    b.cylinder(r, r * 0.86, h + 0.008, { segments: LOW ? 4 : 6, ry: rnd() * Math.PI, tones, pattern: 'none', ...(LOW ? { layer: 'soft' } : {}) });
    b.pop();
  };
  for (const [k, ac, len, kind] of clumps) {
    const [outer, core] = KIND[kind];
    const cnt = Math.max(2, Math.round(len / 0.09));
    const sc = kind === 2 ? 0.75 : 1;
    for (let i = 0; i < cnt; i++) {
      const t = i / (cnt - 1), fat = Math.sin(Math.PI * (0.1 + 0.8 * t));
      const a = ac + (t - 0.5) * len + (rnd() - 0.5) * 0.05;
      const r = sc * (0.055 + 0.095 * fat + rnd() * 0.025);
      const s = k * cl + 0.01 + r * 0.7 + rnd() * 0.04 * fat;
      const h = 0.022 + 0.024 * fat;
      cushion(s, a, r, h, outer, k);
      // a second, staggered row further up the course where the clump is fat (an irregular blob, not a strip)
      if (fat > 0.6 && rnd() < 0.7) {
        const r2 = r * (0.6 + rnd() * 0.25);
        if (LOW) { rnd(); rnd(); } else cushion(Math.min(s + r * 0.9 + r2 * 0.5, (k + 1) * cl - r2 * 0.6), a + (rnd() - 0.5) * 0.08, r2, h * 0.8, outer, k);
      }
      if (fat > 0.8 && kind < 2) cushion(s + 0.01, a + (rnd() - 0.5) * 0.03, r * 0.6, h + 0.016, core, k);
      // the middle of a long clump creeps up over the next course's butt
      if (fat > 0.9 && len > 0.3 && rnd() < 0.5) {
        const r2 = sc * (0.045 + rnd() * 0.035);
        if (LOW) { rnd(); rnd(); } else cushion((k + 1) * cl + 0.01 + r2 * 0.7, a + (rnd() - 0.5) * 0.06, r2, 0.024, outer, k + 1);
      }
    }
  }
}

export default function build(engine, ctx) {
  const r = ctx.record;
  const rnd = rng(ctx.seed);
  LOW = ctx.quality === 'low';
  const b = new Builder(engine, { name: r.id });
  // Logs live in their own mesh that does NOT cast shadows: thin octagon facets right above lit faces gave
  // shadow-map acne (whole log fronts went to the shadow tone). Hidden core slabs inside the walls (in b) cast instead.
  const bl = new Builder(engine, { name: `${r.id}-logs` });
  // verge boards: their own mesh that casts but does not RECEIVE shadows (grazing shadow-edge flips on a pan)
  const bv = new Builder(engine, { name: `${r.id}-verge` });
  const SHUT = paintRamp(r.style.shutters);
  const logTint = () => [0.96, 1, 1, 1.04][Math.floor(rnd() * 4)];
  const LOG = (t) => ({ tones: 'plank', pattern: 'none', tint: t });
  const windows = [], lights = [], perches = [];
  let sill = null;
  const pool = {};                                             // glass-vertex ranges of the light-pool skins
  const xform = (m) => (v) => v.clone().applyMatrix4(m);

  // ---------------------------------------------------------------- plinth + sill beams + floor
  // the rubble plinth covers the whole rectangle: its top is the cabin floor AND the porch deck in the chamfered corner
  b.box(OUTX * 2 + 0.06, PL + 0.08, OUTZS - OUTZN + 0.02, { tones: 'stone', pattern: 'rubble', at: [0, -0.08, (OUTZS + OUTZN) / 2] });
  b.box(R * 1.7, R + 0.01, CA.z - ZN, { tones: 'timber', at: [XW, PL - 0.005, (ZN + CA.z) / 2] });
  b.box(R * 1.7, R + 0.01, ZS - ZN, { tones: 'timber', at: [XE, PL - 0.005, (ZS + ZN) / 2] });
  b.box(OUTX * 2 - 0.4, 0.015, OUTZS - OUTZN - 0.4, { tones: 'plank', pattern: 'planks', at: [0, PL, (OUTZS + OUTZN) / 2] });

  // ---------------------------------------------------------------- log walls
  // gable walls (south / north): logs along x, crossing past the side walls; ends show end grain (face +-x). The south
  // wall starts at the chamfer post B (its west ends die in the post).
  const winHoleX = WIN.xs.map((x) => [x - WIN.w / 2 - 0.05, x + WIN.w / 2 + 0.05]);
  const winCourses = (k) => k >= 3 && k <= 5;
  const northWin = { x: 0.7, k: [4, 5] };
  for (const [zc, south] of [[ZS, true], [ZN, false]]) {
    for (let k = 0; k < COURSES_G; k++) {
      const y = yG(k), t = logTint();
      const holes = south ? (winCourses(k) ? winHoleX : []) : (northWin.k.includes(k) ? [[northWin.x - 0.26, northWin.x + 0.26]] : []);
      const x0 = south ? CB.x : -OUTX - STUB, x1 = OUTX + STUB;
      for (const [a, c] of cut(x0, x1, holes)) logX(bl, a, c, y, zc, LOG(t));
      if (!south) endX(bl, x0, -1, y, zc, logTint());
      else logTint();                                          // keep the random stream identical to the 2-end walls
      endX(bl, x1, 1, y, zc, logTint());
    }
    // gable sill beam between the top log and the board gable; on the south it spans the porch and crosses the west
    // wall plate at the corner
    const bx0 = south ? -OUTX - STUB : -OUTX;
    b.box(OUTX - bx0, 0.14, 2 * R - 0.04, { tones: 'timber', at: [(OUTX + bx0) / 2, EAVE - 0.14, zc] });
  }
  // side walls (west, east): logs along z, half a course up; their SOUTH ends face the camera. The west wall stops at
  // the chamfer post A, except its top courses (the wall plate) which run on over the porch to cross at the corner.
  const eastWin = { z: -0.4, k: [3, 4] };
  for (const x of [XW, XE]) {
    for (let k = 0; k < COURSES_S; k++) {
      const y = yS(k), t = logTint();
      let holes = [];
      if (x === XE && eastWin.k.includes(k)) holes = [[eastWin.z - 0.26, eastWin.z + 0.26]];
      const porch = x === XW && k < PLATE_K;
      const z0 = OUTZN - STUB, z1 = porch ? CA.z : OUTZS + STUB;
      for (const [a, c] of cut(z0, z1, holes)) logZ(bl, a, c, y, x, LOG(t));
      endZ(bl, z0, -1, y, x, logTint());
      if (porch) logTint(); else endZ(bl, z1, 1, y, x, logTint());
    }
  }

  // the chamfer frame (door wall)
  const FC = M({ at: [CHC.x, 0, CHC.z], ry: -Math.PI / 4 });

  // hidden shadow-casting cores (|z| <= 0.05 from each log centre line stays inside the logs and their V grooves)
  {
    const C = { tones: 'timber', pattern: 'none' }, th = 0.1, yTop = EAVE - 0.14;
    const xr = OUTX + STUB - 0.06, zr0 = OUTZN - STUB + 0.06, zr1 = OUTZS + STUB - 0.06;
    const winOpen = (x, w, k0, k1, yf) => ({ x, w, y: yf(k0) - R, h: yf(k1) - yf(k0) + 2 * R });
    b.push(M({ at: [0, 0, ZS + th / 2] }));
    wallWithOpenings(b, { x0: CB.x, x1: xr, y0: PL, y1: yTop, thick: th, ...C, openings: WIN.xs.map((x) => winOpen(x, WIN.w + 0.1, 3, 5, yG)) });
    b.pop();
    b.push(M({ at: [0, 0, ZN - th / 2], ry: Math.PI }));
    wallWithOpenings(b, { x0: -xr, x1: xr, y0: PL, y1: yTop, thick: th, ...C, openings: [winOpen(-northWin.x, 0.52, 4, 5, yG)] });
    b.pop();
    b.push(M({ at: [XW - th / 2, 0, 0], ry: -Math.PI / 2 }));
    wallWithOpenings(b, { x0: zr0, x1: CA.z, y0: PL, y1: EAVE - 0.02, thick: th, ...C });
    b.pop();
    b.push(M({ at: [XE + th / 2, 0, 0], ry: Math.PI / 2 }));
    wallWithOpenings(b, { x0: -zr1, x1: -zr0, y0: PL, y1: EAVE - 0.02, thick: th, ...C, openings: [winOpen(-eastWin.z, 0.52, 3, 4, yS)] });
    b.pop();
    // the door wall: a core above the door only (the posts cast below)
    b.push(FC);
    b.box(CH_RUN, EAVE - 0.02 - (DTOP + 0.12), th, { ...C, at: [0, DTOP + 0.12, 0] });
    b.pop();
  }

  // ---------------------------------------------------------------- windows
  const southF = M({ at: [0, 0, OUTZS] });
  b.push(southF);
  for (const [i, wx] of WIN.xs.entries()) {
    const w = window_(b, { at: [wx, WIN.y, 0], w: WIN.w, h: WIN.h, panes: [2, 2], frame: 'cream', inset: R, sill: true });
    windows.push({ id: `front-${i}`, pos: xform(southF)(w.glowPos) });
    // narrow board shutters (purple), hung open
    const sw = 0.2;
    for (const s of [-1, 1]) {
      b.box(sw, WIN.h + 0.06, 0.04, { tones: SHUT, pattern: 'vboards', scale: 0.5, at: [wx + s * (WIN.w / 2 + 0.05 + sw / 2 + 0.015), WIN.y - WIN.h / 2 - 0.03, 0.02] });
      b.box(sw * 0.8, 0.04, 0.02, { tones: 'iron', at: [wx + s * (WIN.w / 2 + 0.05 + sw / 2 + 0.015), WIN.y + 0.12, 0.05] });
    }
    // marigold window box (v1)
    flowerBox(b, { at: [wx, WIN.y - WIN.h / 2 - 0.17, 0.03], w: 0.56, seed: ctx.seed + i * 17, colors: [P.flowerYellow, P.pumpkin, P.flowerRed, P.flowerYellow] });
    if (i === 0) sill = xform(southF)(V(wx - 0.12, WIN.y - WIN.h / 2 - 0.15, 0.12));   // the cat's sunny sill (visible)
  }
  b.pop();
  // small back + side windows (iso / turntable views)
  {
    const nF = M({ at: [0, 0, OUTZN], ry: Math.PI });
    b.push(nF);
    const w = window_(b, { at: [-northWin.x, yG(4.5), 0], w: 0.36, h: 0.4, panes: [2, 1], frame: 'cream', inset: R });
    b.pop();
    windows.push({ id: 'back', pos: xform(nF)(w.glowPos) });
    const eF = M({ at: [OUTX, 0, 0], ry: Math.PI / 2 });
    b.push(eF);
    const w2 = window_(b, { at: [-eastWin.z, yS(3.5), 0], w: 0.36, h: 0.4, panes: [2, 1], frame: 'cream', inset: R });
    for (const s of [-1, 1]) b.box(0.17, 0.46, 0.04, { tones: SHUT, pattern: 'vboards', scale: 0.5, at: [-eastWin.z + s * (0.18 + 0.05 + 0.1), yS(3.5) - 0.23, 0.02] });
    b.pop();
    windows.push({ id: 'east', pos: xform(eF)(w2.glowPos) });
  }

  // ---------------------------------------------------------------- the corner porch: door in the SW chamfer
  // Frame FC (local x along the chamfer from A to B, +z outward SW). Two octagonal posts at A and B take the log ends;
  // the door's timber frame spans between them; above it one chamfer log and a squared plate up to the attic floor.
  // The porch corner (the original SW corner of the box) keeps a corner post under the crossing west wall plate and
  // gable sill beam, so the cabin's roof corner stays whole above an open, SW-facing porch.
  const T = { tones: 'timber', pattern: 'none' };
  post(b, CA.x, CA.z, POST_R, PL - 0.02, EAVE, { ...T, tint: 1.03 });
  post(b, CB.x, CB.z, POST_R, PL - 0.02, EAVE, { ...T, tint: 1.03 });
  post(b, XW, ZS, 0.12, PL - 0.02, yS(PLATE_K) - R + 0.02, { tones: 'trunk', pattern: 'none' });
  b.box(0.3, 0.06, 0.3, { tones: 'ashlar', pattern: 'none', at: [XW, PL - 0.05, ZS] });          // post pad
  b.push(FC);
  {
    const half = CH_RUN / 2 - POST_R * 0.6;                    // frame ends tuck into the posts
    b.box(JAMB, DTOP - PL + 0.12, 2 * R + 0.04, { ...T, at: [-DW / 2 - JAMB / 2, PL, 0] });
    b.box(JAMB, DTOP - PL + 0.12, 2 * R + 0.04, { ...T, at: [DW / 2 + JAMB / 2, PL, 0] });
    for (const sx of [-1, 1]) {                                // fillers between the jambs and the posts
      const xa = sx * (DW / 2 + JAMB), xb = sx * half, w = Math.abs(xb - xa);
      if (w > 0.005) b.box(w, DTOP - PL, 2 * R - 0.02, { ...T, tint: 0.96, at: [(xa + xb) / 2, PL, 0] });
    }
    b.box(2 * half, 0.12, 2 * R + 0.06, { ...T, at: [0, DTOP, 0] });                            // head beam
    b.box(DW + 2 * JAMB, 0.06, 2 * R + 0.02, { tones: 'ashlar', at: [0, PL - 0.025, -0.02] });  // threshold
    logX(bl, -half, half, DTOP + 0.12 + RC - 0.01, 0, LOG(logTint()));                          // chamfer log
    b.box(2 * half, EAVE - (DTOP + 0.12 + 2 * RC - 0.04), 2 * R - 0.02, { ...T, tint: 0.97, at: [0, DTOP + 0.12 + 2 * RC - 0.04, 0] });
    // dark vestibule behind the opening (back + cheeks; hearth-warm at night)
    const G = { tones: 'iron', tint: 0.94, layer: 'glass', glow: P.fireGlow, glowKind: 2 };
    b.box(DW + 0.2, DTOP - PL + 0.05, 0.02, { ...G, at: [0, PL, -0.75] });
    for (const sx of [-1, 1]) b.box(0.02, DTOP - PL + 0.05, 0.62, { ...G, at: [sx * (DW / 2 + 0.06), PL, -0.44] });
    b.box(DW + 0.14, 0.02, 0.62, { ...G, at: [0, DTOP + 0.02, -0.44] });
    // purple rag mat on the deck in front of the door, lantern-lit at night (stripes run across the door)
    const mz = R + 0.13;
    b.box(0.5, 0.012, 0.22, { tones: SHUT, pattern: 'none', tint: 1.04, layer: 'glass', glow: SHUT[0], glowKind: 2, at: [0, PL + 0.022, mz] });
    for (const dx of [-0.14, 0.14]) b.box(0.04, 0.016, 0.22, { tones: 'cream', tint: 0.94, at: [dx, PL + 0.022, mz] });
  }
  b.pop();
  // the porch deck skin (triangle between the chamfer's outer face and the corner) + the flagstone steps around the
  // porch's open south / west sides: glass-layer skins (same tones by day; the lantern's / the open door's warm light
  // pool at night - their glow colour is rewritten by the door state, see poolState())
  const SD = 0.3;
  // the chamfer's outer face line: -(x - CHC.x) + (z - CHC.z) = R*sqrt2; deck corners where it meets the west / south
  // faces (the deck sits 18 mm over the plinth top, above the cabin's inner floor boards that reach into the porch)
  const kF = R * Math.SQRT2, DY = PL + 0.018;
  const deckA = V(-OUTX - 0.03, DY, CHC.z + kF + (-OUTX - 0.03 - CHC.x));
  const deckB = V(CHC.x + (OUTZS + 0.01 - CHC.z) - kF, DY, OUTZS + 0.01);
  const corner = V(-OUTX - 0.03, DY, OUTZS + 0.01);
  b.box(SD, STEP_H - 0.012, OUTZS + 0.01 - deckA.z + 0.02, { tones: 'stone', pattern: 'rubble', at: [-OUTX - 0.03 - SD / 2, 0, (OUTZS + deckA.z) / 2] });
  b.box(deckB.x + 0.12 - (-OUTX - 0.03 - SD), STEP_H - 0.012, SD, { tones: 'stone', pattern: 'rubble', at: [(deckB.x + 0.12 + (-OUTX - 0.03 - SD)) / 2, 0, OUTZS + 0.01 + SD / 2] });
  pool.step0 = b._layer('glass').pos.length / 3;
  quad(b, [deckA, corner, deckB, deckB], V(0, 1, 0), { tones: 'plank', pattern: 'none', layer: 'glass', glow: POOL.dim, glowKind: 2 });
  b.box(SD, 0.012, OUTZS + 0.01 - deckA.z, { tones: 'stone', pattern: 'rubble', layer: 'glass', glow: POOL.dim, glowKind: 2, at: [-OUTX - 0.03 - SD / 2, STEP_H - 0.012, (OUTZS + 0.01 + deckA.z) / 2] });
  b.box(deckB.x + 0.12 - (-OUTX - 0.03 - SD), 0.012, SD, { tones: 'stone', pattern: 'rubble', layer: 'glass', glow: POOL.dim, glowKind: 2, at: [(deckB.x + 0.12 + (-OUTX - 0.03 - SD)) / 2, STEP_H - 0.012, OUTZS + 0.01 + SD / 2] });
  pool.step1 = b._layer('glass').pos.length / 3;
  // plank deck boards over the porch (thin strips across the triangle, parallel to the chamfer: tone changes only)
  for (const t of [0.22, 0.42]) {
    const lz = R + t;                                          // local z (from the chamfer centre line)
    const hw = APEX - lz - 0.02;                               // half-width of the triangle at that depth
    if (hw > 0.05) {
      b.push(FC);
      b.box(2 * hw, 0.006, 0.035, { tones: 'plank', pattern: 'none', tint: 0.93, layer: 'glass', glow: POOL.dim, glowKind: 2, at: [0, DY, lz] });
      b.pop();
    }
  }
  pool.step1 = b._layer('glass').pos.length / 3;
  // worn ashlar nosing along both step edges
  b.box(0.04, 0.03, OUTZS + 0.01 - deckA.z, { tones: 'ashlar', pattern: 'none', at: [-OUTX - 0.03 - SD + 0.02, STEP_H - 0.03, (OUTZS + 0.01 + deckA.z) / 2] });
  b.box(deckB.x + 0.12 - (-OUTX - 0.03 - SD), 0.03, 0.04, { tones: 'ashlar', pattern: 'none', at: [(deckB.x + 0.12 + (-OUTX - 0.03 - SD)) / 2, STEP_H - 0.03, OUTZS + 0.01 + SD - 0.02] });
  // two clay pots ("twopots"): one at the north end of the woodpile, one on the south step right of the door
  for (const [px, py, pz, col] of [[-1.87, 0, -0.86, P.flowerRed], [deckB.x - 0.14, STEP_H, OUTZS + 0.16, P.flowerYellow]]) {
    b.cylinder(0.09, 0.115, 0.2, { tones: 'brick', segments: 8, at: [px, py, pz] });
    b.cylinder(0.125, 0.125, 0.04, { tones: 'brick', tint: 1.04, segments: 8, at: [px, py + 0.2, pz] });
    b.box(0.2, 0.14, 0.2, { tones: 'leaf', layer: 'soft', at: [px, py + 0.22, pz] });
    for (const [ox, oz] of [[-0.05, 0.05], [0.05, -0.04], [0.02, 0.07]]) b.box(0.07, 0.07, 0.07, { tones: col, layer: 'soft', at: [px + ox, py + 0.33, pz + oz] });
  }
  // the open door's light wedge on the ground beyond the steps, fanning SW out of the doorway (glass layer, collapsed
  // to a point unless lit + night + open); parts under the steps are simply hidden by them
  {
    const g = b._layer('glass');
    pool.wedge0 = g.pos.length / 3;
    const y = 0.022;
    b.push(FC);
    const band = (z0, z1, w0, w1, glow) => b.hexa([
      V(-w0, y - 0.004, z0), V(w0, y - 0.004, z0), V(-w0, y, z0), V(w0, y, z0),
      V(-w1, y - 0.004, z1), V(w1, y - 0.004, z1), V(-w1, y, z1), V(w1, y, z1)], { tones: 'stone', layer: 'glass', glow, glowKind: 2 });
    band(APEX + 0.08, APEX + 0.62, 0.42, 0.52, POOL.open);
    band(APEX + 0.62, APEX + 1.12, 0.52, 0.66, POOL.dim);
    b.pop();
    pool.wedge1 = g.pos.length / 3;
  }

  // ---------------------------------------------------------------- the porch lantern
  // An iron bracket off the corner post's west face; the lantern hangs clear of the door's screen span (left of the
  // post at yaw 0), a bright core in its glass; it lights the deck / steps at night, its own pool on the lane below.
  {
    const lx = XW - 0.36, lz = ZS + 0.02, ly = 2.12;
    b.box(0.36, 0.04, 0.04, { tones: 'iron', at: [XW - 0.18, ly, lz] });                              // arm
    segXY(b, [XW - 0.1, ly - 0.24], [XW - 0.3, ly], lz, 0.03, 0.03, { tones: 'iron' });               // brace
    b.box(0.035, 0.12, 0.035, { tones: 'iron', at: [lx, ly - 0.12, lz] });
    b.hexa([V(lx - 0.13, ly - 0.22, lz - 0.13), V(lx + 0.13, ly - 0.22, lz - 0.13), V(lx - 0.03, ly - 0.12, lz - 0.03), V(lx + 0.03, ly - 0.12, lz - 0.03),
      V(lx - 0.13, ly - 0.22, lz + 0.13), V(lx + 0.13, ly - 0.22, lz + 0.13), V(lx - 0.03, ly - 0.12, lz + 0.03), V(lx + 0.03, ly - 0.12, lz + 0.03)], { tones: 'iron' });
    b.box(0.19, 0.25, 0.19, { tones: P.glow[0], layer: 'glass', glow: P.lampGlow, glowKind: 2, at: [lx, ly - 0.48, lz] });
    b.box(0.09, 0.14, 0.2, { tones: P.glow[0], layer: 'glass', glow: P.glow[0], glowKind: 2, at: [lx, ly - 0.42, lz] });
    for (const [px, pz] of [[-1, 1], [1, 1]]) b.box(0.03, 0.25, 0.03, { tones: 'iron', at: [lx + px * 0.09, ly - 0.48, lz + pz * 0.09] });
    b.box(0.23, 0.045, 0.23, { tones: 'iron', at: [lx, ly - 0.52, lz] });
    lights.push({ pos: V(lx + 0.05, 1.1, lz - 0.25), color: P.lampGlow, r: 2.6, kind: 'lantern', flicker: true });
    // the lantern's own pool on the lane below it (night only): a stepped blob, three overlapping slabs
    const g = b._layer('glass');
    pool.lamp0 = g.pos.length / 3;
    const lxc = lx - 0.12, lzc = lz - 0.32;
    b.box(0.42, 0.004, 0.44, { tones: 'stone', layer: 'glass', glow: POOL.dim, glowKind: 2, at: [lxc, 0.014, lzc] });
    b.box(0.26, 0.004, 0.66, { tones: 'stone', layer: 'glass', glow: POOL.dim, glowKind: 2, at: [lxc, 0.014, lzc] });
    b.box(0.6, 0.004, 0.26, { tones: 'stone', layer: 'glass', glow: POOL.dim, glowKind: 2, at: [lxc, 0.014, lzc] });
    pool.lamp1 = g.pos.length / 3;
  }

  // ---------------------------------------------------------------- chopping block + axe beside the door
  // A squat round stump just south-west of the porch corner (its pale disc top and the axe read from
  // above), the axe bitten into the top with its haft angled up toward the camera, split billets at its foot.
  {
    const cx = CHOP.x, cz = CHOP.z;
    b.cylinder(0.17, 0.19, 0.4, { tones: 'trunk', segments: 8, at: [cx, 0, cz] });
    b.cylinder(0.165, 0.165, 0.03, { tones: 'dial', segments: 8, at: [cx, 0.4, cz] });
    b.push(M({ at: [cx - 0.02, 0.43, cz + 0.02], ry: 0.5 }));
    b.box(0.03, 0.12, 0.13, { tones: 'iron', at: [0, -0.06, 0] });                                    // bitten head
    b.box(0.035, 0.05, 0.05, { tones: 'iron', tint: 1.06, at: [0, 0.05, -0.06] });                    // poll
    b.pop();
    b.push(M({ at: [cx - 0.02, 0.48, cz - 0.04], ry: 0.5, rx: 0.62 }));
    b.box(0.04, 0.6, 0.04, { tones: 'plank', tint: 1.06 });                                           // haft
    b.pop();
    // billets: split quarters with a pale split face
    for (const [bx, bz, ry, rz] of [[-0.24, 0.02, 0.25, 0], [0.12, 0.17, 1.35, 0]]) {
      b.push(M({ at: [cx + bx, 0, cz + bz], ry, rz }));
      b.box(0.08, 0.06, 0.26, { tones: 'trunk', tint: 0.97 });
      b.box(0.075, 0.012, 0.25, { tones: 'dial', at: [0, 0.06, 0] });
      b.pop();
    }
    perches.push(V(cx, 0.45, cz));
  }

  // ---------------------------------------------------------------- woodpile: stove-length rounds, end grain out
  // Short rounds lie ACROSS the pile (along x), so its long west face toward the lane / door is a honeycomb of pale
  // end-grain discs (bark ring showing); rows nest half a round apart, 4 rows, a lean-to board on top.
  {
    const zf = 0.6, rr = 0.068, sp = 0.136, xi = -OUTX - 0.01, xo = -1.99;
    for (let j = 0; j < 4; j++) {
      const y = 0.06 + rr + j * 0.118, cnt = j === 3 ? 5 : 9 - (j % 2);
      const zs = zf - rr - (j % 2) * sp / 2 - (j === 3 ? 2 * sp : 0);
      for (let i = 0; i < cnt; i++) {
        const z = zs - i * sp + (rnd() - 0.5) * 0.012, rs = (rr / Math.cos(Math.PI / 8)) * (0.92 + rnd() * 0.12);
        const xe = xo + (rnd() - 0.5) * 0.03;
        logX(bl, xe, xi, y, z, { r: rs, tones: 'trunk', tint: logTint() });
        logX(bl, xe - 0.035, xe, y, z, { r: rs * 0.64, tones: 'dial', tint: logTint() });   // end grain, bark ring left
      }
    }
    b.box(0.26, 0.06, 1.3, { tones: 'timber', at: [-1.89, 0, zf - 0.62] });                        // skids
    b.box(0.16, 0.44, 1.1, { tones: 'timber', at: [-1.88, 0.08, zf - 0.6] });                       // hidden shadow core
    // lean-to board over the stack, propped on the wall
    b.push(M({ at: [-1.88, 0.62, zf - 0.6], rz: 0.32 }));
    b.box(0.34, 0.035, 1.34, { tones: 'plank', pattern: 'none', tint: 0.96 });
    b.pop();
    perches.push(V(-1.88, 0.72, zf - 0.3));
  }

  // ---------------------------------------------------------------- the attic: board-and-batten gables
  b.prism([[-OUTX, EAVE], [OUTX, EAVE], [0, RIDGE - 0.03]], OUTZS - OUTZN, { tones: 'timber', pattern: 'vboards', at: [0, 0, (OUTZS + OUTZN) / 2] });
  for (const [zf, dir] of [[OUTZS, 1], [OUTZN, -1]]) {
    for (const bx of [-1.26, -0.84, 0.84, 1.26]) {
      const top = EAVE + (OUTX - Math.abs(bx) - 0.04) * ((RIDGE - EAVE) / OUTX);
      b.box(0.06, top - EAVE, 0.03, { tones: 'timber', tint: 1.05, at: [bx, EAVE, zf + dir * 0.015] });
    }
  }

  // ---------------------------------------------------------------- roof: thick coursed cedar shakes, grown-in moss
  // Own geometry (not kit.gableRoof): 8 stepped courses per slope of flush, staggered shakes of varied width (soft
  // tone changes, ragged butts: course shadow lines only, nothing continues across courses), moss cushion clumps on top.
  const SOUTH_GOV = 0.12, NORTH_GOV = 0.26, OVER = 0.42;
  const zR0 = OUTZN - NORTH_GOV, zR1 = OUTZS + SOUTH_GOV;
  const slope = Math.atan2(RIDGE - EAVE, OUTX), tanT = Math.tan(slope);
  {
    const run = OUTX + OVER, sl = run / Math.cos(slope), n = 8;
    const y0 = EAVE - OVER * tanT, cs = Math.cos(slope), sn = Math.sin(slope);
    const TH = 0.075, LIFT = 0.045, z0 = zR0 - 0.08, z1 = zR1 + 0.1;
    // moss clumps per slope: [course, z centre, length along the course, kind]; heavy along the shaded eaves, a few
    // small ones higher up, none where the chimney meets the ridge
    const CLUMPS = {
      [-1]: [[0, -1.4, 0.9, 1], [1, -1.0, 0.55, 0], [0, 1.85, 0.5, 0], [3, 1.35, 0.55, 0], [4, 1.15, 0.28, 2], [6, -2.0, 0.35, 1], [2, 0.25, 0.26, 2], [5, -0.5, 0.3, 0], [2, -2.2, 0.45, 0], [1, 2.05, 0.4, 1]],
      [1]: [[0, 0.4, 1.0, 1], [1, 0.75, 0.5, 0], [0, -2.25, 0.5, 0], [4, -1.7, 0.6, 1], [5, -1.5, 0.3, 0], [6, 1.6, 0.32, 2], [2, 1.95, 0.3, 2], [3, -0.2, 0.26, 0], [1, -0.9, 0.5, 0], [3, 1.0, 0.4, 1]],
    };
    for (const side of [-1, 1]) {
      const P3 = (s, z, lf) => V(side * (run - s * cs) + side * sn * lf, y0 + s * sn + cs * lf, z);
      const rc = shakeCourses(b, rnd, { P3, sl, n, a0: z0, a1: z1, th: TH, lift: LIFT });
      mossClumps(b, rnd, rc, CLUMPS[side]);
    }
    // ridge cap boards (a few mossed lengths), flush segments: tone changes only, no extra outlines
    let z = z0;
    for (const len of [1.1, 0.7, 1.3, 0.9, 1.0, 9]) {
      const ze = Math.min(z1, z + len);
      const mossy = Math.abs(z + len / 2 + 0.6) < 0.45 || Math.abs(z + len / 2 - 1.5) < 0.4;
      b.hexa([V(-0.15, RIDGE - 0.04, z), V(0.15, RIDGE - 0.04, z), V(-0.15, RIDGE + 0.1, z), V(0.15, RIDGE + 0.1, z),
        V(-0.15, RIDGE - 0.04, ze), V(0.15, RIDGE - 0.04, ze), V(-0.15, RIDGE + 0.1, ze), V(0.15, RIDGE + 0.1, ze)],
      { tones: mossy ? MOSS : SHAKE[1], pattern: 'none' });
      z = ze;
      if (z >= z1 - 1e-3) break;
    }
  }
  const roofTop = (p) => EAVE + (OUTX - Math.abs(p)) * tanT;      // top line of the shakes at |p|
  // thick barge boards on both gables IN FRONT of the shake ends: one clean straight rake edge instead of a stepped
  // sawtooth of course ends (those 1-texel steps flipped on a whole-texel pan), and a thick roof edge in silhouette
  for (const [zf, skip] of [[zR1 + 0.13, 0.33], [zR0 - 0.13, 0]]) {
    for (const s of [-1, 1]) {
      const pa = Math.max(skip, 0.02), pb = OUTX + OVER;
      segXY(bv, [s * pa, roofTop(pa) - 0.0947], [s * pb + s * 0.03, roofTop(pb + 0.03) - 0.0947], zf + 0.0029, 0.24, 0.08, { tones: 'plank', tint: 0.94 });
    }
  }
  perches.push(V(0, RIDGE + 0.12, zR0 + 0.15));

  // ---------------------------------------------------------------- the great fieldstone chimney (gable end)
  let smoke;
  {
    const zb = OUTZS - 0.07;                                   // back face, sunk into the logs
    const S = { tones: 'stone', pattern: 'rubble' }, A = { tones: 'ashlar', pattern: 'none' };
    const w0 = 1.0, d0 = 0.42, w1 = 0.8, d1 = 0.36, w2 = 0.6, d2 = 0.3;
    const sh1 = 2.4, sh2 = 3.46, top = 5.12;
    b.box(w0, sh1 + 0.06, d0, { ...S, at: [0, -0.06, zb + d0 / 2] });
    frustum(b, 0, zb, w0 + 0.02, d0 + 0.02, sh1, w1, d1, sh1 + 0.16, A);                  // sloped weathering
    b.box(w1, sh2 - sh1 - 0.16, d1, { ...S, at: [0, sh1 + 0.16, zb + d1 / 2] });
    frustum(b, 0, zb, w1 + 0.02, d1 + 0.02, sh2, w2, d2, sh2 + 0.14, A);
    b.box(w2, top - sh2 - 0.14, d2, { ...S, at: [0, sh2 + 0.14, zb + d2 / 2] });
    // proud fieldstones: a few stones on each stage stand 2-4 cm out of the face, their lit tops catch the light
    const stones = (ya, yb, w, zf) => {
      for (let y = ya + 0.05; y < yb - 0.16; y += 0.19) {
        let x = -w / 2 + 0.04 + rnd() * 0.08;
        while (x < w / 2 - 0.16) {
          const sw = 0.15 + rnd() * 0.12;
          if (x + sw > w / 2 - 0.04) break;
          if (rnd() < 0.28) b.box(sw - 0.04, 0.1 + rnd() * 0.05, 0.05, { tones: 'stone', pattern: 'none', tint: [0.97, 1, 1.03][Math.floor(rnd() * 3)], at: [x + sw / 2, y + rnd() * 0.03, zf + 0.03 + rnd() * 0.015] });
          x += sw;
        }
      }
    };
    stones(0.1, sh1, w0, zb + d0 - 0.02);
    stones(sh1 + 0.16, sh2, w1, zb + d1 - 0.02);
    stones(sh2 + 0.14, top - 0.2, w2, zb + d2 - 0.02);
    // soot band under the cap
    b.box(w2 + 0.02, 0.2, d2 + 0.02, { tones: 'stone', pattern: 'rubble', tint: 0.94, at: [0, top - 0.2, zb + d2 / 2] });
    // cap: slab, two end pillars, an OPEN flue gap (dark by day, ember-lit at night), the top slab
    const cw = w2 + 0.14, cd = d2 + 0.14, cz = zb + d2 / 2, gh = 0.16;
    b.box(cw, 0.08, cd, { ...A, at: [0, top, cz] });
    for (const sx of [-1, 1]) b.box(0.13, gh, cd - 0.04, { ...S, at: [sx * (cw / 2 - 0.085), top + 0.08, cz] });
    b.box(cw - 0.3, gh, cd - 0.12, { tones: 'iron', tint: 0.9, layer: 'glass', glow: P.fireGlow, glowKind: 2, at: [0, top + 0.08, cz] });
    b.box(cw + 0.02, 0.08, cd + 0.02, { ...A, tint: 1.03, at: [0, top + 0.08 + gh, cz] });
    smoke = V(0, top + 0.08 + gh + 0.1, cz);
    perches.push(V(0, top + 0.08 + gh + 0.1, cz));
  }

  // ---------------------------------------------------------------- out back: a kindling heap
  {
    const cx = -0.95, cz = OUTZN - 0.45;
    for (let k = 0; k < 3; k++) logX(b, cx + 0.3 + k * 0.02, cx + 0.62, 0.06, cz + 0.12 - k * 0.12, { r: 0.06, tones: 'trunk', tint: logTint() });
    perches.push(V(cx + 0.45, 0.13, cz));
  }

  // ---------------------------------------------------------------- emit
  const group = b.build();
  for (const m of [...bl.build({ castShadow: false }).children]) group.add(m);
  for (const m of [...bv.build({ receiveShadow: false }).children]) group.add(m);
  // door leaf (kit dutch door, oxblood) in the SW chamfer, hinged on its east (B) jamb, 8 cm reveal behind the outer
  // face; it swings IN, so the open leaf folds away behind the south wall at yaw 0 and the doorway reads as the warm
  // vestibule (glowing at night) seen square-ish from the camera
  const d = door(engine, { w: DW - 0.02, h: DTOP - PL, kind: 'dutch', tones: OXBLOOD, hinge: 'right', name: `${r.id}-door` });
  const holder = new THREE.Group();
  holder.position.copy(V(DW / 2 - 0.01, PL, R - 0.08).applyMatrix4(FC));
  holder.rotation.y = -Math.PI / 4;
  holder.add(d.pivot);
  group.add(holder);
  group.position.set(r.center.x + 0.0061, 0.0029, r.center.z + 0.0043);   // breaks raster ties of round authoring values (crawl)
  group.updateMatrixWorld(true);
  const W3 = (v) => toWorld(group, v);
  const glassMeshes = [];
  group.traverse((o) => o.isMesh && o.userData.layer === 'glass' && glassMeshes.push(o));
  // light pools: the step skin glows dim (lantern) at night and bright while the door stands open; the wedge on the
  // door tile exists only at night with the door open (collapsed to a point otherwise: same mesh, no new program)
  const glass = group.children.find((m) => m.userData.layer === 'glass');
  const gPos = glass.geometry.getAttribute('position'), gGlow = glass.geometry.getAttribute('aGlow');
  const posSave = Float32Array.from(gPos.array);
  const showRange = (i0, i1, show) => {
    for (let i = i0; i < i1; i++) {
      const j = (show ? i : i0) * 3;
      gPos.setXYZ(i, posSave[j], posSave[j + 1], posSave[j + 2]);
    }
  };
  const cDim = new THREE.Color(POOL.dim), cOpen = new THREE.Color(POOL.open);
  let doorF = 0, lit = true, poolKey = '';
  const poolState = () => {
    const night = nightGlow(engine) > 0.5, open = doorF > 0.12;
    const key = `${night && lit}|${open}`;
    if (key === poolKey) return;
    poolKey = key;
    const c = open ? cOpen : cDim;
    for (let i = pool.step0; i < pool.step1; i++) gGlow.setXYZ(i, c.r, c.g, c.b);
    gGlow.needsUpdate = true;
    showRange(pool.wedge0, pool.wedge1, night && lit && open);
    showRange(pool.lamp0, pool.lamp1, night && lit);
    gPos.needsUpdate = true;
  };
  const open = (f) => { doorF = Math.max(0, Math.min(1, f)); d.pivot.rotation.y = -doorF * 1.55; poolState(); };
  open(0);
  const winWorld = windows.map((w) => ({ id: `${r.id}-${w.id}`, pos: W3(w.pos) }));
  return {
    group,
    anchors: {
      doors: [{ id: `${r.id}-door`, pivot: d.pivot, open }],
      chimneys: [W3(smoke)],
      windows: winWorld,
      lights: [
        ...lights.map((l) => ({ ...l, pos: W3(l.pos) })),
        ...winWorld.slice(0, 2).map((w) => ({ pos: w.pos, color: P.glow[1], r: 1.8, kind: 'window' })),
      ],
      perches: [W3(sill), ...perches.map(W3), W3(V(0, RIDGE + 0.12, zR1 - 0.1))],
      spots: { doorstep: W3(V(-OUTX - 0.55, 0, 2.0)), woodpile: W3(V(-2.3, 0, 0.4)), sill: W3(sill), choppingBlock: W3(V(CHOP.x - 0.45, 0, CHOP.z)) },
    },
    api: {
      setDoor: open,
      setLit: (on) => { lit = !!on; glassMeshes.forEach((m) => setGlowLit(m, on)); poolKey = ''; poolState(); },
    },
    update: () => poolState(),                                 // follows the town's night switch (cheap: keyed)
    stats: { logs: COURSES_G * 2 + COURSES_S * 2 },
  };
}
