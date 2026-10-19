// God rays (owner: atmosphere). docs/TECHNIQUES.md §8.1. Pass 'godrays', order 150 (after outlines).
//
//   const g = addGodrays(engine, {strength, gap, planes, top, topFade, fade, density|perPlane, levels, maxLevel,
//                                 falloff, base, color | (desat, tint), phase, mistTop, mistDepth, mistBoost, spriteReach,
//                                 land | landAbove, landOcc, ground, solidCap, elevFade, elevMin, enabled});
//   g.set({...}) changes options later; g.pass is the pipeline pass; g.uniforms are its uniforms.
//
// Fullscreen low-res raymarch (David Holland's single-pass version): every view ray is intersected with a
// family of WORLD-ANCHORED planes that contain the sun direction (dot(X, n) = k·gap, n ⊥ sun, facing the
// camera as much as possible). At each crossing the point is tested against three's directional shadow map
// (r170: RGBA-packed depth in a Nearest RGBA target, unpackRGBAToDepth; world→shadow-UV matrix
// engine.sun.shadow.matrix, bound by reference). The lit count is quantised into `levels` HARD steps
// (no dithering, no blur) and screen-blended in the ray colour (sun colour, desaturated, × tint). Because the planes are
// fixed in the world and the camera is texel-snapped, shafts never swim when the camera pans.
//
// Shafts only exist below `top` (world y; the canopy ceiling) and in front of the scene depth; `fade`
// softens the last metres before geometry so rays land on the ground as broad patches instead of lines.
// Air density falls off exponentially above `base` (default target.y - 0.5) with scale `falloff` metres: the
// low air carries the shafts (long golden-hour tree shadows stripe it) and an open sky does not wash the frame.
// mistBoost > 0 makes air below mistTop scatter more (shafts glow brighter where they cross low mist).
// Shafts are cut where they land (so no fragment floats over an occluder): a lit sample counts only if the
// first thing its sun ray hits below it (same shadow-map texel) lies under `land` (world y, default base +
// landAbove 0.8 m), and the camera can see that footprint: not hidden by a surface < landOcc (4.5) m in front of
// it (the sun-facing back of a bush or boulder) and not behind foliage. The terrain is not a shadow caster, so a
// ray with no caster below lands on the terrain: found from the plane y = `ground` (default base - 0.1), then
// re-intersected twice with the height of the ground the camera sees there.
// Over solid non-ground texels (outlined, normal tilted > ~40° from up: rocks, logs, walls, trunks) the
// in-scatter is capped at `solidCap` bands (default 1) so they never turn milky.
// The sun's elevation scales strength, shaft length (top) and fade by es = 1 → elevMin (0.35) between
// elevFade [35°, 70°], and the air density by es² (short high-sun columns stay under the first band, so noon has
// no ghost columns); elevFade: null disables it.
// Options left undefined follow engine.style (applyTimeOfDay) every frame:
//   strength by time of day (golden .35, morning .25, noon .2, night .15 moonbeams), colour from uSunColor.
// Emissive texels (rtScene.a < 0.1, e.g. fireflies) are left untouched. Debug: ?raysDebug=1 (bands) | 2 (raw) |
// -1 (air samples cut by the landing test red, kept green) | -2 (sprite texels classified as foliage: orange).
import * as THREE from 'three';

const TOD_STRENGTH = { golden: 0.35, morning: 0.25, noon: 0.2, night: 0.15 };
const DEFAULTS = {
  gap: 0.25, planes: 72, top: null, topAbove: 7, topFade: 1.5, fade: 2.0, perPlane: null, density: 0.15, levels: 4,
  maxLevel: 1.0, falloff: 2.5, base: null, desat: 0.35, tint: [1.0, 0.9, 1.2], phase: 0.35, mistTop: null, mistDepth: 1.2, mistBoost: 0.0,
  spriteReach: 24, enabled: true, land: null, landAbove: 0.8, landOcc: 4.5, ground: null, solidCap: 1, elevFade: [35, 70], elevMin: 0.35,
};
const MAX_PLANES = 96;
const _white = new THREE.Color(1, 1, 1), _tmpC = new THREE.Color();

export const SUN_LIT_GLSL = /* glsl */`
#include <packing>
uniform sampler2D tShadow; uniform mat4 uShadowMatrix; uniform float uShadowBias, uHasShadow;
uniform float uShadowRange;    // light-space depth range of the shadow camera (far - near, metres)
// 1 if world point wp is lit by the sun (three's directional shadow map, r170 RGBA depth packing).
float sunLit(vec3 wp) {
  if (uHasShadow < 0.5) return 0.0;
  vec4 sc = uShadowMatrix * vec4(wp, 1.0);
  if (any(lessThan(sc.xyz, vec3(0.0))) || any(greaterThan(sc.xyz, vec3(1.0)))) return 0.0;
  return step(sc.z + uShadowBias, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
}
// Like sunLit, and when lit also returns (in land) the world point where this sun ray first hits something
// beyond wp (its "footprint": the ground, or a bush/rock/trunk that stops the shaft). The shadow map stores the
// first occluder along the very same light ray, so one lookup gives both. L = unit vector towards the sun.
float sunLitLand(vec3 wp, vec3 L, out vec3 land) {
  land = wp;
  if (uHasShadow < 0.5) return 0.0;
  vec4 sc = uShadowMatrix * vec4(wp, 1.0);
  if (any(lessThan(sc.xyz, vec3(0.0))) || any(greaterThan(sc.xyz, vec3(1.0)))) return 0.0;
  float zs = unpackRGBAToDepth(texture2D(tShadow, sc.xy));
  if (sc.z + uShadowBias > zs) return 0.0;
  land = wp - L * (zs - sc.z) * uShadowRange;
  return 1.0;
}
`;

// Depth for atmosphere passes. Sprites (grass, leaves: FLAG_NONE, depthWrite off per TECHNIQUES §0.4) leave the
// depth of whatever is BEHIND them in tDepth. For grass that is the ground (fine); for canopy and bush leaves it
// is the ground behind the crown, which would make rays/fog "see through" the leaf fringe (a halo around every
// crown, mist veiling bushes that stand in a hollow). Fix, per FLAG_NONE texel:
//  * classify it: a ground sprite (grass, flowers, reeds) writes the terrain normal at its root, i.e. the normal
//    of the surface behind it (reconstructed here from the depth buffer); a LEAF writes its crown normal, which
//    disagrees with the surface behind it.
//  * leaf: take the nearest depth among the sprite texels within uSpriteReach px (8 directions) that are > 0.2 m
//    nearer than the plane of the surface behind, extrapolated to their offset: its crown/bush core. The leaf then
//    has (about) its own height, so a bush fringe standing in a mist hollow stays clean.
//  * ground sprite: take the nearest-in-depth sprite texel only when it is CLEARLY nearer (> 1 m + the flat-ground
//    depth change over the reach), so grass right behind a bush keeps its own (ground) depth.
// Needs LOWRES_COMMON (+ uniform float uSpriteReach).
export const ATMOS_DEPTH_GLSL = /* glsl */`
uniform float uSpriteReach;
bool isSpriteFlag(float f) { return abs(f - FLAG_NONE) < 0.1; }
// raw-depth slope per texel of the surface behind uv (one-sided, the smaller step: a crown edge doesn't bend it)
vec2 depthSlope(vec2 uv, float d0) {
  vec2 tx = texel();
  float r = rawDepth(uv + vec2(tx.x, 0.0)) - d0, l = d0 - rawDepth(uv - vec2(tx.x, 0.0));
  float u = rawDepth(uv + vec2(0.0, tx.y)) - d0, w = d0 - rawDepth(uv - vec2(0.0, tx.y));
  return vec2(abs(r) < abs(l) ? r : l, abs(u) < abs(w) ? u : w);
}
// a sprite texel over ground-like (up-facing) depth whose normal disagrees with that surface: foliage hanging in
// front of the terrain (an opaque canopy core keeps its own depth: its normal agrees, or it is not ground-like)
bool isLeafSlope(vec2 uv, vec2 g) {
  float range = max(uFar - uNear, 1e-3);
  vec3 nb = normalize(vec3(g * range, uTexelWorld));
  if ((uCamWorld * vec4(nb, 0.0)).y < 0.6) return false;
  return dot(viewNormal(uv), nb) < 0.94;
}
bool isLeafAt(vec2 uv) { return isSpriteFlag(flagAt(uv)) && isLeafSlope(uv, depthSlope(uv, rawDepth(uv))); }
float atmosRawDepth(vec2 uv) {
  float d0 = rawDepth(uv);
  if (uSpriteReach < 1.0 || !isSpriteFlag(flagAt(uv))) return d0;
  vec2 tx = texel();
  float range = max(uFar - uNear, 1e-3);
  vec2 g = depthSlope(uv, d0);
  float gx = g.x, gy = g.y;
  bool leaf = isLeafSlope(uv, g);
  float thr = (leaf ? 0.2 : 1.0 + 2.0 * uSpriteReach * uTexelWorld) / range, best = d0;
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.78539816;
    vec2 dir = vec2(cos(a), sin(a));
    for (int s = 1; s <= 12; s++) {
      float rr = float(s) * 2.0;
      if (rr > uSpriteReach) break;
      vec2 u2 = uv + dir * rr * tx;
      if (!isSpriteFlag(flagAt(u2))) continue;
      float d = rawDepth(u2);
      if (leaf) {
        float pred = d0 + dir.x * rr * gx + dir.y * rr * gy;           // the surface behind, extrapolated
        if (d < min(pred, d0) - thr) best = min(best, d);
      } else if (d < d0 - thr) best = min(best, d);
    }
  }
  return best;
}
float atmosLinDepth(vec2 uv) { return uNear + atmosRawDepth(uv) * (uFar - uNear); }
vec3 atmosWorldPos(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, atmosRawDepth(uv) * 2.0 - 1.0, 1.0);
  return (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
}
`;

/** Uniforms for SUN_LIT_GLSL; call bindShadow(engine, u) once the shadow map exists (e.g. in update()). */
export function shadowUniforms(engine) {
  return {
    tShadow: { value: null }, uShadowMatrix: { value: engine.sun.shadow.matrix },
    uShadowBias: { value: engine.sun.shadow.bias }, uHasShadow: { value: 0 }, uShadowRange: { value: 1 },
  };
}
export function bindShadow(engine, u) {
  const sh = engine.sun.shadow;
  u.tShadow.value = sh.map?.texture ?? null;
  u.uHasShadow.value = sh.map && engine.sun.castShadow ? 1 : 0;
  u.uShadowMatrix.value = sh.matrix;
  u.uShadowBias.value = sh.bias;
  if (u.uShadowRange) u.uShadowRange.value = Math.max(1e-3, sh.camera.far - sh.camera.near);
}

export function addGodrays(engine, opts = {}) {
  const pipeline = engine.pipeline;
  let own = { ...opts };
  const U = {
    ...shadowUniforms(engine),
    uGap: { value: 0.45 }, uTop: { value: 7 }, uTopFade: { value: 1.5 }, uFade: { value: 0.8 }, uPerPlane: { value: 0.07 },
    uLevels: { value: 4 }, uStrength: { value: 0.45 }, uPlanes: { value: 40 }, uPhase: { value: 0.35 },
    uRayColor: { value: new THREE.Color(1, 0.86, 0.72) },
    uMist: { value: new THREE.Vector3(0, 1.2, 0) },           // x top (world y), y depth, z boost
    uDebug: { value: Number(engine.params?.get?.('raysDebug') ?? 0) },  // ?raysDebug=1 bands, 2 raw, -1 cut/kept, -2 leaves
    uMaxLevel: { value: 1 }, uSpriteReach: { value: 24 },
    uFalloff: { value: new THREE.Vector2(0, 2.5) },           // x base y, y height scale (m; 0 = uniform air)
    uLand: { value: 1e6 },                                    // shafts whose sun ray lands above this y are dropped
    uLandOcc: { value: 2.5 },                                 // ... or on a surface hidden by an occluder this close
    uProj: { value: new THREE.Matrix4() }, uGround: { value: 0 },
    uSolidCap: { value: 1 },                                  // max in-scatter (in bands) over solid, non-ground texels
  };
  const pass = pipeline.addPass({
    name: 'godrays', order: 150,
    material: pipeline.makeLowresMaterial({
      uniforms: U,
      defines: { MAX_PLANES },
      fragment: SUN_LIT_GLSL + ATMOS_DEPTH_GLSL + /* glsl */`
        uniform float uGap, uTop, uTopFade, uFade, uPerPlane, uLevels, uStrength, uPhase, uMaxLevel, uLand, uSolidCap;
        uniform int uPlanes, uDebug; uniform vec3 uRayColor, uMist; uniform vec2 uFalloff; uniform float uLandOcc;
        uniform mat4 uProj; uniform float uGround;
        // does the shaft through a lit sample really land somewhere the camera sees? Its footprint must be low
        // (< uLand) and not hidden by a surface within uLandOcc m in front of it (= the object it lands on, e.g.
        // the sun-facing back of a bush or boulder) or by foliage. Footprints hidden by distant foreground objects
        // (and off-screen ones) still count.
        vec2 projUv(vec3 w, out float dist) {
          vec4 vp = uViewMat * vec4(w, 1.0);
          vec4 c = uProj * vp;
          dist = -vp.z;
          return c.xy / c.w * 0.5 + 0.5;
        }
        bool offScreen(vec2 uv) { return any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))); }
        float landOk(vec3 p, vec3 lp, vec3 L) {
          float dist; vec2 uv;
          if (lp.y < uGround) {
            // no shadow caster above the ground (the terrain is not in the shadow map): the shaft lands on the
            // terrain. Start on the plane y = uGround, then twice re-intersect the sun ray with the height of the
            // ground the camera sees there (narrow slit stripes need the real landing, not a plane guess)
            float gy = uGround;
            for (int i = 0; i < 3; i++) {
              lp = p - L * max(p.y - gy, 0.0) / max(L.y, 0.05);
              uv = projUv(lp, dist);
              if (offScreen(uv)) return 1.0;
              float g0 = dist - linDepth(uv);
              if (i == 2 || g0 > 1.0 || g0 < -1.5) break;                // an occluder in front: stop refining
              gy = worldPos(uv).y;
            }
          } else {
            if (lp.y > uLand) return 0.0;
            uv = projUv(lp, dist);
            if (offScreen(uv)) return 1.0;
          }
          if (uLandOcc <= 0.0) return 1.0;
          float gap = dist - linDepth(uv);                            // how far the visible surface is in front
          if (gap > 0.3 && gap < uLandOcc) return 0.0;
          if (isLeafAt(uv)) return 0.0;                             // hidden behind foliage (leaves write no depth)
          return 1.0;
        }
        void main() {
          vec4 col = texture2D(tColor, vUv);
          float rej = 0.0;
          if (uDebug >= 3) { vec3 wp = worldPos(vUv) + vec3(0.0, float(uDebug - 3) * 1.5, 0.0); gl_FragColor = vec4(vec3(sunLit(wp)), 1.0); return; }
          if (uStrength <= 0.0 || uHasShadow < 0.5) { gl_FragColor = col; return; }
          if (texture2D(tScene, vUv).a < 0.1) { gl_FragColor = col; return; }   // emissive particles (rtScene.a = 0)
          vec3 F = normalize(uCameraDir), L = normalize(uSunDir);
          vec3 n = F - dot(F, L) * L; float fl = length(n);          // plane normal ⊥ sun, faces the camera most
          if (fl < 1e-3) { gl_FragColor = col; return; }
          n /= fl;
          vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
          vec3 O = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;          // ortho ray origin on the near plane
          float sceneT = atmosLinDepth(vUv) - uNear;                       // distance to the geometry along F
          float t = max(0.0, (O.y - uTop) / max(-F.y, 1e-3));         // start below the ceiling
          float fn = dot(F, n);                                        // = fl > 0
          float s0 = dot(O + F * t, n);
          t += (ceil(s0 / uGap) * uGap - s0) / fn;                     // first world-anchored plane
          float dt = uGap / fn, acc = 0.0;
          for (int i = 0; i < MAX_PLANES; i++) {
            if (i >= uPlanes || t > sceneT) break;
            vec3 p = O + F * t;
            float w = smoothstep(0.0, uFade, sceneT - t)                 // meet geometry softly (then banded)
                    * smoothstep(uTop, uTop - uTopFade, p.y);               // soft ceiling (no plane-step teeth)
            w *= 1.0 + uMist.z * clamp((uMist.x - p.y) / uMist.y, 0.0, 1.0);  // brighter inside low mist
            if (uFalloff.y > 0.0) w *= exp(-max(p.y - uFalloff.x, 0.0) / uFalloff.y);   // denser air near the ground
            // a lit sample only counts when its shaft reaches the ground: the first thing the sun ray hits below p
            // (same shadow-map texel) must be low. A shaft that ends on a bush top / boulder / trunk side is cut
            // there, so no fragment floats above an occluder without a landing patch.
            vec3 lp; float lit = sunLitLand(p, L, lp);
            if (lit > 0.5) {
              float ok = landOk(p, lp, L); acc += ok * w; rej += (1.0 - ok) * w;
            }
            t += dt;
          }
          // forward scattering: shafts read stronger when looking towards the sun (back-lit scenes)
          float ph = 1.0 + uPhase * dot(F, L);
          float q = floor(min(acc * uPerPlane * ph, uMaxLevel) * uLevels + 1e-4) / uLevels;   // HARD bands
          // opaque solids (outlined: rocks, logs, stone, trunks) that are not ground-like keep their read: at most
          // uSolidCap bands of in-scatter over them (the air in front of a log must not turn it milky)
          float fl0 = flagAt(vUv);
          if (fl0 > FLAG_NONE + 0.1) {
            vec3 wn = normalize((uCamWorld * vec4(viewNormal(vUv), 0.0)).xyz);
            if (wn.y < 0.75) q = min(q, uSolidCap / uLevels);
          }
          if (uDebug == 1) { gl_FragColor = vec4(vec3(q), 1.0); return; }
          if (uDebug == -2) { gl_FragColor = vec4(isLeafAt(vUv) ? 1.0 : 0.0, isSpriteFlag(flagAt(vUv)) ? 0.5 : 0.0, col.b * 0.5, 1.0); return; }
          if (uDebug == -1) { gl_FragColor = vec4(rej * uPerPlane * 0.5, acc * uPerPlane * 0.5, 0.0, 1.0); return; }
          if (uDebug == 2) { gl_FragColor = vec4(vec3(acc * uPerPlane * 0.5), 1.0); return; }
          vec3 ray = uRayColor * q * uStrength;
          col.rgb = 1.0 - (1.0 - min(col.rgb, 1.0)) * (1.0 - ray) + max(col.rgb - 1.0, 0.0);   // screen blend
          gl_FragColor = col;
        }`,
    }),
  });

  const pick = (k) => own[k] ?? DEFAULTS[k];
  const sync = () => {
    bindShadow(engine, U);
    const tod = engine.style?.timeOfDay;
    // high sun: shafts become short vertical columns that read as ghosts over the lit patches, so strength,
    // shaft length (ceiling) and the landing fade shrink as the sun climbs (elevFade [from, to] deg, elevMin)
    const ef = pick('elevFade');
    let es = 1;
    if (ef) {
      const sd = engine.uniforms.uSunDir.value, elev = THREE.MathUtils.radToDeg(Math.asin(Math.min(1, Math.max(-1, sd.y / (sd.length() || 1)))));
      const x = Math.min(1, Math.max(0, (elev - ef[0]) / Math.max(1e-3, ef[1] - ef[0])));
      es = 1 - (1 - pick('elevMin')) * x * x * (3 - 2 * x);
    }
    U.uStrength.value = (own.strength ?? TOD_STRENGTH[tod] ?? 0.35) * es;
    U.uGap.value = pick('gap');
    U.uPlanes.value = Math.min(MAX_PLANES, Math.round(pick('planes')));
    const base = own.base ?? (engine.camera.target.y - 0.5);
    const top = own.top ?? (engine.camera.target.y + pick('topAbove'));
    U.uTop.value = base + (top - base) * es;
    U.uTopFade.value = Math.max(0.01, pick('topFade') * es);
    U.uFade.value = pick('fade') * es;
    U.uLand.value = own.land ?? (base + pick('landAbove'));
    U.uSolidCap.value = pick('solidCap');
    U.uLandOcc.value = pick('landOcc');
    U.uGround.value = own.ground ?? (base - 0.1);
    U.uProj.value.copy(engine.camera.cam.projectionMatrix);
    U.uPerPlane.value = (own.perPlane ?? pick('density') * pick('gap')) * es * es;   // brightness per metre of lit air
    U.uLevels.value = pick('levels');
    U.uPhase.value = pick('phase');
    U.uMaxLevel.value = pick('maxLevel');
    U.uFalloff.value.set(base, pick('falloff'));
    U.uSpriteReach.value = pick('spriteReach');
    // default ray colour: the sun colour pulled towards white (desat) and tinted pink-violet, which matches the
    // measured shafts (#9D9391 / #C5ABAB over haze #5C666B); an explicit `color` is used as is.
    if (own.color !== undefined) U.uRayColor.value.set(own.color);
    else {
      const tint = pick('tint'), k = pick('desat');
      U.uRayColor.value.copy(engine.uniforms.uSunColor.value).lerp(_white, k).multiply(_tmpC.setRGB(tint[0], tint[1], tint[2]));
    }
    const mt = own.mistTop ?? (engine.camera.target.y + 0.8);
    U.uMist.value.set(mt, Math.max(0.05, pick('mistDepth')), pick('mistBoost'));
    pass.enabled = own.enabled ?? true;
  };
  pass.update = sync;
  sync();
  return { pass, uniforms: U, set(o) { own = { ...own, ...o }; sync(); } };
}

// Convenience re-export: fog/mist lives in src/post/fog.js (same owner).
export { addFog } from './fog.js';
