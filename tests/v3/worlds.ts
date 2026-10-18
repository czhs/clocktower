// v3 WP7 (v3-qa). The town layout of each lobby world for the e2e helpers and the synthetic bot (docs/v3/INTEGRATION.md
// §2.4 "tests/support/bot.ts and tests/e2e/helpers.ts take the layout from the room's world").
//
// townLayoutV3 / townMapV3.plaza are rebuilt from hollowmere.generated.json exactly as packages/assets/src/hollowmere/
// layoutV3.ts does: the Playwright / tsx loaders do not take that module's bare JSON import (classic-in-v3.spec.ts uses
// the same workaround). apps/client/test/game3d/harness.scenario.test.ts pins layoutOf('v3') to the real townLayoutV3.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TownLayout, WorldId } from '../../packages/protocol/src/index.js';
import { PLAZA, townLayout } from '../../packages/assets/src/index.js';

export type { WorldId };

interface HollowmereJson extends Omit<TownLayout, 'collision'> {
  collision: string[];
  plaza: { cx: number; cy: number; rx: number; ry: number };
}

let v3: { layout: TownLayout; plaza: HollowmereJson['plaza'] } | null = null;

function loadV3() {
  if (v3) return v3;
  const file = fileURLToPath(new URL('../../packages/assets/src/hollowmere/hollowmere.generated.json', import.meta.url));
  const H = JSON.parse(readFileSync(file, 'utf8')) as HollowmereJson;
  if (H.collision.length !== H.heightTiles) throw new Error(`hollowmere: ${H.collision.length} collision rows, expected ${H.heightTiles}`);
  const layout: TownLayout = {
    version: H.version,
    widthTiles: H.widthTiles,
    heightTiles: H.heightTiles,
    tileSize: H.tileSize,
    townBounds: { ...H.townBounds },
    square: { ...H.square },
    buildings: JSON.parse(JSON.stringify(H.buildings)),
    collision: H.collision.flatMap((row) => [...row].map((c) => (c === '1' ? 1 : 0))),
    playerSpawn: { ...H.playerSpawn },
    storytellerSpawn: { ...H.storytellerSpawn },
    streetlights: H.streetlights.map((p) => ({ ...p })),
    ...(H.circle ? { circle: { ...H.circle } } : {}),
  };
  v3 = { layout, plaza: { ...H.plaza } };
  return v3;
}

/** The layout a lobby of `world` uses (server: apps/server/src/rooms/worldLayout.ts). */
export function layoutOf(world: WorldId | undefined): TownLayout {
  return (world ?? 'v2') === 'v3' ? loadV3().layout : townLayout;
}

/** The square the Classic camera rests on (v2 PLAZA; v3 townMapV3.plaza). */
export function plazaOf(world: WorldId | undefined): { cx: number; cy: number; rx: number; ry: number } {
  return (world ?? 'v2') === 'v3' ? loadV3().plaza : PLAZA;
}
