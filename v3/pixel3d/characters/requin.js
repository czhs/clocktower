// Requin (char-requin) — cast member "requin", mascot 15-213: "A French shark in a beret. Bombs are personal."
// Design sheet (Unique to me, timing charts, self-critique): characters/requin.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/requin.ts + refs/cast/requin.png.
// Body plan: upright CHIBI skeleton (chibi() re-proportioned) wearing ONE bullet-shaped egg that is head and body at
// once: the chest bone carries the lower egg (white belly sector in front), the head bone the upper egg (snout, eyes,
// toothy grin, beret); the red neckerchief sits exactly on the seam. Stubby legs, pectoral fins = arms, dorsal fin on
// the back, crescent tail fin on a keyed tail bone (no spring: removed, see the sheet). The lit bomb dangles from the LEFT fin.
// Gait: LegGait 'biped' in 'hold' mode at 3.95 H/s + an authored 4-drawing walk = the "swim-strut" skip: the egg yaws
// toward the stepping foot, the tail sweeps the other way, the body pops into a flight drawing between contacts, the beret bounces.
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.36;                  // v2 34 px → castHeight 1.36 m (beret stalk top)
export const V_GAME = 3.95 * HEIGHT;         // 5.37 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. 5 slots + accent (spark) + 2nd accent (mouth: v1 MOUTH maroon; r2 replaced the vote baguette).
export const PALETTE = {
  skin: ['#9CB4CE', '#6C88A4', '#4C5C80'],     // v1 #6C88A4 blue-grey (signature 2: dorsal fin / tail live here)
  belly: ['#F8E8FF', '#E6DCF4', '#BCB2C6'],    // v1 #E4E2DC off-white belly; teeth, glints, fuse cord (magenta hi + whiteKeep: golden sun)
  beret: ['#58607E', '#3A3E56', '#383048'],    // signature 1: v1 #2A2632 near-black beret, lifted only in sh (night rule)
  scarf: ['#EE6262', '#C03640', '#7E2A48'],    // v1 #B8343C red neckerchief
  dark: ['#4A4258', '#342E40', '#241E2E'],     // bomb + eyes (v1 BOMB #3A3644); r2: hi capped at #4A4258 so the lit eye stays a dark eye
  spark: ['#FFF4B8', '#FFD860', '#F09A3A'],    // accent: the fuse spark (v1 #FFD860 / #FF9A3A / #FFF1B0)
  mouth: ['#74304A', '#4A1C2C', '#3A1634'],    // 2nd accent: grin inside (v1 MOUTH #4A1C2C), sh hue 312° vs scarf sh 339°
};

// ── body egg (world metres, character space; the figure stands on y 0 facing +Z) ──
const EGG = { yc: 0.67, ry: 0.45, rx: 0.30, rz: 0.275 };
const Y = { hips: 0.30, spine: 0.38, chest: 0.50, neck: 0.70, head: 0.73 };
const SEG = 16;
// superellipse egg radius factor at world height y (fuller bottom, rounder top)
function eggF(y) {
  const d = Math.max(-1, Math.min(1, (y - EGG.yc) / EGG.ry)), p = d < 0 ? 2.4 : 2.0;
  return Math.pow(Math.max(0, 1 - Math.pow(Math.abs(d), p)), 1 / p);
}
// front bulge (snout above the grin): z scale of the front half
function snoutK(y) { const u = (y - 0.885) / 0.11; return Math.abs(u) >= 1 ? 1 : 1 + 0.24 * 0.5 * (1 + Math.cos(Math.PI * u)); }
// point k of the 16-gon ring at world height y (angle 22.5k from +Z toward +X), in the local frame of a bone at by
function eggPt(y, k, by, { front = true, kz = 1 } = {}) {
  const f = eggF(y), a = (k * 22.5) * Math.PI / 180, c = Math.cos(a);
  const zk = c > 0 && front ? snoutK(y) * kz : 1;
  return [EGG.rx * f * Math.sin(a), y - by, EGG.rz * f * c * zk];
}
// convex sector of the egg between ring indices k0..k1 (≤ 8 steps = ≤ 180°) over the given heights
function sector(ys, k0, k1, by, o) {
  const pts = [];
  for (const y of ys) { pts.push([0, y - by, 0]); for (let k = k0; k <= k1; k++) pts.push(eggPt(y, k, by, o)); }
  return K.hull(pts);
}
const ringHull = (ys, by, o) => sector(ys, 0, SEG - 1, by, o);

// eye placement on the head surface (head-local), turned to the surface normal
const EYE = { x: 0.12, y: 0.995, size: 0.085 };
function eyeFrame() {
  const y = EYE.y, f = eggF(y), rx = EGG.rx * f, rz = EGG.rz * f * snoutK(y);
  const s = EYE.x / rx, c = Math.sqrt(1 - s * s);
  const yaw = Math.atan2(s / rx, c / rz) * 180 / Math.PI;
  const dd = (y - EGG.yc) / EGG.ry, slope = (EGG.rz * (-dd / Math.max(0.2, f))) / EGG.ry;   // dz/dy of the front
  const tilt = Math.atan(-slope) * 180 / Math.PI;
  return { pos: [EYE.x, y - Y.head, rz * c], yaw, tilt };
}
export const EYE_F = eyeFrame();

export function skeleton() {
  const S0 = chibi({ height: HEIGHT, heads: 2.2, legs: 0.5, arms: 0.7, snout: 0, ears: false, tail: false,
    face: { eye: EYE_F.pos, brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  const set = (n, pos) => { S.find((b) => b.name === n).pos = pos; };
  set('hips', [0, Y.hips, 0]);
  set('spine', [0, Y.spine - Y.hips, 0]);
  set('chest', [0, Y.chest - Y.spine, 0]);
  set('neck', [0, Y.neck - Y.chest, 0]);
  set('head', [0, Y.head - Y.neck, 0]);
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    set(`upperArm${L}`, [s * 0.262, 0.125, 0.03]);       // fin root on the egg surface at y 0.625
    set(`forearm${L}`, [0, -0.15, 0]);
    set(`hand${L}`, [0, -0.13, 0]);
    set(`thigh${L}`, [s * 0.10, -0.035, 0]);              // hip joints inside the egg bottom
    set(`shin${L}`, [0, -0.10, 0]);
    set(`foot${L}`, [0, -0.095, 0]);                      // ankle y 0.07
    set(`eye${L}`, [s * EYE_F.pos[0], EYE_F.pos[1], EYE_F.pos[2]]);
  }
  set('jaw', [0, 0.795 - Y.head, 0.06]);                  // hinge behind the grin, at the rest gap's floor
  S.push({ name: 'tail0', parent: 'hips', pos: [0, 0.0, -0.17], axis: [0, -0.4, -1] });
  S.push({ name: 'beret', parent: 'head', pos: [0, 1.035 - Y.head, -0.01], axis: [0, 1, 0] });
  S.push({ name: 'spark', parent: 'handL', pos: [0.17, 0.07, 0.02], axis: [0, 1, 0] });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

export function parts(S) {
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── lower egg on the chest bone: white belly = the front 90° sector (one profile, no depth step), skin behind ──
  const lowYs = [0.228, 0.26, 0.31, 0.38, 0.46, 0.55, 0.63, 0.70];
  add('chest', sector(lowYs, -3, 3, Y.chest, { front: false }), [0, 0, 0], 'belly', { name: 'belly' });
  add('chest', sector(lowYs, 3, 8, Y.chest, { front: false }), [0, 0, 0], 'skin', { name: 'bodyL' });
  add('chest', sector(lowYs, 8, 13, Y.chest, { front: false }), [0, 0, 0], 'skin', { name: 'bodyR' });
  add('chest', ringHull([0.70, 0.765], Y.chest, { front: false }), [0, 0, 0], 'skin', { name: 'bodyTop' });

  // dorsal fin on the back (chest bone, midline): base along the back 0.58-0.86, tip up-and-back
  const dorsal = K.hull([[0.05, 0.86 - Y.chest, -0.19], [-0.05, 0.86 - Y.chest, -0.19], [0.055, 0.58 - Y.chest, -0.21],
    [-0.055, 0.58 - Y.chest, -0.21], [0.02, 0.97 - Y.chest, -0.49], [-0.02, 0.97 - Y.chest, -0.49]]);
  add('chest', dorsal, [0, 0, 0], 'skin', { name: 'dorsal' });

  // ── upper egg on the head bone: cranium (snout bulge over the grin) + throat behind the mouth ──
  const crYs = [0.862, 0.90, 0.95, 1.0, 1.045, 1.085, 1.11, 1.12];
  add('head', ringHull(crYs, Y.head), [0, 0, 0], 'skin', { name: 'cranium' });
  add('head', ringHull([0.715, 0.78, 0.865], Y.head, { kz: 0.55 }), [0, 0, 0], 'skin', { name: 'throat' });
  // mouth inside (dark), behind the teeth
  add('head', K.box(0.30, 0.09, 0.16), [0, 0.818 - Y.head, 0.20], 'mouth', { name: 'mouthIn' });
  // upper teeth: 4 cream triangles hanging from the upper lip's front edge (the grin's tooth row)
  const lipY = 0.862, lip = eggF(lipY), lrx = EGG.rx * lip, lrz = EGG.rz * lip * snoutK(lipY);
  const tooth = (x, y0, y1, w, inset) => {
    const zf = lrz * Math.sqrt(Math.max(0, 1 - (x / lrx) ** 2)) - inset;
    return K.hull([[x - w / 2, y0, zf], [x + w / 2, y0, zf], [x - w / 2, y0, zf - 0.03], [x + w / 2, y0, zf - 0.03],
      [x, y1, zf - 0.005], [x, y1, zf - 0.025]]);
  };
  for (const [i, x] of [-0.125, -0.042, 0.042, 0.125].entries())
    add('head', tooth(x, lipY - Y.head + 0.004, lipY - Y.head - 0.042, 0.075, 0.012), [0, 0, 0], 'belly', { name: `toothU${i}` });

  // ── jaw (chin) on the jaw bone: the lower front sector of the head below the grin; lower teeth point up ──
  const jawY = 0.795, J = (y) => y - jawY;                // jaw-local y (joint at y 0.795, z 0.06)
  const chinPts = [];
  for (const y of [0.722, 0.76, 0.793]) {
    chinPts.push([0, J(y), 0.0 - 0.06]);
    for (let k = -3; k <= 3; k++) { const p = eggPt(y, k, 0, { kz: 1.05 }); chinPts.push([p[0], J(y), p[2] - 0.06]); }
  }
  add('jaw', K.hull(chinPts), [0, 0, 0], 'skin', { name: 'chin' });
  const cf = eggF(0.793), crx = EGG.rx * cf, crz = EGG.rz * cf * snoutK(0.793) * 1.05;
  for (const [i, x] of [-0.084, 0, 0.084].entries()) {
    const zf = crz * Math.sqrt(Math.max(0, 1 - (x / crx) ** 2)) - 0.02 - 0.06;
    add('jaw', K.hull([[x - 0.035, J(0.79), zf], [x + 0.035, J(0.79), zf], [x - 0.035, J(0.79), zf - 0.03], [x + 0.035, J(0.79), zf - 0.03],
      [x, J(0.825), zf - 0.008], [x, J(0.825), zf - 0.022]]), [0, 0, 0], 'belly', { name: `toothD${i}` });
  }

  // ── eyes: dark 0.085 boxes turned to the surface normal, 0.006 proud; glint in the upper corner toward the char's right ──
  const E = EYE_F, d2r = Math.PI / 180;
  add('eyeL', K.xf(K.box(EYE.size, EYE.size, 0.03), { rot: [-E.tilt, E.yaw, 0] }), [0, 0, 0], 'dark', { name: 'eye', mirror: true });
  const gl = (sx) => {                                     // glint offset in the eye frame → bone frame
    const lx = -0.022 * sx, ly = 0.022, lz = 0.011;         // toward the character's right (screen-left at S), up, proud
    const cy = Math.cos(E.yaw * d2r) * sx, syw = Math.sin(E.yaw * d2r), ct = Math.cos(E.tilt * d2r), st = Math.sin(E.tilt * d2r);
    const y1 = ly * ct + lz * st, z1 = -ly * st + lz * ct;  // tilt about x (front tips up)
    return [lx * Math.cos(E.yaw * d2r) + z1 * syw * sx, y1, -lx * syw * sx + z1 * Math.cos(E.yaw * d2r)];
  };
  add('eyeL', K.xf(K.box(0.024, 0.024, 0.02), { rot: [-E.tilt, E.yaw, 0], at: gl(1) }), [0, 0, 0], 'belly', { name: 'glintL' });
  add('eyeR', K.xf(K.box(0.024, 0.024, 0.02), { rot: [-E.tilt, -E.yaw, 0], at: gl(-1) }), [0, 0, 0], 'belly', { name: 'glintR' });

  // ── neckerchief on the neck bone (covers the head/chest seam): band + knot triangle hanging in front ──
  const band = [];
  for (const y of [0.695, 0.775]) for (let k = 0; k < SEG; k++) { const p = eggPt(y, k, Y.neck, { front: false }); band.push([p[0] * 1.075, p[1], p[2] * 1.085]); }
  add('neck', K.hull(band), [0, 0, 0], 'scarf', { name: 'scarf' });
  add('neck', K.hull([[-0.12, 0.70 - Y.neck, 0.315], [0.06, 0.70 - Y.neck, 0.315], [-0.12, 0.70 - Y.neck, 0.28], [0.06, 0.70 - Y.neck, 0.28],
    [-0.035, 0.605 - Y.neck, 0.30], [-0.035, 0.605 - Y.neck, 0.27]]), [0, 0, 0], 'scarf', { name: 'knot' });

  // ── beret (bone 'beret', joint on the crown): headband ring + overhanging puff (≥ 0.07 step) + stalk; cocked 14° down
  // to the character's RIGHT and 6° back (v1 beret(…, −0.6): low on the screen-left at S) ──
  const BR = { rot: [-6, 0, 14] };
  const disc = (prof, n = SEG) => K.hull(prof.flatMap(([r, y, rz]) => [...Array(n)].map((_, k) => {
    const a = (k * 360 / n) * Math.PI / 180; return [r * Math.sin(a), y, (rz ?? r) * Math.cos(a)]; })));
  add('beret', K.xf(disc([[0.178, -0.035, 0.165], [0.185, 0.045, 0.172]]), BR), [-0.02, 0, -0.01], 'beret', { name: 'beretBand' });
  add('beret', K.xf(disc([[0.20, 0.035], [0.268, 0.075], [0.258, 0.118], [0.14, 0.152]]), BR), [-0.03, 0, -0.015], 'beret', { name: 'beretPuff' });
  add('beret', K.xf(K.prism(6, 0.032, 0.07), { rot: BR.rot, at: [-0.03, 0.18, -0.01] }), [-0.03, 0, -0.015], 'beret', { name: 'beretStalk' });

  // ── pectoral fins (= arms): flat blades in the frontal plane, 0.06-0.07 thick, root on the egg ──
  const blade = (pts) => K.xf(K.hull(pts.flatMap(([x, y, t]) => [[x, y, t * 1.35], [x, y, -t * 1.35]])), { rot: [0, 18, 0] });
  add('upperArmL', blade([[-0.06, 0.05, 0.035], [0.09, 0.0, 0.035], [0.095, -0.155, 0.03], [-0.04, -0.155, 0.03]]), [0, 0, 0], 'skin', { name: 'finU', mirror: true });
  add('forearmL', blade([[-0.04, 0.006, 0.03], [0.095, 0.006, 0.03], [0.075, -0.08, 0.026], [0.02, -0.14, 0.02]]), [0, 0, 0], 'skin', { name: 'finL', mirror: true });

  // ── legs: stubby skin legs, chunky feet toed out ──
  add('thighL', K.frustum(4, 0.068, 0.062, 0.13), [0, -0.05, 0], 'skin', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.062, 0.066, 0.11), [0, -0.05, 0], 'skin', { name: 'shin', mirror: true });
  add('footL', K.xf(K.chamferBox(0.115, 0.075, 0.18, 0.35), { rot: [0, 14, 0] }), [0.008, -0.034, 0.035], 'skin', { name: 'foot', mirror: true });

  // ── tail (tail0, back-down from the hips): crescent = two convex lobes ──
  add('tail0', K.hull([[0.045, 0.11, -0.02], [-0.045, 0.11, -0.02], [0.045, -0.01, -0.07], [-0.045, -0.01, -0.07],
    [0.02, 0.28, -0.34], [-0.02, 0.28, -0.34]]), [0, 0, 0], 'skin', { name: 'tailUp' });
  add('tail0', K.hull([[0.045, 0.03, -0.06], [-0.045, 0.03, -0.06], [0.045, -0.09, -0.03], [-0.045, -0.09, -0.03],
    [0.02, -0.13, -0.27], [-0.02, -0.13, -0.27]]), [0, 0, 0], 'skin', { name: 'tailLo' });

  // ── the bomb on the LEFT fin tip (hand bone): dark ball + nozzle + cord fuse up-and-out; spark on its own bone ──
  const ball = K.hull([...Array(12)].flatMap((_, i) => [-0.75, -0.35, 0, 0.35, 0.75].map((v) => {
    const a = i * 30 * Math.PI / 180, r = 0.112 * Math.sqrt(1 - v * v); return [r * Math.sin(a), v * 0.112, r * Math.cos(a)]; }))
    .concat([[0, 0.112, 0], [0, -0.112, 0]]));
  add('handL', ball, [0.02, -0.12, 0.02], 'dark', { name: 'bomb' });
  add('handL', K.xf(K.prism(6, 0.05, 0.05), { rot: [0, 0, -40] }), [0.09, -0.04, 0.02], 'dark', { name: 'nozzle' });
  add('handL', K.hull([[0.10, -0.03, 0.002], [0.12, -0.04, 0.002], [0.10, -0.03, 0.038], [0.12, -0.04, 0.038],
    [0.16, 0.065, 0.002], [0.18, 0.055, 0.002], [0.16, 0.065, 0.038], [0.18, 0.055, 0.038]]), [0, 0, 0], 'belly', { name: 'fuse' });
  const star = K.hull([[0.045, 0, 0], [-0.045, 0, 0], [0, 0.045, 0], [0, -0.045, 0], [0, 0, 0.04], [0, 0, -0.04]]);
  add('spark', star, [0, 0, 0], 'spark', { name: 'sparkPart' });

  return P;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz grid) ──────────────────────────────────────────────────
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const SPARK_SMALL = { 'spark.s': [-0.45, -0.45, -0.45] };
const SPARK_OUT = { 'spark.s': [-1, -1, -1] };
const SPARK_BIG = { 'spark.s': [0.5, 0.5, 0.5] };
// beret cock offsets (bone 'beret', on top of the authored 14° tilt): [fwd, twist, out]
const BERET = (fwd, out, dy = 0) => ({ beret: [fwd, 0, out], ...(dy ? { 'beret.p': [0, dy, 0] } : {}) });
// fins hanging out-and-down (v1: a star at S); the bomb fin a touch forward so the bomb hangs clear of the belly
const FINS = (l = 0, r = 0) => ({ upperArmL: [42 + l, 0, 34], forearmL: [8, 0, -8], handL: [-24, 0, -12],
  upperArmR: [10 + r, 0, 40], forearmR: [6, 0, -6] });
// idle: 1 texel of breath in pos + chest; head counter-rotates; tail settles
const breathe = (d, c, t = 0) => ({ pos: [0, -0.008 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0],
  tail0: [4, 0, 32 + t], ...FINS(-c, -c) });

// talk: the bomb fin hangs LOW and OUT so the bomb clears the grin at SE (the game facing)
const TALK_BOMB = { upperArmL: [14, 0, 62], forearmL: [6, 0, -10], handL: [-12, 0, -12] };
// die hold: the bomb fin folds across the belly (body on its back) so the bomb rests on the belly
const DIE_HUG = { upperArmL: [30, 0, -20], forearmL: [60, 0, -10], handL: [10, 0, -14] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: breathe(0, 0, 4) }, { f: 12, pose: { ...breathe(0, 0, 4), ...SPARK_SMALL } }, { f: 24, pose: breathe(0, 0, 4) },
    { f: 30, pose: breathe(0.014, 1, 0) }, { f: 36, pose: breathe(0.028, 1.5, -4) }, { f: 48, pose: { ...breathe(0.028, 1.5, -4), ...SPARK_SMALL } },
    { f: 52, pose: { ...breathe(0.028, 1.5, -4), ...BLINK } }, { f: 56, pose: breathe(0.028, 1.5, -4) }, { f: 66, pose: { ...breathe(0.014, 1, 0), ...SPARK_SMALL } },
  ] },
  // walk = the game gait (LegGait 'biped' hold mode plays these upper-body keys per drawing, M1): 0 L contact, 1 pass,
  // 2 R contact, 3 pass. The egg yaws toward the stepping foot, the tail sweeps the other way, flight pops +0.06.
  // r2: the BERET bounces — it rolls ±9° with the hips yaw on the contacts and lags the body by ≈ 1 texel (up on the
  // landing, down on the flight), so the identity part swaggers with the skip.
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: { pos: [0, -0.012, 0], hips: [6, 12, 0], spine: [0, 0, 0], chest: [2, 0, -4], head: [-4, -6, 3], tail0: [6, 0, -30],
      ...BERET(-4, 10, 0.03),
      upperArmL: [-10, 0, 42], forearmL: [6, 0, -8], handL: [0, 0, -14], upperArmR: [34, 0, 36], forearmR: [20, 0, -4] } },
    { f: 1, pose: { pos: [0, 0.06, 0], hips: [6, 4, 0], chest: [2, 0, 0], head: [-4, -2, 0], tail0: [2, 0, -6], ...SPARK_SMALL,
      ...BERET(6, 2, -0.03),
      upperArmL: [8, 0, 52], forearmL: [6, 0, -8], handL: [0, 0, -14], upperArmR: [8, 0, 50], forearmR: [6, 0, -6] } },
    { f: 2, pose: { pos: [0, -0.012, 0], hips: [6, -12, 0], spine: [0, 0, 0], chest: [2, 0, 4], head: [-4, 6, -3], tail0: [6, 0, 30],
      ...BERET(-4, -10, 0.03),
      upperArmL: [30, 0, 36], forearmL: [6, 0, -8], handL: [0, 0, -14], upperArmR: [-14, 0, 42], forearmR: [6, 0, -6] } },
    { f: 3, pose: { pos: [0, 0.06, 0], hips: [6, -4, 0], chest: [2, 0, 0], head: [-4, 2, 0], tail0: [2, 0, 6], ...SPARK_SMALL,
      ...BERET(6, -2, -0.03),
      upperArmL: [8, 0, 52], forearmL: [6, 0, -8], handL: [0, 0, -14], upperArmR: [8, 0, 50], forearmR: [6, 0, -6] } },
  ] },
  // run (optional): r2 carries the bomb fin OUT to the side on every drawing (out 58-72, small fwd swing) so the bomb
  // and its spark stay together beside the body instead of hiding behind it
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: { pos: [0, -0.02, 0], hips: [14, 14, 0], chest: [4, 0, -5], head: [-12, -6, 3], tail0: [10, 0, -34], ...BERET(-6, 12, 0.03),
      upperArmL: [6, 0, 62], forearmL: [10, 0, -8], handL: [0, 0, -14], upperArmR: [50, 0, 30], forearmR: [30, 0, -4] } },
    { f: 1, pose: { pos: [0, 0.10, 0], hips: [14, 4, 0], chest: [4, 0, 0], head: [-12, -2, 0], tail0: [-4, 0, -8], ...SPARK_SMALL, ...BERET(8, 2, -0.04),
      upperArmL: [20, 0, 72], forearmL: [10, 0, -8], handL: [0, 0, -14], upperArmR: [-40, 0, 60], forearmR: [10, 0, -6] } },
    { f: 2, pose: { pos: [0, -0.02, 0], hips: [14, -14, 0], chest: [4, 0, 5], head: [-12, 6, -3], tail0: [10, 0, 34], ...BERET(-6, -12, 0.03),
      upperArmL: [34, 0, 58], forearmL: [20, 0, -8], handL: [0, 0, -14], upperArmR: [-34, 0, 30], forearmR: [10, 0, -6] } },
    { f: 3, pose: { pos: [0, 0.10, 0], hips: [14, -4, 0], chest: [4, 0, 0], head: [-12, 2, 0], tail0: [-4, 0, 8], ...SPARK_SMALL, ...BERET(8, -2, -0.04),
      upperArmL: [20, 0, 72], forearmL: [10, 0, -8], handL: [0, 0, -14], upperArmR: [-40, 0, 60], forearmR: [10, 0, -6] } },
  ] },
  // talk (loop 24): the egg rolls as one (chest ±9°), jaw opens on alternating keys (both tooth rows + maroon mouth), the
  // free RIGHT fin gestures (up-out "voilà", then forward palm-up). r2: the bomb fin stays low and OUT (clear of the
  // grin at SE), the head twists toward the camera on the open keys, the beret cocks on every beat. Two speak events per
  // loop (f2, f14; not f0: a bubble on EVERY captured frame crashes charcheck islands, module issue) = module workaround for the first-loop bubble gap (fx.speech.chain only extends a bubble from the
  // next beat; one beat per 0.8 s loop left the first bubble dead for f12-f23).
  talk: { fps: 30, loop: true, interp: 'step', length: 24, dynamics: 'hold', events: { 2: 'speak', 14: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, 0.0, 0], chest: [-3, -8, 6], head: [-6, -12, 0], jaw: [26, 0, 0], tail0: [4, 0, 24], ...BERET(-6, 10),
      ...FINS(), ...TALK_BOMB, upperArmR: [30, 0, 118], forearmR: [24, 0, 20] } },
    { f: 6, pose: { pos: [0, -0.028, 0], chest: [3, -2, -4], head: [2, -4, 0], jaw: [2, 0, 0], tail0: [4, 0, 40], ...SPARK_SMALL, ...BERET(2, 4),
      ...FINS(), ...TALK_BOMB, upperArmR: [16, 0, 46], forearmR: [10, 0, -8] } },
    { f: 12, pose: { pos: [0, 0.0, 0], chest: [-3, -8, -6], head: [-6, -12, 0], jaw: [24, 0, 0], tail0: [4, 0, 24], ...BERET(-6, -6),
      ...FINS(), ...TALK_BOMB, upperArmR: [74, 0, 62], forearmR: [40, 0, -16] } },
    { f: 18, pose: { pos: [0, -0.028, 0], chest: [3, -2, 4], head: [2, -4, 0], jaw: [3, 0, 0], tail0: [4, 0, 40], ...SPARK_SMALL, ...BERET(2, 4),
      ...FINS(), ...TALK_BOMB, upperArmR: [20, 0, 50], forearmR: [12, 0, -8] } },
  ] },
  // vote (r2): no conjured prop — he votes WITH THE BOMB. Dip (4) → the bomb fin shoots up-and-out above the beret,
  // the spark flares big, eyes wide, grin, beret cocked; HELD (length covers the sparkles).
  vote: { fps: 30, loop: false, interp: 'step', length: 40, events: { 4: 'vote@handL' }, keys: [
    { f: 0, pose: { pos: [0, -0.04, 0], chest: [6, 4, 0], head: [-2, 4, 0], tail0: [4, 0, 32], ...BERET(4, 4), ...FINS(),
      upperArmL: [40, 0, 50], forearmL: [40, 0, 0] } },
    { f: 4, pose: { pos: [0, 0.03, 0], spine: [-2, 0, -4], chest: [-4, 8, -6], head: [-8, 10, 4], jaw: [14, 0, 0], ...EYES(0.1, 0.25),
      ...BERET(0, 8), tail0: [4, 0, 32], ...FINS(), ...SPARK_BIG,
      upperArmL: [-8, 0, 166], 'upperArmL.p': [0.0, 0.08, 0], forearmL: [0, 0, 6], handL: [-6, 0, -60], upperArmR: [24, 0, 58], forearmR: [10, 0, -10] } },
  ] },
  // die (gentle, no hurt): the spark fizzles out, stiff surprise (6) → wobble, knees go (6) → topples BACKWARD (5) →
  // on its back (dust, wisp) → held BELLY-UP like a fish, tail flopped, the bomb fin folds the bomb onto the belly (r2),
  // chin tucked so the shut-eyed face looks at the camera, beret knocked askew. Legs FK.
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', length: 60, events: { 17: 'die' }, keys: [
    { f: 0, pose: { pos: [0, 0.02, 0], chest: [-4, 0, 0], head: [-4, 0, 0], ...EYES(0.05, 0.3), ...SPARK_OUT, jaw: [16, 0, 0], ...BERET(-8, 0, 0.03),
      upperArmL: [0, 0, 70], forearmL: [0, 0, -8], handL: [0, 0, -14], upperArmR: [0, 0, 70], forearmR: [0, 0, -6], tail0: [-10, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.06, -0.02], hips: [-8, 0, 6], chest: [4, 0, -6], head: [4, 0, 4], ...EYES(0, -0.5), ...SPARK_OUT, jaw: [8, 0, 0],
      thighL: [40, 0, 10], shinL: [-60, 0, 0], footL: [20, 0, 0], thighR: [40, 0, 10], shinR: [-60, 0, 0], footR: [20, 0, 0],
      upperArmL: [10, 0, 34], forearmL: [6, 0, -8], handL: [0, 0, -14], upperArmR: [10, 0, 34], forearmR: [6, 0, -6], tail0: [10, 0, 10] } },
    { f: 12, pose: { pos: [0, -0.12, -0.1], hips: [-46, 0, 4], chest: [6, 0, 0], head: [12, 0, 0], ...BLINK, ...SPARK_OUT, jaw: [10, 0, 0], ...BERET(-6, 8),
      thighL: [70, 0, 12], shinL: [-50, 0, 0], thighR: [64, 0, 16], shinR: [-56, 0, 0],
      upperArmL: [-20, 0, 60], forearmL: [0, 0, -8], handL: [0, 0, -14], upperArmR: [-20, 0, 60], forearmR: [0, 0, -6], tail0: [30, 0, 0] } },
    { f: 17, pose: { pos: [0, -0.16, -0.36], hips: [-86, -28, 8], chest: [10, 0, 0], neck: [8, 0, 0], head: [20, 6, 4], ...BLINK, ...SPARK_OUT, jaw: [12, 0, 0], ...BERET(-14, 14),
      thighL: [60, 0, 16], shinL: [-20, 0, 0], thighR: [50, 0, 22], shinR: [-30, 0, 0],
      upperArmL: [30, 0, 40], forearmL: [10, 0, -8], handL: [0, 0, -14], upperArmR: [-10, 0, 88], forearmR: [0, 0, -6], tail0: [40, 0, 0] } },
    { f: 21, pose: { pos: [0, -0.15, -0.36], hips: [-82, -28, 8], chest: [12, 0, 0], neck: [8, 0, 0], head: [24, 8, 4], ...BLINK, ...SPARK_OUT, jaw: [14, 0, 0], ...BERET(-14, 14),
      thighL: [54, 0, 16], shinL: [-26, 0, 0], thighR: [44, 0, 22], shinR: [-36, 0, 0],
      ...DIE_HUG, upperArmR: [-4, 0, 80], forearmR: [10, 0, -6], tail0: [26, 0, -14] } },
  ] },
  // personal (emote, "bombs are personal"): bomb up to the chest, a look (6) → right fin flicks at the fuse, spark FX (6)
  // → the SHRUG (r2): CHIN UP (head pitched back, twisted to the camera), both fins out-and-up 140°, half-lidded smug
  // grin, beret cocked jauntily, heart glyph (12) → hugs the bomb, smoke pop (10) → idle
  personal: { fps: 30, loop: false, interp: 'step', events: { 6: 'sparkle@fuse', 12: 'emote:heart', 24: 'poof@fuse' }, keys: [
    { f: 0, pose: { pos: [0, -0.02, 0], chest: [4, 8, 0], head: [-2, 10, 0], jaw: [4, 0, 0], ...BERET(2, 4),
      upperArmL: [64, 0, 34], forearmL: [40, 0, -10], handL: [0, 0, -14], upperArmR: [40, 0, 50], forearmR: [30, 0, -10], tail0: [4, 0, 32] } },
    { f: 6, pose: { pos: [0, -0.03, 0], chest: [6, 14, 0], head: [0, 12, 0], jaw: [10, 0, 0], ...EYES(0.05, 0.15), ...BERET(4, 6),
      upperArmL: [66, 0, 30], forearmL: [44, 0, -10], handL: [0, 0, -14], upperArmR: [76, 0, 8], forearmR: [56, 0, -30], tail0: [4, 0, 40] } },
    { f: 12, pose: { pos: [0, 0.035, 0], spine: [-4, 0, 0], chest: [-8, 12, 0], head: [-16, 14, 0], jaw: [18, 0, 0], ...EYES(0.05, -0.5), ...BERET(-8, 16),
      upperArmL: [14, 0, 140], forearmL: [10, 0, 24], handL: [0, 0, -24], upperArmR: [14, 0, 140], forearmR: [10, 0, 24], tail0: [4, 0, 14] } },
    { f: 24, pose: { pos: [0, -0.02, 0], chest: [4, 6, 6], head: [2, 4, 10], jaw: [6, 0, 0], ...EYES(0, -0.7), ...BERET(4, -6),
      upperArmL: [70, 0, 20], forearmL: [60, 0, -20], handL: [0, 0, -14], upperArmR: [60, 0, 20], forearmR: [60, 0, -20], tail0: [4, 0, 40] } },
    { f: 34, pose: breathe(0, 0, 4) },
  ] },
};

export function make() {
  const S = skeleton();
  return {
    name: 'requin',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['beret', { part: 'dorsal' }],
    faceSlot: 'skin',
    bodyPlan: 'uprightAnimal',
    heightPx: [42, 54],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'prance' },
    emote: 'personal',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0, 0.68, 0] }, fuse: { bone: 'spark', at: [0, 0, 0] } },
    personality: { body: { f: 2.8, zeta: 0.7, r: -0.3 }, head: { f: 3, zeta: 0.75, r: 0 } },
    locomotion: { plan: 'biped', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.25, 0.2], lift: [0.05, 0.07], plant: 'hold', surge: false },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { slots: { belly: { lift: 0.18 } }, sides: { eyeL: 'mid', eyeR: 'mid', handL: 'mid', handR: 'mid', spark: 'mid' }, whiteKeep: 1 },
  };
}

export default make();
