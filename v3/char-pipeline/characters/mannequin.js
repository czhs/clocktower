// Mannequin (rig owner): the plain base biped every character copies. 1.4 m, 4 heads, ≈ 50 texels at viewHeight 10.
// Parts are placed from the skeleton's meta (joint heights / segment lengths), so changing biped() options
// (height, heads, legs, arms, shoulders) keeps the parts attached. Copy this file to start a new character:
// keep the structure (palette → skeleton → parts → sockets), change shapes, palette and add chains.
//
// Design: small adventurer in a terracotta tunic, slate trousers + boots, straw-cream bob hair with a
// top tuft (the signature high-value shape), dark 2-texel eyes. Values: tunic mid #BF6B44 vs grass mid
// #75A558 → clearly off-hue; hair is the lightest mass on the figure.
import { biped, RIG_PLANS, planInfo, sideOf } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export function mannequinSkeleton(opts = {}) {
  return biped({ height: 1.4, heads: 4, ...opts });
}

/** Parts for a biped skeleton (exported so variants can reuse/replace pieces). */
export function mannequinParts(S) {
  const m = S.meta, k = m.k;
  const headH = 0.27 * k;       // face block height (chin → brow line)
  const hy = 0.015 * k;          // face block bottom above the head joint
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (head joint ≈ chin) ──
  add('head', K.chamferBox(0.30 * k, headH, 0.29 * k, 0.32, { bottom: 0.03 * k }), [0, hy + headH / 2, 0.005 * k], 'skin', { name: 'face' });
  // hair: cap with bevelled top, back plate to the nape, side locks framing the face, fringe, top tuft
  add('head', K.chamferBox(0.335 * k, 0.12 * k, 0.33 * k, 0.4, { top: 0.04 * k }), [0, hy + headH - 0.02 * k, -0.012 * k], 'hair', { name: 'hairCap' });
  add('head', K.box(0.32 * k, 0.22 * k, 0.08 * k), [0, hy + headH - 0.13 * k, -0.135 * k], 'hair', { name: 'hairBack' });
  add('head', K.box(0.06 * k, 0.17 * k, 0.11 * k), [0.152 * k, hy + headH - 0.105 * k, -0.035 * k], 'hair', { name: 'hairSide', mirror: true });
  add('head', K.box(0.24 * k, 0.06 * k, 0.05 * k), [0.02 * k, hy + headH - 0.03 * k, 0.135 * k], 'hair', { name: 'fringe' });
  add('head', K.frustum(4, 0.07 * k, 0.025 * k, 0.09 * k, { shiftTop: [0.03 * k, -0.03 * k] }), [0.03 * k, hy + headH + 0.065 * k, -0.03 * k], 'hair', { name: 'tuft' });
  // eyes: 2 texels tall, dark accent, set into the face
  add('head', K.box(0.045 * k, 0.065 * k, 0.03 * k), [0.068 * k, hy + headH * 0.47, 0.135 * k], 'eye', { name: 'eye', mirror: true });

  // ── neck + torso ──
  add('neck', K.box(0.11 * k, 0.08 * k, 0.10 * k), [0, 0.02 * k, 0], 'skin', { name: 'neck' });
  const chestH = m.shoulderY - m.chestY + 0.04 * k;
  add('chest', K.chamferBox(0.32 * k, chestH, 0.235 * k, 0.32, { top: 0.035 * k }), [0, chestH / 2 - 0.01 * k, 0], 'cloth', { name: 'chest' });
  add('spine', K.chamferBox(0.28 * k, (m.chestY - m.spineY) + 0.02 * k, 0.215 * k, 0.3), [0, (m.chestY - m.spineY) / 2, 0], 'cloth', { name: 'waist' });
  add('hips', K.chamferBox(0.30 * k, 0.065 * k, 0.23 * k, 0.3), [0, m.spineY - m.hipsY - 0.005 * k, 0], 'dark', { name: 'belt' });
  add('hips', K.box(0.06 * k, 0.06 * k, 0.03 * k), [0, m.spineY - m.hipsY - 0.005 * k, 0.118 * k], 'hair', { name: 'buckle' });
  // tunic skirt: 4-sided flare over the thighs; its hem overlaps the legs (internal outline row like t3ssel8r's skirt)
  const skirtTop = m.spineY - m.hipsY - 0.03 * k, skirtBot = m.thighY - m.hipsY - 0.085 * k;
  add('hips', K.frustum(4, 0.245 * k, 0.205 * k, skirtTop - skirtBot, { sz: 0.82 }), [0, (skirtTop + skirtBot) / 2, 0], 'cloth', { name: 'skirt' });

  // ── arms (sleeve, bare forearm, hand) ──
  // short cloth sleeve cap over a bare upper arm: skin arms separate from the tunic in every facing
  add('upperArmL', K.frustum(4, 0.083 * k, 0.083 * k, 0.11 * k), [0, -0.035 * k, 0], 'cloth', { name: 'sleeve', mirror: true });
  add('upperArmL', K.frustum(4, 0.062 * k, 0.068 * k, m.upperArm), [0, -m.upperArm / 2 - 0.005 * k, 0], 'skin', { name: 'upperArm', mirror: true });
  add('forearmL', K.frustum(4, 0.058 * k, 0.062 * k, m.forearm), [0, -m.forearm / 2, 0], 'skin', { name: 'forearm', mirror: true });
  add('handL', K.chamferBox(0.09 * k, 0.09 * k, 0.095 * k, 0.4), [0, -0.035 * k, 0.005 * k], 'skin', { name: 'hand', mirror: true });

  // ── legs (trousers, boots, feet) ──
  add('thighL', K.box(0.12 * k, m.thigh + 0.03 * k, 0.125 * k), [0, -m.thigh / 2 + 0.005 * k, 0], 'dark', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.083 * k, 0.093 * k, m.shin + 0.01 * k), [0, -m.shin / 2 - 0.005 * k, 0], 'dark', { name: 'boot', mirror: true });
  add('shinL', K.box(0.145 * k, 0.05 * k, 0.15 * k), [0, -0.035 * k, 0.005 * k], 'dark', { name: 'bootCuff', mirror: true });
  add('footL', K.chamferBox(0.115 * k, m.ankleY, 0.22 * k, 0.4), [0, -m.ankleY / 2, 0.05 * k], 'dark', { name: 'foot', mirror: true });
  return P;
}

export const PALETTE = {
  skin: ['#F8D8B6', '#E0A982', '#9C6E78'],
  cloth: ['#EBA36C', '#C0683F', '#74435A'],
  dark: ['#8F8AA6', '#5F5B79', '#3E3A56'],
  hair: ['#FFF1CC', '#EED291', '#AE9FA8'],
  eye: ['#54476A', '#3F3554', '#2E2842'], // accent
};

/** Build a mannequin spec with other proportions: make({ height, heads, legs, arms, shoulders, hips }). */
export function make(opts = {}) {
  const skeleton = mannequinSkeleton(opts);
  const h = skeleton.meta.height;
  return {
    name: 'mannequin',
    height: h,
    palette: PALETTE,
    skeleton,
    parts: mannequinParts(skeleton),
    sockets: { weapon: { bone: 'handR', at: [0, -0.045 * skeleton.meta.k, 0.01], rot: [90, 0, 0] } },
    chains: [],
    personality: { body: { f: 2.5, zeta: 0.7, r: 1.5 }, head: { f: 3.5, zeta: 0.6, r: 0 } },
    locomotion: { walkSpeed: 1.4 * h / 1.4, runSpeed: 3.4 * h / 1.4, stride: 0.55 * h / 1.4 },
    clips: {},
  };
}

// ─── body-plan blockouts (round 6) ──────────────────────────────────────────────────────────────────────────────
// planParts(S) turns a template's meta.slots into plain kit masses (the Stage-1 blockout every new cast member starts
// from: copy the result, then replace shapes). makePlan(plan, opts) → a full spec for _test-rig (`char=_plan&plan=…`).
// Slot kinds: box | chamfer (chamferBox) | frustum4 (pointing +Z: beaks) | lathe (profile 'dome' | 'wheel' (axis x:
// snail shell)) | seg (a hull box from the bone's joint to the joint `to`, or 'tip' = along the bone's axis × len) |
// leaf (flat hull along the bone axis: ears, tail fans). `at: 'tip'` = at the end of the bone. `optional` slots
// (brows, mouth) are only built with { face: true }.
export const PLAN_PALETTE = {
  main: ['#EBCB9C', '#C49A6C', '#7C5A66'],     // warm tan body (off-hue vs grass)
  second: ['#A9CBE6', '#6A8FB8', '#4A5279'],   // cool blue: limbs / wings / ears (slot ≠ body)
  light: ['#FFF1CC', '#EED291', '#AE9FA8'],    // cream: snout, belly, tail tip
  dark: ['#8F8AA6', '#5F5B79', '#3E3A56'],     // slate: lower legs, nose, jaw
  accent: ['#F6AE62', '#DA7A44', '#B8604E'],   // orange: beak, bird legs, crest
  eye: ['#54476A', '#3F3554', '#2E2842'],
};
const _norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const _cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const _DIRS = { up: [0, 1, 0], down: [0, -1, 0], fwd: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };
function axisOf(b) {
  if (Array.isArray(b.axis)) return _norm(b.axis);
  if (b.axis === 'out') return [sideOf(b.name) === 'R' ? -1 : 1, 0, 0];
  return _DIRS[b.axis] ?? [0, 1, 0];
}
/** Hull box from a to b (bone-local points) with cross-section w × d (w across, d in the plane of the bend). */
function segHull(a, b, w, d, extend = 0) {
  const u = _norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const A = a.map((x, i) => x - u[i] * extend), B = b.map((x, i) => x + u[i] * extend * 0.5);
  let side = Math.abs(u[0]) < 0.9 ? _norm(_cross(u, [1, 0, 0])) : _norm(_cross(u, [0, 0, 1]));
  const across = _norm(_cross(side, u));
  const pts = [];
  for (const P of [A, B]) for (const sa of [-1, 1]) for (const sb of [-1, 1])
    pts.push([0, 1, 2].map((i) => P[i] + across[i] * sa * w / 2 + side[i] * sb * d / 2));
  return K.hull(pts);
}
function leafHull(u, len, w, t, { flat = false } = {}) {
  const wd = flat ? _norm(_cross(u, [0, 1, 0])) : (Math.abs(u[2]) > 0.9 ? [1, 0, 0] : _norm(_cross(u, [0, 0, 1])));
  const nd = _norm(_cross(u, wd));
  const P = (a, sw, st) => [0, 1, 2].map((i) => u[i] * a + wd[i] * sw + nd[i] * st);
  const pts = [];
  for (const [a, hw] of [[0, w * 0.42], [len * 0.45, w * 0.5], [len * 0.8, w * 0.3]]) for (const s of [-1, 1]) for (const q of [-1, 1]) pts.push(P(a, s * hw, q * t / 2));
  pts.push(P(len, 0, t / 3), P(len, 0, -t / 3));
  return K.hull(pts);
}
export function planParts(S, { face = false, blockout = false } = {}) {
  const by = new Map(S.map((b) => [b.name, b]));
  const P = [];
  for (const sl of S.meta.slots || []) {
    if (sl.optional && !face) continue;
    const b = by.get(sl.bone);
    if (!b) continue;
    const ax = axisOf(b);
    const tipLen = sl.len ?? (sl.to === 'tip' ? (sl.size[1] ?? 0.12) : 0);
    const tip = ax.map((x) => x * tipLen);
    let shape, at = sl.at === 'tip' ? tip : (sl.at ?? [0, 0, 0]);
    const [w, h, d] = sl.size;
    if (sl.kind === 'box') shape = K.box(w, h, d);
    else if (sl.kind === 'chamfer') shape = K.chamferBox(w, h, d, 0.32);
    else if (sl.kind === 'frustum4') shape = K.xf(K.frustum(4, 0.7, 0.25, d, { sx: w, sz: h }), { rot: [90, 0, 0] });
    else if (sl.kind === 'lathe' && sl.profile === 'wheel') shape = K.xf(K.lathe([[w * 0.55, 0], [w, h * 0.3], [w, h * 0.7], [w * 0.55, h]], 8), { rot: [0, 0, 90] });
    else if (sl.kind === 'lathe') shape = K.lathe([[w, 0], [w * 0.95, h * 0.35], [w * 0.62, h * 0.78], [0, h]], 8);
    else if (sl.kind === 'seg') {
      const end = sl.to === 'tip' ? tip : by.get(sl.to)?.pos ?? tip;
      shape = segHull([0, 0, 0], end, w, h, sl.extend ?? 0);
    } else if (sl.kind === 'leaf') shape = leafHull(ax, sl.to === 'tip' || !by.get(sl.to) ? h : Math.hypot(...by.get(sl.to).pos), w, d, { flat: !!sl.flat });
    else continue;
    if (blockout) { shape.computeBoundingBox(); const bb = shape.boundingBox; shape = K.xf(K.box(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z), { at: [(bb.max.x + bb.min.x) / 2, (bb.max.y + bb.min.y) / 2, (bb.max.z + bb.min.z) / 2] }); }
    P.push({ bone: sl.bone, shape, at, rot: sl.rot, color: sl.color, name: sl.name, mirror: !!sl.mirror });
  }
  return P;
}
/** A demo spec for a body plan: makePlan('bird', { neckN: 2 }) — opts go to the template; { face, blockout } to planParts. */
export function makePlan(plan, { face = false, blockout = false, ...opts } = {}) {
  const P = RIG_PLANS[plan];
  if (!P) throw new Error(`makePlan: unknown plan '${plan}' (${Object.keys(RIG_PLANS).join(', ')})`);
  const skeleton = P.build(opts);
  const sides = {};
  // face parts and thin sided accessories stay out of the far-half shadow (hound ears r2: far-forced = maroon horns)
  for (const b of skeleton) if (/^(eye|brow)[LR]$/.test(b.name) || /^(ear|stalk|antenna)[LR]\d+$/.test(b.name)) sides[b.name] = 'mid';
  return {
    name: `plan-${plan}`, height: skeleton.meta.H, palette: PLAN_PALETTE, skeleton, parts: planParts(skeleton, { face, blockout }),
    material: { sides }, chains: [], clips: {},
    // tools (charcheck PLANS) and motion (LegGait) names for this plan; the biped keeps the legacy Gait
    bodyPlan: planInfo(plan).check,
    ...(planInfo(plan).locomotion ? { locomotion: { plan: planInfo(plan).locomotion } } : {}),
  };
}

// char-stage / charpack on a body-plan demo: `--q 'plan=bird'` (or `&plan=hopper&popts={"ears":true}`) turns the
// default export into makePlan(plan, { face: true, ...popts }) so the REAL Character + LegGait run on every template
// (game-speed walk/run, charcheck rows). Without ?plan= (and in node) the default export stays the mannequin.
function planFromUrl() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '');
    const plan = q.get('plan');
    if (!plan || !RIG_PLANS[plan]) return null;
    return makePlan(plan, { face: true, ...(q.get('popts') ? JSON.parse(q.get('popts')) : {}) });
  } catch (e) { return null; }
}

export default planFromUrl() ?? make();
