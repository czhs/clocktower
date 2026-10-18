// v3.3 tiles (v33-tiles). Cached static layer behind `ct.debug.v3tiles` (docs/perf-v3/tiles.md): the static town
// (kit solid meshes of the cottages / props / tower, the ground) is rendered ONCE into world-anchored tiles at the
// internal resolution and composited each frame; only the dynamic things (avatars, doors, water, foliage + soft
// dressing under the canopy fade, glass, the dais, life, the tower face) draw live, depth-tested against the cache.
// One of the modules allowed to import '@pixel3d/*' (game3d/vendor/**). Pure tile math: ../tiles/tileMath.ts.
//
// What a tile holds (ring textures, one texel per frame pixel, see tileMath.ts for the lattice):
//   tSh / tMid / tHi  the toon colour of each static fragment with its light level FORCED into the shadow / mid / hi
//                     band (uCtBake 1 / 2 / 3; tMid.a = the fragment's unshadowed light level `toonLit`), with the
//                     point lights, emissive and the cut-away circle already applied (all linear in the band mix);
//   tN                the normal pass (view normal + outline flag);
//   tD                the colour bake's depth (orthographic, re-based per frame: tileMath depthShift).
// The composite (one full-screen quad drawn FIRST inside the live colour / normal renders, so the live shadow map of
// that frame exists) rebuilds the lighting the cache cannot hold: S = cast shadow (the live sun shadow map, static +
// dynamic casters, incl. the penumbra taps) x cloud shadow (CLOUD_GLSL at the reconstructed world point), L =
// toonLit x S, band weights -> mix of the three cached colours. That is the toon material's own formula
// (materials/toon.js), so a still matches the live renderer up to float noise.
//
// Live exceptions: the cut-away boxes (player box, door cottage: their screen windows are re-rendered live from the
// static set with a cropped camera), meshes that turn out to move (auto-demoted to live, their footprint
// invalidated), interiors (the town is parked: tiles off), night / golden point-light pools (tiles off while a pool
// light is lit: their 8 fps flicker and re-aim would re-bake every frame; plan in tiles.md).
import * as THREE from 'three';
import * as toonNS from '@pixel3d/materials/toon.js';
import type { HostedEngine } from './engineHost';
import type { BuiltTown } from './town';
import { axisFrame, cellBounds, depthShift, lightKey, mergeRects, ringBytes, ringFor, slotRect, tileCentre, TileBook, windowRect, type PxRect, type RingSpec } from '../tiles/tileMath';

/** three layer of the cached static meshes (the main camera keeps it enabled unless the cache is active). */
export const STATIC_LAYER = 10;
/** Tile size (cells = texels). */
export const TILE = 128;
/** Missing visible tiles baked in one frame before the frame falls back to a live render. */
export const FORCE_MAX = 6;
/** Stale / prefetch tiles baked per frame. */
export const BAKE_BUDGET = 1;
/** Ring cap (texels per side). */
export const RING_MAX = 2048;
const MAX_RECTS = 8;
/** Frames between two light-key checks. */
export const LIGHT_EVERY = 8;

const toon = toonNS as unknown as { NOISE_GLSL: string; CLOUD_GLSL: string };

export interface TilesOptions {
  /** materials of the canopy fade (world/canopy.ts): never cached */
  canopy: ReadonlySet<THREE.Material>;
  /** the cpu tier (no shadow map, the cloud noise compiled out of the toon shader): the composite compiles both out */
  noClouds?: boolean;
  /** start enabled (`ct.debug.v3tiles=1`) or patched-but-off (`=ab`, for A/B stills) */
  enabled: boolean;
}

export interface TilesInfo {
  enabled: boolean;
  active: boolean;
  why: string;
  staticMeshes: number;
  demoted: number;
  demotedWhy: string[];
  relightWhy: Record<string, number>;
  patchedMats: number;
  ring: RingSpec | null;
  ringMB: number;
  tiles: { valid: number; stale: number };
  frame: { visible: number; missing: number; baked: number; rects: number; rectMeshes: number; live: boolean; tickMs: number };
  totals: { tickMs: number; frames: number; activeFrames: number; liveFallback: number; bakes: number; bakeMs: number; maxBakeMsFrame: number; relights: number; flushes: number; invalidations: number };
}

export interface TileLayer {
  setEnabled(on: boolean): void;
  info(): TilesInfo;
  dispose(): void;
}

interface StaticRec {
  mesh: THREE.Mesh;
  m: Float64Array;
  geo: THREE.BufferGeometry;
  ver: number;
  dr0: number;
  dr1: number;
  /** cell bounds [k0, k1, l0, l1] of its world box in the current snap space (null until computed) */
  cb: [number, number, number, number] | null;
}

const BAKE_HEAD = /* glsl */ `
uniform float uCtBake;
uniform float uCtBakeL;
uniform vec4 uCtRects[8];
uniform float uCtRectN;`;
// a static mesh drawn LIVE inside the cut windows only (the rest of it comes from the cache)
const RECT_TEST = /* glsl */ `
  if (uCtRectN > 0.5) {
    vec2 ctPx = floor(gl_FragCoord.xy);
    bool ctIn = false;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= uCtRectN) break;
      vec4 r = uCtRects[i];
      if (ctPx.x >= r.x && ctPx.y >= r.y && ctPx.x < r.z && ctPx.y < r.w) ctIn = true;
    }
    if (!ctIn) discard;
  }`;
const BAND_LINE = 'vec3 toonW = bandWeights(toonL, vToonCut);';
const TAIL = '#include <dithering_fragment>';
const KEY = '|ct-tiles1';

type Compile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;

function attrVer(g: THREE.BufferGeometry): number {
  return ((g.attributes.position as THREE.BufferAttribute | undefined)?.version ?? 0) + (g.index?.version ?? 0);
}

function isVisible(o: THREE.Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

export function installTiles(engine: HostedEngine, town: BuiltTown, o: TilesOptions): TileLayer {
  const renderer = engine.renderer;
  const scene = engine.scene;
  const pcam = engine.camera;
  const cam = pcam.cam;
  const pipe = engine.pipeline as unknown as { render(): void; rtScene?: THREE.WebGLRenderTarget; rtNormal?: THREE.WebGLRenderTarget; size?: THREE.Vector2 };
  const U = engine.uniforms as Record<string, { value: unknown }>;
  const T = engine.toonUniforms as Record<string, { value: unknown }>;
  const sun = engine.sun as THREE.DirectionalLight;
  const root = town.root as THREE.Object3D;
  const reg = town.registry as unknown as { get(id: string): { group?: THREE.Object3D } | undefined; anchors(k: string): { pivot?: THREE.Object3D }[] };
  const cutU = (engine as unknown as { _townCut?: Record<string, { value: unknown }> })._townCut ?? null;

  // ---------------------------------------------------------------- classification (static set)
  const skip = new Set<THREE.Object3D>();
  for (const a of reg.anchors('doors')) if (a.pivot) a.pivot.traverse((x) => skip.add(x));
  const pieceIds = ['ground', 'props', 'clocktower', ...Array.from({ length: 15 }, (_, i) => `house-${i}`)];
  const statics: StaticRec[] = [];
  const mats = new Set<THREE.Material>();
  const defBefore = THREE.Object3D.prototype.onBeforeRender;
  for (const id of pieceIds) {
    reg.get(id)?.group?.traverse((x) => {
      if (skip.has(x)) return;
      const mesh = x as THREE.Mesh;
      if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
      if ((mesh.geometry as unknown as { isInstancedBufferGeometry?: boolean }).isInstancedBufferGeometry) return;
      if (/^ct-|hands|timer/.test(mesh.name) || /^ct-|hands/.test(mesh.parent?.name ?? '')) return;
      const mat = mesh.material;
      if (!mat || Array.isArray(mat)) return;
      if (!(mat.userData as { toon?: unknown }).toon || o.canopy.has(mat) || mat.transparent) return;
      if ((mesh.userData as { layer?: string }).layer === 'soft') return;
      if (mesh.customDepthMaterial || mesh.layers.mask !== 1 || !mesh.receiveShadow || mesh.onBeforeRender !== defBefore) return;
      if (!Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') || !isVisible(mesh)) return;
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      statics.push({ mesh, m: new Float64Array(mesh.matrixWorld.elements), geo: g, ver: attrVer(g), dr0: g.drawRange.start, dr1: g.drawRange.count, cb: null });
      mats.add(mat);
    });
  }

  // ---------------------------------------------------------------- material patch (before the warm-up compiles)
  const rects = Array.from({ length: MAX_RECTS }, () => new THREE.Vector4());
  const bake = { uCtBake: { value: 0 }, uCtBakeL: { value: 0 }, uCtRects: { value: rects }, uCtRectN: { value: 0 } };
  const lightUniforms = new Set<Record<string, { value: unknown }>>();
  let patchedMats = 0;
  for (const mat of mats) {
    const prev = mat.onBeforeCompile as Compile | undefined;
    const key0 = mat.customProgramCacheKey.bind(mat);
    mat.onBeforeCompile = function (this: THREE.Material, shader, r) {
      prev?.call(this, shader, r);
      if (!shader.fragmentShader.includes(BAND_LINE) || !shader.fragmentShader.includes(TAIL)) return;
      Object.assign(shader.uniforms, bake);
      const own = (this as unknown as { __ctRectN?: { value: number } }).__ctRectN;
      if (own) shader.uniforms.uCtRectN = own;
      lightUniforms.add(shader.uniforms as Record<string, { value: unknown }>);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${BAKE_HEAD}\nvoid main() {\n${RECT_TEST}`)
        .replace(BAND_LINE, `if (uCtBake > 0.5) toonL = uCtBakeL;\n        ${BAND_LINE}`)
        .replace(TAIL, `${TAIL}\n        if (uCtBake > 1.5 && uCtBake < 2.5) gl_FragColor.a = toonLit;`);
    } as Compile;
    mat.customProgramCacheKey = () => `${key0()}${KEY}`;
    mat.needsUpdate = true;
    patchedMats++;
  }

  // static meshes -> their own layer; the main camera and every light see it (identical live renders while off)
  for (const s of statics) s.mesh.layers.set(STATIC_LAYER);
  cam.layers.enable(STATIC_LAYER);
  scene.traverse((x) => {
    if ((x as THREE.Light).isLight && x.layers.test(cam.layers)) x.layers.enable(STATIC_LAYER);
  });

  // ---------------------------------------------------------------- composite quad (drawn first in the live passes)
  const cu = {
    tSh: { value: null as THREE.Texture | null },
    tMid: { value: null as THREE.Texture | null },
    tHi: { value: null as THREE.Texture | null },
    tN: { value: null as THREE.Texture | null },
    tD: { value: null as THREE.Texture | null },
    tShadow: { value: null as THREE.Texture | null },
    uOrigin: { value: new THREE.Vector2() },
    uRing: { value: new THREE.Vector2(1, 1) },
    uPar: { value: new THREE.Vector2() },
    uShift: { value: 0 },
    uBakeF: { value: 0 },
    uNearFar: { value: new THREE.Vector2(0.1, 400) },
    uTexel: { value: 0.1 },
    uR: { value: new THREE.Vector3() },
    uUp: { value: new THREE.Vector3() },
    uF: { value: new THREE.Vector3() },
    uRects: { value: rects },
    uRectN: { value: 0 },
    uShadowM: { value: new THREE.Matrix4() },
    uShadowP: { value: new THREE.Vector4() }, // bias, normalBias, intensity, on
    uShadowSize: { value: new THREE.Vector2(1, 1) },
    uPassMode: U.uPassMode!,
    uTime: U.uTime!,
    uSunDir: U.uSunDir!,
    uBandThr: T.uBandThr!,
    uBandSoft: T.uBandSoft!,
    uPenumbra: T.uPenumbra!,
    uCloud: T.uCloud!,
    uCloudWind: T.uCloudWind!,
    uCloudShape: T.uCloudShape!,
  };
  const quadMat = new THREE.ShaderMaterial({
    name: 'ct-tiles-composite',
    uniforms: cu,
    // SwiftShader runs both sides of a uniform branch (docs/perf-v3/cpu.md): the cpu tier compiles the unused code out
    defines: o.noClouds ? { CT_NO_CLOUDS: '', CT_NO_SHADOW: '' } : {},
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
#include <packing>
uniform int uPassMode;
uniform float uTime;
uniform vec3 uSunDir;
uniform sampler2D tSh, tMid, tHi, tN, tD, tShadow;
uniform vec2 uOrigin, uRing, uPar, uNearFar, uShadowSize;
uniform float uShift, uBakeF, uTexel;
uniform vec3 uR, uUp, uF;
uniform vec4 uRects[${MAX_RECTS}];
uniform float uRectN;
uniform mat4 uShadowM;
uniform vec4 uShadowP;
uniform vec2 uBandThr, uPenumbra;
uniform float uBandSoft;
${toon.NOISE_GLSL}
${toon.CLOUD_GLSL}
float ctShadow(vec4 sc) {
  sc.xyz /= sc.w;
  sc.z += uShadowP.x;
  float s = 1.0;
  if (sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0 && sc.z <= 1.0) s = step(sc.z, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
  return mix(1.0, s, uShadowP.z);
}
void main() {
  vec2 px = floor(gl_FragCoord.xy);
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (float(i) >= uRectN) break;
    vec4 r = uRects[i];
    if (px.x >= r.x && px.y >= r.y && px.x < r.z && px.y < r.w) discard;
  }
  vec2 cell = uOrigin + px;
  ivec2 rc = ivec2(mod(cell, uRing));
  float d = texelFetch(tD, rc, 0).x;
  if (d >= 1.0) discard;
  gl_FragDepth = clamp(d + uShift, 0.0, 1.0);
  vec4 n4 = texelFetch(tN, rc, 0);
  if (uPassMode == 1) { gl_FragColor = n4; return; }
  vec4 cMid = texelFetch(tMid, rc, 0);
  vec4 cHi = texelFetch(tHi, rc, 0);
  vec4 cSh = texelFetch(tSh, rc, 0);
  vec3 P = uR * ((cell.x + 0.5 * (1.0 - uPar.x)) * uTexel) + uUp * ((cell.y + 0.5 * (1.0 - uPar.y)) * uTexel)
         + uF * (uBakeF + uNearFar.x + d * (uNearFar.y - uNearFar.x));
  vec3 nv = normalize(n4.xyz * 2.0 - 1.0);
  vec3 Nw = normalize(nv.x * uR + nv.y * uUp - nv.z * uF);
  float sh = 1.0;
#ifndef CT_NO_SHADOW
  if (uShadowP.w > 0.5) {
    vec4 sc = uShadowM * vec4(P + Nw * uShadowP.y, 1.0);
    sh = ctShadow(sc);
    if (uPenumbra.x > 0.0 && sh > 0.5 && Nw.y > 0.55) {
      vec2 po = vec2(uPenumbra.x / max(uPenumbra.y, 1e-4)) / uShadowSize;
      float pn = ctShadow(sc + vec4(po.x, 0.0, 0.0, 0.0)) * ctShadow(sc - vec4(po.x, 0.0, 0.0, 0.0))
               * ctShadow(sc + vec4(0.0, po.y, 0.0, 0.0)) * ctShadow(sc - vec4(0.0, po.y, 0.0, 0.0));
      sh = pn > 0.5 ? 1.0 : 0.5;
    }
  }
#endif
#ifdef CT_NO_CLOUDS
  float cl = 1.0;
#else
  float cl = cloudAtten(P);
#endif
  float L = cMid.a * sh * cl;
  float s = max(uBandSoft, 1e-4);
  float hi = smoothstep(uBandThr.y - s, uBandThr.y + s, L);
  float md = smoothstep(uBandThr.x - s, uBandThr.x + s, L);
  gl_FragColor = vec4((1.0 - md) * cSh.rgb + (md - hi) * cMid.rgb + hi * cHi.rgb, cHi.a);
}`,
    depthTest: true,
    depthWrite: true,
    depthFunc: THREE.AlwaysDepth,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
  quad.name = 'ct-tiles-composite';
  quad.frustumCulled = false;
  quad.renderOrder = -1e9;
  quad.visible = false;
  quad.castShadow = false;
  quad.receiveShadow = false;
  quad.onBeforeRender = () => {
    const map = sun.shadow?.map?.texture ?? null;
    cu.tShadow.value = map;
    cu.uShadowM.value.copy(sun.shadow.matrix);
    cu.uShadowP.value.set(sun.shadow.bias, sun.shadow.normalBias, sun.shadow.intensity ?? 1, map && sun.castShadow && renderer.shadowMap.enabled ? 1 : 0);
    cu.uShadowSize.value.copy(sun.shadow.mapSize);
  };
  scene.add(quad);

  // ---------------------------------------------------------------- ring targets
  let ring: RingSpec | null = null;
  let book: TileBook | null = null;
  const rt: { sh?: THREE.WebGLRenderTarget; mid?: THREE.WebGLRenderTarget; hi?: THREE.WebGLRenderTarget; n?: THREE.WebGLRenderTarget } = {};
  const makeRT = (w: number, h: number, depthTex: boolean) => {
    const r = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true });
    if (depthTex) {
      r.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
      r.depthTexture.minFilter = r.depthTexture.magFilter = THREE.NearestFilter;
    }
    return r;
  };
  const freeRing = () => {
    for (const k of ['sh', 'mid', 'hi', 'n'] as const) {
      rt[k]?.depthTexture?.dispose();
      rt[k]?.dispose();
      delete rt[k];
    }
    ring = null;
    book = null;
  };
  const ensureRing = (w: number, h: number) => {
    const want = ringFor(w, h, TILE, 1, RING_MAX);
    if (ring && ring.NI === want.NI && ring.NJ === want.NJ) return;
    freeRing();
    ring = want;
    book = new TileBook(want);
    const W = want.NI * want.T;
    const H = want.NJ * want.T;
    rt.sh = makeRT(W, H, false);
    rt.mid = makeRT(W, H, false);
    rt.hi = makeRT(W, H, true);
    rt.n = makeRT(W, H, false);
    cu.tSh.value = rt.sh.texture;
    cu.tMid.value = rt.mid.texture;
    cu.tHi.value = rt.hi.texture;
    cu.tN.value = rt.n.texture;
    cu.tD.value = rt.hi.depthTexture;
    cu.uRing.value.set(W, H);
  };

  // ---------------------------------------------------------------- per-frame state
  let enabled = o.enabled;
  let active = false;
  let why = 'init';
  let geoKey = '';
  let litKey = '';
  const totals = { tickMs: 0, frames: 0, activeFrames: 0, liveFallback: 0, bakes: 0, bakeMs: 0, maxBakeMsFrame: 0, relights: 0, flushes: 0, invalidations: 0 };
  const frame = { visible: 0, missing: 0, baked: 0, rects: 0, rectMeshes: 0, live: false, tickMs: 0 };
  const rectMeshes: THREE.Mesh[] = [];
  let demoted = 0;
  const demotedWhy: string[] = [];
  const R = new THREE.Vector3();
  const Up = new THREE.Vector3();
  const F = new THREE.Vector3();
  const bakeCam = new THREE.OrthographicCamera();
  bakeCam.layers.set(STATIC_LAYER);
  let ax = axisFrame(0, 1);
  let ay = axisFrame(0, 1);
  let liveRects: PxRect[] = [];
  const pointLights: THREE.PointLight[] = [];
  scene.traverse((x) => {
    if ((x as THREE.PointLight).isPointLight) pointLights.push(x as THREE.PointLight);
  });
  const skyC = (engine.style as { sky: THREE.Color }).sky;
  const normalClear = new THREE.Color(0.5, 0.5, 1.0);
  const tmpBox = new THREE.Box3();
  const corner = new THREE.Vector3();

  const lightValues: number[] = [];
  const pushVal = (v: unknown) => {
    if (typeof v === 'number') lightValues.push(v);
    else if (typeof v === 'boolean') lightValues.push(v ? 1 : 0);
    else if (v && typeof v === 'object') {
      const x = v as { isColor?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean; r: number; g: number; b: number; x: number; y: number; z: number; w: number };
      if (x.isColor) lightValues.push(x.r, x.g, x.b);
      else if (x.isVector4) lightValues.push(x.x, x.y, x.z, x.w);
      else if (x.isVector3) lightValues.push(x.x, x.y, x.z);
      else if (x.isVector2) lightValues.push(x.x, x.y);
      else if (Array.isArray(v)) for (const e of v as unknown[]) pushVal(e);
    }
  };
  // uniforms the composite evaluates live (or that never change the baked look) are not part of the light key
  const LIVE = /^(uTime|uPassMode|uCtBake|uCtBakeL|uCtRect|uCut|uCtCan|uCloud|uPenumbra|uCameraPos|uCameraDir|uCamFlight)/;
  const lightNames: string[] = [];
  let prevValues: number[] = [];
  const relightWhy = new Map<string, number>();
  const computeLightKey = (): string => {
    lightValues.length = 0;
    lightNames.length = 0;
    const named = (name: string, v: unknown) => {
      const n0 = lightValues.length;
      pushVal(v);
      for (let q = n0; q < lightValues.length; q++) lightNames.push(name);
    };
    named('sunDir', U.uSunDir!.value);
    named('sunColor', sun.color);
    named('sunI', sun.intensity);
    named('sky', skyC);
    for (const u of lightUniforms) for (const k in u) if (!LIVE.test(k)) named(k, u[k]!.value);
    return lightKey(lightValues);
  };
  /** Which uniforms changed since the last relight (debug: info().relightWhy). */
  const noteRelight = () => {
    if (prevValues.length === lightValues.length)
      for (let q = 0; q < lightValues.length; q++)
        if (Math.abs(lightValues[q]! - prevValues[q]!) > 1e-4 && relightWhy.size < 24) relightWhy.set(lightNames[q]!, (relightWhy.get(lightNames[q]!) ?? 0) + 1);
    prevValues = lightValues.slice();
  };

  const anyPoolLit = (): boolean => {
    for (const l of pointLights) if (l.intensity > 0 && l.layers.test(cam.layers) && isVisible(l)) return true;
    return false;
  };

  /** A static mesh that changed (moved, shown / hidden, geometry rewritten): back to the live set, footprint dropped. */
  let armed = false;
  const snapshot = (s: StaticRec) => {
    s.m.set(s.mesh.matrixWorld.elements);
    s.geo = s.mesh.geometry;
    s.ver = attrVer(s.geo);
    s.dr0 = s.geo.drawRange.start;
    s.dr1 = s.geo.drawRange.count;
  };
  const checkStatics = () => {
    if (!armed) {
      // the first enabled frame: the matrices of the last rendered frame are the reference (the install ran before
      // the composer's placement was folded into matrixWorld)
      armed = true;
      for (const s of statics) snapshot(s);
      return;
    }
    for (let k = statics.length - 1; k >= 0; k--) {
      const s = statics[k]!;
      const me = s.mesh;
      const e = me.matrixWorld.elements;
      let moved = false;
      for (let q = 0; q < 16; q++)
        if (e[q] !== s.m[q]) {
          moved = true;
          break;
        }
      const g = me.geometry;
      const ver = attrVer(g);
      if (!moved && g === s.geo && ver === s.ver && g.drawRange.start === s.dr0 && g.drawRange.count === s.dr1 && isVisible(me)) continue;
      // demote
      if (demotedWhy.length < 16) demotedWhy.push(`${me.name || me.parent?.name || '?'}:${moved ? 'moved' : g !== s.geo ? 'geometry' : ver !== s.ver ? 'attr' : !isVisible(me) ? 'hidden' : 'drawRange'}`);
      statics.splice(k, 1);
      me.layers.set(0);
      demoted++;
      invalidateMesh(s);
    }
  };
  const meshCells = (_m: THREE.Mesh, g: THREE.BufferGeometry, mw: THREE.Matrix4, pad: number): [number, number, number, number] | null => {
    if (!g.boundingBox) return null;
    const pts: { r: number; u: number }[] = [];
    tmpBox.copy(g.boundingBox).applyMatrix4(mw);
    for (let c = 0; c < 8; c++) {
      corner.set(c & 1 ? tmpBox.max.x : tmpBox.min.x, c & 2 ? tmpBox.max.y : tmpBox.min.y, c & 4 ? tmpBox.max.z : tmpBox.min.z);
      pts.push({ r: corner.dot(R), u: corner.dot(Up) });
    }
    return cellBounds(pts, pcam.texelWorld, ax.parity, ay.parity, pad);
  };
  const invalidateMesh = (s: StaticRec) => {
    if (!book || !s.geo.boundingBox) return;
    const pts: { r: number; u: number }[] = [];
    for (const mat of [new THREE.Matrix4().fromArray(s.m), s.mesh.matrixWorld]) {
      tmpBox.copy(s.geo.boundingBox).applyMatrix4(mat);
      for (let c = 0; c < 8; c++) {
        corner.set(c & 1 ? tmpBox.max.x : tmpBox.min.x, c & 2 ? tmpBox.max.y : tmpBox.min.y, c & 4 ? tmpBox.max.z : tmpBox.min.z);
        pts.push({ r: corner.dot(R), u: corner.dot(Up) });
      }
    }
    const [k0, k1, l0, l1] = cellBounds(pts, pcam.texelWorld, ax.parity, ay.parity, 3);
    totals.invalidations += book.invalidateCells(k0, k1, l0, l1);
  };

  const camF = () => cam.position.dot(F);
  const bakeF = () => -(Number((pcam as unknown as { distance?: number }).distance) || 120); // fixed: a tile's depth never depends on the camera's pan

  /** Bake tile (i, j) into its ring slot (3 colour variants + the normal pass). */
  const bakeTile = (i: number, j: number) => {
    if (!ring || !book) return;
    const t = pcam.texelWorld;
    const half = (TILE / 2) * t;
    const cx = tileCentre(i, TILE, ax.parity) * t;
    const cy = tileCentre(j, TILE, ay.parity) * t;
    bakeCam.left = -half;
    bakeCam.right = half;
    bakeCam.top = half;
    bakeCam.bottom = -half;
    bakeCam.near = cam.near;
    bakeCam.far = cam.far;
    bakeCam.updateProjectionMatrix();
    bakeCam.quaternion.copy(cam.quaternion);
    bakeCam.position.set(0, 0, 0).addScaledVector(R, cx).addScaledVector(Up, cy).addScaledVector(F, bakeF());
    bakeCam.updateMatrixWorld(true);
    const [x, y, w, h] = slotRect(i, j, ring);
    const pass = (target: THREE.WebGLRenderTarget, mode: number, L: number, normal: boolean) => {
      target.viewport.set(x, y, w, h);
      target.scissor.set(x, y, w, h);
      target.scissorTest = true;
      bake.uCtBake.value = mode;
      bake.uCtBakeL.value = L;
      (U.uPassMode as { value: number }).value = normal ? 1 : 0;
      renderer.setRenderTarget(target);
      if (normal) renderer.setClearColor(normalClear, 0);
      else renderer.setClearColor(skyC, 1);
      renderer.clear(true, true, true);
      renderer.render(scene, bakeCam);
      target.scissorTest = false;
      target.viewport.set(0, 0, target.width, target.height);
      target.scissor.set(0, 0, target.width, target.height);
    };
    const thr = T.uBandThr!.value as THREE.Vector2;
    pass(rt.sh!, 1, 0, false);
    pass(rt.mid!, 2, (thr.x + thr.y) / 2, false);
    pass(rt.hi!, 3, 1, false);
    pass(rt.n!, 0, 0, true);
    book.baked(i, j);
    totals.bakes++;
  };

  /** Run bakes with the renderer state of a bake (and restore it). */
  const withBakeState = (fn: () => void) => {
    const sm = renderer.shadowMap;
    const smAuto = sm.autoUpdate;
    const smNeeds = sm.needsUpdate;
    const prevRT = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    const sInt = sun.shadow.intensity ?? 1;
    const boxN = cutU ? (cutU.uCutBoxN!.value as number) : 0;
    const pm = (U.uPassMode as { value: number }).value;
    sm.autoUpdate = false;
    sm.needsUpdate = false;
    renderer.autoClear = false;
    sun.shadow.intensity = 0; // the cache holds unshadowed colour; the composite applies the live shadow map
    if (cutU) cutU.uCutBoxN!.value = 0; // the cut boxes are drawn live (their windows), the circle is baked
    try {
      fn();
    } finally {
      if (cutU) cutU.uCutBoxN!.value = boxN;
      sun.shadow.intensity = sInt;
      bake.uCtBake.value = 0;
      (U.uPassMode as { value: number }).value = pm;
      renderer.autoClear = autoClear;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setRenderTarget(prevRT);
      sm.autoUpdate = smAuto;
      sm.needsUpdate = smNeeds;
    }
  };

  /** Before the vendor pipeline renders: decide, bake, set the composite's uniforms. */
  const tick = () => {
    const tt = performance.now();
    try {
      tickInner();
    } finally {
      frame.tickMs = performance.now() - tt;
      totals.tickMs += frame.tickMs;
    }
  };
  const tickInner = () => {
    totals.frames++;
    frame.baked = 0;
    frame.missing = 0;
    frame.rects = 0;
    frame.live = false;
    active = false;
    if (!enabled) return void (why = 'off');
    if (!isVisible(root)) return void (why = 'town hidden (room)');
    if (renderer.shadowMap.enabled && renderer.shadowMap.type !== THREE.BasicShadowMap) return void (why = 'shadow type');
    if (!pipe.size) return void (why = 'no pipeline size');
    // basis (yaw / pitch) and frame
    const yaw = pcam.yaw;
    const pitch = pcam.pitch;
    F.set(-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
    R.set(Math.cos(yaw), 0, -Math.sin(yaw));
    Up.crossVectors(R, F).normalize();
    const t = pcam.texelWorld;
    const W = pipe.size.x;
    const H = pipe.size.y;
    ax = axisFrame(Math.round(cam.position.dot(R) / t), W);
    ay = axisFrame(Math.round(cam.position.dot(Up) / t), H);
    checkStatics();
    if (anyPoolLit()) return void (why = 'point lights lit');
    ensureRing(W, H);
    if (!ring || !book) return void (why = 'no ring');
    const cyl = cutU ? `${cutU.uCutOn!.value}|${(cutU.uCutCyl!.value as THREE.Vector4).toArray().join(',')}` : '';
    const gk = `${yaw}|${pitch}|${t}|${ax.parity}${ay.parity}|${ring.NI}x${ring.NJ}|${cyl}`;
    if (gk !== geoKey) {
      geoKey = gk;
      book.flush();
      totals.flushes++;
      for (const st of statics) st.cb = meshCells(st.mesh, st.geo, st.mesh.matrixWorld, 2);
    }
    // lighting steps are slow (>= 15 game seconds, 0.5 deg sun steps): checking every LIGHT_EVERY frames is enough
    // (tiles stay displayable while stale) and keeps the per-frame cost of the key off the frame
    const lk = totals.frames % LIGHT_EVERY === 0 || !litKey ? computeLightKey() : litKey;
    if (lk !== litKey) {
      litKey = lk;
      noteRelight();
      book.relight();
      totals.relights++;
    }
    const plan = book.plan(ax.origin, ay.origin, W, H, 1);
    frame.visible = plan.visible;
    frame.missing = plan.missing.length;
    const t0 = performance.now();
    let live = false;
    withBakeState(() => {
      let todo: [number, number][];
      if (plan.missing.length > FORCE_MAX) {
        // too much to bake in one frame (a cut, a zoom, the first frame): live this frame, bake a few
        live = true;
        todo = plan.missing.slice(0, FORCE_MAX);
      } else todo = [...plan.missing, ...plan.stale.slice(0, BAKE_BUDGET), ...(plan.stale.length ? [] : plan.prefetch.slice(0, BAKE_BUDGET))];
      for (const [i, j] of todo) bakeTile(i, j);
      frame.baked = todo.length;
    });
    const ms = performance.now() - t0;
    if (frame.baked) {
      totals.bakeMs += ms;
      totals.maxBakeMsFrame = Math.max(totals.maxBakeMsFrame, ms);
    }
    if (live) {
      frame.live = true;
      totals.liveFallback++;
      return void (why = 'baking (live frame)');
    }
    // composite uniforms
    cu.uOrigin.value.set(ax.origin, ay.origin);
    cu.uPar.value.set(ax.parity, ay.parity);
    cu.uTexel.value = t;
    cu.uR.value.copy(R);
    cu.uUp.value.copy(Up);
    cu.uF.value.copy(F);
    cu.uBakeF.value = bakeF();
    cu.uNearFar.value.set(cam.near, cam.far);
    cu.uShift.value = depthShift(bakeF(), camF(), cam.near, cam.far);
    // the cut-away boxes' screen windows: re-rendered live
    const list: PxRect[] = [];
    if (cutU && (cutU.uCutOn!.value as number) > 0.5) {
      const n = cutU.uCutBoxN!.value as number;
      const S = cutU.uCutBoxS!.value as THREE.Vector4[];
      for (let k = 0; k < n; k++) {
        const r = windowRect(S[k]!.x, S[k]!.y, S[k]!.z, S[k]!.w, t, ax, ay, 2);
        if (r) list.push(r);
      }
    }
    liveRects = mergeRects(list).slice(0, MAX_RECTS);
    for (let k = 0; k < MAX_RECTS; k++) {
      const r = liveRects[k];
      if (r) rects[k]!.set(r.x0, r.y0, r.x1, r.y1);
      else rects[k]!.set(0, 0, 0, 0);
    }
    cu.uRectN.value = liveRects.length;
    frame.rects = liveRects.length;
    active = true;
    totals.activeFrames++;
    why = 'active';
  };

  // the rect test is per OBJECT (the kit materials are shared with live meshes: doors, the dais, boards): a clipped
  // static mesh draws with a twin of its material whose uCtRectN is live (same program: same cache key)
  let rectCount = 0;
  const rectN = { get value() { return rectCount; }, set value(_v: number) { /* read-only */ } };
  const rectMats = new Map<THREE.Material, THREE.Material>();
  const origMats = new Map<THREE.Material, THREE.Material>();
  for (const mat of mats) {
    const twin = mat.clone();
    twin.onBeforeCompile = mat.onBeforeCompile;
    twin.customProgramCacheKey = mat.customProgramCacheKey;
    // Material.copy keeps neither `defines` (toon: TOON_TONE_ATTR, TOON_UNLIT_SH ...) nor the vendor's extra fields
    const md = (mat as unknown as { defines?: Record<string, unknown> }).defines;
    if (md) (twin as unknown as { defines: Record<string, unknown> }).defines = { ...md };
    (twin as unknown as { __ctRectN?: unknown }).__ctRectN = rectN;
    rectMats.set(mat, twin);
    origMats.set(twin, mat);
  }
  // ---------------------------------------------------------------- hooks
  let inPipeline = false;
  const origRender = renderer.render;
  renderer.render = function (this: THREE.WebGLRenderer, s: THREE.Object3D, c: THREE.Camera) {
    if (!inPipeline || s !== scene) return origRender.call(this, s, c);
    if (c !== cam) {
      // preRender hooks (water reflections) render the scene with their own cameras: they keep seeing the static set
      const m = c.layers.mask;
      c.layers.enable(STATIC_LAYER);
      try {
        return origRender.call(this, s, c);
      } finally {
        c.layers.mask = m;
      }
    }
    const target = renderer.getRenderTarget();
    if (!active || !target || (target !== pipe.rtScene && target !== pipe.rtNormal)) return origRender.call(this, s, c);
    // static meshes that touch a cut window draw LIVE in this render, clipped to the windows (RECT_TEST); the rest of
    // the static set comes from the composite quad
    const n = liveRects.length;
    rectMeshes.length = 0;
    if (n)
      for (const st of statics) {
        const cb = st.cb;
        if (!cb) continue;
        for (let k = 0; k < n; k++) {
          const r = liveRects[k]!;
          if (cb[0] - ax.origin < r.x1 && cb[1] - ax.origin > r.x0 && cb[2] - ay.origin < r.y1 && cb[3] - ay.origin > r.y0) {
            rectMeshes.push(st.mesh);
            st.mesh.layers.enable(0);
            st.mesh.material = rectMats.get(st.mesh.material as THREE.Material) ?? st.mesh.material;
            break;
          }
        }
      }
    rectCount = n;
    cam.layers.disable(STATIC_LAYER);
    quad.visible = true;
    try {
      origRender.call(this, s, c);
    } finally {
      quad.visible = false;
      cam.layers.enable(STATIC_LAYER);
      for (const m of rectMeshes) {
        m.layers.disable(0);
        const orig = origMats.get(m.material as THREE.Material);
        if (orig) m.material = orig;
      }
      frame.rectMeshes = rectMeshes.length;
    }
  } as typeof renderer.render;
  // the sun's shadow map is rendered inside the live colour pass (the main camera's layers): keep the static casters
  const sm = renderer.shadowMap as THREE.WebGLShadowMap & { render(lights: THREE.Light[], scene: THREE.Object3D, camera: THREE.Camera): void };
  const origShadow = sm.render;
  sm.render = function (this: unknown, lights: THREE.Light[], s: THREE.Object3D, c: THREE.Camera) {
    const m = c.layers.mask;
    // every caster: the static set, and the main camera's layers (a cut-window sub-camera sees only the static layer)
    c.layers.mask = m | cam.layers.mask | (1 << STATIC_LAYER);
    try {
      return origShadow.call(this, lights, s, c);
    } finally {
      c.layers.mask = m;
    }
  };
  const outer = pipe.render;
  pipe.render = function (this: unknown) {
    tick();
    inPipeline = true;
    try {
      return outer.call(this);
    } finally {
      inPipeline = false;
    }
  };

  let disposed = false;
  return {
    setEnabled(on) {
      enabled = on;
      if (!on) freeRing();
      geoKey = '';
    },
    info: () => ({
      enabled,
      active,
      why,
      staticMeshes: statics.length,
      demoted,
      demotedWhy: [...demotedWhy],
      relightWhy: Object.fromEntries(relightWhy),
      patchedMats,
      ring,
      ringMB: ring ? +(ringBytes(ring, 4) / 2 ** 20).toFixed(1) : 0,
      tiles: book ? book.count() : { valid: 0, stale: 0 },
      frame: { ...frame },
      totals: { ...totals, tickMs: +totals.tickMs.toFixed(1), bakeMs: +totals.bakeMs.toFixed(1), maxBakeMsFrame: +totals.maxBakeMsFrame.toFixed(2) },
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.render = origRender;
      sm.render = origShadow;
      pipe.render = outer;
      freeRing();
      quad.removeFromParent();
      quad.geometry.dispose();
      quadMat.dispose();
      for (const s of statics) s.mesh.layers.set(0);
    },
  };
}
