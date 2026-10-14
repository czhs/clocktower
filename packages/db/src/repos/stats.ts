import { and, eq, sql } from 'drizzle-orm';
import type { RoleHistoryEntry, StatsView } from '@ct/protocol';
import type { Database } from '../database.js';
import { matchPlayers, matches } from '../schema.js';

export interface MatchStart {
  matchId: string;
  lobbyId: string;
  script: string;
  startedAt: number;
  storytellerAccountId: string | null;
  players: { accountId: string; seat: number }[];
}

export interface MatchResult extends Omit<MatchStart, 'players'> {
  endedAt: number;
  winner: 'good' | 'evil';
  reason: string;
  players: {
    accountId: string;
    seat: number;
    startingCharacter: string;
    finalCharacter: string;
    alignment: 'good' | 'evil';
    won: boolean;
    alive: boolean;
    executed: boolean;
    died: boolean;
    nominations: number;
    ghostVoteUsed: boolean;
  }[];
}

const ROLE_HISTORY_LIMIT = 20;

/**
 * Match statistics. Every per-account number is DERIVED by aggregate queries over
 * `match_players` (PK match_id+account_id), and a match's result can be finalised only once
 * (`ended_at IS NULL` guard inside a transaction) — so replays, duplicate `game_finished`
 * events or reconnect races can never double-count a win.
 */
export function createStatsRepo(database: Database) {
  const { db, sqlite } = database;

  const recordStartTx = sqlite.transaction((m: MatchStart): boolean => {
    const inserted = db
      .insert(matches)
      .values({ id: m.matchId, lobbyId: m.lobbyId, script: m.script, startedAt: m.startedAt, storytellerAccountId: m.storytellerAccountId })
      .onConflictDoNothing()
      .run().changes;
    if (!inserted) return false;
    for (const p of m.players) {
      db.insert(matchPlayers).values({ matchId: m.matchId, accountId: p.accountId, seat: p.seat }).onConflictDoNothing().run();
    }
    return true;
  });

  const recordResultTx = sqlite.transaction((m: MatchResult): boolean => {
    const existing = db.select({ endedAt: matches.endedAt }).from(matches).where(eq(matches.id, m.matchId)).get();
    if (existing && existing.endedAt !== null) return false; // already finalised: idempotent no-op
    if (!existing) {
      db.insert(matches)
        .values({ id: m.matchId, lobbyId: m.lobbyId, script: m.script, startedAt: m.startedAt, storytellerAccountId: m.storytellerAccountId })
        .run();
    }
    const changed = db
      .update(matches)
      .set({ endedAt: m.endedAt, winner: m.winner, reason: m.reason, storytellerAccountId: m.storytellerAccountId })
      .where(and(eq(matches.id, m.matchId), sql`${matches.endedAt} IS NULL`))
      .run().changes;
    if (!changed) return false;
    for (const p of m.players) {
      const values = {
        seat: p.seat,
        startingCharacter: p.startingCharacter,
        finalCharacter: p.finalCharacter,
        alignment: p.alignment,
        won: p.won,
        alive: p.alive,
        executed: p.executed,
        died: p.died,
        nominations: p.nominations,
        ghostVoteUsed: p.ghostVoteUsed,
      };
      db.insert(matchPlayers)
        .values({ matchId: m.matchId, accountId: p.accountId, ...values })
        .onConflictDoUpdate({ target: [matchPlayers.matchId, matchPlayers.accountId], set: values })
        .run();
    }
    return true;
  });

  const aggregate = sqlite.prepare(`
    SELECT
      COUNT(*) AS played,
      COALESCE(SUM(CASE WHEN m.ended_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed,
      COALESCE(SUM(CASE WHEN m.ended_at IS NOT NULL AND mp.won = 1 THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN m.ended_at IS NOT NULL AND mp.won = 0 THEN 1 ELSE 0 END), 0) AS losses,
      COALESCE(SUM(CASE WHEN m.ended_at IS NOT NULL AND mp.won = 1 AND mp.alignment = 'good' THEN 1 ELSE 0 END), 0) AS goodWins,
      COALESCE(SUM(CASE WHEN m.ended_at IS NOT NULL AND mp.won = 1 AND mp.alignment = 'evil' THEN 1 ELSE 0 END), 0) AS evilWins,
      COALESCE(SUM(mp.executed), 0) AS executed,
      COALESCE(SUM(mp.died), 0) AS died,
      COALESCE(SUM(mp.nominations), 0) AS nominations,
      COALESCE(SUM(mp.ghost_vote_used), 0) AS ghostVotes
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.account_id = ?`);
  const storytold = sqlite.prepare(
    'SELECT COUNT(*) AS n FROM matches WHERE storyteller_account_id = ? AND ended_at IS NOT NULL',
  );
  const history = sqlite.prepare(`
    SELECT mp.match_id AS matchId, COALESCE(mp.final_character, mp.starting_character) AS character,
           mp.alignment AS alignment, mp.won AS won, m.ended_at AS endedAt
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.account_id = ? AND m.ended_at IS NOT NULL AND mp.alignment IS NOT NULL
    ORDER BY m.ended_at DESC LIMIT ?`);

  return {
    /** Inserts the match + seated players at game start. Returns false if already recorded. */
    recordMatchStarted(m: MatchStart): boolean {
      return recordStartTx(m);
    },
    /** Finalises the match exactly once. Returns false if this matchId was already finalised. */
    recordMatchFinished(m: MatchResult): boolean {
      return recordResultTx(m);
    },
    statsFor(accountId: string): StatsView {
      const a = aggregate.get(accountId) as Record<string, number>;
      const st = storytold.get(accountId) as { n: number };
      const rows = history.all(accountId, ROLE_HISTORY_LIMIT) as {
        matchId: string;
        character: string | null;
        alignment: 'good' | 'evil';
        won: number;
        endedAt: number;
      }[];
      const roleHistory: RoleHistoryEntry[] = rows.map((r) => ({
        matchId: r.matchId,
        character: r.character ?? 'unknown',
        alignment: r.alignment,
        won: r.won === 1,
        endedAt: new Date(r.endedAt).toISOString(),
      }));
      return {
        matchesPlayed: a.played ?? 0,
        matchesCompleted: a.completed ?? 0,
        wins: a.wins ?? 0,
        losses: a.losses ?? 0,
        goodWins: a.goodWins ?? 0,
        evilWins: a.evilWins ?? 0,
        timesExecuted: a.executed ?? 0,
        timesDied: a.died ?? 0,
        nominationsMade: a.nominations ?? 0,
        ghostVotesUsed: a.ghostVotes ?? 0,
        gamesStorytold: st.n,
        roleHistory,
      };
    },
    matchCount(): number {
      return db.select({ n: sql<number>`count(*)` }).from(matches).get()?.n ?? 0;
    },
  };
}

export type StatsRepo = ReturnType<typeof createStatsRepo>;
