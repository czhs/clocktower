// (v2.3 chat/ux) The chat panel in a real browser: the "who reads me" bar (square vs inside a
// cottage, live), lines said elsewhere tagged, Enter keeps focus for the next line, a burst over
// the rate limit is queued with a countdown and still delivered (nothing dropped, nothing retyped),
// the Crier tab re-reads announcements, and the phone sheet. Screenshots: docs/screenshots/v23-chat-*.png.
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { townLayout } from '../../packages/assets/src/index';
import { makeBots } from '../support/bot';
import { FrameTap, inject, installSocketTap, tapCottage, type Player } from './helpers';

const SHOTS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/screenshots');

test('chat scope bar, burst sending, crier log and phone sheet', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const url = baseURL!;
  const bots = await makeBots(5, 'Chat ', url, url.replace(/^http/, 'ws'));
  const [st, ...others] = bots;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': '10.98.2.3' } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.intro.seen', '1');
    localStorage.setItem('ct.hint.move.v1', '1');
    localStorage.setItem('ct.hint.social.v1', '1');
    localStorage.setItem('ct.debug.fps', '30');
    localStorage.setItem('ct.debug.camera', '1');
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tap = new FrameTap('Walker', page);
  const player: Player = { name: 'Walker', page, ctx, tap };
  const input = page.getByLabel('Chat message');
  const bar = page.locator('.ct-chat-scope-bar');
  const openChat = async () => {
    if (!(await input.isVisible())) await page.getByRole('button', { name: /^Open chat/ }).click();
  };
  try {
    const id = await st!.createLobby('Chat scope', 15, true);
    await st!.join(id, 'storyteller');
    for (const bot of others) await bot.join(id);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Walker' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    const pid = await tap.until(() => tap.last('lobby:view')?.youPid as string | undefined);
    await tap.until(() => tap.last('world:snapshot')?.entities.find((e: { id: string }) => e.id === pid));
    const hide = page.getByRole('button', { name: 'Hide lobby details', exact: true });
    if (await hide.isVisible()) await hide.click();

    // 1. Square: everyone outside reads it; Enter sends and keeps the input focused for the next line.
    await openChat();
    await expect(bar).toContainText('Town square');
    await expect(bar).toContainText('everyone outside');
    others[0]!.send('chat:send', { text: 'Morning, all!' });
    await expect(page.locator('.ct-chat-msg', { hasText: 'Morning, all!' })).toBeVisible();
    await input.fill('Hello square');
    await input.press('Enter');
    await expect(page.locator('.ct-chat-msg:not(.ct-chat-out)', { hasText: 'Hello square' })).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Chat message');
    await page.screenshot({ path: path.join(SHOTS, 'v23-chat-square.png') });

    // 2. A burst over the server budget (4 + 2/s): queued with a hint, then ALL delivered in order.
    for (let i = 1; i <= 7; i++) {
      await input.fill(`burst line ${i}`);
      await input.press('Enter');
    }
    await expect(page.locator('.ct-chat-hint')).toContainText(/Slow down/);
    await expect(input).toHaveValue('');
    await page.screenshot({ path: path.join(SHOTS, 'v23-chat-ratelimit.png') });
    await expect(page.locator('.ct-chat-out')).toHaveCount(0, { timeout: 15_000 });
    for (let i = 1; i <= 7; i++) await expect(page.locator('.ct-chat-msg', { hasText: `burst line ${i}` })).toHaveCount(1);
    // the same line twice within 10 s stays in the box with a hint (the server would drop it)
    await input.fill('burst line 7');
    await input.press('Enter');
    await expect(page.locator('.ct-chat-hint')).toContainText('You just said that');
    await expect(input).toHaveValue('burst line 7');
    await input.fill('');
    const rateErrors = tap.received('error').filter((e: { for?: string; code?: string }) => e.for === 'chat:send' && e.code === 'rate_limited');
    expect(rateErrors).toEqual([]); // the client mirror never over-sends

    // 3. Into a cottage: the bar switches live; earlier square lines are tagged.
    await page.getByRole('button', { name: 'Minimise chat' }).click();
    const house = townLayout.buildings.find((b) => b.kind === 'house')!;
    await tapCottage(player, pid, house.id);
    st!.send('st:command', { type: 'teleport_self', to: { kind: 'building', buildingId: house.id } });
    await tap.until(() => tap.last('world:snapshot')?.entities.some((e: { id: string }) => e.id === st!.pid));
    await page.keyboard.press('t'); // T opens the chat with the input focused
    await expect(input).toBeFocused();
    await expect(bar).toContainText(`Inside ${house.name}`);
    await expect(bar).toContainText('2 here');
    await expect(page.locator('.ct-chat-msg', { hasText: 'Morning, all!' }).locator('.ct-chat-where')).toHaveText('(square)');
    st!.send('chat:send', { text: 'Only this room hears us.' });
    await expect(page.locator('.ct-chat-storyteller', { hasText: 'Only this room hears us.' })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'v23-chat-house.png') });
    await page.keyboard.press('Escape');

    // 4. Game: announcements land in the Crier tab (re-readable), distinct from chat.
    for (const bot of others) bot.send('lobby:ready', { ready: true });
    await inject(page, 'lobby:ready', { ready: true });
    await expect.poll(() => st!.lobbyView?.canStart).toBe(true);
    st!.send('lobby:start', {});
    await tap.until(() => tap.last('game:view')?.kind === 'player');
    st!.send('st:command', { type: 'random_setup' });
    st!.send('st:command', { type: 'announce', text: 'Welcome to Ravenswood Bluff. Mind the bell.' });
    st!.send('st:command', { type: 'force_phase', to: 'night' });
    await tap.until(() => tap.last('game:view')?.phase === 'first_night');
    await openChat();
    await page.getByRole('tab', { name: /Crier/ }).click();
    await expect(page.locator('.ct-crier-list')).toContainText('Welcome to Ravenswood Bluff');
    await expect(page.locator('.ct-crier-list')).toContainText('first night');
    await page.screenshot({ path: path.join(SHOTS, 'v23-chat-crier.png') });
    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(bar).toContainText('Your home');

    // 5. Phone: bottom sheet, scope bar and input visible.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await openChat();
    await expect(bar).toBeVisible();
    await expect(input).toBeInViewport();
    await page.screenshot({ path: path.join(SHOTS, 'v23-chat-phone.png') });
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await Promise.all(bots.map((bot) => bot.leave()));
  }
});
