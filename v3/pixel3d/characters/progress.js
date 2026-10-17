// Progress (char-progress) — cast member "progress", mascot 15-312: "A green frog who always takes a step."
// Design sheet (Unique to me, timing charts, self-critique): characters/progress.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/progress.ts + lib-c-frog.ts + refs/cast/progress.png.
// Body plan: upright CHIBI (chibi(), 2.2 heads) — a small, chubby, UN-armoured frog: wide flat head with two eye bumps
// and a big open grin (tongue), round pear belly with a cream front, orange knit scarf with a hanging end, little brown
// backpack. Gait: LegGait plan 'biped' ('hold' leg drawings) + an authored SKIP (clips.walk: contact squash → airborne
// step-hop, the free knee up, arms pumping, backpack bouncing) — one step per hop: he "always takes a step". The knight
// frog leaps on two feet, the toad waddles; Progress skips.
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.12;                 // v2 28 px → castHeight 1.12 m (top of the eye bumps)
export const SKH = 1.2;                     // chibi template height (proportions); head parts end at ≈ HEIGHT
export const V_GAME = 3.95 * HEIGHT;        // 4.42 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. 5 slots + 1 accent (pink: tongue + cheeks). v1 skin #6AA83E (h 95) = the meadow's hue (#75A558
// h 97): kept the v1 HUE (89) and VALUE — a DARK leaf green whose lit tone renders −29 % L under lit grass at noon
// and golden, sh −28 % under shaded grass (A/B shots/char-progress/pC; a light chartreuse r1 was +12 % = lime on lime and
// went yellow in golden). sh h 150 (blue-green), never teal 163. Orange scarf + brown pack carry the warm accents.
export const PALETTE = {
  skin: ['#6A9C34', '#528630', '#324A3E'],    // head, eye bumps, belly sides, arms, legs, webbed feet (v1 value: DARK leaf green)
  cream: ['#FFF8D2', '#EFE3A6', '#A69A86'],   // belly front, eye whites, pack clasp
  scarf: ['#FFB878', '#E8742E', '#8E3E42'],   // signature: knit scarf + hanging end, vote pennant
  pack: ['#D69A5E', '#A0602E', '#4A3A46'],    // backpack, straps, pennant stick
  dark: ['#5E3446', '#34182A', '#24121E'],    // open mouth inside, pupils (r5: darker → pupils read black, not mauve)
  pink: ['#FFC2C6', '#EC7C8C', '#A0506A'],    // accent: tongue, cheeks
};

// head-local layout (head joint = neck top, raised HEAD_UP so the scarf shows under the jaw at S)
const HEAD_UP = 0.06;
const EYE_X = 0.225, EYE_Y = 0.39, EYE_Z = 0.20;   // r5: bumps further out/up (SE notch), eye on the bump front
const BUMP = [0.225, 0.31, 0.07];
// vote pennant: authored tiny inside the right fist, scaled up by 'flag.s' in vote / emote (toad scroll technique)
export const FLAG_K = 0.04;
const FLAG_UP = 1 / FLAG_K - 1;
const HIDE_FLAG = { 'flag.s': [0, 0, 0] };

export function skeleton() {
  const opts = { height: SKH, heads: 2.2, legs: 0.62, arms: 0.65, snout: 0, ears: false, tail: false, shoulders: 0.6, hips: 0.3,
    face: { eye: [EYE_X, EYE_Y, EYE_Z], brow: false, mouth: false } };
  const S0 = chibi(opts);
  const m0 = S0.meta;
  const S1 = chibi({ ...opts, chains: { scarf: { n: 1, parent: 'chest', at: [0.07, m0.shoulderY - m0.chestY - 0.03, 0.235], dir: [0, -1, 0.18], len: 0.2 } } });
  const S = S1.map((b) => ({ ...b }));
  const head = S.find((b) => b.name === 'head');
  head.pos = [head.pos[0], head.pos[1] + HEAD_UP, head.pos[2]];
  // jaw hinge at the BACK of the mouth (frog lesson): opening drops the front of the jaw
  S.find((b) => b.name === 'jaw').pos = [0, 0.07, -0.10];
  for (const s of [1, -1]) S.find((b) => b.name === (s > 0 ? 'eyeL' : 'eyeR')).pos = [s * EYE_X, EYE_Y, EYE_Z];
  // backpack: one keyed bone hanging from the upper back (pivot at its top: tips out on landings, in on take-offs)
  S.push({ name: 'pack', parent: 'chest', pos: [0, m0.shoulderY - m0.chestY - 0.02, -0.17], axis: [0, -1, 0] });
  // vote pennant on the right fist (stick continues PAST the fist: a raised arm holds it up)
  S.push({ name: 'flag', parent: 'handR', pos: [0, -0.05, 0.01], axis: [0, 1, 0] });
  return Object.defineProperties(S, { sockets: { value: S1.sockets }, meta: { value: S1.meta } });
}

// lathe with its PROFILE origin kept (kit lathes are bbox-centred): profile y values stay bone-relative
const lath = (prof, n) => { const ys = prof.map((p) => p[1]); return K.xf(K.lathe(prof, n), { at: [0, (Math.min(...ys) + Math.max(...ys)) / 2, 0] }); };
const ring = (y, rx, rz, cz) => [...Array(8)].map((_, k) => { const a = (22.5 + 45 * k) * Math.PI / 180, c = Math.cos(Math.PI / 8);
  return [rx * Math.cos(a) / c, y, cz + rz * Math.sin(a) / c]; });

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head: WIDE FLAT frog skull (0.68 wide, rounder and softer than the knight's), the jaw below it hinged at the
  // back and modelled OPEN: a ≈ 3-texel dark grin with the pink tongue at rest (v1 `mouth: 'open'`) ──
  const SKULL = [ring(0.12, 0.38, 0.25, 0.04), ring(0.21, 0.39, 0.26, 0.03), ring(0.26, 0.32, 0.21, 0.0), ring(0.285, 0.17, 0.11, -0.03)].flat();
  add('head', K.hull(SKULL), [0, 0, 0], 'skin', { name: 'skull' });
  // r5 MOUTH = FRONT-ONLY GRIN: a skin JOWL closes the gap between skull and jaw on the sides and back (flush with the
  // jaw sides, down inside the jaw so a talk-open jaw still shows skin walls), its front pulled 0.12 m back from the
  // skull front → a recess only across the front face; a thin dark mouth block sits in that recess (down to y −0.07,
  // hidden by the jaw at rest, revealed when the jaw drops). Was a 0.58×0.10×0.34 dark box = a band round the head.
  // (two mirrored side hulls + a back block: a convex hull cannot hold the front notch) → the grin spans the skull's
  // FRONT face only (x ±0.16), 0.09 deep; the diagonal faces (= the side seen at SE) are closed skin
  const JOWL = [0.125, -0.005].flatMap((y) => [[0.16, y, -0.20], [0.33, y, -0.20], [0.35, y, 0.0], [0.33, y, 0.17],
    [0.22, y, 0.245], [0.16, y, 0.255]]);
  add('head', K.hull(JOWL), [0, 0, 0], 'skin', { name: 'jowl', mirror: true });
  add('head', K.box(0.34, 0.13, 0.30), [0, 0.06, -0.06], 'skin', { name: 'jowlBack' });
  add('head', K.box(0.34, 0.19, 0.05), [0, 0.03, 0.185], 'dark', { name: 'mouthIn' });
  // eye bumps: tall round domes on the crown's front corners, standing above the crown (notch between them at S/N) and
  // poking past the skull side (frog read at E/W); flat-topped profile (a lathe apex read as a horn at E/W)
  add('head', lath([[0.13, 0], [0.135, 0.09], [0.115, 0.17], [0.06, 0.20]], 8), [BUMP[0], BUMP[1], BUMP[2]], 'skin', { name: 'eyeBump', mirror: true });
  // cheeks: pink blush flush on the skull's front diagonal faces (v1 1-px cheeks → 2×2 texels)
  add('head', K.xf(K.box(0.08, 0.06, 0.03), { rot: [0, 45, 0] }), [0.28, 0.19, 0.22], 'pink', { name: 'cheek', mirror: true });
  // lower jaw: a THIN skin chin (v1: the mouth is the bottom of the head) with the dark mouth floor and the tongue on
  // top; its top sits 0.09 m under the skull = the open grin (≈ 3 texels of dark + the tongue at S)
  add('jaw', K.chamferBox(0.68, 0.07, 0.40, 0.3), [0, -0.075, 0.17], 'skin', { name: 'jaw' });
  add('jaw', K.box(0.38, 0.02, 0.12), [0, -0.035, 0.30], 'dark', { name: 'mouthFloor' });
  add('jaw', K.box(0.22, 0.05, 0.10), [0, -0.02, 0.31], 'pink', { name: 'tongue' });
  // eyes: cream white on the front of the bump, tilted 24° up toward the camera, dark 2×2 pupil
  const TILT = 24, eN = [0, Math.sin(TILT * Math.PI / 180), Math.cos(TILT * Math.PI / 180)];
  const onN = (d, x = 0, y = 0) => [x, y + eN[1] * d, eN[2] * d];
  // r5: bigger white (r 0.095 ≈ 3×3+ texels) with a SMALL pupil (≈ 1–2 × 1 texel) in its UPPER half, inner side
  add('eyeL', K.xf(K.prism(8, 0.095, 0.04), { rot: [90 - TILT, 0, 0] }), onN(0.0), 'cream', { name: 'eyeWhite', mirror: true });
  add('eyeL', K.xf(K.box(0.05, 0.05, 0.03), { rot: [-TILT, 0, 0] }), onN(0.022, -0.01, 0.025), 'dark', { name: 'pupil', mirror: true });

  // ── body: round pear belly (skin) with a cream front, pelvis, neck ──
  const BELLY = [[0.18, -0.15], [0.235, -0.06], [0.245, 0.03], [0.225, 0.11], [0.17, 0.16]];
  add('spine', lath(BELLY, 8), [0, 0, 0], 'skin', { name: 'belly' });
  // cream belly front: a shell CONFORMING to the 8-gon lathe over the front face and half of each diagonal face
  // (0.006 proud, wraps ±80°: the green arms read against it at S AND at E/W) → the v1 pale belly, no box outline
  const c8 = Math.cos(Math.PI / 8);
  const onLathe = (r, th, d) => { const k = Math.cos(th - Math.round(th / (Math.PI / 4)) * Math.PI / 4);
    const rr = r * c8 / k + d; return [rr * Math.sin(th), rr * Math.cos(th)]; };
  const BP = [[0.204, -0.11], [0.235, -0.06], [0.245, 0.03], [0.232, 0.085]];
  const pts = [];
  for (const [r, y] of BP) for (const th of [-1.4, -1.1781, -0.3927, 0, 0.3927, 1.1781, 1.4]) for (const d of [0.006, -0.05]) { const [x, z] = onLathe(r, th, d); pts.push([x, y, z]); }
  add('spine', K.hull(pts), [0, 0, 0], 'cream', { name: 'bellyFront' });
  add('hips', lath([[0.15, -0.07], [0.19, 0.0], [0.2, 0.05]], 8), [0, 0, 0], 'skin', { name: 'pelvis' });
  add('neck', K.box(0.30, 0.10, 0.24), [0, 0.04, -0.01], 'skin', { name: 'neck' });

  // ── scarf: chunky knit collar on the chest top (wider than the belly top) + the hanging end (1-link chain) ──
  const sy = m.shoulderY - m.chestY;
  add('chest', lath([[0.235, 0], [0.245, 0.035], [0.215, 0.07]], 8), [0, sy - 0.035, 0.0], 'scarf', { name: 'scarfCollar' });
  add('scarf0', K.chamferBox(0.1, 0.21, 0.045, 0.3), [0, -0.09, 0], 'scarf', { name: 'scarfEnd' });

  // ── backpack (keyed bone; front straps dropped: 1-px dark lines over the belly read as speckle) ──
  // r5: wider (0.46: peeks past the belly at SE like v1), one slot (flap/clasp split dropped: tonal noise)
  add('pack', K.chamferBox(0.46, 0.34, 0.17, 0.25), [0, -0.16, -0.09], 'pack', { name: 'packBody' });

  // ── arms: short skin arms, round hands ──
  add('upperArmL', K.frustum(4, 0.065, 0.06, m.upperArm + 0.02), [0, -m.upperArm / 2 + 0.01, 0], 'skin', { name: 'upperArm', mirror: true });
  add('forearmL', K.frustum(4, 0.06, 0.064, m.forearm), [0, -m.forearm / 2, 0], 'skin', { name: 'forearm', mirror: true });
  add('handL', K.chamferBox(0.095, 0.09, 0.095, 0.35), [0, -0.035, 0.008], 'skin', { name: 'hand', mirror: true });

  // ── legs: chubby haunches, short shins, wide WEBBED feet (fan-shaped hull, toes splayed) ──
  add('thighL', K.frustum(6, 0.115, 0.09, m.thigh + 0.04), [0, -m.thigh / 2 + 0.01, 0], 'skin', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.065, 0.07, m.shin), [0, -m.shin / 2, 0], 'skin', { name: 'shin', mirror: true });
  const a = m.ankleY;
  const FOOT = [[-0.045, 0, -0.05], [0.045, 0, -0.05], [-0.045, a, -0.03], [0.045, a, -0.03],
    [-0.095, 0, 0.17], [0.095, 0, 0.17], [-0.075, 0.035, 0.15], [0.075, 0.035, 0.15], [0, 0.04, 0.17]];
  add('footL', K.hull(FOOT.map(([x, y, z]) => [x, y - a, z])), [0, 0, 0], 'skin', { name: 'foot', mirror: true });

  // ── vote pennant (bone 'flag', authored at FLAG_K): stick continuing past the fist + an orange triangle near the top ──
  const k = FLAG_K;
  add('flag', K.xf(K.box(0.07, 0.72, 0.07), { scale: [k, k, k] }), [0, -0.38 * k, 0], 'pack', { name: 'flagStick' });
  const TRI = [[0, 0, 0], [0, -0.22, 0], [0.30, -0.11, 0]].flatMap(([x, y, z]) => [[x, y, z - 0.025], [x, y, z + 0.025]]);
  add('flag', K.xf(K.hull(TRI), { rot: [0, 35, 0], scale: [k, k, k] }), [0.03 * k, -0.53 * k, 0], 'scarf', { name: 'flagCloth' });
  return P;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz grid) ──────────────────────────────────────────────────
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const SHOW_FLAG = { 'flag.s': [FLAG_UP, FLAG_UP, FLAG_UP] };
// idle: rest arms a little out from the belly, breath in chest + 1 texel of pos, head counter-rotates
const breathe = (d, c) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0],
  upperArmL: [4, 0, 12 + c], upperArmR: [4, 0, 12 + c], forearmL: [14, 0, 0], forearmR: [14, 0, 0], pack: [-c, 0, 0] });

// SKIP drawings (f 0 = left contact). Contact: squash low, pack tips out, the leading-leg-side arm forward.
// Flight: the body up ≈ 4 texels, stretched, the free knee up (gait), the opposite arm pumped high, pack tips in.
// r5: the head COUNTER-PITCHES (flight +4 vs contact −6) so hips+spine+chest+head = +2° on every drawing → the grin
// shows the same area on contact and flight (it used to open/close with the body pitch = chattering at 1×).
const skip = (s, flight) => {
  const L = s > 0 ? 'L' : 'R', R = s > 0 ? 'R' : 'L';
  return flight
    ? { pos: [0, 0.11, 0], 'spine.s': [-0.03, 0.05, -0.03], hips: [4, 6 * s, -5 * s], spine: [-4, 0, 3 * s], chest: [-2, -6 * s, 0], head: [4, 4 * s, -6 * s],
      [`upperArm${L}`]: [84, 0, 30], [`forearm${L}`]: [60, 0, 0], [`upperArm${R}`]: [-52, 0, 30], [`forearm${R}`]: [30, 0, 0], pack: [10, 0, 0] }
    : { pos: [0, -0.035, 0], 'spine.s': [0.05, -0.06, 0.05], hips: [6, -4 * s, 4 * s], spine: [2, 0, -2 * s], chest: [0, 4 * s, 0], head: [-6, -2 * s, 4 * s],
      [`upperArm${L}`]: [30, 0, 28], [`forearm${L}`]: [40, 0, 0], [`upperArm${R}`]: [-24, 0, 28], [`forearm${R}`]: [20, 0, 0], pack: [-20, 0, 0] };
};

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: breathe(0, 0) }, { f: 30, pose: breathe(0.014, 2) }, { f: 36, pose: breathe(0.028, 4) },
    { f: 54, pose: { ...breathe(0.028, 4), ...BLINK } }, { f: 56, pose: breathe(0.028, 4) }, { f: 66, pose: breathe(0.014, 2) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: skip(1, false) }, { f: 1, pose: skip(1, true) }, { f: 2, pose: skip(-1, false) }, { f: 3, pose: skip(-1, true) },
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: { ...skip(1, false), spine: [12, 0, -2], head: [-6, -2, 4] } }, { f: 1, pose: { ...skip(1, true), pos: [0, 0.16, 0], spine: [6, 0, 3], head: [4, 4, -6] } },
    { f: 2, pose: { ...skip(-1, false), spine: [12, 0, 2] } }, { f: 3, pose: { ...skip(-1, true), pos: [0, 0.16, 0], spine: [6, 0, -3], head: [4, -4, 6] } },
  ] },
  // talk (loop 24): an eager chatterbox — the grin opens wide (jaw +22) and nearly shuts (−8) on alternating keys, the
  // head rolls ±12° and tips UP on the open keys, the right hand presents / the left hand joins in, 1-texel bob
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, dynamics: 'hold', keys: [
    { f: 0, pose: { pos: [0, 0.0, 0], chest: [-4, 8, 0], head: [-8, 6, 12], jaw: [22, 0, 0],
      upperArmR: [46, 0, 34], forearmR: [70, 0, 0], handR: [0, -30, 0], upperArmL: [4, 0, 14], forearmL: [16, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.028, 0], chest: [3, -2, 0], head: [3, -4, -8], jaw: [-8, 0, 0],
      upperArmR: [12, 0, 16], forearmR: [30, 0, 0], upperArmL: [4, 0, 14], forearmL: [16, 0, 0] } },
    { f: 12, pose: { pos: [0, 0.0, 0], chest: [-4, -8, 0], head: [-8, -6, -12], jaw: [20, 0, 0],
      upperArmL: [46, 0, 34], forearmL: [70, 0, 0], handL: [0, -30, 0], upperArmR: [12, 0, 16], forearmR: [30, 0, 0] } },
    { f: 18, pose: { pos: [0, -0.028, 0], chest: [3, 2, 0], head: [3, 4, 8], jaw: [-8, 0, 0],
      upperArmR: [12, 0, 16], forearmR: [30, 0, 0], upperArmL: [4, 0, 14], forearmL: [16, 0, 0] } },
  ] },
  // vote: a 3-frame dip (hand to the pack) → the right arm UP-and-out holding the orange pennant upright above the head,
  // up on his toes, eyes wide, grin open, HELD
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [6, -10, 0], head: [-4, 6, 0], ...HIDE_FLAG,
      upperArmR: [-30, 0, 24], forearmR: [40, 0, 0], upperArmL: [8, 0, 14] } },
    { f: 3, pose: { pos: [0, 0.03, 0], spine: [-3, 0, 4], chest: [-4, 0, 6], head: [-6, -8, -6], jaw: [16, 0, 0], ...EYES(0.12, 0.2),
      upperArmR: [-6, 0, 118], forearmR: [0, 0, 6], handR: [0, 0, 66], upperArmL: [10, 0, 26], forearmL: [30, 0, 0], ...SHOW_FLAG } },
  ] },
  // die (gentle, no hurt): wobbles, eyes drooping (6) → knees give, sits down (6) → r5 flops BACK onto his backpack (5)
  // → reclines on the pack like a pillow, belly and face (eyes shut) up toward the camera at every facing, legs out,
  // arms flopped wide (dust + soul wisp at the settle) → held. The pack is under him (its lit face no longer a frame).
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 20: 'die' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-6, 10, -8], head: [-6, -10, 12], jaw: [6, 0, 0], ...EYES(0, -0.5),
      upperArmR: [-10, 0, 34], forearmR: [20, 0, 0], upperArmL: [-10, 0, 34], forearmL: [20, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.15, -0.02], hips: [-10, 0, 0], spine: [8, 0, 0], chest: [6, 0, 0], head: [-2, 0, 0], jaw: [0, 0, 0], ...EYES(0, -0.6),
      thighL: [75, 0, 14], shinL: [-100, 0, 0], footL: [20, 0, 0], thighR: [75, 0, 14], shinR: [-100, 0, 0], footR: [20, 0, 0],
      upperArmR: [10, 0, 26], forearmR: [30, 0, 0], upperArmL: [10, 0, 26], forearmL: [30, 0, 0] } },
    { f: 12, pose: { pos: [0, -0.17, -0.06], hips: [-36, 0, 0], spine: [-4, 0, 0], chest: [-2, 0, 0], head: [6, 0, 6], ...BLINK,
      thighL: [90, 0, 16], shinL: [-80, 0, 0], thighR: [90, 0, 16], shinR: [-80, 0, 0],
      upperArmR: [-10, 0, 56], forearmR: [20, 0, 0], upperArmL: [-10, 0, 56], forearmL: [20, 0, 0] } },
    { f: 17, pose: { pos: [0, -0.16, -0.14], hips: [-62, 0, 0], spine: [-4, 0, 0], chest: [-2, 0, 0], head: [16, 0, 8], jaw: [-6, 0, 0], ...BLINK,
      thighL: [40, 0, 26], shinL: [-20, 0, 0], footL: [-10, 0, 0], thighR: [40, 0, 26], shinR: [-20, 0, 0], footR: [-10, 0, 0],
      upperArmR: [-14, 0, 76], forearmR: [16, 0, 0], upperArmL: [-14, 0, 76], forearmL: [16, 0, 0], pack: [40, 0, 0] } },
    { f: 20, pose: { pos: [0, -0.17, -0.14], hips: [-64, 0, 0], spine: [-4, 0, 0], chest: [-2, 0, 0], head: [18, 0, 8], jaw: [-6, 0, 0], ...BLINK,
      thighL: [38, 0, 28], shinL: [-18, 0, 0], footL: [-10, 0, 0], thighR: [38, 0, 28], shinR: [-18, 0, 0], footR: [-10, 0, 0],
      upperArmR: [-14, 0, 80], forearmR: [16, 0, 0], upperArmL: [-14, 0, 80], forearmL: [16, 0, 0], pack: [42, 0, 0] } },
  ] },
  // point (the game's shared emote): lean in (4) → right arm straight out at shoulder height, head turned along it, grin
  // open (held 18) → idle
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [4, 10, 0], head: [-4, 6, 0], upperArmR: [30, 0, 20], forearmR: [60, 0, 0], upperArmL: [4, 0, 14] } },
    { f: 4, pose: { pos: [0, 0.0, 0.02], spine: [4, -6, 0], chest: [2, -10, 0], head: [-6, -12, 0], jaw: [12, 0, 0],
      upperArmR: [88, 0, 14], forearmR: [0, 0, 0], 'forearmR.s': [0, 0.3, 0], upperArmL: [-10, 0, 20], forearmL: [20, 0, 0] } },
    { f: 22, pose: breathe(0, 0) },
  ] },
  // step (emote, "always takes a step"): r5 a real STEP FORWARD — gather back (crouch, body 0.08 behind, arms back) (8) →
  // airborne (6) → LANDS 0.34 m ahead of the gather (≈ 12 texels) in a lunge, the left foot clearly ahead, arms up and OUT
  // in a wide V that clears the head at every facing, grin wide, star glyph (14) → back foot joins (6) → idle. Legs FK.
  step: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 14: ['land', 'emote:star@crown'] }, keys: [
    { f: 0, pose: { pos: [0, -0.09, -0.08], hips: [8, 0, 0], spine: [12, 0, 0], chest: [6, 0, 0], head: [-14, 0, 0], ...EYES(0.05, -0.3),
      thighL: [40, 0, 4], shinL: [-80, 0, 0], footL: [40, 0, 0], thighR: [40, 0, 4], shinR: [-80, 0, 0], footR: [40, 0, 0],
      upperArmL: [-46, 0, 20], forearmL: [30, 0, 0], upperArmR: [-46, 0, 20], forearmR: [30, 0, 0], pack: [-8, 0, 0] } },
    { f: 8, pose: { pos: [0, 0.24, 0.08], 'spine.s': [-0.04, 0.07, -0.04], hips: [-6, 0, 0], spine: [-6, 0, 0], head: [-8, 0, 0], jaw: [14, 0, 0],
      thighL: [70, 0, 6], shinL: [-80, 0, 0], footL: [30, 0, 0], thighR: [0, 0, 6], shinR: [-60, 0, 0], footR: [40, 0, 0],
      upperArmL: [60, 0, 40], forearmL: [30, 0, 0], upperArmR: [60, 0, 40], forearmR: [30, 0, 0], pack: [14, 0, 0] } },
    { f: 14, pose: { pos: [0, -0.07, 0.17], 'spine.s': [0.06, -0.08, 0.06], hips: [0, 0, 0], spine: [-6, 0, 0], chest: [-6, 0, 0], head: [-10, 0, 0],
      jaw: [24, 0, 0], ...EYES(0.1, -0.45),
      thighL: [58, 0, 4], shinL: [-52, 0, 0], footL: [-6, 0, 0], thighR: [-34, 0, 4], shinR: [-6, 0, 0], footR: [20, 0, 0],
      upperArmL: [-26, 0, 142], forearmL: [0, 0, 0], upperArmR: [-26, 0, 142], forearmR: [0, 0, 0], 'upperArmL.s': [0, 0.4, 0], 'upperArmR.s': [0, 0.4, 0], 'forearmL.s': [0, 0.9, 0], 'forearmR.s': [0, 0.9, 0], pack: [-16, 0, 0] } },
    { f: 28, pose: { pos: [0, -0.02, 0.1], spine: [2, 0, 0], head: [-4, 0, 0], jaw: [10, 0, 0],
      thighL: [10, 0, 4], shinL: [-10, 0, 0], thighR: [-6, 0, 4], shinR: [-4, 0, 0],
      upperArmL: [10, 0, 40], forearmL: [20, 0, 0], upperArmR: [10, 0, 40], forearmR: [20, 0, 0], pack: [4, 0, 0] } },
    { f: 34, pose: breathe(0, 0) },
  ] },
};

// vote / die end on a HELD pose (clip.hold): repeat the last key later so the clip length covers the FX tail
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  return {
    name: 'progress',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['scarf', 'skin'],
    faceSlot: 'skin',
    bodyPlan: 'uprightAnimal',
    heightPx: [36, 46],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'skip' },
    emote: 'step',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0, 0.5, 0.04] } },
    chains: [{ name: 'scarf', f: 4, zeta: 0.6, r: 0, gravity: 0.7, drag: 0.8, limit: 35, falloff: 1 }],
    personality: { body: { f: 3.5, zeta: 0.5, r: 1 }, head: { f: 3.5, zeta: 0.6, r: 0 } },
    locomotion: { plan: 'biped', plant: 'hold', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.25, 0.2], lift: [0.16, 0.2], lean: [6, 12], surge: false },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid' }, merge: { scarf0: 'chest' } },
  };
}

export default make();
