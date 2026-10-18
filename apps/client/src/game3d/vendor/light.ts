// v3.3 perf prototype (v33-light): lighting and shadows (docs/perf-v3/light.md). Works on the live pixel3d Engine from
// outside (the vendor tree is read-only), behind `ct.debug.v3light` (read once per build; nothing changes when unset):
//
//   ct.debug.v3light = "stats"           instrumentation only (renderAt ms, shadow draws, static / dynamic renders)
//                      "shadow"          (1) split sun shadows: a cached STATIC map + a per-frame DYNAMIC map
//                      "pool"            (2) the night light pool as one deferred low-res pass (0 forward point lights)
//                      "shadow,pool"     both ("all" = both)
//
// (1) Split shadows. The vendor renders ONE sun shadow map per frame (PixelPipeline shadowOnce; every 2nd frame at low,
// world/shadowCadence.ts) whose camera follows the view, snapped to shadow texels. Here:
//   - engine.sun keeps the town's STATIC casters. Its map is re-rendered only when it is dirty: the sun direction
//     stepped (time of day moves in 0.5 deg steps), the view left the map's margin, the extent / map size changed, or a
//     static caster changed (matrix, visibility, instance matrices, geometry: e.g. a door swing). Its frustum is the
//     vendor's, widened by MARGIN texels on each side, centred on a coarse grid (2 x MARGIN texels) of the vendor's
//     texel-snapped centre: the texel grid, the texel size, the depth range and the biases stay the vendor's, so a
//     static shadow lands on exactly the same texels as before.
//   - a second DirectionalLight (intensity 0: no light, only a shadow) carries the DYNAMIC casters (skinned rigs,
//     vertex-animated casters, anything seen moving twice); its camera is the vendor's per-frame camera, every frame
//     (or the low tier's cadence).
//   - receivers take min(static, dynamic): a macro after three's getShadow() (chunk shadowmap_pars_fragment) folds the
//     second map into every getShadow call (toon.js, grass.js), mapping the coordinate through the texel offset; the
//     outline pass's light-aware sun lookup gets the same min.
//   - casters are split per light by flipping castShadow inside LightShadow.updateMatrices (three calls it per light
//     right before it walks the scene), restored after the frame.
// (2) Deferred light pool. Every Point / SpotLight goes to a camera-invisible layer (three only gathers lights the
// camera sees), so every program compiles with 0 point lights (no light arrays to upload, no per-fragment light loop).
// The normal pass gets a second colour attachment (MRT): toon materials write their authored mid tone + a lit flag
// (+ the lighting-normal noise amount); one low-res pass (order 1, before contact / fog / outline) re-applies the
// vendor's quantised lantern formula (toon.js "point lights") from depth + normal + that tone. By day (no light lit)
// the pass is off. Known gaps (light.md): `lightPos` (grass / foliage roots) and `lightNormal` overrides are not
// reproduced (the pass uses the pixel's position / normal), water reflections show no pools.
import * as THREE from 'three';
import * as toonNS from '@pixel3d/materials/toon.js';
import type { Tier } from '../contract';
import type { HostedEngine } from './engineHost';

// ------------------------------------------------------------------ switches
export interface LightSwitches {
  stats: boolean;
  shadow: boolean;
  pool: boolean;
}

export const LIGHT_KEY = 'ct.debug.v3light';

/** Parse `ct.debug.v3light` (comma / space list; "all" = shadow + pool; any non-empty value turns stats on). */
export function parseLightSwitches(v: string | null | undefined): LightSwitches {
  const s = String(v ?? '')
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  const all = s.includes('all');
  return { stats: s.length > 0, shadow: all || s.includes('shadow'), pool: all || s.includes('pool') };
}

export function readLightSwitches(): LightSwitches {
  try {
    return parseLightSwitches(localStorage.getItem(LIGHT_KEY));
  } catch {
    return parseLightSwitches(null);
  }
}

/** Which levers a tier can take: the cpu tier has no shadow map and no normal pass. */
export function leversFor(tier: Tier, sw: LightSwitches): LightSwitches {
  if (tier === 'cpu') return { stats: sw.stats, shadow: false, pool: false };
  return sw;
}

// ------------------------------------------------------------------ chunk patches (fragment chunks, global)
type Chunks = Record<string, string>;

/** Append `add` to a three chunk (idempotent); returns the restore function (only while the chunk is still ours). */
export function patchChunk(name: string, add: string, chunks: Chunks = THREE.ShaderChunk as unknown as Chunks): () => void {
  const was = chunks[name] ?? '';
  if (was.includes(add)) return () => undefined;
  const now = was + add;
  chunks[name] = now;
  return () => {
    if (chunks[name] === now) chunks[name] = was;
  };
}

/**
 * (1) After three's getShadow(): every call samples the static map (index 0, the call's own coordinate) AND the
 * dynamic map (index 1: the same texel offset from the fragment's own coordinate in that map), min of both. The call's
 * sampler argument is ignored (both maps are always read): only light 0 is lit (toon.js), light 1 has intensity 0.
 */
export const SPLIT_SHADOW_GLSL = /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
float ctSplitShadow( vec2 size, float inten, float bias, float rad, vec4 c ) {
  float s0 = getShadow( directionalShadowMap[ 0 ], size, inten, bias, rad, c );
  vec4 c1 = vDirectionalShadowCoord[ 1 ];
  c1.xy += ( c.xy - vDirectionalShadowCoord[ 0 ].xy ) * ( size / directionalLightShadows[ 1 ].shadowMapSize );
  float s1 = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, inten, bias, rad, c1 );
  return min( s0, s1 );
}
#define getShadow( m, s, i, b, r, c ) ctSplitShadow( s, i, b, r, c )
#endif
`;

/** (2) The aux output of every built-in fragment program (attachment 1 of the normal pass; ignored elsewhere). */
export const AUX_DECL_GLSL = '\nlayout(location = 1) out highp vec4 ctAux;\n';
export const AUX_CLEAR_GLSL = '\nctAux = vec4(0.0);\n';
/**
 * (2) Toon programs (they alone define FLAG_FULL and toonMid before normal_fragment_maps): the authored mid tone after
 * the `tones` hook (= toon.js toonMid0) and the lit flag 1 + uNormalNoise; emissive texels (lit kit glass) are left
 * out, as in the forward formula (their mid tone is 0 and the glow is added after the pool).
 */
export const AUX_TOON_GLSL = /* glsl */ `
#ifdef FLAG_FULL
ctAux = dot( totalEmissiveRadiance, vec3( 1.0 ) ) > 0.0 ? vec4( 0.0 ) : vec4( toonMid, 1.0 + uNormalNoise );
#endif
`;

// ------------------------------------------------------------------ (1) static-map placement math (pure)
export interface StaticPlacement {
  /** Grid indices of the static centre in the light basis: x / y in texels (multiples of 2·margin), z in 4 m steps. */
  ix: number;
  iy: number;
  kz: number;
  /** World centre of the static map (a function of the indices only: the same indices give the same floats). */
  x: number;
  y: number;
  z: number;
}

/** The vendor's quantisation of the shadow centre along the light (Engine._updateSun: 4 m). */
export const ALONG_LIGHT_M = 4;

/**
 * The static map's centre for a view target `c`, light direction `dir` (towards the sun), texel size and margin
 * (texels): the vendor's texel-snapped centre (Engine._updateSun: light basis z = dir, x = up × z, y = z × x; x / y
 * rounded to texels, along-light rounded to 4 m) moved to the nearest multiple of 2·margin texels along x / y. Its
 * texels coincide with the vendor's, so a static caster rasterises on the same shadow texels.
 */
export function staticPlacement(c: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, texel: number, margin: number): StaticPlacement {
  const z = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
  const y = z.clone().cross(x);
  const C = new THREE.Vector3(c.x, c.y, c.z);
  const g = Math.max(1, 2 * margin);
  const ix = Math.round(Math.round(C.dot(x) / texel) / g) * g;
  const iy = Math.round(Math.round(C.dot(y) / texel) / g) * g;
  const kz = Math.round(C.dot(z) / ALONG_LIGHT_M);
  const W = new THREE.Vector3().addScaledVector(x, ix * texel).addScaledVector(y, iy * texel).addScaledVector(z, kz * ALONG_LIGHT_M);
  return { ix, iy, kz, x: W.x, y: W.y, z: W.z };
}

/** Static map size (texels) for the vendor's map size + a margin on each side. */
export const staticMapSize = (vendorSize: number, margin: number) => vendorSize + 2 * margin;

/** Margin (texels) per tier: low 2048 -> 2560, high 4096 -> 4352 (memory, light.md §risks). */
export const MARGIN_TEXELS: Readonly<Record<string, number>> = { low: 256, high: 128 };

// ------------------------------------------------------------------ caster signatures (change detection)
interface Caster {
  o: THREE.Mesh;
  sig: Float64Array;
  /** frames at which the signature changed (recent) */
  hits: number[];
}

const SIG_N = 21;

function effectiveVisible(o: THREE.Object3D, scene: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (!p.visible) return false;
    if (p === scene) return true;
    p = p.parent;
  }
  return false; // not in the scene
}

/** Write the caster's signature (world matrix, visibility, material visibility, instance / geometry versions). */
export function writeSig(o: THREE.Mesh, scene: THREE.Object3D, out: Float64Array): void {
  const e = o.matrixWorld.elements;
  for (let i = 0; i < 16; i++) out[i] = e[i]!;
  out[16] = effectiveVisible(o, scene) ? 1 : 0;
  const m = o.material as THREE.Material | THREE.Material[];
  out[17] = Array.isArray(m) ? m.reduce((a, x) => a * 2 + (x.visible ? 1 : 0), 1) : m?.visible ? 1 : 0;
  const im = (o as THREE.InstancedMesh).instanceMatrix;
  out[18] = im ? im.version + 1e6 * ((o as THREE.InstancedMesh).count ?? 0) : 0;
  const pos = o.geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
  out[19] = pos ? pos.version : 0;
  out[20] = o.castShadow ? 1 : 0;
}

function sameSig(a: Float64Array, b: Float64Array): boolean {
  for (let i = 0; i < SIG_N; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Does a customDepthMaterial animate with time (a vertex patch that reads uTime beyond its declaration)? */
export function depthAnimates(m: THREE.Material | undefined | null): boolean {
  if (!m) return false;
  const obc = (m as THREE.Material & { onBeforeCompile?: (s: unknown, r?: unknown) => void }).onBeforeCompile;
  if (typeof obc !== 'function') return false;
  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>\n', fragmentShader: '#include <common>\n', uniforms: {} as Record<string, unknown> };
  try {
    obc.call(m, shader, undefined);
  } catch {
    return true; // unknown: treat as animated (dynamic is always correct)
  }
  return (shader.vertexShader.match(/uTime/g)?.length ?? 0) > 1;
}

/** A caster that must be in the dynamic map from the start. */
export function isDynamicCaster(o: THREE.Mesh): boolean {
  if ((o as THREE.SkinnedMesh).isSkinnedMesh) return true;
  if (o.customDepthMaterial && depthAnimates(o.customDepthMaterial)) return true;
  return false;
}

// ------------------------------------------------------------------ (1) split shadows
export interface SplitShadowInfo {
  staticRenders: number;
  dynamicRenders: number;
  staticCasters: number;
  dynamicCasters: number;
  promoted: number;
  promotedNames: string[];
  mapStatic: number;
  mapDynamic: number;
  ext: number;
  reasons: Record<string, number>;
  lastStaticFrame: number;
}

export interface SplitShadows {
  info(): SplitShadowInfo;
  /** After the warm-up: from now on a static caster seen changing twice becomes dynamic. */
  setLive(): void;
  /** Force a static re-render (e.g. a room switch). */
  invalidate(reason: string): void;
  dispose(): void;
}

type ShadowLike = THREE.DirectionalLightShadow & { autoUpdate: boolean; needsUpdate: boolean; updateMatrices(light: THREE.Light, vp?: number): void };

/** A static caster that changed this many times within PROMOTE_MS moves to the dynamic map for good (crows, cats,
 *  swinging signs, a door while it swings); a rare change (a dais state, a cottage fade) only re-renders the static map. */
export const PROMOTE_HITS = 3;
export const PROMOTE_MS = 6000;
const RESCAN_FRAMES = 60;

export function installSplitShadows(engine: HostedEngine, tier: Tier): SplitShadows {
  const scene = engine.scene;
  const sun = engine.sun as THREE.DirectionalLight;
  const sunShadow = sun.shadow as ShadowLike;
  const pipe = engine.pipeline as unknown as { preRender: ((e: unknown) => void)[]; render(): void; getPass?(n: string): { material?: THREE.ShaderMaterial; update?: (e: unknown) => void } | undefined };
  const margin = MARGIN_TEXELS[tier] ?? 256;
  const restoreChunk = patchChunk('shadowmap_pars_fragment', SPLIT_SHADOW_GLSL);

  // the dynamic light: no light (intensity 0), its shadow only; the vendor's per-frame camera
  const dyn = new THREE.DirectionalLight(0xffffff, 0);
  dyn.name = 'ct-shadow-dynamic';
  dyn.castShadow = true;
  scene.add(dyn, dyn.target);
  const dynShadow = dyn.shadow as ShadowLike;

  let vendorSize = sunShadow.mapSize.x;
  let staticSize = staticMapSize(vendorSize, margin);
  const setSize = (s: ShadowLike, n: number) => {
    if (s.mapSize.x === n && s.mapSize.y === n) return;
    s.mapSize.set(n, n);
    if (s.map) {
      s.map.dispose();
      (s as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
  };
  setSize(sunShadow, staticSize);
  setSize(dynShadow, vendorSize);
  sunShadow.autoUpdate = false;
  sunShadow.needsUpdate = true;

  // casters
  const casters = new Map<THREE.Mesh, Caster>(); // static
  const dynamic = new Set<THREE.Mesh>();
  const known = new Set<THREE.Mesh>();
  let promoted = 0;
  const promotedNames: string[] = [];
  let live = false;
  const rescan = () => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || known.has(m) || !m.castShadow) return;
      known.add(m);
      if (isDynamicCaster(m)) dynamic.add(m);
      else {
        const sig = new Float64Array(SIG_N);
        writeSig(m, scene, sig);
        casters.set(m, { o: m, sig, hits: [] });
      }
    });
  };
  rescan();

  // castShadow flips per light (restored after the frame)
  const flipped: [THREE.Mesh, boolean][] = [];
  const flip = (m: THREE.Mesh, on: boolean) => {
    if (m.castShadow === on) return;
    flipped.push([m, m.castShadow]);
    m.castShadow = on;
  };
  const restoreFlips = () => {
    for (let i = flipped.length - 1; i >= 0; i--) flipped[i]![0].castShadow = flipped[i]![1];
    flipped.length = 0;
  };
  let staticRenders = 0;
  let dynamicRenders = 0;
  let frame = 0;
  let lastStaticFrame = -1;
  const sunUpd = sunShadow.updateMatrices.bind(sunShadow);
  sunShadow.updateMatrices = (light: THREE.Light, vp?: number) => {
    // the static map: only the static set (a fresh scan first: a new caster must never be frozen into it)
    rescan();
    for (const m of dynamic) flip(m, false);
    staticRenders++;
    lastStaticFrame = frame;
    sunUpd(light, vp);
  };
  const dynUpd = dynShadow.updateMatrices.bind(dynShadow);
  dynShadow.updateMatrices = (light: THREE.Light, vp?: number) => {
    // the dynamic map: everything but the static set (new casters included)
    restoreFlips();
    for (const c of casters.values()) flip(c.o, false);
    dynamicRenders++;
    dynUpd(light, vp);
  };

  // per frame, first preRender hook (after Engine._updateSun and the frame's updateMatrixWorld)
  const reasons: Record<string, number> = {};
  let dirty = 'init';
  const placed = { ix: NaN, iy: NaN, z: NaN, dx: NaN, dy: NaN, dz: NaN, ext: NaN, size: NaN, at: new THREE.Vector3() };
  const center = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const scratch = new Float64Array(SIG_N);
  const hook = () => {
    frame++;
    if (frame % RESCAN_FRAMES === 0) rescan();
    // the vendor may re-size its map (configureShadows): adopt it
    if (sunShadow.mapSize.x !== staticSize) {
      vendorSize = sunShadow.mapSize.x;
      staticSize = staticMapSize(vendorSize, margin);
      setSize(sunShadow, staticSize);
      setSize(dynShadow, vendorSize);
      dirty ||= 'size';
    }
    // dynamic = the vendor's camera of this frame (Engine._updateSun ran on the sun)
    const sc = sun.shadow.camera;
    const dc = dyn.shadow.camera;
    dyn.position.copy(sun.position);
    dyn.target.position.copy(sun.target.position);
    dyn.target.updateMatrixWorld();
    dyn.updateMatrixWorld();
    dc.left = sc.left;
    dc.right = sc.right;
    dc.top = sc.top;
    dc.bottom = sc.bottom;
    dc.near = sc.near;
    dc.far = sc.far;
    dc.updateProjectionMatrix();
    dynShadow.bias = sunShadow.bias;
    dynShadow.normalBias = sunShadow.normalBias;
    dynShadow.radius = sunShadow.radius;
    dynShadow.intensity = sunShadow.intensity;
    // static placement
    const ext = (engine as unknown as { shadowExtent: number }).shadowExtent;
    const texel = (2 * ext) / vendorSize;
    center.copy(engine.camera.target);
    dir.copy(engine.uniforms.uSunDir!.value as THREE.Vector3).normalize();
    const p = staticPlacement(center, dir, texel, margin);
    if (p.ix !== placed.ix || p.iy !== placed.iy || p.kz !== placed.z) dirty ||= 'pan';
    if (dir.x !== placed.dx || dir.y !== placed.dy || dir.z !== placed.dz) dirty ||= 'sun';
    if (ext !== placed.ext || staticSize !== placed.size) dirty ||= 'extent';
    // static casters: anything changed? (seen moving twice -> dynamic for good)
    for (const c of casters.values()) {
      writeSig(c.o, scene, scratch);
      if (sameSig(scratch, c.sig)) continue;
      c.sig.set(scratch);
      dirty ||= 'caster';
      if (!live) continue; // the warm-up's showcase states are not movement
      const now = performance.now();
      c.hits.push(now);
      while (c.hits.length && now - c.hits[0]! > PROMOTE_MS) c.hits.shift();
      if (c.hits.length >= PROMOTE_HITS) {
        casters.delete(c.o);
        dynamic.add(c.o);
        promoted++;
        if (promotedNames.length < 40) promotedNames.push(c.o.name || c.o.parent?.name || c.o.type);
      }
    }
    if (dirty) {
      reasons[dirty] = (reasons[dirty] ?? 0) + 1;
      dirty = '';
      placed.ix = p.ix;
      placed.iy = p.iy;
      placed.z = p.kz;
      placed.dx = dir.x;
      placed.dy = dir.y;
      placed.dz = dir.z;
      placed.ext = ext;
      placed.size = staticSize;
      placed.at.set(p.x, p.y, p.z);
      sunShadow.needsUpdate = true;
    }
    // the sun always sits on the last placement (between static renders three samples with the matrix of the last
    // static render; only the light direction is read live, and it is the same)
    sun.target.position.copy(placed.at);
    sun.position.copy(placed.at).addScaledVector(dir, ext * 3);
    if (sunShadow.needsUpdate) {
      // (a pending render, e.g. skipped by the low cadence, keeps the newest placement)
      const half = ext + margin * texel;
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  };
  pipe.preRender.unshift(hook);
  const render = pipe.render;
  pipe.render = function (this: unknown) {
    try {
      return render.call(this);
    } finally {
      restoreFlips();
    }
  };

  // the outline pass's light-aware sun lookup: min with the dynamic map too
  const outline = pipe.getPass?.('outline');
  let outlineRestore: (() => void) | null = null;
  if (outline?.material && /float sunLitAt\(vec3 wp\)/.test(outline.material.fragmentShader)) {
    const mat = outline.material;
    const was = mat.fragmentShader;
    const u = mat.uniforms;
    u.tShadow2 = { value: null };
    u.uShadowMatrix2 = { value: new THREE.Matrix4() };
    u.uShadowSize2 = { value: new THREE.Vector2(1, 1) };
    u.uHasShadow2 = { value: 0 };
    mat.fragmentShader = was
      .replace('float sunLitAt(vec3 wp)', 'float ctSunLitAt0(vec3 wp)')
      .replace(
        'float shadowTap(vec2 st, float z)',
        `uniform sampler2D tShadow2; uniform mat4 uShadowMatrix2; uniform vec2 uShadowSize2; uniform float uHasShadow2;
float ctTap2(vec2 st, float z) { return step(z + uShadowBias, unpackRGBAToDepth(texture2D(tShadow2, (st + 0.5) / uShadowSize2))); }
float ctSunLit2(vec3 wp) {
  if (uHasShadow2 < 0.5) return 1.0;
  vec4 sc = uShadowMatrix2 * vec4(wp, 1.0);
  if (any(lessThan(sc.xyz, vec3(0.0))) || any(greaterThan(sc.xyz, vec3(1.0)))) return 1.0;
  vec2 p = sc.xy * uShadowSize2 - 0.5, b = floor(p), f = p - b;
  float s00 = ctTap2(b, sc.z), s10 = ctTap2(b + vec2(1.0, 0.0), sc.z);
  float s01 = ctTap2(b + vec2(0.0, 1.0), sc.z), s11 = ctTap2(b + vec2(1.0, 1.0), sc.z);
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}
float ctSunLitAt0(vec3 wp);
float sunLitAt(vec3 wp) { return min(ctSunLitAt0(wp), ctSunLit2(wp)); }
float shadowTap(vec2 st, float z)`,
      );
    mat.needsUpdate = true;
    const upd = outline.update;
    outline.update = function (this: unknown, e: unknown) {
      upd?.call(this, e);
      const tex = dynShadow.map?.texture ?? null;
      const on = (u.uHasShadow?.value as number) > 0.5 && !!tex;
      u.tShadow2!.value = on ? tex : null;
      u.uHasShadow2!.value = on ? 1 : 0;
      if (on) {
        u.uShadowMatrix2!.value = dynShadow.matrix;
        u.uShadowSize2!.value.set(dynShadow.mapSize.x, dynShadow.mapSize.y);
      }
    };
    outlineRestore = () => {
      mat.fragmentShader = was;
      mat.needsUpdate = true;
      outline.update = upd;
    };
  }

  let disposed = false;
  return {
    info: () => ({
      staticRenders,
      dynamicRenders,
      staticCasters: casters.size,
      dynamicCasters: dynamic.size,
      promoted,
      promotedNames: promotedNames.slice(),
      mapStatic: staticSize,
      mapDynamic: vendorSize,
      ext: (engine as unknown as { shadowExtent: number }).shadowExtent,
      reasons: { ...reasons },
      lastStaticFrame,
    }),
    setLive() {
      live = true;
    },
    invalidate(reason) {
      dirty ||= reason;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const k = pipe.preRender.indexOf(hook);
      if (k >= 0) pipe.preRender.splice(k, 1);
      if (pipe.render !== render) pipe.render = render;
      restoreFlips();
      sunShadow.updateMatrices = sunUpd;
      sunShadow.autoUpdate = true;
      outlineRestore?.();
      dyn.removeFromParent();
      dyn.target.removeFromParent();
      dynShadow.map?.dispose();
      dyn.dispose();
      restoreChunk();
    },
  };
}

// ------------------------------------------------------------------ (2) deferred light pool
/** Camera-invisible layer for the point lights (same as the cpu tier's). */
export const POOL_LIGHT_LAYER = 31;
export const POOL_MAX = 16;
export const POOL_PASS = 'ct-lightpool';

const NOISE_GLSL: string = (toonNS as unknown as { NOISE_GLSL?: string }).NOISE_GLSL ?? '';

/** The pass (LOWRES_COMMON is prepended by the pipeline): toon.js's point-light block on reconstructed inputs. */
export const POOL_FRAG = /* glsl */ `
uniform sampler2D tAux;
uniform int uPLn;
uniform vec3 uPLpos[${POOL_MAX}];
uniform vec3 uPLcol[${POOL_MAX}];
uniform float uPLdist[${POOL_MAX}];
uniform vec3 uPointShape;
uniform float uPointLevels;
uniform float uNoiseScale;
${NOISE_GLSL}
void main() {
  vec4 col = texture2D(tColor, vUv);
  vec4 aux = texture2D(tAux, vUv);
  if (aux.a < 0.5 || uPLn == 0) { gl_FragColor = col; return; }
  vec3 P = viewPos(vUv);
  vec3 N = viewNormal(vUv);
  float nn = aux.a - 1.0;
  if (nn > 0.0) {
    vec3 W = (uCamWorld * vec4(P, 1.0)).xyz;
    vec2 nq = W.xz * uNoiseScale;
    vec3 d = vec3(vnoise(nq) - 0.5, 0.0, vnoise(nq + 7.3) - 0.5)
           + 0.5 * vec3(vnoise(nq * 2.7 + 3.1) - 0.5, 0.0, vnoise(nq * 2.7 + 11.9) - 0.5);
    N = normalize(N + mat3(uViewMat) * d * nn);
  }
  vec3 o = col.rgb;
  for (int i = 0; i < ${POOL_MAX}; i++) {
    if (i >= uPLn) break;
    vec3 lv = uPLpos[i] - P;
    float reach = uPLdist[i] > 0.0 ? min(uPointShape.y, uPLdist[i]) : uPointShape.y;
    float dr = length(lv) / max(reach, 1e-3);
    vec3 c = uPLcol[i];
    float pmax = max(max(c.r, c.g), max(c.b, 1e-4));
    float pa = clamp(1.0 - dr * dr, 0.0, 1.0) * max(dot(N, normalize(lv)), 0.0) * pmax * uPointShape.x;
    float pq = floor(clamp(pa, 0.0, 1.0) * uPointLevels + 0.5) / uPointLevels;
    vec3 warm = aux.rgb * mix(vec3(1.0), c / pmax, uPointShape.z);
    o = mix(o, warm, pq);
  }
  gl_FragColor = vec4(o, col.a);
}
`;

export interface PoolLight {
  pos: THREE.Vector3; // view space
  col: THREE.Color; // colour x intensity (linear)
  dist: number;
}

/**
 * Pack the lit lights (three's order: scene traversal of visible lights; intensity 0 lights add nothing in the forward
 * formula and are skipped) into the pass's uniform arrays. Returns how many were written.
 */
export function packPool(lights: readonly THREE.Light[], view: THREE.Matrix4, pos: THREE.Vector3[], col: THREE.Color[], dist: number[], max = POOL_MAX): number {
  let n = 0;
  for (const l of lights) {
    if (n >= max) break;
    if (!(l.intensity > 0)) continue;
    const pl = l as THREE.PointLight;
    pos[n]!.setFromMatrixPosition(l.matrixWorld).applyMatrix4(view);
    col[n]!.copy(l.color).multiplyScalar(l.intensity);
    dist[n] = pl.distance ?? 0;
    n++;
  }
  return n;
}

export interface DeferredPoolInfo {
  lights: number;
  lit: number;
  passOn: number;
  passOff: number;
  wrapped: number;
}

export interface DeferredPool {
  info(): DeferredPoolInfo;
  dispose(): void;
}

type Pipe = {
  preRender: ((e: unknown) => void)[];
  passes: { name?: string; enabled?: boolean }[];
  rtNormal?: THREE.WebGLRenderTarget;
  resize(w: number, h: number): void;
  addPass(p: { name: string; order: number; enabled?: boolean; material: THREE.ShaderMaterial; update?: (e: unknown) => void }): unknown;
  makeLowresMaterial(o: { fragment: string; uniforms?: Record<string, THREE.IUniform> }): THREE.ShaderMaterial;
  common: Record<string, THREE.IUniform>;
};

/** Make a custom ShaderMaterial write ctAux = 0 (declared + cleared at the top of main). */
export function wrapAuxShader(m: THREE.ShaderMaterial): boolean {
  const u = m as THREE.ShaderMaterial & { __ctAux?: boolean; isRawShaderMaterial?: boolean };
  if (u.__ctAux || u.isRawShaderMaterial || u.glslVersion === THREE.GLSL3) return false;
  if (/clipping_planes_(pars_)?fragment/.test(m.fragmentShader)) return false; // the chunks do it
  u.__ctAux = true;
  const key0 = m.customProgramCacheKey();
  const obc = m.onBeforeCompile;
  m.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
    obc.call(this, shader, renderer);
    shader.fragmentShader = AUX_DECL_GLSL + shader.fragmentShader.replace(/void\s+main\s*\(\s*(void)?\s*\)\s*\{/, (s) => `${s}${AUX_CLEAR_GLSL}`);
  };
  m.customProgramCacheKey = () => `${key0}|ctaux`;
  m.needsUpdate = true;
  return true;
}

export function installDeferredPool(engine: HostedEngine): DeferredPool {
  const scene = engine.scene;
  const pipe = engine.pipeline as unknown as Pipe;
  const restores = [patchChunk('clipping_planes_pars_fragment', AUX_DECL_GLSL), patchChunk('clipping_planes_fragment', AUX_CLEAR_GLSL), patchChunk('normal_fragment_maps', AUX_TOON_GLSL)];

  // A/B: `ct.debug.v3lightF32 = 1` = the normal + aux targets in 32-bit float (the vendor's normal target is half float)
  let auxF32 = false;
  try {
    auxF32 = localStorage.getItem('ct.debug.v3lightF32') === '1';
  } catch {
    auxF32 = false;
  }
  // the normal pass target gets attachment 1 (the aux): same size / format as the pipeline's
  const mrt = () => {
    const old = pipe.rtNormal;
    if (!old || (old as THREE.WebGLRenderTarget & { textures?: unknown[] }).textures?.length === 2) return;
    const rt = new THREE.WebGLRenderTarget(old.width, old.height, { count: 2, type: auxF32 ? THREE.FloatType : THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true });
    old.dispose();
    pipe.rtNormal = rt;
  };
  const resize = pipe.resize;
  pipe.resize = function (this: unknown, w: number, h: number) {
    resize.call(this, w, h);
    mrt();
  };
  mrt();

  // custom ShaderMaterials drawn in the normal pass must write the aux too (else undefined)
  let wrapped = 0;
  const wrapAll = () => {
    scene.traverse((o) => {
      const mm = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mm) return;
      for (const m of Array.isArray(mm) ? mm : [mm]) if ((m as THREE.ShaderMaterial).isShaderMaterial && wrapAuxShader(m as THREE.ShaderMaterial)) wrapped++;
    });
  };
  wrapAll();

  // pass
  const pos = Array.from({ length: POOL_MAX }, () => new THREE.Vector3());
  const col = Array.from({ length: POOL_MAX }, () => new THREE.Color());
  const dist = new Array<number>(POOL_MAX).fill(0);
  const T = engine.toonUniforms as Record<string, THREE.IUniform>;
  const U = {
    tAux: { value: null as THREE.Texture | null },
    uPLn: { value: 0 },
    uPLpos: { value: pos },
    uPLcol: { value: col },
    uPLdist: { value: dist },
    uPointShape: T.uPointShape ?? { value: new THREE.Vector3(0.6, 1.8, 0.6) },
    uPointLevels: T.uPointLevels ?? { value: 3 },
    uNoiseScale: T.uNoiseScale ?? { value: 0.35 },
  };
  const material = pipe.makeLowresMaterial({ fragment: POOL_FRAG, uniforms: U as unknown as Record<string, THREE.IUniform> });
  const lights: THREE.Light[] = [];
  let lit = 0;
  let passOn = 0;
  let passOff = 0;
  let frames = 0;
  const pass = {
    name: POOL_PASS,
    order: 1,
    enabled: false,
    material,
    update() {
      const rt = pipe.rtNormal as (THREE.WebGLRenderTarget & { textures?: THREE.Texture[] }) | undefined;
      U.tAux.value = rt?.textures?.[1] ?? null;
    },
  };
  pipe.addPass(pass);
  // first preRender hook: the frame's lights (visible, in three's order), all off the camera's layers
  const hook = () => {
    if (++frames % RESCAN_FRAMES === 0) wrapAll();
    lights.length = 0;
    scene.traverseVisible((o) => {
      const l = o as THREE.PointLight & THREE.SpotLight;
      if (!l.isPointLight && !l.isSpotLight) return;
      if (!l.layers.isEnabled(POOL_LIGHT_LAYER) || l.layers.mask !== 1 << POOL_LIGHT_LAYER) l.layers.set(POOL_LIGHT_LAYER);
      lights.push(l);
    });
    const cam = (engine.camera as unknown as { cam: THREE.Camera }).cam;
    cam.updateMatrixWorld();
    lit = packPool(lights, cam.matrixWorldInverse, pos, col, dist);
    U.uPLn.value = lit;
    pass.enabled = lit > 0 && !!(pipe.rtNormal as { textures?: unknown[] } | undefined)?.textures;
    if (pass.enabled) passOn++;
    else passOff++;
  };
  pipe.preRender.unshift(hook);
  // hide the lights now (before the warm-up compiles anything)
  hook();

  let disposed = false;
  return {
    info: () => ({ lights: lights.length, lit, passOn, passOff, wrapped }),
    dispose() {
      if (disposed) return;
      disposed = true;
      const k = pipe.preRender.indexOf(hook);
      if (k >= 0) pipe.preRender.splice(k, 1);
      pipe.passes = pipe.passes.filter((p) => p !== (pass as unknown));
      if (pipe.resize !== resize) pipe.resize = resize;
      material.dispose();
      for (const r of restores) r();
    },
  };
}

// ------------------------------------------------------------------ stats (any non-empty switch)
export interface LightStats {
  /** renderAt ms: mean / p50 / p95 over the last window. */
  renderAt(): { n: number; mean: number; p50: number; p95: number };
  /** Shadow draws per frame (mean over the window) and the frame's last value. */
  shadow(): { meanCalls: number; last: number; renders: number };
  reset(): void;
  dispose(): void;
}

const WIN = 600;

export function installLightStats(engine: HostedEngine): LightStats {
  const r = engine.renderer;
  const sm = r.shadowMap as THREE.WebGLShadowMap & { render(lights: THREE.Light[], scene: THREE.Scene, cam: THREE.Camera): void };
  const ms = new Float64Array(WIN);
  const sh = new Float64Array(WIN);
  let n = 0;
  let renders = 0;
  let frameShadow = 0;
  let last = 0;
  const smRender = sm.render;
  sm.render = function (this: unknown, lights, scene, cam) {
    const c0 = r.info.render.calls;
    smRender.call(this, lights, scene, cam);
    const d = r.info.render.calls - c0;
    if (d > 0) renders++;
    frameShadow += d;
  };
  const renderAt = engine.renderAt;
  engine.renderAt = function (this: unknown, t: number) {
    frameShadow = 0;
    const t0 = performance.now();
    renderAt.call(this, t);
    const dt = performance.now() - t0;
    ms[n % WIN] = dt;
    sh[n % WIN] = frameShadow;
    last = frameShadow;
    n++;
  } as typeof engine.renderAt;
  const window = () => Math.min(n, WIN);
  return {
    renderAt() {
      const k = window();
      if (!k) return { n: 0, mean: 0, p50: 0, p95: 0 };
      const a = Array.from(ms.subarray(0, k)).sort((x, y) => x - y);
      const mean = a.reduce((s, x) => s + x, 0) / k;
      const q = (f: number) => a[Math.min(k - 1, Math.floor(f * k))]!;
      return { n: k, mean: +mean.toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3) };
    },
    shadow() {
      const k = window();
      let s = 0;
      for (let i = 0; i < k; i++) s += sh[i]!;
      return { meanCalls: k ? +(s / k).toFixed(2) : 0, last, renders };
    },
    reset() {
      n = 0;
      renders = 0;
    },
    dispose() {
      sm.render = smRender;
      engine.renderAt = renderAt;
    },
  };
}
