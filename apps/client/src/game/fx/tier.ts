// Town render tier (OWNED BY world-art). Purely client-side rendering choices; nothing here is
// sent anywhere or changes what the server lets this client see.
//
//   normal  frame cap 60 fps (120 Hz screens no longer render twice as often), full ambience
//   low     frame cap 30 fps, fewer fireflies / townsfolk / pigeons, no chimney smoke, and (where
//           the town is zoomed in, i.e. desktops) the canvas rendered at 75 % of its CSS size and
//           upscaled with image-rendering: pixelated — still hard-edged pixels, ~45 % less fill
//           (software / weak GPUs are fill-rate bound). Never below 1 canvas px per world texel,
//           so phones (zoom ~1) keep full resolution.
//
// Automatic ('auto', the default): low on coarse-pointer (touch) devices and on <= 4 logical cores
// from the start, at boot when the GL renderer is a software rasteriser (TownGame.ts, before the
// first scene frame: no 10 s of slow frames + a resize stall later), and on any device once the frame-time p95 stays above 33 ms over a 5 s window
// (never steps back up within a session — no oscillating). Override: the Settings "Graphics
// quality" radio writes localStorage 'ct.fxQuality' ('low' = low, 'medium' / 'high' = normal, never
// auto-drops; 'auto' = automatic), re-read about once a second.
import { readQualityPref, type FxQualityPref } from './quality';

export type RenderTier = 'normal' | 'low';

/** Frame interval per tier (ms). */
export const TIER_FRAME_MS: Record<RenderTier, number> = { normal: 1000 / 60, low: 1000 / 30 };

/** Canvas render scale on the low tier (see renderScaleFor). */
export const LOW_RENDER_SCALE = 0.75;

/**
 * Canvas px per CSS px for a tier at the town's outdoor zoom (world px -> CSS px): 1 on the normal
 * tier, LOW_RENDER_SCALE on the low tier unless that would put a world texel below 1 canvas px.
 */
export function renderScaleFor(tier: RenderTier, cssZoom: number): number {
  return tier === 'low' && cssZoom * LOW_RENDER_SCALE >= 1 ? LOW_RENDER_SCALE : 1;
}

/** Ambience on the low tier: how many of each (the rest stay hidden and are not stepped). */
export const LOW_TIER_AMBIENCE = { fireflies: 6, townsfolk: 2, pigeons: 1, smoke: false } as const;

export interface DeviceHints {
  /** Primary pointer is coarse (phones / tablets). */
  touch: boolean;
  /** navigator.hardwareConcurrency (0 = unknown). */
  cores: number;
}

/** The tier a preference + device start at, and whether measured slow frames may still lower it. */
export function initialTier(pref: FxQualityPref, d: DeviceHints): { tier: RenderTier; auto: boolean } {
  if (pref === 'low') return { tier: 'low', auto: false };
  if (pref === 'medium' || pref === 'high') return { tier: 'normal', auto: false };
  const weak = d.touch || (d.cores > 0 && d.cores <= 4);
  return { tier: weak ? 'low' : 'normal', auto: !weak };
}

export function deviceHints(): DeviceHints {
  let touch = false;
  try {
    touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    // no matchMedia
  }
  return { touch, cores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 0 };
}

/**
 * "Frame p95 > 33 ms for 5 s": keeps the frame intervals of the last `windowMs` and reports true
 * once a full window (after the warm-up: texture uploads, shader compiles) has a p95 above the
 * limit. Hidden tabs and long stalls (> 250 ms: tab switches, alerts, GC) restart the window.
 */
export class SlowFrameWatch {
  private times: number[] = [];
  private deltas: number[] = [];
  private since = -1;
  private nextCheck = 0;
  constructor(
    private readonly startAt: number,
    private readonly o = { warmupMs: 4000, windowMs: 5000, p95Ms: 33 },
  ) {}

  sample(deltaMs: number, now: number, hidden: boolean): boolean {
    if (now < this.startAt + this.o.warmupMs) return false;
    if (hidden || !(deltaMs > 0) || deltaMs > 250) {
      this.times.length = 0;
      this.deltas.length = 0;
      this.since = -1;
      return false;
    }
    if (this.since < 0) this.since = now;
    this.times.push(now);
    this.deltas.push(deltaMs);
    let drop = 0;
    while (drop < this.times.length && this.times[drop]! < now - this.o.windowMs) drop++;
    if (drop) {
      this.times.splice(0, drop);
      this.deltas.splice(0, drop);
    }
    if (now - this.since < this.o.windowMs || now < this.nextCheck) return false;
    this.nextCheck = now + 500;
    return p95(this.deltas) > this.o.p95Ms;
  }
}

/** GL renderer strings of CPU rasterisers (same family as game3d/select.ts SOFTWARE_GL, plus Windows' WARP). */
export const SOFTWARE_RENDERER = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

export function p95(v: readonly number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]!;
}

/**
 * Frame gate for a capped loop on any refresh rate: run a frame when at least one interval (minus
 * a little jitter tolerance) has passed on a fixed time grid, so 60 Hz screens get every frame at
 * the 60 cap, 120 Hz every other one, 90 Hz an even 60 on average, and 30 fps stays steady.
 */
export class FrameGate {
  private next = -1;
  /** true = render this rAF tick. */
  pass(now: number, intervalMs: number): boolean {
    if (intervalMs <= 0) return true;
    const tol = Math.min(3, intervalMs * 0.2);
    if (this.next >= 0 && now < this.next - tol) return false;
    // advance on the grid; resync after a stall instead of bursting to catch up
    this.next = this.next < 0 || now - this.next > intervalMs ? now + intervalMs : this.next + intervalMs;
    return true;
  }
  reset() {
    this.next = -1;
  }
}

/** Shared between the Phaser bootstrap (frame gate) and the scene (ambience counts). */
export class TierState {
  tier: RenderTier;
  auto: boolean;
  /** Canvas px per CSS px currently applied by the bootstrap (1 = full resolution). */
  renderScale = 1;
  private subs = new Set<(t: RenderTier) => void>();
  private watch: SlowFrameWatch;
  private pref: FxQualityPref;
  private nextPoll = 0;
  constructor(
    now: number,
    private readonly device: DeviceHints = deviceHints(),
    /** false: frame times are artificial (the ct.debug.fps test cap) — never auto-drop. */
    private readonly measure = true,
  ) {
    this.pref = readQualityPref();
    const t = initialTier(this.pref, device);
    this.tier = t.tier;
    this.auto = t.auto && measure;
    this.watch = new SlowFrameWatch(now);
  }
  get frameMs(): number {
    return TIER_FRAME_MS[this.tier];
  }
  /** Feed one rendered frame's interval; re-reads the preference about once a second. */
  sample(deltaMs: number, now: number) {
    if (now >= this.nextPoll) {
      this.nextPoll = now + 1000;
      const p = readQualityPref();
      if (p !== this.pref) {
        this.pref = p;
        const t = initialTier(p, this.device);
        this.auto = t.auto && this.measure;
        this.watch = new SlowFrameWatch(now);
        this.set(t.tier);
      }
    }
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (this.auto && this.tier === 'normal' && this.watch.sample(deltaMs, now, hidden)) {
      this.auto = false;
      this.set('low');
    }
  }
  /**
   * The renderer is known to be slow before any frame was measured (software GL): drop to the low
   * tier now instead of after the 4 s warm-up + 5 s slow-frame window. Only on 'auto' (an explicit
   * preference wins) and only downwards; returns whether it dropped.
   */
  forceLowIfAuto(): boolean {
    if (!this.auto || this.tier !== 'normal') return false;
    this.auto = false;
    this.set('low');
    return true;
  }
  subscribe(fn: (t: RenderTier) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  private set(t: RenderTier) {
    if (t === this.tier) return;
    this.tier = t;
    for (const fn of this.subs) fn(t);
  }
}
