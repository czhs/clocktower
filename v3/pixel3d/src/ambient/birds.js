// Ambient system "birds" (owner: birds). Docs: docs/AMBIENT.md (contract).
//
// Pigeons and sparrows feeding on the ground, crows on perches (pillar tops, wall ridge). They peck / waddle / hop
// on stepped clocks, ALERT (a silhouette change) when a walker comes near, SCATTER into the air (steep takeoff,
// frantic flap), CIRCLE overhead as a boids-lite flock (orbit + separation + alignment, stepped flap cycles with
// glides), and RESETTLE on the ground / their perch once every walker has stayed away for a while. Day (noon,
// morning): pigeons + sparrows + 3 perched crows. Dusk (golden): crows only (more of them, some on the ground).
// Night: no birds at all.
//
// ---- Unique-to-me sheet (docs/AMBIENT.md §9) ----------------------------------------------------------------------
// Extra animated parts: wings (folded saddle / up / mid / down / glide / landing flare), tail flick (alert), crow
//   beak open (caw), legs tucked in flight, a pigeon's head bob while it waddles.
// Own gait / motion: pigeons WADDLE (head-bob drawing on every other beat, 1-texel steps) and burst up steeply;
//   sparrows HOP two-footed (2-texel jump, crouched drawing) and fly in bounds (flap flap fold: the closed-wing
//   "ball" drawing); crows hop SIDEWAYS along the wall ridge and row slowly (5 fps flap) with long glides; at dusk
//   they walk the dirt with a stride drawing.
// Expressions: alert = neck stretched 2+ texels taller and tail up (pigeon), tail cocked + upright (sparrow),
//   upright with beak open (crow); a fright = the takeoff jump (no smooth fades anywhere).
// Readability at game speed: radii tuned with lookahead so sparrows flush ~0.6 s and pigeons ~0.5 s before a
//   4-heights-per-second walker reaches them (ambientpack reaction_lead); every drawing differs from its neighbour
//   by >= 2 texels in silhouette (alert vs stand, flap up vs down, fold vs open).
//
// Clocks (all on the 15 Hz ambient grid): flight travel k=1 (the Ticker), takeoff flap k=1 for 0.4 s, pigeon flap
// k=2, sparrow bound k=2, crow flap k=3, pecks / waddle / hops k=2, perch looks k=4, crow caw k=3.
// One instanced pose batch for every species and drawing => 3 GL calls (colour + normal + shadow).
//
// opts: { center: Vector3 (pigeon flock home; default anchors.spots.flock), sparrows: Vector3 (sparrow spot;
//         default a point 2.4 m off the flock), pigeons = 7, sparrowCount = 6, crowsDay = 3, crowsDusk = 5,
//         groundCrows = 4, perches (default anchors.perches), perchDirs: [Vector3] (unit vector along each perch
//         for sideways hops; default none = turn on the spot), sheet: bool, sheetYaw, sheetSpecies }
// api:  { birds (read-only state), events (flee log [{i, sp, t, d, speed}]) }
import * as THREE from 'three';
import * as K from '../chars/kit.js';
import { depthMaterial } from '../materials/toon.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  defineSystem, createReaction, createPoseBatch, Ticker, STATE, STATE_NAMES, paint, mergePose,
  gridTime, clockIndex, cycleFrame, quantYaw, hash, clamp, lerp, TAU, GRID_HZ,
} from './core.js';

const V = (x, y, z) => [x, y, z];
// per-part outline flag (aFx = 1 -> FLAG_DEPTH_ONLY: silhouette line only, no crease / cream rim). r2: the cream rim +
// dark line on every 2-3 texel wing plate turned wings into stripes and made the sparrow cap / cheek a bright speck.
function soft(g) { g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1)); return g; }

// ------------------------------------------------------------------------------------------------ palettes
// [hi, mid, sh] sRGB. Shadow tones shift hue (violet / teal / wine), never toward black; nothing is pure black.
const PAL = {
  pigeon: {
    body: ['#D4D2E4', '#9C9CBC', '#6C6A94'], wing: ['#B2B0CA', '#7C7CA2', '#52507A'],
    neck: ['#A6DCBC', '#62A08E', '#46807A'], foot: ['#F4BCA4', '#D2887A', '#A8646E'], bar: ['#8A88A8', '#5C5A80', '#3A3858'],
  },
  sparrow: {
    // r3: cap + wing one band lighter (the near-black cap + cream cheek made a 'beetle eye' speck at 1x), cheek tinted
    // toward the body hi; flying drawings get a buff belly (flyBody) so the silhouette carries the read, not a speck
    body: ['#E6CC9E', '#BE9A6C', '#8E6E62'], wing: ['#BC8656', '#94603A', '#6E4838'],
    cap: ['#9A7A70', '#7E6062', '#5E4A52'], cheek: ['#E6D2AE', '#C8B08C', '#8E7E7E'], foot: ['#E4B48E', '#B0806A', '#6E4E52'],
    flyBody: ['#E4CCA6', '#C4A47C', '#9A7C66'],
  },
  crow: {
    body: ['#7A7898', '#46446A', '#2A2842'], wing: ['#6A6A8E', '#3A3A5E', '#24223C'],
    beak: ['#9A96A6', '#5E5A72', '#34324A'], foot: ['#7E7486', '#4E465C', '#2E2A3C'],
  },
};

// ------------------------------------------------------------------------------------------------ drawing parts
// All built facing +Z, feet at y = 0, in the species' own units, then scaled (pigeon 1.0 = 0.36 m incl. tail).
function hullBody(pal, secs, { pitch = 0, lift = 0.05, tail, tailUp = 0, tailPal } = {}) {
  const pts = [];
  for (const [z, y0, y1, w] of secs) for (const sx of [-1, 1]) for (const y of [y0, y1]) pts.push(V(sx * w, y, z));
  const out = [paint(K.xf(K.hull(pts), { rot: [-pitch, 0, 0], at: [0, lift, 0] }), pal)];
  if (tail) {
    const [z0, z1, w0, w1, y0, th] = tail;
    const tp = [V(-w0, y0, z0), V(w0, y0, z0), V(-w0, y0 + th, z0), V(w0, y0 + th, z0),
      V(-w1, y0 + tailUp - 0.01, z1), V(w1, y0 + tailUp - 0.01, z1), V(-w1, y0 + tailUp + th * 0.6, z1), V(w1, y0 + tailUp + th * 0.6, z1)];
    out.push(paint(K.xf(K.hull(tp), { rot: [-pitch, 0, 0], at: [0, lift, 0] }), tailPal || pal));
  }
  return out;
}
const box = (pal, w, h, d, at, rot = [0, 0, 0]) => paint(K.xf(K.box(w, h, d), { at, rot }), pal);
function legs(pal, h, sep, w = 0.05, z = 0) { return [-1, 1].map((sx) => box(pal, w, h, w, [sx * sep, h / 2, z])); }
function folded(pal, { pitch = 0, lift = 0.05, w = 0.072, front = 0.05, back = -0.17, top = 0.15, low = 0.06 } = {}) {
  return [-1, 1].map((sx) => paint(K.xf(K.hull([V(sx * 0.03, top, front), V(sx * w, top - 0.02, front - 0.01), V(sx * w * 0.97, low, front - 0.02),
    V(sx * 0.03, top - 0.02, back + 0.01), V(sx * w * 0.83, top - 0.05, back), V(sx * w * 0.83, low + 0.01, back + 0.05)]), { rot: [-pitch, 0, 0], at: [0, lift, 0] }), pal));
}
// open wing: a broad tapered paddle from the shoulder (root chord ~ body length / 2; long thin plates read as a
// cross at 10 texels). angle (deg) + = up. tipDrop bends the outer half down (a glide's gull wing / crow fingers).
function openWings(pal, angle, { span = 0.22, sweep = 0, root = 0.24, tip = 0.12, y = 0.15, z = -0.01, sx0 = 0.045, th = 0.045, tipDrop = 0, fingers = 0, fLen = 0.075 } = {}) {
  const out = [];
  for (const sx of [-1, 1]) {
    const r0 = root / 2;
    const plate = K.hull([V(0, 0, r0), V(0, 0, -r0), V(0, th, r0), V(0, th, -r0),
      V(sx * span * 0.6, 0, r0 * 0.75 - sweep * 0.5), V(sx * span * 0.6, th, r0 * 0.75 - sweep * 0.5),
      V(sx * span, -tipDrop, tip / 2 - sweep), V(sx * span, -tipDrop, -tip / 2 - sweep), V(sx * span, -tipDrop + th * 0.8, tip / 2 - sweep), V(sx * span, -tipDrop + th * 0.8, -tip / 2 - sweep)]);
    out.push(soft(paint(K.xf(plate, { rot: [0, 0, sx * angle], at: [sx * sx0, y, z] }), pal)));
    // fingered primaries: n separate slats past the tip, fanned back (gaps >= 1 texel at the species scale)
    for (let f = 0; f < fingers; f++) {
      const fz = tip / 2 - sweep - (f / Math.max(1, fingers - 1)) * tip * 1.1, fl = fLen * (1 - f * 0.18);
      const slat = K.xf(K.box(fl, th * 0.8, 0.032), { at: [sx * (span + fl / 2 - 0.01), -tipDrop + th * 0.4, fz], rot: [0, sx * f * 14, 0] });
      out.push(paint(K.xf(slat, { rot: [0, 0, sx * angle], at: [sx * sx0, y, z] }), pal));
    }
  }
  return out;
}
// mergePose without dropping aFx (core's mergePose keeps position / normal / colour / tones only)
const KEEP = ['position', 'normal', 'color', 'toneHi', 'toneSh', 'aFx'];
const scaled = (parts, s) => {
  const gs = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone();
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.aFx) g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    return g;
  });
  const g = mergeGeometries(gs, false); g.scale(s, s, s); return g;
};
// neck: a hull from a point INSIDE the (pitched, lifted) body hull to the head's base, so the head can never float
// free of the body whatever the body pitch (a separate neck box left a 1.5-texel gap on the pitched PECK body)
const DEG = Math.PI / 180;
function neck(pal, { pitch = 0, lift = 0.05 }, base, top, w = 0.07, wt = w) {
  const b = new THREE.Vector3(...base).applyEuler(new THREE.Euler(-pitch * DEG, 0, 0)); b.y += lift;
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(V(b.x + sx * w / 2, b.y + sy * w / 2, b.z + sz * w / 2));
    pts.push(V(top[0] + sx * wt / 2, top[1] + sy * wt / 2, top[2] + sz * wt / 2));
  }
  return paint(K.hull(pts), pal);
}

// ---- pigeon (rock dove): grey-violet, green neck, coral feet; 0.36 m incl. tail = 13 texels at vh 10
const PIG_SECS = [[0.11, 0.05, 0.15, 0.05], [0.04, 0.02, 0.17, 0.068], [-0.05, 0.03, 0.15, 0.062], [-0.12, 0.07, 0.12, 0.04]];
function pigeon() {
  const C = PAL.pigeon;
  const body = (o = {}) => hullBody(C.body, PIG_SECS, { tail: [-0.1, -0.24, 0.04, 0.055, 0.085, 0.03], tailPal: C.wing, ...o });
  const head = ([x, y, z], bo = {}) => [
    neck(C.neck, bo, [0, 0.1, 0.05], [x, y - 0.01, z - 0.015], 0.075, 0.07),
    box(C.body, 0.08, 0.075, 0.085, [x, y + 0.02, z]),
    box(C.foot, 0.035, 0.03, 0.05, [x, y + 0.012, z + 0.06]),
  ];
  const fw = (pitch = 0) => folded(C.wing, { pitch });
  const FB = { pitch: 4, lift: 0 };
  const fly = () => [...body(FB), ...head([0, 0.15, 0.15], FB)];
  const W = (a, o) => openWings(C.wing, a, { z: -0.035, ...o });
  const P = (pitch, o = {}) => ({ pitch, lift: 0.05, ...o });
  return {
    STAND: [...body(), ...fw(), ...head([0, 0.24, 0.12], P(0)), ...legs(C.foot, 0.06, 0.035)],
    BOB: [...body(P(6)), ...fw(6), ...head([0, 0.19, 0.18], P(6)), ...legs(C.foot, 0.06, 0.035)],      // waddle: head thrust forward
    PECK: [...body(P(22, { tailUp: 0.03 })), ...fw(22), ...head([0, 0.075, 0.16], P(22)), ...legs(C.foot, 0.06, 0.035)],
    ALERT: [...body(P(-14, { tailUp: 0.04 })), ...fw(-14), ...head([0, 0.33, 0.1], P(-14)), ...legs(C.foot, 0.075, 0.035)],
    UP: [...fly(), ...W(62, { span: 0.2, sweep: 0.04 })],
    MID: [...fly(), ...W(20, { span: 0.24, sweep: 0.02 })],                                    // dihedral: the top face shows
    DOWN: [...fly(), ...W(-40, { span: 0.2, sweep: 0.03 })],
    GLIDE: [...fly(), ...W(22, { span: 0.25, root: 0.26, tip: 0.14 })],                         // held V: soaring
    LAND: [...body(P(-35)), ...head([0, 0.29, 0.07], P(-35)), ...W(72, { span: 0.2, sweep: -0.03, z: -0.01 }), ...legs(C.foot, 0.07, 0.035)],
  };
}

// ---- sparrow: plump buff ball, dark cap + chestnut wing, cream cheek, cocked tail; 0.27 m = 10 texels (scale 0.85)
const SPA_SECS = [[0.1, 0.06, 0.16, 0.055], [0.03, 0.03, 0.19, 0.08], [-0.06, 0.05, 0.17, 0.07], [-0.11, 0.09, 0.14, 0.045]];
function sparrow() {
  const C = PAL.sparrow;
  const body = (o = {}, pal = C.body) => hullBody(pal, SPA_SECS, { tail: [-0.09, -0.21, 0.035, 0.05, 0.11, 0.035], tailPal: C.wing, ...o });
  const head = ([x, y, z], bo = {}, pal = C.body) => [
    neck(pal, bo, [0, 0.11, 0.04], [x, y - 0.02, z - 0.02], 0.09, 0.09),
    box(pal, 0.105, 0.1, 0.1, [x, y, z]),                    // buff head (an all-cream head box read as a white blob)
    soft(box(C.cheek, 0.112, 0.03, 0.05, [x, y - 0.02, z + 0.025])),    // cheek: a 1-texel band behind the bill line
    soft(box(C.cap, 0.109, 0.04, 0.1, [x, y + 0.035, z - 0.012])),     // cap: a top layer of the head, not a hat
    box(C.foot, 0.05, 0.04, 0.05, [x, y - 0.005, z + 0.07]),
  ];
  const fw = (pitch = 0) => folded(C.wing, { pitch, w: 0.085, top: 0.17, low: 0.07, back: -0.15 }).map(soft);
  const FB = { pitch: 2, lift: 0 };
  const fly = () => [...body(FB, C.flyBody), ...head([0, 0.16, 0.12], FB, C.flyBody)];
  const W = (a, o) => openWings(C.wing, a, { root: 0.2, tip: 0.1, y: 0.15, sx0: 0.06, th: 0.045, z: -0.03, ...o });
  const P = (pitch, o = {}) => ({ pitch, lift: 0.05, ...o });
  return {
    STAND: [...body(), ...fw(), ...head([0, 0.22, 0.11], P(0)), ...legs(C.foot, 0.05, 0.035, 0.05)],
    PECK: [...body(P(26, { tailUp: 0.06 })), ...fw(26), ...head([0, 0.09, 0.15], P(26)), ...legs(C.foot, 0.05, 0.035, 0.05)],
    HOP: [...body(P(8, { lift: 0.03, tailUp: 0.04 })), ...fw(8), ...head([0, 0.2, 0.13], P(8, { lift: 0.03 }))],   // crouched, feet tucked
    ALERT: [...body(P(-20, { tailUp: 0.09 })), ...fw(-20), ...head([0, 0.29, 0.08], P(-20)), ...legs(C.foot, 0.06, 0.035, 0.05)],
    UP: [...fly(), ...W(60, { span: 0.2 })],
    DOWN: [...fly(), ...W(-42, { span: 0.19 })],
    FOLD: [...hullBody(C.flyBody, SPA_SECS, { pitch: 0, lift: 0.0, tail: [-0.09, -0.19, 0.03, 0.035, 0.11, 0.03], tailPal: C.wing }), ...fw(0), ...head([0, 0.16, 0.12], FB, C.flyBody)],  // bounding: wings shut
    LAND: [...body(P(-32)), ...head([0, 0.26, 0.06], P(-32)), ...W(70, { span: 0.18, sweep: -0.03, z: -0.01 }), ...legs(C.foot, 0.06, 0.035, 0.05)],
  };
}

// ---- crow: blue-violet black, heavy beak, wedge tail; 0.46 m = 17 texels (scale 1.25 of the parts)
const CRO_SECS = [[0.12, 0.06, 0.16, 0.05], [0.04, 0.03, 0.18, 0.07], [-0.06, 0.04, 0.16, 0.064], [-0.13, 0.08, 0.13, 0.04]];
function crow() {
  const C = PAL.crow;
  const body = (o = {}) => hullBody(C.body, CRO_SECS, { tail: [-0.1, -0.27, 0.035, 0.065, 0.08, 0.03], tailPal: C.wing, ...o });
  const head = ([x, y, z], bo = {}, { open = 0 } = {}) => {
    const out = [
      neck(C.body, bo, [0, 0.1, 0.06], [x, y - 0.01, z - 0.02], 0.075, 0.07),
      box(C.body, 0.08, 0.075, 0.09, [x, y + 0.02, z]),
    ];
    if (open) {   // caw: two beak plates opened (>= 2 texels gap at the tip)
      out.push(box(C.beak, 0.04, 0.022, 0.09, [x, y + 0.04, z + 0.075], [-open, 0, 0]));
      out.push(box(C.beak, 0.036, 0.02, 0.08, [x, y + 0.005, z + 0.07], [open, 0, 0]));
    } else out.push(box(C.beak, 0.042, 0.038, 0.1, [x, y + 0.02, z + 0.08]));
    return out;
  };
  const fw = (pitch = 0) => folded(C.wing, { pitch, w: 0.074, top: 0.16, back: -0.2 });
  const FB = { pitch: 3, lift: 0 };
  const fly = () => [...body(FB), ...head([0, 0.15, 0.16], FB)];
  const W = (a, o) => openWings(C.wing, a, { root: 0.25, tip: 0.14, sx0: 0.05, z: -0.04, ...o });
  const L = (h = 0.07) => legs(C.foot, h, 0.035, 0.04);
  const P = (pitch, o = {}) => ({ pitch, lift: 0.05, ...o });
  return {
    STAND: [...body(), ...fw(), ...head([0, 0.24, 0.13], P(0)), ...L()],
    PECK: [...body(P(24, { tailUp: 0.03 })), ...fw(24), ...head([0, 0.075, 0.17], P(24)), ...L()],
    STEP: [...body(P(8)), ...fw(8), ...head([0, 0.22, 0.16], P(8)), box(C.foot, 0.04, 0.07, 0.04, [-0.035, 0.035, 0.05]), box(C.foot, 0.04, 0.06, 0.04, [0.035, 0.03, -0.05])],
    ALERT: [...body(P(-18, { tailUp: 0.02 })), ...fw(-18), ...head([0, 0.31, 0.11], P(-18)), ...L(0.08)],
    CAW: [...body(P(10, { tailUp: 0.04 })), ...fw(10), ...head([0, 0.25, 0.17], P(10), { open: 26 }), ...L()],
    UP: [...fly(), ...W(58, { span: 0.24, sweep: 0.03 })],
    MID: [...fly(), ...W(18, { span: 0.28, tip: 0.16 })],
    DOWN: [...fly(), ...W(-34, { span: 0.25, sweep: 0.02 })],
    // r3: gull wing (raised arm, drooped hand): a flat 14° glide read as a plank / plane in profile
    GLIDE: [...fly(), ...W(24, { span: 0.3, root: 0.27, tip: 0.17, tipDrop: 0.085 })],
    LAND: [...body(P(-38)), ...head([0, 0.29, 0.07], P(-38)), ...W(70, { span: 0.24, sweep: -0.03, z: -0.01 }), ...L(0.08)],
  };
}

const SCALE = { pigeon: 1.0, sparrow: 0.85, crow: 1.15 };   // sparrow 0.85 = 10 texels: 0.55 (6) read as specks
function buildPoses() {
  const geos = [], index = {};
  for (const [sp, fn] of [['pigeon', pigeon], ['sparrow', sparrow], ['crow', crow]]) {
    index[sp] = {};
    for (const [name, parts] of Object.entries(fn())) { index[sp][name] = geos.length; geos.push(scaled(parts, SCALE[sp])); }
  }
  return { geos, index };
}

// ------------------------------------------------------------------------------------------------ species tuning
// Reaction radii are effective distances (d - approach * lookahead); see docs/AMBIENT.md §5 (game speed).
const SPEC = {
  pigeon: {
    reaction: { alertR: 3.6, fleeR: 2.3, calmR: 4.8, calmTime: 1.4, fleeTime: 0.8, awayMin: 2.4, returnTime: 1.8 },
    // speed = the FLEE burst; cruise = circling (AWAY): <= 9 texels per 15 Hz tick so the body is carried, not hopped
    fly: { speed: 5.2, cruise: 3.7, alt: [1.8, 2.5], rad: [2.0, 2.8], climb: 4.2, keep: 2.0, flapK: 2, glide: true, flap: ['UP', 'MID', 'DOWN', 'MID'], glidePose: 'GLIDE' },
    contagion: 1.8,
  },
  sparrow: {
    // r3: lookahead 0.1 + stillScale 1.8: a game-speed runner still flushes them 0.4 s ahead (fleeR 2.7), but the
    // stage's stop 4 m away gives ALERT on the approach and a settle while he stands (no flush every loop)
    reaction: { alertR: 4.2, fleeR: 2.7, calmR: 5.2, calmTime: 1.6, fleeTime: 0.6, awayMin: 2.0, returnTime: 1.4, alertHold: 0.4, lookahead: 0.1, stillScale: 1.8 },
    fly: { speed: 5.8, cruise: 3.8, alt: [1.9, 2.4], rad: [1.5, 2.1], climb: 3.6, keep: 1.9, flapK: 2, glide: false, flap: ['UP', 'DOWN', 'UP', 'DOWN', 'FOLD', 'FOLD'], bound: 0.06 },
    contagion: 1.4,
  },
  crow: {
    reaction: { alertR: 3.2, fleeR: 2.0, calmR: 5.0, calmTime: 1.5, fleeTime: 1.0, awayMin: 2.4, returnTime: 2.2, stillScale: 1.6 },
    fly: { speed: 4.6, cruise: 3.6, alt: [2.8, 3.4], rad: [2.4, 3.0], climb: 3.6, keep: 2.2, flapK: 3, glide: true, flap: ['UP', 'MID', 'DOWN', 'MID'], glidePose: 'GLIDE' },
    contagion: 2.4,
  },
};

const sceneDay = (name) => name === 'noon' || name === 'morning' || name === 'day';
const sceneDusk = (name) => name === 'golden' || name === 'dusk';

export default defineSystem({
  name: 'birds', owner: 'birds', budget: { glCalls: 3 },
  create(ctx, opts = {}) {
    const { engine, actors, anchors, heightAt } = ctx;
    const seed = ctx.seed;
    const groundY = (x, z) => heightAt(x, z) ?? 0;
    const camYaw = engine.camera.yaw ?? Math.PI / 4;
    const scrR = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const scrF = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));

    const flockC = (opts.center || anchors.spots?.flock || new THREE.Vector3()).clone();
    const sparC = opts.sparrows ? opts.sparrows.clone() : flockC.clone().addScaledVector(scrR, 2.6).addScaledVector(scrF, -2.0);
    const perches = (opts.perches || anchors.perches || []).map((p) => p.clone());
    const perchDirs = opts.perchDirs || [];
    const perchSlots = opts.perchSlots || [];   // per perch: allowed hop slots (multiples of 0.13 m along perchDir)

    // ---- poses (one batch for all species)
    const { geos, index: PI } = buildPoses();
    const MAXN = (opts.pigeons ?? 7) + (opts.sparrowCount ?? 6) + (opts.crowsDusk ?? 5) + (opts.groundCrows ?? 4) + 2;
    const batch = createPoseBatch(engine, {
      poses: geos, max: Math.max(MAXN, 12), name: 'ambient-birds', parent: ctx.root,
      material: {   // re-states the batch's pose collapse + the per-part outline flag
        vertexHead: 'attribute float aPose; attribute float iPose; attribute float aFx; varying float vFx;',
        vertex: 'if (abs(aPose - iPose) > 0.5) transformed = vec3(0.0); vFx = aFx;',
        fragmentHead: 'varying float vFx;',
        outlineFlag: '(vFx > 0.5 ? FLAG_DEPTH_ONLY : FLAG_FULL)',
      },
    });
    // per-instance shadow mask (0 extra calls): a bird high in the air casts no shadow. A crow's shadow from 3 m up
    // landed on the ruined wall's vertical face as a 40x40-texel smear. Low birds (takeoff, the last metre of a
    // landing) keep theirs: the shadows still converge onto the dirt. Own depth material = core's + the mask.
    // CONTRACT-REQUEST: ambient-core: a `shadowMask` option on createPoseBatch would make this generic.
    const iNoSh = new THREE.InstancedBufferAttribute(new Float32Array(batch.max), 1);
    iNoSh.setUsage(THREE.DynamicDrawUsage);
    batch.mesh.geometry.setAttribute('iNoShadow', iNoSh);
    batch.mesh.customDepthMaterial.dispose();
    batch.mesh.customDepthMaterial = depthMaterial(engine, {
      vertexHead: 'attribute float aPose; attribute float iPose; attribute float iNoShadow;',
      vertex: 'if (abs(aPose - iPose) > 0.5 || iNoShadow > 0.5) transformed = vec3(0.0);',
    });
    const SHADOW_MAX_H = 1.2;   // m above the group's ground
    // optional gameplay frame ({ target, halfW, halfH, pitch }): orbits are kept inside it
    const frame = opts.frame || null;

    // ---- the cast: groups (flocks) of birds with ground homes or perch slots
    const birds = [];
    const groups = [];
    function homesAround(c, n, spread, minD, salt) {
      const r = ctx.rng(salt), out = [];
      for (let tries = 0; out.length < n && tries < 4000; tries++) {
        const a = r() * TAU, d = Math.sqrt(r()) * spread;
        const p = new THREE.Vector3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d);
        if (opts.groundOk && !opts.groundOk(p.x, p.z)) continue;   // keep ground birds off grass (blades cross the body)
        if (out.every((h) => h.distanceTo(p) > minD)) out.push(p);
      }
      return out;
    }
    function addGroup(sp, kind, center, homes, when, extra = {}) {
      const g = { id: groups.length, sp, kind, center: center.clone(), gy: groundY(center.x, center.z), when, dir: hash(groups.length, 3, seed) < 0.5 ? 1 : -1, ...extra };
      groups.push(g);
      homes.forEach((h, k) => {
        const i = birds.length;
        const F = SPEC[sp].fly;
        birds.push({
          i, sp, g, kind, home: h.clone(), gy: kind === 'perch' ? h.y : groundY(h.x, h.z), perchDir: h.perchDir || null, perchSlots: h.perchSlots || null, when,
          R: null, rec: null, p: new THREE.Vector3(), v: new THREE.Vector3(), cur: new THREE.Vector3(), from: new THREE.Vector3(),
          to: new THREE.Vector3(), v0: new THREE.Vector3(), pending: -1, active: false, yaw: 0,
          alt: lerp(F.alt[0], F.alt[1], hash(i, 11, seed)), rad: lerp(F.rad[0], F.rad[1], hash(i, 12, seed)),
          ph: Math.floor(hash(i, 9, seed) * 24),
        });
      });
      const mine = birds.filter((b) => b.g === g);
      g.radMax = Math.max(...mine.map((b) => b.rad)); g.altMax = Math.max(...mine.map((b) => b.alt));
      g.C = new THREE.Vector3(); g.Cn = -1;
      return g;
    }
    // minD 0.5 (was 0.4): descents toward neighbouring homes crossed into merged two-bird clumps
    addGroup('pigeon', 'ground', flockC, homesAround(flockC, opts.pigeons ?? 7, 1.15, 0.5, 1), 'day');
    addGroup('sparrow', 'ground', sparC, homesAround(sparC, opts.sparrowCount ?? 6, 0.85, 0.38, 2), 'day');
    // perch slots: each crow owns one perch (crowsDay take the first ones of a seeded order; dusk fills them all)
    const order = perches.map((p, k) => k).sort((a, b) => hash(a, 21, seed) - hash(b, 21, seed));
    const slot = (k) => { const q = order[k % perches.length], p = perches[q].clone(); p.perchDir = perchDirs[q] || null; p.perchSlots = perchSlots[q] || null; return p; };
    const nDay = Math.min(opts.crowsDay ?? 3, perches.length), nDusk = Math.min(opts.crowsDusk ?? 5, perches.length);
    if (perches.length) {
      // crows circle in front of (screen-below) their perches: perches sit at the top of a gameplay frame, and an orbit
      // right above them leaves the screen
      const pc = perches.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / perches.length).setY(0).addScaledVector(scrF, -3.6);
      addGroup('crow', 'perch', pc, Array.from({ length: nDay }, (_, k) => slot(k)), 'both');
      if (nDusk > nDay) addGroup('crow', 'perch', pc, Array.from({ length: nDusk - nDay }, (_, k) => slot(nDay + k)), 'dusk');
    }
    addGroup('crow', 'ground', flockC, homesAround(flockC, opts.groundCrows ?? 4, 1.3, 0.55, 3), 'dusk');
    for (const b of birds) {
      // per-bird stagger: calm 0-2 ticks, landing 1-3 ticks longer, so a flock lifts off / touches down in a ripple
      // (one shared returnTime crossed the descent curves into merged clumps)
      const RO = { ...SPEC[b.sp].reaction, ...(opts.reaction?.[b.sp] || {}) };
      RO.calmTime += Math.floor(hash(b.i, 42, seed) * 3) / GRID_HZ;
      RO.returnTime += (1 + Math.floor(hash(b.i, 41, seed) * 3)) / GRID_HZ;
      b.R = createReaction(RO);
      b.rec = b.R.init(seed + b.i);
      b.P = PI[b.sp];
    }

    // ---- idle (pure f(t)) -----------------------------------------------------------------------------------------
    // ground birds: a 12-beat period (k = 2 beats, 1.6 s) per bird: some periods start with a move (pigeon: 4-beat
    // waddle with head bobs; sparrow: one or two 2-texel hops; crow: 4-beat stride walk), then pecks in a seeded
    // pattern. Perch crows: looks on k = 4 (3.75 fps), a caw now and then, sideways hops along the wall.
    const PERIOD = 12;
    const moveP = (b, p) => p % 5 === 0 || hash(b.i, p, seed) < (b.sp === 'sparrow' ? 0.7 : 0.45);
    const offAt = (b, p) => {
      if (!moveP(b, p)) return null;
      const a = hash(b.i, p, seed + 1) * TAU, d = (b.sp === 'sparrow' ? 0.08 : 0.12) + (b.sp === 'sparrow' ? 0.14 : 0.24) * hash(b.i, p, seed + 2);
      return [Math.cos(a) * d, Math.sin(a) * d];
    };
    const lastMove = (b, p) => { while (!moveP(b, p)) p--; return p; };
    const PECKS = [[6, 7, 9, 10], [3, 4, 8], [5, 6, 7, 10, 11], [2, 3, 5, 6, 8, 9]];
    function groundIdle(b, t, out) {
      const P = b.P;
      const beat = clockIndex(t, 2, b.ph);
      const p = Math.floor(beat / PERIOD), k = beat - p * PERIOD;
      const h = lastMove(b, p), h0 = lastMove(b, h - 1);
      const o1 = offAt(b, h), o0 = offAt(b, h0);
      const moving = h === p && k < 4;
      let f = 1, lift = 0, pose = P.STAND;
      if (moving) {
        if (b.sp === 'sparrow') { f = k < 2 ? 0.5 : 1; lift = k % 2 === 0 ? 0.056 : 0; pose = k % 2 === 0 ? P.HOP : P.STAND; }   // two 2-texel hops
        else if (b.sp === 'pigeon') { f = (k + 1) / 4; pose = k % 2 === 0 ? P.BOB : P.STAND; }
        else { f = (k + 1) / 4; pose = k % 2 === 0 ? P.STEP : P.STAND; }
      }
      const ox = lerp(o0[0], o1[0], f), oz = lerp(o0[1], o1[1], f);
      out.pos.set(b.home.x + ox, 0, b.home.z + oz);
      out.pos.y = b.gy + lift;   // home ground height (cached: offsets stay within 0.4 m of home)
      const moveYaw = Math.atan2(o1[0] - o0[0], o1[1] - o0[1]);
      // after the move: look around in 45° stops on a few beats (a different head direction = a new drawing)
      const look = !moving && k >= 4 && hash(b.i, p, seed + 6) < 0.5 ? (k >= 8 ? 1 : 0) * (hash(b.i, p, seed + 8) < 0.5 ? -1 : 1) * (TAU / 8) : 0;
      out.yaw = quantYaw(moveYaw + look);
      if (!moving) {
        const pat = PECKS[Math.floor(hash(b.i, p, seed + 5) * PECKS.length)];
        if (pat.includes(k) && !look) pose = P.PECK;
      }
      out.pose = pose;
      return out;
    }
    function perchIdle(b, t, out) {
      const P = b.P;
      const beat = clockIndex(t, 4, b.ph);                  // 3.75 fps beats
      const seg = Math.floor(beat / 6), k = beat - seg * 6;
      // sideways hop along the perch: a slot offset in {-1, 0, 1} x 0.13 m, the hop drawn as 1 beat 2 texels up
      // slots are clamped to the anchor's valid span (opts.perchSlots: a hop must never leave the stone)
      const SL = b.perchSlots || [-1, 0, 1];
      const so = (s) => (b.perchDir ? SL[Math.floor(hash(b.i, s, seed + 30) * SL.length)] : 0);
      const o = so(seg), oPrev = so(seg - 1);
      const hopping = k === 0 && o !== oPrev;
      const off = (hopping ? (o + oPrev) / 2 : o) * 0.13;
      out.pos.copy(b.home);
      if (b.perchDir) out.pos.addScaledVector(b.perchDir, off);
      out.pos.y = b.home.y + (hopping ? 0.056 : 0);
      // faces: PROFILE (screen-left / right) +- 45°: the profile shows the beak and the wedge tail; the front view
      // (a 5x9 dark box with neither) only as a brief look now and then. After a hop it faces the hop direction.
      const hd = b.perchDir ? b.perchDir.x * scrR.x + b.perchDir.z * scrR.z : 0;
      let side = hash(b.i, Math.floor(beat / 12), seed + 34) < 0.5 ? 1 : -1;
      if (o !== oPrev && hd) side = Math.sign((o - oPrev) * hd);
      const r = hash(b.i, Math.floor(beat / 3), seed + 31);
      const turn = r < 0.5 ? 0 : r < 0.76 ? 1 : r < 0.94 ? -1 : 2;     // 1 = three-quarter toward camera, 2 = front
      const a = turn * (TAU / 8);
      out.yaw = quantYaw(Math.atan2(scrR.x * side * Math.cos(a) - scrF.x * Math.sin(a), scrR.z * side * Math.cos(a) - scrF.z * Math.sin(a)));
      // caw: 2 beats on a k = 3 clock now and then (beak open, head forward)
      const cb = clockIndex(t, 3, b.ph), cs = Math.floor(cb / 14), ck = cb - cs * 14;
      const caw = hash(b.i, cs, seed + 32) < 0.45 && (ck === 3 || ck === 5);
      out.pose = hopping ? P.STAND : caw ? P.CAW : (hash(b.i, beat, seed + 33) < 0.12 ? P.PECK : P.STAND);
      return out;
    }
    const idleAt = (b, t, out) => (b.kind === 'perch' ? perchIdle(b, t, out) : groundIdle(b, t, out));

    // ---- flight: boids-lite on the replay ticker ---------------------------------------------------------------
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), des = new THREE.Vector3();
    const SINP = Math.sin(opts.pitch ?? Math.PI / 6), COSP = Math.cos(opts.pitch ?? Math.PI / 6);
    function clampFrame(g, C) {
      // keep the whole orbit (centre +- radius, at its altitude) inside the gameplay frame, 0.6 m margin
      if (!frame) return;
      const T = frame.target, R = g.radMax, m = 0.6;
      const sx = (C.x - T.x) * scrR.x + (C.z - T.z) * scrR.z;
      const sy = ((C.x - T.x) * scrF.x + (C.z - T.z) * scrF.z) * SINP + (g.gy + g.altMax - (T.y ?? 0)) * COSP;
      const sxC = clamp(sx, -frame.halfW + R + m, frame.halfW - R - m);
      const syC = clamp(sy, -frame.halfH + R * SINP + m, frame.halfH - R * SINP - m);
      C.addScaledVector(scrR, sxC - sx).addScaledVector(scrF, (syC - sy) / SINP);
    }
    function orbitCenter(b, snap, n, dt) {
      // orbit above the group's home, pushed 1.4 m sideways from the threat's path (latched at the flee), then RE-CENTRED
      // every tick so its near edge stays >= `keep` m from the nearest actor (r2: sparrows circled at waist height
      // around a walker who stopped next to their orbit = mobbing), kept in the frame, slewed <= 4 m/s (no jumps)
      const g = b.g, F = SPEC[g.sp].fly;
      if (g.Cn === n) return g.C;
      const C = tmpA.set(g.center.x + g.ox * 1.4, g.gy, g.center.z + g.oz * 1.4);
      if (g.far) C.addScaledVector(scrF, 14);
      const h = snap.nearest(C.x, C.z);
      const need = g.radMax + F.keep;
      if (h && h.d < need) {
        const ax = h.d > 0.05 ? h.ax : g.ox, az = h.d > 0.05 ? h.az : g.oz;
        C.set(h.item.x + ax * need, g.gy, h.item.z + az * need);
      }
      if (!g.far) clampFrame(g, C);
      if (g.Cn < 0 || n - g.Cn > 1) g.C.copy(C);
      else { const dx = C.x - g.C.x, dz = C.z - g.C.z, l = Math.hypot(dx, dz), mx = (g.far ? 8 : 4) * dt; const k = l > mx ? mx / l : 1; g.C.x += dx * k; g.C.z += dz * k; }
      g.C.y = g.gy; g.Cn = n;
      return g.C;
    }
    function flyStep(b, t, dt, snap, tickN) {
      const F = SPEC[b.sp].fly, rec = b.rec;
      const spd = rec.s === STATE.FLEE ? F.speed : F.cruise;
      const C = orbitCenter(b, snap, tickN, dt);
      const rx = b.p.x - C.x, rz = b.p.z - C.z, r = Math.max(0.05, Math.hypot(rx, rz));
      const dir = b.g.dir;
      const tx = -rz / r * dir, tz = rx / r * dir;
      const pull = (b.rad - r) * 1.3;
      des.set(tx * spd + (rx / r) * pull, 0, tz * spd + (rz / r) * pull);
      const hs = Math.hypot(des.x, des.z); if (hs > spd) des.multiplyScalar(spd / hs);
      const bob = F.bound ? Math.sin((clockIndex(t, 2, b.ph) % 6) / 6 * TAU) * F.bound * 10 : 0;
      des.y = (C.y + b.alt - b.p.y) * 1.6 + bob;
      if (rec.s === STATE.FLEE) {
        // takeoff: steep climb away from the threat, blending into the orbit
        const u = clamp(rec.age(t) / rec_fleeTime(b));
        const w = u * u;
        tmpB.set(rec.ax * F.speed * 0.7, F.climb * (1 - u * 0.6), rec.az * F.speed * 0.7);
        des.lerpVectors(tmpB, des, w);
      }
      // separation + alignment with airborne flock mates
      let ax = 0, az = 0, ay = 0, n = 0, sx = 0, sy = 0, sz = 0;
      for (const o of birds) {
        if (o === b || o.g !== b.g || !o.active || (o.rec.s !== STATE.FLEE && o.rec.s !== STATE.AWAY)) continue;
        const dx = b.p.x - o.p.x, dy = b.p.y - o.p.y, dz = b.p.z - o.p.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 2.25) { ax += o.v.x; ay += o.v.y; az += o.v.z; n++; }
        if (d2 < 0.5 && d2 > 1e-6) { const k = 0.35 / d2; sx += dx * k; sy += dy * k; sz += dz * k; }
      }
      if (n) { des.x = lerp(des.x, ax / n, 0.15); des.y = lerp(des.y, ay / n, 0.1); des.z = lerp(des.z, az / n, 0.15); }
      des.x += sx; des.y += sy * 0.5; des.z += sz;
      // repulsion from the nearest actor: within 3 m (horizontal) and below head + 1.6 m, push out and up
      const h = snap.nearest(b.p.x, b.p.z, 3.0);
      if (h && b.p.y < h.item.y + (h.item.height ?? 1.4) + 1.6) {
        const k = (3.0 - h.d) / 3.0;
        des.x += h.ax * k * F.speed * 1.4; des.z += h.az * k * F.speed * 1.4; des.y += k * 2.4;
      }
      const steer = Math.min(1, (rec.s === STATE.FLEE ? 4.0 : 2.6) * dt);
      b.v.x += (des.x - b.v.x) * steer; b.v.y += (des.y - b.v.y) * steer; b.v.z += (des.z - b.v.z) * steer;
      const sp = b.v.length(), max = F.speed * 1.35; if (sp > max) b.v.multiplyScalar(max / sp);
      b.p.addScaledVector(b.v, dt);
      const floor = b.g.gy + 0.35; if (b.p.y < floor) { b.p.y = floor; if (b.v.y < 0) b.v.y = 0; }
    }
    const rec_fleeTime = (b) => b.R.opts.fleeTime;

    // landing spot / return curve (cubic Hermite from the latched air state to the idle spot at the end time)
    const h00 = (u) => 2 * u * u * u - 3 * u * u + 1, h10 = (u) => u * u * u - 2 * u * u + u, h01 = (u) => -2 * u * u * u + 3 * u * u, h11 = (u) => u * u * u - u * u;
    function returnAt(b, u, out) {
      const T = b.R.opts.returnTime;
      const dx = b.to.x - b.from.x, dz = b.to.z - b.from.z, dl = Math.max(0.01, Math.hypot(dx, dz));
      const v1x = dx / dl * 1.2, v1y = -1.2, v1z = dz / dl * 1.2;
      const k0 = T * 0.55;
      out.set(
        h00(u) * b.from.x + h10(u) * k0 * b.v0.x + h01(u) * b.to.x + h11(u) * T * v1x,
        h00(u) * b.from.y + h10(u) * k0 * b.v0.y + h01(u) * b.to.y + h11(u) * T * v1y,
        h00(u) * b.from.z + h10(u) * k0 * b.v0.z + h01(u) * b.to.z + h11(u) * T * v1z);
      const fl = Math.min(b.to.y, b.g.gy);
      if (out.y < fl) out.y = fl;
      return out;
    }

    // ---- reaction simulation (15 Hz replay ticker) ----------------------------------------------------------
    const events = [];
    const tmp = { pos: new THREE.Vector3(), yaw: 0, pose: 0 };
    function startFlee(b, t, hit, s0) {
      const rec = b.rec, F = SPEC[b.sp].fly;
      const sp = (hash(b.i, rec.changes, seed + 7) - 0.5) * 1.1;
      const c = Math.cos(sp), s = Math.sin(sp);
      const ax = rec.ax * c - rec.az * s, az = rec.ax * s + rec.az * c;
      rec.ax = ax; rec.az = az;
      if (!b.g.fleeing) {
        b.g.ax = ax; b.g.az = az; b.g.fleeing = true;
        // orbit offset: the part of the away vector perpendicular to the threat's velocity (a runner keeps going: an
        // orbit straight ahead of it converges with it), then no screen-up component (toward the camera instead)
        const it = hit?.item, vs = it ? Math.hypot(it.vx, it.vz) : 0;
        let ox = ax, oz = az;
        if (vs > 0.5) {
          const vx = it.vx / vs, vz = it.vz / vs, d = ox * vx + oz * vz;
          ox -= d * vx; oz -= d * vz;
          if (Math.hypot(ox, oz) < 0.3) { ox = -vz; oz = vx; }
        }
        // keep the bird's own side of the threat's path (r2 forced every orbit screen-down, which flipped half the
        // flushes ACROSS the runner's face); only a steep screen-up offset is flattened (the frame clamp does the rest)
        const up = ox * scrF.x + oz * scrF.z, ol0 = Math.hypot(ox, oz) || 1;
        if (up / ol0 > 0.45) { const c = up - 0.45 * ol0; ox -= c * scrF.x; oz -= c * scrF.z; }
        const ol = Math.hypot(ox, oz) || 1;
        b.g.ox = ox / ol; b.g.oz = oz / ol;
      }
      // takeoff heads mostly sideways too (with the threat's push): straight "away" from a runner = along its path
      const tx = ax * 0.4 + b.g.ox, tz = az * 0.4 + b.g.oz, tl = Math.hypot(tx, tz) || 1;
      rec.ax = tx / tl; rec.az = tz / tl;
      if (s0 === STATE.RETURN || s0 === STATE.AWAY) { b.p.copy(b.cur); }   // keep the air state (v)
      else { b.p.copy(b.cur); b.v.set(rec.ax * F.speed * 0.5, F.climb, rec.az * F.speed * 0.5); }
      if (events.length < 96) events.push({ i: b.i, sp: b.sp, t: +t.toFixed(3), d: +(hit?.d ?? -1).toFixed(2), speed: +(hit?.speed ?? 0).toFixed(2) });
    }
    // a perch crow whose perch is still occupied by a walker (the stage's 3 s rest stop is right by the wall) settles on
    // the nearest FREE, calm perch once it has been away for awayMin, instead of circling for 5+ s (r2: still circling
    // at 11 s, pulling the eye). Homes are sim state: reset() restores them (replay stays a pure f(t)).
    function rehome(b, t, snap) {
      const O = b.R.opts;
      const h0 = snap.nearest(b.home.x, b.home.z, O.calmR);
      if (!h0 || b.rec.age(t) < 1.0) return;
      let best = null, bd = Infinity;
      for (let q = 0; q < perches.length; q++) {
        const p = perches[q];
        if (birds.some((o) => o !== b && o.active && o.kind === 'perch' && o.home.distanceTo(p) < 0.2)) continue;
        if (snap.nearest(p.x, p.z, O.calmR + 1.0)) continue;
        const d = Math.hypot(p.x - b.p.x, p.z - b.p.z);
        if (d < bd) { bd = d; best = q; }
      }
      if (best === null) {
        // no free calm perch: the group leaves the frame (circles far off beyond the top edge, the 'distant trees')
        // until the perches are calm, then the Hermite descent brings it back in
        if (b.rec.age(t) >= 1.0 && !b.g.far) { b.g.far = true; if (trace && trace.tr.length < 400) trace.tr.push(`g${b.g.id}:far@${+t.toFixed(2)}`); }
        return;
      }
      b.home.copy(perches[best]); b.gy = b.home.y; b.perchDir = perchDirs[best] || null; b.perchSlots = perchSlots[best] || null;
      if (trace && trace.tr.length < 400) trace.tr.push(`${b.sp[0]}${b.i}:rehome${best}@${+t.toFixed(2)}`);
    }
    const trace = opts.trace ? { tr: [], min: {} } : null;
    function reset() {
      for (const b of birds) {
        b.rec = b.R.init(seed + b.i); b.pending = -1; b.v.set(0, 0, 0);
        if (b.home0) { b.home.copy(b.home0.p); b.gy = b.home0.gy; b.perchDir = b.home0.dir; b.perchSlots = b.home0.slots; }
        else b.home0 = { p: b.home.clone(), gy: b.gy, dir: b.perchDir, slots: b.perchSlots };
      }
      for (const g of groups) { g.fleeing = false; g.far = false; g.ax = 1; g.az = 0; g.ox = 0; g.oz = 0; g.Cn = -1; }
      events.length = 0;
      if (trace) { trace.tr.length = 0; trace.min = {}; }
    }
    reset();
    const ticker = new Ticker({
      hz: GRID_HZ, reset,
      tick(t, dt, n) {
        const snap = actors.snapshot(t);
        // 1) air physics for the birds that were airborne after the last tick
        for (const b of birds) if (b.active && (b.rec.s === STATE.FLEE || b.rec.s === STATE.AWAY)) flyStep(b, t, dt, snap, n);
        // 2) drawn position at t (before the reaction steps: latch transitions from here)
        const fled = [];
        for (const b of birds) {
          if (!b.active) continue;
          const s0 = b.rec.s;
          posAt(b, t, tmp);
          b.cur.copy(tmp.pos);
          // AWAY: calm is judged at the HOME (the landing spot), not at the bird in the air: an orbit kept away from a
          // walker standing by the home must not count as calm (it would land on him and re-flush)
          if (s0 === STATE.AWAY && b.kind === 'perch') rehome(b, t, snap);
          const hit = s0 === STATE.AWAY ? snap.nearest(b.home.x, b.home.z, b.R.range) : snap.nearest(b.cur.x, b.cur.z, b.R.range);
          if (b.pending >= 0 && n >= b.pending && (s0 === STATE.IDLE || s0 === STATE.ALERT)) {
            b.pending = -1;
            b.R.force(b.rec, STATE.FLEE, t);
          } else b.R.step(b.rec, t, hit, dt);
          const s1 = b.rec.s;
          if (trace && s1 !== s0 && trace.tr.length < 400) trace.tr.push(`${b.sp[0]}${b.i}:${STATE_NAMES[s1].slice(0, 2)}@${+t.toFixed(2)}`);
          if (s1 === STATE.FLEE && s0 !== STATE.FLEE) {
            if (s0 === STATE.RETURN) { // re-flee mid-air: velocity from the return curve
              const u0 = clamp((t - dt - b.retT0) / b.R.opts.returnTime), u1 = clamp((t - b.retT0) / b.R.opts.returnTime);
              returnAt(b, u0, tmpB); returnAt(b, u1, tmpA); b.v.subVectors(tmpA, tmpB).divideScalar(dt);
            }
            b.pending = -1;
            startFlee(b, t, hit, s0);
            fled.push(b);
          }
          if (s1 === STATE.RETURN && s0 !== STATE.RETURN) {
            b.from.copy(b.p); b.v0.copy(b.v); b.retT0 = t;
            idleAt(b, t + b.R.opts.returnTime, tmp); b.to.copy(tmp.pos);
          }
        }
        // 3) flock contagion: flock mates within `contagion` m follow 1-3 ticks later (same away direction)
        for (const f of fled) for (const o of birds) {
          if (o === f || !o.active || o.g !== f.g || o.pending >= 0 || (o.rec.s !== STATE.IDLE && o.rec.s !== STATE.ALERT)) continue;
          if (o.cur.distanceTo(f.cur) < SPEC[o.sp].contagion) { o.pending = n + 1 + Math.floor(hash(o.i, n, seed) * 3); o.rec.ax = f.rec.ax; o.rec.az = f.rec.az; }
        }
        // trace (opts.trace): closest airborne bird to an actor's body (vertical capsule) = the "mobbing" metric
        if (trace) for (const b of birds) {
          if (!b.active || (b.rec.s !== STATE.FLEE && b.rec.s !== STATE.AWAY && b.rec.s !== STATE.RETURN)) continue;
          posAt(b, t, tmp);
          if (tmp.pos.y - b.g.gy < 0.5) continue;   // the last metres of a landing are near the ground, not a mob
          for (const it of snap.items) {
            const dh = Math.hypot(tmp.pos.x - it.x, tmp.pos.z - it.z), dy = Math.max(0, tmp.pos.y - (it.y + (it.height ?? 1.4)));
            const d = Math.hypot(dh, dy);
            const k = b.sp;
            if (!(k in trace.min) || d < trace.min[k][0]) trace.min[k] = [+d.toFixed(2), +t.toFixed(2), b.i];
          }
        }
        // a group stops "fleeing" once all of its birds are back to idle
        for (const g of groups) if (g.fleeing && birds.every((b) => b.g !== g || !b.active || b.rec.s === STATE.IDLE || b.rec.s === STATE.ALERT)) { g.fleeing = false; g.far = false; }
      },
    });

    // ---- drawing at time t (state from the last tick <= t) ------------------------------------------------------
    function flightPose(b, t, age) {
      const F = SPEC[b.sp].fly, P = b.P;
      if (b.rec.s === STATE.FLEE && age < 0.4) return P[F.flap[cycleFrame(t, F.flap.length, 1, b.ph)]];   // frantic takeoff
      if (F.glide && b.rec.s === STATE.AWAY) {
        // glide spells: per bird, every 16 beats of its flap clock, glide for 6 (wings held: one drawing)
        const beat = clockIndex(t, F.flapK, b.ph), seg = Math.floor(beat / 16), k = beat - seg * 16;
        if (k >= 10 && hash(b.i, seg, seed + 40) < 0.7) return P[F.glidePose];
      }
      return P[F.flap[cycleFrame(t, F.flap.length, F.flapK, b.ph)]];
    }
    function posAt(b, t, out) {
      const rec = b.rec, tg = gridTime(t);
      const age = Math.max(0, tg - rec.t0);
      switch (rec.s) {
        case STATE.IDLE: return idleAt(b, t, out);
        case STATE.ALERT: {
          idleAt(b, rec.t0, out);                          // freeze, stretch up, face the threat
          out.pos.y = b.kind === 'perch' ? b.home.y : b.gy;
          out.pose = b.P.ALERT;
          out.yaw = quantYaw(Math.atan2(-rec.ax, -rec.az));
          return out;
        }
        case STATE.FLEE: case STATE.AWAY: {
          out.pos.copy(b.p);
          out.yaw = quantYaw(Math.atan2(b.v.x, b.v.z));
          out.pose = flightPose(b, t, age);
          return out;
        }
        case STATE.RETURN: {
          const u = clamp(age / b.R.opts.returnTime);
          returnAt(b, u, out.pos);
          returnAt(b, Math.min(1, u + 0.05), tmpB);
          const dx = tmpB.x - out.pos.x, dz = tmpB.z - out.pos.z;
          out.yaw = Math.hypot(dx, dz) > 1e-4 ? quantYaw(Math.atan2(dx, dz)) : quantYaw(Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z));
          const F = SPEC[b.sp].fly;
          // descent: wings held high in a V (UP) instead of the flat GLIDE: a flat glide heading toward the camera is a
          // plan-view cross / aeroplane on the dirt (shots/ambient-birds/r3-recovery); then the LAND flare
          out.pose = u > 0.84 ? b.P.LAND : u > 0.5 && F.glide ? b.P.UP : b.P[F.flap[cycleFrame(t, F.flap.length, 2, b.ph)]];
          return out;
        }
      }
      return out;
    }

    // ---- time of day: who is out
    let tod = ctx.tod;
    function applyTod(info) {
      tod = info;
      const name = info?.name ?? 'noon';
      const day = sceneDay(name), dusk = sceneDusk(name);
      for (const b of birds) b.active = b.when === 'both' ? (day || dusk) : b.when === 'day' ? day : b.when === 'dusk' ? dusk : false;
      ticker.n = null;     // re-simulate from 0 with the new cast (replay stays a pure f(t))
    }
    applyTod(tod);

    const counts = new Array(STATE_NAMES.length).fill(0);
    let lastSheet = null;
    return {
      api: { birds, events, groups },
      update(t) {
        if (opts.sheet) {   // look-dev: every drawing of one species in a row along screen-right (no sim)
          const sp = opts.sheetSpecies || 'pigeon';
          const names = Object.keys(PI[sp]);
          const gap = opts.sheetGap ?? (sp === 'crow' ? 0.75 : sp === 'sparrow' ? 0.45 : 0.58);
          if (lastSheet !== sp) {
            for (let i = 0; i < batch.max; i++) {
              if (i >= names.length) { batch.hide(i); continue; }
              const c0 = engine.camera.target ? engine.camera.target.clone().setY(0) : flockC.clone();   // centred on the view
              const p = c0.addScaledVector(scrR, (i - (names.length - 1) / 2) * gap); p.y = groundY(p.x, p.z);
              batch.set(i, p, opts.sheetYaw ?? 0, PI[sp][names[i]]);
            }
            batch.commit(); batch.mesh.visible = batch.visible > 0; lastSheet = sp;
          }
          return;
        }
        ticker.advance(t);
        counts.fill(0);
        for (const b of birds) {
          if (!b.active) { batch.hide(b.i); continue; }
          counts[b.rec.s]++;
          posAt(b, t, tmp);
          if (tmp.pose < 0) batch.hide(b.i);
          else batch.set(b.i, tmp.pos, tmp.yaw, tmp.pose);
          const air = b.rec.s === STATE.FLEE || b.rec.s === STATE.AWAY || b.rec.s === STATE.RETURN;
          iNoSh.array[b.i] = air && tmp.pos.y - b.g.gy > SHADOW_MAX_H ? 1 : 0;
        }
        iNoSh.needsUpdate = true;
        batch.commit();
        // nobody out (night): skip the colour / normal / shadow passes entirely (3 GL calls -> 0)
        batch.mesh.visible = batch.visible > 0;
      },
      setTimeOfDay(info) { applyTod(info); },
      stats() {
        const st = Object.fromEntries(STATE_NAMES.map((n, k) => [n, counts[k]]));
        const first = events[0];
        const act = birds.filter((b) => b.active);
        const by = (sp) => act.filter((b) => b.sp === sp).length;
        return {
          agents: act.length, visible: batch.visible, ...st, pigeons: by('pigeon'), sparrows: by('sparrow'), crows: by('crow'),
          calls: batch.visible > 0 ? 3 : 0, lights: 0, tris: Math.round(batch.tris * batch.visible), poses: batch.poseCount,
          flees: events.length, firstFlee: first ? `${first.t}s@${first.d}m/${first.speed}mps` : '',
          fleeLog: events.slice(0, 24).map((e) => `${e.sp[0]}${e.i}:${e.t}@${e.d}`).join(' '),
          resets: ticker.resets, tod: tod?.name,
          ...(trace ? { trace: trace.tr.join(' '), minAir: JSON.stringify(trace.min) } : {}),
        };
      },
      debug() { return { events: events.slice(), states: birds.map((b) => b.rec.s) }; },
      dispose() { batch.dispose(); geos.forEach((g) => g.dispose()); },
    };
  },
});
