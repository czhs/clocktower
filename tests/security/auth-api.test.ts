// Unauthenticated API access is denied (lobbies, SSE, tickets, admin, profile); sessions are
// revocable; cookie flags; brute-force rate limit; secrets never reach the server logs.
import { describe, expect, it } from 'vitest';
import { ApiClient } from '../support/http.js';
import { fakeClientIp, pending } from '../support/features.js';
import { startServer } from '../support/server.js';
import { suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const anon = () => new ApiClient(server.url, { 'X-Forwarded-For': fakeClientIp() });

const PROTECTED: [string, string, unknown?][] = [
  ['GET', '/api/me'],
  ['PATCH', '/api/me', { displayName: 'x' }],
  ['GET', '/api/me/stats'],
  ['GET', '/api/lobbies'],
  ['GET', '/api/lobbies/stream'],
  ['POST', '/api/lobbies', { name: 'Sneaky lobby', maxPlayers: 5 }],
  ['GET', '/api/lobbies/abcdefghij'],
  ['POST', '/api/lobbies/abcdefghij/ticket', { intent: 'player' }],
  ['GET', '/api/admin/status'],
];

describe.skipIf(!features.accounts)(`API authentication${pending(features.accounts, features.reasons.accounts)}`, () => {
  it.each(PROTECTED)('%s %s without a session -> 401', async (method, path, body) => {
    const r = await anon().req(method, path, body, path.endsWith('/stream') ? { signal: AbortSignal.timeout(3000) } : {});
    expect(r.status).toBe(401);
    expect(r.text).not.toMatch(/lobbies":\s*\[\s*\{/); // no lobby data in the error body
  });

  it.each(PROTECTED)('%s %s with a forged session cookie -> 401', async (method, path, body) => {
    const c = anon();
    c.cookies.set('ct_session_test', 'a'.repeat(64));
    c.cookies.set('ct_session', 'b'.repeat(64));
    const r = await c.req(method, path, body, path.endsWith('/stream') ? { signal: AbortSignal.timeout(3000) } : {});
    expect(r.status).toBe(401);
  });

  it('a signed-in non-admin gets 403 from /api/admin/status', async () => {
    const c = anon();
    expect((await c.createAccount(uniq('nonadmin'))).status).toBeLessThan(300);
    const r = await c.adminStatus();
    expect(r.status).toBe(403);
    expect(r.text).not.toContain('recentErrors');
  });

  it('session cookie is HttpOnly + SameSite and carries no account data', async () => {
    const res = await fetch(`${server.url}/api/auth/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fakeClientIp() },
      body: JSON.stringify({ displayName: 'cookie check' }),
    });
    const body = (await res.json()) as { account: { id: string }; passphrase: string };
    const sc = res.headers.getSetCookie().find((c) => c.startsWith('ct_session'));
    expect(sc, 'session cookie set').toBeTruthy();
    expect(sc!).toMatch(/;\s*HttpOnly/i);
    expect(sc!).toMatch(/;\s*SameSite=(Lax|Strict)/i);
    expect(sc!).toMatch(/;\s*Path=\//i);
    expect(sc!.startsWith('ct_session_test=')).toBe(true); // env-specific cookie name
    expect(sc!).not.toContain(body.account.id);
    expect(sc!).not.toContain(body.passphrase);
  });

  it('sign-out revokes the session server-side (replaying the old cookie fails)', async () => {
    const c = anon();
    await c.createAccount(uniq('signout'));
    const cookie = c.sessionCookie()!;
    expect((await c.me()).status).toBe(200);
    expect((await c.signOut()).status).toBe(200);
    const replay = anon();
    replay.cookies.set(cookie.name, cookie.value);
    expect((await replay.me()).status).toBe(401);
  });

  it('sign-in with a wrong passphrase fails and is rate-limited per IP', async () => {
    const ip = fakeClientIp();
    const c = new ApiClient(server.url, { 'X-Forwarded-For': ip });
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) statuses.push((await c.signIn(`wrong passphrase attempt number ${i}`)).status);
    expect(statuses.every((s) => s === 401 || s === 429)).toBe(true);
    expect(statuses).toContain(429);
    // another IP is not affected by this IP's limit
    const other = new ApiClient(server.url, { 'X-Forwarded-For': fakeClientIp() });
    expect((await other.signIn('another wrong passphrase here')).status).toBe(401);
  });

  it('passphrases, session tokens and tickets never appear in server logs', async () => {
    const c = anon();
    const created = await c.createAccount(uniq('logcheck'));
    const passphrase = created.body.passphrase;
    const token = c.sessionCookie()!.value;
    const c2 = anon();
    await c2.signIn(passphrase);
    const secrets = [passphrase, token, c2.sessionCookie()?.value ?? token, server.env.SESSION_SECRET!, server.env.PASSPHRASE_PEPPER!];
    if (features.lobbies) {
      const l = await c.createLobby({ name: uniq('Log lobby '), maxPlayers: 5 });
      const t = await c.ticket(l.body.lobby.id);
      secrets.push(t.body.ticket);
    }
    await new Promise((r) => setTimeout(r, 300));
    const logs = server.logs();
    for (const s of secrets) expect(logs.includes(s), 'secret found in logs').toBe(false);
  });

  it('with an https public origin the session cookie is Secure', async () => {
    const s2 = await startServer({ env: { APP_PUBLIC_ORIGIN: 'https://example.ts.net', COOKIE_SECURE: 'auto' } });
    try {
      const res = await fetch(`${s2.url}/api/auth/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'secure check' }),
      });
      const sc = res.headers.getSetCookie().find((c) => c.startsWith('ct_session'));
      expect(sc).toMatch(/;\s*Secure/i);
    } finally {
      await s2.stop();
    }
  });
});
