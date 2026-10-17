// v2.3 security audit, area 3 (auth, accounts, admin) — sec-auth. Findings: docs/security-v2.3/03-auth-accounts-admin.md.
// In-process test server on 127.0.0.1:3382 (sec-auth range 3382-3383), fake gameplay modules,
// production scrypt cost. Phase A wrote the AUTH-n tests as `it.fails`; phase B fixed them (now `it`)
// and added regression tests for each fix.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccountsRepo, createAdminRepo, createSessionsRepo, openDatabase } from '../../packages/db/src/index.js';
import {
  api,
  createLobby,
  fakeModules,
  makeAccount,
  sleep,
  startTestServer,
  TestClient,
  waitFor,
  type TestServer,
} from '../../apps/server/src/rooms/testkit.js';
import { createAuthService } from '../../apps/server/src/auth/service.js';
import { DEFAULT_SCRYPT_N, makeVerifier, passphraseLookup } from '../../apps/server/src/auth/crypto.js';
import { normalizePassphrase } from '../../apps/server/src/auth/passphrase.js';
import { ipRangeKeys } from '../../apps/server/src/auth/limits.js';
import { scrubAccountFromRecord } from '../../packages/db/src/repos/scrub.js';
import { CLOSE_CODES } from '../../packages/protocol/src/index.js';

const PORT = 3382;
let srv: TestServer;
const fakes = fakeModules();
const clients: TestClient[] = [];
let ipSeq = 1;
const freshIp = () => `10.82.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    moduleFactories: fakes.factories,
    scryptN: DEFAULT_SCRYPT_N, // production cost (v2.3 AUTH-2: 2^12 for new verifiers)
    rateLimits: { createLobby: { capacity: 100, refillPerSec: 100 } },
    env: { LOBBY_MAX_COUNT: '32' },
  });
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.leave(false).catch(() => undefined)));
  await srv?.close();
});

const post = (url: string, cookie: string | undefined, body: unknown = {}, headers: Record<string, string> = {}) =>
  api(srv, 'POST', url, { cookie, body, headers });
const makeAdmin = async (name: string) => {
  const a = await makeAccount(srv, name);
  (srv.services.config.adminAccountIds as Set<string>).add(a.account.id);
  return a;
};
async function seated(cookie: string, name: string) {
  const lobby = await createLobby(srv, cookie, { name: `L ${name}`, maxPlayers: 5 });
  const c = await TestClient.join(srv, cookie, lobby.id, 'player', name);
  clients.push(c);
  await c.view();
  return { lobby, c };
}

describe('verified OK (regression guards)', () => {
  it('CSRF guard: non-JSON bodies and foreign / null Origins are refused on state-changing routes', async () => {
    const u = await makeAccount(srv, 'Csrf');
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const r = await api(srv, 'POST', '/api/auth/signout-all', { cookie: u.cookie, raw: '{}', headers: { 'content-type': ct } });
      expect(r.status, ct).toBe(415);
    }
    for (const origin of ['https://evil.example', 'null', 'https://clocktower.example.test.evil.example']) {
      const r = await post('/api/auth/signout-all', u.cookie, {}, { origin });
      expect(r.status, origin).toBe(403);
    }
    expect((await api(srv, 'GET', '/api/me', { cookie: u.cookie })).status).toBe(200); // still signed in
  });

  it('admin gate cannot be sidestepped with path variants', async () => {
    const u = await makeAccount(srv, 'Prober');
    const paths = ['/api/ADMIN/status', '/api/Admin/overview', '/api/admin/status/', '/api//admin/status', '/api/admin//status', '/api/%61dmin/status', '/api/admin%2fstatus', '/api/admin/status;x', '/api/admin/status%00'];
    for (const p of paths) {
      const r = await api(srv, 'GET', p, { cookie: u.cookie });
      expect(r.status, p).not.toBe(200);
      expect(JSON.stringify(r.body ?? '')).not.toContain('recentErrors');
    }
  });

  it('sign-in: one generic error for every failure; no identifier other than the passphrase is accepted', async () => {
    const a = await makeAccount(srv, 'Enum Target');
    const ip = freshIp();
    const wrong = await post('/api/auth/signin', undefined, { passphrase: 'abacus abacus abacus abacus abacus abacus' }, { 'x-forwarded-for': ip });
    const byName = await post('/api/auth/signin', undefined, { passphrase: 'Enum Target', displayName: 'Enum Target' }, { 'x-forwarded-for': ip });
    const byId = await post('/api/auth/signin', undefined, { passphrase: a.account.id }, { 'x-forwarded-for': ip });
    expect(wrong.status).toBe(401);
    expect(byName.status).toBe(401);
    expect(byId.status).toBe(401);
    expect(byName.body).toEqual(wrong.body);
    expect(byId.body).toEqual(wrong.body);
  });

  it('admin rotate-passphrase: old passphrase dead, sessions revoked, new passphrase never in logs or audit', async () => {
    const admin = await makeAdmin('Rotator');
    const v = await makeAccount(srv, 'Rotated');
    const r = await post(`/api/admin/accounts/${v.account.id}/rotate-passphrase`, admin.cookie, {});
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const fresh = r.body.passphrase as string;
    expect((await api(srv, 'GET', '/api/me', { cookie: v.cookie })).status).toBe(401);
    expect((await post('/api/auth/signin', undefined, { passphrase: v.passphrase }, { 'x-forwarded-for': freshIp() })).status).toBe(401);
    expect((await post('/api/auth/signin', undefined, { passphrase: fresh }, { 'x-forwarded-for': freshIp() })).status).toBe(200);
    const audit = JSON.stringify(createAdminRepo(srv.services.database).listAudit({ limit: 200 }));
    expect(audit).not.toContain(fresh);
    expect(srv.log.lines.join('\n')).not.toContain(fresh);
    expect(srv.log.lines.join('\n')).not.toContain(v.passphrase);
  });
});

describe('fixed findings (were it.fails in phase A)', () => {
  it('AUTH-1: "sign out everywhere" closes the account\'s live room connections', async () => {
    const v = await makeAccount(srv, 'Revoked One');
    const { c } = await seated(v.cookie, 'revoked');
    expect((await post('/api/auth/signout-all', v.cookie, {})).status).toBe(200);
    expect((await api(srv, 'GET', '/api/me', { cookie: v.cookie })).status).toBe(401); // HTTP side is revoked…
    await waitFor(() => c.closeCode !== null, 2000, 'room closed after signout-all'); // …the WebSocket is not
  });

  it('AUTH-1: admin rotate-passphrase closes the target\'s live room connections', async () => {
    const admin = await makeAdmin('Rotator2');
    const v = await makeAccount(srv, 'Stolen Seat');
    const { c } = await seated(v.cookie, 'stolen');
    expect((await post(`/api/admin/accounts/${v.account.id}/rotate-passphrase`, admin.cookie, {})).status).toBe(200);
    await waitFor(() => c.closeCode !== null, 2000, 'room closed after rotate');
  });

  it('AUTH-1: a Colyseus reconnection token does not outlive "sign out everywhere"', async () => {
    const v = await makeAccount(srv, 'Token Holder');
    const { c } = await seated(v.cookie, 'token');
    const token = c.room.reconnectionToken;
    c.drop();
    await sleep(300);
    expect((await post('/api/auth/signout-all', v.cookie, {})).status).toBe(200);
    // Attacker who captured the token (or the stolen device) re-attaches to the seat without any session.
    await expect(c.reconnectWithToken(srv, token)).rejects.toThrow();
  });

  it('AUTH-2: a sign-in flood from many addresses does not lock legitimate users out (scrypt gate queue)', async () => {
    const v = await makeAccount(srv, 'Legit User');
    const flood = Array.from({ length: 60 }, (_, i) =>
      post('/api/auth/signin', undefined, { passphrase: `wrong passphrase number ${i} here` }, { 'x-forwarded-for': freshIp() }),
    );
    await sleep(30);
    const legit = await post('/api/auth/signin', undefined, { passphrase: v.passphrase }, { 'x-forwarded-for': freshIp() });
    const statuses = (await Promise.all(flood)).map((r) => r.status);
    console.log(`[AUTH-2] flood statuses: 401=${statuses.filter((s) => s === 401).length} 503=${statuses.filter((s) => s === 503).length}; legit=${legit.status}`);
    expect(legit.status).toBe(200);
  });

  it('AUTH-3: per-IP sign-in limit also bounds an IPv6 /48 (65 536 /64 buckets)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const ip = `2001:db8:4242:${i.toString(16)}::1`; // 40 different /64s inside one /48
      statuses.push((await post('/api/auth/signin', undefined, { passphrase: `not a real passphrase ${i}` }, { 'x-forwarded-for': ip })).status);
    }
    expect(statuses).toContain(429);
  });

  it('AUTH-4: sessions have an absolute lifetime (sliding refresh cannot keep one alive forever)', async () => {
    const database = openDatabase(':memory:');
    let t = Date.UTC(2026, 0, 1);
    const auth = createAuthService({
      accounts: createAccountsRepo(database),
      sessions: createSessionsRepo(database),
      pepper: 'p'.repeat(64),
      sessionTtlMs: 30 * 86_400_000,
      adminAccountIds: new Set(),
      log: { debug() {}, info() {}, warn() {}, error() {} },
      scryptN: 1 << 10,
      now: () => t,
    });
    const { token } = await auth.createAccount('Forever');
    for (let day = 0; day < 400; day += 20) {
      t += 20 * 86_400_000;
      auth.authenticate(token);
    }
    const after400Days = auth.authenticate(token);
    database.close();
    expect(after400Days).toBeNull(); // today: still valid 400 days after the only sign-in
  });

  it('AUTH-5: self-service data export (GET /api/me/export)', async () => {
    const u = await makeAccount(srv, 'Exporter');
    const r = await api(srv, 'GET', '/api/me/export', { cookie: u.cookie });
    expect(r.status).toBe(200);
    expect(r.body.account.id).toBe(u.account.id);
  });

  it('AUTH-6: self-service account deletion (POST /api/me/delete with the passphrase)', async () => {
    const u = await makeAccount(srv, 'Leaver');
    const r = await post('/api/me/delete', u.cookie, { passphrase: u.passphrase, confirm: 'delete' });
    expect(r.status).toBe(200);
    expect(srv.services.accounts.findById(u.account.id)).toBeUndefined();
  });

  it('AUTH-7: admin account deletion also scrubs the account from saved game records', async () => {
    const admin = await makeAdmin('Deleter');
    const v = await makeAccount(srv, 'Forget Me Name');
    const record = {
      version: 1,
      lobby: { name: 'Old lobby' },
      seats: [{ pid: 'p1', seat: 0, accountId: v.account.id, displayName: 'Forget Me Name', label: 'Forget Me Name' }],
      storyteller: { pid: 'p0', accountId: v.account.id, displayName: 'Forget Me Name', label: 'Forget Me Name' },
      pamphlets: [],
    };
    srv.services.database.sqlite
      .prepare(
        `INSERT INTO match_records (match_id, lobby_id, version, status, started_at, ended_at, winner, player_count, storyteller_account_id, record_json)
         VALUES ('m_auth7', 'lobbyx', 1, 'finished', 1, 2, 'good', 1, ?, ?)`,
      )
      .run(v.account.id, JSON.stringify(record));
    expect((await post(`/api/admin/accounts/${v.account.id}/delete`, admin.cookie, { confirm: 'delete' })).status).toBe(200);
    const row = srv.services.database.sqlite.prepare(`SELECT storyteller_account_id AS st, record_json AS j FROM match_records WHERE match_id = 'm_auth7'`).get() as { st: string; j: string };
    expect(row.st).not.toBe(v.account.id);
    expect(row.j).not.toContain(v.account.id);
    expect(row.j).not.toContain('Forget Me Name');
  });
});

describe('phase B regression tests', () => {
  const freshCookieFor = async (passphrase: string) => {
    const r = await post('/api/auth/signin', undefined, { passphrase }, { 'x-forwarded-for': freshIp() });
    expect(r.status).toBe(200);
    const sc = r.headers.getSetCookie().find((c) => c.startsWith(`${srv.services.config.cookieName}=`))!;
    return sc.split(';')[0]!;
  };

  it('AUTH-1: revoked connections close with CLOSE_CODES.signedOut and get a "signed out" notice', async () => {
    const v = await makeAccount(srv, 'Close Code');
    const { c } = await seated(v.cookie, 'closecode');
    await post('/api/auth/signout-all', v.cookie, {});
    await waitFor(() => c.closeCode !== null, 3000, 'closed');
    expect(c.closeCode).toBe(CLOSE_CODES.signedOut);
    expect(c.of('kicked').some((k) => /signed out/i.test(k.reason))).toBe(true);
  });

  it('AUTH-1: single-device sign-out closes only the room opened with that session', async () => {
    const v = await makeAccount(srv, 'Two Devices');
    const other = await freshCookieFor(v.passphrase); // device B
    const { c } = await seated(other, 'twodev'); // joined from device B
    expect((await post('/api/auth/signout', v.cookie, {})).status).toBe(200); // device A signs out
    await sleep(500);
    expect(c.closeCode).toBeNull();
    expect((await post('/api/auth/signout', other, {})).status).toBe(200); // device B signs out
    await waitFor(() => c.closeCode !== null, 3000, 'closed after own session sign-out');
  });

  it('AUTH-1: "sign out everywhere" also ends the account\'s open lobby SSE stream', async () => {
    const v = await makeAccount(srv, 'Streamer');
    const ctrl = new AbortController();
    const res = await fetch(`${srv.url}/api/lobbies/stream`, { headers: { cookie: v.cookie }, signal: ctrl.signal });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await reader.read(); // first frame
    await post('/api/auth/signout-all', v.cookie, {});
    const done = await Promise.race([
      (async () => {
        for (;;) if ((await reader.read()).done) return true;
      })(),
      sleep(3000).then(() => false),
    ]);
    ctrl.abort();
    expect(done).toBe(true);
  });

  it('AUTH-1: account deletion by an admin ends the account\'s sessions and streams', async () => {
    const admin = await makeAdmin('Deleter2');
    const v = await makeAccount(srv, 'Doomed');
    expect((await post(`/api/admin/accounts/${v.account.id}/delete`, admin.cookie, { confirm: 'delete' })).status).toBe(200);
    expect((await api(srv, 'GET', '/api/me', { cookie: v.cookie })).status).toBe(401);
  });

  it('AUTH-2: verifiers made at the old cost (N=2^15) still sign in and are upgraded to the current cost', async () => {
    const v = await makeAccount(srv, 'Legacy Hash');
    const normalized = normalizePassphrase(v.passphrase);
    const old = await makeVerifier(normalized, 1 << 15);
    srv.services.accounts.setCredentials(v.account.id, { passphraseLookup: passphraseLookup('p'.repeat(64), normalized), passphraseVerifier: old.verifier, salt: old.salt });
    const verifier = () => (srv.services.database.sqlite.prepare('SELECT passphrase_verifier AS v FROM accounts WHERE id = ?').get(v.account.id) as { v: string }).v;
    expect(verifier()).toMatch(/^scrypt\$32768\$/);
    await freshCookieFor(v.passphrase);
    expect(verifier()).toMatch(new RegExp(`^scrypt\\$${DEFAULT_SCRYPT_N}\\$`));
    await freshCookieFor(v.passphrase); // and the upgraded verifier works
  });

  it('AUTH-2: per-range in-flight cap: one address cannot occupy the scrypt queue', async () => {
    const ip = freshIp();
    const burst = await Promise.all(
      Array.from({ length: 8 }, (_, i) => post('/api/auth/signin', undefined, { passphrase: `burst passphrase number ${i}` }, { 'x-forwarded-for': ip })),
    );
    const statuses = burst.map((r) => r.status);
    expect(statuses.every((s) => s === 401 || s === 429)).toBe(true);
  });

  it('AUTH-3: range keys are [exact] for IPv4 and [/64, /56, /48] for IPv6', () => {
    expect(ipRangeKeys('203.0.113.7')).toEqual(['203.0.113.7']);
    expect(ipRangeKeys('::ffff:203.0.113.7')).toEqual(['::ffff:203.0.113.7']);
    expect(ipRangeKeys('2001:db8:4242:1234:5::1')).toEqual(['2001:0db8:4242:1234::/64', '2001:0db8:4242:1200::/56', '2001:0db8:4242::/48']);
  });

  it('AUTH-4: a re-issued cookie never outlives the absolute session lifetime', async () => {
    const v = await makeAccount(srv, 'Cookie Age');
    srv.services.database.sqlite
      .prepare('UPDATE sessions SET created_at = created_at - ?, last_used_at = last_used_at - 120000 WHERE account_id = ?')
      .run(89 * 86_400_000, v.account.id);
    const r = await api(srv, 'GET', '/api/me', { cookie: v.cookie });
    expect(r.status).toBe(200);
    const sc = r.headers.getSetCookie().find((c) => c.startsWith(`${srv.services.config.cookieName}=`))!;
    const maxAge = Number(/Max-Age=(\d+)/.exec(sc)![1]);
    expect(maxAge).toBeLessThanOrEqual(86_400);
    srv.services.database.sqlite.prepare('UPDATE sessions SET created_at = created_at - ? WHERE account_id = ?').run(2 * 86_400_000, v.account.id);
    expect((await api(srv, 'GET', '/api/me', { cookie: v.cookie })).status).toBe(401);
  });

  it('AUTH-5: the export holds only the account\'s own data (no other seat\'s info, character or account id)', async () => {
    const a = await makeAccount(srv, 'Export Alice');
    const b = await makeAccount(srv, 'Export Bob');
    const record = {
      version: 1,
      matchId: 'm_exp1',
      status: 'abandoned',
      lobby: { name: 'Export lobby' },
      seats: [
        { pid: 'pa', seat: 0, accountId: a.account.id, displayName: 'Export Alice', label: 'Export Alice', startingCharacter: 'washerwoman' },
        { pid: 'pb', seat: 1, accountId: b.account.id, displayName: 'Export Bob', label: 'Export Bob', startingCharacter: 'imp' },
      ],
      storyteller: null,
      info: [
        { seat: 0, at: 1, day: 0, night: 1, text: 'ALICE-SECRET-INFO' },
        { seat: 1, at: 1, day: 0, night: 1, text: 'BOB-SECRET-INFO' },
      ],
      prompts: [],
      announcements: [{ at: 2, day: 1, kind: 'st', text: 'PUBLIC-ANNOUNCEMENT' }],
      pamphlets: [],
    };
    srv.services.database.sqlite
      .prepare(
        `INSERT INTO match_records (match_id, lobby_id, version, status, started_at, ended_at, winner, player_count, storyteller_account_id, record_json)
         VALUES ('m_exp1', 'lobbye', 1, 'abandoned', 1, 2, NULL, 2, NULL, ?)`,
      )
      .run(JSON.stringify(record));
    const r = await api(srv, 'GET', '/api/me/export', { cookie: a.cookie });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const text = JSON.stringify(r.body);
    expect(text).toContain('ALICE-SECRET-INFO');
    expect(text).toContain('PUBLIC-ANNOUNCEMENT');
    expect(text).not.toContain('BOB-SECRET-INFO');
    expect(text).not.toContain(b.account.id);
    expect(text).not.toContain('imp');
    expect(text).not.toContain('washerwoman'); // abandoned: no reveal, not even your own true character
    expect(text).not.toMatch(/"(tokenHash|token_hash|passphraseVerifier|passphrase_verifier|passphraseLookup|passphrase_lookup|salt)"\s*:/);
  });

  it('AUTH-6: deletion needs the right passphrase, refuses while seated, and signs out everywhere', async () => {
    const u = await makeAccount(srv, 'Careful Leaver');
    expect((await post('/api/me/delete', u.cookie, { passphrase: 'abacus abacus abacus abacus abacus abacus', confirm: 'delete' })).status).toBe(401);
    expect((await post('/api/me/delete', u.cookie, { passphrase: u.passphrase })).status).toBe(400); // confirm required
    const { c } = await seated(u.cookie, 'leaver');
    const blocked = await post('/api/me/delete', u.cookie, { passphrase: u.passphrase, confirm: 'delete' });
    expect(blocked.status).toBe(409);
    await c.leave(true);
    await waitFor(() => !srv.services.directory.lobbyOfAccount(u.account.id), 3000, 'left');
    const ok = await post('/api/me/delete', u.cookie, { passphrase: u.passphrase, confirm: 'delete' });
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie().some((sc) => /Max-Age=0/.test(sc))).toBe(true);
    expect(srv.services.accounts.findById(u.account.id)).toBeUndefined();
    expect((await post('/api/auth/signin', undefined, { passphrase: u.passphrase }, { 'x-forwarded-for': freshIp() })).status).toBe(401);
  });

  it('AUTH-7: scrub replaces the person (ids + names, incl. inside text) and leaves others alone', () => {
    const rec = {
      seats: [
        { accountId: 'acc1', displayName: 'Alice', label: 'Alice' },
        { accountId: 'acc2', displayName: 'Bob', label: 'Bob' },
      ],
      timeline: [{ text: 'Alice nominated Bob.' }, { text: 'Alicegate is not a name.' }],
    };
    const { record, changed } = scrubAccountFromRecord(rec, 'acc1', 'deleted-x');
    expect(changed).toBe(true);
    const s = JSON.stringify(record);
    expect(s).not.toContain('acc1');
    expect(s).toContain('"Deleted player nominated Bob."');
    expect(s).toContain('Alicegate');
    expect(s).toContain('acc2');
  });

  it('AUTH-8: account takeover / deletion needs a recent sign-in or the admin passphrase again', async () => {
    const admin = await makeAdmin('Stale Admin');
    const v = await makeAccount(srv, 'Step Target');
    srv.services.database.sqlite.prepare('UPDATE sessions SET created_at = created_at - 3600000 WHERE account_id = ?').run(admin.account.id);
    const url = `/api/admin/accounts/${v.account.id}/rotate-passphrase`;
    const noPass = await post(url, admin.cookie, {});
    expect(noPass.status).toBe(401);
    expect(noPass.body.error).toBe('reauth_required');
    expect((await post(url, admin.cookie, { passphrase: v.passphrase })).status).toBe(401); // someone else's passphrase
    expect((await post(`/api/admin/accounts/${v.account.id}/delete`, admin.cookie, { confirm: 'delete' })).status).toBe(401);
    expect((await post(url, admin.cookie, { passphrase: admin.passphrase })).status).toBe(200);
  });

  it('AUTH-8: admin sessions end after 12 h idle; full game record views are audited', async () => {
    const admin = await makeAdmin('Idle Admin');
    srv.services.database.sqlite
      .prepare(
        `INSERT INTO match_records (match_id, lobby_id, version, status, started_at, ended_at, winner, player_count, storyteller_account_id, record_json)
         VALUES ('m_view1', 'lobbyv', 1, 'finished', 1, 2, 'good', 0, NULL, '{"seats":[]}')`,
      )
      .run();
    expect((await api(srv, 'GET', '/api/admin/games/m_view1', { cookie: admin.cookie })).status).toBe(200);
    expect((await api(srv, 'GET', '/api/admin/games/m_view1?download=1', { cookie: admin.cookie })).status).toBe(200);
    const actions = createAdminRepo(srv.services.database)
      .listAudit({ limit: 200 })
      .filter((e) => e.adminAccountId === admin.account.id)
      .map((e) => `${e.action}:${e.targetId}`);
    expect(actions).toEqual(expect.arrayContaining(['game.view:m_view1', 'game.download:m_view1']));
    srv.services.database.sqlite.prepare('UPDATE sessions SET last_used_at = last_used_at - ? WHERE account_id = ?').run(13 * 3_600_000, admin.account.id);
    expect((await api(srv, 'GET', '/api/me', { cookie: admin.cookie })).status).toBe(401);
  });

  it('AUTH-9: refused admin attempts are logged (account id + path, no secrets)', async () => {
    const u = await makeAccount(srv, 'Probe Logger');
    await api(srv, 'GET', '/api/admin/accounts', { cookie: u.cookie });
    const line = srv.log.lines.find((l) => l.includes('admin access denied') && l.includes(u.account.id));
    expect(line).toBeTruthy();
    expect(line).toContain('/admin/accounts');
    expect(line).not.toContain(u.cookie.split('=')[1]!);
  });

  it('AUTH-10: signing in ends the browser\'s previous session; sessions per account are capped', async () => {
    const v = await makeAccount(srv, 'Many Sessions');
    const r = await post('/api/auth/signin', v.cookie, { passphrase: v.passphrase }, { 'x-forwarded-for': freshIp() });
    expect(r.status).toBe(200);
    expect((await api(srv, 'GET', '/api/me', { cookie: v.cookie })).status).toBe(401);
    for (let i = 0; i < 24; i++) await srv.services.auth.signIn(v.passphrase);
    const n = (srv.services.database.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?').get(v.account.id) as { n: number }).n;
    expect(n).toBe(20);
  });
});
