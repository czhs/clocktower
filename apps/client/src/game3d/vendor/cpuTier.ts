// v3 perf (cpu). The 'cpu' quality tier: the 3D town on software GL (SwiftShader / llvmpipe / a blocklisted GPU) or
// on a device too slow for 'low' (docs/perf-v3/cpu.md). SwiftShader is geometry-bound (docs/perf-v3/recon-frame.md
// §2.3: the normal pass is a second full scene render, ~45 % of a frame), so the levers cut scene renders first and
// pixels second. Everything here acts on the live Engine from outside (the vendor tree is read-only):
//
//   resolution   internal rows ≈ CPU_ROWS (pixelScale max(2, round(h / CPU_ROWS))) — engineHost's resize
//   frame cap    CPU_FPS_CAP (the rAF loop skips frames; ct.debug.fps still wins) — engineHost
//   shadows      renderer.shadowMap off + the sun casts none (no shadow pass, no shadow compare in any program)
//   normal pass  skipped (the pipeline already cleared rtNormal to a flat normal, no outline flags); the passes that
//                only read it (outline, contact) are off
//   post         the per-body water passes are off by default; grade + vignette stay (the look's colour)
//   point lights kept out of the render with a camera-invisible layer: the game's light pool (borrow / aim / dim, the
//                carried lanterns) runs unchanged, every program compiles with 0 point lights, day and night
//   grass        the grass / reed / flower tuft sprites hidden (vendor world/grass.js meshes named 'grass'): 40-80 k
//                instanced alpha-cut 12×12-texel sprites whose fragment count does not shrink with the resolution;
//                −47 % of a cpu-tier frame on SwiftShader. The ground underneath keeps the same toon colours.
//   materials    the toon lighting without the per-fragment cloud-shadow FBM and the normal noise: SwiftShader runs
//                both sides of a branch (masked SIMD), so a uniform that switches them off saves nothing (measured);
//                they are compiled out with two macros (CPU_TOON_MACROS) appended to a fragment chunk three includes
//                after the vendor's shader head and before main()
//
// Pure helpers are exported for unit tests; installCpuTier() is called by engineHost for tier 'cpu' only, so the GPU
// tiers ('high', 'low') are untouched.
import * as THREE from 'three';
import type { Tier } from '../contract';

/** Target internal rows of the low-res target at the cpu tier (960×540 -> pixelScale 3 -> 320×180). */
export const CPU_ROWS = 180;
/** rAF frames per second at the cpu tier (every 2nd frame of a 60 Hz display; 24 would land on every 3rd = 20 fps):
 *  steady pacing, and a cheap view (indoors) leaves the CPU to the rest of the page. */
export const CPU_FPS_CAP = 30;
/** Camera-invisible layer that keeps point lights out of the render (three only gathers lights the camera sees). */
export const CPU_LIGHT_LAYER = 31;
/** Post passes the cpu tier switches off. The outline / contact passes read the skipped normal pass. */
export const CPU_PASSES_OFF = /^(outline|contact|river|water-)/;
/**
 * Compiled into every lit fragment shader of a cpu-tier renderer (vendor materials/toon.js names): no cloud shadows
 * (`cloudAtten(p)` = clear sky), no lighting-normal noise (the `uNormalNoise > 0.0` block folds away).
 */
export const CPU_TOON_MACROS = '\n#define cloudAtten(p) 1.0\n#define uNormalNoise 0.0\n';
/** The three chunk that carries the macros (fragment only; included after the toon head, right before main()). */
export const CPU_TOON_CHUNK = 'clipping_planes_pars_fragment';
/** Meshes hidden at the cpu tier (by mesh name): the vendor's tuft sprite fields (createGrass names them 'grass'). */
export const CPU_HIDDEN_MESH = /^grass$/;
/** Light re-scan period (frames): lights created after the warm-up (none today) leave the render within this. */
const RESCAN_FRAMES = 60;

/** pixelScale for a canvas height at a tier; the GPU tiers keep coords.ts pixelScaleFor. */
export function cpuPixelScale(heightCss: number): number {
  return Math.max(2, Math.round(heightCss / CPU_ROWS));
}

/** The frame cap a tier runs at: an explicit ct.debug.fps (> 0) wins; the cpu tier caps at CPU_FPS_CAP. */
export function tierFpsLimit(tier: Tier, debugFps: number | undefined): number {
  if (debugFps && debugFps > 0) return debugFps;
  return tier === 'cpu' ? CPU_FPS_CAP : 0;
}

/** Is this post pass off at the cpu tier? */
export function cpuPassOff(name: string | undefined): boolean {
  return !!name && CPU_PASSES_OFF.test(name);
}

/** The slice of a pixel3d Engine the cpu tier touches (structural, for tests). */
export interface CpuEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun?: THREE.DirectionalLight | null;
  pipeline: { rtNormal?: unknown; passes: { name?: string; enabled?: boolean }[] };
}

export interface CpuTier {
  /** Before every pipeline render (engineHost's pipe.render wrapper): re-asserts the levers the vendor may flip back. */
  beforeRender(): void;
  /** Stats for __ctCamera.v3() / the perf doc. */
  info(): { lightsHidden: number; meshesHidden: number; normalSkipped: number; passesOff: number };
  dispose(): void;
}

/** Move every point / spot light to the camera-invisible layer. Returns how many were moved this time. */
export function hideLights(scene: THREE.Object3D, hidden: Set<THREE.Light>): number {
  let n = 0;
  scene.traverse((o) => {
    const l = o as THREE.PointLight & THREE.SpotLight;
    if ((l.isPointLight || l.isSpotLight) && !hidden.has(l)) {
      l.layers.set(CPU_LIGHT_LAYER);
      hidden.add(l);
      n++;
    }
  });
  return n;
}

/** Add the cheap-toon macros to a chunk store (idempotent); returns the restore function. */
export function cheapenToonChunks(chunks: Record<string, string> = THREE.ShaderChunk as unknown as Record<string, string>): () => void {
  const was = chunks[CPU_TOON_CHUNK] ?? '';
  if (was.includes(CPU_TOON_MACROS)) return () => undefined;
  const now = was + CPU_TOON_MACROS;
  chunks[CPU_TOON_CHUNK] = now;
  return () => {
    // only while it is still ours (a newer cpu engine re-applies its own)
    if (chunks[CPU_TOON_CHUNK] === now) chunks[CPU_TOON_CHUNK] = was;
  };
}

/** Find the meshes the cpu tier hides (CPU_HIDDEN_MESH) that are not in `out` yet; returns how many were added. */
export function findHiddenMeshes(scene: THREE.Object3D, out: Set<THREE.Object3D>): number {
  let n = 0;
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && CPU_HIDDEN_MESH.test(o.name) && !out.has(o)) {
      out.add(o);
      n++;
    }
  });
  return n;
}

export function installCpuTier(engine: CpuEngine): CpuTier {
  const r = engine.renderer;
  // before the town build compiles anything: three resolves #include chunks when it builds a program
  const restoreChunks = cheapenToonChunks();
  const pipe = engine.pipeline;
  const hidden = new Set<THREE.Light>();
  const hiddenMeshes = new Set<THREE.Object3D>();
  let frames = 0;
  let normalSkipped = 0;
  let passesOff = 0;
  const offShadows = () => {
    if (r.shadowMap.enabled) r.shadowMap.enabled = false;
    if (engine.sun?.castShadow) engine.sun.castShadow = false;
  };
  // the normal pass: the pipeline binds rtNormal, clears it (flat normal, no flags) and renders the scene into it
  const prevRender = r.render;
  r.render = function (this: THREE.WebGLRenderer, scene: THREE.Object3D, cam: THREE.Camera) {
    if (pipe.rtNormal && r.getRenderTarget() === pipe.rtNormal) {
      normalSkipped++;
      return;
    }
    return prevRender.call(this, scene, cam);
  } as typeof r.render;
  offShadows();
  hideLights(engine.scene, hidden);
  return {
    beforeRender() {
      offShadows();
      // water vis() updaters re-enable their pass every frame they are on screen
      let off = 0;
      for (const p of pipe.passes)
        if (cpuPassOff(p.name)) {
          p.enabled = false;
          off++;
        }
      passesOff = off;
      if (++frames % RESCAN_FRAMES === 1) {
        hideLights(engine.scene, hidden);
        findHiddenMeshes(engine.scene, hiddenMeshes);
      }
      for (const m of hiddenMeshes) m.visible = false;
    },
    info: () => ({ lightsHidden: hidden.size, meshesHidden: hiddenMeshes.size, normalSkipped, passesOff }),
    dispose() {
      if (r.render !== prevRender) r.render = prevRender;
      restoreChunks();
      hidden.clear();
      hiddenMeshes.clear();
    },
  };
}
