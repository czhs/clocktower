// v3 WP7 (v3-qa) — v3-fallback (docs/v3/INTEGRATION.md §1.2 "Crash" / boot guard / perf sampler, §6.2). Every case
// ends with Classic drawing the SAME v3 lobby IN PLACE (no page reload: a window marker survives) and the 3D town's
// debug members gone (__ctCamera.v3 undefined):
//   - the 3D chunk fails to load (deploy skew): one retry after 1 s, then Classic;
//   - WEBGL_lose_context.loseContext(): the first loss rebuilds the 3D town (a NEW Engine / canvas), the second within
//     10 min swaps to Classic;
//   - a leftover boot mark (ct.graphics.booting, an OOM-killed previous boot) picks Classic with the boot-guard reason;
//   - ct.debug.v3perfFallback=1 turns the perf sampler back on under v3force: at 15 fps the median frame (≈ 66 ms)
//     is > 45 ms at the low tier → requestFallback('perf') → Classic + ct.graphics.autoFallback.
// Project `v3` only (scripts/v3/e2e.sh).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { makeBots, type Bot } from '../support/bot';
import { layoutOf } from '../v3/worlds';
import { classicTown, setE2eWorld, townRenderer, v3Context, waitV3Ready, watchConsole } from './helpers';

test.beforeAll(() => setE2eWorld('v3'));
test.afterAll(() => setE2eWorld('v2'));

let bots: Bot[] = [];
let ctx: BrowserContext | null = null;
test.afterEach(async () => {
  await ctx?.close().catch(() => undefined);
  ctx = null;
  await Promise.all(bots.map((b) => b.leave()));
  bots = [];
});

async function v3Lobby(url: string, name: string): Promise<string> {
  bots = await makeBots(1, 'Fallback ', url, url.replace(/^http/, 'ws'));
  const id = await bots[0]!.createLobby(name, 15, true, { world: 'v3' });
  await bots[0]!.join(id, 'storyteller');
  return id;
}

async function open(browser: import('@playwright/test').Browser, url: string, id: string, opts: { force?: boolean; extra?: Record<string, string> } = {}): Promise<{ page: Page; errors: string[] }> {
  ctx = await v3Context(browser, opts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  watchConsole(page, 'fallback', errors);
  expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Fallback' } })).ok()).toBe(true);
  await page.goto(`${url}/lobby/${id}`);
  return { page, errors };
}

const mark = (page: Page) => page.evaluate(() => ((window as unknown as { __e2eMark: number }).__e2eMark = 42));
const marked = (page: Page) => page.evaluate(() => (window as unknown as { __e2eMark?: number }).__e2eMark ?? null);
const v3Gone = (page: Page) => page.evaluate(() => typeof (window as unknown as { __ctCamera?: { v3?: unknown } }).__ctCamera?.v3 === 'undefined');

async function expectClassicInPlace(page: Page, what: string, timeout = 120_000) {
  await expect.poll(() => townRenderer(page), { timeout, message: `${what}: Classic mounted in place` }).toBe('classic');
  expect(await classicTown(page), `${what}: Classic draws the v3 map`).toMatchObject({ world: 'v3', widthTiles: layoutOf('v3').widthTiles });
  expect(await v3Gone(page), `${what}: __ctCamera.v3 removed`).toBe(true);
  expect(await marked(page), `${what}: no page reload`).toBe(42);
  await expect(page.locator('.ct-game-canvas canvas')).toHaveCount(1);
}

test('3D chunk fails to load → one retry, then Classic in place', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const id = await v3Lobby(baseURL!, 'v3 chunk fail');
  ctx = await v3Context(browser);
  const page = await ctx.newPage();
  const hits: string[] = [];
  await page.route(/\/assets\/town3d-[\w-]+\.js$/, (route) => {
    hits.push(route.request().url());
    return route.abort('failed');
  });
  expect((await page.request.post(`${baseURL}/api/auth/create`, { data: { displayName: 'Chunkless' } })).ok()).toBe(true);
  await page.goto(`${baseURL}/lobby/${id}`);
  await mark(page);
  await expectClassicInPlace(page, 'chunk failure');
  // §1.2 "Crash": a failed v3 import is retried ONCE after 1 s (deploy skew). Observed 2026-10-18 (WP7a): one request
  // for both attempts. Chromium appears to keep the failed fetch in its module map, so re-calling import() of the same
  // URL rejects again without reaching the network; the retry in GameScreen.importTown3d needs a fresh URL.
  expect(hits.length, `the town3d chunk was requested, then re-requested by the retry (requests: ${hits.join(', ')})`).toBeGreaterThanOrEqual(2);
});

test('WebGL context loss → full rebuild; a second loss → Classic in place', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const id = await v3Lobby(baseURL!, 'v3 context loss');
  const { page } = await open(browser, baseURL!, id);
  await waitV3Ready(page, 240_000, 'context loss');
  await mark(page);
  const lose = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('.ct-game-canvas canvas');
      if (!c) return 'no canvas';
      c.dataset.e2eOld = '1';
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) return 'no WEBGL_lose_context';
      ext.loseContext();
      return 'lost';
    });
  expect(await lose()).toBe('lost');
  // first loss: a rebuild behind the "Rebuilding town…" overlay, on a NEW canvas (new Engine), still 3D
  // (fails fast, not after the full budget, when the town swapped straight to Classic: the WP0 stub's behaviour
  // until C1 wires WP1's rebuild)
  const t0 = Date.now();
  for (;;) {
    const st = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('.ct-game-canvas canvas');
      const cam = (window as unknown as { __ctCamera?: { v3?: () => { ready: boolean }; town?: unknown } }).__ctCamera;
      if (typeof cam?.town === 'function') return 'classic';
      return !!c && c.dataset.e2eOld !== '1' && !!cam?.v3?.().ready ? 'rebuilt' : 'waiting';
    });
    if (st === 'rebuilt') break;
    if (st === 'classic') throw new Error('PENDING C1: the first context loss swapped to Classic instead of rebuilding the 3D town (WP1 lifecycle rebuild not wired into TownGame3d.ts yet)');
    if (Date.now() - t0 > 240_000) throw new Error('first context loss: the 3D town was not rebuilt on a new canvas within 240 s');
    await page.waitForTimeout(1000);
  }
  expect(await townRenderer(page)).toBe('v3');
  expect(await marked(page)).toBe(42);
  // second loss within 10 min: Classic
  expect(await lose()).toBe('lost');
  await expectClassicInPlace(page, 'second context loss');
});

test('leftover boot mark (unclean previous boot) → Classic with the boot-guard reason', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const id = await v3Lobby(baseURL!, 'v3 boot guard');
  // NO v3force (row 2 would skip the boot guard); an explicit v3 pick is overruled by the guard too (row 4)
  const { page, errors } = await open(browser, baseURL!, id, {
    force: false,
    extra: { 'ct.graphics': 'v3', 'ct.graphics.booting': new Date(Date.now() - 60_000).toISOString() },
  });
  await mark(page);
  await expect.poll(() => townRenderer(page), { timeout: 60_000 }).toBe('classic');
  expect(await classicTown(page)).toMatchObject({ world: 'v3' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dlg.getByRole('tab', { name: 'Graphics' }).click();
  await expect(dlg.locator('.ct-set-graphics-status'), 'the Graphics row names the boot guard (§1.2 row 4)').toHaveText(/stopped last time/i);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('perf sampler (ct.debug.v3perfFallback=1, 15 fps) → perf fallback to Classic in place', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const id = await v3Lobby(baseURL!, 'v3 perf fallback');
  const { page } = await open(browser, baseURL!, id, { extra: { 'ct.debug.v3perfFallback': '1' } });
  const info = await waitV3Ready(page, 240_000, 'perf fallback');
  await mark(page);
  // Needs TownGame3d.ts to run WP1's lifecycle / PerfSampler (C1 wiring). The sampler drops rAF deltas > 250 ms
  // (perf.ts PERF_DROP_MS); in this e2e page the frames sit at the 15 fps cap (p50 ≈ 67 ms on the host, 2026-10-18), so
  // the 120-frame window fills; the frame times are in the failure message in case a busier host changes that.
  try {
    await expectClassicInPlace(page, 'perf fallback', 240_000);
  } catch (e) {
    throw new Error(
      `PENDING C1 / WP1: no perf fallback within 240 s (frame p50 ${info.frameMs?.p50 ?? '?'} ms, p95 ${info.frameMs?.p95 ?? '?'} ms on this host; ` +
        `needs WP1's lifecycle PerfSampler wired into TownGame3d.ts; frames > 250 ms would also starve it). ${String((e as Error).message).split('\n')[0]}`,
    );
  }
  const memo = await page.evaluate(() => localStorage.getItem('ct.graphics.autoFallback'));
  expect(memo, 'ct.graphics.autoFallback memo (§1.2 row 7)').toMatch(/^\d{4}-\d{2}-\d{2}/);
});
