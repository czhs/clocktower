// v2 visual walkthrough (lead): 1 Storyteller + 7 players, driven through the protocol (fast),
// screenshots of the one-screen town at the key moments. Run:
//   CT_AGENT=lead scripts/remote.sh bash -c 'pnpm exec playwright test -c tests/e2e/playwright.config.ts v2-look'
// Output: test-results/v2-look/*.png
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { inject, installSocketTap } from './helpers';

const OUT = path.resolve('test-results/v2-look');
let ipNo = 0;

async function account(browser: Browser, name: string, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { 'X-Forwarded-For': `10.88.${process.pid % 200}.${++ipNo}` } });
  await installSocketTap(ctx);
  // first-visit tour + hints off
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('ct.intro.seen', '1');
      localStorage.setItem('ct.hint.move.v1', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  const r = await page.request.post('/api/auth/create', { data: { displayName: name } });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { name, ctx, page };
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function gameView(page: Page): Promise<{ phase: string } | null> {
  return page.evaluate(() => {
    const t = (window as unknown as { __town?: { gview?: { phase: string } } }).__town;
    return (t as unknown as { gview?: { phase: string } } | undefined)?.gview ?? null;
  });
}

test('v2 look: day, inside, bedtime, night, phone', async ({ browser }) => {
  test.setTimeout(600_000);
  const st = await account(browser, 'Teller');
  const lr = await st.page.request.post('/api/lobbies', { data: { name: 'V2 look', maxPlayers: 15, takeStoryteller: true } });
  expect(lr.status(), await lr.text()).toBeLessThan(300);
  const id = ((await lr.json()) as { lobby: { id: string } }).lobby.id;
  await st.page.goto(`/lobby/${id}`);
  await st.page.waitForTimeout(2500);
  await shot(st.page, '00-waiting-st');

  const names = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Gus'];
  const players = [];
  for (const n of names) {
    const p = await account(browser, n);
    await p.page.goto(`/lobby/${id}`);
    await expect(p.page.getByRole('button', { name: "I'm ready" })).toBeEnabled({ timeout: 30_000 });
    await p.page.getByRole('button', { name: "I'm ready" }).click();
    await expect(p.page.getByRole('button', { name: 'Not ready' })).toBeVisible({ timeout: 10_000 });
    players.push(p);
  }
  await expect(st.page.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 20_000 });
  await shot(players[0]!.page, '01-waiting-player');
  await st.page.getByRole('button', { name: 'Start game' }).click();
  await st.page.waitForTimeout(2500);
  await inject(st.page, 'st:command', { type: 'random_setup' });
  await st.page.waitForTimeout(800);
  await inject(st.page, 'st:command', { type: 'force_phase', to: 'day' });
  await st.page.waitForTimeout(3000);
  await shot(st.page, '02-day-st');
  await shot(players[0]!.page, '03-day-player');

  // two players go into Bram's cottage (seat 1) together, one into their own
  await inject(st.page, 'st:command', { type: 'teleport', who: [0, 2], to: { kind: 'building', buildingId: 'house-1' } });
  await inject(st.page, 'st:command', { type: 'teleport', who: [4], to: { kind: 'home' } });
  await st.page.waitForTimeout(2500);
  await shot(players[0]!.page, '04-inside-two');
  await shot(players[1]!.page, '05-day-boards');

  // gather: everyone walks to the circle
  await inject(st.page, 'st:command', { type: 'teleport', who: 'all', to: { kind: 'square' } });
  await st.page.waitForTimeout(1000);
  await inject(st.page, 'st:command', { type: 'gather', on: true });
  await st.page.waitForTimeout(7000);
  await shot(st.page, '06-gathered-st');

  await inject(st.page, 'st:command', { type: 'gather', on: false });
  await inject(st.page, 'st:command', { type: 'force_phase', to: 'bedtime' });
  await st.page.waitForTimeout(2500);
  await shot(players[3]!.page, '07-bedtime-player');
  await inject(st.page, 'st:command', { type: 'force_phase', to: 'night' });
  await st.page.waitForTimeout(4000);
  await shot(st.page, '08-night-st');
  await shot(players[2]!.page, '09-night-player-home');
  // the Storyteller visits seat 2 (Cleo)
  await inject(st.page, 'st:command', { type: 'visit_home', seat: 2 });
  await st.page.waitForTimeout(2500);
  await shot(players[2]!.page, '10-night-visit-player');
  await shot(st.page, '11-night-visit-st');

  // phone portrait + landscape for one player (day)
  await inject(st.page, 'st:command', { type: 'leave_home' });
  await inject(st.page, 'st:command', { type: 'force_phase', to: 'day' });
  await st.page.waitForTimeout(2500);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addCookies(await players[5]!.ctx.cookies());
  await phone.addInitScript(() => {
    try {
      localStorage.setItem('ct.intro.seen', '1');
      localStorage.setItem('ct.hint.move.v1', '1');
    } catch {}
  });
  const pp = await phone.newPage();
  await pp.goto(`/lobby/${id}`);
  await pp.waitForTimeout(5000);
  await shot(pp, '12-phone-portrait');
  await pp.setViewportSize({ width: 844, height: 390 });
  await pp.waitForTimeout(2000);
  await shot(pp, '13-phone-landscape');
  void gameView;
});
