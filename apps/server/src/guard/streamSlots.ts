// (v2.3 security, sec-host — HOST-04) Fair allocation of the lobby-directory SSE streams.
//
// Before: 3 streams per account and 200 in total, first come first served, so ~67 free accounts
// could hold every slot and everyone else got 503. Now:
//   - at most `perIp` streams per client address (loopback — local tooling/tests — is exempt);
//   - when the global pool is full, a newcomer evicts the OLDEST stream of the address holding the
//     most streams, as long as that address holds clearly more than the newcomer (fair share);
//     otherwise 503 as before. An evicted EventSource reconnects after 3 s and competes again;
//     the client also falls back to the 30 s list refresh.
export interface StreamSlotLimits {
  perAccount: number;
  perIp: number;
  total: number;
}

export type Acquire = { ok: true; release: () => void } | { ok: false; status: 429 | 503; message: string };

interface Slot {
  account: string;
  ip: string;
  at: number;
  evict: () => void;
  released: boolean;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export class StreamSlots {
  private slots = new Set<Slot>();
  private byAccount = new Map<string, number>();
  private byIp = new Map<string, number>();
  /** Limits are read on every acquire (live settings, guard/hostLimits.ts). */
  constructor(private readonly limitsOf: StreamSlotLimits | (() => StreamSlotLimits)) {}
  get limits(): StreamSlotLimits {
    return typeof this.limitsOf === 'function' ? this.limitsOf() : this.limitsOf;
  }

  get size(): number {
    return this.slots.size;
  }

  acquire(account: string, ip: string, evict: () => void, now = Date.now()): Acquire {
    const limits = this.limits;
    if ((this.byAccount.get(account) ?? 0) >= limits.perAccount) return { ok: false, status: 429, message: 'Too many open lobby streams for this account' };
    const exempt = LOOPBACK.has(ip);
    const ipCount = this.byIp.get(ip) ?? 0;
    if (!exempt && ipCount >= limits.perIp) return { ok: false, status: 429, message: 'Too many open lobby streams from this address' };
    if (this.slots.size >= limits.total && !this.evictForFairness(ip, ipCount)) {
      return { ok: false, status: 503, message: 'The server is busy, please try again shortly' };
    }
    const slot: Slot = { account, ip, at: now, evict, released: false };
    this.slots.add(slot);
    this.byAccount.set(account, (this.byAccount.get(account) ?? 0) + 1);
    this.byIp.set(ip, ipCount + 1);
    return { ok: true, release: () => this.release(slot) };
  }

  private evictForFairness(ip: string, ipCount: number): boolean {
    let topIp: string | null = null;
    let top = 0;
    for (const [k, n] of this.byIp) {
      if (LOOPBACK.has(k)) continue;
      if (n > top) {
        top = n;
        topIp = k;
      }
    }
    if (topIp === null || topIp === ip || top <= ipCount + 1) return false;
    let oldest: Slot | null = null;
    for (const s of this.slots) if (s.ip === topIp && (!oldest || s.at < oldest.at)) oldest = s;
    if (!oldest) return false;
    this.release(oldest);
    try {
      oldest.evict();
    } catch {
      /* stream already gone */
    }
    return true;
  }

  private release(slot: Slot): void {
    if (slot.released) return;
    slot.released = true;
    this.slots.delete(slot);
    const dec = (m: Map<string, number>, k: string) => {
      const n = (m.get(k) ?? 1) - 1;
      if (n > 0) m.set(k, n);
      else m.delete(k);
    };
    dec(this.byAccount, slot.account);
    dec(this.byIp, slot.ip);
  }
}
