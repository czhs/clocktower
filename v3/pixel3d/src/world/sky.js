// Time-of-day lighting presets (owner: lighting). docs/TECHNIQUES.md §3.7.
//
//   applyTimeOfDay(engine, 'morning'|'noon'|'golden'|'night', {relAz, elev, yaw, shadowExtent, clouds})
//     sets: sun direction (relative to the camera yaw, so presets read the same at any 45° stop),
//     sun colour, the global ramp tints uRampHi/Mid/Sh, band thresholds, the shadow-definition and
//     hemispheric sky terms, the sky clear colour, uShadowColor/uAmbient (for non-toon consumers),
//     shadow-map bias/extent, and publishes engine.style.{outline, grade, fog, timeOfDay} for the post
//     passes (grade.js reads engine.style.grade every frame; outline/fog owners may read theirs).
//   sunDirFor(camYaw, relAzDeg, elevDeg) -> world-space unit vector TOWARDS the sun.
//     relAz: 0 = sun on screen-right, +90 = behind the camera (front-lit), -90 = behind the scene (back-lit).
//   setClouds(engine, {scale, cover, soft, height, wind:[x,z], fringe, strength, fps}) -> tune cloud shadows
//     (0 scale = off). strength 1 (default): full cover reaches the shadow band like a cast shadow, the half step
//     is a ring `fringe` (density units at scale 0.09, default 0.03; scaled with `scale`) wide; strength 0.5 = old-style thin clouds (mid only).
//     fps: drift stepped on the shared animation clock (default 6; -1 = continuous).
//   Per-preset extras (TIME_PRESETS[*]): toneSat / coolAccents / groundLift (uToneShape), penumbra (m, mid step on
//   the lit side of cast-shadow edges on the ground), point {gain, radius, levels} (lanterns), cloudSoft.
//   configureShadows(engine, {extent}) -> shadow extent from the view, biases sized to the shadow texel.
//
// Call AFTER engine.camera.set(...) (the sun is placed relative to the camera yaw at call time).
import * as THREE from 'three';
import { ensureToonUniforms } from '../materials/toon.js';

export function sunDirFor(camYaw, relAzDeg, elevDeg) {
  const R = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));   // PixelCamera right
  const B = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));    // horizontal, toward camera
  const a = THREE.MathUtils.degToRad(relAzDeg), e = THREE.MathUtils.degToRad(elevDeg);
  return R.multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).multiplyScalar(Math.cos(e)).setY(Math.sin(e)).normalize();
}

const C = (r, g, b) => new THREE.Color(r, g, b);

// Ramp tints are linear multipliers on the per-material hi/mid/shadow tones. Day = 1. Golden values are
// the measured ratios (T "Golden hill" ÷ shrine grass); night is a palette swap towards blue.
// bandThr is tuned per sun elevation so FLAT GROUND reads: clear sky -> hi, thin cloud -> mid,
// thick cloud / cast shadow -> shadow  (flat-ground L = sin(elev)).
export const TIME_PRESETS = {
  morning: {
    relAz: 60, elev: 35,
    rampHi: C(1.00, 0.97, 0.92), rampMid: C(0.97, 0.97, 1.00), rampSh: C(0.95, 0.98, 1.08),
    bandThr: [0.08, 0.40], ambShading: 0.2,
    hemiSky: C(1.0, 1.01, 1.04), hemiGround: C(0.86, 0.84, 0.90),
    toneSat: 1, coolAccents: 0, groundLift: 0, penumbra: 0, cloudSoft: 0.0005,
    sky: '#CFE6EC', sun: '#FFE9C8',
    shadowColor: C(0.38, 0.48, 0.80), ambient: C(0.10, 0.12, 0.16),
    outline: { line: C(0.62, 0.62, 0.72), rim: C(1.00, 0.98, 0.90), rimStrength: 1.0 },
    grade: { saturation: 1.04, contrast: 1.0, lift: [0.004, 0.008, 0.016], gain: [1.0, 1.0, 1.0], vignette: 0.10, grain: 0.0 },
    fog: { color: '#CFE6EC' },
  },
  noon: {
    relAz: 25, elev: 52,
    rampHi: C(1, 1, 1), rampMid: C(1, 1, 1), rampSh: C(1, 1, 1),
    bandThr: [0.10, 0.50], ambShading: 0.2,
    hemiSky: C(1, 1, 1), hemiGround: C(0.84, 0.82, 0.88),
    toneSat: 1, coolAccents: 0, groundLift: 0, penumbra: 0, cloudSoft: 0.0005,
    sky: '#BFE0EA', sun: '#FFF6E0',
    shadowColor: C(0.40, 0.49, 0.76), ambient: C(0.10, 0.12, 0.15),
    outline: { line: C(0.62, 0.62, 0.72), rim: C(1.00, 0.98, 0.90), rimStrength: 1.0 },
    grade: { saturation: 1.05, contrast: 1.0, lift: [0.004, 0.008, 0.016], gain: [1.0, 1.0, 1.0], vignette: 0.10, grain: 0.0 },
    fog: { color: '#BFE0EA' },
  },
  golden: {
    relAz: -135, elev: 24,
    // measured on grass: Hi (0.86,0.46,0.18), Mid (1.00,0.43,0.76), Sh (0.87,0.48,0.96). Pure grass ratios turn
    // grey stone pink/magenta, so mid/sh are re-balanced: grass hi ~#B5AB45 (spec #AF993A-#B8B04E), grass mid
    // ~#73883F (spec #75893D), grass sh teal-slate (~#2E4F4E shrine, ~#48676E pond; spec #374B58) instead of
    // indigo, stone mid warm brown, lilac flowers lilac-mauve (not pink). Cyan accents keep their hue (coolAccents:
    // the cube stays cyan instead of teal-green).
    rampHi: C(0.92, 0.58, 0.24), rampMid: C(0.95, 0.66, 0.50), rampSh: C(0.62, 0.56, 0.78),
    bandThr: [0.05, 0.26], ambShading: 0.2,
    hemiSky: C(1.0, 1.0, 1.04), hemiGround: C(0.86, 0.80, 0.86),
    toneSat: 1, coolAccents: 1, groundLift: 0, penumbra: 0.1, cloudSoft: 0.0005,
    sky: '#E8C9A0', sun: '#FFC27A',
    shadowColor: C(0.35, 0.24, 0.73), ambient: C(0.14, 0.09, 0.08),
    outline: { line: C(0.60, 0.52, 0.66), rim: C(1.00, 0.80, 0.55), rimStrength: 1.0 },
    grade: { saturation: 0.95, contrast: 1.02, lift: [0.010, 0.006, 0.016], gain: [1.02, 1.0, 0.97], vignette: 0.12, grain: 0.0 },
    fog: { color: '#C9B9A6' },
  },
  night: {
    relAz: 40, elev: 45,
    // ART_DIRECTION night palette hues, ~30 % darker so lanterns/fireflies carry the frame, with real hi/sh
    // separation (moon-lit ground vs shade, ~5:1): grass ~#597D7D / #355758 / #1D3340. Tones are
    // desaturated first (toneSat) and lilac/blue accents further (coolAccents < 0), so flowers and bluish rock
    // facets fall into the teal-blue night ramp instead of turning electric blue-violet.
    rampHi: C(0.18, 0.30, 0.52), rampMid: C(0.16, 0.27, 0.55), rampSh: C(0.17, 0.24, 0.48),
    bandThr: [0.10, 0.45], ambShading: 0.2,
    hemiSky: C(1.04, 1.08, 1.16), hemiGround: C(0.84, 0.84, 0.92),
    toneSat: 0.6, coolAccents: -0.75, groundLift: 0, penumbra: 0, cloudSoft: 0.0005,
    point: { gain: 0.6, radius: 1.8, levels: 3, warmth: 0.6 },
    sky: '#141B33', sun: '#9FB6E8',
    shadowColor: C(0.10, 0.15, 0.30), ambient: C(0.02, 0.03, 0.06),
    outline: { line: C(0.55, 0.58, 0.75), rim: C(0.70, 0.80, 1.00), rimStrength: 0.6 },
    grade: { saturation: 0.85, contrast: 1.04, lift: [0.002, 0.004, 0.010], gain: [1.0, 1.0, 1.0], vignette: 0.35, grain: 0.035 },
    fog: { color: '#1E2A44' },
  },
};

/** Shadow map sized to the view: one shadow texel <= one screen texel, biases ~1.5 shadow texels. */
export function configureShadows(engine, { extent, mapSize = 4096 } = {}) {
  const vh = engine.camera?.viewHeight ?? 10;
  const ext = extent ?? Math.max(12, Math.min(40, vh * 2.0));
  engine.shadowExtent = ext;
  const sh = engine.sun.shadow;
  // 4096: a ledge shadow on a wall the sun grazes is stretched by 1/N.L; at 2048 its shadow-texel staircase
  // shows as 3-4 px "teeth" under every overhang, at 4096 it stays at ~1-2 px.
  if (sh.mapSize.x !== mapSize) {
    sh.mapSize.set(mapSize, mapSize);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
  const texel = (2 * ext) / sh.mapSize.x;
  ensureToonUniforms(engine).uPenumbra.value.y = texel;   // penumbra offsets are given in metres
  sh.normalBias = 1.5 * texel;     // world units along the normal: kills acne on lit slopes
  sh.bias = -0.00002;              // tiny depth bias (depth range ~ ext*6): ~0.4 shadow texel, no peter-panning
  sh.radius = 0;
  sh.intensity = 1;
  return { extent: ext, texel };
}

/** Cloud shadows (world-space scrolling FBM projected along the sun to a cloud plane). */
export function setClouds(engine, { scale, cover, soft, height, wind, fringe, strength, fps } = {}) {
  const T = ensureToonUniforms(engine);
  const c = T.uCloud.value, k = T.uCloudShape.value;
  if (fringe !== undefined) k.x = Math.max(1e-4, fringe);
  if (strength !== undefined) k.y = Math.max(1e-4, strength);
  if (fps !== undefined) k.z = fps > 0 ? fps : -1;
  if (scale !== undefined) c.x = scale;
  if (cover !== undefined) c.y = cover;
  if (soft !== undefined) c.z = soft;
  if (height !== undefined) c.w = height;
  if (wind) T.uCloudWind.value.set(wind[0], wind[1]);
  return T;
}

export function applyTimeOfDay(engine, name, opts = {}) {
  name = name || 'noon';
  const P = TIME_PRESETS[name];
  if (!P) throw new Error(`applyTimeOfDay: unknown preset '${name}'`);
  const T = ensureToonUniforms(engine);
  const yaw = opts.yaw ?? engine.camera?.yaw ?? Math.PI / 4;
  const dir = sunDirFor(yaw, opts.relAz ?? P.relAz, opts.elev ?? P.elev);
  engine.setSun({ dir, color: new THREE.Color(P.sun), intensity: 1 });

  T.uRampHi.value.copy(P.rampHi);
  T.uRampMid.value.copy(P.rampMid);
  T.uRampSh.value.copy(P.rampSh);
  T.uBandThr.value.set(...P.bandThr);
  T.uAmbShading.value = P.ambShading;
  T.uHemiSky.value.copy(P.hemiSky);
  T.uHemiGround.value.copy(P.hemiGround);
  T.uToneShape.value.set(P.toneSat ?? 1, P.coolAccents ?? 0, P.groundLift ?? 0, 0);
  T.uPenumbra.value.x = P.penumbra ?? 0;
  const pt = { gain: 0.6, radius: 1.8, levels: 3, warmth: 0.6, ...P.point };
  T.uPointShape.value.set(pt.gain, pt.radius, pt.warmth);
  T.uPointLevels.value = pt.levels;
  T.uCloud.value.z = P.cloudSoft ?? 0.003;

  const U = engine.uniforms;
  U.uShadowColor.value.copy(P.shadowColor);
  U.uAmbient.value.copy(P.ambient);
  engine.style.sky.set(P.sky);
  engine.style.timeOfDay = name;
  engine.style.sunColor = new THREE.Color(P.sun);
  engine.style.outline = { ...P.outline };
  engine.style.grade = { ...P.grade };
  engine.style.fog = { color: new THREE.Color(P.fog.color) };

  if (opts.clouds) setClouds(engine, opts.clouds);
  configureShadows(engine, { extent: opts.shadowExtent });
  return { dir, preset: P };
}
