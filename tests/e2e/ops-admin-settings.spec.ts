// (v2.3, sec-ops) Admin console "Security & limits", "Panic" and "Reports" in a real browser, desktop
// and phone. Runs its OWN server (127.0.0.1:3396, built client) because the shared e2e server has no
// admin. Screenshots: docs/screenshots/v23-admin-settings*.png.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { expect, test } from '@playwright/test';
import { REPO_ROOT, startServer, type TestServer } from '../support/server';

const SHOTS = path.join(REPO_ROOT, 'docs', 'screenshots');

test('admin settings registry UI (desktop + phone)', async ({ browser }) => {
  test.setTimeout(180_000);
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'ct-adm-e2e-'));
  // Same pepper across the restart (a new pepper would make the passphrase useless: OPS-3).
  const env = { CLIENT_DIST: path.join(REPO_ROOT, 'apps/client/dist'), VOICE_MONTHLY_MINUTES: '5000', PASSPHRASE_PEPPER: randomBytes(32).toString('hex'), SESSION_SECRET: randomBytes(32).toString('hex') };
  let srv: TestServer = await startServer({ mode: 'dist', port: 3396, dataDir, env });
  let ok = false;
  try {
    const made = await (await fetch(`${srv.url}/api/auth/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Night Admin' }) })).json();
    await srv.stop();
    srv = await startServer({ mode: 'dist', port: 3396, dataDir, env: { ...env, ADMIN_ACCOUNT_IDS: made.account.id, SESSION_MAX_DAYS: '60' } });
    for (const [label, viewport] of [
      ['', { width: 1280, height: 900 }],
      ['-phone', { width: 390, height: 844 }],
    ] as const) {
      const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { 'X-Forwarded-For': '10.96.1.1' } });
      await ctx.addInitScript(() => localStorage.setItem('ct.intro.seen', '1'));
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      expect((await page.request.post(`${srv.url}/api/auth/signin`, { data: { passphrase: made.passphrase } })).ok()).toBe(true);
      await page.goto(`${srv.url}/admin#settings`);
      await expect(page.getByRole('tab', { name: 'Security & limits' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByText('Sign-ups & accounts')).toBeVisible();
      // env-locked value shows the badge
      await expect(page.locator('.ct-set-row', { hasText: 'Longest a sign-in lasts' }).getByText(/locked by server config/)).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS, `v23-admin-settings${label}.png`), fullPage: label === '' });
      if (!label) {
        // a normal (non-dangerous) change applies and can be reset
        const row = page.locator('.ct-set-row', { hasText: 'Chat filter for new lobbies' });
        await row.locator('select').selectOption('strict');
        await row.getByRole('button', { name: 'Save' }).click();
        await expect(row.getByText(/Now strict/)).toBeVisible();
        await row.getByRole('button', { name: 'Reset to default' }).click();
        await expect(row.getByText(/Now slurs/)).toBeVisible();
        // a dangerous one asks for the passphrase
        const tt = page.locator('.ct-set-row', { hasText: 'Trusted Types (CSP)' });
        await tt.locator('input[type=checkbox]').click();
        await expect(page.getByRole('dialog')).toContainText('Confirm with your own passphrase');
        await page.screenshot({ path: path.join(SHOTS, 'v23-admin-settings-confirm.png') });
        await page.keyboard.press('Escape');
        await page.getByRole('tab', { name: 'Panic' }).click();
        await expect(page.getByRole('heading', { name: 'New accounts' })).toBeVisible();
        await page.screenshot({ path: path.join(SHOTS, 'v23-admin-panic.png'), fullPage: true });
        await page.getByRole('tab', { name: 'Reports' }).click();
        await expect(page.getByText('No open reports.')).toBeVisible();
      } else {
        await page.getByRole('tab', { name: 'Panic' }).click();
        await page.screenshot({ path: path.join(SHOTS, 'v23-admin-panic-phone.png') });
      }
      expect(errors).toEqual([]);
      await ctx.close();
    }
    ok = true;
  } finally {
    await srv.stop();
    expect(ok || true).toBe(true);
  }
});
