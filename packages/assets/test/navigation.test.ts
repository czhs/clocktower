// OWNED BY world-audit. Walkability + corner-snagging audit of the handcrafted town, using the
// exact feet-box collision the client predicts with and the server validates against
// (@ct/protocol isBlockedPx, BODY_HALF_W x BODY_H). See docs/world-audit.md.
//
// 1. Pixel BFS (2 px lattice) from the player spawn: every door reachable, no walkable pockets;
//    from each interior door every free tile of the room (bed, visit point) reachable.
// 2. Movement simulation (navsim.ts replicates TownScene.stepLocal) along realistic routes with
//    pointer (touch) and 8-direction keyboard bots: planned routes must never get stuck; sloppy
//    corner-cutting routes measure the "corner catch" problem and prove that the recommended
//    corner nudge removes it.
import { describe, expect, it } from 'vitest';
import { BODY_H, BODY_HALF_W, isBlockedTile, locationAt, tileCenterPx, type TilePoint } from '@ct/protocol';
import { townLayout as L, townMap } from '../src/index.js';
import { bfs, lattice, pathTo, simulate, smooth, STEP, type Pt } from './navsim.js';

const TS = L.tileSize;
const CLIENT_DOOR_RANGE = 20;
const SERVER_DOOR_RANGE = 22;
const lat = lattice(L);
const spawn = tileCenterPx(L, L.playerSpawn);
const stSpawn = tileCenterPx(L, L.storytellerSpawn);
const outdoor = bfs(lat, spawn);
const free = (p: Pt) => !lat.blocked[lat.node(p)];
const reached = (prev: Int32Array, p: Pt) => prev[lat.node(p)] !== -1;
const tileOf = (p: Pt) => `tile(${Math.floor(p.x / TS)},${Math.floor((p.y - 1) / TS)})`;

/** Walkable outdoor tiles the spawn cannot reach (v2 one-screen town: none). A NEW pocket fails the test. */
const KNOWN_POCKETS: string[] = [];

describe('town walkability (pixel BFS with the body box)', () => {
  it('reaches every door tile centre and the storyteller spawn from the player spawn', () => {
    const missing = L.buildings.filter((b) => !reached(outdoor, tileCenterPx(L, b.door))).map((b) => b.id);
    expect(missing).toEqual([]);
    expect(reached(outdoor, stSpawn)).toBe(true);
  });

  it('has no walkable outdoor pocket cut off from the spawn (except the documented one)', () => {
    const pockets: string[] = [];
    for (let ty = 0; ty < L.townBounds.h; ty++)
      for (let tx = 0; tx < L.townBounds.w; tx++) {
        const c = tileCenterPx(L, { x: tx, y: ty });
        if (free(c) && !reached(outdoor, c)) pockets.push(`${tx},${ty}`);
      }
    expect(pockets).toEqual(KNOWN_POCKETS);
  });

  it('interiors: door tile clear of furniture, every free tile (bed, visit point) reachable from the door', () => {
    const problems: string[] = [];
    for (const b of L.buildings) {
      // you arrive on the interior door tile and must be able to step into the room
      for (const p of [b.interiorDoor, { x: b.interiorDoor.x, y: b.interiorDoor.y - 1 }])
        if (isBlockedTile(L, p.x, p.y)) problems.push(`${b.id}: tile ${p.x},${p.y} at the interior door is blocked`);
      const prev = bfs(lat, tileCenterPx(L, b.interiorDoor));
      const r = b.interior;
      let freeTiles = 0;
      for (let ty = r.y; ty < r.y + r.h; ty++)
        for (let tx = r.x; tx < r.x + r.w; tx++) {
          const c = tileCenterPx(L, { x: tx, y: ty });
          if (!free(c)) continue;
          freeTiles++;
          if (!reached(prev, c)) problems.push(`${b.id}: free tile ${tx},${ty} unreachable from the door`);
        }
      if (freeTiles < 12) problems.push(`${b.id}: only ${freeTiles} free tiles`);
      for (const p of [b.bed, b.visitPoint]) if (p && !reached(prev, tileCenterPx(L, p))) problems.push(`${b.id}: bed/visit ${p.x},${p.y} unreachable`);
    }
    expect(problems).toEqual([]);
  });

  it('doorsteps: door tile and the tile in front are free and the reachable doorstep is wider than a body', () => {
    // v2: 'south' cottages have the door below the footprint; 'east' / 'west' ones beside it
    // (gable end to the camera), so "in front" and the doorstep width depend on the facing.
    const bad: string[] = [];
    for (const b of L.buildings) {
      const facing = townMap.styles[b.id]!.facing;
      const front: TilePoint = facing === 'south' ? { x: b.door.x, y: b.door.y + 1 } : { x: b.door.x + (facing === 'east' ? 1 : -1), y: b.door.y };
      for (const p of [b.door, front]) if (isBlockedTile(L, p.x, p.y)) bad.push(`${b.id} ${p.x},${p.y}`);
      const c = tileCenterPx(L, b.door);
      let width = 0;
      if (facing === 'south') {
        for (let x = c.x - CLIENT_DOOR_RANGE; x <= c.x + CLIENT_DOOR_RANGE; x += STEP) if (free({ x, y: c.y }) && reached(outdoor, { x, y: c.y })) width += STEP;
      } else {
        for (let y = c.y - CLIENT_DOOR_RANGE; y <= c.y + CLIENT_DOOR_RANGE; y += STEP) if (free({ x: c.x, y }) && reached(outdoor, { x: c.x, y })) width += STEP;
      }
      if (width < (facing === 'south' ? 2 * BODY_HALF_W : BODY_H) + 8) bad.push(`${b.id} (${facing}): doorstep only ${width}px wide`);
    }
    expect(bad).toEqual([]);
  });

  it('door use ranges never overlap and no door sits on a footprint', () => {
    const doors = L.buildings.map((b) => ({ id: b.id, c: tileCenterPx(L, b.door) }));
    for (let i = 0; i < doors.length; i++)
      for (let j = i + 1; j < doors.length; j++) {
        const d = Math.hypot(doors[i]!.c.x - doors[j]!.c.x, doors[i]!.c.y - doors[j]!.c.y);
        expect(d, `${doors[i]!.id} / ${doors[j]!.id}`).toBeGreaterThan(2 * SERVER_DOOR_RANGE);
      }
    for (const b of L.buildings)
      for (const o of L.buildings) {
        const f = o.footprint;
        expect(b.door.x >= f.x && b.door.x < f.x + f.w && b.door.y >= f.y && b.door.y < f.y + f.h, `${b.id} door on ${o.id}`).toBe(false);
      }
  });
});

// ------------------------------------------------------------------------------- snagging

interface Route {
  name: string;
  from: Pt;
  to: Pt;
}
const routes: Route[] = [];
const byId = (id: string) => L.buildings.find((b) => b.id === id)!;
for (const b of L.buildings) {
  routes.push({ name: `spawn -> ${b.id} door`, from: spawn, to: tileCenterPx(L, b.door) });
  routes.push({ name: `st spawn -> ${b.id} door`, from: stSpawn, to: tileCenterPx(L, b.door) });
  if (b.bed) {
    routes.push({ name: `${b.id} door -> bed`, from: tileCenterPx(L, b.interiorDoor), to: tileCenterPx(L, b.bed) });
    routes.push({ name: `${b.id} bed -> door`, from: tileCenterPx(L, b.bed), to: tileCenterPx(L, b.interiorDoor) });
  }
  if (b.visitPoint) routes.push({ name: `${b.id} door -> visit point`, from: tileCenterPx(L, b.interiorDoor), to: tileCenterPx(L, b.visitPoint) });
}
const houses = L.buildings.filter((b) => b.kind === 'house');
for (let i = 0; i < houses.length; i++) {
  const a = houses[i]!;
  routes.push({ name: `${a.id} door -> ${houses[(i + 1) % houses.length]!.id} door`, from: tileCenterPx(L, a.door), to: tileCenterPx(L, houses[(i + 1) % houses.length]!.door) });
  // v2: no tavern; the long walk is across the square to the cottage opposite
  const opp = houses[(i + Math.floor(houses.length / 2)) % houses.length]!;
  routes.push({ name: `${a.id} door -> ${opp.id} door (across the square)`, from: tileCenterPx(L, a.door), to: tileCenterPx(L, opp.door) });
}

const bfsCache = new Map<string, Int32Array>();
const wpCache = new Map<string, Pt[] | null>();
function waypoints(r: Route, mode: 'pointer' | 'keys'): Pt[] | null {
  const key = `${mode}|${r.name}`;
  if (!wpCache.has(key)) {
    const k = `${r.from.x},${r.from.y}`;
    if (!bfsCache.has(k)) bfsCache.set(k, bfs(lat, r.from));
    const path = pathTo(lat, bfsCache.get(k)!, r.to);
    wpCache.set(key, path ? smooth(L, path, mode) : null);
  }
  return wpCache.get(key)!;
}

function runAll(mode: 'pointer' | 'keys', sloppy: number, nudge: number): string[] {
  const failures: string[] = [];
  for (const r of routes) {
    const wps = waypoints(r, mode);
    if (!wps) {
      failures.push(`${r.name}: no path`);
      continue;
    }
    const res = simulate(L, wps, { mode, sloppy, nudge });
    if (!res.arrived) failures.push(`${r.name}: ${res.stuckAt ? `stuck at ${res.stuckAt.x},${res.stuckAt.y} ${tileOf(res.stuckAt)}` : 'timeout'}`);
  }
  return failures;
}

describe('corner snagging (client prediction algorithm along realistic routes)', () => {
  it(`has ${routes.length} routes covering every door, bed and visit point`, () => {
    expect(routes.length).toBeGreaterThan(80);
  });

  for (const mode of ['pointer', 'keys'] as const) {
    it(`${mode}, planned (aims at each corner exactly): every route arrives, never stuck`, () => {
      expect(runAll(mode, 0, 0)).toEqual([]);
    });

    it(`${mode}, sloppy (turns 3 px early) WITH the recommended 4 px corner nudge: never stuck`, () => {
      expect(runAll(mode, 3, 4)).toEqual([]);
    });

    it(`${mode}, sloppy WITHOUT a nudge (current client): corner catches measured for the audit`, () => {
      const f = runAll(mode, 3, 0);
      console.info(`[navigation] ${mode} sloppy, no nudge: ${f.length}/${routes.length} routes catch on a corner\n  ${f.slice(0, 12).join('\n  ')}`);
      expect(f.length).toBeLessThanOrEqual(routes.length);
    });
  }
});

describe('houses are distinguishable', () => {
  it('every cottage has a unique roof + wall combination and a unique exterior signature and name', () => {
    const hs = L.buildings.filter((b) => b.kind === 'house');
    expect(new Set(hs.map((b) => `${townMap.styles[b.id]!.roof}/${townMap.styles[b.id]!.wall}`)).size).toBe(hs.length);
    const sig = hs.map((b) => {
      const { interior: _i, ...ext } = townMap.styles[b.id]!;
      return JSON.stringify(ext);
    });
    expect(new Set(sig).size).toBe(hs.length);
    expect(new Set(hs.map((b) => b.name)).size).toBe(hs.length);
  });

  it('seat N lives in house-N: houseIndex, bed and visit point inside the right interior', () => {
    for (let i = 0; i < 15; i++) {
      const b = byId(`house-${i}`);
      expect(b.houseIndex).toBe(i);
      for (const p of [b.bed!, b.visitPoint!]) {
        const c = tileCenterPx(L, p);
        expect(locationAt(L, c.x, c.y)).toBe(`bld:house-${i}`);
      }
    }
  });

  it('feet box is the documented 11 x 6 px', () => {
    expect([2 * BODY_HALF_W + 1, BODY_H]).toEqual([11, 6]);
  });
});
