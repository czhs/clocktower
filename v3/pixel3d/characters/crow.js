// Mortimer (char-crow) — cast member "crow", villager: "Gravedigger. Very calm about it."
// Design sheet (incl. ## Unique to me, ## Self-critique): characters/crow.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/crow.ts + refs/cast/crow.png.
// Structure: palette → skeleton (chibi + hat / shovel / coat-flap bones, bent shovel arm) → parts → clips → spec.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

// [hi, mid, sh] sRGB. 5 slots + 1 accent (brass).
export const PALETTE = {
  hat: ['#86603E', '#64462F', '#4C3442'],     // signature A: dark undertaker-brown hat (v1 #4E3528; hi/mid darkened r2, sh lifted for night)
  coat: ['#6E6A82', '#56526A', '#463E54'],    // long charcoal coat (r2: hi/mid a step darker; sh ≥ #3A3040)
  feather: ['#525A80', '#36344E', '#2C2A42'], // near-black crow feathers: head, ruff, sleeves, hands, talons (blue sheen hi)
  beak: ['#FFF0C6', '#E8D2A0', '#AC927E'],    // signature B: long pale plague-doctor beak (lightest mass)
  iron: ['#D6DAE4', '#9CA2B4', '#5E5C76'],    // the shovel blade
  brass: ['#FFD27A', '#E0A040', '#9A6A3A'],   // accent: amber eyes, buttons, buckle, back half-belt
};

export const H = 1.32;                         // ground → hat crown (castHeight(33))
const BODY = { height: 1.09, heads: 2.37, legs: 0.7, arms: 0.75, shoulders: 0.46, snout: 0, ears: false, tail: false, jaw: true };
const HAT_Y = 0.44; const HAT_TILT = 12;                            // head-local brim underside (head joint = chin)
// arm segment rest directions [out°, fwd°] (L side; R mirrored). The shovel arm (R) reaches out so the planted
// shovel stands outside the coat hem. r2 (critic: shaft fused with the coat at 8/8): out 48/54 and swung BACK 10/26 so the
// shaft keeps a background gap at S, SE (dir 1) and N (shots/char-crow/r2/pk/turnaround-silhouette.png)
const ARM = { L: { up: [10, 0], fore: [8, 10] }, R: { up: [48, -10], fore: [54, -26] } };
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };

export function skeleton(opts = {}) {
  const S0 = chibi({ ...BODY, ...opts, face: { eye: [0.13, 0.25, 0.215], brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM[s].up], [`hand${s}`, ARM[s].fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a);
      const len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  // lower beak: hinge at the BACK of the beak (frog lesson: a front hinge barely moves the lip)
  S.find((b) => b.name === 'jaw').pos = [0, 0.15, 0.16];
  S.find((b) => b.name === 'jaw').limits = { fwd: [-5, 45], twist: [-10, 10], out: [-10, 10] };
  // hat: its own bone (tipped in the emote, over the face in die)
  S.push({ name: 'hat', parent: 'head', pos: [0, HAT_Y, 0], axis: 'up' });
  // shovel: a prop bone on the right hand (re-grip in vote = '.p' slide along the shaft)
  const fd = armDir(ARM.R.fore);
  S.push({ name: 'shovel', parent: 'handR', pos: [-fd[0] * 0.03 - 0.035, fd[1] * 0.03, fd[2] * 0.03], axis: 'down' });   // r2: shaft 0.035 m outboard of the fist
  // dirt clod on the blade: rest geometry is microscopic; the dig emote scales it up ('dirt.s')
  S.push({ name: 'dirt', parent: 'shovel', pos: DIRT_AT, axis: 'down' });
  // coat tails: two back flaps either side of the vent (keyed: the gait's elbow channel drives them, see locomotion)
  for (const s of ['L', 'R']) S.push({ name: `flap${s}`, parent: 'hips', pos: [(s === 'L' ? 1 : -1) * 0.085, 0.045, -0.19], axis: 'down' });
  // touch-up (ghost clips): the gold HALO floats over the hat crown (microscopic rest geometry, scaled ×1000 with
  // 'halo.s' in `ghost` only), and GHOSTK, a part-less control bone on the hips whose scale is the ghost level the
  // material reads (0 alive, 'ghostK.s' 1 → ghost, 2 → ghost-spent; see GHOST_GLSL)
  S.push({ name: 'halo', parent: 'hat', pos: HALO_AT, axis: 'up' });
  S.push({ name: 'ghostK', parent: 'hips', pos: [0, 0, 0], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}
const HALO_AT = [0, 0.50, -0.06];   // hat-local: ≈ 0.2 m over the (tilted-back) crown top (a gap like v2)

// ── shovel geometry (shovel-bone local = character axes at rest; origin = the grip) ──
// shaft direction: top leans 7° toward the body, blade end out
const SH_U = new THREE.Vector3(Math.sin(7 * Math.PI / 180), Math.cos(7 * Math.PI / 180), 0.0).normalize();
const SH = { blade0: -0.33, blade1: -0.10, top: 0.60 };
const shQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), SH_U);
const shE = new THREE.Euler().setFromQuaternion(shQ, 'XYZ');
const SH_ROT = [shE.x, shE.y, shE.z].map((r) => r * 180 / Math.PI);
const along = (t) => [SH_U.x * t, SH_U.y * t, SH_U.z * t];
const BLADE_YAW = -30;   // blade plane turned so its inner edge swings forward, clear of the coat hem
export const BLADE_AT = along((SH.blade0 + SH.blade1) / 2);
const DIRT_AT = along(SH.blade0 + 0.05).map((v, i) => v + [0, 0.03, 0][i]);   // on the blade's lower front

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint = chin): round black feathered head, back tuft, amber eyes, long pale beak (upper on head, lower on jaw)
  add('head', K.lathe([[0.12, 0], [0.225, 0.06], [0.262, 0.17], [0.255, 0.30], [0.19, 0.41], [0.05, 0.47]], 8, { sz: 0.96 }), [0, 0.235, 0], 'feather', { name: 'skull' });
  add('head', K.hull([[-0.045, 0.30, -0.17], [0.045, 0.30, -0.17], [-0.045, 0.40, -0.13], [0.045, 0.40, -0.13], [0, 0.40, -0.30], [0, 0.33, -0.27]]), [0, 0, 0], 'feather', { name: 'tuft' });
  add('eyeL', K.xf(K.box(0.07, 0.068, 0.04), { rot: [0, 34, 0] }), [0, 0, 0], 'brass', { name: 'eye', mirror: true });
  // beak frame: base B, direction u (forward, 27° down), n = up across the beak
  // r2: the long plague-doctor beak points ~37° down and runs from between the eyes to the chest (v1), 0.43 long:
  // ≥ 9 px tall at S, and its tip passes the head/ruff outline at NE/NW (the back-reading beak cue)
  const B = new THREE.Vector3(0, 0.17, 0.15), u = new THREE.Vector3(0, -0.75, 1).normalize(), n = new THREE.Vector3(0, 1, 0.75).normalize();
  const bp = (x, a, b, o = B) => { const v = o.clone().addScaledVector(u, a).addScaledVector(n, b); return [x, v.y, v.z]; };
  add('head', K.hull([bp(-0.095, 0, 0.075), bp(0.095, 0, 0.075), bp(-0.095, 0, -0.012), bp(0.095, 0, -0.012),
    bp(-0.055, 0.22, 0.045), bp(0.055, 0.22, 0.045), bp(-0.05, 0.21, -0.012), bp(0.05, 0.21, -0.012), bp(0, 0.43, -0.03)]), [0, 0, 0], 'beak', { name: 'beak' });
  const Jw = new THREE.Vector3(0, 0.15, 0.16);   // jaw joint (head-local); lower-beak points given in the beak frame
  const jp = (x, a, b) => { const v = B.clone().addScaledVector(u, a).addScaledVector(n, b).sub(Jw); return [x, v.y, v.z]; };
  add('jaw', K.hull([jp(-0.065, 0, -0.005), jp(0.065, 0, -0.005), jp(-0.065, 0, -0.055), jp(0.065, 0, -0.055),
    jp(-0.035, 0.18, -0.005), jp(0.035, 0.18, -0.005), jp(0, 0.30, -0.02), jp(0, 0.15, -0.05)]), [0, 0, 0], 'beak', { name: 'lowerBeak' });
  add('jaw', K.hull([jp(-0.05, 0.005, 0.0), jp(0.05, 0.005, 0.0), jp(-0.05, 0.005, -0.014), jp(0.05, 0.005, -0.014),
    jp(-0.02, 0.2, 0.0), jp(0.02, 0.2, 0.0), jp(-0.02, 0.2, -0.014), jp(0.02, 0.2, -0.014)]), [0, 0, 0], 'feather', { name: 'mouth' });

  // ── hat (concave signature: a drooping brim + a crown frustum sitting on it with a step; band = same crown profile).
  // Pre-tilted back HAT_TILT about the brim centre: at the 30° camera pitch a level 0.37 m brim hides the eyes.
  const hx = (geo, at) => K.xf(K.xf(geo, { at }), { rot: [-HAT_TILT, 0, 0] });
  // r2: rim 0.06 m thick (edge-on in die it rendered as 1-px arcs = "antennae")
  add('hat', hx(K.lathe([[0, 0.032], [0.41, -0.012], [0.40, 0.05], [0.19, 0.075], [0, 0.08]], 12), [0, 0.037, 0]), [0, 0, 0], 'hat', { name: 'brim' });
  const cr = (y) => 0.18 - 0.03 * (y / 0.19);   // crown radius at height y over the brim top
  add('hat', hx(K.frustum(8, cr(0), cr(0.06), 0.06), [0, 0.066 + 0.03, 0]), [0, 0, 0], 'feather', { name: 'band' });
  add('hat', hx(K.frustum(8, cr(0.06), cr(0.19), 0.13), [0, 0.066 + 0.06 + 0.065, 0]), [0, 0, 0], 'hat', { name: 'crown' });
  add('hat', hx(K.box(0.06, 0.05, 0.03), [0.06, 0.066 + 0.03, cr(0.03) * 0.93 + 0.004]), [0, 0, 0], 'brass', { name: 'buckle' });

  // ── body: long coat (skirt on hips + upper coat on chest, ONE taper), feather ruff, brass buttons + back half-belt
  const hemY = 0.10, waistY = 0.40, shY = m.shoulderY + 0.03;
  const r = (y) => 0.30 + (0.2 - 0.30) * (y - hemY) / (waistY - hemY);
  add('hips', K.frustum(8, r(hemY), r(waistY), waistY - hemY, { sz: 0.9 }), [0, (hemY + waistY) / 2 - m.hipsY, 0], 'coat', { name: 'skirt' });
  add('hips', K.frustum(8, r(hemY) - 0.004, r(hemY) - 0.004, 0.012, { sz: 0.9 }), [0, hemY - 0.006 - m.hipsY, 0], 'coat', { name: 'hemSole' });
  add('chest', K.frustum(8, 0.205, 0.17, shY - waistY + 0.01, { sz: 0.9 }), [0, (shY + waistY) / 2 - m.chestY, 0], 'coat', { name: 'coatTop' });
  add('chest', K.frustum(8, 0.225, 0.14, 0.085, { sz: 0.92 }), [0, shY + 0.025 - m.chestY, 0], 'feather', { name: 'ruff' });
  const front = (y) => 0.924 * (0.205 + (0.17 - 0.205) * (y - waistY) / (shY - waistY)) * 0.9;
  for (const y of [0.50]) add('chest', K.box(0.05, 0.05, 0.03), [0.05, y - m.chestY, front(y) + 0.006], 'brass', { name: 'button', mirror: true });
  add('chest', K.box(0.22, 0.05, 0.03), [0, 0.43 - m.chestY, -front(0.43) - 0.006], 'brass', { name: 'belt' });   // above the tails' roots
  // coat tails (flaps): slabs hanging behind the skirt from the vent, sloping out with the coat
  add('flapL', K.hull([[-0.075, 0, 0.01], [0.075, 0, 0.01], [-0.075, 0, -0.035], [0.075, 0, -0.035],
    [-0.08, -0.25, -0.08], [0.08, -0.25, -0.08], [-0.08, -0.235, -0.125], [0.08, -0.235, -0.125]]), [0, 0, 0], 'coat', { name: 'flap', mirror: true });
  // r2: ragged dark hem on each tail (two feather teeth: reads as a tail, not a fin)
  for (const [x0, x1, d] of [[-0.085, -0.005, 0.07], [0.005, 0.085, 0.05]])
    add('flapL', K.hull([[x0, -0.235, -0.074], [x1, -0.235, -0.074], [x0, -0.225, -0.13], [x1, -0.225, -0.13],
      [(x0 + x1) / 2, -0.235 - d, -0.09 - d * 0.2], [(x0 + x1) / 2, -0.23 - d, -0.12 - d * 0.2]]), [0, 0, 0], 'feather', { name: 'flapHem', mirror: true });

  // ── arms: feather sleeves (dark: a slot apart from the coat), feather hands; sleeves follow the bent rest dirs
  const seg = (bone, d, len, r0, r1, name, color = 'feather') => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((v) => v * 180 / Math.PI) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM[sd].up)), m.upperArm + 0.03, 0.072, 0.066, 'sleeve' + sd);
    seg('forearm' + sd, m3(armDir(ARM[sd].fore)), m.forearm, 0.07, 0.08, 'cuff' + sd);
    const d = armDir(ARM[sd].fore);
    add('hand' + sd, K.chamferBox(0.085, 0.08, 0.085, 0.4), [sx * d[0] * 0.035, d[1] * 0.035, d[2] * 0.035], 'feather', { name: 'hand' + sd });
  }

  // ── legs: hidden under the coat; grey-black talons only
  // r2: long splayed talons (0.24 m): on the gait's contact drawing the planted foot is C/2n ahead of the hip, so the
  // toes flick ≥ 3 texels out of the hem (the contact read at game speed)
  add('footL', K.hull([[-0.05, -0.058, -0.04], [0.05, -0.058, -0.04], [-0.04, 0.0, -0.03], [0.04, 0.0, -0.03],
    [-0.085, -0.058, 0.2], [0.085, -0.058, 0.2], [-0.06, -0.02, 0.17], [0.06, -0.02, 0.17], [0, -0.058, 0.24]]), [0, 0, 0], 'feather', { name: 'talon', mirror: true });

  // ── shovel (RIGHT hand): wooden shaft + T-grip, iron spade blade with a socket collar
  const sx = (geo, t) => add('shovel', K.xf(geo, { rot: SH_ROT }), along(t), 'hat', { name: 'shaft' });
  sx(K.box(0.08, SH.top - SH.blade1, 0.08), (SH.top + SH.blade1) / 2);
  add('shovel', K.xf(K.box(0.17, 0.055, 0.066), { rot: SH_ROT }), along(SH.top + 0.02), 'hat', { name: 'grip' });
  const bl = (SH.blade1 - SH.blade0);
  add('shovel', K.xf(K.xf(K.hull([[-0.12, bl / 2, 0.026], [0.12, bl / 2, 0.026], [-0.12, bl / 2, -0.026], [0.12, bl / 2, -0.026],
    [-0.11, -bl / 2 + 0.06, 0.026], [0.11, -bl / 2 + 0.06, 0.026], [-0.11, -bl / 2 + 0.06, -0.026], [0.11, -bl / 2 + 0.06, -0.026],
    [0, -bl / 2, 0.02], [0, -bl / 2, -0.02]]), { rot: [0, BLADE_YAW, 0] }), { rot: SH_ROT }), BLADE_AT, 'iron', { name: 'blade' });
  add('shovel', K.xf(K.box(0.09, 0.06, 0.06), { rot: SH_ROT }), along(SH.blade1 + 0.02), 'iron', { name: 'collar' });
  // dirt clod: microscopic at rest (scaled ×300 in the dig emote → 0.24 × 0.18 m, ≥ 6×5 texels); r2: near-black
  // feather slot (dark earth) so it reads against the pale iron blade at 1×
  add('dirt', K.xf(K.chamferBox(0.0008, 0.0006, 0.0008, 0.5), { rot: [0, BLADE_YAW, 0] }), [0, 0, 0], 'feather', { name: 'dirt' });
  // halo (ghost only): an open octagonal ring, r 0.17 m, bar 0.045 m (≥ 1.5 texels: no 1-px arc), built at 1/1000 size
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * Math.PI / 4;
    ring.push(K.xf(K.box(0.15, 0.045, 0.05), { rot: [0, a * 180 / Math.PI, 0], at: [Math.sin(a) * 0.165, 0, Math.cos(a) * 0.165] }));
  }
  add('halo', K.xf(K.merge(...ring), { scale: HALO_MICRO }), [0, 0, 0], 'brass', { name: 'halo' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; deltas from the authored rest: bent arms, shovel planted) ──
// Hat rule: head WORLD pitch (spine + chest + neck + head fwd) within −15…+5 in held keys.
const EYES = (sy, sx = 0) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const SHUT = EYES(-0.75), WIDE = EYES(0.3, 0.15), HALF = EYES(-0.45);
const base = (y = -0.012) => ({ pos: [0, y, 0] });
const breath = (d, extra = {}) => ({ ...base(-0.012 - 0.028 * d), chest: [4 * d, 0, 0], head: [-4 * d, 0, 0],
  upperArmL: [3 * d, 0, 0], forearmL: [10 * d, 0, 0], ...extra });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
// TAP: the shovel lifted 0.1 m (3 texels) on the speaking beats and set down between them (reads at SE, where the
// free hand is behind the body)
const TAP = { upperArmR: [16, 0, 0], handR: [-16, 0, 0], 'shovel.p': [0, 0.07, 0] };
const DIRT = { 'dirt.s': [299, 299, 299] };

// vote (r2): the shovel hoisted near-VERTICAL, held at the T grip (re-grip: '.p' −0.6 slides the shovel down the hand),
// the body leaning into the carrying side (hips 6, spine/chest 12) so the blade stands ABOVE the hat outline at all 8
// facings (the old sideways diagonal crossed the hat at dir 1 and hid behind the brim at E). Tuned with the FK
// projection probe shots/char-crow/fkvote2.js + 8-facing stills (shots/char-crow/r2/vX1-x4.png).
const VOTE_UP = { ...base(0.0), hips: [0, 0, 6], spine: [-3, 0, 12], chest: [-5, 0, 12], head: [-4, 10, -4], ...WIDE,
  upperArmR: [130, 0, 0], forearmR: [0, 0, 0], handR: [45, 0, 15], 'shovel.p': [0, -0.6, 0],
  upperArmL: [10, 0, 14], forearmL: [70, 0, 0] };
// DEAD (calm about it): he tips over forward stiff as a plank and lies face-down — the hat brim faces the camera at
// S/SE/SW (the identity disc at 25 %), coat back and tails up, the shovel lying under his right arm
// r2: the hat has FALLEN OFF and lies flat on the ground beside his head (left side): a level brim disc reads at every
// facing (edge-on in the old hold it drew 1-px arcs = "antennae" at NE/N/NW) and no longer hides the head/beak at S
const DEAD = { pos: [0, -0.14, 0.18], hips: [84, 0, 0], spine: [4, 0, 0], head: [-18, 0, 0], ...SHUT,
  hat: [-58, 0, 0], 'hat.p': [0.42, -0.285, 0.322],
  thighL: [75, 0, 0], shinL: [-110, 0, 0], thighR: [75, 0, 0], shinR: [-110, 0, 0],
  upperArmL: [-20, 0, 40], forearmL: [-10, 0, 0], upperArmR: [-30, 0, 30], forearmR: [0, 0, 0] };

// ── touch-up: GHOST look (spec-only, no shared code). The dead player hovers as a pale blue ghost (v2 ghost row of
// refs/cast/crow.png: the whole sprite re-toned pale blue, values kept, the lower body fading out, a gold halo while the
// ghost vote is unspent). The clip sets the scale of the part-less bone `ghostK`; the vertex shader reads it back from
// the bone texture as det(ghostK) / det(hips) = (1 + s)³ (rotation-free, so any pose/facing) → vCrowGhost 0 / 1 / 2.
// Fragment (toon `tones` hook): every tone (hi, mid, sh separately: the shading steps survive) is mapped by its
// lightness onto a pale ramp (ghost: slate blue → ice white; spent: a dimmer grey-blue ramp); bands in BIND height
// fade the coat toward mist (y < 0.40 / 0.28) and dissolve it (y < 0.22: checker, y < 0.15: gone — talons, hem, blade
// tip); the halo (found by its bind position) keeps its gold. Shadow casting is untouched (the ground shadow under the
// hovering figure shows the hover gap).
const HALO_MICRO = 0.001;
const lin3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
export const GHOST = {
  ghost: ['#3E5C9E', '#EEF8FF'],   // [dark end, light end] sRGB: pale blue (v2 ghost #9DB4CE…#D8E6F0)
  spent: ['#3E4662', '#9EA8C0'],   // dimmer grey-blue: the spent ghost (no halo)
  mist: '#DCE6F6',                  // the fading hem blends toward this
};
function boneOrder(S) {   // = rig.js buildCharacter topological order (the bone texture index)
  const by = new Map(S.map((b) => [b.name, b])), seen = new Set(), out = [];
  const visit = (b) => { if (seen.has(b.name)) return; if (b.parent) visit(by.get(b.parent)); seen.add(b.name); out.push(b.name); };
  S.forEach(visit);
  return out;
}
function restWorld(S, name) {
  const by = new Map(S.map((b) => [b.name, b]));
  const p = [0, 0, 0];
  for (let b = by.get(name); b; b = b.parent ? by.get(b.parent) : null) for (let i = 0; i < 3; i++) p[i] += (b.pos || [0, 0, 0])[i];
  return p;
}
function ghostMaterial(S) {
  const order = boneOrder(S), iG = order.indexOf('ghostK'), iH = order.indexOf('hips');
  const h = restWorld(S, 'halo');
  return {
    vertexHead: 'varying float vCrowGhost;',
    vertex: `
      vCrowGhost = 0.0;
      #ifdef USE_SKINNING
      {
        float dG = determinant(mat3(getBoneMatrix(${iG}.0))), dH = determinant(mat3(getBoneMatrix(${iH}.0)));
        float rg = dG / max(abs(dH), 1e-6);
        vCrowGhost = rg > 16.0 ? 2.0 : (rg > 4.0 ? 1.0 : 0.0);
      }
      #endif`,
    fragmentHead: `varying float vCrowGhost;
      vec3 crowGhostTone(vec3 c, vec3 d, vec3 l) {
        float v = sqrt(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0));   // perceptual lightness of the linear tone
        return mix(d, l, clamp((v - 0.16) * 1.6, 0.0, 1.0));
      }`,
    tones: `
      if (vCrowGhost > 0.5) {
        bool crowHalo = distance(vCharBind, vec3(${h.map((v) => v.toFixed(4)).join(', ')})) < 0.01;
        if (!crowHalo) {
          bool sp = vCrowGhost > 1.5;
          vec3 gd = sp ? ${lin3(GHOST.spent[0])} : ${lin3(GHOST.ghost[0])};
          vec3 gl = sp ? ${lin3(GHOST.spent[1])} : ${lin3(GHOST.ghost[1])};
          float y = vCharBind.y;
          ivec2 px = ivec2(gl_FragCoord.xy);
          if (y < 0.15) discard;
          if (y < 0.22 && ((px.x + px.y) & 1) == 1) discard;
          float fm = y < 0.28 ? 0.6 : (y < 0.40 ? 0.3 : 0.0);
          vec3 mist = sp ? ${lin3(GHOST.spent[1])} : ${lin3(GHOST.mist)};
          toonHi = mix(crowGhostTone(toonHi, gd, gl), mist, fm);
          toonMid = mix(crowGhostTone(toonMid, gd, gl), mist, fm);
          toonSh = mix(crowGhostTone(toonSh, gd, gl), mist, fm);
          // night: a faint self-glow keeps the ghost pale in the dark (keeper night test: luma of the hi ramp)
          float kNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
          totalEmissiveRadiance += toonMid * (sp ? 0.12 : 0.3) * kNight;
        } else {
          // the halo glows: one flat gold (emissive, unlit) at every time of day, in and out of shadow
          totalEmissiveRadiance = ${lin3(PALETTE.brass[0])};
          toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
        }
      }`,
  };
}

// ghost pose: hovering calm (the hover is `pos` y; the idle leg IK dips the hips ≤ 0.1 m to keep the — invisible —
// talons on the ground, so pos carries hover + 0.1), arms drifting out a little, coat tails trailing, the shovel held
const HOVER = 0.1;
const GHOSTK = (lv) => ({ 'ghostK.s': [lv, lv, lv] });
const HALO = { 'halo.s': [1 / HALO_MICRO - 1, 1 / HALO_MICRO - 1, 1 / HALO_MICRO - 1] };
const ghostPose = (lv, up, d, extra = {}) => ({ pos: [0, HOVER + up, 0], ...GHOSTK(lv), ...(lv === 1 ? HALO : {}),
  chest: [3 * d, 0, 0], head: [-3 * d + (lv === 2 ? 4 : 0), 0, 0], upperArmL: [8, 0, 10 + 6 * d], forearmL: [24, 0, 0],
  upperArmR: [4, 0, 4 * d], flapL: [-18 - 10 * d, 0, 0], flapR: [-28 + 10 * d, 0, 0], ...extra });
const ghostClip = (lv) => ({ fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [
  { f: 0, pose: ghostPose(lv, 0.16, 0) },
  { f: 16, pose: ghostPose(lv, 0.13, 0.5) },
  { f: 32, pose: ghostPose(lv, 0.10, 1) },
  { f: 48, pose: ghostPose(lv, 0.13, 0.5, { head: [-2 + (lv === 2 ? 4 : 0), 14, 6] }) },   // a slow look aside
] });

const POINT_ARM = [115, 0, 35];   // left upper arm: forward, 25° above level and 35° out (depth reads as height at 30° pitch: the hand clears the hat brim side)
const POINT = (extra = {}) => ({ ...base(-0.012), chest: [2, -14, 0], head: [-6, 12, 0], ...HALF,
  upperArmL: POINT_ARM, forearmL: [-8, 0, 0], handL: [0, 0, 0], 'handL.s': [-0.15, 1.0, -0.15], ...extra });

export const CLIPS = {
  // idle (calm): breathe (extremes held 30 / 30), a blink, a slow crow head-cock (tilt + turn) held 12 frames
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, SHUT) },
    { f: 38, pose: breath(1) },
    { f: 52, pose: breath(0, { head: [0, 26, 16], neck: [0, 6, 0] }) },
    { f: 64, pose: breath(0) },
  ] },
  // talk: calm orator — beak opens on alternate keys, head nod/turn, the free left hand opens out then forward
  talk: { fps: 30, loop: true, interp: 'step', length: 20, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { ...base(), chest: [-3, 8, 0], head: [-10, 12, 4], jaw: [30, 0, 0], upperArmL: [55, 0, 38], forearmL: [55, 0, 0], handL: [0, 30, 0], ...TAP } },
    { f: 5, pose: { ...base(-0.03), chest: [2, -3, 0], head: [2, -4, -4], jaw: [0, 0, 0], upperArmL: [14, 0, 10], forearmL: [35, 0, 0] } },
    { f: 10, pose: { ...base(), chest: [-3, -8, 0], head: [-10, -12, 0], jaw: [30, 0, 0], upperArmL: [80, 0, 12], forearmL: [30, 0, 0], handL: [0, 40, 0], ...TAP } },
    { f: 15, pose: { ...base(-0.03), chest: [2, 3, 0], head: [2, 6, -4], jaw: [6, 0, 0], upperArmL: [20, 0, 14], forearmL: [45, 0, 0] } },
  ] },
  // vote: 3-frame dip (shovel gathered low) → shovel hoisted blade-up over the hat, eyes wide → HELD
  vote: { fps: 30, loop: false, interp: 'step', events: { 4: 'vote@blade' }, keys: [
    { f: 0, pose: { ...base(-0.06), spine: [8, 0, 0], chest: [6, 0, 0], head: [-12, 0, 0], upperArmR: [-14, 0, 0], forearmR: [30, 0, 0], handR: [-10, 0, 0] } },
    { f: 4, pose: VOTE_UP },
    { f: 30, pose: VOTE_UP },
  ] },
  // die (calm about it): touch-up (Clocktower rule: no hurt reaction) — no flinch, no `hurt` flash: a resigned sigh
  // (chin up, beak parted, eyes half shut, free hand to the chest) → leans on the shovel, knees soften → tips forward
  // stiff as a plank (45°) → face-down, `land` dust → held
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 18: 'land' }, keys: [
    { f: 0, pose: { ...base(-0.02), spine: [-4, 0, 0], chest: [-4, 0, 0], head: [-6, -8, 4], ...HALF, jaw: [14, 0, 0], upperArmL: [40, 0, -6], forearmL: [80, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.06, 0], ...KNEES(26), spine: [10, 0, -10], chest: [6, 0, -6], head: [-12, 0, 4], ...HALF,
      upperArmR: [10, 0, -10], forearmR: [24, 0, 0], upperArmL: [6, 0, 8] } },
    { f: 14, pose: { pos: [0, -0.04, 0.08], hips: [40, 0, 0], ...KNEES(10), spine: [2, 0, 0], head: [-14, 0, 0], ...SHUT,
      hat: [-40, 0, 14], 'hat.p': [0.08, 0.05, -0.1],   // r2: the hat tips back off his head as he goes (beak + body read at S)
      upperArmR: [-20, 0, 20], forearmR: [10, 0, 0], upperArmL: [-14, 0, 30] } },
    { f: 18, pose: DEAD },
    { f: 60, pose: DEAD },
  ] },
  // point (the game's shared emote, touch-up): the free LEFT wing-hand points toward the one he faces — gathered back
  // (4) → points out forward-up, hand stretched into a feather "finger" (handL.s), chest turned so the left shoulder
  // leads, beak on the target, knowing half lids (held) → a small second emphasis (no jab at anyone: the hand lifts
  // 1–2 texels) → back to the point → lowered → idle
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { ...base(-0.03), chest: [-2, 10, 0], head: [-6, -6, 0], upperArmL: [36, 0, 34], forearmL: [70, 0, 0] } },
    { f: 4, pose: POINT() },
    { f: 22, pose: POINT({ upperArmL: [POINT_ARM[0] + 10, 0, POINT_ARM[2]], head: [-10, 8, 0], jaw: [16, 0, 0] }) },
    { f: 28, pose: POINT() },
    { f: 42, pose: breath(0, { upperArmL: [30, 0, 8], forearmL: [30, 0, 0] }) },
    { f: 48, pose: breath(0) },
  ] },
  ghost: ghostClip(1),
  'ghost-spent': ghostClip(2),
  // dig (emote): the gravedigger's scoop, unhurried — lift the shovel → slam the blade into the ground (crouch, dust) →
  // lever a clod up → fling it out to his right (dust) → a slow tip of the hat (left hand at the brim) → idle
  dig: { fps: 30, loop: false, interp: 'step', events: { 8: 'poof@blade', 26: 'poof@blade' }, keys: [
    { f: 0, pose: { ...base(0.025), spine: [-6, 0, 0], chest: [-6, -10, 0], head: [2, 8, 0], upperArmR: [34, 0, -6], forearmR: [30, 0, 0], handR: [-64, 0, 0], 'shovel.p': [0, 0.16, 0],
      upperArmL: [60, 0, -24], forearmL: [70, 0, 0] } },
    { f: 8, pose: { ...base(-0.11), spine: [18, 0, 0], chest: [8, -4, 0], head: [-22, 4, 0], upperArmR: [45, 0, -4], forearmR: [0, 0, 0], handR: [-40, 0, 0], 'shovel.p': [0, -0.13, 0],
      upperArmL: [30, 0, -10], forearmL: [60, 0, 0] } },
    // r2: the lever swings the shovel out SIDEWAYS, blade level at hand height with the dark clod on it (reads at S/SE/SW)
    { f: 16, pose: { ...base(-0.05), spine: [8, 0, 0], chest: [2, 8, 0], head: [-10, -6, 0], upperArmR: [20, 0, 40], forearmR: [0, 0, 0], handR: [0, 0, 50],
      upperArmL: [20, 0, 0], forearmL: [50, 0, 0], ...DIRT } },
    { f: 26, pose: { ...base(0.0), spine: [-6, 0, 0], chest: [-6, -24, 0], head: [-4, 20, 0], upperArmR: [60, 0, 70], forearmR: [0, 0, 0], handR: [0, 0, 0],
      upperArmL: [20, 0, 20], forearmL: [30, 0, 0] } },
    // r2: the hat tip LIFTS the hat (brim tilted back, raised 0.09 m off the head) with the free hand raised beside it —
    // the old forward tilt read as a head bow at dir 1
    { f: 34, pose: { ...base(-0.012), chest: [0, 0, 0], head: [-4, 0, 0], hat: [-22, 0, -8], 'hat.p': [0.03, 0.09, 0], ...HALF,
      upperArmL: [145, 0, 40], forearmL: [30, 0, 0], handL: [0, 0, 0] } },
    { f: 46, pose: breath(0) },
  ] },
};

export function make(opts = {}) {
  const S = skeleton(opts);
  return {
    name: 'crow',
    height: H,
    palette: PALETTE,
    signature: ['hat', 'beak'],
    faceSlot: 'feather',
    bodyPlan: 'uprightAnimal',
    heightPx: [42, 56],
    skeleton: S,
    parts: parts(S),
    sockets: { blade: { bone: 'shovel', at: BLADE_AT } },
    chains: [],
    personality: { body: { f: 2.5, zeta: 1, r: 0 }, head: { f: 2.2, zeta: 1, r: 0 } },
    gameSpeed: { v: 4 * H, drawings: 4, gait: 'scurry' },
    // LegGait ignores authored walk poses, so the gait's own channels carry the rhythm: the arm swing rocks the shovel
    // (planted-stick walk) and the free arm; the ELBOW channel of each arm is routed to that side's coat flap
    // (value = elbows + pulse on its step: tails trail back and flick alternately)
    // r2: channels SWAPPED — the arm-swing channel (±A, full amplitude) drives the coat tails (each tail trails back
    // A° on its side's step and tucks behind the skirt on the other: a ≥ 25° flick between drawings), the elbow
    // channel (el + A/2 on one drawing per cycle) drives the arms: the shovel hitches forward on the left-foot contact
    // drawing and is planted back on the other three (walking-stick hitch), the free arm swings on the other step
    locomotion: { plan: 'biped', walkSpeed: 4 * H, runSpeed: 8 * H, arms: [30, 40], elbows: [-4, -8], bob: [0.06, 0.06], lean: [4, 10],
      twist: [10, 12], lift: [0.02 * H, 0.035 * H], reach: 0.6, surge: false,
      bones: { armL: ['flapL', 'upperArmL'], armR: ['flapR', 'upperArmR'] } },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    emote: 'dig',
    fx: { dust: ['#E8D8B8', '#BCA484', '#8C7868'], spark: ['#FFF8DC', '#FFD27A'], sockets: { blade: { length: 0, tip: 0 } },
      vote: { node: 'blade' }, speech: { node: 'hat' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', flapL: 'mid', flapR: 'mid', handR: 'mid' }, ...ghostMaterial(S) },
  };
}

export default make();
