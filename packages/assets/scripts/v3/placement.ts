// OWNED BY v3-world (WP5b, acting for world-art). Where Classic 2D draws the v3 world "Hollowmere"
// (docs/v3/INTEGRATION.md §2.5). Pure data, no image work: scripts/v3/classic.ts paints from it, and
// packages/assets/test/classicV3.test.ts checks it against the generated town-v3.json.
//
// The truth is the server's v3 layout (townLayoutV3: collision, doors, interiors). Classic only draws it:
//   cottages   every v3 cottage is drawn with ITS v2 sprite (same id, same facing), axis-aligned, shifted so the
//              sprite's door sits on the real v3 door tile (offset = v3 door - v2 door, in tiles). Rotated houses
//              therefore stand upright inside (or next to) their placed AABB, and the door mat, the door swing,
//              the boarded planks, the board and the chimney smoke all move with the sprite.
//              Exception (GENERIC_SOUTH): a house whose v2 sprite would land off the map is drawn as a generic
//              south-facing cottage in its own style instead (house-12: its door opens onto the west map edge and
//              faces mostly south, doorNormal (0.34, 0.94); the v2 east-facing sprite would sit entirely at x < 0).
//   tower      the clock tower sprite at the v3 footprint's bottom-left (same size in both worlds).
//   props      the v3 map objects with their v2 sprite (kinds missing in v2 art fall back to a look-alike).
//   interiors  v3 rooms have no furniture objects (the 3D rooms are built by pixel3d). Every floor tile the v3
//              collision blocks gets a piece of v2 furniture drawn on it (bed next to the bed spot first), so
//              there are no invisible walls; decoration only, never collision.
import type { BuildingDef, TilePoint, TileRect, TownLayout } from '@ct/protocol';
import { G, PROP_DEFS, townLayout, townMap, type MapObject, type TownMap } from '../../src/layout.js';
import { townLayoutV3, townMapV3 } from '../../src/hollowmere/layoutV3.js';

/** A v3 object kind that has no v2 sprite -> the v2 sprite drawn instead. */
export const KIND_FALLBACK: Readonly<Record<string, string>> = { flowerbarrel: 'barrel' };

/** Tile offset that moves a v2 sprite onto its v3 spot. */
export interface Shift {
  dx: number;
  dy: number;
}

/** Houses drawn as a generic south-facing cottage (own sprite frames `<kind>_<id>@v3`, scripts/v3/classic.ts). */
export const GENERIC_SOUTH: ReadonlySet<string> = new Set(['house-12']);

export interface DrawnBuilding {
  id: string;
  /** Drawn with a generic south-facing cottage sprite (GENERIC_SOUTH), not the v2 sprite. */
  generic: boolean;
  /** The v3 (server) building, untouched. */
  def: BuildingDef;
  /** Where the v2 sprite's footprint is drawn in the v3 world (tiles). */
  footprint: TileRect;
  /** v2 footprint -> drawn footprint, in tiles. */
  shift: Shift;
}

function v2Def(id: string): BuildingDef {
  const b = [...townLayout.buildings, ...townMap.landmarks].find((x) => x.id === id);
  if (!b) throw new Error(`classic v3: no v2 building ${id}`);
  return b;
}

/** Every v3 cottage + the clock tower, with the drawn (v2 sprite) footprint. Layout order, tower last. */
export function drawnBuildings(layout: TownLayout = townLayoutV3, map: TownMap = townMapV3): DrawnBuilding[] {
  const out: DrawnBuilding[] = [];
  for (const b of layout.buildings) {
    const v2 = v2Def(b.id);
    if (GENERIC_SOUTH.has(b.id)) {
      // a 5 x 4 front-door cottage whose door (x + 2, below the footprint) is the v3 door tile
      const footprint = { x: b.door.x - 2, y: b.door.y - 4, w: 5, h: 4 };
      out.push({ id: b.id, generic: true, def: b, footprint, shift: { dx: footprint.x - v2.footprint.x, dy: footprint.y - v2.footprint.y } });
      continue;
    }
    const shift = { dx: b.door.x - v2.door.x, dy: b.door.y - v2.door.y };
    out.push({ id: b.id, generic: false, def: b, footprint: { ...v2.footprint, x: v2.footprint.x + shift.dx, y: v2.footprint.y + shift.dy }, shift });
  }
  for (const b of map.landmarks) {
    const v2 = v2Def(b.id);
    // same-size sprite: bottom-left of the v3 footprint (the tower has no door logic)
    const shift = { dx: b.footprint.x - v2.footprint.x, dy: b.footprint.y + b.footprint.h - (v2.footprint.y + v2.footprint.h) };
    out.push({ id: b.id, generic: false, def: b, footprint: { ...v2.footprint, x: v2.footprint.x + shift.dx, y: v2.footprint.y + shift.dy }, shift });
  }
  return out;
}

/** The v2 door tile rule (layout.ts doorOf) for a drawn footprint: where the sprite's door is. */
export function spriteDoor(fp: TileRect, facing: 'south' | 'east' | 'west'): TilePoint {
  if (facing === 'south') return { x: fp.x + 2, y: fp.y + fp.h };
  return { x: facing === 'east' ? fp.x + fp.w : fp.x - 1, y: fp.y + fp.h - 1 };
}

const blocked = (L: TownLayout, x: number, y: number) => L.collision[y * L.widthTiles + x] === 1;

/** Small deterministic hash in [0, 1). */
function h01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const TALL2 = ['bookshelf', 'wardrobe', 'loom'];
const LOW2 = ['table', 'roundtable', 'crates', 'sacks'];
const TALL1 = ['plant', 'nightstand', 'candelabra'];
const LOW1 = ['chest', 'barrel', 'stool', 'chair'];

/**
 * Furniture sprites (v2 kinds) on the floor tiles the v3 collision blocks inside each room, so every blocked
 * floor tile shows something. Objects use the v2 MapObject convention: (x, y) = the anchor tile = the sprite's
 * bottom-left tile; PROP_DEFS[kind].col (relative to the anchor) covers exactly the tiles claimed.
 */
export function interiorFurniture(layout: TownLayout = townLayoutV3, map: TownMap = townMapV3): MapObject[] {
  const out: MapObject[] = [];
  const W = layout.widthTiles;
  const ground = (x: number, y: number) => map.ground[y]?.[x] ?? ' ';
  layout.buildings.forEach((b, bi) => {
    const r = b.interior;
    const todo = new Set<number>();
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (ground(x, y) === G.floorWood && blocked(layout, x, y)) todo.add(y * W + x);
    const has = (x: number, y: number) => todo.has(y * W + x);
    const take = (kind: string, x: number, y: number) => {
      const c = PROP_DEFS[kind]!.col!;
      for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) todo.delete((y + c.y + j) * W + x + c.x + i);
      out.push({ kind, x, y });
    };
    // 1. the bed: a blocked block next to the bed spot (2x2 -> wide bed, 1x2 -> bed)
    const bed = b.bed;
    if (bed) {
      const near = [
        [1, 0],
        [-1, 0],
        [0, -1],
        [0, 1],
      ] as const;
      let placed = false;
      for (const [dx, dy] of near) {
        const x = bed.x + dx;
        const y = bed.y + dy;
        if (!has(x, y)) continue;
        // anchor = bottom tile of a vertical pair containing (x, y); prefer the 2-wide bed
        for (const ay of [y + 1, y]) {
          if (has(x, ay) && has(x, ay - 1)) {
            for (const ax of [x, x - 1]) {
              if (has(ax, ay) && has(ax + 1, ay) && has(ax, ay - 1) && has(ax + 1, ay - 1)) {
                take('bedwide', ax, ay);
                placed = true;
                break;
              }
            }
            if (!placed) {
              take('bed', x, ay);
              placed = true;
            }
            break;
          }
        }
        if (placed) break;
      }
    }
    // 2. everything else, row by row: pairs become 2-wide pieces, singles 1-wide; against the back wall tall ones
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!has(x, y)) continue;
        const wall = ground(x, y - 1) === G.iwall;
        const k = h01(bi, x, y);
        if (has(x + 1, y)) {
          const pool = wall ? TALL2 : LOW2;
          take(pool[Math.floor(k * pool.length)]!, x, y);
        } else {
          const pool = wall ? TALL1 : LOW1;
          take(pool[Math.floor(k * pool.length)]!, x, y);
        }
      }
  });
  return out;
}

/** The v3 outdoor props in v2 art kinds (buildings and objects without a v2 sprite are left out). */
export function outdoorProps(map: TownMap = townMapV3): MapObject[] {
  const out: MapObject[] = [];
  for (const o of map.objects) {
    if (o.kind === 'building') continue;
    const kind = PROP_DEFS[o.kind] ? o.kind : KIND_FALLBACK[o.kind];
    if (!kind || !PROP_DEFS[kind]) continue;
    out.push({ kind, x: o.x, y: o.y, ...(o.frame && kind === o.kind ? { frame: o.frame } : {}), ...(o.flip ? { flip: o.flip } : {}) });
  }
  return out;
}

/** The v3 world as the ground painter (scripts/ground.ts) sees it: drawn footprints + all drawn objects. */
export function classicWorldV3(): { townLayout: TownLayout; townMap: TownMap } {
  const drawn = drawnBuildings();
  const fp = new Map(drawn.map((d) => [d.id, d.footprint]));
  const buildings = townLayoutV3.buildings.map((b) => ({ ...b, footprint: fp.get(b.id)! }));
  const landmarks = townMapV3.landmarks.map((b) => ({ ...b, footprint: fp.get(b.id)! }));
  const objects: MapObject[] = [
    ...drawn.map((d) => ({ kind: 'building', x: d.footprint.x, y: d.footprint.y + d.footprint.h - 1, frame: d.generic ? `${d.id}@v3` : d.id })),
    ...outdoorProps(),
    ...interiorFurniture(),
  ];
  return { townLayout: { ...townLayoutV3, buildings }, townMap: { ...townMapV3, objects, landmarks } };
}
