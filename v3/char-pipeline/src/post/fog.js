// Fog + ground mist (owner: atmosphere). docs/TECHNIQUES.md §8.2. Pass 'fog', order 50 (before outlines,
// so the outline pass derives its line colours from the fogged image).
//
//   const f = addFog(engine, {color, mistTop, mistDepth, mistAmount, mistScale, mistDrift, mistCover,
//                             mistShade, mistFps, mistSteps, mistWobble, mistWobbleScale, fogAmount, fogNear,
//                             fogFar, fogNoise, fogAnchor, fogFollow, steps, spriteReach});
//   f.set({...}) changes options later; f.pass is the pipeline pass.
//
// Two terms, each quantised to HARD levels (no gradients, no dithering), then max-combined:
//  * mist: below mistTop (world y), thickening over mistDepth metres, broken into drifting world-space FBM
//    pools (mistCover = fraction of the ground under mist, mistScale = 1/m, drift in m/s along +x/+z). It is
//    quantised RELATIVE to mistAmount into up to `mistSteps` (3) levels (≥ 0.06 apart), so a hollow fills in
//    stepped layers that follow the terrain height (thin at the rim, thickest at the bottom) instead of one flat
//    disc. The mist surface itself wobbles by ±mistWobble·mistDepth (world FBM, 1/mistWobbleScale m features), so
//    its contour on a polygonal terrain is organic rather than a run of straight triangle edges. Every texel is
//    tested at its OWN height: leaves/bush fringes take their crown's depth (ATMOS_DEPTH_GLSL), so a bush
//    standing in a hollow is not veiled. Mist in cast shadow is tinted by uShadowColor (mistShade 0..1).
//  * distance fog: by depth along the view direction BEHIND a world anchor (fogAnchor, default the camera target
//    at creation), fogNear..fogFar metres, in `steps` levels, so the subject stays clean and only the far
//    background lifts toward the fog colour. The anchor is fixed in the world, so the fog steps stay glued to
//    the ground while the camera pans (whole-texel pans change no fog pixel); it only follows the camera target
//    once that is more than fogFollow metres (6) away (dead zone; Infinity pins it). fogNoise (m) jitters the
//    distance in world space so the steps meander.
// The world-space noise is evaluated per texel at the texel's world position, so the mist pattern is
// glued to the world (no swimming when the camera pans). Background (sky) pixels are skipped.
// Options left undefined follow engine.style.fog.color (applyTimeOfDay) every frame.
import * as THREE from 'three';
import { NOISE_GLSL } from '../materials/toon.js';
import { ATMOS_DEPTH_GLSL, SUN_LIT_GLSL, shadowUniforms, bindShadow } from './godrays.js';

const DEFAULTS = {
  color: null, mistTop: null, mistAbove: 0.8, mistDepth: 0.8, mistAmount: 0.0, mistScale: 0.12,
  mistDrift: [0.03, 0.0], mistCover: 0.5, fogAmount: 0.0, fogNear: 2.0, fogFar: 14.0, steps: 4, spriteReach: 24, mistShade: 0.6, mistFps: 4, fogNoise: 1.2,
  mistSteps: 3, mistWobble: 0.2, mistWobbleScale: 0.8, fogAnchor: null, fogFollow: 6, enabled: true,
};

export function addFog(engine, opts = {}) {
  const pipeline = engine.pipeline;
  let own = { ...opts };
  const U = {
    uFogColor: { value: new THREE.Color(0.79, 0.73, 0.65) },
    uMistP: { value: new THREE.Vector4(0.8, 0.8, 0.0, 0.12) },   // top, depth, amount, scale
    uMistDrift: { value: new THREE.Vector2(0.03, 0) },
    uMistCover: { value: 0.5 },
    uFogP: { value: new THREE.Vector4(2, 14, 0, 0) },             // near, far, amount, focus depth
    uSteps: { value: 4 },
    uSpriteReach: { value: 24 }, uMistFps: { value: 4 }, uFogNoise: { value: 1.2 },
    uMistQ: { value: new THREE.Vector3(3, 0.2, 0.8) },          // mist levels, wobble (× depth), wobble freq (1/m)
    ...shadowUniforms(engine), uMistShade: { value: 0.6 }, uShadowTint: engine.uniforms.uShadowColor,
  };
  const pass = pipeline.addPass({
    name: 'fog', order: 50,
    material: pipeline.makeLowresMaterial({
      uniforms: U,
      fragment: NOISE_GLSL + ATMOS_DEPTH_GLSL + SUN_LIT_GLSL + /* glsl */`
        uniform vec3 uFogColor; uniform vec4 uMistP, uFogP; uniform vec2 uMistDrift;
        uniform float uMistCover, uSteps, uMistShade, uMistFps, uFogNoise; uniform vec3 uShadowTint, uMistQ;
        void main() {
          vec4 col = texture2D(tColor, vUv);
          if (isBackground(vUv) || texture2D(tScene, vUv).a < 0.1) { gl_FragColor = col; return; }   // sky / emissive
          vec3 wp = atmosWorldPos(vUv);          // sprite-aware (leaf fringes take the canopy depth)
          float d = atmosLinDepth(vUv);
          float tq = floor(uTime * uMistFps) / uMistFps;                 // drift stepped at a low fps
          // the mist surface wobbles in world space (organic contour on the polygonal terrain)
          float wob = (fbm(wp.xz * uMistQ.z + uMistDrift * tq * 2.0 + 3.7) - 0.5) * 2.0 * uMistQ.y * uMistP.y;
          float h = clamp((uMistP.x + wob - wp.y) / max(uMistP.y, 1e-3), 0.0, 1.0);
          float c0 = 1.0 - uMistCover;
          float pool = smoothstep(c0 - 0.2, c0 + 0.2, fbm(wp.xz * uMistP.w + uMistDrift * tq));
          // stepped layers relative to the amount (thin rim, thicker core)
          float mist = uMistP.z * floor(h * pool * uMistQ.x + 0.25) / uMistQ.x;
          // world-space jitter of the fog distance so the hard fog steps meander instead of ruling straight
          // horizontal lines across flat ground
          float jit = (fbm(wp.xz * 0.35 + 7.3) - 0.5) * 2.0 * uFogNoise;
          float dist = smoothstep(uFogP.x, uFogP.y, d - uFogP.w + jit) * uFogP.z;
          dist = floor(dist * uSteps + 0.25) / uSteps;                  // hard steps (a bit generous on step 1)
          float f = max(mist, dist);
          // mist is lit like the world: in the sun it keeps the fog colour, in cast shadow it takes the cool
          // shadow tint (sampled a little above the surface, so the mist edge follows the shadow edge)
          vec3 fc = uFogColor;
          if (uMistShade > 0.0 && mist >= dist) {
            float lit = sunLit(wp + vec3(0.0, 0.15, 0.0));
            fc = mix(uFogColor, uFogColor * uShadowTint, uMistShade * (1.0 - lit));
          }
          col.rgb = mix(col.rgb, fc, clamp(f, 0.0, 1.0));
          gl_FragColor = col;
        }`,
    }),
  });

  const pick = (k) => own[k] ?? DEFAULTS[k];
  const tmp = new THREE.Vector3();
  const anchor = engine.camera.target.clone();    // distance-fog anchor (world), see the header
  const toV3 = (a) => (a?.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
  const sync = () => {
    const c = own.color ?? engine.style?.fog?.color ?? null;
    if (c !== null && c !== undefined) U.uFogColor.value.set(c);
    const tgt = engine.camera.target;
    U.uMistP.value.set(own.mistTop ?? (tgt.y + pick('mistAbove')), pick('mistDepth'), pick('mistAmount'), pick('mistScale'));
    const dr = pick('mistDrift');
    U.uMistDrift.value.set(dr[0], dr[1]);
    U.uMistCover.value = pick('mistCover');
    const amt = pick('mistAmount');
    U.uMistQ.value.set(Math.max(1, Math.min(pick('mistSteps'), Math.floor(amt / 0.06))), pick('mistWobble'), pick('mistWobbleScale'));
    // focus = linear depth of the world anchor (distance along the view direction from the camera): the fog
    // distance d - focus = dot(wp - anchor, viewDir) is then a function of the world point only
    if (own.fogAnchor) anchor.copy(toV3(own.fogAnchor));
    const follow = pick('fogFollow');
    const dx = tgt.x - anchor.x, dz = tgt.z - anchor.z, dl = Math.hypot(dx, dz);
    if (dl > follow) { const k = 1 - follow / dl; anchor.x += dx * k; anchor.z += dz * k; }
    const cam = engine.camera.cam;
    cam.getWorldDirection(tmp);
    const focus = anchor.clone().sub(cam.position).dot(tmp);
    U.uFogP.value.set(pick('fogNear'), pick('fogFar'), pick('fogAmount'), focus);
    U.uSteps.value = pick('steps');
    U.uSpriteReach.value = pick('spriteReach');
    U.uMistShade.value = pick('mistShade');
    U.uMistFps.value = Math.max(0.1, pick('mistFps'));
    U.uFogNoise.value = pick('fogNoise');
    bindShadow(engine, U);
    pass.enabled = own.enabled ?? true;
  };
  pass.update = sync;
  sync();
  return { pass, uniforms: U, set(o) { own = { ...own, ...o }; sync(); } };
}
