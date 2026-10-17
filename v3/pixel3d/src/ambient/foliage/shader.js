// Foliage material GLSL (owner: foliage). One toon material draws every foliage instance: grass tufts, tall grass,
// flowers, reeds, bush leaf clusters, bush cores, bush ground shadows and wind-blown flakes (leaves / petals).
// The vertex shader picks each sprite's drawing (atlas row) from
//   1. the WIND: a travelling sway wave + gust fronts (uGust), on a 5 fps clock with a per-instance tick phase,
//   2. the WALKERS: a trail texture (tTrail) of every actor's position at the last S ambient-grid ticks. The most
//      recent tick a walker touched the sprite (its "age") selects push -> spring-back drawings; nothing is stored
//      per sprite, so the reaction is a pure function of t and costs no CPU per tuft,
//   3. the BUSH rustle state (uBush: ticks since a walker brushed bush g, push side),
//   4. a CPU override (aDyn.x) for flakes.
// Every clock is a multiple of the 15 Hz ambient grid (uGTick = grid tick index).
import { NOISE_GLSL } from '../../materials/toon.js';
import { FLOWER_LIGHT_GLSL } from '../../world/flowers.js';
import { FR } from './atlas.js';

export const KIND = { TUFT: 0, TALL: 1, FLOWER: 2, REED: 3, LEAF: 4, CORE: 5, SHADOW: 6, FLAKE: 7 };
export const MAX_ACTORS = 8, TRAIL_S = 20, MAX_BUSH = 8;

const F = (n) => `${n}.0`;

export const VERTEX_HEAD = /* glsl */`
  attribute vec3 aBase, aBaseN, aTint;
  attribute vec4 aVar;    // x atlas column, y kind, z phase 0..1, w group (bush index + 1) | accent flag (tufts)
  attribute vec2 aDyn;    // x drawing override (flakes, -1 = shader), y visible
  attribute vec2 aShape;  // procedural size: core (w, h texels), shadow (rx, rz metres)
  uniform sampler2D tTrail; uniform vec4 uTrailInfo; uniform vec4 uTrailBox;
  uniform vec2 uFolGrid; uniform vec2 uFolCell; uniform float uGTick;
  uniform vec2 uWindDir; uniform float uWindSx; uniform vec4 uWind; uniform vec4 uGust[3];
  uniform vec4 uBush[${MAX_BUSH}]; uniform vec2 uCamRight; uniform vec2 uShadowOff; uniform vec2 uGustBand;
  varying vec2 vFUv; varying vec3 vFTint; varying float vFKind; varying vec2 vFLocal; varying float vFAcc; varying float vFGust;
  ${NOISE_GLSL}
  float folEnv(float tau) {
    return tau < 0.0 ? 0.0 : tau < 0.4 ? tau / 0.4 : tau < 1.6 ? 1.0 : max(0.0, 1.0 - (tau - 1.6) / 1.6);
  }
  float folGust(vec2 p, float t) {
    float s = dot(p, uWindDir), g = 0.0;
    for (int j = 0; j < 3; j++) { vec4 G = uGust[j]; g = max(g, G.y * folEnv(t - (G.x + s / G.z))); }
    return g;
  }
  // gust FRONT: a uGustBand.x metre band at the leading edge of each gust, on the exact 15 Hz tick (no per-sprite
  // phase): at 6 m/s it advances 0.4 m per tick, so every sprite holds the laid-over drawing ~3 ticks and the band
  // crosses the field (and every patch, front to back) instead of whole patches flipping on one beat
  float folFront(vec2 p, float t) {
    float s = dot(p, uWindDir), g = 0.0;
    for (int j = 0; j < 3; j++) {
      vec4 G = uGust[j];
      float tau = t - (G.x + s / G.z);
      if (G.y >= uGustBand.y && tau >= 0.0 && tau < uGustBand.x / G.z) g = max(g, G.y);
    }
    return g;
  }
  // signed sway level -> drawing: 0 rest, 1 S1, 2 S2, 3 P2, 4 P3 (mirrored set for negative levels)
  float folSway(float lvl) {
    float a = abs(lvl);
    if (a < 0.5) return ${F(FR.REST)};
    bool pos = lvl > 0.0;
    if (a < 1.5) return pos ? ${F(FR.S1)} : ${F(FR.SM1)};
    if (a < 2.5) return pos ? ${F(FR.S2)} : ${F(FR.SM2)};
    if (a < 3.5) return pos ? ${F(FR.P2)} : ${F(FR.PM2)};
    return pos ? ${F(FR.P3)} : ${F(FR.PM3)};
  }`;

export const VERTEX = /* glsl */`
  float fKindV = aVar.y;
  vec2 folOff = vec2(0.0);
  float folFrame = 0.0;
  vFKind = fKindV; vFTint = aTint; vFAcc = 0.0; vFGust = 0.0;
  vFLocal = vec2(position.x * 2.0, position.y * 2.0 - 1.0);
  if (fKindV > ${F(KIND.SHADOW)} - 0.5 && fKindV < ${F(KIND.SHADOW)} + 0.5) {
    // ground shadow: a world-space ground quad (not a billboard), offset away from the sun
    transformed = aBase + vec3(uShadowOff.x + vFLocal.x * aShape.x, 0.03, uShadowOff.y + vFLocal.y * aShape.y);
  } else if (fKindV > ${F(KIND.FLAKE)} - 0.5) {
    folFrame = aDyn.x;
  } else if (fKindV < ${F(KIND.CORE)} - 0.5) {
    // ---- wind: 5 fps clock (k = 3 ticks) with a per-instance tick phase; gusts evaluated at the stepped time
    float ph = floor(aVar.z * 3.0);
    float tq = (floor((uGTick + ph) / 3.0) * 3.0 - ph) / 15.0;
    float flex = fKindV < 0.5 ? 1.0 : fKindV < 1.5 ? 1.35 : fKindV < 2.5 ? 1.1 : fKindV < 3.5 ? 1.6 : 0.7;
    float maxL = fKindV < 0.5 ? 2.0 : fKindV < 1.5 ? 3.0 : fKindV < 2.5 ? 2.0 : fKindV < 3.5 ? 4.0 : 1.0;
    float wv = dot(aBase.xz, uWindDir) * uWind.y - tq * uWind.z + (vnoise(aBase.xz * 0.45) - 0.5) * 2.2 + aVar.z * 0.7;
    float s01 = 0.5 + 0.5 * sin(wv);
    float gust = folGust(aBase.xz, tq);
    float amp = uWind.x * (0.55 + 0.9 * vnoise(aBase.xz * 0.07 - uWindDir * tq * 0.35)) + gust * uWind.w;
    float lvl = min(floor(s01 * amp * 2.4 * flex), maxL);
    folFrame = folSway(lvl * uWindSx);
    if (fKindV > 1.5 && fKindV < 2.5) {
      // flower BOB: whole blossoms nod one texel down for 2 of every 4 sway beats (5 fps); the beat is offset per
      // clump (aVar.w = clump + 1) and runs through a clump along the wind, so neighbouring clumps bob out of phase
      float bt = floor((uGTick + ph) / 3.0) + floor(hash12(vec2(aVar.w * 7.31, 3.7)) * 4.0) + floor(dot(aBase.xz, uWindDir) * 3.0);
      if (mod(bt, 4.0) < 2.0 && abs(lvl) < 1.5) folFrame = lvl * uWindSx > 0.5 ? ${F(FR.D1)} : lvl * uWindSx < -0.5 ? ${F(FR.DM1)} : ${F(FR.D0)};
    }
    if (fKindV < ${F(KIND.LEAF)} - 0.5) {
      float front = folFront(aBase.xz, uGTick / 15.0);
      if (front > 0.0) {
        folFrame = uWindSx > 0.0 ? ${F(FR.P2)} : ${F(FR.PM2)};                 // laid over: tips 2-5 px downwind
        vFGust = fKindV < 0.5 ? 1.0 : 0.0;                                       // short tufts also change value
      }
      vFAcc = fKindV < 0.5 ? step(0.5, aVar.w) : 0.0;
      // ---- walkers: most recent trail tick that touched this sprite
      float bestAge = 99.0, deep = 9.0, side = 1.0;
      if (aBase.x > uTrailBox.x && aBase.x < uTrailBox.z && aBase.z > uTrailBox.y && aBase.z < uTrailBox.w) {
        float reach = fKindV < 0.5 ? 1.0 : fKindV < 1.5 ? 1.12 : fKindV < 2.5 ? 1.0 : 1.18;
        int NS = int(uTrailInfo.x), NA = int(uTrailInfo.y);
        for (int a = 0; a < ${MAX_ACTORS}; a++) {
          if (a >= NA) break;
          for (int i = 0; i < ${TRAIL_S}; i++) {
            if (i >= NS) break;
            vec4 P = texelFetch(tTrail, ivec2(i, a * 2), 0);
            if (P.w <= 0.0) break;
            vec2 dv = aBase.xz - P.xy;
            float d = length(dv), r = P.w * reach;
            if (d < r) {
              if (P.z < (fKindV > 0.5 && fKindV < 1.5 ? 3.5 : 2.5)) deep = min(deep, d / r);
              if (P.z < bestAge - 0.5) {
                bestAge = P.z;
                vec4 V = texelFetch(tTrail, ivec2(i, a * 2 + 1), 0);
                float sx = dot(dv, uCamRight), vx = dot(V.xy, uCamRight);
                side = abs(sx) > 0.1 ? sign(sx) : (abs(vx) > 0.3 ? sign(vx) : (aVar.z > 0.5 ? 1.0 : -1.0));
              }
            }
          }
        }
      }
      // push -> spring back, stepped every 3 ticks (5 fps): trodden / pushed hard, pushed, half up, overshoot
      // tall grass recovers slower (4-tick = 3.75 fps beats over the whole 20-tick trail): the trodden channel lingers
      if (fKindV > 0.5 && fKindV < 1.5) bestAge = floor((bestAge + 1.0) * 0.75);
      if (bestAge < 2.5) folFrame = deep < 0.5 ? ${F(FR.FLAT)} : (side > 0.0 ? ${F(FR.P3)} : ${F(FR.PM3)});
      else if (bestAge < 5.5) folFrame = side > 0.0 ? ${F(FR.P3)} : ${F(FR.PM3)};
      else if (bestAge < 8.5) folFrame = side > 0.0 ? ${F(FR.P2)} : ${F(FR.PM2)};
      else if (bestAge < 11.5) folFrame = side > 0.0 ? ${F(FR.S1)} : ${F(FR.SM1)};
      else if (bestAge < 14.5) folFrame = side > 0.0 ? ${F(FR.SM1)} : ${F(FR.S1)};
    } else {
      // ---- bush leaves: rustle when the bush is brushed (uBush: ticks since, push side)
      int g = int(aVar.w + 0.5) - 1;
      if (g >= 0 && g < ${MAX_BUSH}) {
        vec4 B = uBush[g];
        if (B.x >= 0.0 && B.x < 14.5) {
          float st = floor(B.x / 2.0);                                  // rustle step: 7.5 fps
          float h1 = hash12(vec2(aVar.z * 977.0, st * 7.0 + 1.0)), h2 = hash12(vec2(aVar.z * 613.0 + 5.0, st * 3.0 + 2.0));
          if (B.x < 3.5) { folOff.x = B.y * (h1 < 0.65 ? 1.0 : 2.0); folFrame = B.y > 0.0 ? ${F(FR.S2)} : ${F(FR.SM2)}; }
          else if (B.x < 9.5) {
            folOff = vec2(floor(h1 * 3.0) - 1.0, h2 < 0.35 ? 1.0 : 0.0);
            folFrame = h2 < 0.25 ? ${F(FR.S1)} : h2 < 0.5 ? ${F(FR.SM1)} : h2 < 0.75 ? ${F(FR.S2)} : ${F(FR.SM2)};
          } else folFrame = h1 < 0.5 ? ${F(FR.S1)} : ${F(FR.SM1)};
        }
      }
    }
  } else {
    // bush core: shoved one texel by the first beat of a rustle
    int g = int(aVar.w + 0.5) - 1;
    if (g >= 0 && g < ${MAX_BUSH} && uBush[g].x >= 0.0 && uBush[g].x < 3.5) folOff.x = uBush[g].y;
  }
  vFUv = (uv + vec2(aVar.x, folFrame)) / uFolGrid;`;

export const VIEW_VERTEX = /* glsl */`
  if (aDyn.y < 0.5) {
    mvPosition = vec4(0.0, 0.0, 1.0e5, 1.0);                       // hidden (behind the camera: clipped)
  } else if (fKindV < ${F(KIND.SHADOW)} - 0.5 || fKindV > ${F(KIND.SHADOW)} + 0.5) {
    vec4 b = viewMatrix * vec4(aBase, 1.0);
    b.xy = floor(b.xy / uTexelWorld + 0.5) * uTexelWorld + folOff * uTexelWorld;   // root on a texel corner
    if (fKindV > ${F(KIND.CORE)} - 0.5 && fKindV < ${F(KIND.CORE)} + 0.5) {
      b.z += 0.02;
      mvPosition = b + vec4(position.x * aShape.x, (position.y - 0.5) * aShape.y, 0.0, 0.0) * uTexelWorld;
    } else {
      // flakes only clear the ground (0.08 m): a prop in front of a flake hides it (no leaf painted on a plinth face)
      b.z += fKindV > ${F(KIND.FLAKE)} - 0.5 ? 0.08 : fKindV > ${F(KIND.LEAF)} - 0.5 ? 0.12 : 0.05 + vFAcc * 0.1;
      mvPosition = b + vec4(position.xy * uFolCell * uTexelWorld, 0.0, 0.0);      // 1 sprite texel = 1 screen texel
    }
  } else {
    mvPosition.z += 0.03;
  }`;

export const FRAGMENT_HEAD = /* glsl */`
  uniform sampler2D tFolAtlas; uniform float uFolDebug;
  varying vec2 vFUv; varying vec3 vFTint; varying float vFKind; varying vec2 vFLocal; varying float vFAcc; varying float vFGust;
  uniform float uFolNight;
  ${FLOWER_LIGHT_GLSL}
  // jagged blob edge: radius per 16 angular sectors (pixel-art lumps, not a smooth circle)
  float folBlob(vec2 q, float seed) {
    float a = atan(q.y, q.x) / 6.2831853 + 0.5;
    float k = floor(a * 16.0);
    float e = 0.86 + 0.14 * fract(sin(k * 12.9898 + seed * 78.233) * 43758.5453);
    return dot(q, q) - e * e;
  }`;

export const ALBEDO = /* glsl */`
  vec4 gA = vec4(1.0);
  float fKind = vFKind;
  if (fKind > ${F(KIND.CORE)} - 0.5 && fKind < ${F(KIND.SHADOW)} + 0.5) {
    if (folBlob(vFLocal, fKind) > 0.0) discard;
  } else {
    gA = texture2D(tFolAtlas, vFUv);
    if (gA.a < 0.5) discard;
  }
  float fCls = gA.r;     // 1 body, .63 tip, .38 base, 0 blossom`;

export const TONES = /* glsl */`
  bool fBloom = fCls < 0.2;
  if (fBloom && ((fKind > 1.5 && fKind < 2.5) || fKind > 6.5)) {
    // flower blossom / petal: "bumped a cut" (stays bright in shade), lilac kept lilac under warm light
    vec3 tint = gA.g > 0.75 ? vFTint : min(vFTint * 1.22 + 0.03, vec3(1.0));
    toonHi = tint; toonMid = tint; toonSh = tint * 0.85;
    toonHi = flowerTone(toonHi, vFTint, uRampHi, true);
    toonMid = flowerTone(toonMid, vFTint, uRampMid, false);
  } else if (fBloom) {
    // cattail head: its own 3 tones
    vec3 tint = gA.g > 0.75 ? vFTint : min(vFTint * 1.25 + 0.02, vec3(1.0));
    toonHi = tint * 1.18; toonMid = tint; toonSh = tint * vec3(0.62, 0.6, 0.72);
  } else if (fCls > 0.5 && fCls < 0.8 && (fKind > 3.5 && fKind < 4.5 || fKind > 6.5 || fKind > 0.5 && fKind < 1.5)) {
    toonHi = vFTint;     // sun tips of leaf clusters / leaf flakes / tall grass (tall: the ground's own hi tone)
  } else if (fCls > 0.3 && fCls < 0.5 && fKind > 0.5 && fKind < 2.5) {
    toonSh *= fKind > 1.5 ? vec3(0.58, 0.66, 0.72) : vec3(0.68, 0.76, 0.8);   // tall-grass mass / flower stems + rosette in shade: one step below the shade band
  }
  if (uFolDebug > 0.5) {   // ?fdebug=kinds: flat colour per kind (tuft, tall, flower, reed, leaf, core, shadow, flake)
    vec3 kc[8] = vec3[8](vec3(0.2, 0.6, 0.2), vec3(0.9, 0.9, 0.1), vec3(0.9, 0.2, 0.9), vec3(0.1, 0.8, 0.9), vec3(0.1, 0.3, 0.9), vec3(0.9, 0.1, 0.1), vec3(0.05), vec3(1.0, 0.5, 0.0));
    vec3 c = kc[int(fKind + 0.5)] * (fCls > 0.3 && fCls < 0.5 ? 0.6 : 1.0);
    toonHi = toonMid = toonSh = c;
  }`;

export const LIGHT_MOD = /* glsl */`
  {
    float fb = toonL < uBandThr.x ? 0.0 : (toonL < uBandThr.y ? 1.0 : 2.0);
    float nb = fb;
    if (fKind > ${F(KIND.CORE)} - 0.5 && fKind < ${F(KIND.SHADOW)} + 0.5) nb = 0.0;          // core, ground shadow
    else if (fCls > 0.3 && fCls < 0.5) nb = max(fb - 1.0, 0.0);                                 // BASE: self-shadow
    else if (fCls > 0.5 && fCls < 0.8 && fKind > 0.5 && fKind < 1.5)                            // tall-grass tips: a band up
      nb = uFolNight > 0.5 ? min(fb + 1.0, 1.0) : (fb > 0.5 ? min(fb + 1.0, 2.0) : fb);    //   not in the shade band; night <= mid
    else if (fCls > 0.8 && fKind > 0.5 && fKind < 1.5) nb = fb > 1.5 ? 1.0 : fb;               // tall blades in sun: mid (the stand reads)
    else if (fKind < 0.5 && vFGust > 0.5) nb = fb > 1.5 ? 1.0 : fb + 1.0;                        // gust front: laid-over tufts flip a band
    else if (fKind > 6.5 && fCls > 0.2) nb = min(fb + 1.0, 2.0);                                 // leaf flakes: a band up (read on any ground)
    else if (fKind < 0.5 && vFAcc > 0.5 && toonShadow * toonCloud > 0.5) nb = min(fb + 1.0, 2.0); // accent tuft, lit
    if (nb != fb) toonL = nb < 0.5 ? uBandThr.x * 0.5 : (nb < 1.5 ? (uBandThr.x + uBandThr.y) * 0.5 : max(uBandThr.y + 0.3, toonL));
  }`;
