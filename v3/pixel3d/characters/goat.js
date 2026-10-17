// Magistrate Billings (char-goat) — cast member "goat", villager: "Presides over every trial. Eats the evidence."
// Design sheet (## Unique to me, timing charts, ## Self-critique): characters/goat.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/goat.ts + refs/cast/goat.png.
// Body plan: robed upright CHIBI (chibi(), 2.4 heads, legs 0.25 H) on the LegGait 'biped' plan (a skip with flight at
// game speed). Arms are authored BENT at rest (LegGait ignores authored walk clips, so the carry pose must be the rest
// geometry): the staff hangs plumb in the RIGHT hand outside the robe. r2: the gait's hips/neck/head channels go to
// part-less sinks and spine/chest drive the ears (spec.locomotion comment) so the staff never tips under gait lean.
// Structure: palette → skeleton → geometry helpers → parts → clips → spec.
import * as THREE from 'three';
import { chibi, chain, restPositions } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

// [hi, mid, sh] sRGB: 5 slots + 1 accent (brass)
export const PALETTE = {
  wool: ['#F8F2E6', '#E6DCCC', '#A898A6'],    // signature 2: head, muzzle, beard, ears, hands (lightest mass)
  horn: ['#EECB8E', '#C69A5E', '#8A6656'],    // signature 1: the curled horns (+ brows)
  robe: ['#E4B850', '#B8892E', '#7A5638'],    // gold magistrate robe, sleeves
  panel: ['#7E5642', '#573826', '#46303A'],   // front panel, boots/hooves, staff wood, eyes, mouth
  collar: ['#D8505A', '#A42C38', '#6A2442'],  // red collar, cuffs, nose
  brass: ['#FFF0B8', '#E8C460', '#9C7444'],   // accent: knob, ring, trims, hem band
  // story-prop slot (critic r1: the evidence in brass had no value of its own): COOL off-white parchment, slate shadow
  parchment: ['#F2F6EE', '#CCD6CC', '#7C8AA0'],  // evidence sheet + the paper corner in the mouth
};

export const H = 1.44;                        // castHeight(36): ground → horn tops
export const V_GAME = 4 * H;                  // 5.76 m/s (v2: 3.95 body heights / s)
const BODY = { height: 1.32, heads: 2.4, legs: 0.75, arms: 0.85, snout: 0.25, tail: false };

// arm segment rest directions [out°, fwd°] (L side convention; R mirrored in x): R = staff arm (out, hand forward)
const ARM = { L: { up: [12, 0], fore: [10, 22] }, R: { up: [24, 6], fore: [10, 34] } };
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
const EYE = [0.118, 0.27, 0.215], BROW = [0.118, 0.335, 0.205];
const SHEET_K = 0.05;
const HALO_K = 0.001;                         // ghost halo authored scale (see skeleton())
const GH = [0.12, 0.09, 0.08, 0.05];          // ghost hover root y: [hi, lo] unspent, [hi, lo] spent (m)
const GF = [0.18, 0.58, 0.14, 0.52];          // ghost dissolve bind heights: [gone, solid] unspent, [gone, solid] spent (m)                         // evidence sheet authored at 5 % size inside the fist; the emote scales it ×20

export function skeleton(opts = {}) {
  const S0 = chibi({ ...BODY, ...opts, ears: false, face: { eye: EYE, brow: BROW[1] - EYE[1], mouth: false } });
  let S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM[s].up], [`hand${s}`, ARM[s].fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  for (const s of [1, -1]) {
    S.find((b) => b.name === (s > 0 ? 'browL' : 'browR')).pos = [s * BROW[0], BROW[1], BROW[2]];
  }
  // jaw hinge at the BACK of the muzzle (the template's front hinge barely moves the lip — frog lesson)
  const jaw = S.find((b) => b.name === 'jaw');
  jaw.pos = [0, 0.09, 0.17];
  // floppy ears: 1-link bones (built with chain()) hanging out-and-down; KEYED per clip (out + = UP), not sprung
  S.push(...chain('ear', { n: 1, parent: 'head', at: [0.215, 0.30, -0.03], dir: EAR_DIR, len: EAR_LEN, mirror: true }));
  // beard: a bone under the lower jaw (rides the jaw rigidly)
  S.push(...chain('beard', { n: 1, parent: 'jaw', at: [0, -0.05, 0.10], dir: BEARD_DIR, len: BEARD_LEN }));
  // the paper corner in the mouth (keyed scale = bitten) and the evidence sheet in the left hand (hidden at rest)
  S.push({ name: 'paper', parent: 'jaw', pos: [0.07, -0.025, 0.165], axis: 'fwd' });
  S.push({ name: 'muzzle', parent: 'head', pos: [0, 0.16, 0.255], axis: 'fwd' });
  S.push({ name: 'sheet', parent: 'handL', pos: [0, -0.03, 0.02], axis: 'down' });
  // part-less bone: takes the gait's right ELBOW channel (the right SWING channel rocks the staff about the grip, handR)
  S.push({ name: 'staffSway', parent: 'chest', pos: [0, 0, 0], axis: 'down' });
  // part-less sinks for the gait's hips / neck / head channels (r2 workaround, see spec.locomotion.bones)
  S.push({ name: 'gHips', parent: 'hips', pos: [0, 0, 0], axis: 'down' });
  S.push({ name: 'gNeck', parent: 'neck', pos: [0, 0, 0], axis: 'down' });
  S.push({ name: 'gHead', parent: 'head', pos: [0, 0, 0], axis: 'down' });
  // (touch-up, ghost) HALO bone buried inside the skull. Its ring is authored at HALO_K scale around the joint (a speck
  // inside the head: never seen while alive); the ghost clip keys 'halo.s' = 1/HALO_K − 1 to grow it back to full size
  // over the horns. Its world scale (relative to the head) is also the GHOST SIGNAL the shader reads (GHOST_GLSL):
  // ≈ 1 alive, 2 = ghost-spent (no halo, dimmer), 1/HALO_K = ghost with the vote unspent (halo shown). Appended LAST so
  // every other bone index (and every living render) is unchanged.
  S.push({ name: 'halo', parent: 'head', pos: [0, 0.30, -0.03], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}
const EAR_DIR = [1, -0.38, -0.12], EAR_LEN = 0.27;
const BEARD_DIR = [0, -1, 0.25], BEARD_LEN = 0.11;

// ── geometry helpers ──
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// in-plane subdivision of a flat-shaded triangle soup + split by a centroid predicate: trims/panels cut OUT of the
// robe surface itself (coincident → no inner-line ring; mushroom stole lesson)
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
function splitTris(arr, preds) {
  const outs = preds.map(() => []), rest = [];
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    const k = preds.findIndex((p) => p(c));
    (k >= 0 ? outs[k] : rest).push(...arr.slice(i, i + 9));
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  return [mk(rest), ...outs.map(mk)];
}
// a tapered tube segment between two points (hexagonal rings perpendicular to the segment), uncentred hull
function tube(a, b, ra, rb, n = 6) {
  const u = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const p = norm(cross(u, ref)), q = cross(u, p), pts = [];
  for (const [c, r] of [[a, ra], [b, rb]]) for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, cs = Math.cos(t) * r, sn = Math.sin(t) * r;
    pts.push([c[0] + p[0] * cs + q[0] * sn, c[1] + p[1] * cs + q[1] * sn, c[2] + p[2] * cs + q[2] * sn]);
  }
  return K.hull(pts);
}
// a flat leaf along unit direction u (width across w, thickness t), from 0 to len
function leaf(u, len, w0, w1, wTip, t, side = [0, 0, 1]) {
  const b = norm(cross(u, side)), n = cross(u, b), pts = [];
  for (const [a, w] of [[0, w0], [len * 0.5, w1], [len, wTip]]) for (const s of [-1, 1]) for (const q of [-1, 1])
    pts.push([0, 1, 2].map((i) => u[i] * a + b[i] * s * w / 2 + n[i] * q * t / 2));
  return K.hull(pts);
}
// horn centre line (head-local, L side; head joint = chin): up from the crown, arching back and out, curling down
// and forward behind the ear (v2 K points: up → back → down)
// (r2) wider loop in the side (y-z) plane: the curl opens ≥ 3 texels at E/W (critic: horns read as 2 spikes there);
// 4 segments instead of 6 (isolated horn px max 16 → 7, A/B shots/char-goat/r2/ab-h*)
export const HORN = [[0.10, 0.39, 0.06, 0.068], [0.20, 0.595, -0.16, 0.062], [0.28, 0.57, -0.245, 0.056],
  [0.34, 0.47, -0.235, 0.05], [0.34, 0.315, -0.02, 0.038]];

export function parts(S) {
  const m = S.meta;
  const W = restPositions(S);
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint = chin): a round wool ball, a long muzzle, nose, jaw with the mouth inside, the paper corner
  add('head', K.lathe([[0.16, 0], [0.245, 0.09], [0.262, 0.22], [0.232, 0.34], [0.14, 0.43], [0, 0.455]], 8, { sz: 0.92 }), [0, 0.02 + 0.455 / 2, 0], 'wool', { name: 'skull' });
  // muzzle on its own part-less bone → its own part id → an inner line where it overlaps the skull (white on white)
  add('muzzle', K.chamferBox(0.21, 0.13, 0.19, 0.3), [0, 0, 0], 'wool', { name: 'muzzle' });
  add('muzzle', K.box(0.085, 0.035, 0.03), [0, 0.05, 0.097], 'collar', { name: 'nose' });
  add('jaw', K.chamferBox(0.17, 0.065, 0.17, 0.3), [0, -0.025, 0.09], 'wool', { name: 'jaw' });
  add('jaw', K.box(0.14, 0.02, 0.13), [0, 0.012, 0.09], 'panel', { name: 'mouthIn' });
  add('paper', K.xf(K.chamferBox(0.1, 0.075, 0.075, 0.2), { rot: [-15, 30, -12] }), [0.055, -0.02, 0.025], 'parchment', { name: 'paper' });
  add('eyeL', K.box(0.065, 0.068, 0.04), [0, 0, 0.01], 'panel', { name: 'eye', mirror: true });
  add('browL', K.xf(K.box(0.085, 0.032, 0.035), { rot: [0, 0, 16] }), [0, 0, 0.012], 'horn', { name: 'brow', mirror: true });
  // ears (leaf faces forward-down) and beard
  add('earL0', leaf(norm(EAR_DIR), EAR_LEN, 0.085, 0.14, 0.075, 0.045, [0, 0.5, 1]), [0, 0, 0], 'wool', { name: 'ear', mirror: true });
  add('beard0', leaf(norm(BEARD_DIR), BEARD_LEN, 0.09, 0.07, 0.035, 0.05, [1, 0, 0]), [0, 0, 0], 'wool', { name: 'beard' });
  // horns: tapered tube segments of one slot on one bone (no inner line between segments), L + mirrored R
  for (let i = 0; i + 1 < HORN.length; i++) {
    const a = HORN[i], b = HORN[i + 1];
    add('head', tube(a, b, a[3], b[3]), [0, 0, 0], 'horn', { name: `horn${i}`, mirror: true });
  }

  // ── body: gold robe (bell skirt on the hips, upper robe on the chest), front panel + gold trims cut out of it
  const hemY = 0.15, waistY = m.spineY + 0.02, shY = m.shoulderY + 0.02;
  const PANEL = (p) => p[2] > 0.04 && Math.abs(p[0]) < 0.062;
  const TRIM = (p) => p[2] > 0.04 && Math.abs(p[0]) < 0.11;
  // hem line (critic r1: the trailing boot flicked out behind the hem like a tail): the bell skirt's hem rises
  // HEM_UP at the front (boots show on the contact drawing) and drops HEM_DOWN at the back (trailing boot hidden);
  // the warp fades out towards the waist. Applied to the subdivided skirt, hem band and sole in hips-local space.
  const hemWarp = (arr, at) => {
    const out = arr.slice();
    for (let i = 0; i < out.length; i += 3) {
      const z = out[i + 2] + at[2], yw = out[i + 1] + at[1] + m.hipsY;
      const k = Math.max(0, Math.min(1, 1 - (yw - hemY) / (waistY - hemY)));
      const zn = Math.max(-1, Math.min(1, z / 0.25));
      out[i + 1] += k * (zn >= 0 ? HEM_UP * zn : -HEM_DOWN * Math.min(1, -zn * 1.3));
    }
    return out;
  };
  const mkG = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  const robePart = (geo, at, bone, name, warp = false) => {
    let arr = subdivide(geo, 0.03);
    if (warp) arr = hemWarp(arr, at);
    const [r, pa, tr] = splitTris(subdivide(mkG(arr), 1), [PANEL, TRIM]);
    add(bone, r, at, 'robe', { name });
    add(bone, pa, at, 'panel', { name: name + 'Panel' });
    add(bone, tr, at, 'brass', { name: name + 'Trim' });
  };
  const rSk = (y) => 0.27 + (0.19 - 0.27) * (y - hemY) / (waistY - hemY);
  const skirt = (y0, y1) => [K.frustum(8, rSk(y0), rSk(y1), y1 - y0, { sz: 0.92 }), [0, (y0 + y1) / 2 - m.hipsY, 0]];
  { const [g, at] = skirt(hemY, hemY + 0.055); add('hips', mkG(hemWarp(subdivide(g, 0.03), at)), at, 'brass', { name: 'hem' }); }
  { const [g, at] = skirt(hemY + 0.055, waistY); robePart(g, at, 'hips', 'skirt', true); }
  // sole: a closed robe disc just inside the hem (closes the bell opening in the die hold)
  { const at = [0, hemY + 0.004 - m.hipsY, 0];
    add('hips', mkG(hemWarp(subdivide(K.frustum(8, rSk(hemY) - 0.006, rSk(hemY) - 0.006, 0.02, { sz: 0.92 }), 0.03), at)), at, 'robe', { name: 'hemSole' }); }
  robePart(K.frustum(8, 0.195, 0.16, shY - waistY + 0.02, { sz: 0.92 }), [0, (shY + waistY) / 2 - 0.01 - m.chestY, 0], 'chest', 'robeTop');
  // red collar / mantle round the shoulders with a gold lower edge (bands of one profile)
  const cy0 = shY - 0.07, cy1 = shY + 0.035, rC = (y) => 0.25 + (0.16 - 0.25) * (y - cy0) / (cy1 - cy0);
  add('chest', K.frustum(8, rC(cy0), rC(cy0 + 0.035), 0.035, { sz: 0.9 }), [0, cy0 + 0.0175 - m.chestY, 0], 'brass', { name: 'collarEdge' });
  add('chest', K.frustum(8, rC(cy0 + 0.035), rC(cy1), cy1 - cy0 - 0.035, { sz: 0.9 }), [0, (cy0 + 0.035 + cy1) / 2 - m.chestY, 0], 'collar', { name: 'collar' });

  // ── arms: gold sleeves along the authored (bent) rest directions, red cuff, wool hands
  const seg = (bone, d, len, r0, r1, name, color, from = 0) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * (from + len / 2)), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM[sd].up)), m.upperArm + 0.02, 0.078, 0.072, 'sleeve' + sd, 'robe');
    seg('forearm' + sd, m3(armDir(ARM[sd].fore)), m.forearm - 0.05, 0.075, 0.085, 'forearm' + sd, 'robe');
    seg('forearm' + sd, m3(armDir(ARM[sd].fore)), 0.05, 0.088, 0.088, 'cuff' + sd, 'collar', m.forearm - 0.05);
    const d = m3(armDir(ARM[sd].fore));
    add('hand' + sd, K.chamferBox(0.085, 0.085, 0.085, 0.4), d.map((v) => v * 0.035), 'wool', { name: 'hand' + sd });
  }

  // ── legs: hidden in the robe; dark boots (lower shin) + hooves
  add('shinL', K.frustum(4, 0.06, 0.064, 0.07), [0, -m.shin + 0.035, 0], 'panel', { name: 'boot', mirror: true });   // (r2) short boot cuff: the stepping boot shows as a 3×2 flick, not a dark blob
  add('footL', K.chamferBox(0.1, m.ankleY + 0.01, 0.17, 0.4), [0, -m.ankleY / 2 + 0.003, 0.065], 'panel', { name: 'hoof', mirror: true });

  // ── staff in the RIGHT hand: plumb, from the ground to above the head; brass knob + ring
  const hand = W.handR, dF = (() => { const v = armDir(ARM.R.fore); return [-v[0], v[1], v[2]]; })();
  const grip = [hand[0] + dF[0] * 0.04, hand[1] + dF[1] * 0.04, hand[2] + dF[2] * 0.04];
  const loc = (wy) => [grip[0] - hand[0], wy - hand[1], grip[2] - hand[2]];
  add('handR', K.box(0.075, STAFF.top - STAFF.bot, 0.075), loc((STAFF.top + STAFF.bot) / 2), 'panel', { name: 'staff' });
  add('handR', K.frustum(8, 0.06, 0.06, 0.045), loc(STAFF.top - 0.04), 'brass', { name: 'staffRing' });
  add('handR', K.lathe([[0.04, 0], [0.075, 0.035], [0.075, 0.075], [0.04, 0.11], [0, 0.12]], 8), loc(STAFF.top + 0.06), 'brass', { name: 'knob' });
  KNOB_AT.splice(0, 3, ...loc(STAFF.top + 0.08)); FOOT_AT.splice(0, 3, ...loc(STAFF.bot + 0.02));

  // ── evidence sheet (left hand), authored at SHEET_K size so it is hidden inside the fist until the emote scales it.
  // (critic r1: a flat brass card was edge-on or hidden at 5-7 of 8 facings) a V-folded PARCHMENT document (two
  // 0.14 × 0.3 m leaves opened 100° about a vertical spine, rising from the fist) is seen face-on from every side;
  // a 2×2-texel red wax seal sits on the spine's foot (both sides) and two dark ink lines cross each leaf.
  const leafG = (side) => {
    const g = K.xf(K.box(0.17, 0.34, 0.022), { at: [side * 0.085, 0.17, 0] });
    return K.xf(g, { rot: [0, side * 40, 0] });
  };
  const ink = (side, y) => K.xf(K.xf(K.box(0.11, 0.028, 0.03), { at: [side * 0.09, y, 0] }), { rot: [0, side * 40, 0] });
  const sk = (g) => K.xf(g, { scale: [SHEET_K, SHEET_K, SHEET_K] });
  add('sheet', sk(K.merge(leafG(1), leafG(-1))), [0, 0, 0], 'parchment', { name: 'sheet' });
  add('sheet', sk(K.merge(ink(1, 0.25), ink(-1, 0.25), ink(1, 0.17), ink(-1, 0.17))), [0, 0, 0], 'panel', { name: 'ink' });
  add('sheet', sk(K.chamferBox(0.075, 0.075, 0.075, 0.25)), [0, 0.06 * SHEET_K, 0], 'collar', { name: 'seal' });

  // ── ghost halo (touch-up): a flat brass ring 0.45 m over the halo joint (head-local y 0.75: clear of the horn tops at
  // 0.66), authored at HALO_K around the joint inside the skull; untinted by the ghost shader (v1 ghost row: gold bar)
  const ring = K.lathe([[0.10, 0], [0.165, 0], [0.165, 0.035], [0.10, 0.035], [0.10, 0]], 12);
  add('halo', K.xf(ring, { at: [0, 0.45 * HALO_K, 0], scale: HALO_K }), [0, 0, 0], 'brass', { name: 'halo' });
  return P;
}
const STAFF = { bot: 0.03, top: 1.24 };
const HEM_UP = 0.03, HEM_DOWN = 0.1;
const KNOB_AT = [0, 0, 0], FOOT_AT = [0, 0, 0];

// ── clips (pose triples [fwd, twist, out] deg, deltas from the bent rest; 30 Hz grid) ──
const EYES = (sy, sx = 0) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(-0.75), SHUT = EYES(-0.75), WIDE = EYES(0.3, 0.15), HALF = EYES(-0.45);
const BROWS = (o, dy = 0) => ({ browL: [0, 0, o], browR: [0, 0, o], ...(dy ? { 'browL.p': [0, dy, 0], 'browR.p': [0, dy, 0] } : {}) });
const EARS = (up, fwd = 0) => ({ earL0: [fwd, 0, up], earR0: [fwd, 0, up] });
const SHEET = (k) => ({ 'sheet.s': [k / SHEET_K - 1, k / SHEET_K - 1, k / SHEET_K - 1] });
const TAP = (d) => ({ upperArmR: [22 * d, 0, 0], handR: [-22 * d, 0, 0] });     // staff lifted, still plumb
const STAFF_UP = (a) => ({ upperArmR: [a, 0, 0], handR: [-a, 0, 0] });
const breath = (d, extra = {}) => ({ pos: [0, -0.012 - 0.028 * d, 0], chest: [4 * d, 0, 0], head: [-4 * d, 0, 0],
  upperArmL: [3 * d, 0, 0], forearmL: [10 * d, 0, 0], ...extra });
const CHEW = (a) => ({ jaw: [a, 0, 0], beard0: [a * 0.5, 0, 0] });
// left-arm + sheet poses of the emote (r2, picked on 8-facing stills shots/char-goat/r2/g{d,h}-x3.png)
const READ = { upperArmL: [150, 0, 55], forearmL: [60, 0, 0], handL: [0, 0, 0], sheet: [60, 40, 0] };   // up beside the head
const LIFT = 45;                             // verdict "Order!" lift: arm forward-up, wrist back = staff raised plumb
const BITE = { upperArmL: [120, 0, 30], forearmL: [70, 0, 0], handL: [0, 0, 0], sheet: [90, 70, 0] };   // beside the mouth

const VOTE_UP = { pos: [0, 0.0, 0], spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-4, -8, 0], ...WIDE, ...BROWS(-12, 0.02), ...EARS(30),
  upperArmR: [150, 0, 12], handR: [-160, 0, 0], upperArmL: [60, 0, 35], forearmL: [55, 0, 0] };   // wrist also cancels the 10° lean back
// (r2, critic: the bell robe read as a toppled barrel with its hollow hem, face upside down) rolled 30° onto his side so
// the face turns up to the camera (head pitched to the chest), boots hidden in the hem (shin scale 0, i.e. hidden: the closed
// robe sole shows instead of boots in a dark opening) — shots/char-goat/r2/g8-die-f68-x3.png
const DEAD = { pos: [0, -0.34, -0.2], hips: [-80, 0, -30], chest: [-4, 0, 0], head: [30, 20, 0], 'shinL.s': [-1, -1, -1], 'shinR.s': [-1, -1, -1], jaw: [24, 0, 0], ...SHUT, ...EARS(-30, 20),
  thighL: [20, 0, 16], shinL: [-20, 0, 0], thighR: [20, 0, 16], shinR: [-20, 0, 0],
  upperArmR: [-10, 0, 70], forearmR: [10, 0, 0], upperArmL: [-10, 0, 75], forearmL: [10, 0, 0] };

export const CLIPS = {
  // idle: breathe (extremes held 30), a blink, then two chews on the paper corner (the evidence never runs out)
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, BLINK) },
    { f: 38, pose: breath(1) },
    { f: 48, pose: breath(1, CHEW(22)) },
    { f: 52, pose: breath(1) },
    { f: 56, pose: breath(1, CHEW(22)) },
    { f: 60, pose: breath(1) },
    { f: 66, pose: breath(0) },
  ] },
  // talk: the magistrate holds forth — chin up / nod alternating (≥ 25°), jaw open on alternate keys, the free left
  // hand lectures, the staff taps on the open keys; ears flick
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-5, 8, 0], head: [-10, 8, 0], ...CHEW(30), ...BROWS(-10), ...EARS(15),
      upperArmL: [85, 0, 40], forearmL: [70, 0, 0], handL: [0, 30, 0], ...TAP(1) } },
    { f: 6, pose: { pos: [0, -0.035, 0], chest: [5, -3, 0], head: [12, -4, 0], ...CHEW(0), upperArmL: [15, 0, 10], forearmL: [30, 0, 0], ...TAP(0) } },
    { f: 12, pose: { pos: [0, -0.01, 0], chest: [-5, -8, 0], head: [-10, -10, 0], ...CHEW(28), ...BROWS(-10), ...EARS(15),
      upperArmL: [100, 0, 22], forearmL: [55, 0, 0], handL: [0, -20, 0], ...TAP(1) } },
    { f: 18, pose: { pos: [0, -0.035, 0], chest: [5, 3, 0], head: [12, 4, 0], ...CHEW(4), upperArmL: [20, 0, 12], forearmL: [35, 0, 0], ...TAP(0) } },
  ] },
  // vote: a 3-frame dip (staff gathered) → staff thrust up (knob high over the horns), free hand up, eyes wide, ears
  // up — HELD (the game holds it while the vote lasts)
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@knob' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [8, 0, 0], chest: [6, 0, 0], head: [-10, 0, 0], ...STAFF_UP(-12), upperArmL: [-8, 0, 0] } },
    { f: 3, pose: VOTE_UP },
    { f: 30, pose: VOTE_UP },
  ] },
  // die (touch-up, Clocktower-only: a GENTLE collapse, no hurt flash / flinch): a weary sigh (eyes half shut, ears
  // droop, hand to the chest, staff sagging) → knees fold, eyes shut → he sinks back → lies on his side, face up (soft
  // dust ring, soul) → settles, held. Legs FK. No bounce.
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 21: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.02, 0], spine: [6, 0, 4], chest: [6, 6, 0], head: [10, -6, 8], ...CHEW(8), ...HALF, ...BROWS(10), ...EARS(-20),
      upperArmL: [40, 0, -10], forearmL: [80, 0, 0], ...STAFF_UP(-8) } },
    { f: 9, pose: { pos: [0, -0.13, 0], hips: [6, 0, 0], spine: [-4, 0, 0], head: [12, 0, 0], ...CHEW(10), ...SHUT, ...EARS(-25),
      thighL: [50, 0, 0], shinL: [-100, 0, 0], footL: [50, 0, 0], thighR: [50, 0, 0], shinR: [-100, 0, 0], footR: [50, 0, 0],
      upperArmL: [10, 0, 22], forearmL: [30, 0, 0] } },
    { f: 15, pose: { pos: [0, -0.2, -0.12], hips: [-45, 0, 0], chest: [-10, 0, 0], head: [10, 0, 0], ...CHEW(24), ...SHUT, ...EARS(-10, 30),
      thighL: [70, 0, 12], shinL: [-60, 0, 0], thighR: [70, 0, 12], shinR: [-60, 0, 0],
      upperArmR: [0, 0, 55], upperArmL: [0, 0, 70], forearmL: [20, 0, 0] } },
    { f: 21, pose: DEAD },
    { f: 27, pose: { ...DEAD, thighL: [12, 0, 14], shinL: [-12, 0, 0], thighR: [12, 0, 14], shinR: [-12, 0, 0] } },
    { f: 60, pose: { ...DEAD, thighL: [12, 0, 14], shinL: [-12, 0, 0], thighR: [12, 0, 14], shinR: [-12, 0, 0] } },
  ] },
  // verdict (emote, "eats the evidence"): holds the evidence up beside his head and squints at it → (touch-up,
  // Clocktower-only: no swing) lifts the staff STRAIGHT UP, plumb, chin up: "Order!" → taps it down plumb like a gavel
  // on the floor (dust at the staff foot, 2-texel squash; no strike spark) →
  // the sheet to the side of his mouth, jaw wide → chomp (sheet 80 %) → open → chomp (50 %) → gulp: sheet gone,
  // chin up, eyes shut, smug pat on the belly (heart glyph) → idle. (r2) every key checked on its 8-facing still:
  // READ arm (shots/char-goat/r2/g8-verdict-f4-x3.png) and BITE arm (…-f24-x3.png) keep the parchment sheet outside
  // the head silhouette at 8/8 facings (the V-fold shows a face from every side); chomps 6/8, slam 7/8.
  verdict: { fps: 30, loop: false, interp: 'step',
    events: { 14: 'poof@staffFoot', 44: 'emote:heart@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-4, -8, 0], head: [-12, -14, 0], ...HALF, ...BROWS(-18), ...SHEET(1), ...READ } },
    // "Order!": staff lifted straight up, PLUMB (wrist cancels the arm), body drawn up tall, chin up, sheet kept up
    { f: 8, pose: { pos: [0, 0.02, 0], spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-10, 6, 0], ...WIDE, ...BROWS(-18, 0.02), ...SHEET(1), ...READ, ...EARS(25),
      ...STAFF_UP(LIFT) } },
    // gavel tap: staff plumb on the ground (wrist cancels the body pitch), body squashes 2 texels, ears flop, dust
    { f: 14, pose: { pos: [0, -0.07, 0], spine: [10, 0, 0], chest: [8, 0, 0], head: [-10, 0, 0], ...EYES(-0.3), ...BROWS(-20), ...SHEET(1), ...READ, ...EARS(-25, 10),
      handR: [18, 0, 0] } },
    // the sheet to the side of his mouth, jaw wide, eyes wide
    { f: 22, pose: { pos: [0, -0.01, 0], chest: [-2, -10, 0], head: [-10, -8, 0], ...CHEW(36), ...WIDE, ...SHEET(1), ...BITE } },
    // chomp (head down onto it), the sheet shrinks
    { f: 28, pose: { pos: [0, -0.035, 0], chest: [6, -10, 0], head: [8, -8, 0], ...CHEW(0), ...HALF, ...BROWS(-20), ...SHEET(0.8), ...BITE } },
    { f: 34, pose: { pos: [0, -0.01, 0], chest: [-2, -10, 0], head: [-10, -8, 0], ...CHEW(30), ...HALF, ...SHEET(0.8), ...BITE } },
    { f: 38, pose: { pos: [0, -0.035, 0], chest: [6, -10, 0], head: [8, -8, 0], ...CHEW(0), ...HALF, ...BROWS(-20), ...SHEET(0.5), ...BITE } },
    // gulp: sheet gone, chin up, eyes shut, smug pat on the belly
    { f: 44, pose: { pos: [0, 0.0, 0], spine: [-4, 0, 0], chest: [-8, 0, 0], head: [-10, 0, 0], ...SHUT, ...EARS(15),
      upperArmL: [30, 0, -10], forearmL: [80, 0, 0] } },
    { f: 58, pose: breath(0) },
  ] },
};


// ── point (touch-up: the game's shared emote) — the magistrate singles someone out: a draw-back (chin up, brows down,
// left hand gathered at the collar) → the free LEFT arm shoots straight out ahead at shoulder height, body leaning in,
// jaw open ("You!") → a firmer second jab WITH a gavel tap of the staff (still plumb) → held accusation → the arm comes
// down, a smug harrumph (chin up, eyes half) → idle. Staff stays in the right hand at its plumb carry (identity).
const POINT = (d = 0, extra = {}) => ({ pos: [0, -0.012 - 0.02 * d, 0], spine: [4 + 3 * d, -10, 0], chest: [4 + 2 * d, -12, 0], head: [-4, 10, 0],
  ...BROWS(-18), ...CHEW(16 + 8 * d), ...EARS(10),
  upperArmL: [PT[0] - 6 * d, 0, PT[1]], forearmL: [PT[2], 0, 0], handL: [0, 0, 0], ...extra });
const PT = [84, 32, -24];                    // left arm: upper fwd / out, forearm straightened (picked on 8-facing stills)
CLIPS.point = { fps: 30, loop: false, interp: 'step', keys: [
  { f: 0, pose: { pos: [0, -0.03, 0], spine: [-4, 8, 0], chest: [-4, 8, 0], head: [-10, -4, 0], ...WIDE, ...BROWS(-12), ...EARS(20),
    upperArmL: [40, 0, -10], forearmL: [90, 0, 0] } },
  { f: 5, pose: POINT(0) },
  { f: 17, pose: POINT(1, { ...TAP(1) }) },
  { f: 21, pose: POINT(1) },
  { f: 34, pose: { ...breath(0), chest: [-6, 0, 0], head: [-12, 6, 0], ...HALF, ...BROWS(-6), ...EARS(10), upperArmL: [20, 0, -6], forearmL: [40, 0, 0] } },
  { f: 46, pose: breath(0) },
] };

// ── ghost / ghost-spent (touch-up). Dead players hover as a pale-blue ghost (v1 ghost row: the goat in monochrome pale
// blue, the lower robe fading out, a small gold halo bar over the horns while the ghost vote is unspent). In the spec:
//   * hover: root up 3–4 texels with a 1-texel bob (step keys 0.6 s apart), a slow ±3° sway, eyes half shut, ears
//     drooped, the free hand on the chest, the staff at its plumb carry. Loop clips keep the gait's ground IK on the
//     legs, so the shins + boots are scaled away ('shin*.s' −0.98, as in the die hold) — they are inside the dissolved
//     robe anyway;
//   * pale: material.tones (GHOST_GLSL) remaps every tone by luminance onto a pale-blue ramp when the halo bone's world
//     scale says "ghost" (spent: desaturated and darker); the lower robe + staff foot dissolve with a 2×2 ordered dither
//     (discard, both passes) from bind height 0.58 m (solid) to 0.18 m (gone) — 0.14–0.52 for the spent ghost;
//   * halo: 'halo.s' grows the buried ring (ghost only, untinted brass).
const GHOST_UP = 1 / HALO_K - 1, GHOST_SPENT = 1;
const HIDE_LEGS = { 'shinL.s': [-0.98, -0.98, -0.98], 'shinR.s': [-0.98, -0.98, -0.98] };
const GHOST = (y, roll, halo, extra = {}) => ({ pos: [0, y, 0], spine: [0, 0, roll], chest: [2, 0, roll * 0.5], head: [-4, 0, -roll],
  ...HALF, ...EARS(-12), upperArmL: [30, 0, -10], forearmL: [80, 0, 0], ...HIDE_LEGS,
  'halo.s': [halo, halo, halo], ...extra });
const ghostClip = (hi, lo, roll, halo, extra) => ({ fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
  { f: 0, pose: GHOST(hi, roll, halo, extra) },
  { f: 18, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
  { f: 36, pose: GHOST(lo, -roll, halo, extra) },
  { f: 54, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
] });
CLIPS.ghost = ghostClip(GH[0], GH[1], 3, GHOST_UP);
// spent: lower, heavier hover, head bowed, ears lower, no halo, dimmer (shader)
CLIPS['ghost-spent'] = ghostClip(GH[2], GH[3], 2, GHOST_SPENT, { head: [6, 0, 0], ...EYES(-0.6), ...EARS(-25) });

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
      float gLo = mix(${GF[0].toFixed(3)}, ${GF[2].toFixed(3)}, gSpent), gHi = mix(${GF[1].toFixed(3)}, ${GF[3].toFixed(3)}, gSpent);
      float gA = clamp((vCharBind.y - gLo) / (gHi - gLo), 0.0, 1.0);
      ivec2 gq = ivec2(gl_FragCoord.xy) & 1;
      float gT = gq.x == 0 ? (gq.y == 0 ? 0.125 : 0.625) : (gq.y == 0 ? 0.875 : 0.375);
      if (gA < gT) discard;
      toonHi = ghostTone(toonHi, gSpent); toonMid = ghostTone(toonMid, gSpent); toonSh = ghostTone(toonSh, gSpent);
    }`,
};

export function make(opts = {}) {
  const S = skeleton(opts);
  return {
    name: 'goat',
    height: H,
    palette: PALETTE,
    signature: ['horn', 'wool'],
    faceSlot: 'wool',
    bodyPlan: 'uprightAnimal',
    heightPx: [44, 58],
    skeleton: S,
    parts: parts(S),
    sockets: { knob: { bone: 'handR', at: KNOB_AT }, staffFoot: { bone: 'handR', at: FOOT_AT }, crown: { bone: 'head', at: [0, 0.62, 0.04] } },
    // (idle audit, shots/char-goat/clip-idle.png) sprung ears (f 4 ζ .55, then f 6 ζ .9) + a sprung beard still redrew 2
    // settle drawings after every breath key and did not visibly move in the game-speed walk: ears and beard are KEYED
    // per clip instead (alert up in vote/talk, flop on the slam, down in die), the beard rides the jaw
    chains: [],
    personality: { body: { f: 4, zeta: 1, r: 0 }, head: { f: 3, zeta: 0.8, r: 0 } },
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    // r2 (critic: the staff tipped 25-30° under the run lean and ~30° on the standing-start lunge). LegGait has no
    // per-bone lean cap or plumb constraint for held props, so the gait's body channels are RE-ROUTED: hips / neck /
    // head go to part-less sinks (gHips, gNeck, gHead: no lean, no hip yaw, no head lag → the staff and the robe stay
    // plumb, 0 post-turn head settle), and the spine / chest channels drive the EARS (their yaw term, ±twist·0.6/0.9,
    // lands on the sideways ear bone's `out` = up/down): the ears flop once per stride at game speed (the walk's
    // secondary). lean 0 (the Character's acceleration lean only reaches the ears' fwd channel). The staff arm's
    // channel goes to staffSway (no wrist swing); the free LEFT arm swings.
    locomotion: { plan: 'biped', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, poses: [4, 4], duty: [0.25, 0.2], reach: 0.6,
      arms: [10, 12], elbows: [0, 6], bob: [0.05, 0.06], lean: [0, 0], twist: [22, 22], lift: [0.04 * H, 0.06 * H], surge: false,
      bones: { hips: 'gHips', spine: 'earL0', chest: 'earR0', neck: 'gNeck', head: 'gHead', armR: ['staffSway'] } },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    emote: 'verdict',
    fx: { sockets: { staffFoot: { length: 0, tip: 0 }, knob: { length: 0, tip: 0 } }, vote: { node: 'knob' }, speech: { node: 'crown' },
      stepClips: ['walk', 'run'], stepEvery: 2 },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', browL: 'mid', browR: 'mid', handR: 'mid', earL0: 'mid', earR0: 'mid' },
      // (touch-up) ghost / ghost-spent look (GHOST_GLSL; bone indices = skeleton order, rig.js keeps it parent-first)
      vertexHead: GHOST_GLSL.vertexHead, fragmentHead: GHOST_GLSL.fragmentHead, tones: GHOST_GLSL.tones,
      vertex: GHOST_GLSL.vertex(S.findIndex((b) => b.name === 'head'), S.findIndex((b) => b.name === 'halo')) },
  };
}

export default make();
