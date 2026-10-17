// Opal (char-opal) — cast member "opal", mascot 15-411: "The Optimizing Otter. Dead code fears her."
// Design sheet (Unique to me, timing charts, self-critique): characters/opal.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/opal.ts + refs/cast/opal.png.
// Body plan: upright CHIBI (chibi(), 2.3 heads; v2 draws her upright in a teal vest), LegGait 'biped' bouncy otter
// LOPE at the v2 game speed (3.95 H/s, 4 drawings / 0.27-0.3 s). The long thick tail is two KEYED bones (no springs):
// the authored walk/run (module fix M1) swish it ≥ 30° per drawing pair so it carries the rhythm. The pebble rides a
// `pebble` bone on the right paw (both paws meet at the belly in the rest = carry pose).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.16;                 // v2 29 px → castHeight 1.16 m (top of the head)
export const V_GAME = 3.95 * HEIGHT;        // 4.58 m/s

// [hi, mid, sh] sRGB. 5 slots + 1 accent (the pebble).
export const PALETTE = {
  fur: ['#C08E62', '#93603A', '#6A4434'],     // head, arms, tail (v1 #A37754 / #8C5836); r2: warm brown sh, not plum
  cream: ['#FFF2D6', '#EED8B0', '#B49A98'],   // face / whisker pad / belly (v1 #EED8B0)
  vest: ['#5AB6C6', '#268690', '#203F52'],    // signature half: the teal vest (v1 #2A8880 / #559D8F)
  dark: ['#80583E', '#563222', '#3E2C36'],    // ears, paws, LEGS + feet (v1 S tile: dark legs), nose, mouth (v1 #563222)
  eye: ['#5C4A64', '#2E2436', '#3A3040'],     // eyes only (lifted to the night floor; no black)
  pebble: ['#C4CCDC', '#A2AEC4', '#646C90'],  // accent: the smooth round pebble (v1 #A2AEC4)
};

const BODY = { height: HEIGHT, heads: 2.3, legs: 0.72, arms: 1.15, snout: 0.15, tail: false, ears: false };
// arm segment directions at rest [out°, fwd°] (L side; R mirrored): both paws meet at the belly (the pebble)
const ARM = { up: [10, 10], fore: [55, 120] };   // fore points forward-UP and inward: paws meet at the chest
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
const EYE = [0.18, 0.28, 0.211];              // head-local L eye joint, ON the 16-gon surface (r2: forward-out, above the pad)
const EYAW = 28;                            // surface normal yaw there
const TAIL0 = [0, -0.08, -0.15];            // hips-local tail root (back of the pelvis)
const TAIL1 = [0.2, -0.17, -0.12];         // tail0-local mid joint (her LEFT-back, low)
const TIP = [0.2, -0.07, 0.28];           // tail1-local tip: curls FORWARD beside her left foot (sitting-otter wrap)
const PEB = [0.126, 0.01, 0.04];          // handR-local pebble centre (between the paws, on the midline)

export function skeleton() {
  const S0 = chibi({ ...BODY, face: { eye: EYE, brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM.up], [`hand${s}`, ARM.fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  S.find((b) => b.name === 'jaw').pos = [0, 0.085, 0.2];
  // tail: two keyed bones, axis 'back' → fwd + = droop, out + = swing to her LEFT, twist = roll
  S.push({ name: 'tail0', parent: 'hips', pos: TAIL0, axis: 'back' });
  S.push({ name: 'tail1', parent: 'tail0', pos: TAIL1, axis: 'back' });
  S.push({ name: 'pebble', parent: 'handR', pos: PEB, axis: 'up' });
  S.push({ name: 'mouth', parent: 'head', pos: [0, 0.125, 0.332], axis: 'fwd' });   // r2: drawn-on mouth (scaled open by 'mouth.s')
  // r2: ears on their own bones (keyed flicks: idle head-tilt, optimize punchline, talk beat)
  for (const [n, x] of [['earL', 1], ['earR', -1]]) S.push({ name: n, parent: 'head', pos: [x * 0.13, 0.49, -0.08], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

// ── geometry helpers (in-plane subdivision + split by centroid: colour regions cut OUT of one surface, no inner line)
function subdivide(geo, maxEdge) {
  const p = geo.attributes.position.array, out = [];
  const rec = (a, b, c, d) => {
    const e = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const lab = e(a, b), lbc = e(b, c), lca = e(c, a), m = Math.max(lab, lbc, lca);
    if (m <= maxEdge || d > 8) { out.push(...a, ...b, ...c); return; }
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    if (m === lab) { const q = mid(a, b); rec(a, q, c, d + 1); rec(q, b, c, d + 1); }
    else if (m === lbc) { const q = mid(b, c); rec(a, b, q, d + 1); rec(a, q, c, d + 1); }
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
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ringHull(cs, rs, n = 8) {
  const pts = [];
  cs.forEach((c, i) => {
    const a0 = cs[Math.max(0, i - 1)], b0 = cs[Math.min(cs.length - 1, i + 1)];
    const t = norm([b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]]);
    let b = cross(t, [0, 1, 0]); if (Math.hypot(...b) < 1e-3) b = [1, 0, 0]; b = norm(b);
    const u = norm(cross(b, t));
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push([0, 1, 2].map((j) => c[j] + (Math.cos(a) * b[j] + Math.sin(a) * u[j]) * rs[i])); }
  });
  return K.hull(pts);
}
const ang = (p) => Math.abs(Math.atan2(p[0], p[2])) * 180 / Math.PI;   // 0 = front

// head profile (head-local, y 0 = chin): broad, flat otter skull, wider than tall
const HEAD = [[0.16, 0], [0.25, 0.05], [0.285, 0.15], [0.285, 0.27], [0.25, 0.38], [0.15, 0.465], [0, 0.5]];
const HSX = 1.15, HSZ = 0.9;

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head: brown skull, cream lower face cut from the same surface, whisker pad, nose, low round ears ──
  const hl = K.lathe(HEAD, 16, { sx: HSX, sz: HSZ });
  hl.computeBoundingBox();
  const hg = hl.clone().translate(0, -hl.boundingBox.min.y, 0);
  const [faceG, skullG] = splitTris(subdivide(hg, 0.035), (p) => {
    const a = ang(p);
    return (a < 80 && p[1] < 0.2 + 0.03 * Math.max(0, 1 - a / 50)) || p[1] < 0.07;
  });
  add('head', skullG, [0, 0, 0], 'fur', { name: 'skull' });
  add('head', faceG, [0, 0, 0], 'cream', { name: 'face' });
  // whisker pad: a wide cream muzzle 0.07 m proud of the face (otter profile bump), dark nose on its top front
  add('head', K.hull([[-0.15, 0.06, 0.19], [0.15, 0.06, 0.19], [-0.15, 0.23, 0.2], [0.15, 0.23, 0.2],
    [-0.11, 0.075, 0.325], [0.11, 0.075, 0.325], [-0.1, 0.2, 0.33], [0.1, 0.2, 0.33]]), [0, 0, 0], 'cream', { name: 'muzzle' });
  // r2: nose shrunk to ~2×1 texels high on the pad (the 4×2 block read as an open 'O' mouth at S)
  add('head', K.chamferBox(0.065, 0.04, 0.05, 0.3), [0, 0.218, 0.335], 'dark', { name: 'nose' });
  // r2: the mouth = a drawn-on dark plate on the pad (bone 'mouth', opened by 'mouth.s'; a hidden cavity box peeked out as a chin line)
  add('mouth', K.box(0.075, 0.026, 0.02), [0, 0, 0], 'eye', { name: 'mouthLine' });
  // jaw = lower lip under the pad (hinge at the back), drops 22° on OPEN keys together with the mouth plate
  add('jaw', K.hull([[-0.08, -0.035, -0.02], [0.08, -0.035, -0.02], [-0.08, 0.0, -0.02], [0.08, 0.0, -0.02],
    [-0.055, -0.025, 0.11], [0.055, -0.025, 0.11], [-0.06, 0.0, 0.11], [0.06, 0.0, 0.11]]), [0, 0, 0], 'cream', { name: 'jaw' });
  add('jaw', K.box(0.09, 0.012, 0.09), [0, -0.002, 0.05], 'dark', { name: 'mouthFloor' });
  // eyes: dark boxes on the surface turned to its normal, front 0.006 m proud; 1-texel glint flush in the corner
  const rotY = ([x, y, z], d) => { const a = d * Math.PI / 180; return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]; };
  const EYEC = rotY([0, 0, -0.017], EYAW);   // r2: sunk 0.017 + 0.085 wide so the inner corner stays flush (far eye no longer peeks over the brow at E/W)
  const onEye = (v) => { const r = rotY(v, EYAW); return [EYEC[0] + r[0], EYEC[1] + r[1], EYEC[2] + r[2]]; };
  add('eyeL', K.xf(K.box(0.085, 0.1, 0.045), { rot: [0, EYAW, 0] }), EYEC, 'eye', { name: 'eye', mirror: true });
  add('eyeL', K.xf(K.box(0.024, 0.024, 0.012), { rot: [0, EYAW, 0] }), onEye([0.02, 0.03, 0.02]), 'cream', { name: 'glint', mirror: true });
  // tiny round ears low on the sides of the head, sunk half into the skull
  // r2: ears UP and BACK on the top-side silhouette, FUR not dark (the dark ear seen face-on at E/W read as a cyclops eye)
  add('earL', K.xf(K.chamferBox(0.085, 0.08, 0.065, 0.35), { rot: [0, 0, -25] }), [0, 0, 0], 'fur', { name: 'ear', mirror: true });

  // ── body: brown pelvis with cream belly front, teal vest open at the front over the cream chest ──
  const pelBot = 0.24, pelTop = m.spineY + 0.03;
  const pel = K.frustum(8, 0.17, 0.2, pelTop - pelBot, { sz: 0.88 });
  const [bellyG, pelG] = splitTris(subdivide(pel, 0.03), (p) => p[2] > 0 && ang(p) < 34);
  const pAt = [0, (pelBot + pelTop) / 2 - m.hipsY, 0];
  add('hips', pelG, pAt, 'fur', { name: 'pelvis' });
  add('hips', bellyG, pAt, 'cream', { name: 'belly' });
  const vBot = m.spineY - 0.03, vTop = m.shoulderY + 0.035;
  const vest = K.frustum(8, 0.215, 0.165, vTop - vBot, { sz: 0.86 });
  const [chestG, vestG] = splitTris(subdivide(vest, 0.03), (p) => p[2] > 0 && ang(p) < 26 + 10 * (p[1] / (vTop - vBot) + 0.5));
  const vAt = [0, (vBot + vTop) / 2 - m.chestY, 0];
  add('chest', vestG, vAt, 'vest', { name: 'vest' });
  add('chest', chestG, vAt, 'cream', { name: 'chestFur' });

  // ── arms: fur upper/forearm, dark paws (bent rest: paws meet at the belly) ──
  const seg = (bone, d, len, r0, r1, name, color) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    add('upperArm' + sd, K.chamferBox(0.12, 0.12, 0.12, 0.35), [sx * 0.005, -0.02, 0], 'fur', { name: 'shoulder' + sd });
    seg('upperArm' + sd, m3(armDir(ARM.up)), m.upperArm, 0.065, 0.06, 'upper' + sd, 'fur');
    seg('forearm' + sd, m3(armDir(ARM.fore)), m.forearm + 0.01, 0.058, 0.06, 'fore' + sd, 'fur');
    const d = m3(armDir(ARM.fore));
    add('hand' + sd, K.chamferBox(0.09, 0.085, 0.09, 0.4), d.map((v) => v * 0.03), 'dark', { name: 'paw' + sd });
  }

  // ── legs: short fur legs, dark feet ──
  // r2: legs in the DARK slot (v1 S tile) so the fur tail separates from them in value (N: tail ≠ third leg)
  add('thighL', K.frustum(4, 0.085, 0.08, m.thigh + 0.03), [0, -m.thigh / 2, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.07, 0.078, m.shin), [0, -m.shin / 2, 0], 'dark', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.115, m.ankleY + 0.04, 0.18, 0.35), [0, -m.ankleY / 2 + 0.01, 0.045], 'dark', { name: 'foot', mirror: true });

  // ── tail: two thick tapering hulls (root → mid on tail0, mid → tip on tail1) ──
  add('tail0', ringHull([[0, 0.02, 0.04], [0, 0, 0], [TAIL1[0] * 0.5, TAIL1[1] * 0.5, TAIL1[2] * 0.5], TAIL1], [0.1, 0.115, 0.105, 0.09]), [0, 0, 0], 'fur', { name: 'tail' });
  add('tail1', ringHull([[0, 0, 0], [TIP[0] * 0.5, TIP[1] * 0.55, TIP[2] * 0.5], TIP], [0.085, 0.055, 0.016]), [0, 0, 0], 'fur', { name: 'tail' });   // r2: hard taper, tip ≤ 1 texel

  // ── the pebble (pebble bone on the right paw): smooth flattened round stone ──
  add('pebble', K.lathe([[0.07, 0], [0.105, 0.03], [0.115, 0.07], [0.105, 0.11], [0.07, 0.14], [0, 0.15]], 8, { sz: 0.75 }), [0, 0, 0], 'pebble', { name: 'pebble' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
// tail0/tail1 (axis back): fwd + = droop, out + = swing to her LEFT, twist = roll
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const HALF = EYES(0, -0.45);
const OPEN = { jaw: [22, 0, 0], 'mouth.s': [0.25, 1.9, 0] };   // r2: mouth open ≈ 3 texels tall (drawn-on plate + lip drop)
const WIDE = EYES(0.12, 0.15);
const PERK = { earL: [-40, 0, 0], earR: [-40, 0, 0] };   // r2: ears prick up (round, upright nubs)
// TAIL(a, b) = offsets from the STAND tail. r2: tail0 out −22, tail1 −40 ≈ the v1 S tile: low along the ground, out
// behind her LEFT so it breaks the S outline by ≈ 4 texels (sig.tail S 22 px, SE 13; r1 −70/+20 gave S 8; −10/−35 gave
// S 34 / SE 6; −40/−30 S 6 / SE 28). The walk keys swing it out behind at SE. Pose tests shots/char-opal/r2/pv-*-x3.png.
const TAIL = (a, b = 0, droop = 0) => ({ tail0: [droop, 0, -22 + a], tail1: [droop * 0.5, 0, -40 + b] });
const breathe = (d, c, extra = {}) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0], ...extra });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });

// walk/run drawings (f0 = left contact): the tail swings across ≥ 30° per drawing pair, head counter-bobs, the
// pebble paws ride a 1-texel bounce
const ARMS = (a) => ({ upperArmL: [a, 0, 0], upperArmR: [a, 0, 0] });
const walkKey = (f, { tl, t2, hd, a, ch }) => ({ f, pose: { tail0: [-6, 0, tl], tail1: [-3, 0, t2], head: [hd, 0, 0], chest: [ch, 0, 0], ...ARMS(a) } });
// optimize poses (r2): the left paw cocked up beside her cheek / pressed down on the pebble; the smug pebble-by-the-cheek
const TAP_UP = { upperArmL: [90, 0, 30], forearmL: [-60, 0, 0] };
const TAP_DOWN = { pos: [0, -0.05, 0], chest: [8, 0, 0], head: [10, 0, 0], upperArmL: [25, 0, 0], forearmL: [-20, 0, 0] };
const SMUG = { pos: [0, 0.02, 0], spine: [-2, 0, 6], chest: [-4, 0, 6], head: [-4, 0, -14], upperArmR: [10, 0, 115], forearmR: [0, 0, -55],
  tail0: [-35, 0, -10], tail1: [-40, 0, -70] };
// DEAD: floating-otter pose — lying on her back, paws limp, the pebble resting on her belly, eyes shut, tail out
// r2: rolled 80° onto her side-back (was 28°) so the body axis is ACROSS the screen at S/SW, tail laid out past her
// feet (droop +60) so N/NE are not a featureless ball. Pose tests shots/char-opal/r2/pv-d{1,2,3,4}-x4.png
const DEAD = { pos: [0, -0.28, -0.1], hips: [-70, 0, -80], spine: [4, 0, 0], chest: [4, 0, 0], head: [22, -30, 12], ...BLINK, jaw: [10, 0, 0],
  thighL: [30, 0, 18], shinL: [-30, 0, 0], thighR: [22, 0, 10], shinR: [-20, 0, 0],
  upperArmL: [-20, 0, 40], forearmL: [-30, 0, 0], upperArmR: [10, 0, 10], tail0: [60, 0, -20], tail1: [10, 0, -20] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0, TAIL(0, 0)) },
    { f: 30, pose: breathe(0.014, 2, TAIL(-8, -10)) },
    { f: 36, pose: breathe(0.028, 4, TAIL(-8, -10)) },
    { f: 50, pose: breathe(0.028, 4, { ...TAIL(-8, -10), ...BLINK }) },
    { f: 52, pose: breathe(0.028, 4, TAIL(-8, -10)) },
    { f: 60, pose: breathe(0.028, 4, { ...TAIL(14, 18), ...PERK, head: [-6, -10, 8] }) },
    { f: 66, pose: breathe(0.014, 2, TAIL(0, 0)) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    walkKey(0, { tl: -95, t2: -55, hd: 4, a: -6, ch: 4 }),
    walkKey(1, { tl: -70, t2: -70, hd: -4, a: 6, ch: 0 }),
    walkKey(2, { tl: -45, t2: -80, hd: 4, a: -6, ch: 4 }),
    walkKey(3, { tl: -70, t2: -65, hd: -4, a: 6, ch: 0 }),
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    walkKey(0, { tl: -100, t2: -60, hd: 0, a: -10, ch: 8 }),
    walkKey(1, { tl: -72, t2: -75, hd: -8, a: 10, ch: 2 }),
    walkKey(2, { tl: -44, t2: -85, hd: 0, a: -10, ch: 8 }),
    walkKey(3, { tl: -72, t2: -70, hd: -8, a: 10, ch: 2 }),
  ] },
  // talk (loop 24): the LEFT paw leaves the pebble and explains (out-low ↔ up-high, ≥ 40° per key), jaw 26° on the
  // open keys (r2: + the drawn-on mouth plate scaled 2.9× tall = OPEN), head NOT twisted away (r2: twist 0, ±5° side roll + a
  // lift on the open keys), body bob, tail flick
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 2: 'speak', 8: 'speak', 12: 'speak', 18: 'speak' }, keys: [   // r2: a beat every ≤ 0.2 s keeps ONE chained bubble (fx speech.chain); first at f2 (charcheck islands needs an FX-free f0)
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-4, -6, 0], head: [-8, 0, 5], ...OPEN, upperArmL: [20, 0, 70], forearmL: [-40, 0, 0], handL: [0, 30, 0], ...TAIL(10, 12) } },
    { f: 6, pose: { pos: [0, -0.045, 0], chest: [2, -2, 0], head: [-3, 0, -4], jaw: [3, 0, 0], ...HALF, ...TAIL(-6, -8) } },
    { f: 12, pose: { pos: [0, -0.01, 0], chest: [-4, -10, 0], head: [-8, 0, -5], ...OPEN, upperArmR: [40, 0, 115], forearmR: [-110, 0, 0], ...TAIL(10, 12) } },
    { f: 18, pose: { pos: [0, -0.045, 0], chest: [2, 2, 0], head: [-3, 0, 4], jaw: [3, 0, 0], ...HALF, ...TAIL(-6, -8) } },
  ] },
  // vote: dip (3) → the PEBBLE thrust up-and-out on her right (near side at SE), arm stretched (cartoon 1.35×), on
  // tiptoe, eyes wide, tail up — HELD
  vote: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 3: 'vote@pebbleTop' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [8, 0, 0], head: [-8, 0, 0], upperArmR: [-10, 0, 10], forearmR: [10, 0, 0], ...TAIL(0, 0, 10) } },
    { f: 3, pose: { pos: [0, 0.04, 0], spine: [-2, -12, 10], chest: [-4, -14, 12], head: [-6, 14, -14], ...WIDE, ...PERK, jaw: [8, 0, 0],
      upperArmR: [10, 0, 158], forearmR: [-110, 0, 0], 'upperArmR.s': [0.15, 0.95, 0.15], 'pebble.s': [0.05, -0.4, 0.05],
      upperArmL: [10, 0, 30], forearmL: [30, 0, 0], ...TAIL(-20, -10, -10) } },
  ] },
  // die: gentle — sway, half-lid (8) → knees fold, she sits (6) → tips back (6) → lies on her back like a floating
  // otter, pebble on the belly, eyes shut (dust ring) → HELD
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', dynamics: 'snap', events: { 20: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], spine: [-4, 0, -8], chest: [-6, 0, -8], head: [-4, -10, 12], jaw: [8, 0, 0], ...HALF, ...TAIL(-10, -10) } },
    { f: 8, pose: { pos: [0, -0.12, 0], spine: [14, 0, 6], chest: [10, 0, 0], head: [-8, -8, 0], ...BLINK, ...KNEES(55), ...TAIL(10, 10, 20) } },
    { f: 14, pose: { pos: [0, -0.18, -0.05], hips: [-45, 0, -35], spine: [6, 0, 0], chest: [6, 0, 0], head: [6, -12, 0], ...BLINK, ...KNEES(55),
      upperArmL: [-10, 0, 30], ...TAIL(15, 10, -30) } },
    { f: 20, pose: DEAD },
  ] },
  // optimize (emote, r2 redesign): eyes on the pebble, left paw cocked UP ≥ 4 texels above it (6) → TAP: paw down ON the
  // pebble, body dips, head nods, spark at the pebble (4) → paw UP again (4) → TAP 2 + spark + a dust POOF off the pebble
  // = the dead code puffing away (6) → PUNCHLINE: the pebble held up beside her cheek, smug half-lid head tilt toward it,
  // tail curled UP, star glint (14) → smug closed-eye nod (8) → stand. Pose tests shots/char-opal/r2/pv-{up3,c1,p6}-x4.png
  optimize: { fps: 30, loop: false, interp: 'step', dynamics: 'snap',
    events: { 6: 'hit@pebbleTop', 14: ['hit@pebbleTop', 'poof@pebbleTop'], 20: 'emote:star@crown' }, keys: [
    { f: 0, pose: breathe(0, 0, { pos: [0, 0.01, 0], head: [8, 0, 4], ...TAP_UP, ...TAIL(-6, -6) }) },
    { f: 6, pose: { ...TAP_DOWN, ...TAIL(12, 12) } },
    { f: 10, pose: breathe(0, 0, { pos: [0, 0.01, 0], head: [6, 0, -4], ...TAP_UP, ...TAIL(-6, -6) }) },
    { f: 14, pose: { ...TAP_DOWN, ...WIDE, ...PERK, ...TAIL(12, 12) } },
    { f: 20, pose: { ...SMUG, ...HALF, ...PERK, jaw: [4, 0, 0] } },
    { f: 34, pose: { ...SMUG, pos: [0, -0.01, 0], head: [8, 0, -10], ...BLINK, tail0: [-20, 0, -10], tail1: [-25, 0, -60] } },
    { f: 42, pose: breathe(0, 0, TAIL(0, 0)) },
  ] },
};

// vote / die end on a HELD pose (clip.hold): length after the last key, never a duplicate final key (honk r2)
CLIPS.vote.length = 31;
CLIPS.die.length = 61;

export function make() {
  const S = skeleton();
  return {
    name: 'opal',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['vest', { part: 'tail' }],
    faceSlot: 'cream',
    bodyPlan: 'uprightAnimal',
    heightPx: [38, 50],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'lope' },
    emote: 'optimize',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0.25, 0.55, 0.05] }, pebbleTop: { bone: 'pebble', at: [0, 0.15, 0.02] } },
    chains: [],
    personality: { body: { f: 3.5, zeta: 0.5, r: 0 }, head: { f: 3.5, zeta: 0.6, r: 0 } },
    locomotion: { plan: 'biped', plant: 'hold', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.18, 0.1], reach: 0.6, arms: [0, 0], elbows: [0, 0], bob: [0.05, 0.1], lean: [6, 14],
      lift: [0.07, 0.1], twist: [6, 9] },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    // r2: the tap spark spawns AT the pebbleTop socket (a 0-length 'blade'; the default weapon tip sat 0.51 m in front)
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' }, sockets: { pebbleTop: { length: 0 } }, poof: { n: 5, speed: 0.6 } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', mouth: 'mid', handR: 'mid', pebble: 'mid' },
      slots: { cream: { lift: 0.3 } },   // r2: no pebble lift (it read as a white snowball)
      merge: { earL: 'head', earR: 'head' },   // r2: no junction line ear/skull (the ear nubs read as eye dots at N/E)
      whiteKeep: 0.6 },
  };
}

export default make();
