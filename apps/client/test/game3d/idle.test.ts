// v3.2 perf: idle rendering (perf.ts ActivityWatch / idleEnabled / runFrameLoop idleFps + isIdle).
import { describe, expect, it } from 'vitest';
import { ActivityWatch, IDLE_LINGER_MS, idleEnabled, runFrameLoop, V3_IDLE_FPS, V3_MAX_FPS, type ActivityFrame } from '../../src/game3d/perf';

const store = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });

function loop(o: { idle: () => boolean; hz: number; secs: number; maxFps?: number; fpsLimit?: number }): number[] {
  let now = 0;
  const cbs: ((ts?: number) => void)[] = [];
  const drawn: number[] = [];
  runFrameLoop(
    { maxFps: o.maxFps ?? V3_MAX_FPS, fpsLimit: o.fpsLimit ?? 0, idleFps: V3_IDLE_FPS, isIdle: o.idle, step: () => drawn.push(now) },
    { raf: (cb) => cbs.push(cb), caf: () => undefined, now: () => now },
  );
  for (let i = 0; i < o.hz * o.secs; i++) {
    now += 1000 / o.hz;
    cbs.splice(0).forEach((f) => f(now));
  }
  return drawn;
}

describe('idle frame loop', () => {
  it('draws 30 fps while idle and the full rate otherwise, at 60 / 120 / 144 Hz', () => {
    for (const hz of [60, 120, 144]) {
      expect(loop({ idle: () => true, hz, secs: 5 }).length / 5).toBeCloseTo(30, 0);
      expect(loop({ idle: () => false, hz, secs: 5 }).length / 5).toBeGreaterThan(59);
    }
  });
  it('a wake draws on the very next vsync', () => {
    let idle = true;
    let now = 0;
    const cbs: ((ts?: number) => void)[] = [];
    const drawn: number[] = [];
    runFrameLoop({ maxFps: 60, idleFps: 30, isIdle: () => idle, step: () => drawn.push(now) }, { raf: (cb) => cbs.push(cb), caf: () => undefined, now: () => now });
    const tick = () => {
      now += 1000 / 60;
      cbs.splice(0).forEach((f) => f(now));
    };
    for (let i = 0; i < 60; i++) tick();
    // stop right after a drawn vsync (idle would skip the next one), then wake
    let n = drawn.length;
    tick();
    if (drawn.length === n) tick();
    n = drawn.length;
    tick(); // idle: skipped
    expect(drawn.length).toBe(n);
    tick(); // idle: drawn
    n = drawn.length;
    idle = false;
    tick();
    expect(drawn.length).toBe(n + 1);
    tick();
    expect(drawn.length).toBe(n + 2);
  });
  it('never raises a lower cap (cpu tier 30 fps, ct.debug.fps 15)', () => {
    expect(loop({ idle: () => true, hz: 60, secs: 5, fpsLimit: 30 }).length / 5).toBeCloseTo(30, 0);
    expect(loop({ idle: () => false, hz: 60, secs: 5, fpsLimit: 15 }).length / 5).toBeCloseTo(15, 0);
  });
  it('idleEnabled: on by default, off with ct.debug.fps or ct.debug.v3idle=0', () => {
    expect(idleEnabled(store({}))).toBe(true);
    expect(idleEnabled(null)).toBe(true);
    expect(idleEnabled(store({ 'ct.debug.fps': '30' }))).toBe(false);
    expect(idleEnabled(store({ 'ct.debug.fps': '-1' }))).toBe(false);
    expect(idleEnabled(store({ 'ct.debug.v3idle': '0' }))).toBe(false);
  });
});

describe('ActivityWatch', () => {
  const vp = (z = 0) => Array.from({ length: 16 }, (_, i) => (i === 14 ? z : i % 5 === 0 ? 1 : 0));
  const frame = (o: Partial<ActivityFrame> = {}): ActivityFrame => ({
    me: { x: 10, y: 20, location: 'outdoors', facing: 'down', moving: false },
    remotes: new Map([['b', { x: 50, y: 60, location: 'outdoors', facing: 'left', moving: false }]]),
    hour: 12,
    viewProj: vp(),
    offsetX: 0,
    offsetY: 0,
    busy: false,
    ...o,
  });
  const make = () => {
    const clock = { t: 0 };
    return { clock, w: new ActivityWatch(() => clock.t) };
  };

  it('goes idle LINGER ms after the last change, and stays idle on identical frames', () => {
    const { clock, w } = make();
    expect(w.observe(frame())).toBe(true); // first frame
    expect(w.idle()).toBe(false);
    clock.t = IDLE_LINGER_MS - 1;
    expect(w.observe(frame())).toBe(false);
    expect(w.idle()).toBe(false);
    clock.t = IDLE_LINGER_MS;
    expect(w.observe(frame())).toBe(false);
    expect(w.idle()).toBe(true);
  });

  it.each([
    ['camera', { viewProj: vp(0.01) }],
    ['camera', { offsetX: 0.5 }],
    ['hour', { hour: 12.01 }],
    ['busy', { busy: true }],
    ['pose', { me: { x: 11, y: 20, location: 'outdoors', facing: 'down', moving: false } }],
    ['pose', { me: { x: 10, y: 20, location: 'outdoors', facing: 'up', moving: false } }],
    ['pose', { me: { x: 10, y: 20, location: 'outdoors', facing: 'down', moving: true } }],
    ['pose', { remotes: new Map() }],
    ['pose', { remotes: new Map([['b', { x: 50, y: 60, location: 'bld:house-1', facing: 'left', moving: false }]]) }],
    ['pose', { remotes: new Map([['c', { x: 50, y: 60, location: 'outdoors', facing: 'left', moving: false }]]) }],
  ] as const)('a %s change wakes it', (reason, o) => {
    const { clock, w } = make();
    w.observe(frame());
    clock.t = 10_000;
    w.observe(frame());
    expect(w.idle()).toBe(true);
    expect(w.observe(frame(o as Partial<ActivityFrame>))).toBe(true);
    expect(w.reason).toBe(reason);
    expect(w.idle()).toBe(false);
  });

  it('wake() holds the full rate for LINGER ms', () => {
    const { clock, w } = make();
    w.observe(frame());
    clock.t = 10_000;
    expect(w.idle()).toBe(true);
    w.wake();
    expect(w.idle()).toBe(false);
    clock.t += IDLE_LINGER_MS;
    expect(w.idle()).toBe(true);
  });
});
