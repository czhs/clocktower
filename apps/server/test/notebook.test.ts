// OWNED BY notebook. Unit tests: the notebooks repository (real SQLite, migration 4) and the
// notebook service (fake store / clock): owner-only delivery, rev rules, match scoping, limits,
// storage failures, and that nothing written leaks into log lines.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNotebooksRepo, openDatabase, type Database, type NotebookRow } from '@ct/db';
import type { NotebookData } from '@ct/protocol';
import { createNotebookService, notebookStoreFor, type NotebookStore } from '../src/notebook/index.js';
import { captureLogger } from '../src/rooms/testkit.js';

const dirs: string[] = [];
const dbs: Database[] = [];
function tmpDb(): Database {
  const d = mkdtempSync(path.join(tmpdir(), 'ct-nb-'));
  dirs.push(d);
  const db = openDatabase(`file:${path.join(d, 'nb.db')}`);
  dbs.push(db);
  return db;
}
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const data = (text: string): NotebookData => ({ text, seats: [{ seat: 3, note: `${text} note`, guess: 'chef', mark: 'trust' }] });

describe('notebooks repository', () => {
  it('stores per (match, account), newer rev only, lists by owner, deletes by owner', () => {
    const repo = createNotebooksRepo(tmpDb());
    expect(repo.get('m1', 'a1')).toBeNull();
    expect(repo.putIfNewer('m1', 'a1', 1, data('one'), 100)).toEqual({ ok: true });
    expect(repo.putIfNewer('m1', 'a2', 1, data('other person'), 101)).toEqual({ ok: true });
    expect(repo.putIfNewer('m2', 'a1', 1, data('next game'), 200)).toEqual({ ok: true });
    expect(repo.get('m1', 'a1')).toEqual({ matchId: 'm1', rev: 1, data: data('one'), updatedAt: 100 } satisfies NotebookRow);

    const stale = repo.putIfNewer('m1', 'a1', 1, data('stale'), 150);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.current.data).toEqual(data('one'));
    expect(repo.putIfNewer('m1', 'a1', 5, data('five'), 160)).toEqual({ ok: true });
    expect(repo.get('m1', 'a1')).toMatchObject({ rev: 5, data: data('five'), updatedAt: 160 });

    expect(repo.listForAccount('a1').map((r) => r.matchId)).toEqual(['m2', 'm1']); // newest first
    expect(repo.listForAccount('a2').map((r) => r.matchId)).toEqual(['m1']);
    expect(repo.deleteForAccount('a1')).toBe(2);
    expect(repo.get('m1', 'a1')).toBeNull();
    expect(repo.get('m1', 'a2')).not.toBeNull();
  });

  it('tolerates a corrupt row (rev 0, no data) so the next save replaces it', () => {
    const db = tmpDb();
    db.sqlite.prepare('INSERT INTO notebooks (match_id, account_id, updated_at, data_json) VALUES (?, ?, ?, ?)').run('m', 'a', 1, '{nope');
    const repo = notebookStoreFor(db);
    expect(repo.get('m', 'a')).toEqual({ matchId: 'm', rev: 0, data: null, updatedAt: 1 });
    expect(repo.putIfNewer('m', 'a', 1, data('fixed'), 2)).toEqual({ ok: true });
    expect(notebookStoreFor(db)).toBe(repo); // one repo per database
  });
});

function harness(store: NotebookStore = memoryStore()) {
  const sent: { pid: string; type: string; payload: any }[] = [];
  const log = captureLogger();
  let t = 1_000_000;
  const svc = createNotebookService({ store, log, send: (pid, type, payload) => sent.push({ pid, type, payload }), now: () => t });
  return { svc, sent, log, store, tick: (ms: number) => (t += ms) };
}

function memoryStore(): NotebookStore {
  const rows = new Map<string, NotebookRow>();
  return {
    get: (m, a) => rows.get(`${m}|${a}`) ?? null,
    putIfNewer(m, a, rev, d, at) {
      const cur = rows.get(`${m}|${a}`);
      if (cur && cur.rev >= rev) return { ok: false, current: cur };
      rows.set(`${m}|${a}`, { matchId: m, rev, data: d, updatedAt: at });
      return { ok: true };
    },
  };
}

const ann = { pid: 'p_ann', accountId: 'acc_ann' };
const bo = { pid: 'p_bo', accountId: 'acc_bo' };

describe('notebook service', () => {
  it('sends only to the owner and keys by account (a new pid for the same account sees the same notebook)', () => {
    const h = harness();
    h.svc.handle(ann, 'm1', 'notebook:save', { matchId: 'm1', rev: 1, data: data('SECRET-ann') });
    h.svc.handle(bo, 'm1', 'notebook:load', {});
    h.svc.deliver({ pid: 'p_ann_newtab', accountId: 'acc_ann' }, 'm1');
    expect(h.sent.map((s) => [s.pid, s.type, s.payload.cause, s.payload.data?.text])).toEqual([
      ['p_ann', 'notebook:data', 'saved', 'SECRET-ann'],
      ['p_bo', 'notebook:data', 'load', ''],
      ['p_ann_newtab', 'notebook:data', 'load', 'SECRET-ann'],
    ]);
    expect(h.log.lines.join('\n')).not.toContain('SECRET');
    expect(h.log.lines.join('\n')).not.toContain('acc_');
  });

  it('game start delivers an empty notebook without touching storage; nothing without a game', () => {
    const store = memoryStore();
    let reads = 0;
    const h = harness({ ...store, get: (m, a) => (reads++, store.get(m, a)) });
    h.svc.deliver(ann, 'm9', true);
    h.svc.deliver(ann, null);
    expect(reads).toBe(0);
    expect(h.sent).toEqual([{ pid: 'p_ann', type: 'notebook:data', payload: { matchId: 'm9', rev: 0, data: { text: '', seats: [] }, savedAt: null, cause: 'load' } }]);
    h.svc.handle(ann, null, 'notebook:load', {});
    h.svc.handle(ann, 'm9', 'notebook:save', { matchId: 'm8', rev: 1, data: data('wrong game') });
    expect(h.sent.slice(1).map((s) => [s.type, s.payload.reason])).toEqual([
      ['notebook:unavailable', 'no_game'],
      ['notebook:unavailable', 'no_game'],
    ]);
  });

  it('newer rev wins: a stale save gets cause newer + the stored copy', () => {
    const h = harness();
    h.svc.handle(ann, 'm1', 'notebook:save', { matchId: 'm1', rev: 4, data: data('rev four') });
    h.svc.handle(ann, 'm1', 'notebook:save', { matchId: 'm1', rev: 4, data: data('also four') });
    h.svc.handle(ann, 'm1', 'notebook:save', { matchId: 'm1', rev: 2, data: data('older') });
    expect(h.sent.map((s) => [s.payload.cause, s.payload.rev, s.payload.data.text])).toEqual([
      ['saved', 4, 'rev four'],
      ['newer', 4, 'rev four'],
      ['newer', 4, 'rev four'],
    ]);
  });

  it('rate-limits saves and loads per account, then recovers', () => {
    const h = harness();
    for (let rev = 1; rev <= 12; rev++) h.svc.handle(ann, 'm1', 'notebook:save', { matchId: 'm1', rev, data: data(`r${rev}`) });
    const limited = h.sent.filter((s) => s.type === 'notebook:unavailable');
    expect(limited).toHaveLength(2);
    expect(limited[0]!.payload).toEqual({ reason: 'rate_limited', retryInMs: 2000 });
    // Bo has his own bucket.
    h.svc.handle(bo, 'm1', 'notebook:save', { matchId: 'm1', rev: 1, data: data('bo') });
    expect(h.sent.at(-1)!.payload.cause).toBe('saved');
    h.tick(2000);
    h.svc.handle(ann, 'm1', 'notebook:save', { matchId: 'm1', rev: 13, data: data('r13') });
    expect(h.sent.at(-1)!.payload).toMatchObject({ cause: 'saved', rev: 13 });

    const h2 = harness();
    for (let i = 0; i < 8; i++) h2.svc.handle(bo, 'm1', 'notebook:load', {});
    expect(h2.sent.filter((s) => s.type === 'notebook:unavailable').map((s) => s.payload.reason)).toEqual(['rate_limited', 'rate_limited']);
  });

  it('storage failures answer busy (retry) and log no content', () => {
    const h = harness({
      get: () => {
        throw new Error('disk on fire');
      },
      putIfNewer: () => {
        throw new Error('disk on fire');
      },
    });
    h.svc.handle(ann, 'm1', 'notebook:save', { matchId: 'm1', rev: 1, data: data('SECRET-text') });
    h.svc.handle(ann, 'm1', 'notebook:load', {});
    expect(h.sent.map((s) => s.payload)).toEqual([
      { reason: 'busy', retryInMs: 5000 },
      { reason: 'busy', retryInMs: 5000 },
    ]);
    expect(h.log.lines.join('\n')).not.toContain('SECRET');
    expect(h.log.lines.some((l) => l.includes('notebook: save failed'))).toBe(true);
  });

  it('an invalid stored copy is served as an empty notebook (keeping its rev)', () => {
    const store = memoryStore();
    store.putIfNewer('m1', 'acc_ann', 3, { text: 42 }, 5);
    const h = harness(store);
    h.svc.deliver(ann, 'm1');
    expect(h.sent[0]!.payload).toMatchObject({ rev: 3, data: { text: '', seats: [] }, cause: 'load' });
  });
});
