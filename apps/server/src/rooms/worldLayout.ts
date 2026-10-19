// (v3, WP0 — lobby-auth area, written by v3-lead) The town layout of a lobby's world.
//
// A lobby's world is fixed at creation (CreateLobbyRequest.world, docs/v3/INTEGRATION.md §2.4):
//   'v2' -> the classic @ct/assets townLayout (unchanged, the default)
//   'v3' -> Hollowmere exported into a TownLayout (`townLayoutV3` from '@ct/assets/hollowmere', WP5a)
// (WP5a, v3-world) The v3 layout is exported from the pixel3d town (scripts/v3/export-hollowmere.mjs), so v3 lobbies
// are available. `V3_LAYOUT` stays nullable so the "v3 refused" path (409, `layoutForWorld('v3')` throws) remains
// the behaviour if it is ever unset again. No placeholder layout is ever served for v3.
import { layoutFor } from '@ct/assets';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import type { TownLayout, WorldId } from '@ct/protocol';

// Server code imports the v3 data statically; only the CLIENT keeps it in a lazy chunk.
const V3_LAYOUT: TownLayout | null = townLayoutV3;

export function worldAvailable(world: WorldId): boolean {
  return world === 'v2' || V3_LAYOUT !== null;
}

export function layoutForWorld(world: WorldId | undefined): TownLayout {
  return layoutFor(world, V3_LAYOUT);
}
