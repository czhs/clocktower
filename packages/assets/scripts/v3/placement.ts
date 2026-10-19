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
//   tower      the clock tower sprite at the v3 footprint's bottom-left (same size in both worlds). Enterable in the v3
//              world (a building since vendor pass B): its door is a plain door spot (no swing art), its room gets
//              furniture like the cottages' (no bed: nobody lives there).
//   props      the v3 map objects with their v2 sprite (kinds missing in v2 art fall back to a look-alike).
//   interiors  v3 rooms have no furniture objects (the 3D rooms are built by pixel3d). Every floor tile the v3
//              collision blocks gets a piece of v2 furniture drawn on it (bed next to the bed spot first), so
//              there are no invisible walls; decoration only, never collision.
//   outdoors   the dais (blocked centre of the voting circle) is a raised plinth (objects-v3 `dais@v3`); every other
//              blocked town tile next to walkable ground that nothing drawn covers gets a decorative blocking v2 piece
//              (outdoorFiller, appended by classic.ts since it needs the sprites' pixels): no invisible walls outdoors.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BuildingDef, TilePoint, TileRect, TownLayout } from '@ct/protocol';
import { BLOCKING_GROUND, G, PROP_DEFS, townLayout, townMap, type MapObject, type TownMap } from '../../src/layout.js';
import { npcHomesV3, townLayoutV3, townMapV3 } from '../../src/hollowmere/layoutV3.js';

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

/** The clock tower's sprite: same size in both worlds, at the bottom-left of the v3 footprint (no door art). */
function towerAt(b: BuildingDef, v2: BuildingDef): DrawnBuilding {
  const shift = { dx: b.footprint.x - v2.footprint.x, dy: b.footprint.y + b.footprint.h - (v2.footprint.y + v2.footprint.h) };
  return { id: b.id, generic: false, def: b, footprint: { ...v2.footprint, x: v2.footprint.x + shift.dx, y: v2.footprint.y + shift.dy }, shift };
}

/**
 * Every v3 cottage + the clock tower, with the drawn (v2 sprite) footprint. Layout order: the tower is the 16th
 * building of the v3 layout since the vendor's pass B made it enterable (a landmark in older layouts: drawn last).
 */
export function drawnBuildings(layout: TownLayout = townLayoutV3, map: TownMap = townMapV3): DrawnBuilding[] {
  const out: DrawnBuilding[] = [];
  for (const b of layout.buildings) {
    const v2 = v2Def(b.id);
    if (b.kind === 'clocktower') {
      out.push(towerAt(b, v2));
      continue;
    }
    if (GENERIC_SOUTH.has(b.id)) {
      // a 5 x 4 front-door cottage whose door (x + 2, below the footprint) is the v3 door tile
      const footprint = { x: b.door.x - 2, y: b.door.y - 4, w: 5, h: 4 };
      out.push({ id: b.id, generic: true, def: b, footprint, shift: { dx: footprint.x - v2.footprint.x, dy: footprint.y - v2.footprint.y } });
      continue;
    }
    const shift = { dx: b.door.x - v2.door.x, dy: b.door.y - v2.door.y };
    out.push({ id: b.id, generic: false, def: b, footprint: { ...v2.footprint, x: v2.footprint.x + shift.dx, y: v2.footprint.y + shift.dy }, shift });
  }
  for (const b of map.landmarks) out.push(towerAt(b, v2Def(b.id)));
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


// ------------------------------------------------------------------------------------------------ outdoors: no invisible walls
// The v3 collision blocks outdoor tiles the 2D art would otherwise draw as open ground: tiles the 3D camera cannot
// see behind a house (export rule (b), meta `hidden`), the dais in the middle of the voting circle, and the edges of
// a rotated house's placed AABB that its upright v2 sprite does not cover. Classic shows every such tile as blocked:
//   dais     the blocked tiles around the plaza centre get a raised stone plinth (v3-only frame `dais@v3`)
//   filler   every other blocked town tile next to walkable ground that no building / dais sprite, prop footprint
//            or blocking ground code covers gets a decorative blocking v2 piece (pines, bushes, stumps, rocks),
//            together with the rest of its uncovered blocked patch (so a 4 x 6 patch is a little grove, not a ring)
// Decoration only: the collision stays the server's.

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** A blocking v3-only object Classic draws (sprite in objects-v3.*, frame `<kind>@v3`). */
export const DAIS_KIND = 'dais';

/** The dais tiles: the blocked tiles connected to the plaza centre tile (4-neighbours, inner half of the plaza). */
export function daisTiles(layout: TownLayout = townLayoutV3, map: TownMap = townMapV3): TilePoint[] {
  const TS = layout.tileSize;
  const W = layout.widthTiles;
  const pz = map.plaza;
  const start = { x: Math.floor(pz.cx / TS), y: Math.floor(pz.cy / TS) };
  if (!blocked(layout, start.x, start.y)) return [];
  const inner = (x: number, y: number) => Math.hypot(((x + 0.5) * TS - pz.cx) / pz.rx, ((y + 0.5) * TS - pz.cy) / pz.ry) < 0.5;
  const seen = new Set<number>([start.y * W + start.x]);
  const out: TilePoint[] = [];
  const q = [start];
  while (q.length) {
    const p = q.shift()!;
    out.push(p);
    for (const [dx, dy] of N4) {
      const x = p.x + dx;
      const y = p.y + dy;
      const k = y * W + x;
      if (seen.has(k) || !inner(x, y) || !blocked(layout, x, y)) continue;
      seen.add(k);
      q.push({ x, y });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The dais object (anchor = bottom-left tile of the dais tiles' bounding box, size in tiles), or null. */
export function daisObject(layout: TownLayout = townLayoutV3, map: TownMap = townMapV3): (MapObject & { w: number; h: number }) | null {
  const t = daisTiles(layout, map);
  if (!t.length) return null;
  const x0 = Math.min(...t.map((p) => p.x));
  const x1 = Math.max(...t.map((p) => p.x));
  const y0 = Math.min(...t.map((p) => p.y));
  const y1 = Math.max(...t.map((p) => p.y));
  return { kind: DAIS_KIND, x: x0, y: y1, frame: `${DAIS_KIND}@v3`, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** A drawn sprite in world px; `alpha(sx, sy)` reads its own pixels (sprite-local px). */
export interface SpriteBox {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: (sx: number, sy: number) => number;
}

/** Town tiles (y * W + x) at least half covered by opaque pixels of the given sprites (their union). */
export function spriteCover(sprites: readonly SpriteBox[], layout: TownLayout = townLayoutV3): Set<number> {
  const TS = layout.tileSize;
  const tb = layout.townBounds;
  const PW = tb.w * TS;
  const PH = tb.h * TS;
  const ox = tb.x * TS;
  const oy = tb.y * TS;
  const mask = new Uint8Array(PW * PH);
  for (const s of sprites)
    for (let sy = 0; sy < s.h; sy++) {
      const py = s.y + sy - oy;
      if (py < 0 || py >= PH) continue;
      for (let sx = 0; sx < s.w; sx++) {
        const px = s.x + sx - ox;
        if (px < 0 || px >= PW || mask[py * PW + px]) continue;
        if (s.alpha(sx, sy) > 0) mask[py * PW + px] = 1;
      }
    }
  const out = new Set<number>();
  for (let ty = 0; ty < tb.h; ty++)
    for (let tx = 0; tx < tb.w; tx++) {
      let n = 0;
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) n += mask[(ty * TS + y) * PW + tx * TS + x]!;
      if (n * 2 >= TS * TS) out.add((tb.y + ty) * layout.widthTiles + tb.x + tx);
    }
  return out;
}

/** Tiles claimed by v2 props (PROP_DEFS col relative to the anchor tile). Kinds without a v2 def claim nothing. */
export function propTiles(objects: readonly MapObject[], layout: TownLayout = townLayoutV3): Set<number> {
  const out = new Set<number>();
  for (const o of objects) {
    const c = PROP_DEFS[o.kind]?.col;
    if (!c) continue;
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) out.add((o.y + c.y + j) * layout.widthTiles + o.x + c.x + i);
  }
  return out;
}

/**
 * Blocked town tiles that look blocked in Classic: under a building / dais sprite (`cover`, spriteCover), in a drawn
 * prop's blocked rect (`props`), or on blocking ground (BLOCKING_GROUND: dense forest, water, hedges, walls, void).
 */
export function visiblyBlocked(cover: ReadonlySet<number>, props: readonly MapObject[], layout: TownLayout = townLayoutV3, map: TownMap = townMapV3): Set<number> {
  const out = new Set<number>();
  const pt = propTiles(props, layout);
  const tb = layout.townBounds;
  for (let y = tb.y; y < tb.y + tb.h; y++)
    for (let x = tb.x; x < tb.x + tb.w; x++) {
      const k = y * layout.widthTiles + x;
      if (!blocked(layout, x, y)) continue;
      if (cover.has(k) || pt.has(k) || BLOCKING_GROUND.has(map.ground[y]?.[x] ?? ' ')) out.add(k);
    }
  return out;
}

/** Blocked town tiles next to (4-neighbour) walkable town ground that do not look blocked: invisible walls. */
export function invisibleWalls(visible: ReadonlySet<number>, layout: TownLayout = townLayoutV3): TilePoint[] {
  const tb = layout.townBounds;
  const inTown = (x: number, y: number) => x >= tb.x && y >= tb.y && x < tb.x + tb.w && y < tb.y + tb.h;
  const out: TilePoint[] = [];
  for (let y = tb.y; y < tb.y + tb.h; y++)
    for (let x = tb.x; x < tb.x + tb.w; x++) {
      if (!blocked(layout, x, y) || visible.has(y * layout.widthTiles + x)) continue;
      if (N4.some(([dx, dy]) => inTown(x + dx, y + dy) && !blocked(layout, x + dx, y + dy))) out.push({ x, y });
    }
  return out;
}

const FILL1 = ['bush', 'bush', 'bushberry', 'stump', 'rock'];

/**
 * Decorative blocking v2 pieces for the invisible walls (above), so Classic draws none outdoors. Each uncovered
 * blocked patch (4-connected, inside the town) that touches walkable ground is filled whole: horizontal pairs become
 * pines (a grove), single tiles bushes / stumps / rocks. Deterministic (tile hash).
 * `cover` = spriteCover of the building and dais sprites; `props` = the drawn outdoor props (incl. the dais).
 */
export function outdoorFiller(cover: ReadonlySet<number>, props: readonly MapObject[], layout: TownLayout = townLayoutV3, map: TownMap = townMapV3): MapObject[] {
  const W = layout.widthTiles;
  const tb = layout.townBounds;
  const visible = visiblyBlocked(cover, props, layout, map);
  const inTown = (x: number, y: number) => x >= tb.x && y >= tb.y && x < tb.x + tb.w && y < tb.y + tb.h;
  const open = (x: number, y: number) => inTown(x, y) && blocked(layout, x, y) && !visible.has(y * W + x);
  const todo = new Set<number>();
  for (const s of invisibleWalls(visible, layout)) {
    if (todo.has(s.y * W + s.x)) continue;
    todo.add(s.y * W + s.x);
    const q = [s];
    while (q.length) {
      const p = q.pop()!;
      for (const [dx, dy] of N4) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (!open(x, y) || todo.has(y * W + x)) continue;
        todo.add(y * W + x);
        q.push({ x, y });
      }
    }
  }
  const has = (x: number, y: number) => todo.has(y * W + x);
  // a pine's crown (2 tiles wide, `rows` tall above its anchor) must not hang over a house / the dais or a door
  const doors = new Set(layout.buildings.map((b) => b.door.y * W + b.door.x));
  const crownFree = (x: number, y: number, rows: number) => {
    for (let dy = 1; dy <= rows; dy++) for (let dx = 0; dx < 2; dx++) if (cover.has((y - dy) * W + x + dx) || doors.has((y - dy) * W + x + dx)) return false;
    return true;
  };
  const out: MapObject[] = [];
  for (let y = tb.y; y < tb.y + tb.h; y++)
    for (let x = tb.x; x < tb.x + tb.w; x++) {
      if (!has(x, y)) continue;
      todo.delete(y * W + x);
      const k = h01(7, x, y);
      const kind = k < 0.4 ? 'pine' : 'pinetall';
      if (has(x + 1, y) && k < 0.6 && crownFree(x, y, kind === 'pine' ? 3 : 4)) {
        todo.delete(y * W + x + 1);
        out.push({ kind, x, y });
      } else out.push({ kind: FILL1[Math.floor(h01(11, x, y) * FILL1.length)]!, x, y });
    }
  return out;
}

/** The v3 world as the ground painter (scripts/ground.ts) sees it: drawn footprints + all drawn objects. */
export function classicWorldV3(): { townLayout: TownLayout; townMap: TownMap } {
  const drawn = drawnBuildings();
  const fp = new Map(drawn.map((d) => [d.id, d.footprint]));
  const buildings = townLayoutV3.buildings.map((b) => ({ ...b, footprint: fp.get(b.id)! }));
  const landmarks = townMapV3.landmarks.map((b) => ({ ...b, footprint: fp.get(b.id)! }));
  const dais = daisObject();
  const objects: MapObject[] = [
    ...drawn.map((d) => ({ kind: 'building', x: d.footprint.x, y: d.footprint.y + d.footprint.h - 1, frame: d.generic ? `${d.id}@v3` : d.id })),
    ...outdoorProps(),
    ...(dais ? [{ kind: dais.kind, x: dais.x, y: dais.y, frame: dais.frame! }] : []),
    ...interiorFurniture(),
  ];
  // (scripts/v3/classic.ts appends outdoorFiller(): it needs the drawn sprites' pixels)
  return { townLayout: { ...townLayoutV3, buildings }, townMap: { ...townMapV3, objects, landmarks } };
}

/** The generator sources the v3 Classic art depends on (packages/assets-relative), hashed into town-v3.json. */
export const CLASSIC_SOURCES: readonly string[] = ['scripts/v3/placement.ts', 'scripts/v3/classic.ts', 'scripts/ground.ts', 'scripts/lib/world.ts'];

/**
 * Freshness hash of the v3 Classic art (town-v3.json map property `sourceHash`): sha256 over the v3 layout + map
 * (incl. ground, paths, objects, decals) + the NPC homes + CLASSIC_SOURCES. classicV3.test.ts recomputes it, so a vendor
 * re-publish that moves paths / trees / decals without changing collision fails until `pnpm assets:generate` ran.
 */
export function classicSourceHash(): string {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const h = createHash('sha256');
  h.update(JSON.stringify(townLayoutV3));
  h.update(JSON.stringify(townMapV3));
  h.update(JSON.stringify(npcHomesV3));
  for (const f of CLASSIC_SOURCES) {
    h.update(`\0${f}\0`);
    h.update(readFileSync(root + f));
  }
  return h.digest('hex');
}
