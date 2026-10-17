// house-6 — "The Lantern-maker's" (Candlewick). Owner: house-6 agent. Contract: docs/TOWN.md §4 / §6.
//
// DESIGN NOTE (v1: pipgws packages/assets/scripts/houses/house-6.ts, read only)
//   Signature: a TALL, VERY STEEP gable (57°) turned toward the camera, soot-dark violet weatherboards with
//   bone-white trim, a fish-scale plum slate roof, and LANTERNS EVERYWHERE: swags of coloured paper lanterns
//   strung down both bone bargeboards, a great brass lantern hung from a scrolled iron bracket as the trade sign,
//   a quatrefoil light high in the gable, a plum pent canopy over the candle-shop window with more lanterns hung
//   from its edge, wrapping round the south-west corner over the (west) side door. "Dark house, many small lights."
//   At 640x360 it must read as: a dark narrow A-frame with a cream V outline, a gold lantern at its heart, a
//   glowing shop window under a lantern-fringed canopy. Distinct from house-5 (pale plaster, blue roof) and
//   house-7 (the toadstool).
//   Palette rows (docs/TOWN.md §3): walls = iron + 'boards' (soot-dark weatherboards, nearest row to v1 BOARDS),
//   trim = cream, roof + canopy = plum (real tile geometry: tinted courses on the main roof, chamfered fish-scale
//   tiles on the canopy, which the gameplay camera sees from above), door = paintRamp(v1 '#a8782a') mustard, side shutters =
//   paintRamp(style.shutters '#2f4f4f'), plinth / chimney = stone, sign = brass + iron, lanterns = accent
//   singles (bannerGold, pumpkin, flowerRed, flowerViolet, ivory) glowing glow / fire / accent at night,
//   candles = ivory + berry, barrel / crate = plank.
//   Layout: footprint x 40..44, z 20..25 (4x5, facing west); door in the west wall at its south end (door tile
//   39,24). Local frame here = world axes, origin at the footprint centre (42, 0, 22.5): x east, z south.
//   Side-door readability at yaw 0: the canopy wraps over the door tile with a mitred hip (roof seen from above) and
//   a lantern-shaped tin shop sign hangs over the door at 3.6-4.3 m (above house-7's cap, stovepipe and vane).
//   Swags: 2-texel rope prisms in catenary loops, 4 big lanterns per side. Chimney on the west slope near the front.
import * as THREE from 'three';
import { Builder, M, wallWithOpenings, window_, chimney, doorway, setGlowLit } from '../kit.js';
import { TOWN_PALETTE as P, paintRamp } from '../palette.js';
import { toWorld } from '../api.js';
import { rng } from '../../core/noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- dimensions (metres, local frame)
const HX = 1.8;            // half width (east-west), walls inset 0.2 from the footprint
const HZ = 2.44;           // half depth (north-south): south wall at z = +2.44 (footprint edge 2.5)
const T = 0.2;             // wall thickness
const EAVE = 3.55;         // two low storeys: shop + lancet floor
const RIDGE = 6.35;        // side-row ridge limit 6.5
const OVER = 0.25;         // eave overhang (east/west)
const GOV = 0.22;          // gable overhang (south/north)
const PLINTH = 0.24;       // plinth top = floor / door sill
const DZ = 1.86;           // shop-sign arm (local z; world 24.36, over the door tile row)
// THE ENTRY PORCH (critic round 3): a small gabled vestibule projecting 1.05 m west off the door wall, its door in
// its SOUTH face (facing the yaw-0 camera) and opening onto the south half of the game door tile 39,24.
const PXW = -HX - 1.05, PXE = -HX, PC = (PXW + PXE) / 2;   // porch outer west face / house wall / centre (x)
const PZN = 0.9, PZS = 1.95, PZC = (PZN + PZS) / 2;        // porch north / south (door) faces (z; world 23.4 / 24.45)
const PT = 0.12;           // porch wall thickness
const PE = 2.55;           // porch eave (wall top)
const PH = (PXE - PXW) / 2;                                 // porch half width
const PTAN = Math.tan(50 * Math.PI / 180);                  // 50 deg hood: tucks under the main eave (3.16 at x -2.05)
const PRIDGE = PE + PH * PTAN;
const DW = 0.7, DH = 1.8;  // porch door opening (door + lintel stay below the lantern string)
const porchTop = (x) => PE + (PH - Math.abs(x - PC)) * PTAN;
const TAN = (RIDGE - EAVE) / HX;
const roofTop = (p) => EAVE + (HX - Math.abs(p)) * TAN;   // top line of the roof at the gable end (p = local x)

// lantern colours: [day tone (accent single), night glow]
const LAMP = [
  [P.bannerGold, P.lampGlow], [P.pumpkin, P.fireGlow], [P.flowerRed, P.flowerRed],
  [P.ivory, P.glow[0]], [P.flowerViolet, P.flowerViolet], [P.pumpkin, P.fireGlow],
];

/** Hanging paper lantern: hanger from yTop down `drop`, iron cap, coloured glowing body, iron foot. Returns the body centre y. */
function paperLantern(b, x, yTop, z, col, { w = 0.13, h = 0.16, drop = 0.08 } = {}) {
  const capY = yTop - drop - 0.035;
  b.box(0.035, drop + 0.02, 0.035, { tones: 'iron', at: [x, yTop - drop, z], layer: 'soft' });
  b.box(w + 0.04, 0.035, w + 0.04, { tones: 'iron', at: [x, capY, z] });
  b.box(w, h, w, { tones: col[0], layer: 'glass', glow: col[1], glowKind: 2, at: [x, capY - h, z] });
  b.box(w * 0.6, 0.035, w * 0.6, { tones: 'iron', at: [x, capY - h - 0.035, z] });
  return capY - h / 2;
}

/** Box between two points in the XY plane at depth z (a rope / rail / brace segment). */
function segXY(b, [x0, y0], [x1, y1], z, size, opts) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  b.box(len, size, size, { ...opts, origin: 'center', at: [(x0 + x1) / 2, (y0 + y1) / 2, z], rz: Math.atan2(y1 - y0, x1 - x0) });
}

/** Push the triangles of planar polygon q (Vector3[]) into out, fan-triangulated and wound to face dir. */
function faceInto(out, q, dir) {
  const n = new THREE.Vector3().subVectors(q[1], q[0]).cross(new THREE.Vector3().subVectors(q[2], q[0]));
  const flip = n.dot(dir) < 0;
  for (let i = 1; i < q.length - 1; i++) {
    const [p1, p2] = flip ? [q[i + 1], q[i]] : [q[i], q[i + 1]];
    out.push(q[0].x, q[0].y, q[0].z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  }
}

/** Sutherland-Hodgman clip of a 2D polygon [[a, u], ...] to d(p) >= 0. Points ON the cut get .cut = true. */
function clipPoly(poly, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], dp = d(P), dq = d(Q);
    if (dp >= 0) out.push(dp < 1e-9 ? Object.assign([P[0], P[1]], { cut: true }) : P);
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq);
      out.push(Object.assign([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t], { cut: true }));
    }
  }
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
}

/**
 * Fish-scale slate as real geometry: rows of tiles on a slope frame (origin = eave corner, A along the eave,
 * U up the slope, outward normal N = A x U). Each tile's lower edge is lifted `lift` (>= the outline depth threshold,
 * 0.053 m at vh 12, so every course gets ONE continuous dark line) and its lower corners are chamfered, so every
 * course edge becomes a row of scallops. Rows are staggered by half a tile. An underlay slab fills the notches.
 * `clip(a, u)` >= 0 keeps a point: tiles and underlay are cut exactly along it (a mitred hip, no ragged tile drop).
 */
function tiledSlope(b, { origin, A, U, a0, a1, len, course = 0.25, tile = 0.22, lift = 0.085, thick = 0.12,
  chamfer = [0.07, 0.08], tones = 'plum', closeEnds = true, clip = null, straightFirst = false }) {
  const N = new THREE.Vector3().crossVectors(A, U).normalize();
  const Pt = (a, u, n) => origin.clone().addScaledVector(A, a).addScaledVector(U, u).addScaledVector(N, n);
  const d = clip ? (p) => clip(p[0], p[1]) : () => 1;
  const near = (x, y) => Math.abs(x - y) < 1e-6;
  // one prism: polygon (a, u) between n = nTop(u) and nTop(u) - thick; side faces on the edges skip(pa, pb) lets through
  const slab = (poly, nTop, skip) => {
    if (poly.length < 3) return;
    const out = [];
    const top = poly.map(([a, u]) => Pt(a, u, nTop(u)));
    const bot = poly.map(([a, u]) => Pt(a, u, nTop(u) - thick));
    faceInto(out, top, N);
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length, pa = poly[i], pb = poly[j];
      if ((pa.cut && pb.cut) || skip(pa, pb)) continue;
      const e = new THREE.Vector3().subVectors(top[j], top[i]);
      faceInto(out, [top[i], top[j], bot[j], bot[i]], e.cross(N));   // CCW polygon: outward = edge x N
    }
    b.tris(out, { tones, pattern: 'none' });
  };
  // underlay (its top at n = 0): only the eave edge and the ends get faces
  slab(clipPoly([[a0, 0], [a1, 0], [a1, len], [a0, len]], d), () => 0, (pa, pb) => near(pa[1], len) && near(pb[1], len) || (!closeEnds && near(pa[0], pb[0])));
  const rows = Math.max(1, Math.round(len / course)), cl = len / rows;
  for (let k = 0; k < rows; k++) {
    const u0 = k * cl, u1 = (k + 1) * cl;
    const nAt = (u) => lift * (u1 - u) / (u1 - u0);
    const off = (k % 2) * tile * 0.5;
    for (let ta = a0 - off; ta < a1 - 1e-6; ta += tile) {
      const s = Math.max(a0, ta), e = Math.min(a1, ta + tile);
      if (e - s < 0.04) continue;
      const ch = straightFirst && k === 0 ? 0 : chamfer[0];
      const cs = ta >= a0 - 1e-6 ? ch : 0, ce = ta + tile <= a1 + 1e-6 ? ch : 0, cu = chamfer[1];
      let poly = [];                           // (a, u), counter-clockwise seen from +N
      if (cs) poly.push([s, u0 + cu], [s + cs, u0]); else poly.push([s, u0]);
      if (ce) poly.push([e - ce, u0], [e, u0 + cu]); else poly.push([e, u0]);
      poly.push([e, u1], [s, u1]);
      poly = clipPoly(poly, d);
      slab(poly, nAt, (pa, pb) => {
        if (near(pa[1], u1) && near(pb[1], u1)) return true;                       // upper edge: under the next row
        if (near(pa[0], pb[0])) {
          const end = near(pa[0], a0) || near(pa[0], a1);
          return end ? !closeEnds : true;                                          // shared side between tiles
        }
        return false;
      });
    }
  }
  return { N, Pt };
}

/** A rope / string of thickness w along a polyline in the XY plane at depth z: ONE closed prism (no overlapping joints). */
function ropeXY(b, pts, z, w, depth, opts) {
  if (pts[pts.length - 1][0] < pts[0][0]) pts = pts.slice().reverse();   // keep the outline CCW (a CW one lost its caps)
  const nrm = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  const up = pts.map((p, i) => [p[0] + nrm[i][0] * w / 2, p[1] + nrm[i][1] * w / 2]);
  const dn = pts.map((p, i) => [p[0] - nrm[i][0] * w / 2, p[1] - nrm[i][1] * w / 2]).reverse();
  b.prism([...up, ...dn], depth, { ...opts, at: [0, 0, z] });
}

/** The glazed mustard door leaf (own mesh: solid + glass), hinge at local x = 0, leaf along +x, front at z = 0. */
function makeDoor(engine, { w, h, tones }) {
  const b = new Builder(engine, { name: 'house-6-door' });
  const th = 0.06, pr = th + 0.07;                      // panels / bars stand 1 texel proud of the leaf
  b.box(w, h, th, { tones, pattern: 'vboards', scale: 0.6, at: [w / 2, 0, 0] });
  const k = h / 2.0;                                     // proportions authored for a 2.0 m leaf
  for (const px of [0.27, 0.73]) b.box(w * 0.3, 0.62 * k, pr, { tones, tint: 1.04, pattern: 'none', at: [px * w, 0.22 * k, 0] });
  b.box(w * 0.8, 0.07, pr, { tones, tint: 0.96, at: [w / 2, 0.98 * k, 0] });                 // lock rail
  // the glazed upper half (glows at night like the shop)
  const gy0 = 1.18 * k, gh = 0.6 * k, gw = w * 0.62;
  b.box(gw, gh, th + 0.02, { tones: 'glass', layer: 'glass', glow: P.glow[1], glowKind: 1, at: [w / 2, gy0, 0] });
  b.box(0.05, gh + 0.06, pr, { tones, at: [w / 2, gy0 - 0.03, 0] });
  b.box(gw, 0.05, pr, { tones, at: [w / 2, gy0 + gh / 2 - 0.025, 0] });
  for (const sx of [-1, 1]) b.box(0.06, gh + 0.06, pr, { tones, at: [w / 2 + sx * (gw / 2 + 0.03), gy0 - 0.03, 0] });
  b.box(gw + 0.12, 0.06, pr, { tones, at: [w / 2, gy0 + gh, 0] });
  for (const hy of [0.32, h - 0.42]) b.box(w * 0.5, 0.05, pr + 0.01, { tones: 'iron', at: [w * 0.25, hy, 0] });   // strap hinges
  b.box(0.07, 0.07, pr + 0.06, { tones: 'brass', at: [w - 0.12, 0.98 * k, 0] });                                    // knob
  const leaf = b.build({ name: 'house-6-door' });
  leaf.position.z = -th / 2;
  const pivot = new THREE.Group();
  pivot.name = 'house-6-door-pivot';
  pivot.add(leaf);
  const open = (f) => { pivot.rotation.y = Math.max(0, Math.min(1, f)) * 1.75; };
  return { pivot, open };
}

export default function build(engine, ctx) {
  const r = ctx.record;
  const R = rng(ctx.seed);
  // soot-dark weatherboards: the iron ramp is the palette row nearest v1 BOARDS (#272030..#56495e); a lifted
  // paintRamp of the v1 hex read as the same purple as the plum roof (A/B in shots/town-house-6/ab-*.png)
  const BOARDS = 'iron';
  const DOOR = paintRamp('#a8782a');                           // v1 door paint: mustard gold
  const SHUT = paintRamp(r.style.shutters);                    // style shutters #2f4f4f (side windows)
  const b = new Builder(engine, { name: r.id });
  const wall = { tones: BOARDS, pattern: 'boards' };
  const trim = { tones: 'cream', pattern: 'none' };
  const windows = [], lights = [], perches = [];

  // ---------------------------------------------------------------- plinth, walls, corner boards
  b.box(2 * HX + 0.1, PLINTH + 0.06, 2 * HZ + 0.1, { tones: 'stone', pattern: 'rubble', at: [0, -0.06, 0] });
  // west wall (door wall): local x = world z, local +z = world -x
  const FW = M({ at: [-HX, 0, 0], ry: -Math.PI / 2 }), FE = M({ at: [HX, 0, 0], ry: Math.PI / 2 }), FN = M({ at: [0, 0, -HZ], ry: Math.PI });
  b.push(FW);
  // the shop door now lives in the entry porch's south face (below); the house wall behind the porch is plain
  b.box(2 * HZ, EAVE, T, { ...wall, at: [0, 0, -T / 2] });
  windows.push({ id: 'w-up', f: FW, ...window_(b, { at: [-0.75, 2.95, 0], w: 0.42, h: 0.52, panes: [1, 2], shutters: SHUT }) });
  windows.push({ id: 'w-low', f: FW, ...window_(b, { at: [-0.75, 1.45, 0], w: 0.5, h: 0.62, shutters: SHUT }) });
  b.pop();
  b.push(FE);                                               // local x = world -z
  b.box(2 * HZ, EAVE, T, { ...wall, at: [0, 0, -T / 2] });
  windows.push({ id: 'e-low', f: FE, ...window_(b, { at: [0.2, 1.45, 0], w: 0.55, h: 0.66, shutters: SHUT }) });
  windows.push({ id: 'e-up', f: FE, ...window_(b, { at: [0.2, 2.95, 0], w: 0.42, h: 0.5, panes: [1, 2], shutters: SHUT }) });
  b.pop();
  b.push(FN);
  b.box(2 * (HX - T), EAVE, T, { ...wall, at: [0, 0, -T / 2] });
  windows.push({ id: 'n-up', f: FN, ...window_(b, { at: [0, 2.6, 0], w: 0.45, h: 0.6, panes: [1, 2] }) });
  b.pop();
  // south front: the candle-shop window is a real recess
  const SW0 = -1.1, SW1 = 1.1, SY0 = 0.66, SY1 = 1.74;
  b.push(M({ at: [0, 0, HZ] }));
  wallWithOpenings(b, { x0: -(HX - T), x1: HX - T, y0: 0, y1: EAVE, thick: T, openings: [{ x: 0, y: SY0, w: SW1 - SW0, h: SY1 - SY0 }], ...wall });
  b.pop();
  for (const [cx, cz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    b.box(0.16, EAVE - PLINTH, 0.16, { ...trim, at: [cx * (HX - 0.04), PLINTH, cz * (HZ - 0.04)] });
  }

  // ---------------------------------------------------------------- the candle shop (south, ground floor)
  {
    const zb = HZ - T + 0.012;                                 // interior back (glows at night)
    b.box(SW1 - SW0, SY1 - SY0, 0.02, { tones: 'glass', layer: 'glass', glow: P.glow[1], glowKind: 1, at: [0, SY0, zb] });
    const shelfY = 1.06;          // >= 3 texels below the glazing bar on screen (1.16 left a 1-texel sliver that crawled)
    b.box(SW1 - SW0, 0.045, 0.13, { tones: 'timber', at: [0, shelfY, zb + 0.075] });
    const waxes = [P.ivory, P.ivory, P.ivory, P.berry, P.ivory, P.flowerWhite];
    for (const [base, n, hmax] of [[SY0, 9, 0.3], [shelfY + 0.045, 7, 0.17]]) {
      for (let i = 0; i < n; i++) {
        if (R() < 0.15) continue;
        const x = SW0 + 0.12 + (i * (SW1 - SW0 - 0.24)) / (n - 1) + (R() - 0.5) * 0.04;
        const h = 0.1 + R() * (hmax - 0.1);
        const wx = R() < 0.3 ? 0.12 : 0.09;
        b.box(wx, h, 0.09, { tones: waxes[Math.floor(R() * waxes.length)], at: [x, base, zb + 0.095] });   // front flush with the shelf front (zb + 0.14): no shelf-top sliver
        b.box(0.05, 0.07, 0.05, { tones: P.glow[0], layer: 'glass', glow: P.glow[0], glowKind: 2, at: [x, base + h, zb + 0.095] });
      }
    }
    // bone frame, glazing bars, deep sill
    const fz = HZ + 0.02;
    b.box(SW1 - SW0 + 0.2, 0.1, 0.1, { ...trim, at: [0, SY1, fz] });
    for (const sx of [-1, 1]) b.box(0.1, SY1 - SY0, 0.1, { ...trim, at: [sx * (SW1 + 0.05), SY0, fz] });
    for (const bx of [-0.55, 0, 0.55]) b.box(0.05, SY1 - SY0, 0.05, { ...trim, at: [bx, SY0, HZ - 0.03] });
    b.box(SW1 - SW0, 0.05, 0.05, { ...trim, at: [0, 1.46, HZ - 0.03] });   // transom bar clear of the shelf candles (no flame-tip slivers)
    b.box(SW1 - SW0 + 0.36, 0.08, 0.22, { tones: 'cream', tint: 0.97, at: [0, SY0 - 0.08, HZ + 0.07] });
    windows.push({ id: 'shop', glowPos: V(0, 1.2, HZ + 0.35) });
  }

  // ---------------------------------------------------------------- the pent canopy over the candle-shop window
  const CY0 = 2.6, CY1 = 2.3, CD = 0.56, CT = 0.11;          // wall line height, edge height, depth, thickness
  {
    // south canopy: from just past the south-west corner to past the east corner (the west wing over the old side
    // door became the entry porch)
    const xa = -HX - 0.1, xb = HX + 0.12, z1 = HZ + CD;
    const cl = Math.hypot(CD, CY0 - CY1);
    tiledSlope(b, { len: cl, course: 0.21, tile: 0.3, chamfer: [0.1, 0.09], lift: 0.07, thick: CT, straightFirst: true,
      origin: V(xa, CY1, z1), A: V(1, 0, 0), U: V(0, CY0 - CY1, -CD).normalize(), a0: 0, a1: xb - xa });
    // bone-white fascia under the edge; its top tucks into the canopy slab (no sub-texel second edge)
    b.box(xb - xa, 0.16, 0.06, { ...trim, at: [(xa + xb) / 2, CY1 - CT - 0.08, z1 - 0.08] });
    for (const bx of [-1.45, 1.45]) {
      b.push(M({ at: [bx, 0, 0], ry: -Math.PI / 2 }));
      segXY(b, [HZ, 1.95], [HZ + CD - 0.12, CY1 - 0.1], 0, 0.07, { tones: 'timber' });
      b.pop();
    }
    // lanterns hung from the canopy edge (v1: a row of five)
    const hangY = CY1 - CT + 0.03;
    [-1.62, -0.82, 0, 0.82, 1.62].forEach((x, k) => {
      const drop = [0.16, 0.06, 0.2, 0.08, 0.14][k];
      const cy = paperLantern(b, x, hangY, z1 - 0.12, LAMP[k], { drop: 0.04 + drop });
      // only the east end lights the ground (the west end is next to house-7's red cap: no saturated pool on it)
      if (k === 4) lights.push({ pos: V(x, cy, z1), color: LAMP[k][1], r: 1.5, kind: 'lantern', flicker: true });
    });
  }

  // ---------------------------------------------------------------- THE ENTRY PORCH (the side door that reads)
  // A gabled vestibule on the west wall, a mini version of the house front: soot boards, bone corner boards and
  // bargeboard V, fish-scale plum hood, and the mustard glazed door in its south face looking at the camera, a swag
  // of coloured lanterns across the gable foot. It opens onto the south half of the door tile (39, 24.45..25).
  {
    // stone plinth under the whole vestibule = its floor (door sill at PLINTH), one step in front of the door
    b.box(PXE - PXW + 0.04, PLINTH + 0.06, PZS - PZN + 0.04, { tones: 'stone', pattern: 'rubble', at: [PC - 0.02, -0.06, PZC] });
    b.box(DW + 0.34, 0.12, 0.36, { tones: 'ashlar', at: [PC, 0, PZS + 0.2] });
    // walls: west (with a little arched window for the side / iso views), north, south (the door wall)
    b.box(PT, PE, PZS - PZN, { ...wall, at: [PXW + PT / 2, 0, PZC] });
    b.box(PXE - PXW - PT, PE, PT, { ...wall, at: [(PXW + PT + PXE) / 2, 0, PZN + PT / 2] });
    b.push(M({ at: [PXW, 0, PZC + 0.02], ry: -Math.PI / 2 }));
    windows.push({ id: 'porch-w', f: M({ at: [PXW, 0, PZC + 0.02], ry: -Math.PI / 2 }),
      ...window_(b, { at: [0, 1.5, 0], w: 0.3, h: 0.42, panes: [1, 2], arch: true, frame: 'cream', sill: false }) });   // no sill: edge-on it was a floating cream block at yaw 0
    b.pop();
    b.push(M({ at: [0, 0, PZS] }));
    wallWithOpenings(b, { x0: PXW, x1: PXE, y0: 0, y1: PE, thick: PT, openings: [{ x: PC, y: 0, w: DW, h: PLINTH + DH }], ...wall });
    doorway(b, { at: [PC, PLINTH, 0], w: DW, h: DH, thick: PT, hood: 'lintel', frame: 'cream' });
    b.pop();
    // bone corner boards (the SE one is the house corner board's twin, standing proud of the house wall)
    for (const [cx, cz] of [[PXW + 0.07, PZS - 0.04], [PXW + 0.07, PZN + 0.07]]) b.box(0.15, PE - PLINTH, 0.15, { ...trim, at: [cx, PLINTH, cz] });
    // the hood: two fish-scale slopes, ridge along z (gable to the camera); the east slope dies into the house wall
    {
      const L0 = PZN - 0.06, L1 = PZS + 0.16;                 // north / south gable overhangs
      const th = Math.atan(PTAN);
      for (const s of [-1, 1]) {
        const over = s < 0 ? 0.1 : -0.02;                     // west eave overhang; east edge buried 2 cm in the wall
        const run = PH + over, y0 = PE - over * PTAN, len = run / Math.cos(th);
        const A = V(0, 0, -s);                                 // a = (z - PZC) * (s < 0 ? 1 : -1)
        const [a0, a1] = s < 0 ? [L0 - PZC, L1 - PZC] : [PZC - L1, PZC - L0];
        tiledSlope(b, { origin: V(PC + s * run, y0, PZC), A, U: V(-s * Math.cos(th), Math.sin(th), 0), a0, a1, len,
          course: 0.22, tile: 0.26, chamfer: [0.08, 0.07], lift: 0.075, thick: 0.11, closeEnds: true });
      }
      b.box(0.14, 0.09, L1 - L0, { tones: 'plum', tint: 0.9, at: [PC, PRIDGE - 0.02, (L0 + L1) / 2] });   // ridge cap
      const tri = (z) => [V(PXW, PE, z), V(PXE, PE, z), V(PC, PRIDGE - 0.03, z)];
      const [s0, s1] = [tri(PZS), tri(PZN)];
      b.hexa([s0[0], s0[1], s0[2], s0[2], s1[0], s1[1], s1[2], s1[2]], { ...wall });
      // bone bargeboards (the small cream V under the big one), a finial, a glowing diamond light in the gable
      const bz = L1 + 0.02;
      for (const s of [-1, 1]) {
        const pe = PC + s * (s < 0 ? PH + 0.1 : PH - 0.02);
        const tl = (x) => porchTop(x) + 0.14, bl = (x) => porchTop(x) - 0.12;
        b.hexa([V(pe, bl(pe), bz - 0.05), V(PC, bl(PC), bz - 0.05), V(pe, tl(pe), bz - 0.05), V(PC, tl(PC), bz - 0.05),
          V(pe, bl(pe), bz + 0.04), V(PC, bl(PC), bz + 0.04), V(pe, tl(pe), bz + 0.04), V(PC, tl(PC), bz + 0.04)], trim);
      }
      b.box(0.07, 0.42, 0.07, { ...trim, at: [PC, PRIDGE - 0.16, bz + 0.02] });
      b.box(0.05, 0.1, 0.05, { tones: 'brass', at: [PC, PRIDGE + 0.26, bz + 0.02] });
      perches.push(V(PC, PRIDGE + 0.16, bz));
      b.push(M({ at: [PC, PE + 0.24, PZS + 0.01], rz: Math.PI / 4 }));
      b.box(0.2, 0.2, 0.04, { ...trim, at: [0, -0.1, 0] });
      b.box(0.12, 0.12, 0.03, { tones: 'glass', layer: 'glass', glow: P.glow[1], at: [0, -0.06, 0.02] });
      b.pop();
      windows.push({ id: 'porch-diamond', glowPos: V(PC, PE + 0.24, PZS + 0.3) });
    }
    // a swag of coloured paper lanterns across the porch front, from bargeboard foot to bargeboard foot
    {
      const ROPE = [P.plank[0], P.plank[1], P.plank[1]];
      const zr = PZS + 0.2, ya = PE - 0.04, xa = PXW - 0.04, xb = PXE - 0.04, sag = 0.14, n = 10, line = [];
      const ch = (t) => (Math.cosh((t - 0.5) * 2.2) - Math.cosh(1.1)) / (Math.cosh(1.1) - 1);
      for (let j = 0; j <= n; j++) line.push([xa + (xb - xa) * j / n, ya + ch(j / n) * sag]);
      ropeXY(b, line, zr, 0.055, 0.055, { tones: ROPE });
      [[0.22, 2], [0.5, 0], [0.78, 4]].forEach(([t, k]) => {
        const x = xa + (xb - xa) * t, y = ya + ch(t) * sag;
        paperLantern(b, x, y + 0.01, zr, LAMP[k], { w: 0.14, h: 0.17, drop: 0.03 });
      });
      // the porch's pool light sits AT the swag (light from above: the door face only grazes, no hard disc on it;
      // at 1.5 m height in front it painted a disc on the leaf) and pools on the step / door tile. hug: false = not
      // pulled back to the record's west wall plane.
      lights.push({ pos: V(PC, 2.3, PZS + 0.25), color: P.lampGlow, r: 2.6, kind: 'lantern', flicker: true, hug: false });
    }
    // the lantern-shaped tin shop sign, hung from an iron arm rising out of the west roof slope, above the porch
    {
      const sx = -2.36, ay = 4.4;
      b.box(0.07, 0.62, 0.07, { tones: 'iron', at: [-1.5, ay - 0.54, DZ] });                   // mount post out of the slope
      b.box(1.04, 0.05, 0.05, { tones: 'iron', at: [-2.0, ay, DZ] });                          // arm
      b.box(0.05, 0.12, 0.05, { tones: 'iron', at: [-2.5, ay, DZ] });                          // scroll tip
      b.box(0.14, 0.05, 0.05, { tones: 'iron', at: [-2.45, ay + 0.12, DZ] });
      b.push(M({ at: [0, 0, DZ] }));
      segXY(b, [-1.5, ay + 0.06], [-1.9, ay + 0.2], 0, 0.05, { tones: 'iron' });               // top scroll
      b.pop();
      b.box(0.035, 0.07, 0.035, { tones: 'iron', at: [sx, ay - 0.07, DZ] });                  // hook
      const y0 = ay - 0.07 - 0.7, z = DZ, dep = 0.05, gold = P.brass[0];
      b.box(0.1, 0.08, dep, { tones: gold, at: [sx, y0 + 0.62, z] });                          // ring
      b.prism([[-0.22, 0.46], [0.22, 0.46], [0.08, 0.62], [-0.08, 0.62]], dep, { tones: gold, at: [sx, y0, z] });   // cap
      b.prism([[-0.1, 0], [0.1, 0], [0.2, 0.12], [-0.2, 0.12]], dep, { tones: gold, at: [sx, y0, z] });            // foot
      for (const k of [-1, 1]) b.box(0.06, 0.34, dep, { tones: 'brass', at: [sx + k * 0.14, y0 + 0.12, z] });      // posts
      b.box(0.22, 0.04, dep, { tones: 'brass', at: [sx, y0 + 0.42, z] });
      b.box(0.22, 0.04, dep, { tones: 'brass', at: [sx, y0 + 0.12, z] });
      // the sign glows (glass layer) but casts no PointLight any more: its 2.6 m pool reached house-7's cap
      b.box(0.22, 0.26, dep, { tones: P.glow[0], layer: 'glass', glow: P.lampGlow, glowKind: 1, at: [sx, y0 + 0.16, z] });
      perches.push(V(-2.45, ay + 0.1, DZ));
    }
  }

  // ---------------------------------------------------------------- lanterns hung along the side eaves (v1)
  {
    const ey = EAVE - OVER * TAN - 0.02;                       // eave edge height
    for (const [x, z, k, drop] of [[-HX - 0.12, -0.35, 1, 0.12], [-HX - 0.12, -1.55, 4, 0.22], [HX + 0.12, 0.2, 0, 0.16]]) {
      paperLantern(b, x, ey + 0.1, z, LAMP[k], { drop: drop + 0.1 });
    }
  }

  // ---------------------------------------------------------------- upper floor: two bone-framed lancets
  for (const [i, x] of [[0, -0.85], [1, 0.85]]) {
    const w = window_(b, { at: [x, 3.02, HZ], w: 0.38, h: 0.5, panes: [1, 2], arch: true, frame: 'cream', sillTones: 'cream' });
    windows.push({ id: `lancet-${i}`, ...w });
  }

  // ---------------------------------------------------------------- the very steep fish-scale roof
  {
    const run = HX + OVER, th = Math.atan2(RIDGE - EAVE, HX), y0 = EAVE - OVER * Math.tan(th), len = run / Math.cos(th);
    const L = HZ + GOV;
    for (const s of [-1, 1]) {
      tiledSlope(b, { origin: V(s * run, y0, 0), A: V(0, 0, -s), U: V(-s * Math.cos(th), Math.sin(th), 0), a0: -L, a1: L, len,
        course: 0.4, tile: 0.44, chamfer: [0.14, 0.12], lift: 0.09, thick: 0.14 });
    }
    // ridge cap
    b.box(0.2, 0.12, 2 * L, { tones: 'plum', tint: 0.9, at: [0, RIDGE - 0.03, 0] });
    // attic: the gable triangles in weatherboards (south one carries the quatrefoil + sign)
    const tri = (z) => [V(-HX, EAVE, z), V(HX, EAVE, z), V(0, RIDGE - 0.04, z)];
    const [s0, s1] = [tri(HZ), tri(-HZ)];
    b.hexa([s0[0], s0[1], s0[2], s0[2], s1[0], s1[1], s1[2], s1[2]], { ...wall });
  }
  // bone bargeboards on the south gable (the cream V) + finial and drop pendant
  const bz = HZ + GOV + 0.02;
  for (const s of [-1, 1]) {
    const pe = s * (HX + OVER);
    const tl = (p) => roofTop(p) + 0.19, bl = (p) => roofTop(p) - 0.17;   // top covers the tiles' 0.09 m lift (0.166 m vertical)
    b.hexa([V(pe, bl(pe), bz - 0.05), V(0, bl(0), bz - 0.05), V(pe, tl(pe), bz - 0.05), V(0, tl(0), bz - 0.05),
      V(pe, bl(pe), bz + 0.04), V(0, bl(0), bz + 0.04), V(pe, tl(pe), bz + 0.04), V(0, tl(0), bz + 0.04)], trim);
  }
  // plain plum verge boards on the north gable: they hide the stepped tile ends (and their zig-zag shadow on the wall)
  for (const s of [-1, 1]) {
    const pe = s * (HX + OVER), zn = -bz;
    const tl = (p) => roofTop(p) + 0.19, bl = (p) => roofTop(p) - 0.12;
    b.hexa([V(pe, bl(pe), zn - 0.04), V(0, bl(0), zn - 0.04), V(pe, tl(pe), zn - 0.04), V(0, tl(0), zn - 0.04),
      V(pe, bl(pe), zn + 0.05), V(0, bl(0), zn + 0.05), V(pe, tl(pe), zn + 0.05), V(0, tl(0), zn + 0.05)], { tones: 'plum', tint: 0.94 });
  }
  b.box(0.08, 0.95, 0.08, { ...trim, at: [0, RIDGE - 0.6, bz + 0.03] });
  b.box(0.05, 0.12, 0.05, { tones: 'brass', at: [0, RIDGE + 0.35, bz + 0.03] });
  b.box(0.12, 0.06, 0.1, { ...trim, at: [0, RIDGE - 0.66, bz + 0.03] });
  perches.push(V(0, RIDGE + 0.2, HZ + GOV));
  // strings of coloured lanterns swagged down both bargeboards: a 2-texel rope in real catenary loops 0.3 m under
  // the board, four big (0.18 x 0.22) lanterns per side, one at the bottom of each loop
  {
    // rope ramp = plank hi / mid / mid: the left swags hang in the left bargeboard's cast shadow, where plank sh
    // (#463A46) is the wall tone and the rope vanished
    const ROPE = [P.plank[0], P.plank[1], P.plank[1]];
    const zr = HZ + 0.08;
    const kx = [0.22, 0.64, 1.06, 1.48, 1.9];
    for (const s of [-1, 1]) {
      const pts = kx.map((p) => [s * p, roofTop(s * p) - 0.1]);
      for (let k = 0; k < pts.length - 1; k++) {
        const [a, c] = [pts[k], pts[k + 1]], sag = 0.4, n = 8, line = [];
        for (let j = 0; j <= n; j++) {
          const t = j / n, ch = (Math.cosh((t - 0.5) * 2.2) - Math.cosh(1.1)) / (Math.cosh(1.1) - 1);   // catenary, 0 at ends, -1 mid
          line.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t + ch * sag]);
        }
        ropeXY(b, line, zr, 0.065, 0.065, { tones: ROPE });
        const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2 - sag;
        paperLantern(b, mx, my + 0.02, zr, LAMP[(k * 2 + (s > 0 ? 1 : 0)) % LAMP.length], { w: 0.18, h: 0.22, drop: 0.04 });
      }
    }
  }
  // quatrefoil light high in the gable
  {
    const qy = 5.12, qz = HZ;
    for (const [ox, oy] of [[0, 0.13], [0, -0.13], [-0.13, 0], [0.13, 0]]) {
      b.push(M({ at: [ox, qy + oy, qz], rx: Math.PI / 2 }));
      b.cylinder(0.14, 0.14, 0.05, { ...trim, at: [0, -0.02, 0], segments: 8 });
      b.cylinder(0.085, 0.085, 0.02, { tones: 'glass', layer: 'glass', glow: P.glow[1], at: [0, 0.03, 0], segments: 8 });
      b.pop();
    }
    b.box(0.13, 0.13, 0.04, { tones: 'glass', layer: 'glass', glow: P.glow[1], at: [0, qy - 0.065, qz + 0.03] });
    windows.push({ id: 'quatrefoil', glowPos: V(0, qy, qz + 0.3) });
  }
  // the great brass lantern on a scrolled iron bracket: the trade sign
  {
    const by = 4.66, lz = HZ + 0.44;
    // a bone-painted gothic backboard behind it: by day it frames the gold lantern, at night the lamp's point light
    // warms it (toon point lights only lift a surface towards its OWN mid tone: the soot-dark boards cannot show a pool)
    b.prism([[-0.31, 3.72], [0.31, 3.72], [0.31, 4.5], [0, 4.78], [-0.31, 4.5]], 0.05, { tones: 'cream', tint: 0.96, pattern: 'vboards', scale: 0.6, at: [0, 0, HZ + 0.025] });
    b.box(0.06, 0.06, 0.56, { tones: 'iron', at: [0, by, HZ + 0.28] });                         // arm
    b.push(M({ at: [0, 0, 0], ry: -Math.PI / 2 }));
    segXY(b, [HZ, by - 0.32], [HZ + 0.3, by], 0, 0.05, { tones: 'iron' });                         // brace
    b.pop();
    b.box(0.1, 0.06, 0.06, { tones: 'iron', at: [0, by + 0.04, HZ + 0.55] });                     // scroll tip
    b.box(0.04, 0.1, 0.04, { tones: 'iron', at: [0, by - 0.1, lz] });                             // chain
    const ly = by - 0.12, gold = P.brass[0];                                                       // cap top; cap in brass hi
    b.hexa([V(-0.21, ly - 0.13, lz - 0.21), V(0.21, ly - 0.13, lz - 0.21), V(-0.05, ly, lz - 0.05), V(0.05, ly, lz - 0.05),
      V(-0.21, ly - 0.13, lz + 0.21), V(0.21, ly - 0.13, lz + 0.21), V(-0.05, ly, lz + 0.05), V(0.05, ly, lz + 0.05)], { tones: gold });
    const bodyTop = ly - 0.13, bodyH = 0.44, bw = 0.34;
    // the brightest thing on the house: a big steady glass body, 1-texel brass corner posts
    b.box(bw, bodyH, bw, { tones: P.glow[0], layer: 'glass', glow: P.lampGlow, glowKind: 1, at: [0, bodyTop - bodyH, lz] });
    for (const [px, pz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) b.box(0.035, bodyH, 0.035, { tones: 'brass', at: [px * (bw / 2 + 0.005), bodyTop - bodyH, lz + pz * (bw / 2 + 0.005)] });
    b.box(0.14, 0.26, 0.1, { tones: P.glow[0], layer: 'glass', glow: P.glow[0], glowKind: 1, at: [0, bodyTop - bodyH + 0.08, lz + bw / 2 + 0.02] }); // hot core, 2 texels proud
    b.box(bw + 0.08, 0.06, bw + 0.08, { tones: gold, at: [0, bodyTop - bodyH - 0.06, lz] });
    b.box(0.12, 0.12, 0.12, { tones: 'brass', at: [0, bodyTop - bodyH - 0.17, lz] });
    // reach 2.3 (was 4.3): enough to warm the cream backboard, short of house-7's red cap 2.6+ m to the south-west
    lights.push({ pos: V(0, bodyTop - bodyH / 2, HZ + 0.18), color: P.lampGlow, r: 2.3, kind: 'lamp' });
    perches.push(V(0, by + 0.07, HZ + 0.3));
  }

  // ---------------------------------------------------------------- slim stone chimney, west slope, toward the front
  // (v1: chimney left) on the west slope near the camera end, tall enough to clear the ridge from the yaw-0 camera
  const CHX = -0.62, CHZ = 0.85, CHT = RIDGE + 0.8;
  const smoke = chimney(b, { at: [CHX, CHZ], base: roofTop(CHX) - 0.4, top: CHT, w: 0.46, d: 0.5, tones: 'stone', pattern: 'ashlar', pots: 1, potTones: 'brick' });
  perches.push(V(CHX - 0.18, CHT + 0.12, CHZ));

  // ---------------------------------------------------------------- doorstep, mat, the lantern-maker's stock
  {
    // rain barrel at the south-east corner, a crate of spare lanterns beside it
    const bx = 1.46, bz2 = HZ + 0.45;
    b.cylinder(0.27, 0.27, 0.72, { tones: 'plank', pattern: 'vboards', scale: 0.5, at: [bx, 0, bz2], segments: 8 });
    for (const hy of [0.1, 0.52]) b.cylinder(0.33, 0.33, 0.07, { tones: 'iron', at: [bx, hy, bz2], segments: 8 });
    const cx = 0.78, cz = HZ + 0.36;
    b.box(0.5, 0.36, 0.42, { tones: 'plank', pattern: 'boards', scale: 0.6, at: [cx, 0, cz] });
    for (const [ox, k] of [[-0.12, 0], [0.12, 3]]) {
      b.box(0.14, 0.03, 0.14, { tones: 'brass', at: [cx + ox, 0.36, cz] });
      b.box(0.1, 0.13, 0.1, { tones: LAMP[k][0], at: [cx + ox, 0.39, cz] });
      b.box(0.12, 0.05, 0.12, { tones: 'brass', at: [cx + ox, 0.52, cz] });
    }
  }

  // ---------------------------------------------------------------- emit
  const group = b.build();
  // the leaf is 16 mm wider than the opening and tucked 8 mm into each jamb: no glowing seam at night
  const d = makeDoor(engine, { w: DW + 0.016, h: DH, tones: DOOR });
  const holder = new THREE.Group();
  holder.position.set(PC - DW / 2 - 0.008, PLINTH, PZS - 0.03);   // hinge on the west jamb, leaf front 3 cm inside the face
  holder.add(d.pivot);
  group.add(holder);
  group.position.set(r.center.x, 0, r.center.z);
  group.updateMatrixWorld(true);
  const W3 = (v) => toWorld(group, v);
  const doorPt = W3(V(PC, 0, PZS));

  // window anchors made inside a wall frame come back in that frame
  const winWorld = windows.map((w) => ({ id: `${r.id}-${w.id}`, pos: W3(w.f ? w.glowPos.clone().applyMatrix4(w.f) : w.glowPos) }));
  const glassMeshes = [];
  group.traverse((o) => o.isMesh && o.userData.layer === 'glass' && glassMeshes.push(o));
  return {
    group,
    anchors: {
      // the real door is in the porch's south face (not the record's west wall): life prefers point / normal
      doors: [{ id: `${r.id}-door`, pivot: d.pivot, open: d.open, normal: [0, 1], point: { x: doorPt.x, z: doorPt.z } }],
      chimneys: [W3(smoke)],
      windows: winWorld,
      lights: [
        ...lights.map((l) => ({ ...l, pos: W3(l.pos) })),
        { pos: winWorld.find((w) => w.id.endsWith('shop')).pos, color: P.glow[1], r: 2.2, kind: 'window' },
      ],
      perches: [...perches.map(W3), W3(V(0, RIDGE + 0.12, -HZ - GOV))],
      spots: { doorstep: W3(V(PC, 0, PZS + 0.5)), shopWindow: W3(V(0, 0, HZ + 0.9)) },
    },
    api: {
      setDoor: (f) => d.open(f),
      setLit: (on) => glassMeshes.forEach((m) => setGlowLit(m, on)),
    },
    stats: { lanterns: 20 },
  };
}
