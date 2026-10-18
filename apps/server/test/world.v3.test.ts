// OWNED BY v3-world (WP5a). The server world module on the v3 layout (Hollowmere, townLayoutV3): doors of every
// cottage (rotated ones included) and of the enterable clock tower (nobody's home: open to all by day, locked for
// players at night like any room that is not their home) in and out, bedtime / night send-home, Storyteller visits, seats on the 15 dais
// stones, the Storyteller spawn off the dais, and the per-world layout plumbing (host.layout(), world fixed at
// creation: lobby.world.test.ts covers lobby:settings over a real room).
import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import { townLayoutV3 as L } from '@ct/assets/hollowmere';
import { circleCentre, circleSpots, isBlockedPx, locationAt, stoneOfSeatIndex, tileCenterPx, type WorldTeleport } from '@ct/protocol';
import { createWorldModule } from '../src/world/index.js';
import { layoutForWorld } from '../src/rooms/worldLayout.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

function setup(players = 5) {
  const host = createFakeHost();
  host.layout = () => L; // a v3 lobby's host
  const world = createWorldModule(host, { layout: host.layout() });
  host.setModules({ world });
  const pids: string[] = [];
  for (let i = 0; i < players; i++) {
    host.addMember({ pid: `p${i}` });
    pids.push(`p${i}`);
    host.emit({ type: 'member_joined', pid: `p${i}` });
  }
  host.addMember({ pid: 'st', role: 'storyteller' });
  host.emit({ type: 'member_joined', pid: 'st' });
  return { host, world, pids };
}
function start(host: FakeHost, pids: string[]) {
  pids.forEach((pid, i) => {
    host.member(pid)!.seat = i;
  });
  host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
}
const phase = (host: FakeHost, p: 'setup' | 'first_night' | 'day' | 'bedtime' | 'night' | 'dawn') =>
  host.emit({ type: 'phase_changed', phase: p, prev: null, phaseEndsAt: null });
const teleports = (host: FakeHost, pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'world:teleport').map((m) => m.payload as WorldTeleport);
const errors = (host: FakeHost, pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'error');
const byId = (id: string) => L.buildings.find((b) => b.id === id)!;
const DAIS_R_PX = 2.4 * 16;

describe('world module on the v3 layout (Hollowmere)', () => {
  it('layoutForWorld maps worlds to layouts; v3 is a different map (125 x 43) with its own doors', () => {
    expect(layoutForWorld('v3')).toBe(L);
    expect(layoutForWorld('v2')).toBe(townLayout);
    expect([L.widthTiles, L.heightTiles]).toEqual([125, 43]);
    expect(byId('house-9').door).not.toEqual(townLayout.buildings.find((b) => b.id === 'house-9')!.door);
  });

  it('spawns players at the v3 player spawn and the Storyteller at (22,23), outdoors and off the dais', () => {
    const { world } = setup(1);
    const p = world.positionOf('p0')!;
    expect(p).toEqual(tileCenterPx(L, L.playerSpawn));
    const st = world.positionOf('st')!;
    // arrivals spread on a small ring of free tiles around the spawn tile (the ST is the 2nd member: one tile west)
    expect(L.storytellerSpawn).toEqual({ x: 22, y: 23 });
    expect(st).toEqual(tileCenterPx(L, { x: 21, y: 23 }));
    expect(world.locationOf('st')).toBe('outdoors');
    const c = circleCentre(L);
    expect(Math.hypot(st.x - c.x, st.y - c.y)).toBeGreaterThan(DAIS_R_PX);
    expect(isBlockedPx(L, st.x, st.y)).toBe(false);
  });

  it('every cottage door (straight, turned 12-45 deg, chamfered, recessed) works from its door tile and one step off it, in and out', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    for (const b of L.buildings) {
      world.teleportToBuilding('p0', b.id, 'door');
      expect(world.locationOf('p0'), `${b.id} teleport in`).toBe(`bld:${b.id}`);
      expect(world.positionOf('p0')).toEqual(tileCenterPx(L, b.interiorDoor));
      world.exitBuilding('p0', 'door');
      const d = tileCenterPx(L, b.door);
      expect(world.positionOf('p0'), `${b.id} doorstep`).toEqual(d);
      for (const [dx, dy] of [[0, 0], [6, 0], [-6, 0], [0, -4], [0, 4]] as const) {
        if (isBlockedPx(L, d.x + dx, d.y + dy) || locationAt(L, d.x + dx, d.y + dy) !== 'outdoors') continue;
        world.teleportTo('p0', { kind: 'point', x: d.x + dx, y: d.y + dy });
        if (world.locationOf('p0') !== 'outdoors') continue;
        world.handleUseDoor('p0', { buildingId: b.id });
        expect(world.locationOf('p0'), `${b.id} from ${dx},${dy}`).toBe(`bld:${b.id}`);
        expect(teleports(host, 'p0').at(-1)!.reason).toBe('door');
        world.handleUseDoor('p0', { buildingId: b.id });
        expect(world.locationOf('p0'), `${b.id} out`).toBe('outdoors');
        expect(world.positionOf('p0')).toEqual(d);
      }
    }
    expect(errors(host, 'p0')).toEqual([]);
  });

  it('a door cannot be used from another door (ranges are disjoint)', () => {
    const { host, world } = setup(1);
    for (const b of L.buildings) {
      world.teleportToBuilding('p0', b.id, 'door');
      world.exitBuilding('p0', 'door');
      for (const o of L.buildings) {
        if (o === b) continue;
        world.handleUseDoor('p0', { buildingId: o.id });
        expect(world.locationOf('p0'), `${o.id} from ${b.id}'s door`).toBe('outdoors');
      }
    }
    expect(errors(host, 'p0').length).toBe(L.buildings.length * (L.buildings.length - 1));
  });

  it('night sends every player to bed in their own cottage and locks them in; the Storyteller visits and leaves', () => {
    const { host, world, pids } = setup();
    start(host, pids);
    phase(host, 'day');
    world.teleportToBuilding('p1', 'house-9', 'door'); // someone else's cottage at nightfall
    phase(host, 'bedtime');
    phase(host, 'night');
    pids.forEach((pid, seat) => {
      expect(world.locationOf(pid)).toBe(`bld:house-${seat}`);
      expect(world.positionOf(pid)).toEqual(tileCenterPx(L, byId(`house-${seat}`).bed!));
    });
    expect(teleports(host, 'p1').at(-1)!.reason).toBe('night');
    world.teleportToBuilding('p0', 'house-0', 'door');
    world.handleUseDoor('p0', { buildingId: 'house-0' });
    expect(world.locationOf('p0')).toBe('bld:house-0'); // locked in
    world.teleportToBuilding('st', 'house-3', 'storyteller');
    expect(world.locationOf('st')).toBe('bld:house-3');
    expect(world.positionOf('st')).toEqual(tileCenterPx(L, byId('house-3').visitPoint!));
    world.exitBuilding('st', 'storyteller');
    expect(world.locationOf('st')).toBe('outdoors');
    expect(world.positionOf('st')).toEqual(tileCenterPx(L, byId('house-3').door));
  });

  it('the clock tower is nobody\'s home: open to every player by day and at bedtime, locked for players at night (the Storyteller may always enter); a player inside at nightfall is sent home to bed', () => {
    const { host, world, pids } = setup();
    const tower = byId('clocktower');
    expect([tower.kind, tower.houseIndex, tower.bed]).toEqual(['clocktower', null, undefined]);
    // waiting room: anyone walks in and out
    const walkIn = (pid: string) => {
      world.teleportTo(pid, { kind: 'point', ...tileCenterPx(L, tower.door) });
      world.handleUseDoor(pid, { buildingId: 'clocktower' });
    };
    walkIn('p0');
    expect(world.locationOf('p0')).toBe('bld:clocktower');
    expect(world.positionOf('p0')).toEqual(tileCenterPx(L, tower.interiorDoor));
    world.handleUseDoor('p0', { buildingId: 'clocktower' });
    expect(world.locationOf('p0')).toBe('outdoors');
    expect(world.positionOf('p0')).toEqual(tileCenterPx(L, tower.door));
    start(host, pids);
    phase(host, 'day');
    for (const pid of ['p1', 'p2']) walkIn(pid);
    expect(world.locationOf('p1')).toBe('bld:clocktower');
    expect(world.locationOf('p2')).toBe('bld:clocktower');
    // the landing (the vendor's visit point) is free floor of the same location
    const vp = tileCenterPx(L, tower.visitPoint!);
    expect(isBlockedPx(L, vp.x, vp.y)).toBe(false);
    expect(locationAt(L, vp.x, vp.y)).toBe('bld:clocktower');
    phase(host, 'bedtime');
    world.handleUseDoor('p2', { buildingId: 'clocktower' });
    expect(world.locationOf('p2')).toBe('outdoors'); // bedtime: still free to leave
    walkIn('p3');
    expect(world.locationOf('p3')).toBe('bld:clocktower'); // ... and to go in
    world.handleUseDoor('p3', { buildingId: 'clocktower' });
    phase(host, 'night');
    // p1 was still in the tower at nightfall: in bed at home, like a player in someone else's cottage
    expect(world.locationOf('p1')).toBe('bld:house-1');
    expect(world.positionOf('p1')).toEqual(tileCenterPx(L, byId('house-1').bed!));
    // at night the tower is locked for players (they are locked in at home; outdoors they may only enter their own home)
    const before = errors(host, 'p4').length;
    world.exitBuilding('p4', 'door'); // (the Storyteller's API: put p4 outdoors at night)
    expect(world.teleportTo('p4', { kind: 'point', ...tileCenterPx(L, tower.door) })).toBeNull();
    expect(world.locationOf('p4')).toBe('outdoors');
    world.handleUseDoor('p4', { buildingId: 'clocktower' });
    expect(world.locationOf('p4')).toBe('outdoors');
    expect(errors(host, 'p4').length).toBeGreaterThan(before);
    // the Storyteller may always go in (a visit lands on the interior door tile: visit points are for cottages)
    world.teleportToBuilding('st', 'clocktower', 'storyteller');
    expect(world.locationOf('st')).toBe('bld:clocktower');
    expect(world.positionOf('st')).toEqual(tileCenterPx(L, tower.interiorDoor));
    world.exitBuilding('st', 'storyteller');
    expect(world.locationOf('st')).toBe('outdoors');
    // the next day the tower is open again
    phase(host, 'dawn');
    phase(host, 'day');
    world.exitBuilding('p0', 'door');
    walkIn('p0');
    expect(world.locationOf('p0')).toBe('bld:clocktower');
  });

  it.each([5, 9, 15])('n=%i: seats map onto the 15 dais stones (round(k*15/n)) and are walkable', (n) => {
    const { host, world, pids } = setup(n);
    start(host, pids);
    phase(host, 'day');
    const seats = pids.map((_, i) => i);
    const spots = circleSpots(L, seats);
    const c = circleCentre(L);
    pids.forEach((pid, k) => {
      expect(world.teleportTo(pid, { kind: 'seat' })).toBeNull();
      const p = world.positionOf(pid)!;
      expect(p).toEqual({ x: spots[k]!.x, y: spots[k]!.y });
      const stone = stoneOfSeatIndex(k, n, 15);
      const th = (2 * Math.PI * stone) / 15;
      expect(Math.hypot(p.x - (c.x + Math.sin(th) * 100), p.y - (c.y - Math.cos(th) * 100)), `seat ${k} near stone ${stone}`).toBeLessThanOrEqual(24);
      expect(isBlockedPx(L, p.x, p.y)).toBe(false);
      expect(world.locationOf(pid)).toBe('outdoors');
    });
  });

  it('a walk across the v3 town is accepted move by move (collision matches the walk shapes)', () => {
    const { host, world } = setup(1);
    // spawn (22,27) -> straight north to the Storyteller spawn row (22,23): every move at walking speed, none corrected
    let p = world.positionOf('p0')!;
    for (let seq = 1; seq <= 6; seq++) {
      host.clock.now += 100;
      const next = { x: p.x, y: p.y - 12 };
      world.handleMove('p0', { seq, x: next.x, y: next.y, facing: 'up', moving: true });
      p = world.positionOf('p0')!;
    }
    expect(teleports(host, 'p0').filter((t) => t.reason === 'correction')).toEqual([]);
    // walking into the dais is refused
    const c = circleCentre(L);
    host.clock.now += 5000;
    world.handleMove('p0', { seq: 11, x: c.x, y: c.y, facing: 'up', moving: true });
    expect(world.positionOf('p0')).not.toEqual({ x: c.x, y: c.y });
  });
});
