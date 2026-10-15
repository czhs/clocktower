// OWNED BY server-v2. Storyteller click-to-teleport ('teleport_self', v2) on the shipped layout:
// world placement (point -> nearest free OUTDOOR spot, building -> visit point), authorisation, and
// the secrecy rules: players learn nothing they could not already see (same location only; at night
// only the visited player), and a teleport into a home at night registers as a visit exactly like
// visit_home (real GameModule + WorldModule wired through the fake host).
import { describe, expect, it } from 'vitest';
import { townLayout as L } from '@ct/assets';
import {
  homeBuilding,
  isBlockedPx,
  locationAt,
  tileCenterPx,
  type CharacterId,
  type PlayerGameView,
  type StCommand,
  type StorytellerGameView,
  type WorldSnapshot,
  type WorldTeleport,
} from '@ct/protocol';
import { createGameModule } from '../src/game/index.js';
import { createWorldModule } from '../src/world/index.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

const H = (seat: number) => homeBuilding(L, seat)!.id;
const visitPx = (seat: number) => tileCenterPx(L, homeBuilding(L, seat)!.visitPoint!);
const teleports = (host: FakeHost, pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'world:teleport').map((m) => m.payload as WorldTeleport);
const ids = (s: WorldSnapshot) => s.entities.map((e) => e.id).sort();

function worldOnly(n = 5) {
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
  return { host, world, pids };
}

const CHARS: CharacterId[] = ['imp', 'poisoner', 'washerwoman', 'empath', 'fortune_teller', 'monk', 'butler', 'ravenkeeper'];

/** Real game + world modules on one fake host (what the GameRoom wires together). */
function rig(n = 8) {
  const host = createFakeHost('lobbyA');
  host.addMember({ pid: 'st', role: 'storyteller', displayName: 'Teller' });
  for (let i = 0; i < n; i++) host.addMember({ pid: `p${i}`, seat: i, displayName: `Player${i + 1}` });
  const game = createGameModule(host, { seed: 42, voteStepMs: 100, bedtimeSeconds: 30, nightfallGraceMs: 0 });
  const world = createWorldModule(host);
  host.setModules({ game, world });
  for (const m of host.members()) host.emit({ type: 'member_joined', pid: m.pid });
  host.emit({ type: 'role_changed', pid: 'st', role: 'storyteller' });
  const seats = Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, seat: i }));
  host.emit({ type: 'game_started', seats, storytellerPid: 'st' });
  game.start(
    seats.map((s) => ({ ...s, name: `Player${s.seat + 1}` })),
    'st',
  );
  const st = (cmd: StCommand) => {
    host.clock.now += 50;
    const before = (host.sent.get('st') ?? []).length;
    game.handleStoryteller('st', cmd);
    const errs = (host.sent.get('st') ?? []).slice(before).filter((m) => m.type === 'error');
    if (errs.length) throw new Error(`st ${cmd.type}: ${JSON.stringify(errs[0]!.payload)}`);
  };
  const stView = () => game.viewFor('st') as StorytellerGameView;
  const view = (seat: number) => game.viewFor(`p${seat}`) as PlayerGameView;
  const firstNight = () => {
    st({ type: 'assign_characters', assignments: CHARS.slice(0, n).map((character, seat) => ({ seat, character })), redHerringSeat: 2, demonBluffs: ['chef', 'mayor', 'saint'] });
    st({ type: 'begin_first_night' });
    // let everyone finish the short walk to bed (players already home at nightfall walk, never teleport)
    for (let i = 0; i < 100; i++) {
      host.clock.now += 50;
      world.tick(50);
    }
  };
  return { host, game, world, st, stView, view, firstNight };
}

describe('teleport_self: world placement', () => {
  it('a point: the nearest free OUTDOOR spot; reason storyteller; only the Storyteller is told', () => {
    const { host, world, pids } = worldOnly();
    const target = tileCenterPx(L, L.playerSpawn);
    expect(world.teleportSelf('st', { kind: 'point', x: target.x + 3, y: target.y })).toBeNull();
    expect(world.positionOf('st')).toEqual({ x: target.x + 3, y: target.y });
    expect(world.locationOf('st')).toBe('outdoors');
    expect(teleports(host, 'st').at(-1)).toMatchObject({ reason: 'storyteller', location: 'outdoors', x: target.x + 3, y: target.y });
    for (const p of pids) expect(teleports(host, p).filter((t) => t.reason === 'storyteller')).toEqual([]);
    // a click on a cottage roof / a wall snaps to the nearest free outdoor spot
    for (const b of L.buildings) {
      const fp = b.footprint;
      const roof = { x: (fp.x + fp.w / 2) * L.tileSize, y: (fp.y + fp.h / 2) * L.tileSize };
      expect(world.teleportSelf('st', { kind: 'point', ...roof }), b.id).toBeNull();
      const p = world.positionOf('st')!;
      expect(isBlockedPx(L, p.x, p.y), `${b.id} roof click`).toBe(false);
      expect(world.locationOf('st')).toBe('outdoors');
      expect(Math.hypot(p.x - roof.x, p.y - roof.y)).toBeLessThanOrEqual(48);
    }
  });

  it('a point can never land inside an interior; errors leave the Storyteller where they were', () => {
    const { world } = worldOnly();
    const before = world.positionOf('st');
    const b = L.buildings[0]!;
    const inRoom = tileCenterPx(L, b.bed!);
    expect(world.teleportSelf('st', { kind: 'point', ...inRoom })).toMatch(/town/);
    expect(world.teleportSelf('st', { kind: 'point', x: 4000, y: 4000 })).toMatch(/town/);
    expect(world.positionOf('st')).toEqual(before);
    expect(world.locationOf('st')).toBe('outdoors');
    expect(world.teleportSelf('st', { kind: 'building', buildingId: 'nope' })).toMatch(/building/);
    expect(world.positionOf('st')).toEqual(before);
  });

  it('a building: inside it at the visit point (same as visit_home)', () => {
    const { host, world } = worldOnly();
    for (const b of L.buildings) {
      expect(world.teleportSelf('st', { kind: 'building', buildingId: b.id })).toBeNull();
      expect(world.locationOf('st')).toBe(`bld:${b.id}`);
      expect(world.positionOf('st')).toEqual(tileCenterPx(L, b.visitPoint ?? b.interiorDoor));
      expect(locationAt(L, world.positionOf('st')!.x, world.positionOf('st')!.y)).toBe(`bld:${b.id}`);
    }
    expect(host.events.filter((e) => e.type === 'location_changed' && e.pid === 'st').length).toBeGreaterThanOrEqual(L.buildings.length);
    // and back out by clicking the square
    expect(world.teleportSelf('st', { kind: 'point', x: L.square.cx, y: L.square.cy })).toBeNull();
    expect(world.locationOf('st')).toBe('outdoors');
  });

  it('players cannot use it on themselves', () => {
    const { world } = worldOnly();
    const before = world.positionOf('p0');
    expect(world.teleportSelf('p0', { kind: 'building', buildingId: H(3) })).toMatch(/Storyteller/);
    expect(world.teleportSelf('p0', { kind: 'point', x: L.square.cx, y: L.square.cy })).toMatch(/Storyteller/);
    expect(world.positionOf('p0')).toEqual(before);
  });

  it('day: only players in the same location see the Storyteller arrive or leave', () => {
    const { host, world, pids } = worldOnly();
    pids.forEach((pid, seat) => host.member(pid)!.seat = seat);
    host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
    host.emit({ type: 'phase_changed', phase: 'day', prev: null, phaseEndsAt: null });
    world.teleportToBuilding('p1', H(1), 'door'); // p1 at home, p0 outdoors
    expect(world.teleportSelf('st', { kind: 'building', buildingId: H(3) })).toBeNull();
    expect(ids(world.snapshotFor('p0'))).not.toContain('st');
    expect(ids(world.snapshotFor('p1'))).not.toContain('st');
    expect(world.teleportSelf('st', { kind: 'building', buildingId: H(1) })).toBeNull();
    expect(ids(world.snapshotFor('p1'))).toContain('st');
    expect(ids(world.snapshotFor('p0'))).not.toContain('st');
    // the Storyteller never appears on door tags
    expect(JSON.stringify(world.snapshotFor('p0').doorTags ?? {})).not.toContain('"st"');
  });
});

describe('teleport_self through the game module (st:command)', () => {
  it('only the seated Storyteller; logged by type only; works before the game starts', () => {
    const host = createFakeHost();
    const world = createWorldModule(host);
    const game = createGameModule(host);
    host.setModules({ game, world });
    host.addMember({ pid: 'st', role: 'storyteller' });
    host.addMember({ pid: 'p0' });
    host.emit({ type: 'member_joined', pid: 'st' });
    host.emit({ type: 'member_joined', pid: 'p0' });
    // waiting lobby (no game state): the Storyteller may still move around town
    game.handleStoryteller('st', { type: 'teleport_self', to: { kind: 'building', buildingId: H(2) } });
    expect(world.locationOf('st')).toBe(`bld:${H(2)}`);
    game.handleStoryteller('p0', { type: 'teleport_self', to: { kind: 'building', buildingId: H(2) } });
    expect(world.locationOf('p0')).toBe('outdoors');
    expect((host.sent.get('p0') ?? []).filter((m) => m.type === 'error').map((m) => (m.payload as { code: string }).code)).toEqual(['forbidden']);
    game.handleStoryteller('st', { type: 'teleport_self', to: { kind: 'building', buildingId: 'nope' } });
    expect((host.sent.get('st') ?? []).filter((m) => m.type === 'error').map((m) => (m.payload as { code: string }).code)).toEqual(['invalid']);
  });

  it('night: a teleport into a home registers as the visit (checklist + visited player only); leaving clears it', () => {
    const r = rig();
    r.firstNight();
    expect(r.game.phase()).toBe('first_night');
    const empathStep = () => r.stView().nightQueue.find((s) => s.character === 'empath')!;
    expect(empathStep().status).toBe('pending');
    r.st({ type: 'teleport_self', to: { kind: 'building', buildingId: H(3) } });
    expect(r.world.locationOf('st')).toBe(`bld:${H(3)}`);
    expect(r.world.positionOf('st')).toEqual(visitPx(3));
    expect(r.stView().visitingSeat).toBe(3);
    expect(empathStep().status).toBe('visiting');
    expect(r.view(3).storytellerVisitingYou).toBe(true);
    for (const seat of [0, 1, 2, 4, 5, 6, 7]) expect(r.view(seat).storytellerVisitingYou).toBe(false);
    // only the visited player sees the Storyteller; the visit cue goes to them only
    for (let seat = 0; seat < 8; seat++) expect(ids(r.world.snapshotFor(`p${seat}`)).includes('st')).toBe(seat === 3);
    for (let seat = 0; seat < 8; seat++)
      expect((r.host.sent.get(`p${seat}`) ?? []).some((m) => m.type === 'sound' && (m.payload as { cue: string }).cue === 'visit')).toBe(seat === 3);
    // hopping straight to another home moves the visit
    r.st({ type: 'teleport_self', to: { kind: 'building', buildingId: H(5) } });
    expect(r.stView().visitingSeat).toBe(5);
    expect(empathStep().status).toBe('pending');
    expect(r.view(3).storytellerVisitingYou).toBe(false);
    expect(r.view(5).storytellerVisitingYou).toBe(true);
    // clicking outdoors ends the visit; outdoors at night nobody sees the Storyteller
    r.st({ type: 'teleport_self', to: { kind: 'point', x: L.square.cx, y: L.square.cy } });
    expect(r.world.locationOf('st')).toBe('outdoors');
    expect(r.stView().visitingSeat).toBeNull();
    for (let seat = 0; seat < 8; seat++) expect(ids(r.world.snapshotFor(`p${seat}`))).toEqual([`p${seat}`]);
  });

  it("night secrecy: player A's byte stream does not depend on where the Storyteller teleports", () => {
    const stream = (moves: StCommand[]) => {
      const r = rig();
      r.firstNight();
      for (const m of moves) r.st(m);
      r.host.clock.now += 500;
      const out: unknown[] = [];
      for (const seat of [0, 1]) out.push(r.host.sent.get(`p${seat}`), { ...r.world.snapshotFor(`p${seat}`), t: 0 }, r.game.viewFor(`p${seat}`));
      return JSON.stringify(out);
    };
    const tp = (to: Extract<StCommand, { type: 'teleport_self' }>['to']): StCommand => ({ type: 'teleport_self', to });
    const base = stream([]);
    expect(stream([tp({ kind: 'building', buildingId: H(4) })])).toBe(base);
    expect(stream([tp({ kind: 'building', buildingId: H(6) }), tp({ kind: 'building', buildingId: H(2) })])).toBe(base);
    expect(stream([tp({ kind: 'point', x: L.square.cx, y: L.square.cy }), tp({ kind: 'building', buildingId: H(12) })])).toBe(base);
    // sanity: visiting player 1 IS visible to player 1
    expect(stream([tp({ kind: 'building', buildingId: H(1) })])).not.toBe(base);
  });
});
