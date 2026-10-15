import type { Database } from '../database.js';

// Admin console queries (owned by the admin agent). Read-mostly aggregates over accounts /
// sessions / match stats, account deletion with history anonymisation, and the append-only
// admin audit log (migration 2). Never selects passphrase lookups, verifiers, salts or token hashes.

export type AdminAccountSort = 'created' | 'lastSeen' | 'name' | 'games';

export interface AdminAccountQuery {
  /** Free text: display-name substring (or prefix) OR account-id prefix. '' = everything. */
  q: string;
  match: 'contains' | 'prefix';
  sort: AdminAccountSort;
  dir: 'asc' | 'desc';
  limit: number;
  offset: number;
  /** Sessions with expires_at <= now are not counted as active. */
  now: number;
}

export interface AdminAccountRow {
  id: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesStorytold: number;
  activeSessions: number;
}

export interface AuditEntryInput {
  at: number;
  adminAccountId: string;
  adminName: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface AuditEntry {
  id: number;
  at: number;
  adminAccountId: string;
  adminName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  detail: Record<string, unknown> | null;
}

/** Escapes LIKE wildcards so user search text is matched literally (ESCAPE '\'). */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const SORT_SQL: Record<AdminAccountSort, string> = {
  created: 'a.created_at',
  lastSeen: 'a.last_seen_at',
  name: 'a.display_name COLLATE NOCASE',
  games: 'gamesPlayed',
};

export function createAdminRepo({ sqlite }: Database) {
  const selectCols = `
    a.id AS id, a.display_name AS displayName, a.created_at AS createdAt, a.last_seen_at AS lastSeenAt,
    (SELECT COUNT(*) FROM match_players mp WHERE mp.account_id = a.id) AS gamesPlayed,
    (SELECT COUNT(*) FROM match_players mp JOIN matches m ON m.id = mp.match_id
       WHERE mp.account_id = a.id AND m.ended_at IS NOT NULL AND mp.won = 1) AS gamesWon,
    (SELECT COUNT(*) FROM matches m WHERE m.storyteller_account_id = a.id AND m.ended_at IS NOT NULL) AS gamesStorytold,
    (SELECT COUNT(*) FROM sessions s WHERE s.account_id = a.id AND s.expires_at > @now) AS activeSessions`;
  const where = `(@q = '' OR a.display_name LIKE @pattern ESCAPE '\\' OR a.id LIKE @idPrefix ESCAPE '\\')`;
  const countStmt = sqlite.prepare(`SELECT COUNT(*) AS n FROM accounts a WHERE ${where}`);
  const listStmts = new Map<string, ReturnType<typeof sqlite.prepare>>();
  const listStmt = (sort: AdminAccountSort, dir: 'asc' | 'desc') => {
    const key = `${sort}:${dir}`;
    let st = listStmts.get(key);
    if (!st) {
      // Sort column/direction come from a fixed allow-list (never from user text).
      st = sqlite.prepare(
        `SELECT ${selectCols} FROM accounts a WHERE ${where} ORDER BY ${SORT_SQL[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'}, a.id ASC LIMIT @limit OFFSET @offset`,
      );
      listStmts.set(key, st);
    }
    return st;
  };
  const byIdStmt = sqlite.prepare(`SELECT ${selectCols} FROM accounts a WHERE a.id = @id`);

  const anonymiseTx = sqlite.transaction((id: string, tombstone: string): boolean => {
    sqlite.prepare('UPDATE match_players SET account_id = ? WHERE account_id = ?').run(tombstone, id);
    sqlite.prepare('UPDATE matches SET storyteller_account_id = ? WHERE storyteller_account_id = ?').run(tombstone, id);
    sqlite.prepare('DELETE FROM sessions WHERE account_id = ?').run(id);
    return sqlite.prepare('DELETE FROM accounts WHERE id = ?').run(id).changes > 0;
  });

  const insertAudit = sqlite.prepare(`
    INSERT INTO admin_audit (at, admin_account_id, admin_name, action, target_type, target_id, target_name, detail_json)
    VALUES (@at, @adminAccountId, @adminName, @action, @targetType, @targetId, @targetName, @detailJson)`);
  const listAudit = sqlite.prepare(`
    SELECT id, at, admin_account_id AS adminAccountId, admin_name AS adminName, action, target_type AS targetType,
           target_id AS targetId, target_name AS targetName, detail_json AS detailJson
    FROM admin_audit WHERE (@before IS NULL OR id < @before) ORDER BY id DESC LIMIT @limit`);

  const params = (q: Pick<AdminAccountQuery, 'q' | 'match' | 'now'>) => {
    const text = likeEscape(q.q);
    return {
      q: q.q,
      pattern: q.match === 'prefix' ? `${text}%` : `%${text}%`,
      idPrefix: `${text}%`,
      now: q.now,
    };
  };

  return {
    listAccounts(q: AdminAccountQuery): { total: number; rows: AdminAccountRow[] } {
      const p = params(q);
      const total = (countStmt.get({ q: p.q, pattern: p.pattern, idPrefix: p.idPrefix }) as { n: number }).n;
      const rows = listStmt(q.sort, q.dir).all({ ...p, limit: q.limit, offset: q.offset }) as AdminAccountRow[];
      return { total, rows };
    },

    getAccount(id: string, now: number): AdminAccountRow | undefined {
      return byIdStmt.get({ id, now }) as AdminAccountRow | undefined;
    },

    /**
     * Deletes the account and its sessions. Game history stays consistent: the account's
     * match_players rows and storyteller references are re-pointed to `tombstone` (an opaque id
     * that matches no account), so match totals are unchanged but nothing links back to the person.
     */
    deleteAccountAnonymised(id: string, tombstone: string): boolean {
      return anonymiseTx(id, tombstone);
    },

    totals(now: number): { accounts: number; activeSessions: number; matches: number; matchesCompleted: number } {
      const r = sqlite
        .prepare(
          `SELECT (SELECT COUNT(*) FROM accounts) AS accounts,
                  (SELECT COUNT(*) FROM sessions WHERE expires_at > ?) AS activeSessions,
                  (SELECT COUNT(*) FROM matches) AS matches,
                  (SELECT COUNT(*) FROM matches WHERE ended_at IS NOT NULL) AS matchesCompleted`,
        )
        .get(now) as { accounts: number; activeSessions: number; matches: number; matchesCompleted: number };
      return r;
    },

    appendAudit(e: AuditEntryInput): number {
      return Number(
        insertAudit.run({
          at: e.at,
          adminAccountId: e.adminAccountId,
          adminName: e.adminName,
          action: e.action,
          targetType: e.targetType ?? null,
          targetId: e.targetId ?? null,
          targetName: e.targetName ?? null,
          detailJson: e.detail ? JSON.stringify(e.detail) : null,
        }).lastInsertRowid,
      );
    },

    listAudit(opts: { limit: number; before?: number | null }): AuditEntry[] {
      const rows = listAudit.all({ limit: opts.limit, before: opts.before ?? null }) as (Omit<AuditEntry, 'detail'> & { detailJson: string | null })[];
      return rows.map(({ detailJson, ...r }) => {
        let detail: Record<string, unknown> | null = null;
        if (detailJson) {
          try {
            detail = JSON.parse(detailJson) as Record<string, unknown>;
          } catch {
            detail = null;
          }
        }
        return { ...r, detail };
      });
    },
  };
}

export type AdminRepo = ReturnType<typeof createAdminRepo>;
