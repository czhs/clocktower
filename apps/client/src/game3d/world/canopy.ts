// v3 WP3 (v3-stage). Canopy fade (lead decision D1, docs/v3/INTEGRATION.md §11): tree-canopy-hidden tiles
// (hollowmere meta.hiddenSoft) stay walkable, so the 3D town must keep every avatar visible under a crown.
//
// The crowns are MERGED (the foliage piece emits one leaf mesh per 16 m chunk and one core mesh per material /
// 32 m chunk; house-11's oak crown is 2 merged meshes), so a per-object fade is impossible. Instead the canopy
// materials (foliage, crown / clump meshes of the cottages, the kit 'soft' layer) get a per-FRAGMENT test, added
// once before the shader warm-up: a fragment that lies IN FRONT of an avatar along the (orthographic) view ray and
// within a capsule around that avatar's screen silhouette is discarded with a world-anchored 4x4 ordered dither,
// down to `keep` coverage at the centre. Inputs are uniforms only (up to CANOPY_SLOTS avatar feet points + the
// camera basis), so the program count never changes (no recompile, no `transparent`). Shadows are unaffected
// (casters use depth materials), and the normal pass is cut identically (foliage is FLAG_NONE in the outline pass:
// no outline noise around the dither).
//
//   const u = createCanopyUniforms();  patchCanopyMaterial(mat, u)   (before the first compile)
//   const fade = createCanopyFade(u);  fade.update(points, cam, nowMs) per frame (points in metres, feet)
//   canopyFadeAt(P, slots, basis)      CPU twin of the shader test (unit tests)
import * as THREE from 'three';

/** Avatars that can open a hole at once (15 players + the Storyteller). */
export const CANOPY_SLOTS = 16;
/** Screen-space capsule around an avatar: radius (m), height of the segment above the feet (m), coverage kept
 *  at the centre (0..1), and how far in front of the avatar (m, along the view) a fragment must be to fade. */
export const CANOPY_SHAPE = { radius: 0.75, height: 1.6, keep: 0.22, front: 0.3 } as const;
/** An avatar's hole eases in / out over this long (appear, enter a house). */
export const CANOPY_FADE_MS = 220;

export interface CanopyUniforms {
  uCtCan: { value: THREE.Vector4[] };
  uCtCanN: { value: number };
  uCtCanF: { value: THREE.Vector3 };
  uCtCanR: { value: THREE.Vector3 };
  uCtCanU: { value: THREE.Vector3 };
  /** radius, height, keep, front */
  uCtCanShape: { value: THREE.Vector4 };
  /** world size of one low-res texel (dither cells) */
  uCtCanTexel: { value: number };
}

export function createCanopyUniforms(): CanopyUniforms {
  const b = cameraBasis(0, Math.PI / 6);
  return {
    uCtCan: { value: Array.from({ length: CANOPY_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uCtCanN: { value: 0 },
    uCtCanF: { value: new THREE.Vector3(b.F.x, b.F.y, b.F.z) },
    uCtCanR: { value: new THREE.Vector3(b.R.x, b.R.y, b.R.z) },
    uCtCanU: { value: new THREE.Vector3(b.U.x, b.U.y, b.U.z) },
    uCtCanShape: { value: new THREE.Vector4(CANOPY_SHAPE.radius, CANOPY_SHAPE.height, CANOPY_SHAPE.keep, CANOPY_SHAPE.front) },
    uCtCanTexel: { value: 12 / 360 },
  };
}

interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface CameraBasis {
  /** forward (into the scene) */
  F: V3;
  /** screen right */
  R: V3;
  /** screen up */
  U: V3;
}

/** The pixel camera's basis from yaw / pitch (the vendor cut-away's convention, src/town/cutaway.js). */
export function cameraBasis(yaw: number, pitch: number): CameraBasis {
  const F = { x: -Math.cos(pitch) * Math.sin(yaw), y: -Math.sin(pitch), z: -Math.cos(pitch) * Math.cos(yaw) };
  const R = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  // U = R x F
  const U = { x: R.y * F.z - R.z * F.y, y: R.z * F.x - R.x * F.z, z: R.x * F.y - R.y * F.x };
  return { F, R, U };
}

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface CanopySlot {
  X: number;
  Y: number;
  Z: number;
  /** strength 0..1 */
  w: number;
}

/**
 * CPU twin of the shader: the fade 0..1 of a canopy fragment at world point P (0 = untouched, 1 = cut down to
 * `keep` coverage). Mirrors CANOPY_GLSL_HEAD ctCanopyFade exactly.
 */
export function canopyFadeAt(P: V3, slots: readonly CanopySlot[], basis: CameraBasis, shape: { radius: number; height: number; front: number } = CANOPY_SHAPE): number {
  let k = 0;
  for (const A of slots.slice(0, CANOPY_SLOTS)) {
    if (!(A.w > 0)) continue;
    const d0 = { x: P.x - A.X, y: P.y - A.Y, z: P.z - A.Z };
    const s = Math.min(shape.height, Math.max(0, dot(d0, basis.U) / Math.max(basis.U.y, 1e-3)));
    const d = { x: d0.x, y: d0.y - s, z: d0.z };
    if (dot(d, basis.F) > -shape.front) continue;
    const r = Math.hypot(dot(d, basis.R), dot(d, basis.U)) / shape.radius;
    k = Math.max(k, A.w * (1 - smoothstep(0.55, 1, r)));
  }
  return k;
}

export const CANOPY_GLSL_HEAD = /* glsl */ `
uniform vec4 uCtCan[${CANOPY_SLOTS}];
uniform float uCtCanN;
uniform vec3 uCtCanF, uCtCanR, uCtCanU;
uniform vec4 uCtCanShape;
uniform float uCtCanTexel;
float ctCanBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float ctCanBayer4(vec2 a) { return ctCanBayer2(0.5 * a) * 0.25 + ctCanBayer2(a); }
float ctCanopyFade(vec3 P) {
  float k = 0.0;
  for (int i = 0; i < ${CANOPY_SLOTS}; i++) {
    if (float(i) >= uCtCanN) break;
    vec4 A = uCtCan[i];
    if (A.w <= 0.0) continue;
    vec3 d0 = P - A.xyz;
    float s = clamp(dot(d0, uCtCanU) / max(uCtCanU.y, 1e-3), 0.0, uCtCanShape.y);
    vec3 d = d0 - vec3(0.0, s, 0.0);
    if (dot(d, uCtCanF) > -uCtCanShape.w) continue;
    float r = length(vec2(dot(d, uCtCanR), dot(d, uCtCanU))) / uCtCanShape.x;
    k = max(k, A.w * (1.0 - smoothstep(0.55, 1.0, r)));
  }
  return k;
}`;

/** First statement of main(): the dithered discard (colour and normal pass alike). */
export const CANOPY_GLSL_TEST = /* glsl */ `
  if (uCtCanN > 0.5) {
    float ctCanK = ctCanopyFade(vToonWorld);
    if (ctCanK > 0.0) {
      // world-anchored screen-texel cells: whole-texel pans rasterise the same pattern (no crawl)
      vec2 ctCell = vec2(dot(vToonWorld, uCtCanR), dot(vToonWorld, uCtCanU)) / max(uCtCanTexel, 1e-4);
      if (ctCanBayer4(ctCell) >= mix(1.0, uCtCanShape.z, ctCanK)) discard;
    }
  }`;

const MAIN = 'void main() {';
const KEY = '|ct-canopy1';

type Compile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;
interface Patched {
  __ctCanopy?: CanopyUniforms;
}

/**
 * Wrap one toon-family material (idempotent; true when patched). Chains the material's own onBeforeCompile (toon,
 * the vendor cut-away) and appends '|ct-canopy1' to its OWN program cache key; a material without an own key
 * function (the Material default keys on onBeforeCompile's source, which the wrapper would make identical for
 * different shaders) or without the toon world varying is left alone. Must run before the first compile.
 */
export function patchCanopyMaterial(mat: THREE.Material, u: CanopyUniforms): boolean {
  const m = mat as THREE.Material & Patched;
  if (m.__ctCanopy) return true;
  const ud = mat.userData as { toon?: unknown } | undefined;
  if (!ud?.toon || !Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey')) return false;
  const prev = mat.onBeforeCompile as Compile | undefined;
  const key0 = mat.customProgramCacheKey.bind(mat);
  m.__ctCanopy = u;
  mat.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
    prev?.call(this, shader, renderer);
    if (!shader.fragmentShader.includes(MAIN) || !shader.fragmentShader.includes('vToonWorld')) return;
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader.replace(MAIN, `${CANOPY_GLSL_HEAD}\n${MAIN}\n${CANOPY_GLSL_TEST}`);
  } as Compile;
  mat.customProgramCacheKey = () => `${key0()}${KEY}`;
  mat.needsUpdate = true;
  return true;
}

export interface CanopyPoint {
  /** stable key (pid) */
  key: string;
  X: number;
  Y: number;
  Z: number;
  /** fill order: lower first (own avatar 0) */
  priority?: number;
}

export interface CanopyFade {
  /**
   * Per frame: every outdoor avatar to keep visible (empty = none, e.g. while inside a room). `n` = how many of
   * `points` are live (default all; lets the caller keep a reused pool). `cam` may be the engine's PixelCamera.
   */
  update(points: readonly CanopyPoint[], cam: { readonly yaw: number; readonly pitch: number; readonly texelWorld?: number }, nowMs: number, n?: number): void;
  /** Slots written this frame (uCtCanN). */
  readonly active: number;
  debug(): { active: number; slots: { key: string; X: number; Z: number; w: number }[] };
}

interface LiveSlot {
  key: string;
  X: number;
  Y: number;
  Z: number;
  w: number;
  target: number;
  pr: number;
  at: number;
  /** update() call that last saw it */
  stamp: number;
}

const bySlotOrder = (a: LiveSlot, b: LiveSlot) => a.pr - b.pr || a.at - b.at;

/**
 * Drives the canopy uniforms: per-avatar strength eased over CANOPY_FADE_MS, at most CANOPY_SLOTS slots.
 * Allocation-free per frame once every avatar has been seen (one LiveSlot per avatar, a reused sort array).
 */
export function createCanopyFade(u: CanopyUniforms): CanopyFade {
  const live = new Map<string, LiveSlot>();
  const list: LiveSlot[] = [];
  let active = 0;
  let lastNow: number | null = null;
  let yaw0 = NaN;
  let pitch0 = NaN;
  let stamp = 0;
  return {
    get active() {
      return active;
    },
    update(points, cam, nowMs, n = points.length) {
      const dt = lastNow === null ? 0 : Math.max(0, nowMs - lastNow);
      lastNow = nowMs;
      const step = dt / CANOPY_FADE_MS;
      stamp++;
      const m = Math.min(n, points.length);
      for (let i = 0; i < m; i++) {
        const p = points[i]!;
        const e = live.get(p.key);
        if (e) {
          e.X = p.X;
          e.Y = p.Y;
          e.Z = p.Z;
          e.target = 1;
          e.pr = p.priority ?? 1;
          e.stamp = stamp;
        } else live.set(p.key, { key: p.key, X: p.X, Y: p.Y, Z: p.Z, w: 0, target: 1, pr: p.priority ?? 1, at: nowMs, stamp });
      }
      list.length = 0;
      for (const [k, e] of live) {
        if (e.stamp !== stamp) e.target = 0;
        e.w = e.target > e.w ? Math.min(e.target, e.w + step) : Math.max(e.target, e.w - step);
        if (e.target === 0 && e.w <= 0) live.delete(k);
        else if (e.w > 0) list.push(e);
      }
      list.sort(bySlotOrder);
      active = Math.min(CANOPY_SLOTS, list.length);
      for (let i = 0; i < CANOPY_SLOTS; i++) {
        const v = u.uCtCan.value[i]!;
        const e = i < active ? list[i]! : null;
        if (e) v.set(e.X, e.Y, e.Z, e.w);
        else v.set(0, -100, 0, 0);
      }
      u.uCtCanN.value = active;
      if (cam.yaw !== yaw0 || cam.pitch !== pitch0) {
        yaw0 = cam.yaw;
        pitch0 = cam.pitch;
        const b = cameraBasis(cam.yaw, cam.pitch);
        u.uCtCanF.value.set(b.F.x, b.F.y, b.F.z);
        u.uCtCanR.value.set(b.R.x, b.R.y, b.R.z);
        u.uCtCanU.value.set(b.U.x, b.U.y, b.U.z);
      }
      const tw = cam.texelWorld;
      if (tw && Number.isFinite(tw)) u.uCtCanTexel.value = tw;
    },
    debug() {
      return {
        active,
        slots: [...live.values()].map((e) => ({ key: e.key, X: +e.X.toFixed(2), Z: +e.Z.toFixed(2), w: +e.w.toFixed(2) })),
      };
    },
  };
}
