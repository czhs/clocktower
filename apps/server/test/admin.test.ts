// Admin console API (/api/admin/*): authorisation on every route, each account/lobby action, the
// append-only audit log, secrecy (no hashes/tokens/passphrases in bodies or logs), rate limits.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminRepo, type AccountRecord } from '@ct/db';
import { api, createLobby, fakeModules, makeAccount, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';
import { ADMIN_MUTATION_LIMIT } from '../src/admin/http.js';

const PORT = 3335;
let srv: TestServer;
const fakes = fakeModules();

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    moduleFactories: fakes.factories,
    rateLimits: { createLobby: { capacity: 100, refillPerSec: 100 } },
  });
});
afterAll(async () => {
  await srv?.close();
});

type Acc = { account: AccountRecord; cookie: string; passphrase: string };
const admins = () => srv.services.config.adminAccountIds as Set<string>;
async function makeAdmin(name: string): Promise<Acc> {
  const a = await makeAccount(srv, name);
  admins().add(a.account.id);
  return a;
}
const post = (url: string, cookie: string | undefined, body: unknown = {}) => api(srv, 'POST', url, { cookie, body });
const get = (url: string, cookie?: string) => api(srv, 'GET', url, { cookie });
const auditRows = () => createAdminRepo(srv.services.database).listAudit({ limit: 200 });

/** Recursively collects every key in a JSON value. */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.add(k), keysOf(x, out));
  return out;
}
const SECRET_KEY = /lookup|verifier|salt|token|hash|passphrase|cookie/i;

describe('admin API authorisation', () => {
  const routes: [string, string][] = [
    ['GET', '/api/admin/status'],
    ['GET', '/api/admin/overview'],
    ['GET', '/api/admin/accounts'],
    ['GET', '/api/admin/audit'],
    ['POST', '/api/admin/accounts/AAAAAAAAAAAAAAAA/rename'],
    ['POST', '/api/admin/accounts/AAAAAAAAAAAAAAAA/rotate-passphrase'],
    ['POST', '/api/admin/accounts/AAAAAAAAAAAAAAAA/signout-all'],
    ['POST', '/api/admin/accounts/AAAAAAAAAAAAAAAA/delete'],
    ['POST', '/api/admin/accounts/bulk-delete'],
    ['POST', '/api/admin/lobbies/abcdefgh/close'],
    ['GET', '/api/admin/does-not-exist'],
  ];

  it('401 without a session, 403 for a signed-in non-admin, on every route (incl. unknown ones)', async () => {
    const user = await makeAccount(srv, 'Plain');
    const victim = await makeAccount(srv, 'Victim');
    const before = auditRows().length;
    for (const [method, url] of routes) {
      const real = url.replace('AAAAAAAAAAAAAAAA', victim.account.id);
      const body = method === 'POST' ? { displayName: 'Hacked', confirm: 'delete', ids: [victim.account.id] } : undefined;
      expect((await api(srv, method, real, { body })).status, `${method} ${url} anon`).toBe(401);
      const r = await api(srv, method, real, { cookie: user.cookie, body });
      expect(r.status, `${method} ${url} non-admin`).toBe(403);
      expect(r.body).toEqual({ error: 'forbidden', message: 'Admins only' });
    }
    // Nothing happened to the victim and nothing was audited.
    expect(srv.services.accounts.findById(victim.account.id)?.displayName).toBe('Victim');
    expect(srv.services.auth.authenticate(victim.cookie.split('=')[1])).not.toBeNull();
    expect(auditRows().length).toBe(before);
  });

  it('admins get 404 for unknown admin routes; responses are no-store', async () => {
    const admin = await makeAdmin('Root');
    const r = await get('/api/admin/does-not-exist', admin.cookie);
    expect(r.status).toBe(404);
    const ok = await get('/api/admin/overview', admin.cookie);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
  });

  it('mutations require a JSON body and a same-origin Origin (existing CSRF guard)', async () => {
    const admin = await makeAdmin('Root2');
    const t = await makeAccount(srv, 'Target');
    const url = `/api/admin/accounts/${t.account.id}/signout-all`;
    const form = await api(srv, 'POST', url, { cookie: admin.cookie, raw: 'confirmSelf=true', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(form.status).toBe(415);
    const cross = await api(srv, 'POST', url, { cookie: admin.cookie, body: {}, headers: { origin: 'https://evil.example' } });
    expect(cross.status).toBe(403);
    const same = await api(srv, 'POST', url, { cookie: admin.cookie, body: {}, headers: { origin: 'https://clocktower.example.test' } });
    expect(same.status).toBe(200);
  });

  it('rejects unexpected body fields and malformed ids/queries (zod)', async () => {
    const admin = await makeAdmin('Root3');
    const t = await makeAccount(srv, 'Target3');
    expect((await post(`/api/admin/accounts/${t.account.id}/signout-all`, admin.cookie, { isAdmin: true })).status).toBe(400);
    expect((await post(`/api/admin/accounts/${t.account.id}/rename`, admin.cookie, { displayName: 'x'.repeat(40) })).status).toBe(400);
    expect((await post('/api/admin/accounts/bad.id!/rename', admin.cookie, { displayName: 'ok' })).status).toBe(404);
    expect((await get('/api/admin/accounts?limit=5000', admin.cookie)).status).toBe(400);
    expect((await get('/api/admin/accounts?sort=password', admin.cookie)).status).toBe(400);
    expect((await get('/api/admin/accounts?q=a&q=b', admin.cookie)).status).toBe(400);
  });
});

describe('accounts list', () => {
  it('searches by name (contains / prefix) and id prefix, paginates, and reports stats + live lobby', async () => {
    const admin = await makeAdmin('ListAdmin');
    const made: Acc[] = [];
    for (const n of ['zqTest-1', 'zqTest-2', 'zqTest-3', 'other zqTest', 'zq_100%']) made.push(await makeAccount(srv, n));
    // Seed history: zqTest-1 played 2 (won 1), zqTest-2 told 1.
    const [p1, p2] = made;
    srv.services.stats.recordMatchFinished(match('m-list-1', [[p1!.account.id, true]], p2!.account.id));
    srv.services.stats.recordMatchFinished(match('m-list-2', [[p1!.account.id, false]], null));

    const contains = await get('/api/admin/accounts?q=zqTest&limit=10', admin.cookie);
    expect(contains.status).toBe(200);
    expect(contains.body.total).toBe(4);
    const prefix = await get('/api/admin/accounts?q=zqTest-&match=prefix&sort=name&dir=asc', admin.cookie);
    expect(prefix.body.accounts.map((a: { displayName: string }) => a.displayName)).toEqual(['zqTest-1', 'zqTest-2', 'zqTest-3']);
    // LIKE wildcards in the search text are literal.
    const literal = await get(`/api/admin/accounts?q=${encodeURIComponent('zq_100%')}`, admin.cookie);
    expect(literal.body.total).toBe(1);
    const pct = await get(`/api/admin/accounts?q=${encodeURIComponent('%')}`, admin.cookie);
    expect(pct.body.total).toBe(1);
    // Id prefix.
    const byId = await get(`/api/admin/accounts?q=${encodeURIComponent(p1!.account.id.slice(0, 10))}`, admin.cookie);
    expect(byId.body.accounts.map((a: { id: string }) => a.id)).toContain(p1!.account.id);
    // Pagination.
    const page1 = await get('/api/admin/accounts?q=zqTest-&match=prefix&sort=name&dir=asc&limit=2', admin.cookie);
    const page2 = await get('/api/admin/accounts?q=zqTest-&match=prefix&sort=name&dir=asc&limit=2&offset=2', admin.cookie);
    expect(page1.body.accounts).toHaveLength(2);
    expect(page2.body.accounts.map((a: { displayName: string }) => a.displayName)).toEqual(['zqTest-3']);

    const row1 = prefix.body.accounts[0];
    expect(row1).toMatchObject({ gamesPlayed: 2, gamesWon: 1, gamesStorytold: 0, activeSessions: 1, isAdmin: false, isYou: false, lobby: null });
    expect(prefix.body.accounts[1]).toMatchObject({ gamesStorytold: 1 });
    expect(Date.parse(row1.createdAt)).toBeGreaterThan(0);

    // Admin flag + "you".
    const me = await get(`/api/admin/accounts?q=ListAdmin`, admin.cookie);
    expect(me.body.accounts[0]).toMatchObject({ isAdmin: true, isYou: true });

    // In a lobby.
    const lobby = await createLobby(srv, made[2]!.cookie, { name: 'Busy lobby' });
    const c = await TestClient.join(srv, made[2]!.cookie, lobby.id);
    try {
      await c.view();
      const busy = await get(`/api/admin/accounts?q=zqTest-3`, admin.cookie);
      expect(busy.body.accounts[0].lobby).toEqual({ id: lobby.id, name: 'Busy lobby' });
    } finally {
      await c.leave();
      srv.services.directory.close(lobby.id);
    }

    // Never any credential material.
    for (const r of [contains, prefix, me]) {
      for (const k of keysOf(r.body)) expect(k).not.toMatch(SECRET_KEY);
    }
  });
});

function match(matchId: string, players: [string, boolean][], storyteller: string | null) {
  return {
    matchId,
    lobbyId: 'lobby',
    script: 'trouble-brewing',
    startedAt: 1,
    endedAt: 2,
    winner: 'good' as const,
    reason: 'test',
    storytellerAccountId: storyteller,
    players: players.map(([accountId, won], seat) => ({
      accountId,
      seat,
      startingCharacter: 'chef',
      finalCharacter: 'chef',
      alignment: (won ? 'good' : 'evil') as 'good' | 'evil',
      won,
      alive: true,
      executed: false,
      died: false,
      nominations: 0,
      ghostVoteUsed: false,
    })),
  };
}

describe('account actions', () => {
  it('rename: renames, audits (with old/new name), refuses reserved names, asks before renaming yourself', async () => {
    const admin = await makeAdmin('RenAdmin');
    const t = await makeAccount(srv, 'Old Name');
    const r = await post(`/api/admin/accounts/${t.account.id}/rename`, admin.cookie, { displayName: '  New‮ Name ' });
    expect(r.status).toBe(200);
    expect(r.body.displayName).toBe('New Name');
    expect(srv.services.accounts.findById(t.account.id)?.displayName).toBe('New Name');
    const a = auditRows()[0]!;
    expect(a).toMatchObject({ action: 'account.rename', adminAccountId: admin.account.id, adminName: 'RenAdmin', targetType: 'account', targetId: t.account.id, detail: { from: 'Old Name', to: 'New Name' } });

    expect((await post(`/api/admin/accounts/${t.account.id}/rename`, admin.cookie, { displayName: 'Storyteller' })).status).toBe(400);
    const self = await post(`/api/admin/accounts/${admin.account.id}/rename`, admin.cookie, { displayName: 'Me' });
    expect(self.status).toBe(409);
    expect(srv.services.accounts.findById(admin.account.id)?.displayName).toBe('RenAdmin');
    const selfOk = await post(`/api/admin/accounts/${admin.account.id}/rename`, admin.cookie, { displayName: 'Me', confirmSelf: true });
    expect(selfOk.status).toBe(200);
    expect((await post('/api/admin/accounts/AAAAAAAAAAAAAAAA/rename', admin.cookie, { displayName: 'x' })).status).toBe(404);
  });

  it('rotate passphrase: returns a new one once, old one stops working, all sessions revoked, nothing secret logged', async () => {
    const admin = await makeAdmin('RotAdmin');
    const t = await makeAccount(srv, 'Rotatee');
    const second = await srv.services.auth.signIn(t.passphrase);
    expect(second).not.toBeNull();
    const r = await post(`/api/admin/accounts/${t.account.id}/rotate-passphrase`, admin.cookie);
    expect(r.status).toBe(200);
    const fresh = r.body.passphrase as string;
    expect(fresh.split(' ')).toHaveLength(6);
    expect(fresh).not.toBe(t.passphrase);
    expect(r.body.account).toMatchObject({ id: t.account.id, activeSessions: 0 });
    // Old sessions are gone (both devices).
    expect((await get('/api/me', t.cookie)).status).toBe(401);
    expect(srv.services.auth.authenticate(second!.token)).toBeNull();
    // Old passphrase no longer signs in; the new one does.
    expect(await srv.services.auth.signIn(t.passphrase)).toBeNull();
    expect((await srv.services.auth.signIn(fresh))?.account.id).toBe(t.account.id);
    // Audit + logs never contain the passphrase.
    const a = auditRows()[0]!;
    expect(a).toMatchObject({ action: 'account.rotate_passphrase', targetId: t.account.id });
    expect(JSON.stringify(auditRows())).not.toContain(fresh);
    const logText = srv.log.lines.join('\n');
    expect(logText).not.toContain(fresh);
    expect(logText).not.toContain(fresh.replace(/ /g, '-'));
    expect(logText).toContain('"msg":"admin action"');
  });

  it('rotate passphrase: refused for another admin; asks before rotating your own', async () => {
    const admin = await makeAdmin('RotAdmin2');
    const other = await makeAdmin('OtherAdmin');
    const r = await post(`/api/admin/accounts/${other.account.id}/rotate-passphrase`, admin.cookie);
    expect(r.status).toBe(403);
    expect(await srv.services.auth.signIn(other.passphrase)).not.toBeNull();
    expect((await post(`/api/admin/accounts/${admin.account.id}/rotate-passphrase`, admin.cookie)).status).toBe(409);
    expect((await get('/api/me', admin.cookie)).status).toBe(200);
  });

  it('sign out everywhere: revokes every session of the target only', async () => {
    const admin = await makeAdmin('SoAdmin');
    const t = await makeAccount(srv, 'Signout');
    const bystander = await makeAccount(srv, 'Bystander');
    const r = await post(`/api/admin/accounts/${t.account.id}/signout-all`, admin.cookie);
    expect(r.status).toBe(200);
    expect(r.body.activeSessions).toBe(0);
    expect((await get('/api/me', t.cookie)).status).toBe(401);
    expect((await get('/api/me', bystander.cookie)).status).toBe(200);
    expect((await get('/api/me', admin.cookie)).status).toBe(200);
    expect(auditRows()[0]).toMatchObject({ action: 'account.signout_all', targetId: t.account.id, detail: { sessionsRevoked: 1 } });
    // Self needs confirmation.
    expect((await post(`/api/admin/accounts/${admin.account.id}/signout-all`, admin.cookie)).status).toBe(409);
  });

  it('delete: needs the confirm literal, removes account + sessions, anonymises game history', async () => {
    const admin = await makeAdmin('DelAdmin');
    const t = await makeAccount(srv, 'Deletee');
    const keep = await makeAccount(srv, 'Keeper');
    srv.services.stats.recordMatchFinished(match('m-del-1', [[t.account.id, true], [keep.account.id, false]], t.account.id));
    const matchesBefore = srv.services.stats.matchCount();

    expect((await post(`/api/admin/accounts/${t.account.id}/delete`, admin.cookie, {})).status).toBe(400);
    expect((await post(`/api/admin/accounts/${t.account.id}/delete`, admin.cookie, { confirm: 'yes' })).status).toBe(400);
    const r = await post(`/api/admin/accounts/${t.account.id}/delete`, admin.cookie, { confirm: 'delete' });
    expect(r.status).toBe(200);
    expect(srv.services.accounts.findById(t.account.id)).toBeUndefined();
    expect((await get('/api/me', t.cookie)).status).toBe(401);
    expect(await srv.services.auth.signIn(t.passphrase)).toBeNull();
    const db = srv.services.database.sqlite;
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?').get(t.account.id)).toEqual({ n: 0 });
    // History: the match and both seats remain; the deleted player is a tombstone, not their id.
    expect(srv.services.stats.matchCount()).toBe(matchesBefore);
    const seats = db.prepare("SELECT account_id AS id FROM match_players WHERE match_id = 'm-del-1' ORDER BY seat").all() as { id: string }[];
    expect(seats).toHaveLength(2);
    expect(seats[0]!.id).toMatch(/^deleted-[A-Za-z0-9_-]{12}$/);
    expect(seats[1]!.id).toBe(keep.account.id);
    const st = db.prepare("SELECT storyteller_account_id AS st FROM matches WHERE id = 'm-del-1'").get() as { st: string };
    expect(st.st).toBe(seats[0]!.id);
    expect(srv.services.stats.statsFor(t.account.id).matchesPlayed).toBe(0);
    expect(srv.services.stats.statsFor(keep.account.id).matchesPlayed).toBe(1);
    expect(auditRows()[0]).toMatchObject({ action: 'account.delete', targetId: t.account.id, targetName: 'Deletee' });
    // Already gone.
    expect((await post(`/api/admin/accounts/${t.account.id}/delete`, admin.cookie, { confirm: 'delete' })).status).toBe(404);
  });

  it('delete: refused for yourself, for other admins and for accounts seated in a lobby', async () => {
    const admin = await makeAdmin('DelAdmin2');
    const other = await makeAdmin('DelAdmin3');
    const seated = await makeAccount(srv, 'Seated');
    expect((await post(`/api/admin/accounts/${admin.account.id}/delete`, admin.cookie, { confirm: 'delete' })).status).toBe(403);
    expect((await post(`/api/admin/accounts/${other.account.id}/delete`, admin.cookie, { confirm: 'delete' })).status).toBe(403);
    const lobby = await createLobby(srv, seated.cookie, { name: 'Seat lobby' });
    const c = await TestClient.join(srv, seated.cookie, lobby.id);
    try {
      await c.view();
      const r = await post(`/api/admin/accounts/${seated.account.id}/delete`, admin.cookie, { confirm: 'delete' });
      expect(r.status).toBe(409);
      expect(r.body.message).toContain('Seat lobby');
    } finally {
      await c.leave();
      srv.services.directory.close(lobby.id);
    }
    expect(srv.services.accounts.findById(admin.account.id)).toBeDefined();
    expect(srv.services.accounts.findById(other.account.id)).toBeDefined();
    expect(srv.services.accounts.findById(seated.account.id)).toBeDefined();
  });

  it('bulk delete: deletes the deletable, reports why others were skipped, audits each deletion', async () => {
    const admin = await makeAdmin('BulkAdmin');
    const other = await makeAdmin('BulkOtherAdmin');
    const victims = [await makeAccount(srv, 'verify-1'), await makeAccount(srv, 'verify-2'), await makeAccount(srv, 'verify-3')];
    const seated = await makeAccount(srv, 'verify-seated');
    const lobby = await createLobby(srv, seated.cookie, { name: 'Bulk lobby' });
    const c = await TestClient.join(srv, seated.cookie, lobby.id);
    await c.view();
    try {
      const ids = [...victims.map((v) => v.account.id), seated.account.id, admin.account.id, other.account.id, 'ZZZZZZZZZZZZZZZZ', victims[0]!.account.id];
      expect((await post('/api/admin/accounts/bulk-delete', admin.cookie, { ids })).status).toBe(400); // no confirm
      const r = await post('/api/admin/accounts/bulk-delete', admin.cookie, { ids, confirm: 'delete' });
      expect(r.status).toBe(200);
      expect(r.body.deleted.map((d: { displayName: string }) => d.displayName).sort()).toEqual(['verify-1', 'verify-2', 'verify-3']);
      const skipped = Object.fromEntries(r.body.skipped.map((s: { id: string; reason: string }) => [s.id, s.reason]));
      expect(Object.keys(skipped)).toHaveLength(4);
      expect(skipped[seated.account.id]).toContain('Bulk lobby');
      expect(skipped[admin.account.id]).toMatch(/own account/);
      expect(skipped[other.account.id]).toMatch(/Admin accounts/);
      expect(skipped.ZZZZZZZZZZZZZZZZ).toBe('Not found');
      for (const v of victims) expect(srv.services.accounts.findById(v.account.id)).toBeUndefined();
      const recent = auditRows().slice(0, 3);
      expect(recent.every((e) => e.action === 'account.delete' && e.detail?.bulk === true)).toBe(true);
      expect((await post('/api/admin/accounts/bulk-delete', admin.cookie, { ids: Array(201).fill('AAAAAAAAAAAAAAAA'), confirm: 'delete' })).status).toBe(400);
    } finally {
      await c.leave();
      srv.services.directory.close(lobby.id);
    }
  });
});

describe('lobbies, overview and audit log', () => {
  it('overview lists lobbies with storyteller/host/created and counts; closing a lobby is audited', async () => {
    const admin = await makeAdmin('LobbyAdmin');
    const host = await makeAccount(srv, 'Host');
    const st = await makeAccount(srv, 'Teller');
    const lobby = await createLobby(srv, host.cookie, { name: 'Night Owls', maxPlayers: 10 });
    const p = await TestClient.join(srv, host.cookie, lobby.id);
    const s = await TestClient.join(srv, st.cookie, lobby.id, 'storyteller');
    await s.view((v) => v.lobby.storytellerName === 'Teller');
    const o = await get('/api/admin/overview', admin.cookie);
    expect(o.status).toBe(200);
    const l = o.body.lobbies.find((x: { id: string }) => x.id === lobby.id);
    expect(l).toMatchObject({ name: 'Night Owls', phase: 'waiting', players: 1, maxPlayers: 10, storytellerName: 'Teller', hostName: 'Host' });
    expect(l.connected).toBeGreaterThanOrEqual(1);
    expect(Date.parse(l.createdAt)).toBeGreaterThan(0);
    expect(o.body.totals).toMatchObject({ lobbies: o.body.lobbies.length, activeGames: 0 });
    expect(o.body.totals.accounts).toBeGreaterThan(0);
    expect(o.body.system).toMatchObject({ env: 'test', node: process.version });
    expect(o.body.voice).toHaveProperty('monthlyLimit');
    for (const k of keysOf(o.body)) expect(k).not.toMatch(SECRET_KEY);

    const closed = await post(`/api/admin/lobbies/${lobby.id}/close`, admin.cookie);
    expect(closed.status).toBe(200);
    await waitFor(() => !srv.services.directory.get(lobby.id), 3000, 'lobby removed');
    expect(auditRows()[0]).toMatchObject({ action: 'lobby.close', targetType: 'lobby', targetId: lobby.id, targetName: 'Night Owls' });
    expect((await post(`/api/admin/lobbies/${lobby.id}/close`, admin.cookie)).status).toBe(404);
    await p.leave();
    await s.leave();
  });

  it('audit log is newest-first, paginates with `before`, and is append-only in the DB', async () => {
    const admin = await makeAdmin('AuditAdmin');
    const t = await makeAccount(srv, 'AuditTarget');
    for (let i = 0; i < 3; i++) await post(`/api/admin/accounts/${t.account.id}/rename`, admin.cookie, { displayName: `Audit ${i}` });
    const r = await get('/api/admin/audit?limit=2', admin.cookie);
    expect(r.status).toBe(200);
    expect(r.body.entries).toHaveLength(2);
    expect(r.body.entries[0]).toMatchObject({ action: 'account.rename', adminId: admin.account.id, adminName: 'AuditAdmin', targetName: 'Audit 2' });
    expect(r.body.entries[0].id).toBeGreaterThan(r.body.entries[1].id);
    const older = await get(`/api/admin/audit?limit=1&before=${r.body.entries[1].id}`, admin.cookie);
    expect(older.body.entries[0]).toMatchObject({ targetName: 'Audit 0' });
    const db = srv.services.database.sqlite;
    expect(() => db.prepare("UPDATE admin_audit SET action = 'x'").run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM admin_audit').run()).toThrow(/append-only/);
  });

  it('rate-limits mutations per admin (429 + Retry-After)', async () => {
    const admin = await makeAdmin('BusyAdmin');
    const t = await makeAccount(srv, 'Spammed');
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < ADMIN_MUTATION_LIMIT.capacity + 5; i++) {
      const r = await post(`/api/admin/accounts/${t.account.id}/signout-all`, admin.cookie);
      statuses.push(r.status);
      if (r.status === 429) retryAfter = r.headers.get('retry-after');
    }
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(ADMIN_MUTATION_LIMIT.capacity);
    expect(statuses).toContain(429);
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    // Reads are not limited; another admin has their own budget.
    expect((await get('/api/admin/accounts', admin.cookie)).status).toBe(200);
    const other = await makeAdmin('CalmAdmin');
    expect((await post(`/api/admin/accounts/${t.account.id}/signout-all`, other.cookie)).status).toBe(200);
  });
});
