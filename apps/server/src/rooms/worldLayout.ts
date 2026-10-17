// (v3, WP0 — lobby-auth area, written by v3-lead) The town layout of a lobby's world.
//
// A lobby's world is fixed at creation (CreateLobbyRequest.world, docs/v3/INTEGRATION.md §2.4):
//   'v2' -> the classic @ct/assets townLayout (unchanged, the default)
//   'v3' -> Hollowmere exported into a TownLayout (`townLayoutV3` from '@ct/assets/hollowmere', WP5a)
// Until WP5a lands the v3 layout does not exist: `worldAvailable('v3')` is false, the directory refuses to
// create v3 lobbies, and `layoutForWorld('v3')` throws. No placeholder layout is ever served for v3 (it
// would put Hollowmere's 3D town over v2 doors and collision).
import { townLayout } from '@ct/assets';
import type { TownLayout, WorldId } from '@ct/protocol';

// CONTRACT-REQUEST(WP5a): replace `null` with `townLayoutV3` imported from '@ct/assets/hollowmere' once the
// subpath exists (server code may import it statically; only the CLIENT keeps it in a lazy chunk).
const V3_LAYOUT: TownLayout | null = null;

export function worldAvailable(world: WorldId): boolean {
  return world === 'v2' || V3_LAYOUT !== null;
}

export function layoutForWorld(world: WorldId | undefined): TownLayout {
  if (world === undefined || world === 'v2') return townLayout;
  if (!V3_LAYOUT) throw new Error('v3 layout not built');
  return V3_LAYOUT;
}
