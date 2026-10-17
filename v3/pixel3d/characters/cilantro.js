// Cilantro (char-cilantro) — cast member "cilantro", mascot 15-251: "A giraffe in a blue hoodie and a green scarf."
// Design sheet (Unique to me, timing charts, self-critique): characters/cilantro.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/cilantro.ts + refs/cast/cilantro.png.
// Body plan: longNeck (upright giraffe on biped bone names → LegGait 'biped'), custom skeleton with a 3-link keyed neck
// (neck → neck1 → neck2 → head), blend-skinned neck tube with brown patches cut out of its own surface, a springy scarf
// end on the chest. Game speed: 3.95 H/s lope, 4 drawings × 2 grid frames, plant 'hold'; the authored walk clip ADDS a
// small neck pump + sideways sway, a contact lift, the keyed-forward scarf end and an ear flick per drawing (round 2:
// the neck stays 8-10 texels long at S in every drawing, head bob 1.2 px).
import * as THREE from 'three';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.68;                 // v2 38-39 px → 1.52-1.56 m; mascot +8 % (the tallest player; card allows 1.7), ossicone knobs
export const V_GAME = 3.95 * HEIGHT;        // 6.32 m/s

// [hi, mid, sh] sRGB; v1 hexes kept as mids, only sh lifted for night. 5 slots + patch accent.
export const PALETTE = {
  hide: ['#F4C47C', '#D6A456', '#B27C42'],    // head, neck, legs, hands, ears, ossicone shafts (signature, face)
  patch: ['#B07444', '#8E5530', '#6A4430'],   // giraffe patches (accent), cut out of the hide surface
  hood: ['#5E84C2', '#3F5F98', '#3A3A66'],    // hoodie, sleeves, hood
  scarf: ['#76B456', '#4C8A3C', '#2E5040'],   // scarf ring + hanging end
  cream: ['#FFF0D2', '#EAD0A0', '#C8A880'],   // muzzle, ear insides, glint
  dark: ['#6A4C4A', '#4A3436', '#3A2C34'],    // hooves, knobs, eyes, nostrils, mouth
};

// ── skeleton (world joint positions, character axes; converted to parent-relative) ──
const J = {
  hips: [0, 0.46, 0], spine: [0, 0.56, 0], chest: [0, 0.66, 0],
  neck: [0, 0.80, 0.0], neck1: [0, 0.97, 0.025], neck2: [0, 1.14, 0.05], head: [0, 1.31, 0.07],
  upperArmL: [0.215, 0.75, 0], thighL: [0.085, 0.44, 0], scarf0: [-0.07, 0.795, 0.135],
};
const LEG = { thigh: 0.19, shin: 0.19 };          // ankle at 0.06
const ARM = { upper: 0.19, fore: 0.17, up: [10, 0], foreDir: [6, 14] };   // rest directions [out°, fwd°]
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
// head-local anchors (head joint = base of the skull)
const SKULL = [[0.085, 0.0], [0.13, 0.04], [0.15, 0.10], [0.145, 0.16], [0.12, 0.21], [0.07, 0.245], [0, 0.255]];
const SKULL_SZ = 1.08, SKULL_Z = 0.02;
const EYE_Y = 0.15, EYE_A = 42;                    // eye height on the skull, angle from the front (deg)
const sub = (a, b) => a.map((v, i) => v - b[i]);

function skullR(y) {   // lathe radius at head-local y (piecewise linear)
  for (let i = 1; i < SKULL.length; i++) if (y <= SKULL[i][1]) { const [r0, y0] = SKULL[i - 1], [r1, y1] = SKULL[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
  return 0;
}
export const EYE = (() => {
  const r = skullR(EYE_Y), a = EYE_A * Math.PI / 180;
  return [r * Math.sin(a), EYE_Y, r * SKULL_SZ * Math.cos(a) + SKULL_Z];
})();

export function skeleton() {
  const S = [];
  const add = (name, parent, world, axis, limits) => S.push({ name, parent, pos: parent ? sub(world, W[parent]) : world, axis, ...(limits ? { limits } : {}) });
  const W = {};
  const put = (name, parent, world, axis, limits) => { W[name] = world; add(name, parent, world, axis, limits); };
  put('hips', null, J.hips, 'up');
  put('spine', 'hips', J.spine, 'up');
  put('chest', 'spine', J.chest, 'up');
  put('neck', 'chest', J.neck, 'up');
  put('neck1', 'neck', J.neck1, 'up');
  put('neck2', 'neck1', J.neck2, 'up');
  put('head', 'neck2', J.head, 'up');
  const H = J.head;
  put('jaw', 'head', [0, H[1] + 0.06, H[2] + 0.10], 'fwd', { fwd: [-5, 40], twist: [-10, 10], out: [-10, 10] });
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    put(`eye${s}`, 'head', [H[0] + x * EYE[0], H[1] + EYE[1], H[2] + EYE[2]], 'fwd');
    put(`ear${s}0`, 'head', [x * 0.125, H[1] + 0.175, H[2] - 0.03], s === 'L' ? 'left' : 'right');
    const sh = [x * J.upperArmL[0], J.upperArmL[1], J.upperArmL[2]];
    const du = armDir(ARM.up), df = armDir(ARM.foreDir);
    const el = [sh[0] + x * du[0] * ARM.upper, sh[1] + du[1] * ARM.upper, sh[2] + du[2] * ARM.upper];
    const wr = [el[0] + x * df[0] * ARM.fore, el[1] + df[1] * ARM.fore, el[2] + df[2] * ARM.fore];
    put(`upperArm${s}`, 'chest', sh, 'down');
    put(`forearm${s}`, `upperArm${s}`, el, 'down', { fwd: [-5, 150], twist: [-90, 90], out: [-30, 30] });
    put(`hand${s}`, `forearm${s}`, wr, 'down');
    const hp = [x * J.thighL[0], J.thighL[1], 0];
    put(`thigh${s}`, 'hips', hp, 'down');
    put(`shin${s}`, `thigh${s}`, [hp[0], hp[1] - LEG.thigh, 0], 'down');
    put(`foot${s}`, `shin${s}`, [hp[0], hp[1] - LEG.thigh - LEG.shin, 0], 'fwd');
  }
  put('scarf0', 'chest', J.scarf0, [0, -1, 0.3]);
  return Object.defineProperties(S, {
    sockets: { value: {
      handL: { bone: 'handL', at: [0, -0.05, 0] }, handR: { bone: 'handR', at: [0, -0.05, 0] },
      head: { bone: 'head', at: [0, 0.26, 0] }, crown: { bone: 'head', at: [0, 0.40, 0] },
      mouth: { bone: 'jaw', at: [0, 0, 0.14] }, back: { bone: 'chest', at: [0, 0.1, -0.2] },
    } },
    meta: { value: { W, H: HEIGHT, hipsY: J.hips[1] } },
  });
}

// ── geometry helpers ──
function subdivide(geo, maxEdge) {
  const p = geo.attributes.position.array, out = [];
  const rec = (a, b, c, d) => {
    const e = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const lab = e(a, b), lbc = e(b, c), lca = e(c, a), m = Math.max(lab, lbc, lca);
    if (m <= maxEdge || d > 9) { out.push(...a, ...b, ...c); return; }
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    if (m === lab) { const q = mid(a, b); rec(a, q, c, d + 1); rec(q, b, c, d + 1); }
    else if (m === lbc) { const q = mid(b, c); rec(a, b, q, d + 1); rec(a, q, c, d + 1); }
    else { const q = mid(c, a); rec(a, b, q, d + 1); rec(q, b, c, d + 1); }
  };
  for (let i = 0; i < p.length; i += 9) rec([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], 0);
  return out;
}
function splitTris(arr, pred) {
  const A = [], B = [];
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    (pred(c) ? A : B).push(...arr.slice(i, i + 9));
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  return [A.length ? mk(A) : null, mk(B)];
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ringHull(cs, rs, ts, n = 8, sz = 1) {
  const pts = [];
  cs.forEach((c, i) => {
    const t = norm(ts[i]); let b = cross(t, [0, 0, 1]); if (Math.hypot(...b) < 1e-3) b = [1, 0, 0]; b = norm(b);
    const u = norm(cross(t, b));
    for (let k = 0; k < n; k++) { const a = ((k + 0.5) / n) * Math.PI * 2; pts.push([0, 1, 2].map((j) => c[j] + Math.cos(a) * b[j] * rs[i] + Math.sin(a) * u[j] * rs[i] * sz)); }
  });
  return K.hull(pts);
}
/** lathe in ABSOLUTE coordinates (kit lathes are bbox-centred): y spans the profile's own y. */
function latheAbs(profile, n, opts) {
  const g = K.lathe(profile, n, opts);
  g.computeBoundingBox();
  const y0 = Math.min(...profile.map((p) => p[1]));
  return g.translate(0, y0 - g.boundingBox.min.y, 0);
}
// deterministic reticulated-patch pattern on a vertical tube: staggered cells, about half carry a patch
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
// blocky patches: whole hull facets (n faces round the tube) × rows, chosen by a seeded hash (crisp 3×3-texel blocks, no ragged edges)
function facetPatch(p, { n = 8, cy = 0.085, y0 = 0, keep = 0.4, a0 = 0 } = {}) {
  const a = Math.atan2(p[0], p[2]) + a0;
  const face = ((Math.round(a / (2 * Math.PI / n)) % n) + n) % n;
  const row = Math.floor((p[1] - y0) / cy);
  return hash(row * 3 + 1, face * 7 + (row & 1)) < keep;
}
function isPatch(p, { cy = 0.095, cols = 6, ry = 0.034, ra = 0.30, y0 = 0, keep = 0.55 } = {}) {
  const a = Math.atan2(p[0], p[2]);                     // 0 = front
  const row = Math.floor((p[1] - y0) / cy);
  const off = (row & 1) ? 0.5 : 0;
  const u = a / (2 * Math.PI) * cols - off;
  const col = Math.round(u);
  if (hash(row, ((col % cols) + cols) % cols) > keep) return false;
  const dy = (p[1] - y0 - (row + 0.5) * cy) / ry, da = (u - col) * (2 * Math.PI / cols) / ra;
  return dy * dy + da * da < 1;
}

export function parts(S) {
  const W = S.meta.W;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  const abs = (bone) => W[bone].map((v) => -v);        // `at` for geometry authored in world coordinates

  // ── hoodie: one 12-sided profile cut into a waistband (hips) and the body (chest, blended into the spine) ──
  const HOOD_P = [[0.165, 0.34], [0.20, 0.40], [0.215, 0.47], [0.218, 0.56], [0.205, 0.66], [0.17, 0.75], [0.115, 0.805], [0.0, 0.825]];
  const HSZ = 0.88;
  add('hips', latheAbs(HOOD_P.slice(0, 3), 12, { sz: HSZ }), abs('hips'), 'hood', { name: 'waistband' });
  add('chest', latheAbs(HOOD_P.slice(2), 12, { sz: HSZ }), abs('chest'), 'hood', { name: 'hoodie', blend: { with: 'spine', span: 0.08 } });
  // kangaroo pocket: a thin plate on the front of the belly (inner line = its seam)
  add('spine', K.xf(K.chamferBox(0.24, 0.11, 0.03, 0.3), { rot: [-8, 0, 0] }), sub([0, 0.50, 0.19], W.spine), 'hood', { name: 'pocket' });
  // hood bunched behind the neck
  add('chest', K.lathe([[0.0, -0.075], [0.12, -0.05], [0.165, 0.0], [0.13, 0.05], [0.0, 0.08]], 10, { sz: 0.6 }), sub([0, 0.825, -0.105], W.chest), 'hood', { name: 'hood' });

  // ── scarf: ring at the base of the neck + the hanging end (scarf0) ──
  add('neck', latheAbs([[0.12, 0.765], [0.15, 0.795], [0.152, 0.855], [0.11, 0.895]], 10, { sz: 0.95 }), abs('neck'), 'scarf', { name: 'scarfRing' });
  const sd = norm([0, -1, 0.3]);
  add('scarf0', K.hull([[-0.055, 0.03, -0.02], [0.055, 0.03, -0.02], [-0.055, 0.03, 0.02], [0.055, 0.03, 0.02],
    ...[[-0.06, -0.02], [0.06, -0.02], [-0.06, 0.02], [0.06, 0.02]].map(([x, z]) => [x, sd[1] * 0.36, sd[2] * 0.36 + z])]), [0, 0, 0], 'scarf', { name: 'scarfEnd' });

  // ── neck: three blend-skinned tube segments (overlapping 0.08 below each joint), patches cut out of the surface ──
  const NECK = [['neck', 'neck1', 0.108, 0.098], ['neck1', 'neck2', 0.098, 0.090], ['neck2', 'head', 0.090, 0.084]];
  for (const [b, nx, r0, r1] of NECK) {
    const a = W[b], c = W[nx], t = sub(c, a);
    const lo = b === 'neck' ? [a[0], a[1] - 0.03, a[2] - 0.01] : a.map((v, i) => v - t[i] * 0.55);
    const hi = nx === 'head' ? c.map((v, i) => v + t[i] * 0.75) : c.map((v, i) => v + t[i] * 0.05);
    const g = ringHull([lo, hi], [r0 + (b === 'neck' ? 0.004 : 0.004), r1], [t, t], 8, 1.0);
    const [pg, hg] = splitTris(subdivide(g, 0.022), (p) => p[1] > 0.90 && p[1] < 1.27 && facetPatch(p, { y0: 0.90, cy: 0.09, keep: 0.55 }));
    add(b, hg, abs(b), 'hide', { name: b + 'Hide', blend: b === 'neck' ? undefined : { with: b === 'neck1' ? 'neck' : 'neck1', span: 0.05 } });
    if (pg) add(b, pg, abs(b), 'patch', { name: b + 'Patch', blend: b === 'neck' ? undefined : { with: b === 'neck1' ? 'neck' : 'neck1', span: 0.05 } });
  }

  // ── head (head-local) ──
  const sk = latheAbs(SKULL, 16, { sz: SKULL_SZ }).translate(0, 0, SKULL_Z);
  const [hp, hh] = splitTris(subdivide(sk, 0.03), (p) => {
    const a = Math.abs(Math.atan2(p[0], p[2] - SKULL_Z)) * 180 / Math.PI;
    return a > 140 && p[1] > 0.05 && p[1] < 0.2 && isPatch([p[0], p[1], p[2] - SKULL_Z], { cy: 0.08, cols: 7, ry: 0.03, ra: 0.32, y0: 0.03, keep: 0.6 });
  });
  add('head', hh, [0, 0, 0], 'hide', { name: 'skull' });
  if (hp) add('head', hp, [0, 0, 0], 'patch', { name: 'skullPatch' });
  // muzzle (upper lip + nose) and the jaw (lower lip) with a dark mouth floor
  add('head', K.hull([[-0.085, 0.06, 0.06], [0.085, 0.06, 0.06], [-0.085, 0.15, 0.07], [0.085, 0.15, 0.07],
    [-0.066, 0.065, 0.285], [0.066, 0.065, 0.285], [-0.06, 0.13, 0.27], [0.06, 0.13, 0.27]]), [0, 0, 0], 'cream', { name: 'muzzle' });
  for (const x of [-1, 1]) add('head', K.box(0.04, 0.03, 0.024), [x * 0.034, 0.122, 0.264], 'dark', { name: 'nostril' + (x > 0 ? 'L' : 'R') });
  add('jaw', K.hull([[-0.07, -0.045, -0.02], [0.07, -0.045, -0.02], [-0.075, 0.0, -0.02], [0.075, 0.0, -0.02],
    [-0.05, -0.03, 0.17], [0.05, -0.03, 0.17], [-0.058, 0.0, 0.18], [0.058, 0.0, 0.18]]), [0, 0, 0], 'cream', { name: 'jaw' });
  add('jaw', K.box(0.09, 0.016, 0.15), [0, -0.004, 0.085], 'dark', { name: 'mouthFloor' });
  // eyes: dark 2×2+ texel boxes turned to the skull normal, 0.006 proud; 1-texel glint in the upper outer corner
  { const a = EYE_A * Math.PI / 180, n = [Math.sin(a), 0, Math.cos(a)], t = [Math.cos(a), 0, -Math.sin(a)];
    add('eyeL', K.xf(K.box(0.085, 0.08, 0.03), { rot: [0, EYE_A, 0] }), n.map((v) => -0.009 * v), 'dark', { name: 'eye', mirror: true });
    add('eyeL', K.xf(K.box(0.024, 0.024, 0.02), { rot: [0, EYE_A, 0] }), [0, 1, 2].map((i) => -0.002 * n[i] + 0.022 * t[i] + (i === 1 ? 0.022 : 0)), 'cream', { name: 'glint', mirror: true }); }
  // ears: sideways leaves (bone axis = out), tan back + cream front panel
  add('earL0', K.hull([[-0.02, -0.035, -0.025], [-0.02, 0.035, -0.025], [-0.02, -0.035, 0.02], [-0.02, 0.035, 0.02],
    [0.07, -0.04, -0.02], [0.07, 0.04, -0.02], [0.07, -0.04, 0.02], [0.07, 0.04, 0.02], [0.15, -0.01, -0.01], [0.15, 0.01, 0.0]]), [0, 0, 0], 'hide', { name: 'ear', mirror: true });
  add('earL0', K.hull([[0.0, -0.025, 0.022], [0.0, 0.025, 0.022], [0.065, -0.03, 0.024], [0.065, 0.03, 0.024], [0.12, 0.0, 0.016],
    [0.0, -0.025, 0.012], [0.0, 0.025, 0.012], [0.065, -0.03, 0.014], [0.065, 0.03, 0.014]]), [0, 0, 0], 'cream', { name: 'earIn', mirror: true });
  // ossicones: tan shafts leaning out, dark knobs
  for (const x of [-1, 1]) {
    add('head', K.xf(K.frustum(6, 0.046, 0.03, 0.15), { rot: [-6, 0, -x * 12] }), [x * 0.068, 0.255, -0.019], 'hide', { name: 'ossicone' + (x > 0 ? 'L' : 'R') });
    add('head', K.lathe([[0.0, 0], [0.038, 0.012], [0.045, 0.04], [0.032, 0.07], [0, 0.078]], 8), [x * 0.083, 0.355, -0.026], 'dark', { name: 'knob' + (x > 0 ? 'L' : 'R') });
  }

  // ── arms: hoodie sleeves with a wider cuff, tan hoof-hands ──
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    const seg = (bone, d, len, r0, r1, name, color) => {
      const dd = [x * d[0], d[1], d[2]];
      add(bone, ringHull([[0, 0.02, 0].map((v, i) => v - dd[i] * 0.02), dd.map((v) => v * len)], [r0, r1], [dd, dd], 6), [0, 0, 0], color, { name });
    };
    add(`upperArm${s}`, K.lathe([[0.05, 0], [0.085, 0.04], [0.08, 0.09], [0.0, 0.11]], 8), [x * 0.0, -0.035, 0], 'hood', { name: 'shoulder' + s });
    seg(`upperArm${s}`, armDir(ARM.up), ARM.upper, 0.072, 0.066, 'sleeve' + s, 'hood');
    seg(`forearm${s}`, armDir(ARM.foreDir), ARM.fore - 0.01, 0.066, 0.078, 'cuff' + s, 'hood');
    const df = armDir(ARM.foreDir);
    add(`hand${s}`, K.chamferBox(0.085, 0.09, 0.09, 0.35), [x * df[0] * 0.03, -0.035, df[2] * 0.03], 'hide', { name: 'hand' + s });
    add(`hand${s}`, K.box(0.07, 0.03, 0.075), [x * df[0] * 0.05, -0.085, df[2] * 0.05], 'dark', { name: 'hoofHand' + s });
  }

  // ── legs: tan (thighs mostly inside the hoodie), dark hooves ──
  for (const s of ['L', 'R']) {
    add(`thigh${s}`, K.frustum(6, 0.058, 0.064, LEG.thigh + 0.02), [0, -LEG.thigh / 2, 0], 'hide', { name: 'thigh' + s });
    add(`shin${s}`, K.frustum(6, 0.05, 0.056, LEG.shin), [0, -LEG.shin / 2 + 0.01, 0], 'hide', { name: 'shin' + s });
    add(`foot${s}`, K.chamferBox(0.105, 0.075, 0.14, 0.3), [0, -0.022, 0.02], 'dark', { name: 'hoof' + s });
  }
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ──────────────────────────────────────────────────────
// neck/head (up axis): fwd + nod forward, twist + turn LEFT, out + tilt LEFT. ears (sideways): out + = UP, fwd + = forward.
// jaw (fwd axis): fwd + = open. scarf0 (down-ish): fwd + = forward, out + = outward (to her right, it is a midline bone → left).
const EYES = (sy, sx = 0) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(-0.8), HALF = EYES(-0.4), WIDE = EYES(0.2, 0.08);
const EARS = (l, r = l) => ({ earL0: l, earR0: r });
const NECK = (f, t, o, h = [0, 0, 0]) => ({ neck: [f * 0.3, t * 0.3, o * 0.35], neck1: [f * 0.35, t * 0.3, o * 0.35], neck2: [f * 0.35, t * 0.4, o * 0.3], head: h });
const breathe = (d, c, extra = {}) => ({ pos: [0, -d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], ...extra });
// walk neck: small pitch pump [contact, pass] + sideways sway toward the stance side (keeps the neck long at S);
// SF = scarf end keyed forward so the spring's 4 H/s trail leaves it hanging down the chest
const WP = [-4, 1], WS = 4, SF = 22, WY = 0.025, WH = -3;   // WH: head tipped up a little (the muzzle hides less neck at S)   // WY: contact drawings lifted (cancels part of the plan's touchdown dip)
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], footL: [a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0], footR: [a, 0, 0] });

const IDLE_A = breathe(0, 0, { ...NECK(0, -16, -8, [0, -10, 6]), ...EARS([0, 0, 0]) });
const IDLE_B = breathe(0.028, 3, { ...NECK(-3, 16, 8, [-4, 10, -6]), ...EARS([0, 0, 6]) });

// point aim (close-out): neck pokes forward on the target, head tipped down onto it, both hooves forward. The camera
// looks along SE, so a hoof raised 35° there lies on the view ray and vanishes (c1/z-cal-b): the RIGHT hoof stays
// near level (fwd 98, reads at SE/E), the LEFT rises forward-up (fwd 125, reads at S/W/SW). Reach by .l, not .s.
const POINT_AIM = (extra = {}) => ({ pos: [0, 0.01, 0.02], spine: [-2, 0, 0], chest: [-3, 0, 0], ...NECK(26, 0, 0, [-26, 0, 0]), ...WIDE,
  upperArmR: [98, 0, 12], forearmR: [0, 0, 0], 'upperArmR.l': [0.5], 'forearmR.l': [0.5],
  upperArmL: [125, 0, 14], forearmL: [0, 0, 0], 'upperArmL.l': [0.4], 'forearmL.l': [0.4], ...extra });

const DEAD = { pos: [0, -0.24, 0], hips: [0, 0, 84], spine: [0, 0, 6], chest: [0, 0, 4],
  neck: [10, 0, 12], neck1: [8, 0, 10], neck2: [6, 0, 10], head: [30, -60, 10], ...EYES(-0.55), jaw: [6, 0, 0], ...EARS([-30, 0, -35]),
  thighL: [50, 0, 0], shinL: [-80, 0, 0], thighR: [35, 0, 0], shinR: [-60, 0, 0],
  upperArmL: [40, 0, 10], forearmL: [40, 0, 0], upperArmR: [50, 0, 0], forearmR: [60, 0, 0], scarf0: [0, 0, 30] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: IDLE_A },
    { f: 30, pose: breathe(0.014, 1.5, { ...NECK(-1.5, 0, 0, [-2, 0, 0]) }) },
    { f: 36, pose: IDLE_B },
    { f: 50, pose: { ...IDLE_B, ...BLINK } },
    { f: 52, pose: IDLE_B },
    { f: 60, pose: { ...IDLE_B, ...EARS([0, 0, 6], [0, 0, 35]) } },
    { f: 64, pose: breathe(0.014, 1.5, { ...NECK(-1.5, 0, 0, [-2, 0, 0]) }) },
  ] },
  // walk (game speed, LegGait 'biped' + ADD): neck pump against the bob, ears flick, per drawing (f0 = left contact)
  walk: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { pos: [0, WY, 0], ...NECK(WP[0], 0, WS, [WH, 0, -WS]), ...EARS([0, 0, -14]), scarf0: [SF, 0, 4] } },
    { f: 1, pose: { ...NECK(WP[1], 0, 0, [WH - 1, 0, 0]), ...EARS([0, 0, 12]), scarf0: [SF, 0, 0] } },
    { f: 2, pose: { pos: [0, WY, 0], ...NECK(WP[0], 0, -WS, [WH, 0, WS]), ...EARS([0, 0, -14]), scarf0: [SF, 0, -4] } },
    { f: 3, pose: { ...NECK(WP[1], 0, 0, [WH - 1, 0, 0]), ...EARS([0, 0, 12]), scarf0: [SF, 0, 0] } },
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { ...NECK(24, 0, 0, [-20, 0, 0]), ...EARS([-30, 0, -10]), scarf0: [SF + 10, 0, 0] } },
    { f: 1, pose: { ...NECK(16, 0, 0, [-12, 0, 0]), ...EARS([-30, 0, 10]), scarf0: [SF + 10, 0, 0] } },
    { f: 2, pose: { ...NECK(24, 0, 0, [-20, 0, 0]), ...EARS([-30, 0, -10]), scarf0: [SF + 10, 0, 0] } },
    { f: 3, pose: { ...NECK(16, 0, 0, [-12, 0, 0]), ...EARS([-30, 0, 10]), scarf0: [SF + 10, 0, 0] } },
  ] },
  // talk (loop 24): a beat every 6 frames — jaw open + head tipped up / neck bob down + head roll, the right hoof gestures
  talk: { fps: 30, loop: true, interp: 'step', length: 24, dynamics: 'hold', events: { 0: 'speak' }, keys: [
    { f: 0, pose: breathe(0, 0, { ...NECK(-4, -10, 0, [-12, -12, 8]), jaw: [32, 0, 0], ...EARS([0, 0, 10], [0, 0, 22]),
      upperArmR: [45, 0, 35], forearmR: [70, 0, 0], handR: [0, -30, 0] }) },
    { f: 6, pose: breathe(0.03, 2, { ...NECK(16, -6, 4, [-6, -6, -6]), jaw: [0, 0, 0], ...EARS([0, 0, -12]),
      upperArmR: [18, 0, 14], forearmR: [40, 0, 0] }) },
    { f: 12, pose: breathe(0, 0, { ...NECK(-4, -16, -6, [-12, -14, -8]), jaw: [30, 0, 0], ...EARS([0, 0, 22], [0, 0, 6]),
      upperArmR: [60, 0, 50], forearmR: [80, 0, 0], handR: [0, -40, 0] }) },
    { f: 18, pose: breathe(0.03, 2, { ...NECK(16, -4, -6, [-6, -4, 8]), jaw: [4, 0, 0], ...HALF, ...EARS([0, 0, -6]),
      upperArmR: [20, 0, 18], forearmR: [40, 0, 0] }) },
  ] },
  // vote: dip (4) → the right hoof thrown up-and-out beside the neck (stretchy sleeve), neck leaning away, eyes wide,
  // ears up — HELD
  vote: { fps: 30, loop: false, interp: 'step', events: { 4: 'vote@handR' }, length: 40, keys: [
    { f: 0, pose: breathe(0.04, 6, { ...NECK(8, 0, 0, [-4, 0, 0]), upperArmR: [10, 0, 30], forearmR: [60, 0, 0], ...EARS([0, 0, -10]) }) },
    { f: 4, pose: { pos: [0, 0.02, 0], spine: [-3, 0, 4], chest: [-4, 0, 6], ...NECK(-6, -8, 24, [-14, -10, -12]), ...WIDE, ...EARS([0, 0, 30]),
      upperArmR: [40, 0, 162], forearmR: [0, 0, 10], 'forearmR.s': [0, 0.5, 0], handR: [0, 0, 0], upperArmL: [5, 0, 14], forearmL: [30, 0, 0] } },
  ] },
  // die: wobble (6) → knees buckle (6) → topples onto her left side (6) → lying, neck laid on the grass, head turned up,
  // eyes shut, ears down → held. Legs FK.
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 18: ['die', 'land'] }, length: 50, keys: [
    { f: 0, pose: breathe(0, 0, { spine: [-6, 6, 0], chest: [-6, 0, 0], ...NECK(-6, 10, -10, [-10, 8, 0]), ...WIDE, jaw: [16, 0, 0], ...EARS([-20, 0, 20]),
      upperArmR: [20, 0, 30], upperArmL: [20, 0, 30] }) },
    { f: 6, pose: { pos: [0, -0.12, 0], spine: [16, 0, 4], chest: [8, 0, 0], ...NECK(8, 0, 8, [4, 0, 0]), ...HALF, ...EARS([-20, 0, -15]), ...KNEES(45),
      upperArmR: [25, 0, 15], upperArmL: [25, 0, 15], forearmL: [30, 0, 0], forearmR: [30, 0, 0] } },
    { f: 12, pose: { pos: [0, -0.18, 0], hips: [0, 0, 40], spine: [10, 0, 10], chest: [6, 0, 6], ...NECK(4, 6, 34, [10, -20, 8]), ...BLINK, ...EARS([-25, 0, -25]), ...KNEES(55),
      upperArmL: [20, 0, 50], upperArmR: [30, 0, 10], forearmR: [40, 0, 0], scarf0: [0, 0, 15] } },
    { f: 18, pose: DEAD },
  ] },
  // lookout (emote, "the tallest in town"): dip (4) → neck TELESCOPES up (+0.15 m), on tiptoe, scans left (12) → right
  // (12) → spots you: looks at the camera, ears up (10) → neck settles back (6) → idle
  lookout: { fps: 30, loop: false, interp: 'step', length: 56, events: { 28: 'emote:exclaim' }, keys: [
    { f: 0, pose: breathe(0.04, 6, { ...NECK(12, 0, 0, [-8, 0, 0]), ...HALF, ...EARS([0, 0, -12]) }) },
    { f: 4, pose: { pos: [0, 0.03, 0], spine: [-4, 0, 0], chest: [-4, 0, 0], ...NECK(-8, 30, 0, [-6, 36, 0]), 'neck1.p': [0, 0.05, 0], 'neck2.p': [0, 0.05, 0], 'head.p': [0, 0.05, 0],
      ...WIDE, ...EARS([0, 0, 25]), upperArmL: [10, 0, 10], upperArmR: [10, 0, 10] } },
    { f: 16, pose: { pos: [0, 0.03, 0], spine: [-4, 0, 0], chest: [-4, 0, 0], ...NECK(-8, -30, 0, [-6, -36, 0]), 'neck1.p': [0, 0.05, 0], 'neck2.p': [0, 0.05, 0], 'head.p': [0, 0.05, 0],
      ...WIDE, ...EARS([0, 0, 25]), upperArmL: [10, 0, 10], upperArmR: [10, 0, 10] } },
    // punchline: its own read (not talk) — neck bolt upright and telescoped further (+0.21 m), head level, ears straight
    // up, eyes wide, a small 'o' mouth, both hooves pulled up to the chest in surprise
    { f: 28, pose: { pos: [0, 0.05, 0], spine: [-6, 0, 0], chest: [-6, 0, 0], ...NECK(-6, 0, 0, [-4, 0, 0]), 'neck1.p': [0, 0.07, 0], 'neck2.p': [0, 0.07, 0], 'head.p': [0, 0.07, 0],
      ...EYES(0.3, 0.12), jaw: [14, 0, 0], ...EARS([0, 0, 60]), upperArmR: [35, 0, 22], forearmR: [100, 0, 0], upperArmL: [35, 0, 22], forearmL: [100, 0, 0] } },
    { f: 40, pose: breathe(0.02, 2, { ...NECK(6, -6, 4, [-6, -8, 0]), 'neck1.p': [0, 0.02, 0], 'neck2.p': [0, 0.02, 0], 'head.p': [0, 0.02, 0], ...EARS([0, 0, 10]) }) },
    { f: 46, pose: IDLE_A },
  ] },
  // point (close-out; the game's shared emote, aimed ALONG the facing at whoever she faces — at SE that is the viewer):
  // f0 wind-up: neck draws back, hooves in at the chest (4) → f4 "that one!": the neck pokes toward the target (head
  // tipped down onto it, eyes wide, ears pricked forward), BOTH hooves thrust forward (right near level = the pointer at
  // SE/E, left forward-UP = the pointer at S/W/SW; see POINT_AIM), reach by .l → f10 settle, same aim, held to f36 →
  // f36 hooves ease down, held to the end (42; the idle resumes — an IDLE_A end key read 1 % key_delta vs the idle)
  point: { fps: 30, loop: false, interp: 'step', length: 42, keys: [
    { f: 0, pose: breathe(0.03, 4, { ...NECK(-6, 0, 0, [4, 0, 0]), ...HALF, ...EARS([0, 0, -10]),
      upperArmL: [30, 0, 15], forearmL: [90, 0, 0], upperArmR: [30, 0, 15], forearmR: [90, 0, 0] }) },
    { f: 4, pose: POINT_AIM({ ...EARS([30, 0, 25]), jaw: [8, 0, 0] }) },
    { f: 10, pose: POINT_AIM({ ...EARS([20, 0, 18]) }) },
    { f: 36, pose: breathe(0.01, 1, { ...NECK(4, 0, 0, [-2, 0, 0]), ...EARS([0, 0, 6]),
      upperArmL: [35, 0, 12], forearmL: [40, 0, 0], upperArmR: [35, 0, 12], forearmR: [40, 0, 0] }) },
  ] },
  // ghost (close-out; loop 72 — spec.ghost draws the pale ramp, gold halo over the ossicones, hover and floating legs):
  // the idle's slow neck sway kept (her identity), hooves floating forward-low together, knees soft, a blink at f54
  ghost: { fps: 30, loop: true, interp: 'step', length: 72, legs: 'float', dynamics: 'hold', keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: {
    pos: [0, [0, 0.02, 0.04, 0.02][i], 0], spine: [2, 0, 0],
    ...NECK(-2, [-12, 0, 12, 0][i], [-6, 0, 6, 0][i], [-4, [-8, 0, 8, 0][i], [4, 0, -4, 0][i]]),
    upperArmL: [30, 0, 14 + 6 * (i % 2)], forearmL: [40, 0, 0], upperArmR: [30, 0, 14 + 6 * ((i + 1) % 2)], forearmR: [40, 0, 0],
    ...EARS([0, 0, [8, 0, -6, 0][i]], [0, 0, [-6, 0, 8, 0][i]]), ...KNEES(14), ...(i === 3 ? HALF : {}) } })) },
  // ghost-spent (close-out; loop 72, after the ghost's one vote — dimmer ramp, no halo): the long neck BOWED in a soft
  // curve that also droops to her left (straight forward it foreshortened to nothing at S: c2/z-g8-ghost-spent-f0),
  // head face-out, ears drooping, hooves hanging, sinking lower, heavy lids
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 72, legs: 'float', dynamics: 'hold', keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: {
    pos: [0, [-0.02, -0.035, -0.05, -0.035][i], 0], spine: [4, 0, 0], chest: [4, 0, 0],
    ...NECK(10, 0, [30, 26, 22, 26][i], [6, 0, [-14, -12, -10, -12][i]]), ...HALF, ...EARS([0, 0, -32]),
    upperArmL: [4, 0, 8], forearmL: [12, 0, 0], upperArmR: [4, 0, 8], forearmR: [12, 0, 0], ...KNEES(10) } })) },
};

export function make() {
  const S = skeleton();
  return {
    name: 'cilantro',
    height: HEIGHT,
    palette: PALETTE,
    signature: 'hide',
    faceSlot: 'hide',
    bodyPlan: 'longNeck',
    heightPx: [54, 64],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'lope' },
    emote: 'lookout',
    skeleton: S,
    parts: parts(S),
    chains: [{ name: 'scarf', bones: ['scarf0'], f: 5, zeta: 0.55, r: 0, gravity: 0.6, limit: 16 }],
    personality: { body: { f: 2.5, zeta: 0.8, r: 0 }, head: { f: 2.2, zeta: 0.9, r: 0 } },
    locomotion: { plan: 'biped', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.267, 0.267], poses: [4, 4],
      duty: [0.25, 0.2], reach: 0.6, plant: 'hold', holdDrop: 0.05, arms: [28, 45], elbows: [25, 45], bob: [0.035, 0.07], lean: [2, 9],
      lift: [0.075, 0.12], twist: [7, 10] },
    character: { quant: { yaw: 8, chain: 4 } },
    // close-out: shared ghost look; keepHue 0.3 keeps a hint of the tan neck / blue hoodie / green scarf on the pale ramp
    ghost: { hover: 0.14, keepHue: 0.3, halo: { lift: 0.2 } },   // halo lift 0.12 sat ON the ossicone knobs at S/SE (c2/z-ghost-S.png)
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', earL0: 'mid', earR0: 'mid' }, slots: { scarf: { lift: 0.3 } },
      // one part id for the face (no grey cream-on-cream line ring round the muzzle/jaw, no ear-root specks) and the neck links
      merge: { jaw: 'head', eyeL: 'head', eyeR: 'head', earL0: 'head', earR0: 'head', neck1: 'neck', neck2: 'neck' } },
  };
}

export default make();
