// props (owner: props agent). docs/TOWN.md §4. Street furniture of Hollowmere: every layout object with owner 'props'
// (ctx.record.objects): 8 streetlamps, the fountain, 2 market stalls (red + gold), 2 barrels, a crate stack, 2 benches.
// v1 art (read only): pipgws packages/assets/scripts/props.ts lamp() fountain() stall() bench() barrel() crates().
// Render: tools/townpiece.sh props shots/town-props --focus 33,14   (and --focus 10.5,18 for the west stall side)
//
// DESIGN NOTE (what each must read as at 640x360, gameplay camera = 30 px/m, 1 texel = 3.3 cm)
//  - STREETLAMP (v1 lamp: black iron, stepped plinth, post with 2 collars, scroll brackets, glass lantern with a
//    pyramid roof + finial). Signature = a thin dark vertical stroke (3 px) topped by a 9 px lantern box with a
//    pointed cap; at night the glass is the brightest warm thing on the street. Palette: iron (post, cap), ashlar
//    footing, lampGlow emissive glass. Lantern 2.45..2.83 m, finial 3.2 m (v1 sprite 3 m).
//  - FOUNTAIN (v1: stone basin ring with dark water, central pillar + top bowl, water arcs). Signature = a low pale
//    stone octagon ring (fills the 3x2 m collision rect -> a stretched octagon) with real pixel3d water (the water
//    post pass: depth bands, 1-px shore, waves, sparkles), a two-tier column and four stepped falling streams.
//    Palette: kerb (basin wall), ashlar (cap course, bowl), stone (floor, shaft), streams = cream / blue hi tones.
//  - MARKET STALLS (v1 stall: wooden counter of vertical planks, baskets of goods, striped awning sloping toward
//    the viewer with a scalloped valance, garlic string or a hanging lantern). Signature = the striped awning
//    (8 stripes, ~11 px each) + scallops; the awning is HIGH (2.3 m front) so the wares on the counter stay visible
//    under it from 30 deg. Red stall = greengrocer (apples, pears, plums, pumpkins, garlic string); gold stall =
//    dairy / baker (cheese wheels, loaves, honey jars, a lantern on a hook). Palette: plank, timber, thatch
//    (wicker), paintRamp(v1 CLOTH red / gold) + cream stripes, single-tone accents for produce.
//  - BENCH (v1: two back slats + seat between curly iron ends). Faces south. Palette: plank + iron.
//  - BARRELS (v1: bulging staves, 2 iron hoops). The west one is an open apple barrel by the greengrocer; the
//    cart-road one a closed water butt with a tin cup.  CRATES (v1: 2 crates + 1 on top + a slumped sack).
//  - Light from the upper-left: everything is real geometry lit by the toon sun; relief >= 1.2 texels so edges get
//    the t3ssel8r dark line below / cream rim above; no part thinner than 0.05 m; axis-aligned or 45 deg only.
// ANCHORS: lights (8 lamps kind 'lamp' + the stall lantern kind 'lantern'), seats (2 per bench), perches (lamp
//   finials, awning ridges, fountain finial + rim, crate top, barrel lids), spots {fountain (water centre),
//   fountainTop, fountainSpout0..3, fountainCenter, stallRed, stallGold (customer spots), lamp0..7 (lantern
//   centres), lampBase0..7, crates, barrel0/1, bench0/1 (in front of the bench)}.
// API: setLampsLit(bool), setFountain(bool), setLampPool(i, f|null), water {basin, bowl}, lamps [{pos, top, base, variant}].
// Fix round: 3-facet shaded awnings + ridge piping, unshadowed wares, a lantern on both stalls (lights 'stallLantern',
//   'stallLanternRed'; spots stallGoldLantern / stallRedLantern), warm night pools under the lamps (lampPools), a
//   moonlit night fountain, continuous streams, one detail per lamp (cresting / flower basket / ribbon), and builders
//   for noticeboard / well / signpost / cart / pumpkins / flowerbarrel (PROPOSED placements, preview ?propsExtra=1).
import * as THREE from 'three';
import { Builder, M } from '../kit.js';
import { paintRamp } from '../palette.js';
import { createWater } from '../../world/water.js';
import { rng } from '../../core/noise.js';
import { LAYERS } from '../../core/PixelPipeline.js';
import { patchCutShader, cutUniforms } from '../cutaway.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// Low quality tier (ctx.quality === 'low', docs/TOWN.md §12.4 / 12.6): set once per build(). Low decimates the solid
// geometry (8-gon barrels / flower barrel / well, 12-gon cart wheels, one bracket collar per lamp instead of 4 scroll
// brackets, 4 cresting spikes, 3-part sacks, no jar ties) and routes the SMALL props (barrels, crates + sacks,
// benches, pumpkins, flower barrel, lamp details, stall ground dressing) to a 'props-small' Builder that receives but
// does not cast shadows. High is unchanged (the small Builder IS the main one there).
let LO = false;
/** Run fn(sm) in the frame `at` on the small-props Builder (call it outside any b.push frame: sm may be b). */
function onSmall(sm, at, fn) {
  sm.push(M({ at })); const r = fn(sm); sm.pop(); return r;
}

// ---------------------------------------------------------------------------------------------- small helpers
/** Tapered vertical post (hexa frustum: no exactly edge-on faces at yaw 0 -> no 0/1 px flicker). Local frame. */
function post(b, x, z, y0, y1, w0, w1, opts) {
  const c = [];
  for (let i = 0; i < 8; i++) {
    const top = i & 2, w = top ? w1 : w0;
    c.push(V(x + (i & 1 ? 0.5 : -0.5) * w, top ? y1 : y0, z + (i & 4 ? 0.5 : -0.5) * w));
  }
  return b.hexa(c, opts);
}

/** Stretched n-gon vertex i (flat face toward +z), centre (0,0). */
const oct = (i, rx, rz, n = 8) => { const a = ((i + 0.5) * TAU) / n; return [Math.sin(a) * rx, Math.cos(a) * rz]; };

/** Octagonal ring wall (outer rx/rz, inner rxi/rzi) from y0 to y1. */
function octRing(b, { rx, rz, rxi, rzi, y0, y1, n = 8, ...opts }) {
  for (let i = 0; i < n; i++) {
    const c = [];
    for (let k = 0; k < 8; k++) {
      const vi = k & 1 ? i + 1 : i, outer = k & 4;
      const [px, pz] = oct(vi, outer ? rx : rxi, outer ? rz : rzi, n);
      c.push(V(px, k & 2 ? y1 : y0, pz));
    }
    b.hexa(c, opts);
  }
}

/** Solid stretched n-gon slab (floor / plinth) from y0 to y1. */
function octSlab(b, { rx, rz, y0, y1, n = 8, ...opts }) {
  const g = new THREE.CylinderGeometry(1, 1, y1 - y0, n, 1, false, Math.PI / n);
  g.scale(rx, 1, rz); g.translate(0, (y0 + y1) / 2, 0);
  b.add(g, null, opts); g.dispose();
}

/** Deterministic stepped sway table (pure f(t)): 8 poses at `fps`. */
const SWAY = [0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5];
const swayAt = (t, fps, phase = 0) => SWAY[(Math.floor(t * fps) + phase) % 8];

// ---------------------------------------------------------------------------------------------- streetlamp
/** Per-lamp gothic-cozy detail (one each): wrought cresting crown, hanging flower basket (2 of 8), ribbon bow. */
function lampVariant(b, kind, seed) {
  if (kind === 'cresting') {
    // wrought crown: 8 iron spikes standing on the cap plate + a collar ring under the tray
    for (let i = 0; i < 8; i += LO ? 2 : 1) {
      const a = (i * TAU) / 8, r = 0.165;
      b.box(0.05, i % 2 ? 0.08 : 0.12, 0.05, { tones: 'iron', at: [Math.sin(a) * r, 2.885, Math.cos(a) * r], ry: a });
    }
    b.box(0.24, 0.05, 0.24, { tones: 'iron', at: [0, 2.24, 0], ry: Math.PI / 4 });
  } else if (kind === 'basket') {
    // hanging flower basket on a side arm (west = the sunlit side), chain, wicker bowl, trailing ivy + blooms
    const s = seed % 2 ? -1 : 1, ax = s * 0.36;
    b.box(0.34, 0.05, 0.05, { tones: 'iron', at: [s * 0.2, 1.98, 0] });
    b.box(0.07, 0.07, 0.07, { tones: 'iron', at: [s * 0.04, 1.93, 0] });
    b.box(0.05, 0.16, 0.05, { tones: 'iron', at: [ax, 1.83, 0] });
    b.cylinder(0.1, 0.17, 0.15, { tones: 'thatch', pattern: 'vboards', scale: 0.35, segments: 8, at: [ax, 1.68, 0] });
    b.cylinder(0.16, 0.12, 0.07, { tones: 'leaf', layer: 'soft', segments: 8, at: [ax, 1.83, 0] });
    const r = rng(seed * 97 + 13);
    const FL = ['#D0505A', '#EDEBDA', '#A875D7', '#E6D36A'];
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + 0.3, rr = 0.11 + r() * 0.03;
      b.box(0.065, 0.065, 0.065, { tones: FL[(i + seed) % 4], layer: 'soft', at: [ax + Math.sin(a) * rr, 1.87 + r() * 0.03, Math.cos(a) * rr] });
    }
    // trailing ivy down the front and the lit side
    for (const [dx, dz, len] of [[-0.12, 0.08, 0.2], [0.1, 0.12, 0.14], [0.0, 0.15, 0.26]]) {
      b.box(0.05, len, 0.05, { tones: 'leaf', layer: 'soft', tint: 1.04, at: [ax + dx, 1.74 - len, dz] });
    }
  } else if (kind === 'ribbon') {
    // a red ribbon bow tied round the shaft (festival leftover), tails hanging at 45 deg
    b.box(0.15, 0.07, 0.15, { tones: '#B8463E', at: [0, 1.58, 0], ry: Math.PI / 4 });
    b.box(0.1, 0.08, 0.05, { tones: '#D0505A', origin: 'center', at: [-0.1, 1.62, 0.08], rz: Math.PI / 4 });
    b.box(0.1, 0.08, 0.05, { tones: '#D0505A', origin: 'center', at: [0.1, 1.62, 0.08], rz: -Math.PI / 4 });
    b.box(0.05, 0.24, 0.05, { tones: '#B8463E', origin: 'center', at: [-0.05, 1.43, 0.09], rz: -0.35 });
    b.box(0.05, 0.2, 0.05, { tones: '#B8463E', origin: 'center', at: [0.06, 1.45, 0.09], rz: 0.35 });
  }
}

function lamp(b, cx, cz, variant = 'none', seed = 0, sm = b) {
  b.push(M({ at: [cx, 0, cz] }));
  // footing + stepped iron plinth (v1: 3 steps)
  b.box(0.56, 0.07, 0.56, { tones: 'ashlar', at: [0, -0.03, 0] });
  b.box(0.42, 0.09, 0.42, { tones: 'iron', at: [0, 0.04, 0] });
  b.box(0.31, 0.09, 0.31, { tones: 'iron', at: [0, 0.13, 0] });
  post(b, 0, 0, 0.22, 0.37, 0.21, 0.17, { tones: 'iron' });
  // post + two collars
  // a square shaft turned 45 deg: at yaw 0 it shows a lit left face + a shaded right face and no edge-on face
  // (a tapered shaft's nearly vertical silhouette tied on a pixel centre at one row and crawled under a pan)
  b.box(0.1, 1.94, 0.1, { tones: 'iron', at: [0, 0.37, 0], ry: Math.PI / 4 });
  b.box(0.173, 0.07, 0.173, { tones: 'iron', at: [0, 0.621, 0] });
  b.box(0.163, 0.07, 0.163, { tones: 'iron', at: [0, 2.171, 0] });
  // scroll brackets (x and z sides) up to the tray
  // (low: one 45-deg bracket collar under the tray: 12 tris instead of 96)
  if (LO) b.box(0.21, 0.13, 0.21, { tones: 'iron', at: [0, 2.24, 0], ry: Math.PI / 4 });
  else for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    post(b, sx * 0.105, sz * 0.105, 2.21, 2.34, 0.055, 0.055, { tones: 'iron' });
    b.box(sx ? 0.09 : 0.055, 0.055, sz ? 0.09 : 0.055, { tones: 'iron', at: [sx * 0.15, 2.335, sz * 0.15] });
  }
  // tray, glass, corner bars, pyramid roof, finial
  b.box(0.38, 0.06, 0.38, { tones: 'iron', at: [0, 2.39, 0] });
  b.box(0.27, 0.38, 0.27, { tones: 'glass', layer: 'glass', glow: '#FFC46B', glowKind: 1, at: [0, 2.45, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.055, 0.38, 0.055, { tones: 'iron', at: [sx * 0.145, 2.45, sz * 0.145] });
  b.box(0.36, 0.055, 0.36, { tones: 'iron', at: [0, 2.83, 0] });
  const rb = 0.21, rt = 0.045, y0 = 2.885, y1 = 3.07;
  b.hexa([V(-rb, y0, -rb), V(rb, y0, -rb), V(-rt, y1, -rt), V(rt, y1, -rt), V(-rb, y0, rb), V(rb, y0, rb), V(-rt, y1, rt), V(rt, y1, rt)], { tones: 'iron' });
  b.box(0.06, 0.07, 0.06, { tones: 'iron', at: [0, 3.07, 0] });
  b.box(0.09, 0.07, 0.09, { tones: 'brass', at: [0, 3.14, 0] });
  b.pop();
  onSmall(sm, [cx, 0, cz], (s) => lampVariant(s, variant, seed));
  return { pos: V(cx, 2.64, cz), top: V(cx, 3.22, cz), base: V(cx, 0, cz) };
}

// ---------------------------------------------------------------------------------------------- bench
function bench(b, cx, cz) {
  b.push(M({ at: [cx, 0, cz] }));
  const L = 1.72;
  // seat (planks along x) + front apron
  b.box(L, 0.065, 0.42, { tones: 'plank', pattern: 'boards', scale: 0.62, at: [0, 0.405, 0.02] });
  b.box(L - 0.08, 0.075, 0.05, { tones: 'plank', tint: 0.95, at: [0, 0.33, 0.19] });
  // back rest: two slats
  for (const y of [0.6, 0.8]) b.box(L, 0.12, 0.055, { tones: 'plank', tint: y > 0.7 ? 1.03 : 0.98, at: [0, y, -0.2] });
  // iron ends: front leg, back leg (rises to the back rest), arm rest with a curl, foot bar
  for (const s of [-1, 1]) {
    const x = s * (L / 2 - 0.09);
    post(b, x, 0.17, 0, 0.405, 0.065, 0.06, { tones: 'iron' });
    post(b, x, -0.2, 0, 0.98, 0.065, 0.06, { tones: 'iron' });
    b.box(0.065, 0.055, 0.46, { tones: 'iron', at: [x, 0.6, -0.01] });
    b.box(0.085, 0.085, 0.085, { tones: 'iron', at: [x, 0.57, 0.24] });
    b.box(0.06, 0.05, 0.42, { tones: 'iron', at: [x, 0.07, -0.015] });
    b.box(0.08, 0.06, 0.08, { tones: 'iron', at: [x, 0.97, -0.2] });
  }
  b.pop();
  return [V(cx - 0.42, 0.44, cz + 0.02), V(cx + 0.42, 0.44, cz + 0.02)];
}

// ---------------------------------------------------------------------------------------------- barrel
function barrel(b, cx, cz, { open = false, seed = 0 } = {}) {
  b.push(M({ at: [cx, 0, cz] }));
  const H = 0.86, rE = 0.27, rM = 0.32, seg = LO ? 8 : 16;
  const st = { tones: 'plank', pattern: 'vboards', scale: 0.6 };
  b.cylinder(rE, rM, H / 2, { ...st, segments: seg, at: [0, 0, 0] });
  b.cylinder(rM, rE, H / 2, { ...st, segments: seg, at: [0, H / 2, 0] });
  // iron hoops (>= 1.2 texels proud)
  const rAt = (y) => (y < H / 2 ? rE + (rM - rE) * (y / (H / 2)) : rM - (rM - rE) * ((y - H / 2) / (H / 2)));
  for (const y of [0.11, H - 0.17]) {
    const r = rAt(y + 0.03) + 0.04;
    b.cylinder(r, r, 0.06, { tones: 'iron', segments: seg, at: [0, y, 0] });
  }
  if (open) {
    // apples heaped above the rim (the rim hides anything lower: keep the heap ABOVE it)
    b.cylinder(rE - 0.02, rE - 0.1, 0.07, { tones: '#D0505A', layer: 'soft', segments: 8, at: [0, H, 0] });
    const pal = ['#D0505A', '#B04A5A', '#D0505A', '#E6D36A'];
    const pts = [[-0.1, 0.02], [0.08, -0.06], [0.03, 0.11], [-0.04, -0.12], [0.14, 0.07]];
    pts.forEach(([x, z], i) => b.box(0.085, 0.08, 0.085, { tones: pal[(i + seed) % pal.length], layer: 'soft', at: [x, H + 0.04, z] }));
  } else {
    // lid board + a tin cup on the lid (water butt)
    b.box(0.38, 0.04, 0.07, { tones: 'timber', at: [0, H, -0.08] });
    b.cylinder(0.065, 0.065, 0.1, { tones: 'iron', segments: 8, at: [0.1, H, 0.07] });
    b.box(0.06, 0.06, 0.05, { tones: 'iron', at: [0.18, H + 0.02, 0.07] });
  }
  b.pop();
  return V(cx, H + (open ? 0.12 : 0.02), cz);
}

// ---------------------------------------------------------------------------------------------- crates
function crate(b, x, y, z, s, { brace = 1, tint = 1 } = {}) {
  const c = s - 0.04;
  b.box(c, c, c, { tones: 'plank', pattern: 'boards', scale: 0.55, tint: 0.94 * tint, at: [x, y + 0.02, z] });
  const f = 0.075, pr = s + 0.002;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(f, s, f, { tones: 'plank', tint, at: [x + sx * (pr / 2 - f / 2), y, z + sz * (pr / 2 - f / 2)] });
  // top + bottom rails on the four faces (stand 1.2 texels proud of the core)
  for (const yy of [y, y + s - f]) {
    b.box(s - 2 * f + 0.01, f, s - 0.002, { tones: 'plank', tint: tint * 1.02, at: [x, yy, z] });
    b.box(s - 0.002, f, s - 2 * f + 0.01, { tones: 'plank', tint: tint * 1.02, at: [x, yy, z] });
  }
  // diagonal brace on the front (+z) face, exactly 45 deg
  if (brace) {
    const len = (s - 2 * f) * Math.SQRT2 * 0.96;
    b.box(len, 0.07, 0.04, { tones: 'plank', tint: tint * 1.04, origin: 'center', at: [x, y + s / 2, z + c / 2 + 0.018], rz: (brace * Math.PI) / 4 });
  }
}

function sack(b, x, y, z, burlap) {
  const o = { tones: burlap, layer: 'soft', segments: 8 };
  if (LO) b.cylinder(0.215, 0.065, 0.36, { ...o, at: [x, y, z] });     // low: one slumped cone body
  else {
    b.cylinder(0.2, 0.235, 0.12, { ...o, at: [x, y, z] });
    b.cylinder(0.235, 0.17, 0.16, { ...o, at: [x, y + 0.12, z] });
    b.cylinder(0.17, 0.065, 0.08, { ...o, at: [x, y + 0.28, z] });
  }
  b.cylinder(0.06, 0.06, 0.05, { tones: 'timber', segments: 8, at: [x, y + 0.36, z] });
  b.cylinder(0.065, 0.1, 0.07, { ...o, at: [x, y + 0.41, z] });
}

// ---------------------------------------------------------------------------------------------- market stall
// accent ramps for the wares (critic fix: one ramp step brighter than the v1 single tones, so they read in shade)
const CHEESE = ['#F8E8A8', '#F0D080', '#9A8460'];
const RIND = ['#F0D080', '#D8AE58', '#86705A'];
const CURD = ['#FFF4D8', '#F2E8D0', '#9A9488'];
const LOAF = ['#F0B050', '#C8782A', '#6E4A44'];
const GOODS = {
  red: [
    { basket: 'thatch', heap: '#D0505A', fruit: ['#D0505A', '#B04A5A', '#D0505A'] },       // apples
    { basket: 'thatch', heap: '#86A05A', fruit: ['#B4C474', '#86A05A', '#E6D36A'] },       // pears / greens
    { basket: 'thatch', heap: '#6E5480', fruit: ['#9E7EA8', '#6E5480', '#A875D7'] },       // plums
  ],
  gold: [
    { cheese: true },                                                                     // cheese wheels
    { basket: 'thatch', loaves: true },                                                   // loaves
    { jars: true },                                                                       // honey jars
  ],
};

/**
 * Awning cross-section (z, y) from the ridge (back, high) to the front edge: a bellied 3-facet slope, so the toon
 * light and the per-facet tint band it light at the ridge -> mid in the body -> dark at the valance (v1 stall()
 * shaded the awning top-light to bottom-dark). Max height stays 2.26 m (fountain sight line, TOWN_LEARNINGS).
 */
const AWN = [[-0.48, 2.26], [0.3, 2.215], [0.84, 2.11], [1.16, 1.975]];
const AWN_TINT = [1.05, 0.95, 0.85];
const awnY = (z) => {
  for (let i = 0; i < AWN.length - 1; i++) {
    const [za, ya] = AWN[i], [zb, yb] = AWN[i + 1];
    if (z <= zb || i === AWN.length - 2) return ya + ((z - za) / (zb - za)) * (yb - ya);
  }
  return AWN[0][1];
};

function stall(b, w, cx, cz, kind, burlap, sm = b) {
  const red = kind === 'stall_red';
  const cloth = red ? ['#D0505A', '#B8463E', '#5A3848'] : 'brass';      // flowerRed / bannerRed / red sh; brass ramp
  b.push(M({ at: [cx, 0, cz] }));
  w.push(M({ at: [cx, 0, cz] }));
  // compact, open-backed stall: the awning only covers the front half and stays below ~2.3 m, so the fountain
  // behind the gold stall (z 11..13) stays visible from the 30 deg gameplay camera (see TOWN_LEARNINGS)
  const PX = 1.43, FZ = 0.9, BZ = -0.38;
  // vendor's back table (low) with spare stock
  b.box(2.5, 0.07, 0.4, { tones: 'plank', tint: 1.02, at: [0, 0.68, -0.68] });
  for (const s of [-1, 1]) for (const zz of [-0.53, -0.83]) post(b, s * 1.12, zz, 0, 0.68, 0.075, 0.07, { tones: 'timber' });
  // counter: vertical plank front, top board with an overhang (line under the lip, cream rim on top)
  b.box(2.42, 0.86, 0.7, { tones: 'plank', pattern: 'vboards', at: [0, 0, 0.5] });
  b.box(2.56, 0.07, 0.82, { tones: 'plank', tint: 1.04, at: [0, 0.86, 0.5] });
  b.box(2.36, 0.08, 0.04, { tones: 'timber', at: [0, 0.12, 0.865] });                    // kick rail
  // awning: 8 stripes x 3 facets, slab T thick
  const N = 8, AW = 3.1, sw = AW / N, z0 = AWN[0][0], z1 = AWN[AWN.length - 1][0];
  const T = 0.06;
  // posts (tapered) stop just under the awning slab (a post top level with the slab top showed as a dash), rails
  for (const s of [-1, 1]) {
    post(b, s * PX, FZ, 0, awnY(FZ) - T - 0.013, 0.115, 0.1, { tones: 'timber' });
    post(b, s * PX, BZ, 0, awnY(BZ) - T - 0.013, 0.115, 0.1, { tones: 'timber' });
    b.box(0.08, 0.08, FZ - BZ, { tones: 'timber', at: [s * PX, 1.42, (FZ + BZ) / 2] });
  }
  for (let i = 0; i < N; i++) {
    const xa = -AW / 2 + i * sw, xb = xa + sw, tones = i % 2 ? 'cream' : cloth;
    for (let f = 0; f < AWN.length - 1; f++) {
      const [za, ya] = AWN[f], [zb, yb] = AWN[f + 1];
      b.hexa([V(xa, ya - T, za), V(xb, ya - T, za), V(xa, ya, za), V(xb, ya, za),
        V(xa, yb - T, zb), V(xb, yb - T, zb), V(xa, yb, zb), V(xb, yb, zb)], { tones, tint: AWN_TINT[f] });
    }
    // front valance strip + scallop tab (a trapezoid prism hanging from each stripe): the darkest step
    const yv = awnY(z1) - T;
    b.box(sw, 0.13, 0.05, { tones, tint: 0.82, at: [(xa + xb) / 2, yv - 0.13, z1 - 0.025] });
    b.prism([[-sw / 2 + 0.035, 0], [sw / 2 - 0.035, 0], [sw * 0.22, -0.1], [-sw * 0.22, -0.1]], 0.05, { tones, tint: 0.78, at: [(xa + xb) / 2, yv - 0.13, z1 - 0.025] });
  }
  // ridge board along the back edge of the awning + a cream piping rim on the ridge (1.4 texels proud)
  b.box(AW + 0.06, 0.07, 0.1, { tones: 'timber', at: [0, awnY(z0) - 0.03, z0 + 0.03] });
  b.box(AW + 0.02, 0.048, 0.07, { tones: 'cream', tint: 1.03, at: [0, awnY(z0 + 0.13) - 0.004, z0 + 0.13] });
  // the greengrocer's sign on the ridge (nothing tall stands behind the red stall): a board with a painted apple
  if (red) {
    const sy = awnY(z0) + 0.03, sz = z0 + 0.03;
    for (const s of [-1, 1]) b.box(0.057, 0.16, 0.057, { tones: 'timber', at: [s * 0.27, sy, sz] });
    b.box(0.76, 0.34, 0.06, { tones: 'cream', at: [0, sy + 0.14, sz] });
    b.box(0.82, 0.06, 0.08, { tones: 'timber', at: [0, sy + 0.47, sz] });
    b.prism(Array.from({ length: 8 }, (_, i) => oct(i, 0.12, 0.115)), 0.04, { tones: '#D0505A', at: [0, sy + 0.3, sz + 0.045] });
    b.box(0.09, 0.06, 0.04, { tones: 'leaf', at: [0.07, sy + 0.42, sz + 0.045] });
    b.box(0.057, 0.08, 0.04, { tones: 'timber', at: [-0.01, sy + 0.41, sz + 0.045] });
  }
  // iron pegs (arms) on the outside of the front posts: garlic (red, east) and a lantern (both stalls, west)
  for (const sx of red ? [-1, 1] : [-1]) b.box(0.243, 0.057, 0.057, { tones: 'iron', at: [sx * (PX + 0.113), 1.9, FZ] });

  // wares (own Builder `w`: no shadow received, so the awning's shade does not mud them; they still cast)
  const ty = 0.93;
  GOODS[red ? 'red' : 'gold'].forEach((g, k) => {
    const x = -0.8 + k * 0.8, z = red ? 0.6 : 0.64;
    if (g.cheese) {
      w.box(0.66, 0.05, 0.44, { tones: 'plank', tint: 1.08, at: [x, ty, z] });              // board
      // two stacked wheels: rind sides, cream curd tops; a cut wedge at the front lip
      w.cylinder(0.19, 0.19, 0.12, { tones: RIND, segments: 8, at: [x - 0.12, ty + 0.05, z - 0.04] });
      w.cylinder(0.175, 0.175, 0.045, { tones: CURD, segments: 8, at: [x - 0.12, ty + 0.17, z - 0.04] });
      w.cylinder(0.15, 0.15, 0.11, { tones: RIND, segments: 8, at: [x - 0.12, ty + 0.215, z - 0.04] });
      w.cylinder(0.135, 0.135, 0.045, { tones: CURD, segments: 8, at: [x - 0.12, ty + 0.325, z - 0.04] });
      w.box(0.16, 0.13, 0.13, { tones: CHEESE, at: [x + 0.2, ty + 0.05, z + 0.11] });
      w.box(0.16, 0.045, 0.13, { tones: CURD, at: [x + 0.2, ty + 0.18, z + 0.11] });
      w.cylinder(0.12, 0.12, 0.1, { tones: RIND, segments: 8, at: [x + 0.18, ty + 0.05, z - 0.1] });
      return;
    }
    if (g.jars) {
      for (const [jx, jz, h] of [[-0.19, -0.04, 0.22], [0.0, -0.06, 0.24], [0.19, -0.04, 0.22], [-0.1, 0.16, 0.17], [0.1, 0.16, 0.17]]) {
        w.cylinder(0.075, 0.075, h, { tones: 'brass', segments: 8, at: [x + jx, ty, z + jz] });
        w.cylinder(0.085, 0.085, 0.05, { tones: CURD, segments: 8, at: [x + jx, ty + h, z + jz] });   // cloth cap
        if (!LO) w.cylinder(0.08, 0.08, 0.025, { tones: '#B8463E', segments: 8, at: [x + jx, ty + h - 0.012, z + jz] });   // red tie (proud of the jar)
      }
      return;
    }
    w.cylinder(0.27, 0.3, 0.13, { tones: g.basket, pattern: 'vboards', scale: 0.35, segments: 8, at: [x, ty, z] });
    if (g.loaves) {
      for (const [lx, lz, ry] of [[-0.13, -0.06, 0], [0.13, -0.02, 0], [0.0, 0.13, Math.PI / 2]]) {
        w.box(0.25, 0.13, 0.15, { tones: LOAF, layer: 'soft', at: [x + lx, ty + 0.12, z + lz], ry });
        // scored crust: two pale slashes on the top (1.2 texels proud)
        for (const o of [-0.06, 0.06]) w.box(0.05, 0.04, 0.1, { tones: '#F8D088', layer: 'soft', at: [x + lx + (ry ? 0 : o), ty + 0.25, z + lz + (ry ? o : 0)], ry });
      }
      return;
    }
    w.cylinder(0.26, 0.15, 0.09, { tones: g.heap, layer: 'soft', segments: 8, at: [x, ty + 0.13, z] });
    const pts = [[-0.12, 0.06], [0.1, 0.08], [0.0, -0.08], [-0.03, 0.15], [0.14, -0.06], [-0.15, -0.07]];
    pts.forEach(([fx, fz], i) => w.box(0.1, 0.095, 0.1, { tones: g.fruit[i % 3], layer: 'soft', at: [x + fx, ty + 0.18 + (i < 3 ? 0.03 : 0), z + fz] }));
  });
  if (red) {
    // chalk price slate hung on the counter front: timber frame, dark slate, cream chalk marks
    w.box(0.46, 0.3, 0.035, { tones: 'timber', at: [0, 0.46, 0.866] });
    w.box(0.38, 0.22, 0.03, { tones: ['#545C84', '#3E4466', '#2A2E46'], at: [0, 0.5, 0.884] });
    for (const [mx, my, mw] of [[-0.08, 0.62, 0.17], [0.1, 0.62, 0.07], [-0.05, 0.55, 0.22]]) w.box(mw, 0.04, 0.02, { tones: CURD, at: [mx, my, 0.902] });
    w.prism(Array.from({ length: 8 }, (_, i) => oct(i, 0.04, 0.04)), 0.02, { tones: '#D0505A', at: [0.12, 0.57, 0.902] });
  } else {
    // a cream cloth draped over the counter front (under the lip) with a scalloped hem + a red band
    w.box(2.3, 0.26, 0.03, { tones: CURD, at: [0, 0.6, 0.865] });
    w.box(2.3, 0.045, 0.02, { tones: '#B8463E', at: [0, 0.68, 0.885] });
    for (let i = 0; i < 7; i++) w.prism([[-0.12, 0], [0.12, 0], [0.06, -0.08], [-0.06, -0.08]], 0.03, { tones: CURD, tint: 0.97, at: [-0.99 + i * 0.33, 0.6, 0.865] });
  }
  // spare stock on the back table
  for (let i = 0; i < 4; i++) {
    const x = -0.9 + i * 0.6;
    if (red) b.box(0.32, 0.22, 0.28, { tones: 'plank', pattern: 'boards', scale: 0.4, tint: 0.96, at: [x, 0.75, -0.68] });
    else b.cylinder(0.09, 0.09, 0.24, { tones: i % 2 ? 'cream' : 'brass', segments: 8, at: [x, 0.75, -0.68] });
  }
  // ground dressing beside the counter (small props: no shadow at low)
  b.pop(); w.pop();
  onSmall(sm, [cx, 0, cz], (d) => {
    if (red) {
      for (const [px, pz, r] of [[1.29, 0.62, 0.13], [1.27, 0.3, 0.11]]) {
        d.cylinder(r, r * 0.92, r * 1.25, { tones: '#E08A3A', segments: 8, at: [px, 0, pz] });
        d.box(0.05, 0.08, 0.05, { tones: 'moss', at: [px, r * 1.25, pz] });
      }
      sack(d, -1.24, 0, 0.6, burlap);
    } else {
      crate(d, -1.24, 0, 0.55, 0.36, { brace: 0 });
      d.cylinder(0.06, 0.06, 0.14, { tones: 'brass', segments: 8, at: [-1.31, 0.36, 0.5] });
      d.cylinder(0.06, 0.06, 0.14, { tones: 'cream', segments: 8, at: [-1.15, 0.36, 0.6] });
      sack(d, 1.25, 0, 0.6, burlap);
    }
  });
  const hookL = V(cx - 1.62, 1.93, cz + FZ);
  return {
    spot: V(cx, 0, cz + 1.55),
    ridge: V(cx, awnY(z0) + 0.06, cz + z0 + 0.03),
    hooks: red ? { garlic: V(cx + 1.62, 1.93, cz + FZ), lantern: hookL } : { lantern: hookL },   // iron pegs outside the front posts
  };
}

/** Garlic string (soft layer) hanging from a pivot at its top: v1 two-tone bulbs (lit left, shaded right) + tip. */
function garlicString(engine) {
  const b = new Builder(engine, { name: 'props-garlic' });
  b.box(0.05, 0.74, 0.05, { tones: '#3A2A1A', layer: 'soft', at: [0, -0.74, 0] });          // cord
  b.box(0.11, 0.06, 0.06, { tones: '#3A2A1A', layer: 'soft', at: [0, -0.8, 0] });            // knot
  for (let i = 0; i < 4; i++) {
    const y = -0.24 - i * 0.15, x = i % 2 ? 0.075 : -0.075;
    b.box(0.07, 0.12, 0.12, { tones: '#E8DCC4', layer: 'soft', at: [x - 0.035, y - 0.1, 0.03] });
    b.box(0.07, 0.12, 0.12, { tones: '#B8A888', layer: 'soft', at: [x + 0.035, y - 0.1, 0.03] });
    b.box(0.1, 0.04, 0.1, { tones: '#B8A888', layer: 'soft', at: [x, y - 0.13, 0.03] });     // rounded base
    b.box(0.05, 0.06, 0.05, { tones: '#E8DCC4', layer: 'soft', at: [x - 0.01, y + 0.02, 0.03] }); // pointed tip
  }
  return b.build({ name: 'props-garlic', receiveShadow: false });
}

/** Hanging stall lantern (iron frame + a 5x8-texel flame glass with a bright #FFF0B0 core) below a pivot at its hook. */
function hangLantern(engine, name) {
  const b = new Builder(engine, { name });
  b.box(0.05, 0.2, 0.05, { tones: 'iron', at: [0, -0.2, 0] });
  b.box(0.09, 0.06, 0.09, { tones: 'iron', at: [0, -0.24, 0] });                           // ring
  b.hexa([V(-0.14, -0.33, -0.14), V(0.14, -0.33, -0.14), V(-0.04, -0.24, -0.04), V(0.04, -0.24, -0.04),
    V(-0.14, -0.33, 0.14), V(0.14, -0.33, 0.14), V(-0.04, -0.24, 0.04), V(0.04, -0.24, 0.04)], { tones: 'iron' });
  b.box(0.2, 0.27, 0.2, { tones: 'glass', layer: 'glass', glow: '#FFC46B', glowKind: 2, at: [0, -0.6, 0] });
  b.box(0.1, 0.15, 0.22, { tones: 'glass', layer: 'glass', glow: '#FFF0B0', glowKind: 2, at: [0, -0.55, 0] });
  b.box(0.22, 0.1, 0.1, { tones: 'glass', layer: 'glass', glow: '#FFF0B0', glowKind: 2, at: [0, -0.53, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 0.27, 0.05, { tones: 'iron', at: [sx * 0.11, -0.6, sz * 0.11] });
  b.box(0.26, 0.05, 0.26, { tones: 'iron', at: [0, -0.65, 0] });
  b.box(0.07, 0.05, 0.07, { tones: 'iron', at: [0, -0.7, 0] });
  return b.build({ name, receiveShadow: false });
}

// ---------------------------------------------------------------------------------------------- fountain
const FT = { rx: 1.34, rz: 0.88, wall: 0.2, top: 0.78, level: 0.72, floor: 0.5, bowl: 1.31 };

function fountainBasin(b, cx, cz) {
  b.push(M({ at: [cx, 0, cz] }));
  const { rx, rz, wall, top, floor } = FT;
  octSlab(b, { rx: rx + 0.11, rz: rz + 0.11, y0: -0.04, y1: 0.08, tones: 'ashlar' });            // plinth step
  octRing(b, { rx, rz, rxi: rx - wall, rzi: rz - wall, y0: 0.08, y1: top, tones: 'kerb', pattern: 'ashlar', scale: 0.8 });
  octRing(b, { rx: rx + 0.05, rz: rz + 0.05, rxi: rx - wall - 0.03, rzi: rz - wall - 0.03, y0: top, y1: top + 0.08, tones: 'ashlar' });  // cap course
  octSlab(b, { rx: rx - wall + 0.01, rz: rz - wall + 0.01, y0: 0.06, y1: floor, tones: 'stone' });          // basin floor
  // moss creeping up the basin foot (soft layer: no cream rims), on the shaded / back faces
  for (const [i, w, off] of [[7, 0.3, -0.42], [7, 0.2, 0.36], [3, 0.34, 0.2]]) {
    const [ax, az] = oct(i, rx + 0.02, rz + 0.02), [bx, bz] = oct(i + 1, rx + 0.02, rz + 0.02);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    b.box(w, 0.1, 0.06, { tones: 'mossTuft', layer: 'soft', at: [mx + off, 0.07, mz], ry });
    b.box(w * 0.5, 0.07, 0.05, { tones: 'mossTuft', layer: 'soft', tint: 1.04, at: [mx + off + 0.03, 0.17, mz], ry });
  }
  // central column: base block, shaft, upper bowl, finial
  b.cylinder(0.29, 0.25, 0.36, { tones: 'ashlar', segments: 8, at: [0, floor, 0] });
  b.cylinder(0.3, 0.3, 0.06, { tones: 'ashlar', segments: 8, at: [0, floor + 0.36, 0] });
  b.cylinder(0.14, 0.12, 0.42, { tones: 'stone', segments: 8, at: [0, floor + 0.42, 0] });
  b.cylinder(0.1, 0.42, 0.17, { tones: 'ashlar', segments: 16, at: [0, FT.bowl, 0] });          // bowl underside
  octRing(b, { rx: 0.47, rz: 0.47, rxi: 0.38, rzi: 0.38, y0: FT.bowl + 0.17, y1: FT.bowl + 0.24, n: 16, tones: 'ashlar' });    // bowl lip
  b.cylinder(0.075, 0.06, 0.28, { tones: 'stone', segments: 8, at: [0, FT.bowl + 0.17, 0] });               // finial shaft
  b.cylinder(0.11, 0.11, 0.07, { tones: 'ashlar', segments: 8, at: [0, FT.bowl + 0.45, 0] });     // spout cap
  b.cylinder(0.05, 0.05, 0.08, { tones: 'brass', segments: 8, at: [0, FT.bowl + 0.52, 0] });
  b.pop();
}

/** One phase of the falling water (glass layer, no outline, never glows). 4 spouts from the bowl lip + top jet. */
function streamPhase(engine, cx, cz, ph) {
  const b = new Builder(engine, { name: `props-fountain-water-${ph}` });
  const W = ['#F2E8D0', '#78A6B8', '#4F7A92'];
  const FOAM = ['#F2E8D0', '#D8CCB0', '#78A6B8'];
  const o = { tones: W, layer: 'glass', glow: null };
  b.push(M({ at: [cx, 0, cz] }));
  const dirs = [[0, 1], [1, 0], [-1, 0], [0, -1]];
  const r0 = 0.49, yTop = FT.bowl + 0.22, yEnd = FT.level + 0.005;
  for (const [dx, dz] of dirs) {
    // the stream: ONE continuous arc out of the lip and down (each segment spans its radial step, so the body has
    // no gaps); a lighter 'head' segment walks down it per phase (critic: gaps read as dotted lines, not water)
    const K = 8;
    const rr = (u) => r0 + 0.04 + 0.12 * Math.sqrt(u);
    const yy = (u) => yTop - (yTop - yEnd) * (u * u * 0.6 + 0.4 * u);
    for (let k = 0; k < K; k++) {
      const u0 = k / K, u1 = (k + 1) / K;
      const ra = rr(u0), rb = rr(u1), ya = yy(u0), yb = yy(u1);
      const rad = Math.max(0.055, rb - ra + 0.05), tan = 0.06;
      const head = k === 2 * ph + 1;
      b.box(dx ? rad : tan, Math.max(0.06, ya - yb + 0.01), dz ? rad : tan,
        { tones: head ? FOAM : W, layer: 'glass', glow: null, at: [dx * (ra + rb) / 2, yb, dz * (ra + rb) / 2] });
    }
    // splash ring where it lands (stepped with the phase): 2 low foam pixels <-> 3 taller ones + a hop droplet
    const rl = rr(1), tx = dz, tz = dx;      // tangent direction
    const F = { tones: FOAM, layer: 'glass', glow: null };
    if (ph % 2 === 0) {
      for (const s of [-1, 1]) b.box(0.06, 0.035, 0.06, { ...F, at: [dx * rl + tx * s * 0.07, FT.level, dz * rl + tz * s * 0.07] });
    } else {
      for (const s of [-1, 1]) b.box(0.06, 0.06, 0.06, { ...F, at: [dx * rl + tx * s * 0.11, FT.level, dz * rl + tz * s * 0.11] });
      b.box(0.06, 0.05, 0.06, { ...F, at: [dx * (rl - 0.09), FT.level, dz * (rl - 0.09)] });
      b.box(0.055, 0.055, 0.055, { ...F, at: [dx * (rl - 0.03) + tx * (ph === 1 ? 0.05 : -0.05), FT.level + 0.11, dz * (rl - 0.03) + tz * (ph === 1 ? 0.05 : -0.05)] });
    }
  }
  // top jet: a short plume above the spout, bobbing in 4 steps
  const jh = [0.14, 0.2, 0.17, 0.11][ph];
  const jy = FT.bowl + 0.6;
  b.box(0.065, jh, 0.065, { ...o, at: [0, jy, 0] });
  b.box(0.06, 0.06, 0.06, { tones: FOAM, layer: 'glass', glow: null, at: [ph % 2 ? 0.07 : -0.07, jy + jh - 0.03, 0] });
  b.pop();
  const g = b.build({ name: `props-fountain-water-${ph}`, castShadow: false });
  const mesh = g.children[0];
  g.remove(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------------------------- water vs the cut-away
// The basin / bowl / well water are post passes (src/world/water.js), not toon meshes, so the camera-aware cut-away
// (src/town/cutaway.js, docs/TOWN.md §12.2) does not reach them: when the stone around them is cut (e.g. the fountain in
// front of house-3 at ?focus=house-3) the water discs were left floating in the air. Run the SAME per-point cut test on
// the water surface point W in the pass's waterAt(): cut water texels fall through to the (cut) scene behind.
// The GLSL is taken from cutaway.js itself (patched onto a throw-away material) and the uniforms are its shared
// cutUniforms(engine), so the test can never drift from the one the stone uses.
// CONTRACT-REQUEST (lead, src/town/cutaway.js): export CUT_GLSL (or a patchCutWater(engine, water) helper) so this
// extraction can become a plain import; town.js could then patch every 'water*' pass in one place.
let CUT_SRC = null;
function cutSource(engine) {
  if (CUT_SRC !== null) return CUT_SRC;
  const probe = new THREE.ShaderMaterial({ vertexShader: 'void main() {}', fragmentShader: 'void main() {}' });
  CUT_SRC = '';
  if (patchCutShader(engine, probe)) {
    const f = probe.fragmentShader, tag = 'varying vec3 vCutW;', i = f.indexOf(tag), b = f.lastIndexOf('void main() {');
    if (i >= 0 && b > i + tag.length && f.includes('bool townCut(')) CUT_SRC = f.slice(i + tag.length, b);
  }
  probe.dispose();
  return CUT_SRC;
}

function cutWater(engine, wb) {
  const mat = wb?.material;
  const hit = 'return thick > 1e-3 && inShape(W.xz);';
  if (!mat || mat.userData.townCut || mat.fragmentShader.includes('townCut(') || !mat.fragmentShader.includes(hit)) return false;
  const src = cutSource(engine);
  if (!src) return false;
  // the uniform objects are the cut-away's own (cutUniforms is memoised on the engine), so they follow it every frame
  Object.assign(mat.uniforms, cutUniforms(engine));
  mat.fragmentShader = mat.fragmentShader
    .replace('bool waterAt(', `${src}\nbool waterAt(`)
    .replace(hit, 'return thick > 1e-3 && inShape(W.xz) && !townCut(W);');
  mat.userData.townCut = true;
  mat.needsUpdate = true;
  return true;
}

/**
 * CPU twin of cutaway.js townCut() for ONE world point (same shared uniforms). Used for parts that must vanish as a
 * unit: the falling streams hang from the bowl, so when the per-fragment cut takes the column + bowl (a player box
 * just north of the fountain) the streams would be left hanging in the air.
 */
function cutAt(engine, x, y, z) {
  const U = cutUniforms(engine);
  if (U.uCutOn.value < 0.5) return false;
  const f = U.uCutFwd.value;
  const cyl = U.uCutCyl.value;
  if (cyl.z > 0) {
    const dx = x - cyl.x, dz = z - cyl.y, r2 = cyl.z * cyl.z;
    if (dx * dx + dz * dz >= r2) {
      const k = Math.max(-f.y, 1e-3), s0 = Math.max((y - cyl.w) / k, 0), s1 = y / k;
      if (s1 > s0) {
        const ax = dx + s0 * f.x, az = dz + s0 * f.z, bx = (s1 - s0) * f.x, bz = (s1 - s0) * f.z;
        const t = Math.min(1, Math.max(0, -(ax * bx + az * bz) / Math.max(bx * bx + bz * bz, 1e-6)));
        const qx = ax + t * bx, qz = az + t * bz;
        if (qx * qx + qz * qz < r2) return true;
      }
    }
  }
  for (let i = 0; i < Math.min(U.uCutBoxN.value, U.uCutBoxC.value.length); i++) {
    const C = U.uCutBoxC.value[i], H = U.uCutBoxH.value[i];
    const dx = x - C.x, dz = z - C.y;
    const P = [dx * C.z - dz * C.w, y, dx * C.w + dz * C.z];
    const F = [f.x * C.z - f.z * C.w, f.y, f.x * C.w + f.z * C.z].map((v) => Math.sign(v || 1) * Math.max(Math.abs(v), 1e-5));
    const lo = [-H.x, H.y, -H.w], hi = [H.x, H.z, H.w];
    if (P.every((v, k) => v > lo[k] && v < hi[k])) continue;
    let tN = -Infinity, tF = Infinity;
    for (let k = 0; k < 3; k++) {
      const a = (lo[k] - P[k]) / F[k], b = (hi[k] - P[k]) / F[k];
      tN = Math.max(tN, Math.min(a, b)); tF = Math.min(tF, Math.max(a, b));
    }
    if (tF > Math.max(tN, 0)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------- green dressing
// Builders for the v1 prop-library pieces the critic asked for on the bare town green (noticeboard, well, signpost,
// cart, pumpkins, flower barrel). layout.js does not place them yet (lead-owned): they build for any object of these
// kinds the layout routes to 'props', and `?propsExtra=1` previews them at the proposed tiles in PROPOSED below.
const PUMPKIN = ['#F0A050', '#E08A3A', '#7A4A44'];
const INK = '#4A4458';

/** Small pitched roof, ridge along x: two slabs from the ridge (y1) down to the eaves (y0) at z = +-d. */
function pitchRoof(b, { w, d, y0, y1, z = 0, tones = 'red', pattern = 'shingle', T = 0.06 }) {
  for (const s of [-1, 1]) {
    const zr = z, ze = z + s * d;
    b.hexa([V(-w / 2, y1 - T, zr), V(w / 2, y1 - T, zr), V(-w / 2, y1, zr), V(w / 2, y1, zr),
      V(-w / 2, y0 - T, ze), V(w / 2, y0 - T, ze), V(-w / 2, y0, ze), V(w / 2, y0, ze)], { tones, pattern, tint: s > 0 ? 1 : 0.94 });
  }
  b.box(w + 0.06, 0.06, 0.08, { tones: 'timber', at: [0, y1 - 0.02, z] });
}

function noticeboard(b, cx, cz) {
  b.push(M({ at: [cx, 0, cz] }));
  for (const s of [-1, 1]) {
    b.box(0.12, 2.0, 0.12, { tones: 'timber', at: [s * 0.82, 0, 0], ry: Math.PI / 4 });
    b.box(0.2, 0.1, 0.2, { tones: 'ashlar', at: [s * 0.82, 0, 0] });
  }
  // the board: plank back, timber frame (proud), cross rail under it
  b.box(1.5, 0.92, 0.06, { tones: 'plank', pattern: 'boards', scale: 0.5, at: [0, 0.8, 0.02] });
  for (const y of [0.77, 1.7]) b.box(1.58, 0.07, 0.1, { tones: 'timber', at: [0, y, 0.03] });
  for (const s of [-1, 1]) b.box(0.07, 0.96, 0.1, { tones: 'timber', at: [s * 0.76, 0.77, 0.03] });
  pitchRoof(b, { w: 1.95, d: 0.34, y0: 1.86, y1: 2.14, tones: 'slate' });
  // pinned notices (front face z ~ +0.07): a town decree, the red EXECUTION notice, a "seen at night" eye, a scrap
  const zf = 0.065;
  b.box(0.36, 0.44, 0.02, { tones: 'cream', at: [-0.46, 1.12, zf] });
  for (const [y, w2] of [[1.47, 0.24], [1.38, 0.26], [1.3, 0.2], [1.22, 0.26], [1.14, 0.16]]) b.box(w2, 0.045, 0.012, { tones: INK, at: [-0.46, y, zf + 0.012] });
  b.box(0.36, 0.48, 0.02, { tones: ['#E07070', '#D0505A', '#7A3848'], at: [0.0, 1.1, zf] });
  b.box(0.26, 0.05, 0.012, { tones: '#F2E8D0', at: [0, 1.48, zf + 0.012] });
  for (const r of [Math.PI / 4, -Math.PI / 4]) b.box(0.28, 0.06, 0.014, { tones: '#2A2834', origin: 'center', at: [0, 1.25, zf + 0.014], rz: r });
  b.prism(Array.from({ length: 8 }, (_, i) => oct(i, 0.045, 0.045)), 0.02, { tones: 'brass', at: [0.1, 1.15, zf + 0.016] });   // wax seal
  b.box(0.3, 0.32, 0.02, { tones: ['#F0E0B0', '#D8C490', '#8A8070'], at: [0.45, 1.3, zf] });
  b.prism(Array.from({ length: 8 }, (_, i) => oct(i, 0.09, 0.05)), 0.012, { tones: INK, at: [0.45, 1.48, zf + 0.012] });          // a drawn eye
  b.box(0.05, 0.05, 0.012, { tones: '#F0E0B0', at: [0.45, 1.455, zf + 0.022] });
  b.box(0.2, 0.18, 0.02, { tones: 'cream', tint: 0.95, at: [0.48, 0.9, zf] });
  b.pop();
  return { top: V(cx, 2.2, cz), front: V(cx, 0, cz + 0.9) };
}

function well(b, cx, cz) {
  b.push(M({ at: [cx, 0, cz] }));
  const n = LO ? 8 : 12;
  octSlab(b, { rx: 0.84, rz: 0.84, y0: -0.04, y1: 0.06, n, tones: 'ashlar' });
  octRing(b, { rx: 0.72, rz: 0.72, rxi: 0.52, rzi: 0.52, y0: 0.06, y1: 0.72, n, tones: 'stone', pattern: 'ashlar', scale: 0.7 });
  octRing(b, { rx: 0.77, rz: 0.77, rxi: 0.5, rzi: 0.5, y0: 0.72, y1: 0.8, n, tones: 'ashlar' });
  octSlab(b, { rx: 0.53, rz: 0.53, y0: 0.0, y1: 0.12, n, tones: 'stone', tint: 0.7 });
  for (const s of [-1, 1]) {
    b.box(0.12, 1.32, 0.12, { tones: 'timber', at: [s * 0.64, 0.78, 0] });
    b.box(0.2, 0.08, 0.2, { tones: 'timber', at: [s * 0.64, 0.74, 0] });
  }
  // windlass: square axle, wound rope drum, iron crank on the east side; rope + bucket hanging into the shaft
  b.box(1.36, 0.09, 0.09, { tones: 'timber', origin: 'center', at: [0, 1.62, 0] });
  b.box(0.36, 0.17, 0.17, { tones: 'thatch', tint: 0.85, origin: 'center', at: [0, 1.62, 0] });
  b.box(0.06, 0.24, 0.06, { tones: 'iron', at: [0.74, 1.4, 0.04] });
  b.box(0.16, 0.06, 0.06, { tones: 'iron', at: [0.8, 1.38, 0.04] });
  b.box(0.05, 0.42, 0.05, { tones: '#6C5A50', at: [0.08, 1.12, 0] });
  b.cylinder(0.12, 0.14, 0.18, { tones: 'plank', pattern: 'vboards', scale: 0.4, segments: 8, at: [0.08, 0.95, 0] });
  b.cylinder(0.15, 0.15, 0.05, { tones: 'iron', segments: 8, at: [0.08, 1.04, 0] });
  pitchRoof(b, { w: 1.62, d: 0.62, y0: 1.92, y1: 2.32, tones: 'red' });
  // a second bucket on the rim (lit west side) + moss at the foot
  b.cylinder(0.12, 0.14, 0.2, { tones: 'plank', pattern: 'vboards', scale: 0.4, segments: 8, at: [-0.42, 0.8, 0.48] });
  b.cylinder(0.145, 0.145, 0.05, { tones: 'iron', segments: 8, at: [-0.42, 0.9, 0.48] });
  b.box(0.36, 0.1, 0.06, { tones: 'mossTuft', layer: 'soft', at: [0.42, 0.06, 0.55], ry: -Math.PI / 4 });
  b.box(0.24, 0.08, 0.06, { tones: 'mossTuft', layer: 'soft', at: [-0.5, 0.06, -0.5], ry: Math.PI / 4 });
  b.pop();
  return { water: V(cx, 0.5, cz), rim: V(cx - 0.6, 0.8, cz), top: V(cx, 2.34, cz), front: V(cx, 0, cz + 1.2) };
}

function signpost(b, cx, cz) {
  b.push(M({ at: [cx, 0, cz] }));
  b.box(0.12, 2.1, 0.12, { tones: 'timber', at: [0, 0, 0], ry: Math.PI / 4 });
  b.box(0.22, 0.12, 0.22, { tones: 'ashlar', at: [0, 0, 0] });
  b.hexa([V(-0.11, 2.1, -0.11), V(0.11, 2.1, -0.11), V(0, 2.26, 0), V(0, 2.26, 0), V(-0.11, 2.1, 0.11), V(0.11, 2.1, 0.11), V(0, 2.26, 0), V(0, 2.26, 0)], { tones: 'timber' });
  // arrow boards: east (to the square), west (to the mill), south-east (down the lane) - cream lettering
  const arrow = (y, dir, len, ry = 0) => {
    b.push(M({ at: [0, y, 0.08], ry }));
    b.box(len, 0.17, 0.05, { tones: 'plank', tint: 1.06, origin: 'center', at: [dir * (len / 2 + 0.02), 0, 0] });
    b.prism([[0, 0.13], [0.16, 0], [0, -0.13]].map(([x, yy]) => [dir * x, yy]), 0.05, { tones: 'plank', tint: 1.06, at: [dir * (len + 0.02), 0, 0] });
    b.box(len * 0.62, 0.05, 0.012, { tones: 'cream', at: [dir * (len / 2), -0.025, 0.03] });
    b.pop();
  };
  arrow(1.84, 1, 0.62);
  arrow(1.56, -1, 0.56);
  arrow(1.28, 1, 0.5, -Math.PI / 4);
  b.pop();
  return { top: V(cx, 2.28, cz) };
}

function cart(b, cx, cz, burlap) {
  b.push(M({ at: [cx, 0, cz] }));
  // bed + plank sides
  b.box(1.3, 0.08, 0.78, { tones: 'plank', pattern: 'boards', scale: 0.5, at: [0.1, 0.5, 0] });
  for (const s of [-1, 1]) b.box(1.3, 0.24, 0.06, { tones: 'plank', tint: 0.96, at: [0.1, 0.58, s * 0.36] });
  for (const s of [-1, 1]) b.box(0.06, 0.24, 0.66, { tones: 'plank', tint: 0.96, at: [0.1 + s * 0.62, 0.58, 0] });
  // handles sloping down to the ground on the west, axle block
  for (const s of [-1, 1]) b.box(0.74, 0.07, 0.07, { tones: 'timber', origin: 'center', at: [-0.74, 0.28, s * 0.3], rz: Math.PI / 4 });
  b.box(0.12, 0.12, 0.9, { tones: 'timber', origin: 'center', at: [0.2, 0.37, 0] });
  // wheels on both sides: iron rim disc, wooden face, 4 spokes, hub (front wheel is face-on at yaw 0)
  const disc = (r, n = LO ? 12 : 16) => Array.from({ length: n }, (_, i) => { const a = ((i + 0.5) * TAU) / n; return [Math.sin(a) * r, Math.cos(a) * r]; });
  for (const s of [-1, 1]) {
    const z = s * 0.47;
    b.prism(disc(0.37), 0.05, { tones: 'iron', at: [0.2, 0.37, z] });
    b.prism(disc(0.3), 0.06, { tones: 'plank', tint: 0.92, at: [0.2, 0.37, z + s * 0.005] });
    for (const r of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4]) b.box(0.56, 0.055, 0.03, { tones: 'timber', origin: 'center', at: [0.2, 0.37, z + s * 0.045], rz: r });
    b.prism(disc(0.075, LO ? 8 : 16), 0.08, { tones: 'iron', at: [0.2, 0.37, z + s * 0.05] });
  }
  // the load: a hay bale, a sack, two pumpkins
  b.box(0.56, 0.3, 0.5, { tones: 'thatch', pattern: 'thatch', layer: 'soft', at: [0.32, 0.58, -0.04] });
  b.box(0.5, 0.06, 0.06, { tones: '#6C5A50', layer: 'soft', at: [0.32, 0.88, -0.04] });
  sack(b, -0.2, 0.58, 0.02, burlap);
  for (const [px, pz, r] of [[0.32, 0.18, 0.13], [-0.36, -0.18, 0.12]]) {
    b.cylinder(r, r * 0.9, r * 1.2, { tones: PUMPKIN, segments: 8, at: [px, px > 0 ? 0.88 : 0.58, pz] });
    b.box(0.05, 0.07, 0.05, { tones: 'moss', at: [px, (px > 0 ? 0.88 : 0.58) + r * 1.2, pz] });
  }
  b.pop();
  return { top: V(cx + 0.32, 0.95, cz - 0.04) };
}

function pumpkins(b, cx, cz) {
  b.push(M({ at: [cx, 0, cz] }));
  const one = (x, z, r, h) => {
    b.cylinder(r * 0.8, r, h * 0.5, { tones: PUMPKIN, segments: 8, at: [x, 0, z] });
    b.cylinder(r, r * 0.7, h * 0.5, { tones: PUMPKIN, segments: 8, at: [x, h * 0.5, z] });
    b.box(0.05, 0.08, 0.05, { tones: 'moss', at: [x + 0.01, h, z] });
    b.box(0.08, 0.05, 0.05, { tones: 'leaf', layer: 'soft', at: [x + 0.06, h + 0.02, z] });
  };
  one(-0.22, -0.12, 0.2, 0.3);
  one(0.24, -0.06, 0.15, 0.24);
  one(0.0, 0.2, 0.23, 0.34);
  // the front one is a carved jack-o'-lantern: dark cut-outs by day, a flickering candle face at night
  const g = { layer: 'glass', tones: '#3A2A1A', glow: '#FFB040', glowKind: 2 };
  const zf = 0.2 + 0.23 * Math.cos(Math.PI / 8) + 0.004;
  for (const s of [-1, 1]) b.box(0.07, 0.06, 0.02, { ...g, at: [s * 0.075, 0.2, zf] });
  b.box(0.2, 0.05, 0.02, { ...g, at: [0, 0.1, zf] });
  b.box(0.05, 0.03, 0.02, { ...g, at: [0, 0.15, zf] });
  b.pop();
  return { top: V(cx, 0.36, cz + 0.2) };
}

function flowerBarrel(b, cx, cz, seed) {
  b.push(M({ at: [cx, 0, cz] }));
  const seg = LO ? 8 : 16;
  b.cylinder(0.27, 0.31, 0.46, { tones: 'plank', pattern: 'vboards', scale: 0.6, segments: seg, at: [0, 0, 0] });
  b.cylinder(0.33, 0.33, 0.06, { tones: 'iron', segments: seg, at: [0, 0.32, 0] });
  b.cylinder(0.3, 0.3, 0.06, { tones: 'iron', segments: seg, at: [0, 0.08, 0] });
  b.cylinder(0.28, 0.2, 0.12, { tones: 'leaf', layer: 'soft', segments: 8, at: [0, 0.46, 0] });
  const r = rng(seed * 31 + 7), FL = ['#D0505A', '#EDEBDA', '#A875D7', '#E6D36A'];
  for (let i = 0; i < 9; i++) {
    const a = (i * TAU) / 9 + r() * 0.3, rr = 0.06 + r() * 0.18;
    b.box(0.07, 0.07, 0.07, { tones: FL[(i + seed) % 4], layer: 'soft', at: [Math.sin(a) * rr, 0.55 + r() * 0.08, Math.cos(a) * rr] });
  }
  for (const [dx, dz, len] of [[-0.24, 0.16, 0.18], [0.2, 0.2, 0.22]]) b.box(0.05, len, 0.05, { tones: 'leaf', layer: 'soft', tint: 1.05, at: [dx, 0.5 - len, dz] });
  b.pop();
  return { top: V(cx, 0.62, cz) };
}

/** Proposed placements (anchor tile = top-left of the rect; rect w x d in tiles) for layout.js - see contract_requests. */
export const PROPOSED = [
  { kind: 'noticeboard', x: 11, z: 19, w: 2, d: 1 },      // west green by the square kerb, beside the bench (south of it the tower house at 11..14,29..33 hides z >= 23)
  { kind: 'well', x: 15, z: 11, w: 2, d: 2 },             // north-west green (clear of the red stall's sight shadow)
  { kind: 'signpost', x: 39, z: 17, w: 1, d: 1 },         // east lane (row 18) toward the square; the SW fork tiles are hidden by the lower-ring houses
  { kind: 'cart', x: 36, z: 15, w: 2, d: 1 },             // beside the gold stall
  { kind: 'pumpkins', x: 33, z: 22, w: 1, d: 1 },         // by the east bench
  { kind: 'flowerbarrel', x: 8, z: 22, w: 1, d: 1 },      // by the west bench
];

// ---------------------------------------------------------------------------------------------- lamp light pools
/**
 * Baked warm pools under the street lamps: one flat 24-gon disc per lamp, 3.5 cm above the ground, drawn ADDITIVELY
 * (colour only, LAYERS.COLOR_ONLY: never in the normal / outline pass, no depth write) as 3 hard concentric rings
 * computed in world space (whole-texel pans rasterise identically: no crawl). Each lamp's ring brightness follows
 * the intensity of its composer PointLight (so the composer's flicker and life's lamplighter / dusk cycle drive it
 * for free), read in onBeforeRender = after every update of the frame. No PointLight -> the night-glow switch.
 */
// ring radii in the disc's own units (the cut-away patch scales them by 1/1.25 in the town: core ~1.9 m across, then
// 1.5 / 2.1 m bands + its dithered outer band to ~2.45 m); the lamp PointLight is brighter than the 1.4 default too
const POOL_RINGS = [1.2, 1.9, 2.6];
const POOL_LEVELS = [1.0, 0.62, 0.32];
const LAMP_I = 2.0;
function lampPools(engine, lamps, ctx) {
  const n = lamps.length, seg = 24;
  const pos = [], ctr = [], idx = [];
  lamps.forEach((L, i) => {
    const y = (ctx.heightAt?.(L.base.x, L.base.z) ?? 0) + 0.035, R = POOL_RINGS[2] + 0.05;
    for (let k = 0; k < seg; k++) {
      const a0 = (k * TAU) / seg, a1 = ((k + 1) * TAU) / seg;
      pos.push(L.base.x, y, L.base.z, L.base.x + Math.sin(a0) * R, y, L.base.z + Math.cos(a0) * R, L.base.x + Math.sin(a1) * R, y, L.base.z + Math.cos(a1) * R);   // CCW from above
      for (let v = 0; v < 3; v++) { ctr.push(L.base.x, L.base.z); idx.push(i); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(ctr, 2));
  g.setAttribute('aLamp', new THREE.Float32BufferAttribute(idx, 1));
  const uPool = { value: new Array(Math.max(8, n)).fill(0) };
  const mat = new THREE.ShaderMaterial({
    name: 'props-lamp-pools',
    uniforms: {
      uPassMode: engine.uniforms.uPassMode, uPool,
      // the scene target holds display-space colour: a pure add turns teal grass olive, so each ring first scales
      // the ground down (cool cancelled) and then adds the warm lamp tone: out = warm*lv*g + dst*(1 - keep*lv*g)
      uWarm: { value: new THREE.Vector3(0.6, 0.35, 0.1) }, uKeep: { value: 0.56 },
      uRings: { value: new THREE.Vector3(...POOL_RINGS) }, uLevels: { value: new THREE.Vector3(...POOL_LEVELS) },
    },
    vertexShader: /* glsl */`
      attribute vec2 aCenter; attribute float aLamp;
      uniform float uPool[${Math.max(8, n)}];
      varying vec2 vRel; varying float vGain;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vRel = position.xz - aCenter;
        vGain = uPool[int(aLamp + 0.5)];
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform int uPassMode; uniform vec3 uWarm, uRings, uLevels; uniform float uKeep;
      varying vec2 vRel; varying float vGain;
      void main() {
        if (uPassMode == 1 || vGain <= 0.001) discard;
        float d = length(vRel);
        float lv = d < uRings.x ? uLevels.x : d < uRings.y ? uLevels.y : d < uRings.z ? uLevels.z : 0.0;
        if (lv <= 0.0) discard;
        float k = lv * vGain;
        gl_FragColor = vec4(uWarm * k, 1.0 - uKeep * min(k, 1.0));
      }`,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'props-lamp-pools';
  mesh.layers.set(LAYERS.COLOR_ONLY);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  const state = { mesh, night: 0, lit: true, override: new Array(n).fill(null) };
  // golden hour: the lamps are lit but the ground is sunlit - a softer pool
  const soft = ctx.tod !== 'night';
  if (soft) { mat.uniforms.uWarm.value.set(0.18, 0.1, 0.035); mat.uniforms.uKeep.value = 0.15; }   // unchanged golden tone
  let found = null;
  mesh.onBeforeRender = () => {
    if (!found) {
      const grp = engine.scene.getObjectByName('town-lights');
      if (grp) {
        found = lamps.map((L) => grp.children.find((pl) => pl.isPointLight && pl.position.distanceToSquared(L.pos) < 1e-6) ?? null);
      }
    }
    for (let i = 0; i < n; i++) {
      const pl = found?.[i];
      let f = pl ? Math.min(1.2, pl.intensity / LAMP_I) : state.night > 0.5 ? 1 : 0;
      if (state.night < 0.5 || !state.lit) f = 0;
      if (state.override[i] !== null && state.override[i] !== undefined) f = state.override[i];
      uPool.value[i] = f;
    }
  };
  return state;
}

// ---------------------------------------------------------------------------------------------- build
export default function build(engine, ctx) {
  LO = ctx.quality === 'low';
  const b = new Builder(engine, { name: 'props' });
  // small props: their own no-cast Builder at low; the main Builder at high (high output unchanged)
  const sm = LO ? new Builder(engine, { name: 'props-small' }) : b;
  // ?propsExtra=1: preview the proposed green dressing (PROPOSED) until layout.js places it
  const extra = ctx.params?.get?.('propsExtra') === '1'
    ? PROPOSED.map((p) => ({ kind: p.kind, x: p.x, z: p.z, rect: { x: p.x, z: p.z, w: p.w, d: p.d }, center: { x: p.x + p.w / 2, z: p.z + p.d / 2 }, owner: 'props' }))
    : [];
  const objs = [...ctx.record.objects, ...extra];
  const wells = [];
  let dressN = 0;
  const burlap = paintRamp('#8a744c', { lightness: 0.5 });
  const lights = [], seats = [], perches = [], spots = {}, lamps = [];
  const stallInfo = {};
  let barrelN = 0, benchN = 0;
  const w = new Builder(engine, { name: 'props-wares' });       // stall wares: cast, but receive no awning shade
  // one gothic-cozy detail per lamp (deterministic): 2 flower baskets, the rest cresting crowns / ribbon bows
  const nLamps = objs.filter((o) => o.kind === 'lamp').length;
  const variants = Array.from({ length: nLamps }, (_, i) => (i < 2 ? 'basket' : i < 3 ? 'ribbon' : i % 2 ? 'cresting' : 'ribbon'));
  { const r = rng(ctx.seed ^ 0x51a7); for (let i = variants.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [variants[i], variants[j]] = [variants[j], variants[i]]; } }

  const trisByKind = {};
  const layerTris = () => [b, w, ...(sm === b ? [] : [sm])].reduce((t, B) => t + B.stats().tris, 0);
  for (const o of objs) {
    const { x, z } = o.center;
    const t0 = layerTris();
    switch (o.kind) {
      case 'lamp': {
        const i = lamps.length;
        const L = lamp(b, x, z, variants[i], i, sm);
        L.variant = variants[i];
        lamps.push(L);
        lights.push({ pos: L.pos, color: ctx.palette.lampGlow, r: 5.5, intensity: LAMP_I, kind: 'lamp', flicker: true, id: `lamp${i}` });
        perches.push(L.top);
        spots[`lamp${i}`] = L.pos; spots[`lampBase${i}`] = L.base;
        break;
      }
      case 'bench': {
        seats.push(...bench(sm, x, z));
        if (benchN === 0) {
          // someone left a book on the west bench (plum cover, cream pages)
          sm.box(0.23, 0.05, 0.16, { tones: 'plum', at: [x + 0.52, 0.47, z + 0.04] });
          sm.box(0.2, 0.025, 0.14, { tones: 'cream', at: [x + 0.53, 0.52, z + 0.04] });
          sm.box(0.23, 0.035, 0.16, { tones: 'plum', tint: 1.04, at: [x + 0.52, 0.545, z + 0.04] });
        }
        spots[`bench${benchN++}`] = V(x, 0, z + 0.6);
        break;
      }
      case 'barrel': {
        const open = x < 15;               // the greengrocer's apple barrel; the cart-road one is a water butt
        const top = barrel(sm, x, z, { open, seed: barrelN });
        perches.push(top);
        spots[`barrel${barrelN++}`] = top;
        break;
      }
      case 'crates': {
        // rect 2 x 1: two crates side by side, one on top, a sack slumped on the right one
        crate(sm, x - 0.48, 0, z + 0.02, 0.66, { brace: 1 });
        crate(sm, x + 0.3, 0, z + 0.06, 0.58, { brace: -1, tint: 0.97 });
        crate(sm, x - 0.36, 0.66, z - 0.02, 0.56, { brace: -1, tint: 1.02 });
        sack(sm, x + 0.36, 0.58, z + 0.08, burlap);
        spots.crates = V(x - 0.36, 1.22, z - 0.02);
        perches.push(V(x - 0.36, 1.22, z - 0.02));
        break;
      }
      case 'stall_red': case 'stall_gold': {
        const S = stall(b, w, x, z, o.kind, burlap, sm);
        stallInfo[o.kind] = S;
        spots[o.kind === 'stall_red' ? 'stallRed' : 'stallGold'] = S.spot;
        perches.push(S.ridge);
        break;
      }
      case 'fountain': {
        fountainBasin(b, x, z);
        spots.fountain = V(x, FT.level, z);
        spots.fountainTop = V(x, FT.bowl + 0.6, z);
        spots.fountainCenter = V(x, 0, z);
        [[0, 1], [1, 0], [-1, 0], [0, -1]].forEach(([dx, dz], i) => { spots[`fountainSpout${i}`] = V(x + dx * 0.5, FT.bowl + 0.22, z + dz * 0.5); });
        perches.push(V(x, FT.bowl + 0.6, z), V(x - FT.rx + 0.1, FT.top + 0.08, z), V(x + FT.rx - 0.1, FT.top + 0.08, z));
        break;
      }
      case 'noticeboard': { const N = noticeboard(b, x, z); perches.push(N.top); spots.noticeboard = N.front; break; }
      case 'well': { const Wl = well(b, x, z); wells.push(Wl); perches.push(Wl.top, Wl.rim); spots.well = Wl.front; spots.wellWater = Wl.water; break; }
      case 'signpost': { const Sg = signpost(b, x, z); perches.push(Sg.top); spots.signpost = V(x, 0, z + 0.6); break; }
      case 'cart': { const C = cart(b, x, z, burlap); perches.push(C.top); spots.cart = V(x, 0, z + 0.9); break; }
      case 'pumpkins': { const P = pumpkins(sm, x, z); perches.push(P.top); break; }
      case 'flowerbarrel': { const Fb = flowerBarrel(sm, x, z, dressN++); perches.push(Fb.top); break; }
      default: break;
    }
    trisByKind[o.kind] = (trisByKind[o.kind] ?? 0) + layerTris() - t0;
  }

  const group = b.build();
  const mainGlass = group.children.find((m) => m.userData.layer === 'glass');
  for (const m of w.build({ name: 'props-wares', receiveShadow: false }).children.slice()) group.add(m);
  // low: the small props (incl. the jack-o'-lantern's glass) receive but never cast
  const smallGlass = [];
  if (sm !== b) for (const m of sm.build({ name: 'props-small', castShadow: false }).children.slice()) { group.add(m); if (m.userData.layer === 'glass') smallGlass.push(m); }
  // night: baked warm light pools under the lamps (1 additive call, synced to each lamp's PointLight)
  const pools = lamps.length ? lampPools(engine, lamps, ctx) : null;
  if (pools) group.add(pools.mesh);

  // ---- animated parts
  const fountain = objs.find((o) => o.kind === 'fountain');
  const phases = [];
  let water = null, bowl = null;
  if (fountain) {
    const { x, z } = fountain.center;
    for (let ph = 0; ph < 4; ph++) { const m = streamPhase(engine, x, z, ph); m.visible = ph === 0; phases.push(m); group.add(m); }
    // real water (post pass, no reflection render: cheap) in the basin and the upper bowl
    const terrain = ctx.registry?.get('ground')?.api?.terrain ?? null;
    const poly = (rx, rz, n = 8) => Array.from({ length: n }, (_, i) => { const [px, pz] = oct(i, rx, rz, n); return [x + px, z + pz]; });
    water = createWater(engine, terrain, {
      name: 'water-fountain', level: FT.level, shape: { kind: 'polygon', points: poly(FT.rx - FT.wall, FT.rz - FT.wall) },
      depthMax: 0.24, reflection: false, waveCell: 0.7, waveLen: 3, sparkleCell: 0.35, foam: 0.3,
    });
    bowl = createWater(engine, terrain, {
      name: 'water-fountain-bowl', level: FT.bowl + 0.205, shape: { kind: 'polygon', points: poly(0.38, 0.38, 16) },
      depthMax: 0.12, reflection: false, waves: false, sparkleCell: 0.3, foam: 0,
    });
  }
  const wellWater = wells.map((Wl, i) => createWater(engine, ctx.registry?.get('ground')?.api?.terrain ?? null, {
    name: `water-well-${i}`, level: 0.5, shape: { kind: 'polygon', points: Array.from({ length: 12 }, (_, k) => { const [px, pz] = oct(k, 0.5, 0.5, 12); return [Wl.water.x + px, Wl.water.z + pz]; }) },
    depthMax: 0.35, reflection: false, waves: false, sparkleCell: 0.3, foam: 0, deep: '#3E6A8E',
  }));
  for (const wb of [water, bowl, ...wellWater]) cutWater(engine, wb);
  const swingers = [];
  for (const [kind, S] of Object.entries(stallInfo)) {
    const red = kind === 'stall_red';
    for (const [what, hook] of Object.entries(S.hooks)) {
      const pivot = new THREE.Group();
      pivot.name = `props-${kind}-${what}`;
      pivot.position.copy(hook);
      if (what === 'garlic') pivot.add(garlicString(engine));
      else {
        pivot.add(hangLantern(engine, `props-${kind}-lantern`));
        lights.push({ pos: hook.clone().add(V(0, -0.5, 0)), color: ctx.palette.lampGlow, r: 2.8, kind: 'lantern', flicker: true, id: red ? 'stallLanternRed' : 'stallLantern' });
        spots[red ? 'stallRedLantern' : 'stallGoldLantern'] = hook.clone().add(V(0, -0.5, 0));
      }
      group.add(pivot);
      swingers.push({ pivot, phase: what === 'garlic' ? 0 : red ? 5 : 3, amp: what === 'garlic' ? 0.1 : 0.07 });
    }
  }
  // night water: the water pass tints by the sky's luminance, which at night drops the basin to a near-black hole.
  // Hold a moonlit floor under it (v1 water ramp ~#3A6080) and turn the sparkles into brighter, denser moon glints.
  const moonlit = ctx.tod === 'night';
  for (const wb of [water, bowl, ...wellWater]) {
    if (!wb || !moonlit) continue;
    const base = wb.pass.update;
    const L = wb.uniforms.uLight.value;
    wb.uniforms.uSparkCol.value.setRGB(1.7, 1.8, 1.95);
    wb.uniforms.uSparkRate.value = 0.09;
    wb.pass.update = (eng) => { base?.(eng); L.setRGB(Math.max(L.r, 0.42), Math.max(L.g, 0.5), Math.max(L.b, 0.62)); };
  }

  let fountainOn = true, streamPh = 0;
  // the streams vanish with the bowl / column they hang from when the cut-away takes those (decided after every
  // updater ran - the cut uniforms are final - just before the colour pass)
  const fc = fountain?.center;
  const streamsShown = () => fountainOn && !(fc && (cutAt(engine, fc.x, FT.bowl + 0.2, fc.z) || cutAt(engine, fc.x, FT.floor + 0.6, fc.z)));
  if (fountain) engine.pipeline.preRender.push(() => { const on = streamsShown(); phases.forEach((m, i) => { m.visible = on && i === streamPh; }); });
  const update = (t) => {
    const ph = Math.floor(t * 6) % 4;                  // falling water: 6 fps, 4 phases
    streamPh = ph;
    phases.forEach((m, i) => { m.visible = fountainOn && i === ph; });
    for (const s of swingers) s.pivot.rotation.z = s.amp * swayAt(t, 3, s.phase);   // stepped 3 fps sway
    if (pools) pools.night = ctx.kit.nightGlow(engine);
  };
  update(0);

  return {
    group,
    update,
    anchors: { lights, seats, perches, spots },
    api: {
      lamps,
      water: { basin: water, bowl },
      setLampsLit(on) { for (const m of [mainGlass, ...smallGlass]) if (m) ctx.kit.setGlowLit(m, on); if (pools) pools.lit = !!on; },
      /** Per-lamp pool gain 0..1 override (null = follow the lamp's PointLight). */
      setLampPool(i, f) { if (pools) pools.override[i] = f; },
      setFountain(on) { fountainOn = !!on; if (water) water.pass.enabled = !!on; if (bowl) bowl.pass.enabled = !!on; },
    },
    stats: { lamps: lamps.length, objects: objs.length, trisByKind, quality: LO ? 'low' : 'high' },
  };
}
