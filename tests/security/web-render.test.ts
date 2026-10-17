// Security v2.3, area 5 (web client) — docs/security-v2.3/05-web-client.md (WEB-*), browser part.
// 1. Clickjacking: a cross-origin page (127.0.0.1:<ephemeral>) frames the app (127.0.0.1:3387); the
//    production headers (X-Frame-Options DENY + frame-ancestors 'none') must keep the app out.
// 2. Hostile user text (display name, lobby name, chat) renders as literal text in the real built
//    client: no injected elements/attributes, and document.title carries the literal lobby name.
//    The server's CSP would block inline handlers anyway, so this asserts on the DOM, not on a
//    side effect.
// 3. WEB-2 Trusted Types walk (see the last describe).
// Needs apps/client/dist and Playwright's Chromium; skipped otherwise. Run on the build host under
// `flock ~/clocktower/browser.lock`.
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../../apps/server/src/securityHeaders.js';
import { pickPort, REPO_ROOT, startServer, type TestServer } from '../support/server.js';

const DIST = path.join(REPO_ROOT, 'apps/client/dist');
const haveDist = existsSync(path.join(DIST, 'index.html'));

let server: TestServer;
let attacker: http.Server | null = null;
let attackerPort = 0;
let browser: Browser | null = null;

beforeAll(async () => {
  if (!haveDist) return;
  server = await startServer({ port: await pickPort(3387, 3387), env: { NODE_ENV: 'production', CLIENT_DIST: DIST } });
  attacker = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>attacker</title><iframe id="f" src="${server.url}/" width="800" height="600"></iframe>`);
  });
  await new Promise<void>((r) => attacker!.listen(0, '127.0.0.1', () => r())); // ephemeral: a different origin
  attackerPort = (attacker.address() as { port: number }).port;
  try {
    browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks'] });
  } catch {
    browser = null;
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise((r) => (attacker ? attacker.close(r) : r(undefined)));
  await server?.stop();
});

const NAME = '<svg/onload=__x=1>"\'&'; // 22 chars (display-name max 24)
const LOBBY = '<img src=x onerror=__x=2> \u202egro.live';
const CHAT = '<script>__x=3</script><img src=x onerror=__x=4><a href="javascript:__x=5">clk</a>';

describe.skipIf(!haveDist)('WEB-RENDER: built client in Chromium', () => {
  it('cannot be framed by another origin (clickjacking)', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await browser.newPage();
    const refused: string[] = [];
    page.on('console', (m) => {
      if (/Refused to (display|frame)/i.test(m.text())) refused.push(m.text());
    });
    await page.goto(`http://127.0.0.1:${attackerPort}/`);
    await page.waitForTimeout(2000);
    const frame = page.frames().find((f) => f !== page.mainFrame());
    let appRendered = false;
    try {
      appRendered = (await frame?.locator('#app').count()) === 1;
    } catch {
      appRendered = false;
    }
    console.info(`[WEB-RENDER clickjack] frameUrl=${frame?.url()} refused=${refused.length}`);
    await page.close();
    expect(appRendered).toBe(false);
  }, 60_000);

  it('hostile display name / lobby name / chat render as literal text', async (ctx) => {
    if (!browser) return ctx.skip();
    const context = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': '192.0.2.77' } });
    const page = await context.newPage();
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await page.goto(server.url + '/');
    await page.getByRole('button', { name: 'Create account' }).first().click();
    await page.getByLabel('Display name').fill(NAME);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('I have saved my passphrase somewhere safe').check();
    await page.getByRole('button', { name: 'Enter the town' }).click();
    await page.getByRole('heading', { name: 'Lobby finder' }).waitFor();

    const created = await page.request.post(server.url + '/api/lobbies', { data: { name: LOBBY, maxPlayers: 5 } });
    expect(created.status()).toBe(201);
    const lobby = ((await created.json()) as { lobby: { id: string; name: string } }).lobby;
    await page.goto(`${server.url}/lobby/${lobby.id}`);
    await page.getByLabel('Chat message').waitFor({ timeout: 20_000 }).catch(() => undefined);
    if (await page.getByLabel('Chat message').count()) {
      await page.getByLabel('Chat message').fill(CHAT);
      await page.getByLabel('Chat message').press('Enter');
      await page.waitForTimeout(1500);
    }

    const dom = await page.evaluate(() => ({
      x: (window as unknown as { __x?: number }).__x,
      title: document.title,
      body: document.body.innerText,
      injected: document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload], script:not([src]), a[href^="javascript:"]').length,
    }));
    console.info(`[WEB-RENDER text] title=${JSON.stringify(dom.title)} injected=${dom.injected} dialogs=${dialogs.length}`);
    await context.close();
    expect(dialogs).toEqual([]);
    expect(dom.x).toBeUndefined();
    expect(dom.injected).toBe(0);
    expect(dom.title).toContain(lobby.name); // literal (cleaned) text, not parsed
    expect(dom.body).toContain('<img src=x onerror=__x=2>');
    expect(dom.body).toContain('<script>__x=3</script>'); // the chat line, literal
    expect(dom.body).toContain('<svg/onload=__x=1>'); // own display name, literal
  }, 90_000);
});

// WEB-2: the same app with the CSP + Trusted Types header injected explicitly (independent of
// whether app.ts enables them), walked through sign-up -> finder -> waiting-room chat -> town -> /admin.
const TT_CSP = contentSecurityPolicy({ publicOrigin: 'http://127.0.0.1', livekitUrl: '', trustedTypes: true });

describe.skipIf(!haveDist)('WEB-2: Trusted Types vs the built client', () => {
  it('sign-up -> finder -> waiting room chat -> town -> admin page: zero CSP / Trusted Types violations', async (ctx) => {
    if (!browser) return ctx.skip();
    const context = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': '192.0.2.91' } });
    await context.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': TT_CSP } });
    });
    await context.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber} ${e.sample}`);
      });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    await page.goto(server.url + '/');
    await page.getByRole('button', { name: 'Create account' }).first().click();
    await page.getByLabel('Display name').fill('TT Probe');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('I have saved my passphrase somewhere safe').check();
    await page.getByRole('button', { name: 'Enter the town' }).click();
    await page.getByRole('heading', { name: 'Lobby finder' }).waitFor();

    const created = await page.request.post(server.url + '/api/lobbies', { data: { name: 'TT lobby', maxPlayers: 5 } });
    expect(created.status()).toBe(201);
    const id = ((await created.json()) as { lobby: { id: string } }).lobby.id;
    await page.goto(`${server.url}/lobby/${id}`);
    const chat = page.getByLabel('Chat message');
    if (await chat.waitFor({ timeout: 20_000 }).then(() => true, () => false)) {
      await chat.fill('hello <b>tt</b>');
      await chat.press('Enter');
    }
    const canvas = await page.locator('canvas').first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
    await page.waitForTimeout(4000); // textures, audio, room snapshots, lazy chunks
    const v1 = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

    await page.goto(server.url + '/admin');
    await page.waitForTimeout(1500);
    const v2 = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

    const violations = [...v1, ...v2];
    const cspConsole = errors.filter((e) => /Content Security Policy|Trusted ?Type|TrustedScript|TrustedHTML|Refused to/i.test(e));
    console.info(`[WEB-2] canvas=${canvas} violations=${JSON.stringify(violations)} cspConsole=${JSON.stringify(cspConsole)} other=${JSON.stringify(errors.filter((e) => !cspConsole.includes(e)).slice(0, 5))}`);
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
    // msgpackr feature-detects eval with a guarded try { new Function('') } (see review-csp): under
    // Trusted Types that empty-body probe is reported as a 'trusted-types-sink' Function violation
    // (and blocked, as script-src already does); it falls back to its interpreter. Anything else fails.
    const probe = (v: string) => v.startsWith('script-src eval ') || v.startsWith('eval ') || /^require-trusted-types-for trusted-types-sink \S+ Function\|\(\s*\)\s*\{\s*\}\)$/.test(v);
    expect(violations.filter((v) => !probe(v))).toEqual([]);
    expect(cspConsole.filter((e) => !/unsafe-eval|'eval'|EvalError|requires 'TrustedScript' assignment/i.test(e))).toEqual([]);
    expect(canvas).toBe(true);
  }, 120_000);
});
