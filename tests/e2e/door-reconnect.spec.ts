// A reload must continue the server's movement sequence; otherwise doors see a stale position.
import { expect, test } from '@playwright/test';
import { townLayout } from '../../packages/assets/src/index';
import { tileCenterPx, type PlayerGameView } from '../../packages/protocol/src/index';
import { makeBots } from '../support/bot';
import { FrameTap, inject, installSocketTap } from './helpers';

test('after a reload, walking and clicking into houses use the current server position', async ({ browser, baseURL }) => {
  const url = baseURL!;
  const bots = await makeBots(5, 'Reconnect ', url, url.replace(/^http/, 'ws'));
  const [st, ...others] = bots;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': '10.98.1.5' } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    for (const key of ['ct.intro.seen', 'ct.hint.move.v1', 'ct.hint.social.v1']) localStorage.setItem(key, '1');
    localStorage.setItem('ct.debug.fps', '30');
  });
  const page = await ctx.newPage();
  const tap = new FrameTap('Returning walker', page);
  try {
    const id = await st!.createLobby('Doors after refresh', 15, true);
    await st!.join(id, 'storyteller');
    for (const bot of others) await bot.join(id);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Returning walker' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    const pid = await tap.until(() => tap.last('lobby:view')?.youPid as string | undefined);
    const me = () => tap.last('world:snapshot')?.entities.find((e: { id: string }) => e.id === pid) as { x: number; y: number; location: string } | undefined;
    await tap.until(() => me());
    for (const bot of others) bot.send('lobby:ready', { ready: true });
    await inject(page, 'lobby:ready', { ready: true });
    await expect.poll(() => st!.lobbyView?.canStart).toBe(true);
    st!.send('lobby:start', {});
    await tap.until(() => tap.last('game:view')?.kind === 'player');
    const seat = (tap.last('game:view') as PlayerGameView).you.seat;
    const house = townLayout.buildings.find((b) => b.houseIndex === 1)!;
    const door = tileCenterPx(townLayout, house.door);
    st!.send('st:command', { type: 'teleport', who: [seat], to: { kind: 'building', buildingId: house.id } });
    await expect(page.locator('.ct-inside-leave')).toBeVisible();
    await page.locator('.ct-inside-leave').click();
    await expect.poll(() => me()?.location).toBe('outdoors');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(450);
    await page.keyboard.up('ArrowDown');
    await expect.poll(() => me()!.y - door.y).toBeGreaterThan(35);
    await page.waitForTimeout(150);

    for (const mode of ['click', 'keyboard'] as const) {
      await test.step(`${mode} entry after refreshing a long-running session`, async () => {
        // Fast-forward the sequence at the current, accepted position to model minutes of play.
        const seq = (tap.last('world:snapshot')?.ackSeq ?? 0) + 1000;
        await inject(page, 'move', { seq, x: me()!.x, y: me()!.y, facing: 'down', moving: false });
        await expect.poll(() => tap.last('world:snapshot')?.ackSeq).toBe(seq);
        const reloadAt = Date.now();
        await page.reload();
        await tap.until(() => tap.received('world:snapshot', reloadAt).find((s) => s.ackSeq >= seq));
        await expect.poll(() => page.evaluate(() => (window as any).__ctCamera?.me()?.location)).toBe('outdoors');
        const hide = page.getByRole('button', { name: 'Hide lobby details', exact: true });
        if (await hide.isVisible()) await hide.click();
        const since = Date.now();
        if (mode === 'click') {
          const p = await page.evaluate(({ x, y }) => (window as any).__ctCamera.worldToScreen(x, y), door);
          await page.mouse.click(p.x, p.y);
        } else {
          await page.keyboard.down('ArrowUp');
        }
        try {
          await expect.poll(() => me()?.location, { timeout: 4000 }).toBe(`bld:${house.id}`);
        } finally {
          await page.keyboard.up('ArrowUp');
        }
        expect(tap.sent('move', since)[0]?.seq).toBeGreaterThan(seq);
        expect(tap.received('error', since).filter((e) => e.for === 'world:useDoor')).toEqual([]);
        await page.waitForTimeout(1000);
        await page.locator('.ct-inside-leave').click();
        await expect.poll(() => me()?.location).toBe('outdoors');
        await page.keyboard.down('ArrowDown');
        await page.waitForTimeout(450);
        await page.keyboard.up('ArrowDown');
        await expect.poll(() => me()!.y - door.y).toBeGreaterThan(35);
        await page.waitForTimeout(150);
      });
    }
  } finally {
    await ctx.close();
    await Promise.all(bots.map((bot) => bot.leave()));
  }
});
