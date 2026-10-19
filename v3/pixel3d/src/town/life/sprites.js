// life sprites (owner: life agent): ONE texel-exact point-sprite system for every small life effect
// (chimney smoke puffs, fountain droplets / splashes / ripples, moths, sparks, embers, bell "ding" glints).
//
//   const sp = createSprites(engine, { max: 2048 });   group.add(sp.points)
//   per frame (a pure function of t):  sp.begin(); sp.push(x, y, z, size, shape, frame, emissive, col0, col1); ...; sp.end();
//
// Why one system: 1 draw call and 1 shader program for every life particle. Positions are computed on the CPU from t
// (each emitter is a closed-form f(t), stepped at its own fps), so effects can follow anchors, events and schedules.
// The vertex shader snaps every sprite centre to the low-res texel grid (odd sizes on texel centres, even on corners,
// like src/world/particles.js), so a sprite is always exactly `size` texels and never blurs or sub-pixel glides.
// Shapes are masks on whole texel cells of gl_PointCoord (pixel-art drawn in code):
//   0 PUFF   round smoke puff: upper-left cells lit (col0), body mid (col1), lower-right rim = the darker derivative
//            (col1 * 0.72 -> a 1-px "outline" on the shadow side); frame = dissolve 0..1 (4x4 Bayer: the puff breaks
//            into dithered texels as it fades, no alpha blending)
//   1 DOT    solid square (droplets, embers, glints)
//   2 MOTH   3 px: frame 0 wings out (3x1), frame 1 wings up (a V)
//   3 SPARK  plus: centre col0, arms col1 (frame 1 = centre only)
//   4 RIPPLE flat ring (2:1 ellipse outline) of `size` texels (water rings)
//   5 PUFF2  a smaller, lumpier puff (3 lobes) for the first frames of smoke and splashes
// emissive > 0.5 writes rtScene.a = 0 (PIPELINE emissive rule: fog / god rays leave it alone).
// Colours: linear THREE.Color; non-emissive sprites are multiplied by the global ramp tints (uRampHi/uRampMid) so they
// follow the time of day like the toon world (night = blue), emissive ones are not.
// Material contract: layer COLOR_ONLY (skips the normal pass: no outlines on particles), discards in uPassMode 1.
import * as THREE from 'three';
import { LAYERS } from '../../core/PixelPipeline.js';
import { ensureToonUniforms } from '../../materials/toon.js';

export const SHAPE = { PUFF: 0, DOT: 1, MOTH: 2, SPARK: 3, RIPPLE: 4, PUFF2: 5, MOTH2: 6, FLY: 7 };

const VERT = /* glsl */`
uniform int uPassMode;
uniform vec2 uLowSize;
attribute float aSize;
attribute vec4 aInfo;            // x shape, y frame, z emissive, w seed
attribute vec3 aCol0, aCol1, aCol2;
varying vec4 vInfo; varying vec3 vCol0, vCol1, vCol2; varying float vSize;
void main() {
  vInfo = aInfo; vCol0 = aCol0; vCol1 = aCol1; vCol2 = aCol2; vSize = aSize;
  if (uPassMode == 1 || aSize < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uLowSize;
  // centres arrive pre-snapped to texel CORNERS (+ the town's sub-texel anti-tie) by push(): round to that corner
  // (never a tie), then odd sizes take the texel centre down-right of it, even sizes sit on the corner
  px = floor(px + 0.5) + ((mod(aSize, 2.0) < 0.5) ? 0.0 : 0.5);
  clip.xy = (px / uLowSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = aSize;
}`;

const FRAG = /* glsl */`
uniform int uPassMode;
uniform vec3 uRampHi, uRampMid;
varying vec4 vInfo; varying vec3 vCol0, vCol1, vCol2; varying float vSize;
float bayer4(ivec2 c) {
  int x = c.x & 3, y = c.y & 3;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[y * 4 + x]) + 0.5) / 16.0;
}
void main() {
  if (uPassMode == 1) discard;
  int shape = int(vInfo.x + 0.5);
  float fr = vInfo.y;
  int S = int(vSize + 0.5);
  ivec2 c = ivec2(floor(gl_PointCoord * vSize));        // texel cell, y down
  vec2 q = vec2(c) + 0.5 - vSize * 0.5;                  // cell centre relative to the sprite centre
  int tone = 1;                                          // 0 = col0 (lit), 1 = col1, 2 = col1 dark rim
  if (shape == 0 || shape == 5) {
    // dissolve = an ordered-dither SHRINK of the whole disc: the radius steps in and only the outer 1-texel ring
    // breaks up in the Bayer pattern (no sparse dot field)
    float r = vSize * 0.5 * (1.0 - 0.42 * fr);
    float d;
    if (shape == 0) d = length(q * vec2(1.0, 1.08));
    else {                                               // 3 lobes: lumpier small puff
      float d1 = length(q - vec2(-0.22, 0.12) * r) * 1.25, d2 = length(q - vec2(0.25, 0.18) * r) * 1.3, d3 = length(q - vec2(0.0, -0.22) * r) * 1.3;
      d = min(d1, min(d2, d3));
    }
    if (d > r - 0.15) discard;
    ivec2 cb = c + ivec2(int(vInfo.w * 7.0), int(vInfo.w * 3.0));
    if (fr > 0.01 && d > r - 1.2 && bayer4(cb) < 0.35 + fr * 0.5) discard;
    float s = q.x + q.y;                                 // upper-left lit (y down: small y = top)
    if (s < -r * 0.3 && d < r - 0.9) tone = 0;
    else if (d > r - 1.2 && s > r * 0.05) tone = 2;      // 1-px dark rim on the lower-right (col2)
  } else if (shape == 1) {
    tone = fr > 0.5 ? 1 : 0;
  } else if (shape == 2) {
    bool on = fr < 0.5 ? (c.y == 1) : ((c.y == 1 && c.x == 1) || (c.y == 0 && c.x != 1));
    if (!on) discard;
    tone = (c.x == 1) ? 1 : 0;
  } else if (shape == 3) {
    int ctr = S / 2;
    int m = abs(c.x - ctr) + abs(c.y - ctr);
    if (m > (fr > 0.5 ? 0 : 1)) discard;
    tone = m == 0 ? 0 : 1;
  } else if (shape == 6) {                              // MOTH2: 2x2 wings open / top row only (wings up)
    if (fr > 0.5 && c.y > 0) discard;
    tone = (c.x + c.y) % 2 == 0 ? 0 : 1;
  } else if (shape == 7) {                              // FLY: a 2-texel diagonal firefly cluster (frame 1 = 1 texel)
    bool on = (c.x == 0 && c.y == 1) || (fr < 0.5 && c.x == 1 && c.y == 0);
    if (!on) discard;
    tone = c.y == 1 ? 0 : 1;
  } else if (shape == 4) {
    float r = vSize * 0.5;
    float d = length(q * vec2(1.0, 2.0));              // 2:1 flat ellipse (seen from 30 deg up)
    if (abs(d - (r - 0.5)) > 0.55) discard;
    if (bayer4(c) < fr) discard;
    tone = q.y < 0.0 ? 1 : 0;                            // far half darker, near half catches light
  }
  vec3 col = tone == 0 ? vCol0 : (tone == 1 ? vCol1 : vCol2);
  bool emissive = vInfo.z > 0.5;
  if (!emissive) col *= (tone == 0 ? uRampHi : uRampMid);
  gl_FragColor = vec4(col, emissive ? 0.0 : 1.0);
}`;

export function createSprites(engine, { max = 2048, name = 'life-sprites' } = {}) {
  const T = ensureToonUniforms(engine);
  const pos = new Float32Array(max * 3), size = new Float32Array(max), info = new Float32Array(max * 4);
  const c0 = new Float32Array(max * 3), c1 = new Float32Array(max * 3), c2 = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  const attr = (a, n) => { const b = new THREE.BufferAttribute(a, n); b.setUsage(THREE.DynamicDrawUsage); return b; };
  geo.setAttribute('position', attr(pos, 3));
  geo.setAttribute('aSize', attr(size, 1));
  geo.setAttribute('aInfo', attr(info, 4));
  geo.setAttribute('aCol0', attr(c0, 3));
  geo.setAttribute('aCol1', attr(c1, 3));
  geo.setAttribute('aCol2', attr(c2, 3));
  geo.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPassMode: engine.uniforms.uPassMode,
      uLowSize: engine.pipeline.common.uLowSize,
      uRampHi: T.uRampHi, uRampMid: T.uRampMid,
    },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending,
  });
  // pure replace (colour AND alpha): alpha 0 marks emissive texels in rtScene, 1 normal ones
  material.blendEquation = THREE.AddEquation; material.blendSrc = THREE.OneFactor; material.blendDst = THREE.ZeroFactor;
  material.blendEquationAlpha = THREE.AddEquation; material.blendSrcAlpha = THREE.OneFactor; material.blendDstAlpha = THREE.ZeroFactor;
  material.name = name;
  const points = new THREE.Points(geo, material);
  points.name = name;
  points.layers.set(LAYERS.COLOR_ONLY);
  points.frustumCulled = false;
  points.renderOrder = 10;
  let n = 0;
  const ro = new THREE.Vector3(), _p = new THREE.Vector3();
  // sprite pixel sizes are authored for the gameplay zoom (viewHeight 12) and scale with the zoom (min 1 texel)
  const zoomK = () => 12 / engine.camera.viewHeight;
  const api = {
    points, material, max,
    get count() { return n; },
    /** rootOffset: the town root's position (the anti-tie nudge); centres are snapped so root + p is on the grid. */
    begin(rootOffset = null) { n = 0; api.k = zoomK(); if (rootOffset) ro.copy(rootOffset); },
    k: 1,
    /** size in texels at the gameplay zoom (scaled by the zoom, rounded, >= 1). */
    push(x, y, z, sz, shape, frame, emissive, col0, col1 = col0, seed = 0, minSize = 1, col2 = null) {
      if (n >= max) return;
      const s = Math.max(minSize, Math.round(sz * api.k));
      // snap the centre to the camera texel grid in WORLD space (incl. the root offset): a whole-texel pan then moves
      // every sprite by exactly that many texels (crawl-free), and the shader never meets a rounding tie
      _p.set(x, y, z).add(ro);
      engine.camera.snapWorld(_p, _p);
      pos[n * 3] = _p.x; pos[n * 3 + 1] = _p.y; pos[n * 3 + 2] = _p.z;   // local = grid point: world = grid + anti-tie (never a tie)
      const r2 = col2 ?? { r: col1.r * 0.72, g: col1.g * 0.72, b: col1.b * 0.72 };
      c2[n * 3] = r2.r; c2[n * 3 + 1] = r2.g; c2[n * 3 + 2] = r2.b;
      size[n] = s;
      info[n * 4] = shape; info[n * 4 + 1] = frame; info[n * 4 + 2] = emissive ? 1 : 0; info[n * 4 + 3] = seed;
      c0[n * 3] = col0.r; c0[n * 3 + 1] = col0.g; c0[n * 3 + 2] = col0.b;
      c1[n * 3] = col1.r; c1[n * 3 + 1] = col1.g; c1[n * 3 + 2] = col1.b;
      n++;
    },
    end() {
      geo.setDrawRange(0, n);
      for (const k of ['position', 'aSize', 'aInfo', 'aCol0', 'aCol1', 'aCol2']) {
        const a = geo.getAttribute(k);
        a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true;
      }
    },
  };
  return api;
}
