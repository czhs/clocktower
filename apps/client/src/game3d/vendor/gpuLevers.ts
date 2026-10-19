// v3.3 gpu (perf prototype, docs/perf-v3/gpu.md). Game-side levers on the vendor pipeline's per-frame GPU / driver
// overhead, all pure three on the hosted Engine (no vendor import, no vendor edit), each behind a ct.debug switch and
// switchable at runtime (window.__ctGpu with ct.debug.v3gpu=1) so an A/B runs in ONE mount:
//
//   sort        'program' = the opaque lists are ordered program -> material -> front-to-back instead of three's
//               material.id -> front-to-back. Materials that share a compiled program (the toon family keys most of
//               the town onto a few programs) then follow each other, so three skips useProgram + the light / camera
//               uniform re-upload between them. A fixed camera angle makes the within-material order stable anyway.
//               ct.debug.v3sort = three | program
//   reflect     the river's planar reflection refresh policy (vendor water.js renders it at 30 Hz):
//               'vendor' (30 Hz), a number (that refresh rate, also while the camera moves), or 'smart': while the
//               camera moves the vendor's own 30 Hz pan logic; while it is still, refresh only when a figure that can
//               appear in the reflection moved, the lighting changed (sky / sun / toon ramp uniforms), or at
//               `reflectIdleFps` for the ambient motion (wind, flames). ct.debug.v3reflect = vendor | smart | <fps>
//   waterCull   skip a water post pass whose body (shape bounds at its level) is entirely off-screen this frame. The
//               pass writes `base` unchanged outside its shape, so skipping it is pixel-identical; the vendor only
//               gates the river this way. ct.debug.v3waterCull = 0 | 1
//
// None of these change a program, a light count or a render target.
import * as THREE from 'three';

export type SortMode = 'three' | 'program';
export type ReflectMode = 'vendor' | 'smart' | number;

export interface GpuLeverState {
  sort: SortMode;
  reflect: ReflectMode;
  /** 'smart': ambient refresh rate while the camera and the figures are still (Hz). */
  reflectIdleFps: number;
  waterCull: boolean;
}

/** Defaults (measured: docs/perf-v3/gpu.md). */
// sort stays three's (the program grouping measured within noise and moves depth ties: 4 px at vote-12)
export const GPU_LEVER_DEFAULTS: GpuLeverState = { sort: 'three', reflect: 'smart', reflectIdleFps: 10, waterCull: true };

type Store = { getItem(k: string): string | null };

/** The lever state from localStorage (unknown values fall back to the defaults). */
export function readGpuLevers(store: Store | null = safeStore()): GpuLeverState {
  const s = { ...GPU_LEVER_DEFAULTS };
  if (!store) return s;
  const sort = store.getItem('ct.debug.v3sort');
  if (sort === 'three' || sort === 'program') s.sort = sort;
  s.reflect = parseReflect(store.getItem('ct.debug.v3reflect'), s.reflect);
  const idle = Number(store.getItem('ct.debug.v3reflectIdle'));
  if (idle > 0) s.reflectIdleFps = idle;
  const wc = store.getItem('ct.debug.v3waterCull');
  if (wc === '0' || wc === '1') s.waterCull = wc === '1';
  return s;
}

export function parseReflect(v: string | null | undefined, d: ReflectMode): ReflectMode {
  if (v === 'vendor' || v === 'smart') return v;
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d;
}

function safeStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------ program sort

interface RenderItemLike {
  id: number;
  object: THREE.Object3D;
  material: THREE.Material;
  groupOrder: number;
  renderOrder: number;
  z: number;
}

/**
 * A stable small integer per (program-relevant material source, object kind). Two materials with the same key compile
 * to the same three program in practice (same type, same customProgramCacheKey / shader text, same defines and the
 * flags three keys programs on); a wrong guess only costs a program switch, never a wrong image.
 */
export function createProgramKeys(): { of(m: THREE.Material, o: THREE.Object3D): number; size(): number } {
  const ids = new Map<string, number>();
  const cache = new WeakMap<THREE.Material, { v: number; k: number[] }>();
  const kindOf = (o: THREE.Object3D) => {
    const x = o as THREE.Object3D & { isBatchedMesh?: boolean; isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
    return x.isBatchedMesh ? 1 : x.isInstancedMesh ? 2 : x.isSkinnedMesh ? 3 : x.isPoints ? 4 : x.isLine ? 5 : x.isSprite ? 6 : 0;
  };
  const source = (m: THREE.Material): string => {
    const sm = m as THREE.ShaderMaterial;
    const ck = typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : '';
    const shader = sm.isShaderMaterial ? `${sm.vertexShader.length}:${sm.fragmentShader.length}:${hash(sm.fragmentShader)}` : '';
    const defs = sm.defines ? JSON.stringify(sm.defines) : '';
    const mm = m as THREE.Material & { vertexColors?: boolean; flatShading?: boolean; map?: unknown; alphaTest: number; fog?: boolean };
    return `${m.type}|${ck}|${shader}|${defs}|${mm.vertexColors ? 1 : 0}${mm.flatShading ? 1 : 0}${mm.map ? 1 : 0}${m.alphaTest > 0 ? 1 : 0}${m.side}${m.transparent ? 1 : 0}${m.premultipliedAlpha ? 1 : 0}`;
  };
  return {
    of(m, o) {
      const kind = kindOf(o);
      let c = cache.get(m);
      if (!c || c.v !== m.version) cache.set(m, (c = { v: m.version, k: [] }));
      let k = c.k[kind];
      if (k === undefined) {
        const s = `${kind}|${source(m)}`;
        k = ids.get(s);
        if (k === undefined) ids.set(s, (k = ids.size));
        c.k[kind] = k;
      }
      return k;
    },
    size: () => ids.size,
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 7) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** three's painterSortStable with the program key between renderOrder and material.id. */
export function makeProgramSort(keys: ReturnType<typeof createProgramKeys>): (a: RenderItemLike, b: RenderItemLike) => number {
  return (a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    if (a.material !== b.material) {
      const ka = keys.of(a.material, a.object), kb = keys.of(b.material, b.object);
      if (ka !== kb) return ka - kb;
      if (a.material.id !== b.material.id) return a.material.id - b.material.id;
    }
    if (a.z !== b.z) return a.z - b.z;
    return a.id - b.id;
  };
}

// ------------------------------------------------------------------------------------------------ reflection policy

/** The vendor reflection object (src/world/water.js makeReflection) as far as the policy reads it. */
export interface VendorReflection {
  level: number;
  rt: THREE.WebGLRenderTarget | null;
  viewProj: THREE.Matrix4;
  crop: number[] | null;
  fps: number;
  render(eng: unknown): void;
}

interface EngineLike {
  time: number;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: { cam: THREE.OrthographicCamera };
  uniforms: Record<string, { value: unknown }>;
  toonUniforms?: Record<string, { value: unknown }>;
  style: { sky: THREE.Color };
  pipeline: { size: THREE.Vector2; passes: { name: string; enabled: boolean; material?: THREE.ShaderMaterial; reflection?: VendorReflection | null }[]; render(): void };
}

const FIG_MOVE2 = 0.03 * 0.03;

/** Numbers that decide the lit look (a change re-renders a still reflection). Written into `out`; returns the count. */
export function lightKey(eng: Pick<EngineLike, 'uniforms' | 'toonUniforms' | 'style'>, out: number[]): number {
  let n = 0;
  const put = (v: unknown) => {
    const x = v as { isColor?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean; r: number; g: number; b: number; x: number; y: number; z: number; w: number };
    if (typeof v === 'number') out[n++] = v;
    else if (!x) return;
    else if (x.isColor) (out[n++] = x.r), (out[n++] = x.g), (out[n++] = x.b);
    else if (x.isVector3) (out[n++] = x.x), (out[n++] = x.y), (out[n++] = x.z);
    else if (x.isVector4) (out[n++] = x.x), (out[n++] = x.y), (out[n++] = x.z), (out[n++] = x.w);
    else if (x.isVector2) (out[n++] = x.x), (out[n++] = x.y);
  };
  put(eng.style.sky);
  for (const k in eng.uniforms) if (k !== 'uTime' && k !== 'uPassMode' && k !== 'uCameraPos' && k !== 'uCameraDir') put(eng.uniforms[k]!.value);
  if (eng.toonUniforms) for (const k in eng.toonUniforms) put(eng.toonUniforms[k]!.value);
  return n;
}

interface ReflRec {
  refl: VendorReflection;
  orig: (eng: unknown) => void;
  vendorFps: number;
  phase: number;
  lastT: number;
  cam: Float64Array;
  haveCam: boolean;
  light: number[];
  lightN: number;
  figs: Map<THREE.Object3D, THREE.Vector3>;
  refreshes: number;
  skipped: number;
  /** why a still-camera refresh happened (smart): idle period, lighting step, figure; and camera-move frames */
  why: { idle: number; light: number; figure: number; camera: number };
}

// ------------------------------------------------------------------------------------------------ install

export interface GpuLevers {
  readonly state: Readonly<GpuLeverState>;
  set<K extends keyof GpuLeverState>(k: K, v: GpuLeverState[K]): void;
  /** Wraps one pipeline.render (installed by the engine host). */
  render(inner: () => void): void;
  /** Force the next reflection call of every water body to re-render (pixel A/B: a fresh reflection of this instant). */
  freshReflections(): void;
  info(): Record<string, unknown>;
  dispose(): void;
}

export function installGpuLevers(engine: EngineLike, init: GpuLeverState = readGpuLevers()): GpuLevers {
  const state: GpuLeverState = { ...init };
  const renderer = engine.renderer;
  const keys = createProgramKeys();
  const programSort = makeProgramSort(keys);
  const applySort = () => (renderer as unknown as { setOpaqueSort(f: unknown): void }).setOpaqueSort(state.sort === 'program' ? programSort : null);
  applySort();

  const recs: ReflRec[] = [];
  const wrapped = new WeakSet<VendorReflection>();
  let figures: THREE.Object3D[] = [];
  let figAge = Infinity;
  let fresh = false;
  const lightBuf: number[] = [];
  const v = new THREE.Vector3();
  const collectReflections = () => {
    for (const p of engine.pipeline.passes) {
      const refl = p.reflection;
      if (!refl || wrapped.has(refl) || typeof refl.render !== 'function') continue;
      wrapped.add(refl);
      const rec: ReflRec = { refl, orig: refl.render.bind(refl), vendorFps: refl.fps, phase: recs.length * 0.037, lastT: -Infinity, cam: new Float64Array(23), haveCam: false, light: [], lightN: 0, figs: new Map(), refreshes: 0, skipped: 0, why: { idle: 0, light: 0, figure: 0, camera: 0 } };
      refl.render = (eng: unknown) => reflect(rec, eng);
      recs.push(rec);
    }
  };

  const camMoved = (rec: ReflRec): boolean => {
    const main = engine.camera.cam;
    const e = main.matrixWorld.elements;
    const k = rec.cam;
    const size = engine.pipeline.size;
    let moved = !rec.haveCam;
    const put = (i: number, x: number) => {
      if (k[i] !== x) {
        k[i] = x;
        moved = true;
      }
    };
    for (let i = 0; i < 16; i++) put(i, e[i]!);
    put(16, main.left);
    put(17, main.right);
    put(18, main.top);
    put(19, main.bottom);
    put(20, rec.refl.level);
    put(21, size.x);
    put(22, size.y);
    rec.haveCam = true;
    return moved;
  };

  /** The figure's root (into `v`) when it can show in this reflection's cropped RT rect, else null. */
  const figureInside = (rec: ReflRec, o: THREE.Object3D): THREE.Vector3 | null => {
    const crop = rec.refl.crop;
    if (!crop || !o.visible || !o.parent) return null;
    const bone = (o as THREE.SkinnedMesh).skeleton?.bones?.[0];
    if (!bone) return null;
    v.setFromMatrixPosition(bone.matrixWorld);
    const size = engine.pipeline.size;
    const m = rec.refl.viewProj.elements;
    const pad = 24; // texels: a figure is ~1.5 m wide and leans
    // feet and head (+2.5 m) through the reflection's view-projection
    for (let dy = 0; dy <= 2.5; dy += 2.5) {
      const x = v.x, y = v.y + dy, z = v.z;
      const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]! || 1;
      const px = (((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w) * 0.5 + 0.5) * size.x;
      const py = (((m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w) * 0.5 + 0.5) * size.y;
      if (px > crop[0]! - pad && px < crop[2]! + pad && py > crop[1]! - pad && py < crop[3]! + pad) return v;
    }
    return null;
  };

  /** A figure that can show in this reflection moved, entered or left since the last refresh. */
  const figuresMoved = (rec: ReflRec): boolean => {
    let inside = 0;
    for (const o of figures) {
      const p = figureInside(rec, o);
      const last = rec.figs.get(o);
      if (!p) {
        if (last) return true; // left the reflection (or hidden)
        continue;
      }
      inside++;
      if (!last || last.distanceToSquared(p) > FIG_MOVE2) return true;
    }
    return inside !== rec.figs.size; // a recorded figure is gone from the scene
  };

  const snapshot = (rec: ReflRec) => {
    rec.lastT = engine.time;
    rec.lightN = lightKey(engine, rec.light);
    rec.figs.clear();
    for (const o of figures) {
      const p = figureInside(rec, o);
      if (p) rec.figs.set(o, p.clone());
    }
  };

  const reflect = (rec: ReflRec, eng: unknown) => {
    const r = rec.refl;
    const mode = fresh ? 0 : state.reflect;
    if (mode === 'vendor' || typeof mode === 'number') {
      const fps = r.fps;
      r.fps = mode === 'vendor' ? rec.vendorFps : mode;
      try {
        rec.orig(eng);
      } finally {
        r.fps = fps;
      }
      rec.refreshes++;
      return;
    }
    // smart
    if (camMoved(rec) || !r.rt) {
      rec.why.camera++;
      rec.orig(eng); // the vendor's own pan / 30 Hz logic
      snapshot(rec);
      rec.refreshes++;
      return;
    }
    const t = engine.time;
    let due = t - rec.lastT + rec.phase >= 1 / Math.max(0.1, state.reflectIdleFps);
    if (due) rec.why.idle++;
    else {
      const n = lightKey(engine, lightBuf);
      due = n !== rec.lightN;
      for (let i = 0; i < n && !due; i++) due = lightBuf[i] !== rec.light[i];
      if (due) rec.why.light++;
      else if ((due = figuresMoved(rec))) rec.why.figure++;
    }
    if (!due) {
      rec.skipped++;
      return;
    }
    const fps = r.fps;
    r.fps = 0; // the vendor re-renders on every call at 0
    try {
      rec.orig(eng);
    } finally {
      r.fps = fps;
    }
    snapshot(rec);
    rec.refreshes++;
  };

  // ---- water cull
  interface Body { pass: EngineLike['pipeline']['passes'][number]; box: [number, number, number, number]; level: () => number }
  let bodies: Body[] | null = null;
  let culledLast = 0;
  const findBodies = () => {
    bodies = [];
    for (const p of engine.pipeline.passes) {
      const u = p.material?.uniforms as Record<string, { value: unknown }> | undefined;
      if (!u || !u.uShapeKind || !u.uLevel || !u.uShapeA) continue;
      const kind = Number(u.uShapeKind.value);
      const A = u.uShapeA.value as THREE.Vector4;
      let box: [number, number, number, number] | null = null;
      if (kind === 1 || kind === 4) box = [A.x, A.y, A.z, A.w];
      else if (kind === 2) box = [A.x - A.z, A.y - A.w, A.x + A.z, A.y + A.w];
      else if (kind === 3) {
        const pts = u.uPoly!.value as THREE.Vector2[];
        const n = Number(u.uPolyN!.value);
        box = [Infinity, Infinity, -Infinity, -Infinity];
        for (let i = 0; i < n; i++) {
          box[0] = Math.min(box[0], pts[i]!.x);
          box[1] = Math.min(box[1], pts[i]!.y);
          box[2] = Math.max(box[2], pts[i]!.x);
          box[3] = Math.max(box[3], pts[i]!.y);
        }
      }
      if (!box) continue; // kind 0 = everywhere
      const lv = u.uLevel;
      bodies.push({ pass: p, box, level: () => Number(lv.value) });
    }
  };
  const vp = new THREE.Matrix4();
  /** NDC overlap of the body's bounds (+ 0.5 m for the shore / foam / wobble texels) with the padded frame. */
  const onScreen = (b: Body): boolean => {
    const e = vp.elements;
    const y = b.level();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? b.box[2] + 0.5 : b.box[0] - 0.5;
      const z = i & 2 ? b.box[3] + 0.5 : b.box[1] - 0.5;
      const yy = i & 4 ? y + 0.5 : y - 0.5;
      const w = e[3]! * x + e[7]! * yy + e[11]! * z + e[15]! || 1;
      const nx = (e[0]! * x + e[4]! * yy + e[8]! * z + e[12]!) / w;
      const ny = (e[1]! * x + e[5]! * yy + e[9]! * z + e[13]!) / w;
      if (nx < x0) x0 = nx;
      if (nx > x1) x1 = nx;
      if (ny < y0) y0 = ny;
      if (ny > y1) y1 = ny;
    }
    return x1 > -1.1 && x0 < 1.1 && y1 > -1.1 && y0 < 1.1;
  };

  let frames = 0;
  const off: EngineLike['pipeline']['passes'] = [];
  return {
    state,
    set(k, val) {
      (state as unknown as Record<string, unknown>)[k] = val;
      if (k === 'sort') applySort();
    },
    render(inner) {
      frames++;
      collectReflections();
      if (recs.length && state.reflect === 'smart' && ++figAge > 60) {
        figAge = 0;
        figures = [];
        engine.scene.traverse((o) => {
          if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.frustumCulled === false && (o as THREE.SkinnedMesh).skeleton?.bones?.length) figures.push(o);
        });
      }
      off.length = 0;
      if (state.waterCull) {
        if (!bodies) findBodies();
        // Engine.renderAt updates the camera before pipeline.render: its matrices are this frame's
        const cam = engine.camera.cam;
        vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        for (const b of bodies!) {
          if (!b.pass.enabled || b.pass.reflection) continue; // the river: the vendor gates it (and its reflection hook reads .enabled)
          if (!onScreen(b)) {
            b.pass.enabled = false;
            off.push(b.pass);
          }
        }
      }
      culledLast = off.length;
      try {
        inner();
      } finally {
        for (const p of off) p.enabled = true;
        fresh = false;
      }
    },
    freshReflections() {
      fresh = true;
    },
    info: () => ({
      ...state,
      frames,
      programKeys: keys.size(),
      reflections: recs.map((r) => ({ refreshes: r.refreshes, skipped: r.skipped, vendorFps: r.vendorFps, why: { ...r.why } })),
      waterBodies: bodies?.length ?? null,
      waterCulled: culledLast,
    }),
    dispose() {
      (renderer as unknown as { setOpaqueSort(f: unknown): void }).setOpaqueSort(null);
      for (const r of recs) r.refl.render = r.orig;
      recs.length = 0;
    },
  };
}
