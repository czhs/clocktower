import { eq, sql } from 'drizzle-orm';
import { Cosmetics, DEFAULT_COSMETICS } from '@ct/protocol';
import type { Database } from '../database.js';
import { accounts } from '../schema.js';

export interface AccountRecord {
  id: string;
  displayName: string;
  cosmetics: Cosmetics;
  createdAt: number;
  lastSeenAt: number;
}

export interface AccountCredentials {
  id: string;
  verifier: string;
  salt: string;
}

export interface NewAccount {
  id: string;
  displayName: string;
  cosmetics: Cosmetics;
  passphraseLookup: string;
  passphraseVerifier: string;
  salt: string;
  now: number;
}

export class DuplicateLookupError extends Error {
  constructor() {
    super('passphrase lookup collision');
  }
}

function parseCosmetics(json: string): Cosmetics {
  try {
    const r = Cosmetics.safeParse(JSON.parse(json));
    return r.success ? r.data : { ...DEFAULT_COSMETICS };
  } catch {
    return { ...DEFAULT_COSMETICS };
  }
}

const publicCols = {
  id: accounts.id,
  displayName: accounts.displayName,
  cosmeticsJson: accounts.cosmeticsJson,
  createdAt: accounts.createdAt,
  lastSeenAt: accounts.lastSeenAt,
};

function toRecord(r: { id: string; displayName: string; cosmeticsJson: string; createdAt: number; lastSeenAt: number }): AccountRecord {
  return {
    id: r.id,
    displayName: r.displayName,
    cosmetics: parseCosmetics(r.cosmeticsJson),
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
  };
}

export function createAccountsRepo({ db }: Database) {
  return {
    insert(a: NewAccount): AccountRecord {
      try {
        db.insert(accounts)
          .values({
            id: a.id,
            displayName: a.displayName,
            cosmeticsJson: JSON.stringify(a.cosmetics),
            passphraseLookup: a.passphraseLookup,
            passphraseVerifier: a.passphraseVerifier,
            salt: a.salt,
            createdAt: a.now,
            lastSeenAt: a.now,
          })
          .run();
      } catch (e) {
        if (e instanceof Error && /UNIQUE constraint failed: accounts\.passphrase_lookup/.test(e.message)) throw new DuplicateLookupError();
        throw e;
      }
      return { id: a.id, displayName: a.displayName, cosmetics: a.cosmetics, createdAt: a.now, lastSeenAt: a.now };
    },

    findById(id: string): AccountRecord | undefined {
      const r = db.select(publicCols).from(accounts).where(eq(accounts.id, id)).get();
      return r ? toRecord(r) : undefined;
    },

    findCredentialsByLookup(lookup: string): AccountCredentials | undefined {
      return db
        .select({ id: accounts.id, verifier: accounts.passphraseVerifier, salt: accounts.salt })
        .from(accounts)
        .where(eq(accounts.passphraseLookup, lookup))
        .get();
    },

    updateProfile(id: string, patch: { displayName?: string; cosmetics?: Cosmetics }): AccountRecord | undefined {
      const set: Partial<typeof accounts.$inferInsert> = {};
      if (patch.displayName !== undefined) set.displayName = patch.displayName;
      if (patch.cosmetics !== undefined) set.cosmeticsJson = JSON.stringify(patch.cosmetics);
      if (Object.keys(set).length) db.update(accounts).set(set).where(eq(accounts.id, id)).run();
      return this.findById(id);
    },

    touch(id: string, now: number): void {
      db.update(accounts).set({ lastSeenAt: now }).where(eq(accounts.id, id)).run();
    },

    /**
     * Admin console: replace the passphrase credentials (rotation). Throws DuplicateLookupError
     * on the (astronomically unlikely) lookup collision. Returns false if the account is gone.
     */
    setCredentials(id: string, c: { passphraseLookup: string; passphraseVerifier: string; salt: string }): boolean {
      try {
        return (
          db
            .update(accounts)
            .set({ passphraseLookup: c.passphraseLookup, passphraseVerifier: c.passphraseVerifier, salt: c.salt })
            .where(eq(accounts.id, id))
            .run().changes > 0
        );
      } catch (e) {
        if (e instanceof Error && /UNIQUE constraint failed: accounts\.passphrase_lookup/.test(e.message)) throw new DuplicateLookupError();
        throw e;
      }
    },

    count(): number {
      return db.select({ n: sql<number>`count(*)` }).from(accounts).get()?.n ?? 0;
    },
  };
}

export type AccountsRepo = ReturnType<typeof createAccountsRepo>;
