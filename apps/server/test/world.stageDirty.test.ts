// (v3 perf, v3-perf-server; world-art sign-off pending) The Storyteller's stage refresh is targeted and coalesced
// (apps/server/src/world/index.ts STAGE_CHECK_MS / STAGE_WALKING_MS): a presence change re-projects ONLY the
// Storyteller's game view (markGameDirtyFor), structural changes (home / seated / inside / escorted / frozen / doors)
// within STAGE_CHECK_MS, a player merely starting / stopping (walking <-> outdoors) at most every STAGE_WALKING_MS,
// never lost (the latest state always goes out), and never markGameDirty (players' views carry no stage).
import { describe, expect, it } from 'vitest';
import { townLayoutV3 as L } from '@ct/assets/hollowmere';
import { createWorldModule, STAGE_CHECK_MS, STAGE_WALKING_MS } from '../src/world/index.js';
import { createFakeHost } from './helpers/fakeHost.js';

function setup(opts: { st?: boolean; targeted?: boolean } = {}) {
  const host = createFakeHost();
  const world = createWorldModule(host, { layout: L });
  host.setModules({ world });
  const dirtyFor: string[] = [];
  let dirtyAll = 0;
  host.markGameDirty = () => void dirtyAll++;
  if (opts.targeted !== false) host.markGameDirtyFor = (pid) => void dirtyFor.push(pid);
  const pids = ['p0', 'p1', 'p2', 'p3', 'p4'];
  pids.forEach((pid, seat) => {
    host.addMember({ pid, seat });
    host.emit({ type: 'member_joined', pid });
  });
  if (opts.st !== false) {
    host.addMember({ pid: 'st', role: 'storyteller' });
    host.emit({ type: 'member_joined', pid: 'st' });
  }
  host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
  host.emit({ type: 'phase_changed', phase: 'day', prev: 'first_night', phaseEndsAt: null });
  let seq = 0;
  const tick = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      host.clock.now += 50;
      world.tick(50);
    }
  };
  const setMoving = (pid: string, moving: boolean) => {
    const p = world.positionOf(pid)!;
    world.handleMove(pid, { seq: ++seq, x: p.x, y: p.y, facing: 'down', moving });
  };
  return { host, world, dirtyFor, dirtyAll: () => dirtyAll, tick, setMoving };
}

describe('v3 perf: Storyteller stage refresh (targeted + coalesced)', () => {
  it('only the Storyteller is re-projected; a start / stop waits for STAGE_WALKING_MS, then goes out', () => {
    const { world, dirtyFor, dirtyAll, tick, setMoving } = setup();
    tick(50);
    expect(dirtyFor).toEqual(['st']); // first check: initial stage
    tick(STAGE_WALKING_MS + 200);
    expect(dirtyFor).toEqual(['st']); // nothing changed
    setMoving('p1', true);
    tick(STAGE_CHECK_MS + 50);
    expect(dirtyFor.length).toBe(2); // the last send was long ago: goes out at the next check
    setMoving('p1', false);
    setMoving('p2', true);
    tick(STAGE_WALKING_MS - STAGE_CHECK_MS - 100);
    expect(dirtyFor.length).toBe(2); // held back: only walking <-> outdoors flips
    tick(STAGE_CHECK_MS + 150);
    expect(dirtyFor.length).toBe(3); // ... but never lost
    expect(world.stageView().players.find((p) => p.pid === 'p2')!.presence).toBe('walking');
    expect(dirtyAll()).toBe(0);
  });

  it('structural changes (home, frozen) go out within STAGE_CHECK_MS even right after a send', () => {
    const { world, dirtyFor, tick, setMoving } = setup();
    tick(50);
    setMoving('p1', true);
    tick(STAGE_CHECK_MS + 50);
    const n = dirtyFor.length;
    expect(world.teleportTo('p3', { kind: 'home' })).toBeNull();
    tick(STAGE_CHECK_MS + 50);
    expect(dirtyFor.length).toBe(n + 1);
    world.setFrozen('p4', true);
    tick(STAGE_CHECK_MS + 50);
    expect(dirtyFor.length).toBe(n + 2);
    expect(dirtyFor.every((p) => p === 'st')).toBe(true);
  });

  it('no Storyteller seat: nobody is re-projected; a host without markGameDirtyFor falls back to markGameDirty', () => {
    const a = setup({ st: false });
    a.tick(50);
    a.setMoving('p1', true);
    a.tick(STAGE_WALKING_MS + 300);
    expect(a.dirtyFor).toEqual([]);
    expect(a.dirtyAll()).toBe(0);
    const b = setup({ targeted: false });
    b.tick(50);
    expect(b.dirtyAll()).toBe(1);
    b.world.teleportTo('p2', { kind: 'home' });
    b.tick(STAGE_CHECK_MS + 50);
    expect(b.dirtyAll()).toBe(2);
  });
});
