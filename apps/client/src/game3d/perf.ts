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
  /** requestAnimationFrame: the callback gets the frame timestamp (ms; the frame gate uses it, else now()). */
  raf(cb: (ts?: number) => void): number;
  caf(id: number): void;
  now(): number;
}

/**
 * v3 perf(learn): the 3D town's default frame cap (docs/perf-v3/learnings.md §3.1). rAF follows the display, so a
 * 120-165 Hz laptop panel would render 2-2.75x the frames of a 60 Hz one, for no visible gain in a texel-snapped
 * pixel-art town, at 2-2.75x the CPU, GPU and battery. Displays up to ~78 Hz are never gated (a 59.9 / 60.5 Hz panel
 * renders every vsync exactly as before); 120 / 240 Hz render every 2nd / 4th vsync; 144 / 165 Hz pick the vsync
 * nearest to each 1/60 s. ct.debug.fps overrides it.
 */
export const V3_MAX_FPS = 60;

/** A display at most this much faster than the cap renders every frame (rather than judder at 75 Hz). */
const GATE_UNGATED_RATIO = 1.3;

/**
 * Phase-locked frame gate. `gate(ts)` (ts = the rAF timestamp, ms) is true when the frame at `ts` should be drawn to
 * hold `fps` on average: the next due time advances by exactly one interval per drawn frame and a frame is drawn when it
 * is the vsync nearest to that due time (half the measured vsync interval of slack); a stall of more than one interval
 * re-locks to now instead of bursting. fps <= 0: every frame.
 */
export function createFrameGate(fps: number): (ts: number) => boolean {
  if (!(fps > 0)) return () => true;
  const interval = 1000 / fps;
  let due = -Infinity;
  let prev: number | null = null;
  let vsync = 1000 / 60; // measured display interval (EMA of rAF deltas)
  return (ts) => {
    if (prev !== null) {
      const d = ts - prev;
      if (d > 0 && d < 100) vsync += (Math.min(d, 50) - vsync) * 0.1;
    }
    prev = ts;
    if (vsync * GATE_UNGATED_RATIO >= interval) return true;
    if (ts < due - vsync / 2) return false;
    due = ts - due > interval ? ts + interval : due + interval;
    return true;
  };
}

// ------------------------------------------------------------------ idle rendering (v3.2, fullstack.md lever 2)

/**
 * v3.2 perf: the frame rate while nothing on screen changes (no camera move, nobody moving / talking, no vote, no
 * recent input or state change; game3d/idle.ts decides). The waiting room, a still discussion and a night alone in a
 * house cost the same per frame as walking (fullstack.md §6): half the frames there halves the GPU and main-thread
 * work, and only the ambient motion (wind, water, fireflies, idle breathing) steps at 30 Hz. Any input or change snaps
 * back to the full rate on the very next vsync.
 */
export const V3_IDLE_FPS = 30;
/** After the last change / input, hold the full rate this long (covers door swings 1.5 s, fades, the die hold 1.5 s). */
export const IDLE_LINGER_MS = 3000;

/** Is idle rendering on? Off under ct.debug.fps (tests / perf runs own the frame rate) and ct.debug.v3idle = '0'. */
export function idleEnabled(s: Pick<Storage, 'getItem'> | null): boolean {
  try {
    if (s?.getItem('ct.debug.v3idle') === '0') return false;
    return !Number(s?.getItem('ct.debug.fps') ?? 0);
  } catch {
    return true;
  }
}

/** The pose fields that change what is drawn. */
interface PoseLike {
  x: number;
  y: number;
  location: string;
  facing: string;
  moving: boolean;
}

export interface ActivityFrame {
  me: PoseLike | null;
  remotes: ReadonlyMap<string, PoseLike>;
  hour: number;
  /** The camera's view-projection (16 numbers) and the texel-snap offset of this frame. */
  viewProj: ArrayLike<number>;
  offsetX: number;
  offsetY: number;
  /** Something animates on its own this frame (camera transition, a vote / nomination, somebody talking). */
  busy: boolean;
}

/** What made the last frame active (debug: `__ctCamera.camera3d().idle`). */
export type ActivityReason = 'none' | 'busy' | 'camera' | 'pose' | 'hour' | 'wake';

const CAM_EPS = 1e-6;
const POS_EPS = 1e-3;

/**
 * "Something changed" for idle rendering. `observe()` once per drawn frame compares it with the previous one;
 * `wake()` (input, a state / chat / voice change, a teleport, a door) holds the full rate for `linger` ms. `idle()`
 * = nothing changed for `linger` ms. Pure: no DOM, no three.
 */
export class ActivityWatch {
  private until = -Infinity;
  private vp = new Float64Array(16);
  private off: [number, number] = [NaN, NaN];
  private hour = NaN;
  private me: [number, number, string, string] | null = null;
  private poses = new Map<string, [number, number, string, string]>();
  /** Reason for the last active frame / wake. */
  reason: ActivityReason = 'none';
  /** Debug: which pose made the last 'pose' frame active ('me' / a remote pid, + 'moving' / 'moved' / 'new' / 'gone'). */
  detail = '';
  constructor(
    private readonly now: () => number,
    private readonly linger = IDLE_LINGER_MS,
  ) {}
  wake(): void {
    this.until = this.now() + this.linger;
    this.reason = 'wake';
  }
  idle(): boolean {
    return this.now() >= this.until;
  }
  /** One drawn frame. Returns true when it was active (and holds the full rate for `linger`). */
  observe(f: ActivityFrame): boolean {
    let why: ActivityReason = 'none';
    if (f.busy) why = 'busy';
    // always refresh the stored copies (cheap: 16 + 2 numbers + one tuple per pose)
    let cam = false;
    for (let i = 0; i < 16; i++) {
      const v = f.viewProj[i] ?? 0;
      if (Math.abs(v - this.vp[i]!) > CAM_EPS * Math.max(1, Math.abs(v))) cam = true;
      this.vp[i] = v;
    }
    if (f.offsetX !== this.off[0] || f.offsetY !== this.off[1]) cam = true;
    this.off[0] = f.offsetX;
    this.off[1] = f.offsetY;
    if (cam && why === 'none') why = 'camera';
    // (the first frame: this.hour is NaN -> the comparison is false -> active)
    if (!(Math.abs(f.hour - this.hour) <= 1e-6) && why === 'none') why = 'hour';
    this.hour = f.hour;
    let pose = false;
    if (f.me) {
      if (f.me.moving || !this.me || !samePose(this.me, f.me)) {
        pose = true;
        this.detail = `me ${f.me.moving ? 'moving' : 'moved'}`;
      }
      if (!this.me) this.me = [0, 0, '', ''];
      copyPose(this.me, f.me);
    } else if (this.me) {
      pose = true;
      this.detail = 'me gone';
      this.me = null;
    }
    if (f.remotes.size !== this.poses.size) {
      pose = true;
      this.detail = 'remotes count';
    }
    for (const [pid, p] of f.remotes) {
      let q = this.poses.get(pid);
      if (!q) {
        pose = true;
        this.detail = `${pid} new`;
        this.poses.set(pid, (q = [0, 0, '', '']));
      } else if (p.moving || !samePose(q, p)) {
        pose = true;
        this.detail = `${pid} ${p.moving ? 'moving' : 'moved'}`;
      }
      copyPose(q, p);
    }
    if (this.poses.size > f.remotes.size) for (const pid of [...this.poses.keys()]) if (!f.remotes.has(pid)) this.poses.delete(pid);
    if (pose && why === 'none') why = 'pose';
    if (why === 'none') return false;
    this.reason = why;
    this.until = this.now() + this.linger;
    return true;
  }
}

function samePose(q: [number, number, string, string], p: PoseLike): boolean {
  return Math.abs(q[0] - p.x) <= POS_EPS && Math.abs(q[1] - p.y) <= POS_EPS && q[2] === p.location && q[3] === p.facing;
}
function copyPose(q: [number, number, string, string], p: PoseLike): void {
  q[0] = p.x;
  q[1] = p.y;
  q[2] = p.location;
  q[3] = p.facing;
}

export interface FrameLoopOptions {
  /** ct.debug.fps: cap the loop (tests); 0 = every animation frame (up to maxFps). Wins over maxFps. */
  fpsLimit?: number;
  /** The default cap when no fpsLimit is set (engineHost: V3_MAX_FPS); 0 / unset = every animation frame. */
  maxFps?: number;
  /**
   * v3.2 idle rendering: while `isIdle()` is true the loop draws at most `idleFps` (on top of the cap above; a lower
   * cap, e.g. the cpu tier's 30 fps, is never raised). The check runs per vsync, so a wake draws on the next one.
   */
  idleFps?: number;
  isIdle?(): boolean;
  /** v3.3 promotion probe (promote.ts path 2): while true every animation frame is drawn (no cap, no idle gate). */
  uncapped?(): boolean;
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
  let id = 0;
  let running = true;
  const gate = createFrameGate(o.fpsLimit && o.fpsLimit > 0 ? o.fpsLimit : (o.maxFps ?? 0));
  const idleGate = o.isIdle && o.idleFps && o.idleFps > 0 ? createFrameGate(o.idleFps) : null;
  const stop = () => {
    if (!running) return;
    running = false;
    if (id) deps.caf(id);
    id = 0;
  };
  const loop = (ts?: number) => {
    if (!running) return;
    id = deps.raf(loop);
    const now = deps.now();
    const at = typeof ts === 'number' && ts > 0 ? ts : now;
    if (!o.uncapped?.()) {
      if (!gate(at)) return;
      if (idleGate && o.isIdle!() && !idleGate(at)) return;
    }
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
