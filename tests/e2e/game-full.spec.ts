// e2e: a COMPLETE game of Blood on the Clocktower (Trouble Brewing) in 6 real browsers — 1 Storyteller
// + 5 players — driven through the UI the way people would on a game night (v2 one-screen town:
// automatic doors, tap-a-cottage, fixed room view with a Leave button, Storyteller click-to-teleport):
//   1 sign up (character pick from the v2 roster) -> create lobby (ST seat) -> share link -> join ->
//     Ready -> Start; every player keeps a distinct character
//   2 random setup; roles stay secret until the first night, then each player sees their own card
//   3 bedtime bell -> one player taps their cottage (walks there, goes in), another walks home with the
//     real keyboard and walks INTO the doorway (no E key); the ST holds / shortens / restarts the
//     countdown, everyone else is escorted; night falls only once everyone is home
//   4 first night: own home only; the ST clicks a cottage on the map (teleport_self = a visit) and
//     sends info, leaves with the room's Leave button, visits a second player from the night order
//     and prompts them; the other three see/hear nothing of it
//   5 dawn -> day: nobody is moved; one player leaves home with the Leave button, one with an arrow
//     key; a private conversation: a player taps a neighbour's cottage and goes in — the two inside
//     share that cottage's voice zone, a third player outside stays in the square zone (decoded
//     voice:grant frames) and sees neither of them
//   6 gather -> walk (ST "walk to seat") / force seats -> nomination -> clock-hand vote -> raised hands
//     -> "your vote counted" -> execution -> the executed player is a ghost with a ghost vote
//   7 second day: the ghost vote is used; a second ghost-vote attempt is refused (UI + modified client)
//   8 ST overrides from the panel: undo a wrong kill, teleport into a cottage, door tags setting, door
//     lock (Leave button disabled + a modified client's door request refused), freeze/unfreeze, force phase
//   9 executing the Demon -> pending result -> ST Confirm -> endgame reveal everywhere -> Play again
//     -> the lobby resets cleanly
// Every UI assertion is paired with protocol truth from decoded WebSocket frames (FrameTap): what each
// browser was actually SENT. Message-level driving is used ONLY for the modified-client ghost vote in
// step 7 and the modified-client door request in 8d (the UI correctly offers no way to do either). Screenshots: tests/e2e/artifacts/game-*.png; step
// log with pass/fail + notes: tests/e2e/artifacts/game-full-steps.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  armConfirm,
  confirmYes,
  geo,
  inject,
  insidePanel,
  leaveButton,
  leaveByButton,
  leaveByKey,
  selfEntity,
  signUp,
  tapCottage,
  tapLockedCottage,
  voiceZone,
  walkIntoDoor,
  zonesGranted,
  type GamePlayer,
} from './helpers';

const ART = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts');
const RUN = process.env.GAME_RUN ?? Math.random().toString(36).slice(2, 6);
/** Debug only: skip the (slow, ~7 min on the shared host) keyboard walks. Real runs leave it unset. */
const FAST = process.env.GAME_FAST === '1';
const suffix = Math.random().toString(36).slice(2, 6);
const ST_NAME = `Teller ${suffix}`;
const NAMES = ['Ada', 'Bram', 'Cora', 'Dov', 'Esme'].map((n) => `${n} ${suffix}`);

type Driver = 'ui' | 'message' | 'observe' | 'ui+message';
interface StepLog {
  step: string;
  driver: Driver;
  ok: boolean;
  ms: number;
  note?: string;
}
const steps: StepLog[] = [];
const notes: string[] = [];
const bugs: string[] = [];
const consoleSink: string[] = [];

async function step<T>(name: string, driver: Driver, fn: () => Promise<T>): Promise<T> {
  return test.step(name, async () => {
    const t0 = Date.now();
    pending = [];
    const extra = () => (pending.length ? pending.join('; ') : undefined);
    try {
      const r = await fn();
      steps.push({ step: name, driver, ok: true, ms: Date.now() - t0, ...(extra() ? { note: extra() } : {}) });
      return r;
    } catch (e) {
      const msg = (e as Error).message.replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(Boolean).slice(0, 4).join(' | ');
      steps.push({ step: name, driver, ok: false, ms: Date.now() - t0, note: [extra(), msg].filter(Boolean).join('; ') });
      throw e;
    } finally {
      pending = [];
    }
  });
}
/** A check that should not abort the whole game: record a bug and continue. */
async function soft(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = `${name}: ${(e as Error).message.split('\n').slice(0, 4).join(' | ')}`;
    bugs.push(msg);
    steps.push({ step: `(soft) ${name}`, driver: 'observe', ok: false, ms: 0, note: msg });
  }
}
let pending: string[] = [];
const note = (s: string) => {
  notes.push(s);
  pending.push(s);
};

async function shot(page: Page, name: string) {
  mkdirSync(ART, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ART, `game-${name}.png`) }).catch(() => undefined);
}

const gv = (p: GamePlayer) => p.tap.last('game:view');
const lv = (p: GamePlayer) => p.tap.last('lobby:view');
const pidOf = (p: GamePlayer): string => lv(p)?.youPid;
const seatOf = (p: GamePlayer): number => gv(p)?.you?.seat;
const tps = (p: GamePlayer, since: number) => p.tap.received('world:teleport', since);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Storyteller-only keys that must never appear in a player's game:view before the game is over. */
const FORBIDDEN = ['"grimoire"', '"nightQueue"', '"demonBluffs"', '"visitingSeat"', '"believedCharacter"', '"stage"', '"presence"', '"timerHeld"', '"pendingResult"', '"isRedHerring"', '"accountId"'];

test.use({ actionTimeout: 120_000 });

test('full game: 1 Storyteller + 5 players, every phase through the real UI', async ({ browser }) => {
  test.setTimeout(3_000_000);
  mkdirSync(ART, { recursive: true });
  const all: GamePlayer[] = [];
  let st!: GamePlayer;
  let players: GamePlayer[] = [];
  try {
    // ============================================================== 1. accounts, lobby, ready, start
    await step('1a 6 accounts signed up through the UI, each picking a character from the roster', 'ui', async () => {
      st = await signUp(browser, ST_NAME, { characterIndex: 0, consoleSink, viewport: { width: 1200, height: 760 } });
      all.push(st);
      // villagers 2,5,8,11 and a CMU mascot (index 14): all distinct
      for (let i = 0; i < NAMES.length; i++) all.push(await signUp(browser, NAMES[i]!, { viewport: { width: 720, height: 450 }, characterIndex: [2, 5, 8, 11, 14][i]!, consoleSink }));
      players = all.slice(1);
      for (const p of all) expect(p.presetId, `${p.name}: picked character saved on the account`).toBe(p.character);
      expect(new Set(players.map((p) => p.character)).size, 'five different characters').toBe(5);
    });

    const shareUrl = await step('1b ST creates a lobby taking the Storyteller seat; share link shown', 'ui', async () => {
      await st.page.getByRole('button', { name: /create lobby/i }).first().click();
      const dialog = st.page.getByRole('dialog', { name: 'Create lobby' });
      await dialog.getByLabel('Lobby name').fill(`Full game ${suffix}`);
      await dialog.getByLabel(/storyteller seat/i).check();
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();
      await st.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
      const url = await st.page.getByLabel('Share link').inputValue();
      expect(new URL(url).pathname).toBe(new URL(st.page.url()).pathname);
      await st.tap.until(() => lv(st)?.members.find((m: any) => m.pid === pidOf(st))?.role === 'storyteller', 15_000, 'ST seat');
      return url;
    });

    await step('1c 5 players open the share link and press Ready once', 'ui', async () => {
      for (const p of players) {
        await p.page.goto(new URL(shareUrl).pathname);
        const ready = p.page.getByRole('button', { name: "I'm ready" });
        await expect(ready).toBeEnabled({ timeout: 60_000 });
        const before = p.tap.sent('lobby:ready').length;
        const tClick = Date.now();
        await ready.click();
        const clickMs = Date.now() - tClick;
        if (clickMs > 5000) note(`${p.name}: the Ready click took ${Math.round(clickMs / 1000)} s to land (page busy loading the town)`);
        await expect(p.page.getByRole('button', { name: 'Not ready' })).toBeVisible({ timeout: 10_000 });
        await p.tap.until(() => lv(p)?.members.find((m: any) => m.pid === pidOf(p))?.ready, 15_000, 'server marks me ready');
        const sent = p.tap.sent('lobby:ready').length - before;
        if (sent !== 1) note(`${p.name}: ${sent} lobby:ready frames for one click`);
      }
      await st.tap.until(() => lv(st)?.canStart, 20_000, 'canStart');
      await expect(st.page.getByText('Everyone is ready — start when you like.')).toBeVisible();
      // the character each player picked is what the lobby shows (public cosmetics, no account ids)
      for (const p of all) {
        const m = lv(st).members.find((x: any) => x.displayName === p.name);
        expect(m?.cosmetics?.preset, `${p.name} character in lobby`).toBe(p.presetId);
        expect(JSON.stringify(lv(p))).not.toContain('accountId');
      }
      const picks = lv(st).members.filter((m: any) => m.role === 'player').map((m: any) => m.cosmetics.preset);
      expect(new Set(picks).size, `no duplicate characters (${picks.join(',')})`).toBe(5);
      await shot(st.page, '01-waiting-room');
    });

    await step('1d ST starts the game', 'ui', async () => {
      await st.page.getByRole('button', { name: 'Start game' }).click();
      await st.tap.until(() => gv(st)?.kind === 'storyteller' && gv(st).phase === 'setup', 30_000, 'ST view in setup');
      for (const p of players) await p.tap.until(() => gv(p)?.phase === 'setup', 30_000, 'setup');
    });

    // ============================================================== 2. setup
    const grimoire: any[] = await step('2 ST random setup; players still see only "Awaiting your character" (roles arrive with the first night)', 'ui', async () => {
      await expect(st.page.locator('.cts-now-btn')).toContainText('Random setup');
      await st.page.locator('.cts-now-btn').click();
      const g = await st.tap.until(() => gv(st)?.grimoire?.length === 5 && gv(st).charactersAssigned && gv(st).grimoire, 15_000, 'grimoire with 5 entries');
      await players[0]!.page.waitForTimeout(1500);
      for (const p of players) {
        expect(gv(p).you.role ?? null, `${p.name}: no role before the first night`).toBeNull();
        await expect(p.page.locator('.cth-card-head')).toContainText('Awaiting your character');
      }
      note(`setup: ${g.map((x: any) => `${x.seat + 1}:${x.character}${x.believedCharacter !== x.character ? `(thinks ${x.believedCharacter})` : ''}`).join(' ')}`);
      return g;
    });
    const bySeat = (seat: number) => players.find((p) => seatOf(p) === seat)!;
    const grim = (seat: number) => grimoire.find((g) => g.seat === seat)!;
    const isDemon = (seat: number) => grim(seat).character === 'imp';

    // ============================================================== 3. bedtime bell -> first night
    const { L } = await geo();
    const doorDist = (p: GamePlayer) => {
      const e = selfEntity(p, pidOf(p));
      const h = L.buildings.find((b) => b.houseIndex === seatOf(p))!;
      return e ? Math.hypot(h.door.x * 16 - e.x, h.door.y * 16 - e.y) : 1e9;
    };
    const walker = [...players].sort((a, b) => doorDist(a) - doorDist(b))[0]!;
    /** Walks home with the real keyboard and walks into the doorway (automatic door). */
    const keyWalker = [...players].filter((p) => p !== walker).sort((a, b) => doorDist(a) - doorDist(b))[0]!;
    const homeOf = (p: GamePlayer) => L.buildings.find((b) => b.houseIndex === seatOf(p))!;
    let bellAt = 0;
    await step('3a ST rings the bedtime bell; nobody is moved by the bell; players are told to walk home', 'ui', async () => {
      await expect(st.page.locator('.cts-now-btn')).toContainText(/bell/i);
      bellAt = Date.now();
      await st.page.locator('.cts-now-btn').click();
      for (const p of all) await p.tap.until(() => gv(p)?.phase === 'bedtime', 15_000, 'bedtime');
      // hold the countdown at once so the keyboard walker has time on a CPU-starved host
      await st.page.getByRole('button', { name: '❚❚ Hold' }).click();
      await st.tap.until(() => gv(st).timerHeld === true, 10_000, 'timer held');
      await expect(st.page.locator('.cts-now-top')).toContainText('Countdown held');
      await expect(st.page.locator('.cts-now-top')).not.toContainText('you were away');
      await expect(walker.page.locator('.cth-phase')).toContainText('Bedtime — first night');
      await expect(walker.page.locator('.cth-hint')).toContainText(/walk home|Walk home/, { timeout: 15_000 });
      await expect(walker.page.locator('.ct-compass')).toContainText('Go home');
      await expect(walker.page.locator('.ct-game-caption')).toContainText(/tap your cottage/i, { timeout: 10_000 }).catch(() => note('bedtime caption ("tap your cottage") not seen (it fades after ~4 s)'));
      await walker.page.waitForTimeout(1000);
      for (const p of players) expect(tps(p, bellAt), `${p.name}: moved by the bell`).toEqual([]);
      await shot(walker.page, '02-bedtime-walk-home');
      await shot(st.page, '03-bedtime-st-timer');
    });

    await step(`3b ${walker.name} taps their cottage on the map: walks there and goes in (automatic door, no teleport)`, 'ui', async () => {
      const pid = pidOf(walker);
      const h = homeOf(walker);
      const t0 = Date.now();
      note(`tap log: ${(await tapCottage(walker, pid, h.id)).join(' | ')}`);
      await expect(walker.page.locator('.ct-compass')).toContainText('You are home', { timeout: 15_000 });
      await expect(insidePanel(walker.page)).toContainText('Your home');
      await expect(leaveButton(walker.page)).toBeVisible(); // (bedtime: still allowed to step out again)
      note(`inside panel at bedtime: "${(await insidePanel(walker.page).textContent())?.trim()}"`);
      const moves = walker.tap.sent('move', t0).length;
      expect(moves, 'walked there (move frames sent)').toBeGreaterThan(3);
      const bad = tps(walker, bellAt).filter((t: any) => !['door', 'correction'].includes(t.reason));
      expect(bad, 'walker: only door transitions').toEqual([]);
      const corr = tps(walker, bellAt).filter((t: any) => t.reason === 'correction').length;
      if (corr) note(`${corr} movement corrections while walking home`);
      await st.tap.until(() => gv(st).stage?.players.find((x: any) => x.seat === seatOf(walker))?.presence === 'home', 15_000, 'ST sees walker home');
      await shot(walker.page, '02b-bedtime-home-inside');
      expect(gv(st).phase).toBe('bedtime'); // others are not home: no night yet
    });

    if (!FAST) await step(`3b' ${keyWalker.name} walks home with the real keyboard and walks into the doorway (no E key)`, 'ui', async () => {
      const pid = pidOf(keyWalker);
      const h = homeOf(keyWalker);
      const t0 = Date.now();
      await walkIntoDoor(keyWalker, pid, h.id);
      await expect(keyWalker.page.locator('.ct-compass')).toContainText('You are home', { timeout: 15_000 });
      expect(keyWalker.tap.sent('world:useDoor', t0).map((d: any) => d.buildingId), 'one automatic door request for home').toContain(h.id);
      const bad = tps(keyWalker, bellAt).filter((t: any) => !['door', 'correction'].includes(t.reason));
      expect(bad, 'keyboard walker: only door transitions').toEqual([]);
      await st.tap.until(() => gv(st).stage?.players.find((x: any) => x.seat === seatOf(keyWalker))?.presence === 'home', 15_000, 'ST sees keyboard walker home');
    });

    await step('3c ST shortens the countdown (Tools: 10 s), restarts and resumes it; at 0 the others are escorted (no teleport); night falls only when all are home', 'ui', async () => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Tools' }).click();
      const bed = st.page.getByLabel(/Bedtime countdown/);
      await bed.fill('10');
      await bed.locator('xpath=ancestor::form').getByRole('button', { name: 'Set', exact: true }).click();
      await st.tap.until(() => gv(st).bedtimeSeconds === 10, 10_000, 'bedtimeSeconds 10');
      await st.page.getByRole('button', { name: '↻ Restart' }).click();
      await st.page.getByRole('button', { name: '▶ Resume' }).click();
      await st.tap.until(() => gv(st).phaseEndsAt && gv(st).phaseEndsAt - Date.now() < 12_000 && !gv(st).timerHeld, 10_000, '10 s countdown running');
      const others = players.filter((p) => p !== walker && (FAST || p !== keyWalker));
      await st.tap.until(() => gv(st).bedtimeOvertime === true || gv(st).phase === 'first_night', 30_000, 'overtime');
      for (const p of others) await p.tap.until(() => p.tap.last('world:snapshot')?.you?.mode === 'auto' || gv(p).phase === 'first_night', 15_000, 'escorted');
      await expect(others[0]!.page.locator('.cth-hint')).toContainText(/walks you home|walking you home/, { timeout: 10_000 }).catch(() => note('escort hint not seen on screen (may have faded)'));
      await shot(others[0]!.page, '04-bedtime-escorted');
      await st.tap.until(() => gv(st).phase === 'first_night', 180_000, 'first night falls');
      // night fell only after every player was home: the last ST view before the first first_night view shows all home
      const stFrames = st.tap.frames.filter((f) => f.dir === 'in' && f.type === 'game:view' && f.at >= bellAt);
      const firstNight = stFrames.findIndex((f) => f.payload.phase === 'first_night');
      const prev = stFrames.slice(0, firstNight).reverse().find((f) => f.payload.stage);
      expect(prev?.payload.stage.players.every((x: any) => x.presence === 'home'), 'all home before nightfall').toBe(true);
      for (const p of players) {
        const bad = tps(p, bellAt).filter((t: any) => !['door', 'correction'].includes(t.reason));
        expect(bad.map((t: any) => t.reason), `${p.name}: teleported at bedtime`).toEqual([]);
      }
    });

    // ============================================================== 4. first night
    const nightAt = Date.now();
    await step('4a first night: each player sees their own character card and only their own home', 'observe', async () => {
      for (const p of players) {
        const v = await p.tap.until(() => gv(p)?.phase === 'first_night' && gv(p).you?.role && gv(p), 15_000, 'role');
        const g = grim(v.you.seat);
        expect(v.you.role.character).toBe(g.believedCharacter);
        await expect(p.page.locator('.cth-card-head')).toContainText(new RegExp(esc(charLabel(g.believedCharacter)), 'i'));
      }
      await players[0]!.page.waitForTimeout(2500);
      for (const p of players) {
        const me = pidOf(p);
        const snaps = p.tap.received('world:snapshot', nightAt + 500);
        expect(snaps.length).toBeGreaterThan(3);
        for (const s of snaps) for (const e of s.entities) expect(e.id, `${p.name} saw someone at night`).toBe(me);
        expect(selfEntity(p, me)?.location).toBe(`bld:${homeOf(p).id}`);
      }
      // open one card to show the role
      await players[1]!.page.locator('.cth-card-head').click();
      await shot(players[1]!.page, '05-first-night-role-card');
      await players[1]!.page.locator('.cth-card-head').click();
      await shot(st.page, '06-first-night-st-night-order');
    });

    const stPid = pidOf(st);
    const queue = () => gv(st).nightQueue as any[];
    const seatSteps = queue().filter((s) => s.seat !== null);
    const infoStep: any = seatSteps.find((s) => s.suggestedInfo) ?? seatSteps[0];
    const promptStep: any = seatSteps.find((s) => s.seat !== infoStep?.seat && s.prompt) ?? seatSteps.find((s) => s.seat !== infoStep?.seat);
    // Some setups have no seat-specific first-night steps: then the ST visits from the Grimoire.
    const seatA: number = infoStep?.seat ?? players.map(seatOf)[0]!;
    const seatB: number = promptStep?.seat ?? players.map(seatOf).find((x) => x !== seatA)!;
    if (!infoStep || !promptStep) note(`night order has ${seatSteps.length} seat steps: visiting from the Grimoire instead`);
    const A = bySeat(seatA);
    const B = bySeat(seatB);
    const unvisited = players.filter((p) => p !== A && p !== B);
    let visitAt = 0;
    const stepRow = (id: string) => st.page.locator('.cts-steps > li').nth(queue().findIndex((s) => s.id === id));
    /** Fast travel: the night-order step's Visit button, else the Grimoire row's Visit. */
    const visit = async (stepV: any, who: GamePlayer) => {
      if (stepV) {
        await st.page.locator('.cts-tabs').getByRole('button', { name: 'Night order' }).click();
        await stepRow(stepV.id).getByRole('button', { name: 'Visit', exact: true }).click();
      } else {
        await st.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
        await st.page.locator('.cts-grim', { has: st.page.locator('.cts-name', { hasText: who.name }) }).getByRole('button', { name: 'Visit', exact: true }).click();
      }
    };

    await step(`4b ST clicks ${A.name}'s cottage on the map (click-to-teleport = a visit, with a poof) and sends info from the night order`, 'ui', async () => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Night order' }).click();
      visitAt = Date.now();
      note(`ST tap log: ${(await tapCottage(st, stPid, homeOf(A).id, { storyteller: true })).join(' | ')}`);
      const tp = st.tap.received('world:teleport', visitAt).filter((t: any) => t.location === `bld:${homeOf(A).id}`);
      expect(tp.at(-1)?.reason, 'the ST arrives by a Storyteller teleport').toBe('storyteller');
      await st.tap.until(() => gv(st).visitingSeat === seatOf(A), 15_000, 'visiting A');
      await expect(insidePanel(st.page)).toContainText(A.name, { timeout: 15_000 });
      await shot(st.page, '06b-night-st-inside-visit');
      await A.tap.until(() => gv(A).storytellerVisitingYou === true, 15_000, 'A: visited');
      await A.tap.until(() => A.tap.received('world:snapshot', visitAt).some((s: any) => s.entities.some((e: any) => e.id === stPid)), 15_000, 'A sees the ST');
      await expect(A.page.locator('.cth-hint')).toContainText(/Storyteller is visiting you|Private visit/, { timeout: 10_000 });
      let text: string;
      if (infoStep?.suggestedInfo) {
        text = infoStep.suggestedInfo.text;
        await stepRow(infoStep.id).getByRole('button', { name: 'Send info', exact: true }).click();
      } else {
        text = `You hear a raven at midnight ${suffix}.`;
        await st.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
        await st.page.locator('.cts-grim', { has: st.page.locator('.cts-name', { hasText: A.name }) }).getByRole('button', { name: 'Info', exact: true }).click();
        await st.page.getByPlaceholder('What they learn…').fill(text);
        await st.page.getByRole('button', { name: 'Send info', exact: true }).click();
      }
      await A.tap.until(() => gv(A).info?.some((i: any) => i.text === text), 15_000, 'A got the info');
      await A.page.locator('.cth-card-head').click();
      await A.page.locator('.cth-tabs').getByRole('button', { name: /Notes/ }).click();
      await expect(A.page.locator('.cth-log')).toContainText(text.slice(0, 30));
      await shot(A.page, '07-night-visit-info');
      await A.page.locator('.cth-card-head').click();
    });

    await step(`4c ST leaves ${A.name}'s home with the room's Leave button, visits ${B.name} from the night order and prompts them; the player answers in their HUD`, 'ui', async () => {
      await leaveByButton(st, stPid);
      await st.tap.until(() => gv(st).visitingSeat === null, 10_000, 'visit over after Leave');
      await A.tap.until(() => gv(A).storytellerVisitingYou === false, 15_000, 'A no longer visited');
      await visit(promptStep, B);
      await st.tap.until(() => gv(st).visitingSeat === seatOf(B), 15_000, 'visiting B');
      await A.tap.until(() => gv(A).storytellerVisitingYou === false, 15_000, 'A no longer visited');
      await B.tap.until(() => gv(B).storytellerVisitingYou === true, 15_000, 'B visited');
      if (promptStep?.prompt) await stepRow(promptStep.id).getByRole('button', { name: /^(Re-)?[Pp]rompt$/ }).click();
      else {
        await st.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
        await st.page.locator('.cts-grim', { has: st.page.locator('.cts-name', { hasText: B.name }) }).getByRole('button', { name: 'Prompt', exact: true }).click();
        await st.page.getByRole('button', { name: 'Send prompt' }).click();
      }
      const pr = await B.tap.until(() => gv(B).prompts?.[0], 15_000, 'prompt arrives');
      const card = B.page.getByRole('dialog', { name: pr.title });
      await expect(card).toBeVisible({ timeout: 10_000 });
      await shot(B.page, '08-night-prompt');
      await answerPrompt(B.page, pr);
      await B.tap.until(() => (gv(B).prompts ?? []).every((x: any) => x.id !== pr.id), 15_000, 'prompt answered');
      await st.tap.until(() => queue().some((s) => s.seat === seatOf(B) && s.response) || gv(st).grimoire.find((g: any) => g.seat === seatOf(B))?.sentPrompts?.some((x: any) => !x.open), 15_000, 'ST sees the answer');
      await expect(card).toHaveCount(0);
    });

    await step('4d the three unvisited players saw/heard nothing: no ST entity, no visit cue, no "visiting" flag, no hint', 'observe', async () => {
      for (const p of unvisited) {
        for (const s of p.tap.received('world:snapshot', nightAt)) expect(s.entities.some((e: any) => e.id === stPid), `${p.name} saw the ST`).toBe(false);
        for (const v of p.tap.received('game:view', nightAt)) expect(v.storytellerVisitingYou, `${p.name} visiting flag`).toBe(false);
        expect(p.tap.received('sound', nightAt).some((s: any) => s?.cue === 'visit'), `${p.name} heard a visit`).toBe(false);
        expect(p.tap.received('world:teleport', nightAt).length, `${p.name} got teleports`).toBe(0);
        await expect(p.page.getByText(/Storyteller is visiting you|Private visit/)).toHaveCount(0);
        for (const v of p.tap.received('game:view', nightAt)) expect(v.prompts?.length ?? 0, `${p.name} got a prompt`).toBe(0);
      }
      for (const p of [A, B]) expect(p.tap.received('sound', visitAt).some((s: any) => s?.cue === 'visit'), `${p.name} visit cue`).toBe(true);
    });

    await step('4e ST leaves, skips the remaining night steps, ends the night (Dawn) and starts the day', 'ui', async () => {
      await st.page.locator('.cts-chip.visit').getByRole('button', { name: 'leave' }).click();
      await st.tap.until(() => gv(st).visitingSeat === null, 10_000, 'left home');
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Night order' }).click();
      // resolve B's answered step if it can be, then skip whatever is left
      if (promptStep) {
        const resolve = stepRow(promptStep.id).getByRole('button', { name: 'Resolve', exact: true });
        if ((await resolve.count()) && (await resolve.isEnabled())) await resolve.click();
      }
      for (let i = 0; i < 40; i++) {
        const left = queue().filter((s) => !['resolved', 'skipped'].includes(s.status)).length;
        if (!left) break;
        const skip = st.page.locator('.cts-steps').getByRole('button', { name: 'Skip', exact: true }).first();
        await skip.click();
        await st.tap.until(() => queue().filter((s) => !['resolved', 'skipped'].includes(s.status)).length < left, 10_000, 'step skipped');
      }
      await expect(st.page.locator('.cts-now-btn')).toContainText('Dawn: review deaths');
      await st.page.locator('.cts-now-btn').click();
      await st.tap.until(() => gv(st).phase === 'dawn', 10_000, 'dawn');
      await expect(st.page.locator('.cts-now-btn')).toContainText('Start the day');
    });

    // ============================================================== 5. day 1: walk out
    let dawnAt = 0;
    const outWalkers = [walker, unvisited.find((p) => p !== walker) ?? A];
    await step('5 day breaks: nobody is moved; one player leaves home with the Leave button, another with an arrow key', 'ui', async () => {
      dawnAt = Date.now();
      await st.page.locator('.cts-now-btn').click();
      const armed = st.page.locator('.cts-confirm');
      if (await armed.count()) await confirmYes(st.page);
      for (const p of all) await p.tap.until(() => gv(p)?.phase === 'day', 15_000, 'day');
      await players[0]!.page.waitForTimeout(1500);
      for (const p of players) expect(tps(p, dawnAt), `${p.name}: moved at dawn/day`).toEqual([]);
      // inside: a fixed room view, no walking; the panel says where you are and who is with you
      for (const p of outWalkers) {
        await expect(insidePanel(p.page)).toContainText('Your home', { timeout: 15_000 });
        await expect(leaveButton(p.page)).toHaveText('Leave');
        await expect(leaveButton(p.page)).toBeEnabled();
      }
      await shot(outWalkers[0]!.page, '08b-day1-inside-home');
      const t0 = Date.now();
      await leaveByButton(outWalkers[0]!, pidOf(outWalkers[0]!));
      await leaveByKey(outWalkers[1]!, pidOf(outWalkers[1]!), 'ArrowDown');
      for (const p of outWalkers) {
        const bad = tps(p, t0).filter((t: any) => !['door', 'correction'].includes(t.reason));
        expect(bad, `${p.name}: walked out through the door`).toEqual([]);
        await p.tap.until(() => voiceZone(p) === 'square', 15_000, 'square voice zone outdoors');
      }
      await shot(outWalkers[0]!.page, '09-day1-walked-out');
    });

    // a private conversation by day: a player taps a neighbour's cottage; the two inside share its
    // voice zone; a third player outdoors stays in the square and sees neither of them
    const host = players.find((p) => !outWalkers.includes(p) && selfEntity(p, pidOf(p))?.location === `bld:${homeOf(p).id}`) ?? players.find((p) => !outWalkers.includes(p))!;
    const [guest, outsider] = outWalkers as [GamePlayer, GamePlayer];
    await step(`5b private talk: ${guest.name} taps ${host.name}'s cottage and goes in; both share its voice zone; ${outsider.name} (outdoors) does not`, 'ui', async () => {
      const zone = `bld:${homeOf(host).id}`;
      const t0 = Date.now();
      await host.tap.until(() => voiceZone(host) === zone, 15_000, `${host.name} in ${zone} (home)`);
      note(`guest tap log: ${(await tapCottage(guest, pidOf(guest), homeOf(host).id)).join(' | ')}`);
      await expect(insidePanel(guest.page)).toContainText(`${host.name}’s home`, { timeout: 15_000 });
      await expect(insidePanel(guest.page)).toContainText(host.name);
      await expect(insidePanel(host.page)).toContainText(guest.name, { timeout: 15_000 });
      await expect(insidePanel(host.page)).toContainText(/only you two can hear each other/);
      await guest.tap.until(() => voiceZone(guest) === zone, 15_000, `${guest.name} granted ${zone}`);
      expect(voiceZone(host), `${host.name} still in ${zone}`).toBe(zone);
      // the outsider: square zone, never granted the cottage's room, never sees the two inside
      await outsider.page.waitForTimeout(1500);
      expect(selfEntity(outsider, pidOf(outsider))?.location).toBe('outdoors');
      expect(voiceZone(outsider), `${outsider.name} zone`).toBe('square');
      expect(zonesGranted(outsider, t0), `${outsider.name} never granted ${zone}`).not.toContain(zone);
      const seen = new Set(outsider.tap.received('world:snapshot', Date.now() - 1000).flatMap((sn: any) => sn.entities.map((e: any) => e.id)));
      expect(seen.has(pidOf(guest)) || seen.has(pidOf(host)), `${outsider.name} sees nobody inside the cottage`).toBe(false);
      // the daytime bulletin board by the door (public door tags) tells the outsider who is in there
      const tagged = () => (outsider.tap.last('world:snapshot')?.doorTags?.[homeOf(host).id] ?? []).map((t: any) => t.pid);
      await outsider.tap.until(() => tagged().includes(pidOf(guest)) && tagged().includes(pidOf(host)), 10_000, 'board lists both inside');
      await shot(guest.page, '09b-day1-private-talk-inside');
      await shot(outsider.page, '09c-day1-outside-boards');
      await leaveByButton(guest, pidOf(guest));
      await guest.tap.until(() => voiceZone(guest) === 'square', 15_000, 'guest back in the square zone');
      await expect(insidePanel(host.page)).toContainText('Nobody else is here', { timeout: 15_000 });
    });

    // ============================================================== 6. gather, nominate, vote, execute
    const alive1 = players.map(seatOf);
    const goodPlain = (s: number) => grim(s).alignment === 'good' && !['saint', 'virgin'].includes(grim(s).character);
    const nomineeSeat = alive1.find((s) => goodPlain(s) && !outWalkers.some((w) => seatOf(w) === s)) ?? alive1.find(goodPlain)!;
    const nominee = bySeat(nomineeSeat);
    const nominator = players.find((p) => p !== nominee && !isDemon(seatOf(p)))!;
    const viaWalk = players.find((p) => p !== nominee && !outWalkers.includes(p) && p !== nominator) ?? players.find((p) => !outWalkers.includes(p))!;

    await step(`6a ST gathers the circle; ${viaWalk.name} is walked to their seat by the ST (through the door, no teleport); the rest are force-seated`, 'ui', async () => {
      await expect(st.page.locator('.cts-now-btn')).toContainText('Gather the circle');
      await st.page.locator('.cts-now-btn').click();
      for (const p of players) await p.tap.until(() => gv(p).gathering === true, 10_000, 'gathering public');
      await expect(outWalkers[0]!.page.locator('.cth-hint')).toContainText(/seat in the circle|Seat/, { timeout: 10_000 });
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Stage' }).click();
      const t0 = Date.now();
      await st.page.getByRole('button', { name: new RegExp(`^${esc(`${seatOf(viaWalk) + 1}. ${viaWalk.name}`)}`) }).locator('circle').first().click();
      const card = st.page.getByRole('dialog', { name: `Actions for ${viaWalk.name}` });
      await card.getByRole('button', { name: 'Walk to…' }).click();
      await card.locator('.cts-targets').getByRole('button', { name: 'Seat', exact: true }).click();
      await viaWalk.tap.until(() => viaWalk.tap.last('world:snapshot')?.you?.mode === 'auto', 10_000, 'walked by the ST');
      await expect(viaWalk.page.locator('.cth-hint')).toContainText(/walking you to your seat|guiding you/, { timeout: 10_000 }).catch(() => note('"walking you to your seat" hint not seen'));
      await st.tap.until(() => gv(st).stage.players.find((x: any) => x.seat === seatOf(viaWalk))?.presence === 'seated', 120_000, 'walked to the seat');
      expect(tps(viaWalk, t0).filter((t: any) => t.reason !== 'door').map((t: any) => t.reason)).toEqual([]);
      await armConfirm(st.page, st.page.getByRole('button', { name: 'Force seats' }));
      await st.tap.until(() => gv(st).stage.players.every((x: any) => x.presence === 'seated'), 20_000, 'everyone seated');
      await expect(nominee.page.locator('.cth-hint')).toContainText(/Seated|seat/, { timeout: 10_000 }).catch(() => undefined);
      await shot(st.page, '10-gathered-circle-st');
      await shot(nominee.page, '11-gathered-circle-player');
    });

    await step(`6b ST opens nominations; ${nominator.name} nominates ${nominee.name} from the HUD`, 'ui', async () => {
      // the Now strip suggests opening nominations once the circle is gathered
      await expect(st.page.locator('.cts-now-btn')).toContainText('Open nominations');
      await st.page.locator('.cts-now-btn').click();
      await nominator.tap.until(() => gv(nominator).day?.nominationsOpen, 10_000, 'nominations open');
      await expect(st.page.locator('.cts-stage').getByRole('button', { name: 'Close nominations' })).toBeVisible();
      await nominateFromHud(nominator, nominee.name);
      await st.tap.until(() => gv(st).day?.nominations?.length === 1, 10_000, 'nomination recorded');
      for (const p of players) await expect(p.page.locator('.cth-vote-pill, .cth-vote')).toContainText(nominee.name, { timeout: 10_000 });
    });

    await step('6c ST starts the vote; the clock hand walks; the others raise hands; "your vote counted"; tally puts the nominee on the block', 'ui', async () => {
      await expect(st.page.locator('.cts-now-btn')).toContainText(`Start vote on ${nominee.name}`);
      const voters = players.filter((p) => p !== nominee);
      // Each voter raises a hand, then must see "your vote counted" while the vote is still running
      // (the panel disappears at the tally).
      const { n, outcome, attempts } = await runVote(st, 0, voters, (x) => x.voteCount >= x.threshold, undefined, [nominator, nominee]);
      note(outcome.join('; '));
      if (attempts > 1) note(`TIMING: the ST had to re-run the vote ${attempts - 1}x (raises lost the race with the clock hand)`);
      await shot(nominator.page, '12-vote-clock');
      // clock hand visited seats clockwise (seen by a player)
      const hands = [...new Set(nominator.tap.received('game:view').map((v: any) => v.day?.nominations?.[0]?.currentVoterSeat).filter((x: any) => x !== null && x !== undefined))];
      note(`clock hand seen at seats ${hands.map((s: any) => s + 1).join('→')}; ${n.voteCount}/${n.threshold}`);
      for (const [i, p] of voters.entries()) {
        const counted = n.votes[seatOf(p)] === true;
        const saw = outcome[i]!.includes('saw "counted"');
        if (counted && !saw) bugs.push(`6c ${p.name}: vote counted on the server but "your vote counted" was never visible (${outcome[i]})`);
      }
      if (n.voteCount < n.threshold) {
        note(`TIMING: only ${n.voteCount}/${n.threshold} hands counted — some Raise-hand clicks lost the race with the 1.5 s/seat clock hand on the loaded host; the ST puts the nominee on the block instead`);
        // the ST puts them on the block from the Stage (a prop) so the game can go on
        await st.page.locator('.cts-tabs').getByRole('button', { name: 'Stage' }).click();
        await st.page.getByRole('button', { name: new RegExp(`^${esc(`${nomineeSeat + 1}. ${nominee.name}`)}`) }).locator('circle').first().click();
        await armConfirm(st.page, st.page.getByRole('button', { name: 'Put on block' }));
      }
      await st.tap.until(() => gv(st).day.onTheBlock?.seat === nomineeSeat, 10_000, 'on the block');
      for (const p of players) await p.tap.until(() => gv(p).day?.onTheBlock?.seat === nomineeSeat, 10_000, 'block public');
      const yes = voters.find((p) => n.votes[seatOf(p)] === true);
      if (yes) await expect(yes.page.getByText(/your vote counted/i).first(), '"your vote counted" stays after the tally').toBeVisible();
      await shot(nominator.page, '13-vote-counted');
    });

    await step(`6d ST executes ${nominee.name}; they become a ghost with a ghost vote (HUD + every client)`, 'ui', async () => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Day' }).click();
      await armConfirm(st.page, st.page.locator('.cts-block').getByRole('button', { name: 'Execute' }));
      const v = await nominee.tap.until(() => gv(nominee).you?.alive === false && gv(nominee), 15_000, 'dead');
      expect(v.you.ghostVoteAvailable).toBe(true);
      await expect(nominee.page.locator('.cth-card-head')).toContainText('Dead · 👻 1 vote');
      await expect(nominee.page.locator('.cth-hint')).toContainText(/ghost vote/, { timeout: 15_000 });
      for (const p of players) {
        const row = gv(p).players.find((x: any) => x.seat === nomineeSeat);
        expect(row.alive).toBe(false);
        expect(row.ghostVoteAvailable).toBe(true);
      }
      await nominator.page.locator('.cth-card-head').click();
      await expect(nominator.page.locator('.cth-players li', { hasText: nominee.name }).getByTitle('Dead — ghost vote available')).toBeVisible();
      await nominator.page.locator('.cth-card-head').click();
      await shot(nominee.page, '14-executed-ghost');
    });

    // ============================================================== 7. night 2 -> day 2: ghost vote
    await step('7a ST rings the bell (10 s); everyone is escorted home; night 2 falls; the ST ends the night from the Stage', 'ui', async () => {
      await expect(st.page.locator('.cts-now-btn')).toContainText(/bell/i);
      await armConfirm(st.page, st.page.locator('.cts-now-btn'));
      for (const p of players) await p.tap.until(() => gv(p).phase === 'bedtime', 15_000, 'bedtime 2');
      await st.tap.until(() => gv(st).phase === 'night', 240_000, 'night 2');
      // one primary path: Dawn (review) -> Start the day ("End night now" is a secondary prop)
      await st.page.locator('.cts-controls').getByRole('button', { name: 'Dawn: review deaths' }).click();
      await st.tap.until(() => gv(st).phase === 'dawn', 10_000, 'dawn 2');
      await expect(st.page.locator('.cts-now-btn')).toContainText('Start the day');
      await st.page.locator('.cts-now-btn').click();
      for (const p of all) await p.tap.until(() => gv(p).phase === 'day' && gv(p).dayNumber === 2, 15_000, 'day 2');
    });

    const alive2 = players.filter((p) => p !== nominee);
    const notVirgin = (p: GamePlayer) => grim(seatOf(p)).character !== 'virgin';
    const pickPair = (pool: GamePlayer[], exclude: GamePlayer[] = []) => {
      const cand = pool.filter((p) => !exclude.includes(p));
      const nee = cand.find((p) => notVirgin(p) && !isDemon(seatOf(p))) ?? cand.find(notVirgin)!;
      const nor = cand.find((p) => p !== nee)!;
      return { nor, nee };
    };
    // The clock hand starts at the seat after the nominee; give the ghost a late turn (seat ghost+1
    // nominated -> the ghost votes 4th) so a slow page still gets its raise in.
    const ghostSeat = nomineeSeat;
    const late = [1, 2, 3].map((k) => bySeat((ghostSeat + k) % players.length)).filter((p) => p && p !== nominee && notVirgin(p) && !isDemon(seatOf(p)));
    const v2 = late.length ? { nee: late[0]!, nor: alive2.find((p) => p !== late[0])! } : pickPair(alive2);
    // third nomination: a different nominator (one per day) and a different nominee (once per day)
    const nor3 = alive2.find((p) => p !== v2.nor && p !== v2.nee && !notVirgin(p)) ?? alive2.find((p) => p !== v2.nor && p !== v2.nee)!;
    const nee3 = alive2.find((p) => p !== v2.nee && p !== nor3 && notVirgin(p)) ?? alive2.find((p) => p !== v2.nee && p !== nor3)!;
    const v3 = { nor: nor3, nee: nee3 };
    const ghost = nominee;

    await step(`7b day 2: gather + force seats; ${v2.nor.name} nominates ${v2.nee.name}; the ghost raises a hand (uses the ghost vote)`, 'ui', async () => {
      await st.page.locator('.cts-now-btn').click(); // Gather the circle
      await st.tap.until(() => gv(st).gathering === true, 10_000, 'gathered 2');
      await armConfirm(st.page, st.page.getByRole('button', { name: 'Force seats' }));
      await st.page.locator('.cts-stage').getByRole('button', { name: 'Open nominations' }).click();
      await v2.nor.tap.until(() => gv(v2.nor).day?.nominationsOpen, 10_000, 'open');
      await nominateFromHud(v2.nor, v2.nee.name);
      await st.tap.until(() => gv(st).day?.nominations?.length === 1, 10_000, 'nomination 2');
      const r = await runVote(st, 0, [ghost], (x) => x.votes[seatOf(ghost)] === true, ghost);
      const res = r.outcome.join('; ');
      note(res);
      if (r.attempts > 1) note(`TIMING: the ST had to re-run the vote ${r.attempts - 1}x for the ghost's raise to land`);
      await shot(ghost.page, '15-ghost-vote-counted');
      expect(r.n.votes[seatOf(ghost)], `ghost vote counted (${res})`).toBe(true);
      if (!res.includes('saw "counted"')) bugs.push(`7b ghost: "your vote counted" never visible (${res})`);
      await ghost.tap.until(() => gv(ghost).you.ghostVoteAvailable === false, 10_000, 'ghost vote spent');
      await expect(ghost.page.locator('.cth-card-head .cth-chip.dead')).toHaveText('Dead');
      for (const p of players) expect(gv(p).players.find((x: any) => x.seat === seatOf(ghost)).ghostVoteAvailable).toBe(false);
    });

    await step(`7c ${v3.nor.name} nominates ${v3.nee.name}; the ghost's second vote is refused (no button; a modified client's vote frame is rejected with a friendly message)`, 'ui+message', async () => {
      await nominateFromHud(v3.nor, v3.nee.name);
      await st.tap.until(() => gv(st).day?.nominations?.length === 2, 10_000, 'nomination 3');
      await st.page.locator('.cts-now-btn').click(); // Start vote
      await ghost.tap.until(() => gv(ghost).day?.nominations?.[1]?.status === 'voting', 10_000, 'vote 3 running');
      // modified client first (before the clock hand can pass the ghost's seat), then the UI checks
      const nomId = gv(ghost).day.nominations[1].id;
      const t0 = Date.now();
      expect(await inject(ghost.page, 'game:vote', { nominationId: nomId, vote: true }), 'frame injected').toBe(true);
      const err = await ghost.tap.until(() => ghost.tap.received('error', t0).find((e: any) => e.for === 'game:vote'), 10_000, 'vote refused');
      note(`refusal: "${err.message}"`);
      expect(err.message).toMatch(/ghost vote|locked/i);
      const toast = ghost.page.locator('.cth-toast', { hasText: /ghost vote|vote is locked/i });
      await expect(toast).toBeVisible({ timeout: 5000 });
      note(`toast: "${(await toast.first().textContent())?.trim()}"`);
      await expect(ghost.page.getByRole('button', { name: /Raise hand/ })).toHaveCount(0);
      const pill = ghost.page.locator('.cth-vote-pill');
      if (await pill.count()) await pill.click().catch(() => undefined);
      await expect(ghost.page.getByText('Your ghost vote is spent.')).toBeVisible({ timeout: 10_000 }).catch(() => note('"Your ghost vote is spent." not visible (vote may have ended)'));
      await shot(ghost.page, '16-ghost-vote-refused');
      await st.tap.until(() => gv(st).day.nominations[1].status === 'tallied', 30_000, 'tallied 3');
      expect(gv(st).day.nominations[1].votes[seatOf(ghost)]).toBe(false);
    });

    // ============================================================== 8. ST overrides
    const target = alive2.find((p) => !isDemon(seatOf(p)) && p !== ghost)!;
    await step(`8a undo a wrong kill: ST kills ${target.name} by mistake, then ↶ Undo restores them for everyone`, 'ui', async () => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
      await armConfirm(st.page, st.page.locator('.cts-grim', { has: st.page.locator('.cts-name', { hasText: target.name }) }).getByRole('button', { name: 'Kill', exact: true }));
      for (const p of players) await p.tap.until(() => gv(p).players.find((x: any) => x.seat === seatOf(target))?.alive === false, 10_000, 'kill public');
      await st.page.getByRole('button', { name: '↶ Undo' }).click();
      for (const p of players) await p.tap.until(() => gv(p).players.find((x: any) => x.seat === seatOf(target))?.alive === true, 10_000, 'undo public');
      expect(gv(target).you.alive).toBe(true);
      await expect(target.page.locator('.cth-card-head .cth-chip.dead')).toHaveCount(0);
    });

    const mover = target;
    // v2: no tavern any more; the ST puts the mover into the ghost's cottage
    const tavern = homeOf(ghost);
    await step(`8b ST teleports ${mover.name} into ${tavern.name} (${ghost.name}'s cottage; only they get the teleport)`, 'ui', async () => {
      const since = Date.now();
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Stage' }).click();
      await st.page.getByRole('button', { name: new RegExp(`^${esc(`${seatOf(mover) + 1}. ${mover.name}`)}`) }).locator('circle').first().click();
      const card = st.page.getByRole('dialog', { name: `Actions for ${mover.name}` });
      await card.getByRole('button', { name: 'Teleport…' }).click();
      await card.locator('.cts-targets select').selectOption(tavern.id);
      await card.locator('.cts-targets').getByRole('button', { name: 'Go', exact: true }).click();
      const t = await mover.tap.until(() => tps(mover, since).find((x: any) => x.reason === 'storyteller'), 10_000, 'teleported');
      expect(t.location).toBe(`bld:${tavern.id}`);
      for (const p of players.filter((x) => x !== mover)) expect(tps(p, since)).toEqual([]);
      await expect(insidePanel(mover.page)).toContainText(`${ghost.name}’s home`, { timeout: 15_000 });
      await shot(mover.page, '17-teleported-into-cottage');
    });

    await step('8c door tags setting: by day everyone sees who is inside the tavern; the ST switches it off and on', 'ui', async () => {
      const box = st.page.getByLabel('Door tags');
      if (!(await box.count())) {
        note('door-tags setting not present in the ST panel');
        return;
      }
      const mp = pidOf(mover);
      const tagged = (p: GamePlayer) => !!p.tap.last('world:snapshot')?.doorTags?.[tavern.id]?.some((t: any) => t.pid === mp);
      for (const p of players) await p.tap.until(() => tagged(p), 10_000, 'door tag visible');
      expect(JSON.stringify(st.tap.last('world:snapshot')?.doorTags ?? {})).not.toContain(pidOf(st));
      await box.uncheck();
      await st.tap.until(() => gv(st).settings?.doorTags === false, 10_000, 'setting off');
      for (const p of players) await p.tap.until(() => !p.tap.last('world:snapshot')?.doorTags, 10_000, 'door tags gone');
      await box.check();
      for (const p of players) await p.tap.until(() => tagged(p), 10_000, 'door tags back');
    });

    await step(`8d door lock: ST locks ${tavern.name}; ${mover.name}'s Leave button says it is locked, an arrow key explains it, a modified client's door request is refused; "Default" lets them out`, 'ui+message', async () => {
      await st.page.locator('.cts-doors summary').click();
      const row = st.page.locator('.cts-doors li', { hasText: tavern.name });
      await row.getByRole('button', { name: '🔒 Locked' }).click();
      await mover.tap.until(() => mover.tap.last('world:snapshot')?.doors?.[tavern.id] === true, 10_000, 'lock public');
      const pid = pidOf(mover);
      const btn = leaveButton(mover.page);
      await expect(btn).toBeDisabled({ timeout: 10_000 });
      await expect(btn).toContainText(/locked/i);
      note(`locked Leave button: "${(await btn.textContent())?.trim()}"`);
      // a movement key inside tries to leave: refused locally with a message, nothing sent
      const t0 = Date.now();
      await mover.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await mover.page.keyboard.press('ArrowDown');
      await expect(insidePanel(mover.page).locator('.ct-inside-note')).toContainText(/locked/i, { timeout: 5000 }).catch(() => note('no "locked" note in the inside panel after an arrow key'));
      await mover.page.waitForTimeout(1000);
      expect(mover.tap.sent('world:useDoor', t0).length, 'no door request for a locked door').toBe(0);
      // a modified client asks anyway: the server refuses politely
      expect(await inject(mover.page, 'world:useDoor', { buildingId: tavern.id }), 'frame injected').toBe(true);
      const err = await mover.tap.until(() => mover.tap.received('error', t0).find((e: any) => e.for === 'world:useDoor'), 10_000, 'locked-door refusal');
      expect(err.message).toMatch(/locked/i);
      await expect(mover.page.locator('.ct-toast')).toContainText(/locked/i, { timeout: 5000 }).catch(() => bugs.push('8d: "The door is locked." error frame arrived but no toast was shown'));
      expect(selfEntity(mover, pid)?.location).toBe(`bld:${tavern.id}`);
      await shot(mover.page, '18-door-locked');
      // someone outside taps the locked cottage: walks to the door, is told it is locked, stays out
      const knocker = alive2.find((p) => p !== mover && p !== ghost && selfEntity(p, pidOf(p))?.location === 'outdoors');
      if (knocker) {
        const msg = await tapLockedCottage(knocker, pidOf(knocker), tavern.id);
        note(`${knocker.name} tapped the locked cottage: "${msg}"`);
        expect(msg).toMatch(/locked/i);
        await shot(knocker.page, '18b-locked-door-outside');
      } else note('nobody outdoors to knock on the locked door');
      await row.getByRole('button', { name: 'Default' }).click();
      await mover.tap.until(() => !mover.tap.last('world:snapshot')?.doors?.[tavern.id], 10_000, 'lock lifted');
      await leaveByButton(mover, pid);
    });

    await step('8e ❄ Freeze all: movement is paused with a message; Unfreeze all restores it', 'ui', async () => {
      await st.page.getByRole('button', { name: '❄ Freeze all' }).click();
      const pid = pidOf(mover);
      await mover.tap.until(() => mover.tap.last('world:snapshot')?.you?.mode === 'frozen', 10_000, 'frozen');
      await expect(mover.page.locator('.cth-hint')).toContainText(/paused your movement|Paused/, { timeout: 10_000 });
      const before = selfEntity(mover, pid)!;
      await mover.page.keyboard.down('ArrowDown');
      await mover.page.waitForTimeout(1200);
      await mover.page.keyboard.up('ArrowDown');
      await mover.page.waitForTimeout(800);
      const after = selfEntity(mover, pid)!;
      expect(Math.hypot(after.x - before.x, after.y - before.y), 'frozen player did not move').toBeLessThan(2);
      await shot(mover.page, '19-frozen');
      await st.page.getByRole('button', { name: 'Unfreeze all' }).click();
      await mover.tap.until(() => !mover.tap.last('world:snapshot')?.you, 10_000, 'unfrozen');
      await expect(mover.page.locator('.cth-hint')).not.toContainText(/paused your movement/, { timeout: 15_000 }).catch(() => note('"paused" hint still showing after unfreeze'));
      // can walk again: try each direction until one moves us
      let moved = 0;
      // (away from the cottage door first: walking into a doorway would go in)
      for (const k of ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']) {
        const a = selfEntity(mover, pid)!;
        await mover.page.keyboard.down(k);
        await mover.page.waitForTimeout(1500);
        await mover.page.keyboard.up(k);
        await mover.page.waitForTimeout(1000);
        const b = selfEntity(mover, pid)!;
        moved = Math.hypot(b.x - a.x, b.y - a.y);
        if (moved > 3) break;
      }
      expect(moved, 'moves again after Unfreeze').toBeGreaterThan(3);
    });

    await step('8f force phase: Night (players still outdoors are put to bed — the one allowed teleport), then Day', 'ui', async () => {
      const t0 = Date.now();
      const outdoors = players.filter((p) => selfEntity(p, pidOf(p))?.location === 'outdoors');
      await st.page.getByRole('button', { name: /Force phase/ }).click();
      await armConfirm(st.page, st.page.locator('.cts-stage').getByRole('button', { name: 'Night', exact: true }));
      for (const p of players) await p.tap.until(() => gv(p).phase === 'night', 15_000, 'forced night');
      for (const p of outdoors) {
        const t = await p.tap.until(() => tps(p, t0).find((x: any) => x.reason === 'night'), 10_000, 'sent to bed');
        expect(t.location).toBe(`bld:${homeOf(p).id}`);
      }
      await armConfirm(st.page, st.page.locator('.cts-stage').getByRole('button', { name: 'Day', exact: true }));
      for (const p of all) await p.tap.until(() => gv(p).phase === 'day' && gv(p).dayNumber === 3, 15_000, 'day 3');
      note(`${outdoors.length} players were outdoors at the forced night`);
    });

    // ============================================================== 9. game end
    const demonSeat = grimoire.find((g) => g.character === 'imp')!.seat;
    const demon = bySeat(demonSeat);
    await step(`9a ST executes the Demon (${demon.name}); the detected end waits for the ST (players are told nothing yet)`, 'ui', async () => {
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Stage' }).click();
      await st.page.getByRole('button', { name: new RegExp(`^${esc(`${demonSeat + 1}. ${demon.name}`)}`) }).locator('circle').first().click();
      const card = st.page.getByRole('dialog', { name: `Actions for ${demon.name}` });
      await armConfirm(st.page, card.getByRole('button', { name: 'Execute', exact: true }));
      await st.tap.until(() => gv(st).pendingResult, 10_000, 'pending result');
      await expect(st.page.getByText('Game end detected:').first()).toBeVisible();
      await players[0]!.page.waitForTimeout(1500);
      for (const p of players) {
        expect(gv(p).result ?? null, `${p.name}: result before confirm`).toBeNull();
        await expect(p.page.getByRole('dialog', { name: 'Game results' })).toHaveCount(0);
      }
      await shot(st.page, '20-pending-result');
    });

    await step('9b ST confirms; every client shows the endgame reveal', 'ui', async () => {
      const winner = gv(st).pendingResult?.winner;
      await armConfirm(st.page, st.page.getByRole('button', { name: 'Confirm game end' }));
      for (const p of all) {
        const r = await p.tap.until(() => gv(p)?.result, 15_000, 'result');
        const dlg = p.page.getByRole('dialog', { name: 'Game results' });
        await expect(dlg).toBeVisible();
        await expect(dlg.getByRole('heading', { name: r.winner === 'good' ? 'Good wins' : 'Evil wins' })).toBeVisible();
        for (const g of grimoire) await expect(dlg.getByRole('row', { name: new RegExp(esc(g.name)) })).toBeVisible();
        expect(r.reveal).toHaveLength(5);
      }
      note(`winner ${winner}`);
      await shot(players[1]!.page, '21-endgame-reveal');
    });

    await step('9c ST presses Play again: everyone is back in a clean waiting room (no game view, nobody ready, seats cleared); Ready works again', 'ui', async () => {
      const play = st.page.getByRole('toolbar', { name: 'Game menu' }).getByRole('button', { name: 'Play again' });
      await play.click();
      for (const p of all) {
        await p.tap.until(() => lv(p)?.lobby?.phase === 'waiting', 15_000, 'waiting again');
        await expect(p.page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 15_000 });
        await expect(p.page.getByRole('dialog', { name: 'Game results' })).toHaveCount(0);
        await expect(p.page.locator('.cth-card')).toHaveCount(0);
        await expect(p.page.locator('.cts')).toHaveCount(0);
      }
      const v = lv(st);
      expect(v.members.filter((m: any) => m.role === 'player').every((m: any) => !m.ready && m.seat === null)).toBe(true);
      expect(v.members.length).toBe(6);
      await shot(players[0]!.page, '22-rematch-waiting-room');
      for (const p of players) await p.page.getByRole('button', { name: "I'm ready" }).click();
      await st.tap.until(() => lv(st)?.canStart, 20_000, 'can start the rematch');
      await expect(st.page.getByRole('button', { name: 'Start game' })).toBeEnabled();
    });

    await step('no player ever received Storyteller-only data before the end', 'observe', async () => {
      for (const p of players)
        for (const f of p.tap.frames.filter((f) => f.dir === 'in' && f.type === 'game:view' && !f.payload?.result)) {
          const json = JSON.stringify(f.payload);
          for (const k of FORBIDDEN) expect(json.includes(k), `${p.name} got ${k}`).toBe(false);
          expect(f.payload.kind).toBe('player');
        }
    });
  } finally {
    const errs = consoleSink.filter((l) => !/Failed to load resource: the server responded with a status of 40[134]/.test(l));
    writeFileSync(path.join(ART, `game-full-steps-${RUN}.json`), JSON.stringify({ steps, notes, bugs, console: consoleSink, frameCounts: Object.fromEntries(all.map((p) => [p.name, p.tap.typeCounts()])) }, null, 2));
    await Promise.all(all.map((p) => p.ctx.close().catch(() => undefined)));
    if (errs.length) console.log(`console errors:\n${errs.join('\n')}`);
  }
  expect(bugs, 'soft failures').toEqual([]);
});

// ------------------------------------------------------------------------------------- helpers

function charLabel(id: string): string {
  return id.split('_').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}

async function nominateFromHud(p: GamePlayer, nomineeName: string) {
  const head = p.page.locator('.cth-card-head');
  if (!(await p.page.locator('.cth-tabs').count())) await head.click();
  await p.page.locator('.cth-tabs').getByRole('button', { name: 'Town' }).click();
  await p.page.locator('.cth-players li', { hasText: nomineeName }).getByRole('button', { name: 'Nominate' }).click();
  await p.tap.until(() => p.tap.last('game:view')?.day?.nominations?.some((n: any) => n.status === 'pending' || n.status === 'voting'), 10_000, 'my nomination');
  await head.click(); // collapse again
}

/**
 * Run the vote on nomination `idx`: the ST starts it from the Now strip; every voter raises a hand in
 * its own browser. If `ok` is not met (a raise lost the race with the 1.5 s/seat clock hand on the
 * loaded host) the ST re-runs it with the Stage "Re-vote" button, up to 3 attempts.
 */
async function runVote(st: GamePlayer, idx: number, voters: GamePlayer[], ok: (n: any) => boolean, ghostLabel?: GamePlayer, pauseCheck?: GamePlayer[]): Promise<{ n: any; outcome: string[]; attempts: number }> {
  const nom = () => st.tap.last('game:view').day.nominations[idx];
  // (B2) hands go up while the nomination is still pending, before the ST starts the clock
  const early = await Promise.all(
    voters.map(async (p) => {
      const t0 = Date.now();
      const label = p === ghostLabel ? 'Raise hand (uses ghost vote)' : /^Raise hand/;
      const ok2 = await p.page.getByRole('button', { name: label }).click({ timeout: 20_000 }).then(() => true, () => false);
      if (ok2) await expect(p.page.getByRole('button', { name: 'Lower hand' })).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
      return `${p.name}: ${ok2 ? `raised before the vote (${Date.now() - t0} ms)` : 'could not raise early'}`;
    }),
  );
  await st.tap.until(() => voters.every((p) => (nom().handsRaised ?? []).includes(p.tap.last('game:view').you.seat)), 15_000, 'early hands visible to the ST');
  let outcome: string[] = early;
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    if (attempt === 1) await st.page.locator('.cts-now-btn').click();
    else await armConfirm(st.page, st.page.locator('.cts-stage').getByRole('button', { name: 'Re-vote', exact: true }));
    await st.tap.until(() => st.tap.received('game:view', t0).some((v: any) => v.day?.nominations?.[idx]?.status === 'voting'), 15_000, 'vote running');
    if (attempt === 1) expect(nom().stepMs ?? 3000, 'default clock: 3 s per seat').toBe(3000);
    if (pauseCheck && attempt === 1) {
      // ST pauses the clock: no seat locks while paused, players see it; then resumes
      await st.page.locator('.cts-stage').getByRole('button', { name: '❚❚ Pause clock' }).click();
      await st.tap.until(() => nom().clockPaused === true, 10_000, 'clock paused');
      const locked = Object.keys(nom().votes).length;
      for (const p of pauseCheck) await expect(p.page.getByText('❚❚ clock paused').first()).toBeVisible({ timeout: 15_000 });
      await st.page.waitForTimeout(4000);
      expect(Object.keys(nom().votes).length, 'no seat locks while the clock is paused').toBe(locked);
      await st.page.locator('.cts-stage').getByRole('button', { name: '▶ Resume clock' }).click();
      await st.tap.until(() => !nom().clockPaused, 10_000, 'clock resumed');
    }
    const counted = await Promise.all(
      voters.map((p) =>
        p.page
          .getByText(/your vote counted/i)
          .first()
          .waitFor({ timeout: 60_000 })
          .then(
            () => 'saw "counted"',
            () => 'never saw "counted"',
          ),
      ),
    );
    await st.tap.until(() => nom().status === 'tallied', 60_000, 'tallied');
    const n = nom();
    outcome = voters.map((p, i) => `#${attempt} ${early[i]}, ${counted[i]}`);
    if (ok(n) || attempt >= 3) return { n, outcome, attempts: attempt };
  }
}

async function answerPrompt(page: Page, pr: { kind: string; title: string; minTargets?: number }) {
  const card = page.getByRole('dialog', { name: pr.title });
  if (pr.kind === 'choose_players') {
    const n = Math.max(1, pr.minTargets ?? 1);
    const choices = card.locator('.cth-choices button');
    for (let i = 0; i < n; i++) await choices.nth(i).click();
    await card.getByRole('button', { name: 'Confirm' }).click();
  } else if (pr.kind === 'choose_character') {
    const sel = card.locator('select');
    const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    await sel.selectOption(opts[0]!);
    await card.getByRole('button', { name: 'Confirm' }).click();
  } else if (pr.kind === 'yes_no') await card.getByRole('button', { name: 'Yes', exact: true }).click();
  else await card.getByRole('button', { name: 'OK' }).click();
}
