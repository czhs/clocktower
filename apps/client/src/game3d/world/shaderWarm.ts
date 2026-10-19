// v3.5 shaders: compile the town's programs in parallel before the warm-up (docs/perf-v3/shaders.md).
//
// The warm-up (stage.warmUp) renders a few frames; three.js creates each program the first time a material is
// drawn and immediately reads it back (onFirstUse: getProgramInfoLog / uniforms), so every compile + link is waited
// for one after the other inside ONE main-thread task (≈ 8.5 s on an Intel/Mesa iGPU with a cold shader cache).
// With KHR_parallel_shader_compile this module first issues every program the first view needs WITHOUT reading it
// back (`renderer.compile` on the scene with the colour target bound, then the post chain and the upscale quad),
// and polls COMPLETION_STATUS_KHR (three's `program.isReady()`) from a timer: the driver compiles them
// concurrently, the main thread stays free (the loading sheet animates), and the warm-up's frames then find the
// programs linked. Without the extension `isReady()` is true at once and this is a no-op (the warm-up compiles as
// before). The poll is guarded like avatars/precompile.ts (liveness check, deadline, released programs = done).
//
// Switches: localStorage `ct.debug.v3par` = '0' turns it off (A/B); anything else = on when the extension exists.
// `ct.debug.v3parEarly` = '0' issues in warmUp instead of at the end of createStage.

import type * as THREE from 'three';

export interface ProgramLike {
  isReady?(): boolean;
}
export interface WarmRenderer {
  compile(o: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Scene | null): unknown;
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(t: THREE.WebGLRenderTarget | null): void;
  extensions: { has(name: string): boolean };
  info: { programs: readonly ProgramLike[] | null };
}
/** The pixel3d PixelPipeline pieces the precompile needs (all optional: a missing piece is skipped). */
export interface WarmPipeline {
  rtScene?: THREE.WebGLRenderTarget;
  rtA?: THREE.WebGLRenderTarget;
  quad?: { material: THREE.Material };
  quadScene?: THREE.Scene;
  quadCam?: THREE.Camera;
  finalMat?: THREE.Material;
  passes?: readonly { enabled?: boolean; material?: THREE.Material }[];
}
export interface ParallelWarmResult {
  mode: 'off' | 'no-ext' | 'ready' | 'timeout' | 'cancelled' | 'error';
  /** programs issued (renderer.info.programs before / after the compile calls) */
  programs: [number, number];
  /** ms from the first compile call until every program reported ready (or the stop) */
  ms: number;
  /** ms spent inside the synchronous compile calls (shader source assembly + GL calls; no link wait) */
  issueMs: number;
}

export const PARALLEL_POLL_MS = 16;
export const PARALLEL_MAX_MS = 30000;

export function parallelWarmEnabled(s: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return s?.getItem('ct.debug.v3par') !== '0';
  } catch {
    return true;
  }
}

/** Issue at the end of createStage (overlaps the avatar build) unless `ct.debug.v3parEarly` = '0' (then in warmUp). */
export function parallelEarly(s: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return s?.getItem('ct.debug.v3parEarly') !== '0';
  } catch {
    return true;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** True when the program needs no more waiting (ready, released, or a stub without isReady). */
export function programReady(p: ProgramLike | null | undefined): boolean {
  if (!p || typeof p.isReady !== 'function') return true;
  try {
    return p.isReady();
  } catch {
    return true;
  }
}

/**
 * Issue the programs of `scene` (colour target bound), of every enabled post pass (ping-pong target bound) and of
 * the upscale (canvas), then resolve when all programs the renderer knows report ready, the deadline passes or
 * `live()` turns false. Restores the render target and the quad's material. Never throws.
 */
export async function parallelWarm(
  r: WarmRenderer,
  pipe: WarmPipeline,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: { live(): boolean; maxMs?: number; now?: () => number; wait?: (ms: number) => Promise<void> },
): Promise<ParallelWarmResult> {
  const now = opts.now ?? (() => performance.now());
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const count = () => r.info?.programs?.length ?? 0;
  const p0 = count();
  let ext = false;
  try {
    ext = typeof r.compile === 'function' && !!r.extensions?.has('KHR_parallel_shader_compile');
  } catch {
    ext = false;
  }
  if (!ext) return { mode: 'no-ext', programs: [p0, p0], ms: 0, issueMs: 0 };
  const t0 = now();
  const quadMat = pipe.quad?.material;
  let prevTarget: THREE.WebGLRenderTarget | null | undefined;
  try {
    prevTarget = r.getRenderTarget();
    if (pipe.rtScene) r.setRenderTarget(pipe.rtScene);
    r.compile(scene, camera);
    if (pipe.quad && pipe.quadScene && pipe.quadCam) {
      for (const pass of pipe.passes ?? []) {
        if (pass.enabled === false || !pass.material) continue;
        pipe.quad.material = pass.material;
        r.setRenderTarget(pipe.rtA ?? null);
        r.compile(pipe.quadScene, pipe.quadCam);
      }
      if (pipe.finalMat) {
        pipe.quad.material = pipe.finalMat;
        r.setRenderTarget(null);
        r.compile(pipe.quadScene, pipe.quadCam);
      }
    }
  } catch (e) {
    console.warn('[town3d] parallel shader warm failed', e);
    return { mode: 'error', programs: [p0, count()], ms: now() - t0, issueMs: now() - t0 };
  } finally {
    if (pipe.quad && quadMat) pipe.quad.material = quadMat;
    if (prevTarget !== undefined) r.setRenderTarget(prevTarget);
  }
  const issueMs = now() - t0;
  const max = opts.maxMs ?? PARALLEL_MAX_MS;
  const programs: [number, number] = [p0, count()];
  for (;;) {
    if (!opts.live()) return { mode: 'cancelled', programs, ms: now() - t0, issueMs };
    const list = r.info?.programs ?? [];
    let pending = 0;
    for (const p of list) if (!programReady(p)) pending++;
    if (pending === 0) return { mode: 'ready', programs, ms: now() - t0, issueMs };
    if (now() - t0 >= max) return { mode: 'timeout', programs, ms: now() - t0, issueMs };
    await wait(PARALLEL_POLL_MS);
  }
}
