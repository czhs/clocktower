// (v3 WP5b, v3-world) Classic 2D in a v3 lobby (docs/v3/INTEGRATION.md §2.5, §8 WP5b acceptance):
//   1. a Classic client (Graphics = Classic) in a v3 lobby draws Hollowmere and walks into all 15 cottages through
//      their real v3 doors (tap the cottage -> the client's own path + door rule -> world:useDoor -> 'door' teleport)
//   2. one page leaves a v2 lobby and joins a v3 lobby without a reload and draws the v3 town
//   3. screenshots for the user's Q7 review (day boards / boarded houses, inside, night, phone) in test-results/classic-v3/
// WP7 owns the v3 e2e project and the world-aware helpers; this spec is self-contained (its own geometry from
// townLayoutV3) so it runs in the default project today. Run on the host (own server on a v3-world port):
//   E2E_BASE_URL=http://127.0.0.1:3475 pnpm exec playwright test -c tests/e2e/playwright.config.ts classic-in-v3
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { tileCenterPx, type TownLayout } from '../../packages/protocol/src/index';
import { findPath } from '../../apps/server/src/world/path';
import { makeBots } from '../support/bot';
import { FrameTap, inject, installSocketTap } from './helpers';

const OUT = path.resolve('test-results/classic-v3');
// townLayoutV3 (packages/assets/src/hollowmere/layoutV3.ts) rebuilt from its JSON: the test runner's loader does not
// take that module's bare JSON import
const H = JSON.parse(readFileSync(path.resolve('packages/assets/src/hollowmere/hollowmere.generated.json'), 'utf8')) as Omit<TownLayout, 'collision'> & { collision: string[] };
const L: TownLayout = {
  version: H.version,
  widthTiles: H.widthTiles,
  heightTiles: H.heightTiles,
  tileSize: H.tileSize,
  townBounds: H.townBounds,
  square: H.square,
  buildings: H.buildings,
  collision: H.collision.flatMap((row) => [...row].map((c) => (c === '1' ? 1 : 0))),
  playerSpawn: H.playerSpawn,
  storytellerSpawn: H.storytellerSpawn,
  streetlights: H.streetlights,
  circle: H.circle,
};
let ipNo = 0;
type Me = { x: number; y: number; location: string; moving: boolean };
type Town = { world: string; widthTiles: number; heightTiles: number };

async function classicContext(browser: Browser, viewport = { width: 1280, height: 800 }, extra: Record<string, unknown> = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { 'X-Forwarded-For': `10.97.${process.pid % 200}.${++ipNo}` }, ...extra });
  await installSocketTap(ctx); // also turns the ct.debug.camera hook on
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('ct.intro.seen', '1');
      localStorage.setItem('ct.hint.move.v1', '1');
      localStorage.setItem('ct.hint.social.v1', '1');
      localStorage.setItem('ct.graphics', 'classic'); // Classic 2D even in a v3 lobby (game3d/select.ts row 3)
      localStorage.setItem('ct.debug.fps', '15');
    } catch {}
  });
  return ctx;
}

async function signIn(page: Page, name: string) {
  await page.goto('/');
  const r = await page.request.post('/api/auth/create', { data: { displayName: name } });
  expect(r.status(), await r.text()).toBeLessThan(300);
}

async function createLobby(page: Page, name: string, world: 'v2' | 'v3'): Promise<string> {
  const r = await page.request.post('/api/lobbies', { data: { name, maxPlayers: 15, takeStoryteller: false, world } });
  expect(r.status(), await r.text()).toBeLessThan(300);
  const lobby = ((await r.json()) as { lobby: { id: string; world?: string } }).lobby;
  expect(lobby.world).toBe(world);
  return lobby.id;
}

const town = (page: Page) => page.evaluate(() => (window as unknown as { __ctCamera?: { town?: () => Town } }).__ctCamera?.town?.() ?? null);
const me = (page: Page) => page.evaluate(() => (window as unknown as { __ctCamera?: { me(): Me } }).__ctCamera?.me() ?? null);

async function waitTown(page: Page, world: 'v2' | 'v3'): Promise<Town> {
  await expect.poll(async () => (await town(page))?.world ?? null, { timeout: 60_000, message: `Classic draws the ${world} town` }).toBe(world);
  // and our own position arrived
  await expect.poll(async () => (await me(page))?.x ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  return (await town(page))!;
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** Page CSS px of each world point that is on the Classic canvas with nothing (HUD, panels) covering it there; else null. */
async function onCanvas(page: Page, ws: { x: number; y: number }[]): Promise<({ x: number; y: number } | null)[]> {
  return page.evaluate((pts) => {
    const cam = (window as unknown as { __ctCamera?: { worldToScreen(x: number, y: number): { x: number; y: number } } }).__ctCamera;
    if (!cam) return pts.map(() => null);
    return pts.map((p) => {
      const s = cam.worldToScreen(p.x, p.y);
      const el = document.elementFromPoint(s.x, s.y);
      if (!el || el.tagName !== 'CANVAS') return null;
      const r = el.getBoundingClientRect();
      const m = 14;
      return s.x > r.left + m && s.y > r.top + m && s.x < r.right - m && s.y < r.bottom - m ? s : null;
    });
  }, ws);
}

// What a tap means to TownScene (rules/doors.ts tapTarget): a cottage when it hits the DRAWN sprite rect (town-v3.json
// building `footprint`) or lands within DOOR_TAP_RANGE (14 px) of a door. Ground taps must avoid both.
const TOWN_V3 = JSON.parse(readFileSync(path.resolve('packages/assets/generated/town-v3.json'), 'utf8')) as { layers: { name: string; objects?: { type: string; properties: { name: string; value: unknown }[] }[] }[] };
const SPRITES = (TOWN_V3.layers.find((l) => l.name === 'objects')!.objects ?? [])
  .filter((o) => o.type === 'building')
  .map((o) => o.properties.find((p) => p.name === 'footprint')?.value)
  .filter((v): v is string => typeof v === 'string')
  .map((v) => JSON.parse(v) as { x: number; y: number; w: number; h: number });
const DOORS = L.buildings.map((b) => tileCenterPx(L, b.door));
const isGroundTap = (p: { x: number; y: number }) =>
  !SPRITES.some((f) => p.x >= f.x * 16 - 4 && p.x < (f.x + f.w) * 16 + 4 && p.y >= (f.y - 1) * 16 - 4 && p.y < (f.y + f.h) * 16 + 4) && !DOORS.some((d) => Math.hypot(p.x - d.x, p.y - d.y) < 30);
const blocked = (tx: number, ty: number) => tx < 0 || ty < 0 || tx >= L.widthTiles || ty >= L.heightTiles || L.collision[ty * L.widthTiles + tx] === 1;

/** Wait until our avatar stops (or `done` holds). */
async function settle(page: Page, done: (m: Me) => boolean, timeoutMs = 25_000): Promise<Me> {
  const t0 = Date.now();
  let last = await me(page);
  let still = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(250);
    const m = await me(page);
    if (!m) continue;
    if (done(m)) return m;
    if (!last || Math.hypot(m.x - last.x, m.y - last.y) > 0.5 || m.location !== last.location) {
      last = m;
      still = Date.now();
    } else if (Date.now() - still > 2500) return m;
  }
  return (await me(page))!;
}

async function leave(page: Page) {
  for (let k = 0; k < 4; k++) {
    await page.waitForTimeout(1100); // the door's anti-bounce cooldown
    await page.keyboard.press('Escape');
    const m = await settle(page, (x) => x.location === 'outdoors', 8000);
    if (m.location === 'outdoors') return;
  }
  throw new Error(`could not leave ${(await me(page))?.location}`);
}

/** Tap our way into a cottage: tap its door when it is on screen, else the visible ground spot nearest to it. */
async function tapInto(page: Page, b: (typeof L.buildings)[number], log: string[]) {
  const want = `bld:${b.id}`;
  const door = tileCenterPx(L, b.door);
  for (let attempt = 1; attempt <= 16; attempt++) {
    const m = (await me(page))!;
    if (m.location === want) return;
    if (m.location !== 'outdoors') {
      log.push(`  #${attempt} in ${m.location} (a tap meant for ${b.id}): leave`);
      await leave(page);
      continue;
    }
    const [s] = await onCanvas(page, [door]);
    if (s) {
      await page.mouse.click(s.x, s.y);
      log.push(`  #${attempt} door of ${b.id} @${Math.round(s.x)},${Math.round(s.y)} from ${Math.round(m.x)},${Math.round(m.y)}`);
      const r = await settle(page, (x) => x.location === want, 30_000);
      if (r.location === want) return;
      continue;
    }
    // walk closer: the visible, reachable ground tile nearest to the door
    const view = await page.evaluate(() => (window as unknown as { __ctCamera: { view(): { x: number; y: number; width: number; height: number } } }).__ctCamera.view());
    const cand: { x: number; y: number }[] = [];
    const tb = L.townBounds;
    for (let ty = Math.max(tb.y + 1, Math.floor(view.y / 16)); ty < Math.min(tb.y + tb.h - 1, Math.ceil((view.y + view.height) / 16)); ty++)
      for (let tx = Math.max(tb.x + 1, Math.floor(view.x / 16)); tx < Math.min(tb.x + tb.w - 1, Math.ceil((view.x + view.width) / 16)); tx++) {
        if (blocked(tx, ty) || blocked(tx, ty + 1)) continue;
        const p = { x: tx * 16 + 8, y: ty * 16 + 8 };
        if (!isGroundTap(p) || Math.hypot(p.x - door.x, p.y - door.y) > Math.hypot(m.x - door.x, m.y - door.y) - 40) continue;
        cand.push(p);
      }
    cand.sort((a, c) => Math.hypot(a.x - door.x, a.y - door.y) - Math.hypot(c.x - door.x, c.y - door.y));
    const top = cand.slice(0, 60);
    const scr = await onCanvas(page, top);
    let tapped = false;
    for (let k = 0; k < top.length; k++) {
      const q = scr[k];
      if (!q || !findPath(L, { x: m.x, y: m.y }, top[k]!, 'outdoors')) continue;
      await page.mouse.click(q.x, q.y);
      log.push(`  #${attempt} toward ${b.id}: ground ${top[k]!.x},${top[k]!.y} from ${Math.round(m.x)},${Math.round(m.y)}`);
      await settle(page, () => false, 20_000);
      tapped = true;
      break;
    }
    if (!tapped) throw new Error(`${b.id}: nothing to tap from ${Math.round(m.x)},${Math.round(m.y)} (log ${log.join(' | ')})`);
  }
  throw new Error(`${b.id}: not inside after 16 taps (log ${log.join(' | ')})`);
}

test('Classic in a v3 lobby: Hollowmere drawn, all 15 cottages entered through their v3 doors', async ({ browser }) => {
  test.setTimeout(900_000);
  // full-HD: the whole town width fits (outdoorZoom), so no door ends up under the waiting-room panel
  const ctx = await classicContext(browser, { width: 1920, height: 1080 });
  const page = await ctx.newPage();
  const tap = new FrameTap('Classic walker', page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await signIn(page, 'Classic walker');
  const id = await createLobby(page, 'Classic in Hollowmere', 'v3');
  await page.goto(`/lobby/${id}`);
  const t = await waitTown(page, 'v3');
  expect([t.widthTiles, t.heightTiles]).toEqual([L.widthTiles, L.heightTiles]);
  expect(await page.evaluate(() => !!(window as unknown as { __pixel?: unknown }).__pixel), 'no 3D engine was started').toBe(false);
  await shot(page, '00-v3-waiting-desktop');
  // fold the waiting-room panel, the chat and the voice panel away: the camera stops at the town's edge, so the
  // west / east cottages sit under them otherwise
  for (const name of ['Hide lobby details', 'Minimise chat'])
    if (await page.getByRole('button', { name }).count()) await page.getByRole('button', { name }).first().click();
  const voiceFold = page.getByRole('region', { name: 'Voice' }).getByRole('button', { name: '▾' });
  if (await voiceFold.count()) await voiceFold.first().click();
  await page.waitForTimeout(500);
  const log: string[] = [];
  const since = Date.now();
  for (const b of L.buildings) {
    await test.step(`enter ${b.id} (${b.name})`, async () => {
      log.push(`${b.id}:`);
      await tapInto(page, b, log);
      const inside = page.locator('.ct-inside');
      await expect(inside).toBeVisible({ timeout: 10_000 });
      if (b.id === 'house-5' || b.id === 'house-12') await shot(page, `01-inside-${b.id}`);
      await leave(page);
      // we are back out on this cottage's doorstep
      const m = (await me(page))!;
      const door = tileCenterPx(L, b.door);
      expect(Math.hypot(m.x - door.x, m.y - door.y), `${b.id}: left onto the doorstep`).toBeLessThan(24);
    });
  }
  // every entry went through world:useDoor and a 'door' teleport from the server
  const doors = tap.received('world:teleport', since).filter((x: { reason: string; location: string }) => x.reason === 'door' && x.location.startsWith('bld:'));
  expect(new Set(doors.map((x: { location: string }) => x.location)).size).toBe(15);
  expect(new Set(tap.sent('world:useDoor', since).map((x: { buildingId: string }) => x.buildingId)).size).toBe(15);
  console.log(log.join('\n'));
  expect(errors).toEqual([]);
  await ctx.close();
});

test('one page: a v2 lobby, then a v3 lobby, each draws its own town (no reload)', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  // one open lobby per account: two hosts (bots, joined so the lobbies stay open), one page visiting both
  const url = baseURL!;
  const hosts = await makeBots(2, 'Hop host ', url, url.replace(/^http/, 'ws'));
  const lobbyOf = async (bot: (typeof hosts)[number], world: 'v2' | 'v3') => {
    const r = await bot.api.createLobby({ name: `Hop ${world}`, maxPlayers: 15, takeStoryteller: false, world } as never);
    expect(r.status, r.text).toBeLessThan(300);
    const lobby = (r.body as { lobby: { id: string; world?: string } }).lobby;
    expect(lobby.world).toBe(world);
    await bot.join(lobby.id);
    return lobby.id;
  };
  const v2 = await lobbyOf(hosts[0]!, 'v2');
  const v3 = await lobbyOf(hosts[1]!, 'v3');
  const ctx = await classicContext(browser);
  const page = await ctx.newPage();
  await signIn(page, 'World hopper');
  await page.goto(`/lobby/${v2}`);
  const a = await waitTown(page, 'v2');
  expect(a.widthTiles).not.toBe(L.widthTiles);
  await page.evaluate(() => ((window as unknown as { __ctNoReload?: number }).__ctNoReload = 1));
  const go = (route: object, p: string) =>
    page.evaluate(
      ({ route, p }) => {
        history.pushState(route, '', p);
        window.dispatchEvent(new CustomEvent('ct:navigate', { detail: route }));
      },
      { route, p },
    );
  await go({ name: 'home' }, '/');
  await expect.poll(() => town(page), { timeout: 20_000 }).toBeNull();
  await go({ name: 'lobby', id: v3, intent: 'player' }, `/lobby/${v3}`);
  const b = await waitTown(page, 'v3');
  expect([b.widthTiles, b.heightTiles]).toEqual([L.widthTiles, L.heightTiles]);
  expect(await page.evaluate(() => (window as unknown as { __ctNoReload?: number }).__ctNoReload)).toBe(1);
  await shot(page, '02-v2-then-v3');
  // and back to a v2 lobby: the classic town again
  await go({ name: 'home' }, '/');
  await expect.poll(() => town(page), { timeout: 20_000 }).toBeNull();
  await go({ name: 'lobby', id: v2, intent: 'player' }, `/lobby/${v2}`);
  const c = await waitTown(page, 'v2');
  expect(c.widthTiles).toBe(a.widthTiles);
  expect(await page.evaluate(() => (window as unknown as { __ctNoReload?: number }).__ctNoReload)).toBe(1);
  await ctx.close();
  for (const h of hosts) await h.leave().catch(() => {});
});

test('Q7 screenshots: a v3 game seen in Classic (day boards + boarded houses, night at home, phone)', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const url = baseURL!;
  const bots = await makeBots(6, 'Hollow ', url, url.replace(/^http/, 'ws'));
  const [st, ...others] = bots;
  const r = await st!.api.createLobby({ name: 'Classic Q7', maxPlayers: 15, takeStoryteller: true, world: 'v3' } as never);
  expect(r.status, r.text).toBeLessThan(300);
  const id = (r.body as { lobby: { id: string } }).lobby.id;
  await st!.join(id, 'storyteller');
  for (const bot of others) await bot.join(id);
  const ctx = await classicContext(browser);
  const page = await ctx.newPage();
  const tap = new FrameTap('Q7 player', page);
  try {
    await signIn(page, 'Q7 player');
    await page.goto(`/lobby/${id}`);
    await waitTown(page, 'v3');
    for (const bot of others) bot.send('lobby:ready', { ready: true });
    await inject(page, 'lobby:ready', { ready: true });
    await expect.poll(() => st!.lobbyView?.canStart, { timeout: 30_000 }).toBe(true);
    st!.send('lobby:start', {});
    await tap.until(() => tap.last('game:view')?.kind === 'player', 30_000);
    st!.send('st:command', { type: 'random_setup' });
    await page.waitForTimeout(800);
    st!.send('st:command', { type: 'force_phase', to: 'day' });
    await page.waitForTimeout(3500);
    await shot(page, '10-day-player');
    // the camera follows us: walk into the north lane to see the boards and the boarded (empty) cottages
    st!.send('st:command', { type: 'teleport', who: 'all', to: { kind: 'square' } });
    await page.waitForTimeout(2500);
    await shot(page, '11-day-square');
    st!.send('st:command', { type: 'force_phase', to: 'bedtime' });
    await page.waitForTimeout(3000);
    await shot(page, '12-bedtime');
    st!.send('st:command', { type: 'force_phase', to: 'night' });
    await expect.poll(() => tap.last('game:view')?.phase, { timeout: 15_000 }).toMatch(/night$/);
    await page.waitForTimeout(4500);
    await shot(page, '13-night-home');
    st!.send('st:command', { type: 'force_phase', to: 'day' });
    await page.waitForTimeout(3000);
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.addCookies(await ctx.cookies());
    await phone.addInitScript(() => {
      try {
        localStorage.setItem('ct.intro.seen', '1');
        localStorage.setItem('ct.hint.move.v1', '1');
        localStorage.setItem('ct.hint.social.v1', '1');
        localStorage.setItem('ct.debug.camera', '1');
      } catch {}
    });
    await page.close();
    const pp = await phone.newPage();
    await pp.goto(`/lobby/${id}`);
    await waitTown(pp, 'v3'); // a phone gets Classic under Auto (§1.2 row 8)
    await shot(pp, '14-phone-portrait');
    await pp.setViewportSize({ width: 844, height: 390 });
    await pp.waitForTimeout(2000);
    await shot(pp, '15-phone-landscape');
    await phone.close();
  } finally {
    await ctx.close().catch(() => {});
    for (const b of bots) await b.leave().catch(() => {});
  }
});
