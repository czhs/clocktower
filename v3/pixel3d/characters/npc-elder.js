// Elder (char-npc-elder) — cast member "npc-elder" (NPC, no blurb): "bald with a white fringe, fair skin, a long dark
// slate robe, a little stooped, leaning on a plain wooden cane. Deliberately boring so it never competes with the
// players." Design sheet (Unique to me, timing charts, self-critique): characters/npc-elder.md. Identity source (read
// only): pipgws/packages/assets/scripts/cast/npc-elder.ts + refs/cast/npc-elder.png.
// Body plan: plain townsfolk on the chibi skeleton (chibi(), 2.7 heads, `bodyPlan 'biped'`), the STOOP built into the
// rest geometry (neck + head joints forward, a hump on the back of the upper robe). Long slate robe on bone `robe` (pivot
// at the belt) with a hem sole disc; brown shoes flick out of the hem on the steps. Prop: a plain wooden CANE with a
// crook in the LEFT hand (bone `cane`, kept plumb by cancelling the arm). Everything secondary is KEYED (no springs).
// Gait: LegGait 'biped', plant 'hold', swingFloor 'gait', 4 drawings / 0.3 s at the v2 game speed (V = 3.95·1.05 =
// 4.15 m/s): a HOBBLE — stooped scurry, the cane planted ahead on the right-foot contact, robe sway, head nod on the bob.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.05;                        // castHeight(25): the smallest cast member
export const V_GAME = 3.95 * H;               // 4.15 m/s
const deg = Math.PI / 180;

// [hi, mid, sh] sRGB: 5 slots (eye = the dark accent)
export const PALETTE = {
  skin: ['#F2D4B4', '#D8B494', '#A87E70'],    // bald dome, face, hands, ears, nose (v1 #D8B494 / shade #A78A7C)
  fringe: ['#EEEAF0', '#C6C0CA', '#8E8698'],  // white-grey fringe + bushy brows (v1 #AEAAB0, lifted toward white)
  robe: ['#6C6E82', '#4A4C58', '#3A3848'],    // long slate robe + sleeves (v1 #4A4C58 / #3E3D4F; sh ≥ #3A3040)
  wood: ['#A07A58', '#6A5038', '#4A362E'],    // cane, belt, shoes (v1 WOOD #6A5038, belt #5A4A3A)
  eye: ['#4A4258', '#2E2838', '#2A2234'],     // eyes, mouth interior, shins (v1 near-black, lifted)
};

// arm segment rest directions [out°, fwd°] (L side convention; R mirrored): L = cane arm (out + forward, hand at the hip),
// R = free arm hanging slightly forward
const ARM = { L: { up: [32, 10], fore: [18, 55] }, R: { up: [14, 6], fore: [8, 28] } };
const armDir = ([o, f]) => { const O = o * deg, F = f * deg; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
// stoop: the neck joint sits forward of the chest, the head a little further (rest geometry, every clip inherits it)
const STOOP = { neckZ: 0.06, headZ: 0.04, neckDy: -0.025 };
// face (head-local, chin = 0)
export const FACE = { eye: [0.094, 0.185, 0.152], brow: 0.074, mouth: [0, 0.085, 0.150], eyeYaw: 30 };
// cane (handL-local grip → down to the tip; crook above the grip)
// rest tilt (Euler XYZ, deg): tip FORWARD (−x rot) so the cane stands ahead of the hem at E, tip OUT (+z rot) clear of it
const CANE = { below: 0.4, above: 0.07, r: 0.032, rot: [-16, 0, 7] };
const CANE_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...CANE.rot.map((r) => r * deg)));
const caneP = (y, z = 0) => new THREE.Vector3(0, y, z).applyQuaternion(CANE_Q).toArray().map((v) => +v.toFixed(5));

export function skeleton() {
  const S0 = chibi({ height: 1.08, heads: 2.7, legs: 0.85, arms: 0.95, snout: 0, ears: false, tail: false, jaw: false,
    face: { eye: FACE.eye, brow: FACE.brow, mouth: FACE.mouth } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM[s].up], [`hand${s}`, ARM[s].fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  const neck = S.find((b) => b.name === 'neck'); neck.pos = [0, neck.pos[1] + STOOP.neckDy, STOOP.neckZ];
  const head = S.find((b) => b.name === 'head'); head.pos = [0, head.pos[1], STOOP.headZ];
  S.push({ name: 'robe', parent: 'hips', pos: [0, 0.04, 0], axis: 'down' });            // lower robe, pivot at the belt
  S.push({ name: 'cane', parent: 'handL', pos: [0, -0.03, 0.005], axis: 'up' });        // cane grip (left hand)
  S.push({ name: 'shoeL', parent: 'footL', pos: [0, 0, 0], axis: 'fwd' });
  S.push({ name: 'shoeR', parent: 'footR', pos: [0, 0, 0], axis: 'fwd' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

// ── geometry helpers ─────────────────────────────────────────────────────────────────────────────────────────────
const ring = (n, r, y, z, sz = 1, sx = 1) => Array.from({ length: n }, (_, i) => {
  const a = (i + 0.5) * 2 * Math.PI / n;
  return [r * sx * Math.sin(a), y, z + r * Math.cos(a) * sz];
});
function subdivide(geo, maxEdge) {
  const p = geo.attributes.position.array, out = [];
  const rec = (a, b, c, d) => {
    const e = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const lab = e(a, b), lbc = e(b, c), lca = e(c, a), m = Math.max(lab, lbc, lca);
    if (m <= maxEdge || d > 9) { out.push(...a, ...b, ...c); return; }
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    if (m === lab) { const q = mid(a, b); rec(a, q, c, d + 1); rec(q, b, c, d + 1); }
    else if (m === lbc) { const q = mid(b, c); rec(a, b, q, d + 1); rec(a, q, c, d + 1); }
    else { const q = mid(c, a); rec(a, b, q, d + 1); rec(q, b, c, d + 1); }
  };
  for (let i = 0; i < p.length; i += 9) rec([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], 0);
  return out;
}
function splitBy(arr, classify) {
  const groups = {};
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    (groups[classify(c)] ||= []).push(...arr.slice(i, i + 9));
  }
  const out = {};
  for (const [k, a] of Object.entries(groups)) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); out[k] = K.flat(g);
  }
  return out;
}
function latheAbs(profile, n, opts) {
  const g = K.lathe(profile, n, opts);
  g.computeBoundingBox();
  const y0 = Math.min(...profile.map((p) => p[1]));
  return g.translate(0, y0 - g.boundingBox.min.y, 0);
}
const az = (c) => Math.atan2(c[0], c[2]) / deg;            // 0 = front, + = character's left
const restWorld = (S) => {
  const W = {}, by = Object.fromEntries(S.map((b) => [b.name, b]));
  const get = (n) => W[n] || (W[n] = (() => { const b = by[n], p = b.parent ? get(b.parent) : [0, 0, 0]; return [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]; })());
  for (const b of S) get(b.name);
  return W;
};

// robe radius profile (world y): hem 0.25 at 0.07 → 0.175 at the belt
const HEM_Y = 0.07, HEM_R = 0.25, BELT_Y = 0.445;
const robeR = (y) => HEM_R + (0.178 - HEM_R) * Math.min(1, Math.max(0, (y - HEM_Y) / (BELT_Y - HEM_Y)) ** 0.8);

export function parts(S) {
  const m = S.meta, W = restWorld(S);
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── HEAD (head-local, chin = 0): 16-sided bald dome; the white fringe band (sides + back, below the crown) is cut out
  // of the same surface (no proud shell → no inner-line ring); nose, ears, eyes, brows, mouth plate
  const HEAD = [[0.12, 0.0], [0.168, 0.05], [0.19, 0.13], [0.195, 0.21], [0.182, 0.29], [0.14, 0.36], [0.075, 0.395], [0, 0.405]];
  const hg = splitBy(subdivide(latheAbs(HEAD, 16, { sz: 0.94 }), 0.03), (c) => {
    const a = Math.abs(az(c)), y = c[1];
    if (y > 0.055 && y < 0.25 && a > 66) return 'fringe';
    if (y >= 0.25 && y < 0.3 && a > 120) return 'fringe';
    return 'skin';
  });
  add('head', hg.skin, [0, 0, 0], 'skin', { name: 'skull' });
  add('head', hg.fringe, [0, 0, 0], 'fringe', { name: 'fringe' });
  add('head', K.chamferBox(0.07, 0.08, 0.09, 0.35), [0, 0.13, 0.205], 'skin', { name: 'nose' });
  add('head', K.chamferBox(0.04, 0.085, 0.07, 0.3), [0.19, 0.17, -0.01], 'skin', { name: 'earL', mirror: true });
  add('eyeL', K.xf(K.box(0.062, 0.072, 0.03), { rot: [0, FACE.eyeYaw, 0] }), [0.002, 0, 0.004], 'eye', { name: 'eye', mirror: true });
  add('browL', K.xf(K.box(0.085, 0.032, 0.036), { rot: [0, FACE.eyeYaw, -8] }), [0.035, 0, -0.012], 'fringe', { name: 'brow', mirror: true });
  add('mouth', K.box(0.075, 0.04, 0.04), [0, 0, -0.03], 'eye', { name: 'mouth' });
  add('neck', K.frustum(6, 0.07, 0.065, 0.08), [0, 0.02, 0], 'skin', { name: 'neckSkin' });

  // ── UPPER ROBE (chest): rings from the belt to the shoulders, sliding FORWARD at the top (stoop) with a hump behind
  {
    const c = (y) => y - m.chestY;
    const rings = [
      ...ring(16, 0.178, c(BELT_Y - 0.02), 0, 0.88),
      ...ring(16, 0.18, c(0.52), 0.0, 0.92),
      ...ring(16, 0.178, c(0.585), -0.005, 0.98),
      ...ring(16, 0.165, c(0.635), 0.01, 0.95),
      ...ring(16, 0.12, c(0.675), 0.035, 0.9),
    ];
    // the hump: a back bulge at shoulder-blade height
    const hump = ring(8, 0.11, c(0.6), -0.1, 0.8, 1.2).filter((p) => p[2] < -0.1);
    add('chest', K.hull([...rings, ...hump]), [0, 0, 0], 'robe', { name: 'robeUp' });
    // belt: wood band of the robe's own profile, 0.05 tall
    add('hips', K.frustum(16, robeR(BELT_Y - 0.02) + 0.006, 0.18 + 0.006, 0.05, { sz: 0.9 }), [0, BELT_Y - m.hipsY, 0], 'wood', { name: 'belt' });
  }
  // ── LOWER ROBE (bone `robe`, pivot at the belt): one lathe hem → belt + robe-shadow sole disc
  {
    const pivotY = m.hipsY + 0.04;
    const prof = [];
    for (let y = HEM_Y; y <= BELT_Y + 0.001; y += (BELT_Y - HEM_Y) / 6) prof.push([robeR(y), +y.toFixed(4)]);
    add('robe', K.xf(latheAbs(prof, 16, { sz: 0.9 }), { at: [0, -pivotY, 0] }), [0, 0, 0], 'robe', { name: 'robeLow' });
    add('robe', K.frustum(16, HEM_R - 0.01, HEM_R - 0.01, 0.012, { sz: 0.9 }), [0, HEM_Y + 0.006 - pivotY, 0], 'eye', { name: 'hemSole' });
  }

  // ── SLEEVES (robe) along the bent rest directions, wide cuff, skin hands
  const seg = (bone, d, len, r0, r1, name, color, off = 0) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(6, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r / deg) }), d.map((v) => v * (len / 2 + off)), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM[sd].up)), m.upperArm + 0.03, 0.066, 0.072, 'sleeve' + sd, 'robe', -0.02);
    seg('forearm' + sd, m3(armDir(ARM[sd].fore)), m.forearm - 0.01, 0.072, 0.092, 'cuff' + sd, 'robe');
    const d = m3(armDir(ARM[sd].fore));
    add('hand' + sd, K.chamferBox(0.08, 0.085, 0.08, 0.35), [sx * d[0] * 0.01, -0.02, d[2] * 0.01], 'skin', { name: 'hand' + sd });
  }

  // ── LEGS: dark shins (inside the robe), brown shoes on their own bones
  add('shinL', K.frustum(4, 0.05, 0.055, m.shin), [0, -m.shin / 2, 0], 'eye', { name: 'shin', mirror: true });
  add('shoeL', K.chamferBox(0.1, m.ankleY + 0.03, 0.19, 0.35), [0, -m.ankleY / 2 + 0.012, 0.05], 'wood', { name: 'shoe', mirror: true });

  // ── CANE (bone `cane`, grip at the origin, plumb with a slight outward lean): shaft from the tip on the ground up past
  // the grip, crook = a short cap curving forward-out and down (v1 hook)
  {
    // length: the tip reaches the ground at rest (grip world height / vertical component of the tilted shaft)
    const gripY = W.cane[1];
    CANE.below = +(gripY / -caneP(-1)[1] + 0.004).toFixed(4);
    CANE_TIP.splice(0, 3, ...caneP(-CANE.below));
    const tilt = (g) => K.xf(g, { rot: CANE.rot });
    const len = CANE.below + CANE.above;
    add('cane', tilt(K.xf(K.prism(6, CANE.r, len), { at: [0, (CANE.above - CANE.below) / 2, 0] })), [0, 0, 0], 'wood', { name: 'caneShaft' });
    // crook: a block running FORWARD from the top of the shaft, then a short drop (the hook), one wood slot
    add('cane', tilt(K.hull([[-0.03, CANE.above - 0.06, -0.035], [0.03, CANE.above - 0.06, -0.035], [-0.03, CANE.above + 0.005, -0.035], [0.03, CANE.above + 0.005, -0.035],
      [-0.03, CANE.above - 0.06, 0.10], [0.03, CANE.above - 0.06, 0.10], [-0.03, CANE.above, 0.12], [0.03, CANE.above, 0.12]])), [0, 0, 0], 'wood', { name: 'caneCrook' });
    add('cane', tilt(K.xf(K.box(0.06, 0.075, 0.055), { at: [0, CANE.above - 0.085, 0.1] })), [0, 0, 0], 'wood', { name: 'caneHook' });
  }
  return P;
}
const CANE_TIP = [0, 0, 0];                   // filled by parts() (cane-local tip on the ground at rest)

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ──────────────────────────────────────────────────────
const EYES = (sy) => ({ 'eyeL.s': [0, sy, 0], 'eyeR.s': [0, sy, 0] });
const BLINK = EYES(-0.8), SHUT = EYES(-0.8), HALF = EYES(-0.45), WIDE = { ...EYES(0.3), 'eyeL.p': [0, 0.006, 0], 'eyeR.p': [0, 0.006, 0] };
const BROWS = (o, dy = 0) => ({ browL: [0, 0, o], browR: [0, 0, o], ...(dy ? { 'browL.p': [0, dy, 0], 'browR.p': [0, dy, 0] } : {}) });
const MOUTH = (k) => ({ 'mouth.p': [0, 0, 0.03 * k], 'mouth.s': [0, 0.5 * k, 0] });
// the cane kept plumb: its fwd/out cancel the left arm's (up-bone fwd = +X rot, down-bone fwd = −X rot)
const ARM_L = (up, fore = 0, out = 0, extra = {}) => ({ upperArmL: [up, 0, out], forearmL: [fore, 0, 0], cane: [up + fore, 0, out], ...extra });
const ARM_R = (up, fore = 0, out = 0) => ({ upperArmR: [up, 0, out], forearmR: [fore, 0, 0] });
const breath = (d, extra = {}) => ({ pos: [0, -0.028 * d, 0], chest: [3 * d, 0, 0], head: [-3 * d, 0, 0], ...extra });

// walk (LegGait plays the upper body per drawing; f0 = LEFT contact): the cane moves with the RIGHT leg — planted AHEAD
// on the right contact (f2), swung forward in the flights, trailing on the left contact; robe sways toward the planted
// side and lags; the free right arm swings opposite the right leg.
const CANE_PLANT = -22;
const walkKey = (k) => [
  { ...ARM_L(-12, 0, 0), ...ARM_R(16, 10, 0), robe: [-6, 0, 6], chest: [2, -5, 0], head: [-2, 5, 0] },                 // L contact
  { ...ARM_L(10, 0, 0, { cane: [10 - 10, 0, 0] }), ...ARM_R(4, 6, 0), robe: [-10, 0, 0], chest: [-1, 0, 0], head: [1, 0, 0] },   // flight
  { ...ARM_L(24, 0, 0, { cane: [24 + CANE_PLANT, 0, 0], 'cane.p': [0, -0.03, 0] }), ...ARM_R(-14, 4, 0), robe: [-6, 0, -6], chest: [4, 5, 0], head: [-4, -5, 0] },  // R contact: cane planted
  { ...ARM_L(4, 0, 0), ...ARM_R(8, 8, 0), robe: [-10, 0, 0], chest: [-1, 0, 0], head: [1, 0, 0] },                     // flight
][k];

export const CLIPS = {
  // idle: breathe (extremes held long), a blink, then he settles his weight onto the cane (head cocks, cane hand
  // presses) and back — quiet, a single drawing most of the time
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 24, pose: breath(1) },
    { f: 34, pose: breath(1, BLINK) },
    { f: 36, pose: breath(1) },
    { f: 46, pose: breath(1, { head: [-3, 8, -8], ...BROWS(-10), ...ARM_L(-4, 8, -4) }) },
    { f: 62, pose: breath(0) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: [0, 1, 2, 3].map((k) => ({ f: k, pose: walkKey(k) })) },
  // talk (loop 32): the free RIGHT hand lifts open-palmed ↔ comes down; head rolls toward the camera on the open keys,
  // mouth opens, brows rise; the cane hand stays put
  talk: { fps: 30, loop: true, interp: 'step', length: 32, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { chest: [-3, 6, 0], head: [-6, 6, -10], ...MOUTH(1), ...BROWS(-14, 0.012), ...ARM_R(55, 55, 22) } },
    { f: 8, pose: { pos: [0, -0.02, 0], chest: [2, 0, 0], head: [4, 0, 0], ...MOUTH(0), ...ARM_R(20, 25, 8) } },
    { f: 16, pose: { chest: [-3, 8, 0], head: [-6, 2, -12], ...MOUTH(1), ...BROWS(-14, 0.012), ...ARM_R(40, 40, 50) } },
    { f: 24, pose: { pos: [0, -0.02, 0], chest: [2, 0, 0], head: [4, -4, 0], ...MOUTH(0.3), ...ARM_R(15, 20, 6) } },
  ] },
  // vote: a 3-frame dip (cane gathered) → the cane hoisted tip-UP over his head, brows up, eyes wide; HELD
  vote: { fps: 30, loop: false, interp: 'step', length: 31, events: { 3: 'vote@caneTip' }, keys: [
    { f: 0, pose: { pos: [0, -0.035, 0], spine: [6, 0, 0], head: [-4, 0, 0], ...BLINK, ...ARM_L(-10, 10, 0) } },
    { f: 3, pose: { pos: [0, 0.01, 0], spine: [-4, 0, 0], chest: [-4, 0, 0], head: [-8, 0, 0], ...WIDE, ...BROWS(-18, 0.016), ...MOUTH(0.6),
      upperArmL: [172, 0, 20], forearmL: [0, 0, 0], cane: [382, 0, 40], "cane.p": [0, -0.12, 0], ...ARM_R(30, 60, 10) } },
  ] },
};

// ── point (the game's shared emote): a squint to find them (4) → the free RIGHT arm reaches forward-and-up along the
// facing, finger out, chest turned so the right shoulder leads, chin up, brows up; the cane hand pushes the cane
// forward-low (the near limb at W/SW) — held ≈ 1.5 s with a blink — then back to idle
const POINT_R = { upperArmR: [124, 0, 32], forearmR: [-4, 0, 0], 'upperArmR.l': [0.45], 'forearmR.l': [0.45] };
const POINT_BODY = { spine: [4, -10, 0], chest: [2, -10, 0], head: [-10, 8, 0], ...BROWS(-16, 0.012), ...ARM_L(52, 0, -4) };
CLIPS.point = { fps: 30, loop: false, interp: 'step', length: 66, keys: [
  { f: 0, pose: { pos: [0, -0.02, 0], chest: [4, 6, 0], head: [-4, -4, 0], ...HALF, ...BROWS(10), ...ARM_R(30, 70, 0) } },
  { f: 4, pose: { ...POINT_BODY, ...WIDE, ...MOUTH(0.6), ...POINT_R } },
  { f: 34, pose: { ...POINT_BODY, ...BLINK, ...POINT_R } },
  { f: 36, pose: { ...POINT_BODY, ...MOUTH(0.3), ...POINT_R } },
  { f: 52, pose: { ...breath(0), head: [-4, 6, 0], ...HALF, ...ARM_R(30, 40, 6) } },
  { f: 60, pose: breath(0) },
] };

// ── die (gentle, Clocktower-only — no hurt flash): a weary sway, hand to the chest (8) → knees give, he sinks onto the
// cane (6) → tips back and to his right (6) → lies rolled on his back/side, face turned up to the camera, the cane
// across the grass beside him (dust ring + soul) → settles, HELD. Legs FK.
const DEAD = { pos: [0, -0.3, -0.16], hips: [-78, 0, -34], spine: [-6, 0, 0], chest: [-4, 0, 0], head: [26, 22, 0], ...SHUT, ...BROWS(8), ...MOUTH(0.3),
  thighL: [36, 0, 14], shinL: [-40, 0, 0], thighR: [20, 0, 18], shinR: [-24, 0, 0],
  upperArmR: [30, 0, 30], forearmR: [80, 0, 0], upperArmL: [-40, 0, 30], forearmL: [-55, 0, 0], cane: [-95, 0, 30], robe: [10, 0, 0] };
CLIPS.die = { fps: 30, loop: false, interp: 'step', legs: 'fk', length: 60, events: { 22: ['die', 'land'] }, keys: [
  { f: 0, pose: { pos: [0, -0.02, 0], spine: [4, 0, 6], chest: [4, 0, 6], head: [6, -8, 10], ...HALF, ...BROWS(10), ...MOUTH(0.4),
    ...ARM_R(40, 100, -12), ...ARM_L(10, 0, 0) } },
  { f: 8, pose: { pos: [0, -0.12, 0], spine: [16, 0, 0], chest: [10, 0, 0], head: [-6, 0, 0], ...SHUT, ...BROWS(10),
    thighL: [55, 0, 0], shinL: [-110, 0, 0], footL: [55, 0, 0], thighR: [55, 0, 0], shinR: [-110, 0, 0], footR: [55, 0, 0],
    ...ARM_R(40, 100, -12), ...ARM_L(36, 10, 0) } },
  { f: 14, pose: { pos: [0, -0.22, -0.1], hips: [-45, 0, -18], spine: [-4, 0, 0], head: [16, 10, 0], ...SHUT,
    thighL: [70, 0, 10], shinL: [-70, 0, 0], thighR: [60, 0, 14], shinR: [-60, 0, 0],
    upperArmR: [20, 0, 40], forearmR: [40, 0, 0], ...ARM_L(-10, 10, 40) } },
  { f: 22, pose: DEAD },
  { f: 28, pose: { ...DEAD, thighL: [26, 0, 14], shinL: [-26, 0, 0], head: [28, 22, 0] } },
] };

// ── nod (emote, "leans on the cane and nods"): both hands stacked on the crook with the cane planted in front of him
// (6) → a slow deep nod, eyes shut, brows knit (8) → up, "mm" (6) → a second, deeper nod (8) → up with a small cock of
// the head, eyes half (14) → idle
const ON_CANE = { upperArmL: [55, 0, -30], forearmL: [38, 0, 0], cane: [93, 0, -30], upperArmR: [58, 0, -26], forearmR: [46, 0, 0] };
const NOD = (d, extra = {}) => ({ pos: [0, -0.012 - 0.03 * d, 0], spine: [8 + 6 * d, 0, 0], chest: [4 + 6 * d, 0, 0], head: [-10 + 26 * d, 0, 0], ...ON_CANE, ...extra });
CLIPS.nod = { fps: 30, loop: false, interp: 'step', length: 62, events: { 0: 'land@caneTip' }, keys: [
  { f: 0, pose: NOD(0, { ...HALF }) },
  { f: 6, pose: NOD(1, { ...SHUT, ...BROWS(14) }) },
  { f: 14, pose: NOD(0.1, { ...HALF, ...MOUTH(0.3) }) },
  { f: 20, pose: NOD(1.15, { ...SHUT, ...BROWS(14) }) },
  { f: 28, pose: NOD(0, { head: [-12, 8, -12], ...HALF, ...BROWS(-8) }) },
  { f: 42, pose: { ...breath(0), ...HALF } },
  { f: 50, pose: breath(0) },
] };

// ── ghost / ghost-spent (spec.ghost draws the pale ramp, halo, hover and floating legs): a slow drift with both hands
// resting on the cane crook, eyes half; spent = head bowed, eyes nearly shut, lower hands
const GHOSTK = (i, spent) => { const r = [3, 0, -3, 0][i], b = [0, 1, 0, 1][i];
  return { pos: [0, -0.028 * b, 0], spine: [6, 0, r], chest: [spent ? 8 : 2, 0, r * 0.5], head: [spent ? 14 : -4, 0, -r], ...(spent ? EYES(-0.65) : HALF),
    ...ON_CANE, ...(spent ? BROWS(12) : {}) }; };
CLIPS.ghost = { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 18, pose: GHOSTK(i, false) })) };
CLIPS['ghost-spent'] = { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 18, pose: GHOSTK(i, true) })) };

export function make() {
  const S = skeleton();
  return {
    name: 'npc-elder',
    height: H,
    palette: PALETTE,
    signature: [{ part: 'skull' }, { part: 'caneShaft' }],
    faceSlot: 'skin',
    bodyPlan: 'biped',
    heightPx: [34, 44],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'hobble' },
    emote: 'nod',
    skeleton: S,
    parts: parts(S),
    sockets: {
      caneTip: { bone: 'cane', at: CANE_TIP },
      speech: { bone: 'head', at: [0.25, 0.55, 0] },
      crown: { bone: 'head', at: [0, 0.45, 0.02] },
      core: { bone: 'hips', at: [0, 0.1, 0] },
    },
    chains: [],
    personality: { body: { f: 1.8, zeta: 1, r: 0 }, head: { f: 2, zeta: 1, r: 0 } },
    locomotion: { plan: 'biped', plant: 'hold', swingFloor: 'gait', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267],
      poses: [4, 4], duty: [0.25, 0.15], reach: 0.6, arms: [0, 0], elbows: [0, 0], bob: [0.056, 0.05], lean: [4, 10], lift: [0.04, 0.05], twist: [4, 4] },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    ghost: { hover: 0.14, keepHue: 0.2 },
    fx: { stepClips: ['walk'], stepEvery: 2, speech: { node: 'speech' }, sockets: { caneTip: { length: 0, tip: 0 } }, vote: { node: 'caneTip' } },
    material: {
      sides: { eyeL: 'mid', eyeR: 'mid', browL: 'mid', browR: 'mid', robe: 'mid', cane: 'mid' },
      innerLine: 'tone',
      whiteKeep: 0.7,
      creamKeep: [1, 0.85],
      merge: { neck: 'head' },
    },
  };
}

export default make();
