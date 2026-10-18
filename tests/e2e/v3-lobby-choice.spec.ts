// v3 WP7 (v3-qa) — the user's BINDING acceptance for the per-lobby town choice (docs/v3/INTEGRATION.md §9.1 "User
// decisions": "create one lobby of each world from the UI and verify the choice sticks").
//
//   1. Two hosts create one Classic (v2) and one Hollowmere (v3) lobby FROM THE UI (finder → Create lobby → "Town").
//      Each lobby's world badge shows in the waiting room, in the lobby list of a third player and in the public
//      lobby summary. The dialog does NOT remember a pick (WP6: DEFAULT_WORLD is the only pre-selection, Q7 / C3):
//      the next create dialog pre-selects Classic again, and nothing is stored under ct.create.world.
//   2. The join preview (share link /lobby/:id while it connects) names the lobby and shows its badge.
//   3. Each lobby renders the right town: the v2 lobby is drawn by Classic on the v2 map (even with the v3 force flag:
//      chooseRenderer row 1), the v3 lobby by the 3D town (v3force, SwiftShader), and a Classic client in the v3 lobby
//      draws the v3 map (tests/v3/worlds.ts layoutOf: v2 and v3 sizes).
//
// Project `v3` (scripts/v3/e2e.sh). Test 1 needs only WP6's form; test 2 needs the lead's one-line LobbyRoute wiring
// of ui/lobby/JoinPreview.tsx (CONTRACT-REQUEST); test 3 needs the 3D town to mount in a lobby (C1).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { layoutOf } from '../v3/worlds';
import { apiSignIn, classicTown, createLobbyViaUI, townRenderer, v3Context, waitingRoomWorld, waitV3Ready, watchConsole } from './helpers';

const lsGet = (page: Page, k: string) => page.evaluate((key) => localStorage.getItem(key), k);

// (independent tests: each makes its own lobbies, so a pending one does not hide the others)

let ctxs: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(ctxs.map((c) => c.close().catch(() => undefined)));
  ctxs = [];
});

async function host(browser: import('@playwright/test').Browser, name: string, opts: { force?: boolean; extra?: Record<string, string> } = {}) {
  const ctx = await v3Context(browser, { viewport: { width: 1280, height: 800 }, ...opts });
  ctxs.push(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  watchConsole(page, name, errors);
  await apiSignIn(page, name);
  await page.goto('/');
  return { page, errors };
}

test('town choice from the UI: one Classic and one Hollowmere lobby, badges everywhere, Classic pre-selected again', async ({ browser }) => {
  test.setTimeout(240_000);
  const tag = Math.random().toString(36).slice(2, 6);
  const v2Name = `Choice Classic ${tag}`;
  const v3Name = `Choice Hollow ${tag}`;

  const a = await host(browser, 'Classic host');
  const v2Id = await createLobbyViaUI(a.page, v2Name, 'v2');
  expect(await waitingRoomWorld(a.page)).toEqual({ text: 'Classic town', world: 'v2' });
  expect(await lsGet(a.page, 'ct.create.world')).toBeNull();

  const b = await host(browser, 'Hollow host');
  const v3Id = await createLobbyViaUI(b.page, v3Name, 'v3');
  expect(await waitingRoomWorld(b.page)).toEqual({ text: 'Hollowmere', world: 'v3' });
  expect(await lsGet(b.page, 'ct.create.world'), 'no remembered town pick (WP6)').toBeNull();

  // the public summary carries the world (the directory listing is what the finder shows)
  for (const [id, world] of [
    [v2Id, 'v2'],
    [v3Id, 'v3'],
  ] as const) {
    const r = await a.page.request.get(`/api/lobbies/${id}`);
    expect(r.status()).toBe(200);
    expect(((await r.json()) as { lobby: { world?: string } }).lobby.world ?? 'v2', `summary of ${id}`).toBe(world);
  }

  // a third player's lobby list: each row has its own badge
  const c = await host(browser, 'Browser');
  await expect(c.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible({ timeout: 30_000 });
  const row = (name: string) => c.page.locator('.ct-lobby', { hasText: name });
  await expect(row(v2Name)).toHaveCount(1, { timeout: 30_000 });
  await expect(row(v3Name)).toHaveCount(1);
  await expect(row(v2Name).locator('.ct-world-badge')).toHaveAttribute('data-world', 'v2');
  await expect(row(v2Name).locator('.ct-world-badge')).toHaveText('Classic town');
  await expect(row(v3Name).locator('.ct-world-badge')).toHaveAttribute('data-world', 'v3');
  await expect(row(v3Name).locator('.ct-world-badge')).toHaveText('Hollowmere');

  // no remembered pick: after making a Hollowmere lobby, host b's next dialog pre-selects DEFAULT_WORLD (Classic)
  await b.page.getByRole('dialog', { name: 'Waiting room' }).getByRole('button', { name: 'Leave' }).click();
  await expect(b.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible({ timeout: 30_000 });
  await b.page.getByRole('button', { name: 'Create lobby' }).first().click();
  const form = b.page.getByRole('dialog', { name: 'Create lobby' });
  await expect(form.getByRole('radiogroup', { name: 'Town' }).getByRole('radio', { name: /^Classic/ })).toBeChecked();
  await expect(form.getByRole('radiogroup', { name: 'Town' }).getByRole('radio', { name: /^Hollowmere/ })).not.toBeChecked();
  await form.getByRole('button', { name: 'Cancel' }).click();

  for (const p of [a, b, c]) expect(p.errors, 'no page errors').toEqual([]);
});

test('join preview: a share link names the lobby and shows its world badge while it connects', async ({ browser }) => {
  test.setTimeout(120_000);
  const tag = Math.random().toString(36).slice(2, 6);
  const name = `Preview Hollow ${tag}`;
  const a = await host(browser, 'Preview host');
  const id = await createLobbyViaUI(a.page, name, 'v3');

  const c = await host(browser, 'Preview guest');
  // hold the join ticket for a few seconds so the "Joining …" screen stays up long enough to read
  await c.page.route(/\/api\/lobbies\/[^/]+\/ticket$/, async (route) => {
    await new Promise((r) => setTimeout(r, 6000));
    await route.continue();
  });
  await c.page.goto(`/lobby/${id}`);
  const preview = c.page.locator('.ct-join-preview');
  await expect(
    preview,
    'join preview: ui/lobby/JoinPreview.tsx JoiningLobby must replace LobbyRoute\'s "Joining lobby…" (CONTRACT-REQUEST(lead), one line in LobbyRoute.tsx)',
  ).toBeVisible({ timeout: 5000 });
  await expect(preview).toContainText(`Joining ${name}`);
  await expect(preview.locator('.ct-world-badge')).toHaveAttribute('data-world', 'v3');
  await expect(preview.locator('.ct-world-badge')).toHaveText('Hollowmere');
  // and then the guest is in: the waiting room says the same
  expect(await waitingRoomWorld(c.page)).toEqual({ text: 'Hollowmere', world: 'v3' });
});

test('each lobby renders the right town (v2 → Classic v2 map; v3 → 3D Hollowmere; Classic in v3 → the v3 map)', async ({ browser }) => {
  test.setTimeout(600_000);
  const tag = Math.random().toString(36).slice(2, 6);
  // the v2 lobby: drawn by Classic even with the v3 force flag on (chooseRenderer row 1)
  const a = await host(browser, 'Classic town host', { force: true });
  await createLobbyViaUI(a.page, `Render Classic ${tag}`, 'v2');
  await expect.poll(() => townRenderer(a.page), { timeout: 60_000, message: 'a renderer mounted in the v2 lobby' }).toBe('classic');
  const v2 = layoutOf('v2');
  expect(await classicTown(a.page)).toMatchObject({ world: 'v2', widthTiles: v2.widthTiles, heightTiles: v2.heightTiles });
  expect(await a.page.evaluate(() => typeof (window as unknown as { __ctCamera?: { v3?: unknown } }).__ctCamera?.v3)).toBe('undefined');

  // the v3 lobby, 3D (forced on the host's SwiftShader)
  const b = await host(browser, 'Hollow town host', { force: true });
  const v3Id = await createLobbyViaUI(b.page, `Render Hollow ${tag}`, 'v3');
  const info = await waitV3Ready(b.page, 240_000, 'v3 lobby host');
  expect(info.ready).toBe(true);
  expect(await classicTown(b.page)).toBeNull();
  await expect(b.page.locator('.ct-game-canvas canvas')).toHaveCount(1);

  // a Classic client in the same v3 lobby draws the v3 map
  const c = await host(browser, 'Classic in Hollowmere', { force: false, extra: { 'ct.graphics': 'classic' } });
  await c.page.goto(`/lobby/${v3Id}`);
  // (host b's 3D page keeps the shared SwiftShader CPU busy, and Classic draws on SwiftShader WebGL in this project
  // too: allow the Classic client longer to come up)
  expect(await waitingRoomWorld(c.page, 180_000)).toEqual({ text: 'Hollowmere', world: 'v3' });
  await expect.poll(() => townRenderer(c.page), { timeout: 180_000 }).toBe('classic');
  const v3 = layoutOf('v3');
  expect(v3.widthTiles, 'the two maps differ (else this check proves nothing)').not.toBe(v2.widthTiles);
  expect(await classicTown(c.page)).toMatchObject({ world: 'v3', widthTiles: v3.widthTiles, heightTiles: v3.heightTiles });
  for (const p of [a, b, c]) expect(p.errors, 'no page errors').toEqual([]);
});
