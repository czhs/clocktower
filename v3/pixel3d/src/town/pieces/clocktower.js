// clocktower (owner: clocktower agent). docs/TOWN.md §4 (API), §6 (scale), §10 (rubric).
//
// DESIGN NOTE (v1 identity: pipgws packages/assets/scripts/buildings.ts clocktower(), screenshots
// v2-buildings-clocktower-x4.png, v2-terrain-town.png, v21-clock-*.png):
//   Signature shape: the town's hero silhouette at the head of the ring. A tall grey-violet stone tower in four
//   stepped stages that narrow as they rise - a broad BASE on a two-step plinth with the great pointed door, a
//   CLOCK STAGE carrying a huge ivory dial in a brass bezel and a stone surround, an open BELFRY with the brass
//   bell in a pointed arch, a corbelled, CRENELLATED PARADE with four corner pinnacles (slate spirelets, brass
//   knobs) - and a bell-cast (flared) SLATE SPIRE with a little lucarne, a gilded ball, the cardinal arms and a
//   cockerel weathervane. Corners are quoined (alternating long/short dressed blocks), every stage ends in a
//   stepped corbel moulding (a dark line under, a cream rim on top: the t3ssel8r read of v1's 4-row mouldings).
//   Palette rows (TOWN.md §3): stone (walls, ashlar pattern), ashlar (quoins, mouldings, door surround, arches,
//   steps), slate (spire, spirelets, lucarne), brass (bezel, bell, knobs, ball, vane), cream (the dial; glows
//   glow[0] at night), iron (hands, hour marks, straps, lanterns, rod), timber (door leaves, bell stock), glass
//   (slits, lucarne), leaf (ivy on the lit left corner), ivory / bannerRed (the notices nailed to the door).
//   Key details: live hands on all four dials (one merged mesh rebuilt by setTime: 1 draw call), a bell that swings
//   in stepped poses (ring(t0)), door lanterns, proclamations nailed to the right leaf (the town of accusations),
//   stair slits, ivy, a lit lucarne at night. Night: the dials glow warm ivory and light the stone around them.
//   At 640x360 it must read as: "the clock tower" - a big readable clock face with hands, a bell in an arch above
//   it, a pointed slate spire - and its door must be obvious from the lane.
//   Anchors: perches on the four pinnacle knobs, the front merlons, the dial top and the vane; spots dial / bell /
//   door / vane / belfry; lights = the front dial (lamp) + the two door lanterns.
import * as THREE from 'three';
import * as kit from '../kit.js';
import { TOWN_PALETTE } from '../palette.js';
import { toWorld } from '../api.js';

const { Builder, M } = kit;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------- dimensions (local)
// local frame: origin = footprint centre (22.5, 0, 7), +z = south (the square). Footprint x -2.5..2.5, z -2..2.
const CZ = -0.2;                                   // tower body centre z (body sits back so the plinth steps face the lane)
const STEP = [{ hx: 2.45, z0: -2.0, z1: 2.0, y0: -0.06, y1: 0.12 }, { hx: 2.33, z0: -1.94, z1: 1.86, y0: 0.08, y1: 0.24 }];
const BASE = { hx: 2.2, hz: 1.7, y0: 0.22, y1: 3.5, wall: 0.35 };       // z -1.9 .. 1.5
const STAGE = { hx: 1.75, hz: 1.6, y0: 3.6, y1: 7.4, quoin: 0.17 };     // clock stage z -1.8 .. 1.4 (quoins = pilasters)
const BELF = { hx: 1.6, hz: 1.45, y0: 7.5, y1: 10.65, wall: 0.3 };      // belfry z -1.65 .. 1.25
const PAR = { h: 1.8, y0: 10.6, walk: 10.8, wallTop: 11.15, top: 11.5, t: 0.2 };   // parade (square, half 1.8)
const SPIRE = { yE: 11.2, hE: 1.55, yK: 11.8, hK: 1.25, yA: 15.6 };  // bell-cast spire profile
const DIAL = { y: 5.45, Rd: 1.12, Rb: 1.26, Rs: 1.42 };                 // dial / bezel / surround radii (front)
const SIDE_DIAL = 0.86;                                                  // side + back dials (narrower faces)
const DOOR = { w: 1.5, y0: 0.22 };
const DOOR_PTS = [[-0.75, 0], [-0.75, 1.95], [-0.45, 2.3], [0, 2.5], [0.45, 2.3], [0.75, 1.95], [0.75, 0]];
const DOOR_OUT = [[-0.95, 0], [-0.95, 1.99], [-0.56, 2.45], [0, 2.7], [0.56, 2.45], [0.95, 1.99], [0.95, 0]];
const BELL = { z: CZ + 0.5, pivotY: 9.5 };

const DIAL_GLOW = TOWN_PALETTE.glow[0];

// ---------------------------------------------------------------------------------------------- shape helpers
/** Outline of a pointed (equilateral) arch opening: bottom-left, up the left side, apex, down to bottom-right. */
function archPts(cx, y0, w, spring, segs = 4) {
  const R = w, phiMax = Math.acos((R - w / 2) / R);
  const right = [];                                         // springing-right .. apex
  for (let i = 0; i <= segs; i++) {
    const p = (i / segs) * phiMax;
    right.push([cx - w / 2 + R * Math.cos(p), spring + R * Math.sin(p)]);
  }
  const leftUp = right.map(([x, y]) => [2 * cx - x, y]);    // springing-left .. apex
  return [[cx - w / 2, y0], ...leftUp, ...right.slice(0, -1).reverse(), [cx + w / 2, y0]];
}
function circlePts(r, n = 32, cx = 0, cy = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = ((i + 0.5) / n) * TAU; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
/** Extruded XY polygon (+ holes) whose FRONT face lies at z = zf, `thick` deep (toward -z), in the current frame. */
function slab(b, outer, holes, zf, thick, opts) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, zf - thick);
  b.add(g, null, opts);
  g.dispose();
}
/** Wall rectangle x0..x1, y0..y1 with an opening that reaches the bottom edge (pts: bottom-left .. around .. bottom-right). */
function uWall(b, x0, x1, y0, y1, pts, zf, thick, opts) {
  slab(b, [[x0, y0], ...pts, [x1, y0], [x1, y1], [x0, y1]], [], zf, thick, opts);
}
/** Band between an outer and an inner opening outline (both bottom-left .. around .. bottom-right). */
function band(b, outer, inner, zf, thick, opts) {
  slab(b, [...outer, ...[...inner].reverse()], [], zf, thick, opts);
}
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

// ---------------------------------------------------------------------------------------------- build
export default function build(engine, ctx) {
  const rec = ctx.record, c = rec.center;
  const rand = ctx.rng;
  const b = new Builder(engine, { name: 'clocktower' });
  const STONE = { tones: 'stone', pattern: 'ashlar' };
  const DRESS = { tones: 'ashlar', pattern: 'none' };
  const lights = [], windows = [];

  // ------------------------------------------------------------------------------------------ plinth steps
  for (const s of STEP) b.box(s.hx * 2, s.y1 - s.y0, s.z1 - s.z0, { tones: 'ashlar', pattern: 'ashlar', scale: 1.4, at: [0, s.y0, (s.z0 + s.z1) / 2] });
  b.box(1.9, 0.16, 0.34, { tones: 'ashlar', pattern: 'none', tint: 0.97, at: [0, -0.04, 2.15] });   // doorstep onto the door tile
  // moss tufts in the step corners (soft layer: no cream rims)
  for (const [mx, mz, ty, n] of [[-2.22, 1.9, STEP[0].y1, 3], [-2.1, 1.76, STEP[1].y1, 2], [2.27, 1.9, STEP[0].y1, 2]]) {
    for (let i = 0; i < n; i++) {
      const w = 0.16 - i * 0.04, hh = 0.1 - i * 0.025;
      b.box(w, hh, 0.12 - i * 0.02, { tones: 'mossTuft', layer: 'soft', tint: [0.97, 1.03, 1][i], at: [mx + (i - 1) * 0.09 * Math.sign(-mx), ty - 0.02, mz - i * 0.023] });
    }
  }

  // ------------------------------------------------------------------------------------------ helpers on the body
  const quoins = (hx, hz, y0, y1, bh, L = [0.46, 0.28], p = 0.05) => {
    let k = 0;
    for (let y = y0 + 0.0261; y < y1 - 0.05; y += bh, k++) {      // non-round courses: no pan ties at the corners
      const h = Math.min(bh, y1 - y), long = k % 2 === 0;
      const lf = long ? L[0] : L[1], ls = long ? L[1] : L[0];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const w = lf + p, d = ls + p;
        b.box(w, h, d, { ...DRESS, tint: long ? 1.0 : 0.96, at: [sx * (hx + p - w / 2), y, CZ + sz * (hz + p - d / 2)] });
      }
    }
  };
  const corbel = (hx, hz, y, p1 = 0.08, p2 = 0.17, h1 = 0.12, h2 = 0.13) => {   // stepped moulding (2 courses)
    b.box((hx + p1) * 2, h1, (hz + p1) * 2, { ...DRESS, tint: 0.96, at: [0, y, CZ] });
    b.box((hx + p2) * 2, h2, (hz + p2) * 2, { ...DRESS, at: [0, y + h1, CZ] });
    return y + h1 + h2;
  };
  // sloped stone WEATHERING (set-off) from a cornice top (outer half sizes hxO/hzO, at y) up into the next stage's
  // walls (hxI/hzI): four mitred slabs in the stone ramp with ashlar joints, so the step-back reads as coursed stone
  // with a lit / shaded side instead of a flat cream slab. gap (number or per face [front, +x, back, -x]): leave |u| < gap open (belfry sills).
  const weather = (hxO, hzO, hxI, hzI, y, rise, gap = 0) => {
    const o = { tones: 'stone', pattern: 'ashlar', scale: 0.8 };
    const yb = y - 0.047, yo = y + 0.033, yi = y + rise;
    for (let f = 0; f < 4; f++) {
      const ry = [0, Math.PI / 2, Math.PI, -Math.PI / 2][f];
      const ax = f % 2 === 0, uO = ax ? hxO : hzO, uI = ax ? hxI : hzI, dO = ax ? hzO : hxO, dI = (ax ? hzI : hxI) - 0.043;
      b.push(M({ at: [0, 0, CZ], ry }));
      const g = Array.isArray(gap) ? gap[f] : gap;
      const runs = g > 0 ? [[-1, -g], [g, 1]] : [[-1, 1]];
      for (const [r0, r1] of runs) {
        const xo = (r) => (Math.abs(r) === 1 ? r * uO : r), xi = (r) => (Math.abs(r) === 1 ? r * uI : r);
        b.hexa([V3(xi(r0), yb, dI), V3(xi(r1), yb, dI), V3(xi(r0), yi, dI), V3(xi(r1), yi, dI),
          V3(xo(r0), yb, dO), V3(xo(r1), yb, dO), V3(xo(r0), yo, dO), V3(xo(r1), yo, dO)], o);
      }
      b.pop();
    }
  };
  // frame on a face of a body (half sizes hx, hz around (0, CZ)): +z = outward normal; 0 = front, 1 = +x, 2 = back, 3 = -x
  const faceFrame = (f, hx, hz, y = 0) => {
    const ry = [0, Math.PI / 2, Math.PI, -Math.PI / 2][f];
    const d = f % 2 === 0 ? hz : hx;
    return M({ at: [Math.sin(ry) * d, y, CZ + Math.cos(ry) * d], ry });
  };
  const halfW = (f, hx, hz) => (f % 2 === 0 ? hx : hz);   // half width of a face

  // ------------------------------------------------------------------------------------------ BASE (shell with the great door)
  const B = BASE, zF = CZ + B.hz;                          // front wall plane z = 1.5
  b.push(M({ at: [0, 0, zF] }));
  uWall(b, -B.hx, B.hx, B.y0, B.y1, shift(DOOR_PTS, 0, DOOR.y0), 0, B.wall, STONE);
  b.pop();
  b.box(B.hx * 2, B.y1 - B.y0, B.wall, { ...STONE, at: [0, B.y0, CZ - B.hz + B.wall / 2] });                       // back
  for (const sx of [-1, 1]) b.box(B.wall, B.y1 - B.y0, B.hz * 2 - B.wall * 2, { ...STONE, at: [sx * (B.hx - B.wall / 2), B.y0, CZ] });
  b.box(B.hx * 2 - 0.1, 0.22, B.hz * 2 - 0.1, { tones: 'stone', pattern: 'none', tint: 0.9, at: [0, 0.0, CZ] });   // interior floor
  // vestibule behind the door (dark stone sides + ceiling) and the glowing stair hall at its back
  const vz0 = zF - 1.15;
  for (const sx of [-1, 1]) b.box(0.2, 2.8, zF - B.wall - vz0 + 0.02, { tones: 'stone', pattern: 'none', tint: 0.85, at: [sx * 0.95, B.y0, (zF - B.wall + vz0) / 2] });
  b.box(2.1, 0.2, zF - B.wall - vz0 + 0.02, { tones: 'stone', pattern: 'none', tint: 0.85, at: [0, 2.85, (zF - B.wall + vz0) / 2] });
  b.box(1.7, 2.8, 0.04, { tones: 'timber', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 2, at: [0, B.y0, vz0] });
  // the stair rising up the hall's back wall + a newel and handrail: iron-sh silhouettes against the lit hall (depth)
  {
    const SIL = { tones: TOWN_PALETTE.iron[2], pattern: 'none' };
    for (let i = 0; i < 5; i++) b.box(0.3, 0.317 * (i + 1), 0.4, { ...SIL, at: [-0.613 + 0.3 * i, B.y0 + 0.003, vz0 + 0.223] });
    b.box(0.08, 1.07, 0.08, { ...SIL, at: [-0.737, B.y0 + 0.003, vz0 + 0.487] });
    const rx0 = -0.737, ry0 = B.y0 + 1.03, rx1 = 0.7, ry1 = B.y0 + 2.43;
    b.box(Math.hypot(rx1 - rx0, ry1 - ry0), 0.07, 0.06, { ...SIL, origin: 'center', rz: Math.atan2(ry1 - ry0, rx1 - rx0),
      at: [(rx0 + rx1) / 2, (ry0 + ry1) / 2, vz0 + 0.487] });
  }
  // plinth course (cut at the door: back + sides in one box, two front runs either side of the door surround)
  const PC = { tones: 'stone', pattern: 'ashlar', scale: 1.25, tint: 0.95 };
  const pcBack = zF - B.wall - 0.02, pcZ0 = CZ - B.hz - 0.05;
  b.box(B.hx * 2 + 0.1, 0.36, pcBack - pcZ0, { ...PC, at: [0, 0.2, (pcBack + pcZ0) / 2] });
  for (const sx of [-1, 1]) {
    const x0 = 0.97, x1 = B.hx + 0.05;
    b.box(x1 - x0, 0.36, zF + 0.05 - pcBack, { ...PC, at: [sx * (x0 + x1) / 2, 0.2, (zF + 0.05 + pcBack) / 2] });
  }
  quoins(B.hx, B.hz, 0.56, B.y1, 0.3, [0.46, 0.28], 0.06);
  // door surround: dressed stone band + keystone, threshold
  b.push(M({ at: [0, DOOR.y0, zF] }));
  band(b, DOOR_OUT, DOOR_PTS, 0.065, 0.1, { ...DRESS, tint: 0.98 });
  b.box(0.2, 0.3, 0.12, { ...DRESS, tint: 1.04, at: [0, 2.56, 0.04] });
  b.pop();
  b.box(DOOR.w + 0.02, 0.05, B.wall + 0.12, { ...DRESS, tint: 0.95, at: [0, DOOR.y0, zF - B.wall / 2 + 0.06] });
  // door lanterns (v1: one either side of the door)
  // big enough to read by day at 1x: iron wall plate + 2-texel bracket arm, brass cap, cream-lit glass, iron posts
  const bigLantern = (x, yb, z) => {
    const ir = { tones: 'iron', pattern: 'none' };
    const lz = z + 0.337;
    b.box(0.11, 0.27, 0.043, { ...ir, at: [x, yb - 0.113, z + 0.021] });                       // wall plate
    b.box(0.07, 0.07, 0.4, { ...ir, at: [x, yb + 0.013, z + 0.2] });                          // bracket arm
    b.box(0.05, 0.05, 0.27, { ...ir, origin: 'center', rx: -0.62, at: [x, yb - 0.087, z + 0.123] });   // strut
    b.box(0.05, 0.063, 0.05, { ...ir, at: [x, yb - 0.05, lz] });                               // hanger
    b.cylinder(0.205, 0.045, 0.127, { segments: 4, tones: 'brass', pattern: 'none', at: [x, yb - 0.177, lz] });   // cap
    b.box(0.21, 0.297, 0.21, { tones: 'cream', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2, at: [x, yb - 0.473, lz] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 0.3, 0.05, { ...ir, at: [x + sx * 0.117, yb - 0.477, lz + sz * 0.117] });
    b.box(0.29, 0.06, 0.29, { ...ir, at: [x, yb - 0.537, lz] });                              // base pan
    b.box(0.07, 0.06, 0.07, { tones: 'brass', pattern: 'none', at: [x, yb - 0.597, lz] });   // drop knob
    return { pos: V3(x, yb - 0.33, lz), color: TOWN_PALETTE.lampGlow, r: 3, kind: 'lantern' };
  };
  for (const sx of [-1, 1]) lights.push(bigLantern(sx * 1.337, 2.237, zF));
  // stair slits (base): front above the lanterns, both sides
  const slit = (fr, x, y, h = 0.62, w = 0.13) => {
    b.push(fr);
    b.box(w, h, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1, at: [x, y, 0.005] });
    for (const sx of [-1, 1]) b.box(0.08, h + 0.1, 0.07, { ...DRESS, at: [x + sx * (w / 2 + 0.04), y - 0.05, 0.0] });
    b.box(w + 0.24, 0.08, 0.075, { ...DRESS, tint: 1.03, at: [x, y + h, 0.0] });
    b.box(w + 0.24, 0.07, 0.09, { ...DRESS, tint: 0.95, at: [x, y - 0.12, 0.0] });
    windows.push(V3(x, y + h / 2, 0.3).applyMatrix4(fr));
    b.pop();
  };
  for (const sx of [-1, 1]) slit(faceFrame(0, B.hx, B.hz), sx * 1.48, 2.62, 0.5);
  for (const f of [1, 3]) { slit(faceFrame(f, B.hx, B.hz), 0.55, 1.5); slit(faceFrame(f, B.hx, B.hz), -0.55, 2.5); }
  slit(faceFrame(2, B.hx, B.hz), 0, 2.2);

  // ivy on the lit left corner (front + west face), clumps, soft layer (no cream rims)
  {
    const leaf = { tones: 'leaf', layer: 'soft' };
    const clumps = [[-2.05, 0.5, 0.5], [-1.85, 1.15, 0.42], [-2.1, 1.75, 0.34], [-1.95, 2.3, 0.26], [-2.12, 2.75, 0.2]];
    let i = 0;
    for (const [cx0, cy0, r0] of clumps) {
      const n = Math.round((10 * r0) / 0.3);
      for (let k = 0; k < n; k++, i++) {
        const a = rand() * TAU, rr = Math.sqrt(rand()) * r0;
        const x = cx0 + Math.cos(a) * rr * 0.8, y = cy0 + Math.sin(a) * rr;
        const s = 0.1 + rand() * 0.07;
        const pz = 0.035 + ((i * 7) % 5) * 0.0093;
        b.box(s, s * 0.8, 0.06, { ...leaf, tint: [0.96, 1, 1.04][i % 3], at: [Math.max(-B.hx + s / 2 - 0.03, x), y, zF + pz] });
        if (x < -1.9) b.box(0.06, s * 0.8, s, { ...leaf, tint: [1.04, 1, 0.96][i % 3], at: [-B.hx - pz, y + 0.03, zF - 0.1 - rand() * 0.5] });
      }
    }
  }

  // ------------------------------------------------------------------------------------------ CLOCK STAGE
  let y = corbel(B.hx, B.hz, B.y1 - 0.1);                    // base cornice (top 3.65)
  const S = STAGE;
  weather(B.hx + 0.17 - 0.073, B.hz + 0.17 - 0.073, S.hx, S.hz, y, 0.27);
  b.box(S.hx * 2, S.y1 - S.y0, S.hz * 2, { ...STONE, at: [0, S.y0, CZ] });
  quoins(S.hx, S.hz, y, S.y1, 0.3, [0.32, 0.2], S.quoin);
  // dials on all four faces: stone surround, brass bezel, ivory face (glass layer: glows at night), hour marks
  const dials = [];
  for (let f = 0; f < 4; f++) {
    const k = f === 0 ? 1 : SIDE_DIAL;
    const fr = faceFrame(f, S.hx, S.hz, DIAL.y);
    dials.push({ fr, k });
    b.push(fr);
    slab(b, circlePts(DIAL.Rs * k), [circlePts(DIAL.Rb * k - 0.05)], 0.075, 0.1, { tones: 'ashlar', pattern: 'none', tint: 0.98 });
    slab(b, circlePts(DIAL.Rb * k), [circlePts(DIAL.Rd * k - 0.04)], 0.15, 0.1, { tones: 'brass', pattern: 'none' });
    slab(b, circlePts(DIAL.Rd * k), [], 0.06, 0.05, { tones: 'cream', layer: 'glass', glow: DIAL_GLOW, glowKind: 1 });
    for (let i = 0; i < 12; i++) {
      const q = i % 3 === 0;
      b.push(M({ at: [0, 0, 0.07], rz: -(i / 12) * TAU }));
      b.box((q ? 0.12 : 0.075) * k, (q ? 0.3 : 0.17) * k, 0.025, { tones: 'iron', pattern: 'none', at: [0, (q ? 0.74 : 0.86) * k, 0] });
      b.pop();
    }
    b.pop();
  }
  y = corbel(S.hx, S.hz, S.y1 - 0.1, 0.22, 0.31);            // clock cornice (covers the pilaster tops)
  weather(S.hx + 0.31 - 0.073, S.hz + 0.31 - 0.073, BELF.hx, BELF.hz, y, 0.23, [0.92, 0, 0.92, 0]);

  // ------------------------------------------------------------------------------------------ BELFRY (open arches)
  const F = BELF;
  const ARCH = [{ w: 1.5, spring: F.y0 + 1.45 }, { w: 1.1, spring: F.y0 + 1.6 }];
  for (let f = 0; f < 4; f++) {
    const A = ARCH[f % 2];
    const hw = f % 2 === 0 ? F.hx : F.hz - F.wall;          // front/back span the full width, sides fit between
    b.push(faceFrame(f, F.hx, F.hz));
    uWall(b, -hw, hw, F.y0, F.y1, archPts(0, F.y0, A.w, A.spring), 0, F.wall, { ...STONE, scale: 0.9 });
    band(b, archPts(0, F.y0 + 0.05, A.w + 0.3, A.spring), archPts(0, F.y0 + 0.05, A.w, A.spring), 0.05, 0.08, { ...DRESS, tint: 0.98 });
    // sill across the opening + little lancets either side (front / back)
    if (f % 2 === 0) b.box(A.w + 0.34, 0.1, F.wall + 0.12, { ...DRESS, tint: 0.95, at: [0, F.y0 - 0.02, -F.wall / 2 + 0.06] });   // (sides: the weathering is the sill)
    if (f % 2 === 0) for (const sx of [-1, 1]) slab(b, archPts(sx * 1.22, F.y0 + 1.25, 0.16, F.y0 + 1.95, 2), [], 0.008, 0.02, { tones: 'glass', layer: 'glass', glowKind: 0 });
    b.pop();
  }
  // belfry floor boards and the fixed bell stock (along z, resting in the front / back walls)
  // dark stone floor (stone sh: the belfry reads as a dark niche, not a plank crate) + a dark timber bell frame
  // behind the bell (king post + braces under the stock), backlit by the open back arch
  const NICHE = { tones: TOWN_PALETTE.stone[2], pattern: 'none' };
  b.box(F.hx * 2 - 0.2, 0.06, F.hz * 2 - 0.2, { ...NICHE, at: [0, F.y0 + 0.063, CZ] });
  {
    const FR = { tones: TOWN_PALETTE.timber[2], pattern: 'none' };
    const fz = CZ - 0.613;
    b.box(0.13, BELL.pivotY - F.y0 - 0.1, 0.13, { ...FR, at: [0, F.y0 + 0.117, fz] });
    for (const sx of [-1, 1]) {
      const x0 = sx * 0.8213, y0 = F.y0 + 0.117, x1 = sx * 0.06, y1 = BELL.pivotY - 0.53;
      b.box(Math.hypot(x1 - x0, y1 - y0), 0.09, 0.09, { ...FR, origin: 'center', rz: Math.atan2(y1 - y0, x1 - x0), at: [(x0 + x1) / 2, (y0 + y1) / 2, fz] });
    }
    b.box(1.9, 0.11, 0.11, { ...FR, at: [0, F.y0 + 0.117, fz] });                            // sole plate
  }
  b.box(0.18, 0.16, F.hz * 2 - 0.1, { tones: 'timber', pattern: 'none', at: [0, BELL.pivotY + 0.02, CZ] });
  quoins(F.hx, F.hz, y, F.y1 - 0.15, 0.3, [0.3, 0.18], 0.04);

  // ------------------------------------------------------------------------------------------ PARADE (corbel table, crenellations, pinnacles)
  const P = PAR, ph = P.h;
  for (let f = 0; f < 4; f++) {                               // corbels under the walk
    const hw = halfW(f, F.hx, F.hz), proj = f % 2 === 0 ? ph - F.hz : ph - F.hx;
    b.push(faceFrame(f, F.hx, F.hz));
    for (let x = -hw + 0.28; x <= hw - 0.27; x += 0.44) b.box(0.18, 0.22, proj + 0.04, { ...DRESS, tint: 0.95, at: [x, F.y1 - 0.27, (proj - 0.04) / 2] });
    b.pop();
  }
  b.box(ph * 2 + 0.13, P.walk - P.y0, ph * 2 + 0.13, { tones: 'ashlar', pattern: 'none', at: [0, P.y0, CZ] });   // walk = string course
  const pin = 0.44;
  for (let f = 0; f < 4; f++) {
    b.push(faceFrame(f, ph, ph));
    const inner = ph - pin;
    b.box(inner * 2, P.wallTop - P.walk, P.t, { ...STONE, at: [0, P.walk, -P.t / 2] });
    const n = 4, mw = 0.36, gap = (inner * 2 - n * mw) / (n + 1);
    for (let i = 0; i < n; i++) b.box(mw, P.top - P.wallTop, P.t, { ...STONE, at: [-inner + gap * (i + 1) + mw * (i + 0.5), P.wallTop, -P.t / 2] });
    b.pop();
  }
  const pinTops = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (ph - pin / 2), pz = CZ + sz * (ph - pin / 2);
    b.box(pin, P.y0 + 1.47 - P.walk, pin, { ...STONE, scale: 0.8, at: [px, P.walk, pz] });
    b.box(pin + 0.1, 0.09, pin + 0.1, { ...DRESS, at: [px, P.y0 + 1.47, pz] });
    b.cylinder(0.34, 0.0, 0.78, { segments: 4, tones: 'slate', pattern: 'none', at: [px, P.y0 + 1.56, pz] });
    b.cylinder(0.07, 0.07, 0.12, { segments: 8, tones: 'brass', at: [px, P.y0 + 2.28, pz] });
    pinTops.push(V3(px, P.y0 + 2.41, pz));
  }

  // ------------------------------------------------------------------------------------------ SPIRE (bell-cast, coursed slate)
  const SP = SPIRE;
  const hAt = (yy) => (yy <= SP.yK ? SP.hE + ((SP.hK - SP.hE) * (yy - SP.yE)) / (SP.yK - SP.yE) : (SP.hK * (SP.yA - yy)) / (SP.yA - SP.yK));
  const courses = [];
  for (let i = 0; i < 2; i++) courses.push([SP.yE + (i * (SP.yK - SP.yE)) / 2, SP.yE + ((i + 1) * (SP.yK - SP.yE)) / 2]);
  const NM = 11;
  const ease = (t) => 1 - Math.pow(1 - t, 1.12);
  for (let i = 0; i < NM; i++) courses.push([SP.yK + (SP.yA - SP.yK) * ease(i / NM), SP.yK + (SP.yA - SP.yK) * ease((i + 1) / NM)]);
  const LIFT = 0.085, THICK = 0.13;
  for (let f = 0; f < 4; f++) {
    const ry = [0, Math.PI / 2, Math.PI, -Math.PI / 2][f];
    b.push(M({ at: [0, 0, CZ], ry }));
    courses.forEach(([ya, yb], ci) => {
      const last = ci === courses.length - 1;
      const yb2 = last ? yb : Math.min(SP.yA, yb + 0.02);
      const ha = hAt(ya), hb = hAt(yb2);
      const dh = hb - ha, dy = yb2 - ya, L = Math.hypot(dh, dy);
      const nH = dy / L, nY = -dh / L;                     // outward normal (h, y)
      const lift = ci === 0 ? 0 : LIFT;
      const P2 = (u, hh, yy, off) => V3(u * (hh + nH * off), yy + nY * off, hh + nH * off);   // u in [-1, 1] across the face
      // tiles: split the course into runs with tint steps (no 1-px pattern: dotted lines on steep slopes)
      const cuts = [-1];
      while (cuts[cuts.length - 1] < 1 - 1e-6) {
        const step = (0.32 + rand() * 0.42) / Math.max(0.3, ha);
        const nx = cuts[cuts.length - 1] + step;
        cuts.push(nx > 1 - 0.25 / Math.max(0.3, ha) ? 1 : nx);
      }
      for (let k = 0; k < cuts.length - 1; k++) {
        const ua = cuts[k], ub = cuts[k + 1];
        const tint = [0.95, 1, 1, 1.04][Math.floor(rand() * 4)];
        b.hexa([
          P2(ua, ha, ya, lift - THICK), P2(ub, ha, ya, lift - THICK), P2(ua, ha, ya, lift), P2(ub, ha, ya, lift),
          P2(ua, hb, yb2, -THICK), P2(ub, hb, yb2, -THICK), P2(ua, hb, yb2, 0), P2(ub, hb, yb2, 0),
        ], { tones: 'slate', pattern: 'none', tint });
      }
    });
    b.pop();
  }
  // hip rolls (cover the course ends' sawtooth on the silhouette)
  {
    const prof = [[SP.yE, SP.hE], [SP.yK, SP.hK], [SP.yA - 0.05, 0.0]];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let s = 0; s < 2; s++) {
        const [ya, ha] = prof[s], [yb, hb] = prof[s + 1];
        const Qa = V3(sx * ha, ya, CZ + sz * ha), Qb = V3(sx * hb, yb, CZ + sz * hb);
        const along = Qb.clone().sub(Qa).normalize();
        const side = V3(sx, 0, -sz).normalize();
        const out = along.clone().cross(side).normalize();
        if (out.x * sx + out.z * sz < 0) out.negate();
        const w = 0.075, o0 = 0.02, o1 = LIFT + 0.08;
        const cs = (Q, sw, so) => Q.clone().addScaledVector(side, sw).addScaledVector(out, so);
        b.hexa([cs(Qa, -w, o0), cs(Qa, w, o0), cs(Qa, -w, o1), cs(Qa, w, o1), cs(Qb, -w, o0), cs(Qb, w, o0), cs(Qb, -w, o1), cs(Qb, w, o1)],
          { tones: 'slate', pattern: 'none', tint: 0.9 });
      }
    }
  }
  // lucarnes (front + back): little slate-gabled dormers with a lit window
  for (const f of [0, 2]) {
    const ry = f === 0 ? 0 : Math.PI;
    const fr = M({ at: [0, 0, CZ], ry });
    b.push(fr);
    const ly = SP.yK + 0.9, hz = hAt(ly) + 0.16, w = 0.5, hgt = 0.42;
    b.box(w, hgt, hz - 0.2, { tones: 'stone', pattern: 'none', at: [0, ly, (hz + 0.2) / 2] });
    b.box(0.22, 0.27, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1, at: [0, ly + 0.06, hz + 0.005] });
    b.box(w + 0.04, 0.05, 0.08, { ...DRESS, at: [0, ly - 0.02, hz] });
    const ey = ly + hgt, ry2 = ey + 0.32, ov = 0.08;
    for (const sx of [-1, 1]) {
      b.hexa([V3(0, ry2 - 0.08, 0.2), V3(0, ry2 - 0.08, hz + ov), V3(0, ry2 + 0.02, 0.2), V3(0, ry2 + 0.02, hz + ov),
        V3(sx * (w / 2 + 0.1), ey - 0.1, 0.2), V3(sx * (w / 2 + 0.1), ey - 0.1, hz + ov), V3(sx * (w / 2 + 0.1), ey, 0.2), V3(sx * (w / 2 + 0.1), ey, hz + ov)],
      { tones: 'slate', pattern: 'none', tint: sx < 0 ? 1.02 : 0.98 });
    }
    b.prism([[-w / 2, 0], [w / 2, 0], [0, ry2 - ey - 0.06]], 0.06, { tones: 'stone', pattern: 'none', at: [0, ey, hz - 0.03] });
    windows.push(V3(0, ly + 0.2, hz + 0.3).applyMatrix4(fr));
    b.pop();
  }
  // finial: brass ball on a collar, iron rod, cardinal arms
  b.cylinder(0.1, 0.06, 0.12, { segments: 8, tones: 'brass', at: [0, SP.yA - 0.08, CZ] });
  b.cylinder(0.15, 0.15, 0.26, { segments: 8, tones: 'brass', at: [0, SP.yA + 0.04, CZ] });
  b.cylinder(0.035, 0.035, 1.2, { segments: 8, tones: 'iron', at: [0, SP.yA + 0.3, CZ] });
  b.box(0.7, 0.06, 0.06, { tones: 'iron', at: [0, SP.yA + 0.62, CZ] });
  b.box(0.06, 0.06, 0.7, { tones: 'iron', at: [0, SP.yA + 0.62, CZ] });
  for (const [ax, az] of [[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) b.box(0.1, 0.1, 0.1, { tones: 'brass', at: [ax, SP.yA + 0.6, CZ + az] });

  const group = b.build();
  group.name = 'clocktower';

  // ------------------------------------------------------------------------------------------ door leaves (double, pointed)
  const leafB = (sx) => {
    const lb = new Builder(engine, { name: `clocktower-door-${sx < 0 ? 'l' : 'r'}` });
    const lw = 0.74, m = sx < 0 ? 1 : -1;                  // leaf runs from its hinge (x 0) toward the door centre
    const pts = [[0, 0], [lw, 0], [lw, 2.49], [0.3, 2.29], [0, 1.94]].map(([x, yy]) => [m * x, yy]);
    slab(lb, m > 0 ? pts : [...pts].reverse(), [], 0.04, 0.08, { tones: 'timber', pattern: 'vboards', scale: 0.62 });
    for (const sy of [0.5, 1.62]) lb.box(lw - 0.08, 0.07, 0.03, { tones: 'iron', pattern: 'none', at: [m * (lw / 2 - 0.02), sy, 0.05] });
    lb.box(0.09, 0.09, 0.05, { tones: 'brass', pattern: 'none', at: [m * (lw - 0.14), 1.1, 0.06] });
    if (sx > 0) {                                           // proclamations nailed to the right leaf
      lb.box(0.24, 0.3, 0.025, { tones: 'cream', pattern: 'none', at: [-0.38, 0.95, 0.055] });
      lb.box(0.2, 0.25, 0.025, { tones: TOWN_PALETTE.ivory, pattern: 'none', at: [-0.5, 1.3, 0.07] });
      lb.box(0.06, 0.06, 0.025, { tones: TOWN_PALETTE.bannerRed, pattern: 'none', at: [-0.38, 1.0, 0.075] });
    }
    const leaf = lb.build({ name: lb.name });
    const pivot = new THREE.Group(); pivot.name = `${lb.name}-pivot`;
    pivot.add(leaf);
    pivot.position.set(sx * 0.75, DOOR.y0 + 0.01, zF - 0.16);
    group.add(pivot);
    return pivot;
  };
  const doorL = leafB(-1), doorR = leafB(1);
  const setDoor = (f) => {
    const a = Math.max(0, Math.min(1, f)) * 1.55;
    doorL.rotation.y = a; doorR.rotation.y = -a;
  };

  // ------------------------------------------------------------------------------------------ live hands (all four dials, ONE mesh)
  const hands = new THREE.Group(); hands.name = 'clocktower-hands';
  group.add(hands);
  const HOUR = [[-0.055, -0.14], [0.055, -0.14], [0.06, 0.4], [0.12, 0.47], [0, 0.62], [-0.12, 0.47], [-0.06, 0.4]];
  const MIN = [[-0.04, -0.26], [0.04, -0.26], [0.04, 0.84], [0.075, 0.88], [0, 1.0], [-0.075, 0.88], [-0.04, 0.84]];
  let shown = null, hourRing = false;
  const setTime = (h, m = 0) => {
    const total = (((Math.round(h * 60 + m) % 720) + 720) % 720);    // minutes on a 12 h dial
    if (total === shown) return;
    if (shown !== null && total % 60 === 0) hourRing = true;          // a live clock reaching the hour rings the bell
    shown = total;
    for (const o of [...hands.children]) { hands.remove(o); o.traverse((q) => q.geometry?.dispose()); }
    const hb = new Builder(engine, { name: 'clocktower-hands' });
    const aMin = ((total % 60) / 60) * TAU, aHour = (total / 720) * TAU;
    for (const { fr, k } of dials) {
      hb.push(fr);
      hb.push(M({ at: [0, 0, 0.1], rz: -aHour, s: k })); hb.prism(HOUR, 0.03, { tones: 'iron', pattern: 'none' }); hb.pop();
      hb.push(M({ at: [0, 0, 0.135], rz: -aMin, s: k })); hb.prism(MIN, 0.025, { tones: 'iron', pattern: 'none' }); hb.pop();
      hb.push(M({ at: [0, 0, 0.12], rx: Math.PI / 2 })); hb.cylinder(0.075 * k, 0.075 * k, 0.05, { segments: 8, tones: 'brass' }); hb.pop();
      hb.pop();
    }
    const g = hb.build({ castShadow: false, name: 'clocktower-hands' });
    for (const o of [...g.children]) hands.add(o);
  };

  // ------------------------------------------------------------------------------------------ the bell (swings: ring(t0))
  const bellPivot = new THREE.Group(); bellPivot.name = 'clocktower-bell-pivot';
  {
    const bb = new Builder(engine, { name: 'clocktower-bell' });
    const prof = [[0.5, 0], [0.49, 0.05], [0.42, 0.11], [0.36, 0.24], [0.32, 0.42], [0.3, 0.58], [0.27, 0.69], [0.17, 0.77], [0.0, 0.8]]
      .map(([r, yy]) => new THREE.Vector2(r, yy));
    const g = new THREE.LatheGeometry(prof, 16, -Math.PI / 16, TAU);
    bb.add(g, M({ at: [0, -1.05, 0] }), { tones: 'brass', pattern: 'none' });
    g.dispose();
    bb.box(0.14, 0.1, 0.14, { tones: 'brass', pattern: 'none', tint: 0.95, at: [0, -0.27, 0] });           // crown / canons
    bb.box(0.24, 0.17, 0.5, { tones: 'timber', pattern: 'none', at: [0, -0.19, 0] });                      // headstock
    bb.box(0.08, 0.12, 0.08, { tones: 'iron', pattern: 'none', at: [0, -1.15, 0] });                       // clapper ball
    bellPivot.add(bb.build({ name: 'clocktower-bell', receiveShadow: false }));   // the hero bell glints in the dark belfry (v1)
    bellPivot.position.set(0, BELL.pivotY, BELL.z);
    group.add(bellPivot);
  }
  let ringT0 = null;
  const ring = (t0 = 0) => { ringT0 = t0; };
  const bellAngle = (t) => {
    if (ringT0 === null || t < ringT0) return 0;
    const s = Math.floor((t - ringT0) * 6) / 6;             // 6 fps stepped poses
    if (s > 7) return 0;
    const a = 0.55 * Math.exp(-s / 2.4) * Math.sin((s / 1.5) * TAU);
    return Math.abs(a) < 0.035 ? 0 : Math.round(a / 0.035) * 0.035;   // quantised swing
  };

  // ------------------------------------------------------------------------------------------ the weathervane (stepped wind shifts)
  const vane = new THREE.Group(); vane.name = 'clocktower-vane-pivot';
  {
    const vb = new Builder(engine, { name: 'clocktower-vane' });
    const br = { tones: 'brass', pattern: 'none' };
    vb.box(1.0, 0.06, 0.05, { ...br, origin: 'center' });                                                  // shaft
    vb.prism([[0.42, -0.1], [0.62, 0.0], [0.42, 0.1]], 0.05, br);                                          // arrow head
    vb.prism([[-0.5, -0.1], [-0.3, -0.03], [-0.3, 0.19], [-0.5, 0.24]], 0.05, { ...br, tint: 0.96 });      // tail
    vb.prism([[-0.2, 0.03], [0.12, 0.03], [0.2, 0.16], [0.26, 0.32], [0.2, 0.42], [0.13, 0.36], [0.1, 0.24], [-0.06, 0.22], [-0.18, 0.4], [-0.27, 0.26], [-0.24, 0.12]],
      0.05, br);                                                                                             // the cockerel
    vb.box(0.07, 0.07, 0.055, { tones: TOWN_PALETTE.bannerRed, pattern: 'none', at: [0.2, 0.4, 0] });     // comb
    vane.add(vb.build({ name: 'clocktower-vane', castShadow: false }));
    vane.position.set(0, SP.yA + 0.92, CZ);
    group.add(vane);
  }
  const vaneAngle = (t) => {
    const seg = Math.floor(t / 4), f = t / 4 - seg;
    const h = (n) => (((Math.sin(n * 91.7 + 3.1) * 43758.5453) % 1) + 1) % 1;
    const a0 = (h(seg) - 0.5) * 0.7, a1 = (h(seg + 1) - 0.5) * 0.7;
    const st = Math.min(3, Math.floor(Math.max(0, f - 0.85) / 0.05));   // 3 steps over the last 0.15 s of a segment
    return a0 + ((a1 - a0) * st) / 3;
  };

  // ------------------------------------------------------------------------------------------ place, API, anchors
  group.position.set(c.x, 0, c.z);
  group.updateMatrixWorld(true);
  setTime(10, 10);
  setDoor(0);
  const W3 = (v) => toWorld(group, v);
  const prm = ctx.params;
  if (prm?.has?.('ring')) ring(Number(prm.get('ring')) || 0);
  if (prm?.has?.('clock')) { const [hh, mm] = prm.get('clock').split(':').map(Number); setTime(hh || 0, mm || 0); }
  const setLit = (on) => group.traverse((o) => o.userData.layer === 'glass' && o.parent?.name === 'clocktower' && kit.setGlowLit(o, !!on));

  return {
    group,
    update(t) {
      if (hourRing) { hourRing = false; ring(t); }
      bellPivot.rotation.z = bellAngle(t);
      vane.rotation.y = vaneAngle(t);
    },
    anchors: {
      doors: [{ id: 'clocktower-door', pivot: doorL, open: setDoor }],
      windows: windows.map((p, i) => ({ id: `clocktower-win-${i}`, pos: W3(p) })),
      lights: [
        { pos: W3(V3(0, DIAL.y, CZ + S.hz + 0.6)), color: DIAL_GLOW, r: 3.6, kind: 'lamp', flicker: false },
        ...lights.map((l) => ({ ...l, pos: W3(l.pos) })),
      ],
      perches: [
        ...pinTops.map(W3),
        W3(V3(-0.73, P.top + 0.02, CZ + ph - P.t / 2)), W3(V3(0.73, P.top + 0.02, CZ + ph - P.t / 2)),   // front merlons
        W3(V3(0, DIAL.y + DIAL.Rb + 0.03, CZ + S.hz + 0.1)),                                             // on the dial bezel
        W3(V3(0, SP.yA + 1.05, CZ)),                                                                      // the vane
      ],
      spots: {
        dial: W3(V3(0, DIAL.y, CZ + S.hz + 0.25)), bell: W3(V3(0, BELL.pivotY - 0.6, BELL.z)), door: W3(V3(0, 0.24, zF + 0.4)),
        belfry: W3(V3(0, 9.1, CZ + F.hz)), vane: W3(V3(0, SP.yA + 0.92, CZ)),
      },
    },
    api: { setTime, ring, setDoor, setLit, get time() { return shown; },
      // (B) additive hook for the demo (docs/TOWN.md §4 "clocktower hooks"): the four dials in WORLD space (centre on
      // the face, outward normal, radii, the face's frame: +z out, +y up, origin = the dial centre) and the live hands
      // group (the demo's tower timer hides it and draws its own hands on the same frames); body dimensions (local)
      dials: dials.map(({ fr, k }) => {
        const m = group.matrixWorld.clone().multiply(fr);
        const center = new THREE.Vector3().setFromMatrixPosition(m);
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(m);
        return { matrix: m, local: fr.clone(), center, normal, k, dial: DIAL.Rd * k, bezel: DIAL.Rb * k, surround: DIAL.Rs * k };
      }),
      hands,
      body: { cz: CZ, base: { ...BASE }, stage: { ...STAGE }, belfry: { ...BELF }, door: { w: DOOR.w, y0: DOOR.y0, zFront: zF }, dialY: DIAL.y, bellPivotY: BELL.pivotY },
    },
    stats: { dials: 4 },
  };
}
