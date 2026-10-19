// Keeper (char-keeper) — an old, stooped lantern-keeper of the ruins. Design sheet: characters/keeper.md.
// Built by following docs/CHARACTER_PLAYBOOK.md (copied structure from characters/wanderer.js).
// Structure: palette → skeleton (biped + a 1-link lantern chain) → parts → sockets → clips → spec,
// plus two things the shared modules have no hook for (see keeper.md §7):
//   * the lantern GLASS glows through a characterMaterial `tones` GLSL hook (emissive; steady by day, a 4-level
//     flicker stepped every 4 grid frames at night) — no shared-code change, works in every scene;
//   * the night PointLight needs scene code: `attachLantern(engine, ch)` / `attachLanternLight(engine, socketObj)`.
//
// SIGN CONVENTION GOTCHA (measured, shots/char-keeper/t-v*.png): `fwd +` on an UP bone (spine/chest) tips its top
// forward = rotates every down-hanging child BACK. So the world pitch of the forearm is
//   a = upperArmR.fwd + forearmR.fwd − (spine.fwd + chest.fwd)
// arm() takes world pitches (forearm fw, staff s) and lets the wrist take the difference, so the staff (built for an
// upright hand) stands at pitch s. Arms raised SIDEWAYS (out ≥ 90: raise, thump hoist) break that planar formula —
// those keys are raw triples (LIFT, HOIST) tuned on 8-facing key grids (shots/char-keeper/k-*-x3.png).
//
// r2 (critic-keeper-r1, 14/24): staff carried outboard at the right hip + hook pointing out-and-back (lantern beside the
// hood at S/SE/SW, never on the face), big peaked cowl as the 2nd signature mass with its own pale value, arch face
// hollow, thump = side hoist → slam, raise = arm up beside the hood (lantern ≈ 0.35 m over the peak), 4-drawing cane
// walk with a staff plant, warmer night light, idle that never swings the lantern (determinism workaround).
import * as THREE from 'three';
import { biped } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

// [hi, mid, sh] sRGB. 5 slots + 1 accent (glow). Shadow hues differ: lavender / mauve / brown-rose / rose / slate.
// r2 value plan (critic r1: "hood, mantle and robe one mid-brown mass"): the HOOD + mantle are a pale dusty mauve
// (cloak), the robe below the mantle + the staff a dark brown (robe) → three value steps head → body: beard (lightest)
// / hood / robe.
export const PALETTE = {
  beard: ['#F6F1E4', '#DAD3C6', '#A29CB4'],   // signature part 1: the lightest mass
  cloak: ['#CDB7A8', '#977F7C', '#6C586C'],   // signature part 2: the big peaked hood + shoulder mantle
  robe: ['#A27A58', '#6E4E3A', '#503A40'],    // robe, waist, chest, staff + hook (dark warm brown)
  skin: ['#F2C7A2', '#CF9877', '#8E5F6C'],
  dark: ['#6E6A80', '#45405A', '#2E2A3E'],    // face hollow, sleeves, leggings, boots, rope belt, lantern cap/base
  glow: ['#FFF4C2', '#FFD27A', '#F0A050'],    // accent: lantern glass (emissive via the tones hook)
};

const BASE = { height: 1.30, heads: 3.6, shoulders: 0.34 };
const STOOP = { spine: 12, chest: 10 };                  // idle stoop (deg, fwd)
// staff socket on handR: +Z = down the shaft to the butt, +Y = forward (in an upright hand), +X = the keeper's left.
// Every staff pose goes through arm(): the WRIST cancels the arm so the staff stands at the asked world pitch and the
// hand frame is world-upright whenever the staff is plumb (the lantern chain's un-aimed direction is the hand's −Y;
// plumb in idle keeps the first drawing after a re-simulation plumb — see keeper.md §8a).
// r2: the staff is carried OUTBOARD at the right hip (grip on the outer side of the hand, arm out 30°): at the pack
// facing (SE) a staff held in front-right projected onto the face (critic r1); beside the hip it clears the hood at
// S/SE/SW (screen x ≈ 0.71·(x + z) at SE → x + z ≤ −0.42 m).
const STAFF = { at: [-0.05, -0.04, -0.01], rot: [90, 0, 0] };
const LB = 0.53, LT = 0.92;                              // staff: grip → butt, grip → top (m)
// hook arm: OUT to the keeper's right and a little BACK (210° from socket +X = −X·cos30 − Z·sin30 in an upright hand),
// so the lantern hangs beside the hood, away from the face, at S, SE and SW (and behind the head line at E).
const HOOK_ANG = 210, HOOK_LEN = 0.19;
const HOOK = [HOOK_LEN * Math.cos(HOOK_ANG * Math.PI / 180), HOOK_LEN * Math.sin(HOOK_ANG * Math.PI / 180), -LT + 0.035];

function socketToHand(p) {                               // socket-space point → handR-local (rest frame = char axes)
  const v = new THREE.Vector3(...p).applyEuler(new THREE.Euler(...STAFF.rot.map((d) => d * Math.PI / 180), 'XYZ'));
  return [v.x + STAFF.at[0], v.y + STAFF.at[1], v.z + STAFF.at[2]];
}

export function skeleton(opts = {}) {
  return biped({ ...BASE, ...opts, chains: {
    // lantern: ONE link rooted at the hook tip. The last link of a chain aims its bone-local −Y (the Character uses
    // childLocal (0,−0.12,0)), so the lantern geometry hangs straight down (−Y) from the joint.
    lantern: { n: 1, parent: 'handR', at: socketToHand(HOOK), dir: [0, -1, 0], len: 0.12 },
  } });
}

// 8-sided ring (flat faces to ±X/±Z), centre z, depth scale sz → points for a hull
const ring8 = (r, y, z, sz = 1) => Array.from({ length: 8 }, (_, i) => {
  const a = (i + 0.5) * Math.PI / 4;
  return [r * Math.sin(a), y, z + r * Math.cos(a) * sz];
});

const MANTLE = true;                     // (A/B: the walk specks under the hood are not the mantle)
export function parts(S) {
  const m = S.meta, k = m.k;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  const tilt = (g, deg) => K.xf(g, { rot: [deg, 0, 0] });               // about the head joint (chin)

  // ── head (joint ≈ chin). HOOD = ONE convex hull of 8-sided rings whose centres slide BACK as they rise → a big cowl
  // (0.54 m across, 1.14 × the mantle) ending in a back-tipped point 0.11 m above the last ring (≈ 4 texels).
  const HOOD = [[0.25, -0.06, -0.01], [0.29, 0.08, -0.02], [0.28, 0.2, -0.04], [0.22, 0.31, -0.08], [0.12, 0.41, -0.14]];
  const hoodPts = HOOD.flatMap(([r, y, z]) => ring8(r * k, y * k, z * k, 1.06));
  hoodPts.push([0, 0.52 * k, -0.23 * k]);                                // the peak
  add('head', tilt(K.hull(hoodPts), -10), [0, 0, 0], 'cloak', { name: 'hood' });
  // face hollow: a pointed ARCH (0.2 m wide = 37 % of the hood, narrowing to a point), 0.035 m proud of the hood
  // front; the beard + moustache fill its bottom, the nose peeks out in the middle (r1: a full-width box = a visor).
  const ARCH = [[-0.1, 0], [0.1, 0], [0.1, 0.12], [0.065, 0.2], [0, 0.25], [-0.065, 0.2], [-0.1, 0.12]].map(([x, y]) => [x * k, y * k]);
  add('head', tilt(K.xf(K.extrude(ARCH, 0.07 * k), { at: [0, 0.125 * k, 0.27 * k] }), -10), [0, 0, 0], 'dark', { name: 'faceHole' });
  add('head', tilt(K.xf(K.box(0.075 * k, 0.07 * k, 0.07 * k), { at: [0, 0.135 * k, 0.315 * k] }), -10), [0, 0, 0], 'skin', { name: 'nose' });
  // beard: a hull whose FRONT face leans forward at the bottom (normal tipped up, so it stays in the lit band)
  const B = (x, y, z) => [x * k, y * k, z * k];
  add('head', K.hull([B(-0.11, 0.11, 0.17), B(0.11, 0.11, 0.17), B(-0.11, 0.11, 0.28), B(0.11, 0.11, 0.28),
    B(-0.12, -0.03, 0.18), B(0.12, -0.03, 0.18), B(-0.12, -0.03, 0.33), B(0.12, -0.03, 0.33),
    B(-0.035, -0.29, 0.30), B(0.035, -0.29, 0.30), B(-0.035, -0.29, 0.40), B(0.035, -0.29, 0.40)]), [0, 0, 0], 'beard', { name: 'beard' });

  // ── torso: pale mantle over the shoulders (0.47 m across, narrower than the hood) + dark robe body below it
  const chestH = m.shoulderY - m.chestY + 0.04 * k;
  const mH = 0.24 * k, mTop = m.neckY - m.chestY + 0.01 * k;
  if (MANTLE) add('chest', K.frustum(8, 0.255 * k, 0.14 * k, mH, { sz: 0.86 }), [0, mTop - mH / 2, -0.01 * k], 'cloak', { name: 'mantle' });
  add('chest', K.chamferBox(0.3 * k, chestH, 0.25 * k, 0.3), [0, chestH / 2 - 0.01 * k, 0], 'robe', { name: 'chest' });
  add('spine', K.chamferBox(0.31 * k, (m.chestY - m.spineY) + 0.03 * k, 0.25 * k, 0.3), [0, (m.chestY - m.spineY) / 2, 0], 'robe', { name: 'waist' });
  const skTop = m.spineY - m.hipsY + 0.02 * k, skBot = 0.16 - m.hipsY;
  add('hips', K.frustum(8, 0.28 * k, 0.185 * k, skTop - skBot, { sz: 0.9 }), [0, (skTop + skBot) / 2, 0], 'robe', { name: 'robeSkirt' });
  add('hips', K.frustum(8, 0.205 * k, 0.2 * k, 0.055 * k, { sz: 0.9 }), [0, skTop - 0.04 * k, 0], 'dark', { name: 'belt' });

  // ── arms: dark under-robe sleeves (bell cuff), skin hands
  add('upperArmL', K.frustum(4, 0.072 * k, 0.066 * k, m.upperArm + 0.02 * k), [0, -m.upperArm / 2 + 0.005 * k, 0], 'dark', { name: 'sleeve', mirror: true });
  add('forearmL', K.frustum(4, 0.088 * k, 0.064 * k, m.forearm), [0, -m.forearm / 2, 0], 'dark', { name: 'cuff', mirror: true });
  add('handL', K.chamferBox(0.085 * k, 0.085 * k, 0.09 * k, 0.4), [0, -0.035 * k, 0.005 * k], 'skin', { name: 'hand', mirror: true });

  // ── legs: dark leggings (only the shins show under the robe), dark boots
  add('thighL', K.box(0.105 * k, m.thigh + 0.03 * k, 0.11 * k), [0, -m.thigh / 2 + 0.005 * k, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.07 * k, 0.065 * k, m.shin + 0.01 * k), [0, -m.shin / 2 - 0.005 * k, 0], 'dark', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.115 * k, m.ankleY + 0.01, 0.21 * k, 0.4), [0, -m.ankleY / 2 + 0.005, 0.045 * k], 'dark', { name: 'boot', mirror: true });

  // ── staff in socket space (+Z = butt, −Z = top, +Y = forward), then placed like the socket
  const staff = (g, color, name) => add('handR', K.xf(g, { rot: STAFF.rot, at: STAFF.at }), [0, 0, 0], color, { name });
  staff(K.xf(K.box(0.065, 0.065, LB + LT), { at: [0, 0, (LB - LT) / 2] }), 'robe', 'shaft');
  staff(K.xf(K.box(0.075, 0.075, 0.08), { at: [0, 0, -LT - 0.02] }), 'robe', 'knob');
  staff(K.xf(K.box(HOOK_LEN + 0.03, 0.06, 0.06), { rot: [0, 0, HOOK_ANG], at: [HOOK[0] / 2, HOOK[1] / 2, -LT] }), 'robe', 'hookArm');
  staff(K.xf(K.box(0.055, 0.055, 0.07), { at: [HOOK[0], HOOK[1], -LT + 0.04] }), 'robe', 'hookTip');

  // ── lantern on lantern0 (joint = hook tip, hangs along −Y): cap, glowing glass, base
  add('lantern0', K.frustum(4, 0.095, 0.045, 0.07), [0, -0.055, 0], 'dark', { name: 'cap' });
  add('lantern0', K.box(0.12, 0.13, 0.12), [0, -0.155, 0], 'glow', { name: 'glass' });
  add('lantern0', K.box(0.14, 0.04, 0.14), [0, -0.238, 0], 'dark', { name: 'base' });
  return P;
}

// ── glow: emissive lantern glass through the toon `tones` hook (fragment, after the vertex colour). The glass is
// recognised by its mid tone (the vertex colour); its lit tones are zeroed and the glow goes into
// totalEmissiveRadiance (added after lighting, point lights and the far-half shadow). Night = the night ramp
// (uRampHi luma ≈ 0.29 vs ≥ 0.64 for noon/golden/morning). Flicker: 4 levels, a new level every 4 grid frames
// (7.5 Hz → changes only on even 60 Hz frames), hash12 of the step index = the same sequence as attachLanternLight.
export const FLICKER = { fps: 7.5, levels: [0.62, 0.78, 0.9, 1.0], seed: 17 };
const glsl3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
const F = (i) => FLICKER.levels[i].toFixed(3);
const GLOW_TONES = /* glsl */`
  if (distance(diffuseColor.rgb, ${glsl3(PALETTE.glow[1])}) < 0.03) {
    float kNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
    float kStep = floor(uTime * ${FLICKER.fps.toFixed(2)} + 0.001);
    float kH = hash12(vec2(kStep, ${FLICKER.seed.toFixed(1)}));
    float kLev = kH < 0.25 ? ${F(0)} : kH < 0.5 ? ${F(1)} : kH < 0.75 ? ${F(2)} : ${F(3)};
    totalEmissiveRadiance = mix(${glsl3(PALETTE.glow[1])}, ${glsl3(PALETTE.glow[0])} * kLev, kNight);
    toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
  }`;

/** The same stepped level the glass shader shows at time t (night), for the PointLight. */
export function flickerLevel(t) {
  const step = Math.floor(t * FLICKER.fps + 0.001);
  const qx = Math.imul(step | 0, 1597334673) >>> 0, qy = Math.imul(FLICKER.seed, 3812015801 | 0) >>> 0;
  const h = (Math.imul((qx ^ qy) >>> 0, 1597334673) >>> 0) / 4294967295;
  return FLICKER.levels[h < 0.25 ? 0 : h < 0.5 ? 1 : h < 0.75 ? 2 : 3];
}

/**
 * Night lantern light (scene code — no shared module attaches lights from a spec). Adds a PointLight under the
 * lantern socket (it swings with the chain) whose intensity follows flickerLevel(t) at night and is 0 otherwise
 * (the light always exists, so the point-light count and the shader programs never change).
 */
export function attachLanternLight(engine, socket, { color = '#FF5A28', intensity = 2.6, distance = 2.4, decay = 1.5, nightOnly = true } = {}) {
  const pl = new THREE.PointLight(new THREE.Color(color), 0, distance, decay);
  pl.name = 'keeper-lantern-light';
  socket.add(pl);
  // night = the same test as the glass shader (the engine has no time-of-day flag): luma of the toon ramp's hi colour,
  // ≈ 0.29 at night vs ≥ 0.64 for noon/golden/morning → kNight = 1 − smoothstep(0.35, 0.6, luma)
  const nightK = () => {
    const c = engine.toonUniforms?.uRampHi?.value;
    if (!c) return 0;
    const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b, u = Math.min(1, Math.max(0, (l - 0.35) / 0.25));
    return 1 - u * u * (3 - 2 * u);
  };
  const set = (t) => {
    const k = nightOnly ? nightK() : 1;
    pl.intensity = intensity * flickerLevel(t) * k;
  };
  set(engine.time ?? 0);
  engine.onUpdate((t) => set(t));
  return pl;
}
export function attachLantern(engine, ch, opts) {
  const s = (ch.rig ?? ch).sockets?.lantern;
  return s ? attachLanternLight(engine, s, opts) : null;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz key grid) ──
// World pitch of the forearm ≈ upperArmR.fwd + forearmR.fwd − (spine.fwd + chest.fwd) (fwd + on an UP bone tips its top
// forward = rotates the down-hanging children back). arm() takes WORLD pitches: fw = forearm (0 down, 90 forward, 180
// up), s = staff (0 plumb, > 0 butt swung forward / top back); the wrist takes the difference. out = arm abduction (the
// wrist cancels it, so the staff stays in the vertical plane), roll = extra wrist out.
const arm = (spine, chest, upper, fw, s = 0, out = 30, roll = 0) => ({
  upperArmR: [upper, 0, out], forearmR: [fw + spine + chest - upper, 0, -3], handR: [s - fw, 0, -(out - 3) + roll],
});
const CARRY = { upper: -14, fw: 22, out: 30 };            // idle carry: hand at the right hip, staff plumb outboard
const carry = (spine, chest, s = 0, dUp = 0) => arm(spine, chest, CARRY.upper + dUp, CARRY.fw + dUp, s, CARRY.out);
const body = (spine, chest, neck, head, y = -0.03, z = 0, x = 0) => ({
  pos: [x, y, z], spine: [spine, 0, 0], chest: [chest, 0, 0], neck: [neck, 0, 0], head: [head, 0, 0],
});
const HAND_BACK = { upperArmL: [-30, 0, 12], forearmL: [60, 0, 0] };   // left hand at the small of the back
const READY = { ...body(STOOP.spine, STOOP.chest, -8, -6), ...carry(STOOP.spine, STOOP.chest), ...HAND_BACK };
// idle 'down' drawing: 1 texel lower, neck + head nodding (dozing). r2: spine/chest stay put so the staff hand only
// moves straight DOWN 1 texel — the lantern then never swings in idle and its settled direction equals its un-aimed
// (rigid) one, which hides character.js's stale-L.dir-after-reset bug (keeper.md §8a; deterministic check).
const breathe = (d) => ({
  ...body(STOOP.spine, STOOP.chest, -8 + 4 * d, -6 + 8 * d, -0.03 - 0.028 * d),
  ...carry(STOOP.spine, STOOP.chest), upperArmL: [-30, 0, 12], forearmL: [60 + 8 * d, 0, 0],
});

// WALK (r2, critic: "a gliding block"): a cane shuffle, length 12 with 4 drawings per cycle (each held ≥ 3 grid frames at
// 0.6 m/s): f0 left contact — staff tip planted ahead (butt 16° forward), body 1 texel down, leaning onto it;
// f3 passing — body up, staff behind the plumb (the body walked past it); f6 right contact — staff lifted off the
// ground and swinging forward, body down, weight to the other side; f9 passing — staff carried forward, body up.
// Hem sway = hips twist ±9° + 1-texel side sway in `pos` (pos replaces the procedural bob).
const walkKey = (f, { s, dUp, y, x, tw }) => ({ f, pose: {
  pos: [0, y, 0], hips: [3, tw, -x * 200], spine: [15, -tw * 0.5, 0], chest: [11, -tw * 0.3, 0], neck: [-10, 0, 0], head: [-6, tw * 0.3, 0],
  ...carry(15, 11, s, dUp), ...HAND_BACK } });
// RUN: a hurried hobble on the same 4-drawing plan (length 8), deeper stoop, staff thrust ahead, bigger bob
const runKey = (f, { s, dUp, y, x, tw, aL }) => ({ f, pose: {
  pos: [0, y, 0], hips: [6, tw, -x * 200], spine: [20, -tw * 0.5, 0], chest: [14, -tw * 0.3, 0], neck: [-14, 0, 0], head: [-8, 0, 0],
  ...carry(20, 14, s, dUp), upperArmL: [aL, 0, 16], forearmL: [55, 0, 0] } });

// raise key arm: raised SIDEWAYS (abducted 100°, forearm another 40° up) so the hand is outboard (x ≈ −0.47 m) and the
// staff stands plumb beside the hood (wrist out −140 cancels the 140° of arm roll); lantern ≈ 0.35 m over the hood peak.
// (A forward raise put the shaft across the hood at S/SE.)
const LIFT = { upperArmR: [10, 0, 140], forearmR: [0, 0, 20], handR: [22, 0, -160] };

// thump hoist: the staff lifted at the right SIDE (arm abducted 95° = hand at shoulder height, x ≈ −0.45 m), near plumb
// with the butt ≈ 0.35 m off the ground and swung ≈ 15° forward; a hoist in front crossed the face at SE.
const HOIST = { upperArmR: [14, 0, 95], forearmR: [0, 0, 20], handR: [32, 0, -115] };

export const CLIPS = {
  // slow breathing: extremes held 36 frames, two 6-frame in-betweens; the 'down' extreme is a little doze-nod
  idle: { fps: 30, loop: true, interp: 'step', length: 84, keys: [
    { f: 0, pose: breathe(0) }, { f: 36, pose: breathe(0.5) }, { f: 42, pose: breathe(1) }, { f: 78, pose: breathe(0.5) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 12, keys: [
    walkKey(0, { s: 18, dUp: 4, y: -0.058, x: 0.028, tw: 9 }),
    walkKey(3, { s: -12, dUp: -12, y: -0.03, x: 0.014, tw: 0 }),
    walkKey(6, { s: 6, dUp: 12, y: -0.058, x: -0.028, tw: -9 }),
    walkKey(9, { s: 16, dUp: 14, y: -0.03, x: -0.014, tw: 0 }),
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 8, keys: [
    runKey(0, { s: 22, dUp: 12, y: -0.075, x: 0.028, tw: 10, aL: 20 }),
    runKey(2, { s: -10, dUp: -8, y: -0.02, x: 0, tw: 0, aL: 0 }),
    runKey(4, { s: 10, dUp: 16, y: -0.075, x: -0.028, tw: -10, aL: -25 }),
    runKey(6, { s: 24, dUp: 18, y: -0.02, x: 0, tw: 0, aL: 0 }),
  ] },
  // RAISE (signature, r2): deep sink (hood ducks, staff dipped 22° top-forward) → HOIST: arm straight up beside the
  // hood, staff plumb, the lantern ≈ 0.35 m above the hood peak, body straightened → peer left → peer right (head and
  // chest turn, the lantern swings on its spring) → lower (soft re-plant) → settle. Holds 8–16 grid frames.
  raise: { fps: 30, loop: false, interp: 'step', events: { 54: 'stepR' }, keys: [
    { f: 0, pose: { ...body(26, 18, 0, 16, -0.085), ...arm(26, 18, -4, 12, -22, 30), upperArmL: [-26, 0, 14], forearmL: [70, 0, 0] } },
    { f: 10, pose: { ...body(-4, -6, 2, -16, 0.0), ...LIFT, upperArmL: [-10, 0, 24], forearmL: [40, 0, 0] } },
    { f: 22, pose: { ...body(-2, -4, 0, -14, 0.0), ...LIFT, upperArmL: [-14, 0, 26], forearmL: [45, 0, 0],
      spine: [-2, 6, 0], chest: [-4, 8, 0], head: [-14, 56, 6] } },
    { f: 38, pose: { ...body(-2, -4, 0, -14, 0.0), ...LIFT, upperArmL: [-14, 0, 26], forearmL: [45, 0, 0],
      spine: [-2, -6, 0], chest: [-4, -8, 0], head: [-14, -56, -6] } },
    { f: 54, pose: { ...body(20, 14, -4, 10, -0.07), ...carry(20, 14, 0, 6), upperArmL: [-30, 0, 12], forearmL: [70, 0, 0] } },
    { f: 64, pose: { ...body(14, 11, -8, -2, -0.04), ...carry(14, 11), ...HAND_BACK } },
    { f: 74, pose: READY },
  ] },
  // THUMP (r2, critic: "levelling a lance"): gather (crouch, grip, staff starts up) → HOIST: the staff lifted near plumb
  // (butt 25° forward, ≥ 0.3 m off the ground) at the right side, body rising and leaning back on its heels, held 8 →
  // ONE contact drawing: staff slammed plumb, body dropped forward (smear = a short wedge from the butt; events land +
  // hit@staff = dust ring + burst) → follow-through squash (deeper, head nods) held 8 → recovery → READY.
  thump: { fps: 30, loop: false, interp: 'step', events: { 14: ['land', 'hit@staff'] }, keys: [
    { f: 0, pose: { ...body(24, 16, -6, 12, -0.085), ...arm(24, 16, 16, 50, 8, 26), upperArmL: [-20, 0, 18], forearmL: [70, 0, 0] } },
    { f: 6, pose: { ...body(-8, -10, 0, -12, 0.01, -0.02), ...HOIST, upperArmL: [-40, 0, 30], forearmL: [30, 0, 0] } },
    { f: 14, smear: 'staff', pose: { ...body(26, 18, -8, 8, -0.1, 0.03), ...arm(26, 18, 4, 26, 0, 32), upperArmL: [-16, 0, 22], forearmL: [50, 0, 0] } },
    { f: 15, pose: { ...body(34, 24, -8, 22, -0.125, 0.04), ...arm(34, 24, 8, 30, 0, 32), upperArmL: [30, 0, 26], forearmL: [40, 0, 0] } },
    { f: 23, pose: { ...body(20, 14, -8, 2, -0.06, 0.02), ...carry(20, 14, 0, 4), upperArmL: [-14, 0, 14], forearmL: [55, 0, 0] } },
    { f: 31, pose: READY },
  ] },
  // HURT (head counter-nods so the hood's WORLD pitch stays ≥ −15°: tipped back further the pale hood underside fills the
  // head like a lampshade): flinch back (event 'hurt' → flash) held 5 (≥ flash 2 + 2) → stagger a step back on the right leg, staff
  // knocked 16° off plumb (top back, away from the face), free arm flung out, held 7 → recover → READY.
  hurt: { fps: 30, loop: false, interp: 'step', events: { 0: 'hurt' }, keys: [
    { f: 0, pose: { ...body(-6, -8, 0, -14, -0.04, -0.05), head: [0, 10, 4], ...carry(-6, -8, 0, 8), upperArmL: [10, 0, 35], forearmL: [60, 0, 0] } },
    { f: 5, pose: { ...body(-12, -10, 0, -18, -0.07, -0.09), head: [10, 14, 6], ...carry(-12, -10, 16, -4), upperArmL: [20, 0, 45], forearmL: [40, 0, 0],
      thighL: [10, 0, 6], shinL: [-15, 0, 0], thighR: [-20, 0, 6], shinR: [-15, 0, 0], footR: [10, 0, 0] } },
    { f: 12, pose: { ...body(18, 12, -6, 6, -0.05, -0.04), ...carry(18, 12, 0, 4), upperArmL: [-10, 0, 18], forearmL: [55, 0, 0],
      thighL: [6, 0, 4], shinL: [-10, 0, 0], thighR: [-10, 0, 4], shinR: [-10, 0, 0] } },
    { f: 20, pose: READY },
  ] },
};

export function make(opts = {}) {
  const S = skeleton(opts);
  return {
    name: 'keeper',
    height: 1.45,                                // ground → staff knob (the hood peak is ≈ 1.27 m)
    palette: PALETTE,
    signature: 'beard',                          // + the hood (cloak); charcheck measures one slot — keeper.md §8
    skeleton: S,
    parts: parts(S),
    sockets: { staff: { bone: 'handR', ...STAFF }, lantern: { bone: 'lantern0', at: [0, -0.155, 0] } },
    chains: [
      // lantern: a spring pendulum. gravity 100 → the rest target is plumb whatever the hand does (dirT = rigid dir +
      // 30·down); f 3.4 / ζ 0.82 = a small overshoot then still (ζ 0.45 kept redrawing for 0.9 s after a turn). The
      // redraws that continue after a turn are the runtime's idle recovery steps, not the lantern (keeper.md §8).
      { name: 'lantern', f: 3.4, zeta: 0.82, r: 0, gravity: 100, limit: 60 },
    ],
    personality: { body: { f: 4, zeta: 1, r: 0 }, head: { f: 3.6, zeta: 1, r: 0 } },
    locomotion: { walkSpeed: 0.6, runSpeed: 1.7, runFroude: [0.3, 0.4], stride: 0.26, runStride: 0.42, lift: [0.12, 0.14], elbows: [20, 25], arms: [10, 14],
      stepYaw: 70, stepTol: 0.1, stepTime: 0.2 },   // fewer/faster idle recovery steps after turns (feet hidden under the robe)
    character: { legIK: 'pose', quant: { yaw: 15, chain: 4 } },
    clips: CLIPS,
    // staff smear: the butt end sweeping down (hand → butt = LB); a pale dust-wood pair ≥ 15 % lighter than lit grass
    smears: { staff: { length: LB, inner: 0.1, doubleEdged: true, minAngle: 12, palette: ['#E2D6BE', '#F2EADA'] } },
    // thump: 'land' = dust ring round the feet, 'hit@staff' = a burst at the butt (sparks re-coloured as dust)
    fx: { weapon: { socket: 'staff', length: LB, tip: 0.98 }, dust: ['#E4D6B4', '#C2AE8A', '#8E7E74'], spark: ['#EFE4CC', '#C8B48E'] },
    // staff + lantern are props under handR: the far-half trick classes them R and forced the whole staff/lantern into
    // shadow at N/NW/W/SW (a prop flipping value with facing, look=far). 'mid' keeps them lit like the world.
    material: { tones: GLOW_TONES, sides: { handR: 'mid', lantern0: 'mid' } },
  };
}

export default make();
