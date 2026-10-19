// Pixel particles (owner: atmosphere). docs/TECHNIQUES.md §8.3.
//
//   const p = createParticles(engine, {kind: 'dust'|'fireflies'|'leaves'|'rain', bounds, count, seed,
//                                     colors, fps, speed, alpha, slant, halo, shaftOnly, shaftTries});
//   -> { points, material, uniforms, kind, setBounds(bounds), dispose() }
//
// THREE.Points with a custom ShaderMaterial on LAYERS.COLOR_ONLY (never in the normal pass, so no outlines;
// it also discards in uPassMode 1 per the contract). gl_PointSize is in low-res render-target texels, and
// every sprite centre is snapped to the texel grid in the vertex shader (odd sizes on texel centres, even
// sizes on texel corners), so particles are always exactly 1-3 texels and never blurred. Shapes inside the
// point (plus-shaped firefly halo, leaf frames, rain streak) are masks on whole texel cells of gl_PointCoord.
// Motion is a pure function of uTime, stepped at `fps` (whole-texel hops, no sub-pixel glide), wrapped
// inside `bounds`. Colours are a few fixed (linear) tones: no gradients.
//
//   dust      1 px motes, visible ONLY inside sun shafts (three's shadow map sampled per particle),
//             slow drift + swirl, twinkle at 4 fps. Default tone = sun colour. A mote in shade tries up to
//             shaftTries (6) alternative spots in the box and shows at the first lit one, so narrow slit
//             shafts still collect plenty of motes.
//   fireflies 1 px core + 4-neighbour halo (3 px plus, additive; halo:2 adds a faint 5 px diamond), wander,
//             blink (on 2 s, off 1-4 s, 1-frame dim fade in/out at 6 fps). Emissive: marks rtScene.a = 0 so
//             fog/godrays skip them (they glow through mist).
//   leaves    2x2 / 3x1 two-frame flip sprite (colors: [hi, mid, shade, accent]), falls 0.4 m/s with sideways flutter, lit/shadow tone from the
//             shadow map (a leaf drifting through a shaft lights up).
//   rain      1x4 px streak (optionally 2:1 slanted), 9 m/s, alpha 0.6.
//
// bounds: THREE.Box3 | {min:[x,y,z], max:[x,y,z]} | {x0,x1,y0,y1,z0,z1}. Default: 20x20 m around the
// camera target, y 0..4 (rain 0..9).
import * as THREE from 'three';
import { LAYERS } from '../core/PixelPipeline.js';
import { rng } from '../core/noise.js';
import { SUN_LIT_GLSL, shadowUniforms, bindShadow } from '../post/godrays.js';

const KINDS = {
  dust: { count: 300, size: 1, fps: 8, speed: 0.06, alpha: 0.85, colors: null, blend: 'normal' },
  fireflies: { count: 90, size: 3, fps: 8, speed: 0.35, alpha: 1.0, colors: ['#E8F27A', '#8FB04A'], blend: 'add' },
  leaves: { count: 30, size: 3, fps: 8, speed: 0.4, alpha: 1.0, colors: ['#C9B85A', '#9AA04C', '#557256', '#D9914A'], blend: 'normal' },
  rain: { count: 900, size: 4, fps: 24, speed: 9.0, alpha: 0.6, colors: ['#A9C4D8'], blend: 'normal' },
};
const KIND_ID = { dust: 0, fireflies: 1, leaves: 2, rain: 3 };

function toBox(b, engine, kind) {
  if (!b) {
    const t = engine.camera.target;
    return new THREE.Box3(new THREE.Vector3(t.x - 10, 0, t.z - 10), new THREE.Vector3(t.x + 10, kind === 'rain' ? 9 : 4, t.z + 10));
  }
  if (b.isBox3) return b.clone();
  if (b.min && b.max) return new THREE.Box3(new THREE.Vector3().fromArray(b.min.toArray ? b.min.toArray() : b.min), new THREE.Vector3().fromArray(b.max.toArray ? b.max.toArray() : b.max));
  return new THREE.Box3(new THREE.Vector3(b.x0 ?? -10, b.y0 ?? 0, b.z0 ?? -10), new THREE.Vector3(b.x1 ?? 10, b.y1 ?? 4, b.z1 ?? 10));
}

const VERT = /* glsl */`
uniform int uPassMode;
uniform float uTime, uFps, uSpeed, uSize, uSlant, uShaftOnly;
uniform int uShaftTries;
uniform vec2 uLowSize;
uniform vec3 uBMin, uBSize, uSunDir;
uniform int uKind;
attribute vec4 aSeed;          // 4 per-particle random numbers in [0,1)
varying float vVis;            // 0 = hidden
varying float vLit;            // sun visibility at the particle
varying vec4 vSeed;
varying float vFrame;          // animation frame / blink phase (kind specific)
${SUN_LIT_GLSL}
float h11(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
vec3 wrapBox(vec3 p) { return uBMin + mod(p - uBMin, uBSize); }
void main() {
  vSeed = aSeed; vVis = 1.0; vFrame = 0.0; vLit = 1.0;
  if (uPassMode == 1) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float ts = floor(uTime * uFps) / uFps;                      // stepped time: whole-texel hops
  float ph = aSeed.w * 6.2831853;
  vec3 p = position;
  if (uKind == 0) {                                           // dust: slow drift + lazy swirl
    vec3 drift = normalize(vec3(aSeed.x - 0.5, (aSeed.y - 0.5) * 0.35, aSeed.z - 0.5) + vec3(0.4, 0.05, 0.15));
    p += drift * uSpeed * ts;
    p += 0.18 * vec3(sin(ts * 0.53 + ph), 0.6 * sin(ts * 0.41 + ph * 1.7), cos(ts * 0.47 + ph * 0.6));
    float tw = h11(floor(uTime * 4.0) + aSeed.x * 97.0);       // twinkle at 4 fps
    vVis = tw > 0.22 ? 1.0 : 0.0;
  } else if (uKind == 1) {                                    // fireflies: wander + blink
    float s = uSpeed;
    p += s * vec3(sin(ts * 0.37 + ph) * 1.6 + sin(ts * 0.91 + ph * 2.3) * 0.7,
                  sin(ts * 0.53 + ph * 1.3) * 0.5 + sin(ts * 1.27 + ph * 0.7) * 0.25,
                  cos(ts * 0.29 + ph * 0.8) * 1.6 + cos(ts * 0.83 + ph * 1.9) * 0.7);
    float period = 3.0 + 3.0 * aSeed.y;                       // on 2 s, off 1-4 s
    float tb = floor(uTime * 6.0) / 6.0 + aSeed.z * period;   // blink stepped at 6 fps
    float u = mod(tb, period);
    vVis = u < 2.0 ? 1.0 : 0.0;
    vFrame = (u < 1.0 / 6.0 || u > 2.0 - 2.0 / 6.0) ? 1.0 : 0.0; // dim fade-in / fade-out frames
  } else if (uKind == 2) {                                    // leaves: fall + flutter + 2-frame flip
    p.y -= uSpeed * (0.75 + 0.5 * aSeed.x) * ts;
    vec3 side = normalize(vec3(cos(ph), 0.0, sin(ph)));
    p += side * 0.3 * sin(ts * (1.6 + aSeed.y) + ph) + vec3(0.25, 0.0, 0.1) * ts;
    vFrame = mod(floor(ts * (2.0 + 2.0 * aSeed.z) + aSeed.w * 4.0), 2.0);
  } else {                                                    // rain
    p.y -= uSpeed * (0.9 + 0.2 * aSeed.x) * ts;
    p.x += uSlant * uSpeed * 0.15 * ts;
  }
  p = wrapBox(p);
  vLit = sunLit(p);
  if (uKind == 0 && uShaftOnly > 0.5) {
    // narrow shafts fill a tiny fraction of the box: a mote that is in shade tries a few alternative spots
    // (fixed per-mote offsets that drift with it, so the choice is a pure function of t) and shows at the first
    // lit one. Visible motes then concentrate in the shafts (~uShaftTries x more) instead of a handful.
    for (int k = 1; k < 8; k++) {
      if (k >= uShaftTries || vLit > 0.5) break;
      float fk = float(k);
      vec3 q = wrapBox(p + uBSize * vec3(h11(aSeed.x * 13.7 + fk * 7.13), h11(aSeed.y * 17.3 + fk * 3.31), h11(aSeed.z * 19.1 + fk * 5.77)));
      float l = sunLit(q);
      if (l > 0.5) { p = q; vLit = l; }
    }
    if (vLit < 0.5) vVis = 0.0;
  }
  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);  // ortho: w = 1
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uLowSize;
  px = (mod(uSize, 2.0) < 0.5) ? floor(px + 0.5) : floor(px) + 0.5;
  clip.xy = (px / uLowSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = vVis > 0.5 ? uSize : 0.0;
  if (vVis < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
uniform int uPassMode, uKind;
uniform float uSize, uAlpha, uSlant, uHaloGain;
uniform int uHalo;
uniform vec3 uC0, uC1, uC2, uC3;
varying float vVis, vLit, vFrame;
varying vec4 vSeed;
void main() {
  if (uPassMode == 1 || vVis < 0.5) discard;
  ivec2 c = ivec2(floor(gl_PointCoord * uSize));             // texel cell inside the sprite (y down)
  vec3 col; float a = uAlpha;
  if (uKind == 0) {
    col = uC0;
  } else if (uKind == 1) {
    int ctr = int(uSize) / 2;
    int m = abs(c.x - ctr) + abs(c.y - ctr);                   // diamond distance: 0 core, 1 plus, 2 outer halo
    if (m > uHalo) discard;
    bool dim = vFrame > 0.5;                                   // fade-in / fade-out frame: core only, dimmer
    if (m == 0) col = dim ? uC1 * 1.6 : uC0;
    else { if (dim) discard; col = uC1 * (m == 1 ? uHaloGain : uHaloGain * 0.4); }
  } else if (uKind == 2) {
    // frame 0: 2x2 face-on leaf (top-left cell block), frame 1: 3x1 edge-on (middle row)
    bool on = vFrame < 0.5 ? (c.x < 2 && c.y < 2 && !(c.x == 1 && c.y == 0 && vSeed.y > 0.5))
                           : (c.y == 1);
    if (!on) discard;
    bool warm = vSeed.z > 0.82;                                // a few autumn leaves (accent)
    vec3 lit = warm ? uC3 : (vFrame < 0.5 ? uC0 : uC1);        // face-on = hi, edge-on = mid
    col = vLit > 0.5 ? lit : (warm ? uC3 * 0.55 : uC2);        // in shade: the shadow tone
  } else {
    // 1x4 streak; uSlant > 0: 2:1 slant (one column step every 2 rows)
    int want = uSlant > 0.5 ? (c.y / 2) + 1 : 1;
    if (c.x != want) discard;
    col = uC0;
  }
  gl_FragColor = vec4(col, a);
}`;

export function createParticles(engine, opts = {}) {
  const kind = opts.kind || 'dust';
  if (!(kind in KINDS)) throw new Error(`createParticles: unknown kind '${kind}'`);
  const K = { ...KINDS[kind], ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
  if (kind === 'fireflies' && opts.size === undefined) K.size = 1 + 2 * Math.max(0, Math.min(2, opts.halo ?? 1));
  const count = Math.max(1, Math.round(K.count));
  const box = toBox(opts.bounds, engine, kind);
  const size = box.getSize(new THREE.Vector3());
  const rand = rng(opts.seed ?? 1);

  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = box.min.x + rand() * size.x;
    pos[i * 3 + 1] = box.min.y + rand() * size.y;
    pos[i * 3 + 2] = box.min.z + rand() * size.z;
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));

  const colors = (K.colors || [engine.style?.sunColor ?? engine.uniforms.uSunColor.value]).map((c) => (c?.isColor ? c.clone() : new THREE.Color(c)));
  while (colors.length < 4) colors.push(colors[colors.length - 1].clone());
  if (kind === 'dust' && !K.colors) {
    // sun-tinted motes, a touch brighter than the shaft so they read as specks of light
    colors[0] = new THREE.Color(1.0, 0.89, 0.69).multiply(engine.uniforms.uSunColor.value).multiplyScalar(1.15);
  }

  const U = {
    ...shadowUniforms(engine),
    uPassMode: engine.uniforms.uPassMode,
    uTime: engine.uniforms.uTime,
    uSunDir: engine.uniforms.uSunDir,
    uLowSize: engine.pipeline.common.uLowSize,
    uKind: { value: KIND_ID[kind] },
    uFps: { value: K.fps }, uSpeed: { value: K.speed }, uSize: { value: K.size }, uAlpha: { value: K.alpha },
    uSlant: { value: opts.slant ? 1 : 0 },
    uHalo: { value: Math.max(0, Math.min(2, opts.halo ?? 1)) }, uHaloGain: { value: opts.haloGain ?? 1.1 },
    uShaftOnly: { value: (opts.shaftOnly ?? (kind === 'dust')) ? 1 : 0 },
    uShaftTries: { value: Math.max(1, Math.min(8, Math.round(opts.shaftTries ?? 6))) },
    uBMin: { value: box.min.clone() }, uBSize: { value: size.clone() },
    uC0: { value: colors[0] }, uC1: { value: colors[1] }, uC2: { value: colors[2] }, uC3: { value: colors[3] },
  };
  const additive = K.blend === 'add';
  const material = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true,
    blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
  });
  if (additive) {
    // colour: dst + src (additive glow). alpha: dst.a = 0 -> EMISSIVE marker in rtScene.a: the atmosphere
    // passes (fog, godrays) leave these texels untouched so lights glow through mist (EMISSIVE_ALPHA).
    material.blendEquation = THREE.AddEquation; material.blendSrc = THREE.OneFactor; material.blendDst = THREE.OneFactor;
    material.blendEquationAlpha = THREE.AddEquation; material.blendSrcAlpha = THREE.ZeroFactor; material.blendDstAlpha = THREE.ZeroFactor;
  }
  const points = new THREE.Points(geo, material);
  points.layers.set(LAYERS.COLOR_ONLY);
  points.frustumCulled = false;
  points.castShadow = false; points.receiveShadow = false;
  points.renderOrder = 10;
  points.name = `particles-${kind}`;
  // the shadow map is (re)rendered at the start of renderer.render(), before this object draws
  points.onBeforeRender = () => bindShadow(engine, U);
  if (opts.add !== false) engine.scene.add(points);

  return {
    points, material, uniforms: U, kind,
    setBounds(b) { const bx = toBox(b, engine, kind); U.uBMin.value.copy(bx.min); bx.getSize(U.uBSize.value); },
    dispose() { points.removeFromParent(); geo.dispose(); material.dispose(); },
  };
}
