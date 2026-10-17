// Vendor (char-npc-vendor) — cast member "npc-vendor", NPC (no blurb; inferred from the sprite): a market-stall
// vendor — olive skin, dark-brown hair in a bun, muted ochre-brown coat, plain cream apron, dark trousers.
// "Deliberately boring so it never competes with the players" (pipgws cast/npc-vendor.ts header).
// Design sheet (Unique to me, timing charts, self-critique): characters/npc-vendor.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/npc-vendor.ts (+ lib-d-human.ts) and refs/cast/npc-vendor.png.
// Body plan: plain townsfolk on chibi() (≈ 3 heads: head 0.39 m of 1.2 m incl. the bun), bodyPlan 'biped',
// LegGait 'biped' brisk scurry at the v2 game speed (3.95 H/s, 4 drawings per 0.3 s, plant 'hold', swingFloor 'gait').
// Head: a skin ellipsoid inside a hair shell whose front-lower cells are cut away (face window, no proud parts) + a bun.
// Apron skirt on its own keyed bone `apron` (swings with the stride, tucks on the sit); the emote's wares (an apple) are
// baked at 1/1000 and shown by 'wares.s' 999 in `callout` only.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.20;                 // v2 30 px → castHeight 1.20 m (bun top)
export const V_GAME = 3.95 * HEIGHT;        // 4.74 m/s

// [hi, mid, sh] sRGB. 5 slots + 1 accent (the apple, emote only). v1: skin #b48e68, hair #4e3a2c, top #76603e,
// legs #3a3236, shoes #221a1c, apron #bcb29e (string #8a806e).
export const PALETTE = {
  coat: ['#9A8052', '#76603E', '#544232'],     // muted ochre-brown coat + sleeves (v1 #76603E)
  apron: ['#DCD6C6', '#BCB29E', '#8E8474'],    // signature: the plain cream apron (v1 #BCB29E; hi cooler + lighter for golden grass, r2)
  hair: ['#563F31', '#4A3629', '#382826'],     // signature 2: the hair + bun (r2: a touch darker than v1 #4E3A2C so the bun separates from shaded grass)
  skin: ['#C29A72', '#AA8460', '#8C6A50'],     // face, neck, forearms (rolled sleeves), hands
  dark: ['#463E4A', '#3A3236', '#342C38'],     // trousers, eyes, mouth (v1 #3A3236; no black)
  wares: ['#D0705A', '#A84A3C', '#6E3434'],    // accent: the apple she holds up when calling out (muted red)
};

const RIG_H = 1.09;                          // skull top; the bun adds 0.08
const BODY = { height: RIG_H, heads: 3.05, legs: 0.75, arms: 1.0, snout: 0, ears: false, tail: false, neck: 0.1 };
// head ellipsoids (head-local; the head joint is the chin line at y 0.726)
const HEAD_C = [0, 0.2, 0.02], HEAD_R = [0.19, 0.198, 0.188];
const HAIR_C = [0, 0.214, -0.008], HAIR_R = [0.212, 0.208, 0.2];   // r2: a slightly fuller hair mass (v1 helmet; 0.218 hid the face at SE)
const BUN_AT = [0, 0.445, -0.05], BUN_R = 0.11;    // r2: 0.088 was a 1-texel bump at 25 %
// eye joint on the skin surface (head-local, L) + the surface normal there
const EYE = (() => {
  const x = 0.072, y = HEAD_C[1] - 0.01;
  const z = HEAD_C[2] + HEAD_R[2] * Math.sqrt(1 - (x / HEAD_R[0]) ** 2 - ((y - HEAD_C[1]) / HEAD_R[1]) ** 2);
  return [x, y, z];
})();
const EN = (() => {
  const n = [EYE[0] / HEAD_R[0] ** 2, (EYE[1] - HEAD_C[1]) / HEAD_R[1] ** 2, (EYE[2] - HEAD_C[2]) / HEAD_R[2] ** 2];
  return { yaw: Math.atan2(n[0], n[2]) * 180 / Math.PI, pitch: Math.atan2(n[1], Math.hypot(n[0], n[2])) * 180 / Math.PI };
})();
const MOUTH_Y = 0.074;
const MOUTH_Z = HEAD_C[2] + HEAD_R[2] * Math.sqrt(1 - ((MOUTH_Y - HEAD_C[1]) / HEAD_R[1]) ** 2);
const TINY = 0.001;

export function skeleton() {
  const S0 = chibi({ ...BODY, face: { eye: EYE, brow: false, mouth: false } });
  const m = S0.meta;
  const S = S0.map((b) => ({ ...b }));
  S.push({ name: 'mouth', parent: 'head', pos: [0, MOUTH_Y, MOUTH_Z - 0.06], axis: 'fwd' });   // plate sunk at rest
  // apron skirt: hinge at the waist front, hangs to just above the knees
  S.push({ name: 'apron', parent: 'spine', pos: [0, 0.02, 0.108], axis: 'down' });
  S.push({ name: 'wares', parent: 'handR', pos: [0, -0.07, 0.02], axis: 'down' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

// ── geometry helpers ─────────────────────────────────────────────────────────────────────────────────────────
const mkGeo = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// lat/lon cell ellipsoid (centred at 0): cells for which keep(latC, azC) is true; az 0 = front (+Z), + = character LEFT
function cellEllipsoid(R, lats, nj, keep) {
  const P = (lat, lon) => { const a = lat * Math.PI / 180, o = lon * Math.PI / 180; return [R[0] * Math.cos(a) * Math.sin(o), R[1] * Math.sin(a), R[2] * Math.cos(a) * Math.cos(o)]; };
  const out = [];
  for (let i = 0; i + 1 < lats.length; i++) {
    for (let j = 0; j < nj; j++) {
      const o0 = (j / nj) * 360 - 180, o1 = ((j + 1) / nj) * 360 - 180;
      const latC = (lats[i] + lats[i + 1]) / 2, azC = (o0 + o1) / 2;
      if (!keep(latC, azC)) continue;
      let poly = [P(lats[i], o0), P(lats[i], o1), P(lats[i + 1], o1), P(lats[i + 1], o0)];
      if (lats[i] === -90) poly = [poly[0], poly[2], poly[3]];
      else if (lats[i + 1] === 90) poly = poly.slice(0, 3);
      const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length, s[2] + p[2] / poly.length], [0, 0, 0]);
      for (let k = 1; k + 1 < poly.length; k++) {
        const a = poly[0], b = poly[k], d = poly[k + 1];
        const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]);
        if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) out.push(...a, ...d, ...b); else out.push(...a, ...b, ...d);
      }
    }
  }
  return mkGeo(out);
}
const LATS = [-90, -66, -44, -24, -6, 12, 20, 28, 46, 66, 90];
// hair: the whole cap above the fringe line (lat 12 at the front, a little lower at the temples), the back and the sides
// down to the nape; the face window (front, below the fringe) and the jaw underside are cut away
const hairKeep = (lat, az) => {
  const a = Math.abs(az);
  if (lat > (a < 40 ? 16 : 14)) return true;          // crown + fringe down to lat 20 (r2: lat 28 left a 6-texel bare forehead at S)
  if (a > 96) return lat > -50;                       // back of the head down to the nape
  if (a > 58) return lat > 12;                        // temples (above eye level)
  return false;                                       // face window
};
const ellip = (r, n = 16, rings = 8) => K.lathe(Array.from({ length: rings + 1 }, (_, i) => {
  const t = (i / rings) * Math.PI; return [Math.sin(t) < 1e-6 ? 0 : Math.sin(t), -Math.cos(t)];
}).map(([a, b]) => [a, b * r[1]]), n, { sx: r[0], sz: r[2] });
const segRot = (d) => {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z].map((r) => r * 180 / Math.PI);
};

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head: skin ellipsoid, hair shell with the face window cut out, bun, small nose, eyes, mouth plate ──
  add('head', ellip(HEAD_R, 24, 12), HEAD_C, 'skin', { name: 'face' });
  add('head', cellEllipsoid(HAIR_R, LATS, 16, hairKeep), HAIR_C, 'hair', { name: 'hair' });
  add('head', ellip([BUN_R, BUN_R * 0.85, BUN_R], 8, 6), BUN_AT, 'hair', { name: 'bun' });
  add('head', K.chamferBox(0.05, 0.05, 0.05, 0.3), [0, 0.15, HEAD_C[2] + HEAD_R[2] - 0.002], 'skin', { name: 'nose' });
  const eyeRot = { rot: [-EN.pitch, EN.yaw, 0] };
  add('eyeL', K.xf(K.box(0.058, 0.08, 0.016), eyeRot), [0, 0, -0.01], 'dark', { name: 'eye', mirror: true });
  add('mouth', K.box(0.06, 0.045, 0.03), [0, 0, 0], 'dark', { name: 'mouthPlate' });
  add('neck', K.box(0.085, 0.11, 0.085), [0, 0.04, -0.015], 'skin', { name: 'neck' });   // merged with the head (material.merge): no chin line

  // ── torso: coat (blocky, v1) with the apron bib on the front and the waist band + bow ──
  const chestH = m.shoulderY - m.chestY + 0.05;
  add('chest', K.chamferBox(0.32, chestH, 0.23, 0.3), [0, chestH / 2 - 0.01, 0], 'coat', { name: 'coat' });
  add('chest', K.box(0.16, chestH - 0.05, 0.03), [0, chestH / 2 - 0.035, 0.115], 'apron', { name: 'bib' });
  const waistH = m.chestY - m.spineY + 0.02;
  add('spine', K.chamferBox(0.30, waistH, 0.22, 0.3), [0, waistH / 2, 0], 'coat', { name: 'coat' });
  // apron strings tied at the back: ONE chunky bow (knot + two short tails), no waist band (a band only 1 texel proud of the
  // coat drew a dotted line of inner lines all round the waist: isolated px 8 at SE)
  add('spine', K.hull([[-0.1, 0.035, 0], [0.1, 0.035, 0], [-0.1, -0.035, 0], [0.1, -0.035, 0], [-0.07, 0.03, -0.045], [0.07, 0.03, -0.045], [-0.07, -0.03, -0.045], [0.07, -0.03, -0.045]]),
    [0, 0.06, -0.1], 'apron', { name: 'bow' });
  add('spine', K.hull([[-0.06, 0, 0], [0.06, 0, 0], [-0.075, -0.12, 0], [0.075, -0.12, 0], [-0.06, 0, -0.035], [0.06, 0, -0.035], [-0.075, -0.12, -0.03], [0.075, -0.12, -0.03]]),
    [0, 0.04, -0.11], 'apron', { name: 'bow' });
  const pelY = m.spineY - m.hipsY;
  add('hips', K.chamferBox(0.31, 0.13, 0.23, 0.3), [0, pelY - 0.05, 0], 'coat', { name: 'coatHem' });
  // apron skirt (on its own bone): a narrower panel that WRAPS a little round the hips (side returns set back) to
  // above the knee — r2: the flat 0.26 m slab filled the right half of the body at SE and hid the legs
  const AW = [0.07, 0.082], AY = [0.045, -0.215];
  add('apron', K.hull([
    [-AW[0], AY[0], 0.038], [AW[0], AY[0], 0.038], [-AW[1], AY[1], 0.052], [AW[1], AY[1], 0.052],          // front face
    [-AW[0] - 0.022, AY[0], 0.012], [AW[0] + 0.022, AY[0], 0.012], [-AW[1] - 0.022, AY[1], 0.026], [AW[1] + 0.022, AY[1], 0.026],   // curved sides
    [-AW[0] - 0.022, AY[0], -0.01], [AW[0] + 0.022, AY[0], -0.01], [-AW[1] - 0.022, AY[1], 0.0], [AW[1] + 0.022, AY[1], 0.0],
  ]), [0, 0, 0], 'apron', { name: 'apron' });

  // ── arms: coat upper sleeve with a rolled cuff, skin forearm + hand ──
  for (const sd of ['L', 'R']) {
    add('upperArm' + sd, K.frustum(4, 0.07, 0.075, m.upperArm + 0.04), [0, -m.upperArm / 2 + 0.01, 0], 'coat', { name: 'sleeve' + sd });
    add('forearm' + sd, K.frustum(4, 0.078, 0.078, 0.05), [0, -0.02, 0], 'coat', { name: 'cuff' + sd });
    add('forearm' + sd, K.frustum(4, 0.05, 0.055, m.forearm), [0, -m.forearm / 2 - 0.01, 0], 'skin', { name: 'arm' + sd });
    add('hand' + sd, K.chamferBox(0.075, 0.085, 0.08, 0.35), [0, -0.035, 0.005], 'skin', { name: 'hand' + sd });
  }
  // ── legs: dark trousers, brown shoes ──
  add('thighL', K.frustum(4, 0.078, 0.072, m.thigh + 0.04), [0, -m.thigh / 2, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.066, 0.07, m.shin), [0, -m.shin / 2, 0], 'dark', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.1, m.ankleY + 0.035, 0.17, 0.35), [0, -m.ankleY / 2 + 0.012, 0.035], 'coat', { name: 'shoe', mirror: true });   // r2: brown shoes in the coat slot (lighter than the dark trousers so the contact foot reads at SE)

  // ── wares (emote only): an apple with a stalk, TINY ──
  const T = (g, at) => ({ g: K.xf(g, { scale: TINY }), at: at.map((v) => v * TINY) });
  const apple = T(ellip([0.07, 0.065, 0.07], 8, 4), [0, -0.05, 0]);
  add('wares', apple.g, apple.at, 'wares', { name: 'apple' });
  const stalk = T(K.box(0.02, 0.05, 0.02), [0, 0.03, 0]);
  add('wares', stalk.g, stalk.at, 'hair', { name: 'stalk' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8), HALF = EYES(0, -0.45), WIDE = EYES(0.1, 0.15);
const OPEN = (k = 1) => ({ 'mouth.p': [0, -0.004 * k, 0.05], 'mouth.s': [0.15 * k, 0.45 * k, 0] });
const SHOW = (b) => ({ [b + '.s']: [999, 999, 999] });
const ARMS_REST = { upperArmL: [0, 0, 6], upperArmR: [0, 0, 6], forearmL: [8, 0, 0], forearmR: [8, 0, 0] };
const breathe = (d, c, extra = {}) => ({ pos: [0, -0.01 - d, 0], ...ARMS_REST, chest: [c, 0, 0], head: [-c, 0, 0], ...extra });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
const VOTE_UP = { pos: [0, 0.04, 0], spine: [-2, 0, 6], chest: [-4, -8, 8], head: [-6, 4, 6], ...OPEN(0.5),
  upperArmL: [0, 0, 8], forearmL: [8, 0, 0],
  upperArmR: [164, 0, 22], forearmR: [0, 0, 0], handR: [0, 0, 0], 'upperArmR.l': [1.7], 'forearmR.l': [1.45], 'handR.s': [0.5, 1.2, 0.3] };
const POINT = (extra = {}) => ({ pos: [0, 0, 0], chest: [-2, 18, 0], head: [-6, -10, 0], ...WIDE,
  upperArmR: [108, 0, 8], forearmR: [0, 0, 0], 'upperArmR.l': [0.5], 'forearmR.l': [0.4],
  upperArmL: [55, 0, 25], forearmL: [30, 0, 0], ...extra });
const CALL = (extra = {}) => ({ pos: [0, 0.03, 0], spine: [-4, 0, -6], chest: [-6, -6, -6], head: [-10, 6, 8], ...WIDE, ...OPEN(1.1),
  upperArmR: [128, 0, 36], forearmR: [25, 0, 0], 'upperArmR.l': [0.6], 'forearmR.l': [0.4], ...SHOW('wares'),
  upperArmL: [-20, 0, 45], forearmL: [100, 0, 0], handL: [0, 0, 0], 'handL.s': [0, 0, 0], ...extra });
// lying FLAT on her left side (hips roll 88, no hip pitch; r1 hips fwd 30 propped the hips up = "kneeling/bowing" at
// E/NE), a soft curl in the spine and knees, eyes shut. The apron skirt is merged away (scale ~0; kept at 40 % it still added +2 isolated px) so
// no dashed cream edges show between the trousers. Foreshortened (compact) facings: NE + W/SW (probes s2/d0..d8).
const DEAD = { pos: [-0.1, -0.32, -0.1], hips: [0, 0, 88], spine: [25, 0, 0], chest: [20, 0, 0], head: [0, 20, 0], ...BLINK,
  thighL: [60, 0, 0], shinL: [-90, 0, 0], thighR: [50, 0, 0], shinR: [-80, 0, 0], apron: [60, 0, 0], 'apron.s': [-0.97, -0.97, -0.97],
  upperArmL: [60, 0, 10], upperArmR: [50, 0, 10], forearmL: [60, 0, 0], forearmR: [60, 0, 0] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0) },
    { f: 30, pose: breathe(0.028, 3) },
    { f: 36, pose: breathe(0.028, 3, BLINK) },
    { f: 38, pose: breathe(0.028, 3) },
    { f: 56, pose: breathe(0.014, 1, { head: [-2, 14, 6] }) },
    { f: 66, pose: breathe(0, 0) },
  ] },
  // walk / run (LegGait drawings, f0 = left contact; blend 'add' on the plan's bob + arm swing): the apron skirt kicks
  // forward off the leading thigh, the head counter-nods
  walk: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { apron: [22, 0, 0], head: [2, 0, 0] } },
    { f: 1, pose: { apron: [6, 0, 0], head: [-3, 0, 0] } },
    { f: 2, pose: { apron: [22, 0, 0], head: [2, 0, 0] } },
    { f: 3, pose: { apron: [6, 0, 0], head: [-3, 0, 0] } },
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { apron: [30, 0, 0] } }, { f: 1, pose: { apron: [12, 0, 0] } },
    { f: 2, pose: { apron: [30, 0, 0] } }, { f: 3, pose: { apron: [12, 0, 0] } },
  ] },
  talk: { fps: 30, loop: true, interp: 'step', length: 32, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-3, -8, 0], head: [-6, -12, 6], ...OPEN(1), ...ARMS_REST,
      upperArmR: [42, 0, 34], forearmR: [76, 0, 0], handR: [0, -40, 0] } },
    { f: 8, pose: { pos: [0, -0.04, 0], chest: [2, -2, 0], head: [-1, -4, -3], ...ARMS_REST, upperArmR: [10, 0, 10], forearmR: [40, 0, 0] } },
    { f: 16, pose: { pos: [0, -0.01, 0], chest: [-3, -4, 0], head: [-6, -14, -6], ...OPEN(0.8), ...ARMS_REST,
      upperArmL: [42, 0, 34], forearmL: [76, 0, 0], handL: [0, -40, 0] } },
    { f: 24, pose: { pos: [0, -0.04, 0], chest: [2, -2, 0], head: [-1, -4, 3], ...ARMS_REST, upperArmL: [10, 0, 10], forearmL: [40, 0, 0] } },
  ] },
  // vote: a small dip, then the RIGHT hand (the near arm at SE) straight up past the bun, eyes normal, mouth a little
  // open; HELD. r2: [164, 0, 22] with `.l` 1.7/1.45 + an open hand clears the bun top 8/8 (SE ~4, E ~3 texels; s2/v*-g);
  // the chibi-length arm gets its reach from '.l' (not a stretched-thick .s)
  vote: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 4: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], chest: [6, 0, 0], head: [-6, 0, 0], ...ARMS_REST, upperArmR: [0, 0, 16], forearmR: [20, 0, 0] } },
    { f: 4, pose: VOTE_UP },
  ] },
  // point (the game's shared emote): the right arm out along the facing and a little up, the chest twisted so the right
  // shoulder leads; the left hand follows forward-low (reads at W / SW, probe pr/p1); a small re-aim nod at f20
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [4, -10, 0], head: [-2, -6, 0], ...ARMS_REST, upperArmR: [-10, 0, 10], forearmR: [60, 0, 0] } },
    { f: 4, pose: POINT() },
    { f: 20, pose: POINT({ head: [-10, -14, 4], upperArmR: [114, 0, 8] }) },
    { f: 28, pose: POINT() },
    { f: 38, pose: { pos: [0, -0.02, 0], chest: [0, 6, 0], head: [-4, 4, 0], ...ARMS_REST, upperArmR: [30, 0, 22], forearmR: [25, 0, 0] } },
    { f: 44, pose: breathe(0, 0) },
  ] },
  // die (no hurt: a gentle faint): a sway with the back of the hand to the brow, the knees buckle (kneel), she tips
  // onto her left side, then lies curled on her left side with the face toward the camera side at SE (probe pr/d3);
  // every key lower than the one before
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', dynamics: 'snap', events: { 22: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.02, 0], spine: [-4, 0, -6], chest: [-6, 0, -6], head: [-10, 10, -10], ...HALF, ...ARMS_REST,
      upperArmR: [120, 0, 20], forearmR: [110, 0, 0] } },
    { f: 10, pose: { pos: [0, -0.15, 0], spine: [14, 0, 0], chest: [12, 0, 0], head: [8, 0, 0], ...BLINK, ...KNEES(60),
      apron: [40, 0, 0], upperArmL: [30, 0, 10], upperArmR: [30, 0, 10], forearmL: [50, 0, 0], forearmR: [50, 0, 0] } },
    { f: 16, pose: { pos: [-0.06, -0.22, -0.03], hips: [0, 0, 45], spine: [10, 0, 0], chest: [10, 0, 0], head: [0, 10, 0], ...BLINK,   // r2: a clean 45 deg tip (s2/t1)
      thighL: [55, 0, 0], shinL: [-110, 0, 0], thighR: [55, 0, 0], shinR: [-110, 0, 0],
      apron: [30, 0, 0], upperArmL: [40, 0, 20], upperArmR: [30, 0, 10], forearmL: [30, 0, 0], forearmR: [40, 0, 0] } },
    { f: 22, pose: DEAD },
  ] },
  // callout (emote: the vendor's job — calling out her wares): she dips the right hand into the apron pocket, then
  // holds the apple OUT to the side at shoulder height (in front of the body at E/W), left fist on the hip, mouth wide
  // ("!"); the second call is a different drawing (r2): up on her toes, head thrown back, the apple high up-and-out at
  // 45 deg, the LEFT hand cupped at the mouth; the apple comes back to the pocket (probes s2/c6a, c18g).
  callout: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 6: 'emote:exclaim@crown', 18: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.04, 0], spine: [6, 0, 0], chest: [6, -10, 0], head: [2, -6, 0], ...HALF,
      upperArmR: [-8, 0, -4], forearmR: [55, 0, 0], upperArmL: [0, 0, 8], forearmL: [8, 0, 0] } },   // apple still in the pocket (r2: shown here it was red specks on the apron)
    { f: 6, pose: CALL({ upperArmR: [105, 0, 40], forearmR: [20, 0, 0] }) },
    { f: 18, pose: CALL({ pos: [0, 0.06, 0], spine: [-8, 0, 4], chest: [-10, -10, 4], head: [-18, 0, -6], ...OPEN(1.3), ...EYES(0, 0),
      upperArmR: [152, 0, 45], forearmR: [10, 0, 0], 'upperArmR.l': [1.1], 'forearmR.l': [0.8],
      upperArmL: [100, 0, -10], forearmL: [130, 0, 0], handL: [0, -70, 0], 'handL.s': [0.3, 0.3, 0.3] }) },
    { f: 30, pose: CALL({ pos: [0, 0.0, 0], head: [-4, 8, 2], upperArmR: [40, 0, 40], forearmR: [30, 0, 0], 'upperArmR.l': [0.2], 'forearmR.l': [0.1], ...EYES(0, 0), 'mouth.p': [0, 0, 0], 'mouth.s': [0, 0, 0] }) },
    { f: 38, pose: breathe(0, 0) },
  ] },
  ghost: { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 16, pose: {
    pos: [0, [0.03, 0.015, 0, 0.015][i], 0], head: [-4, 0, [4, 0, -4, 0][i]], ...ARMS_REST, upperArmL: [12, 0, 14], upperArmR: [12, 0, 14],
    forearmL: [30, 0, 0], forearmR: [30, 0, 0], apron: [-6, 0, 0], ...KNEES(18), ...(i === 2 ? HALF : {}) } })) },
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 18, pose: {
    pos: [0, [-0.02, -0.035, -0.05, -0.035][i], 0], spine: [3, 0, 0], chest: [3, 0, 0], head: [-1, 0, [3, 0, -3, 0][i]], ...HALF,
    upperArmL: [4, 0, 4], upperArmR: [4, 0, 4], forearmL: [10, 0, 0], forearmR: [10, 0, 0], ...KNEES(10) } })) },
};
CLIPS.vote.length = 31;
CLIPS.die.length = 61;
CLIPS.point.length = 50;
CLIPS.callout.length = 44;

export function make() {
  const S = skeleton();
  return {
    name: 'npc-vendor',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['apron', { part: 'bun' }],
    faceSlot: 'skin',
    bodyPlan: 'biped',
    heightPx: [38, 50],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'callout',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0.22, 0.5, 0.0] } },
    chains: [],
    personality: { body: { f: 2.5, zeta: 0.9, r: 0 }, head: { f: 2.5, zeta: 0.9, r: 0 } },
    locomotion: { plan: 'biped', plant: 'hold', swingFloor: 'gait', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], contactReach: 0.45,
      poses: [4, 4], duty: [0.2, 0.1], reach: 0.6, arms: [26, 34], elbows: [14, 22], bob: [0.04, 0.07], lean: [5, 10],
      lift: [0.05, 0.08], twist: [5, 8] },
    character: { quant: { yaw: 8, chain: 4 } },
    ghost: { hover: 0.14 },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { merge: { head: 'neck' }, sides: { eyeL: 'mid', eyeR: 'mid', mouth: 'mid', wares: 'mid', apron: 'mid' },
      innerLine: 'tone', creamKeep: [1, 1] },
  };
}

export default make();
