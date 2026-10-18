// v3 WP0 (v3-lead). Runtime perf sampler + safe-moment rule for the 3D town (docs/v3/INTEGRATION.md §1.2
// "Runtime perf sampler"). Pure logic (no three, no DOM); WP1 wires it into the loop and the rebuild /
// fallback orchestration.
//
//   - off when ct.debug.fps > 0 or ct.debug.v3force = '1' (artificial frame times), unless
//     ct.debug.v3perfFallback = '1' (the v3-fallback e2e turns it back on);
//   - samples rAF deltas (not engine.lastFrameMs, which is CPU only), only while the tab is visible,
//     dropping deltas > 250 ms; window = 120 accepted frames after the shader warm-up and first show;
//   - verdict: median > 45 ms is too slow (a 30 fps Energy Saver cap = 33.3 ms never trips it);
//     at 'high' -> rebuild at 'low', at 'low' -> rebuild at 'cpu' (v3 perf cpu), at 'cpu' -> fall back to Classic
//     when the median is > 66 ms (under 15 fps; the cpu tier's own frame cap is 30 fps = 33.3 ms);
//   - a scheduled rebuild / promotion / swap waits for a safe moment (not while voting or a nomination is
//     open; at the next phase change, or after 60 s with no nomination). Crash swaps never wait.
import type { GamePhase } from '@ct/protocol';
import type { Tier } from './contract';

export const PERF_WINDOW = 120;
export const PERF_DROP_MS = 250;
export const PERF_SLOW_MEDIAN_MS = 45;
/** The 'cpu' tier (software GL) aims at ≥ 20 fps; only under 15 fps is Classic the better deal. */
export const PERF_SLOW_MEDIAN_CPU_MS = 66;
export const SAFE_IDLE_MS = 60_000;

export type PerfVerdict = 'pending' | 'ok' | 'rebuild-low' | 'rebuild-cpu' | 'fallback';

/** The median rAF delta (ms) above which a tier is too slow. */
export function slowMedianMs(tier: Tier): number {
  return tier === 'cpu' ? PERF_SLOW_MEDIAN_CPU_MS : PERF_SLOW_MEDIAN_MS;
}

export interface PerfFlags {
  fpsLimit: number;
  force: boolean;
  /** ct.debug.v3perfFallback = '1' */
  perfFallback: boolean;
}

/** Is the sampler on? */
export function samplerEnabled(f: PerfFlags): boolean {
  if (f.perfFallback) return true;
  return !(f.fpsLimit > 0) && !f.force;
}

export function readPerfFlags(s: Pick<Storage, 'getItem'> | null): PerfFlags {
  const get = (k: string) => {
    try {
      return s?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  return { fpsLimit: Number(get('ct.debug.fps') ?? 0) || 0, force: get('ct.debug.v3force') === '1', perfFallback: get('ct.debug.v3perfFallback') === '1' };
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

/** One sampling window at a tier. Feed rAF deltas; read `verdict` once `done`. */
export class PerfSampler {
  private frames: number[] = [];
  private armed = false;
  constructor(
    readonly tier: Tier,
    readonly enabled: boolean,
    readonly windowSize = PERF_WINDOW,
  ) {}
  /** Start counting (after the shader warm-up and the first show). */
  arm(): void {
    this.armed = true;
  }
  /** One rAF delta (ms); `visible` = document.visibilityState === 'visible'. Returns true when it was accepted. */
  sample(deltaMs: number, visible: boolean): boolean {
    if (!this.enabled || !this.armed || this.done) return false;
    if (!visible || !(deltaMs > 0) || deltaMs > PERF_DROP_MS) return false;
    this.frames.push(deltaMs);
    return true;
  }
  get accepted(): number {
    return this.frames.length;
  }
  get done(): boolean {
    return this.frames.length >= this.windowSize;
  }
  get median(): number {
    return median(this.frames);
  }
  get verdict(): PerfVerdict {
    if (!this.enabled) return 'ok';
    if (!this.done) return 'pending';
    if (this.median <= slowMedianMs(this.tier)) return 'ok';
    return this.tier === 'high' ? 'rebuild-low' : this.tier === 'low' ? 'rebuild-cpu' : 'fallback';
  }
}

export interface SafeMomentInput {
  phase: GamePhase | 'waiting' | 'finished';
  /** game.day.status === 'voting' */
  voting: boolean;
  /** A nomination is open (nominee chosen, vote not resolved). */
  nominationOpen: boolean;
}

/**
 * Safe-moment scheduler: holds a pending action until it may run. `offer` returns true when the action
 * should run now. Runs at once when nothing is in progress; while a vote / nomination is open it waits for
 * the next phase change, or for SAFE_IDLE_MS without a nomination.
 */
export class SafeMoment {
  private phase: string | null = null;
  private quietSince: number | null = null;
  private pending = false;
  private pendingPhase: string | null = null;
  schedule(): void {
    this.pending = true;
    this.pendingPhase = this.phase;
  }
  get isPending(): boolean {
    return this.pending;
  }
  cancel(): void {
    this.pending = false;
  }
  /** Feed the current state each frame (or on change). True = run the pending action now (it is consumed). */
  offer(s: SafeMomentInput, now: number): boolean {
    const phaseChanged = this.phase !== null && s.phase !== this.phase;
    this.phase = s.phase;
    const busy = s.voting || s.nominationOpen;
    if (busy) this.quietSince = null;
    else if (this.quietSince === null) this.quietSince = now;
    if (!this.pending) return false;
    if (this.pendingPhase === null) this.pendingPhase = s.phase;
    const ok = !busy || (phaseChanged && s.phase !== this.pendingPhase) || (this.quietSince !== null && now - this.quietSince >= SAFE_IDLE_MS);
    if (ok) this.pending = false;
    return ok;
  }
}

// ------------------------------------------------------------------ frame loop

export interface FrameLoopDeps {
  raf(cb: () => void): number;
  caf(id: number): void;
  now(): number;
}

export interface FrameLoopOptions {
  /** ct.debug.fps: cap the loop (tests); 0 = every animation frame. */
  fpsLimit?: number;
  /** One frame: `t` = seconds since start (+2 warm-up frames), monotonic; `dtMs` = time since the last frame. */
  step(t: number, dtMs: number): void;
  /** The first throw from `step` stops the loop for good and lands here (TownGame3d: crash -> Classic). */
  onError?(e: unknown): void;
}

export interface FrameLoop {
  stop(): void;
  readonly running: boolean;
}

/**
 * The 3D town's rAF loop (engineHost.start). A throw in a frame (a vendor updater, a layer, the character)
 * must not repeat every frame forever: it cancels the loop and reports once via onError.
 */
export function runFrameLoop(o: FrameLoopOptions, deps: FrameLoopDeps): FrameLoop {
  let t = 2 / 60;
  let prev = deps.now();
  let lastDraw = -Infinity;
  let id = 0;
  let running = true;
  const minGap = o.fpsLimit && o.fpsLimit > 0 ? 1000 / o.fpsLimit - 1 : 0;
  const stop = () => {
    if (!running) return;
    running = false;
    if (id) deps.caf(id);
    id = 0;
  };
  const loop = () => {
    if (!running) return;
    id = deps.raf(loop);
    const now = deps.now();
    if (minGap > 0 && now - lastDraw < minGap) return;
    lastDraw = now;
    const dtMs = now - prev;
    prev = now;
    // a hidden tab resumes where it stopped (never a jump of more than 0.25 s)
    t += Math.min(0.25, Math.max(0, dtMs / 1000));
    try {
      o.step(t, dtMs);
    } catch (e) {
      stop();
      o.onError?.(e);
    }
  };
  id = deps.raf(loop);
  return {
    stop,
    get running() {
      return running;
    },
  };
}
