import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import { isBlockedPx, MOVE_TOLERANCE, PLAYER_SPEED, tileCenterPx, type TownLayout, type WorldSnapshot, type WorldTeleport } from '@ct/protocol';
import { BURST_SECONDS, createWorldModule } from '../src/world/index.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

function setup(opts: { players?: number; st?: boolean; layout?: TownLayout } = {}) {
  const host = createFakeHost();
  const world = createWorldModule(host, opts.layout ? { layout: opts.layout } : {});
  host.setModules({ world });
  const n = opts.players ?? 3;
  const pids: string[] = [];
  for (let i = 0; i < n; i++) {
    host.addMember({ pid: `p${i}` });
    pids.push(`p${i}`);
    host.emit({ type: 'member_joined', pid: `p${i}` });
  }
  if (opts.st !== false) {
    host.addMember({ pid: 'st', role: 'storyteller' });
    host.emit({ type: 'member_joined', pid: 'st' });
  }
  return { host, world, pids };
}

function start(host: FakeHost, pids: string[]) {
  pids.forEach((pid, i) => {
    host.member(pid)!.seat = i;
  });
  host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
}
const phase = (host: FakeHost, p: 'setup' | 'first_night' | 'day' | 'bedtime' | 'night' | 'dawn' | 'finished') =>
  host.emit({ type: 'phase_changed', phase: p, prev: null, phaseEndsAt: null });
const last = <T>(host: FakeHost, pid: string, type: string): T | undefined =>
  [...(host.sent.get(pid) ?? [])].reverse().find((m) => m.type === type)?.payload as T | undefined;
const teleports = (host: FakeHost, pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'world:teleport').map((m) => m.payload as WorldTeleport);
const ids = (s: WorldSnapshot) => s.entities.map((e) => e.id).sort();

/** Tiny hand-made layout: open room 20x12 with a wall column at x = 10 and one building. */
function testLayout(): TownLayout {
  const W = 40;
  const H = 12;
  const collision = new Array<number>(W * H).fill(0);
  const block = (x: number, y: number) => (collision[y * W + x] = 1);
  for (let x = 0; x < W; x++) {
    block(x, 0);
    block(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    block(0, y);
    block(19, y);
    block(20, y);
    block(W - 1, y);
    if (y !== 2) block(10, y); // wall with a gap at the top
  }
  // building footprint 14..16 x 3..4, door (15,5); interior 22..30 x 2..8
  for (let y = 3; y <= 4; y++) for (let x = 14; x <= 16; x++) block(x, y);
  for (let y = 2; y <= 8; y++) for (let x = 22; x <= 30; x++) if (x === 22 || x === 30 || y === 2 || y === 8) block(x, y);
  return {
    version: 0,
    widthTiles: W,
    heightTiles: H,
    tileSize: 16,
    townBounds: { x: 0, y: 0, w: 20, h: 12 },
    square: { cx: 80, cy: 80, r: 32 },
    buildings: [
      {
        id: 'house-0',
        kind: 'house',
        name: 'Test',
        houseIndex: 0,
        footprint: { x: 14, y: 3, w: 3, h: 2 },
        door: { x: 15, y: 5 },
        interior: { x: 22, y: 2, w: 9, h: 7 },
        interiorDoor: { x: 26, y: 7 },
        bed: { x: 23, y: 3 },
        visitPoint: { x: 24, y: 3 },
      },
    ],
    collision,
    playerSpawn: { x: 5, y: 6 },
    storytellerSpawn: { x: 7, y: 6 },
    streetlights: [],
  };
}

describe('WorldModule movement', () => {
  it('spawns joining members outdoors and tells them where they are', () => {
    const { host, world } = setup();
    expect(world.locationOf('p0')).toBe('outdoors');
    expect(world.locationOf('st')).toBe('outdoors');
    const tp = last<WorldTeleport>(host, 'p0', 'world:teleport')!;
    expect(tp.reason).toBe('spawn');
    expect(isBlockedPx(townLayout, tp.x, tp.y)).toBe(false);
    expect(host.events.some((e) => e.type === 'location_changed' && e.pid === 'st' && e.prev === null)).toBe(true);
  });

  it('accepts a move within the speed budget and acks its seq', () => {
    const { host, world } = setup({ layout: testLayout() });
    const p = world.positionOf('p0')!;
    host.clock.now += 100;
    world.handleMove('p0', { seq: 1, x: p.x + 6, y: p.y, facing: 'right', moving: true });
    expect(world.positionOf('p0')).toEqual({ x: p.x + 6, y: p.y });
    expect(world.snapshotFor('p0').ackSeq).toBe(1);
  });

  it('rejects a speed hack with a correction teleport', () => {
    const { host, world } = setup({ layout: testLayout() });
    const p = world.positionOf('p0')!;
    host.clock.now += 100;
    world.handleMove('p0', { seq: 1, x: p.x + 60, y: p.y, facing: 'right', moving: true });
    expect(world.positionOf('p0')).toEqual(p);
    const tp = last<WorldTeleport>(host, 'p0', 'world:teleport')!;
    expect(tp).toMatchObject({ reason: 'correction', seq: 1, x: p.x, y: p.y });
    // even after a long idle the burst allowance is capped (no stored-up teleports)
    host.clock.now += 60_000;
    const cap = PLAYER_SPEED * MOVE_TOLERANCE * BURST_SECONDS;
    world.handleMove('p0', { seq: 2, x: p.x + cap + 10, y: p.y, facing: 'right', moving: true });
    expect(world.positionOf('p0')).toEqual(p);
  });

  it('lets the storyteller travel faster only after travel_speed is raised', () => {
    const { host, world } = setup({ layout: testLayout() });
    const p = world.positionOf('st')!;
    // 70 px: more than 0.1 s (or, for the player below, 0.3 s) of walking at 150 px/s x tolerance
    host.clock.now += 100;
    world.handleMove('st', { seq: 1, x: p.x, y: p.y - 70, facing: 'up', moving: true });
    expect(world.positionOf('st')).toEqual(p);
    host.emit({ type: 'travel_speed', pid: 'st', mult: 4 });
    host.clock.now += 100;
    world.handleMove('st', { seq: 2, x: p.x, y: p.y - 70, facing: 'up', moving: true });
    expect(world.positionOf('st')).toEqual({ x: p.x, y: p.y - 70 });
    // players never get the multiplier
    host.emit({ type: 'travel_speed', pid: 'p0', mult: 4 });
    const q = world.positionOf('p0')!;
    host.clock.now += 100;
    world.handleMove('p0', { seq: 1, x: q.x, y: q.y - 70, facing: 'up', moving: true });
    expect(world.positionOf('p0')).toEqual(q);
  });

  it('blocks moving into walls and tunnelling through them', () => {
    const layout = testLayout();
    const { host, world } = setup({ layout });
    // p0 spawns at tile (5,6); walk right along row 6 to tile 9, next to the wall at x = 10
    const start = tileCenterPx(layout, { x: 9, y: 6 });
    let seq = 0;
    let cur = world.positionOf('p0')!;
    expect(cur).toEqual(tileCenterPx(layout, { x: 5, y: 6 }));
    while (cur.x < start.x) {
      host.clock.now += 100;
      world.handleMove('p0', { seq: ++seq, x: Math.min(start.x, cur.x + 6), y: cur.y, facing: 'right', moving: true });
      const next = world.positionOf('p0')!;
      expect(next.x).toBeGreaterThan(cur.x);
      cur = next;
    }
    expect(cur).toEqual(start);
    // into the wall
    host.clock.now += 100;
    world.handleMove('p0', { seq: ++seq, x: start.x + 8, y: start.y, facing: 'right', moving: true });
    expect(world.positionOf('p0')).toEqual(start);
    expect(last<WorldTeleport>(host, 'p0', 'world:teleport')!.reason).toBe('correction');
    // through the wall to a free tile on the other side (both endpoints free, path blocked)
    host.clock.now += 1000;
    const across = tileCenterPx(layout, { x: 11, y: 6 });
    expect(isBlockedPx(layout, across.x, across.y)).toBe(false);
    world.handleMove('p0', { seq: ++seq, x: across.x, y: across.y, facing: 'right', moving: true });
    expect(world.positionOf('p0')).toEqual(start);
  });

  it('ignores stale or duplicate seqs', () => {
    const { host, world } = setup({ layout: testLayout() });
    const p = world.positionOf('p0')!;
    host.clock.now += 100;
    world.handleMove('p0', { seq: 5, x: p.x + 4, y: p.y, facing: 'right', moving: true });
    host.clock.now += 100;
    world.handleMove('p0', { seq: 3, x: p.x + 8, y: p.y, facing: 'right', moving: true });
    expect(world.positionOf('p0')).toEqual({ x: p.x + 4, y: p.y });
  });
});

describe('WorldModule doors and phases', () => {
  const doorOf = (id: string) => townLayout.buildings.find((b) => b.id === id)!;

  function standAtDoor(world: ReturnType<typeof createWorldModule>, pid: string, id: string) {
    world.teleportToBuilding(pid, id, 'door');
    world.exitBuilding(pid, 'door');
    const d = tileCenterPx(townLayout, doorOf(id).door);
    expect(world.positionOf(pid)).toEqual(d);
    expect(world.locationOf(pid)).toBe('outdoors');
  }

  it('requires adjacency to a door', () => {
    const { host, world } = setup();
    standAtDoor(world, 'p0', 'house-0');
    world.handleUseDoor('p0', { buildingId: 'house-3' });
    expect(world.locationOf('p0')).toBe('outdoors');
    expect(last<{ code: string }>(host, 'p0', 'error')!.code).toBe('forbidden');
    world.handleUseDoor('p0', { buildingId: 'nope' });
    expect(last<{ code: string }>(host, 'p0', 'error')!.code).toBe('not_found');
    world.handleUseDoor('p0', { buildingId: 'house-0' });
    expect(world.locationOf('p0')).toBe('bld:house-0');
    const tp = last<WorldTeleport>(host, 'p0', 'world:teleport')!;
    expect(tp.reason).toBe('door');
    expect(host.events.at(-1)).toMatchObject({ type: 'location_changed', pid: 'p0', location: 'bld:house-0', prev: 'outdoors' });
    // and back out again (interior door is where we landed)
    world.handleUseDoor('p0', { buildingId: 'house-0' });
    expect(world.locationOf('p0')).toBe('outdoors');
  });

  it('v2: leaving works from anywhere inside (fixed interior view + Leave button); entering still needs the doorway', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    // inside at the bed, far from the interior door: Leave puts them on the outdoor doorstep
    world.teleportToBuilding('p0', 'house-0', 'door');
    world.walkTo('p0', { kind: 'home' });
    for (let i = 0; i < 40 && world.snapshotFor('p0').you; i++) world.tick(50);
    expect(world.positionOf('p0')).toEqual(tileCenterPx(townLayout, doorOf('house-0').bed!));
    world.handleUseDoor('p0', { buildingId: 'house-0' });
    expect(world.locationOf('p0')).toBe('outdoors');
    expect(world.positionOf('p0')).toEqual(tileCenterPx(townLayout, doorOf('house-0').door));
    expect(teleports(host, 'p0').at(-1)!.reason).toBe('door');
    // useDoor for ANOTHER building while inside one never moves you
    world.handleUseDoor('p0', { buildingId: 'house-0' });
    expect(world.locationOf('p0')).toBe('bld:house-0');
    world.handleUseDoor('p0', { buildingId: 'house-1' });
    expect(world.locationOf('p0')).toBe('bld:house-0');
    expect(last<{ code: string }>(host, 'p0', 'error')!.code).toBe('forbidden');
    // still locked in at night, wherever they stand inside
    phase(host, 'night');
    for (let i = 0; i < 40 && world.snapshotFor('p0').you; i++) world.tick(50); // the walk to bed
    world.handleUseDoor('p0', { buildingId: 'house-0' });
    expect(world.locationOf('p0')).toBe('bld:house-0');
    expect(last<{ code: string }>(host, 'p0', 'error')!.code).toBe('phase');
  });

  it('v2: every door (south, east and west facing) can be used from its doorway tile and from one step off it', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    for (const b of townLayout.buildings) {
      standAtDoor(world, 'p0', b.id);
      const d = world.positionOf('p0')!;
      // nudge to the nearest walkable point a few px off the tile centre, as a walking client would stand
      for (const [dx, dy] of [[0, 0], [6, 0], [-6, 0], [0, -4], [0, 4]] as const) {
        if (isBlockedPx(townLayout, d.x + dx, d.y + dy)) continue;
        world.teleportTo('p0', { kind: 'point', x: d.x + dx, y: d.y + dy });
        if (world.locationOf('p0') !== 'outdoors') continue;
        world.handleUseDoor('p0', { buildingId: b.id });
        expect(world.locationOf('p0'), `${b.id} from ${dx},${dy}`).toBe(`bld:${b.id}`);
        world.handleUseDoor('p0', { buildingId: b.id });
        expect(world.locationOf('p0')).toBe('outdoors');
      }
    }
    expect(host.sent.get('p0')!.filter((m) => m.type === 'error')).toEqual([]);
  });

  it('day / setup / waiting / bedtime: any building can be entered and exited', () => {
    const { host, world, pids } = setup();
    for (const ph of [null, 'setup', 'day', 'bedtime'] as const) {
      if (ph === 'setup') start(host, pids);
      if (ph) phase(host, ph);
      standAtDoor(world, 'p0', 'house-7'); // an empty cottage (nobody's home in a 3-player game)
      world.handleUseDoor('p0', { buildingId: 'house-7' });
      expect(world.locationOf('p0')).toBe('bld:house-7');
      world.handleUseDoor('p0', { buildingId: 'house-7' });
      expect(world.locationOf('p0')).toBe('outdoors');
      standAtDoor(world, 'p0', 'house-2'); // someone else's cottage
      world.handleUseDoor('p0', { buildingId: 'house-2' });
      expect(world.locationOf('p0')).toBe('bld:house-2');
      world.handleUseDoor('p0', { buildingId: 'house-2' });
      expect(world.locationOf('p0')).toBe('outdoors');
    }
  });

  it('night: every player is sent to bed and locked in; the storyteller roams freely', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    standAtDoor(world, 'p1', 'house-7');
    world.handleUseDoor('p1', { buildingId: 'house-7' });
    expect(world.locationOf('p1')).toBe('bld:house-7');
    phase(host, 'night');
    pids.forEach((pid, seat) => {
      expect(world.locationOf(pid)).toBe(`bld:house-${seat}`);
      expect(world.positionOf(pid)).toEqual(tileCenterPx(townLayout, doorOf(`house-${seat}`).bed!));
    });
    expect(teleports(host, 'p1').at(-1)!.reason).toBe('night');
    expect(world.locationOf('st')).toBe('outdoors');
    // walk to the interior door and try to leave
    world.teleportToBuilding('p0', 'house-0', 'door');
    world.handleUseDoor('p0', { buildingId: 'house-0' });
    expect(world.locationOf('p0')).toBe('bld:house-0');
    expect(last<{ code: string }>(host, 'p0', 'error')!.code).toBe('phase');
    // the storyteller can visit and leave
    world.teleportToBuilding('st', 'house-1', 'storyteller');
    expect(world.locationOf('st')).toBe('bld:house-1');
    expect(world.positionOf('st')).toEqual(tileCenterPx(townLayout, doorOf('house-1').visitPoint!));
    world.exitBuilding('st', 'storyteller');
    expect(world.locationOf('st')).toBe('outdoors');
    expect(world.positionOf('st')).toEqual(tileCenterPx(townLayout, doorOf('house-1').door));
    standAtDoor(world, 'st', 'house-2');
    world.handleUseDoor('st', { buildingId: 'house-2' });
    expect(world.locationOf('st')).toBe('bld:house-2');
  });

  it('first_night straight from setup sends players home too', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'setup');
    phase(host, 'first_night');
    pids.forEach((pid, seat) => expect(world.locationOf(pid)).toBe(`bld:house-${seat}`));
  });

  it('dawn keeps players home; day unlocks the door', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'night');
    phase(host, 'dawn');
    world.teleportToBuilding('p2', 'house-2', 'door');
    world.handleUseDoor('p2', { buildingId: 'house-2' });
    expect(world.locationOf('p2')).toBe('bld:house-2');
    phase(host, 'day');
    expect(world.locationOf('p2')).toBe('bld:house-2'); // stays home at daybreak
    world.handleUseDoor('p2', { buildingId: 'house-2' });
    expect(world.locationOf('p2')).toBe('outdoors');
  });

  it('sendHome is idempotent (no duplicate teleports or location events)', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    world.sendHome('p0', 'bedtime');
    expect(world.locationOf('p0')).toBe('bld:house-0');
    const nTp = teleports(host, 'p0').length;
    const nEv = host.events.filter((e) => e.type === 'location_changed' && e.pid === 'p0').length;
    world.sendHome('p0', 'bedtime');
    world.sendHome('p0', 'night');
    phase(host, 'night'); // the module's own phase handler is harmless on top
    world.sendHome('p0', 'night');
    expect(teleports(host, 'p0').length).toBe(nTp);
    expect(host.events.filter((e) => e.type === 'location_changed' && e.pid === 'p0').length).toBe(nEv);
    // the storyteller has no home
    world.sendHome('st', 'night');
    expect(world.locationOf('st')).toBe('outdoors');
  });

  it('exitBuilding is a no-op outdoors and restores a reconnecting client', () => {
    const { host, world } = setup();
    const before = world.positionOf('p0');
    world.exitBuilding('p0', 'door');
    expect(world.positionOf('p0')).toEqual(before);
    host.member('p0')!.connected = true;
    host.emit({ type: 'member_connection', pid: 'p0', connected: true });
    expect(last<WorldTeleport>(host, 'p0', 'world:teleport')).toMatchObject({ reason: 'spawn', x: before!.x, y: before!.y });
  });

  it('removes entities when members leave', () => {
    const { host, world } = setup();
    host.emit({ type: 'member_left', pid: 'p2' });
    expect(world.locationOf('p2')).toBeNull();
    expect(ids(world.snapshotFor('p0'))).not.toContain('p2');
  });
});

describe('WorldModule visibility', () => {
  it('day: same location only (outdoors sees outdoors, interiors are private)', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    world.teleportToBuilding('p2', 'house-7', 'door');
    expect(ids(world.snapshotFor('p0'))).toEqual(['p0', 'p1', 'st']);
    expect(ids(world.snapshotFor('p2'))).toEqual(['p2']);
    world.teleportToBuilding('p1', 'house-7', 'door');
    expect(ids(world.snapshotFor('p2'))).toEqual(['p1', 'p2']);
    expect(ids(world.snapshotFor('st'))).toEqual(['p0', 'p1', 'p2', 'st']);
  });

  it('night: other houses are invisible; the storyteller appears only in the visited home', () => {
    const { host, world, pids } = setup({ players: 4 });
    start(host, pids);
    phase(host, 'night');
    for (const pid of pids) expect(ids(world.snapshotFor(pid))).toEqual([pid]);
    world.teleportToBuilding('st', 'house-1', 'storyteller');
    expect(ids(world.snapshotFor('p1'))).toEqual(['p1', 'st']);
    expect(ids(world.snapshotFor('p0'))).toEqual(['p0']);
    expect(ids(world.snapshotFor('p2'))).toEqual(['p2']);
    expect(ids(world.snapshotFor('p3'))).toEqual(['p3']);
    expect(ids(world.snapshotFor('st'))).toEqual(['p0', 'p1', 'p2', 'p3', 'st']);
    world.exitBuilding('st', 'storyteller');
    expect(ids(world.snapshotFor('p1'))).toEqual(['p1']);
  });

  it("night-visit secrecy: player A's message stream does not depend on whom the ST visits", () => {
    const run = (visit: string | null) => {
      const { host, world, pids } = setup({ players: 3 });
      start(host, pids);
      phase(host, 'night');
      if (visit) world.teleportToBuilding('st', visit, 'storyteller');
      host.clock.now += 500;
      const snap = world.snapshotFor('p0');
      return JSON.stringify({ sent: host.sent.get('p0'), snap: { ...snap, t: 0 } });
    };
    expect(run('house-1')).toBe(run(null));
    expect(run('house-2')).toBe(run(null));
    expect(run('house-0')).not.toBe(run(null)); // sanity: the visited player does see it
  });

  it('snapshot includes ackSeq for the viewer', () => {
    const { host, world } = setup();
    const p = world.positionOf('p0')!;
    let seq = 0;
    for (const [dx, dy] of [
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
    ])
      if (!isBlockedPx(townLayout, p.x + dx!, p.y + dy!)) {
        host.clock.now += 100;
        world.handleMove('p0', { seq: ++seq + 10, x: p.x + dx!, y: p.y + dy!, facing: 'down', moving: false });
        break;
      }
    expect(world.snapshotFor('p0').ackSeq).toBe(11);
    expect(world.snapshotFor('p1').ackSeq).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------
// world-audit: night edge cases + Storyteller placement around the night (docs/world-audit.md)
describe('WorldModule night edge cases (world-audit)', () => {
  const b = (id: string) => townLayout.buildings.find((x) => x.id === id)!;
  // the ST's spawn spot (storytellerSpawn, spread on a ring by member order) = where it joined
  let stHome = { x: 0, y: 0 };
  const stSpawnPx = () => stHome;

  it('a player inside SOMEONE ELSE\'s cottage at nightfall is put to bed in their own', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    world.teleportToBuilding('p0', 'house-2', 'door');
    phase(host, 'bedtime');
    expect(world.locationOf('p0')).toBe('bld:house-2'); // bedtime itself does not move anyone
    phase(host, 'night');
    expect(world.locationOf('p0')).toBe('bld:house-0');
    expect(world.positionOf('p0')).toEqual(tileCenterPx(townLayout, b('house-0').bed!));
    expect(teleports(host, 'p0').at(-1)!.reason).toBe('night');
  });

  it('night: moves that leave the cottage (or teleport-hack outdoors) are rejected with a correction', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'night');
    const bed = world.positionOf('p1')!;
    const out = tileCenterPx(townLayout, b('house-1').door);
    host.clock.now += 5000;
    world.handleMove('p1', { seq: 1, x: out.x, y: out.y, facing: 'down', moving: true });
    expect(world.locationOf('p1')).toBe('bld:house-1');
    expect(world.positionOf('p1')).toEqual(bed);
    expect(last<WorldTeleport>(host, 'p1', 'world:teleport')).toMatchObject({ reason: 'correction', seq: 1 });
    // walking onto the barred doorway tile itself (blocked) is rejected too
    const door = tileCenterPx(townLayout, b('house-1').interiorDoor);
    host.clock.now += 5000;
    world.handleMove('p1', { seq: 2, x: door.x, y: door.y + 16, facing: 'down', moving: true });
    expect(world.positionOf('p1')).toEqual(bed);
    // useDoor on someone else's cottage from inside your own: too far / wrong building
    world.handleUseDoor('p1', { buildingId: 'house-2' });
    expect(world.locationOf('p1')).toBe('bld:house-1');
  });

  it('a player who disconnected outdoors and reconnects at night appears in their own home', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    host.member('p2')!.connected = false;
    host.emit({ type: 'member_connection', pid: 'p2', connected: false });
    phase(host, 'night'); // sendHome runs for disconnected players too (no message reaches them)
    expect(world.locationOf('p2')).toBe('bld:house-2');
    host.member('p2')!.connected = true;
    host.emit({ type: 'member_connection', pid: 'p2', connected: true });
    const tp = last<WorldTeleport>(host, 'p2', 'world:teleport')!;
    expect(tp).toMatchObject({ reason: 'spawn', location: 'bld:house-2' });
    expect(ids(world.snapshotFor('p2'))).toEqual(['p2']);
  });

  it('the storyteller visits several homes in sequence; each visit is seen only in that home', () => {
    const { host, world, pids } = setup({ players: 4 });
    start(host, pids);
    phase(host, 'night');
    for (const seat of [2, 0, 3, 1]) {
      world.teleportToBuilding('st', `house-${seat}`, 'storyteller');
      for (const [i, pid] of pids.entries()) expect(ids(world.snapshotFor(pid))).toEqual(i === seat ? [pid, 'st'].sort() : [pid]);
    }
    const locs = host.events.filter((e) => e.type === 'location_changed' && e.pid === 'st').map((e) => (e as { location: string }).location);
    expect(locs.slice(-4)).toEqual(['bld:house-2', 'bld:house-0', 'bld:house-3', 'bld:house-1']);
  });

  it('night start moves a storyteller who lingered in a cottage to its doorstep (no unregistered visit)', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    world.teleportToBuilding('st', 'house-1', 'door');
    phase(host, 'bedtime');
    expect(world.locationOf('st')).toBe('bld:house-1');
    phase(host, 'night');
    expect(world.locationOf('st')).toBe('outdoors');
    expect(ids(world.snapshotFor('p1'))).toEqual(['p1']);
    // v2: every building is a cottage, so even an EMPTY one (no seat lives there) is left at nightfall
    phase(host, 'day');
    world.teleportToBuilding('st', 'house-7', 'door');
    phase(host, 'night');
    expect(world.locationOf('st')).toBe('outdoors');
  });

  it('dawn returns the storyteller to the square: the last visited home is not revealed at daybreak', () => {
    for (const how of ['inside', 'doorstep', 'leave_home_then_dawn_walk'] as const) {
      const { host, world, pids } = setup();
      stHome = world.positionOf('st')!;
      start(host, pids);
      phase(host, 'night');
      world.teleportToBuilding('st', 'house-2', 'storyteller');
      if (how === 'doorstep') world.exitBuilding('st', 'storyteller'); // ST 'leave_home' fast travel
      phase(host, 'dawn');
      expect(world.locationOf('st')).toBe('outdoors');
      expect(world.positionOf('st')).toEqual(stSpawnPx());
      expect(teleports(host, 'st').at(-1)!.reason).toBe('dawn');
      if (how === 'leave_home_then_dawn_walk') world.teleportToBuilding('st', 'house-1', 'storyteller'); // dawn wander
      phase(host, 'day');
      expect(world.positionOf('st')).toEqual(stSpawnPx());
      // every player walking out sees the ST at the same neutral spot whatever the night was
      world.handleUseDoor('p0', { buildingId: 'house-0' });
      world.teleportToBuilding('p0', 'house-0', 'door');
      world.handleUseDoor('p0', { buildingId: 'house-0' });
      expect(world.locationOf('p0')).toBe('outdoors');
      expect(world.snapshotFor('p0').entities.find((e) => e.id === 'st')).toMatchObject({ x: stSpawnPx().x, y: stSpawnPx().y, location: 'outdoors' });
    }
  });

  it('night -> day directly (no dawn) also resets the storyteller; day -> bedtime does not', () => {
    const { host, world, pids } = setup();
    stHome = world.positionOf('st')!;
    start(host, pids);
    phase(host, 'night');
    world.teleportToBuilding('st', 'house-1', 'storyteller');
    phase(host, 'day');
    expect(world.positionOf('st')).toEqual(stSpawnPx());
    world.teleportToBuilding('st', 'house-7', 'door');
    phase(host, 'bedtime');
    expect(world.locationOf('st')).toBe('bld:house-7');
  });

  it('players never collide with each other (two players may share a doorstep)', () => {
    const { host, world } = setup();
    world.teleportToBuilding('p0', 'house-0', 'door');
    world.exitBuilding('p0', 'door');
    world.teleportToBuilding('p1', 'house-0', 'door');
    world.exitBuilding('p1', 'door');
    expect(world.positionOf('p0')).toEqual(world.positionOf('p1'));
    host.clock.now += 200;
    const p = world.positionOf('p0')!;
    world.handleMove('p0', { seq: 1, x: p.x, y: p.y + 4, facing: 'down', moving: true });
    expect(world.positionOf('p0')).toEqual({ x: p.x, y: p.y + 4 });
  });
});
