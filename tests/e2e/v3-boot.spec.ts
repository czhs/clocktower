// v3 WP7 (v3-qa) — v3-boot (docs/v3/INTEGRATION.md §6.2): a player opens a v3 lobby with the 3D town forced on the
// host's SwiftShader. The canvas mounts under .ct-game-canvas, __ctCamera.v3().ready turns true, the GPU string is
// SwiftShader, __ctCamera me / view / worldToScreen answer per §1.5 / §6.1, and the page logs no console error, no CSP /
// Trusted Types violation and no vendor `[town] piece … failed` warning. Leaving the lobby removes the town and every
// debug hook it installed. Project `v3` only (scripts/v3/e2e.sh).
import { expect, test } from '@playwright/test';
import { makeBots } from '../support/bot';
import { FrameTap, selfEntity, setE2eWorld, townRenderer, v3Context, v3Info, v3Shot, waitV3Ready, watchConsole, watchV3Console } from './helpers';

test.beforeAll(() => setE2eWorld('v3'));
test.afterAll(() => setE2eWorld('v2'));

test('v3 boot: 3D town ready on SwiftShader, hooks answer, no errors / CSP violations / piece warnings', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const url = baseURL!;
  const [hostBot] = await makeBots(1, 'Boot ', url, url.replace(/^http/, 'ws'));
  const id = await hostBot!.createLobby('v3 boot', 15, true, { world: 'v3' });
  await hostBot!.join(id, 'storyteller');

  const ctx = await v3Context(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  const v3warn: string[] = [];
  watchConsole(page, 'boot', errors);
  watchV3Console(page, 'boot', v3warn);
  const tap = new FrameTap('boot', page);
  try {
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Booter' } })).ok()).toBe(true);
    const t0 = Date.now();
    await page.goto(`${url}/lobby/${id}`);
    const pid = await tap.until(() => tap.last('lobby:view')?.youPid as string | undefined, 30_000, 'lobby:view');
    expect(tap.last('lobby:view')?.world, 'lobby:view carries the world').toBe('v3');
    const info = await waitV3Ready(page, 240_000, 'boot');
    const readyMs = Date.now() - t0;
    test.info().annotations.push({ type: 'v3-ready-ms', description: String(readyMs) }, { type: 'v3-info', description: JSON.stringify(info) });
    expect(await townRenderer(page)).toBe('v3');
    await expect(page.locator('.ct-game-canvas canvas')).toHaveCount(1);
    expect(info.tier).toBe('low'); // ct.fxQuality = low (§1.2 row 9)
    expect(info.pixelScale).toBeGreaterThanOrEqual(1);
    expect(info.programs, 'programs reported').not.toBeNull();

    // __ctCamera me / view / worldToScreen (§6.1)
    await tap.until(() => selfEntity({ page, tap, name: 'boot', ctx }, pid), 30_000, 'own entity');
    const hooks = await page.evaluate(() => {
      const cam = (window as unknown as { __ctCamera: { me(): { x: number; y: number; location: string } | null; view(): { x: number; y: number; width: number; height: number; zoom: number }; worldToScreen(x: number, y: number, h?: number): { x: number; y: number } | null } }).__ctCamera;
      const me = cam.me();
      return { me, view: cam.view(), at: me ? cam.worldToScreen(me.x, me.y) : null, head: me ? cam.worldToScreen(me.x, me.y, 1.2) : null };
    });
    expect(hooks.me, '__ctCamera.me()').not.toBeNull();
    expect(hooks.me!.location).toBe('outdoors');
    expect(hooks.view.width).toBeGreaterThan(0);
    expect(hooks.view.zoom).toBeGreaterThan(0);
    const box = (await page.locator('.ct-game-canvas').boundingBox())!;
    expect(hooks.at, 'own feet project onto the canvas').not.toBeNull();
    expect(hooks.at!.x).toBeGreaterThan(box.x);
    expect(hooks.at!.x).toBeLessThan(box.x + box.width);
    expect(hooks.at!.y).toBeGreaterThan(box.y);
    expect(hooks.at!.y).toBeLessThan(box.y + box.height);
    expect(hooks.head!.y, 'a point 1.2 m up projects higher on screen').toBeLessThan(hooks.at!.y);

    // a few seconds of frames: still ready, still no errors
    await page.waitForTimeout(5000);
    expect((await v3Info(page))?.ready).toBe(true);
    await v3Shot(page, 'v3-boot.png');
    expect(errors, 'console errors / page errors').toEqual([]);
    expect(v3warn, 'CSP violations / [town] piece warnings').toEqual([]);

    // leaving the lobby in-app (no reload) unmounts the town and every hook it installed (§1.1 destroy())
    await page.getByRole('dialog', { name: 'Waiting room' }).getByRole('button', { name: 'Leave' }).click();
    await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    // (the finder itself draws small 2D canvases, e.g. portraits: only the town's mount point must be gone)
    expect(await page.evaluate(() => ({ cam: '__ctCamera' in window, pixel: '__pixel' in window, town: document.querySelectorAll('.ct-game-canvas canvas').length }))).toEqual({ cam: false, pixel: false, town: 0 });
  } finally {
    await ctx.close();
    await hostBot!.leave();
  }
});
