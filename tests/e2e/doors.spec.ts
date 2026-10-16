// Exercise real keyboard door entry with a slightly off-centre feet position.
import { expect, test } from '@playwright/test';
import { townLayout } from '../../packages/assets/src/index';
import { tileCenterPx, type PlayerGameView } from '../../packages/protocol/src/index';
import { makeBots } from '../support/bot';
import { FrameTap, inject, installSocketTap } from './helpers';

test('Wychwood, Weaver and Ravenscroft accept off-centre walking approaches', async ({ browser, baseURL }, info) => {
  test.setTimeout(120_000);
  const url = baseURL!;
  const bots = await makeBots(5, 'Door ', url, url.replace(/^http/, 'ws'));
  const [st, ...others] = bots;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': '10.98.1.3' } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.intro.seen', '1');
    localStorage.setItem('ct.hint.move.v1', '1');
    localStorage.setItem('ct.hint.social.v1', '1');
    localStorage.setItem('ct.debug.fps', '30');
  });
  const page = await ctx.newPage();
  const tap = new FrameTap('Door walker', page);
  try {
    const id = await st!.createLobby('Door approaches', 15, true);
    await st!.join(id, 'storyteller');
    for (const bot of others) await bot.join(id);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Door walker' } })).ok()).toBe(true);
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
    const since = Date.now();
    for (const index of [1, 2, 3]) {
      const house = townLayout.buildings.find((b) => b.houseIndex === index)!;
      const door = tileCenterPx(townLayout, house.door);
      for (const offset of [0, -10, 10]) {
        await test.step(`${house.name}, ${offset}px from centre`, async () => {
          // Leave puts us exactly on the doorstep. This avoids the seat-dependent spread of
          // stage point teleports, and Ravenscroft's fountain farther down the approach.
          st!.send('st:command', { type: 'teleport', who: [seat], to: { kind: 'building', buildingId: house.id } });
          await expect.poll(() => me()?.location).toBe(`bld:${house.id}`);
          await page.waitForTimeout(1000);
          await page.locator('.ct-inside-leave').click();
          await expect.poll(() => me()?.location).toBe('outdoors');
          await expect.poll(() => me()?.x).toBeCloseTo(door.x, 0);
          await page.waitForTimeout(700);
          if (offset) {
            await page.evaluate(async ({ x, offset }) => {
              const code = offset < 0 ? 'ArrowLeft' : 'ArrowRight';
              window.dispatchEvent(new KeyboardEvent('keydown', { key: code, code, bubbles: true }));
              try {
                for (let i = 0; i < 90; i++) {
                  await new Promise(requestAnimationFrame);
                  if (Math.abs((window as any).__ctCamera.me().x - x) >= Math.abs(offset) - 0.5) break;
                }
              } finally {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: code, code, bubbles: true }));
              }
            }, { x: door.x, offset });
            await expect.poll(() => Math.abs(me()!.x - door.x)).toBeGreaterThanOrEqual(9);
            expect(Math.abs(me()!.x - door.x)).toBeLessThan(16);
          }
          await page.keyboard.down('ArrowUp');
          await page.waitForTimeout(500);
          await page.keyboard.up('ArrowUp');
          await expect.poll(() => me()?.location, { timeout: 2000, message: `${house.name}: approach ${offset}px; feet ${JSON.stringify(me())}` }).toBe(`bld:${house.id}`);
        });
      }
    }
    // A tap straight after leaving must wait out the anti-bounce cooldown, not disappear.
    await page.waitForTimeout(1000);
    await page.locator('.ct-inside-leave').click();
    await expect.poll(() => me()?.location).toBe('outdoors');
    const lastHouse = townLayout.buildings.find((b) => b.houseIndex === 3)!;
    const door = tileCenterPx(townLayout, lastHouse.door);
    const point = await page.evaluate(({ x, y }) => (window as any).__ctCamera.worldToScreen(x, y), door);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => me()?.location, { timeout: 3000 }).toBe(`bld:${lastHouse.id}`);
    expect(tap.received('error', since).filter((e) => e.for === 'world:useDoor')).toEqual([]);
    await page.screenshot({ path: info.outputPath('ravenscroft-interior.png') });
  } finally {
    await ctx.close();
    await Promise.all(bots.map((bot) => bot.leave()));
  }
});
