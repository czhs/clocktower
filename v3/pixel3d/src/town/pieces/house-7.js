// house-7 "Toadstool Hollow" (owner: house-7 agent). docs/TOWN.md §4 / §6; identity: pipgws houses/house-7.ts.
//
// DESIGN NOTE
// - Signature: the ONLY round silhouette in Hollowmere. A whitewashed, slightly flared round stalk (16-gon) under
//   a great crimson toadstool cap (24-gon dome, stepped courses = t3ssel8r line-below / rim-on-top contours) with
//   raised ivory spots, a rolled lip, an eyebrow dormer and a crooked iron stovepipe with a conical hat.
//   From the gameplay camera (yaw 0, 30 px/m) it must read as "a giant red mushroom with a door": the cap is a
//   ~150 px red ellipse with ivory dots, the stalk a pale cylinder with a dark-framed round green door.
// - Layout: footprint x 37..41, z 27..32, door faces west, door tile (36, 31). The stalk sits in the south part of
//   the lot (S = 39.1, 30.1) so its round wall reaches the door point; the door is set in a timber arch case
//   turned 28 deg south of west (mostly west, toward the square, still visible from the yaw-0 camera, TOWN.md §6
//   side doors), with plaster cheeks filling the gap to the curving stalk; it opens toward the door tile.
//   The door anchor carries the REAL door normal / point. Cap overhang <= 0.6 m beyond the footprint.
// - Cap: smooth-lit dome (own toon material: flat normals for the outline pass, smooth normals for lighting, so
//   the bands are smooth curves). Stalk + door don't receive cast shadows; the shade under the cap is a painted
//   collar course (no shadow-map sawtooth, the sunlit left flank reads).
// - Palette rows (TOWN.md §3): stalk = plaster; foot = moss / mossTuft; cap = paintRamp(v1 capRed #983634);
//   spots = cream; gills = dial; door = paintRamp(v1 door #3e6a34); door case = timber; porthole rims =
//   paintRamp(style.shutters #6b5a2f); stovepipe / lantern = iron; sills / stepping stones = ashlar; briar = leaf +
//   flowerRed; pots = brick; herbs = leaf; baby toadstools = plaster stalk + cap ramp; log = plank.
// - Details: porthole windows (front + sides + back), lantern on a cord from the cap rim by the door, flower box
//   under the front porthole, briar roses climbing the right flank, a rose bush at the right foot, herb pots by
//   the door, baby toadstools by the step, stepping stones on the door tile.
// - Night: portholes + dormer glow (kit glass layer), low lantern pool over the doorstep + stones, a glowing
//   peephole in the leaf; the door interior glows when opened.
import * as THREE from 'three';
import { toWorld } from '../api.js';
import { Builder, M, door as kitDoor, flowerBox } from '../kit.js';
import { TOWN_PALETTE, paintRamp, ramp } from '../palette.js';
import { toonMaterial } from '../../materials/toon.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const D = THREE.MathUtils.degToRad;
const dir = (az) => [Math.sin(az), Math.cos(az)];          // az 0 = +z (south), +90 = +x (east)

// ---- dimensions (metres, local to the stalk centre S)
const S = { x: 39.1, z: 30.1 };
const CAP = { x: -0.1, z: -0.12, R: 2.45, rimY: 2.72, H: 2.38, p: 0.9, segs: 32, courses: 9 };
const STALK = [ // [y0, y1, r0, r1] frusta, 16 segments, a flat face toward each k*22.5 deg
  [-0.06, 0.22, 1.95, 1.86],
  [0.22, 0.62, 1.86, 1.69],
  [0.62, 2.3, 1.69, 1.63],
  [2.3, 3.15, 1.63, 1.6],                                   // shade collar under the cap (painted, see below)
];
const stalkR = (y) => {
  for (const [y0, y1, r0, r1] of STALK) if (y >= y0 && y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  return 1.6;
};
const APO = Math.cos(Math.PI / 16);                          // 16-gon apothem / radius
const DOOR_AZ = D(-62);                                     // 28 deg south of west: faces the square, still visible at yaw 0
const DOOR = { w: 0.95, h: 2.0, case: 1.55, z: 0.235, front: 0.24 };   // case frame origin at radius 1.55, leaf ~flush

// cap profile: phi 0 (rim) .. 90 deg (apex): r = R cos phi, y = rimY + H sin^p phi (v1: a flattened dome)
const capPt = (phi, az, lift = 0) => {
  const c = Math.cos(phi), s = Math.max(0, Math.sin(phi));
  const r = CAP.R * c, y = CAP.rimY + CAP.H * Math.pow(s, CAP.p);
  const dr = -CAP.R * s, dy = CAP.H * CAP.p * Math.pow(Math.max(s, 1e-4), CAP.p - 1) * c;
  const L = Math.hypot(dr, dy) || 1;
  const nr = dy / L, ny = -dr / L;
  const [sx, sz] = dir(az);
  return V3(CAP.x + sx * (r + nr * lift), y + ny * lift, CAP.z + sz * (r + nr * lift));
};
const capNormal = (phi, az) => capPt(phi, az, 1).sub(capPt(phi, az, 0)).normalize();
const capYAt = (r) => CAP.rimY + CAP.H * Math.pow(Math.max(0, 1 - (r / CAP.R) ** 2), CAP.p / 2);

/** Arched opening polygon (matches kit door kind 'arched'). */
const archPts = (w, h) => [[-w / 2, 0], [w / 2, 0], [w / 2, h - w * 0.3], [w * 0.3, h - w * 0.08], [0, h], [-w * 0.3, h - w * 0.08], [-w / 2, h - w * 0.3]];
const octPts = (r, rot = Math.PI / 8) => Array.from({ length: 8 }, (_, i) => [r * Math.cos(rot + (i * Math.PI) / 4), r * Math.sin(rot + (i * Math.PI) / 4)]);

/** Extruded polygon with an optional hole (local XY, extruded along +z from z0 to z0 + depth). */
function ringPrism(b, outer, inner, z0, depth, opts) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  if (inner) shape.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, z0);
  b.add(g, null, opts);
  g.dispose();
}

/** Frame at azimuth az and a radius from the local origin: local +z = outward, origin at (radius, y). */
const radial = (az, radius, y = 0) => { const [sx, sz] = dir(az); return M({ at: [sx * radius, y, sz * radius], ry: az }); };

/**
 * Cap material: the kit 'solid' look (vertex tones, full outline, flat-shaded NORMAL PASS so the outline pass still
 * sees crisp facet / silhouette edges) but LIGHTING from per-vertex smooth normals, so the three toon bands on the
 * dome follow smooth iso-curves instead of facet staircases. One extra shader program for the whole town.
 */
const CAP_MATS = new WeakMap();
function capMaterial(engine) {
  let m = CAP_MATS.get(engine);
  if (!m) {
    m = toonMaterial(engine, {
      color: 0xffffff, vertexColors: true, toneAttributes: true, flatShading: true, outline: 'full',
      vertexHead: 'varying vec3 vH7N;', vertex: 'vH7N = normalize(normalMatrix * objectNormal);',
      fragmentHead: 'varying vec3 vH7N;', lightNormal: '(gl_FrontFacing ? vH7N : -vH7N)',
    });
    m.name = 'house-7-cap';
    CAP_MATS.set(engine, m);
  }
  return m;
}

/**
 * Replace a built mesh's flat normals by smooth ones (lighting only, see capMaterial): every face is treated as a
 * surface of revolution about the cap axis (its flat normal swung to each vertex's own azimuth), and the dome's
 * outer skin (vertex index < domeVerts, normal within ~35 deg of the analytic one) gets the exact dome normal.
 */
function smoothCap(mesh, domeVerts) {
  const g = mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal');
  const out = new Float32Array(n.count * 3), fn = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - CAP.x, z = p.getZ(i) - CAP.z, az = Math.atan2(x, z);
    fn.fromBufferAttribute(n, i);
    const t = i - (i % 3);
    let mx = 0, mz = 0;
    for (let k = 0; k < 3; k++) { mx += p.getX(t + k) - CAP.x; mz += p.getZ(t + k) - CAP.z; }
    const h = Math.hypot(fn.x, fn.z), sg = fn.x * mx + fn.z * mz >= 0 ? 1 : -1;
    v.set(sg * h * Math.sin(az), fn.y, sg * h * Math.cos(az));
    if (i < domeVerts) {
      const a = capNormal(Math.acos(Math.min(1, Math.hypot(x, z) / CAP.R)), az);
      if (a.dot(fn) > 0.82) v.copy(a);
    }
    v.normalize();
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}

/** Plaster cheeks filling the gap between the door case's sides and the curving stalk (no dark side slab). */
function caseCheeks(b, outer, zFront, depth, opts) {
  const zb = -0.42;
  for (let i = 1; i < outer.length; i++) {                 // every edge except the bottom one (0 -> 1)
    const [x0, y0] = outer[i], [x1, y1] = outer[(i + 1) % outer.length];
    let ox = y1 - y0, oy = -(x1 - x0);
    const L = Math.hypot(ox, oy); ox /= L; oy /= L;
    const inset = 0.02;                                     // inner edge tucked into the case (no coplanar faces)
    const P = (x, y, k, z) => V3(x + ox * k, y + oy * k, z);
    const dk = Math.abs(ox) > 0.9 ? depth : depth * 0.35;    // the arch shoulders barely clear the stalk: thin wedges
    const c0 = P(x0, Math.max(-0.05, y0), -inset, zFront), c1 = P(x1, Math.max(-0.05, y1), -inset, zFront);
    const d0 = P(x0, Math.max(-0.05, y0), -inset, zb), d1 = P(x1, Math.max(-0.05, y1), -inset, zb);
    const e0 = P(x0, Math.max(-0.05, y0), dk, zb), e1 = P(x1, Math.max(-0.05, y1), dk, zb);
    // corners: x bit = edge end, y bit = inner / outer, z bit = back / front (outer-front collapses onto outer-back)
    b.hexa([d0, d1, e0, e1, c0, c1, e0, e1], opts);
  }
}

export default function build(engine, ctx) {
  const r = ctx.record;
  const rnd = ctx.rng;
  // b: shadow-receiving dressing (cap underside, dormer, stovepipe, garden); sb: the stalk and everything on it,
  // which does NOT receive cast shadows (the cap's shadow-map edge on the stalk was a sawtooth and buried the
  // sunlit left flank) - the shade under the cap is painted instead as a collar course; cb: cap dome + lip
  const b = new Builder(engine, { name: r.id });
  const sb = new Builder(engine, { name: `${r.id}-stalk` });
  const cb = new Builder(engine, { name: `${r.id}-cap` });
  // cap: hi = the palette toadstool accent (crimson), mid / sh from paintRamp(v1 capRed) - paintRamp's own hi is salmon-pink
  const capPaint = paintRamp('#983634', { lightness: 0.4 });
  const capRamp = [TOWN_PALETTE.toadstool, capPaint[1], capPaint[2]];
  // door: the v1 #3e6a34 at a deeper lightness, so the lit leaf reads as a mid green (default lightness gave mint)
  const doorRamp = paintRamp('#3e6a34', { lightness: 0.3 });
  const trimRamp = paintRamp(r.style?.shutters ?? '#6b5a2f', { lightness: 0.34 });
  const plaster = ramp('plaster');
  const shadeRamp = [plaster[1], plaster[2], plaster[2]];  // the painted shade under the cap: plaster mid / sh only
  const windows = [];
  const lights = [];

  // ------------------------------------------------------------------ stalk
  STALK.forEach(([y0, y1, r0, r1], i) => {
    const foot = i === 0, collar = i === STALK.length - 1;
    sb.cylinder(r0, r1, y1 - y0, { segments: 16, at: [0, y0, 0], tones: foot ? 'moss' : collar ? shadeRamp : 'plaster', pattern: foot || collar ? 'none' : 'plaster' });
  });
  // moss tufts round the damp foot
  for (let i = 0; i < 9; i++) {
    const az = (i / 9) * Math.PI * 2 + rnd() * 0.3;
    if (Math.abs(((az - DOOR_AZ + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.5) continue;   // keep the door clear
    const s = 0.1 + rnd() * 0.08;
    sb.push(radial(az, 1.9 + rnd() * 0.04, 0)).box(s * 2.4, s, s * 1.2, { tones: rnd() < 0.5 ? 'moss' : 'mossTuft', layer: 'soft', at: [0, 0.06 + rnd() * 0.1, 0] }).pop();
  }

  // ------------------------------------------------------------------ cap (smooth dome, 32 x 9, smooth lighting normals)
  const segs = CAP.segs, nC = CAP.courses, THICK = 0.09;
  const phis = Array.from({ length: nC + 1 }, (_, k) => (Math.PI / 2) * Math.pow(k / nC, 0.92));
  const ROT = 0.0173;                                   // irrational phase: no facet edge on a symmetric (tie-prone) angle
  const segA = (j) => [((j - 0.5) / segs) * Math.PI * 2 + ROT, ((j + 0.5) / segs) * Math.PI * 2 + ROT];
  for (let k = 0; k < nC; k++) {
    const p0 = phis[k], p1 = phis[k + 1];
    for (let j = 0; j < segs; j++) {
      const [a0, a1] = segA(j);
      // corners: x bit = az a0/a1, y bit = inner/outer, z bit = lower/upper edge (no per-facet tint: smooth bands)
      cb.hexa([capPt(p0, a0, -THICK), capPt(p0, a1, -THICK), capPt(p0, a0, 0), capPt(p0, a1, 0),
        capPt(p1, a0, -THICK), capPt(p1, a1, -THICK), capPt(p1, a0, 0), capPt(p1, a1, 0)], { tones: capRamp });
    }
  }
  const domeVerts = cb.layers.solid.pos.length / 3;
  {
    const P = (az, rr, yy) => { const [sx, sz] = dir(az); return V3(CAP.x + sx * rr, yy, CAP.z + sz * rr); };
    const y = CAP.rimY;
    for (let j = 0; j < segs; j++) {
      const [a0, a1] = segA(j);
      // rolled lip: a fat ring round the rim, a step brighter (catches the light like the v1 lip)
      cb.hexa([P(a0, CAP.R - 0.1, y - 0.16), P(a1, CAP.R - 0.1, y - 0.16), P(a0, CAP.R - 0.02, y + 0.16), P(a1, CAP.R - 0.02, y + 0.16),
        P(a0, CAP.R + 0.08, y - 0.1), P(a1, CAP.R + 0.08, y - 0.1), P(a0, CAP.R + 0.1, y + 0.06), P(a1, CAP.R + 0.1, y + 0.06)], { tones: capRamp, tint: 1.04 });
      // gills: the underside cone from the lip in to the stalk
      b.hexa([P(a0, CAP.R - 0.09, y - 0.05), P(a1, CAP.R - 0.09, y - 0.05), P(a0, CAP.R - 0.09, y + 0.05), P(a1, CAP.R - 0.09, y + 0.05),
        P(a0, 1.5, y + 0.3), P(a1, 1.5, y + 0.3), P(a0, 1.5, y + 0.4), P(a1, 1.5, y + 0.4)], { tones: 'dial', tint: 0.94 });
    }
  }
  // ivory spots: raised octagonal frusta normal to the dome [az deg, phi deg, radius] (flat-shaded discs)
  const SPOTS = [[-40, 22, 0.42], [8, 30, 0.36], [50, 18, 0.3], [-14, 55, 0.4], [-78, 40, 0.3], [70, 48, 0.26],
    [-24, 12, 0.24], [30, 66, 0.24], [-60, 70, 0.22], [105, 25, 0.3], [150, 40, 0.34], [-130, 30, 0.36], [-170, 58, 0.3], [180, 18, 0.26], [-100, 15, 0.22]];
  const up = V3(0, 1, 0);
  for (const [az, ph, rad] of SPOTS) {
    const a = D(az), p = D(ph);
    const n = capNormal(p, a), at = capPt(p, a, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, n);
    b.push(new THREE.Matrix4().compose(at.addScaledVector(n, -0.03), q, V3(1, 1, 1)));
    b.cylinder(rad, rad * 0.8, 0.09, { segments: 8, tones: 'cream' });
    b.pop();
  }

  // ------------------------------------------------------------------ eyebrow dormer in the cap (faces SSE)
  {
    const az = D(22.5), d0 = 1.86, yc = capYAt(1.95) - 0.04, rr = 0.56;
    const F = M({ at: [CAP.x, 0, CAP.z] }).multiply(radial(az, d0, yc));
    b.push(F);
    const n = 6;
    for (let i = 0; i < n; i++) {                       // hood: a half-cylinder shell running back into the dome
      const t0 = (i / n) * Math.PI, t1 = ((i + 1) / n) * Math.PI;
      const P = (t, R, z) => V3(Math.cos(t) * R, Math.sin(t) * R, z);
      b.hexa([P(t0, rr - 0.07, 0.12), P(t1, rr - 0.07, 0.12), P(t0, rr, 0.12), P(t1, rr, 0.12),
        P(t0, rr - 0.07, -0.8), P(t1, rr - 0.07, -0.8), P(t0, rr, -0.8), P(t1, rr, -0.8)], { tones: capRamp, tint: 1.03 });
    }
    const ri = rr - 0.07;
    const half = Array.from({ length: 7 }, (_, i) => [Math.cos((i / 6) * Math.PI) * ri, Math.sin((i / 6) * Math.PI) * ri]);
    ringPrism(b, [...half, [-ri, -0.3], [ri, -0.3]], null, -0.6, 0.6, { tones: 'plaster', pattern: 'none' });
    b.box(0.05, 0.35, 0.05, { tones: trimRamp, at: [0, 0.02, 0.02] });
    b.box(0.86, 0.06, 0.08, { tones: trimRamp, at: [0, -0.05, 0.04] });
    b.pop();
    sb.push(F);
    const g = Array.from({ length: 7 }, (_, i) => [Math.cos((i / 6) * Math.PI) * 0.34, 0.02 + Math.sin((i / 6) * Math.PI) * 0.34]);
    ringPrism(sb, g, null, 0.0, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1] });
    sb.pop();
    const [sx, sz] = dir(az);
    windows.push(V3(CAP.x + sx * (d0 + 0.3), yc + 0.15, CAP.z + sz * (d0 + 0.3)));
  }

  // ------------------------------------------------------------------ crooked stovepipe with a conical hat
  let smoke, vanePerch;
  {
    const az = D(140), rr = 1.05;
    const [sx, sz] = dir(az);
    const px = CAP.x + sx * rr, pz = CAP.z + sz * rr, base = capYAt(rr) - 0.25;
    for (const [y0, y1, ox] of [[base, base + 0.75, 0], [base + 0.75, base + 1.12, 0.07], [base + 1.12, base + 1.45, 0.15]]) {
      b.cylinder(0.1, 0.1, y1 - y0, { segments: 8, at: [px + ox, y0, pz], tones: 'iron' });
      b.cylinder(0.13, 0.13, 0.07, { segments: 8, at: [px + ox, y1 - 0.035, pz], tones: 'iron', tint: 1.05 });
    }
    const top = base + 1.45, hx = px + 0.15;
    b.cylinder(0.05, 0.05, 0.14, { segments: 8, at: [hx, top, pz], tones: 'iron' });
    b.cylinder(0.27, 0.03, 0.22, { segments: 8, at: [hx, top + 0.12, pz], tones: 'iron', tint: 1.03 });
    smoke = V3(hx, top + 0.06, pz);
    // a little brass weathervane on the hat (v1 persona extra 'vane'): rod, arrow, tail fin, point
    const vy = top + 0.34;
    b.box(0.04, 0.34, 0.04, { tones: 'brass', at: [hx, top + 0.3, pz] });
    b.box(0.5, 0.045, 0.045, { tones: 'brass', at: [hx, vy + 0.12, pz] });
    b.prism([[0, 0], [0.16, 0.0], [0.16, 0.16]], 0.04, { tones: 'brass', at: [hx - 0.27, vy + 0.06, pz] });
    b.prism([[0, -0.07], [0.12, 0], [0, 0.07]], 0.05, { tones: 'brass', at: [hx + 0.24, vy + 0.142, pz] });
    vanePerch = V3(hx, vy + 0.2, pz);
  }

  // ------------------------------------------------------------------ the round door in its timber arch case
  // lantern (case-local): hung on a cord from under the cap rim, low and close beside the door (left = north side)
  const LAN = { x: -0.88, z: 0.5, y: 1.42 };
  sb.push(radial(DOOR_AZ, DOOR.case, 0));
  b.push(radial(DOOR_AZ, DOOR.case, 0));
  {
    const w = DOOR.w, h = DOOR.h, zf = DOOR.front;
    const outer = archPts(w + 0.36, h + 0.2);
    ringPrism(sb, outer, archPts(w, h), -0.1, zf + 0.1, { tones: 'timber', pattern: 'none' });
    caseCheeks(sb, outer, zf - 0.015, 0.3, { tones: 'plaster', pattern: 'none' });
    sb.box(0.2, 0.16, 0.06, { tones: trimRamp, at: [0, h + 0.06, zf] });                     // crown block
    sb.box(w + 0.2, 0.06, 0.3, { tones: 'ashlar', at: [0, -0.01, zf + 0.08] });              // threshold
    ringPrism(sb, archPts(w, h), null, 0.1, 0.02, { tones: '#2A1A20', layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2 });
    b.cylinder(0.36, 0.34, 0.07, { segments: 8, at: [0.05, -0.02, 0.66], tones: 'stone' });     // round doorstep stone
    const { x: lx, z: lz, y: ly } = LAN, cordTop = CAP.rimY - 0.02;
    b.box(0.05, cordTop - (ly + 0.35), 0.05, { tones: 'iron', at: [lx, ly + 0.35, lz] });
    b.cylinder(0.05, 0.14, 0.09, { segments: 8, at: [lx, ly + 0.27, lz], tones: 'iron' });
    sb.box(0.16, 0.22, 0.16, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2, at: [lx, ly + 0.05, lz] });
    b.box(0.22, 0.05, 0.22, { tones: 'iron', at: [lx, ly, lz] });
    b.box(0.07, 0.07, 0.07, { tones: 'iron', at: [lx, ly - 0.06, lz] });
  }
  b.pop();
  sb.pop();
  const [dnx, dnz] = dir(DOOR_AZ), [tnx, tnz] = [Math.cos(DOOR_AZ), -Math.sin(DOOR_AZ)];
  const atDoor = (lx, y, lz) => V3(dnx * (DOOR.case + lz) + tnx * lx, y, dnz * (DOOR.case + lz) + tnz * lx);
  {
    // the lantern pool sits low and in front of the door, reaching the doorstep and both stepping stones
    lights.push({ pos: atDoor(-0.45, 1.25, 0.95), color: TOWN_PALETTE.lampGlow, r: 3.6, kind: 'lantern', flicker: true });
    // stepping stones from the doorstep onto the door tile (36, 31) (flat, <= 0.06 tall, never on the lane)
    const s1 = atDoor(0.05, 0, 1.3), s2 = atDoor(-0.1, 0, 1.8);
    b.cylinder(0.24, 0.22, 0.05, { segments: 8, at: [s1.x, -0.01, s1.z], tones: 'stone', tint: 0.97 });
    b.cylinder(0.2, 0.18, 0.05, { segments: 8, at: [s2.x, -0.01, s2.z], tones: 'stone' });
  }

  // ------------------------------------------------------------------ porthole windows [az deg, y, radius]
  const PORTS = [[0, 1.45, 0.36], [45, 2.05, 0.24], [112.5, 1.35, 0.3], [180, 1.6, 0.32], [-112.5, 1.7, 0.26]];
  for (const [azd, y, rad] of PORTS) {
    const az = D(azd), face = stalkR(y) * APO;
    sb.push(radial(az, face, y));
    ringPrism(sb, octPts(rad + 0.09), octPts(rad), -0.04, 0.11, { tones: trimRamp });
    ringPrism(sb, octPts(rad), null, -0.04, 0.05, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1] });
    sb.box(0.05, rad * 2, 0.03, { tones: trimRamp, at: [0, -rad, 0.02] });
    if (rad >= 0.3) sb.box(rad * 2, 0.05, 0.03, { tones: trimRamp, at: [0, -0.025, 0.02] });
    if (azd === 0) flowerBox(sb, { at: [0, -rad - 0.12, 0.03], w: 0.7, seed: ctx.seed });
    else sb.box(rad * 2 + 0.12, 0.06, 0.12, { tones: 'ashlar', at: [0, -rad - 0.15, 0.05] });
    sb.pop();
    const [sx, sz] = dir(az);
    windows.push(V3(sx * (face + 0.3), y, sz * (face + 0.3)));
  }

  // ------------------------------------------------------------------ briar roses climbing the right flank
  {
    let az = D(76), y = 0.35;
    for (let i = 0; i < 15 && y < 2.65; i++) {
      const s = 0.13 + rnd() * 0.07;
      sb.push(radial(az, stalkR(y) + 0.02, y));
      sb.box(s * 1.3, s, 0.1, { tones: 'leaf', layer: 'soft', at: [0, -s / 2, 0.03] });
      if (i % 3 === 1 || rnd() < 0.2) sb.box(0.08, 0.08, 0.08, { tones: TOWN_PALETTE.flowerRed, layer: 'soft', at: [(rnd() - 0.5) * s, -0.02, 0.09] });
      sb.pop();
      y += 0.15;
      az += D((rnd() - 0.45) * 16);
    }
  }
  // garden: rose bush at the right foot, baby toadstools, herb pots by the door, a log stool at the back
  {
    const bush = { x: 1.7, z: 1.35 };
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 0.32, s = 0.2 + rnd() * 0.16;
      b.box(s, s * 0.9, s, { tones: 'leaf', layer: 'soft', at: [bush.x + Math.cos(a) * d, 0.05 + rnd() * 0.35, bush.z + Math.sin(a) * d] });
    }
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, d = 0.15 + rnd() * 0.2;
      b.box(0.08, 0.08, 0.08, { tones: TOWN_PALETTE.flowerRed, layer: 'soft', at: [bush.x + Math.cos(a) * d, 0.38 + rnd() * 0.2, bush.z + Math.sin(a) * d + 0.08] });
    }
    const toad = (x, z, h, cr) => {
      b.cylinder(0.05, 0.045, h, { segments: 8, at: [x, -0.02, z], tones: 'plaster' });
      b.cylinder(cr, 0.03, cr * 0.75, { segments: 8, at: [x, h - 0.04, z], tones: capRamp });
      b.box(0.05, 0.03, 0.05, { tones: 'cream', at: [x - cr * 0.3, h + cr * 0.32 - 0.04, z + cr * 0.25] });
    };
    toad(-1.05, 1.78, 0.26, 0.16);
    toad(-0.7, 1.95, 0.18, 0.12);
    toad(-1.9, -1.0, 0.22, 0.14);
    toad(-1.75, -1.35, 0.15, 0.1);
    toad(0.9, -2.3, 0.2, 0.13);
    toad(1.1, -2.1, 0.14, 0.1);
    for (const [x, z, s] of [[-0.55, 1.95, 1], [-0.25, 2.1, 0.8], [0.1, 1.98, 0.9]]) {
      b.cylinder(0.15 * s, 0.11 * s, 0.24 * s, { segments: 8, at: [x, -0.02, z], tones: 'brick' });
      b.box(0.24 * s, 0.1 * s, 0.22 * s, { tones: 'leaf', layer: 'soft', at: [x, 0.2 * s, z] });
      b.box(0.12 * s, 0.1 * s, 0.12 * s, { tones: 'leaf', layer: 'soft', tint: 1.05, at: [x - 0.03, 0.29 * s, z + 0.03] });
    }
    b.push(M({ at: [-0.3, 0.17, -2.4], rz: Math.PI / 2 })).cylinder(0.18, 0.18, 0.7, { segments: 8, at: [0, -0.35, 0], tones: 'plank' }).pop();
  }

  const group = b.build();
  group.add(sb.build({ receiveShadow: false }));
  // cap: casts (shades the ground), receives nothing (its grazing lip faces self-shadowed into flickering acne)
  const capG = cb.build({ receiveShadow: false });
  capG.traverse((o) => { if (o.isMesh) { smoothCap(o, domeVerts); o.material = capMaterial(engine); } });
  group.add(capG);
  // door leaf (own mesh, kit material): right hinge, swings OUTWARD (the round stalk is solid behind it)
  const leaf = kitDoor(engine, { w: DOOR.w, h: DOOR.h, kind: 'arched', tones: doorRamp, hinge: 'right', name: 'house-7-door' });
  leaf.leaf.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  // a round glowing peephole in the leaf (glass layer, flame flicker): the entrance reads at night even when the
  // town's light budget culls the lantern's point light, and it can't hide under the cap lip like a fanlight did
  {
    const pb = new Builder(engine, { name: 'house-7-peep' });
    pb.push(M({ at: [-DOOR.w / 2, 1.24, 0] }));               // between the handle and the upper strap hinge
    // iron ring on the glass layer too (no glow: toon iron): the peephole costs one draw call
    ringPrism(pb, octPts(0.165), octPts(0.115), -0.01, 0.04, { tones: 'iron', layer: 'glass' });
    ringPrism(pb, octPts(0.115), null, -0.01, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2 });
    pb.pop();
    leaf.pivot.add(pb.build({ receiveShadow: false }));
  }
  const holder = new THREE.Group();
  holder.applyMatrix4(radial(DOOR_AZ, DOOR.case, 0));
  leaf.pivot.position.set(DOOR.w / 2, 0.0, DOOR.z);
  holder.add(leaf.pivot);
  group.add(holder);
  const open = (f) => { leaf.pivot.rotation.y = Math.max(0, Math.min(1, f)) * 1.6; };
  group.position.set(S.x, 0, S.z);
  group.updateMatrixWorld(true);

  const W3 = (v) => toWorld(group, v);
  const winW = windows.map(W3);
  const glowCol = TOWN_PALETTE.glow[1];
  const doorPoint = W3(atDoor(0, 0, DOOR.front));
  return {
    group,
    anchors: {
      // normal / point: the REAL door (28 deg south of west), for NPCs walking to and facing it
      doors: [{ id: `${r.id}-door`, pivot: leaf.pivot, open, normal: [dnx, dnz], point: { x: doorPoint.x, z: doorPoint.z } }],
      chimneys: [W3(smoke)],
      windows: winW.map((pos, i) => ({ id: `${r.id}-win${i}`, pos })),
      lights: [...lights.map((l) => ({ ...l, pos: W3(l.pos) })), ...winW.slice(1, 3).map((pos) => ({ pos, color: glowCol, r: 1.6, kind: 'window' }))],
      perches: [W3(V3(CAP.x, CAP.rimY + CAP.H + 0.08, CAP.z)), W3(vanePerch)],
      spots: { doorstep: W3(atDoor(0, 0.05, 0.8)) },
    },
    api: {
      setDoor: (f) => open(f),
      setLit: (on) => group.traverse((o) => o.userData.layer === 'glass' && ctx.kit.setGlowLit(o, on)),
    },
    stats: {},
  };
}
