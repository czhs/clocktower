// Preservation (char-preservation) — cast member "preservation", 15-312 mascot: "A blue frog who never changes type."
// Design sheet (Unique to me, timing charts, self-critique): characters/preservation.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/preservation.ts + lib-c-frog.ts, refs/cast/preservation.png.
// Body plan: upright CHIBI skeleton (chibi(), 2.2 heads, short legs 0.27 H) driven by the LegGait 'hop' plan with the
// two hind legs only = a metronomic two-footed hop (one hop per 0.3 s cycle at 3.95 H/s). "Never changes type": the
// authored walk clip REPLACES the hop's body pitch with an upright, rigid body (no squash, no nose-up/down); only the legs
// fold/extend, the arms lift symmetrically in flight and the two scarf ends (1-link chains) flap.
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.12;                 // v2 28 px → castHeight 1.12 m (top of the eye bumps / glasses)
export const SKH = 1.2;                     // template height (chibi() proportions); head + arms lowered below
export const V_GAME = 3.95 * HEIGHT;        // 4.42 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. 5 slots + 1 accent (blush). Blue is ≥ 100° off the meadow hue (#75A558 h 97), so ground
// separation comes from hue; the v1 mid #5A8CC8 is kept, sh lifted to a violet-blue (night floor, ≠ teal).
export const PALETTE = {
  skin: ['#8CB8EC', '#5A8CC8', '#6474B8'],    // signature 1: head, eye bumps, body, limbs (v1 #5A8CC8 / #4A6DA2)
  belly: ['#EEF2F0', '#CCDCE8', '#968EB4'],   // pale belly (v1 #D8E6EE / #9CB6D2), sh mauve ≥ 20° from the skin sh
  scarf: ['#FFE48A', '#E2B844', '#A0703E'],   // signature 2: yellow knit scarf (v1 #E2B844 / #AF8D40)
  dark: ['#6E5A62', '#47363E', '#3A2E3A'],    // glasses rims + bridge + temples, mouth, pupils, placard stick + glyph
  lens: ['#FFF8EA', '#ECE2D0', '#ACA2AC'],    // eye whites (v1 #F4EEE2), τ placard card
  blush: ['#F6B0B0', '#E2909A', '#B06A80'],   // accent: cheeks (v1 #E09A9A)
};

const HEAD_DOWN = 0.05;      // chin from 0.655 (template) to ≈ 0.575 m (v1: chin at 0.49 H)
const ARM_DOWN = 0.06;       // shoulders from 0.59 to ≈ 0.53 m (v1 arms hang below the scarf)
// head-local (joint = chin): eye bumps and the glasses on their fronts
// r2: bumps moved FORWARD onto the crown front (z 0.04 → 0.11) so at E/W a bump + lens sit on the front of the crown
// over a snout overhang (critic r1: the E/W head was a tall egg / thumb with a scribble face)
const BUMP = [0.19, 0.43, 0.11, 0.13];       // x, y, z, r (top above the rims seen from behind at N/NE/NW)
const EYE = [0.19, 0.38, 0.255];             // eye joint = centre of the lens (on the bump front)
const TILT = 26;                              // lens faces the 30° camera (its top edge leans back, hidden from behind)
const TOE = 30;                               // r2: lenses toed OUT 30° (frog eyes) so the near ring reads as a ring at E/W
const PUP = [0.035, 0.06, 0, -0.008];        // r2: pupil w, h, dx, dy (1 × 2 texels, centred: no glyph shapes)
const SN = 0.06;                            // r2: snout overhang (lower skull rings forward)
export const SIGN_K = 0.04;                   // vote placard authored tiny inside the fist, scaled up by 'sign.s'
const SIGN_HANDLE = 0.24, SIGN_BLOCK = 0.30;    // r2: handle above the fist, τ block 0.30 m (≈ 11 texels)
const ARM_REACH = 1.6;                          // r2: vote raise key scales upperArmR (reach above the crown)
const SIGN_UP_V = 1 / (SIGN_K * ARM_REACH) - 1;  // sign scale under the scaled arm (block stays 0.30 m)

export function skeleton() {
  const S0 = chibi({ height: SKH, heads: 2.2, legs: 0.55, arms: 0.75, snout: 0, ears: false, tail: false, shoulders: 0.44, hips: 0.19,
    face: { eye: EYE, brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  const m = S0.meta;
  const head = S.find((b) => b.name === 'head');
  head.pos = [head.pos[0], head.pos[1] - HEAD_DOWN, head.pos[2]];
  for (const s of ['L', 'R']) { const a = S.find((b) => b.name === `upperArm${s}`); a.pos = [a.pos[0] * 1.2, a.pos[1] - ARM_DOWN, a.pos[2] + 0.02]; }
  // jaw hinge at the BACK of the mouth (frog lesson: a front hinge cannot open a wide frog mouth)
  S.find((b) => b.name === 'jaw').pos = [0, 0.115, -0.09];
  for (const s of [1, -1]) S.find((b) => b.name === (s > 0 ? 'eyeL' : 'eyeR')).pos = [s * EYE[0], EYE[1], EYE[2]];
  // scarf ends (1-link chains on the chest): FRONT end on his LEFT front (v1: viewer right at S), knot end at the back
  const chestY = m.chestY;
  S.push({ name: 'scarf0', parent: 'chest', pos: [0.235, 0.495 - chestY, 0.235], axis: [0.9, -1, 0.3] });   // r2: hangs OUT past the body edge at S/SE (25 % silhouette)
  S.push({ name: 'knot0', parent: 'chest', pos: [-0.05, 0.495 - chestY, -0.235], axis: [0, -1, -0.2] });
  S.push({ name: 'sign', parent: 'handR', pos: [0, -0.035, 0.0], axis: [0, -1, 0] });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

// 8-sided ring of an ellipse (flat faces to ±X / ±Z), used for convex hulls
const ring = (y, rx, rz, cz = 0, cx = 0) => [...Array(8)].map((_, k) => { const a = (22.5 + 45 * k) * Math.PI / 180, c = Math.cos(Math.PI / 8);
  return [cx + rx * Math.cos(a) / c, y, cz + rz * Math.sin(a) / c]; });
// ellipsoid as a hull of 8-sided rings (not centred: points where they are)
const ellipsoid = ([cx, cy, cz], [rx, ry, rz]) => K.hull([-0.82, -0.32, 0.32, 0.82]
  .flatMap((v) => ring(cy + ry * v, rx * Math.sqrt(1 - v * v), rz * Math.sqrt(1 - v * v), cz, cx))
  .concat([[cx, cy - ry, cz], [cx, cy + ry, cz]]));
// r2: smoother 12-sided ellipsoid for the body + belly (critic r1: the N back was a blotchy patchwork of hi/mid facets)
const ringN = (n, y, rx, rz, cz = 0, cx = 0) => [...Array(n)].map((_, k) => { const a = (180 / n + 360 * k / n) * Math.PI / 180, c = Math.cos(Math.PI / n);
  return [cx + rx * Math.cos(a) / c, y, cz + rz * Math.sin(a) / c]; });
const ellipsoidS = ([cx, cy, cz], [rx, ry, rz]) => K.hull([-0.9, -0.62, -0.25, 0.25, 0.62, 0.9]
  .flatMap((v) => ringN(12, cy + ry * v, rx * Math.sqrt(1 - v * v), rz * Math.sqrt(1 - v * v), cz, cx))
  .concat([[cx, cy - ry, cz], [cx, cy + ry, cz]]));
// flat ring (glasses rim) in the XY plane, normal +Z, centred at the origin: 12 box segments, hole in the middle
const rim = (r, t, d) => K.merge(...[...Array(12)].map((_, k) => { const a = k * 30;
  return K.xf(K.box(2 * Math.PI * r / 12 + 0.012, t, d), { rot: [0, 0, a + 90], at: [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180), 0] }); }));

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint = chin, y 0 head-local). WIDE FLAT frog head (frog r3 recipe): skull hull of 4 octagon rings, 0.68 wide
  // at the cheeks, crown LOW (0.32) so the two eye bumps (centre 0.42) break the top outline at S/SE/SW/N ──
  const SKULL = [ring(0.10, 0.335, 0.30, 0.045 + SN), ring(0.19, 0.345, 0.30, 0.04 + SN), ring(0.27, 0.29, 0.225, 0.02 + SN * 0.5), ring(0.32, 0.18, 0.13, -0.02), ring(0.16, 0.31, 0.29, -0.01), ring(0.25, 0.27, 0.24, -0.03)].flat();   // r2: occiput deeper (E/W reads deep, not a tall egg)
  // brow filler between the two bumps (hides the glasses bridge from behind; the notch between the bumps stays)
  add('head', K.hull([[-0.09, 0.30, 0.03], [0.09, 0.30, 0.03], [-0.09, 0.30, 0.19], [0.09, 0.30, 0.19], [-0.08, 0.435, 0.06], [0.08, 0.435, 0.06], [-0.08, 0.435, 0.17], [0.08, 0.435, 0.17]]), [0, 0, 0], 'skin', { name: 'brow' });
  add('head', K.hull(SKULL), [0, 0, 0], 'skin', { name: 'skull' });
  add('head', K.box(0.56, 0.12, 0.18), [0, 0.06, -0.13], 'skin', { name: 'throatBack' });
  add('head', K.box(0.50, 0.04, 0.30), [0, 0.085, 0.04 + SN], 'dark', { name: 'mouthIn' });   // recessed: shows only when the jaw opens
  // calm wide smile: 1-texel dark band on the skull front only, corners turned up (no dark specks round the rim at E/W)
  const lip = [];
  for (const y of [0.112, 0.142]) {
    const R = ring(y, 0.347, 0.307, 0.045 + SN);
    lip.push(R[1], R[2], R[0].map((v, i) => (v + R[1][i]) / 2), R[3].map((v, i) => (v + R[2][i]) / 2));
    lip.push([0.28, y + 0.03, 0.235 + SN], [-0.28, y + 0.03, 0.235 + SN]);
  }
  add('head', K.hull(lip), [0, 0, 0.006], 'dark', { name: 'mouthLine' });
  // lower jaw: skin (cheeks wrap the sides), mouth floor on its top (shows when it opens)
  add('jaw', K.chamferBox(0.62, 0.115, 0.50, 0.3), [0, -0.058, 0.16 + SN * 0.3], 'skin', { name: 'jaw' });
  add('jaw', K.box(0.50, 0.03, 0.38), [0, 0.0, 0.16 + SN * 0.3], 'dark', { name: 'mouthFloor' });
  // eye bumps: domes on the crown front, base sunk into the skull (same slot + bone as the skull → no junction line)
  const bump = (cx, cy, cz, r) => K.hull([[0.92 * r, -0.16], [r, -0.06], [0.96 * r, 0.02], [0.75 * r, 0.07], [0.38 * r, 0.105]]
    .flatMap(([rr, dy]) => [...Array(8)].map((_, k) => { const a = (22.5 + 45 * k) * Math.PI / 180;
      return [cx + rr * Math.cos(a), cy + dy, cz + rr * Math.sin(a)]; })));
  add('head', bump(BUMP[0], BUMP[1], BUMP[2], BUMP[3]), [0, 0, 0], 'skin', { name: 'eyeBumpL' });
  add('head', bump(-BUMP[0], BUMP[1], BUMP[2], BUMP[3]), [0, 0, 0], 'skin', { name: 'eyeBumpR' });
  // cheeks (v1 1-px pink): small patches on the front diagonals of the skull, just above the smile corners
  for (const s of [1, -1]) add('head', K.xf(K.box(0.085, 0.06, 0.02), { rot: [0, s * 42, 0] }), [s * 0.252, 0.178, 0.262 + SN], 'blush', { name: `cheek${s > 0 ? 'L' : 'R'}` });

  // ── GLASSES (head bone: they never move or squash): two round dark rims in front of the eyes, bridge, temple arms
  // running back and down to the skull sides (the E/W read) ──
  const tR = TILT * Math.PI / 180, yR = TOE * Math.PI / 180;
  // lens normal for the LEFT eye (+x): yaw out TOE, then tilt back TILT (XYZ Euler: Ry first, then Rx)
  const nL = [Math.sin(yR), Math.cos(yR) * Math.sin(tR), Math.cos(yR) * Math.cos(tR)];
  const onN = (p, d, s = 1) => [p[0] + s * nL[0] * d, p[1] + nL[1] * d, p[2] + nL[2] * d];
  const RIM_R = 0.092, RIM_T = 0.044;          // ring centre radius, radial thickness → outer 0.114, inner 0.07
  for (const s of [1, -1]) {
    add('head', K.xf(rim(RIM_R, RIM_T, 0.035), { rot: [-TILT, s * TOE, 0] }), onN([s * EYE[0], EYE[1], EYE[2]], 0.035, s), 'dark', { name: `rim${s > 0 ? 'L' : 'R'}` });
    // temple: a short arm from the rim's outer edge back along the eye bump's side (no long stick across the profile)
    const x0 = s * (EYE[0] + RIM_R * Math.cos(yR)), x1 = s * (BUMP[0] + BUMP[3] - 0.006), z0 = EYE[2] - RIM_R * Math.sin(yR) + 0.02;
    add('head', K.hull([[x0, 0.40, z0], [x0, 0.37, z0], [x0 - s * 0.03, 0.40, z0], [x0 - s * 0.03, 0.37, z0],
      [x1, 0.40, 0.06], [x1, 0.37, 0.06], [x1 - s * 0.03, 0.40, 0.06], [x1 - s * 0.03, 0.37, 0.06]]), [0, 0, 0], 'dark', { name: `temple${s > 0 ? 'L' : 'R'}` });
  }
  add('head', K.xf(K.box(0.19, 0.035, 0.035), { rot: [-TILT, 0, 0] }), [0, EYE[1] + 0.02, EYE[2] + 0.05], 'dark', { name: 'bridge' });
  // eyes (on eyeL/R: blink by squash inside the rim): white disc a little bigger than the rim hole + pupil
  const lensRot = (g) => K.xf(g, { rot: [-TILT, TOE, 0] });
  add('eyeL', lensRot(K.xf(K.prism(12, 0.078, 0.06), { rot: [90, 0, 0] })), [0, 0, 0], 'lens', { name: 'eyeWhite', mirror: true });
  add('eyeL', lensRot(K.box(PUP[0], PUP[1], 0.03)), onN([PUP[2], PUP[3], 0], 0.036), 'dark', { name: 'pupil', mirror: true });

  // ── body: one round pear (blue), pale belly bulging out of its front, scarf band at the neck ──
  const bodyC = 0.38 - m.spineY;               // spine-local centre (world y 0.38; r2: bottom raised 0.13 → 0.17 so the shins show at E/W)
  add('spine', ellipsoidS([0, bodyC, 0], [0.275, 0.21, 0.235]), [0, 0, 0], 'skin', { name: 'body' });
  add('spine', ellipsoidS([0, bodyC - 0.01, 0.075], [0.205, 0.18, 0.2]), [0, 0, 0], 'belly', { name: 'belly' });
  const scY = 0.515 - m.chestY;
  add('chest', K.frustum(8, 0.27, 0.25, 0.10), [0, scY, 0.03], 'scarf', { name: 'scarfBand' });
  // knot at the back (v1 N view) — the knot end hangs from it on the knot0 chain
  add('chest', K.chamferBox(0.11, 0.08, 0.06, 0.3), [-0.05, scY - 0.03, -0.23], 'scarf', { name: 'scarfKnot' });
  // scarf ends: knitted panels hanging along each chain's own direction (built along -Y, panel faces ±Z)
  add('scarf0', K.hull([[-0.045, 0.02, -0.018], [0.045, 0.02, -0.018], [-0.045, 0.02, 0.018], [0.045, 0.02, 0.018],
    [-0.05, -0.20, -0.016], [0.05, -0.20, -0.016], [-0.05, -0.20, 0.016], [0.05, -0.20, 0.016]]), [0, 0, 0], 'scarf', { name: 'scarfEnd' });
  add('knot0', K.hull([[-0.05, 0.0, -0.018], [0.05, 0.0, -0.018], [-0.05, 0.0, 0.018], [0.05, 0.0, 0.018],
    [-0.07, -0.16, -0.016], [0.06, -0.17, -0.016], [-0.07, -0.16, 0.016], [0.06, -0.17, 0.016]]), [0, 0, 0], 'scarf', { name: 'knotEnd' });

  // ── arms: little blue arms, three-finger mitt hands ──
  add('upperArmL', K.frustum(4, 0.058, 0.052, m.upperArm + 0.03), [0, -m.upperArm / 2 + 0.01, 0], 'skin', { name: 'upperArm', mirror: true });
  add('forearmL', K.frustum(4, 0.052, 0.05, m.forearm), [0, -m.forearm / 2, 0], 'skin', { name: 'forearm', mirror: true });
  add('handL', K.chamferBox(0.085, 0.075, 0.085, 0.35), [0, -0.025, 0.01], 'skin', { name: 'hand', mirror: true });
  // r2: pale finger pads (belly slot) — the glasses-push hand reads against the blue face and the dark rim
  add('handL', K.chamferBox(0.09, 0.04, 0.06, 0.35), [0, -0.06, 0.03], 'belly', { name: 'fingerPads', mirror: true });

  // ── legs: fat haunch on the thigh (the v1 bottom bulges), short shin, big flat webbed foot ──
  add('thighL', ellipsoid([0.12, -0.06, -0.03], [0.12, 0.085, 0.13]), [0, 0, 0], 'skin', { name: 'haunch', mirror: true });
  add('shinL', K.frustum(4, 0.062, 0.055, m.shin + 0.02), [0, -m.shin / 2, 0], 'skin', { name: 'shin', mirror: true });
  const fy = -m.ankleY + 0.02;
  add('footL', K.hull([[-0.04, fy - 0.02, -0.05], [0.04, fy - 0.02, -0.05], [-0.04, fy + 0.03, -0.04], [0.04, fy + 0.03, -0.04],
    [-0.10, fy - 0.02, 0.15], [0.10, fy - 0.02, 0.15], [-0.08, fy + 0.012, 0.13], [0.08, fy + 0.012, 0.13]]), [0, 0, 0], 'skin', { name: 'foot', mirror: true });

  // ── τ placard (vote prop), authored tiny inside the right fist; −Y = beyond the fist (up when the arm is raised) ──
  const k = SIGN_K;
  const sg = (g, at, color, name) => add('sign', K.xf(g, { scale: [k, k, k], at: at.map((v) => v * k) }), [0, 0, 0], color, { name });
  // r2 (critic r1: the flat card on a long 1-px stick read as an axe at SE and as a stick through the face at E/W):
  // a knit-yellow handle + a THICK τ slab (0.30 × 0.27 × 0.17 m: ≥ 6 texels edge-on, never blade-shaped) with one big
  // upright τ on the front and back only (a τ on all four sides read as two dark 'eyes' — a skull — at SE in 1x)
  const B = SIGN_BLOCK, D = 0.17, ty = -SIGN_HANDLE - B / 2;
  sg(K.box(0.07, SIGN_HANDLE + 0.04, 0.07), [0, -SIGN_HANDLE / 2 + 0.02, 0], 'scarf', 'signStick');
  sg(K.chamferBox(B, B * 0.9, D, 0.12), [0, ty, 0], 'lens', 'signCard');
  for (const [nz, tag] of [[1, 'F'], [-1, 'B']]) {
    const z = nz * (D / 2 + 0.008);
    sg(K.box(B * 0.72, 0.075, 0.02), [0, ty - B * 0.26, z], 'dark', `signTau${tag}`);
    sg(K.box(0.08, B * 0.52, 0.02), [0, ty + 0.01, z], 'dark', `signStem${tag}`);
    sg(K.box(0.07, 0.05, 0.02), [0.05, ty + B * 0.22, z], 'dark', `signHook${tag}`);   // τ foot curls right
  }
  return P;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz grid) ──────────────────────────────────────────────────
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const SHUT = EYES(0.05, -0.82);
const ARMS = (out, fwd = 0, el = 10) => ({ upperArmL: [fwd, 0, out], upperArmR: [fwd, 0, out], forearmL: [el, 0, 0], forearmR: [el, 0, 0] });
// r2: the breath is a RIGID whole-texel drop (1 screen texel = 0.0278/cos 30° m of world y) + the arms; no chest/head
// rotation, so the glasses and pupils re-rasterise identically (critic r1: pupils changed shape between idle keys)
const TX_Y = 0.02778 / Math.cos(Math.PI / 6);
const breathe = (n, c) => ({ pos: [0, -0.01 - n * TX_Y, 0], ...ARMS(6 + c, 2, 10) });
// a crouch with FK legs that keeps the feet on the ground: thigh a, shin −2a, foot a, root down by the two segments
const crouch = (a, S = SEG) => { const r = Math.PI / 180 * a, dy = (S.thigh + S.shin) * (1 - Math.cos(r));
  return { dy, legs: { thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], footL: [a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0], footR: [a, 0, 0] } }; };
const SEG = { thigh: 0.123, shin: 0.118 };
const C30 = crouch(30), C45 = crouch(45);
// stiff plank topple backward about the heels: root offset for a body tipped back by a° (hips joint 0.331 m up)
// r2: the topple also ROLLS (out, applied before the pitch) so the lying body is diagonal: side-on enough to read as
// down at S/N too (critic r1: at S/N the foreshortened body read as a squat standing frog). Root offset keeps the heels
// put: hip joint (h up) goes to h·up, up = (sin r, cos r·cos a, −cos r·sin a).
const DIE_ROLL = -38;
const plank = (a, lift = 0) => { const r = Math.PI / 180 * a, q = Math.PI / 180 * DIE_ROLL * Math.min(1, a / 90), h = 0.331;
  return [h * Math.sin(q), h * Math.cos(q) * Math.cos(r) - h + lift, -h * Math.cos(q) * Math.sin(r)]; };
const tip = (a) => [-a, 0, DIE_ROLL * Math.min(1, a / 90)];
// r2: the hanging scarf front end is tucked away (scale 0) once he lies down: it rasterised as a brown blob under the body
const TUCK = { 'scarf0.s': [-1, -1, -1], 'knot0.s': [-1, -1, -1] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: breathe(0, 0) }, { f: 30, pose: breathe(1, 4) },
    { f: 54, pose: { ...breathe(1, 4), ...SHUT } }, { f: 56, pose: breathe(1, 4) },
  ] },
  // walk = the metronomic hop (LegGait 'hop' legs; this clip REPLACES the plan's body pitch: upright and rigid). One key
  // per drawing: f0 touchdown (arms in), f1 rise, f2 apex (arms out widest), f3 fall. Identical every cycle.
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: { pos: [0, -3 * TX_Y, 0], hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], ...ARMS(4, 4, 14) } },
    { f: 1, pose: { pos: [0, 5 * TX_Y, 0], hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], ...ARMS(42, 0, 10) } },
    { f: 2, pose: { pos: [0, 10 * TX_Y, 0], hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], ...ARMS(62, -4, 8) } },
    { f: 3, pose: { pos: [0, 5 * TX_Y, 0], hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], ...ARMS(36, 0, 10) } },
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: { hips: [4, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [-4, 0, 0], ...ARMS(6, -10, 20) } },
    { f: 1, pose: { hips: [4, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [-4, 0, 0], ...ARMS(30, -20, 10) } },
    { f: 2, pose: { hips: [4, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [-4, 0, 0], ...ARMS(44, -24, 8) } },
    { f: 3, pose: { hips: [4, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [-4, 0, 0], ...ARMS(26, -16, 10) } },
  ] },
  // talk (loop 24): a lecturer's beat every 6 frames — jaw open 24° on alternating keys, head rolls toward the camera,
  // the right hand presents forward-out BELOW the wide head on the open keys (≈ 55° arm change per key; up beside the
  // head it was hidden by the 0.69 m skull at SE)
  talk: { fps: 30, loop: true, interp: 'step', length: 24, dynamics: 'hold', events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.005, 0], chest: [-3, 6, 0], head: [-6, 6, 9], jaw: [24, 0, 0],
      upperArmR: [58, 0, 46], forearmR: [24, 0, 0], handR: [0, 0, 10], upperArmL: [4, 0, 8], forearmL: [12, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.03, 0], chest: [2, -2, 0], head: [2, -4, -9], jaw: [0, 0, 0],
      upperArmR: [4, 0, 10], forearmR: [16, 0, 0], upperArmL: [4, 0, 8], forearmL: [12, 0, 0] } },
    { f: 12, pose: { pos: [0, -0.005, 0], chest: [-3, -6, 0], head: [-6, -6, 9], jaw: [22, 0, 0],
      upperArmR: [62, 0, 52], forearmR: [28, 0, 0], handR: [0, 0, 10], upperArmL: [4, 0, 8], forearmL: [12, 0, 0] } },
    { f: 18, pose: { pos: [0, -0.03, 0], chest: [2, 2, 0], head: [2, 4, -9], jaw: [4, 0, 0],
      upperArmR: [4, 0, 10], forearmR: [16, 0, 0], upperArmL: [4, 0, 8], forearmL: [12, 0, 0] } },
  ] },
  // vote: dip (3) → the paw goes straight UP beside the wide head holding the τ BLOCK on a short knit-yellow handle (r2: the
  // upper arm is scaled ×1.6 on the raise key so the short chibi arm reaches past the crown; the block reads at all 8
  // facings — at E/W it sits above the occiput, clear of the glasses; hand roll −22 keeps the τ upright, twist −30 turns
  // the face toward the SE pack facing: τ reads at S/SE/E/N/NW, edge-on slab at W/NE/SW), eyes a touch wider, HELD
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.045, 0], spine: [5, 0, 0], chest: [5, -8, 0], head: [-5, 5, 0],
      upperArmR: [-20, 0, 18], forearmR: [30, 0, 0], upperArmL: [6, 0, 8] } },
    { f: 3, pose: { pos: [0, 0.02, 0], spine: [-2, 0, 3], chest: [-3, 0, 3], head: [-4, -6, -6], jaw: [12, 0, 0], ...EYES(0.06, 0.12),
      upperArmR: [188, 0, 20], 'upperArmR.s': [ARM_REACH - 1, ARM_REACH - 1, ARM_REACH - 1], forearmR: [0, 0, 0], handR: [0, -30, -22], upperArmL: [8, 0, 12], forearmL: [16, 0, 0],
      'sign.s': [SIGN_UP_V, SIGN_UP_V, SIGN_UP_V] } },
  ] },
  // die (gentle, no hurt): stiffens, eyes wide (6) → topples backward AS A PLANK, rigid, about the heels (25° 5f, 60° 3f)
  // → lands flat on his back, legs sticking up stiff, dust + soul (f14) → small bounce (f16) → settles, chin tucked so the
  // shut-eyed face looks at the camera; glasses stay on. Legs FK (the whole body rotates as one piece).
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 14: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, 0.012, 0], head: [-4, 0, 0], ...EYES(0.1, 0.18), ...ARMS(2, 0, 0) } },
    { f: 6, pose: { pos: plank(25), hips: tip(25), head: [-2, 0, 0], ...EYES(0.1, 0.18), ...ARMS(2, 0, 0) } },
    { f: 11, pose: { pos: plank(60), hips: tip(60), head: [4, 0, 0], ...EYES(0.05, -0.5), ...ARMS(6, 0, 0) } },
    { f: 14, pose: { pos: plank(90, 0.115), hips: tip(90), head: [22, 0, 0], ...SHUT, ...ARMS(10, 0, 0), jaw: [6, 0, 0], ...TUCK } },
    { f: 16, pose: { pos: plank(84, 0.15), hips: tip(84), head: [26, 0, 0], ...SHUT, ...ARMS(14, 0, 0), jaw: [6, 0, 0], ...TUCK } },
    { f: 20, pose: { pos: plank(90, 0.115), hips: tip(90), head: [28, 0, 0], ...SHUT, ...ARMS(12, 0, 0), ...TUCK } },
  ] },
  // invariant (emote, "never changes type"): crouch (4) → hops up and spins a full turn in stop-motion 90° steps
  // (2 frames each) → lands in the IDENTICAL stance (dust) → pushes his glasses up with the right hand (8) → star glint
  // on the glasses and he holds PERFECTLY still, chin up (18) → idle
  invariant: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 10: 'land', 22: 'emote:star@glasses' }, keys: [
    { f: 0, pose: { pos: [0, -C45.dy, 0], ...C45.legs, hips: [6, 0, 0], head: [-6, 0, 0], ...ARMS(4, 10, 20) } },
    { f: 4, pose: { pos: [0, 0.24, 0], hips: [0, 90, 0], ...crouch(40).legs, ...ARMS(40, 0, 10) } },
    { f: 6, pose: { pos: [0, 0.27, 0], hips: [0, 180, 0], ...crouch(40).legs, ...ARMS(40, 0, 10) } },
    { f: 8, pose: { pos: [0, 0.22, 0], hips: [0, 270, 0], ...crouch(30).legs, ...ARMS(30, 0, 10) } },
    { f: 10, pose: { pos: [0, -C30.dy, 0], ...C30.legs, ...ARMS(10, 4, 14) } },
    // r2: the paw reaches the RIGHT lens (upper arm ×1.9 on this key only: the chibi arm is too short to reach the face) so
    // the pale finger pads lie across the lens against the dark rim (critic r1: skin-on-skin, invisible), held 8 frames
    { f: 14, pose: { pos: [0, 0, 0], head: [8, 0, -12], upperArmR: [135, 0, -11], 'upperArmR.s': [0.9, 0.9, 0.9], forearmR: [0, 0, 0], handR: [0, 0, 0], upperArmL: [2, 0, 6], forearmL: [10, 0, 0] } },
    { f: 22, pose: { pos: [0, 0.005, 0], chest: [-4, 0, 0], head: [-7, 0, 0], ...ARMS(3, 0, 0), ...EYES(0.04, 0.06) } },
    { f: 42, pose: breathe(0, 0) },
  ] },
};
// vote / die end on a HELD pose (clip.hold): repeat the last key later so the clip length covers the FX tail
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  return {
    name: 'preservation',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['skin', 'scarf'],
    faceSlot: 'skin',
    bodyPlan: 'hopper',
    heightPx: [36, 46],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'hop' },
    emote: 'invariant',
    skeleton: S,
    parts: parts(S),
    // r2: fx glyphs draw ≈ 0.16 m + 5 texels ABOVE their node, so 'glasses' sits 0.30 m under the right lens: the star lands ON it
    sockets: { crown: { bone: 'head', at: [0, 0.58, 0.04] }, glasses: { bone: 'head', at: [-EYE[0], EYE[1] - 0.30, EYE[2] + 0.10] } },
    chains: [
      { name: 'scarf', bones: ['scarf0'], f: 3.5, zeta: 0.55, r: 0, gravity: 0.6, drag: 0.8, limit: 35, falloff: 1 },
      { name: 'knot', bones: ['knot0'], f: 3.5, zeta: 0.55, r: 0, gravity: 0.6, drag: 0.8, limit: 35, falloff: 1, noForward: true },
    ],
    personality: { body: { f: 2, zeta: 1, r: 0 }, head: { f: 2, zeta: 1, r: 0 } },
    locomotion: { plan: 'hop', legs: { HL: ['thighL', 'shinL', 'footL'], HR: ['thighR', 'shinR', 'footR'] },
      walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4], duty: [0.25, 0.2], reach: 0.6,
      hop: [10 * TX_Y, 0.36 * HEIGHT], lean: [0, 6], lift: [-0.07, 0.05], plant: 'hold', surge: false,
      // height 1.3·H scales LegGait's touchdown crouch (0.06·height ≈ 0.087 m ≈ 3 texels); the other height-derived
      // defaults are given explicitly (frog r3 recipe)
      height: 1.3 * HEIGHT, stepLift: 0.056, stepTol: 0.067, vStart: 0.117, vStop: 0.064 },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    // r2: lens whites lifted (stay white when the head rolls away from the key, talk f6) + golden white keep
    material: { sides: { eyeL: 'mid', eyeR: 'mid', scarf0: 'mid', knot0: 'mid' }, whiteKeep: 0.7, slots: { lens: { lift: 0.8 } } },
  };
}

export default make();
