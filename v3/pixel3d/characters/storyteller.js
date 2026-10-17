// The Storyteller (char-storyteller) — cast member "storyteller" (the game's human host, not a player):
// "Hooded, lantern-lit, always watching." Design sheet (Unique to me, timing charts, self-critique):
// characters/storyteller.md. Identity source (read only): pipgws/packages/assets/scripts/cast/storyteller.ts +
// refs/cast/storyteller.png.
// Body plan: ROBED figure on the chibi skeleton (chibi(), 2.4 heads), feet hidden under a raised hem (toes peek on the
// steps, v1). Deep-purple hood with a void face, a gold rim and two emissive amber eyes; bell robe with a deep front
// panel, a gold stripe, a gold hem band and gold stars; capelet with a gold edge and clasp. Props: a warm LANTERN in the
// RIGHT hand (bone `lantern`, glass on bone `glass`, spec.lights = the warm night pool) and a tall CLOCK-STAFF in the LEFT
// hand (bones `staff` → `clock` → `clockHand`). Every accessory is KEYED (no spring chains): hood tip `peak`, lower robe
// `robe`, lantern swing, staff plant, clock hands.
// Gait: LegGait 'biped', plant 'hold', at the v2 game speed (V = 3.95 · 1.52 m = 6.0 m/s, 4 drawings / 0.267 s): a
// stately STRIDE (toe flicks out of the hem + the staff tip planted AHEAD on the left contact + lantern swing + robe sway).
// run = fast travel (4·V = 24 m/s, the brief max) = a GLIDE: boots hidden (`bootL/R.s`), hem flare/fold flutter, peak/lantern stream back.
// Glow: the toon `tones` hook renders the glow slot unlit (emissive); the lantern glass (bind y < 0.8) flickers at night
// on the Character clock (uCharTime) in step with the spec.lights PointLight (same hash, fps, levels, seed).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.91;                        // ground → staff finial (the tallest silhouette in the cast; hood tip ≈ 1.55)
export const H_CARD = 1.52;                   // CAST_PORTING card: v2 38 px → castHeight 1.52 m (the game-speed body)
export const V_GAME = 3.95 * H_CARD;          // 6.0 m/s (v2 150 px/s on a 38 px sprite, relative to body size)
const deg = Math.PI / 180;

// [hi, mid, sh] sRGB. 5 slots + accents (glow: eyes + lantern glass, emissive; ivory: the clock face = story prop).
export const PALETTE = {
  robe: ['#8E6BB0', '#5E3D84', '#33224A'],    // hood, robe, capelet (v1 #705284 / #4C2A72 / #402462), sh h 271
  deep: ['#634A8A', '#45306A', '#3C2C56'],    // sleeves + front panel (v1 DEEP #2C1846 lifted for the night rule)
  gold: ['#F6D883', '#D0A442', '#8F6A3C'],    // trim, stars, rim, clock rim, lantern frame (v1 #D0A442)
  void: ['#3A2E4C', '#2E2440', '#2A2238'],    // face hollow, gloves, clock hands, shins (darkest mass, ≥ #2A2238)
  wood: ['#86624A', '#5A3E30', '#44302E'],    // staff, boots, lantern bail (v1 WOOD #4A3226, boots #3A2620)
  ivory: ['#FBF2DC', '#EAD9B6', '#B8A68E'],   // accent 2: clock face (v1 IVORY #EFE4C8)
  glow: ['#FFD27A', '#FFB850', '#E08A3C'],    // accent: amber eyes + lantern glass (emissive)
};

// arm rest directions [out°, fwd°] (L side; R mirrored): sleeves go down-OUT-forward, hands carry the props at hip height
const ARM = { up: [50, 10], fore: [30, 30] };
const armDir = ([o, f]) => { const O = o * deg, F = f * deg; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
// face (head-local, head joint = chin at world 0.784): flat cowl front at zf, gold rim, void, amber bead eyes
export const FACE = { y: 0.30, zf: 0.20, rimF: 0.042, rimO: 0.022, voidF: 0.03, eyeX: 0.082, eyeY: 0.33, eye: [0.036, 0.04, 0.03] };
const STAFF_GRIP = [0.04, -0.035, 0.0];     // handL-local staff bone (grip)
const STAFF_LO = 0.46, STAFF_HI = 1.25;      // grip → tip (down), grip → clock centre (up)
const CLOCK_R = 0.125;
// the staff leans STAFF_TILT° forward at rest (top ahead of the grip): the clock clears the hood at W/SW
// and STAFF_OUT° out to its left (+X) so the clock also clears the hood at SW
const STAFF_TILT = 7, STAFF_OUT = 14;
const STAFF_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(STAFF_TILT * Math.PI / 180, 0, -STAFF_OUT * Math.PI / 180));
const tiltP = (y) => new THREE.Vector3(0, y, 0).applyQuaternion(STAFF_Q).toArray().map((v) => +v.toFixed(5));
const tiltG = (g, y) => K.xf(K.xf(g, { at: [0, y, 0] }), { rot: [STAFF_TILT, 0, -STAFF_OUT] });
const CLOCK_YAW = -35, MICRO = 0.001;
const cyAt = (p) => { const a = CLOCK_YAW * Math.PI / 180; return [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)]; };

export function skeleton() {
  const S0 = chibi({ height: 1.36, heads: 2.4, legs: 0.85, arms: 0.95, snout: 0, ears: false, tail: false, jaw: false,
    face: { eye: [FACE.eyeX, FACE.eyeY, FACE.zf + FACE.voidF], brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM.up], [`hand${s}`, ARM.fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  S.push({ name: 'peak', parent: 'head', pos: [0, 0.6, -0.1], axis: 'up' });            // hood tip (keyed flop)
  S.push({ name: 'robe', parent: 'hips', pos: [0, 0.045, 0], axis: 'down' });           // lower robe, pivot at the waist
  S.push({ name: 'staff', parent: 'handL', pos: STAFF_GRIP, axis: 'up' });              // clock-staff (left hand)
  S.push({ name: 'clock', parent: 'staff', pos: tiltP(STAFF_HI), axis: 'up' });
  // minute hand variants (one shown at a time: clockHand at rest; clockHand2/3 are built ×0.001 and scaled ×1000 by the
  // chime keys, which hide the previous one) — the clock face is yawed toward the game facing, so a twist would leave its plane
  for (const n of ["clockHand", "clockHand2", "clockHand3"]) S.push({ name: n, parent: "clock", pos: [0, 0, 0], axis: "fwd" });
  S.push({ name: 'lantern', parent: 'handR', pos: [0, -0.045, 0], axis: 'down' });      // lantern (right hand)
  S.push({ name: 'glass', parent: 'lantern', pos: [0, -0.13, 0], axis: "down" });       // glass (flare by scale)
  S.push({ name: 'bootL', parent: 'footL', pos: [0, 0, 0], axis: 'fwd' });              // boots (hidden in the glide)
  S.push({ name: 'bootR', parent: 'footR', pos: [0, 0, 0], axis: 'fwd' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

// ── geometry helpers ─────────────────────────────────────────────────────────────────────────────────────────────
const ring = (n, r, y, z, sz = 1) => Array.from({ length: n }, (_, i) => {
  const a = (i + 0.5) * 2 * Math.PI / n;
  return [r * Math.sin(a), y, z + r * Math.cos(a) * sz];
});
const ellipseDisc = (n, rx, ry, d) => K.hull(Array.from({ length: n }, (_, i) => {
  const a = i * 2 * Math.PI / n; return [[rx * Math.cos(a), ry * Math.sin(a), -d / 2], [rx * Math.cos(a), ry * Math.sin(a), d / 2]];
}).flat());
const bevelRing = (n, rxo, ryo, rxi, ryi, zb, zo, zi) => {
  const segs = [];
  for (let i = 0; i < n; i++) {
    const pts = [];
    for (const a of [i * 2 * Math.PI / n, (i + 1) * 2 * Math.PI / n]) {
      const c = Math.cos(a), s = Math.sin(a);
      pts.push([rxo * c, ryo * s, zb], [rxo * c, ryo * s, zo], [rxi * c, ryi * s, zi], [rxi * c, ryi * s, zb]);
    }
    segs.push(K.hull(pts));
  }
  return K.merge(...segs);
};
const bead = (rx, ry, rz, nLat = 4, nLon = 8) => {
  const pts = [[0, ry, 0], [0, -ry, 0]];
  for (let i = 1; i < nLat; i++) {
    const p = -Math.PI / 2 + i * Math.PI / nLat;
    for (let j = 0; j < nLon; j++) {
      const l = (j + 0.5) * 2 * Math.PI / nLon;
      pts.push([rx * Math.cos(p) * Math.sin(l), ry * Math.sin(p), rz * Math.cos(p) * Math.cos(l)]);
    }
  }
  return K.hull(pts);
};
function subdivide(geo, maxEdge) {
  const p = geo.attributes.position.array, out = [];
  const rec = (a, b, c, d) => {
    const e = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const lab = e(a, b), lbc = e(b, c), lca = e(c, a), m = Math.max(lab, lbc, lca);
    if (m <= maxEdge || d > 9) { out.push(...a, ...b, ...c); return; }
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    if (m === lab) { const q = mid(a, b); rec(a, q, c, d + 1); rec(q, b, c, d + 1); }
    else if (m === lbc) { const q = mid(b, c); rec(a, b, q, d + 1); rec(a, q, c, d + 1); }
    else { const q = mid(c, a); rec(a, b, q, d + 1); rec(q, b, c, d + 1); }
  };
  for (let i = 0; i < p.length; i += 9) rec([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], 0);
  return out;
}
// split triangles by centroid into named groups: classify(c) → group name
function splitBy(arr, classify) {
  const groups = {};
  for (let i = 0; i < arr.length; i += 9) {
    const c = [(arr[i] + arr[i + 3] + arr[i + 6]) / 3, (arr[i + 1] + arr[i + 4] + arr[i + 7]) / 3, (arr[i + 2] + arr[i + 5] + arr[i + 8]) / 3];
    (groups[classify(c)] ||= []).push(...arr.slice(i, i + 9));
  }
  const out = {};
  for (const [k, a] of Object.entries(groups)) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); out[k] = K.flat(g);
  }
  return out;
}
// lathe whose profile y values are ABSOLUTE in the returned geometry (kit lathes are bbox-centred)
function latheAbs(profile, n, opts) {
  const g = K.lathe(profile, n, opts);
  g.computeBoundingBox();
  const y0 = Math.min(...profile.map((p) => p[1]));
  return g.translate(0, y0 - g.boundingBox.min.y, 0);
}
const az = (c) => Math.atan2(c[0], c[2]) / deg;            // 0 = front, + = character's left
// robe radius profile (world y): hem 0.37 at 0.10 → 0.235 at the waist pivot
const HEM_Y = 0.1, HEM_R = 0.37;
const robeR = (y) => HEM_R + (0.225 - HEM_R) * Math.min(1, Math.max(0, (y - HEM_Y) / (0.62 - HEM_Y)));
// gold robe stars [azimuth°, world y] (v1 STARS: a scatter on the lower robe, none on the front stripe)
const STARS = [[-48, 0.34], [52, 0.4], [118, 0.3], [-118, 0.4], [178, 0.33]];
const inStar = (c, yW) => STARS.some(([a, y]) => {
  const dx = Math.abs(((az(c) - a + 540) % 360) - 180) * deg * robeR(yW), dy = Math.abs(yW - y);
  return dx / 0.068 + dy / 0.08 < 1;
});

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── HOOD (head-local, chin = 0): ONE hull of 16-sided rings sliding back as they rise; the front is flattened at zf
  // (a deep cowl) so the gold rim + void sit flush. The tip is a separate cone on bone `peak` (droops back).
  const HOOD = [[0.2, 0.0, 0.0], [0.27, 0.09, 0.0], [0.305, 0.2, -0.01], [0.318, 0.32, -0.02], [0.295, 0.44, -0.025], [0.235, 0.54, -0.045], [0.13, 0.62, -0.08]];
  const hoodPts = HOOD.flatMap(([r, y, z]) => ring(16, r, y, z)).map(([x, y, z]) => [x, y, Math.min(z, FACE.zf)]);
  // gold star on the back of the hood (v1 back facings): cut out of the hood surface (no proud geometry)
  const hoodG = splitBy(subdivide(K.hull(hoodPts), 0.035), (c) => {
    const dx = c[0], dy = c[1] - 0.36;
    return c[2] < -0.2 && Math.abs(dx) / 0.075 + Math.abs(dy) / 0.09 < 1 ? 'star' : 'hood';
  });
  add('head', hoodG.hood, [0, 0, 0], 'robe', { name: 'hood' });
  if (hoodG.star) add('head', hoodG.star, [0, 0, 0], 'gold', { name: 'hoodStar' });
  // tip: base sunk into the crown, apex up + back (peak-local)
  add('peak', K.hull([...ring(8, 0.12, -0.08, 0.02), ...ring(8, 0.085, 0.06, -0.02), ...ring(4, 0.03, 0.225, -0.085)]), [0, 0, 0], 'robe', { name: 'peakTip' });
  // face: bevelled gold rim proud of the flat cowl front, void disc behind, amber bead eyes (emissive)
  const zf = FACE.zf;
  add('head', K.xf(bevelRing(20, 0.218, 0.208, 0.168, 0.16, -0.03, FACE.rimO, FACE.rimF), { at: [0, FACE.y, zf] }), [0, 0, 0], 'gold', { name: 'rim' });
  add('head', K.xf(ellipseDisc(20, 0.172, 0.164, 0.06), { at: [0, FACE.y, zf + FACE.voidF - 0.03] }), [0, 0, 0], 'void', { name: 'void' });
  add('eyeL', bead(...FACE.eye), [0, 0, 0], 'glow', { name: 'eye', mirror: true });

  // ── CAPELET (chest): a flared mantle over the shoulders, gold bottom band cut from the same surface, gold clasp
  {
    const prof = [[0.355, 0.62], [0.325, 0.68], [0.275, 0.76], [0.22, 0.85], [0.16, 0.93]];
    const g = splitBy(subdivide(latheAbs(prof, 16, { sz: 0.88 }), 0.04), (c) => (c[1] < 0.695 ? 'band' : 'cape'));
    add('chest', g.cape, [0, -m.chestY, 0], 'robe', { name: 'capelet' });
    add('chest', g.band, [0, -m.chestY, 0], 'gold', { name: 'capeBand' });
    add('chest', K.chamferBox(0.085, 0.09, 0.035, 0.3), [0, 0.71 - m.chestY, 0.29 * 0.88 + 0.006], 'gold', { name: 'clasp' });
  }
  // ── ROBE: upper robe on the chest (under the capelet), lower robe on bone `robe` (pivot at the waist): deep front
  // panel, gold stripe, gold hem band and gold stars all cut from ONE subdivided lathe (no proud trims, no inner lines)
  {
    const pivotY = m.hipsY + 0.045;
    const prof = [];
    for (let y = HEM_Y; y <= 0.645; y += 0.0545) prof.push([robeR(y), +y.toFixed(4)]);
    const g = splitBy(subdivide(latheAbs(prof, 24, { sz: 0.9 }), 0.03), (c) => {
      const y = c[1], a = Math.abs(az(c));
      if (y < HEM_Y + 0.055) return 'gold';
      if (a < 8) return 'gold';
      if (a < 22) return 'deep';
      if (inStar(c, y)) return 'gold';
      return 'robe';
    });
    add('robe', g.robe, [0, -pivotY, 0], 'robe', { name: 'robeLow' });
    add('robe', g.deep, [0, -pivotY, 0], 'deep', { name: 'robePanel' });
    add('robe', g.gold, [0, -pivotY, 0], 'gold', { name: 'robeTrim' });
    // robe-shadow sole disc (the hollow hem interior never shows)
    add('robe', K.frustum(12, HEM_R - 0.012, HEM_R - 0.012, 0.012, { sz: 0.9 }), [0, HEM_Y + 0.006 - pivotY, 0], 'void', { name: 'hemSole' });
    add('chest', latheAbs([[0.232, 0.6], [0.21, 0.72], [0.17, 0.82]], 16, { sz: 0.9 }), [0, -m.chestY, 0], 'robe', { name: 'robeUp' });
  }

  // ── SLEEVES (deep): upper sleeve + bell cuff along the bent rest directions, gold cuff band, dark glove
  const seg = (bone, d, len, r0, r1, name, color, off = 0) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(6, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r / deg) }), d.map((v) => v * (len / 2 + off)), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM.up)), m.upperArm + 0.03, 0.066, 0.078, 'sleeve' + sd, 'deep', -0.02);
    seg('forearm' + sd, m3(armDir(ARM.fore)), m.forearm - 0.03, 0.078, 0.108, 'cuff' + sd, 'deep');
    seg('forearm' + sd, m3(armDir(ARM.fore)), 0.05, 0.11, 0.11, 'cuffBand' + sd, 'gold', m.forearm - 0.05);
    const d = m3(armDir(ARM.fore));
    add('hand' + sd, K.chamferBox(0.09, 0.095, 0.09, 0.35), [sx * d[0] * 0.01, -0.02, d[2] * 0.01], 'void', { name: 'glove' + sd });
  }

  // ── LEGS: dark shins (connect the boots to the hem), boots on their own bones (hidden in the glide)
  add('shinL', K.frustum(4, 0.05, 0.055, m.shin), [0, -m.shin / 2, 0], 'void', { name: 'shin', mirror: true });
  add('bootL', K.chamferBox(0.12, m.ankleY + 0.035, 0.22, 0.35), [0, -m.ankleY / 2 + 0.015, 0.06], 'wood', { name: 'boot', mirror: true });

  // ── STAFF (bone `staff`, grip at the origin): wood shaft from the tip on the ground up to the clock, gold collar
  const shaftLen = STAFF_LO + STAFF_HI - CLOCK_R + 0.01;
  add('staff', tiltG(K.prism(6, 0.042, shaftLen), -STAFF_LO + shaftLen / 2), [0, 0, 0], 'wood', { name: 'shaft' });
  add('staff', tiltG(K.prism(6, 0.058, 0.06), STAFF_HI - CLOCK_R - 0.04), [0, 0, 0], 'gold', { name: 'collar' });
  // CLOCK (bone `clock`): a thick gold rim disc (never a blade at E/W), ivory faces front + back, a gold finial
  // (r2) the face is YAWED CLOCK_YAW toward the character's right-front: face-on at SE (the game facing), S, E, W, N;
  // edge-on only at SW/NE (it was edge-on at E/W, sig_outside 1 px)
  const cy = (g) => K.xf(g, { rot: [0, CLOCK_YAW, 0] });
  add("clock", cy(K.xf(K.prism(12, CLOCK_R, 0.13), { rot: [90, 0, 0] })), [0, 0, 0], "gold", { name: "clock" });
  add("clock", cy(K.xf(K.prism(12, 0.092, 0.15), { rot: [90, 0, 0] })), [0, 0, 0], "ivory", { name: "clockFace" });
  add("clock", cy(K.box(0.034, 0.07, 0.014)), cyAt([0, 0.03, 0.08]), "void", { name: "hourHand" });
  add('clock', K.hull([[0, 0.085, 0], [0.04, 0.0, 0], [-0.04, 0.0, 0], [0, 0, 0.04], [0, 0, -0.04]]), [0, CLOCK_R + 0.0, 0], 'gold', { name: 'finial' });
  // minute hand at 3 → 6 → 9 o'clock (bones clockHand, clockHand2, clockHand3; 2 and 3 at ×0.001)
  for (const [bone, a, k] of [["clockHand", 0, 1], ["clockHand2", -90, MICRO], ["clockHand3", -180, MICRO]]) {
    const g = K.xf(K.xf(K.box(0.082, 0.034, 0.014), { at: [0.036, 0, 0], rot: [0, 0, a] }), { at: [0, 0, 0.08] });
    add(bone, K.xf(cy(g), { scale: k }), [0, 0, 0], "void", { name: "minuteHand" });
  }

  // ── LANTERN (bone `lantern`, hangs from the right hand): wood bail, gold pyramid cap + base, emissive glass (bone `glass`)
  add('lantern', K.box(0.03, 0.05, 0.03), [0, -0.025, 0], 'wood', { name: 'bail' });
  add('lantern', K.frustum(4, 0.115, 0.04, 0.06), [0, -0.075, 0], 'gold', { name: 'lanternCap' });
  add('glass', K.box(0.135, 0.15, 0.135), [0, 0, 0], 'glow', { name: 'lanternGlass' });
  add('lantern', K.chamferBox(0.17, 0.045, 0.17, 0.3), [0, -0.225, 0], 'gold', { name: 'lanternBase' });
  return P;
}

// ── emissive glow (toon `tones` hook): the glow slot renders unlit; at night the lantern glass (bind y < 0.8) brightens
// to the hi tone with the same stepped flicker as the spec.lights PointLight (Character clock uCharTime → freezes with t=)
export const FLICKER = { fps: 7.5, levels: [0.62, 0.78, 0.9, 1.0], seed: 23 };
const glsl3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
const F = (i) => FLICKER.levels[i].toFixed(3);
const GLOW_TONES = /* glsl */`
  if (distance(diffuseColor.rgb, ${glsl3(PALETTE.glow[1])}) < 0.03) {
    float kNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
    float kLev = 1.0;
    if (vCharBind.y < 0.8) {
      float kStep = floor(uCharTime * ${FLICKER.fps.toFixed(2)} + 0.001);
      float kH = hash12(vec2(kStep, ${FLICKER.seed.toFixed(1)}));
      kLev = kH < 0.25 ? ${F(0)} : kH < 0.5 ? ${F(1)} : kH < 0.75 ? ${F(2)} : ${F(3)};
    }
    totalEmissiveRadiance = mix(${glsl3(PALETTE.glow[1])}, ${glsl3(PALETTE.glow[0])} * kLev, kNight);
    toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
  }`;

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ──────────────────────────────────────────────────────
const EYES = (sy) => ({ 'eyeL.s': [0, sy, 0], 'eyeR.s': [0, sy, 0] });   // y only (a bead scaled in x shows a dark column)
// expressions move ≥ 2 texels: WIDE = taller beads (+50 %) lifted; SQUINT = flat slits dropped to the lower lid
const EP = (dy, dx = 0) => ({ 'eyeL.p': [dx, dy, 0], 'eyeR.p': [dx, dy, 0] });
const BLINK = EYES(-0.8), SQUINT = { ...EYES(-0.6), ...EP(-0.014) }, WIDE = { ...EYES(0.5), ...EP(0.008) }, DIM = EYES(-0.7);
const LOOK = (dx) => EP(0.008, dx);   // + WIDE: eyes slide toward the side the head rolls to
const PK = (fwd, out = 0) => ({ peak: [fwd, 0, out] });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
const NOBOOTS = { 'bootL.s': [-1, -1, -1], 'bootR.s': [-1, -1, -1], 'shinL.s': [-1, -1, -1], 'shinR.s': [-1, -1, -1] };
// clock minute hand at 6 / 9 o'clock (hide the rest hand, show a ×0.001 variant ×1000)
const BIG = 1 / MICRO - 1;
const HANDS2 = { "clockHand.s": [-1, -1, -1], "clockHand2.s": [BIG, BIG, BIG] }, HANDS3 = { "clockHand.s": [-1, -1, -1], "clockHand3.s": [BIG, BIG, BIG] };
// staff kept plumb: its fwd/out cancel the left arm's (CHARACTERS.md axes: down-bone fwd = −X rot, up-bone fwd = +X rot)
const ARM_L = (up, fore = 0, out = 0, extra = {}) => ({ upperArmL: [up, 0, out], forearmL: [fore, 0, 0], staff: [up + fore, 0, out], ...extra });
const ARM_R = (up, fore = 0, out = 0, sw = 0) => ({ upperArmR: [up, 0, out], forearmR: [fore, 0, 0], lantern: [-(up + fore) + sw, 0, -out] });
const breath = (d, extra = {}) => ({ pos: [0, -0.028 * d, 0], chest: [3 * d, 0, 0], head: [-3 * d, 0, 0], ...PK(4 * d), ...extra });

// walk (LegGait plays the upper body per drawing; f0 = LEFT contact): the staff swings forward and PLANTS on the left
// contact, the lantern swings opposite (lagging), robe sways toward the planted side and lags back, the hood tip flops.
const STAFF_PLANT = -36, STAFF_FLIGHT = -20;   // staff tilt vs plumb (− = top back / tip ahead) on the L contact / flights
const walkKey = (side, flight) => flight
  ? { ...ARM_L(side > 0 ? 6 : -10, 0, 0, { staff: [(side > 0 ? 6 : -10) + STAFF_FLIGHT, 0, 0] }), ...ARM_R(6 * side, 0, 0, -14 * side), robe: [-10, 0, 0], chest: [-2, 0, 0], head: [2, 0, 0], ...PK(-22) }
  : side > 0
    ? { ...ARM_L(22, 0, 0, { staff: [22 + STAFF_PLANT, 0, 0], 'staff.p': [0, -0.03, 0] }), ...ARM_R(-16, 0, 0, 24), robe: [-4, 0, 6], chest: [3, -5, 0], head: [-3, 5, 0], ...PK(16) }
    : { ...ARM_L(-16, 0, 0), ...ARM_R(22, 0, 0, -24), robe: [-4, 0, -6], chest: [3, 5, 0], head: [-3, -5, 0], ...PK(16) };
// glide (fast travel, up to 4·V): lean 12°, the hem flared back −25° with a 2-drawing flutter (flare ↔ fold), the hood tip
// streaming −45°, the lantern trailing, a 1-texel float bob (up on the flare drawings)
const glideKey = (k, up) => ({ ...NOBOOTS, ...ARM_L(30, 0, 0, { staff: [18, 0, 0] }), ...ARM_R(-28, 0, 0, up ? -48 : -34),
  robe: [up ? -28 : -20, 0, 5 * k], 'robe.s': up ? [0.1, -0.04, 0.1] : [0, 0, 0], 'hips.p': [0, up ? 0.035 : 0, 0],
  spine: [9, 0, 0], chest: [3, 0, 0], head: [-10, 0, 0], ...PK(up ? -48 : -38, 8 * k) });

// the staff held ALOFT (vote: "the Storyteller starts the vote"): left arm up and out beside the hood, staff plumb
const ALOFT = { upperArmL: [160, 0, 15], forearmL: [-20, 0, 0], staff: [133, 0, -14] };   // (−7 fwd, −14 out: the rest tilt)
// point: the LANTERN held out toward the one it faces (shine the light on them)
const POINT_R = { upperArmR: [86, 0, 20], forearmR: [-8, 0, 0], "upperArmR.l": [0.6], "forearmR.l": [0.5], lantern: [-78, 0, -20] };
// chime strike: the lantern lifted out to the side at shoulder height, the glass flares (scale +35 %)
const FLARE_R = { upperArmR: [50, 0, 80], forearmR: [0, 0, 0], "upperArmR.l": [0.5], "forearmR.l": [0.4], lantern: [-50, 0, -80], "glass.s": [0.35, 0.35, 0.35] };

export const CLIPS = {
  // idle: breathe (extremes held), blink, and "always watching": a slow look aside (head + eyes) and back
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 24, pose: breath(1) },
    { f: 34, pose: breath(1, BLINK) },
    { f: 36, pose: breath(1) },
    { f: 46, pose: breath(1, { head: [-3, -22, 0], ...SQUINT, ...PK(4, 8) }) },
    { f: 62, pose: breath(0) },
  ] },
  walk: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: walkKey(1, false) }, { f: 1, pose: walkKey(1, true) },
    { f: 2, pose: walkKey(-1, false) }, { f: 3, pose: walkKey(-1, true) }] },
  run: { fps: 30, loop: true, interp: 'step', length: 4, keys: [
    { f: 0, pose: glideKey(1, true) }, { f: 1, pose: glideKey(0, false) }, { f: 2, pose: glideKey(-1, true) }, { f: 3, pose: glideKey(0, false) }] },
  // talk (loop 24): the narrator — lantern lifted to the chest ↔ staff raised; head roll toward the camera; eyes open ↔ squint
  talk: { fps: 30, loop: true, interp: 'step', length: 24, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, 0, 0], chest: [-3, -8, 0], head: [-4, 4, -14], ...WIDE, ...LOOK(-0.022), ...PK(-12, -8), ...ARM_R(45, 15, 30, -10) } },
    { f: 6, pose: { pos: [0, -0.03, 0], chest: [2, 0, 0], head: [2, 0, 0], ...SQUINT, ...PK(10), ...ARM_R(20, 10, 10) } },
    { f: 12, pose: { pos: [0, 0, 0], chest: [-3, 8, 0], head: [-4, -4, 14], ...WIDE, ...LOOK(0.022), ...PK(-12, 8), ...ARM_L(46, 20, 18) } },
    { f: 18, pose: { pos: [0, -0.03, 0], chest: [2, 0, 0], head: [2, 0, 0], ...SQUINT, ...PK(10), ...ARM_L(10, 0, 0) } },
  ] },
  // vote ("starts the vote"): dip (3) → the clock-staff thrust up beside the hood, eyes wide, sparkle at the clock; HELD
  vote: { fps: 30, loop: false, interp: 'step', length: 31, events: { 3: 'vote@clockTop' }, keys: [
    { f: 0, pose: { pos: [0, -0.04, 0], spine: [6, 0, 0], head: [-4, 0, 0], ...BLINK, ...PK(16), ...ARM_L(-14, 0, 0) } },
    { f: 3, pose: { pos: [0, 0.02, 0], spine: [-3, 0, -4], chest: [-3, 0, -4], head: [-4, 0, 6], ...WIDE, ...PK(-16, 6), ...ALOFT } },
  ] },
  // point: gather the lantern to the chest (4) → shine it out toward the target (held ≈ 3.5 s), one blink in the hold
  point: { fps: 30, loop: false, interp: 'step', length: 106, events: { 5: 'sparkle@lanternGlow' }, keys: [
    { f: 0, pose: { pos: [0, -0.03, 0], chest: [3, 6, 0], head: [-2, 0, 0], ...SQUINT, ...ARM_R(40, 50, 0, -20) } },
    { f: 4, pose: { pos: [0, 0.01, 0], spine: [-2, 8, 0], chest: [-4, 10, 0], head: [-4, -6, 0], ...WIDE, ...PK(-14), ...POINT_R } },
    // f70: a blink + a re-aim beat (head cocks, lantern nudged up 6°) so the hold breathes once
    { f: 70, pose: { pos: [0, 0.01, 0], spine: [-2, 8, 0], chest: [-4, 12, 0], head: [-6, -10, 6], ...BLINK, ...PK(-18, 6), ...POINT_R, upperArmR: [92, 0, 20], lantern: [-84, 0, -20] } },
    { f: 72, pose: { pos: [0, 0.01, 0], spine: [-2, 8, 0], chest: [-4, 12, 0], head: [-6, -10, 6], ...WIDE, ...PK(-18, 6), ...POINT_R, upperArmR: [92, 0, 20], lantern: [-84, 0, -20] } },
  ] },
  // die (gentle; not used in game): sway, eyes dim (8) → sinks to its knees, the robe pools (6) → bows forward into a
  // low mound, hood bowed to the ground, the lantern set down beside it, the staff leaning across; eyes dim to slits; HELD
  die: { fps: 30, loop: false, interp: "step", legs: "fk", length: 61, events: { 20: "land" }, keys: [
    { f: 0, pose: { chest: [-6, 0, 6], head: [-4, 0, 10], ...SQUINT, ...PK(12, 8) } },
    { f: 8, pose: { pos: [0, -0.2, 0], "robe.s": [0.12, -0.3, 0.12], spine: [10, 0, 0], chest: [8, 0, 0], head: [-4, 0, 0], ...DIM, ...KNEES(60), ...PK(24), ...ARM_L(-10, 0, 0), ...ARM_R(-6, 0, 0) } },
    { f: 14, pose: { pos: [0, -0.32, 0.02], "robe.s": [0.22, -0.55, 0.22], spine: [22, 0, 0], chest: [16, 0, 0], head: [6, 0, 0], ...DIM, ...KNEES(80), ...PK(30), ...ARM_L(10, 0, 10), ...ARM_R(10, 0, 20) } },
    { f: 20, pose: { pos: [0, -0.4, 0.04], "robe.s": [0.3, -0.7, 0.3], spine: [30, 0, 4], chest: [22, 0, 0], head: [-8, 0, 8], ...EYES(-0.85), ...KNEES(80), ...PK(40, 10),
      ...ARM_L(30, 0, 30, { staff: [20, 0, 104] }), ...ARM_R(40, 0, 30) } },
  ] },
  // chime (emote, "turn the clock"): lift the staff (6) → STRIKE: tip down, the clock hands jump a quarter turn, the
  // lantern lifted high and flares, eyes wide (+ dust at the tip, sparkles + a note at the clock) → lift → strike 2 → settle
  chime: { fps: 30, loop: false, interp: 'step', length: 52,
    events: { 6: 'land@staffTip', 10: 'sparkle@clockTop', 12: 'emote:note@clockTop', 24: 'land@staffTip', 28: 'sparkle@clockTop' }, keys: [
    { f: 0, pose: { pos: [0, 0.02, 0], spine: [-3, 0, 0], head: [-6, -10, 6], ...SQUINT, ...PK(-10), ...ARM_L(34, 10, 4, { 'staff.p': [0, 0.14, 0] }) } },
    { f: 6, pose: { pos: [0, -0.04, 0], spine: [4, 0, 0], head: [-2, -6, 4], ...WIDE, ...PK(16), ...ARM_L(-8, 0, 6), ...HANDS2,
      ...FLARE_R } },
    { f: 18, pose: { pos: [0, 0.02, 0], spine: [-3, 0, 0], head: [-6, -10, 6], ...PK(-10), ...ARM_L(34, 10, 4, { 'staff.p': [0, 0.14, 0] }), ...HANDS2,
      ...ARM_R(10, 10, 20) } },
    { f: 24, pose: { pos: [0, -0.04, 0], spine: [4, 0, 0], head: [-2, -6, 4], ...WIDE, ...PK(16), ...ARM_L(-8, 0, 6), ...HANDS3,
      ...FLARE_R } },
    { f: 40, pose: breath(0, { ...BLINK, ...HANDS3 }) },
    { f: 42, pose: breath(0, { ...HANDS3 }) },
  ] },
  // appear (the Storyteller "poofs" in): gone + poof (3) → a thin column (3) → squash wide (3) → stands, eyes wide,
  // hood tip perks (8) → idle
  appear: { fps: 30, loop: false, interp: 'step', legs: 'fk', length: 30, events: { 0: "poof@core", 12: "sparkle@clockTop" }, keys: [
    { f: 0, pose: { 'hips.s': [-0.97, -0.97, -0.97], pos: [0, 0.3, 0] } },
    { f: 4, pose: { "hips.s": [-0.65, -0.15, -0.65], pos: [0, 0.02, 0], ...WIDE, ...PK(-30) } },
    { f: 8, pose: { "hips.s": [0.14, -0.14, 0.14], pos: [0, -0.02, 0], ...SQUINT, ...PK(24) } },
    { f: 12, pose: { pos: [0, 0.03, 0], ...WIDE, ...PK(-18), ...ARM_L(10, 0, 0), ...ARM_R(30, 20, 10, -20) } },
    { f: 24, pose: breath(0) },
  ] },
};

export function make() {
  const S = skeleton();
  return {
    name: 'storyteller',
    height: H,
    palette: PALETTE,
    signature: [{ part: 'hood' }, { part: 'clock' }],
    faceSlot: 'void',
    bodyPlan: 'biped',
    heightPx: [52, 66],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'stride' },
    emote: 'chime',
    skeleton: S,
    parts: parts(S),
    sockets: {
      eyes: { bone: 'head', at: [0, FACE.y + 0.02, FACE.zf + 0.09] },
      clockTop: { bone: 'clock', at: [0, CLOCK_R + 0.06, 0.06] },
      staffTip: { bone: 'staff', at: tiltP(-STAFF_LO) },
      lanternGlow: { bone: 'glass', at: [-0.04, 0, 0.06] },
      lanternLight: { bone: 'glass', at: [0, -0.16, 0.05] },        // the light pool source, lowered toward the hem
      core: { bone: 'hips', at: [0, 0.1, 0] },
      speech: { bone: 'head', at: [0.3, 0.75, 0] },
    },
    chains: [],
    personality: { body: { f: 1.8, zeta: 1, r: 0 }, head: { f: 1.8, zeta: 1, r: 0 } },
    locomotion: { plan: 'biped', plant: 'hold', walkSpeed: V_GAME, runSpeed: 4 * V_GAME, cycleTime: [0.267, 0.267], poses: [4, 4],
      duty: [0.25, 0.12], reach: 0.6, arms: [0, 0], elbows: [0, 0], bob: [0.04, 0.03], lean: [4, 12], lift: [0.06, 0.02], twist: [5, 3] },
    character: { quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    lights: [{ socket: 'lanternLight', color: '#FF9A48', intensity: [0, 0.9, 2.2], distance: 2.1, decay: 1.5, flicker: FLICKER }],
    fx: { stepClips: ['walk'], stepEvery: 2, speech: { node: 'speech' }, sockets: { staffTip: { length: 0 }, clockTop: { length: 0 } },
      vote: { node: 'clockTop' }, poof: { n: 8, speed: 0.9, radius: 0.35 }, sparkle: ['#FFFDF0', '#FFD86A'] },
    material: {
      tones: GLOW_TONES,
      sides: { eyeL: 'mid', eyeR: 'mid', peak: 'mid', robe: 'mid', staff: 'mid', clock: 'mid', clockHand: "mid", clockHand2: "mid", clockHand3: "mid", lantern: 'mid', glass: 'mid' },
      merge: { peak: 'chest', head: 'chest' },   // hood tip + hood + capelet = one robe mass (no junction specks)
      whiteKeep: 0.6,
    },
  };
}

export default make();
