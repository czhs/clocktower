// Real room occupancy -> public snapshot -> the actual Phaser sign text and its drawn bounds.
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
  type SignText = { text: string; visible: boolean; bounds: { x: number; y: number; width: number; height: number } };
  const signs = () => page.evaluate(() => (window as any).__ctCamera?.doorBoards()) as Promise<Record<string, SignText[]>>;
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
        // Each arrival must retain the earlier names; the fifth must not be hidden by an icon cap.
        for (let n = 1; n <= guests.length; n++) {
          st!.send('st:command', { type: 'teleport', who: [guests[n - 1]!.seat], to: { kind: 'building', buildingId: house.id } });
          const expected = guests.slice(0, n).map((p) => p.name).join('\n');
          await expect.poll(async () => (await signs())?.[house.id]?.at(-1)?.text).toBe(expected);
          const card = (await signs())[house.id]!.at(-1)!;
          const zoom = await page.evaluate(() => (window as any).__ctCamera.view().zoom);
          expect(card.visible).toBe(true);
          // A list whose lines overlap can contain every name yet only show the last one.
          expect(card.bounds.height * zoom).toBeGreaterThanOrEqual(n * 10);
        }
        await page.screenshot({ path: info.outputPath(`${house.id}-occupied.png`) });
        // Leave through the real door, then re-enter; it must not replace the other guests.
        const leaver = visitors.find((bot) => bot.pid === guests[1]!.pid)!;
        leaver.send('world:useDoor', { buildingId: house.id });
        await expect.poll(async () => (await signs())[house.id]?.at(-1)?.text).toBe(guests.filter((_, i) => i !== 1).map((p) => p.name).join('\n'));
        leaver.send('world:useDoor', { buildingId: house.id });
        await expect.poll(async () => (await signs())[house.id]?.at(-1)?.text).toBe(guests.map((p) => p.name).join('\n'));
        st!.send('st:command', { type: 'teleport', who: guests.map((p) => p.seat), to: { kind: 'square' } });
        await expect.poll(async () => (await signs())[house.id]?.map((t) => t.text)).toEqual([players.find((p) => p.seat === index)!.name]);
      });
    }

    // The same full roster remains readable next to a house on a phone.
    const house = townLayout.buildings.find((b) => b.houseIndex === 3)!;
    st!.send('st:command', { type: 'teleport', who: [...guests.map((p) => p.seat), reader.seat], to: { kind: 'building', buildingId: house.id } });
    await expect(page.locator('.ct-inside-leave')).toBeVisible();
    await page.locator('.ct-inside-leave').click();
    await expect(page.locator('.ct-inside-leave')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await signs())[house.id]?.at(-1)?.text).toBe(guests.map((p) => p.name).join('\n'));
    await page.waitForTimeout(500);
    const card = (await signs())[house.id]!.at(-1)!;
    const box = await page.evaluate(({ x, y, width, height }) => {
      const cam = (window as any).__ctCamera;
      return { ...cam.worldToScreen(x, y), width: width * cam.view().zoom, height: height * cam.view().zoom };
    }, card.bounds);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: info.outputPath('phone-house-sign.png') });

    // The roster still follows the server's public visibility rules.
    st!.send('st:command', { type: 'teleport_self', to: { kind: 'building', buildingId: house.id } });
    await expect.poll(() => st!.location).toBe(`bld:${house.id}`);
    expect((await signs())[house.id]!.at(-1)!.text).toBe(guests.map((p) => p.name).join('\n'));
    st!.send('st:command', { type: 'set_setting', settings: { doorTags: false } });
    await expect.poll(async () => (await signs())[house.id]?.length).toBe(1);
    st!.send('st:command', { type: 'set_setting', settings: { doorTags: true } });
    await expect.poll(async () => (await signs())[house.id]?.at(-1)?.text).toBe(guests.map((p) => p.name).join('\n'));
    st!.send('st:command', { type: 'random_setup' });
    st!.send('st:command', { type: 'force_phase', to: 'night' });
    await tap.until(() => tap.last('game:view')?.phase === 'first_night');
    await expect.poll(async () => Object.values(await signs()).flat().length).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await Promise.all(bots.map((bot) => bot.leave()));
  }
});
