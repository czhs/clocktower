// OPS restore drill (security v2.3, area 7 — findings in docs/security-v2.3/07-ops-incident.md).
//
// End-to-end backup -> restore rehearsal that never touches prod/dev data:
//   1. "live" server on a throwaway DB laid out like /srv/clocktower (CT_ROOT/data/prod/clocktower.db),
//      with real accounts (API sign-up, so real scrypt verifiers + peppered lookups + sessions),
//      an admin action (append-only audit row), a game record, a stats row and a private notebook.
//   2. Online backup WHILE that server runs, with the real scripts/backup-db.sh (python sqlite3
//      backup API + integrity_check + gzip + retention), exactly as clocktower-backup-prod.service.
//   3. Restore: gunzip into a scratch path, integrity_check, start a fresh server on it with the
//      SAME env (PASSPHRASE_PEPPER), verify sessions / sign-in / records / audit / notebook / stats.
//   4. Restore of an OLDER-schema backup: the server applies the missing migrations on start.
//   5. OPS-2 evidence: the same backup with a DIFFERENT PASSPHRASE_PEPPER — existing sessions still
//      work but nobody can sign in with their passphrase any more (the env file is not backed up).
//
// Port: 3397 only (sec-ops range 3396-3397). Timings are printed with the prefix [OPS-DRILL].
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../packages/db/src/migrations.js';
import { createNotebooksRepo, createRecordsRepo, openDatabase } from '../../packages/db/src/index.js';
import { ApiClient } from '../support/http.js';
import { pickPort, REPO_ROOT, startServer, type TestServer } from '../support/server.js';

// One server at a time; 3396 is used by apps/server/test/ops.moderation.test.ts (both may run in one pnpm test).
const PORTS: [number, number] = [3397, 3397];
const root = mkdtempSync(path.join(os.tmpdir(), 'ct-ops-drill-'));
const liveDb = path.join(root, 'data', 'prod', 'clocktower.db');
const pepper = randomBytes(32).toString('hex');
const sessionSecret = randomBytes(32).toString('hex');
const servers: TestServer[] = [];

afterAll(async () => {
  for (const s of servers) await s.stop().catch(() => undefined);
  rmSync(root, { recursive: true, force: true });
});

async function boot(dbFile: string, extra: Record<string, string> = {}): Promise<TestServer> {
  const s = await startServer({
    port: await pickPort(...PORTS),
    dataDir: path.dirname(dbFile), // not deleted on stop (we own `root`)
    env: { DATABASE_URL: `file:${dbFile}`, PASSPHRASE_PEPPER: pepper, SESSION_SECRET: sessionSecret, ...extra },
  });
  servers.push(s);
  return s;
}
async function halt(s: TestServer) {
  await s.stop();
  servers.splice(servers.indexOf(s), 1);
}
const origin = (s: TestServer) => ({ Origin: s.url });
const ms = (t0: number) => Math.round(performance.now() - t0);

describe('OPS restore drill (throwaway DB, real backup script)', () => {
  it('backup while serving -> restore -> accounts, sessions, records, audit, notebook survive', { timeout: 240_000 }, async () => {
    mkdirSync(path.dirname(liveDb), { recursive: true });
    // ---- 1. live server + data -------------------------------------------------------------
    let live = await boot(liveDb);
    const admin = new ApiClient(live.url, origin(live));
    const alice = new ApiClient(live.url, origin(live));
    const ra = await admin.req('POST', '/api/auth/create', { displayName: 'Drill Admin' });
    const rb = await alice.req('POST', '/api/auth/create', { displayName: 'Drill Alice' });
    expect([ra.status, rb.status]).toEqual([201, 201]);
    const adminId = ra.body.account.id as string;
    const aliceId = rb.body.account.id as string;
    const alicePass = rb.body.passphrase as string;
    // Make the first account an admin (restart = sessions must also survive a plain restart).
    await halt(live);
    live = await boot(liveDb, { ADMIN_ACCOUNT_IDS: adminId });
    const admin2 = new ApiClient(live.url, origin(live));
    for (const [k, v] of admin.cookies) admin2.cookies.set(k, v);
    // The restarted server may be on the other port of the range: rebind clients to it.
    const aliceLive = new ApiClient(live.url, origin(live));
    for (const [k, v] of alice.cookies) aliceLive.cookies.set(k, v);
    const ren = await admin2.req('POST', `/api/admin/accounts/${aliceId}/rename`, { displayName: 'Drill Alice R' });
    expect(ren.status).toBe(200);
    // Game record + stats + notebook, written through the real repos (the server's own code paths
    // for these need a full game; the storage is what the drill is about).
    {
      const db = openDatabase(`file:${liveDb}`);
      const t = Date.now() - 3_600_000;
      db.sqlite
        .prepare('INSERT INTO matches (id, lobby_id, script, started_at, ended_at, winner, reason, storyteller_account_id) VALUES (?,?,?,?,?,?,?,?)')
        .run('m_drill', 'drill-lobby', 'trouble-brewing', t, t + 1000, 'good', 'demon_executed', adminId);
      db.sqlite
        .prepare('INSERT INTO match_players (match_id, account_id, seat, starting_character, final_character, alignment, won, alive) VALUES (?,?,?,?,?,?,?,?)')
        .run('m_drill', aliceId, 0, 'washerwoman', 'washerwoman', 'good', 1, 1);
      createRecordsRepo(db).saveRecord({
        matchId: 'm_drill', lobbyId: 'drill-lobby', version: 1, status: 'finished', startedAt: t, endedAt: t + 1000,
        winner: 'good', playerCount: 5, storytellerAccountId: adminId,
        record: { script: 'trouble-brewing', lobby: { name: 'Drill lobby' }, storyteller: { displayName: 'Drill Admin' }, result: { reason: 'demon_executed' }, seats: [{ accountId: aliceId }] },
      });
      createNotebooksRepo(db).putIfNewer('m_drill', aliceId, 1, { text: 'drill-notebook-marker' }, t + 500);
      db.close();
    }
    const before = {
      me: (await aliceLive.req('GET', '/api/me')).body,
      stats: (await aliceLive.req('GET', '/api/me/stats')).body,
      games: (await admin2.req('GET', '/api/admin/games')).body,
      audit: (await admin2.req('GET', '/api/admin/audit')).body,
    };
    expect(before.me.displayName).toBe('Drill Alice R');
    expect(before.games.total).toBe(1);

    // ---- 2. online backup with the real script while the server is serving ------------------
    let t0 = performance.now();
    const out = execFileSync('bash', [path.join(REPO_ROOT, 'scripts/backup-db.sh'), 'prod', 'drill'], {
      env: { ...process.env, CT_ROOT: root },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const backupMs = ms(t0);
    const dir = path.join(root, 'backups', 'prod');
    const files = readdirSync(dir).filter((f) => f.endsWith('-drill.db.gz'));
    expect(files).toHaveLength(1);
    const gz = path.join(dir, files[0]!);
    expect(statSync(gz).mode & 0o077).toBe(0); // 0600 (umask 077)
    await halt(live);

    // ---- 3. restore into a scratch path and boot on it ---------------------------------------
    t0 = performance.now();
    const restored = path.join(root, 'restore', 'clocktower.db');
    mkdirSync(path.dirname(restored), { recursive: true });
    writeFileSync(restored, gunzipSync(readFileSync(gz)), { mode: 0o600 });
    {
      // (openDatabase is a no-op migration-wise here: the backup is already at the latest schema)
      const chk = openDatabase(`file:${restored}`);
      expect(chk.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
      chk.close();
    }
    const back = await boot(restored, { ADMIN_ACCOUNT_IDS: adminId });
    const restoreMs = ms(t0);
    const alice2 = new ApiClient(back.url, origin(back));
    for (const [k, v] of alice.cookies) alice2.cookies.set(k, v);
    const admin3 = new ApiClient(back.url, origin(back));
    for (const [k, v] of admin.cookies) admin3.cookies.set(k, v);
    expect((await alice2.req('GET', '/api/me')).body).toEqual(before.me); // session survived
    expect((await alice2.req('GET', '/api/me/stats')).body).toEqual(before.stats);
    expect((await admin3.req('GET', '/api/admin/games')).body).toEqual(before.games);
    expect((await admin3.req('GET', '/api/admin/audit')).body).toEqual(before.audit);
    const fresh = new ApiClient(back.url, origin(back));
    const si = await fresh.req('POST', '/api/auth/signin', { passphrase: alicePass });
    expect(si.status).toBe(200); // same pepper -> passphrase sign-in works
    {
      const db = openDatabase(`file:${restored}`);
      expect(JSON.stringify(createNotebooksRepo(db).listForAccount(aliceId))).toContain('drill-notebook-marker');
      db.close();
    }
    await halt(back);

    // ---- 5. same backup, different pepper (env file lost / regenerated) ----------------------
    const restored2 = path.join(root, 'restore2', 'clocktower.db');
    mkdirSync(path.dirname(restored2), { recursive: true });
    writeFileSync(restored2, gunzipSync(readFileSync(gz)), { mode: 0o600 });
    const wrong = await startServer({
      port: await pickPort(...PORTS),
      dataDir: path.dirname(restored2),
      env: { DATABASE_URL: `file:${restored2}`, PASSPHRASE_PEPPER: randomBytes(32).toString('hex'), SESSION_SECRET: randomBytes(32).toString('hex') },
    });
    servers.push(wrong);
    const alice3 = new ApiClient(wrong.url, origin(wrong));
    for (const [k, v] of alice.cookies) alice3.cookies.set(k, v);
    const wrongSession = (await alice3.req('GET', '/api/me')).status;
    const wrongSignin = (await new ApiClient(wrong.url, origin(wrong)).req('POST', '/api/auth/signin', { passphrase: alicePass })).status;
    await halt(wrong);
    expect(wrongSession).toBe(200); // sessions do not depend on any secret
    expect(wrongSignin).toBe(401); // OPS-2: passphrases are unusable without the original pepper

    console.info(`[OPS-DRILL] ${out.trim()} | backup ${backupMs} ms (online, server serving) | restore (gunzip + integrity_check + boot to healthy) ${restoreMs} ms | wrong pepper: session ${wrongSession}, sign-in ${wrongSignin}`);
  });

  it('backup-db.sh: 30-day retention, separate pre-deploy bucket, status marker (ok / failed)', { timeout: 60_000 }, () => {
    const r = path.join(root, 'retention');
    const data = path.join(r, 'data', 'prod');
    const dir = path.join(r, 'backups', 'prod');
    mkdirSync(data, { recursive: true });
    mkdirSync(dir, { recursive: true });
    const db = openDatabase(`file:${path.join(data, 'clocktower.db')}`);
    db.close();
    const day = 86_400;
    const old = (name: string, ageDays: number) => {
      const f = path.join(dir, name);
      writeFileSync(f, 'x');
      execFileSync('touch', ['-d', `@${Math.floor(Date.now() / 1000) - ageDays * day}`, f]);
    };
    for (let i = 1; i <= 40; i++) old(`clocktower-prod-2026${String(i).padStart(4, '0')}T000000Z.db.gz`, i);
    for (let i = 1; i <= 12; i++) old(`clocktower-prod-2026${String(i).padStart(4, '0')}T000000Z-predeploy.db.gz`, i * 3);
    const backup = (tag?: string) =>
      execFileSync('bash', [path.join(REPO_ROOT, 'scripts/backup-db.sh'), 'prod', ...(tag ? [tag] : [])], { env: { ...process.env, CT_ROOT: r }, stdio: 'pipe' });
    backup();
    const files = readdirSync(dir);
    const ageOf = (f: string) => (Date.now() - statSync(path.join(dir, f)).mtimeMs) / 86_400_000;
    const sched = files.filter((f) => /Z\.db\.gz$/.test(f));
    const pre = files.filter((f) => /Z-predeploy\.db\.gz$/.test(f));
    expect(sched.every((f) => ageOf(f) <= 30.01)).toBe(true);
    expect(sched.length).toBe(30 + 1); // days 1..30 + today's
    expect(pre.length).toBeLessThanOrEqual(10);
    expect(pre.every((f) => ageOf(f) <= 30.01)).toBe(true);
    backup('predeploy');
    expect(readdirSync(dir).filter((f) => /Z\.db\.gz$/.test(f)).length).toBe(31); // a pre-deploy run never prunes daily backups
    const marker = readFileSync(path.join(data, '.last-backup'), 'utf8');
    expect(marker).toMatch(/^ok clocktower-prod-\S+-predeploy\.db\.gz \d+ tag=predeploy /);
    // failure: an unreadable database -> non-zero exit and a 'failed' marker
    writeFileSync(path.join(data, 'clocktower.db'), 'not a database at all, definitely not sqlite');
    for (const f of ['clocktower.db-wal', 'clocktower.db-shm']) rmSync(path.join(data, f), { force: true });
    expect(() => backup()).toThrow();
    expect(readFileSync(path.join(data, '.last-backup'), 'utf8')).toMatch(/^failed /);
  });

  it('restore-db.sh moves the live db AND its -wal/-shm aside, installs the backup, refuses a corrupt one', { timeout: 60_000 }, () => {
    const r = path.join(root, 'restore-script');
    const data = path.join(r, 'data', 'dev');
    mkdirSync(data, { recursive: true });
    const good = path.join(r, 'good.db');
    const g = openDatabase(`file:${good}`);
    g.sqlite.prepare("INSERT INTO accounts (id, display_name, cosmetics_json, passphrase_lookup, passphrase_verifier, salt, created_at, last_seen_at) VALUES ('acc_restore_1','Restored','{}','l','v','s',1,1)").run();
    g.close();
    execFileSync('gzip', ['-k', good]);
    for (const f of ['clocktower.db', 'clocktower.db-wal', 'clocktower.db-shm']) writeFileSync(path.join(data, f), `stale ${f}`);
    const run = (src: string, apply: boolean) =>
      execFileSync('bash', [path.join(REPO_ROOT, 'deploy/bin/restore-db.sh'), 'dev', src, ...(apply ? ['--apply'] : [])], {
        env: { ...process.env, CT_ROOT: r, CT_NO_SYSTEMCTL: '1', CT_PORT: '3397' },
        stdio: 'pipe',
      });
    run(`${good}.gz`, false); // dry run: nothing changes
    expect(readFileSync(path.join(data, 'clocktower.db'), 'utf8')).toBe('stale clocktower.db');
    run(`${good}.gz`, true);
    const aside = readdirSync(data).filter((f) => f.startsWith('pre-restore-'));
    expect(aside).toHaveLength(1);
    expect(readdirSync(path.join(data, aside[0]!)).sort()).toEqual(['clocktower.db', 'clocktower.db-shm', 'clocktower.db-wal']);
    expect(readdirSync(data).filter((f) => /^clocktower\.db-(wal|shm)$/.test(f))).toEqual([]);
    expect(statSync(path.join(data, 'clocktower.db')).mode & 0o077).toBe(0);
    const chk = openDatabase(`file:${path.join(data, 'clocktower.db')}`);
    expect((chk.sqlite.prepare("SELECT display_name AS n FROM accounts WHERE id='acc_restore_1'").get() as { n: string }).n).toBe('Restored');
    chk.close();
    const bad = path.join(r, 'bad.db');
    writeFileSync(bad, 'garbage');
    expect(() => run(bad, true)).toThrow();
  });

  it('restoring an older-schema backup applies the missing migrations on start', { timeout: 120_000 }, async () => {
    const oldDb = path.join(root, 'old', 'clocktower.db');
    mkdirSync(path.dirname(oldDb), { recursive: true });
    const old = openDatabase(`file:${oldDb}`, { migrations: MIGRATIONS.filter((m) => m.id <= 2) });
    const sq = old.sqlite;
    sq.prepare(
      'INSERT INTO accounts (id, display_name, cosmetics_json, passphrase_lookup, passphrase_verifier, salt, created_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?)',
    ).run('acc_old_schema_1', 'Old Timer', '{}', 'lookup-x', 'scrypt$1$1$1$00', '00', 1, 1);
    old.close();
    const copy = path.join(root, 'old-restore', 'clocktower.db');
    mkdirSync(path.dirname(copy), { recursive: true });
    copyFileSync(oldDb, copy);
    const t0 = performance.now();
    const s = await boot(copy);
    const bootMs = ms(t0);
    await halt(s);
    const chkDb = openDatabase(`file:${copy}`); // already fully migrated by the server: no-op
    const chk = chkDb.sqlite;
    const ids = (chk.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: number }[]).map((r) => r.id);
    const acc = chk.prepare('SELECT display_name AS n FROM accounts WHERE id = ?').get('acc_old_schema_1') as { n: string } | undefined;
    const cols = (chk.prepare('PRAGMA table_info(match_players)').all() as { name: string }[]).map((c) => c.name);
    chkDb.close();
    expect(ids).toEqual(MIGRATIONS.map((m) => m.id).sort((a, b) => a - b));
    expect(acc?.n).toBe('Old Timer');
    expect(cols).toContain('avatar_id');
    console.info(`[OPS-DRILL] old-schema restore: migrations now ${JSON.stringify(ids)}; boot ${bootMs} ms`);
  });
});
