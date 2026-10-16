import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHARACTER_PRESETS, PLAYABLE, PLAYABLE_IDS } from '@ct/assets';
import { DEFAULT_COSMETICS } from '@ct/protocol';
import { api, startTestServer, type TestServer } from '../src/rooms/testkit.js';
import { generatePassphrase, normalizePassphrase, PASSPHRASE_ENTROPY_BITS, PASSPHRASE_WORDS } from '../src/auth/passphrase.js';
import { EFF_LARGE_WORDLIST } from '../src/auth/effWordlist.js';
import { RateLimiter } from '../src/auth/rateLimit.js';

const PORT = 3333;
let srv: TestServer;

beforeAll(async () => {
  srv = await startTestServer(PORT, {
    scryptN: undefined, // production cost
    rateLimits: { signIn: { capacity: 3, refillPerSec: 0.001 }, createAccount: { capacity: 3, refillPerSec: 0.001 } },
  });
});
afterAll(async () => {
  await srv?.close();
});

let ipCounter = 1;
const freshIp = () => ({ 'x-forwarded-for': `10.1.0.${ipCounter++}` });

function cookieOf(res: { headers: Headers }): { raw: string; pair: string } {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${srv.services.config.cookieName}=`));
  if (!raw) throw new Error('no session cookie');
  return { raw, pair: raw.split(';')[0]! };
}

async function create(name = 'Alice') {
  const res = await api(srv, 'POST', '/api/auth/create', { body: { displayName: name }, headers: freshIp() });
  expect(res.status).toBe(201);
  return { res, cookie: cookieOf(res), passphrase: res.body.passphrase as string, account: res.body.account };
}

describe('passphrases', () => {
  it('uses the full EFF large list and >= 77 bits of entropy', () => {
    expect(EFF_LARGE_WORDLIST.length).toBe(7776);
    expect(new Set(EFF_LARGE_WORDLIST).size).toBe(7776);
    expect(PASSPHRASE_WORDS).toBe(6);
    expect(PASSPHRASE_ENTROPY_BITS).toBeGreaterThan(77.5);
    const p = generatePassphrase();
    const words = p.split(' ');
    expect(words).toHaveLength(6);
    for (const w of words) expect(EFF_LARGE_WORDLIST).toContain(w);
    const many = new Set(Array.from({ length: 200 }, () => generatePassphrase()));
    expect(many.size).toBe(200);
  });

  it('normalises case, whitespace and separators', () => {
    expect(normalizePassphrase('  Abacus  YO-YO\tchef\n')).toBe('abacus-yo-yo-chef');
    expect(normalizePassphrase('abacus yo yo chef')).toBe('abacus-yo-yo-chef');
  });

  it('token bucket refills over time', () => {
    const rl = new RateLimiter({ capacity: 2, refillPerSec: 1 });
    expect(rl.take('k', 0)).toBe(true);
    expect(rl.take('k', 0)).toBe(true);
    expect(rl.take('k', 0)).toBe(false);
    expect(rl.retryAfterSec('k', 0)).toBe(1);
    expect(rl.take('k', 1000)).toBe(true);
  });
});

describe('auth HTTP', () => {
  it('create account: returns the passphrase once and sets a hardened session cookie', async () => {
    const { res, cookie, passphrase, account } = await create('  Alice‮  ');
    expect(passphrase.split(' ')).toHaveLength(6);
    expect(account.displayName).toBe('Alice');
    expect(account.isAdmin).toBe(false);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(cookie.raw).toMatch(/^ct_session_test=[A-Za-z0-9_-]{43}; /);
    expect(cookie.raw).toContain('HttpOnly');
    expect(cookie.raw).toContain('SameSite=Lax');
    expect(cookie.raw).toContain('Secure'); // https public origin => Secure
    expect(cookie.raw).toContain('Path=/');
    expect(cookie.raw).toContain(`Max-Age=${30 * 86400}`);
    const me = await api(srv, 'GET', '/api/me', { cookie: cookie.pair });
    expect(me.status).toBe(200);
    // v2: a new account starts as a random playable roster character
    expect(me.body).toMatchObject({ id: account.id, displayName: 'Alice', cosmetics: { ...DEFAULT_COSMETICS, preset: expect.any(String) } });
    expect(PLAYABLE_IDS.has(me.body.cosmetics.preset)).toBe(true);
  });

  it('stores no plaintext passphrase or session token, and never logs them', async () => {
    const { cookie, passphrase, account } = await create('Bob');
    const token = cookie.pair.split('=')[1]!;
    const sqlite = srv.services.database.sqlite;
    const dump = JSON.stringify([
      sqlite.prepare('SELECT * FROM accounts').all(),
      sqlite.prepare('SELECT * FROM sessions').all(),
    ]);
    expect(dump).not.toContain(passphrase);
    expect(dump).not.toContain(normalizePassphrase(passphrase));
    for (const w of passphrase.split(' ')) expect(dump).not.toMatch(new RegExp(`"${w}"`));
    expect(dump).not.toContain(token);
    const row = sqlite.prepare('SELECT * FROM sessions WHERE account_id = ?').get(account.id) as { token_hash: string };
    expect(row.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    const acc = sqlite.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id) as Record<string, string>;
    expect(acc.passphrase_verifier).toMatch(/^scrypt\$32768\$8\$1\$[0-9a-f]{64}$/);
    expect(acc.passphrase_lookup).toMatch(/^[0-9a-f]{64}$/);
    // sign in once so the sign-in path is also covered by the log scan
    await api(srv, 'POST', '/api/auth/signin', { body: { passphrase }, headers: freshIp() });
    const logs = srv.log.lines.join('\n');
    expect(logs).not.toContain(passphrase);
    expect(logs).not.toContain(normalizePassphrase(passphrase));
    expect(logs).not.toContain(token);
  });

  it('sign out clears the cookie and revokes the session', async () => {
    const { cookie } = await create('Carol');
    const out = await api(srv, 'POST', '/api/auth/signout', { cookie: cookie.pair, body: {} });
    expect(out.status).toBe(200);
    expect(cookieOf(out).raw).toContain('Max-Age=0');
    expect((await api(srv, 'GET', '/api/me', { cookie: cookie.pair })).status).toBe(401);
  });

  it('sign in accepts the passphrase in any case / separator form; wrong passphrase is 401', async () => {
    const { passphrase, account } = await create('Dave');
    const variant = '  ' + passphrase.toUpperCase().split(' ').join(' - ') + ' ';
    const ok = await api(srv, 'POST', '/api/auth/signin', { body: { passphrase: variant }, headers: freshIp() });
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(account.id);
    const me = await api(srv, 'GET', '/api/me', { cookie: cookieOf(ok).pair });
    expect(me.body.id).toBe(account.id);
    const words = passphrase.split(' ');
    words[5] = words[5] === 'abacus' ? 'zoom' : 'abacus';
    const bad = await api(srv, 'POST', '/api/auth/signin', { body: { passphrase: words.join(' ') }, headers: freshIp() });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: 'unauthenticated', message: expect.any(String) });
    expect(bad.headers.getSetCookie()).toEqual([]);
  });

  it('rate-limits sign-in per client IP (X-Forwarded-For from loopback proxy)', async () => {
    const ip = { 'x-forwarded-for': '203.0.113.7' };
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await api(srv, 'POST', '/api/auth/signin', { body: { passphrase: 'not a real passphrase here' }, headers: ip });
      statuses.push(r.status);
      if (r.status === 429) {
        expect(r.body.error).toBe('rate_limited');
        expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
      }
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    // A different client is unaffected.
    const other = await api(srv, 'POST', '/api/auth/signin', { body: { passphrase: 'not a real passphrase here' }, headers: freshIp() });
    expect(other.status).toBe(401);
  });

  it('rate-limits account creation per IP', async () => {
    const ip = { 'x-forwarded-for': '203.0.113.8' };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await api(srv, 'POST', '/api/auth/create', { body: { displayName: 'Spam' }, headers: ip })).status);
    expect(statuses).toEqual([201, 201, 201, 429]);
  });

  it('mutation hardening: JSON content type and same-origin only', async () => {
    const { cookie } = await create('Erin');
    const form = await api(srv, 'PATCH', '/api/me', {
      cookie: cookie.pair,
      raw: 'displayName=x',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(form.status).toBe(415);
    const evil = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: { displayName: 'Hacked' }, headers: { origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    const pub = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: { displayName: 'Erin2' }, headers: { origin: 'https://clocktower.example.test' } });
    expect(pub.status).toBe(200);
    const own = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: { displayName: 'Erin3' }, headers: { origin: `http://127.0.0.1:${PORT}` } });
    expect(own.status).toBe(200);
    const malformed = await api(srv, 'POST', '/api/auth/signin', { raw: '{"passphrase":', headers: { 'content-type': 'application/json', ...freshIp() } });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('bad_request');
  });

  it('validates bodies with the protocol schemas', async () => {
    const long = await api(srv, 'POST', '/api/auth/create', { body: { displayName: 'x'.repeat(25) }, headers: freshIp() });
    expect(long.status).toBe(400);
    const empty = await api(srv, 'POST', '/api/auth/create', { body: { displayName: ' ​ ' }, headers: freshIp() });
    expect(empty.status).toBe(400);
    const short = await api(srv, 'POST', '/api/auth/signin', { body: { passphrase: 'short' }, headers: freshIp() });
    expect(short.status).toBe(400);
    const { cookie } = await create('Fay');
    const badCos = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: { cosmetics: { ...DEFAULT_COSMETICS, hair: 'mohawk' } } });
    expect(badCos.status).toBe(400);
    const emptyPatch = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: {} });
    expect(emptyPatch.status).toBe(400);
  });

  it('v2 roster: only playable characters can be chosen (no custom / legacy / storyteller / NPC ids)', async () => {
    const { cookie } = await create('Hal');
    const legacy = CHARACTER_PRESETS.map((p) => p.id).find((id) => !PLAYABLE_IDS.has(id));
    for (const preset of [null, undefined, 'storyteller', 'npc-sweeper', 'not-a-character', ...(legacy ? [legacy] : [])]) {
      const r = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: { cosmetics: { ...DEFAULT_COSMETICS, ...(preset === undefined ? {} : { preset }) } } });
      expect(r.status, String(preset)).toBe(400);
    }
    for (const c of PLAYABLE) {
      const r = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: { cosmetics: { ...DEFAULT_COSMETICS, preset: c.id } } });
      expect(r.status, c.id).toBe(200);
    }
    // a name-only update still works without touching the character
    const named = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: { displayName: 'Hal 2' } });
    expect(named.status).toBe(200);
    expect(named.body.cosmetics.preset).toBe(PLAYABLE.at(-1)!.id);
  });

  it('profile update and stats', async () => {
    const { cookie } = await create('Gus');
    const cos = { ...DEFAULT_COSMETICS, preset: PLAYABLE[1]!.id, outfit: 'noble' as const, accessory: 'lantern' as const };
    const upd = await api(srv, 'PATCH', '/api/me', { cookie: cookie.pair, body: { displayName: '<b>Gus</b>', cosmetics: cos } });
    expect(upd.status).toBe(200);
    expect(upd.body.displayName).toBe('<b>Gus</b>'); // stored verbatim; UI escapes on render
    expect(upd.body.cosmetics).toEqual(cos);
    const stats = await api(srv, 'GET', '/api/me/stats', { cookie: cookie.pair });
    expect(stats.status).toBe(200);
    expect(stats.body).toMatchObject({ matchesPlayed: 0, wins: 0, roleHistory: [] });
  });

  it('(v2.2 stats) GET /api/me/stats: auth required, own record only, abandoned games are not wins/losses', async () => {
    expect((await api(srv, 'GET', '/api/me/stats')).status).toBe(401);
    expect((await api(srv, 'GET', '/api/me/stats', { cookie: 'ct_session_test=garbage' })).status).toBe(401);
    const me = await create('Statler');
    const other = await create('Waldorf');
    const empty = await api(srv, 'GET', '/api/me/stats', { cookie: me.cookie.pair });
    expect(empty.status).toBe(200);
    expect(empty.headers.get('cache-control')).toBe('no-store');
    expect(empty.body).toMatchObject({ matchesPlayed: 0, winRate: null, recentGames: [], topCharacters: [], favouriteAvatar: null, gamesAbandoned: 0 });

    const ids = { me: me.account.id as string, other: other.account.id as string };
    const stats = srv.services.stats;
    const players = (winner: 'good' | 'evil') => [
      { accountId: ids.me, seat: 0, startingCharacter: 'empath', finalCharacter: 'empath', alignment: 'good' as const, won: winner === 'good', alive: true, executed: false, died: false, nominations: 1, ghostVoteUsed: false },
      { accountId: ids.other, seat: 1, startingCharacter: 'imp', finalCharacter: 'imp', alignment: 'evil' as const, won: winner === 'evil', alive: false, executed: true, died: true, nominations: 0, ghostVoteUsed: false },
    ];
    const base = { lobbyId: 'L-stats', script: 'trouble-brewing', storytellerAccountId: null, reason: 'r' };
    for (const [i, winner] of (['good', 'evil'] as const).entries()) {
      const matchId = `st-m${i}`;
      stats.recordMatchStarted({ ...base, matchId, startedAt: 1000 + i, players: players(winner).map((p) => ({ accountId: p.accountId, seat: p.seat, avatarId: p.seat === 0 ? PLAYABLE[0]!.id : PLAYABLE[1]!.id })) });
      stats.recordMatchFinished({ ...base, matchId, startedAt: 1000 + i, endedAt: 2000 + i, winner, players: players(winner) });
    }
    // Abandoned: the other account told it; I am the Drunk (told I am the Chef).
    stats.recordMatchStarted({ ...base, matchId: 'st-m2', startedAt: 3000, storytellerAccountId: ids.other, players: [{ accountId: ids.me, seat: 0, avatarId: PLAYABLE[0]!.id }] });
    srv.services.database.sqlite
      .prepare(`INSERT INTO match_records (match_id, lobby_id, version, status, started_at, ended_at, winner, player_count, storyteller_account_id, record_json) VALUES ('st-m2', 'L-stats', 1, 'abandoned', 3000, 4000, NULL, 1, ?, ?)`)
      .run(ids.other, JSON.stringify({ lobby: { name: 'Muppet Theatre' }, storyteller: { accountId: ids.other, displayName: 'Waldorf' }, seats: [{ accountId: ids.me, avatarId: PLAYABLE[0]!.id, finalCharacter: 'drunk', finalAlignment: 'good', finalBelievedCharacter: 'chef' }] }));

    const mine = (await api(srv, 'GET', '/api/me/stats', { cookie: me.cookie.pair })).body;
    expect(mine).toMatchObject({ wins: 1, losses: 1, winRate: 0.5, gamesAbandoned: 1, goodGames: 2, currentWinStreak: 0, bestWinStreak: 1, favouriteAvatar: { avatarId: PLAYABLE[0]!.id, games: 3 } });
    expect(mine.topCharacters).toEqual([{ character: 'empath', games: 2, wins: 1 }]);
    expect(mine.recentGames.map((g: { matchId: string; result: string }) => [g.matchId, g.result])).toEqual([['st-m2', 'abandoned'], ['st-m1', 'lost'], ['st-m0', 'won']]);
    expect(mine.recentGames[0]).toMatchObject({ lobbyName: 'Muppet Theatre', character: 'chef', as: 'player', winner: null });
    // Nothing about the other account: no id, no name, no character, no avatar.
    const text = JSON.stringify(mine);
    for (const leak of [ids.other, 'Waldorf', 'imp', 'drunk', PLAYABLE[1]!.id]) expect(text).not.toContain(leak);

    const theirs = (await api(srv, 'GET', '/api/me/stats', { cookie: other.cookie.pair })).body;
    expect(theirs).toMatchObject({ wins: 1, losses: 1, evilGames: 2, currentWinStreak: 1, gamesAbandoned: 0 });
    expect(theirs.recentGames[0]).toMatchObject({ matchId: 'st-m2', as: 'storyteller', result: 'abandoned', character: null, avatarId: null });
    expect(JSON.stringify(theirs)).not.toContain(ids.me);
    expect(JSON.stringify(theirs)).not.toContain('chef');
    // The account id in the query/body is ignored: the session decides whose record it is.
    const spoof = (await api(srv, 'GET', `/api/me/stats?accountId=${ids.other}`, { cookie: me.cookie.pair })).body;
    expect(spoof.recentGames[0].as).toBe('player');
  });

  it('expired sessions are rejected', async () => {
    const { cookie, account } = await create('Hal');
    srv.services.database.sqlite.prepare('UPDATE sessions SET expires_at = 1 WHERE account_id = ?').run(account.id);
    expect((await api(srv, 'GET', '/api/me', { cookie: cookie.pair })).status).toBe(401);
    expect((await api(srv, 'GET', '/api/me', { cookie: 'ct_session_test=garbage' })).status).toBe(401);
    expect((await api(srv, 'GET', '/api/me')).status).toBe(401);
  });

  it('sliding expiry: a stale session is extended and the cookie re-issued', async () => {
    const { cookie, account } = await create('Ivy');
    const sqlite = srv.services.database.sqlite;
    sqlite.prepare('UPDATE sessions SET last_used_at = 0, expires_at = ? WHERE account_id = ?').run(Date.now() + 1000, account.id);
    const me = await api(srv, 'GET', '/api/me', { cookie: cookie.pair });
    expect(me.status).toBe(200);
    expect(cookieOf(me).raw).toContain('Max-Age=2592000');
    const row = sqlite.prepare('SELECT expires_at FROM sessions WHERE account_id = ?').get(account.id) as { expires_at: number };
    expect(row.expires_at).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('admin status is only available to ADMIN_ACCOUNT_IDS', async () => {
    const { cookie, account } = await create('Root');
    expect((await api(srv, 'GET', '/api/admin/status')).status).toBe(401);
    expect((await api(srv, 'GET', '/api/admin/status', { cookie: cookie.pair })).status).toBe(403);
    (srv.services.config.adminAccountIds as Set<string>).add(account.id);
    const ok = await api(srv, 'GET', '/api/admin/status', { cookie: cookie.pair });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      env: 'test',
      lobbies: [],
      voice: { configured: false, monthlyLimit: 5000, level: 'ok' },
      memory: { rssMb: expect.any(Number) },
      cpu: { cores: expect.any(Number) },
    });
    expect((await api(srv, 'GET', '/api/me', { cookie: cookie.pair })).body.isAdmin).toBe(true);
  });

  it('unknown API routes are JSON 404s', async () => {
    const r = await api(srv, 'GET', '/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });
});
