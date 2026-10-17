// Maxflow (char-maxflow) — cast member "maxflow", mascot (CMU 15-451): "A big soft fox. Pushes as much as will fit."
// Design sheet (Unique to me, timing charts, self-critique): characters/maxflow.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/maxflow.ts + refs/cast/maxflow.png.
// Body plan: upright CHIBI (chibi(), 2.3 heads; v2 draws him upright, unclothed, a big round plush), LegGait 'biped' with
// the 'bird' style (a bouncing WADDLE: the ball rolls onto the stance foot) + a squash bone 'ball' under the body egg
// (locomotion.squash, the chest rides it) = squash on every contact. Tail (tail0 → tail1) and ears are KEYED per gait
// drawing in clips.walk (LegGait plays authored walk clips, module fix M1). Story prop: a wooden crate on its own bone
// (hidden at 1/1000 scale, shown with '.s'), lifted overhead in vote and shoved in the 'push' emote.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.52;                 // v2 38 px (SE) → castHeight 1.52 m (ear tips)
export const V_GAME = 3.95 * HEIGHT;        // 6.0 m/s

// [hi, mid, sh] sRGB. 5 slots (fur, cream, dark, eye, wood).
export const PALETTE = {
  fur: ['#F4A468', '#DC6E30', '#B25A3A'],   // bright orange (v1 #D8692C); sh lifted ALONG the hue (≈ 16°), never plum
  cream: ['#FFF4E8', '#F2E6D2', '#CDB49C'], // chest oval, muzzle, cheek puffs, ear insides, tail tip (v1 #F2EADC); whiteKeep
  dark: ['#5E4A54', '#3E3038', '#3A2C38'],  // ears, paws, legs (v1 #2C2228, lifted for the night rule)
  eye: ['#4A3E52', '#221A26', '#2E2434'],   // button eyes, nose, mouth (no black)
  wood: ['#E8B874', '#B57E44', '#80563A'],  // story prop: the crate (vote / push only)
};

const SKH = 1.34;                           // chibi template height = top of the skull (the ears stand above it)
const ARM = { up: [30, 12], fore: [14, 32] }; // arm segment directions at rest [out°, fwd°] (L side): stubby, off the ball
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
// r2: ears on the crown/back of the skull, more upright (r1 at [0.17, 0.43, -0.04] put the near ear's dark root mid-skull
// at E/W, where it read as a big eye)
const EAR = { at: [0.13, 0.5, -0.1], dir: [0.3, 1, -0.14], len: 0.31 };
const EYE = [0.15, 0.3, 0.275];             // head-local L eye joint, on the lathe surface (normal yaw ≈ 22°)
const TAIL_AT = [0.08, -0.07, -0.2];        // hips-local tail root (left-back of the rump)
const BALL_Y = 0.19;                        // bottom of the body egg (character y) = the squash bone's joint
const TINY = 0.001, SHOW = [999, 999, 999], HIDE = [0, 0, 0];

// tail centreline (tail0-local, character axes) [x, y, z, r]: out to his LEFT and back, then UP beside the body to
// shoulder height (v1: the cream tip pokes out at screen-right of the shoulders at S, the tail fills the back-left at N)
const TAILC = [[0, 0, 0, 0.12], [0.12, 0.0, -0.11, 0.165], [0.25, 0.08, -0.14, 0.19], [0.35, 0.2, -0.09, 0.19],
  [0.41, 0.33, 0.0, 0.17], [0.43, 0.45, 0.07, 0.135], [0.4, 0.54, 0.12, 0.075]];

export function skeleton() {
  const S0 = chibi({ height: SKH, heads: 2.3, legs: 0.55, arms: 0.75, snout: 0.25, tail: false,
    ears: { n: 1, at: EAR.at, dir: EAR.dir, len: EAR.len }, face: { eye: EYE, brow: false, mouth: [0, 0.085, 0.445] } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    S.find((x) => x.name === `upperArm${s}`).pos = [sx * 0.27, 0.115, 0.03];   // shoulders out on the ball's side
    for (const [n, a] of [[`forearm${s}`, ARM.up], [`hand${s}`, ARM.fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  const m = S0.meta;
  S.push({ name: 'ball', parent: 'spine', pos: [0, BALL_Y - m.spineY, 0], axis: 'up' });
  S.push({ name: 'tail0', parent: 'hips', pos: TAIL_AT, axis: 'left' });
  S.push({ name: 'tail1', parent: 'tail0', pos: TAILC[3].slice(0, 3), axis: 'left' });
  S.push({ name: 'crate', parent: 'hips', pos: [0, 0, 0], axis: 'up' });
  S.push({ name: 'crateLid', parent: 'crate', pos: [0, 0, 0], axis: 'up' });
  // r2: the cream face (muzzle, cheeks, snout) on its own part-less-pose bone so material.merge can fold the fur
  // skull into the body (no neck collar line) while the cream face keeps its line against the cream chest
  S.push({ name: 'face', parent: 'head', pos: [0, 0, 0], axis: 'up' });
  const meta = { ...m, restY: { ...(m.restY || {}), ball: BALL_Y } };
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: meta } });
}

// ── geometry helpers (in-plane subdivision + split by centroid: colour regions cut OUT of one surface, no inner line)
function subdivide(geo, maxEdge) {
  const p = geo.attributes.position.array, out = [];
  const rec = (a, b, c, d) => {
    const e = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const lab = e(a, b), lbc = e(b, c), lca = e(c, a), mx = Math.max(lab, lbc, lca);
    if (mx <= maxEdge || d > 8) { out.push(...a, ...b, ...c); return; }
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    if (mx === lab) { const q = mid(a, b); rec(a, q, c, d + 1); rec(q, b, c, d + 1); }
    else if (mx === lbc) { const q = mid(b, c); rec(a, b, q, d + 1); rec(a, q, c, d + 1); }
    else { const q = mid(c, a); rec(a, b, q, d + 1); rec(q, b, c, d + 1); }
  };
  for (let i = 0; i < p.length; i += 9) rec([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], 0);
  return out;
}
function splitN(arr, preds) {
  const out = preds.map(() => []), rest = [];
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    const k = preds.findIndex((p) => p(c));
    (k < 0 ? rest : out[k]).push(...arr.slice(i, i + 9));
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  return [...out.map(mk), mk(rest)];
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, i) => v - b[i]);
function ringPts(c, r, t, n) {
  t = norm(t); let b = cross(t, [0, 1, 0]); if (Math.hypot(...b) < 1e-3) b = [1, 0, 0]; b = norm(b);
  const u = norm(cross(b, t)), pts = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + Math.PI / n; pts.push([0, 1, 2].map((j) => c[j] + (Math.cos(a) * b[j] + Math.sin(a) * u[j]) * r)); }
  return pts;
}
const bandHull = (C, R, T, i0, i1, n = 8, off = [0, 0, 0]) => {
  const pts = [];
  for (let i = i0; i <= i1; i++) pts.push(...ringPts(sub(C[i], off), R[i], T[i], n));
  return K.hull(pts);
};
const angF = (p) => Math.abs(Math.atan2(p[0], p[2])) * 180 / Math.PI;   // 0 = front

// head profile (head-local: y 0 = chin), one 16-sided lathe; the cream lower face is cut out of its surface
const HEAD = [[0.18, 0], [0.31, 0.05], [0.355, 0.15], [0.36, 0.27], [0.32, 0.4], [0.2, 0.52], [0, 0.58]];
const HEAD_SZ = 0.85;
// body egg (character y BALL_Y … BALL_Y + 0.6), cream chest oval cut out of its front
const BODY = [[0.15, 0], [0.25, 0.06], [0.3, 0.2], [0.3, 0.33], [0.26, 0.46], [0.18, 0.56], [0.06, 0.6]];

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  const placeY = (g, y0) => { g.computeBoundingBox(); return g.clone().translate(0, y0 - g.boundingBox.min.y, 0); };

  // ── head ──
  const hg = placeY(K.lathe(HEAD, 16, { sz: HEAD_SZ }), 0);
  const [muz, skull] = splitN(subdivide(hg, 0.025), [
    (p) => p[2] > -0.02 && ((angF(p) < 58 && p[1] < 0.2) || (angF(p) < 30 && p[1] < 0.235)),   // cream lower face + cheeks
  ]);
  add('head', skull, [0, 0, 0], 'fur', { name: 'skull' });
  add('face', muz, [0, 0, 0], 'cream', { name: 'muzzle' });
  // cheek puffs (v1: two cream balls low on the sides of the face) — break the head outline at S
  for (const sx of [1, -1]) add('face', K.hull(ringPts([sx * 0.24, 0.1, 0.15], 0.085, [sx * 0.6, 0, 0.8], 8).concat(ringPts([sx * 0.29, 0.09, 0.1], 0.065, [sx * 0.6, 0, 0.8], 8))),
    [0, 0, 0], 'cream', { name: sx > 0 ? 'cheekL' : 'cheekR' });
  // snout: a cream fox wedge, ≥ 4 texels proud of the lathe (front z 0.45 vs the face surface ≈ 0.31; r1 0.355 = 2
  // texels → an egg in profile), tapering to the dark button nose on its tip
  add('face', K.hull([[-0.12, 0.03, 0.18], [0.12, 0.03, 0.18], [-0.11, 0.21, 0.18], [0.11, 0.21, 0.18],
    [-0.09, 0.05, 0.33], [0.09, 0.05, 0.33], [-0.08, 0.19, 0.31],  [0.08, 0.19, 0.31],
    [-0.045, 0.07, 0.45], [0.045, 0.07, 0.45], [-0.04, 0.165, 0.44], [0.04, 0.165, 0.44]]), [0, 0, 0], 'cream', { name: 'snout' });
  add('head', K.chamferBox(0.085, 0.06, 0.06, 0.3), [0, 0.155, 0.45], 'eye', { name: 'nose' });
  // mouth: a dark plate on the snout front under the nose, closed = 1 texel; talk opens it with 'mouth.s' y
  add('mouth', K.box(0.07, 0.016, 0.02), [0, 0, 0], 'eye', { name: 'mouthPlate' });
  // eyes: dark button boxes on the 16-gon surface (front ≈ 0.006 m proud, turned to the surface normal), glint flush
  const EYAW = 22, EYEC = [-0.004, 0, -0.012];
  const rotY = ([x, y, z], d) => { const a = d * Math.PI / 180; return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]; };
  const onEye = (v) => { const r = rotY(v, EYAW); return [EYEC[0] + r[0], EYEC[1] + r[1], EYEC[2] + r[2]]; };
  add('eyeL', K.xf(K.box(0.09, 0.1, 0.04), { rot: [0, EYAW, 0] }), EYEC, 'eye', { name: 'eye', mirror: true });
  add('eyeL', K.xf(K.box(0.024, 0.024, 0.012), { rot: [0, EYAW, 0] }), onEye([0.024, 0.033, 0.021]), 'cream', { name: 'glint', mirror: true });
  // ears: tall BLACK triangles (base sunk into the skull), cream inner triangle on the front face
  {
    const u = norm(EAR.dir), L = EAR.len, w = 0.12, d = 0.05;
    const ring = (a, hw, hd, dz = 0) => [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([x, z]) => [x + u[0] * a, u[1] * a, z + dz + u[2] * a]);
    const ear = K.hull([...ring(-0.06, w * 0.8, d * 0.9), ...ring(0.04, w, d), ...ring(L * 0.55, w * 0.55, d * 0.8), ...ring(L, w * 0.12, d * 0.4)]);
    const inner = K.hull([...ring(0.02, w * 0.62, 0.008, d - 0.002), ...ring(L * 0.6, w * 0.26, 0.008, d * 0.8 - 0.002)]);
    add('earL0', ear, [0, 0, 0], 'dark', { name: 'ear', mirror: true });
    add('earL0', inner, [0, 0, 0], 'cream', { name: 'earIn', mirror: true });
  }

  // ── body: one big orange egg on the squash bone, the cream chest oval cut out of its front ──
  const bg = placeY(K.lathe(BODY, 12, { sz: 0.92 }), 0);
  const [chestW, bodyR] = splitN(subdivide(bg, 0.035), [
    (p) => p[2] > 0 && ((p[0] / 0.2) ** 2 + ((p[1] - 0.3) / 0.25) ** 2) < 1,
  ]);
  add('ball', bodyR, [0, 0, 0], 'fur', { name: 'body' });
  add('ball', chestW, [0, 0, 0], 'cream', { name: 'chestOval' });
  // dark seat under the egg (the legs' root)
  add('hips', K.frustum(8, 0.12, 0.16, 0.06, { sz: 0.9 }), [0, BALL_Y + 0.02 - m.hipsY, 0], 'dark', { name: 'seat' });

  // ── arms: stubby orange, black paws ──
  const seg = (bone, d, len, r0, r1, name, color) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(6, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM.up)), m.upperArm + 0.04, 0.085, 0.08, 'upper' + sd, 'fur');
    seg('forearm' + sd, m3(armDir(ARM.fore)), m.forearm, 0.075, 0.075, 'fore' + sd, 'fur');
    const d = m3(armDir(ARM.fore));
    add('hand' + sd, K.chamferBox(0.12, 0.11, 0.12, 0.4), d.map((v) => v * 0.035), 'dark', { name: 'paw' + sd });
  }

  // ── legs: stubby black, feet forward ──
  add('thighL', K.frustum(6, 0.085, 0.08, m.thigh + 0.02), [0, -m.thigh / 2, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(6, 0.08, 0.085, m.shin), [0, -m.shin / 2, 0], 'dark', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.14, m.ankleY + 0.05, 0.22, 0.35), [0, -m.ankleY / 2 + 0.02, 0.05], 'dark', { name: 'foot', mirror: true });

  // ── tail: bands of ONE centreline (fur fur fur | fur cream cream) ──
  const C = TAILC.map((t) => t.slice(0, 3)), R = TAILC.map((t) => t[3]);
  const T = C.map((c, i) => sub(C[Math.min(C.length - 1, i + 1)], C[Math.max(0, i - 1)]));
  const J = C[3];
  add('tail0', bandHull(C, R, T, 0, 3), [0, 0, 0], 'fur', { name: 'tailA' });   // one hull: no dotted band lines
  add('tail1', bandHull(C, R, T, 3, 4, 8, J), [0, 0, 0], 'fur', { name: 'tailD' });
  add('tail1', bandHull(C, R, T, 4, 6, 8, J), [0, 0, 0], 'cream', { name: 'tailTip' });

  // ── story prop: the crate (TINY: every vertex × 0.001; '<bone>.s' SHOW scales it back to 1), centred on its joint ──
  const tiny = (g) => K.xf(g, { scale: TINY });
  const CW = 0.48;
  add('crate', tiny(K.box(CW - 0.04, CW - 0.04, CW - 0.04)), [0, 0, 0], 'wood', { name: 'crateBox' });
  // r2: lid rim + a slat band on their own bone 'crateLid' (a different part id → real step lines; on the same bone
  // as the box the lines were suppressed and the crate read as a blank cube)
  add('crateLid', tiny(K.box(CW, 0.08, CW)), [0, (CW / 2 - 0.04) * TINY, 0], 'wood', { name: 'crateLid' });
  add('crateLid', tiny(K.box(CW - 0.01, 0.06, CW - 0.01)), [0, -0.07 * TINY, 0], 'wood', { name: 'crateSlat' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
// tail0/tail1 (axis 'left'): out + = sways toward his RIGHT (across the back), twist + = tips forward / − = back,
// fwd + = yaws forward round his left side. ears (sided, up-axis): fwd − = back, out + = outward.
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const HALF = EYES(0, -0.45);
const HAPPY = EYES(0.1, -0.65);
const WIDE = EYES(0.1, 0.2);
const MOUTH = (o) => ({ 'mouth.s': [0.2 * o, 2.2 * o, 0] });   // closed 1 texel → open 2–3 texels
const EARS = (l, r = l) => ({ earL0: l, earR0: r });
const TAIL = (o0, o1 = 0, tw = 0, f0 = 0) => ({ tail0: [f0, tw, o0], tail1: [0, 0, o1] });
const SQ = (a) => { const sy = 1 - a, k = 1 / Math.sqrt(Math.max(0.05, sy)) - 1; return { 'ball.s': [+k.toFixed(4), -a, +k.toFixed(4)], 'chest.p': [0, +((0.505 - BALL_Y) * -a).toFixed(4), 0] }; };
const breathe = (d, c, extra = {}) => ({ pos: [0, -d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0], ...extra });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
const CRATE = (p, rot = [0, 0, 0]) => ({ 'crate.s': SHOW, 'crate.p': p, crate: rot });
// crate on the ground in front: world centre (0, 0.24, z) minus the root offset pos (y, z) → hips-local '.p'
const CP = (py, pz, z) => [0, +(0.24 - 0.371 - py).toFixed(3), +(z - pz).toFixed(3)];
// vote: both paws high, the crate held overhead (arms lengthened with '.l', thickness unchanged)
// r2: arms near-vertical so the paws grip the crate's lower side edges (r1 [4, 0, 160] left them flailing at the head sides)
const LIFT = (l) => ({ upperArmL: [6, 0, 170], upperArmR: [6, 0, 170], forearmL: [4, 0, -8], forearmR: [4, 0, -8],
  'upperArmL.l': [l], 'upperArmR.l': [l], 'forearmL.l': [l], 'forearmR.l': [l] });
// DEAD (r2): flopped flat on his BACK like a dropped plush (hips [-80, 0, 0]), chin tucked 35° so the shut eyes + cream
// face show at S/SE/SW, paws spread, feet up, the tail laid along his left side (tail tip off the chest). r1 (on his
// right side, rolled back) was a jumble of cream + dark blobs with no face. Probes: shots/char-maxflow/r3/dt/s-die.png row 2.
const DEAD = { pos: [0, -0.24, -0.05], hips: [-80, 0, 0], spine: [10, 0, 0], chest: [10, 0, 0], head: [35, 0, 0], ...BLINK,
  ...EARS([-60, 0, 20]), thighL: [70, 0, 10], shinL: [-60, 0, 0], thighR: [60, 0, 0], shinR: [-70, 0, 0],
  upperArmL: [0, 0, 70], upperArmR: [0, 0, 70], forearmL: [20, 0, 0], ...TAIL(-10, -10, 0, 30) };

export const CLIPS = {
  // idle (72, step): slow plush breathing (squash on the exhale), tail sway, a blink, an ear flick
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: breathe(0, 0, TAIL(0, 0)) },
    { f: 30, pose: breathe(0.014, 2, { ...TAIL(-12, -10), ...SQ(0.03) }) },
    { f: 36, pose: breathe(0.028, 4, { ...TAIL(-18, -16), ...SQ(0.05) }) },
    { f: 50, pose: breathe(0.028, 4, { ...TAIL(-18, -16), ...SQ(0.05), ...BLINK }) },
    { f: 52, pose: breathe(0.028, 4, { ...TAIL(-18, -16), ...SQ(0.05) }) },
    { f: 60, pose: breathe(0.028, 4, { ...TAIL(-18, -16), ...SQ(0.05), ...EARS([0, 0, 0], [-30, 0, 15]) }) },
    { f: 64, pose: breathe(0.014, 2, { ...TAIL(-6, -4), ...SQ(0.03) }) },
  ] },
  // talk (loop 24): a beat every 6 frames — mouth open on alternate keys, head roll toward the camera, his right paw
  // gestures (out low ↔ up by the shoulder), ear flicks, tail beat, body squash on the "down" beats
  talk: { fps: 30, loop: true, interp: 'step', length: 24, dynamics: 'hold', events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, 0, 0], chest: [-4, -8, 0], head: [-6, -10, 8], ...MOUTH(1.6), upperArmR: [50, 0, 55], forearmR: [40, 0, 0], ...TAIL(0, -4) } },
    { f: 6, pose: { pos: [0, -0.03, 0], chest: [2, -4, 0], head: [0, -14, -6], ...HALF, ...SQ(0.06), upperArmR: [15, 0, 20], forearmR: [15, 0, 0],
      ...EARS([0, 0, 0], [-30, 0, 15]), ...TAIL(-14, -12) } },
    { f: 12, pose: { pos: [0, 0, 0], chest: [-4, -12, 0], head: [-6, -6, 12], ...MOUTH(1.4), upperArmR: [85, 0, 30], forearmR: [80, 0, 0], ...TAIL(4, 6) } },
    { f: 18, pose: { pos: [0, -0.03, 0], chest: [2, -2, 0], head: [0, -12, 2], ...HALF, ...SQ(0.06), upperArmR: [20, 0, 25], forearmR: [15, 0, 0],
      ...EARS([-30, 0, 15], [0, 0, 0]), ...TAIL(-14, -12) } },
  ] },
  // vote: squat + grab (4) → the crate hoisted overhead in both paws, on tiptoe, ears folded under it, eyes wide — HELD
  vote: { fps: 30, loop: false, interp: 'step', length: 30, events: { 4: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.06, 0], spine: [8, 0, 0], chest: [6, 0, 0], head: [-10, 0, 0], ...SQ(0.1), ...EARS([-15, 0, 10]),
      upperArmL: [60, 0, 30], upperArmR: [60, 0, 30], forearmL: [40, 0, 0], forearmR: [40, 0, 0], ...CRATE(CP(-0.06, 0, 0.5)), ...TAIL(-10, -4) } },
    { f: 4, pose: { pos: [0, 0.04, 0], spine: [-4, 0, 0], chest: [-4, 0, 0], head: [-6, 0, 0], ...WIDE, ...SQ(-0.04), ...EARS([-45, 0, 25]),
      ...LIFT(2.0), ...CRATE([0, 1.24, 0.02]), ...TAIL(-20, -18, -10) } },
  ] },
  // point (the game's shared emote): wind (4) → right paw thrown out-and-up toward the facing, head + ears to the
  // target, tail flick (held 22) → back down (6) → idle
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], spine: [4, 8, 0], chest: [4, 10, 0], head: [-6, -6, 0], ...HALF, ...SQ(0.05), ...EARS([10, 0, 0]),
      upperArmR: [30, 0, 30], forearmR: [100, 0, 0], ...TAIL(-6, 0) } },
    // r2: "THAT one!" — the right paw thrust FORWARD along the facing (out 8°, fwd 80°, reach .l 1.4/1.2), the chest
    // twisted 16° to his left so the pointing shoulder leads, head turned back to the target, the left paw thrust
    // forward-low too (a big fox points with everything; it also keeps a paw off the outline at SE AND SW, where one
    // arm alone always hides behind the ball). r1 [112, 0, 45] + chest twist −14 aimed to his right, away from the
    // target. Variants: shots/char-maxflow/r3/pt.png (rows: one paw / + twist / + both paws = this).
    { f: 4, pose: { pos: [0, 0.01, 0.02], spine: [0, 12, 0], chest: [-4, 16, 0], head: [-6, -18, 4], ...MOUTH(1.2), ...EYES(0.1, -0.3), ...EARS([18, 0, -6]),
      upperArmR: [80, 0, 8], forearmR: [4, 0, 0], 'upperArmR.l': [1.4], 'forearmR.l': [1.2],
      upperArmL: [72, 0, 6], forearmL: [6, 0, 0], 'upperArmL.l': [1.0], 'forearmL.l': [0.8], ...TAIL(-22, -14) } },
    { f: 26, pose: { pos: [0, -0.01, 0], chest: [0, -6, 0], head: [-4, -8, 0], ...HALF, ...EARS([6, 0, 0]), upperArmR: [40, 0, 25], forearmR: [40, 0, 0],
      upperArmL: [20, 0, 18], forearmL: [20, 0, 0], ...TAIL(-4, -2) } },
    { f: 32, pose: breathe(0, 0, TAIL(0, 0)) },
  ] },
  // die (gentle, no hurt): sway, ears sag (8) → knees give, he sits with a squash (6) → topples back onto his side (6)
  // → the flopped plush mound, eyes shut — HELD
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', length: 60, events: { 20: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], spine: [-4, 0, 8], chest: [-6, 0, 8], head: [-4, -10, -14], ...HALF, ...EARS([-30, 0, 25]), ...TAIL(-12, -10) } },
    { f: 8, pose: { pos: [0, -0.15, 0], spine: [14, 0, -6], chest: [8, 0, 0], head: [-8, -8, 0], ...BLINK, ...SQ(0.14), ...EARS([-45, 0, 30]), ...KNEES(60),
      upperArmL: [20, 0, 30], upperArmR: [20, 0, 30], ...TAIL(-8, 0, 0, 20) } },
    { f: 14, pose: { pos: [0, -0.18, -0.03], hips: [-40, 0, -10], spine: [10, 0, 0], head: [10, -8, 0], ...BLINK, ...SQ(0.1), ...EARS([-55, 0, 25]), ...KNEES(50),
      upperArmL: [20, 0, 50], upperArmR: [10, 0, 40], ...TAIL(-14, -8, 0, 30) } },
    { f: 20, pose: DEAD },
  ] },
  // push (emote: "pushes as much as will fit"): a crate appears; he plants his paws on it, crouched + squashed, ears
  // back, squint of effort (8) → SHOVE: lunges, the crate slides 0.2 m (6) → strain: crouch again, deeper squash (6) →
  // BIG SHOVE: lunge + stretch, the crate slides on, "!" (8) → proud: chest out, happy ^ ^ eyes, paws on hips (16) →
  // idle; the crate poofs AT ITS FINAL SPOT on f42 (the crate bone is still there) and is gone on f44
  push: { fps: 30, loop: false, interp: 'step', length: 56, events: { 8: 'land', 20: 'land', 22: 'emote:exclaim@crown', 42: 'poof@crate' }, keys: [
    { f: 0, pose: { pos: [0, -0.06, 0], spine: [12, 0, 0], chest: [6, 0, 0], head: [-16, 0, 0], ...SQ(0.14), ...EYES(0.05, -0.5), ...EARS([-30, 0, 15]),
      upperArmL: [50, 0, 12], upperArmR: [50, 0, 12], forearmL: [10, 0, 0], forearmR: [10, 0, 0], ...CRATE(CP(0.06, 0, 0.62)), ...TAIL(-10, -6) } },
    { f: 8, pose: { pos: [0, 0, 0.08], spine: [20, 0, 0], chest: [8, 0, 0], head: [-26, 0, 0], ...SQ(-0.08), ...EYES(0.05, -0.6), ...MOUTH(1.4), ...EARS([-45, 0, 20]),
      upperArmL: [50, 0, 8], upperArmR: [50, 0, 8], forearmL: [0, 0, 0], forearmR: [0, 0, 0], 'upperArmL.l': [0.3], 'upperArmR.l': [0.3], 'forearmL.l': [0.2], 'forearmR.l': [0.2],
      ...CRATE(CP(0, 0.08, 0.78)), ...TAIL(-28, -20, -20) } },
    { f: 14, pose: { pos: [0, -0.08, 0.08], spine: [14, 0, 0], chest: [8, 0, 0], head: [-20, 0, 0], ...SQ(0.18), ...EYES(0.05, -0.65), ...EARS([-40, 0, 20]),
      upperArmL: [44, 0, 10], upperArmR: [44, 0, 10], forearmL: [20, 0, 0], forearmR: [20, 0, 0], 'upperArmL.l': [0.3], 'upperArmR.l': [0.3], ...CRATE(CP(-0.08, 0.08, 0.78)), ...TAIL(-6, 0) } },
    { f: 20, pose: { pos: [0, 0.03, 0.14], spine: [24, 0, 0], chest: [10, 0, 0], head: [-30, 0, 0], ...SQ(-0.1), ...BLINK, ...MOUTH(1.8), ...EARS([-55, 0, 25]),
      upperArmL: [58, 0, 8], upperArmR: [58, 0, 8], forearmL: [0, 0, 0], forearmR: [0, 0, 0], 'upperArmL.l': [0.4], 'upperArmR.l': [0.4], 'forearmL.l': [0.3], 'forearmR.l': [0.3],
      ...CRATE(CP(0.03, 0.14, 1.05)), ...TAIL(-34, -26, -25) } },
    { f: 28, pose: { pos: [0, 0.02, 0.1], spine: [-6, 0, 0], chest: [-8, 0, 0], head: [-4, 0, 6], ...HAPPY, ...SQ(-0.03), ...EARS([10, 0, -4]),
      upperArmL: [-25, 0, 35], upperArmR: [-25, 0, 35], forearmL: [50, 0, 0], forearmR: [50, 0, 0], ...CRATE(CP(0.02, 0.1, 1.05)), ...TAIL(-20, -18, -10) } },
    { f: 44, pose: { ...breathe(0, 0, TAIL(0, 0)), pos: [0, 0, 0] } },
  ] },
  // ghost / ghost-spent (spec.ghost draws the pale ramp, halo, hover and floating legs): a slow drift with the paws
  // floating out, tail swaying; spent: head bowed, ears down, paws hanging
  ghost: { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 16, 32, 48].map((f, i) => ({ f, pose: {
    pos: [0, [0.03, 0.015, 0, 0.015][i], 0], upperArmL: [12, 0, 16 + 8 * (i % 2)], upperArmR: [12, 0, 16 + 8 * ((i + 1) % 2)], forearmL: [20, 0, 0], forearmR: [20, 0, 0],
    head: [-6, 0, [4, 0, -4, 0][i]], thighL: [20, 0, 0], shinL: [-30, 0, 0], thighR: [20, 0, 0], shinR: [-30, 0, 0], ...TAIL([-6, -14, -20, -14][i], [-4, -12, -16, -10][i]),
    ...(i === 2 ? HALF : {}) } })) },
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: {
    pos: [0, [-0.02, -0.035, -0.05, -0.035][i], 0], spine: [6, 0, 0], chest: [6, 0, 0], head: [14, 0, [3, 0, -3, 0][i]], ...HALF, ...EARS([-35, 0, 20]),
    upperArmL: [4, 0, 12], upperArmR: [4, 0, 12], thighL: [25, 0, 0], shinL: [-35, 0, 0], thighR: [25, 0, 0], shinR: [-35, 0, 0], ...TAIL([-4, -8, -12, -8][i], [-2, -6, -8, -6][i], 20) } })) },
  // walk / run (LegGait plays them for the upper body, ADDED on the waddle body): f0 = left contact. The big tail
  // swings out and back with tail1 one drawing behind (follow-through); ears flop back on the contacts.
  walk: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    // r2: spine roll per contact (k0 −7, k2 −3) evens out the waddle — r1 rolled ≈ 15° on k0 vs ≈ 5° on k2
    // (probe shots/char-maxflow/r3/roll.png: +out leans to screen-right at S)
    { f: 0, pose: { ...TAIL(-8, -24), ...EARS([-24, 0, 8]), spine: [0, 0, -7] } },
    { f: 1, pose: { ...TAIL(-20, 4), spine: [0, 0, 0] } },
    { f: 2, pose: { ...TAIL(-38, -4), ...EARS([-24, 0, 8]), spine: [0, 0, -3] } },
    { f: 3, pose: { ...TAIL(-26, -30), spine: [0, 0, 0] } },
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { ...TAIL(4, -22, -25), ...EARS([-35, 0, 12]) } },
    { f: 1, pose: { ...TAIL(-10, 6, -35), ...EARS([-15, 0, 5]) } },
    { f: 2, pose: { ...TAIL(-30, 0, -25), ...EARS([-35, 0, 12]) } },
    { f: 3, pose: { ...TAIL(-18, -28, -35), ...EARS([-15, 0, 5]) } },
  ] },
};

export function make() {
  const S = skeleton();
  return {
    name: 'maxflow',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['fur', { part: 'tailTip' }],
    faceSlot: 'cream',
    bodyPlan: 'uprightAnimal',
    heightPx: [48, 60],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'waddle' },
    emote: 'push',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0.3, 0.62, 0.0] } },
    chains: [],
    personality: { body: { f: 1.8, zeta: 0.7, r: 0 }, head: { f: 2.2, zeta: 0.8, r: 0 } },
    locomotion: { plan: 'biped', style: 'bird', plant: 'hold', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.15, 0.1], reach: 0.6, bob: [0.06, 0.1], lean: [6, 12], lift: [0.06, 0.08], roll: [9, 4], headBob: [6, 6],
      squash: { bones: ['ball'], amount: 0.22, riders: ['chest'] } },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    ghost: { hover: 0.14 },
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', earL0: 'mid', earR0: 'mid' }, whiteKeep: 0.8, whiteKeepLift: 0.8,
      // r2: cream lift 0.35 → the golden sun-side chest #957C7E (mauve-grey, darker than the fur) → #D8CCBF (r3/scc)
      slots: { cream: { lift: 0.35 } },
      // r2: fur skull + fur arms share the body's part id (no neck collar / stitched arm outlines); the cream face is
      // on 'face' and keeps its line; one tail surface
      merge: { tail1: 'tail0', head: 'ball', upperArmL: 'ball', upperArmR: 'ball', forearmL: 'ball', forearmR: 'ball' } },
  };
}

export default make();
