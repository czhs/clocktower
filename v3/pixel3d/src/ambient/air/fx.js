// Air FX atlas (owner: ambient-air; docs/AMBIENT.md). Every smoke puff, dust puff, droplet, mote, glint and gust line
// of the air system is a PIXEL DRAWING generated once, deterministically, into ONE palette-index atlas (R8) and drawn
// by ONE THREE.Points batch (colour pass + a FLAG_NONE normal pass so the outline pass never draws a line over a puff).
// The shader maps index -> palette colour, so the whole air FX layer keeps to 15 colours and the day / golden / night
// swap is a uniform change (no rebuild).
//
// Drawings are authored in texels AT vh 10 (36 texels / m) and scaled by tpm / 36 at build time, so a close-up keeps
// the puffs the same size in metres instead of turning them into pebbles (fire r2 lesson).
//   smoke(r, fade, variant): a lumpy disc (main disc + 2 side lumps), lit from the upper left in 3 tones, a 1-texel
//     shadow crescent at the lower right; variant 2 = an ELONGATED lobe (two merged puffs, upper column). fade 1..3 =
//     EDGE EROSION through a 4x4 Bayer mask (eats from the rim inward: the puff breaks up instead of turning into a
//     uniform checkerboard, r3 critic: '88' stamps).
//   dust(r, fade, variant): a FLAT low cloud (ry ~ 0.6 rx) with two bumps on top, flat-ish base, lit from above, in
//     LIFTED-DIRT tones (not cream); same erosion fades.
//   px(kind): 1-texel cells (motes, droplets, glints); drop2: a 2x2 droplet (first ticks of a splash).
//   gust(len): a 1-texel horizontal line of `len` texels with a 2-texel curl up at the HEAD (downwind end).
// createAirGlow: a second, COLOUR-ONLY point batch (premultiplied alpha, no normal pass) for the sunbeam: procedural
//   hard-edged slanted bands with stepped alpha + a dithered lit patch on the ground drawn OVER the grass blades.
import * as THREE from 'three';
import { FLAGS_GLSL } from '../../core/glsl.js';
import { clamp } from '../core.js';

// ---- palette indices (0 = empty)
export const PX = {
  SMOKE_HI: 1, SMOKE_MID: 2, SMOKE_SH: 3, DUST_HI: 4, DUST_MID: 5, DUST_SH: 6,
  MOTE: 7, MOTE_DIM: 8, DROP: 9, GLINT: 10, GUST: 11, SMOKE_THIN: 12,
};
export const PAL_SIZE = 13;
// sRGB. Smoke by day is one step BELOW white (hi #E6E2D6: the walker, not the chimney, is the brightest thing on
// screen), lilac shadow; golden = cream-peach lit / mauve shadow (warmed, r3); at night it sits UNDER the lantern in
// value. Dust = LIFTED DIRT (hi #D6BFA4 / pebble #C2A58A / a cool brown shadow): a step above the lit trail, never cream.
export const PALETTE = {
  day: {
    1: '#E6E2D6', 2: '#C6C3CE', 3: '#9692AC', 4: '#D6BFA4', 5: '#C2A58A', 6: '#9E8070',
    7: '#FFF2C8', 8: '#E8D6A6', 9: '#E8FBFF', 10: '#F4FEFF', 11: '#F2F4E4', 12: '#D6D3DA',
  },
  gold: {
    1: '#F2CDA4', 2: '#CFA496', 3: '#8F7490', 4: '#E2BE92', 5: '#CCA078', 6: '#9E7860',
    7: '#FFF4CC', 8: '#F2C478', 9: '#FFF2D8', 10: '#FFF6E0', 11: '#FFF0D0', 12: '#DDB6A2',
  },
  night: {
    1: '#8A8EA6', 2: '#6A6E8A', 3: '#4A4E68', 4: '#7E7690', 5: '#686078', 6: '#4E4860',
    7: '#B8C0D8', 8: '#8E96B4', 9: '#B8C8E8', 10: '#C8D6F0', 11: '#8496BC', 12: '#7A7E98',
  },
};

const SMOKE_RMAX = 11, DUST_RMAX = 8, GUST_N = 20, CELL = 32, FADES = 4;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer4 = (c, r) => (BAYER4[(r & 3) * 4 + (c & 3)] + 0.5) / 16;
// edge erosion thresholds per fade: score = (texels in from the rim, 0 = rim) + bayer; pixels with score < E go
const ERODE = [0, 0.7, 1.75, 2.8];
/** Erode a filled drawing from its rim inward through the Bayer mask (fade 0 = untouched). */
function erode(N, out, fade, cell = 1) {
  if (!fade) return out;
  const d = new Int16Array(N * N).fill(99);
  const at = (c, r) => (c < 0 || r < 0 || c >= N || r >= N ? 0 : out[r * N + c]);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!out[r * N + c]) continue;
    if (!at(c - 1, r) || !at(c + 1, r) || !at(c, r - 1) || !at(c, r + 1)) d[r * N + c] = 0;
  }
  for (let k = 0; k < 4; k++) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = r * N + c;
    if (!out[i] || d[i] <= k) continue;
    const nb = Math.min(c > 0 ? d[i - 1] : 0, c < N - 1 ? d[i + 1] : 0, r > 0 ? d[i - N] : 0, r < N - 1 ? d[i + N] : 0);
    if (nb === k) d[i] = k + 1;
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = r * N + c;
    if (out[i] && Math.min(d[i], 6) + bayer4(Math.floor(c / cell), Math.floor(r / cell)) < ERODE[fade]) out[i] = 0;
  }
  return out;
}
function smokeDrawing(N, rad, fade, variant) {
  const out = new Uint8Array(N * N), c0 = N / 2;
  const R = rad - 0.15;
  // variant 2: an elongated lobe (two merged puffs): ellipse 1.45 : 0.8 with a bump on top
  const ex = variant === 2 ? Math.min(1.45, (c0 - 1) / Math.max(1, R)) : 1, ey = variant === 2 ? 0.8 : 1;
  const L = rad < 3 ? [] : variant === 1
    ? [[0.62, -0.5, 0.2], [0.55, 0.55, 0.3], [0.45, 0.15, -0.62]]
    : variant === 2 ? [[0.55, -0.45, -0.55], [0.5, 0.55, -0.35]]
      : [[0.6, 0.58, 0.18], [0.5, -0.6, 0.32]];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = c + 0.5 - c0, y = r + 0.5 - c0;
    const xs = x / ex, ys = y / ey;
    let inside = Math.hypot(xs, ys) <= R + (rad === 1 ? 0.45 : 0);
    for (const [s, lx, ly] of L) if (Math.hypot(x - lx * R * ex, y - ly * R * ey) <= R * s) inside = true;
    if (!inside) continue;
    // light from the upper left over the WHOLE puff; a shadow crescent on the lower right (offset disc test)
    const l = (-xs * 0.55 - ys * 0.85) / Math.max(1, R);
    const inShadow = rad >= 3 && Math.hypot(xs + R * 0.28, ys + R * 0.34) > R * 1.02;
    out[r * N + c] = rad <= 1 ? PX.SMOKE_MID : l > 0.42 ? PX.SMOKE_HI : inShadow || l < -0.55 ? PX.SMOKE_SH : PX.SMOKE_MID;
  }
  return erode(N, out, fade);
}
function dustDrawing(N, rad, fade, variant) {
  // a squat CLUSTER of 3 round clumps (a big one and two smaller at its sides; variant mirrors it), flat base, lit
  // from the upper left like the smoke (hi top-left, sh bottom-right + the base row), so it reads as a kicked-up
  // cloud, not a pebble / a flat cookie (r3)
  const out = new Uint8Array(N * N), c0 = N / 2, R = rad - 0.1, m = variant ? -1 : 1;
  const C = rad < 3 ? [[0, 0, 1]] : [[0.08 * m, -0.12, 0.68], [-0.52 * m, 0.14, 0.48], [0.55 * m, 0.16, 0.42]];
  const base = R * 0.62;                                                 // rounded underside, only lightly flattened
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = c + 0.5 - c0, y = r + 0.5 - c0;
    let inside = false;
    for (const [cx, cy, cr] of C) if (Math.hypot(x - cx * R, (y - cy * R) / 0.82) <= cr * R + (rad < 3 ? 0.4 : 0)) inside = true;
    if (!inside || y > base) continue;
    const l = (-x * 0.5 - y * 0.9) / Math.max(1, R);
    out[r * N + c] = rad <= 1 ? PX.DUST_MID : l > 0.3 ? PX.DUST_HI : l < -0.45 ? PX.DUST_SH : PX.DUST_MID;   // no dark base row (read as a mound)
  }
  return erode(N, out, fade, 2);        // 2x2-texel mask cells: it breaks into clumps, not 1-texel fur
}
function gustDrawing(len) {
  // a 1-texel line, tail at column 0, HEAD at column len - 1 curling up 2 texels (the gust front rolls over)
  const out = new Uint8Array(GUST_N * GUST_N), row = (GUST_N - 1) / 2 | 0;
  for (let c = 0; c < len; c++) out[row * GUST_N + c] = PX.GUST;
  if (len > 5) { out[(row - 1) * GUST_N + len] = PX.GUST; out[(row - 2) * GUST_N + len - 1] = PX.GUST; }
  return out;
}

/** Build the atlas at tpm texels / metre. Returns { data, width, height, cols, cell, smoke(r, fade, v), dust(r, fade, v), px(idx), drop2, gust(len) } (cell ids; each has .N). */
export function buildAirAtlas(tpm) {
  const cells = [];
  const add = (N, arr) => { cells.push({ N, arr }); return cells.length - 1; };
  const sm = {}, du = {}, gu = {}, px = {};
  for (let r = 1; r <= SMOKE_RMAX; r++) for (let f = 0; f < FADES; f++) for (const v of [0, 1, 2]) sm[`${r}:${f}:${v}`] = add(CELL, smokeDrawing(CELL, r, f, v));
  for (let r = 1; r <= DUST_RMAX; r++) for (let f = 0; f < FADES; f++) for (const v of [0, 1]) du[`${r}:${f}:${v}`] = add(CELL, dustDrawing(CELL, r, f, v));
  for (let len = 2; len <= GUST_N - 2; len++) gu[len] = add(GUST_N, gustDrawing(len));
  for (const k of [PX.MOTE, PX.MOTE_DIM, PX.DROP, PX.GLINT, PX.GUST]) { const a = new Uint8Array(1); a[0] = k; px[k] = add(1, a); }
  const d2 = add(2, new Uint8Array(4).fill(PX.DROP));
  const cell = CELL, cols = Math.floor(2048 / cell), rows = Math.ceil(cells.length / cols);
  const width = cols * cell, height = rows * cell;
  const data = new Uint8Array(width * height);
  cells.forEach(({ N, arr }, i) => {
    const ox = (i % cols) * cell, oy = Math.floor(i / cols) * cell;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) data[(oy + r) * width + ox + c] = arr[r * N + c];
  });
  const scale = tpm / 36;
  return {
    data, width, height, cols, cell, count: cells.length, scale, N: (id) => cells[id]?.N ?? 0,
    /** r in texels authored at vh 10 (scaled here). */
    smoke: (r, f = 0, v = 0) => sm[`${clamp(Math.round(r * scale), 1, SMOKE_RMAX)}:${clamp(f, 0, FADES - 1)}:${v}`],
    dust: (r, f = 0, v = 0) => du[`${clamp(Math.round(r * scale), 1, DUST_RMAX)}:${clamp(f, 0, FADES - 1)}:${v ? 1 : 0}`],
    gust: (len) => gu[clamp(Math.round(len), 2, GUST_N - 2)],
    px: (k) => px[k], drop2: d2, GUST_N, GUST_ROW: (GUST_N - 1) / 2 | 0,
  };
}

const VERT = /* glsl */`
uniform int uPassMode;
uniform vec2 uLowSize;
attribute vec4 aSpr;      // cell, size (texels; 0 = hidden), offY (texels), bias (m towards the camera)
varying float vCell, vSize;
void main() {
  vCell = aSpr.x; vSize = aSpr.y;
  if (aSpr.y < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.z += aSpr.w;
  vec4 clip = projectionMatrix * mv;
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uLowSize;
  vec2 a = floor(px);                               // whole-texel anchor: nothing glides sub-texel
  float odd = mod(aSpr.y, 2.0);
  vec2 c = vec2(a.x + (odd > 0.5 ? 0.5 : 0.0), a.y + aSpr.z + (odd > 0.5 ? 0.5 : 0.0));
  clip.xy = (c / uLowSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = aSpr.y;
}`;
const FRAG = /* glsl */`
uniform int uPassMode;
uniform sampler2D tAtlas;
uniform vec2 uAtlas;      // cols, cell
uniform vec2 uAtlasSize;
uniform vec3 uPal[${PAL_SIZE}];
varying float vCell, vSize;
${FLAGS_GLSL}
void main() {
  vec2 c = floor(gl_PointCoord * vSize);
  float col = mod(vCell, uAtlas.x), row = floor(vCell / uAtlas.x + 1e-4);
  vec2 uv = (vec2(col, row) * uAtlas.y + c + 0.5) / uAtlasSize;
  int idx = int(texture2D(tAtlas, uv).r * 255.0 + 0.5);
  if (idx == 0) discard;
  if (uPassMode == 1) { gl_FragColor = vec4(0.5, 0.5, 1.0, FLAG_NONE); return; }
  gl_FragColor = vec4(uPal[idx], 1.0);
}`;

/**
 * The FX point batch: put(p, cell, offY, bias) per sprite each update, then commit(). 1 THREE.Points, drawn in the
 * colour pass and (FLAG_NONE) in the normal pass = 2 GL calls. setPalette('day' | 'gold' | 'night').
 */
export function createAirFx(engine, { max = 512, parent, name = 'ambient-air-fx' } = {}) {
  const tpm = 1 / engine.camera.texelWorld;
  const atlas = buildAirAtlas(tpm);
  const tex = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  const pal = Array.from({ length: PAL_SIZE }, () => new THREE.Color(0, 0, 0));
  const setPalette = (k) => { const P = PALETTE[k] ?? PALETTE.day; for (let i = 1; i < PAL_SIZE; i++) pal[i].set(P[i]); };
  setPalette('day');
  const U = {
    uPassMode: engine.uniforms.uPassMode, uLowSize: engine.pipeline.common.uLowSize, tAtlas: { value: tex },
    uAtlas: { value: new THREE.Vector2(atlas.cols, atlas.cell) }, uAtlasSize: { value: new THREE.Vector2(atlas.width, atlas.height) },
    uPal: { value: pal },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true });
  mat.blending = THREE.CustomBlending;                 // pure replace, a = 1 (solid, non-emissive)
  mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.ZeroFactor;
  mat.blendEquationAlpha = THREE.AddEquation; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.ZeroFactor;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), spr = new Float32Array(max * 4);
  const pA = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), sA = new THREE.BufferAttribute(spr, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pA); geo.setAttribute('aSpr', sA);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; points.renderOrder = 10; points.name = name;
  (parent || engine.scene).add(points);
  let n = 0, last = 0;
  return {
    atlas, tpm, max, points, setPalette,
    begin() { n = 0; },
    put(p, cell, offY = 0, bias = 0) {
      if (n >= max || cell === undefined || cell < 0) return false;
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      spr[n * 4] = cell; spr[n * 4 + 1] = atlas.N(cell); spr[n * 4 + 2] = offY; spr[n * 4 + 3] = bias;
      n++; return true;
    },
    commit() {
      for (let i = n; i < Math.max(n, last); i++) spr[i * 4 + 1] = 0;
      last = n;
      pA.needsUpdate = true; sA.needsUpdate = true;
    },
    get visible() { return n; },
    dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ sunbeam glow
// A COLOUR-ONLY point batch (layer COLOR_ONLY: skips the normal pass, so it never touches outlines) with
// premultiplied-alpha blending: light ADDED over the scene in hard-edged steps. Two procedural kinds:
//   kind 1 'band': a slanted shaft from its foot (dx, dy texels to its top), 3 hard bands across it (dim | bright |
//     a separate thin dim streak) with stepped alpha, the top 30 % eroded through the Bayer mask;
//   kind 2 'patch': the lit spot on the ground (ellipse rx = w, ry = w / 2), bright core + Bayer-dithered fringe,
//     drawn with a depth bias so it lies OVER the grass blades (the blades take the light, a blade-fringed spot).
const GLOW_VERT = /* glsl */`
uniform vec2 uLowSize;
attribute vec4 aG;        // kind, size (texels; 0 = hidden), bias (m towards the camera), alpha scale
attribute vec4 aG2;       // dx, dy (shaft foot -> top, texels, y up), w (texels), unused
varying vec4 vG; varying vec4 vG2;
void main() {
  vG = aG; vG2 = aG2;
  if (aG.y < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.z += aG.z;
  vec4 clip = projectionMatrix * mv;
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uLowSize;
  vec2 c = floor(px) + (mod(aG.y, 2.0) > 0.5 ? 0.5 : 0.0);
  clip.xy = (c / uLowSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = aG.y;
}`;
const GLOW_FRAG = /* glsl */`
uniform vec3 uGlow;
varying vec4 vG; varying vec4 vG2;
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)), i = y * 4 + x;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[i]) + 0.5) / 16.0;
}
void main() {
  float S = vG.y;
  vec2 cc = floor(gl_PointCoord * S);
  vec2 q = cc + 0.5 - S * 0.5; q.y = -q.y;             // texels from the sprite centre, y up
  float a = 0.0;
  if (vG.x < 1.5) {
    // shaft: foot at (-dx/2, -dy/2), top at (dx/2, dy/2); s = 0 at the foot, 1 at the top
    float dy = max(vG2.y, 1.0), s = (q.y + dy * 0.5) / dy;
    if (s < 0.0 || s > 1.0) discard;
    float hx = (q.x - (-vG2.x * 0.5 + vG2.x * s)) / max(vG2.z, 1.0);
    if (hx >= -0.5 && hx < -0.18) a = 0.5;
    else if (hx >= -0.18 && hx < 0.24) a = 1.0;
    else if (hx >= 0.33 && hx < 0.43) a = 0.5;
    if (s > 0.7 && bayer4(cc) < (s - 0.7) / 0.3) a = 0.0;
  } else {
    float rx = max(vG2.z, 1.0), dn = length(vec2(q.x / rx, q.y / (rx * 0.5)));
    if (dn < 0.66) a = 1.0;
    else if (dn < 1.0 && bayer4(cc) > (dn - 0.66) / 0.34 * 0.85) a = 0.5;
  }
  a *= vG.w;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uGlow * a, a);
}`;
/** Sunbeam glow batch: put(p, kind, size, bias, alpha, dx, dy, w); commit(). setColor(hex). 1 GL call (colour pass only). */
export function createAirGlow(engine, { max = 8, parent, name = 'ambient-air-glow', layer = 1 } = {}) {
  const U = { uLowSize: engine.pipeline.common.uLowSize, uGlow: { value: new THREE.Color('#FFF4CC') } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, depthTest: true });
  mat.blending = THREE.CustomBlending;                 // premultiplied: dst * (1 - a) + light * a
  mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendEquationAlpha = THREE.AddEquation; mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneFactor;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), g1 = new Float32Array(max * 4), g2 = new Float32Array(max * 4);
  const dyn = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
  const pA = dyn(pos, 3), A1 = dyn(g1, 4), A2 = dyn(g2, 4);
  geo.setAttribute('position', pA); geo.setAttribute('aG', A1); geo.setAttribute('aG2', A2);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; points.renderOrder = 9; points.name = name;
  points.layers.set(layer);
  (parent || engine.scene).add(points);
  let n = 0, last = 0;
  return {
    points, max,
    setColor(hex) { U.uGlow.value.set(hex); },
    begin() { n = 0; },
    put(p, kind, size, bias, alpha, dx = 0, dy = 0, w = 0) {
      if (n >= max) return false;
      const S = Math.min(254, Math.ceil(size));
      pos.set([p.x, p.y, p.z], n * 3); g1.set([kind, S, bias, alpha], n * 4); g2.set([dx, dy, w, 0], n * 4);
      n++; return true;
    },
    commit() {
      for (let i = n; i < Math.max(n, last); i++) g1[i * 4 + 1] = 0;
      last = n; pA.needsUpdate = A1.needsUpdate = A2.needsUpdate = true;
    },
    get visible() { return n; },
    dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
