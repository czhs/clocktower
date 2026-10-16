// (v2.3 OPS-6, sec-ops) Waiting-room moderation in a real browser: the chat filter masks a slur
// before delivery (chat pane), the member row offers Report, the report dialog sends report:player
// and shows the server's acknowledgement. Screenshots: tests/e2e/artifacts/ops-moderation-*.png.
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { makeBots } from '../support/bot';

const ART = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'artifacts');

test('chat filter + report a player from the waiting room', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const url = baseURL!;
  const [host, troll] = await makeBots(2, 'Mod ', url, url.replace(/^http/, 'ws'));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': '10.97.3.4' } });
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.intro.seen', '1');
    localStorage.setItem('ct.hint.move.v1', '1');
    localStorage.setItem('ct.hint.social.v1', '1');
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const id = await host!.createLobby('Moderated', 15, true);
    await host!.join(id, 'storyteller');
    await troll!.join(id);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Reporter' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    await expect(page.getByText('Chat filter: Slurs hidden (default)')).toBeVisible();
    const row = page.locator('.ct-member', { hasText: troll!.name });
    await expect(row.getByRole('button', { name: 'Report' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Mute' })).toHaveCount(0); // not host / Storyteller

    troll!.send('chat:send', { text: 'you f4ggot' });
    if (!(await page.getByLabel('Chat message').isVisible())) await page.getByRole('button', { name: /^Open chat/ }).click();
    const line = page.locator('.ct-chat-msg', { hasText: troll!.name }).last();
    await expect(line).toBeVisible();
    await expect(line).not.toContainText('f4ggot');
    await page.screenshot({ path: path.join(ART, 'ops-moderation-waiting.png') });

    await row.getByRole('button', { name: 'Report' }).click();
    const dlg = page.getByRole('dialog', { name: `Report ${troll!.name}` });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('the last 1 chat line');
    await dlg.getByLabel('Why?').selectOption('hate');
    await dlg.getByLabel('Anything else? (optional)').fill('slur in the waiting room');
    await page.screenshot({ path: path.join(ART, 'ops-moderation-report.png') });
    await dlg.getByRole('button', { name: 'Send report' }).click();
    await expect(dlg.getByRole('status')).toContainText('Your report was sent');
    await dlg.getByRole('button', { name: 'Close' }).click();
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await Promise.all([host!.leave().catch(() => undefined), troll!.leave().catch(() => undefined)]);
  }
});
