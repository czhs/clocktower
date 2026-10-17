// Toon material: MeshLambertMaterial patched via onBeforeCompile, so instancing, three's shadow maps
// and fog keep working. Lighting model = t3ssel8r "white light -> 3-tone ramp" (docs/TECHNIQUES.md §3):
//   L   = max(N·Lsun,0) · shadow · cloud(lightPos)
//   w   = bandWeights(L, cut)                  (shadow, mid, hi) weights, hard-ish bands
//   col = w.hi·toonHi·uRampHi + w.mid·toonMid·uRampMid + w.sh·toonSh·uRampSh·def·hemi  (+ quantized point lights)
// Shared lighting uniforms live in engine.toonUniforms (ensureToonUniforms; tuned by src/world/sky.js):
//   uRampHi/Mid/Sh, uBandThr, uBandSoft, uAmbShading (shadow definition), uHemiSky/uHemiGround (banded
//   hemispheric term on the shadow tone), uCloud/uCloudWind/uCloudShape (cloud shadows, CLOUD_GLSL), uNoiseScale,
//   uPointLevels/uPointShape (lanterns), uToneShape (night tone saturation, cool-accent protection, low-sun
//   ground lift), uPenumbra (mid step on the lit side of cast-shadow edges on the ground).
//   Shadow-map extent/bias: configureShadows() in sky.js. Debug: ?toon=shadow|L|band|cloud.
// Every scene material must honour uPassMode (docs/PIPELINE.md):
//   uPassMode == 0 -> lit color;  uPassMode == 1 -> vec4(viewNormal*.5+.5, outlineFlag)
//
// Options (all optional):
//   color, map, vertexColors, flatShading, side, transparent, opacity, alphaTest, depthWrite, blending
//   outline: 'full' | 'depth' | 'edges' | 'none'
//   uniforms: extra uniforms {name: {value}} (vertex+fragment)
//   vertexHead / fragmentHead: GLSL at global scope
//   objectNormal: GLSL after <beginnormal_vertex>; may modify `vec3 objectNormal`
//   vertex: GLSL after <begin_vertex>; may modify `vec3 transformed`
//   viewVertex: GLSL after project_vertex; may modify `vec4 mvPosition` (billboards, texel snapping)
//   lightPos: GLSL vec3 expr (vertex scope) = world position where lighting/shadow/cloud is evaluated
//             (grass/leaves: their root). Default: the vertex world position (vToonWorld).
//   cutMod: number or GLSL float expr (vertex scope); > 0.5 bumps the surface up one band
//   ramp: {hi, sh} per-material tone multipliers (THREE.Color / [r,g,b], linear). See rampFromTones().
//   toneAttributes: true -> attributes `toneHi`, `toneSh` (vec3, linear, absolute) give the hi/sh tones
//   albedo: GLSL after <color_fragment>; may modify `vec4 diffuseColor`
//   tones: GLSL after tone init; may overwrite `vec3 toonHi, toonMid, toonSh`
//   normalOverride: GLSL after <normal_fragment_maps>; may modify view-space `normal` (affects normal pass)
//   lightNormal: GLSL vec3 expr (fragment, view space) used for lighting only (default `normal`)
//   normalNoise: float, world-space lighting-normal perturbation (terrain ~0.15, solids 0)
//   unlit: 'sh' -> flat shadow tone (canopy cores)
// Hooks for derived materials (look.js characterMaterial; all default '' = the shader text above, unchanged):
//   lightMod: GLSL after `float toonL` is computed; may modify toonL (sees toonNdotL, toonShadow, toonCloud, toonUpY)
//   cloudExpr: GLSL float expr replacing `cloudAtten(vToonLightPos)` (e.g. a per-object anchor, or 1.0)
//   shadowBias: GLSL float expr (fragment) SUBTRACTED from ds.shadowBias in every shadow-map compare of this material
//   outlineFlag: GLSL float expr written to the normal pass alpha instead of the outline flag constant
//   outgoing: GLSL after the emissive add; may modify `vec3 outgoingLight` (debug views)
import * as THREE from 'three';
import { FLAGS_GLSL } from '../core/glsl.js';

const OUTLINE = { full: 'FLAG_FULL', depth: 'FLAG_DEPTH_ONLY', edges: 'FLAG_EDGES_ONLY', none: 'FLAG_NONE', char: 'FLAG_CHAR' };

// Measured from t3ssel8r's Ruined Shrine stone (linear hi/mid and sh/mid ratios).
export const DEFAULT_HI = new THREE.Color(1.90, 1.95, 1.80);
export const DEFAULT_SH = new THREE.Color(0.40, 0.49, 0.76);

export const NOISE_GLSL = /* glsl */`
float hash12(vec2 p) { uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
  return float((q.x ^ q.y) * 1597334673u) * (1.0 / 4294967295.0); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
`;

// Cloud shadows (shared by water/godrays/fog: needs uCloud, uCloudWind, uSunDir, uTime + NOISE_GLSL).
// uCloudShape is optional for other consumers: left unbound (all 0) it means the defaults below.
export const CLOUD_GLSL = /* glsl */`
uniform vec4 uCloud;       // x scale(1/m), y cover, z soft, w cloud-plane height
uniform vec2 uCloudWind;
uniform vec4 uCloudShape;  // x fringe (density units at scale 0.09, 0 -> 0.03), y strength (0 -> 1), z drift fps (0 -> 6, < 0 continuous)
// Drift time stepped on the shared 6 fps animation clock: cloud edges move in whole steps together with every
// other animated layer, never creeping a texel at an arbitrary moment between ticks.
float cloudTime() {
  float fps = uCloudShape.z == 0.0 ? 6.0 : uCloudShape.z;
  return fps < 0.0 ? uTime : floor(uTime * fps + 1e-3) / fps;
}
// Cloud density at the cloud plane above wp (projected along the sun). Domain-warped 5-octave FBM, two
// layers drifting at different speeds so the blobs scroll AND slowly evolve. Pure function of uTime.
float cloudDensity(vec3 wp) {
  vec3 Ls = normalize(uSunDir);
  vec3 p = wp + Ls * ((uCloud.w - wp.y) / max(Ls.y, 0.1));
  vec2 drift = uCloudWind * cloudTime();
  vec2 q = p.xz * uCloud.x + drift;
  vec2 warp = vec2(vnoise(q * 1.6 + vec2(5.2, 1.3) + drift * 0.5), vnoise(q * 1.6 + vec2(13.7, 7.9) - drift * 0.5)) - 0.5;
  q += warp * 0.4;
  float s = 0.0, a = 0.5;
  vec2 r = q;
  for (int k = 0; k < 5; k++) { s += a * vnoise(r); r = r * 2.07 + vec2(17.1, 3.7); a *= 0.5; }
  s /= 0.96875;
  float e = fbm(q * 0.6 - drift * 0.8 + vec2(41.0, 9.0));            // slow evolving layer
  return mix(s, e, 0.3);
}
// 1 = clear, 1 - str/2 = the thin fringe, 1 - str = full cover. Two hard steps (banded, not blurred). With the
// default strength 1 full cover acts like a cast shadow (L = 0 -> shadow band) and the half step is only a
// narrow fringe ring around each blob (-> one mid-band ring between lit and shaded ground).
float cloudAtten(vec3 wp) {
  if (uCloud.x <= 0.0) return 1.0;
  float n = cloudDensity(wp);
  float sft = max(uCloud.z, 1e-4);
  // fringe given at the reference scale 0.09; scaled with uCloud.x so the ring keeps ~the same width in metres
  float fr = (uCloudShape.x > 0.0 ? uCloudShape.x : 0.03) * clamp(uCloud.x / 0.09, 0.25, 2.0);
  float str = uCloudShape.y > 0.0 ? uCloudShape.y : 1.0;
  float a = smoothstep(uCloud.y - sft, uCloud.y + sft, n);
  float b = smoothstep(uCloud.y + fr - sft, uCloud.y + fr + sft, n);
  return 1.0 - str * (0.5 * a + 0.5 * b);
}
`;

// Band weights + shadow definition + hemispheric sky term. Owned by the "lighting" agent
// (override via engine.toonLightGLSL). Everything here is QUANTIZED: no smooth gradients on lit surfaces.
export const TOON_LIGHT_GLSL = /* glsl */`
uniform vec2 uBandThr;     // shadow|mid, mid|hi thresholds on L
uniform float uBandSoft;
uniform float uAmbShading; // T "Ambient Shading": darkening of shadowed faces that turn away from the sun
uniform vec3 uHemiSky;     // shadow-tone multiplier for up-facing faces (sky fill, cool)
uniform vec3 uHemiGround;  // shadow-tone multiplier for down-facing faces (overhang undersides)
uniform float uPointLevels;// quantization steps of additive point lights (night lanterns)
uniform vec3 uPointShape;  // x gain (x light intensity), y reach radius (m), z warmth (0 = white light, 1 = full colour)
uniform float uNoiseScale; // frequency (1/m) of the world-space lighting-normal noise
uniform vec4 uToneShape;   // x tone saturation (1 = as authored; night < 1), y cool accents (> 0 keep their hue
                           // under a warm ramp, < 0 extra desaturation; see toneSat), z sun-facing ground lift
                           // (min L of lit up-facing faces), w unused
uniform vec2 uPenumbra;    // x fringe width (m, 0 = off) of the mid step on the lit side of cast-shadow edges
                           // (up-facing surfaces only), y shadow-map texel size (m)
vec3 bandWeights(float L, float cutMod) {
  float s = max(uBandSoft, 1e-4);
  float hi  = smoothstep(uBandThr.y - s, uBandThr.y + s, L);
  float mid = smoothstep(uBandThr.x - s, uBandThr.x + s, L);
  vec3 w = vec3(1.0 - mid, mid - hi, hi);
  if (cutMod > 0.5) w = vec3(0.0, w.x, w.y + w.z);
  return w;
}
// Shadowed-area definition [T]: hard steps. Faces turned to the sun or side-on (N.L > -0.45: flat ground,
// sun-side and side walls) keep the material's measured shadow tone exactly; faces turned clearly away
// lose one step (1 - uAmbShading). Only applied to the shadow tone.
float shadowDefinition(float NdotL) {
  return NdotL > -0.45 ? 1.0 : 1.0 - uAmbShading;
}
// Hemispheric sky term, banded on the WORLD normal's y: up-facing (> .55) and walls see the sky (uHemiSky;
// walls a quarter ground bounce), down-facing (< -.35) only the ground bounce (uHemiGround).
vec3 hemiTerm(float upY) {
  return upY > 0.55 ? uHemiSky : (upY < -0.35 ? uHemiGround : mix(uHemiSky, uHemiGround, 0.25));
}
// Tone conditioning before the ramp. uToneShape.x: global tone saturation (night palette swap). uToneShape.y > 0
// (golden): saturated cyan/blue accents (b clearly above r and g, g above r: the cube) take only the ramp's
// luminance, not its warm hue; y < 0 (night): all cool accents (incl. lilac flowers) are desaturated further by
// |y| (no electric blue-violet flowers or facets under the blue moon ramp).
float toneCool(vec3 t) { return smoothstep(0.05, 0.15, t.b - max(t.r, t.g)); }
vec3 toneSat(vec3 c) {
  float s = uToneShape.x <= 0.0 ? 1.0 : uToneShape.x;
  if (uToneShape.y < 0.0) s *= 1.0 + uToneShape.y * toneCool(c);
  return max(mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, s), 0.0);
}
vec3 rampFor(vec3 ramp, vec3 tone) {
  // only cyan/blue accents (g above r: the cube) are protected; lilac/violet (r above g) takes the warm ramp,
  // which with the golden mid/hi ramps keeps it lilac-mauve (fully protected it turns periwinkle-blue)
  float cool = toneCool(tone) * smoothstep(0.0, 0.1, tone.g - tone.r) * max(uToneShape.y, 0.0);
  return mix(ramp, vec3(dot(ramp, vec3(0.2126, 0.7152, 0.0722))), cool);
}
`;

/** Shared toon uniforms (created once per engine; sky.js / lighting owner tunes their values). */
export function ensureToonUniforms(engine) {
  const T = engine.toonUniforms;
  T.uRampHi ??= { value: new THREE.Color(1, 1, 1) };
  T.uRampMid ??= { value: new THREE.Color(1, 1, 1) };
  T.uRampSh ??= { value: new THREE.Color(1, 1, 1) };
  T.uBandThr ??= { value: new THREE.Vector2(0.10, 0.50) };
  T.uBandSoft ??= { value: 0.002 }; // ~crisp: pixel-art bands, no visible blend on gentle slopes
  T.uAmbShading ??= { value: 0.3 };
  T.uHemiSky ??= { value: new THREE.Color(1, 1, 1) };
  T.uHemiGround ??= { value: new THREE.Color(1, 1, 1) };
  T.uPointLevels ??= { value: 3 };
  T.uPointShape ??= { value: new THREE.Vector3(0.6, 1.8, 0.6) };  // gain, reach radius (m), warmth
  T.uToneShape ??= { value: new THREE.Vector4(1, 0, 0, 0) };       // tone saturation, keep-cool, ground lift
  T.uPenumbra ??= { value: new THREE.Vector2(0, 0.01) };          // shadow-edge mid fringe (m), shadow texel (m)
  T.uCloudShape ??= { value: new THREE.Vector4(0.03, 1, 6, 0) };  // cloud fringe, strength, drift fps
  T.uNoiseScale ??= { value: 0.35 }; // 1/m frequency of the world-space lighting-normal noise
  T.uCloud ??= { value: new THREE.Vector4(0.045, 0.52, 0.0005, 30) }; // soft: hard edge (banded anyway)
  T.uCloudWind ??= { value: new THREE.Vector2(0.016, 0.005) };
  return T;
}

/** {color: mid, ramp: {hi, sh}} from three sRGB hex tones. */
export function rampFromTones(hiHex, midHex, shHex) {
  const hi = new THREE.Color(hiHex), mid = new THREE.Color(midHex), sh = new THREE.Color(shHex);
  const div = (a) => new THREE.Color(a.r / Math.max(mid.r, 1e-4), a.g / Math.max(mid.g, 1e-4), a.b / Math.max(mid.b, 1e-4));
  return { color: mid, ramp: { hi: div(hi), sh: div(sh) } };
}

const toColor = (c, d) => (c === undefined ? d.clone() : c.isColor ? c.clone() : Array.isArray(c) ? new THREE.Color(...c) : new THREE.Color(c));

let cacheId = 0;

export function toonMaterial(engine, opts = {}) {
  const {
    color = 0xffffff, map = null, vertexColors = false, flatShading = false, side = THREE.FrontSide,
    transparent = false, opacity = 1, alphaTest = 0, depthWrite = true, blending = THREE.NormalBlending,
    outline = 'full', uniforms = {},
    vertexHead = '', fragmentHead = '', objectNormal = '', vertex = '', viewVertex = '', lightPos = '',
    cutMod = 0, ramp = {}, toneAttributes = false, albedo = '', tones = '', normalOverride = '',
    lightNormal = 'normal', normalNoise = 0, unlit = null,
    lightMod = '', cloudExpr = '', shadowBias = '', outlineFlag = '', outgoing = '',
  } = opts;
  const SB = shadowBias ? '(ds.shadowBias - toonExtraBias)' : 'ds.shadowBias';
  const mat = new THREE.MeshLambertMaterial({ color, map, vertexColors, flatShading, side, transparent, opacity, alphaTest, depthWrite, blending });
  const key = `toon-${cacheId++}`;
  const U = engine.uniforms;
  const T = ensureToonUniforms(engine);
  const own = {
    uMatHi: { value: toColor(ramp.hi, DEFAULT_HI) },
    uMatSh: { value: toColor(ramp.sh, DEFAULT_SH) },
    uNormalNoise: { value: normalNoise },
  };
  mat.userData.toon = own; // per-material tunables (e.g. mat.userData.toon.uMatHi.value.set(...))
  const cutExpr = typeof cutMod === 'number' ? cutMod.toFixed(3) : `float(${cutMod})`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uPassMode: U.uPassMode, uTime: U.uTime, uSunDir: U.uSunDir, uCameraPos: U.uCameraPos, uTexelWorld: U.uTexelWorld,
      ...T, ...own, ...uniforms,
    });
    let vs = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uSunDir; uniform float uTexelWorld; uniform vec3 uCameraPos;
        varying vec3 vToonWorld; varying vec3 vToonLightPos; varying float vToonCut;
        #ifdef TOON_TONE_ATTR
          attribute vec3 toneHi; attribute vec3 toneSh; varying vec3 vToneHi; varying vec3 vToneSh;
        #endif
        ${vertexHead}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${objectNormal}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${vertex}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 tw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            tw = instanceMatrix * tw;
          #endif
          vToonWorld = (modelMatrix * tw).xyz;
        }
        ${viewVertex}
        gl_Position = projectionMatrix * mvPosition;
        vToonLightPos = ${lightPos || 'vToonWorld'};
        vToonCut = ${cutExpr};
        #ifdef TOON_TONE_ATTR
          vToneHi = toneHi; vToneSh = toneSh;
        #endif`);
    if (lightPos) {
      vs = vs.replace('#include <shadowmap_vertex>', `#if defined( USE_SHADOWMAP )
          worldPosition = vec4(vToonLightPos, 1.0);
        #endif
        #include <shadowmap_vertex>`);
    }
    shader.vertexShader = vs;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${FLAGS_GLSL}
        uniform int uPassMode; uniform float uTime; uniform vec3 uSunDir, uCameraPos; uniform float uTexelWorld;
        uniform vec3 uRampHi, uRampMid, uRampSh, uMatHi, uMatSh; uniform float uNormalNoise;
        varying vec3 vToonWorld; varying vec3 vToonLightPos; varying float vToonCut;
        #ifdef TOON_TONE_ATTR
          varying vec3 vToneHi; varying vec3 vToneSh;
        #endif
        ${NOISE_GLSL}
        ${CLOUD_GLSL}
        ${engine.toonLightGLSL ?? TOON_LIGHT_GLSL}
        ${fragmentHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${albedo}
        vec3 toonMid = diffuseColor.rgb;
        vec3 toonHi = toonMid * uMatHi;
        vec3 toonSh = toonMid * uMatSh;
        #ifdef TOON_TONE_ATTR
          toonHi = vToneHi; toonSh = vToneSh;
        #endif
        ${tones}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${normalOverride}
        if (uPassMode == 1) { gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, ${outlineFlag || (OUTLINE[outline] ?? 'FLAG_FULL')}); return; }`)
      .replace(/#include <lights_lambert_fragment>[\s\S]*?vec3 outgoingLight = [^;]*;/, `
        // ---- lighting block (owner: lighting; docs/TECHNIQUES.md §3) ----
        vec3 toonN = normalize(${lightNormal});
        if (uNormalNoise > 0.0) {
          // world-anchored, low-frequency 2-octave perturbation evaluated at the LIGHT position, so band
          // edges wander organically instead of popping as straight contour lines (T, H)
          vec2 nq = vToonLightPos.xz * uNoiseScale;
          vec3 nn = vec3(vnoise(nq) - 0.5, 0.0, vnoise(nq + 7.3) - 0.5)
                  + 0.5 * vec3(vnoise(nq * 2.7 + 3.1) - 0.5, 0.0, vnoise(nq * 2.7 + 11.9) - 0.5);
          toonN = normalize(toonN + mat3(viewMatrix) * nn * uNormalNoise);
        }
        float toonNdotL = 0.0, toonShadow = 1.0;
        float toonUpY = dot(toonN, viewMatrix[1].xyz); // world-space N.y (world up expressed in view space)
        #if NUM_DIR_LIGHTS > 0
          toonNdotL = dot(toonN, directionalLights[0].direction);
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            if (receiveShadow) {
              DirectionalLightShadow ds = directionalLightShadows[0];${shadowBias ? `
              float toonExtraBias = ${shadowBias};` : ''}
              vec4 sc = vDirectionalShadowCoord[0];
              toonShadow = getShadow(directionalShadowMap[0], ds.shadowMapSize, ds.shadowIntensity, ${SB}, ds.shadowRadius, sc);
              // penumbra step: a lit up-facing point with a cast-shadow edge within uPenumbra.x metres (4 taps in
              // the light plane, world-anchored) drops to half light -> one mid-band ring on the lit side of
              // every tree / canopy / prop shadow on the ground (T's 3-tone shadow edge), walls stay hard
              if (uPenumbra.x > 0.0 && toonShadow > 0.5 && toonUpY > 0.55) {
                vec2 po = vec2(uPenumbra.x / max(uPenumbra.y, 1e-4)) / ds.shadowMapSize;
                float pn = getShadow(directionalShadowMap[0], ds.shadowMapSize, ds.shadowIntensity, ${SB}, ds.shadowRadius, sc + vec4(po.x, 0.0, 0.0, 0.0))
                         * getShadow(directionalShadowMap[0], ds.shadowMapSize, ds.shadowIntensity, ${SB}, ds.shadowRadius, sc - vec4(po.x, 0.0, 0.0, 0.0))
                         * getShadow(directionalShadowMap[0], ds.shadowMapSize, ds.shadowIntensity, ${SB}, ds.shadowRadius, sc + vec4(0.0, po.y, 0.0, 0.0))
                         * getShadow(directionalShadowMap[0], ds.shadowMapSize, ds.shadowIntensity, ${SB}, ds.shadowRadius, sc - vec4(0.0, po.y, 0.0, 0.0));
                toonShadow = pn > 0.5 ? 1.0 : 0.5;
              }
            }
          #endif
        #endif
        // "white light": the cast shadow and the cloud shadow just lower L (folded into the ramp)
        float toonCloud = ${cloudExpr || 'cloudAtten(vToonLightPos)'};
        float toonLit = max(toonNdotL, 0.0);
        // sun-facing ground lift: a low sun (golden) still lights unshadowed up-facing ground into the hi band
        if (toonUpY > 0.55 && toonNdotL > 0.0) toonLit = max(toonLit, uToneShape.z);
        float toonL = toonLit * toonShadow * toonCloud;${lightMod ? `
        ${lightMod}` : ''}
        vec3 toonW = bandWeights(toonL, vToonCut);
        float toonDef = shadowDefinition(toonNdotL);
        vec3 toonMid0 = toonMid;   // authored mid tone (lantern-lit surfaces show it, warm-tinted)
        toonHi = toneSat(toonHi); toonMid = toneSat(toonMid); toonSh = toneSat(toonSh);
        vec3 toonShTone = toonSh * rampFor(uRampSh, toonSh) * toonDef * hemiTerm(toonUpY);
        vec3 outgoingLight = toonW.z * toonHi * rampFor(uRampHi, toonHi) + toonW.y * toonMid * rampFor(uRampMid, toonMid) + toonW.x * toonShTone;
        #ifdef TOON_UNLIT_SH
          outgoingLight = toonSh * rampFor(uRampSh, toonSh);
        #endif
        #ifdef TOON_DEBUG
          // ?toon=shadow|L|band|cloud (engine.params): lighting inputs as grey levels
          #if TOON_DEBUG == 1
            outgoingLight = vec3(toonShadow);
          #elif TOON_DEBUG == 2
            outgoingLight = vec3(toonL);
          #elif TOON_DEBUG == 3
            outgoingLight = toonW.z * vec3(1.0, 0.8, 0.3) + toonW.y * vec3(0.3, 0.6, 0.3) + toonW.x * vec3(0.05, 0.1, 0.3);
          #else
            outgoingLight = vec3(toonCloud);
          #endif
        #endif
        // point lights (night lanterns), quantized to uPointLevels steps [T]: within a hard reach of uPointShape.y
        // metres (quadratic falloff x N.L x intensity x gain) the surface steps TOWARDS its authored mid tone tinted
        // by the light (warmth uPointShape.z) - a lantern warms the ground around it to a warm mid, never past it
        // (no saturated mustard blob, no orange rectangles on block faces)
        #if NUM_POINT_LIGHTS > 0
          vec3 toonLV = (viewMatrix * vec4(vToonLightPos, 1.0)).xyz;
          PointLight toonPL;
          #pragma unroll_loop_start
          for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
            toonPL = pointLights[ i ];
            {
              vec3 lv = toonPL.position - toonLV;
              float reach = toonPL.distance > 0.0 ? min(uPointShape.y, toonPL.distance) : uPointShape.y;
              float dr = length(lv) / max(reach, 1e-3);
              float pmax = max(max(toonPL.color.r, toonPL.color.g), max(toonPL.color.b, 1e-4));
              float pa = clamp(1.0 - dr * dr, 0.0, 1.0) * max(dot(toonN, normalize(lv)), 0.0) * pmax * uPointShape.x;
              float pq = floor(clamp(pa, 0.0, 1.0) * uPointLevels + 0.5) / uPointLevels;
              vec3 warm = toonMid0 * mix(vec3(1.0), toonPL.color / pmax, uPointShape.z);
              outgoingLight = mix(outgoingLight, warm, pq);
            }
          }
          #pragma unroll_loop_end
        #endif
        outgoingLight += totalEmissiveRadiance;${outgoing ? `
        ${outgoing}` : ''}`);
  };
  mat.defines = mat.defines || {};
  if (toneAttributes) mat.defines.TOON_TONE_ATTR = '';
  const dbg = { shadow: 1, L: 2, band: 3, cloud: 4 }[engine.params?.get?.('toon')];
  if (dbg) mat.defines.TOON_DEBUG = dbg;
  if (unlit === 'sh') mat.defines.TOON_UNLIT_SH = '';
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Create a mesh with toon material, shadows on. Also sets a matching depth material if `vertex` patch used. */
export function toonMesh(engine, geometry, opts = {}, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, toonMaterial(engine, opts));
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  if (opts.vertex) mesh.customDepthMaterial = depthMaterial(engine, opts);
  return mesh;
}

/** Shadow-caster material sharing a vertex patch (wind, billboards) with its toon material. */
export function depthMaterial(engine, { vertex = '', vertexHead = '', uniforms = {}, alphaTest = 0, map = null } = {}) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest, map });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime: engine.uniforms.uTime, uSunDir: engine.uniforms.uSunDir, uTexelWorld: engine.uniforms.uTexelWorld, ...uniforms });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uSunDir; uniform float uTexelWorld; ${vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${vertex}`);
  };
  const key = `depth-${cacheId++}`;
  m.customProgramCacheKey = () => key;
  return m;
}
