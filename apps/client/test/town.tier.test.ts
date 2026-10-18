// world-art: town render tier (apps/client/src/game/fx/tier.ts) — tier choice, slow-frame watch,
// frame gate.
import { describe, expect, it } from 'vitest';
import { FrameGate, initialTier, LOW_RENDER_SCALE, p95, renderScaleFor, SlowFrameWatch, SOFTWARE_RENDERER, TierState } from '../src/game/fx/tier';

describe('initialTier', () => {
  const desk = { touch: false, cores: 12 };
  it('auto: normal on a desktop, still allowed to drop on slow frames', () => {
    expect(initialTier('auto', desk)).toEqual({ tier: 'normal', auto: true });
  });
  it('auto: low on touch and on <= 4 cores', () => {
    expect(initialTier('auto', { touch: true, cores: 8 })).toEqual({ tier: 'low', auto: false });
    expect(initialTier('auto', { touch: false, cores: 4 })).toEqual({ tier: 'low', auto: false });
    expect(initialTier('auto', { touch: false, cores: 0 })).toEqual({ tier: 'normal', auto: true }); // unknown core count
  });
  it('overrides: low forces low; medium / high force normal and never auto-drop', () => {
    expect(initialTier('low', desk)).toEqual({ tier: 'low', auto: false });
    expect(initialTier('high', { touch: true, cores: 2 })).toEqual({ tier: 'normal', auto: false });
    expect(initialTier('medium', { touch: true, cores: 2 })).toEqual({ tier: 'normal', auto: false });
  });
});

describe('SlowFrameWatch', () => {
  const run = (w: SlowFrameWatch, from: number, to: number, dt: number) => {
    let hit = false;
    for (let t = from; t <= to; t += dt) hit = w.sample(dt, t, false) || hit;
    return hit;
  };
  it('ignores the warm-up, then needs a full 5 s window with p95 > 33 ms', () => {
    const w = new SlowFrameWatch(0);
    expect(run(w, 0, 3990, 50)).toBe(false); // warm-up
    expect(run(w, 4000, 8900, 50)).toBe(false); // < 5 s of samples
    expect(run(w, 8950, 9600, 50)).toBe(true);
  });
  it('steady 60 fps with a few hitches stays normal', () => {
    const w = new SlowFrameWatch(0);
    let hit = false;
    for (let i = 0, t = 4000; t < 20000; i++) {
      const dt = i % 40 === 0 ? 50 : 16.7; // 2.5 % slow frames
      t += dt;
      hit = w.sample(dt, t, false) || hit;
    }
    expect(hit).toBe(false);
  });
  it('a hidden tab or a long stall restarts the window', () => {
    const w = new SlowFrameWatch(0);
    expect(run(w, 4000, 8000, 50)).toBe(false);
    expect(w.sample(50, 8050, true)).toBe(false);
    expect(run(w, 8100, 12000, 50)).toBe(false); // only ~4 s since the restart
    expect(w.sample(400, 12100, false)).toBe(false);
  });
  it('p95', () => {
    expect(p95([])).toBe(0);
    expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(96);
  });
});

describe('FrameGate', () => {
  const count = (hz: number, cap: number, seconds = 2) => {
    const g = new FrameGate();
    let n = 0;
    for (let i = 0; i < hz * seconds; i++) {
      const jitter = ((i * 7919) % 11) / 10 - 0.5; // +-0.5 ms
      if (g.pass(i * (1000 / hz) + jitter, cap ? 1000 / cap : 0)) n++;
    }
    return n / seconds;
  };
  it('60 cap: every frame at 60 Hz, every other at 120 Hz, ~60 at 90 / 144 Hz', () => {
    expect(count(60, 60)).toBe(60);
    expect(count(120, 60)).toBe(60);
    expect(Math.abs(count(90, 60) - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(count(144, 60) - 60)).toBeLessThanOrEqual(1);
  });
  it('30 cap: steady 30 at 60 and 120 Hz', () => {
    expect(count(60, 30)).toBe(30);
    expect(count(120, 30)).toBe(30);
  });
  it('slower than the cap: every frame runs; no catch-up burst after a stall', () => {
    expect(count(20, 60)).toBe(20);
    const g = new FrameGate();
    expect(g.pass(0, 1000 / 30)).toBe(true);
    expect(g.pass(500, 1000 / 30)).toBe(true);
    expect(g.pass(510, 1000 / 30)).toBe(false);
  });
  it('0 = uncapped', () => {
    expect(count(120, 0)).toBe(120);
  });
});

describe('TierState', () => {
  it('drops to low after measured slow frames and tells subscribers once', () => {
    const s = new TierState(0, { touch: false, cores: 12 });
    const seen: string[] = [];
    s.subscribe((t) => seen.push(t));
    expect(s.tier).toBe('normal');
    expect(s.frameMs).toBeCloseTo(1000 / 60);
    for (let t = 0; t < 12000; t += 60) s.sample(60, t);
    expect(s.tier).toBe('low');
    expect(s.frameMs).toBeCloseTo(1000 / 30);
    for (let t = 12000; t < 20000; t += 16) s.sample(16, t);
    expect(seen).toEqual(['low']);
  });
  it('never auto-drops when measuring is off (artificial test frame cap)', () => {
    const s = new TierState(0, { touch: false, cores: 12 }, false);
    for (let t = 0; t < 12000; t += 160) s.sample(160, t);
    expect(s.tier).toBe('normal');
  });
  it('forceLowIfAuto: software GL drops an auto desktop to low at boot, once, and never auto-steps back', () => {
    const s = new TierState(0, { touch: false, cores: 12 });
    const seen: string[] = [];
    s.subscribe((t) => seen.push(t));
    expect(s.forceLowIfAuto()).toBe(true);
    expect(s.tier).toBe('low');
    expect(s.auto).toBe(false);
    expect(s.forceLowIfAuto()).toBe(false);
    for (let t = 0; t < 12000; t += 16) s.sample(16, t);
    expect(seen).toEqual(['low']);
  });
  it('forceLowIfAuto: no effect when measuring is off (explicit / test cap)', () => {
    const s = new TierState(0, { touch: false, cores: 12 }, false);
    expect(s.forceLowIfAuto()).toBe(false);
    expect(s.tier).toBe('normal');
  });
});

describe('SOFTWARE_RENDERER', () => {
  it('matches CPU rasterisers, not real GPUs', () => {
    for (const r of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Google SwiftShader',
    ])
      expect(SOFTWARE_RENDERER.test(r)).toBe(true);
    for (const r of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Apple GPU', 'Adreno (TM) 640', 'Mali-G78'])
      expect(SOFTWARE_RENDERER.test(r)).toBe(false);
  });
});

describe('renderScaleFor', () => {
  it('full resolution on the normal tier', () => {
    expect(renderScaleFor('normal', 3)).toBe(1);
  });
  it('low tier: scaled where the town is zoomed in, never below 1 canvas px per texel (phones)', () => {
    expect(renderScaleFor('low', 2.15)).toBe(LOW_RENDER_SCALE);
    expect(renderScaleFor('low', 1 / LOW_RENDER_SCALE)).toBe(LOW_RENDER_SCALE);
    expect(renderScaleFor('low', 0.975)).toBe(1);
    expect(renderScaleFor('low', 1.2)).toBe(1);
  });
});
