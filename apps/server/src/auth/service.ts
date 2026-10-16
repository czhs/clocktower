import { DEFAULT_COSMETICS, type AccountView, type Cosmetics } from '@ct/protocol';
import { DuplicateLookupError, type AccountRecord, type AccountsRepo, type SessionsRepo } from '@ct/db';
import type { Logger } from '../rooms/modules.js';
import { checkVerifier, DEFAULT_SCRYPT_N, hashToken, makeVerifier, newSessionToken, passphraseLookup, randomId, verifierCost } from './crypto.js';
import { sessionId, type Revocations, type RevokeReason } from './revocation.js';
import { generatePassphrase, normalizePassphrase } from './passphrase.js';
import { randomPlayable } from './presets.js';

export interface AuthDeps {
  accounts: AccountsRepo;
  sessions: SessionsRepo;
  pepper: string;
  sessionTtlMs: number;
  adminAccountIds: ReadonlySet<string>;
  log: Logger;
  scryptN?: number;
  now?: () => number;
  /** (v2.3 AUTH-1) Live connections of revoked sessions are closed through this. */
  revocations?: Revocations;
  /** (v2.3 AUTH-4) Absolute session lifetime from sign-in, regardless of sliding refreshes. */
  sessionMaxMs?: number;
  /** (v2.3 AUTH-8) Admin accounts' sessions end after this long without a request. */
  adminIdleMs?: number;
  /** (v2.3 AUTH-10) Newest sessions kept per account (older ones are deleted at sign-in). */
  maxSessionsPerAccount?: number;
}

/** (v2.3) Defaults: 90-day absolute lifetime, 12 h admin idle timeout, 20 sessions per account. */
export const SESSION_MAX_DAYS_DEFAULT = 90;
export const ADMIN_IDLE_MS = 12 * 3_600_000;
export const MAX_SESSIONS_PER_ACCOUNT = 20;

export interface Authenticated {
  account: AccountRecord;
  /** True when the sliding expiry was extended (the cookie should be re-issued). */
  refreshed: boolean;
  /** (v2.3) Non-secret id of this session (revocation of one device's connections). */
  sid: string;
  /** (v2.3 AUTH-4) Cookie Max-Age for a re-issued cookie (never past the absolute lifetime). */
  maxAgeSec: number;
  /** (v2.3 AUTH-8) When this session was created (sign-in time; "recent sign-in" step-up). */
  sessionCreatedAt: number;
}

/** Sliding-expiry writes are throttled to one per minute per session. */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Passphrase-only accounts. The passphrase is the sole credential:
 *   lookup   = HMAC-SHA256(PASSPHRASE_PEPPER, normalize(p))  — unique index, finds the account
 *   verifier = scrypt(normalize(p), per-account salt)         — constant-time check
 * Plaintext passphrases and raw session tokens are never stored or logged.
 */
export function createAuthService(deps: AuthDeps) {
  const now = deps.now ?? Date.now;
  const n = deps.scryptN ?? DEFAULT_SCRYPT_N;
  // Equalise timing between "unknown passphrase" and "wrong verifier" (both run one scrypt).
  const dummy = makeVerifier('dummy-passphrase-for-timing', n);
  const maxMs = deps.sessionMaxMs ?? SESSION_MAX_DAYS_DEFAULT * 86_400_000;
  const adminIdleMs = deps.adminIdleMs ?? ADMIN_IDLE_MS;
  const keepSessions = deps.maxSessionsPerAccount ?? MAX_SESSIONS_PER_ACCOUNT;
  const revoke = (accountId: string, reason: RevokeReason, sid?: string) => deps.revocations?.revoke(accountId, reason, sid);

  function issueSession(accountId: string): { token: string; expiresAt: number; maxAgeSec: number } {
    const token = newSessionToken();
    const t = now();
    const ttl = Math.min(deps.sessionTtlMs, maxMs);
    const expiresAt = t + ttl;
    deps.sessions.create({ tokenHash: hashToken(token), accountId, now: t, expiresAt });
    // AUTH-10: bounded sessions per account; a pruned (oldest) device's connections are closed too.
    for (const h of deps.sessions.pruneForAccount(accountId, keepSessions)) revoke(accountId, 'signed_out', h.slice(0, 16));
    return { token, expiresAt, maxAgeSec: Math.floor(ttl / 1000) };
  }

  /** Constant-time-ish passphrase check for a known account (step-up re-authentication). */
  async function passphraseMatches(accountId: string, passphrase: string): Promise<boolean> {
    const normalized = normalizePassphrase(passphrase);
    const creds = normalized ? deps.accounts.findCredentialsByLookup(passphraseLookup(deps.pepper, normalized)) : undefined;
    if (!creds || creds.id !== accountId) {
      const d = await dummy;
      await checkVerifier(normalized || 'x', d.salt, d.verifier);
      return false;
    }
    return checkVerifier(normalized, creds.salt, creds.verifier);
  }

  return {
    /** v2: a new account starts as a random playable roster character (changeable any time). */
    async createAccount(displayName: string, cosmetics: Cosmetics = { ...DEFAULT_COSMETICS, preset: randomPlayable() }) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const passphrase = generatePassphrase();
        const normalized = normalizePassphrase(passphrase);
        const { salt, verifier } = await makeVerifier(normalized, n);
        try {
          const account = deps.accounts.insert({
            id: randomId(16),
            displayName,
            cosmetics,
            passphraseLookup: passphraseLookup(deps.pepper, normalized),
            passphraseVerifier: verifier,
            salt,
            now: now(),
          });
          const session = issueSession(account.id);
          deps.log.info('account created', { accountId: account.id });
          return { account, passphrase, ...session };
        } catch (e) {
          // 2^-77 chance; regenerate rather than reveal anything.
          if (!(e instanceof DuplicateLookupError)) throw e;
        }
      }
      throw new Error('could not allocate a unique passphrase');
    },

    async signIn(passphrase: string) {
      const normalized = normalizePassphrase(passphrase);
      const creds = normalized ? deps.accounts.findCredentialsByLookup(passphraseLookup(deps.pepper, normalized)) : undefined;
      if (!creds) {
        const d = await dummy;
        await checkVerifier(normalized || 'x', d.salt, d.verifier);
        return null;
      }
      if (!(await checkVerifier(normalized, creds.salt, creds.verifier))) return null;
      const account = deps.accounts.findById(creds.id);
      if (!account) return null;
      // AUTH-2: re-hash verifiers made at an older cost (e.g. scrypt N=2^15) at the current cost.
      if (verifierCost(creds.verifier) !== n) {
        const { salt, verifier } = await makeVerifier(normalized, n);
        deps.accounts.setCredentials(account.id, { passphraseLookup: passphraseLookup(deps.pepper, normalized), passphraseVerifier: verifier, salt });
      }
      deps.accounts.touch(account.id, now());
      const session = issueSession(account.id);
      deps.log.info('signed in', { accountId: account.id });
      return { account, ...session };
    },

    /** Ends one session and closes the connections that were opened with it (AUTH-1). */
    signOut(token: string): void {
      if (!token || token.length > 128) return;
      const hash = hashToken(token);
      const s = deps.sessions.find(hash);
      deps.sessions.delete(hash);
      if (s) revoke(s.accountId, 'signed_out', sessionId(token));
    },

    /** Ends every session of the account and closes all its live connections (AUTH-1). */
    revokeAll(accountId: string, reason: RevokeReason = 'signed_out'): void {
      deps.sessions.deleteForAccount(accountId);
      revoke(accountId, reason);
    },

    /** (v2.3 AUTH-6 / AUTH-8) Re-authentication: does this passphrase belong to this account? */
    verifyPassphrase(accountId: string, passphrase: string): Promise<boolean> {
      return passphraseMatches(accountId, passphrase);
    },

    /** Resolves a raw session token (from the cookie) to its account, extending the expiry. */
    authenticate(token: string | undefined): Authenticated | null {
      if (!token || token.length > 128) return null;
      const hash = hashToken(token);
      const s = deps.sessions.find(hash);
      const t = now();
      if (!s) return null;
      const endsAt = s.createdAt + maxMs; // AUTH-4: absolute lifetime
      const adminIdle = deps.adminAccountIds.has(s.accountId) && t - s.lastUsedAt >= adminIdleMs; // AUTH-8
      if (s.expiresAt <= t || endsAt <= t || adminIdle) {
        deps.sessions.delete(hash);
        if (endsAt <= t || adminIdle) revoke(s.accountId, 'signed_out', sessionId(token));
        return null;
      }
      const account = deps.accounts.findById(s.accountId);
      if (!account) return null;
      let refreshed = false;
      const expiresAt = Math.min(t + deps.sessionTtlMs, endsAt);
      if (t - s.lastUsedAt >= TOUCH_INTERVAL_MS) {
        deps.sessions.touch(hash, t, expiresAt);
        deps.accounts.touch(account.id, t);
        refreshed = true;
      }
      return { account, refreshed, sid: sessionId(token), maxAgeSec: Math.max(0, Math.floor((expiresAt - t) / 1000)), sessionCreatedAt: s.createdAt };
    },

    view(account: AccountRecord): AccountView {
      return {
        id: account.id,
        displayName: account.displayName,
        cosmetics: account.cosmetics,
        createdAt: new Date(account.createdAt).toISOString(),
        isAdmin: deps.adminAccountIds.has(account.id),
      };
    },

    isAdmin(accountId: string): boolean {
      return deps.adminAccountIds.has(accountId);
    },

    purgeExpired(): number {
      return deps.sessions.deleteExpired(now());
    },

    // -------------------------------------------------------------------------------------
    // ADMIN-ONLY (owned by the admin agent; called only from apps/server/src/admin/**, which
    // enforces ADMIN_ACCOUNT_IDS). Never log the passphrase.

    /**
     * Replaces the account's passphrase with a freshly generated one (same generator as sign-up)
     * and deletes every session of the account. Returns the new passphrase exactly once, or null
     * if the account does not exist.
     */
    async adminRotatePassphrase(accountId: string): Promise<string | null> {
      if (!deps.accounts.findById(accountId)) return null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const passphrase = generatePassphrase();
        const normalized = normalizePassphrase(passphrase);
        const { salt, verifier } = await makeVerifier(normalized, n);
        try {
          const ok = deps.accounts.setCredentials(accountId, {
            passphraseLookup: passphraseLookup(deps.pepper, normalized),
            passphraseVerifier: verifier,
            salt,
          });
          if (!ok) return null;
          deps.sessions.deleteForAccount(accountId);
          revoke(accountId, 'passphrase_changed'); // AUTH-1: live rooms / streams too
          return passphrase;
        } catch (e) {
          if (!(e instanceof DuplicateLookupError)) throw e;
        }
      }
      throw new Error('could not allocate a unique passphrase');
    },

    /** Deletes every session of the account (all devices are signed out on their next request). */
    adminSignOutEverywhere(accountId: string): void {
      deps.sessions.deleteForAccount(accountId);
      revoke(accountId, 'signed_out'); // AUTH-1
    },
    // ------------------------------------------------------------------- end ADMIN-ONLY
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
