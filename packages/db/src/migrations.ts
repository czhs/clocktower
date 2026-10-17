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
  {
    id: 3,
    name: 'match_records',
    // (v2) The full record of every game (finished or abandoned), for a future stats feature: one
    // JSON document per match (schema versioned inside), written once when the game ends.
    sql: `
CREATE TABLE match_records (
  match_id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  winner TEXT,
  player_count INTEGER NOT NULL,
  storyteller_account_id TEXT,
  record_json TEXT NOT NULL
);
CREATE INDEX match_records_ended_idx ON match_records (ended_at);
`,
  },
  {
    id: 4,
    name: 'notebooks',
    // (v2) Each player's private notebook for one game (owner-only; never shown to anyone else).
    sql: `
CREATE TABLE notebooks (
  match_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (match_id, account_id)
);
CREATE INDEX notebooks_account_idx ON notebooks (account_id, updated_at);
`,
  },
  {
    id: 5,
    name: 'account_stats',
    // (v2.2 stats) The home-screen record: the roster character (avatar) each player used, so the
    // "favourite town character" is one indexed GROUP BY (backfilled from the game records), and
    // an index for "games I told" over match_records (finished + abandoned) for the recent list.
    sql: `
ALTER TABLE match_players ADD COLUMN avatar_id TEXT;
UPDATE match_players SET avatar_id = (
  SELECT json_extract(s.value, '$.avatarId')
  FROM match_records mr, json_each(mr.record_json, '$.seats') s
  WHERE mr.match_id = match_players.match_id AND json_extract(s.value, '$.accountId') = match_players.account_id
  LIMIT 1
);
CREATE INDEX match_records_storyteller_idx ON match_records (storyteller_account_id, ended_at);
`,
  },
  {
    id: 6,
    name: 'moderation',
    // (v2.3 OPS-1/2/6) Account suspensions, network (IP /64) blocks, each account's last network key
    // (for "block this account's network"; never logged, never sent to other players), runtime ops
    // switches (sign-ups / maintenance / voice) and player reports (admin queue).
    sql: `
CREATE TABLE account_suspensions (
  account_id TEXT PRIMARY KEY NOT NULL,
  at INTEGER NOT NULL,
  until INTEGER,
  reason TEXT NOT NULL,
  admin_account_id TEXT NOT NULL
);
CREATE TABLE ip_blocks (
  key TEXT PRIMARY KEY NOT NULL,
  at INTEGER NOT NULL,
  until INTEGER,
  reason TEXT NOT NULL,
  admin_account_id TEXT NOT NULL
);
CREATE TABLE account_ips (
  account_id TEXT PRIMARY KEY NOT NULL,
  ip_key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX account_ips_key_idx ON account_ips (ip_key);
CREATE TABLE ops_flags (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  admin_account_id TEXT NOT NULL
);
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  reporter_account_id TEXT NOT NULL,
  target_account_id TEXT NOT NULL,
  lobby_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  context_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT,
  resolved_at INTEGER,
  resolution TEXT
);
CREATE INDEX reports_status_idx ON reports (status, at);
`,
  },
];
