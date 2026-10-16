import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type JoinIntent = 'player' | 'storyteller' | 'reconnect';

export interface TicketClaims {
  accountId: string;
  lobbyId: string;
  intent: JoinIntent;
  /** Expiry, epoch ms. */
  exp: number;
  nonce: string;
  /** (v2.3 AUTH-1) Non-secret id of the issuing session, so revoking that session closes this seat. */
  sid?: string;
}

export type TicketCheck =
  | { ok: true; claims: TicketClaims }
  | { ok: false; reason: 'malformed' | 'signature' | 'wrong_lobby' | 'expired' | 'reused' };

export const TICKET_TTL_MS = 60_000;
const INTENTS: readonly JoinIntent[] = ['player', 'storyteller', 'reconnect'];

/**
 * Room-join tickets: `v1.<base64url(json claims)>.<base64url(HMAC-SHA256)>`, keyed with a key
 * derived from SESSION_SECRET (domain-separated). Bound to account + lobby + intent, valid 60 s,
 * single-use (nonce consumed on first successful verification). Single process => in-memory
 * nonce store is authoritative.
 */
export function createTicketService(secret: string, opts: { ttlMs?: number; now?: () => number } = {}) {
  const key = createHmac('sha256', secret).update('ct-join-ticket-v1').digest();
  const ttl = opts.ttlMs ?? TICKET_TTL_MS;
  const now = opts.now ?? Date.now;
  const used = new Map<string, number>(); // nonce -> exp
  let lastPrune = 0;

  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest();

  function prune(t: number) {
    if (t - lastPrune < 10_000 && used.size < 50_000) return;
    lastPrune = t;
    for (const [n, exp] of used) if (exp < t) used.delete(n);
  }

  return {
    issue(c: { accountId: string; lobbyId: string; intent: JoinIntent; sid?: string }): { ticket: string; expiresAt: number } {
      const exp = now() + ttl;
      const claims: TicketClaims = { accountId: c.accountId, lobbyId: c.lobbyId, intent: c.intent, exp, nonce: randomBytes(16).toString('base64url') };
      if (c.sid) claims.sid = c.sid;
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
      return { ticket: `v1.${payload}.${sign(payload).toString('base64url')}`, expiresAt: exp };
    },

    /** Verifies and (on success) consumes the ticket. */
    verify(ticket: string, lobbyId: string): TicketCheck {
      const t = now();
      prune(t);
      const parts = ticket.split('.');
      if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, reason: 'malformed' };
      const [, payload, sig] = parts as [string, string, string];
      const expected = sign(payload);
      const given = Buffer.from(sig, 'base64url');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'signature' };
      let claims: TicketClaims;
      try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TicketClaims;
      } catch {
        return { ok: false, reason: 'malformed' };
      }
      if (
        typeof claims.accountId !== 'string' ||
        typeof claims.lobbyId !== 'string' ||
        typeof claims.nonce !== 'string' ||
        typeof claims.exp !== 'number' ||
        !INTENTS.includes(claims.intent) ||
        (claims.sid !== undefined && typeof claims.sid !== 'string')
      )
        return { ok: false, reason: 'malformed' };
      if (claims.lobbyId !== lobbyId) return { ok: false, reason: 'wrong_lobby' };
      if (claims.exp <= t) return { ok: false, reason: 'expired' };
      if (used.has(claims.nonce)) return { ok: false, reason: 'reused' };
      used.set(claims.nonce, claims.exp);
      return { ok: true, claims };
    },
  };
}

export type TicketService = ReturnType<typeof createTicketService>;
