// Toadley (char-toad) — cast member "toad", villager: "Merchant of fine goods and finer excuses."
// Design sheet (Unique to me, timing charts, self-critique): characters/toad.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/toad.ts + refs/cast/toad.png.
// Body plan: upright CHIBI skeleton (chibi(), 2.3 heads, wide portly body; v2 draws him upright in shirt + waistcoat)
// driven by LegGait plan 'biped' with the BIRD body style = a WADDLE: legs alternate (one planted touchdown drawing
// per step, re-pinned per frame), the whole body rolls onto the planted foot and yaws toward it, the head thrusts on
// each touchdown and the arms flap out — the portly merchant rocks side to side at 3.95 H/s. The satchel on the right
// hip is a 1-link spring chain that swings with the roll. (The frog leaps on two feet; the toad waddles.)
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.05;                 // v2 26 px → castHeight 1.05 m (top of the eye bumps)
export const SKH = 1.12;                    // template height (chibi() proportions); the head parts end at ≈ HEIGHT
export const V_GAME = 3.95 * HEIGHT;        // 4.15 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. 5 slots + 1 accent (brass). r2: back to the v1 OLIVE hue (v1 #989A5F/#7E8444; the r1 tan re-hue
// read as a mushroom/bread loaf). Olive and lit grass share a hue (dH 11-14), so ground separation comes from VALUE: a
// darker olive hi renders -28 % L under lit grass at noon AND golden, and a dark moss sh sits -30 % under shaded grass
// (A/B shots/char-toad/r2pA vs r2pB: hi #969C4A only -25 % = WARN). Cream = second signature half.
export const PALETTE = {
  skin: ['#8E9446', '#666E36', '#3E4634'],    // signature 1: head, eye bumps, warts, hands (v1 olive, DARK value: ground by L)
  cream: ['#FFF4D8', '#E6D8B4', '#A8968E'],   // signature 2: shirt front + sleeves, throat, the scroll
  vest: ['#62967A', '#3C6852', '#3C3C50'],    // dark-green waistcoat (v1 #2E4C3E lifted for night)
  leather: ['#D49A5C', '#9A6236', '#5E4044'], // satchel, strap, belt
  dark: ['#8A6450', '#5A3E30', '#423040'],    // trousers, boots, mouth line + inside, pupils
  brass: ['#FFE596', '#D9A94A', '#8E6848'],   // accent: golden eyes, buttons, buckle, satchel clasp
};

// head-local L eye bump [x, y, z, r] (proud of the crown) and the eye joint on its lower front
const BUMP = [0.205, 0.30, 0.06, 0.105];
const EYE_X = 0.21, EYE_Y = 0.278, EYE_Z = 0.182;
const HEAD_DOWN = -0.03;                    // head sunk onto the shoulders (a toad has no neck: v1 throat overlaps the torso)
// scroll: authored tiny in the right hand (hidden inside the hand box) and scaled up by 'scroll.s' in vote / emote
export const SCROLL_K = 0.04;
const SCROLL_UP = 1 / SCROLL_K - 1;          // 'scroll.s' value that shows it at full size
// satchel: 1-link chain on the right hip, hanging down; the bag's scroll rides on its own child bone (hidden in vote)
const BAG_AT = [-0.285, 0.02, -0.04];      // r2: 0.025 higher + tucked in (dir-2 walk: bag bottom stays near the sole line)

export function skeleton() {
  const S0 = chibi({ height: SKH, heads: 2.3, legs: 0.7, arms: 0.85, snout: 0, ears: false, tail: false, shoulders: 0.5, hips: 0.2,
    face: { eye: [EYE_X, EYE_Y, EYE_Z], brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  // jaw hinge at the BACK of the mouth (frog lesson: a front hinge cannot open a wide toad mouth)
  S.find((b) => b.name === 'jaw').pos = [0, 0.085, -0.05];   // r2: 0.03 forward (mouth shows at SE)
  const head = S.find((b) => b.name === 'head');
  head.pos = [head.pos[0], head.pos[1] - HEAD_DOWN, head.pos[2]];
  for (const s of [1, -1]) S.find((b) => b.name === (s > 0 ? 'eyeL' : 'eyeR')).pos = [s * EYE_X, EYE_Y, EYE_Z];
  S.push({ name: 'bagR0', parent: 'hips', pos: BAG_AT, axis: [0, -1, 0] });
  S.push({ name: 'bagScrollR', parent: 'bagR0', pos: [-0.02, -0.06, -0.07], axis: [0, 1, 0] });
  S.push({ name: 'scroll', parent: 'handR', pos: [0, -0.04, 0.01], axis: [0, 1, 0] });
  // (ghost port) no ghost bones any more: spec.ghost (shared ghost look) appends its own 'ghostHalo' bone
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

const ring = (y, rx, rz, cz) => [...Array(8)].map((_, k) => { const a = (22.5 + 45 * k) * Math.PI / 180, c = Math.cos(Math.PI / 8);
  return [rx * Math.cos(a) / c, y, cz + rz * Math.sin(a) / c]; });

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint = neck top; y 0 head-local). WIDE toad head with a LOW FLAT crown (r2): the crown's back rim sits
  // ≈ 0.07 m (2.5 texels) BELOW the two proud eye bumps in the 30° camera projection (screen-up = y·cos30 − z·sin30),
  // so the S/SE/SW silhouette has two bumps and a notch between them (v1 refs/cast/toad.png), not a dome. ──
  const SKULL = [ring(0.075, 0.33, 0.25, 0.0), ring(0.15, 0.345, 0.225, 0.0), ring(0.20, 0.285, 0.145, 0.025),
    ring(0.232, 0.18, 0.09, 0.035)].flat();
  add('head', K.hull(SKULL), [0, 0, 0], 'skin', { name: 'skull' });
  add('head', K.box(0.52, 0.15, 0.18), [0, 0.0, -0.11], 'skin', { name: 'throatBack' });
  add('head', K.box(0.50, 0.04, 0.28), [0, 0.06, 0.08], 'dark', { name: 'mouthIn' });
  // permanent smile: dark band on the skull's FRONT only (r2: ends at x ±0.28, turned up, so no dark specks run
  // round the head rim at SE/SW/E/W — the r1 band reached the side edge and was the speckle source)
  const lip = [];
  for (const y of [0.066, 0.096]) {
    const R = ring(y, 0.345, 0.272, 0.0);
    lip.push(R[1], R[2], [0.285, y + 0.03, 0.17], [-0.285, y + 0.03, 0.17]);
  }
  add('head', K.hull(lip), [0, 0, 0.004], 'dark', { name: 'mouthLine' });
  // lower jaw: skin cheeks, wide cream throat on its front face (v1: the whole lower face front is pale); r2 throat
  // brought 0.03 forward so it shows under the head at the SE pack facing
  add('jaw', K.chamferBox(0.70, 0.12, 0.46, 0.3), [0, -0.05, 0.14], 'skin', { name: 'jaw' });
  add('jaw', K.chamferBox(0.42, 0.10, 0.10, 0.3), [0, -0.055, 0.33], 'cream', { name: 'throat' });
  add('jaw', K.box(0.48, 0.03, 0.30), [0, 0.0, 0.14], 'dark', { name: 'mouthFloor' });
  // eye bumps: PROUD round knobs on the crown's front corners (head bone + skin = same part id as the skull → no
  // junction line), base sunk 0.07 into the skull
  const bump = (cx, cy, cz, r) => K.hull([[0.95 * r, -0.13], [r, -0.05], [r, 0.0], [0.8 * r, 0.05], [0.4 * r, 0.085]]
    .flatMap(([rr, dy]) => [...Array(8)].map((_, k) => { const a = (22.5 + 45 * k) * Math.PI / 180;
      return [cx + rr * Math.cos(a), cy + dy, cz + rr * Math.sin(a)]; })));
  add('head', bump(BUMP[0], BUMP[1], BUMP[2], BUMP[3]), [0, 0, 0], 'skin', { name: 'eyeBumpL' });
  add('head', bump(-BUMP[0], BUMP[1], BUMP[2], BUMP[3]), [0, 0, 0], 'skin', { name: 'eyeBumpR' });
  // warts ("bumpy skin", v1 brief — what separates the toad from the frog): five small skin knobs on crown/cheeks;
  // their under-facets fall into the skin sh tone = a dark wart dot
  const wart = (x, y, z, r = 0.045) => K.hull([[x + r, y, z], [x - r, y, z], [x, y + r, z], [x, y - r * 0.6, z], [x, y, z + r], [x, y, z - r]]);
  for (const [i, w] of [[0.06, 0.24, -0.01], [-0.075, 0.236, -0.065], [0.255, 0.15, 0.17], [-0.29, 0.12, 0.12], [0.24, 0.17, -0.17]].entries())
    add('head', wart(...w), [0, 0, 0], 'skin', { name: `wart${i}` });
  // heavy-lidded golden eye: a short wide gold slot on the LOWER front of the bump (the bump above it is the lid),
  // horizontal dark pupil; faces forward tilted 24° up toward the 30° camera and yawed 14° outward (reads at E/W)
  const TILT = 24, eN = [0, Math.sin(TILT * Math.PI / 180), Math.cos(TILT * Math.PI / 180)];
  const tilt = (g) => K.xf(g, { rot: [-TILT, 14, 0] });
  const onN = (d, x = 0, y = 0) => [x, y + eN[1] * d, eN[2] * d];
  add('eyeL', tilt(K.box(0.14, 0.095, 0.04)), onN(0.0), 'brass', { name: 'eye', mirror: true });
  add('eyeL', tilt(K.box(0.075, 0.035, 0.03)), onN(0.018, 0, -0.008), 'dark', { name: 'pupil', mirror: true });

  // ── torso: one portly vest barrel (belly forward), cream shirt panel down the front, brass buttons, leather belt,
  // trousers. Strap from the LEFT shoulder across the chest to the RIGHT hip. ──
  const chestH = m.shoulderY - m.chestY + 0.03;
  add('chest', K.chamferBox(0.50, chestH, 0.38, 0.32), [0, chestH / 2 - 0.01, 0.01], 'vest', { name: 'vest' });
  add('chest', K.box(0.17, chestH - 0.02, 0.03), [0, chestH / 2 - 0.02, 0.195], 'cream', { name: 'shirt' });
  const waistH = (m.chestY - m.spineY) + 0.03;
  add('spine', K.chamferBox(0.52, waistH, 0.40, 0.3), [0, waistH / 2 - 0.005, 0.015], 'vest', { name: 'belly' });
  add('spine', K.box(0.20, waistH, 0.03), [0, waistH / 2 - 0.005, 0.21], 'cream', { name: 'shirtLow' });
  for (const s of [1, -1]) add('chest', K.box(0.05, 0.05, 0.03), [s * 0.125, chestH * 0.45, 0.2], 'brass', { name: `button${s > 0 ? 'A' : 'B'}` });
  const beltY = m.spineY - m.hipsY;
  add('hips', K.chamferBox(0.53, 0.065, 0.41, 0.3), [0, beltY, 0.015], 'leather', { name: 'belt' });
  add('hips', K.box(0.075, 0.06, 0.03), [0, beltY, 0.225], 'brass', { name: 'buckle' });
  add('hips', K.chamferBox(0.46, 0.10, 0.34, 0.3), [0, beltY - 0.07, 0.0], 'dark', { name: 'seat' });
  // strap: front band from the left shoulder down to the right hip, back band mirrored behind
  add('chest', K.xf(K.box(0.07, 0.40, 0.025), { rot: [0, 0, -48] }), [-0.02, chestH * 0.25, 0.205], 'leather', { name: 'strapF' });
  add('chest', K.xf(K.box(0.07, 0.40, 0.025), { rot: [0, 0, -48] }), [-0.02, chestH * 0.25, -0.185], 'leather', { name: 'strapB' });

  // ── arms: cream shirt sleeves, olive hands ──
  add('upperArmL', K.frustum(4, 0.078, 0.07, m.upperArm + 0.03), [0, -m.upperArm / 2 + 0.01, 0], 'cream', { name: 'sleeve', mirror: true });
  add('forearmL', K.frustum(4, 0.066, 0.062, m.forearm), [0, -m.forearm / 2, 0], 'cream', { name: 'forearm', mirror: true });
  add('handL', K.chamferBox(0.095, 0.09, 0.10, 0.35), [0, -0.03, 0.01], 'skin', { name: 'hand', mirror: true });

  // ── legs: dark trousers, chunky boots ──
  add('thighL', K.frustum(4, 0.085, 0.078, m.thigh + 0.03), [0, -m.thigh / 2 + 0.01, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.078, 0.082, m.shin), [0, -m.shin / 2, 0], 'dark', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.13, m.ankleY + 0.01, 0.20, 0.35), [0, -m.ankleY / 2, 0.04], 'dark', { name: 'boot', mirror: true });
  // r2: lighter leather toe caps so the stepping feet read against the shadow at 1x
  add('footL', K.chamferBox(0.136, 0.05, 0.065, 0.3), [0, -m.ankleY / 2 - 0.005, 0.115], 'leather', { name: 'toeCap', mirror: true });

  // ── satchel on the right hip (chain bagR0, hangs down): leather bag, darker flap via the leather sh side, brass clasp ──
  add('bagR0', K.chamferBox(0.11, 0.15, 0.22, 0.25), [-0.02, -0.085, 0.0], 'leather', { name: 'bag' });
  add('bagR0', K.box(0.035, 0.05, 0.05), [-0.08, -0.06, 0.03], 'brass', { name: 'clasp' });
  // scroll poking out of the back of the bag (own bone: hidden while it is in the hand)
  add('bagScrollR', K.prism(6, 0.04, 0.16), [0, 0.03, 0], 'cream', { name: 'bagScroll' });

  // ── the hand scroll (vote prop), authored tiny: a fat rolled bill 0.74 m long, dia 0.15 (r2) continuing PAST the fist (−Y = beyond the
  // hand at rest, so a raised arm holds it up), gripped near its lower end, leather tie near the top ──
  const k = SCROLL_K;
  add('scroll', K.xf(K.prism(6, 0.075, 0.74), { scale: [k, k, k] }), [0, -0.31 * k, 0], 'cream', { name: 'scrollRoll' });
  add('scroll', K.xf(K.prism(6, 0.088, 0.06), { scale: [k, k, k] }), [0, -0.56 * k, 0], 'leather', { name: 'scrollTie' });
  return P;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz grid) ──────────────────────────────────────────────────
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const SHOW_SCROLL = { 'scroll.s': [SCROLL_UP, SCROLL_UP, SCROLL_UP], 'bagScrollR.s': [-1, -1, -1] };
// idle: breath in chest + 1 texel of pos; head counter-rotates (constant world pitch), slow sleepy blink
const breathe = (d, c) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0],
  upperArmL: [2, 0, 6 + c], upperArmR: [2, 0, 6 + c], forearmL: [8, 0, 0], forearmR: [8, 0, 0] });

// (t2) point (the game's shared emote, pipgws EMOTE_POINT_MS ≈ 3.5 s): the game turns the avatar to the target, so he
// points forward-OUT with the free right hand (probe of 6 arms, shots/char-toad/t2/zz-probe-z.png: fwd 70 / out 50 hid
// behind the wide head at S/SE; fwd 60 / out 75 + chest −20 is a level cream stroke past the cheek at S and SE), left
// hand on the belly
const POINT = { pos: [0, 0.0, 0.02], spine: [-2, -8, 0], chest: [-4, -20, 0], head: [-8, 12, 0], ...EYES(0.1, 0.12), jaw: [6, 0, 0],
  upperArmR: [60, 0, 75], forearmR: [0, 0, 0], handR: [0, 0, 0], upperArmL: [24, 0, 22], forearmL: [84, 0, 0] };
// (ghost port) ghost pose i (0..3), POSE ONLY: spec.ghost draws the pale / spent ramps, the gold halo, the bind-height
// dissolve, the night self-glow and adds the 0.14 m hover with floating FK legs. Here: a whole-texel bob, chin up, arms
// drifting out, knees a little bent; spent = 1 texel lower, head bowed, eyes nearly shut, arms hanging, a head roll per key.
const GHOST_BOB = [0, 0.028, 0.056, 0.028];
function ghostPose(b, i, live) {
  const a = [0, 2, 4, 2][i];
  return { pos: [0, live ? b : b - 0.028, 0], spine: [-3, 0, 0], chest: [live ? -4 : 6, 0, 0], head: [live ? -6 : 7, 0, live ? 0 : [3, 0, -3, 0][i]],
    ...(live ? EYES(0, -0.2) : EYES(0, -0.6)),
    upperArmL: [8, 0, live ? 22 + a : 6], forearmL: [live ? 20 : 8, 0, 0], upperArmR: [8, 0, live ? 22 + a : 6], forearmR: [live ? 20 : 8, 0, 0],
    thighL: [16, 0, 4], shinL: [-26, 0, 0], footL: [28, 0, 0], thighR: [16, 0, 4], shinR: [-26, 0, 0], footR: [28, 0, 0] };
}

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0) }, { f: 30, pose: breathe(0.014, 2) }, { f: 36, pose: breathe(0.028, 4) },
    { f: 52, pose: { ...breathe(0.028, 4), ...BLINK } }, { f: 56, pose: breathe(0.028, 4) }, { f: 66, pose: breathe(0.014, 2) },
  ] },
  // talk (loop 24): the salesman's patter — head rolls toward the camera and back (≥ 25°), jaw open 28° + throat puffed
  // on alternating keys, the right hand presents (palm forward) on the open keys
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, 0.0, 0], chest: [-4, 8, 0], head: [-8, 6, 10], jaw: [28, 0, 0], 'jaw.s': [0.12, 0.2, 0.08],
      upperArmR: [40, 0, 30], forearmR: [70, 0, 0], handR: [-20, -40, 0], upperArmL: [4, 0, 8], forearmL: [10, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.028, 0], chest: [3, -2, 0], head: [2, -4, -12], jaw: [0, 0, 0],
      upperArmR: [14, 0, 14], forearmR: [30, 0, 0], upperArmL: [4, 0, 8], forearmL: [10, 0, 0] } },
    { f: 12, pose: { pos: [0, 0.0, 0], chest: [-4, -6, 0], head: [-8, -8, 10], jaw: [26, 0, 0], 'jaw.s': [0.12, 0.2, 0.08],
      upperArmR: [46, 0, 36], forearmR: [76, 0, 0], handR: [-20, -40, 0], upperArmL: [4, 0, 8], forearmL: [10, 0, 0] } },
    { f: 18, pose: { pos: [0, -0.028, 0], chest: [3, 2, 0], head: [2, 4, -12], jaw: [4, 0, 0],
      upperArmR: [14, 0, 14], forearmR: [30, 0, 0], upperArmL: [4, 0, 8], forearmL: [10, 0, 0] } },
  ] },
  // vote (r2): dip (hand to the satchel, 3 frames) → arm UP AND OUT beside the wide head (clears the head side at S)
  // holding the fat 0.6 m bill upright; eyes a touch wider (still a slot with a pupil, not a goggle ring), mouth open,
  // body up on its toes, HELD
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [6, -10, 0], head: [-6, 6, 0],
      upperArmR: [-20, 0, 18], forearmR: [30, 0, 0], upperArmL: [8, 0, 8] } },
    { f: 3, pose: { pos: [0, 0.03, 0], spine: [-3, 0, 4], chest: [-4, 0, 4], head: [-4, -6, -6], jaw: [14, 0, 0], ...EYES(0.08, 0.15),
      upperArmR: [-15, 0, 135], forearmR: [0, 0, 6], handR: [0, 0, 28], upperArmL: [10, 0, 14], forearmL: [20, 0, 0], ...SHOW_SCROLL } },
  ] },
  // die (gentle; no hurt, r2): totters, eyes drooping (6) → sits down heavily (6) → tips over BACKWARD (5) → lands on
  // his back (dust, soul wisp at the settle) → held: belly up, boots in the air, chin tucked so the face (eyes shut)
  // looks at the camera at S/SE/SW/W (r1 lay on his side with the head rolled away at 6/8 facings). Legs FK.
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 20: 'die' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-6, 10, -6], head: [-6, -10, 10], ...EYES(0, -0.5),
      upperArmR: [-10, 0, 30], forearmR: [20, 0, 0], upperArmL: [-10, 0, 30], forearmL: [20, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.15, -0.02], hips: [-10, 0, 0], spine: [8, 0, 0], chest: [6, 0, 0], head: [-4, 0, 0], ...EYES(0, -0.6),
      thighL: [75, 0, 14], shinL: [-100, 0, 0], footL: [20, 0, 0], thighR: [75, 0, 14], shinR: [-100, 0, 0], footR: [20, 0, 0],
      upperArmR: [10, 0, 26], forearmR: [30, 0, 0], upperArmL: [10, 0, 26], forearmL: [30, 0, 0] } },
    { f: 12, pose: { pos: [0, -0.22, -0.08], hips: [-42, 0, 4], spine: [6, 0, 0], chest: [6, 0, 0], head: [12, 6, 4], ...BLINK,
      thighL: [72, 0, 12], shinL: [-80, 0, 0], thighR: [66, 0, 16], shinR: [-86, 0, 0],
      upperArmR: [0, 0, 50], forearmR: [20, 0, 0], upperArmL: [0, 0, 46], forearmL: [20, 0, 0] } },
    { f: 17, pose: { pos: [0, -0.29, -0.18], hips: [-86, 0, 6], spine: [10, 0, 0], chest: [12, 0, 0], head: [28, 10, 8], ...BLINK,
      thighL: [60, 0, 14], shinL: [-30, 0, 0], thighR: [50, 0, 20], shinR: [-40, 0, 0],
      upperArmR: [0, 0, 80], forearmR: [20, 0, 0], upperArmL: [10, 0, 72], forearmL: [30, 0, 0] } },
    { f: 20, pose: { pos: [0, -0.27, -0.18], hips: [-82, 0, 6], spine: [14, 0, 0], chest: [16, 0, 0], head: [34, 12, 8], ...BLINK,
      thighL: [54, 0, 14], shinL: [-36, 0, 0], thighR: [44, 0, 20], shinR: [-46, 0, 0],
      upperArmR: [0, 0, 74], forearmR: [26, 0, 0], upperArmL: [10, 0, 64], forearmL: [36, 0, 0] } },
    { f: 24, pose: { pos: [0, -0.27, -0.18], hips: [-82, 0, 6], spine: [14, 0, 0], chest: [16, 0, 0], head: [34, 12, 8], ...BLINK,
      thighL: [50, 0, 14], shinL: [-40, 0, 0], thighR: [40, 0, 20], shinR: [-50, 0, 0],
      upperArmR: [0, 0, 70], forearmR: [30, 0, 0], upperArmL: [10, 0, 60], forearmL: [40, 0, 0] } },
  ] },
  // excuse (emote, "finer excuses", r2): wind-up, hands together (5) → the big SHRUG: palms out and up, shoulders up,
  // head level (10) → PUNCHLINE, a different drawing: body dips and twists, head turns toward the viewer, the RIGHT hand
  // goes up beside the head palm out ("upon my honour!"), the left hand pats the belly, wide grin, near eye WINKS; the sweat drop fires ON this key (12)
  // → half shrug, eye open (6) → idle
  excuse: { fps: 30, loop: false, interp: 'step', events: { 15: 'emote:drop@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [6, 0, 0], head: [-2, 0, 0],
      upperArmL: [30, 0, 12], forearmL: [70, 0, 0], upperArmR: [30, 0, 12], forearmR: [70, 0, 0] } },
    { f: 5, pose: { pos: [0, 0.025, 0], spine: [-3, 0, 0], chest: [-6, 0, 0], head: [-2, 0, 8], jaw: [10, 0, 0],
      upperArmL: [-5, 0, 56], forearmL: [30, 0, 0], handL: [0, 70, 0], upperArmR: [-5, 0, 56], forearmR: [30, 0, 0], handR: [0, 70, 0] } },
    { f: 15, pose: { pos: [0, -0.035, 0], spine: [6, -10, 4], chest: [6, -14, 6], head: [-3, -18, 10], jaw: [20, 0, 0], 'jaw.s': [0.1, 0.1, 0.05],
      'eyeR.s': [0.1, -0.85, 0], 'eyeL.s': [0.12, 0.1, 0],
      upperArmR: [-10, 0, 116], forearmR: [24, 0, 0], handR: [0, -60, 0], upperArmL: [24, 0, 22], forearmL: [84, 0, 0], handL: [0, 0, 0] } },
    { f: 27, pose: { pos: [0, 0.0, 0], spine: [-2, 4, 0], chest: [-3, 6, 0], head: [-2, 6, 4], jaw: [6, 0, 0],
      upperArmL: [-2, 0, 30], forearmL: [24, 0, 0], handL: [0, 40, 0], upperArmR: [10, 0, 30], forearmR: [30, 0, 0] } },
    { f: 33, pose: breathe(0, 0) },
  ] },
  // (t2) point: wind-up (4, hand drawn back to the chest) → POINT out at shoulder height, eyes a touch wider, mouth
  // open "you, sir!" (12) → emphasis beat (body 1 texel forward, mouth shut, 8) → held point (60) → idle
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [4, 10, 0], head: [-4, 6, 0], upperArmR: [20, 0, 20], forearmR: [80, 0, 0], upperArmL: [8, 0, 8], forearmL: [10, 0, 0] } },
    { f: 4, pose: { ...POINT, jaw: [20, 0, 0], 'jaw.s': [0.08, 0.1, 0.04] } },
    { f: 16, pose: { ...POINT, pos: [0, -0.01, 0.04], chest: [-2, -27, 0], head: [-10, 16, 0], upperArmR: [56, 0, 80] } },
    { f: 24, pose: POINT },
    { f: 84, pose: breathe(0, 0) },
  ] },
  // ghost (loop 72; ghost port: spec.ghost draws the pale ramp, the gold halo over the eye bumps, the hover and the
  // floating legs): the dead merchant hovers chin up, arms drifting out, eyes half-lidded; a 2-texel float bob in 4 held
  // drawings (18 frames each)
  ghost: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: ghostPose(GHOST_BOB[i], i, true) })) },
  // ghost-spent (loop 72): dimmer + greyer (module spent ramp), NO halo (vote used), 1 texel lower, head bowed, eyes
  // nearly shut, a lazier 1-texel bob
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: ghostPose([0, 0.028, 0.028, 0][i], i, false) })) },
};

// vote / die end on a HELD pose (clip.hold): repeat the last key later so the clip length covers the FX tail
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  return {
    name: 'toad',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['skin', 'cream'],
    faceSlot: 'skin',
    bodyPlan: 'uprightAnimal',
    heightPx: [34, 44],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'waddle' },
    emote: 'excuse',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0, 0.42, 0.04] } },
    chains: [{ name: 'bag', bones: ['bagR0'], f: 3.5, zeta: 0.6, r: 0, gravity: 0.5, drag: 0.8, limit: 20, falloff: 1 }],
    personality: { body: { f: 3, zeta: 0.6, r: -0.5 }, head: { f: 3, zeta: 0.7, r: 0 } },
    locomotion: { plan: 'biped', style: 'bird', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.25, 0.2], roll: [10, 8], headBob: [8, 6], lean: [6, 12], lift: [0.06, 0.08], surge: false },
    character: { quant: { yaw: 8, chain: 4 } },
    // (ghost port) the shared ghost look (was the t2 ghostFlag/halo bones + material.tones shader): pale ramp, gold halo
    // over the eye bumps (level 1), dimmer spent ramp, bind-height dissolve, night self-glow, 0.14 m hover with floating
    // FK legs; also shades the WALK when a dead player walks (ch.ghost = 1). keepHue 0.25: dark olive character;
    // lo 0 / slope 1.6 lift the dark olive up the pale ramp (defaults left a grey-olive live ghost and a dark slate spent
    // one); spent light end #B0BACE (preservation)
    // halo lift 0.2: at 0.12 the ring rested on the far eye bump (pack-r1-clip-ghost.png)
    ghost: { hover: 0.14, keepHue: 0.25, lo: 0, slope: 1.6, spent: ['#3A4260', '#B0BACE'], halo: { lift: 0.2 } },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', handL: 'mid', handR: 'mid' } },
  };
}

export default make();
