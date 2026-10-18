// OWNED BY v3-world (WP5a). The v3 world "Hollowmere" exported from the pixel3d town (docs/v3/INTEGRATION.md §2.2/§2.3):
// map/band invariants, freshness against the vendor copy, doors, seats, spawns, interiors, the camera-hidden rule,
// and the v2 layout staying byte-identical. Walkability / snagging for both worlds: layout.test.ts, navigation.test.ts.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { circleCentre, circleRadii, circleSpots, isBlockedPx, isBlockedTile, locationAt, stoneOfSeatIndex, tileCenterPx, type TilePoint, type TileRect } from '@ct/protocol';
import { BLOCKING_GROUND, layoutFor, townLayout } from '../src/index.js';
import { hollowmere, npcHomesV3, PROP_DEFS_V3, townLayoutV3 as L, townMapV3 as M } from '../src/hollowmere/layoutV3.js';
import { hollowmereMeta as H } from '../src/hollowmere/meta.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n === 'generated') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(n) && !n.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const TS = 16;
const DAIS_R_PX = 2.4 * TS; // src/demo/collision.js DAIS_R
const key = (p: TilePoint) => `${p.x},${p.y}`;
const inRect = (r: TileRect, p: TilePoint) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
const inTown = (p: TilePoint) => inRect(L.townBounds, p);

function reachable(from: TilePoint, within: (p: TilePoint) => boolean = () => true): Set<string> {
  const seen = new Set([key(from)]);
  const q = [from];
  while (q.length) {
    const p = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (seen.has(key(n)) || isBlockedTile(L, n.x, n.y) || !within(n)) continue;
      seen.add(key(n));
      q.push(n);
    }
  }
  return seen;
}
const town = reachable(L.playerSpawn, inTown);

describe('hollowmere export: shape of the data', () => {
  it('has the §2.2 dimensions: 112 x 43 tiles, town 45 x 43, 16 px tiles, version 3', () => {
    expect([L.version, L.tileSize, L.widthTiles, L.heightTiles]).toEqual([3, 16, 112, 43]);
    expect(L.townBounds).toEqual({ x: 0, y: 0, w: 45, h: 43 });
    expect(L.collision.length).toBe(L.widthTiles * L.heightTiles);
    expect(L.collision.every((v) => v === 0 || v === 1)).toBe(true);
    expect(M.ground.length).toBe(L.heightTiles);
    for (const row of M.ground) expect(row.length).toBe(L.widthTiles);
    expect([M.width, M.height, M.tileSize]).toEqual([112, 43, 16]);
    expect(L.buildings.map((b) => b.id)).toEqual(Array.from({ length: 15 }, (_, i) => `house-${i}`));
    L.buildings.forEach((b, i) => expect([b.kind, b.houseIndex]).toEqual(['house', i]));
  });

  it('the circle, square and plaza are the vendor CIRCLE / SQUARE / PLAZA in px, with 15 stones', () => {
    expect(L.circle).toEqual({ cx: 360, cy: 316, rx: 100, ry: 100, startDeg: 0, sweepDeg: 360, stones: 15 });
    expect(L.square).toEqual({ cx: 360, cy: 364, r: 144 });
    expect(M.plaza).toEqual({ cx: 360, cy: 312, rx: 144, ry: 144 });
  });

  it('ground codes and collision agree: blocking ground and the void are always solid', () => {
    const bad: string[] = [];
    for (let y = 0; y < L.heightTiles; y++)
      for (let x = 0; x < L.widthTiles; x++) if (BLOCKING_GROUND.has(M.ground[y]![x]!) && !isBlockedTile(L, x, y)) bad.push(`${x},${y} '${M.ground[y]![x]}'`);
    expect(bad).toEqual([]);
  });

  it('is fresh: vendorHash matches the vendor files the exporter read (else re-run export-hollowmere)', () => {
    expect(H.vendorFiles.length).toBeGreaterThan(10);
    expect(H.vendorFiles).toContain('v3/pixel3d/src/town/layout.js');
    expect(H.vendorFiles).toContain('v3/pixel3d/src/demo/collision.js');
    expect(H.vendorFiles).toContain('v3/pixel3d/src/town/interiors/house-3.js');
    const hash = createHash('sha256');
    for (const f of H.vendorFiles) {
      const p = join(ROOT, f);
      expect(existsSync(p), `${f} is gone: re-run export-hollowmere`).toBe(true);
      hash.update(`${f}\n`);
      hash.update(readFileSync(p));
      hash.update('\n');
    }
    expect(hash.digest('hex'), 'v3/pixel3d changed: re-run `node scripts/v3/export-hollowmere.mjs` on the host and commit the JSON').toBe(H.vendorHash);
  });

  it('is fresh: generatorHash matches the exporter script and apps/client\'s three version (else re-run export-hollowmere)', () => {
    const three = join(ROOT, 'apps/client/node_modules/three/package.json');
    expect(existsSync(three), 'apps/client/node_modules/three missing: run pnpm install (on the host)').toBe(true);
    const version = (JSON.parse(readFileSync(three, 'utf8')) as { version: string }).version;
    expect(H.generator).toBe('scripts/v3/export-hollowmere.mjs');
    expect(H.three, 'three changed since the export: re-run export-hollowmere').toBe(version);
    const hash = createHash('sha256').update(`${H.generator}\n`).update(readFileSync(join(ROOT, H.generator))).update(`\nthree@${version}\n`).digest('hex');
    expect(hash, 'scripts/v3/export-hollowmere.mjs changed: re-run it on the host and commit both JSON files').toBe(H.generatorHash);
  });

  it('the runtime JSON carries no review data; only tests / tools import the meta file', () => {
    expect(Object.keys(hollowmere).filter((k) => ['meta', 'vendorFiles', 'vendorHash', 'generator', 'generatorHash'].includes(k))).toEqual([]);
    const bad: string[] = [];
    for (const dir of ['apps/client/src', 'apps/server/src', 'packages']) {
      for (const f of sourceFiles(join(ROOT, dir))) {
        const rel = relative(ROOT, f).split(sep).join('/');
        if (rel.includes('/test/') || rel === 'packages/assets/src/hollowmere/meta.ts') continue;
        if (/['"][^'"\n]*(?:hollowmere\.meta\.json|hollowmere\/meta(?:\.js|\.ts)?)['"]/.test(readFileSync(f, 'utf8'))) bad.push(rel);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the v3 data never lands in a static client chunk: @ct/assets/hollowmere is only import()ed, from net/layout.ts and sound/areas.ts', () => {
    // (a static import would add the layoutV3 chunk to the main / lobby bundle; type-only imports are erased)
    const SRC = join(ROOT, 'apps/client/src');
    const statics: string[] = [];
    const dynamics = new Set<string>();
    for (const f of sourceFiles(SRC)) {
      const rel = relative(SRC, f).split(sep).join('/');
      const code = readFileSync(f, 'utf8');
      const st = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
      for (let m = st.exec(code); m; m = st.exec(code)) if (m[1]!.startsWith('@ct/assets/hollowmere') || m[1]!.includes('/hollowmere/')) statics.push(rel);
      if (/import\(\s*['"]@ct\/assets\/hollowmere['"]\s*\)/.test(code)) dynamics.add(rel);
    }
    expect(statics, 'static imports of the v3 data in apps/client/src').toEqual([]);
    // a new lazy consumer is fine (it shares the chunk) but deliberate: add it here
    expect([...dynamics].sort()).toEqual(['game/sound/areas.ts', 'net/layout.ts']);
    // and the package index never re-exports it (layoutFor is the pure helper)
    expect(readFileSync(join(ROOT, 'packages/assets/src/index.ts'), 'utf8')).not.toMatch(/hollowmere\/(layoutV3|meta)|\.json['"]/);
  });

  it('layoutFor: v2 / absent -> townLayout; v3 -> the given layout, or "v3 layout not built"', () => {
    expect(layoutFor(undefined)).toBe(townLayout);
    expect(layoutFor('v2', L)).toBe(townLayout);
    expect(layoutFor('v3', L)).toBe(L);
    expect(() => layoutFor('v3')).toThrow('v3 layout not built');
    expect(() => layoutFor('v3', null)).toThrow('v3 layout not built');
  });

  it('the v2 layout is byte-identical (the v3 world never touches it)', () => {
    const h = createHash('sha256').update(JSON.stringify(townLayout)).digest('hex');
    expect(h).toBe(V2_LAYOUT_SHA256);
  });
});

describe('hollowmere export: interiors (§2.3 band rooms)', () => {
  const bands = L.buildings.map((b) => b.interior);

  it('band rooms R_i = {47 + (i%5)*13, 1 + floor(i/5)*14, 12, 12}: outside the town, inside the map, disjoint with a free column', () => {
    L.buildings.forEach((b, i) => expect(b.interior, b.id).toEqual({ x: 47 + (i % 5) * 13, y: 1 + Math.floor(i / 5) * 14, w: 12, h: 12 }));
    for (const r of bands) {
      expect(r.x).toBeGreaterThanOrEqual(L.townBounds.x + L.townBounds.w);
      expect(r.x + r.w <= L.widthTiles && r.y + r.h <= L.heightTiles).toBe(true);
      for (const o of bands) {
        if (o === r) continue;
        // pairwise disjoint, at least one tile between them in x (same band row) or y
        const gapX = Math.max(o.x - (r.x + r.w), r.x - (o.x + o.w));
        const gapY = Math.max(o.y - (r.y + r.h), r.y - (o.y + o.h));
        expect(Math.max(gapX, gapY), 'gap between bands').toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('each room is enclosed; the doorway D_i = (R.x+6, R.y+11) is blocked ground D; interiorDoor is the tile above it', () => {
    for (const b of L.buildings) {
      const r = b.interior;
      const D = { x: r.x + 6, y: r.y + 11 };
      expect(M.ground[D.y]![D.x], `${b.id} doorway`).toBe('D');
      expect(isBlockedTile(L, D.x, D.y)).toBe(true);
      expect(b.interiorDoor, `${b.id} interiorDoor`).toEqual({ x: D.x, y: D.y - 1 });
      for (let x = r.x; x < r.x + r.w; x++) expect(isBlockedTile(L, x, r.y) && isBlockedTile(L, x, r.y + r.h - 1), `${b.id} border x ${x}`).toBe(true);
      for (let y = r.y; y < r.y + r.h; y++) expect(isBlockedTile(L, r.x, y) && isBlockedTile(L, r.x + r.w - 1, y), `${b.id} border y ${y}`).toBe(true);
      const c = tileCenterPx(L, b.interiorDoor);
      expect(locationAt(L, c.x, c.y)).toBe(`bld:${b.id}`);
      expect(isBlockedPx(L, c.x, c.y)).toBe(false);
    }
  });

  it('bed and visit point are distinct free floor tiles reachable from the interior door; nothing leaks out of the room', () => {
    for (const b of L.buildings) {
      const reach = reachable(b.interiorDoor);
      for (const k of reach) {
        const [x, y] = k.split(',').map(Number) as [number, number];
        expect(inRect(b.interior, { x, y }), `${b.id} leaks at ${k}`).toBe(true);
      }
      expect(reach.size, `${b.id} free tiles`).toBe(H.meta.interiorFreeTiles[b.id]);
      expect(reach.size).toBeGreaterThanOrEqual(12);
      for (const p of [b.bed!, b.visitPoint!]) {
        expect(inRect(b.interior, p)).toBe(true);
        expect(reach.has(key(p)), `${b.id} bed/visit ${key(p)} reachable`).toBe(true);
        expect(M.ground[p.y]![p.x]).toBe('f');
      }
      expect(b.bed).not.toEqual(b.visitPoint);
      expect(b.bed).not.toEqual(b.interiorDoor);
    }
  });

  it('wall quantisation error is at most 0.5 m and matches the §2.3 table', () => {
    const X = [0.2, 0.2, 0, 0.5, 0.2, 0, 0, 0.3, 0.3, 0.2, 0.5, 0.5, 0.3, 0, 0];
    L.buildings.forEach((b, i) => {
      const e = H.meta.wallError[b.id]!;
      expect(e.x, b.id).toBeCloseTo(X[i]!, 6);
      expect(Math.max(e.x, e.z)).toBeLessThanOrEqual(0.5);
    });
  });

  it('house-3 (10 m) fits its band: floor on tiles x 2..10, walls at 1 and 11 blocked', () => {
    const b = L.buildings[3]!;
    const r = b.interior;
    expect(H.meta.rooms['house-3']!.w).toBe(10);
    for (let y = r.y; y < r.y + r.h; y++) {
      expect(isBlockedTile(L, r.x + 1, y), `col 1 row ${y}`).toBe(true);
      expect(isBlockedTile(L, r.x + 11, y), `col 11 row ${y}`).toBe(true);
    }
    const floorCols = new Set<number>();
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (M.ground[y]![x] === 'f') floorCols.add(x - r.x);
    expect([...floorCols].sort((a, c) => a - c)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('hollowmere export: town, doors, seats, spawns', () => {
  it('spawns are walkable, reachable, outside the dais and inside the seat ring; the ST spawn moved to (22,23)', () => {
    expect(L.playerSpawn).toEqual({ x: 22, y: 27 });
    expect(L.storytellerSpawn).toEqual({ x: 22, y: 23 });
    const c = circleCentre(L);
    const { rx } = circleRadii(L);
    for (const s of [L.playerSpawn, L.storytellerSpawn]) {
      const p = tileCenterPx(L, s);
      expect(isBlockedTile(L, s.x, s.y) || isBlockedPx(L, p.x, p.y)).toBe(false);
      expect(town.has(key(s))).toBe(true);
      expect(Math.hypot(p.x - c.x, p.y - c.y), `${key(s)} off the dais`).toBeGreaterThan(DAIS_R_PX);
    }
    const st = tileCenterPx(L, L.storytellerSpawn);
    expect(Math.hypot(st.x - c.x, st.y - c.y)).toBeLessThan(rx);
  });

  it('the dais (r 2.4 m at the circle centre) is solid', () => {
    const c = circleCentre(L);
    for (let y = 0; y < 43; y++)
      for (let x = 0; x < 45; x++) {
        const p = tileCenterPx(L, { x, y });
        if (Math.hypot(p.x - c.x, p.y - c.y) < DAIS_R_PX - 1) expect(isBlockedTile(L, x, y), `dais ${x},${y}`).toBe(true);
      }
  });

  it('every door tile is walkable, outdoors, reachable from the spawn and outside every cottage outline; door normals are unit', () => {
    const inside = (poly: [number, number][], x: number, z: number) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i]!;
        const [xj, zj] = poly[j]!;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      return c;
    };
    for (const b of L.buildings) {
      const p = tileCenterPx(L, b.door);
      expect(isBlockedTile(L, b.door.x, b.door.y), `${b.id} door blocked`).toBe(false);
      expect(isBlockedPx(L, p.x, p.y), `${b.id} door body`).toBe(false);
      expect(locationAt(L, p.x, p.y)).toBe('outdoors');
      expect(town.has(key(b.door)), `${b.id} door reachable`).toBe(true);
      for (const [id, poly] of Object.entries(H.meta.outlines)) expect(inside(poly, b.door.x + 0.5, b.door.y + 0.875), `${b.id} door inside ${id}`).toBe(false);
      const [nx, ny] = b.doorNormal!;
      expect(Math.hypot(nx, ny)).toBeCloseTo(1, 2);
      // the door tile lies in front of the real door (along its outward normal)
      const dp = H.meta.doorPoints[b.id]!;
      expect((b.door.x + 0.5 - dp.x) * nx + (b.door.y + 0.5 - dp.z) * ny, `${b.id} door tile in front of the door`).toBeGreaterThan(0);
    }
  });

  it('door use ranges (22 px, server) never overlap', () => {
    const doors = L.buildings.map((b) => ({ id: b.id, c: tileCenterPx(L, b.door) }));
    for (let i = 0; i < doors.length; i++)
      for (let j = i + 1; j < doors.length; j++) {
        const d = Math.hypot(doors[i]!.c.x - doors[j]!.c.x, doors[i]!.c.y - doors[j]!.c.y);
        expect(d, `${doors[i]!.id} / ${doors[j]!.id}`).toBeGreaterThan(2 * 22);
      }
  });

  it.each([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])('n=%i: seats sit on the 15 stones, walkable, reachable, distinct', (n) => {
    const seats = Array.from({ length: n }, (_, i) => i);
    const spots = circleSpots(L, seats);
    const c = circleCentre(L);
    spots.forEach((s, k) => {
      expect(isBlockedPx(L, s.x, s.y), `seat ${s.seat}`).toBe(false);
      expect(locationAt(L, s.x, s.y)).toBe('outdoors');
      expect(town.has(`${Math.floor(s.x / TS)},${Math.floor((s.y - 1) / TS)}`), `seat ${s.seat} reachable`).toBe(true);
      // near its stone (the spiral search may nudge it a little off the dais rim)
      const th = (2 * Math.PI * stoneOfSeatIndex(k, n, 15)) / 15;
      const stone = { x: c.x + Math.sin(th) * 100, y: c.y - Math.cos(th) * 100 };
      expect(Math.hypot(s.x - stone.x, s.y - stone.y), `seat ${s.seat} near its stone`).toBeLessThanOrEqual(24);
    });
    for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(12);
  });

  it('no walkable outdoor tile is hidden from the gameplay camera behind a cottage (except door approaches)', () => {
    const kept = new Set(H.meta.hiddenKept.map(key));
    const doors = new Set(L.buildings.map((b) => key(b.door)));
    for (const h of H.meta.hidden) expect(isBlockedTile(L, h.x, h.y), `hidden ${key(h)} (${h.by}) is walkable`).toBe(true);
    for (const k of kept) {
      // a kept hidden tile is a door tile or touches another kept tile / a door tile (it is a door's approach)
      const [x, y] = k.split(',').map(Number) as [number, number];
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => kept.has(`${x + dx!},${y + dy!}`) || doors.has(`${x + dx!},${y + dy!}`));
      expect(doors.has(k) || near, `kept hidden tile ${k}`).toBe(true);
      expect(isBlockedTile(L, x, y)).toBe(false);
    }
    // the vendor's ?occl=1 line is north of (behind) every cottage's front: the exporter read real geometry
    for (const b of L.buildings) {
      const [best, x0, x1] = H.meta.occl[b.id]!;
      expect(best, b.id).toBeLessThan(b.footprint.y + b.footprint.h);
      expect(x0).toBeLessThanOrEqual(x1);
    }
    // an independent geometric check (not the exporter's ray data): directly behind (north of) the middle of every
    // south-facing cottage a character is under its roof from the gameplay camera, so that tile is never walkable
    for (const b of L.buildings.filter((c) => c.doorNormal![1] >= 0.9)) {
      const t = { x: b.footprint.x + Math.floor(b.footprint.w / 2), y: b.footprint.y - 1 };
      expect(isBlockedTile(L, t.x, t.y), `${b.id}: ${key(t)} behind it is walkable`).toBe(true);
    }
    // the north back lane stays solid (§2.2 collision: players there would be hidden by the eaves)
    for (let x = 0; x < 45; x++) for (let y = 0; y < 8; y++) expect(isBlockedTile(L, x, y), `back lane ${x},${y}`).toBe(true);
  });

  it('canopy-hidden tiles (meta.hiddenSoft) cover the free-standing trees too, and follow the canopy rule', () => {
    const soft = H.meta.hiddenSoft;
    const hard = new Set([...H.meta.hidden, ...H.meta.hiddenKept].map(key));
    for (const t of soft) {
      expect(inTown(t), key(t)).toBe(true);
      expect(isBlockedTile(L, t.x, t.y), `soft ${key(t)} is listed but blocked`).toBe(false);
      expect(hard.has(key(t)), `soft ${key(t)} is also hard-hidden`).toBe(false);
      expect(t.by).toMatch(/^(house-\d+|foliage:[a-z0-9]+)$/);
    }
    if (H.meta.canopiesBlock) expect(soft).toEqual([]);
    else {
      // the ray test reaches the foliage piece (layout trees and the rim forest), not only the cottages / tower
      expect(soft.some((t) => t.by.startsWith('foliage:')), 'no tile hidden by a tree: the foliage piece is not ray-tested').toBe(true);
      // house-11's oak crown (around house-12's door): the 3D renderer must keep avatars under it visible (§11)
      expect(soft.some((t) => t.by === 'house-11')).toBe(true);
    }
  });

  it('no walkable outdoor pocket is cut off from the spawn', () => {
    const pockets: string[] = [];
    for (let y = 0; y < 43; y++) for (let x = 0; x < 45; x++) if (!isBlockedTile(L, x, y) && !town.has(`${x},${y}`)) pockets.push(`${x},${y}`);
    expect(pockets).toEqual([]);
  });

  it('npc homes are free, reachable outdoor tiles near TownScene\'s homes', () => {
    const want: Record<string, TilePoint> = { 'npc-sweeper': { x: 16, y: 12 }, 'npc-vendor': { x: 10, y: 17 }, 'npc-elder': { x: 10, y: 21 }, 'npc-porter': { x: 22, y: 34 } };
    expect(Object.keys(npcHomesV3).sort()).toEqual(Object.keys(want).sort());
    for (const [id, p] of Object.entries(npcHomesV3)) {
      expect(town.has(key(p)), id).toBe(true);
      expect(Math.hypot(p.x - want[id]!.x, p.y - want[id]!.y), `${id} moved too far`).toBeLessThanOrEqual(4);
    }
  });

  it('map data: a lamp at every streetlight, known prop kinds, a style per cottage, the tower as the only landmark', () => {
    for (const p of L.streetlights) expect(M.objects.some((o) => o.kind === 'lamp' && o.x === p.x && o.y === p.y), key(p)).toBe(true);
    for (const o of M.objects) if (o.kind !== 'building') expect(PROP_DEFS_V3[o.kind], o.kind).toBeDefined();
    expect(M.objects.filter((o) => o.kind === 'building').length).toBe(16);
    for (const b of L.buildings) expect(M.styles[b.id], b.id).toBeDefined();
    expect(M.landmarks.map((b) => b.id)).toEqual(['clocktower']);
    const tower = M.landmarks[0]!;
    for (let y = tower.footprint.y; y < tower.footprint.y + tower.footprint.h; y++)
      for (let x = tower.footprint.x; x < tower.footprint.x + tower.footprint.w; x++) expect(isBlockedTile(L, x, y), `tower ${x},${y}`).toBe(true);
    expect(M.lights.some((l) => l.building === null) && M.lights.some((l) => l.building === 'house-0')).toBe(true);
  });
});

/** sha256 of JSON.stringify(townLayout) (v2). Changing it means the v2 world changed: never as a side effect of v3 work. */
const V2_LAYOUT_SHA256 = '1694195f5773d7fc4a8c165358064a4318a9b81de022347c9b01dc49549fb61a';
