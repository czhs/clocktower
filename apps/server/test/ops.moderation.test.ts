// (v2.3 OPS-1/2/6, sec-ops) Moderation + panic switches, end to end on a real server (fake gameplay
// modules; testkit). Findings: docs/security-v2.3/07-ops-incident.md.
//   OPS-1 suspend/unsuspend, network blocks (IPv4 exact, IPv6 per /64), block an account's network
//   OPS-2 sign-up modes, maintenance, revoke all sessions, close all lobbies; audit rows
//   OPS-6 chat filter (default slurs), duplicate guard, mute, report (only lines the reporter got),
//         kick = account + network ban with unban, Storyteller kick in game
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CLOSE_CODES } from '@ct/protocol';
import { createAdminRepo, type AccountRecord } from '@ct/db';
import { api, createLobby, fakeModules, getTicket, makeAccount, sleep, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';
import { filterChat } from '../src/moderation/chatFilter.js';
import { LobbyModeration } from '../src/moderation/lobby.js';
import { getHostLimits } from '../src/guard/hostLimits.js';

const PORT = 3396;
let srv: TestServer;
const fakes = fakeModules();
const open: TestClient[] = [];

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    moduleFactories: fakes.factories,
    env: { LOBBY_MAX_COUNT: '40' },
    rateLimits: {
      createLobby: { capacity: 100, refillPerSec: 100 },
      ticket: { capacity: 100, refillPerSec: 100 },
      createAccount: { capacity: 100, refillPerSec: 100 },
      signIn: { capacity: 100, refillPerSec: 100 },
    },
  });
});
afterAll(async () => {
  await srv?.close();
});
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.leave(true)));
});

type Acc = { account: AccountRecord; cookie: string; passphrase: string };
const admins = () => srv.services.config.adminAccountIds as Set<string>;
async function makeAdmin(name: string): Promise<Acc> {
  const a = await makeAccount(srv, name);
  admins().add(a.account.id);
  return a;
}
const post = (url: string, cookie: string | undefined, body: unknown = {}, headers: Record<string, string> = {}) => api(srv, 'POST', url, { cookie, body, headers });
const get = (url: string, cookie?: string) => api(srv, 'GET', url, { cookie });
const audit = () => createAdminRepo(srv.services.database).listAudit({ limit: 200 });
const xff = (ip: string) => ({ 'x-forwarded-for': ip });
const track = (c: TestClient) => (open.push(c), c);

async function joinAs(acc: Acc, lobbyId: string, ip: string, intent: 'player' | 'storyteller' = 'player') {
  const t = await api(srv, 'POST', `/api/lobbies/${lobbyId}/ticket`, { cookie: acc.cookie, body: { intent }, headers: xff(ip) });
  if (t.status !== 200) throw new Error(`ticket ${t.status} ${JSON.stringify(t.body)}`);
  return track(await TestClient.joinWithTicket(srv, t.body, acc.account.displayName));
}

/** Host (= Storyteller) + n players, each from its own network. */
async function lobbyWith(n: number, prefix = `M${Math.random().toString(36).slice(2, 6)}`) {
  const host = await makeAccount(srv, `${prefix}-H`);
  const lobby = await createLobby(srv, host.cookie, { name: `${prefix} lobby`, maxPlayers: 15, takeStoryteller: true });
  const st = await joinAs(host, lobby.id, '198.51.100.1', 'storyteller');
  const accounts: Acc[] = [];
  const players: TestClient[] = [];
  for (let i = 0; i < n; i++) {
    const a = await makeAccount(srv, `${prefix}-${i}`);
    accounts.push(a);
    players.push(await joinAs(a, lobby.id, `198.51.100.${10 + i}`));
  }
  await st.view((v) => v.members.filter((m) => m.connected).length === n + 1);
  for (const p of players) await p.view();
  return { lobby, host, st, accounts, players };
}

describe('OPS-6 chat filter (unit)', () => {
  it('slurs mode masks identity slurs only; strict also masks profanity; off masks nothing', () => {
    const line = 'you f4ggot, shit happens';
    const slurs = filterChat(line, 'slurs');
    expect(slurs).not.toMatch(/f4ggot/);
    expect(slurs).toContain('shit');
    expect(filterChat(line, 'strict')).not.toContain('shit');
    expect(filterChat(line, 'off')).toBe(line);
    expect(filterChat('n1gger', 'slurs')).not.toMatch(/n1gger/);
  });
  it('does not mangle innocent words', () => {
    for (const w of ['Scunthorpe', 'assassin', 'class', 'Dickens', 'cocktail', 'grape', 'therapist', 'Shitake? no: shiitake'])
      expect(filterChat(w, 'slurs')).toBe(w);
    // (strict is deliberately aggressive: known false positive 'shiitake' -> '****ake'; slurs mode has none of these)
    for (const w of ['assassin', 'class', 'cocktail', 'grape', 'therapist', 'Sussex']) expect(filterChat(w, 'strict')).toBe(w);
  });
});

describe('OPS-6 report context (unit)', () => {
  it('only lines whose audience contained the reporter are attached', () => {
    const m = new LobbyModeration();
    const line = (id: string, text: string) => ({ id, fromPid: 'p_a', fromName: 'A', text, scope: 'zone' as const, at: 1 });
    m.record(line('m1', 'seen by r'), 'acc_a', ['p_a', 'p_r']);
    m.record(line('m2', 'whisper to b'), 'acc_a', ['p_a', 'p_b']);
    const got = m.reportLines('p_r', ['m1', 'm2', 'nope']);
    expect(got.map((l) => l.id)).toEqual(['m1']);
  });
  it('network bans never use loopback; account bans always apply', () => {
    const m = new LobbyModeration();
    m.remove('acc1', '127.0.0.1', 'X');
    expect(m.isRemoved('acc2', '127.0.0.1')).toBe(false);
    expect(m.isRemoved('acc1', null)).toBe(true);
    m.remove('acc3', '203.0.113.9', 'Y');
    expect(m.isRemoved('acc4', '203.0.113.9')).toBe(true);
  });
});

describe('OPS-2 panic switches', () => {
  it('sign-up modes open / code / closed (audited; the code itself never audited)', async () => {
    const root = await makeAdmin('Ops Root');
    expect((await post('/api/admin/ops', root.cookie, { signupMode: 'closed' })).status).toBe(200);
    const closed = await post('/api/auth/create', undefined, { displayName: 'Late' }, xff('198.51.100.200'));
    expect(closed.status).toBe(403);
    expect(closed.body.error).toBe('signups_closed');
    expect((await post('/api/admin/ops', root.cookie, { signupMode: 'code', signupCode: 'friends-only-42' })).status).toBe(200);
    expect((await post('/api/auth/create', undefined, { displayName: 'Late' }, xff('198.51.100.200'))).body.error).toBe('invite_required');
    expect((await post('/api/auth/create', undefined, { displayName: 'Late', inviteCode: 'wrong-code' }, xff('198.51.100.200'))).body.error).toBe('invite_required');
    expect((await post('/api/auth/create', undefined, { displayName: 'Late', inviteCode: 'friends-only-42' }, xff('198.51.100.200'))).status).toBe(201);
    expect((await post('/api/admin/ops', root.cookie, { signupMode: 'open', signupCode: null })).status).toBe(200);
    expect((await post('/api/auth/create', undefined, { displayName: 'Open' }, xff('198.51.100.201'))).status).toBe(201);
    const rows = audit().filter((r) => r.action === 'setting.change' && /signups\./.test(JSON.stringify(r.detail)));
    expect(rows.map((r) => (r.detail as { id: string }).id)).toEqual(expect.arrayContaining(['signups.mode', 'signups.inviteCode']));
    expect(rows.some((r) => JSON.stringify(r.detail) === JSON.stringify({ id: 'signups.mode', from: 'closed', to: 'code' }))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('friends-only-42');
    const ops = await get('/api/admin/ops', root.cookie);
    expect(ops.body.signups).toEqual({ mode: 'open', codeSet: false, fromEnv: false });
  });

  it('maintenance: API answers 503 except sign-in, /me and /admin; switching off restores it', async () => {
    const root = await makeAdmin('Maint Root');
    const user = await makeAccount(srv, 'Maint User');
    await post('/api/admin/ops', root.cookie, { maintenance: true, maintenanceMessage: 'Back at 9pm' });
    const l = await get('/api/lobbies', user.cookie);
    expect(l.status).toBe(503);
    expect(l.body).toEqual({ error: 'maintenance', message: 'Back at 9pm' });
    expect((await post('/api/lobbies', user.cookie, { name: 'x', maxPlayers: 5 })).status).toBe(503);
    expect((await get('/api/me', user.cookie)).status).toBe(200);
    expect((await get('/api/admin/overview', root.cookie)).body.ops.maintenance.on).toBe(true);
    await post('/api/admin/ops', root.cookie, { maintenance: false });
    expect((await get('/api/lobbies', user.cookie)).status).toBe(200);
  });

  it('voice switch drives the sec-voice kill switch and is persisted + audited', async () => {
    const root = await makeAdmin('Voice Root');
    const off = await post('/api/admin/ops', root.cookie, { voice: false });
    expect(off.body.voice).toMatchObject({ on: false, disabledBy: 'admin' });
    expect(srv.services.moderation.repo.flags().voice).toBe(false);
    const on = await post('/api/admin/ops', root.cookie, { voice: true });
    expect(on.body.voice.on).toBe(true);
    expect(audit().filter((r) => r.action === 'setting.change' && r.adminAccountId === root.account.id && (r.detail as { id: string }).id === 'voice.enabled')).toHaveLength(2);
  });

  it('revoke all sessions keeps only the caller; close-all closes every lobby', async () => {
    const root = await makeAdmin('Revoke Root');
    const a = await makeAccount(srv, 'Revoke A');
    const b = await makeAccount(srv, 'Revoke B');
    const L = await lobbyWith(1);
    expect((await post('/api/admin/ops/revoke-all-sessions', root.cookie, {})).status).toBe(400);
    const r = await post('/api/admin/ops/revoke-all-sessions', root.cookie, { confirm: 'sign everyone out' });
    expect(r.status).toBe(200);
    expect((await get('/api/me', a.cookie)).status).toBe(401);
    expect((await get('/api/me', b.cookie)).status).toBe(401);
    expect((await get('/api/me', root.cookie)).status).toBe(200);
    // live sockets of revoked accounts are closed (AUTH-1 fan-out)
    await waitFor(() => L.players[0]!.closeCode !== null, 3000, 'revoked player socket closed');
    const L2 = await lobbyWith(0);
    expect(srv.services.directory.adminView().length).toBeGreaterThan(0);
    const c = await post('/api/admin/lobbies/close-all', root.cookie, { confirm: 'close all' });
    expect(c.status).toBe(200);
    await waitFor(() => L2.st.closeCode === CLOSE_CODES.lobbyClosed, 3000, 'closed');
    await waitFor(() => srv.services.directory.adminView().length === 0, 3000, 'no lobbies');
    expect(audit().some((x) => x.action === 'ops.revoke_all_sessions')).toBe(true);
    expect(audit().some((x) => x.action === 'lobby.close_all')).toBe(true);
  });
});

describe('OPS-1 suspend + network blocks', () => {
  it('suspend: sessions end, live socket closed, sign-in refused with the reason; unsuspend restores', async () => {
    const root = await makeAdmin('Susp Root');
    const L = await lobbyWith(1);
    const target = L.accounts[0]!;
    expect((await post(`/api/admin/accounts/${root.account.id}/suspend`, root.cookie, { reason: 'self test' })).status).toBe(403);
    const s = await post(`/api/admin/accounts/${target.account.id}/suspend`, root.cookie, { reason: 'Harassing players', days: 7 });
    expect(s.status).toBe(200);
    await waitFor(() => L.players[0]!.closeCode !== null, 3000, 'socket closed');
    expect((await get('/api/me', target.cookie)).status).toBe(401);
    const si = await post('/api/auth/signin', undefined, { passphrase: target.passphrase }, xff('198.51.100.77'));
    expect(si.status).toBe(403);
    expect(si.body.error).toBe('suspended');
    expect(si.body.message).toContain('Harassing players');
    const list = await get(`/api/admin/accounts?q=${encodeURIComponent(target.account.displayName)}`, root.cookie);
    expect(list.body.accounts[0].suspended.reason).toBe('Harassing players');
    expect((await post(`/api/admin/accounts/${target.account.id}/unsuspend`, root.cookie, {})).status).toBe(200);
    expect((await post('/api/auth/signin', undefined, { passphrase: target.passphrase }, xff('198.51.100.77'))).status).toBe(200);
    expect(audit().filter((r) => r.targetId === target.account.id).map((r) => r.action)).toEqual(expect.arrayContaining(['account.suspend', 'account.unsuspend']));
  });

  it('IP blocks: IPv4 exact, IPv6 per /64; block an account\'s last network', async () => {
    const root = await makeAdmin('Block Root');
    expect((await post('/api/admin/ip-blocks', root.cookie, { ip: '203.0.113.7', reason: 'spam wave' })).status).toBe(200);
    expect((await post('/api/auth/create', undefined, { displayName: 'Spam' }, xff('203.0.113.7'))).body.error).toBe('blocked');
    expect((await post('/api/auth/create', undefined, { displayName: 'Fine' }, xff('203.0.113.8'))).status).toBe(201);
    expect((await post('/api/admin/ip-blocks', root.cookie, { ip: '2001:db8:1:2::5', reason: 'v6 spam' })).status).toBe(200);
    expect((await post('/api/auth/create', undefined, { displayName: 'V6' }, xff('2001:db8:1:2::99'))).body.error).toBe('blocked');
    expect((await post('/api/auth/create', undefined, { displayName: 'V6ok' }, xff('2001:db8:1:3::1'))).status).toBe(201);
    // the account's network (from its last sign-in) can be blocked without the admin seeing the address
    const troll = await post('/api/auth/create', undefined, { displayName: 'Troll' }, xff('192.0.2.44'));
    const trollId = troll.body.account.id as string;
    const bn = await post(`/api/admin/accounts/${trollId}/block-network`, root.cookie, { reason: 'troll' });
    expect(bn.status).toBe(200);
    expect((await post('/api/auth/signin', undefined, { passphrase: troll.body.passphrase }, xff('192.0.2.44'))).body.error).toBe('blocked');
    const blocks = (await get('/api/admin/ip-blocks', root.cookie)).body.blocks as { key: string }[];
    expect(blocks.map((b) => b.key)).toEqual(expect.arrayContaining(['203.0.113.7', '2001:0db8:0001:0002::/64', '192.0.2.44']));
    expect((await post('/api/admin/ip-blocks/remove', root.cookie, { key: '203.0.113.7' })).status).toBe(200);
    expect((await post('/api/auth/create', undefined, { displayName: 'Back' }, xff('203.0.113.7'))).status).toBe(201);
    // never in the audit trail
    expect(JSON.stringify(audit())).not.toContain('192.0.2.44');
  });
});

describe('OPS-6 in-lobby moderation', () => {
  it('filter default slurs (in the summary), host switches to strict / off; duplicate lines dropped', async () => {
    const L = await lobbyWith(2);
    const [p0, p1] = L.players as [TestClient, TestClient];
    expect((await L.st.view()).lobby.chatFilter).toBe('slurs');
    p0.send('chat:send', { text: 'you f4ggot, shit' });
    const got = await p1.waitMsg('chat:message', (m) => m.text.includes('shit'));
    expect(got.text).not.toContain('f4ggot');
    L.st.send('lobby:settings', { chatFilter: 'strict' });
    await L.st.view((v) => v.lobby.chatFilter === 'strict');
    p0.send('chat:send', { text: 'oh shit again' });
    await p1.waitMsg('chat:message', (m) => m.text.startsWith('oh ') && !m.text.includes('shit'));
    p1.send('lobby:settings', { chatFilter: 'off' });
    await p1.waitMsg('error', (e) => e.for === 'lobby:settings' && e.code === 'forbidden');
    p0.send('chat:send', { text: 'same line twice' });
    p0.send('chat:send', { text: 'same line twice' });
    await p1.waitMsg('chat:message', (m) => m.text === 'same line twice');
    await sleep(300);
    expect(p1.of('chat:message').filter((m) => m.text === 'same line twice')).toHaveLength(1);
    await p0.waitMsg('error', (e) => e.for === 'chat:send' && e.code === 'duplicate');
    // cid: echoed only on the sender's own copy
    p0.send('chat:send', { text: 'with a client id', cid: 'c_123-ab' });
    expect((await p0.waitMsg('chat:message', (m) => m.text === 'with a client id')).cid).toBe('c_123-ab');
    expect((await p1.waitMsg('chat:message', (m) => m.text === 'with a client id')).cid).toBeUndefined();
    p0.sendRaw('chat:send', { text: 'bad cid', cid: 'x'.repeat(40) });
    await p0.waitMsg('error', (e) => e.for === 'chat:send' && e.code === 'invalid');
    // a fast typist hitting the chat rate limit is never closed as an abuser (SEC-7 exemption)
    for (let i = 0; i < 200; i++) p0.send('chat:send', { text: `burst ${i}` });
    await p0.waitMsg('error', (e) => e.for === 'chat:send' && e.code === 'rate_limited');
    await sleep(500);
    expect(p0.closeCode).toBeNull();
  });

  it('mute: host/ST only, public flag, muted chat reaches nobody; unmute restores', async () => {
    const L = await lobbyWith(2);
    const [p0, p1] = L.players as [TestClient, TestClient];
    p1.send('lobby:mute', { pid: p0.pid!, on: true });
    await p1.waitMsg('error', (e) => e.for === 'lobby:mute' && e.code === 'forbidden');
    L.st.send('lobby:mute', { pid: p0.pid!, on: true });
    await p1.view((v) => v.members.find((m) => m.pid === p0.pid)?.muted === true);
    p0.send('chat:send', { text: 'can anyone hear me' });
    await p0.waitMsg('error', (e) => e.for === 'chat:send' && e.code === 'muted');
    await sleep(300);
    expect(p1.of('chat:message').some((m) => m.text === 'can anyone hear me')).toBe(false);
    L.st.send('lobby:mute', { pid: p0.pid!, on: false });
    await p1.view((v) => !v.members.find((m) => m.pid === p0.pid)?.muted);
    p0.send('chat:send', { text: 'back again' });
    await p1.waitMsg('chat:message', (m) => m.text === 'back again');
  });

  it('report: filed with only the lines the reporter received; admin queue + resolve', async () => {
    const root = await makeAdmin('Report Root');
    const L = await lobbyWith(3);
    const [p0, p1, p2] = L.players as [TestClient, TestClient, TestClient];
    // p0 -> p1 only; p0 -> p2 only (p1 must not be able to attach the second line)
    fakes.registry.audience.set(L.lobby.id, (pid) => (pid === p0.pid ? [p1.pid!] : []));
    p0.send('chat:send', { text: 'nasty line to p1' });
    const seen = await p1.waitMsg('chat:message', (m) => m.text === 'nasty line to p1');
    fakes.registry.audience.set(L.lobby.id, (pid) => (pid === p0.pid ? [p2.pid!] : []));
    p0.send('chat:send', { text: 'private to p2' });
    const other = await p2.waitMsg('chat:message', (m) => m.text === 'private to p2');
    fakes.registry.audience.delete(L.lobby.id);
    p1.send('report:player', { pid: p0.pid!, reason: 'harassment', note: 'keeps insulting', messageIds: [seen.id, other.id] });
    expect((await p1.waitMsg('report:ack')).ok).toBe(true);
    p1.send('report:player', { pid: p0.pid!, reason: 'spam' });
    await p1.waitMsg('report:ack', (a) => !a.ok); // 1 per 30 s
    const q = await get('/api/admin/reports?status=open', root.cookie);
    const rep = (q.body.reports as any[]).find((r) => r.lobbyId === L.lobby.id)!;
    expect(rep.reason).toBe('harassment');
    expect(rep.context.lines.map((l: any) => l.text)).toEqual(['nasty line to p1']);
    expect(JSON.stringify(rep)).not.toContain('private to p2');
    expect((await get('/api/admin/ops', root.cookie)).body.openReports).toBeGreaterThan(0);
    expect((await post(`/api/admin/reports/${rep.id}/resolve`, root.cookie, { action: 'warned' })).status).toBe(200);
    expect((await post(`/api/admin/reports/${rep.id}/resolve`, root.cookie, { action: 'warned' })).status).toBe(409);
    const non = await makeAccount(srv, 'Not admin');
    expect((await get('/api/admin/reports', non.cookie)).status).toBe(403);
  });

  it('kick bans the account AND its network until the host lets them back in', async () => {
    const L = await lobbyWith(2);
    const victim = L.players[1]!;
    const vPid = victim.pid!;
    L.st.send('lobby:kick', { pid: vPid });
    await waitFor(() => victim.closeCode === CLOSE_CODES.kicked, 3000, 'kicked');
    expect((await getTicket(srv, L.accounts[1]!.cookie, L.lobby.id)).status).toBe(403);
    // a fresh account from the same network is refused too; another network is fine
    const alt = await makeAccount(srv, 'Alt account');
    const t = await api(srv, 'POST', `/api/lobbies/${L.lobby.id}/ticket`, { cookie: alt.cookie, body: { intent: 'player' }, headers: xff('198.51.100.11') });
    expect(t.status).toBe(403);
    const ok = await makeAccount(srv, 'Other net');
    await joinAs(ok, L.lobby.id, '198.51.100.99');
    const v = await L.st.view((x) => (x.removed ?? []).length === 1);
    expect(v.removed![0]!.displayName).toContain(L.accounts[1]!.account.displayName);
    expect(L.players[0]!.last('lobby:view')!.removed).toBeUndefined(); // host/ST only
    L.st.send('lobby:unban', { key: v.removed![0]!.key });
    await L.st.view((x) => !x.removed);
    expect((await api(srv, 'POST', `/api/lobbies/${L.lobby.id}/ticket`, { cookie: alt.cookie, body: { intent: 'player' }, headers: xff('198.51.100.11') })).status).toBe(200);
  });

  it('the Storyteller can remove a player during the game; the seat stays, the account cannot come back', async () => {
    const L = await lobbyWith(5);
    for (const p of L.players) p.send('lobby:ready', { ready: true });
    await L.st.view((v) => v.canStart);
    L.st.send('lobby:start', {});
    await Promise.all(L.players.map((p) => p.waitMsg('game:view')));
    const [p0, p1] = L.players as [TestClient, TestClient];
    p0.send('lobby:kick', { pid: p1.pid! });
    await p0.waitMsg('error', (e) => e.for === 'lobby:kick' && e.code === 'forbidden');
    L.st.send('lobby:kick', { pid: p1.pid! });
    await waitFor(() => p1.closeCode === CLOSE_CODES.kicked, 3000, 'kicked in game');
    const v = await L.st.view((x) => x.members.some((m) => m.pid === p1.pid && !m.connected));
    expect(v.members).toHaveLength(6);
    expect((await getTicket(srv, L.accounts[1]!.cookie, L.lobby.id, 'reconnect')).status).toBe(403);
  });
});

// (v2.3 settings registry) admin endpoints
describe('admin settings API', () => {
  it('admin-only; lists every group with metadata; sensitive values masked', async () => {
    const user = await makeAccount(srv, 'Plain user');
    expect((await api(srv, 'GET', '/api/admin/settings')).status).toBe(401);
    expect((await api(srv, 'GET', '/api/admin/settings', { cookie: user.cookie })).status).toBe(403);
    expect((await api(srv, 'POST', '/api/admin/settings/chat.defaultFilter', { cookie: user.cookie, body: { value: 'off' } })).status).toBe(403);
    const admin = await makeAdmin('Settings Root');
    const r = await api(srv, 'GET', '/api/admin/settings', { cookie: admin.cookie });
    expect(r.status).toBe(200);
    expect(r.body.groups.map((g: { id: string }) => g.id)).toEqual(['signups', 'sessions', 'abuse', 'voice', 'chat', 'browser']);
    const ids = (r.body.settings as { id: string }[]).map((s) => s.id);
    for (const id of ['signups.mode', 'signups.inviteCode', 'sessions.maxDays', 'admin.idleHours', 'host.socketFrameBurst', 'abuse.violationBurst', 'voice.enabled', 'voice.monthlyMinutes', 'voice.alertWebhook', 'chat.defaultFilter', 'reports.retentionDays', 'web.trustedTypes'])
      expect(ids).toContain(id);
    expect(r.body.settings.find((s: { id: string }) => s.id === 'signups.inviteCode').value).toBeNull();
  });

  it('a normal change applies live and is audited old -> new; bounds -> 400; unknown -> 404', async () => {
    const admin = await makeAdmin('Settings Live');
    const ok = await api(srv, 'POST', '/api/admin/settings/chat.defaultFilter', { cookie: admin.cookie, body: { value: 'strict' } });
    expect(ok.status).toBe(200);
    expect(ok.body.setting.value).toBe('strict');
    const L = await createLobby(srv, admin.cookie, { name: 'Strict by default' });
    expect(L.chatFilter).toBe('strict');
    expect(audit().some((a) => a.action === 'setting.change' && JSON.stringify(a.detail) === JSON.stringify({ id: 'chat.defaultFilter', from: 'slurs', to: 'strict' }))).toBe(true);
    expect((await api(srv, 'POST', '/api/admin/settings/chat.defaultFilter/reset', { cookie: admin.cookie, body: {} })).body.setting.value).toBe('slurs');
    expect((await api(srv, 'POST', '/api/admin/settings/reports.retentionDays', { cookie: admin.cookie, body: { value: 1 } })).status).toBe(400);
    expect((await api(srv, 'POST', '/api/admin/settings/no.such', { cookie: admin.cookie, body: { value: 1 } })).status).toBe(404);
    // a host limit (sec-host) applies to the module at once
    expect((await api(srv, 'POST', '/api/admin/settings/host.sseMaxPerAccount', { cookie: admin.cookie, body: { value: 5 } })).status).toBe(200);
    expect(getHostLimits().sseMaxPerAccount).toBe(5);
    await api(srv, 'POST', '/api/admin/settings/host.sseMaxPerAccount/reset', { cookie: admin.cookie, body: {} });
  });

  it('dangerous keys need a recent sign-in or the passphrase (reauth_required); Trusted Types toggles the CSP live', async () => {
    const admin = await makeAdmin('Settings Danger');
    // age the admin's session past the step-up window
    srv.services.database.sqlite.prepare('UPDATE sessions SET created_at = created_at - 3600000 WHERE account_id = ?').run(admin.account.id);
    const no = await api(srv, 'POST', '/api/admin/settings/web.trustedTypes', { cookie: admin.cookie, body: { value: false } });
    expect(no.status).toBe(401);
    expect(no.body.error).toBe('reauth_required');
    expect((await api(srv, 'POST', '/api/admin/settings/web.trustedTypes', { cookie: admin.cookie, body: { value: false, passphrase: 'wrong wrong wrong wrong' } })).status).toBe(401);
    const yes = await api(srv, 'POST', '/api/admin/settings/web.trustedTypes', { cookie: admin.cookie, body: { value: false, passphrase: admin.passphrase } });
    expect(yes.status).toBe(200);
    expect((await api(srv, 'GET', '/healthz')).headers.get('content-security-policy')).not.toContain('require-trusted-types-for');
    await api(srv, 'POST', '/api/admin/settings/web.trustedTypes/reset', { cookie: admin.cookie, body: { passphrase: admin.passphrase } });
    expect((await api(srv, 'GET', '/healthz')).headers.get('content-security-policy')).toContain("require-trusted-types-for 'script'");
    // sensitive: the webhook URL is validated, never echoed nor audited
    const hook = await api(srv, 'POST', '/api/admin/settings/voice.alertWebhook', { cookie: admin.cookie, body: { value: 'https://hooks.example.test/t0ken-abc', passphrase: admin.passphrase } });
    expect(hook.status).toBe(200);
    expect(JSON.stringify(hook.body)).not.toContain('t0ken-abc');
    expect(JSON.stringify(audit())).not.toContain('t0ken-abc');
    expect((await api(srv, 'POST', '/api/admin/settings/voice.alertWebhook', { cookie: admin.cookie, body: { value: 'http://plain.example.test', passphrase: admin.passphrase } })).status).toBe(400);
    await api(srv, 'POST', '/api/admin/settings/voice.alertWebhook/reset', { cookie: admin.cookie, body: { passphrase: admin.passphrase } });
  });
});
