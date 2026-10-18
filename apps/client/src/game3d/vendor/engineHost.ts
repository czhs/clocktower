// v3 WP0 (v3-lead). Hosts one pixel3d Engine inside the game's canvas container (docs/v3/INTEGRATION.md
// §1.3 step 5). One of the only modules allowed to import '@pixel3d/*' (game3d/vendor/**).
//
// The vendor Engine assumes it owns the page: it appends its canvas to <body>, sizes from window.inner*,
// installs a window resize listener it never removes, has no dispose() and writes window.__pixel. This
// wrapper moves the canvas into our parent, shadows engine.resize with a parent-sized version (driven by
// a ResizeObserver; a no-op after dispose), runs its own RAF loop (never Engine.start: debug controls,
// negative first t) and tears everything down in disposeEngine().
// CONTRACT-REQUEST(pixel3d): Engine({parent, size, rendererOptions}) + dispose() + offUpdate(fn) (§9.2).
import * as THREE from 'three';
import { Engine } from '@pixel3d/core/Engine.js';
import { pixelScaleFor, type ProjectionState } from '../coords';
import type { Tier } from '../contract';
import { runFrameLoop, V3_MAX_FPS, type FrameLoop } from '../perf';
import { cpuPixelScale, installCpuTier, tierFpsLimit, type CpuEngine, type CpuTier } from './cpuTier';
import { installGpuLevers, type GpuLevers } from './gpuLevers';

interface PixelGlobal {
  ready: boolean;
  errors: string[];
  renderAt: ((t: number) => void) | null;
  info: (() => unknown) | null;
  gpu: string | null;
}
type PixelWindow = Window & { __pixel?: PixelGlobal };

export type HostedEngine = Engine & { __ctDisposed?: boolean; __ctGrassArea?: { x0: number; x1: number; z0: number; z1: number } };

// ------------------------------------------------------------------ renderer 'dispose' listeners (leak guard)
// three's WebGLRenderer adds a 'dispose' listener to every material / texture / geometry / render target it uploads
// and removes it only when that object is disposed. The vendor keeps some of those objects for the page's life
// (module-level shared textures / materials, engine-keyed material caches), so every disposed renderer would stay
// reachable from them, and with its program cache the materials' onBeforeCompile closures, the engine and the town
// (C1 leak check: ~135 MB per mount). While a host is alive, every 'dispose' listener added to a three object is
// recorded; the host's dispose() removes them after renderer.dispose() (those objects outlive the renderer).
type Listener = (e: unknown) => void;
/** target -> the 'dispose' listeners added to it while this host was the newest live one */
type DisposeRec = Map<THREE.EventDispatcher, Set<Listener>>;
const recorders: DisposeRec[] = [];
let patched = false;
function recordDisposeListeners(): DisposeRec {
  if (!patched) {
    patched = true;
    const proto = THREE.EventDispatcher.prototype as unknown as { addEventListener(type: string, fn: Listener): void; removeEventListener(type: string, fn: Listener): void };
    const add = proto.addEventListener;
    const remove = proto.removeEventListener;
    proto.addEventListener = function (this: THREE.EventDispatcher, type: string, fn: Listener) {
      const rec = recorders[recorders.length - 1];
      if (type === 'dispose' && rec) {
        let set = rec.get(this);
        if (!set) rec.set(this, (set = new Set()));
        set.add(fn);
      }
      return add.call(this, type, fn);
    };
    // three removes its own listener when the object is disposed: forget it then (no growth over a long session)
    proto.removeEventListener = function (this: THREE.EventDispatcher, type: string, fn: Listener) {
      if (type === 'dispose')
        for (const rec of recorders) {
          const set = rec.get(this);
          if (set?.delete(fn) && !set.size) rec.delete(this);
        }
      return remove.call(this, type, fn);
    };
  }
  const rec: DisposeRec = new Map();
  recorders.push(rec);
  return rec;
}
function releaseDisposeListeners(rec: DisposeRec): void {
  const k = recorders.indexOf(rec);
  if (k >= 0) recorders.splice(k, 1);
  const all = [...rec];
  rec.clear();
  for (const [target, fns] of all)
    for (const fn of fns) {
      try {
        (target as unknown as { removeEventListener(type: string, fn: Listener): void }).removeEventListener('dispose', fn);
      } catch {
        /* best effort */
      }
    }
}

export interface EngineHost {
  engine: HostedEngine;
  tier: Tier;
  /** After buildTown: the demo's runtime CPU savings (single matrix update, the `town-lights` group). */
  installRuntimeOpts(): void;
  /**
   * Start the RAF loop: `frame(t, dtMs)` runs before engine.renderAt(t) each frame, `after(t)` after it. The
   * first throw from any of them stops the loop for good and is passed to `onError` (crash -> Classic).
   */
  start(frame: (t: number, dtMs: number) => void, after?: (t: number) => void, onError?: (e: unknown) => void): void;
  /** Render one frame now (warm-up). */
  renderNow(t: number): void;
  /** Projection inputs of the last rendered frame (coords.ts). One object, updated in place on every call. */
  projection(): ProjectionState;
  /** GPU renderer string. */
  gpu(): string | null;
  /** Frame stats for __ctCamera.v3(). `cpu`: the cpu tier's lever stats (vendor/cpuTier.ts), only at that tier. */
  info(): { calls: number; tris: number; programs: number | null; pixelScale: number; lowW: number; lowH: number; cpu?: ReturnType<CpuTier['info']> };
  /** (v3.3 gpu) the per-frame GPU / driver levers (vendor/gpuLevers.ts). */
  levers: GpuLevers;
  /** (v3.3 gpu) with ct.debug.v3gpu=1: add members to window.__ctGpu (perf A/B hook); a no-op otherwise. */
  gpuDebug(extra: Record<string, unknown>): void;
  dispose(): void;
}

export interface EngineHostOptions {
  tier: Tier;
  /** ct.debug.fps: cap the loop (tests); 0 = every animation frame up to V3_MAX_FPS; < 0 = uncapped (perf runs). */
  fpsLimit?: number;
}

/** Throws (-> Classic via the crash rule) when a vendor re-publish changed what we rely on. */
function assertEngine(engine: HostedEngine): void {
  const w = window as PixelWindow;
  const problems: string[] = [];
  if (engine.renderer?.domElement?.parentElement !== document.body) problems.push('canvas not appended to <body>');
  if (typeof engine.resize !== 'function') problems.push('engine.resize missing');
  if (!engine.pipeline || !engine.camera) problems.push('engine.pipeline / engine.camera missing');
  if (!w.__pixel?.gpu) problems.push('__pixel.gpu not set');
  if (problems.length) throw new Error(`pixel3d Engine contract changed: ${problems.join('; ')}`);
}

/** Engine.resize, re-implemented from the parent's size (pixel ratio 1: canvas px = CSS px). */
function hostResize(engine: HostedEngine, parent: HTMLElement, tier: Tier): void {
  if (engine.__ctDisposed) return;
  // a zero-size parent (hidden pane) would make lowH 0 -> texelWorld Infinity -> NaN geometry: use a nominal frame
  const ww = parent.clientWidth >= 1 ? Math.floor(parent.clientWidth) : 640;
  const hh = parent.clientHeight >= 1 ? Math.floor(parent.clientHeight) : 360;
  engine.pixelScale = tier === 'cpu' ? cpuPixelScale(hh) : pixelScaleFor(hh, tier);
  engine.renderer.setSize(ww, hh, false);
  engine.width = ww;
  engine.height = hh;
  engine.lowW = Math.ceil(ww / engine.pixelScale);
  engine.lowH = Math.ceil(hh / engine.pixelScale);
  engine.camera.resize(engine.lowW, engine.lowH);
  engine.pipeline.resize(engine.lowW, engine.lowH);
}

export function createEngineHost(parent: HTMLElement, opts: EngineHostOptions): EngineHost {
  const w = window as PixelWindow;
  const disposeRec = recordDisposeListeners();
  // Engine.constructor writes window.__pixel.gpu and throws without the object
  const ownPixel = !w.__pixel;
  w.__pixel ??= { ready: false, errors: [], renderAt: null, info: null, gpu: null };
  const params = new URLSearchParams({ quality: opts.tier === 'high' ? 'high' : 'low' });
  let engine: HostedEngine;
  // The constructor adds an anonymous window 'resize' listener it never removes; that listener would keep the whole
  // engine (and, through the vendor's engine-keyed material caches, the renderer and the town) alive for the page's
  // life. Record the window listeners the constructor adds (synchronously, for its duration only) so dispose() can
  // remove them. CONTRACT-REQUEST(pixel3d): Engine.dispose() (§9.2).
  const winListeners: [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined][] = [];
  const addWin = window.addEventListener;
  window.addEventListener = function (this: Window, type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
    winListeners.push([type, fn, o]);
    return addWin.call(this, type, fn, o);
  } as typeof window.addEventListener;
  try {
    engine = new Engine({ params }) as HostedEngine;
  } catch (e) {
    if (ownPixel) delete w.__pixel;
    releaseDisposeListeners(disposeRec);
    throw e;
  } finally {
    window.addEventListener = addWin;
  }
  const removeWinListeners = () => {
    for (const [type, fn, o] of winListeners.splice(0)) window.removeEventListener(type, fn, o);
  };
  try {
    assertEngine(engine);
  } catch (e) {
    try {
      engine.renderer?.forceContextLoss();
      engine.renderer?.dispose();
      engine.renderer?.domElement?.remove();
    } catch {
      /* best effort */
    }
    removeWinListeners();
    releaseDisposeListeners(disposeRec);
    if (ownPixel) delete w.__pixel;
    throw e;
  }
  const canvas = engine.renderer.domElement;
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  parent.appendChild(canvas);
  // v3 perf (cpu): the cpu tier's levers, before anything compiles a program (the town build, the warm-up)
  const cpu: CpuTier | null = opts.tier === 'cpu' ? installCpuTier(engine as unknown as CpuEngine) : null;
  if (cpu) {
    const pipe = engine.pipeline;
    const render = pipe.render;
    pipe.render = function (this: unknown) {
      cpu.beforeRender();
      return render.call(this);
    };
  }
  // v3.3 gpu: program-grouped opaque sort, the river reflection's refresh policy, off-screen water passes skipped
  // (vendor/gpuLevers.ts; every lever behind a ct.debug switch)
  const gpu = installGpuLevers(engine as unknown as Parameters<typeof installGpuLevers>[0]);
  {
    const pipe = engine.pipeline;
    const render = pipe.render;
    pipe.render = function (this: unknown) {
      gpu.render(() => render.call(this));
    };
  }
  let gpuHook: Record<string, unknown> | null = null;
  try {
    if (localStorage.getItem('ct.debug.v3gpu') === '1') {
      gpuHook = {
        engine,
        levers: gpu,
        set: (k: never, v: never) => gpu.set(k, v),
        info: () => gpu.info(),
        /** The same frame again (pipeline only, no updaters; the shadow map re-rendered); returns its draw calls. */
        render(o: { fresh?: boolean } = {}) {
          if (o.fresh) gpu.freshReflections();
          const sm = engine.renderer.shadowMap;
          const auto = sm.autoUpdate;
          sm.autoUpdate = true;
          engine.renderer.info.reset();
          try {
            engine.pipeline.render();
          } finally {
            sm.autoUpdate = auto;
          }
          return engine.renderer.info.render.calls;
        },
      };
      (w as unknown as { __ctGpu?: unknown }).__ctGpu = gpuHook;
    }
  } catch {
    gpuHook = null;
  }
  // the constructor's window 'resize' listener calls this.resize(): the shadow wins (dispose removes that listener)
  engine.resize = () => hostResize(engine, parent, opts.tier);
  engine.resize();
  // The canvas origin (viewport CSS px) for projection(): read lazily, only after something may have moved it
  // (no getBoundingClientRect / forced layout per frame).
  const rect = { left: 0, top: 0 };
  let rectDirty = true;
  const dirtyRect = () => {
    rectDirty = true;
  };
  const ro =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          rectDirty = true;
          engine.resize();
        })
      : null;
  ro?.observe(parent);
  window.addEventListener('resize', dirtyRect);
  window.addEventListener('scroll', dirtyRect, { capture: true, passive: true });

  let loop: FrameLoop | null = null;
  let disposed = false;
  let runtimeOpts = false;
  const vp = new THREE.Matrix4();
  const offset = { x: 0, y: 0 };
  const proj: ProjectionState = { lowW: 0, lowH: 0, scale: 1, offset, snapScreen: false, height: 0, rect, viewProj: vp.elements };

  const renderNow = (t: number) => {
    if (disposed) return;
    engine.renderAt(t);
  };

  const host: EngineHost = {
    engine,
    tier: opts.tier,
    installRuntimeOpts() {
      if (runtimeOpts || disposed) return;
      runtimeOpts = true;
      const scene = engine.scene;
      // only AFTER buildTown: installLights adds its own 'town-lights' group on golden / night builds, and
      // props.js / life/cycle.js bind to the group by name (an early empty one would capture them)
      if (!scene.getObjectByName('town-lights')) {
        const g = new THREE.Group();
        g.name = 'town-lights';
        scene.add(g);
      }
      const pipe = engine.pipeline;
      const render = pipe.render;
      pipe.render = function (this: unknown) {
        scene.updateMatrixWorld();
        const auto = scene.matrixWorldAutoUpdate;
        scene.matrixWorldAutoUpdate = false;
        try {
          return render.call(this);
        } finally {
          scene.matrixWorldAutoUpdate = auto;
        }
      };
    },
    start(frame, after, onError) {
      if (disposed || loop) return;
      loop = runFrameLoop(
        {
          // cpu tier: CPU_FPS_CAP; ct.debug.fps > 0 wins
          fpsLimit: tierFpsLimit(opts.tier, opts.fpsLimit),
          // v3 perf(learn): no more than 60 rendered frames a second on a 120-165 Hz panel (perf.ts V3_MAX_FPS)
          // (ct.debug.fps < 0: uncapped, for perf runs that measure per-frame cost on an unthrottled browser)
          maxFps: opts.fpsLimit !== undefined && opts.fpsLimit < 0 ? 0 : V3_MAX_FPS,
          step(t, dtMs) {
            frame(t, dtMs);
            if (disposed) return;
            renderNow(t);
            after?.(t);
          },
          onError,
        },
        { raf: (cb) => requestAnimationFrame(cb), caf: (id) => cancelAnimationFrame(id), now: () => performance.now() },
      );
    },
    renderNow,
    projection() {
      if (disposed) return proj;
      const cam = engine.camera.cam;
      vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      const scale = engine.pixelScale;
      const integer = Math.abs(scale - Math.round(scale)) < 1e-6;
      const ss = engine.pipeline.upscale?.snapScreen ?? 'auto';
      if (rectDirty) {
        rectDirty = false;
        const r = canvas.getBoundingClientRect();
        rect.left = r.left;
        rect.top = r.top;
      }
      proj.lowW = engine.lowW;
      proj.lowH = engine.lowH;
      proj.scale = scale;
      offset.x = engine.camera.offset.x;
      offset.y = engine.camera.offset.y;
      proj.snapScreen = ss === 'auto' ? integer : !!ss;
      proj.height = engine.height;
      return proj;
    },
    gpu: () => w.__pixel?.gpu ?? null,
    levers: gpu,
    gpuDebug(extra) {
      if (gpuHook) Object.assign(gpuHook, extra);
    },
    info() {
      const i = engine.renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs?.length ?? null, pixelScale: engine.pixelScale, lowW: engine.lowW, lowH: engine.lowH, ...(cpu ? { cpu: cpu.info() } : {}) };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop?.stop();
      loop = null;
      ro?.disconnect();
      window.removeEventListener('resize', dirtyRect);
      window.removeEventListener('scroll', dirtyRect, { capture: true });
      removeWinListeners();
      cpu?.dispose();
      gpu.dispose();
      if (gpuHook && (w as unknown as { __ctGpu?: unknown }).__ctGpu === gpuHook) delete (w as unknown as { __ctGpu?: unknown }).__ctGpu;
      gpuHook = null;
      disposeEngine(engine);
      releaseDisposeListeners(disposeRec);
      if (ownPixel) delete w.__pixel;
    },
  };
  return host;
}

type Disposable = { dispose?: () => void };

/** Free everything an Engine holds (§1.3 "Dispose"); the leaked window listener then only holds a shell. */
export function disposeEngine(engine: HostedEngine): void {
  engine.__ctDisposed = true;
  // Engine.onUpdate has no unsubscribe: buildTown, installLights, createTime and pieces register forever
  engine.updaters.length = 0;
  const seen = new Set<unknown>();
  const free = (x: unknown) => {
    if (!x || seen.has(x)) return;
    seen.add(x);
    (x as Disposable).dispose?.();
  };
  const freeMaterial = (m: THREE.Material) => {
    for (const v of Object.values(m as unknown as Record<string, unknown>)) if (v && (v as THREE.Texture).isTexture) free(v);
    const u = (m as THREE.ShaderMaterial).uniforms;
    if (u) for (const k of Object.keys(u)) if (u[k]?.value && (u[k]!.value as THREE.Texture).isTexture) free(u[k]!.value);
    free(m);
  };
  const graph: THREE.Object3D[] = [];
  try {
    engine.scene?.traverse((o) => {
      graph.push(o);
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) free(mesh.geometry);
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach(freeMaterial);
      else if (mat) freeMaterial(mat);
      const light = o as THREE.DirectionalLight;
      if (light.isLight && light.shadow?.map) free(light.shadow.map);
    });
  } catch {
    /* best effort: keep tearing down */
  }
  try {
    const pipe = engine.pipeline as unknown as Record<string, unknown> | null;
    if (pipe) {
      for (const v of Object.values(pipe)) {
        const r = v as THREE.WebGLRenderTarget & THREE.Material;
        if (r && (r.isWebGLRenderTarget || r.isMaterial)) free(r);
      }
      for (const p of (pipe.passes as { material?: Disposable }[] | undefined) ?? []) free(p.material);
    }
  } catch {
    /* best effort */
  }
  const canvas = engine.renderer?.domElement;
  try {
    engine.renderer?.dispose();
    engine.renderer?.forceContextLoss();
  } catch {
    /* best effort */
  }
  canvas?.remove();
  // Break the scene graph: V8 can keep ONE object of a vendor object literal alive through its allocation site / map
  // (e.g. a piece api with getters whose closure holds a node of the town), and through `parent` / `children` one node
  // would keep the whole town. Unlinked, a stray node holds only itself.
  for (const o of graph) {
    o.parent = null;
    o.children.length = 0;
  }
  // Anything that still holds this object (the constructor's window 'resize' listener is removed by the host; a stray
  // reference elsewhere) must not keep the town: drop EVERY field, not only the heavy ones we know (C1 leak check:
  // pieces park town state on the engine, e.g. townLights, townCutaway, _treeSorters, _treeMats, _foliage*, stats, sun,
  // and the vendor's engine-keyed material caches keep the renderer's dispose listeners: ~135 MB per mount).
  // `resize` becomes a no-op that holds nothing (our shadow closed over the parent element).
  const e = engine as unknown as Record<string, unknown>;
  for (const k of Object.keys(e)) if (k !== '__ctDisposed') e[k] = null;
  e.updaters = [];
  e.resize = noop;
}

function noop(): void {
  /* a disposed engine's resize */
}
