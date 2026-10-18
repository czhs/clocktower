// v3 WP1 (v3-core). Rolling frame-time statistics for __ctCamera.v3() and the ct.debug.v3perf overlay
// (docs/v3/INTEGRATION.md §6.1, §6.3): the last FRAME_WINDOW visible frames (rAF deltas, ms). Hidden-tab frames and
// gaps longer than MAX_GAP_MS (a tab switch, a debugger pause) are not frames. Pure.

export const FRAME_WINDOW = 600;
export const MAX_GAP_MS = 1000;

export class FrameStats {
  private readonly buf: Float64Array;
  private n = 0;
  private i = 0;
  constructor(readonly size = FRAME_WINDOW) {
    this.buf = new Float64Array(size);
  }
  /** One frame delta (ms); `visible` = document.visibilityState === 'visible'. */
  push(dtMs: number, visible = true): void {
    if (!visible || !(dtMs > 0) || dtMs > MAX_GAP_MS) return;
    this.buf[this.i] = dtMs;
    this.i = (this.i + 1) % this.size;
    if (this.n < this.size) this.n++;
  }
  get count(): number {
    return this.n;
  }
  /** Quantile q in [0, 1] (nearest rank), 0 when empty. */
  quantile(q: number): number {
    if (!this.n) return 0;
    const a = Array.from(this.buf.subarray(0, this.n)).sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.max(0, Math.ceil(q * a.length) - 1))]!;
  }
  /** p50 / p95, rounded to 0.1 ms. */
  summary(): { p50: number; p95: number; frames: number } {
    const r = (v: number) => Math.round(v * 10) / 10;
    return { p50: r(this.quantile(0.5)), p95: r(this.quantile(0.95)), frames: this.n };
  }
  clear(): void {
    this.n = 0;
    this.i = 0;
  }
}
