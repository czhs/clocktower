// v3 WP3 (v3-stage). Phase -> hour (docs/v3/INTEGRATION.md §3.1) and the shown-hour easing.
import { describe, expect, it } from 'vitest';
import type { DayClockView } from '@ct/protocol';
import { clockProgress, createHourClock, darkness, DAWN_EASE_MS, EASE_MS, hourDelta, stageHour, type HourInput } from '../../src/game3d/world/hour';

const NOW = 1_000_000;
const clock = (o: Partial<DayClockView>): DayClockView => ({ stage: 'discussion', endsAt: null, remainingMs: null, paused: false, totalMs: 60_000, ...o });
const at = (o: Partial<HourInput>): number => stageHour({ phase: 'day', serverNow: NOW, sincePhaseMs: 0, ...o });

describe('clockProgress', () => {
  it('running: 1 − (endsAt − now) / total, clamped', () => {
    expect(clockProgress(clock({ endsAt: NOW + 45_000 }), NOW)).toBeCloseTo(0.25, 9);
    expect(clockProgress(clock({ endsAt: NOW - 5_000 }), NOW)).toBe(1);
    expect(clockProgress(clock({ endsAt: NOW + 90_000 }), NOW)).toBe(0);
  });
  it('paused: 1 − remaining / total', () => {
    expect(clockProgress(clock({ paused: true, remainingMs: 15_000 }), NOW)).toBeCloseTo(0.75, 9);
  });
  it('no clock / no countdown / zero total: 0', () => {
    expect(clockProgress(null, NOW)).toBe(0);
    expect(clockProgress(clock({}), NOW)).toBe(0);
    expect(clockProgress(clock({ totalMs: 0, endsAt: NOW }), NOW)).toBe(0);
  });
});

describe('stageHour (§3.1 table)', () => {
  it('waiting and setup: 10:00', () => {
    expect(at({ phase: 'waiting' })).toBe(10);
    expect(at({ phase: 'setup' })).toBe(10);
  });
  it('day discussion: 11:00 + 4·p (running clock)', () => {
    expect(at({ clock: clock({ endsAt: NOW + 30_000 }) })).toBeCloseTo(13, 9);
    expect(at({ clock: clock({ endsAt: NOW }) })).toBeCloseTo(15, 9);
  });
  it('day nominations: 15:00 + 3·p (paused clock)', () => {
    expect(at({ clock: clock({ stage: 'nominations', paused: true, remainingMs: 20_000 }) })).toBeCloseTo(17, 9);
  });
  it('day without a clock holds the stage start hour (11:00, 15:00 once nominations are open)', () => {
    expect(at({ clock: null })).toBe(11);
    expect(at({ clock: null, nominationsOpen: true })).toBe(15);
  });
  it('bedtime: 18:30 + 1.25·p (→ 19:45)', () => {
    expect(at({ phase: 'bedtime' })).toBe(18.5);
    expect(at({ phase: 'bedtime', clock: clock({ stage: 'bedtime', endsAt: NOW }) })).toBeCloseTo(19.75, 9);
  });
  it('nights: 23:00 fixed', () => {
    expect(at({ phase: 'night', clock: clock({ endsAt: NOW }) })).toBe(23);
    expect(at({ phase: 'first_night' })).toBe(23);
  });
  it('dawn: 06:15 -> 08:00 over a 20 s client ease from phase entry', () => {
    expect(at({ phase: 'dawn', sincePhaseMs: 0 })).toBeCloseTo(6.25, 9);
    expect(at({ phase: 'dawn', sincePhaseMs: DAWN_EASE_MS / 2 })).toBeCloseTo(7.125, 9);
    expect(at({ phase: 'dawn', sincePhaseMs: DAWN_EASE_MS * 3 })).toBeCloseTo(8, 9);
  });
  it('finished: 12:30', () => {
    expect(at({ phase: 'finished' })).toBe(12.5);
  });
});

describe('hour clock', () => {
  it('follows small moves directly, eases jumps > 1 h over 1.5 s', () => {
    const c = createHourClock(11);
    expect(c.step(11.5, 0, false)).toBe(11.5);
    expect(c.easing).toBe(false);
    expect(c.step(12.4, 0, false)).toBeCloseTo(12.4, 9); // <= 1 h: still direct
    // bedtime -> night: a 3.5 h jump eases
    const b = createHourClock(19.5);
    expect(b.step(23, 1000, false)).toBe(19.5); // the ease starts here
    expect(b.easing).toBe(true);
    const mid = b.step(23, 1000 + EASE_MS / 2, false);
    expect(mid).toBeCloseTo(21.25, 9);
    expect(b.step(23, 1000 + EASE_MS, false)).toBe(23);
    expect(b.easing).toBe(false);
  });
  it('reduced motion jumps at once', () => {
    const c = createHourClock(10);
    expect(c.step(23, 0, true)).toBe(23);
    expect(c.easing).toBe(false);
  });
  it('travels forward through midnight (night -> dawn), backward for a long way back (finished -> new lobby)', () => {
    expect(hourDelta(23, 6.25)).toBeCloseTo(7.25, 9);
    expect(hourDelta(12.5, 10)).toBeCloseTo(-2.5, 9);
    const c = createHourClock(23);
    c.step(6.25, 0, false);
    const h = c.step(6.25, EASE_MS / 2, false);
    // half way forward from 23:00 to 06:15 is ~02:37
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(6.25);
    expect(c.step(6.25, EASE_MS, false)).toBe(6.25);
  });
});

describe('darkness', () => {
  it('dark at night, light by day, ramps at dusk and dawn (vendor darkUp / darkDown)', () => {
    expect(darkness(23)).toBe(1);
    expect(darkness(2)).toBe(1);
    expect(darkness(12)).toBe(0);
    expect(darkness(18.9)).toBe(0);
    expect(darkness(19.75)).toBeCloseTo(0.5, 9);
    expect(darkness(5.75)).toBeCloseTo(0.5, 9);
    expect(darkness(7)).toBe(0);
  });
});
