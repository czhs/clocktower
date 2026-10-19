// v3 WP0 (v3-lead). Boot guard (crash-loop protection) and the runtime perf sampler / safe-moment rule
// (docs/v3/INTEGRATION.md §1.2).
import { describe, expect, it } from 'vitest';
import { BOOT_WINDOW_MS, BOOTING_KEY, BOOTS_KEY, bootGuardState, resetBootGuard, STABLE_MS } from '../../src/game3d/bootGuard';
import { BootTracker, markBooting, markStable } from '../../src/game3d/bootMark';
import { median, PERF_WINDOW, PerfSampler, readPerfFlags, runFrameLoop, SAFE_IDLE_MS, SafeMoment, samplerEnabled, slowMedianMs } from '../../src/game3d/perf';

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('boot guard', () => {
  it('a clean history is not blocked; a leftover booting mark is', () => {
    const s = mem();
    expect(bootGuardState(1000, s)).toEqual({ leftover: false, unclean: 0, blocked: false });
    const id = markBooting(1000, s);
    expect(JSON.parse(s.m.get(BOOTING_KEY)!)).toEqual({ '': new Date(1000).toISOString() });
    expect(bootGuardState(2000, s)).toMatchObject({ leftover: true, unclean: 1, blocked: true });
    markStable(id, s, 2000);
    expect(bootGuardState(3000, s)).toEqual({ leftover: false, unclean: 0, blocked: false });
    expect(s.m.has(BOOTS_KEY)).toBe(false);
  });

  it('two unclean boots within 10 minutes block even without a leftover mark; older ones expire', () => {
    const s = mem();
    markBooting(0, s);
    markBooting(60_000, s);
    s.removeItem(BOOTING_KEY); // e.g. cleared by hand
    expect(bootGuardState(120_000, s)).toMatchObject({ leftover: false, unclean: 2, blocked: true });
    expect(bootGuardState(60_000 + BOOT_WINDOW_MS, s)).toMatchObject({ unclean: 0, blocked: false });
  });

  it('BootTracker clears the mark after 10 s of visible frames (hidden gaps do not count) or on finish()', () => {
    const s = mem();
    const t = new BootTracker(markBooting(Date.now(), s), s);
    for (let i = 0; i < 20; i++) t.frame(5_000); // hidden-tab gaps
    expect(t.stable).toBe(false);
    for (let ms = 0; ms < STABLE_MS - 16; ms += 16) t.frame(16);
    expect(t.stable).toBe(false);
    t.frame(32);
    expect(t.stable).toBe(true);
    expect(bootGuardState(Date.now(), s).blocked).toBe(false);
    const t2 = new BootTracker(markBooting(Date.now(), s), s);
    expect(bootGuardState(Date.now(), s).blocked).toBe(true);
    t2.finish();
    expect(bootGuardState(Date.now(), s).blocked).toBe(false);
  });

  // a fake window for pagehide
  const win = () => {
    const ls = new Set<() => void>();
    return {
      addEventListener: (k: string, f: () => void) => k === 'pagehide' && ls.add(f),
      removeEventListener: (k: string, f: () => void) => k === 'pagehide' && ls.delete(f),
      fire: () => [...ls].forEach((f) => f()),
      get count() {
        return ls.size;
      },
    } as unknown as Window & { fire(): void; count: number };
  };

  it('pagehide (clean unload / F5) after a rendered frame clears the mark; before any frame it does not', () => {
    const s = mem();
    const w = win();
    const t = new BootTracker(markBooting(Date.now(), s, 'A'), s, w, 'A');
    w.fire(); // reload during the build (nothing drawn yet): could be a hang, keep the mark
    expect(bootGuardState(Date.now(), s, 'A').blocked).toBe(true);
    t.rendered();
    w.fire();
    expect(t.stable).toBe(true);
    expect(bootGuardState(Date.now(), s, 'A')).toEqual({ leftover: false, unclean: 0, blocked: false });
    expect(w.count).toBe(0); // the listener goes with the tracker
    // a frame from the loop counts as rendered too
    const w2 = win();
    const t2 = new BootTracker(markBooting(Date.now(), s, 'A'), s, w2, 'A');
    t2.frame(16);
    w2.fire();
    expect(t2.stable).toBe(true);
    // dispose() stops listening and changes nothing
    const w3 = win();
    const t3 = new BootTracker(markBooting(Date.now(), s, 'A'), s, w3, 'A');
    t3.rendered();
    t3.dispose();
    expect(w3.count).toBe(0);
    w3.fire();
    expect(bootGuardState(Date.now(), s, 'A').leftover).toBe(true);
  });

  it('the booting mark is per tab: a second tab opened while the first boots is not blocked', () => {
    const s = mem();
    const now = Date.now();
    const a = markBooting(now, s, 'A');
    expect(bootGuardState(now + 1, s, 'B')).toEqual({ leftover: false, unclean: 1, blocked: false });
    expect(bootGuardState(now + 1, s, 'A')).toMatchObject({ leftover: true, blocked: true }); // A reloaded (OOM)
    const b = markBooting(now + 2, s, 'B');
    markStable(a, s, now + 3, 'A');
    expect(bootGuardState(now + 4, s, 'A')).toMatchObject({ leftover: false, unclean: 1, blocked: false });
    expect(bootGuardState(now + 4, s, 'B')).toMatchObject({ leftover: true });
    markStable(b, s, now + 5, 'B');
    expect(s.m.has(BOOTING_KEY)).toBe(false);
    expect(s.m.has(BOOTS_KEY)).toBe(false);
    // another tab's stale mark expires with the window
    markBooting(now, s, 'C');
    markBooting(now + BOOT_WINDOW_MS + 1, s, 'D');
    expect(Object.keys(JSON.parse(s.m.get(BOOTING_KEY)!))).toEqual(['D']);
  });

  it('a legacy (plain ISO) booting value counts for every tab until cleared', () => {
    const s = mem({ [BOOTING_KEY]: new Date(1000).toISOString() });
    expect(bootGuardState(2000, s, 'A').leftover).toBe(true);
    expect(bootGuardState(2000, s, 'B').leftover).toBe(true);
    markStable(1000, s, 2000, 'A');
    expect(bootGuardState(2000, s, 'B').leftover).toBe(false);
  });

  it('a caught crash clears the leftover mark but keeps the boot counted: two crashes in 10 min block', () => {
    const s = mem();
    const now = Date.now();
    const t = new BootTracker(markBooting(now, s, 'A'), s, null, 'A');
    t.crashed();
    expect(t.stable).toBe(false);
    expect(bootGuardState(now + 1, s, 'A')).toEqual({ leftover: false, unclean: 1, blocked: false });
    t.finish(); // no-op after a crash
    expect(bootGuardState(now + 1, s, 'A').unclean).toBe(1);
    new BootTracker(markBooting(now + 2, s, 'A'), s, null, 'A').crashed();
    expect(bootGuardState(now + 3, s, 'A')).toEqual({ leftover: false, unclean: 2, blocked: true });
  });

  it('corrupt storage and "Try v3" reset', () => {
    const s = mem({ [BOOTS_KEY]: '{oops', [BOOTING_KEY]: 'x' });
    expect(bootGuardState(1, s)).toMatchObject({ leftover: true, unclean: 0 });
    resetBootGuard(s);
    expect(s.m.size).toBe(0);
    expect(bootGuardState(1, null)).toEqual({ leftover: false, unclean: 0, blocked: false });
  });
});

describe('perf sampler', () => {
  it('is off with ct.debug.fps or v3force unless ct.debug.v3perfFallback', () => {
    expect(samplerEnabled({ fpsLimit: 0, force: false, perfFallback: false })).toBe(true);
    expect(samplerEnabled({ fpsLimit: 15, force: false, perfFallback: false })).toBe(false);
    expect(samplerEnabled({ fpsLimit: 0, force: true, perfFallback: false })).toBe(false);
    expect(samplerEnabled({ fpsLimit: 15, force: true, perfFallback: true })).toBe(true);
    expect(readPerfFlags(mem({ 'ct.debug.fps': '15', 'ct.debug.v3force': '1', 'ct.debug.v3perfFallback': '1' }))).toEqual({ fpsLimit: 15, force: true, perfFallback: true });
  });

  it('counts only armed, visible frames ≤ 250 ms', () => {
    const p = new PerfSampler('high', true);
    expect(p.sample(16, true)).toBe(false); // not armed (warm-up)
    p.arm();
    expect(p.sample(16, false)).toBe(false); // hidden tab
    expect(p.sample(400, true)).toBe(false); // > 250 ms
    expect(p.sample(16, true)).toBe(true);
    expect(p.accepted).toBe(1);
    expect(p.verdict).toBe('pending');
  });

  it('a 30 fps cap (33.3 ms) never trips; a 50 ms median rebuilds at low, then at cpu; cpu falls back under 15 fps', () => {
    const run = (tier: 'high' | 'low' | 'cpu', ms: number) => {
      const p = new PerfSampler(tier, true);
      p.arm();
      for (let i = 0; i < PERF_WINDOW; i++) p.sample(ms, true);
      return p.verdict;
    };
    expect(run('high', 33.3)).toBe('ok');
    expect(run('high', 45)).toBe('ok');
    expect(run('high', 50)).toBe('rebuild-low');
    expect(run('low', 50)).toBe('rebuild-cpu');
    expect(run('cpu', 50)).toBe('ok');
    expect(run('cpu', 66)).toBe('ok');
    expect(run('cpu', 70)).toBe('fallback');
    expect(slowMedianMs('cpu')).toBe(66);
    expect(slowMedianMs('low')).toBe(45);
    expect(new PerfSampler('low', false).verdict).toBe('ok');
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('frame loop', () => {
  const clock = () => {
    let now = 0;
    let next = 1;
    const cbs = new Map<number, () => void>();
    return {
      deps: {
        raf: (cb: () => void) => {
          const id = next++;
          cbs.set(id, cb);
          return id;
        },
        caf: (id: number) => void cbs.delete(id),
        now: () => now,
      },
      tick(ms = 16) {
        now += ms;
        const run = [...cbs.values()];
        cbs.clear();
        run.forEach((f) => f());
      },
      get pending() {
        return cbs.size;
      },
    };
  };

  it('steps with a monotonic t (hidden-tab jumps clamped to 0.25 s)', () => {
    const c = clock();
    const ts: number[] = [];
    const loop = runFrameLoop({ step: (t) => ts.push(t) }, c.deps);
    c.tick(16);
    c.tick(5000);
    expect(ts[0]).toBeCloseTo(2 / 60 + 0.016, 9);
    expect(ts[1]! - ts[0]!).toBeCloseTo(0.25, 9);
    loop.stop();
    expect(c.pending).toBe(0);
    c.tick();
    expect(ts.length).toBe(2);
  });

  it('a throwing frame (vendor updater / layer) stops the loop and reports once', () => {
    const c = clock();
    const errors: unknown[] = [];
    let calls = 0;
    const loop = runFrameLoop(
      {
        step: () => {
          calls++;
          if (calls === 2) throw new Error('layer boom');
        },
        onError: (e) => errors.push(e),
      },
      c.deps,
    );
    for (let i = 0; i < 10; i++) c.tick();
    expect(calls).toBe(2);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('layer boom');
    expect(loop.running).toBe(false);
    expect(c.pending).toBe(0); // the re-requested frame was cancelled
  });

  it('honours the fps cap', () => {
    const c = clock();
    let calls = 0;
    runFrameLoop({ fpsLimit: 10, step: () => calls++ }, c.deps);
    for (let i = 0; i < 60; i++) c.tick(1000 / 60);
    expect(calls).toBeGreaterThanOrEqual(9);
    expect(calls).toBeLessThanOrEqual(11);
  });
});

describe('safe moment', () => {
  it('runs at once when nothing is in progress', () => {
    const s = new SafeMoment();
    s.schedule();
    expect(s.offer({ phase: 'day', voting: false, nominationOpen: false }, 0)).toBe(true);
    expect(s.isPending).toBe(false);
  });
  it('waits while voting / a nomination is open; runs at the next phase change', () => {
    const s = new SafeMoment();
    expect(s.offer({ phase: 'day', voting: true, nominationOpen: true }, 0)).toBe(false);
    s.schedule();
    expect(s.offer({ phase: 'day', voting: true, nominationOpen: true }, 1000)).toBe(false);
    expect(s.offer({ phase: 'day', voting: false, nominationOpen: true }, SAFE_IDLE_MS * 2)).toBe(false);
    expect(s.offer({ phase: 'bedtime', voting: false, nominationOpen: true }, SAFE_IDLE_MS * 2 + 1)).toBe(true);
  });
  it('or once the nomination has been closed (quiet) — a crash swap never schedules', () => {
    const s = new SafeMoment();
    s.offer({ phase: 'day', voting: true, nominationOpen: true }, 0);
    s.schedule();
    expect(s.offer({ phase: 'day', voting: false, nominationOpen: false }, 10)).toBe(true);
  });
});
