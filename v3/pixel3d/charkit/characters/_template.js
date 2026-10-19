// __NAME__ (__ID__) — __BRIEF__
// Design sheet: characters/__ID__.md (Unique to me, proportions, palette, timing charts, self-critique table).
// Started from characters/_template.js (charkit): a 1.4 m biped built on the mannequin's parts plus one signature
// part (a hat), walking with the game-speed LegGait, and the example clip profile of game-profile.json
// (idle, walk, talk, vote, point, die, ghost, ghost-spent + one emote). Replace shapes, palette and keys; keep the
// structure. Contract: docs/CHARACTERS.md (spec fields §3, clips §4). Numbers: docs/CHARACTER_TECHNIQUES.md.
import { biped } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';
import { mannequinParts } from './mannequin.js';
import PROFILE from '../game-profile.json' with { type: 'json' };

const HEIGHT = 1.4;                                           // skeleton height (ground → head top), metres
const V_GAME = (PROFILE.game?.heightsPerSecond ?? 3.95) * HEIGHT;   // the game's travel speed for THIS body (m/s)

// ≤ 5 slots [hi, mid, sh] + 1 accent; warm hi, cool sh, no pure black/white; the signature is the lightest mass
export const PALETTE = {
  skin: ['#F8D8B6', '#E0A982', '#9C6E78'],
  cloth: ['#7FB0D8', '#4F7FB0', '#3E4A72'],     // off-hue against grass (#75A558)
  dark: ['#8F8AA6', '#5F5B79', '#3E3A56'],
  hair: ['#FFF1CC', '#EED291', '#AE9FA8'],      // signature (hat): the lightest mass in sun AND in shade
  eye: ['#54476A', '#3F3554', '#2E2842'],       // accent
};

export function skeleton(opts = {}) {
  return biped({ height: HEIGHT, heads: 4, ...opts });
}

export function parts(S) {
  const m = S.meta, k = m.k;
  // the mannequin's body (cloth = tunic); drop its hair tuft, the hat replaces it
  const P = mannequinParts(S).filter((p) => p.name !== 'tuft');
  const top = 0.015 * k + 0.27 * k;                           // head-local y of the face block top (mannequin numbers)
  // signature: a wide-brimmed hat = ONE convex lathe profile (brim band + crown): no inner line inside it
  P.push({ bone: 'head', name: 'hat', color: 'hair', at: [0, top + 0.01 * k, -0.02 * k],
    shape: K.lathe([[0.25 * k, 0], [0.245 * k, 0.03 * k], [0.165 * k, 0.05 * k], [0.15 * k, 0.15 * k], [0.06 * k, 0.19 * k]], 8) });
  return P;
}

// ── poses: [fwd, twist, out] degrees per bone (docs/CHARACTERS.md §1). Consecutive keys differ ≥ 25–40° ──
const breathe = (dy, a) => ({ pos: [0, -dy, 0], chest: [a, 0, 0], head: [-a, 0, 0], upperArmL: [0, 0, 4 + a], upperArmR: [0, 0, 4 + a] });
const DEAD = { pos: [0, -0.62, -0.25], hips: [-82, 0, 18], spine: [12, 0, 0], chest: [10, 0, 0], head: [22, -20, 0],
  upperArmL: [10, 0, 60], forearmL: [40, 0, 0], upperArmR: [-10, 0, 25], forearmR: [50, 0, 0],
  thighL: [75, 0, 6], shinL: [-80, 0, 0], thighR: [40, 0, 0], shinR: [-30, 0, 0] };
const GHOST = (i) => ({ pos: [0, [0.028, 0.014, 0, 0.014][i], 0], upperArmL: [12, 0, 14 + 8 * (i % 2)], upperArmR: [12, 0, 14 + 8 * ((i + 1) % 2)],
  forearmL: [25, 0, 0], forearmR: [25, 0, 0], head: [-4, 0, [4, 0, -4, 0][i]], thighL: [15, 0, 0], shinL: [-25, 0, 0], thighR: [10, 0, 0], shinR: [-20, 0, 0] });

export const CLIPS = {
  // idle: loop 72, step, extremes held ≥ 30 grid frames, 1 texel (0.028 m) of bob; upper body + pos only
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: breathe(0, 0) }, { f: 30, pose: breathe(0.014, 2) }, { f: 36, pose: breathe(0.028, 4) }, { f: 66, pose: breathe(0.014, 2) },
  ] },
  // talk: loop 24, a beat every 6 frames, the camera-side hand gestures, head cocks toward the camera
  talk: { fps: 30, loop: true, interp: 'step', length: 24, dynamics: 'hold', events: { 0: 'speak' }, keys: [
    { f: 0, pose: { chest: [-4, -8, 0], head: [-6, -10, 8], upperArmR: [50, 0, 50], forearmR: [60, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.028, 0], chest: [2, -4, 0], head: [2, -12, -4], upperArmR: [15, 0, 20], forearmR: [30, 0, 0] } },
    { f: 12, pose: { chest: [-4, 10, 0], head: [-6, 8, 8], upperArmL: [55, 0, 45], forearmL: [70, 0, 0], upperArmR: [10, 0, 15] } },
    { f: 18, pose: { pos: [0, -0.028, 0], chest: [2, 4, 0], head: [2, 6, -4], upperArmL: [15, 0, 20], forearmL: [30, 0, 0] } },
  ] },
  // vote: one anticipation dip (4) → the right arm up-and-forward-out above the hat, HELD (clip.hold defaults on)
  vote: { fps: 30, loop: false, interp: 'step', length: 30, events: { 4: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [8, 0, 0], chest: [6, 0, 0], upperArmR: [30, 0, 20], forearmR: [70, 0, 0] } },
    { f: 4, pose: { pos: [0, 0.02, 0], spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-10, 0, 0], upperArmR: [165, 0, 30], forearmR: [5, 0, 0],
      'upperArmR.l': [0.6], 'forearmR.l': [0.5], upperArmL: [0, 0, 12] } },
  ] },
  // point (the shared emote): wind (4) → arm thrown along the facing (held 22) → back (6) → idle
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], spine: [4, 8, 0], chest: [4, 10, 0], upperArmR: [30, 0, 30], forearmR: [100, 0, 0] } },
    { f: 4, pose: { spine: [0, -10, 0], chest: [-4, -16, 0], head: [-6, 14, 0], upperArmR: [82, 0, 10], forearmR: [4, 0, 0], 'upperArmR.l': [0.3] } },
    { f: 26, pose: { chest: [0, -4, 0], upperArmR: [40, 0, 25], forearmR: [40, 0, 0] } },
    { f: 32, pose: breathe(0, 0) },
  ] },
  // die (gentle, no hurt flash): sway (6) → knees give (6) → falls back, rolled toward the camera → HELD lying pose (each key lower than the last)
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', length: 60, events: { 12: ["die", "land"] }, keys: [
    { f: 0, pose: { spine: [-4, 0, 8], chest: [-6, 0, 8], head: [-4, -10, -14], upperArmL: [0, 0, 20], upperArmR: [0, 0, 20] } },
    { f: 6, pose: { pos: [0, -0.22, 0], spine: [16, 0, -6], chest: [10, 0, 0], head: [10, -8, 0], thighL: [70, 0, 0], shinL: [-110, 0, 0],
      thighR: [60, 0, 0], shinR: [-100, 0, 0], upperArmL: [20, 0, 30], upperArmR: [20, 0, 30] } },
    { f: 12, pose: DEAD },
  ] },
  // ghost / ghost-spent: spec.ghost draws the pale ramp, halo (level 1), hover and floating legs; clips = pose only
  ghost: { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 16, 32, 48].map((f, i) => ({ f, pose: GHOST(i) })) },
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: {
    ...GHOST(i), pos: [0, [-0.02, -0.035, -0.05, -0.035][i], 0], spine: [6, 0, 0], chest: [6, 0, 0], head: [14, 0, [3, 0, -3, 0][i]] } })) },
  // the signature emote (spec.emote): a big two-beat wave with the camera-side arm, hat tipped on the second beat
  wave: { fps: 30, loop: false, interp: 'step', length: 40, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [4, 6, 0], upperArmL: [40, 0, 40], forearmL: [80, 0, 0] } },
    { f: 4, pose: { chest: [-4, -6, 0], head: [-6, 8, 6], upperArmL: [10, 0, 150], forearmL: [30, 0, 0] } },
    { f: 10, pose: { chest: [-4, -8, 0], head: [-6, 8, -6], upperArmL: [10, 0, 120], forearmL: [75, 0, 0] } },
    { f: 16, pose: { chest: [-4, -6, 0], head: [-6, 8, 6], upperArmL: [10, 0, 150], forearmL: [30, 0, 0] } },
    { f: 22, pose: { chest: [-4, -8, 0], head: [-6, 8, -6], upperArmL: [10, 0, 120], forearmL: [75, 0, 0] } },
    { f: 30, pose: { chest: [2, 0, 0], upperArmL: [20, 0, 25], forearmL: [40, 0, 0] } },
    { f: 36, pose: breathe(0, 0) },
  ] },
};

export function make(opts = {}) {
  const S = skeleton(opts);
  return {
    name: '__ID__',
    height: S.meta.height + 0.17 * S.meta.k,   // ground → hat top (stage framing, cells)
    palette: PALETTE,
    signature: 'hair',                         // slot of the signature part (charcheck sig.* / isolated_px rows)
    bodyPlan: 'biped',                         // charcheck targets (docs/CHARACTERS.md §7: biped 45–62 texels at vh 10)
    gameSpeed: { v: V_GAME, drawings: PROFILE.game?.walkDrawings ?? 4, gait: 'scurry' },
    emote: 'wave',
    skeleton: S,
    parts: parts(S),
    sockets: {},
    chains: [],
    personality: { body: { f: 2.5, zeta: 0.7, r: 1.5 }, head: { f: 3.5, zeta: 0.6, r: 0 } },
    // LegGait at the game speed: walk = THE in-game gait; run (optional) = 2× (tuned for ≈ 4 body-heights/s)
    locomotion: { plan: 'biped', plant: 'hold', walkSpeed: V_GAME, runSpeed: 2 * V_GAME },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    ghost: { hover: 0.14 },
    fx: { speech: { node: 'head' } },
  };
}

export default make();
