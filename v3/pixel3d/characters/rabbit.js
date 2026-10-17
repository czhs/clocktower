// Clover (char-rabbit) — cast member "rabbit", villager: "Herbalist. Knows which leaf heals and which one doesn't."
// Design sheet (Unique to me, timing charts, self-critique): characters/rabbit.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/rabbit.ts + refs/cast/rabbit.png.
// Body plan: upright CHIBI skeleton (chibi(), 2.15 heads, v2 draws her upright in a moss dress) driven by the LegGait
// 'hop' plan on GHOST hind legs (r3; the visible boots stay FK under the hem): a rabbit HOP, one per 0.3 s cycle. The long ears
// are 1-link spring chains (they lag the hop arc and stream back with the travel); in actions they are KEYED (the chain
// target follows the keyed ear bone) and `dynamics: 'snap'` snaps them per key. The bouquet arm pair rides the REST pose
// in the gait (no authored clips.walk; since module fix M1 one could key the upper body per drawing), so the rest geometry
// is the carry pose. Touch-up (2026-10-16): + point, ghost, ghost-spent (Clocktower clips; ghost look in the spec, GHOST_GLSL).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.32;                 // v2 33 px → castHeight 1.32 m (ear tips)
export const V_GAME = 3.95 * HEIGHT;        // 5.21 m/s
const SKH = 0.95;                           // chibi template height = top of the skull (the ears stand above it)

// [hi, mid, sh] sRGB. 5 slots + accent (flower gold) + story-prop accent (the leaf).
export const PALETTE = {
  fur: ['#F8E8FF', '#DECCF4', '#9E8CBE'],     // signature: head + ears (lightest mass), paws, legs, cotton tail. r3: COOL lilac
                                              // white (golden sun turned the warm r2 cream #F0BE7B peach = an orange rabbit)
  pink: ['#F6B8C0', '#E48C9C', '#A65C78'],    // ear insides, nose, blush, pink flowers
  dress: ['#7CBCA4', '#3A7A6C', '#587C84'],   // moss dress moved to teal-jade (h ≈ 165); r3 shadow lifted (#3C4A62 read as a navy cape)
  cream: ['#FFF4D8', '#EAD8B4', '#A8928C'],   // apron, petticoat, white flowers, eye glint
  dark: ['#9A6C52', '#6A4430', '#46323A'],    // boots, mouth inside
  eye: ['#5C4A64', '#2E2436', '#3A3040'],     // eyes only (v2 #1A1020, lifted to the night floor; no black)
  gold: ['#FFE48A', '#F0B640', '#A87638'],    // accent: yellow flowers, apron tie
  leaf: ['#E2F49A', '#9CC84E', '#4E6E52'],    // story prop: the leaf she sniffs, bouquet stems/leaves
};

// arm segment directions at rest [out°, fwd°] (L side; R mirrored): both paws meet in front of the chest (the bouquet)
const ARM = { up: [10, 22], fore: [-58, 58] };
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
const HS = 0.92;                            // head scale (r2: the r1 head buried the dress at S)
const HEAD_UP = 0.05;                       // head raised on the neck: the bodice + bouquet show under the chin
const EAR = { at: [0.1, 0.36, -0.03], dir: [0.16, 1, -0.07], len: 0.42 };
const EAR_YAW = 14;
const EYE = [0.13, 0.2, 0.18];             // head-local L eye joint (r3: ON the 16-gon surface, set to the side like a rabbit's)

export function skeleton() {
  const S0 = chibi({ height: SKH, heads: 2.15, legs: 0.78, arms: 1.25, snout: 0.12, tail: false,
    ears: { n: 1, at: EAR.at, dir: EAR.dir, len: EAR.len }, face: { eye: EYE, brow: false, mouth: [0, 0.135, 0.3] } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM.up], [`hand${s}`, ARM.fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  S.find((b) => b.name === 'jaw').pos = [0, 0.08, 0.16];
  const head = S.find((b) => b.name === 'head');
  head.pos = [head.pos[0], head.pos[1] + HEAD_UP, head.pos[2]];
  // story prop bone: the leaf in the LEFT paw (hidden by scale outside the emote)
  S.push({ name: 'leaf', parent: 'handL', pos: [0, -0.02, 0.03], axis: 'up' });
  // r3 GHOST hop legs (no geometry): the LegGait 'hop' plan IKs these (step events → hop dust, the hop clock), while
  // the VISIBLE legs (thigh/shin/foot + boots) stay FK under the hem and are squashed/stretched with the hop
  // (locomotion.squash): r2 IK'd the visible boots to world plants and they floated through the dress at every drawing
  // (chest, back, in front of the bouquet). Long, bent ghost legs (0.36 m over a 0.27 m hip height) never need the
  // reach dip, so the body curve is exactly the hop's.
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    S.push({ name: `hopThigh${s}`, parent: 'hips', pos: [sx * 0.058, -0.013, 0], axis: 'down' });
    S.push({ name: `hopShin${s}`, parent: `hopThigh${s}`, pos: [0, -0.1, 0.12], axis: 'down' });
    S.push({ name: `hopFoot${s}`, parent: `hopShin${s}`, pos: [0, -0.17, -0.12], axis: 'fwd' });
  }
  // (touch-up, ghost) HALO bone, joint buried inside the skull. Its ring is authored at HALO_K around the joint (a speck
  // inside the head: never seen alive); the ghost clip keys 'halo.s' = 1/HALO_K − 1 to grow it above the ear tips. Its
  // world scale / the head's is also the GHOST SIGNAL the shader reads (GHOST_GLSL): 1 alive, 2 spent, 1000 ghost.
  // Appended LAST (parent earlier) → bone index = array index.
  S.push({ name: 'halo', parent: 'head', pos: [0, 0.2, 0], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

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
function splitTris(arr, pred) {
  const A = [], B = [];
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    (pred(c) ? A : B).push(...arr.slice(i, i + 9));
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  return [mk(A), mk(B)];
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

// head profile (head-local, y 0 = chin): a round white skull, wider than the body (v2 head 12 px over a 13 px hem)
const HEAD = [[0.13, 0], [0.225, 0.05], [0.262, 0.15], [0.258, 0.26], [0.215, 0.35], [0.12, 0.42], [0, 0.44]].map(([r, y]) => [r * HS, y * HS]);
const HEAD_SZ = 0.9;
const HALO_K = 0.001;                       // halo authored scale (skeleton(): buried in the skull while alive)
const HALO_Y = 0.84;                        // halo ring height over its joint at full size (joint head-local y 0.2 → ≈ 0.1 m over the ear tips)

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head ──
  // r3: 16-sided lathe (the r2 octagon's slanted facets left the outer half of each eye floating 0.04 m off the head:
  // the "far-eye nub" at SE/E/NE/SW/W/NW)
  const hl = K.lathe(HEAD, 16, { sz: HEAD_SZ });
  hl.computeBoundingBox();
  const hg = hl.clone().translate(0, -hl.boundingBox.min.y, 0);
  add('head', hg, [0, 0, 0], 'fur', { name: 'skull' });
  // muzzle (r3): a real snout, 0.085 m (3 texels) proud of the face with a slight drop, so the profile reads rabbit
  // (r2's bump stopped at the skull contour: E/W was a white ball with a black lump). Pink nose at its tip (mouth bone).
  add('head', K.hull([[-0.1, 0.085, 0.14], [0.1, 0.085, 0.14], [-0.1, 0.185, 0.15], [0.1, 0.185, 0.15],
    [-0.068, 0.09, 0.3], [0.068, 0.09, 0.3], [-0.06, 0.16, 0.3], [0.06, 0.16, 0.3]]), [0, 0, 0], 'fur', { name: 'muzzle' });
  add('mouth', K.chamferBox(0.07, 0.05, 0.05, 0.3), [0, 0.012, 0.005], 'pink', { name: 'nose' });
  // jaw: the lower lip under the snout (hinge at the back), dark mouth floor just under its top (open ~15° → a 2×1
  // texel dark opening under the nose; r2's 30° chin swung out as a mauve beak)
  add('jaw', K.hull([[-0.07, -0.035, -0.01], [0.07, -0.035, -0.01], [-0.07, 0.008, -0.01], [0.07, 0.008, -0.01],
    [-0.045, -0.025, 0.13], [0.045, -0.025, 0.13], [-0.05, 0.008, 0.13], [0.05, 0.008, 0.13]]), [0, 0, 0], 'fur', { name: 'jaw' });
  add('jaw', K.box(0.075, 0.012, 0.1), [0, 0.006, 0.075], 'dark', { name: 'mouthFloor' });
  // eyes (r3): dark 3×4-texel boxes SUNK onto the 16-gon surface (front face ≤ 0.012 m proud, turned 22° out = the
  // surface normal there), 1-texel cream glint flush with the top-outer corner (r2's 2×2 glint re-rasterised into the
  // middle of the eye on 1-texel breath keys: the goggle eye at SE/SW)
  const EYEC = [-0.007, 0, -0.0121], EYAW = 30;   // front face 0.006 m proud (flush = z-fight hollow eyes)
  const rotY = ([x, y, z], d) => { const a = d * Math.PI / 180; return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]; };
  const onEye = (v) => { const r = rotY(v, EYAW); return [EYEC[0] + r[0], EYEC[1] + r[1], EYEC[2] + r[2]]; };
  add('eyeL', K.xf(K.box(0.09, 0.115, 0.04), { rot: [0, EYAW, 0] }), EYEC, 'eye', { name: 'eye', mirror: true });
  add('eyeL', K.xf(K.box(0.024, 0.024, 0.012), { rot: [0, EYAW, 0] }), onEye([0.033, 0.045, 0.021]), 'cream', { name: 'glint', mirror: true });
  add('head', K.xf(K.box(0.07, 0.04, 0.03), { rot: [0, 30, 0] }), [0.15, 0.105, 0.165], 'pink', { name: 'blush', mirror: true });
  // ears: tall rounded paddles (fur), pink inside panel on the front face, base sunk into the skull
  {
    const u = norm(EAR.dir), L = EAR.len, w = 0.065, d = 0.04;
    const ring = (a, hw, hd, dz = 0) => [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([x, z]) => [x + u[0] * a, u[1] * a, z + dz + u[2] * a]);
    const ear = K.hull([...ring(-0.07, w * 0.95, d), ...ring(L * 0.35, w * 1.1, d), ...ring(L * 0.78, w * 0.85, d * 0.8), ...ring(L, w * 0.35, d * 0.5)]);
    const inner = K.hull([...ring(0.0, w * 0.55, 0.01, d - 0.002), ...ring(L * 0.35, w * 0.7, 0.01, d - 0.002), ...ring(L * 0.78, w * 0.5, 0.01, d * 0.8 - 0.002)]);
    add('earL0', K.xf(ear, { rot: [0, EAR_YAW, 0] }), [0, 0, 0], 'fur', { name: 'ear', mirror: true });
    add('earL0', K.xf(inner, { rot: [0, EAR_YAW, 0] }), [0, 0, 0], 'pink', { name: 'earIn', mirror: true });
  }

  // ── body: jade dress (A-line skirt on hips, bodice on chest), cream apron + bib cut out of the dress surface ──
  const hemY = 0.15, waistY = m.spineY + 0.01, shY = m.shoulderY + 0.02;
  const skirt = K.frustum(8, 0.28, 0.175, waistY - hemY, { sz: 0.92 });
  const [apron, skirtR] = splitTris(subdivide(skirt, 0.03), (p) => {
    const ang = Math.abs(Math.atan2(p[0], p[2])) * 180 / Math.PI;
    return p[2] > 0 && ang < 52 && p[1] > -(waistY - hemY) / 2 + 0.025;   // r3: wider apron (S/SE/SW cream panel shows beside the bouquet)
  });
  const skAt = [0, (hemY + waistY) / 2 - m.hipsY, 0];
  add('hips', skirtR, skAt, 'dress', { name: 'skirt' });
  add('hips', apron, skAt, 'cream', { name: 'apron' });
  add('hips', K.frustum(8, 0.27, 0.27, 0.012, { sz: 0.92 }), [0, hemY - 0.006 - m.hipsY, 0], 'cream', { name: 'hemSole' });
  const bod = K.frustum(8, 0.175, 0.15, shY - waistY + 0.02, { sz: 0.92 });
  const bAt = [0, (shY + waistY) / 2 - 0.01 - m.chestY, 0];
  add('chest', bod, bAt, 'dress', { name: 'bodice' });
  add('hips', K.chamferBox(0.14, 0.07, 0.05, 0.3), [0, waistY - m.hipsY - 0.035, -0.18], 'gold', { name: 'apronTie' });
  // cotton tail: a white puff on the back of the skirt
  add('hips', K.lathe([[0.06, 0], [0.1, 0.05], [0.09, 0.11], [0, 0.14]], 8), [0, waistY - m.hipsY - 0.15, -0.25], 'fur', { name: 'cottonTail' });

  // ── arms: green sleeves, fur paws (bent rest: both paws meet in front of the chest) ──
  const seg = (bone, d, len, r0, r1, name, color) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    add('upperArm' + sd, K.lathe([[0.05, 0], [0.08, 0.05], [0.065, 0.1], [0, 0.12]], 8), [sx * 0.01, -0.03, 0], 'dress', { name: 'puff' + sd });
    seg('upperArm' + sd, m3(armDir(ARM.up)), m.upperArm, 0.058, 0.055, 'sleeve' + sd, 'dress');
    seg('forearm' + sd, m3(armDir(ARM.fore)), m.forearm + 0.01, 0.05, 0.055, 'fore' + sd, 'fur');
    const d = m3(armDir(ARM.fore));
    add('hand' + sd, K.chamferBox(0.085, 0.08, 0.085, 0.4), d.map((v) => v * 0.03), 'fur', { name: 'paw' + sd });
  }

  // ── legs: white fur legs (seen in the hop crouch/stretch), brown boots ──
  add('thighL', K.frustum(4, 0.07, 0.065, m.thigh + 0.02), [0, -m.thigh / 2, 0], 'fur', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.06, 0.066, m.shin), [0, -m.shin / 2, 0], 'fur', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.11, m.ankleY + 0.06, 0.19, 0.35), [0, -m.ankleY / 2 + 0.03, 0.05], 'dark', { name: 'boot', mirror: true });

  // ── bouquet in the RIGHT paw (near side at the game facing), held in front of the chest ──
  const dR = armDir(ARM.fore), B0 = [-dR[0] * 0.05 + 0.03, dR[1] * 0.05 + 0.11, dR[2] * 0.05 + 0.03];
  const bq = (shape, at, color, name) => add('handR', shape, [B0[0] + at[0], B0[1] + at[1], B0[2] + at[2]], color, { name });
  bq(K.frustum(4, 0.03, 0.045, 0.24), [0, -0.09, 0], 'leaf', 'stems');
  // (r2) 5 big blooms (≥ 2.5 texels each; r1's 8 small ones read as confetti speckle at 1x)
  const FL = [[0, 0.11, 0.0, 'pink'], [-0.06, 0.06, 0.03, 'gold'], [0.06, 0.06, 0.03, 'cream'], [-0.045, 0.08, -0.05, 'cream'], [0.05, 0.085, -0.045, 'gold']];
  FL.forEach(([x, y, z, c], i) => bq(K.chamferBox(0.08, 0.072, 0.08, 0.3), [x, y, z], c, `flower${i}`));
  bq(K.xf(K.box(0.1, 0.03, 0.05), { rot: [0, 0, 35] }), [-0.08, 0.0, 0.02], 'leaf', 'bqLeafA');
  bq(K.xf(K.box(0.1, 0.03, 0.05), { rot: [0, 0, -35] }), [0.08, 0.0, 0.02], 'leaf', 'bqLeafB');

  // ── the leaf (story prop) on its own bone, authored at 1/20 size: the emote scales it up ('leaf.s' 19) ──
  const LS = 0.05;
  const leaf = K.hull([[0, 0, 0], [-0.08, 0.08, 0.0], [0.08, 0.08, 0.0], [-0.075, 0.17, 0], [0.075, 0.17, 0], [0, 0.27, 0],
    [0, 0.1, 0.035], [0, 0.1, -0.035]]);
  add('leaf', K.xf(leaf, { scale: [LS, LS, LS] }), [0, 0, 0], 'leaf', { name: 'leafBlade' });
  add('leaf', K.xf(K.box(0.03, 0.08, 0.03), { scale: [LS, LS, LS] }), [0, -0.03 * LS, 0], 'leaf', { name: 'leafStem' });

  // ── ghost halo (touch-up): a flat gold ring floating just over the ear tips (v1 ghost row), band 0.09 m (a 0.06 m band
  // breaks into arcs at 1x, mushroom lesson), authored at HALO_K around the buried halo joint
  const ring = K.lathe([[0.1, 0], [0.19, 0], [0.19, 0.03], [0.1, 0.03], [0.1, 0]], 12);
  add('halo', K.xf(ring, { at: [0, HALO_Y * HALO_K, -0.02 * HALO_K], scale: HALO_K }), [0, 0, 0], 'gold', { name: 'halo' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
// ears (up-axis sided bones): fwd + = tip forward, fwd − = back; out + = outward (both sides)
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const HALF = EYES(0, -0.45);
const WIDE = EYES(0.12, 0.15);
const EARS = (l, r = l) => ({ earL0: l, earR0: r });
const NOSE = (y) => ({ 'mouth.p': [0, y, 0.01] });
const LEAF_ON = { 'leaf.s': [27, 27, 27] };     // r3: 1.4× the r2 leaf (19), which read as 3 texels at 1x
// r3: the leaf held up IN FRONT of the snout (centre), not beside it on the far side (lsearch: leaf bone 0.07 m under
// the nose with the head dipped 14°)
const SNIFF_ARM = { upperArmL: [95, 0, -20], forearmL: [-30, 0, 0], handL: [-80, 0, 0] };
const SNIFF_DIP = { pos: [0, -0.065, 0], spine: [6, 0, 0], chest: [12, 0, 0], head: [12, -6, 0], ...NOSE(0.035), ...BLINK, ...LEAF_ON,
  ...EARS([-10, 0, 12]), ...SNIFF_ARM };
const breathe = (d, c, extra = {}) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0], ...extra });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
// DEAD: curled on her RIGHT side, rolled back (hem away from the game camera, face turned up to it), knees up, head turned to the camera, ears laid flat back, bouquet still in her paws
const DEAD = { pos: [0, -0.2, 0], hips: [-35, 0, -70], spine: [8, 0, 0], chest: [8, -15, 0], head: [-10, -30, 10], ...BLINK, ...EARS([-60, 0, 25]),
  thighL: [95, 0, 0], shinL: [-115, 0, 0], thighR: [85, 0, 0], shinR: [-110, 0, 0], upperArmR: [20, 0, 10], upperArmL: [30, 0, 10] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0) },
    { f: 20, pose: breathe(0, 0, NOSE(0.03)) },
    { f: 24, pose: breathe(0, 0) },
    { f: 30, pose: breathe(0.014, 2) },
    { f: 36, pose: breathe(0.028, 4) },
    { f: 54, pose: breathe(0.028, 4, BLINK) },
    { f: 56, pose: breathe(0.028, 4) },
    { f: 66, pose: breathe(0.014, 2) },
  ] },
  // talk (loop 24): beat every 6 frames — jaw open on alternate keys, the free LEFT paw opens out (≥ 25° per key), body
  // bob + chest twist. The head keeps ONE world orientation (head = const − chest) so the spring ears are not re-aimed
  // on every beat (loop clips ignore clip.dynamics, backlog M5): they only answer the 1.5-texel bob.
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    // r3: jaw opens only 15° (a dark 2×1 opening under the nose; r2's 30° chin read as a beak), the paw beat is ≥ 40°
    // between keys (out-low ↔ up-high). Keyed talk ears were tried: the springs re-settled every 2 frames inside the 6-frame holds (loops ignore clip.dynamics, M5), so the ears stay unkeyed
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-4, -6, 0], head: [-6, -8, 6], jaw: [15, 0, 0], ...NOSE(0.02),
      upperArmL: [20, 0, 75], forearmL: [30, 0, 0], handL: [0, 30, 0] } },
    { f: 6, pose: { pos: [0, -0.045, 0], chest: [2, -2, 0], head: [-12, -12, 6], jaw: [0, 0, 0], ...HALF } },
    { f: 12, pose: { pos: [0, -0.01, 0], chest: [-4, -10, 0], head: [-6, -4, 6], jaw: [14, 0, 0], ...NOSE(0.02),
      upperArmL: [75, 0, 30], forearmL: [75, 0, 0], handL: [0, 40, 0] } },
    { f: 18, pose: { pos: [0, -0.045, 0], chest: [2, 2, 0], head: [-12, -16, 6], jaw: [3, 0, 0], ...HALF } },
  ] },
  // vote: dip (3) → the bouquet thrust UP and OUT on her right (near side at SE) above the ears' midpoint, ears up, eyes
  // wide — HELD. r3: arm straight up (vsearch: forearm [−60,0,60], hand −90) and the forearm scaled 1.4× (bigger
  // bouquet, longer reach): bouquet top ≈ 1.2 m vs ear midpoint 1.12 m (r2 stopped at the ear base)
  vote: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 3: 'vote@handR' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [8, 0, 0], head: [-8, 0, 0], upperArmR: [-10, 0, 10], forearmR: [20, 0, 0], ...EARS([-15, 0, 10]) } },
    { f: 3, pose: { pos: [0, 0.04, 0], spine: [-2, 0, 12], chest: [-4, 0, 12], head: [-6, -12, -14], ...WIDE, ...EARS([10, 0, -4]),
      upperArmR: [30, 0, 140], forearmR: [-60, 0, 60], handR: [-90, 0, 0], 'forearmR.s': [0.4, 0.4, 0.4] } },
  ] },
  // die: gentle — sway, ears sag (8) → knees fold, she sits (6) → tips onto her side (dust ring) → small settle → HELD
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', dynamics: 'snap', events: { 18: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], spine: [-4, 0, -8], chest: [-6, 0, -8], head: [-4, -10, 12], jaw: [10, 0, 0], ...HALF, ...EARS([-30, 0, 25]) } },
    { f: 8, pose: { pos: [0, -0.14, 0], spine: [16, 0, 6], chest: [10, 0, 0], head: [-10, -8, 0], ...BLINK, ...EARS([-45, 0, 30]), ...KNEES(60) } },
    { f: 14, pose: { pos: [0, -0.15, 0], spine: [20, 0, -30], chest: [10, 0, -16], head: [-14, -12, 8], ...BLINK, ...EARS([-55, 0, 25]), ...KNEES(60),
      upperArmL: [-10, 0, 40] } },
    { f: 18, pose: DEAD },
  ] },
  // sniff (emote, "knows which leaf heals and which one doesn't"): pluck (6) → leaf up beside the nose, ears perk (6) →
  // two sniffs: nose twitch + head bob (6 / 6) → verdict POISON: ears droop back, head tilts away, leaf held out (14, skull
  // glyph) → tosses it (6) → ears spring back up, a knowing nod (12) → idle
  sniff: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 30: 'emote:skull@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [8, 0, 0], head: [6, -8, 0], upperArmL: [10, 0, -6], forearmL: [20, 0, 0], ...EARS([8, 0, 0]) } },
    { f: 6, pose: { pos: [0, 0.0, 0], chest: [2, 0, 0], head: [2, -6, 0], ...HALF, ...LEAF_ON, ...EARS([16, 0, -6]),
      ...SNIFF_ARM } },
    // r3: each sniff is a DIP into the leaf (body −0.065 m, head down 16°, ears forward 38°) then a RISE (head up, ears
    // back up): ≥ 3 texels of head travel per beat (r2: a 1-texel tilt)
    { f: 12, pose: SNIFF_DIP },
    { f: 18, pose: { pos: [0, 0.03, 0], chest: [-6, 0, 0], head: [-14, -6, 4], ...HALF, ...LEAF_ON, ...EARS([-4, 0, 4]),
      ...SNIFF_ARM } },
    { f: 24, pose: SNIFF_DIP },
    { f: 30, pose: { pos: [0, -0.04, 0], spine: [0, 0, -6], chest: [0, -10, -8], head: [-4, -20, 16], ...EYES(0, -0.55), jaw: [10, 0, 0], ...LEAF_ON,
      ...EARS([-55, 0, 35]), upperArmL: [60, 0, 70], forearmL: [-40, 0, 0], handL: [-80, 0, 0] } },
    { f: 44, pose: { pos: [0, -0.02, 0], chest: [-2, 4, 0], head: [-6, -10, 0], ...HALF, ...EARS([-30, 0, 20]), upperArmL: [30, 0, 95], forearmL: [0, 0, 0] } },
    { f: 50, pose: { pos: [0, 0.02, 0], chest: [-6, -6, 0], head: [-10, -14, 6], ...WIDE, jaw: [12, 0, 0], ...EARS([12, 0, -6]) } },
    { f: 56, pose: breathe(0, 0, { head: [6, -10, 0] }) },
    { f: 62, pose: breathe(0, 0) },
  ] },
};

// ── point (touch-up: the game's shared emote, "that one!") — the free LEFT paw (the bouquet stays in the right, identity).
// The game turns the avatar toward the target, so the paw points FORWARD; the chest twists so the left shoulder leads and
// the arm is a screen stroke clear of the big head (psearch: upperArmL [70,0,10] + forearmL [−45,0,45] = a straight
// 0.38 m arm, paw 0.36 m ahead at chest height, below the snout so the face stays clear). Ears snap forward at the
// target, eyes wide. 1-drawing forearm stretch on the flick (gesture smear). Held ≈ 3.3 s (pipgws EMOTE_POINT_MS 3.5 s)
// with two small "her!" jabs, then the paw comes back to the bouquet.
const POINT = (d = 0, extra = {}) => ({ pos: [0, 0.01 - 0.025 * d, 0.01 * d], spine: [2 + 3 * d, 4, 0], chest: [-2 + 3 * d, 6, 0],
  head: [-6, 14, 4], ...WIDE, ...EARS([18 + 6 * d, 0, -4]), upperArmL: [70 - 6 * d, 0, 40], forearmL: [-45, 0, 45], handL: [0, 0, 0], ...extra });
CLIPS.point = { fps: 30, loop: false, interp: 'step', dynamics: 'snap', keys: [
  { f: 0, pose: { pos: [0, -0.035, 0], spine: [4, 6, 0], chest: [6, 8, 0], head: [-4, 4, 0], ...HALF, ...EARS([8, 0, 4]),
    upperArmL: [20, 0, 10], forearmL: [40, 0, 0] } },
  { f: 4, pose: POINT(0, { 'forearmL.s': [0.3, 0.3, 0.3], jaw: [12, 0, 0] }) },
  { f: 6, pose: POINT(0, { jaw: [12, 0, 0] }) },
  { f: 18, pose: POINT(1, { jaw: [14, 0, 0], ...NOSE(0.03) }) },
  { f: 24, pose: POINT(0) },
  { f: 52, pose: POINT(1, { jaw: [14, 0, 0], ...NOSE(0.03) }) },
  { f: 58, pose: POINT(0) },
  { f: 92, pose: { pos: [0, -0.02, 0], chest: [2, -6, 0], head: [-4, 6, 0], ...HALF, ...EARS([4, 0, 2]), upperArmL: [30, 0, 15], forearmL: [30, 0, 0] } },
  { f: 100, pose: breathe(0, 0) },
] };

// ── ghost / ghost-spent (touch-up). Dead players hover as a pale-blue ghost (v1 ghost row: a monochrome pale-blue Clover,
// the dress fading out below, a gold halo over the ears while the ghost vote is unspent). All in the spec (mushroom/frog
// recipe): the halo bone's world scale is the per-clip signal read in material.vertex; material.tones remaps every tone by
// luminance onto a pale-blue ramp (spent: desaturated, darker) and a 2×2 ordered `discard` on bind height dissolves the
// skirt (both passes → the bake's alpha is clean). Visible legs are FK (the gait only IKs the ghost hop legs), shins +
// boots scaled into the skirt. Hover = step keys 0.6 s apart, slow ±3° sway, ears keyed (dynamics 'hold' = no settles).
const GHOST_UP = 1 / HALO_K - 1, GHOST_SPENT = 1;
const HIDE_LEGS = { 'shinL.s': [-0.98, -0.98, -0.98], 'shinR.s': [-0.98, -0.98, -0.98] };
const GHOST = (y, roll, halo, extra = {}) => ({ pos: [0, y, 0], spine: [0, 0, roll], chest: [2, 0, roll * 0.5], head: [-6, -6, -roll],
  ...EYES(0, -0.2), ...EARS([-6, 0, 14 + roll]), ...HIDE_LEGS, 'halo.s': [halo, halo, halo], ...extra });
const ghostClip = (hi, lo, roll, halo, extra = {}) => ({ fps: 30, loop: true, interp: 'step', length: 72, legs: 'fk', dynamics: 'hold', keys: [
  { f: 0, pose: GHOST(hi, roll, halo, extra) },
  { f: 18, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
  { f: 36, pose: GHOST(lo, -roll, halo, extra) },
  { f: 46, pose: GHOST(lo, -roll, halo, { ...extra, ...BLINK }) },
  { f: 48, pose: GHOST(lo, -roll, halo, extra) },
  { f: 54, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
] });
CLIPS.ghost = ghostClip(0.30, 0.25, 3, GHOST_UP);
// spent: lower, heavier hover, head bowed, ears drooped back, heavy lids, no halo, dimmer (shader)
CLIPS['ghost-spent'] = ghostClip(0.22, 0.19, 2, GHOST_SPENT, { head: [6, -6, 0], ...HALF, ...EARS([-28, 0, 20]) });

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
  fragmentHead: `flat varying float vGhost; flat varying float vGhostHalo;
    vec3 ghostTone(vec3 c, float spent) {
      float l = pow(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 0.42);
      vec3 g = mix(vec3(${lin('#4E6C9C')}), vec3(${lin('#DCF4FC')}), l);
      return spent > 0.5 ? mix(g, vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), 0.45) * 0.62 : g;
    }`,
  tones: `
    if (vGhost > 0.5 && vGhostHalo < 0.5) {
      float gSpent = vGhost > 1.5 ? 1.0 : 0.0;
      float gLo = mix(0.10, 0.14, gSpent), gHi = mix(0.36, 0.40, gSpent);
      float gA = clamp((vCharBind.y - gLo) / (gHi - gLo), 0.0, 1.0);
      ivec2 gq = ivec2(gl_FragCoord.xy) & 1;
      float gT = gq.x == 0 ? (gq.y == 0 ? 0.125 : 0.625) : (gq.y == 0 ? 0.875 : 0.375);
      if (gA < gT) discard;
      toonHi = ghostTone(toonHi, gSpent); toonMid = ghostTone(toonMid, gSpent); toonSh = ghostTone(toonSh, gSpent);
    }`,
};

const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  return {
    name: 'rabbit',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['fur', { part: 'earIn' }],
    faceSlot: 'fur',
    bodyPlan: 'hopper',
    heightPx: [42, 52],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'hop' },
    emote: 'sniff',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0.3, 0.5, 0.05] } },
    chains: [
      { name: 'earL', bones: ['earL0'], f: 5, zeta: 0.8, r: 0, gravity: 0.15, drag: 1, limit: 35, tip: 'axis', len: EAR.len },
      { name: 'earR', bones: ['earR0'], f: 5, zeta: 0.8, r: 0, gravity: 0.15, drag: 1, limit: 35, tip: 'axis', len: EAR.len },
    ],
    personality: { body: { f: 4, zeta: 0.6, r: 0 }, head: { f: 4, zeta: 0.7, r: 0 } },
    // r3: the gait IKs the GHOST legs (skeleton()); the visible legs ride FK under the hem. squash on head + both
    // thighs: touchdown drawing = legs 16 % shorter (sole up 0.051 m) while the body drops 0.06·height = 0.051 m
    // (height 0.856 m is ONLY the crouch-depth knob: crouch = −0.06·height), so the boots stay on the ground, the hem
    // comes down ~2 texels and the head + ears squash 16 %; flight drawings stretch legs + head ~10 % (extension).
    locomotion: { plan: 'hop', legs: { HL: ['hopThighL', 'hopShinL', 'hopFootL'], HR: ['hopThighR', 'hopShinR', 'hopFootR'] },
      walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4], duty: [0.25, 0.2],
      hop: [0.36 * HEIGHT, 0.44 * HEIGHT], lean: [10, 16], surge: false,
      height: 0.856, lift: [0, 0], squash: { bones: ['head', 'thighL', 'thighR'], amount: 0.16 },
      stepLift: 0.06, stepTol: 0.072, vStart: 0.122, vStop: 0.066 },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', earL0: 'mid', earR0: 'mid', handL: 'mid', handR: 'mid', leaf: 'mid' },
      slots: { gold: { lift: 0.3 }, cream: { lift: 0.3 }, pink: { lift: 0.3 }, leaf: { lift: 0.3 } },
      // ghost / ghost-spent look (GHOST_GLSL; bone index = skeleton order)
      vertexHead: GHOST_GLSL.vertexHead, fragmentHead: GHOST_GLSL.fragmentHead, tones: GHOST_GLSL.tones,
      vertex: GHOST_GLSL.vertex(S.findIndex((b) => b.name === 'head'), S.findIndex((b) => b.name === 'halo')) },
  };
}

export default make();
