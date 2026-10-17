// Drizzle table definitions. MUST stay in sync with the hand-written SQL in ./migrations.ts
// (the migrations are the source of truth for the on-disk schema; db.test.ts exercises every
// table through these definitions). All timestamps are epoch milliseconds (INTEGER).
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  cosmeticsJson: text('cosmetics_json').notNull(),
  passphraseLookup: text('passphrase_lookup').notNull().unique(),
  passphraseVerifier: text('passphrase_verifier').notNull(),
  salt: text('salt').notNull(),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  lastUsedAt: integer('last_used_at').notNull(),
});

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  lobbyId: text('lobby_id').notNull(),
  script: text('script').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  winner: text('winner'),
  reason: text('reason'),
  storytellerAccountId: text('storyteller_account_id'),
});

export const matchPlayers = sqliteTable(
  'match_players',
  {
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    seat: integer('seat').notNull(),
    startingCharacter: text('starting_character'),
    finalCharacter: text('final_character'),
    alignment: text('alignment'),
    won: integer('won', { mode: 'boolean' }),
    alive: integer('alive', { mode: 'boolean' }),
    executed: integer('executed', { mode: 'boolean' }).notNull().default(false),
    died: integer('died', { mode: 'boolean' }).notNull().default(false),
    nominations: integer('nominations').notNull().default(0),
    ghostVoteUsed: integer('ghost_vote_used', { mode: 'boolean' }).notNull().default(false),
    /** Migration 5 (v2.2 stats): roster character (Cosmetics.preset) used in this match. */
    avatarId: text('avatar_id'),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.accountId] })],
);

export const voiceUsage = sqliteTable(
  'voice_usage',
  {
    env: text('env').notNull(),
    month: text('month').notNull(),
    participantMs: integer('participant_ms').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.env, t.month] })],
);

/** Migration 2 (admin console): append-only audit log; triggers refuse UPDATE/DELETE. */
export const adminAudit = sqliteTable('admin_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: integer('at').notNull(),
  adminAccountId: text('admin_account_id').notNull(),
  adminName: text('admin_name').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  targetName: text('target_name'),
  detailJson: text('detail_json'),
});

/** Migration 3 (v2): one JSON record per game for future stats (see apps/server game records). */
export const matchRecords = sqliteTable('match_records', {
  matchId: text('match_id').primaryKey(),
  lobbyId: text('lobby_id').notNull(),
  version: integer('version').notNull(),
  status: text('status').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at').notNull(),
  winner: text('winner'),
  playerCount: integer('player_count').notNull(),
  storytellerAccountId: text('storyteller_account_id'),
  recordJson: text('record_json').notNull(),
});

/** Migration 4 (v2): private per-player notebook for one game (owner-only). */
export const notebooks = sqliteTable(
  'notebooks',
  {
    matchId: text('match_id').notNull(),
    accountId: text('account_id').notNull(),
    updatedAt: integer('updated_at').notNull(),
    dataJson: text('data_json').notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.accountId] })],
);
