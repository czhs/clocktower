// M3: a full Storyteller-guided round in 6 real browsers (1 Storyteller + 5 players).
//
// Every action is driven through the UI (Storyteller panel, HUD, waiting room): no message is
// injected. What each browser RECEIVED is verified by decoding its WebSocket frames (FrameTap), so
// the secrecy assertions are about the actual bytes each client got, not about what the UI shows.
// Screenshots of key moments go to tests/e2e/artifacts/m3-*.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createAccount, type Player } from './helpers';

const ART = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts');
const suffix = Math.random().toString(36).slice(2, 6);
const ST_NAME = `Teller ${suffix}`;
const PLAYER_NAMES = ['Ada', 'Bram', 'Cora', 'Dov', 'Esme'].map((n) => `${n} ${suffix}`);

/** Step log written to artifacts/m3-steps.json (which steps were UI-driven, what was verified). */
const steps: { step: string; driver: 'ui' | 'message' | 'observe'; ok: boolean; ms: number; note?: string }[] = [];
async function step<T>(name: string, driver: 'ui' | 'message' | 'observe', fn: () => Promise<T>, note?: string): Promise<T> {
  return test.step(name, async () => {
    const t0 = Date.now();
    try {
      const r = await fn();
      steps.push({ step: name, driver, ok: true, ms: Date.now() - t0, ...(note ? { note } : {}) });
      return r;
    } catch (e) {
      steps.push({ step: name, driver, ok: false, ms: Date.now() - t0, note: (e as Error).message.split('\n')[0] });
      throw e;
    }
  });
}

async function shot(page: Page, name: string) {
  mkdirSync(ART, { recursive: true });
  await page.waitForTimeout(600); // let Phaser draw a couple of frames
  await page.screenshot({ path: path.join(ART, `m3-${name}.png`) });
}

const readyRetries: string[] = [];
let voteNote = '';
const gv = (p: Player) => p.tap.last('game:view');
const pidOf = (p: Player): string => p.tap.last('lobby:view')?.youPid;

test('M3: Storyteller-guided round with 1 ST + 5 players', async ({ browser }) => {
  // Generous budget: six software-rendered Phaser pages on a host shared with other test runs
  // (load avg ~30 on 12 cores observed) can take minutes just to load the town.
  test.setTimeout(1_200_000);
  mkdirSync(ART, { recursive: true });
  const all: Player[] = [];
  try {
    // ---------------------------------------------------------------- accounts + lobby
    const st = await step('6 accounts created through the UI', 'ui', async () => {
      const s = await createAccount(browser, ST_NAME);
      all.push(s);
      // Smaller player viewports halve the software-rendering cost per page; assertions are unchanged.
      for (const n of PLAYER_NAMES) all.push(await createAccount(browser, n, { width: 960, height: 600 }));
      return s;
    });
    const players = all.slice(1);
    st.page.on('dialog', (d) => void d.accept()); // "Declare GOOD the winner?" confirm

    const shareUrl = await step('ST creates a lobby taking the Storyteller seat', 'ui', async () => {
      await st.page.getByRole('button', { name: /create lobby/i }).first().click();
      const dialog = st.page.getByRole('dialog', { name: 'Create lobby' });
      await dialog.getByLabel('Lobby name').fill(`M3 round ${suffix}`);
      await dialog.getByLabel(/storyteller seat/i).check();
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();
      await st.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
      return st.page.getByLabel('Share link').inputValue();
    });

    await step('5 players open the share URL and press Ready', 'ui', async () => {
      for (const p of players) {
        await p.page.goto(new URL(shareUrl).pathname);
        // Click, then confirm the server acknowledged it (button flips to "Not ready"); retry if not.
        for (let attempt = 1; ; attempt++) {
          await p.page.getByRole('button', { name: "I'm ready" }).click();
          const ok = await p.page.getByRole('button', { name: 'Not ready' }).waitFor({ timeout: 4000 }).then(() => true, () => false);
          if (ok) break;
          const sentReady = p.tap.sent('lobby:ready').length;
          const views = p.tap.received('lobby:view').length;
          readyRetries.push(`${p.name}: attempt ${attempt} not acknowledged (lobby:ready frames sent so far: ${sentReady}, lobby:view received: ${views})`);
          if (attempt >= 3) throw new Error(`${p.name}: Ready not acknowledged after 3 clicks`);
        }
      }
      await st.tap.until(() => {
        const v = st.tap.last('lobby:view');
        return v && v.members.filter((m: any) => m.role === 'player' && m.ready).length === 5 && v.canStart;
      }, 20_000, '5 ready players + canStart');
      await shot(st.page, '1-waiting-room');
    });
    if (readyRetries.length) steps.at(-1)!.note = `ready click retries: ${readyRetries.join('; ')}`;

    // ---------------------------------------------------------------- start + setup
    await step('ST starts the game', 'ui', async () => {
      await st.page.getByRole('button', { name: 'Start game' }).click();
      await st.tap.until(() => gv(st)?.kind === 'storyteller' && gv(st).phase === 'setup', 15_000, 'ST view in setup');
    });

    const grimoire = await step('ST random setup (Grimoire filled)', 'ui', async () => {
      await st.page.getByRole('button', { name: 'Random setup', exact: true }).click();
      return st.tap.until(() => gv(st)?.grimoire?.length === 5 && gv(st).grimoire, 10_000, 'grimoire with 5 entries');
    });

    await step('ST begins the first night; every player learns only their own character', 'ui', async () => {
      await st.page.getByRole('button', { name: 'Begin first night' }).click();
      for (const p of players) {
        const v = await p.tap.until(() => gv(p)?.phase === 'first_night' && gv(p).you?.role && gv(p), 15_000, 'first night + role');
        expect(v.kind).toBe('player');
        const g = grimoire.find((e: any) => e.seat === v.you.seat);
        expect(v.you.role.character).toBe(g.believedCharacter);
      }
      for (const p of players) for (const v of p.tap.received('game:view')) expect(v.kind).toBe('player');
    });

    const nightStart = Date.now();
    await step('Night isolation: each player is in their own home and their snapshots show nobody else', 'observe', async () => {
      await players[0]!.page.waitForTimeout(2500);
      for (const p of players) {
        const seat = gv(p).you.seat;
        const me = pidOf(p);
        const snaps = p.tap.received('world:snapshot', nightStart + 1000);
        expect(snaps.length, `${p.name} got snapshots`).toBeGreaterThan(5);
        for (const s of snaps) {
          for (const e of s.entities) {
            expect(e.id, `${p.name} saw another entity at night`).toBe(me);
            expect(e.location).toBe(`bld:house-${seat}`);
          }
        }
        expect(snaps.some((s: any) => s.entities.some((e: any) => e.id === me)), `${p.name} sees itself`).toBe(true);
      }
      await shot(players[0]!.page, '2-first-night-player');
      await shot(st.page, '3-first-night-storyteller');
    });

    // ---------------------------------------------------------------- night visit
    const visited = players[2]!;
    const vSeat: number = gv(visited).you.seat;
    const stPid = pidOf(st);
    let visitAt = 0;
    await step('ST fast-travels (Visit) into one player\'s home', 'ui', async () => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
      visitAt = Date.now();
      await st.page.locator('.cts-grim', { has: st.page.locator('.cts-name', { hasText: visited.name }) }).getByRole('button', { name: 'Visit' }).click();
      await st.tap.until(() => gv(st)?.visitingSeat === vSeat, 10_000, 'ST visitingSeat');
    });

    await step('Only the visited player sees the ST entity and "The Storyteller is in your home"', 'observe', async () => {
      await visited.tap.until(() => gv(visited)?.storytellerVisitingYou === true, 10_000, 'storytellerVisitingYou');
      await visited.tap.until(
        () => visited.tap.received('world:snapshot', visitAt).some((s: any) => s.entities.some((e: any) => e.id === stPid)),
        10_000,
        'ST entity in visited snapshot',
      );
      await expect(visited.page.getByText('The Storyteller is in your home')).toBeVisible();
      await visited.page.waitForTimeout(1500);
      for (const p of players.filter((x) => x !== visited)) {
        for (const s of p.tap.received('world:snapshot', visitAt)) expect(s.entities.some((e: any) => e.id === stPid), `${p.name} saw the ST`).toBe(false);
        for (const v of p.tap.received('game:view', visitAt)) expect(v.storytellerVisitingYou).toBe(false);
        expect(p.tap.received('sound', visitAt).some((s: any) => s?.cue === 'visit'), `${p.name} heard a visit cue`).toBe(false);
        await expect(p.page.getByText('The Storyteller is in your home')).toHaveCount(0);
      }
      expect(visited.tap.received('sound', visitAt).some((s: any) => s?.cue === 'visit')).toBe(true);
      await shot(visited.page, '4-night-visit-visited-player');
    });

    // ---------------------------------------------------------------- day, nomination, vote
    await step('ST advances to day', 'ui', async () => {
      await st.page.locator('.cts-controls').getByRole('button', { name: /^Day/ }).click();
      for (const p of players) await p.tap.until(() => gv(p)?.phase === 'day', 15_000, 'day');
    });

    // Nominee: a good, non-Virgin, non-Saint player (so the execution has no special trigger).
    const nomineeEntry = grimoire.find((g: any) => g.alignment === 'good' && !['virgin', 'saint'].includes(g.character) && g.seat !== gv(players[0]!).you.seat);
    const nominee = players.find((p) => gv(p).you.seat === nomineeEntry.seat)!;
    const nominator = players.find((p) => p !== nominee)!;

    await step('ST opens nominations; a player nominates through the HUD', 'ui', async () => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Day' }).click();
      await st.page.getByLabel('Nominations open').check();
      await nominator.tap.until(() => gv(nominator)?.day?.nominationsOpen, 10_000, 'nominations open');
      await nominator.page.locator('.cth-players li', { hasText: nominee.name }).getByRole('button', { name: 'Nominate' }).click();
      await nominator.page.locator('.cth-players li', { hasText: nominee.name }).getByRole('button', { name: /^Confirm nominating/ }).click(); // (qol) two-step
      await st.tap.until(() => gv(st)?.day?.nominations?.length === 1, 10_000, 'nomination recorded');
    }, `${nominator.name} nominated ${nominee.name} (${nomineeEntry.character})`);

    await step('ST starts the vote; 4 players raise hands; clock hand tallies', 'ui', async () => {
      await st.page.getByRole('button', { name: 'Start vote' }).click();
      const voters = players.filter((p) => p !== nominee);
      // The clock hand locks one seat every 1.5 s, so a hand raised after the hand passed is too late
      // (the button disappears): bound each click and record who made it.
      const outcome = await Promise.all(
        voters.map((p) =>
          p.page.getByRole('button', { name: 'Raise hand' }).click({ timeout: 6000 }).then(
            () => `${p.name}: raised`,
            () => `${p.name}: missed (hand already passed)`,
          ),
        ),
      );
      voteNote = outcome.join('; ');
      await shot(nominator.page, '5-day-vote-clock');
      await st.tap.until(() => gv(st)?.day?.onTheBlock?.seat === nomineeEntry.seat, 20_000, 'nominee on the block');
      const n = gv(st).day.nominations[0];
      expect(n.status).toBe('tallied');
      expect(n.voteCount).toBeGreaterThanOrEqual(3);
    });
    steps.at(-1)!.note = voteNote;

    await step('ST executes; the executed player becomes a ghost with a ghost vote', 'ui', async () => {
      await st.page.locator('.cts-block').getByRole('button', { name: 'Execute' }).click();
      const v = await nominee.tap.until(() => gv(nominee)?.you?.alive === false && gv(nominee), 10_000, 'nominee dead');
      expect(v.you.ghostVoteAvailable).toBe(true);
      await expect(nominee.page.locator('.cth-card-head').getByText('Dead', { exact: true })).toBeVisible();
      await expect(nominee.page.getByText('Ghost vote available')).toBeVisible();
      for (const p of players) {
        const row = gv(p).players.find((x: any) => x.seat === nomineeEntry.seat);
        expect(row.alive).toBe(false);
        expect(row.ghostVoteAvailable).toBe(true);
      }
      await expect(nominator.page.locator('.cth-players li', { hasText: nominee.name }).getByTitle('Dead — ghost vote available')).toBeVisible();
      await shot(nominee.page, '6-executed-ghost');
    });

    // ---------------------------------------------------------------- end
    await step('ST declares a winner; every client shows the endgame reveal', 'ui', async () => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Tools' }).click();
      await st.page.getByRole('button', { name: 'Good wins' }).click();
      for (const p of all) {
        await p.tap.until(() => gv(p)?.result, 10_000, 'result');
        const dlg = p.page.getByRole('dialog', { name: 'Game results' });
        await expect(dlg).toBeVisible();
        await expect(dlg.getByRole('heading', { name: 'Good wins' })).toBeVisible();
        for (const g of grimoire) await expect(dlg.getByRole('row', { name: new RegExp(g.name) })).toBeVisible();
        expect(gv(p).result.reveal).toHaveLength(5);
      }
      await shot(players[1]!.page, '7-endgame-reveal');
    });

    await step('No player ever received Storyteller-only data during the round', 'observe', async () => {
      const forbidden = ['grimoire', 'nightQueue', 'demonBluffs', 'visitingSeat', 'believedCharacter'];
      for (const p of players)
        for (const f of p.tap.frames.filter((f) => f.dir === 'in' && f.type === 'game:view' && !f.payload?.result)) {
          const json = JSON.stringify(f.payload);
          for (const k of forbidden) expect(json.includes(`"${k}"`), `${p.name} got ${k}`).toBe(false);
        }
    });
  } finally {
    writeFileSync(path.join(ART, 'm3-steps.json'), JSON.stringify(steps, null, 2));
    await Promise.all(all.map((p) => p.ctx.close().catch(() => undefined)));
  }
});
