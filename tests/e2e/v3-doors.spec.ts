// v3 WP7 (v3-qa) — v3-doors (docs/v3/INTEGRATION.md §6.2, WP1 "Tests"): in a v3 lobby the 3D town's own avatar walks
// (real arrow keys, closed loop on the server position) to house-5, whose door is rotated (doorNormal (-0.839, 0.545)),
// pushes in along -doorNormal and is let in by the server (world:useDoor + a 'door' teleport); the 3D town then draws
// the room (__ctCamera.me().location, and WP3's stage().drawn when the member exists); the Leave button walks back out
// through the same door. Project `v3` only (scripts/v3/e2e.sh).
import { expect, test } from '@playwright/test';
import { makeBots } from '../support/bot';
import { FrameTap, leaveByButton, type Player, selfEntity, setE2eWorld, v3Context, v3Shot, waitV3Ready, walkIntoDoor, watchConsole } from './helpers';

test.beforeAll(() => setE2eWorld('v3'));
test.afterAll(() => setE2eWorld('v2'));

type Cam = { me(): { x: number; y: number; location: string } | null; stage?: () => { drawn?: string; doors?: { writes?: number } } };
const cam = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __ctCamera?: Cam }).__ctCamera;
    return { me: c?.me() ?? null, stage: c?.stage ? c.stage() : null };
  });

test('v3 doors: walk into the rotated door of house-5 and leave again', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const url = baseURL!;
  const [hostBot] = await makeBots(1, 'Doors ', url, url.replace(/^http/, 'ws'));
  const id = await hostBot!.createLobby('v3 doors', 15, true, { world: 'v3' });
  await hostBot!.join(id, 'storyteller');
  const ctx = await v3Context(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  watchConsole(page, 'doors', errors);
  const tap = new FrameTap('Door walker', page);
  const p: Player = { name: 'Door walker', page, ctx, tap };
  try {
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Door walker' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    const pid = await tap.until(() => tap.last('lobby:view')?.youPid as string | undefined, 30_000, 'lobby:view');
    await waitV3Ready(page, 240_000, 'doors');
    await tap.until(() => selfEntity(p, pid), 30_000, 'own entity');
    const hide = page.getByRole('button', { name: 'Hide lobby details', exact: true });
    if (await hide.isVisible().catch(() => false)) await hide.click();

    await walkIntoDoor(p, pid, 'house-5', 300_000);
    expect(selfEntity(p, pid)?.location).toBe('bld:house-5');
    const doorTp = tap.received('world:teleport').find((t: { location: string; reason: string }) => t.location === 'bld:house-5');
    expect(doorTp?.reason, 'entered through the door').toBe('door');
    expect(tap.sent('world:useDoor').some((m: { buildingId: string }) => m.buildingId === 'house-5')).toBe(true);
    await expect.poll(async () => (await cam(page)).me?.location, { timeout: 30_000, message: '3D town: own avatar inside' }).toBe('bld:house-5');
    const inside = await cam(page);
    if (inside.stage) expect(inside.stage.drawn, 'WP3 stage draws the room').toBe('bld:house-5');
    else test.info().annotations.push({ type: 'note', description: '__ctCamera.stage() not installed: drawn location not checked' });
    await v3Shot(page, 'house-5-inside.png');

    await leaveByButton(p, pid);
    await expect.poll(async () => (await cam(page)).me?.location, { timeout: 30_000 }).toBe('outdoors');
    const out = await cam(page);
    if (out.stage) expect(out.stage.drawn).toBe('outdoors');
    await v3Shot(page, 'house-5-outside.png');
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await hostBot!.leave();
  }
});
