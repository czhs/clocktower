// Ginger (char-fox) — cast member "fox", villager: "Keeps the inn, and every rumour that passes through it."
// Design sheet (Unique to me, timing charts, self-critique): characters/fox.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/fox.ts + refs/cast/fox.png.
// Body plan: upright CHIBI (chibi(), 2.15 heads; v2 draws her upright in a dress), LegGait 'biped' skip-trot at the v2
// game speed (3.95 H/s). The big white-tipped tail is a keyed bone whose yaw is driven in walk/run by the gait's
// left-arm swing channel (locomotion.bones.armL → tail0): it swishes once per cycle and carries the rhythm; the mug arm
// keeps its carry REST pose (bent rest geometry, the elbow channel goes to the part-less bone `mugHold`).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.32;                 // v2 33 px → castHeight 1.32 m (ear tips)
export const V_GAME = 3.95 * HEIGHT;        // 5.21 m/s

// [hi, mid, sh] sRGB. 5 slots + 1 accent (the blue collar bow).
export const PALETTE = {
  fur: ['#F4A05E', '#DE7038', '#B4605A'],     // signature: head, ears, tail, forearms (warm orange, mauve-red shadow)
  dress: ['#C8505A', '#9C2F3A', '#5E2A44'],   // red dress + puffed sleeves
  cream: ['#FFF6E4', '#F1E2C8', '#B8A0A4'],   // muzzle/cheeks, apron, tail tip, ear inside, foam, eye glint
  dark: ['#7A5048', '#4E3438', '#3E2C36'],    // ear tips, nose, eyes, mouth inside, boots
  wood: ['#C08A50', '#8A5A32', '#5E4038'],    // the mug
  bow: ['#8AA8E8', '#3D5EA6', '#2E3C6E'],     // accent: collar bow
  // touch-up (ghost clips): pale-blue ghost shell (v2 ghost row) + gold halo; a dimmer grey-blue shell for ghost-spent
  gFur: ['#E2F0FF', '#A8C8EC', '#7894C4'],
  gCream: ['#F4FAFF', '#D4E6F8', '#9CB4D8'],
  gDress: ['#B4C4EE', '#8CA0D4', '#6474AA'],
  gDark: ['#6C80B8', '#4C5C96', '#3E4A7A'],
  halo: ['#FFF4C8', '#F2D27A', '#B8945A'],
  sFur: ['#AAB4CC', '#8890AC', '#646C8A'],
  sCream: ['#BEC6D8', '#9EA6BC', '#767E98'],
  sDress: ['#8C90AE', '#6C7090', '#545670'],
  sDark: ['#5A5E7C', '#464A64', '#383A50'],
};
// ghost shells: every visible part gets a pale copy on a part-less child bone (g_<bone> ghost, s_<bone> spent), baked at
// 1/1000 size so it is invisible in every other clip; the ghost clips scale those bones ×1000 ('<bone>.s' 999). Each copy is
// inflated by SHELL_D about its own (or its split group's) centre so it covers the living part. Boots are hidden instead.
const SHELL_BONES = ['head', 'jaw', 'eyeL', 'eyeR', 'earL0', 'earR0', 'hips', 'chest', 'upperArmL', 'forearmL', 'handL',
  'upperArmR', 'forearmR', 'handR', 'tail0'];
const SHELL_D = 0.006, TINY = 0.001;
const SHELL_MAP = {
  g: { fur: 'gFur', cream: 'gCream', dress: 'gDress', dark: 'gDark', wood: 'gDress', bow: 'gDark' },
  s: { fur: 'sFur', cream: 'sCream', dress: 'sDress', dark: 'sDark', wood: 'sDress', bow: 'sDark' },
};
const SHELL_GROUP = { skull: 'head', muzzle: 'head', skirt: 'skirt', apron: 'skirt', bodice: 'bod', bib: 'bod' };

const BODY = { height: 1.10, heads: 2.2, legs: 0.7, arms: 1.0, snout: 0.3, tail: false };
// ears: 1-link bones (keyed, not sprung) standing up and a little out on the top of the head
const EAR = { at: [0.14, 0.38, -0.02], dir: [0.28, 1, -0.06], len: 0.35 };   // r2: base sunk 0.02 into the skull
// arm segment directions at rest: [out°, fwd°] (L side; R mirrored). LEFT = mug arm: forearm carried forward.
const ARM = { L: { up: [16, 6], fore: [12, 62] }, R: { up: [10, 0], fore: [10, 12] } };
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
const EAR_YAW = 22;                        // ear faces turned outward (v2: ears at ±40° on the head)
const EYE = [0.105, 0.265, 0.226];          // head-local L eye joint (r2: +0.03 up, so the face fills more of the head front)
const TAIL_AT = [0, -0.13, -0.15];          // hips-local tail root (back of the skirt)

export function skeleton() {
  const S0 = chibi({ ...BODY, ears: { n: 1, at: EAR.at, dir: EAR.dir, len: EAR.len },
    face: { eye: EYE, brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  // bent rest arms (the gait swings the free right arm about this rest; the mug arm is not swung)
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM[s].up], [`hand${s}`, ARM[s].fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  // jaw hinge at the BACK of the mouth, under the snout (frog lesson: a front hinge barely moves the lip)
  S.find((b) => b.name === 'jaw').pos = [0, 0.105, 0.17];
  // tail: one keyed bone, axis sideways so 'fwd' = yaw about the vertical (the swish); geometry points back-right-up
  S.push({ name: 'tail0', parent: 'hips', pos: TAIL_AT, axis: 'left' });
  S.push({ name: 'mugHold', parent: 'chest', pos: [0, 0, 0], axis: 'down' });
  for (const k of ['g', 's']) for (const b of SHELL_BONES) S.push({ name: `${k}_${b}`, parent: b, pos: [0, 0, 0], axis: 'up' });
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
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// convex hull of rings (n points, radius r) around centreline points c[i] with tangent t[i]
function ringHull(cs, rs, ts, n = 6) {
  const pts = [];
  cs.forEach((c, i) => {
    const t = norm(ts[i]); let b = cross(t, [0, 1, 0]); if (Math.hypot(...b) < 1e-3) b = [1, 0, 0]; b = norm(b);
    const u = norm(cross(b, t));
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push([0, 1, 2].map((j) => c[j] + (Math.cos(a) * b[j] + Math.sin(a) * u[j]) * rs[i])); }
  });
  return K.hull(pts);
}

// head profile (head-local: y 0 = chin), one 8-sided lathe; muzzle + cheeks cut out of it in cream
const HEAD = [[0.15, 0], [0.245, 0.06], [0.275, 0.16], [0.268, 0.27], [0.215, 0.38], [0.11, 0.455], [0, 0.48]];
const HEAD_SZ = 0.9;
// tail centreline (tail-root-local, character axes): back, out to her RIGHT (−X), curling up; white from 0.85
// r2: ≈ 0.66 m brush, swept out to her RIGHT so orange shows beside the skirt at S/SW; cream only on the last ≈ 20 %
const TAIL = [[0, 0, 0, 0.065], [-0.12, 0.0, -0.05, 0.105], [-0.27, 0.03, -0.08, 0.135], [-0.42, 0.08, -0.11, 0.14], [-0.53, 0.17, -0.17, 0.115], [-0.60, 0.28, -0.25, 0.035]];

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head ──
  const hl = K.lathe(HEAD, 8, { sz: HEAD_SZ });
  hl.computeBoundingBox();
  const hg = hl.clone().translate(0, -hl.boundingBox.min.y, 0);     // y 0 = chin
  const [muzG, furG] = splitTris(subdivide(hg, 0.035), (p) => {
    const ang = Math.abs(Math.atan2(p[0], p[2])) * 180 / Math.PI;    // 0 = front
    return ang < 100 && p[1] < 0.15 + 0.06 * Math.max(0, 1 - ang / 70);
  });
  add('head', furG, [0, 0, 0.0], 'fur', { name: 'skull' });
  add('head', muzG, [0, 0, 0.0], 'cream', { name: 'muzzle' });
  // snout: a cream wedge forward of the lower face, dark nose at the tip (species read in profile)
  add('head', K.hull([[-0.085, 0.10, 0.17], [0.085, 0.10, 0.17], [-0.075, 0.20, 0.16], [0.075, 0.20, 0.16],
    [-0.035, 0.11, 0.37], [0.035, 0.11, 0.37], [-0.03, 0.165, 0.36], [0.03, 0.165, 0.36]]), [0, 0, 0], 'cream', { name: 'snout' });
  add('head', K.chamferBox(0.075, 0.06, 0.05, 0.3), [0, 0.155, 0.37], 'dark', { name: 'nose' });
  // jaw (hinge at the back, under the snout): cream underside + dark mouth floor on its top face (shows when open)
  add('jaw', K.hull([[-0.07, -0.045, -0.01], [0.07, -0.045, -0.01], [-0.07, 0.0, -0.01], [0.07, 0.0, -0.01],
    [-0.03, -0.02, 0.17], [0.03, -0.02, 0.17], [-0.03, 0.0, 0.17], [0.03, 0.0, 0.17]]), [0, 0, 0], 'cream', { name: 'jaw' });
  add('jaw', K.box(0.09, 0.02, 0.14), [0, 0.0, 0.07], 'dark', { name: 'mouthFloor' });
  // eyes: 2×2-texel dark boxes, a 1-texel cream glint at the upper outer corner
  // r2: 0.088 m box, turned out 15° and set proud of the 8-sided lathe so 2×2 texels survive at S/SE/SW
  add('eyeL', K.xf(K.box(0.088, 0.09, 0.04), { rot: [0, 15, 0] }), [0.004, 0, 0.012], 'dark', { name: 'eye', mirror: true });
  add('eyeL', K.xf(K.box(0.032, 0.032, 0.02), { rot: [0, 15, 0] }), [0.024, 0.022, 0.03], 'cream', { name: 'glint', mirror: true });
  // ears: a tall 4-sided pyramid-ish hull (fur), dark tip cut at the same surface, cream inside panel on the front
  for (const s of ['L']) {
    const u = norm(EAR.dir), L = EAR.len, w = 0.12, d = 0.065;   // r2: wider base, sunk into the skull (one region)
    const P0 = (a, hw, hd, dz = 0) => [[-hw, 0, -hd + dz], [hw, 0, -hd + dz], [-hw, 0, hd + dz], [hw, 0, hd + dz]].map(([x, , z]) => [x + u[0] * a, u[1] * a, z + u[2] * a]);
    add('ear' + s + '0', K.xf(K.hull([...P0(-0.08, w * 1.05, d), ...P0(L * 0.72, w * 0.32, d * 0.55)]), { rot: [0, EAR_YAW, 0] }), [0, 0, 0], 'fur', { name: 'ear', mirror: true });
    add('ear' + s + '0', K.xf(K.hull([...P0(L * 0.72, w * 0.32, d * 0.55), ...P0(L, 0.02, 0.018)]), { rot: [0, EAR_YAW, 0] }), [0, 0, 0], 'dark', { name: 'earTip', mirror: true });
    add('ear' + s + '0', K.xf(K.hull([...P0(0.0, w * 0.72, 0.012, d - 0.004), ...P0(L * 0.72, w * 0.26, 0.012, d * 0.55 - 0.004)]), { rot: [0, EAR_YAW, 0] }), [0, 0, 0], 'cream', { name: 'earIn', mirror: true });
  }

  // ── body: red dress (A-line skirt on hips, bodice on chest), cream apron + bib cut out of the dress surface ──
  const hemY = 0.13, waistY = m.spineY + 0.01, shY = m.shoulderY + 0.025;
  const skirt = K.frustum(8, 0.25, 0.165, waistY - hemY, { sz: 0.9 });
  const [apron, skirtR] = splitTris(subdivide(skirt, 0.03), (p) => {
    const ang = Math.abs(Math.atan2(p[0], p[2])) * 180 / Math.PI;
    return p[2] > 0 && ang < 40 && p[1] > -(waistY - hemY) / 2 + 0.035;
  });
  const skAt = [0, (hemY + waistY) / 2 - m.hipsY, 0];
  add('hips', skirtR, skAt, 'dress', { name: 'skirt' });
  add('hips', apron, skAt, 'cream', { name: 'apron' });
  add('hips', K.frustum(8, 0.24, 0.24, 0.012, { sz: 0.9 }), [0, hemY - 0.006 - m.hipsY, 0], 'cream', { name: 'hemSole' });   // r2: cream petticoat cap (the held die pose showed a dark maroon hem interior)
  const bod = K.frustum(8, 0.17, 0.15, shY - waistY + 0.02, { sz: 0.92 });
  const [bib, bodR] = splitTris(subdivide(bod, 0.03), (p) => p[2] > 0 && Math.abs(Math.atan2(p[0], p[2])) * 180 / Math.PI < 24 && p[1] < (shY - waistY) / 2 - 0.035);
  const bAt = [0, (shY + waistY) / 2 - 0.01 - m.chestY, 0];
  add('chest', bodR, bAt, 'dress', { name: 'bodice' });
  add('chest', bib, bAt, 'cream', { name: 'bib' });
  // collar bow (front) and apron bow (back)
  add('chest', K.chamferBox(0.11, 0.06, 0.05, 0.3), [0, shY - m.chestY - 0.01, 0.13], 'bow', { name: 'bow' });
  add('hips', K.chamferBox(0.13, 0.07, 0.05, 0.3), [0, waistY - m.hipsY - 0.04, -0.17], 'cream', { name: 'apronBow' });

  // ── arms: puffed red sleeves, fur forearm + paw (bent rest directions) ──
  const seg = (bone, d, len, r0, r1, name, color) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    add('upperArm' + sd, K.lathe([[0.05, 0], [0.085, 0.05], [0.07, 0.11], [0, 0.13]], 8), [sx * 0.01, -0.03, 0], 'dress', { name: 'puff' + sd });
    seg('upperArm' + sd, m3(armDir(ARM[sd].up)), m.upperArm, 0.06, 0.055, 'sleeve' + sd, 'dress');
    seg('forearm' + sd, m3(armDir(ARM[sd].fore)), m.forearm + 0.01, 0.05, 0.055, 'fore' + sd, 'fur');
    const d = m3(armDir(ARM[sd].fore));
    add('hand' + sd, K.chamferBox(0.085, 0.085, 0.09, 0.4), d.map((v) => v * 0.035), 'dark', { name: 'paw' + sd });
  }

  // ── boots only (legs hidden in the skirt) ──
  // r2: taller boot (top reaches the hem) with a long toe kicked forward out of the hem
  add('footL', K.chamferBox(0.115, m.ankleY + 0.075, 0.2, 0.35), [0, -m.ankleY / 2 + 0.035, 0.06], 'wood', { name: 'boot', mirror: true });   // r2: leather-brown (wood slot) so the boots read against the red hem

  // ── tail (tail0): fur body + cream tip, two hulls meeting at the 0.85 ring ──
  const C = TAIL.map((t) => t.slice(0, 3)), R = TAIL.map((t) => t[3]);
  const T = C.map((c, i) => { const a = C[Math.max(0, i - 1)], b = C[Math.min(C.length - 1, i + 1)]; return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; });
  add('tail0', K.xf(ringHull(C.slice(0, 5), R.slice(0, 5), T.slice(0, 5), 8), { rot: [0, 0, 0] }), [0, 0, 0], 'fur', { name: 'tail' });
  add('tail0', K.xf(ringHull(C.slice(4), R.slice(4), T.slice(4), 8), { rot: [0, 0, 0] }), [0, 0, 0], 'cream', { name: 'tailTip' });
  // tail hull positions are absolute (K.hull is not centred)

  // ── mug in the LEFT paw (hand-local, upright at rest): wooden tankard, cream foam, handle outward ──
  const g = armDir(ARM.L.fore).map((v) => v * 0.05);
  const MUG = [g[0] + 0.06, g[1] - 0.01, g[2] + 0.06];
  add('handL', K.frustum(8, 0.08, 0.074, 0.17), MUG, 'wood', { name: 'mug' });
  add('handL', K.lathe([[0.085, 0], [0.088, 0.03], [0.06, 0.055], [0, 0.065]], 8), [MUG[0], MUG[1] + 0.115, MUG[2]], 'cream', { name: 'foam' });
  add('handL', K.box(0.035, 0.09, 0.05), [MUG[0] + 0.1, MUG[1] + 0.005, MUG[2]], 'wood', { name: 'mugHandle' });
  return [...P, ...shells(P, 'g', m), ...shells(P, 's', m)];
}

// bone-local triangle soup of a part (geometry + at)
function soup(p) {
  const g = p.shape.index ? p.shape.toNonIndexed() : p.shape, a = g.attributes.position.array, out = [];
  for (let i = 0; i < a.length; i += 3) out.push([a[i] + p.at[0], a[i + 1] + p.at[1], a[i + 2] + p.at[2]]);
  return out;
}
function bbox(pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const q of pts) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], q[j]); hi[j] = Math.max(hi[j], q[j]); }
  return { c: lo.map((v, j) => (v + hi[j]) / 2), sz: lo.map((v, j) => hi[j] - v) };
}
function shells(P, k, m) {
  const base = P.filter((p) => SHELL_BONES.includes(p.bone));
  const groups = {};
  for (const p of base) { const gk = SHELL_GROUP[p.name]; if (gk) (groups[gk] ||= []).push(...soup(p)); }
  const out = [];
  const emit = (bone, pts, c, sz, color, name, mirror) => {
    const sc = sz.map((v) => 1 + 2 * SHELL_D / Math.max(v, 0.02));
    const arr = [];
    for (let i = 0; i < pts.length; i += 3) {
      const tri = [0, 1, 2].map((j) => pts[i + j].map((v, a) => (c[a] + sc[a] * (v - c[a])) * TINY * (a === 0 && mirror ? -1 : 1)));
      if (mirror) tri.reverse();
      arr.push(...tri.flat());
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    out.push({ bone: `${k}_${bone}`, shape: K.flat(g), at: [0, 0, 0], color, name: `${k}_${name}` });
  };
  for (const p of base) {
    const pts = soup(p), gk = SHELL_GROUP[p.name];
    const { c, sz } = bbox(gk ? groups[gk] : pts);
    const col = SHELL_MAP[k][p.color] || p.color;
    emit(p.bone, pts, c, sz, col, p.name, false);
    if (p.mirror) emit(p.bone.replace(/L(\d*)$/, 'R$1'), pts, c, sz, col, p.name + 'R', true);
  }
  // the ghost's lower body: a tapering wisp under the hem (no boots), leaning back as it trails
  const hy = 0.13 - m.hipsY;
  const W = [[0, hy + 0.03, 0, 0.235], [0, hy - 0.08, -0.04, 0.17], [0, hy - 0.17, -0.12, 0.1], [0, hy - 0.24, -0.24, 0.03]];
  const wc = W.map((w) => w.slice(0, 3)), wr = W.map((w) => w[3]);
  const wt = wc.map((c2, i) => { const a = wc[Math.max(0, i - 1)], b = wc[Math.min(wc.length - 1, i + 1)]; return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; });
  const wisp = ringHull(wc, wr, wt, 8);
  const tiny = (geo) => K.xf(geo, { scale: TINY });
  out.push({ bone: `${k}_hips`, shape: tiny(wisp), at: [0, 0, 0], color: k === 'g' ? 'gCream' : 'sCream', name: `${k}_wisp` });
  // halo (unspent ghost only): a flat gold disc floating above the ear tips (v2 ghost row)
  if (k === 'g') out.push({ bone: 'g_head', shape: tiny(K.frustum(12, 0.12, 0.12, 0.02)), at: [0, 0.9 * TINY, -0.02 * TINY], color: 'halo', name: 'halo' });
  return out;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
// tail0 (sideways axis): fwd = yaw (swish), twist = lift; ears: fwd − = back, out + = outward
const EYES = (sx, sy, px = 0) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0], 'eyeL.p': [px, 0, 0], 'eyeR.p': [px, 0, 0] });
const BLINK = EYES(0, -0.8);
const HALF = EYES(0, -0.45);
const WIDE = EYES(0.15, 0.2);
const EARS = (l, r = l) => ({ earL0: l, earR0: r });
// ghost clips: show one shell set (×1000), hide the boots
// the living ears shrink 15 % inside their shells (the thin cream ear panel peeked through at the tips); their shells
// compensate so they keep the full size
const EAR_IN = 0.85, EAR_SH = 1000 / EAR_IN - 1;
const GHOST = (k, pose) => ({ ...Object.fromEntries(SHELL_BONES.map((b) => [`${k}_${b}.s`, [999, 999, 999]])), 'footL.s': [-1, -1, -1], 'footR.s': [-1, -1, -1],
  'earL0.s': [EAR_IN - 1, EAR_IN - 1, EAR_IN - 1], 'earR0.s': [EAR_IN - 1, EAR_IN - 1, EAR_IN - 1],
  [`${k}_earL0.s`]: [EAR_SH, EAR_SH, EAR_SH], [`${k}_earR0.s`]: [EAR_SH, EAR_SH, EAR_SH], ...pose });
const breathe = (d, c, extra = {}) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0], ...extra });
// die is FK: thigh a / shin −2a keeps the ankle under the hip
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
// DEAD: collapsed onto her left side, knees drawn up, head turned up, ears flat, tail laid out behind
const DEAD = { pos: [0, -0.17, 0], hips: [0, 0, 82], spine: [6, 0, 0], chest: [6, 0, 0], head: [-6, -25, -6], ...BLINK, jaw: [14, 0, 0], ...EARS([-55, 0, 30]),
  thighL: [40, 0, 0], shinL: [-70, 0, 0], thighR: [55, 0, 0], shinR: [-90, 0, 0], upperArmR: [60, 0, 15], forearmR: [30, 0, 0], upperArmL: [30, 0, 10], tail0: [-50, -20, 0] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0, { tail0: [8, 0, 0] }) },
    { f: 30, pose: breathe(0.014, 2, { tail0: [-14, 4, 0] }) },
    { f: 36, pose: breathe(0.028, 4, { tail0: [-14, 4, 0] }) },
    { f: 50, pose: breathe(0.028, 4, { tail0: [-14, 4, 0], ...BLINK }) },
    { f: 52, pose: breathe(0.028, 4, { tail0: [-14, 4, 0] }) },
    { f: 60, pose: breathe(0.028, 4, { tail0: [-14, 4, 0], ...EARS([0, 0, 0], [-35, 0, 15]) }) },
    { f: 64, pose: breathe(0.014, 2, { tail0: [8, 0, 0] }) },
  ] },
  // talk (loop 24): a gossip's beat every 6 frames — head nod/tilt ≥ 25° (turned toward the camera side), jaw 28° on
  // alternate keys, the free right paw gestures out to the side, the mug hand lifts, one ear flicks back, tail flicks
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-4, -8, 0], head: [-10, -12, 8], jaw: [28, 0, 0], upperArmR: [40, 0, 70], forearmR: [50, 0, 0], handR: [0, -30, 0],
      upperArmL: [22, 0, 0], tail0: [14, 0, 0] } },
    // r2: the beat keys no longer nod the face out of view (world pitch chest+head ≤ +4°): a bob down + a head ROLL + ear flick
    { f: 6, pose: { pos: [0, -0.045, 0], chest: [2, -8, 0], head: [0, -16, 4], jaw: [0, 0, 0], upperArmR: [10, 0, 15], forearmR: [30, 0, 0], ...EARS([0, 0, 0], [-35, 0, 15]), ...HALF, tail0: [-8, 0, 0] } },
    { f: 12, pose: { pos: [0, -0.01, 0], chest: [-4, -14, 0], head: [-10, -20, -6], jaw: [26, 0, 0], upperArmR: [55, 0, 55], forearmR: [70, 0, 0], handR: [0, -40, 0],
      upperArmL: [22, 0, 0], tail0: [14, 0, 0] } },
    { f: 18, pose: { pos: [0, -0.045, 0], chest: [2, -4, 0], head: [2, -6, 14], jaw: [4, 0, 0], upperArmR: [10, 0, 15], forearmR: [30, 0, 0], ...EARS([-35, 0, 15], [0, 0, 0]), ...HALF, tail0: [-8, 0, 0] } },
  ] },
  // vote: dip (3) → on tiptoe, body tilted to her left, the free right paw thrown up-and-OUT (chibi arms cannot clear the
  // head: out and a little back so it stands beside the head at S/SE/SW), ears up, eyes wide — HELD
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@handL' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [8, 0, 0], head: [-8, 0, 0], upperArmL: [-10, 0, 20], forearmL: [30, 0, 0], ...EARS([-15, 0, 0]), tail0: [0, -8, 0] } },
    // r2: the MUG goes up (cast-chibi rule: raise a prop), body tilted away to her right, head toward the camera side
    { f: 3, pose: { pos: [0, 0.05, 0], spine: [-2, 0, -8], chest: [-4, 0, -12], head: [-8, -14, 8], ...WIDE, ...EARS([12, 0, -8]),
      upperArmL: [40, 0, 125], forearmL: [0, 0, -12], handL: [0, 0, -100], upperArmR: [0, 0, 20], forearmR: [30, 0, 0], tail0: [0, 22, 0] } },
  ] },
  // die (touch-up: Clocktower-only, no hurt flash / flinch): a gentle SWOON — paw to her brow, eyes heavy, head tipped
  // back, sway (6) → knees buckle (4) → sinks onto her side (4) → lying, head turned so the face and ears show, tail
  // limp (soft dust ring + wisp) → held. Legs FK.
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 14: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], spine: [-4, 0, 8], chest: [-6, -6, 4], head: [-14, -12, 10], ...HALF, ...EARS([-20, 0, 15]),
      upperArmR: [75, 0, 35], forearmR: [115, 0, 0], handR: [0, -40, 0], upperArmL: [-6, 0, 18], tail0: [0, -6, 0] } },
    { f: 6, pose: { pos: [0, -0.13, 0], spine: [20, 0, 6], chest: [12, 0, 0], head: [-12, 0, 0], jaw: [10, 0, 0], ...BLINK, ...EARS([-45, 0, 25]), ...KNEES(60),
      upperArmR: [20, 0, 30], forearmR: [40, 0, 0], tail0: [0, -15, 0] } },
    // r2: the topple starts in the upper body only (legs + hips = the f6 buckle, so the boots stay pinned f6 → f10;
    // in DEAD neither boot is on the ground → no planted pair to slide)
    { f: 10, pose: { pos: [0, -0.13, 0], spine: [26, 0, 28], chest: [12, 0, 14], head: [-16, -10, -6], ...BLINK, ...EARS([-50, 0, 25]), ...KNEES(60),
      upperArmR: [-20, 0, 50], upperArmL: [-10, 0, 45], forearmL: [20, 0, 0], tail0: [10, -30, 0] } },
    { f: 14, pose: DEAD },
  ] },
  // point (the game's shared emote, "that one!"): paw drawn in, head and ears snap toward the target, sly squint (4) →
  // the free RIGHT paw thrown straight out ahead at shoulder height (forearm stretched), head along it, ears forward,
  // tail flicks up (held 20) → paw eases down (6) → idle. The mug arm keeps its carry pose.
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], spine: [4, 6, 0], chest: [4, 10, 0], head: [-6, -8, 0], ...HALF, ...EARS([14, 0, 0]),
      upperArmR: [20, 0, 25], forearmR: [100, 0, 0], handR: [0, -20, 0], tail0: [10, -4, 0] } },
    { f: 4, pose: { pos: [0, 0.01, 0.02], spine: [2, -8, 0], chest: [-2, -16, 0], head: [-6, -18, 4], jaw: [12, 0, 0], ...EYES(0.1, -0.35), ...EARS([20, 0, -6]),
      upperArmR: [112, 0, 46], forearmR: [-8, 0, 0], handR: [-10, 0, 0], 'forearmR.s': [0, 0.4, 0], upperArmL: [6, 0, 14], tail0: [-14, 22, 0] } },
    { f: 24, pose: { pos: [0, -0.01, 0], chest: [0, -8, 0], head: [-4, -10, 0], ...HALF, ...EARS([6, 0, 0]),
      upperArmR: [40, 0, 25], forearmR: [40, 0, 0], tail0: [0, 8, 0] } },
    { f: 30, pose: breathe(0, 0, { tail0: [8, 0, 0] }) },
  ] },
  // ghost (loop 48, the dead player): pale-blue shell + gold halo, boots gone, a wisp trailing under the hem; hovers
  // 0.14–0.21 m and drifts (4 keys, 12 frames each), the free paw floating forward, tail swaying slowly, one blink.
  ghost: { fps: 30, loop: true, interp: 'step', length: 48, legs: 'fk', dynamics: 'hold', keys: [
    { f: 0, pose: GHOST('g', { pos: [0, 0.22, 0], spine: [4, 0, 0], chest: [2, 0, 0], head: [-4, 0, 0],
      upperArmR: [30, 0, 25], forearmR: [40, 0, 0], handR: [30, 0, 0], tail0: [12, 6, 0] }) },
    { f: 12, pose: GHOST('g', { pos: [0, 0.26, 0], spine: [2, 0, -3], chest: [0, -4, 0], head: [-6, -6, 5],
      upperArmR: [44, 0, 32], forearmR: [34, 0, 0], handR: [36, 0, 0], tail0: [-4, 14, 0], ...EARS([0, 0, 0], [-20, 0, 12]) }) },
    { f: 24, pose: GHOST('g', { pos: [0, 0.30, 0], spine: [0, 0, 0], chest: [-2, 0, 0], head: [-8, 0, 0],
      upperArmR: [52, 0, 28], forearmR: [28, 0, 0], handR: [30, 0, 0], tail0: [-18, 16, 0] }) },
    { f: 30, pose: GHOST('g', { pos: [0, 0.30, 0], spine: [0, 0, 0], chest: [-2, 0, 0], head: [-8, 0, 0], ...BLINK,
      upperArmR: [52, 0, 28], forearmR: [28, 0, 0], handR: [30, 0, 0], tail0: [-18, 16, 0] }) },
    { f: 32, pose: GHOST('g', { pos: [0, 0.30, 0], spine: [0, 0, 0], chest: [-2, 0, 0], head: [-8, 0, 0],
      upperArmR: [52, 0, 28], forearmR: [28, 0, 0], handR: [30, 0, 0], tail0: [-18, 16, 0] }) },
    { f: 36, pose: GHOST('g', { pos: [0, 0.26, 0], spine: [2, 0, 3], chest: [0, 4, 0], head: [-6, 6, -4],
      upperArmR: [38, 0, 22], forearmR: [40, 0, 0], handR: [34, 0, 0], tail0: [2, 10, 0], ...EARS([-20, 0, 12], [0, 0, 0]) }) },
  ] },
  // ghost-spent (loop 60, after the ghost's one vote): the dimmer grey-blue shell, NO halo, hovering lower (0.07–0.11 m),
  // slumped, ears drooped, eyes heavy, paws hanging, tail low; a slow 3-key drift with one blink.
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 60, legs: 'fk', dynamics: 'hold', keys: [
    { f: 0, pose: GHOST('s', { pos: [0, 0.12, 0], spine: [10, 0, 0], chest: [6, 0, 0], head: [-6, -6, 4], ...HALF, ...EARS([-40, 0, 28]),
      upperArmR: [6, 0, 12], forearmR: [16, 0, 0], upperArmL: [-4, 0, 8], tail0: [-6, -14, 0] }) },
    { f: 20, pose: GHOST('s', { pos: [0, 0.17, 0], spine: [8, 0, -3], chest: [4, -4, 0], head: [-8, -12, 8], ...HALF, ...EARS([-40, 0, 28], [-20, 0, 12]),
      upperArmR: [12, 0, 18], forearmR: [22, 0, 0], upperArmL: [-4, 0, 8], tail0: [10, -10, 0] }) },
    { f: 40, pose: GHOST('s', { pos: [0, 0.14, 0], spine: [12, 0, 3], chest: [6, 4, 0], head: [-4, 2, -2], ...BLINK, ...EARS([-40, 0, 28]),
      upperArmR: [4, 0, 10], forearmR: [12, 0, 0], upperArmL: [-4, 0, 8], tail0: [-14, -16, 0] }) },
    { f: 42, pose: GHOST('s', { pos: [0, 0.14, 0], spine: [12, 0, 3], chest: [6, 4, 0], head: [-4, 2, -2], ...HALF, ...EARS([-40, 0, 28]),
      upperArmR: [4, 0, 10], forearmR: [12, 0, 0], upperArmL: [-4, 0, 8], tail0: [-14, -16, 0] }) },
  ] },
  // whisper (emote, "every rumour that passes through it"): sly double-take glance (6 / 6) → leans in toward the viewer,
  // paw cupped beside the muzzle, half-lid, ears forward (speech bubble, 14) → the punchline: a WINK, head tilted, tail
  // flicks up (10) → raises the mug "on the house" (10) → idle
  whisper: { fps: 30, loop: false, interp: 'step', events: { 12: 'speak' }, keys: [
    // r2: glance yaw ±15 (one eye always visible at dir 1/S); lean-in keeps the face up; the wink turns TOWARD the camera
    // side (her right = −twist at dir 1), the near (right) eye winks, the paw drops out to the side
    { f: 0, pose: breathe(0, 0, { head: [0, 15, 0], ...EYES(0, -0.2, 0.02), ...EARS([0, 0, 0], [-30, 0, 20]), tail0: [10, 0, 0] }) },
    { f: 6, pose: breathe(0, 0, { head: [0, -15, 0], ...EYES(0, -0.2, -0.02), ...EARS([-30, 0, 20], [0, 0, 0]), tail0: [-10, 0, 0] }) },
    { f: 12, pose: { pos: [0, -0.04, 0], spine: [8, -8, 0], chest: [4, -8, 0], head: [-12, -12, 12], ...HALF, ...EARS([18, 0, 0]),
      upperArmR: [60, 0, 60], forearmR: [100, 0, 0], handR: [0, -50, 0], tail0: [16, 6, 0] } },
    { f: 26, pose: { pos: [0, -0.02, 0], spine: [0, -6, 0], chest: [-2, -10, 0], head: [-14, -14, 18], 'eyeL.s': [0, -0.1, 0], 'eyeR.s': [0, -0.7, 0], jaw: [10, 0, 0],
      ...EARS([10, 0, -5], [-20, 0, 15]), upperArmR: [20, 0, 45], forearmR: [40, 0, 0], tail0: [-18, 30, 0] } },
    { f: 36, pose: { pos: [0, 0.0, 0], chest: [-4, -6, 0], head: [-10, -10, 0], jaw: [18, 0, 0], ...HALF,
      upperArmL: [50, 0, 10], forearmL: [20, 0, 0], handL: [-40, 0, 0], upperArmR: [10, 0, 10], tail0: [12, 10, 0] } },
    { f: 46, pose: breathe(0, 0, { tail0: [8, 0, 0] }) },
  ] },
};

// vote / die end on a HELD pose (clip.hold): repeat the last key later so the clip outlasts the FX tail
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 50);

export function make() {
  const S = skeleton();
  return {
    name: 'fox',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['fur', { part: 'tailTip' }],
    faceSlot: 'cream',
    bodyPlan: 'uprightAnimal',
    heightPx: [42, 52],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'skip' },
    emote: 'whisper',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0, 0.52, 0.02] } },
    chains: [],
    personality: { body: { f: 3, zeta: 0.6, r: 0 }, head: { f: 3.2, zeta: 0.65, r: 0 } },
    locomotion: { plan: 'biped', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.18, 0.1], reach: 0.6, arms: [40, 60], elbows: [20, 40], bob: [0.05, 0.11], lean: [6, 14],
      lift: [0.08, 0.11], twist: [6, 9], surge: false,   // r2: boots kick higher; run = a distinct flight drawing (apex +0.11 m)
      bones: { armL: ['tail0', 'mugHold'] } },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' } },
    material: {
      sides: Object.fromEntries(['', 'g_', 's_'].flatMap((k) => ['eyeL', 'eyeR', 'earL0', 'earR0', 'handL'].map((b) => [k + b, 'mid']))),
      // shell bones draw their part lines like the living bones they cover
      merge: Object.fromEntries(['g', 's'].flatMap((k) => SHELL_BONES.map((b) => [`${k}_${b}`, b]))),
    },
  };
}

export default make();
