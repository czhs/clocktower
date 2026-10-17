// Tinker Pell (char-snail) — cast member "snail": "Fixes clocks. Slowly. Perfectly."
// Design sheet (Unique to me, timing charts, self-critique): characters/snail.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/snail.ts + refs/cast/snail.png.
// Body plan: LIMBLESS (the only limbless cast member). A custom skeleton modelled on rig.limbless(): `base` root,
// `foot` = the SQUASH bone (joint on the ground at the TAIL end, so the squash/stretch extends the sole FORWARD from the
// tail), `shell` and `neck` = rigid riders on `base` (ride the squash by '.p'), head column, two goggled eye stalks,
// two tiny paws holding the wrench up front.
// r6 (critic-snail 15/24): locomotion = the LEGACY Gait driven by an authored 4-drawing `clips.walk` (LegGait 'glide'
// ignores authored walk poses, backlog M1, and its pulse c = −cos(2π·k/4) makes drawings 1 and 3 identical). The Gait
// needs biped legs, so the skeleton carries a pair of PART-LESS hidden legs (hleg/hknee/hank: no geometry, never seen,
// names chosen so charcheck's foot finder ignores them) and part-less sink bones for the gait's hips/arm channels.
import * as THREE from 'three';
import * as K from '../src/chars/kit.js';

export const HEIGHT = 1.05;                 // v2 26 px → castHeight 1.05 m (top of the goggles)
export const V_GAME = 3.95 * HEIGHT;        // 4.15 m/s: v2 150 px/s on a 38 px sprite, relative to body height

// [hi, mid, sh] sRGB. 5 slots + 1 accent (eye whites). r6: skin lifted to peach/cream (h ≈ 28–32°, the toad's
// "warm tan-brown" band) so the foot + column separate from lit noon/golden grass; shell a touch deeper for value
// separation from the lighter body; shadows warm mauve (night floor #3A3040), never teal.
export const PALETTE = {
  skin: ['#FFDCC4', '#EBA88E', '#A4707E'],    // pink-peach body: foot, column, stalks, paws (v2 #C4B27A / #D0BF8A)
  shell: ['#D6965A', '#A0623A', '#623A48'],   // signature 1: the spiral shell (v2 #B38556 / #A06A38) + cheek blush
  dark: ['#7A5A5E', '#583C46', '#3E2E3E'],    // spiral groove, pupils, mouth
  brass: ['#FFDC7A', '#CC9A34', '#9C7446'],   // signature 2: goggle rims (+ the emote's gear)
  steel: ['#E4ECF6', '#A4AEC6', '#5E6482'],   // the wrench (identity prop)
  eye: ['#F6EEDE', '#E2D8C6', '#A89CA6'],     // accent: eye whites
};

// ── geometry constants (world metres at rest; the character faces +Z) ──
const FOOT_Z0 = -0.42;                      // foot joint = tail tip (squash pivot)
const SHELL_C = [0, 0.385, -0.15];           // shell centre (r6: up + back, frames the column at S)
const SHELL_R = 0.31, SHELL_HW = 0.27;      // radius, half width (x) (r6: 0.29/0.235 → 0.31/0.28: a disc ≈ 2× the column at S)
const RIDE_Y = 0.13;                        // shell / neck joints sit on the foot top (rider height)
const NECK = [0, RIDE_Y, 0.15];
const HEAD_Y = 0.43;                        // head joint (world y)
const STALK = { x: 0.05, y: 0.665, z: 0.13, len: 0.315, dir: [0.6, 1, 0.1] };   // r6 splay 0.3 → 0.6, len 0.30 → 0.315 (goggles clear the shell at S/SW)
const PAW = { x: 0.085, y: 0.30, z: 0.22 };
const GEAR_AT = [-0.085, -0.02, 0.12];      // gear centre in pawL space (front of the chest, below the mouth)
const HALO_K = 0.001;                       // (t1) ghost halo authored scale (see skeleton())
const HALO_UP = 0.74;                       // (t1) ring height above the halo joint (world y ≈ 1.27: clear of the goggle tips at SE/E, s2: 0.62 sat on them)

const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const sub = (a, b) => a.map((x, i) => x - b[i]);
const SD = norm(STALK.dir);

export function skeleton() {
  const S = [
    { name: 'base', pos: [0, 0, 0], axis: 'up' },
    { name: 'foot', parent: 'base', pos: [0, 0, FOOT_Z0], axis: 'fwd' },
    { name: 'shell', parent: 'base', pos: [0, RIDE_Y, SHELL_C[2]], axis: 'up' },
    { name: 'neck', parent: 'base', pos: NECK, axis: 'up' },
    { name: 'head', parent: 'neck', pos: [0, HEAD_Y - NECK[1], 0], axis: 'up' },
    { name: 'mouth', parent: 'head', pos: [0, 0.05, 0.118], axis: 'fwd' },
    { name: 'smile', parent: 'head', pos: [0, 0.05, 0.116], axis: 'fwd' },
    // part-less sinks for the legacy Gait's hips / spine / chest / arm channels
    { name: 'gsink', parent: 'base', pos: [0, 0.25, -0.05], axis: 'up' },
    { name: 'gsink2', parent: 'gsink', pos: [0, 0.05, 0], axis: 'up' },
  ];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    S.push({ name: `stalk${L}`, parent: 'head', pos: [s * STALK.x, STALK.y - HEAD_Y, STALK.z - NECK[2]], axis: [s * SD[0], SD[1], SD[2]] });
    S.push({ name: `eye${L}`, parent: `stalk${L}`, pos: [s * SD[0] * STALK.len, SD[1] * STALK.len, SD[2] * STALK.len], axis: 'fwd' });
    S.push({ name: `paw${L}`, parent: 'neck', pos: [s * PAW.x, PAW.y - NECK[1], PAW.z - NECK[2]], axis: 'down' });
    // hidden legs (no parts): hip 0.31, bent knee, ankle 0.01 → leg 0.41 m > hip height, so the Gait's hip drop is
    // only its constant 0.006 m (walk) / 0.03 m (run), cancelled by the authored clip's pos y
    S.push({ name: `hleg${L}`, parent: 'base', pos: [s * 0.06, 0.31, 0], axis: 'down' });
    S.push({ name: `hknee${L}`, parent: `hleg${L}`, pos: [0, -0.12, 0.155], axis: 'down' });
    S.push({ name: `hank${L}`, parent: `hknee${L}`, pos: [0, -0.18, -0.12], axis: 'fwd' });
  }
  S.push({ name: 'wrench', parent: 'pawR', pos: [-0.075, -0.05, 0.06], axis: 'up' });
  S.push({ name: 'gear', parent: 'pawL', pos: GEAR_AT, axis: 'fwd' });
  S.push({ name: 'wrenchT', parent: 'pawL', pos: [GEAR_AT[0], GEAR_AT[1], GEAR_AT[2] + 0.035], axis: 'up' });
  // (t1 touch-up, ghost) HALO bone, appended LAST (parent earlier → index = array index; every living render unchanged).
  // Its joint is buried inside the head cap and its ring is authored at HALO_K around the joint (an invisible speck);
  // the ghost clip keys 'halo.s' = 1/HALO_K − 1 to show it over the goggles. Its world scale / the base scale is ALSO
  // the shader's ghost signal: ≈ 1 alive, 2 = ghost-spent (ring still a speck), 1/HALO_K = ghost (halo shown).
  S.push({ name: 'halo', parent: 'head', pos: [0, 0.10, 0], axis: 'up' });
  S.meta = { H: HEIGHT, restY: { base: 0, foot: 0, shell: RIDE_Y, neck: RIDE_Y } };
  return S;
}

// ── coplanar cut-outs (mushroom-spot method): in-plane subdivision of a flat-shaded triangle soup, then a split of
// the pieces by a predicate on the piece centroid → two coincident geometries (no depth step → no inner-line ring) ──
function subdivide(geo, maxEdge) {
  const p = geo.attributes.position.array, out = [];
  const rec = (a, b, c, d) => {
    const e = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const lab = e(a, b), lbc = e(b, c), lca = e(c, a), m = Math.max(lab, lbc, lca);
    if (m <= maxEdge || d > 10) { out.push(...a, ...b, ...c); return; }
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
// spiral ribbon on a shell side cap: Archimedean spiral in the (z, y) plane of the cap, as a concave polygon
function spiralPoly(r0, r1, turns, w, a0) {
  const n = Math.round(turns * 24), out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + u * turns * 2 * Math.PI, r = r0 + (r1 - r0) * u;
    out.push([Math.cos(a) * (r + w / 2), Math.sin(a) * (r + w / 2)]);
    inn.push([Math.cos(a) * (r - w / 2), Math.sin(a) * (r - w / 2)]);
  }
  return [...out, ...inn.reverse()];
}
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function parts() {
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── foot: a long slug, round under the column, tapering to the tail (one convex hull of cross-section rings) ──
  const ring = (z, hw, top) => [[hw, 0, z], [-hw, 0, z], [hw, top * 0.55, z], [-hw, top * 0.55, z], [hw * 0.62, top, z], [-hw * 0.62, top, z]];
  const FOOT = [ring(-0.44, 0.035, 0.045), ring(-0.30, 0.10, 0.09), ring(-0.08, 0.165, 0.13), ring(0.16, 0.18, 0.15),
    ring(0.31, 0.165, 0.14), ring(0.40, 0.10, 0.10)].flat().map((p) => [p[0], p[1], p[2] - FOOT_Z0]);
  add('foot', K.hull(FOOT), [0, 0, 0], 'skin', { name: 'sole' });

  // ── shell: a wheel lathe about X (12 sides: flat top facet); the spiral groove is CUT OUT of each flat side cap
  // (coplanar, r6: the proud ribbon cost 5–9 isolated px per facing), ribbon 0.06 m ≈ 2.2 texels ──
  const SC = [0, SHELL_C[1] - RIDE_Y, 0];     // centre in shell-bone space
  // r6: a superellipse "ball" lathe (p 2.3) instead of a flat-capped drum: from S a round disc ≈ 2× the column, from the
  // side a round shell whose almost-flat side domes carry the spiral
  const W2 = 2 * SHELL_HW, PE = 2.3, US = [-1, -0.97, -0.9, -0.78, -0.55, -0.25, 0, 0.25, 0.55, 0.78, 0.9, 0.97, 1];
  const prof = US.map((u) => [SHELL_R * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), PE)), 1 / PE), (u + 1) * SHELL_HW]);
  const shellG = K.xf(K.lathe(prof, 16), { rot: [0, 0, 90] });
  const spiral = spiralPoly(0.17, 0.035, 1.25, 0.062, -0.75);
  const [spG, shG] = splitTris(subdivide(shellG, 0.018), (c) => {
    if (Math.abs(c[0]) < 0.8 * SHELL_HW) return false;               // side domes only
    return inPoly(spiral, c[2], c[1]);
  });
  add('shell', shG, SC, 'shell', { name: 'shellBody' });
  add('shell', spG, SC, 'dark', { name: 'spiral' });

  // ── column: neck (reaches down inside the foot so a raised neck never shows a gap) + rounded head; two blush
  // patches CUT OUT of the head cap's ±45° facets (v2 rosy cheeks; shell slot = the warm blush tone) ──
  add('neck', K.frustum(8, 0.155, 0.135, 0.44, { sz: 0.92 }), [0, 0.22 - NECK[1], 0], 'skin', { name: 'neck' });
  const HP = [[0.135, 0], [0.135, 0.10], [0.118, 0.185], [0.075, 0.245], [0, 0.26]];
  const headG = K.lathe(HP, 8, { sz: 0.92 });      // centred: y −0.13 … +0.13
  const [chG, hdG] = splitTris(subdivide(headG, 0.02), (c) => {
    const az = Math.atan2(c[0], c[2]) * 180 / Math.PI, r = Math.hypot(c[0], c[2]);
    return r > 0.1 && Math.abs(Math.abs(az) - 47) < 13 && c[1] > -0.075 && c[1] < -0.03;
  });
  add('head', hdG, [0, -0.025 + 0.13, 0], 'skin', { name: 'headCap' });
  add('head', chG, [0, -0.025 + 0.13, 0], 'shell', { name: 'cheek' });
  // mouth: a 2-texel dark slot + two 1-texel upturned corners on their own bone (`smile`, hidden when the mouth opens)
  add('mouth', K.box(0.06, 0.03, 0.03), [0, 0, 0], 'dark', { name: 'mouth' });
  for (const s of [1, -1]) add('smile', K.box(0.03, 0.03, 0.03), [s * 0.042, 0.024, -0.004], 'dark', { name: 'smileCorner' });

  // ── eye stalks + goggles (brass rim ring, cream eye, dark 1×2 pupil), eyes face forward, tilted 14° up ──
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const tip = [s * SD[0] * STALK.len, SD[1] * STALK.len, SD[2] * STALK.len];
    const seg = (a, b, w) => {
      const u = norm(sub(b, a)), x = norm([u[1], -u[0], 0]), z = [u[1] * x[2] - u[2] * x[1], u[2] * x[0] - u[0] * x[2], u[0] * x[1] - u[1] * x[0]];
      const pts = [];
      for (const p of [a, b]) for (const sa of [-1, 1]) for (const sb of [-1, 1]) pts.push([0, 1, 2].map((i) => p[i] + x[i] * sa * w / 2 + z[i] * sb * w / 2));
      return K.hull(pts);
    };
    add(`stalk${L}`, seg([0, -0.04, 0], tip, 0.065), [0, 0, 0], 'skin', { name: 'stalk' });
    const TILT = 14;
    const disc = (r, h) => K.xf(K.xf(K.prism(8, r, h), { rot: [90 - TILT, 0, 0] }), { rot: [0, s * 12, 0] });
    add(`eye${L}`, disc(0.08, 0.07), [0, 0.0, -0.005], 'brass', { name: 'goggle' });
    add(`eye${L}`, disc(0.056, 0.07), [0, 0.004, 0.012], 'eye', { name: 'eyeWhite' });
    add(`eye${L}`, K.xf(K.xf(K.box(0.036, 0.062, 0.03), { rot: [-TILT, 0, 0] }), { rot: [0, s * 12, 0] }), [s * 0.006, 0.004, 0.045], 'dark', { name: 'pupil' });
  }

  // ── paws (tiny skin nubs) + the carry wrench (steel, open C head on top) in the RIGHT paw, held up beside the
  // column (r6: it sat in front of the chest centre and read as a grey smudge at S) ──
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    add(`paw${L}`, K.hull([[0, 0.02, -0.03], [s * -0.02, 0.02, -0.03], [0, -0.03, -0.03], [s * -0.04, -0.07, 0.10], [s * -0.04, -0.03, 0.10],
      [s * -0.08, -0.07, 0.10], [s * -0.08, -0.03, 0.10], [s * -0.03, 0.02, 0.02]]), [0, 0, 0], 'skin', { name: 'paw' });
  }
  add('wrench', K.box(0.055, 0.19, 0.04), [0, 0.01, 0], 'steel', { name: 'wrenchHandle' });
  add('wrench', K.box(0.16, 0.05, 0.045), [0, 0.125, 0], 'steel', { name: 'wrenchJaw' });
  add('wrench', K.box(0.05, 0.06, 0.045), [0.055, 0.175, 0], 'steel', { name: 'wrenchProngL' });
  add('wrench', K.box(0.05, 0.06, 0.045), [-0.055, 0.175, 0], 'steel', { name: 'wrenchProngR' });

  // ── emote props, authored at 1/100 size (scale offset +99 in the emote keys shows them):
  //    a brass gear in the left paw, and the WORK wrench whose jaw sits on the gear hub (pivot = hub) and whose
  //    handle sticks out ≈ 7 texels past the gear rim, so a turn swings it visibly in the screen plane ──
  const G = 0.01, teeth = [];
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; teeth.push(K.xf(K.box(0.06 * G, 0.06 * G, 0.04 * G), { at: [Math.cos(a) * 0.115 * G, Math.sin(a) * 0.115 * G, 0], rot: [0, 0, i * 60] })); }
  add('gear', K.merge(K.xf(K.prism(8, 0.105 * G, 0.04 * G), { rot: [90, 0, 0] }), ...teeth), [0, 0, 0], 'brass', { name: 'gear' });
  add('wrenchT', K.merge(
    K.xf(K.box(0.16 * G, 0.06 * G, 0.045 * G), { at: [0, 0, 0] }),                       // jaw bar across the hub
    K.xf(K.box(0.05 * G, 0.06 * G, 0.045 * G), { at: [0.058 * G, -0.055 * G, 0] }),      // C prongs (open downward onto the hub)
    K.xf(K.box(0.05 * G, 0.06 * G, 0.045 * G), { at: [-0.058 * G, -0.055 * G, 0] }),
    K.xf(K.box(0.07 * G, 0.30 * G, 0.045 * G), { at: [0, 0.17 * G, 0] })), [0, 0, 0], 'steel', { name: 'wrenchWork' });
  // ── (t1) ghost halo: a flat gold ring over the goggles, authored at HALO_K around the halo joint (band 0.09 m: a
  // 0.06 m band broke into arcs at 1x on the mushroom) ──
  const hring = K.lathe([[0.11, 0], [0.20, 0], [0.20, 0.03], [0.11, 0.03], [0.11, 0]], 12);
  add('halo', K.xf(hring, { at: [0, HALO_UP * HALO_K, 0], scale: HALO_K }), [0, 0, 0], 'brass', { name: 'halo' });
  return P;
}

// ── clips (pose triples [fwd, twist, out], degrees; 30 Hz grid) ──────────────────────────────────────────────────
const EYES = (sy) => ({ 'eyeL.s': [0, sy, 0], 'eyeR.s': [0, sy, 0] });
const BLINK = EYES(-0.8);
const SHOW_GEAR = { 'gear.s': [99, 99, 99] };
const TOOLS = { ...SHOW_GEAR, 'wrenchT.s': [99, 99, 99], 'wrench.s': [-1, -1, -1] };
const OPEN = (h) => ({ 'mouth.s': [0.45, h, 0], 'smile.s': [-1, -1, -1] });   // h 2.0 → 3 × 3 texels
const breathe = (d, st) => ({ 'foot.s': [0, d / 0.14, 0], 'shell.p': [0, d, 0], 'neck.p': [0, d, 0],
  stalkL: [st, 0, -st * 0.4], stalkR: [-st * 0.6, 0, st * 0.5] });

// WALK (legacy Gait, length 4 = one key per drawing, 2 grid frames each at 3.95 H/s): a 4-drawing glide PULSE.
// 0 REACH: sole long + low, column leans into the reach, stalks trail · 1 PULL: sole mid, stalks swing (L out) ·
// 2 GATHER: sole short + tall, shell + column ride up 3 texels, column rears back 9°, stalks fling forward ·
// 3 RELEASE: sole mid-tall, stalks wobble the other way (R out). pos y = +the Gait's constant hip drop.
const GAIT = (k, dy) => [
  { f: 0, pose: { pos: [0, dy, 0], 'foot.s': [-0.08 * k, -0.2 * k, 0.3 * k], 'shell.p': [0, -0.03 * k, -0.02 * k], shell: [5 * k, 0, 0],
    'neck.p': [0, -0.035 * k, 0.07 * k], neck: [12 * k, 0, 0], head: [-4 * k, 0, 0], stalkL: [-24 * k, 0, -6], stalkR: [-24 * k, 0, -6] } },
  { f: 1, pose: { pos: [0, dy, 0], 'foot.s': [-0.02 * k, -0.04 * k, 0.1 * k], 'shell.p': [0, 0, 0], shell: [0, 0, 0],
    'neck.p': [0, 0, 0.03 * k], neck: [4 * k, 0, 4 * k], head: [0, 0, 0], stalkL: [-4 * k, 0, 18 * k], stalkR: [8 * k, 0, -8 * k] } },
  { f: 2, pose: { pos: [0, dy, 0], 'foot.s': [0.06 * k, 0.3 * k, -0.2 * k], 'shell.p': [0, 0.055 * k, 0.01 * k], shell: [-6 * k, 0, 0],
    'neck.p': [0, 0.06 * k, -0.03 * k], neck: [-9 * k, 0, 0], head: [5 * k, 0, 0], stalkL: [22 * k, 0, -4], stalkR: [22 * k, 0, -4] } },
  { f: 3, pose: { pos: [0, dy, 0], 'foot.s': [0.02 * k, 0.12 * k, -0.06 * k], 'shell.p': [0, 0.025 * k, 0], shell: [-2 * k, 0, 0],
    'neck.p': [0, 0.025 * k, 0], neck: [-2 * k, 0, -4 * k], head: [2 * k, 0, 0], stalkL: [6 * k, 0, -8 * k], stalkR: [-6 * k, 0, 18 * k] } },
];

// tinker work beat: the work wrench swings ±38° about the gear hub (screen plane at S), the gear clicks 30°, the
// column rolls ±8° and the stalks lean with each turn
const TURN = (s) => ({ ...TOOLS, neck: [8, 0, 8 * s], head: [4, 0, 2 * s], wrenchT: [0, 0, 38 * s], gear: [0, s > 0 ? 30 : 0, 0],
  stalkL: [10, 0, 12 + 8 * s], stalkR: [10, 0, 12 - 8 * s], pawR: [55, 0, s > 0 ? -10 : 20] });

export const CLIPS = {
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breathe(0, 0) }, { f: 30, pose: breathe(0.014, 12) }, { f: 36, pose: breathe(0.028, 26) },
    { f: 54, pose: { ...breathe(0.028, 26), ...BLINK } }, { f: 56, pose: breathe(0.028, 26) }, { f: 66, pose: breathe(0.014, 12) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: GAIT(1, 0.006) },
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: GAIT(1.25, 0.03) },
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { neck: [-4, 0, 6], head: [-4, 0, 4], ...OPEN(2.0), stalkL: [-10, 0, 24], stalkR: [-6, 0, 4], pawR: [-30, 0, 10] } },
    { f: 6, pose: { neck: [2, 0, -4], head: [2, 0, -4], stalkL: [14, 0, -8], stalkR: [12, 0, -10], pawR: [0, 0, 0] } },
    { f: 12, pose: { neck: [-4, 0, -6], head: [-4, 0, -4], ...OPEN(1.7), stalkL: [-6, 0, 4], stalkR: [-10, 0, 24], pawR: [-34, 0, 14] } },
    { f: 18, pose: { neck: [2, 0, 4], head: [2, 0, 4], stalkL: [12, 0, -10], stalkR: [14, 0, -8], pawR: [0, 0, 0] } },
  ] },
  vote: { fps: 30, loop: false, interp: 'step', events: { 4: 'vote@eyeR' }, keys: [
    { f: 0, pose: { 'neck.p': [0, -0.04, 0], neck: [8, 0, 0], stalkR: [20, 0, -10], stalkL: [10, 0, 0], 'foot.s': [0.05, -0.12, 0.05] } },
    { f: 4, pose: { 'neck.p': [0, 0.14, 0], neck: [-6, 0, 4], head: [-4, 0, 0], stalkR: [0, 0, -14], 'stalkR.s': [0, 0.75, 0],
      stalkL: [-6, 0, 30], 'eyeL.s': [0, 0.15, 0], 'eyeR.s': [0, -0.343, 0], ...OPEN(2.0), 'foot.s': [-0.05, 0.12, -0.05] } },
  ] },
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 16: ['die', 'land'] }, keys: [
    { f: 0, pose: { neck: [-12, 0, 8], head: [-8, 0, 0], stalkL: [-20, 0, 30], stalkR: [-20, 0, 30], ...EYES(0.2), ...OPEN(1.7) } },
    { f: 8, pose: { 'neck.p': [0, -0.06, -0.04], neck: [20, 0, -6], head: [10, 0, 0], stalkL: [40, 0, -20], stalkR: [40, 0, -20], ...BLINK, pawR: [30, 0, 0] } },
    // r6: the sole pulls IN (shorter, a touch flatter) instead of spreading into a plank; shell roll ≤ 18° so the
    // 12-sided lathe never shows a box at N/NE
    { f: 16, pose: { 'neck.p': [0, -0.17, -0.11], neck: [-10, 0, 0], stalkL: [-95, 0, -10], stalkR: [-95, 0, -10], 'stalkL.s': [0, -0.8, 0], 'stalkR.s': [0, -0.8, 0], 'eyeL.s': [0, -0.6, 0], 'eyeR.s': [0, -0.6, 0],
      shell: [0, 0, 18], 'shell.p': [0, -0.03, -0.03], 'foot.s': [0.04, -0.2, -0.26], pawR: [60, 0, 40], pawL: [40, 0, 20] } },
    { f: 20, pose: { 'neck.p': [0, -0.17, -0.11], neck: [-10, 0, 0], stalkL: [-95, 0, -10], stalkR: [-95, 0, -10], 'stalkL.s': [0, -0.8, 0], 'stalkR.s': [0, -0.8, 0], 'eyeL.s': [0, -0.6, 0], 'eyeR.s': [0, -0.6, 0],
      shell: [0, 0, 15], 'shell.p': [0, -0.03, -0.03], 'foot.s': [0.05, -0.24, -0.3], pawR: [60, 0, 40], pawL: [40, 0, 20] } },
  ] },
  tinker: { fps: 30, loop: false, interp: 'step', events: { 40: 'emote:star@eyeL' }, keys: [
    { f: 0, pose: { ...TOOLS, neck: [10, 0, 0], head: [6, 0, 0], stalkL: [14, 0, 4], stalkR: [14, 0, 4], pawR: [40, 0, 0] } },
    { f: 8, pose: TURN(1) },
    { f: 16, pose: TURN(-1) },
    { f: 24, pose: TURN(1) },
    { f: 32, pose: TURN(-1) },
    // done: the gear held UP beside the goggles, column up, smile wide open, star glint ON this key (held 32 frames)
    { f: 40, pose: { ...TOOLS, 'wrenchT.s': [-1, -1, -1], 'neck.p': [0, 0.05, 0], neck: [-8, 0, 0], stalkL: [-10, 0, 24], stalkR: [-10, 0, 20],
      pawL: [-20, 0, 30], 'pawL.p': [0.1, 0.2, 0], 'gear.p': [0.14, 0.15, 0], ...OPEN(1.6) } },
    { f: 72, pose: breathe(0, 0) },
  ] },
};
const holdTo = (clip, f) => clip.keys.push({ f, pose: clip.keys[clip.keys.length - 1].pose });
holdTo(CLIPS.vote, 30);
holdTo(CLIPS.die, 60);

// ── (t1) point (the game's shared emote): point toward someone. Limbless and nearly armless, so Tinker points with
// what he has: BOTH goggled eye stalks swing forward and level onto the target like a pair of pointers, the column
// leans after them and the free LEFT paw jabs out ahead (the carry wrench stays at its carry in the right paw — never
// aimed at anyone). The game turns the avatar to face the target, so the point goes FORWARD; the column twists TW°
// to its left so at the game facing (SE) the stalks read as a screen-horizontal stroke, not end-on at the camera.
// Hold ≈ 3.5 s (pipgws EMOTE_POINT_MS): gather f0 (4) → POINT f4, mouth open → jab f16 → hold → small jab f48 →
// hold → f92 satisfied blink, stalks up → f104 idle.
const TW = 26;
const POINT = (d = 0, extra = {}) => ({ 'neck.p': [0, 0.02, 0.03 + 0.03 * d], neck: [14 + 5 * d, TW, 0], head: [6, 6, 0],
  stalkL: [66 + 8 * d, 0, -14], stalkR: [66 + 8 * d, 0, -22], 'eyeL.s': [0, 0.15, 0], 'eyeR.s': [0, 0.15, 0],
  pawL: [-95 - 10 * d, 0, -10], 'pawL.p': [0.0, 0.07, 0.07 + 0.02 * d], 'foot.s': [-0.04 - 0.03 * d, -0.08, 0.1 + 0.05 * d], ...extra });
CLIPS.point = { fps: 30, loop: false, interp: 'step', keys: [
  { f: 0, pose: { 'neck.p': [0, -0.03, -0.02], neck: [-8, -6, 0], head: [-4, 0, 0], stalkL: [-14, 0, 10], stalkR: [-14, 0, 10],
    'eyeL.s': [0, 0.15, 0], 'eyeR.s': [0, 0.15, 0], pawL: [20, 0, 0], 'foot.s': [0.04, 0.1, -0.04] } },
  { f: 4, pose: POINT(0, OPEN(1.8)) },
  { f: 16, pose: POINT(1) },
  { f: 26, pose: POINT(0) },
  { f: 48, pose: POINT(1, OPEN(1.4)) },
  { f: 58, pose: POINT(0) },
  { f: 92, pose: { ...breathe(0.014, 12), neck: [-4, 0, 6], head: [-4, 0, 4], ...BLINK } },
  { f: 104, pose: breathe(0, 0) },
] };

// ── (t1) ghost / ghost-spent. Dead players hover as a pale ghost (v1 ghost row: a monochrome pale-blue snail, the foot
// fading out, a gold halo over the goggles while the ghost vote is unspent). Spec-only (no per-clip tint in src/chars):
//   * hover: root up 0.13–0.16 m with a 1-texel bob (step keys 18 frames apart), the sole stretched a touch long and
//     thin (a trailing "tail"), the stalks drifting ±10°, smile; the wrench stays at its carry (identity);
//   * pale: material.tones (GHOST_GLSL) remaps every tone by luminance onto a pale-blue ramp when the halo bone's world
//     scale says "ghost" (spent: greyer + dimmer), a faint self-glow at dusk/night, and the foot dissolves with a 2×2
//     ordered dither (discard, both passes → real alpha holes in the bake) below bind height 0.20 m;
//   * halo: 'halo.s' grows the buried ring (ghost only, its own gold ramp).
const GHOST_UP = 1 / HALO_K - 1, GHOST_SPENT = 1;
// (t1 s2) stalks stay near their idle splay (out ±0.6·sw): a wide 18° splay turned the near goggle edge-on at SE
const GHOST = (y, sw, halo, droop, extra = {}) => ({ pos: [0, y, 0], 'foot.s': [-0.12, -0.15, 0.12], neck: [-2 + droop * 0.25, 0, sw * 0.4],
  head: [droop * 0.2, 0, -sw * 0.3], stalkL: [4 + droop, 0, 2 + 0.6 * sw], stalkR: [4 + droop, 0, 2 - 0.6 * sw], pawL: [10, 0, 0],
  'halo.s': [halo, halo, halo], ...extra });
const ghostClip = (hi, lo, sw, halo, droop, extra) => ({ fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
  { f: 0, pose: GHOST(hi, sw, halo, droop, extra) },
  { f: 18, pose: GHOST((hi + lo) / 2, 0, halo, droop, extra) },
  { f: 36, pose: GHOST(lo, -sw, halo, droop, extra) },
  { f: 54, pose: GHOST((hi + lo) / 2, 0, halo, droop, extra) },
] });
CLIPS.ghost = ghostClip(0.16, 0.13, 10, GHOST_UP, 0);
// spent: lower, heavier hover, stalks drooping forward 20° (30° covered the face at S), eyes half-lidded, no halo, dimmer + greyer (shader)
CLIPS['ghost-spent'] = ghostClip(0.11, 0.08, 6, GHOST_SPENT, 20, EYES(-0.45));

const g3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
const GH = {
  ramp: ['#E4F2FF', '#A2C8EE', '#5470AA'],     // live ghost: light / mid / dark (sRGB, pale blue as the v1 ghost row)
  spent: ['#C6CEDC', '#8C9AB4', '#4C5470'],    // ghost vote spent: dimmer, greyer
  halo: ['#FFF8D0', '#FFE38C', '#D8AE5E'],
  fade: [[0.20, 0.25], [0.13, 0.5], [0.07, 0.75]],   // bind-space y (m) below which this share of texels is dropped
};
const GHOST_GLSL = {
  vertexHead: 'flat varying float vSnGhost; flat varying float vSnHalo;',
  vertex: (haloI) => `
    vSnGhost = 0.0; vSnHalo = 0.0;
    #ifdef USE_SKINNING
      {
        float g0 = length(getBoneMatrix(0.0)[0].xyz);
        float gS = length(getBoneMatrix(${haloI}.0)[0].xyz) / max(g0, 1e-6);
        vSnGhost = gS > 100.0 ? 1.0 : (gS > 1.5 ? 0.5 : 0.0);
        vSnHalo = abs(skinIndex.x - ${haloI}.0) < 0.5 ? 1.0 : 0.0;
      }
    #endif`,
  fragmentHead: `flat varying float vSnGhost; flat varying float vSnHalo;
    vec3 snGhostTone(vec3 c, vec3 lo, vec3 md, vec3 hi) {
      float t = clamp((sqrt(dot(c, vec3(0.2126, 0.7152, 0.0722))) - 0.2) * 1.6, 0.0, 1.0);
      return t < 0.5 ? mix(lo, md, t * 2.0) : mix(md, hi, t * 2.0 - 1.0);
    }`,
  tones: `
    if (vSnGhost > 0.25) {
      float kNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
      if (vSnHalo > 0.5) {
        toonHi = ${g3(GH.halo[0])}; toonMid = ${g3(GH.halo[1])}; toonSh = ${g3(GH.halo[2])};
        totalEmissiveRadiance = toonMid * 0.6 * kNight;
      } else {
        bool live = vSnGhost > 0.75;
        vec3 gl = live ? ${g3(GH.ramp[2])} : ${g3(GH.spent[2])};
        vec3 gm = live ? ${g3(GH.ramp[1])} : ${g3(GH.spent[1])};
        vec3 gh = live ? ${g3(GH.ramp[0])} : ${g3(GH.spent[0])};
        toonHi = snGhostTone(toonHi, gl, gm, gh); toonMid = snGhostTone(toonMid, gl, gm, gh); toonSh = snGhostTone(toonSh, gl, gm, gh);
        totalEmissiveRadiance = toonMid * (live ? 0.35 : 0.18) * kNight;
        vec2 fq = mod(floor(gl_FragCoord.xy), 2.0);
        float bay = (fq.x * 2.0 + fq.y * 3.0 - fq.x * fq.y * 4.0 + 0.5) / 4.0;
        float drop = vCharBind.y < ${GH.fade[2][0].toFixed(3)} ? ${GH.fade[2][1].toFixed(2)}
          : vCharBind.y < ${GH.fade[1][0].toFixed(3)} ? ${GH.fade[1][1].toFixed(2)}
          : vCharBind.y < ${GH.fade[0][0].toFixed(3)} ? ${GH.fade[0][1].toFixed(2)} : 0.0;
        if (bay < drop) discard;
      }
    }`,
};

export function make() {
  const S = skeleton();
  const hipY = 0.31, FrG = V_GAME * V_GAME / (9.81 * hipY);
  const HB = { legL: ['hlegL', 'hkneeL', 'hankL'], legR: ['hlegR', 'hkneeR', 'hankR'], armL: ['gsink', 'gsink2'], armR: ['gsink', 'gsink2'],
    hips: 'gsink', spine: 'gsink', chest: 'gsink', neck: 'neck', head: 'head' };
  return {
    name: 'snail',
    height: HEIGHT,
    palette: PALETTE,
    signature: ['shell', 'brass'],
    faceSlot: 'skin',
    bodyPlan: 'limbless',
    heightPx: [34, 44],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'glide' },
    emote: 'tinker',
    skeleton: S,
    parts: parts(),
    sockets: { crown: { bone: 'head', at: [0, 0.5, 0] } },
    chains: [],
    personality: { body: { f: 1.8, zeta: 1, r: 0 }, head: { f: 2, zeta: 1, r: 0 } },
    // legacy Gait (no plan): cycle = 2 × stride = 1.11 m = 1.05 H per 0.267 s at v_game; runFroude above the game
    // Froude so v_game plays the WALK clip and 2·v the run; every body channel is authored in clips.walk/run
    locomotion: { walkSpeed: V_GAME, runSpeed: 2 * V_GAME, stride: 0.555, runStride: 1.105, duty: [0.18, 0.1], reach: 0.6,
      poses: [4, 4], lift: [0.02, 0.02], bob: [0, 0], lean: [0, 0], twist: [0, 0], arms: [0, 0], elbows: [0, 0],
      runFroude: [FrG * 1.5, FrG * 2], bones: HB },
    character: { legIK: 'pose', quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { stepClips: [], speech: { node: 'head', up: 0.66 } },
    material: { sides: { stalkL: 'mid', stalkR: 'mid', eyeL: 'mid', eyeR: 'mid', wrench: 'mid', gear: 'mid', wrenchT: 'mid' },
      // (t1) ghost / ghost-spent look (GHOST_GLSL; bone index = skeleton order, the halo bone is appended last)
      vertexHead: GHOST_GLSL.vertexHead, fragmentHead: GHOST_GLSL.fragmentHead, tones: GHOST_GLSL.tones,
      vertex: GHOST_GLSL.vertex(S.findIndex((b) => b.name === 'halo')) },
  };
}

export default make();
