// In-game verification of the CMU easter eggs (cmu-eggs): real built client + real server + a
// Storyteller browser (free to roam at night) + one player browser + 4 protocol bots.
// Walks to every egg, screenshots it (docs/screenshots/egg-*.png), exercises every interaction,
// checks night-only behaviour (including a player shut in their home at night), walks through a
// mascot to show it never blocks, and measures frame time and the eggs' own per-frame cost.
// The page-side hook window.__ctEggs exists only because the test sets localStorage.ctEggsDebug.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { isBlockedPx, tileCenterPx } from '../../../protocol/src/index.js';
import { townLayout, townMap } from '../../src/index.js';
import * as W from '../../src/eggs/world.js';
import { createAccount, type Player } from '../../../../tests/e2e/helpers';
import { makeBots, planPath, type Bot } from '../../../../tests/support/bot';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const REPORT = path.join(ROOT, 'test-results', 'eggs-report.json');
const report: Record<string, unknown> = {};
const sx = Math.random().toString(36).slice(2, 6);

type Me = { x: number; y: number; location: string };
const dbg = async <T>(page: Page, expr: string): Promise<T> => {
  const r = (await page.evaluate(`window.__ctEggs.${expr}`)) as T;
  if (/^(setFixedTime|setTimeOffset|repaint|setDark)/.test(expr)) await page.waitForTimeout(250); // let a frame apply it
  return r;
};
const me = (p: Page) => dbg<Me>(p, 'me()');

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  // hide the Storyteller panel and chat for a clean view (CSSOM, allowed by the app's CSP)
  const sel = '.cts, .ct-chat, .ct-chat-toggle';
  await page.evaluate((s) => document.querySelectorAll<HTMLElement>(s).forEach((e) => (e.style.visibility = 'hidden')), sel);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, `egg-${name}.png`) });
  await page.evaluate((s) => document.querySelectorAll<HTMLElement>(s).forEach((e) => (e.style.visibility = '')), sel);
}

async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
}

/** Hold one arrow key until the feet coordinate passes `target` on that axis. */
async function moveAxis(page: Page, axis: 'x' | 'y', target: number) {
  const m0 = await me(page);
  const d = target - m0[axis];
  if (Math.abs(d) < 1.5) return;
  const key = axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : d > 0 ? 'ArrowDown' : 'ArrowUp';
  await page.keyboard.down(key);
  const t0 = Date.now();
  let last = m0[axis];
  let lastMoveAt = Date.now();
  try {
    for (;;) {
      const m = await me(page);
      const r = target - m[axis];
      if (Math.sign(r) !== Math.sign(d) || Math.abs(r) < 1.5) break;
      if (Math.abs(m[axis] - last) > 0.3) [last, lastMoveAt] = [m[axis], Date.now()];
      if (Date.now() - lastMoveAt > 1500) throw new Error(`stuck moving ${key} at ${m.x.toFixed(1)},${m.y.toFixed(1)} -> ${target}`);
      if (Date.now() - t0 > 180_000) throw new Error(`moveAxis timeout at ${m.x.toFixed(1)},${m.y.toFixed(1)} -> ${axis}=${target}`);
      await page.waitForTimeout(10);
    }
  } finally {
    await page.keyboard.up(key);
  }
}

/** Nearest walkable tile (the art lead keeps redecorating; aim for the spot, not the exact tile). */
function nearestWalkable(tile: { x: number; y: number }): { x: number; y: number } {
  for (let r = 0; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = { x: tile.x + dx, y: tile.y + dy };
        const c = tileCenterPx(townLayout, t);
        if (!isBlockedPx(townLayout, c.x, c.y) && planPath(tileCenterPx(townLayout, townLayout.playerSpawn), t, 40_000)) return t;
      }
  return tile;
}

/** Walk (keyboard, along a BFS tile path) to the centre of a tile. */
async function walkTo(page: Page, tile0: { x: number; y: number }) {
  await blur(page);
  const inside = (await me(page)).location !== 'outdoors';
  const tile = inside ? tile0 : nearestWalkable(tile0);
  for (let attempt = 0; attempt < 3; attempt++) {
    const m = await me(page);
    const goal = tileCenterPx(townLayout, tile);
    if (Math.hypot(goal.x - m.x, goal.y - m.y) < 3) return;
    const p = planPath(m, tile, 40_000);
    if (!p) throw new Error(`no path to ${tile.x},${tile.y} from ${m.x},${m.y}`);
    // compress the tile path into straight axis runs
    const runs: { axis: 'x' | 'y'; target: number; dir: number }[] = [];
    let cur = { x: m.x, y: m.y };
    for (const b of p) {
      for (const axis of ['x', 'y'] as const) {
        const d = b[axis] - cur[axis];
        if (Math.abs(d) < 0.5) continue;
        const last = runs[runs.length - 1];
        if (last && last.axis === axis && last.dir === Math.sign(d)) last.target = b[axis];
        else runs.push({ axis, target: b[axis], dir: Math.sign(d) });
      }
      cur = b;
    }
    try {
      for (const r of runs) for (let k = 0; k < 3; k++) await moveAxis(page, r.axis, r.target); // later passes undo overshoot
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      await page.waitForTimeout(300);
    }
  }
}

async function pressE(page: Page) {
  await blur(page);
  report.lastBeforeE = await dbg(page, 'state()');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  report.lastAfterE = await dbg(page, 'state()');
}
const cardText = (page: Page) => page.locator('.ct-egg-card').innerText({ timeout: 10_000 });

async function useDoor(page: Page, buildingDoor: { x: number; y: number }, expectLoc: (l: string) => boolean) {
  await walkTo(page, buildingDoor);
  await pressE(page);
  await expect.poll(async () => expectLoc((await me(page)).location), { timeout: 8000 }).toBe(true);
}

async function fps(page: Page, ms = 4000) {
  return page.evaluate(
    (dur) =>
      new Promise<{ frames: number; p50: number; p95: number; max: number }>((res) => {
        const d: number[] = [];
        let last = performance.now();
        const t0 = last;
        const tick = (t: number) => {
          d.push(t - last);
          last = t;
          if (t - t0 < dur) requestAnimationFrame(tick);
          else {
            d.sort((a, b) => a - b);
            res({ frames: d.length, p50: d[Math.floor(d.length / 2)]!, p95: d[Math.floor(d.length * 0.95)]!, max: d[d.length - 1]! });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test('CMU easter eggs in the real game', async ({ browser }) => {
  test.setTimeout(1_500_000);
  const all: Player[] = [];
  let bots: Bot[] = [];
  try {
    // ------------------------------------------------------------------ lobby: browser ST + browser player + 4 bots
    const st = await createAccount(browser, `Teller ${sx}`);
    const pl = await createAccount(browser, `Wren ${sx}`);
    all.push(st, pl);
    const pageErrors: string[] = [];
    report.pageErrors = pageErrors;
    for (const p of all) {
      p.page.on('pageerror', (e) => pageErrors.push(`${p.name}: ${String(e).slice(0, 300)}`));
      p.page.on('console', (m) => m.type() === 'error' && pageErrors.push(`${p.name} console: ${m.text().slice(0, 300)}`));
      await p.page.evaluate(() => localStorage.setItem('ctEggsDebug', '1'));
      p.page.on('dialog', (d) => void d.accept());
    }
    await st.page.getByRole('button', { name: /create lobby/i }).first().click();
    const dialog = st.page.getByRole('dialog', { name: 'Create lobby' });
    await dialog.getByLabel('Lobby name').fill(`Eggs ${sx}`);
    await dialog.getByLabel(/storyteller seat/i).check();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await st.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
    const lobbyId = new URL(st.page.url()).pathname.split('/').pop()!;
    const base = new URL(st.page.url()).origin;
    bots = await makeBots(4, `egg${sx}-`, base, base.replace('http', 'ws'));
    for (const b of bots) await b.join(lobbyId);
    for (const b of bots) b.send('lobby:ready', { ready: true });
    await pl.page.goto(`/lobby/${lobbyId}`);
    await pl.page.getByRole('button', { name: "I'm ready" }).click();
    await expect(st.page.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 20_000 });

    // waiting room: the eggs are mounted, and the town has the egg objects
    await expect.poll(() => st.page.evaluate(() => !!(window as any).__ctEggs), { timeout: 20_000 }).toBe(true);

    await st.page.getByRole('button', { name: 'Start game' }).click();
    await st.page.getByRole('button', { name: 'Random setup', exact: true }).first().click();
    await st.page.getByRole('button', { name: /Begin first night/ }).first().click();
    await expect.poll(() => dbg<{ phase: string }>(st.page, 'state()').then((s) => s.phase), { timeout: 20_000 }).toBe('first_night');
    await st.page.waitForTimeout(1500);

    const S = st.page;
    // ------------------------------------------------------------------ night (the Storyteller roams)
    // a player shut in their home at night sees none of the outdoor eggs
    await expect.poll(async () => (await me(pl.page)).location, { timeout: 10_000 }).toMatch(/^bld:house-/);
    const plNight = await dbg<any>(pl.page, 'visible()');
    report.playerAtHomeNight = plNight;
    expect(plNight.walkers.every((w: any) => !w.visible)).toBe(true);
    expect([plNight.requin, plNight.polly, plNight.buggy, plNight.chonk, plNight.camp].every((v) => !v)).toBe(true);
    expect(plNight.ghosts).toBe(0);
    expect(plNight.glows).toBe(0);
    await shot(pl.page, 'night-player-home');
    await pl.page.close(); // free the CPU for the Storyteller's browser (the bots keep the seats)

    // walk faster: Storyteller travel speed x4 (Tools tab slider)
    await S.locator('.cts-tabs').getByRole('button', { name: 'Tools' }).click();
    await S.locator('input[type=range]').first().evaluate((el: HTMLInputElement) => {
      el.value = '2';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    report.fpsAtStart = await fps(S, 2000);

    await walkTo(S, { x: 57, y: 37 });
    const vFence = await dbg<any>(S, 'visible()');
    expect(vFence.camp).toBe(true);
    await shot(S, 'fence-night');
    await walkTo(S, { x: 60, y: 36 });
    await pressE(S);
    expect(await cardText(S)).toContain('Layer');
    expect(await cardText(S)).toContain('tartan tent');
    await shot(S, 'fence-card-night');
    await pressE(S); // plaque: E again closes
    await expect(S.locator('.ct-egg-card')).toHaveCount(0);

    // walking to the sky: the wisp at the tip of the pole
    await walkTo(S, { x: 26, y: 16 });
    const tWisp = Math.floor(Date.now() / 1000 / 30) * 30 + 2.4;
    await dbg(S, `setFixedTime(${tWisp})`);
    await shot(S, 'sky-night-wisp');
    await dbg(S, 'setFixedTime(null)');

    // Theo Rem, the night hedgehog, in the well yard (a tombstone when he stops)
    await walkTo(S, { x: 40, y: 30 });
    expect((await dbg<any>(S, 'visible()')).walkers.find((w: any) => w.id === 'theo').visible).toBe(true);
    await shot(S, 'theo-night');

    // the office-hours queue at the crypt
    await walkTo(S, { x: 66, y: 16 });
    const vCrypt = await dbg<any>(S, 'visible()');
    expect(vCrypt.ghosts).toBe(W.GHOST_QUEUE.length);
    expect(vCrypt.walkers.every((w: any) => !w.visible)).toBe(true);
    await shot(S, 'crypt-queue-night');
    await walkTo(S, { x: 71, y: 14 });
    await pressE(S);
    expect(await cardText(S)).toContain('Now serving');
    await shot(S, 'crypt-card-night');
    await pressE(S);

    await walkTo(S, { x: 79, y: 13 });
    // lit windows glow, the hatch's screen glows green, and the broken instrument sparks
    let s0 = Math.floor(Date.now() / 3000);
    while (!W.sparkBurst(s0 * 3 + 0.2).on) s0++;
    await dbg(S, `setFixedTime(${s0 * 3 + 0.2})`);
    const vWean = await dbg<any>(S, 'visible()');
    report.weanNightGlows = vWean.nightGlows;
    expect(vWean.nightGlows).toContain('window');
    expect(vWean.nightGlows).toContain('hatch');
    expect(vWean.nightGlows).toContain('spark');
    await shot(S, 'weanworks-night');
    await dbg(S, 'setFixedTime(null)');

    await walkTo(S, { x: 82, y: 68 });
    const vBridge = await dbg<any>(S, 'visible()');
    expect(vBridge.glows).toBeGreaterThan(0);
    await shot(S, 'bridge-night');

    report.nightStats = await dbg(S, 'stats(true)');

    // ------------------------------------------------------------------ day
    await S.locator('.cts-controls').getByRole('button', { name: /^Day/ }).click();
    await expect.poll(() => dbg<{ phase: string }>(S, 'state()').then((s) => s.phase), { timeout: 20_000 }).toBe('day');
    await S.waitForTimeout(1500);
    await walkTo(S, { x: 82, y: 68 });
    const vBridgeDay = await dbg<any>(S, 'visible()');
    expect(vBridgeDay.glows).toBe(0);
    expect(vBridgeDay.ghosts).toBe(0);
    // the Weanworks: lift (multi-step), the hatch terminal, the workshop errors
    await walkTo(S, { x: 78, y: 12 });
    await shot(S, 'weanworks-day');
    await pressE(S);
    expect(await cardText(S)).toContain('call button');
    for (let i = 0; i < 3; i++) await pressE(S);
    expect(await cardText(S)).toContain('DOES NOT STOP AT 4');
    await shot(S, 'lift-card');
    await pressE(S);
    expect(await cardText(S)).toContain('floor 7');
    await S.keyboard.press('Escape');
    await walkTo(S, { x: 80, y: 10 });
    await pressE(S);
    await expect(S.locator('.ct-egg-terminal')).toBeVisible();
    await S.locator('.ct-egg-cmd', { hasText: './mdriver -V' }).click();
    await S.locator('.ct-egg-cmd', { hasText: './submit' }).click();
    expect(await cardText(S)).toContain('payload overlaps');
    expect(await cardText(S)).toContain('Grace days left');
    await shot(S, 'engine-terminal');
    await pressE(S);
    await expect(S.locator('.ct-egg-card')).toHaveCount(0);
    await walkTo(S, { x: 82, y: 12 });
    await pressE(S);
    for (let i = 0; i < 3; i++) await pressE(S);
    expect(await cardText(S)).toContain('BOOM');
    await shot(S, 'workshop-card');
    await S.keyboard.press('Escape');

    await walkTo(S, { x: 71, y: 14 });
    await pressE(S);
    expect(await cardText(S)).toContain('midnight until dawn');
    await S.keyboard.press('Escape');

    // Polly on the lamp by the shop, then the shop's shelf of absurd textbooks
    const cyc = W.POLLY.stay + W.POLLY.fly;
    let np = Math.floor(Date.now() / 1000 / cyc);
    while (np % W.POLLY.perches.length !== 0) np++;
    const tp = np * cyc;
    const k = 0;
    const perch = W.POLLY.perches[k]!;
    await dbg(S, `setFixedTime(${tp + 10})`);
    await walkTo(S, { x: Math.floor(perch.x / 16) - 1, y: Math.floor(perch.y / 16) + 3 });
    expect((await dbg<any>(S, 'visible()')).polly).toBe(true);
    await shot(S, 'polly');
    await dbg(S, 'setFixedTime(null)');
    const shop = townLayout.buildings.find((b) => b.id === 'shop')!;
    await useDoor(S, shop.door, (l) => l === 'bld:shop');
    await walkTo(S, { x: 146, y: 36 });
    await pressE(S);
    const books: string[] = [await cardText(S)];
    for (let i = 0; i < 9; i++) {
      await pressE(S);
      books.push(await cardText(S));
    }
    expect(books.join('\n')).toContain('Bovik');
    report.books = books.map((b) => b.split('\n')[1]);
    await shot(S, 'shelf-card');
    await S.keyboard.press('Escape');
    await useDoor(S, shop.interiorDoor, (l) => l === 'outdoors');

    // the cows on the east bank (in parallel)
    await dbg(S, 'setFixedTime(1790000000)');
    const cows = W.poseAt(W.planLoop(townLayout, W.WANDERERS.find((w) => w.id === 'cows')!.waypoints), 1790000000, 5, 6, 11, 'cows'.length * 97);
    await walkTo(S, { x: Math.floor(cows.x / 16), y: Math.floor(cows.y / 16) });
    expect((await dbg<any>(S, 'visible()')).walkers.find((w: any) => w.id === 'cows').visible).toBe(true);
    await shot(S, 'cows');

    // Scotty in the square: frozen, then walked straight through (creatures never block)
    const scottyDef = W.WANDERERS.find((w) => w.id === 'scotty')!;
    const sr = W.planLoop(townLayout, scottyDef.waypoints);
    let tS = 1790000000;
    const poseS = (t: number) => W.poseAt(sr, t, scottyDef.speed, scottyDef.walk, scottyDef.rest, 'scotty'.length * 97);
    // a moment when Scotty is on the open north side of his round (row 33/34), bounded search
    for (let i = 0; i < 20000 && !([33, 34].includes(Math.floor(poseS(tS).y / 16)) && poseS(tS).x > 57 * 16 && poseS(tS).x < 64 * 16); i++) tS += 0.5;
    const sp = poseS(tS);
    await dbg(S, `setFixedTime(${tS})`);
    const stile = { x: Math.floor(sp.x / 16), y: Math.floor(sp.y / 16) };
    await walkTo(S, { x: stile.x - 3, y: stile.y });
    expect((await dbg<any>(S, 'visible()')).walkers.find((w: any) => w.id === 'scotty').visible).toBe(true);
    await shot(S, 'scotty');
    report.frameTimeSquare = await fps(S);
    report.eggCostSquare = await dbg(S, 'stats(true)');
    await moveAxis(S, 'x', sp.x + 30); // straight through the dog
    expect((await me(S)).x).toBeGreaterThan(sp.x + 20);
    report.walkedThroughScotty = true;
    await dbg(S, 'setFixedTime(null)');

    // the Fence by day + the noticeboard
    await walkTo(S, { x: 60, y: 36 });
    expect((await dbg<any>(S, 'visible()')).camp).toBe(false);
    await dbg(S, 'repaint(424242)');
    await shot(S, 'fence-day');
    await pressE(S);
    report.fenceCard = await cardText(S);
    await S.keyboard.press('Escape');
    await walkTo(S, { x: 37, y: 29 });
    await pressE(S);
    expect(await cardText(S)).toContain('Village notices');
    report.notices = await cardText(S);
    await shot(S, 'notices');
    await S.keyboard.press('Escape');

    // Honk in the walled garden, the statue by day
    const honkDef = W.WANDERERS.find((w) => w.id === 'honk')!;
    const hp = W.poseAt(W.planLoop(townLayout, honkDef.waypoints), tS, honkDef.speed, honkDef.walk, honkDef.rest, 'honk'.length * 97);
    await dbg(S, `setFixedTime(${tS})`);
    await walkTo(S, { x: 26, y: 15 });
    await shot(S, 'sky-day');
    await walkTo(S, { x: Math.floor(hp.x / 16), y: Math.floor(hp.y / 16) });
    expect((await dbg<any>(S, 'visible()')).walkers.find((w: any) => w.id === 'honk').visible).toBe(true);
    await shot(S, 'honk');
    await dbg(S, 'setFixedTime(null)');

    // Greenting in the well (rare: freeze the clock inside its window)
    await dbg(S, `setFixedTime(${Math.floor(Date.now() / 1000 / W.GREENTING.period) * W.GREENTING.period + 2})`);
    await walkTo(S, { x: 40, y: 30 });
    expect((await dbg<any>(S, 'visible()')).greenting).toBe(true);
    await shot(S, 'greenting');
    await dbg(S, 'setFixedTime(null)');

    // Mincut and Maxflow below the main bridge, Opal in the river
    await walkTo(S, { x: 78, y: 53 });
    const vMM = await dbg<any>(S, 'visible()');
    expect(vMM.fox && vMM.panda).toBe(true);
    await shot(S, 'mincut-maxflow');
    const opalPath = W.riverPath(townMap.ground);
    let to = Math.floor(Date.now() / 1000);
    while (Math.abs(W.opalAt(opalPath, to).y - 56 * 16) > 24) to += 1;
    await dbg(S, `setFixedTime(${to})`);
    expect((await dbg<any>(S, 'visible()')).opal).toBe(true);
    await shot(S, 'opal');
    await dbg(S, 'setFixedTime(null)');

    // the millpond: Requin's fin and Progress & Preservation
    await walkTo(S, { x: 16, y: 72 });
    const vp = await dbg<any>(S, 'visible()');
    expect(vp.requin).toBe(true);
    expect(vp.frogs.some(Boolean)).toBe(true);
    await shot(S, 'pond');
    const tg = Math.ceil(Date.now() / 1000 / W.REQUIN_GRIN.period) * W.REQUIN_GRIN.period + 1;
    await dbg(S, `setFixedTime(${tg})`);
    expect((await dbg<any>(S, 'visible()')).grin).toBe(true);
    await shot(S, 'pond-requin-grin');
    await dbg(S, 'setFixedTime(null)');
    report.frameTimePond = await fps(S);
    report.eggCostPond = await dbg(S, 'stats(true)');

    // Chonk by the south wall (rare: freeze the clock inside its window), then the gate signpost
    const tc = Math.floor(Date.now() / 1000 / W.CHONK.period) * W.CHONK.period + 5;
    await dbg(S, `setFixedTime(${tc})`);
    await walkTo(S, { x: 41, y: 88 });
    expect((await dbg<any>(S, 'visible()')).chonk).toBe(true);
    await shot(S, 'chonk');
    await dbg(S, 'setFixedTime(null)');
    // Cilantro waits just outside the south gate
    await walkTo(S, { x: 54, y: 91 });
    expect((await dbg<any>(S, 'visible()')).cilantro).toBe(true);
    await shot(S, 'cilantro');
    report.dayStats = await dbg(S, 'stats(true)');
    report.ok = true;
  } finally {
    mkdirSync(path.dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    for (const b of bots) await b.leave().catch(() => {});
    for (const p of all) await p.ctx.close();
  }
});
