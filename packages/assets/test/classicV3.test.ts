// OWNED BY v3-world (WP5b, acting for world-art). Classic 2D in a v3 world (docs/v3/INTEGRATION.md §2.5): the
// generated town-v3.json / terrain-v3.* / objects-v3.* / square-props-v3.json that TownScene draws in a v3 lobby.
// The server's v3 layout stays the truth: collision, doors and interiors here must be exactly townLayoutV3's, and
// what Classic draws (scripts/v3/placement.ts) must line up with it. Re-run `pnpm assets:generate` when it fails.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import type { TileRect } from '@ct/protocol';
import { G, PROP_DEFS, townLayout as townLayoutV2 } from '../src/layout.js';
import { npcHomesV3, townLayoutV3 as L, townMapV3 as M } from '../src/hollowmere/layoutV3.js';
import { drawnBuildings, GENERIC_SOUTH, interiorFurniture, outdoorProps, spriteDoor } from '../scripts/v3/placement.js';
import { decodeWebP } from '../scripts/lib/encode.js';

const GEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated');
const json = <T>(name: string): T => JSON.parse(readFileSync(join(GEN, name), 'utf8')) as T;
type Prop = { name: string; value: unknown };
type TObj = { id: number; name: string; type: string; x: number; y: number; width: number; height: number; properties: Prop[] };
type Layer = { name: string; type: string; width?: number; height?: number; data?: number[]; objects?: TObj[] };
type Tiled = { width: number; height: number; tilewidth: number; properties: Prop[]; tilesets: { name: string; image: string; firstgid: number; imagewidth: number; imageheight: number; tilecount: number }[]; layers: Layer[] };
type Rect = { x: number; y: number; w: number; h: number };
type Ov = { frame: string; w: number; h: number; wx: number; wy: number; atlas?: string };
type HouseFx = { boarded?: Ov; unlit?: Ov; doorglow?: { x: number; y: number }; board?: { x: number; y: number }; smoke?: { x: number; y: number } };

const TS = 16;
const town = json<Tiled>('town-v3.json');
const townV2 = json<Tiled>('town.json');
const objectsAtlas = json<{ frames: Record<string, Rect> }>('objects.json').frames;
const extraAtlas = json<{ image: string; width: number; height: number; frames: Record<string, Rect> }>('objects-v3.json');
const fxV2 = json<{ frames: Record<string, Rect>; meta: { houses: Record<string, HouseFx> } }>('square-props.json');
const fxV3 = json<{ world: string; meta: { houses: Record<string, HouseFx> } }>('square-props-v3.json');
const prop = (o: { properties: Prop[] }, n: string) => o.properties.find((p) => p.name === n)?.value;
const layer = (name: string) => town.layers.find((l) => l.name === name)!;
const objects = layer('objects').objects!;
const drawn = drawnBuildings();
const frameExists = (frame: string, atlas: unknown) => (atlas === 'objects-v3' ? !!extraAtlas.frames[frame] : !!objectsAtlas[frame]);

describe('town-v3.json: the v3 layout, tile for tile', () => {
  it('is a 112 x 43 map of 16 px tiles marked world v3 (the v2 town.json is untouched)', () => {
    expect([town.width, town.height, town.tilewidth]).toEqual([L.widthTiles, L.heightTiles, TS]);
    expect(prop(town, 'world')).toBe('v3');
    expect(JSON.parse(String(prop(town, 'townBounds')))).toEqual(L.townBounds);
    expect(JSON.parse(String(prop(town, 'square')))).toEqual(L.square);
    expect(JSON.parse(String(prop(town, 'plaza')))).toEqual(M.plaza);
    expect(JSON.parse(String(prop(town, 'npcHomes')))).toEqual(npcHomesV3);
    expect(prop(townV2, 'world')).toBeUndefined();
    expect([townV2.width, townV2.height]).toEqual([townLayoutV2.widthTiles, townLayoutV2.heightTiles]);
  });

  it('the collision layer is exactly the server collision; ground indexes the v3 tileset; decor = the v3 decals', () => {
    const [terrain, decor, col] = town.tilesets;
    expect(terrain!.image).toBe('terrain-v3.png');
    const ground = layer('ground').data!;
    expect(ground.length).toBe(L.widthTiles * L.heightTiles);
    expect(ground.every((g) => g >= 1 && g <= terrain!.tilecount)).toBe(true);
    const c = layer('collision').data!;
    expect(c.map((v) => (v ? 1 : 0))).toEqual(L.collision);
    expect(c.filter(Boolean).every((v) => v === col!.firstgid)).toBe(true);
    const d = layer('decor').data!;
    expect(d.filter(Boolean).length).toBe(M.decals.length);
    for (const dec of M.decals) expect(d[dec.y * L.widthTiles + dec.x]).toBeGreaterThanOrEqual(decor!.firstgid);
  });

  it('terrain-v3 / objects-v3: WebP lossless == PNG, sized as the map declares', async () => {
    for (const name of ['terrain-v3', 'objects-v3']) {
      expect(existsSync(join(GEN, `${name}.webp`))).toBe(true);
      const p = PNG.sync.read(readFileSync(join(GEN, `${name}.png`)));
      const buf = readFileSync(join(GEN, `${name}.webp`));
      expect(buf.subarray(12, 16).toString('latin1')).toBe('VP8L');
      const w = await decodeWebP(buf);
      expect([w.width, w.height]).toEqual([p.width, p.height]);
      expect(Buffer.compare(w.data, p.data)).toBe(0);
      if (name === 'terrain-v3') expect([p.width, p.height]).toEqual([town.tilesets[0]!.imagewidth, town.tilesets[0]!.imageheight]);
      else expect([p.width, p.height]).toEqual([extraAtlas.width, extraAtlas.height]);
    }
  });

  it('every object frame exists in its atlas; v3 lights are all there', () => {
    for (const o of objects) {
      if (o.type === 'light') continue;
      expect(frameExists(String(prop(o, 'frame')), prop(o, 'atlas')), `${o.name} ${String(prop(o, 'frame'))}`).toBe(true);
      if (o.type === 'door') for (const k of ['leaf', 'hole']) expect(frameExists(String(prop(o, k)), prop(o, 'atlas'))).toBe(true);
    }
    const lights = objects.filter((o) => o.type === 'light' && !prop(o, 'facade'));
    expect(lights.length).toBe(M.lights.length);
    expect(lights.filter((o) => prop(o, 'building')).length).toBe(M.lights.filter((l) => l.building).length);
  });
});

describe('cottages: v2 sprites on the v3 doors', () => {
  it('every v3 cottage + the tower has one building object at its drawn footprint', () => {
    expect(drawn.map((d) => d.id)).toEqual([...L.buildings.map((b) => b.id), 'clocktower']);
    for (const d of drawn) {
      const bo = objects.filter((o) => o.type === 'building' && o.name === d.id);
      expect(bo.length, d.id).toBe(1);
      const o = bo[0]!;
      expect(prop(o, 'building')).toBe(d.id);
      if (d.def.kind !== 'clocktower') expect(JSON.parse(String(prop(o, 'footprint')))).toEqual(d.footprint);
      // the sprite stands on the footprint's bottom row, left edge on its left column
      expect(o.x).toBe(d.footprint.x * TS);
      expect(o.y + o.height).toBe((d.footprint.y + d.footprint.h) * TS);
    }
  });

  it("each sprite's door is the real v3 door tile, and the door swing sits on it", () => {
    for (const d of drawn) {
      if (d.def.kind === 'clocktower') continue;
      const facing = d.generic ? 'south' : (M.styles[d.id]!.facing as 'south' | 'east' | 'west');
      expect(spriteDoor(d.footprint, facing), d.id).toEqual(d.def.door);
      const door = objects.find((o) => o.type === 'door' && prop(o, 'building') === d.id);
      expect(door, `${d.id} door object`).toBeDefined();
      if (d.generic) {
        // its own sprite: the leaf sits right above the doorstep
        const cx = door!.x + door!.width / 2;
        const by = door!.y + door!.height;
        expect(Math.abs(cx - (d.def.door.x * TS + 8)), `${d.id} door x`).toBeLessThanOrEqual(TS);
        expect(Math.abs(by - d.def.door.y * TS), `${d.id} door y`).toBeLessThanOrEqual(TS);
      } else {
        // the v2 sprite's door swing, moved with the sprite
        const v2 = townV2.layers.find((l) => l.name === 'objects')!.objects!.find((o) => o.type === 'door' && prop(o, 'building') === d.id)!;
        expect([door!.x - v2.x, door!.y - v2.y, door!.width, door!.height], d.id).toEqual([d.shift.dx * TS, d.shift.dy * TS, v2.width, v2.height]);
      }
    }
  });

  it('only GENERIC_SOUTH houses use their own sprites (house-12: the v2 sprite would be off the map)', () => {
    expect([...GENERIC_SOUTH]).toEqual(['house-12']);
    for (const d of drawn) expect(d.generic).toBe(GENERIC_SOUTH.has(d.id));
    expect(Object.keys(extraAtlas.frames).sort()).toEqual(['bld_house-12@v3', 'boarded_house-12@v3', 'door_house-12@v3', 'doorway_house-12@v3', 'unlit_house-12@v3']);
  });

  it('every drawn sprite has at least half of its footprint inside the town', () => {
    const tb = L.townBounds;
    for (const d of drawn) {
      const f = d.footprint;
      let inside = 0;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) if (x >= tb.x && y >= tb.y && x < tb.x + tb.w && y < tb.y + tb.h) inside++;
      expect(inside / (f.w * f.h), d.id).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('a rotated house keeps its v3 door normal: Classic doors open inward along -doorNormal (rules/doors.ts)', () => {
    // the drawn facing never contradicts the door normal's horizontal side
    for (const d of drawn) {
      if (d.def.kind === 'clocktower' || d.generic) continue;
      const n = d.def.doorNormal!;
      const facing = M.styles[d.id]!.facing;
      if (facing === 'west') expect(n[0], d.id).toBeLessThan(0);
      if (facing === 'east') expect(n[0], d.id).toBeGreaterThan(0);
      if (facing === 'south') expect(n[1], d.id).toBeGreaterThan(0);
    }
  });
});

describe('square-props-v3.json: overlays move with their sprite', () => {
  it('has every cottage: boarded planks, door glow and board anchor; frames exist', () => {
    expect(fxV3.world).toBe('v3');
    expect(Object.keys(fxV3.meta.houses).sort()).toEqual(L.buildings.map((b) => b.id).sort());
    for (const [id, h] of Object.entries(fxV3.meta.houses)) {
      expect(h.boarded && h.doorglow && h.board, id).toBeTruthy();
      for (const ov of [h.boarded, h.unlit]) if (ov) expect(ov.atlas === 'objects-v3' ? !!extraAtlas.frames[ov.frame] : !!fxV2.frames[ov.frame], `${id} ${ov.frame}`).toBe(true);
    }
  });

  it('v2-sprite houses: every anchor = the v2 anchor + the sprite shift', () => {
    for (const d of drawn) {
      if (d.generic || d.def.kind === 'clocktower') continue;
      const a = fxV2.meta.houses[d.id]!;
      const b = fxV3.meta.houses[d.id]!;
      const sx = d.shift.dx * TS;
      const sy = d.shift.dy * TS;
      expect([b.boarded!.wx - a.boarded!.wx, b.boarded!.wy - a.boarded!.wy], d.id).toEqual([sx, sy]);
      expect([b.board!.x - a.board!.x, b.board!.y - a.board!.y], d.id).toEqual([sx, sy]);
      expect([b.doorglow!.x - a.doorglow!.x, b.doorglow!.y - a.doorglow!.y], d.id).toEqual([sx, sy]);
      if (a.smoke) expect([b.smoke!.x - a.smoke.x, b.smoke!.y - a.smoke.y], d.id).toEqual([sx, sy]);
    }
  });

  it('the generic house overlays sit on its own door', () => {
    for (const id of GENERIC_SOUTH) {
      const d = drawn.find((x) => x.id === id)!;
      const ov = fxV3.meta.houses[id]!.boarded!;
      expect(ov.atlas).toBe('objects-v3');
      const doorPx = d.def.door.x * TS + 8;
      expect(Math.abs(ov.wx + ov.w / 2 - doorPx)).toBeLessThanOrEqual(TS);
      expect(ov.wy + ov.h).toBeLessThanOrEqual(d.def.door.y * TS + 2);
    }
  });
});

describe('interiors and props', () => {
  const inRect = (r: TileRect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  it('every blocked floor tile inside a room is covered by a drawn piece of furniture (no invisible walls)', () => {
    const covered = new Set<number>();
    const furniture = objects.filter((o) => (o.type === 'prop' || o.type === 'flat') && o.x >= L.townBounds.w * TS);
    for (const o of furniture) {
      const def = PROP_DEFS[o.name]!;
      expect(def, o.name).toBeDefined();
      const ax = o.x / TS;
      const ay = (o.y + o.height) / TS - 1;
      for (let j = 0; j < def.col!.h; j++) for (let i = 0; i < def.col!.w; i++) covered.add((ay + def.col!.y + j) * L.widthTiles + ax + def.col!.x + i);
    }
    let blockedFloor = 0;
    for (const b of L.buildings)
      for (let y = b.interior.y; y < b.interior.y + b.interior.h; y++)
        for (let x = b.interior.x; x < b.interior.x + b.interior.w; x++) {
          const k = y * L.widthTiles + x;
          if (M.ground[y]![x] !== G.floorWood || !L.collision[k]) continue;
          blockedFloor++;
          expect(covered.has(k), `${b.id} tile ${x},${y}`).toBe(true);
        }
    expect(blockedFloor).toBeGreaterThan(0);
    // and furniture never sits on a walkable tile (decoration only: the collision is the server's)
    for (const k of covered) expect(L.collision[k], `furniture on free tile ${k % L.widthTiles},${Math.floor(k / L.widthTiles)}`).toBe(1);
  });

  it('each room with a blocked spot next to its bed draws a bed there', () => {
    const furn = interiorFurniture();
    for (const b of L.buildings) {
      const beds = furn.filter((o) => (o.kind === 'bed' || o.kind === 'bedwide') && inRect(b.interior, o.x, o.y));
      expect(beds.length, b.id).toBeLessThanOrEqual(1);
    }
    expect(furn.filter((o) => o.kind === 'bed' || o.kind === 'bedwide').length).toBeGreaterThanOrEqual(10);
    // town-v3.json is fresh: exactly these pieces, at these anchors
    const inRooms = objects.filter((o) => (o.type === 'prop' || o.type === 'flat') && o.x >= L.townBounds.w * TS);
    expect(inRooms.map((o) => `${o.name}@${o.x / TS},${(o.y + o.height) / TS - 1}`).sort()).toEqual(furn.map((o) => `${o.kind}@${o.x},${o.y}`).sort());
  });

  it('outdoor props: every v3 prop is drawn with a v2 sprite (flowerbarrel -> barrel)', () => {
    const outdoor = M.objects.filter((o) => o.kind !== 'building');
    expect(outdoorProps().length).toBe(outdoor.length);
    const drawnProps = objects.filter((o) => (o.type === 'prop' || o.type === 'flat') && o.x < L.townBounds.w * TS);
    expect(drawnProps.length).toBe(outdoor.length);
  });
});
