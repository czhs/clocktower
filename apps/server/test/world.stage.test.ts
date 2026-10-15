// OWNED BY gameplay. WorldModule "walking, not teleporting" + Storyteller stage API on the real town
// layout: circle spots, A* escort through doors, nightfall placement, teleport / walk / freeze /
// door locks, presence for the ST view, bursty-network movement tolerance, and night secrecy.
import { describe, expect, it } from 'vitest';
import { townLayout as L } from '@ct/assets';
import {
  circleCentre,
  circleSpots,
  DEFAULT_ST_SETTINGS,
  homeBuilding,
  CIRCLE_SEATED_PX,
  isBlockedPx,
  locationAt,
  MOVE_TOLERANCE,
  PLAYER_SPEED,
  tileCenterPx,
  type WorldSnapshot,
  type WorldTeleport,
} from '@ct/protocol';
import { createWorldModule } from '../src/world/index.js';
import { findPath, segmentClear } from '../src/world/path.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';
/** Layout-driven ids (no id conventions): seat N's home, and two public (non-house) buildings. */
const H = (seat: number) => homeBuilding(L, seat)!.id;
const [PUB1, PUB2] = L.buildings.filter((b) => b.kind !== 'house').map((b) => b.id) as [string, string];

type Ph = 'setup' | 'first_night' | 'day' | 'bedtime' | 'night' | 'dawn' | 'finished';

function setup(n = 5) {
  const host = createFakeHost();
  const world = createWorldModule(host);
  host.setModules({ world });
  const pids: string[] = [];
  for (let i = 0; i < n; i++) {
    host.addMember({ pid: `p${i}`, seat: i });
    pids.push(`p${i}`);
    host.emit({ type: 'member_joined', pid: `p${i}` });
  }
  host.addMember({ pid: 'st', role: 'storyteller' });
  host.emit({ type: 'member_joined', pid: 'st' });
  host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
  return { host, world, pids };
}
const phase = (host: FakeHost, p: Ph, prev: Ph | null = null) => host.emit({ type: 'phase_changed', phase: p, prev, phaseEndsAt: null });
const sent = (host: FakeHost, pid: string) => host.sent.get(pid) ?? [];
const teleports = (host: FakeHost, pid: string) => sent(host, pid).filter((m) => m.type === 'world:teleport').map((m) => m.payload as WorldTeleport);
const bld = (id: string) => L.buildings.find((b) => b.id === id)!;
const bed = (seat: number) => tileCenterPx(L, bld(H(seat)).bed!);

/** Advance the world in 50 ms ticks until `done` (or a step limit), checking every position is legal. */
function run(host: FakeHost, world: ReturnType<typeof createWorldModule>, pids: string[], done: () => boolean, maxMs = 120_000) {
  for (let t = 0; t < maxMs; t += 50) {
    if (done()) return t;
    host.clock.now += 50;
    world.tick(50);
    for (const pid of pids) {
      const p = world.positionOf(pid)!;
      expect(isBlockedPx(L, p.x, p.y), `${pid} inside a wall at ${p.x},${p.y}`).toBe(false);
    }
  }
  throw new Error('timed out');
}

describe('nomination circle spots', () => {
  it.each([5, 7, 10, 12, 15])('n=%i: walkable, outdoors, distinct, clockwise from 12 o\'clock', (n) => {
    const seats = Array.from({ length: n }, (_, i) => i);
    const spots = circleSpots(L, seats);
    expect(spots.map((s) => s.seat)).toEqual(seats);
    const c = circleCentre(L);
    let prev = -Infinity;
    for (const s of spots) {
      expect(isBlockedPx(L, s.x, s.y)).toBe(false);
      expect(locationAt(L, s.x, s.y)).toBe('outdoors');
      // angle from north, clockwise (screen coords: y down)
      let a = Math.atan2(s.x - c.x, -(s.y - c.y));
      if (a < -1e-6) a += 2 * Math.PI;
      expect(a).toBeGreaterThan(prev);
      prev = a;
      // reachable from the player spawn
      expect(findPath(L, tileCenterPx(L, L.playerSpawn), s, 'outdoors'), `seat ${s.seat} reachable`).not.toBeNull();
    }
    for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(12);
    // deterministic
    expect(circleSpots(L, [...seats].reverse())).toEqual(spots);
  });
});

describe('A* paths', () => {
  it('every home: outdoors door <-> spawn and interior door <-> bed; each leg is a clear straight segment', () => {
    for (const b of L.buildings) {
      const out = findPath(L, tileCenterPx(L, L.playerSpawn), tileCenterPx(L, b.door), 'outdoors');
      expect(out, `${b.id} door reachable`).not.toBeNull();
      let p = tileCenterPx(L, L.playerSpawn);
      for (const q of out!) {
        expect(segmentClear(L, p.x, p.y, q.x, q.y)).toBe(true);
        p = q;
      }
      if (b.bed) expect(findPath(L, tileCenterPx(L, b.interiorDoor), tileCenterPx(L, b.bed), `bld:${b.id}`)).not.toBeNull();
    }
  });
});

describe('bedtime escort (walking, not teleporting)', () => {
  it('stragglers — one inside another house, one in the street — walk home through the doors; nobody is teleported', () => {
    const { host, world, pids } = setup(5);
    phase(host, 'day');
    world.teleportToBuilding('p0', H(3), 'door'); // p0 is visiting seat 3's cottage
    world.teleportToBuilding('p2', H(2), 'door'); // p2 already home
    const before = new Map(pids.map((p) => [p, teleports(host, p).length]));
    phase(host, 'bedtime', 'day');
    // The bell itself moves nobody.
    for (const p of pids) expect(teleports(host, p).length).toBe(before.get(p));
    expect(world.locationOf('p0')).toBe(`bld:${H(3)}`);
    world.setEscort(true);
    expect(world.snapshotFor('p0').you).toMatchObject({ mode: 'auto', goal: 'home' });
    expect(world.snapshotFor('p2').you).toBeUndefined(); // already home
    expect(world.stageView().players.find((x) => x.seat === 0)!.presence).toBe('escorted');
    // walking speed: never faster than PLAYER_SPEED per tick (door transitions excepted)
    let last = world.positionOf('p1')!;
    let lastLoc = world.locationOf('p1');
    const t = run(host, world, pids, () => {
      const p = world.positionOf('p1')!;
      if (world.locationOf('p1') === lastLoc) expect(Math.hypot(p.x - last.x, p.y - last.y)).toBeLessThanOrEqual(PLAYER_SPEED * 0.05 + 0.01);
      last = p;
      lastLoc = world.locationOf('p1');
      return pids.every((pid) => world.isHome(pid)) && pids.every((pid) => !world.snapshotFor(pid).you);
    });
    expect(t).toBeGreaterThan(1000); // they really walked
    for (const [i, pid] of pids.entries()) {
      expect(world.locationOf(pid)).toBe(`bld:${H(i)}`);
      const tps = teleports(host, pid).slice(before.get(pid));
      expect(tps.every((x) => x.reason === 'door'), `${pid}: only door transitions`).toBe(true);
    }
    // p0 left house-3 then entered house-0, and ended in bed
    expect(teleports(host, 'p0').slice(before.get('p0')).map((x) => x.location)).toEqual(['outdoors', `bld:${H(0)}`]);
    expect(world.positionOf('p0')).toEqual(bed(0));
    // whoever is home stays home during the overtime
    world.teleportToBuilding('p1', H(1), 'door');
    world.handleUseDoor('p1', { buildingId: H(1) });
    expect(world.locationOf('p1')).toBe(`bld:${H(1)}`);
  });

  it('own moves are refused (corrected) while escorted; setEscort(false) hands control back', () => {
    const { host, world } = setup(5);
    phase(host, 'bedtime', 'day');
    world.setEscort(true);
    host.clock.now += 50;
    world.tick(50);
    const p = world.positionOf('p1')!;
    world.handleMove('p1', { seq: 1, x: p.x + 2, y: p.y, facing: 'right', moving: true });
    expect(teleports(host, 'p1').at(-1)).toMatchObject({ reason: 'correction', seq: 1 });
    world.setEscort(false);
    expect(world.snapshotFor('p1').you).toBeUndefined();
    const q = world.positionOf('p1')!;
    host.clock.now += 100;
    world.handleMove('p1', { seq: 2, x: q.x, y: q.y + 3, facing: 'down', moving: true });
    expect(world.positionOf('p1')).toEqual({ x: q.x, y: q.y + 3 });
  });

  it('nightfall: home players walk to bed (no teleport); only someone still en route is teleported', () => {
    const { host, world, pids } = setup(5);
    phase(host, 'day');
    for (const i of [0, 1, 2, 3]) world.teleportToBuilding(`p${i}`, H(i), 'door'); // home, at the interior door
    const n = new Map(pids.map((p) => [p, teleports(host, p).length]));
    phase(host, 'night', 'bedtime'); // forced while p4 is still in the street
    expect(teleports(host, 'p4').at(-1)).toMatchObject({ reason: 'night', location: `bld:${H(4)}`, ...bed(4) });
    for (const i of [0, 1, 2, 3]) {
      expect(teleports(host, `p${i}`).length).toBe(n.get(`p${i}`));
      expect(world.snapshotFor(`p${i}`).you).toMatchObject({ mode: 'auto', goal: 'home' });
    }
    run(host, world, pids, () => [0, 1, 2, 3].every((i) => Math.hypot(world.positionOf(`p${i}`)!.x - bed(i).x, world.positionOf(`p${i}`)!.y - bed(i).y) < 0.01));
    for (const i of [0, 1, 2, 3]) expect(teleports(host, `p${i}`).length).toBe(n.get(`p${i}`));
    // morning: nobody moves
    const m = new Map(pids.map((p) => [p, teleports(host, p).length]));
    phase(host, 'dawn', 'night');
    phase(host, 'day', 'dawn');
    for (const p of pids) expect(teleports(host, p).length).toBe(m.get(p));
  });

  it('night secrecy: other players see nothing of anyone\'s walk to bed; snapshots show only their own home', () => {
    const { host, world, pids } = setup(5);
    phase(host, 'day');
    for (const i of [0, 1, 2, 3, 4]) world.teleportToBuilding(`p${i}`, H(i), 'door');
    phase(host, 'night', 'bedtime');
    for (let k = 0; k < 20; k++) {
      host.clock.now += 50;
      world.tick(50);
      for (const pid of pids) {
        const s = world.snapshotFor(pid);
        expect(s.entities.map((e) => e.id)).toEqual([pid]);
      }
    }
  });
});

describe('Storyteller stage commands', () => {
  it('teleport targets: seat, home, square, storyteller, building, point', () => {
    const { host, world } = setup(7);
    phase(host, 'day');
    const spots = circleSpots(L, [0, 1, 2, 3, 4, 5, 6]);
    expect(world.teleportTo('p3', { kind: 'seat' })).toBeNull();
    expect(world.positionOf('p3')).toEqual({ x: spots[3]!.x, y: spots[3]!.y });
    expect(teleports(host, 'p3').at(-1)!.reason).toBe('storyteller');
    expect(world.teleportTo('p3', { kind: 'home' })).toBeNull();
    expect(world.locationOf('p3')).toBe(`bld:${H(3)}`);
    expect(world.positionOf('p3')).toEqual(bed(3));
    expect(world.teleportTo('p3', { kind: 'square' })).toBeNull();
    expect(world.locationOf('p3')).toBe('outdoors');
    const sq = world.positionOf('p3')!;
    expect(Math.hypot(sq.x - L.square.cx, sq.y - L.square.cy)).toBeLessThan(L.square.r);
    world.teleportToBuilding('st', PUB1, 'storyteller');
    expect(world.teleportTo('p3', { kind: 'storyteller' })).toBeNull();
    expect(world.locationOf('p3')).toBe(`bld:${PUB1}`);
    expect(world.teleportTo('p3', { kind: 'building', buildingId: PUB2 })).toBeNull();
    expect(world.locationOf('p3')).toBe(`bld:${PUB2}`);
    expect(world.teleportTo('p3', { kind: 'building', buildingId: 'nope' })).toMatch(/building/);
    const pt = tileCenterPx(L, L.playerSpawn);
    expect(world.teleportTo('p3', { kind: 'point', x: pt.x, y: pt.y })).toBeNull();
    expect(world.locationOf('p3')).toBe('outdoors');
    expect(world.teleportTo('p3', { kind: 'point', x: 1, y: 1 })).toMatch(/walkable/);
    // only the moved player is told
    for (const other of ['p0', 'p1', 'p2']) expect(teleports(host, other).filter((t) => t.reason === 'storyteller')).toEqual([]);
  });

  it('force seats + presence: seated / walking / home / inside / frozen', () => {
    const { host, world, pids } = setup(5);
    phase(host, 'day');
    world.setCircle([0, 1, 2, 3, 4]);
    for (const p of pids) world.teleportTo(p, { kind: 'seat' });
    expect(world.stageView().players.map((p) => p.presence)).toEqual(['seated', 'seated', 'seated', 'seated', 'seated']);
    world.teleportTo('p1', { kind: 'home' });
    world.teleportTo('p2', { kind: 'building', buildingId: PUB1 });
    world.setFrozen('p3', true);
    const s = world.stageView();
    expect(s.players[1]).toMatchObject({ presence: 'home', building: H(1) });
    expect(s.players[2]).toMatchObject({ presence: 'inside', building: PUB1 });
    expect(s.players[3]).toMatchObject({ presence: 'seated', frozen: true });
    // a seated player stepping more than CIRCLE_SEATED_PX away is no longer seated
    const p0 = world.positionOf('p0')!;
    world.teleportTo('p0', { kind: 'point', x: p0.x + CIRCLE_SEATED_PX + 20, y: p0.y });
    expect(world.stageView().players[0]!.presence).not.toBe('seated');
    // the stage view refresh marks the game dirty (the ST's view is re-sent)
    world.setCircle(null);
    expect(world.stageView().players[4]!.presence).toBe('outdoors');
  });

  it('walk_to: walks at walking speed to the seat; null stops', () => {
    const { host, world, pids } = setup(5);
    phase(host, 'day');
    world.setCircle([0, 1, 2, 3, 4]);
    world.teleportTo('p2', { kind: 'home' });
    expect(world.walkTo('p2', { kind: 'seat' })).toBeNull();
    expect(world.snapshotFor('p2').you).toMatchObject({ mode: 'auto', goal: 'seat' });
    run(host, world, pids, () => world.stageView().players[2]!.presence === 'seated' && !world.snapshotFor('p2').you);
    expect(teleports(host, 'p2').at(-1)!.reason).toBe('door');
    world.walkTo('p2', { kind: 'home' });
    host.clock.now += 50;
    world.tick(50);
    expect(world.walkTo('p2', null)).toBeNull();
    expect(world.snapshotFor('p2').you).toBeUndefined();
  });

  it('freeze: own moves and door use are refused; teleports still apply', () => {
    const { host, world } = setup(5);
    phase(host, 'day');
    world.setFrozen('p1', true);
    expect(world.snapshotFor('p1').you).toEqual({ mode: 'frozen' });
    const p = world.positionOf('p1')!;
    host.clock.now += 200;
    world.handleMove('p1', { seq: 1, x: p.x + 3, y: p.y, facing: 'right', moving: true });
    expect(world.positionOf('p1')).toEqual(p);
    world.teleportToBuilding('p1', H(1), 'door');
    world.handleUseDoor('p1', { buildingId: H(1) });
    expect(world.locationOf('p1')).toBe(`bld:${H(1)}`);
    expect((sent(host, 'p1').filter((m) => m.type === 'error').at(-1)!.payload as { message: string }).message).toMatch(/paused/);
    world.setFrozen('p1', false);
    world.handleUseDoor('p1', { buildingId: H(1) });
    expect(world.locationOf('p1')).toBe('outdoors');
  });

  it('door locks override the phase default in both directions and are public in snapshots', () => {
    const { host, world } = setup(5);
    phase(host, 'day');
    expect(world.setDoorLock(PUB1, true)).toBeNull();
    expect(world.setDoorLock('nope', true)).toMatch(/building/);
    world.teleportTo('p0', { kind: 'point', ...tileCenterPx(L, bld(PUB1).door) });
    world.handleUseDoor('p0', { buildingId: PUB1 });
    expect(world.locationOf('p0')).toBe('outdoors');
    expect(world.snapshotFor('p3').doors).toEqual({ [PUB1]: true });
    world.setDoorLock(PUB1, null);
    world.handleUseDoor('p0', { buildingId: PUB1 });
    expect(world.locationOf('p0')).toBe(`bld:${PUB1}`);
    expect(world.snapshotFor('p3').doors).toBeUndefined();
    // forced open at night: a player may leave their home
    world.teleportToBuilding('p1', H(1), 'door');
    phase(host, 'night', 'bedtime');
    world.teleportToBuilding('p1', H(1), 'door');
    world.handleUseDoor('p1', { buildingId: H(1) });
    expect(world.locationOf('p1')).toBe(`bld:${H(1)}`);
    world.setDoorLock(H(1), false);
    world.handleUseDoor('p1', { buildingId: H(1) });
    expect(world.locationOf('p1')).toBe('outdoors');
  });
});

describe('movement validation under bursty networks', () => {
  /** A straight open stretch of road from the player spawn. */
  function road(world: ReturnType<typeof createWorldModule>) {
    const s = world.positionOf('p0')!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      if (segmentClear(L, s.x, s.y, s.x + dx * 150, s.y + dy * 150)) return { s, dx, dy };
    throw new Error('no straight road near spawn');
  }

  it('a 900 ms stall followed by a catch-up burst of queued moves is accepted (no rubber-band)', () => {
    const { host, world } = setup(5);
    phase(host, 'day');
    const { s, dx, dy } = road(world);
    const v = PLAYER_SPEED * 0.98;
    let seq = 0;
    let t = 0;
    const at = (ms: number) => ({ x: s.x + dx * v * (ms / 1000), y: s.y + dy * v * (ms / 1000) });
    const t0 = host.clock.now;
    // 15 Hz moves: 0.3 s delivered normally, then nothing arrives for 0.9 s, then everything at once
    const send = (ms: number) => world.handleMove('p0', { seq: ++seq, ...at(ms), facing: 'right', moving: true });
    for (; t <= 300; t += 66) {
      host.clock.now = t0 + t + 150;
      send(t);
    }
    host.clock.now = t0 + 1350; // the stall ends: all queued moves arrive in the same instant
    for (; t <= 1300; t += 66) send(t);
    expect(sent(host, 'p0').filter((m) => m.type === 'world:teleport' && (m.payload as WorldTeleport).reason === 'correction')).toEqual([]);
    expect(world.positionOf('p0')).toEqual(at(t - 66));
  });

  it('sustained speed hacks and long jumps are still corrected', () => {
    const { host, world } = setup(5);
    phase(host, 'day');
    const { s, dx, dy } = road(world);
    // 2x walking speed for 3 s: corrected once the burst budget is spent
    let seq = 0;
    for (let ms = 66; ms <= 3000; ms += 66) {
      host.clock.now += 66;
      const k = (PLAYER_SPEED * 2 * ms) / 1000;
      world.handleMove('p0', { seq: ++seq, x: s.x + dx * Math.min(k, 150), y: s.y + dy * Math.min(k, 150), facing: 'right', moving: true });
    }
    expect(teleports(host, 'p0').some((t) => t.reason === 'correction')).toBe(true);
    // a jump far beyond the max burst after a long idle is refused
    host.clock.now += 120_000;
    const p = world.positionOf('p0')!;
    world.handleMove('p0', { seq: ++seq, x: p.x + dx * 400, y: p.y + dy * 400, facing: 'right', moving: true });
    expect(world.positionOf('p0')).toEqual(p);
    expect(PLAYER_SPEED * MOVE_TOLERANCE * 2).toBeLessThan(400);
  });
});

describe('snapshots stay unchanged for others', () => {
  it('a player\'s escort / freeze shows up only in their own snapshot `you`', () => {
    const { host, world } = setup(5);
    phase(host, 'day');
    world.setFrozen('p1', true);
    const s0 = world.snapshotFor('p0') as WorldSnapshot;
    expect(s0.you).toBeUndefined();
    expect(JSON.stringify(s0)).not.toContain('frozen');
    void host;
  });
});

// ---------------------------------------------------------------------------------------------
// Layout-driven validation: everything below derives from the TownLayout contract only (homes via
// houseIndex, doors, beds, the square / circle ring, collision), so a new town layout is validated
// automatically.

describe('layout contract (data-driven over the shipped layout)', () => {
  const homes = L.buildings.filter((b) => b.kind === 'house' && b.houseIndex !== null);
  const seats = homes.map((b) => b.houseIndex!).sort((a, b) => a - b);

  it('every seat (houseIndex) has exactly one home with a walkable bed and visit point inside it', () => {
    expect(seats.length).toBeGreaterThanOrEqual(15);
    for (const seat of seats) {
      const h = homeBuilding(L, seat)!;
      expect(L.buildings.filter((b) => b.kind === 'house' && b.houseIndex === seat)).toHaveLength(1);
      for (const p of [h.bed!, h.visitPoint!, h.interiorDoor]) {
        const c = tileCenterPx(L, p);
        expect(isBlockedPx(L, c.x, c.y), `${h.id} ${p.x},${p.y}`).toBe(false);
        expect(locationAt(L, c.x, c.y)).toBe(`bld:${h.id}`);
      }
    }
  });

  it('every home is reachable from every seat spot (full circle), door to bed included', () => {
    const spots = circleSpots(L, seats);
    for (const h of homes) {
      const door = tileCenterPx(L, h.door);
      for (const s of spots) expect(findPath(L, s, door, 'outdoors'), `seat ${s.seat} spot -> ${h.id} door`).not.toBeNull();
      expect(findPath(L, tileCenterPx(L, h.interiorDoor), tileCenterPx(L, h.bed!), `bld:${h.id}`), `${h.id} door -> bed`).not.toBeNull();
    }
  });

  it('the bedtime escort brings a player home from inside EVERY building', () => {
    for (const b of L.buildings) {
      const { host, world } = setup(5);
      phase(host, 'day');
      world.teleportToBuilding('p0', b.id, 'door');
      const n = teleports(host, 'p0').length;
      phase(host, 'bedtime', 'day');
      world.setEscort(true);
      run(host, world, ['p0'], () => world.isHome('p0') && !world.snapshotFor('p0').you, 180_000);
      // (already home: nobody is moved before the night; from anywhere else the walk ends in bed)
      if (b.id !== H(0)) expect(world.positionOf('p0'), `from ${b.id}`).toEqual(bed(0));
      expect(teleports(host, 'p0').slice(n).every((t) => t.reason === 'door'), `from ${b.id}: only doors`).toBe(true);
    }
  });
});

describe('door tags (public daytime occupancy; never the Storyteller, never at night)', () => {
  const strip = (s: WorldSnapshot) => JSON.stringify(s.doorTags ?? null);

  it('daytime: who is inside each building, identical for every viewer, seat order, ghosts flagged', () => {
    const { host, world, pids } = setup(5);
    phase(host, 'day');
    world.teleportToBuilding('p3', PUB1, 'door');
    world.teleportToBuilding('p1', PUB1, 'door');
    world.teleportToBuilding('p2', H(2), 'door');
    host.emit({ type: 'alive_changed', pid: 'p1', alive: false });
    const views = pids.map((p) => strip(world.snapshotFor(p)));
    expect(new Set(views).size).toBe(1);
    expect(world.snapshotFor('p0').doorTags).toEqual({
      [PUB1]: [
        { pid: 'p1', ghost: true },
        { pid: 'p3', ghost: false },
      ],
      [H(2)]: [{ pid: 'p2', ghost: false }],
    });
    // the Storyteller's own snapshot shows the same public tags
    expect(strip(world.snapshotFor('st'))).toBe(views[0]);
  });

  it('the Storyteller entering a house (day or night) never changes anyone\'s tags', () => {
    for (const ph of ['day', 'night'] as const) {
      const { host, world, pids } = setup(5);
      phase(host, 'day');
      world.teleportToBuilding('p4', PUB1, 'door');
      if (ph === 'night') phase(host, 'night', 'bedtime');
      const before = pids.map((p) => strip(world.snapshotFor(p)));
      world.teleportToBuilding('st', H(2), 'storyteller');
      expect(world.locationOf('st')).toBe(`bld:${H(2)}`);
      expect(pids.map((p) => strip(world.snapshotFor(p)))).toEqual(before);
      for (const p of pids) expect(JSON.stringify(world.snapshotFor(p).doorTags ?? {})).not.toContain('"st"');
      expect(JSON.stringify(world.snapshotFor('st').doorTags ?? {})).not.toContain('"st"');
    }
  });

  it('no tag data at all from bedtime through dawn; back by day; waiting room and setup show them', () => {
    const { host, world, pids } = setup(5);
    for (const p of pids) world.teleportToBuilding(p, H(Number(p.slice(1))), 'door');
    expect(world.snapshotFor('p0').doorTags).toBeDefined(); // after game start, before any phase: like the waiting room
    phase(host, 'setup');
    expect(world.snapshotFor('p0').doorTags).toBeDefined();
    for (const ph of ['bedtime', 'night', 'first_night', 'dawn'] as const) {
      phase(host, ph);
      for (const p of [...pids, 'st']) expect(world.snapshotFor(p).doorTags, `${ph}`).toBeUndefined();
    }
    phase(host, 'day', 'dawn');
    expect(Object.keys(world.snapshotFor('p0').doorTags ?? {})).toHaveLength(5);
  });

  it('the Storyteller setting turns them off and on immediately', () => {
    const { host, world } = setup(5);
    phase(host, 'day');
    world.teleportToBuilding('p0', PUB1, 'door');
    world.applySettings({ ...DEFAULT_ST_SETTINGS, doorTags: false });
    expect(world.snapshotFor('p1').doorTags).toBeUndefined();
    world.applySettings({ ...DEFAULT_ST_SETTINGS, doorTags: true });
    expect(world.snapshotFor('p1').doorTags).toEqual({ [PUB1]: [{ pid: 'p0', ghost: false }] });
  });
});

describe('every move is acked or corrected (B6)', () => {
  it('an in-flight move dropped silently after a teleport gets a late correction once the grace window ends', () => {
    const { host, world } = setup(5);
    phase(host, 'day');
    const p = world.positionOf('p0')!;
    world.teleportTo('p0', { kind: 'square' }); // the server moves p0 (sync)
    host.clock.now += 100;
    world.handleMove('p0', { seq: 7, x: p.x + 2, y: p.y, facing: 'right', moving: true }); // sent before the client knew
    expect(teleports(host, 'p0').filter((t) => t.reason === 'correction')).toEqual([]); // dropped quietly...
    for (let i = 0; i < 40; i++) {
      host.clock.now += 50;
      world.tick(50);
    }
    const c = teleports(host, 'p0').filter((t) => t.reason === 'correction');
    expect(c).toHaveLength(1); // ...but answered once the window is over
    expect(c[0]).toMatchObject({ seq: 7, ...world.positionOf('p0')! });
    expect(world.snapshotFor('p0').ackSeq).toBe(7);
  });
});
