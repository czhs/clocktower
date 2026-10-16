// One real browser + five lightweight room clients: chat privacy, bubble lifetime, and walking
// around furniture inside a cottage. Uses the real HTTP/WS stack and the normal chat input.
import { expect, test, type Page } from '@playwright/test';
import { townLayout } from '../../packages/assets/src/index';
import { tileCenterPx, type PlayerGameView } from '../../packages/protocol/src/index';
import { makeBots } from '../support/bot';
import { FrameTap, inject, installSocketTap, tapCottage, type Player } from './helpers';

async function say(page: Page, text: string) {
  if (!(await page.getByLabel('Chat message').isVisible())) await page.getByRole('button', { name: /^Open chat/ }).click();
  await page.getByLabel('Chat message').fill(text);
  await page.locator('.ct-chat-form button').click();
}

async function foldChat(page: Page) {
  if (await page.getByRole('button', { name: 'Minimise chat' }).isVisible()) await page.getByRole('button', { name: 'Minimise chat' }).click();
}

test('speech bubbles follow indoor movement and keep room chat private in every phase', async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  const url = baseURL!;
  const bots = await makeBots(5, 'Chat ', url, url.replace(/^http/, 'ws'));
  const [st, ...others] = bots;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': '10.98.1.2' } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.intro.seen', '1');
    localStorage.setItem('ct.hint.move.v1', '1');
    localStorage.setItem('ct.hint.social.v1', '1');
    localStorage.setItem('ct.debug.fps', '30');
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tap = new FrameTap('Walker', page);
  const player: Player = { name: 'Walker', page, ctx, tap };
  try {
    const id = await st!.createLobby('Chat cottage', 15, true);
    await st!.join(id, 'storyteller');
    for (const bot of others) await bot.join(id);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Walker' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    const pid = await tap.until(() => tap.last('lobby:view')?.youPid as string | undefined);
    const me = () => tap.last('world:snapshot')?.entities.find((e: { id: string }) => e.id === pid) as { x: number; y: number; location: string } | undefined;
    await tap.until(() => me());
    const bubble = page.locator(`.ct-chat-bubble[data-pid="${pid}"]`);

    // Up to three messages; each expires five seconds after it was sent, independently.
    await say(page, 'Hello from the square!');
    await expect(bubble).toHaveText('Hello from the square!');
    await page.waitForTimeout(3500);
    await expect(bubble).toBeVisible();
    await say(page, 'A second thought.');
    await say(page, 'And a third.');
    await expect(bubble).toHaveText(['Hello from the square!', 'A second thought.', 'And a third.']);
    await page.waitForTimeout(1800);
    await expect(bubble).toHaveText(['A second thought.', 'And a third.']);
    await say(page, 'One more.');
    await say(page, 'Keep the newest three.');
    await expect(bubble).toHaveText(['And a third.', 'One more.', 'Keep the newest three.']);
    await expect(bubble).toHaveText(['One more.', 'Keep the newest three.'], { timeout: 4000 });
    await expect(bubble).toHaveCount(0, { timeout: 6000 });

    // Waiting-room cottages are private, including when LiveKit itself is not connected.
    await foldChat(page);
    const hide = page.getByRole('button', { name: 'Hide lobby details', exact: true });
    if (await hide.isVisible()) await hide.click();
    const house = townLayout.buildings.find((b) => b.kind === 'house')!;
    await tapCottage(player, pid, house.id);
    st!.send('st:command', { type: 'teleport_self', to: { kind: 'building', buildingId: house.id } });
    await tap.until(() => tap.last('world:snapshot')?.entities.some((e: { id: string }) => e.id === st!.pid));
    const privateText = '<img src=x onerror=alert(1)> A private word.';
    await say(page, privateText);
    await expect(bubble).toHaveText(privateText);
    await expect(bubble.locator('img')).toHaveCount(0);
    await st!.waitFor<{ text: string }>('chat:message', (m) => m.text === privateText);
    await page.waitForTimeout(250);
    for (const bot of others) expect(bot.recorder.messages.some((m) => m.type === 'chat:message' && (m.payload as { text: string }).text === privateText)).toBe(false);
    st!.send('chat:send', { text: 'A private reply from your visitor.' });
    const visitorBubble = page.locator(`.ct-chat-bubble-st[data-pid="${st!.pid}"]`);
    await expect(visitorBubble).toHaveText('A private reply from your visitor.');
    await foldChat(page);
    await page.waitForTimeout(200);
    await page.screenshot({ path: info.outputPath('private-cottage.png') });
    st!.send('world:useDoor', { buildingId: house.id });
    await expect(visitorBubble).toHaveCount(0);

    // Keys walk rather than immediately leaving; bubble tracks the actual rendered position.
    await say(page, 'Room to wander.');
    await foldChat(page);
    const before = { ...me()! };
    const walkingBubble = bubble.filter({ hasText: 'Room to wander.' });
    const beforeBubble = (await walkingBubble.boundingBox())!;
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(320);
    await page.keyboard.up('ArrowUp');
    await expect.poll(() => Math.hypot(me()!.x - before.x, me()!.y - before.y)).toBeGreaterThan(10);
    expect(me()!.location).toBe(`bld:${house.id}`);
    await expect.poll(async () => Math.abs((await walkingBubble.boundingBox())!.y - beforeBubble.y)).toBeGreaterThan(10);

    // A floor click follows a collision-safe path, and works at phone camera sizes too.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const target = tileCenterPx(townLayout, { x: house.interiorDoor.x - 1, y: house.interiorDoor.y - 1 });
    const point = await page.evaluate(({ x, y }) => (window as any).__ctCamera.worldToScreen(x, y - 6), target);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => Math.hypot(me()!.x - target.x, me()!.y - target.y), { timeout: 10_000 }).toBeLessThan(5);
    await say(page, 'A little cottage conversation, comfortably wrapped on a phone.');
    await foldChat(page);
    await page.waitForTimeout(200);
    for (const el of await bubble.all()) {
      const box = (await el.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    await page.screenshot({ path: info.outputPath('phone-cottage.png') });
    await page.locator('.ct-inside-leave').click();
    await expect.poll(() => me()?.location).toBe('outdoors');
    await expect(bubble).toHaveCount(0);

    // Start a real game, then check the same privacy rule at night and after its result.
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const bot of others) bot.send('lobby:ready', { ready: true });
    await inject(page, 'lobby:ready', { ready: true });
    await expect.poll(() => st!.lobbyView?.canStart).toBe(true);
    st!.send('lobby:start', {});
    await tap.until(() => tap.last('game:view')?.kind === 'player');
    st!.send('st:command', { type: 'random_setup' });
    st!.send('st:command', { type: 'force_phase', to: 'night' });
    await tap.until(() => tap.last('game:view')?.phase === 'first_night');
    const seat = (tap.last('game:view') as PlayerGameView).you.seat;
    const home = townLayout.buildings.find((b) => b.houseIndex === seat)!;
    st!.send('st:command', { type: 'teleport_self', to: { kind: 'building', buildingId: home.id } });
    await tap.until(() => tap.last('world:snapshot')?.entities.some((e: { id: string }) => e.id === st!.pid));
    await page.waitForTimeout(800);
    await say(page, 'Only my visitor should read this.');
    await expect(bubble.last()).toBeVisible();
    await st!.waitFor<{ text: string }>('chat:message', (m) => m.text === 'Only my visitor should read this.');
    await page.keyboard.press('Escape');
    expect(me()!.location).toBe(`bld:${home.id}`);
    st!.send('st:command', { type: 'declare_winner', winner: 'good', reason: 'Preview complete' });
    await tap.until(() => tap.last('game:view')?.phase === 'finished');
    await say(page, 'Still private after the game.');
    await st!.waitFor<{ text: string }>('chat:message', (m) => m.text === 'Still private after the game.');
    await page.waitForTimeout(250);
    for (const bot of others) {
      const text = JSON.stringify(bot.recorder.messages.filter((m) => m.type === 'chat:message'));
      expect(text).not.toContain('Only my visitor');
      expect(text).not.toContain('Still private');
    }
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await Promise.all(bots.map((bot) => bot.leave()));
  }
});
