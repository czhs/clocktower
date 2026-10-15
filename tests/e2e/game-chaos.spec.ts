// e2e chaos: one Storyteller + 5 players (6 browser contexts; a duplicate tab is a second page in an
// existing context) doing things in unexpected orders during a real game, all through the UI:
//   lobby   rapid Ready clicking; a duplicate tab for one account
//   setup   the ST forces a phase before characters exist (out of order)
//   bedtime a player stuck in someone else's house; a player refreshes; a player closes their tab
//           while being escorted and comes back through the share link
//   night   a player tries to walk out; the ST refreshes while visiting; a player refreshes mid-prompt
//   day     two players nominate at the same moment; the ST rings the bell during a vote; a player
//           refreshes mid-vote; a player hammers Raise/Lower hand
// Every case must end in a sane state with a friendly message: no stuck UI, no raw errors, no page
// errors. Each case is "soft": a failure is recorded as a bug and the game goes on.
// Message-level driving: only the "walk out at night" door request (the UI correctly refuses to send
// it). v2: inside a cottage there is no walking — the room's Leave button / an arrow key leaves. Step log + bugs: tests/e2e/artifacts/game-chaos-<run>.json; screenshots game-chaos-*.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { armConfirm, FrameTap, geo, inject, insidePanel, leaveButton, selfEntity, signUp, storytellerToolsMode, watchConsole, type GamePlayer } from './helpers';

const ART = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts');
const RUN = process.env.GAME_RUN ?? Math.random().toString(36).slice(2, 6);
const suffix = Math.random().toString(36).slice(2, 6);
const NAMES = ['Ivo', 'Jun', 'Kit', 'Lev', 'Mae'].map((n) => `${n} ${suffix}`);

const log: { case: string; ok: boolean; ms: number; note?: string }[] = [];
const bugs: string[] = [];
const consoleSink: string[] = [];

async function chaos(name: string, fn: (note: (s: string) => void) => Promise<void>): Promise<void> {
  await test.step(name, async () => {
    const t0 = Date.now();
    const notes: string[] = [];
    try {
      await fn((s) => notes.push(s));
      log.push({ case: name, ok: true, ms: Date.now() - t0, ...(notes.length ? { note: notes.join('; ') } : {}) });
    } catch (e) {
      const lines = (e as Error).message.replace(/\u001b\[[0-9;]*m/g, '').split('\n');
      const msg = [...lines.slice(0, 4), ...lines.filter((l) => /intercepts pointer|not stable|detached/.test(l)).slice(0, 2)].join(' | ');
      bugs.push(`${name}: ${msg}`);
      log.push({ case: name, ok: false, ms: Date.now() - t0, note: [...notes, msg].join('; ') });
    }
  });
}

async function shot(page: Page, name: string) {
  mkdirSync(ART, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ART, `game-chaos-${name}.png`) }).catch(() => undefined);
}

const gv = (p: GamePlayer) => p.tap.last('game:view');
const lv = (p: GamePlayer) => p.tap.last('lobby:view');
const pidOf = (p: GamePlayer): string => lv(p)?.youPid;
const seatOf = (p: GamePlayer): number => gv(p)?.you?.seat;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace a player's page (reload in a new tab / duplicate tab) keeping one FrameTap per page. */
async function newPageFor(p: GamePlayer, label: string): Promise<{ page: Page; tap: FrameTap }> {
  const page = await p.ctx.newPage();
  watchConsole(page, label, consoleSink);
  page.on('dialog', (d) => void d.accept());
  return { page, tap: new FrameTap(label, page) };
}

/** UI is not stuck: no lost-connection banner, no lingering reconnect banner, the right panel shows. */
async function sane(p: GamePlayer, isSt = false) {
  await expect(p.page.locator('.ct-conn-lost')).toHaveCount(0);
  // (60 s: after a reload the page needs 15-50 s on the shared host just to load the town)
  await expect(p.page.locator('.ct-conn')).toHaveCount(0, { timeout: 60_000 });
  if (isSt) await expect(p.page.locator('.cts, .cts-slim').first()).toBeVisible({ timeout: 60_000 });
  else await expect(p.page.locator('.cth-card')).toBeVisible({ timeout: 60_000 });
}

test.use({ actionTimeout: 120_000 });

test('chaos: unexpected orders, refreshes, duplicate tabs and races during a real game', async ({ browser }) => {
  test.setTimeout(2_400_000);
  mkdirSync(ART, { recursive: true });
  const all: GamePlayer[] = [];
  let lobbyPath = '';
  try {
    const st = await signUp(browser, `ChaosST ${suffix}`, { consoleSink, viewport: { width: 1200, height: 760 } });
    all.push(st);
    // (st-ui) chaos drives the classic Grimoire & tools panel (the default is the simple script)
    await storytellerToolsMode(st);
    for (const [i, n] of NAMES.entries()) all.push(await signUp(browser, n, { viewport: { width: 720, height: 450 }, characterIndex: [3, 6, 9, 12, 16][i]!, consoleSink }));
    const players = all.slice(1);
    const [P1, P2, P3, P4, P5] = players as [GamePlayer, GamePlayer, GamePlayer, GamePlayer, GamePlayer];
    await st.page.getByRole('button', { name: /create lobby/i }).first().click();
    const dialog = st.page.getByRole('dialog', { name: 'Create lobby' });
    await dialog.getByLabel('Lobby name').fill(`Chaos ${suffix}`);
    await dialog.getByLabel(/storyteller seat/i).check();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await st.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
    lobbyPath = new URL(await st.page.getByLabel('Share link').inputValue()).pathname;
    for (const p of players) {
      await p.page.goto(lobbyPath);
      await expect(p.page.getByRole('button', { name: "I'm ready" })).toBeEnabled({ timeout: 60_000 });
    }

    // ------------------------------------------------------------------------------- lobby
    await chaos('L1 rapid Ready clicking (7 clicks in a row) ends consistent with the button', async (note) => {
      const btn = P1.page.locator('.ct-waiting-actions button[aria-pressed]');
      for (let i = 0; i < 7; i++) await btn.click({ delay: 0 });
      await P1.page.waitForTimeout(8000);
      const pressed = (await btn.getAttribute('aria-pressed')) === 'true';
      const server = !!lv(P1).members.find((m: any) => m.pid === pidOf(P1))?.ready;
      note(`button pressed=${pressed}, server ready=${server}, frames sent=${P1.tap.sent('lobby:ready').length}`);
      expect(server, 'server agrees with the button').toBe(pressed);
      expect(pressed, '7 clicks from not-ready = ready').toBe(true);
      await expect(P1.page.getByText('The server did not confirm')).toHaveCount(0);
    });

    await chaos('L2 duplicate tab for one account: the old tab says why it closed; the new tab owns the seat', async (note) => {
      const old = { page: P2.page, tap: P2.tap };
      const n = await newPageFor(P2, `${P2.name} (tab 2)`);
      await n.page.goto(lobbyPath);
      await expect(n.page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 60_000 });
      await expect(old.page.getByText('This account joined the lobby from another tab or device.')).toBeVisible({ timeout: 20_000 });
      await shot(old.page, 'L2-old-tab');
      await old.page.close();
      P2.page = n.page;
      P2.tap = n.tap;
      await P2.tap.until(() => lv(P2)?.youPid, 15_000, 'lobby view in the new tab');
      await P2.page.waitForTimeout(1000);
      const newPid = pidOf(P2);
      await st.tap.until(() => lv(st).members.find((m: any) => m.pid === newPid)?.connected, 15_000, 'ST sees the new tab connected');
      const v = lv(st);
      note(`ST sees members: ${v.members.map((m: any) => `${m.displayName}/${m.role}/${m.connected ? 'on' : 'off'}`).join(', ')}`);
      expect(v.members.filter((m: any) => m.role === 'player').length, 'still 5 players (no ghost seat)').toBe(5);
    });

    for (const p of players) {
      const ready = p.page.getByRole('button', { name: "I'm ready" });
      if (await ready.count()) await ready.click();
    }
    await st.tap.until(() => lv(st)?.canStart, 30_000, 'canStart');
    await st.page.getByRole('button', { name: 'Start game' }).click();
    await st.tap.until(() => gv(st)?.phase === 'setup', 30_000, 'setup');

    // ------------------------------------------------------------------------------- setup
    await chaos('S1 ST forces Night before any characters exist: friendly refusal, nothing changes', async (note) => {
      await st.page.getByRole('button', { name: /Force phase/ }).click();
      await armConfirm(st.page, st.page.locator('.cts-stage').getByRole('button', { name: 'Night', exact: true }));
      const err = st.page.locator('.cts-error');
      await expect(err).toBeVisible({ timeout: 10_000 });
      note(`message: "${(await err.textContent())?.replace('✕', '').trim()}"`);
      expect(gv(st).phase).toBe('setup');
      await st.page.locator('.cts-error').getByRole('button').click();
      await st.page.getByRole('button', { name: /Force phase/ }).click();
    });

    await st.page.locator('.cts-now-btn').click(); // Random setup
    await st.tap.until(() => gv(st).charactersAssigned, 15_000, 'assigned');
    const { L } = await geo();
    const home = (p: GamePlayer) => L.buildings.find((b) => b.houseIndex === seatOf(p))!;

    // ------------------------------------------------------------------------------- bedtime
    await chaos(`B1 ${P2.name} is in someone else's house (${P3.name}'s) when the bell rings: told so, then escorted out and home`, async (note) => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Stage' }).click();
      await st.page.getByRole('button', { name: new RegExp(`^${esc(`${seatOf(P2) + 1}. ${P2.name}`)}`) }).locator('circle').first().click();
      const card = st.page.getByRole('dialog', { name: `Actions for ${P2.name}` });
      await card.getByRole('button', { name: 'Teleport…' }).click();
      await card.locator('.cts-targets select').selectOption(home(P3).id);
      await card.locator('.cts-targets').getByRole('button', { name: 'Go', exact: true }).click();
      await P2.tap.until(() => selfEntity(P2, pidOf(P2))?.location === `bld:${home(P3).id}`, 10_000, 'in P3 house');
      await st.page.locator('.cts-now-btn').click(); // Ring bedtime bell -> first night
      await P2.tap.until(() => gv(P2).phase === 'bedtime', 15_000, 'bedtime');
      await st.page.getByRole('button', { name: '❚❚ Hold' }).click();
      await expect(P2.page.locator('.cth-hint')).toContainText(/not your house|Not your house/, { timeout: 10_000 });
      await expect(P2.page.locator('.ct-compass')).toContainText('Leave this building');
      await expect(insidePanel(P2.page)).toContainText(`${P3.name}’s home`);
      await expect(leaveButton(P2.page)).toBeEnabled(); // the way out is one tap away
      note(`hint: "${(await P2.page.locator('.cth-hint').textContent())?.trim()}"`);
      await shot(P2.page, 'B1-wrong-house');
    });

    await chaos(`B2 ${P4.name} refreshes at bedtime: same phase, same hint, no error`, async () => {
      await P4.page.reload();
      await P4.tap.until(() => gv(P4)?.phase === 'bedtime' && P4.tap.received('game:view', Date.now() - 3000).length > 0, 60_000, 'bedtime after reload');
      await sane(P4);
      await expect(P4.page.locator('.ct-compass')).toContainText(/Go home|home/, { timeout: 60_000 }); // a refreshed page needs up to ~45 s on the shared host
    });

    await chaos(`B3 ${P5.name} closes the tab during the escort and returns through the share link; night still falls`, async (note) => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Tools' }).click();
      const bed = st.page.getByLabel(/Bedtime countdown/);
      await bed.fill('10');
      await bed.locator('xpath=ancestor::form').getByRole('button', { name: 'Set', exact: true }).click();
      await st.tap.until(() => gv(st).bedtimeSeconds === 10, 10_000, '10 s');
      await st.page.getByRole('button', { name: '↻ Restart' }).click();
      await st.page.getByRole('button', { name: '▶ Resume' }).click();
      await P5.tap.until(() => P5.tap.last('world:snapshot')?.you?.mode === 'auto', 40_000, 'escorted');
      await P5.page.close();
      await P5.page.waitForTimeout(3000).catch(() => undefined);
      await st.tap.until(() => gv(st).players.find((x: any) => x.seat === seatOf(P5))?.connected === false, 15_000, 'ST sees P5 offline');
      const n = await newPageFor(P5, `${P5.name} (back)`);
      P5.page = n.page;
      P5.tap = n.tap;
      await P5.page.goto(lobbyPath);
      await P5.tap.until(() => gv(P5)?.you?.seat !== undefined, 60_000, 'back in the game');
      await sane(P5);
      await st.tap.until(() => gv(st).phase === 'first_night', 180_000, 'first night');
      await P5.tap.until(() => gv(P5).phase === 'first_night', 20_000, 'P5 night');
      await P5.tap.until(() => selfEntity(P5, pidOf(P5))?.location === `bld:${home(P5).id}`, 20_000, 'P5 home');
      const p2bad = P2.tap.received('world:teleport').filter((t: any) => !['door', 'storyteller', 'spawn', 'correction'].includes(t.reason));
      note(`P2 non-door teleports: ${JSON.stringify(p2bad.map((t: any) => t.reason))}`);
      expect(selfEntity(P2, pidOf(P2))?.location).toBe(`bld:${home(P2).id}`);
    });

    // ------------------------------------------------------------------------------- night
    await chaos(`N1 ${P1.name} tries to walk out at night: Leave is disabled ("stay home"), an arrow key explains it, a forced request is refused politely`, async (note) => {
      const pid = pidOf(P1);
      const btn = leaveButton(P1.page);
      await expect(btn).toBeDisabled({ timeout: 15_000 });
      note(`Leave button at night: "${(await btn.textContent())?.trim()}"`);
      await expect(btn).toContainText(/stay home|until morning/i);
      const tKey = Date.now();
      await P1.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await P1.page.keyboard.press('ArrowDown');
      await P1.page.waitForTimeout(1200);
      expect(P1.tap.sent('world:useDoor', tKey).length, 'the UI sends no door request at night').toBe(0);
      expect(selfEntity(P1, pid)?.location).toBe(`bld:${home(P1).id}`);
      const t0 = Date.now();
      expect(await inject(P1.page, 'world:useDoor', { buildingId: home(P1).id })).toBe(true);
      const err = await P1.tap.until(() => P1.tap.received('error', t0).find((e: any) => e.for === 'world:useDoor'), 10_000, 'refused');
      note(`server: "${err.message}"`);
      await expect(P1.page.locator('.ct-toast')).toContainText(/stay home/i, { timeout: 5000 });
      expect(selfEntity(P1, pid)?.location).toBe(`bld:${home(P1).id}`);
      await shot(P1.page, 'N1-barred');
    });

    const stPid = pidOf(st);
    await chaos(`N2 the ST refreshes while visiting ${P3.name}: the visit, panel and secrecy survive`, async (note) => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
      const t0 = Date.now();
      await st.page.locator('.cts-grim', { has: st.page.locator('.cts-name', { hasText: P3.name }) }).getByRole('button', { name: 'Visit', exact: true }).click();
      await P3.tap.until(() => gv(P3).storytellerVisitingYou === true, 15_000, 'visited');
      await st.page.reload();
      await st.tap.until(() => gv(st)?.kind === 'storyteller' && st.tap.received('game:view', Date.now() - 2000).length > 0, 60_000, 'ST view after reload');
      await sane(st, true);
      note(`after reload: visitingSeat=${gv(st).visitingSeat}, P3 visited=${gv(P3).storytellerVisitingYou}`);
      expect(gv(st).visitingSeat).toBe(seatOf(P3));
      await expect(st.page.locator('.cts-chip.visit')).toContainText(P3.name);
      expect(gv(P3).storytellerVisitingYou).toBe(true);
      for (const p of [P1, P2, P4, P5])
        for (const s of p.tap.received('world:snapshot', t0)) expect(s.entities.some((e: any) => e.id === stPid), `${p.name} saw the ST`).toBe(false);
    });

    await chaos(`N3 ${P3.name} refreshes with a prompt open: the prompt is still there and can be answered`, async (note) => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
      await st.page.locator('.cts-grim', { has: st.page.locator('.cts-name', { hasText: P3.name }) }).getByRole('button', { name: 'Prompt', exact: true }).click();
      await st.page.getByRole('button', { name: 'Send prompt' }).click();
      const pr = await P3.tap.until(() => gv(P3).prompts?.[0], 15_000, 'prompt');
      await P3.page.reload();
      await P3.tap.until(() => P3.tap.received('game:view', Date.now() - 2000).length > 0, 60_000, 'view after reload');
      const card = P3.page.getByRole('dialog', { name: pr.title });
      await P3.tap.until(() => gv(P3)?.prompts, 30_000, 'game view after reload');
      const tv = Date.now();
      await expect(card).toBeVisible({ timeout: 90_000 });
      note(`after reload: prompts in view=${gv(P3).prompts?.length}, card visible ${Math.round((Date.now() - tv) / 1000)} s after the view arrived`);
      await card.locator('.cth-choices button').first().click();
      await card.getByRole('button', { name: 'Confirm' }).click();
      await P3.tap.until(() => !gv(P3).prompts?.length, 15_000, 'answered');
      note('answered after reload');
      await sane(P3);
    });

    // end the night through the UI
    await st.page.locator('.cts-chip.visit').getByRole('button', { name: 'leave' }).click().catch(() => undefined);
    await armConfirm(st.page, st.page.getByRole('button', { name: 'End night' }));
    for (const p of all) await p.tap.until(() => gv(p)?.phase === 'day', 20_000, 'day');

    // ------------------------------------------------------------------------------- day
    await st.page.locator('.cts-now-btn').click(); // Gather the circle
    await st.tap.until(() => gv(st).gathering, 10_000, 'gathered');
    await armConfirm(st.page, st.page.getByRole('button', { name: 'Force seats' }));
    await st.page.locator('.cts-tabs').getByRole('button', { name: 'Day' }).click();
    await st.page.getByLabel('Nominations open').check();
    for (const p of players) await p.tap.until(() => gv(p).day?.nominationsOpen, 10_000, 'open');

    await chaos(`D1 ${P1.name} and ${P2.name} nominate at the same moment: exactly one nomination, the other is told kindly`, async (note) => {
      for (const p of [P1, P2]) {
        if (!(await p.page.locator('.cth-tabs').count())) await p.page.locator('.cth-card-head').click();
        await p.page.locator('.cth-tabs').getByRole('button', { name: 'Town' }).click();
      }
      const t0 = Date.now();
      // Both buttons are on screen; fire both real buttons' click handlers at the same moment (a
      // Playwright pointer click on a 1-2 fps page would let one nomination land before the other
      // page even renders its click).
      const b1 = P1.page.locator('.cth-players li', { hasText: P4.name }).getByRole('button', { name: 'Nominate' });
      const b2 = P2.page.locator('.cth-players li', { hasText: P5.name }).getByRole('button', { name: 'Nominate' });
      await Promise.all([b1.waitFor(), b2.waitFor()]);
      await Promise.all([b1.evaluate((el) => (el as HTMLButtonElement).click()), b2.evaluate((el) => (el as HTMLButtonElement).click())]);
      await st.tap.until(() => gv(st).day.nominations.length >= 1, 10_000, 'a nomination');
      await st.page.waitForTimeout(2000);
      const noms = gv(st).day.nominations;
      note(`nominations: ${noms.length}`);
      expect(noms.length).toBe(1);
      const loser = [P1, P2].find((p) => p.tap.received('error', t0).some((e: any) => e.for === 'game:nominate'));
      expect(loser, 'the second nominator got a refusal').toBeTruthy();
      const msg = loser!.tap.received('error', t0).find((e: any) => e.for === 'game:nominate').message;
      const toast = await loser!.page.locator('.cth-toast-error').first().textContent({ timeout: 10_000 }).catch(() => null);
      note(`refusal "${msg}" shown as "${toast}"`);
      expect(toast, 'an error toast is shown').toBeTruthy();
      expect(toast!).not.toMatch(/^Another nomination is in progress/); // the friendly wording, not the raw server text
      for (const p of [P1, P2]) await p.page.locator('.cth-card-head').click();
    });

    await chaos('D2 ST rings the bedtime bell while a vote runs: friendly refusal, the vote continues', async (note) => {
      await st.page.locator('.cts-now-btn').click(); // Start vote on …
      await st.tap.until(() => gv(st).day.nominations.some((n: any) => n.status === 'voting'), 10_000, 'voting');
      await st.page.locator('.cts-controls').getByRole('button', { name: 'Ring bedtime bell' }).click();
      const err = st.page.locator('.cts-error');
      await expect(err).toBeVisible({ timeout: 10_000 });
      note(`message: "${(await err.textContent())?.replace('✕', '').trim()}"`);
      expect(gv(st).phase).toBe('day');
    });

    await chaos(`D3 ${P4.name} refreshes mid-vote and ${P5.name} hammers Raise/Lower: states stay consistent`, async (note) => {
      // the 5-seat vote lasts ~7.5 s and is over by now: the ST re-runs it, then the chaos starts
      await st.tap.until(() => gv(st).day.nominations[0].status === 'tallied', 40_000, 'first vote over');
      const t0 = Date.now();
      await armConfirm(st.page, st.page.locator('.cts-stage').getByRole('button', { name: 'Re-vote', exact: true }));
      await st.tap.until(() => st.tap.received('game:view', t0).some((v: any) => v.day?.nominations?.[0]?.status === 'voting'), 15_000, 're-vote running');
      const tRefresh = Date.now();
      let bannerAt: number | null = null;
      let polling = true;
      const poll = (async () => {
        while (polling) {
          if (bannerAt === null && (await P4.page.locator('.ct-conn').count().catch(() => 0))) bannerAt = Date.now();
          await new Promise((r) => setTimeout(r, 400));
        }
      })();
      // main-thread responsiveness of the refreshed page (a busy renderer stops draining its socket)
      const lag: string[] = [];
      const lagProbe = (async () => {
        await P4.page.waitForTimeout(300);
        for (let k = 0; k < 12 && polling; k++) {
          const t = Date.now();
          const ok = await P4.page.evaluate(() => 1).then(() => true, () => false);
          lag.push(`${Math.round((t - tRefresh) / 1000)}s:${ok ? `${Date.now() - t}ms` : 'x'}`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      })();
      const reload = P4.page.reload();
      const hammer = (async () => {
        const btn = P5.page.locator('.cth-hand');
        await btn.waitFor({ timeout: 30_000 });
        // 5 real clicks inside one task (a human mashing the button faster than the page re-renders)
        await btn.evaluate((el) => {
          for (let i = 0; i < 5; i++) (el as HTMLButtonElement).click();
        });
        await P5.page.waitForTimeout(1500);
        const raised = (gv(P5)?.day?.nominations?.[0]?.handsRaised ?? []).includes(seatOf(P5)) || gv(P5)?.day?.nominations?.[0]?.votes?.[seatOf(P5)] === true;
        const pressed = (await btn.getAttribute('aria-pressed', { timeout: 2000 }).catch(() => null)) === 'true';
        note(`after mashing: server hand=${raised}, button pressed=${pressed}, vote frames sent=${P5.tap.sent('game:vote').length}`);
        return raised;
      })().catch((e: Error) => `hammer failed: ${e.message.split('\n')[0]}`);
      await reload;
      const pressed = await hammer;
      await st.tap.until(() => gv(st).day.nominations[0].status === 'tallied', 40_000, 'tallied');
      const n = gv(st).day.nominations[0];
      note(`P5 last pressed=${pressed}, P5 locked vote=${n.votes[seatOf(P5)]}; P4 vote=${n.votes[seatOf(P4)]}`);
      if (typeof pressed === 'boolean') expect(n.votes[seatOf(P5)], 'P5 locked vote = hand state after mashing').toBe(pressed);
      const v4 = gv(P4);
      note(`P4 after reload: phase=${v4?.phase} noms=${JSON.stringify(v4?.day?.nominations?.map((n: any) => n.status))} lobby views=${P4.tap.received('lobby:view').length}`);
      // B1: after the refresh the player must get the live feed back (the client/server watchdogs
      // reconnect a dead feed after ~5 s, with the "reconnecting" banner). Measure it.
      const tReload = Date.now();
      let endedAt: number | null = null;
      const ended = () => gv(P4)?.day?.nominations?.[0]?.status === 'tallied' || (!!gv(P4)?.day && !gv(P4).day.nominations.some((n: any) => n.status === 'voting'));
      while (Date.now() - tReload < 45_000 && endedAt === null) {
        if (ended()) endedAt = Date.now();
        else await P4.page.waitForTimeout(500);
      }
      polling = false;
      await poll;
      await lagProbe;
      const delivered = await P4.page.evaluate(() => JSON.stringify((window as any).__e2e?.delivered ?? {})).catch(() => '?');
      const netFrames = P4.tap.frames.filter((f) => f.dir === 'in' && f.at >= tRefresh);
      const perSec = new Map<number, number>();
      for (const f of netFrames) perSec.set(Math.floor((f.at - tRefresh) / 5000) * 5, (perSec.get(Math.floor((f.at - tRefresh) / 5000) * 5) ?? 0) + 1);
      note(`B1 evidence: main-thread probe (time since refresh: evaluate latency) ${lag.join(' ')}; frames read by the network layer per 5 s since refresh ${JSON.stringify(Object.fromEntries(perSec))}; delivered to page JS per socket ${delivered}`);
      const gvs = P4.tap.frames.filter((f) => f.dir === 'in' && f.type === 'game:view');
      const lastGv = gvs.at(-1);
      const sockets = await P4.page.evaluate(() => `${(window as any).__e2e?.sockets?.map((w: WebSocket) => w.readyState).join(',')} log: ${(window as any).__e2e?.log?.join(' / ')}`).catch(() => '?');
      note(
        `B1 check: vote end seen by ${P4.name} ${endedAt ? `${Math.round((endedAt - tReload) / 1000)} s` : 'NEVER (45 s)'} after the ST's tally; refresh→tally ${Math.round((tReload - tRefresh) / 1000)} s; reconnect banner ${bannerAt ? `shown ${Math.round((bannerAt - tRefresh) / 1000)} s after the refresh` : 'not seen'}; ` +
          `last game:view ${lastGv ? Math.round((Date.now() - lastGv.at) / 1000) : '?'} s ago; sockets [${sockets}]; ST sees P4 connected=${gv(st).players.find((x: any) => x.seat === seatOf(P4))?.connected}`,
      );
      expect(endedAt, `${P4.name} gets the live feed back after a mid-vote refresh`).not.toBeNull();
      await sane(P4);
    });

    await chaos('Z every client is in a sane state at the end (no stuck banners, panels present)', async () => {
      await sane(st, true);
      for (const p of players) await sane(p);
      for (const p of all) await shot(p.page, `Z-end-${p.name.split(' ')[0]}`);
    });
  } finally {
    writeFileSync(path.join(ART, `game-chaos-${RUN}.json`), JSON.stringify({ log, bugs, console: consoleSink }, null, 2));
    await Promise.all(all.map((p) => p.ctx.close().catch(() => undefined)));
  }
  const pageErrors = consoleSink.filter((l) => l.includes('pageerror'));
  expect(pageErrors, 'uncaught page errors').toEqual([]);
  expect(bugs, 'chaos cases').toEqual([]);
});
