// Clarabelle (char-clarabelle) — cast member "clarabelle", mascot 15-210: "The Parallel Cow. Does two things at once."
// Design sheet (## Unique to me, timing charts, ## Self-critique): characters/clarabelle.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/clarabelle.ts + refs/cast/clarabelle.png.
// Body plan: upright CHIBI (chibi(), 2.4 heads, v2 draws her upright) on the LegGait 'biped' plan at the v2 game speed
// (3.95 H/s, 4 drawings per ~0.3 s cycle, plant 'hold'): a bouncy skip-scurry whose authored clips.walk/run (module fix
// M1, blend 'add') swing BOTH arms together (the parallel cow), flap the ears up/down per drawing, swish the tail and
// swing the bell. Ears, tail and bell are 1-link spring chains whose targets are keyed per clip.
// Structure: palette → skeleton → geometry helpers → parts → clips → spec.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.32;                 // v2 33 px → castHeight 1.32 m (horn tips)
export const V_GAME = 3.95 * HEIGHT;        // 5.21 m/s
const SKH = 1.27;                           // chibi template height = top of the skull (the horns stand above it)

// [hi, mid, sh] sRGB. 5 slots + accent (brass bell). v1: hide #E6E0DE, spot #2E2A34, pink #E2A0A4, collar #A8343C,
// horn #E2D2AC, bell #D4A640.
export const PALETTE = {
  hide: ['#F2EEF0', '#D8D2DC', '#A49AB0'],    // white hide: head, body, arms, legs, tail rope (neutral white; golden: material.whiteKeep)
  spot: ['#62587A', '#443C4E', '#3A3040'],    // dark slate: spots, hooves, eyes, tail tuft, head tuft, mouth inside
  pink: ['#FAC4D4', '#E49CB2', '#AC6884'],    // signature: big snout + lower lip, ear insides
  red: ['#D4545C', '#A8343C', '#7A2E44'],     // collar, nostrils
  horn: ['#FAF0D2', '#E2D2AC', '#A89880'],    // horns, eye glints, vote paddle
  brass: ['#FFE08A', '#D4A640', '#9A7444'],   // accent: the bell
};

const BODY = { height: SKH, heads: 2.4, legs: 0.65, arms: 0.85, snout: 0.25, shoulders: 0.5, hips: 0.22 };
// ears: sideways paddles from the sides of the head (head-local), drooping a little
// r2: less backward (z −0.75 → −0.4), lower and longer so the near ear breaks the outline at SE and E/W (v1 T-bar)
const EAR = { at: [0.22, 0.28, -0.12], dir: [0.72, -0.35, -0.6], len: 0.4 };
// tail: rope from the back of the belly, hanging down and out to her RIGHT (v1 draws it on her right side)
const TAIL = { dir: [-0.28, -0.85, -0.45], len: 0.3 };
const BELL = { dir: [0, -1, 0.12], len: 0.1 };
const EYE = [0.1145, 0.30, 0.213];          // head-local L eye joint (on the 16-gon surface, normal yaw ≈ 23°)
const EYAW = 23;

// head profile (head-local, y 0 = chin): wide round skull, a little flattened on top
const HEAD = [[0.15, 0], [0.24, 0.05], [0.28, 0.14], [0.29, 0.25], [0.275, 0.35], [0.225, 0.43], [0.13, 0.49], [0, 0.51]];
const HEAD_SZ = 0.9;
// torso profile [r, t] with t ∈ [0, 1] from the belly bottom (hips − 0.13) to the neck (neck + 0.04)
const TORSO = [[0.07, 0], [0.15, 0.06], [0.2, 0.17], [0.222, 0.33], [0.222, 0.5], [0.205, 0.66], [0.17, 0.8], [0.13, 0.92], [0.1, 1.0]];
const TORSO_SZ = 0.86;

export function skeleton() {
  const S0 = chibi({ ...BODY,
    ears: { n: 1, at: EAR.at, dir: EAR.dir, len: EAR.len },
    tail: false,
    face: { eye: EYE, brow: false, mouth: false } });
  const m = S0.meta;
  const S = S0.map((b) => ({ ...b }));
  S.find((b) => b.name === 'jaw').pos = [0, 0.09, 0.15];
  const tb = m.hipsY - 0.13, tt = m.neckY + 0.04;
  const tailY = tb + 0.3 * (tt - tb);
  // tail (midline, rooted at x 0): one link, hanging down-back-right
  S.push({ name: 'tail0', parent: 'hips', pos: [0, tailY - m.hipsY, -0.17], axis: 'down' });
  // bell: one link hanging from the collar front
  S.push({ name: 'bell0', parent: 'chest', pos: [0, m.neckY - 0.03 - m.chestY, 0.15], axis: 'down' });
  // vote paddle ("‖"), a prop bone in the RIGHT hoof: authored at 1/20 size, scaled up only in the vote
  S.push({ name: 'paddle', parent: 'handR', pos: [0, -0.045, 0.0], axis: 'down' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

// ── geometry helpers ──────────────────────────────────────────────────────────────────────────────────────────
// in-plane subdivision + split by centroid: colour regions cut OUT of one surface (no depth step → no inner line)
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
function splitTris(arr, pred) {
  const A = [], B = [];
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    (pred(c) ? A : B).push(...arr.slice(i, i + 9));
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  return [mk(A), mk(B)];
}
// sub-profile between y0 and y1 (linear interpolation at the cut heights)
function cut(prof, y0, y1) {
  const at = (y) => { for (let i = 1; i < prof.length; i++) { const [r0, a] = prof[i - 1], [r1, b] = prof[i]; if (y <= b) return [r0 + (r1 - r0) * (y - a) / (b - a), y]; } return prof[prof.length - 1]; };
  const out = [at(y0)];
  for (const p of prof) if (p[1] > y0 && p[1] < y1) out.push(p);
  out.push(at(y1));
  return out;
}
const rAt = (prof, y) => cut(prof, y, y + 1e-6)[0][0];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
// spot test: ellipse in (azimuth φ° from the front, +90 = her LEFT; height y) space
const spotAt = (spots) => ([x, y, z]) => {
  const phi = Math.atan2(x, z) * 180 / Math.PI;
  return spots.some(([p0, y0, rp, ry]) => {
    let d = phi - p0; d = ((d + 540) % 360) - 180;
    return (d / rp) ** 2 + ((y - y0) / ry) ** 2 <= 1;
  });
};

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head: one 16-sided lathe, the dark spot over her LEFT brow cut out of its surface ──
  {
    const hl = K.lathe(HEAD, 16, { sz: HEAD_SZ });
    hl.computeBoundingBox();
    const hg = hl.clone().translate(0, -hl.boundingBox.min.y, 0);
    const [spot, rest] = splitTris(subdivide(hg, 0.035), spotAt([[85, 0.40, 60, 0.1]]));
    add('head', rest, [0, 0, 0], 'hide', { name: 'skull' });
    add('head', spot, [0, 0, 0], 'spot', { name: 'headSpot' });
  }
  // snout: the big pink muzzle on the lower face (sticks out ≈ 0.12 m past the face: the profile bulge at E/W)
  {
    const half = [[0.17, 0.075, 0.15], [0.17, 0.225, 0.15], [0.155, 0.24, 0.3], [0.14, 0.215, 0.355], [0.14, 0.1, 0.355], [0.155, 0.08, 0.32]];
    add('head', K.hull(half.flatMap(([x, y, z]) => [[x, y, z], [-x, y, z]])), [0, 0, 0], 'pink', { name: 'snout' });
    for (const s of [1, -1]) add('head', K.box(0.055, 0.042, 0.02), [s * 0.07, 0.165, 0.351], 'red', { name: 'nostril' });
    add('head', K.box(0.22, 0.05, 0.16), [0, 0.085, 0.25], 'spot', { name: 'mouthIn' });
  }
  // jaw: the lower lip under the snout (hinge at its back); opens onto the dark mouthIn
  add('jaw', K.hull([[-0.15, -0.075, 0], [0.15, -0.075, 0], [-0.15, 0.0, 0], [0.15, 0.0, 0],
    [-0.12, -0.06, 0.19], [0.12, -0.06, 0.19], [-0.13, -0.005, 0.2], [0.13, -0.005, 0.2]]), [0, 0, 0], 'pink', { name: 'jaw' });
  // eyes: dark 3×3-texel boxes on the lathe surface, turned to its normal, 1-texel glint flush in the top-outer corner
  {
    const rotY = ([x, y, z], d) => { const a = d * Math.PI / 180; return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]; };
    add('eyeL', K.xf(K.box(0.075, 0.1, 0.04), { rot: [0, EYAW, 0] }), [0, 0, 0], 'spot', { name: 'eye', mirror: true });
    add('eyeL', K.xf(K.box(0.024, 0.024, 0.012), { rot: [0, EYAW, 0] }), rotY([0.022, 0.035, 0.019], EYAW), 'horn', { name: 'glint', mirror: true });
  }
  // horns: little cream nubs on top, tipped up and out
  add('head', K.xf(K.frustum(6, 0.046, 0.024, 0.15), { rot: [0, 0, -28] }), [0.14, 0.51, 0.0], 'horn', { name: 'horn', mirror: true });
  // tuft between the horns (dark)
  add('head', K.chamferBox(0.11, 0.07, 0.09, 0.3), [0, 0.5, 0.08], 'spot', { name: 'tuft' });
  // ears: sideways paddles (hide), pink inside panel on the front face, root sunk into the skull
  {
    const u = norm(EAR.dir), L = EAR.len;
    const ring = (a, hy, hz, dz = 0) => [[-hy, -hz], [hy, -hz], [-hy, hz], [hy, hz]].map(([y, z]) => [u[0] * a, y + u[1] * a, z + dz + u[2] * a]);
    const ear = K.hull([...ring(-0.05, 0.06, 0.035), ...ring(L * 0.45, 0.075, 0.035), ...ring(L * 0.85, 0.06, 0.03), ...ring(L, 0.03, 0.02)]);
    const inner = K.hull([...ring(0.0, 0.035, 0.006, 0.035), ...ring(L * 0.45, 0.05, 0.006, 0.035), ...ring(L * 0.8, 0.035, 0.006, 0.03)]);
    add('earL0', ear, [0, 0, 0], 'hide', { name: 'ear', mirror: true });
    add('earL0', inner, [0, 0, 0], 'pink', { name: 'earIn', mirror: true });
  }

  // ── torso: one convex profile in three bands (hips / spine / chest), spots cut out of the surface ──
  const tb = m.hipsY - 0.13, tt = m.neckY + 0.04;
  const prof = TORSO.map(([r, t]) => [r, tb + t * (tt - tb)]);
  // r2: Holstein patches as big as v1 (rp ×1.45, ry ×1.4)
  const SPOTS = spotAt([[-40, tb + 0.66 * (tt - tb), 50, 0.105], [38, tb + 0.3 * (tt - tb), 46, 0.098],
    [-140, tb + 0.6 * (tt - tb), 52, 0.11], [150, tb + 0.28 * (tt - tb), 46, 0.098]]);
  const bands = [['hips', tb, m.hipsY - 0.02, m.hipsY], ['spine', m.hipsY - 0.02, m.chestY + 0.02, m.spineY], ['chest', m.chestY + 0.02, tt, m.chestY]];
  for (const [bone, y0, y1, by] of bands) {
    const g = K.lathe(cut(prof, y0, y1), 16, { sz: TORSO_SZ });
    const at = [0, (y0 + y1) / 2 - by, 0];
    const [sp, rest] = splitTris(subdivide(g, 0.035), ([x, y, z]) => SPOTS([x, y + at[1] + by, z]));
    add(bone, rest, at, 'hide', { name: 'body' });
    if (sp.attributes.position.count) add(bone, sp, at, 'spot', { name: 'bodySpot' });
  }
  // collar (red band at the neck) + the brass bell on its own chain bone
  {
    const cy = m.neckY - 0.005, r = rAt(prof, cy) + 0.02;
    add('chest', K.lathe([[r, 0], [r, 0.065]], 16, { sz: TORSO_SZ + 0.02 }), [0, cy - m.chestY, 0], 'red', { name: 'collar' });
    add('bell0', K.lathe([[0.055, 0], [0.05, 0.025], [0.035, 0.08], [0.012, 0.11]], 8), [0, -0.06, 0.015], 'brass', { name: 'bell' });
  }

  // ── arms: white, dark hooves; a spot band on her LEFT upper arm (v1) ──
  for (const sd of ['L', 'R']) {
    const ua = K.frustum(4, 0.062, 0.058, m.upperArm + 0.04);
    if (sd === 'L') {
      const [sp, rest] = splitTris(subdivide(ua, 0.03), ([, y]) => y < -0.01 && y > -0.08);
      add('upperArmL', rest, [0, -m.upperArm / 2 + 0.01, 0], 'hide', { name: 'arm' });
      add('upperArmL', sp, [0, -m.upperArm / 2 + 0.01, 0], 'spot', { name: 'armSpot' });
    } else add('upperArmR', ua, [0, -m.upperArm / 2 + 0.01, 0], 'hide', { name: 'arm' });
    // r2: her LEFT forearm is dark down to the hoof (v1 sprite), the right one stays white (it carries the paddle)
    add('forearm' + sd, K.frustum(4, 0.058, 0.056, m.forearm), [0, -m.forearm / 2, 0], sd === 'L' ? 'spot' : 'hide', { name: 'forearm' });
    add('hand' + sd, K.chamferBox(0.1, 0.09, 0.1, 0.3), [0, -0.035, 0.005], 'spot', { name: 'hoof' });
  }
  // ── legs: short white legs on dark hooves; r2: a dark patch on the outside of her RIGHT thigh ──
  {
    const th = () => K.frustum(4, 0.068, 0.064, m.thigh + 0.03), at = [0, -m.thigh / 2 + 0.01, 0];
    add('thighL', th(), at, 'hide', { name: 'thigh' });
    const [sp, rest] = splitTris(subdivide(th(), 0.025), ([x, y]) => x < 0.0 && y > -0.03);
    add('thighR', rest, at, 'hide', { name: 'thigh' });
    add('thighR', sp, at, 'spot', { name: 'thighSpot' });
  }
  add('shinL', K.frustum(4, 0.062, 0.064, m.shin), [0, -m.shin / 2, 0], 'hide', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.12, m.ankleY + 0.04, 0.16, 0.3), [0, -m.ankleY / 2 + 0.02, 0.025], 'spot', { name: 'hoofFoot', mirror: true });
  // ── tail: white rope + dark tuft ──
  {
    const d = norm(TAIL.dir), L = TAIL.len;
    const ring = (a, r) => [[-r, -r], [r, -r], [-r, r], [r, r]].map(([p, q]) => [d[0] * a + p, d[1] * a + q * 0.3, d[2] * a + q]);
    add('tail0', K.hull([...ring(-0.02, 0.035), ...ring(L * 0.8, 0.03)]), [0, 0, 0], 'hide', { name: 'tail' });
    add('tail0', K.chamferBox(0.085, 0.11, 0.085, 0.3), d.map((v) => v * L * 0.95), 'spot', { name: 'tuft' });
  }
  // ── vote paddle "‖" in the RIGHT hoof (paddle bone), authored at 1/20 size; continues the arm line (−Y at rest) ──
  {
    const LS = 0.05, sc = (g, at) => K.xf(g, { scale: [LS, LS, LS], at: at.map((v) => v * LS) });
    add('paddle', sc(K.box(0.045, 0.5, 0.045), [0, -0.22, 0]), [0, 0, 0], 'horn', { name: 'paddleStick' });
    add('paddle', sc(K.box(0.32, 0.26, 0.06), [0, -0.58, 0]), [0, 0, 0], 'horn', { name: 'paddle' });
    for (const x of [-0.065, 0.065]) for (const z of [-0.026, 0.026])
      add('paddle', sc(K.box(0.065, 0.19, 0.02), [x, -0.58, z]), [0, 0, 0], 'spot', { name: 'paddleBar' });
  }
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
// ears (sideways bones): fwd + = tip forward, out + = tip UP; tail/bell (down bones): fwd + = tip forward, out = sideways
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const HALF = EYES(0, -0.45);
const WIDE = EYES(0.1, 0.15);
const EARS = (l, r = l) => ({ earL0: l, earR0: r });
const PADDLE = { 'paddle.s': [19, 19, 19] };
const breathe = (d, c, extra = {}) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0], ...extra });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });

// walk / run (LegGait plays them, blend 'add', one key per drawing, f0 = left contact): contact = squash down, ears
// flop down, both hooves back, bell forward; flight = up, ears up, both hooves forward together; tail swishes per step.
function GAIT(dip, up, ear, arm, tail) {
  const k = (f, contact, side) => ({ f, pose: contact
    ? { pos: [0, -dip, 0], chest: [4, 0, 0], head: [-4, 0, 0], ...EARS([0, 0, -ear]), upperArmL: [-arm, 0, 6], upperArmR: [-arm, 0, 6],
      forearmL: [20, 0, 0], forearmR: [20, 0, 0], bell0: [25, 0, 0], tail0: [0, 0, side * tail] }
    : { pos: [0, up, 0], chest: [-3, 0, 0], head: [2, 0, 0], ...EARS([0, 0, ear]), upperArmL: [arm, 0, 10], upperArmR: [arm, 0, 10],
      forearmL: [45, 0, 0], forearmR: [45, 0, 0], bell0: [-25, 0, 0], tail0: [0, 0, side * tail * 0.3] } });
  return [k(0, true, 1), k(1, false, 1), k(2, true, -1), k(3, false, -1)];
}

// DEAD: lying on her LEFT side (snout and closed eyes toward the game camera at S/SE/SW), knees drawn up, ears and tail limp
const DEAD = { pos: [0, -0.3, 0], hips: [6, 0, 84], spine: [8, 0, 0], chest: [6, 0, 0], head: [-6, 10, -8], ...BLINK,
  ...EARS([0, 0, -40]), thighL: [55, 0, 0], shinL: [-70, 0, 0], thighR: [40, 0, 0], shinR: [-60, 0, 0],
  upperArmL: [30, 0, 20], forearmL: [40, 0, 0], upperArmR: [40, 0, 10], forearmR: [30, 0, 0], tail0: [0, 0, -30], jaw: [6, 0, 0] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: breathe(0, 0, { tail0: [0, 0, 10] }) },
    { f: 18, pose: breathe(0, 0, { tail0: [0, 0, 10], ...EARS([0, 0, 28], [0, 0, 0]) }) },
    { f: 22, pose: breathe(0, 0, { tail0: [0, 0, 10] }) },
    { f: 30, pose: breathe(0.014, 2, { tail0: [0, 0, -18] }) },
    { f: 36, pose: breathe(0.028, 4, { tail0: [0, 0, -18] }) },
    { f: 54, pose: breathe(0.028, 4, { tail0: [0, 0, -18], ...BLINK }) },
    { f: 56, pose: breathe(0.028, 4, { tail0: [0, 0, -18] }) },
    { f: 66, pose: breathe(0.014, 2, { tail0: [0, 0, 10] }) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: GAIT(0.03, 0.03, 30, 28, 28) },
  run: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: GAIT(0.03, 0.05, 40, 40, 35) },
  // talk (loop 24): "does two things at once" — r2: the camera-side RIGHT hoof waves out/up (big, visible at SE) while
  // the LEFT hoof taps forward, on alternate beats; jaw open on alternate keys; ears alternate up/down (one up, one down)
  talk: { fps: 30, loop: true, interp: 'step', length: 24, dynamics: 'hold', events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-4, -6, 0], head: [-8, -8, 6], jaw: [24, 0, 0], ...EARS([0, 0, 30], [0, 0, -25]),
      upperArmR: [30, 0, 95], forearmR: [50, 0, 0], upperArmL: [55, 0, 10], forearmL: [50, 0, 0], bell0: [-15, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.04, 0], chest: [2, 0, 0], head: [-4, -12, 4], jaw: [0, 0, 0], ...EARS([0, 0, -25], [0, 0, 30]),
      upperArmR: [10, 0, 30], forearmR: [20, 0, 0], upperArmL: [10, 0, 50], forearmL: [70, 0, 0], bell0: [15, 0, 0] } },
    { f: 12, pose: { pos: [0, -0.01, 0], chest: [-4, -10, 0], head: [-8, -4, 8], jaw: [22, 0, 0], ...EARS([0, 0, 30], [0, 0, -25]),
      upperArmR: [70, 0, 65], forearmR: [75, 0, 0], upperArmL: [60, 0, 10], forearmL: [20, 0, 0], bell0: [-15, 0, 0] } },
    { f: 18, pose: { pos: [0, -0.04, 0], chest: [2, 2, 0], head: [-4, -14, 4], jaw: [4, 0, 0], ...EARS([0, 0, -25], [0, 0, 30]),
      upperArmR: [10, 0, 30], forearmR: [20, 0, 0], upperArmL: [10, 0, 50], forearmL: [70, 0, 0], bell0: [15, 0, 0] } },
  ] },
  // vote: dip (4) → the "‖" paddle thrust up and out in the RIGHT hoof, eyes wide, ears up — HELD
  vote: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 4: 'vote@paddleTop' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [8, 0, 0], head: [-8, 0, 0], upperArmR: [-10, 0, 10], forearmR: [20, 0, 0], ...EARS([0, 0, -10]) } },
    { f: 4, pose: { pos: [0, 0.03, 0], spine: [-2, 0, 8], chest: [-4, 0, 8], head: [-6, -10, -10], ...WIDE, ...EARS([0, 0, 30]),
      upperArmR: [165, 0, 25], forearmR: [5, 0, 0], handR: [0, -38, 0], ...PADDLE, upperArmL: [10, 0, 20], forearmL: [30, 0, 0] } },
  ] },
  // die (gentle): sway, ears droop (8) → knees fold, she sits (6) → tips onto her back (dust ring) → HELD
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', dynamics: 'snap', events: { 18: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], spine: [-4, 0, -8], chest: [-6, 0, -8], head: [-4, -10, 12], jaw: [12, 0, 0], ...HALF, ...EARS([0, 0, -30]), tail0: [0, 0, -15] } },
    { f: 8, pose: { pos: [0, -0.14, 0], spine: [16, 0, 6], chest: [10, 0, 0], head: [-10, -8, 0], ...BLINK, ...EARS([0, 0, -40]), ...KNEES(60), tail0: [0, 0, -20] } },
    { f: 14, pose: { pos: [0, -0.4, -0.05], hips: [-8, 0, 40], spine: [14, 0, 0], chest: [10, 0, 0], head: [-4, -14, 8], ...BLINK, ...EARS([0, 0, -40]), ...KNEES(68),
      upperArmL: [-10, 0, 40], upperArmR: [-10, 0, 40], tail0: [0, 0, -25] } },
    { f: 18, pose: DEAD },
  ] },
  // moo (emote, "does two things at once"): inhale (6) → MOO: head tipped up, jaw wide, eyes shut, RIGHT hoof WAVES
  // high while the LEFT hoof POINTS forward (note glyph) → r2: the wave swings between hoof-above-the-head-front and
  // hoof-out-at-the-shoulder (≥ 6 texels at SE, in front of the head), ears flap one up / one down per beat → a second
  // short moo → settle
  moo: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 6: 'emote:note@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.04, 0], spine: [6, 0, 0], chest: [8, 0, 0], head: [6, 0, 0], ...HALF, ...EARS([0, 0, -20]),
      upperArmL: [-10, 0, 25], forearmL: [60, 0, 0], upperArmR: [-10, 0, 25], forearmR: [60, 0, 0], bell0: [20, 0, 0] } },
    { f: 6, pose: { pos: [0, 0.02, 0], spine: [-4, 0, 0], chest: [-8, 0, 0], head: [-10, 0, 0], jaw: [24, 0, 0], ...BLINK, ...EARS([0, 0, 35], [0, 0, -20]),
      upperArmR: [30, 0, 170], forearmR: [30, 0, 0], upperArmL: [85, 0, 15], forearmL: [0, 0, 0], bell0: [-25, 0, 0] } },
    { f: 14, pose: { pos: [0, 0.02, 0], spine: [-4, 0, 0], chest: [-8, 4, 0], head: [-10, 4, 0], jaw: [24, 0, 0], ...BLINK, ...EARS([0, 0, -20], [0, 0, 35]),
      upperArmR: [30, 0, 100], forearmR: [70, 0, 0], upperArmL: [85, 0, 15], forearmL: [0, 0, 0], bell0: [25, 0, 0] } },
    { f: 20, pose: { pos: [0, 0.02, 0], spine: [-4, 0, 0], chest: [-8, -4, 0], head: [-10, -4, 0], jaw: [24, 0, 0], ...BLINK, ...EARS([0, 0, 35], [0, 0, -20]),
      upperArmR: [30, 0, 170], forearmR: [30, 0, 0], upperArmL: [85, 0, 15], forearmL: [0, 0, 0], bell0: [-25, 0, 0] } },
    { f: 26, pose: { pos: [0, -0.02, 0], chest: [0, 0, 0], head: [-8, 0, 0], jaw: [8, 0, 0], ...HALF, ...EARS([0, 0, -20], [0, 0, 35]),
      upperArmR: [30, 0, 100], forearmR: [70, 0, 0], upperArmL: [85, 0, 15], forearmL: [0, 0, 0] } },
    { f: 34, pose: { pos: [0, 0.0, 0], chest: [-6, 0, 0], head: [-14, 0, 0], jaw: [22, 0, 0], ...BLINK, ...EARS([0, 0, 25]),
      upperArmR: [20, 0, 60], forearmR: [30, 0, 0], upperArmL: [40, 0, 15], forearmL: [30, 0, 0] } },
    { f: 44, pose: breathe(0, 0) },
  ] },
};

const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  return {
    name: 'clarabelle',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['pink', { part: 'ear' }, { part: 'horn' }],
    faceSlot: 'hide',
    bodyPlan: 'uprightAnimal',
    heightPx: [42, 52],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'skip' },
    emote: 'moo',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0.25, 0.62, 0.05] }, paddleTop: { bone: 'paddle', at: [0, -0.7, 0] } },
    chains: [
      { name: 'earL', bones: ['earL0'], f: 5, zeta: 0.75, r: 0, gravity: 0.15, drag: 1, limit: 35, tip: 'axis', len: EAR.len },
      { name: 'earR', bones: ['earR0'], f: 5, zeta: 0.75, r: 0, gravity: 0.15, drag: 1, limit: 35, tip: 'axis', len: EAR.len },
      { name: 'tail', bones: ['tail0'], f: 4, zeta: 0.6, r: 0, gravity: 0.4, drag: 1, limit: 45, tip: 'axis', len: TAIL.len },
      { name: 'bell', bones: ['bell0'], f: 6, zeta: 0.6, r: 0, gravity: 0.4, drag: 1, limit: 35, tip: 'axis', len: BELL.len },
    ],
    personality: { body: { f: 2.5, zeta: 0.75, r: 0 }, head: { f: 3, zeta: 0.75, r: 0 } },
    locomotion: { plan: 'biped', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4], plant: 'hold',
      duty: [0.18, 0.1], reach: 0.6, arms: [0, 0], elbows: [0, 0], bob: [0.04, 0.08], lean: [6, 12],
      lift: [0.07, 0.1], twist: [5, 8], stepYaw: 90, stepTol: 0.12, stepTime: 0.14 },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid' }, whiteKeep: 0.8 },
  };
}

export default make();
