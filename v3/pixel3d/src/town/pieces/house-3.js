// house-3 "Ravenscroft" (owner: house-3 agent). Contract: docs/TOWN.md §4 (piece API), §6 (scale rules).
//
// DESIGN NOTE (identity source: pipgws packages/assets/scripts/houses/house-3.ts, read only)
//   Signature shape: ONE tall, steep (~67 deg) pale-stone parapet gable in the middle of the front, rising well
//   above two low hipped wings - a gothic chapel-like spike with a rose window, flanked by long horizontal wing
//   ridges with iron cresting, a tall chimney stack on the left wing. From the gameplay camera (yaw 0) it must
//   read as "the little stone chapel-house with the round window and the crows", unlike every gabled cottage.
//   Palette rows (docs/TOWN.md §3): walls `stone` (ashlar pattern), dressings `ashlar` (coping, kneelers, door
//   surround, hood mould, string course, buttress weatherings, sills, stoop), roof `plum` (style hint) laid as
//   slate courses (shingle pattern), metal `iron` (cresting, finial, lantern, crows), door `paintRamp('#4a1e1e')`
//   (the v1 oxblood oak), doormat `paintRamp(style.shutters #7a5a2a)`, rose-window foils bannerRed / bannerBlue
//   (glow flowerRed / bannerBlue), ivy `leaf`, chimney pots `brick`, glass `glass` / glow.
//   Key details (v1): rose window + twin lancets + string course in the gable, pointed oak door under a hood
//   mould on a stone stoop, two-stage stepped buttresses at the gable corners, kneelers + coping + an iron finial,
//   tall lancets in the wings, hipped wing roofs with iron ridge cresting, ivy on the shaded right corner,
//   crows on the finial, the right wing ridge and the chimney, a gargoyle at the left kneeler, wall lantern.
//   Added for 3D storytelling (inside the 1-tile apron, off the lane): a stone birdbath with a drinking crow
//   (right), a water butt under the chimney (left), a coir doormat.
//   At 640x360 (30 px/m): gable ~2.4 m wide = 72 px, rose window ~36 px, lancets 8-12 px wide, crows ~7 px.
import * as THREE from 'three';
import { rng } from '../../core/noise.js';
import { Builder, M, chimney, frameOf, setGlowLit } from '../kit.js';
import { toWorld } from '../api.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// crows: the full iron ramp (lit backs / heads read as a pale iron rim against dark roofs), a grey-violet
// jackdaw nape (stone hi) and a pale iron beak (iron hi): every tone is a palette tone
const CROW = TOWN_PALETTE.iron;
const NAPE = TOWN_PALETTE.stone[0], BEAK = TOWN_PALETTE.iron[0];
// a ramp shifted one band down (hi band shows mid): front-facing planes / set-off faces separate from lit sides
const down = (r) => [r[1], r[1], r[2]];
const PLUM_FRONT = down(TOWN_PALETTE.plum), DRESS_MID = down(TOWN_PALETTE.ashlar);
// the v1 oxblood oak door (#4a1e1e), lifted less than the default paintRamp so it stays a deep oak red
const DOOR_PAINT = paintRamp('#4a1e1e', { lightness: 0.3 });

// ------------------------------------------------------------------------------------------------ dimensions (local)
// local frame = frameOf(record): origin at the footprint centre (34.5, 0, 7), +z = south (the door side), x east.
const WING = { x: 2.35, zb: -1.75, zf: 1.55, eave: 2.7, slab: 0.12 };       // wing block (whole width)
const GAB = { x: 1.2, zf: 1.9, slab: 0.12, eave: 3.6, ridge: 6.2437 };      // ridge: crow on the finial stays <= 7 m        // central parapet gable block
const WROOF = { y0: 2.4437, ridge: 4.5, rh: 1.9 };   // y0 off the 1/60 m lattice (crawl tie)                             // wing hip roof (ridge along x)
const DOOR = { w: 0.96, spring: 1.25 };                                      // pointed door (equilateral arch)
const VEST = 0.7;                                                            // back of the door vestibule (z)

// ------------------------------------------------------------------------------------------------ shape helpers
/** Points of a pointed (two-centred) arch opening: bottom y0, width w, springing height, radius factor k. */
function archPts(cx, y0, w, spring, { k = 1, segs = 3 } = {}) {
  const R = w * k, phiMax = Math.acos((R - w / 2) / R);
  const right = [];
  for (let i = 0; i <= segs; i++) {
    const p = (i / segs) * phiMax;
    right.push([cx + w / 2 - R + R * Math.cos(p), spring + R * Math.sin(p)]);
  }
  const left = right.slice(0, -1).reverse().map(([x, y]) => [2 * cx - x, y]);
  return [[cx - w / 2, y0], [cx + w / 2, y0], ...right, ...left];
}
const apexOf = (w, spring, k = 1) => spring + Math.sqrt((w * k) ** 2 - (w * k - w / 2) ** 2);
function circlePts(cx, cy, r, n = 16) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
/** Extruded XY polygon (with optional holes) whose FRONT face lies at z = zf, `thick` deep (toward -z). */
function slab(b, outer, holes, zf, thick, opts) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, zf - thick);
  b.add(g, null, opts);
  g.dispose();
}
/** U-shaped arch band (open at the bottom): outer arch minus inner arch, as one simple polygon. */
function archBand(b, cx, y0, w, spring, o, zf, thick, opts) {
  const outer = archPts(cx, y0, w + 2 * o, spring), inner = archPts(cx, y0, w, spring);
  const oArc = [outer[1], ...outer.slice(2), outer[0]];
  const iArc = [inner[1], ...inner.slice(2), inner[0]].reverse();
  slab(b, [...oArc, ...iArc], [], zf, thick, opts);
}
/** Box between two points in the XY plane (a bar of `size` x `depth`), front at zf. */
function bar(b, x0, y0, x1, y1, size, zf, depth, opts) {
  const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
  b.box(len, size, depth, { ...opts, origin: 'center', at: [(x0 + x1) / 2, (y0 + y1) / 2, zf - depth / 2], rz: ang });
}

// ------------------------------------------------------------------------------------------------ roofs
/** Split a course (t in -1..1 along its edge) into 1-3 runs of slates; each run gets its own tint step. */
function courseSegs(r) {
  const cuts = [-1];
  let t = -1 + 0.5 + r() * 0.9;
  while (t < 0.75) { cuts.push(t); t += 0.55 + r() * 0.9; }
  cuts.push(1);
  return cuts.slice(0, -1).map((a, i) => [a, cuts[i + 1]]);
}
/**
 * Hip roof with independent end pitch (ridge along x). Eave rectangle half sizes Wx, Dz at height y0, ridge
 * half-length rh at height `ridge`. Stepped slate courses like kit.gableRoof (1-texel lift per course).
 */
function hipRoof2(b, { cx = 0, cz = 0, Wx, Dz, y0, ridge, rh, tones, frontTones = tones, pattern = 'none', course = 0.26, thick = 0.08, lift = 0.06, seed = 1 }) {
  const r = rng(seed);
  const rise = ridge - y0;
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const long = nx === 0;
    const run = long ? Dz : Wx - rh, along = long ? Wx : Dz, other = long ? Wx - rh : Dz, across = long ? Dz : Wx;
    const th = Math.atan2(rise, run), L = Math.hypot(rise, run);
    const n = Math.max(2, Math.round(L / course)), cl = L / n;
    const sN = Math.sin(th), cN = Math.cos(th);
    const pt = (t, s, lf) => {
      const f = s / L;
      const half = Math.max(long ? rh : 0, along - f * other) * t, dist = across - f * run;
      const px = long ? half : nx * dist, pz = long ? nz * dist : half;
      return V3(cx + px + nx * sN * lf, y0 + f * rise + cN * lf, cz + pz + nz * sN * lf);
    };
    for (let k = 0; k < n; k++) {
      const s0 = k * cl, s1 = Math.min(L, (k + 1) * cl + 0.02), lf = k === n - 1 ? 0 : lift;
      const lo = (t, s, l) => pt(t, s, l - thick);
      for (const [ta, tb] of courseSegs(r)) {
        const tint = [0.96, 1, 1, 1.04][Math.floor(r() * 4)];
        b.hexa([lo(ta, s0, lf), lo(tb, s0, lf), pt(ta, s0, lf), pt(tb, s0, lf), lo(ta, s1, 0), lo(tb, s1, 0), pt(ta, s1, 0), pt(tb, s1, 0)],
          { tones: nz === 1 ? frontTones : tones, pattern, tint });
      }
    }
  }
  b.box(rh * 2 + 0.06, 0.12, 0.22, { tones, pattern: 'none', tint: 0.9, at: [cx, ridge - 0.03, cz] });   // ridge cap
  // hip caps: one straight capping strip per hip line covers the stepped course ends -> a clean diagonal outline
  const up = V3(0, 1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const A = V3(cx + sx * Wx, y0 - 0.0213, cz + sz * Dz), B = V3(cx + sx * rh, ridge - 0.0213, cz);
    const d = B.clone().sub(A).normalize(), u = d.clone().cross(up).normalize(), n = u.clone().cross(d).normalize();
    if (n.y < 0) n.negate();
    const hw = 0.0717, lo = -0.07, hiO = lift + 0.0617;
    const c = (P, su, so) => P.clone().addScaledVector(u, su * hw).addScaledVector(n, so);
    b.hexa([c(A, -1, lo), c(A, 1, lo), c(A, -1, hiO), c(A, 1, hiO), c(B, -1, lo), c(B, 1, lo), c(B, -1, hiO), c(B, 1, hiO)],
      { tones, pattern: 'none', tint: 0.94 });
  }
}

/**
 * Iron ridge cresting along x from xa to xb on a ridge top at height y (z = cz): uprights every 4 texels carrying a
 * continuous 1.5-texel top rail (reads as one dark line against the sky / forest, not as scattered ticks), and a
 * fleur tip above every second upright. `skip`: x positions (perched crows) to keep tips away from.
 */
function cresting(b, xa, xb, y, cz, skip = []) {
  const io = { tones: 'iron', pattern: 'none' };
  const railY = y + 0.1037;
  b.box(xb - xa, 0.05, 0.05, { ...io, at: [(xa + xb) / 2, railY, cz] });
  const n = Math.max(2, Math.round((xb - xa) / (4 * 0.03333)));
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n;
    b.box(0.05, railY - y + 0.01, 0.05, { ...io, at: [x, y, cz] });
    if (i % 2 === 0 && skip.every((sx) => Math.abs(sx - x) > 0.22)) b.box(0.05, 0.0817, 0.05, { ...io, at: [x, railY + 0.045, cz] });
  }
  return railY + 0.05;   // rail top
}

// ------------------------------------------------------------------------------------------------ details
const Q8 = Math.PI / 4;   // crows only ever face 45-degree stops (other yaws stair-step and crawl on a pan)
/** A crow (dark iron-toned blocks) standing at (x, y, z), facing yaw `ry` (0 = toward +x). */
function crow(b, x, y, z, ry = 0, s = 1) {
  b.push(M({ at: [x, y + 0.013, z], ry }));   // + a hair: never coplanar with the perch top
  const k = { tones: CROW, pattern: 'none' };
  b.box(0.24 * s, 0.13 * s, 0.12 * s, { ...k, at: [0, 0.04 * s, 0] });                         // body
  b.box(0.1 * s, 0.1 * s, 0.1 * s, { ...k, at: [0.13 * s, 0.13 * s, 0] });                      // head
  b.box(0.055 * s, 0.05, 0.1 * s + 0.012, { tones: NAPE, pattern: 'none', at: [0.1 * s, 0.23 * s - 0.0383, 0] });   // jackdaw nape (proud of the head top/back)
  b.box(0.08 * s, 0.05, 0.05, { tones: BEAK, pattern: 'none', at: [0.21 * s, 0.14 * s, 0] });   // beak (>= 1.5 texels)
  b.hexa([V3(-0.12 * s, 0.06 * s, -0.05 * s), V3(-0.12 * s, 0.06 * s, 0.05 * s), V3(-0.12 * s, 0.15 * s, -0.05 * s), V3(-0.12 * s, 0.15 * s, 0.05 * s),
    V3(-0.27 * s, 0.0, -0.04 * s), V3(-0.27 * s, 0.0, 0.04 * s), V3(-0.27 * s, 0.05 * s, -0.04 * s), V3(-0.27 * s, 0.05 * s, 0.04 * s)], k); // tail
  b.pop();
}

/** Lancet window on a +z wall plane z0 (hole already cut, or `onWall` = glass just proud of a plain wall). */
function lancet(b, cx, sill, w, spring, z0, { reveal = 0.12, mullion = true, onWall = false } = {}) {
  const zg = onWall ? z0 + 0.02 : z0 - reveal + 0.015;
  slab(b, archPts(cx, sill, w, spring), [], zg, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1 });
  const fr = { tones: 'ashlar', pattern: 'none' };
  slab(b, archPts(cx, sill - 0.08, w + 0.16, spring), [archPts(cx, sill, w, spring)], z0 + 0.05, 0.07, fr);   // surround
  if (mullion) b.box(0.05, apexOf(w, spring) - sill - 0.04, 0.03, { ...fr, at: [cx, sill, zg + 0.025] });
  b.box(w, 0.045, 0.03, { ...fr, at: [cx, sill + (spring - sill) * 0.62, zg + 0.025] });       // transom
  b.box(w + 0.26, 0.06, 0.14, { ...fr, at: [cx, sill - 0.12, z0 + 0.07] });                        // sill
  return V3(cx, (sill + spring) / 2, z0 + 0.3);
}

/**
 * Wall lantern on a +z wall at (x, y, z): iron bracket + base, a pale glass case (reads as glass by day) with a
 * cream flame core, brass pyramid cap. Night: case glow[1], core glow[0], flickering. Returns a light anchor.
 */
function wallLantern(b, x, y, z) {
  const io = { tones: 'iron', pattern: 'none' }, zc = z + 0.2717;
  b.box(0.0517, 0.0517, 0.28, { ...io, at: [x, y + 0.13, z + 0.14] });                    // bracket arm
  b.box(0.0517, 0.2, 0.0517, { ...io, at: [x, y - 0.06, z + 0.03] });                     // wall plate
  b.box(0.2217, 0.0517, 0.2217, { ...io, at: [x, y - 0.2213, zc] });                      // base
  b.box(0.1617, 0.2117, 0.1617, { tones: ['#D8CCB4', '#B0A28C', '#6E6A76'], layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 2, at: [x, y - 0.17, zc] });
  b.box(0.0717, 0.1217, 0.0217, { tones: TOWN_PALETTE.glow[0], layer: 'glass', glow: TOWN_PALETTE.glow[0], glowKind: 2, at: [x, y - 0.13, zc + 0.08] }); // flame core
  for (const sx of [-1, 1]) b.box(0.0417, 0.2117, 0.0417, { ...io, at: [x + sx * 0.0817, y - 0.17, zc + 0.0817] });   // corner straps
  b.hexa([V3(x - 0.1317, y + 0.0417, zc - 0.1317), V3(x + 0.1317, y + 0.0417, zc - 0.1317), V3(x - 0.0217, y + 0.1517, zc - 0.0217), V3(x + 0.0217, y + 0.1517, zc - 0.0217),
    V3(x - 0.1317, y + 0.0417, zc + 0.1317), V3(x + 0.1317, y + 0.0417, zc + 0.1317), V3(x - 0.0217, y + 0.1517, zc + 0.0217), V3(x + 0.0217, y + 0.1517, zc + 0.0217)],
    { tones: 'brass', pattern: 'none' });                                                // brass cap
  return { pos: V3(x, y - 0.06, zc + 0.12), color: TOWN_PALETTE.lampGlow, r: 2.6, kind: 'lantern', flicker: true };
}

// ------------------------------------------------------------------------------------------------ build
export default function build(engine, ctx) {
  const rec = ctx.record, fr = frameOf(rec);
  const b = new Builder(engine, { name: rec.id });
  const wall = { tones: 'stone', pattern: 'ashlar' };
  const dress = { tones: 'ashlar', pattern: 'none' };
  const plum = 'plum';
  const windows = [], lights = [], perches = [];

  // ---- plinth (sinks 0.08 below ground)
  for (const sx of [-1, 1]) b.box(WING.x - GAB.x + 0.08, 0.3, WING.zf - WING.zb + 0.1, { tones: 'stone', pattern: 'rubble', tint: 0.94, at: [sx * (GAB.x + (WING.x - GAB.x) / 2 + 0.04), -0.08, (WING.zf + WING.zb) / 2] });
  b.box(GAB.x * 2, 0.3, VEST - WING.zb + 0.1, { tones: 'stone', pattern: 'rubble', tint: 0.94, at: [0, -0.08, (VEST + WING.zb) / 2 - 0.05] });

  // ---- wing block: body + front slabs with lancet holes
  for (const sx of [-1, 1]) b.box(WING.x - GAB.x, WING.eave, WING.zf - WING.slab - WING.zb, { ...wall, at: [sx * (WING.x + GAB.x) / 2, 0, (WING.zf - WING.slab + WING.zb) / 2] });
  b.box(WING.x * 2 - 0.1, 0.4, 2.8, { ...wall, at: [0, WING.eave - 0.1, -0.1] });               // attic filler under the hips
  const wingWin = { w: 0.4, sill: 1.0, spring: 1.95 };
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -WING.x : GAB.x, x1 = sx < 0 ? -GAB.x : WING.x, cx = sx * 1.86;
    slab(b, [[x0, 0], [x1, 0], [x1, WING.eave], [x0, WING.eave]], [archPts(cx, wingWin.sill, wingWin.w, wingWin.spring)], WING.zf, WING.slab, wall);
    windows.push({ id: `${rec.id}-wing-${sx < 0 ? 'l' : 'r'}`, pos: lancet(b, cx, wingWin.sill, wingWin.w, wingWin.spring, WING.zf) });
  }
  // side and back windows (on the plain walls)
  for (const sx of [-1, 1]) {
    b.push(M({ ry: sx * Math.PI / 2 }));
    windows.push({ id: `${rec.id}-side-${sx < 0 ? 'l' : 'r'}`, pos: lancet(b, 0.1, 1.0, 0.36, 1.85, WING.x, { onWall: true, mullion: false }).applyMatrix4(b.matrix) });
    b.pop();
  }
  b.push(M({ ry: Math.PI }));
  for (const x of [-1.75, 1.75]) lancet(b, x, 1.05, 0.36, 1.85, -WING.zb, { onWall: true, mullion: false });
  b.pop();

  // ---- central gable block: back body, vestibule cheeks + head, front parapet gable slab
  const G = GAB, gz0 = G.zf - G.slab;
  const dHalf = DOOR.w / 2 + 0.04;
  b.box(G.x * 2, G.eave, VEST - WING.zb, { ...wall, at: [0, 0, (VEST + WING.zb) / 2] });
  for (const sx of [-1, 1]) b.box(G.x - dHalf, G.eave, gz0 - VEST, { ...wall, at: [sx * (G.x + dHalf) / 2, 0, (gz0 + VEST) / 2] });
  b.box(dHalf * 2, G.eave - 2.3, gz0 - VEST, { ...wall, at: [0, 2.3, (gz0 + VEST) / 2] });
  b.box(dHalf * 2, 0.06, gz0 - VEST, { tones: 'ashlar', pattern: 'ashlar', tint: 0.94, at: [0, -0.03, (gz0 + VEST) / 2] });     // flagstone floor
  b.box(dHalf * 2, 2.3, 0.02, { tones: '#2A1A20', layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2, at: [0, 0, VEST + 0.01] }); // dark interior
  // the gable slab: pentagon rising 0.12 above the roof planes (parapet), holes: door, twin lancets, rose
  const pTop = G.ridge + 0.12, pEave = G.eave + 0.12;
  const rose = { y: 4.45, r: 0.5, ring: 0.6 };
  const twin = { sill: 2.62, spring: 3.12, w: 0.24, dx: 0.21 };
  slab(b, [[-G.x, 0], [G.x, 0], [G.x, pEave], [0, pTop], [-G.x, pEave]],
    [archPts(0, 0, DOOR.w, DOOR.spring), circlePts(0, rose.y, rose.r), archPts(-twin.dx, twin.sill, twin.w, twin.spring), archPts(twin.dx, twin.sill, twin.w, twin.spring)],
    G.zf, G.slab, wall);
  b.prism([[-G.x, G.eave], [G.x, G.eave], [0, G.ridge - 0.04]], 0.12, { ...wall, at: [0, 0, WING.zb + 0.06] });   // back gable end

  // coping along both rakes, kneelers, apex block, finial
  for (const sx of [-1, 1]) {
    const xa = sx * G.x, ya = pEave;
    bar(b, xa, ya + 0.04, 0, pTop + 0.06, 0.13, G.zf + 0.05, G.slab + 0.12, { ...dress, tint: 1.03 });
    // kneeler: a block (one band down: no bright cube) under a weathered top sloping to the front (top 3.65)
    const kx = sx * (G.x + 0.1), ky = G.eave - 0.3137, kz0 = G.zf - 0.31, kz1 = G.zf + 0.05;
    b.box(0.42, 0.23, 0.36, { tones: DRESS_MID, pattern: 'none', at: [kx, ky, G.zf - 0.13] });
    b.hexa([V3(kx - 0.21, ky + 0.2283, kz0), V3(kx + 0.21, ky + 0.2283, kz0), V3(kx - 0.21, ky + 0.3617, kz0), V3(kx + 0.21, ky + 0.3617, kz0),
      V3(kx - 0.21, ky + 0.2283, kz1 + 0.0117), V3(kx + 0.21, ky + 0.2283, kz1 + 0.0117), V3(kx - 0.21, ky + 0.2617, kz1 + 0.0117), V3(kx + 0.21, ky + 0.2617, kz1 + 0.0117)], dress);
  }
  b.box(0.26, 0.2117, 0.26, { ...dress, at: [0, pTop + 0.0413, G.zf - 0.1] });                  // apex block (top pTop+0.253)
  // short iron cross finial, tip pTop + 0.553 (< 7 m); widths 0.0617 / 0.2217: off the pixel-centre lattice
  b.box(0.0617, 0.30, 0.0617, { tones: 'iron', pattern: 'none', at: [-0.0813, pTop + 0.253, G.zf - 0.1] });
  b.box(0.2217, 0.0517, 0.0617, { tones: 'iron', pattern: 'none', at: [-0.0813, pTop + 0.4313, G.zf - 0.1] });
  // gargoyle head at the left kneeler (a little stone beast looking out)
  b.box(0.16, 0.13, 0.22, { ...dress, tint: 0.97, at: [-G.x - 0.32, G.eave - 0.22, G.zf - 0.05] });
  b.box(0.08, 0.05, 0.06, { tones: 'iron', pattern: 'none', at: [-G.x - 0.32, G.eave - 0.17, G.zf + 0.07] });

  // rose window: ring, glass (warm centre + jewel foils), tracery spokes, hub
  slab(b, circlePts(0, rose.y, rose.ring), [circlePts(0, rose.y, rose.r)], G.zf + 0.06, 0.08, dress);
  {
    const zg = gz0 + 0.03, n = 8;
    slab(b, circlePts(0, rose.y, 0.3), [], zg, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[0], glowKind: 1 });
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + Math.PI / 8, a1 = ((i + 1) / n) * Math.PI * 2 + Math.PI / 8;
      const P = (a, rr) => [Math.cos(a) * rr, rose.y + Math.sin(a) * rr];
      const cell = [P(a0, 0.3), P(a0, rose.r + 0.01), P((a0 + a1) / 2, rose.r + 0.01), P(a1, rose.r + 0.01), P(a1, 0.3), P((a0 + a1) / 2, 0.3)];
      const ruby = i % 2 === 0;
      slab(b, cell, [], zg - 0.005, 0.02, { tones: ruby ? TOWN_PALETTE.bannerRed : TOWN_PALETTE.bannerBlue, layer: 'glass', glow: ruby ? TOWN_PALETTE.flowerRed : TOWN_PALETTE.bannerBlue, glowKind: 1 });
      bar(b, Math.cos(a0) * 0.12, rose.y + Math.sin(a0) * 0.12, Math.cos(a0) * rose.r, rose.y + Math.sin(a0) * rose.r, 0.05, zg + 0.05, 0.04, dress);
    }
    slab(b, circlePts(0, rose.y, 0.13, 8), [], zg + 0.07, 0.06, dress);                     // hub
    slab(b, circlePts(0, rose.y, 0.32, 16), [circlePts(0, rose.y, 0.27, 16)], zg + 0.05, 0.04, dress); // inner ring
    windows.push({ id: `${rec.id}-rose`, pos: V3(0, rose.y, G.zf + 0.3) });
  }
  // twin lancets (glass at the back of the slab hole) + a shared dressed surround + string course
  for (const sx of [-1, 1]) {
    slab(b, archPts(sx * twin.dx, twin.sill, twin.w, twin.spring), [], gz0 + 0.03, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1 });
  }
  slab(b, [[-0.42, twin.sill - 0.08], [0.42, twin.sill - 0.08], [0.42, twin.spring], [0, apexOf(twin.w, twin.spring) + 0.22], [-0.42, twin.spring]],
    [archPts(-twin.dx, twin.sill, twin.w, twin.spring), archPts(twin.dx, twin.sill, twin.w, twin.spring)], G.zf + 0.05, 0.07, dress);
  b.box(0.92, 0.06, 0.15, { ...dress, at: [0, twin.sill - 0.14, G.zf + 0.07] });
  windows.push({ id: `${rec.id}-twin`, pos: V3(0, (twin.sill + twin.spring) / 2, G.zf + 0.3) });
  b.box(G.x * 2, 0.1, 0.1, { ...dress, at: [0, 3.585, G.zf + 0.05] });                              // string course

  // door: dressed surround, hood mould with label stops, stoop, doormat
  archBand(b, 0, 0, DOOR.w, DOOR.spring, 0.11, G.zf + 0.05, 0.08, { ...dress, tint: 0.97 });
  archBand(b, 0, DOOR.spring - 0.25, DOOR.w + 0.29, DOOR.spring, 0.045, G.zf + 0.1, 0.06, dress);   // outer part (inner rim below)
  for (const sx of [-1, 1]) b.box(0.12, 0.1, 0.12, { ...dress, at: [sx * (DOOR.w / 2 + 0.23), DOOR.spring - 0.3, G.zf + 0.1] });
  // stoop + mat reach 0.40 m onto the door tile (z 9.0 .. 9.4), the TOWN.md §6 limit
  b.box(DOOR.w + 0.4, 0.088, 0.22, { ...dress, at: [0, -0.02, G.zf + 0.11] });                    // stone stoop (+ pool skin)
  b.box(0.8, 0.023, 0.24, { tones: paintRamp(rec.style.shutters), pattern: 'planks', scale: 0.4, at: [0, 0, G.zf + 0.37] }); // coir mat (+ pool skin)
  // night entry: lamplight caught on the stoop top + mat and on the underside rim of the hood mould. Glass layer:
  // by day the same toon tones as the stone / mat underneath (no outline of its own), at night a dim flickering
  // amber (brass sh / glow sh) -> the entry reads as a warm pool under the lantern without a real light.
  const pool = { layer: 'glass', glowKind: 2 };
  // the skins replace the top 12 mm of stoop / mat and the inner 35 mm of the hood (same planes: no depth step)
  b.box(DOOR.w + 0.4, 0.012, 0.22, { ...pool, tones: 'ashlar', glow: TOWN_PALETTE.brass[2], at: [0, 0.068, G.zf + 0.11] });
  b.box(0.8, 0.012, 0.24, { ...pool, tones: paintRamp(rec.style.shutters), glow: TOWN_PALETTE.brass[2], at: [0, 0.023, G.zf + 0.37] });
  archBand(b, 0, DOOR.spring - 0.25, DOOR.w + 0.22, DOOR.spring, 0.035, G.zf + 0.1, 0.06, { ...pool, tones: 'ashlar', glow: TOWN_PALETTE.glow[2] });

  // stepped buttresses at the gable corners (two stages with sloped weatherings)
  for (const sx of [-1, 1]) {
    const x = sx * (G.x + 0.03), w = 0.3;
    b.box(w, 1.5, 0.62, { ...wall, at: [x, -0.05, WING.zf + 0.26] });                                // lower stage
    const zf1 = WING.zf + 0.57, zf2 = WING.zf + 0.4;
    b.hexa([V3(x - w / 2, 1.45, WING.zf - 0.05), V3(x + w / 2, 1.45, WING.zf - 0.05), V3(x - w / 2, 1.7, WING.zf - 0.05), V3(x + w / 2, 1.7, WING.zf - 0.05),
      V3(x - w / 2, 1.45, zf1), V3(x + w / 2, 1.45, zf1), V3(x - w / 2, 1.7, zf2), V3(x + w / 2, 1.7, zf2)], { tones: 'stone', pattern: 'none', tint: 1.04 });   // set-off weathering: buttress stone (no pale cube)
    b.box(w - 0.04, 1.3, zf2 - WING.zf + 0.05, { ...wall, at: [x, 1.7, (zf2 + WING.zf - 0.05) / 2] });   // upper stage
    const zf3 = WING.zf + 0.12;
    b.hexa([V3(x - w / 2 + 0.02, 2.95, WING.zf - 0.05), V3(x + w / 2 - 0.02, 2.95, WING.zf - 0.05), V3(x - w / 2 + 0.02, 3.25, WING.zf - 0.05), V3(x + w / 2 - 0.02, 3.25, WING.zf - 0.05),
      V3(x - w / 2 + 0.02, 2.95, zf2), V3(x + w / 2 - 0.02, 2.95, zf2), V3(x - w / 2 + 0.02, 3.2617, zf3), V3(x + w / 2 - 0.02, 3.2617, zf3)], { tones: 'stone', pattern: 'none', tint: 1.04 });
  }

  // ---- roofs: central steep gable (ridge along z, parapet at the front) + hipped wings with cresting
  {
    const zA = gz0 + 0.06, zB = WING.zb - 0.22, ov = 0.25, course = 0.46, thick = 0.08, liftC = 0.06;   // steep: long courses (5 px apart on screen)
    const half = G.x, rise = G.ridge - G.eave, th = Math.atan2(rise, half);
    const run = half + ov, L = run / Math.cos(th), n = Math.max(2, Math.round(L / course)), cl = L / n;
    const y0 = G.eave - ov * Math.tan(th), r2 = rng(ctx.seed + 5);
    for (const side of [1, -1]) {
      const nP = side * Math.sin(th), nY = Math.cos(th);
      for (let k = 0; k < n; k++) {
        const s0 = k * cl, s1 = Math.min(L, (k + 1) * cl + 0.02), lift = k === n - 1 ? 0 : liftC;
        const pAt = (s) => side * (run - s * Math.cos(th)), yAt = (s) => y0 + s * Math.sin(th);
        const top = (z, s, lf) => V3(pAt(s) + nP * lf, yAt(s) + nY * lf, z);
        const bot = (z, s, lf) => V3(pAt(s) + nP * (lf - thick), yAt(s) + nY * (lf - thick), z);
        for (const [ta, tb] of courseSegs(r2)) {
          const za = zB + ((ta + 1) / 2) * (zA - zB), zb2 = zB + ((tb + 1) / 2) * (zA - zB);
          const tint = [0.96, 1, 1, 1.04][Math.floor(r2() * 4)];
          b.hexa([bot(za, s0, lift), bot(zb2, s0, lift), top(za, s0, lift), top(zb2, s0, lift), bot(za, s1, 0), bot(zb2, s1, 0), top(za, s1, 0), top(zb2, s1, 0)],
            { tones: plum, pattern: 'none', tint });
        }
      }
    }
    b.box(0.22, 0.12, zA - zB, { tones: plum, pattern: 'none', tint: 0.9, at: [0, G.ridge - 0.03, (zA + zB) / 2] });
  }
  const wcz = (WING.zf + WING.zb) / 2, Dz = (WING.zf - WING.zb) / 2 + 0.3;
  const longTan = (WROOF.ridge - WROOF.y0) / Dz, eaveAtWall = WROOF.y0 + 0.3 * longTan;
  const endRun = (WROOF.ridge - eaveAtWall) / (WROOF.ridge - WROOF.y0);         // same eave height on all walls
  const Wx = (WING.x - WROOF.rh) / endRun + WROOF.rh;
  hipRoof2(b, { cx: 0, cz: wcz, Wx, Dz, y0: WROOF.y0, ridge: WROOF.ridge, rh: WROOF.rh, tones: plum, frontTones: PLUM_FRONT, seed: ctx.seed + 9 });
  const CROW_L = -1.62, CROW_R = [1.72];
  let railTop = 0;
  for (const sx of [-1, 1]) railTop = cresting(b, sx < 0 ? -WROOF.rh : G.x + 0.28, sx < 0 ? -(G.x + 0.28) : WROOF.rh, WROOF.ridge + 0.08, wcz, sx < 0 ? [CROW_L] : CROW_R);

  // ---- chimney: tall ashlar stack on the left wing, two clay pots
  const smoke = chimney(b, { at: [-1.85, -0.85], base: 2.6, top: 5.9, w: 0.5, d: 0.5, tones: 'stone', pattern: 'ashlar', pots: 2, potTones: 'brick' });

  // ---- wall lantern right of the door, ivy on the shaded right corner
  lights.push(wallLantern(b, 0.84, 2.15, G.zf));
  {
    const ir = rng(ctx.seed + 77);
    const leaf = { tones: 'leaf', layer: 'soft', pattern: 'none' };
    for (let i = 0; i < 34; i++) {
      const y = Math.pow(ir(), 0.8) * 2.45, spread = 0.36 - y * 0.08;
      const s = 0.1 + ir() * 0.06, t = ir();
      const tint = [0.94, 1, 1.04][Math.floor(ir() * 3)];
      if (t < 0.6) b.box(s, s, 0.06, { ...leaf, tint, at: [WING.x - ir() * spread, y, WING.zf + 0.03] });
      else b.box(0.06, s, s, { ...leaf, tint, at: [WING.x + 0.03, y, WING.zf - ir() * spread] });
    }
  }

  // ---- crows (1.4x: ~10 px bodies): left + right wing cresting rails, chimney cap; birdbath + drinking crow
  crow(b, CROW_L, railTop, wcz, -3 * Q8, 1.4);
  crow(b, CROW_R[0], railTop, wcz, 3 * Q8, 1.4);
  crow(b, G.x + 0.1217, G.eave + 0.0117, G.zf - 0.2, -Q8, 1.2);   // on the right kneeler, against the lit gable
  crow(b, -1.85, 6.0, -0.62, -Q8, 1.25);
  // two clay pots against the wing fronts (v1 persona extra 'pots'): violet and white flowers
  {
    const pr = rng(ctx.seed + 31);
    for (const [px, col] of [[-1.62, TOWN_PALETTE.flowerViolet], [1.66, TOWN_PALETTE.flowerWhite]]) {
      b.cylinder(0.13, 0.16, 0.24, { at: [px, -0.02, 1.78], tones: 'brick', pattern: 'none', segments: 8 });
      b.box(0.24, 0.1, 0.24, { tones: 'leaf', layer: 'soft', at: [px, 0.2, 1.78] });
      for (let i = 0; i < 5; i++) b.box(0.07, 0.07, 0.07, { tones: col, layer: 'soft', at: [px - 0.1 + pr() * 0.2, 0.28 + pr() * 0.06, 1.7 + pr() * 0.16] });
    }
  }
  const bath = { x: 2.95, z: 0.95 };
  b.cylinder(0.24, 0.24, 0.1, { at: [bath.x, -0.03, bath.z], tones: 'ashlar', pattern: 'none', segments: 8 });
  b.cylinder(0.09, 0.09, 0.52, { at: [bath.x, 0.05, bath.z], tones: 'ashlar', pattern: 'none', segments: 8 });
  b.cylinder(0.2, 0.3, 0.12, { at: [bath.x, 0.55, bath.z], tones: 'ashlar', pattern: 'none', segments: 8 });
  b.cylinder(0.25, 0.25, 0.02, { at: [bath.x, 0.65, bath.z], tones: 'glass', layer: 'glass', glow: null, segments: 8 });
  crow(b, bath.x - 0.22, 0.67, bath.z + 0.05, 0, 0.9);
  {
    const wx = -2.78, wz = -0.55;
    b.cylinder(0.28, 0.3, 0.72, { at: [wx, -0.03, wz], tones: 'plank', pattern: 'vboards', scale: 0.5, segments: 8 });
    for (const hy of [0.12, 0.55]) b.cylinder(0.31, 0.31, 0.05, { at: [wx, hy, wz], tones: 'iron', pattern: 'none', segments: 8 });
    b.cylinder(0.25, 0.25, 0.03, { at: [wx, 0.69, wz], tones: 'timber', pattern: 'none', segments: 8 });
  }

  const group = b.build();

  // ---- the pointed oak door (own mesh, hinged on the left like the v1 door), swings inward
  const paint = DOOR_PAINT;
  const db = new Builder(engine, { name: `${rec.id}-door` });
  const dw = DOOR.w - 0.03;
  slab(db, archPts(dw / 2, 0, dw, DOOR.spring), [], 0.03, 0.06, { tones: paint, pattern: 'vboards', scale: 0.6 });
  for (const hy of [0.32, 1.05]) db.box(dw * 0.6, 0.05, 0.03, { tones: 'iron', pattern: 'none', at: [dw * 0.3, hy, 0.04] });
  db.box(0.07, 0.07, 0.05, { tones: 'iron', pattern: 'none', at: [dw - 0.16, 0.98, 0.05] });          // ring pull
  db.box(0.05, 0.05, 0.03, { tones: 'brass', pattern: 'none', at: [dw - 0.16, 0.9, 0.06] });
  const leaf = db.build({ name: `${rec.id}-door` });
  const pivot = new THREE.Group(); pivot.name = `${rec.id}-door-pivot`;
  pivot.add(leaf);
  pivot.position.set(-DOOR.w / 2 + 0.015, 0.01, gz0 - 0.005);
  group.add(pivot);
  const open = (f) => { pivot.rotation.y = Math.max(0, Math.min(1, f)) * 1.75; };

  // ---- the finial crow: its own tiny mesh that turns between a few poses (stepped 6 fps, pure f(t))
  const cb = new Builder(engine, { name: `${rec.id}-crow` });
  crow(cb, 0, 0, 0, 0, 1.4);
  const finialCrow = cb.build({ name: `${rec.id}-crow` });
  finialCrow.position.set(0.0717, pTop + 0.253, G.zf + 0.0);   // forward: against the lit coping / sky
  group.add(finialCrow);
  // pose table over a 7 s loop (42 steps): [from step, yaw, hop]
  const POSES = [[0, -Q8, 0], [14, Q8, 0], [15, Q8, 1], [16, Q8, 0], [24, 3 * Q8, 0], [33, 2 * Q8, 0], [38, -Q8, 1], [39, -Q8, 0]];
  const poseAt = (t) => {
    const k = ((Math.floor(t * 6) % 42) + 42) % 42;
    let p = POSES[0];
    for (const q of POSES) if (k >= q[0]) p = q;
    return p;
  };
  const update = (t) => {
    const [, yaw, hop] = poseAt(t);
    finialCrow.rotation.y = yaw;
    finialCrow.position.y = pTop + 0.253 + hop * 0.0667;     // a 2-texel hop
  };
  update(0);

  fr.apply(group);
  const W3 = (v) => toWorld(group, v);
  const glass = [];
  group.traverse((o) => o.userData.layer === 'glass' && glass.push(o));

  perches.push(V3(0, pTop + 0.25, G.zf - 0.1), V3(-WROOF.rh, WROOF.ridge + 0.12, wcz), V3(WROOF.rh, WROOF.ridge + 0.12, wcz), V3(-1.85, 6.02, -0.85),
    V3(-G.x - 0.1, G.eave + 0.04, G.zf - 0.13), V3(G.x + 0.1, G.eave + 0.04, G.zf - 0.13));
  return {
    group,
    update,
    anchors: {
      doors: [{ id: `${rec.id}-door`, pivot, open }],
      chimneys: [W3(smoke)],
      windows: windows.map((w) => ({ id: w.id, pos: W3(w.pos) })),
      lights: [
        ...lights.map((l) => ({ ...l, pos: W3(l.pos) })),
        { pos: W3(V3(0.35, 0.75, G.zf + 0.55)), color: TOWN_PALETTE.lampGlow, r: 1.8, kind: 'lantern', flicker: true },   // warms step, mat, reveal
        { pos: W3(V3(0, rose.y, G.zf + 0.5)), color: TOWN_PALETTE.glow[1], r: 2.2, kind: 'window' },
        { pos: W3(V3(0, twin.sill + 0.2, G.zf + 0.5)), color: TOWN_PALETTE.glow[1], r: 1.6, kind: 'window' },
      ],
      perches: perches.map(W3),
      spots: { door: W3(V3(0, 0, G.zf + 0.75)), birdbath: W3(V3(bath.x, 0.68, bath.z)) },
    },
    api: {
      setDoor: (f) => open(f),
      setLit: (on) => glass.forEach((m) => setGlowLit(m, on)),
    },
    stats: { glassMeshes: glass.length },
  };
}
