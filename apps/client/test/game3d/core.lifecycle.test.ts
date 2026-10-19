// v3 WP1 (v3-core). Rebuild / fallback orchestration (docs/v3/INTEGRATION.md §1.2, §1.3 "Rebuild"): the perf sampler
// verdicts, the safe-moment scheduler, context loss (rebuild, then Classic), crashes, boot-guard marks; and the debug
// helpers (frame stats, the v3perf readout, the hooks).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBusyOverlay, Lifecycle, LOSS_WINDOW_MS, REBUILD_TEXT, resetPageLosses, watchContextLoss, type LifecycleDeps } from '../../src/game3d/net/lifecycle';
import { PERF_WINDOW, type SafeMomentInput } from '../../src/game3d/perf';
import { FrameStats } from '../../src/game3d/debug/frameStats';
import { perfLines, perfReport, type V3Stats } from '../../src/game3d/debug/perfOverlay';
import { debugFlag, installCameraHook, installSocialHook } from '../../src/game3d/debug/hooks';
import type { Tier } from '../../src/game3d/contract';

function setup(o: Partial<LifecycleDeps> & { failBuild?: (tier: Tier, n: number) => boolean } = {}) {
  const log: string[] = [];
  let n = 0;
  let now = 0;
  const safe: SafeMomentInput = { phase: 'day', voting: false, nominationOpen: false };
  const overlay: string[] = [];
  const boot = { marks: 0, trackers: [] as { id: number; calls: string[] }[] };
  const d: LifecycleDeps = {
    startTier: 'high',
    async build(tier) {
      n++;
      log.push(`build ${tier}`);
      if (o.failBuild?.(tier, n)) throw new Error('boom');
    },
    teardown: () => void log.push('teardown'),
    fallback: (r) => void log.push(`fallback ${r}`),
    safe: () => safe,
    flags: { fpsLimit: 0, force: false, perfFallback: false },
    overlay: { show: (t) => void overlay.push(t), hide: () => void overlay.push('hide') },
    now: () => now,
    visible: () => true,
    boot: {
      mark: () => ++boot.marks,
      tracker(id) {
        const t = { id, calls: [] as string[] };
        boot.trackers.push(t);
        return { rendered: () => t.calls.push('rendered'), frame: () => undefined, finish: () => t.calls.push('finish'), crashed: () => t.calls.push('crashed'), dispose: () => t.calls.push('dispose') };
      },
    },
    ...o,
  };
  const lc = new Lifecycle(d);
  return { lc, log, safe, overlay, boot, tick: (ms: number) => (now += ms) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const frames = (s: ReturnType<typeof setup>, n: number, ms: number) => {
  for (let i = 0; i < n; i++) {
    s.tick(ms);
    s.lc.frame(ms);
  }
};

beforeEach(() => resetPageLosses());

describe('lifecycle', () => {
  it('start: marks a boot, builds, then rendered; destroy finishes the mark cleanly', async () => {
    const s = setup();
    await s.lc.start();
    expect(s.lc.state).toBe('running');
    expect(s.log).toEqual(['build high']);
    expect(s.boot.trackers[0]!.calls).toEqual(['rendered']);
    s.lc.destroy();
    expect(s.boot.trackers[0]!.calls).toEqual(['rendered', 'finish', 'dispose']);
  });

  it('a build error is a crash: Classic at once, the boot counted as crashed', async () => {
    const s = setup({ failBuild: () => true });
    await expect(s.lc.start()).rejects.toThrow('boom');
    expect(s.log).toEqual(['build high', 'fallback error']);
    expect(s.boot.trackers[0]!.calls).toEqual(['crashed']);
    expect(s.lc.state).toBe('fallback');
  });

  it('slow at high -> rebuild at low (new Engine) -> slow again -> rebuild at cpu -> under 15 fps -> perf fallback', async () => {
    const s = setup();
    await s.lc.start();
    frames(s, PERF_WINDOW, 60);
    await flush();
    expect(s.log).toEqual(['build high', 'teardown', 'build low']);
    expect(s.lc.tier).toBe('low');
    expect(s.overlay.slice(-2)).toEqual([REBUILD_TEXT, 'hide']);
    expect(s.boot.marks).toBe(2);
    frames(s, PERF_WINDOW, 60);
    await flush();
    expect(s.log).toEqual(['build high', 'teardown', 'build low', 'teardown', 'build cpu']);
    expect(s.lc.tier).toBe('cpu');
    frames(s, PERF_WINDOW, 60); // 16.7 fps: fine for the cpu tier
    expect(s.log.at(-1)).toBe('build cpu');
    const c = setup({ startTier: 'cpu' });
    await c.lc.start();
    frames(c, PERF_WINDOW, 70);
    expect(c.log.at(-1)).toBe('fallback perf');
    expect(c.boot.trackers[0]!.calls).toContain('finish'); // too slow is not a crash
  });

  it('33.3 ms (Energy Saver) never trips the sampler', async () => {
    const s = setup();
    await s.lc.start();
    frames(s, PERF_WINDOW * 2, 33.3);
    expect(s.log).toEqual(['build high']);
  });

  it('the sampler is off with ct.debug.fps / v3force, back on with v3perfFallback', async () => {
    const off = setup({ flags: { fpsLimit: 15, force: true, perfFallback: false } });
    await off.lc.start();
    frames(off, PERF_WINDOW, 80);
    expect(off.log).toEqual(['build high']);
    const on = setup({ flags: { fpsLimit: 15, force: true, perfFallback: true }, startTier: 'cpu' });
    await on.lc.start();
    frames(on, PERF_WINDOW, 80);
    expect(on.log.at(-1)).toBe('fallback perf');
  });

  it('waits for a safe moment: not during a vote / open nomination; at the next phase change, or once it closed', async () => {
    const s = setup({ startTier: 'cpu' });
    await s.lc.start();
    s.safe.voting = true;
    frames(s, PERF_WINDOW, 80);
    frames(s, 10, 16);
    expect(s.lc.waiting).toBe('fallback');
    expect(s.log).toEqual(['build cpu']);
    s.safe.phase = 'night';
    s.lc.offer();
    expect(s.log.at(-1)).toBe('fallback perf');

    const q = setup({ startTier: 'cpu' });
    await q.lc.start();
    q.safe.nominationOpen = true;
    frames(q, PERF_WINDOW, 80);
    frames(q, 10, 16);
    expect(q.log).toEqual(['build cpu']);
    q.safe.nominationOpen = false; // the nomination closed: nothing in progress, it runs now
    q.lc.offer();
    expect(q.log.at(-1)).toBe('fallback perf');
  });

  it('auto may promote low -> high once after a clean sample; never after a demotion', async () => {
    const s = setup({ startTier: 'low', allowPromote: true });
    await s.lc.start();
    frames(s, PERF_WINDOW, 16);
    await flush();
    expect(s.log).toEqual(['build low', 'teardown', 'build high']);
    frames(s, PERF_WINDOW, 60); // too slow at high: back to low, and no second promotion
    await flush();
    frames(s, PERF_WINDOW, 16);
    await flush();
    expect(s.log).toEqual(['build low', 'teardown', 'build high', 'teardown', 'build low']);
  });

  it('v3.3: with a promotionCheck the promotion waits for it and happens only when it says yes (asked once)', async () => {
    let asked = 0;
    let answer: (ok: boolean) => void = () => undefined;
    const s = setup({ startTier: 'low', allowPromote: true, promotionCheck: () => (asked++, new Promise<boolean>((r) => (answer = r))) });
    await s.lc.start();
    frames(s, PERF_WINDOW, 16);
    await flush();
    expect(asked).toBe(1);
    expect(s.log).toEqual(['build low']); // no rebuild before the probe answers
    answer(true);
    await flush();
    expect(s.log).toEqual(['build low', 'teardown', 'build high']);

    const n = setup({ startTier: 'low', allowPromote: true, promotionCheck: () => (asked++, Promise.resolve(false)) });
    asked = 0;
    await n.lc.start();
    frames(n, PERF_WINDOW, 16);
    await flush();
    frames(n, PERF_WINDOW * 2, 16);
    await flush();
    expect(asked).toBe(1); // never asked again
    expect(n.log).toEqual(['build low']); // the GPU had no headroom: stays at low
  });

  it('v3.3: a late "yes" after a rebuild / at another tier is ignored', async () => {
    let answer: (ok: boolean) => void = () => undefined;
    const s = setup({ startTier: 'low', allowPromote: true, promotionCheck: () => new Promise<boolean>((r) => (answer = r)) });
    await s.lc.start();
    frames(s, PERF_WINDOW, 16);
    await flush();
    s.lc.contextLost(); // rebuild at low: a new generation
    await flush();
    answer(true);
    await flush();
    expect(s.log).toEqual(['build low', 'teardown', 'build low']);
  });

  it('v3.4: mayPromote (the sprite bakes wait for it) is true until the probe said no, while a promotion is scheduled, never at high / without auto / with the sampler off', async () => {
    let answer: (ok: boolean) => void = () => undefined;
    const s = setup({ startTier: 'low', allowPromote: true, promotionCheck: () => new Promise<boolean>((r) => (answer = r)) });
    await s.lc.start();
    expect(s.lc.mayPromote).toBe(true); // the sample window runs
    frames(s, PERF_WINDOW, 16);
    await flush();
    expect(s.lc.mayPromote).toBe(true); // probing
    answer(false);
    await flush();
    expect(s.lc.mayPromote).toBe(false); // no headroom: bake sprites now

    const y = setup({ startTier: 'low', allowPromote: true, promotionCheck: () => Promise.resolve(true) });
    await y.lc.start();
    y.safe.voting = true; // the promotion waits for a safe moment
    frames(y, PERF_WINDOW, 16);
    await flush();
    expect(y.lc.waiting).toBe('rebuild:high');
    expect(y.lc.mayPromote).toBe(true);

    const noAuto = setup({ startTier: 'low', allowPromote: false });
    await noAuto.lc.start();
    expect(noAuto.lc.mayPromote).toBe(false);
    const high = setup({ startTier: 'high', allowPromote: true });
    await high.lc.start();
    expect(high.lc.mayPromote).toBe(false);
    const off = setup({ startTier: 'low', allowPromote: true, flags: { fpsLimit: 30, force: false, perfFallback: false } });
    await off.lc.start();
    expect(off.lc.mayPromote).toBe(false); // the sampler never judges: no promotion can come
  });

  it('context loss: the first rebuilds at once (even during a vote), the second within 10 min -> Classic', async () => {
    const s = setup();
    await s.lc.start();
    s.safe.voting = true;
    s.lc.contextLost();
    await flush();
    expect(s.log).toEqual(['build high', 'teardown', 'build high']);
    expect(s.lc.state).toBe('running');
    s.lc.contextLost();
    expect(s.log.at(-1)).toBe('fallback error');
    expect(s.boot.trackers.at(-1)!.calls).toContain('crashed');
  });

  it('context losses older than the window are forgotten', async () => {
    const real = Date.now;
    let t = real();
    vi.spyOn(Date, 'now').mockImplementation(() => t);
    const s = setup();
    await s.lc.start();
    s.lc.contextLost();
    await flush();
    t += LOSS_WINDOW_MS + 1;
    s.lc.contextLost();
    await flush();
    expect(s.log).toEqual(['build high', 'teardown', 'build high', 'teardown', 'build high']);
    vi.restoreAllMocks();
  });

  it('a crash in a rebuild goes to Classic; a tier setting change rebuilds at a safe moment', async () => {
    const s = setup({ failBuild: (_t, n) => n === 3 });
    await s.lc.start();
    s.lc.requestTier('low');
    await flush();
    expect(s.log).toEqual(['build high', 'teardown', 'build low']);
    s.lc.requestTier('low'); // same tier: nothing
    s.lc.requestTier('high');
    await flush();
    expect(s.log.slice(3)).toEqual(['teardown', 'build high', 'fallback error']);
  });

  it('destroy during a build: the late build is ignored', async () => {
    let release: () => void = () => undefined;
    const s = setup({ build: () => new Promise<void>((r) => (release = r)) });
    const p = s.lc.start();
    s.lc.destroy();
    release();
    await p;
    expect(s.lc.state).toBe('destroyed');
  });

  it('context loss during the first build: that build is cancelled, its late completion attaches nothing, start() waits for the new one', async () => {
    const releases: (() => void)[] = [];
    const ctls: { isCurrent(): boolean; signal: AbortSignal }[] = [];
    const attached: string[] = [];
    const s = setup({
      async build(tier, ctl) {
        ctls.push(ctl);
        const n = ctls.length;
        await new Promise<void>((r) => releases.push(r));
        if (!ctl.isCurrent()) return void attached.push(`dispose own ${n}`); // the composition root's duty
        attached.push(`attach ${n} ${tier}`);
      },
    });
    let settled = false;
    const p = s.lc.start().then(() => void (settled = true));
    s.lc.contextLost(); // during the shader warm-up
    expect(ctls[0]!.isCurrent()).toBe(false);
    expect(ctls[0]!.signal.aborted).toBe(true);
    expect(s.log).toEqual(['teardown']);
    expect(s.lc.state).toBe('building');
    releases[0]!(); // the stale build completes late
    await flush();
    expect(settled).toBe(false); // start() did not settle with the stale outcome
    expect(attached).toEqual(['dispose own 1']);
    releases[1]!();
    await p;
    expect(attached).toEqual(['dispose own 1', 'attach 2 high']); // exactly one scene attached
    expect(s.lc.state).toBe('running');
    expect(ctls[1]!.isCurrent()).toBe(true);
    expect(s.boot.marks).toBe(2);
  });

  it('a superseded build that rejects (its Engine was disposed) is not a crash and does not reject start()', async () => {
    const pending: { resolve(): void; reject(e: unknown): void }[] = [];
    const s = setup({ build: () => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })) });
    const p = s.lc.start();
    s.lc.contextLost();
    pending[0]!.reject(new Error('engine disposed'));
    await flush();
    expect(s.lc.state).toBe('building');
    expect(s.log).not.toContain('fallback error');
    pending[1]!.resolve();
    await expect(p).resolves.toBeUndefined();
    expect(s.lc.state).toBe('running');
  });

  it('context loss during a rebuild restarts it; the second loss in the window still goes to Classic', async () => {
    const releases: (() => void)[] = [];
    const s = setup({ build: () => new Promise<void>((r) => releases.push(r)) });
    const p = s.lc.start();
    releases[0]!();
    await p;
    s.lc.requestTier('low');
    expect(s.lc.state).toBe('rebuilding');
    s.lc.contextLost(); // first loss: restart the rebuild at the same tier
    expect(s.lc.state).toBe('rebuilding');
    releases[1]!(); // stale
    await flush();
    expect(s.lc.state).toBe('rebuilding');
    releases[2]!();
    await flush();
    expect([s.lc.state, s.lc.tier]).toEqual(['running', 'low']);
    s.lc.contextLost();
    expect(s.log.at(-1)).toBe('fallback error');
  });

  it('onTier follows every build: start tier, perf demotion, setting change', async () => {
    const tiers: Tier[] = [];
    const s = setup({ onTier: (t) => void tiers.push(t) });
    await s.lc.start();
    expect(tiers).toEqual(['high']);
    frames(s, PERF_WINDOW, 60); // too slow: demoted
    await flush();
    expect(tiers).toEqual(['high', 'low']);
    s.lc.requestTier('high');
    await flush();
    expect(tiers).toEqual(['high', 'low', 'high']);
  });

  it('requestTier back to the current tier drops a pending setting rebuild, but keeps a pending perf demotion', async () => {
    const s = setup();
    await s.lc.start();
    s.safe.voting = true; // nothing runs until the vote ends
    s.lc.requestTier('low');
    expect(s.lc.waiting).toBe('rebuild:low');
    s.lc.requestTier('high'); // = the current tier: no same-tier rebuild, nothing pending
    expect(s.lc.waiting).toBeNull();
    s.safe.voting = false;
    s.lc.offer();
    await flush();
    expect(s.log).toEqual(['build high']);

    const q = setup();
    await q.lc.start();
    q.safe.voting = true;
    frames(q, PERF_WINDOW, 60); // demotion waits for the vote
    expect(q.lc.waiting).toBe('rebuild:low');
    q.lc.requestTier('high');
    expect(q.lc.waiting).toBe('rebuild:low'); // kept
    q.safe.voting = false;
    q.lc.offer();
    await flush();
    expect(q.log).toEqual(['build high', 'teardown', 'build low']);
  });

  it('watchContextLoss prevents the default and reports', () => {
    const ls = new Map<string, (e: Event) => void>();
    const canvas = { addEventListener: (t: string, f: (e: Event) => void) => void ls.set(t, f), removeEventListener: (t: string) => void ls.delete(t) };
    let lost = 0;
    let prevented = false;
    const off = watchContextLoss(canvas as never, () => lost++);
    ls.get('webglcontextlost')!({ preventDefault: () => void (prevented = true) } as unknown as Event);
    expect([lost, prevented]).toEqual([1, true]);
    off();
    expect(ls.size).toBe(0);
  });

  it('busy overlay (fake DOM)', () => {
    const made: { textContent: string; removed: boolean }[] = [];
    const doc = { createElement: () => ({ style: {}, setAttribute: () => undefined, textContent: '', removed: false, remove() { this.removed = true; } }) };
    const parent = { appendChild: (e: { textContent: string; removed: boolean }) => void made.push(e) };
    const o = createBusyOverlay(parent as never, doc as never);
    o.show('a');
    o.show('b');
    expect(made.length).toBe(1);
    expect(made[0]!.textContent).toBe('b');
    o.hide();
    expect(made[0]!.removed).toBe(true);
  });
});

describe('debug helpers', () => {
  it('frame stats: visible frames only, gaps dropped, rolling window, quantiles', () => {
    const f = new FrameStats(4);
    f.push(10);
    f.push(20, false);
    f.push(5000);
    f.push(30);
    f.push(40);
    f.push(50);
    f.push(60); // the window keeps the last 4: 30 40 50 60
    expect(f.count).toBe(4);
    expect(f.summary()).toEqual({ p50: 40, p95: 60, frames: 4 });
    f.clear();
    expect(f.summary()).toEqual({ p50: 0, p95: 0, frames: 0 });
  });

  const stats: V3Stats = { ready: true, tier: 'low', pixelScale: 2, calls: 310, tris: 120000, programs: 41, frameMs: { p50: 16.7, p95: 22.04 }, gpu: 'ANGLE (SwiftShader)', building: [], life: null };
  it('perf readout lines and report', () => {
    expect(perfLines(stats, 600, { w: 960, h: 540 })).toEqual(['v3 low · ×2 · 960×540', 'p50 16.7 ms · p95 22.0 ms (600 fr)', 'calls 310 · tris 120000 · programs 41', 'ANGLE (SwiftShader)']);
    const r = JSON.parse(perfReport(stats, 600, { w: 960, h: 540 }, 'UA'));
    expect(r).toMatchObject({ tier: 'low', calls: 310, frames: 600, canvas: { w: 960, h: 540 }, ua: 'UA' });
  });

  it('hooks: flags, merge order, uninstall only our own object', () => {
    expect(debugFlag('x', { getItem: () => '1' })).toBe(true);
    expect(debugFlag('x', { getItem: () => { throw new Error('blocked'); } })).toBe(false);
    const w: { __ctCamera?: unknown; __ctSocial?: unknown } = {};
    expect(installCameraHook({ me: () => 1 }, [], false, w)).toBeNull();
    const h = installCameraHook({ me: () => 1 }, [{ update() {}, destroy() {}, debug: () => ({ dais: () => 2 }) }], true, w)!;
    const m = w.__ctCamera as Record<string, () => unknown>;
    expect([m.me!(), m.dais!()]).toEqual([1, 2]);
    expect(h.setLayers([{ update() {}, destroy() {}, debug: () => ({ avatar: () => 3, me: () => 9 }) }])).toEqual(['me']);
    expect(m.dais).toBeUndefined();
    expect([m.me!(), m.avatar!()]).toEqual([1, 3]);
    w.__ctCamera = { other: true }; // another renderer's hook
    h.uninstall();
    expect(w.__ctCamera).toEqual({ other: true });
    const off = installSocialHook({ seen: () => [] }, true, w);
    expect(w.__ctSocial).toBeTruthy();
    off();
    expect(w.__ctSocial).toBeUndefined();
  });
});
