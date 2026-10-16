// (v2.3 AUTH-2 / AUTH-3) Abuse limits for the passphrase endpoints.
//
// - ipRangeKeys(): rate-limit keys from narrow to wide. IPv4 (and v4-mapped / loopback) is one exact
//   key; IPv6 is /64, /56 and /48 — one /48 (free from tunnel brokers) holds 65 536 /64s, so a
//   /64-only key was no limit at all for anyone holding a /48.
// - tieredTake(): consumes from every tier or from none (a request blocked by its /48 must not drain
//   its /64 bucket). Wider tiers get proportionally larger buckets.
// - ScryptGate: global concurrency gate for scrypt work (libuv's 4 threads are shared with static
//   file serving) with a queue large enough that a burst from many addresses waits a moment instead
//   of turning legitimate sign-ins into 503s, and a per-range in-flight cap so one range cannot fill
//   the queue.
import { RateLimiter, type BucketSpec } from './rateLimit.js';

/** Expands an IPv6 address (no zone id) into 8 lower-case 4-digit groups, or null if not IPv6. */
function ipv6Groups(ip: string): string[] | null {
  if (!ip.includes(':')) return null;
  const [head = '', tail = ''] = ip.split('%')[0]!.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return full.slice(0, 8).map((x) => x.toLowerCase().padStart(4, '0'));
}

/** Rate-limit keys for a client address, narrowest first ([exact] for IPv4, [/64, /56, /48] for IPv6). */
export function ipRangeKeys(ip: string): string[] {
  if (!ip.includes(':') || ip.startsWith('::ffff:') || ip === '::1') return [ip];
  const g = ipv6Groups(ip);
  if (!g) return [ip];
  const p48 = g.slice(0, 3).join(':');
  return [`${g.slice(0, 4).join(':')}::/64`, `${p48}:${g[3]!.slice(0, 2)}00::/56`, `${p48}::/48`];
}

/** The widest range of an address: the unit the scrypt gate caps in-flight work by. */
export function ipRangeOf(ip: string): string {
  const keys = ipRangeKeys(ip);
  return keys[keys.length - 1]!;
}

/** Bucket multipliers for the /64, /56 and /48 tiers. */
export const RANGE_TIER_MULTIPLIERS = [1, 4, 8] as const;

export class TieredLimiter {
  readonly tiers: RateLimiter[];
  constructor(base: RateLimiter) {
    this.tiers = RANGE_TIER_MULTIPLIERS.map((m, i) =>
      i === 0 ? base : new RateLimiter({ capacity: base.spec.capacity * m, refillPerSec: base.spec.refillPerSec * m } satisfies BucketSpec),
    );
  }

  /** Takes one token from every tier's bucket, or none at all. Returns the retry hint when refused. */
  take(keys: string[], now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
    const pairs = keys.slice(0, this.tiers.length).map((k, i) => [this.tiers[i]!, k] as const);
    for (const [l, k] of pairs) {
      if (l.available(k, now) < 1) return { ok: false, retryAfterSec: Math.max(1, l.retryAfterSec(k, now)) };
    }
    for (const [l, k] of pairs) l.take(k, now);
    return { ok: true };
  }
}

export interface GateOptions {
  /** scrypt hashes running at once. */
  slots: number;
  /** Requests allowed to wait for a slot (beyond: busy). */
  maxQueue: number;
  /** Running + waiting requests per address range (beyond: too many). */
  perRange: number;
  /** Builds the error thrown when refusing (HTTP layer supplies HttpError). */
  refuse: (why: 'busy' | 'range') => Error;
}

export class ScryptGate {
  private active = 0;
  private waiting: (() => void)[] = [];
  private perRange = new Map<string, number>();

  constructor(private readonly o: GateOptions) {}

  async run<T>(range: string, fn: () => Promise<T>): Promise<T> {
    const mine = this.perRange.get(range) ?? 0;
    if (mine >= this.o.perRange) throw this.o.refuse('range');
    if (this.active >= this.o.slots && this.waiting.length >= this.o.maxQueue) throw this.o.refuse('busy');
    this.perRange.set(range, mine + 1);
    try {
      if (this.active >= this.o.slots) await new Promise<void>((resolve) => this.waiting.push(resolve));
      else this.active++;
      try {
        return await fn();
      } finally {
        const next = this.waiting.shift();
        if (next) next();
        else this.active--;
      }
    } finally {
      const n = (this.perRange.get(range) ?? 1) - 1;
      if (n > 0) this.perRange.set(range, n);
      else this.perRange.delete(range);
    }
  }
}
