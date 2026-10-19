// Guarded, cancellable shader pre-compile (WP2 avatars, v3.1).
//
// three's `renderer.compileAsync` (r170) compiles synchronously, then polls `properties.get(m).currentProgram
// .isReady()` from a 10 ms timer until every material reports ready. That poll cannot be cancelled and has no guard:
// when a material is disposed while it is still polling (an avatar dropped by a cast change / leave / rebuild, or a
// poll still running after our pre-warm timeout), `properties.get` hands back a fresh `{}`, `currentProgram` is
// undefined and the timer throws "Cannot read properties of undefined (reading 'isReady')" as an uncaught page error
// (and the promise never settles). This runs the same `compile()` and polls with:
//   - a liveness check every tick (the caller's entry generation / layer destroyed) → 'cancelled', poll stops;
//   - a deadline → 'timeout', poll stops (no timer survives the pre-warm);
//   - a released material (no renderer properties, no program) counted as done instead of throwing.

import type * as THREE from 'three';

export interface ProgramLike {
  isReady?(): boolean;
}
export interface CompileRendererLike {
  compile(o: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Scene | null): unknown;
  properties: { has?(o: object): boolean; get(o: object): { currentProgram?: ProgramLike | null } | undefined };
}
export type PrecompileResult = 'ready' | 'cancelled' | 'timeout';

export const PRECOMPILE_POLL_MS = 10;

export function canPrecompile<T>(r: T): r is T & CompileRendererLike {
  const x = r as Partial<CompileRendererLike> | null;
  return !!x && typeof x.compile === 'function' && !!x.properties && typeof x.properties.get === 'function';
}

/** True when the material needs no more waiting: ready, released (disposed) or never given a program. */
export function materialReady(r: CompileRendererLike, m: object): boolean {
  const props = r.properties;
  if (typeof props.has === 'function' && !props.has(m)) return true; // disposed: `get` would only create a stub
  const p = props.get(m)?.currentProgram;
  if (!p || typeof p.isReady !== 'function') return true;
  try {
    return p.isReady();
  } catch {
    return true;
  }
}

/**
 * Compile `roots` synchronously (the caller binds the render target the variants must match), then poll the
 * programs. Throws only if `compile` itself throws (synchronously, before any timer exists).
 */
export function precompile(
  r: CompileRendererLike,
  roots: readonly THREE.Object3D[],
  camera: THREE.Camera,
  scene: THREE.Scene | null,
  opts: { live(): boolean; maxMs: number; now?: () => number },
): Promise<PrecompileResult> {
  const pending = new Set<object>();
  for (const o of roots) {
    const mats = r.compile(o, camera, scene);
    if (mats && typeof (mats as Iterable<object>)[Symbol.iterator] === 'function') for (const m of mats as Iterable<object>) pending.add(m);
  }
  const now = opts.now ?? (() => performance.now());
  const t0 = now();
  return new Promise<PrecompileResult>((resolve) => {
    const check = () => {
      if (!opts.live()) return resolve('cancelled');
      for (const m of pending) if (materialReady(r, m)) pending.delete(m);
      if (pending.size === 0) return resolve('ready');
      if (now() - t0 >= opts.maxMs) return resolve('timeout');
      setTimeout(check, PRECOMPILE_POLL_MS);
    };
    check();
  });
}
