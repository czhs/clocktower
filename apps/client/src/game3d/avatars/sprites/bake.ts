// v3.3 sprites (default at the low / cpu tiers). The runtime baker: builds ONE vendor rig of a spec (a "kit"),
// drives it through every clip the game shows (idle, the shared ghost's idle, one locomotion cycle at the game speed,
// the held vote, the talk loop, the die collapse, the 'clips' ghost loops) and renders every displayed drawing in the
// 8 facings into RGBA8 atlas render targets, through the rig's OWN look material with extra output modes:
//
//   plane A  = view-space normal xy (8 bit each) + depth offset toward the camera from the feet plane (16 bit)
//   plane B  = palette slot / side (L, R, midline) / ghost halo, look.js part id, lift, bind height (atlas.ts)
//   plane C  = (specs with their own vertex GLSL only) up to 4 spec varyings, e.g. the 'clips' ghosts' vGhost
//
// i.e. a G-buffer of the INPUTS of the toon + look lighting, not a lit colour: the sprite material (material.ts)
// re-runs the same vendor shader per pixel with these inputs. Per drawing the kit also keeps the bone matrices for
// the shadow-only proxy (proxy.ts) and the lantern socket. A sheet is baked at the exact low-res texel size and camera
// pitch / yaw of the moment (the key): sprite texels map 1:1 onto the pipeline's texels.
//
// Cost control (docs/perf-v3/sprites.md §1.4):
//   - every bake runs as a sliced job (runner.ts): one simulation step / one cell / a proxy chunk per unit, at most
//     BAKE_BUDGET_MS of work per frame (layer.update pumps it), shader compiles are parallel (precompile.ts);
//   - the kit (rig + captured drawings, GPU buffers released between bakes) is kept per spec, so a new camera key
//     (vote camera, resize, a room) only re-renders cells: no rig build, no simulation, no program compile;
//   - finished sheets are read back asynchronously and stored in IndexedDB (cache.ts), keyed by the bake format, a
//     hash of the vendor sources + spec, the spec, texel, pitch, yaw and the clip set: a repeat join or a repeat
//     camera key builds no rig at all. Quota errors / private mode: the cache disables itself, bakes go on.
import * as THREE from 'three';
import { createDriver, setGhostLevel, socketOf, spawnCharacter, suppressSpecLights, type CharacterHandle } from '../../vendor/characters';
import { loadSpecObject, paletteOf, specSource, vendorSource } from '../../vendor/spriteLook';
import { canPrecompile, precompile } from '../precompile';
import { DIE_HOLD_S } from '../clips';
import {
  BIND_MAX,
  cellFor,
  compressSteps,
  customVaryings,
  DEPTH_LO,
  DEPTH_RANGE,
  DEPTH_STEPS,
  packShelves,
  RECT_STRIDE,
  tightCell,
  FACINGS,
  facingYaw,
  fnv1a,
  persistKey,
  type Timeline,
} from './atlas';
import type { SheetCache } from './cache';
import { createCacheClient } from './cacheClient';
import { clusterProxy } from './proxy';
import { createSliceRunner, type SliceGen, type SliceRunner } from './runner';

/** Game walking speed (m/s): PLAYER_SPEED 150 px/s at 16 px/m. */
export const GAME_SPEED_MPS = 150 / 16;
/** Bump when the baked data or its meaning changes (invalidates every cached sheet). */
export const BAKE_FORMAT = 3;
/** Work per frame for bakes (ms): the weak-laptop frame budget (docs/perf-v3/sprites.md). */
export const BAKE_BUDGET_MS = 4;
/** Kits (bake rigs) kept per engine. */
export const KIT_MAX = 24;
/** Tunables (debug / bench): per-frame budget, whether kits are kept between bakes. */
export const bakeConfig = { budgetMs: BAKE_BUDGET_MS, keepKits: true, persist: true, keepOld: 1 };
/** What the slice runner is doing (the longest unit's label is kept in the store stats). */
let phase = '';
const DT = 1 / 30;

export interface SheetCamera {
  /** Low-res texel size (m). */
  texel: number;
  pitch: number;
  yaw: number;
  /** The camera's world quaternion (the bake camera copies it). */
  quat: THREE.Quaternion;
}

export interface SheetProxy {
  geo: THREE.BufferGeometry;
  /** Bone matrices (3 RGBA32F texels per bone, one row per drawing, root frame). */
  bones: THREE.DataTexture;
  tris: number;
}

export interface SpriteSheet {
  key: string;
  specId: string;
  cam: { texel: number; pitch: number; yaw: number };
  /** Tight cell per (drawing, facing): RECT_STRIDE numbers each (atlas.ts: x, y, w, h, anchor x, anchor y). */
  rects: number[];
  grid: { width: number; height: number };
  texA: THREE.Texture;
  texB: THREE.Texture;
  /** The spec varyings plane A's custom bits carry (atlas.ts customVaryings / encodeCustom4). */
  custom: string[];
  /** Timelines: idle, and when baked ghostIdle (shared ghost standing), talk, die, ghost, ghost-spent. */
  clips: Record<string, Timeline>;
  /** Locomotion at the game speed: drawings per cycle, cycle length (m), base cells by drawing index. */
  move: { poses: number; cycle: number; run: boolean; cells: number[] } | null;
  /** Held action poses (vote): base cell. */
  holds: Record<string, number>;
  /** Vendor drawing name ('<clip>:<keyIndex>', 'vote') -> base cell (debug: stills pinned to the rig's drawing). */
  byName: Record<string, number>;
  /** Tones per palette slot (linear). */
  palette: { hi: THREE.Vector3[]; mid: THREE.Vector3[]; sh: THREE.Vector3[]; conflicts: number };
  /** Look uniform values copied from the baked rig's material (per-spec constants). */
  look: Record<string, unknown>;
  spec: { material?: Record<string, unknown>; ghost?: unknown };
  liveTop: number;
  /** Self-shadow hull (look.js 'hull'): radius and top (m). */
  hull: { r: number; top: number };
  heightM: number;
  widthM: number;
  /** Lantern socket per drawing (root frame, facing 0), or null. */
  lanterns: (THREE.Vector3 | null)[] | null;
  /** The lantern anchor is a hand (the spec carries no lantern of its own): a carrier gets the rig body's prop. */
  lanternIsHand: boolean;
  proxy: SheetProxy | null;
  source: 'bake' | 'cache';
  stats: Record<string, number | string>;
  refs: number;
  used: number;
  dispose(): void;
}

interface VendorRigLike {
  mesh: THREE.SkinnedMesh;
  height: number;
  ghostHalo?: THREE.Object3D | null;
}
interface VendorCharLike {
  rig: VendorRigLike;
  spec: { material?: Record<string, unknown>; ghost?: unknown; clips?: Record<string, { length?: number; fps?: number; loop?: boolean; keys?: { f?: number }[] } | undefined> };
  gait?: { cycle?: number; mode?: string; run?: boolean } | null;
  state: { clip: string; frame: number | string; keyIndex?: number };
}

const UP = new THREE.Vector3(0, 1, 0);
/** Distance of the bake camera from the anchor (m) = the anchor plane's view depth. */
const BAKE_D = 20;

// ------------------------------------------------------------------------------------ bake material patch

const bakeUniforms = { uCtBake: { value: 0 }, uCtBakeD0: { value: BAKE_D } };

function glslConst(x: number): string {
  return Number.isInteger(x) ? `${x}.0` : String(x);
}

function bakeOut(custom: string[]): string {
  const [n0, n1, n2] = custom;
  const c4 = `${n0 ? `(${n0} < 0.25 ? 0.0 : (${n0} < 0.75 ? 1.0 : (${n0} < 1.5 ? 2.0 : 3.0)))` : '0.0'} + ${n1 ? `(${n1} > 0.5 ? 4.0 : 0.0)` : '0.0'} + ${n2 ? `(${n2} > 0.5 ? 8.0 : 0.0)` : '0.0'}`;
  return /* glsl */ `
  if (uCtBake > 0) {
    if (uCtBake == 1) {
      vec3 bn = normalize(normal);
      float dz = uCtBakeD0 - vViewPosition.z;
      float q = floor(clamp((dz - ${glslConst(DEPTH_LO)}) / ${glslConst(DEPTH_RANGE)}, 0.0, 1.0) * ${glslConst(DEPTH_STEPS)} + 0.5);
      float qh = floor(q / 16.0);
      gl_FragColor = vec4(floor((bn.xy * 0.5 + 0.5) * 255.0 + 0.5) / 255.0, qh / 255.0, ((q - qh * 16.0) * 16.0 + ${c4}) / 255.0);
    } else {
      float side = vCharProp > 0.5 ? 0.0 : (vCharFar > 0.5 ? 1.0 : (vCharMid > 0.5 ? 2.0 : 0.0));
      float r = (vCharGSlot + 1.0) + side * 32.0 + (vCharGHalo > 0.5 ? 128.0 : 0.0);
      float p = clamp(floor(vCharPart + 0.5), -160.0, 351.0) + 160.0;
      float ph = floor(p / 256.0);
      float b = ph + 2.0 * floor(clamp(vCharLift, 0.0, 1.0) * 100.0 + 0.5);
      float by = vCharBind.y / max(uCharGhost.z, 1e-3);
      gl_FragColor = vec4(r / 255.0, (p - ph * 256.0) / 255.0, b / 255.0, floor(clamp(by / ${glslConst(BIND_MAX)}, 0.0, 1.0) * 255.0 + 0.5) / 255.0);
    }
    return;
  }
`;
}

type Compile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;

/** Turn the bake rig's look material into the G-buffer writer (its own program key; the rig is bake-only). */
function patchBake(mat: THREE.Material, sides: () => number[] | null, custom: string[]): void {
  const prev = mat.onBeforeCompile as Compile;
  const key0 = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, bakeUniforms);
    const fs = shader.fragmentShader;
    if (!fs.includes('if (uPassMode == 1) {')) throw new Error('sprite bake: toon normal-pass hook not found');
    const names = custom.filter((n) => new RegExp(`\\b${n}\\b`).test(fs));
    shader.fragmentShader = fs.replace('#include <common>', '#include <common>\nuniform int uCtBake; uniform float uCtBakeD0;').replace('if (uPassMode == 1) {', `${bakeOut(names.length === custom.length ? custom : [])}\n if (uPassMode == 1) {`);
  };
  mat.customProgramCacheKey = () => `ct-sprite-bake|${key0()}`;
  // far / mid flags -> the bone SIDE (L in uCharFar, R in uCharMid), after look.js wrote the real far flags
  const obr = mat.onBeforeRender.bind(mat);
  mat.onBeforeRender = (...a: Parameters<THREE.Material['onBeforeRender']>) => {
    obr(...a);
    const s = sides();
    const U = (mat.userData as { look?: { uniforms: { uCharFar: { value: Float32Array }; uCharMid: { value: Float32Array } } } }).look?.uniforms;
    if (!s || !U) return;
    const far = U.uCharFar.value;
    const mid = U.uCharMid.value;
    for (let i = 0; i < far.length; i++) {
      far[i] = s[i] === 1 ? 1 : 0;
      mid[i] = s[i] === -1 ? 1 : 0;
    }
  };
  mat.needsUpdate = true;
}

// ------------------------------------------------------------------------------------ helpers

function makeAtlasRT(w: number, h: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true });
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

function dataTex(data: Uint8Array | Float32Array, w: number, h: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data as unknown as BufferSource, w, h, THREE.RGBAFormat, data instanceof Float32Array ? THREE.FloatType : THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

function bindReach(geo: THREE.BufferGeometry): { r: number; top: number; liveTop: number; live: number } {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const live = Math.min(p.count, (geo.userData as { charGhostFrom?: number }).charGhostFrom ?? Infinity);
  let r2 = 0;
  let top = 0;
  let liveTop = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    top = Math.max(top, y);
    if (i < live) {
      r2 = Math.max(r2, x * x + z * z);
      liveTop = Math.max(liveTop, y);
    }
  }
  return { r: Math.sqrt(r2), top, liveTop, live };
}

function paletteTones(geo: THREE.BufferGeometry): SpriteSheet['palette'] {
  const pal = paletteOf(geo);
  const col = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  const hiA = geo.getAttribute('toneHi') as THREE.BufferAttribute | undefined;
  const shA = geo.getAttribute('toneSh') as THREE.BufferAttribute | undefined;
  const n = Math.min(geo.getAttribute('position').count, (geo.userData as { charGhostFrom?: number }).charGhostFrom ?? Infinity);
  const hi: (THREE.Vector3 | null)[] = pal.map(() => null);
  const sh: (THREE.Vector3 | null)[] = pal.map(() => null);
  let conflicts = 0;
  if (col && hiA && shA) {
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < pal.length; j++) {
        const c = pal[j]!;
        const d = Math.abs(c[0]! - col.getX(i)) + Math.abs(c[1]! - col.getY(i)) + Math.abs(c[2]! - col.getZ(i));
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      const h = new THREE.Vector3(hiA.getX(i), hiA.getY(i), hiA.getZ(i));
      const s = new THREE.Vector3(shA.getX(i), shA.getY(i), shA.getZ(i));
      if (!hi[best]) {
        hi[best] = h;
        sh[best] = s;
      } else if (hi[best]!.distanceTo(h) > 1e-4 || sh[best]!.distanceTo(s) > 1e-4) conflicts++;
    }
  }
  const pad = (a: (THREE.Vector3 | null)[], d: (i: number) => THREE.Vector3) => Array.from({ length: 16 }, (_, i) => a[i] ?? d(i));
  const mid = Array.from({ length: 16 }, (_, i) => (pal[i] ? new THREE.Vector3(pal[i]![0], pal[i]![1], pal[i]![2]) : new THREE.Vector3()));
  return { hi: pad(hi, (i) => mid[i]!.clone()), mid, sh: pad(sh, (i) => mid[i]!.clone()), conflicts };
}

/** The look uniforms that are per-spec constants (set by look.js applyFlags / the rig), copied to the sprites. */
const LOOK_COPY = ['uCharShape', 'uCharWhiteKeep', 'uCharWhiteKeepLift', 'uCharCreamKeep', 'uCharGhost', 'uCharGhostRamp', 'uCharGhostHalo', 'uCharGhostK', 'uCharGhostFade', 'uCharGhostGlow', 'uCharGhostKeep', 'uCharHueKeep', 'uCharHintK'];

function cloneValue(v: unknown): unknown {
  if (v && typeof (v as { clone?: unknown }).clone === 'function') return (v as { clone(): unknown }).clone();
  if (ArrayBuffer.isView(v)) return (v as Float32Array).slice();
  if (Array.isArray(v)) return v.map(cloneValue);
  return v;
}

/** Look values <-> JSON (the persistent cache). */
type Tagged = { t: string; a: number[] } | { t: 'arr'; a: Tagged[] } | { t: 'n'; v: number } | { t: 'x'; v: unknown };
function tagValue(v: unknown): Tagged {
  const o = v as { isVector2?: boolean; isVector3?: boolean; isVector4?: boolean; isColor?: boolean; isMatrix3?: boolean; isMatrix4?: boolean };
  if (typeof v === 'number') return { t: 'n', v };
  if (o?.isVector4) return { t: 'v4', a: (v as THREE.Vector4).toArray() };
  if (o?.isVector3) return { t: 'v3', a: (v as THREE.Vector3).toArray() };
  if (o?.isVector2) return { t: 'v2', a: (v as THREE.Vector2).toArray() };
  if (o?.isColor) return { t: 'c', a: (v as THREE.Color).toArray() };
  if (o?.isMatrix3 || o?.isMatrix4) return { t: o.isMatrix3 ? 'm3' : 'm4', a: Array.from((v as THREE.Matrix4).elements) };
  if (ArrayBuffer.isView(v)) return { t: 'f32', a: Array.from(v as Float32Array) };
  if (Array.isArray(v)) return { t: 'arr', a: v.map(tagValue) };
  return { t: 'x', v };
}
function untagValue(x: Tagged): unknown {
  switch (x.t) {
    case 'n':
      return (x as { v: number }).v;
    case 'v4':
      return new THREE.Vector4().fromArray((x as { a: number[] }).a);
    case 'v3':
      return new THREE.Vector3().fromArray((x as { a: number[] }).a);
    case 'v2':
      return new THREE.Vector2().fromArray((x as { a: number[] }).a);
    case 'c':
      return new THREE.Color().fromArray((x as { a: number[] }).a);
    case 'm3':
      return new THREE.Matrix3().fromArray((x as { a: number[] }).a);
    case 'm4':
      return new THREE.Matrix4().fromArray((x as { a: number[] }).a);
    case 'f32':
      return Float32Array.from((x as { a: number[] }).a);
    case 'arr':
      return ((x as { a: Tagged[] }).a).map(untagValue);
    default:
      return (x as { v: unknown }).v;
  }
}

// ------------------------------------------------------------------------------------ the kit (one rig per spec)

interface Drawing {
  name: string;
  root: THREE.Vector3;
  bones: THREE.Quaternion[];
  pos: THREE.Vector3[];
  scl: THREE.Vector3[];
  /** Proxy bone matrices in the root frame (12 floats = 3 rows per bone). */
  mats: Float32Array;
  lantern: THREE.Vector3 | null;
}

interface ClipCapture {
  keys: number[];
  length: number;
  loop: boolean;
  /** drawing index per key */
  draws: number[];
}

interface Kit {
  specId: string;
  h: CharacterHandle;
  mesh: THREE.SkinnedMesh;
  rig: VendorRigLike;
  scene: THREE.Scene;
  drawings: Drawing[];
  clips: Record<string, ClipCapture>;
  move: { poses: number; cycle: number; run: boolean; draws: number[] } | null;
  holds: Record<string, number>;
  reach: { r: number; top: number; liveTop: number };
  liveTop: number;
  heightM: number;
  hull: { r: number; top: number };
  palette: SpriteSheet['palette'];
  look: Record<string, unknown>;
  spec: VendorCharLike['spec'];
  custom: string[];
  lanternIsHand: boolean;
  proxy: SheetProxy | null;
  /** All vertices clustered (shared ghost parts included): the drawings' screen bounds for the tight cells. */
  bounds: { position: Float32Array; bone: Uint16Array } | null;
  /** programs compiled for this render-target variant */
  compiled: boolean;
  used: number;
  stats: { buildMs: number; simMs: number; proxyMs: number; proxyTris: number };
  dispose(): void;
}

/** Names of the clips a kit of this spec bakes (also part of the cache key). */
export function clipSetOf(spec: VendorCharLike['spec'], emotes: Record<string, string | null | undefined>): string[] {
  const clips = spec.clips ?? {};
  const out = ['idle', 'move'];
  if (spec.ghost) out.push('ghostIdle');
  if (clips.vote) out.push('vote');
  if (emotes.talk) out.push('talk');
  if (emotes.die) out.push('die');
  if (!spec.ghost && clips.ghost) out.push('ghost');
  if (!spec.ghost && clips.ghost && clips['ghost-spent']) out.push('ghost-spent');
  return out;
}

function clipLength(spec: VendorCharLike['spec'], name: string, dflt: number): number {
  const c = spec.clips?.[name];
  if (!c) return dflt;
  const fps = c.fps || 30;
  if (c.length) return c.length / fps;
  const last = Math.max(0, ...(c.keys ?? []).map((k) => k.f ?? 0));
  return last > 0 ? (last + 1) / fps : dflt;
}

const M = new THREE.Matrix4();
const MI = new THREE.Matrix4();
const MB = new THREE.Matrix4();

function* buildKit(engine: unknown, specId: string): SliceGen<Kit> {
  const E = engine as { time?: number };
  const t0 = performance.now();
  phase = 'spawn';
  const h = (yield spawnCharacter(engine, specId, { x: 0, z: 0, face: 0, heightAt: () => 0, lite: true })) as CharacterHandle;
  // the vendor adds the root to engine.scene: a bake rig is never drawn by the game (bakes are sliced over frames)
  h.root.removeFromParent();
  const scene = new THREE.Scene();
  scene.add(h.root);
  // a tight bake frustum must never cull the rig on a stale bounding sphere
  h.root.traverse((o) => {
    o.frustumCulled = false;
  });
  const buildMs = performance.now() - t0;
  let ok = false;
  try {
    suppressSpecLights(h);
    const ch = h.ch as unknown as VendorCharLike;
    const rig = ch.rig;
    const mesh = rig.mesh;
    const geo = mesh.geometry;
    const reach = bindReach(geo);
    const liveTop = rig.height || reach.liveTop;
    const custom = customVaryings(ch.spec.material?.vertexHead, 3);
    const sidesOf = () => (mesh.userData as { lookState?: { sides?: number[] | null } }).lookState?.sides ?? null;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter((m) => (m.userData as { look?: unknown }).look);
    for (const m of mats) patchBake(m, sidesOf, custom);
    const emotes = (h as unknown as { emotes?: Record<string, string | null> }).emotes ?? {};
    const set = clipSetOf(ch.spec, emotes);
    const ownLantern = socketOf(h, 'lanternLight', 'lanternGlow', 'lantern', 'glass');
    const sock = ownLantern ?? socketOf(h, 'handR', 'handL');

    // ---------------------------------------------------------------- simulation: capture every drawing
    const tSim0 = performance.now();
    let simMs = 0;
    const driver = createDriver(h, () => 0);
    let t = (E.time ?? 0) + 0.001;
    const bones = mesh.skeleton.bones;
    const inv = mesh.skeleton.boneInverses;
    const drawings: Drawing[] = [];
    const byName = new Map<string, number>();
    const snap = (name: string): number => {
      const have = byName.get(name);
      if (have !== undefined) return have;
      h.root.updateMatrixWorld(true);
      MI.copy(h.root.matrixWorld).invert();
      const mats12 = new Float32Array(bones.length * 12);
      for (let b = 0; b < bones.length; b++) {
        // world = mesh.matrixWorld · bindMatrixInverse · bone.matrixWorld · boneInverse · bindMatrix; root frame
        M.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).multiply(bones[b]!.matrixWorld).multiply(inv[b]!).multiply(mesh.bindMatrix);
        MB.multiplyMatrices(MI, M);
        const e = MB.elements;
        for (let r = 0; r < 3; r++) {
          mats12[b * 12 + r * 4] = e[r]!;
          mats12[b * 12 + r * 4 + 1] = e[r + 4]!;
          mats12[b * 12 + r * 4 + 2] = e[r + 8]!;
          mats12[b * 12 + r * 4 + 3] = e[r + 12]!;
        }
      }
      const lantern = sock ? h.root.worldToLocal(sock.getWorldPosition(new THREE.Vector3())) : null;
      drawings.push({ name, root: h.root.position.clone(), bones: bones.map((b) => b.quaternion.clone()), pos: bones.map((b) => b.position.clone()), scl: bones.map((b) => b.scale.clone()), mats: mats12, lantern });
      byName.set(name, drawings.length - 1);
      return drawings.length - 1;
    };
    const drawingKey = () => {
      const s = ch.state;
      const n = typeof s.keyIndex === 'number' && s.keyIndex >= 0 ? s.keyIndex : Number(String(s.frame).split(/[:|]/).pop()) || 0;
      return `${s.clip}:${n}`;
    };
    const stepOnce = (move: ((tt: number) => number) | null) => {
      const a = performance.now();
      t += DT;
      if (move) driver.push(t, 0, move(t), null);
      h.update(t);
      simMs += performance.now() - a;
    };
    function* steps(n: number, move: ((tt: number) => number) | null = null): SliceGen<void> {
      for (let i = 0; i < n; i++) {
        stepOnce(move);
        yield;
      }
    }
    /** Record a clip from now: one drawing name per step; leading steps still showing another clip are dropped. */
    function* record(tag: string, clip: string, lengthS: number, loop: boolean): SliceGen<ClipCapture | null> {
      const names: string[] = [];
      const draws: number[] = [];
      const n = Math.max(1, Math.ceil(lengthS / DT - 1e-6));
      let started = false;
      for (let i = 0; i < n + 8 && names.length < n; i++) {
        stepOnce(null);
        const k = drawingKey();
        if (!started && !k.startsWith(`${clip}:`)) {
          yield;
          continue;
        }
        started = true;
        names.push(k);
        draws.push(snap(`${tag}|${k}`));
        yield;
      }
      if (!names.length) return null;
      const c = compressSteps(names, DT);
      return { keys: c.keys, length: loop ? names.length * DT : lengthS, loop, draws: c.first.map((i) => draws[i]!) };
    }

    phase = 'sim';
    driver.reset(t, 0, 0, 0);
    yield* steps(30); // settle (1 s)
    const clips: Record<string, ClipCapture> = {};
    h.play('idle');
    const idle = yield* record('idle', 'idle', clipLength(ch.spec, 'idle', 2.8), true);
    if (!idle) throw new Error('sprite bake: no idle drawings');
    clips.idle = idle;
    if (set.includes('ghostIdle')) {
      setGhostLevel(h, 1);
      h.play('idle');
      yield* steps(2);
      const g = yield* record('ghostIdle', 'idle', clipLength(ch.spec, 'idle', 2.8), true);
      if (g) clips.ghostIdle = g;
      setGhostLevel(h, null);
      h.play('idle');
      yield* steps(4);
    }
    // locomotion: settle 1.2 s, then capture one cycle (distinct drawings)
    const tm = t;
    const along = (tt: number) => (tt - tm) * GAME_SPEED_MPS;
    yield* steps(36, along);
    const moveDraw = new Map<number, number>();
    let cycle = ch.gait?.cycle ?? 0;
    let run = false;
    for (let i = 0; i < 45; i++) {
      stepOnce(along);
      yield;
      const g = ch.gait;
      if (!g || g.mode !== 'move') continue;
      run = !!g.run;
      cycle = g.cycle ?? cycle;
      const k = drawingKey();
      const m = /:(\d+)$/.exec(k);
      const n = m ? Number(m[1]) : 0;
      if (!moveDraw.has(n)) moveDraw.set(n, snap(`move|${k}`));
    }
    const ts = t;
    stepOnce(() => (ts - tm) * GAME_SPEED_MPS);
    driver.reset(t, 0, 0, 0);
    yield* steps(20);
    const holds: Record<string, number> = {};
    if (set.includes('vote')) {
      h.play('vote');
      yield* steps(60);
      holds.vote = snap('vote');
      h.play('idle');
      yield* steps(10);
    }
    if (set.includes('talk')) {
      h.play(emotes.talk!);
      const c = yield* record('talk', emotes.talk!, clipLength(ch.spec, emotes.talk!, 0.8), true);
      if (c) clips.talk = c;
      h.play('idle');
      yield* steps(10);
    }
    for (const g of ['ghost', 'ghost-spent']) {
      if (!set.includes(g)) continue;
      h.play(g);
      const c = yield* record(g, g, clipLength(ch.spec, g, 2.4), true);
      if (c) clips[g] = c;
      h.play('idle');
      yield* steps(10);
    }
    if (set.includes('die')) {
      h.play(emotes.die!);
      const c = yield* record('die', emotes.die!, DIE_HOLD_S, false);
      if (c) clips.die = c;
      h.play('idle');
      yield* steps(4);
    }
    void tSim0;

    // ---------------------------------------------------------------- shadow proxy
    phase = 'proxy';
    const tP0 = performance.now();
    const pa = geo.getAttribute('position') as THREE.BufferAttribute;
    const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
    const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
    let proxy: SheetProxy | null = null;
    if (si && sw) {
      const pm = yield* clusterProxy({ position: pa.array, skinIndex: si.array, skinWeight: sw.array, count: reach.live, index: geo.index ? geo.index.array : null }, Math.min(0.06, Math.max(0.025, liveTop / 36)));
      if (pm && pm.index.length) {
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(pm.position, 3));
        pg.setAttribute('aBone', new THREE.BufferAttribute(Float32Array.from(pm.bone), 1));
        pg.setIndex(new THREE.BufferAttribute(pm.index, 1));
        const nb = bones.length;
        const data = new Float32Array(nb * 3 * 4 * drawings.length);
        drawings.forEach((d, i) => data.set(d.mats, i * nb * 12));
        proxy = { geo: pg, bones: dataTex(data, nb * 3, drawings.length), tris: pm.index.length / 3 };
      }
    }
    // bounds points: every vertex (the shared ghost's halo / extra parts too), coarser
    const bm = si && sw ? yield* clusterProxy({ position: pa.array, skinIndex: si.array, skinWeight: sw.array, count: pa.count, index: geo.index ? geo.index.array : null }, 0.04) : null;
    const proxyMs = performance.now() - tP0;

    // look constants
    const look: Record<string, unknown> = {};
    const LU = (mats[0]?.userData as { look?: { uniforms: Record<string, { value: unknown }> } }).look?.uniforms ?? {};
    for (const k of LOOK_COPY) if (LU[k]) look[k] = cloneValue(LU[k]!.value);
    const margin = (mats[0]?.userData as { look?: { opts?: { hullMargin?: number } } }).look?.opts?.hullMargin ?? 0.12;
    const moveKeys = [...moveDraw.keys()].sort((a, b) => a - b);
    const kit: Kit = {
      specId,
      h,
      mesh,
      rig,
      scene,
      drawings,
      clips,
      move: moveKeys.length ? { poses: moveKeys.length, cycle: cycle || 1, run, draws: moveKeys.map((n) => moveDraw.get(n)!) } : null,
      holds,
      reach,
      liveTop,
      heightM: h.height || liveTop,
      hull: { r: reach.r + margin, top: reach.liveTop + margin },
      palette: paletteTones(geo),
      look,
      spec: ch.spec,
      custom,
      lanternIsHand: !ownLantern,
      proxy,
      bounds: bm ? { position: bm.position, bone: bm.bone } : null,
      compiled: false,
      used: performance.now(),
      stats: { buildMs: +buildMs.toFixed(1), simMs: +simMs.toFixed(1), proxyMs: +proxyMs.toFixed(1), proxyTris: proxy?.tris ?? 0 },
      dispose() {
        const geos = new Set<THREE.BufferGeometry>();
        const ms = new Set<THREE.Material>();
        h.root.traverse((x) => {
          const m = x as THREE.Mesh;
          if (!m.isMesh) return;
          geos.add(m.geometry);
          for (const mm of Array.isArray(m.material) ? m.material : [m.material]) ms.add(mm);
        });
        try {
          h.dispose();
        } catch {
          /* best effort */
        }
        for (const g of geos) g.dispose();
        for (const m of ms) m.dispose();
        // the proxy is shared with the sheets: they free it (refcounted by the store)
      },
    };
    ok = true;
    return kit;
  } finally {
    if (!ok) {
      try {
        h.dispose();
      } catch {
        /* best effort */
      }
    }
  }
}

/** Render a kit's drawings for one camera key into new atlas targets (sliced: one cell per unit). */
function* renderSheet(engine: unknown, kit: Kit, cam: SheetCamera, key: string): SliceGen<SpriteSheet> {
  const E = engine as { renderer: THREE.WebGLRenderer; uniforms: { uPassMode: { value: number } } };
  const renderer = E.renderer;
  const t0 = performance.now();
  let renderMs = 0;
  const drawings = kit.drawings;
  const nCells = drawings.length * FACINGS;
  const tw = cam.texel;
  // tight cells: each drawing's posed bounds points seen from each facing (+ margin for the clustering)
  phase = 'bounds';
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quat);
  const upV = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quat);
  const sizes: { w: number; h: number; ax: number; ay: number }[] = [];
  const pad = 2 + Math.ceil(0.04 / tw);
  const bp = kit.bounds;
  const fallback = cellFor(kit.reach.r, kit.reach.top, cam.pitch, tw);
  for (const d of drawings) {
    if (!bp) {
      for (let k = 0; k < FACINGS; k++) sizes.push({ w: fallback.w, h: fallback.h, ax: fallback.w / 2, ay: fallback.below });
      continue;
    }
    const n = bp.bone.length;
    const posed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = bp.bone[i]! * 12;
      const x = bp.position[i * 3]!;
      const y = bp.position[i * 3 + 1]!;
      const z = bp.position[i * 3 + 2]!;
      const m = d.mats;
      posed[i * 3] = m[o]! * x + m[o + 1]! * y + m[o + 2]! * z + m[o + 3]!;
      posed[i * 3 + 1] = m[o + 4]! * x + m[o + 5]! * y + m[o + 6]! * z + m[o + 7]!;
      posed[i * 3 + 2] = m[o + 8]! * x + m[o + 9]! * y + m[o + 10]! * z + m[o + 11]!;
    }
    for (let k = 0; k < FACINGS; k++) {
      const yaw = facingYaw(k, cam.yaw);
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      let minX = 0;
      let maxX = 0;
      let minY = 0;
      let maxY = 0;
      for (let i = 0; i < n; i++) {
        const x = posed[i * 3]!;
        const y = posed[i * 3 + 1]!;
        const z = posed[i * 3 + 2]!;
        const wx = c * x + sn * z;
        const wz = -sn * x + c * z;
        const sx = right.x * wx + right.y * y + right.z * wz;
        const sy = upV.x * wx + upV.y * y + upV.z * wz;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
      sizes.push(tightCell(minX, maxX, minY, maxY, tw, pad));
    }
    yield;
  }
  const pack = packShelves(sizes);
  const rects: number[] = [];
  sizes.forEach((z, i) => rects.push(pack.at[i]!.x, pack.at[i]!.y, z.w, z.h, z.ax, z.ay));
  const grid = { width: pack.width, height: pack.height };
  const rts = [makeAtlasRT(grid.width, grid.height), makeAtlasRT(grid.width, grid.height)];
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, BAKE_D * 2);
  camera.quaternion.copy(cam.quat);
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quat);
  const bones = kit.mesh.skeleton.bones;
  const h = kit.h;
  let renders = 0;
  let done = false;
  try {
    // the bake program: compiled in parallel (KHR_parallel_shader_compile) before the first cell, never on a frame
    phase = 'compile';
    if (!kit.compiled) {
      const prevRT = renderer.getRenderTarget();
      let p: Promise<unknown> | null = null;
      try {
        renderer.setRenderTarget(rts[0]!);
        camera.position.copy(back).multiplyScalar(BAKE_D);
        camera.updateMatrixWorld(true);
        if (canPrecompile(renderer)) p = precompile(renderer as unknown as Parameters<typeof precompile>[0], [h.root], camera, kit.scene, { live: () => true, maxMs: 5000 });
      } finally {
        renderer.setRenderTarget(prevRT);
      }
      if (p) yield p;
      kit.compiled = true;
    }
    phase = 'cells';
    for (let di = 0; di < drawings.length; di++) {
      const d = drawings[di]!;
      if (di === 0) phase = 'cell0';
      else phase = 'cells';
      for (let k = 0; k < FACINGS; k++) {
        const a = performance.now();
        // the renderer state is restored after every cell: the game renders frames between the units
        const prev = { rt: renderer.getRenderTarget(), auto: renderer.autoClear, col: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), sm: renderer.shadowMap.autoUpdate, smN: renderer.shadowMap.needsUpdate, pass: E.uniforms.uPassMode.value };
        try {
          renderer.autoClear = false;
          renderer.shadowMap.autoUpdate = false;
          renderer.shadowMap.needsUpdate = false;
          renderer.setClearColor(0x000000, 0);
          E.uniforms.uPassMode.value = 0;
          bones.forEach((b, i) => {
            b.quaternion.copy(d.bones[i]!);
            b.position.copy(d.pos[i]!);
            b.scale.copy(d.scl[i]!);
          });
          if (kit.rig.ghostHalo) kit.rig.ghostHalo.scale.setScalar(1);
          h.root.position.copy(d.root);
          h.root.quaternion.setFromAxisAngle(UP, facingYaw(k, cam.yaw));
          h.root.updateMatrixWorld(true);
          camera.position.copy(d.root).addScaledVector(back, BAKE_D);
          camera.updateMatrixWorld(true);
          const ci = (di * FACINGS + k) * RECT_STRIDE;
          const [ox, oy, cw, chh, ax, ay] = rects.slice(ci, ci + RECT_STRIDE) as [number, number, number, number, number, number];
          camera.left = -ax * tw;
          camera.right = (cw - ax) * tw;
          camera.bottom = -ay * tw;
          camera.top = (chh - ay) * tw;
          camera.updateProjectionMatrix();
          rts.forEach((rt, mode) => {
            rt.viewport.set(ox, oy, cw, chh);
            rt.scissor.set(ox, oy, cw, chh);
            rt.scissorTest = true;
            renderer.setRenderTarget(rt);
            renderer.clear(true, true, false);
            bakeUniforms.uCtBake.value = mode + 1;
            renderer.render(kit.scene, camera);
            renders++;
          });
        } finally {
          bakeUniforms.uCtBake.value = 0;
          for (const rt of rts) {
            rt.scissorTest = false;
            rt.viewport.set(0, 0, rt.width, rt.height);
            rt.scissor.set(0, 0, rt.width, rt.height);
          }
          renderer.setRenderTarget(prev.rt);
          renderer.autoClear = prev.auto;
          renderer.setClearColor(prev.col, prev.alpha);
          renderer.shadowMap.autoUpdate = prev.sm;
          renderer.shadowMap.needsUpdate = prev.smN;
          E.uniforms.uPassMode.value = prev.pass;
        }
        renderMs += performance.now() - a;
        yield;
      }
    }
    done = true;
  } finally {
    if (!done) for (const rt of rts) rt.dispose();
    // release the kit's GPU buffers between bakes (re-uploaded by the next bake; the programs stay compiled)
    kit.mesh.geometry.dispose();
    kit.used = performance.now();
  }
  const [rtA, rtB] = rts;
  const sheet = sheetOf({
    key,
    specId: kit.specId,
    cam,
    rects,
    grid,
    texA: rtA!.texture,
    texB: rtB!.texture,
    custom: kit.custom,
    clips: Object.fromEntries(Object.entries(kit.clips).map(([n, c]) => [n, { keys: c.keys, length: c.length, loop: c.loop, cells: c.draws.map((i) => i * FACINGS) }])),
    move: kit.move ? { poses: kit.move.poses, cycle: kit.move.cycle, run: kit.move.run, cells: kit.move.draws.map((i) => i * FACINGS) } : null,
    holds: Object.fromEntries(Object.entries(kit.holds).map(([n, i]) => [n, i * FACINGS])),
    byName: Object.fromEntries(drawings.map((d, i) => [drawingAlias(d.name), i * FACINGS])),
    palette: kit.palette,
    look: kit.look,
    spec: kit.spec,
    liveTop: kit.liveTop,
    hull: kit.hull,
    heightM: kit.heightM,
    widthM: Math.max(0.4, Math.min(1.6, kit.reach.r * 2 * 0.8)),
    lanterns: drawings.some((d) => d.lantern) ? drawings.map((d) => d.lantern) : null,
    lanternIsHand: kit.lanternIsHand,
    proxy: kit.proxy,
    source: 'bake',
    stats: { ...kit.stats, renderMs: +renderMs.toFixed(1), wallMs: +(performance.now() - t0).toFixed(1), drawings: drawings.length, cells: nCells, bytes: grid.width * grid.height * 8, renders },
    rts,
  });
  return sheet;
}

/** Debug name of a drawing ('<tag>|<clip>:<key>'): the vendor's '<clip>:<key>' when the tag is that clip (or the
 *  locomotion), else the tag-prefixed name (the shared ghost's standing idle: 'ghostIdle|idle:2'). */
export function drawingAlias(name: string): string {
  const i = name.indexOf('|');
  if (i < 0) return name;
  const tag = name.slice(0, i);
  const rest = name.slice(i + 1);
  return tag === 'move' || rest.startsWith(`${tag}:`) ? rest : name;
}

type SheetInit = Omit<SpriteSheet, 'refs' | 'used' | 'dispose'> & { rts?: THREE.WebGLRenderTarget[] };
function sheetOf(i: SheetInit): SpriteSheet {
  const { rts, ...rest } = i;
  let disposed = false;
  const sheet: SpriteSheet = {
    ...rest,
    refs: 0,
    used: performance.now(),
    dispose() {
      if (disposed) return;
      disposed = true;
      (sheet as unknown as { _disposed?: boolean })._disposed = true;
      if (rts) for (const rt of rts) rt.dispose();
      else for (const t of [i.texA, i.texB]) t.dispose();
      if (i.proxy) releaseProxy(i.proxy);
    },
  };
  if (rts) sheetRTs.set(sheet, rts);
  return sheet;
}

/** The render targets behind a baked sheet (for the readback). */
const sheetRTs = new WeakMap<SpriteSheet, THREE.WebGLRenderTarget[]>();

// proxies are shared by a kit and its sheets (and sheets loaded from the cache own theirs)
const proxyRefs = new WeakMap<SheetProxy, number>();
function retainProxy(p: SheetProxy | null): void {
  if (p) proxyRefs.set(p, (proxyRefs.get(p) ?? 0) + 1);
}
function releaseProxy(p: SheetProxy): void {
  const n = (proxyRefs.get(p) ?? 1) - 1;
  proxyRefs.set(p, n);
  if (n <= 0) {
    p.geo.dispose();
    p.bones.dispose();
  }
}

// ------------------------------------------------------------------------------------ persistent cache (de)serialise

interface SheetMeta {
  f: number;
  specId: string;
  cam: { texel: number; pitch: number; yaw: number };
  rects: number[];
  grid: { width: number; height: number };
  custom: string[];
  clips: Record<string, Timeline>;
  move: SpriteSheet['move'];
  holds: Record<string, number>;
  byName: Record<string, number>;
  palette: { hi: number[][]; mid: number[][]; sh: number[][]; conflicts: number };
  look: Record<string, Tagged>;
  liveTop: number;
  hull: { r: number; top: number };
  heightM: number;
  widthM: number;
  lanterns: (number[] | null)[] | null;
  lanternIsHand: boolean;
  proxy: { bw: number; bh: number; tris: number } | null;
  stats: Record<string, number | string>;
}

async function readPlanes(renderer: THREE.WebGLRenderer, sheet: SpriteSheet, rts: THREE.WebGLRenderTarget[]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const rt of rts) {
    const buf = new Uint8Array(rt.width * rt.height * 4);
    await renderer.readRenderTargetPixelsAsync(rt, 0, 0, rt.width, rt.height, buf);
    out.push(buf);
  }
  void sheet;
  return out;
}

function metaOf(s: SpriteSheet): SheetMeta {
  return {
    f: BAKE_FORMAT,
    specId: s.specId,
    cam: s.cam,
    rects: s.rects,
    grid: s.grid,
    custom: s.custom,
    clips: s.clips,
    move: s.move,
    holds: s.holds,
    byName: s.byName,
    palette: { hi: s.palette.hi.map((v) => v.toArray()), mid: s.palette.mid.map((v) => v.toArray()), sh: s.palette.sh.map((v) => v.toArray()), conflicts: s.palette.conflicts },
    look: Object.fromEntries(Object.entries(s.look).map(([k, v]) => [k, tagValue(v)])),
    liveTop: s.liveTop,
    hull: s.hull,
    heightM: s.heightM,
    widthM: s.widthM,
    lanterns: s.lanterns ? s.lanterns.map((v) => (v ? v.toArray() : null)) : null,
    lanternIsHand: s.lanternIsHand,
    proxy: s.proxy ? { bw: s.proxy.bones.image.width, bh: s.proxy.bones.image.height, tris: s.proxy.tris } : null,
    stats: s.stats,
  };
}

// ------------------------------------------------------------------------------------ the store (per engine)

interface Store {
  engineRef: object;
  runner: SliceRunner;
  sheets: Map<string, Promise<SpriteSheet>>;
  done: Map<string, SpriteSheet>;
  kits: Map<string, Kit>;
  cache: SheetCache;
  vendorHash: Map<string, Promise<string>>;
  lastPump: number;
  watchdog: ReturnType<typeof setInterval> | null;
  stats: { bakes: number; cacheHits: number; cacheMisses: number; stored: number; storeFails: number; maxUnitMs: number; maxUnit: string; maxPumpMs: number; kitsBuilt: number; units: number; over4: number };
}

const stores = new WeakMap<object, Store>();
let sharedCache: SheetCache | null = null;

function storeOf(engine: object): Store {
  let s = stores.get(engine);
  if (!s) {
    sharedCache ??= createCacheClient();
    const unit = (ms: number) => {
      const st = s!.stats;
      st.units++;
      if (ms > 4) st.over4++;
      if (ms > st.maxUnitMs) {
        st.maxUnitMs = +ms.toFixed(1);
        st.maxUnit = phase;
      }
    };
    s = {
      engineRef: engine,
      runner: createSliceRunner(undefined, unit),
      sheets: new Map(),
      done: new Map(),
      kits: new Map(),
      cache: sharedCache,
      vendorHash: new Map(),
      lastPump: 0,
      watchdog: null,
      stats: { bakes: 0, cacheHits: 0, cacheMisses: 0, stored: 0, storeFails: 0, maxUnitMs: 0, maxUnit: '', maxPumpMs: 0, kitsBuilt: 0, units: 0, over4: 0 },
    };
    stores.set(engine, s);
    const st = s;
    // frames without a layer update (mount / warm-up waits): keep the bakes moving
    st.watchdog = setInterval(() => {
      if (st.runner.pending() && performance.now() - st.lastPump > 60) pumpStore(st, bakeConfig.budgetMs);
    }, 50);
  }
  return s;
}

function pumpStore(s: Store, budgetMs: number): void {
  s.lastPump = performance.now();
  const r = s.runner.pump(budgetMs);
  if (r.units) s.stats.maxPumpMs = Math.max(s.stats.maxPumpMs, r.ms);
}

/** Run up to `budgetMs` of bake work now (the layer calls this once per frame, before the render). */
export function pumpBakes(engine: object, budgetMs = bakeConfig.budgetMs): void {
  const s = stores.get(engine);
  if (s && s.runner.pending()) pumpStore(s, budgetMs);
}

export function sheetKey(specId: string, cam: Pick<SheetCamera, 'texel' | 'pitch' | 'yaw'>): string {
  return `${specId}|${cam.texel.toFixed(6)}|${cam.pitch.toFixed(4)}|${cam.yaw.toFixed(4)}`;
}

async function vendorHashOf(s: Store, specId: string): Promise<{ hash: string; spec: VendorCharLike['spec']; clips: string[] }> {
  const spec = (await loadSpecObject(specId)) as VendorCharLike['spec'];
  let p = s.vendorHash.get(specId);
  if (!p) {
    p = Promise.resolve(fnv1a(specSource(spec), Number.parseInt(fnv1a(vendorSource()), 16)));
    s.vendorHash.set(specId, p);
  }
  const clipsAll = spec.clips ?? {};
  // the handle's emotes (characters.js): a game emote plays when the spec has a clip of that name
  const emotes = { talk: clipsAll.talk ? 'talk' : null, die: clipsAll.die ? 'die' : null };
  return { hash: await p, spec, clips: clipSetOf(spec, emotes) };
}

function* kitFor(engine: unknown, s: Store, specId: string): SliceGen<Kit> {
  const have = s.kits.get(specId);
  if (have) return have;
  s.stats.kitsBuilt++;
  // inline (a nested job would deadlock the one-at-a-time runner)
  const kit = yield* buildKit(engine, specId);
  retainProxy(kit.proxy);
  s.kits.set(specId, kit);
  // bounded: drop the least recently used kit
  if (s.kits.size > KIT_MAX) {
    let worst: Kit | null = null;
    for (const k of s.kits.values()) if (k !== kit && (!worst || k.used < worst.used)) worst = k;
    if (worst) {
      s.kits.delete(worst.specId);
      if (worst.proxy) releaseProxy(worst.proxy);
      worst.dispose();
    }
  }
  return kit;
}

function* produce(engine: unknown, s: Store, specId: string, cam: SheetCamera, key: string): SliceGen<SpriteSheet> {
  const E = engine as { renderer: THREE.WebGLRenderer };
  const v = (yield vendorHashOf(s, specId)) as Awaited<ReturnType<typeof vendorHashOf>>;
  const pk = persistKey({ format: BAKE_FORMAT, vendor: v.hash, specId, texel: cam.texel, pitch: cam.pitch, yaw: cam.yaw, clips: v.clips });
  // 1. the persistent cache (only when no kit is around: a kit re-render is as cheap and needs no upload)
  if (!s.kits.has(specId)) {
    const blob = (yield s.cache.get(pk)) as Awaited<ReturnType<SheetCache['get']>>;
    if (blob) {
      try {
        const sheet = yield* fromBlob(E.renderer, key, v.spec, blob);
        s.stats.cacheHits++;
        return sheet;
      } catch (e) {
        console.warn('[sprites] cached sheet unusable', e);
      }
    }
    s.stats.cacheMisses++;
  }
  // 2. bake from the kit
  const kit = yield* kitFor(engine, s, specId);
  const sheet = yield* renderSheet(engine, kit, cam, key);
  retainProxy(sheet.proxy);
  s.stats.bakes++;
  // 3. store (async readback; never blocks a frame)
  persist(s, E.renderer, sheet, pk);
  if (!bakeConfig.keepKits) {
    s.kits.delete(specId);
    if (kit.proxy) releaseProxy(kit.proxy);
    kit.dispose();
  }
  return sheet;
}

/** Read a baked sheet back and store it (one at a time: at most one sheet's buffers are alive). */
let persistChain: Promise<unknown> = Promise.resolve();
function persist(s: Store, renderer: THREE.WebGLRenderer, sheet: SpriteSheet, pk: string): void {
  const rts = sheetRTs.get(sheet);
  if (!bakeConfig.persist || !rts || typeof renderer.readRenderTargetPixelsAsync !== 'function') return;
  persistChain = persistChain
    .then(async () => {
      // only while no bake is pending (a camera-key change bakes first, stores after), then one sheet at a time
      while (stores.get(s.engineRef) === s && s.runner.pending()) await new Promise((r) => setTimeout(r, 250));
      if (stores.get(s.engineRef) !== s || (sheet as unknown as { _disposed?: boolean })._disposed) return;
      const planes = await readPlanes(renderer, sheet, rts);
      const bufs: (Uint8Array | Float32Array | Uint16Array)[] = [planes[0]!, planes[1]!, new Uint8Array(0)];
      if (sheet.proxy) {
        const g = sheet.proxy.geo;
        // copies: the planes are transferred to the cache worker, the proxy arrays stay live on the GPU objects
        bufs.push(((g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array).slice(), ((g.getAttribute('aBone') as THREE.BufferAttribute).array as Float32Array).slice(), (g.index!.array as Uint16Array).slice(), (sheet.proxy.bones.image.data as unknown as Float32Array).slice());
      }
      const ok = await s.cache.put(pk, { meta: metaOf(sheet), bufs });
      if (ok) s.stats.stored++;
      else s.stats.storeFails++;
    })
    .catch(() => {
      s.stats.storeFails++;
    });
}

function* fromBlob(renderer: THREE.WebGLRenderer, key: string, spec: VendorCharLike['spec'], blob: { meta: unknown; bufs: (Uint8Array | Uint16Array | Float32Array)[] }): SliceGen<SpriteSheet> {
  const m = blob.meta as SheetMeta;
  if (m.f !== BAKE_FORMAT) throw new Error('format');
  const [a, b] = blob.bufs as Uint8Array[];
  const n = m.grid.width * m.grid.height * 4;
  if (!a || !b || a.length !== n || b.length !== n) throw new Error('planes');
  const texA = dataTex(a, m.grid.width, m.grid.height);
  const texB = dataTex(b, m.grid.width, m.grid.height);
  // upload now, one plane per unit (not on the first draw of a frame)
  phase = 'upload';
  for (const t of [texA, texB]) {
    renderer.initTexture?.(t);
    yield;
  }
  let proxy: SheetProxy | null = null;
  if (m.proxy && blob.bufs.length >= 7) {
    const [pos, bone, idx, mats] = blob.bufs.slice(3) as [Float32Array, Float32Array, Uint16Array, Float32Array];
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aBone', new THREE.BufferAttribute(bone, 1));
    pg.setIndex(new THREE.BufferAttribute(idx, 1));
    proxy = { geo: pg, bones: dataTex(mats, m.proxy.bw, m.proxy.bh), tris: m.proxy.tris };
    retainProxy(proxy);
  }
  const v3 = (x: number[]) => new THREE.Vector3().fromArray(x);
  return sheetOf({
    key,
    specId: m.specId,
    cam: m.cam,
    rects: m.rects,
    grid: m.grid,
    texA,
    texB,
    custom: m.custom,
    clips: m.clips,
    move: m.move,
    holds: m.holds,
    byName: m.byName,
    palette: { hi: m.palette.hi.map(v3), mid: m.palette.mid.map(v3), sh: m.palette.sh.map(v3), conflicts: m.palette.conflicts },
    look: Object.fromEntries(Object.entries(m.look).map(([k, v]) => [k, untagValue(v)])),
    spec,
    liveTop: m.liveTop,
    hull: m.hull,
    heightM: m.heightM,
    widthM: m.widthM,
    lanterns: m.lanterns ? m.lanterns.map((x) => (x ? v3(x) : null)) : null,
    lanternIsHand: !!m.lanternIsHand,
    proxy,
    source: 'cache',
    stats: { ...m.stats, source: 'cache' },
  });
}

/**
 * The sheet of a spec for a camera (baked or loaded once per engine and key, as a sliced job; `prio`: higher first,
 * the own avatar and on-screen re-bakes before the rest).
 */
export function getSheet(engine: object, specId: string, cam: SheetCamera, prio = 0): Promise<SpriteSheet> {
  const s = storeOf(engine);
  const key = sheetKey(specId, cam);
  let p = s.sheets.get(key);
  if (!p) {
    const camCopy: SheetCamera = { texel: cam.texel, pitch: cam.pitch, yaw: cam.yaw, quat: cam.quat.clone() };
    p = s.runner.enqueue(produce(engine, s, specId, camCopy, key), prio).then((sh) => {
      s.done.set(key, sh);
      return sh;
    });
    p.catch(() => s.sheets.delete(key));
    s.sheets.set(key, p);
  }
  return p;
}

/** A sheet is no longer shown by one body: unreferenced sheets beyond the newest `keepOld` per spec are freed (the
 *  previous camera key stays for a quick switch back: vote camera <-> follow camera). */
export function releaseSheet(engine: object, sheet: SpriteSheet): void {
  sheet.refs = Math.max(0, sheet.refs - 1);
  sheet.used = performance.now();
  const s = stores.get(engine);
  if (!s) return;
  const mine = [...s.done.values()].filter((x) => x.specId === sheet.specId).sort((a, b) => b.used - a.used);
  let keep = 0;
  for (const x of mine) {
    if (x.refs > 0) continue;
    if (keep < bakeConfig.keepOld) {
      keep++;
      continue;
    }
    s.done.delete(x.key);
    s.sheets.delete(x.key);
    x.dispose();
  }
}

/** Free every sheet and kit of an engine (layer destroy). */
export function releaseSheets(engine: object): void {
  const s = stores.get(engine);
  if (!s) return;
  stores.delete(engine);
  if (s.watchdog) clearInterval(s.watchdog);
  for (const p of s.sheets.values()) p.then((x) => x.dispose()).catch(() => undefined);
  for (const k of s.kits.values()) {
    if (k.proxy) releaseProxy(k.proxy);
    k.dispose();
  }
  s.kits.clear();
}

/** Debug: the baked sheets of an engine, the store counters and the persistent cache. */
export async function sheetStats(engine: object): Promise<Record<string, unknown>[]> {
  const s = stores.get(engine);
  if (!s) return [];
  const out: Record<string, unknown>[] = [];
  for (const sh of s.done.values()) out.push({ key: sh.key, source: sh.source, refs: sh.refs, grid: sh.grid, clips: Object.fromEntries(Object.entries(sh.clips).map(([n, c]) => [n, c.keys.length])), move: sh.move ? { poses: sh.move.poses, cycle: +sh.move.cycle.toFixed(3), run: sh.move.run } : null, holds: Object.keys(sh.holds), conflicts: sh.palette.conflicts, proxyTris: sh.proxy?.tris ?? 0, ...sh.stats });
  return out;
}

/** Bench: zero the per-unit maxima (measure one window, e.g. the vote camera re-bake). */
export function resetUnitStats(engine: object): void {
  const s = stores.get(engine);
  if (!s) return;
  s.stats.maxUnitMs = 0;
  s.stats.maxUnit = '';
  s.stats.maxPumpMs = 0;
  s.stats.over4 = 0;
  s.stats.units = 0;
}

export function storeStats(engine: object): Record<string, unknown> | null {
  const s = stores.get(engine);
  if (!s) return null;
  return { ...s.stats, pending: s.runner.pending(), kits: s.kits.size, sheets: s.done.size, cache: s.cache.stats() };
}

/** Empty the persistent sheet cache (bench: a cold join). */
export async function clearSpriteCache(): Promise<void> {
  sharedCache ??= createCacheClient();
  await sharedCache.clear();
}

export const __test = { tagValue, untagValue, clipLength };
