// v3 WP2 (v3-avatars). The avatar material wrapper (docs/v3/INTEGRATION.md §4 "Ghosts", 'tint' mode): added to
// every avatar material at BUILD time, so death / revival / a stand-in colour only change uniforms and never
// recompile a program (programs stay constant; §7).
//
//   uCtGhost = (k, alpha, fade, flat) k 0..1 pale ghost ramp; alpha < 1 = an ordered (4x4 Bayer) dither on
//                                 the low-res texel grid, i.e. pixel-art translucency without sorting or a
//                                 `transparent` flag (which would change the program: three's OPAQUE define);
//                                 fade 0..1 = the same dither for the 120 ms teleport cross-fade (1 = opaque);
//                                 flat 1 = a flat sprite (billboard): the talking rim lifts the whole sprite
//   uCtTint  = (r, g, b, k)       stand-in colour (the member's pin colour), k 0..1
//   uCtRim   = (r, g, b, k)       talking rim (§3 "Talking outline" interim, WP4's request): an additive
//                                 emissive band on the silhouette (view-space normal facing sideways, |n.z| < 0.65;
//                                 the pixel camera is orthographic, so view dir = +Z) plus a flat 0.15 lift of
//                                 the whole figure (a thin edge alone sat under the outline pass and could not be
//                                 seen), k 0..1; 0 = off. Billboards: a flat 0.3 lift.
//
// Hook: the toon shader's `#include <opaque_fragment>` (after lighting, in the COLOUR pass only; the normal pass
// returned earlier, so outlines keep the whole silhouette, like the vendor's own shared-ghost dither). The
// wrapper chains the material's own onBeforeCompile (toon / look.js) and appends '|ct-tint2' to its program
// cache key, so every avatar of one vendor program key still shares one program.
import * as THREE from 'three';

export interface TintUniforms {
  uCtGhost: { value: THREE.Vector4 };
  uCtTint: { value: THREE.Vector4 };
  uCtRim: { value: THREE.Vector4 };
}

/** `flat` = a billboard (no silhouette normals: the rim lifts the whole sprite instead). */
export function createTintUniforms(flat = false): TintUniforms {
  return {
    uCtGhost: { value: new THREE.Vector4(0, 1, 1, flat ? 1 : 0) },
    uCtTint: { value: new THREE.Vector4(1, 1, 1, 0) },
    uCtRim: { value: new THREE.Vector4(1, 1, 1, 0) },
  };
}

/** Default talking rim colour (warm candle white, reads on day and night ramps). */
export const RIM_DEFAULT = '#ffe2a0';
/** Rim strength while talking. */
export const RIM_K = 1;
/** Flat lift of the whole rig while talking (× RIM_K), on top of the silhouette band. (v3.1 QA C2: 0.15 -> 0.06, the
 *  speaker washed out to flat grey; the band also got thinner and weaker: RIM_EDGE / RIM_BAND.) */
export const RIM_FLAT = 0.06;
/** The silhouette band: where 1 - |n.z| >= RIM_EDGE (was 0.35, most of a rounded body), adding RIM_BAND (was 0.85). */
export const RIM_EDGE = 0.6;
export const RIM_BAND = 0.44;
/** The whole-sprite lift of a flat billboard while talking (was 0.3: the cream bleached the whole low-tier figure). */
export const RIM_BILLBOARD = 0.12;

/** Talking rim on (CSS hex, default RIM_DEFAULT) or off (null). Uniforms only. */
export function setRim(u: TintUniforms, hex: string | null, k = RIM_K): void {
  if (!hex) {
    u.uCtRim.value.w = 0;
    return;
  }
  const c = new THREE.Color(hex);
  u.uCtRim.value.set(c.r, c.g, c.b, k);
}

/** Ghost look strength: 0 living, 1 = 'tint' ghosts (alpha 0.6), 0.5 = the 'clips' overlay (alpha 0.8). */
export function setGhostTint(u: TintUniforms, k: number): void {
  const kk = Math.max(0, Math.min(1, k));
  u.uCtGhost.value.x = kk;
  u.uCtGhost.value.y = 1 - 0.4 * kk;
}

/** Teleport cross-fade: 0 invisible .. 1 opaque (dithered in between). */
export function setFade(u: TintUniforms, a: number): void {
  u.uCtGhost.value.z = Math.max(0, Math.min(1, a));
}

/** Stand-in colour (CSS hex) at strength k, or off. */
export function setColourTint(u: TintUniforms, hex: string | null, k = 0.55): void {
  if (!hex) {
    u.uCtTint.value.w = 0;
    return;
  }
  const c = new THREE.Color(hex);
  u.uCtTint.value.set(c.r, c.g, c.b, k);
}

export const TINT_GLSL_HEAD = /* glsl */ `
uniform vec4 uCtGhost;
uniform vec4 uCtTint;
uniform vec4 uCtRim;
float ctBayer4(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}`;

export const TINT_GLSL_BODY = /* glsl */ `
  if (uCtTint.w > 0.0) {
    float ctL = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    outgoingLight = mix(outgoingLight, uCtTint.rgb * (0.35 + 1.1 * ctL), uCtTint.w);
  }
  if (uCtGhost.x > 0.0) {
    float ctG = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    vec3 ctPale = mix(vec3(0.40, 0.46, 0.62), vec3(0.86, 0.92, 1.0), clamp(ctG * 1.6, 0.0, 1.0));
    outgoingLight = mix(outgoingLight, ctPale, uCtGhost.x);
    if (ctBayer4(gl_FragCoord.xy) >= uCtGhost.y) discard;
  }
  if (uCtRim.w > 0.0) {
    float ctE = uCtGhost.w > 0.5 ? ${RIM_BILLBOARD.toFixed(2)} : ${RIM_FLAT.toFixed(2)} + ${RIM_BAND.toFixed(2)} * step(${RIM_EDGE.toFixed(2)}, 1.0 - abs(normalize(normal).z));
    outgoingLight += uCtRim.rgb * (ctE * uCtRim.w);
  }
  if (uCtGhost.z < 0.999 && ctBayer4(gl_FragCoord.xy) >= uCtGhost.z) discard;
`;

const ANCHOR = '#include <opaque_fragment>';
const KEY = '|ct-tint2';

type Compile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;
interface Tinted {
  __ctTint?: TintUniforms;
}

/**
 * Wrap one material (idempotent). Returns false when it is not a toon-family material (no hook to chain); such
 * materials (vendor FX motes, smears) are left alone. Must run before the material's first compile.
 */
export function patchTint(mat: THREE.Material, u: TintUniforms): boolean {
  const m = mat as THREE.Material & Tinted;
  if (m.__ctTint) {
    m.__ctTint = u; // a re-patch only rebinds (the shader reads the uniforms object captured below)
    return true;
  }
  const ud = mat.userData as { toon?: unknown; look?: unknown } | undefined;
  if (!ud?.toon && !ud?.look) return false;
  const prev = mat.onBeforeCompile as Compile | undefined;
  const key0 = mat.customProgramCacheKey?.bind(mat);
  m.__ctTint = u;
  mat.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
    prev?.call(this, shader, renderer);
    if (!shader.fragmentShader.includes(ANCHOR)) return; // not a lit toon shader: leave it as is
    const uu = (this as THREE.Material & Tinted).__ctTint ?? u;
    shader.uniforms.uCtGhost = uu.uCtGhost;
    shader.uniforms.uCtTint = uu.uCtTint;
    shader.uniforms.uCtRim = uu.uCtRim;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${TINT_GLSL_HEAD}`).replace(ANCHOR, `${TINT_GLSL_BODY}\n  ${ANCHOR}`);
  } as Compile;
  mat.customProgramCacheKey = () => `${key0 ? key0() : ''}${KEY}`;
  mat.needsUpdate = true;
  return true;
}

/** Patch every mesh material under `root`; returns how many were wrapped. */
export function patchTintTree(root: THREE.Object3D, u: TintUniforms): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) if (mat && patchTint(mat, u)) n++;
  });
  return n;
}
