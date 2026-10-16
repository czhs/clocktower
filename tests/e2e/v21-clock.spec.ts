// v2.1 town clock + automatic games (clock-client): an AUTOMATIC lobby with 5 accounts, driven
// mostly through the protocol (fast), checked in real Chromium: the create dialog's mode choice, the
// waiting room (mode + timings), the finder's mode badge, the clock chip + tower dial by day, a "+2
// min" proposal that the others vote through (the clock really extends), and a 390x844 phone view.
// Screenshots -> test-results/v21-clock/*.png (copied to docs/screenshots/v21-clock-*.png). Run
// against a throwaway server (never 3000/3001):
//   E2E_BASE_URL=http://127.0.0.1:3358 pnpm exec playwright test -c tests/e2e/playwright.config.ts v21-clock
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { FrameTap, inject, installSocketTap, stPanelMode } from './helpers';

const OUT = path.resolve('test-results/v21-clock');
let ipNo = 0;

interface P {
  name: string;
  ctx: import('@playwright/test').BrowserContext;
  page: Page;
  tap: FrameTap;
}

const SMALL = { width: 720, height: 540 }; // background players: keep the shared host light

async function account(browser: Browser, name: string, viewport = { width: 1280, height: 800 }): Promise<P> {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { 'X-Forwarded-For': `10.89.${process.pid % 200}.${++ipNo}` } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('ct.intro.seen', '1');
      localStorage.setItem('ct.hint.move.v1', '1');
      localStorage.setItem('ct.help.seen', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  const tap = new FrameTap(name, page);
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  const r = await page.request.post('/api/auth/create', { data: { displayName: name } });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { name, ctx, page, tap };
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

type Clock = { stage: string; endsAt: number | null; remainingMs: number | null; paused: boolean; totalMs: number; proposal?: { id: string; by: string; minutes: number; yes: string[]; no: string[]; needed: number } | null };
type GView = { kind: string; phase: string; storytellerMode?: string; clock?: Clock | null; you?: { pid: string } };
const lastView = (p: P) => p.tap.last('game:view') as GView | undefined;

test('v2.1 clock: automatic lobby, chip + dial, +2 min vote, phone', async ({ browser }) => {
  test.setTimeout(900_000);
  const ada = await account(browser, 'Ada');

  // the create dialog offers the mode (screenshot only; the lobby itself is created via the API)
  await ada.page.reload();
  await ada.page.getByRole('button', { name: 'Create lobby' }).click();
  await ada.page.getByLabel('Lobby name').fill('Clock town');
  await ada.page.locator('.ct-mode-opt', { hasText: 'Automatic' }).click();
  await expect(ada.page.getByText('You play too.')).toBeVisible();
  await shot(ada.page, '01-create-automatic');
  await ada.page.getByRole('button', { name: 'Create', exact: true }).click();
  await ada.page.waitForURL(/\/lobby\//, { timeout: 20_000 });
  const id = ada.page.url().split('/lobby/')[1]!.replace(/\/$/, '');
  const summary = (await (await ada.page.request.get(`/api/lobbies/${id}`)).json()) as { lobby: { storytellerMode?: string } };
  test.skip(summary.lobby.storytellerMode !== 'auto', 'server does not support automatic lobbies yet (LobbySummary.storytellerMode missing)');

  // waiting room: "Automatic game" + timings steppers for the host; speed the night up for the test
  await expect(ada.page.getByRole('heading', { name: 'Automatic game' })).toBeVisible({ timeout: 20_000 });
  await ada.page.getByRole('button', { name: 'Longer discussion' }).click();
  await expect(ada.page.locator('.ct-timing', { hasText: 'Discussion' })).toContainText('6 min');
  await shot(ada.page, '02-waiting-auto-host');
  await inject(ada.page, 'lobby:settings', { autoTimings: { nightSec: 20, bedtimeSec: 15, discussionMin: 6 } });

  const others: P[] = [];
  for (const n of ['Bram', 'Cleo', 'Dov', 'Esme']) {
    const p = await account(browser, n, n === 'Bram' ? undefined : SMALL);
    await p.page.goto(`/lobby/${id}`);
    await expect(p.page.getByRole('button', { name: "I'm ready" })).toBeEnabled({ timeout: 30_000 });
    await p.page.getByRole('button', { name: "I'm ready" }).click();
    others.push(p);
  }
  await shot(others[0]!.page, '03-waiting-auto-player');
  // the finder shows the mode on the lobby card
  const finder = await others[3]!.ctx.newPage();
  await finder.goto('/');
  await expect(finder.locator('.ct-lobby', { hasText: 'Clock town' }).locator('.ct-mode-badge')).toHaveText('Automatic', { timeout: 15_000 });
  await finder.locator('.ct-lobby', { hasText: 'Clock town' }).scrollIntoViewIfNeeded();
  await shot(finder, '04-finder-badge');
  await finder.close();

  await ada.page.getByRole('button', { name: "I'm ready" }).click();
  const start = ada.page.getByRole('button', { name: 'Start game' });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();

  // the automatic Storyteller deals, runs the first night and wakes the town: wait for the day clock
  const all = [ada, ...others];
  await ada.tap.until(() => {
    const v = lastView(ada);
    return v?.phase === 'day' && v.clock?.stage === 'discussion' && v.clock.endsAt !== null;
  }, 240_000, 'day with a running discussion clock');
  const v0 = lastView(ada)!;
  expect(v0.storytellerMode).toBe('auto');
  for (const p of all) await expect(p.page.locator('.ctc-chip')).toContainText('Nominations open in', { timeout: 20_000 });
  await expect(ada.page.locator('.ctc-time')).toHaveText(/^\d+:\d\d$/);
  // no Storyteller affordances in an automatic game
  await expect(ada.page.locator('.cts')).toHaveCount(0);
  await shot(ada.page, '05-day-chip-and-dial');

  // Ada asks for +2 min: one tap opens the inline row, one tap proposes
  const endsBefore = v0.clock!.endsAt!;
  await ada.page.getByRole('button', { name: 'Ask the town for more time' }).click();
  await expect(ada.page.locator('.ctc-tray')).toBeVisible();
  await shot(ada.page, '06-plus-time-tray');
  await ada.page.locator('.ctc-tray').getByRole('button', { name: '+2 min' }).click();
  const prop = await others[0]!.tap.until(() => lastView(others[0]!)?.clock?.proposal ?? null, 15_000, 'proposal visible to Bram');
  expect(prop.minutes).toBe(2);
  await expect(others[0]!.page.locator('.ctc-vote-title')).toHaveText('Ada proposes +2 min');
  await expect(ada.page.locator('.ctc-vote-title')).toHaveText('You propose +2 min');
  // while the vote is open "+ time" is disabled with a reason
  await expect(ada.page.locator('.ctc-plus')).toHaveAttribute('aria-disabled', 'true');
  await shot(others[0]!.page, '07-vote-card');

  // Bram + Cleo vote yes (with Ada's automatic yes that is a majority of 5)
  await others[0]!.page.locator('.ctc-vote').getByRole('button', { name: 'Yes' }).click();
  await expect(others[0]!.page.locator('.ctc-yes')).toHaveAttribute('aria-pressed', 'true');
  await shot(others[0]!.page, '08-voted-yes');
  await others[1]!.page.locator('.ctc-vote').getByRole('button', { name: 'Yes' }).click();
  await expect(ada.page.locator('.ctc-result')).toContainText('+2 min added', { timeout: 15_000 });
  await shot(ada.page, '09-added');
  const after = await ada.tap.until(() => {
    const c = lastView(ada)?.clock;
    return c && !c.proposal && c.endsAt !== null && c.endsAt - endsBefore >= 110_000 ? c : null;
  }, 15_000, 'clock extended by ~2 min');
  expect(after.endsAt! - endsBefore).toBeLessThan(130_000);
  await expect(ada.page.locator('.ctc-result')).toHaveCount(0, { timeout: 8000 });

  // phone portrait (a second session for Esme)
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addCookies(await others[3]!.ctx.cookies());
  await phone.addInitScript(() => {
    try {
      localStorage.setItem('ct.intro.seen', '1');
      localStorage.setItem('ct.hint.move.v1', '1');
    } catch {}
  });
  const pp = await phone.newPage();
  await pp.goto(`/lobby/${id}`);
  await expect(pp.locator('.ctc-chip')).toBeVisible({ timeout: 30_000 });
  // the chip must not overlap the toolbar or the character card
  const chip = (await pp.locator('.ctc-chip').boundingBox())!;
  expect(chip.x).toBeGreaterThanOrEqual(0);
  expect(chip.x + chip.width).toBeLessThanOrEqual(390);
  for (const sel of ['.ct-toolbar', '.cth-card-head']) {
    const b = await pp.locator(sel).first().boundingBox();
    if (b) expect(chip.y >= b.y + b.height || chip.y + chip.height <= b.y || chip.x >= b.x + b.width || chip.x + chip.width <= b.x, `chip overlaps ${sel}`).toBe(true);
  }
  await shot(pp, '10-phone-portrait');
  // a second proposal from the phone (Esme), so the phone vote card is visible too
  await pp.getByRole('button', { name: 'Ask the town for more time' }).tap();
  await pp.locator('.ctc-tray').getByRole('button', { name: '+1 min' }).tap();
  await expect(pp.locator('.ctc-vote-title')).toHaveText('You propose +1 min', { timeout: 15_000 });
  await shot(pp, '11-phone-vote-card');
  await phone.close();

  // the host can end the automatic game (there is no Storyteller): confirm -> everyone back in the waiting room
  const abort = ada.page.getByRole('button', { name: 'Abort game' });
  await expect(abort).toBeVisible();
  await expect(others[0]!.page.getByRole('button', { name: 'Abort game' })).toHaveCount(0);
  await shot(ada.page, '12-host-abort-button');
  await abort.click(); // the confirm() dialog is accepted by the page's dialog handler
  await expect(others[0]!.page.getByRole('heading', { name: 'Automatic game' })).toBeVisible({ timeout: 20_000 });
  for (const p of all) await p.ctx.close();
});

test('v2.1 clock: human game, Storyteller sets the clock from the script panel', async ({ browser }) => {
  test.setTimeout(600_000);
  const st = await account(browser, 'Teller');
  const lr = await st.page.request.post('/api/lobbies', { data: { name: 'Clock human', maxPlayers: 15, takeStoryteller: true } });
  expect(lr.status(), await lr.text()).toBeLessThan(300);
  const id = ((await lr.json()) as { lobby: { id: string } }).lobby.id;
  await st.page.goto(`/lobby/${id}`);
  const players: P[] = [];
  for (const n of ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme']) {
    const p = await account(browser, n, n === 'Ada' || n === 'Bram' ? undefined : SMALL);
    await p.page.goto(`/lobby/${id}`);
    await expect(p.page.getByRole('button', { name: "I'm ready" })).toBeEnabled({ timeout: 30_000 });
    await p.page.getByRole('button', { name: "I'm ready" }).click();
    players.push(p);
  }
  await expect(st.page.getByRole('heading', { name: 'Storyteller', exact: true })).toBeVisible();
  await expect(st.page.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 20_000 });
  await st.page.getByRole('button', { name: 'Start game' }).click();
  await st.tap.until(() => lastView(st)?.phase === 'setup', 20_000, 'setup');
  await inject(st.page, 'st:command', { type: 'random_setup' });
  await st.page.waitForTimeout(800);
  await inject(st.page, 'st:command', { type: 'force_phase', to: 'day' });
  await st.tap.until(() => lastView(st)?.phase === 'day', 20_000, 'day');
  await stPanelMode(st.page, 'script');

  // no clock yet: no chip anywhere
  await expect(players[0]!.page.locator('.ctc-chip')).toHaveCount(0);
  const ctl = st.page.locator('.ctc-stctl');
  await expect(ctl).toContainText('not set');
  await ctl.getByRole('button', { name: 'Discussion' }).click();
  await expect(ctl).toContainText('Nominations open in', { timeout: 10_000 });
  for (const p of players) await expect(p.page.locator('.ctc-chip')).toContainText(/Nominations open in\s*[45]:\d\d/, { timeout: 15_000 });
  // human games: nobody can propose extensions
  await expect(players[0]!.page.locator('.ctc-plus')).toHaveCount(0);
  await shot(st.page, '20-human-st-clock-control');
  await shot(players[0]!.page, '21-human-player-chip');

  await ctl.getByRole('button', { name: /Pause/ }).click();
  await expect(players[0]!.page.locator('.ctc-chip')).toContainText('Paused', { timeout: 10_000 });
  await expect(players[0]!.page.locator('.ctc-chip')).toHaveClass(/ctc-paused/);
  await shot(players[0]!.page, '22-human-paused');
  await ctl.getByRole('button', { name: /Resume/ }).click();
  await ctl.getByRole('button', { name: 'Fewer minutes' }).click(); // 4 min
  await ctl.getByRole('button', { name: 'Nominations' }).click();
  await st.tap.until(() => lastView(st)?.clock?.stage === 'nominations', 10_000, 'nominations clock');
  await expect(players[1]!.page.locator('.ctc-chip')).toContainText(/(Nominations close|Execution) in\s*[34]:\d\d/, { timeout: 10_000 });
  const before = lastView(st)!.clock!.endsAt!;
  await ctl.getByRole('button', { name: '+1m' }).click();
  await st.tap.until(() => (lastView(st)?.clock?.endsAt ?? 0) - before >= 59_000, 10_000, '+1 min');
  await shot(players[1]!.page, '23-human-nominations-chip');

  // phone portrait for one player
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addCookies(await players[2]!.ctx.cookies());
  await phone.addInitScript(() => {
    try {
      localStorage.setItem('ct.intro.seen', '1');
      localStorage.setItem('ct.hint.move.v1', '1');
    } catch {}
  });
  const pp = await phone.newPage();
  await pp.goto(`/lobby/${id}`);
  await expect(pp.locator('.ctc-chip')).toBeVisible({ timeout: 30_000 });
  const chip = (await pp.locator('.ctc-chip').boundingBox())!;
  expect(chip.x + chip.width).toBeLessThanOrEqual(390);
  for (const sel of ['.ct-toolbar', '.cth-card-head', '.cth-phase']) {
    const b = await pp.locator(sel).first().boundingBox();
    if (b) expect(chip.y >= b.y + b.height || chip.y + chip.height <= b.y || chip.x >= b.x + b.width || chip.x + chip.width <= b.x, `chip overlaps ${sel}`).toBe(true);
  }
  await shot(pp, '24-human-phone-portrait');
  await ctl.getByRole('button', { name: 'Clear the town clock' }).click();
  await expect(players[0]!.page.locator('.ctc-chip')).toHaveCount(0, { timeout: 10_000 });
  await phone.close();
  for (const p of [st, ...players]) await p.ctx.close();
});
