// Theo Rem (char-theo-rem) — cast member "theo-rem", mascot 21-127: "A hedgehog. Q.E.D."
// Design sheet (Unique to me, timing charts, self-critique): characters/theo-rem.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/theo-rem.ts + refs/cast/theo-rem.png.
// Body plan: upright CHIBI (chibi(), v2 draws him upright) whose body is ONE spiky ball: the `ball` bone (child of the
// chest, pivot at the ball centre) carries the brown spine shell, its cream front (belly/bib cut out of the same
// surface) and 23 long outline quills (r2: the v1 sawtooth); it is KEYED by scale (`ball.s`: squash on the walk contact, stretch in flight,
// bristle in vote / die). LegGait 'biped' scurry at the v2 game speed (3.95 H/s, 4 drawings per ≈ 0.29 s, plant 'hold').
// Story props (the Q.E.D. card with the tombstone ∎: vote overhead + the qed slap; an index finger on each paw for point)
// are baked at 1/1000 size and shown only by `<bone>.s` 999 in the clips that use them (unkeyed bones are identity = invisible).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.12;                 // v2 28 px → castHeight 1.12 m (spine tips)
export const V_GAME = 3.95 * HEIGHT;        // 4.42 m/s

// [hi, mid, sh] sRGB. 5 slots + 1 accent (brass spectacles).
export const PALETTE = {
  spine: ['#94704E', '#6A4A36', '#45302A'],   // signature: the spine ball + spikes (v1 #7E604A / #5E3C2A / #453932)
  cream: ['#F6E4D6', '#E4C8AA', '#AC8868'],   // face, belly, snout, spike tips, Q.E.D. card (v1 #E8CFA4 / #E2C290)
  skin: ['#C4946A', '#A07250', '#6E4C3A'],    // paws, legs, feet, ears (v1 #A77A5A)
  eye: ['#4A3E48', '#2C2228', '#3A3040'],     // eyes, nose, mouth, the ∎ mark (v1 #2A1C20, lifted; no black)
  brass: ['#F0D07E', '#B8914A', '#7A603E'],   // accent: the tiny round spectacles (v1 #B0904C)
};

const BODY = { height: HEIGHT, heads: 2.2, legs: 0.6, arms: 0.8, snout: 0.25, ears: false, tail: false };
// ball (the body): ellipsoid in character space (centre, radii) — v1 spiky dome from 0.16 H to 0.84 H, set back a little
const BALL_C = [0, 0.58, -0.07], BALL_R = [0.30, 0.38, 0.28];
// face ball (head-local; the head joint sits at y 0.603): v1 face ball centre 0.656 m, r 0.176
const HEAD_Y = 0.603;
const FACE_C = [0, 0.10, 0.10], FACE_R = [0.215, 0.2, 0.18];
// eye joint on the face surface (head-local, L) + the surface normal there (yaw out, pitch up)
const EYE = (() => {
  const x = 0.094, y = FACE_C[1] + 0.04;
  const z = FACE_C[2] + FACE_R[2] * Math.sqrt(1 - (x / FACE_R[0]) ** 2 - ((y - FACE_C[1]) / FACE_R[1]) ** 2);
  return [x, y, z];
})();
const EN = (() => {
  const n = [EYE[0] / FACE_R[0] ** 2, (EYE[1] - FACE_C[1]) / FACE_R[1] ** 2, (EYE[2] - FACE_C[2]) / FACE_R[2] ** 2];
  return { yaw: Math.atan2(n[0], n[2]) * 180 / Math.PI, pitch: Math.atan2(n[1], Math.hypot(n[0], n[2])) * 180 / Math.PI };
})();
// arm segment directions at rest [out°, fwd°] (L side; R mirrored): paws carried in front of the belly sides (v1)
const ARM = { up: [22, 24], fore: [26, 64] };   // paws at the belly SIDES (r2: paws over the belly drew a dashed belt in the walk)
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
const TINY = 0.001;                          // story-prop bake scale (shown by '<bone>.s' 999)

export function skeleton() {
  const S0 = chibi({ ...BODY, face: { eye: EYE, brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM.up], [`hand${s}`, ARM.fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  const chestY = S0.meta.chestY;
  S.find((b) => b.name === 'jaw').pos = [0, 0.03, 0.27];
  S.push({ name: 'ball', parent: 'chest', pos: [BALL_C[0], BALL_C[1] - chestY, BALL_C[2]], axis: 'up' });
  S.push({ name: 'mouth', parent: 'head', pos: [0, 0.035, 0.31], axis: 'fwd' });   // plate hidden inside the snout at rest
  const fd = armDir(ARM.fore).map((v, i) => (i === 0 ? -v : v));
  S.push({ name: 'card', parent: 'handR', pos: fd.map((v) => v * 0.06), axis: 'down' });
  S.push({ name: 'finger', parent: 'handL', pos: armDir(ARM.fore).map((v) => v * 0.05), axis: 'down' });   // LEFT paw = the camera side at dir 1 (SE)
  S.push({ name: 'fingerR', parent: 'handR', pos: fd.map((v) => v * 0.05), axis: 'down' });   // point: both paws (the near one reads at every facing)
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
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const ang = (p) => Math.abs(Math.atan2(p[0], p[2])) * 180 / Math.PI;   // 0 = front
// ellipsoid as a lathe (centred), n sides, `rings` latitude steps
const ellip = (r, n = 16, rings = 8) => K.lathe(Array.from({ length: rings + 1 }, (_, i) => {
  const t = (i / rings) * Math.PI; return [Math.sin(t) < 1e-6 ? 0 : Math.sin(t), -Math.cos(t)];
}).map(([a, b]) => [a, b * r[1]]), n, { sx: r[0], sz: r[2] });
// one spike: base centre b, direction d, length L, base half-width w; split at fraction k into body + tip
function spike(b, d, L, w, k) {
  d = norm(d);
  let u = cross(d, [0, 1, 0]); if (Math.hypot(...u) < 1e-3) u = [1, 0, 0]; u = norm(u);
  const v = norm(cross(u, d));
  const ring = (c, h) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, e]) => add3(add3(c, u, a * h), v, e * h));
  const base = ring(b, w), mid = ring(add3(b, d, L * k), w * (1 - k) * 1.05), tip = add3(b, d, L);
  return [K.hull([...base, ...mid]), K.hull([...mid, tip])];
}
// flat ring (spectacle rim) in the XY plane, normal +Z, centred: n box segments
const rim = (r, t, d, n = 10) => K.merge(...[...Array(n)].map((_, k) => {
  const a = (k / n) * 360, ar = a * Math.PI / 180, seg = 2 * Math.PI * r / n * 1.18;
  return K.xf(K.box(seg, t, d), { rot: [0, 0, a + 90], at: [Math.cos(ar) * r, Math.sin(ar) * r, 0] });
}));

// spiky ball (ball-local, centre 0): a SMOOTH flat-faceted ellipsoid shell (lat/lon cells, front cells = cream belly/bib
// cut out of the same surface) + a few LONG outline quills (4-sided pyramids leaning back and up, base sunk into the
// shell). v1 identity = a 13-15-tooth sawtooth outline of 2-3 px teeth, a smooth back with a few quill strokes.
const LATS = [-90, -68, -46, -24, -2, 20, 42, 64, 90], NJ = 16;
const isFront = (lat, az) => Math.abs(az) < 60 && lat < 40;            // cell centre in the cream belly/bib sector
// quills: [lat, az, length]; rows staggered so the teeth interleave along every silhouette ring
const QUILLS = [
  ...[0, 90, 180, -90].map((az) => [80, az, 0.2]),
  ...[48, -48, 98, -98, 172].map((az) => [54, az, 0.25]),
  ...[64, -64, 118, -118, 162, -162].map((az) => [18, az, 0.26]),
  ...[90, -90, 148, -148].map((az) => [-14, az, 0.25]),
  ...[66, -66, 124, -124].map((az) => [-44, az, 0.2]),
].map(([lat, az, L]) => (az < -60 && lat < 70 ? [lat - 11, az + 9, L] : [lat, az, L]));   // right half offset: no mirror pair (a symmetric pair of dark quill undersides drew eyes at N)
const Q_W = 0.085, Q_UP = 0.2, Q_BACK = 0.45, Q_TIPK = 0.6, Q_SINK = 0.05;
function spikeBall() {
  const R = BALL_R;
  const P = (lat, lon) => { const a = lat * Math.PI / 180, o = lon * Math.PI / 180; return [R[0] * Math.cos(a) * Math.sin(o), R[1] * Math.sin(a), R[2] * Math.cos(a) * Math.cos(o)]; };
  const N = (p) => norm([p[0] / R[0] ** 2, p[1] / R[1] ** 2, p[2] / R[2] ** 2]);
  const shell = [], tips = [], front = [];
  const tri = (out, a, b, c, outward) => {
    const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    if (n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) out.push(...a, ...c, ...b); else out.push(...a, ...b, ...c);
  };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i + 1 < LATS.length; i++) {
    for (let j = 0; j < NJ; j++) {
      const o0 = (j / NJ) * 360, o1 = ((j + 1) / NJ) * 360;
      let poly = [P(LATS[i], o0), P(LATS[i], o1), P(LATS[i + 1], o1), P(LATS[i + 1], o0)];
      if (LATS[i] === -90) poly = [poly[0], poly[2], poly[3]];
      else if (LATS[i + 1] === 90) poly = poly.slice(0, 3);
      const cen = poly.reduce((s, p) => add3(s, p, 1 / poly.length), [0, 0, 0]);
      const latC = (LATS[i] + LATS[i + 1]) / 2, azC = (((o0 + o1) / 2 + 180) % 360) - 180;
      const out = isFront(latC, azC) ? front : shell;
      for (let k = 1; k + 1 < poly.length; k++) tri(out, poly[0], poly[k], poly[k + 1], N(cen));
    }
  }
  for (const [lat, az, L] of QUILLS) {
    const s = P(lat, az), n = N(s);
    const d = norm(add3(n, [0, Q_UP, -Q_BACK]));
    const b = add3(s, n, -Q_SINK);
    let u = cross(d, [0, 1, 0]); if (Math.hypot(...u) < 1e-3) u = [1, 0, 0]; u = norm(u);
    const v = norm(cross(u, d));
    const base = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, e]) => add3(add3(b, u, a * Q_W), v, e * Q_W));
    const apex = add3(b, d, L + Q_SINK);
    for (let k = 0; k < 4; k++) {
      const a = base[k], c = base[(k + 1) % 4];
      const o = norm(add3(add3(add3(a, c, 1), apex, 1), b, -3));
      const ta = lerp(a, apex, Q_TIPK), tc = lerp(c, apex, Q_TIPK);
      tri(shell, a, c, tc, o); tri(shell, a, tc, ta, o);
      tri(Math.abs(az) < 105 || lat > 70 ? tips : shell, ta, tc, apex, o);   // cream tips only on outline quills (back ones face the N camera)
    }
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return K.flat(g); };
  return { shell: mk(shell), tips: mk(tips), front: mk(front) };
}

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── the ball (body): a smooth flat-faceted ellipsoid (cream belly/bib cells cut out of the same surface) + 23 long
  // quills (4-sided pyramids, 0.2-0.26 m, leaning back + up; cream tips only on quills that sit on the outline, abs(az) < 105)
  // (spikeBall + QUILLS above).
  const { shell, tips, front } = spikeBall();
  add('ball', shell, [0, 0, 0], 'spine', { name: 'shell' });
  add('ball', tips, [0, 0, 0], 'cream', { name: 'spikeTips' });
  add('ball', front, [0, 0, 0], 'cream', { name: 'belly' });

  // ── head: cream face ball, snout + button nose, little skin ears on the face's top corners ──
  add('head', ellip(FACE_R, 16, 8), FACE_C, 'cream', { name: 'face' });
  add('head', K.hull([[-0.09, 0.0, 0.22], [0.09, 0.0, 0.22], [-0.08, 0.11, 0.22], [0.08, 0.11, 0.22],
    [-0.045, 0.035, 0.39], [0.045, 0.035, 0.39], [-0.04, 0.095, 0.39], [0.04, 0.095, 0.39]]), [0, 0, 0], 'cream', { name: 'snout' });
  add('head', K.chamferBox(0.065, 0.055, 0.05, 0.35), [0, 0.088, 0.405], 'eye', { name: 'nose' });
  add('mouth', K.box(0.07, 0.026, 0.02), [0, 0, 0], 'eye', { name: 'mouthLine' });
  add('jaw', K.hull([[-0.06, -0.03, -0.06], [0.06, -0.03, -0.06], [-0.06, 0.0, -0.06], [0.06, 0.0, -0.06],
    [-0.04, -0.02, 0.05], [0.04, -0.02, 0.05], [-0.045, 0.0, 0.05], [0.045, 0.0, 0.05]]), [0, 0, 0], 'cream', { name: 'chin' });
  add('head', K.xf(K.chamferBox(0.095, 0.085, 0.065, 0.35), { rot: [0, 25, -20] }), [0.14, 0.267, 0.12], 'skin', { name: 'ear', mirror: true });

  // eyes: a 1x2-texel dark pupil turned to the surface normal (no glint: a 2x2 eye + glint inside a 5-texel ring drew a "+" at SE)
  const eyeRot = { rot: [-EN.pitch, EN.yaw, 0] };
  const onN = (v) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-EN.pitch * Math.PI / 180, EN.yaw * Math.PI / 180, 0, 'XYZ')); return new THREE.Vector3(...v).applyQuaternion(q).toArray(); };
  add('eyeL', K.xf(K.box(0.036, 0.07, 0.04), eyeRot), onN([0, 0, -0.012]), 'eye', { name: 'eye', mirror: true });
  // spectacles (head bone: never squash with a blink): two brass rims round the eyes + bridge + short temples
  for (const s of [1, -1]) {
    const rr = { rot: [-EN.pitch, s * EN.yaw, 0] };
    const c = [s * EYE[0], EYE[1], EYE[2]];
    const off = (v) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-EN.pitch * Math.PI / 180, s * EN.yaw * Math.PI / 180, 0, 'XYZ')); return add3(c, new THREE.Vector3(...v).applyQuaternion(q).toArray()); };
    add('head', K.xf(rim(0.05, 0.024, 0.026), rr), off([0, 0, 0.004]), 'brass', { name: s > 0 ? 'rimL' : 'rimR' });
    add('head', K.xf(K.box(0.03, 0.03, 0.1), rr), off([s * 0.08, 0.01, -0.05]), 'brass', { name: s > 0 ? 'templeL' : 'templeR' });
  }
  add('head', K.box(0.07, 0.03, 0.03), [0, EYE[1] + 0.012, EYE[2] + 0.02], 'brass', { name: 'bridge' });

  // ── arms: skin, short; paws carried in front of the belly ──
  const seg = (bone, d, len, r0, r1, name, color) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM.up)), m.upperArm, 0.06, 0.055, 'upper' + sd, 'skin');
    seg('forearm' + sd, m3(armDir(ARM.fore)), m.forearm + 0.01, 0.055, 0.06, 'fore' + sd, 'skin');
    const d = m3(armDir(ARM.fore));
    add('hand' + sd, K.chamferBox(0.09, 0.085, 0.09, 0.4), d.map((v) => v * 0.03), 'skin', { name: 'paw' + sd });
  }
  // ── legs: short skin legs + feet ──
  add('thighL', K.frustum(4, 0.08, 0.075, m.thigh + 0.03), [0, -m.thigh / 2, 0], 'skin', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.07, 0.075, m.shin), [0, -m.shin / 2, 0], 'skin', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.11, m.ankleY + 0.04, 0.17, 0.35), [0, -m.ankleY / 2 + 0.01, 0.045], 'skin', { name: 'foot', mirror: true });

  // ── story props (TINY; card = hand-local up when the arm points up): the Q.E.D. card and the index finger ──
  const T = (g, at) => ({ g: K.xf(g, { scale: TINY }), at: at.map((v) => v * TINY) });
  const card = T(K.chamferBox(0.3, 0.26, 0.09, 0.15), [0, -0.19, 0]);
  add('card', card.g, card.at, 'cream', { name: 'card' });
  for (const z of [1, -1]) {
    const q = T(K.box(0.11, 0.11, 0.02), [0, -0.19, z * 0.04]);
    add('card', q.g, q.at, 'eye', { name: z > 0 ? 'qedF' : 'qedB' });
  }
  const fg = T(K.chamferBox(0.065, 0.16, 0.065, 0.3), [0, -0.08, 0]);
  add('finger', fg.g, fg.at, 'skin', { name: 'fingerTip' });
  add('fingerR', fg.g, fg.at, 'skin', { name: 'fingerTipR' });
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ─────────────────────────────────────────────────────
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const BLINK = EYES(0, -0.8);
const HALF = EYES(0, -0.45);
const WIDE = EYES(0.12, 0.15);
const OPEN = { jaw: [22, 0, 0], 'mouth.p': [0, -0.045, 0.05], 'mouth.s': [0.7, 1.0, 0] };   // r2: wider so it shows past the snout at SE
const BALL = (x, y = x, z = x) => ({ 'ball.s': [x, y, z] });
const SHOW = (b) => ({ [b + '.s']: [999, 999, 999] });
// the Q.E.D. card slapped out to his right at chest height, ∎ facing front (qed emote)
const CARD_OUT = { upperArmR: [30, 0, 80], forearmR: [10, 0, 0], 'upperArmR.l': [0.5], 'forearmR.l': [0.4], card: [0, 40, -60], ...SHOW('card') };   // twisted toward the SE (pack) camera
const breathe = (d, c, extra = {}) => ({ pos: [0, -0.01 - d, 0], spine: [c * 0.5, 0, 0], chest: [c, 0, 0], head: [-1.5 * c, 0, 0], ...extra });
// walk/run: paws held out at the ball's sides (added to the gait's swing) so the forearms never cross the cream belly
const WALK_ARMS = { upperArmL: [0, 0, 22], upperArmR: [0, 0, 22] };
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0) },
    { f: 30, pose: breathe(0.014, 2, BALL(0.015)) },
    { f: 36, pose: breathe(0.028, 4, BALL(0.03)) },
    { f: 50, pose: breathe(0.028, 4, { ...BALL(0.03), ...BLINK }) },
    { f: 52, pose: breathe(0.028, 4, BALL(0.03)) },
    { f: 60, pose: breathe(0.028, 4, { ...BALL(0.03), head: [-8, -12, 10] }) },
    { f: 66, pose: breathe(0.014, 2, BALL(0.015)) },
  ] },
  // walk / run (LegGait drawings, f0 = left contact; blend 'add' on the plan's bob/arms): the spine ball squashes on
  // each contact and stretches in flight, the body rolls onto the planted side (round-animal waddle), head counter-rolls
  walk: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { ...WALK_ARMS, ...BALL(0.06, -0.06, 0.06), spine: [0, 0, 7], head: [0, 0, -5] } },
    { f: 1, pose: { ...WALK_ARMS, ...BALL(-0.03, 0.06, -0.03), spine: [0, 0, 0], head: [-3, 0, 0] } },
    { f: 2, pose: { ...WALK_ARMS, ...BALL(0.06, -0.06, 0.06), spine: [0, 0, -7], head: [0, 0, 5] } },
    { f: 3, pose: { ...WALK_ARMS, ...BALL(-0.03, 0.06, -0.03), spine: [0, 0, 0], head: [-3, 0, 0] } },
  ] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, blend: 'add', keys: [
    { f: 0, pose: { ...WALK_ARMS, ...BALL(0.08, -0.08, 0.08), spine: [0, 0, 6] } },
    { f: 1, pose: { ...WALK_ARMS, ...BALL(-0.04, 0.08, -0.04) } },
    { f: 2, pose: { ...WALK_ARMS, ...BALL(0.08, -0.08, 0.08), spine: [0, 0, -6] } },
    { f: 3, pose: { ...WALK_ARMS, ...BALL(-0.04, 0.08, -0.04) } },
  ] },
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], chest: [-4, 6, 0], head: [-8, 8, 6], ...OPEN, upperArmR: [30, 0, 40], forearmR: [40, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.045, 0], chest: [2, 2, 0], head: [-2, 4, -4], ...HALF, ...BALL(0.02, -0.03, 0.02) } },
    { f: 12, pose: { pos: [0, -0.01, 0], chest: [-4, 10, 0], head: [-8, 12, -6], ...OPEN, upperArmL: [60, 0, 50], forearmL: [60, 0, 0], ...SHOW('finger') } },
    { f: 18, pose: { pos: [0, -0.045, 0], chest: [2, -2, 0], head: [-2, 4, 4], ...HALF, ...BALL(0.02, -0.03, 0.02) } },
  ] },
  vote: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 3: 'vote@cardTop' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], chest: [8, 0, 0], head: [-8, 0, 0], ...BALL(0.02, -0.04, 0.02), upperArmR: [-10, 0, 10] } },
    { f: 3, pose: { pos: [0, 0.04, 0], spine: [-2, 0, 6], chest: [-4, 0, 8], head: [-8, 10, -6], ...WIDE, ...BALL(0.06),
      upperArmR: [25, 0, 148], forearmR: [0, 0, -15], 'upperArmR.l': [1.3], 'forearmR.l': [1.2], card: [0, 45, 0], ...SHOW('card') } },
  ] },
  // point: BOTH paws (the hedgehog's arms are shorter than his ball): the right paw thrusts forward (reads at W / SW, near
  // side), the left is flung forward-out (reads at S / SE / E); both long by '.l' 1.3 so they clear the quill outline
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [4, -10, 0], head: [-4, -6, 0], ...HALF, upperArmL: [20, 0, 20], forearmL: [80, 0, 0], upperArmR: [20, 0, 20], forearmR: [80, 0, 0] } },
    { f: 4, pose: { pos: [0, 0.01, 0], chest: [-2, 6, 0], head: [-6, 8, 4], ...WIDE,
      upperArmL: [60, 0, 70], forearmL: [10, 0, 0], 'upperArmL.l': [1.3], 'forearmL.l': [1.3],
      upperArmR: [85, 0, 30], forearmR: [0, 0, 0], 'upperArmR.l': [1.3], 'forearmR.l': [1.3], ...SHOW('finger'), ...SHOW('fingerR') } },
    { f: 28, pose: { pos: [0, -0.01, 0], chest: [0, 4, 0], head: [-4, 4, 0], upperArmL: [40, 0, 30], forearmL: [40, 0, 0], upperArmR: [50, 0, 20], forearmR: [40, 0, 0] } },
    { f: 34, pose: breathe(0, 0) },
  ] },
  // die: a gentle curl-up that keeps falling: every drawing is lower and more tipped than the one before; the final key
  // (f24) is the flattest (ball squashed wide, hips rolled ~110° about a diagonal, the whole ball down on the ground)
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', dynamics: 'snap', events: { 18: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.01, 0], spine: [-4, 0, 8], chest: [-6, 0, 6], head: [-10, -10, 12], ...HALF } },
    { f: 6, pose: { pos: [0, -0.1, 0], spine: [16, 0, 0], chest: [14, 0, 0], head: [16, 0, 0], ...BLINK, ...KNEES(50), ...BALL(0.06),
      upperArmL: [60, 0, 10], upperArmR: [60, 0, 10], forearmL: [60, 0, 0], forearmR: [60, 0, 0] } },
    { f: 12, pose: { pos: [0, -0.16, 0], hips: [20, 0, -50], spine: [20, 0, 0], chest: [20, 0, 0], head: [20, -10, 0], ...BLINK, ...KNEES(70), ...BALL(0.1, -0.04, 0.1),
      upperArmL: [70, 0, 10], upperArmR: [70, 0, 10], forearmL: [70, 0, 0], forearmR: [70, 0, 0] } },
    { f: 18, pose: { pos: [0, -0.2, 0], hips: [30, 0, -88], spine: [20, 0, 0], chest: [20, 0, 0], head: [20, -20, 0], ...BLINK, ...KNEES(80), ...BALL(0.12, -0.08, 0.12),
      upperArmL: [80, 0, 10], upperArmR: [80, 0, 10], forearmL: [70, 0, 0], forearmR: [70, 0, 0] } },
    { f: 24, pose: { pos: [0, -0.24, 0], hips: [34, 0, -100], spine: [22, 0, 0], chest: [22, 0, 0], head: [22, -20, 0], ...BLINK, ...KNEES(85), ...BALL(0.14, -0.12, 0.14),
      upperArmL: [80, 0, 10], upperArmR: [80, 0, 10], forearmL: [70, 0, 0], forearmR: [70, 0, 0] } },
  ] },
  // Q.E.D. (emote): the punchline is the tombstone card. f0 wind-up (card hidden behind him, crouch), f6 SLAP: the card
  // swung out to his right at chest height, ∎ facing front, eyes shut, chin up; f12 proud hop; f16 land (dust); f20 hold
  // (star); f46 relax. The vote is the card held OVERHEAD (different arm angle, eyes wide) — the two read apart.
  qed: { fps: 30, loop: false, interp: 'step', dynamics: 'snap', events: { 16: 'land', 20: 'emote:star@crown' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [8, 0, 0], chest: [6, -14, 0], head: [6, -10, 0], ...HALF, ...BALL(0.04, -0.04, 0.04),
      upperArmR: [-40, 0, 25], forearmR: [60, 0, 0], upperArmL: [30, 0, 15], forearmL: [70, 0, 0] } },
    { f: 6, pose: { pos: [0, 0.01, 0], spine: [-4, 0, 0], chest: [-6, 10, 0], head: [-14, 10, -4], ...BLINK, ...BALL(0.02),
      ...CARD_OUT, upperArmL: [30, 0, 20], forearmL: [80, 0, 0] } },
    { f: 12, pose: { pos: [0, 0.13, 0], spine: [-4, 0, 0], chest: [-6, 10, 0], head: [-14, 10, -4], ...BLINK, ...BALL(-0.03, 0.06, -0.03), ...KNEES(25),
      ...CARD_OUT, upperArmL: [30, 0, 30], forearmL: [80, 0, 0] } },
    { f: 16, pose: { pos: [0, -0.04, 0], spine: [-4, 0, 0], chest: [-6, 10, 0], head: [-14, 10, -4], ...BLINK, ...BALL(0.06, -0.06, 0.06),
      ...CARD_OUT, upperArmL: [30, 0, 20], forearmL: [80, 0, 0] } },
    { f: 20, pose: { pos: [0, 0, 0], spine: [-4, 0, 0], chest: [-6, 10, 0], head: [-14, 10, -4], ...BLINK, ...BALL(0.03),
      ...CARD_OUT, upperArmL: [30, 0, 20], forearmL: [80, 0, 0] } },
    { f: 46, pose: breathe(0, 0) },
  ] },
  ghost: { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 16, pose: {
    pos: [0, [0.03, 0.015, 0, 0.015][i], 0], head: [-6, 0, [4, 0, -4, 0][i]], upperArmL: [20, 0, 30], upperArmR: [20, 0, 30], forearmL: [30, 0, 0], forearmR: [30, 0, 0],
    ...KNEES(20), ...(i === 2 ? HALF : {}) } })) },
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 64, dynamics: 'hold', keys: [0, 1, 2, 3].map((i) => ({ f: i * 16, pose: {
    pos: [0, [-0.02, -0.035, -0.05, -0.035][i], 0], spine: [6, 0, 0], chest: [6, 0, 0], head: [12, 0, [3, 0, -3, 0][i]], ...HALF, ...BALL(0, -0.03, 0),
    upperArmL: [0, 0, 8], upperArmR: [0, 0, 8], ...KNEES(10) } })) },
};
CLIPS.vote.length = 31;
CLIPS.die.length = 61;
CLIPS.qed.length = 47;

export function make() {
  const S = skeleton();
  return {
    name: 'theo-rem',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['spine', { part: 'rimL' }],
    faceSlot: 'cream',
    bodyPlan: 'uprightAnimal',
    heightPx: [36, 48],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'qed',
    skeleton: S,
    parts: parts(S),
    sockets: { crown: { bone: 'head', at: [0.2, 0.5, 0.0] }, cardTop: { bone: 'card', at: [0, -0.28, 0] } },
    chains: [],
    personality: { body: { f: 3.5, zeta: 0.5, r: 0 }, head: { f: 3.5, zeta: 0.6, r: 0 } },
    locomotion: { plan: 'biped', plant: 'hold', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      duty: [0.18, 0.1], reach: 0.6, arms: [18, 26], elbows: [8, 14], bob: [0.05, 0.1], lean: [6, 12],
      lift: [0.06, 0.09], twist: [6, 9] },
    character: { quant: { yaw: 8, chain: 4 } },
    ghost: { hover: 0.14 },
    clips: CLIPS,
    fx: { stepClips: ['walk', 'run'], stepEvery: 2, speech: { node: 'crown' }, sockets: { cardTop: { length: 0 } } },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', mouth: 'mid', card: 'mid', finger: 'mid', fingerR: 'mid' },
      merge: { jaw: 'head' },
      whiteKeep: 0.5, whiteKeepLift: 0.5 },
  };
}

export default make();
