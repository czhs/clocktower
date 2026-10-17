// house-5 — "Elderhollow Apothecary" (owner: house-5 agent). docs/TOWN.md §4 (piece API), §6 (scale rules).
//
// DESIGN NOTE
// Identity source: pipgws packages/assets/scripts/houses/house-5.ts (v1). West-facing 4x5 lot (x 40..44, z 14..19),
// door in the WEST side wall at its south end (door tile 39,18 = a lane tile), the GABLE END faces the camera (south).
// Signature shape (must read at 640x360 from the gameplay camera, distinct from every neighbour):
//   * a steep (60 deg, 1.5:1 on screen) JERKINHEAD roof - the gable is clipped by a little hip at ~60 % of its
//     height on both ends - in the teal-blue slate ramp ('blue'), stepped courses with a line + rim each;
//   * a three-sided projecting BAY WINDOW on the gable end, crammed with coloured bottles on two shelves (glass
//     layer: tinted by day, each bottle glows its own colour at night in front of a dim amber shop light), under a
//     little hipped lead hood with a brass pestle finial;
//   * a verdigris copper STILL-FLUE with a witch-hat cowl on the right (east) slope instead of a chimney.
// Palette rows (TOWN.md §3): walls plaster (cream limewash), stone (rubble plinth, bay base), ashlar (sills, step);
//   roof blue; timbers = bottle green paintRamp('#2c4630') (v1 TIMBER), door paintRamp('#3e6a46') (v1 door paint),
//   shutters paintRamp('#7a3a1e') (layout style); copper (flue), brass (finial, collars, plaque rims), iron (brackets);
//   glass / glow; bottles = paintRamp of the v1 BOTTLES hexes; herbs leaf / mossTuft / thatch + flowerViolet;
//   pots brick; crate plank.
// Key details (v1): green corner timbers + wall plates, rubble plinth, diamond-leaded attic light, two round plaques
//   (green apothecary cross left, mortar & pestle right), herb bundles drying on a pole under the clipped hip, potted
//   herbs either side of the bay, green door with a lantern, herbs drying on the side wall, a crate of empty bottles.
// Side-door readability (§6, round 4): the door sits in a 45-deg CHAMFER of the south-west corner (a recessed corner
//   shop entrance) under a little GABLED PORCH that projects south 0.5 m past the gable wall: a teal-slate jerkinhead
//   in miniature on two bottle-green posts, its gable (plaster, the mortar & pestle plaque) facing the yaw-0 camera.
//   The posts stand either side of the door's screen span, so the green door in its pale ashlar surround, the step
//   and the mat read through the opening; the open west side faces the door tile 39,18. The lantern hangs on the
//   west post's south face, the swinging shop sign (apothecary cross, stepped 4 fps gusts) from an iron bracket on its
//   west side. (Round 2's west hood read only as a blue sliver; round 3's bare chamfer under the main eave read as a
//   dark slot with a lamp.)
// Fix round (TOWN.md 11 verifiers): the door leaf is a brighter shop green with a glazed upper panel in cream bars
//   (glows at night) + brass kick plate, in cream jambs under a cream-lettered fascia, so it reads in the porch shade;
//   the NW corner is chamfered (walls + a clipped roof corner) so nothing of this cottage lies inside house-4's
//   never-cut keep box (house-4 is turned -45 deg) - see NWL / KNW.
// At 640x360 it must read as: a cream cottage seen gable-on under a tall blue clipped roof, with a glowing jewel-box
//   window at the bottom centre and a green copper pipe with a pointed hat on the right.
//
// Local frame: origin = footprint centre (42, 0, 16.5), axes WORLD-aligned (no rotation): +z = south (the gable the
// camera sees), -x = west (the door wall).
import * as THREE from 'three';
import { Builder, M, NORMAL_RY, window_, door as kitDoor, flowerBox, setGlowLit, wallWithOpenings } from '../kit.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';
import { toWorld } from '../api.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- dimensions (metres)
const HW = 1.85;              // wall half-width (x)   -> walls x -1.85..1.85 (lot -2..2)
const HL = 2.38;              // wall half-length (z)  -> walls z -2.38..2.38 (lot -2.5..2.5)
const EAVE = 2.8;
const TAN_T = Math.sqrt(3);   // 60 deg main pitch: the gable rakes are clean 2-1-2-1 pixel stairs on screen
const RIDGE = EAVE + HW * TAN_T;      // 6.004
const CLIP = 0.6;             // the hip clips the gable at 60 % of its height
const RECESS = 0.75;          // ridge end recessed this far behind the gable wall plane
const OE = 0.25, OG = 0.22;   // eave / gable overhangs
const DOOR_W = 0.9, DOOR_H = 1.95;
// SW corner chamfer: legs CH along x and z (run CH * sqrt 2 = 1.27 m); frame origin = chamfer midpoint on the wall plane,
// local +z = outward normal (SW), local +x = toward the south wall end. ry -pi/4 maps +z -> (-0.707, 0, 0.707).
const CH = 0.9, CHL = CH * Math.SQRT2, CH_IN = 0.3 * Math.SQRT2;   // run length, inset of a 0.3 m slab measured along x/z
const CHX = -HW + CH / 2, CHZ = HL - CH / 2, CH_RY = -Math.PI / 4;
const CHN = [-Math.SQRT1_2, Math.SQRT1_2];
const FC = M({ at: [CHX, 0, CHZ], ry: CH_RY });
const chPt = (lx, lz) => V3(CHX + lx * Math.SQRT1_2 + lz * CHN[0], 0, CHZ + lx * Math.SQRT1_2 + lz * CHN[1]);
const CZ = -0.55, CD = 1.8, CE = EAVE, CR = 4.95;   // west cross gable: centre z, width, eave, ridge
// NW corner clearance (fix round, 'mossbank-foliage'): house-4 is turned -45 deg about (39.5, 11) (TOWN.md 12.1), so its
// focus KEEP box (town.js houseBox 'full': footprint + 0.35 m + door tile, never cut) reaches into this cottage's NW
// corner: its east face is the world plane x + z = 54.53, i.e. local x + z = -3.97. Whatever of house-5 sat behind that
// plane survived the roof-off lift when house-4 is focused and stood as a green post + a slate sliver in front of
// Mossbank's front-east corner. So nothing of house-5 crosses local x + z = KNW (0.12 m margin): the NW corner of the
// walls is chamfered (legs NWL, like the SW door chamfer) and the roof's NW eave corner is clipped by a little hip.
const NWL = 0.7, KNW = -3.85;

// ---- ramps
const GREEN = paintRamp('#2c4630', { lightness: 0.34 });   // v1 TIMBER bottle green
// v1 door paint #3e6a46 (paintRamp lightness 0.3), but the lit tone is mid x 1.25 WITHOUT paintRamp's cream lerp: the
// creamed lit tone (#7F9775) of the sunlit SW-facing leaf matched the grass and read as a hole at yaw 0
// (fix round, 'doors-visible': under the porch the leaf is always in the shadow tone, and the old shadow tone (#2b3d33-ish)
// read as a dark strip. A brighter, cooler shop green whose SHADOW tone is still a clear mid green, set in cream jambs)
const DOORP = ['#7cc49a', '#4f9a72', '#3f7d62'];
const SHUT = paintRamp('#7a3a1e');                         // layout style.shutters
const BOTTLES = ['#c0304a', '#3f9a5a', '#4a6ec8', '#9a4ab4', '#e8a030', '#38a0a0'];   // v1 BOTTLES
const BOTTLE_DAY = BOTTLES.map((h) => paintRamp(h, { lightness: 0.5 }));
// night: each bottle keeps its hue but is mixed 40 % toward the glow ramp (#FFC46B), so the bay reads as warm lamplight
// through tinted glass instead of new pastel hues
const BOTTLE_GLOW = BOTTLES.map((h) => '#' + new THREE.Color(paintRamp(h, { lightness: 0.6 })[0]).lerp(new THREE.Color(TOWN_PALETTE.glow[1]), 0.4).getHexString());

/** Box between two points: `a` = size across in the "up-ish" direction, `t` = size across sideways. */
function beam(b, p0, p1, a, t, opts) {
  const d = p1.clone().sub(p0).normalize();
  const upRef = Math.abs(d.y) > 0.95 ? V3(1, 0, 0) : V3(0, 1, 0);
  const v = upRef.clone().sub(d.clone().multiplyScalar(upRef.dot(d))).normalize();   // up-ish, perpendicular
  const u = d.clone().cross(v).normalize();
  const c = [];
  for (let i = 0; i < 8; i++) {
    const base = i & 1 ? p1 : p0;
    c.push(base.clone().addScaledVector(v, (i & 2 ? 0.5 : -0.5) * a).addScaledVector(u, (i & 4 ? 0.5 : -0.5) * t));
  }
  return b.hexa(c, opts);
}

/** 8-gon disc facing +z (plaques): radius r, thickness th, centred at (x, y, z). */
function disc(b, x, y, z, r, th, opts) {
  const g = new THREE.CylinderGeometry(r, r, th, 8, 1);
  g.rotateY(Math.PI / 8);
  b.add(g, M({ at: [x, y, z], rx: Math.PI / 2 }), opts);
  g.dispose();
}

/**
 * Jerkinhead (clipped-gable) roof in a generic frame: a = along the ridge, p = across, y up.
 *   axis 'z': a = z - cz, p = x - cx (the main roof);  axis 'x': a = cx - x (+a = west), p = z - cz (the west wing).
 *   hw: wall half-width across the ridge; ends: {pos, neg} each {wall: a of the gable wall plane, clip: true} or
 *   {open: a extent} (an end buried in another roof). Main pitch from (hw, eave) to (0, ridge); each clipped gable is cut
 *   at `clip` of its height by a little hip whose ridge end is recessed `recess` behind the wall plane.
 * Stepped courses like kit.gableRoof (each course's lower edge lifted: one dark line + one cream rim per course).
 */
function jerkinRoof(b, o) {
  const { cx = 0, cz = 0, axis = 'z', hw, eave, ridge, clip = 0.6, recess = 0.75, oe = 0.25, og = 0.22, ends,
    seed = 5, tones = 'blue', course = 0.26, thick = 0.07, lift = 0.035, barge = null, attic = 'plaster',
    clipNW = null, nwWall = 0 } = o;   // clipNW: K, the p < 0 slope + the neg end keep a + p >= K (axis 'z' only); nwWall: wall chamfer leg
  // faces that look straight at the camera (the hips) only get a course line if the step beats the outline depth
  // threshold (0.02 m + 1 texel = 0.053 m at the gameplay zoom): they step further
  const hipLift = o.hipLift ?? lift, hipThick = Math.max(thick, hipLift + 0.03);
  const P = axis === 'z' ? (a, p, y) => V3(cx + p, y, cz + a) : (a, p, y) => V3(cx - a, y, cz + p);
  const tanT = (ridge - eave) / hw, th = Math.atan(tanT), sinT = Math.sin(th), cosT = Math.cos(th);
  const yc = eave + clip * (ridge - eave);
  const tanP = (ridge - yc) / recess, ph = Math.atan(tanP), sinP = Math.sin(ph), cosP = Math.cos(ph);
  const y0 = eave - oe * tanT, Pe = hw + oe;
  const X = (y) => Math.max(0, (ridge - y) / tanT);          // half-width of the slopes at height y
  // per end: sign, wall plane, ridge end aR, overhang plane aG, hip eave height yh0, extent fn
  const E = {};
  for (const [k, sg] of [['pos', 1], ['neg', -1]]) {
    const d = ends[k];
    if (d.open !== undefined) E[k] = { sg, open: true, ext: () => d.open };
    else {
      const aR = d.wall - recess, aG = d.wall + og, yh0 = ridge - (aG - aR) * tanP;
      E[k] = { sg, aR, aG, yh0, wall: d.wall, ext: (y) => Math.min(aG, aR + (ridge - y) / tanP) };
    }
  }
  const r = rng(seed * 7919 + 17);
  // per-run tint steps instead of the 1-px shingle pattern: the pattern also lands on the 1-texel course lip and breaks
  // the dark course line into dots (TOWN_LEARNINGS)
  const tint = () => [0.95, 1, 1, 1.04][Math.floor(r() * 4)];
  const opt = (t) => ({ tones, pattern: 'none', tint: t });
  const bounds = (sTop, kinks) => {
    const ks = [0, ...kinks.filter((x) => x > 0.05 && x < sTop - 0.05).sort((x, y) => x - y), sTop];
    const out = [0];
    for (let i = 0; i < ks.length - 1; i++) {
      const n = Math.max(1, Math.round((ks[i + 1] - ks[i]) / course));
      for (let j = 1; j <= n; j++) out.push(ks[i] + ((ks[i + 1] - ks[i]) * j) / n);
    }
    return out;
  };
  const course8 = (c, opts) => b.hexa(c, opts);

  // main slopes (p = +-)
  for (const sp of [1, -1]) {
    const np = sp * sinT, ny = cosT;
    const sTop = (ridge - y0) / sinT;
    const S = bounds(sTop, Object.values(E).filter((q) => !q.open).map((q) => (q.yh0 - y0) / sinT));
    const pp = (s, lf) => sp * (Pe - s * cosT) + np * lf, py = (s, lf) => y0 + s * sinT + ny * lf;
    for (let k = 0; k < S.length - 1; k++) {
      const last = k === S.length - 2;
      const s0 = S[k], s1 = Math.min(sTop, S[k + 1] + (last ? 0 : 0.02));
      const lf0 = last ? 0 : lift;
      const yA = y0 + s0 * sinT, yB = y0 + s1 * sinT;
      let lo0 = -E.neg.ext(yA), hi0 = E.pos.ext(yA), lo1 = -E.neg.ext(yB), hi1 = E.pos.ext(yB);
      if (clipNW !== null && sp < 0) { lo0 = Math.max(lo0, clipNW - pp(s0, lf0)); lo1 = Math.max(lo1, clipNW - pp(s1, 0)); }
      const cuts = [0];
      while (cuts[cuts.length - 1] < 1 - 1e-6) {
        const len = 0.15 + r() * 0.28;
        cuts.push(cuts[cuts.length - 1] + len > 0.88 ? 1 : cuts[cuts.length - 1] + len);
      }
      for (let i = 0; i < cuts.length - 1; i++) {
        const ta = cuts[i], tb = cuts[i + 1];
        const A = (t, lo, hi) => lo + (hi - lo) * t;
        const Q = (t, s, lo, hi, lf) => P(A(t, lo, hi), pp(s, lf), py(s, lf));
        course8([
          Q(ta, s0, lo0, hi0, lf0 - thick), Q(tb, s0, lo0, hi0, lf0 - thick), Q(ta, s0, lo0, hi0, lf0), Q(tb, s0, lo0, hi0, lf0),
          Q(ta, s1, lo1, hi1, -thick), Q(tb, s1, lo1, hi1, -thick), Q(ta, s1, lo1, hi1, 0), Q(tb, s1, lo1, hi1, 0),
        ], opt(tint()));
      }
    }
  }
  // the little hips on the clipped ends
  for (const q of Object.values(E)) {
    if (q.open) continue;
    const sz = q.sg, ny = cosP, na = sz * sinP;
    const sTop = (ridge - q.yh0) / sinP;
    const S = bounds(sTop, []);
    const pa = (s, lf) => sz * (q.aG - s * cosP) + na * lf, py = (s, lf) => q.yh0 + s * sinP + ny * lf;
    for (let k = 0; k < S.length - 1; k++) {
      const last = k === S.length - 2;
      const s0 = S[k], s1 = Math.min(sTop, S[k + 1] + (last ? 0 : 0.02));
      const lf0 = last ? 0 : hipLift;
      const x0 = X(q.yh0 + s0 * sinP), x1 = X(q.yh0 + s1 * sinP);
      const Q = (t, s, xx, lf) => P(pa(s, lf), t * xx, py(s, lf));
      course8([
        Q(-1, s0, x0, lf0 - hipThick), Q(1, s0, x0, lf0 - hipThick), Q(-1, s0, x0, lf0), Q(1, s0, x0, lf0),
        Q(-1, s1, x1, -hipThick), Q(1, s1, x1, -hipThick), Q(-1, s1, x1, 0), Q(1, s1, x1, 0),
      ], opt(tint()));
    }
  }
  // ridge cap + hip rolls (one shade darker)
  const cap = { tones, pattern: 'none', tint: 0.94 };
  const aLo = E.neg.open ? -E.neg.ext() : -E.neg.aR, aHi = E.pos.open ? E.pos.ext() : E.pos.aR;
  beam(b, P(aLo - (E.neg.open ? 0 : 0.05), 0, ridge + 0.025), P(aHi + (E.pos.open ? 0 : 0.05), 0, ridge + 0.025), 0.13, 0.2, cap);
  for (const q of Object.values(E)) {
    if (q.open) continue;
    for (const sp of [1, -1]) beam(b, P(q.sg * q.aG, sp * X(q.yh0), q.yh0 + 0.03), P(q.sg * q.aR, 0, ridge + 0.03), 0.1, 0.12, cap);
    // barge boards under both rakes of the clipped gable
    if (barge) for (const sp of [1, -1]) {
      // the clipped NW corner: the west barge starts where the corner hip meets the rake
      const p0 = clipNW !== null && sp < 0 && q.sg < 0 ? Math.max(-Pe, clipNW + q.aG + 0.08) : sp * Pe;
      beam(b, P(q.sg * (q.aG - 0.04), p0, y0 + (Pe - Math.abs(p0)) * tanT - thick - 0.08), P(q.sg * (q.aG - 0.04), sp * X(q.yh0), q.yh0 - thick - 0.08), 0.16, 0.06, { tones: barge, pattern: 'none' });
    }
  }
  // NW corner hip roll: covers the stepped course ends along the clip line a + p = K (eave -> gable overhang plane)
  if (clipNW !== null) {
    const pA = -Pe, pB = Math.max(-Pe, clipNW + E.neg.aG);
    const yA = y0 + 0.06, yB = y0 + (Pe + pB) * tanT + 0.06;
    beam(b, P(clipNW - pA - 0.03, pA + 0.02, yA), P(clipNW - pB, pB, yB), 0.1, 0.12, cap);
  }
  // attic: wall-tone hexa closing the clipped gables (kept ~1 roof-thickness under the slopes: no coplanar faces)
  if (attic) {
    const dd = 0.09;
    const xAt = (y) => (ridge - dd / cosT - y) / tanT;
    const yt = yc - dd;
    const aN = E.neg.open ? -E.neg.ext() : -E.neg.wall, aP = E.pos.open ? E.pos.ext() : E.pos.wall;
    b.hexa([
      P(aN, -hw + nwWall, eave - 0.01), P(aN, hw, eave - 0.01), P(aN, -xAt(yt), yt), P(aN, xAt(yt), yt),
      P(aP, -hw, eave - 0.01), P(aP, hw, eave - 0.01), P(aP, -xAt(yt), yt), P(aP, xAt(yt), yt),
    ], { tones: attic, pattern: 'plaster' });
  }
  return { yc, y0, Pe, X, E };
}

export default function build(engine, ctx) {
  const rec = ctx.record;
  const seed = ctx.seed ?? 5;
  const r = rng(seed * 31 + 3);
  const b = new Builder(engine, { name: rec.id });
  const plaster = { tones: 'plaster', pattern: 'plaster' };
  const green = { tones: GREEN, pattern: 'none' };
  const windows = [];
  let lamp = null;

  // ------------------------------------------------------------------ plinth + walls + timbers
  const PL = 0.32;
  const rubble = { tones: 'stone', pattern: 'rubble' };
  // vertical slab over a plan quad [p00, p10, p01, p11] (hexa corner order: bit0 = "x", bit2 = "z")
  const planSlab = (q, y0, y1, opts) => b.hexa([
    V3(q[0][0], y0, q[0][1]), V3(q[1][0], y0, q[1][1]), V3(q[0][0], y1, q[0][1]), V3(q[1][0], y1, q[1][1]),
    V3(q[2][0], y0, q[2][1]), V3(q[3][0], y0, q[3][1]), V3(q[2][0], y1, q[2][1]), V3(q[3][0], y1, q[3][1]),
  ], opts);
  const ZC = HL - CH;                       // where the west wall meets the chamfer
  // plinth: north block, south trapezoid (behind the chamfer slab), chamfer strip split around the door
  // (north block minus the NW corner chamfer strip: plinth face 0.06 m proud of the wall chamfer)
  const NWP = NWL + 0.06 * (2 - Math.SQRT2), zP = -HL - 0.06 + NWP;
  b.box(2 * HW + 0.12, PL + 0.06, ZC - zP, { ...rubble, at: [0, -0.06, (ZC + zP) / 2] });
  planSlab([[-HW - 0.06 + NWP, -HL - 0.06], [HW + 0.06, -HL - 0.06], [-HW - 0.06, zP], [HW + 0.06, zP]], -0.06, PL, rubble);
  planSlab([[-HW + CH_IN, ZC], [HW + 0.06, ZC], [-HW + CH + CH_IN + 0.06, HL + 0.06], [HW + 0.06, HL + 0.06]], -0.06, PL, rubble);
  // body: north block (incl. the solid west wall) + the south trapezoid inset 0.3 m behind the chamfer plane
  b.box(2 * HW, EAVE + 0.05, ZC + HL - NWL, { ...plaster, at: [0, -0.05, (ZC - HL + NWL) / 2] });
  planSlab([[-HW + NWL, -HL], [HW, -HL], [-HW, -HL + NWL], [HW, -HL + NWL]], -0.05, EAVE, plaster);
  planSlab([[-HW + CH_IN, ZC], [HW, ZC], [-HW + CH + CH_IN, HL], [HW, HL]], -0.05, EAVE, plaster);
  const FW = M({ at: [-HW, 0, 0], ry: NORMAL_RY['-x'] });       // west frame: local x = world z, +z = world -x
  const inF = (m, w) => ({ center: w.center.applyMatrix4(m), glowPos: w.glowPos.applyMatrix4(m) });   // kit returns frame-local points
  b.push(FC);
  {
    // the chamfer wall (0.3 m) with the door hole, its plinth strip
    wallWithOpenings(b, { x0: -CHL / 2, x1: CHL / 2, y0: -0.05, y1: EAVE, z0: 0, openings: [{ x: 0, y: -0.05, w: DOOR_W, h: DOOR_H + 0.05 }] });
    for (const [xa, xb] of [[-CHL / 2 - 0.04, -DOOR_W / 2 - 0.06], [DOOR_W / 2 + 0.06, CHL / 2 + 0.04]]) {
      b.box(xb - xa, PL + 0.06, 0.31, { ...rubble, at: [(xa + xb) / 2, -0.06, -0.25 + 0.155] });
    }
    // door frame: green jambs + head, arched spandrels, threshold, dark interior (glows warm when the door is open)
    // (round 3: the surround is pale ashlar, not green: from yaw 0 green jambs + green leaf + green posts merged into
    // one green slot; a pale frame outlines the green door)
    // (fix round: cream, not ashlar - ashlar's shadow tone is the plaster grey, so in the porch shade the frame vanished;
    // cream jambs proud of the wall + a cream head outline the green leaf even in shadow)
    const surround = { tones: 'cream', pattern: 'none' };
    b.box(0.12, DOOR_H + 0.1, 0.13, { ...surround, at: [-DOOR_W / 2 - 0.06, 0, 0.035] });
    b.box(0.12, DOOR_H + 0.1, 0.13, { ...surround, at: [DOOR_W / 2 + 0.06, 0, 0.035] });
    b.box(DOOR_W + 0.32, 0.13, 0.14, { ...surround, at: [0, DOOR_H, 0.04] });
    const w = DOOR_W, h = DOOR_H;
    b.prism([[-w / 2, h - w * 0.3], [-w * 0.3, h - w * 0.08], [0, h], [-w / 2, h]], 0.08, { ...green, at: [0, 0, -0.06] });
    b.prism([[w / 2, h - w * 0.3], [w / 2, h], [0, h], [w * 0.3, h - w * 0.08]], 0.08, { ...green, at: [0, 0, -0.06] });
    b.box(w + 0.1, 0.05, 0.3, { tones: 'ashlar', pattern: 'none', at: [0, 0, -0.1] });
    b.box(w, h, 0.02, { tones: '#2A1A20', layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2, at: [0, 0, -0.29] });
    // a green fascia over the door head (the shop's front board) + a brass rail on it
    b.box(CHL - 0.12, 0.2, 0.05, { ...green, at: [0, DOOR_H + 0.16, 0.025] });
    for (let i = 0; i < 5; i++) b.box(0.09, 0.07, 0.02, { tones: 'cream', pattern: 'none', at: [-0.36 + i * 0.18, DOOR_H + 0.225, 0.055] });   // gilt-cream lettering
    b.box(CHL - 0.2, 0.035, 0.04, { tones: 'brass', pattern: 'none', at: [0, DOOR_H + 0.33, 0.06] });
    // doorstep (on the door tile: <= 0.4 deep, <= 0.15 tall) + coir mat
    b.box(1.12, 0.088, 0.4, { tones: 'ashlar', pattern: 'none', at: [0, -0.02, 0.2] });  // top 12 mm = pool skin below
    b.box(0.8, 0.017, 0.36, { tones: 'thatch', pattern: 'none', at: [0, 0.081, 0.2] });     // coir mat (+ 12 mm skin)
  }
  b.pop();
  b.push(FW);
  {
    // small back window (north of the sign)
    windows.push(inF(FW, window_(b, { at: [CZ, 1.6, 0], w: 0.5, h: 0.6, panes: [2, 2], frame: GREEN, bar: 0.045 })));
    // herbs drying on the side wall: a rail with bundles hanging
    b.box(0.66, 0.05, 0.06, { tones: 'timber', pattern: 'none', at: [-1.45, 2.06, 0.08] });
    const hk = ['leaf', 'thatch', TOWN_PALETTE.flowerViolet, 'mossTuft'];
    for (let i = 0; i < 4; i++) {
      const hx = -1.71 + i * 0.18;
      b.box(0.1, 0.24 + (i % 2) * 0.05, 0.08, { tones: hk[(i + 1) % hk.length], layer: 'soft', at: [hx, 1.82 - (i % 2) * 0.05, 0.1] });
    }
  }
  b.pop();

  // bottle-green corner posts + wall plates (v1: green corner timbers and top rails) + a mid rail on the side walls
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (sx < 0) continue;            // the SW corner is the open porch (below), the NW corner is chamfered (posts below)
    b.box(0.16, EAVE - PL + 0.02, 0.16, { ...green, at: [sx * (HW - 0.05), PL - 0.02, sz * (HL - 0.05)] });
  }
  for (const [x, z] of [[-HW + 0.04, -HL + NWL], [-HW + NWL, -HL + 0.04]]) b.box(0.12, EAVE - PL + 0.02, 0.12, { ...green, at: [x, PL - 0.02, z] });
  // wall plates: the south + west plates stop at the chamfer ends (the SW corner is carried by the gabled porch below)
  b.box(2 * HW + 0.03 - NWL, 0.14, 0.08, { ...green, at: [(0.03 + NWL) / 2, EAVE - 0.14, -HL] });
  b.box(2 * HW - CH + 0.03, 0.14, 0.08, { ...green, at: [(CH + 0.03) / 2, EAVE - 0.14, HL] });
  b.box(0.08, 0.14, 2 * HL + 0.06, { ...green, at: [HW, EAVE - 0.14, 0] });
  b.box(0.08, 0.14, ZC + HL - NWL, { ...green, at: [-HW, EAVE - 0.14, (ZC - HL + NWL) / 2] });
  // the NW chamfer: plate + mid rail along it
  beam(b, V3(-HW, EAVE - 0.07, -HL + NWL), V3(-HW + NWL, EAVE - 0.07, -HL), 0.14, 0.08, green);
  beam(b, V3(-HW, 1.07, -HL + NWL), V3(-HW + NWL, 1.07, -HL), 0.1, 0.08, green);
  b.box(0.08, 0.1, 2 * HL - 0.2, { ...green, at: [HW, 1.02, 0] });
  for (const [za, zb] of [[-HL + NWL + 0.06, ZC - 0.1]]) b.box(0.08, 0.1, zb - za, { ...green, at: [-HW, 1.02, (za + zb) / 2] });

  // ------------------------------------------------------------------ roof
  const R = jerkinRoof(b, { hw: HW, eave: EAVE, ridge: RIDGE, clip: CLIP, recess: RECESS, oe: OE, og: OG, seed, tones: 'blue', barge: GREEN, lift: 0.07, thick: 0.1, hipLift: 0.085, course: 0.34,
    ends: { pos: { wall: HL }, neg: { wall: HL } }, clipNW: KNW, nwWall: NWL });

  // ------------------------------------------------------------------ the bottle bay (south gable end)
  // (round 3: narrowed + shifted 0.12 m east so its west cheek clears the SW door chamfer by 0.2 m)
  const BZ = HL, BD = 0.45, BB = 0.92, BF = 0.6, BXC = 0.12;   // wall plane, depth, back / front half-width, centre x
  const BM = M({ at: [BXC, 0, 0] });
  b.push(BM);
  const bay = (y0, y1, grow, opts) => b.hexa([
    V3(-BB - grow, y0, BZ - 0.02), V3(BB + grow, y0, BZ - 0.02), V3(-BB - grow, y1, BZ - 0.02), V3(BB + grow, y1, BZ - 0.02),
    V3(-BF - grow * 0.6, y0, BZ + BD + grow), V3(BF + grow * 0.6, y0, BZ + BD + grow), V3(-BF - grow * 0.6, y1, BZ + BD + grow), V3(BF + grow * 0.6, y1, BZ + BD + grow),
  ], opts);
  const G0 = 0.91, G1 = 1.95;
  bay(-0.05, 0.85, 0, { tones: 'stone', pattern: 'rubble' });
  bay(0.85, G0, 0.05, { tones: 'ashlar', pattern: 'none' });
  // mid shelf
  b.hexa([
    V3(-BB + 0.03, 1.4, BZ), V3(BB - 0.03, 1.4, BZ), V3(-BB + 0.03, 1.45, BZ), V3(BB - 0.03, 1.45, BZ),
    V3(-BF + 0.02, 1.4, BZ + BD - 0.06), V3(BF - 0.02, 1.4, BZ + BD - 0.06), V3(-BF + 0.02, 1.45, BZ + BD - 0.06), V3(BF - 0.02, 1.45, BZ + BD - 0.06),
  ], { tones: 'plank', pattern: 'none' });
  // dim amber shop light behind the bottles (dark glass by day)
  b.box(2 * BB, G1 - G0, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[2], glowKind: 1, at: [0, G0, BZ + 0.03] });
  // mullions: back posts, front corner posts, centre bar, head rails
  for (const s of [-1, 1]) {
    b.box(0.07, G1 - G0, 0.07, { ...green, at: [s * (BB - 0.02), G0, BZ + 0.04] });
    b.box(0.08, G1 - G0, 0.08, { ...green, at: [s * BF, G0, BZ + BD - 0.02] });
    beam(b, V3(s * BB, G1 - 0.04, BZ + 0.02), V3(s * BF, G1 - 0.04, BZ + BD - 0.02), 0.08, 0.07, green);
    beam(b, V3(s * BB, 1.425, BZ + 0.02), V3(s * BF, 1.425, BZ + BD - 0.02), 0.05, 0.05, green);
  }
  b.box(0.05, G1 - G0, 0.05, { ...green, at: [0, G0, BZ + BD - 0.02] });
  b.box(2 * BF + 0.08, 0.08, 0.08, { ...green, at: [0, G1 - 0.08, BZ + BD - 0.02] });
  b.box(2 * BF, 0.05, 0.05, { ...green, at: [0, 1.4, BZ + BD - 0.02] });
  // bottles on the sill and the shelf (glass layer: tinted by day, each glows its own colour at night)
  const shelfPath = (t) => {   // t 0..1 along the bay polyline (left cheek -> front -> right cheek), inset
    const pts = [[-BB + 0.1, BZ + 0.08], [-BF + 0.06, BZ + BD - 0.12], [BF - 0.06, BZ + BD - 0.12], [BB - 0.1, BZ + 0.08]];
    const seg = [0.22, 0.56, 0.22];
    let a = t;
    for (let i = 0; i < 3; i++) {
      if (a <= seg[i] || i === 2) { const f = Math.min(1, a / seg[i]); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
      a -= seg[i];
    }
    return pts[3];
  };
  let nb = 0;
  for (const [row, y] of [[0, G0], [1, 1.45]]) {
    let t = 0.03 + row * 0.02;
    while (t < 0.97) {
      const kind = (nb + row) % 3;
      const ci = (nb * 2 + row * 3 + 1) % BOTTLES.length;
      const [x, z] = shelfPath(t);
      const g = { tones: BOTTLE_DAY[ci], layer: 'glass', glow: BOTTLE_GLOW[ci], glowKind: 1 };
      if (kind === 0) {          // round flask + neck
        b.box(0.13, 0.13, 0.12, { ...g, at: [x, y, z] });
        b.box(0.05, 0.08, 0.05, { ...g, at: [x, y + 0.13, z] });
        t += 0.1;
      } else if (kind === 1) {   // tall bottle + neck
        b.box(0.08, 0.2, 0.08, { ...g, at: [x, y, z] });
        b.box(0.05, 0.07, 0.05, { ...g, at: [x, y + 0.2, z] });
        t += 0.075;
      } else {                   // squat jar with a paper lid
        b.box(0.11, 0.09, 0.1, { ...g, at: [x, y, z] });
        b.box(0.12, 0.04, 0.11, { tones: 'cream', pattern: 'none', at: [x, y + 0.09, z] });
        t += 0.085;
      }
      t += 0.012 + r() * 0.02;
      nb++;
    }
  }
  // little hipped lead hood over the bay + brass pestle finial
  b.hexa([
    V3(-BB - 0.08, G1, BZ), V3(BB + 0.08, G1, BZ), V3(-BB + 0.12, 2.34, BZ), V3(BB - 0.12, 2.34, BZ),
    V3(-BF - 0.07, G1 - 0.02, BZ + BD + 0.1), V3(BF + 0.07, G1 - 0.02, BZ + BD + 0.1), V3(-BF + 0.08, 2.12, BZ + BD - 0.16), V3(BF - 0.08, 2.12, BZ + BD - 0.16),
  ], { tones: 'blue', pattern: 'none' });
  b.box(0.05, 0.13, 0.05, { tones: 'brass', pattern: 'none', at: [0, 2.2, BZ + 0.2] });
  b.box(0.09, 0.08, 0.09, { tones: 'brass', pattern: 'none', at: [0, 2.33, BZ + 0.2] });
  windows.push(inF(BM, { center: V3(0, 1.4, BZ + BD), glowPos: V3(0, 1.4, BZ + BD + 0.3) }));
  b.pop();

  // potted herbs east of the bay (the west side is the porch now; outside the lot by <= 0.4 m)
  for (const [px, fl] of [[1.48, true]]) {
    b.cylinder(0.11, 0.14, 0.24, { at: [px, -0.02, HL + 0.24], tones: 'brick' });
    b.cylinder(0.16, 0.07, 0.22, { at: [px, 0.22, HL + 0.24], tones: 'leaf', layer: 'soft' });
    if (fl) for (const [fx, fz] of [[-0.06, 0.06], [0.07, 0.03]]) b.box(0.07, 0.07, 0.07, { tones: TOWN_PALETTE.flowerViolet, layer: 'soft', at: [px + fx, 0.36, HL + 0.24 + fz] });
  }

  // ------------------------------------------------------------------ gable dressing (south)
  // diamond-leaded attic light
  const AY = 3.5, AW = 0.5, AH = 0.46;
  windows.push(window_(b, { at: [0, AY, HL], w: AW, h: AH, panes: [1, 1], frame: GREEN, bar: 0.05 }));
  {
    const sp = 0.17, x0 = -AW / 2, x1 = AW / 2, ya = AY - AH / 2, yb = AY + AH / 2;
    for (const dir of [1, -1]) for (let c = -0.6; c <= 0.6 + 1e-6; c += sp) {
      // line x = dir * (y - AY) + c, clipped to the pane
      const pts = [];
      for (const y of [ya, yb]) { const x = dir * (y - AY) + c; if (x >= x0 && x <= x1) pts.push(V3(x, y, 0)); }
      for (const x of [x0, x1]) { const y = (x - c) / dir + AY; if (y > ya && y < yb) pts.push(V3(x, y, 0)); }
      if (pts.length < 2) continue;
      const [p, q] = pts;
      if (p.distanceTo(q) < 0.08) continue;
      beam(b, V3(p.x, p.y, HL + 0.005), V3(q.x, q.y, HL + 0.005), 0.035, 0.03, { tones: GREEN, pattern: 'none' });
    }
  }
  // round plaque: green apothecary cross (right; the mortar & pestle plaque moved to the porch gable, left)
  const PY = 3.42, PLX = 1.05;
  disc(b, PLX, PY, HL + 0.03, 0.19, 0.05, { tones: 'brass', pattern: 'none' });
  disc(b, PLX, PY, HL + 0.05, 0.14, 0.05, { tones: 'cream', pattern: 'none' });
  b.box(0.2, 0.06, 0.04, { ...green, at: [PLX, PY - 0.03, HL + 0.085] });
  b.box(0.06, 0.2, 0.04, { ...green, at: [PLX, PY - 0.1, HL + 0.085] });
  // herb bundles drying on a pole under the clipped hip
  {
    const py = R.E.pos.yh0 - 0.16, hw = 0.68, pz = HL + 0.14;
    b.box(2 * hw + 0.1, 0.05, 0.05, { tones: 'timber', pattern: 'none', at: [0, py, pz] });
    const kinds = ['leaf', 'thatch', TOWN_PALETTE.flowerViolet, 'mossTuft', 'thatch'];
    let k = 0;
    for (let x = -hw + 0.08; x <= hw - 0.07; x += 0.22, k++) {
      const len = 0.17 + (k % 3) * 0.04;
      b.box(0.1, len, 0.07, { tones: kinds[k % kinds.length], layer: 'soft', at: [x, py - len, pz] });
      b.box(0.05, 0.05, 0.05, { tones: kinds[k % kinds.length], layer: 'soft', tint: 0.95, at: [x, py - len - 0.05, pz] });
    }
  }

  // ------------------------------------------------------------------ east wall: two shuttered windows + flower box
  const FE = M({ at: [HW, 0, 0], ry: NORMAL_RY['+x'] });        // local x = world -z
  b.push(FE);
  for (const lx of [-1.0, 1.0]) windows.push(inF(FE, window_(b, { at: [lx, 1.62, 0.04], w: 0.56, h: 0.72, panes: [2, 2], frame: 'cream', shutters: SHUT, bar: 0.05 })));
  flowerBox(b, { at: [-1.0, 1.12, 0.06], w: 0.74, seed: seed + 2, colors: [TOWN_PALETTE.flowerViolet, TOWN_PALETTE.flowerWhite, TOWN_PALETTE.flowerRed] });
  b.pop();
  // north gable: a window + a small attic light
  const FN = M({ at: [0, 0, -HL], ry: NORMAL_RY['-z'] });
  b.push(FN);
  windows.push(inF(FN, window_(b, { at: [0, 1.62, 0.0], w: 0.56, h: 0.68, panes: [2, 2], frame: GREEN, bar: 0.05 })));
  windows.push(inF(FN, window_(b, { at: [0, 3.45, 0.0], w: 0.36, h: 0.4, panes: [1, 2], frame: GREEN, bar: 0.045 })));
  b.pop();

  // ------------------------------------------------------------------ the still-flue (verdigris pipe + witch-hat cowl), right slope
  // (taller than a chimney would be: from the gameplay camera only the roof top shows above house-6, so the
  // pointed green cowl is the apothecary's skyline signature)
  const FX = 0.95, FZ = -0.55, FT = 6.45;
  b.cylinder(0.13, 0.13, FT - 4.2, { at: [FX, 4.2, FZ], tones: 'copper', pattern: 'vboards', scale: 0.4 });
  for (const cy of [4.6, 5.55]) b.cylinder(0.16, 0.16, 0.08, { at: [FX, cy, FZ], tones: 'brass' });
  for (const s of [-1, 1]) b.box(0.05, 0.1, 0.05, { tones: 'iron', at: [FX + s * 0.08, FT - 0.01, FZ] });
  b.cylinder(0.3, 0.03, 0.36, { at: [FX, FT + 0.08, FZ], tones: 'copper' });
  b.box(0.08, 0.08, 0.08, { tones: 'brass', at: [FX, FT + 0.42, FZ] });
  const flueTop = V3(FX, FT + 0.02, FZ);

  // ------------------------------------------------------------------ cross gable over the door side (west)
  // style hint 'cross': a gabled wing on the west slope whose gable end faces the lane; its south slope (courses
  // running across the screen) is the part of the house the gameplay camera sees past house-6.
  // clipped like the main roof (a jerkinhead wing): from yaw 0 the clip cuts its top-left corner, so it reads as roof
  const WX = -1.0;
  const RW = jerkinRoof(b, { axis: 'x', cx: WX, cz: CZ, hw: CD / 2, eave: CE, ridge: CR, clip: 0.62, recess: 0.42, oe: 0.2, og: 0.2,
    seed: seed + 4, tones: 'blue', barge: GREEN, lift: 0.085, thick: 0.11, course: 0.26,
    ends: { pos: { wall: HW + WX }, neg: { open: -WX - 0.28 } } });
  b.box(0.06, 0.26, 0.06, { tones: 'brass', pattern: 'none', at: [WX - RW.E.pos.aR - 0.04, CR + 0.08, CZ] });
  // valley boards: the wing's stepped courses end in a ragged stair where they run into the main west slope; one lead
  // board laid in each valley (raised above both course lifts) covers the ends so every course stops on one diagonal
  {
    const tanW = (CR - CE) / (CD / 2);
    const yB = R.y0 + 0.02;                                    // main eave edge height (x = -(HW + OE))
    const xTop = -(RIDGE - CR) / TAN_T, xBot = -(RIDGE - yB) / TAN_T;
    const dzBot = (CR - yB) / tanW;
    for (const s of [1, -1]) {
      beam(b, V3(xTop + 0.02, CR + 0.07, CZ), V3(xBot, yB + 0.08, CZ + s * dzBot), 0.12, 0.22, { tones: 'blue', pattern: 'none', tint: 0.9 });
    }
  }
  b.push(FW);
  windows.push(inF(FW, window_(b, { at: [CZ, 3.45, 0.0], w: 0.42, h: 0.52, panes: [2, 2], frame: GREEN, bar: 0.045, arch: true })));
  b.pop();

  // ------------------------------------------------------------------ gabled SW porch (side-door readability, round 4)
  // A little clipped-gable porch projecting SOUTH over the chamfer door, its gable facing the yaw-0 camera: a teal-slate
  // jerkinhead (the house's signature in miniature) on two bottle-green posts, the mortar & pestle plaque on its gable.
  // Its posts stand either side of the door's screen span (door x -1.72..-1.08), so the green door, its pale surround
  // and the step read through the opening; the open west side faces the door tile 39,18.
  const QX = -1.52, QHW = 0.5, QF = 3.0, QB = 1.3, QE = 2.08;   // centre x, half-width (post centres), gable plane z, back z, eave
  const QR = QE + QHW * 1.43;                                     // ~55 deg pitch
  const PX = QX - QHW, PZ = QF - 0.06;                            // west post (lantern + sign bracket hang off it)
  {
    for (const s of [-1, 1]) {
      const x = QX + s * QHW;
      b.box(0.22, 0.12, 0.22, { tones: 'ashlar', pattern: 'none', at: [x, -0.04, PZ] });
      b.box(0.13, QE - 0.08, 0.13, { ...green, at: [x, 0.08, PZ] });
    }
    // side plates only (no tie beam / braces across the opening: at 30 deg pitch they would bar the door's upper half)
    b.box(0.08, 0.12, PZ - QB + 0.06, { ...green, at: [QX - QHW, QE - 0.12, (PZ + QB) / 2 + 0.03] });
    b.box(0.08, 0.12, PZ - HL + 0.06, { ...green, at: [QX + QHW, QE - 0.12, (PZ + HL) / 2 + 0.03] });
    b.box(0.14, QE - PL, 0.1, { ...green, at: [-HW - 0.07, PL, QB + 0.06] });            // pilaster on the west wall
    // open clipped gable (no attic infill: the door reads through it) with a BIG clipped hip (clip 0.35, shallow 47 deg):
    // from the 30 deg gameplay camera the hip is a teal-slate trapezoid facing the viewer, like the bay's hood
    const RQ = jerkinRoof(b, { cx: QX, cz: QB, hw: QHW, eave: QE, ridge: QR, clip: 0.35, recess: 0.45, oe: 0.1, og: 0.1, seed: seed + 9,
      tones: 'blue', barge: GREEN, lift: 0.07, thick: 0.09, hipLift: 0.085, course: 0.2, attic: null,
      ends: { pos: { wall: QF - QB }, neg: { open: 0 } } });
    // mortar & pestle plaque standing on the porch's ridge end (a crest board facing the camera, against the blue eave)
    const QY = QR + 0.2, QZ = QB + RQ.E.pos.aR + 0.03;
    b.box(0.05, 0.08, 0.05, { tones: 'iron', at: [QX, QR - 0.02, QZ] });
    disc(b, QX, QY, QZ, 0.17, 0.04, { tones: 'brass', pattern: 'none' });
    disc(b, QX, QY, QZ + 0.02, 0.13, 0.04, { tones: GREEN, pattern: 'none' });
    b.box(0.16, 0.05, 0.03, { tones: 'cream', pattern: 'none', at: [QX, QY - 0.07, QZ + 0.05] });   // bowl
    b.box(0.09, 0.035, 0.03, { tones: 'cream', pattern: 'none', at: [QX, QY - 0.1, QZ + 0.05] });   // foot
    beam(b, V3(QX, QY - 0.02, QZ + 0.05), V3(QX + 0.08, QY + 0.08, QZ + 0.05), 0.035, 0.03, { tones: 'cream', pattern: 'none' });   // pestle
  }
  {
    // door lantern on the west post's south face (a bright brass point at the porch's front-left corner at noon)
    const LX = PX, LZ = PZ + 0.2, LY = 1.95;
    beam(b, V3(LX, LY + 0.02, PZ + 0.06), V3(LX, LY + 0.02, LZ + 0.02), 0.05, 0.05, { tones: 'iron', pattern: 'none' });
    b.box(0.05, 0.08, 0.05, { tones: 'iron', at: [LX, LY - 0.06, LZ] });
    // brass pyramid cap (catches the sun at noon: the lantern reads as a bright point, not a dark nub)
    b.hexa([V3(LX - 0.12, LY - 0.18, LZ - 0.12), V3(LX + 0.12, LY - 0.18, LZ - 0.12), V3(LX - 0.035, LY - 0.06, LZ - 0.035), V3(LX + 0.035, LY - 0.06, LZ - 0.035),
      V3(LX - 0.12, LY - 0.18, LZ + 0.12), V3(LX + 0.12, LY - 0.18, LZ + 0.12), V3(LX - 0.035, LY - 0.06, LZ + 0.035), V3(LX + 0.035, LY - 0.06, LZ + 0.035)], { tones: 'brass', pattern: 'none' });
    b.box(0.16, 0.24, 0.16, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2, at: [LX, LY - 0.42, LZ] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.045, 0.24, 0.045, { tones: 'iron', at: [LX + sx * 0.08, LY - 0.42, LZ + sz * 0.08] });
    b.box(0.2, 0.05, 0.2, { tones: 'brass', pattern: 'none', at: [LX, LY - 0.47, LZ] });
    // the light anchor is NOT at the lamp: 1.6 m out from the door along its SW normal, 1.1 m up, reach 2.6 m. The
    // toon-banded PointLight pools on the door tile + doorstep; its outer band (~1.35 m) stops short of the west wall
    // and the bay (no hard pale disc on the plaster). hug: false (the composer's wall-hug assumes a west door plane)
    const lp = chPt(0, 1.6);
    lamp = { pos: V3(lp.x, 1.1, lp.z) };   // 1.1 m up: a 0.4 m light gave the ground N.L = h / d ~ 0.4 (no visible pool)
  }

  // ------------------------------------------------------------------ night entry pool (no PointLight needed)
  // glass-layer skins replacing the top 12 mm of the doorstep and mat: the same toon tones by day, a dim flickering
  // amber at night, so the threshold reads as lamplit even when the composer's 12-light budget drops the lantern
  {
    const pool = { layer: 'glass', glowKind: 2, glow: TOWN_PALETTE.brass[2] };
    b.push(FC);
    b.box(1.12, 0.012, 0.4, { ...pool, tones: 'ashlar', at: [0, 0.068, 0.2] });
    b.box(0.8, 0.012, 0.36, { ...pool, tones: 'thatch', at: [0, 0.098, 0.2] });
    b.pop();
  }

  // ------------------------------------------------------------------ shop-front cue: a big potted rosemary on the west apron
  // (tile 39,16 - grass, between the props signpost at 39,17 and the bottle crate; never on the lane row z 18)
  {
    const px = -HW - 0.4, pz = -0.35;
    b.cylinder(0.15, 0.19, 0.3, { at: [px, -0.02, pz], tones: 'brick' });
    b.cylinder(0.2, 0.2, 0.05, { at: [px, 0.26, pz], tones: 'brick', tint: 1.05 });
    b.cylinder(0.2, 0.1, 0.34, { at: [px, 0.3, pz], tones: 'leaf', layer: 'soft' });
    b.cylinder(0.12, 0.04, 0.2, { at: [px + 0.03, 0.6, pz - 0.02], tones: 'leaf', layer: 'soft', tint: 1.06 });
    for (const [fx, fy, fz] of [[-0.11, 0.48, 0.08], [0.1, 0.52, 0.05], [0.0, 0.66, 0.06]]) b.box(0.07, 0.07, 0.07, { tones: TOWN_PALETTE.flowerViolet, layer: 'soft', at: [px + fx, fy, pz + fz] });
  }

  // ------------------------------------------------------------------ sign bracket (static, on the porch post) + yard crate of empty bottles
  // board x -2.58..-2.18 over grass tile 39,19 (<= 0.6 m beyond the lot): clear of the lantern and the signpost (39,17)
  const SX = PX - 0.36, SZ = PZ, SY = 2.05;
  b.box(0.52, 0.05, 0.05, { tones: 'iron', at: [PX - 0.065 - 0.26, SY - 0.02, SZ] });
  beam(b, V3(PX - 0.065, SY - 0.36, SZ), V3(PX - 0.36, SY - 0.02, SZ), 0.045, 0.045, { tones: 'iron', pattern: 'none' });
  b.box(0.07, 0.07, 0.07, { tones: 'brass', at: [PX - 0.065 - 0.52, SY - 0.05, SZ] });
  {
    const cx = -HW - 0.4, cz = -1.1;   // (z >= -1.35: clear of house-4's keep plane, KNW)
    b.box(0.34, 0.28, 0.5, { tones: 'plank', pattern: 'boards', at: [cx, 0, cz] });
    for (const [i, ci] of [[0, 1], [1, 2], [2, 0]]) {
      b.box(0.06, 0.16, 0.06, { tones: BOTTLE_DAY[ci], layer: 'glass', glow: null, glowKind: 0, at: [cx + (i - 1) * 0.06, 0.28, cz - 0.15 + i * 0.15] });
    }
  }

  // woodpile against the north gable (persona extra 'woodpile'), on the grass apron behind the house
  {
    const g = new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8, 1);
    g.rotateY(Math.PI / 8);
    let i = 0;
    for (const [row, n] of [[0, 4], [1, 3], [2, 2]]) for (let k = 0; k < n; k++, i++) {
      const lx = 0.35 + (k - (n - 1) / 2) * 0.19, ly = 0.09 + row * 0.16;
      b.add(g, M({ at: [lx, ly, -HL - 0.36], rx: Math.PI / 2 }), { tones: 'trunk', tint: [1, 0.97, 1.03][i % 3] });
    }
    g.dispose();
    b.box(0.08, 0.6, 0.06, { tones: 'timber', pattern: 'none', at: [-0.08, 0, -HL - 0.36] });
    b.box(0.08, 0.6, 0.06, { tones: 'timber', pattern: 'none', at: [0.78, 0, -HL - 0.36] });
  }

  const group = b.build({ name: rec.id });

  // ------------------------------------------------------------------ hinged door (own mesh) in the west wall
  const d = kitDoor(engine, { w: DOOR_W - 0.02, h: DOOR_H - 0.01, kind: 'arched', tones: DOORP, hinge: 'left', name: `${rec.id}-door` });
  const holder = new THREE.Group();
  holder.name = `${rec.id}-door-frame`;
  {
    const hp = chPt(-DOOR_W / 2 + 0.01, 0);                 // the chamfer's north-west jamb (hinge 'left': leaf along +x)
    holder.position.set(hp.x, 0.04, hp.z);
  }
  holder.rotation.y = CH_RY;
  d.pivot.position.set(0, 0, -0.1);
  holder.add(d.pivot);
  {
    // shop-door dressing on the leaf (swings with it): a glazed upper panel (dark glass by day, warm shop light at night)
    // in cream glazing bars, a cream mid rail and a brass kick plate + letter plate that catch the light under the porch
    const db = new Builder(engine, { name: `${rec.id}-door-dress` });
    const lw = DOOR_W - 0.02, cx = lw / 2, gz = 0.012;
    db.box(lw - 0.3, 0.62, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[2], glowKind: 1, at: [cx, 1.02, gz] });
    for (const [w, h, x, y] of [[lw - 0.22, 0.06, cx, 0.98], [lw - 0.22, 0.06, cx, 1.62], [0.05, 0.62, cx, 1.02], [0.06, 0.66, cx - (lw - 0.28) / 2, 0.98], [0.06, 0.66, cx + (lw - 0.28) / 2, 0.98]]) {
      db.box(w, h, 0.03, { tones: 'cream', pattern: 'none', at: [x, y, gz + 0.005] });
    }
    db.box(lw - 0.12, 0.05, 0.03, { tones: 'cream', pattern: 'none', at: [cx, 0.6, gz + 0.005] });
    db.box(lw - 0.16, 0.16, 0.025, { tones: 'brass', pattern: 'none', at: [cx, 0.06, gz] });
    db.box(0.24, 0.05, 0.025, { tones: 'brass', pattern: 'none', at: [cx, 0.78, gz] });
    const dress = db.build({ name: `${rec.id}-door-dress` });
    d.leaf.add(dress);
    dress.position.z = 0.06 / 2;   // the leaf mesh is centred on its thickness (kit door thick 0.06): onto its front face
  }
  group.add(holder);

  // ------------------------------------------------------------------ hanging shop sign (own mesh, swings in stepped gusts)
  const sb = new Builder(engine, { name: `${rec.id}-sign` });
  // pivot-local: origin at the bracket rail, the board hangs below on two iron links
  sb.box(0.04, 0.12, 0.04, { tones: 'iron', at: [-0.16, -0.12, 0] });
  sb.box(0.04, 0.12, 0.04, { tones: 'iron', at: [0.16, -0.12, 0] });
  sb.box(0.4, 0.42, 0.05, { tones: GREEN, pattern: 'vboards', scale: 0.6, at: [0, -0.56, 0] });
  sb.box(0.44, 0.05, 0.07, { tones: 'brass', pattern: 'none', at: [0, -0.17, 0] });
  sb.box(0.44, 0.05, 0.07, { tones: 'brass', pattern: 'none', at: [0, -0.61, 0] });
  for (const sz of [1, -1]) {
    const z = sz * 0.035;
    sb.box(0.24, 0.08, 0.03, { tones: 'cream', pattern: 'none', at: [0, -0.33, z] });           // apothecary cross
    sb.box(0.08, 0.26, 0.03, { tones: 'cream', pattern: 'none', at: [0, -0.46, z] });
  }
  const signGroup = sb.build({ name: `${rec.id}-sign` });
  const signPivot = new THREE.Group();
  signPivot.name = `${rec.id}-sign-pivot`;
  signPivot.position.set(SX, SY - 0.02, SZ);
  signPivot.add(signGroup);
  group.add(signPivot);

  // place the house
  group.position.set(rec.center.x, 0, rec.center.z);
  group.updateMatrixWorld(true);
  const W3 = (v) => toWorld(group, v);

  // sign: stepped 4 fps swing, gust strength changes every 2.5 s (calm / breeze / gust) - a pure function of t
  const SWING = [0, 0.07, 0.13, 0.07, 0, -0.07, -0.13, -0.07];
  const update = (t) => {
    const k = Math.floor(t * 4);
    const gust = Math.floor(t / 2.5);
    const h = Math.abs(Math.sin(gust * 91.7 + 3.1) * 4375.85) % 1;
    const amp = h < 0.35 ? 0 : h < 0.75 ? 0.5 : 1;
    signPivot.rotation.x = amp * SWING[((k % 8) + 8) % 8];
  };
  update(0);

  const glassMeshes = [];
  group.traverse((o) => { if (o.userData.layer === 'glass') glassMeshes.push(o); });
  return {
    group,
    update,
    anchors: {
      // the real door is in the SW chamfer (faces SW): life / ground prefer normal + point over the record's west door
      // CONTRACT-REQUEST (lead, town.js houseBox): the side-row focus cut-away box is built from the layout record's WEST
      // door (x <= 40.6, y <= 2.6), so at ?focus=house-5 house-6 still hides this chamfer door + porch (world x 40.15..41.6,
      // z <= 19.6, plaque top y 3.17). Please derive the box from this door anchor (normal + point), or widen it for house-5.
      doors: [{ id: `${rec.id}-door`, pivot: d.pivot, open: d.open, normal: [...CHN], point: { x: W3(chPt(0, 0)).x, z: W3(chPt(0, 0)).z } }],
      chimneys: [W3(flueTop)],
      windows: windows.map((w, i) => ({ id: `${rec.id}-win-${i}`, pos: W3(w.glowPos) })),
      lights: [
        { pos: W3(lamp.pos), color: TOWN_PALETTE.lampGlow, r: 2.6, kind: 'lantern', flicker: true, hug: false },
      ],
      perches: [
        W3(V3(0, RIDGE + 0.1, R.E.pos.aR)), W3(V3(0, RIDGE + 0.1, -R.E.neg.aR)),       // ridge ends (on the clipped hips)
        W3(V3(FX, FT + 0.52, FZ)),                                         // the cowl's knob
        W3(V3(PX - 0.585, SY + 0.02, SZ)),                                  // the sign bracket's tip
      ],
      spots: { door: W3(chPt(0, 0.75)), bay: W3(V3(BXC, 0, BZ + BD + 0.5)), sign: W3(V3(SX, SY, SZ)) },
    },
    api: {
      setDoor: (f) => d.open(f),
      setLit: (on) => glassMeshes.forEach((m) => setGlowLit(m, on)),
      sign: signPivot,
    },
    stats: { bottles: nb },
  };
}
