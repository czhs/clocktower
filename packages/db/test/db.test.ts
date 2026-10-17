import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { DEFAULT_COSMETICS } from '@ct/protocol';
import { createRecordsRepo, DuplicateLookupError, MIGRATIONS, openDatabase, openRepositories, runMigrations, usageMonth, type MatchResult, type Repositories } from '../src/index.js';

const dirs: string[] = [];
const opened: Repositories[] = [];
function tmpDb(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'ct-db-'));
  dirs.push(d);
  return path.join(d, 'nested', 'test.db');
}
function repos(url = tmpDb()): Repositories {
  const r = openRepositories(url);
  opened.push(r);
  return r;
}
afterEach(() => {
  for (const r of opened.splice(0)) r.database.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function account(r: Repositories, id: string, lookup = `lk-${id}`) {
  return r.accounts.insert({
    id,
    displayName: `Name ${id}`,
    cosmetics: DEFAULT_COSMETICS,
    passphraseLookup: lookup,
    passphraseVerifier: 'scrypt$v',
    salt: 'salt',
    now: 1000,
  });
}

function result(matchId: string, players: [string, boolean, 'good' | 'evil'][], st: string | null = null): MatchResult {
  return {
    matchId,
    lobbyId: 'lobby1',
    script: 'trouble-brewing',
    startedAt: 1000,
    endedAt: 5000,
    winner: 'good',
    reason: 'demon executed',
    storytellerAccountId: st,
    players: players.map(([accountId, won, alignment], seat) => ({
      accountId,
      seat,
      startingCharacter: alignment === 'good' ? 'chef' : 'imp',
      finalCharacter: alignment === 'good' ? 'chef' : 'imp',
      alignment,
      won,
      alive: true,
      executed: !won,
      died: !won,
      nominations: 2,
      ghostVoteUsed: false,
    })),
  };
}

describe('@ct/db', () => {
  it('creates the file in a nested dir, enables WAL + foreign keys and tracks migrations', () => {
    const url = tmpDb();
    const r = repos(`file:${url}`);
    expect(existsSync(url)).toBe(true);
    expect(r.database.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(r.database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    const applied = r.database.sqlite.prepare('SELECT id FROM _migrations').all();
    expect(applied).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }]); // 6 = v2.3 OPS moderation
    r.database.close();
    // Re-opening does not re-apply migrations.
    const again = repos(url);
    expect(again.database.sqlite.prepare('SELECT COUNT(*) AS n FROM _migrations').get()).toEqual({ n: 6 });
  });

  it('accounts: insert, find, unique lookup, profile update, credentials lookup', () => {
    const r = repos();
    account(r, 'a1');
    expect(() => account(r, 'a2', 'lk-a1')).toThrow(DuplicateLookupError);
    expect(r.accounts.findById('a1')?.displayName).toBe('Name a1');
    expect(r.accounts.findCredentialsByLookup('lk-a1')).toEqual({ id: 'a1', verifier: 'scrypt$v', salt: 'salt' });
    expect(r.accounts.findCredentialsByLookup('nope')).toBeUndefined();
    const upd = r.accounts.updateProfile('a1', { displayName: 'New', cosmetics: { ...DEFAULT_COSMETICS, hair: 'braid' } });
    expect(upd?.displayName).toBe('New');
    expect(upd?.cosmetics.hair).toBe('braid');
    r.accounts.touch('a1', 9999);
    expect(r.accounts.findById('a1')?.lastSeenAt).toBe(9999);
    expect(r.accounts.count()).toBe(1);
  });

  it('accounts: corrupt cosmetics JSON falls back to defaults', () => {
    const r = repos();
    account(r, 'a1');
    r.database.sqlite.prepare("UPDATE accounts SET cosmetics_json = '{bad' WHERE id = 'a1'").run();
    expect(r.accounts.findById('a1')?.cosmetics).toEqual(DEFAULT_COSMETICS);
  });

  it('sessions: create/find/touch/delete/expire and FK cascade', () => {
    const r = repos();
    account(r, 'a1');
    r.sessions.create({ tokenHash: 'h1', accountId: 'a1', now: 1, expiresAt: 100 });
    r.sessions.create({ tokenHash: 'h2', accountId: 'a1', now: 1, expiresAt: 10 });
    expect(r.sessions.find('h1')?.accountId).toBe('a1');
    r.sessions.touch('h1', 50, 500);
    expect(r.sessions.find('h1')).toMatchObject({ lastUsedAt: 50, expiresAt: 500 });
    expect(r.sessions.deleteExpired(20)).toBe(1);
    expect(r.sessions.find('h2')).toBeUndefined();
    expect(() => r.sessions.create({ tokenHash: 'h3', accountId: 'missing', now: 1, expiresAt: 2 })).toThrow(/FOREIGN KEY/);
    r.sessions.delete('h1');
    expect(r.sessions.find('h1')).toBeUndefined();
  });

  it('stats: recording the same match twice never double-counts', () => {
    const r = repos();
    for (const id of ['a', 'b', 'c', 'st']) account(r, id);
    const m = result('m1', [
      ['a', true, 'good'],
      ['b', true, 'good'],
      ['c', false, 'evil'],
    ], 'st');
    expect(r.stats.recordMatchStarted({ ...m, players: m.players.map((p) => ({ accountId: p.accountId, seat: p.seat })) })).toBe(true);
    expect(r.stats.statsFor('a')).toMatchObject({ matchesPlayed: 1, matchesCompleted: 0, wins: 0 });
    expect(r.stats.recordMatchFinished(m)).toBe(true);
    expect(r.stats.recordMatchFinished(m)).toBe(false);
    expect(r.stats.recordMatchFinished({ ...m, winner: 'evil' })).toBe(false);
    expect(r.stats.matchCount()).toBe(1);
    const a = r.stats.statsFor('a');
    expect(a).toMatchObject({ matchesPlayed: 1, matchesCompleted: 1, wins: 1, losses: 0, goodWins: 1, evilWins: 0, nominationsMade: 2 });
    expect(a.roleHistory).toEqual([{ matchId: 'm1', character: 'chef', alignment: 'good', won: true, endedAt: new Date(5000).toISOString() }]);
    expect(r.stats.statsFor('c')).toMatchObject({ wins: 0, losses: 1, timesExecuted: 1, timesDied: 1 });
    expect(r.stats.statsFor('st')).toMatchObject({ matchesPlayed: 0, gamesStorytold: 1 });
    // A second, distinct match counts.
    expect(r.stats.recordMatchFinished(result('m2', [['a', false, 'evil']]))).toBe(true);
    expect(r.stats.statsFor('a')).toMatchObject({ matchesPlayed: 2, wins: 1, losses: 1 });
  });

  // (v2.2 stats) home-screen record: win rate, streaks, top characters, favourite avatar, recents.
  const seatJson = (accountId: string, o: Record<string, unknown> = {}) => ({
    accountId,
    avatarId: null,
    finalCharacter: 'drunk',
    finalAlignment: 'good',
    finalBelievedCharacter: 'chef',
    startingBelievedCharacter: 'chef',
    ...o,
  });
  function saveAbandoned(r: Repositories, matchId: string, endedAt: number, seats: object[], st: string | null = null) {
    createRecordsRepo(r.database).saveRecord({
      matchId,
      lobbyId: 'lobby1',
      version: 1,
      status: 'abandoned',
      startedAt: endedAt - 10,
      endedAt,
      winner: null,
      playerCount: seats.length,
      storytellerAccountId: st,
      record: { lobby: { name: 'Hollow Inn' }, seats, result: null },
    });
  }

  it('stats (v2.2): empty account has an empty record', () => {
    const r = repos();
    expect(r.stats.statsFor('nobody')).toMatchObject({
      matchesPlayed: 0,
      gamesAbandoned: 0,
      winRate: null,
      goodGames: 0,
      evilGames: 0,
      topCharacters: [],
      favouriteAvatar: null,
      currentWinStreak: 0,
      bestWinStreak: 0,
      recentGames: [],
    });
  });

  it('stats (v2.2): record, streaks, abandoned games and storytold games', () => {
    const r = repos();
    const at = (m: MatchResult, endedAt: number, avatar: string): MatchResult => {
      r.stats.recordMatchStarted({ ...m, players: m.players.map((p) => ({ accountId: p.accountId, seat: p.seat, avatarId: p.accountId === 'a' ? avatar : 'other' })) });
      return { ...m, endedAt };
    };
    // a: W (good), W (good), L (evil), W (good), W (good) => best 2, current 2.
    r.stats.recordMatchFinished(at(result('m1', [['a', true, 'good'], ['b', false, 'evil']]), 1000, 'frog'));
    r.stats.recordMatchFinished(at(result('m2', [['a', true, 'good']]), 2000, 'frog'));
    r.stats.recordMatchFinished(at({ ...result('m3', [['a', false, 'evil']]), winner: 'good' }, 3000, 'crow'));
    r.stats.recordMatchFinished(at(result('m4', [['a', true, 'good']]), 4000, 'frog'));
    r.stats.recordMatchFinished(at(result('m5', [['a', true, 'good']], 'b'), 5000, 'frog'));
    // An abandoned game a played (no final reveal: a is the Drunk who believes Chef).
    r.stats.recordMatchStarted({ matchId: 'm6', lobbyId: 'l', script: 'tb', startedAt: 5500, storytellerAccountId: 'b', players: [{ accountId: 'a', seat: 0, avatarId: 'frog' }] });
    saveAbandoned(r, 'm6', 6000, [seatJson('a', { avatarId: 'frog' })], 'b');
    // An in-progress game: counted as played, never in recents.
    r.stats.recordMatchStarted({ matchId: 'm7', lobbyId: 'l', script: 'tb', startedAt: 7000, storytellerAccountId: null, players: [{ accountId: 'a', seat: 0, avatarId: 'frog' }] });

    const a = r.stats.statsFor('a');
    expect(a).toMatchObject({
      matchesPlayed: 7,
      matchesCompleted: 5,
      wins: 4,
      losses: 1,
      gamesAbandoned: 1,
      winRate: 0.8,
      goodGames: 4,
      evilGames: 1,
      currentWinStreak: 2,
      bestWinStreak: 2,
      favouriteAvatar: { avatarId: 'frog', games: 6 },
    });
    expect(a.topCharacters).toEqual([
      { character: 'chef', games: 4, wins: 4 },
      { character: 'imp', games: 1, wins: 0 },
    ]);
    expect(a.recentGames.map((g) => [g.matchId, g.result, g.as, g.status])).toEqual([
      ['m6', 'abandoned', 'player', 'abandoned'],
      ['m5', 'won', 'player', 'finished'],
      ['m4', 'won', 'player', 'finished'],
      ['m3', 'lost', 'player', 'finished'],
      ['m2', 'won', 'player', 'finished'],
    ]);
    // Abandoned: only what a was told (Chef), never the Grimoire's Drunk.
    expect(a.recentGames[0]).toEqual({
      matchId: 'm6',
      endedAt: new Date(6000).toISOString(),
      lobbyName: 'Hollow Inn',
      as: 'player',
      status: 'abandoned',
      character: 'chef',
      alignment: 'good',
      avatarId: 'frog',
      winner: null,
      result: 'abandoned',
    });
    expect(a.recentGames[1]).toMatchObject({ character: 'chef', alignment: 'good', winner: 'good', avatarId: 'frog', lobbyName: null });
    expect(JSON.stringify(a)).not.toContain('"b"');
    expect(JSON.stringify(a)).not.toContain('drunk');

    // b told m5 (finished) and m6 (abandoned) and played m1 (lost).
    const b = r.stats.statsFor('b');
    expect(b).toMatchObject({ gamesStorytold: 1, wins: 0, losses: 1, currentWinStreak: 0, bestWinStreak: 0, favouriteAvatar: { avatarId: 'other', games: 1 } });
    expect(b.recentGames.map((g) => [g.matchId, g.result, g.as])).toEqual([
      ['m6', 'abandoned', 'storyteller'],
      ['m5', 'told', 'storyteller'],
      ['m1', 'lost', 'player'],
    ]);
    expect(b.recentGames[1]).toMatchObject({ character: null, alignment: null, avatarId: null, winner: 'good' });
  });

  it('migration 5 backfills avatar ids from the game records', () => {
    const url = tmpDb();
    const old = openDatabase(url, { migrations: MIGRATIONS.filter((m) => m.id < 5) });
    old.sqlite.exec(`INSERT INTO matches (id, lobby_id, script, started_at) VALUES ('mx', 'l', 'tb', 1)`);
    old.sqlite.exec(`INSERT INTO match_players (match_id, account_id, seat) VALUES ('mx', 'a', 0), ('mx', 'b', 1)`);
    old.sqlite
      .prepare(`INSERT INTO match_records (match_id, lobby_id, version, status, started_at, ended_at, player_count, record_json) VALUES ('mx', 'l', 1, 'abandoned', 1, 2, 2, ?)`)
      .run(JSON.stringify({ seats: [seatJson('a', { avatarId: 'frog' }), seatJson('b', { avatarId: 'crow' })] }));
    expect(runMigrations(old.sqlite)).toEqual([5, 6]); // 6 = v2.3 OPS moderation (additive)
    expect(old.sqlite.prepare('SELECT account_id AS a, avatar_id AS v FROM match_players ORDER BY account_id').all()).toEqual([
      { a: 'a', v: 'frog' },
      { a: 'b', v: 'crow' },
    ]);
    old.close();
  });

  it('stats: a failing insert rolls back the whole match (transaction)', () => {
    const r = repos();
    const m = result('m1', [['a', true, 'good']]);
    // Break the second player insert: duplicate account in one result => PK upsert is fine, so
    // instead force a constraint error via a NOT NULL violation.
    const bad = { ...m, players: [...m.players, { ...m.players[0]!, accountId: 'b', seat: null as unknown as number }] };
    expect(() => r.stats.recordMatchFinished(bad)).toThrow();
    expect(r.stats.matchCount()).toBe(0);
    expect(r.stats.recordMatchFinished(m)).toBe(true);
  });

  it('voice usage accumulates per env and month', () => {
    const r = repos();
    r.voiceUsage.add('development', '2026-10', 1000);
    r.voiceUsage.add('development', '2026-10', 500.4);
    r.voiceUsage.add('production', '2026-10', 2000);
    r.voiceUsage.add('production', '2026-09', 7);
    r.voiceUsage.add('production', '2026-10', -5);
    expect(r.voiceUsage.get('2026-10')).toEqual({ byEnv: { development: 1500, production: 2000 }, totalMs: 3500 });
    expect(r.voiceUsage.get('2026-11')).toEqual({ byEnv: {}, totalMs: 0 });
    expect(usageMonth(Date.UTC(2026, 0, 31, 23, 59))).toBe('2026-01');
  });

  it('online backup produces a consistent copy', () => {
    const url = tmpDb();
    const r = repos(url);
    account(r, 'a1');
    const dest = path.join(path.dirname(url), 'backup', 'copy.db');
    r.database.backupTo(dest);
    const copy = new BetterSqlite3(dest, { readonly: true });
    expect(copy.prepare('SELECT id FROM accounts').all()).toEqual([{ id: 'a1' }]);
    copy.close();
  });

  it('supports :memory: databases', () => {
    const d = openDatabase(':memory:');
    expect(d.sqlite.prepare('SELECT COUNT(*) AS n FROM accounts').get()).toEqual({ n: 0 });
    d.close();
  });
});
