// house-14 — Millrace Mill (owner: house-14 agent). docs/TOWN.md §4 piece API, §6 scale rules.
// USER NOTE (layout): this corner cottage will be rotated ~45° by the lead so its front/door points diagonally in toward
// the square (docs/TOWN.md §11). Build in your normal local frame; make the 45° view (iso-y045) read as the front.
//
// DESIGN NOTE (v1 identity: pipgws packages/assets/scripts/houses/house-14.ts, read only)
//   Signature silhouette: a little WATER MILL. A big OVERSHOT WHEEL stands in front of the right (east) end of the house
//   (v1 had it on the left; mirrored so the door + lucam keep the open side - recorded as a layout delta request),
//   fed by a wooden FLUME on timber trestles that runs from the leat head box at the back of the lot down the east side
//   and turns at a SLUICE GATE (iron hand-wheel on top) onto the wheel top; the wheel dips into a stone-kerbed
//   MILLRACE. The house: a deep golden THATCH half-hip in ragged 2-tone courses with a fat eave roll, a block-cut
//   SCALLOPED RIDGE and liggers, a rounded thatch EYEBROW hood over a small glazed light above the door, a slate-roofed
//   timber LUCAM (hoist loft) jutting from the left of the front with a hoist beam, pulley, rope and a swinging FLOUR
//   SACK, and a tall BRICK chimney on the right. Stone ground floor, a cream timbered upper band under the eave.
//   Nobody else in the ring has a wheel: at 640x360 it must read as "the mill" from the gameplay camera.
//   Key details: green dutch door (v1 paint #3f5a3a, lifted) in a pale Gibbs surround + keystone arch, a wall lantern left of the door,
//   flour sacks at its foot, a spare MILLSTONE leaning at the left corner, shuttered window (v1 #2f3f63),
//   water butt + herb tub on the east apron (persona extras: barrel, herbs, birds -> perches).
//   Palette rows (TOWN.md §3): walls stone (ashlar coursed) + plaster/timber band; roofs thatch (+ slate lucam);
//   brick chimney (the layout's 'brick' hint); wood plank/timber; trim ashlar/cream/iron/brass; water = 'blue' ramp
//   (+ its hi as streaks, cream foam); paints paintRamp(v1 '#3f5a3a') door, paintRamp(v1 '#2f3f63') shutters;
//   sacks plaster ramp; herbs leaf; flowers accents.
//   Layout: footprint x 3..8, z 9..13 (local frame origin at (5.5, 11), +z = south = the lane). Front wall z 1.1. Door centred on local x 0 (door tile 5,13 clear: step inside the footprint + a thin mat).
//   Body x -2.2..2.0 (the east strip 2.0..2.5 carries the flume). Wheel + race + flume + gate all inside the footprint
//   (x <= 2.5, z >= -2); outside it only the water butt + herb tub (<= 0.72 m tall, <= 0.55 m out). Ridge 6.15 m.
//   Animation (pure f(t), stepped): wheel turns at 6 fps in 7.5 deg steps; falling water / foam / race ripples
//   cycle 3 geometry frames at 6 fps (1 mesh); the flour sack sways on its rope (3 fps). Door via api.setDoor.
import * as THREE from 'three';
import * as kit from '../kit.js';
import { toWorld } from '../api.js';
import { TOWN_PALETTE as P, paintRamp } from '../palette.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sxcOf = () => (FLUME.sx0 + FLUME.sx1) / 2;

// ---------------------------------------------------------------------------------------------- dimensions (local m)
const BODY = { x0: -2.2, x1: 2.0, zb: -1.85, zf: 1.1, gf: 2.25, eave: 3.65 };
const ROOF = { ridge: 6.15, ov: 0.38, tanE: 2.4 };
const DOOR = { x: 0, w: 1.0, h: 2.0 };
const WIN = { x: -1.35, w: 0.5, h: 0.72, y: 0.98 };
const LUC = { x0: -2.08, x1: -1.18, zb: 0.12, zf: 1.4, y0: 2.25, eave: 4.3, ridge: 5.0 };
const WHEEL = { x: 1.55, y: 1.02, z: 1.45, R: 0.92 };
const RACE = { x0: 0.66, x1: 2.42, zf: 1.97, water: 0.16, kerb: 0.25 };
// flume: a cross arm over the wheel top (x0..x1 at z0..z1) fed by a long arm running back along the east side of the
// house (sx0..sx1, from the back of the lot zBack) - everything inside the footprint (local x <= 2.5, z >= -2)
const FLUME = { x0: 1.4, x1: 2.4, y: 1.94, z0: 1.32, z1: 1.58, sx0: 2.12, sx1: 2.4, zBack: -1.96 };
const GATE = { x: 2.26, z: 1.45, top: 2.62 };                      // sluice gate + iron hand-wheel at the flume's corner
const EYE = { x: 0.3, yb: 4.12, gw: 0.5, gh: 0.3, ro: 0.58, ri: 0.4, hy: 0.6 };
const CHIM = { x: 1.38, z: -0.78, base: 3.4, top: 6.85 };

const DOOR_PAINT = paintRamp('#3f5a3a', { lightness: 0.43 });     // v1 house-14.ts dutch door paint (lifted: the SE front is in shade at noon)
const SHUTTER = paintRamp('#2f3f63', { lightness: 0.34 });        // layout style.shutters (v1)
// thatch: a 2-tone course rhythm (alternate courses a shade apart) x per-bundle jitter; drawn with pattern 'none' (the
// kit 'thatch' pattern adds its own 0.42 m row lines that fight the 0.6 m geometric courses -> read as planks)
// 3 straw ramps (hi pulled a step below the palette's thatch so the mill does not out-shine every roof at noon):
// golden (fresh), weathered (grey-gold), old (brown); each bundle picks one -> 2-3 tone straw streaks down the slope
const STRAW = [
  ['#D4B676', '#A8884C', '#62564F'],      // golden
  ['#C8AE7C', '#9C8154', '#5C5252'],      // weathered
  ['#BC9C6C', '#8F724C', '#56494C'],      // old, browner
];
const STRAW_W = [[0.5, 0.32, 0.18], [0.3, 0.45, 0.25]];   // per-course pick weights (alternate courses)
const RIDGE = ['#B09564', '#836840', '#4C4246'];          // ridge + hip rolls: darker, block-cut, pegged
const PEG = ['#8C7448', '#655035', '#3E3640'];            // liggers / spars / pegs
const THATCH_TINTS = [0.95, 1, 1, 1.04];
const COURSE_TONE = [1.03, 0.95];
const DRIP = [0, 0.035, 0.07];                                        // lower-edge jitter per bundle (0-2 texels)

/** Matrix whose local X, Y, Z axes are the given world vectors, at p. */
function basis(X, Y, Z, p) { return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p); }

/**
 * kit hexa with two material options: the TOP face (corners 2,3,7,6 = the course's weathering surface) gets `top`
 * (the straw streak pattern), every other face `rest` (pattern none: a pattern on the 1-texel course lip turns the
 * course line into dots, TOWN_LEARNINGS house-2/3).
 */
const HF = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
function hexa2(b, c, top, rest) {
  const ctr = new THREE.Vector3(); c.forEach((p) => ctr.add(p)); ctr.multiplyScalar(1 / 8);
  const n = new THREE.Vector3(), fc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const outT = [], outR = [];
  HF.forEach((f, fi) => {
    let q = f.map((i) => c[i]);
    n.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const a = q[i], d = q[(i + 1) % 4];
      n.x += (a.y - d.y) * (a.z + d.z); n.y += (a.z - d.z) * (a.x + d.x); n.z += (a.x - d.x) * (a.y + d.y);
    }
    fc.copy(q[0]).add(q[1]).add(q[2]).add(q[3]).multiplyScalar(0.25);
    if (n.dot(fc.sub(ctr)) < 0) q = [q[0], q[3], q[2], q[1]];
    const out = fi === 3 ? outT : outR;
    for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) {
      e1.subVectors(q[i1], q[i0]); e2.subVectors(q[i2], q[i0]);
      if (e1.cross(e2).lengthSq() < 1e-12) continue;
      out.push(q[i0].x, q[i0].y, q[i0].z, q[i1].x, q[i1].y, q[i1].z, q[i2].x, q[i2].y, q[i2].z);
    }
  });
  if (outT.length) b.tris(outT, top);
  if (outR.length) b.tris(outR, rest);
}

/**
 * Half-hip thatch roof with stepped courses (2-texel lifts) — after house-2's halfHipRoof, generalised: centre
 * (cx, cz), long slopes at the side pitch, steeper ends (tanE), a deep thick bottom course (the thatch eave roll),
 * and `cut` = {x0, x1, z}: front courses whose lower edge lies in front of z are opened between x0..x1 (lucam).
 */
function thatchRoof(b, { cx, cz, hx, hz, eave, ridge, ov, tanE, seed, cut }) {
  const tanS = (ridge - eave) / hz;
  const y0 = eave - ov * tanS;
  const D = hz + ov, R = ridge - y0, W = hx + ov * tanS / tanE;
  const ridgeHalf = Math.max(0, W - R / tanE);
  const r = rng(seed * 7717 + 5);
  const course = 0.6, lift = 0.065;
  const sides = [
    { nx: 0, nz: 1, along: W, across: D, tan: tanS, other: tanE, min: ridgeHalf },
    { nx: 0, nz: -1, along: W, across: D, tan: tanS, other: tanE, min: ridgeHalf },
    { nx: 1, nz: 0, along: D, across: W, tan: tanE, other: tanS, min: 0 },
    { nx: -1, nz: 0, along: D, across: W, tan: tanE, other: tanS, min: 0 },
  ];
  for (const S of sides) {
    const th = Math.atan(S.tan), slopeLen = R / Math.sin(th);
    // the mill stands turned 45 deg (faces SE), so the west hip end now faces the gameplay camera: every slope gets
    // courses (the old 'one smooth course on the hip ends' rule was for an unturned yaw-0 view)
    const n = Math.max(2, Math.round(slopeLen / course)), cl = slopeLen / n;
    for (let k = 0; k < n; k++) {
      const s0 = k * cl, s1 = Math.min(slopeLen, (k + 1) * cl + 0.02);
      const lf0 = k === n - 1 ? 0 : lift;
      const thick = k === 0 ? 0.26 : 0.15;                 // deep thatch: a fat eave roll
      const q = (s) => s * Math.cos(th);
      const halfAt = (s) => Math.max(S.min, S.along - q(s) * S.tan / S.other);
      const pt = (t, s, lf) => {
        const h = halfAt(s) * t, dist = S.across - q(s);
        const px = S.nx === 0 ? h : S.nx * dist, pz = S.nx === 0 ? S.nz * dist : -h * S.nx;
        return V3(cx + px + S.nx * Math.sin(th) * lf, y0 + s * Math.sin(th) + Math.cos(th) * lf, cz + pz + S.nz * Math.sin(th) * lf);
      };
      const lo = (t, s, lf) => pt(t, s, lf - thick);
      let spans = [[[-1, -1], [1, 1]]];
      if (cut && S.nz === 1 && cz + S.across - q(s0) > cut.z - 0.05) {
        const tA = (x, s) => Math.max(-0.999, Math.min(0.999, (x - cx) / Math.max(halfAt(s), 1e-3)));
        spans = [[[-1, -1], [tA(cut.x0, s0), tA(cut.x0, s1)]], [[tA(cut.x1, s0), tA(cut.x1, s1)], [1, 1]]];
      }
      const ct = COURSE_TONE[k % 2] * (0.96 + 0.07 * (k / Math.max(1, n - 1))) * (k === 0 ? 0.97 : 1);   // + lighter toward the ridge
      const wts = STRAW_W[k % 2];
      for (const [[A0, A1], [B0, B1]] of spans) {
        const wm = (B0 - A0) * halfAt(s0);
        if (wm < 0.02) continue;
        // narrow bundles (0.15-0.39 m = 5-12 texels) in 3 straw ramps: streaks down the slope, not planks
        const fs = [0];
        while (fs[fs.length - 1] < 1) { const f = fs[fs.length - 1] + (0.15 + r() * 0.24) / Math.max(wm, 1e-3); fs.push(1 - f < 0.13 / Math.max(wm, 1e-3) ? 1 : f); }
        for (let j = 0; j < fs.length - 1; j++) {
          const L = (u, v, f) => u + (v - u) * f;
          const ta0 = L(A0, B0, fs[j]), tb0 = L(A0, B0, fs[j + 1]), ta1 = L(A1, B1, fs[j]), tb1 = L(A1, B1, fs[j + 1]);
          const tint = ct * THATCH_TINTS[Math.floor(r() * THATCH_TINTS.length)];
          const u = r(), ramp = STRAW[u < wts[0] ? 0 : u < wts[0] + wts[1] ? 1 : 2];
          const sd = k === 0 ? s0 : Math.max(0, s0 - DRIP[Math.floor(r() * DRIP.length)]);   // ragged drip edge
          hexa2(b, [lo(ta0, sd, lf0), lo(tb0, sd, lf0), pt(ta0, sd, lf0), pt(tb0, sd, lf0), lo(ta1, s1, 0), lo(tb1, s1, 0), pt(ta1, s1, 0), pt(tb1, s1, 0)],
            { tones: ramp, pattern: 'none', tint, layer: 'soft' }, { tones: ramp, pattern: 'none', tint: tint * 0.86, layer: 'soft' });
        }
      }
    }
  }
  // hip rolls: a rounded thatch roll along each of the 4 hips hides the course ends' sawtooth (thatchers wrap hips)
  {
    const yT = y0 + R;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const A = V3(cx + sx * W, y0, cz + sz * D), B = V3(cx + sx * ridgeHalf, yT, cz);
      const ax = B.clone().sub(A).normalize();
      const out = V3(sx * 0.6, 0.75, sz * 0.6).normalize();
      const side = new THREE.Vector3().crossVectors(ax, out).normalize();
      const w = 0.12, hgt = 0.1, lo = -0.06;
      const c = [];
      for (let i = 0; i < 8; i++) {
        const base = (i & 4) ? B : A;
        const p = base.clone().addScaledVector(side, (i & 1 ? 1 : -1) * w).addScaledVector(out, i & 2 ? hgt : lo);
        c.push(p);
      }
      hexa2(b, c, { tones: RIDGE, pattern: 'none', tint: 1.04 }, { tones: RIDGE, pattern: 'none', tint: 0.96 });
    }
  }
  // eave roll: a fat rounded (6-gon) roll of straw along the drip edge of all four sides (>= 3 texels, banded)
  {
    const rr = 0.12, o = { tones: STRAW[1], layer: 'soft', tint: 1.0, segments: 6 };
    const rollX = (xa, xb, z) => { if (xb - xa < 0.05) return; b.push(kit.M({ at: [(xa + xb) / 2, y0 - 0.02, z], rz: Math.PI / 2 })); b.cylinder(rr, rr, xb - xa, { ...o, at: [0, -(xb - xa) / 2, 0] }); b.pop(); };
    const rollZ = (za, zb, x) => { b.push(kit.M({ at: [x, y0 - 0.02, (za + zb) / 2], rx: Math.PI / 2 })); b.cylinder(rr, rr, zb - za, { ...o, at: [0, -(zb - za) / 2, 0] }); b.pop(); };
    const zF = cz + D - 0.06, zB = cz - D + 0.06, xL = cx - W + 0.06, xR = cx + W - 0.06;
    if (cut) { rollX(xL, cut.x0, zF); rollX(cut.x1, xR, zF); } else rollX(xL, xR, zF);
    rollX(xL, xR, zB);
    rollZ(zB, zF, xL); rollZ(zB, zF, xR);
  }
  return { y0, W, D, ridgeHalf, tanS, th: Math.atan(tanS), zEdge: cz + D };
}

/** Flat annulus (ring) in the current frame's XY plane, extruded `depth` along z, centred at z. */
function ring(b, { r0, r1, z, depth, tones, segs = 16, phase = 0 }) {
  const sh = new THREE.Shape(), hole = new THREE.Path();
  for (let i = 0; i < segs; i++) {
    const a = phase + (i / segs) * Math.PI * 2;
    if (i) sh.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); else sh.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  for (let i = segs - 1; i >= 0; i--) {
    const a = phase + (i / segs) * Math.PI * 2;
    if (i === segs - 1) hole.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); else hole.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
  }
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, z - depth / 2);
  b.add(g, null, { tones });
  g.dispose();
}

/** Cylinder whose axis is local z (discs facing the camera): r, length, centre. */
function cylZ(b, { r, len, at, tones, segs = 8 }) {
  const g = new THREE.CylinderGeometry(r, r, len, segs);
  g.rotateY(Math.PI / segs); g.rotateX(Math.PI / 2);
  b.add(g, kit.M({ at }), { tones });
  g.dispose();
}

/** A grain / flour sack: a squat 8-gon body, rounded shoulders and a tied tuft (soft layer: no cream rims on cloth). */
function sack(b, { at, h = 0.4, r = 0.2, tint = 1 }) {
  const [x, y, z] = at, o = { tones: 'plaster', layer: 'soft' };
  b.cylinder(r * 0.94, r, h * 0.62, { ...o, tint, at: [x, y, z] });
  b.cylinder(r, r * 0.62, h * 0.22, { ...o, tint, at: [x, y + h * 0.62, z] });
  b.cylinder(r * 0.22, r * 0.36, h * 0.16, { ...o, tint: tint * 0.95, at: [x, y + h * 0.84, z] });
  b.box(r * 0.6, 0.04, r * 0.6, { tones: 'thatch', layer: 'soft', tint: 0.9, at: [x, y + h * 0.83, z] });     // the tie
}

/**
 * The west (SW-facing once the mill is turned 45 deg) ground floor: the side the gameplay camera now sees beside the
 * front. Built in a frame whose +z is the wall normal (face plane at z = face), x runs back (-half) -> front (+half).
 * Quoins on both corners, a shuttered parlour window with a flower box, and a slate PENTICE (lean-to) on two posts
 * sheltering a pile of flour sacks, a riddle (sieve) hung on the wall and a bushel measure.
 */
function westSide(b, { face, half, windows }) {
  const zq = face + 0.0213;
  // quoins: interlock with the front-face set (long here where the front one is short)
  for (let i = 0; i < 6; i++) {
    const y = 0.17 + i * 0.3471, long = i % 2 === 1;
    for (const [ux, s] of [[half, -1], [-half, 1]]) b.box(long ? 0.26 : 0.16, 0.27, 0.04, { tones: 'ashlar', pattern: 'none', at: [ux + s * (long ? 0.13 : 0.08), y, zq] });
  }
  // parlour window (back half) + flower box
  const w = kit.window_(b, { at: [-0.62, 1.3, face], w: 0.5, h: 0.62, panes: [2, 2], frame: 'cream', shutters: SHUTTER, sill: true });
  windows.push({ id: 'west', local: kit.toRoot(b, w.glowPos), light: false });
  kit.flowerBox(b, { at: [-0.62, 0.84, face + 0.0031], w: 0.62, seed: 1407, colors: [P.flowerWhite, P.flowerViolet, P.flowerRed] });
  // pentice: mono-pitch slate roof in 3 stepped courses, wall plate, 2 posts + a head beam + knee braces
  const u0 = 0.2, u1 = 1.4, out = 0.5, yTop = 1.74, yLow = 1.36;          // low lean-to: must not read as the entrance
  const rise = yTop - yLow, len = Math.hypot(out, rise);
  const nz = rise / len, ny = out / len;                                    // roof-plane normal (z, y)
  const P3 = (u, f, lf) => V3(u, yTop - rise * f + ny * lf, face + out * f + nz * lf);
  for (let k = 0; k < 3; k++) {
    const f0 = (2 - k) / 3, f1 = Math.min(1, (3 - k) / 3 + 0.04);          // k = 0 the lowest course (outer edge f = 1)
    const lf = k === 2 ? 0 : 0.065, t = 0.05, ua = u0 - 0.06 + 0.0017, ub = u1 + 0.06 + 0.0017;
    // the course's lower (outer) edge f1 is lifted by lf; its upper edge f0 lies on the roof plane
    hexa2(b, [P3(ua, f0, -t), P3(ub, f0, -t), P3(ua, f0, 0), P3(ub, f0, 0), P3(ua, f1, lf - t), P3(ub, f1, lf - t), P3(ua, f1, lf), P3(ub, f1, lf)],
      { tones: 'slate', tint: 1 - k * 0.03 }, { tones: 'slate', tint: 0.9 });
  }
  b.box(u1 - u0 + 0.1, 0.1, 0.08, { tones: 'timber', at: [(u0 + u1) / 2, yTop - 0.17, face + 0.04] });     // wall plate
  const zp = face + out - 0.14, yp = yTop - rise * ((out - 0.14) / out) - 0.04;
  for (const pu of [u0 + 0.07, u1 - 0.07]) b.box(0.09, yp, 0.09, { tones: 'timber', at: [pu + 0.0019, 0, zp] });
  b.box(u1 - u0 + 0.04, 0.09, 0.1, { tones: 'timber', at: [(u0 + u1) / 2, yp - 0.09, zp] });
  b.prism([[0, 0], [0, -0.22], [0.22, 0]], 0.06, { tones: 'timber', at: [u0 + 0.11, yp - 0.09, zp] });       // knee braces
  b.prism([[0, 0], [-0.22, 0], [0, -0.22]], 0.06, { tones: 'timber', at: [u1 - 0.11, yp - 0.09, zp] });
  // the sack pile under it (cream cloth pops against the grey stone) + one on top
  sack(b, { at: [0.45, 0, face + 0.28], h: 0.44, r: 0.2 });
  sack(b, { at: [0.86, 0, face + 0.3], h: 0.4, r: 0.2, tint: 0.96 });
  sack(b, { at: [1.18, 0, face + 0.22], h: 0.36, r: 0.17, tint: 1.03 });
  sack(b, { at: [0.66, 0.37, face + 0.27], h: 0.34, r: 0.17, tint: 1.02 });
  // a riddle (sieve) hung on a peg above the pile, and a bushel measure of meal at the open end
  b.push(kit.M({ at: [1.0, 1.12, face + 0.035] }));
  ring(b, { r0: 0.13, r1: 0.19, z: 0, depth: 0.05, tones: 'plank', segs: 10, phase: 0.31 });
  cylZ(b, { r: 0.13, len: 0.02, at: [0, 0, -0.012], tones: 'iron', segs: 10 });
  b.pop();
  b.cylinder(0.16, 0.14, 0.3, { at: [1.27, 0, face + 0.52], tones: 'plank', pattern: 'vboards', scale: 0.5 });
  b.cylinder(0.165, 0.165, 0.04, { at: [1.27, 0.24, face + 0.52], tones: 'iron' });
  b.cylinder(0.13, 0.13, 0.02, { at: [1.27, 0.28, face + 0.52], tones: 'plaster' });
}

export default function build(engine, ctx) {
  const rec = ctx.record, fr = kit.frameOf(rec);
  const seed = ctx.seed ?? 14;
  const b = new kit.Builder(engine, { name: rec.id });
  const windows = [], lights = [];
  const { x0, x1, zb, zf } = BODY;
  const cxB = (x0 + x1) / 2, czB = (zb + zf) / 2;

  // =============================================================================================== ground floor
  {
    // stone plinth (sunk), open at the doorway
    const d0 = DOOR.x - 0.56, d1 = DOOR.x + 0.56;
    b.box(x1 - x0 + 0.1, 0.24, zf - zb - 0.4, { tones: 'stone', pattern: 'rubble', at: [cxB, -0.06, czB - 0.2] });
    b.box(d0 - (x0 - 0.05), 0.24, 0.5, { tones: 'stone', pattern: 'rubble', at: [(x0 - 0.05 + d0) / 2, -0.06, zf + 0.05 - 0.25] });
    b.box(x1 + 0.05 - d1, 0.24, 0.5, { tones: 'stone', pattern: 'rubble', at: [(x1 + 0.05 + d1) / 2, -0.06, zf + 0.05 - 0.25] });
  }
  b.box(x1 - x0, BODY.gf, zf - 0.3 - zb, { tones: 'stone', pattern: 'ashlar', at: [cxB, 0, (zf - 0.3 + zb) / 2] });
  kit.wallWithOpenings(b, {
    x0, x1, y1: BODY.gf, z0: zf, thick: 0.3, tones: 'stone', pattern: 'ashlar',
    openings: [{ x: DOOR.x, y: 0, w: DOOR.w, h: DOOR.h }, { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h }],
  });
  // quoins at the front corners (pale dressed stone, alternating)
  for (let i = 0; i < 6; i++) {
    const y = 0.17 + i * 0.3471, long = i % 2 === 0;
    for (const [cx, s] of [[x0, 1], [x1, -1]]) b.box(long ? 0.26 : 0.16, 0.27, 0.04, { tones: 'ashlar', pattern: 'none', at: [cx + s * (long ? 0.13 : 0.08), y, zf + 0.0213] });
  }
  const dw = kit.doorway(b, { at: [DOOR.x, 0, zf], w: DOOR.w, h: DOOR.h, thick: 0.3, hood: 'lintel', frame: 'ashlar' });
  // pale dressed-stone (Gibbs) surround + a segmental arch with a keystone: the SE front is in shade at the gameplay
  // camera, so the doorway needs a light frame to read as THE entrance (verifier: corners-diagonal)
  {
    const zs = zf + 0.0371, hw = DOOR.w / 2;
    for (let i = 0; i < 5; i++) {
      const y = 0.02 + i * 0.4, long = i % 2 === 0, bw = long ? 0.27 : 0.17;
      for (const s of [-1, 1]) b.box(bw, 0.36, 0.07, { tones: 'cream', pattern: 'none', tint: long ? 1.04 : 0.98, at: [DOOR.x + s * (hw + bw / 2 - 0.02) + 0.0013, y, zs] });
    }
    const ar = [], ai = [], R0 = hw + 0.3, Ri = hw + 0.04, rise = 0.32, n = 8;
    for (let i = 0; i <= n; i++) { const t = i / n, x = -1 + 2 * t; ar.push([x * R0, (1 - x * x) * rise + 0.12]); ai.unshift([x * Ri, (1 - x * x) * (rise - 0.06)]); }
    b.prism([...ar, ...ai], 0.09, { tones: 'cream', pattern: 'none', tint: 1.0, at: [DOOR.x, DOOR.h + 0.02, zs + 0.01] });
    b.prism([[-0.1, 0], [0.1, 0], [0.14, 0.5], [-0.14, 0.5]], 0.12, { tones: 'ashlar', pattern: 'none', tint: 1.1, at: [DOOR.x + 0.0017, DOOR.h + 0.06, zs + 0.03] });   // keystone
  }
  kit.steps(b, { at: [DOOR.x, 0, zf], w: 1.12, count: 1, rise: 0.1, run: 0.3 });
  b.box(0.8, 0.035, 0.24, { tones: 'thatch', tint: 0.9, layer: 'soft', at: [DOOR.x, 0, zf + 0.42] });   // rush mat
  for (const [fx, fz, w] of [[-0.12, 1.75, 0.42], [0.2, 1.92, 0.34]]) b.box(w, 0.03, 0.16, { tones: 'ashlar', tint: 0.97, at: [fx, 0, fz] });   // flags to the lane
  {
    const w = kit.window_(b, { at: [WIN.x, WIN.y + WIN.h / 2, zf], w: WIN.w, h: WIN.h, panes: [2, 2], frame: 'cream', shutters: SHUTTER, inset: 0.12, sill: true });
    windows.push({ id: 'parlour', local: w.glowPos, light: true });
  }
  // lantern left of the door (the camera side: on the right it hid behind the wheel), below the lucam's sack
  lights.push(kit.lantern(b, { at: [-0.93, 2.06, zf + 0.0029] }));

  // =============================================================================================== upper band
  b.box(x1 - x0, BODY.eave - BODY.gf, zf - zb, { tones: 'plaster', pattern: 'plaster', at: [cxB, BODY.gf, czB] });
  b.box(x1 - x0 + 0.08, 0.13, zf - zb + 0.08, { tones: 'timber', pattern: 'none', at: [cxB, BODY.gf - 0.06, czB] });      // sill beam (all round)
  {
    const posts = [];
    const bandWins = [[1.3, 0.46]];
    for (let x = x0 + 0.06; x < x1 - 0.05; x += 0.5617) {
      if (x > LUC.x0 - 0.1 && x < LUC.x1 + 0.1) continue;
      if (bandWins.some(([wx, ww]) => Math.abs(x - wx) < ww / 2 + 0.12)) continue;
      posts.push(x);
    }
    posts.push(x0 + 0.06, x1 - 0.06);
    for (const [wx, ww] of bandWins) posts.push(wx - ww / 2 - 0.1, wx + ww / 2 + 0.1);
    kit.timbers(b, { x0, x1, y0: BODY.gf + 0.07, y1: BODY.eave, z: zf, posts });
    // side + back walls: posts too (turntables / iso)
    for (const [ry, half, face] of [[Math.PI / 2, (zf - zb) / 2, x1 - cxB], [-Math.PI / 2, (zf - zb) / 2, cxB - x0], [Math.PI, (x1 - x0) / 2, -zb + czB]]) {
      b.push(kit.M({ at: [cxB, 0, czB], ry }));
      const ps = []; for (let x = -half + 0.06; x <= half - 0.05; x += 0.5617) ps.push(x);
      kit.timbers(b, { x0: -half, x1: half, y0: BODY.gf + 0.07, y1: BODY.eave - 0.22, z: face, posts: ps });   // tops tucked under the single-course hip ends
      b.pop();
    }
    const up2 = kit.window_(b, { at: [1.3, 2.6, zf], w: 0.46, h: 0.36, panes: [2, 1], frame: 'cream', sill: false, bar: 0.045 });
    windows.push({ id: 'loft', local: up2.glowPos, light: true });
  }
  // side / back windows (iso + turntables)
  b.push(kit.M({ at: [cxB, 0, czB], ry: Math.PI }));
  kit.window_(b, { at: [0.6, 1.4, zf - czB], w: 0.62, h: 0.7, panes: [2, 2], frame: 'cream', shutters: SHUTTER });
  b.pop();
  b.push(kit.M({ at: [cxB, 0, czB], ry: Math.PI / 2 }));
  kit.window_(b, { at: [-0.3, 1.4, x1 - cxB], w: 0.55, h: 0.7, panes: [2, 2], frame: 'cream', shutters: SHUTTER });
  b.pop();
  b.push(kit.M({ at: [cxB, 0, czB], ry: -Math.PI / 2 }));
  kit.window_(b, { at: [0.5, 2.62, cxB - x0], w: 0.32, h: 0.34, panes: [1, 1], frame: 'cream', sill: false });
  westSide(b, { face: cxB - x0, half: (zf - zb) / 2, windows });
  b.pop();

  // =============================================================================================== roof
  const roof = thatchRoof(b, { cx: cxB, cz: czB, hx: (x1 - x0) / 2, hz: (zf - zb) / 2, eave: BODY.eave, ridge: ROOF.ridge, ov: ROOF.ov, tanE: ROOF.tanE, seed, cut: { x0: LUC.x0 - 0.02, x1: LUC.x1 + 0.02, z: LUC.zf } });
  {
    // ridge: a fat roll + a block-cut band with a scalloped lower edge, liggers and crossed spars on both long slopes
    const rh = roof.ridgeHalf, th = roof.th, ct = Math.cos(th), st = Math.sin(th);
    b.box(2 * rh + 0.36, 0.2, 0.38, { tones: RIDGE, at: [cxB, ROOF.ridge - 0.06, czB] });
    // hazel pegs across the ridge roll (every ~0.3 m: dark 1-texel ticks on the roll's lit top)
    {
      const L = 2 * rh + 0.3, m = Math.max(4, Math.round(L / 0.3));
      for (let i = 0; i < m; i++) b.box(0.04, 0.03, 0.42, { tones: PEG, at: [cxB - L / 2 + (L * (i + 0.5)) / m + 0.0043, ROOF.ridge + 0.125, czB + 0.0029] });
    }
    for (const side of [1, -1]) {
      const X = V3(side, 0, 0), Y = V3(0, st, -side * ct), Z = V3(0, ct, side * st);
      b.push(basis(X, Y, Z, V3(cxB, ROOF.ridge, czB)));
      const ext = (y) => rh + 0.04 + (-y * ct) * Math.tan(th) / ROOF.tanE;   // half-length of the slope at depth y
      const pts = [[-ext(0.08), 0.08]];
      const span = ext(-0.58), n = Math.max(4, 2 * Math.round(span / 0.34));
      for (let i = 0; i <= n; i++) pts.push([-span + (2 * span * i) / n, i % 2 === 0 ? -0.44 : -0.62]);
      pts.push([ext(0.08), 0.08]);
      b.prism(pts, 0.1, { tones: RIDGE, tint: 1.04, at: [0, 0, 0.0731] });
      for (const ly of [-0.15, -0.36]) b.box(2 * ext(ly) - 0.06, 0.05, 0.05, { tones: PEG, origin: 'center', at: [0, ly, 0.1531] });
      const sx = 2 * ext(-0.36) - 0.2, m = Math.max(3, Math.round(sx / 0.3));
      for (let i = 0; i < m; i++) {
        const x = -sx / 2 + (sx * (i + 0.5)) / m;
        for (const s of [1, -1]) b.box(0.24, 0.04, 0.03, { tones: PEG, tint: 1.08, origin: 'center', rz: s * 0.75, at: [x + 0.0031, -0.255, 0.1381] });
      }
      b.pop();
    }
  }
  // eyebrow: the thatch swells up OUT of the roof plane in a rounded hood over a small glazed light above the door.
  // The light stands vertical at zw where the roof surface passes just under its sill; the hood (an arch-shaped
  // prism with legs buried in the roof) runs back until the roof surface swallows its crown.
  {
    const { x: ex, yb, gw, gh, ro, ri, hy } = EYE;
    const yRoof = (z) => roof.y0 + (roof.zEdge - z) * roof.tanS;            // top of the front thatch plane
    const zOf = (y) => roof.zEdge - (y - roof.y0) / roof.tanS;
    const zw = zOf(yb - 0.1), zFront = zw + 0.13, zBack = zOf(yb + hy) - 0.05;
    const leg = yb - yRoof(zFront) + 0.12;                                    // how far the hood's legs drop at its front
    const arc = (rx, ry, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([Math.cos(a) * rx, Math.sin(a) * ry]); } return p; };
    const hood = [[ro, -leg], ...arc(ro, hy, 0, Math.PI, 8), [-ro, -leg], [-ri, -leg], ...arc(ri, hy - 0.16, Math.PI, 0, 8), [ri, -leg]];
    b.prism(hood, zFront - zBack, { tones: STRAW[0], tint: 1.03, at: [ex, yb, (zFront + zBack) / 2] });     // solid layer: cream rim on the crown
    // the courses lift around the light: two wider, lower swells behind the hood (each starts further up the roof and
    // runs back until the roof swallows its crown) = the thatch sweeping up over the eyebrow, 2-texel steps
    for (const [dr, dh, back, ti] of [[0.2, 0.1, 0.16, 0.95], [0.4, 0.17, 0.34, 0.9]]) {
      const Ro = ro + dr, Hy = hy + dh, zF = zFront - back, zB = zOf(yb + Hy) - 0.05;
      const lg = yb - yRoof(zF) + 0.1;
      const sw = [[Ro, -lg], ...arc(Ro, Hy, 0, Math.PI, 10), [-Ro, -lg], [-Ro + 0.12, -lg], ...arc(Ro - 0.12, Hy - 0.12, Math.PI, 0, 10), [Ro - 0.12, -lg]];
      if (zF - zB > 0.02) b.prism(sw, zF - zB, { tones: STRAW[1], tint: ti, layer: 'soft', at: [ex + 0.0023, yb, (zF + zB) / 2] });
    }
    // cheek face inside the arch (pale plaster) with the light: sill, mullion, beam lintel
    const cheek = [[ri, -leg], ...arc(ri, hy - 0.16, 0, Math.PI, 8), [-ri, -leg]];
    b.prism(cheek, 0.04, { tones: 'plaster', at: [ex, yb, zw - 0.02] });
    b.box(gw, gh, 0.02, { tones: 'glass', layer: 'glass', glow: P.glow[1], at: [ex, yb, zw + 0.01] });
    b.box(0.045, gh, 0.03, { tones: 'timber', at: [ex, yb, zw + 0.02] });
    b.box(gw + 0.16, 0.07, 0.07, { tones: 'timber', at: [ex, yb + gh, zw + 0.03] });                          // beam lintel
    b.box(gw + 0.1, 0.05, 0.09, { tones: 'timber', at: [ex, yb - 0.05, zw + 0.03] });                         // sill
    windows.push({ id: 'eyebrow', local: V3(ex, yb + gh / 2, zw + 0.3), light: false });
  }
  // chimney: tall brick stack on the right (slightly tapered: no edge-on faces at yaw 0)
  let chimTop;
  {
    const { x, z, base, top } = CHIM, w = 0.58, d = 0.52, t = 0.035;
    b.hexa([V3(x - w / 2, base, z - d / 2), V3(x + w / 2, base, z - d / 2), V3(x - w / 2 + t, top, z - d / 2 + t), V3(x + w / 2 - t, top, z - d / 2 + t),
      V3(x - w / 2, base, z + d / 2), V3(x + w / 2, base, z + d / 2), V3(x - w / 2 + t, top, z + d / 2 - t), V3(x + w / 2 - t, top, z + d / 2 - t)], { tones: 'brick', pattern: 'brick' });
    b.box(w + 0.06, 0.1, d + 0.06, { tones: 'brick', tint: 1.05, at: [x, top - 0.24, z] });
    b.box(w + 0.02, 0.12, d + 0.02, { tones: 'brick', tint: 0.95, at: [x, top, z] });
    b.cylinder(0.1, 0.085, 0.24, { at: [x - 0.1, top + 0.12, z], tones: 'red' });
    chimTop = V3(x - 0.1, top + 0.38, z);
  }

  // =============================================================================================== lucam (hoist loft)
  let pulley;
  {
    const { x0: lx0, x1: lx1, zb: lzb, zf: lzf, y0, eave, ridge } = LUC, lcx = (lx0 + lx1) / 2, lw = lx1 - lx0;
    b.box(lw, eave - y0, lzf - lzb, { tones: 'plank', pattern: 'vboards', scale: 0.7, at: [lcx, y0, (lzf + lzb) / 2] });
    // jetty beam + brackets carrying it over the wall
    b.box(lw + 0.14, 0.12, lzf - zf + 0.1, { tones: 'timber', at: [lcx, y0 - 0.1, (lzf + zf) / 2 + 0.03] });
    const br = [[0, 0], [0.33, 0], [0.33, -0.06], [0.12, -0.16], [0.04, -0.28], [0, -0.3]];
    for (const bx of [lx0 + 0.05, lx1 - 0.05]) b.prism(br, 0.08, { tones: 'timber', at: [bx, y0 - 0.1, zf], ry: -Math.PI / 2 });
    // corner posts + head rail
    for (const px of [lx0 + 0.04, lx1 - 0.04]) b.box(0.08, eave - y0, 0.06, { tones: 'timber', at: [px, y0, lzf + 0.01] });
    b.box(lw, 0.08, 0.06, { tones: 'timber', at: [lcx, eave - 0.08, lzf + 0.01] });
    // loading doors (closed, iron straps) + a sill board
    const dy0 = y0 + 0.16, dy1 = 3.72, dw2 = 0.3;
    for (const s of [-1, 1]) {
      b.box(dw2, dy1 - dy0, 0.04, { tones: 'plank', pattern: 'vboards', scale: 0.5, tint: 1.04, at: [lcx + s * (dw2 / 2 + 0.008), dy0, lzf + 0.02] });
      for (const hy of [dy0 + 0.18, dy1 - 0.22]) b.box(dw2 - 0.06, 0.04, 0.025, { tones: 'iron', at: [lcx + s * (dw2 / 2 + 0.008), hy, lzf + 0.045] });
    }
    b.box(0.66, 0.06, 0.14, { tones: 'timber', at: [lcx, dy0 - 0.06, lzf + 0.05] });
    // small lit window above the doors
    const lwn = kit.window_(b, { at: [lcx, 4.02, lzf], w: 0.34, h: 0.26, panes: [2, 1], frame: 'timber', sill: false, bar: 0.045 });
    windows.push({ id: 'lucam', local: lwn.glowPos, light: false });
    // slate gable roof (ridge along z, gable to the camera) + bargeboards
    kit.gableRoof(b, {
      x: lcx, z: (lzf + lzb) / 2, w: lzf - lzb, d: lw, eave, ridge, axis: 'z', kind: 'slate', overhang: 0.14, gableOverhang: 0.12,
      gable: 'plank', gablePattern: 'vboards', seed: seed + 3, roof: { course: 0.24, lift: 0.07, thick: 0.1 }, pattern: 'none',
    });
    const tg = (ridge - eave) / (lw / 2), th = Math.atan(tg), ov = 0.14, yE = eave - ov * tg, X = lw / 2 + ov;
    const z0 = lzf + 0.12 - 0.0213, z1 = lzf + 0.12 + 0.0491;
    for (const sd of [-1, 1]) {
      const pA = [lcx + sd * X + 0.0019, yE + 0.0027], pB = [lcx + 0.0019, ridge + 0.0027], nx = sd * Math.sin(th), ny = Math.cos(th);
      const c = (p, o, z) => V3(p[0] + nx * o, p[1] + ny * o, z);
      b.hexa([c(pA, -0.07, z0), c(pB, -0.07, z0), c(pA, 0.12, z0), c(pB, 0.12, z0), c(pA, -0.07, z1), c(pB, -0.07, z1), c(pA, 0.12, z1), c(pB, 0.12, z1)], { tones: 'slate', tint: 0.95 });
    }
    // hoist beam out of the gable, pulley block
    const by = ridge - 0.33, bz1 = lzf + 0.38;
    b.box(0.13, 0.13, bz1 - lzf + 0.2, { tones: 'timber', at: [lcx, by, (lzf - 0.2 + bz1) / 2] });
    b.box(0.09, 0.14, 0.12, { tones: 'iron', at: [lcx, by - 0.14, bz1 - 0.08] });
    pulley = V3(lcx, by - 0.14, bz1 - 0.08);
  }

  // =============================================================================================== millrace, flume, sluice gate
  {
    const { x0: rx0, x1: rx1, zf: rzf, water, kerb } = RACE;
    b.box(rx1 - rx0, water + 0.06, rzf - 0.14 - zf, { tones: 'blue', pattern: 'none', at: [(rx0 + rx1) / 2, -0.06, (zf + rzf - 0.14) / 2] });
    b.box(rx1 - rx0 + 0.28, kerb + 0.06, 0.15, { tones: 'ashlar', pattern: 'ashlar', at: [(rx0 + rx1) / 2, -0.06, rzf - 0.075] });   // front kerb
    b.box(0.14, kerb + 0.06, rzf - zf, { tones: 'ashlar', pattern: 'none', at: [rx1 + 0.07, -0.06, (zf + rzf) / 2] });                // tail end
    b.box(0.14, kerb + 0.06, rzf - zf, { tones: 'ashlar', pattern: 'none', at: [rx0 - 0.07, -0.06, (zf + rzf) / 2] });                // head end
    b.box(0.06, 0.1, 0.3, { tones: 'iron', at: [rx0 + 0.03, 0.06, zf + 0.35] });                                                       // culvert grate
  }
  {
    // flume: a plank trough on timber trestles, inside the footprint. The long arm comes from the millpond leat at the
    // back of the lot along the east side of the house; at the front corner a sluice gate (iron hand-wheel on top)
    // turns it west onto the wheel top. Water strips inside both arms.
    const { x0: f0, x1: f1, y, z0: fz0, z1: fz1, sx0, sx1, zBack } = FLUME, fx = (f0 + f1) / 2, fl = f1 - f0, fcz = (fz0 + fz1) / 2;
    const sxc = (sx0 + sx1) / 2, sw = sx1 - sx0, sl = fz0 - zBack, szc = (fz0 + zBack) / 2;
    // cross arm (along x) over the wheel
    b.box(fl, 0.06, fz1 - fz0, { tones: 'plank', pattern: 'boards', at: [fx, y, fcz] });
    for (const [zz, tt] of [[fz0 + 0.025, 0.96], [fz1 - 0.025, 1]]) b.box(fl, 0.2, 0.05, { tones: 'plank', pattern: 'boards', tint: tt, at: [fx, y, zz] });
    b.box(fl - 0.05, 0.03, fz1 - fz0 - 0.1, { tones: 'blue', at: [fx - 0.025, y + 0.13, fcz] });
    b.box(0.08, 0.04, fz1 - fz0 + 0.1, { tones: 'iron', at: [f0 + 0.33, y + 0.2, fcz] });                          // strap
    // long arm (along z) down the east side
    b.box(sw, 0.06, sl, { tones: 'plank', pattern: 'boards', at: [sxc, y, szc] });
    for (const [xx, tt] of [[sx0 + 0.025, 0.92], [sx1 - 0.025, 1]]) b.box(0.05, 0.2, sl, { tones: 'plank', pattern: 'boards', tint: tt, at: [xx, y, szc] });
    b.box(sw - 0.1, 0.03, sl, { tones: 'blue', at: [sxc, y + 0.13, szc] });
    for (const zz of [-1.2, -0.2, 0.7]) b.box(sw + 0.1, 0.04, 0.08, { tones: 'iron', at: [sxc, y + 0.2, zz] });
    // the head box at the back where the leat comes in
    b.box(sw + 0.14, 0.42, 0.3, { tones: 'plank', pattern: 'vboards', scale: 0.5, tint: 0.96, at: [sxc, y - 0.08, zBack + 0.15] });
    // trestles: posts to the ground + cross-heads
    for (const zz of [-1.75, -0.55, 0.55]) {
      b.box(0.09, y, 0.09, { tones: 'timber', at: [sxc, 0, zz] });
      b.box(sw + 0.12, 0.08, 0.1, { tones: 'timber', at: [sxc, y - 0.08, zz] });
    }
    b.box(0.09, y + 0.02, 0.09, { tones: 'timber', at: [GATE.x, -0.02, GATE.z - 0.05] });                        // corner post (in the race)
    b.box(0.3, 0.08, 0.3, { tones: 'timber', at: [GATE.x, y - 0.08, GATE.z - 0.02] });
    // sluice gate at the corner: two iron guides, a plank gate, the hand-wheel on its screw
    const gz = GATE.z + 0.15;
    for (const gx of [GATE.x - 0.16, GATE.x + 0.16]) b.box(0.05, GATE.top - y, 0.05, { tones: 'iron', at: [gx, y, gz] });
    b.box(0.38, 0.06, 0.07, { tones: 'iron', at: [GATE.x, GATE.top - 0.06, gz] });
    b.box(0.3, 0.38, 0.05, { tones: 'plank', pattern: 'vboards', scale: 0.5, tint: 1.04, at: [GATE.x, y + 0.12, gz - 0.01] });
    b.box(0.04, 0.24, 0.04, { tones: 'iron', at: [GATE.x, GATE.top - 0.06, gz] });
    b.push(kit.M({ at: [GATE.x, GATE.top + 0.24, gz + 0.0131] }));
    ring(b, { r0: 0.1, r1: 0.16, z: 0, depth: 0.045, tones: 'iron', segs: 8, phase: Math.PI / 8 });
    b.box(0.3, 0.035, 0.035, { tones: 'iron', origin: 'center' });
    b.pop();
    // lantern on the corner post + a low pool anchor in front of the wheel: keeps the wheel's shape at night
    const ln = kit.lantern(b, { at: [GATE.x + 0.0031, 1.62, GATE.z], r: 2.6 });
    lights.push({ ...ln, pos: V3(WHEEL.x + 0.1, 1.1, WHEEL.z + 0.75), r: 2.8 });
    // wheel axle bearing block on the wall
    b.box(0.3, 0.3, 0.06, { tones: 'timber', at: [WHEEL.x, WHEEL.y - 0.15, zf + 0.03] });
  }

  // =============================================================================================== dressing
  // flour sacks at the door's foot, a spare millstone leaning at the right corner
  sack(b, { at: [-1.0, 0, zf + 0.24], h: 0.42, r: 0.2 });
  sack(b, { at: [-1.38, 0, zf + 0.27], h: 0.36, r: 0.19, tint: 0.97 });
  sack(b, { at: [-1.2, 0, zf + 0.58], h: 0.32, r: 0.17, tint: 1.03 });
  {
    b.push(kit.M({ at: [-2.08, 0.43, zf + 0.24], rx: -0.12 }));
    cylZ(b, { r: 0.42, len: 0.16, at: [0, 0, 0], tones: 'stone', segs: 16 });
    cylZ(b, { r: 0.09, len: 0.2, at: [0, 0, 0.0131], tones: 'iron', segs: 8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3927;
      b.box(0.24, 0.04, 0.03, { tones: 'stone', tint: 0.78, origin: 'center', rz: a + 0.35, at: [Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.085] });
    }
    b.pop();
  }
  // east apron: water butt + a tub of herbs (persona: barrel, herbs)
  {
    const bx = 2.78, bz = -1.35;
    b.cylinder(0.25, 0.25, 0.72, { at: [bx, -0.02, bz], tones: 'plank', pattern: 'vboards', scale: 0.6 });
    for (const y of [0.12, 0.54]) b.cylinder(0.27, 0.27, 0.06, { at: [bx, y, bz], tones: 'iron' });
    b.cylinder(0.22, 0.22, 0.03, { at: [bx, 0.69, bz], tones: 'blue' });
    const hx = 2.78, hz = 0.3;
    b.cylinder(0.2, 0.17, 0.26, { at: [hx, -0.02, hz], tones: 'plank', pattern: 'vboards', scale: 0.6 });
    b.cylinder(0.2, 0.2, 0.05, { at: [hx, 0.2, hz], tones: 'iron' });
    const r = rng(seed + 41);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, rr = 0.09;
      b.box(0.1, 0.16 + r() * 0.1, 0.1, { tones: 'leaf', layer: 'soft', at: [hx + Math.cos(a) * rr, 0.22, hz + Math.sin(a) * rr] });
    }
    for (const [fx, fz, c] of [[hx - 0.06, hz + 0.08, P.flowerViolet], [hx + 0.08, hz - 0.02, P.flowerWhite]]) b.box(0.07, 0.07, 0.07, { tones: c, layer: 'soft', at: [fx, 0.42, fz] });
  }

  const group = b.build();

  // ------------------------------------------------------------------------------------------------ door
  // the leaf overlaps both jambs by 8 mm (tucked into them): any gap, even 6 mm, showed the glowing interior plate as
  // 1-px neon jamb seams at night
  const d = kit.door(engine, { w: DOOR.w + 0.016, h: DOOR.h - 0.004, kind: 'dutch', tones: DOOR_PAINT, hinge: 'left', name: `${rec.id}-door` });
  d.pivot.position.copy(dw.hingeLeft).add(V3(-0.008, 0.004, 0));
  group.add(d.pivot);

  // ------------------------------------------------------------------------------------------------ the wheel
  const wb = new kit.Builder(engine, { name: `${rec.id}-wheel` });
  {
    const { R } = WHEEL, ri = R - 0.24;
    ring(wb, { r0: ri, r1: R, z: -0.13, depth: 0.05, tones: 'timber' });                        // back shroud (dark)
    ring(wb, { r0: R - 0.075, r1: R, z: 0.15, depth: 0.06, tones: 'plank' });                   // front outer rim
    ring(wb, { r0: ri, r1: ri + 0.07, z: 0.15, depth: 0.06, tones: 'plank' });                  // front inner rim
    for (let i = 0; i < 16; i++) {                                                               // buckets
      const a = (i / 16) * Math.PI * 2 + 0.0173, rm = (R + ri) / 2;
      wb.box(0.2, 0.055, 0.26, { tones: 'plank', tint: 1.05, origin: 'center', rz: a - 0.45, at: [Math.cos(a) * rm, Math.sin(a) * rm, 0.01] });
    }
    // 6 fat spokes (0.1 m = 3 texels at the gameplay zoom), front face only: thin 8-spoke front+back sets showed as
    // doubled stair-stepped 1-px lines at diagonal poses (the back set peeks out under the front one)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.0173, rs = (ri + 0.12) / 2, len = ri - 0.1;
      wb.box(len, 0.1, 0.06, { tones: 'plank', origin: 'center', rz: a, at: [Math.cos(a) * rs, Math.sin(a) * rs, 0.12] });
    }
    cylZ(wb, { r: 0.14, len: 0.36, at: [0, 0, 0], tones: 'iron', segs: 8 });                    // hub
    cylZ(wb, { r: 0.06, len: 0.5, at: [0, 0, -0.08], tones: 'iron', segs: 8 });                  // axle into the wall
    wb.box(0.06, 0.06, 0.03, { tones: 'brass', at: [-0.05, 0.03, 0.19] });                       // brass boss
  }
  const wheel = wb.build({ name: `${rec.id}-wheel` });
  const wheelPivot = new THREE.Group(); wheelPivot.name = `${rec.id}-wheel-pivot`;
  wheelPivot.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
  wheelPivot.add(wheel);
  group.add(wheelPivot);

  // ------------------------------------------------------------------------------------------------ water frames
  // falling water from the flume onto the descending buckets, foam where the wheel churns the race, ripples running
  // down the race to the culvert: 3 prebuilt geometries swapped on one mesh (1 draw call, stepped 6 fps)
  const waterGeoms = [];
  let waterMat = null;
  for (let f = 0; f < 3; f++) {
    const fb = new kit.Builder(engine, { name: `${rec.id}-water${f}` });
    const r = rng(seed * 31 + f * 101);
    const zW = WHEEL.z + 0.2;
    for (let i = 0; i < 13; i++) {
      const u = (i + f / 3) / 13;
      const a = Math.PI - (1.35 - u * 1.75);          // along the rim from ~103 deg down the LEFT side to ~203 deg
      const rr = WHEEL.R + 0.05 + (i % 2) * 0.02;
      const x = WHEEL.x + Math.cos(a) * rr, y = WHEEL.y + Math.sin(a) * rr;
      fb.box(0.1, 0.15, 0.05, { tones: i % 3 === f ? 'cream' : P.blue[0], layer: 'soft', at: [x + 0.0047, y - 0.0773, zW + 0.0113 + (i % 2) * 0.031] });
    }
    fb.box(0.1, 0.16, 0.05, { tones: P.blue[0], layer: 'soft', at: [FLUME.x0 - 0.05, FLUME.y - 0.02, zW - 0.12] });
    for (let i = 0; i < 7; i++) {
      const x = WHEEL.x - 0.75 + r() * 1.5, z = zf + 0.12 + r() * 0.7;
      fb.box(0.07 + r() * 0.08, 0.035, 0.07, { tones: 'cream', layer: 'soft', at: [x, RACE.water, z] });
    }
    for (let i = 0; i < 4; i++) {
      const x = RACE.x1 - 0.2 - ((i * 0.5 + f * 0.17) % 1.7), z = zf + 0.2 + ((i * 0.29) % 0.45);
      if (x < RACE.x0 + 0.12) continue;
      fb.box(0.18, 0.025, 0.05, { tones: P.blue[0], layer: 'soft', at: [x, RACE.water, z] });
    }
    const g = fb.build({ name: `${rec.id}-water${f}`, castShadow: false });
    const m = g.children[0];
    waterGeoms.push(m.geometry);
    waterMat = m.material;
  }
  const water = new THREE.Mesh(waterGeoms[0], waterMat);
  water.name = `${rec.id}-water`; water.castShadow = false; water.receiveShadow = true; water.userData.layer = 'soft';
  group.add(water);

  // ------------------------------------------------------------------------------------------------ the flour sack on the hoist
  const hb = new kit.Builder(engine, { name: `${rec.id}-sack` });
  const rope = 0.62;
  hb.box(0.035, rope, 0.035, { tones: 'thatch', tint: 0.9, layer: 'soft', at: [0, -rope, 0] });
  sack(hb, { at: [0, -rope - 0.42, 0], h: 0.42, r: 0.17 });
  const load = new THREE.Group(); load.name = `${rec.id}-sack-pivot`;
  load.add(hb.build({ name: `${rec.id}-sack` }));
  load.position.copy(pulley).add(V3(0, -0.07, 0));
  group.add(load);

  fr.apply(group);
  const W3 = (v) => toWorld(group, v);
  // the real door, GAME frame (see anchors.doors): centre on the outer face of the front wall + outward normal
  const doorW = W3(V3(DOOR.x, 0, zf));
  const doorNv = W3(V3(DOOR.x, 0, zf + 1)).sub(doorW);
  const doorN = [+(doorNv.x / Math.hypot(doorNv.x, doorNv.z)).toFixed(4), +(doorNv.z / Math.hypot(doorNv.x, doorNv.z)).toFixed(4)];
  const wins = windows.map((w) => ({ id: `${rec.id}-${w.id}`, pos: W3(w.local), light: w.light }));
  const swing = [0, 0.06, 0.1, 0.06, 0, -0.06, -0.1, -0.06];
  const STEP = (Math.PI * 2) / 48;

  return {
    group,
    update(t) {
      const tt = Math.max(0, t);
      wheelPivot.rotation.z = Math.floor(tt * 6) * STEP;            // counter-clockwise from the camera (fed from the right, water down the left)
      water.geometry = waterGeoms[Math.floor(tt * 6) % 3];
      load.rotation.z = swing[Math.floor(tt * 3) % swing.length];
    },
    anchors: {
      // the REAL door (fix round 'doors-visible'): the mill's front wall is at local z 1.1 (zf), not at the footprint
      // edge (local z 2.0, where the game's doorPoint lies; the lucam + race stand in front of the wall). point = the
      // door's centre on the outer wall plane, normal = the front's outward normal, both GAME frame (the composer
      // applies the 45 deg LAYOUT_DELTAS placement), so stats.doorMismatch now checks this door against layout.js.
      // (done, lead round 6: layout.js LAYOUT_DELTAS 'house-14' carries door: { point: { x: 5.5, z: 12.1 }, normal: [0, 1] },
      // game frame, 0.9 m behind the footprint front - the placed record's doorPoint / door tile is this door; no doorMismatch)
      doors: [{ id: `${rec.id}-door`, pivot: d.pivot, open: d.open, normal: [...doorN], point: { x: doorW.x, z: doorW.z } }],
      chimneys: [W3(chimTop)],
      windows: wins.map(({ id, pos }) => ({ id, pos })),
      lights: [
        ...lights.map((l) => ({ ...l, pos: W3(l.pos) })),
        ...wins.filter((w) => w.light).map((w) => ({ pos: w.pos, color: P.glow[1], r: 1.6, kind: 'window' })),
      ],
      perches: [
        W3(V3(cxB - roof.ridgeHalf, ROOF.ridge + 0.16, czB)), W3(V3(cxB + roof.ridgeHalf, ROOF.ridge + 0.16, czB)),
        W3(V3(CHIM.x, CHIM.top + 0.12, CHIM.z + 0.15)), W3(V3((LUC.x0 + LUC.x1) / 2, LUC.ridge + 0.1, LUC.zf)),
        W3(V3(sxcOf(), FLUME.y + 0.36, FLUME.zBack + 0.15)),
      ],
      spots: {
        doorstep: W3(V3(DOOR.x, 0, 2.3)), wheel: W3(V3(WHEEL.x, WHEEL.y, WHEEL.z + 0.3)), race: W3(V3(1.4, RACE.water, 1.75)),
        sack: W3(V3(pulley.x, pulley.y - 1.1, pulley.z)), millstone: W3(V3(-2.08, 0.85, zf + 0.24)),
      },
    },
    api: {
      setDoor: (f) => d.open(f),
      setLit: (on) => group.traverse((o) => o.userData.layer === 'glass' && kit.setGlowLit(o, on)),
    },
    stats: { mill: 1 },
  };
}
