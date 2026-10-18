// (v3 WP6, v3-ui) The v3 DOM skin state: static, tiny, three-free. docs/v3/INTEGRATION.md §5.
//
// A lobby whose world is 'v3' (Hollowmere) wears the pixel3d UI skin, whatever renderer draws the town
// (Classic 2D draws the v3 map too, §2.5); v2 lobbies keep the v2 look. ./v3skinLobby.ts attaches it to a
// lobby connection (useV3Skin); this module only holds the state and the lazy atlas handle, so art consumers
// (castPortrait, the social dock / pie) can read it without pulling the lobby logic into their chunks.
//
// While the skin is on:
//   <html data-graphics="v3" data-tod="day|golden|night">   (other packages may key CSS on these)
//   the lazy ./v3atlas chunk is loaded: it applies the kit.json colour tokens onto the theme.css variables
//   (CSSOM on <html>), adds the vendor panel skin, and serves atlas frames / the v3 portrait strip.
import { createStore, type Store } from '../../net/store';
import type { V3Atlas } from './v3atlas';

export type SkinLook = 'day' | 'golden' | 'night';

export interface V3SkinState {
  /** A v3 lobby is attached: v3 art and tokens apply. */
  on: boolean;
  look: SkinLook;
  /** The `-night` atlas variants apply (hour ≥ 19:45 or < 06:15). */
  night: boolean;
  /** The §3.1 game hour (0..24). */
  hour: number;
  /** Bumped whenever atlas data (day or night) finished loading: art consumers repaint. */
  rev: number;
}

export const v3Skin: Store<V3SkinState> = createStore<V3SkinState>({ on: false, look: 'day', night: false, hour: 10, rev: 0 });

// ------------------------------------------------------------------------------------ atlas module

let atlas: V3Atlas | null = null;
let atlasLoad: Promise<V3Atlas | null> | null = null;

/** The loaded v3 atlas while the skin is on (null otherwise or while it loads). For non-Preact code. */
export function v3AtlasNow(): V3Atlas | null {
  return v3Skin.get().on && atlas?.loaded() ? atlas : null;
}

/** The skin is on but its day atlases are not loaded yet: resolves when they are (or failed). */
export function v3AtlasPending(): Promise<void> | null {
  if (!v3Skin.get().on || atlas?.loaded()) return null;
  return loadV3Atlas().then((a) => a?.ready().then(() => undefined));
}

/** Load the lazy atlas chunk once (one retry after 1 s: a deploy may have replaced the chunk). */
export function loadV3Atlas(): Promise<V3Atlas | null> {
  if (atlasLoad) return atlasLoad;
  const once = () => import('./v3atlas').then((m) => m.v3atlas);
  atlasLoad = once()
    .catch(() => new Promise<V3Atlas>((res, rej) => setTimeout(() => once().then(res, rej), 1000)))
    .then(
      (a) => (atlas = a),
      (e: unknown) => {
        console.warn('[v3 skin] atlas chunk failed', e);
        atlasLoad = null;
        return null;
      },
    );
  return atlasLoad;
}

/** The atlas module once loaded (even before its data; for the attach logic). */
export const v3AtlasRef = (): V3Atlas | null => atlas;
