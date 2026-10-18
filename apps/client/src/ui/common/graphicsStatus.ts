// (v3 WP6, v3-ui) The Settings "Town graphics" status line: what draws the town in this lobby and why
// (game3d/select.ts chooseRenderer rows, docs/v3/INTEGRATION.md §1.2), plus the one action that can change it.
// Pure (tested in apps/client/test/ui.graphicsStatus.test.ts), plus `currentRender`: what the mounted town
// ACTUALLY draws right now (GameScreen publishes it), so a runtime fallback in this session (3D mount / chunk
// failure, lost context, a perf fallback under an explicit 'v3' pref) is not reported as "3D on".
import type { WorldId } from '@ct/protocol';
import { createStore, type Store } from '../../net/store';
import type { RendererChoice } from '../../game3d/select';
import type { FallbackReason, RendererKind, Tier } from '../../game3d/contract';

/** The renderer the mounted town draws now (null while no town is mounted). */
export interface CurrentRender {
  kind: RendererKind;
  tier: Tier;
  /** Set when this render is a runtime fallback (GameScreen `requestFallback` / a failed 3D mount or chunk). */
  fallback?: FallbackReason;
}
/** Written by GameScreen whenever its renderer changes (null on unmount); read by the Settings row. */
export const currentRender: Store<CurrentRender | null> = createStore<CurrentRender | null>(null);
/** GameScreen: publish what draws the town (null when the town unmounts). Equal values do not notify. */
export function publishRender(r: CurrentRender | null): void {
  const p = currentRender.get();
  if (p === r || (p && r && p.kind === r.kind && p.tier === r.tier && p.fallback === r.fallback)) return;
  currentRender.set(r ? { kind: r.kind, tier: r.tier, ...(r.fallback ? { fallback: r.fallback } : {}) } : null);
}

/** 'auto-fallback' clears the perf memo, 'boot-guard' resets the guard, 'retry' only re-evaluates (remount). */
export type GraphicsAction = 'auto-fallback' | 'boot-guard' | 'retry';

/**
 * What draws the town here and why, with the one action that can change it. `c` is the fresh
 * chooseRenderer() answer; `now` (optional) is what the mounted town really draws. When they disagree
 * because of a runtime fallback in this session, the fallback is reported ("Try v3 again" remounts).
 */
export function graphicsStatus(world: WorldId | null, c: RendererChoice | null, now: CurrentRender | null = null): { text: string; action?: GraphicsAction } {
  if (!world || !c) return { text: 'Used in Hollowmere (v3) lobbies; Classic lobbies always draw the classic town.' };
  if (world === 'v3' && now?.fallback && now.kind === 'classic' && c.renderer === 'v3') {
    return now.fallback === 'perf'
      ? { text: 'Switched to Classic 2D for speed in this session.', action: 'retry' }
      : { text: 'The 3D town stopped (error), so Classic 2D draws it now.', action: 'retry' };
  }
  switch (c.reason) {
    case 'world-v2':
      return { text: 'This lobby uses the classic town.' };
    case 'forced':
      return { text: 'Debug: the 3D town is forced on in this browser.' };
    case 'forced-no-webgl2':
      return { text: 'Debug: 3D is forced on, but this browser has no WebGL 2, so Classic 2D draws the town.' };
    case 'pref-classic':
      return { text: 'Classic 2D draws this town.' };
    case 'boot-guard':
      return { text: 'v3 graphics stopped last time, so Classic 2D draws the town for now.', action: 'boot-guard' };
    case 'no-webgl2':
      return { text: 'Classic 2D: this browser cannot run the 3D town (no WebGL 2).' };
    case 'software-gl':
      return { text: 'Classic 2D: this device has no graphics acceleration for the 3D town.' };
    case 'auto-fallback':
      return { text: 'Auto (Classic: too slow on this device)', action: 'auto-fallback' };
    case 'phone':
      return { text: 'Auto uses Classic 2D on phones. Choose “v3 3D” to try the 3D town anyway.' };
    case 'ok': {
      // the mounted 3D town reports its own tier (it may differ from the starting tier)
      const tier = now?.kind === 'v3' ? now.tier : c.tier;
      return { text: `The 3D town is on (${tier === 'low' ? 'light' : 'full'} detail).` };
    }
  }
}
