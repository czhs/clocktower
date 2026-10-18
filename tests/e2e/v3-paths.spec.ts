// (v3 WP8, "v3 loading screen + URL paths"; docs/v3/INTEGRATION.md §8, §11 user decision 2026-10-18) The world comes
// from the URL path: `/` (the default link) = the v3 app, every lobby made there is Hollowmere; `/v2/` = the v2 app
// exactly as before (Classic town). One build, one server, the same accounts. Replaced v3-lobby-choice.spec.ts (the
// per-lobby Town choice is gone; that spec was deleted with WP8).
//
//   1. A lobby created at `/` is v3 and draws the 3D town; one created at `/v2/` is v2 and draws the Classic v2 town
//      (even with the v3 force flag). Each app's lobby list shows only its world; the address bar keeps its prefix.
//   2. Share links: a v2 lobby link opened at `/lobby/x` (every link shared before this change) lands in
//      `/v2/lobby/x`, and a v3 link opened under /v2/ lands in `/lobby/x`; the join goes on without a reload.
//   3. The v3 loading scene at `/` (boot, joining, the town build: tests/v3/shots/loading-*.png); the v2 app keeps
//      the plain lines. The town-build scene is GameScreen's loading state in a v3 lobby (wired in WP8).
//
// Project `v3` (E2E_V3=1; host GPU by default, CT_GL=swiftshader for CPU-only), E2E_PORT from the runner's range.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { layoutOf } from '../v3/worlds';
import { apiSignIn, classicTown, townRenderer, v3Context, waitingRoomWorld, waitV3Ready, watchConsole } from './helpers';
import { createLobbyAt, worldOfUrl, worldUrl } from './appPath';

const SHOTS = path.resolve(import.meta.dirname, '../v3/shots');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `loading-${name}.png`) });
const pathOf = (page: Page) => new URL(page.url()).pathname;

let ctxs: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(ctxs.map((c) => c.close().catch(() => undefined)));
  ctxs = [];
});

async function person(browser: import('@playwright/test').Browser, name: string, opts: { force?: boolean; extra?: Record<string, string>; signIn?: boolean } = {}) {
  const ctx = await v3Context(browser, { viewport: { width: 1280, height: 800 }, force: opts.force ?? true, ...(opts.extra ? { extra: opts.extra } : {}) });
  ctxs.push(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  watchConsole(page, name, errors);
  if (opts.signIn !== false) await apiSignIn(page, name);
  return { page, errors };
}

const rowsOf = (page: Page) => page.locator('.ct-lobby .ct-lobby-name');

test('`/` makes Hollowmere lobbies (3D town), `/v2/` makes Classic ones (v2 town); each list shows only its world', async ({ browser }) => {
  test.setTimeout(600_000);
  const tag = Math.random().toString(36).slice(2, 6);
  const v2Name = `Path Classic ${tag}`;
  const v3Name = `Path Hollow ${tag}`;

  // the v2 app: Classic town, drawn by Classic even with the v3 force flag (the lobby world decides)
  const a = await person(browser, 'Classic host');
  const v2Id = await createLobbyAt(a.page, 'v2', v2Name);
  expect(await waitingRoomWorld(a.page)).toEqual({ text: 'Classic town', world: 'v2' });
  await expect.poll(() => townRenderer(a.page), { timeout: 60_000, message: 'a renderer mounted in the v2 lobby' }).toBe('classic');
  const v2 = layoutOf('v2');
  expect(await classicTown(a.page)).toMatchObject({ world: 'v2', widthTiles: v2.widthTiles, heightTiles: v2.heightTiles });
  expect(await a.page.evaluate(() => document.documentElement.dataset.graphics ?? null), 'v2 keeps the v2 look').toBeNull();
  await expect(a.page.locator('.ct-v3load')).toHaveCount(0);

  // the v3 app: Hollowmere, the 3D town
  const b = await person(browser, 'Hollow host');
  const v3Id = await createLobbyAt(b.page, 'v3', v3Name);
  expect(await waitingRoomWorld(b.page)).toEqual({ text: 'Hollowmere', world: 'v3' });
  const info = await waitV3Ready(b.page, 240_000, 'v3 lobby host');
  expect(info.ready).toBe(true);
  expect(await classicTown(b.page)).toBeNull();

  // a third player: `/` lists the Hollowmere lobby only, `/v2/` the Classic one only (live directory, same server)
  const c = await person(browser, 'Browser');
  await c.page.goto('/');
  await expect(rowsOf(c.page).filter({ hasText: v3Name })).toHaveCount(1, { timeout: 30_000 });
  await expect(rowsOf(c.page).filter({ hasText: v2Name })).toHaveCount(0);
  await expect(c.page.locator('.ct-lobby .ct-world-badge'), 'rows carry no world badge any more').toHaveCount(0);
  await expect(c.page.getByRole('link', { name: 'Classic town lobbies' })).toHaveAttribute('href', '/v2/');
  await c.page.getByRole('link', { name: 'Classic town lobbies' }).click();
  await expect(c.page).toHaveURL(/\/v2\/$/);
  await expect(rowsOf(c.page).filter({ hasText: v2Name })).toHaveCount(1, { timeout: 30_000 });
  await expect(rowsOf(c.page).filter({ hasText: v3Name })).toHaveCount(0);
  await expect(c.page.getByRole('link', { name: 'Hollowmere lobbies' })).toHaveAttribute('href', '/');

  // the v2 app keeps its prefix through in-app navigation: Join → /v2/lobby/x, Leave → /v2/
  await c.page.locator('.ct-lobby', { hasText: v2Name }).getByRole('button', { name: 'Join', exact: true }).click();
  await expect(c.page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 60_000 });
  expect(pathOf(c.page)).toBe(`/v2/lobby/${v2Id}`);
  const share = await c.page.getByRole('textbox', { name: 'Share link' }).inputValue();
  expect(new URL(share).pathname, 'the share link points into the v2 app').toBe(`/v2/lobby/${v2Id}`);
  await c.page.getByRole('dialog', { name: 'Waiting room' }).getByRole('button', { name: 'Leave' }).click();
  await expect(c.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible({ timeout: 30_000 });
  expect(pathOf(c.page)).toBe('/v2/');
  // and a v3 lobby's share link has no prefix
  const bShare = await b.page.evaluate(() => (document.querySelector('input[aria-label="Share link"]') as HTMLInputElement | null)?.value ?? null);
  if (bShare) expect(new URL(bShare).pathname).toBe(`/lobby/${v3Id}`);

  for (const p of [a, b, c]) expect(p.errors, 'no page errors').toEqual([]);
});

test('share links: a v2 lobby opened at `/lobby/x` lands in `/v2/lobby/x` (and v3 under /v2/ in `/lobby/x`), no reload', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Math.random().toString(36).slice(2, 6);
  const a = await person(browser, 'Old link host', { force: false });
  const v2Id = await createLobbyAt(a.page, 'v2', `Old Link ${tag}`);
  const b = await person(browser, 'New link host', { force: false, extra: { 'ct.graphics': 'classic' } });
  const v3Id = await createLobbyAt(b.page, 'v3', `New Link ${tag}`);

  const g = await person(browser, 'Guest', { force: false, extra: { 'ct.graphics': 'classic' } });
  // count document loads (a reload would run this again): the move must be history.replaceState, not a reload
  await g.page.addInitScript(() => {
    try {
      sessionStorage.setItem('e2e.loads', String(Number(sessionStorage.getItem('e2e.loads') ?? 0) + 1));
    } catch {}
  });
  await g.page.goto(`/lobby/${v2Id}`); // a link shared before the change (no prefix)
  await expect.poll(() => pathOf(g.page), { timeout: 30_000 }).toBe(`/v2/lobby/${v2Id}`);
  expect(await waitingRoomWorld(g.page)).toEqual({ text: 'Classic town', world: 'v2' });
  expect(await g.page.evaluate(() => sessionStorage.getItem('e2e.loads')), 'moved with history.replaceState, not a reload').toBe('1');
  expect(worldOfUrl(g.page.url())).toBe('v2');
  await g.page.getByRole('dialog', { name: 'Waiting room' }).getByRole('button', { name: 'Leave' }).click();
  await expect(g.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible({ timeout: 30_000 });
  expect(pathOf(g.page), '"Back to lobbies" lists the lobby\'s own world').toBe('/v2/');

  await g.page.goto(worldUrl('v2', `/lobby/${v3Id}`)); // a v3 lobby under the v2 app
  await expect.poll(() => pathOf(g.page), { timeout: 30_000 }).toBe(`/lobby/${v3Id}`);
  expect(await waitingRoomWorld(g.page)).toEqual({ text: 'Hollowmere', world: 'v3' });
  for (const p of [a, b, g]) expect(p.errors, 'no page errors').toEqual([]);
});

test('the v3 loading scene at `/` (boot, joining, town build); `/v2/` keeps the plain lines', async ({ browser }) => {
  test.setTimeout(400_000);
  const tag = Math.random().toString(36).slice(2, 6);
  const host = await person(browser, 'Scene host', { force: false, extra: { 'ct.graphics': 'classic' } });
  const id = await createLobbyAt(host.page, 'v3', `Scene ${tag}`);

  const g = await person(browser, 'Scene guest');
  const csp: string[] = [];
  g.page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && csp.push(m.text().slice(0, 200)));
  // boot: hold the session check so the boot scene stays up
  let holdMe = true;
  await g.page.route('**/api/me', async (route) => {
    if (holdMe) await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  // joining: hold the join ticket so the join scene stays up
  await g.page.route(/\/api\/lobbies\/[^/]+\/ticket$/, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  // the town build: slow the town chunks a little so the build scene is seen
  await g.page.route(/\/assets\/(town3d|ground|props|house-\d+|clocktower|dais|foliage|life)-[\w-]{8}\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, 150));
    await route.continue();
  });
  void g.page.goto(`/lobby/${id}`);
  const scene = g.page.locator('.ct-v3load');
  await expect(scene, 'boot scene at /').toBeVisible({ timeout: 15_000 });
  await expect(scene.locator('.ct-v3load-title')).toHaveText('Hollowmere');
  await expect(scene.getByRole('progressbar')).toBeVisible();
  await g.page.waitForTimeout(400); // sheets decode
  await shot(g.page, 'boot');
  holdMe = false;
  await expect(scene.locator('.ct-v3load-label')).toHaveText(new RegExp(`^(Finding the lobby…|Joining Scene ${tag}…|Unrolling the map…)$`), { timeout: 20_000 });
  await expect(scene.locator('.ct-v3load-walker')).toHaveCount(5);
  await g.page.waitForTimeout(400);
  await shot(g.page, 'join');
  const joinPct = Number(await scene.getByRole('progressbar').getAttribute('aria-valuenow'));
  expect(joinPct).toBeGreaterThan(0);

  // the town build (GameScreen: needs the lead's TownLoading wiring, docs/v3 §8 WP8)
  const seen: { label: string; pct: number }[] = [];
  const t0 = Date.now();
  let gone = false;
  while (Date.now() - t0 < 240_000) {
    const s = await g.page
      .evaluate(() => {
        const el = document.querySelector('.ct-game .ct-v3load');
        if (!el) return null;
        return { label: el.querySelector('.ct-v3load-label')?.textContent ?? '', pct: Number(el.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow') ?? -1) };
      })
      .catch(() => null);
    if (s && seen.at(-1)?.label !== s.label) {
      seen.push(s);
      if (seen.length === 1) await shot(g.page, 'town');
    }
    if (s && /Raising the cottages/.test(s.label) && !seen.some((x) => x.label === 'shot-pieces')) {
      seen.push({ label: 'shot-pieces', pct: s.pct });
      await shot(g.page, 'town-pieces');
    }
    if (!s && seen.length && (await townRenderer(g.page))) {
      gone = true;
      break;
    }
    if (!s && !seen.length && (await g.page.locator('.ct-game-loading').count()) && Date.now() - t0 > 20_000) break; // not wired
    await g.page.waitForTimeout(100);
  }
  const labels = seen.filter((x) => x.label !== 'shot-pieces');
  expect(labels.length, `the town-build scene shows in GameScreen (seen: ${JSON.stringify(seen)}; needs the GameScreen TownLoading wiring)`).toBeGreaterThan(0);
  for (let i = 1; i < labels.length; i++) expect(labels[i]!.pct, JSON.stringify(labels)).toBeGreaterThanOrEqual(labels[i - 1]!.pct);
  expect(labels.some((x) => /Fetching the town|Raising the cottages|Lighting the lamps/.test(x.label)), JSON.stringify(labels)).toBe(true);
  expect(gone, 'the scene goes once the town is ready').toBe(true);
  await waitV3Ready(g.page, 120_000, 'scene guest');
  await expect(g.page.locator('.ct-v3load')).toHaveCount(0);
  expect(csp, 'no CSP violations from the scene').toEqual([]);

  // the v2 app keeps today's screens (no scene)
  const v = await person(browser, 'Plain guest', { force: false });
  await v.page.route('**/api/me', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  void v.page.goto('/v2/');
  await expect(v.page.getByText('Loading…')).toBeVisible({ timeout: 10_000 });
  await expect(v.page.locator('.ct-v3load')).toHaveCount(0);
  await expect(v.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible({ timeout: 30_000 });
  for (const p of [host, g, v]) expect(p.errors, 'no page errors').toEqual([]);
});

test('the scene works without WebGL (CPU-only): Classic draws Hollowmere behind the same scene', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Math.random().toString(36).slice(2, 6);
  const host = await person(browser, 'NoGL host', { force: false, extra: { 'ct.graphics': 'classic' } });
  const id = await createLobbyAt(host.page, 'v3', `No GL ${tag}`);
  const g = await person(browser, 'NoGL guest', { force: false });
  // no WebGL at all for this page: the 3D town is never chosen (select.ts probe), the scene is DOM + CSS only
  await g.page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await g.page.route(/\/api\/lobbies\/[^/]+\/ticket$/, async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await g.page.goto(`/lobby/${id}`);
  await expect(g.page.locator('.ct-v3load')).toBeVisible({ timeout: 15_000 });
  await g.page.waitForTimeout(400);
  await shot(g.page, 'nogl');
  expect(await waitingRoomWorld(g.page, 120_000)).toEqual({ text: 'Hollowmere', world: 'v3' });
  await expect.poll(() => townRenderer(g.page), { timeout: 120_000 }).toBe('classic');
  await expect(g.page.locator('.ct-v3load')).toHaveCount(0);
  for (const p of [host, g]) expect(p.errors, 'no page errors').toEqual([]);
});
