// (v3 WP5b, v3-world acting for world-art) The world the ground painter (scripts/ground.ts) paints, chosen once
// per process: 'v2' (default: the classic layout.ts town) or 'v3' (CT_ASSETS_WORLD=v3: Hollowmere as Classic 2D
// draws it, scripts/v3/placement.ts). ground.ts derives its tables at import time, so the v3 pass runs in its own
// process (scripts/v3/classic.ts, spawned by scripts/generate.ts). Everything else in the generator keeps
// importing ../src/layout.js directly: the v3 world reuses the v2 sprites.
import { G, PROP_DEFS, TOWN_W, TS, townLayout as layoutV2, townMap as mapV2 } from '../../src/layout.js';
import type { TownLayout } from '@ct/protocol';
import type { TownMap } from '../../src/layout.js';

export type AssetsWorld = 'v2' | 'v3';
export const WORLD: AssetsWorld = process.env.CT_ASSETS_WORLD === 'v3' ? 'v3' : 'v2';

const picked: { townLayout: TownLayout; townMap: TownMap } =
  WORLD === 'v3' ? (await import('../v3/placement.js')).classicWorldV3() : { townLayout: layoutV2, townMap: mapV2 };

export const townLayout: TownLayout = picked.townLayout;
export const townMap: TownMap = picked.townMap;
export { G, PROP_DEFS, TOWN_W, TS };
