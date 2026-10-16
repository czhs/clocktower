// (v2.3 security, sec-secrecy — SEC-7) Per-CONNECTION, message-level protocol-violation score.
//
// sec-host's socketBudget.ts limits raw frames/bytes BEFORE decoding. This is the complementary
// message-level guard: after decoding, the GameRoom reports every protocol violation of a connection
// (unknown message type, schema-invalid payload, a message over its per-type token bucket — except
// `move`, which lossy links legitimately burst). A well-behaved client produces none of these; a
// modified client probing the protocol produces them by the hundred. The score is a token bucket
// (burst VIOLATION_BURST, refilled at VIOLATION_REFILL_PER_SEC); once it is spent the room closes the
// connection with CLOSE_CODES.abuse (terminal: the client does not auto-reconnect). In a running game
// the seat is kept as for any disconnect; a fresh ticket restores it.

export interface ViolationSpec {
  burst: number;
  refillPerSec: number;
}

/** Generous for honest clients (version skew, a reconnect replay burst), tight for probing loops. */
export const DEFAULT_VIOLATION_SPEC: ViolationSpec = { burst: 150, refillPerSec: 10 };

export type ViolationKind = 'unknown_type' | 'invalid_payload' | 'rate_limited';

/** Pure meter (unit-testable): `hit` returns false once the budget is exceeded. */
export class ViolationMeter {
  private tokens: number;
  private at: number;
  constructor(
    private readonly spec: ViolationSpec = DEFAULT_VIOLATION_SPEC,
    now = Date.now(),
  ) {
    this.tokens = spec.burst;
    this.at = now;
  }
  hit(now = Date.now()): boolean {
    this.tokens = Math.min(this.spec.burst, this.tokens + (Math.max(0, now - this.at) / 1000) * this.spec.refillPerSec);
    this.at = now;
    this.tokens -= 1;
    return this.tokens >= 0;
  }
}

/**
 * One tracker per room. Connections are keyed by their (Colyseus) client object, so a reconnect or a
 * new device starts with a fresh budget and nothing is retained after the client is gone.
 */
export function createViolationTracker(spec: ViolationSpec = DEFAULT_VIOLATION_SPEC, now: () => number = Date.now) {
  const meters = new WeakMap<object, ViolationMeter>();
  return {
    /** Record one violation; true = this connection is over its budget and must be closed. */
    record(conn: object, type: string, kind: ViolationKind): boolean {
      if (kind === 'rate_limited' && (type === 'move' || type === 'chat:send')) return false; // (v2.3) a fast typist is not probing
      let m = meters.get(conn);
      if (!m) meters.set(conn, (m = new ViolationMeter(spec, now())));
      return !m.hit(now());
    },
  };
}
export type ViolationTracker = ReturnType<typeof createViolationTracker>;
