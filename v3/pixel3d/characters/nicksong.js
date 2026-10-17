// Nick Song (char-nicksong) — cast member "nicksong", villager: "Shaggy hair, sly smirk, never looks up from his phone.
// Suspiciously pleased." Design sheet (## Unique to me, timing charts, ## Self-critique): characters/nicksong.md.
// Identity source (read only): pipgws/packages/assets/scripts/cast/nicksong.ts + refs/cast/nicksong.png.
// Body plan: plain townsfolk on chibi() (≈ 3 heads incl. the hair mop, legs 0.29 H, jeans legs VISIBLE) driven by
// LegGait 'biped' at game speed = a phone-absorbed scurry. The head's geometry is authored ALREADY pitched down at
// the phone (HEAD_PITCH) and the left arm's REST geometry is the phone carry, so every clip — and the procedural gait,
// which cannot play authored walk poses (motion backlog M1) — keeps him looking at the screen. LegGait's left-arm
// channel is re-routed to the part-less `hairBob` bone: the back-top hair tufts flop once per step instead of the
// phone arm swinging.
// Structure: palette → skeleton (chibi + bent phone arm + phone/hairBob bones, pitched face bones) → parts → clips → spec.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.16;                       // ground → hair spikes (castHeight(29))
export const V_GAME = 3.95 * H;              // 4.58 m/s: v2 150 px/s on a 38 px sprite, relative to body height
const HEAD_PITCH = 7;                        // deg: the whole head (skull, hair, face bones) looks down at the phone at rest
const BODY = { height: 1.06, heads: 3.06, legs: 0.95, arms: 1.1, snout: 0, ears: false, tail: false, jaw: false, shoulders: 0.30, hips: 0.15 };
const FACE0 = { eye: [0.072, 0.138, 0.142], brow: false, mouth: [0.0, 0.065, 0.14] };

// [hi, mid, sh] sRGB. 5 slots + 1 accent (screen). v1 values kept for hi/mid; only sh lifted for the night rule.
export const PALETTE = {
  hair: ['#46425E', '#36324C', '#3A3046'],    // signature 1: the shaggy near-black mop (v1 #221E2F lifted; no outline in 3D)
  sweat: ['#7A7A84', '#55555F', '#45404E'],   // charcoal crewneck sweatshirt (v1 #44444C)
  jeans: ['#7E92AE', '#5D6F88', '#47506C'],   // grey-blue jeans (v1 #5D6F88)
  skin: ['#F8DEC4', '#EAC2A2', '#B4877F'],    // light skin (v1 #F0D0B4)
  shoe: ['#EEEEF0', '#C6C8D0', '#8E8A9E'],    // light sneakers + the small chest print (v1 #C9CCD2 / #D6D3CC)
  screen: ['#D2F8FF', '#9FE6FF', '#5A92B4'],  // accent / signature 2: the bright phone screen (v1 #9FE6FF)
};
const INK = ['#4C3C54', '#3A2C44', '#30263A'];     // eyes (no black: ≥ #2A2238)
const LIP = ['#B87068', '#9A5A52', '#7A4448'];     // the smirk (v1 LIP #9A5A52)
const CASE = ['#4A4658', '#34303F', '#2E2A38'];    // phone case (v1 #16161E lifted)
const RIB = ['#66666F', '#4A4A54', '#3E3A47'];     // sweatshirt hem rib, one step darker

// left (phone) arm segment directions at rest: [out°, fwd°]; the hand sits in front of the belly, left of centre
const ARM = { up: [6, 25], fore: [-35, 58] };
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
const rotX = ([x, y, z], deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [x, y * c - z * s, y * s + z * c]; };
const segRot = (d) => {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z].map((r) => r * 180 / Math.PI);
};
const HAIRBOB_AT = [0, 0.33, -0.06];          // head-local (unpitched) pivot of the flopping back-top tufts
const PHONE_AT = [-0.03, 0.035, 0.02];        // handL-local phone centre (hand rest frame = character axes)

export function skeleton() {
  const S0 = chibi({ ...BODY, face: FACE0 });
  const m = S0.meta;
  const S = S0.map((b) => ({ ...b }));
  // the bent phone arm (L) is the REST pose; the right arm hangs straight (the gait swings it)
  for (const [n, a] of [['forearmL', ARM.up], ['handL', ARM.fore]]) {
    const b = S.find((x) => x.name === n), d = armDir(a);
    const len = Math.hypot(...b.pos);
    b.pos = [len * d[0], len * d[1], len * d[2]];
  }
  // face bones pitched with the head geometry
  for (const n of ['eyeL', 'eyeR', 'mouth']) { const b = S.find((x) => x.name === n); if (b) b.pos = rotX(b.pos, HEAD_PITCH); }
  S.push({ name: 'phone', parent: 'handL', pos: PHONE_AT, axis: 'up' });
  S.push({ name: 'hairBob', parent: 'head', pos: rotX(HAIRBOB_AT, HEAD_PITCH), axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

// head part helper: shapes authored in the unpitched head frame, pre-rotated about the head joint (the chin)
const hp = (shape, at) => [K.xf(shape, { rot: [HEAD_PITCH, 0, 0] }), rotX(at, HEAD_PITCH)];
// a hull tuft: base centre b, half-width w, depth d, tip t (all head-local unpitched); returns points
const tuft = (b, w, d, t) => [
  [b[0] - w, b[1], b[2] - d], [b[0] + w, b[1], b[2] - d], [b[0] - w, b[1], b[2] + d], [b[0] + w, b[1], b[2] + d], t,
];
const pitchPts = (pts, about = [0, 0, 0]) => pts.map((p) => {
  const r = rotX([p[0] - about[0], p[1] - about[1], p[2] - about[2]], HEAD_PITCH);
  return r;
});

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  const addH = (shape, at, color, extra = {}) => { const [g, a] = hp(shape, at); add('head', g, a, color, extra); };
  const hullH = (pts, color, name) => add('head', K.hull(pitchPts(pts)), [0, 0, 0], color, { name });

  // ── head (joint = chin): skull block, hair mop of one slot on one bone (no inner lines between its pieces) ──
  addH(K.chamferBox(0.30, 0.31, 0.29, 0.3), [0, 0.165, 0.0], 'skin', { name: 'face' });
  addH(K.box(0.04, 0.035, 0.03), [0.0, 0.105, 0.155], 'skin', { name: 'nose' });
  // hair cap (8-sided lathe, bbox-centred: rim y 0.17 → top 0.40)
  addH(K.lathe([[0.205, 0], [0.228, 0.07], [0.215, 0.14], [0.16, 0.2], [0.001, 0.23]], 8, { sz: 0.92 }), [0, 0.30, -0.04], 'hair', { name: 'hair' });
  // back mass down to the nape, wider than the skull (shaggy)
  addH(K.chamferBox(0.40, 0.25, 0.17, 0.3), [0, 0.15, -0.085], 'hair', { name: 'hair' });
  // side tufts sticking out and down (v2 mask rows 7–9 at the cheeks); kept behind z 0.04 so the cheek shows at 3/4
  for (const s of [-1, 1]) {
    hullH(tuft([s * 0.17, 0.25, -0.01], 0.05, 0.05, [s * 0.26, 0.11, -0.01]), 'hair', 'hair');
    hullH(tuft([s * 0.15, 0.20, -0.08], 0.05, 0.05, [s * 0.24, 0.06, -0.09]), 'hair', 'hair');
  }
  // heavy fringe: a band across the forehead + three spikes pointing down, swept to his left (+x)
  addH(K.box(0.33, 0.06, 0.06), [0, 0.305, 0.135], 'hair', { name: 'hair' });
  for (const x of [-0.105, -0.005, 0.095]) hullH([[x - 0.055, 0.31, 0.13], [x + 0.055, 0.31, 0.13], [x - 0.055, 0.31, 0.175], [x + 0.055, 0.31, 0.175],
    [x + 0.03, 0.25, 0.165], [x + 0.03, 0.25, 0.145]], 'hair', 'hair');
  // top spikes (v2 mask row 0) — fixed ones on the head
  hullH(tuft([-0.08, 0.37, 0.06], 0.045, 0.045, [-0.12, 0.45, 0.10]), 'hair', 'hair');
  hullH(tuft([0.04, 0.38, 0.08], 0.045, 0.045, [0.07, 0.46, 0.13]), 'hair', 'hair');
  // flopping back-top tufts on hairBob (pivot HAIRBOB_AT; LegGait's armL channel swings them ±A per step)
  const hb = (pts) => add('hairBob', K.hull(pitchPts(pts, HAIRBOB_AT)), [0, 0, 0], 'hair', { name: 'hair' });
  hb(tuft([0.10, 0.36, -0.06], 0.05, 0.05, [0.17, 0.44, -0.12]));
  hb(tuft([-0.05, 0.37, -0.10], 0.05, 0.05, [-0.09, 0.45, -0.19]));
  hb(tuft([0.02, 0.30, -0.17], 0.06, 0.04, [0.03, 0.30, -0.28]));
  // face: half-lidded slit eyes (3×2 texels, proud of the skull, turned 12° in for SE), the lopsided smirk
  for (const s of [-1, 1]) add(s > 0 ? 'eyeL' : 'eyeR', K.xf(K.box(0.078, 0.048, 0.04), { rot: [HEAD_PITCH, s * -12, 0] }), [0, 0, 0.004], INK, { name: 'eye' });
  add('mouth', K.xf(K.box(0.11, 0.034, 0.03), { rot: [HEAD_PITCH, 0, 14] }), [0.015, -0.004, 0.004], LIP, { name: 'smirk' });
  // neck
  add('neck', K.box(0.10, 0.07, 0.09), [0, 0.02, 0], 'skin', { name: 'neck' });

  // ── torso: loose crewneck sweatshirt, rib hem, small light print ──
  const chestH = m.shoulderY - m.chestY + 0.05;
  add('chest', K.chamferBox(0.33, chestH, 0.25, 0.3), [0, chestH / 2 - 0.01, 0], 'sweat', { name: 'sweat' });
  add('chest', K.box(0.11, 0.036, 0.02), [-0.01, chestH * 0.45, 0.126], 'shoe', { name: 'print' });
  const waistH = m.chestY - m.spineY + 0.02;
  add('spine', K.chamferBox(0.32, waistH, 0.24, 0.3), [0, waistH / 2, 0], 'sweat', { name: 'sweat' });
  const pelY = m.spineY - m.hipsY;
  add('hips', K.chamferBox(0.33, 0.07, 0.25, 0.3), [0, pelY - 0.01, 0], RIB, { name: 'rib' });
  add('hips', K.chamferBox(0.30, 0.09, 0.22, 0.3), [0, pelY - 0.07, 0], 'jeans', { name: 'jeansTop' });

  // ── arms: long sweatshirt sleeves, skin hands; the left arm along its bent rest directions ──
  const duL = armDir(ARM.up), dfL = armDir(ARM.fore);
  add('upperArmL', K.xf(K.frustum(4, 0.062, 0.068, m.upperArm + 0.03), { rot: segRot(duL) }), duL.map((v) => v * m.upperArm / 2), 'sweat', { name: 'sleeveL' });
  add('forearmL', K.xf(K.frustum(4, 0.055, 0.062, m.forearm), { rot: segRot(dfL) }), dfL.map((v) => v * m.forearm / 2), 'sweat', { name: 'sleeveL' });
  add('handL', K.chamferBox(0.07, 0.06, 0.08, 0.35), [0, -0.01, 0.01], 'skin', { name: 'handL' });
  // wrist hidden inside the sleeve at rest; shows when the vote slides the hand out (handL.p along the forearm)
  add('handL', K.xf(K.frustum(4, 0.036, 0.036, 0.14), { rot: segRot(dfL) }), dfL.map((v) => -v * 0.07), 'skin', { name: 'handL' });
  add('upperArmR', K.frustum(4, 0.062, 0.068, m.upperArm + 0.03), [0, -m.upperArm / 2, 0], 'sweat', { name: 'sleeveR' });
  add('forearmR', K.frustum(4, 0.055, 0.062, m.forearm), [0, -m.forearm / 2, 0], 'sweat', { name: 'sleeveR' });
  add('handR', K.chamferBox(0.07, 0.075, 0.07, 0.35), [0, -0.035, 0], 'skin', { name: 'handR' });

  // ── phone: lying almost flat in the palm (screen up, near edge tilted 20° toward his face) — the screen faces the
  // 30° camera from every facing but N (where the body hides it, as in v2) ──
  const ph = (g) => K.xf(g, { rot: [-20, 0, 0] });
  add('phone', ph(K.box(0.085, 0.024, 0.15)), [0, 0, 0], CASE, { name: 'phone' });
  add('phone', ph(K.xf(K.box(0.07, 0.008, 0.13), { at: [0, 0.015, 0] })), [0, 0, 0], 'screen', { name: 'screen' });

  // ── legs: jeans, cuffs, light sneakers ──
  add('thighL', K.frustum(4, 0.072, 0.066, m.thigh + 0.03), [0, -m.thigh / 2 + 0.01, 0], 'jeans', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.064, 0.066, m.shin), [0, -m.shin / 2, 0], 'jeans', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.11, m.ankleY + 0.035, 0.2, 0.3), [0, -m.ankleY / 2 + 0.015, 0.045], 'shoe', { name: 'shoe', mirror: true });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; deltas from the phone-carry rest with the head looking down) ─────────
const EYES = (sy, sx = 0) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const SHUT = EYES(-0.75), WIDE = EYES(0.3, 0.05);
const SMIRK = (w = 0, h = 0) => ({ 'mouth.s': [w, h, 0] });
const base = (y = -0.012) => ({ pos: [0, y, 0] });
const breath = (d, extra = {}) => ({ ...base(-0.012 - 0.028 * d), chest: [3 * d, 0, 0], head: [-3 * d, 0, 0], ...extra });

export const CLIPS = {
  // idle: breath + thumb-scroll (the phone hand tips), a blink, a smug side-smirk; head stays on the phone
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 24, pose: breath(1, { handL: [-18, 0, 0] }) },
    { f: 36, pose: breath(1, { handL: [-18, 0, 0], ...SHUT }) },
    { f: 38, pose: breath(1, { handL: [-18, 0, 0] }) },
    { f: 54, pose: breath(0, { head: [2, -8, -6], ...SMIRK(0.5, 0.2) }) },
    { f: 66, pose: breath(0) },
  ] },
  // talk (loop 24): looks up from the phone on the open keys (head −12 → world −2°), mouth opens (scale), the free RIGHT
  // hand gestures out; shut keys glance back down
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { ...base(), chest: [-3, 8, 0], head: [-12, 10, 8], ...SMIRK(0.1, 1.0), upperArmL: [28, 0, 18], handL: [-28, 0, 0], upperArmR: [40, 0, 45], forearmR: [70, 0, 0], handR: [0, -60, 0] } },
    { f: 6, pose: { ...base(-0.035), chest: [2, 0, 0], head: [0, 2, -2], upperArmR: [10, 0, 10], forearmR: [20, 0, 0] } },
    { f: 12, pose: { ...base(), chest: [-3, -6, 0], head: [-12, -6, -6], ...SMIRK(0.1, 0.9), upperArmL: [20, 0, 10], handL: [-20, 0, 0], upperArmR: [55, 0, 20], forearmR: [55, 0, 0], handR: [0, -60, 0] } },
    { f: 18, pose: { ...base(-0.035), chest: [2, 0, 0], head: [0, 4, 4], ...SMIRK(0.2, 0), upperArmR: [10, 0, 10], forearmR: [20, 0, 0] } },
  ] },
  // vote: dip, then the phone hand up over the head, screen out to the town (the phone is his "hand"); held
  vote: { fps: 30, loop: false, interp: 'step', events: { 4: 'vote@tip' }, keys: [
    { f: 0, pose: { ...base(-0.05), spine: [6, 0, 0], chest: [6, 0, 0], head: [4, 0, 0], upperArmL: [-15, 0, 0] } },
    { f: 4, pose: { ...base(0.025), spine: [-3, 0, -8], chest: [-4, 0, -10], head: [-14, -8, 4], ...WIDE, ...SMIRK(0.3, 0.2),
      upperArmL: [140, 0, 50], forearmL: [-33, 0, 30], "handL.p": [-0.049, -0.069, 0.136], phone: [-90, 90, -30] } },
  ] },
  // die: startled (eyes wide, held 10) → knees buckle (sit) → slumps back onto his side, phone on the chest, eyes shut
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 22: 'land' }, keys: [
    { f: 0, pose: { ...base(0.0), spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-14, 0, 0], ...WIDE, ...SMIRK(-0.3, 0.8), upperArmR: [30, 0, 30], forearmR: [40, 0, 0] } },
    { f: 10, pose: { pos: [0, -0.14, 0], spine: [16, 0, 0], chest: [8, 0, 0], head: [4, 0, 0], ...SHUT,
      thighL: [60, 0, 0], shinL: [-115, 0, 0], footL: [55, 0, 0], thighR: [60, 0, 0], shinR: [-115, 0, 0], footR: [55, 0, 0], upperArmR: [-10, 0, 20] } },
    { f: 16, pose: { pos: [0, -0.24, -0.04], hips: [-30, 0, 10], spine: [6, 0, 0], head: [6, 0, 0], ...SHUT,
      thighL: [95, 0, 10], shinL: [-70, 0, 0], footL: [20, 0, 0], thighR: [95, 0, 8], shinR: [-75, 0, 0], footR: [20, 0, 0], upperArmR: [10, 0, 40] } },
    { f: 22, pose: DEAD() },
  ] },
  // pleased (signature emote): sinks into the phone (anticipation) → glances UP at the viewer with a widening smirk
  // (held 10) → two chuckle bobs → smug held look → back down to the screen
  pleased: { fps: 30, loop: false, interp: 'step', events: { 16: 'emote:note@aside' }, keys: [
    { f: 0, pose: { ...base(-0.03), spine: [4, 0, 0], chest: [6, 0, 0], head: [6, 0, 0], handL: [-10, 0, 0] } },
    { f: 6, pose: { ...base(-0.005), spine: [-2, 0, 0], chest: [-4, 6, 0], head: [-24, 14, 10], ...EYES(0.25), ...SMIRK(0.45, 0.25) } },
    { f: 16, pose: { ...base(-0.04), spine: [4, 0, 0], chest: [8, 6, 4], head: [-18, 14, 14], ...SHUT, ...SMIRK(0.5, 0.6), upperArmR: [10, 0, 15] } },
    { f: 20, pose: { ...base(0.0), spine: [-2, 0, 0], chest: [-4, 6, -4], head: [-24, 14, 6], ...EYES(-0.3), ...SMIRK(0.5, 0.25) } },
    { f: 24, pose: { ...base(-0.04), spine: [4, 0, 0], chest: [8, 6, 4], head: [-18, 14, 14], ...SHUT, ...SMIRK(0.5, 0.6), upperArmR: [10, 0, 15] } },
    { f: 28, pose: { ...base(-0.01), chest: [-3, 8, 0], head: [-22, 16, 10], ...EYES(-0.3), ...SMIRK(0.5, 0.25) } },
    { f: 42, pose: { ...base(-0.02), chest: [2, 0, 0], head: [4, 0, 0] } },
    { f: 46, pose: breath(0) },
  ] },
};
// DEAD = lying on his back-left side, knees bent, the phone still in his hand on his chest (screen lit), eyes shut
function DEAD() {
  return { pos: [0, -0.3, -0.12], hips: [-75, 0, 25], spine: [0, 0, 0], chest: [0, 0, 0], head: [-6, 20, 0], ...SHUT,
    thighL: [80, 0, 15], shinL: [-80, 0, 0], footL: [10, 0, 0], thighR: [50, 0, 5], shinR: [-60, 0, 0], footR: [10, 0, 0],
    upperArmR: [20, 0, 60], forearmR: [30, 0, 0] };
}
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  return {
    name: 'nicksong',
    height: H,
    palette: PALETTE,
    signature: [{ part: 'hair' }, { part: 'screen' }],
    faceSlot: 'skin',
    bodyPlan: 'biped',
    heightPx: [38, 48],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'pleased',
    skeleton: S,
    parts: parts(S),
    sockets: { ...(S.sockets || {}), tip: { bone: 'phone', at: [0, 0.03, 0.08] }, aside: { bone: 'head', at: [-0.42, 0.3, 0] } },
    chains: [],
    personality: { body: { f: 3, zeta: 0.7, r: 0 }, head: { f: 3, zeta: 0.8, r: 0 } },
    // LegGait 'biped' (visible jeans legs, sneakers planted by legIK 'plant'); the left-arm channel drives the hair
    // flop instead of the phone arm (rest = carry pose).
    locomotion: { plan: 'biped', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.267, 0.267], poses: [4, 4],
      duty: [0.25, 0.12], reach: 0.6, arms: [26, 45], elbows: [30, 60], bob: [0.03, 0.07], lean: [6, 12],
      lift: [0.09, 0.12], twist: [6, 9], surge: false,
      bones: { armL: ['hairBob'] } },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { speech: { node: 'head' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid' } },
  };
}

export default make();
