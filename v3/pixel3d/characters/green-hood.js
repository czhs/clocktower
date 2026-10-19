// Wisp (char-green-hood) — cast member "green-hood", villager: "A small wanderer in a green hood. Eyes like lanterns."
// Design sheet (Unique to me, timing charts, self-critique): characters/green-hood.md. Identity source (read only):
// pipgws/packages/assets/scripts/cast/green-hood.ts + refs/cast/green-hood.png.
// Body plan: upright CHIBI skeleton (chibi(), 2.0 heads, leg 0.24 H) dressed as a ROBED figure: a big peaked hood on the
// head bone (the peak on its own KEYED bone `peak`), a bell cloak on hips/chest, sleeves + mitts, boots under a raised
// tan hem. Face = a recessed void inside a tan rim ring with two EMISSIVE lantern eyes on keyed eye bones (blink, talk
// shapes, flare, out). r6: the face sits FORWARD (bevelled rim 0.046 m proud, convex bead eyes) so it reads at E/W; a
// vote LANTERN (bone lampR) and an emote light RING (bone halo) are scale-keyed (0 except in their clip). No spring chains (head-mounted chains re-snap inside holds, module backlog M5).
// Gait: legacy Gait chibi recipe (CAST_PORTING §8) at the v2 game speed — a skip-scurry whose authored clips.walk/run
// key the bounce, sleeves and hood peak per drawing (LegGait ignores authored poses, M1, and seats short legs, M2).
// Eyes: the toon `tones` hook renders the glow slots unlit (emissive) at every time of day — no uTime (deterministic).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.08;                       // castHeight(27): ground → hood peak tip
export const SKH = 1.0;                      // template height (top of the head bone's volume)
export const V_GAME = 3.95 * H;              // 4.27 m/s (v2 150 px/s on a 38 px sprite, relative to body height)
const HIP_Y = 0.322;                         // chibi meta.hipsY at SKH 1.0 / heads 2.0 / legs 0.7
const FR_GAME = V_GAME * V_GAME / (9.81 * HIP_Y);

// [hi, mid, sh] sRGB. 5 slots + accent (glow). No black (void sh #2A2238), no white.
export const PALETTE = {
  // r6: sh moved from mauve-navy #403E5C (h 240: the whole shaded copy read deep purple = the Storyteller) to dark moss
  cloak: ['#62A078', '#42745A', '#3B4739'],   // hood + cloak: jade-moss (h ≈ 144°, off the grass hue 98°), moss sh h ≈ 111°
  sleeve: ['#4E8062', '#365C47', '#3C4838'],  // sleeves (+ hidden thighs): a darker green (arms ≠ torso slot), olive-dark sh
  trim: ['#D8B67A', '#B08A58', '#7C5E5C'],    // tan rim ring, hem band, front stripe, cuffs, leaf emblem, buckle
  leather: ['#A8784E', '#70492F', '#4C3442'], // belt, mitts, shins, boots
  void: ['#3C3250', '#2E2642', '#2A2238'],    // the face hollow (darkest mass, ≥ #2A2238)
  glow: ['#FFF0A0', '#FFF0A0', '#FFF0A0'],    // accent: lantern eyes, emissive (unlit) at every time of day
};

const deg = Math.PI / 180;
// arm rest directions [out°, fwd°] (L side; R mirrored): sleeves hang a little out and forward over the cloak
const ARM = { up: [22, 16], fore: [8, 34] };
const armDir = ([o, f]) => { const O = o * deg, F = f * deg; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
// face (head-local, head joint = chin at y 0.493): opening centre, eye placement
// r6: the face comes FORWARD of the hood (bevelled rim 0.05 m proud, its front faces slope outward so the rim shows at
// E/W) and the eyes are small convex BEADS (same size from every angle: no proud box sides filling the void at SE/SW)
export const FACE = { y: 0.145, zf: 0.215, rimF: 0.046, rimO: 0.026, voidF: 0.04, eyeX: 0.056, eyeZ: 0.215 + 0.04, eye: [0.032, 0.047, 0.036] };
export const PEAK = { at: [0, 0.43, -0.08] };
// the vote lantern (bone `lamp` under handR): scale 0 (hidden) in every key except the vote
const HIDE = { 'lampR.s': [-1, -1, -1], 'halo.s': [-1, -1, -1] };
const CROWN_AT = [0, 0.30, -0.06];           // head-local: the halo JOINT, buried inside the hood (the ×0.001 rest speck never shows)
const CROWN_UP = 0.44;                       // ring height above the joint once scaled ×1000: head-local y 0.74, ≈ 0.07 m over the peak tip
const MICRO = 0.001;

export function skeleton() {
  const S0 = chibi({ height: SKH, heads: 2.0, legs: 0.7, arms: 0.8, snout: 0, ears: false, tail: false, jaw: false,
    face: { eye: [FACE.eyeX, FACE.y, FACE.eyeZ], brow: false, mouth: false } });
  const S = S0.map((b) => ({ ...b }));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM.up], [`hand${s}`, ARM.fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  S.push({ name: 'peak', parent: 'head', pos: PEAK.at, axis: 'up' });
  S.push({ name: 'halo', parent: 'head', pos: [0, FACE.y, FACE.zf], axis: 'fwd' });   // emote light ring (scale-keyed)
  S.push({ name: 'lampR', parent: 'handR', pos: [0, -0.04, 0], axis: 'down' });       // vote lantern (scale-keyed)
  // touch-up (ghost clips): the gold ghost HALO floats over the hood peak (microscopic rest geometry, scaled ×1000 by
  // 'crown.s' in `ghost` only) and GHOSTK, a part-less control bone whose scale is the ghost level the shader reads
  // (0 alive, 'ghostK.s' 1 → ghost, 2 → ghost-spent). Appended LAST: every living bone keeps its texture index.
  S.push({ name: 'crown', parent: 'head', pos: CROWN_AT, axis: 'up' });
  S.push({ name: 'ghostK', parent: 'hips', pos: [0, 0, 0], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

// n-sided ring (a flat face to +Z), centre z, depth scale sz → hull points
const ring = (n, r, y, z, sz = 1) => Array.from({ length: n }, (_, i) => {
  const a = (i + 0.5) * 2 * Math.PI / n;
  return [r * Math.sin(a), y, z + r * Math.cos(a) * sz];
});
// elliptic annulus in the XY plane (front at z0 + d/2), as convex hull segments
const annulus = (n, rxo, ryo, rxi, ryi, d) => {
  const segs = [];
  for (let i = 0; i < n; i++) {
    const a0 = i * 2 * Math.PI / n, a1 = (i + 1) * 2 * Math.PI / n, pts = [];
    for (const a of [a0, a1]) for (const [rx, ry] of [[rxo, ryo], [rxi, ryi]]) for (const z of [-d / 2, d / 2]) pts.push([rx * Math.cos(a), ry * Math.sin(a), z]);
    segs.push(K.hull(pts));
  }
  return K.merge(...segs);
};
const ellipseDisc = (n, rx, ry, d) => K.hull(Array.from({ length: n }, (_, i) => {
  const a = i * 2 * Math.PI / n; return [[rx * Math.cos(a), ry * Math.sin(a), -d / 2], [rx * Math.cos(a), ry * Math.sin(a), d / 2]];
}).flat());
// bevelled elliptic annulus (z from zb back to zo at the outer edge / zi at the inner edge): front faces slope outward
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
// convex bead (ellipsoid hull, lat × lon)
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

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });
  const W = (bone) => ({ hips: m.hipsY, spine: m.spineY, chest: m.chestY })[bone];

  // ── HOOD (head joint = chin, world 0.493): ONE hull of 12-sided rings sliding back as they rise; capelet bottom over
  // the shoulders. The PEAK is a separate cone on its own bone (keyed flop).
  const HOOD = [[0.205, -0.08, 0.0], [0.25, 0.02, -0.005], [0.272, 0.15, -0.01], [0.265, 0.265, -0.025], [0.228, 0.36, -0.045], [0.155, 0.43, -0.07], [0.06, 0.462, -0.09]];
  // the front is FLATTENED at z = FACE.zf (a flat disc where the opening sits flush; a convex hull stays convex)
  const hoodPts = HOOD.flatMap(([r, y, z]) => ring(12, r, y, z)).map(([x, y, z]) => [x, y, Math.min(z, FACE.zf)]);
  add('head', K.hull(hoodPts), [0, 0, 0], 'cloak', { name: 'hood' });
  // peak: up, back AND to the right from its joint (peak-local; r6: side lean 0.12 so it breaks the outline from behind),
  // base sunk 0.07 into the hood (r6: +0.03, merges the dark junction notch)
  const pk = [...ring(8, 0.09, -0.10, 0.02), ...ring(8, 0.072, 0.07, -0.05), ...ring(6, 0.024, 0.24, -0.05).map(([x, y, z]) => [x - 0.18, y, z])];
  add('peak', K.hull(pk), [0, 0, 0], 'cloak', { name: 'peakTip' });
  // face (r6): bevelled tan rim 0.05 m proud of the flat hood front (outer edge 0.03), void disc 0.022 behind the rim's
  // inner front edge, eyes = convex glow beads centred near the rim front (one emissive part per eye bone)
  const zf = FACE.zf;
  add('head', K.xf(bevelRing(16, 0.172, 0.158, 0.12, 0.11, -0.03, FACE.rimO, FACE.rimF), { at: [0, FACE.y, zf] }), [0, 0, 0], 'trim', { name: 'rim' });
  add('head', K.xf(ellipseDisc(16, 0.124, 0.114, 0.06), { at: [0, FACE.y, zf + FACE.voidF - 0.03] }), [0, 0, 0], 'void', { name: 'void' });
  add('eyeL', bead(...FACE.eye), [0, 0, 0], 'glow', { name: 'eye', mirror: true });
  // emote light ring round the rim (glow slot = emissive), scale 0 except on the emote's flare keys
  add('halo', bevelRing(20, 0.218, 0.2, 0.18, 0.166, -0.02, 0.012, 0.022), [0, 0, 0], 'glow', { name: 'halo' });
  // vote lantern: leather handle along the hand axis, brass cap + base, a glow body (hangs from the handle at the vote)
  add('lampR', K.box(0.026, 0.3, 0.026), [0, -0.15, 0], 'leather', { name: 'lampPole' });
  add('lampR', K.chamferBox(0.13, 0.04, 0.13, 0.3), [0, -0.31, 0], 'trim', { name: 'lampBase' });
  add('lampR', K.chamferBox(0.11, 0.13, 0.11, 0.2), [0, -0.395, 0], 'glow', { name: 'lampGlass' });
  add('lampR', K.chamferBox(0.13, 0.045, 0.13, 0.3), [0, -0.48, 0], 'trim', { name: 'lampCap' });
  // ghost halo (touch-up): an open octagon of 8 bars, r 0.15 m, bar 0.045 m (≥ 1.5 texels), flat in XZ, at 1/1000 size
  {
    const bars = [];
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4, r = 0.15, len = 2 * r * Math.tan(Math.PI / 8) + 0.02;
      bars.push(K.xf(K.box(len, 0.03, 0.045), { at: [r * Math.sin(a), 0, r * Math.cos(a)], rot: [0, a / deg, 0] }));
    }
    add('crown', K.xf(K.xf(K.merge(...bars), { at: [0, CROWN_UP, 0] }), { scale: MICRO }), [0, 0, 0], 'trim', { name: 'crownRing' });
  }

  // ── CLOAK: bell skirt (hips) + upper cloak (chest) on ONE profile, tan hem band of the same profile, hem sole
  const hemY = 0.15, bandY = 0.19, waistY = 0.345, shY = 0.47;
  // r6: BELL flare (hem r 0.30 > the hood half-width 0.272; concave profile, exponent 1.35) + a stepped hem band
  const rAt = (y) => y <= waistY ? 0.185 + (0.3 - 0.185) * Math.pow((waistY - y) / (waistY - hemY), 1.35) : 0.185 + (0.135 - 0.185) * (y - waistY) / (shY - waistY);
  const band = (bone, y0, y1, color, name, sz = 0.92) => add(bone, K.frustum(8, rAt(y0), rAt(y1), y1 - y0, { sz }), [0, (y0 + y1) / 2 - W(bone), 0], color, { name });
  add('hips', K.frustum(8, rAt(hemY) + 0.012, rAt(bandY) + 0.01, bandY - hemY, { sz: 0.92 }), [0, (hemY + bandY) / 2 - m.hipsY, 0], 'trim', { name: 'hem' });
  band('hips', bandY, 0.25, 'cloak', 'skirt');
  band('hips', 0.25, waistY, 'cloak', 'skirtUp');
  band('chest', waistY - 0.01, shY, 'cloak', 'cloakTop');
  add('hips', K.frustum(8, rAt(hemY) - 0.006, rAt(hemY) - 0.006, 0.012, { sz: 0.92 }), [0, hemY + 0.006 - m.hipsY, 0], 'void', { name: 'hemSole' });
  // belt (leather) + brass buckle (trim) on the spine bone; tan front stripe below the belt; leaf emblem on the back
  add('spine', K.frustum(8, rAt(0.3) + 0.008, rAt(0.345) + 0.008, 0.045, { sz: 0.92 }), [0, 0.3225 - m.spineY, 0], 'leather', { name: 'belt' });
  add('spine', K.box(0.075, 0.06, 0.03), [0, 0.3225 - m.spineY, rAt(0.32) * 0.92 * 0.924 + 0.016], 'trim', { name: 'buckle' });
  {
    // stripe on the skirt's front flat face (8-gon flat to +Z at r·cos 22.5°·sz), leaning with the bell
    const zf = (y) => rAt(y) * 0.92 * 0.924 + 0.004;
    const y0 = bandY, y1 = 0.3, w = 0.06, t = 0.012;
    add('hips', K.hull([[-w / 2, y0, zf(y0) - t], [w / 2, y0, zf(y0) - t], [-w / 2, y0, zf(y0) + t], [w / 2, y0, zf(y0) + t],
      [-w / 2, y1, zf(y1) - t], [w / 2, y1, zf(y1) - t], [-w / 2, y1, zf(y1) + t], [w / 2, y1, zf(y1) + t]]), [0, -m.hipsY, 0], 'trim', { name: 'stripe' });
    // leaf on the back: a diamond with a stem, 0.1 × 0.14 m
    const zb = (y) => -(rAt(y) * 0.92 * 0.924 + 0.006), yc = 0.27, t2 = 0.012;
    const leaf = [[0, yc - 0.065], [0.05, yc], [0, yc + 0.065], [-0.05, yc]];
    add('hips', K.hull(leaf.flatMap(([x, y]) => [[x, y, zb(y) - t2], [x, y, zb(y) + t2]])), [0, -m.hipsY, 0], 'trim', { name: 'leaf' });
  }

  // ── SLEEVES (sleeve slot) along the bent rest directions: upper sleeve (extended 0.1 m into the cuff: a telescoped
  // vote arm shows sleeve, not a gap), bell cuff sleeve with a tan cuff band, leather mitt
  const seg = (bone, d, len, r0, r1, name, color, off = 0) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r / deg) }), d.map((v) => v * (len / 2 + off)), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM.up)), m.upperArm + 0.17, 0.066, 0.062, 'sleeve' + sd, 'sleeve');
    seg('forearm' + sd, m3(armDir(ARM.fore)), m.forearm - 0.02, 0.07, 0.088, 'cuff' + sd, 'sleeve');
    seg('forearm' + sd, m3(armDir(ARM.fore)), 0.035, 0.09, 0.09, 'cuffBand' + sd, 'trim', m.forearm - 0.02);
    const d = armDir(ARM.fore);
    add('hand' + sd, K.chamferBox(0.09, 0.09, 0.09, 0.35), [sx * d[0] * 0.02, d[1] * 0.02 - 0.01, d[2] * 0.02], 'leather', { name: 'mitt' });
  }

  // ── LEGS: hidden thighs, leather shins (connect the boots to the hem), leather boots
  add('thighL', K.frustum(4, 0.06, 0.056, m.thigh), [0, -m.thigh / 2, 0], 'sleeve', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.058, 0.062, m.shin), [0, -m.shin / 2, 0], 'leather', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.12, m.ankleY + 0.03, 0.21, 0.4), [0, -m.ankleY / 2 + 0.015, 0.075], 'leather', { name: 'boot', mirror: true });
  return P;
}

// ── emissive eyes (toon `tones` hook, fragment): glow slots recognised by their mid tone render unlit at every time of
// day (lanterns). No uTime → deterministic.
const glsl3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
const GLOW_TONES = /* glsl */`
  if (distance(diffuseColor.rgb, ${glsl3(PALETTE.glow[1])}) < 0.03) {
    totalEmissiveRadiance = diffuseColor.rgb;
    toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
  }`;

// ── touch-up: GHOST look (spec-only, crow recipe). The dead player hovers as a pale blue ghost (v1 ghost row of
// refs/cast/green-hood.png: whole figure pale blue, the void a dark slate, the lantern eyes pale ice-white, the lower
// cloak fading out, a gold halo while the ghost vote is unspent). The clip scales the part-less bone `ghostK`; the vertex
// shader reads det(ghostK) / det(hips) = (1 + s)³ → vWispGhost 0 / 1 / 2. Fragment: hi/mid/sh each mapped by lightness
// onto a pale ramp (the shading steps + void/rim/eye order survive); bind-height bands fade the cloak to mist and
// dissolve the hem (2×2 checker) and everything under it; the eyes stay emissive (ice, dimmer when spent); the halo (found
// by its bind position) is flat emissive gold. Living clips: ghostK unkeyed → 0 → the old GLOW_TONES path unchanged.
export const GHOST = {
  ghost: ['#34508E', '#D6E6F4'],   // [dark end, light end] sRGB (v1 ghost #9DB4CE…#D8E6F0, void slate)
  spent: ['#3A4260', '#9AA6BE'],   // dimmer grey-blue (no halo)
  mist: '#C4D6EA',
  eye: '#E8F8FF', eyeSpent: '#A8BCD4', halo: '#F2C85A',
};
function boneOrder(S) {   // = rig.js buildCharacter topological order (the bone texture index)
  const by = new Map(S.map((b) => [b.name, b])), seen = new Set(), out = [];
  const visit = (b) => { if (seen.has(b.name)) return; if (b.parent) visit(by.get(b.parent)); seen.add(b.name); out.push(b.name); };
  S.forEach(visit);
  return out;
}
function restWorld(S, name) {
  const by = new Map(S.map((b) => [b.name, b])), p = [0, 0, 0];
  for (let b = by.get(name); b; b = b.parent ? by.get(b.parent) : null) for (let i = 0; i < 3; i++) p[i] += (b.pos || [0, 0, 0])[i];
  return p;
}
function material(S) {
  const order = boneOrder(S), iG = order.indexOf('ghostK'), iH = order.indexOf('hips');
  const h = restWorld(S, 'crown');
  return {
    vertexHead: 'varying float vWispGhost;',
    vertex: `
      vWispGhost = 0.0;
      #ifdef USE_SKINNING
      {
        float dG = determinant(mat3(getBoneMatrix(${iG}.0))), dH = determinant(mat3(getBoneMatrix(${iH}.0)));
        float rg = dG / max(abs(dH), 1e-6);
        vWispGhost = rg > 16.0 ? 2.0 : (rg > 4.0 ? 1.0 : 0.0);
      }
      #endif`,
    fragmentHead: `varying float vWispGhost;
      vec3 wispGhostTone(vec3 c, vec3 d, vec3 l) {
        float v = sqrt(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0));
        return mix(d, l, clamp((v - 0.16) * 1.6, 0.0, 1.0));
      }`,
    tones: `
      if (vWispGhost > 0.5) {
        bool sp = vWispGhost > 1.5;
        if (distance(vCharBind, vec3(${h.map((v) => v.toFixed(4)).join(', ')})) < 0.01) {
          totalEmissiveRadiance = ${glsl3(GHOST.halo)};
          toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
        } else if (distance(diffuseColor.rgb, ${glsl3(PALETTE.glow[1])}) < 0.03) {
          totalEmissiveRadiance = sp ? ${glsl3(GHOST.eyeSpent)} : ${glsl3(GHOST.eye)};
          toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
        } else {
          vec3 gd = sp ? ${glsl3(GHOST.spent[0])} : ${glsl3(GHOST.ghost[0])};
          vec3 gl = sp ? ${glsl3(GHOST.spent[1])} : ${glsl3(GHOST.ghost[1])};
          float y = vCharBind.y;
          ivec2 px = ivec2(gl_FragCoord.xy);
          if (y < 0.14) discard;
          if (y < 0.22 && ((px.x + px.y) & 1) == 1) discard;
          if (y < 0.27 && (px.x & 1) == 1 && (px.y & 1) == 1) discard;
          float fm = y < 0.27 ? 0.6 : (y < 0.36 ? 0.3 : 0.0);
          vec3 mist = sp ? gl : ${glsl3(GHOST.mist)};
          toonHi = mix(wispGhostTone(toonHi, gd, gl), mist, fm);
          toonMid = mix(wispGhostTone(toonMid, gd, gl), mist, fm);
          toonSh = mix(wispGhostTone(toonSh, gd, gl), mist, fm);
          float kNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
          totalEmissiveRadiance += toonMid * (sp ? 0.22 : 0.3) * kNight;
        }
      } else {
${GLOW_TONES}
      }`,
  };
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ──────────────────────────────────────────────────────
// r6: the eyes NEVER grow past ×1.3 (the void stays the bigger area at S/SE/SW); expression = squint / tilt / blink
const EYES = (sx, sy, sz = sx <= -1 ? -1 : 0) => ({ 'eyeL.s': [sx, sy, sz], 'eyeR.s': [sx, sy, sz] });
const TILT = (a) => ({ eyeL: [0, a, 0], eyeR: [0, a, 0] });
const BLINK = EYES(0, -0.8), WIDE = EYES(0, 0.18), SQUINT = EYES(0, -0.55), OUT = EYES(-1, -1);   // never scale x (opens a dark column in a bead, r6)
const PK = (fwd, out = 0) => ({ peak: [fwd, 0, out] });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
const breath = (d, extra = {}) => ({ pos: [0, -0.012 - 0.028 * d, 0], chest: [3 * d, 0, 0], head: [-3 * d, 0, 0], ...PK(0), ...HIDE, ...extra });

// walk / run (legacy Gait plays these upper bodies; one key per gait drawing, length 4, f0 = left contact):
// SKIP-SCURRY — contact drawings LOW (squash, hood peak flops forward, sleeves split opposite the boots, hem roll);
// flight drawings HIGH (peak flops back, sleeves together).
const gaitKey = (side, up, k = 1) => up
  ? { pos: [0, 0.06 * k, 0], chest: [-2, 0, 0], head: [2, 0, 0], ...PK(-28 * k), ...HIDE,
    upperArmL: [-6, 0, 10], upperArmR: [-6, 0, 10], forearmL: [10, 0, 0], forearmR: [10, 0, 0] }
  : { pos: [0, -0.02 * k, 0], hips: [0, side * 8, side * 4], chest: [4, -side * 6, 0], head: [-4, 0, 0], ...PK(18 * k), ...HIDE,
    upperArmL: [side * 30 * k, 0, 6], upperArmR: [-side * 30 * k, 0, 6], forearmL: [20, 0, 0], forearmR: [20, 0, 0] };
const GAIT = (k) => ({ fps: 30, loop: true, interp: 'step', length: 4, keys: [
  { f: 0, pose: gaitKey(1, false, k) }, { f: 1, pose: gaitKey(1, true, k) },
  { f: 2, pose: gaitKey(-1, false, k) }, { f: 3, pose: gaitKey(-1, true, k) }] });

// vote (r6): Wisp lifts a little LANTERN (bone lampR, shown only here) up and out beside the hood: the near (right)
// arm telescoped along its own axis (the upper sleeve is built 0.17 m longer, hidden in the cuff at rest)
export const VOTE_UP = { pos: [0, 0.03, 0], spine: [-3, 0, 10], chest: [-4, 0, 8], head: [-6, 0, -14], ...WIDE, ...PK(-18, -10),
  upperArmR: [12, 0, 128], forearmR: [-10, 0, 0], 'forearmR.p': [-0.061, -0.152, 0.047], 'handR.p': [-0.012, -0.082, 0.056],
  lampR: [0, 0, 25],
  upperArmL: [16, 0, 40], forearmL: [30, 0, 0], 'halo.s': [-1, -1, -1] };
const DEAD = { pos: [0.04, -0.07, 0], hips: [6, 0, -80], spine: [4, 0, -6], chest: [2, 0, -4], head: [-4, 14, 18], ...OUT, ...PK(34, -24), ...HIDE,
  thighL: [96, 0, 14], shinL: [-110, 0, 0], thighR: [84, 0, 6], shinR: [-100, 0, 0],
  upperArmL: [36, 0, 26], forearmL: [40, 0, 0], upperArmR: [50, 0, 30], forearmR: [50, 0, 0] };
// emote flare: eyes ×1.3 (still two lamps in a dark void), the light RING round the rim on, peak perked but ≥ −16
const FLARE = (k) => ({ pos: [0, 0.04, 0], spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-6, 0, 0], ...EYES(0, 0.25 * k, 0), ...PK(-16), 'lampR.s': [-1, -1, -1],
  upperArmL: [10, 0, 62 + 6 * (k - 1)], forearmL: [24, 0, 0], upperArmR: [10, 0, 62 + 6 * (k - 1)], forearmR: [24, 0, 0] });

export const CLIPS = {
  walk: GAIT(1),
  run: GAIT(1.3),
  // idle: breathe (extremes held 30/30), a lantern-eye blink, and a curious head tilt toward the camera side
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, BLINK) },
    { f: 38, pose: breath(1) },
    { f: 54, pose: breath(0, { head: [-4, -14, -14], ...PK(0, 16), ...TILT(-14) }) },
    { f: 66, pose: breath(0) },
  ] },
  // talk (loop 20, r6): eyes alternate TILTED (roll ±15, head roll) ↔ SQUINT; the eyes never grow; near mitt gestures
  talk: { fps: 30, loop: true, interp: 'step', length: 20, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.012, 0], chest: [-3, -8, 0], head: [-6, -6, -12], ...TILT(15), ...PK(-14, 10), ...HIDE,
      upperArmR: [50, 0, 50], forearmR: [40, 0, 0] } },
    { f: 5, pose: { pos: [0, -0.04, 0], chest: [2, 0, 0], head: [2, -2, 4], ...SQUINT, ...PK(12, -6), ...HIDE,
      upperArmR: [14, 0, 18], forearmR: [30, 0, 0] } },
    { f: 10, pose: { pos: [0, -0.012, 0], chest: [-3, -2, 0], head: [-6, -2, 12], ...TILT(-15), ...PK(-14, -10), ...HIDE,
      upperArmR: [64, 0, 40], forearmR: [50, 0, 0] } },
    { f: 15, pose: { pos: [0, -0.04, 0], chest: [2, 0, 0], head: [2, -6, -4], ...SQUINT, ...PK(12, 6), ...HIDE,
      upperArmR: [18, 0, 20], forearmR: [40, 0, 0] } },
  ] },
  // vote: 3-frame dip → the lantern goes up (sparkles at the lantern), eyes a touch wide, peak perks; HELD
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@lamp' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [6, 0, 0], head: [-4, 0, 0], ...BLINK, ...PK(20), ...HIDE, upperArmR: [-20, 0, 6], forearmR: [40, 0, 0] } },
    { f: 3, pose: VOTE_UP },
    { f: 30, pose: VOTE_UP },
  ] },
  // die: startle (eyes a touch wide) → knees buckle, eyes dim to slits → sits and tips onto its side → lying, the
  // lantern eyes go OUT, hood peak limp → held. The lantern flame (warm wisp) leaves the face.
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 22: 'land' }, keys: [
    { f: 0, pose: { pos: [0, 0, 0], chest: [-10, -8, 0], head: [-8, -10, 6], ...WIDE, ...PK(-20, 10), ...HIDE,
      upperArmR: [-10, 0, 40], forearmR: [40, 0, 0], upperArmL: [-10, 0, 40], forearmL: [40, 0, 0] } },
    { f: 10, pose: { pos: [0, -0.092, 0], spine: [14, 0, 4], chest: [8, 0, 0], head: [-8, 0, 0], ...EYES(0, -0.6), ...KNEES(50), ...PK(24), ...HIDE,
      upperArmR: [20, 0, 16], forearmR: [40, 0, 0], upperArmL: [20, 0, 16], forearmL: [40, 0, 0] } },
    { f: 16, pose: { pos: [0.02, -0.15, 0], hips: [4, 0, -36], head: [-2, 6, 8], ...EYES(0, -0.8), ...KNEES(50), ...HIDE,
      ...PK(30, 10), upperArmL: [10, 0, 40], forearmL: [30, 0, 0], upperArmR: [30, 0, 40], forearmR: [30, 0, 0] } },
    { f: 22, pose: DEAD },
    { f: 60, pose: DEAD },
  ] },
  // glow (emote, "eyes like lanterns", r6): a curious peer (crouch, head tilt, mitts up at the rim, eyes narrowed) →
  // FLARE: the eyes brighten ×1.3 (two lamps, still separate in the dark void), a 1-texel LIGHT RING lights round the
  // rim, Wisp rises on tiptoe, arms flung out; 4 frames later lantern glints (sparkles) + a rising warm flame mote →
  // a flicker (squint, ring off) → flare again (+ glints) → settle with a slow blink
  glow: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 12: 'sparkle@eyes', 14: 'wisp@eyes', 30: 'sparkle@eyes' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [8, 0, 0], chest: [2, 0, 0], head: [-6, -8, -14], ...SQUINT, ...PK(22, 14), ...KNEES(16), ...HIDE,
      upperArmL: [80, 0, 34], forearmL: [64, 0, 0], upperArmR: [80, 0, 34], forearmR: [64, 0, 0] } },
    { f: 8, pose: FLARE(1) },
    { f: 22, pose: { pos: [0, 0.0, 0], spine: [-2, 0, 0], head: [-3, 0, 0], ...EYES(0, -0.6), ...PK(-6), ...HIDE,
      upperArmL: [14, 0, 34], forearmL: [30, 0, 0], upperArmR: [14, 0, 34], forearmR: [30, 0, 0] } },
    { f: 26, pose: FLARE(1.1) },
    { f: 40, pose: breath(0, BLINK) },
    { f: 44, pose: breath(0) },
  ] },
};

// ── point (touch-up: the game's shared emote). Wisp points at the one it faces with its free LEFT mitt (the lantern arm
// stays down): a little gather (mitt to the chest, head turned to the target) → the arm flicks out forward-up and a bit
// out (depth reads as height at the 30° pitch; straight ahead vanishes into the bell at SE), the mitt stretched into a
// "finger" (handL.s), chest turned so the left shoulder leads, the HOOD PEAK swings forward along the point (a second
// pointer) and a lantern GLINT pops at the fingertip ("that one") → a second, firmer point with the eyes narrowed →
// HELD (the game shows the point ≈ 3.5 s), the eyes blink once in the hold.
export const POINT_ARM = [112, 0, 36];
const POINT = (extra = {}) => ({ pos: [0, -0.012, 0], spine: [-2, -6, 0], chest: [-2, -14, 0], head: [-6, 10, 0], ...WIDE, ...PK(26, -8), ...HIDE,
  upperArmL: POINT_ARM, forearmL: [-8, 0, 0], handL: [0, 0, 0], 'handL.s': [-0.1, 0.7, -0.1],
  upperArmR: [6, 0, 6], forearmR: [24, 0, 0], ...extra });
CLIPS.point = { fps: 30, loop: false, interp: 'step', events: { 4: 'sparkle@tip' }, keys: [
  { f: 0, pose: { pos: [0, -0.04, 0], spine: [4, 0, 0], chest: [2, -4, 0], head: [-4, -6, 0], ...SQUINT, ...PK(10, 6), ...HIDE,
    upperArmL: [40, 0, 26], forearmL: [70, 0, 0] } },
  { f: 4, pose: POINT() },
  { f: 18, pose: POINT({ upperArmL: [POINT_ARM[0] + 8, 0, POINT_ARM[2]], head: [-10, 10, 0], ...SQUINT, ...PK(32, -10) }) },
  { f: 24, pose: POINT() },
  { f: 70, pose: POINT(BLINK) },
  { f: 72, pose: POINT() },
  { f: 105, pose: POINT() },
] };

// ── ghost / ghost-spent (touch-up). Hovering calm: the root up (the legacy-Gait idle leg IK dips the hips ≤ 0.1 m to
// keep the invisible boots on the ground, so pos carries hover + 0.1), shins scaled away (no feet under a ghost), a slow
// 4-drawing drift (1-texel bob, sleeves floating out, the peak swaying), eyes open and pale. Spent: lower, head bowed,
// eyes half shut and dimmer, peak drooping, no halo, greyer ramp.
const GHOSTK = (lv) => ({ 'ghostK.s': [lv, lv, lv] });
const CROWN = { 'crown.s': [1 / MICRO - 1, 1 / MICRO - 1, 1 / MICRO - 1] };
const NO_SHINS = { 'shinL.s': [-0.98, -0.98, -0.98], 'shinR.s': [-0.98, -0.98, -0.98] };
const ghostPose = (lv, y, d, extra = {}) => ({ pos: [0, y, 0], ...GHOSTK(lv), ...(lv === 1 ? CROWN : {}), ...HIDE, ...NO_SHINS,
  chest: [3 * d + (lv === 2 ? 6 : 0), 0, 0], head: [-3 * d + (lv === 2 ? 10 : 0), 0, 0], ...PK(lv === 2 ? 26 : 6 - 10 * d, 6 - 12 * d),
  ...(lv === 2 ? EYES(0, -0.5) : {}),
  upperArmL: [10, 0, 16 + 8 * d], forearmL: [30, 0, 0], upperArmR: [10, 0, 16 + 8 * (1 - d)], forearmR: [30, 0, 0], ...extra });
const ghostClip = (lv, hi, lo) => ({ fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
  { f: 0, pose: ghostPose(lv, hi, 0) },
  { f: 18, pose: ghostPose(lv, (hi + lo) / 2, 0.5) },
  { f: 36, pose: ghostPose(lv, lo, 1) },
  { f: 54, pose: ghostPose(lv, (hi + lo) / 2, 0.5, lv === 1 ? { head: [-4, -12, -8], ...TILT(-10) } : {}) },   // a slow look aside
] });
CLIPS.ghost = ghostClip(1, 0.27, 0.24);
CLIPS['ghost-spent'] = ghostClip(2, 0.21, 0.18);

export function make() {
  const S = skeleton();
  return {
    name: 'green-hood',
    height: H,
    palette: PALETTE,
    signature: [{ part: 'hood' }, { part: 'rim' }],
    faceSlot: 'void',
    bodyPlan: 'biped',
    heightPx: [36, 44],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'glow',
    skeleton: S,
    parts: parts(S),
    sockets: { eyes: { bone: 'head', at: [0, FACE.y + 0.02, FACE.zf + 0.09] }, lamp: { bone: 'lampR', at: [0, -0.4, 0] }, tip: { bone: 'handL', at: [0, -0.08, 0] } },
    chains: [],
    personality: { body: { f: 4.5, zeta: 0.5, r: 0 }, head: { f: 4, zeta: 0.6, r: 0 } },
    // legacy Gait chibi recipe (CAST_PORTING §8): WALK branch at v_game (runFroude above the game Froude), authored
    // clips.walk/run play (bounce, sleeves, peak); legIK 'pose'.
    locomotion: { walkSpeed: V_GAME, runSpeed: 2 * V_GAME, stride: 0.55 * H, runStride: 1.05 * H, duty: [0.18, 0.1], reach: 0.75, poses: [4, 4],
      lift: [0.04 * H, 0.05 * H], bob: [0.035, 0.035], lean: [6, 12], runFroude: [FR_GAME * 1.5, FR_GAME * 2] },
    character: { legIK: 'pose', quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    fx: { vote: { node: 'lamp' }, wisp: ['#FFF8DC', '#F2C25A'], sparkle: ['#FFFDF0', '#FFD86A'] },   // warm lantern flame (emote + die)
    material: { ...material(S), sides: { eyeL: 'mid', eyeR: 'mid', peak: 'mid', halo: 'mid' } },
  };
}

export default make();
