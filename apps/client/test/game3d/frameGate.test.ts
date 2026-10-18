// v3 perf(learn): the display-independent frame cap (perf.ts createFrameGate / runFrameLoop maxFps).
import { describe, expect, it } from 'vitest';
import { createFrameGate, runFrameLoop, V3_MAX_FPS } from '../../src/game3d/perf';

/** Drive a gate with `hz` vsync timestamps (small jitter) for `secs`; returns drawn fps and the min / max drawn gap. */
function drive(fps: number, hz: number, secs = 10): { fps: number; minGap: number; maxGap: number } {
  const gate = createFrameGate(fps);
  let n = 0;
  let last: number | null = null;
  let minGap = Infinity;
  let maxGap = 0;
  let j = 0.37;
  for (let k = 0; k * (1000 / hz) < secs * 1000; k++) {
    j = (j * 9301 + 49297) % 233280; // deterministic jitter in [-0.15, 0.15] ms
    const ts = 100 + k * (1000 / hz) + (j / 233280 - 0.5) * 0.3;
    if (!gate(ts)) continue;
    n++;
    if (last !== null && ts > 1100) {
      minGap = Math.min(minGap, ts - last);
      maxGap = Math.max(maxGap, ts - last);
    }
    last = ts;
  }
  return { fps: n / secs, minGap, maxGap };
}

describe('frame gate (V3_MAX_FPS)', () => {
  it('is 60', () => expect(V3_MAX_FPS).toBe(60));
  it('never drops a frame on a ~60 Hz display (59.94 / 60 / 60.5 / 75 Hz render every vsync)', () => {
    for (const hz of [59.94, 60, 60.5, 75]) {
      const r = drive(V3_MAX_FPS, hz);
      expect(r.fps).toBeCloseTo(hz, 0);
      expect(r.maxGap).toBeLessThan((1000 / hz) * 1.1);
    }
  });
  it('renders every 2nd / 4th vsync at 120 / 240 Hz', () => {
    for (const hz of [120, 240]) {
      const r = drive(V3_MAX_FPS, hz);
      expect(r.fps).toBeCloseTo(60, 0);
      expect(r.minGap).toBeGreaterThan(16);
      expect(r.maxGap).toBeLessThan(17.5);
    }
  });
  it('holds 60 on average at 144 / 165 Hz, never bursting faster than half the cap interval', () => {
    for (const hz of [144, 165]) {
      const r = drive(V3_MAX_FPS, hz);
      expect(r.fps).toBeGreaterThan(59);
      expect(r.fps).toBeLessThan(61);
      expect(r.minGap).toBeGreaterThan(1000 / 60 / 2);
    }
  });
  it('a 30 fps cap (cpu tier) at 60 Hz = every 2nd vsync; 0 = every frame', () => {
    const r = drive(30, 60);
    expect(r.fps).toBeCloseTo(30, 0);
    expect(r.minGap).toBeGreaterThan(33);
    expect(drive(0, 144).fps).toBeCloseTo(144, 0);
  });
  it('re-locks after a stall instead of bursting', () => {
    const gate = createFrameGate(60);
    const drawn: number[] = [];
    for (let k = 0; k < 20; k++) if (gate(k * 8.333)) drawn.push(k * 8.333);
    // a 500 ms stall, then 120 Hz again: the first frame draws, the next one (8 ms later) does not
    const t0 = 20 * 8.333 + 500;
    expect(gate(t0)).toBe(true);
    expect(gate(t0 + 8.333)).toBe(false);
    expect(gate(t0 + 16.667)).toBe(true);
    expect(drawn.length).toBeGreaterThanOrEqual(9);
  });
  it('runFrameLoop: maxFps caps a fast display; fpsLimit wins over it', () => {
    const run = (o: { maxFps?: number; fpsLimit?: number }, hz: number, secs: number) => {
      let now = 0;
      const cbs: ((ts?: number) => void)[] = [];
      const deps = { raf: (cb: (ts?: number) => void) => cbs.push(cb), caf: () => undefined, now: () => now };
      let calls = 0;
      runFrameLoop({ ...o, step: () => calls++ }, deps);
      for (let i = 0; i < hz * secs; i++) {
        now += 1000 / hz;
        cbs.splice(0).forEach((f) => f(now));
      }
      return calls / secs;
    };
    // (the first frames run before the vsync estimate settles: +1 fps over 4 s at most)
    expect(run({ maxFps: 60 }, 240, 4)).toBeGreaterThanOrEqual(59.5);
    expect(run({ maxFps: 60 }, 240, 4)).toBeLessThanOrEqual(61);
    expect(run({ maxFps: 60 }, 60, 4)).toBeCloseTo(60, 0);
    expect(run({ maxFps: 60, fpsLimit: 15 }, 240, 4)).toBeCloseTo(15, 0);
    expect(run({}, 144, 2)).toBeCloseTo(144, 0);
  });
});
