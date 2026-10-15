// FX quality tiers (OWNED BY world-art / assets-fx). Purely client-side rendering choices.
//
//   high   - camera grade pass with bloom + tilt-shift depth of field, 2 haze layers, full particles
//   medium - camera grade pass (colour grade + vignette) without bloom/DOF, 1 haze layer, full particles
//   low    - no camera post pass (cheap image vignette instead), no haze layers, reduced particles
//
// 'auto' (the default) starts at high and steps down one tier whenever the rolling mean frame time
// exceeds AUTO_LIMIT_MS (bloom/tilt-shift go first, then haze, then particles). It never steps back
// up within a session (avoids oscillating). A UI toggle can write localStorage['ct.fxQuality'] =
// 'auto' | 'high' | 'medium' | 'low'; the value is re-read about once a second.
export type FxQuality = 'high' | 'medium' | 'low';
export type FxQualityPref = 'auto' | FxQuality;

export const FX_QUALITY_KEY = 'ct.fxQuality';
const AUTO_LIMIT_MS = 20;
const WINDOW = 90; // frames in the rolling mean
const WARMUP_MS = 4000; // ignore the first seconds (texture uploads, shader compiles)
const SETTLE_MS = 2500; // after a change, wait before judging again
const ORDER: FxQuality[] = ['high', 'medium', 'low'];

export function readQualityPref(): FxQualityPref {
  try {
    const v = window.localStorage.getItem(FX_QUALITY_KEY);
    if (v === 'high' || v === 'medium' || v === 'low' || v === 'auto') return v;
  } catch {
    /* storage blocked (private mode, sandbox): fall back to auto */
  }
  return 'auto';
}

export class FxQualityController {
  pref: FxQualityPref = readQualityPref();
  /** tier chosen by the auto controller (used while pref === 'auto') */
  private autoLevel: FxQuality = 'high';
  private ring = new Float32Array(WINDOW);
  private n = 0;
  private sum = 0;
  private holdUntil: number;
  private nextPoll = 0;

  constructor(
    now: number,
    /** false when the renderer cannot run the post pass at all (Canvas renderer) */
    private postCapable: boolean,
  ) {
    this.holdUntil = now + WARMUP_MS;
    if (!postCapable) this.autoLevel = 'low';
  }

  get level(): FxQuality {
    const l = this.pref === 'auto' ? this.autoLevel : this.pref;
    return !this.postCapable && l !== 'low' ? 'low' : l;
  }

  /** Mean of the current window (ms), for diagnostics. */
  get mean(): number {
    return this.n ? this.sum / Math.min(this.n, WINDOW) : 0;
  }

  /** Feed one frame. Returns true when the effective level changed. */
  sample(deltaMs: number, now: number): boolean {
    const before = this.level;
    if (now >= this.nextPoll) {
      this.nextPoll = now + 1000;
      const p = readQualityPref();
      if (p !== this.pref) {
        this.pref = p;
        this.reset(now);
      }
    }
    // hidden tabs / long stalls (tab switches, GC, alerts) say nothing about steady-state cost
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (!hidden && deltaMs > 0 && deltaMs < 250 && now >= this.holdUntil) {
      const i = this.n % WINDOW;
      if (this.n >= WINDOW) this.sum -= this.ring[i]!;
      this.ring[i] = deltaMs;
      this.sum += deltaMs;
      this.n++;
      if (this.pref === 'auto' && this.n >= WINDOW && this.sum / WINDOW > AUTO_LIMIT_MS) {
        const k = ORDER.indexOf(this.autoLevel);
        if (k < ORDER.length - 1) {
          this.autoLevel = ORDER[k + 1]!;
          this.reset(now);
        }
      }
    }
    return this.level !== before;
  }

  private reset(now: number) {
    this.n = 0;
    this.sum = 0;
    this.holdUntil = now + SETTLE_MS;
  }
}
