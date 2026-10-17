import { describe, expect, it } from 'vitest';
import { TrailingGate } from '../src/game/hudRate';

type Fix = { at: string; steps?: number } | null;
const eq = (a: Fix, b: Fix) => JSON.stringify(a) === JSON.stringify(b);

describe('TrailingGate (v2.4: HUD values that follow the walking player)', () => {
  it('passes the first change at once, then at most one per minMs, delivering the latest value', () => {
    const g = new TrailingGate<number>(0, 500);
    expect(g.offer(1, 1000)).toMatchObject({ emit: true, value: 1 });
    const r = g.offer(2, 1100);
    expect(r.emit).toBe(false);
    expect(r.wakeInMs).toBe(400);
    expect(g.offer(3, 1200).emit).toBe(false);
    expect(g.flush(1300)).toMatchObject({ emit: false, wakeInMs: 200 });
    expect(g.flush(1500)).toMatchObject({ emit: true, value: 3 });
    expect(g.value).toBe(3);
    expect(g.flush(1600).emit).toBe(false); // nothing pending
  });

  it('a value equal to what is shown cancels the pending one', () => {
    const g = new TrailingGate<number>(0, 500);
    g.offer(1, 0);
    expect(g.offer(2, 100).emit).toBe(false);
    expect(g.offer(1, 200)).toMatchObject({ emit: false, wakeInMs: 0 });
    expect(g.flush(600).emit).toBe(false);
    expect(g.value).toBe(1);
  });

  it('urgent changes (home / inside / outdoors) skip the wait', () => {
    const g = new TrailingGate<Fix>(null, 500, eq, (a, b) => a?.at !== b?.at);
    expect(g.offer({ at: 'out', steps: 9 }, 0).emit).toBe(true);
    expect(g.offer({ at: 'out', steps: 8 }, 100).emit).toBe(false);
    expect(g.offer({ at: 'home' }, 150)).toMatchObject({ emit: true, value: { at: 'home' } });
  });

  it('simulated walk: 10 Hz updates for 10 s emit ≤ 2.2 per second and end on the final value', () => {
    const g = new TrailingGate<number>(0, 500);
    let emits = 0;
    let wakeAt = Infinity;
    for (let t = 0; t <= 10_000; t += 10) {
      if (t >= wakeAt) {
        const r = g.flush(t);
        if (r.emit) emits++;
        wakeAt = r.wakeInMs > 0 ? t + r.wakeInMs : Infinity;
      }
      if (t % 100 === 0 && t < 10_000) {
        const r = g.offer(t / 100, t); // a new step count every update
        if (r.emit) emits++;
        if (r.wakeInMs > 0) wakeAt = t + r.wakeInMs;
      }
    }
    for (let t = 10_000; wakeAt !== Infinity && t < 12_000; t += 10)
      if (t >= wakeAt) {
        const r = g.flush(t);
        if (r.emit) emits++;
        wakeAt = r.wakeInMs > 0 ? t + r.wakeInMs : Infinity;
      }
    expect(emits).toBeLessThanOrEqual(22);
    expect(g.value).toBe(99);
  });
});
