// OWNED BY v3-world (WP5a). A lobby world's layout without importing the v3 data: the v3 layout lives in the lazy
// subpath '@ct/assets/hollowmere' (townLayoutV3), so callers that have it pass it in (docs/v3/INTEGRATION.md §2.2).
import type { TownLayout, WorldId } from '@ct/protocol';
import { townLayout } from '../layout.js';

/** 'v2' (or no world) -> the classic townLayout; 'v3' -> `v3` (throws "v3 layout not built" when it is not given). */
export function layoutFor(world: WorldId | undefined, v3?: TownLayout | null): TownLayout {
  if (world === undefined || world === 'v2') return townLayout;
  if (!v3) throw new Error('v3 layout not built');
  return v3;
}
