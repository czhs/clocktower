// Props drawings (owner: props): the static fixtures and the stepped DRAWINGS (pose geometries) of every reactive
// prop: hanging shop sign, garden gate, street lamp, wind chimes, well + bucket, bell gallows, fountain, scarecrow.
// Painted kit geometry (3 tones per material, src/ambient/core.js paint / mergePose).
//
// Every builder works in PROP-LOCAL space: origin on the ground at the prop's anchor, y up, +X along the prop's
// main axis (sign arm, gate / fence line, bell beam, well windlass), +Z = the prop's front. Returns
//   { parts: [painted geo] (static, local), moving: { <part>: { pivot: [x, y, z], poses: { <name>: geo } } },
//     anchors: { <name>: [x, y, z] } (sprite emitters, light positions) }
// Pose geometries are relative to their pivot (the hinge / hook / waist), so the system places an instance at
// prop.pos + rotate(pivot) with yaw = prop.yaw (+ the gate leaf's opening angle).
//
// Sizes at the gameplay camera (vh 10: 1 texel = 0.0278 m): every part >= 0.056 m (2 texels), facets >= 0.08 m.
// Palette: docs/TOWN.md §3 ramps (timber, plank, iron, brass, glass/glow, thatch, red roof, cream) + the stage's
// world stone (src/world/props.js STONE) + the shrine water ramp, so a prop dropped into the town or the stage
// traces to the scene palette.
import * as THREE from 'three';
import * as K from '../../chars/kit.js';
import { paint } from '../core.js';

export const PAL = {
  timber: ['#7E5A44', '#5A3E30', '#32283A'],
  plank: ['#A27B5A', '#7A5840', '#463A46'],
  iron: ['#6E6A7E', '#46424F', '#2A2834'],
  brass: ['#F0D080', '#C9A040', '#7A6248'],
  glass: ['#8C9CB8', '#4E5A78', '#2C3248'],
  glow: ['#FFE6A8', '#FFC46B', '#C8803C'],
  thatch: ['#E2C27E', '#B8924E', '#6C5A50'],
  red: ['#D07C5C', '#A8503C', '#5A3848'],
  cream: ['#F2E8D0', '#D8CCB0', '#8A8692'],
  stone: ['#BBAC97', '#8C7E72', '#5B5A64'],
  stoneDark: ['#8C7E72', '#6E6470', '#4A4858'],
  water: ['#A5D2CE', '#84B7D2', '#79B5C9'],
  waterDeep: ['#79B5C9', '#4F86A6', '#2F4A5E'],
  cloth: ['#78A6B8', '#4F7A92', '#2F4A5E'],         // blue roof ramp: the scarecrow's faded shirt
  burlap: ['#D8C79A', '#C2AE84', '#8D8A86'],        // pond sand ramp: the sack head
  copper: ['#8CC2A8', '#5E9A86', '#3A5E5E'],        // verdigris roof ramp: painted lamp iron (r3: the r2 iron posts read black)
  slate: ['#7D86AE', '#545C84', '#343A58'],         // slate roof ramp: lamp hood, birdhouse roof
  glassDay: ['#A6B4CC', '#8C9CB8', '#4E5A78'],      // day glass one step up (r3: the r2 day glass was a black box)
  chimeMetal: ['#F2E8D0', '#D8CCB0', '#8A8692'],    // cream ramp: pale metal tubes
  pool: ['#A5D2CE', '#84B7D2', '#79B5C9'],
  weathered: ['#C8AE92', '#A0846C', '#625660'],     // dial ring ramp: weathered posts (bell gallows)          // shrine water: the fountain / well surface
  shore: ['#E8FBFF', '#D6F1F5', '#A5D2CE'],         // the pale shore line inside a basin rim
};
/** Sprite colours (sRGB; the system converts + darkens them at night). */
export const SPRITE = {
  water: '#E8FBFF', water2: '#D6F1F5', water3: '#A5D2CE', glint: '#FFF8E8', straw: '#E2C27E', straw2: '#B8924E',
  dust: '#B08A6A', flame: '#FFE6A8', flame2: '#FFC46B', ring: '#F2E8D0', ember: '#FF9A4A',
};

const D = Math.PI / 180;
const at = (g, x, y, z, rot = [0, 0, 0]) => K.xf(g, { at: [x, y, z], rot });
const P = (g, tones) => paint(g, tones);
/** Rotate a list of painted parts about a pivot-local axis ('x' | 'y' | 'z') by deg, around point o. */
function rot(parts, axis, deg, o = [0, 0, 0]) {
  if (!deg) return parts;
  const m = new THREE.Matrix4().makeTranslation(-o[0], -o[1], -o[2]);
  const r = axis === 'x' ? new THREE.Matrix4().makeRotationX(deg * D) : axis === 'y' ? new THREE.Matrix4().makeRotationY(deg * D) : new THREE.Matrix4().makeRotationZ(deg * D);
  const b = new THREE.Matrix4().makeTranslation(o[0], o[1], o[2]);
  const M = b.multiply(r).multiply(m);
  const nm = new THREE.Matrix3().getNormalMatrix(M);
  return parts.map((g) => {
    const c = g.clone();
    c.attributes.position.applyMatrix4(M);
    if (c.attributes.normal) { c.attributes.normal.applyMatrix3(nm); c.attributes.normal.needsUpdate = true; }
    c.attributes.position.needsUpdate = true;
    return c;
  });
}
const cat = (...l) => l.flat();
/** Translate painted parts (K.xf would strip the paint attributes). */
function shift(parts, dx, dy, dz) {
  return parts.map((g) => { const c = g.clone(); c.attributes.position.applyMatrix4(new THREE.Matrix4().makeTranslation(dx, dy, dz)); c.attributes.position.needsUpdate = true; return c; });
}
/** Painted parts -> world: rotate by yaw (rad, about +Y) and translate to pos (Vector3). Keeps paint attributes. */
export function place(parts, pos, yaw) {
  const M = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  const nm = new THREE.Matrix3().getNormalMatrix(M);
  return parts.map((g) => { const c = g.clone(); c.attributes.position.applyMatrix4(M); c.attributes.normal?.applyMatrix3(nm); return c; });
}

// ------------------------------------------------------------------------------------------------ hanging sign
// Timber post, iron bracket arm (+X) with a diagonal brace, a red-and-gold tavern board on two chain links.
// The board swings about the arm (local X): 7 drawings at 14° stops (-42 .. +42).
export const SIGN_STOPS = [-42, -28, -14, 0, 14, 28, 42];
export function sign() {
  const parts = [
    P(at(K.box(0.24, 0.12, 0.24), 0, 0.06, 0), PAL.stone),
    P(at(K.box(0.13, 2.5, 0.13), 0, 1.25, 0), PAL.plank),
    P(at(K.box(0.18, 0.08, 0.18), 0, 2.53, 0), PAL.timber),
    P(at(K.box(0.92, 0.07, 0.07), 0.5, 2.32, 0), PAL.iron),
    P(at(K.box(0.07, 0.56, 0.06), 0.24, 2.08, 0, [0, 0, 45]), PAL.iron),
    P(at(K.box(0.09, 0.09, 0.09), 0.97, 2.32, 0), PAL.iron),
  ];
  const board = () => [
    P(at(K.box(0.06, 0.12, 0.06), -0.2, -0.06, 0), PAL.iron),
    P(at(K.box(0.06, 0.12, 0.06), 0.2, -0.06, 0), PAL.iron),
    P(at(K.box(0.66, 0.46, 0.06), 0, -0.35, 0), PAL.timber),          // frame
    P(at(K.box(0.54, 0.34, 0.08), 0, -0.35, 0), PAL.red),             // painted field
    P(at(K.box(0.14, 0.17, 0.11), -0.02, -0.36, 0), PAL.brass),       // tankard
    P(at(K.box(0.06, 0.1, 0.11), 0.09, -0.35, 0), PAL.brass),         // handle
    P(at(K.box(0.18, 0.05, 0.12), -0.02, -0.25, 0), PAL.cream),       // froth
  ];
  const poses = {};
  for (const a of SIGN_STOPS) poses[`s${a}`] = rot(board(), 'x', a);
  return { parts, moving: { board: { pivot: [0.6, 2.28, 0], poses } }, anchors: {} };
}

// ------------------------------------------------------------------------------------------------ garden gate
// Two gate posts with caps, a short rail fence either side, ONE leaf (hinge at -0.55, latch at +0.55) of 2 rails,
// 2 stiles, a diagonal brace and 4 pickets. The leaf opens by the instance's yaw (stepped angles), so it is a single
// drawing + a 'lift' drawing (the leaf rides 1 texel up off the latch: the rattle beat).
export function gate() {
  const parts = [];
  for (const x of [-0.62, 0.62]) {
    parts.push(P(at(K.box(0.14, 1.12, 0.14), x, 0.56, 0), PAL.plank));
    parts.push(P(at(K.frustum(4, 0.12, 0.04, 0.1), x, 1.17, 0, [0, 45, 0]), PAL.timber));
  }
  for (const s of [-1, 1]) {
    const x0 = s * 0.62, x1 = s * 2.0, xm = (x0 + x1) / 2, L = Math.abs(x1 - x0);
    parts.push(P(at(K.box(0.12, 0.9, 0.12), x1, 0.45, 0), PAL.timber));
    parts.push(P(at(K.box(L, 0.08, 0.06), xm, 0.36, 0), PAL.plank));
    parts.push(P(at(K.box(L, 0.08, 0.06), xm, 0.76, 0), PAL.plank));
  }
  parts.push(P(at(K.box(0.06, 0.08, 0.1), 0.62 - 0.08, 0.66, 0.05), PAL.iron)); // latch keeper
  const leaf = (lift = 0, brace = true) => [
    P(at(K.box(1.04, 0.09, 0.06), 0.55, 0.3 + lift, 0), PAL.plank),
    P(at(K.box(1.04, 0.09, 0.06), 0.55, 0.82 + lift, 0), PAL.plank),
    P(at(K.box(0.08, 0.86, 0.07), 0.07, 0.56 + lift, 0), PAL.plank),
    P(at(K.box(0.08, 0.86, 0.07), 1.03, 0.56 + lift, 0), PAL.plank),
    ...(brace ? [P(at(K.box(0.07, 1.06, 0.05), 0.55, 0.56 + lift, -0.01, [0, 0, -54]), PAL.timber)] : []),
    ...[0.31, 0.55, 0.79].map((x) => P(at(K.box(0.07, 0.96, 0.04), x, 0.54 + lift, 0.02), PAL.plank)),
    P(at(K.box(0.1, 0.06, 0.09), 0.98, 0.66 + lift, 0.05), PAL.iron),   // latch bar
    P(at(K.box(0.07, 0.07, 0.09), 0.04, 0.3 + lift, 0.05), PAL.iron),   // hinges
    P(at(K.box(0.07, 0.07, 0.09), 0.04, 0.82 + lift, 0.05), PAL.iron),
  ];
  // leaf pivot = hinge axis on the left post's inner face; leaf extends +X
  // swing: the drawing for the mid-opening angles (r3): no diagonal brace (behind the pickets it doubled every outline
  // into a black cross when the leaf turned its shaded back to the camera); the system also lifts it one band (cutMod)
  const poses = { rest: leaf(0), lift: leaf(0.056), swing: leaf(0, false) };
  return { parts, moving: { leaf: { pivot: [-0.56, 0, 0], poses } }, anchors: { tip: [0.5, 0.05, 0] } };
}

// ------------------------------------------------------------------------------------------------ street lamp
// Stone foot, iron post, a crook arm (+X) and a square lantern HANGING from the arm's hook (a flat pane faces +Z),
// hip roof + ring. Head drawings: dark glass (unlit) / lit glass (the glow ramp; the flame itself is an emissive
// sprite inside), each at 5 sideways swing stops (about local Z, 8° apart): a passer-by's bow wave rocks it.
export const LAMP_STOPS = [-16, -8, 0, 8, 16];
export function lamp() {
  // r3: painted verdigris iron (the r2 iron post and head were one near-black value with their outline), a slate hood,
  // thin corner posts so the glass reads as a pane, day glass a mid slate with ONE highlight (r2: two cream slits = a face)
  const parts = [
    P(at(K.chamferBox(0.32, 0.18, 0.32, 0.3), 0, 0.09, 0), PAL.stone),
    P(at(K.box(0.2, 0.08, 0.2), 0, 0.22, 0), PAL.copper),
    P(at(K.box(0.09, 2.1, 0.09), 0, 1.3, 0), PAL.copper),
    P(at(K.box(0.15, 0.08, 0.15), 0, 2.38, 0), PAL.brass),
    P(at(K.box(0.56, 0.07, 0.07), 0.28, 2.3, 0), PAL.copper),
    P(at(K.box(0.06, 0.34, 0.05), 0.12, 2.12, 0, [0, 0, 45]), PAL.copper),
    P(at(K.box(0.06, 0.1, 0.06), 0.5, 2.23, 0), PAL.copper),
  ];
  const head = (lit) => [
    P(at(K.box(0.06, 0.1, 0.06), 0, -0.05, 0), PAL.copper),                               // ring
    P(at(K.frustum(4, 0.24, 0.05, 0.13), 0, -0.165, 0, [0, 45, 0]), PAL.slate),           // hood
    P(at(K.box(0.32, 0.05, 0.32), 0, -0.25, 0), PAL.copper),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => P(at(K.box(0.056, 0.28, 0.056), sx * 0.125, -0.41, sz * 0.125), PAL.copper)),
    P(at(K.box(0.22, 0.26, 0.22), 0, -0.41, 0), lit ? PAL.glow : PAL.glassDay),
    ...(lit ? [] : [P(at(K.box(0.056, 0.11, 0.02), -0.05, -0.36, 0.115), PAL.cream)]),   // the one highlight
    P(at(K.box(0.28, 0.05, 0.28), 0, -0.575, 0), PAL.copper),
    P(at(K.box(0.08, 0.06, 0.08), 0, -0.63, 0), PAL.brass),
  ];
  const poses = {};
  for (const a of LAMP_STOPS) { poses[`d${a}`] = rot(head(false), 'z', a); poses[`l${a}`] = rot(head(true), 'z', a); }
  return { parts, moving: { head: { pivot: [0.5, 2.18, 0], poses } }, anchors: { flame: [0, -0.43, 0], light: [0, -0.4, 0.12] } };
}

// ------------------------------------------------------------------------------------------------ wind chimes
// r3: a plank post with a T crossbar and a little slate-roofed birdhouse on top (r2's L-arm post read as a 4th, unlit
// lamp); the chime (wooden disc, 5 pale-metal tubes, a striker and a wind sail) hangs from the bar's right end.
// Tubes stay VERTICAL in every drawing: sway / splay are whole-tube sideways offsets in whole texels (r2 rotated thin
// tubes into dashed 1-px diagonals that read as hair / a tassel). rest, swayA / swayB (all tubes 1 texel one way, the
// sail 2), splayA / splayB (tubes fan out by 2 texels in alternating directions: the clash).
export const CHIME_POSES = ['rest', 'swayA', 'swayB', 'splayA', 'splayB'];
export const CHIME_DX = { rest: [0, 0, 0, 0, 0], swayA: [1, 1, 1, 1, 1], swayB: [-1, -1, -1, -1, -1], splayA: [-2, 1, -1, 2, 3], splayB: [2, -2, 1, -1, -2] };
const CHIME_SAIL = { rest: 0, swayA: 2, swayB: -2, splayA: -3, splayB: 3 };
export const TX = 0.0278;            // one texel at vh 10
export function chimes() {
  const parts = [
    P(at(K.box(0.11, 2.0, 0.11), 0, 1.0, 0), PAL.plank),
    P(at(K.box(1.08, 0.08, 0.08), 0.0, 1.96, 0), PAL.timber),
    P(at(K.box(0.06, 0.24, 0.05), 0.12, 1.84, 0, [0, 0, -45]), PAL.timber),
    P(at(K.box(0.06, 0.24, 0.05), -0.12, 1.84, 0, [0, 0, 45]), PAL.timber),
    P(at(K.box(0.07, 0.1, 0.07), 0.5, 1.88, 0), PAL.iron),
    P(at(K.box(0.34, 0.3, 0.3), 0, 2.15, 0), PAL.cream),                                // birdhouse (pale: it reads at 1x)
    P(at(K.box(0.1, 0.1, 0.02), 0, 2.16, 0.155), PAL.timber),                           // its hole
    P(at(K.box(0.12, 0.03, 0.06), 0, 2.07, 0.17), PAL.timber),                          // perch
    P(at(K.wedge(0.44, 0.18, 0.42, { top: 'center' }), 0, 2.3, 0, [0, 90, 0]), PAL.thatch),
  ];
  const tubes = [[-0.112, 0.42], [-0.056, 0.32], [0, 0.46], [0.056, 0.36], [0.112, 0.28]];
  const zs = [0.03, -0.04, 0.05, -0.03, 0.02];
  const draw = (dx, sail) => {
    const out = [P(at(K.box(0.06, 0.1, 0.06), 0, -0.05, 0), PAL.iron), P(at(K.prism(8, 0.17, 0.056), 0, -0.13, 0), PAL.brass)];
    tubes.forEach(([x, L], i) => out.push(P(at(K.box(0.056, L, 0.056), x + dx[i] * TX, -0.17 - L / 2, zs[i]), PAL.chimeMetal)));
    out.push(P(at(K.box(0.04, 0.2, 0.04), sail * TX * 0.5, -0.36, 0), PAL.iron), P(at(K.box(0.12, 0.14, 0.05), sail * TX, -0.53, 0), PAL.plank));
    return out;
  };
  const poses = Object.fromEntries(CHIME_POSES.map((k) => [k, draw(CHIME_DX[k], CHIME_SAIL[k])]));
  return { parts, moving: { chime: { pivot: [0.5, 1.83, 0], poses } }, anchors: { tubes: tubes.map(([x, L], i) => [x, -0.17 - L * 0.35, zs[i]]) } };
}

// ------------------------------------------------------------------------------------------------ well + bucket
// Octagonal stone ring (8 blocks), dark water, two timber posts, the windlass roller with its rope coil and an iron
// crank. The bucket hangs on its rope from the roller and swings sideways (about local Z): 7 drawings, 10° stops.
export const BUCKET_STOPS = [-36, -24, -12, 0, 12, 24, 36];
export function well() {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, r = 0.56;
    parts.push(P(at(K.box(0.46, 0.56, 0.2), Math.sin(a) * r, 0.28, Math.cos(a) * r, [0, (a * 180) / Math.PI, 0]), PAL.stone));
    parts.push(P(at(K.box(0.48, 0.07, 0.25), Math.sin(a) * (r + 0.01), 0.595, Math.cos(a) * (r + 0.01), [0, (a * 180) / Math.PI, 0]), PAL.stoneDark));
  }
  parts.push(P(at(K.prism(8, 0.5, 0.04), 0, 0.4, 0), PAL.pool));                      // r3: raised + palette water (drips land on it)
  for (const x of [-0.72, 0.72]) parts.push(P(at(K.box(0.13, 1.9, 0.13), x, 0.95, 0), PAL.plank));
  parts.push(P(at(K.box(1.34, 0.12, 0.12), 0, 1.44, 0), PAL.timber));                  // roller
  parts.push(P(at(K.box(0.3, 0.17, 0.17), 0, 1.44, 0), PAL.thatch));                   // rope coil
  parts.push(P(at(K.box(0.18, 0.07, 0.07), 0.85, 1.44, 0), PAL.iron));                 // crank arm
  parts.push(P(at(K.box(0.07, 0.07, 0.2), 0.92, 1.36, 0.08), PAL.iron));               // grip
  // r3: thatch, not the saturated red roof ramp (the warmest, most saturated colour in the r2 frame), + a ridge pole
  parts.push(P(at(K.wedge(1.7, 0.34, 0.66, { top: 'center' }), 0, 2.0, 0), PAL.thatch));  // little roof (high: the bucket stays visible)
  parts.push(P(at(K.box(1.78, 0.06, 0.06), 0, 2.35, 0), PAL.timber));
  // r3: a longer rope (0.36 m) and 12° stops: each stop moves the bucket 4-5 texels and tilts the rope visibly (r2's
  // 10° stops on a 0.24 m rope moved it ~1 texel at 1x)
  const bucket = () => [
    P(at(K.box(0.058, 0.36, 0.058), 0, -0.18, 0), PAL.thatch),
    P(at(K.box(0.24, 0.06, 0.06), 0, -0.39, 0), PAL.iron),                             // bail
    P(at(K.frustum(8, 0.115, 0.14, 0.22), 0, -0.53, 0), PAL.plank),
    P(at(K.prism(8, 0.147, 0.056), 0, -0.45, 0), PAL.iron),
    P(at(K.prism(8, 0.124, 0.056), 0, -0.6, 0), PAL.iron),
  ];
  const poses = {};
  for (const a of BUCKET_STOPS) poses[`b${a}`] = rot(bucket(), 'z', a);
  // pivot set back 0.12 m: the drips land on the part of the water the front ring does not hide
  return { parts, moving: { bucket: { pivot: [0, 1.38, -0.12], poses } }, anchors: { lip: [0, 0.65, 0], water: 0.42, bottom: -0.64 } };
}

// ------------------------------------------------------------------------------------------------ bell gallows
// Two timber posts + beam (+ braces), a brass bell on a timber yoke, swinging about the beam (local X): 7 drawings
// at 16° stops. The iron clapper hangs plumb inside (relative angle -θ, clamped to the mouth), so at the extreme
// drawings it touches the bell's lip: the strike.
export const BELL_STOPS = [-48, -32, -16, 0, 16, 32, 48];
export function bell() {
  const parts = [];
  for (const x of [-0.82, 0.82]) {
    parts.push(P(at(K.box(0.15, 2.62, 0.15), x, 1.31, 0), PAL.weathered));                 // r3: plank's shade tone read black
    parts.push(P(at(K.box(0.07, 0.5, 0.08), x * 0.8, 2.36, 0, [0, 0, x > 0 ? 45 : -45]), PAL.weathered));
  }
  parts.push(P(at(K.box(1.96, 0.15, 0.17), 0, 2.58, 0), PAL.timber));
  parts.push(P(at(K.wedge(2.2, 0.26, 0.56, { top: 'center' }), 0, 2.79, 0), PAL.red));
  const body = () => {
    const prof = [[0.26, -0.48], [0.245, -0.43], [0.18, -0.33], [0.145, -0.19], [0.13, -0.06], [0.085, 0]];   // bottom -> top (r2: x1.2, the r1 bell was 12 texels and sat in the roof's shadow)
    const g = K.lathe(prof, 8);                    // centred: its bbox y spans -0.24 .. 0.24
    return [P(at(K.box(0.34, 0.1, 0.13), 0, -0.05, 0), PAL.timber), P(at(g, 0, -0.1 - 0.24, 0), PAL.brass)];
  };
  const clapper = (rel) => rot([P(at(K.box(0.056, 0.42, 0.056), 0, -0.33, 0), PAL.iron), P(at(K.box(0.1, 0.1, 0.1), 0, -0.58, 0), PAL.iron)], 'x', rel, [0, -0.12, 0]);
  const poses = {};
  for (const a of BELL_STOPS) {
    const rel = Math.max(-19, Math.min(19, -a));
    poses[`b${a}`] = rot([...body(), ...clapper(rel)], 'x', a);
  }
  return { parts, moving: { bell: { pivot: [0, 2.5, 0], poses } }, anchors: { lip: [0, 2.08, 0] } };
}

// ------------------------------------------------------------------------------------------------ fountain
// Octagonal stone basin (8 blocks + rim), water, a stem and a small upper bowl with a spout knob. The water itself
// (jet, falling streams, ripples, splashes) is sprites.
export function fountain() {
  // r3: palette water (shrine ramp) raised to just under the rim, a pale shore line inside the rim, and a GOBLET on
  // the stem (knot, wide upper bowl with its own rim + water disc, finial spout) — r2's pool was waterDeep in the rim's
  // shadow (a navy hole) and the stem a featureless stub
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, r = 0.92, deg = (a * 180) / Math.PI;
    parts.push(P(at(K.box(0.74, 0.4, 0.22), Math.sin(a) * r, 0.2, Math.cos(a) * r, [0, deg, 0]), PAL.stone));
    parts.push(P(at(K.box(0.78, 0.07, 0.3), Math.sin(a) * (r + 0.01), 0.435, Math.cos(a) * (r + 0.01), [0, deg, 0]), PAL.stoneDark));
    parts.push(P(at(K.box(0.6, 0.02, 0.06), Math.sin(a) * 0.74, 0.405, Math.cos(a) * 0.74, [0, deg, 0]), PAL.shore));
  }
  parts.push(P(at(K.prism(8, 0.88, 0.04), 0, 0.38, 0), PAL.pool));
  parts.push(P(at(K.prism(8, 0.2, 0.1), 0, 0.44, 0), PAL.stone));
  parts.push(P(at(K.prism(8, 0.11, 0.42), 0, 0.66, 0), PAL.stone));
  parts.push(P(at(K.prism(8, 0.16, 0.08), 0, 0.72, 0), PAL.stoneDark));                 // knot
  parts.push(P(at(K.frustum(8, 0.12, 0.44, 0.18), 0, 0.96, 0), PAL.stone));             // goblet bowl
  parts.push(P(at(K.prism(8, 0.46, 0.06), 0, 1.07, 0), PAL.stoneDark));                 // its rim
  parts.push(P(at(K.prism(8, 0.38, 0.03), 0, 1.09, 0), PAL.pool));                      // its water
  parts.push(P(at(K.prism(8, 0.07, 0.1), 0, 1.14, 0), PAL.stone));                      // finial
  parts.push(P(at(K.prism(8, 0.04, 0.06), 0, 1.21, 0), PAL.stoneDark));
  return { parts, moving: {}, anchors: { spout: [0, 1.24, 0], rim: 0.47, rimY: 1.1, pool: 0.4, poolR: 0.86 } };
}

// ------------------------------------------------------------------------------------------------ scarecrow
// A post in the ground; the body (faded blue shirt on a cross-stick, straw cuffs + skirt, burlap sack head, hat) is
// the moving part, pivot at the waist on the post. Drawings: idle, leanL / leanR (wind), headL / headR (the head
// snaps toward a walker), startle (arms jerk up, head and hat pop up), flapA / flapB (one arm up, one down).
export const CROW_POSES = ['idle', 'leanL', 'leanR', 'headL', 'headR', 'startle', 'flapA', 'flapB'];
export function scarecrow() {
  const parts = [P(at(K.box(0.1, 1.5, 0.1), 0, 0.75, -0.02), PAL.plank), P(at(K.box(0.2, 0.06, 0.2), 0, 0.03, -0.02), PAL.plank)];
  const draw = ({ armL = 0, armR = 0, headYaw = 0, headUp = 0, hatUp = 0, hatTilt = 0, lean = 0 }) => {
    const torso = [
      P(at(K.box(0.38, 0.46, 0.2), 0, 0.25, 0), PAL.cloth),
      P(at(K.box(0.12, 0.12, 0.22), -0.08, 0.17, 0.005), PAL.red),                    // patch
      P(at(K.frustum(8, 0.25, 0.17, 0.2), 0, -0.06, 0), PAL.thatch),               // straw skirt
      P(at(K.box(0.4, 0.07, 0.22), 0, 0.05, 0), PAL.plank),                         // rope belt
    ];
    const arm = (s, deg) => rot([      // deg > 0 = arm up
      P(at(K.box(0.44, 0.14, 0.15), s * 0.4, 0.42, 0), PAL.cloth),
      P(at(K.box(0.1, 0.16, 0.12), s * 0.66, 0.4, 0, [0, 0, s * 25]), PAL.thatch),
      P(at(K.box(0.08, 0.1, 0.1), s * 0.66, 0.31, 0.02, [0, 0, -s * 20]), PAL.thatch),
    ], 'z', s * deg, [s * 0.18, 0.42, 0]);
    const head = rot([
      P(at(K.box(0.07, 0.08, 0.07), 0, 0.53 + headUp, 0), PAL.timber),
      P(at(K.chamferBox(0.25, 0.24, 0.22, 0.3), 0, 0.68 + headUp, 0), PAL.burlap),
      P(at(K.box(0.06, 0.06, 0.04), -0.055, 0.7 + headUp, 0.11), PAL.iron),          // stitched eyes
      P(at(K.box(0.06, 0.06, 0.04), 0.055, 0.7 + headUp, 0.11), PAL.iron),
      P(at(K.box(0.14, 0.06, 0.04), 0, 0.61 + headUp, 0.11), PAL.timber),            // mouth stitch
      ...rot([
        P(at(K.prism(8, 0.24, 0.05), 0, 0.82, 0), PAL.timber),
        P(at(K.frustum(8, 0.13, 0.1, 0.17), 0, 0.92, 0), PAL.timber),
        P(at(K.prism(8, 0.135, 0.056), 0, 0.87, 0), PAL.red),
      ].map((g) => shift([g], 0, headUp + hatUp, 0)[0]), 'z', hatTilt, [0, 0.82 + headUp + hatUp, 0]),
    ], 'y', headYaw, [0, 0, 0]);
    return rot(cat(torso, arm(-1, armL), arm(1, armR), head), 'z', lean, [0, -0.1, 0]);
  };
  const poses = {
    idle: draw({}), leanL: draw({ lean: 7, armL: -4, armR: 4 }), leanR: draw({ lean: -7, armL: 4, armR: -4 }),
    headL: draw({ headYaw: -40, lean: 3 }), headR: draw({ headYaw: 40, lean: -3 }),
    startle: draw({ armL: 24, armR: 24, headUp: 0.06, hatUp: 0.09, hatTilt: 14 }),
    flapA: draw({ armL: 26, armR: -10, headUp: 0.03, hatUp: 0.03, hatTilt: -8, lean: 4 }),
    flapB: draw({ armL: -10, armR: 26, headUp: 0.03, hatUp: 0.03, hatTilt: 8, lean: -4 }),
  };
  return { parts, moving: { body: { pivot: [0, 1.0, 0], poses } }, anchors: { cuffs: [[-0.68, 1.3, 0], [0.68, 1.3, 0]] } };
}

export const BUILDERS = { sign, gate, lamp, chimes, well, bell, fountain, scarecrow };
