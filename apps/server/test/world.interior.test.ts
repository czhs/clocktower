// OWNED BY world-art. v2.2 walkable cottage interiors: the shipped rooms are walkable (spawn by the
// interior door, bed / visit spots reachable, furniture and walls collide), moves inside get the same
// validation as outdoors, the night rules still hold (confined to the own home, walk to bed, the
// Storyteller's visit spot), door locks still block, Leave works from anywhere, and positions inside
// a house reach only viewers in that house (also through the compact world:snap2 codec).
import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import {
  isBlockedPx,
  isBlockedTile,
  locationAt,
  SnapshotDecoder,
  SnapshotEncoder,
  tileCenterPx,
  type BuildingDef,
  type WorldSnapshot,
  type WorldTeleport,
} from '@ct/protocol';
import { createWorldModule } from '../src/world/index.js';
import { findPath, type Pt } from '../src/world/path.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

const L = townLayout;
const TS = L.tileSize;
const house = (i: number): BuildingDef => L.buildings.find((b) => b.houseIndex === i)!;
const px = (p: { x: number; y: number }) => tileCenterPx(L, p);

function setup(players = 4) {
  const host = createFakeHost('lobbyInterior');
  const world = createWorldModule(host);
  host.setModules({ world });
  const pids: string[] = [];
  for (let i = 0; i < players; i++) {
    host.addMember({ pid: `p${i}` });
    pids.push(`p${i}`);
    host.emit({ type: 'member_joined', pid: `p${i}` });
  }
  host.addMember({ pid: 'st', role: 'storyteller' });
  host.emit({ type: 'member_joined', pid: 'st' });
  pids.forEach((pid, i) => (host.member(pid)!.seat = i));
  host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
  return { host, world, pids };
}
type Phase = 'setup' | 'first_night' | 'day' | 'bedtime' | 'night' | 'dawn';
const phase = (host: FakeHost, p: Phase) => host.emit({ type: 'phase_changed', phase: p, prev: null, phaseEndsAt: null });
const teleports = (host: FakeHost, pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'world:teleport').map((m) => m.payload as WorldTeleport);
const errors = (host: FakeHost, pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'error').map((m) => m.payload as { code: string; message: string });

/** Walk like a client: moves of <= 12 px every 100 ms along the path to `to`. Returns the corrections received. */
function walk(host: FakeHost, world: ReturnType<typeof createWorldModule>, pid: string, to: Pt, seq0: number, onStep?: () => void): { seq: number; corrections: number } {
  const me = world.positionOf(pid)!;
  const loc = world.locationOf(pid)!;
  const pts = findPath(L, me, to, loc);
  if (!pts) throw new Error(`no path ${JSON.stringify(me)} -> ${JSON.stringify(to)} in ${loc}`);
  const before = teleports(host, pid).filter((t) => t.reason === 'correction').length;
  let seq = seq0;
  let cur = { ...me };
  for (const p of pts) {
    for (;;) {
      const d = Math.hypot(p.x - cur.x, p.y - cur.y);
      if (d < 0.01) break;
      const k = Math.min(1, 12 / d);
      cur = { x: Math.round((cur.x + (p.x - cur.x) * k) * 100) / 100, y: Math.round((cur.y + (p.y - cur.y) * k) * 100) / 100 };
      if (k === 1) cur = { x: p.x, y: p.y };
      host.clock.now += 100;
      world.handleMove(pid, { seq: ++seq, x: cur.x, y: cur.y, facing: 'down', moving: true });
      onStep?.();
    }
  }
  return { seq, corrections: teleports(host, pid).filter((t) => t.reason === 'correction').length - before };
}

describe('v2.2 walkable interiors: the shipped rooms', () => {
  const houses = L.buildings.filter((b) => b.kind === 'house');

  it('has 15 cottages, each a walkable room: door spot, bed and visit spot free, inside, and reachable from the door', () => {
    expect(houses).toHaveLength(15);
    for (const b of houses) {
      const loc = `bld:${b.id}` as const;
      const door = px(b.interiorDoor);
      for (const [what, p] of [['door', door], ['bed', px(b.bed!)], ['visit', px(b.visitPoint!)]] as const) {
        expect(isBlockedPx(L, p.x, p.y), `${b.id} ${what} free`).toBe(false);
        expect(locationAt(L, p.x, p.y), `${b.id} ${what} inside`).toBe(loc);
      }
      expect(findPath(L, door, px(b.bed!), loc), `${b.id}: door -> bed`).not.toBeNull();
      expect(findPath(L, door, px(b.visitPoint!), loc), `${b.id}: door -> visit spot`).not.toBeNull();
      // the doorway (gap in the bottom wall) right below the door spot collides: walking into it = leaving
      expect(isBlockedTile(L, b.interiorDoor.x, b.interiorDoor.y + 1), `${b.id} doorway`).toBe(true);
      // the room has open floor to walk around on, and furniture that collides
      const r = b.interior;
      let free = 0;
      let furniture = 0;
      for (let y = r.y + 2; y < r.y + r.h - 1; y++)
        for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
          if (isBlockedTile(L, x, y)) furniture++;
          else if (findPath(L, door, px({ x, y }), loc)) free++;
        }
      expect(free, `${b.id}: reachable floor tiles`).toBeGreaterThanOrEqual(30);
      expect(furniture, `${b.id}: furniture tiles (bed, table, chairs, …)`).toBeGreaterThanOrEqual(6);
      // the bed itself is solid (you lie down next to it: the bed spot)
      const bedTiles = [0, -1].map((dy) => ({ x: b.bed!.x + (b.bed!.x > r.x + r.w / 2 ? 1 : -1), y: b.bed!.y + dy }));
      for (const t of bedTiles) expect(isBlockedTile(L, t.x, t.y), `${b.id}: bed tile ${t.x},${t.y}`).toBe(true);
    }
  });
});

describe('v2.2 walkable interiors: movement', () => {
  it('enters at the interior door spot, walks to the bed and back with every move accepted', () => {
    const { host, world } = setup();
    phase(host, 'day');
    const b = house(0);
    world.teleportToBuilding('p0', b.id, 'door');
    expect(world.locationOf('p0')).toBe(`bld:${b.id}`);
    expect(world.positionOf('p0')).toEqual(px(b.interiorDoor));
    host.clock.now += 2000;
    let w = walk(host, world, 'p0', px(b.bed!), 0);
    expect(w.corrections).toBe(0);
    expect(world.positionOf('p0')).toEqual(px(b.bed!));
    expect(world.snapshotFor('p0').ackSeq).toBe(w.seq);
    w = walk(host, world, 'p0', px(b.interiorDoor), w.seq);
    expect(w.corrections).toBe(0);
    expect(world.locationOf('p0')).toBe(`bld:${b.id}`);
  });

  it('rejects walking through furniture / walls, speed hacks and moves into another place with corrections', () => {
    const { host, world } = setup();
    phase(host, 'day');
    const b = house(0);
    const r = b.interior;
    world.teleportToBuilding('p0', b.id, 'door');
    const door = px(b.interiorDoor);
    const corr = () => teleports(host, 'p0').filter((t) => t.reason === 'correction').length;
    let c = corr();
    // a speed hack across the room right after coming in (budget 0)
    host.clock.now += 100;
    world.handleMove('p0', { seq: 1, x: door.x, y: door.y - 4 * TS, facing: 'up', moving: true });
    expect(world.positionOf('p0')).toEqual(door);
    expect(corr()).toBe(++c);
    host.clock.now += 2000;
    // stand on the floor right below the table (house-0 is not mirrored: table at dx 5..6, dy 4)
    expect(isBlockedTile(L, r.x + 5, r.y + 4)).toBe(true);
    let { seq } = walk(host, world, 'p0', px({ x: r.x + 5, y: r.y + 5 }), 1);
    const at = world.positionOf('p0')!;
    host.clock.now += 2000;
    world.handleMove('p0', { seq: ++seq, x: at.x, y: at.y - 12, facing: 'up', moving: true }); // into the table
    expect(world.positionOf('p0')).toEqual(at);
    expect(corr()).toBe(++c);
    // into the bottom wall's doorway (it collides: leaving is a door use, not a move)
    seq = walk(host, world, 'p0', door, seq).seq;
    host.clock.now += 2000;
    world.handleMove('p0', { seq: ++seq, x: door.x, y: door.y + 10, facing: 'down', moving: true });
    expect(world.positionOf('p0')).toEqual(door);
    expect(corr()).toBe(++c);
    // straight out of the room into the neighbouring cottage / the town: never by moving
    const next = house(1);
    for (const p of [px(next.interiorDoor), px(b.door)]) {
      host.clock.now += 60_000;
      world.handleMove('p0', { seq: ++seq, x: p.x, y: p.y, facing: 'right', moving: true });
      expect(world.locationOf('p0')).toBe(`bld:${b.id}`);
      expect(corr()).toBe(++c);
    }
  });

  it('Leave works from anywhere in the room (back on the outdoor doorstep)', () => {
    const { host, world } = setup();
    phase(host, 'day');
    const b = house(2);
    world.teleportToBuilding('p2', b.id, 'door');
    host.clock.now += 2000;
    walk(host, world, 'p2', px(b.visitPoint!), 0);
    world.handleUseDoor('p2', { buildingId: b.id });
    expect(world.locationOf('p2')).toBe('outdoors');
    expect(world.positionOf('p2')).toEqual(px(b.door));
    expect(teleports(host, 'p2').at(-1)!.reason).toBe('door');
  });

  it('door locks still block: a Storyteller-locked cottage keeps its guests in, opening lets them out', () => {
    const { host, world } = setup();
    phase(host, 'day');
    const b = house(1);
    world.teleportToBuilding('p0', b.id, 'door');
    host.clock.now += 2000;
    walk(host, world, 'p0', px(b.bed!), 0);
    expect(world.setDoorLock(b.id, true)).toBeNull();
    walk(host, world, 'p0', px(b.interiorDoor), 100);
    world.handleUseDoor('p0', { buildingId: b.id });
    expect(world.locationOf('p0')).toBe(`bld:${b.id}`);
    expect(errors(host, 'p0').at(-1)).toMatchObject({ code: 'phase', message: 'The door is locked.' });
    world.setDoorLock(b.id, null);
    world.handleUseDoor('p0', { buildingId: b.id });
    expect(world.locationOf('p0')).toBe('outdoors');
  });
});

describe('v2.2 walkable interiors: the night', () => {
  it('nightfall walks a player who is home (anywhere in the room) to bed; then they may walk about at home but not leave', () => {
    const { host, world } = setup();
    phase(host, 'day');
    const b = house(3);
    world.teleportToBuilding('p3', b.id, 'door');
    host.clock.now += 2000;
    const w = walk(host, world, 'p3', px({ x: b.interior.x + 5, y: b.interior.y + 6 }), 0);
    phase(host, 'night');
    const s = world.snapshotFor('p3');
    expect(s.you).toMatchObject({ mode: 'auto', goal: 'home' });
    // no teleport: a walk inside the room
    expect(teleports(host, 'p3').filter((t) => t.reason === 'night' || t.reason === 'bedtime')).toEqual([]);
    for (let i = 0; i < 100 && world.snapshotFor('p3').you; i++) {
      host.clock.now += 50;
      world.tick(50);
    }
    expect(world.snapshotFor('p3').you).toBeUndefined();
    expect(world.positionOf('p3')).toEqual(px(b.bed!));
    expect(world.isHome('p3')).toBe(true);
    // free to walk about at home
    host.clock.now += 2000;
    const w2 = walk(host, world, 'p3', px(b.interiorDoor), w.seq + 10);
    expect(w2.corrections).toBe(0);
    expect(world.isHome('p3')).toBe(true);
    // but not out: neither through the door nor by a move
    world.handleUseDoor('p3', { buildingId: b.id });
    expect(world.locationOf('p3')).toBe(`bld:${b.id}`);
    expect(errors(host, 'p3').at(-1)!.code).toBe('phase');
    host.clock.now += 60_000;
    world.handleMove('p3', { seq: w2.seq + 1, x: px(b.door).x, y: px(b.door).y, facing: 'down', moving: true });
    expect(world.locationOf('p3')).toBe(`bld:${b.id}`);
  });

  it('a player still outdoors at nightfall is put straight into bed (the one allowed teleport)', () => {
    const { host, world } = setup();
    phase(host, 'day');
    phase(host, 'night');
    const t = teleports(host, 'p1').at(-1)!;
    expect(t.reason).toBe('night');
    expect({ x: t.x, y: t.y, location: t.location }).toEqual({ ...px(house(1).bed!), location: `bld:${house(1).id}` });
  });

  it('the Storyteller arrives at the visit spot (one location change), walks about inside, and only that home sees it', () => {
    const { host, world } = setup();
    phase(host, 'night');
    for (let i = 0; i < 40; i++) {
      host.clock.now += 50;
      world.tick(50);
    }
    const b = house(0);
    world.teleportToBuilding('st', b.id, 'storyteller');
    expect(world.positionOf('st')).toEqual(px(b.visitPoint!));
    const visits = () => host.events.filter((e) => e.type === 'location_changed' && e.pid === 'st' && e.location === `bld:${b.id}`).length;
    expect(visits()).toBe(1);
    host.clock.now += 2000;
    const w = walk(host, world, 'st', px({ x: b.interior.x + 5, y: b.interior.y + 6 }), 0);
    expect(w.corrections).toBe(0);
    expect(visits()).toBe(1); // walking inside is not a new visit
    const stIn = (pid: string) => world.snapshotFor(pid).entities.find((e) => e.id === 'st');
    expect(stIn('p0')).toMatchObject({ ...world.positionOf('st'), location: `bld:${b.id}` });
    for (const pid of ['p1', 'p2', 'p3']) expect(stIn(pid), pid).toBeUndefined();
  });
});

describe('v2.2 walkable interiors: visibility', () => {
  it('positions inside a house go only to viewers in that house (and the Storyteller), day and night', () => {
    const { host, world } = setup();
    phase(host, 'day');
    const h0 = house(0);
    world.teleportToBuilding('p0', h0.id, 'door');
    world.teleportToBuilding('p1', h0.id, 'door');
    world.teleportToBuilding('p2', house(2).id, 'door'); // another cottage; p3 stays outdoors
    host.clock.now += 2000;
    const seen: Record<string, WorldSnapshot[]> = { p1: [], p2: [], p3: [], st: [] };
    const target = px(h0.bed!);
    const w = walk(host, world, 'p0', target, 0, () => {
      for (const v of Object.keys(seen)) seen[v]!.push(world.snapshotFor(v));
    });
    expect(w.corrections).toBe(0);
    expect(world.positionOf('p0')).toEqual(target);
    expect(seen.p1!.length).toBeGreaterThan(3);
    const p0In = (s: WorldSnapshot) => s.entities.find((e) => e.id === 'p0');
    expect(seen.p1!.at(-1) && p0In(seen.p1!.at(-1)!)).toMatchObject({ ...target, location: `bld:${h0.id}` });
    expect(seen.st!.at(-1) && p0In(seen.st!.at(-1)!)).toMatchObject(target);
    for (const v of ['p2', 'p3']) for (const s of seen[v]!) expect(p0In(s), v).toBeUndefined();
    // another cottage's guest and the town learn nothing from the walk: their snapshots never change
    // (only the PUBLIC daytime door tags say who is inside house-0, and those do not move)
    for (const v of ['p2', 'p3']) for (const s of seen[v]!) expect({ ...s, t: 0 }, v).toEqual({ ...seen[v]![0]!, t: 0 });
  });

  it('world:snap2 carries interior coordinates exactly (the far end of the interiors band too)', () => {
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    const far = L.buildings.reduce((a, b) => (b.interior.x > a.interior.x ? b : a));
    const snaps: WorldSnapshot[] = [];
    for (let i = 0; i < 30; i++) {
      const x = Math.round(((far.interior.x + far.interior.w - 1) * TS - 0.3 * i) * 10) / 10;
      const y = Math.round(((far.interior.y + far.interior.h - 1) * TS - 1.7 * i) * 10) / 10;
      snaps.push({ t: 1_000_000 + i * 83, ackSeq: i, entities: [{ id: 'me', x, y, facing: 'up', moving: true, location: `bld:${far.id}` }, { id: 'a', x: 7.3, y: 3.1, facing: 'down', moving: false, location: `bld:${far.id}` }] });
    }
    for (const s of snaps) {
      const f = enc.encode(s);
      if (!f) continue;
      expect(dec.decode(JSON.parse(JSON.stringify(f)))).toEqual(s);
    }
    expect((far.interior.x + far.interior.w) * TS).toBeGreaterThan(1600); // well beyond the town (the range is not capped)
  });
});
