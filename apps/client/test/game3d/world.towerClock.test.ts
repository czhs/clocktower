// v3 WP3 (v3-stage). The tower as the Storyteller's timer (user request in flight 2): the plan the stage hands
// to the vendor timer face once it exists, and the in-universe readout text.
import { describe, expect, it } from 'vitest';
import type { DayClockView } from '@ct/protocol';
import { timerKey, timerReadout, timerTick, towerTimer } from '../../src/game3d/world/towerClock';

const clock = (o: Partial<DayClockView>): DayClockView => ({ stage: 'discussion', endsAt: null, remainingMs: null, paused: false, totalMs: 300_000, ...o });

describe('timerReadout', () => {
  it('m:ss rounded up, h:mm:ss from an hour, never negative', () => {
    expect(timerReadout(0)).toBe('0:00');
    expect(timerReadout(1)).toBe('0:01');
    expect(timerReadout(59_001)).toBe('1:00');
    expect(timerReadout(125_000)).toBe('2:05');
    expect(timerReadout(3_600_000)).toBe('1:00:00');
    expect(timerReadout(3_725_000)).toBe('1:02:05');
    expect(timerReadout(-5)).toBe('0:00');
    expect(timerReadout(Number.NaN)).toBe('0:00');
  });
});

describe('towerTimer', () => {
  it('no clock, a cleared clock or a zero total: null (the hands show the time of day)', () => {
    expect(towerTimer(null, 0)).toBeNull();
    expect(towerTimer(undefined, 0)).toBeNull();
    expect(towerTimer(clock({}), 0)).toBeNull();
    expect(towerTimer(clock({ paused: true }), 0)).toBeNull();
    expect(towerTimer(clock({ endsAt: 1000, totalMs: 0 }), 0)).toBeNull();
  });
  it('running: remaining = endsAt − serverNow, clamped to [0, total]', () => {
    const p = towerTimer(clock({ endsAt: 100_000, stage: 'nominations' }), 40_000)!;
    expect(p).toMatchObject({ stage: 'nominations', remainingMs: 60_000, totalMs: 300_000, paused: false, readout: '1:00' });
    expect(p.progress).toBeCloseTo(0.8, 9);
    expect(towerTimer(clock({ endsAt: 100_000 }), 200_000)!.remainingMs).toBe(0);
    expect(towerTimer(clock({ endsAt: 10_000_000 }), 0)!.remainingMs).toBe(300_000);
  });
  it('paused: the frozen remaining time', () => {
    expect(towerTimer(clock({ paused: true, remainingMs: 90_500, stage: 'bedtime' }), 1e12)).toMatchObject({ paused: true, remainingMs: 90_500, readout: '1:31', stage: 'bedtime' });
  });
  it('the write key changes once per readout second, pause or stage', () => {
    const a = towerTimer(clock({ endsAt: 100_000 }), 40_100);
    const b = towerTimer(clock({ endsAt: 100_000 }), 40_900);
    const c = towerTimer(clock({ endsAt: 100_000 }), 41_100);
    expect(timerKey(a)).toBe(timerKey(b));
    expect(timerKey(a)).not.toBe(timerKey(c));
    expect(timerKey(null)).toBe('tod');
    expect(timerKey(towerTimer(clock({ paused: true, remainingMs: 59_900 }), 0))).not.toBe(timerKey(b));
  });
});

describe('timerTick (the stage rebuilds the plan only when it or the clock object changes)', () => {
  it('-1 exactly when towerTimer is null; otherwise the readout second', () => {
    const cases: [DayClockView | null, number][] = [
      [null, 0],
      [clock({}), 0],
      [clock({ paused: true }), 0],
      [clock({ endsAt: 1000, totalMs: 0 }), 0],
      [clock({ endsAt: 100_000 }), 0],
      [clock({ endsAt: 100_000 }), 99_999],
      [clock({ endsAt: 100_000 }), 100_000],
      [clock({ endsAt: 100_000 }), 250_000],
      [clock({ endsAt: 900_000 }), 0],
      [clock({ paused: true, remainingMs: 42_500 }), 0],
      [clock({ endsAt: 4_000_000, totalMs: 5_000_000 }), 0],
    ];
    for (const [c, now] of cases) {
      const plan = towerTimer(c, now);
      const tick = timerTick(c, now);
      if (!plan) expect(tick).toBe(-1);
      else expect(timerReadout(tick * 1000)).toBe(plan.readout);
    }
  });
  it('changes once a second while running', () => {
    const c = clock({ endsAt: 60_000 });
    const ticks = new Set<number>();
    for (let now = 0; now < 5000; now += 16) ticks.add(timerTick(c, now));
    expect([...ticks]).toEqual([60, 59, 58, 57, 56]);
  });
});
