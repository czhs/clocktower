import { DEFAULT_COSMETICS, type AccountView, type Cosmetics } from '@ct/protocol';
import { DuplicateLookupError, type AccountRecord, type AccountsRepo, type SessionsRepo } from '@ct/db';
import type { Logger } from '../rooms/modules.js';
import { checkVerifier, DEFAULT_SCRYPT_N, hashToken, makeVerifier, newSessionToken, passphraseLookup, randomId } from './crypto.js';
import { generatePassphrase, normalizePassphrase } from './passphrase.js';

export interface AuthDeps {
  accounts: AccountsRepo;
  sessions: SessionsRepo;
  pepper: string;
  sessionTtlMs: number;
  adminAccountIds: ReadonlySet<string>;
  log: Logger;
  scryptN?: number;
  now?: () => number;
}

export interface Authenticated {
  account: AccountRecord;
  /** True when the sliding expiry was extended (the cookie should be re-issued). */
  refreshed: boolean;
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

  function issueSession(accountId: string): { token: string; expiresAt: number } {
    const token = newSessionToken();
    const t = now();
    const expiresAt = t + deps.sessionTtlMs;
    deps.sessions.create({ tokenHash: hashToken(token), accountId, now: t, expiresAt });
    return { token, expiresAt };
  }

  return {
    async createAccount(displayName: string, cosmetics: Cosmetics = DEFAULT_COSMETICS) {
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
      deps.accounts.touch(account.id, now());
      const session = issueSession(account.id);
      deps.log.info('signed in', { accountId: account.id });
      return { account, ...session };
    },

    signOut(token: string): void {
      deps.sessions.delete(hashToken(token));
    },

    /** Resolves a raw session token (from the cookie) to its account, extending the expiry. */
    authenticate(token: string | undefined): Authenticated | null {
      if (!token || token.length > 128) return null;
      const hash = hashToken(token);
      const s = deps.sessions.find(hash);
      const t = now();
      if (!s) return null;
      if (s.expiresAt <= t) {
        deps.sessions.delete(hash);
        return null;
      }
      const account = deps.accounts.findById(s.accountId);
      if (!account) return null;
      let refreshed = false;
      if (t - s.lastUsedAt >= TOUCH_INTERVAL_MS) {
        deps.sessions.touch(hash, t, t + deps.sessionTtlMs);
        deps.accounts.touch(account.id, t);
        refreshed = true;
      }
      return { account, refreshed };
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
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
