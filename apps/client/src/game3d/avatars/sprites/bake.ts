// v3.3 sprites prototype (ct.debug.v3sprites=1). The runtime baker: builds ONE vendor rig of a spec, drives it
// through its idle loop and its locomotion cycle at the game speed, and renders every displayed drawing in the 8
// facings into two RGBA8 atlas render targets, through the rig's OWN look material with two extra output modes:
//
//   plane A  = view-space normal xy (8 bit each) + depth offset toward the camera from the feet plane (16 bit)
//   plane B  = palette slot / side (L, R, midline) / ghost halo, look.js part id, lift, bind height (atlas.ts)
//
// i.e. a G-buffer of the INPUTS of the toon + look lighting, not a lit colour: the sprite material (material.ts)
// re-runs the same vendor shader per pixel with these inputs, so day / golden / night ramps, the lantern light pool,
// cast shadows, clouds, the shared ghost tones and the talking rim all stay live. The atlas is baked at the exact
// low-res texel size and camera pitch of the moment (the key): sprite texels map 1:1 onto the pipeline's texels.
//
// Why at runtime: the texel size is viewHeight / lowH and lowH follows the window height, so a build-time bake
// would have to be resampled (non-integer: breaks the pixel art) or baked for every size. Cost and an IndexedDB
// cache are discussed in docs/perf-v3/sprites.md.
import * as THREE from 'three';
import { createDriver, spawnCharacter, socketOf, suppressSpecLights, type CharacterHandle } from '../../vendor/characters';
import { paletteOf } from '../../vendor/spriteLook';
import { atlasBytes, atlasGrid, cellFor, cellOrigin, DEPTH_LO, DEPTH_RANGE, FACINGS, facingYaw, BIND_MAX, type AtlasGrid, type CellSpec } from './atlas';

/** Game walking speed (m/s): PLAYER_SPEED 150 px/s at 16 px/m. */
export const GAME_SPEED_MPS = 150 / 16;

export interface SheetCamera {
  /** Low-res texel size (m). */
  texel: number;
  pitch: number;
  yaw: number;
  /** The camera's world quaternion (the bake camera copies it). */
  quat: THREE.Quaternion;
}

export interface SpriteSheet {
  key: string;
  specId: string;
  cam: { texel: number; pitch: number; yaw: number };
  cell: CellSpec;
  grid: AtlasGrid;
  rtA: THREE.WebGLRenderTarget;
  rtB: THREE.WebGLRenderTarget;
  /** Idle: key start times (s) over `length`, and the base cell of each key (facing k = base + k). */
  idle: { keys: number[]; length: number; cells: number[] };
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
  /** Lantern socket offset in the root frame (facing 0), or null. */
  lantern: THREE.Vector3 | null;
  stats: { buildMs: number; simMs: number; renderMs: number; totalMs: number; drawings: number; cells: number; bytes: number; renders: number };
  refs: number;
  dispose(): void;
}

interface VendorRigLike {
  mesh: THREE.SkinnedMesh;
  height: number;
  ghostHalo?: THREE.Object3D | null;
  sockets?: Record<string, THREE.Object3D | undefined>;
}
interface VendorCharLike {
  rig: VendorRigLike;
  spec: { material?: Record<string, unknown>; ghost?: unknown; clips?: Record<string, { length?: number; fps?: number; loop?: boolean } | undefined> };
  gait?: { cycle?: number; mode?: string; run?: boolean; p?: { poses?: number[] } } | null;
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

const BAKE_OUT = /* glsl */ `
  if (uCtBake > 0) {
    if (uCtBake == 1) {
      vec3 bn = normalize(normal);
      float dz = uCtBakeD0 - vViewPosition.z;
      float q = floor(clamp((dz - ${glslConst(DEPTH_LO)}) / ${glslConst(DEPTH_RANGE)}, 0.0, 1.0) * 65535.0 + 0.5);
      float qh = floor(q / 256.0);
      gl_FragColor = vec4(floor((bn.xy * 0.5 + 0.5) * 255.0 + 0.5) / 255.0, qh / 255.0, (q - qh * 256.0) / 255.0);
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

type Compile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;

/** Turn the bake rig's look material into the G-buffer writer (its own program key; the rig is bake-only). */
function patchBake(mat: THREE.Material, sides: () => number[] | null): void {
  const prev = mat.onBeforeCompile as Compile;
  const key0 = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, bakeUniforms);
    const fs = shader.fragmentShader;
    if (!fs.includes('if (uPassMode == 1) {')) throw new Error('sprite bake: toon normal-pass hook not found');
    shader.fragmentShader = fs
      .replace('#include <common>', '#include <common>\nuniform int uCtBake; uniform float uCtBakeD0;')
      .replace('if (uPassMode == 1) {', `${BAKE_OUT}\n if (uPassMode == 1) {`);
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

function bindReach(geo: THREE.BufferGeometry): { r: number; top: number; liveTop: number } {
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
  return { r: Math.sqrt(r2), top, liveTop };
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

// ------------------------------------------------------------------------------------ the bake

export async function bakeSheet(engine: unknown, specId: string, cam: SheetCamera, key: string): Promise<SpriteSheet> {
  const E = engine as { renderer: THREE.WebGLRenderer; time?: number; uniforms: { uPassMode: { value: number } } };
  const renderer = E.renderer;
  const t0 = performance.now();
  const h: CharacterHandle = await spawnCharacter(engine, specId, { x: 0, z: 0, face: 0, heightAt: () => 0, lite: true });
  const tBuilt = performance.now();
  let built = tBuilt - t0;
  try {
    suppressSpecLights(h);
    const ch = h.ch as unknown as VendorCharLike;
    const rig = ch.rig;
    const mesh = rig.mesh;
    const geo = mesh.geometry;
    const reach = bindReach(geo);
    const liveTop = rig.height || reach.liveTop;
    const sidesOf = () => {
      const st = (mesh.userData as { lookState?: { sides?: number[] | null } }).lookState;
      return st?.sides ?? null;
    };
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter((m) => (m.userData as { look?: unknown }).look);
    for (const m of mats) patchBake(m, sidesOf);
    const cell = cellFor(reach.r, reach.top, cam.pitch, cam.texel);

    // drive: idle at the origin, then a straight run along +Z at the game speed
    const driver = createDriver(h, () => 0);
    const T0 = (E.time ?? 0) + 0.001;
    let t = T0;
    const step = (n: number, move: ((tt: number) => number) | null) => {
      for (let i = 0; i < n; i++) {
        t += 1 / 30;
        if (move) driver.push(t, 0, move(t), null);
        h.update(t);
      }
    };
    type Drawing = { name: string; root: THREE.Vector3; bones: THREE.Quaternion[]; pos: THREE.Vector3[]; scl: THREE.Vector3[] };
    const bones = mesh.skeleton.bones;
    const snap = (name: string): Drawing => ({
      name,
      root: h.root.position.clone(),
      bones: bones.map((b) => b.quaternion.clone()),
      pos: bones.map((b) => b.position.clone()),
      scl: bones.map((b) => b.scale.clone()),
    });
    const drawingKey = () => {
      const s = ch.state;
      const n = typeof s.keyIndex === 'number' && s.keyIndex >= 0 ? s.keyIndex : Number(String(s.frame).split(/[:|]/).pop()) || 0;
      return `${s.clip}:${n}`;
    };
    const tSim0 = performance.now();
    driver.reset(t, 0, 0, 0);
    step(30, null); // settle (1 s)
    // idle loop
    const idleClip = ch.spec.clips?.idle;
    const idleLen = idleClip?.length && idleClip.fps ? idleClip.length / idleClip.fps : 2.8;
    const idleKeys: number[] = [];
    const idleDraw: Drawing[] = [];
    let last = '';
    const idleStart = t;
    for (let i = 0; i < Math.ceil(idleLen * 30); i++) {
      step(1, null);
      const k = drawingKey();
      if (k !== last) {
        last = k;
        idleKeys.push(+(t - idleStart).toFixed(4));
        idleDraw.push(snap(`idle|${k}`));
      }
    }
    // locomotion: settle 1.2 s, then capture one cycle (distinct drawings)
    const v = GAME_SPEED_MPS;
    const tm = t;
    step(36, (tt) => (tt - tm) * v);
    const moveDraw = new Map<string, Drawing>();
    let cycle = ch.gait?.cycle ?? 0;
    let run = false;
    for (let i = 0; i < 45; i++) {
      step(1, (tt) => (tt - tm) * v);
      const g = ch.gait;
      if (!g || g.mode !== 'move') continue;
      run = !!g.run;
      cycle = g.cycle ?? cycle;
      const k = drawingKey();
      const m = /:(\d+)$/.exec(k);
      const n = m ? Number(m[1]) : 0;
      if (!moveDraw.has(String(n))) moveDraw.set(String(n), snap(`move|${k}`));
    }
    // held vote pose (when the spec has one): stop, raise, hold
    const holdsDraw: [string, Drawing][] = [];
    if (ch.spec.clips?.vote) {
      const ts = t;
      step(1, () => (ts - tm) * v);
      driver.reset(t, 0, 0, 0);
      step(20, null);
      h.play('vote');
      step(60, null);
      holdsDraw.push(['vote', snap('vote')]);
    }
    const simMs = performance.now() - tSim0;

    // lantern socket offset (root frame, idle drawing 0)
    let lantern: THREE.Vector3 | null = null;
    const sock = socketOf(h, 'lanternLight', 'lanternGlow', 'lantern', 'glass', 'handR', 'handL');
    // ------------------------------------------------------------------ render into the atlas
    const tR0 = performance.now();
    const moveKeys = [...moveDraw.keys()].map(Number).sort((a, b) => a - b);
    const drawings: Drawing[] = [...idleDraw, ...moveKeys.map((n) => moveDraw.get(String(n))!), ...holdsDraw.map((x) => x[1])];
    const nCells = drawings.length * FACINGS;
    const grid = atlasGrid(nCells, cell);
    const rtA = makeAtlasRT(grid.width, grid.height);
    const rtB = makeAtlasRT(grid.width, grid.height);
    const scene = new THREE.Scene();
    const parent = h.root.parent;
    scene.add(h.root);
    const tw = cam.texel;
    const camera = new THREE.OrthographicCamera((-cell.w / 2) * tw, (cell.w / 2) * tw, (cell.h - cell.below) * tw, -cell.below * tw, 0.1, BAKE_D * 2);
    camera.quaternion.copy(cam.quat);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quat);
    const prev = { rt: renderer.getRenderTarget(), auto: renderer.autoClear, col: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), sm: renderer.shadowMap.autoUpdate, pass: E.uniforms.uPassMode.value };
    let renders = 0;
    try {
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0);
      E.uniforms.uPassMode.value = 0;
      drawings.forEach((d, di) => {
        // pose
        bones.forEach((b, i) => {
          b.quaternion.copy(d.bones[i]!);
          b.position.copy(d.pos[i]!);
          b.scale.copy(d.scl[i]!);
        });
        if (rig.ghostHalo) rig.ghostHalo.scale.setScalar(1);
        for (let k = 0; k < FACINGS; k++) {
          h.root.position.copy(d.root);
          h.root.quaternion.setFromAxisAngle(UP, facingYaw(k, cam.yaw));
          h.root.updateMatrixWorld(true);
          if (di === 0 && k === 0 && sock) {
            const w = sock.getWorldPosition(new THREE.Vector3()).sub(d.root);
            lantern = w;
          }
          camera.position.copy(d.root).addScaledVector(back, BAKE_D);
          camera.updateMatrixWorld(true);
          const o = cellOrigin(di * FACINGS + k, grid, cell);
          for (const [rt, mode] of [
            [rtA, 1],
            [rtB, 2],
          ] as const) {
            rt.viewport.set(o.x, o.y, cell.w, cell.h);
            rt.scissor.set(o.x, o.y, cell.w, cell.h);
            rt.scissorTest = true;
            renderer.setRenderTarget(rt);
            renderer.clear(true, true, false);
            bakeUniforms.uCtBake.value = mode;
            renderer.render(scene, camera);
            renders++;
          }
        }
      });
    } finally {
      bakeUniforms.uCtBake.value = 0;
      for (const rt of [rtA, rtB]) {
        rt.scissorTest = false;
        rt.viewport.set(0, 0, rt.width, rt.height);
        rt.scissor.set(0, 0, rt.width, rt.height);
      }
      renderer.setRenderTarget(prev.rt);
      renderer.autoClear = prev.auto;
      renderer.setClearColor(prev.col, prev.alpha);
      renderer.shadowMap.autoUpdate = prev.sm;
      E.uniforms.uPassMode.value = prev.pass;
      scene.remove(h.root);
      parent?.add(h.root);
    }
    const renderMs = performance.now() - tR0;

    // look constants
    const look: Record<string, unknown> = {};
    const U = (mats[0]?.userData as { look?: { uniforms: Record<string, { value: unknown }> } }).look?.uniforms ?? {};
    for (const k of LOOK_COPY) if (U[k]) look[k] = cloneValue(U[k]!.value);
    const lu = (mats[0]?.userData as { look?: { opts?: { hullMargin?: number } } }).look?.opts;
    const margin = lu?.hullMargin ?? 0.12;

    const nIdle = idleDraw.length;
    const sheet: SpriteSheet = {
      key,
      specId,
      cam: { texel: cam.texel, pitch: cam.pitch, yaw: cam.yaw },
      cell,
      grid,
      rtA,
      rtB,
      idle: { keys: idleKeys, length: idleLen, cells: idleDraw.map((_, i) => i * FACINGS) },
      move: moveKeys.length ? { poses: moveKeys.length, cycle: cycle || 1, run, cells: moveKeys.map((_, i) => (nIdle + i) * FACINGS) } : null,
      holds: Object.fromEntries(holdsDraw.map(([n], i) => [n, (nIdle + moveKeys.length + i) * FACINGS])),
      byName: Object.fromEntries(drawings.map((d, i) => [d.name.slice(d.name.indexOf('|') + 1), i * FACINGS])),
      palette: paletteTones(geo),
      look,
      spec: ch.spec,
      liveTop,
      hull: { r: reach.r + margin, top: reach.liveTop + margin },
      heightM: h.height || liveTop,
      widthM: Math.max(0.4, Math.min(1.6, reach.r * 2 * 0.8)),
      lantern,
      stats: { buildMs: +built.toFixed(1), simMs: +simMs.toFixed(1), renderMs: +renderMs.toFixed(1), totalMs: 0, drawings: drawings.length, cells: nCells, bytes: atlasBytes(grid), renders },
      refs: 0,
      dispose() {
        rtA.dispose();
        rtB.dispose();
      },
    };
    sheet.stats.totalMs = +(performance.now() - t0).toFixed(1);
    built = 0;
    return sheet;
  } finally {
    // the bake rig is never shown: free it at once
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    h.root.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      geos.add(m.geometry);
      for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mm);
    });
    try {
      h.dispose();
    } catch {
      /* best effort */
    }
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    void built;
  }
}

// ------------------------------------------------------------------------------------ cache

const sheets = new WeakMap<object, Map<string, Promise<SpriteSheet>>>();

export function sheetKey(specId: string, cam: Pick<SheetCamera, 'texel' | 'pitch' | 'yaw'>): string {
  return `${specId}|${cam.texel.toFixed(6)}|${cam.pitch.toFixed(4)}|${cam.yaw.toFixed(4)}`;
}

/** The sheet of a spec for a camera (baked once per engine and key; one bake at a time is the layer's job). */
export function getSheet(engine: object, specId: string, cam: SheetCamera): Promise<SpriteSheet> {
  let m = sheets.get(engine);
  if (!m) sheets.set(engine, (m = new Map()));
  const key = sheetKey(specId, cam);
  let p = m.get(key);
  if (!p) {
    p = bakeSheet(engine, specId, cam, key);
    p.catch(() => m!.delete(key));
    m.set(key, p);
  }
  return p;
}

/** Free every sheet of an engine (layer destroy). */
export function releaseSheets(engine: object): void {
  const m = sheets.get(engine);
  if (!m) return;
  sheets.delete(engine);
  for (const p of m.values()) p.then((s) => s.dispose()).catch(() => undefined);
}

/** Debug: the baked sheets of an engine. */
export async function sheetStats(engine: object): Promise<Record<string, unknown>[]> {
  const m = sheets.get(engine);
  if (!m) return [];
  const out: Record<string, unknown>[] = [];
  for (const p of m.values()) {
    try {
      const s = await p;
      out.push({ key: s.key, cell: s.cell, grid: s.grid, idleKeys: s.idle.keys.length, move: s.move ? { poses: s.move.poses, cycle: +s.move.cycle.toFixed(3), run: s.move.run } : null, holds: Object.keys(s.holds), conflicts: s.palette.conflicts, ...s.stats });
    } catch {
      /* failed bake */
    }
  }
  return out;
}
