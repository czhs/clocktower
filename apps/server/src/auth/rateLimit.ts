/** Token bucket: `capacity` burst, refilled continuously at `refillPerSec`. */
export interface BucketSpec {
  capacity: number;
  refillPerSec: number;
}

/** Keyed token buckets (per IP, per account, per pid…). Memory is bounded by pruning full buckets. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    readonly spec: BucketSpec,
    private readonly maxKeys = 10_000,
  ) {}

  /** Consumes `cost` tokens if available. */
  take(key: string, now = Date.now(), cost = 1): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.prune(now);
      b = { tokens: this.spec.capacity, at: now };
      this.buckets.set(key, b);
    } else {
      b.tokens = Math.min(this.spec.capacity, b.tokens + ((now - b.at) / 1000) * this.spec.refillPerSec);
      b.at = now;
    }
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }

  /** Seconds until one token is available (for Retry-After). */
  retryAfterSec(key: string, now = Date.now()): number {
    const b = this.buckets.get(key);
    if (!b) return 0;
    const tokens = Math.min(this.spec.capacity, b.tokens + ((now - b.at) / 1000) * this.spec.refillPerSec);
    return tokens >= 1 ? 0 : Math.ceil((1 - tokens) / this.spec.refillPerSec);
  }

  delete(prefix: string): void {
    for (const k of this.buckets.keys()) if (k.startsWith(prefix)) this.buckets.delete(k);
  }

  private prune(now: number): void {
    for (const [k, b] of this.buckets) {
      const tokens = b.tokens + ((now - b.at) / 1000) * this.spec.refillPerSec;
      if (tokens >= this.spec.capacity) this.buckets.delete(k);
    }
    // Still full (sustained flood from many keys): drop the oldest half.
    if (this.buckets.size >= this.maxKeys) {
      let i = 0;
      for (const k of this.buckets.keys()) if (i++ < this.maxKeys / 2) this.buckets.delete(k);
    }
  }
}
