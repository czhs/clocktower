// v3 WP7 (v3-qa) — v3-mixed (docs/v3/INTEGRATION.md §6.2, §9.3 "Mixed renderers in one lobby"): ONE v3 lobby, one
// Classic client (Graphics = Classic 2D) and one 3D client (v3force). Both walk with the real keyboard and stop; each
// draws the other at the server's position: Classic's __ctCamera.avatar(pid3d) and the 3D town's
// __ctCamera.avatar(pidClassic) (x/y = world px feet, §6.1) both match the walker's own server snapshot within 3 px,
// in the same location. Project `v3` only (scripts/v3/e2e.sh).
import { expect, test, type Page } from '@playwright/test';
import { makeBots } from '../support/bot';
import { classicTown, FrameTap, type Player, requireV3Hooks, selfEntity, setE2eWorld, settle, townRenderer, v3Context, v3Shot, waitV3Ready, watchConsole } from './helpers';

test.beforeAll(() => setE2eWorld('v3'));
test.afterAll(() => setE2eWorld('v2'));

const avatarOf = (page: Page, pid: string) =>
  page.evaluate((who) => ((window as unknown as { __ctCamera?: { avatar?: (p: string) => { x: number; y: number; texture: string } | null } }).__ctCamera?.avatar?.(who) ?? null), pid);

test('v3 mixed: a Classic and a 3D client in one v3 lobby see each other at the same px', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const url = baseURL!;
  const [st] = await makeBots(1, 'Mixed ', url, url.replace(/^http/, 'ws'));
  const id = await st!.createLobby('v3 mixed', 15, true, { world: 'v3' });
  await st!.join(id, 'storyteller');
  const errors: string[] = [];
  const open = async (name: string, classic: boolean): Promise<Player & { pid: string }> => {
    const ctx = await v3Context(browser, classic ? { force: false, extra: { 'ct.graphics': 'classic' } } : {});
    const page = await ctx.newPage();
    watchConsole(page, name, errors);
    const tap = new FrameTap(name, page);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: name } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    const pid = await tap.until(() => tap.last('lobby:view')?.youPid as string | undefined, 30_000, `${name}: lobby:view`);
    return { name, ctx, page, tap, pid };
  };
  const flat = await open('Flatlander', true);
  const deep = await open('Deepseer', false);
  try {
    await expect.poll(() => townRenderer(flat.page), { timeout: 60_000, message: 'Classic client mounted Classic' }).toBe('classic');
    expect(await classicTown(flat.page)).toMatchObject({ world: 'v3' });
    await waitV3Ready(deep.page, 240_000, 'Deepseer');
    await requireV3Hooks(deep.page, 'WP2 avatars', ['avatar']);
    for (const p of [flat, deep]) {
      const hide = p.page.getByRole('button', { name: 'Hide lobby details', exact: true });
      if (await hide.isVisible().catch(() => false)) await hide.click();
      await p.tap.until(() => selfEntity(p, p.pid), 30_000, `${p.name}: own entity`);
    }
    // each walks a little (real keyboard), in different directions, then stops
    const walk = async (p: Player, key: string, ms: number) => {
      await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await p.page.keyboard.down(key);
      await p.page.waitForTimeout(ms);
      await p.page.keyboard.up(key);
    };
    await walk(flat, 'ArrowLeft', 700);
    await walk(deep, 'ArrowRight', 700);
    const fpos = await settle(flat, flat.pid, 1500);
    const dpos = await settle(deep, deep.pid, 1500);
    expect(fpos.location).toBe('outdoors');
    expect(dpos.location).toBe('outdoors');
    expect(Math.hypot(fpos.x - dpos.x, fpos.y - dpos.y), 'they walked apart').toBeGreaterThan(20);

    // the 3D client draws the Classic walker where the server has them, and vice versa
    const close = async (viewer: Player, who: { pid: string; name: string }, at: { x: number; y: number }) => {
      let last: unknown = null;
      await expect
        .poll(
          async () => {
            const a = await avatarOf(viewer.page, who.pid);
            last = a;
            return a ? Math.hypot(a.x - at.x, a.y - at.y) : Infinity;
          },
          { timeout: 30_000, message: `${viewer.name} draws ${who.name} at the server px ${at.x},${at.y} (last avatar ${JSON.stringify(last)})` },
        )
        .toBeLessThanOrEqual(3);
      return last as { texture: string };
    };
    const seenBy3d = await close(deep, flat, fpos);
    const seenByClassic = await close(flat, deep, dpos);
    expect(seenBy3d.texture, '3D avatar texture key (§6.1)').toMatch(/^v3(-billboard)?:/);
    expect(seenByClassic.texture).not.toMatch(/^v3/);
    // and their own positions agree with the server too
    for (const [p, pos] of [
      [flat, fpos],
      [deep, dpos],
    ] as const) {
      const me = await p.page.evaluate(() => (window as unknown as { __ctCamera: { me(): { x: number; y: number } | null } }).__ctCamera.me());
      expect(Math.hypot(me!.x - pos.x, me!.y - pos.y), `${p.name}: own avatar at the server px`).toBeLessThanOrEqual(3);
    }
    await v3Shot(deep.page, 'mixed-3d.png');
    await v3Shot(flat.page, 'mixed-classic.png');
    expect(errors).toEqual([]);
  } finally {
    await flat.ctx.close();
    await deep.ctx.close();
    await st!.leave();
  }
});
