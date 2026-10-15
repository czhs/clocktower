// OWNED BY notebook. Private per-game notebooks (migration 4, table `notebooks`): one row per
// (match_id, account_id). OWNER-ONLY data: the only reads are by the owner's own account id
// (the GameRoom serves it to that account's connection). Nothing here is exposed to admins,
// stats or game records, and callers must never log `data`.
//
// data_json holds `{"v":1,"rev":<n>,"data":<NotebookData>}` (the table has no rev column).
import type { Database } from '../database.js';

export interface NotebookRow {
  matchId: string;
  rev: number;
  /** Unvalidated JSON (the server re-validates it with the protocol schema). */
  data: unknown;
  updatedAt: number;
}

export type NotebookPutResult = { ok: true } | { ok: false; current: NotebookRow };

interface RawRow {
  match_id: string;
  updated_at: number;
  data_json: string;
}

function decode(r: RawRow): NotebookRow {
  let rev = 0;
  let data: unknown = null;
  try {
    const doc = JSON.parse(r.data_json) as { rev?: unknown; data?: unknown };
    rev = typeof doc.rev === 'number' && Number.isFinite(doc.rev) ? doc.rev : 0;
    data = doc.data ?? null;
  } catch {
    // corrupt row: rev 0 / no data (the next save replaces it)
  }
  return { matchId: r.match_id, rev, data, updatedAt: r.updated_at };
}

export function createNotebooksRepo({ sqlite }: Database) {
  const getStmt = sqlite.prepare('SELECT match_id, updated_at, data_json FROM notebooks WHERE match_id = ? AND account_id = ?');
  const upsertStmt = sqlite.prepare(`
    INSERT INTO notebooks (match_id, account_id, updated_at, data_json) VALUES (@matchId, @accountId, @updatedAt, @dataJson)
    ON CONFLICT (match_id, account_id) DO UPDATE SET updated_at = excluded.updated_at, data_json = excluded.data_json`);
  const listStmt = sqlite.prepare(
    'SELECT match_id, updated_at, data_json FROM notebooks WHERE account_id = ? ORDER BY updated_at DESC LIMIT ?',
  );
  const deleteStmt = sqlite.prepare('DELETE FROM notebooks WHERE account_id = ?');

  const get = (matchId: string, accountId: string): NotebookRow | null => {
    const r = getStmt.get(matchId, accountId) as RawRow | undefined;
    return r ? decode(r) : null;
  };

  /** Stores `data` as `rev` only if `rev` is newer than the stored rev (atomic). */
  const putIfNewerTx = sqlite.transaction(
    (matchId: string, accountId: string, rev: number, data: unknown, updatedAt: number): NotebookPutResult => {
      const current = get(matchId, accountId);
      if (current && current.rev >= rev) return { ok: false, current };
      upsertStmt.run({ matchId, accountId, updatedAt, dataJson: JSON.stringify({ v: 1, rev, data }) });
      return { ok: true };
    },
  );

  return {
    /** The owner's notebook for one match, or null if they never saved one. */
    get,
    putIfNewer(matchId: string, accountId: string, rev: number, data: unknown, updatedAt: number): NotebookPutResult {
      return putIfNewerTx(matchId, accountId, rev, data, updatedAt);
    },
    /** The owner's notebooks, newest first (for a future "past notebooks" view — owner only). */
    listForAccount(accountId: string, limit = 50): NotebookRow[] {
      return (listStmt.all(accountId, Math.max(1, Math.min(500, Math.floor(limit)))) as RawRow[]).map(decode);
    },
    /**
     * Removes every notebook of an account (account deletion). Returns the number removed.
     * admin.ts `anonymiseTx` runs the same DELETE, so deleting an account deletes its notebooks.
     */
    deleteForAccount(accountId: string): number {
      return deleteStmt.run(accountId).changes;
    },
  };
}

export type NotebooksRepo = ReturnType<typeof createNotebooksRepo>;
