// v2 Storyteller UI (st-ui): drives a short game AS THE STORYTELLER through the simple default panel
// (apps/client/src/ui/storyteller/script.tsx) — stage cues, Tonight's visits (Next visit / Go / Ask /
// Tell / Done), the day's few buttons — and screenshots it at 1440x900 and 1024x768.
// The Storyteller is a real browser; the seven villagers are protocol bots (tests/support/bot.ts) that
// answer prompts, nominate and vote, so only ONE light Chromium runs.
//
//   CT_AGENT=st-ui scripts/remote.sh bash -c '<build>; <server on 127.0.0.1:3357>; \
//     E2E_BASE_URL=http://127.0.0.1:3357 pnpm exec playwright test -c tests/e2e/playwright.config.ts v2-st-ui'
//   CT_AGENT=st-ui scripts/pull.sh test-results/v2-st-ui      # then copy to docs/screenshots/
// Output: test-results/v2-st-ui/v2-st-ui-*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { FrameTap, inject, installSocketTap } from './helpers';
import { Bot } from '../support/bot.js';
import { fakeClientIp } from '../support/ip.js';

const OUT = path.resolve('test-results/v2-st-ui');
const BIG = { width: 1440, height: 900 };
const SMALL = { width: 1024, height: 768 };
const notes: string[] = [];
const note = (s: string) => {
  notes.push(s);
  console.log(`[st-ui] ${s}`);
};

async function shot(page: Page, name: string, both = true) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `v2-st-ui-${name}-1440.png`) });
  if (!both) return;
  await page.setViewportSize(SMALL);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `v2-st-ui-${name}-1024.png`) });
  await page.setViewportSize(BIG);
  await page.waitForTimeout(500);
}

/** Click a confirm-strip / ConfirmButton "Yes" if one is armed. */
async function yes(page: Page) {
  const strip = page.locator('.cts-armed').getByRole('button', { name: 'Yes' });
  const inline = page.locator('.cts-confirm').getByRole('button', { name: 'Yes' });
  if (await strip.count()) return strip.first().click();
  await expect(inline.first()).toBeVisible();
  await inline.first().click();
}

test('v2 Storyteller script panel: setup → first night visits → day → nominations → bedtime → night → dawn', async ({ browser, baseURL }) => {
  test.setTimeout(480_000);
  const base = baseURL!;
  const ctx = await browser.newContext({ viewport: BIG, extraHTTPHeaders: { 'X-Forwarded-For': fakeClientIp() } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('ct.intro.seen', '1');
      localStorage.setItem('ct.hint.move.v1', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  const tap = new FrameTap('st', page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  const r = await page.request.post('/api/auth/create', { data: { displayName: 'Teller' } });
  expect(r.status(), await r.text()).toBeLessThan(300);
  const lr = await page.request.post('/api/lobbies', { data: { name: 'Stage play', maxPlayers: 15, takeStoryteller: true } });
  expect(lr.status(), await lr.text()).toBeLessThan(300);
  const lobbyId = ((await lr.json()) as { lobby: { id: string } }).lobby.id;
  await page.goto(`/lobby/${lobbyId}`);

  // ---- seven villagers (bots) -------------------------------------------------------------------
  const names = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Gus'];
  const faces = ['frog', 'fox', 'owl', 'moth', 'goat', 'rabbit', 'honk'];
  const wsUrl = base.replace(/^http/, 'ws');
  const bots: Bot[] = [];
  for (const [i, n] of names.entries()) {
    const b = new Bot(n, base, wsUrl, { headers: { 'X-Forwarded-For': fakeClientIp() } });
    await b.signUp();
    await b.join(lobbyId);
    await b.waitFor('lobby:view', () => true, 10_000).catch(() => undefined);
    b.send('lobby:cosmetics', { cosmetics: { skin: 'fair', hair: 'short', hairColor: 'brown', outfit: 'peasant', palette: 'forest', accessory: 'none', ghost: 'wisp', preset: faces[i] } });
    b.send('lobby:ready', { ready: true });
    bots.push(b);
  }
  const seatOf = (b: Bot) => (b.gameView as { you?: { seat: number } } | undefined)?.you?.seat ?? -1;
  const gv = () => tap.last('game:view') as any;
  await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.cts-cuebar')).toBeVisible({ timeout: 30_000 });
  for (const b of bots) await expect.poll(() => seatOf(b), { timeout: 20_000 }).toBeGreaterThanOrEqual(0);

  // ---- setup ------------------------------------------------------------------------------------
  const cue = (id: string) => page.locator(`.cts-cue[data-cue="${id}"]`);
  await expect(cue('setup')).toHaveAttribute('aria-current', 'step');
  await shot(page, '01-setup');
  await page.getByRole('button', { name: /Random setup/ }).click();
  await tap.until(() => gv()?.charactersAssigned, 15_000, 'characters dealt');
  // A known cast so the first night has info steps, prompt steps and the evil-team info.
  const cast = ['washerwoman', 'chef', 'empath', 'fortune_teller', 'monk', 'poisoner', 'imp'];
  await inject(page, 'st:command', {
    type: 'assign_characters',
    assignments: bots.map((b, i) => ({ seat: seatOf(b), character: cast[i] })),
    demonBluffs: ['virgin', 'slayer', 'mayor'],
  });
  await tap.until(() => gv()?.grimoire?.find((g: any) => g.seat === seatOf(bots[6]!))?.character === 'imp', 15_000, 'known cast');
  await expect(cue('bedtime')).toHaveClass(/next/);
  await shot(page, '02-setup-dealt');

  // ---- ring the bell (cue: no confirm from setup) → bedtime → first night ------------------------
  await cue('bedtime').click();
  await tap.until(() => gv()?.phase === 'bedtime', 15_000, 'bedtime');
  await expect(cue('bedtime')).toHaveAttribute('aria-current', 'step');
  await expect(cue('first_night')).toHaveClass(/next/);
  await shot(page, '03-bedtime');
  await cue('first_night').click();
  if (await page.locator('.cts-armed').count()) {
    await shot(page, '04-cue-confirm', false);
    await yes(page);
  }
  await tap.until(() => gv()?.phase === 'first_night', 20_000, 'first night');
  await expect(page.locator('.cts-visits')).toBeVisible();
  await shot(page, '05-first-night-visits');

  // the evil team's info needs no visit
  const give = page.locator('.cts-novisit').getByRole('button', { name: 'Give info' });
  for (let i = 0; i < 4 && (await give.count()); i++) {
    const before = await give.count();
    await give.first().click();
    await expect(give).toHaveCount(before - 1, { timeout: 10_000 });
  }

  /** Run the current visit to completion with the script's own buttons. */
  async function playVisit(row: Locator, label: string, shoot: boolean) {
    const t0 = Date.now();
    let shotTaken = false;
    while (Date.now() - t0 < 30_000) {
      const cls = (await row.getAttribute('class')) ?? '';
      if (/\bfin\b/.test(cls)) return;
      const ask = row.getByRole('button', { name: /^Ask:/ });
      const tell = row.locator('.cts-tell button[type=submit]');
      const done = row.locator('.cts-done');
      const pick = row.locator('select');
      if (shoot && !shotTaken && ((await ask.count()) || (await tell.count()))) {
        await shot(page, `06-visit-${label}`);
        shotTaken = true;
      }
      if (await ask.count()) await ask.click();
      else if ((await tell.count()) && (await tell.textContent())?.includes('Tell them')) await tell.click();
      else if ((await done.count()) && (await done.isEnabled()) && /primary/.test((await done.getAttribute('class')) ?? '')) await done.click();
      else if (Date.now() - t0 > 12_000 && (await pick.count()) && !(await done.isEnabled())) {
        note(`${label}: no answer yet, choosing for them`);
        await pick.selectOption({ index: 1 });
      } else if (Date.now() - t0 > 20_000 && (await done.count()) && (await done.isEnabled())) await done.click();
      await page.waitForTimeout(700);
    }
    throw new Error(`visit ${label} did not finish`);
  }

  let visits = 0;
  for (; visits < 12; visits++) {
    const next = page.locator('.cts-nextvisit');
    if (!(await next.count())) break;
    const label = ((await next.textContent()) ?? '').replace(/^▶ Next visit: /, '').trim();
    await next.click();
    const here = page.locator('.cts-visit.here');
    await expect(here).toBeVisible({ timeout: 15_000 });
    await expect(here).toContainText('you are here');
    note(`visit ${visits + 1}: ${label}`);
    await playVisit(here, String(visits + 1), visits === 0 || visits === 3);
  }
  note(`first night: ${visits} visits via Next visit`);
  expect(visits).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.cts-visits')).not.toContainText('Ask:');
  await shot(page, '07-first-night-all-done');

  // ---- dawn → day ---------------------------------------------------------------------------
  await page.getByRole('button', { name: /Dawn: review the night/ }).click();
  await tap.until(() => gv()?.phase === 'dawn', 15_000, 'dawn');
  await shot(page, '08-dawn', false);
  await page.locator('.cts-script').getByRole('button', { name: /Start the day/ }).click();
  if (await page.locator('.cts-confirm').count()) await yes(page);
  await tap.until(() => gv()?.phase === 'day', 15_000, 'day');
  await expect(cue('gather')).toHaveClass(/next/);
  await shot(page, '09-day');

  // ---- gather + nominations + a vote -----------------------------------------------------------
  await page.getByRole('button', { name: /Gather the circle/ }).click();
  await tap.until(() => gv()?.gathering, 10_000, 'gathered');
  await expect(cue('gather')).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: /Open nominations/ }).click();
  await tap.until(() => gv()?.day?.nominationsOpen, 10_000, 'nominations open');
  const [nominator, nominee] = [bots[0]!, bots[5]!];
  nominator.send('game:nominate', { nomineeSeat: seatOf(nominee) });
  const nomOk = await expect
    .poll(() => gv()?.day?.nominations?.length ?? 0, { timeout: 6_000 })
    .toBeGreaterThan(0)
    .then(() => true)
    .catch(() => false);
  if (!nomOk) {
    note(`bot nomination not accepted (${JSON.stringify(nominator.errors.slice(-1))}); the Storyteller creates it`);
    await inject(page, 'st:command', { type: 'create_nomination', nominatorSeat: seatOf(nominator), nomineeSeat: seatOf(nominee) });
  }
  await expect(page.locator('.cts-noms').getByRole('button', { name: 'Start vote' })).toBeVisible({ timeout: 10_000 });
  await shot(page, '10-nomination');
  await page.locator('.cts-noms').getByRole('button', { name: 'Start vote' }).click();
  const nom = await tap.until(() => gv()?.day?.nominations?.find((n: any) => n.status === 'voting'), 10_000, 'vote running');
  for (const b of bots) b.send('game:vote', { nominationId: nom.id, vote: true });
  await expect(page.locator('.cts-votenow')).toBeVisible();
  await page.waitForTimeout(2500);
  await shot(page, '11-vote');
  await page.getByRole('button', { name: 'Close vote (tally)' }).click();
  await tap.until(() => gv()?.day?.nominations?.every((n: any) => n.status !== 'voting'), 10_000, 'vote closed');
  const block = gv()?.day?.onTheBlock;
  note(`vote tallied: ${JSON.stringify(gv()?.day?.nominations?.map((n: any) => `${n.voteCount}/${n.threshold}`))}; block ${block ? `seat ${block.seat + 1}` : 'none'}`);
  await shot(page, '12-after-vote');

  // ---- the seat list opens the full tools on that player; and back -------------------------------
  await page.locator('.cts-seatcell').first().click();
  await expect(page.locator('.cts-tabs')).toBeVisible();
  await expect(page.locator('.cts-pcard')).toBeVisible();
  await shot(page, '13-grimoire-and-tools');
  await page.getByRole('button', { name: /Back to the script/ }).click();
  await expect(page.locator('.cts-script')).toBeVisible();

  // ---- ring the bedtime bell (confirm: the block is executed) → night --------------------------
  await page.locator('.cts-script').getByRole('button', { name: /Ring the bedtime bell/ }).click();
  await expect(page.locator('.cts-confirm')).toBeVisible();
  await shot(page, '14-bell-confirm', false);
  await yes(page);
  await tap.until(() => gv()?.phase === 'bedtime' || gv()?.pendingResult, 15_000, 'bedtime');
  if (gv()?.pendingResult) {
    note(`game end detected after the execution: ${JSON.stringify(gv().pendingResult)} — overriding to keep playing`);
    await page.getByRole('button', { name: 'Override (continue)' }).first().click();
    await tap.until(() => !gv()?.pendingResult, 10_000, 'override');
    if (gv()?.phase !== 'bedtime') await inject(page, 'st:command', { type: 'advance_phase', to: 'bedtime' });
    await tap.until(() => gv()?.phase === 'bedtime', 15_000, 'bedtime');
  }
  await page.locator('.cts-script').getByRole('button', { name: /Night falls/ }).click();
  if (await page.locator('.cts-confirm').count()) await yes(page);
  await tap.until(() => gv()?.phase === 'night', 20_000, 'night 2');
  await shot(page, '15-night-2');
  // one visit with Next, then jump to dawn with the cue (confirm: visits left)
  const next2 = page.locator('.cts-nextvisit');
  if (await next2.count()) {
    await next2.click();
    await expect(page.locator('.cts-visit.here')).toBeVisible({ timeout: 15_000 });
    await shot(page, '16-night-2-visit', false);
  }
  await cue('dawn').click();
  if (await page.locator('.cts-armed').count()) {
    await shot(page, '17-dawn-confirm', false);
    await yes(page);
  }
  await tap.until(() => gv()?.phase === 'dawn', 15_000, 'dawn 2');
  await shot(page, '18-dawn-2');

  // ---- keyboard: the cues are reachable and Escape disarms a jump --------------------------------
  await cue('setup').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.cts-armed')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cts-armed')).toHaveCount(0);
  expect(gv()?.phase).toBe('dawn');

  writeFileSync(path.join(OUT, 'notes.txt'), [...notes, ...errors].join('\n'));
  expect(errors, errors.join('\n')).toEqual([]);
  for (const b of bots) await b.leave().catch(() => undefined);
  await ctx.close();
});
