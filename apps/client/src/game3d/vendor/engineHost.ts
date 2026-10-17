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
import { runFrameLoop, type FrameLoop } from '../perf';

interface PixelGlobal {
  ready: boolean;
  errors: string[];
  renderAt: ((t: number) => void) | null;
  info: (() => unknown) | null;
  gpu: string | null;
}
type PixelWindow = Window & { __pixel?: PixelGlobal };

export type HostedEngine = Engine & { __ctDisposed?: boolean; __ctGrassArea?: { x0: number; x1: number; z0: number; z1: number } };

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
  /** Frame stats for __ctCamera.v3(). */
  info(): { calls: number; tris: number; programs: number | null; pixelScale: number; lowW: number; lowH: number };
  dispose(): void;
}

export interface EngineHostOptions {
  tier: Tier;
  /** ct.debug.fps: cap the loop (tests); 0 = every animation frame. */
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
  engine.pixelScale = pixelScaleFor(hh, tier);
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
  // Engine.constructor writes window.__pixel.gpu and throws without the object
  const ownPixel = !w.__pixel;
  w.__pixel ??= { ready: false, errors: [], renderAt: null, info: null, gpu: null };
  const params = new URLSearchParams({ quality: opts.tier === 'low' ? 'low' : 'high' });
  let engine: HostedEngine;
  try {
    engine = new Engine({ params }) as HostedEngine;
  } catch (e) {
    if (ownPixel) delete w.__pixel;
    throw e;
  }
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
  // the constructor's window 'resize' listener calls this.resize(): the shadow wins, and no-ops after dispose
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
          fpsLimit: opts.fpsLimit,
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
    info() {
      const i = engine.renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs?.length ?? null, pixelScale: engine.pixelScale, lowW: engine.lowW, lowH: engine.lowH };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop?.stop();
      loop = null;
      ro?.disconnect();
      window.removeEventListener('resize', dirtyRect);
      window.removeEventListener('scroll', dirtyRect, { capture: true });
      disposeEngine(engine);
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
  try {
    engine.scene?.traverse((o) => {
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
  const e = engine as unknown as Record<string, unknown>;
  for (const k of ['scene', 'pipeline', 'renderer', 'camera', 'uniforms', 'toonUniforms']) e[k] = null;
}
