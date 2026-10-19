// v3.3 (release). May an 'auto' town that started at 'low' be promoted to 'high'? (docs/perf-v3/laptop.md §2-§3)
//
// Until v3.2 any 'ok' perf sample at 'low' (median rAF interval <= 45 ms) promoted to 'high'. On a 60 Hz cap that says
// nothing about headroom: the Intel Arc iGPU of the real-laptop baseline was promoted ~2.4 s after its first frame and
// then ran the vote at 52-55 fps (GPU 13-14.5 ms / frame at high vs 9-10 ms at low). Now promotion needs MEASURED
// headroom, from a short probe of outdoor frames at 'low':
//
//   1 GPU timer (EXT_disjoint_timer_query_webgl2, TIME_ELAPSED around engine.renderAt) available: promote only when
//     low's median GPU ms at the current canvas is <= PROMOTE_GPU_MS (high costs ~1.5-2x low's GPU time on the
//     measured GPUs, so high stays <= ~12 ms of the 16.7 ms frame), and the main thread has room too (CPU ms).
//     A renderer string that names an integrated GPU must clear the stricter PROMOTE_GPU_MS_INTEGRATED.
//   2 no GPU timer: an integrated GPU is never promoted; otherwise the probe runs UNCAPPED (no 60 fps / idle gate) and
//     low must hold <= PROMOTE_INTERVAL_MS per frame (~2x the 60 fps rate: visible only on a >= 120 Hz display; a
//     60 Hz display cannot show headroom, so it stays at low).
//
// Interiors (2-4 ms GPU even on the iGPU) would fake headroom, so only outdoor frames count; the probe waits while the
// player is indoors. Pure logic (no DOM / GL): the GL timer lives in vendor/engineHost.ts, the wiring in TownGame3d.ts.
import { median } from './perf';
import { isIntegratedGpu } from './select';

/** GPU ms per frame at 'low' (median, outdoor frames) at or under which 'high' is affordable. */
export const PROMOTE_GPU_MS = 6;
/** The same for a renderer string that names an integrated GPU ("clearly shows headroom"). */
export const PROMOTE_GPU_MS_INTEGRATED = 4.5;
/** Main-thread ms per frame at 'low' (frame step + render, median) at or under which 'high' is affordable. */
export const PROMOTE_CPU_MS = 8;
/** Without a GPU timer: the uncapped median frame interval at 'low' must be at or under this (>= ~118 fps). */
export const PROMOTE_INTERVAL_MS = 8.5;
/** Outdoor frames the probe collects (after skipping PROBE_SKIP). */
export const PROBE_FRAMES = 90;
export const PROBE_SKIP = 10;
/** GPU timer samples needed for path 1 (the rest of the window may lose results to disjoint events). */
export const PROBE_MIN_GPU = 45;

export interface PromoteEvidence {
  /** The WebGL renderer string. */
  gpu: string | null;
  /** The GPU timer exists on this context (path 1). */
  timer: boolean;
  /** GPU ms of the probed frames (timer results; may be fewer than the frames). */
  gpuMs: readonly number[];
  /** rAF intervals (ms) of the probed frames. */
  intervals: readonly number[];
  /** Main-thread ms of the probed frames (core + layers + renderAt). */
  cpuMs: readonly number[];
}

export interface PromoteDecision {
  promote: boolean;
  reason: 'gpu-headroom' | 'gpu-busy' | 'cpu-busy' | 'integrated-no-timer' | 'interval-headroom' | 'no-headroom' | 'no-samples';
  gpuMedian: number | null;
  cpuMedian: number;
  intervalMedian: number;
  integrated: boolean;
}

export function decidePromotion(e: PromoteEvidence): PromoteDecision {
  const integrated = isIntegratedGpu(e.gpu);
  const cpuMedian = median(e.cpuMs);
  const intervalMedian = median(e.intervals);
  const base = { cpuMedian, intervalMedian, integrated };
  if (!e.intervals.length) return { promote: false, reason: 'no-samples', gpuMedian: null, ...base };
  if (e.timer && e.gpuMs.length >= PROBE_MIN_GPU) {
    const gpuMedian = median(e.gpuMs);
    const limit = integrated ? PROMOTE_GPU_MS_INTEGRATED : PROMOTE_GPU_MS;
    if (gpuMedian > limit) return { promote: false, reason: 'gpu-busy', gpuMedian, ...base };
    if (cpuMedian > PROMOTE_CPU_MS) return { promote: false, reason: 'cpu-busy', gpuMedian, ...base };
    return { promote: true, reason: 'gpu-headroom', gpuMedian, ...base };
  }
  // path 2: no (usable) GPU timer
  if (integrated) return { promote: false, reason: 'integrated-no-timer', gpuMedian: null, ...base };
  if (cpuMedian > PROMOTE_CPU_MS) return { promote: false, reason: 'cpu-busy', gpuMedian: null, ...base };
  if (intervalMedian <= PROMOTE_INTERVAL_MS) return { promote: true, reason: 'interval-headroom', gpuMedian: null, ...base };
  return { promote: false, reason: 'no-headroom', gpuMedian: null, ...base };
}

/** Collects the probe window (outdoor frames only). */
export class PromotionProbe {
  private skip = PROBE_SKIP;
  readonly gpuMs: number[] = [];
  readonly intervals: number[] = [];
  readonly cpuMs: number[] = [];
  constructor(
    readonly gpu: string | null,
    readonly timer: boolean,
    readonly frames = PROBE_FRAMES,
  ) {}
  /** One drawn frame. `outdoors` false = not counted (the probe waits). `gpu` = timer results that arrived. */
  frame(intervalMs: number, cpuMs: number, outdoors: boolean, gpu: readonly number[] = []): void {
    if (this.done) return;
    if (!outdoors) return;
    if (this.skip > 0) {
      this.skip--;
      return;
    }
    if (intervalMs > 0 && intervalMs <= 250) this.intervals.push(intervalMs);
    if (cpuMs >= 0) this.cpuMs.push(cpuMs);
    for (const g of gpu) if (g > 0 && g < 250) this.gpuMs.push(g);
  }
  get done(): boolean {
    return this.intervals.length >= this.frames;
  }
  evidence(): PromoteEvidence {
    return { gpu: this.gpu, timer: this.timer, gpuMs: this.gpuMs, intervals: this.intervals, cpuMs: this.cpuMs };
  }
}
