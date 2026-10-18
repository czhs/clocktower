// v3 WP3 (v3-stage). Door swings only from players going through doors; boarded (unused) cottages.
import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import type { LocationId } from '@ct/protocol';
import { boardedHouses, createBoardDriver, createDoorDriver, DOOR_OPEN_S, DOOR_SWING_S, doorOpenAt, houseIdOf } from '../../src/game3d/world/doors';
import type { Pose } from '../../src/game3d/contract';

const pose = (pid: string, location: LocationId): Pose => ({ pid, x: 0, y: 0, location, facing: 'down', moving: false });
const st = (me: Pose | null, ...remotes: Pose[]) => ({ me, remotes: new Map(remotes.map((p) => [p.pid, p])) });

describe('door swing curve', () => {
  it('opens over 300 ms, holds, closes, ends shut', () => {
    expect(doorOpenAt(0)).toBe(0);
    expect(doorOpenAt(DOOR_OPEN_S / 2)).toBeCloseTo(0.5, 9);
    expect(doorOpenAt(DOOR_OPEN_S)).toBe(1);
    expect(doorOpenAt(DOOR_OPEN_S + 0.5)).toBe(1);
    expect(doorOpenAt(DOOR_SWING_S)).toBe(0);
    expect(doorOpenAt(99)).toBe(0);
  });
  it('houseIdOf', () => {
    expect(houseIdOf('bld:house-12')).toBe('house-12');
    expect(houseIdOf('outdoors')).toBe(null);
    expect(houseIdOf('bld:tavern')).toBe(null);
  });
});

describe('door driver', () => {
  it('no door moves without somebody going through it (first sight, standing still, interior to interior)', () => {
    const writes: [string, number][] = [];
    const d = createDoorDriver((id, f) => writes.push([id, f]));
    d.observe(st(pose('me', 'bld:house-3'), pose('a', 'outdoors')), 0); // first sight: nothing
    d.observe(st(pose('me', 'bld:house-3'), pose('a', 'outdoors')), 1);
    d.observe(st(pose('me', 'bld:house-4'), pose('a', 'outdoors')), 2); // a teleport between rooms: no door used
    for (let t = 0; t < 5; t += 0.05) d.tick(t);
    expect(writes).toEqual([]);
    expect(d.open()).toEqual([]);
  });

  it('a remote entering and the own player leaving swing that house door open and shut again', () => {
    const writes: [string, number][] = [];
    const d = createDoorDriver((id, f) => writes.push([id, f]));
    d.observe(st(pose('me', 'bld:house-5'), pose('a', 'outdoors')), 0);
    d.observe(st(pose('me', 'outdoors'), pose('a', 'bld:house-2')), 1);
    for (let t = 1; t <= 1 + DOOR_SWING_S + 0.1; t += 1 / 60) d.tick(t);
    const ids = new Set(writes.map(([id]) => id));
    expect([...ids].sort()).toEqual(['house-2', 'house-5']);
    for (const id of ids) {
      const fs = writes.filter(([x]) => x === id).map(([, f]) => f);
      expect(Math.max(...fs)).toBe(1);
      expect(fs[fs.length - 1]).toBe(0);
    }
    expect(d.writes.get('house-5')).toBeGreaterThan(2);
    expect(d.open()).toEqual([]);
  });

  it('a second pass during a swing keeps the door open instead of closing it first', () => {
    const writes: number[] = [];
    const d = createDoorDriver((_, f) => writes.push(f));
    d.trigger('house-1', 0);
    for (let t = 0; t < 1.36; t += 0.02) d.tick(t);
    expect(writes[writes.length - 1]).toBeLessThan(1); // closing
    d.trigger('house-1', 1.36);
    d.tick(1.4);
    expect(writes[writes.length - 1]).toBe(1);
    expect(writes).not.toContain(0);
  });

  it('forgets players who left (a rejoin is a first sight again)', () => {
    const writes: string[] = [];
    const d = createDoorDriver((id) => writes.push(id));
    d.observe(st(null, pose('a', 'outdoors')), 0);
    d.observe(st(null), 1);
    d.observe(st(null, pose('a', 'bld:house-0')), 2);
    for (let t = 2; t < 4; t += 0.1) d.tick(t);
    expect(writes).toEqual([]);
  });
});

describe('boarded cottages', () => {
  it('waiting room: no house is boarded; in a game, every house without a seated player is', () => {
    expect(boardedHouses(townLayout, null).size).toBe(0);
    const b = boardedHouses(townLayout, { players: [{ seat: 0 }, { seat: 1 }, { seat: 4 }] });
    const houses = townLayout.buildings.filter((x) => /^house-\d+$/.test(x.id));
    expect(b.size).toBe(houses.length - 3);
    for (const h of houses) expect(b.has(h.id)).toBe(![0, 1, 4].includes(h.houseIndex!));
  });
  it('board driver applies only changes', () => {
    const calls: [string, boolean][] = [];
    const d = createBoardDriver(['house-0', 'house-1', 'house-2'], (id, on) => calls.push([id, on]));
    d.apply(new Set(['house-1']));
    d.apply(new Set(['house-1']));
    d.apply(new Set(['house-2']));
    expect(calls).toEqual([
      ['house-1', true],
      ['house-1', false],
      ['house-2', true],
    ]);
    expect([...d.boarded]).toEqual(['house-2']);
  });
});
