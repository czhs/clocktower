// v3.2 perf (docs/perf-v3/fullstack.md lever 3): fetch only the town renderer this page will actually use.
//   - a v3 join never downloads Phaser (TownGame, ≈ 360 KB br + ≈ 55-200 ms of evaluation) unless Classic is chosen:
//     Graphics = Classic, a phone, the boot guard, the auto-fallback memo, no webgl2 (game3d/select.ts), or a v2 lobby;
//     an in-place fallback (perf / crash) imports it on demand in GameScreen;
//   - the home / landing page of the v3 app (`/`) prefetches the 3D town chunk (town3d + its static deps) and the
//     lobby chunk when the browser is idle, so the join does not wait for them. Not under /v2/, not where select.ts
//     would pick Classic (phones), never with Save-Data or a slow effective connection (2g / slow-2g / 3g).
// Not in the entry chunk (v3.2 release: main.tsx imports it dynamically when idle; select.ts in the entry pushed the
// entry JS over its 45 KiB br budget). Static imports: select.ts (three-free), appWorld and prefetchAllowed only.
import type { WorldId } from '@ct/protocol';
import { chooseRendererHere } from '../../game3d/select';
import { appWorld } from './appWorld';

export { prefetchAllowed } from './prefetchAllowed';
import { prefetchAllowed } from './prefetchAllowed';

/** Will a lobby of `world` on this page draw with Classic (Phaser)? select.ts decides (probes webgl2 once). */
export function classicHere(world: WorldId): boolean {
  try {
    return chooseRendererHere(world).renderer === 'classic';
  } catch {
    return true;
  }
}

let town3d: Promise<unknown> | null = null;
let classic: Promise<unknown> | null = null;

/** Start loading the 3D town chunk (idempotent; never rejects; a failure retries on the next call). */
export function loadTown3d(): Promise<unknown> {
  return (town3d ??= import('../../game3d/TownGame3d').catch(() => {
    town3d = null;
  }));
}

/** Start loading Classic (Phaser) (idempotent; never rejects). */
export function loadClassic(): Promise<unknown> {
  return (classic ??= import('../../game/TownGame').catch(() => {
    classic = null;
  }));
}

/**
 * The join (LobbyRoute): warm the renderer a lobby of `world` will use. `world` undefined = not known yet (before
 * lobby:view): the page's own app world is the best guess (a v3 link at `/`, a v2 link under /v2/); a lobby of the
 * other world moves the page (syncWorldPath) and calls this again with its world.
 */
export function warmRenderer(world: WorldId | undefined = appWorld()): void {
  if (classicHere(world)) void loadClassic();
  else void loadTown3d();
}

/** The v3 app's home / landing page, when the browser is idle: prefetch the 3D town if this page would use it. */
export function prefetchTown3dForHome(): void {
  if (appWorld() !== 'v3' || !prefetchAllowed() || classicHere('v3')) return;
  const town = loadTown3d();
  // (v3.5 shaders) compile last visit's town programs in a hidden context, so a join after a browser shader-cache loss
  // (browser / driver update, eviction) does not pay the iGPU's multi-second compile again (game3d/shaderCache.ts)
  let tier: string;
  try {
    tier = chooseRendererHere('v3').tier;
  } catch {
    return;
  }
  void town
    .then((m) => (m as { prewarmTownShaders?: (tier: string) => Promise<unknown> } | undefined)?.prewarmTownShaders?.(tier))
    .catch(() => undefined);
}
