// Porter (char-npc-porter) — cast member "npc-porter", NPC (no blurb): a town porter, deliberately boring.
// Design sheet (## Unique to me, timing charts, ## Self-critique): characters/npc-porter.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/npc-porter.ts + refs/cast/npc-porter.png.
// Body plan: upright townsfolk CHIBI (chibi() at 2.8 heads, leg 0.29 H) on LegGait 'biped' (plant 'hold', swingFloor
// 'gait') at the v2 game speed = a LOADED SCURRY: the authored walk (blend 'add', one key per gait drawing) keys the SACK
// (bone `sack`, child of the chest, pivot at the strap knot on the right shoulder) a drawing behind the body, kicks the
// apron flap and leans the body under the load.
// Structure: palette → skeleton (chibi + sack / apron bones) → parts → clips → spec.
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.12;                       // ground → hood top (castHeight(28))
export const V_GAME = 3.95 * H;              // 4.42 m/s (v2 150 px/s on a 38 px sprite, relative to body height)
const BODY = { height: H, heads: 2.8, legs: 0.8, arms: 0.9, snout: 0, ears: false, tail: false };

// [hi, mid, sh] sRGB. 5 slots + the eye accent. v1 values kept (hood #3A3438, sack #A19276/#897A61, skin #8A6448,
// tunic #4E5A46, leather #5C4432, trousers #33302C → hood slot); only sh lifted for the night rule (along each hue).
export const PALETTE = {
  hood: ['#5A5452', '#4A4443', '#463F47'],     // hood, collar, trousers, chest strap (the dark mass; r2 neutral charcoal)
  skin: ['#B08460', '#8A6448', '#664A3E'],     // face, nose, hands
  tunic: ['#6C7A5C', '#4E5A46', '#444E48'],    // dull-green work tunic + sleeves
  leather: ['#8C6A46', '#6A4E36', '#4A383A'],  // apron, boots (r2 boot mid lifted off the trousers)
  sack: ['#F2E8D2', '#D2C4A8', '#968A80'],     // SIGNATURE: the burlap sack (lightest mass; r2 cooler grey-cream)
  eye: ['#4A3E48', '#2C2228', '#2C2228'],      // eyes, mouth
};

// head-local (head joint at char y 0.712): face box + hood
const FACE = { c: [0, 0.165, 0.112], s: [0.215, 0.22, 0.22] };          // front z 0.222 (r2: inside the rim front 0.23 at E/W)
const EYE = [0.068, 0.18, 0.204];
// r2: the sack hangs on the LOWER back like v1 (centre char y ≈ 0.64, eye level → waist), near the spine (x −0.07)
const SACK = { pivot: [-0.085, 0.17, -0.07], c: [0, -0.07, -0.20] };       // pivot chest-local (strap knot), centre rel. pivot

export function skeleton() {
  const S0 = chibi({ ...BODY, face: { eye: EYE, brow: false, mouth: [0, 0.092, 0.215] } });
  const m = S0.meta;
  const S = S0.map((b) => ({ ...b }));
  S.push({ name: 'sack', parent: 'chest', pos: SACK.pivot, axis: 'up', limits: { fwd: [-90, 90], twist: [-90, 90], out: [-90, 90] } });
  S.push({ name: 'apron', parent: 'hips', pos: [0, m.spineY - m.hipsY - 0.005, 0.12], axis: 'down', limits: { fwd: [-40, 70], twist: [-10, 10], out: [-20, 20] } });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head: brown face in a dark hood with a rectangular opening (rim frame proud of the face) ──
  add('head', K.chamferBox(...FACE.s, 0.5), FACE.c, 'skin', { name: 'face' });
  add('head', K.chamferBox(0.06, 0.055, 0.04, 0.3), [0, 0.135, 0.215], 'skin', { name: 'nose' });   // tip z 0.235
  const HOOD = [[0.17, 0], [0.215, 0.07], [0.228, 0.16], [0.222, 0.25], [0.19, 0.33], [0.12, 0.395], [0.001, 0.415]];
  add('head', K.lathe(HOOD, 12, { sz: 0.88 }), [0, 0.20, -0.05], 'hood', { name: 'hood' });
  add('head', K.box(0.30, 0.065, 0.08), [0, 0.300, 0.19], 'hood', { name: 'hoodRim' });               // front z 0.23
  // side bars thinner + set back (r2): the face shows through the opening at SE/SW and its side at E/W
  for (const s of [1, -1]) add('head', K.box(0.04, 0.26, 0.07), [s * 0.138, 0.165, 0.16], 'hood', { name: 'hoodRim' });
  // eyes (2×2 texels) + mouth plate (buried; talk pushes it out with mouth.p)
  add('eyeL', K.box(0.05, 0.066, 0.04), [0, 0, 0], 'eye', { name: 'eye', mirror: true });
  add('mouth', K.box(0.10, 0.05, 0.03), [0, 0, -0.016], 'eye', { name: 'mouthIn' });

  // ── collar: the hood's drape round the neck / shoulders ──
  add('neck', K.frustum(8, 0.20, 0.165, 0.10, { sz: 0.85 }), [0, 0.03, 0.0], 'hood', { name: 'collar' });

  // ── torso: tunic, leather apron (bib + flap), strap across the chest (right shoulder → left hip) ──
  const chestH = m.shoulderY - m.chestY + 0.05;
  add('chest', K.chamferBox(0.30, chestH, 0.22, 0.3), [0, chestH / 2 - 0.02, 0], 'tunic', { name: 'tunic' });
  const waistH = m.chestY - m.spineY + 0.03;
  add('spine', K.chamferBox(0.29, waistH, 0.21, 0.3), [0, waistH / 2 - 0.01, 0], 'tunic', { name: 'tunic' });
  add('hips', K.frustum(8, 0.185, 0.16, 0.17, { sz: 0.78 }), [0, -0.035, 0], 'tunic', { name: 'skirt' });
  add('chest', K.box(0.17, chestH - 0.06, 0.03), [0, chestH / 2 - 0.05, 0.108], 'leather', { name: 'apron' });
  add('spine', K.box(0.21, waistH + 0.01, 0.03), [0, waistH / 2 - 0.01, 0.103], 'leather', { name: 'apron' });
  add('apron', K.box(0.22, 0.16, 0.03), [0, -0.08, 0.0], 'leather', { name: 'apronFlap' });
  add('chest', K.xf(K.box(0.075, 0.34, 0.035), { rot: [0, 0, 38] }), [0, 0.06, 0.128], 'hood', { name: 'strap' });
  add('chest', K.xf(K.box(0.075, 0.34, 0.035), { rot: [0, 0, -38] }), [0, 0.06, -0.118], 'hood', { name: 'strap' });

  // ── arms: tunic sleeves, brown hands ──
  add('upperArmL', K.frustum(4, 0.07, 0.066, m.upperArm + 0.03), [0, -m.upperArm / 2, 0], 'tunic', { name: 'sleeve', mirror: true });
  add('forearmL', K.frustum(4, 0.064, 0.06, m.forearm), [0, -m.forearm / 2, 0], 'tunic', { name: 'sleeve', mirror: true });
  add('handL', K.chamferBox(0.08, 0.085, 0.085, 0.35), [0, -0.035, 0.005], 'skin', { name: 'hand', mirror: true });

  // ── legs: dark trousers, leather boots ──
  add('thighL', K.frustum(4, 0.078, 0.072, m.thigh + 0.03), [0, -m.thigh / 2 + 0.01, 0], 'hood', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.07, 0.066, m.shin), [0, -m.shin / 2, 0], 'hood', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.11, m.ankleY + 0.03, 0.18, 0.3), [0, -m.ankleY / 2 + 0.012, 0.035], 'leather', { name: 'boot', mirror: true });

  // ── the SACK on the back (bone `sack`, pivot at the right-shoulder knot): a bulging burlap lathe + a tied neck that
  // pokes up over the right shoulder (r7: the rope band drew specks; sack inner lines take its own darker tone)
  const SP = [[0.001, 0], [0.13, 0.02], [0.205, 0.09], [0.232, 0.19], [0.215, 0.28], [0.16, 0.36], [0.085, 0.405], [0.001, 0.415]];
  add('sack', K.lathe(SP, 14, { sz: 0.80 }), SACK.c, 'sack', { name: 'sack' });
  add('sack', K.xf(K.frustum(8, 0.10, 0.07, 0.14), { rot: [35, 0, 10] }), [SACK.c[0] - 0.02, SACK.c[1] + 0.23, SACK.c[2] + 0.06], 'sack', { name: 'sackNeck' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
const EYES = (sy) => ({ 'eyeL.s': [0, sy, 0], 'eyeR.s': [0, sy, 0] });
const BLINK = EYES(-0.8), WIDE = EYES(0.2);
const OPEN = { 'mouth.p': [0, -0.005, 0.03] };
const ARMS0 = { upperArmL: [4, 0, 8], forearmL: [10, 0, 0], upperArmR: [4, 0, 8], forearmR: [10, 0, 0] };
const breath = (d, extra = {}) => ({ pos: [0, -0.012 - 0.028 * d, 0], ...ARMS0, spine: [2, 0, 0], chest: [2 + 3 * d, 0, 0], head: [-2 - 3 * d, 0, 0],
  sack: [-2 * d, 0, 0], ...extra });

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, { sack: [4, 0, 0] }) },
    { f: 50, pose: breath(1, { sack: [4, 0, 0], ...BLINK }) },
    { f: 52, pose: breath(1, { sack: [4, 0, 0] }) },
    { f: 66, pose: breath(0) },
  ] },
  // walk / run (LegGait drawings, f0 = left contact; blend 'add'): the sack swings forward + drops on the contact
  // drawings (k0, k2) and lifts back in flight (k1, k3): its swing lags the body bob by one drawing
  walk: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { spine: [4, 0, 0], sack: [16, 0, 0], 'sack.p': [0, -0.03, 0], apron: [-34, 0, 0] } },
    { f: 1, pose: { spine: [4, 0, 0], sack: [-10, 0, 0], 'sack.p': [0, 0.03, 0], apron: [16, 0, 0] } },
    { f: 2, pose: { spine: [4, 0, 0], sack: [16, 0, 0], 'sack.p': [0, -0.03, 0], apron: [-34, 0, 0] } },
    { f: 3, pose: { spine: [4, 0, 0], sack: [-10, 0, 0], 'sack.p': [0, 0.03, 0], apron: [16, 0, 0] } },
  ] },
};
CLIPS.run = { ...CLIPS.walk };

// talk (loop 40, keys every 10): mouth plate out on f0/f20, the free LEFT hand opens palm-up (f0) / the right hand
// turns out (f20), head rolls toward the camera on the open keys
CLIPS.talk = { fps: 30, loop: true, interp: 'step', length: 40, events: { 0: 'speak' }, keys: [
  { f: 0, pose: { ...breath(0), ...OPEN, chest: [-2, 6, 0], head: [-6, 8, 8], upperArmL: [40, 0, 34], forearmL: [70, 0, 0], handL: [-30, 0, 0] } },
  { f: 10, pose: { ...breath(1), chest: [4, 0, 0], head: [0, 4, -2], upperArmL: [14, 0, 14], forearmL: [30, 0, 0] } },
  { f: 20, pose: { ...breath(0), ...OPEN, chest: [-2, -4, 0], head: [-6, 10, -6], upperArmR: [30, 0, 40], forearmR: [60, 0, 0], handR: [-30, 0, 0],
    upperArmL: [10, 0, 10], forearmL: [20, 0, 0] } },
  { f: 30, pose: { ...breath(1), chest: [4, 0, 0], head: [0, 6, 2] } },
] };

// vote: dip, then the SACK hoisted overhead on the right hand (sack.p lifts it from the back onto the palm), held
// r2: the arm goes up-forward-out (fwd 160 / out 30, reach .l 1.1) and the sack sits ON the hand (sack.p from the arm's
// FK, probed with mark=@handR) beside/above the hood, not on it; head tilts away from the load (r8/vN, 8 facings)
const VOTE_UP = { pos: [0, 0.03, 0], spine: [-2, 0, -4], chest: [-4, 0, -4], head: [-10, 6, 0], ...WIDE,
  upperArmR: [160, 0, 30], forearmR: [-10, 0, 0], 'upperArmR.l': [1.1], handR: [0, 0, 0], sack: [0, 0, 0], 'sack.p': [-0.335, 0.67, 0.46],
  'sack.s': [-0.1, -0.1, -0.1],
  upperArmL: [10, 0, 20], forearmL: [40, 0, 0] };
CLIPS.vote = { fps: 30, loop: false, interp: 'step', events: { 4: 'vote@sackTop' }, keys: [
  { f: 0, pose: { ...breath(0), pos: [0, -0.06, 0], spine: [8, 0, 0], chest: [8, 0, 0], head: [-10, 0, 0], sack: [12, 0, 0], 'sack.p': [0, -0.03, 0],
    upperArmR: [-20, 0, 40], forearmR: [80, 0, 0] } },
  { f: 4, pose: VOTE_UP },
], length: 31 };

// point (≈ 3.5 s held, the game's shared emote): the near RIGHT arm forward-up along the facing (camera side at SE/E),
// the chest leading with the right shoulder, the left hand forward-low (reads at W/SW)
const POINT = (d = 0, extra = {}) => ({ ...breath(d), chest: [-2, -14, 0], spine: [2, -6, 0], head: [-6, 16, 0], ...WIDE,
  upperArmR: [104, 0, 22], forearmR: [4, 0, 0], 'upperArmR.l': [0.35], 'forearmR.l': [0.3],
  upperArmL: [62, 0, 30], forearmL: [20, 0, 0], 'upperArmL.l': [0.2], ...extra });
CLIPS.point = { fps: 30, loop: false, interp: 'step', keys: [
  { f: 0, pose: { ...breath(0), chest: [4, 10, 0], head: [-4, -6, 0], upperArmR: [30, 0, 10], forearmR: [100, 0, 0] } },
  { f: 5, pose: POINT(0, OPEN) },
  { f: 16, pose: POINT(1) },
  { f: 60, pose: POINT(0, { ...OPEN }) },
  { f: 70, pose: POINT(1) },
  { f: 96, pose: { ...breath(0), chest: [2, -4, 0], upperArmR: [30, 0, 14], forearmR: [60, 0, 0] } },
], length: 106 };

// die (gentle): staggers under the sack's weight → knees buckle → topples onto his left side, the sack slipping off
// behind him; lying, curled, face to the SE camera, eyes shut
const KNEES = (a, b = a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], footL: [a, 0, 0], thighR: [b, 0, 0], shinR: [-2 * b, 0, 0], footR: [b, 0, 0] });
const DEAD = { pos: [0, -0.30, 0], hips: [20, 0, 80], spine: [10, 0, 0], chest: [10, 0, 0], head: [0, 0, -20], ...BLINK,
  ...KNEES(70, 50), upperArmL: [40, 0, 20], forearmL: [60, 0, 0], upperArmR: [60, 0, 10], forearmR: [60, 0, 0],
  sack: [-30, 0, -40], 'sack.p': [0.15, -0.05, -0.05] };
CLIPS.die = { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 22: 'land' }, keys: [
  { f: 0, pose: { ...breath(0), spine: [-6, 0, 8], chest: [-6, 0, 6], head: [-10, 0, -8], ...WIDE, sack: [-14, 0, 0],
    upperArmL: [10, 0, 40], forearmL: [20, 0, 0], upperArmR: [10, 0, 30] } },
  { f: 8, pose: { pos: [0, -0.12, 0], spine: [16, 0, 0], chest: [8, 0, 0], head: [-10, 0, 0], ...BLINK, ...KNEES(55), sack: [16, 0, 0],
    upperArmL: [20, 0, 20], upperArmR: [20, 0, 20] } },
  { f: 15, pose: { pos: [0, -0.2, 0], hips: [20, 0, 40], spine: [12, 0, 0], chest: [10, 0, 0], head: [0, 0, -10], ...BLINK, ...KNEES(65, 50),
    sack: [-10, 0, -20], 'sack.p': [0.06, -0.02, -0.02], upperArmL: [40, 0, 40], upperArmR: [40, 0, 20] } },
  { f: 22, pose: DEAD },
], length: 61 };

// emote 'hitch' (shift the sack — the porter's job): crouch → pop (heels up, shoulders shrug, the sack jumps up the
// back above the hood) → thump (sack lands lower, body dips) → relieved puff (eyes shut, sweat drop) → idle
CLIPS.hitch = { fps: 30, loop: false, interp: 'step', events: { 8: 'land', 14: 'emote:drop@crown' }, keys: [
  { f: 0, pose: { ...breath(0), pos: [0, -0.07, 0], spine: [12, 0, 0], chest: [8, 0, 0], head: [-14, 0, 0], ...KNEES(30), sack: [8, 0, 0], 'sack.p': [0, -0.02, 0],
    upperArmL: [20, 0, 30], forearmL: [50, 0, 0], upperArmR: [20, 0, 30], forearmR: [50, 0, 0] } },
  { f: 5, pose: { ...breath(0), pos: [0, 0.06, 0], spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-6, 0, 0], ...BLINK, sack: [-24, 0, 10], 'sack.p': [0, 0.3, 0.02],
    upperArmL: [-10, 0, 40], forearmL: [60, 0, 0], upperArmR: [-10, 0, 40], forearmR: [60, 0, 0] } },
  { f: 8, pose: { ...breath(0), pos: [0, -0.05, 0], spine: [10, 0, 0], chest: [6, 0, 0], head: [-10, 0, 0], ...KNEES(20), ...BLINK, sack: [14, 0, 0], 'sack.p': [0, -0.04, 0],
    upperArmL: [10, 0, 20], forearmL: [30, 0, 0], upperArmR: [10, 0, 20], forearmR: [30, 0, 0] } },
  { f: 14, pose: { ...breath(1), ...OPEN, pos: [0, 0.02, 0], spine: [-8, 0, 0], chest: [-12, 0, 0], head: [-16, 12, 14], ...BLINK,
    upperArmL: [-35, 0, 30], forearmL: [95, 0, 0], handL: [0, 0, -30], upperArmR: [-35, 0, 30], forearmR: [95, 0, 0], handR: [0, 0, -30] } },
  { f: 30, pose: { ...breath(1), head: [-4, 6, 4] } },
], length: 38 };

// ghost / ghost-spent: spec.ghost draws the pale ramp, halo, floating legs; these are plain pose loops (sack kept)
const GHOST = (i, spent) => ({ pos: [0, spent ? [-0.02, -0.035, -0.05, -0.035][i] : [0.03, 0.015, 0, 0.015][i], 0],
  spine: [spent ? 6 : 0, 0, 0], chest: [spent ? 6 : 0, 0, [2, 0, -2, 0][i]], head: [spent ? 14 : -4, 0, [4, 0, -4, 0][i]],
  ...(spent || i === 2 ? EYES(-0.45) : {}), upperArmL: [14, 0, 18], forearmL: [30, 0, 0], upperArmR: [14, 0, 18], forearmR: [30, 0, 0],
  ...KNEES(18), sack: [spent ? 8 : -4 + 4 * [0, 1, 2, 1][i], 0, 0] });
CLIPS.ghost = { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 16, pose: GHOST(i, false) })) };
CLIPS['ghost-spent'] = { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 16, pose: GHOST(i, true) })) };

export function make() {
  const S = skeleton();
  return {
    name: 'npc-porter',
    height: H,
    palette: PALETTE,
    signature: ['sack'],
    faceSlot: 'skin',
    bodyPlan: 'biped',
    heightPx: [36, 46],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'hitch',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0.05, 0.45, 0] }, sackTop: { bone: 'sack', at: [0, 0.35, -0.15] } },
    chains: [],
    personality: { body: { f: 2.5, zeta: 0.8, r: 0 }, head: { f: 2.5, zeta: 0.8, r: 0 } },
    locomotion: { plan: 'biped', plant: 'hold', swingFloor: 'gait', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.267, 0.267], contactReach: 0.45,
      poses: [4, 4], duty: [0.22, 0.12], reach: 0.6, arms: [22, 30], elbows: [10, 16], bob: [0.04, 0.07], lean: [7, 12],
      lift: [0.05, 0.08], twist: [5, 8] },
    character: { quant: { yaw: 8, chain: 4 } },
    ghost: { hover: 0.14, keepHue: 0.25 },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    // hullMargin 0.4 (r2): the vote hoists the sack 0.35 m above the bind hull; with the default 0.12 it shadowed the
    // whole front (vote key_speckle +32, a mottled dark body under the sack)
    material: { hullMargin: 0.4, sides: { eyeL: 'mid', eyeR: 'mid', mouth: 'mid', sack: 'mid' }, creamKeep: [1, 0.85], slots: { sack: { line: 'tone' } } },
  };
}

export default make();
