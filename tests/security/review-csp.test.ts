// Security review (docs/security-review.md, SR-7): checks that the RECOMMENDED Content-Security-Policy
// does not break the built client. The server does not send a CSP yet; this test injects the
// candidate header into every response with Playwright routing, walks sign-up -> lobby -> town
// (Phaser, Colyseus WS, msgpack, zod), and fails on any CSP violation.
//
// Needs a built client (apps/client/dist: `pnpm -r run build`) and Playwright's Chromium; skipped
// otherwise. Server: 127.0.0.1:3360-3369 (security-review port range).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pickPort, REPO_ROOT, startServer, type TestServer } from '../support/server.js';

/** Candidate production CSP (keep in sync with docs/security-review.md SR-7). */
export const RECOMMENDED_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' wss://*.livekit.cloud https://*.livekit.cloud",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const DIST = path.join(REPO_ROOT, 'apps/client/dist');
const haveDist = existsSync(path.join(DIST, 'index.html'));

let server: TestServer;
let browser: Browser | null = null;

beforeAll(async () => {
  if (!haveDist) return;
  server = await startServer({ port: await pickPort(3360, 3369), env: { NODE_ENV: 'production', CLIENT_DIST: DIST } });
  try {
    // route.fulfill() strips the response's address space, which makes Chromium's Local Network
    // Access checks treat the page as public and block its ws://127.0.0.1 socket (test artefact).
    browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks'] });
  } catch {
    browser = null;
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop();
});

describe.skipIf(!haveDist)('SR-7: recommended CSP vs the built client', () => {
  it('sign-up -> lobby -> town renders with zero CSP violations', async (ctx) => {
    if (!browser) return ctx.skip();
    const context = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': '192.0.2.44' } });
    // CSP is enforced from the document response; streams (SSE) must not be buffered by route.fetch.
    await context.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': RECOMMENDED_CSP } });
    });
    await context.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber} ${e.sample}`);
      });
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(server.url + '/');
    await page.getByRole('button', { name: 'Create account' }).first().click();
    await page.getByLabel('Display name').fill('CSP Probe');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('I have saved my passphrase somewhere safe').check();
    await page.getByRole('button', { name: 'Enter the town' }).click();
    await page.getByRole('heading', { name: 'Lobby finder' }).waitFor();

    const created = await page.request.post(server.url + '/api/lobbies', { data: { name: 'CSP lobby', maxPlayers: 5 } });
    expect(created.status()).toBe(201);
    const id = ((await created.json()) as { lobby: { id: string } }).lobby.id;
    await page.goto(`${server.url}/lobby/${id}`);
    const canvas = await page
      .locator('canvas')
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!canvas) console.info(`[SR-7] no canvas; page text: ${(await page.locator('body').innerText()).slice(0, 400).replace(/\s+/g, ' ')}`);
    await page.waitForTimeout(4000); // let Phaser load textures/audio and the room stream snapshots

    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    const csp = consoleErrors.filter((e) => /Content Security Policy|Refused to/i.test(e));
    console.info(`[SR-7] violations=${JSON.stringify(violations)} cspConsole=${JSON.stringify(csp)} otherErrors=${JSON.stringify(consoleErrors.filter((e) => !csp.includes(e)).slice(0, 5))}`);
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
    // msgpackr and zod feature-detect eval with a guarded `try { new Function('') } catch {}` and fall
    // back to their interpreters, so 'script-src eval' reports from those probes are expected noise.
    expect(violations.filter((v) => !v.startsWith('script-src eval '))).toEqual([]);
    expect(csp).toEqual([]);
    expect(canvas).toBe(true);
  }, 90_000);
});
