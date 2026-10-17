// UX walkthrough (ux teammate): drives every screen at 1440x900, 1280x720 and a 390x844 touch phone
// and saves screenshots to test-results/ux/<UX_PHASE>/ for visual review. It also asserts the layout
// invariants we care about (no fixed overlays overlapping, no page scroll in the town, error screens
// reachable) so regressions fail loudly.
//
//   E2E_BASE_URL=http://127.0.0.1:3330 UX_PHASE=after pnpm exec playwright test -c tests/e2e/playwright.config.ts ux-walkthrough
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { FrameTap } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PHASE = process.env.UX_PHASE ?? 'run';
const OUT = path.join(ROOT, 'test-results/ux', PHASE);
const suffix = Math.random().toString(36).slice(2, 6);

const DESKTOP = [
  { tag: 'd1440', width: 1440, height: 900 },
  { tag: 'd1280', width: 1280, height: 720 },
] as const;
const PHONE = { tag: 'm390', width: 390, height: 844 };

let ipNo = 0;
const fakeIp = () => `10.88.${(process.pid + ++ipNo) % 250}.${ipNo % 250}`;

interface P {
  name: string;
  ctx: BrowserContext;
  page: Page;
  tap: FrameTap;
  phone: boolean;
}

async function newClient(browser: Browser, name: string, phone = false): Promise<P> {
  const ctx = await browser.newContext(
    phone
      ? {
          ...devices['iPhone 13'],
          viewport: { width: PHONE.width, height: PHONE.height },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          extraHTTPHeaders: { 'X-Forwarded-For': fakeIp() },
        }
      : { viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'X-Forwarded-For': fakeIp() } },
  );
  // Track page WebSockets so the walkthrough can simulate a dropped connection.
  await ctx.addInitScript(() => {
    const W = window.WebSocket;
    const list: WebSocket[] = [];
    (window as unknown as { __ctSockets: WebSocket[] }).__ctSockets = list;
    window.WebSocket = class extends W {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        list.push(this);
      }
    } as typeof WebSocket;
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) consoleLog.push(`${name}: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => consoleLog.push(`${name}: pageerror ${e.message.slice(0, 200)}`));
  return { name, ctx, page, tap: new FrameTap(name, page), phone };
}

async function signUp(p: P, shots?: string) {
  const { page } = p;
  if (!page.url().startsWith('http')) await page.goto('/');
  // signed-out share link: the landing shows the "You've been invited" card (Join the game)
  const join = page.getByRole('button', { name: 'Join the game' });
  const create = page.getByRole('button', { name: 'Create account' });
  await expect(join.or(create).first()).toBeVisible({ timeout: 30_000 });
  if (await join.count()) await join.click();
  else await create.click();
  await page.getByLabel('Display name').fill(p.name);
  if (shots) await snap(page, `${shots}-auth-2-create`);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Your passphrase')).toBeVisible();
  if (shots) await snap(page, `${shots}-auth-3-reveal`);
  await page.getByLabel('I have saved my passphrase somewhere safe').check();
  await page.getByRole('button', { name: 'Enter the town' }).click();
}

async function snap(page: Page, name: string, settle = 350) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** Screenshot a desktop page at every desktop size. */
async function snapSizes(page: Page, name: string, settle = 500) {
  // UX_FAST=1: 1440x900 only (the shared host is often heavily loaded).
  for (const s of process.env.UX_FAST ? DESKTOP.slice(0, 1) : DESKTOP) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await snap(page, `${name}-${s.tag}`, settle);
    await assertNoOverlap(page, `${name}-${s.tag}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Fixed/absolute overlay panels must not overlap each other (ignoring fully transparent containers). */
const OVERLAYS = [
  '.cth-card',
  '.cts',
  '.cts-tab-closed',
  '.ct-chat',
  '.ct-chat-toggle',
  '.ctv',
  '.ct-waiting',
  '.ct-touch-stick',
  '.ct-touch-use',
  '.ct-inside',
];
const overlapLog: string[] = [];
const consoleLog: string[] = [];
async function assertNoOverlap(page: Page, label: string) {
  const boxes = await page.evaluate((sels) => {
    const out: { sel: string; x: number; y: number; w: number; h: number }[] = [];
    for (const sel of sels)
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') out.push({ sel, x: r.x, y: r.y, w: r.width, h: r.height });
      }
    return out;
  }, OVERLAYS);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) overlapLog.push(`${label}: ${a.sel} overlaps ${b.sel} by ${Math.round(ox)}x${Math.round(oy)}`);
    }
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (scroll.sw > scroll.cw + 1) overlapLog.push(`${label}: horizontal page overflow ${scroll.sw} > ${scroll.cw}`);
}

const gv = (p: P) => p.tap.last('game:view');

test.describe.configure({ mode: 'serial' });
// no action may hang forever (the config sets no actionTimeout)
test.use({ actionTimeout: 120_000 });

test('ux walkthrough', async ({ browser }) => {
  test.setTimeout(3_600_000);
  const all: P[] = [];
  const notes: string[] = [];
  try {
    // ------------------------------------------------------------- auth screens
    const st = await newClient(browser, `Teller ${suffix}`);
    all.push(st);
    // (st-ui) this walkthrough drives the classic Grimoire & tools panel (the default is the script)
    await st.ctx.addInitScript(() => {
      try {
        localStorage.setItem('ct.st.tools', '1');
      } catch {}
    });
    await st.page.goto('/');
    await expect(st.page.getByRole('button', { name: 'Create account' })).toBeVisible();
    for (const s of DESKTOP) {
      await st.page.setViewportSize(s);
      await snap(st.page, `01-welcome-${s.tag}`);
    }
    await st.page.setViewportSize({ width: 1440, height: 900 });
    await st.page.getByRole('button', { name: 'Sign in with passphrase' }).click();
    await snap(st.page, '02-signin-d1440');
    await st.page.getByRole('button', { name: 'Back' }).click();
    await signUp(st, '03-d1440');
    await expect(st.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();

    const ph = await newClient(browser, `Phoebe ${suffix}`, true);
    all.push(ph);
    await ph.page.goto('/');
    await snap(ph.page, '01-welcome-m390');
    await ph.page.getByRole('button', { name: 'Sign in with passphrase' }).click();
    await snap(ph.page, '02-signin-m390');
    await ph.page.getByRole('button', { name: 'Back' }).click();
    await signUp(ph, '03-m390');
    await expect(ph.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();

    // ------------------------------------------------------------- home + create modal
    // A couple of decoy lobbies so the finder isn't empty (incl. an XSS-ish name).
    const decoy = await newClient(browser, `Decoy ${suffix}`);
    all.push(decoy);
    await decoy.page.goto('/');
    await signUp(decoy);
    // (one open lobby per account, so each decoy lobby gets its own host)
    const decoy2 = await newClient(browser, `Decoy2 ${suffix}`);
    all.push(decoy2);
    await decoy2.page.goto('/');
    await signUp(decoy2);
    for (const [host, name, max] of [[decoy, `<b>bold</b> & co ${suffix}`, 7], [decoy2, `A rather long lobby name for tests ${suffix}`, 15]] as const) {
      const r = await host.page.request.post('/api/lobbies', { data: { name, maxPlayers: max, script: 'trouble-brewing', description: 'Friday night game — bring snacks. '.repeat(3).trim(), takeStoryteller: false } });
      expect(r.ok(), `create decoy lobby: ${r.status()} ${await r.text()}`).toBeTruthy();
    }
    await decoy2.ctx.close();
    // (shared host: keep <= 6 browser contexts open at once)
    await decoy.ctx.close();
    await expect(st.page.locator('.ct-lobby').first()).toBeVisible({ timeout: 15_000 });
    await snapSizes(st.page, '04-home');
    await snap(ph.page, '04-home-m390', 800);
    await ph.page.evaluate(() => window.scrollTo(0, 0));
    await ph.page.locator('.ct-home').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await snap(ph.page, '04-home-m390-bottom');
    await ph.page.locator('.ct-home').evaluate((el) => (el.scrollTop = 0));

    // v2 character picker on the home screen: a fixed roster, a pick is saved at once (no custom
    // characters / "Advanced customization" any more).
    const roster = st.page.getByRole('radiogroup', { name: 'Choose your character' });
    await expect(roster).toBeVisible();
    await expect(st.page.getByText('Advanced customization')).toHaveCount(0);
    const pick = roster.getByRole('radio', { name: /^Old Delve/ });
    if ((await pick.getAttribute('aria-checked')) !== 'true') {
      await pick.click();
      await expect(st.page.getByText(/^Saved\./)).toBeVisible();
    }
    await expect(pick).toHaveAttribute('aria-checked', 'true');
    await snap(st.page, '04b-picker-selected-d1440', 600);
    await roster.getByRole('radio', { name: /^Polly/ }).hover();
    await snap(st.page, '04c-picker-hover-mascot-d1440', 400);
    await st.page.getByRole('button', { name: /create lobby/i }).first().click();
    const dialog = st.page.getByRole('dialog', { name: 'Create lobby' });
    await dialog.getByLabel('Lobby name').fill(`Hollowmere ${suffix}`);
    await snapSizes(st.page, '05-create-modal');
    await ph.page.getByRole('button', { name: /create lobby/i }).first().click();
    await snap(ph.page, '05-create-modal-m390');
    await ph.page.getByRole('dialog', { name: 'Create lobby' }).getByRole('button', { name: 'Cancel' }).click();
    await dialog.getByLabel(/storyteller seat/i).check();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await st.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
    const lobbyPath = new URL(st.page.url()).pathname;
    const lobbyId = lobbyPath.split('/').pop()!;

    // ------------------------------------------------------------- waiting room
    await expect(st.page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 60_000 });
    await ph.page.goto(lobbyPath);
    await expect(ph.page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 60_000 });
    await snap(ph.page, '06-waiting-m390-collapsed', 1200);
    const openChat = ph.page.getByRole('button', { name: /^Open chat/ });
    if (await openChat.count()) await openChat.click();
    await ph.page.getByLabel('Chat message').fill('hello <i>town</i> — anyone here?');
    await ph.page.getByLabel('Chat message').press('Enter');
    await snapSizes(st.page, '06-waiting-st', 1200);
    await snap(ph.page, '06-waiting-m390-chat', 1200);
    const minChat = ph.page.getByRole('button', { name: 'Minimise chat' });
    if (await minChat.count()) await minChat.click();
    const showDetails = ph.page.getByRole('button', { name: 'Show lobby details' });
    if (await showDetails.count()) await showDetails.click();
    await snap(ph.page, '06-waiting-m390-expanded', 400);
    if (await showDetails.count()) await ph.page.getByRole('button', { name: 'Hide lobby details' }).click();
    // How to play (first-timer call-out in the waiting room).
    const howTo = st.page.getByRole('dialog', { name: 'Waiting room' }).getByRole('button', { name: /How to play/ }).first();
    if (await howTo.count()) {
      await howTo.click();
      await snapSizes(st.page, '06b-help');
      await st.page.getByRole('button', { name: 'Got it' }).click();
      await ph.page.getByRole('button', { name: /How to play/ }).first().click();
      await snap(ph.page, '06b-help-m390');
      await ph.page.getByRole('tab', { name: 'Day & votes' }).click();
      await snap(ph.page, '06b-help-votes-m390');
      await ph.page.getByRole('button', { name: 'Got it' }).click();
    }

    // Deep link while signed out -> sign up -> lands back in the lobby.
    const deep = await newClient(browser, `Deep ${suffix}`);
    all.push(deep);
    await deep.page.goto(lobbyPath);
    await snap(deep.page, '07-deeplink-signedout-d1440');
    await signUp(deep);
    const tDeep = Date.now();
    const deepOk = await deep.page
      .getByRole('dialog', { name: 'Waiting room' })
      .waitFor({ timeout: 30_000 })
      .then(() => true, () => false);
    notes.push(`deep link returns to lobby after sign-up: ${deepOk} in ${Date.now() - tDeep} ms (url ${new URL(deep.page.url()).pathname})`);
    await snap(deep.page, '07-deeplink-after-signup-d1440', 1200);

    // Fill to 5 players: phone, deep, + 3 more desktop players.
    const players: P[] = [ph, deep];
    for (const n of ['Bram', 'Cora', 'Dov']) {
      const p = await newClient(browser, `${n} ${suffix}`);
      all.push(p);
      await p.page.goto(lobbyPath);
      await signUp(p);
      const t0 = Date.now();
      await expect(p.page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 30_000 });
      notes.push(`${p.name}: waiting room ${Date.now() - t0} ms after sign-up`);
      players.push(p);
    }
    for (const p of players) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await p.page.getByRole('button', { name: "I'm ready" }).click();
        if (await p.page.getByRole('button', { name: 'Not ready' }).waitFor({ timeout: 4000 }).then(() => true, () => false)) break;
      }
    }
    await st.tap.until(() => st.tap.last('lobby:view')?.canStart, 20_000, 'canStart');
    await snapSizes(st.page, '08-waiting-full-st');
    await snapSizes(deep.page, '08-waiting-full-player');
    await snap(ph.page, '08-waiting-full-m390');

    // ------------------------------------------------------------- game
    await st.page.getByRole('button', { name: 'Start game' }).click();
    await st.tap.until(() => gv(st)?.phase === 'setup', 15_000, 'setup');
    await snapSizes(st.page, '09-setup-st', 1000);
    await snap(ph.page, '09-setup-m390', 1000);
    await st.page.getByRole('button', { name: 'Random setup', exact: true }).click();
    await st.tap.until(() => gv(st)?.grimoire?.length === 5, 10_000, 'grimoire');
    // (st-ui) phases are jumped with the script panel's stage cues (any cue, with a confirm when it skips ahead)
    const cueTo = async (id: string, phase: string) => {
      if (await st.page.getByRole('button', { name: /Back to the script/ }).count()) await st.page.getByRole('button', { name: /Back to the script/ }).click();
      await st.page.locator(`.cts-cue[data-cue="${id}"]`).click();
      const yes = st.page.locator('.cts-armed, .cts-confirm').getByRole('button', { name: 'Yes' });
      if (await yes.first().waitFor({ timeout: 3000 }).then(() => true, () => false)) await yes.first().click();
      await st.tap.until(() => gv(st)?.phase === phase, 30_000, phase);
    };
    await cueTo('first_night', 'first_night');
    for (const p of players) await p.tap.until(() => gv(p)?.phase === 'first_night', 15_000, 'first night');
    await st.page.waitForTimeout(2500);
    await snapSizes(st.page, '10-night-st', 800);
    await snapSizes(deep.page, '10-night-player', 800);
    await snap(ph.page, '10-night-m390', 800);

    // Dawn -> day.
    await cueTo('dawn', 'dawn');
    await snapSizes(st.page, '10b-dawn-st-script', 600);
    await cueTo('day', 'day');
    await st.page.getByRole('button', { name: /Grimoire & tools/ }).click();
    await st.page.waitForTimeout(3500);
    await snap(deep.page, '11a-day-player-chat-folded-d1440', 300);
    if (await deep.page.getByRole('button', { name: /^Open chat/ }).count()) await deep.page.getByRole('button', { name: /^Open chat/ }).click();
    await deep.page.getByLabel('Chat message').fill('Who visited whom last night?');
    await deep.page.getByLabel('Chat message').press('Enter');
    await snapSizes(st.page, '11-day-st', 800);
    const gear = st.page.getByRole('button', { name: 'Settings' });
    if (await gear.count()) {
      await gear.click();
      await snap(st.page, '11b-settings-d1440', 300);
      // (v2.3) Settings is a modal dialog now: Esc closes it (the backdrop covers the gear).
      await st.page.keyboard.press('Escape');
      await expect(st.page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
    }
    await snapSizes(deep.page, '11-day-player', 800);
    await snap(ph.page, '11-day-m390', 800);
    await assertNoOverlap(ph.page, '11-day-m390');
    const chatBtn = ph.page.getByRole('button', { name: /^Open chat/ });
    if (await chatBtn.count()) {
      await chatBtn.click();
      await snap(ph.page, '11-day-m390-chat-open', 300);
      await ph.page.getByRole('button', { name: 'Minimise chat' }).click();
    }
    // v2: players wake up inside their cottage (walkable room + "Inside …" panel); Leave walks out
    // and the home compass shows.
    const inside = deep.page.locator('.ct-inside');
    if (await inside.count()) {
      await snapSizes(deep.page, '11-day-player-inside', 400);
      await inside.getByRole('button', { name: 'Leave' }).click();
      await expect(inside).toHaveCount(0, { timeout: 15_000 });
    } else notes.push('desktop player was not inside a cottage at day start');
    await deep.page.keyboard.down('ArrowDown');
    await deep.page.waitForTimeout(500);
    await deep.page.keyboard.up('ArrowDown');
    await snapSizes(deep.page, '11-day-player-outdoors', 600);

    // Phone: leave the cottage with the Leave button (v2.2: the joystick also works inside), then walk with the stick.
    const phInside = ph.page.locator('.ct-inside');
    if (await phInside.count()) {
      await snap(ph.page, '11-day-m390-inside', 300);
      await phInside.getByRole('button', { name: 'Leave' }).tap();
      await expect(phInside).toHaveCount(0, { timeout: 15_000 });
      await ph.page.waitForTimeout(800);
    }
    const stick = ph.page.locator('.ct-touch-stick');
    if (await stick.count()) {
      const box = (await stick.boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const cdp = await ph.ctx.newCDPSession(ph.page);
      // Push the stick one way and check the player moved that way. After leaving the cottage the
      // player stands on its doorstep, which may sit at a map edge (the bottom-row cottages) or face a
      // wall, so try down, then left, then right until one direction is open; "up" would walk back
      // into the doorway.
      const dirs = [
        { name: 'down', dx: 0, dy: 1 },
        { name: 'left', dx: -1, dy: 0 },
        { name: 'right', dx: 1, dy: 0 },
      ];
      let moved: { name: string; frames: number; dist: number } | null = null;
      for (const d of dirs) {
        const t0 = Date.now();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
        for (let i = 1; i <= 6; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + d.dx * i * 8, y: cy + d.dy * i * 8 }] });
          await ph.page.waitForTimeout(40);
        }
        if (d.name === 'down') await snap(ph.page, '12-joystick-active-m390', 50);
        await ph.page.waitForTimeout(900);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await ph.page.waitForTimeout(300);
        const moves = ph.tap.sent('move', t0);
        const first = moves[0];
        const last = moves.at(-1);
        const dist = first && last ? (last.x - first.x) * d.dx + (last.y - first.y) * d.dy : 0;
        notes.push(`joystick ${d.name}: ${moves.length} move frames; ${first ? `${Math.round(first.x)},${Math.round(first.y)}` : '-'} -> ${last ? `${Math.round(last.x)},${Math.round(last.y)}` : '-'}`);
        expect(moves.length, `joystick ${d.name} produced move frames`).toBeGreaterThan(0);
        if (dist > 4) {
          moved = { name: d.name, frames: moves.length, dist };
          break;
        }
      }
      expect(moved, 'the joystick moves the player in at least one open direction').not.toBeNull();
    } else notes.push('no on-screen joystick on phone');

    // Reconnecting banner: drop the phone's network briefly.
    const cdp = await ph.ctx.newCDPSession(ph.page);
    await cdp.send('Network.enable');
    await ph.page.evaluate(() => {
      for (const s of (window as unknown as { __ctSockets: WebSocket[] }).__ctSockets) if (s.readyState === 1) s.close(4000, 'ux test drop');
    });
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await ph.page.waitForTimeout(2500);
    notes.push(`reconnecting banner visible: ${await ph.page.getByText('Connection lost — reconnecting').isVisible()}`);
    await snap(ph.page, '13-reconnecting-m390', 50);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await ph.page.waitForTimeout(6000);
    await snap(ph.page, '13-reconnected-m390', 50);
    notes.push(`banner gone after reconnect: ${!(await ph.page.getByText('Connection lost').isVisible())}`);

    // ------------------------------------------------------------- endgame
    await st.page.locator('.cts-tabs').getByRole('button', { name: 'Tools' }).click();
    await st.page.getByRole('button', { name: 'Good wins', exact: true }).first().click();
    const sure = st.page.locator('.cts-confirm, .cts-armed').getByRole('button', { name: 'Yes' });
    if (await sure.first().waitFor({ timeout: 5000 }).then(() => true, () => false)) await sure.first().click();
    const cge = st.page.getByRole('button', { name: 'Confirm game end' });
    if (await cge.first().waitFor({ timeout: 5000 }).then(() => true, () => false)) {
      await cge.first().click();
      if (await sure.first().waitFor({ timeout: 5000 }).then(() => true, () => false)) await sure.first().click();
    }
    await expect(deep.page.getByRole('dialog', { name: 'Game results' })).toBeVisible({ timeout: 15_000 });
    await snapSizes(st.page, '14-endgame-st', 1000);
    await snapSizes(deep.page, '14-endgame-player', 1000);
    await snap(ph.page, '14-endgame-m390', 1000);
    // the Storyteller and the phone are done: free their contexts (<= 6 open at once)
    await st.ctx.close();
    await ph.ctx.close();

    // ------------------------------------------------------------- error states
    const late = await newClient(browser, `Late ${suffix}`);
    all.push(late);
    await late.page.goto('/');
    await signUp(late);
    // (a) lobby already started/finished: lobby 1 is no longer waiting.
    await late.page.goto(lobbyPath);
    await late.page.waitForTimeout(1500);
    await snap(late.page, '15-err-started-d1440');

    // (b) lobby full: decoy hosts a 5-seat lobby, 5 players fill it, late tries to join.
    const host2 = await newClient(browser, `Host2 ${suffix}`);
    all.push(host2);
    await host2.page.goto('/');
    await signUp(host2);
    const r = await host2.page.request.post('/api/lobbies', { data: { name: `Tiny ${suffix}`, maxPlayers: 5, script: 'trouble-brewing', description: '', takeStoryteller: false } });
    const tiny = ((await r.json()) as { lobby: { id: string } }).lobby.id;
    await host2.page.goto(`/lobby/${tiny}`);
    // (joining + the lazily loaded lobby chunk can take > 10 s on the shared host)
    await expect(host2.page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 60_000 });
    for (const p of players.slice(1)) {
      await p.page.goto(`/lobby/${tiny}`);
      // ("Joining lobby…" can take > 10 s on the shared host)
      await expect(p.page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 60_000 });
    }
    await late.page.goto(`/lobby/${tiny}`);
    await late.page.waitForTimeout(1500);
    await snap(late.page, '16-err-full-d1440');
    // Admin, denied (non-admin account) — taken now so `late` can be closed before the phone joins.
    await late.page.goto('/admin');
    await late.page.waitForTimeout(1200);
    await snap(late.page, '19-admin-denied-d1440');
    await late.ctx.close();
    const phLate = await newClient(browser, `PhLate ${suffix}`, true);
    all.push(phLate);
    await phLate.page.goto(`/lobby/${tiny}`);
    await signUp(phLate);
    await phLate.page.waitForTimeout(1500);
    await snap(phLate.page, '16-err-full-m390');

    // (c) replaced by another device: the same account opens the lobby in a second tab.
    const tab2 = await players[1]!.ctx.newPage();
    await tab2.goto(`/lobby/${tiny}`);
    await expect(tab2.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 60_000 });
    await players[1]!.page.waitForTimeout(1500);
    await snap(players[1]!.page, '17-err-replaced-d1440');
    await tab2.close();

    // (d) kicked by the host.
    const sheet = host2.page.getByRole('dialog', { name: 'Waiting room' });
    if (await sheet.getByRole('button', { name: 'Show lobby details' }).count()) await sheet.getByRole('button', { name: 'Show lobby details' }).click();
    await sheet.locator('.ct-member', { hasText: players[2]!.name }).getByRole('button', { name: 'Kick' }).click();
    await players[2]!.page.waitForTimeout(1500);
    await snap(players[2]!.page, '18-err-kicked-d1440');

    const admin = process.env.UX_ADMIN_FILE;
    if (admin && existsSync(admin)) {
      const { passphrase } = JSON.parse(readFileSync(admin, 'utf8')) as { passphrase: string };
      const a = await newClient(browser, 'admin');
      all.push(a);
      await a.page.goto('/');
      await a.page.getByRole('button', { name: 'Sign in with passphrase' }).click();
      await a.page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
      await a.page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(a.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
      await a.page.goto('/admin');
      await a.page.waitForTimeout(1500);
      await snapSizes(a.page, '20-admin');
      const am = await newClient(browser, 'admin-m', true);
      all.push(am);
      await am.ctx.addCookies(await a.ctx.cookies());
      await am.page.goto('/admin');
      await am.page.waitForTimeout(1500);
      await snap(am.page, '20-admin-m390');
    } else if (admin) {
      // Phase A: create the admin account and record it so the server can be restarted with its id.
      const a = await newClient(browser, 'Admin');
      all.push(a);
      await a.page.goto('/');
      await a.page.getByRole('button', { name: 'Create account' }).click();
      await a.page.getByLabel('Display name').fill('Admin');
      await a.page.getByRole('button', { name: 'Create account' }).click();
      const passphrase = (await a.page.getByLabel('Your passphrase').textContent())!.trim();
      const me = await (await a.page.request.get('/api/me')).json();
      writeFileSync(admin, JSON.stringify({ id: me.id, passphrase }));
    }
  } finally {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, 'notes.json'), JSON.stringify({ notes, overlaps: overlapLog, console: [...new Set(consoleLog)] }, null, 2));
    for (const p of all) await p.ctx.close().catch(() => undefined);
  }
});
