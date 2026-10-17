// Greenting (char-greenting) — cast member "greenting", UCT mascot: "A round green creature. Nobody knows what it is."
// Design sheet (Unique to me, timing charts, self-critique): characters/greenting.md. Identity source = the USER's
// PRIMARY reference refs/cast/greenting.png (2026-10-16, "it should basically be like Joguman"): a soft, rounded, flat
// mint/leaf-green creature with a LONG body/neck, small stubby arms and legs, a rounded head at the top end, and a tiny
// simple face (two dot eyes + a small smile) placed toward the snout end of the head, not centred on a front plate.
// (Older refs — the gumdrop with a duck-bill snout — are superseded.)
// Body plan: upright, long-bodied, stubby-limbed (bodyPlan 'uprightAnimal'). Custom skeleton with biped bone names
// (hips → spine → chest → neck → head; stubby arms upperArm → forearm → hand; stubby legs thigh → shin → foot; tail0;
// eyeL/R + mouth on the head). Gait at game speed: LegGait 'biped' with the BIRD body style = a stiff WADDLE (legs
// 0.1 m can only shuffle at 4 H/s; the long body rolls onto the planted foot and the head sways = the rhythm).
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.12;                 // v2 28 px → castHeight 1.12 m (head top)
export const V_GAME = 3.95 * HEIGHT;        // 4.42 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. Ref = flat mint / leaf green (≈ #28B47D, hue ≈ 156°, ≈ 60° off grass mid #75A558). Shadow kept
// on the ref hue (no teal-slate / mauve: R W3) and light enough for the pillar shadow (≥ 15 % L over grass shadow).
// ink = eye dots + smile (the ref's dark outline colour), a dark green-slate, never black.
export const PALETTE = {
  jade: ['#66D8A4', '#2EB27E', '#2A8C68'],
  ink: ['#33433F', '#2A3633', '#222C2B'],
};

// ── joints (world, character at rest; L side) ──
const HIPS_Y = 0.16, SPINE_Y = 0.22, CHEST_Y = 0.46, NECK_Y = 0.62, HEAD_Y = 0.74;
export const HEAD_TILT = 35;                // the head's long axis leans forward 35° from vertical (the snout end)
const T = HEAD_TILT * Math.PI / 180;
const U = [0, Math.cos(T), Math.sin(T)];    // head axis (up-forward)
const V = [0, -Math.sin(T), Math.cos(T)];   // perpendicular to U in the y-z plane (forward-down)
const HEAD_R = 0.172, HEAD_LEN = 0.24;       // head tube radius and length to the centre of the end cap
const SHOULDER = [0.17, 0.50, 0.0];
const ARM_LEN = 0.21;                       // stubby arm beyond the shoulder joint
const HIP_X = 0.095, LEG = 0.055;           // hip x, thigh / shin lengths (ankle at y 0.05)

const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** ring of n points, radius r (x) and r·d (depth), centred at c, in the plane spanned by X and v */
const ring = (c, r, v = [0, 0, 1], n = 16, d = 1) => [...Array(n)].map((_, k) => {
  const a = (k + 0.5) * 2 * Math.PI / n; return add3(add3(c, [1, 0, 0], r * Math.sin(a)), v, d * r * Math.cos(a)); });
/** a small dark bead on a surface: square plate (half size a × ay) centred at p, facing n, from depth −h to +0.008 */
function bead(p, n, a, h = 0.03, ay = a) {
  const t1 = norm(cross([0, 1, 0], n)), t2 = cross(n, t1), P = [];
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) for (const dz of [-h, 0.008]) P.push(add3(add3(add3(p, t1, s1 * a), t2, s2 * ay), n, dz));
  return K.hull(P);
}
/** a capsule (rounded lobe) from a to b, radius r (8-sided rings + caps) */
function lobe(a, b, r, n = 8) {
  const d = norm(sub(b, a)), u = norm(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0])), w = cross(d, u), P = [];
  const rg = (c, rr) => { for (let k = 0; k < n; k++) { const q = (k + 0.5) * 2 * Math.PI / n; P.push(add3(add3(c, u, rr * Math.cos(q)), w, rr * Math.sin(q))); } };
  for (const [c, s] of [[a, -1], [b, 1]]) { rg(c, r); P.push(add3(c, d, s * r * 0.75)); }   // r7: no inner cap ring (its 1-texel facets were isolated px)
  return K.hull(P);
}

// head geometry (world): tube from the head joint along U, end cap (hemisphere) centred at CAP
const HEAD_J = [0, HEAD_Y, 0.01];
export const CAP = add3(HEAD_J, U, HEAD_LEN);
// face (r9, critic fix): a TINY face set OFF-CENTRE on the snout end, like the Joguman ref. Points on the head surface
// are given as (phi, beta): phi = angle round the head axis from its front (V, forward-down) toward +x (char left),
// beta = elevation from the cap equator (> 0 onto the end cap, < 0 back along the tube). The eyes sit on the SIDES
// (|x| ≥ 0.7 of the radius) a little behind the cap, so each profile shows one 2×2 eye on the side of the head; the
// whole face is turned FACE_YAW toward the char's left, so even S shows it off-centre.
const X = [1, 0, 0];
const headDir = (phi, beta) => { const p = phi * Math.PI / 180, b = beta * Math.PI / 180;
  const side = add3(X.map((v) => v * Math.sin(p)), V, Math.cos(p));
  return beta >= 0 ? norm(add3(side.map((v) => v * Math.cos(b)), U, Math.sin(b))) : side; };
/** surface point + outward normal at (phi, beta) */
const headPt = (phi, beta, inset = 0) => { const n = headDir(phi, beta), b = beta * Math.PI / 180;
  const c = beta >= 0 ? CAP : add3(CAP, U, HEAD_R * Math.sin(b));
  return { p: add3(c, n, HEAD_R - inset), n }; };
export const FACE_YAW = 6;
export const EYE_PHI = [FACE_YAW + 66, FACE_YAW - 76], EYE_BETA = 14;
export const SMILE_PHI = FACE_YAW + 6, SMILE_BETA = 6;
export const EYE_L = headPt(EYE_PHI[0], EYE_BETA, 0.006).p, EYE_R = headPt(EYE_PHI[1], EYE_BETA, 0.006).p;
export const MOUTH_P = headPt(SMILE_PHI, SMILE_BETA, 0.004).p;
const SMILE = [[-11, 3], [0, 0], [11, 3]];                      // [dphi, dbeta] per bead (ends up = a smile)
const MOUTH_SINK = 0.045;
const MOUTH_N = headDir(SMILE_PHI, SMILE_BETA - 7);
const MOUTH_OPEN = { 'mouthO.p': MOUTH_N.map((v) => v * (MOUTH_SINK + 0.004)) };

export function skeleton() {
  const W = { hips: [0, HIPS_Y, 0], spine: [0, SPINE_Y, 0], chest: [0, CHEST_Y, 0], neck: [0, NECK_Y, 0], head: HEAD_J };
  const S = [
    { name: 'hips', pos: W.hips, axis: 'up' },
    { name: 'spine', parent: 'hips', pos: sub(W.spine, W.hips), axis: 'up' },
    { name: 'chest', parent: 'spine', pos: sub(W.chest, W.spine), axis: 'up' },
    { name: 'neck', parent: 'chest', pos: sub(W.neck, W.chest), axis: 'up' },
    { name: 'head', parent: 'neck', pos: sub(W.head, W.neck), axis: 'up' },
    { name: 'eyeL', parent: 'head', pos: sub(EYE_L, HEAD_J), axis: 'up' },
    { name: 'eyeR', parent: 'head', pos: sub(EYE_R, HEAD_J), axis: 'up' },
    { name: 'mouth', parent: 'head', pos: sub(MOUTH_P, HEAD_J), axis: 'up' },
    { name: 'mouthO', parent: 'head', pos: sub(MOUTH_P, HEAD_J), axis: 'up' },   // r9: filled talk mouth (buried at rest, .p out)
    { name: 'tail0', parent: 'hips', pos: [0, -0.03, -0.17], axis: 'back' },
  ];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    S.push({ name: `upperArm${L}`, parent: 'chest', pos: sub([s * SHOULDER[0], SHOULDER[1], SHOULDER[2]], W.chest), axis: 'out' },
      { name: `forearm${L}`, parent: `upperArm${L}`, pos: [s * ARM_LEN, 0, 0], axis: 'out' },
      { name: `hand${L}`, parent: `forearm${L}`, pos: [s * 0.02, 0, 0], axis: 'out' },
      { name: `thigh${L}`, parent: 'hips', pos: [s * HIP_X, 0, 0], axis: 'down' },
      { name: `shin${L}`, parent: `thigh${L}`, pos: [0, -LEG, 0], axis: 'down' },
      { name: `foot${L}`, parent: `shin${L}`, pos: [0, -LEG, 0], axis: 'down' });
  }
  return S;
}

export function parts() {
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  const local = (pts, j) => pts.map((p) => sub(p, j));
  // body tube (spine): soft rounded bottom, nearly straight long body tapering a little toward the neck
  const BODY = [[0.12, 0.12], [0.183, 0.19], [0.19, 0.30], [0.188, 0.44], [0.181, 0.56], [0.175, 0.66], [0.172, 0.70]];
  add('spine', K.hull(local(BODY.flatMap(([r, y]) => ring([0, y, 0], r, [0, 0, 1], 16, 0.94)), [0, SPINE_Y, 0])), [0, 0, 0], 'jade', { name: 'body' });
  // neck: continues the tube up to the head joint, leaning into the head axis
  const NECK = [ring([0, 0.60, 0], 0.177, [0, 0, 1], 16, 0.94), ring([0, 0.70, 0.004], 0.174, [0, 0, 1], 16, 0.95), ring(add3(HEAD_J, U, 0.02), 0.172, V, 16, 0.96)].flat();
  add('neck', K.hull(local(NECK, [0, NECK_Y, 0])), [0, 0, 0], 'jade', { name: 'neck' });
  // head: tube along U + hemispherical end cap (the snout end)
  const HEAD = [ring(add3(HEAD_J, U, 0.0), HEAD_R * 0.99, V), ring(add3(HEAD_J, U, 0.12), HEAD_R * 1.02, V), ring(CAP, HEAD_R, V)];
  for (const ph of [28, 52, 72, 86]) { const q = ph * Math.PI / 180; HEAD.push(ring(add3(CAP, U, HEAD_R * Math.sin(q)), HEAD_R * Math.cos(q), V, ph > 80 ? 8 : 16)); }
  add('head', K.hull(local(HEAD.flat(), HEAD_J)), [0, 0, 0], 'jade', { name: 'head' });
  // face: two dot eyes (2×2 texels) + a small smile (7 beads in a U wrapping round the snout end: the ends show at E/W)
  add('eyeL', bead([0, 0, 0], headDir(EYE_PHI[0], EYE_BETA), 0.031, 0.03), [0, 0, 0], 'ink', { name: 'eyeL' });
  add('eyeR', bead([0, 0, 0], headDir(EYE_PHI[1], EYE_BETA), 0.031, 0.03), [0, 0, 0], 'ink', { name: 'eyeR' });
  // r9: a SMALL smile = 3 beads in a shallow curve (≈ 4 texels wide on the 12-texel head)
  for (const [i, [dp, db]] of SMILE.entries()) {
    const { p, n } = headPt(SMILE_PHI + dp, SMILE_BETA + db, 0.004);
    add('mouth', bead(sub(p, MOUTH_P), n, 0.026, 0.03, 0.016), [0, 0, 0], 'ink', { name: `smile${i}` });
  }
  // r9: the open talk mouth = ONE filled dark plate (≈ 3 × 2 texels) just under the smile, buried MOUTH_SINK inside the
  // head at rest; talk keys push it out with 'mouthO.p' (MOUTH_OPEN). Never scale the smile beads.
  { const { p, n } = headPt(SMILE_PHI, SMILE_BETA - 7, 0);
    add('mouthO', bead(add3(sub(p, MOUTH_P), n, -MOUTH_SINK), n, 0.04, 0.03, 0.028), [0, 0, 0], 'ink', { name: 'mouthOpen' }); }
  // stubby arms: one chamfered box each (r7: fewer 1-texel facets than a lobe), out to the side, 6° down
  add('upperArmL', K.xf(K.chamferBox(ARM_LEN + 0.06, 0.11, 0.11, 0.4), { rot: [0, 0, -6] }), [ARM_LEN / 2 - 0.02, -0.01, 0.005], 'jade', { name: 'arm', mirror: true });
  // stubby legs: a thigh stub + a chamfered foot box under each hip (2-4 texels show under the body)
  add('thighL', K.chamferBox(0.11, 0.10, 0.11, 0.3), [0, -0.03, 0], 'jade', { name: 'thigh', mirror: true });
  add('footL', K.chamferBox(0.11, 0.095, 0.16, 0.4), [0, -0.0025, 0.025], 'jade', { name: 'foot', mirror: true });
  // tail: a short soft stub at the back bottom
  add('tail0', lobe([0, 0.03, 0.05], [0, -0.02, -0.17], 0.06), [0, 0, 0], 'jade', { name: 'tail' });
  return P;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz grid) ──────────────────────────────────────────────────
const EYES = (sy) => ({ 'eyeL.s': [0, sy, 0], 'eyeR.s': [0, sy, 0] });
const BLINK = EYES(-0.8);
const breathe = (c) => ({ pos: [0, 0, 0], chest: [c, 0, 0], neck: [-c, 0, 0] });
const ARMS = (a, b = a) => ({ upperArmL: [0, 0, a], upperArmR: [0, 0, b] });
const POINT = { chest: [8, 0, 0], neck: [6, 0, 0], head: [-4, 0, 0], upperArmL: [62, 0, 26], 'upperArmL.l': [1.6], upperArmR: [58, 0, 8], 'upperArmR.l': [1.1] };   // r9: BOTH stubs reach forward + a neck lunge (reads at 8/8)

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: { ...breathe(0), ...ARMS(-20) } }, { f: 30, pose: { ...breathe(2), ...ARMS(-18) } },
    { f: 36, pose: { ...breathe(4), ...ARMS(-14), head: [0, 0, 6] } },
    { f: 52, pose: { ...breathe(4), ...ARMS(-14), head: [0, 0, 6], ...BLINK } }, { f: 54, pose: { ...breathe(4), ...ARMS(-14), head: [0, 0, 6] } },
    { f: 66, pose: { ...breathe(2), ...ARMS(-18) } },
  ] },
  // walk = THE game gait (LegGait 'biped' + bird body style = waddle; this clip ADDS on top, one key per drawing,
  // f0 = left contact): the stubby arms flap alternately (±24° per drawing pair), the tail wags, the head counter-rolls
  // a little so the face stays put
  walk: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { pos: [0, -0.028, 0], upperArmL: [0, 0, 16], upperArmR: [0, 0, -24], tail0: [0, 0, 22], head: [0, 0, -3] } },
    { f: 1, pose: { upperArmL: [0, 0, -4], upperArmR: [0, 0, -4], tail0: [0, 0, 0] } },
    { f: 2, pose: { pos: [0, -0.028, 0], upperArmL: [0, 0, -24], upperArmR: [0, 0, 16], tail0: [0, 0, -22], head: [0, 0, 3] } },
    { f: 3, pose: { upperArmL: [0, 0, -4], upperArmR: [0, 0, -4], tail0: [0, 0, 0] } },
  ] },
  // talk (r9: loop 36, a key every 9 frames = 0.3 s): the long body sways side to side like a metronome (chest + neck +
  // head roll ≈ ±28° → 40° between keys), the filled mouth plate pops out on the outward keys, the free stub arm flaps up
  talk: { fps: 30, loop: true, interp: 'step', length: 36, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { chest: [0, 0, 8], neck: [-4, 0, 10], head: [-6, 0, 10], ...MOUTH_OPEN, ...ARMS(-20, 40) } },
    { f: 9, pose: { pos: [0, -0.02, 0], chest: [2, 0, -2], neck: [4, 0, -4], head: [4, 0, -6], ...ARMS(-20) } },
    { f: 18, pose: { chest: [0, 0, -8], neck: [-4, 0, -10], head: [-6, 0, -10], ...MOUTH_OPEN, ...ARMS(40, -20) } },
    { f: 27, pose: { pos: [0, -0.02, 0], chest: [2, 0, 2], neck: [4, 0, 4], head: [4, 0, 6], ...ARMS(-20) } },
  ] },
  vote: { fps: 30, loop: false, interp: 'step', length: 30, events: { 6: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [6, 0, 0], ...ARMS(-30) } },
    { f: 3, pose: { chest: [-2, 0, 4], head: [-6, 0, 0], upperArmL: [0, 0, -20], upperArmR: [-6, 0, 54], 'upperArmR.l': [2.6] } },
    { f: 6, pose: { chest: [-3, 0, 6], head: [-8, 0, -4], upperArmL: [0, 0, -20], upperArmR: [-6, 0, 66], 'upperArmR.l': [4.6] } },
  ] },
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { chest: [-4, 0, 0], head: [4, 0, 0], ...ARMS(-30) } },
    { f: 4, pose: POINT },
    { f: 16, pose: { ...POINT, pos: [0, 0, 0.03], chest: [12, 0, 0], neck: [8, 0, 0], head: [-6, 0, 0], upperArmL: [66, 0, 30], 'upperArmL.l': [2.0], 'upperArmR.l': [1.4] } },
    { f: 24, pose: POINT },
    { f: 84, pose: { ...breathe(0), ...ARMS(-20) } },
  ] },
  // die (gentle, no hurt): stagger left (6) → wobble right, knees giving (6) → topples sideways, twisting (6) → lies on
  // its LEFT side, rolled 80° and turned 40° so the long body lies diagonally (reads "down" at 8/8), eyes shut, legs
  // and one arm up (dust + soul at the landing) → settles (held to the end)
  die: { fps: 30, loop: false, interp: 'step', length: 60, legs: 'fk', events: { 18: 'die' }, keys: [
    { f: 0, pose: { chest: [0, 0, 10], neck: [0, 0, 8], head: [0, 0, 6], ...EYES(-0.5), ...ARMS(-10) } },
    { f: 6, pose: { pos: [0, -0.04, 0], chest: [4, 0, -12], neck: [6, 0, -10], head: [6, 0, -8], ...EYES(-0.6), ...ARMS(10),
      thighL: [30, 0, 0], shinL: [-50, 0, 0], thighR: [30, 0, 0], shinR: [-50, 0, 0] } },
    { f: 12, pose: { pos: [0, 0.0, 0], hips: [0, 20, 40], chest: [0, 0, 8], neck: [10, 0, -5], head: [15, 0, -10], ...BLINK,
      upperArmL: [0, 0, 40], upperArmR: [0, 0, -20], thighL: [30, 0, 0], thighR: [40, 0, 0] } },
    { f: 18, pose: { pos: [0, 0.06, 0], hips: [54, 0, 58], spine: [0, 0, 8], chest: [0, 0, 10], neck: [10, 0, -4], head: [14, 0, -10], ...BLINK,
      upperArmL: [0, 0, 70], upperArmR: [0, 0, -40], thighL: [40, 0, 0], thighR: [60, 0, 0] } },
    { f: 22, pose: { pos: [0, 0.05, 0], hips: [60, 0, 60], spine: [0, 0, 6], chest: [0, 0, 8], neck: [8, 0, 0], head: [10, 0, -6], ...BLINK,
      upperArmL: [0, 0, -10], upperArmR: [0, 0, -72], thighL: [12, 0, 0], thighR: [16, 0, 0] } },   // r9: lies diagonal at more facings, limbs down
  ] },
  mystery: { fps: 30, loop: false, interp: 'step', events: { 28: 'emote:question@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], ...ARMS(-30) } },
    ...[45, 90, 135, 180, 225, 270, 315].map((a, i) => ({ f: 4 + 3 * i, pose: { pos: [0, 0.03, 0], hips: [0, a, 0], ...ARMS(-20) } })),
    { f: 25, pose: { pos: [0, -0.04, 0], ...ARMS(-30) } },
    { f: 28, pose: { head: [0, 0, 24], neck: [0, 0, 10], chest: [0, 0, 4], upperArmL: [0, 0, 55], upperArmR: [0, 0, 55] } },
    { f: 44, pose: { ...breathe(0), ...ARMS(-20) } },
  ] },
  ghost: { fps: 30, loop: true, interp: 'step', length: 72, legs: 'float', keys: [0, 18, 36, 54].map((f, i) => ({ f,
    pose: { pos: [0, [0, 0.028, 0.056, 0.028][i], 0], head: [-6, 0, 0], ...EYES(-0.3), ...ARMS(20 + [0, 6, 12, 6][i]) } })) },
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 72, legs: 'float', keys: [0, 18, 36, 54].map((f, i) => ({ f,
    pose: { pos: [0, [0, 0.014, 0.028, 0.014][i], 0], neck: [10, 0, 0], head: [12, 0, 0], ...EYES(-0.6), ...ARMS(-40) } })) },
};

export function make() {
  return {
    name: 'greenting',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['jade', { part: 'head' }],
    faceSlot: 'jade',
    bodyPlan: 'uprightAnimal',
    heightPx: [32, 46],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'waddle' },
    emote: 'mystery',
    skeleton: skeleton(),
    parts: parts(),
    sockets: { crown: { bone: 'head', at: add3(sub(CAP, HEAD_J), U, HEAD_R + 0.12) } },
    personality: { body: { f: 2, zeta: 1, r: 0 }, head: { f: 2, zeta: 1, r: 0 } },
    locomotion: { plan: 'biped', style: 'bird', plant: 'hold', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267],
      poses: [4, 4], duty: [0.25, 0.2], roll: [10, 10], headBob: [4, 4], lean: [4, 6], lift: [0.06, 0.08], arms: [0, 0], elbows: [0, 0] },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    ghost: { hover: 0.14, keepHue: 0.45 },   // r9: the green IS the identity — keep some of it in the ghost ramps
    fx: { speech: { node: 'crown' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid' }, merge: { spine: 'hips', neck: 'hips', head: 'hips', tail0: 'hips', upperArmL: 'hips', upperArmR: 'hips',
      thighL: 'hips', thighR: 'hips', footL: 'hips', footR: 'hips' } },   // r9: legs → hips too (no light-grey leg-root line)
  };
}

export default make();
