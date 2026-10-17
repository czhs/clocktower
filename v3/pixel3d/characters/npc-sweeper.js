// Sweeper (char-npc-sweeper) — cast member "npc-sweeper" (NPC, no blurb): "a plain, muted townsperson with short grey
// hair, a slate tunic and a straw broom. Deliberately boring so it never competes with the players' characters."
// Design sheet (Unique to me, timing charts, self-critique): characters/npc-sweeper.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/npc-sweeper.ts + refs/cast/npc-sweeper.png.
// Body plan: small townsperson on chibi() (2.7 heads, flat face, legs 0.8), bodyPlan 'biped'. The straw BROOM rides the
// LEFT hand (bone `broom`, keyed in every clip — a stiff wooden prop, no spring). LegGait 'biped' scurry at the v2 game
// speed (3.95 H/s, 4 drawings, plant 'hold', swingFloor 'gait'); the authored walk alternates the broom fan swept OUT to
// his left and pushed ACROSS ahead of his feet on every drawing pair (v1: "sweep = step").
// r8 (critic fixes): the broom bone sits IN the hand and pivots on the stick (it stays gripped in every pose), the grip is
// 1/3 down the stick (fan on the ground at rest), eyes on the face bevel (profile eye at E/W), cooler hair, vote / point /
// die / walk / sweep re-posed and checked in 8-facing stills (shots/char-npc-sweeper/r8/).
// Structure: palette → skeleton → parts → clips → spec.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.08;                       // castHeight(27): ground → top of the hair
export const V_GAME = 3.95 * H;              // 4.27 m/s
const deg = Math.PI / 180;

// [hi, mid, sh] sRGB. 5 slots + 1 accent (straw). v1 hexes kept as mids; only sh lifted for the night rule.
export const PALETTE = {
  hair: ['#888AA2', '#66667C', '#46425C'],    // signature 1: the grey bob cap (v1 #6C6870; r8 a cooler blue-grey so golden hour does not turn it tan)
  tunic: ['#7A808A', '#5A5E66', '#424656'],   // slate tunic + sleeves (v1 #5A5E66)
  skin: ['#C89E78', '#A58060', '#7A5A4E'],    // face, forearms (rolled sleeves), hands (v1 #A58060)
  dark: ['#4C4246', '#3E3436', '#3A3040'],    // trousers, shoes, eyes, mouth (v1 #3A3430 / #2A201C, lifted: no black)
  wood: ['#8C7456', '#6A5640', '#4E4038'],    // broom stick, belt, bristle band (v1 #6A5640 / #5E4C38 / #4E4038)
  straw: ['#C8B488', '#9A8765', '#6E6050'],   // accent / signature 2: the bristle fan (v1 mix(#A89060, #7A7270, 0.3))
};

// head-local face anchors (head joint = chin); r8: eyes sit ON the front/side bevel (x 0.1, 0.045 deep) so the near eye
// shows on the profile at E/W (the side hair is cut back behind the cheek)
export const FACE = { eye: [0.1, 0.135, 0.145], mouth: [0, 0.07, 0.12] };
// broom geometry (broom-local = hand frame at rest = character axes, grip at y 0): stick top → band → fan bottom
export const BROOM = { top: [0.0, 0.32, -0.05], band: [0.07, -0.32, 0.24], foot: -0.52, fanW: [0.11, 0.25], fanD: [0.09, 0.15] };
// r8: the bone pivots ON the stick at grip height (the stick crosses broom-local y 0 at PIV), so every broom rotation keeps
// the stick in the hand (r7 pivoted 0.2 m behind the stick: the vote broom floated free of the hand)
const PIV = (() => { const t = BROOM.top[1] / (BROOM.top[1] - BROOM.band[1]);
  return [0, 2].map((i) => BROOM.top[i] + t * (BROOM.band[i] - BROOM.top[i])); })();
export const BROOM_PIV = [PIV[0], 0, PIV[1]];
const sub = (a) => [a[0] - BROOM_PIV[0], a[1], a[2] - BROOM_PIV[2]];

export function skeleton() {
  const S0 = chibi({ height: H, heads: 2.7, legs: 0.8, arms: 0.95, shoulders: 0.42, snout: 0, ears: false, tail: false, jaw: false,
    face: { eye: FACE.eye, brow: false, mouth: FACE.mouth } });
  const S = S0.map((b) => ({ ...b }));
  S.push({ name: 'broom', parent: 'handL', pos: [0, -0.035, 0], axis: 'down' });   // r8: the grip IS the hand
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

// helpers
const ring = (n, r, y, z, clampZ = 9) => Array.from({ length: n }, (_, i) => {
  const a = (i + 0.5) * 2 * Math.PI / n;
  return [r * Math.sin(a), y, Math.min(z + r * Math.cos(a), clampZ)];
});
const rod = (a, b, r) => {   // square rod from a to b (≈ 2r thick), as a hull
  const pts = [];
  for (const p of [a, b]) for (const [dx, dz] of [[-r, -r], [r, -r], [r, r], [-r, r]]) pts.push([p[0] + dx, p[1], p[2] + dz]);
  return K.hull(pts);
};
const segRot = (d) => {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d).normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z].map((r) => r / deg);
};

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (head joint = chin): skin block, bob hair cap as ONE hull (front clipped below the fringe so the face shows)
  add('head', K.chamferBox(0.31, 0.25, 0.29, 0.25), [0, 0.115, 0.005], 'skin', { name: 'face' });
  const HAIR = [[0.19, 0.05, -0.03, -0.12], [0.215, 0.14, -0.02, -0.1], [0.226, 0.21, -0.012, -0.04], [0.228, 0.265, -0.01, 0.2], [0.218, 0.32, -0.01, 9],
    [0.17, 0.39, -0.02, 9], [0.08, 0.425, -0.03, 9]];
  add('head', K.hull(HAIR.flatMap(([r, y, z, c]) => ring(8, r, y, z, c))), [0, 0, 0], 'hair', { name: 'hair' });
  add('eyeL', K.box(0.055, 0.068, 0.045), [0, 0, 0], 'dark', { name: 'eye', mirror: true });
  add('mouth', K.box(0.075, 0.05, 0.04), [0, 0, 0], 'dark', { name: 'mouthIn' });
  add('neck', K.box(0.12, 0.08, 0.12), [0, 0.02, 0], 'skin', { name: 'neck' });

  // ── torso: slate tunic (chest, waist, flared hem skirt over the thigh roots), brown belt
  const chestH = m.shoulderY - m.chestY + 0.06;
  add('chest', K.chamferBox(0.36, chestH, 0.25, 0.3), [0, chestH / 2 - 0.02, 0], 'tunic', { name: 'tunic' });
  const waistH = m.chestY - m.spineY + 0.02;
  add('spine', K.chamferBox(0.33, waistH, 0.23, 0.3), [0, waistH / 2, 0], 'tunic', { name: 'tunic' });
  add('spine', K.frustum(8, 0.19, 0.19, 0.04, { sz: 0.74 }), [0, 0.0, 0], 'wood', { name: 'belt' });
  add('hips', K.frustum(8, 0.215, 0.19, 0.11, { sz: 0.75 }), [0, m.spineY - m.hipsY - 0.07, 0], 'tunic', { name: 'hem' });

  // ── arms: tunic sleeve (upper), rolled-up skin forearm, skin hand
  add('upperArmL', K.frustum(4, 0.066, 0.07, m.upperArm + 0.02), [0, -m.upperArm / 2 + 0.005, 0], 'tunic', { name: 'sleeve', mirror: true });
  add('forearmL', K.frustum(4, 0.05, 0.054, m.forearm), [0, -m.forearm / 2, 0], 'skin', { name: 'forearm', mirror: true });
  add('handL', K.chamferBox(0.08, 0.08, 0.085, 0.35), [0, -0.03, 0], 'skin', { name: 'hand', mirror: true });

  // ── legs: dark trousers, shoes
  add('thighL', K.frustum(4, 0.072, 0.066, m.thigh + 0.03), [0, -m.thigh / 2 + 0.01, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.062, 0.062, m.shin), [0, -m.shin / 2, 0], 'dark', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.1, m.ankleY + 0.035, 0.16, 0.35), [0, -m.ankleY / 2 + 0.015, 0.035], 'dark', { name: 'shoe', mirror: true });

  // ── the BROOM (bone `broom` on the left hand): wood stick, dark band, straw fan (≥ 3 texels deep: never a blade at E/W)
  const B = BROOM;
  add('broom', rod(sub(B.top), sub(B.band), 0.03), [0, 0, 0], 'wood', { name: 'stick' });
  const fy0 = B.band[1], fy1 = B.foot, fc = [B.band[0] + 0.02 - BROOM_PIV[0], B.band[2] + 0.015 - BROOM_PIV[2]];
  const fan = [];
  for (const [y, w, d] of [[fy0, B.fanW[0], B.fanD[0]], [fy1, B.fanW[1], B.fanD[1]]])
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) fan.push([fc[0] + sx * w / 2, y, fc[1] + sz * d / 2]);
  add('broom', K.hull(fan), [0, 0, 0], 'straw', { name: 'bristles' });
  add('broom', K.box(B.fanW[0] + 0.03, 0.04, B.fanD[0] + 0.03), [fc[0], fy0 + 0.005, fc[1]], 'wood', { name: 'band' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────────
const EYES = (sy) => ({ 'eyeL.s': [0, sy, 0], 'eyeR.s': [0, sy, 0] });
const BLINK = EYES(-0.8), HALF = EYES(-0.45), WIDE = EYES(0.3);
// closed eyes (die): a flat 3×1 lid dash, wider than the open 2×2 eye — a scaled 2×2 box read as an open dot eye (r7)
const SHUT = { 'eyeL.s': [0.6, -0.7, 0], 'eyeR.s': [0.6, -0.7, 0] };
const OPEN = { 'mouth.p': [0, -0.01, 0.045] };
// standing carry: the left arm a little out-forward so the broom stands clear of the body at 6/8 facings (probe p3/o2)
const CARRY = { upperArmL: [12, 0, 28], forearmL: [6, 0, 0], broom: [10, 0, 4] };
const breath = (d, extra = {}) => ({ ...CARRY, pos: [0, -0.028 * d, 0], chest: [3 * d, 0, 0], head: [-3 * d, 0, 0], ...extra });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
// the broom pushed ahead (walk/run): k = +1 OUT (fan swept out to his left, behind the hand) ↔ k = −1 ACROSS (fan pushed
// ahead of his feet, crossing the body line); a small chest twist with it (r8 probe: shots/char-npc-sweeper/r8/walk2.png)
const lerp3 = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * (1 - k) / 2));
const PUSH = (k, tw = 6) => ({ upperArmL: lerp3([38, 0, 8], [30, 0, 0], k), forearmL: [10, 0, 0], broom: lerp3([-22, 0, 28], [20, 0, -20], k),
  chest: [4, Math.sign(k) * tw, 0], head: [-4, -Math.sign(k) * tw, 0] });
// sweep strokes (emote): leaning in over the broom, the fan swept out to his left (s = 1) ↔ pushed across in front of
// his feet (s = −1) — the walk's two broom poses, bigger, with a forward lean (r8: the across stroke crosses the body line)
function SWEEP(s) {
  return { pos: [0, -0.03, 0], spine: [12, 0, 0], chest: [4, 10 * s, 0], head: [-12, -4 * s, 0], ...HALF,
    ...(s > 0 ? { upperArmL: [34, 0, 14], forearmL: [14, 0, 0], broom: [-24, 0, 34] } : { upperArmL: [34, 0, -4], forearmL: [14, 0, 0], broom: [14, 0, -36] }),
    upperArmR: [-10, 0, 14 * s + 10] };
}
// dead: on his back, rolled diagonal (reads "down" at 8/8, the shut-eyed face up at S/SE/SW), knees up, the left arm
// flung out with the broom lying flat beside him (probed: p1/d1, p1/b1)
function DEAD() {
  return { pos: [0, -0.27, -0.1], hips: [-80, 20, -40], spine: [2, 0, 0], chest: [2, 0, 0], head: [-6, 0, 0], ...SHUT,
    thighL: [40, 0, 0], shinL: [-60, 0, 0], thighR: [20, 0, 0], shinR: [-30, 0, 0],
    upperArmL: [0, 0, 30], broom: [0, 0, -20], upperArmR: [0, 0, 12], forearmR: [10, 0, 0] };
}

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, BLINK) },
    { f: 38, pose: breath(1) },
    { f: 56, pose: breath(0, { head: [2, -18, -6] }) },
    { f: 66, pose: breath(0) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: PUSH(1) }, { f: 1, pose: PUSH(0.2, 0) }, { f: 2, pose: PUSH(-1) }, { f: 3, pose: PUSH(-0.2, 0) },
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: { ...PUSH(0.7), spine: [6, 0, 0] } }, { f: 1, pose: { ...PUSH(0.1, 0), spine: [6, 0, 0] } },
    { f: 2, pose: { ...PUSH(-0.7), spine: [6, 0, 0] } }, { f: 3, pose: { ...PUSH(-0.1, 0), spine: [6, 0, 0] } },
  ] },
  // talk (loop 32, beats every 8): the RIGHT hand (near side at SE) opens out at chest height ↔ flings out to the side,
  // head rolls toward the camera with the mouth open on the beats; the broom stays planted
  talk: { fps: 30, loop: true, interp: 'step', length: 32, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { ...CARRY, chest: [-3, -8, 0], head: [-6, -12, -10], ...OPEN, upperArmR: [100, 0, 60], forearmR: [40, 0, 0], 'upperArmR.l': [0.6] } },
    { f: 8, pose: { ...CARRY, pos: [0, -0.028, 0], chest: [2, 0, 0], head: [2, 0, 0], upperArmR: [14, 0, 10], forearmR: [40, 0, 0] } },
    { f: 16, pose: { ...CARRY, chest: [-3, 6, 0], head: [-6, -16, 8], ...OPEN, upperArmR: [40, 0, 110], forearmR: [20, 0, 0], 'upperArmR.l': [0.6] } },
    { f: 24, pose: { ...CARRY, pos: [0, -0.028, 0], chest: [2, 0, 0], head: [2, -4, 0], ...HALF, upperArmR: [14, 0, 10], forearmR: [40, 0, 0] } },
  ] },
  // vote: dip, then the broom thrust straight up, bristles over the hair (grip slid to the stick end), eyes wide; HELD
  vote: { fps: 30, loop: false, interp: 'step', length: 31, events: { 4: 'vote@fan' }, keys: [
    { f: 0, pose: { pos: [0, -0.04, 0], spine: [6, 0, 0], head: [-4, 0, 0], ...BLINK, upperArmL: [-6, 0, 24], broom: [6, 0, 6] } },
    { f: 4, pose: { pos: [0, 0.02, 0], spine: [-3, 0, 6], chest: [-3, 0, 6], head: [-6, 0, -6], ...WIDE,
      upperArmL: [172, 0, 6], forearmL: [-6, 0, 0], 'upperArmL.l': [0.9], 'forearmL.l': [0.8], broom: [8, 40, -14] } },
  ] },
  point: { fps: 30, loop: false, interp: 'step', length: 40, keys: [
    { f: 0, pose: { ...CARRY, pos: [0, -0.03, 0], chest: [3, -8, 0], head: [-2, -4, 0], ...HALF, upperArmR: [20, 0, 10], forearmR: [70, 0, 0] } },
    { f: 4, pose: { pos: [0, 0.01, 0], chest: [-3, 14, 0], head: [-6, -10, 0], ...WIDE,
      upperArmR: [76, 0, 40], 'upperArmR.l': [0.6], 'forearmR.l': [0.45], upperArmL: [30, 0, 12], forearmL: [10, 0, 0], broom: [40, 0, -24] } },
    { f: 30, pose: { pos: [0, 0, 0], chest: [-2, 10, 0], head: [-4, -6, 0], upperArmR: [60, 0, 15], forearmR: [40, 0, 0], ...CARRY } },
    { f: 36, pose: breath(0) },
  ] },
  // die (gentle, no hurt): a sway with drooping lids → knees give (6) → sits back (6) → lies back on the grass (HELD)
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', length: 61, events: { 18: ['die', 'land'] }, keys: [
    { f: 0, pose: { ...CARRY, chest: [-4, 0, 8], head: [-6, 0, 12], ...HALF } },
    { f: 6, pose: { pos: [0, -0.12, 0], spine: [12, 0, 0], chest: [10, 0, 0], head: [8, 0, 0], ...SHUT, ...KNEES(55), upperArmL: [10, 0, 24], broom: [10, 0, 14], upperArmR: [10, 0, 10] } },
    { f: 12, pose: { pos: [0, -0.22, -0.05], hips: [-40, 10, -20], spine: [10, 0, 0], chest: [8, 0, 0], head: [16, 0, 0], ...SHUT,
      thighL: [70, 0, 0], shinL: [-90, 0, 0], thighR: [60, 0, 0], shinR: [-80, 0, 0], upperArmL: [0, 0, 40], broom: [0, 0, 0], upperArmR: [0, 0, 20] } },
    { f: 18, pose: DEAD() },
  ] },
  // sweep (emote — his job): broom lifted (6) → stroke out to his left (6, dust) → across his feet (6, dust) → out (6,
  // dust) → across (6) → straightens, wipes his brow with the right hand, a sweat drop (16) → idle
  sweep: { fps: 30, loop: false, interp: 'step', length: 50, events: { 6: 'poof@fan', 12: 'poof@fan', 18: 'poof@fan', 24: 'poof@fan', 30: 'emote:drop@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], spine: [6, 0, 0], chest: [2, -6, 0], head: [-10, 4, 0], upperArmL: [20, 0, 20], forearmL: [10, 0, 0], broom: [-30, 0, 30] } },
    { f: 6, pose: SWEEP(1) },
    { f: 12, pose: SWEEP(-1) },
    { f: 18, pose: SWEEP(1) },
    { f: 24, pose: SWEEP(-1) },
    { f: 30, pose: { pos: [0, 0.01, 0], spine: [-4, 0, 0], chest: [-6, 6, 0], head: [-8, 8, -8], ...HALF, ...OPEN,
      upperArmR: [95, 0, 30], forearmR: [120, 0, 0], ...CARRY } },
    { f: 46, pose: breath(0) },
  ] },
};
const ghostKey = (i, spent) => ({ pos: [0, spent ? [-0.02, -0.035, -0.05, -0.035][i] : [0.03, 0.015, 0, 0.015][i], 0],
  ...(spent ? { spine: [6, 0, 0], chest: [6, 0, 0], head: [14, 0, [3, 0, -3, 0][i]], ...HALF } : { head: [-4, 0, [4, 0, -4, 0][i]] }),
  ...CARRY, upperArmR: [16, 0, 14], forearmR: [30, 0, 0], ...KNEES(18) });
CLIPS.ghost = { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 16, pose: ghostKey(i, false) })) };
CLIPS['ghost-spent'] = { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 16, pose: ghostKey(i, true) })) };

export function make() {
  const S = skeleton();
  return {
    name: 'npc-sweeper',
    height: H,
    palette: PALETTE,
    signature: [{ part: 'hair' }, { part: 'bristles' }],
    faceSlot: 'skin',
    bodyPlan: 'biped',
    heightPx: [34, 46],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'sweep',
    skeleton: S,
    parts: parts(S),
    sockets: { ...(S.sockets || {}), crown: { bone: 'head', at: [0.22, 0.5, 0] }, fan: { bone: 'broom', at: [BROOM.band[0] + 0.02 - BROOM_PIV[0], BROOM.foot + 0.03, BROOM.band[2] + 0.015 - BROOM_PIV[2]] } },
    chains: [],
    personality: { body: { f: 2.5, zeta: 0.8, r: 0 }, head: { f: 2.5, zeta: 0.85, r: 0 } },
    locomotion: { plan: 'biped', plant: 'hold', swingFloor: 'gait', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.2, 0.12], reach: 0.6, arms: [24, 30], elbows: [20, 30], bob: [0.04, 0.06], lean: [5, 10], lift: [0.05, 0.07], twist: [5, 7] },
    character: { quant: { yaw: 8, chain: 4 } },
    ghost: { hover: 0.14 },
    clips: CLIPS,
    fx: { stepClips: ['walk'], stepEvery: 2, speech: { node: 'crown' }, sockets: { fan: { length: 0 } }, vote: { node: 'fan' }, poof: { n: 5, speed: 0.6, radius: 0.12 } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', mouth: 'mid', broom: 'mid' }, merge: { neck: 'head' } },
  };
}

export default make();
