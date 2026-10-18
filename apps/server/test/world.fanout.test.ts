// (v3 perf, v3-perf-server; world-art sign-off pending) world.snapshotFanout() shares the viewer-independent work of
// one 12 Hz snapshot fan-out (rounded entity states, door locks, door tags). Secrecy and behaviour must not change:
// for every viewer, in every phase, the fan-out snapshot is EXACTLY snapshotFor(pid) (same entities, same order,
// same extras), and a fresh fan-out sees state changes made after the previous one.
import { describe, expect, it } from 'vitest';
import { townLayoutV3 as L } from '@ct/assets/hollowmere';
import type { GamePhase } from '@ct/protocol';
import { createWorldModule } from '../src/world/index.js';
import { createFakeHost } from './helpers/fakeHost.js';

function setup() {
  const host = createFakeHost();
  const world = createWorldModule(host, { layout: L });
  host.setModules({ world });
  const pids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  pids.forEach((pid, seat) => {
    host.addMember({ pid, seat });
    host.emit({ type: 'member_joined', pid });
  });
  host.addMember({ pid: 'st', role: 'storyteller' });
  host.emit({ type: 'member_joined', pid: 'st' });
  host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
  let prev: GamePhase = 'first_night';
  const phase = (p: GamePhase) => {
    host.emit({ type: 'phase_changed', phase: p, prev, phaseEndsAt: null });
    prev = p;
  };
  const tick = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      host.clock.now += 50;
      world.tick(50);
    }
  };
  return { host, world, pids, viewers: [...pids, 'st', 'nobody'], phase, tick };
}

function expectSame(world: ReturnType<typeof setup>['world'], viewers: string[], label: string) {
  const fan = world.snapshotFanout!();
  for (const v of viewers) expect(fan(v), `${label}: ${v}`).toEqual(world.snapshotFor(v));
}

describe('v3 perf: snapshotFanout === snapshotFor for every viewer', () => {
  it('day (players inside buildings, a ghost, door locks, a frozen player, a server walk), bedtime, night, dawn', () => {
    const { host, world, viewers, phase, tick } = setup();
    phase('day');
    expectSame(world, viewers, 'day start');
    const houses = L.buildings.filter((b) => b.kind === 'house');
    const pub = L.buildings.find((b) => b.kind !== 'house') ?? houses[0]!;
    world.teleportToBuilding('p1', pub.id, 'door');
    world.teleportToBuilding('p3', pub.id, 'door');
    world.teleportToBuilding('p2', houses[2]!.id, 'door');
    host.emit({ type: 'alive_changed', pid: 'p1', alive: false });
    world.setDoorLock(houses[4]!.id, true);
    world.setDoorLock(houses[5]!.id, false);
    world.setFrozen('p4', true);
    world.walkTo('p5', { kind: 'home' });
    tick(500);
    expectSame(world, viewers, 'day busy');
    expect(world.snapshotFor('p0').doorTags).toBeTruthy();
    expect(world.snapshotFor('p0').doors).toBeTruthy();
    expect(world.snapshotFor('p5').you?.mode).toBe('auto');
    phase('bedtime');
    expectSame(world, viewers, 'bedtime');
    phase('night');
    for (const p of ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']) world.sendHome(p, 'night');
    world.teleportToBuilding('st', houses[3]!.id, 'storyteller');
    expectSame(world, viewers, 'night');
    phase('dawn');
    expectSame(world, viewers, 'dawn');
    phase('day');
    world.setFrozen('p4', false);
    expectSame(world, viewers, 'day again');
  });

  it('a new fan-out sees moves made after the previous one; viewers of one fan-out share the entity objects', () => {
    const { world, viewers, phase } = setup();
    phase('day');
    const a = world.snapshotFanout!();
    const sa0 = a('p0');
    const sa1 = a('p1');
    const e0 = sa0.entities.find((e) => e.id === 'p2');
    const e1 = sa1.entities.find((e) => e.id === 'p2');
    if (e0 && e1) expect(e0).toBe(e1); // shared, read-only
    const p = world.positionOf('p2')!;
    world.handleMove('p2', { seq: 1, x: p.x + 3, y: p.y, facing: 'right', moving: true });
    expectSame(world, viewers, 'after move');
    expect(world.snapshotFanout!()('p2').entities.find((e) => e.id === 'p2')!.facing).toBe(
      world.snapshotFor('p2').entities.find((e) => e.id === 'p2')!.facing,
    );
  });
});
