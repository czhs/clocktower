// Real room occupancy -> public snapshot -> the actual Phaser door board and its drawn bounds.
// (v2.2.1 merge) Isaac's spec, adapted to v2.2's boards: occupants are character TOKENS (name on
// hover), at most MAX_ICONS (4) of them, then a "+N" badge; the owner's name is a separate callout.
// So "every occupant is kept" = the shown tokens + the badge count always add up to everyone inside.
import { expect, test } from '@playwright/test';
import { townLayout } from '../../packages/assets/src/index';
import type { PlayerGameView } from '../../packages/protocol/src/index';
import { makeBots } from '../support/bot';
import { FrameTap, inject, installSocketTap } from './helpers';

test('house signs keep every occupant as players enter and leave', async ({ browser, baseURL }, info) => {
  test.setTimeout(120_000);
  const url = baseURL!;
  // A full lobby: Storyteller, fourteen guests, and the outdoor reader as the fifteenth player.
  const bots = await makeBots(15, 'Visitor ', url, url.replace(/^http/, 'ws'));
  const [st, ...visitors] = bots;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': '10.98.1.4' } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    for (const key of ['ct.intro.seen', 'ct.hint.move.v1', 'ct.hint.social.v1']) localStorage.setItem(key, '1');
    localStorage.setItem('ct.debug.fps', '30');
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tap = new FrameTap('Sign reader', page);
  type Board = { tokens: string[]; badge: string | null; visible: boolean; rect: { x: number; y: number; w: number; h: number } };
  const signs = () => page.evaluate(() => (window as any).__ctCamera?.doorBoards()) as Promise<Record<string, Board>>;
  const MAX = 4;
  /** What a board must show for these occupants (server order = arrival order here). */
  const expectShown = (names: string[]) => ({ tokens: names.slice(0, MAX), badge: names.length > MAX ? `+${names.length - MAX}` : null });
  const shownOf = async (houseId: string) => {
    const b = (await signs())?.[houseId];
    return b ? { tokens: b.tokens, badge: b.badge } : null;
  };
  try {
    const id = await st!.createLobby('House signs', 15, true);
    await st!.join(id, 'storyteller');
    for (const bot of visitors) await bot.join(id);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Sign reader' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    await tap.until(() => tap.last('world:snapshot'));
    for (const bot of visitors) bot.send('lobby:ready', { ready: true });
    await inject(page, 'lobby:ready', { ready: true });
    await expect.poll(() => st!.lobbyView?.canStart).toBe(true);
    st!.send('lobby:start', {});
    await tap.until(() => tap.last('game:view')?.kind === 'player');
    const players = (tap.last('game:view') as PlayerGameView).players;
    const reader = (tap.last('game:view') as PlayerGameView).you;
    const guests = visitors.map((bot) => players.find((p) => p.pid === bot.pid)!).sort((a, b) => a.seat - b.seat);
    const hide = page.getByRole('button', { name: 'Hide lobby details', exact: true });
    if (await hide.isVisible()) await hide.click();

    for (const index of [1, 2, 3]) {
      const house = townLayout.buildings.find((b) => b.houseIndex === index)!;
      await test.step(house.name, async () => {
        st!.send('st:command', { type: 'teleport', who: [reader.seat], to: { kind: 'building', buildingId: house.id } });
        await expect(page.locator('.ct-inside-leave')).toBeVisible();
        await page.locator('.ct-inside-leave').click();
        await expect(page.locator('.ct-inside-leave')).toBeHidden();
        // Each arrival keeps the earlier ones: tokens for the first four, then "+N" for the rest.
        for (let n = 1; n <= guests.length; n++) {
          st!.send('st:command', { type: 'teleport', who: [guests[n - 1]!.seat], to: { kind: 'building', buildingId: house.id } });
          const names = guests.slice(0, n).map((p) => p.name);
          await expect.poll(() => shownOf(house.id)).toEqual(expectShown(names));
          const board = (await signs())[house.id]!;
          expect(board.visible).toBe(true);
          expect(board.tokens.length + (board.badge ? Number(board.badge.slice(1)) : 0)).toBe(n);
        }
        await page.screenshot({ path: info.outputPath(`${house.id}-occupied.png`) });
        // Leave through the real door, then re-enter: the count follows, nobody else is replaced.
        const leaver = visitors.find((bot) => bot.pid === guests[1]!.pid)!;
        leaver.send('world:useDoor', { buildingId: house.id });
        await expect.poll(async () => (await shownOf(house.id))?.badge).toBe(`+${guests.length - 1 - MAX}`);
        expect((await shownOf(house.id))!.tokens).not.toContain(guests[1]!.name);
        leaver.send('world:useDoor', { buildingId: house.id });
        await expect.poll(async () => (await shownOf(house.id))?.badge).toBe(`+${guests.length - MAX}`);
        st!.send('st:command', { type: 'teleport', who: guests.map((p) => p.seat), to: { kind: 'square' } });
        await expect.poll(() => shownOf(house.id)).toBeNull();
      });
    }

    // The same full roster remains readable next to a house on a phone.
    const house = townLayout.buildings.find((b) => b.houseIndex === 3)!;
    st!.send('st:command', { type: 'teleport', who: [...guests.map((p) => p.seat), reader.seat], to: { kind: 'building', buildingId: house.id } });
    await expect(page.locator('.ct-inside-leave')).toBeVisible();
    await page.locator('.ct-inside-leave').click();
    await expect(page.locator('.ct-inside-leave')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await shownOf(house.id))?.badge).toBe(`+${guests.length - MAX}`);
    await page.waitForTimeout(500);
    const card = (await signs())[house.id]!;
    const box = await page.evaluate(({ x, y, w, h }) => {
      const cam = (window as any).__ctCamera;
      return { ...cam.worldToScreen(x, y), width: w * cam.view().zoom, height: h * cam.view().zoom };
    }, card.rect);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: info.outputPath('phone-house-sign.png') });

    // The roster still follows the server's public visibility rules.
    st!.send('st:command', { type: 'teleport_self', to: { kind: 'building', buildingId: house.id } });
    await expect.poll(() => st!.location).toBe(`bld:${house.id}`);
    // the Storyteller is never on a board
    await page.waitForTimeout(500);
    expect((await shownOf(house.id))?.badge).toBe(`+${guests.length - MAX}`);
    st!.send('st:command', { type: 'set_setting', settings: { doorTags: false } });
    await expect.poll(() => shownOf(house.id)).toBeNull();
    st!.send('st:command', { type: 'set_setting', settings: { doorTags: true } });
    await expect.poll(async () => (await shownOf(house.id))?.badge).toBe(`+${guests.length - MAX}`);
    st!.send('st:command', { type: 'random_setup' });
    st!.send('st:command', { type: 'force_phase', to: 'night' });
    await tap.until(() => tap.last('game:view')?.phase === 'first_night');
    await expect.poll(async () => Object.keys(await signs()).length).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await Promise.all(bots.map((bot) => bot.leave()));
  }
});
