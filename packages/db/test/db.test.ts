import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { DEFAULT_COSMETICS } from '@ct/protocol';
import { DuplicateLookupError, openDatabase, openRepositories, usageMonth, type MatchResult, type Repositories } from '../src/index.js';

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
    expect(applied).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    r.database.close();
    // Re-opening does not re-apply migrations.
    const again = repos(url);
    expect(again.database.sqlite.prepare('SELECT COUNT(*) AS n FROM _migrations').get()).toEqual({ n: 4 });
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
