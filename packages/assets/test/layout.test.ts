import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  circleCentre,
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
import { PROP_DEFS, townLayout as L, townMap } from '../src/index.js';

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

describe('handcrafted town layout', () => {
  it('has the contract dimensions and building ids', () => {
    expect(L.tileSize).toBe(16);
    expect(L.collision.length).toBe(L.widthTiles * L.heightTiles);
    expect(L.townBounds).toEqual({ x: 0, y: 0, w: 96, h: 96 });
    const ids = L.buildings.map((b) => b.id);
    for (let i = 0; i < 15; i++) {
      const b = L.buildings.find((x) => x.id === `house-${i}`)!;
      expect(b.kind).toBe('house');
      expect(b.houseIndex).toBe(i);
    }
    for (const id of ['tavern', 'chapel', 'clocktower', 'shop']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(townMap.ground.length).toBe(L.heightTiles);
    for (const row of townMap.ground) expect(row.length).toBe(L.widthTiles);
  });

  it('puts the clock tower behind the open gathering floor and keeps the spawn in the square', () => {
    const tower = L.buildings.find((b) => b.id === 'clocktower')!;
    const c = tileCenterPx(L, { x: tower.footprint.x + 2, y: tower.footprint.y + 2 });
    expect(c.y).toBeLessThan(L.square.cy);
    expect(Math.abs(c.x - L.square.cx)).toBeLessThan(3 * L.tileSize);
    for (const p of circleSpots(L, Array.from({length:15},(_,i)=>i))) expect(p.y).toBeGreaterThan((tower.footprint.y + tower.footprint.h) * L.tileSize);
    const s = tileCenterPx(L, L.playerSpawn);
    expect(inSquare(L, s.x, s.y)).toBe(true);
    expect(L.square.r).toBeGreaterThanOrEqual(9 * 16);
  });

  it('has walkable spawns, doors right below footprints, and every door reachable from the spawn', () => {
    expect(walkable(L.playerSpawn)).toBe(true);
    expect(walkable(L.storytellerSpawn)).toBe(true);
    const reach = reachable(L.playerSpawn);
    for (const b of L.buildings) {
      expect(b.door.y, b.id).toBe(b.footprint.y + b.footprint.h);
      expect(b.door.x >= b.footprint.x && b.door.x < b.footprint.x + b.footprint.w, b.id).toBe(true);
      expect(walkable(b.door), `${b.id} door`).toBe(true);
      expect(inRect(L.townBounds, b.door)).toBe(true);
      expect(reach.has(`${b.door.x},${b.door.y}`), `${b.id} door reachable`).toBe(true);
      expect(locationAt(L, tileCenterPx(L, b.door).x, tileCenterPx(L, b.door).y)).toBe('outdoors');
    }
    expect(reach.has(`${L.storytellerSpawn.x},${L.storytellerSpawn.y}`)).toBe(true);
  });

  it('keeps all fifteen voting places open when the tower moves off the center', () => {
    const center = circleCentre(L);
    expect(isBlockedPx(L, center.x, center.y)).toBe(false);
    const spots = circleSpots(L, Array.from({ length: 15 }, (_, i) => i));
    expect(spots).toHaveLength(15);
    for (const s of spots) {
      expect(inSquare(L, s.x, s.y)).toBe(true);
      expect(isBlockedPx(L, s.x, s.y)).toBe(false);
      for (const other of spots) if (other !== s) expect(Math.hypot(s.x - other.x, s.y - other.y)).toBeGreaterThanOrEqual(12);
    }
    const moved = { ...L, buildings: L.buildings.map(b => b.kind === 'clocktower' ? { ...b, footprint: { ...b.footprint, x: b.footprint.x + 3 } } : b) };
    expect(circleCentre(moved)).toEqual(center);
  });

  it('has interiors outside the town with walkable door, bed and visit point', () => {
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
      if (b.kind === 'house') {
        const reach = reachable(b.interiorDoor);
        for (const p of [b.bed!, b.visitPoint!]) {
          expect(inRect(r, p)).toBe(true);
          expect(walkable(p), `${b.id} bed/visit`).toBe(true);
          expect(reach.has(`${p.x},${p.y}`), `${b.id} bed/visit reachable`).toBe(true);
        }
        expect(b.bed).not.toEqual(b.visitPoint);
      }
    }
  });

  it('places a lamp at every streetlight and only known object kinds', () => {
    for (const p of L.streetlights) expect(townMap.objects.some((o) => o.kind === 'lamp' && o.x === p.x && o.y === p.y)).toBe(true);
    for (const o of townMap.objects) if (o.kind !== 'building') expect(PROP_DEFS[o.kind], o.kind).toBeDefined();
    expect(townMap.objects.filter((o) => o.kind === 'building').length).toBe(L.buildings.length);
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
