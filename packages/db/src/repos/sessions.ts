import { eq, lt } from 'drizzle-orm';
import type { Database } from '../database.js';
import { sessions } from '../schema.js';

export interface SessionRecord {
  tokenHash: string;
  accountId: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number;
}

/** Stores only SHA-256(token) — the raw session token never touches the database. */
export function createSessionsRepo({ db }: Database) {
  return {
    create(s: { tokenHash: string; accountId: string; now: number; expiresAt: number }): void {
      db.insert(sessions)
        .values({ tokenHash: s.tokenHash, accountId: s.accountId, createdAt: s.now, expiresAt: s.expiresAt, lastUsedAt: s.now })
        .run();
    },
    find(tokenHash: string): SessionRecord | undefined {
      return db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
    },
    /** Sliding expiry. */
    touch(tokenHash: string, now: number, expiresAt: number): void {
      db.update(sessions).set({ lastUsedAt: now, expiresAt }).where(eq(sessions.tokenHash, tokenHash)).run();
    },
    delete(tokenHash: string): void {
      db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
    },
    deleteForAccount(accountId: string): void {
      db.delete(sessions).where(eq(sessions.accountId, accountId)).run();
    },
    deleteExpired(now: number): number {
      return db.delete(sessions).where(lt(sessions.expiresAt, now)).run().changes;
    },
  };
}

export type SessionsRepo = ReturnType<typeof createSessionsRepo>;
