// Old Delve (char-mole) — cast member "mole", villager: "Blacksmith. Works by feel; trusts nobody he can see."
// Design sheet (## Unique to me, timing charts, ## Self-critique): characters/mole.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/mole.ts + refs/cast/mole.png.
// Body plan: upright CHIBI (chibi(): 2.4 heads, stout barrel torso, leg 0.26 H visible under a short apron) driven by
// the LEGACY biped Gait (CAST_PORTING §8 chibi recipe, legIK 'pose') at game speed = a heavy STOMP-SCURRY: the authored
// clips.walk / clips.run (one key per gait drawing) drop the whole body on each contact drawing (stomp) and throw it up
// in the flight drawings, roll it onto the stance side, swing the hammer arm against the legs and kick the apron.
// LegGait was rejected: it ignores authored walk poses (module M1: the hammer could not swing) and its reach drop seats
// legs ≤ 0.35 m (M2; these are 0.28 m).
// Structure: palette → skeleton (chibi + goggles/apron bones) → parts → clips → spec.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.08;                       // ground → crown (castHeight(27))
export const V_GAME = 3.95 * H;              // 4.27 m/s: v2 150 px/s on a 38 px sprite, relative to body height
const BODY = { height: H, heads: 2.4, legs: 0.7, arms: 0.9, snout: 0, ears: false, tail: false, shoulders: 0.34, hips: 0.17 };
const FACE = { eye: [0.12, 0.235, 0.228], brow: 0.058, mouth: false };   // r2: eyes wider apart, 2 texels tall, brow bars

// [hi, mid, sh] sRGB. 5 slots (fur, shirt, leather, dark, pink) + accent brass + identity-prop accent iron.
// v1 values kept (fur #766A71/#54485A, shirt #647592/#3D5684, leather #86582F); only sh lifted for the night rule.
export const PALETTE = {
  fur: ['#8A7C86', '#625668', '#544A62'],     // r2: sh lifted (night / shade copy read navy)     // head (the big round mass), muzzle, jaw
  shirt: ['#7084AC', '#4C6090', '#3C3E68'],   // slate-blue shirt + sleeves
  leather: ['#B47C46', '#86582F', '#5C3C38'], // apron, straps, hammer handle
  dark: ['#5E4A48', '#41333C', '#32282F'],    // trousers, boots, pelvis
  pink: ['#FAC0C0', '#E8909C', '#B06A7C'],    // signature 1: the big nose + the digging claws
  brass: ['#F6D474', '#D0A446', '#A47A48'],   // r2: sh lifted   // signature 2 (accent): goggles pushed up on the head + strap
  iron: ['#D0D8E4', '#9AA0B4', '#60627C'],    // identity prop: the hammer head; goggle glass
  eye: ['#4E3E52', '#2E2434', '#2E2434'],     // r2: eyes, brow bars, mouth (own slot: dark drew 13 tones)
};

// head lathe profile (bbox-centred when cut): r, y (head-local, chin = 0). The goggle STRAP is a band of this same
// profile (coincident surface, no inner line), the brass lenses sit on the forehead above the eyes.
const HEAD_PROF = [[0.12, 0], [0.205, 0.05], [0.25, 0.13], [0.262, 0.22], [0.245, 0.31], [0.20, 0.38], [0.13, 0.428], [0.001, 0.45]];
const STRAP = [0.315, 0.36];
const HEAD_SZ = 0.96;
const GOG_BONE = [0, 0.30, -0.02];           // goggles hinge (head-local), top-back of the skull
const GOG = [0.104, 0.326 - 0.30, 0.212 + 0.02];   // lens centre relative to the hinge (forehead, on the strap: higher ones poked over the crown at N = mouse ears)
const GOG_TILT = 40;                         // lens axis tilted from UP toward the front (pushed up on the forehead)
// (t1 touch-up) ghost: halo joint inside the skull, ring height above the joint, hover heights, dissolve band
const HALO_K = 0.001, HALO_AT = [0, 0.22, -0.03], HALO_UP = 0.33;   // ring at head-local y 0.55 (crown 0.455)
const GH = [0.14, 0.10, 0.08, 0.05];         // ghost hover root y: [hi, lo] unspent, [hi, lo] spent (m)
const GF = [0.10, 0.44, 0.08, 0.40];         // dissolve bind heights: [gone, solid] unspent, [gone, solid] spent (m)

export function skeleton() {
  const S0 = chibi({ ...BODY, face: FACE });
  const m = S0.meta;
  const S = S0.map((b) => ({ ...b }));
  // jaw hinge just behind the nose so the chin drops visibly (template hinge sits at the front)
  const jaw = S.find((b) => b.name === 'jaw'); jaw.pos = [0, 0.085, 0.13];
  jaw.limits = { ...jaw.limits, fwd: [-5, 55] };   // r2: talk mouth must read at dir 1 too
  // goggles: hinge at the top-back of the skull, so `fwd` slides the lenses down over the eyes (die) and up again
  S.push({ name: 'goggles', parent: 'head', pos: GOG_BONE, axis: 'fwd', limits: { fwd: [-40, 60], twist: [-10, 10], out: [-10, 10] } });
  // apron skirt: hinge at the waist front, kicks forward/back with the steps (walk keys)
  S.push({ name: 'apron', parent: 'hips', pos: [0, m.spineY - m.hipsY - 0.01, 0.175], axis: 'down', limits: { fwd: [-40, 70], twist: [-10, 10], out: [-20, 20] } });
  // hammer: rides the right claw at the grip; `hammer.p` slides the handle up through the fist (vote: reach higher)
  S.push({ name: 'hammer', parent: 'handR', pos: HAMMER.grip, axis: 'up' });
  // (t1 touch-up, ghost) HALO bone buried inside the skull, appended LAST (every living render keeps its bone indices).
  // Its ring is authored at HALO_K around the joint (a speck inside the head while alive); the ghost clip keys
  // 'halo.s' = 1/HALO_K − 1 to grow it over the crown. Its world scale relative to the head is also the GHOST SIGNAL
  // read by the shader (GHOST_GLSL): 1 alive, 2 ghost-spent (no halo, dimmer), 1/HALO_K ghost (halo shown).
  S.push({ name: 'halo', parent: 'head', pos: HALO_AT, axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

// sub-profile of HEAD_PROF between y0 and y1 (linear interpolation at the cut heights)
function cut(prof, y0, y1) {
  const at = (y) => { for (let i = 1; i < prof.length; i++) { const [r0, a] = prof[i - 1], [r1, b] = prof[i]; if (y <= b) return [r0 + (r1 - r0) * (y - a) / (b - a), y]; } return prof[prof.length - 1]; };
  const out = [at(y0)];
  for (const p of prof) if (p[1] > y0 && p[1] < y1) out.push(p);
  out.push(at(y1));
  return out;
}
const ball = (r, o = {}) => K.lathe([[0.001, 0], [0.71 * r, 0.29 * r], [r, r], [0.71 * r, 1.71 * r], [0.001, 2 * r]], 10, o);

// hammer in the handR frame: grip at the palm, handle UP along +Y (the carry pose keeps the hand frame upright)
export const CLAW_SOCKET = [0, -0.07, 0.03];   // r2: left claw palm (the ring tap lands here: event hit@clawL)
export const HAMMER = { grip: [0, -0.045, 0.0], below: 0.07, handle: 0.46, head: [0.13, 0.13, 0.27] };   // handle from grip−below up to grip+handle−below

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  const band = (y0, y1, color, name) => add('head', K.lathe(cut(HEAD_PROF, y0, y1), 12, { sz: HEAD_SZ }), [0, (y0 + y1) / 2, 0], color, { name });

  // ── head: one convex fur profile cut into 3 bands (the middle band is the brass goggle strap) ──
  band(0, STRAP[0], 'fur', 'head');
  band(STRAP[0], STRAP[1], 'brass', 'strap');
  band(STRAP[1], 0.455, 'fur', 'head');
  // muzzle: a short forward cone from the lower face, the big pink nose on its tip (sticks out past the head in profile)
  // (hull with an up-facing top so it catches light; a cone's shaded sides drew a dark mask round the nose)
  const MZ = [[0.10, 0.20, 0.17], [0.09, 0.07, 0.16], [0.06, 0.185, 0.33], [0.055, 0.10, 0.325]];   // r2: +0.04 forward
  add('head', K.hull(MZ.flatMap(([x, y, z]) => [[x, y, z], [-x, y, z]])), [0, 0, 0], 'fur', { name: 'muzzle' });
  add('head', K.xf(ball(0.072), { scale: [1.3, 0.95, 0.9] }), [0, 0.155, 0.35], 'pink', { name: 'nose' });
  // mouth cavity behind the chin (shows when the jaw drops) + the chin on the jaw bone
  add('head', K.box(0.13, 0.06, 0.14), [0, 0.07, 0.235], 'eye', { name: 'mouthIn' });
  add('jaw', K.chamferBox(0.15, 0.055, 0.18, 0.3), [0, -0.02, 0.095], 'fur', { name: 'chin' });
  // squinting eyes, 2×2 texels (r2: were 3×1, so a blink changed 0-2 px), turned 10° inward so both read at SE, with a
  // brow bar above each (browL/R: lowered for SHUT / LISTEN, raised for WIDE / talk)
  add('eyeL', K.xf(K.box(0.066, 0.06, 0.04), { rot: [0, -10, 0] }), [0, 0, 0], 'eye', { name: 'eye', mirror: true });
  add('browL', K.xf(K.box(0.105, 0.032, 0.04), { rot: [0, -10, 0] }), [0.03, 0, 0], 'fur', { name: 'brow', mirror: true });
  // goggles pushed up on the forehead: two brass rings with iron glass, tilted up 40°, bridged in the middle
  for (const s of [1, -1]) {
    const [gx, gy, gz] = GOG, n = [0, Math.cos(GOG_TILT * Math.PI / 180), Math.sin(GOG_TILT * Math.PI / 180)];
    add('goggles', K.xf(K.frustum(10, 0.084, 0.078, 0.07), { rot: [GOG_TILT, 0, 0] }), [s * gx, gy, gz], 'brass', { name: 'goggles' });   // r2: r 0.064 → 0.084
    add('goggles', K.xf(K.frustum(8, 0.034, 0.034, 0.02), { rot: [GOG_TILT, 0, 0] }), [s * gx, gy + n[1] * 0.032, gz + n[2] * 0.032], 'iron', { name: 'glass' });
  }

  // ── torso: barrel shirt, leather apron (bib + skirt on its own bone), straps over the shoulders ──
  const chestH = m.shoulderY - m.chestY + 0.06;
  add('chest', K.chamferBox(0.42, chestH, 0.34, 0.3), [0, chestH / 2 - 0.02, 0], 'shirt', { name: 'shirt' });
  const waistH = m.chestY - m.spineY + 0.03;
  add('spine', K.chamferBox(0.43, waistH, 0.34, 0.3), [0, waistH / 2 - 0.01, 0], 'shirt', { name: 'waist' });
  const pelY = m.spineY - m.hipsY;
  add('hips', K.chamferBox(0.38, 0.12, 0.30, 0.3), [0, pelY - 0.05, 0], 'dark', { name: 'pelvis' });
  add('chest', K.box(0.24, chestH - 0.05, 0.03), [0, chestH / 2 - 0.04, 0.17], 'leather', { name: 'apron' });
  add('spine', K.box(0.34, waistH + 0.01, 0.03), [0, waistH / 2 - 0.01, 0.172], 'leather', { name: 'apron' });
  add('apron', K.box(0.32, 0.12, 0.035), [0, -0.055, 0.0], 'leather', { name: 'apron' });   // r2: skirt 0.16 → 0.12 (the trailing boot hid behind it at S)
  for (const s of [1, -1]) add('chest', K.box(0.05, 0.05, 0.36), [s * 0.11, chestH - 0.03, 0], 'leather', { name: 'strap' });

  // ── arms: slate sleeves, big pink digging claws ──
  add('upperArmL', K.frustum(4, 0.072, 0.068, m.upperArm + 0.03), [0, -m.upperArm / 2, 0], 'shirt', { name: 'sleeve', mirror: true });
  add('forearmL', K.frustum(4, 0.066, 0.062, m.forearm), [0, -m.forearm / 2, 0], 'shirt', { name: 'sleeve', mirror: true });
  add('handL', K.chamferBox(0.115, 0.085, 0.11, 0.35), [0, -0.035, 0.005], 'pink', { name: 'claw', mirror: true });
  add('handL', K.box(0.11, 0.05, 0.075), [0, -0.09, 0.02], 'pink', { name: 'claw', mirror: true });   // r2: one digging-claw block (2 finger boxes drew isolated px)

  // ── legs: dark trousers, boots ──
  add('thighL', K.frustum(4, 0.085, 0.08, m.thigh + 0.03), [0, -m.thigh / 2 + 0.01, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.075, 0.07, m.shin), [0, -m.shin / 2, 0], 'dark', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.13, m.ankleY + 0.035, 0.19, 0.3), [0, -m.ankleY / 2 + 0.017, 0.04], 'dark', { name: 'boot', mirror: true });

  // ── the smithing hammer in the RIGHT hand (handle up from the grip, iron head along z) ──
  const hy = HAMMER.handle / 2 - HAMMER.below, hh = HAMMER.handle - HAMMER.below + HAMMER.head[1] / 2 - 0.02;
  add('hammer', K.box(0.065, HAMMER.handle, 0.065), [0, hy, 0], 'leather', { name: 'handle' });
  add('hammer', K.chamferBox(...HAMMER.head, 0.25), [0, hh, 0], 'iron', { name: 'hammer' });

  // ── (t1) ghost halo: a flat brass ring over the crown, authored at HALO_K around the buried joint; untinted by the
  // ghost shader (v2 ghost row: a gold halo while the ghost vote is unspent)
  const ring = K.lathe([[0.09, 0], [0.155, 0], [0.155, 0.035], [0.09, 0.035], [0.09, 0]], 12);
  add('halo', K.xf(ring, { at: [0, HALO_UP * HALO_K, 0], scale: HALO_K }), [0, 0, 0], 'brass', { name: 'halo' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg) ────────────────────────────────────────────────────────────────────
// CARRY: right arm a little out, elbow bent forward, the wrist keeps the hammer plumb and tipped 10° outward so it
// stands clear of the sleeve; left claw hangs relaxed.
// r2: hand raised and out 70°, hammer leaning out 27° and back 8°, head turned 20° on the handle (hammer.twist) so
// the head shows as a T beside the shoulder at 7/8 facings (was lost at E/W/SW); wrist solved (mole_solve.js)
const CARRY = { upperArmR: [15, 0, 70], forearmR: [40, 0, 0], handR: [2, 45, -99], hammer: [0, -20, 0], upperArmL: [4, 0, 10], forearmL: [14, 0, 0] };
// expressions: eye scale + brow bars (r2: 'browX.p' drops the bar onto the eye = the lid closes; out + = frown)
const EYES = (sy, sx = 0, by = -0.004, bo = 8) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0],
  'browL.p': [0, by, 0], 'browR.p': [0, by, 0], browL: [0, 0, bo], browR: [0, 0, bo] });
const BROW0 = EYES(0);                                   // resting: brows a little low and frowning (suspicious)
const SHUT = EYES(-0.75, 0, -0.03, 14), WIDE = EYES(0.45, 0.1, 0.03, -12), LISTEN = EYES(-0.6, 0, -0.024, -6);
// r2: the head is kept turned 12° to his left (a sideways, distrustful glance) so the face opens toward the camera at
// the game facing (dir 1 / SE) instead of sitting on the skull's edge
const HEAD_TW = -12;
const base = (y = -0.012) => ({ pos: [0, y, 0], ...BROW0 });
const breath = (d, extra = {}) => ({ ...base(-0.012 - 0.028 * d), ...CARRY, chest: [4 * d, 0, 0], head: [-4 * d, HEAD_TW, 0], ...extra });

// walk/run (legacy Gait, authored UPPER body, one key per gait drawing, f0 = left contact): STOMP = contact drawings
// low (body dropped, rolled onto the stance foot), flight drawings high; the hammer arm swings against the legs.
// r2: keys at f0/3/5/8 of 10 (cycle = 10 grid frames at game speed): contact drawings held 3 frames, flight 2
function GAIT(dip, up, roll, swing, kick) {
  const k = (f, contact, side) => ({ f, pose: {
    ...BROW0, pos: [0, contact ? -dip : up, 0],
    hips: [0, 0, side * roll], spine: [contact ? 6 : -2, 0, -side * roll * 0.5], chest: [0, 0, -side * roll * 0.3],
    head: [contact ? -6 : 2, HEAD_TW, side * roll * 0.4],
    upperArmR: [CARRY.upperArmR[0] + side * swing, 0, CARRY.upperArmR[2]], forearmR: CARRY.forearmR, handR: CARRY.handR,   // r2: wrist held (the solved carry), the hammer rides the arm swing
    upperArmL: [-side * swing, 0, 12], forearmL: [20 + (side < 0 ? swing : 0), 0, 0],
    hammer: CARRY.hammer, apron: [contact ? kick : -kick * 0.4, 0, 0],
  } });
  return [k(0, true, 1), k(3, false, 1), k(5, true, -1), k(8, false, -1)];
}

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, SHUT) },
    { f: 38, pose: breath(1) },
    // "trusts nobody he can see": r2 LISTEN = head cocked 30° away, left claw cupped at the raised ear, eyes squeezed
    // (was a 16° twist: < 2 texels at S)
    { f: 50, pose: breath(0, { head: [-4, -12, -30], ...LISTEN, upperArmL: [20, 0, 135], forearmL: [110, 0, 0] }) },
    { f: 66, pose: breath(0) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 10, keys: GAIT(0.045, 0.035, 7, 22, 12) },
  run: { fps: 30, loop: true, interp: 'step', length: 10, keys: GAIT(0.03, 0.045, 6, 28, 12) },
  // talk (loop 24): mouth opens on alternating keys, the head rolls toward the camera, the left claw gestures
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { ...base(), ...CARRY, chest: [-3, 8, 0], head: [-6, -24, 8], jaw: [52, 0, 0], ...EYES(0.25, 0, 0.02, -8), upperArmL: [25, 0, 55], forearmL: [50, 0, 0], handL: [-40, 0, 0] } },
    { f: 6, pose: { ...base(-0.035), ...CARRY, chest: [3, 0, 0], head: [2, -16, -2], jaw: [0, 0, 0], upperArmL: [14, 0, 14], forearmL: [30, 0, 0] } },
    { f: 12, pose: { ...base(), ...CARRY, chest: [-3, -6, 0], head: [-8, -14, 4], jaw: [50, 0, 0], ...EYES(0.25, 0, 0.02, -8), upperArmL: [55, 0, 50], forearmL: [70, 0, 0], handL: [-50, 0, 0] } },
    { f: 18, pose: { ...base(-0.035), ...CARRY, chest: [3, 2, 0], head: [2, -20, -4], jaw: [4, 0, 0], upperArmL: [14, 0, 14], forearmL: [30, 0, 0] } },
  ] },
  // vote: dip, then the hammer straight up overhead on the right (up-and-out), held
  vote: { fps: 30, loop: false, interp: 'step', events: { 4: 'vote@hammerTop' }, keys: [
    { f: 0, pose: { ...base(-0.05), ...CARRY, spine: [6, 0, 0], chest: [6, 0, 0], head: [-6, 0, 0], upperArmR: [-15, 0, 20] } },
    { f: 4, pose: { ...base(0.04), spine: [-3, 0, 6], chest: [-4, 0, 6], head: [-6, 8, -6], jaw: [16, 0, 0], ...WIDE,
      upperArmR: [25, 0, 150], forearmR: [0, 0, 25], handR: [34, 0, 156], 'hammer.p': [0, 0.12, 0], upperArmL: [10, 0, 14], forearmL: [30, 0, 0] } },
  ] },
  // die (gentle): sways, knees buckle, sits down, tips over onto his back rolled toward the camera, the goggles slip
  // down over his eyes; the hammer stays in the claw beside him
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 26: 'land' }, keys: [
    { f: 0, pose: { ...base(0.01), ...CARRY, upperArmL: [10, 0, 45], forearmL: [30, 0, 0], spine: [-6, 0, 10], chest: [-6, 8, 8], head: [-12, -10, 14], jaw: [24, 0, 0], ...WIDE } },
    { f: 10, pose: { pos: [0, -0.10, 0], ...CARRY, spine: [16, 0, 0], chest: [8, 0, 0], head: [-14, 0, 0], ...SHUT,
      thighL: [50, 0, 0], shinL: [-100, 0, 0], footL: [50, 0, 0], thighR: [50, 0, 0], shinR: [-100, 0, 0], footR: [50, 0, 0], upperArmL: [-10, 0, 25] } },
    { f: 18, pose: { pos: [0, -0.14, -0.14], ...CARRY, spine: [10, 0, 0], chest: [4, 0, 0], head: [-12, 0, 0], ...SHUT, goggles: [48, 0, 0],
      thighL: [90, 0, 8], shinL: [-90, 0, 0], footL: [0, 0, 0], thighR: [90, 0, 8], shinR: [-90, 0, 0], footR: [0, 0, 0], upperArmL: [-10, 0, 40] } },
    { f: 26, pose: DEAD() },
  ] },
  // emote "ring" (works by feel): cocks the hammer high over his right shoulder, taps its head down on his own left
  // claw (spark), shuts his eyes and cocks his head toward the hammer held by his ear to LISTEN to the ring (a note),
  // then nods, satisfied. Wrist triples solved headless (shots/char-mole/mole_solve.js) for the hammer direction.
  // (t1 touch-up, Clocktower-only) the wind-up no longer cocks the hammer high over the shoulder (read as a swing): f0
  // holds the claw out and LIFTS the hammer a hand's breadth above it (the tap pose with the arm 22° higher), then a
  // small tap; the impact spark became a soft 'ting' sparkle at the claw (sparkle@clawL).
  ring: { fps: 30, loop: false, interp: 'step', events: { 8: 'sparkle@clawL', 22: 'emote:note@hammerTop' }, keys: [
    { f: 0, pose: { ...base(0.0), spine: [2, 0, 0], chest: [2, 0, 0], head: [-12, 0, -10], ...WIDE,
      upperArmR: [82, 0, -20], forearmR: [40, 0, 0], handR: [151, 0, 77], 'hammer.p': [0, 0.1, 0], upperArmL: [35, 0, 55], forearmL: [40, 0, 0], handL: [-20, 0, 0] } },
    // r2 TAP: left claw held out to the side (clear of the apron at S and SE), the hammer swung across so its head lands
    // on the claw (wrist solved for the head position: mole_solve2.js); the spark fires at the claw socket
    { f: 8, pose: { ...base(-0.05), spine: [6, 0, 0], chest: [6, 0, 0], head: [-10, 0, -10], ...SHUT,
      upperArmR: [60, 0, -20], forearmR: [40, 0, 0], handR: [151, 0, 77], 'hammer.p': [0, 0.1, 0], upperArmL: [35, 0, 55], forearmL: [40, 0, 0], handL: [-20, 0, 0] } },
    { f: 16, pose: { ...base(-0.01), chest: [-2, 0, 4], head: [-8, 8, 32], ...LISTEN, jaw: [10, 0, 0],
      upperArmR: [0, 0, 105], forearmR: [60, 0, 30], handR: [-19, 44, -131], 'hammer.p': [0, -0.12, 0], upperArmL: [12, 0, 14], forearmL: [30, 0, 0] } },
    { f: 32, pose: { ...base(-0.035), ...CARRY, chest: [4, 0, 0], head: [4, 0, 6], jaw: [18, 0, 0] } },
    { f: 38, pose: breath(0) },
  ] },
};
function DEAD() {
  return { pos: [0, -0.26, -0.14], hips: [-70, 0, 0], spine: [-10, 0, 0], chest: [0, 0, 0], head: [20, 20, 18], ...SHUT, goggles: [50, 0, 0],
    thighL: [80, 0, 18], shinL: [-50, 0, 0], footL: [10, 0, 0], thighR: [70, 0, 10], shinR: [-60, 0, 0], footR: [10, 0, 0],
    upperArmR: [30, 0, 60], forearmR: [20, 0, 0], handR: [-20, 0, -40], upperArmL: [20, 0, 50], forearmL: [30, 0, 0] };
}
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

// ── point (t1 touch-up: the game's shared emote) — the free LEFT claw singles someone out. Draw-in (claw gathered at
// the chest, squint) → the claw thrust out ahead-and-left at shoulder height (arm out 60°: a screen-horizontal stroke
// at the game facing SE, clear of the body at S/SE/N/NW/W/SW; hidden behind the body at E), head kept on its
// distrustful camera-side glance, eyes wide, jaw open ("him.") → a firmer jab (body dips) → held → a second small jab → the
// claw comes back, a suspicious squint aside → idle. The hammer keeps its carry (identity, never aimed at anyone).
// The game turns the avatar toward the target and shows a point for ≈ 3.5 s (pipgws EMOTE_POINT_MS).
const PT = { spine: [4, 0, 0], chest: [2, 0, 0], head: [-6, HEAD_TW, 0], arm: [100, 60, -20] };   // t1/g8-pC: no twist; chest twists (pA/pB) swung the hammer across the body at SE
const POINT = (d = 0, extra = {}) => ({ ...base(-0.012 - 0.022 * d), ...CARRY, spine: [PT.spine[0] + 3 * d, PT.spine[1], 0],
  chest: [PT.chest[0] + 2 * d, PT.chest[1], 0], head: PT.head, ...WIDE, jaw: [10 + 30 * d, 0, 0],
  upperArmL: [PT.arm[0] - 6 * d, 0, PT.arm[1]], forearmL: [PT.arm[2], 0, 0], handL: [0, 0, 0], ...extra });
CLIPS.point = { fps: 30, loop: false, interp: 'step', keys: [
  { f: 0, pose: { ...base(-0.04), ...CARRY, spine: [-4, 6, 0], chest: [-4, 8, 0], head: [-8, HEAD_TW, 0], ...LISTEN, upperArmL: [30, 0, -10], forearmL: [100, 0, 0] } },
  { f: 5, pose: POINT(0) },
  { f: 17, pose: POINT(1) },
  { f: 29, pose: POINT(0, { jaw: [0, 0, 0] }) },
  { f: 50, pose: POINT(1, { jaw: [20, 0, 0] }) },
  { f: 60, pose: POINT(0, { jaw: [0, 0, 0] }) },
  { f: 84, pose: breath(0, { chest: [4, 0, 0], head: [-4, -30, 0], ...LISTEN, upperArmL: [30, 0, -10], forearmL: [90, 0, 0] }) },
  { f: 96, pose: breath(0) },
] };

// ── ghost / ghost-spent (t1 touch-up). Dead players hover as a pale-blue ghost (v2 ghost row: the sprite in pale blue,
// a gold halo while the ghost vote is unspent). In the spec:
//   * hover: root up 3–5 texels with a 1-texel bob (4 step keys, 18 frames apart), ±3° sway, eyes half shut, the left
//     claw laid on the chest, the hammer kept at its carry (identity). Loop clips keep the gait's ground IK on the legs,
//     so the shins + boots are scaled away ('shin*.s' −0.98) — they sit inside the dissolved lower body anyway;
//   * pale: material.tones (GHOST_GLSL) remaps every tone by luminance onto a pale-blue ramp when the halo bone's world
//     scale says "ghost" (spent: desaturated and dimmer); trousers + apron foot dissolve with a 2×2 ordered dither
//     (discard) from bind height GF solid → gone;
//   * halo: 'halo.s' grows the buried ring (ghost only, untinted brass).
const GHOST_UP = 1 / HALO_K - 1, GHOST_SPENT = 1;
const HIDE_LEGS = { 'shinL.s': [-0.98, -0.98, -0.98], 'shinR.s': [-0.98, -0.98, -0.98] };
const HALF = EYES(-0.4, 0, -0.012, 4);
const GHOST = (y, roll, halo, extra = {}) => ({ ...BROW0, ...CARRY, pos: [0, y, 0], spine: [0, 0, roll], chest: [2, 0, roll * 0.5], head: [-4, HEAD_TW, -roll],
  ...HALF, upperArmL: [34, 0, -8], forearmL: [84, 0, 0], ...HIDE_LEGS, 'halo.s': [halo, halo, halo], ...extra });
const ghostClip = (hi, lo, roll, halo, extra) => ({ fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
  { f: 0, pose: GHOST(hi, roll, halo, extra) },
  { f: 18, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
  { f: 36, pose: GHOST(lo, -roll, halo, extra) },
  { f: 54, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
] });
CLIPS.ghost = ghostClip(GH[0], GH[1], 3, GHOST_UP);
// spent: lower, heavier hover, head bowed, eyes nearly shut, no halo, dimmer (shader)
CLIPS['ghost-spent'] = ghostClip(GH[2], GH[3], 2, GHOST_SPENT, { head: [8, HEAD_TW, 0], ...EYES(-0.6, 0, -0.024, 10) });

const lin = (h) => new THREE.Color(h).convertSRGBToLinear().toArray().map((v) => v.toFixed(4)).join(', ');
const GHOST_GLSL = {
  vertexHead: 'flat varying float vGhost; flat varying float vGhostHalo;',
  vertex: (headI, haloI) => `
    vGhost = 0.0; vGhostHalo = 0.0;
    #ifdef USE_SKINNING
      {
        float gH = length(getBoneMatrix(${headI}.0)[0].xyz);
        float gS = length(getBoneMatrix(${haloI}.0)[0].xyz) / max(gH, 1e-6);
        vGhost = gS > 100.0 ? 1.0 : (gS > 1.5 ? 2.0 : 0.0);
        vGhostHalo = abs(skinIndex.x - ${haloI}.0) < 0.5 ? 1.0 : 0.0;
      }
    #endif`,
  fragmentHead: `flat varying float vGhost; flat varying float vGhostHalo;
    vec3 ghostTone(vec3 c, float spent) {
      float l = pow(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 0.5);   // t1: 0.5 (goat 0.42) keeps more value steps on a dark figure
      vec3 g = mix(vec3(${lin('#3A4C80')}), vec3(${lin('#DCF4FC')}), l);   // t1: low end darker than goat's #4E6C9C (the 2x2 eyes vanished into the dark fur)
      float gy = dot(g, vec3(0.2126, 0.7152, 0.0722)), cy = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
      g = mix(g, clamp(c * (gy / cy), 0.0, 1.0), 0.25);   // t1: keep a quarter of the living hue (pink nose, brass goggles) at the ghost value
      return spent > 0.5 ? mix(g, vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), 0.6) * 0.62 : g;
    }`,
  tones: `
    if (vGhost > 0.5 && vGhostHalo < 0.5) {
      float gSpent = vGhost > 1.5 ? 1.0 : 0.0;
      float gLo = mix(${GF[0].toFixed(3)}, ${GF[2].toFixed(3)}, gSpent), gHi = mix(${GF[1].toFixed(3)}, ${GF[3].toFixed(3)}, gSpent);
      float gA = clamp((vCharBind.y - gLo) / (gHi - gLo), 0.0, 1.0);
      ivec2 gq = ivec2(gl_FragCoord.xy) & 1;
      float gT = gq.x == 0 ? (gq.y == 0 ? 0.125 : 0.625) : (gq.y == 0 ? 0.875 : 0.375);
      if (gA < gT) discard;
      toonHi = ghostTone(toonHi, gSpent); toonMid = ghostTone(toonMid, gSpent); toonSh = ghostTone(toonSh, gSpent);
      // t1 (frog lesson): a faint self-glow at dusk/night so the ghost stays pale in the dark (night ramp luma ≈ 0.29
      // vs ≥ 0.64 by day); the spent ghost glows half as much
      float gNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
      totalEmissiveRadiance = toonMid * mix(0.35, 0.16, gSpent) * gNight;
    } else if (vGhost > 0.5) {
      float gNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
      totalEmissiveRadiance = toonMid * 0.6 * gNight;   // the halo glows at night
    }`,
};

export function make() {
  const S = skeleton();
  const FR_GAME = V_GAME * V_GAME / (9.81 * S.meta.hipsY);
  const hTop = HAMMER.handle - HAMMER.below + HAMMER.head[1];
  return {
    name: 'mole',
    height: H,
    palette: PALETTE,
    signature: ['pink', { part: 'goggles' }],
    faceSlot: 'fur',
    bodyPlan: 'uprightAnimal',
    heightPx: [34, 44],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'ring',
    skeleton: S,
    parts: parts(S),
    sockets: { ...(S.sockets || {}), hammerTop: { bone: 'hammer', at: [0, hTop + 0.03, 0] }, clawL: { bone: 'handL', at: CLAW_SOCKET }, ear: { bone: 'head', at: [-0.3, 0.42, 0] } },
    chains: [],
    personality: { body: { f: 2, zeta: 1, r: 0 }, head: { f: 2, zeta: 1, r: 0 } },
    // legacy biped Gait, CAST_PORTING §8 chibi recipe (walk = THE game speed on the WALK branch, runFroude raised)
    locomotion: { walkSpeed: V_GAME, runSpeed: 2 * V_GAME, stride: 0.66 * H, runStride: 1.2 * H, duty: [0.18, 0.1], reach: 0.6, spacing: 0.27,
      poses: [4, 4], lift: [0.03, 0.05], bob: [0.04, 0.04], lean: [4, 10], arms: [0, 0], elbows: [0, 0], twist: [5, 7],
      runFroude: [FR_GAME * 1.5, FR_GAME * 2] },
    character: { legIK: 'pose', quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { speech: { node: 'head' }, flash: ['#F4EEE2'] },
    material: { sides: { eyeL: 'mid', eyeR: 'mid' },
      // (t1 touch-up) ghost / ghost-spent look (GHOST_GLSL; bone indices = skeleton order, the halo bone is appended last)
      vertexHead: GHOST_GLSL.vertexHead, fragmentHead: GHOST_GLSL.fragmentHead, tones: GHOST_GLSL.tones,
      vertex: GHOST_GLSL.vertex(S.findIndex((b) => b.name === 'head'), S.findIndex((b) => b.name === 'halo')) },
  };
}

export default make();
