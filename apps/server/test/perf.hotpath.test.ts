// (v2.4 P3, perf server) Hot-path caches must stay exactly as live as the values they cache.
import { afterEach, describe, expect, it } from 'vitest';
import { FrameMeter, liveSocketBudget } from '../src/guard/socketBudget.js';
import { DEFAULT_HOST_LIMITS, resetHostLimits, setHostLimits } from '../src/guard/hostLimits.js';

describe('socket budget spec (read for every incoming frame)', () => {
  afterEach(() => resetHostLimits());

  it('is not re-allocated per frame, yet follows every host-limit change on the next frame', () => {
    const a = liveSocketBudget();
    expect(liveSocketBudget()).toBe(a); // same object: no per-frame allocation
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.frameBurst).toBe(DEFAULT_HOST_LIMITS.socketFrameBurst);
    setHostLimits({ socketFrameBurst: 100, socketBytesPerSec: 32 * 1024 });
    const b = liveSocketBudget();
    expect(b).not.toBe(a);
    expect([b.frameBurst, b.bytesPerSec]).toEqual([100, 32 * 1024]);
    resetHostLimits(); // the test helper does not notify listeners: the cache must still notice
    expect(liveSocketBudget().frameBurst).toBe(DEFAULT_HOST_LIMITS.socketFrameBurst);
  });

  it('an existing meter trips at a lowered live burst (protection unchanged)', () => {
    const m = new FrameMeter(liveSocketBudget, 0);
    expect(m.take(10, 0)).toBe(true);
    setHostLimits({ socketFrameBurst: 100, socketFramesPerSec: 20 });
    let ok = 0;
    for (let i = 0; i < 150; i++) if (m.take(1, 0)) ok++;
    expect(ok).toBeLessThanOrEqual(100);
  });
});
