// Critter drawings (owner: critters). Every pose of every critter as painted kit geometry, feet at y = 0, facing +Z,
// centred on x/z. One flat list goes into ONE createPoseBatch (src/ambient/critters.js): the whole system is
// 1 draw call per pass whatever the number of critters or drawings.
//
// Each part carries an `aFx` (vec2) attribute: x = 1 -> eye (glows at night: cat / dog eyeshine), y = 1 -> no
// outline (water splash drawings sit on the water without a dark ring). The batch material reads it (critters.js).
//
// Sizes are authored for the gameplay camera (vh 10: 1 texel = 0.0278 m). Every part >= 0.035 m (>= 1.3 texels),
// most >= 0.05 m. Silhouette rule (docs/AMBIENT.md §5): an ALERT drawing differs from the idle one by >= 2 texels
// in outline, not by a small head turn: cat crouch drops 6+ texels, hen / duck necks stretch 3 texels, frogs flatten.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from '../../chars/kit.js';
import { paint } from '../core.js';

const V = (x, y, z) => [x, y, z];
const FX_EYE = 1, FX_NOLINE = 2, FX_DIM = 4;   // FX_DIM: aFx.x = 0.5 -> one ramp step darker at night (cream chests)

// ------------------------------------------------------------------------------------------------ palette
// [hi, mid, sh] sRGB. Shadows lean violet / wine / teal (ART_DIRECTION: warm light, cool shadow, no black / white).
export const PAL = {
  ginger: ['#F2BC84', '#D08452', '#8A4E58'],
  slate: ['#ACAAC0', '#78768F', '#47455F'],
  black: ['#7A7490', '#4C4762', '#2E2B42'],
  tux: ['#8A84A2', '#5A5474', '#36324C'],      // wall cat: charcoal + white bib / blaze / socks (separates from grey stone)
  cream: ['#F4ECD8', '#D8CCB6', '#958A9E'],
  catEye: ['#5E5A48', '#46423C', '#2E2C34'],
  hen: ['#F4F0E2', '#D6CEBC', '#9890A6'],
  henWing: ['#E6DECC', '#C0B6A4', '#887E96'],
  brownHen: ['#DCA070', '#B07450', '#6E4656'],
  brownWing: ['#C88A60', '#9A6044', '#5E3C50'],
  comb: ['#EC806C', '#C8504A', '#7E3446'],
  beak: ['#F6D47C', '#D8A84A', '#8E6A4E'],
  duckHen: ['#DCC8A6', '#AA9476', '#6A5E6E'],
  duckHenHead: ['#C8B494', '#968060', '#5E5266'],
  drake: ['#DAD8DE', '#A8A6B6', '#686882'],
  drakeHead: ['#90D4A2', '#3E8E6C', '#28525C'],
  drakeChest: ['#B87E66', '#8A5248', '#583848'],
  bill: ['#F6D47C', '#E0A040', '#8E6A4E'],
  duckFoot: ['#F6B474', '#E08A44', '#8E5A4E'],
  frog: ['#E2EE86', '#AECA52', '#5E8250'],      // lifted 1 step: the old ramp sank into the dark meadow band
  frogBelly: ['#F2ECC2', '#D2CA96', '#8E8A7C'],
  frogEye: ['#F6E47C', '#D6B042', '#7E6A44'],
  mouse: ['#E8C69C', '#B88A62', '#6E4C56'],     // field-mouse fawn: hue + value split from the teal grass and grey slabs
  mouseBelly: ['#F6EAD2', '#DCCAAE', '#9A8A92'],
  pink: ['#F2B6A6', '#D2887A', '#8E5466'],
  dog: ['#E6C29A', '#B88C6A', '#7C6258'],       // r3: shade pulled from mauve to warm brown (read as the violet flowers)       // sandy: in cloud shade the old ramp fell to one purple blob
  dogEar: ['#9A6A52', '#72503F', '#4A3638'],
  nose: ['#56485A', '#3C3444', '#2A2634'],
  splash: ['#F4FCFF', '#DAF2F6', '#A8D4D2'],
};

// ------------------------------------------------------------------------------------------------ helpers
const P = (geo, tones, fx = 0) => ({ geo, tones, fx });
const T = (list, xf) => list.map((p) => ({ ...p, geo: K.xf(p.geo, xf) }));
const B = (w, h, d, at = [0, 0, 0], rot = [0, 0, 0]) => K.xf(K.box(w, h, d), { at, rot });
const H = (pts) => K.hull(pts);
const sym = (f) => [-1, 1].flatMap((sx) => f(sx));
/** symmetric hull from a half profile [[x, y, z]...] (x >= 0) */
const HS = (half) => H(half.flatMap(([x, y, z]) => [V(x, y, z), V(-x, y, z)]));

function part(p) {
  const g = paint(p.geo, p.tones);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = p.fx & FX_EYE ? 1 : p.fx & FX_DIM ? 0.5 : 0; a[i * 2 + 1] = p.fx & FX_NOLINE ? 1 : 0; }
  g.setAttribute('aFx', new THREE.BufferAttribute(a, 2));
  return g;
}
const KEEP = ['position', 'normal', 'color', 'toneHi', 'toneSh', 'aFx'];
function pose(list) {
  const gs = list.map((p) => {
    const g = part(p);
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(gs, false);
}

// ------------------------------------------------------------------------------------------------ cat
// ~0.40 m body (14 texels), head 0.13 m (5 texels). Poses: LOAF / SIT x head {-1, 0, 1} x tail {0, 1 = tip flicked
// up 3 texels}, CROUCH (alert: flat, ears back, tail straight out), RUN1 (extended) / RUN2 (gathered), JUMP, WALK1/2.
function catHead(c, yaw = 0, { earsBack = false, pitch = 0 } = {}) {
  // local: pivot = neck (0,0,0); skull centred ~ (0, 0.05, 0.04)
  const L = [
    P(B(0.13, 0.10, 0.11, [0, 0.05, 0.04]), c.fur),
    P(B(0.075, 0.045, 0.045, [0, 0.022, 0.105]), PAL.cream, FX_DIM),
    ...sym((sx) => [P(B(0.034, 0.03, 0.02, [sx * 0.02, 0.066, 0.1]), PAL.catEye, FX_EYE)]),   // r3: the two eyes side by side (2 texels): one eye texel read as a candle flame at night
  ];
  for (const sx of [-1, 1]) {
    L.push(P(earsBack
      ? H([V(sx * 0.03, 0.095, 0.05), V(sx * 0.07, 0.095, 0.05), V(sx * 0.03, 0.095, 0.0), V(sx * 0.07, 0.09, 0.0), V(sx * 0.1, 0.075, -0.02)])
      : H([V(sx * 0.024, 0.098, 0.0), V(sx * 0.066, 0.098, 0.0), V(sx * 0.024, 0.098, 0.05), V(sx * 0.066, 0.098, 0.05), V(sx * 0.055, 0.16, 0.012)]), c.fur));
  }
  return T(L, { rot: [pitch, yaw, 0] });
}
function catTailSide(c, flick, { y = 0.025, x = 0.098, z0 = -0.15, z1 = 0.07 } = {}) {
  // tail lying along the right flank on the ground; flick: the front third lifts 3 texels
  const len = z1 - z0;
  const tip = c.tux ? [P(B(0.05, 0.05, 0.06, [x + (flick ? 0.012 : 0), y + (flick ? 0.085 : 0), flick ? z0 + len * 0.62 + 0.06 : z1 - 0.02]), PAL.cream, FX_DIM)] : [];   // tux: white tail tip
  if (!flick) return [P(B(0.046, 0.046, len, [x, y, (z0 + z1) / 2]), c.fur), ...tip];
  const a = len * 0.62;
  return [
    P(B(0.046, 0.046, a, [x, y, z0 + a / 2]), c.fur),
    P(B(0.046, 0.046, len * 0.42, [x + 0.01, y + 0.055, z0 + a + 0.03], [-52, 0, 0]), c.fur), ...tip,
  ];
}
function catLoaf(c, head, tail) {
  const body = HS([[0.08, 0, -0.17], [0.08, 0, 0.12], [0.086, 0.09, -0.16], [0.086, 0.09, 0.11], [0.06, 0.15, -0.12], [0.06, 0.15, 0.07]]);
  return [
    P(body, c.fur),
    P(HS([[0.05, 0.0, 0.1], [0.05, 0.075, 0.115], [0.04, 0.1, 0.1]]), PAL.cream, FX_DIM),
    ...(c.tux ? [P(HS([[0.062, 0.0, 0.09], [0.062, 0.095, 0.11], [0.045, 0.125, 0.09], [0.03, 0.0, 0.14]]), PAL.cream, FX_DIM),
      ...sym((sx) => [P(B(0.052, 0.036, 0.06, [sx * 0.042, 0.018, 0.15]), PAL.cream, FX_DIM)])] : []),   // tux: big bib + white socks
    ...T(catHead(c, head * 55), { at: [0, 0.12, 0.1] }),
    ...catTailSide(c, tail),
  ];
}
function catSit(c, head, tail) {
  const body = HS([[0.086, 0, -0.11], [0.08, 0, 0.07], [0.09, 0.1, -0.12], [0.06, 0.24, -0.04], [0.054, 0.27, 0.04], [0.062, 0.14, 0.085]]);
  return [
    P(body, c.fur),
    P(HS([[0.045, 0.09, 0.075], [0.04, 0.24, 0.05], [0.045, 0.16, 0.095]]), PAL.cream, FX_DIM),
    ...(c.tux ? [P(HS([[0.06, 0.07, 0.07], [0.05, 0.25, 0.04], [0.058, 0.15, 0.1]]), PAL.cream, FX_DIM)] : []),
    ...sym((sx) => [P(B(0.044, 0.15, 0.044, [sx * 0.034, 0.075, 0.085]), PAL.cream, FX_DIM)]),
    ...T(catHead(c, head * 55), { at: [0, 0.265, 0.03] }),
    ...catTailSide(c, tail, { x: 0.1, z0: -0.13, z1: 0.1 }),
  ];
}
function catCrouch(c) {
  const body = HS([[0.088, 0, -0.2], [0.088, 0, 0.15], [0.085, 0.085, -0.2], [0.075, 0.105, -0.14], [0.075, 0.105, 0.1], [0.07, 0.07, 0.17]]);
  return [
    P(body, c.fur),
    ...sym((sx) => [P(B(0.05, 0.05, 0.07, [sx * 0.05, 0.025, 0.19]), PAL.cream, FX_DIM)]),
    ...T(catHead(c, 0, { earsBack: true, pitch: 8 }), { at: [0, 0.06, 0.15] }),
    P(B(0.062, 0.062, 0.24, [0, 0.07, -0.31], [-8, 0, 0]), c.fur),     // tail straight out behind, puffed
  ];
}
function catLeg(c, at, rot, h = 0.17, paw = true) {
  const L = [P(B(0.048, h, 0.048, [0, -h / 2, 0]), c.fur)];
  if (paw) L.push(P(B(0.05, 0.04, 0.06, [0, -h + 0.02, 0.008]), PAL.cream, FX_DIM));
  return T(L, { rot, at });
}
function catRun(c, phase) {
  if (phase === 0) {  // extended: long low body, legs reaching fore and aft
    const body = HS([[0.07, 0.11, -0.24], [0.07, 0.11, 0.2], [0.07, 0.22, -0.22], [0.065, 0.24, 0.16], [0.06, 0.15, 0.24]]);
    return [
      P(body, c.fur), P(HS([[0.045, 0.11, 0.12], [0.045, 0.11, 0.23], [0.04, 0.17, 0.25]]), PAL.cream, FX_DIM),
      ...sym((sx) => catLeg(c, [sx * 0.04, 0.17, 0.18], [-62, 0, 0], 0.17)),
      ...sym((sx) => catLeg(c, [sx * 0.04, 0.17, -0.2], [62, 0, 0], 0.18)),
      ...T(catHead(c, 0, { pitch: 10, earsBack: true }), { at: [0, 0.2, 0.21] }),
      P(B(0.048, 0.048, 0.24, [0, 0.25, -0.34], [14, 0, 0]), c.fur),
    ];
  }
  // gathered: arched short body, all four feet under it, tail up
  const body = HS([[0.07, 0.08, -0.17], [0.07, 0.08, 0.15], [0.068, 0.2, -0.15], [0.06, 0.26, -0.02], [0.065, 0.2, 0.15]]);
  return [
    P(body, c.fur), P(HS([[0.045, 0.08, 0.1], [0.045, 0.08, 0.16], [0.04, 0.15, 0.17]]), PAL.cream, FX_DIM),
    ...sym((sx) => catLeg(c, [sx * 0.04, 0.12, 0.1], [28, 0, 0], 0.13)),
    ...sym((sx) => catLeg(c, [sx * 0.04, 0.12, -0.1], [-30, 0, 0], 0.13)),
    ...T(catHead(c, 0, { pitch: 14 }), { at: [0, 0.2, 0.15] }),
    P(B(0.048, 0.048, 0.2, [0, 0.29, -0.24], [48, 0, 0]), c.fur),
  ];
}
// r3: the ridge hop's airborne drawing: a SHORT arched body (0.34 m), fore legs reaching down-forward, hind legs
// trailing, tail curved UP. RUN1 (0.48 m flat, tail straight) read as a dark plank sliding along the ridge even for 2 ticks
function catHop(c) {
  const body = HS([[0.07, 0.12, -0.17], [0.07, 0.12, 0.15], [0.068, 0.22, -0.15], [0.062, 0.27, -0.02], [0.064, 0.22, 0.16]]);
  return [
    P(body, c.fur), P(HS([[0.045, 0.12, 0.1], [0.045, 0.12, 0.17], [0.04, 0.18, 0.18]]), PAL.cream, FX_DIM),
    ...sym((sx) => catLeg(c, [sx * 0.04, 0.17, 0.12], [-40, 0, 0], 0.15)),
    ...sym((sx) => catLeg(c, [sx * 0.04, 0.17, -0.13], [50, 0, 0], 0.16)),
    ...T(catHead(c, 0, { pitch: 4 }), { at: [0, 0.22, 0.16] }),
    P(B(0.048, 0.048, 0.2, [0, 0.33, -0.25], [52, 0, 0]), c.fur),
  ];
}
// r3: the leap is a COMPACT arched body (0.32 m, not the 0.48 m stretched RUN1 tilted up: a 13-texel plank whose outline
// broke into dashes): front paws reaching up the face, hind legs still pushing, tail trailing low
function catJump(c) {
  const body = HS([[0.07, 0.1, -0.15], [0.07, 0.1, 0.13], [0.068, 0.21, -0.13], [0.062, 0.25, -0.01], [0.064, 0.2, 0.15]]);
  return T([
    P(body, c.fur), P(HS([[0.045, 0.1, 0.08], [0.045, 0.1, 0.15], [0.04, 0.16, 0.16]]), PAL.cream, FX_DIM),
    ...sym((sx) => catLeg(c, [sx * 0.04, 0.16, 0.12], [-105, 0, 0], 0.15)),
    ...sym((sx) => catLeg(c, [sx * 0.04, 0.14, -0.12], [40, 0, 0], 0.17)),
    ...T(catHead(c, 0, { pitch: -6 }), { at: [0, 0.21, 0.15] }),
    P(B(0.048, 0.048, 0.2, [0, 0.13, -0.26], [-10, 0, 0]), c.fur),
  ], { rot: [-36, 0, 0], at: [0, 0.07, 0] });
}
function catWalk(c, phase) {
  const s = phase === 0 ? 1 : -1;
  const body = HS([[0.072, 0.1, -0.19], [0.072, 0.1, 0.15], [0.07, 0.22, -0.17], [0.066, 0.23, 0.12], [0.064, 0.16, 0.18]]);
  return [
    P(body, c.fur), P(HS([[0.045, 0.1, 0.1], [0.045, 0.1, 0.18], [0.04, 0.16, 0.19]]), PAL.cream, FX_DIM),
    catLeg(c, [-0.04, 0.15, 0.12], [-18 * s, 0, 0], 0.15), catLeg(c, [0.04, 0.15, 0.12], [18 * s, 0, 0], 0.15),
    catLeg(c, [-0.04, 0.15, -0.14], [18 * s, 0, 0], 0.15), catLeg(c, [0.04, 0.15, -0.14], [-18 * s, 0, 0], 0.15),
    ...T(catHead(c, 0, { pitch: 6 }), { at: [0, 0.18, 0.16] }),
    P(B(0.046, 0.046, 0.22, [0, 0.2, -0.29], [phase === 0 ? 22 : 34, 0, 0]), c.fur),
  ].flat();
}
export function catPoses(coat, { full = true } = {}) {
  const c = { fur: PAL[coat], tux: coat === 'tux' };
  const out = {};
  for (const head of [-1, 0, 1]) for (const tail of [0, 1]) {
    out[`LOAF${head}${tail}`] = pose(catLoaf(c, head, tail));
    out[`SIT${head}${tail}`] = pose(catSit(c, head, tail));
  }
  if (full) {
    out.CROUCH = pose(catCrouch(c));
    out.RUN1 = pose(catRun(c, 0)); out.RUN2 = pose(catRun(c, 1));
    out.JUMP = pose(catJump(c));
    out.HOP = pose(catHop(c));
    out.WALK1 = pose(catWalk(c, 0)); out.WALK2 = pose(catWalk(c, 1));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ hen
// 0.33 m tall (12 texels). STAND, PECK, ALERT (neck +3 texels), RUN1/RUN2 (wings out up / down, legs apart), WALK1/2.
function henBody(h, { pitch = 0, lift = 0 } = {}) {
  const body = HS([[0.05, 0.16, 0.11], [0.05, 0.24, 0.11], [0.068, 0.1, 0.04], [0.07, 0.26, 0.03], [0.064, 0.1, -0.07], [0.06, 0.24, -0.08], [0.04, 0.15, -0.13], [0.03, 0.3, -0.13]]);
  const tail = HS([[0.03, 0.22, -0.11], [0.03, 0.36, -0.16], [0.025, 0.34, -0.2], [0.03, 0.24, -0.17]]);
  const wing = (sx) => [P(H([V(sx * 0.06, 0.22, 0.06), V(sx * 0.075, 0.2, 0.04), V(sx * 0.072, 0.13, 0.02), V(sx * 0.06, 0.22, -0.08), V(sx * 0.068, 0.15, -0.09)]), h.wing)];
  return T([P(body, h.body), P(tail, h.wing), ...sym(wing)], { rot: [pitch, 0, 0], at: [0, lift, 0] });
}
function henHead(h, at, neck = 0.08) {
  const [x, y, z] = at;
  return [
    P(B(0.058, neck, 0.058, [x, y - neck / 2 - 0.02, z - 0.01]), h.body),
    P(B(0.066, 0.072, 0.076, [x, y, z]), h.body),
    P(B(0.026, 0.044, 0.062, [x, y + 0.054, z - 0.004]), PAL.comb),
    P(B(0.026, 0.032, 0.026, [x, y - 0.042, z + 0.034]), PAL.comb),
    P(B(0.034, 0.026, 0.04, [x, y - 0.004, z + 0.054]), PAL.beak),
  ];
}
const henLegs = (step = 0, h = 0.1) => sym((sx) => [P(B(0.042, h, 0.042, [sx * 0.03, h / 2, sx * step]), PAL.beak)]);
function henWings(h, angle) {
  return sym((sx) => [P(K.xf(H([V(0, 0, 0.06), V(0, 0, -0.08), V(0, 0.035, 0.06), V(0, 0.035, -0.08), V(sx * 0.12, 0.0, 0.02), V(sx * 0.12, 0.0, -0.09), V(sx * 0.13, 0.03, -0.04)]), { rot: [0, 0, sx * angle], at: [sx * 0.055, 0.22, -0.01] }), h.wing)]);
}
export function henPoses(coat) {
  const h = coat === 'brown' ? { body: PAL.brownHen, wing: PAL.brownWing } : { body: PAL.hen, wing: PAL.henWing };
  return {
    STAND: pose([...henBody(h), ...henHead(h, [0, 0.31, 0.1]), ...henLegs()]),
    PECK: pose([...henBody(h, { pitch: 28 }), ...henHead(h, [0, 0.075, 0.2], 0.04), ...henLegs()]),
    ALERT: pose([...henBody(h, { pitch: -10 }), ...henHead(h, [0, 0.4, 0.075], 0.16), ...henLegs(0, 0.11)]),
    RUN1: pose([...henBody(h, { pitch: 16, lift: 0.01 }), ...henHead(h, [0, 0.29, 0.16]), ...henWings(h, 48), ...henLegs(0.04)]),
    RUN2: pose([...henBody(h, { pitch: 16, lift: 0.03 }), ...henHead(h, [0, 0.31, 0.16]), ...henWings(h, -8), ...henLegs(-0.04)]),
    WALK1: pose([...henBody(h, { pitch: 6 }), ...henHead(h, [0, 0.31, 0.135]), ...henLegs(0.035)]),
    WALK2: pose([...henBody(h), ...henHead(h, [0, 0.315, 0.1]), ...henLegs(-0.035)]),
  };
}

// ------------------------------------------------------------------------------------------------ duck
// 0.34 m long. STAND, PECK, ALERT (neck +3 texels), WADDLE1/2 (body rolls +-12 deg), SWIM (body sunk, no legs), DIP.
function duckBody(d, { roll = 0, pitch = 0, lift = 0.05 } = {}) {
  const body = HS([[0.05, 0.06, 0.13], [0.05, 0.15, 0.13], [0.075, 0.04, 0.03], [0.075, 0.17, 0.03], [0.066, 0.05, -0.1], [0.064, 0.15, -0.1], [0.02, 0.11, -0.18], [0.02, 0.17, -0.18]]);
  const L = [P(body, d.body)];
  if (d.chest) L.push(P(HS([[0.052, 0.07, 0.1], [0.05, 0.15, 0.12], [0.045, 0.1, 0.145]]), d.chest));
  L.push(...sym((sx) => [P(H([V(sx * 0.06, 0.16, 0.06), V(sx * 0.078, 0.14, 0.04), V(sx * 0.076, 0.08, 0.02), V(sx * 0.055, 0.16, -0.13), V(sx * 0.06, 0.1, -0.12)]), d.wing)]));
  return T(L, { rot: [pitch, 0, roll], at: [0, lift, 0] });
}
function duckHead(d, at, neck = 0.08) {
  const [x, y, z] = at;
  return [
    P(B(0.05, neck, 0.05, [x, y - neck / 2 - 0.02, z - 0.012]), d.head),
    P(B(0.07, 0.07, 0.085, [x, y, z])
      , d.head),
    P(B(0.048, 0.024, 0.07, [x, y - 0.018, z + 0.07]), PAL.bill),
  ];
}
const duckLegs = (step = 0) => sym((sx) => [P(B(0.044, 0.06, 0.05, [sx * 0.034, 0.03, sx * step + 0.01]), PAL.duckFoot)]);
export function duckPoses(coat) {
  const d = coat === 'drake'
    ? { body: PAL.drake, wing: PAL.duckHen, head: PAL.drakeHead, chest: PAL.drakeChest }
    : { body: PAL.duckHen, wing: PAL.duckHenHead, head: PAL.duckHenHead, chest: null };
  const sink = (L) => T(L, { at: [0, -0.085, 0] });
  return {
    STAND: pose([...duckBody(d), ...duckHead(d, [0, 0.27, 0.12]), ...duckLegs()]),
    PECK: pose([...duckBody(d, { pitch: 22 }), ...duckHead(d, [0, 0.06, 0.2], 0.04), ...duckLegs()]),
    ALERT: pose([...duckBody(d, { pitch: -8 }), ...duckHead(d, [0, 0.35, 0.1], 0.16), ...duckLegs()]),
    WADDLE1: pose([...duckBody(d, { roll: 12, pitch: 6 }), ...duckHead(d, [0.02, 0.27, 0.15]), ...duckLegs(0.035)]),
    WADDLE2: pose([...duckBody(d, { roll: -12, pitch: 6 }), ...duckHead(d, [-0.02, 0.27, 0.15]), ...duckLegs(-0.035)]),
    SWIM: pose(sink([...duckBody(d), ...duckHead(d, [0, 0.26, 0.13])])),
    DIP: pose(sink([...duckBody(d, { pitch: 30, lift: 0.07 }), ...duckHead(d, [0, 0.07, 0.2], 0.04)])),
  };
}

// ------------------------------------------------------------------------------------------------ frog
// 0.17 m (drawn at scale 1.3 -> 8 texels). SIT, CROUCH (alert: flatter, legs splayed), LEAP, HEADS (eyes at the
// water line), + water FX: SPLASH1 (column + droplets), SPLASH2 (ring + low droplets), RING (flat ripple).
function frogSit(f, { flat = 1, splay = 0 } = {}) {
  const k = flat;
  return [
    P(HS([[0.046, 0, 0.06], [0.05, 0, -0.05], [0.036, 0.07 * k, -0.045], [0.032, 0.066 * k, 0.03], [0.02, 0.03 * k, 0.085]]), PAL.frog),
    P(HS([[0.03, 0.0, 0.07], [0.022, 0.022 * k, 0.082]]), PAL.frogBelly),
    ...sym((sx) => [
      P(B(0.042, 0.038, 0.095, [sx * (0.062 + splay), 0.019, -0.03], [0, sx * splay * 300, 0]), PAL.frog),
      P(B(0.032, 0.05 * k, 0.032, [sx * (0.036 + splay * 0.5), 0.025 * k, 0.062]), PAL.frog),
      P(B(0.036, 0.032, 0.036, [sx * 0.028, 0.072 * k, 0.034]), PAL.frogEye),
    ]),
  ];
}
function frogLeap(f) {
  const body = T([
    P(HS([[0.044, 0, 0.065], [0.048, 0, -0.05], [0.034, 0.065, -0.045], [0.03, 0.06, 0.03], [0.02, 0.03, 0.09]]), PAL.frog),
    P(HS([[0.03, 0.0, 0.07], [0.022, 0.022, 0.085]]), PAL.frogBelly),
    ...sym((sx) => [P(B(0.036, 0.032, 0.036, [sx * 0.028, 0.068, 0.034]), PAL.frogEye)]),
  ], { rot: [-24, 0, 0], at: [0, 0.03, 0] });
  return [...body,
    ...sym((sx) => [P(B(0.036, 0.036, 0.15, [sx * 0.045, 0.02, -0.13], [-14, sx * 10, 0]), PAL.frog),
      P(B(0.03, 0.03, 0.07, [sx * 0.036, 0.0, 0.1], [30, 0, 0]), PAL.frog)])];
}
function frogHeads() {
  return [
    P(HS([[0.03, -0.02, 0.0], [0.03, -0.02, 0.065], [0.024, 0.012, 0.01], [0.02, 0.012, 0.055]]), PAL.frog),
    ...sym((sx) => [P(B(0.036, 0.034, 0.036, [sx * 0.028, 0.024, 0.03]), PAL.frogEye)]),
  ];
}
export function frogPoses() {
  return {
    SIT: pose(frogSit()),
    CROUCH: pose(frogSit(null, { flat: 0.62, splay: 0.02 })),
    LEAP: pose(frogLeap()),
    HEADS: pose(frogHeads()),
  };
}
export function fxPoses() {
  const s = PAL.splash, F = FX_NOLINE;
  const ring = (n, r, w, h, y, d = 0.03) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return P(B(w, h, d, [Math.sin(a) * r, y, Math.cos(a) * r], [0, (a * 180) / Math.PI, 0]), s, F);
  });
  return {
    SPLASH1: pose([P(B(0.05, 0.13, 0.05, [0, 0.065, 0]), s, F), ...ring(6, 0.09, 0.04, 0.04, 0.11), ...ring(6, 0.13, 0.05, 0.02, 0.01)]),
    SPLASH2: pose([...ring(8, 0.19, 0.06, 0.02, 0.01), ...ring(4, 0.24, 0.036, 0.036, 0.06)]),
    RING: pose(ring(10, 0.27, 0.07, 0.012, 0.004, 0.035)),
  };
}

// ------------------------------------------------------------------------------------------------ mouse
// 0.13 m body + tail (drawn at scale 1.25). CROUCH (low sniff), SIT (upright: alert), RUN1 (stretched) / RUN2 (arched).
function mouseBody({ pitch = 0, arch = 0, stretch = 1 } = {}) {
  const L = [
    P(HS([[0.036, 0, -0.06 * stretch], [0.036, 0, 0.04 * stretch], [0.03, 0.056 + arch, -0.045 * stretch], [0.026, 0.05 + arch * 0.5, 0.03 * stretch], [0.012, 0.024, 0.095 * stretch]]), PAL.mouse),
    P(HS([[0.026, 0.0, -0.035 * stretch], [0.024, 0.0, 0.05 * stretch], [0.02, 0.026, 0.07 * stretch]]), PAL.mouseBelly),
    ...sym((sx) => [P(B(0.036, 0.04, 0.018, [sx * 0.026, 0.07 + arch * 0.5, 0.035 * stretch]), PAL.mouseBelly)]),   // r3: cream ears (the 1-texel highlight that reads at x1)
  ];
  return T(L, { rot: [pitch, 0, 0] });
}
const mouseTail = (curl = 0) => [P(B(0.03, 0.026, 0.13, [curl * 0.03, 0.014, -0.12], [0, curl * 25, 0]), PAL.pink)];
export function mousePoses() {
  return {
    CROUCH: pose([...mouseBody(), ...mouseTail(0.6)]),
    SIT: pose([...T(mouseBody({ pitch: -78 }), { at: [0, 0.022, -0.03] }), ...mouseTail(1)]),   // r3: 2 texels taller (upright)
    RUN1: pose([...mouseBody({ stretch: 1.18, arch: -0.012 }), ...mouseTail(0)]),
    RUN2: pose([...T(mouseBody({ stretch: 0.85, arch: 0.016 }), { at: [0, 0.01, 0] }), ...mouseTail(-0.8)]),
  };
}

// ------------------------------------------------------------------------------------------------ dog
// r3: a DOG, not a hyena / goat: big head with floppy ears (a 2-texel dark mass hanging past the jaw), legs 20 %
// shorter (0.21 m), a wider body. Body segments are `ridge` hulls: a narrow spine top (0.07 m) with 60-degree bevels,
// so the outline pass's cream rim (top face vs a neighbour >= 0.35 lower in n.y) can only sit on the spine; the bevel
// (n.y 0.5) is not top-facing and the flank gets no second line. ~0.55 m at the head (20 texels), 0.6 m long.
// Poses: STAND, TROT1/2, SIT, SIT2 (wag), LIE{-1,0,1} (head up, 3 yaw stops), LIEW{h} (tail thump), LIEDOWN (chin on
// the paws), LIEDOWN2 (head tucked back into the curl: the settle beat). Lying is CURLED (rear half swung 30 deg,
// tail round the front): a C, not a plank.
const DL = 0.21;
/** body segment: sections [z, y0 (belly), y1 (spine), half-width w, half-top] -> spine top + 60 deg bevels + sides */
function ridge(secs) {
  return H(secs.flatMap(([z, y0, y1, w, top = 0.035]) => {
    const sh = Math.max(y0 + 0.01, y1 - (w - top) * 1.73);
    return [V(w * 0.94, y0, z), V(-w * 0.94, y0, z), V(w, sh, z), V(-w, sh, z), V(top, y1, z), V(-top, y1, z)];
  }));
}
function dogHead(pitch = 0, yaw = 0) {
  const L = [
    P(B(0.17, 0.15, 0.16, [0, 0.06, 0.05]), PAL.dog),
    P(B(0.1, 0.08, 0.11, [0, 0.02, 0.17]), PAL.cream, FX_DIM),
    P(B(0.05, 0.04, 0.03, [0, 0.05, 0.225]), PAL.nose),
    ...sym((sx) => [P(B(0.06, 0.15, 0.085, [sx * 0.108, 0.035, 0.03], [0, 0, sx * 7]), PAL.dogEar),
      P(B(0.036, 0.032, 0.02, [sx * 0.042, 0.085, 0.13]), PAL.catEye, FX_EYE)]),
  ];
  return T(L, { rot: [pitch, yaw, 0] });
}
function dogLeg(at, rot = 0, h = DL) {
  return T([P(B(0.075, h, 0.075, [0, -h / 2, 0]), PAL.dog), P(B(0.08, 0.05, 0.095, [0, -h + 0.025, 0.014]), PAL.cream, FX_DIM)], { rot: [rot, 0, 0], at });
}
function dogBody({ lift = 0, pitch = 0 } = {}) {
  return T([
    P(ridge([[0.24, 0.22, 0.39, 0.095], [0.1, 0.2, 0.405, 0.11], [-0.12, 0.2, 0.395, 0.105], [-0.25, 0.23, 0.37, 0.088]]), PAL.dog),
    P(HS([[0.06, 0.21, 0.21], [0.06, 0.35, 0.27], [0.05, 0.27, 0.285]]), PAL.cream, FX_DIM),
  ], { rot: [pitch, 0, 0], at: [0, lift, 0] });
}
const dogTailUp = (sw = 0) => [P(B(0.055, 0.055, 0.17, [sw * 0.03, 0.42, -0.31], [28, sw * 20, 0]), PAL.dog)];
export function dogPoses() {
  const stand = (lift, fl, fr, bl, br, tail) => [...dogBody({ lift }), ...dogLeg([-0.06, DL + 0.02 + lift, 0.16], fl), ...dogLeg([0.06, DL + 0.02 + lift, 0.16], fr),
    ...dogLeg([-0.06, DL + 0.02 + lift, -0.17], bl), ...dogLeg([0.06, DL + 0.02 + lift, -0.17], br), ...tail];
  // sitting: haunches on the ground, chest up, front legs straight, head on top; tail on the ground (wag = other side)
  const sit = (sw) => [
    P(HS([[0.1, 0, -0.2], [0.1, 0, 0.04], [0.105, 0.17, -0.22], [0.09, 0.3, -0.07], [0.09, 0.39, 0.1], [0.04, 0.43, 0.05], [0.085, 0.24, 0.16]]), PAL.dog),
    P(HS([[0.055, 0.2, 0.15], [0.055, 0.37, 0.14], [0.045, 0.29, 0.185]]), PAL.cream, FX_DIM),
    ...sym((sx) => [P(B(0.07, 0.14, 0.2, [sx * 0.1, 0.07, -0.1]), PAL.dog)]),
    ...dogLeg([-0.055, 0.31, 0.13], 0, 0.31), ...dogLeg([0.055, 0.31, 0.13], 0, 0.31),
    ...T(dogHead(-6), { at: [0, 0.42, 0.16] }),
    P(B(0.05, 0.05, 0.22, [sw * 0.13, 0.025, -0.24], [0, sw * 50, 0]), PAL.dog),
  ];
  // lying, curled: front half straight, rear half swung toward -x; paws forward; head up (yaw stop) or down / tucked
  const lie = (down, head = 0, wag = 0) => {
    const rear = T([
      P(ridge([[0.08, 0, 0.205, 0.11], [-0.2, 0, 0.185, 0.1]]), PAL.dog),
      ...sym((sx) => [P(B(0.07, 0.12, 0.17, [sx * 0.1, 0.06, -0.12]), PAL.dog)]),
    ], { rot: [0, -30, 0], at: [0, 0, 0.02] });
    const headAt = down === 2 ? { h: dogHead(10, -75), at: [-0.13, 0.05, 0.16] }
      : down ? { h: dogHead(12, -18), at: [-0.02, 0.04, 0.29] } : { h: dogHead(-4, head * 40), at: [0, 0.19, 0.24] };
    return [
      P(ridge([[0.25, 0, 0.19, 0.1], [0.04, 0, 0.21, 0.11]]), PAL.dog),
      P(HS([[0.055, 0.03, 0.22], [0.055, 0.16, 0.25], [0.045, 0.08, 0.265]]), PAL.cream, FX_DIM),
      ...rear,
      ...sym((sx) => [P(B(0.07, 0.06, 0.18, [sx * 0.06, 0.03, 0.33]), PAL.dog), P(B(0.078, 0.05, 0.07, [sx * 0.06, 0.025, 0.43]), PAL.cream, FX_DIM)]),
      ...T(headAt.h, { at: headAt.at }),
      wag ? P(B(0.05, 0.05, 0.24, [0.0, 0.07, -0.36], [0, 10, 0]), PAL.dog)            // thump: tail out behind
        : P(B(0.05, 0.05, 0.26, [-0.2, 0.025, 0.02], [0, -12, 0]), PAL.dog),        // round the front of the curl
    ];
  };
  const lies = {};
  for (const h of [-1, 0, 1]) { lies[`LIE${h}`] = pose(lie(false, h, 0)); lies[`LIEW${h}`] = pose(lie(false, h, 1)); }
  return {
    STAND: pose([...stand(0, 0, 0, 0, 0, dogTailUp()), ...T(dogHead(-4), { at: [0, 0.4, 0.27] })]),
    TROT1: pose([...stand(0.0, -24, 20, 20, -24, dogTailUp(1)), ...T(dogHead(6), { at: [0, 0.38, 0.28] })]),
    TROT2: pose([...stand(0.025, 20, -24, -24, 20, dogTailUp(-1)), ...T(dogHead(6), { at: [0, 0.405, 0.28] })]),
    SIT: pose(sit(1)), SIT2: pose(sit(-1)),
    LIEDOWN: pose(lie(1)), LIEDOWN2: pose(lie(2)), ...lies,
  };
}
