// Archivist Hoot (char-owl) — cast member "owl", villager: "Has read every ledger twice. Remembers who lied."
// Design sheet (incl. ## Unique to me, ## Self-critique): characters/owl.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/owl.ts + refs/cast/owl.png.
// Body plan: upright CHIBI, robed (chibi(), 2.0 heads to the crown + ear tufts; feet only under the hem), driven by the
// LegGait 'bird' plan: walk = alternating WADDLE (body roll over the planted foot + head thrust), run = two-footed hop.
// The wings hug the ledger in the REST geometry (LegGait carries the arms at rest; `wings: []` keeps them there).
// Structure: palette → skeleton → geometry helpers → parts → clips → spec.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.28;                  // v2 32 px → castHeight 1.28 m (tuft tips)
export const V_GAME = 3.95 * HEIGHT;         // 5.06 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. 5 slots + 1 accent (amber/gold). r2: robe darkened toward v1 navy; 'dark' became a warm
// v1-ledger brown so the ledger separates from the burgundy mantle (critic-owl: one burgundy mass at S).
export const PALETTE = {
  feather: ['#C69568', '#A2744E', '#8E6E74'],  // head, tufts, wing tips, talons (v2 #A17852)
  disc: ['#FFF0D2', '#EED8B0', '#B49C98'],     // facial disc (lightest mass), ledger pages, eye glint
  robe: ['#5C68A4', '#434D86', '#3C3A62'],     // navy academic robe + sleeves (v2 #2E3A6E; sh at the night floor)
  mantle: ['#C45C6C', '#943A4C', '#64304A'],   // burgundy mantle, mouth flash
  dark: ['#9A6040', '#74432A', '#4C3042'],     // ledger cover (v1 #7a4326), beak, pupils, closed-eye lash line
  amber: ['#FFD77A', '#F0A22C', '#A8643A'],    // accent: the eyes, gold hem / edges / cuffs / ledger band
  // r3 GHOST shells (clips ghost / ghost-spent only, hidden inside the body otherwise): pale blue-lilac body, near-white
  // disc, pale rose mantle + ledger, pale gold eyes/trim; pupils + beak use the navy robe slot. 'spent' = dimmer set.
  ghost: ['#EEF4FF', '#C2D4F2', '#9AA2D2'],
  ghostDisc: ['#F4F7FC', '#E4ECF8', '#BAC2E0'],
  ghostRose: ['#F2D8EE', '#D6B6DC', '#A890C0'],
  ghostGold: ['#FFF0BC', '#F0D488', '#BCA67A'],
  spent: ['#AEB8D6', '#8C98BE', '#6A729C'],
  spentDisc: ['#C8D0E4', '#AEB6D2', '#868EB0'],
  spentRose: ['#BCA8C8', '#9E8CB0', '#766A8C'],
  spentGold: ['#D6CC9E', '#B8AA7E', '#8C8268'],
};
// ghost shell sets: palette slot per original slot (dark parts named in GHOST_DARK → navy robe slot)
const GHOST_SETS = {
  gh: { feather: 'ghost', robe: 'ghost', disc: 'ghostDisc', mantle: 'ghostRose', amber: 'ghostGold', dark: 'ghostRose' },
  gs: { feather: 'spent', robe: 'spent', disc: 'spentDisc', mantle: 'spentRose', amber: 'spentGold', dark: 'spentRose' },
};
const GHOST_DARK = /^(pupil|beak|mandible)/;
const GHOST_K = 0.2;                          // rest scale of a shell (hidden deep inside its region); ghost key: × 1/K

const BODY = { height: 1.15, heads: 2.0, legs: 0.45, arms: 1.0, shoulders: 0.48, snout: 0, tail: false };
// head (head-local, joint = chin at world ≈ 0.54): a ball 0.60 wide, 0.535 tall, depth × HSZ
const HEAD_P = [[0.13, 0], [0.24, 0.05], [0.295, 0.15], [0.30, 0.28], [0.27, 0.40], [0.19, 0.49], [0.07, 0.53], [0, 0.535]];
const HSZ = 0.9, HN = 10, HC = 0.27;           // depth scale, sides, ball centre height
const rAt = (P, y) => { for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const [r0, y0] = P[i - 1], [r1, y1] = P[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return P[P.length - 1][0]; };
const EYE_TH = 26, EYE_Y = 0.29, IRIS_TH = 19, IRIS_E = 0.33;
const eyePos = () => { const r = rAt(HEAD_P, EYE_Y) * Math.cos(Math.PI / HN), t = EYE_TH * Math.PI / 180; return [r * Math.sin(t), EYE_Y, r * HSZ * Math.cos(t)]; };
// ear tufts (r2): broad cat-ear PYRAMIDS with depth (a triangle at E/W too, v1), leaning 38° out and back; both hang
// off a part-less 'tuftRoot' bone on the crown that LegGait drives as its 'neck' channel → the tufts flick per drawing
const TUFT_LEAN = 38, TUFT_LEN = 0.25;
const TUFT = { at: [0.15, 0.46, -0.03], dir: [Math.sin(TUFT_LEAN * Math.PI / 180), Math.cos(TUFT_LEAN * Math.PI / 180), -0.3], len: TUFT_LEN };

// wings hug the ledger at REST: segment directions (L side; R mirrored). upper: down + forward along the robe;
// fore: forward + inward to the ledger's side; the feather "hand" paddle wraps the ledger corner.
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ARM = { up: norm([0.10, -0.87, 0.48]), fore: norm([-0.58, 0.04, 0.81]), hand: norm([-0.45, -0.2, 0.87]) };
// ledger on the chest (chest-local), cover hinge at its front-RIGHT edge (−X)
const BOOK = { at: [0, 0.01, 0.265], w: 0.25, h: 0.26, d: 0.11 };

export function skeleton() {
  const S0 = chibi({ ...BODY, ears: { n: 1, ...TUFT }, face: { eye: eyePos(), brow: 0.085, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  const m = S0.meta;
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1, mx = (v, len) => [sx * v[0] * len, v[1] * len, v[2] * len];
    S.find((b) => b.name === `forearm${s}`).pos = mx(ARM.up, m.upperArm);
    S.find((b) => b.name === `hand${s}`).pos = mx(ARM.fore, m.forearm);
  }
  // lower mandible hinge just behind the beak tip
  S.find((b) => b.name === 'jaw').pos = [0, 0.215, 0.25];
  // tufts re-parented to a crown bone (LegGait 'neck' channel, see locomotion.bones)
  const iL = S.findIndex((b) => b.name === 'earL0');
  S.splice(iL, 0, { name: 'tuftRoot', parent: 'head', pos: [0, TUFT.at[1], TUFT.at[2]], axis: 'up' });
  for (const s of ['L', 'R']) { const b = S.find((x) => x.name === `ear${s}0`); b.parent = 'tuftRoot'; b.pos = [s === 'L' ? TUFT.at[0] : -TUFT.at[0], 0, 0]; }
  S.push({ name: 'book', parent: 'chest', pos: BOOK.at, axis: 'up' });
  S.push({ name: 'bookLid', parent: 'book', pos: [-BOOK.w / 2, 0, BOOK.d / 2 - 0.005], axis: 'left' });
  // r3 ghost shells: one part-carrying bone per region and set, at the region's centre (see SHELLS)
  const W = worldOf(S);
  for (const set of Object.keys(GHOST_SETS)) for (const sh of SHELLS) S.push({ name: set + sh.key, parent: sh.parent, pos: sh.rel(W), axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: m } });
}

// bind world positions (bone pos are parent offsets in character axes; parents precede children)
function worldOf(S) {
  const W = {};
  for (const b of S) { const p = b.parent ? W[b.parent] : [0, 0, 0]; W[b.name] = [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]; }
  return W;
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const midOf = (W, a, b) => sub(W[a].map((v, i) => (v + W[b][i]) / 2), W[a]);
// ── GHOST SHELLS (r3). The engine has no per-clip tint, so the pale ghost is GEOMETRY: every region's parts are copied
// (same shapes, × infl about the region centre) in the ghost palette onto a shell bone at that centre. At rest the
// shell is built × GHOST_K (a small copy buried deep inside the region → never visible); the ghost clips scale the
// shell bones × 1/GHOST_K, so the inflated pale copy encloses the normal body (which stays, hidden, inside it).
// The robe becomes a tapering wisp TAIL (no feet). Two sets: 'gh' (ghost, vote unspent) and 'gs' (spent, dimmer).
const SHELLS = [
  { key: 'Head', parent: 'head', rel: () => [0, 0.27, 0], bones: ['head', 'jaw', 'eyeL', 'eyeR', 'earL0'], infl: 1.045, own: /^(tuft|beak|mandible)/, ownInfl: 1.15 },
  // the WINGS ride the chest shell (ghost keys never move the arms): own-centre copies; one shell bone for torso+wings
  // keeps the (bone, slot) pairs ≤ ~50 so look.js partTable still finds UNIQUE part-line ids (66 pairs: none → the
  // living clips lost sleeve/robe inner lines, 37 px at the idle turnaround; shots/char-owl/owl_pairs.js)
  { key: 'Chest', parent: 'chest', rel: () => [0, 0.07, 0.03], bones: ['chest', 'book', 'bookLid', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR'],
    infl: 1.05, own: /^(sleeve|cuff|wingTip)/, ownInfl: 1.12 },
  { key: 'Hips', parent: 'hips', rel: () => [0, -0.1, 0], tail: true },
];
const SHELL_SKIP = /^(shutLid|lash|mouth|brow)/;      // recessed / hidden-at-rest parts stay out of the shells

// ── geometry helpers ──
// uncentred lathe (y = profile y) — K.lathe centres on the bbox
function lathe0(P, n, o) { const g = K.lathe(P, n, o); g.computeBoundingBox(); return g.translate(0, P[0][1] - g.boundingBox.min.y, 0); }
function slice(P, y0, y1) {
  const out = [[rAt(P, y0), y0]];
  for (const p of P) if (p[1] > y0 + 1e-6 && p[1] < y1 - 1e-6) out.push(p);
  out.push([rAt(P, y1), y1]);
  return out;
}
// in-plane subdivision (coplanar pieces → toon shading unchanged) + split by a centroid predicate: patterns are cut OUT
// of the surface (coincident, no inner-line ring) — CHARACTER_LEARNINGS §Silhouette (mushroom cap spots)
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
const D = 180 / Math.PI;
// frustum along unit direction d (from its base at the origin), K.frustum is centred and points +Y
function segAlong(d, len, r0, r1, n = 4) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return K.xf(K.frustum(n, r0, r1, len), { rot: [e.x * D, e.y * D, e.z * D], at: d.map((v) => v * len / 2) });
}
// flat paddle hull along u: half-widths w0 → w1, thickness t, width axis ⟂ u in the plane of u and `side`
function paddle(u, len, w0, w1, t, side = [0, 1, 0], t1 = t) {
  const wv = norm(cross(side, u)), tv = norm(cross(u, wv)), P = [];
  for (const [a, w, tt] of [[0, w0, t], [len, w1, t1]]) for (const s of [-1, 1]) for (const q of [-1, 1]) P.push([0, 1, 2].map((i) => u[i] * a + wv[i] * w * s + tv[i] * tt / 2 * q));
  return K.hull(P);
}

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head: ONE 10-sided ball; the cream facial disc (two overlapping circles round the eyes, v2 owl.ts) is cut out of
  // its own surface; brows are recessed inside the skull at rest and pushed out by '.p' in the judging keys
  const head = lathe0(HEAD_P, HN, { sz: HSZ });
  const inDisc = (c) => {
    if (c[2] <= 0.02) return false;
    const th = Math.atan2(c[0], c[2] / HSZ) * D, e = (c[1] - HC) / 0.265;
    return [-1, 1].some((s) => Math.hypot((th - s * EYE_TH) / 37, (e + 0.02) / 0.56) < 1);
  };
  // amber irises cut out of the same surface (a proud eye disc lost its amber to the inner-line ring at 1x)
  const eC = (HC - EYE_Y) / -0.265;
  const inIris = (c) => {
    if (c[2] <= 0.02) return false;
    const th = Math.atan2(c[0], c[2] / HSZ) * D, e = (c[1] - HC) / 0.265;
    return [-1, 1].some((s) => Math.hypot((th - s * EYE_TH) / IRIS_TH, (e - eC) / IRIS_E) < 1);
  };
  // pupil (2×2-texel dark) and glint (1-texel cream) cut from the iris too: a proud pupil drew a line ring = a 4-px brown blob
  const inEyeSpot = (c, dth, de, rth, re) => {
    if (c[2] <= 0.02) return false;
    const th = Math.atan2(c[0], c[2] / HSZ) * D, e = (c[1] - HC) / 0.265;
    return [-1, 1].some((s) => Math.hypot((th - s * (EYE_TH + dth)) / rth, (e - eC - de) / re) < 1);
  };
  const inGlint = (c) => inEyeSpot(c, 1.5, 0.11, 4.5, 0.075), inPupil = (c) => inEyeSpot(c, -2.5, 0, 8.5, 0.15);
  const hs = subdivide(head, 0.022);
  const sideL = (f) => (c) => c[0] > 0 && f(c), sideR = (f) => (c) => c[0] < 0 && f(c);
  const [glL, puL, irL, glR, puR, irR, discG, featherG] = splitTris(hs, sideL(inGlint), sideL(inPupil), sideL(inIris),
    sideR(inGlint), sideR(inPupil), sideR(inIris), inDisc);
  add('head', featherG, [0, 0, 0], 'feather', { name: 'skull' });
  add('head', discG, [0, 0, 0], 'disc', { name: 'facialDisc' });
  // r2 EYES: iris + pupil + glint (still the head's own surface, coincident → no inner-line ring) ride the eyeL/R bones,
  // so a blink is a SCALE of the eye ('eyeL.s'), never a proud lid (critic-owl: proud lids drew goggle rings). Behind the
  // eye hole sits a recessed CLOSED-EYE patch (0.009 m inside the skull, 25 % wider than the hole): cream with a dark
  // 1-texel lash arc (∪). Open eye = the iris covers it; shut = the iris collapses and the lash arc shows.
  for (const [sd, sx, gl, pu, ir] of [['L', 1, glL, puL, irL], ['R', -1, glR, puR, irR]]) {
    const e = S.find((b) => b.name === 'eye' + sd).pos;
    const toEye = (g) => g.translate(-e[0], -e[1], -e[2]);
    add('eye' + sd, toEye(ir), [0, 0, 0], 'amber', { name: 'iris' + sd });
    add('eye' + sd, toEye(pu), [0, 0, 0], 'dark', { name: 'pupil' + sd });
    add('eye' + sd, toEye(gl), [0, 0, 0], 'disc', { name: 'glint' + sd });
    const inHole = (c) => {
      if (c[2] <= 0.02 || c[0] * sx <= 0) return false;
      const th = Math.atan2(c[0], c[2] / HSZ) * D, ee = (c[1] - HC) / 0.265;
      return Math.hypot((th - sx * EYE_TH) / (IRIS_TH * 1.3), (ee - eC) / (IRIS_E * 1.3)) < 1;
    };
    const inLash = (c) => {
      const th = Math.atan2(c[0], c[2] / HSZ) * D, ee = (c[1] - HC) / 0.265, u = (th - sx * EYE_TH) / IRIS_TH;
      const arc = eC - 0.06 + 0.10 * u * u;                       // ∪: lowest at the eye centre
      return Math.abs(u) < 1.0 && Math.abs(ee - arc) < 0.06;
    };
    const holeTris = []; for (let i = 0; i < hs.length; i += 9) { const c = [(hs[i] + hs[i + 3] + hs[i + 6]) / 3, (hs[i + 1] + hs[i + 4] + hs[i + 7]) / 3, (hs[i + 2] + hs[i + 5] + hs[i + 8]) / 3]; if (inHole(c)) holeTris.push(...hs.slice(i, i + 9)); }
    for (let i = 0; i < holeTris.length; i += 3) { holeTris[i] *= 0.97; holeTris[i + 2] *= 0.97; }   // 0.009 m inward
    const [lashG, shutG] = splitTris(holeTris, (c) => inLash([c[0] / 0.97, c[1], c[2] / 0.97]));
    add('head', shutG, [0, 0, 0], 'disc', { name: 'shutLid' + sd });
    add('head', lashG, [0, 0, 0], 'dark', { name: 'lash' + sd });
  }
  // brows: feather blocks over the inner top of each eye (hidden 0.03 inside the skull at rest)
  add('browL', K.box(0.1, 0.045, 0.04), [0.03, 0, -0.045], 'feather', { name: 'brow', mirror: true });
  // beak: a small dark down-pointing wedge between the eyes. r2 MOUTH: a burgundy mouth block sits under the upper beak
  // behind the closed mandible; talk drops the mandible (jaw.p −0.05 + 25°) → ≥ 2 texels of burgundy flash at S/SE
  add('head', K.hull([[0.04, 0.285, 0.235], [-0.04, 0.285, 0.235], [0.04, 0.235, 0.245], [-0.04, 0.235, 0.245], [0, 0.29, 0.29], [0, 0.20, 0.29]]),
    [0, 0, 0], 'dark', { name: 'beak' });
  add('head', K.box(0.07, 0.05, 0.025), [0, 0.205, 0.252], 'mantle', { name: 'mouth' });
  add('jaw', K.hull([[0.045, 0.005, -0.02], [-0.045, 0.005, -0.02], [0.045, -0.04, -0.02], [-0.045, -0.04, -0.02], [0.03, 0.0, 0.05], [-0.03, 0.0, 0.05], [0, -0.03, 0.055]]),
    [0, 0, 0], 'dark', { name: 'mandible' });
  // ear tufts: a pyramid per side (base buried in the skull, tip 38° out + back): front view and side view both a
  // triangle; the buried base stays ≥ 0.02 m inside the 10-gon skull so no tuft edge pokes out on the back of the head
  // (head-local points, minus the joint): the OUTER edge starts on the skull's side at y 0.40, where the skull outline
  // already leans ≈ 30° → the tuft continues the head outline (v1 cat-ear) instead of overhanging it (an overhang drew
  // a mauve line on the skull at E/NE/W); inner edge from the crown; tip out + back
  const J = TUFT.at, tp = (x, y, z) => [x - J[0], y - J[1], z - J[2]];
  add('earL0', K.hull([tp(0.215, 0.42, 0.01), tp(0.215, 0.42, -0.05), tp(0.06, 0.50, 0.02), tp(0.06, 0.50, -0.08), tp(0.15, 0.38, -0.03),
    tp(0.24, 0.56, -0.01), tp(0.17, 0.58, -0.11), tp(0.34, 0.68, -0.11)]), [0, 0, 0], 'feather', { name: 'tuft', mirror: true });

  // ── robe: bell lathe on hips (skirt) + chest (top), gold hem band and gold front edges cut from the surface
  const RP = [[0.27, 0.05], [0.285, 0.14], [0.268, 0.24], [0.25, 0.31], [0.222, 0.42], [0.18, 0.56]];
  const RSZ = 0.86;
  const front = (c) => c[2] > 0.05 && Math.abs(Math.abs(c[0]) - 0.065) < 0.03;
  const robeBand = (y0, y1, bone, name, hem = false, edges = true) => {
    const by = m.restY?.[bone] ?? (bone === 'hips' ? m.hipsY : m.chestY);
    const g = lathe0(slice(RP, y0, y1), 10, { sz: RSZ }).translate(0, -by, 0);
    const [edgeG, robeG] = splitTris(subdivide(g, 0.035), (c) => edges && front(c));
    add(bone, robeG, [0, 0, 0], 'robe', { name });
    if (hem) add(bone, lathe0(slice(RP, HEM[0], HEM[1]), 10, { sz: RSZ }).translate(0, -by, 0), [0, 0, 0], 'amber', { name: name + 'Hem' });
    if (edges) add(bone, edgeG, [0, 0, 0], 'amber', { name: name + 'Edge' });
  };
  const HEM = [0.05, 0.1];
  robeBand(0.1, 0.31, 'hips', 'skirt', true);
  robeBand(0.31, 0.56, 'chest', 'robeTop', false, false);
  // closed hem: a disc in robe colour (a fallen robe shows cloth, not a dark hole — critic-mushroom)
  add('hips', K.frustum(10, 0.268, 0.268, 0.012, { sz: RSZ }), [0, 0.056 - m.hipsY, 0], 'robe', { name: 'hemSole' });
  // burgundy mantle over the shoulders, OPEN at the front (v2), gold lower edge
  const MP = slice(RP, 0.43, 0.56).map(([r, y]) => [r + 0.024, y]);
  MP.push([0.17, 0.585]);
  const mg = lathe0(MP, 10, { sz: RSZ }).translate(0, -m.chestY, 0);
  const openFront = (c) => c[2] > 0 && Math.abs(Math.atan2(c[0], c[2] / RSZ) * D) < 30;
  const [, mGold, mRed] = splitTris(subdivide(mg, 0.035), openFront, (c) => c[1] + m.chestY < 0.475);
  add('chest', mRed, [0, 0, 0], 'mantle', { name: 'mantle' });
  add('chest', mGold, [0, 0, 0], 'amber', { name: 'mantleTrim' });

  // ── wings: navy sleeves along the authored rest directions, gold cuffs, feather wing-tip paddles
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, mx = (v) => [sx * v[0], v[1], v[2]];
    add('upperArm' + sd, segAlong(mx(ARM.up), m.upperArm + 0.03, 0.068, 0.072), mx(ARM.up).map((v) => -v * 0.03), 'robe', { name: 'sleeve' + sd });
    add('forearm' + sd, segAlong(mx(ARM.fore), m.forearm - 0.05, 0.074, 0.085), [0, 0, 0], 'robe', { name: 'cuffSleeve' + sd });
    add('forearm' + sd, segAlong(mx(ARM.fore), 0.055, 0.088, 0.088), mx(ARM.fore).map((v) => v * (m.forearm - 0.055)), 'amber', { name: 'cuff' + sd });
    add('hand' + sd, paddle(mx(ARM.hand), 0.13, 0.055, 0.03, 0.05, [sx, 0, 0]), [0, 0, 0], 'feather', { name: 'wingTip' + sd });
  }

  // ── ledger (chest front): cream page block, burgundy back + spine, burgundy front cover on the hinge bone with a gold band
  const { w, h, d } = BOOK;
  add('book', K.box(w - 0.03, h - 0.025, d - 0.035), [0.012, 0, 0], 'disc', { name: 'pages' });
  add('book', K.box(w, h, 0.024), [0, 0, -d / 2 + 0.012], 'dark', { name: 'coverBack' });
  add('book', K.box(0.034, h, d), [-w / 2 + 0.017, 0, 0], 'dark', { name: 'spine' });
  add('bookLid', K.box(w, h, 0.024), [w / 2, 0, 0], 'dark', { name: 'cover' });
  add('bookLid', K.box(0.09, 0.075, 0.012), [w / 2 + 0.01, 0.02, 0.016], 'amber', { name: 'coverEmblem' });

  // ── feet (r2): long tan talons whose toes peek 2 texels out of the hem at rest (v1) and stick ≥ 3 texels out on
  // every touchdown drawing (the plant sits C/2n ahead of the hip) — contact is drawn
  add('footL', K.chamferBox(0.11, m.ankleY, 0.27, 0.35), [0, -m.ankleY / 2, 0.135], 'feather', { name: 'talon', mirror: true });

  // ── r3 GHOST SHELLS (see SHELLS): copies of the region parts in the ghost palettes on the shell bones
  const W = worldOf(S), body = P.slice();
  // wisp tail (world bind coords): the robe bell, a pale-gold hem band, then a cone that trails back to a point
  const TP = [[0, -0.22], [0.05, -0.19], [0.11, -0.13], [0.18, -0.06], [0.25, 0.0], [0.292, 0.06], [0.305, 0.14], [0.298, 0.24], [0.28, 0.315]];
  const tailArr = subdivide(lathe0(TP, 10, { sz: RSZ * 1.02 }), 0.04);
  for (let i = 0; i < tailArr.length; i += 3) { const y = tailArr[i + 1]; if (y < 0.05) tailArr[i + 2] -= 0.9 * Math.pow(0.05 - y, 1.5); }
  const [tailHem, tailG] = splitTris(tailArr, (c) => c[1] > 0.045 && c[1] < 0.105);
  // HALO (ghost vote unspent, v2 ghost row): a flat pale-gold ring over the crown between the tufts, 'gh' set only
  const HALO_Y = W.head[1] + 0.62;
  const halo = K.xf(lathe0([[0.12, 0], [0.17, 0], [0.17, 0.035], [0.12, 0.035], [0.12, 0]], 10, {}), { rot: [-12, 0, 0], at: [0, HALO_Y, -0.04] });
  for (const [set, slots] of Object.entries(GHOST_SETS)) {
    for (const sh of SHELLS) {
      const bone = set + sh.key, C = W[bone];
      if (sh.tail) {
        for (const [g, slot, nm] of [[tailG, slots.robe, 'Tail'], [tailHem, slots.amber, 'TailHem']])
          P.push({ bone, shape: g, at: C.map((v) => -v * GHOST_K), scale: GHOST_K, color: slot, name: set + nm });
        continue;
      }
      if (sh.key === 'Head' && set === 'gh') P.push({ bone, shape: halo, at: C.map((v) => -v * GHOST_K), scale: GHOST_K, color: slots.amber, name: 'ghHalo' });
      const s = sh.infl * GHOST_K;
      for (const p of body) {
        if (!sh.bones.includes(p.bone) || SHELL_SKIP.test(p.name || '')) continue;
        // surface patches scale about the region centre (they stay coincident); thin parts (tufts, beak) about their own
        // centre so the copy ENCLOSES them (about the head centre a thin tuft only slid outward: brown edges at N)
        const own = sh.own?.test(p.name || ''), f = own ? sh.ownInfl : 1;
        let cg = [0, 0, 0];
        if (own) { p.shape.computeBoundingBox(); const bb = p.shape.boundingBox; cg = [0, 1, 2].map((i) => (bb.min.getComponent(i) + bb.max.getComponent(i)) / 2); }
        const so = own ? GHOST_K * f : s;
        const at = W[p.bone].map((v, i) => own ? (v + (p.at?.[i] ?? 0) + cg[i] * (1 - f) - C[i]) * GHOST_K : (v + (p.at?.[i] ?? 0) - C[i]) * s);
        const color = p.color === 'dark' && GHOST_DARK.test(p.name || '') ? 'robe' : slots[p.color];
        P.push({ bone, shape: p.shape, at, scale: so, color, name: set + '_' + p.name, ...(p.mirror ? { mirror: true } : {}) });
      }
    }
  }
  return P;
}

// ── clips (pose triples [fwd, twist, out] deg; deltas from the hugging rest) ──
// eyes close by SCALE of the eye bones (the iris collapses onto its centre, the recessed lash arc shows)
const EYES = (sy, sx = 0, sz = 0) => ({ 'eyeL.s': [sx, sy, sz], 'eyeR.s': [sx, sy, sz] });
const SHUT = EYES(-0.97, -0.97, -0.97), SQUINT = EYES(-0.55);
// brows pop out of the skull ('.p' forward) — out + = outer end UP (stern / judging), up = raised (eager)
const BROWS = (a, up = -0.012) => ({ 'browL.p': [0, up, 0.045], 'browR.p': [0, up, 0.045], browL: [0, 0, a], browR: [0, 0, a] });
const WIDE = BROWS(-10, 0.025);
// beak open: the mandible drops 0.05 m and swings 25° → the burgundy mouth block shows ≥ 2 texels
const OPEN = { jaw: [30, 0, 0], 'jaw.p': [0, -0.06, 0.015] };
const base = (y = -0.012) => ({ pos: [0, y, 0] });
const breathe = (d, extra = {}) => ({ ...base(-0.012 - 0.028 * d), spine: [2 * d, 0, 0], chest: [3 * d, 0, 0], head: [-5 * d, 0, 0], ...extra });

// vote (r2, chibi-vote rule): the LEDGER is hoisted above the tufts on the right wing's fanned primaries (the chibi
// wing alone tops out at head height), body tilted left so the right shoulder rises, brows up (eager)
const VOTE_UP = { ...base(0.03), hips: [0, 0, 8], spine: [-4, 0, 8], chest: [-4, 0, 10], head: [-8, -10, -12], ...WIDE,
  upperArmR: [15, 0, 160], forearmR: [-90, 0, 0], handR: [30, 0, 0], 'handR.s': [1, 1, 1],
  'book.p': [-0.6, 0.8, -0.15], book: [0, -15, -15] };
// point (r3): right wing straight along [-0.9, 0.4, 0.25] (out to his right and up: a horizontal line at dir 1) with the chest yawed −20 (solver: wing segments ≤ 1° off)
const POINT = (extra) => ({ chest: [0, -20, 0], ...extra, upperArmR: [-32, 47, 105], forearmR: [-60, 30, 178], handR: [22, -11, 7] });
// ghost keys (r3): show one shell set (× 1/GHOST_K), feet scaled away, hover. A hovering LOOP clip keeps IK legs:
// character.js _solveLegs dips the hips by its 0.1 m cap when the planted feet are out of reach, so pos carries +0.1.
const SHOW = (set) => Object.fromEntries(SHELLS.map((s) => [`${set}${s.key}.s`, [1 / GHOST_K - 1, 1 / GHOST_K - 1, 1 / GHOST_K - 1]]));
const NOFEET = { 'footL.s': [-0.95, -0.95, -0.95], 'footR.s': [-0.95, -0.95, -0.95] };
const GHOSTK = (set, up, extra, dy = 0) => ({ pos: [0, 0.1 + 0.28 + dy + 0.06 * up, 0], ...SHOW(set), ...NOFEET, ...extra });
export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0) },
    { f: 20, pose: breathe(1) },
    { f: 38, pose: breathe(0, { neck: [0, -30, 0], head: [0, -45, 0] }) },
    { f: 54, pose: breathe(0) },
    { f: 62, pose: breathe(0, SHUT) },
    { f: 66, pose: breathe(0) },
  ] },
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { ...base(), chest: [-4, -8, 0], head: [-10, -12, -8], ...OPEN, upperArmR: [40, 0, 85], forearmR: [-20, 0, 0], earL0: [-15, 0, 0], earR0: [-15, 0, 0] } },
    { f: 6, pose: { ...base(-0.03), chest: [2, -2, 0], head: [0, -6, 8], jaw: [0, 0, 0], upperArmR: [10, 0, 20] } },
    { f: 12, pose: { ...base(), chest: [-4, -10, 0], head: [-8, -16, 6], ...OPEN, upperArmR: [55, 0, 105], forearmR: [-25, 0, 0], earL0: [-15, 0, 0], earR0: [-15, 0, 0] } },
    { f: 18, pose: { ...base(-0.03), chest: [2, -4, 0], head: [0, -8, -6], jaw: [0, 0, 0], upperArmR: [10, 0, 20] } },
  ] },
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@bookTop' }, keys: [
    { f: 0, pose: { ...base(-0.04), spine: [6, 0, 0], chest: [6, 0, 0], head: [-8, 0, 0], upperArmR: [-15, 0, 15] } },
    { f: 3, pose: VOTE_UP },
  ] },
  // r3 (Clocktower-only rule): no hit/flinch — f0 is a gentle SWAY: lids heavy, head drooping to his left, tufts sag,
  // wings slacken (no hurt flash; one feather drifts down), then the same buckle → topple → held collapse
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 0: 'flap@wingTipR', 18: ['die', 'land'] }, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], spine: [4, 0, 6], chest: [6, 4, 6], head: [14, -10, 12], ...SQUINT, earL0: [-25, 0, 0], earR0: [-25, 0, 0],
      upperArmR: [-6, 0, 22], upperArmL: [-6, 0, 22] } },
    { f: 6, pose: { pos: [0, -0.08, 0], spine: [6, 0, 0], chest: [4, 0, 0], head: [8, 0, 0], jaw: [10, 0, 0], ...SHUT, earL0: [-40, 0, 0], earR0: [-40, 0, 0],
      thighL: [60, 0, 10], shinL: [-110, 0, 0], thighR: [60, 0, 10], shinR: [-110, 0, 0] } },
    { f: 12, pose: { pos: [0, -0.14, -0.1], hips: [-45, 0, 0], chest: [-6, 0, 0], head: [10, 0, 0], jaw: [20, 0, 0], ...SHUT, earL0: [-40, 0, 0], earR0: [-40, 0, 0],
      thighL: [70, 0, 12], shinL: [-60, 0, 0], thighR: [70, 0, 12], shinR: [-60, 0, 0], upperArmR: [0, 0, 50], upperArmL: [0, 0, 50] } },
    { f: 18, pose: { pos: [0, -0.24, -0.2], hips: [-86, 0, 0], head: [20, 30, 0], jaw: [24, 0, 0], ...SHUT, earL0: [-45, 0, 0], earR0: [-45, 0, 0],
      thighL: [95, 0, 20], shinL: [-30, 0, 0], thighR: [95, 0, 20], shinR: [-30, 0, 0], upperArmR: [-10, 0, 70], upperArmL: [-10, 0, 70] } },
    { f: 20, pose: { pos: [0, -0.21, -0.2], hips: [-86, 0, 0], head: [20, 30, 0], jaw: [18, 0, 0], ...SHUT, earL0: [-45, 0, 0], earR0: [-45, 0, 0],
      thighL: [70, 0, 22], shinL: [-60, 0, 0], thighR: [70, 0, 22], shinR: [-60, 0, 0], upperArmR: [-10, 0, 60], upperArmL: [-10, 0, 60] } },
    { f: 24, pose: { pos: [0, -0.24, -0.2], hips: [-86, 0, 0], head: [20, 30, 0], jaw: [24, 0, 0], ...SHUT, earL0: [-45, 0, 0], earR0: [-45, 0, 0],
      thighL: [80, 0, 24], shinL: [-75, 0, 0], thighR: [80, 0, 24], shinR: [-75, 0, 0], upperArmR: [-10, 0, 70], upperArmL: [-10, 0, 70] } },
  ] },
  // r3: the snap puffs ledger DUST (was 'hit@book' = the weapon slash spark)
  remember: { fps: 30, loop: false, interp: 'step', events: { 42: 'puff@book' }, keys: [
    { f: 0, pose: { ...base(-0.02), chest: [6, 0, 0], head: [12, 0, 0] } },
    { f: 6, pose: { ...base(-0.02), chest: [4, 0, 0], head: [16, 0, 0], 'book.p': [0, -0.05, 0.08], book: [-45, -60, 0], bookLid: [150, 0, 0],
      upperArmL: [30, 0, 0], upperArmR: [30, 0, 0] } },
    { f: 18, pose: { ...base(0.0), chest: [0, -8, 0], neck: [0, -25, 0], head: [-6, -35, 0], ...WIDE, earL0: [10, 0, 0], earR0: [10, 0, 0],
      'book.p': [0, -0.05, 0.08], book: [-45, -60, 0], bookLid: [150, 0, 0], upperArmL: [30, 0, 0], upperArmR: [30, 0, 0] } },
    { f: 28, pose: { ...base(0.0), chest: [0, -8, 0], neck: [0, -25, 0], head: [-6, -35, 0], ...SHUT, earL0: [10, 0, 0], earR0: [10, 0, 0],
      'book.p': [0, -0.05, 0.08], book: [-45, -60, 0], bookLid: [150, 0, 0], upperArmL: [30, 0, 0], upperArmR: [30, 0, 0] } },
    { f: 34, pose: { ...base(0.0), chest: [0, -8, 0], neck: [0, -25, 0], head: [-4, -35, 6], ...SQUINT, ...BROWS(25),
      'book.p': [0, -0.05, 0.08], book: [-45, -60, 0], bookLid: [150, 0, 0], upperArmL: [30, 0, 0], upperArmR: [30, 0, 0] } },
    { f: 42, pose: { ...base(0.02), chest: [-4, 0, 0], head: [-8, 0, 0], ...WIDE, earL0: [-10, 0, 0], earR0: [-10, 0, 0] } },
    { f: 50, pose: breathe(0) },
  ] },
  // r3 POINT (the game's shared emote) — "remembers who lied": cock the right wing back (4) → the whole wing shoots
  // out STRAIGHT, forward-right and up (at someone across the square); solved: shots/char-owl/owl_point_solve.js),
  // chest turned into it, head along the wing, stern brows, beak open ("YOU.") (4) → beak shut, squint, held → idle
  point: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { ...base(-0.04), chest: [4, 4, 0], head: [-2, -4, 0], ...SQUINT, ...BROWS(25), upperArmR: [-25, 0, 45], forearmR: [-30, 0, 0] } },
    { f: 4, pose: POINT({ ...base(0.01), spine: [-2, -6, 0], head: [-8, -32, 4], ...OPEN, ...BROWS(25), earL0: [-12, 0, 0], earR0: [-12, 0, 0] }) },
    { f: 8, pose: POINT({ ...base(), head: [-4, -30, 2], ...SQUINT, ...BROWS(25), earL0: [-12, 0, 0], earR0: [-12, 0, 0] }) },
    { f: 32, pose: breathe(0) },
  ] },
  // r3 GHOST idle (dead player): the pale shell set 'gh' (+ halo = ghost vote unspent) hovers 0.28–0.34 m up on a
  // wisp tail, bobbing 2 texels on 20-frame holds; the tail swings (hips roll, chest counter-rolls); the owl swivels
  // his head 60° to stare (the living idle's tell). Legs: feet scaled away; the tail hides the hips.
  ghost: { fps: 30, loop: true, interp: 'step', length: 80, dynamics: 'hold', keys: [
    { f: 0, pose: GHOSTK('gh', 0, { hips: [0, 0, 6], spine: [0, 0, -6], head: [4, 0, 0] }) },
    { f: 20, pose: GHOSTK('gh', 1, { chest: [-2, 0, 0], head: [-2, 0, 8] }) },
    { f: 40, pose: GHOSTK('gh', 0, { hips: [0, 0, -6], spine: [0, 0, 6], neck: [0, -25, 0], head: [2, -35, 0] }) },
    { f: 60, pose: GHOSTK('gh', 1, { neck: [0, -25, 0], head: [-4, -35, -6] }) },
  ] },
  // r3 GHOST-SPENT (ghost vote used): the dimmer 'gs' set, no halo, hovering lower (0.22–0.28 m), head hung, slower
  'ghost-spent': { fps: 30, loop: true, interp: 'step', length: 96, dynamics: 'hold', keys: [
  { f: 0, pose: GHOSTK('gs', 0, { hips: [0, 0, 5], spine: [0, 0, -5], chest: [4, 0, 0], head: [14, 0, 0] }, -0.06) },
  { f: 24, pose: GHOSTK('gs', 1, { chest: [4, 0, 0], head: [12, 0, 8] }, -0.06) },
  { f: 48, pose: GHOSTK('gs', 0, { hips: [0, 0, -5], spine: [0, 0, 5], chest: [4, 0, 0], neck: [0, -20, 0], head: [14, -25, 0] }, -0.06) },
  { f: 72, pose: GHOSTK('gs', 1, { chest: [4, 0, 0], neck: [0, -20, 0], head: [12, -25, -6] }, -0.06) },
  ] },
};
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

export function make() {
  const S = skeleton();
  return {
    name: 'owl',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['disc', 'feather'],
    faceSlot: 'disc',
    bodyPlan: 'uprightAnimal',
    heightPx: [40, 50],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'waddle' },
    emote: 'remember',
    skeleton: S,
    parts: parts(S),
    sockets: { book: { bone: 'book', at: [0, 0, 0.08] }, bookTop: { bone: 'book', at: [0, 0.2, 0.02] }, wingTipR: { bone: 'handR', at: ARM.hand.map((v, i) => (i ? v : -v) * 0.12) },
      wingTipL: { bone: 'handL', at: ARM.hand.map((v) => v * 0.12) }, crown: { bone: 'head', at: [0, 0.62, 0] } },
    // ear tufts are KEYED bones, not springs: as a 1-link chain (f 5, ζ 0.7) they added 21-72 px settle redraws 2 and 4
    // frames after every idle/talk key (loop clips run dynamics 'free'); A/B shots/char-owl/ab-c (chains: [] → 0)
    chains: [],
    personality: { body: { f: 3, zeta: 1, r: 0 }, head: { f: 4, zeta: 1, r: 0 } },
    locomotion: { plan: 'bird', walkSpeed: V_GAME, runSpeed: 2 * V_GAME, cycleTime: [0.3, 0.267], poses: [4, 4],
      lift: [0.02 * HEIGHT, 0.04 * HEIGHT], bob: [0.03, 0.035], roll: [12, 4], headBob: [10, 6], lean: [6, 14], hop: [0.12 * HEIGHT, 0.2 * HEIGHT],
      wings: [], surge: false, bones: { neck: 'tuftRoot' } },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { feather: ['#C69568', '#8E6E74'], spark: ['#FFF8DC', '#FFD77A'], sockets: { book: { length: 0, tip: 0 } },
      vote: { node: 'bookTop' }, speech: { node: 'crown' }, stepClips: [] },
    material: { sides: { eyeL: 'mid', eyeR: 'mid', browL: 'mid', browR: 'mid', earL0: 'mid', earR0: 'mid' } },
  };
}

export default make();
