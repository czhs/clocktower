// Hound (char-hound) — a small mossy stone hound, a QUADRUPED companion. Design sheet: characters/hound.md.
// Built from docs/CHARACTER_PLAYBOOK.md stages 0-6, structure copied from characters/wanderer.js.
//
// WHY A CUSTOM SKELETON + FK LEGS: the runtime's Gait (src/chars/locomotion.js) is biped-only (two legs planted at
// the root, arm swing for the rest) and rig.quadruped() puts the hind legs 0.45 m behind the root, so the Gait would
// pull the hind paws under the belly. The hound therefore carries three INVISIBLE gait bones per side
// (gThighL/gShinL/gFootL, no geometry; spec.locomotion.bones points the Gait at them): the Gait still provides the
// stride-wheel phase, walk/run choice, footstep events and pose clock, while the four VISIBLE legs are pure FK whose
// angles are computed HERE, at module load, by a 2-bone analytic IK in the sagittal plane: every key names where each
// paw should be (planted spot offsets or body-relative), and `pose()` turns that into thigh/shin/paw triples for the
// key's body offset and spine pitch. Walk/run keys use the Gait's own stride-wheel foot function (`foot`) at each
// drawing's phase, so a planted paw is fixed in the world at consecutive pose frames like the Gait's IK'd feet.
import * as K from '../src/chars/kit.js';
import { chain } from '../src/chars/rig.js';
import { foot } from '../src/chars/locomotion.js';

// [hi, mid, sh] sRGB. 4 slots + 1 accent. Shadow hues: stone 250° / moss 198° / lichen 9° / basalt 290°.
// r2: moss moved from yellow-lime (18° from lit meadow #BADA81, same hue as golden grass → camouflaged) to a cool
// jade (hi ≈ 135°, ≥ 50° from lit grass at noon, the golden tint cannot pull it onto the grass hue) with a slate-blue
// shadow (198°: ≥ 40° from the teal grass shadow #3B6B5A). Lichen sh lifted #9A4E58 → #B8604E (ears read maroon).
export const PALETTE = {
  stone: ['#C2BCCF', '#8E89A6', '#5A5470'],   // body, head, haunches, upper legs (lavender: off-hue vs grass)
  moss: ['#94FCCE', '#3CBC98', '#3E5C7A'],    // SIGNATURE: back cap + skull patch (lightest mass, cool mint)
  lichen: ['#F6AE62', '#DA7A44', '#B8604E'],  // leaf ears, tail tuft
  basalt: ['#8A7A86', '#5C4E5E', '#3C3242'],  // lower legs, paws, nose, jaw
  glow: ['#FCEFA0', '#F4CC64', '#D8A858'],    // accent: eyes (sh lifted: a shaded eye still reads as an eye)
};

export const BLOCKOUT = false;   // stage 1: every shape → its plain box

// ── rest joints (character space, metres; x = LEFT, y up, z = facing) ──
const J = {
  body: [0, 0.36, 0], rump: [0, 0.36, -0.10], chest: [0, 0.37, 0.10],
  neck: [0, 0.45, 0.18], head: [0, 0.59, 0.25], jaw: [0, 0.56, 0.33],
  hip: [0.11, 0.35, -0.16], knee: [0.11, 0.20, -0.08], hock: [0.11, 0.07, -0.15],          // hind (L); r2: hock under the knee (J-hook)
  sho: [0.12, 0.35, 0.14], elb: [0.12, 0.21, 0.08], wri: [0.12, 0.06, 0.15],              // front (L)
  gHip: [0.08, 0.36, 0], gKnee: [0.08, 0.19, 0.12], gAnk: [0.08, 0.02, 0],                 // invisible gait leg
  ear: [0.10, 0.69, 0.23], tail: [0, 0.40, -0.27],
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// r2: ears point mostly SIDEWAYS (x dominant → 'left/right' snap: fwd = swing fore/aft, out = UP, twist = roll) → a
// wide leaf 'V' that cannot become a forward horn when the head pitches (pitch only rolls a sideways leaf)
const EAR_DIR = [1, 0.7, -0.12], EAR_LEN = 0.21;
// r2: ONE link per ear / tail. With 2-link chains every key change was followed by 2-3 dynamics-only redraws whatever
// f/ζ (f 6.5 → 15 changed nothing): link 1's rest direction is cached from link 0's already-AIMED orientation, so the
// chain converges per redraw, not per 60 Hz step (module issue, motion). 1 link = 1 settle redraw at most.
const EAR_N = 1, TAIL_N = 1;
const TAIL_DIR = [0, 0.55, -1], TAIL_LEN = 0.18;   // low and back: from behind it stays below the cap rim (an up-tail overlapped the cap: 6-7 isolated px)

export function skeleton() {
  const S = [
    { name: 'body', pos: J.body, axis: 'fwd' },
    { name: 'rump', parent: 'body', pos: sub(J.rump, J.body), axis: 'fwd' },
    { name: 'chest', parent: 'body', pos: sub(J.chest, J.body), axis: 'fwd' },
    { name: 'neck', parent: 'chest', pos: sub(J.neck, J.chest), axis: 'up' },
    { name: 'head', parent: 'neck', pos: sub(J.head, J.neck), axis: 'fwd' },
    { name: 'jaw', parent: 'head', pos: sub(J.jaw, J.head), axis: 'fwd' },
  ];
  for (const s of ['L', 'R']) {
    const m = (p) => (s === 'L' ? p : [-p[0], p[1], p[2]]);
    S.push(
      { name: `thigh${s}`, parent: 'rump', pos: sub(m(J.hip), J.rump), axis: 'down' },
      { name: `shin${s}`, parent: `thigh${s}`, pos: sub(J.knee, J.hip), axis: 'down' },
      { name: `foot${s}`, parent: `shin${s}`, pos: sub(J.hock, J.knee), axis: 'fwd' },
      { name: `upperArm${s}`, parent: 'chest', pos: sub(m(J.sho), J.chest), axis: 'down' },
      { name: `forearm${s}`, parent: `upperArm${s}`, pos: sub(J.elb, J.sho), axis: 'down' },
      { name: `hand${s}`, parent: `forearm${s}`, pos: sub(J.wri, J.elb), axis: 'fwd' },
      // invisible gait leg (Gait plants + IKs it; nothing is bound to it)
      { name: `gThigh${s}`, parent: 'body', pos: sub(m(J.gHip), J.body), axis: 'down' },
      { name: `gShin${s}`, parent: `gThigh${s}`, pos: sub(J.gKnee, J.gHip), axis: 'down' },
      { name: `gFoot${s}`, parent: `gShin${s}`, pos: sub(J.gAnk, J.gKnee), axis: 'fwd' },
    );
  }
  S.push(...chain('ear', { n: EAR_N, parent: 'head', at: sub(J.ear, J.head), dir: EAR_DIR, len: EAR_LEN, mirror: true }));
  S.push(...chain('tail', { n: TAIL_N, parent: 'rump', at: sub(J.tail, J.rump), dir: TAIL_DIR, len: TAIL_LEN }));
  return S;
}

// ── shapes ──
const bboxBox = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return K.xf(K.box(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z), { at: [(b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, (b.max.z + b.min.z) / 2] }); };
const S_ = (g) => (BLOCKOUT ? bboxBox(g) : g);
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export function parts() {
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape: S_(shape), at, color, ...extra });
  // a block along a limb segment A → B, hung from the bone at A (long axis rotated into the segment's y-z direction)
  const seg = (bone, A, B, w, d, color, name, { extra = 0, c = 0, shift = 0 } = {}) => {
    const dy = B[1] - A[1], dz = B[2] - A[2], len = Math.hypot(dy, dz);
    const g = c > 0 ? K.chamferBox(w, len + extra, d, c) : K.box(w, len + extra, d);
    const u = 0.5 + shift;
    add(bone, g, [0, dy * u, dz * u], color, { rot: [Math.atan2(-dz, -dy) * R2D, 0, 0], name, mirror: true });
  };

  // ── torso: rump + barrel chest + belly, all chunky faceted stone ──
  add('rump', K.chamferBox(0.26, 0.21, 0.23, 0.34), [0, -0.01, -0.065], 'stone', { name: 'rump' });   // 0.03 narrower/lower than the chest: a step, not a seam
  add('chest', K.chamferBox(0.32, 0.23, 0.24, 0.34), [0, -0.005, 0.0], 'stone', { name: 'chest' });
  // ── moss cap (signature): ONE convex 8-sided dome, radius falls more steeply toward the top; overhangs the body ──
  // kit lathes are CENTRED on their bbox: `at` is the dome's middle. Rim at y 0.44 = 0.04 m below the stone back's top
  // (embedded, overhanging the sides by ≥ 0.03 m), top at 0.57.
  // r2: taller dome with a 45° shoulder band between a steep skirt and a flat crown, so the 30° camera sees ≥ 2 tones
  // (the old 19° roof was one flat hi blob) and the crown peeks over the head from the front.
  // The steep skirt is a separate band of the SAME profile drawn one step darker (hi = moss mid): from the sun side every
  // visible facet was lit hi (SE = 1 tone); the band gives the dome a rim at every facing without a new colour.
  const CAP_SKIRT = [[0.22, 0], [0.20, 0.06]], CAP_TOP = [[0.20, 0], [0.12, 0.075], [0, 0.11]];
  const capY = 0.44 - J.body[1], MOSS_RIM = [PALETTE.moss[1], PALETTE.moss[1], PALETTE.moss[2]];
  add('body', K.lathe(CAP_SKIRT, 8, { sx: 1, sz: 1.36 }), [0, capY + 0.03, -0.03], MOSS_RIM, { name: 'mossRim' });
  add('body', K.lathe(CAP_TOP, 8, { sx: 1, sz: 1.36 }), [0, capY + 0.06 + 0.055, -0.03], 'moss', { name: 'mossCap' });

  // ── neck + head ──
  add('neck', K.box(0.16, 0.16, 0.14), [0, 0.05, 0.01], 'stone', { name: 'neck' });
  add('head', K.chamferBox(0.28, 0.23, 0.25, 0.3, { top: 0.035 }), [0, 0.04, 0.05], 'stone', { name: 'skull' });
  add('head', K.chamferBox(0.16, 0.12, 0.14, 0.3), [0, -0.015, 0.22], 'stone', { name: 'snout' });
  add('head', K.box(0.08, 0.05, 0.04), [0, 0.03, 0.29], 'basalt', { name: 'nose' });
  // r2: 2×2-texel eyes, forward/out and tilted 25° up so the high sun lights them in S/SE/SW; a stone brow block
  add('head', K.box(0.075, 0.07, 0.04), [0.08, 0.075, 0.18], 'glow', { name: 'eye', mirror: true, rot: [-25, 0, 0] });
  // r2: moss patch on the skull (the ears grow out of it): the signature also reads from the front, where the head
  // hides the back cap (S showed 20 moss px)
  add('head', K.lathe([[0.135, 0], [0.115, 0.035], [0.055, 0.065], [0, 0.07]], 8, { sz: 1 }), [0, 0.155 + 0.025, 0.035], 'moss', { name: 'mossBrow' });
  add('jaw', K.box(0.12, 0.05, 0.14), [0, -0.04, 0.12], 'basalt', { name: 'jaw' });

  // ── leaf ears: diamond cross-section (0.06 m midrib), base half on link 0, tip half on link 1 ──
  const d = norm(EAR_DIR), v0 = norm(cross(d, [0, 0, 1])), w0 = norm(cross(v0, d));
  const EB = 72 * D2R;    // r2: leaf face turned mostly UP (toward the sun): hi/mid instead of the shadow tone
  const v = v0.map((x, i) => x * Math.cos(EB) + w0[i] * Math.sin(EB)), w = norm(cross(v, d));
  const pt = (u, sv, sw) => [0, 1, 2].map((i) => d[i] * u + v[i] * sv + w[i] * sw);
  const leaf = (us, u0) => {                       // us = [[u, halfWidth], …]; u0 = link joint along the ear
    const pts = [];
    for (const [u, hw] of us) {
      const uu = u - u0;
      if (hw > 0) pts.push(pt(uu, hw, 0.008), pt(uu, hw, -0.008), pt(uu, -hw, 0.008), pt(uu, -hw, -0.008));
      pts.push(pt(uu, 0, hw > 0 ? 0.03 : 0.012), pt(uu, 0, hw > 0 ? -0.03 : -0.012));
    }
    return K.hull(pts);
  };
  // r2: broad oval leaf, rounded tip (no spike): 0.18 long, 0.17 wide
  add('earL0', leaf([[0, 0.045], [0.07, 0.095], [0.11, 0.1]], 0), [0, 0, 0], 'lichen', { name: 'earBase', mirror: true });
  add(EAR_N > 1 ? 'earL1' : 'earL0', leaf([[0.10, 0.1], [0.16, 0.08], [0.2, 0.042], [0.215, 0]], EAR_N > 1 ? EAR_LEN / 2 : 0), [0, 0, 0], 'lichen', { name: 'earTip', mirror: true });

  // ── stub tail: stone stub + moss tuft ──
  const td = norm(TAIL_DIR), tl = TAIL_LEN / 2, ta = Math.atan2(td[2], td[1]) * R2D;    // rotate box +Y onto the tail dir
  add('tail0', K.chamferBox(0.09, 0.11, 0.09, 0.3), [0, td[1] * tl * 0.5, td[2] * tl * 0.5], 'stone', { name: 'tailStub', rot: [ta, 0, 0] });
  // r2: rounded 6-sided lathe tuft (the cube got a full inner-line ring from the back)
  add(TAIL_N > 1 ? 'tail1' : 'tail0', K.lathe([[0.03, 0], [0.068, 0.035], [0.062, 0.085], [0.03, 0.12], [0, 0.13]], 6), (TAIL_N > 1 ? [0, td[1] * tl * 0.6, td[2] * tl * 0.6] : [0, td[1] * tl * 1.6, td[2] * tl * 1.6]), 'lichen', { name: 'tailTuft', rot: [ta, 0, 0] });

  // ── legs (L authored, mirrored): stone haunch / upper leg, basalt shin / forearm / paws ──
  seg('thighL', J.hip, J.knee, 0.13, 0.18, 'stone', 'haunch', { extra: 0.07, c: 0.3, shift: -0.08 });
  seg('shinL', J.knee, J.hock, 0.09, 0.09, 'basalt', 'shin', { extra: 0.03 });
  add('footL', K.chamferBox(0.115, 0.07, 0.13, 0.3), [0, -0.035, 0.02], 'basalt', { name: 'hindPaw', mirror: true });   // r2: centred under the hock
  seg('upperArmL', J.sho, J.elb, 0.11, 0.12, 'stone', 'upperLeg', { extra: 0.05, c: 0.3, shift: -0.06 });
  seg('forearmL', J.elb, J.wri, 0.09, 0.09, 'basalt', 'foreleg', { extra: 0.03 });
  add('handL', K.chamferBox(0.11, 0.06, 0.14, 0.3), [0, -0.03, 0.03], 'basalt', { name: 'frontPaw', mirror: true });
  return P;
}

// ── 2-D leg IK (sagittal plane y-z) ─────────────────────────────────────────────────────────────────────────────
// Rotation about +X by a: (y, z) → (y cos a − z sin a, y sin a + z cos a). Body bones (axis fwd): `fwd` + = nose down
// = R(+fwd). Leg bones (axis down): `fwd` + = tip forward = R(−fwd). Paw bones (axis fwd): R(+fwd).
const rot = ([y, z], a) => [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const yz = (p) => [p[1], p[2]];
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const theta = (from, to) => Math.atan2(to[1] - from[1], -(to[0] - from[0]));   // 0 = straight down, + toward +Z
const LEGS = {
  H: { hip: yz(J.hip), knee: yz(J.knee), ank: yz(J.hock), parent: 'rump', pj: yz(J.rump), kneeFwd: true,
    bones: ['thigh', 'shin', 'foot'] },
  F: { hip: yz(J.sho), knee: yz(J.elb), ank: yz(J.wri), parent: 'chest', pj: yz(J.chest), kneeFwd: false,
    bones: ['upperArm', 'forearm', 'hand'] },
};
for (const L of Object.values(LEGS)) {
  L.l1 = Math.hypot(...sub2(L.knee, L.hip)); L.l2 = Math.hypot(...sub2(L.ank, L.knee));
  L.t1r = theta(L.hip, L.knee); L.t2r = theta(L.knee, L.ank);
}
const r1 = (x) => Math.round(x * 10) / 10;

/** Leg triples for one leg. hipW = hip joint (y, z) in character space, P = parent pitch (rad, nose down +),
 *  A = wanted ankle (y, z), q = paw pitch (deg, toe down +). */
function solveLeg(L, hipW, P, A, q = 0) {
  let dy = A[0] - hipW[0], dz = A[1] - hipW[1];
  let dd = Math.hypot(dy, dz);
  const dmax = 0.995 * (L.l1 + L.l2), dmin = Math.abs(L.l1 - L.l2) + 0.02;
  const dc = Math.min(dmax, Math.max(dmin, dd));
  dy *= dc / dd; dz *= dc / dd; dd = dc;
  const phi = Math.atan2(dz, -dy);
  const g = Math.acos(Math.max(-1, Math.min(1, (L.l1 * L.l1 + dd * dd - L.l2 * L.l2) / (2 * L.l1 * dd))));
  const t1 = L.kneeFwd ? phi + g : phi - g;
  const K1 = [hipW[0] - L.l1 * Math.cos(t1), hipW[1] + L.l1 * Math.sin(t1)];
  const t2 = Math.atan2(hipW[1] + dz - K1[1], -(hipW[0] + dy - K1[0]));
  const a1 = t1 - L.t1r + P, a2 = t2 - L.t2r - a1 + P;
  const af = q * D2R - P + a1 + a2;
  return [[r1(a1 * R2D), 0, 0], [r1(a2 * R2D), 0, 0], [r1(af * R2D), 0, 0]];
}

/**
 * A full pose from a compact description (degrees; triples [fwd, twist, out]):
 *   pos [x,y,z] root offset (the Gait subtracts `drop` in walk/run: pass it as `drop` so the legs know),
 *   body / rump / chest: fwd pitch (number) or triple, neck / head / jaw / ears / tail: triples (jaw: number),
 *   paws: { HL, HR, FL, FR: [dz, dy, q, rel] } — ankle offsets from the paw's REST spot in character space
 *   (rel = 1: relative to the moved body, i.e. + pos; airborne paws), q = paw pitch (toe down +).
 */
export function pose(o = {}) {
  const pos = o.pos || [0, 0, 0];
  const tri = (v) => (v === undefined ? [0, 0, 0] : typeof v === 'number' ? [v, 0, 0] : v);
  const body = tri(o.body), rump = tri(o.rump), chest = tri(o.chest);
  const out = { pos: [...pos], body, rump, chest, neck: tri(o.neck), head: tri(o.head), jaw: tri(o.jaw) };
  if (o.ear) { out.earL0 = o.ear; out.earR0 = o.ear; }
  if (o.ear1) { out.earL1 = o.ear1; out.earR1 = o.ear1; }
  if (o.tail) out.tail0 = o.tail;
  if (o.tail1) out.tail1 = o.tail1;
  const B = [J.body[1] + pos[1] - (o.drop || 0), J.body[2] + pos[2]];
  const pb = body[0] * D2R;
  const paws = o.paws || {};
  for (const [key, L] of Object.entries(LEGS)) {
    const pp = (key === 'H' ? rump[0] : chest[0]) * D2R;
    const pj = add2(B, rot(sub2(L.pj, yz(J.body)), pb));
    const hip = add2(pj, rot(sub2(L.hip, L.pj), pb + pp));
    for (const s of ['L', 'R']) {
      const [dz = 0, dy = 0, q = 0, rel = 0] = paws[key + s] || [];
      const A = [L.ank[0] + dy + (rel ? pos[1] - (o.drop || 0) : 0), L.ank[1] + dz + (rel ? pos[2] : 0)];
      const [a, b, c] = solveLeg(L, hip, pb + pp, A, q);
      out[L.bones[0] + s] = a; out[L.bones[1] + s] = b; out[L.bones[2] + s] = c;
    }
  }
  return out;
}

// ── clips (30 Hz key grid) ──────────────────────────────────────────────────────────────────────────────────────
// Head rule (r2, critic): in every key held ≥ 4 frames the head's WORLD pitch (body + chest + neck + head fwd) stays
// ≤ 35° nose-down, or from the front (dir 0) only the skull top shows under the cap and the hound reads headless.
// The crouch goes into pos y / chest, the head counter-nods.
const swipe = (out, p) => ({ ...p, upperArmR: [p.upperArmR[0], 0, out] });
// the R foreleg posed directly (raised / swiping paw, not on the ground): upper leg, forearm, paw triples
const rawR = (p, ua, fa, hd) => ({ ...p, upperArmR: ua, forearmR: fa, handR: hd });
const STAND = { neck: [-6, 0, 0], head: [4, 0, 0], tail: [-10, 0, 0] };
export const READY = pose(STAND);
const idleKey = (dy, tilt, ear) => pose({ ...STAND, pos: [0, -dy, 0], neck: [-6 + 40 * dy, 0, 0], head: [4, tilt, tilt * 0.6], ear });

// gait numbers (shared with spec.locomotion): walk = trot, run = bounding gallop
const WALK = { speed: 0.9375, C: 0.5, beta: 0.5, n: 8, lift: 0.06 };
const RUN = { speed: 2.5, C: 1.0, beta: 0.25, n: 6, lift: 0.09 };
// Gait.hipDrop for the invisible legs (they are long enough that only the constant term remains): walk 0.006, run 0.03
const DROP = { walk: 0.006, run: 0.03 };

function gaitKeys(G, offs, body, drop) {
  const keys = [];
  for (let i = 0; i < G.n; i++) {
    const ph = i / G.n;
    const paws = {};
    for (const [leg, o] of Object.entries(offs)) {
      const f = foot(ph * G.C, G.C, o, G.beta, G.lift);
      const front = leg[0] === 'F';
      paws[leg] = [f.z, f.y, f.stance ? 0 : (front ? 55 : 22) * Math.sin(Math.PI * f.u)];
    }
    keys.push({ f: i, pose: pose({ ...body(ph), paws, drop }) });
  }
  return keys;
}

export const CLIPS = {
  // curious idle: stand (held 30) → mid → down + head tilt, ears perk (held 30) → mid; 1 texel of bob (0.028 m)
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: idleKey(0, 0) }, { f: 30, pose: idleKey(0.014, 8, [0, 0, 8]) }, { f: 36, pose: idleKey(0.028, 20, [0, 0, 22]) }, { f: 66, pose: idleKey(0.014, 8, [0, 0, 8]) },
  ] },
  // trot: diagonal pairs (hind L + fore R at phase 0, hind R + fore L at 0.5), one step key per gait drawing.
  // r2: bob ±0.028 m (1 texel each way; ±0.014 was invisible); ears flip up when the body drops and down when it rises
  // (out ±20 = 40° per drawing pair), tail counter-bobs ±16° → the springy trot of the brief.
  walk: { fps: 30, loop: true, interp: 'step', length: WALK.n, keys: gaitKeys(WALK, { HL: 0, FR: 0, HR: 0.5, FL: 0.5 }, (ph) => {
    const c = Math.cos(4 * Math.PI * (ph - WALK.beta / 2)), bob = -0.028 * c;
    return { pos: [0, bob - 0.004, 0], neck: [-6 + 6 * c, 0, 0], head: [4, 0, 0], body: [0, 0, 0],
      ear: [-8, 0, 20 * c], tail: [-14 + 16 * c, 0, 0] };
  }, DROP.walk) },
  // bounding gallop: hinds land at 0 / 0.08, fores at 0.45 / 0.53; spine gathered at 0.9, extended at 0.4.
  // r2: flight lift ±0.03 m (two flights per cycle: 0.39 extended, 0.89 gathered), spine flex chest ±22° / rump ∓22°,
  // ears stream back 30° on extension and flick forward-up on the gather, tail up on the gather.
  run: { fps: 30, loop: true, interp: 'step', length: RUN.n, keys: gaitKeys(RUN, { HL: 0, HR: -0.08, FL: -0.45, FR: -0.53 }, (ph) => {
    const flex = Math.cos(2 * Math.PI * (ph - 0.9)), fly = Math.cos(4 * Math.PI * (ph - 0.89));
    return { pos: [0, 0.025 + 0.03 * fly, 0], body: [0, 0, 0], chest: [22 * flex, 0, 0], rump: [-22 * flex, 0, 0],
      neck: [-14 - 12 * flex, 0, 0], head: [6, 0, 0],
      ear: [-12 + 22 * flex, 0, 6 + 14 * flex], tail: [-30 * flex - 10, 0, 0] };
  }, DROP.run) },

  // SNIFF: nose down → sniff left → sniff right (neck turn ±30° + head yaw ±34°) → nose deep → pops up with a curious
  // head tilt → stand. Paws stay planted (the IK bends the front legs under the lowered chest). r2: the head's world pitch
  // stays ≤ 45° (neck carries the lowering, the head counter-nods) so the face shows from dir 0.
  sniff: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: pose({ pos: [0, -0.04, 0], body: 6, chest: 10, neck: [50, 0, 0], head: [-26, 0, 0], ear: [-20, 0, -8], tail: [-35, 0, 15] }) },
    { f: 6, pose: pose({ pos: [0, -0.045, 0], body: 6, chest: 10, neck: [52, 30, 0], head: [-24, 0, 34], ear: [-25, 0, 6], tail: [-35, 0, -24] }) },
    { f: 11, pose: pose({ pos: [0, -0.045, 0], body: 6, chest: 10, neck: [52, -30, 0], head: [-24, 0, -34], ear: [-25, 0, 6], tail: [-35, 0, 24] }) },
    { f: 16, pose: pose({ pos: [0, -0.05, 0], body: 7, chest: 12, neck: [58, 0, 0], head: [-32, 0, 0], jaw: 14, ear: [-30, 0, -12], tail: [-30, 0, 0] }) },
    { f: 20, pose: pose({ pos: [0, 0.01, 0], body: -6, neck: [-16, 0, 0], head: [-8, 24, 8], ear: [5, 0, 28], tail: [-40, 0, 10] }) },
    { f: 30, pose: READY },
  ] },

  // HOP-BARK: crouch (5) → hop + bark, mouth open, paws tucked (5) → land squash (4) → second bark standing, head up (6)
  // → stand. The hop is a held pose offset (whole drawing), 0.10 m = 3.6 texels. r2: crouch/land keep the head ≤ 32°
  // world pitch (crouch in pos y + chest).
  bark: { fps: 30, loop: false, interp: 'step', events: { 5: 'bark', 10: 'land', 14: 'bark' }, keys: [
    { f: 0, pose: pose({ pos: [0, -0.075, -0.02], body: 4, chest: 10, neck: [10, 0, 0], head: [6, 0, 0], ear: [-20, 0, -18], tail: [-15, 0, 0] }) },
    { f: 5, pose: pose({ pos: [0, 0.10, 0.03], body: -14, neck: [-28, 0, 0], head: [-18, 0, 0], jaw: 40, ear: [-10, 0, 30], tail: [-45, 0, 0],
      paws: { FL: [0.05, 0.05, 40, 1], FR: [0.06, 0.06, 40, 1], HL: [-0.04, 0.03, 30, 1], HR: [-0.03, 0.03, 30, 1] } }) },
    { f: 10, pose: pose({ pos: [0, -0.085, 0.04], body: 5, chest: 8, neck: [12, 0, 0], head: [6, 0, 0], ear: [-25, 0, -22], tail: [10, 0, 0],
      paws: { FL: [0.05, 0], FR: [0.05, 0], HL: [0.03, 0], HR: [0.03, 0] } }) },
    { f: 14, pose: pose({ pos: [0, -0.01, 0.04], body: -6, neck: [-12, 0, 0], head: [-24, 0, 0], jaw: 45, ear: [0, 0, 30], tail: [-45, 0, -20],
      paws: { FL: [0.05, 0], FR: [0.05, 0], HL: [0.03, 0], HR: [0.03, 0] } }) },
    { f: 20, pose: READY },
  ] },

  // POUNCE (attack), r2 re-author on a 4-facing key grid:
  //  0 play-bow (8): chest low, rump high, tail up, head up.
  //  8 LEAP (4): airborne — all four paws off the ground (rel), body near level and stretched; the R foreleg raised
  //    UP in front of the chest and out (upper leg fwd 124 / out 55, paw curled = claws), head thrown back to clear it
  //    (fwd 175 = straight up hid the whole leg behind the head and cap: the shoulder sits deep under the cap).
  //  12 CONTACT (1): front paws land first, the R foreleg slammed FORWARD-DOWN and ACROSS (fwd 42 / out −26):
  //    ≈ 120° of sweep about the shoulder in one drawing incl. the +28° body/chest pitch (a contact under the chest hid
  //    the arc behind the head at the far-side facings 1/2) → `smear: 'clawR'` + 'hit'. Hind paws still in the air.
  //  13 follow-through squash (8): R paw pins forward, chest low, head ≤ 30° world pitch.
  //  21 recovery, head tilt (6) → 27 stand.
  pounce: { fps: 30, loop: false, interp: 'step', events: { 12: 'hit', 13: 'land' }, keys: [
    { f: 0, pose: pose({ pos: [0, -0.06, -0.06], body: 22, chest: 8, rump: -6, neck: [-36, 0, 0], head: [-16, 0, 0], ear: [-30, 0, 24], tail: [-60, 0, 25],
      paws: { FL: [0.13, 0], FR: [0.13, 0], HL: [-0.03, 0], HR: [-0.03, 0] } }) },
    { f: 8, pose: rawR(pose({ pos: [0, 0.10, 0.10], body: -8, chest: -6, rump: 6, neck: [-34, 0, 0], head: [12, 0, 0], jaw: 30, ear: [-40, 0, 10], tail: [25, 0, 0],
      paws: { FL: [0.12, 0.10, 20, 1], FR: [0.12, 0.10, 20, 1], HL: [-0.13, 0.07, 45, 1], HR: [-0.11, 0.07, 45, 1] } }), [124, 0, 55], [25, 0, 0], [45, 0, 0]) },
    { f: 12, smear: 'clawR', pose: rawR(pose({ pos: [0, -0.01, 0.10], body: 8, chest: 6, neck: [6, 0, 0], head: [6, 0, 0], jaw: 10, ear: [-20, 0, -6], tail: [-10, 0, 0],
      paws: { FL: [0.20, 0], FR: [0.24, 0], HL: [-0.04, 0.06, 30, 1], HR: [-0.03, 0.06, 30, 1] } }), [42, 0, -26], [-25, 0, 0], [20, 0, 0]) },
    { f: 13, pose: swipe(-22, pose({ pos: [0, -0.07, 0.10], body: 10, chest: 8, neck: [8, 0, 0], head: [4, 0, 0], jaw: 30, ear: [-25, 0, -16], tail: [-50, 0, 25],
      paws: { FL: [0.20, 0], FR: [0.30, -0.02, 10], HL: [0.04, 0], HR: [0.04, 0] } })) },
    { f: 21, pose: pose({ pos: [0, -0.015, 0.05], body: 3, neck: [-2, 0, 0], head: [0, 18, 6], ear: [5, 0, 26], tail: [-35, 0, -25],
      paws: { FL: [0.06, 0], FR: [0.06, 0], HL: [0.04, 0], HR: [0.04, 0] } }) },
    { f: 27, pose: READY },
  ] },

  // HURT: flinch back + yelp, event 'hurt' → 2-frame flash (held 5 ≥ flash + 2) → cower, head turned away, ears down,
  // tail tucked (6) → shake-off (6) → stand. r2: cower head ≤ 30° world pitch.
  hurt: { fps: 30, loop: false, interp: 'step', events: { 0: 'hurt' }, keys: [
    { f: 0, pose: pose({ pos: [0, -0.02, -0.05], body: -12, neck: [-22, 0, 0], head: [-16, 0, 18], jaw: 25, ear: [-40, 0, -30], tail: [40, 0, 0] }) },
    { f: 5, pose: pose({ pos: [0, -0.085, -0.07], body: 6, chest: 6, rump: -8, neck: [12, -18, 0], head: [4, 0, -24], ear: [-30, 0, -38], tail: [60, 0, 0],
      paws: { HL: [-0.02, 0], HR: [-0.02, 0] } }) },
    { f: 11, pose: pose({ pos: [0, -0.01, -0.03], neck: [-6, 22, 0], head: [-6, -26, 16], ear: [10, 0, 30], tail: [-20, 0, 25],
      paws: { HL: [-0.02, 0], HR: [-0.02, 0] } }) },
    { f: 17, pose: READY },
  ] },
};

export function make() {
  return {
    name: 'hound',
    height: 0.86,                     // ground → ear tips (≈ 28 texels at vh 10: a companion, see hound.md §3)
    palette: PALETTE,
    signature: 'moss',
    faceSlot: 'stone',
    skeleton: skeleton(),
    parts: parts(),
    sockets: { clawR: { bone: 'upperArmR', at: [0, 0, 0], rot: [90, 0, 0] } },   // shoulder, +Z down the whole foreleg to the paw
    // r2: ζ 0.7/0.6 → 0.85 and quant.chain 6 → 4: one settle redraw per key at most (holds boiled: play-bow drawn 3×,
    // idle keys trailed 16/8/6/2-px pops). The bounce now comes from KEYED ears/tail in walk/run/actions.
    chains: [
      { name: 'earL', f: 10, zeta: 0.85, r: 0.5, gravity: 0.05, falloff: 0.9, limit: 35 },
      { name: 'earR', f: 10, zeta: 0.85, r: 0.5, gravity: 0.05, falloff: 0.9, limit: 35 },
      { name: 'tail', f: 9, zeta: 0.85, r: 0.5, gravity: 0.2, falloff: 0.9, limit: 45 },
    ],
    personality: { body: { f: 6, zeta: 0.9, r: 0 }, head: { f: 9, zeta: 1, r: 0 } },   // r2: head lag is unmapped (locomotion.bones.head '-head'), see below
    locomotion: {
      walkSpeed: WALK.speed, runSpeed: RUN.speed, stride: WALK.C / 2, runStride: RUN.C / 2,
      duty: [WALK.beta, RUN.beta], lift: [0.03, 0.05], maxSwing: 0.6, reach: 0.9, runFroude: [0.5, 0.7],
      arms: [0, 0], elbows: [0, 0], lean: [0, 0], twist: [0, 0], poses: [WALK.n, RUN.n],
      // the Gait drives the invisible legs; every other body bone it knows is pointed at a name the rig lacks
      // (no biped arm swing / pelvis twist / head lag on a quadruped)
      bones: { legL: ['gThighL', 'gShinL', 'gFootL'], legR: ['gThighR', 'gShinR', 'gFootR'], armL: ['-aL', '-fL'],
        armR: ['-aR', '-fR'], hips: '-hips', spine: '-spine', chest: '-chest', neck: '-neck', head: '-head' },
      // r2: head lag removed (it was mapped to `neck`): after a 180° turn it trailed 4-6 redraws of 45 → 1 px (A/B with
      // it off: 2 settle drawings). Head personality now lives in the keyed tilts (idle, sniff, recovery).
    },
    character: { legIK: 'pose', dip: false, quant: { yaw: 15, chain: 4, lean: 4 } },
    clips: CLIPS,
    // r2: leaf ears are not forced to the far-side shadow (their identity is the orange; forced, 50-60 % of the ear px
    // were the shadow tone and the ears read as maroon horns)
    material: { sides: { earL0: 'mid', earL1: 'mid', earR0: 'mid', earR1: 'mid' } },
    // r2: a CRESCENT (blade kind, inner 0.4) pivoting on the shoulder that reaches 0.12 m past the paw (0.46 m), not the
    // limb kind's filled fan over the leg (a 1-2 px line / white wedge in r1)
    smears: { clawR: { kind: 'blade', length: 0.46, inner: 0.4, doubleEdged: true, palette: ['#ECE9F2', '#FAF6F4'] } },
    // r2: no dust (fx.js motes are a fixed 4-5 texels = pebbles beside 3-texel paws, and step at 10 fps on the opposite
    // phase of the pose's twos → 30 Hz activity inside the follow-through hold); keep the hit spark + hurt flash
    fx: { weapon: { socket: 'clawR', length: 0.40 }, map: { '^hit|strike': 'spark', 'hurt|damage': 'flash' } },
  };
}

export default make();
