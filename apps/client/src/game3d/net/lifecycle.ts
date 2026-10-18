// v3 WP1 (v3-core). Build / rebuild / fallback orchestration of the 3D town (docs/v3/INTEGRATION.md §1.2 "Runtime perf
// sampler", "Crash", "Boot guard"; §1.3 "Rebuild"). The composition root (TownGame3d) supplies `build(tier, ctl)` (a
// NEW Engine + town + layers + warm-up, resolved when drawn) and `teardown()` (layers + engine; the net / input state
// survives a rebuild); this module decides when they run:
//
//   cancellation every build gets a BuildControl: once a newer build / a crash / destroy superseded it,
//                `ctl.isCurrent()` is false and `ctl.signal` aborts. build() MUST check it after every await and
//                before core.attachScene / host.start / core.setLayers, and dispose its own half-built Engine when
//                cancelled (teardown() only knows the attached one). A superseded build's result or error is ignored.
//   tier         onTier(t) runs before every build (wire: core.setTier) so Scene3dState.tier follows demotions,
//                promotions and the fx quality setting
//   start()      settles once, with the outcome of the LATEST build: resolves when a build is drawn (also after a
//                context loss during the first build restarted it), rejects when the town crashed to Classic,
//                resolves on destroy
//
//   boot guard   markBooting before every new Engine, BootTracker fed with the frames (clears the mark after 10 s
//                of stable frames), finish() on a clean teardown / destroy, crashed() on a crash
//   crash        a build error or a throw in the frame loop -> requestFallback('error') at once (never waits)
//   context loss the first loss within LOSS_WINDOW_MS (per page) rebuilds at once behind "Rebuilding town…" (never
//                three's partial restore), also during a (re)build (the running build is cancelled); the second
//                within the window -> Classic ('error')
//   perf         PerfSampler over rAF deltas after each first show: 'rebuild-low' -> rebuild at 'low', 'fallback' ->
//                requestFallback('perf'); an 'ok' sample at 'low' may promote to 'high' once (auto only, never
//                after a demotion); all three wait for a safe moment (SafeMoment: not during a vote / open
//                nomination; the next phase change or 60 s quiet)
//   tier change  requestTier(t) (fx quality setting) = a rebuild at the next safe moment; back to the current tier
//                drops a pending setting rebuild (a pending perf demotion / promotion is kept)
//
// Pure orchestration (no three, no DOM except the optional busy overlay helper); unit tested with fakes.
import { BootTracker, markBooting } from '../bootMark';
import type { FallbackReason, Tier } from '../contract';
import { PerfSampler, SafeMoment, samplerEnabled, type PerfFlags, type SafeMomentInput } from '../perf';

/** Two context losses within this window (ms) -> Classic. */
export const LOSS_WINDOW_MS = 10 * 60_000;
export const REBUILD_TEXT = 'Rebuilding town…';

/** Context losses of this page (a remount after a swap keeps counting). */
const pageLosses: number[] = [];
/** Test hook: forget the page's context losses. */
export function resetPageLosses(): void {
  pageLosses.length = 0;
}

export interface BootTrackerLike {
  rendered(): void;
  frame(dtMs: number): void;
  finish(): void;
  crashed(): void;
  dispose(): void;
}

export interface BootGuardIo {
  mark(): number;
  tracker(id: number): BootTrackerLike;
}

const realBoot: BootGuardIo = { mark: () => markBooting(), tracker: (id) => new BootTracker(id) };

export interface BusyOverlay {
  show(text: string): void;
  hide(): void;
}

/** Handed to every build(): false / aborted once a newer build, a crash or destroy superseded it. */
export interface BuildControl {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
}

export interface LifecycleDeps {
  startTier: Tier;
  /** A NEW Engine at this tier, drawn when it resolves. Check `ctl.isCurrent()` after each await (see header). */
  build(tier: Tier, ctl: BuildControl): Promise<void>;
  /** The tier the next build uses (before build(); wire: core.setTier). */
  onTier?(tier: Tier): void;
  teardown(): void;
  fallback(reason: FallbackReason): void;
  /** Phase / vote state for the safe-moment rule. */
  safe(): SafeMomentInput;
  flags: PerfFlags;
  /** The Graphics pref is 'auto' and nothing forced the low start (fx quality low): low -> high may be tried. */
  allowPromote?: boolean;
  overlay?: BusyOverlay;
  now?(): number;
  visible?(): boolean;
  boot?: BootGuardIo;
  /** A rebuild finished at this tier (debug / layers). */
  onRebuilt?(tier: Tier): void;
}

export type LifecycleState = 'idle' | 'building' | 'running' | 'rebuilding' | 'fallback' | 'destroyed';
type Pending = { kind: 'rebuild'; tier: Tier; why: 'perf' | 'promote' | 'setting' } | { kind: 'fallback' };

export class Lifecycle {
  private st: LifecycleState = 'idle';
  private cur: Tier;
  private tracker: BootTrackerLike | null = null;
  private sampler: PerfSampler | null = null;
  private readonly safe = new SafeMoment();
  private pending: Pending | null = null;
  private demoted = false;
  private promoted = false;
  private readonly boot: BootGuardIo;
  private readonly now: () => number;
  private readonly visible: () => boolean;
  /** Bumped by every (re)build, crash and destroy: a stale build's completion is ignored. */
  private gen = 0;
  private ctl: AbortController | null = null;
  /** start()'s promise: settled once, by the latest generation's outcome. */
  private started: { resolve(): void; reject(e: unknown): void } | null = null;

  constructor(private readonly d: LifecycleDeps) {
    this.cur = d.startTier;
    this.boot = d.boot ?? realBoot;
    this.now = d.now ?? (() => performance.now());
    this.visible = d.visible ?? (() => typeof document === 'undefined' || document.visibilityState === 'visible');
  }

  get state(): LifecycleState {
    return this.st;
  }
  get tier(): Tier {
    return this.cur;
  }
  /** A pending rebuild / swap waiting for a safe moment (debug). */
  get waiting(): string | null {
    return this.pending ? (this.pending.kind === 'fallback' ? 'fallback' : `rebuild:${this.pending.tier}`) : null;
  }

  /** The first build. Resolves when drawn; rejects (after requesting the Classic fallback) when it fails. */
  start(): Promise<void> {
    if (this.st !== 'idle') return Promise.reject(new Error('lifecycle already started'));
    this.st = 'building';
    const p = new Promise<void>((resolve, reject) => (this.started = { resolve, reject }));
    void this.runBuild(this.cur);
    return p;
  }

  /** One rendered frame (rAF delta, ms). Call after the render. */
  frame(dtMs: number): void {
    if (this.st !== 'running') return;
    this.tracker?.frame(dtMs);
    const s = this.sampler;
    if (s && !s.done) {
      s.sample(dtMs, this.visible());
      if (s.done && !this.pending) this.judge(s);
    }
    this.offer();
  }

  /** Feed the safe-moment rule without a frame (e.g. on a game view change). */
  offer(): void {
    if (this.st !== 'running') return;
    const ok = this.safe.offer(this.d.safe(), this.now());
    if (!ok || !this.pending) return;
    const p = this.pending;
    this.pending = null;
    if (p.kind === 'fallback') this.fallback('perf');
    else void this.rebuild(p.tier);
  }

  /** webglcontextlost on the current canvas. */
  contextLost(): void {
    if (this.st === 'destroyed' || this.st === 'fallback') return;
    const now = Date.now();
    while (pageLosses.length && now - pageLosses[0]! > LOSS_WINDOW_MS) pageLosses.shift();
    pageLosses.push(now);
    if (pageLosses.length >= 2) return this.crash(new Error('webglcontextlost (twice)'));
    this.pending = null;
    this.safe.cancel();
    // also while (re)building: that build is cancelled (its Engine lost the context too) and a new one starts
    void this.rebuild(this.cur);
  }

  /** A crash (frame loop throw, build error): Classic in place, now. */
  crash(e: unknown): void {
    if (this.st === 'destroyed' || this.st === 'fallback') return;
    console.error('[town3d] failed, switching to Classic:', e);
    this.supersede();
    this.tracker?.crashed();
    this.tracker = null;
    this.st = 'fallback';
    this.pending = null;
    this.d.overlay?.hide();
    this.d.fallback('error');
    this.settle(e);
  }

  /** The tier setting changed: rebuild at the next safe moment (no-op when already at that tier). */
  requestTier(t: Tier): void {
    if (this.st === 'destroyed' || this.st === 'fallback') return;
    if (t === this.cur) {
      // back to the tier we run at: drop a pending setting rebuild; keep a perf demotion / promotion / swap
      if (this.pending?.kind === 'rebuild' && this.pending.why === 'setting') {
        this.pending = null;
        this.safe.cancel();
      }
      return;
    }
    if (this.pending?.kind === 'fallback') return; // too slow for any tier: the swap to Classic stays
    this.schedule({ kind: 'rebuild', tier: t, why: 'setting' });
  }

  destroy(): void {
    if (this.st === 'destroyed') return;
    const crashed = this.st === 'fallback';
    this.st = 'destroyed';
    this.supersede();
    this.pending = null;
    this.d.overlay?.hide();
    if (!crashed) this.tracker?.finish(); // a clean destroy clears the boot mark
    this.tracker?.dispose();
    this.tracker = null;
    this.settle(null);
  }

  // ------------------------------------------------------------------ internals
  /** Cancel the running build (if any): its completion / error is ignored from now on. */
  private supersede(): void {
    this.gen++;
    this.ctl?.abort();
    this.ctl = null;
  }

  /** Settle start() once: null = resolve, else reject with it. */
  private settle(err: unknown): void {
    const s = this.started;
    if (!s) return;
    this.started = null;
    if (err === null) s.resolve();
    else s.reject(err);
  }

  private judge(s: PerfSampler): void {
    const v = s.verdict;
    if (v === 'rebuild-low') {
      this.demoted = true;
      this.schedule({ kind: 'rebuild', tier: 'low', why: 'perf' });
    } else if (v === 'fallback') this.schedule({ kind: 'fallback' });
    else if (v === 'ok' && this.cur === 'low' && this.d.allowPromote && !this.demoted && !this.promoted) {
      this.promoted = true;
      this.schedule({ kind: 'rebuild', tier: 'high', why: 'promote' });
    }
  }

  private schedule(p: Pending): void {
    this.pending = p;
    this.safe.schedule();
    this.offer();
  }

  private fallback(reason: FallbackReason): void {
    if (this.st === 'destroyed' || this.st === 'fallback') return;
    this.tracker?.finish(); // too slow is not a crash: the next load may try v3 again
    this.tracker = null;
    this.st = 'fallback';
    this.d.fallback(reason);
    this.settle(null);
  }

  private async rebuild(tier: Tier): Promise<void> {
    if (this.st === 'destroyed' || this.st === 'fallback') return;
    const first = this.st === 'building'; // a context loss during the first build: start() still waits
    this.st = first ? 'building' : 'rebuilding';
    this.supersede(); // a build still running is cancelled before its Engine is torn down
    this.d.overlay?.show(REBUILD_TEXT);
    // the old Engine goes first; it ran (also before a context loss, which is not an OOM), so its mark is clean
    this.tracker?.finish();
    this.tracker?.dispose();
    this.tracker = null;
    try {
      this.d.teardown();
    } catch (e) {
      console.warn('[town3d] teardown failed', e);
    }
    if (await this.runBuild(tier)) this.d.onRebuilt?.(tier);
  }

  /** One build generation. True when it is drawn and still current (now 'running'). Never throws. */
  private async runBuild(tier: Tier): Promise<boolean> {
    const g = ++this.gen;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.ctl = ac;
    const ctl: BuildControl = { signal: ac?.signal ?? NEVER_ABORTED, isCurrent: () => g === this.gen && this.st !== 'destroyed' && this.st !== 'fallback' };
    this.cur = tier;
    this.sampler = null;
    try {
      this.d.onTier?.(tier);
    } catch (e) {
      console.warn('[town3d] onTier failed', e);
    }
    const id = this.boot.mark();
    const tracker = this.boot.tracker(id);
    this.tracker = tracker;
    try {
      await this.d.build(tier, ctl);
    } catch (e) {
      if (ctl.isCurrent()) this.crash(e);
      else tracker.dispose(); // a superseded build failing (its Engine was disposed) is not a crash
      return false;
    }
    if (!ctl.isCurrent()) {
      tracker.dispose();
      return false;
    }
    if (this.ctl === ac) this.ctl = null;
    tracker.rendered();
    this.st = 'running';
    this.d.overlay?.hide();
    this.sampler = new PerfSampler(tier, samplerEnabled(this.d.flags));
    this.sampler.arm(); // after the warm-up and the first show
    this.settle(null);
    return true;
  }
}

const NEVER_ABORTED: AbortSignal = { aborted: false, reason: undefined, onabort: null, throwIfAborted() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as unknown as AbortSignal;

/** The "Rebuilding town…" overlay (DOM, textContent, CSSOM; pointer-events none). */
export function createBusyOverlay(parent: HTMLElement, doc: Document = document): BusyOverlay & { destroy(): void } {
  let el: HTMLDivElement | null = null;
  return {
    show(text) {
      if (!el) {
        el = doc.createElement('div');
        el.className = 'ct-v3-busy';
        el.setAttribute('role', 'status');
        const s = el.style;
        s.position = 'absolute';
        s.inset = '0';
        s.display = 'flex';
        s.alignItems = 'center';
        s.justifyContent = 'center';
        s.background = 'rgba(9,7,13,0.78)';
        s.color = '#e4d8ba';
        s.font = '15px/1.4 var(--ct-font-ui, sans-serif)';
        s.zIndex = '7';
        s.pointerEvents = 'none';
        parent.appendChild(el);
      }
      el.textContent = text;
    },
    hide() {
      el?.remove();
      el = null;
    },
    destroy() {
      el?.remove();
      el = null;
    },
  };
}

/**
 * Listen for webglcontextlost on a canvas (preventDefault: we rebuild, never wait for three's partial restore).
 * Returns the unsubscribe.
 */
export function watchContextLoss(canvas: Pick<HTMLCanvasElement, 'addEventListener' | 'removeEventListener'>, onLost: () => void): () => void {
  const lost = (e: Event) => {
    e.preventDefault();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', lost);
  return () => canvas.removeEventListener('webglcontextlost', lost);
}
