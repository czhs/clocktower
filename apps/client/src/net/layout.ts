// LEAD-OWNED (v3 WP0). The town layout of the lobby this page is in (docs/v3/INTEGRATION.md §2.4).
//
// A lobby's world is fixed at creation: 'v2' = the classic `townLayout` (static, in the main bundle) or
// 'v3' = Hollowmere (`townLayoutV3` from '@ct/assets/hollowmere', its own lazy chunk, WP5a). LobbyRoute
// awaits `ensureLayout(lobbyView.world)` before it mounts GameScreen, so every consumer can stay
// synchronous and call `currentLayout()` (never cache it in a module-level constant: one page can leave a
// v2 lobby and join a v3 lobby).
//
// (WP5a) `ensureLayout('v3')` imports '@ct/assets/hollowmere'; until it resolved, `currentLayout()` throws
// "v3 layout not built" in a v3 lobby: no placeholder layout is ever drawn over v2 doors. A failed chunk load
// rejects and may be retried.
import { townLayout } from '@ct/assets';
import type { TownLayout, WorldId } from '@ct/protocol';

export const V3_LAYOUT_MISSING = 'v3 layout not built';

let world: WorldId = 'v2';
let v3: TownLayout | null = null;
let v3Load: Promise<TownLayout | null> | null = null;

/** The v3 layout module (lazy chunk). Null while it does not exist yet. */
async function importV3Layout(): Promise<TownLayout | null> {
  // (WP5a) the v3 layout's own lazy chunk; a v2 lobby never fetches it
  return (await import('@ct/assets/hollowmere')).townLayoutV3;
}

/** Bumped by every ensureLayout / selectLayoutIfLoaded: only the latest request may switch `world`. */
let gen = 0;

/**
 * Make `world`'s layout current (v3: fetch its chunk first). Rejects when the v3 layout is not available.
 * `world` switches only once the layout is actually loaded: consumers still mounted from the previous lobby
 * keep reading the previous layout while the chunk loads, and a failed load leaves the previous world.
 */
export async function ensureLayout(w: WorldId | undefined): Promise<void> {
  const want: WorldId = w ?? 'v2';
  const mine = ++gen;
  if (want === 'v2' || v3) {
    world = want;
    return;
  }
  v3Load ??= importV3Layout().catch((e: unknown) => {
    v3Load = null; // a chunk-load failure may be retried
    throw e;
  });
  const l = await v3Load;
  if (!l) {
    v3Load = null;
    throw new Error(V3_LAYOUT_MISSING);
  }
  v3 = l;
  if (mine === gen) world = want; // a later request (e.g. back to a v2 lobby) wins
}

/** If `w`'s layout is already loaded, make it current now (synchronously) and return true. */
export function selectLayoutIfLoaded(w: WorldId | undefined): boolean {
  if ((w ?? 'v2') === 'v2' || v3) {
    gen++;
    world = w ?? 'v2';
    return true;
  }
  return false;
}

/** The current lobby's layout (synchronous). Throws in a v3 lobby whose layout is not loaded. */
export function currentLayout(): TownLayout {
  if (world === 'v2') return townLayout;
  if (!v3) throw new Error(V3_LAYOUT_MISSING);
  return v3;
}

/** The current lobby's world ('v2' until a v3 lobby called ensureLayout). */
export function currentWorld(): WorldId {
  return world;
}

/** (tests) Inject a v3 layout, or drop it again (null). */
export function setV3LayoutForTests(l: TownLayout | null): void {
  v3 = l;
  v3Load = null;
}
