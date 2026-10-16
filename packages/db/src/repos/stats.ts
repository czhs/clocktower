import { and, eq, sql } from 'drizzle-orm';
import type { CharacterTally, RecentGame, RoleHistoryEntry, StatsView } from '@ct/protocol';
import type { Database } from '../database.js';
import { matchPlayers, matches } from '../schema.js';

export interface MatchStart {
  matchId: string;
  lobbyId: string;
  script: string;
  startedAt: number;
  storytellerAccountId: string | null;
  /** `avatarId` (v2.2 stats): the roster character (Cosmetics.preset) used in this match. */
  players: { accountId: string; seat: number; avatarId?: string | null }[];
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
const RECENT_LIMIT = 5;

/** The StatsView fields that existed before v2.2 (the rest come from `recordFor`). */
type StatsViewV1 = Pick<
  StatsView,
  | 'matchesPlayed' | 'matchesCompleted' | 'wins' | 'losses' | 'goodWins' | 'evilWins' | 'timesExecuted'
  | 'timesDied' | 'nominationsMade' | 'ghostVotesUsed' | 'gamesStorytold' | 'roleHistory'
>;

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
      db.insert(matchPlayers).values({ matchId: m.matchId, accountId: p.accountId, seat: p.seat, avatarId: p.avatarId ?? null }).onConflictDoNothing().run();
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
      COALESCE(SUM(mp.ghost_vote_used), 0) AS ghostVotes,
      COALESCE(SUM(CASE WHEN m.ended_at IS NOT NULL AND mp.alignment = 'good' THEN 1 ELSE 0 END), 0) AS goodGames,
      COALESCE(SUM(CASE WHEN m.ended_at IS NOT NULL AND mp.alignment = 'evil' THEN 1 ELSE 0 END), 0) AS evilGames
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

  // (v2.2 stats) home-screen record. Every query is keyed by the account (match_players_account_idx,
  // matches_storyteller_idx, match_records_storyteller_idx) and returns only this account's rows.
  const abandoned = sqlite.prepare(`
    SELECT COUNT(*) AS n FROM match_players mp JOIN match_records mr ON mr.match_id = mp.match_id
    WHERE mp.account_id = ? AND mr.status = 'abandoned'`);
  const outcomes = sqlite
    .prepare(`
    SELECT mp.won FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.account_id = ? AND m.ended_at IS NOT NULL AND mp.won IS NOT NULL
    ORDER BY m.ended_at ASC, m.id ASC`)
    .pluck();
  const topCharacters = sqlite.prepare(`
    SELECT COALESCE(mp.final_character, mp.starting_character) AS character, COUNT(*) AS games,
           COALESCE(SUM(CASE WHEN mp.won = 1 THEN 1 ELSE 0 END), 0) AS wins
    FROM match_players mp JOIN matches m ON m.id = mp.match_id
    WHERE mp.account_id = ? AND m.ended_at IS NOT NULL AND COALESCE(mp.final_character, mp.starting_character) IS NOT NULL
    GROUP BY character ORDER BY games DESC, wins DESC, MAX(m.ended_at) DESC LIMIT 3`);
  const favouriteAvatar = sqlite.prepare(`
    SELECT avatar_id AS avatarId, COUNT(*) AS games FROM match_players
    WHERE account_id = ? AND avatar_id IS NOT NULL
    GROUP BY avatar_id ORDER BY games DESC, avatar_id ASC LIMIT 1`);
  // Recent games: ids first (cheap, indexed), then details for those few rows only. In-progress
  // games (no end, no record) are left out; legacy finished games without a record are kept.
  const recentIds = sqlite.prepare(`
    SELECT matchId, role FROM (
      SELECT mp.match_id AS matchId, 'player' AS role, COALESCE(m.ended_at, mr.ended_at) AS endedAt
      FROM match_players mp JOIN matches m ON m.id = mp.match_id LEFT JOIN match_records mr ON mr.match_id = mp.match_id
      WHERE mp.account_id = @a AND (m.ended_at IS NOT NULL OR mr.match_id IS NOT NULL)
      UNION ALL
      SELECT mr.match_id, 'storyteller', mr.ended_at FROM match_records mr WHERE mr.storyteller_account_id = @a
      UNION ALL
      SELECT m.id, 'storyteller', m.ended_at FROM matches m
      WHERE m.storyteller_account_id = @a AND m.ended_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM match_records r WHERE r.match_id = m.id)
    ) ORDER BY endedAt DESC, matchId DESC LIMIT @limit`);
  const recentDetail = sqlite.prepare(`
    SELECT COALESCE(m.ended_at, mr.ended_at) AS endedAt, COALESCE(mr.status, 'finished') AS status,
           COALESCE(m.winner, mr.winner) AS winner, json_extract(mr.record_json, '$.lobby.name') AS lobbyName,
           COALESCE(mp.final_character, mp.starting_character) AS character, mp.alignment AS alignment,
           mp.won AS won, mp.avatar_id AS avatarId
    FROM (SELECT @id AS id) x
    LEFT JOIN matches m ON m.id = x.id
    LEFT JOIN match_records mr ON mr.match_id = x.id
    LEFT JOIN match_players mp ON mp.match_id = x.id AND mp.account_id = @a`);
  // Abandoned game: no final reveal, so only what the player was told (believed character).
  const abandonedSeat = sqlite.prepare(`
    SELECT COALESCE(json_extract(s.value, '$.finalBelievedCharacter'), json_extract(s.value, '$.startingBelievedCharacter')) AS character,
           COALESCE(json_extract(s.value, '$.finalAlignment'), json_extract(s.value, '$.startingAlignment')) AS alignment,
           json_extract(s.value, '$.avatarId') AS avatarId
    FROM match_records mr, json_each(mr.record_json, '$.seats') s
    WHERE mr.match_id = @id AND json_extract(s.value, '$.accountId') = @a LIMIT 1`);

  const recentGames = (accountId: string): RecentGame[] => {
    const ids = recentIds.all({ a: accountId, limit: RECENT_LIMIT }) as { matchId: string; role: 'player' | 'storyteller' }[];
    return ids.map(({ matchId, role }) => {
      const d = recentDetail.get({ id: matchId, a: accountId }) as {
        endedAt: number | null;
        status: string;
        winner: string | null;
        lobbyName: string | null;
        character: string | null;
        alignment: string | null;
        won: number | null;
        avatarId: string | null;
      };
      const status: RecentGame['status'] = d.status === 'abandoned' ? 'abandoned' : 'finished';
      const team = (v: unknown): 'good' | 'evil' | null => (v === 'good' || v === 'evil' ? v : null);
      const entry: RecentGame = {
        matchId,
        endedAt: new Date(d.endedAt ?? 0).toISOString(),
        lobbyName: typeof d.lobbyName === 'string' ? d.lobbyName : null,
        as: role,
        status,
        character: null,
        alignment: null,
        avatarId: null,
        winner: status === 'finished' ? team(d.winner) : null,
        result: status === 'abandoned' ? 'abandoned' : role === 'storyteller' ? 'told' : d.won === 1 ? 'won' : 'lost',
      };
      if (role === 'player') {
        entry.avatarId = d.avatarId;
        if (status === 'finished') {
          entry.character = d.character;
          entry.alignment = team(d.alignment);
        } else {
          const seat = abandonedSeat.get({ id: matchId, a: accountId }) as { character: unknown; alignment: unknown; avatarId: unknown } | undefined;
          entry.character = typeof seat?.character === 'string' ? seat.character : null;
          entry.alignment = entry.character ? team(seat?.alignment) : null;
          entry.avatarId ??= typeof seat?.avatarId === 'string' ? seat.avatarId : null;
        }
      }
      return entry;
    });
  };

  /** (v2.2 stats) The home-screen extras (see StatsView). */
  const recordFor = (
    accountId: string,
    a: Record<string, number> = aggregate.get(accountId) as Record<string, number>,
  ): Omit<StatsView, keyof StatsViewV1> => {
    const wins = a.wins ?? 0;
    const losses = a.losses ?? 0;
    let current = 0;
    let best = 0;
    for (const won of outcomes.all(accountId) as number[]) {
      current = won === 1 ? current + 1 : 0;
      best = Math.max(best, current);
    }
    const fav = favouriteAvatar.get(accountId) as { avatarId: string; games: number } | undefined;
    return {
      gamesAbandoned: (abandoned.get(accountId) as { n: number }).n,
      winRate: wins + losses > 0 ? wins / (wins + losses) : null,
      goodGames: a.goodGames ?? 0,
      evilGames: a.evilGames ?? 0,
      topCharacters: topCharacters.all(accountId) as CharacterTally[],
      favouriteAvatar: fav ? { avatarId: fav.avatarId, games: fav.games } : null,
      currentWinStreak: current,
      bestWinStreak: best,
      recentGames: recentGames(accountId),
    };
  };

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
        ...recordFor(accountId, a),
      };
    },
    matchCount(): number {
      return db.select({ n: sql<number>`count(*)` }).from(matches).get()?.n ?? 0;
    },
  };
}

export type StatsRepo = ReturnType<typeof createStatsRepo>;
