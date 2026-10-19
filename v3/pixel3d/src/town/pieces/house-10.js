// house-10 "The Old Boot" (owner: house-10 agent). docs/TOWN.md §4 / §6; identity: pipgws houses/house-10.ts.
//
// DESIGN NOTE (round 3: "it reads as a silo" -> the PROFILE carries the boot)
// - Signature: the cobbler lives in an ENORMOUS OLD BOOT seen in profile from the gameplay camera, like v1: heel and
//   laced shaft on the left, the toe pointing at the lane on the right. What makes it a boot (all on the south face /
//   the silhouette, the side the camera sees):
//     * a thick dark SOLE slab (0.25 m) with a 1.5-texel tan WELT line running the full length, a stacked HEEL block
//       (two lifts + brass nails) under the shaft and an open ARCH gap between heel and forefoot; the sole sweeps UP
//       under the toe tip (upturned toe);
//     * a rounded (superellipse) leather shaft whose BACK edge curves like a real boot (heel counter bulge, ankle
//       waist, flaring collar), its top cut on a SLANT (higher at the back) and a pull-loop at the back;
//     * a turned-down rolled CUFF (tan, lit roll on top) with a LOW stepped moss lid sitting INSIDE the boot mouth
//       (+ a dormer and the crooked stovepipe) - no spire: the shaft top stays open-boot shaped;
//     * criss-cross LACES with brass eyelets and a bow up the front part of the shaft (on the lit south face);
//     * a bulbous, upturned toe CAP (darker leather, raised over the vamp: the step reads as the toe-cap seam) with
//       the front door in it.
// - Layout: footprint x 11..15, z 29..34, door faces east, door tile (15, 33). The boot fills the south part of the lot
//   (centreline z 32.62) so the toe reaches the door point; the door sits in a flat 45-degree chamfer cut into the
//   toe's south-east corner (TOWN.md §6 side doors; anchor carries normal / point), in a deep timber reveal with a
//   glazed fanlight; the leaf swings INWARD (it slides behind the interior plate). Steps + coir mat lead onto the door
//   tile. The back strip of the lot (z 29..31.4) holds a rain barrel + crate.
// - Palette rows (TOWN.md §3): leather = paintRamp(desaturated v1 leather #5a3c2c, L .36; toe cap / tongue L .29),
//   cuff + welt = paintRamp(v1 TAN, desaturated), sole = paintRamp(v1 SOLE #3c3034, L .24), roof = moss x0.8 (+
//   mossTuft patches), dormer = plank, stovepipe / lantern = iron, door = paintRamp(v1 door #2f6a5a), shutters +
//   awning = paintRamp(style.shutters) + cream, laces = cream, eyelets / nails / sign boot = brass.
// - The foot's leather upper is its own mesh with receiveShadow off: the shaft's noon shadow otherwise turned the whole
//   instep into one dark slab and the boot curve was lost (learnings, round 2).
// - Night: shaft windows, shop window, dormer and door fanlight glow (kit glass layer); the lantern glass flickers and
//   its light anchor sits out over the steps so the pool warms the door and doorstep; the doorway glows when opened.
import * as THREE from 'three';
import { Builder, M, flowerBox, toTones, window_ } from '../kit.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = Math.PI / 4;

// ---------------------------------------------------------------- dimensions (world metres; the group sits at 0)
const CZ = 32.62;                                                       // centreline of the boot (z)
const SOLE_T = 0.25, WELT_T = 0.05;                                     // sole slab + welt strip under the upper
const FOOT = { x0: 12.5, xc: 14.0, xe: 14.93, zN: 31.36, zS: 33.84 };
const DOOR = { w: 0.85, h: 1.85, y: 0.3 };                              // door base on the sole top
// the door chamfer: the toe's south wall turns 45 deg at x 14.0 (z 33.84) and runs to (14.93, 32.91)
const CH = { x0: FOOT.xc, z0: FOOT.zS, x1: FOOT.xe, z1: FOOT.zS - (FOOT.xe - FOOT.xc) };
const DSH = -0.1;                                                       // door slid along the chamfer toward the heel side
const DC = { x: (CH.x0 + CH.x1) / 2 + DSH, z: (CH.z0 + CH.z1) / 2 - DSH }; // door centre on the chamfer plane

/** Bottom of the leather upper (= top of the welt): raised heel, arch ramp, flat forefoot, upturned toe tip. */
const yb = (x) => {
  if (x <= 12.3) return 0.52;
  if (x <= 13.1) { const t = (x - 12.3) / 0.8; return 0.52 - 0.22 * (t * t * (3 - 2 * t)); }
  if (x <= 14.7) return 0.3;
  const t = Math.min(1, (x - 14.7) / 0.25);
  return 0.3 + 0.28 * t * t;
};
/** Collar top (slanted: higher at the back / heel side). */
const ytop = (x) => 4.42 + (12.17 - x) * 0.13;

// shaft rings (plan superellipse, exponent SE_P): back edge x0 curves (heel counter / ankle waist / flared collar)
const SE_P = 4, NR = 32;
const SHR = [
  { y: 'b', x0: 11.02, x1: 13.12, az: 1.1 },
  { y: 1.05, x0: 11.1, x1: 13.12, az: 1.1 },
  { y: 1.75, x0: 11.3, x1: 13.12, az: 1.08 },
  { y: 2.6, x0: 11.28, x1: 13.14, az: 1.08 },
  { y: 3.5, x0: 11.2, x1: 13.17, az: 1.1 },
  { y: 't', x0: 11.12, x1: 13.22, az: 1.13 },
];
const TOPR = SHR[SHR.length - 1];
const TCX = (TOPR.x0 + TOPR.x1) / 2, TAX = (TOPR.x1 - TOPR.x0) / 2, TAZ = TOPR.az;

// foot cross-section functions (x along the boot, heel -> toe)
const TOE_CAP = 14.0;                                                   // sections from here on: the darker, raised toe cap
const zS = (x) => (x <= FOOT.xc ? FOOT.zS : FOOT.zS - (x - FOOT.xc));
const zN = (x) => (x < TOE_CAP ? FOOT.zN : 32.29 - 0.04 - Math.sqrt(Math.max(0, 0.93 ** 2 - (x - FOOT.xc) ** 2)));
// instep -> toe top line: a gentle convex fall from the shaft (2.75) to the seam (2.42), then the toe cap swells up
// (bulbous, 2.54) and rounds down to the nose. Tall enough over the chamfer for the 1.85 m door + reveal.
const CAP_TOP = [[14.0, 2.47], [14.15, 2.52], [14.3, 2.54], [14.45, 2.53], [14.6, 2.48], [14.75, 2.38], [14.85, 2.24], [14.93, 2.02]];
const tp = (x) => {
  if (x <= 13.15) return 2.75;
  if (x < TOE_CAP) return 2.75 - 0.35 * Math.pow(Math.min(1, (x - 13.15) / 0.83), 1.5);
  for (let i = 0; i < CAP_TOP.length - 1; i++) {
    const [a, ya] = CAP_TOP[i], [b, yb2] = CAP_TOP[i + 1];
    if (x <= b) return ya + ((x - a) / (b - a)) * (yb2 - ya);
  }
  return CAP_TOP[CAP_TOP.length - 1][1];
};
const rr = (x) => (x < TOE_CAP ? 0.32 : Math.max(0.12, 0.32 - (x - TOE_CAP) * 0.4));
const FOOT_XS = [FOOT.x0, 12.85, 13.15, 13.35, 13.55, 13.75, 13.95, 14.0, 14.15, 14.3, 14.45, 14.6, 14.75, 14.85, FOOT.xe];
const ARC = 8, SE_N = 3;                                                // arc segments, superellipse exponent

// ---------------------------------------------------------------- geometry helpers
/** Planar convex polygon (Vector3[]) as triangles, wound so its normal points away from `inside`. */
function poly(b, pts, inside, opts) {
  const n = V3(0, 0, 0), c = V3(0, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], d = pts[(i + 1) % pts.length];
    n.x += (a.y - d.y) * (a.z + d.z); n.y += (a.z - d.z) * (a.x + d.x); n.z += (a.x - d.x) * (a.y + d.y);
    c.add(a);
  }
  if (n.lengthSq() < 1e-12) return;
  c.multiplyScalar(1 / pts.length);
  const p = n.dot(c.sub(inside)) < 0 ? [...pts].reverse() : pts;
  const out = [], e1 = V3(0, 0, 0), e2 = V3(0, 0, 0);
  for (let i = 1; i < p.length - 1; i++) {
    e1.subVectors(p[i], p[0]); e2.subVectors(p[i + 1], p[0]);
    if (e1.cross(e2).lengthSq() < 1e-12) continue;
    out.push(p[0].x, p[0].y, p[0].z, p[i].x, p[i].y, p[i].z, p[i + 1].x, p[i + 1].y, p[i + 1].z);
  }
  if (out.length) b.tris(out, opts);
}

/** Vertical prism over a convex plan polygon [[x, z], ...] from y0 to y1 (caps optional). */
function planPrism(b, plan, y0, y1, opts, { top = true, bottom = false } = {}) {
  const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cz = plan.reduce((s, p) => s + p[1], 0) / plan.length;
  const inside = V3(cx, (y0 + y1) / 2, cz);
  for (let i = 0; i < plan.length; i++) {
    const [ax, az] = plan[i], [bx, bz] = plan[(i + 1) % plan.length];
    poly(b, [V3(ax, y0, az), V3(bx, y0, bz), V3(bx, y1, bz), V3(ax, y1, az)], inside, opts);
  }
  if (top) poly(b, plan.map(([x, z]) => V3(x, y1, z)), inside, opts);
  if (bottom) poly(b, plan.map(([x, z]) => V3(x, y0, z)), inside, opts);
}

/** Clip a convex plan polygon to x <= xmax (Sutherland-Hodgman, one plane). */
function clipX(plan, xmax) {
  const out = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i], q = plan[(i + 1) % plan.length];
    const pin = p[0] <= xmax, qin = q[0] <= xmax;
    if (pin) out.push(p);
    if (pin !== qin) { const t = (xmax - p[0]) / (q[0] - p[0]); out.push([xmax, p[1] + t * (q[1] - p[1])]); }
  }
  return out;
}

/** Superellipse plan ring [[x, z], ...] (NR points, one exactly on each axis). */
const sePlan = (cx, cz, ax, az, n = NR) => Array.from({ length: n }, (_, k) => {
  const t = (2 * Math.PI * k) / n, c = Math.cos(t), s = Math.sin(t);
  return [cx + ax * Math.sign(c) * Math.abs(c) ** (2 / SE_P), cz + az * Math.sign(s) * Math.abs(s) ** (2 / SE_P)];
});
/** Half-depth (z) of a superellipse of half-widths ax, az at offset dx from its centre (0 outside). */
const seHalf = (dx, ax, az) => { const u = Math.min(1, Math.abs(dx) / ax); return az * Math.pow(Math.max(0, 1 - u ** SE_P), 1 / SE_P); };

/**
 * Loft between two rings of equal length (Vector3[]). `face` = 'out' (normal away from the axis), 'in' (toward it),
 * 'up' or 'down'. `tonesAt(k)` may vary the material per quad.
 */
function loftRings(b, A, B, axis, face, tonesAt) {
  const n = A.length;
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n, q = [A[k], A[k2], B[k2], B[k]];
    const c = V3(0, 0, 0); q.forEach((p) => c.add(p)); c.multiplyScalar(0.25);
    const ax = V3(axis.x, c.y, axis.z);
    const ref = face === 'out' ? ax : face === 'in' ? c.clone().multiplyScalar(2).sub(ax) : face === 'up' ? c.clone().add(V3(0, -1, 0)) : c.clone().add(V3(0, 1, 0));
    poly(b, q, ref, tonesAt(k));
  }
}

/** Foot cross-section at x: [[z, y], ...] bottom-north -> over the top -> bottom-south. */
function footSection(x) {
  const n = zN(x), s = zS(x), t = tp(x), y0 = yb(x), sh = t - rr(x);
  const zm = (n + s) / 2, hw = (s - n) / 2;
  const pts = [[n, y0]];
  for (let k = 0; k <= ARC; k++) {
    const a = Math.PI * (1 - k / ARC), c = Math.cos(a), si = Math.abs(Math.sin(a));
    pts.push([zm + hw * Math.sign(c) * Math.abs(c) ** (2 / SE_N), sh + (t - sh) * si ** (2 / SE_N)]);
  }
  pts.push([s, y0]);
  return { pts, inside: [zm, (y0 + sh) / 2] };
}

/** Arched opening outline (matches the kit door kind 'arched'). */
const archPts = (w, h) => [[-w / 2, 0], [w / 2, 0], [w / 2, h - w * 0.3], [w * 0.3, h - w * 0.08], [0, h], [-w * 0.3, h - w * 0.08], [-w / 2, h - w * 0.3]];

/** Extruded ring (outer polygon minus inner polygon) in the local XY plane, z from z0 to z0 + depth. */
function ringPrism(b, outer, inner, z0, depth, opts) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  if (inner) shape.holes.push(new THREE.Path([...inner].reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, z0);
  b.add(g, null, opts);
  g.dispose();
}

/** Shaft ring parameters at height y (linear between SHR levels; 'b' ~ 0.5, 't' ~ collar top). */
function shaftAt(y) {
  const ys = SHR.map((r, i) => (r.y === 'b' ? 0.5 : r.y === 't' ? 4.42 : r.y));
  let i = 0;
  while (i < ys.length - 2 && y > ys[i + 1]) i++;
  const t = Math.max(0, Math.min(1, (y - ys[i]) / (ys[i + 1] - ys[i]))), A = SHR[i], B = SHR[i + 1];
  const x0 = A.x0 + (B.x0 - A.x0) * t, x1 = A.x1 + (B.x1 - A.x1) * t, az = A.az + (B.az - A.az) * t;
  return { cx: (x0 + x1) / 2, ax: (x1 - x0) / 2, az };
}
/**
 * The shaft's south surface at (x, y): {z, ry} - z on the (slightly faceted) superellipse + a frame rotation ry that
 * lays a +z-facing box onto the tangent plane. Used to seat windows, the patch and the lacing panel.
 */
function shaftSouth(x, y) {
  const { cx, ax, az } = shaftAt(y);
  const z = CZ + seHalf(x - cx, ax, az);
  const e = 0.01, dz = (seHalf(x + e - cx, ax, az) - seHalf(x - e - cx, ax, az)) / (2 * e);
  return { z, ry: -Math.atan(dz) };
}

/**
 * Plank door leaf (rectangular: the arch above it is a fixed glazed fanlight) as its own mesh, >= 2-texel strap
 * hinges. Pivot at the hinge edge, on the leaf's FRONT face.
 */
function doorLeaf(engine, { w, h, tones, hinge = 'left', thick = 0.06, name = 'door' }) {
  const b = new Builder(engine, { name });
  const s = hinge === 'left' ? 1 : -1, cx = (s * w) / 2;
  b.box(w, h, thick, { tones, pattern: 'vboards', scale: 0.6, at: [cx, 0, 0] });
  for (const hy of [0.3, h - 0.4]) b.box(w * 0.6, 0.08, 0.035, { tones: 'iron', at: [s * w * 0.3, hy, thick / 2 + 0.012] });
  b.box(0.08, 0.08, 0.06, { tones: 'brass', at: [s * (w - 0.15), h * 0.5, thick / 2 + 0.025] });
  const leaf = b.build({ name, receiveShadow: false });
  const pivot = new THREE.Group(); pivot.name = `${name}-pivot`;
  pivot.add(leaf);
  leaf.position.z = -thick / 2;
  return { pivot, leaf };
}

/**
 * Wall lantern on a +z wall (own design, every part >= 2 texels and no coplanar faces: the kit lantern's 0.04-0.05 m
 * parts with shared planes crawled on a whole-texel pan). `at` = wall point at the arm height. Glass = emissive.
 */
function bootLantern(b, [x, y, z]) {
  b.box(0.1, 0.17, 0.045, { tones: 'iron', at: [x, y - 0.06, z + 0.0225] });                    // wall plate
  b.box(0.07, 0.07, 0.3, { tones: 'iron', at: [x, y, z + 0.19] });                              // arm
  const cz = z + 0.3, yc = y - 0.09;                                                            // cap bottom
  b.hexa([V3(x - 0.125, yc, cz - 0.125), V3(x + 0.125, yc, cz - 0.125), V3(x - 0.04, yc + 0.13, cz - 0.04), V3(x + 0.04, yc + 0.13, cz - 0.04),
    V3(x - 0.125, yc, cz + 0.125), V3(x + 0.125, yc, cz + 0.125), V3(x - 0.04, yc + 0.13, cz + 0.04), V3(x + 0.04, yc + 0.13, cz + 0.04)], { tones: 'iron' });
  b.box(0.16, 0.23, 0.16, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2, at: [x, yc - 0.215, cz] });
  b.box(0.22, 0.065, 0.22, { tones: 'iron', at: [x, yc - 0.25, cz] });
  b.box(0.08, 0.08, 0.08, { tones: 'brass', at: [x, yc - 0.31, cz] });
}

// ---------------------------------------------------------------- build
export default function build(engine, ctx) {
  const r = ctx.record;
  const rnd = rng((ctx.seed ^ 0x5b007) >>> 0);
  const b = new Builder(engine, { name: r.id });
  const fb = new Builder(engine, { name: `${r.id}-upper` });            // the foot's leather upper: no cast-shadow reception
  // worn dark leather (v1 LEATHER #58281e..#b26c3e), its own ramp: not brick
  const LEA = paintRamp('#5a3c2c', { lightness: 0.36 });
  const LEA_D = paintRamp('#5a3c2c', { lightness: 0.29 });              // toe cap, tongue, collar lining
  const TAN = paintRamp('#8e7a62', { lightness: 0.5 });                 // v1 TAN (#a27442) desaturated: cuff, welt
  const SOLE = paintRamp('#3c3034', { lightness: 0.24 });               // v1 SOLE
  const LEATHER = { tones: LEA, pattern: 'none' };
  const CAP = { tones: LEA_D, pattern: 'none' };
  const shutterRamp = paintRamp(r.style?.shutters ?? '#2f5a6b');
  const doorRamp = paintRamp('#2f6a5a');
  const navyShoe = paintRamp('#1e2a3a');
  const windows = [], lights = [];
  const axis = V3(TCX, 0, CZ);

  // ------------------------------------------------------------ sole (+ welt), stacked heel, arch gap
  {
    // plan extent of the upper's bottom at x, grown by `off` (shaft bottom ring union foot plan)
    const R0 = SHR[0], scx = (R0.x0 + R0.x1) / 2, sax = (R0.x1 - R0.x0) / 2;
    const ext = (x, off) => {
      let n = Infinity, s = -Infinity;
      const h = seHalf(x - scx, sax + off, R0.az + off);
      if (h > 0) { n = CZ - h; s = CZ + h; }
      if (x >= FOOT.x0) {
        const xf = Math.min(x, FOOT.xe);
        n = Math.min(n, zN(Math.max(TOE_CAP, xf)) - off);
        if (xf < TOE_CAP) n = Math.min(n, FOOT.zN - off);
        s = Math.max(s, zS(xf) + off * (xf > FOOT.xc ? Math.SQRT2 : 1));
      }
      return [n, s];
    };
    const slab = (off, yLo, yHi, tones, xs) => {
      const secs = xs.map((x) => { const [n, s] = ext(x, off); return { x, n, s, y0: yb(Math.min(x, FOOT.xe)) + yLo, y1: yb(Math.min(x, FOOT.xe)) + yHi }; });
      const ring = (S) => [V3(S.x, S.y0, S.n), V3(S.x, S.y1, S.n), V3(S.x, S.y1, S.s), V3(S.x, S.y0, S.s)];
      for (let i = 0; i < secs.length - 1; i++) {
        const A = ring(secs[i]), B = ring(secs[i + 1]);
        const inside = V3((secs[i].x + secs[i + 1].x) / 2, (secs[i].y0 + secs[i].y1) / 2, (secs[i].n + secs[i].s) / 2);
        for (let j = 0; j < 4; j++) poly(b, [A[j], A[(j + 1) % 4], B[(j + 1) % 4], B[j]], inside, { tones, pattern: 'none' });
      }
      for (const [S, d] of [[secs[0], 1], [secs[secs.length - 1], -1]]) poly(b, ring(S), V3(S.x + d, (S.y0 + S.y1) / 2, (S.n + S.s) / 2), { tones, pattern: 'none' });
    };
    const xsFor = (off) => {
      const x0 = R0.x0 - off + 0.004, xe = FOOT.xe + off;
      return [x0, x0 + 0.03, x0 + 0.1, x0 + 0.22, 11.45, 11.75, 12.1, 12.3, 12.45, 12.6, 12.75, 12.9, 13.1, 13.4, 13.7, 13.95,
        14.0, 14.2, 14.4, 14.55, 14.7, 14.78, 14.86, FOOT.xe, xe];
    };
    slab(0.06, -SOLE_T - WELT_T, -WELT_T, SOLE, xsFor(0.06));          // the dark sole
    slab(0.085, -WELT_T, 0.0, TAN, xsFor(0.085));                      // the welt: a tan line proud of sole + upper
    // stacked leather heel under the shaft: two lifts (lower one inset), brass nails along the south face
    const heelPlan = clipX(sePlan(scx, CZ, sax + 0.05, R0.az + 0.05), 12.3);
    const hTop = yb(12) - SOLE_T - WELT_T;
    planPrism(b, heelPlan, hTop / 2, hTop + 0.01, { tones: SOLE, pattern: 'none', tint: 1.18 });
    planPrism(b, clipX(sePlan(scx, CZ, sax + 0.02, R0.az + 0.02), 12.27), -0.03, hTop / 2, { tones: SOLE, pattern: 'none' });
    for (const x of [11.35, 11.65, 11.95, 12.2]) {
      const z = CZ + seHalf(x - scx, sax + 0.02, R0.az + 0.02);
      b.box(0.07, 0.07, 0.05, { tones: 'brass', at: [x, 0.03, z] });
    }
  }

  // ------------------------------------------------------------ the leather shaft (lofted superellipse rings)
  const ringAt = (R, off = 0, yFn = null) => {
    const cx = (R.x0 + R.x1) / 2, ax = (R.x1 - R.x0) / 2 + off, az = R.az + off;
    return sePlan(cx, CZ, ax, az).map(([x, z]) => V3(x, yFn ? yFn(x) : (R.y === 'b' ? yb(x) : R.y === 't' ? ytop(x) : R.y), z));
  };
  {
    const rings = SHR.map((R) => ringAt(R));
    for (let i = 0; i < rings.length - 1; i++) loftRings(b, rings[i], rings[i + 1], axis, 'out', () => LEATHER);
  }

  // ------------------------------------------------------------ the rolled, turned-down cuff + the boot mouth
  {
    const TC = { tones: TAN, pattern: 'none' };
    const C = [
      ringAt(TOPR, -0.03, (x) => ytop(x) - 0.55),                       // tucked into the shaft
      ringAt(TOPR, 0.1, (x) => ytop(x) - 0.55),                         // flared bottom lip
      ringAt(TOPR, 0.08, (x) => ytop(x) - 0.06),
      ringAt(TOPR, 0.035, (x) => ytop(x) + 0.03),                       // the roll
      ringAt(TOPR, -0.04, (x) => ytop(x) + 0.065),                      // top rim (lit)
      ringAt(TOPR, -0.14, (x) => ytop(x) + 0.065),
      ringAt(TOPR, -0.14, () => 4.12),                                  // the collar lining, down below the lid
    ];
    loftRings(b, C[0], C[1], axis, 'down', () => ({ ...TC, tint: 0.8 }));
    loftRings(b, C[1], C[2], axis, 'out', () => TC);
    loftRings(b, C[2], C[3], axis, 'out', () => ({ ...TC, tint: 1.06 }));
    loftRings(b, C[3], C[4], axis, 'out', () => ({ ...TC, tint: 1.12 }));
    loftRings(b, C[4], C[5], axis, 'up', () => ({ ...TC, tint: 1.08 }));
    loftRings(b, C[5], C[6], axis, 'in', () => CAP);
    // stitch line: short cream dashes along the lower lip on the south half (v1 cuff stitches)
    for (let x = 11.5; x <= 12.95; x += 0.2) {
      const h = seHalf(x - TCX, TAX + 0.095, TAZ + 0.095);
      b.box(0.08, 0.035, 0.03, { tones: 'cream', pattern: 'none', at: [x, ytop(x) - 0.43, CZ + h + 0.005], ry: -Math.atan((seHalf(x + 0.01 - TCX, TAX, TAZ) - seHalf(x - 0.01 - TCX, TAX, TAZ)) / 0.02) });
    }
    // pull-loop at the back of the collar (leans back): the boot's tell-tale strap
    b.push(M({ at: [11.15, ytop(11.15) - 0.12, CZ], rz: 0.16 }));
    ringPrism(b, [[-0.13, 0], [0.13, 0], [0.13, 0.42], [0.07, 0.52], [-0.07, 0.52], [-0.13, 0.42]],
      [[-0.06, 0.16], [0.06, 0.16], [0.06, 0.38], [0.03, 0.43], [-0.03, 0.43], [-0.06, 0.38]], -0.06, 0.12, { tones: LEA_D, pattern: 'none' });
    b.pop();
  }

  // ------------------------------------------------------------ the low stepped moss lid inside the mouth + dormer
  const MOSS = toTones('moss', 0.8), TUFT = toTones('mossTuft', 0.78);
  const roofY = [];
  {
    const r2 = rng((ctx.seed % 997) * 104729 + 3);
    const ins = [0.15, 0.36, 0.55, 0.71, 0.83];
    const ringIn = (d, y) => sePlan(TCX, CZ, TAX - d, TAZ - d).map(([x, z]) => V3(x, y, z));
    for (let k = 0; k < 4; k++) {
      const y0 = 4.22 + k * 0.14, yL = y0 + 0.08, yT = yL + 0.13;
      roofY.push([ins[k], yL]);
      const L0 = ringIn(ins[k], y0), L1 = ringIn(ins[k], yL), T = ringIn(ins[k + 1] + 0.02, yT);
      const tint = [0.97, 1.03, 0.99, 1.02][k];
      const pick = Array.from({ length: NR }, () => (r2() < 0.22 ? TUFT : MOSS));
      loftRings(b, L0, L1, axis, 'out', (q) => ({ tones: pick[q], pattern: 'none', tint: tint * 0.94 }));
      loftRings(b, L1, T, axis, 'out', (q) => ({ tones: pick[q], pattern: 'none', tint }));
      if (k === 3) poly(b, T, V3(TCX, yT - 1, CZ), { tones: MOSS, pattern: 'none', tint: 1.04 });
    }
  }
  const lidAt = (d) => { let y = 4.3; for (const [di, yi] of roofY) if (d >= di) y = yi; return y; };
  {
    // dormer on the south of the lid: plank box + gable + moss roof, a little lit window
    const w = 0.5, x = 11.98, zfD = CZ + TAZ - 0.32, zB = CZ + 0.15;
    const y0 = lidAt(0.3) - 0.04, yt = y0 + 0.44, ridge = yt + 0.24;
    b.box(w, yt - y0, zfD - zB, { tones: 'plank', pattern: 'vboards', scale: 0.5, at: [x, y0, (zfD + zB) / 2] });
    b.prism([[-w / 2, 0], [w / 2, 0], [0, 0.2]], 0.06, { tones: 'plank', at: [x, yt, zfD - 0.03] });
    for (const s of [-1, 1]) {
      b.hexa([V3(x, ridge - 0.07, zfD + 0.08), V3(x + s * (w / 2 + 0.09), yt - 0.09, zfD + 0.08), V3(x, ridge, zfD + 0.08), V3(x + s * (w / 2 + 0.09), yt - 0.02, zfD + 0.08),
        V3(x, ridge - 0.07, zB), V3(x + s * (w / 2 + 0.09), yt - 0.09, zB), V3(x, ridge, zB), V3(x + s * (w / 2 + 0.09), yt - 0.02, zB)], { tones: MOSS, pattern: 'none' });
    }
    windows.push(window_(b, { at: [x, (y0 + yt) / 2 + 0.05, zfD], w: 0.26, h: 0.24, panes: [2, 1], frame: 'cream', sill: false }).glowPos);
  }
  // crooked iron stovepipe out of the lid's back-right
  const pipe = { x: 12.7, z: 32.3 };
  b.cylinder(0.09, 0.09, 0.85, { segments: 8, at: [pipe.x, 4.35, pipe.z], tones: 'iron' });
  b.push(M({ at: [pipe.x + 0.06, 5.27, pipe.z], rz: -0.5 }));
  b.cylinder(0.09, 0.09, 0.26, { segments: 8, at: [0, -0.1, 0], tones: 'iron' });
  b.pop();
  const p2 = { x: pipe.x + 0.17 };
  b.cylinder(0.09, 0.09, 0.3, { segments: 8, at: [p2.x, 5.34, pipe.z], tones: 'iron' });
  b.cylinder(0.17, 0.17, 0.05, { segments: 8, at: [p2.x, 5.64, pipe.z], tones: 'iron' });
  b.cylinder(0.1, 0.03, 0.08, { segments: 8, at: [p2.x, 5.69, pipe.z], tones: 'iron' });
  const smoke = V3(p2.x, 5.8, pipe.z);                                   // just above the rain hat

  // ------------------------------------------------------------ the foot: a loft of rounded cross-sections (own mesh)
  {
    const secs = FOOT_XS.map((x) => ({ x, ...footSection(x) }));
    for (let i = 0; i < secs.length - 1; i++) {
      const A = secs[i], B = secs[i + 1], m = A.pts.length;
      const inside = V3((A.x + B.x) / 2, (A.inside[1] + B.inside[1]) / 2, (A.inside[0] + B.inside[0]) / 2);
      for (let j = 0; j < m; j++) {
        const j2 = (j + 1) % m;
        // the seam band (13.95 -> 14.0) steps up onto the cap: it faces back toward the heel
        poly(fb, [V3(A.x, A.pts[j][1], A.pts[j][0]), V3(A.x, A.pts[j2][1], A.pts[j2][0]), V3(B.x, B.pts[j2][1], B.pts[j2][0]), V3(B.x, B.pts[j][1], B.pts[j][0])],
          inside, A.x >= TOE_CAP - 0.06 ? CAP : LEATHER);
      }
    }
    for (const S of [secs[0], secs[secs.length - 1]]) {
      const inside = V3(S === secs[0] ? S.x + 1 : S.x - 1, S.inside[1], S.inside[0]);
      poly(fb, S.pts.map(([z, y]) => V3(S.x, y, z)), inside, S === secs[0] ? LEATHER : CAP);
    }
    // toe-cap seam stitches: cream dashes over the top just in front of the step
    for (const zz of [32.1, 32.4, 32.7, 33.0, 33.3]) fb.box(0.035, 0.03, 0.09, { tones: 'cream', pattern: 'none', at: [TOE_CAP + 0.05, tp(TOE_CAP) + 0.0, zz] });
  }

  // ------------------------------------------------------------ shaft dressing (south face)
  const onShaft = (x, y, fn) => { const s = shaftSouth(x, y); b.push(M({ at: [x, 0, s.z], ry: s.ry })); fn(); b.pop(); };
  {
    const xw = 11.86;
    onShaft(xw, 3.3, () => {
      windows.push(toWorld(b, window_(b, { at: [0.0, 3.34, 0.004], w: 0.36, h: 0.55, panes: [2, 2], frame: 'cream' }).glowPos));
      for (const s of [-1, 1]) b.box(0.15, 0.59, 0.04, { tones: shutterRamp, pattern: 'vboards', scale: 0.5, at: [s * 0.315, 3.045, 0.02] });
    });
    onShaft(xw + 0.05, 1.9, () => {
      windows.push(toWorld(b, window_(b, { at: [0, 1.95, 0.004], w: 0.34, h: 0.4, panes: [2, 2], frame: 'cream' }).glowPos));
      flowerBox(b, { at: [0, 1.62, 0.0], w: 0.5, seed: ctx.seed });
    });
    // a stitched tan patch near the heel (v1: TAN patch, light / dark stitched border)
    onShaft(11.62, 0.95, () => {
      b.box(0.42, 0.36, 0.05, { tones: TAN, pattern: 'none', tint: 0.82, at: [0, 0.78, 0.0] });
      for (const [x, y, w, h] of [[0, 1.11, 0.34, 0.03], [0, 0.81, 0.34, 0.03], [-0.18, 0.84, 0.03, 0.24], [0.18, 0.84, 0.03, 0.24]]) {
        const n = Math.round(Math.max(w, h) / 0.1);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5;
          b.box(w > h ? 0.05 : 0.035, w > h ? 0.035 : 0.05, 0.03, { tones: 'cream', pattern: 'none', at: [x + (w > h ? t * w : 0), y + (w > h ? 0 : (t + 0.5) * h), 0.032] });
        }
      }
    });
    // the lacing up the front part of the shaft: dark tongue, 4 pairs of brass eyelets, criss-crossed cream laces, a bow
    const xl = 12.56, y0 = 2.76, y1 = ytop(xl) - 0.5;
    onShaft(xl, (y0 + y1) / 2, () => {
      b.box(0.5, y1 - y0, 0.1, { tones: LEA_D, pattern: 'none', at: [0, y0, -0.02] });            // tongue (front at +0.03)
      const ex = 0.18, rows = [y0 + 0.16, y0 + 0.42, y0 + 0.68, y0 + 0.94].filter((y) => y < y1 - 0.08);
      for (const y of rows) for (const s of [-1, 1]) b.box(0.1, 0.1, 0.06, { tones: 'brass', at: [s * ex, y - 0.05, 0.04] });
      const cord = (xa, ya, xc, yc, z) => {
        const L = Math.hypot(xc - xa, yc - ya);
        b.box(L + 0.04, 0.075, 0.035, { tones: 'cream', pattern: 'none', origin: 'center', at: [(xa + xc) / 2, (ya + yc) / 2, z], rz: Math.atan2(yc - ya, xc - xa) });
      };
      for (let i = 0; i < rows.length - 1; i++) {
        cord(-ex, rows[i], ex, rows[i + 1], 0.075);
        cord(ex, rows[i], -ex, rows[i + 1], 0.1);
      }
      // bow at the top row: knot, two loops splayed out sideways-down, two dangling ends
      const yt = rows[rows.length - 1];
      cord(-ex, yt, ex, yt, 0.075);
      b.box(0.12, 0.11, 0.06, { tones: 'cream', pattern: 'none', origin: 'center', at: [0, yt, 0.12] });
      for (const s of [-1, 1]) {
        b.box(0.26, 0.09, 0.04, { tones: 'cream', pattern: 'none', origin: 'center', at: [s * 0.14, yt + 0.05, 0.13], rz: s * 0.45 });
        b.box(0.07, 0.3, 0.035, { tones: 'cream', pattern: 'none', origin: 'center', at: [s * 0.05, yt - 0.2, 0.125], rz: s * 0.25 });
      }
    });
  }

  // ------------------------------------------------------------ the foot's south wall: shop window, awning, shoes
  {
    const z = FOOT.zS, wx = 13.256;
    windows.push(window_(b, { at: [wx, 1.2, z], w: 0.78, h: 0.6, panes: [3, 2], frame: 'cream', sill: false }).glowPos);
    b.box(0.98, 0.05, 0.26, { tones: 'plank', pattern: 'none', at: [wx, 0.82, z + 0.13] });
    for (const s of [-1, 1]) b.box(0.07, 0.14, 0.2, { tones: 'iron', at: [wx + s * 0.38, 0.68, z + 0.1] });
    // two big, high-contrast shoes on the display shelf (v1: a dark boot and a red shoe)
    const shoe = (x, tones, boot, dir = 1) => {
      b.box(0.3, 0.09, 0.13, { tones, pattern: 'none', at: [x, 0.87, z + 0.15] });
      b.box(0.1, 0.06, 0.12, { tones, pattern: 'none', tint: 1.1, at: [x + dir * 0.1, 0.96, z + 0.15] });
      if (boot) b.box(0.11, 0.22, 0.12, { tones, pattern: 'none', at: [x - dir * 0.08, 0.96, z + 0.15] });
    };
    shoe(wx - 0.18, navyShoe, true);
    shoe(wx + 0.19, TOWN_PALETTE.berry, false, -1);
    // striped awning: six sloped slabs alternating shutter paint / cream, + a front valance
    const ax0 = wx - 0.5, aw = 1.0, n = 6, sw = aw / n, yT = 1.98, yF = 1.74, out = 0.5, th = 0.05;
    for (let i = 0; i < n; i++) {
      const x0 = ax0 + i * sw, x1 = x0 + sw, tones = i % 2 ? 'cream' : shutterRamp;
      b.hexa([V3(x0, yT - th, z), V3(x1, yT - th, z), V3(x0, yT, z), V3(x1, yT, z),
        V3(x0, yF - th, z + out), V3(x1, yF - th, z + out), V3(x0, yF, z + out), V3(x1, yF, z + out)], { tones, pattern: 'none' });
      b.box(sw, i % 2 ? 0.12 : 0.15, 0.04, { tones, pattern: 'none', tint: 0.96, at: [x0 + sw / 2, yF - (i % 2 ? 0.12 : 0.15), z + out - 0.02] });
    }
  }
  // quarter / vamp seam: a raised leather welt curving from the instep down to the sole (v1 stitched seam)
  {
    const seam = [[12.66, 2.38], [12.68, 1.9], [12.74, 1.35], [12.82, 0.9], [12.92, yb(12.92) + 0.02]];
    for (let i = 0; i < seam.length - 1; i++) {
      const [x0, y0] = seam[i], [x1, y1] = seam[i + 1], len = Math.hypot(x1 - x0, y1 - y0);
      b.box(0.07, len, 0.04 + (i % 2) * 0.012, { tones: LEA, pattern: 'none', tint: 0.86, origin: 'center', at: [(x0 + x1) / 2, (y0 + y1) / 2, FOOT.zS + 0.02 + (i % 2) * 0.006], rz: Math.atan2(x1 - x0, y1 - y0) * -1 });
    }
  }
  // lantern on the foot wall, right of the awning; its light pool sits over the steps (anchor out in front of the door)
  bootLantern(b, [13.86, 2.04, FOOT.zS]);
  const dn = V3(Math.SQRT1_2, 0, Math.SQRT1_2);
  lights.push({ pos: V3(DC.x, 0.7, DC.z).addScaledVector(dn, 0.95), color: TOWN_PALETTE.lampGlow, r: 3.6, kind: 'lantern' });

  // ------------------------------------------------------------ the door: a deep timber reveal in the toe chamfer
  const doorFrame = M({ at: [DC.x, DOOR.y, DC.z], ry: Q });
  const hs = DOOR.h - DOOR.w * 0.3;                                       // arch springline: leaf below, fanlight above
  b.push(doorFrame);
  {
    const w = DOOR.w, h = DOOR.h;
    ringPrism(b, archPts(w + 0.24, h + 0.12), archPts(w, h), 0, 0.26, { tones: 'timber', pattern: 'none' });
    ringPrism(b, archPts(w + 0.01, h + 0.005), null, -0.02, 0.08, { tones: '#2A1A20', layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2 });
    b.box(w + 0.01, 0.08, 0.11, { tones: 'timber', pattern: 'none', at: [0, hs - 0.08, 0.1] });         // transom bar
    const fan = [[-w / 2, hs], [w / 2, hs], [w * 0.3, h - w * 0.08], [0, h], [-w * 0.3, h - w * 0.08]];
    ringPrism(b, fan, null, 0.085, 0.03, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1 });
    b.box(0.07, h - hs, 0.05, { tones: 'timber', pattern: 'none', at: [0, hs - 0.01, 0.12] });          // fanlight bar
  }
  b.pop();
  b.push(M({ at: [DC.x, 0, DC.z], ry: Q }));
  b.box(DOOR.w + 0.34, DOOR.y - 0.005, 0.5, { tones: 'ashlar', pattern: 'none', at: [0, 0, 0.27] });     // threshold step
  b.box(DOOR.w + 0.3, 0.15, 0.24, { tones: 'ashlar', pattern: 'none', tint: 0.97, at: [0, 0, 0.64] });  // lower step
  b.box(0.8, 0.025, 0.28, { tones: 'thatch', pattern: 'none', at: [0, 0, 0.92] });                       // coir mat
  b.pop();

  // ------------------------------------------------------------ cobbler's sign on the toe: a brass boot on a board
  {
    const sx = 14.22, sz = 32.95, y0 = tp(sx) - 0.1;
    for (const s of [-1, 1]) b.box(0.07, 0.4, 0.04, { tones: 'iron', at: [sx + s * 0.21, y0 - 0.03, sz - 0.045] });
    b.box(0.62, 0.32, 0.05, { tones: 'plank', pattern: 'none', at: [sx, y0 + 0.3, sz] });
    b.prism([[-0.16, 0], [0.17, 0], [0.17, 0.06], [0.04, 0.12], [-0.05, 0.13], [-0.05, 0.24], [-0.16, 0.24]], 0.03, { tones: 'brass', at: [sx, y0 + 0.34, sz + 0.035] });
  }

  // ------------------------------------------------------------ back of the lot + moss + pots
  {
    b.cylinder(0.3, 0.3, 0.72, { segments: 8, at: [11.7, -0.02, 30.3], tones: 'plank', pattern: 'vboards', scale: 0.5 });
    for (const y of [0.12, 0.55]) b.cylinder(0.315, 0.315, 0.05, { segments: 8, at: [11.7, y, 30.3], tones: 'iron' });
    b.box(0.5, 0.4, 0.45, { tones: 'plank', pattern: 'boards', scale: 0.5, at: [12.45, -0.02, 30.0] });
    b.push(M({ at: [12.0, 0, CZ - 1.075], ry: Math.PI }));
    window_(b, { at: [0, 2.6, 0], w: 0.4, h: 0.5, panes: [2, 2], frame: 'cream' });
    b.pop();
    b.push(M({ at: [13.5, 0, FOOT.zN], ry: Math.PI }));
    window_(b, { at: [0, 1.3, 0], w: 0.5, h: 0.5, panes: [2, 2], frame: 'cream' });
    b.pop();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.55 + rnd() * 0.5), d = 1.18;
      b.box(0.16, 0.08 + rnd() * 0.06, 0.14, { tones: 'mossTuft', layer: 'soft', at: [12.07 + Math.cos(a) * d, -0.02, CZ + Math.sin(a) * d] });
    }
    for (const [x, z, s] of [[13.62, 34.2, 1], [13.38, 34.26, 0.8]]) {      // pots by the shop window, clear of the steps
      b.cylinder(0.13 * s, 0.1 * s, 0.22 * s, { segments: 8, at: [x, -0.02, z], tones: 'brick', tint: 1.04 });
      b.box(0.2 * s, 0.1 * s, 0.18 * s, { tones: 'leaf', layer: 'soft', at: [x, 0.18 * s, z] });
      b.box(0.07, 0.07, 0.07, { tones: TOWN_PALETTE.flowerYellow, layer: 'soft', at: [x - 0.03, 0.27 * s, z + 0.04] });
    }
  }

  const group = b.build();
  group.add(fb.build({ name: `${r.id}-upper`, receiveShadow: false }));
  // door leaf (own mesh): hinge on the left (persona), swings INWARD (it slides behind the glowing interior plate)
  const hinge = r.persona?.hinge ?? 'left';
  const leafH = hs - 0.085;
  const leaf = doorLeaf(engine, { w: DOOR.w - 0.02, h: leafH, tones: doorRamp, hinge, name: `${r.id}-door` });
  const holder = new THREE.Group();
  holder.applyMatrix4(doorFrame);
  const hsg = hinge === 'left' ? 1 : -1;
  leaf.pivot.position.set(-hsg * (DOOR.w - 0.02) / 2, 0.0, 0.14);
  holder.add(leaf.pivot);
  group.add(holder);
  const open = (f) => { leaf.pivot.rotation.y = hsg * Math.max(0, Math.min(1, f)) * 1.5; };
  group.updateMatrixWorld(true);

  const glowCol = TOWN_PALETTE.glow[1];
  const doorstep = V3(DC.x, 0.05, DC.z).addScaledVector(dn, 0.85);
  return {
    group,
    anchors: {
      doors: [{ id: `${r.id}-door`, pivot: leaf.pivot, open, normal: [Math.SQRT1_2, Math.SQRT1_2], point: { x: doorstep.x, z: doorstep.z } }],
      chimneys: [smoke],
      windows: windows.map((pos, i) => ({ id: `${r.id}-win${i}`, pos })),
      lights: [...lights, ...windows.map((pos) => ({ pos, color: glowCol, r: 1.6, kind: 'window' }))],
      perches: [V3(TCX, lidAt(0.83) + 0.02, CZ), V3(p2.x, 5.79, pipe.z), V3(14.22, tp(14.22) + 0.65, 32.95), V3(14.6, tp(14.6), 32.5)],
      spots: { doorstep, cobblerSign: V3(14.22, tp(14.22) + 0.3, 33.0) },
    },
    api: {
      setDoor: (f) => open(f),
      setLit: (on) => group.traverse((o) => o.userData.layer === 'glass' && ctx.kit.setGlowLit(o, on)),
    },
    stats: {},
  };
}

/** A point in the builder's current frame -> builder root (world) coordinates. */
function toWorld(b, v) { return v.clone().applyMatrix4(b.matrix); }
