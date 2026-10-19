// Mincut (char-mincut) — cast member "mincut", mascot (CMU 15-451): "A red panda who finds the weakest link."
// Design sheet (Unique to me, timing charts, self-critique): characters/mincut.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/mincut.ts + refs/cast/mincut.png.
// Body plan: upright CHIBI (chibi(), 2.3 heads; v2 draws her upright, unclothed, plush-toy round), LegGait 'biped'
// (plant 'hold') = a brisk scurry at the v2 game speed (3.95 H/s). Her dark legs are visible (no skirt), so the contact
// drawing shows real feet. The big ringed tail (two keyed bones, tail0 → tail1, one drawing of lag) and the round
// white-rimmed ears are keyed per gait drawing in clips.walk (LegGait plays authored walk clips, module fix M1).
// r2 (critic 17/24 fixes): tail moved out beside the left hip; story props (scissors in the right paw for vote/snip,
// a 3-link chain in the left paw for snip; hidden TINY parts shown with .s); joined brow patches; curled die.
// r3 (cast close-out): game clips point (two-paw, along the facing), ghost + ghost-spent (spec.ghost, keepHue 0.3).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.28;                 // v2 32 px (SE) → castHeight 1.28 m (ear tops)
export const V_GAME = 3.95 * HEIGHT;        // 5.06 m/s

// [hi, mid, sh] sRGB. 5 slots (fur, white, dark, ring, eye); no extra accent.
export const PALETTE = {
  fur: ['#E48A58', '#C65A2A', '#B86A4C'],   // russet: head, body, tail fur bands (v2 #C65A2A / #D1784A / #DD9873); r2 sh #B86A4C hue ≈ 16°, lifted (was pinkish #B4625A)
  white: ['#FAEEEC', '#E8DCD8', '#B09CA8'],   // face mask (muzzle, cheeks, brow spots), ear rims — the lightest mass
  dark: ['#70483C', '#4A2C2A', '#3A2A36'],    // legs, arms, belly, ear centres, mouth inside (v2 #3E211E)
  ring: ['#9A4630', '#73301F', '#5E2E38'],    // tail rings (v2 #5C2618), darker russet than the fur, lighter than the legs
  eye: ['#5C4A64', '#2E2436', '#3A3040'],     // eyes + nose (no black)
  // r2: story props, shown only in vote / snip (built at 1/1000 scale, shown with '.s' 999): scissors blades + chain
  steel: ['#E2ECF4', '#9FB3C6', '#66788E'],   // cool blue-grey (never the warm white mask)
};

const SKH = 1.2;                            // chibi template height = top of the skull (the ears stand above it)
// arm segment directions at rest [out°, fwd°] (L side; R mirrored): paws rest on the front of the belly (v2 idle)
const ARM = { up: [14, 8], fore: [4, 38] };
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
// r1: ears lean out only ~17° (at 31° the near ear projected onto the side of the head at E/W = a white "goggle")
const EAR = { at: [0.15, 0.44, -0.05], dir: [0.3, 1, -0.1], len: 0.15 };
const EAR_YAW = 10;
const EYE = [0.134, 0.25, 0.221];           // head-local L eye joint, ON the 16-gon surface (normal yaw ≈ 25°)
// r2: root moved out to her LEFT rump (critic: a midline root hid the tail behind the body at S / N, 4 texels at SE)
const TAIL_AT = [0.1, -0.06, -0.12];         // hips-local tail root (left-back of the rump)

// ── r2 props ──
const TINY = 0.001, SHOW = [999, 999, 999], SHOW14 = [1399, 1399, 1399];
const SCIS_U = (() => { const d = armDir(ARM.fore); return [-d[0], d[1], d[2]]; })();   // right forearm/paw direction
const SCIS_PIVOT = SCIS_U.map((v) => v * 0.07);   // pivot just past the paw; handles inside the fist, blades beyond
const CHAIN_AT = [0.123, 0.24, 0.34];             // chest-local: the left paw in the snip pose (probe, mincut_probe.js)
const LINK_Y = [-0.07, -0.185, -0.3];           // link centres below the paw (chain-local)

export function skeleton() {
  const S0 = chibi({ height: SKH, heads: 2.3, legs: 0.75, arms: 1.1, snout: 0.25, tail: false,
    ears: { n: 1, at: EAR.at, dir: EAR.dir, len: EAR.len }, face: { eye: EYE, brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM.up], [`hand${s}`, ARM.fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  S.find((b) => b.name === 'jaw').pos = [0, 0.085, 0.17];
  // tail: two keyed bones (axis sideways: 'fwd' = yaw about the vertical); tail1 sits at the 3rd ring of the centreline
  S.push({ name: 'tail0', parent: 'hips', pos: TAIL_AT, axis: 'left' });
  S.push({ name: 'tail1', parent: 'tail0', pos: TAILC[3].slice(0, 3), axis: 'left' });
  // r2 story props (hidden: built at TINY scale, shown with '<bone>.s' SHOW): scissors in the right paw (blade B on
  // its own bone at the pivot = open / shut), a 3-link chain hanging from the left paw in the snip (on the chest, at
  // the snip pose's paw; link3 = the weakest link, its own bone so the snip can drop it)
  S.push({ name: 'scis', parent: 'handR', pos: [0, 0, 0], axis: 'down' });
  S.push({ name: 'scisB', parent: 'scis', pos: SCIS_PIVOT.map((v) => v * TINY), axis: 'down' });
  S.push({ name: 'chain', parent: 'chest', pos: CHAIN_AT, axis: 'down' });
  S.push({ name: 'link3', parent: 'chain', pos: [0, LINK_Y[2] * TINY, 0], axis: 'down' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

// ── geometry helpers (in-plane subdivision + split by centroid: colour regions cut OUT of one surface, no inner line)
function subdivide(geo, maxEdge) {
  const p = geo.attributes.position.array, out = [];
  const rec = (a, b, c, d) => {
    const e = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const lab = e(a, b), lbc = e(b, c), lca = e(c, a), m = Math.max(lab, lbc, lca);
    if (m <= maxEdge || d > 8) { out.push(...a, ...b, ...c); return; }
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    if (m === lab) { const q = mid(a, b); rec(a, q, c, d + 1); rec(q, b, c, d + 1); }
    else if (m === lbc) { const q = mid(b, c); rec(a, b, q, d + 1); rec(a, q, c, d + 1); }
    else { const q = mid(c, a); rec(a, b, q, d + 1); rec(q, b, c, d + 1); }
  };
  for (let i = 0; i < p.length; i += 9) rec([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], 0);
  return out;
}
function splitN(arr, preds) {
  const out = preds.map(() => []), rest = [];
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    const k = preds.findIndex((p) => p(c));
    (k < 0 ? rest : out[k]).push(...arr.slice(i, i + 9));
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  return [...out.map(mk), mk(rest)];
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, i) => v - b[i]);
// convex hull of two rings (n points, radius r) around centreline points a, b with tangents ta, tb
function ringPts(c, r, t, n) {
  t = norm(t); let b = cross(t, [0, 1, 0]); if (Math.hypot(...b) < 1e-3) b = [1, 0, 0]; b = norm(b);
  const u = norm(cross(b, t)), pts = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + Math.PI / n; pts.push([0, 1, 2].map((j) => c[j] + (Math.cos(a) * b[j] + Math.sin(a) * u[j]) * r)); }
  return pts;
}
const bandHull = (C, R, T, i0, i1, n = 8, off = [0, 0, 0]) => {
  const pts = [];
  for (let i = i0; i <= i1; i++) pts.push(...ringPts(sub(C[i], off), R[i], T[i], n));
  return K.hull(pts);
};
const angF = (p) => Math.abs(Math.atan2(p[0], p[2])) * 180 / Math.PI;   // 0 = front

// head profile (head-local: y 0 = chin), one 16-sided lathe; the white mask is cut out of its surface
const HEAD = [[0.14, 0], [0.245, 0.05], [0.285, 0.15], [0.288, 0.26], [0.25, 0.37], [0.15, 0.45], [0, 0.48]];
const HEAD_SZ = 0.88;
// tail centreline (tail0-local, character axes) [x, y, z, r]; bands F R F | R F R (ringed tip), tail1 joint at point 3.
// (r2) a LOW, WIDE 3-D C beside her LEFT hip: the base runs out-and-back (left-back), the upper half curls FORWARD and
// up to chin height (y ≤ 0.69 m, below the big head). Out of the body outline at S, SE (the ringed tip right of the
// face), NE, N, NW, SW (6/8; E hides it, W shows it in front of the body). r1 went straight back: hidden at S/N.
// Sway keys use NEGATIVE tail0 out (swings the C outward/down); positive out tucks it in behind the head at SE.| R F (v2: five alternating fur / ring balls), tail1 joint at point 3
// (r2) a C that runs out along her LEFT, 15° back (x 0.966 : z −0.259) and curls UP beside the hip, as v1 draws it at S:
// it breaks the body outline sideways at S / N and backwards at E / W (r1 went straight back and hid behind her at S/N)
const TAILC = [[0, 0, 0, 0.1], [0.1, -0.02, -0.06, 0.12], [0.21, 0.02, -0.07, 0.135], [0.29, 0.1, -0.02, 0.135],
  [0.33, 0.2, 0.06, 0.125], [0.32, 0.29, 0.14, 0.1], [0.28, 0.34, 0.2, 0.055]];

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  const placeY = (g, y0) => { g.computeBoundingBox(); return g.clone().translate(0, y0 - g.boundingBox.min.y, 0); };

  // ── head ──
  const hg = placeY(K.lathe(HEAD, 16, { sz: HEAD_SZ }), 0);
  // r2: finer cut (0.02) and fuller patches: the brow spot is one ≥ 2×2-texel patch sitting ON the eye's upper edge
  // (r1 0.33–0.40 broke into 1-texel dots), the cheek stops at 74° so no 1-texel tip pokes out of the head contour
  const [muz, cheek, brow, skull] = splitN(subdivide(hg, 0.02), [
    (p) => angF(p) < 22 && p[1] < 0.19 && p[2] > 0,                         // muzzle (front, lower)
    (p) => angF(p) > 38 && angF(p) < 74 && p[1] > 0.02 && p[1] < 0.21,      // cheeks (the russet gap = tear marks)
    (p) => angF(p) > 8 && angF(p) < 40 && p[1] > 0.295 && p[1] < 0.41 && p[2] > 0,  // brow spots, joined to the eye top
  ]);
  add('head', skull, [0, 0, 0], 'fur', { name: 'skull' });
  add('head', muz, [0, 0, 0], 'white', { name: 'muzzle' });
  add('head', cheek, [0, 0, 0], 'white', { name: 'cheeks' });
  add('head', brow, [0, 0, 0], 'white', { name: 'brows' });
  // snout: a short white wedge with a dark nose at its tip (the nose bump in profile, v2 E/W)
  add('head', K.hull([[-0.09, 0.07, 0.18], [0.09, 0.07, 0.18], [-0.08, 0.185, 0.17], [0.08, 0.185, 0.17],
    [-0.05, 0.08, 0.33], [0.05, 0.08, 0.33], [-0.045, 0.16, 0.32], [0.045, 0.16, 0.32]]), [0, 0, 0], 'white', { name: 'snout' });
  add('head', K.chamferBox(0.08, 0.055, 0.05, 0.3), [0, 0.15, 0.325], 'eye', { name: 'nose' });
  // jaw (hinge at the back, under the snout): white lower lip + dark mouth floor (opens ≤ 15°)
  add('jaw', K.hull([[-0.07, -0.04, -0.01], [0.07, -0.04, -0.01], [-0.07, 0.005, -0.01], [0.07, 0.005, -0.01],
    [-0.04, -0.025, 0.14], [0.04, -0.025, 0.14], [-0.045, 0.005, 0.14], [0.045, 0.005, 0.14]]), [0, 0, 0], 'white', { name: 'jaw' });
  add('jaw', K.box(0.075, 0.012, 0.1), [0, 0.003, 0.075], 'dark', { name: 'mouthFloor' });
  // eyes: dark boxes on the 16-gon surface (front 0.006 m proud, turned to the surface normal), 1-texel glint flush
  const EYAW = 25, EYEC = [-0.006, 0, -0.0127];
  const rotY = ([x, y, z], d) => { const a = d * Math.PI / 180; return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]; };
  const onEye = (v) => { const r = rotY(v, EYAW); return [EYEC[0] + r[0], EYEC[1] + r[1], EYEC[2] + r[2]]; };
  add('eyeL', K.xf(K.box(0.085, 0.1, 0.04), { rot: [0, EYAW, 0] }), EYEC, 'eye', { name: 'eye', mirror: true });
  add('eyeL', K.xf(K.box(0.024, 0.024, 0.012), { rot: [0, EYAW, 0] }), onEye([0.026, 0.036, 0.021]), 'white', { name: 'glint', mirror: true });
  // ears: round white-rimmed paddles, dark centre panel on the front face, base sunk into the skull
  {
    const u = norm(EAR.dir), L = EAR.len, w = 0.085, d = 0.055;   // deep (0.11 m) so E/W show a round ear, not a spike
    const ring = (a, hw, hd, dz = 0) => [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([x, z]) => [x + u[0] * a, u[1] * a, z + dz + u[2] * a]);
    // r1: narrow sunk base (a wide base poked out of the skull side as a white "goggle" patch at E/NE/W/NW)
    const ear = K.hull([...ring(-0.03, w * 0.6, d * 0.7), ...ring(L * 0.3, w * 1.0, d), ...ring(L * 0.85, w * 0.9, d * 0.9), ...ring(L, w * 0.6, d * 0.75)]);
    const inner = K.hull([...ring(L * 0.2, w * 0.5, 0.008, d - 0.004), ...ring(L * 0.5, w * 0.6, 0.008, d - 0.004), ...ring(L * 0.78, w * 0.32, 0.008, d * 0.8 - 0.004)]);
    add('earL0', K.xf(ear, { rot: [0, EAR_YAW, 0] }), [0, 0, 0], 'white', { name: 'ear', mirror: true });
    add('earL0', K.xf(inner, { rot: [0, EAR_YAW, 0] }), [0, 0, 0], 'dark', { name: 'earIn', mirror: true });
  }

  // ── body: one plump russet egg on the spine, the dark belly cut out of its lower front ──
  const BODY = [[0.13, 0], [0.195, 0.05], [0.218, 0.15], [0.21, 0.25], [0.18, 0.34], [0.12, 0.41], [0.04, 0.44]];
  const yb = 0.25 - m.spineY;                           // egg bottom (character y 0.25)
  const bg = placeY(K.lathe(BODY, 12, { sz: 0.9 }), yb);
  const [belly, bodyR] = splitN(subdivide(bg, 0.03), [(p) => p[2] > 0 && angF(p) < 42 && p[1] < yb + 0.2]);
  add('spine', bodyR, [0, 0, 0], 'fur', { name: 'body' });
  add('spine', belly, [0, 0, 0], 'dark', { name: 'belly' });
  // dark seat under the egg (the legs' root; v2 draws the lower body dark)
  add('hips', K.frustum(8, 0.11, 0.15, 0.08, { sz: 0.9 }), [0, 0.27 - m.hipsY, -0.01], 'dark', { name: 'seat' });

  // ── arms: dark, bent rest (paws on the belly front) ──
  const seg = (bone, d, len, r0, r1, name, color) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM.up)), m.upperArm + 0.02, 0.062, 0.058, 'upper' + sd, 'dark');
    seg('forearm' + sd, m3(armDir(ARM.fore)), m.forearm + 0.01, 0.056, 0.06, 'fore' + sd, 'dark');
    const d = m3(armDir(ARM.fore));
    add('hand' + sd, K.chamferBox(0.085, 0.08, 0.09, 0.4), d.map((v) => v * 0.03), 'dark', { name: 'paw' + sd });
  }

  // ── legs: dark, visible (no clothes), feet a little forward ──
  add('thighL', K.frustum(4, 0.07, 0.066, m.thigh + 0.02), [0, -m.thigh / 2, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.06, 0.066, m.shin), [0, -m.shin / 2, 0], 'dark', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.11, m.ankleY + 0.045, 0.19, 0.35), [0, -m.ankleY / 2 + 0.02, 0.045], 'dark', { name: 'foot', mirror: true });

  // ── tail: six coincident bands of one ringed centreline (F R F on tail0 | R F R on tail1) ──
  const C = TAILC.map((t) => t.slice(0, 3)), R = TAILC.map((t) => t[3]);
  const T = C.map((c, i) => sub(C[Math.min(C.length - 1, i + 1)], C[Math.max(0, i - 1)]));
  const J = C[3];
  add('tail0', bandHull(C, R, T, 0, 1), [0, 0, 0], 'fur', { name: 'tailA' });
  add('tail0', bandHull(C, R, T, 1, 2), [0, 0, 0], 'ring', { name: 'tailB' });
  add('tail0', bandHull(C, R, T, 2, 3), [0, 0, 0], 'fur', { name: 'tailC' });
  add('tail1', bandHull(C, R, T, 3, 4, 8, J), [0, 0, 0], 'ring', { name: 'tailD' });
  add('tail1', bandHull(C, R, T, 4, 5, 8, J), [0, 0, 0], 'fur', { name: 'tailE' });
  add('tail1', bandHull(C, R, T, 5, 6, 8, J), [0, 0, 0], 'ring', { name: 'tailF' });   // r2: ringed tip (reads as the tail at SE)

  // ── r2 props (TINY: every vertex and child offset × 0.001; '<bone>.s' SHOW scales them back to 1) ──
  const tiny = (pts) => K.xf(K.hull(pts), { scale: TINY });
  {
    const u = norm(SCIS_U), e = norm(cross(u, [0, 0, 1])), n = cross(u, e);   // e = the opening direction (frontal plane)
    const rot = (a) => { const r = a * Math.PI / 180; return norm(u.map((v, i) => v * Math.cos(r) + e[i] * Math.sin(r))); };
    // a blade: a long thin wedge from the pivot along direction b (width across e, thickness along n)
    const blade = (b, o, len) => {
      const eb = norm(cross(b, n)), pts = [];
      for (const [t, w, th] of [[-0.03, 0.06, 0.03], [0.03, 0.066, 0.03], [len, 0.02, 0.022]])
        for (const sx of [-1, 1]) for (const sn of [-1, 1]) pts.push([0, 1, 2].map((j) => o[j] + b[j] * t + eb[j] * sx * w / 2 + n[j] * sn * th / 2));
      return pts;
    };
    const L = 0.3;
    add('scis', tiny(blade(rot(5), SCIS_PIVOT, L)), [0, 0, 0], 'steel', { name: 'bladeA' });
    add('scisB', tiny(blade(rot(-5), [0, 0, 0], L)), [0, 0, 0], 'steel', { name: 'bladeB' });
    // handles: two ring-red loops inside / just behind the fist
    for (const sx of [-1, 1]) {
      const c = [0, 1, 2].map((j) => SCIS_U[j] * 0.02 + e[j] * sx * 0.03);
      const pts = [];
      for (const dx of [-0.028, 0.028]) for (const dy of [-0.03, 0.03]) for (const dz of [-0.015, 0.015])
        pts.push([0, 1, 2].map((j) => c[j] + e[j] * dx + u[j] * dy + n[j] * dz));
      add('scis', tiny(pts), [0, 0, 0], 'ring', { name: 'handle' + (sx > 0 ? 'A' : 'B') });
    }
  }
  {
    // chain: three links (outer 0.11 × 0.13 m = 4 × 5 texels, bar 0.034), alternately facing the front and the side
    const link = (cy, side) => {
      const W = 0.11, H = 0.13, b = 0.034, bars = [[0, H / 2 - b / 2, W, b], [0, -H / 2 + b / 2, W, b], [W / 2 - b / 2, 0, b, H], [-W / 2 + b / 2, 0, b, H]];
      return bars.map(([x, y, w, h]) => {
        const g = K.box(w, h, b);
        return K.xf(g, { at: side ? [0, cy + y, x] : [x, cy + y, 0], rot: side ? [0, 90, 0] : [0, 0, 0], scale: 1 });
      });
    };
    const shrink = (g) => K.xf(g, { scale: TINY });
    link(LINK_Y[0], false).forEach((g, i) => add('chain', shrink(g), [0, 0, 0], 'steel', { name: 'link1' + i }));
    link(LINK_Y[1], true).forEach((g, i) => add('chain', shrink(g), [0, 0, 0], 'steel', { name: 'link2' + i }));
    link(0, false).forEach((g, i) => add('link3', shrink(g), [0, 0, 0], 'steel', { name: 'link3' + i }));
  }
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
// tail0/tail1 (axis 'left'): out + = sways toward her RIGHT (across the back), twist + = tips forward / − = back,
// fwd + = yaws forward round her left side. ears (up-axis sided): fwd − = back, out + = outward.
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const HALF = EYES(0, -0.45);
const SQUINT = EYES(0.05, -0.55);
const WIDE = EYES(0.1, 0.18);
const PT_THICK = [0.25, 0, 0.25];   // r3 point: arm segments 1.25× thick (length via '.l')
const EARS = (l, r = l) => ({ earL0: l, earR0: r });
const TAIL = (o0, o1 = 0, tw = 0) => ({ tail0: [0, tw, o0], tail1: [0, 0, o1] });
const breathe = (d, c, extra = {}) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0], ...extra });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
// r2 story props: SCIS = scissors in the right paw (open = blade B swung 30°), CHAIN = the 3-link chain held up in the
// left paw (CHAIN_ARM is the pose the chain bone was placed for: keep it identical on every key that shows the chain)
const SCIS = (open) => ({ 'scis.s': SHOW14, scisB: [0, open, 0] });   // shown 1.4× (reads at 1x); twist opens the blades in view at SE
const CHAIN_ARM = { upperArmL: [80, 0, -20], forearmL: [20, 0, 0], 'chain.s': SHOW };
// snip arm (mincut_ik.js): right paw in front of the belly, scissors pointing across at the link2/link3 junction
const SNIP_ARM = (push) => ({ upperArmR: [40 + push, 0, -10 - push], forearmR: [30, -75, 0] });
// scissors raised beside the head (FOUND, smug): the vote arm without the stretch
const UP_SCIS = { upperArmR: [10, 0, 145], forearmR: [-38, 0, 0] };
// the raised scissors (vote): right arm straight up and a little out (away from the ear), upper arm stretched 1.4×
// and thickened 1.2× (a chunky raised paw, not a twig); the steel blades open above the paw → tip ≈ 0.28 m over the ears
const VOTE_ARM = { upperArmR: [0, 0, 160], forearmR: [-38, 0, 0], 'upperArmR.s': [0.2, 0.5, 0.2], ...SCIS(40), 'scis.s': SHOW };   // 1.0× here (1.4× read oversized overhead)
// DEAD (r2): CURLED asleep on her RIGHT side (hips rolled −90, spine+chest curled 60°, knees drawn up to the chest),
// a low mound (≤ 0.5 m) at every facing so it never reads as sitting; head fwd −70 turns the shut-eyed face toward
// the SE game camera (face shown at S/SE/E/SW/W); ears flat; tail yawed forward round her (fwd +60)
const DEAD = { pos: [0, -0.16, 0], hips: [0, 0, -90], spine: [30, 0, 0], chest: [30, -10, 0], head: [-70, 0, 10], ...BLINK, jaw: [8, 0, 0],
  ...EARS([-55, 0, 25]), thighL: [90, 0, -10], shinL: [-100, 0, 0], thighR: [80, 0, 0], shinR: [-100, 0, 0],
  upperArmR: [40, 0, 10], upperArmL: [60, 0, -20], forearmL: [60, 0, 0], tail0: [60, 0, -10], tail1: [0, 0, -10] };

export const CLIPS = {
  // idle (72, step): breath extremes held long, the tail sways in toward her back and out again, a blink, an ear flick
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: breathe(0, 0, TAIL(0, 0)) },
    { f: 30, pose: breathe(0.014, 2, TAIL(-14, -12)) },
    { f: 36, pose: breathe(0.028, 4, TAIL(-14, -12)) },
    { f: 50, pose: breathe(0.028, 4, { ...TAIL(-14, -12), ...BLINK }) },
    { f: 52, pose: breathe(0.028, 4, TAIL(-14, -12)) },
    { f: 60, pose: breathe(0.028, 4, { ...TAIL(-14, -12), ...EARS([0, 0, 0], [-35, 0, 15]) }) },
    { f: 64, pose: breathe(0.014, 2, TAIL(0, 0)) },
  ] },
  // talk (loop 24): a beat every 6 frames — lower lip open 14° on alternate keys (dark mouth floor under the snout),
  // head ROLL toward the camera (no nod), the free right paw gestures (out low ↔ up by the shoulder), ear flicks, tail
  talk: { fps: 30, loop: true, interp: 'step', length: 24, dynamics: 'hold', events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-4, -8, 0], head: [-6, -10, 8], jaw: [14, 0, 0], upperArmR: [40, 0, 60], forearmR: [30, 0, 0], ...TAIL(0, -2) } },
    { f: 6, pose: { pos: [0, -0.045, 0], chest: [2, -4, 0], head: [0, -14, -6], jaw: [0, 0, 0], ...HALF, upperArmR: [10, 0, 15], forearmR: [10, 0, 0],
      ...EARS([0, 0, 0], [-35, 0, 15]), ...TAIL(-6, -10) } },
    { f: 12, pose: { pos: [0, -0.01, 0], chest: [-4, -12, 0], head: [-6, -6, 12], jaw: [13, 0, 0], upperArmR: [75, 0, 35], forearmR: [70, 0, 0], ...TAIL(4, 4) } },
    { f: 18, pose: { pos: [0, -0.045, 0], chest: [2, -2, 0], head: [0, -12, 2], jaw: [2, 0, 0], ...HALF, upperArmR: [15, 0, 20], forearmR: [10, 0, 0],
      ...EARS([-35, 0, 15], [0, 0, 0]), ...TAIL(-6, -10) } },
  ] },
  // vote: dip (3) → the right paw thrown up-out beside the head (arm stretched), body tilted away, ears up, eyes wide,
  // tail perks up — HELD (one-shot ends on its last real key; clip.length extends it)
  vote: { fps: 30, loop: false, interp: 'step', length: 30, events: { 3: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [8, 0, 0], head: [-8, 0, 0], upperArmR: [-10, 0, 20], forearmR: [30, 0, 0], ...EARS([-15, 0, 10]), ...TAIL(-8, 0) } },
    // r2: scissors held high (no chest twist: the arm stays out to her right of the ears at every facing), body leans to
    // her left, ears tucked a little back, tail perked
    { f: 3, pose: { pos: [0, 0.04, 0], spine: [-2, 0, 6], chest: [-4, -6, 6], head: [-8, 4, -6], ...WIDE, ...EARS([-12, 0, 6]), ...VOTE_ARM, ...TAIL(-14, -10, -12) } },
  ] },
  // die (gentle, no hurt): wobble, ears sag (8) → knees fold, she sits (6) → tips onto her right side (4) → curls up → HELD
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', length: 60, events: { 18: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], spine: [-4, 0, 8], chest: [-6, 0, 8], head: [-4, -10, -14], jaw: [10, 0, 0], ...HALF, ...EARS([-30, 0, 25]), ...TAIL(-12, -10) } },
    { f: 8, pose: { pos: [0, -0.14, 0], spine: [16, 0, -6], chest: [10, 0, 0], head: [-10, -8, 0], ...BLINK, ...EARS([-45, 0, 30]), ...KNEES(60), ...TAIL(8, 6) } },
    { f: 14, pose: { pos: [0, -0.15, 0], spine: [20, 0, -30], chest: [10, 0, -16], head: [-14, -12, 8], ...BLINK, ...EARS([-55, 0, 25]), ...KNEES(60),
      upperArmR: [-10, 0, 40], ...TAIL(4, -10, -10) } },
    { f: 18, pose: DEAD },
  ] },
  // snip (emote: "finds the weakest link", r2 with story props): SCRUTINISE — the left paw holds up a 3-link chain, head
  // cocked to it, squint (12) → FOUND: wide eyes, ears up, scissors out in the right paw raised beside her, "!" (10) →
  // scissors OPEN at the link2/link3 joint (5) → SNIP shut (5) → OPEN (5) → SNIP: the bottom link drops (4) and is gone
  // (4), tail flicks up → SMUG: chin up, half-lid, scissors raised, the 2-link chain still held up (12) → idle (props away)
  snip: { fps: 30, loop: false, interp: 'step', length: 64, events: { 12: 'emote:exclaim@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.02, 0], spine: [4, 0, 0], chest: [4, 8, 0], head: [-6, 16, 16], ...SQUINT, ...EARS([15, 0, 0]),
      ...CHAIN_ARM, upperArmR: [-15, 0, 40], forearmR: [70, 0, 0], ...TAIL(-12, -8) } },
    { f: 12, pose: { pos: [0, 0.03, 0], spine: [-2, 0, 0], chest: [-6, 0, 0], head: [-8, 10, 8], ...WIDE, ...EARS([10, 0, -8]),
      ...CHAIN_ARM, ...UP_SCIS, ...SCIS(40), ...TAIL(6, 4, -10) } },
    { f: 22, pose: { pos: [0, 0, 0], chest: [-4, 4, 0], head: [-8, 12, 6], jaw: [12, 0, 0], ...CHAIN_ARM, ...SNIP_ARM(-8), ...SCIS(45), ...TAIL(-10, -6) } },
    { f: 27, pose: { pos: [0, -0.03, 0], chest: [2, 4, 0], head: [-4, 12, -2], jaw: [0, 0, 0], ...HALF, ...CHAIN_ARM, ...SNIP_ARM(0), ...SCIS(-6), ...TAIL(0, 0) } },
    { f: 32, pose: { pos: [0, 0, 0], chest: [-4, 4, 0], head: [-8, 12, 6], jaw: [12, 0, 0], ...CHAIN_ARM, ...SNIP_ARM(-8), ...SCIS(45), ...TAIL(-10, -6) } },
    { f: 37, pose: { pos: [0, -0.04, 0], chest: [4, 4, 0], head: [-2, 12, -4], jaw: [0, 0, 0], ...HALF, ...CHAIN_ARM, ...SNIP_ARM(0), ...SCIS(-6),
      'link3.p': [0, -0.1 * TINY, 0], ...EARS([-20, 0, 10]), ...TAIL(8, 4, -14) } },
    { f: 40, pose: { pos: [0, -0.04, 0], chest: [4, 4, 0], head: [-2, 12, -4], jaw: [0, 0, 0], ...HALF, ...CHAIN_ARM, ...SNIP_ARM(0), ...SCIS(-6),
      'link3.s': [-1, -1, -1], ...EARS([-20, 0, 10]), ...TAIL(8, 4, -14) } },
    { f: 45, pose: { pos: [0, 0.01, 0], spine: [-4, 0, 0], chest: [-6, -4, 0], head: [-12, -10, 8], ...HALF, jaw: [6, 0, 0], ...EARS([8, 0, -4]),
      ...CHAIN_ARM, 'link3.s': [-1, -1, -1], ...UP_SCIS, ...SCIS(0), ...TAIL(-14, -12) } },
    { f: 57, pose: breathe(0, 0, TAIL(0, 0)) },
  ] },
  // point (r3, the game's shared emote, "THAT one"): paws drawn in, head + ears snap to the target, sly half-lid (4) →
  // BOTH paws thrust forward-UP along the facing (R W4 point; probe shots/char-mincut/r3/px-stack.png row 2): the chest
  // twisted 16° to her left so the RIGHT shoulder leads (the near arm at SE/E; it reads at SW/W too), the right arm
  // fwd 105 out 4 reaching +80/+60 % ('.l') and 1.25× thick (no twig), the left paw forward-up-out (fwd 95 out 30,
  // +70 %) so the point leaves the outline at S too; tail flicked out — HELD 24 → paws down (6) → idle
  point: { fps: 30, loop: false, interp: 'step', length: 35, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], spine: [4, -6, 0], chest: [4, -8, 0], head: [-6, -10, 0], ...HALF, ...EARS([10, 0, 0]),
      upperArmR: [30, 0, 30], forearmR: [60, 0, 0], upperArmL: [20, 0, 10], forearmL: [50, 0, 0], ...TAIL(-6, 0) } },
    { f: 4, pose: { pos: [0, 0.01, 0.02], spine: [0, 12, 0], chest: [-4, 16, 0], head: [-8, -16, 4], jaw: [8, 0, 0], ...EYES(0.1, -0.3), ...EARS([18, 0, -6]),
      upperArmR: [105, 0, 4], forearmR: [-30, 0, 0], 'upperArmR.l': [0.8], 'forearmR.l': [0.6], 'upperArmR.s': PT_THICK, 'forearmR.s': PT_THICK,
      upperArmL: [95, 0, 30], forearmL: [-25, 0, 0], 'upperArmL.l': [0.7], 'upperArmL.s': PT_THICK, 'forearmL.s': PT_THICK, ...TAIL(-22, -14) } },
    { f: 28, pose: { pos: [0, -0.01, 0], chest: [0, -4, 0], head: [-4, -6, 0], ...HALF, ...EARS([6, 0, 0]), upperArmR: [40, 0, 20], forearmR: [40, 0, 0],
      upperArmL: [20, 0, 12], forearmL: [30, 0, 0], ...TAIL(-4, -2) } },
    { f: 34, pose: breathe(0, 0, TAIL(0, 0)) },
  ] },
  // ghost / ghost-spent (r3; spec.ghost draws the pale ramp, the gold halo, the hover and the floating legs): a slow
  // drift, paws floating out in turn, head rolling, the ringed tail swaying out; spent = sunk lower, head bowed, ears
  // back, paws hanging, the tail drooped (tipped forward)
  ghost: { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 16, 32, 48].map((f, i) => ({ f, pose: {
    pos: [0, [0.03, 0.015, 0, 0.015][i], 0], head: [-6, 0, [4, 0, -4, 0][i]], ...(i === 2 ? HALF : {}),
    upperArmL: [12, 0, 16 + 8 * (i % 2)], upperArmR: [12, 0, 16 + 8 * ((i + 1) % 2)], forearmL: [20, 0, 0], forearmR: [20, 0, 0],
    thighL: [20, 0, 0], shinL: [-30, 0, 0], thighR: [20, 0, 0], shinR: [-30, 0, 0], ...TAIL([-6, -14, -20, -14][i], [-4, -12, -16, -10][i]) } })) },
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [0, 18, 36, 54].map((f, i) => ({ f, pose: {
    pos: [0, [-0.02, -0.035, -0.05, -0.035][i], 0], spine: [6, 0, 0], chest: [6, 0, 0], head: [14, 0, [3, 0, -3, 0][i]], ...HALF, ...EARS([-35, 0, 20]),
    upperArmL: [4, 0, 12], upperArmR: [4, 0, 12], thighL: [25, 0, 0], shinL: [-35, 0, 0], thighR: [25, 0, 0], shinR: [-35, 0, 0],
    ...TAIL([-4, -8, -12, -8][i], [-2, -6, -8, -6][i], 20) } })) },
  // walk / run (LegGait plays them for the upper body, blended onto the plan's bob/arms): f0 = left contact.
  // The big tail sways across the back with tail1 one drawing behind tail0 (follow-through); ears flop back on contacts.
  walk: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { ...TAIL(6, -26), ...EARS([-22, 0, 8]) } },
    { f: 1, pose: { ...TAIL(-8, 8) } },
    { f: 2, pose: { ...TAIL(-32, 2), ...EARS([-22, 0, 8]) } },
    { f: 3, pose: { ...TAIL(-16, -32) } },
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { ...TAIL(6, -24, -25), ...EARS([-35, 0, 12]) } },
    { f: 1, pose: { ...TAIL(-8, 6, -35), ...EARS([-15, 0, 5]) } },
    { f: 2, pose: { ...TAIL(-30, 0, -25), ...EARS([-35, 0, 12]) } },
    { f: 3, pose: { ...TAIL(-16, -30, -35), ...EARS([-15, 0, 5]) } },
  ] },
};

export function make() {
  const S = skeleton();
  return {
    name: 'mincut',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['fur', 'white'],
    faceSlot: 'white',
    bodyPlan: 'uprightAnimal',
    heightPx: [40, 52],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'snip',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0.25, 0.52, 0.0] } },
    chains: [],
    personality: { body: { f: 3, zeta: 0.6, r: 0 }, head: { f: 3.2, zeta: 0.65, r: 0 } },
    locomotion: { plan: 'biped', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.18, 0.1], reach: 0.6, arms: [20, 40], elbows: [45, 60], bob: [0.05, 0.1], lean: [6, 14],
      lift: [0.07, 0.1], twist: [6, 9] },
    character: { quant: { yaw: 8, chain: 4 } },
    ghost: { hover: 0.14, keepHue: 0.3 },   // r3: russet + white mask are the identity: keep some hue on the pale ramp
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', earL0: 'mid', earR0: 'mid' } },
  };
}

export default make();
