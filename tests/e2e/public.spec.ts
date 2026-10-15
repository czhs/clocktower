// Public endpoint, real Chromium (qa-deploy). Runs only with E2E_PUBLIC=1 (see playwright.config.ts).
// Creates exactly 2 accounts on PRODUCTION; run sparingly.
//
// Checks: HTTPS + secure context, getUserMedia availability, static assets, the session cookie flags,
// the WSS game connection (wss://<host>, lobby:view frames), lobby create/join via the share link,
// then (E2E_TUNNEL_RESTART=1, on hshi-u1 only) a tunnel restart with both players connected:
// do they reconnect to the same seat? Finally both leave.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Response } from '@playwright/test';
import { createAccount, type Player } from './helpers';

const ART = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts');
const suffix = Math.random().toString(36).slice(2, 6);
const notes: Record<string, unknown> = {};

/** Count via the page itself (the browser resolves through --host-resolver-rules; Node may not). */
const lobbyCount = (p: Page, id: string) =>
  p.evaluate(async (lid) => {
    const r = await fetch(`/api/lobbies/${lid}`);
    return r.ok ? ((await r.json()) as { lobby: { playerCount: number } }).lobby.playerCount : -r.status;
  }, id);

test.describe.serial('public endpoint (production)', () => {
  let alice: Player;
  let bob: Player;
  let lobbyId = '';
  const assetIssues: string[] = [];
  const assets: string[] = [];

  test.afterAll(async () => {
    console.log(`[public] ${JSON.stringify(notes)}`);
    await alice?.ctx.close();
    await bob?.ctx.close();
  });

  test('HTTPS, secure context, getUserMedia, static assets, cookie flags', async ({ browser, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    expect(origin.startsWith('https://')).toBe(true);
    alice = await createAccount(browser, `QA Alice ${suffix}`);
    const page = alice.page;
    page.on('response', (r: Response) => {
      const u = new URL(r.url());
      if (u.origin !== origin) return;
      if (u.pathname.startsWith('/assets/') || /\.(js|css|png|json|woff2?)$/.test(u.pathname)) assets.push(`${r.status()} ${u.pathname}`);
      if (r.status() >= 400 && !u.pathname.startsWith('/api/')) assetIssues.push(`${r.status()} ${u.pathname}`);
    });
    await page.reload(); // re-load with the response listener attached
    await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
    const env = await page.evaluate(() => ({
      href: location.href,
      secure: window.isSecureContext,
      gum: typeof navigator.mediaDevices?.getUserMedia === 'function',
      ws: 'WebSocket' in window,
    }));
    expect(env.href.startsWith('https://')).toBe(true);
    expect(env.secure, 'secure context (required for the microphone)').toBe(true);
    expect(env.gum, 'navigator.mediaDevices.getUserMedia available').toBe(true);
    const cookies = await alice.ctx.cookies(origin);
    const sess = cookies.find((c) => /^(__Host-)?ct_session/.test(c.name));
    expect(sess, 'session cookie').toBeTruthy();
    expect(sess!.name).toBe('__Host-ct_session'); // production cookie name (__Host-: Secure, Path=/, no Domain)
    expect(sess!.path).toBe('/');
    expect(sess!.domain.startsWith('.'), 'host-only cookie').toBe(false);
    expect(sess!.secure).toBe(true);
    expect(sess!.httpOnly).toBe(true);
    expect(sess!.sameSite).toBe('Lax');
    notes.cookie = { name: sess!.name, secure: sess!.secure, httpOnly: sess!.httpOnly, sameSite: sess!.sameSite, expiresInDays: Math.round((sess!.expires * 1000 - Date.now()) / 864e5) };
    expect(assets.length, 'static assets loaded').toBeGreaterThan(0);
    expect(assetIssues).toEqual([]);
    notes.assets = assets.slice(0, 12);
  });

  test('lobby over WSS: create, join via share link, both see each other', async ({ browser, baseURL }) => {
    const host = new URL(baseURL!).host;
    const wsUrls: string[] = [];
    alice.page.on('websocket', (ws) => wsUrls.push(ws.url()));
    await alice.page.getByRole('button', { name: /create lobby/i }).first().click();
    const dialog = alice.page.getByRole('dialog', { name: 'Create lobby' });
    await dialog.getByLabel('Lobby name').fill(`QA public check ${suffix}`);
    await dialog.getByLabel(/storyteller seat/i).check();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await alice.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
    lobbyId = alice.page.url().split('/lobby/')[1]!;
    const share = await alice.page.getByLabel('Share link').inputValue();
    expect(share).toBe(`https://${host}/lobby/${lobbyId}`);
    bob = await createAccount(browser, `QA Bob ${suffix}`);
    bob.page.on('websocket', (ws) => wsUrls.push(ws.url()));
    await bob.page.goto(new URL(share).pathname);
    const member = (p: Page, n: string) => p.getByRole('dialog', { name: 'Waiting room' }).locator('.ct-member-name', { hasText: n });
    await expect(member(alice.page, bob.name)).toBeVisible({ timeout: 20_000 });
    await expect(member(bob.page, alice.name)).toBeVisible();
    expect(wsUrls.length).toBeGreaterThan(0);
    for (const u of wsUrls) expect(u.startsWith(`wss://${host}/`), u).toBe(true);
    await alice.tap.until(() => alice.tap.last('lobby:view')?.members.length === 2, 10_000, 'lobby:view over WSS');
    expect(await lobbyCount(alice.page, lobbyId)).toBe(1); // Alice is Storyteller, Bob the player
    notes.wss = wsUrls.map((u) => u.replace(/\?.*/, '?…'));
    mkdirSync(ART, { recursive: true });
    await alice.page.screenshot({ path: path.join(ART, 'public-qa-waiting-room.png') });
  });

  test('tunnel restart with both players connected: same seats restored', async () => {
    test.skip(process.env.E2E_TUNNEL_RESTART !== '1', 'set E2E_TUNNEL_RESTART=1 (on hshi-u1, uses the sudo rule) to run');
    const pids = [alice.tap.last('lobby:view').youPid, bob.tap.last('lobby:view').youPid];
    const framesBefore = [alice.tap.frames.length, bob.tap.frames.length];
    const t0 = Date.now();
    execFileSync('sudo', ['-n', '/usr/bin/systemctl', 'restart', 'clocktower-tunnel.service']);
    notes.tunnelRestartCmdMs = Date.now() - t0;
    // Each page must get a fresh lobby:view (i.e. a new connection) with the same pid.
    const seen: Record<string, number> = {};
    for (const [i, p] of [alice, bob].entries()) {
      await p.tap.until(
        () => p.tap.frames.slice(framesBefore[i]).some((f) => f.dir === 'in' && f.type === 'lobby:view' && f.payload.youPid === pids[i] && f.at > t0),
        60_000,
        'fresh lobby:view with the same pid after the tunnel restart',
      );
      seen[p.name] = p.tap.frames.slice(framesBefore[i]).find((f) => f.type === 'lobby:view' && f.at > t0)!.at - t0;
    }
    notes.reconnectedAfterMs = seen;
    const status = await bob.page.evaluate(() => document.querySelector('.ct-waiting-head')?.textContent ?? '');
    notes.bobHeaderAfter = status.replace(/\s+/g, ' ').slice(0, 160);
    expect(await lobbyCount(alice.page, lobbyId)).toBe(1);
    await bob.page.screenshot({ path: path.join(ART, 'public-qa-after-tunnel-restart.png') });
  });

  test('both leave; the lobby empties', async () => {
    await bob.page.getByRole('dialog', { name: 'Waiting room' }).getByRole('button', { name: 'Leave', exact: true }).click();
    await alice.page.getByRole('dialog', { name: 'Waiting room' }).getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(alice.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
    await expect.poll(() => lobbyCount(alice.page, lobbyId), { timeout: 15_000 }).toBe(0);
    const list = await alice.page.evaluate(async () => (await (await fetch('/api/lobbies')).json()) as { lobbies: { id: string; playerCount: number; storytellerName: string | null }[] });
    notes.lobbyAfterLeave = list.lobbies.find((l) => l.id === lobbyId) ?? 'removed';
  });
});
