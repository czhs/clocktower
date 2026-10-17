// One real browser + five lightweight room clients: chat privacy, bubble lifetime, and walking
// around furniture inside a cottage. Uses the real HTTP/WS stack and the normal chat input.
// (v2.2.1 merge) Isaac's spec, adapted to the kept v2.2 bubbles (game/social/bubbles.ts + speech.ts):
// Phaser text, ONE bubble per speaker (a new message replaces it), lifetime scaled with length
// (SPEECH.minMs..maxMs). They are read through the opt-in camera debug hook (`__ctCamera.bubbles()`).
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
    localStorage.setItem('ct.debug.camera', '1');
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
    type Bubble = { pid: string; text: string; alpha: number; box: { x: number; y: number; width: number; height: number } };
    const bubbles = () => page.evaluate(() => ((window as any).__ctCamera?.bubbles?.() ?? []) as Bubble[]);
    const flat = (t: string) => t.replace(/\s+/g, ' ').trim();
    /** The bubble text over `who` (wrapped lines joined), or null when there is none. */
    const bubbleOf = async (who: string) => {
      const b = (await bubbles()).find((x) => x.pid === who);
      return b ? flat(b.text) : null;
    };
    const bubbleBox = async (who: string) => (await bubbles()).find((x) => x.pid === who)?.box ?? null;

    // A bubble appears over the speaker; a new message replaces it; it expires on its own.
    await say(page, 'Hello from the square!');
    await expect.poll(() => bubbleOf(pid)).toBe('Hello from the square!');
    await page.waitForTimeout(2000);
    expect(await bubbleOf(pid)).toBe('Hello from the square!');
    await say(page, 'A second thought.');
    await expect.poll(() => bubbleOf(pid)).toBe('A second thought.');
    expect((await bubbles()).filter((b) => b.pid === pid)).toHaveLength(1);
    await expect.poll(() => bubbleOf(pid), { timeout: 15_000 }).toBeNull();

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
    await expect.poll(() => bubbleOf(pid)).toBe(privateText); // drawn as text, never markup
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    await st!.waitFor<{ text: string }>('chat:message', (m) => m.text === privateText);
    await page.waitForTimeout(250);
    for (const bot of others) expect(bot.recorder.messages.some((m) => m.type === 'chat:message' && (m.payload as { text: string }).text === privateText)).toBe(false);
    // The Storyteller's messages are 'storyteller' scope: shown in the chat panel, never bubbled.
    st!.send('chat:send', { text: 'A private reply from your visitor.' });
    await tap.until(() => tap.received('chat:message').find((m: { text: string }) => m.text === 'A private reply from your visitor.'));
    await foldChat(page);
    await page.waitForTimeout(200);
    await page.screenshot({ path: info.outputPath('private-cottage.png') });
    expect(await bubbleOf(st!.pid!)).toBeNull();
    st!.send('world:useDoor', { buildingId: house.id });

    // Keys walk rather than immediately leaving; bubble tracks the actual rendered position.
    await say(page, 'Room to wander.');
    await foldChat(page);
    const before = { ...me()! };
    await expect.poll(() => bubbleOf(pid)).toBe('Room to wander.');
    const beforeBubble = (await bubbleBox(pid))!;
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(320);
    await page.keyboard.up('ArrowUp');
    await expect.poll(() => Math.hypot(me()!.x - before.x, me()!.y - before.y)).toBeGreaterThan(10);
    expect(me()!.location).toBe(`bld:${house.id}`);
    await expect.poll(async () => Math.abs((await bubbleBox(pid))!.y - beforeBubble.y)).toBeGreaterThan(10);

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
    await expect.poll(() => bubbleOf(pid)).toBe('A little cottage conversation, comfortably wrapped on a phone.');
    for (const b of await bubbles()) {
      expect(b.box.x).toBeGreaterThanOrEqual(0);
      expect(b.box.x + b.box.width).toBeLessThanOrEqual(390);
    }
    await page.screenshot({ path: info.outputPath('phone-cottage.png') });
    // (a 390 px DESKTOP window: the voice panel covers the Leave button there — back to full size)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(250);
    await page.locator('.ct-inside-leave').click();
    await expect.poll(() => me()?.location).toBe('outdoors');

    // Start a real game, then check the same privacy rule at night and after its result.
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
    await expect.poll(() => bubbleOf(pid)).toBe('Only my visitor should read this.');
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
