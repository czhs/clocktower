// Photo-real cast member (brianbi, CastMember.hd): picked through the real waiting-room picker,
// rendered from the smoothed cast-hd texture outdoors, walking, indoors and as a ghost, with
// screenshots for review. One real browser + five lightweight room clients.
import { expect, test } from '@playwright/test';
import { townLayout } from '../../packages/assets/src/index';
import type { PlayerGameView } from '../../packages/protocol/src/index';
import { makeBots } from '../support/bot';
import { FrameTap, inject, installSocketTap, leaveByButton, tapCottage, type Player } from './helpers';

test('brianbi can be picked and is drawn from the HD sheet in town, indoors and as a ghost', async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  const url = baseURL!;
  const bots = await makeBots(5, 'HD ', url, url.replace(/^http/, 'ws'));
  const [st, ...others] = bots;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, extraHTTPHeaders: { 'X-Forwarded-For': '10.98.1.3' } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.intro.seen', '1');
    localStorage.setItem('ct.hint.move.v1', '1');
    localStorage.setItem('ct.hint.social.v1', '1');
    localStorage.setItem('ct.debug.fps', '30');
    localStorage.setItem('ct.debug.camera', '1');
    localStorage.setItem('ct.debug.social', '1');
    localStorage.setItem('ct.reducedMotion', '0');
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const hdRequests: string[] = [];
  page.on('response', (r) => r.url().includes('cast-hd') && r.ok() && hdRequests.push(r.url()));
  const tap = new FrameTap('Brian', page);
  const player: Player = { name: 'Brian', page, ctx, tap };
  try {
    const id = await st!.createLobby('HD cast', 15, true);
    await st!.join(id, 'storyteller');
    for (const bot of others) await bot.join(id);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Brian' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    const pid = await tap.until(() => tap.last('lobby:view')?.youPid as string | undefined);
    const me = () => tap.last('world:snapshot')?.entities.find((e: { id: string }) => e.id === pid) as { x: number; y: number; location: string } | undefined;
    const avatar = () => page.evaluate((id) => (window as any).__ctCamera.avatar(id) as { texture: string; frame: string; scale: number; width: number; height: number; x: number; y: number } | null, pid);
    await tap.until(() => me());

    // The real picker: brianbi is a villager tile, drawn smoothed from the HD sheet.
    await page.getByRole('button', { name: /Change character/ }).click();
    const tile = page.getByRole('radio', { name: /^brianbi/ });
    await tile.click();
    await tap.until(() => (tap.last('lobby:view')?.members as { pid: string; cosmetics: { preset?: string } }[] | undefined)?.find((m) => m.pid === pid)?.cosmetics.preset === 'brianbi');
    await expect(page.getByText('You are brianbi now.')).toBeVisible();
    await page.waitForTimeout(300);
    await page.locator('.ct-lobby-appearance').screenshot({ path: info.outputPath('picker.png') });
    await page.getByRole('button', { name: 'Done' }).click();
    const hide = page.getByRole('button', { name: 'Hide lobby details', exact: true });
    if (await hide.isVisible()) await hide.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: info.outputPath('town.png') });

    expect(await avatar()).toMatchObject({ texture: 'cast-hd', scale: 1, width: 32, height: 40 });

    // Regression: clicking the torso used to hit the person behind Brianbi because HD
    // texture scale (1/5) was incorrectly reused as the world-space interaction scale.
    const torso = await page.evaluate(() => {
      const cam = (window as any).__ctCamera, p = cam.me();
      return cam.worldToScreen(p.x, p.y - 18);
    });
    const clickAt = Date.now();
    await page.mouse.click(torso.x, torso.y, { button: 'right' });
    await expect.poll(() => tap.sent('social:emote', clickAt).at(-1)?.pid).toBe(pid);

    // Authored leg/arm poses advance while moving, then return to idle on release.
    await page.keyboard.down('ArrowRight');
    const frames = new Set<string>();
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(70);
      frames.add((await avatar())!.frame);
    }
    expect(frames.size).toBeGreaterThanOrEqual(3);
    expect([...frames].every((f) => /^brianbi\|right\|[1-4]$/.test(f))).toBe(true);
    await page.screenshot({ path: info.outputPath('walking.png') });
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => (await avatar())?.frame).toBe('brianbi|right|0');

    // Diagonal art uses the corresponding direction, including the repaired down-right.
    await page.keyboard.down('ArrowDown');
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await avatar())?.frame).toMatch(/^brianbi\|down-right\|[1-4]$/);
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('ArrowRight');

    // Reduced motion can be toggled while the scene is running.
    await page.evaluate(() => localStorage.setItem('ct.reducedMotion', '1'));
    await page.waitForTimeout(1100);
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await avatar())?.frame).toBe('brianbi|left|0');
    await page.keyboard.up('ArrowLeft');
    await page.evaluate(() => localStorage.setItem('ct.reducedMotion', '0'));

    // Approach the sweeper through real tap-to-walk input. It should turn away from
    // Brianbi while all townsfolk remain in their permanent home areas.
    const npcSpot = await page.evaluate(() => {
      const cam = (window as any).__ctCamera;
      const n = cam.npcs().find((n: any) => n.id === 'npc-sweeper');
      return cam.worldToScreen(n.home.x, n.home.y);
    });
    await page.mouse.click(npcSpot.x, npcSpot.y);
    await expect.poll(() => page.evaluate(() => (window as any).__ctCamera.npcs().some((n: any) => n.id === 'npc-sweeper' && n.avoiding)), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(1500);
    const wanderers = await page.evaluate(() => (window as any).__ctCamera.npcs() as { id: string; x: number; y: number; home: { x: number; y: number }; avoiding: boolean }[]);
    expect(wanderers).toHaveLength(4);
    for (const n of wanderers) expect(Math.hypot(n.x - n.home.x, n.y - n.home.y)).toBeLessThanOrEqual(48.01);
    await page.screenshot({ path: info.outputPath('npc-avoidance.png') });

    // Indoors (2/3 scale, close camera).
    const house = townLayout.buildings.find((b) => b.kind === 'house')!;
    await tapCottage(player, pid, house.id);
    await expect.poll(() => me()?.location).toBe(`bld:${house.id}`);
    await page.waitForTimeout(600);
    expect((await avatar())?.scale).toBeCloseTo(2 / 3);
    expect((await avatar())?.height).toBeCloseTo(40 * 2 / 3);
    await page.screenshot({ path: info.outputPath('indoors.png') });
    await leaveByButton(player, pid);

    // Dead: the HD ghost (with the ghost-vote halo).
    for (const bot of others) bot.send('lobby:ready', { ready: true });
    await inject(page, 'lobby:ready', { ready: true });
    await expect.poll(() => st!.lobbyView?.canStart).toBe(true);
    st!.send('lobby:start', {});
    await tap.until(() => tap.last('game:view')?.kind === 'player');
    st!.send('st:command', { type: 'random_setup' });
    st!.send('st:command', { type: 'force_phase', to: 'day' });
    await tap.until(() => tap.last('game:view')?.phase === 'day');
    const seat = (tap.last('game:view') as PlayerGameView).you.seat;
    st!.send('st:command', { type: 'kill', seat, announce: false });
    await tap.until(() => (tap.last('game:view') as PlayerGameView | undefined)?.players.find((p) => p.pid === pid)?.alive === false);
    await page.waitForTimeout(800);
    expect((await avatar())?.frame).toMatch(/^brianbi\/ghost\|.+\|0$/);
    await page.screenshot({ path: info.outputPath('ghost.png') });

    expect(hdRequests.some((u) => u.includes('.png'))).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await Promise.all(bots.map((bot) => bot.leave()));
  }
});
