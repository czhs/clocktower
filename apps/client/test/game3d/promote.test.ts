// v3.3 (release): the low -> high promotion decision (game3d/promote.ts) and the GPU frame timer (vendor/gpuTimer.ts).
// Numbers from the real-laptop baseline (docs/perf-v3/laptop.md): Intel Arc iGPU at low = GPU 9-10 ms outdoors,
// interiors 2.4-2.6 ms; NVIDIA RTX 4070 laptop at low = 3.2-3.7 ms.
import { describe, expect, it } from 'vitest';
import { decidePromotion, PROBE_FRAMES, PROBE_MIN_GPU, PROBE_SKIP, PROMOTE_GPU_MS, PromotionProbe, type PromoteEvidence } from '../../src/game3d/promote';
import { isIntegratedGpu, startingTier } from '../../src/game3d/select';
import { createGpuFrameTimer, type TimerGl } from '../../src/game3d/vendor/gpuTimer';

const INTEL = 'ANGLE (Intel, Mesa Intel(R) Arc(tm) Graphics (MTL), OpenGL ES 3.2)';
const NVIDIA = 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4070 Laptop GPU/PCIe/SSE2, OpenGL ES 3.2)';
const fill = (n: number, v: number) => Array.from({ length: n }, () => v);
const ev = (o: Partial<PromoteEvidence>): PromoteEvidence => ({ gpu: NVIDIA, timer: true, gpuMs: fill(90, 3.5), intervals: fill(90, 16.7), cpuMs: fill(90, 3.5), ...o });

describe('integrated GPU strings', () => {
  it.each([
    [INTEL, true],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', true],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', true],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', true],
    ['ANGLE (AMD, AMD Radeon Graphics (radeonsi, renoir, LLVM 15.0.7, DRM 3.54), OpenGL 4.6)', true],
    ['ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', false],
    ['ANGLE (AMD, Radeon Pro W6800, OpenGL 4.6)', false],
    [NVIDIA, false],
    ['Apple GPU', true],
    [null, false],
  ])('%s -> %s', (gpu, want) => {
    expect(isIntegratedGpu(gpu)).toBe(want);
  });
  it('AMD APUs start at low (row 9), a discrete Radeon at high', () => {
    expect(startingTier({ fxLow: false, coarsePointer: false }, 'AMD Radeon(TM) Graphics')).toBe('low');
    expect(startingTier({ fxLow: false, coarsePointer: false }, 'AMD Radeon RX 7900 XTX')).toBe('high');
  });
});

describe('decidePromotion', () => {
  it('the laptop iGPU at low (GPU 9-10 ms) stays at low', () => {
    const d = decidePromotion(ev({ gpu: INTEL, gpuMs: fill(90, 9.6) }));
    expect(d).toMatchObject({ promote: false, reason: 'gpu-busy', integrated: true });
    expect(d.gpuMedian).toBeCloseTo(9.6);
  });
  it('a fast discrete GPU at low (3.5 ms) is promoted; at the limit too; just over it is not', () => {
    expect(decidePromotion(ev({})).promote).toBe(true);
    expect(decidePromotion(ev({ gpuMs: fill(90, PROMOTE_GPU_MS) })).promote).toBe(true);
    expect(decidePromotion(ev({ gpuMs: fill(90, PROMOTE_GPU_MS + 0.2) })).reason).toBe('gpu-busy');
  });
  it('an integrated GPU needs CLEAR headroom (4.5 ms), not just the 6 ms of a discrete one', () => {
    expect(decidePromotion(ev({ gpu: INTEL, gpuMs: fill(90, 5.5) })).promote).toBe(false);
    expect(decidePromotion(ev({ gpu: INTEL, gpuMs: fill(90, 4) })).reason).toBe('gpu-headroom');
  });
  it('a busy main thread blocks the promotion even with GPU headroom', () => {
    expect(decidePromotion(ev({ cpuMs: fill(90, 11) })).reason).toBe('cpu-busy');
  });
  it('too few timer results falls back to the frame-interval path', () => {
    expect(decidePromotion(ev({ gpuMs: fill(PROBE_MIN_GPU - 1, 2) })).reason).toBe('no-headroom'); // 60 Hz: no visible headroom
    expect(decidePromotion(ev({ gpuMs: fill(PROBE_MIN_GPU - 1, 2), intervals: fill(90, 8.3) })).reason).toBe('interval-headroom'); // held 120 Hz uncapped
  });
  it('no timer: an integrated GPU is never promoted, even at 120 Hz', () => {
    expect(decidePromotion(ev({ gpu: INTEL, timer: false, gpuMs: [], intervals: fill(90, 8.3) })).reason).toBe('integrated-no-timer');
  });
  it('no samples: no promotion', () => {
    expect(decidePromotion(ev({ intervals: [], gpuMs: [] })).reason).toBe('no-samples');
  });
});

describe('PromotionProbe', () => {
  it('skips the first frames, counts outdoor frames only, finishes after PROBE_FRAMES', () => {
    const p = new PromotionProbe(INTEL, true);
    for (let i = 0; i < 500; i++) p.frame(16.7, 3, false, [2.5]); // indoors: interiors would fake headroom
    expect(p.intervals.length).toBe(0);
    expect(p.gpuMs.length).toBe(0);
    for (let i = 0; i < PROBE_SKIP + PROBE_FRAMES - 1; i++) p.frame(16.7, 3, true, [9.5]);
    expect(p.done).toBe(false);
    p.frame(16.7, 3, true, [9.5]);
    expect(p.done).toBe(true);
    expect(decidePromotion(p.evidence()).promote).toBe(false);
  });
});

describe('GPU frame timer', () => {
  function fakeGl(o: { ext?: boolean; foreign?: boolean; disjoint?: boolean } = {}) {
    let next = 1;
    let current: object | null = o.foreign ? { foreign: true } : null;
    const results = new Map<object, number>();
    const live = new Set<object>();
    const gl: TimerGl & { live: Set<object>; finish(ns: number): void } = {
      QUERY_RESULT_AVAILABLE: 1,
      QUERY_RESULT: 2,
      CURRENT_QUERY: 3,
      live,
      getExtension: (n) => (o.ext === false ? null : n === 'EXT_disjoint_timer_query_webgl2' ? {} : null),
      createQuery: () => {
        const q = { id: next++ };
        live.add(q);
        return q as unknown as WebGLQuery;
      },
      deleteQuery: (q) => void live.delete(q as object),
      beginQuery: (_t, q) => void (current = q as object),
      endQuery: () => void (current = null),
      getQuery: () => current as WebGLQuery | null,
      getQueryParameter: (q, p) => (p === 1 ? results.has(q as object) : results.get(q as object)),
      getParameter: () => !!o.disjoint,
      isContextLost: () => false,
      finish(ns) {
        for (const q of live) if (!results.has(q)) results.set(q, ns);
      },
    };
    return gl;
  }
  it('null without the extension', () => {
    expect(createGpuFrameTimer(fakeGl({ ext: false }))).toBeNull();
  });
  it('times enabled frames only, reads results without blocking, frees its queries', () => {
    const gl = fakeGl();
    const t = createGpuFrameTimer(gl)!;
    t.begin();
    t.end();
    expect(gl.live.size).toBe(0); // disabled: nothing
    t.enable(true);
    t.begin();
    t.end();
    expect(t.drain()).toEqual([]); // not available yet
    gl.finish(9_500_000);
    expect(t.drain()).toEqual([9.5]);
    expect(gl.live.size).toBe(0);
  });
  it('never nests inside a query someone else opened; drops disjoint results', () => {
    const f = fakeGl({ foreign: true });
    const t = createGpuFrameTimer(f)!;
    t.enable(true);
    t.begin();
    t.end();
    expect(f.live.size).toBe(0);
    const d = fakeGl({ disjoint: true });
    const u = createGpuFrameTimer(d)!;
    u.enable(true);
    u.begin();
    u.end();
    d.finish(5_000_000);
    expect(u.drain()).toEqual([]);
  });
});
