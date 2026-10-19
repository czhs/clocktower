// Wanderer (lead) — the pipeline's REFERENCE CHARACTER. Design sheet: characters/wanderer.md.
// Built by following docs/CHARACTER_PLAYBOOK.md stages 0-6; copy this file (and the .md) to start a new character.
// Structure: palette → skeleton (template + chains) → parts (placed from skeleton meta) → sockets → clips →
// smears/fx → spec. Parts hang from joints using S.meta (joint heights / segment lengths), so `make({heads, …})`
// re-proportions the figure without re-authoring parts.
import { biped } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

// [hi, mid, sh] sRGB. 5 slots + 1 accent (steel). Shadow tones differ in hue so slots never merge.
export const PALETTE = {
  hat: ['#F7EBC4', '#DDC48A', '#A48A86'],    // signature: the lightest mass
  coat: ['#8C93C4', '#5A6194', '#3D3A5E'],   // blue-violet, off-hue against grass; sh ≥ night floor #3A3040
  scarf: ['#F07656', '#C2463A', '#7C2F44'],  // warm accent (scarf, hat band)
  skin: ['#F6D2AE', '#D9A27E', '#9A6872'],
  dark: ['#8E7466', '#5E4A46', '#3E3038'],   // hair, trousers, boots, belt, grip, eyes
  steel: ['#F0F4F6', '#B6C0CA', '#68728C'],  // accent: blade, guard
};

const BASE = { height: 1.38, heads: 3.8, shoulders: 0.37 };
// weapon socket on handR: +Z = blade (hilt → tip), +X = cutting edge, +Y = swing axis (smear.js convention).
// rot [90,0,0]: the blade continues the forearm line (a slash sweeps a flat disc). Poses bend the elbow to hold it
// low and forward (idle forearm 45°, gait elbows 40°/50°) — a socket angled forward pointed the blade UP through the
// hat whenever the run swung the arm forward (lead learnings).
const WEAPON = { at: [0, -0.045, 0.01], rot: [90, 0, 0] };
const BLADE = 0.40, GUARD_Z = 0.05;

export function skeleton(opts = {}) {
  const m = biped({ ...BASE, ...opts }).meta;
  return biped({ ...BASE, ...opts, chains: {
    // scarf tail: from the back of the neck, hanging down and back. MIDLINE accessory: rooted at |x| ≤ 0.03 m and
    // listed as 'mid' in material.sides — at x 0.05 look classed it as a LEFT bone and the far-half shadow flipped
    // the tail orange ↔ wine with every facing (critic-wanderer turn-lookfar-x3.png)
    scarf: { n: 3, parent: 'chest', at: [0.02, m.shoulderY - m.chestY + 0.01, -0.125], dir: [0, -1, -0.35], len: 0.5 },
  } });
}

export function parts(S) {
  const m = S.meta, k = m.k;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint ≈ chin) ──
  const faceH = 0.26 * k, fy = 0.015 * k;
  add('head', K.chamferBox(0.29 * k, faceH, 0.28 * k, 0.32, { bottom: 0.03 * k }), [0, fy + faceH / 2, 0.005 * k], 'skin', { name: 'face' });
  add('head', K.box(0.30 * k, 0.17 * k, 0.08 * k), [0, fy + faceH - 0.09 * k, -0.125 * k], 'dark', { name: 'hairBack' });
  add('head', K.box(0.05 * k, 0.12 * k, 0.12 * k), [0.14 * k, fy + faceH - 0.08 * k, -0.05 * k], 'dark', { name: 'hairSide', mirror: true });
  add('head', K.box(0.045 * k, 0.065 * k, 0.03 * k), [0.065 * k, fy + faceH * 0.45, 0.135 * k], 'dark', { name: 'eye', mirror: true });
  // hat: 8-sided conical kasa, ONE CONVEX profile (a drooping rim, then a straight cone to the apex) cut into three
  // lathe bands that share that profile exactly — brim / red band / top. Coincident surfaces have no depth step, so
  // the outline pass draws no inner line inside the signature shape (the old brim+crown lathe had a concave junction
  // and a 0.03 m vertical rim = 0.8-texel facet: dotted 1-px grey speckle, critic-wanderer). Tilted 6° back about
  // the brim centre (one pivot for all bands, so they stay flush) so the eyes show under the brim.
  const hatY = fy + faceH - 0.03 * k;
  const HAT = [[0.33 * k, 0], [0.29 * k, 0.035 * k], [0, 0.21 * k]];   // r, y (hat-local, y 0 = brim base)
  const hatR = (y) => {                                                  // profile radius at height y
    for (let i = 0; i + 1 < HAT.length; i++) {
      const [r0, y0] = HAT[i], [r1, y1] = HAT[i + 1];
      if (y <= y1 + 1e-9) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
    return 0;
  };
  const hatBand = (y0, y1) => {                                          // the profile between y0 and y1 (r 0 = apex)
    const prof = [[hatR(y0), y0], ...HAT.filter(([, y]) => y > y0 + 1e-9 && y < y1 - 1e-9), [hatR(y1), y1]];
    const g = K.lathe(prof, 8);                                          // centred in y: put it back at its height
    return K.xf(K.xf(g, { at: [0, (y0 + y1) / 2, 0] }), { rot: [-6, 0, 0] });
  };
  const bandY = [0.065 * k, 0.105 * k];
  add('head', hatBand(0, bandY[0]), [0, hatY, -0.01 * k], 'hat', { name: 'hat' });
  add('head', hatBand(bandY[0], bandY[1]), [0, hatY, -0.01 * k], 'scarf', { name: 'hatBand' });
  add('head', hatBand(bandY[1], HAT[HAT.length - 1][1]), [0, hatY, -0.01 * k], 'hat', { name: 'hatTop' });

  // ── neck + torso ──
  add('neck', K.box(0.10 * k, 0.08 * k, 0.10 * k), [0, 0.02 * k, 0], 'skin', { name: 'neck' });
  const chestH = m.shoulderY - m.chestY + 0.04 * k;
  add('chest', K.chamferBox(0.31 * k, chestH, 0.235 * k, 0.32, { top: 0.035 * k }), [0, chestH / 2 - 0.01 * k, 0], 'coat', { name: 'chest' });
  add('chest', K.chamferBox(0.25 * k, 0.085 * k, 0.26 * k, 0.4), [0, m.shoulderY - m.chestY + 0.02 * k, -0.005 * k], 'scarf', { name: 'scarfWrap' });
  add('spine', K.chamferBox(0.27 * k, (m.chestY - m.spineY) + 0.02 * k, 0.215 * k, 0.3), [0, (m.chestY - m.spineY) / 2, 0], 'coat', { name: 'waist' });
  add('hips', K.chamferBox(0.285 * k, 0.06 * k, 0.225 * k, 0.3), [0, m.spineY - m.hipsY - 0.005 * k, 0], 'dark', { name: 'belt' });
  // A-line coat skirt to mid-thigh: the hem overlaps the legs (inner line) and gives the poncho trapezoid
  const skTop = m.spineY - m.hipsY - 0.03 * k, skBot = m.thighY - m.hipsY - 0.17 * k;
  add('hips', K.frustum(4, 0.25 * k, 0.205 * k, skTop - skBot, { sz: 0.85 }), [0, (skTop + skBot) / 2, -0.005 * k], 'coat', { name: 'skirt' });

  // ── arms: coat sleeve, bare forearm, hand (forearm/hand in skin: arms never vanish against the coat) ──
  add('upperArmL', K.frustum(4, 0.078 * k, 0.072 * k, m.upperArm + 0.02 * k), [0, -m.upperArm / 2 + 0.005 * k, 0], 'coat', { name: 'sleeve', mirror: true });
  add('forearmL', K.frustum(4, 0.058 * k, 0.064 * k, m.forearm), [0, -m.forearm / 2, 0], 'skin', { name: 'forearm', mirror: true });
  add('handL', K.chamferBox(0.085 * k, 0.085 * k, 0.09 * k, 0.4), [0, -0.035 * k, 0.005 * k], 'skin', { name: 'hand', mirror: true });

  // ── legs: trousers + boots in one dark mass (the walk reads by the boots under the coat) ──
  add('thighL', K.box(0.115 * k, m.thigh + 0.03 * k, 0.12 * k), [0, -m.thigh / 2 + 0.005 * k, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.08 * k, 0.09 * k, m.shin + 0.01 * k), [0, -m.shin / 2 - 0.005 * k, 0], 'dark', { name: 'boot', mirror: true });
  add('shinL', K.box(0.14 * k, 0.05 * k, 0.145 * k), [0, -0.04 * k, 0.005 * k], 'dark', { name: 'bootCuff', mirror: true });
  add('footL', K.chamferBox(0.11 * k, m.ankleY, 0.22 * k, 0.4), [0, -m.ankleY / 2, 0.05 * k], 'dark', { name: 'foot', mirror: true });

  // ── scarf tail: one strip per chain link, aligned with the link (rest dir [0,-1,-0.35] = 19.3° back) ──
  const lk = 0.5 / 3, tilt = Math.atan2(0.35, 1) * 180 / Math.PI;
  const dy = -Math.cos(tilt * Math.PI / 180) * lk / 2, dz = -Math.sin(tilt * Math.PI / 180) * lk / 2;
  [0.14, 0.13, 0.115].forEach((w, i) => add(`scarf${i}`, K.box(w * k, lk + 0.025, 0.045 * k), [0, dy, dz], 'scarf', { name: `scarfTail${i}`, rot: [tilt, 0, 0] }));

  // ── short sword in socket space (+Z blade), then placed like the socket ──
  const sword = (g, color, name) => add('handR', K.xf(g, { rot: WEAPON.rot, at: WEAPON.at }), [0, 0, 0], color, { name });
  sword(K.xf(K.box(0.035, 0.035, 0.12), { at: [0, 0, -0.01] }), 'dark', 'grip');
  sword(K.xf(K.box(0.15, 0.04, 0.035), { at: [0, 0, GUARD_Z] }), 'steel', 'guard');
  sword(K.xf(K.box(0.075, 0.03, BLADE), { at: [0, 0, GUARD_Z + 0.015 + BLADE / 2] }), 'steel', 'blade');
  return P;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz key grid) ──
// Idle legs are IK'd onto the planted feet by the Character, so idle/hurt key only the upper body + pos.
const READY = { // the idle 'up' drawing; actions start from and return to it
  pos: [0, -0.014, 0], spine: [3, -4, 0], chest: [2, -6, 0], neck: [0, 0, 0], head: [4, 10, -3],
  upperArmR: [12, 0, 8], forearmR: [45, 0, 0], upperArmL: [-4, 0, 9], forearmL: [18, 0, 0],
};
const breathe = (d, extra = 0) => ({
  ...READY, pos: [0, -0.014 - d, 0], spine: [3 + 2 * extra, -4, 0], chest: [2 + 2 * extra, -6, 0], head: [4 + 2 * extra, 10, -3],
  upperArmR: [12, 0, 8 + 2 * extra], forearmR: [45 + 3 * extra, 0, 0], upperArmL: [-4, 0, 9 + 2 * extra], forearmL: [18 + 4 * extra, 0, 0],
});

export const CLIPS = {
  // breathing: extremes held long (30 frames), two short in-betweens; 1 texel of bob (0.028 m)
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0) }, { f: 30, pose: breathe(0.014, 0.5) }, { f: 36, pose: breathe(0.028, 1) }, { f: 66, pose: breathe(0.014, 0.5) },
  ] },
  // DIAGONAL forehand slash, high right → low left (a horizontal slash at brim height hid behind the 22-texel hat
  // from dir 4: a 2-4 px sliver, critic-wanderer atk60-a-x4.png). Key-to-key differences on the sword arm ≥ 40°
  // (a 10-20° change is the SAME drawing at 50 texels): anticipation = blade cocked back over the right shoulder
  // (elbow folded 70°, 24° coil) → contact = arm swept across, blade at hip height, lunge → follow-through = blade
  // wrapped low to the left, chest unwound further (≥ 40° past contact) → recovery → READY.
  // Blade rotation anticipation → contact ≤ 170° (one smear key, CHARACTERS §4).
  attack: { fps: 30, loop: false, interp: 'step', events: { 7: 'hit' }, keys: [
    { f: 0, pose: { pos: [0, -0.08, -0.02], spine: [10, -24, 0], chest: [6, -24, 0], head: [-4, 30, 0],   // anticipation, held 7
      upperArmR: [60, 0, 80], forearmR: [70, 0, 0], upperArmL: [35, 0, 30], forearmL: [80, 0, 0],
      thighL: [30, 0, 8], shinL: [-35, 0, 0], thighR: [-15, 0, 6], shinR: [-20, 0, 0] } },
    { f: 7, smear: 'weapon', pose: { pos: [0, -0.1, 0.1], spine: [18, 12, 0], chest: [10, 16, 0], head: [-6, -16, 0],  // contact, 1
      upperArmR: [45, 0, -30], forearmR: [0, 0, 0], upperArmL: [-35, 0, 38], forearmL: [40, 0, 0],
      thighL: [45, 0, 8], shinL: [-40, 0, 0], footL: [-10, 0, 0], thighR: [-30, 0, 6], shinR: [-25, 0, 0], footR: [25, 0, 0] } },
    { f: 8, pose: { pos: [0, -0.12, 0.1], spine: [22, 18, 0], chest: [12, 24, 0], head: [-8, -26, 0],   // follow-through, held 8
      upperArmR: [18, 0, -42], forearmR: [15, 0, 0], upperArmL: [-45, 0, 45], forearmL: [45, 0, 0],
      thighL: [45, 0, 8], shinL: [-40, 0, 0], footL: [-10, 0, 0], thighR: [-30, 0, 6], shinR: [-25, 0, 0], footR: [25, 0, 0] } },
    { f: 16, pose: { pos: [0, -0.04, 0.05], spine: [5, 6, 0], chest: [3, 4, 0], head: [2, -4, 0],       // recovery, held 6
      upperArmR: [20, 0, 15], forearmR: [50, 0, 0], upperArmL: [0, 0, 12], forearmL: [25, 0, 0],
      thighL: [15, 0, 6], shinL: [-15, 0, 0], thighR: [-10, 0, 4], shinR: [-12, 0, 0] } },
    { f: 22, pose: READY },
  ] },
  // hit reaction: snap back (event 'hurt' → 2-grid-frame flash) held 5 so the recoil is seen ≥ 3 grid frames after
  // the flash (held 3, it showed for ONE grid frame: critic log g10), then a deeper recoil with a step BACK on the
  // right leg (action keys re-plant feet: weight shifts), recover, idle.
  hurt: { fps: 30, loop: false, interp: 'step', events: { 0: 'hurt' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, -0.05], spine: [-14, 8, 0], chest: [-10, 6, 0], head: [-18, -10, 6],
      upperArmR: [-20, 0, 30], forearmR: [40, 0, 0], upperArmL: [-25, 0, 35], forearmL: [30, 0, 0] } },
    { f: 5, pose: { pos: [0, -0.07, -0.08], spine: [-20, 12, 0], chest: [-14, 8, 0], head: [-24, -14, 8],
      upperArmR: [-30, 0, 38], forearmR: [55, 0, 0], upperArmL: [-35, 0, 42], forearmL: [45, 0, 0],
      thighL: [12, 0, 6], shinL: [-20, 0, 0], thighR: [-20, 0, 6], shinR: [-15, 0, 0], footR: [10, 0, 0] } },
    { f: 11, pose: { pos: [0, -0.04, -0.03], spine: [6, 2, 0], chest: [4, 0, 0], head: [10, 4, 0],
      upperArmR: [10, 0, 14], forearmR: [55, 0, 0], upperArmL: [-8, 0, 14], forearmL: [30, 0, 0],
      thighL: [6, 0, 4], shinL: [-10, 0, 0], thighR: [-10, 0, 4], shinR: [-10, 0, 0] } },
    { f: 17, pose: READY },
  ] },
  // walk / run: the legs, hips, bob, twist and the LEFT arm stay procedural (spec.locomotion); these phase-driven
  // cycles override only the SWORD ARM so the blade is carried steady (the procedural arm swing windmilled it
  // 0 → 40° every step and held it like a lance in the run — the busiest motion on the figure, against 'weary,
  // steady'). One key per gait drawing (walk 8, run 6, f 0 = left contact) keeps the drawings-per-cycle unchanged.
  walk: { fps: 30, loop: true, interp: 'step', length: 8, keys: [0, 1, 2, 3, 4, 5, 6, 7].map((f) => {
    const c = Math.cos(Math.PI * f / 4);                // +1 at left contact (right arm forward with the left leg back)
    return { f, pose: { upperArmR: [8 + 4 * c, 0, 10], forearmR: [44 + 2 * c, 0, 0] } };
  }) },
  run: { fps: 30, loop: true, interp: 'step', length: 6, keys: [0, 1, 2, 3, 4, 5].map((f) => {
    const c = Math.cos(Math.PI * f / 3);
    return { f, pose: { upperArmR: [-28 + 4 * c, 0, 14], forearmR: [4 + 2 * c, 0, 0] } };   // blade trails low behind
  }) },
};

export function make(opts = {}) {
  const S = skeleton(opts);
  return {
    name: 'wanderer',
    height: S.meta.height + 0.15 * S.meta.k,  // ground → hat apex (the crown rises ≈ 0.15 m above the head top)
    palette: PALETTE,
    signature: 'hat',                          // the signature part's slot (charcheck isolated_px samples it)
    skeleton: S,
    parts: parts(S),
    sockets: { weapon: { bone: 'handR', ...WEAPON } },
    chains: [{ name: 'scarf', f: 4.5, zeta: 0.75, r: 0.5, gravity: 0.6, falloff: 0.85, noForward: true }],  // ζ 0.75: one overshoot, no wobble tail (f 3.2 / ζ 0.4 kept redrawing 1-px wiggles for 1.2 s after a turn)
    personality: { body: { f: 3, zeta: 0.65, r: 1 }, head: { f: 2.8, zeta: 0.85, r: 0 } },
    locomotion: { walkSpeed: 1.3, runSpeed: 3.2, elbows: [40, 50], arms: [34, 45] },
    // Character runtime defaults: legIK 'pose' holds the WHOLE drawing between pose frames (legs included), so the
    // only motion between 30 Hz grid frames is the root's whole-texel glide (A/B vs 'frame': walk 60 Hz leg changes
    // + off-grid 1-texel hip dips; lead learnings). Stance feet drift ≤ 1 hold of travel, measured 0 at pose frames.
    // quant: redraw the body/head lag only every 8° and the scarf every 1/8 of a direction unit, so dynamics show as
    // a few held drawings instead of a 15 Hz crawl of 3° steps (lead learnings)
    character: { legIK: 'pose', quant: { yaw: 8, chain: 8 } },
    clips: CLIPS,
    // smears/FX the stage (and game scenes) attach: smear.js socket opts, fx.js opts (docs/CHARACTERS.md §3)
    // smear palette 15 % lighter than the default grey (#ACB8B8 vs lit meadow #BBD985 differed < 5 % luminance)
    smears: { weapon: { length: GUARD_Z + 0.015 + BLADE, inner: 0.12, palette: ['#C4CED0', '#DCE2E2'] } },
    fx: { weapon: { socket: 'weapon', length: GUARD_Z + 0.015 + BLADE } },
    // look: the scarf chain is a MIDLINE accessory (never forced into the far-half shadow)
    material: { sides: { scarf0: 'mid', scarf1: 'mid', scarf2: 'mid' } },
  };
}

export default make();
