import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  circleCentre,
  circleRadii,
  circleSpots,
  GHOST_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  inSquare,
  isBlockedPx,
  isBlockedTile,
  locationAt,
  OUTFIT_PALETTES,
  OUTFITS,
  SKIN_TONES,
  tileCenterPx,
  type TilePoint,
  type TileRect,
} from '@ct/protocol';
import { G, MAP_H, MAP_W, PROP_DEFS, TOWN_H, TOWN_W, townLayout as L, townMap } from '../src/index.js';

const GEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated');
const inRect = (r: TileRect, p: TilePoint) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
const walkable = (p: TilePoint) => {
  const c = tileCenterPx(L, p);
  return !isBlockedTile(L, p.x, p.y) && !isBlockedPx(L, c.x, c.y);
};
function reachable(from: TilePoint): Set<string> {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const p = q.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: p.x + dx!, y: p.y + dy! };
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || isBlockedTile(L, n.x, n.y)) continue;
      seen.add(k);
      q.push(n);
    }
  }
  return seen;
}

// v2 (2026-10-15): the whole game is ONE SCREEN — a circular town square with the voting circle in
// the middle, 15 cottages in a ring around it (each one seat's home and anyone's private room by day)
// and the clock tower as a NON-enterable landmark. Everything below is derived from the layout data
// (townLayout / townMap), so moving a cottage keeps these checks meaningful.
describe('handcrafted town layout (v2 one-screen town)', () => {
  const styleOf = (id: string) => townMap.styles[id]!;

  it('has the contract dimensions: a 45x37 town plus an interiors band, and exactly 15 cottages', () => {
    expect(L.tileSize).toBe(16);
    expect(L.collision.length).toBe(L.widthTiles * L.heightTiles);
    expect(L.townBounds).toEqual({ x: 0, y: 0, w: TOWN_W, h: TOWN_H });
    expect([TOWN_W, TOWN_H]).toEqual([45, 37]);
    expect([L.widthTiles, L.heightTiles]).toEqual([MAP_W, MAP_H]);
    expect(L.buildings).toHaveLength(15);
    for (let i = 0; i < 15; i++) {
      const b = L.buildings.find((x) => x.id === `house-${i}`)!;
      expect(b.kind).toBe('house');
      expect(b.houseIndex).toBe(i);
    }
    const ids = L.buildings.map((b) => b.id);
    for (const gone of ['tavern', 'chapel', 'shop', 'clocktower']) expect(ids).not.toContain(gone);
    expect(new Set(ids).size).toBe(ids.length);
    expect(townMap.ground.length).toBe(L.heightTiles);
    for (const row of townMap.ground) expect(row.length).toBe(L.widthTiles);
  });

  it('the clock tower is a solid landmark, never an enterable building', () => {
    const tower = townMap.landmarks.find((b) => b.id === 'clocktower')!;
    expect(tower).toBeDefined();
    expect(L.buildings.some((b) => b.id === tower.id || b.kind === 'clocktower')).toBe(false);
    for (let y = tower.footprint.y; y < tower.footprint.y + tower.footprint.h; y++)
      for (let x = tower.footprint.x; x < tower.footprint.x + tower.footprint.w; x++) expect(isBlockedTile(L, x, y), `tower ${x},${y}`).toBe(true);
    // its interior rect is empty: no location ever resolves to the tower
    expect(tower.interior.w * tower.interior.h).toBe(0);
    // no cottage door is the tower's "door" tile (nothing to walk into)
    for (const b of L.buildings) expect(b.door).not.toEqual(tower.door);
  });

  it('the square and the voting circle sit in the middle of town and contain the spawns', () => {
    expect(L.circle).toMatchObject({ startDeg: 0, sweepDeg: 360 });
    const s = tileCenterPx(L, L.playerSpawn);
    const st = tileCenterPx(L, L.storytellerSpawn);
    expect(inSquare(L, s.x, s.y)).toBe(true);
    expect(Math.hypot(st.x - townMap.plaza.cx, st.y - townMap.plaza.cy)).toBeLessThan(townMap.plaza.rx);
    const c = circleCentre(L);
    expect(Math.hypot(c.x - townMap.plaza.cx, c.y - townMap.plaza.cy)).toBeLessThan(2 * L.tileSize);
    const { rx } = circleRadii(L);
    expect(rx).toBeLessThan(townMap.plaza.rx);
  });

  it('has walkable spawns, a door beside every footprint on its facing side, and every door reachable from the spawn', () => {
    expect(walkable(L.playerSpawn)).toBe(true);
    expect(walkable(L.storytellerSpawn)).toBe(true);
    const reach = reachable(L.playerSpawn);
    for (const b of L.buildings) {
      const f = b.footprint;
      const facing = styleOf(b.id).facing;
      if (facing === 'south') {
        expect(b.door.y, b.id).toBe(f.y + f.h);
        expect(b.door.x >= f.x && b.door.x < f.x + f.w, b.id).toBe(true);
      } else {
        // east / west: the door tile is beside the footprint, next to its bottom (visible) row
        expect(b.door.x, `${b.id} ${facing}`).toBe(facing === 'east' ? f.x + f.w : f.x - 1);
        expect(b.door.y >= f.y && b.door.y < f.y + f.h, b.id).toBe(true);
      }
      expect(walkable(b.door), `${b.id} door`).toBe(true);
      expect(inRect(L.townBounds, b.door)).toBe(true);
      expect(reach.has(`${b.door.x},${b.door.y}`), `${b.id} door reachable`).toBe(true);
      expect(locationAt(L, tileCenterPx(L, b.door).x, tileCenterPx(L, b.door).y)).toBe('outdoors');
    }
    expect(reach.has(`${L.storytellerSpawn.x},${L.storytellerSpawn.y}`)).toBe(true);
  });

  it.each([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])('n=%i: seat spots are walkable, outdoors, distinct, in the square and reachable from the spawn', (n) => {
    const seats = Array.from({ length: n }, (_, i) => i);
    const spots = circleSpots(L, seats);
    expect(spots.map((s) => s.seat)).toEqual(seats);
    const reach = reachable(L.playerSpawn);
    for (const s of spots) {
      expect(isBlockedPx(L, s.x, s.y), `seat ${s.seat}`).toBe(false);
      expect(locationAt(L, s.x, s.y)).toBe('outdoors');
      expect(Math.hypot(s.x - townMap.plaza.cx, s.y - townMap.plaza.cy), `seat ${s.seat} on the square`).toBeLessThan(townMap.plaza.rx);
      expect(reach.has(`${Math.floor(s.x / L.tileSize)},${Math.floor((s.y - 1) / L.tileSize)}`), `seat ${s.seat} reachable`).toBe(true);
    }
    for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(12);
  });

  it('no prop stands on the square, and no prop narrows a cobbled lane below two tiles', () => {
    // (Streetlights on the edge of the dirt back lane are by design; door approaches are checked in
    // navigation.test.ts, and reachability of every door / seat above.)
    const ground = (x: number, y: number) => townMap.ground[y]?.[x] ?? ' ';
    const bad: string[] = [];
    for (const o of townMap.objects) {
      if (o.kind === 'building') continue;
      const c = PROP_DEFS[o.kind]!.col;
      if (!c) continue;
      for (let j = 0; j < c.h; j++)
        for (let i = 0; i < c.w; i++) {
          const x = o.x + c.x + i;
          const y = o.y + c.y + j;
          const g = ground(x, y);
          if (g === G.plaza || g === G.ring) bad.push(`${o.kind}@${o.x},${o.y} on the square at ${x},${y}`);
          if (g !== G.cobble) continue;
          // the lane must still offer two free cobbled tiles side by side next to the prop (row or column)
          const freeCobble = (tx: number, ty: number) => ground(tx, ty) === G.cobble && !isBlockedTile(L, tx, ty);
          const ok = [-2, -1, 1].some((d) => (freeCobble(x + d, y) && freeCobble(x + d + 1, y)) || (freeCobble(x, y + d) && freeCobble(x, y + d + 1)));
          if (!ok) bad.push(`${o.kind}@${o.x},${o.y} blocks the lane at ${x},${y}`);
        }
    }
    expect(bad).toEqual([]);
  });

  it('has interiors outside the town: enclosed rooms with a walkable door, bed and visit point', () => {
    const rects = L.buildings.map((b) => b.interior);
    for (const b of L.buildings) {
      const r = b.interior;
      expect(r.x >= L.townBounds.x + L.townBounds.w, `${b.id} interior outside town`).toBe(true);
      expect(r.x + r.w <= L.widthTiles && r.y + r.h <= L.heightTiles).toBe(true);
      for (const o of rects) if (o !== r) expect(o.x >= r.x + r.w || r.x >= o.x + o.w || o.y >= r.y + r.h || r.y >= o.y + o.h).toBe(true);
      expect(inRect(r, b.interiorDoor)).toBe(true);
      expect(walkable(b.interiorDoor), `${b.id} interior door`).toBe(true);
      const c = tileCenterPx(L, b.interiorDoor);
      expect(locationAt(L, c.x, c.y)).toBe(`bld:${b.id}`);
      // the room is enclosed: no walkable tile on its border
      for (let x = r.x; x < r.x + r.w; x++) {
        expect(isBlockedTile(L, x, r.y)).toBe(true);
        expect(isBlockedTile(L, x, r.y + r.h - 1)).toBe(true);
      }
      for (let y = r.y; y < r.y + r.h; y++) {
        expect(isBlockedTile(L, r.x, y)).toBe(true);
        expect(isBlockedTile(L, r.x + r.w - 1, y)).toBe(true);
      }
      const reach = reachable(b.interiorDoor);
      for (const p of [b.bed!, b.visitPoint!]) {
        expect(inRect(r, p)).toBe(true);
        expect(walkable(p), `${b.id} bed/visit`).toBe(true);
        expect(reach.has(`${p.x},${p.y}`), `${b.id} bed/visit reachable`).toBe(true);
      }
      expect(b.bed).not.toEqual(b.visitPoint);
      // nothing in the room connects to the town
      for (const k of reach) {
        const [x, y] = k.split(',').map(Number) as [number, number];
        expect(inRect(r, { x, y }), `${b.id} leaks at ${k}`).toBe(true);
      }
    }
  });

  it('places a lamp at every streetlight and only known object kinds', () => {
    for (const p of L.streetlights) expect(townMap.objects.some((o) => o.kind === 'lamp' && o.x === p.x && o.y === p.y)).toBe(true);
    for (const o of townMap.objects) if (o.kind !== 'building') expect(PROP_DEFS[o.kind], o.kind).toBeDefined();
    expect(townMap.objects.filter((o) => o.kind === 'building').length).toBe(L.buildings.length + townMap.landmarks.length);
  });

  it('gives all 15 cottages distinct styles', () => {
    const keys = new Set(L.buildings.filter((b) => b.kind === 'house').map((b) => JSON.stringify(townMap.styles[b.id])));
    expect(keys.size).toBe(15);
  });
});

describe.runIf(existsSync(join(GEN, 'characters.json')))('generated assets', () => {
  const read = (n: string) => JSON.parse(readFileSync(join(GEN, n), 'utf8'));

  it('has a character layer sheet for every cosmetic enum value', () => {
    const m = read('characters.json');
    for (const s of SKIN_TONES) expect(m.sheets[`body/${s}`]).toBeDefined();
    for (const o of OUTFITS) for (const p of OUTFIT_PALETTES) expect(m.sheets[`outfit/${o}/${p}`]).toBeDefined();
    for (const h of HAIR_STYLES) for (const c of HAIR_COLORS) if (h !== 'bald') expect(m.sheets[`hair/${h}/${c}`]).toBeDefined();
    for (const a of ACCESSORIES) if (a !== 'none') expect(m.sheets[`accessory/${a}`]).toBeDefined();
    for (const g of GHOST_STYLES) expect(m.sheets[`ghost/${g}`]).toBeDefined();
    expect(m.sheets.storyteller).toBeDefined();
    expect(m.directions).toEqual(['down', 'up', 'left', 'right']);
    expect(m.frames.length).toBeGreaterThanOrEqual(4);
  });

  it('has a Tiled map whose layers and frames are consistent', () => {
    const t = read('town.json');
    const atlas = read('objects.json');
    expect(t.width).toBe(L.widthTiles);
    expect(t.layers.map((l: { name: string }) => l.name)).toEqual(['ground', 'decor', 'collision', 'objects']);
    for (const l of t.layers) if (l.type === 'tilelayer') expect(l.data.length).toBe(L.widthTiles * L.heightTiles);
    const objects = t.layers[3].objects as { type: string; properties: { name: string; value: unknown }[] }[];
    for (const o of objects) {
      if (o.type === 'light') continue;
      const frame = o.properties.find((p) => p.name === 'frame')!.value as string;
      expect(atlas.frames[frame], frame).toBeDefined();
    }
    const coll = t.layers[2].data as number[];
    expect(coll.filter((v) => v !== 0).length).toBe(L.collision.filter((v) => v === 1).length);
  });
});
