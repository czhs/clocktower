// Honk (char-honk) — cast member "honk", mascot 15-122: "A grey goose with contracts to check."
// Design sheet (incl. ## Unique to me, ## Self-critique): characters/honk.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/honk.ts + refs/cast/honk.png.
// Body plan: BIRD (horizontal egg body, thin black neck, folded wing paddles, short orange legs) on a hand-built
// skeleton with the bird() bone names, driven by LegGait 'bird': walk = alternating WADDLE (body roll over the planted
// foot, neck thrust, bob), run = two-footed hop. The thigh is hidden in the body (Z-folded leg: hip 0.42 m, knee
// inside the egg) so the LegGait reach drop does not seat the goose on the grass.
// The clipboard rides a 'board' bone on the chest, LEFT flank (v2 S/SE: screen right), keyed with board.p in clips.
// Everything is keyed (no spring chains): loop clips run dynamics free (backlog M5).
// Geometry is authored in CHARACTER-SPACE rest coordinates (W) and bound with `at = −joint`.
// Structure: palette → skeleton → geometry helpers → parts → clips → spec.
import * as THREE from 'three';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.24;                  // v2 31 px × 0.04 m (top of the head)
export const V_GAME = 3.95 * HEIGHT;         // 4.90 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB (v1 honk.ts colours; near-black lifted to the night floor on sh only)
export const PALETTE = {
  neck: ['#554D5F', '#423A4A', '#3A3042'],   // neck, head, tail, primaries, brows (v1 NECK #37323C)
  body: ['#A89C8A', '#857A6C', '#5E5464'],   // back / flank egg (v1 BODY)
  wing: ['#8E826E', '#6C6052', '#4E4038'],   // folded wing coverts (v1 WING), warm sh ≠ body's mauve sh
  belly: ['#E8E0D2', '#C4BCAE', '#8E8698'],  // breast / belly / rump (v1 BELLY)
  beak: ['#F6AE5C', '#E08A32', '#A65A3C'],   // accent: beak, legs, feet, clip, tick (v1 BEAK)
  board: ['#B07A4A', '#8A5A32', '#5E3C3A'],  // story prop: clipboard (v1 BOARD)
  cream: ['#FAF4E8', '#EFE8DC', '#B4AAB0'],  // story prop + face: chinstrap, eyes, paper (v1 CHEEK / PAPER)
  halo: ['#FFEFA8', '#F2C65A', '#B8863A'],   // (t1) ghost halo ring only (v1 ghost row: gold bar over the head)
};

// ── head lathe (8 sides, flat face to +Z, depth × HEAD_SZ); headSurf(θ, y, d) = a point on its surface ──
const HEAD_BASE = [0, 0.96, 0.25];          // head lathe base (y = bottom of the skull)
const HEAD_P = [[0.06, 0], [0.11, 0.04], [0.125, 0.11], [0.12, 0.17], [0.092, 0.235], [0.04, 0.268], [0, 0.275]];
const HEAD_SZ = 1.22;
const R2D = Math.PI / 180;
const headR = (y) => { for (let i = 1; i < HEAD_P.length; i++) if (y <= HEAD_P[i][1]) { const [r0, y0] = HEAD_P[i - 1], [r1, y1] = HEAD_P[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0; };
/** θ degrees from +Z toward +X (character's left), y above the skull base, d metres proud of the surface. */
function headSurf(th, y, d = 0) {
  const face = Math.round(th / 45) * 45, R = headR(y) * Math.cos(22.5 * R2D) / Math.cos((th - face) * R2D) + d;
  return [HEAD_BASE[0] + R * Math.sin(th * R2D), HEAD_BASE[1] + y, HEAD_BASE[2] + R * Math.cos(th * R2D) * HEAD_SZ];
}
const EYE = { th: 46, y: 0.17, rth: 20, ry: 0.04 };

// ── skeleton: joint positions in character space (rest), parent, axis ──
const J = {
  body: [0, 0.40, -0.02], chest: [0, 0.52, 0.10], neck: [0, 0.60, 0.17], neck1: [0, 0.79, 0.205], head: [0, 0.975, 0.215],
  jaw: [0, 1.045, 0.36], eyeL: headSurf(EYE.th, EYE.y), xeyeL: headSurf(EYE.th, EYE.y), browL: headSurf(46, 0.205),
  upperArmL: [0.215, 0.565, 0.10], forearmL: [0.25, 0.52, -0.12], handL: [0.245, 0.535, -0.29],
  thighL: [0.09, 0.42, 0.0], shinL: [0.09, 0.27, 0.17], footL: [0.09, 0.045, 0.02],
  tail0: [0, 0.52, -0.30], board: [0.335, 0.37, 0.15],
};
const HALO_K = 0.001;                         // (t1) ghost halo authored scale (see skeleton())
const HALO_J = [0, 0.13, 0.035];              // halo joint, head-local (world ≈ [0, 1.105, 0.25]: inside the skull)
const HALO_UP = 0.30;                         // ring height over the joint once grown (world y ≈ 1.40, crown 1.235)
const mx = (p) => [-p[0], p[1], p[2]];
for (const k of Object.keys(J)) if (k.endsWith('L')) J[k.slice(0, -1) + 'R'] = mx(J[k]);
const BONES = [
  ['body', null, 'up'], ['chest', 'body', 'up'], ['neck', 'chest', 'up'], ['neck1', 'neck', 'up'], ['head', 'neck1', 'up'],
  ['jaw', 'head', 'fwd'], ['tail0', 'body', 'back'], ['board', 'chest', 'up'],
  ...['L', 'R'].flatMap((s) => [
    [`eye${s}`, 'head', 'fwd'], [`xeye${s}`, 'head', 'fwd'], [`brow${s}`, 'head', 'out'],
    [`upperArm${s}`, 'chest', 'back'], [`forearm${s}`, `upperArm${s}`, 'back'], [`hand${s}`, `forearm${s}`, 'back'],
    [`thigh${s}`, 'body', 'down'], [`shin${s}`, `thigh${s}`, 'down'], [`foot${s}`, `shin${s}`, 'fwd'],
  ]),
];
export function skeleton() {
  const S = BONES.map(([name, parent, axis]) => {
    const p = J[name], q = parent ? J[parent] : [0, 0, 0];
    const b = { name, pos: [p[0] - q[0], p[1] - q[1], p[2] - q[2]], axis };
    if (parent) b.parent = parent;
    return b;
  });
  // (t1, ghost) HALO bone, joint buried inside the skull. Its ring is authored at HALO_K scale around the joint (a speck
  // inside the head: never seen while alive); 'ghost' keys 'halo.s' = 1/HALO_K − 1 to grow it to full size over the
  // crown. Its world scale relative to the head is also the GHOST SIGNAL the shader reads (GHOST_GLSL): 1 alive,
  // 2 = ghost-spent, 1/HALO_K = ghost (vote unspent, halo shown). Appended LAST: every other bone keeps its index and
  // every living render stays pixel-identical (A/B in honk.md).
  S.push({ name: 'halo', parent: 'head', pos: HALO_J, axis: 'up' });
  return S;
}

// ── geometry helpers ──
const D = 180 / Math.PI;
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const sub = (a, b) => a.map((x, i) => x - b[i]);
// lathe placed with its BASE (profile y 0) at `base` (K.lathe centres on the bbox)
function latheAt(P, n, o, base) {
  const g = K.lathe(P, n, o); g.computeBoundingBox();
  return g.translate(base[0], base[1] - g.boundingBox.min.y, base[2]);
}
// in-plane subdivision (coplanar pieces → shading unchanged) + split by centroid predicates: patterns cut OUT of the
// surface (coincident, no inner-line ring) — CHARACTER_LEARNINGS §Silhouette (mushroom cap spots, owl disc)
function subdivide(geo, maxEdge) {
  const p = geo.attributes.position.array, out = [];
  const rec = (a, b, c, d) => {
    const e = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const lab = e(a, b), lbc = e(b, c), lca = e(c, a), mm = Math.max(lab, lbc, lca);
    if (mm <= maxEdge || d > 8) { out.push(...a, ...b, ...c); return; }
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    if (mm === lab) { const q = mid(a, b); rec(a, q, c, d + 1); rec(q, b, c, d + 1); }
    else if (mm === lbc) { const q = mid(b, c); rec(a, b, q, d + 1); rec(a, q, c, d + 1); }
    else { const q = mid(c, a); rec(a, b, q, d + 1); rec(q, b, c, d + 1); }
  };
  for (let i = 0; i < p.length; i += 9) rec([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], 0);
  return out;
}
function splitTris(arr, ...preds) {
  const bins = preds.map(() => []), rest = [];
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    const k = preds.findIndex((f) => f(c));
    (k >= 0 ? bins[k] : rest).push(...arr.slice(i, i + 9));
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  return [...bins.map(mk), mk(rest)];
}
// box-section hull from a to b (world points), cross-section w (across, ⟂ in the horizontal plane) × d
function seg(a, b, w, d, extend = 0) {
  const u = norm(sub(b, a));
  const A = a.map((x, i) => x - u[i] * extend), B = b.map((x, i) => x + u[i] * extend);
  const side = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : norm([u[2], 0, -u[0]]);
  const up = norm([u[1] * side[2] - u[2] * side[1], u[2] * side[0] - u[0] * side[2], u[0] * side[1] - u[1] * side[0]]);
  const pts = [];
  for (const P of [A, B]) for (const s of [-1, 1]) for (const q of [-1, 1]) pts.push(P.map((x, i) => x + side[i] * s * w / 2 + up[i] * q * d / 2));
  return K.hull(pts);
}
// a wing feather plate between a and b lying on the flank: vertical extents [top, bottom] at each end, thickness t (x)
function plate(a, b, top0, bot0, top1, bot1, t, x1 = null) {
  const pts = [];
  for (const [P, top, bot] of [[a, top0, bot0], [b, top1, bot1]]) for (const dy of [top, bot]) for (const s of [-1, 1])
    pts.push([P[0] + s * t / 2, P[1] + dy, P[2]]);
  return K.hull(pts);
}

// ── parts ──
const EGG_C = [0, 0.40, -0.02];
// r2: primaries folded down and in along the rump (were [0.215, 0.575, -0.47]: two dark prongs beside the body at S)
const WING_TIP = [0.15, 0.47, -0.44];
const EGG_P = [[0, -0.33], [0.12, -0.30], [0.2, -0.23], [0.25, -0.11], [0.262, 0.02], [0.248, 0.13], [0.205, 0.225], [0.12, 0.295], [0, 0.325]];

export function parts() {
  const P = [];
  const add = (bone, shape, color, name, extra = {}) => { const j = J[bone]; P.push({ bone, shape, at: [-j[0], -j[1], -j[2]], color, name, ...extra }); };

  // ── body egg (lathe along z), pale belly + breast cut out of its own surface ──
  const egg = K.xf(K.lathe(EGG_P, 10, { sz: 0.88 }), { rot: [90, 0, 0], at: EGG_C });
  const inBelly = (c) => { const y = c[1] - EGG_C[1], z = c[2] - EGG_C[2]; return y < -0.07 + 0.12 * z || (z > 0.16 && Math.abs(c[0]) < 0.15 && y < 0.2); };
  const inRump = (c) => { const y = c[1] - EGG_C[1], z = c[2] - EGG_C[2]; return z < -0.25 && y > -0.08 && y < 0.06 && Math.abs(c[0]) < 0.12; };
  const [bellyG, rumpG, backG] = splitTris(subdivide(egg, 0.05), inBelly, inRump);
  add('body', backG, 'body', 'back');
  add('body', bellyG, 'belly', 'belly');
  add('body', rumpG, 'belly', 'rump');

  // ── tail: black wedge up and back ──
  add('tail0', K.hull([[0.08, 0.49, -0.27], [-0.08, 0.49, -0.27], [0.08, 0.58, -0.29], [-0.08, 0.58, -0.29],
    [0.05, 0.62, -0.47], [-0.05, 0.62, -0.47], [0.04, 0.655, -0.45], [-0.04, 0.655, -0.45]]), 'neck', 'tail');

  // ── neck (2 links) and head ──
  add('neck', seg([0, 0.55, 0.15], J.neck1, 0.135, 0.135, 0.02), 'neck', 'neck0');
  // r2: the top of neck1's FRONT is the white throat band (the bottom of v1's chinstrap U, visible under the beak at
  // S: the beak hides the under-chin from the elevated camera), cut out of the neck's own surface
  const inThroat = (c) => c[1] > 0.83 && c[2] > 0.215;
  const [throatG, neck1G] = splitTris(subdivide(seg(J.neck1, [0, 1.0, 0.22], 0.125, 0.125, 0.02), 0.03), inThroat);
  add('neck1', neck1G, 'neck', 'neck1');
  add('neck1', throatG, 'cream', 'throat');
  const head = latheAt(HEAD_P, 8, { sz: HEAD_SZ }, HEAD_BASE);
  // chinstrap: lower cheeks behind the beak + under the chin (v2: a white U from cheek to cheek)
  // r2: top lowered to 0.095 (≥ 1 texel of black between it and the eye at W/SW) and wrapped further back up the
  // cheek (z ≥ −0.085); the throat band on neck1 (below) carries the U under the beak at S
  const inChin = (c) => {
    const y = c[1] - HEAD_BASE[1], z = c[2] - HEAD_BASE[2];
    return y < 0.095 - 0.25 * Math.max(0, -z - 0.02) && z > -0.085 && z < 0.11 && (Math.abs(c[0]) > 0.05 || y < 0.05);
  };
  // eyes: light ellipses cut out of the skull's own surface (coincident: never poke through the outline, no line
  // ring); they ride eyeL/R so a blink is a scale ('eyeL.s'); behind each sits a dark inset patch (shown when shut)
  const eyeIn = (sx) => (c) => {
    if (c[0] * sx <= 0.01) return false;
    const th = Math.atan2(Math.abs(c[0] - HEAD_BASE[0]), (c[2] - HEAD_BASE[2]) / HEAD_SZ) / R2D, y = c[1] - HEAD_BASE[1];
    return ((th - EYE.th) / EYE.rth) ** 2 + ((y - EYE.y) / EYE.ry) ** 2 < 1;
  };
  const [eyeLG, eyeRG, chinG, skullG] = splitTris(subdivide(head, 0.014), eyeIn(1), eyeIn(-1), inChin);
  add('head', skullG, 'neck', 'skull');
  add('head', chinG, 'cream', 'chin');
  for (const [s, g] of [['L', eyeLG], ['R', eyeRG]]) {
    add(`eye${s}`, g, 'cream', `eye${s}`);
    const a = g.attributes.position.array.slice();
    for (let i = 0; i < a.length; i += 3) { a[i] = HEAD_BASE[0] + (a[i] - HEAD_BASE[0]) * 0.985; a[i + 2] = HEAD_BASE[2] + (a[i + 2] - HEAD_BASE[2]) * 0.985; }
    const shut = new THREE.BufferGeometry(); shut.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    add('head', K.flat(shut), 'neck', `shut${s}`);
    // stern brow: a skull-coloured slab over the eye's inner (front) top, slanting down toward the beak
    const sx = s === 'L' ? 1 : -1, pts = [];
    for (const [th, y] of [[33, 0.186], [60, 0.212]]) for (const dy of [-0.013, 0.013]) for (const d of [-0.004, 0.013]) {
      const p = headSurf(th, y + dy, d); pts.push([sx * p[0], p[1], p[2]]);
    }
    add(`brow${s}`, K.hull(pts), 'neck', `brow${s}`);
    // r2 dead eye: a cream X over the eye, SUNK inside the skull at rest (hidden by the surface) and pushed out with
    // 'xeyeL.p' (XOUT) in the die keys, where the eye patch is squashed shut (dark patch behind the X)
    const stroke = (th0, y0, th1, y1) => {
      const ds = (th1 - th0) * R2D * 0.12, dy = y1 - y0, l = Math.hypot(ds, dy), hw = 0.016;
      const pth = (-dy / l) * hw / (0.12 * R2D), py = (ds / l) * hw, q = [];
      for (const [th, y] of [[th0, y0], [th1, y1]]) for (const sg of [-1, 1]) for (const d of [-0.05, -0.034]) {
        const p = headSurf(th + sg * pth, y + sg * py, d); q.push([sx * p[0], p[1], p[2]]);
      }
      return K.hull(q);
    };
    add(`xeye${s}`, K.merge(stroke(EYE.th - 15, EYE.y + 0.04, EYE.th + 15, EYE.y - 0.04),
      stroke(EYE.th - 15, EYE.y - 0.04, EYE.th + 15, EYE.y + 0.04)), 'cream', `xeye${s}`);
  }
  // beak: upper (head) + lower mandible (jaw) + dark mouth slot revealed when the jaw opens
  add('head', K.hull([[0.055, 1.035, 0.36], [-0.055, 1.035, 0.36], [0.05, 1.10, 0.36], [-0.05, 1.10, 0.36],
    [0.03, 1.035, 0.50], [-0.03, 1.035, 0.50], [0.022, 1.065, 0.495], [-0.022, 1.065, 0.495]]), 'beak', 'beak');
  add('head', K.box(0.07, 0.025, 0.11), 'neck', 'mouth', { at: [0, 1.03 - J.head[1], 0.425 - J.head[2]] });
  add('jaw', K.hull([[0.045, 1.035, 0.355], [-0.045, 1.035, 0.355], [0.04, 1.005, 0.36], [-0.04, 1.005, 0.36],
    [0.025, 1.035, 0.48], [-0.025, 1.035, 0.48], [0.02, 1.02, 0.475], [-0.02, 1.02, 0.475]]), 'beak', 'mandible');

  // ── wings: folded plates along the flank; coverts in 'wing', primaries (hand) dark ──
  for (const s of ['L', 'R']) {
    const f = s === 'L' ? (p) => p : mx;
    const sh = f(J.upperArmL), el = f(J.forearmL), wr = f(J.handL), tip = f(WING_TIP);
    // r2: coverts + secondaries are ONE convex plate on upperArm (r1's two plates left a dark 1×3 seam tick on the
    // flank at dir 1 in every frame); the forearm bone now only carries the primaries' hand down the chain
    const wp = [];
    for (const [P, top, bot] of [[[sh[0], sh[1], sh[2] + 0.02], 0.03, -0.15], [el, 0.03, -0.17], [wr, 0.03, -0.12]])
      for (const dy of [top, bot]) for (const sg of [-1, 1]) wp.push([P[0] + sg * 0.03, P[1] + dy, P[2]]);
    add(`upperArm${s}`, K.hull(wp), 'wing', `covert${s}`);
    add(`hand${s}`, plate(wr, tip, 0.0, -0.12, 0.0, -0.05, 0.05), 'neck', `primary${s}`);
  }

  // ── legs: only the lower shank + webbed foot show (thigh hidden in the body) ──
  for (const s of ['L', 'R']) {
    const f = s === 'L' ? (p) => p : mx;
    const kn = f(J.shinL), an = f(J.footL);
    const a = kn.map((x, i) => x + (an[i] - x) * 0.4);    // r2: shorter visible shank (≈ 4 texels at full stride, was 6-8); t1: 0.62 → 0.4 (feet were detached islands in the walk)
    add(`shin${s}`, seg(a, an, 0.055, 0.055, 0.01), 'beak', `shank${s}`);
    const x = an[0], y = an[1], z = an[2];
    add(`foot${s}`, K.hull([[x + 0.025, y + 0.005, z - 0.03], [x - 0.025, y + 0.005, z - 0.03], [x + 0.065, y - 0.004, z + 0.12], [x - 0.065, y - 0.004, z + 0.12],
      [x + 0.025, y - 0.04, z - 0.03], [x - 0.025, y - 0.04, z - 0.03], [x + 0.065, y - 0.04, z + 0.12], [x - 0.065, y - 0.04, z + 0.12]]), 'beak', `foot${s}`);
  }

  // ── clipboard on the LEFT flank, face to the front (yawed 15° out) ──
  const BY = 15;
  const rotB = (g) => K.xf(g, { rot: [0, BY, 0] });
  P.push({ bone: 'board', shape: rotB(K.box(0.20, 0.27, 0.05)), at: [0, 0, 0], color: 'board', name: 'board' });
  P.push({ bone: 'board', shape: rotB(K.xf(K.box(0.15, 0.20, 0.02), { at: [0, -0.01, 0.025] })), at: [0, 0, 0], color: 'cream', name: 'paper' });
  P.push({ bone: 'board', shape: rotB(K.xf(K.box(0.075, 0.045, 0.07), { at: [0, 0.135, 0.005] })), at: [0, 0, 0], color: 'beak', name: 'clip' });
  // the tick (a ✓ in the accent): two strokes on the paper
  P.push({ bone: 'board', shape: rotB(K.merge(
    K.xf(K.box(0.065, 0.045, 0.02), { rot: [0, 0, -45], at: [-0.025, -0.045, 0.034] }),
    K.xf(K.box(0.11, 0.045, 0.02), { rot: [0, 0, 55], at: [0.025, -0.015, 0.034] }))), at: [0, 0, 0], color: 'beak', name: 'tick' });

  // ── (t1) ghost halo: a flat gold ring HALO_UP over the halo joint, authored at HALO_K around the joint (inside the
  // skull); untinted by the ghost shader (v1 ghost row: a gold bar floating over the head)
  const ring = K.lathe([[0.075, 0], [0.135, 0], [0.135, 0.035], [0.075, 0.035], [0.075, 0]], 12);
  P.push({ bone: 'halo', shape: K.xf(ring, { at: [0, HALO_UP * HALO_K, 0], scale: HALO_K }), at: [0, 0, 0], color: 'halo', name: 'halo' });
  return P;
}

// ── clips ──
const SHUT = { 'eyeL.s': [0, -0.8, 0], 'eyeR.s': [0, -0.8, 0] };
const HALF = { 'eyeL.s': [0, -0.45, 0], 'eyeR.s': [0, -0.45, 0] };
// r2 dead eyes: eye patch squashed fully shut + the cream X pushed out of the skull along the eye's outward normal
const XO = norm([Math.sin(EYE.th * R2D), 0, Math.cos(EYE.th * R2D) * HEAD_SZ]).map((v) => v * 0.046);
const XEYES = { 'eyeL.s': [0, -0.95, 0], 'eyeR.s': [0, -0.95, 0], 'xeyeL.p': [XO[0], 0, XO[2]], 'xeyeR.p': [-XO[0], 0, XO[2]] };
const BROWS = (dy, tw = 0) => ({ 'browL.p': [0, dy, 0], 'browR.p': [0, dy, 0], browL: [0, tw, 0], browR: [0, tw, 0] });
const IDLE_A = { pos: [0, 0, 0] };
// vote (r2): the LEFT wing swings up-and-BACK holding the clipboard high above the back, clear of the neck column at
// every facing (r1 held it beside the head: hidden behind the neck at W); the neck leans away from the raised wing
const VOTE_UP = { pos: [0, 0.02, 0], chest: [-8, 0, 0], neck: [-6, 0, 8], neck1: [0, 0, 4], head: [10, 0, -10], ...BROWS(0.03),
  upperArmL: [-85, -90, 45], forearmL: [-20, 0, 0], 'board.p': [0.22, 0.76, -0.2], board: [-25, 30, 0] };   // board tilted
  // back + yawed out: its paper faces the camera at W too (edge-on there in r1)
// die end (r2): lying on the LEFT side (belly and feet toward the dir-1 camera); the neck FOLLOWS the body roll and
// droops past it so the head rests on the grass (r1 counter-rolled the neck upright: read as sitting), X eyes
const DIE_END = { pos: [0.12, -0.15, 0], body: [0, 0, 80], neck: [14, 0, 20], neck1: [8, 0, 12], head: [-4, 0, 6], ...XEYES,
  thighL: [35, 0, 6], shinL: [-40, 0, 0], thighR: [35, 0, 6], shinR: [-40, 0, 0], upperArmR: [0, 0, 10] };
// emote tap (r2): the left wing lifts the clipboard to the FRONT-LEFT of the breast (beside the beak), the head twists 45° to
// it and taps it from the side, so an eye and the beak stay visible at S/SE (r1 tapped it under the chin: crown only)
const TAP = (n, n1, h) => ({ neck: [n, 0, -10], neck1: [n1, 0, -10], head: [h, 45, 0], upperArmL: [10, 0, 20], 'board.p': [-0.1, 0.22, 0.1], board: [0, -20, 0] });
export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: { ...IDLE_A } },
    { f: 30, pose: { pos: [0, 0.028, 0], chest: [-4, 0, 0], neck: [-4, 0, 0], head: [6, -22, 6], tail0: [0, 0, 18] } },
    { f: 36, pose: { pos: [0, 0.028, 0], chest: [-4, 0, 0], neck: [-4, 0, 0], head: [6, -22, 6], tail0: [0, 0, 18], ...SHUT } },
    { f: 38, pose: { pos: [0, 0.028, 0], chest: [-4, 0, 0], neck: [-4, 0, 0], head: [6, -22, 6], tail0: [0, 0, 18] } },
    { f: 60, pose: { pos: [0, 0, 0], neck: [4, 0, 0], head: [-4, 0, 0], tail0: [0, 0, -18] } },
  ] },
  // talk (r2): the neck pump is a forward THRUST with the head kept level (head world pitch ≈ 0 to −4 up: r1's neck +14
  // / head −22 still showed the crown at S)
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { neck: [-6, 0, 0], head: [6, 0, -6] } },
    { f: 6, pose: { neck: [16, 0, 0], neck1: [2, 0, 0], head: [-24, 0, 6], jaw: [36, 0, 0], ...BROWS(0.02), upperArmR: [-30, 0, 25], forearmR: [0, 0, 10] } },
    { f: 12, pose: { neck: [-4, 0, 4], head: [4, -12, 0] } },
    { f: 18, pose: { neck: [16, 0, 0], neck1: [2, 0, 0], head: [-24, 0, -6], jaw: [32, 0, 0], upperArmR: [-20, 0, 15] } },
  ] },
  // one-shots end on their last key with clip.length (r2): a duplicate final key re-drew 105 px at f60 (critic)
  vote: { fps: 30, loop: false, interp: 'step', length: 61, events: { 4: 'vote@boardTop' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], neck: [8, 0, 0], head: [-8, 0, 0], upperArmL: [12, 0, -4] } },
    { f: 4, pose: VOTE_UP },
  ] },
  die: { fps: 30, loop: false, interp: 'step', length: 61, legs: 'fk', events: { 16: 'land' }, keys: [
    { f: 0, pose: { body: [0, 14, -8], neck: [10, 0, -12], head: [0, 0, 16], ...HALF, ...BROWS(0.02) } },
    { f: 6, pose: { pos: [0, -0.1, 0], body: [-4, 0, 0], neck: [28, 0, 0], neck1: [16, 0, 0], head: [-12, 0, 0], ...HALF,
      thighL: [60, 0, 0], shinL: [-100, 0, 0], thighR: [60, 0, 0], shinR: [-100, 0, 0], upperArmL: [8, 0, 14], upperArmR: [8, 0, 14] } },
    { f: 12, pose: { pos: [0.06, -0.13, 0], body: [0, 0, 55], neck: [14, 0, 4], neck1: [8, 0, 4], head: [-8, 0, 0], ...SHUT,
      thighL: [40, 0, 0], shinL: [-70, 0, 0], thighR: [40, 0, 0], shinR: [-70, 0, 0] } },
    { f: 16, pose: { pos: [0.12, -0.17, 0], body: [0, 0, 84], neck: [16, 0, 14], neck1: [8, 0, 8], head: [-6, 0, 4], ...XEYES,
      thighL: [30, 0, 8], shinL: [-30, 0, 0], thighR: [30, 0, 8], shinR: [-30, 0, 0], upperArmR: [0, 0, 12] } },
    { f: 22, pose: DIE_END },
  ] },
  honk: { fps: 30, loop: false, interp: 'step', events: { 6: ['flap@wingTipR', 'emote:exclaim'] }, keys: [
    { f: 0, pose: { pos: [0, 0.02, 0], chest: [-10, 0, 0], neck: [-18, 0, 0], neck1: [-8, 0, 0], head: [22, 0, 0], ...BROWS(-0.012, 20), upperArmL: [0, 0, -4], upperArmR: [0, 0, -4] } },
    // r2: head counter-pitch −42 → −56 so the HONK face (eyes + open beak) reads at S, not the skull top
    { f: 6, pose: { pos: [0, -0.02, 0.04], chest: [10, 0, 0], neck: [48, 0, 0], neck1: [14, 0, 0], head: [-56, 0, 0], jaw: [42, 0, 0], ...BROWS(-0.016, 25),
      upperArmL: [-40, 0, 40], forearmL: [-10, 0, 10], upperArmR: [-40, 0, 40], forearmR: [-10, 0, 10], tail0: [-30, 0, 0] } },
    { f: 18, pose: { neck: [4, 0, 0], head: [-4, 0, 0], ...BROWS(-0.008, 10) } },
    { f: 24, pose: TAP(12, 0, -24) },
    { f: 28, pose: TAP(20, 0, -14) },
    { f: 32, pose: TAP(12, 0, -24) },
    { f: 36, pose: TAP(20, 0, -14) },
    { f: 40, pose: { neck: [-6, 0, 0], head: [-6, -14, 0], ...BROWS(0.02) } },
    { f: 48, pose: { ...IDLE_A } },
  ] },
};

// ── (t1) point — the game's shared emote ("that one!"). The goose singles someone out with TWO pointers: the neck
// stays upright with the head level and aimed at the target (beak = the finger, a curt "You!") — NOT the low forward
// neck thrust of a hissing goose (first try read as a lunge) — and the free LEFT wing swings
// forward-out-up with its dark primaries straight as a finger. The clipboard stays on the left flank (identity).
// Anticipation (neck back, wing gathered, 4 f) → POINT (held 16) → firmer jab (held 14) → wing folds (8) → idle.
const PT = [42, 0, 132];                      // left wing upper [fwd, twist, out]: forward-out, ≈ 40° above level (fwd + lifts a tip that out has swung forward)
const POINT = (d = 0, extra = {}) => ({ pos: [0, 0.01, 0.02 * d], chest: [-4 + 2 * d, 0, 0], neck: [10 + 4 * d, 0, 4], neck1: [2, 0, 0],
  head: [-6 - 4 * d, 10, 0], jaw: [d ? 8 : 20, 0, 0], ...BROWS(-0.012, 18), upperArmL: [PT[0] + 6 * d, PT[1], PT[2]], forearmL: [0, 0, 0],
  handL: [0, 0, 0], tail0: [-12, 0, 0], ...extra });
CLIPS.point = { fps: 30, loop: false, interp: 'step', length: 52, keys: [
  { f: 0, pose: { pos: [0, -0.02, 0], chest: [-8, 0, 0], neck: [-14, 0, 0], neck1: [-6, 0, 0], head: [16, -8, 0], ...BROWS(-0.012, 20),
    upperArmL: [-10, 0, 30], tail0: [8, 0, 0] } },
  { f: 4, pose: POINT(0) },
  { f: 20, pose: POINT(1) },
  { f: 34, pose: { neck: [6, 0, 0], head: [-6, 6, 0], ...BROWS(-0.006, 8), upperArmL: [-10, 0, 40], tail0: [-6, 0, 0] } },
  { f: 42, pose: { ...IDLE_A } },
] };

// ── (t1) ghost / ghost-spent. Dead players hover as a pale-blue ghost (v1 ghost row: the goose in monochrome pale blue,
// the lower body fading out, a gold halo over the head while the ghost vote is unspent).
//   * hover: root up with a 1-texel bob (step keys 0.6 s apart), a slow ±4° body roll, eyes half shut, wings eased a
//     little open, neck in a soft S. Loop clips keep the gait's ground IK on the legs → the shanks + feet are scaled
//     away ('shin*.s' −0.98, feet are their children); they would sit inside the dissolved belly anyway;
//   * pale: material.tones (GHOST_GLSL) remaps every tone by luminance onto a pale-blue ramp when the halo bone's world
//     scale says "ghost" (spent: desaturated and darker); the lower body dissolves with a 2×2 ordered dither (discard,
//     both passes) between bind heights GF (gone → solid);
//   * halo: 'halo.s' grows the buried ring (ghost only, untinted gold).
const GH = [0.16, 0.12, 0.10, 0.07];          // ghost hover root y: [hi, lo] unspent, [hi, lo] spent (m)
const GF = [0.10, 0.40, 0.08, 0.36];          // dissolve bind heights: [gone, solid] unspent, [gone, solid] spent (m)
const GHOST_UP = 1 / HALO_K - 1, GHOST_SPENT = 1;
const HIDE_LEGS = { 'shinL.s': [-0.98, -0.98, -0.98], 'shinR.s': [-0.98, -0.98, -0.98] };
const GHOST = (y, roll, halo, extra = {}) => ({ pos: [0, y, 0], body: [0, 0, roll], neck: [-4, 0, -roll], head: [6, 0, 0], ...HALF,
  upperArmL: [-6, 0, 6], upperArmR: [-6, 0, 6], tail0: [-6, 0, 0], ...HIDE_LEGS, 'halo.s': [halo, halo, halo], ...extra });
const ghostClip = (hi, lo, roll, halo, extra) => ({ fps: 30, loop: true, interp: 'step', length: 72, legs: 'fk', dynamics: 'hold', keys: [
  { f: 0, pose: GHOST(hi, roll, halo, extra) },
  { f: 18, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
  { f: 36, pose: GHOST(lo, -roll, halo, extra) },
  { f: 54, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
] });
CLIPS.ghost = ghostClip(GH[0], GH[1], 4, GHOST_UP);
// spent: lower, heavier hover, neck drooped forward, head bowed, wings hanging, no halo, dimmer (shader)
CLIPS['ghost-spent'] = ghostClip(GH[2], GH[3], 3, GHOST_SPENT, { neck: [8, 0, 0], neck1: [2, 0, 0], head: [8, 0, 0],
  'eyeL.s': [0, -0.65, 0], 'eyeR.s': [0, -0.65, 0], upperArmL: [6, 0, 6], upperArmR: [6, 0, 6], tail0: [12, 0, 0] });

const lin = (h) => new THREE.Color(h).convertSRGBToLinear().toArray().map((v) => v.toFixed(4)).join(', ');
const GHOST_GLSL = {
  vertexHead: 'flat varying float vGhost; flat varying float vGhostHalo;',
  vertex: (headI, haloI) => `
    vGhost = 0.0; vGhostHalo = 0.0;
    #ifdef USE_SKINNING
      {
        float gH = length(getBoneMatrix(${headI}.0)[0].xyz);
        float gS = length(getBoneMatrix(${haloI}.0)[0].xyz) / max(gH, 1e-6);
        vGhost = gS > 100.0 ? 1.0 : (gS > 1.5 ? 2.0 : 0.0);
        vGhostHalo = abs(skinIndex.x - ${haloI}.0) < 0.5 ? 1.0 : 0.0;
      }
    #endif`,
  // the goose is mostly dark (neck/head) and mid grey: a plain luminance ramp would leave a navy neck, so the ramp is
  // lifted (gamma 0.36, dark end a mid slate-blue) — v1's ghost neck is a mid blue, the body a pale ice blue
  fragmentHead: `flat varying float vGhost; flat varying float vGhostHalo;
    vec3 ghostTone(vec3 c, float spent) {
      float l = pow(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 0.36);
      vec3 g = mix(vec3(${lin('#5A78AA')}), vec3(${lin('#E2F6FF')}), l);
      return spent > 0.5 ? mix(g, vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), 0.45) * 0.62 : g;
    }`,
  tones: `
    if (vGhost > 0.5 && vGhostHalo < 0.5) {
      float gSpent = vGhost > 1.5 ? 1.0 : 0.0;
      float gLo = mix(${GF[0].toFixed(3)}, ${GF[2].toFixed(3)}, gSpent), gHi = mix(${GF[1].toFixed(3)}, ${GF[3].toFixed(3)}, gSpent);
      float gA = clamp((vCharBind.y - gLo) / (gHi - gLo), 0.0, 1.0);
      ivec2 gq = ivec2(gl_FragCoord.xy) & 1;
      float gT = gq.x == 0 ? (gq.y == 0 ? 0.125 : 0.625) : (gq.y == 0 ? 0.875 : 0.375);
      if (gA < gT) discard;
      toonHi = ghostTone(toonHi, gSpent); toonMid = ghostTone(toonMid, gSpent); toonSh = ghostTone(toonSh, gSpent);
    }`,
};

export function make() {
  const S = skeleton();
  const tipL = sub(WING_TIP, J.handL);
  return {
    name: 'honk',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['neck', { part: 'chin' }],
    faceSlot: 'neck',
    bodyPlan: 'bird',
    heightPx: [38, 50],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'waddle' },
    emote: 'honk',
    skeleton: S,
    parts: parts(),
    sockets: {
      head: { bone: 'head', at: [0, 0.29, 0.03] }, crown: { bone: 'head', at: [0, 0.3, 0.03] },
      beak: { bone: 'head', at: [0, 0.07, 0.29] }, mouth: { bone: 'head', at: [0, 0.06, 0.24] },
      wingTipL: { bone: 'handL', at: tipL }, wingTipR: { bone: 'handR', at: mx(tipL) },
      boardTop: { bone: 'board', at: [0, 0.16, 0.03] }, back: { bone: 'chest', at: [0, 0.1, -0.2] },
    },
    chains: [],
    personality: { body: { f: 3.5, zeta: 0.85, r: 0 }, head: { f: 4, zeta: 0.9, r: 0 } },
    // r2: shorter step (cycle 0.3 → 0.28 s), lower lift, more roll, head bob 14 → 8 (the head pecked every other drawing)
    locomotion: { plan: 'bird', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.28, 0.267], poses: [4, 4], duty: [0.25, 0.25],
      lift: [0.04 * HEIGHT, 0.05 * HEIGHT], bob: [0.04, 0.04], roll: [14, 6], headBob: [8, 6], lean: [6, 12],
      hop: [0.1 * HEIGHT, 0.24 * HEIGHT], surge: false, plant: 'hold' },   // r2: 'hold' = sprite-style leg drawings (no 60 Hz re-pin flicker, no reach seat in the run)
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { feather: ['#A89C8A', '#6C6052'], spark: ['#FFF8DC', '#F6AE5C'], vote: { node: 'boardTop' }, speech: { node: 'crown' },
      soul: { node: 'chest' }, stepClips: [] },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', browL: 'mid', browR: 'mid' },
      // (t1) ghost / ghost-spent look (GHOST_GLSL; bone index = skeleton order, which rig.js keeps: parents come first)
      vertexHead: GHOST_GLSL.vertexHead, fragmentHead: GHOST_GLSL.fragmentHead, tones: GHOST_GLSL.tones,
      vertex: GHOST_GLSL.vertex(S.findIndex((b) => b.name === 'head'), S.findIndex((b) => b.name === 'halo')) },
  };
}

export default make();
