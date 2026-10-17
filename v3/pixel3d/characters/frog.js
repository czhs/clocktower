// Sir Croaksworth (char-frog) — cast member "frog": "A knight sworn to a pond that no longer exists."
// Design sheet (Unique to me, timing charts, self-critique): characters/frog.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/frog.ts + refs/cast/frog.png.
// Body plan: upright CHIBI skeleton (chibi(), 2.2 heads, the v2 sprite is upright and armoured) driven by the
// LegGait 'hop' plan with the two hind legs only (both feet together = a knightly two-footed hop-march: legs are
// 0.27 H, too short to step 1.2 H per 0.3 s cycle, CAST_PORTING §8). The arms carry sword + shield in the REST pose
// (LegGait bodyPose does not overlay authored walk clips, so the carry must be the rest geometry — module issue).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.2;                  // v2 30 px → castHeight 1.2 m (top of the eye bumps)
export const SKH = 1.3;                     // template height: chibi() proportions; the head parts end at ≈ HEIGHT
export const V_GAME = 3.95 * HEIGHT;        // 4.74 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. 5 slots + 1 accent (brass). Frog green moved to a low-red jade-mint (hue ≈ 150°) so it
// survives the golden grade and sits ≥ 50° off the meadow (#75A558 h 97); its shadow is blue-slate, not teal.
export const PALETTE = {
  skin: ['#92F2D4', '#4FC6A2', '#5E7C9C'],    // signature 1: head + eye bumps (lightest mass), legs, hands
  cape: ['#F27A78', '#C83E4A', '#7A2E4E'],    // signature 2: red cape + mantle
  steel: ['#B8C8EA', '#7488BA', '#4C507E'],   // plate armour, shield face, blade (r2) (sh ≥ night floor #3A3040)
  cream: ['#FFF4D6', '#EAD3A2', '#A68E86'],   // jaw / throat, eye whites
  dark: ['#946E5C', '#634640', '#4C3834'],    // boots, gauntlets, grip, eye rims + pupils, mouth line + inside, fuller
  brass: ['#FFE596', '#D9A94A', '#8E6848'],   // accent: trims, belt, shield rim + star, guard
};

// sword socket on handR: +Z = blade. (r3) rot [−139.4, −60.1, 0]: blade dir (−0.87, +0.33, −0.38) = OUT to the right,
// a little BACK and 19° UP from the hanging hand → the blade rides at hip height angled out (critic r2: 22° down
// trailed at boot level like a dragged cane / third leg in the hop). r2 [151, −38.5, 0], r1 [55, −50, 0].
export const WEAPON = { at: [0, -0.04, 0.01], rot: [-139.4, -60.1, 0] };
const BLADE = 0.30, GUARD_Z = 0.045;
export const SWORD_LEN = GUARD_Z + 0.015 + BLADE;

export function skeleton() {
  const S0 = chibi({ height: SKH, heads: 2.2, legs: 0.75, arms: 0.85, snout: 0, ears: false, tail: false, shoulders: 0.44, hips: 0.17,
    face: { eye: [0.165, 0.39, 0.14], brow: false, mouth: false } });
  const m0 = S0.meta;
  const S = chibi({ height: SKH, heads: 2.2, legs: 0.75, arms: 0.85, snout: 0, ears: false, tail: false, shoulders: 0.44, hips: 0.17,
    face: { eye: [0.165, 0.39, 0.14], brow: false, mouth: false },
    chains: { cape: { n: 2, parent: 'chest', at: [0, m0.shoulderY - m0.chestY + 0.01, -0.185], dirs: CAPE_DIRS, lens: CAPE_LENS } } });
  // jaw hinge at the BACK of the mouth (template puts it near the front: a front hinge cannot open a frog mouth)
  const jaw = S.find((b) => b.name === 'jaw');
  jaw.pos = [0, 0.10, -0.10];
  const head = S.find((b) => b.name === 'head');
  head.pos = [head.pos[0], head.pos[1] + HEAD_UP, head.pos[2]];
  // (r2) eyes moved OUT, UP and FORWARD onto the front of the bigger eye bumps: the bumps break the E/W profile and the
  // big rimmed eyes sit on top of them (v1 face)
  for (const s of [1, -1]) S.find((b) => b.name === (s > 0 ? 'eyeL' : 'eyeR')).pos = [s * EYE_X, EYE_Y, EYE_Z];
  // (t2) GHOST bones (no shared-code hook for a per-clip tint, module issue): 'ghostFlag' has no geometry, its keyed
  // scale is the ghost signal read by the vertex shader (ghost: .s +1 → 2×, spent: +0.5 → 1.5×; every other clip 1×);
  // 'halo' carries the ghost halo ring, parked INSIDE the skull at rest (invisible) and lifted above the domes by
  // 'halo.p' in the ghost clip only. Appended last (parents earlier) → bone index = array index.
  S.push({ name: 'ghostFlag', parent: 'hips', pos: [0, 0, 0], axis: 'up' });
  S.push({ name: 'halo', parent: 'head', pos: [0, HALO_REST_Y, 0.04], axis: 'up' });
  return S;
}
const HALO_REST_Y = 0.15, HALO_UP = 0.47;   // ring inside the skull (y 0.10–0.275, rx 0.39) at rest; +0.47 → y 0.62 over the domes
// (r2) cape = 2-link chain (critic: a 1-link plane read as a rigid red board): link 0 leaves the shoulders angled back,
// link 1 hangs nearly straight → the hem reaches the boot tops and its edge shows below the legs at S
const CAPE_DIRS = [[0, -1, -0.30], [0, -1, -0.06]];
const CAPE_LENS = [0.25, 0.27];
const EYE_X = 0.215, EYE_Y = 0.36, EYE_Z = 0.235;
const HEAD_UP = 0.08;    // (r3) head raised on the neck: the steel chest shows under the jaw at S, figure ≥ 38 px

const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint = chin, y 0 head-local) ──
  // (r3) WIDE FLAT frog head (critic r2: the lathe skull was taller than wide, its bumps read as mouse ears and E/W was a
  // mint column): skull 0.80 wide × 0.175 tall (+ jaw 0.13) × 0.67 deep, centred 0.09 forward → wider than tall at S, longer than tall
  // at E/W; the jaw below it is SKIN (cheeks wrap the sides) with only a cream chin patch on its front face, inside the
  // head outline (r2: a full-width cream jaw read as a collar band). Jaw hinge at the back (opens 26-28° = croak/talk).
  // skull = convex hull of 5 octagon rings (flat faces to ±X/±Z): wide flat oval in plan whose top recedes BACK while the
  // front-bottom juts forward → a sloped frog SNOUT in the E/W profile (the eye bumps sit on the front-top slope)
  const ring = (y, rx, rz, cz) => [...Array(8)].map((_, k) => { const a = (22.5 + 45 * k) * Math.PI / 180, c = Math.cos(Math.PI / 8);
    return [rx * Math.cos(a) / c, y, cz + rz * Math.sin(a) / c]; });
  const SKULL = [ring(0.10, 0.39, 0.355, 0.08), ring(0.17, 0.39, 0.355, 0.08), ring(0.225, 0.34, 0.28, 0.03),
    ring(0.26, 0.22, 0.18, -0.02), ring(0.275, 0.10, 0.08, -0.03)].flat();
  add('head', K.hull(SKULL), [0, 0, 0], 'skin', { name: 'skull' });
  add('head', K.box(0.66, 0.17, 0.18), [0, 0.02, -0.15], 'skin', { name: 'throatBack' });
  add('head', K.box(0.64, 0.05, 0.40), [0, 0.072, 0.16], 'dark', { name: 'mouthIn' });
  // PERMANENT mouth line: a dark band that FOLLOWS the octagonal skull outline over its front half (front face, both
  // diagonals, the sides back to mid-head), 0.015 m proud of the skull → the v1 wide frog mouth at S/SE/SW and a mouth
  // slit along the E/W profile. (r3: straight bars poked out of the chamfered corners as brown sticks / specks.)
  const lip = [];
  for (const y of [0.087, 0.121]) {
    const R = ring(y, 0.415, 0.375, 0.08);
    lip.push(R[0], R[1], R[2], R[3], [0.415, y, 0.13], [-0.415, y, 0.13]);
  }
  add('head', K.hull(lip), [0, 0, 0], 'dark', { name: 'mouthLine' });
  // lower jaw: skin block (cheeks), cream chin patch on its front face (3 rows at S, mint on both sides of it)
  add('jaw', K.chamferBox(0.76, 0.12, 0.52, 0.3), [0, -0.06, 0.26], 'skin', { name: 'jaw' });
  add('jaw', K.chamferBox(0.42, 0.07, 0.07, 0.3), [0, -0.045, 0.507], 'cream', { name: 'chin' });
  // mouth inside on the jaw's top face (flush under the skull while closed; tips toward the camera when it opens)
  add('jaw', K.box(0.62, 0.03, 0.42), [0, 0.0, 0.25], 'dark', { name: 'mouthFloor' });
  add('jaw', K.box(0.22, 0.035, 0.18), [0, 0.006, 0.29], 'cape', { name: 'tongue' });
  // eye bumps: domes on the top, set INSIDE the 0.80 m cheeks (frog: cheeks wider than the eye span → a trapezoid head
  // with two domes, not a square head with corner 'mouse ears' — 25 % silhouette)
  const EB = [[0.125, 0], [0.13, 0.08], [0.09, 0.17], [0, 0.17]];
  add('head', K.lathe(EB, 8), [EYE_X, EYE_Y + 0.005, EYE_Z - 0.11], 'skin', { name: 'eyeBump', mirror: true });
  // v1 eyes: dark RIM disc covering the front-top of the bump, cream white inside, 2×2-texel dark pupil inset; the disc
  // faces forward tilted 24° up (toward the 30° camera)
  const TILT = 24, eN = [0, Math.sin(TILT * Math.PI / 180), Math.cos(TILT * Math.PI / 180)];
  const disc = (r, h) => K.xf(K.prism(8, r, h), { rot: [90 - TILT, 0, 0] });
  const onN = (d, x = 0, y = 0) => [x, y + eN[1] * d, eN[2] * d];
  add('eyeL', disc(0.098, 0.05), onN(-0.012), 'dark', { name: 'eyeRim', mirror: true });
  add('eyeL', disc(0.068, 0.05), onN(0.004), 'cream', { name: 'eyeWhite', mirror: true });
  add('eyeL', K.xf(K.box(0.062, 0.062, 0.03), { rot: [-TILT, 0, 0] }), onN(0.028, -0.004, -0.004), 'dark', { name: 'pupil', mirror: true });

  // ── torso: ONE steel plate + ONE brass belt + steel tassets (r3: no gorget — critic r2: jaw/gorget/steel/belt/tasset
  // made 5 horizontal stripes at S) ──
  const chestH = m.shoulderY - m.chestY + 0.04;
  add('chest', K.chamferBox(0.38, chestH, 0.32, 0.3), [0, chestH / 2 - 0.01, 0], 'steel', { name: 'breastplate' });
  add('chest', K.chamferBox(0.40, 0.065, 0.13, 0.3), [0, chestH - 0.03, -0.12], 'cape', { name: 'mantle' });
  const waistH = (m.chestY - m.spineY) + 0.02;
  add('spine', K.chamferBox(0.36, waistH, 0.30, 0.3), [0, waistH / 2, 0], 'steel', { name: 'waist' });
  const beltY = m.spineY - m.hipsY;
  add('hips', K.chamferBox(0.39, 0.07, 0.33, 0.3), [0, beltY, 0], 'brass', { name: 'belt' });
  add('hips', K.frustum(8, 0.21, 0.19, 0.07, { sz: 0.74 }), [0, beltY - 0.065, 0], 'steel', { name: 'tasset' });

  // ── arms: steel pauldron, green upper arm, leather gauntlet, green hand ──
  add('upperArmL', K.lathe([[0.095, 0], [0.09, 0.04], [0, 0.085]], 8), [0.012, 0.012, 0], 'steel', { name: 'pauldron', mirror: true });
  add('upperArmL', K.frustum(4, 0.064, 0.06, m.upperArm), [0, -m.upperArm / 2, 0], 'skin', { name: 'upperArm', mirror: true });
  add('forearmL', K.frustum(4, 0.07, 0.078, m.forearm), [0, -m.forearm / 2, 0], 'dark', { name: 'gauntlet', mirror: true });
  add('handL', K.chamferBox(0.085, 0.085, 0.09, 0.35), [0, -0.03, 0.005], 'skin', { name: 'hand', mirror: true });

  // ── shield on the LEFT forearm: round (8-sided), face normal 35° out from forward ──
  const sDisc = (r, h) => K.xf(K.xf(K.prism(8, r, h), { rot: [90, 0, 0] }), { rot: [0, 35, 0] });
  const nrm = [Math.sin(35 * Math.PI / 180), 0, Math.cos(35 * Math.PI / 180)];
  const SC = [0.085, -0.075, 0.03];
  const along = (d) => SC.map((c, i) => c + nrm[i] * d);
  add('forearmL', sDisc(0.175, 0.04), SC, 'brass', { name: 'shieldRim' });
  add('forearmL', sDisc(0.138, 0.04), along(0.012), 'steel', { name: 'shieldFace' });
  add('forearmL', K.xf(K.box(0.055, 0.16, 0.02), { rot: [0, 35, 0] }), along(0.038), 'brass', { name: 'starV' });
  add('forearmL', K.xf(K.box(0.16, 0.055, 0.02), { rot: [0, 35, 0] }), along(0.038), 'brass', { name: 'starH' });

  // ── legs: green thighs AND knees, short brown boots ──
  // (r2) the boot covers only the lower 60 % of the shin (was the whole shin + a cuff at the knee): the mint thigh+knee
  // carry the crouch / leg extension of the hop at 1x instead of a brown lump
  const bootH = 0.6 * m.shin;
  add('thighL', K.frustum(4, 0.072, 0.066, m.thigh + 0.03), [0, -m.thigh / 2 + 0.01, 0], 'skin', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.064, 0.068, m.shin - bootH + 0.04), [0, -(m.shin - bootH) / 2 + 0.01, 0], 'skin', { name: 'shin', mirror: true });
  add('shinL', K.frustum(4, 0.078, 0.084, bootH + 0.01), [0, -m.shin + bootH / 2 - 0.005, 0], 'dark', { name: 'boot', mirror: true });
  add('footL', K.chamferBox(0.12, m.ankleY, 0.2, 0.35), [0, -m.ankleY / 2, 0.045], 'dark', { name: 'foot', mirror: true });

  // ── cape: 2-link chain from the back of the chest (r2); per link a centre panel + two side wings wrapping forward
  // (same slot → no inner line between them), built along each link's own direction (no Euler rot: stair stripes).
  // Link 1 starts 0.04 m above its joint (overlap: no gap when the links bend). Hem flares to ±0.33 m. ──
  const X = [1, 0, 0], T = 0.035;
  const OFF = 0.04;   // panel stands 0.04 m proud of the chain line: crouches/leans never push the tassets through it
  const LINKS = [
    { bone: 'cape0', u: norm(CAPE_DIRS[0]), rows: [[0, 0.17, 0.05], [CAPE_LENS[0], 0.25, 0.09]], off0: 0 },
    { bone: 'cape1', u: norm(CAPE_DIRS[1]), rows: [[-0.04, 0.24, 0.085], [CAPE_LENS[1], 0.31, 0.12]], off0: OFF },
  ];
  for (const [li, Lk] of LINKS.entries()) {
    const u = Lk.u, n = norm(cross(X, u));        // n points back (outside of the cape)
    const off = (a) => (li === 0 ? OFF * Math.min(1, Math.max(0, a) / 0.12) : OFF);
    const Pt = (a, w, t) => [0, 1, 2].map((i) => u[i] * a + X[i] * w + n[i] * (t + off(a)));
    const panel = [];
    for (const [a, hw] of Lk.rows) for (const s of [-1, 1]) for (const q of [-1, 1]) panel.push(Pt(a, s * hw, q * T / 2));
    add(Lk.bone, K.hull(panel), [0, 0, 0], 'cape', { name: `cape${li}` });
    for (const s of [-1, 1]) {
      const wing = [];
      for (const [a, hw, fw] of Lk.rows) for (const q of [-1, 1]) {
        wing.push(Pt(a, s * (hw - 0.01), q * T / 2));
        wing.push(Pt(a, s * (hw + 0.04), -fw + q * T / 2));
      }
      add(Lk.bone, K.hull(wing), [0, 0, 0], 'cape', { name: `cape${li}Wing${s > 0 ? 'A' : 'B'}` });
    }
  }

  // ── (t2) ghost halo: an octagonal brass ring (r 0.15, 12 texels wide, 3-4 tall seen from 30°) of 8 boxes ──
  for (let k = 0; k < 8; k++) {
    const a = k * 45, r = 0.15, L = 2 * r * Math.tan(Math.PI / 8) + 0.03;
    add('halo', K.xf(K.box(L, 0.035, 0.045), { rot: [0, a, 0], at: [r * Math.sin(a * Math.PI / 180), 0, r * Math.cos(a * Math.PI / 180)] }), [0, 0, 0], 'brass', { name: `halo${k}` });
  }

  // ── short sword in socket space (+Z blade) ──
  // (r3) blade 0.115 m wide (≥ 3 texels; r2 0.09 read as a 1-2 texel stick) with the dark fuller as an EDGE line
  const sword = (g, color, name) => add('handR', K.xf(g, { rot: WEAPON.rot, at: WEAPON.at }), [0, 0, 0], color, { name });
  sword(K.xf(K.box(0.035, 0.035, 0.1), { at: [0, 0, -0.01] }), 'dark', 'grip');
  sword(K.xf(K.box(0.15, 0.045, 0.04), { at: [0, 0, GUARD_Z] }), 'brass', 'guard');
  sword(K.xf(K.box(0.115, 0.03, BLADE), { at: [0, 0, GUARD_Z + 0.015 + BLADE / 2] }), 'steel', 'blade');
  sword(K.xf(K.box(0.03, 0.036, BLADE * 0.8), { at: [0.045, 0, GUARD_Z + 0.015 + BLADE * 0.42] }), 'dark', 'fuller');
  return P;
}


// ── (t2) GHOST look through the characterMaterial hooks (no shared code changed; module issue: no per-clip tint) ──
// vertex: the ghost signal = world scale of the 'ghostFlag' bone / world scale of the hips (its parent), read from the
// skinning bone matrices: 0 in every normal clip, 1 in 'ghost', 0.5 in 'ghost-spent'. Halo vertices = skinned to 'halo'.
// fragment (`tones`): every tone is re-mapped by its luminance onto a pale-blue ghost ramp (spent: a dimmer grey-blue),
// so the face/eyes/mouth keep their value steps; the halo is pale gold; below the chest an ordered 2×2 screen dither
// DISCARDS 1/4 → 1/2 → 3/4 of the texels toward the boots (bind-space height, so the fade rides the body): the
// "translucent fading tail" of the v1 ghost sprite with an opaque material (the bake keys the holes to alpha 0).
const glsl3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
export const GHOST = {
  ramp: ['#E4F2FF', '#A2C8EE', '#5470AA'],     // light / mid / dark ghost tones (sRGB), live ghost
  spent: ['#C6CEDC', '#8C9AB4', '#4C5470'],    // dimmer, greyer: ghost vote spent
  halo: ['#FFF8D0', '#FFE38C', '#D8AE5E'],
  fade: [[0.62, 0.25], [0.47, 0.5], [0.30, 0.75]],   // bind-space y (m) below which this share of texels is dropped
};
function ghostMaterial(gi, hi) {
  return {
    vertexHead: 'flat varying float vFrogGhost; flat varying float vFrogHalo;',
    vertex: `
      #ifdef USE_SKINNING
        {
          float g0 = length(getBoneMatrix(0.0)[0].xyz);
          float g1 = length(getBoneMatrix(${gi.toFixed(1)})[0].xyz);
          vFrogGhost = g1 / max(g0, 1e-4) - 1.0;
          vFrogHalo = abs(skinIndex.x - ${hi.toFixed(1)}) < 0.5 ? 1.0 : 0.0;
        }
      #else
        vFrogGhost = 0.0; vFrogHalo = 0.0;
      #endif`,
    fragmentHead: `flat varying float vFrogGhost; flat varying float vFrogHalo;
      vec3 frogGhostTone(vec3 c, vec3 lo, vec3 md, vec3 hi) {
        float t = clamp((sqrt(dot(c, vec3(0.2126, 0.7152, 0.0722))) - 0.2) * 1.6, 0.0, 1.0);
        return t < 0.5 ? mix(lo, md, t * 2.0) : mix(md, hi, t * 2.0 - 1.0);
      }`,
    tones: `
      if (vFrogGhost > 0.25) {
        // dusk/night: a faint self-glow so the ghost (and its halo) stays pale in the dark (night ramp luma ≈ 0.29 vs ≥ 0.64 by day)
        float kNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
        if (vFrogHalo > 0.5) {
          toonHi = ${glsl3(GHOST.halo[0])}; toonMid = ${glsl3(GHOST.halo[1])}; toonSh = ${glsl3(GHOST.halo[2])};
          totalEmissiveRadiance = toonMid * 0.6 * kNight;
        } else {
          bool live = vFrogGhost > 0.75;
          vec3 gl = live ? ${glsl3(GHOST.ramp[2])} : ${glsl3(GHOST.spent[2])};
          vec3 gm = live ? ${glsl3(GHOST.ramp[1])} : ${glsl3(GHOST.spent[1])};
          vec3 gh = live ? ${glsl3(GHOST.ramp[0])} : ${glsl3(GHOST.spent[0])};
          toonHi = frogGhostTone(toonHi, gl, gm, gh); toonMid = frogGhostTone(toonMid, gl, gm, gh); toonSh = frogGhostTone(toonSh, gl, gm, gh);
          totalEmissiveRadiance = toonMid * (live ? 0.35 : 0.18) * kNight;
          vec2 fq = mod(floor(gl_FragCoord.xy), 2.0);
          float bay = (fq.x * 2.0 + fq.y * 3.0 - fq.x * fq.y * 4.0 + 0.5) / 4.0;   // 2x2 Bayer: 0 2 / 3 1 (+0.5)/4
          float drop = vCharBind.y < ${GHOST.fade[2][0].toFixed(3)} ? ${GHOST.fade[2][1].toFixed(2)}
            : vCharBind.y < ${GHOST.fade[1][0].toFixed(3)} ? ${GHOST.fade[1][1].toFixed(2)}
            : vCharBind.y < ${GHOST.fade[0][0].toFixed(3)} ? ${GHOST.fade[0][1].toFixed(2)} : 0.0;
          if (bay < drop) discard;
        }
      }`,
  };
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz grid) ──────────────────────────────────────────────────
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
// (r3) the carry socket points the blade out-back-UP (WEAPON.rot); talk / vote dip / oath coil pitch the hand forward HF°
// first, so their blade directions match the r1 keys (blade out-FORWARD in the hand)
const HF = 65;
// idle: rest arms (the walk carries them at rest too: no arm snap on start/stop), breath in chest + 1 texel of pos
const breathe = (d, c) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0],
  upperArmL: [4 + c, 0, 3], upperArmR: [2, 0, 4 + c], forearmR: [8 + c, 0, 0] });

// (t2) pledge: sword hand on the heart, blade lowered across the body (oath f15)
const PLEDGE = { pos: [0, -0.01, 0], spine: [-3, 0, 0], chest: [-6, 4, 0], head: [-8, 0, 0], ...EYES(0, -0.2),
  upperArmR: [30, 0, 12], forearmR: [105, 0, 0], handR: [0, 0, 0], upperArmL: [10, 0, 8], forearmL: [25, 0, 0] };
// (t2) point pose: sword arm out to his right-forward, a little above the shoulder; wrist turned so the BLADE points
// BACK behind the fist (he points with the gauntlet, the sword is out of the line). Probes of 12 wrist turns on the
// 8-facing still: shots/char-frog/t2/probe*.png ([−90, 90, 0] = fist leads, blade hidden behind the arm at S/SE).
const POINT = { pos: [0, 0.0, 0.02], spine: [-2, -6, 0], chest: [-4, -12, 0], head: [-10, -16, 0], ...EYES(0.2, 0.2),
  upperArmR: [24, 0, 72], forearmR: [0, 0, 0], handR: [-90, 90, 0], upperArmL: [10, 0, 8], forearmL: [20, 0, 0] };
// (t2) ghost hover: pos y = 0.32 m (the loop IK dips the hips ≤ 0.1 m → ≈ 0.22 m clear) + bob
const GHOST_BOB = [0, 0.028, 0.056, 0.028];
function ghostPose(b, i, k) {
  const live = k > 0.75, a = [0, 2, 4, 2][i];
  return { pos: [0, 0.32 + b, 0], spine: [-3, 0, 0], chest: [live ? -4 : 6, 0, 0], head: [live ? -6 : 14, 0, 0],
    ...(live ? {} : EYES(0, -0.4)), 'ghostFlag.s': [k, k, k], ...(live ? { 'halo.p': [0, HALO_UP, -0.02] } : {}),
    upperArmL: [8, 0, live ? 18 + a : 6], forearmL: [live ? 20 : 8, 0, 0], upperArmR: [8, 0, live ? 22 + a : 8], forearmR: [live ? 24 : 10, 0, 0],
    cape0: [live ? -6 - a : 0, 0, 0] };
}

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0) }, { f: 30, pose: breathe(0.014, 2) }, { f: 36, pose: breathe(0.028, 4) },
    { f: 54, pose: { ...breathe(0.028, 4), ...BLINK } }, { f: 56, pose: breathe(0.028, 4) }, { f: 66, pose: breathe(0.014, 2) },
  ] },
  // talk (loop 24): an orator's beat every 6 frames — head nod 26° (−12 ↔ +14), jaw open 28° on alternating keys (the
  // cream jaw front drops ≈ 6 texels: the croak), sword hand lifted forward on the open keys
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-5, 6, 0], head: [-12, 6, 0], jaw: [28, 0, 0], upperArmR: [34, 0, 22], forearmR: [58, 0, 0], handR: [HF, 0, 0], upperArmL: [8, 0, 4] } },
    { f: 6, pose: { pos: [0, -0.03, 0], chest: [5, -2, 0], head: [14, -4, 0], jaw: [0, 0, 0], upperArmR: [8, 0, 12], forearmR: [20, 0, 0], handR: [HF, 0, 0], upperArmL: [4, 0, 4] } },
    { f: 12, pose: { pos: [0, -0.01, 0], chest: [-5, -6, 0], head: [-10, -8, 0], jaw: [26, 0, 0], upperArmR: [38, 0, 26], forearmR: [64, 0, 0], handR: [HF, 0, 0], upperArmL: [8, 0, 4] } },
    { f: 18, pose: { pos: [0, -0.03, 0], chest: [5, 2, 0], head: [14, 4, 0], jaw: [4, 0, 0], upperArmR: [8, 0, 12], forearmR: [20, 0, 0], handR: [HF, 0, 0], upperArmL: [4, 0, 4] } },
  ] },
  // vote: a 3-frame dip (sword drawn back) → (r3) arm raised OUT to the side (hand outside the 0.75 m head), blade
  // upright beside the head: clear of the head outline at S/SE/E/N/NW/W/SW (hidden only at NE), eyes wide, jaw "huzzah", HELD
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [8, 0, 0], head: [-8, 0, 0], upperArmR: [-25, 0, 22], forearmR: [40, 0, 0], handR: [HF, 0, 0], upperArmL: [10, 0, 6] } },
    { f: 3, pose: { pos: [0, 0.03, 0], spine: [-4, 0, 4], chest: [-6, 0, 10], head: [-8, -12, -10], jaw: [16, 0, 0], ...EYES(0.2, 0.25),
      upperArmR: [10, 0, 122], forearmR: [0, 0, 0], handR: [25, 0, -72], upperArmL: [12, 0, 8], forearmL: [20, 0, 0] } },
  ] },
  // die (t2: Clocktower rule — no hit/hurt reaction, no flash, no impact kick): a gentle collapse. He sighs (shoulders
  // slump, head bows, eyes half-shut, 8) → knees give (6) → sits back on his heels (6) → lies back, legs folding (4) →
  // settles: legs splayed and FOLDED low (r2: upright boots read as horns at N/NE/NW), cape link 1 bent, eyes + jaw shut;
  // the soul wisp rises (`die`) → held. Legs FK (lying).
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 20: 'die' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], spine: [6, 0, 0], chest: [10, 0, 0], head: [18, 0, 0], ...EYES(0, -0.45),
      upperArmR: [4, 0, 6], forearmR: [12, 0, 0], upperArmL: [4, 0, 4], forearmL: [12, 0, 0] } },
    { f: 8, pose: { pos: [0, -0.13, 0], hips: [6, 0, 0], spine: [-4, 0, 0], chest: [-2, 0, 0], head: [14, 0, 0], ...BLINK,
      thighL: [55, 0, 10], shinL: [-95, 0, 0], footL: [40, 0, 0], thighR: [55, 0, 10], shinR: [-95, 0, 0], footR: [40, 0, 0],
      upperArmR: [10, 0, 22], forearmR: [30, 0, 0], upperArmL: [10, 0, 22], forearmL: [30, 0, 0] } },
    { f: 14, pose: { pos: [0, -0.2, -0.12], hips: [-45, 0, 0], chest: [-10, 0, 0], head: [10, 0, 0], ...BLINK,
      thighL: [70, 0, 12], shinL: [-60, 0, 0], thighR: [70, 0, 12], shinR: [-60, 0, 0],
      upperArmR: [0, 0, 60], forearmR: [20, 0, 0], upperArmL: [0, 0, 60], forearmL: [20, 0, 0] } },
    { f: 20, pose: { pos: [0, -0.33, -0.2], hips: [-80, 0, 0], chest: [-4, 0, 0], head: [20, 24, 0], ...BLINK,
      thighL: [62, 0, 26], shinL: [-80, 0, 0], footL: [20, 0, 0], thighR: [62, 0, 26], shinR: [-80, 0, 0], footR: [20, 0, 0], cape1: [40, 0, 0],
      upperArmR: [-10, 0, 74], forearmR: [10, 0, 0], upperArmL: [-10, 0, 74], forearmL: [10, 0, 0] } },
    { f: 24, pose: { pos: [0, -0.34, -0.2], hips: [-86, 0, 0], chest: [-4, 0, 0], head: [22, 30, 0], jaw: [0, 0, 0], ...BLINK,
      thighL: [40, 0, 38], shinL: [-112, 0, 0], footL: [30, 0, 0], thighR: [40, 0, 38], shinR: [-112, 0, 0], footR: [30, 0, 0], cape1: [40, 0, 0],
      upperArmR: [-10, 0, 80], forearmR: [10, 0, 0], upperArmL: [-10, 0, 80], forearmL: [10, 0, 0] } },
  ] },
  // oath (emote, "a knight sworn to a pond that no longer exists"): coil → SALUTE ((r3) sword upright beside the head,
  // hand OUT at the side so the blade clears the face at S/SE; chest proud, a twinkle on the blade, held 10) → (t2) the
  // PLEDGE: sword hand brought to the heart, blade lowered across the body, chin up (held 10; was a sword sweep with a
  // smear = a flourish, Clocktower rule) → he remembers the pond: head bows, eyes half-shut, a tear glyph (held 16) → idle
  oath: { fps: 30, loop: false, interp: 'step', events: { 5: 'sparkle@weapon', 25: 'emote:drop@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.04, 0], chest: [8, 10, 0], head: [-6, -8, 0], upperArmR: [20, 0, 15], forearmR: [70, 0, 0], handR: [HF, 0, 0], upperArmL: [8, 0, 6] } },
    { f: 5, pose: { pos: [0, 0.0, 0], spine: [-4, 0, 0], chest: [-8, -6, 0], head: [-6, 4, 0], ...EYES(0.1, 0.15),
      upperArmR: [20, 0, 100], forearmR: [40, 0, 0], handR: [60, 0, -60], upperArmL: [12, 0, 8], forearmL: [25, 0, 0] } },
    { f: 15, pose: PLEDGE },
    { f: 25, pose: { pos: [0, -0.04, 0], hips: [6, 0, 0], spine: [4, 0, 0], chest: [4, 0, 0], head: [20, 0, 0], ...EYES(0, -0.45),
      upperArmR: [4, 0, 12], forearmR: [10, 0, 0], upperArmL: [4, 0, 6], forearmL: [10, 0, 0] } },
    { f: 49, pose: breathe(0, 0) },
  ] },
  // (t2) point (the game's shared emote): a short wind-up (4) → the sword arm out to his right-forward at shoulder height,
  // blade turned BACK out of the line (he points with the gauntlet, not the sword), head + chest turned along the arm,
  // eyes wide, jaw open "thou!" (held 12) → a second emphasis beat (jaw shut, 1 texel forward, 8) → held point (12) → idle
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [4, 12, 0], head: [-4, 8, 0], upperArmR: [-12, 0, 18], forearmR: [70, 0, 0], handR: [HF, 0, 0], upperArmL: [8, 0, 6] } },
    { f: 4, pose: { ...POINT, jaw: [18, 0, 0] } },
    { f: 16, pose: { ...POINT, pos: [0, -0.01, 0.03], chest: [-2, -16, 0], head: [-14, -20, 0], jaw: [4, 0, 0] } },
    { f: 24, pose: POINT },
    { f: 36, pose: breathe(0, 0) },
  ] },
  // (t2) ghost (loop 72): the dead knight hovers ≈ 0.2 m up (loop clips IK the legs to the ground plants → the legs hang
  // straight, faded by the dither; module issue), pale blue (ghostFlag.s +1), halo lifted over the domes, chin up, arms
  // drifting out a little; a 2-texel float bob in 4 held drawings (18 frames each = 2.4 s per breath)
  ghost: { fps: 30, loop: true, interp: 'step', length: 72, keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: ghostPose(GHOST_BOB[i], i, 1) })) },
  // (t2) ghost-spent (loop 72): the same hover, dimmer + greyer (ghostFlag.s +0.5), NO halo (vote used), head bowed,
  // arms hanging, a lower and lazier bob
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 72, keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: ghostPose(GHOST_BOB[i] * 0.5, i, 0.5) })) },
};

// vote / die end on a HELD pose (clip.hold): repeat the last key later so the clip length covers the FX tail (vote
// sparkles 0.67 s, die soul wisp 1.2 s) — the pose does not change, the held drawing just lasts past the FX
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  return {
    name: 'frog',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['skin', 'cape'],
    faceSlot: 'skin',
    bodyPlan: 'hopper',
    heightPx: [38, 48],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'hop' },
    emote: 'oath',
    skeleton: S,
    parts: parts(S),
    // crown: the emote glyph's node (r2: the default 'head' node + 0.14 H sat INSIDE the skull, so the oath tear was hidden
    // by the head until it had risen out of it ≈ 0.5 s later, after the bowed key)
    sockets: { weapon: { bone: 'handR', ...WEAPON }, crown: { bone: 'head', at: [0, 0.36, 0.06] } },
    // (r2) 2 links, limit 30° from the rigid-follow direction (r1: 1 link, 38° → a level red board at game speed)
    chains: [{ name: 'cape', f: 4.5, zeta: 0.8, r: 0, gravity: 0.9, drag: 0.6, limit: 30, falloff: 0.85, noForward: true }],
    personality: { body: { f: 2.5, zeta: 0.8, r: 0 }, head: { f: 3, zeta: 0.8, r: 0 } },
    locomotion: { plan: 'hop', legs: { HL: ['thighL', 'shinL', 'footL'], HR: ['thighR', 'shinR', 'footR'] },
      walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4], duty: [0.25, 0.2],
      hop: [0.38 * HEIGHT, 0.46 * HEIGHT], lean: [6, 14],
      // (r3) a LEAP at 1x (critic r2: the flight drawings sat at standing height, the gait read as a squat-bob carried by
      // the crouch key): hop arc 0.38·H → the apex drawing clears the standing silhouette by ≈ 16 texels and the rise/
      // fall drawings by ≈ 8; lift > 0 now TUCKS the boots up under the body in flight (r2 hung them below the arc).
      //  - height 1.7·H scales LegGait's touchdown crouch (0.06·height → 0.12 m ≈ 4 texels) — the only knob for it;
      //    every other height-derived default is given explicitly (stepLift, stepTol, vStart, vStop = r1 values)
      //  - squash on the head: flatter + wider on the touchdown drawing, a little taller in flight
      height: 1.7 * HEIGHT, lift: [0.05, 0.06], squash: { bones: ['head'], amount: 0.1 },
      stepLift: 0.06, stepTol: 0.072, vStart: 0.122, vStop: 0.066 },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    // (t2) no smears / hit flash any more (Clocktower rule: the oath sweep became the pledge, die has no hurt reaction)
    fx: { weapon: { socket: 'weapon', length: SWORD_LEN }, stepClips: ['walk', 'run'], stepEvery: 2 },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', forearmL: 'mid' },
      ...ghostMaterial(S.findIndex((b) => b.name === 'ghostFlag'), S.findIndex((b) => b.name === 'halo')) },   // forearmL: the shield is the S/SE prop; far-forced it went dark blue-brown at S (look=far)
  };
}

export default make();
