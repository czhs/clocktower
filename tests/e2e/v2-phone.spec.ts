// v2 phone checks (e2e): 390x844 portrait and 844x390 landscape touch phones, through the real UI.
//   joining   sign up on the phone (character picker), open the share link, Ready
//   picking   "Choose your character" at sign-up; "Change character…" in the waiting room; a second
//             phone that picked the SAME character is given a free one in this lobby (no duplicates)
//             and sees the first phone's character as "taken by …"
//   cottages  tap a cottage to walk there and go in (tap the ground first when it is off screen);
//             the "Inside … with …" panel + Leave button fit the screen in both orientations; Leave
//             walks you out; two phones inside one cottage share its private voice zone while a
//             player outside stays in the square zone (decoded voice:grant frames)
// The Storyteller and three filler players are driven at message level (setup + force day): the
// full-game specs cover the Storyteller UI. Screenshots: docs/screenshots/v2-e2e-phone-*.png (written
// to test-results/v2-e2e/ on hshi-u1; pull them back).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  FrameTap,
  geo,
  inject,
  insidePanel,
  installSocketTap,
  leaveButton,
  leaveByButton,
  PHONE_LANDSCAPE,
  PHONE_PORTRAIT,
  selfEntity,
  signUp,
  tapCottage,
  voiceZone,
  zonesGranted,
  type Player,
} from './helpers';

const OUT = path.resolve('test-results/v2-e2e');
const suffix = Math.random().toString(36).slice(2, 6);
let ipNo = 0;

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `v2-e2e-${name}.png`) });
}

/** Fast account (API sign-up, as the lead's v2-look does) for the Storyteller / fillers. */
async function apiAccount(browser: Browser, name: string, viewport = { width: 1280, height: 800 }): Promise<Player> {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { 'X-Forwarded-For': `10.66.${process.pid % 200}.${++ipNo}` } });
  await installSocketTap(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('ct.hint.move.v1', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  const tap = new FrameTap(name, page);
  await page.goto('/');
  const r = await page.request.post('/api/auth/create', { data: { displayName: name } });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { name, ctx, page, tap };
}

const lv = (p: Player) => p.tap.last('lobby:view');
const gv = (p: Player) => p.tap.last('game:view');
const pidOf = (p: Player): string => lv(p)?.youPid;
const myPreset = (p: Player): string | null => lv(p)?.members.find((m: any) => m.pid === pidOf(p))?.cosmetics?.preset ?? null;

/** The panel and its Leave button are fully on screen and the button is a comfortable touch target. */
async function panelFits(page: Page, label: string) {
  const vp = page.viewportSize()!;
  const panel = await insidePanel(page).boundingBox();
  const btn = await leaveButton(page).boundingBox();
  expect(panel, `${label}: inside panel shown`).not.toBeNull();
  expect(btn, `${label}: Leave button shown`).not.toBeNull();
  for (const [what, b] of [['panel', panel!], ['Leave', btn!]] as const) {
    expect(b.x, `${label}: ${what} left edge on screen`).toBeGreaterThanOrEqual(0);
    expect(b.y, `${label}: ${what} top edge on screen`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `${label}: ${what} right edge on screen`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y + b.height, `${label}: ${what} bottom edge on screen`).toBeLessThanOrEqual(vp.height + 0.5);
  }
  expect(btn!.height, `${label}: Leave button height (touch target)`).toBeGreaterThanOrEqual(32);
  // nothing covers the middle of the Leave button
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return !!el?.closest('.ct-inside-leave');
  }, { x: btn!.x + btn!.width / 2, y: btn!.y + btn!.height / 2 });
  expect(hit, `${label}: the Leave button is not covered`).toBe(true);
  return { panel: panel!, btn: btn! };
}

test.use({ actionTimeout: 60_000 });

test('v2 phones: join, pick a character, tap into a cottage, Leave (portrait + landscape)', async ({ browser }) => {
  test.setTimeout(1_500_000);
  const all: Player[] = [];
  const notes: string[] = [];
  try {
    // ---------------------------------------------------------------- lobby
    const st = await apiAccount(browser, `PhST ${suffix}`);
    all.push(st);
    const lr = await st.page.request.post('/api/lobbies', { data: { name: `Phones ${suffix}`, maxPlayers: 10, takeStoryteller: true } });
    expect(lr.status(), await lr.text()).toBeLessThan(300);
    const id = ((await lr.json()) as { lobby: { id: string } }).lobby.id;
    const lobbyPath = `/lobby/${id}`;
    await st.page.goto(lobbyPath);
    await st.tap.until(() => lv(st)?.youPid, 30_000, 'ST in lobby');

    // portrait phone: sign up with the picker, join through the share link
    const P = await signUp(browser, `Pia ${suffix}`, { phone: true, viewport: PHONE_PORTRAIT, characterIndex: 4 });
    all.push(P);
    expect(P.presetId, 'picked character saved on the account').toBe(P.character);
    await P.page.goto(lobbyPath);
    const sheetP = P.page.getByRole('dialog', { name: 'Waiting room' });
    await expect(sheetP).toBeVisible({ timeout: 60_000 });
    await P.tap.until(() => myPreset(P), 15_000, 'P lobby preset');
    expect(myPreset(P), 'P keeps the picked character in the lobby').toBe(P.character);
    await shot(P.page, 'phone-portrait-waiting');
    // change character in the waiting room
    const showDetails = sheetP.getByRole('button', { name: 'Show lobby details' });
    if (await showDetails.count()) await showDetails.tap();
    await sheetP.getByRole('button', { name: /Change character/ }).tap();
    const lobbyPicker = P.page.getByRole('radiogroup', { name: 'Choose your character for this lobby' });
    await expect(lobbyPicker).toBeVisible();
    const target = lobbyPicker.getByRole('radio').nth(9);
    const targetId = (await target.getAttribute('data-cast'))!;
    await target.scrollIntoViewIfNeeded();
    await target.tap();
    await P.tap.until(() => myPreset(P) === targetId, 15_000, 'lobby confirms the new character');
    await expect(target).toHaveAttribute('aria-checked', 'true');
    await shot(P.page, 'phone-portrait-change-character');
    await sheetP.getByRole('button', { name: 'Done' }).tap();
    const pChar = myPreset(P)!;
    notes.push(`P picked ${P.character} at sign-up, switched to ${pChar} in the lobby`);

    // landscape phone: picks the SAME character as P at sign-up -> gets a free one in this lobby
    const { playable } = await geo();
    const sameIdx = playable.findIndex((c) => c.id === pChar);
    const Q = await signUp(browser, `Quin ${suffix}`, { phone: true, viewport: PHONE_LANDSCAPE, characterIndex: sameIdx });
    all.push(Q);
    expect(Q.character).toBe(pChar);
    await Q.page.goto(lobbyPath);
    const sheetQ = Q.page.getByRole('dialog', { name: 'Waiting room' });
    await expect(sheetQ).toBeVisible({ timeout: 60_000 });
    await Q.tap.until(() => myPreset(Q), 15_000, 'Q lobby preset');
    expect(myPreset(Q), 'no duplicate characters in one lobby').not.toBe(pChar);
    notes.push(`Q picked ${Q.character} (P's) at sign-up -> given ${myPreset(Q)} in this lobby`);
    const showQ = sheetQ.getByRole('button', { name: 'Show lobby details' });
    if (await showQ.count()) await showQ.tap();
    await sheetQ.getByRole('button', { name: /Change character/ }).tap();
    const qPicker = Q.page.getByRole('radiogroup', { name: 'Choose your character for this lobby' });
    const pTile = qPicker.locator(`[role="radio"][data-cast="${pChar}"]`);
    await expect(pTile).toHaveAttribute('aria-disabled', 'true');
    await expect(pTile).toHaveAttribute('aria-label', new RegExp(`taken by ${P.name}`));
    await pTile.scrollIntoViewIfNeeded();
    await pTile.tap({ force: true }); // aria-disabled: it only explains itself
    await Q.page.waitForTimeout(1500);
    expect(myPreset(Q), 'tapping a taken character does not take it').not.toBe(pChar);
    await shot(Q.page, 'phone-landscape-taken-character');
    await sheetQ.getByRole('button', { name: 'Done' }).tap();

    // three fillers
    const fillers: Player[] = [];
    for (const n of ['Fen', 'Gil', 'Hal']) {
      const f = await apiAccount(browser, `${n} ${suffix}`, { width: 900, height: 600 });
      all.push(f);
      await f.page.goto(lobbyPath);
      await expect(f.page.getByRole('button', { name: "I'm ready" })).toBeEnabled({ timeout: 60_000 });
      await f.page.getByRole('button', { name: "I'm ready" }).click();
      fillers.push(f);
    }
    for (const p of [P, Q]) {
      const ready = p.page.getByRole('button', { name: "I'm ready" });
      await expect(ready).toBeEnabled({ timeout: 30_000 });
      await ready.tap();
      await expect(p.page.getByRole('button', { name: 'Not ready' })).toBeVisible({ timeout: 15_000 });
    }
    await st.tap.until(() => lv(st)?.canStart, 30_000, 'canStart');
    const presets = lv(st).members.filter((m: any) => m.role === 'player').map((m: any) => m.cosmetics.preset);
    expect(new Set(presets).size, `unique characters ${presets.join(',')}`).toBe(presets.length);

    // ---------------------------------------------------------------- game: day
    await st.page.getByRole('button', { name: 'Start game' }).click();
    await st.tap.until(() => gv(st)?.phase === 'setup', 30_000, 'setup');
    await inject(st.page, 'st:command', { type: 'random_setup' });
    await st.tap.until(() => gv(st)?.charactersAssigned, 15_000, 'assigned');
    await inject(st.page, 'st:command', { type: 'force_phase', to: 'day' });
    for (const p of [P, Q, ...fillers]) await p.tap.until(() => gv(p)?.phase === 'day', 30_000, 'day');
    const { L } = await geo();
    const homeOf = (p: Player) => L.buildings.find((b) => b.houseIndex === gv(p).you.seat)!;
    const pPid = pidOf(P);
    const qPid = pidOf(Q);
    // where are they? (day 1 after a forced day: wherever the server put them)
    for (const p of [P, Q]) {
      const me = selfEntity(p, pidOf(p));
      notes.push(`${p.name} starts the day at ${me?.location} ${Math.round(me?.x ?? 0)},${Math.round(me?.y ?? 0)}`);
      if (me && me.location !== 'outdoors') await leaveByButton(p, pidOf(p), { touch: true });
    }
    await shot(P.page, 'phone-portrait-day');
    await shot(Q.page, 'phone-landscape-day');

    // portrait: tap own cottage -> in -> Leave
    const hp = homeOf(P);
    notes.push(`P portrait taps own cottage ${hp.id}: ${(await tapCottage(P, pPid, hp.id, { touch: true })).join(' | ')}`);
    await expect(insidePanel(P.page)).toBeVisible({ timeout: 15_000 });
    await expect(insidePanel(P.page)).toContainText('Your home');
    await expect(P.page.locator('.ct-touch-stick')).toHaveCount(0); // no joystick inside
    const fitP = await panelFits(P.page, 'portrait inside');
    notes.push(`portrait panel ${JSON.stringify(fitP)}`);
    await shot(P.page, 'phone-portrait-inside');
    await leaveByButton(P, pPid, { touch: true });
    await expect(P.page.locator('.ct-touch-stick')).toBeVisible({ timeout: 10_000 });

    // portrait: the cottage farthest to the side (portrait shows the square's width only, so it is
    // usually off screen): tap the ground toward it, then the cottage itself
    const homes = [P, Q, ...fillers].map(homeOf).filter((b) => b.id !== hp.id);
    const side = homes.sort((a, b) => Math.abs(b.door.x * 16 - 360) - Math.abs(a.door.x * 16 - 360))[0]!;
    const sideLog = await tapCottage(P, pPid, side.id, { touch: true });
    notes.push(`P portrait taps side cottage ${side.id} (door x ${side.door.x * 16}): ${sideLog.join(' | ')}`);
    await expect(insidePanel(P.page)).toBeVisible({ timeout: 15_000 });
    await shot(P.page, 'phone-portrait-side-cottage-inside');
    await leaveByButton(P, pPid, { touch: true });

    // landscape: tap P's cottage (a neighbour's, by day = a private room) -> in
    notes.push(`Q landscape taps ${hp.id}: ${(await tapCottage(Q, qPid, hp.id, { touch: true })).join(' | ')}`);
    await expect(insidePanel(Q.page)).toBeVisible({ timeout: 15_000 });
    await expect(insidePanel(Q.page)).toContainText(`${P.name}’s home`);
    const fitQ = await panelFits(Q.page, 'landscape inside');
    notes.push(`landscape panel ${JSON.stringify(fitQ)}`);
    await shot(Q.page, 'phone-landscape-inside-alone');
    // P comes back in: both inside, they see each other; the outside filler does not share the zone
    notes.push(`P re-enters: ${(await tapCottage(P, pPid, hp.id, { touch: true })).join(' | ')}`);
    await expect(insidePanel(Q.page)).toContainText(P.name, { timeout: 15_000 });
    await expect(insidePanel(P.page)).toContainText(Q.name, { timeout: 15_000 });
    await expect(insidePanel(P.page)).toContainText(/only you two can hear each other/);
    const zone = `bld:${hp.id}`;
    const outside = fillers.find((f) => selfEntity(f, pidOf(f))?.location === 'outdoors') ?? fillers[0]!;
    await P.tap.until(() => voiceZone(P) === zone, 15_000, `P voice zone ${zone}`);
    await Q.tap.until(() => voiceZone(Q) === zone, 15_000, `Q voice zone ${zone}`);
    const outZone = voiceZone(outside);
    notes.push(`voice: P=${voiceZone(P)} Q=${voiceZone(Q)} ${outside.name} (${selfEntity(outside, pidOf(outside))?.location})=${outZone}; ${outside.name} ever granted ${JSON.stringify([...new Set(zonesGranted(outside))])}`);
    expect(zonesGranted(outside), `${outside.name} (outside) was never granted ${zone}`).not.toContain(zone);
    if (selfEntity(outside, pidOf(outside))?.location === 'outdoors') expect(outZone).toBe('square');
    await shot(P.page, 'phone-portrait-inside-two');
    await shot(Q.page, 'phone-landscape-inside-two');
    // rotate both phones while inside: the panel still fits
    await P.page.setViewportSize(PHONE_LANDSCAPE);
    await Q.page.setViewportSize(PHONE_PORTRAIT);
    await P.page.waitForTimeout(1500);
    await panelFits(P.page, 'P rotated to landscape');
    await panelFits(Q.page, 'Q rotated to portrait');
    await shot(P.page, 'phone-rotated-landscape-inside');
    await shot(Q.page, 'phone-rotated-portrait-inside');
    // both leave with the button
    await leaveByButton(Q, qPid, { touch: true });
    await expect(insidePanel(P.page)).toContainText('Nobody else is here', { timeout: 15_000 });
    await leaveByButton(P, pPid, { touch: true });
    for (const p of [P, Q]) await p.tap.until(() => voiceZone(p) === 'square', 15_000, 'back in the square zone');
    await shot(Q.page, 'phone-portrait-after-leave');
  } finally {
    console.log(notes.join('\n'));
    for (const p of all) await p.ctx.close().catch(() => undefined);
  }
});
