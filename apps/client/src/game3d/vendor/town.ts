// v3 WP0 stub (v3-lead) — OWNED BY WP3 (v3-stage) from C0b: replace freely. Builds Hollowmere through the
// vendor composer the way the game needs it (docs/v3/INTEGRATION.md §1.3 step 5, §3.1 "Life"):
//   - camera at the square (gameplay preset) BEFORE the build (grass / trees read the build camera),
//   - `strict: 'all'`: a broken piece throws (-> Classic) instead of a silent placeholder box,
//   - the grass area as the demo's GA via the build-time ground.js rewrite (engine.__ctGrassArea),
//   - life without the misleading systems (walkers, doors, folk, cycle, ambient).
import * as THREE from 'three';
import { applyCamera } from '@pixel3d/town/api.js';
import { PLAZA } from '@pixel3d/town/layout.js';
import { buildTown } from '@pixel3d/town/town.js';
import type { HostedEngine } from './engineHost';

/** The demo's grass area (src/demo/main.js buildWide GA): x -2..47, z 3..41.5 m. */
export const GRASS_AREA = { x0: -2, x1: 47, z0: 3, z1: 41.5 } as const;
export const LIFE_OFF = 'walkers,doors,folk,cycle,ambient';

export type BuiltTown = Awaited<ReturnType<typeof buildTown>>;

export interface TownBuildOptions {
  quality: 'high' | 'low';
  /** Town time-of-day preset (the stub always builds 'noon'; WP3 drives the hour, §3.1). */
  tod?: 'noon' | 'morning' | 'golden' | 'afternoon' | 'night';
}

export async function buildHollowmere(engine: HostedEngine, o: TownBuildOptions): Promise<BuiltTown> {
  applyCamera(engine, 'gameplay', { focus: new THREE.Vector3(PLAZA.cx, 0, PLAZA.cz) });
  const q = new URLSearchParams({ tod: o.tod ?? 'noon', quality: o.quality, life: '1', demo: 'day', lifeOff: LIFE_OFF });
  engine.__ctGrassArea = { ...GRASS_AREA };
  try {
    return await buildTown(engine, q, { strict: 'all' });
  } finally {
    delete engine.__ctGrassArea;
  }
}

/** Ground height (m) at a point, from the built town's ground piece (0 when it has none). */
export function groundHeight(town: BuiltTown): (x: number, z: number) => number {
  const h = town.registry.get('ground')?.api?.heightAt;
  return typeof h === 'function' ? (x, z) => Number((h as (x: number, z: number) => number)(x, z)) || 0 : () => 0;
}
