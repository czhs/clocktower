// v3 WP3 (v3-stage). The time facade's store / events (docs/v3/INTEGRATION.md §3.1 "Time facade"): the
// demo store's contract as createTime uses it, with phase / nominee / seats frozen and a stopped clock.
import { describe, expect, it, vi } from 'vitest';
import { createFacadeEvents, createFacadeStore, FROZEN_KEYS, NO_INPUT, SEAT_COUNT, type StoreEvent } from '../../src/game3d/world/store';

describe('facade store', () => {
  it('starts paused at speed 0 with 15 empty seats, phase day, no nominee', () => {
    const s = createFacadeStore({ timeOfDay: 25.5, quality: 'low' });
    expect(s.state).toMatchObject({ timeOfDay: 1.5, timeSpeed: 0, paused: true, phase: 'day', nominee: null, life: true, quality: 'low', camera: 'follow' });
    expect(s.state.seats).toHaveLength(SEAT_COUNT);
    expect(s.state.seats.every((x) => !x.occupied && !x.dead)).toBe(true);
    expect(Object.isFrozen(s.state)).toBe(true);
    expect(Object.isFrozen(s.state.seats[0])).toBe(true);
  });

  it('set: emits <key> {value, prev, state, source} per changed key, then change; a new frozen snapshot', () => {
    const s = createFacadeStore({ timeOfDay: 10, quality: 'high' });
    const seen: StoreEvent<'timeOfDay'>[] = [];
    const change = vi.fn();
    s.on('timeOfDay', (e: StoreEvent<'timeOfDay'>) => seen.push(e));
    s.on('change', change);
    const before = s.state;
    expect(s.set({ timeOfDay: -1 }, 'game')).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ value: 23, prev: 10, source: 'game' });
    expect(seen[0]!.state).toBe(s.state);
    expect(s.state).not.toBe(before);
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ keys: ['timeOfDay'], source: 'game' }));
  });

  it('unchanged values and unknown keys emit nothing', () => {
    const s = createFacadeStore({ timeOfDay: 10, quality: 'high' });
    const fn = vi.fn();
    s.on('change', fn);
    expect(s.set({ timeOfDay: 10, paused: true })).toBe(false);
    expect(s.set({ bogus: 1 } as never)).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('phase, nominee and seats never change (the game drives the dais directly)', () => {
    const s = createFacadeStore({ timeOfDay: 10, quality: 'high' });
    const fn = vi.fn();
    for (const k of FROZEN_KEYS) s.on(k, fn);
    expect(s.set({ phase: 'vote', nominee: 3, seats: Array.from({ length: 15 }, () => ({ occupied: true })) }, 'time')).toBe(false);
    expect(s.setSeat(2, { occupied: true }, 'time')).toBe(false);
    expect(s.state.phase).toBe('day');
    expect(s.state.nominee).toBe(null);
    expect(s.state.seats[2]!.occupied).toBe(false);
    expect(s.dropped).toBe(4);
    expect(fn).not.toHaveBeenCalled();
  });

  it('on() returns an unsubscribe; validates numbers and booleans', () => {
    const s = createFacadeStore({ timeOfDay: 10, quality: 'high' });
    const fn = vi.fn();
    const off = s.on('timeSpeed', fn);
    s.set({ timeSpeed: 99999 });
    expect(s.state.timeSpeed).toBe(3600);
    off();
    s.set({ timeSpeed: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    s.set({ timeOfDay: 'x' });
    expect(s.state.timeOfDay).toBe(10);
    s.set({ life: 0 });
    expect(s.state.life).toBe(false);
    s.set({ quality: 'ultra' });
    expect(s.state.quality).toBe('high');
  });
});

describe('facade events / input', () => {
  it('a throwing listener does not stop the others', () => {
    const ev = createFacadeEvents();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = vi.fn();
    ev.on('tod', () => {
      throw new Error('boom');
    });
    const off = ev.on('tod', ok);
    ev.emit('tod', { preset: 'night' });
    expect(ok).toHaveBeenCalledWith({ preset: 'night' });
    expect(err).toHaveBeenCalled();
    off();
    ev.emit('tod', {});
    expect(ok).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
  it('input binds no keys', () => {
    const unbind = NO_INPUT.bind();
    expect(typeof unbind).toBe('function');
    expect(unbind()).toBeUndefined();
  });
});
