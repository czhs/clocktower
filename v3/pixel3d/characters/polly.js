// Polly (char-polly) — cast member "polly", mascot 15-150: "The Polymorphic Parrot, in her λ tee."
// Design sheet (incl. ## Unique to me, ## Self-critique): characters/polly.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/polly.ts + refs/cast/polly.png.
// Body plan: upright CHIBI bird (chibi(), 2.45 heads to the skull top + a raked crest; leg 0.2 H with only the grey
// shins + zygodactyl toes showing under a red belly) on the LegGait 'bird' plan: walk = a bouncy WADDLE-SKIP (body roll
// onto the planted foot, one planted touchdown drawing per step, the authored walk clip adds a flight lift on the
// passing drawings and swings the hanging wings out like v1's sleeves), run = two-footed parrot HOP with wing flaps.
// Wings = the arm chain (upperArm = black tee sleeve + red coverts, forearm = yellow band + blue, hand = blue primaries).
// Vote raises a FAN of three long primaries (fanR, authored at 4 % inside the right wing tip, scaled up in the vote).
// r2 (critic 15/24): wedge + hook-tip beak, λ = coincident decal cut from the tee, wide swept tail, thick wings, toe
// fans, charcoal tee / red sh 353°, point + ghost + ghost-spent clips (crow ghost shader recipe), die rolls onto her side.
// Structure: palette → skeleton → geometry helpers → parts → ghost material → clips → spec.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.36;                  // v2 34 px → castHeight 1.36 m (crest tip)
export const SKH = 1.22;                     // template height: chibi() proportions to the skull top (crest above)
export const V_GAME = 3.95 * HEIGHT;         // 5.37 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. 5 slots + 1 accent (yellow). v1 ramps: RED #c4323c, SHIRT #2c2834 (near-black, lifted for the
// no-outline look + night floor), BEAK #e6dac2 / FACE #f0e8e2, BLUE #3a64b4, YEL #e2b23e, LEGS #9a8a86.
export const PALETTE = {
  red: ['#E85A50', '#C4323C', '#7A2430'],      // signature 1: head, crest, belly, wing coverts, tail base (r2: sh hue 353°, v1 ±15°)
  tee: ['#524C5A', '#3A3640', '#2C2832'],      // λ tee + sleeves (r2: neutral charcoal, v1 #2c2834); also pupils, mandible, lash
  ivory: ['#FFF6E6', '#EADCC4', '#A8948E'],    // signature 2: big hooked beak, white face patches, the λ
  blue: ['#5E8EE6', '#3A64B4', '#34509A'],     // flight feathers, tail tip, vote fan (r2: sh lifted — no navy sticks)
  legs: ['#9A8C8C', '#76686C', '#4E4450'],     // grey shins + toe fans (r2: darker than v1 #9a8a86 so the feet read on stone)
  yellow: ['#FFDA62', '#E2B23E', '#9C6A3C'],   // accent: the wing band, fan quills
};

const BODY = { height: SKH, heads: 2.45, legs: 0.6, arms: 1.0, snout: 0, ears: false, shoulders: 0.42, hips: 0.23 };   // r2: hips 0.17 → 0.23 (waddle stance: both toe fans show)
const D = 180 / Math.PI, R = Math.PI / 180;
// head (head-local, joint = neck top at world ≈ 0.713): ONE 16-sided ball, 0.50 wide, depth × HSZ
const HEAD_P = [[0.10, 0], [0.19, 0.04], [0.24, 0.12], [0.252, 0.24], [0.245, 0.33], [0.21, 0.42], [0.14, 0.485], [0.05, 0.51], [0, 0.512]];
const HSZ = 0.94, HN = 16;
const rAt = (P, y) => { for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const [r0, y0] = P[i - 1], [r1, y1] = P[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return P[P.length - 1][0]; };
// white face patch (v1 3×4 px) round each eye on the head's front-side; the pupil (v1 1×2 px → 2×2 texels) cut from it
const EYE_TH = 38, EYE_Y = 0.285;
const PATCH = { th: 19, y: 0.105 }, PUPIL = { th: 10, y: 0.05 };
const eyePos = () => { const r = rAt(HEAD_P, EYE_Y) * Math.cos(Math.PI / HN), t = EYE_TH * R; return [r * Math.sin(t), EYE_Y, r * HSZ * Math.cos(t)]; };
// beak hinge (head-local): the dark lower mandible swings down from here, under the ivory hook
const JAW_AT = [0, 0.175, 0.205];
// crest: a raked plume on the crown (keyed bone): back 40° at rest, up in the squawk, flat in the die
const CREST_AT = [0, 0.47, 0.0];
// tail: 1-link spring chain from the hips, back and down to just above the ground behind (v1 E/SE)
const TAIL = { at: [0, -0.07, -0.12], dir: [-0.85, -0.55, -1], len: 0.48 };   // r2: swept 40° to her right so it leaves the body outline at S/N (25 % line-up)
// wings hang from the shoulders just outside the tee (v1: 2 px strips beside the tee at S)
const SHOULDER = [0.238, 0.172, -0.01];
// vote fan: three long primaries authored at FAN_K scale inside the right wing tip, keyed 'fanR.s' = FAN_UP in the vote
export const FAN_K = 0.04;
const FAN_UP = 1 / FAN_K - 1;
const FAN_LEN = 0.46;
// ghost halo: joint inside the skull (head-local), ring HALO_LIFT above it once scaled up (≈ 0.17 m over the crest tip)
const HALO_AT = [0, 0.25, -0.02], HALO_LIFT = 0.6, HALO_MICRO = 0.001;

export function skeleton() {
  const S0 = chibi({ ...BODY, tail: { n: 1, ...TAIL }, face: { eye: eyePos(), brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  const m = S0.meta;
  S.find((b) => b.name === 'jaw').pos = [...JAW_AT];
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    S.find((b) => b.name === `upperArm${s}`).pos = [sx * SHOULDER[0], SHOULDER[1], SHOULDER[2]];
  }
  S.push({ name: 'crest', parent: 'head', pos: [...CREST_AT], axis: 'up' });
  S.push({ name: 'fanR', parent: 'handR', pos: [0, -m.hand, 0], axis: 'down' });
  // r2 ghost clips (appended LAST → every living bone keeps its texture index): the gold HALO (joint buried in the
  // skull, micro ring offset over the crest; 'halo.s' +999 in `ghost` only) and GHOSTK, a part-less control bone whose
  // scale is the ghost level the material reads (0 alive, 'ghostK.s' 1 → ghost, 2 → ghost-spent) — crow recipe
  S.push({ name: 'halo', parent: 'head', pos: [...HALO_AT], axis: 'up' });
  S.push({ name: 'ghostK', parent: 'hips', pos: [0, 0, 0], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

// ── geometry helpers ──
// uncentred lathe (y = profile y) — K.lathe centres on the bbox
function lathe0(P, n, o) { const g = K.lathe(P, n, o); g.computeBoundingBox(); return g.translate(0, P[0][1] - g.boundingBox.min.y, 0); }
function slice(P, y0, y1) {
  const out = [[rAt(P, y0), y0]];
  for (const p of P) if (p[1] > y0 + 1e-6 && p[1] < y1 - 1e-6) out.push(p);
  out.push([rAt(P, y1), y1]);
  return out;
}
// in-plane subdivision (coplanar pieces → toon shading unchanged) + split by a centroid predicate: face patches and
// pupils are cut OUT of the head surface (coincident, no inner-line ring) — CHARACTER_LEARNINGS (mushroom spots, owl eyes)
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
const centroid = (a, i) => [(a[i] + a[i + 3] + a[i + 6]) / 3, (a[i + 1] + a[i + 4] + a[i + 7]) / 3, (a[i + 2] + a[i + 5] + a[i + 8]) / 3];
function toGeo(a) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); }
function splitTris(arr, ...preds) {
  const bins = preds.map(() => []), rest = [];
  for (let i = 0; i < arr.length; i += 9) {
    const c = centroid(arr, i);
    const k = preds.findIndex((f) => f(c));
    (k >= 0 ? bins[k] : rest).push(...arr.slice(i, i + 9));
  }
  return [...bins.map(toGeo), toGeo(rest)];
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// flat paddle hull along unit u from the origin: half-widths w0 → w1 (width axis ⟂ u and ⟂ side), thickness t0 → t1
function paddle(u, len, w0, w1, t0, side = [1, 0, 0], t1 = t0, a0 = 0) {
  const wv = norm(cross(side, u)), tv = norm(cross(u, wv)), P = [];
  for (const [a, w, t] of [[a0, w0, t0], [len, w1, t1]]) for (const s of [-1, 1]) for (const q of [-1, 1]) P.push([0, 1, 2].map((i) => u[i] * a + wv[i] * w * s + tv[i] * t / 2 * q));
  return K.hull(P);
}
// angular position on the head ball (degrees round from +Z, positive toward +X) and the normalised height
const headTh = (c) => Math.atan2(c[0], c[2] / HSZ) * D;
const inEll = (c, th0, y0, rth, ry) => c[2] > 0.02 && Math.hypot((headTh(c) - th0) / rth, (c[1] - y0) / ry) < 1;

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head: ONE 16-sided ball; white patches and the pupils are cut out of its own surface
  const hs = subdivide(lathe0(HEAD_P, HN, { sz: HSZ }), 0.022);
  const pupil = (sx) => (c) => inEll(c, sx * EYE_TH, EYE_Y, PUPIL.th, PUPIL.y);
  const patch = (sx) => (c) => inEll(c, sx * EYE_TH + sx * 2, EYE_Y + 0.005, PATCH.th, PATCH.y);
  const [puL, puR, paL, paR, skull] = splitTris(hs, pupil(1), pupil(-1), patch(1), patch(-1));
  add('head', skull, [0, 0, 0], 'red', { name: 'skull' });
  add('head', paL, [0, 0, 0], 'ivory', { name: 'patchL' });
  add('head', paR, [0, 0, 0], 'ivory', { name: 'patchR' });
  // eyes: the pupil (head surface, coincident) rides the eye bone, so a blink is a SCALE of the eye ('eyeL.s'); behind
  // the pupil hole a recessed ivory patch (0.009 m inside, 30 % wider) carries a dark 1-texel lash arc (∪): open = the
  // pupil covers it, shut = the pupil collapses and the lash shows (owl r2 method; a proud lid reads as goggles)
  for (const [sd, sx, pu] of [['L', 1, puL], ['R', -1, puR]]) {
    const e = S.find((b) => b.name === 'eye' + sd).pos;
    add('eye' + sd, pu.translate(-e[0], -e[1], -e[2]), [0, 0, 0], 'tee', { name: 'pupil' + sd });
    const hole = [];
    for (let i = 0; i < hs.length; i += 9) if (inEll(centroid(hs, i), sx * EYE_TH, EYE_Y, PUPIL.th * 1.6, PUPIL.y * 1.6)) hole.push(...hs.slice(i, i + 9));
    for (let i = 0; i < hole.length; i += 3) { hole[i] *= 0.965; hole[i + 2] *= 0.965; }
    const inLash = (c) => {
      const cc = [c[0] / 0.965, c[1], c[2] / 0.965], u = (headTh(cc) - sx * EYE_TH) / PUPIL.th;
      return Math.abs(u) < 1.1 && Math.abs(cc[1] - (EYE_Y - 0.012 + 0.02 * u * u)) < 0.017;
    };
    const [lashG, shutG] = splitTris(hole, inLash);
    add('head', shutG, [0, 0, 0], 'ivory', { name: 'shut' + sd });
    add('head', lashG, [0, 0, 0], 'tee', { name: 'lash' + sd });
  }
  // beak: big hooked ivory upper mandible (v1 4 px wide, 5 tall, hooks 4 px past the face at E); base sunk into the
  // face between the patches, hook tip at the head's lower front
  // r2 (critic: "round ivory knob"): the upper mandible is a WEDGE (wide base in the face → narrow culmen arching out)
  // plus a separate HOOK TIP hull that curls DOWN in front of the chin, its point ≈ 0.11 m (4 texels) under the
  // mandible line and outside the head contour at S/SE/SW (forward depth reads as screen-down at the 30° pitch)
  const UB = [];
  for (const s of [-1, 1]) UB.push([s * 0.075, 0.35, 0.19], [s * 0.08, 0.19, 0.2], [s * 0.04, 0.345, 0.30], [s * 0.03, 0.30, 0.375],
    [s * 0.028, 0.22, 0.40], [s * 0.034, 0.15, 0.36], [s * 0.05, 0.16, 0.27]);
  add('head', K.hull(UB), [0, 0, 0], 'ivory', { name: 'beak' });
  const HK = [];
  for (const s of [-1, 1]) HK.push([s * 0.03, 0.25, 0.395], [s * 0.032, 0.17, 0.39], [s * 0.022, 0.10, 0.365], [s * 0.026, 0.17, 0.33]);
  HK.push([0, 0.035, 0.335], [0, 0.06, 0.315]);
  add('head', K.hull(HK), [0, 0, 0], 'ivory', { name: 'hook' });
  // mouth interior (dark) under the hook, revealed when the mandible drops
  add('head', K.box(0.1, 0.06, 0.08), [0, 0.17, 0.245], 'tee', { name: 'mouth' });
  // lower mandible (dark, jaw bone): a short wedge under the hook, its front edge peeks out at rest (v1 'm' pixels)
  const MB = [];
  for (const s of [-1, 1]) MB.push([s * 0.064, 0.012, -0.01], [s * 0.066, -0.06, 0.0], [s * 0.05, -0.01, 0.11], [s * 0.042, -0.085, 0.1]);
  MB.push([0, -0.06, 0.14]);
  add('jaw', K.hull(MB), [0, 0, 0], 'tee', { name: 'mandible' });
  // crest: two raked plumes (red, same bone + slot: one region), leaning back 40° and a little to the left
  // (r1: a straight plume read as an antenna at S → the tips also lean 0.07-0.1 m to the LEFT, ≥ 35° off vertical at S)
  const plume = (x, h, back, w, side) => K.hull([[x - w, -0.03, 0.05], [x + w, -0.03, 0.05], [x - w, -0.03, -0.06], [x + w, -0.03, -0.06],
    [x, 0.0, 0.07], [x + side + 0.014, h, -back], [x + side - 0.014, h, -back], [x + side, h - 0.025, -back - 0.035]]);
  add('crest', K.merge(plume(0.0, 0.14, 0.12, 0.06, 0.07), plume(0.02, 0.10, 0.17, 0.045, 0.11)), [0, 0, 0], 'red', { name: 'crest' });

  // ── λ tee: a 12-sided barrel (lower band on hips, upper on chest), short sleeves on the upper arms
  const TP = [[0.168, 0.27], [0.2, 0.30], [0.212, 0.40], [0.21, 0.56], [0.19, 0.655], [0.135, 0.73]];
  const TSZ = 0.84;
  const teeBand = (y0, y1, bone, name) => add(bone, lathe0(slice(TP, y0, y1), 12, { sz: TSZ }).translate(0, -m.restY[bone], 0), [0, 0, 0], 'tee', { name });
  teeBand(0.27, 0.42, 'hips', 'teeLow');
  // the λ — r2: a flat DECAL cut out of the tee's own surface (coincident, no depth: r1's proud boxes drew a dotted line
  // on the chest edge at E/W). Never mirrored, drawn as the viewer reads it at S (screen-right = character +X): long
  // stroke from screen top-left (−X) to bottom-right (+X), short leg from its middle to bottom-left; strokes 0.05 m
  // (≈ 2 texels), 0.16 × 0.22 m glyph, |x| ≤ 0.08 → inset ≥ 1 texel from the chest's profile edge (x ≈ 0.21).
  const LY = 0.55, segD = (px, py, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  };
  const LA = [-0.055, LY + 0.085], LB = [0.055, LY - 0.085], LM = [0, LY], LL = [-0.055, LY - 0.085];
  const inLam = (c) => c[2] > 0.1 && (segD(c[0], c[1], LA, LB) < 0.025 || segD(c[0], c[1], LM, LL) < 0.025);
  const tt = subdivide(lathe0(slice(TP, 0.42, 0.73), 12, { sz: TSZ }), 0.014);
  const [lamG, teeG] = splitTris(tt, inLam);
  add('chest', teeG.translate(0, -m.restY.chest, 0), [0, 0, 0], 'tee', { name: 'teeTop' });
  add('chest', lamG.translate(0, -m.restY.chest, 0), [0, 0, 0], 'ivory', { name: 'lambda' });

  // ── red lower body (the parrot under the tee hem, v1 ball r 4.5 px)
  const BP = [[0.03, 0.115], [0.12, 0.125], [0.175, 0.165], [0.19, 0.22], [0.18, 0.29]];
  add('hips', lathe0(BP, 12, { sz: 0.86 }).translate(0, -m.restY.hips, 0), [0, 0, 0], 'red', { name: 'belly' });

  // ── wings (arm chain, flat paddles in the side plane just outside the tee): sleeve stub, red coverts, yellow band,
  // blue flight feathers, blue primaries tip
  const dn = [0, -1, 0];
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1;
    add('upperArm' + sd, K.box(0.11, 0.09, 0.17), [sx * 0.002, -0.03, 0], 'tee', { name: 'sleeve' + sd });
    add('upperArm' + sd, paddle(dn, m.upperArm - 0.06, 0.072, 0.07, 0.062), [0, -0.065, -0.01], 'red', { name: 'covert' + sd });
    add('forearm' + sd, paddle(dn, 0.06, 0.07, 0.068, 0.06), [0, 0, -0.012], 'yellow', { name: 'band' + sd });
    // r2: flight + primaries ≥ 3 texels thick (0.085 m) and the tip stays broad (half-width 0.05): edge-on wing
    // gestures read as a feathered paddle, not a navy stick/baton
    add('forearm' + sd, paddle(dn, m.forearm - 0.06, 0.068, 0.066, 0.08), [0, -0.06, -0.014], 'blue', { name: 'flight' + sd });
    add('hand' + sd, paddle(norm([0, -1, -0.12]), 0.14, 0.066, 0.05, 0.085, [1, 0, 0], 0.075), [0, 0, -0.016], 'blue', { name: 'primary' + sd });
  }
  // vote fan (right wing): three long primaries fanned in the wing plane, authored at FAN_K inside the wing tip
  const fan = K.merge(
    paddle(norm([0, -1, 0.42]), FAN_LEN * 0.9, 0.035, 0.05, 0.05),
    paddle(dn, FAN_LEN, 0.035, 0.05, 0.05),
    paddle(norm([0, -1, -0.42]), FAN_LEN * 0.9, 0.035, 0.05, 0.05));
  add('fanR', K.xf(fan, { scale: FAN_K }), [0, 0, 0], 'blue', { name: 'fan' });
  add('fanR', K.xf(K.box(0.15, 0.07, 0.16), { scale: FAN_K, at: [0, -0.02 * FAN_K, 0] }), [0, 0, 0], 'yellow', { name: 'fanBase' });

  // ── tail: long feather bundle, red base → blue tip (v1), on the 1-link tail chain
  const tb = S.find((b) => b.name === 'tail0');
  const tu = norm(tb.axis);
  // r2: the tail is WIDE across X (side axis = cross(u, X) → width along X): at N it is a broad red→blue wedge
  // (v1 N), not a 1-px stick; thick (0.07) so it keeps ≥ 2 texels at E/W
  const tside = cross(tu, [1, 0, 0]);
  add('tail0', paddle(tu, TAIL.len * 0.6, 0.07, 0.075, 0.07, tside, 0.065, -0.04), [0, 0, 0], 'red', { name: 'tailBase' });
  add('tail0', paddle(tu, TAIL.len, 0.075, 0.05, 0.065, tside, 0.05, TAIL.len * 0.6), [0, 0, 0], 'blue', { name: 'tailTip' });

  // ── legs: grey shins (visible below the belly) + r2 TOE FANS: three toes spread forward (0.15 m ≈ 5 texels wide at
  // the tips) + a back toe, flat on the ground, so a contact drawing shows a planted foot, not a peg
  for (const sd of ['L', 'R']) {
    add('shin' + sd, K.box(0.07, m.shin + 0.02, 0.07), [0, -m.shin / 2, 0], 'legs', { name: 'shank' + sd });
    const g = -m.ankleY + 0.001;
    add('foot' + sd, K.merge(
      K.hull([[0.045, 0, -0.03], [-0.045, 0, -0.03], [0.05, g, -0.04], [-0.05, g, -0.04], [0.045, g + 0.035, 0.04], [-0.045, g + 0.035, 0.04],
        [0.08, g, 0.12], [-0.08, g, 0.12], [0.075, g + 0.028, 0.11], [-0.075, g + 0.028, 0.11], [0, g, 0.145], [0, g + 0.028, 0.135]]),
      K.hull([[0.03, g, -0.02], [-0.03, g, -0.02], [0.025, g + 0.03, -0.02], [-0.025, g + 0.03, -0.02], [0, g, -0.1], [0, g + 0.02, -0.095]])),
    [0, 0, 0], 'legs', { name: 'toes' + sd });
  }
  // r2 ghost halo: open octagon r 0.15 m, 0.045 m bars (≥ 1.5 texels), offset HALO_LIFT up, then built at 1/1000 size
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * Math.PI / 4;
    ring.push(K.xf(K.box(0.13, 0.045, 0.05), { rot: [0, a * D, 0], at: [Math.sin(a) * 0.15, HALO_LIFT, Math.cos(a) * 0.15] }));
  }
  add('halo', K.xf(K.merge(...ring), { scale: HALO_MICRO }), [0, 0, 0], 'yellow', { name: 'halo' });
  return P;
}

// ── r2 GHOST look (spec-only, crow recipe; no shared code). The clip sets the scale of the part-less bone `ghostK`; the
// vertex shader reads det(ghostK) / det(hips) = (1 + s)³ → vPollyGhost 0 / 1 / 2. Fragment (`tones`): hi/mid/sh each
// mapped by perceptual lightness onto a pale ramp (ghost: slate blue → ice; spent: dimmer grey-blue) so the red head,
// white patches and dark pupils keep their value order; bands in BIND height fade the belly to mist and dissolve the
// legs/toes (dither, then gone); the halo (found by its bind position) stays flat emissive gold.
const lin3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
export const GHOST = {
  ghost: ['#3A5696', '#E2EEFA'],   // [dark end, light end] sRGB (v1 ghost row: pale blue, values kept)
  spent: ['#3A4260', '#98A2BA'],   // dimmer grey-blue (ghost vote used, no halo)
  mist: '#D4E0F2',
  halo: '#FFE08A',
};
function boneOrder(S) {   // = rig.js buildCharacter topological order (the bone texture index)
  const by = new Map(S.map((b) => [b.name, b])), seen = new Set(), out = [];
  const visit = (b) => { if (seen.has(b.name)) return; if (b.parent) visit(by.get(b.parent)); seen.add(b.name); out.push(b.name); };
  S.forEach(visit);
  return out;
}
function restWorld(S, name) {
  const by = new Map(S.map((b) => [b.name, b]));
  const p = [0, 0, 0];
  for (let b = by.get(name); b; b = b.parent ? by.get(b.parent) : null) for (let i = 0; i < 3; i++) p[i] += (b.pos || [0, 0, 0])[i];
  return p;
}
function ghostMaterial(S) {
  const order = boneOrder(S), iG = order.indexOf('ghostK'), iH = order.indexOf('hips');
  const h = restWorld(S, 'halo');
  return {
    vertexHead: 'varying float vPollyGhost;',
    vertex: `
      vPollyGhost = 0.0;
      #ifdef USE_SKINNING
      {
        float dG = determinant(mat3(getBoneMatrix(${iG}.0))), dH = determinant(mat3(getBoneMatrix(${iH}.0)));
        float rg = dG / max(abs(dH), 1e-6);
        vPollyGhost = rg > 16.0 ? 2.0 : (rg > 4.0 ? 1.0 : 0.0);
      }
      #endif`,
    fragmentHead: `varying float vPollyGhost;
      vec3 pollyGhostTone(vec3 c, vec3 d, vec3 l) {
        float v = sqrt(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0));
        return mix(d, l, clamp((v - 0.12) * 1.35, 0.0, 1.0));
      }`,
    tones: `
      if (vPollyGhost > 0.5) {
        bool pHalo = distance(vCharBind, vec3(${h.map((v) => v.toFixed(4)).join(', ')})) < 0.01;
        if (!pHalo) {
          bool sp = vPollyGhost > 1.5;
          vec3 gd = sp ? ${lin3(GHOST.spent[0])} : ${lin3(GHOST.ghost[0])};
          vec3 gl = sp ? ${lin3(GHOST.spent[1])} : ${lin3(GHOST.ghost[1])};
          float y = vCharBind.y;
          ivec2 px = ivec2(gl_FragCoord.xy);
          if (y < 0.09) discard;
          if (y < 0.16 && ((px.x + px.y) & 1) == 1) discard;
          float fm = y < 0.22 ? 0.55 : (y < 0.32 ? 0.25 : 0.0);
          vec3 mist = sp ? ${lin3(GHOST.spent[1])} : ${lin3(GHOST.mist)};
          toonHi = mix(pollyGhostTone(toonHi, gd, gl), mist, fm);
          toonMid = mix(pollyGhostTone(toonMid, gd, gl), mist, fm);
          toonSh = mix(pollyGhostTone(toonSh, gd, gl), mist, fm);
          float kNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
          totalEmissiveRadiance += toonMid * (sp ? 0.12 : 0.3) * kNight;
        } else {
          totalEmissiveRadiance = ${lin3(GHOST.halo)};
          toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
        }
      }`,
  };
}

// ── clips (pose triples [fwd, twist, out] deg) ──
const EYES = (sy, sx = 0, sz = 0) => ({ 'eyeL.s': [sx, sy, sz], 'eyeR.s': [sx, sy, sz] });
const SHUT = EYES(-0.97, -0.97, -0.97), HALF = EYES(-0.5);
const WINGS = (out, fwd = 0, tw = 0) => ({ upperArmL: [fwd, tw, out], upperArmR: [fwd, tw, out] });
const breathe = (d, extra = {}) => ({ pos: [0, -0.028 * d, 0], chest: [3 * d, 0, 0], head: [-3 * d, 0, 0], ...WINGS(3 + 4 * d), ...extra });
const FAN = { 'fanR.s': [FAN_UP, FAN_UP, FAN_UP] };
// squawk spread — r2: wings flung UP into a V (out 132 = 42° above horizontal, no backward sweep), twisted −90 so the
// broad red/yellow/blue face shows at S/SE/SW (probe `shots/char-polly/r3/s-squawk.png` f0; r1's 122/−22 read as a T-pose)
const SPREAD = { ...WINGS(132, 0, -90), forearmL: [0, 0, 12], forearmR: [0, 0, 12] };
// talk wing beat — r2: the gesturing wing opens its broad face (twist −50) and presents, out 62 + forearm 30
// (probe `r3/s-talk.png` f20: red/yellow/blue paddle at SE, not r1's navy stick)
const TALK_L = { upperArmL: [40, -50, 62], forearmL: [30, 0, 0] }, TALK_R = { upperArmR: [40, -50, 62], forearmR: [30, 0, 0] };
// point (the game's shared emote) — the RIGHT wing straight out to the side, forward 80 / out 120 (≈ 30° above level),
// the primaries stretched into a "finger" (handR.s), chest + head turned into it (probe `r3/s-point2.png` f30: a clear
// stroke at S/SE/E/N/NW/W; SW/NE weak)
const POINT_W = { upperArmR: [80, -60, 120], forearmR: [-15, 0, 0], 'handR.s': [-0.1, 0.6, -0.1] };
const POINT = (extra = {}) => ({ chest: [0, -20, 0], head: [-8, -30, 0], crest: [-22, 0, 0], ...POINT_W, upperArmL: [0, 0, 8], ...extra });
// die final — r2: rolled onto her side (hips roll 75°, long axis horizontal at S/SE/SW), face up toward the camera,
// eyes shut (probe `r3/s-die.png` f20; r1 lay on her back and read as SITTING at S)
const DEAD = (roll, extra = {}) => ({ pos: [-0.3, -0.14, 0], hips: [-15, 0, roll], head: [10, -15, -10], ...SHUT, crest: [30, 0, 0],
  ...WINGS(16), thighL: [30, 0, 10], shinL: [-40, 0, 0], thighR: [50, 0, 6], shinR: [-60, 0, 0], tail0: [-20, 0, 0], ...extra });

// ghost (r2, crow recipe): hover (`pos` y carries +0.1 for the idle leg IK's reach dip, see CHARACTER_LEARNINGS), wings
// drifting out a little, tail down, crest up; level 1 = ghost (+ halo), 2 = ghost-spent (dimmer, lower, head bowed 6°)
const HOVER = 0.1;
const GHOSTK = (lv) => ({ 'ghostK.s': [lv, lv, lv] });
const HALO = { 'halo.s': [1 / HALO_MICRO - 1, 1 / HALO_MICRO - 1, 1 / HALO_MICRO - 1] };
const ghostPose = (lv, up, d, extra = {}) => ({ pos: [0, HOVER + up, 0], ...GHOSTK(lv), ...(lv === 1 ? HALO : {}),
  chest: [3 * d, 0, 0], head: [-3 * d + (lv === 2 ? 6 : 0), 0, 0], ...WINGS(14 + 8 * d, 0, -30), crest: [lv === 2 ? 40 : 34, 0, 0],   // crest laid flat back: clear of the halo
  tail0: [16, 0, 0], ...extra });
const ghostClip = (lv) => ({ fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [
  { f: 0, pose: ghostPose(lv, lv === 1 ? 0.18 : 0.12, 0) },
  { f: 16, pose: ghostPose(lv, lv === 1 ? 0.15 : 0.10, 0.5) },
  { f: 32, pose: ghostPose(lv, lv === 1 ? 0.12 : 0.08, 1) },
  { f: 48, pose: ghostPose(lv, lv === 1 ? 0.15 : 0.10, 0.5, { head: [-2 + (lv === 2 ? 6 : 0), -14, 14] }) },   // the head cock
] });

// walk/run: authored upper body on top of the LegGait bird plan ('add'); f0 = left contact, one key per drawing
const WALK = { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
  { f: 0, pose: { upperArmL: [0, 0, 6], upperArmR: [-8, 0, 30], tail0: [0, 0, -14], crest: [-6, 0, 0] } },
  { f: 1, pose: { pos: [0, 0.05, 0], upperArmL: [-12, 0, 18], upperArmR: [-12, 0, 18], tail0: [-12, 0, 0], crest: [16, 0, 0], head: [-4, 0, 0] } },
  { f: 2, pose: { upperArmL: [-8, 0, 30], upperArmR: [0, 0, 6], tail0: [0, 0, 14], crest: [-6, 0, 0] } },
  { f: 3, pose: { pos: [0, 0.05, 0], upperArmL: [-12, 0, 18], upperArmR: [-12, 0, 18], tail0: [-12, 0, 0], crest: [16, 0, 0], head: [-4, 0, 0] } },
] };
const RUN = { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
  { f: 0, pose: { ...WINGS(10, 10), tail0: [12, 0, 0], crest: [-8, 0, 0] } },
  { f: 1, pose: { ...WINGS(62, -10), tail0: [-10, 0, 0], crest: [20, 0, 0] } },
  { f: 2, pose: { ...WINGS(78, -18), tail0: [-16, 0, 0], crest: [26, 0, 0] } },
  { f: 3, pose: { ...WINGS(34, -6), tail0: [0, 0, 0], crest: [10, 0, 0] } },
] };

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
    { f: 0, pose: breathe(0) },
    { f: 24, pose: breathe(1) },
    // parrot head cock (species tell): roll 22° + a turn toward the dir-1 camera
    { f: 36, pose: breathe(0, { neck: [0, -8, 0], head: [-4, -14, 22], crest: [-10, 0, 0] }) },
    { f: 56, pose: breathe(0) },
    { f: 62, pose: breathe(0, SHUT) },
    { f: 65, pose: breathe(0) },
  ] },
  walk: WALK,
  run: RUN,
  talk: { fps: 30, loop: true, interp: 'step', length: 24, dynamics: 'hold', events: { 0: 'speak' }, keys: [
    { f: 0, pose: { chest: [-3, -6, 0], head: [-8, -12, 10], jaw: [38, 0, 0], crest: [-22, 0, 0], ...TALK_L, upperArmR: [0, 0, 6] } },
    { f: 6, pose: { pos: [0, -0.03, 0], chest: [2, -2, 0], head: [2, -6, -6], upperArmL: [4, 0, 12], upperArmR: [0, 0, 6] } },
    { f: 12, pose: { chest: [-3, -8, 0], head: [-8, -16, -10], jaw: [36, 0, 0], crest: [-22, 0, 0], ...TALK_R, upperArmL: [0, 0, 6] } },
    { f: 18, pose: { pos: [0, -0.03, 0], chest: [2, -4, 0], head: [2, -8, 6], upperArmR: [4, 0, 12], upperArmL: [0, 0, 6] } },
  ] },
  vote: { fps: 30, loop: false, interp: 'step', length: 40, events: { 3: 'vote@fanTip' }, keys: [
    { f: 0, pose: { pos: [0, -0.04, 0], chest: [6, 0, 0], head: [-4, 0, 0], upperArmR: [-20, 0, 18], upperArmL: [0, 0, 8], crest: [10, 0, 0] } },
    { f: 3, pose: { hips: [0, 0, 6], spine: [-4, 0, 8], chest: [-4, 0, 8], head: [-10, -12, -12], jaw: [14, 0, 0], crest: [-30, 0, 0],
      upperArmR: [12, -70, 158], forearmR: [0, 0, 8], ...FAN, upperArmL: [0, 0, 14] } },
  ] },
  die: { fps: 30, loop: false, interp: 'step', length: 60, legs: 'fk', keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-8, 0, 6], head: [-6, -10, 20], ...HALF, crest: [12, 0, 0], ...WINGS(28) } },
    { f: 6, pose: { pos: [0, -0.1, 0], hips: [10, 0, 0], chest: [10, 0, 0], head: [-4, -10, 10], ...SHUT, crest: [20, 0, 0], ...WINGS(20),
      thighL: [70, 0, 10], shinL: [-120, 0, 0], thighR: [70, 0, 10], shinR: [-120, 0, 0], tail0: [-20, 0, 0] } },
    // r2: tips over SIDEWAYS (roll) instead of onto the back
    { f: 12, pose: { pos: [-0.12, -0.1, 0], hips: [-8, 0, 38], chest: [0, 0, 6], head: [0, -10, -6], ...SHUT, crest: [24, 0, 0], ...WINGS(36),
      thighL: [50, 0, 12], shinL: [-80, 0, 0], thighR: [60, 0, 10], shinR: [-90, 0, 0], tail0: [-20, 0, 0] } },
    { f: 16, pose: DEAD(82, { jaw: [14, 0, 0] }) },
    { f: 20, pose: DEAD(75, { jaw: [8, 0, 0] }) },
  ] },
  // point (the game's shared emote): wing cocked back (4) → the right wing shoots out to the side, beak open "you!" (6) →
  // beak shut, held → a small second emphasis (wing lifts 4°, beak) → held to ≈ 3.3 s (pipgws EMOTE_POINT_MS 3500) →
  // lowered → idle
  point: { fps: 30, loop: false, interp: 'step', length: 108, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [4, 10, 0], head: [-2, -8, 0], upperArmR: [-20, 0, 30], forearmR: [30, 0, 0], crest: [10, 0, 0] } },
    { f: 4, pose: POINT({ jaw: [30, 0, 0], crest: [-36, 0, 0] }) },
    { f: 10, pose: POINT() },
    { f: 40, pose: POINT({ upperArmR: [84, -60, 126], head: [-12, -30, 0], jaw: [22, 0, 0] }) },
    { f: 46, pose: POINT() },
    { f: 96, pose: POINT() },
    { f: 100, pose: breathe(0, { upperArmR: [10, 0, 30], forearmR: [20, 0, 0] }) },
    { f: 106, pose: breathe(0) },
  ] },
  ghost: ghostClip(1),
  'ghost-spent': ghostClip(2),
  // signature emote: the POLYMORPHIC SQUAWK — crouch, wings flung up into a V, crest up, beak wide; two head bobs; settle
  squawk: { fps: 30, loop: false, interp: 'step', length: 36, events: { 6: 'emote:exclaim@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.045, 0], chest: [8, 0, 0], head: [-2, 0, 0], ...WINGS(-6, -14), crest: [16, 0, 0] } },
    { f: 6, pose: { pos: [0, 0.03, 0], chest: [-8, 0, 0], head: [-14, -10, 0], jaw: [40, 0, 0], crest: [-45, 0, 0], ...SPREAD } },
    { f: 14, pose: { pos: [0, -0.04, 0], chest: [6, 0, 0], head: [4, -10, 12], crest: [-28, 0, 0], ...WINGS(62, 0, -90) } },
    { f: 20, pose: { pos: [0, 0.02, 0], chest: [-6, 0, 0], head: [-12, -10, -8], jaw: [36, 0, 0], crest: [-45, 0, 0], ...SPREAD } },
    { f: 26, pose: { pos: [0, -0.03, 0], head: [0, -8, 0], crest: [-10, 0, 0], ...WINGS(30) } },
    { f: 32, pose: breathe(0) },
  ] },
};

export function make() {
  const S = skeleton();
  const m = S.meta;
  return {
    name: 'polly',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['red', { part: 'beak' }],
    faceSlot: 'ivory',
    bodyPlan: 'uprightAnimal',
    heightPx: [42, 56],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'waddle' },
    emote: 'squawk',
    skeleton: S,
    parts: parts(S),
    sockets: {
      crown: { bone: 'head', at: [0, 0.52, 0] }, beak: { bone: 'head', at: [0, 0.2, 0.39] }, mouth: { bone: 'jaw', at: [0, -0.02, 0.1] },
      fanTip: { bone: 'fanR', at: [0, -FAN_LEN * FAN_K, 0] }, wingTipL: { bone: 'handL', at: [0, -0.12, -0.02] }, wingTipR: { bone: 'handR', at: [0, -0.12, -0.02] },
    },
    chains: [{ name: 'tail', f: 3.5, zeta: 0.65, r: 0, gravity: 0.4, limit: 25 }],
    personality: { body: { f: 3.5, zeta: 0.7, r: 0 }, head: { f: 4, zeta: 0.8, r: 0 } },
    locomotion: { plan: 'bird', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4], duty: [0.25, 0.25],
      lift: [0.04 * HEIGHT, 0.05 * HEIGHT], bob: [0.035, 0.04], roll: [10, 4], headBob: [6, 6], lean: [6, 12],
      hop: [0.12 * HEIGHT, 0.22 * HEIGHT], surge: false, plant: 'hold', wings: [] },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { feather: ['#E85A50', '#3A64B4'], spark: ['#FFF8DC', '#FFDA62'], vote: { node: 'fanTip' }, speech: { node: 'crown' },
      soul: { node: 'chest' }, stepClips: [] },
    material: { sides: { eyeL: 'mid', eyeR: 'mid' }, ...ghostMaterial(S) },
  };
}

export default make();
