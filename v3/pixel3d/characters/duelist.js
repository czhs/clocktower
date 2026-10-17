// Duelist (char-duelist) — a quick, cocky fencer: wide plumed tricorn, short cape, slim rapier.
// Design sheet: characters/duelist.md (palette, timing charts, critique).
import { biped } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const PALETTE = {
  hat: ['#F0765E', '#C23E4C', '#6C2A4A'],
  plume: ['#FFF2D6', '#E4D0AA', '#A795A8'],
  coat: ['#5F8FB4', '#365D84', '#3A3A5E'],   // sh lifted to mauve-navy (r1: #2A3558 sank into the night ground)
  skin: ['#F6D2AE', '#D9A27E', '#9A6872'],
  dark: ['#8A6E5C', '#5C4636', '#3E3430'],
  steel: ['#F0F4F6', '#B6C0CA', '#68728C'],
};

const BASE = { height: 1.36, heads: 3.9, shoulders: 0.33, legs: 1.06 };
const FACE_Y = 0.015, FACE_H = 0.26, HAT_SINK = 0.06;   // head-local face base / height, hat base below the face top (× k)
const CAPE_LEN = 0.36, PLUME_LEN = 0.45;
const WEAPON = { at: [0, -0.045, 0.01], rot: [90, 0, 0] };
const BLADE = 0.62, GUARD_Z = 0.05, SWORD_LEN = GUARD_Z + 0.02 + BLADE;
// stab streak sockets (round 2): the fx module only has ARC smears, so a straight thrust streak is faked with a
// short segment PERPENDICULAR to the blade at the tip (socket +Y = hand +Z = "up" when the arm points forward),
// swept from the anticipation tip to the contact tip. The thrust keeps the blade heading nearly constant, so the
// arc fit degenerates to a straight band along the stab line, above and below the blade (speed lines).
const TIP = [WEAPON.at[0], WEAPON.at[1] - SWORD_LEN, WEAPON.at[2]];

// ── tricorn (round 2: cocked brim, not a cone) ──
// hat-local: y 0 = hat base on the head, origin = hat centre, front corner = +Z. Three upturned brim WALLS around
// a low crown: each wall rises outward from an inset triangle (scale HAT.inner, y 0) to the brim edge (corners
// y HAT.hc, edge middles dipping to HAT.hm); the crown (8-sided frustum) tops out at HAT.crownH < HAT.hc, so the
// cocked corners stand ≥ 0.03 m above it (critic r1: the old one-loft hat read as a red cone / toadstool).
// per-corner heights [front, back-right(210°), back-left(330°)] and edge-middle heights [front-R, back, front-L]:
// the front point is LOW and the back wall the tallest, like a real tricorn (a high front corner peaked above the
// crown from behind → 'party hat' at N in the first r2 render)
const HAT = { R: 0.34, inner: 0.78, hc: [0.10, 0.17, 0.17], hm: [0.08, 0.13, 0.08], t: 0.035, trim: 0.05, foot: 0, crownR: 0.17, crownTop: 0.13, crownH: 0.095 };
const HAT_Z = -0.01;
const LACE = 'steel';   // silver lace on the brim edge: cream lace merged with the cream plume at its root (A/B r2: dark lace = murky)
// plume root: on the crown's left-back (the r1 critic's straight [.45,.65,-.6] lay flat at N/NW/W; see PLUME_DIRS)
const PLUME_AT = (m) => [0.11, (FACE_Y + FACE_H - HAT_SINK) * m.k + 0.08, HAT_Z * m.k - 0.07];
// the plume CURVES: each link has its own rest direction (rises from the crown, then arcs back) — a straight chain read
// as a cream obelisk / candle from the pack facing (r2 first renders). The chain() helper only makes straight chains,
// so the three plume bones get their per-link pos/axis after biped() (rest offsets = the previous link's direction).
const nrm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
const PLUME_DIRS = [nrm([0.45, 0.89, 0]), nrm([0.5, 0.72, -0.42]), nrm([0.5, 0.45, -0.72])];   // leans out to the left: rising from the hat centre it made a witch-hat cone at SE (golden scene)
export function skeleton(opts = {}) {
  const m = biped({ ...BASE, ...opts }).meta;
  const S = biped({ ...BASE, ...opts, chains: {
    cape: { n: 2, parent: 'chest', at: [0, m.shoulderY - m.chestY + 0.02 * m.k, -0.135 * m.k], dir: [0, -1, -0.15], len: CAPE_LEN },
    plume: { n: 3, parent: 'head', at: PLUME_AT(m), dir: PLUME_DIRS[0], len: PLUME_LEN },
  } });
  const lk = PLUME_LEN / 3;
  for (const b of S) {
    const i = /^plume(\d)$/.exec(b.name)?.[1];
    if (i === undefined) continue;
    b.axis = [...PLUME_DIRS[+i]];
    if (+i > 0) b.pos = PLUME_DIRS[+i - 1].map((x) => x * lk);
  }
  return S;
}

const pt = (deg, r, y) => [Math.cos(deg * Math.PI / 180) * r, y, Math.sin(deg * Math.PI / 180) * r];   // 90° = +Z
function hatParts() {
  const { R, inner, hc, hm, t } = HAT;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const c0 = 90 + 120 * i, mid = c0 + 60, c1 = c0 + 120;
    const n = [-Math.cos(mid * Math.PI / 180) * t, 0, -Math.sin(mid * Math.PI / 180) * t];   // inward wall normal × t
    // two half-walls per edge (corner → dipped middle), each a convex hull of a thick quad
    for (const [ca, side, ci] of [[c0, 'a', i], [c1, 'b', (i + 1) % 3]]) {
      const outer = [pt(ca, R, hc[ci]), pt(mid, R / 2, hm[i]), pt(ca, R * inner, HAT.foot), pt(mid, R * inner / 2, HAT.foot)];
      // split the wall at HAT.trim below its top edge: crimson wall + cream lace band (same surface, no step)
      const cut = outer.slice(0, 2).map((top, j) => { const bot = outer[j + 2], f = 1 - HAT.trim / (top[1] - bot[1]);
        return top.map((x, q) => bot[q] + (x - bot[q]) * f); });
      const shell = (P) => [...P, ...P.map((p) => [p[0] + n[0], p[1], p[2] + n[2]])];
      out.push({ g: K.hull(shell([...cut, outer[2], outer[3]])), color: 'hat', name: `brim${i}${side}` });
      out.push({ g: K.hull(shell([outer[0], outer[1], ...cut])), color: LACE, name: `lace${i}${side}` });
    }
  }
  out.push({ g: K.xf(K.frustum(8, HAT.crownR, HAT.crownTop, HAT.crownH), { at: [0, HAT.crownH / 2, 0] }), color: 'hat', name: 'crown' });
  return out;
}

export function parts(S) {
  const m = S.meta, k = m.k;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint ≈ chin) ──
  const fy = FACE_Y * k, faceH = FACE_H * k;
  add('head', K.chamferBox(0.27 * k, faceH, 0.27 * k, 0.32, { bottom: 0.03 * k }), [0, fy + faceH / 2, 0.005 * k], 'skin', { name: 'face' });
  add('head', K.box(0.28 * k, 0.15 * k, 0.08 * k), [0, fy + faceH - 0.085 * k, -0.115 * k], 'dark', { name: 'hairBack' });
  add('head', K.box(0.20 * k, 0.11 * k, 0.07 * k), [0, fy + faceH - 0.19 * k, -0.125 * k], 'dark', { name: 'queue' });  // short tail
  add('head', K.box(0.04 * k, 0.065 * k, 0.03 * k), [0.06 * k, fy + faceH * 0.5, 0.135 * k], 'dark', { name: 'eye', mirror: true });
  add('head', K.box(0.13 * k, 0.03 * k, 0.03 * k), [0, fy + faceH * 0.26, 0.14 * k], 'dark', { name: 'moustache' });
  // tricorn: three cocked brim walls + a low crown (hatParts), all crimson on the head bone (same part id → no inner lines)
  for (const b of hatParts()) add('head', b.g, [0, fy + faceH - HAT_SINK * k, HAT_Z * k], b.color, { name: b.name });

  // ── neck + torso ──
  add('neck', K.box(0.09 * k, 0.08 * k, 0.09 * k), [0, 0.02 * k, 0], 'skin', { name: 'neck' });
  const chestH = m.shoulderY - m.chestY + 0.04 * k;
  add('chest', K.chamferBox(0.28 * k, chestH, 0.21 * k, 0.32, { top: 0.03 * k }), [0, chestH / 2 - 0.01 * k, 0], 'coat', { name: 'chest' });
  add('chest', K.chamferBox(0.19 * k, 0.05 * k, 0.17 * k, 0.4), [0, m.shoulderY - m.chestY + 0.035 * k, 0.03 * k], 'plume', { name: 'collar' });
  // short shoulder mantle the cape hangs from (wider than the chest: the cape's shoulders read from behind)
  add('chest', K.chamferBox(0.36 * k, 0.07 * k, 0.12 * k, 0.4), [0, m.shoulderY - m.chestY + 0.01 * k, -0.07 * k], 'coat', { name: 'mantle' });
  add('spine', K.chamferBox(0.24 * k, (m.chestY - m.spineY) + 0.02 * k, 0.19 * k, 0.3), [0, (m.chestY - m.spineY) / 2, 0], 'coat', { name: 'waist' });
  add('hips', K.chamferBox(0.255 * k, 0.055 * k, 0.205 * k, 0.3), [0, m.spineY - m.hipsY - 0.005 * k, 0], 'hat', { name: 'sash' });
  const skTop = m.spineY - m.hipsY - 0.03 * k, skBot = m.thighY - m.hipsY - 0.07 * k;
  add('hips', K.frustum(4, 0.2 * k, 0.18 * k, skTop - skBot, { sz: 0.82 }), [0, (skTop + skBot) / 2, 0], 'coat', { name: 'peplum' });

  // ── arms: puffed cream sleeve, dark flared glove, skin hand ──
  add('upperArmL', K.frustum(4, 0.07 * k, 0.078 * k, m.upperArm + 0.02 * k), [0, -m.upperArm / 2 + 0.005 * k, 0], 'plume', { name: 'sleeve', mirror: true });
  add('forearmL', K.frustum(4, 0.072 * k, 0.056 * k, m.forearm), [0, -m.forearm / 2, 0], 'dark', { name: 'glove', mirror: true });
  add('handL', K.chamferBox(0.08 * k, 0.08 * k, 0.085 * k, 0.4), [0, -0.035 * k, 0.005 * k], 'skin', { name: 'hand', mirror: true });

  // ── legs: dark breeches, tall boots with a flared cuff ──
  add('thighL', K.box(0.105 * k, m.thigh + 0.03 * k, 0.11 * k), [0, -m.thigh / 2 + 0.005 * k, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.072 * k, 0.082 * k, m.shin + 0.01 * k), [0, -m.shin / 2 - 0.005 * k, 0], 'dark', { name: 'boot', mirror: true });
  add('shinL', K.box(0.13 * k, 0.06 * k, 0.135 * k), [0, 0.0, 0.005 * k], 'dark', { name: 'bootCuff', mirror: true });
  add('footL', K.chamferBox(0.1 * k, m.ankleY, 0.21 * k, 0.4), [0, -m.ankleY / 2, 0.05 * k], 'dark', { name: 'foot', mirror: true });

  // ── short cape: one panel per chain link (rest dir [0,-1,-0.15]) ──
  const ck = CAPE_LEN / 2, ct = Math.atan2(0.15, 1) * 180 / Math.PI;
  const cdy = -Math.cos(ct * Math.PI / 180) * ck / 2, cdz = -Math.sin(ct * Math.PI / 180) * ck / 2;
  [0.34, 0.31].forEach((w, i) => add(`cape${i}`, K.box(w * k, ck + 0.02, 0.04 * k), [0, cdy, cdz - 0.005], 'coat', { name: `cape${i}`, rot: [ct, 0, 0] }));

  // ── plume: tapered feather slabs along the chain links, built directly along the link direction with hulls
  // (r2: the old Euler [pitch, yaw] box turned the links the wrong way once the plume pointed up — stair-stepped
  // stripes at N). Broad face (b) across the plume's side, 0.07 m thick (≥ 2 texels from the front too).
  { const lk = PLUME_LEN / 3, th = 0.07;
    const cr = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
    const W = [0.09, 0.14, 0.12, 0.06];   // ostrich plume: narrow quill root, broad middle, blunt tip (a 0.05 tip read as a spike)
    W.slice(0, 3).forEach((w0, i) => {
      const u = PLUME_DIRS[i], b = nrm(cr(u, [1, 0, 0])), n = nrm(cr(u, b));
      const w1 = W[i + 1], s0 = -0.015, s1 = lk + 0.02, P = [];
      for (const [s, w] of [[s0, w0], [s1, w1]]) for (const sb of [-1, 1]) for (const sn of [-1, 1])
        P.push([0, 1, 2].map((q) => u[q] * s + b[q] * sb * w / 2 + n[q] * sn * th / 2));
      add(`plume${i}`, K.hull(P), [0, 0, 0], 'plume', { name: `plume${i}` });
    });
  }

  // ── rapier in socket space (+Z blade), then placed like the socket ──
  const sword = (g, color, name) => add('handR', K.xf(g, { rot: WEAPON.rot, at: WEAPON.at }), [0, 0, 0], color, { name });
  sword(K.xf(K.box(0.035, 0.035, 0.11), { at: [0, 0, -0.01] }), 'dark', 'grip');
  sword(K.xf(K.lathe([[0.03, 0], [0.065, 0.035]], 6), { rot: [90, 0, 0], at: [0, 0, GUARD_Z] }), 'steel', 'cup');
  sword(K.xf(K.box(0.17, 0.03, 0.03), { at: [0, 0, GUARD_Z - 0.01] }), 'steel', 'quillons');
  // blade: 3 texels wide at the guard tapering to 2 at the tip (r1: a 2-texel 0.055 m blade read dashed over the boots)
  { const z0 = GUARD_Z + 0.02, z1 = z0 + BLADE, w0 = 0.085 / 2, w1 = 0.055 / 2, h = 0.015;
    sword(K.hull([[-w0, -h, z0], [w0, -h, z0], [-w0, h, z0], [w0, h, z0], [-w1, -h, z1], [w1, -h, z1], [-w1, h, z1], [w1, h, z1]]), 'steel', 'blade'); }
  return P;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz key grid) ──
// Idle legs are IK'd onto the planted feet; action keys that pose the legs are re-planted per key.
const HIP = { upperArmL: [-10, -80, 45], forearmL: [100, 0, 0] };   // left hand on the hip (cocky)
// READY: the idle 'up' drawing; actions start from and return to it. Rapier carried forward, tip ≈ 10° below level
// and out to the right (r2: forearm 35 hung the blade through the boots at dir 1 → dashed line)
const READY = {
  pos: [0, -0.014, 0], spine: [-2, 6, 0], chest: [-5, 6, 0], neck: [0, 0, 0], head: [-8, -10, 4],
  upperArmR: [10, 0, 20], forearmR: [70, 0, 0], ...HIP,
};
const breathe = (d, e = 0) => ({
  ...READY, pos: [0, -0.014 - d, 0], spine: [-2 + 2 * e, 6, 0], chest: [-5 + 2 * e, 6, 0], head: [-8 - 4 * e, -10, 4],   // head WORLD pitch constant: a nodding head re-aimed the plume chain → 2-3 tiny plume redraws after every breath key
  upperArmR: [10, 0, 20 + 2 * e], forearmR: [70 + 4 * e, 0, 0], upperArmL: [-10, -80, 45 + 3 * e],
});
const LEGS_LUNGE = { thighR: [62, 0, 4], shinR: [-60, 0, 0], thighL: [-35, 0, 8], shinL: [-10, 0, 0], footL: [20, 0, 0] };
const LEGS_SPIN = { thighL: [10, 0, 8], shinL: [-22, 0, 0], thighR: [-6, 0, 10], shinR: [-22, 0, 0] };
// spin arm: upper arm out 82 (blade near horizontal, at shoulder height, below the brim) + slight elbow bend, so
// every 120° key sweeps a crescent band that faces the camera at all facings (r1: out 60 / forearm 10 pointed the
// blade steeply down → filled pie wedges at floor level, edge-on at dir 6)
const ARM_SPIN = { upperArmR: [10, 0, 82], forearmR: [15, 0, 0], upperArmL: [0, 0, 35], forearmL: [30, 0, 0] };
// parry block (sixte, in FRONT of the chest plane): hand forward of the right shoulder, blade rising ≈ 50° forward-up
// beside the brim. (r1's critic numbers [55, 60, 55] + forearm 60 put the blade along the view axis at dir 2 and
// straight up through the hat at dir 6 — r2 key strips.)
const BLOCK = { upperArmR: [75, 0, 28], forearmR: [50, 0, 0], handR: [15, 0, 0] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0) }, { f: 30, pose: breathe(0.014, 0.5) }, { f: 36, pose: breathe(0.028, 1) }, { f: 66, pose: breathe(0.014, 0.5) },
  ] },
  // LUNGE-THRUST: coil 5 — hand pulled back by the hip, elbow folded, blade already pointing forward (tip ≈ 10° below
  // level, wrist cocked) → ONE contact frame: arm straight, full lunge, blade level; straight stab streaks above and
  // below the blade (stabU/stabD) + tip spark → cocky held extension: wrist flicks the tip ≈ 20° UP, chin up,
  // back arm flung up → push back → READY. Heading change coil → contact ≤ 30° so the streaks stay straight.
  lunge: { fps: 30, loop: false, interp: 'step', events: { 5: 'hit' }, keys: [
    { f: 0, pose: { pos: [0, -0.09, -0.07], spine: [-8, -5, 0], chest: [-8, -6, 0], head: [-2, 14, 0],
      upperArmR: [-55, 0, 14], forearmR: [115, 0, 0], handR: [22, 0, 0], upperArmL: [-35, 0, 45], forearmL: [95, 0, 0],
      thighR: [25, 0, 6], shinR: [-35, 0, 0], thighL: [-15, 0, 10], shinL: [-45, 0, 0] } },
    { f: 5, smear: ['stabU', 'stabD'], pose: { pos: [0, -0.13, 0.1], spine: [12, 4, 0], chest: [6, 4, 0], head: [-10, -8, 0],
      upperArmR: [90, 0, 8], forearmR: [2, 0, 0], handR: [4, 0, 0], upperArmL: [-55, 0, 30], forearmL: [15, 0, 0], ...LEGS_LUNGE } },
    { f: 6, pose: { pos: [0, -0.15, 0.1], spine: [14, 8, 0], chest: [4, 8, 0], head: [-16, -18, 6],   // tip flicked up ≈ 25°
      upperArmR: [94, 0, 10], forearmR: [0, 0, 0], handR: [24, 0, 0], upperArmL: [-40, 0, 72], forearmL: [70, 0, 0], ...LEGS_LUNGE } },
    { f: 13, pose: { pos: [0, -0.05, 0.03], spine: [2, 6, 0], chest: [-3, 6, 0], head: [-8, -12, 0],
      upperArmR: [30, 0, 18], forearmR: [60, 0, 0], upperArmL: [-15, -60, 40], forearmL: [80, 0, 0],
      thighR: [15, 0, 4], shinR: [-18, 0, 0], thighL: [-8, 0, 6], shinL: [-14, 0, 0] } },
    { f: 18, pose: READY },
  ] },
  // SPIN-SLASH: coil right (torso −58°, sword arm already out, elbow folded 45 so the first key sweeps flat, not up from the floor) → three smear keys of 120° on the hips twist (70 / 190 / 310)
  // with the arm out near horizontal (ARM_SPIN) → follow-through 65° past the front, arm wrapped across → READY.
  spin: { fps: 30, loop: false, interp: 'step', events: { 8: 'hit' }, keys: [
    { f: 0, pose: { pos: [0, -0.08, 0], spine: [6, -28, 0], chest: [4, -30, 0], head: [0, 40, 0],
      upperArmR: [10, 0, 82], forearmR: [45, 0, 0], upperArmL: [20, 0, 40], forearmL: [60, 0, 0],
      thighL: [20, 0, 10], shinL: [-35, 0, 0], thighR: [-10, 0, 12], shinR: [-30, 0, 0] } },
    { f: 6, smear: 'weapon', pose: { pos: [0, -0.06, 0], hips: [0, 70, 0], spine: [4, 0, 0], ...ARM_SPIN, ...LEGS_SPIN } },
    { f: 8, smear: 'weapon', pose: { pos: [0, -0.06, 0], hips: [0, 190, 0], spine: [4, 0, 0], ...ARM_SPIN, ...LEGS_SPIN } },
    { f: 10, smear: 'weapon', pose: { pos: [0, -0.06, 0], hips: [0, 310, 0], spine: [4, 0, 0], ...ARM_SPIN, ...LEGS_SPIN } },
    { f: 12, pose: { pos: [0, -0.1, 0], hips: [0, 375, 0], spine: [10, 15, 0], chest: [6, 20, 0], head: [-14, -30, 0],
      upperArmR: [30, 0, -25], forearmR: [35, 0, 0], upperArmL: [-30, 0, 40], forearmL: [50, 0, 0], ...LEGS_SPIN } },
    { f: 19, pose: { pos: [0, -0.04, 0], hips: [0, 360, 0], spine: [2, 6, 0], chest: [-3, 6, 0], head: [-8, -12, 0],
      upperArmR: [25, 0, 18], forearmR: [60, 0, 0], upperArmL: [-15, -60, 40], forearmL: [80, 0, 0] } },
    { f: 24, pose: READY },
  ] },
  // PARRY (sixte): small dip with the blade already rising (≤ 40° from the block) → SNAP into the block in front of
  // the chest, blade diagonal past the face line beside the brim, clash spark only (no crescent) → the SHARP HOLD
  // (10) → cocky flick: tip out-and-down to the right, chin up → READY.
  parry: { fps: 30, loop: false, interp: 'step', events: { 3: 'hit' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [0, -4, 0], chest: [-2, -8, 0], head: [-6, 4, 0],
      upperArmR: [50, 0, 22], forearmR: [40, 0, 0], handR: [10, 0, 0], ...HIP } },
    { f: 3, pose: { pos: [0, -0.07, -0.03], spine: [-4, -4, 0], chest: [-2, -10, 0], head: [-6, 12, 6], ...BLOCK, ...HIP } },
    { f: 13, pose: { pos: [0, -0.03, 0], spine: [-2, 8, 0], chest: [-4, 10, 0], head: [-8, -10, 10],
      upperArmR: [35, 0, 50], forearmR: [18, 0, 0], ...HIP } },
    { f: 18, pose: READY },
  ] },
  // hit reaction: snap back (event 'hurt' → flash) held 5, deeper recoil + step back, recover, READY. The head's
  // WORLD pitch stays in −15…+5° (head fwd = −(spine + chest) − 5): r1's +36 / +10 head keys tipped the hat over the
  // face (a bow). The recoil reads through the spine/chest lean, a chest twist away from the hit and the step.
  hurt: { fps: 30, loop: false, interp: 'step', events: { 0: 'hurt' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, -0.05], spine: [-16, 8, 0], chest: [-12, 16, 0], head: [23, -10, 8],
      upperArmR: [-20, 0, 30], forearmR: [40, 0, 0], upperArmL: [-25, 0, 35], forearmL: [30, 0, 0] } },
    { f: 5, pose: { pos: [0, -0.07, -0.08], spine: [-16, 12, 0], chest: [-10, 20, 0], head: [21, -14, 10],
      upperArmR: [-30, 0, 38], forearmR: [55, 0, 0], upperArmL: [-35, 0, 42], forearmL: [45, 0, 0],
      thighL: [12, 0, 6], shinL: [-20, 0, 0], thighR: [-20, 0, 6], shinR: [-15, 0, 0], footR: [10, 0, 0] } },
    { f: 11, pose: { pos: [0, -0.04, -0.03], spine: [6, 2, 0], chest: [4, 0, 0], head: [-15, 4, 0],
      upperArmR: [10, 0, 18], forearmR: [55, 0, 0], upperArmL: [-8, 0, 14], forearmL: [30, 0, 0],
      thighL: [6, 0, 4], shinL: [-10, 0, 0], thighR: [-10, 0, 4], shinR: [-10, 0, 0] } },
    { f: 17, pose: READY },
  ] },
  // walk: strut — left hand stays on the hip, the rapier carried forward (forearm 70, out 20: clear of the legs)
  walk: { fps: 30, loop: true, interp: 'step', length: 8, keys: [0, 1, 2, 3, 4, 5, 6, 7].map((f) => {
    const c = Math.cos(Math.PI * f / 4);
    return { f, pose: { upperArmR: [8 + 4 * c, 0, 20], forearmR: [70 + 3 * c, 0, 0], ...HIP } };
  }) },
  // run: blade trails low behind; the left arm keeps the procedural swing (6 drawings)
  run: { fps: 30, loop: true, interp: 'step', length: 6, keys: [0, 1, 2, 3, 4, 5].map((f) => {
    const c = Math.cos(Math.PI * f / 3);
    return { f, pose: { upperArmR: [-28 + 4 * c, 0, 14], forearmR: [6 + 2 * c, 0, 0] } };
  }) },
};

export function make(opts = {}) {
  const S = skeleton(opts);
  return {
    name: 'duelist',
    height: S.meta.height + 0.12 * S.meta.k,
    palette: PALETTE,
    signature: 'hat',
    skeleton: S,
    parts: parts(S),
    // stabU / stabD: the tip streak sockets (see TIP above); same rotation as the weapon socket
    sockets: { weapon: { bone: 'handR', ...WEAPON }, stabU: { bone: 'handR', at: TIP, rot: WEAPON.rot }, stabD: { bone: 'handR', at: TIP, rot: WEAPON.rot } },
    chains: [
      { name: 'cape', f: 7, zeta: 0.9, r: 0, gravity: 1, falloff: 0.85, noForward: true },
      { name: 'plume', f: 8, zeta: 0.85, r: 0, gravity: 0.1, falloff: 0.9, limit: 45 },   // r2 A/B (raw diffs): f 5 / ζ 0.6 left 2 plume redraws after idle keys + 5-6 after actions; this: 0 after idle keys, upper body settled 6-8 grid frames after a turn / action end
    ],
    personality: { body: { f: 4, zeta: 0.55, r: 0 }, head: { f: 3.5, zeta: 0.9, r: 0 } },
    locomotion: { walkSpeed: 1.4, runSpeed: 3.5, elbows: [40, 50], arms: [34, 45] },
    character: { legIK: 'pose', quant: { lean: 3, yaw: 8, chain: 4 } },   // chain = buckets per unit (HIGHER = finer): 8 → 3 idle plume redraws of 12-15 px, 4 → 0 (r2 A/B)
    clips: CLIPS,
    // 'weapon' = the spin's crescents (edge = socket +Y: the spin sweeps about the vertical with the arm out).
    // 'stabU'/'stabD' = straight streaks: a segment along socket ±Y (perpendicular to the blade) from 0.5·len to len
    // beside the tip, swept along the stab (edge = the blade axis = the motion; minAngle 0: the blade barely turns).
    smears: {
      weapon: { length: SWORD_LEN, inner: 0.32, edge: [0, 1, 0], doubleEdged: true, palette: ['#C4CED0', '#DCE2E2'] },
      stabU: { length: 0.13, inner: 0.5, blade: [0, 1, 0], edge: [0, 0, 1], minAngle: 0, doubleEdged: true, tail: 0.3, palette: ['#DCE2E2', '#DCE2E2'] },
      stabD: { length: 0.13, inner: 0.5, blade: [0, -1, 0], edge: [0, 0, 1], minAngle: 0, doubleEdged: true, tail: 0.3, palette: ['#DCE2E2', '#DCE2E2'] },
    },
    fx: { weapon: { socket: 'weapon', length: SWORD_LEN } },
    // handR 'mid': the rapier is a prop on handR and inherited the far-half shadow (white at S/SE/E, slate at
    // NW/W/SW — r1 rubric #4). look sides per BONE, so the hand + prop opt out together (workaround; module issue).
    material: { sides: { cape0: 'mid', cape1: 'mid', plume0: 'mid', plume1: 'mid', plume2: 'mid', handR: 'mid' } },
  };
}

export default make();
