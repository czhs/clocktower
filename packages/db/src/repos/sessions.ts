import { desc, eq, lt } from 'drizzle-orm';
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
    /** (v2.3 AUTH-10) Keeps the account's `keep` newest sessions; returns the hashes it deleted. */
    pruneForAccount(accountId: string, keep: number): string[] {
      const rows = db
        .select({ tokenHash: sessions.tokenHash })
        .from(sessions)
        .where(eq(sessions.accountId, accountId))
        .orderBy(desc(sessions.createdAt), desc(sessions.lastUsedAt))
        .all();
      const drop = rows.slice(keep).map((r) => r.tokenHash);
      for (const h of drop) db.delete(sessions).where(eq(sessions.tokenHash, h)).run();
      return drop;
    },
    /** (v2.3 AUTH-5) The account's sessions, newest first (export / "your devices"). */
    listForAccount(accountId: string): SessionRecord[] {
      return db.select().from(sessions).where(eq(sessions.accountId, accountId)).orderBy(desc(sessions.createdAt)).all();
    },
  };
}

export type SessionsRepo = ReturnType<typeof createSessionsRepo>;
