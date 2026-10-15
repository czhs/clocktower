import type { BuildingDef, TownLayout } from '@ct/protocol';

// Small synthetic layout for zone tests: 40x20 town, square at tile (20,10) r = 5 tiles,
// four cottages (v2: every building is a cottage) with interiors in x >= 50.
export const TS = 16;

function bld(id: string, kind: BuildingDef['kind'], houseIndex: number | null, n: number): BuildingDef {
  const interior = { x: 50 + n * 12, y: 2, w: 10, h: 8 };
  return {
    id,
    kind,
    name: id,
    houseIndex,
    footprint: { x: 2 + n * 8, y: 1, w: 6, h: 3 },
    door: { x: 5 + n * 8, y: 4 },
    interior,
    interiorDoor: { x: interior.x + 5, y: interior.y + 7 },
    ...(kind === 'house' ? { bed: { x: interior.x + 2, y: interior.y + 2 }, visitPoint: { x: interior.x + 4, y: interior.y + 3 } } : {}),
  };
}

export const layout: TownLayout = {
  version: 1,
  widthTiles: 100,
  heightTiles: 20,
  tileSize: TS,
  townBounds: { x: 0, y: 0, w: 40, h: 20 },
  square: { cx: 20 * TS, cy: 10 * TS, r: 5 * TS },
  buildings: [bld('house-0', 'house', 0, 0), bld('house-1', 'house', 1, 1), bld('house-2', 'house', 2, 2), bld('house-3', 'house', 3, 3)],
  collision: new Array(100 * 20).fill(0),
  playerSpawn: { x: 20, y: 12 },
  storytellerSpawn: { x: 20, y: 8 },
  streetlights: [],
};

/** Pixel point inside a building's interior. */
export function inside(id: string): { x: number; y: number; location: `bld:${string}` } {
  const b = layout.buildings.find((bb) => bb.id === id)!;
  return { x: (b.interior.x + 2) * TS, y: (b.interior.y + 2) * TS, location: `bld:${id}` };
}
