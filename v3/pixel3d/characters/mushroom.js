// Brother Morel (char-mushroom) — cast member "mushroom", villager: "Blesses the square, sheds spores when nervous."
// Design sheet (incl. ## Unique to me, ## Self-critique): characters/mushroom.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/mushroom.ts + refs/cast/mushroom.png.
// Structure: palette → skeleton (chibi + cap chain + outboard staff arm) → parts → clips → spec.
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

// [hi, mid, sh] sRGB. 5 slots + 1 accent (gold).
export const PALETTE = {
  // (r2, critic) deep amanita red: the old hi #EE8A70 dominated the lit dome (hi/mid 0.94) and read salmon/coral
  // (r3, critic) sh #7A2638 → #741C2E: a saturated wine red instead of a purple maroon (the cap in shade / at night reads
  // red, not black) and a clear −30 % vs grass shadow (#8A2232 sat at −18 %, ab-sh741C2E)
  cap: ['#D85A4E', '#B8383E', '#741C2E'],    // signature: the big red cap (most saturated mass)
  robe: ['#F6EEDC', '#E2D6BC', '#A8949C'],   // ivory robe, sleeves, cuffs, cap spots (lightest mass)
  skin: ['#F8E2BE', '#E6BE96', '#BC8E80'],   // the shy face under the brim, hands (sh lighter: the staff fist read maroon)
  trim: ['#D8505A', '#A8303C', '#6A2440'],   // red stole + hem band
  dark: ['#7A5444', '#523628', '#3E2A30'],   // boots, eyes, mouth
  gold: ['#FCE29A', '#E0B04C', '#9C7240'],   // accent: the star staff
};

export const H = 1.36;                         // ground → star tip (castHeight(34))
const BODY = { height: 1.26, heads: 2.0, legs: 0.7, arms: 0.85, snout: 0, ears: false, tail: false, jaw: false };

export function skeleton(opts = {}) {
  const S0 = chibi({ ...BODY, ...opts, face: { eye: [0.08, 0.17, 0.225], brow: false, mouth: [0, 0.085, 0.235] } });
  const S = S0.map((b) => ({ ...b }));
  // arms are authored BENT at rest (the gait swings them about this rest; bone axes stay 'down'): the left (staff)
  // arm reaches out and forward so the leaning staff passes outside the 0.8 m cap brim at every facing
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM[s].up], [`hand${s}`, ARM[s].fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a);
      const len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  // (r3) LONG BENT legs hidden in the robe: LegGait lowers the body until the planted foot stays reachable through a
  // whole held drawing (half-span ≈ 0.36 m at 4 H/s); the chibi legs (0.32 m, straight) made it drop the body 0.32 m
  // → the robe hem walked UNDER the ground (r3 dev render, dir 2 bg=plain: head 0.37 m below idle on the landing drawing,
  // hem band hidden by the ground in every walk drawing). Thigh = shin = LEG, knee bent FORWARD
  // at rest (inside the robe; forward so FK folds stay inside the shin limits), hip and ankle unchanged → drop 0 at walk speed.
  for (const s of ['L', 'R']) {
    const th = S.find((b) => b.name === `thigh${s}`), sh = S.find((b) => b.name === `shin${s}`), ft = S.find((b) => b.name === `foot${s}`);
    const d = -(sh.pos[1] + ft.pos[1]), c = d / (2 * LEG), kz = LEG * Math.sqrt(1 - c * c);
    sh.pos = [0, -LEG * c, kz]; ft.pos = [0, -LEG * c, -kz];
    void th;
  }
  // cap: a 1-link chain on the head (joint = the stem top under the cap), so the cap can jiggle / lag on its spring
  S.push({ name: 'cap0', parent: 'head', pos: [0, CAP_Y, 0], axis: 'up' });
  // (r3) part-less bone that receives the hop style's HIP pitch (locomotion.bones.hips): the real hips stay upright, so
  // the touchdown drawing does not tip the cap over the face (spine +0.3p, head −0.5p → head world pitch −0.2p)
  S.push({ name: 'hopPitch', parent: 'hips', pos: [0, 0, 0], axis: 'up' });
  // (touch-up, ghost) part-less-looking HALO bone inside the cap dome. Its ring is authored at HALO_K scale around the
  // joint (a speck buried inside the cap: never seen while alive); the ghost clip keys 'halo.s' = 1/HALO_K − 1 to
  // grow it back to full size above the cap. Its world scale is also the GHOST SIGNAL the shader reads (see GHOST_GLSL):
  // ≈ 1 alive, 2 = ghost-spent (no halo, dimmer), 1/HALO_K = ghost with its vote unspent (halo shown).
  S.push({ name: 'halo', parent: 'cap0', pos: [0, 0.16, 0], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}
const CAP_Y = 0.30;
const HALO_K = 0.001;                          // halo authored scale (see skeleton())
const CAP_TILT = 8;
const LEG = 0.27;                              // thigh = shin length (m), see skeleton()
// arm segment directions at rest: [out°, fwd°] (L side; R mirrored)
// (r3, critic) the staff fist sits FORWARD-out and low (upper out 38 fwd 10, fore out 66 fwd 40): at SE it is right of and
// below the face (r2 [50,−24]/[40,−4] put the lavender sleeve + fist on the face's right half); at SW the staff clears the
// face's right edge. Larger 'fore fwd' tilts the plumb staff (hand frame), keep fore fwd ≤ 40.
const ARM = { L: { up: [38, 10], fore: [66, 40] }, R: { up: [14, 0], fore: [14, 25] } };
const armDir = ([o, f]) => { const O = o * Math.PI / 180, F = f * Math.PI / 180; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };        // head-local height of the cap underside (head joint = chin)

// ── geometry helpers ──
// in-plane subdivision of a flat-shaded triangle soup (coplanar pieces → the toon shading is unchanged) and a split
// of the pieces into two geometries by a predicate on the piece centroid: the cap spots are cut OUT of the dome
// surface itself (coincident, no depth step → no inner line ring around each spot, CHARACTER_LEARNINGS §Silhouette).
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

// cap profile (cap-local: y 0 = underside plane at the stem): flat gills underside, a rounded lip, a dome
export const CAP_PROFILE = [[0.13, 0], [0.38, 0.035], [0.405, 0.09], [0.385, 0.16], [0.32, 0.25], [0.19, 0.32], [0, 0.35]];
// spots from the v2 draw code (mushroom.ts SPOTS): [turntable deg, elevation (−1 top … 0 rim), cos radius]
const SPOTS = [[0, -0.45, 0.955], [62, -0.25, 0.965], [-62, -0.25, 0.965], [125, -0.4, 0.96], [-125, -0.4, 0.96],
  [180, -0.2, 0.965], [30, -0.9, 0.965], [-150, -0.85, 0.97], [95, -0.75, 0.975]];
function capGeos() {
  // uncentred lathe: K.lathe centres on the bbox, so shift back to the underside plane
  const lat = K.lathe(CAP_PROFILE, 12);
  lat.computeBoundingBox();
  const g = lat.clone().translate(0, -lat.boundingBox.min.y, 0);
  const tris = subdivide(g, 0.05);             // (r3) 0.04 → 0.05: coarser spot cut edges (cap isolated px 5)
  const ctr = [0, 0.04, 0];                    // sphere centre the spot directions are measured from
  const dirs = SPOTS.map(([th, el, c]) => {
    const k = Math.sqrt(1 - el * el), r = th * Math.PI / 180;
    return { v: [k * Math.sin(r), -el, k * Math.cos(r)], c: 1 - (1 - c) * 0.75 };
  });
  return splitTris(tris, (p) => {
    if (p[1] < 0.06) return false;             // underside / lip stays red
    const d = [p[0] - ctr[0], p[1] - ctr[1], p[2] - ctr[2]], L = Math.hypot(...d);
    return dirs.some((s) => (d[0] * s.v[0] + d[1] * s.v[1] + d[2] * s.v[2]) / L > s.c);
  });
}

// (r2, critic) ONE thick 5-point star with fat arms (inner radius 0.55 r), turned to face the game facing (SE): the
// old two crossed thin stars read as an 'F'/key at SE/E because both planes were oblique there
function star(r = 0.1, r2 = 0.055, depth = 0.075) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r2 : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return K.xf(K.extrude(pts, depth), { rot: [0, STAR_YAW, 0] });
}
const STAR_YAW = -45;

export function parts(S) {
  const m = S.meta, k = m.k;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint = chin): a round face, the cap on cap0
  add('head', K.lathe([[0.15, 0], [0.215, 0.08], [0.225, 0.2], [0.18, 0.32]], 8, { sz: 0.92 }), [0, 0.16, 0.03], 'skin', { name: 'face' });
  add('eyeL', K.box(0.06, 0.062, 0.03), [0, 0, 0], 'dark', { name: 'eye', mirror: true });
  add('mouth', K.box(0.06, 0.032, 0.03), [0, 0, 0], 'dark', { name: 'mouth' });
  const [spotG, capG] = capGeos();
  // (r3) the cap sits tipped BACK 8° on the stem (12° showed the lip as a dotted line at N: cap isolated px 9): the front brim lifts off the eyes at S/SE/SW (30° camera pitch)
  add('cap0', K.xf(capG, { rot: [-CAP_TILT, 0, 0] }), [0, 0, 0], 'cap', { name: 'cap' });
  add('cap0', K.xf(spotG, { rot: [-CAP_TILT, 0, 0] }), [0, 0, 0], 'robe', { name: 'spots' });

  // ── body: ivory robe (bell skirt on hips, upper robe on chest), red hem band of the same profile, stole
  const hemY = 0.10, waistY = m.spineY + 0.02, shY = m.shoulderY + 0.03;
  // (r2, critic) the v1 stole runs from the shoulders to the hem: two red stripes cut OUT of the robe surfaces
  // themselves (coincident, like the cap spots → no inner-line ring), instead of two short boxes on the chest
  const STOLE = (p) => p[2] > 0.04 && Math.abs(Math.abs(p[0]) - 0.075) < 0.03;
  const striped = (geo, at, bone, name) => {
    const [s, r] = splitTris(subdivide(geo, 0.03), STOLE);
    add(bone, r, at, 'robe', { name });
    add(bone, s, at, 'trim', { name: name + 'Stole' });
  };
  const skirt = (y0, y1, color, name) => {
    const r = (y) => 0.27 + (0.19 - 0.27) * (y - hemY) / (waistY - hemY);
    const g = K.frustum(8, r(y0), r(y1), y1 - y0, { sz: 0.92 }), at = [0, (y0 + y1) / 2 - m.hipsY, 0];
    if (color === 'robe') striped(g, at, 'hips', name); else add('hips', g, at, color, { name });
  };
  skirt(hemY, hemY + 0.06, 'trim', 'hem');
  skirt(hemY + 0.06, waistY, 'robe', 'skirt');
  // closed hem: a thin ivory disc under the red band, so a fallen robe shows ivory cloth, not a maroon hole (critic die)
  add('hips', K.frustum(8, 0.262, 0.262, 0.014, { sz: 0.92 }), [0, hemY - 0.007 - m.hipsY, 0], 'robe', { name: 'hemSole' });
  striped(K.frustum(8, 0.195, 0.15, shY - waistY + 0.02, { sz: 0.92 }), [0, (shY + waistY) / 2 - 0.01 - m.chestY, 0], 'chest', 'robeTop');

  // ── arms: ivory sleeves, skin hands
  // sleeves follow the authored (bent) rest directions of the arm segments
  const seg = (bone, d, len, r0, r1, name, color = 'robe') => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM[sd].up)), m.upperArm + 0.02, 0.075, 0.07, 'sleeve' + sd);
    // (r2, critic) ivory cuffs: red cuffs made maroon blobs by the staff fist and a red 'flower' on the robe front
    seg('forearm' + sd, m3(armDir(ARM[sd].fore)), m.forearm, 0.075, 0.088, 'cuff' + sd, 'robe');
  }
  for (const sd of ['L', 'R']) {
    const d = armDir(ARM[sd].fore), sx = sd === 'L' ? 1 : -1;
    add('hand' + sd, K.chamferBox(0.08, 0.08, 0.085, 0.4), [sx * d[0] * 0.035, d[1] * 0.035, d[2] * 0.035], 'skin', { name: 'hand' });
  }

  // ── legs: thighs invisible inside the robe; dark shins + boots (r3: hem back at 0.10 m so the landed boots show)
  // (r3, critic) boots CENTRED on the ankle, 0.12 m long (toe 0.09 ahead): on the landing drawing (ankles ±0.19 m of the
  // hips) they peek under the hem
  // (r3, critic) + a dark shin (legging) on the shin bone: in the hop's rise/fall drawings the IK'd ankle sits up to
  // 0.3 m ahead/behind the hips, outside the hem; the shin always connects that boot back under the hem (a little leg
  // kicking out, never a detached square)
  {
    const fp = S.find((b) => b.name === 'footL').pos, L = Math.hypot(...fp), d = fp.map((v) => v / L);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    // lower 60 % of the shin only (the knee end stays inside the robe)
    add('shinL', K.xf(K.frustum(4, 0.05, 0.058, 0.6 * L), { rot: [e.x, e.y, e.z].map((r) => r * 180 / Math.PI) }), d.map((v) => v * 0.7 * L), 'dark', { name: 'shin', mirror: true });
  }
  add('footL', K.chamferBox(0.1, m.ankleY + 0.01, 0.12, 0.4), [0, -m.ankleY / 2 + 0.005, 0.03], 'dark', { name: 'boot', mirror: true });

  // ── staff (LEFT hand, gold), upright in the rest hand frame. (r3) 1.38 m (top 0.82 → 1.14, out 8 → 2): the star clears
  // the cap top at 7/8 facings (W: in front of the cap) — at NW/SW the near-side staff projects LOWER, out lean tips it toward the camera
  // staff: through the grip (0.04 m down the hand), shaft direction u = leaning forward + out (top clear of the brim)
  const g = armDir(ARM.L.fore).map((v) => v * 0.04);
  const u = new THREE.Vector3(Math.sin(STAFF.out * Math.PI / 180), 1, Math.tan(STAFF.fwd * Math.PI / 180)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ'), rot = [e.x, e.y, e.z].map((r) => r * 180 / Math.PI);
  const along = (t) => [g[0] + u.x * t, g[1] + u.y * t, g[2] + u.z * t];
  add('handL', K.xf(K.box(0.06, STAFF.bot + STAFF.top, 0.06), { rot }), along((STAFF.top - STAFF.bot) / 2), 'gold', { name: 'staff' });
  add('handL', K.xf(star(), { rot }), along(STAFF.top + 0.07), 'gold', { name: 'star' });
  STAR_AT.splice(0, 3, ...along(STAFF.top + 0.07));

  // ── ghost halo (touch-up): a flat gold ring ≈ 0.26 m over the dome (0.15 m read as a lid resting on the cap), authored at HALO_K around the halo joint
  const ring = K.lathe([[0.09, 0], [0.18, 0], [0.18, 0.03], [0.09, 0.03], [0.09, 0]], 12);   // (tu) band 0.09 m: a 0.06 band broke into arcs at 1x (clip-ghost f18)
  add('halo', K.xf(ring, { at: [0, 0.45 * HALO_K, 0], rot: [-CAP_TILT, 0, 0], scale: HALO_K }), [0, 0, 0], 'gold', { name: 'halo' });
  return P;
}
const STAFF = { bot: 0.24, top: 1.14, fwd: 0, out: 2 };
const STAR_AT = [0, 0, 0];   // handL-local star centre (filled by parts())

// ── clips (pose triples [fwd, twist, out] deg; deltas from the authored rest: bent carry arms, staff plumb) ──
// Head WORLD pitch (spine + chest + neck + head fwd) stays within −15…+5 in held keys (wide cap: tipped back the gills
// fill the view, tipped forward the cap hides the face). STAFF_HIGH = the left arm swung up about the shoulder, the wrist
// cancelling it so the staff stays plumb and the star stands ≈ 0.3 m over the cap (tuned on 8-facing stills, k-*.png).
const EYES = (sy, sx = 0) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const SHUT = EYES(-0.75), WIDE = EYES(0.35, 0.2);
const MOUTH = (o) => ({ 'mouth.s': [0, o, 0] });
// (one axis only: the wrist cancels the arm exactly about that axis)
// (r3) with the r3 carry arm (fist forward-out, below the chin at SE) the 155° forward raise swung the fist behind the
// face and the staff behind the cap; raised SIDEWAYS (out 85, wrist −95) the staff stays plumb, star ≈ 0.25 m higher, 8/8
const STAFF_HIGH = { upperArmL: [0, 0, 85], handL: [0, 0, -95] };   // wrist −95: plumb at SE (−85 leaned 6° in = a stair-step staff)
// TAP: the staff lifted ≈ 0.1 m and set down again (the speaking beat that reads at dir 1, where the free hand is behind)
const TAP = (d) => ({ upperArmL: [22 * d, 0, 0], handL: [-22 * d, 0, 0] });
const base = (y = -0.012) => ({ pos: [0, y, 0] });
const breath = (d, extra = {}) => ({ ...base(-0.012 - 0.028 * d), chest: [5 * d, 0, 0], head: [-5 * d, 0, 0],
  upperArmR: [4 * d, 0, 0], forearmR: [12 * d, 0, 0], ...extra });

// die is FK (legs: 'fk'): thigh a / shin −2a keeps the ankle under the hip, drop = leg·(1 − cos a) (feet stay put)
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
// (r3) the legs rest as a zig-zag (thigh φ0 forward of plumb, knee forward): a body drop d needs thigh a with
// 2·LEG·cos(φ0 + a) = hip−ankle − d (ankle stays under the hip)
const HIP_ANKLE = 0.3213, PHI0 = Math.acos(HIP_ANKLE / (2 * LEG)) * 180 / Math.PI;
const KNEES_D = (d) => KNEES(Math.acos((HIP_ANKLE - d) / (2 * LEG)) * 180 / Math.PI - PHI0);
const VOTE_UP = { ...base(0.0), spine: [-4, 0, -4], chest: [-6, 0, -4], head: [-4, -10, 4], ...WIDE, ...STAFF_HIGH,
  upperArmR: [40, 0, 30], forearmR: [70, 0, 0] };
const DEAD_Y = -0.12;
// (r2, critic) DEAD = face-down forward topple: the spotted dome lies toward the camera at S/SE/SW (a fallen mushroom
// at 25 %), the legs fold under the robe (no 'panda ear' boots), the closed ivory hem faces away; the staff lies out left
const DEAD = { pos: [0, DEAD_Y, 0.16], hips: [84, 0, 0], spine: [4, 0, 0], chest: [2, 0, 0], head: [-22, 0, 0], cap0: [-6, 0, 0],
  ...SHUT, ...MOUTH(0.5), ...KNEES(30),
  upperArmR: [-30, 0, 55], forearmR: [10, 0, 0], upperArmL: [-20, 0, 40], forearmL: [-10, 0, 0],
  handL: [0, 0, -80] };   // (r3) wrist rolled: the longer staff lies flat out to his left (it pointed at the camera like a stem)

export const CLIPS = {
  // idle: breathe (extremes held 30 / 30), a blink, and a shy sideways glance (nervous double-take)
  // (r3, critic) no idle spore event: the f60 fleck drew a yellow-green scratch across the face at SE
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, SHUT) },
    { f: 38, pose: breath(1) },
    { f: 60, pose: breath(0, { head: [0, 28, 0], neck: [0, 8, 0] }) },
    { f: 66, pose: breath(0) },
  ] },
  // talk: chin-up / nod alternating, mouth open on alternate keys, the free right hand gestures (≥ 30° per key)
  talk: { fps: 30, loop: true, interp: 'step', length: 20, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { ...base(), chest: [-4, -4, 0], head: [-10, -8, 0], ...MOUTH(1.3), upperArmR: [60, 0, 70], forearmR: [40, 0, 0], handR: [0, -30, 0], ...TAP(1) } },
    // (r2) nod keys: world head pitch ≈ 0 (chest 2, head −2) + a body dip: the old +6° nod hid the face under the brim
    { f: 5, pose: { ...base(-0.035), chest: [2, -4, 0], head: [-2, -6, -5], ...MOUTH(0), upperArmR: [15, 0, 10], forearmR: [30, 0, 0], ...TAP(0) } },
    { f: 10, pose: { ...base(), chest: [-4, -10, 0], head: [-12, -12, 0], ...MOUTH(1.3), upperArmR: [85, 0, 25], forearmR: [30, 0, 0], handR: [0, -40, 0], ...TAP(1) } },
    { f: 15, pose: { ...base(-0.035), chest: [2, 4, 0], head: [-4, 4, 0], ...MOUTH(0.3), upperArmR: [25, 0, 15], forearmR: [45, 0, 0], ...TAP(0) } },
  ] },
  // vote: a 3-frame dip (staff gathered), then the staff thrust UP and held (star high over the cap), eyes wide
  vote: { fps: 30, loop: false, interp: 'step', events: { 4: 'vote@star' }, keys: [
    { f: 0, pose: { ...base(-0.06), spine: [8, 0, 0], chest: [6, 0, 0], head: [-16, 0, 0], upperArmL: [-10, 0, -10], forearmL: [20, 0, 0] } },   // head world −2 (r2 −10 → +4 hid the eyes)
    { f: 4, pose: VOTE_UP },
    { f: 24, pose: VOTE_UP },   // = the f4 key: the clip ends on its held pose (the game holds it while the vote lasts)
  ] },
  // die (touch-up: Clocktower-only, no hurt reaction): a sleepy sigh (eyes droop, hand to the heart, spores drift off
  // the rim) → knees buckle, eyes shut → he folds forward onto his face (the spotted dome toward the camera) → a soft
  // dust ring (land) + a last spore puff → held. The r3 'hurt' flash + flung-arm flinch were removed.
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 0: ['poof@sporeL', 'flap@sporeR'], 6: 'flap@sporeL', 14: ['land', 'flap@sporeR'] }, keys: [
    { f: 0, pose: { ...base(-0.035), ...KNEES_D(0.035), spine: [6, 0, 0], chest: [4, 0, 0], head: [-8, 0, 6], ...EYES(-0.5), ...MOUTH(0.3), upperArmR: [50, 0, -10], forearmR: [70, 0, 0] } },
    { f: 6, pose: { pos: [0, -0.161, 0], spine: [22, 0, 6], chest: [12, 0, 0], head: [-14, 0, 0], cap0: [12, 0, -10], ...SHUT,
      ...KNEES_D(0.161), upperArmR: [20, 0, 30], forearmR: [40, 0, 0] } },
    { f: 10, pose: { pos: [0, -0.2, 0.1], hips: [45, 0, 0], spine: [8, 0, 0], head: [-12, 0, 0], ...SHUT,
      ...KNEES(30), upperArmR: [-20, 0, 40], upperArmL: [-10, 0, 35] } },
    { f: 14, pose: DEAD },
    { f: 34, pose: DEAD },      // held (the game shows the last key while dead)
  ] },
  // bless (emote, r2: NOT the vote shape): gather (eyes shut, staff at its carry, hand on heart) → the staff swung WIDE out to
  // his left, star glint → swept forward over the square (staff leaning 40° toward the viewer) → a deep bow over the
  // planted staff, cap tipped toward the camera → he notices he is watched: shudder, ducks, sheds spores (falling
  // pale-green motes below the brim) → shy glance → settle. (r3) the gather and shudder keys keep the staff at its plumb
  // carry (r2 arm deltas tipped it into a stair-step diagonal: bless.key_speckle +10)
  bless: { fps: 30, loop: false, interp: 'step',
    events: { 8: 'hit@star', 32: ['poof@sporeL', 'flap@sporeR'], 34: 'flap@sporeL', 36: ['poof@sporeR', 'flap@sporeR'], 38: 'flap@sporeL' }, keys: [
    { f: 0, pose: { ...base(-0.05), spine: [10, 0, 0], chest: [6, 0, 0], head: [-4, 0, 0], ...SHUT,
      upperArmR: [50, 0, -10], forearmR: [70, 0, 0] } },
    { f: 8, pose: { ...base(0.0), spine: [-2, -6, -4], chest: [-4, -8, -4], head: [-8, 12, 4], upperArmL: [0, 0, 32], handL: [0, 0, -75],
      upperArmR: [40, 0, -10], forearmR: [80, 0, 0] } },
    { f: 17, pose: { ...base(-0.02), spine: [4, 6, 0], chest: [4, 8, 0], head: [-10, -4, 0], upperArmL: [62, 0, 6], handL: [-22, 0, 0],
      upperArmR: [40, 0, -10], forearmR: [80, 0, 0] } },
    { f: 25, pose: { ...base(-0.09), spine: [20, 0, 0], chest: [14, 0, 0], head: [6, 0, 0], cap0: [8, 0, 0], ...SHUT, upperArmL: [40, 0, 0], handL: [-40, 0, 0],
      upperArmR: [45, 0, -12], forearmR: [85, 0, 0] } },
    { f: 32, pose: { ...base(-0.07), spine: [12, 0, -6], chest: [8, 0, -6], head: [-15, 0, 8], cap0: [0, 0, 14], ...EYES(-0.5),
      upperArmR: [30, 0, -10], forearmR: [90, 0, 0] } },
    { f: 36, pose: { ...base(-0.07), spine: [12, 0, 6], chest: [8, 0, 6], head: [-15, 0, -8], cap0: [0, 0, -14], ...EYES(-0.5),
      upperArmR: [30, 0, -10], forearmR: [90, 0, 0] } },
    { f: 40, pose: { ...base(-0.03), spine: [6, 0, 0], chest: [4, 0, 0], head: [-8, 24, 8], upperArmR: [30, 0, -10], forearmR: [90, 0, 0] } },
    { f: 52, pose: breath(0) },
  ] },
};

// ── point (touch-up: the game's shared emote) — point toward someone in front: the free RIGHT hand. A shy point:
// draw back (gather, eyes wide) → the arm shoots out ahead at shoulder height, chin up so the face shows under the
// brim → firmer jabs (arm a touch lower, body dips, mouth open: "him!") → he catches himself: the hand comes back to
// the heart, shy glance aside → idle. Staff stays at its plumb carry (identity).
// (tu) the game turns the avatar to face the target, so the point goes FORWARD. Straight forward was foreshortened
// under the brim at S/SE (tu/g8-point-f5 r1; a 30° twist + arm out 15 still hid the hand behind the staff fist at SE):
// the body twists 40° left (right shoulder forward), so the arm points ≈ 40° left of the facing = screen-right at the
// game facing SE (a clear stroke across the robe, tu/pv-sheet.png pv2) and clear of the body at E/W; head −38 keeps
// the face toward the facing (pv2's head −24 turned it away at SE). The game's dotted trail names the exact target.
const POINT = (d = 0, extra = {}) => ({ ...base(-0.012 - 0.02 * d), spine: [4 + 2 * d, 15, 0], chest: [2 + 2 * d, 25, 0], head: [-10, -38, 0],
  upperArmR: [95 - 10 * d, 0, 0], forearmR: [-25, 0, 0], handR: [0, 0, 0], ...WIDE, ...extra });
// The game shows a point for 3.5 s (pipgws EMOTE_POINT_MS): point at f5, jab f17, a second small jab f50, held to
// f84, retract f96, idle f108 (3.6 s).
CLIPS.point = { fps: 30, loop: false, interp: 'step', keys: [
  { f: 0, pose: { ...base(-0.04), spine: [-4, -6, 0], chest: [-4, -6, 0], head: [-8, 6, 0], ...WIDE, upperArmR: [-25, 0, 20], forearmR: [80, 0, 0] } },
  { f: 5, pose: POINT(0) },
  { f: 17, pose: POINT(1, MOUTH(1.3)) },
  { f: 29, pose: POINT(0) },
  { f: 50, pose: POINT(1, MOUTH(0.5)) },
  { f: 60, pose: POINT(0) },
  { f: 84, pose: { ...base(-0.05), spine: [8, 0, 0], chest: [4, 0, 0], head: [-10, 24, 6], ...EYES(-0.5), upperArmR: [50, 0, -10], forearmR: [70, 0, 0] } },
  { f: 96, pose: breath(0) },
] };

// ── ghost / ghost-spent (touch-up). Dead players hover as a pale blue ghost (v1 ghost row: a monochrome pale-blue
// Morel, lower robe fading out, gold halo over the cap while the ghost vote is unspent). Done in the spec:
//   * hover: root up 4–5 texels with a 1-texel bob (step keys, 0.6 s apart), a slow ±3° sway, eyes calm, hand on
//     the heart, staff at its carry. The legs stay on the gait's ground IK (loop clips can't be legs:'fk'), so the
//     shins+boots are scaled away ('shin*.s' −0.98: the boots shrink into the robe) and the hover stays within leg
//     reach (no reach dip);
//   * pale: material.tones (GHOST_GLSL) remaps every tone by luminance onto a pale-blue ramp when the halo bone's
//     world scale says "ghost" (spent: desaturated and darker); the lower robe dissolves with a 2×2 ordered dither
//     (discard, both passes) from bind height 0.46 m (solid) to 0.14 m (gone) — 0.10–0.40 for the spent ghost;
//   * halo: 'halo.s' grows the buried ring (ghost only, untinted gold).
const GHOST_UP = 1 / HALO_K - 1, GHOST_SPENT = 1;
const SPENT_UNWARM = 0.35;  // ghostUnwarm strength on the spent ghost (1 = full: the dim grey-blue turned vivid blue at golden; 0.5 still too blue, wk/spent-k.png)
const HIDE_LEGS = { 'shinL.s': [-0.98, -0.98, -0.98], 'shinR.s': [-0.98, -0.98, -0.98] };
const GHOST = (y, roll, halo, extra = {}) => ({ pos: [0, y, 0], spine: [0, 0, roll], chest: [2, 0, roll * 0.5], head: [-6, 0, -roll],
  cap0: [0, 0, -roll], ...EYES(-0.2), upperArmR: [50, 0, -10], forearmR: [70, 0, 0], ...HIDE_LEGS,
  'halo.s': [halo, halo, halo], ...extra });
const ghostClip = (hi, lo, roll, halo, extra) => ({ fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
  { f: 0, pose: GHOST(hi, roll, halo, extra) },
  { f: 18, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
  { f: 36, pose: GHOST(lo, -roll, halo, extra) },
  { f: 54, pose: GHOST((hi + lo) / 2, 0, halo, extra) },
] });
CLIPS.ghost = ghostClip(0.15, 0.12, 3, GHOST_UP);
// spent: lower, heavier hover, head bowed a little, no halo, dimmer (shader)
CLIPS['ghost-spent'] = ghostClip(0.10, 0.07, 2, GHOST_SPENT, { head: [-2, 0, 0], ...EYES(-0.5) });

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
    }
    vec3 ghostUnwarm(vec3 t, vec3 ramp) {
      vec3 r = max(rampFor(ramp, t), vec3(0.05));
      return t * (dot(r, vec3(0.2126, 0.7152, 0.0722)) / r);
    }`,
  tones: `
    if (vGhost > 0.5 && vGhostHalo < 0.5) {
      float gSpent = vGhost > 1.5 ? 1.0 : 0.0;
      float gLo = mix(0.14, 0.10, gSpent), gHi = mix(0.46, 0.40, gSpent);
      float gA = clamp((vCharBind.y - gLo) / (gHi - gLo), 0.0, 1.0);
      ivec2 gq = ivec2(gl_FragCoord.xy) & 1;
      float gT = gq.x == 0 ? (gq.y == 0 ? 0.125 : 0.625) : (gq.y == 0 ? 0.875 : 0.375);
      if (gA < gT) discard;
      toonHi = ghostTone(toonHi, gSpent); toonMid = ghostTone(toonMid, gSpent); toonSh = ghostTone(toonSh, gSpent);
      // (close-out) golden: the warm key turned the dim spent ramp khaki-olive. A ghost is not sun-coloured: under a
      // warm grade only (rampHi r-b, the whiteKeep/creamKeep gate; noon / night = 0 px) pre-divide each band tone by
      // the hue of the ramp it is about to be multiplied with (rampFor = what toon.js applies), so it lands on its own
      // blue at the ramp's luma.
      float gW = clamp((uRampHi.r - uRampHi.b - 0.1) * 2.0, 0.0, 1.0) * mix(1.0, ${SPENT_UNWARM.toFixed(2)}, gSpent);
      if (gW > 0.0) {
        toonHi = mix(toonHi, ghostUnwarm(toonHi, uRampHi), gW);
        toonMid = mix(toonMid, ghostUnwarm(toonMid, uRampMid), gW);
        toonSh = mix(toonSh, ghostUnwarm(toonSh, uRampSh), gW);
      }
    }`,
};

export function make(opts = {}) {
  const S = skeleton(opts);
  return {
    name: 'mushroom',
    height: H,
    palette: PALETTE,
    signature: 'cap',
    faceSlot: 'skin',
    bodyPlan: 'uprightAnimal',
    heightPx: [42, 56],
    skeleton: S,
    parts: parts(S),
    // spores: under the brim at the far left / right rim, BEHIND the face (x ±0.3, z −0.22: the head occludes the puff's start; r3,
    // the r2 sockets at x ±0.3, z +0.14 dropped motes across the face at SE)
    sockets: { star: { bone: 'handL', at: STAR_AT }, spores: { bone: 'cap0', at: [0, 0.06, 0] },
      sporeL: { bone: 'cap0', at: [0.3, -0.02, -0.22] }, sporeR: { bone: 'cap0', at: [-0.3, -0.02, -0.22] } },
    chains: [],
    gameSpeed: { v: 4 * H, drawings: 4, gait: 'hop' },
    // (r3, critic: detached floating boots + no contact drawing) a HOP: both boots land together on one drawing per
    // cycle (the contact key: crouch + the cap squashes flat and wide), then rise · apex · fall with the boots dangling
    // straight under the hem (lift 0: the feet ride the hop arc, never swing out of the 0.27 m hem). Legs = the two
    // biped legs only (the hop plan would take the arms as front legs). No arm channels in the hop style: the staff arm
    // keeps its carry, the staff rocks only with the body pitch (+ lands with the squash).
    // height 0.5 scales LegGait's touchdown crouch (0.06·height = 0.03 m: the landed boots stay visible under the hem);
    // every other height-derived default is given explicitly. hips → hopPitch: the hop's hip pitch would tip the cap over
    // the face on the landing drawing. squash on cap0 (8 %): the cap flattens/widens on landing (16 % hid the eyes).
    // runSpeed 5·H, run cycle 0.333 s: at 8·H the reach rule sank the hem into the ground again (see skeleton()).
    locomotion: { plan: 'hop', legs: { HL: ['thighL', 'shinL', 'footL'], HR: ['thighR', 'shinR', 'footR'] },
      walkSpeed: 4 * H, runSpeed: 5 * H, cycleTime: [0.28, 0.333], poses: [4, 4], duty: [0.25, 0.2],
      hop: [0.13 * H, 0.18 * H], lean: [3, 8], lift: [0, 0], height: 0.5,
      squash: { bones: ['cap0'], amount: 0.08 }, bones: { hips: 'hopPitch' },
      stepLift: 0.04, stepTol: 0.08, vStart: 0.13, vStop: 0.07,
      surge: false },   // the stance surge moved the whole figure inside held drawings (upper flicker 6721 px → 0, ab-hop2 vs ab-hop2s)
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    emote: 'bless',
    // FX (r2, critic): spores must NOT be the cap-spot cream. Puff = dust kind in pale spore-green ('poof@sporeL|R' under
    // the rim); falling motes = the feather kind re-skinned as spores ('flap@sporeL|R': pale green-gold fleck with an
    // olive speck, drifting DOWN past the robe for ~0.8 s); star glint = a spark at the star socket; vote sparkle at the star
    fx: { dust: ['#E4F0A0', '#B4C866', '#7C8C44'], feather: ['#E8F2A0', '#6E7C34'], spark: ['#FFF8DC', '#FCE29A'], sockets: { star: { length: 0, tip: 0 } },
      vote: { node: 'star' }, speech: { node: 'cap0' } },
    // (r2) the staff fist (far side at the game facing SE) was forced to the shadow band = a maroon lump: shaded as midline
    // (r3) + the left sleeve/cuff (upperArmL, forearmL): far side at SE, its lavender robe-shadow read as a squiggle by the face
    material: { sides: { eyeL: 'mid', eyeR: 'mid', handL: 'mid', forearmL: 'mid', upperArmL: 'mid' },
      // (close-out) golden-hour drift: the ivory robe went mauve (#7A657E / #89738E in the sun copy) and the cap spots
      // apricot (#EFBD78). creamKeep [1, 0.85] (the robe slot is the only one its gate takes: skin / gold / reds are too
      // saturated) keeps the robe + spots on their authored hue in every band at ≥ 0.85 × authored luma: spots #E9DFCD,
      // robe mid #D5C9B0, shade band #9E8A91 — three bands kept. whiteKeep 0.8 / hueKeep { robe } on top: 0 px. hueKeep
      // { cap } fixed the spent ghost but dulled the lit living cap to salmon, so the ghost is fixed in GHOST_GLSL
      // instead (ghostUnwarm). Golden only: noon / night 0 px (A/B shots/char-mushroom/wk/).
      creamKeep: [1, 0.85],
      // ghost / ghost-spent look (GHOST_GLSL; bone indices = skeleton order, rig.js keeps it parent-first)
      vertexHead: GHOST_GLSL.vertexHead, fragmentHead: GHOST_GLSL.fragmentHead, tones: GHOST_GLSL.tones,
      vertex: GHOST_GLSL.vertex(S.findIndex((b) => b.name === 'head'), S.findIndex((b) => b.name === 'halo')) },
  };
}

export default make();
