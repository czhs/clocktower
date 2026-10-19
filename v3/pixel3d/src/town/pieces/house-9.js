// house-9 "Gloamend Clockworks" (owner: house-9 agent). Contract: docs/TOWN.md §4 (piece API), §6 (scale rules).
// USER NOTE (from the user, via the main session): this cottage currently covers the bottom of the voting circle at the
// gameplay camera. That must be fixed (docs/TOWN.md §11): keep it low (within the occlusion cap), and expect the lead to
// move it further south; don't add height toward the square.
//
// DESIGN NOTE (identity source: pipgws packages/assets/scripts/houses/house-9.ts, read only)
//   Signature shape: the clockmaker's shop. A low, wide verdigris-COPPER standing-seam hip roof (steep hipped ends,
//   long ridge) pierced in the middle of the front by a CROW-STEPPED BRICK GABLE (3 steps a side, pale ashlar coping
//   on every tread) that carries a BIG CLOCK DIAL and is crowned by a GILDED GEAR FINIAL. Below it a symmetric shop
//   front: two canted BOW SHOP WINDOWS (oxblood joinery, copper canopies) full of clocks - a tall case clock, a big
//   dial on a stand, a brass carriage clock - and between them a deep red panel door under a half-round FANLIGHT,
//   flanked by twin wall lamps. A brass COG SIGN hangs from an iron bracket off the gable's left foot and ticks round.
//   Brick chimney on the RIGHT (v1 draws it at x 60/80; the layout hint says left: the v1 house file wins, TOWN.md §1).
//   Nobody else in the ring has copper, a stepped gable or a clock: at 640x360 it must read as "the house with the
//   clock face in a stepped brick gable on a green roof".
//   Palette rows (TOWN.md §3): walls `stone` (dark ashlar pattern, v1 ASHLAR) + `ashlar` quoins / plinth course /
//   coping / surrounds; gable + chimney `brick`; roof `copper` (vboards = standing seams) + copper rolls; trim `cream`
//   (fanlight bars, window frames), `iron` (hands, brackets, lamps), `brass` (gears, finial, carriage clock, bobs);
//   dial face `ivory` accent (glass layer: glows at night); joinery paintRamp(style.shutters #6b2f2f); door
//   paintRamp(v1 '#5e1e26'); shop-window back paintRamp(v1 VELVET '#441c2c'); coir mat `thatch`; ivy `leaf`.
//   OCCLUSION (TOWN.md §6, h <= 0.577 z - 13.6, local z = world z - 32): back eave 2.58 m at z -2.13 (limit 3.6),
//   ridge + roll 4.73 at z 0 (limit 4.86).
//   CIRCLE CUT (TOWN.md §12.2; placed 1 m south, so local z = world z - 33): in every square view the voting-circle
//   cut removes anything above y = 0.577 z + 3.67 (camera pitch 30 deg, circle edge z 26.65). The upper hip roof is
//   behind that line and is cut (accepted), but the signature is kept whole under it: crow-stepped gable top coping
//   4.52 at z 1.57 (limit 4.57), gear finial top 4.76 at z 1.93 (limit 4.78), dial top 4.13, chimney (moved to the
//   front-right of the roof) cap 4.06 / pots 4.2 at z 1.01..1.49 (limit 4.25+), cross-roof ridge 3.76 (it runs back into the hip at z 0.9, so it never shows above the gable top).
//   At 640x360 (30 px/m): gable 2.6 m = 78 px wide, dial 35 px across, bow windows 33 px, finial 8 px.
//   Animation: the cog sign ticks a quarter tooth at 4 fps (pure f(t)); the dial follows the clocktower (api.time,
//   minutes on a 12 h dial) so the town's two clocks agree; api.setTime pins it; with no tower (isolated renders) it
//   steps from 11:55 ("five to midnight" like the v1 art) one minute per 2 s of t, never gliding.
import * as THREE from 'three';
import { Builder, M, doorway, steps, window_, wallWithOpenings, frameOf, setGlowLit } from '../kit.js';
import { toWorld } from '../api.js';
import { TOWN_PALETTE as P, paintRamp } from '../palette.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const JOINERY = paintRamp('#6b2f2f', { lightness: 0.34 });     // style.shutters: bow-window riser, posts, fascia
const DOOR_PAINT = paintRamp('#5e1e26', { lightness: 0.32 });  // v1 door paint
const VELVET = paintRamp('#441c2c', { lightness: 0.2 });       // v1 VELVET: the dark shop-window back
const IVORY = [P.ivory, P.cream[1], P.cream[2]];               // dial faces (ivory accent on the cream ramp)
// copper ramps shifted down one / two steps (deeper cool slate below copper sh) for the hand-painted roof planes
const CU_DEEP = ['#2F4C53', '#273F49'];
const CU = [P.copper, [P.copper[1], P.copper[2], CU_DEEP[0]], [P.copper[2], CU_DEEP[0], CU_DEEP[1]]];
const LAMP_GLASS = [P.glow[0], P.glow[1], P.glow[2]];          // the wall lamps' glazing: amber by day, a warm glow box at night
const IVY_DARK = [P.leaf[1], P.leaf[2], '#24413E'];            // second ivy tone (leaf ramp one step down, core)

// Hand-painted roof banding (TOWN_LEARNINGS house-1): the town sun is camera-relative and lights the front copper
// plane and the lit hip into the same top band, so each roof plane picks its ramp from its own normal against the
// gameplay sun (lowered elevation), following the camera yaw at BUILD time.
const PAINT_L = new THREE.Vector3();
function setPaintYaw(yaw) {
  const R = [Math.cos(yaw), -Math.sin(yaw)], B = [Math.sin(yaw), Math.cos(yaw)];
  PAINT_L.set(-0.8 * R[0] + 0.42 * B[0], 0.42, -0.8 * R[1] + 0.42 * B[1]).normalize();
}
/** Ramp for a roof plane given three points of its top surface (house-local = world orientation: faces south). */
function paintedCopper(a, c, d) {
  const n = c.clone().sub(a).cross(d.clone().sub(a)).normalize();
  if (n.y < 0) n.negate();
  const k = n.dot(PAINT_L);
  return CU[k > 0.66 ? 0 : k > 0.14 ? 1 : 2];
}

// ------------------------------------------------------------------------------------------------ dimensions (local)
// local frame = frameOf(record): origin at the footprint centre (22.5, 0, 32), +z = south (the door side), x east.
const WALL = { x: 2.38, zf: 1.85, zb: -1.85, eave: 2.85, thick: 0.3 };
const ROOF = { ov: 0.28, ridge: 4.65, rh: 1.5, thick: 0.08, cutZ: 1.62, cutX: 1.28 };
const GAB = { zf: 1.95, zb: 1.6, y0: 2.75, hw: [1.3, 1.0, 0.72, 0.42], top: [3.3, 3.7, 4.1, 4.42], cope: 0.08 };
const XR = { z0: 0.9, z1: 1.62, half: 1.18, ridge: 3.76 };      // copper cross roof behind the gable (low: hidden behind the steps)
const DIAL = { y: 3.55, z: GAB.zf, r: 0.58, face: 0.47 };
const DOOR = { w: 1.0, h: 2.0 };
const BAY = { x: 1.6, half: 0.55, front: 0.3, dp: 0.25, y0: 0.22, sill: 0.8, top: 1.86 };
const CHIM = { x: 1.72, z: 1.25, base: 3.2, top: 3.96 };
const FIN = { y: 4.63, z: 1.96, r: 0.13 };                         // gear finial on the gable peak
const SIGN = { x: -1.58, y: 2.86, z: 2.3, r: 0.28, armY: 3.2 };

// ------------------------------------------------------------------------------------------------ shape helpers
/** Polygon of a spur gear (XY plane, centred), n teeth, outer / root radius. */
function gearPts(n, ro, ri, phase = 0) {
  const pts = [], st = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = phase + i * st + Math.PI / 2;
    for (const [rr, k] of [[ri, -0.3], [ro, -0.16], [ro, 0.16], [ri, 0.3]]) pts.push([Math.cos(a + k * st) * rr, Math.sin(a + k * st) * rr]);
  }
  return pts;
}
/** Slab with a given top quad (outer edge a0 a1, inner edge b0 b1) dropped `t` vertically. */
function slab(b, a0, a1, b0, b1, t, opts) {
  const lo = (p) => V3(p.x, p.y - t, p.z);
  if (opts.paint) opts = { ...opts, tones: paintedCopper(a0, a1, b0.distanceTo(a0) > b1.distanceTo(a1) ? b0 : b1) };
  b.hexa([lo(a0), lo(a1), a0, a1, lo(b0), lo(b1), b0, b1], opts);
}
/** Square-section beam between two points (hip / ridge rolls, braces). */
function beam(b, p0, p1, s, opts, roll = 0) {
  const d = p1.clone().sub(p0).normalize();
  const up = Math.abs(d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0);
  const u = d.clone().cross(up).normalize().multiplyScalar(s / 2), v = u.clone().cross(d).normalize().multiplyScalar(s / 2);
  if (roll) { u.applyAxisAngle(d, roll); v.applyAxisAngle(d, roll); }   // roll pi/4: a diamond section (no edge-on faces)
  const c = [];
  for (let i = 0; i < 8; i++) c.push((i & 4 ? p1 : p0).clone().add(u.clone().multiplyScalar(i & 1 ? 1 : -1)).add(v.clone().multiplyScalar(i & 2 ? 1 : -1)));
  b.hexa(c, opts);
}
/** Vertical prism of a top-view polygon [[x, z], ...] from y0 to y1 (current frame). */
function slabXZ(b, poly, y0, y1, opts) {
  b.prism(poly.map(([x, z]) => [x, -z]), y1 - y0, { ...opts, at: [0, (y0 + y1) / 2, 0], rx: -Math.PI / 2 });
}
/** Disc facing +z (16-gon) of radius r and depth h, back face at z. */
function disc(b, x, y, z, r, h, opts) {
  b.push(M({ at: [x, y, z], rx: Math.PI / 2 }));
  b.cylinder(r, r, h, { segments: 16, ...opts });
  b.pop();
}
/** House-local point of a vector given in a pushed wall frame (at [wx, 0, zw], ry). */
function toLocal(v, wx, zw, ry) {
  return v.clone().applyAxisAngle(V3(0, 1, 0), ry).add(V3(wx, 0, zw));
}

/**
 * The v1 shop door (DoorSpec kind 'window', hinge right): oxblood leaf, two raised lower panels, two glazed upper
 * lights (glass layer: they glow at night), brass knob + letter plate. Same contract as kit.door(): {pivot, leaf,
 * open(f)}, the leaf extends along -x from a right-hand hinge and swings ~100 deg inward (-z).
 */
function shopDoor(engine, { w = 0.98, h = 1.98, thick = 0.06, name = 'door' } = {}) {
  const b = new Builder(engine, { name });
  const cx = -w / 2;
  b.box(w, h, thick, { tones: DOOR_PAINT, pattern: 'none', at: [cx, 0, 0] });
  for (const px of [-0.22, 0.22]) {
    b.box(w * 0.3, 0.62, 0.025, { tones: DOOR_PAINT, tint: 1.05, at: [cx + px * w, 0.22, thick / 2 + 0.01] });      // raised panels
    b.box(w * 0.3, 0.46, 0.02, { tones: 'glass', layer: 'glass', glow: P.glow[1], at: [cx + px * w, 1.3, thick / 2 + 0.002] });
  }
  b.box(w * 0.82, 0.05, 0.03, { tones: DOOR_PAINT, tint: 0.94, at: [cx, 1.16, thick / 2 + 0.012] });               // lock rail
  b.box(0.16, 0.05, 0.02, { tones: 'brass', at: [cx, 0.98, thick / 2 + 0.012] });                                  // letter plate
  b.box(0.06, 0.06, 0.05, { tones: 'brass', at: [-w + 0.13, 1.0, thick / 2 + 0.02] });                             // knob
  for (const hy of [0.25, h - 0.35]) b.box(0.05, 0.12, 0.03, { tones: 'iron', at: [-0.03, hy, thick / 2 + 0.005] }); // butt hinges
  const leaf = b.build({ name });
  const pivot = new THREE.Group(); pivot.name = `${name}-pivot`;
  pivot.add(leaf);
  leaf.position.z = -thick / 2;
  const open = (f) => { pivot.rotation.y = -Math.max(0, Math.min(1, f)) * 1.75; };
  return { pivot, leaf, open };
}

// ------------------------------------------------------------------------------------------------ build
export default function build(engine, ctx) {
  const rec = ctx.record, fr = frameOf(rec);
  const r = rng(ctx.seed * 131 + 9);
  setPaintYaw(engine.camera?.yaw ?? 0);
  const b = new Builder(engine, { name: rec.id });
  const { x: WX, zf: ZF, zb: ZB, eave: EAVE } = WALL;

  // ---- plinth + walls (dark dressed stone), front wall with the door hole
  b.box(WX * 2 + 0.14, 0.3, ZF - ZB + 0.14, { tones: 'ashlar', pattern: 'rubble', tint: 0.96, at: [0, -0.08, (ZF + ZB) / 2] });
  b.box(WX * 2, EAVE, ZF - WALL.thick - ZB, { tones: 'stone', pattern: 'ashlar', at: [0, 0, (ZF - WALL.thick + ZB) / 2] });
  wallWithOpenings(b, { x0: -WX, x1: WX, y1: EAVE, z0: ZF, thick: WALL.thick, tones: 'stone', pattern: 'ashlar',
    openings: [{ x: 0, y: 0, w: DOOR.w, h: DOOR.h }] });
  // quoins on the two front corners (pale ashlar, long / short, 1 texel proud on both faces)
  for (let i = 0, y = 0.24; y + 0.26 < EAVE; i++, y += 0.3) {
    const len = i % 2 ? 0.24 : 0.36, side = i % 2 ? 0.36 : 0.24;
    for (const s of [-1, 1]) b.box(len + 0.035, 0.26, side + 0.035, { tones: 'ashlar', pattern: 'none', tint: i % 3 ? 1 : 0.97,
      at: [s * (WX - len / 2 + 0.0175), y, ZF - side / 2 + 0.0175] });
  }
  // attic block under the roof (stone, below every roof slab)
  b.hexa([V3(-WX + 0.05, 2.8, ZB + 0.05), V3(WX - 0.05, 2.8, ZB + 0.05), V3(-1.45, 4.5, 0), V3(1.45, 4.5, 0),
    V3(-WX + 0.05, 2.8, ZF - 0.05), V3(WX - 0.05, 2.8, ZF - 0.05), V3(-1.45, 4.5, 0.001), V3(1.45, 4.5, 0.001)], { tones: 'stone', pattern: 'ashlar' });

  // ---- copper hip roof: long ridge, steep hipped ends, front eave cut around the gable
  const W = WX + ROOF.ov, D = -ZB + ROOF.ov, YR = ROOF.ridge, RH = ROOF.rh;
  const tS = (YR - EAVE) / ZF, y0 = EAVE - ROOF.ov * tS;
  const yAtZ = (z) => YR - tS * Math.abs(z), hxAtZ = (z) => RH + (W - RH) * (Math.abs(z) / D);
  // standing seams as the kit's 1-px vboards pattern (period 0.18 x 2 = 0.36 m): real ribs 1-2 texels wide gave
  // dashed / doubled outlines on the 45 deg slope (tried: square and diamond sections), the pattern is exact.
  const cu = { tones: 'copper', pattern: 'vboards', scale: 2, paint: true };
  const T = ROOF.thick;
  slab(b, V3(-W, y0, -D), V3(W, y0, -D), V3(-RH, YR, 0), V3(RH, YR, 0), T, cu);                           // back
  for (const s of [-1, 1]) slab(b, V3(s * W, y0, -D), V3(s * W, y0, D), V3(s * RH, YR, 0), V3(s * RH, YR, 0.0005), T, cu); // ends
  {
    const zc = ROOF.cutZ, yc = yAtZ(zc), hc = hxAtZ(zc), cx = ROOF.cutX;
    slab(b, V3(-hc, yc, zc), V3(hc, yc, zc), V3(-RH, YR, 0), V3(RH, YR, 0), T, cu);                        // front, upper
    for (const s of [-1, 1]) slab(b, V3(s * W, y0, D), V3(s * cx, y0, D), V3(s * hc, yc, zc), V3(s * cx, yc, zc), T, cu); // eave band
  }
  // rolls: ridge + four hips (copper, a touch lighter: a rimmed line on every arris)
  const roll = { tones: 'copper', pattern: 'none', tint: 1.05 };
  beam(b, V3(-RH - 0.043, YR + 0.013, 0.003), V3(RH + 0.043, YR + 0.013, 0.003), 0.1, roll);
  // hip rolls: a 0.1 m diamond section (pi/4 roll) riding 2 cm proud of the arris, so the lit upper face and the cream
  // rim on its top edge run as one continuous stepped line (a 0.07 square roll rasterised as a dashed rim)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(b, V3(sx * (W + 0.023), y0 + 0.033, sz * (D + 0.023)), V3(sx * RH, YR + 0.033, 0.003), 0.1, roll, Math.PI / 4);

  // ---- copper cross roof behind the stepped gable (its ridge runs back into the hip)
  {
    const { z0, z1, half, ridge } = XR;
    for (const s of [-1, 1]) slab(b, V3(s * half, EAVE, z1), V3(s * half, EAVE, z0), V3(0, ridge, z1), V3(0, ridge, z0), T, cu);
    beam(b, V3(0, ridge + 0.01, z0 - 0.02), V3(0, ridge + 0.01, z1), 0.09, roll);
    const tri = (z) => [V3(-half + 0.05, EAVE, z), V3(half - 0.05, EAVE, z), V3(0, ridge - 0.06, z)];
    const a = tri(z0 + 0.02), c = tri(z0 + 0.32);
    b.hexa([a[0], a[1], a[2], a[2], c[0], c[1], c[2], c[2]], { tones: 'brick', pattern: 'brick' });
  }

  // ---- the crow-stepped brick gable
  {
    const { hw, top, y0: gy } = GAB;
    const right = [[hw[0], gy]];
    for (let k = 0; k < 4; k++) { right.push([hw[k], top[k]]); if (k < 3) right.push([hw[k + 1], top[k]]); }
    const poly = [[-hw[0], gy], ...right, ...right.slice().reverse().map(([x, y]) => [-x, y]).slice(0, -1)];
    b.prism(poly, GAB.zf - GAB.zb, { tones: 'brick', pattern: 'brick', at: [0, 0, (GAB.zf + GAB.zb) / 2] });
    // coping on every tread + the top (pale ashlar, proud all round)
    const cz = (GAB.zf + GAB.zb) / 2, cd = GAB.zf - GAB.zb + 0.07;
    for (let k = 0; k < 3; k++) {
      const w = hw[k] - hw[k + 1] + 0.06;
      for (const s of [-1, 1]) b.box(w, GAB.cope, cd, { tones: 'ashlar', pattern: 'none', at: [s * (hw[k + 1] + w / 2 - 0.01), top[k], cz] });
    }
    b.box(hw[3] * 2 + 0.1, GAB.cope + 0.02, cd, { tones: 'ashlar', pattern: 'none', at: [0, top[3], cz] });
    // string course at the gable foot
    b.box(hw[0] * 2 + 0.1, 0.1, 0.12, { tones: 'ashlar', pattern: 'none', at: [0, gy, GAB.zf] });
    // gilded gear finial, seated on the FRONT edge of the top coping (bottom teeth sunk in it): its top (4.76 m at
    // z 1.93..1.99) stays under the voting-circle cut line (0.577 z + 3.67 = 4.78) in every square view
    b.prism(gearPts(8, FIN.r, FIN.r * 0.74), 0.06, { tones: 'brass', at: [0, FIN.y, FIN.z] });
    disc(b, 0, FIN.y, FIN.z + 0.03, 0.045, 0.02, { tones: 'iron' });
    // gilded gear badge on the top step, between the dial and the finial (the clockmaker's mark)
    b.prism(gearPts(6, 0.1, 0.075, 0.26), 0.03, { tones: 'brass', tint: 0.96, at: [0, 4.27, GAB.zf + 0.015] });
    // the clock dial: ashlar ring, ivory face (glass layer: glows at night), iron hour marks
    disc(b, 0, DIAL.y, DIAL.z, DIAL.r, 0.07, { tones: 'ashlar' });
    disc(b, 0, DIAL.y, DIAL.z + 0.07, DIAL.face, 0.02, { tones: IVORY, layer: 'glass', glow: P.glow[0] });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, rr = DIAL.face - 0.08, big = i % 3 === 0;
      b.box(big ? 0.07 : 0.06, big ? 0.12 : 0.06, 0.02, { tones: 'iron', origin: 'center', rz: -a,
        at: [Math.sin(a) * rr, DIAL.y + Math.cos(a) * rr, DIAL.z + 0.1] });
    }
    // small brass cogs either side of the dial
    for (const s of [-1, 1]) {
      b.prism(gearPts(6, 0.17, 0.12, s * 0.2), 0.05, { tones: 'brass', at: [s * 0.98, 3.04, GAB.zf + 0.025] });
      disc(b, s * 0.98, 3.04, GAB.zf + 0.05, 0.045, 0.02, { tones: 'iron' });
    }
  }

  // ---- chimney (brick, front-right of the hip roof, low: its cap 4.06 m at z 1.01..1.49 stays under the circle
  // cut line 4.25..4.53 in square views), tapered so the side faces are never exactly edge-on
  {
    const { x, z, base, top } = CHIM, bw = 0.29, tw = 0.27, bd = 0.24, td = 0.22;
    b.hexa([V3(x - bw, base, z - bd), V3(x + bw, base, z - bd), V3(x - tw, top, z - td), V3(x + tw, top, z - td),
      V3(x - bw, base, z + bd), V3(x + bw, base, z + bd), V3(x - tw, top, z + td), V3(x + tw, top, z + td)], { tones: 'brick', pattern: 'brick' });
    b.box(0.66, 0.1, 0.56, { tones: 'ashlar', pattern: 'none', at: [x, top, z] });
    for (const px of [-0.13, 0.11]) b.cylinder(0.09, 0.075, px < 0 ? 0.18 : 0.13, { at: [x + px, top + 0.1, z], tones: 'brick', tint: px < 0 ? 0.95 : 1.0 });
  }
  const chimTop = V3(CHIM.x - 0.12, CHIM.top + 0.3, CHIM.z);

  // ---- door: ashlar surround, fanlight, step, coir mat
  const dw = doorway(b, { at: [0, 0, ZF], w: DOOR.w, h: DOOR.h, thick: WALL.thick, hood: 'lintel', frame: 'ashlar' });
  {
    const fy = DOOR.h + 0.14, ro = 0.56, ri = 0.43, n = 8;
    const semi = (rad) => Array.from({ length: n + 1 }, (_, i) => [Math.cos((i / n) * Math.PI) * rad, Math.sin((i / n) * Math.PI) * rad]);
    b.prism(semi(ri + 0.02), 0.02, { tones: 'glass', layer: 'glass', glow: P.glow[1], at: [0, fy, ZF + 0.01] });
    b.prism([...semi(ro), ...semi(ri).reverse()], 0.09, { tones: 'ashlar', at: [0, fy, ZF + 0.045] });
    b.box(0.13, 0.15, 0.1, { tones: 'ashlar', tint: 1.04, at: [0, fy + ri - 0.02, ZF + 0.055] });            // keystone
    for (const a of [-Math.PI / 4, 0, Math.PI / 4]) b.box(0.05, ri, 0.03, { tones: 'cream', pattern: 'none', origin: 'center', rz: a,
      at: [-Math.sin(a) * ri * 0.5, fy + Math.cos(a) * ri * 0.5, ZF + 0.03] });
  }
  steps(b, { at: [0, 0, ZF], w: 1.36, count: 1, rise: 0.11, run: 0.32 });
  b.box(0.86, 0.025, 0.2, { tones: 'plank', pattern: 'thatch', scale: 0.5, at: [0, 0, ZF + 0.32 + 0.11] });   // coir mat: step + mat 0.38 m into the door tile

  // ---- twin lamps either side of the door: iron bracket + cap, a 0.16 x 0.25 m amber glass box (5 x 7 px, steady
  // glow at night), brass finial. The light anchor goes OUT and DOWN (TOWN_LEARNINGS house-0): 0.8 m out at 0.8 m
  // high, so the pool lands on the step, the mat and the lane tile instead of a brown disc on the ashlar beside it.
  const lamps = [-0.823, 0.823].map((x) => {
    const y = 2.313, z = ZF, gz = z + 0.25;
    b.box(0.05, 0.05, 0.25, { tones: 'iron', at: [x, y + 0.2, z + 0.125] });                               // arm
    b.box(0.08, 0.1, 0.04, { tones: 'iron', at: [x, y + 0.13, z + 0.02] });                                // wall plate
    b.box(0.03, 0.06, 0.03, { tones: 'iron', at: [x, y + 0.14, gz] });                                     // hanger
    b.box(0.2, 0.035, 0.2, { tones: 'iron', at: [x, y - 0.17, gz] });                                       // base plate
    b.box(0.16, 0.25, 0.16, { tones: LAMP_GLASS, layer: 'glass', glow: P.lampGlow, glowKind: 1, at: [x, y - 0.135, gz] });
    b.hexa([V3(x - 0.12, y + 0.115, gz - 0.12), V3(x + 0.12, y + 0.115, gz - 0.12), V3(x - 0.03, y + 0.19, gz - 0.03), V3(x + 0.03, y + 0.19, gz - 0.03),
      V3(x - 0.12, y + 0.115, gz + 0.12), V3(x + 0.12, y + 0.115, gz + 0.12), V3(x - 0.03, y + 0.19, gz + 0.03), V3(x + 0.03, y + 0.19, gz + 0.03)], { tones: 'iron' });
    b.box(0.045, 0.045, 0.045, { tones: 'brass', at: [x, y + 0.19, gz] });                                  // finial
    return { pos: V3(x * 0.8, 0.8, ZF + 0.8), color: P.lampGlow, r: 2.3, kind: 'lantern', flicker: false };
  });

  // ---- two bow shop windows full of clocks
  const bays = [];
  for (const s of [-1, 1]) {
    const bx = s * BAY.x, { half, front, dp } = BAY;
    const poly = [[-half, 0], [-front, dp], [front, dp], [half, 0]];
    b.push(M({ at: [bx, 0, ZF] }));
    // riser (oxblood panelled joinery) + ashlar sill
    slabXZ(b, poly, BAY.y0, BAY.sill, { tones: JOINERY, pattern: 'vboards', scale: 1.2 });
    slabXZ(b, [[-half - 0.06, 0], [-front - 0.03, dp + 0.06], [front + 0.03, dp + 0.06], [half + 0.06, 0]], BAY.sill, BAY.sill + 0.06, { tones: 'ashlar', pattern: 'none' });
    b.box(front * 2 - 0.14, 0.32, 0.03, { tones: JOINERY, tint: 1.05, at: [0, BAY.y0 + 0.13, dp] });       // raised panel
    // dark velvet back of the window (glass layer: glows warm at night)
    b.box(half * 2 - 0.02, BAY.top - BAY.sill - 0.06, 0.02, { tones: VELVET, layer: 'glass', glow: P.glow[1], at: [0, BAY.sill + 0.06, 0.012] });
    // corner posts, transom, head board (fascia)
    for (const [x, z] of poly) b.box(0.06, BAY.top - BAY.sill, 0.06, { tones: JOINERY, at: [x, BAY.sill + 0.06, z] });
    const fac = [[poly[0], poly[1]], [poly[1], poly[2]], [poly[2], poly[3]]];
    for (const [[ax, az], [cx2, cz2]] of fac) {
      const len = Math.hypot(cx2 - ax, cz2 - az), ry = -Math.atan2(cz2 - az, cx2 - ax);
      b.box(len, 0.04, 0.04, { tones: 'cream', pattern: 'none', ry, at: [(ax + cx2) / 2, 1.62, (az + cz2) / 2] });
      b.box(len + 0.04, 0.12, 0.05, { tones: JOINERY, pattern: 'none', ry, at: [(ax + cx2) / 2, BAY.top, (az + cz2) / 2] });
    }
    // copper canopy (three facets: a lean-to front, hipped sides)
    {
      const e = [V3(-half - 0.09, 1.99, 0), V3(-front - 0.05, 1.99, dp + 0.1), V3(front + 0.05, 1.99, dp + 0.1), V3(half + 0.09, 1.99, 0)];
      const w0 = V3(-front + 0.02, 2.26, 0), w1 = V3(front - 0.02, 2.26, 0);
      const co = { tones: 'copper', pattern: 'vboards', scale: 0.8, paint: true };
      slab(b, e[1], e[2], w0, w1, 0.05, co);
      slab(b, e[0], e[1], w0, w0.clone().setZ(0.0005), 0.05, co);
      slab(b, e[2], e[3], w1, w1.clone().setZ(0.0005), 0.05, co);
    }
    // the display (mirrored per bay, like v1's seedK): tall case clock, a big dial on a stand, a carriage clock
    const m = s < 0 ? 1 : -1;
    const sill = BAY.sill + 0.06;
    {
      const cx = -m * 0.2;
      b.box(0.17, 0.84, 0.12, { tones: 'plank', pattern: 'none', at: [cx, sill, 0.1] });
      b.box(0.21, 0.06, 0.14, { tones: 'timber', at: [cx, sill + 0.84, 0.1] });
      b.box(0.12, 0.12, 0.02, { tones: IVORY, at: [cx, sill + 0.63, 0.165] });
      b.box(0.035, 0.07, 0.02, { tones: 'iron', at: [cx, sill + 0.67, 0.18] });
      b.box(0.09, 0.36, 0.02, { tones: VELVET, at: [cx, sill + 0.13, 0.165] });                              // pendulum slot
      b.box(0.065, 0.065, 0.02, { tones: 'brass', at: [cx + m * 0.012, sill + 0.19, 0.18] });                 // the bob
    }
    {
      const dx = m * 0.13;
      b.box(0.06, 0.24, 0.06, { tones: 'timber', at: [dx, sill, 0.1] });
      b.box(0.2, 0.04, 0.12, { tones: 'timber', at: [dx, sill, 0.1] });
      disc(b, dx, sill + 0.44, 0.08, 0.19, 0.05, { tones: 'brass' });
      disc(b, dx, sill + 0.44, 0.13, 0.155, 0.02, { tones: IVORY });
      b.box(0.035, 0.12, 0.02, { tones: 'iron', at: [dx, sill + 0.44, 0.155] });
      b.box(0.09, 0.035, 0.02, { tones: 'iron', at: [dx + m * 0.045, sill + 0.43, 0.155] });
    }
    {
      const kx = m * 0.41;
      b.box(0.12, 0.15, 0.09, { tones: 'brass', at: [kx, sill, 0.07] });
      b.box(0.07, 0.07, 0.02, { tones: IVORY, at: [kx, sill + 0.05, 0.12] });
      b.box(0.05, 0.04, 0.04, { tones: 'brass', tint: 1.05, at: [kx, sill + 0.15, 0.07] });
    }
    b.pop();
    bays.push({ glowPos: V3(bx, 1.35, ZF + 0.45), lightPos: V3(bx, 0.55, ZF + 1.15) });
  }

  // ---- side + back windows (shuttered, oxblood), so the iso / turntable views are a house all round
  const sideWins = [];
  for (const [ry, wx, zw, x] of [[Math.PI / 2, WX, 0, -0.5], [-Math.PI / 2, -WX, 0, 0.5], [Math.PI, 0, ZB, -1.2], [Math.PI, 0, ZB, 1.2]]) {
    b.push(M({ at: [wx, 0, zw], ry }));
    const w = window_(b, { at: [x, 1.5, 0], w: 0.56, h: 0.72, shutters: JOINERY, frame: 'cream' });
    b.pop();
    sideWins.push(toLocal(w.glowPos, wx, zw, ry));
  }

  // ---- ivy up the left front corner (soft layer: no cream rims). A dark woody stem wanders up the quoins; leaf
  // clumps are irregular 6-8-gon prisms (3-5 px) in two leaf tones, dense at the foot and thinning upward, a few
  // wrap round onto the west wall, and one tendril reaches right under the left bay's canopy.
  {
    const soft = (tones, tint = 1) => ({ tones, layer: 'soft', tint });
    const stem = (pts, sz) => { for (let i = 0; i + 1 < pts.length; i++) beam(b, V3(...pts[i]), V3(...pts[i + 1]), sz, soft('timber', 0.78), Math.PI / 4); };
    const blob = (x, y, z, rad, k, ry = 0) => {
      const n = 6 + (k % 3), poly = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5, rr = rad * (0.62 + r() * 0.5);
        poly.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.85]);
      }
      b.prism(poly, 0.04, { ...soft(k % 3 === 1 ? IVY_DARK : 'leaf', k % 2 ? 1.03 : 0.97), at: [x, y, z], ry });
    };
    const ZW = ZF + 0.045;
    // main stem: up the corner quoins, a slight S, with a side shoot round the corner and the tendril to the canopy
    const main = [], side = [], tendril = [];
    for (let i = 0; i <= 8; i++) { const y = 0.1 + i * 0.32; main.push([-WX + 0.12 + Math.sin(i * 1.3) * 0.05, y + 0.013, ZW - 0.012]); }
    stem(main, 0.04);
    for (let i = 0; i <= 4; i++) side.push([-WX - 0.03, 0.2 + i * 0.36, ZF - 0.08 - i * 0.07]);
    stem(side, 0.035);
    tendril.push([-WX + 0.15, 1.47, ZW - 0.012], [-WX + 0.24, 1.72, ZW - 0.012], [-BAY.x - BAY.half + 0.02, 1.93, ZW + 0.03]);
    stem(tendril, 0.035);
    // clumps along the stem: 3 per step at the foot, 1 near the top
    let k = 0;
    main.forEach(([sx, sy], i) => {
      const t = i / 8, n = t < 0.35 ? 3 : t < 0.7 ? 2 : 1;
      for (let j = 0; j < n; j++, k++) {
        const rad = (0.1 + r() * 0.04) * (1 - t * 0.35);
        blob(sx + (r() - 0.45) * 0.26 * (1 - t * 0.5), sy + (r() - 0.5) * 0.2, ZW + (k % 2) * 0.012, rad, k);
      }
    });
    side.forEach(([, sy, sz], i) => { for (let j = 0; j < (i < 2 ? 2 : 1); j++, k++) blob(-WX - 0.04, sy + (r() - 0.5) * 0.18, sz + (r() - 0.5) * 0.18, 0.1 + r() * 0.03, k, -Math.PI / 2); });
    for (const [tx, ty] of [[-WX + 0.22, 1.66], [-WX + 0.3, 1.86]]) blob(tx, ty, ZW + 0.02, 0.07, k++);
    // a few low clumps over the left bay's cheek
    for (let i = 0; i < 3; i++, k++) blob(-BAY.x - BAY.half + 0.1 + r() * 0.08, BAY.y0 + 0.12 + i * 0.2, ZF + 0.07, 0.09, k);
  }

  // ---- cog sign: iron bracket off the gable foot (the ticking gear is its own mesh below)
  {
    const { x, z, armY } = SIGN, gx = -GAB.hw[0];
    b.box(0.06, 0.06, z - GAB.zf + 0.04, { tones: 'iron', at: [gx + 0.07, armY - 0.03, (z + GAB.zf) / 2] });   // stub off the gable
    b.box(gx + 0.1 - (x - 0.18), 0.05, 0.05, { tones: 'iron', at: [(gx + 0.1 + x - 0.18) / 2, armY, z] });     // arm
    beam(b, V3(gx + 0.02, armY - 0.32, GAB.zf), V3(gx - 0.12, armY, z), 0.045, { tones: 'iron' });             // brace
    b.box(0.04, armY - SIGN.y - SIGN.r + 0.02, 0.04, { tones: 'iron', at: [x, SIGN.y + SIGN.r - 0.02, z] });  // hanger
    b.box(0.07, 0.07, 0.07, { tones: 'brass', at: [x - 0.2, armY - 0.01, z] });                               // knob
  }

  const group = b.build();

  // ---- the hinged door (separate leaf, animated by life via api.setDoor)
  const d = shopDoor(engine, { w: DOOR.w - 0.02, h: DOOR.h - 0.02, name: `${rec.id}-door` });
  d.pivot.position.copy(dw.hingeRight);
  group.add(d.pivot);

  // ---- clock hands (two tiny meshes on the dial; api.setTime)
  const hand = (len, w, name, boss) => {
    const hb = new Builder(engine, { name });
    hb.box(w, len, 0.025, { tones: 'iron', at: [0, -0.07, 0] });
    if (boss) hb.box(0.09, 0.09, 0.03, { tones: 'brass', at: [0, -0.045, 0.02] });
    const g = hb.build({ castShadow: false, name });
    const pivot = new THREE.Group(); pivot.name = `${name}-pivot`;
    pivot.position.set(0, DIAL.y, DIAL.z + 0.105);
    pivot.add(g); group.add(pivot);
    return pivot;
  };
  const hourHand = hand(0.29, 0.085, `${rec.id}-hour`, false);
  const minHand = hand(0.42, 0.06, `${rec.id}-minute`, true);
  minHand.position.z += 0.03;
  let clock = [11, 55], manual = false;
  const showTime = (h, m = 0) => {
    clock = [h, m];
    minHand.rotation.z = -(m / 60) * Math.PI * 2;
    hourHand.rotation.z = -(((h % 12) + m / 60) / 12) * Math.PI * 2;
  };
  showTime(11, 55);
  // api.setTime (life / lead) pins the dial; otherwise it follows the clocktower, and with no tower (isolated
  // renders) it steps from 11:55 one in-game minute per CLOCK_S seconds of t (pure f(t): the hands never glide).
  const CLOCK_S = 2;
  const setTime = (h, m = 0) => { manual = true; showTime(h, m); };

  // ---- the ticking cog sign (own mesh, rotates in its plane)
  const sb = new Builder(engine, { name: `${rec.id}-sign` });
  sb.prism(gearPts(10, SIGN.r, SIGN.r - 0.075), 0.05, { tones: 'brass' });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, l = SIGN.r - 0.1;
    sb.box(0.05, l, 0.03, { tones: 'brass', tint: 1.05, origin: 'center', rz: a, at: [-Math.sin(a) * l / 2, Math.cos(a) * l / 2, 0.035] });
  }
  disc(sb, 0, 0, 0.04, 0.06, 0.03, { tones: 'iron' });
  const sign = new THREE.Group(); sign.name = `${rec.id}-sign-pivot`;
  sign.add(sb.build({ name: `${rec.id}-sign` }));
  sign.position.set(SIGN.x, SIGN.y, SIGN.z);
  group.add(sign);

  fr.apply(group);
  const W3 = (v) => toWorld(group, v);
  const wins = [
    ...bays.map((w, i) => ({ id: `${rec.id}-bay-${i}`, pos: W3(w.glowPos) })),
    ...sideWins.map((v, i) => ({ id: `${rec.id}-win-${i}`, pos: W3(v) })),
  ];

  return {
    group,
    update(t) {
      if (!manual) {
        const tower = ctx.registry?.get?.('clocktower')?.api;
        let total = tower ? (typeof tower.time === 'number' ? tower.time : tower.getTime?.()) : null;
        if (Array.isArray(total)) total = total[0] * 60 + total[1];
        if (typeof total !== 'number') total = 11 * 60 + 55 + Math.floor(Math.max(0, t) / CLOCK_S);
        total = ((Math.round(total) % 720) + 720) % 720;
        const h = Math.floor(total / 60), m = total % 60;
        if (h !== clock[0] % 12 || m !== clock[1]) showTime(h, m);
      }
      sign.rotation.z = -Math.floor(Math.max(0, t) * 4) * ((Math.PI * 2) / 40);   // a quarter tooth per tick, 4 fps
    },
    anchors: {
      doors: [{ id: `${rec.id}-door`, pivot: d.pivot, open: d.open }],
      chimneys: [W3(chimTop)],
      windows: wins,
      lights: [
        ...lamps.map((l) => ({ ...l, pos: W3(l.pos) })),
        // shop-window pools out and down in front of the bays (the glass itself glows; a light at the glass lit the
        // copper canopies above it saturated green)
        ...bays.map((w) => ({ pos: W3(w.lightPos), color: P.glow[1], r: 1.5, kind: 'window' })),
      ],
      perches: [
        W3(V3(0, FIN.y + FIN.r + 0.02, FIN.z - 0.02)),           // the gear finial
        W3(V3(-RH, YR + 0.07, 0)), W3(V3(RH, YR + 0.07, 0)),     // ridge ends
        W3(V3(CHIM.x + 0.15, CHIM.top + 0.1, CHIM.z)),           // chimney cap
        W3(V3(-GAB.hw[1] - 0.15, GAB.top[0] + GAB.cope, (GAB.zf + GAB.zb) / 2)),  // first step, left / right
        W3(V3(GAB.hw[1] + 0.15, GAB.top[0] + GAB.cope, (GAB.zf + GAB.zb) / 2)),
        W3(V3(SIGN.x - 0.2, SIGN.armY + 0.03, SIGN.z)),          // sign bracket
      ],
      spots: {
        doorstep: W3(V3(0, 0, ZF + 0.7)),
        windowShopL: W3(V3(-BAY.x, 0, ZF + 0.75)), windowShopR: W3(V3(BAY.x, 0, ZF + 0.75)),
        dial: W3(V3(0, DIAL.y, DIAL.z + 0.2)), sign: W3(V3(SIGN.x, SIGN.y, SIGN.z)),
      },
    },
    api: {
      setDoor: (f) => d.open(f),
      setLit: (on) => group.traverse((o) => o.userData.layer === 'glass' && setGlowLit(o, on)),
      setTime,
      getTime: () => [...clock],
    },
    stats: { clockworks: 1 },
  };
}
