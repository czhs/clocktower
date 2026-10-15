// Ordered, append-only SQL migrations. Applied at startup by runMigrations() inside a
// transaction each; applied ids are tracked in `_migrations`. Never edit a shipped migration —
// add a new one. Embedded as strings so the bundled server (esbuild) needs no extra files.

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  cosmetics_json TEXT NOT NULL,
  passphrase_lookup TEXT NOT NULL,
  passphrase_verifier TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX accounts_passphrase_lookup_unique ON accounts (passphrase_lookup);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX sessions_account_idx ON sessions (account_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE matches (
  id TEXT PRIMARY KEY NOT NULL,
  lobby_id TEXT NOT NULL,
  script TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  winner TEXT,
  reason TEXT,
  storyteller_account_id TEXT
);
CREATE INDEX matches_storyteller_idx ON matches (storyteller_account_id);

CREATE TABLE match_players (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  starting_character TEXT,
  final_character TEXT,
  alignment TEXT,
  won INTEGER,
  alive INTEGER,
  executed INTEGER NOT NULL DEFAULT 0,
  died INTEGER NOT NULL DEFAULT 0,
  nominations INTEGER NOT NULL DEFAULT 0,
  ghost_vote_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, account_id)
);
CREATE INDEX match_players_account_idx ON match_players (account_id);

CREATE TABLE voice_usage (
  env TEXT NOT NULL,
  month TEXT NOT NULL,
  participant_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (env, month)
);
`,
  },
  {
    id: 2,
    name: 'admin_audit',
    // Append-only audit trail of admin mutations (owned by the admin console). No foreign keys:
    // entries must outlive deleted admins/targets. UPDATE/DELETE are refused by triggers.
    sql: `
CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  admin_account_id TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  detail_json TEXT
);
CREATE INDEX admin_audit_at_idx ON admin_audit (at);
CREATE TRIGGER admin_audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT, 'admin_audit is append-only'); END;
CREATE TRIGGER admin_audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT, 'admin_audit is append-only'); END;
`,
  },
];
