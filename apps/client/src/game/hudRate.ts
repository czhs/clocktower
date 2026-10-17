// v2.4 perf (P1): rate-limit a HUD value that follows the walking player (the home compass).
//
// While walking, the compass' step count / arrow angle changed ≈ 5x per second (bounded only by the
// 10 Hz localPlayer store), each change = 3 DOM mutations (style, text, aria-label of a live region):
// 15 mutations/s on the phone profile, the whole of the remaining HUD churn. The gate passes the first
// change at once, then at most one change per `minMs`, always delivering the LAST value (trailing),
// and passes "urgent" changes (e.g. outdoors → at home) immediately.

export interface GateResult<T> {
  /** Emit this value now. */
  emit: boolean;
  value: T;
  /** When > 0: call `flush()` after this many ms to deliver the pending (latest) value. */
  wakeInMs: number;
}

export class TrailingGate<T> {
  private last: T;
  private lastAt = -Infinity;
  private pending: { v: T } | null = null;

  constructor(
    initial: T,
    private readonly minMs: number,
    private readonly eq: (a: T, b: T) => boolean = Object.is,
    private readonly urgent: (prev: T, next: T) => boolean = () => false,
  ) {
    this.last = initial;
  }

  /** The last emitted value. */
  get value(): T {
    return this.last;
  }

  offer(v: T, now: number): GateResult<T> {
    if (this.eq(this.last, v)) {
      this.pending = null; // back to what is shown: nothing to deliver
      return { emit: false, value: this.last, wakeInMs: 0 };
    }
    const due = now - this.lastAt >= this.minMs;
    if (due || this.urgent(this.last, v)) return this.take(v, now);
    this.pending = { v };
    return { emit: false, value: this.last, wakeInMs: Math.max(1, Math.ceil(this.minMs - (now - this.lastAt))) };
  }

  /** Deliver the pending value if its time has come (call from the wake timer). */
  flush(now: number): GateResult<T> {
    if (!this.pending) return { emit: false, value: this.last, wakeInMs: 0 };
    const wait = this.minMs - (now - this.lastAt);
    if (wait > 0) return { emit: false, value: this.last, wakeInMs: Math.ceil(wait) };
    const v = this.pending.v;
    return this.take(v, now);
  }

  private take(v: T, now: number): GateResult<T> {
    this.pending = null;
    this.last = v;
    this.lastAt = now;
    return { emit: true, value: v, wakeInMs: 0 };
  }
}
