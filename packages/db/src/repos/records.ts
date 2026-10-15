// OWNED BY records. Full game records (match_records, migration 3): one versioned JSON document per
// game (finished or abandoned), written exactly once (INSERT … ON CONFLICT DO NOTHING) at the end of
// the game, inside the same transaction as the stats summary when there is one. The only later
// change is appending released pamphlets (json_insert into $.pamphlets).
//
// The document's shape is defined by the server (apps/server/src/records/types.ts, spec in
// docs/game-records.md); this repo only needs the header columns + the JSON. Account filters use
// SQLite JSON1 over $.seats / storyteller_account_id (fine for the expected hundreds of games; add
// a join table in a new migration if this ever needs an index).
import type { Database } from '../database.js';

export interface MatchRecordInput {
  matchId: string;
  lobbyId: string;
  version: number;
  status: 'finished' | 'abandoned';
  startedAt: number;
  endedAt: number;
  winner: 'good' | 'evil' | null;
  playerCount: number;
  storytellerAccountId: string | null;
  /** The full record (serialised with JSON.stringify). */
  record: unknown;
}

export interface MatchRecordSummary {
  matchId: string;
  lobbyId: string;
  version: number;
  status: 'finished' | 'abandoned';
  startedAt: number;
  endedAt: number;
  winner: 'good' | 'evil' | null;
  playerCount: number;
  storytellerAccountId: string | null;
  /** From the record JSON. */
  storytellerName: string | null;
  lobbyName: string | null;
  reason: string | null;
  script: string | null;
}

export interface ListRecordsQuery {
  limit?: number;
  /** Only records that ended strictly before this epoch-ms (paging: pass the last row's endedAt). */
  before?: number;
  /** Only games this account played in or told. */
  accountId?: string;
}

interface Row {
  matchId: string;
  lobbyId: string;
  version: number;
  status: string;
  startedAt: number;
  endedAt: number;
  winner: string | null;
  playerCount: number;
  storytellerAccountId: string | null;
  storytellerName: string | null;
  lobbyName: string | null;
  reason: string | null;
  script: string | null;
}

const SUMMARY_COLUMNS = `
  match_id AS matchId, lobby_id AS lobbyId, version, status, started_at AS startedAt, ended_at AS endedAt,
  winner, player_count AS playerCount, storyteller_account_id AS storytellerAccountId,
  json_extract(record_json, '$.storyteller.displayName') AS storytellerName,
  json_extract(record_json, '$.lobby.name') AS lobbyName,
  json_extract(record_json, '$.result.reason') AS reason,
  json_extract(record_json, '$.script') AS script`;

export function createRecordsRepo(database: Database) {
  const { sqlite } = database;
  const insert = sqlite.prepare(`
    INSERT INTO match_records (match_id, lobby_id, version, status, started_at, ended_at, winner, player_count, storyteller_account_id, record_json)
    VALUES (@matchId, @lobbyId, @version, @status, @startedAt, @endedAt, @winner, @playerCount, @storytellerAccountId, @recordJson)
    ON CONFLICT (match_id) DO NOTHING`);
  const getJson = sqlite.prepare('SELECT record_json AS json FROM match_records WHERE match_id = ?');
  const getSummary = sqlite.prepare(`SELECT ${SUMMARY_COLUMNS} FROM match_records WHERE match_id = ?`);
  const appendPamphletStmt = sqlite.prepare(
    `UPDATE match_records SET record_json = json_insert(record_json, '$.pamphlets[#]', json(?)) WHERE match_id = ? AND json_type(record_json, '$.pamphlets') = 'array'`,
  );
  const listStmt = sqlite.prepare(`
    SELECT ${SUMMARY_COLUMNS} FROM match_records
    WHERE (@before IS NULL OR ended_at < @before)
      AND (@accountId IS NULL
           OR storyteller_account_id = @accountId
           OR EXISTS (SELECT 1 FROM json_each(record_json, '$.seats') s WHERE json_extract(s.value, '$.accountId') = @accountId))
    ORDER BY ended_at DESC, match_id DESC
    LIMIT @limit`);
  const countStmt = sqlite.prepare('SELECT COUNT(*) AS n FROM match_records');

  const toSummary = (r: Row): MatchRecordSummary => ({
    ...r,
    status: r.status === 'abandoned' ? 'abandoned' : 'finished',
    winner: r.winner === 'good' || r.winner === 'evil' ? r.winner : null,
  });

  return {
    /** Writes the record once. Returns false if this match already has a record (idempotent). */
    saveRecord(m: MatchRecordInput): boolean {
      return (
        insert.run({
          matchId: m.matchId,
          lobbyId: m.lobbyId,
          version: m.version,
          status: m.status,
          startedAt: m.startedAt,
          endedAt: m.endedAt,
          winner: m.winner,
          playerCount: m.playerCount,
          storytellerAccountId: m.storytellerAccountId,
          recordJson: JSON.stringify(m.record),
        }).changes > 0
      );
    },
    /** The parsed record document, or null. */
    getRecord(matchId: string): unknown {
      const row = getJson.get(matchId) as { json: string } | undefined;
      return row ? (JSON.parse(row.json) as unknown) : null;
    },
    /** The stored JSON text (for downloads, without re-serialising). */
    getRecordJson(matchId: string): string | null {
      return (getJson.get(matchId) as { json: string } | undefined)?.json ?? null;
    },
    getSummary(matchId: string): MatchRecordSummary | null {
      const r = getSummary.get(matchId) as Row | undefined;
      return r ? toSummary(r) : null;
    },
    /** Newest first. */
    listRecords(q: ListRecordsQuery = {}): MatchRecordSummary[] {
      const limit = Math.max(1, Math.min(200, Math.floor(q.limit ?? 50)));
      return (listStmt.all({ before: q.before ?? null, accountId: q.accountId ?? null, limit }) as Row[]).map(toSummary);
    },
    /** Adds a pamphlet released after the record was written. False if there is no record yet. */
    appendPamphlet(matchId: string, pamphlet: unknown): boolean {
      return appendPamphletStmt.run(JSON.stringify(pamphlet), matchId).changes > 0;
    },
    count(): number {
      return (countStmt.get() as { n: number }).n;
    },
  };
}

export type RecordsRepo = ReturnType<typeof createRecordsRepo>;
