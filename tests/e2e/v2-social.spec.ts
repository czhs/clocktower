// v2 social (social-client): pointing + character pins, driven through the REAL UI gestures
// (right-click, F, middle-click, shift+click, the dock, touch long-press radial) and verified on the
// wire: what each client sent and what every other client received (decoded room frames).
//
//   1 Storyteller + 5 players (desktop 1440x900), day, everyone on the square except Cleo (inside).
//   Ada points at Bram (right-click) -> Bram sees it, Cleo (inside) does not.
//   Ada drops pins in several colours on a spot / on Bram / on Dov (F, middle-click, shift+click);
//   Bram adds one on Dov (a fan of two) -> Bram's snapshots carry them, Cleo's carry none.
//   Ada removes one of her pins by clicking it; hover shows the tooltip.
//   Phone 390x844 (Esme): long-press -> radial -> slide to Pin / tap Point; a short tap still walks.
//   The Storyteller clears all pins from the dock.
//
// Run on hshi-u1 against a throwaway server (build, then e.g. PORT=3355 HOST=127.0.0.1 NODE_ENV=test
// APP_ENV=test COOKIE_SECURE=false DATABASE_URL=file:/tmp/x/e2e.db SESSION_SECRET=… PASSPHRASE_PEPPER=…
// node apps/server/dist/server.js &), then:
//   E2E_BASE_URL=http://127.0.0.1:3355 pnpm exec playwright test -c tests/e2e/playwright.config.ts v2-social
// (or plain `pnpm test:e2e v2-social` with the config's own server). `-g quick` = the 30 s phone check.
// The page opts into the social layer's debug hook (localStorage ct.debug.social = 1) to assert what is
// DRAWN and to hold a gesture on screen while a (slow, software-rendered) screenshot is taken.
// Screenshots: docs/screenshots/v2-social-*.png
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { canvasBox, FrameTap, inject, installSocketTap, outdoorCamera } from './helpers';

const OUT = path.resolve('docs/screenshots');
const errors: string[] = [];
type Drawn = { seen: string[]; emotes: { pid: string; dir: string | null; hand: boolean; alpha: number; ping: boolean }[]; pins: { id: string; color: string; kind: string; visible: boolean; scale: number }[] };
const hold = (page: Page, on: boolean) => page.evaluate((v) => (window as any).__ctSocial?.hold(v), on);
const drawn = (page: Page): Promise<Drawn> =>
  page.evaluate(() => {
    const s = (window as unknown as { __ctSocial?: { emotes(): unknown; pins(): unknown; seen(): string[] } }).__ctSocial;
    return { seen: s?.seen() ?? [], emotes: (s?.emotes() ?? []) as Drawn['emotes'], pins: (s?.pins() ?? []) as Drawn['pins'] };
  });
let ipNo = 0;

interface Acc {
  name: string;
  ctx: BrowserContext;
  page: Page;
  tap: FrameTap;
  pid: string;
}

const noHints = () => {
  try {
    localStorage.setItem('ct.intro.seen', '1');
    localStorage.setItem('ct.hint.move.v1', '1');
    localStorage.setItem('ct.hint.social.v1', '1');
    localStorage.setItem('ct.debug.social', '1');
  } catch {}
};

async function account(browser: Browser, name: string): Promise<Acc> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'X-Forwarded-For': `10.89.${process.pid % 200}.${++ipNo}` } });
  await installSocketTap(ctx);
  await ctx.addInitScript(noHints);
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  const tap = new FrameTap(name, page);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/livekit|voice|ERR_NAME|net::|favicon|Failed to load resource|WebSocket is already in CLOSING or CLOSED/i.test(m.text()) && errors.push(`${name}: ${m.text().slice(0, 200)}`));
  await page.goto('/');
  const r = await page.request.post('/api/auth/create', { data: { displayName: name } });
  expect(r.status(), await r.text()).toBeLessThan(300);
  const me = await (await page.request.get('/api/me')).json();
  return { name, ctx, page, tap, pid: (me as { pid?: string; id?: string }).pid ?? '' };
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `v2-social-${name}.png`) });
}

type Ent = { id: string; x: number; y: number; location: string };
const ents = (a: Acc): Ent[] => a.tap.last('world:snapshot')?.entities ?? [];
const pinsOf = (a: Acc): any[] => a.tap.last('world:snapshot')?.pins ?? [];
const youPid = (a: Acc): string => a.tap.last('lobby:view')?.youPid ?? a.pid;

/** Page coords of a world point on this account's (outdoor) screen. */
async function toScreen(a: Acc, w: { x: number; y: number }) {
  const box = await canvasBox(a.page);
  const me = ents(a).find((e) => e.id === youPid(a))!;
  const cam = await outdoorCamera({ w: box.w, h: box.h }, me);
  return { x: box.x + (w.x - cam.cx) * cam.zoom + box.w / 2, y: box.y + (w.y - cam.cy) * cam.zoom + box.h / 2, zoom: cam.zoom };
}

test('v2 social: point + pins, desktop and phone', async ({ browser }) => {
  test.setTimeout(600_000);
  const st = await account(browser, 'Teller');
  const lr = await st.page.request.post('/api/lobbies', { data: { name: 'Social', maxPlayers: 15, takeStoryteller: true } });
  expect(lr.status(), await lr.text()).toBeLessThan(300);
  const id = ((await lr.json()) as { lobby: { id: string } }).lobby.id;
  await st.page.goto(`/lobby/${id}`);
  const names = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme'];
  const ps: Acc[] = [];
  for (const n of names) {
    const p = await account(browser, n);
    await p.page.goto(`/lobby/${id}`);
    await expect(p.page.getByRole('button', { name: "I'm ready" })).toBeEnabled({ timeout: 30_000 });
    await p.page.getByRole('button', { name: "I'm ready" }).click();
    await expect(p.page.getByRole('button', { name: 'Not ready' })).toBeVisible({ timeout: 10_000 });
    ps.push(p);
  }
  const [ada, bram, cleo, dov, esme] = ps as [Acc, Acc, Acc, Acc, Acc];
  await expect(st.page.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 20_000 });
  await st.page.getByRole('button', { name: 'Start game' }).click();
  await st.page.waitForTimeout(2500);
  await inject(st.page, 'st:command', { type: 'random_setup' });
  await st.page.waitForTimeout(800);
  await inject(st.page, 'st:command', { type: 'force_phase', to: 'day' });
  await st.page.waitForTimeout(1500);
  const seat = (a: Acc): number => a.tap.last('game:view')?.you?.seat;
  await ada.tap.until(() => seat(ada) !== undefined, 15_000, 'seat');
  await inject(st.page, 'st:command', { type: 'teleport', who: 'all', to: { kind: 'square' } });
  await st.page.waitForTimeout(1000);
  // spread everyone around the voting circle, then let them stand there; Cleo goes home
  await inject(st.page, 'st:command', { type: 'teleport', who: 'all', to: { kind: 'seat' } });
  await st.page.waitForTimeout(1500);
  await inject(st.page, 'st:command', { type: 'teleport', who: [seat(cleo)], to: { kind: 'home' } });
  await st.page.waitForTimeout(3000);

  const pid = Object.fromEntries(ps.map((p) => [p.name, youPid(p)])) as Record<string, string>;
  const where = (a: Acc, who: string) => ents(a).find((e) => e.id === pid[who]);
  await ada.tap.until(() => where(ada, 'Bram') && where(ada, 'Dov'), 15_000, 'Ada sees Bram and Dov');
  expect(where(cleo, 'Cleo')!.location).not.toBe('outdoors');

  // --- 1. right-click Bram: point
  const t1 = Date.now();
  const b = where(ada, 'Bram')!;
  const bs = await toScreen(ada, { x: b.x, y: b.y - 14 });
  await hold(ada.page, true);
  await hold(bram.page, true);
  await ada.page.mouse.click(bs.x, bs.y, { button: 'right' });
  const handOf = async (page: Page, who: string) => {
    const e = (await drawn(page)).emotes.find((x) => x.pid === who);
    return !!e && e.hand && e.alpha >= 0.95;
  };
  await expect.poll(() => handOf(ada.page, pid.Ada), { timeout: 3000, intervals: [50] }).toBe(true);
  await ada.page.screenshot({ path: path.join(OUT, 'v2-social-point-desktop.png') });
  const sentPoint = await ada.tap.until(() => ada.tap.sent('social:emote', t1)[0], 5000, 'Ada sent a point');
  expect(sentPoint).toMatchObject({ kind: 'point', pid: pid.Bram });
  const seen = await bram.tap.until(() => bram.tap.received('social:emote', t1).find((e) => e.pid === pid.Ada), 5000, 'Bram sees Ada point');
  expect(seen.target).toBe(pid.Bram);
  expect((await drawn(bram.page)).seen.some((k) => k.startsWith(`${pid.Ada}@`)), `Bram's screen drew Ada's hand (errors: ${errors.join(' | ')})`).toBe(true);
  // Q points at whatever is under the cursor: Ada points at Bram again; Bram's view right away
  await ada.page.mouse.move(bs.x, bs.y);
  await ada.page.keyboard.press('KeyQ');
  await bram.tap.until(() => bram.tap.received('social:emote', t1).filter((e) => e.pid === pid.Ada).length >= 2, 5000, 'second point (Q)');
  await expect.poll(() => handOf(bram.page, pid.Ada), { timeout: 3000, intervals: [50] }).toBe(true);
  await bram.page.screenshot({ path: path.join(OUT, 'v2-social-point-seen-by-target.png') });
  await hold(ada.page, false);
  await hold(bram.page, false);
  expect(cleo.tap.received('social:emote', t1).length, 'Cleo (inside) learns nothing').toBe(0);

  // --- 2. pins: F on a spot (gold), dock -> crimson, F on Bram, teal + middle-click on Dov, violet + shift+click on a spot
  const me = where(ada, 'Ada')!;
  const spot1 = { x: me.x - 40, y: me.y + 30 };
  let s = await toScreen(ada, spot1);
  await ada.page.mouse.move(s.x, s.y);
  await ada.page.keyboard.press('KeyF');
  await ada.tap.until(() => pinsOf(ada).length === 1, 5000, 'first pin');
  expect(pinsOf(ada)[0]).toMatchObject({ by: pid.Ada, color: 'gold', target: { kind: 'place' } });

  await ada.page.getByRole('button', { name: 'Point and pins' }).click();
  await ada.page.getByRole('radio', { name: 'Crimson' }).click();
  await shot(ada.page, 'dock-desktop');
  s = await toScreen(ada, { x: b.x, y: b.y - 14 });
  await ada.page.mouse.move(s.x, s.y);
  await ada.page.keyboard.press('KeyF');
  await ada.page.getByRole('radio', { name: 'Teal' }).click();
  const d = where(ada, 'Dov')!;
  s = await toScreen(ada, { x: d.x, y: d.y - 14 });
  await ada.page.mouse.click(s.x, s.y, { button: 'middle' });
  await ada.page.getByRole('radio', { name: 'Violet' }).click();
  const spot2 = { x: me.x + 50, y: me.y - 46 };
  s = await toScreen(ada, spot2);
  await ada.page.keyboard.down('Shift');
  await ada.page.mouse.click(s.x, s.y);
  await ada.page.keyboard.up('Shift');
  await ada.page.getByRole('button', { name: 'Close point and pins' }).click();
  await ada.tap.until(() => pinsOf(ada).length === 4, 5000, 'four pins');
  const colours = pinsOf(ada).map((p) => `${p.color}:${p.target.kind}:${p.target.pid ?? ''}`).sort();
  expect(colours).toEqual(['crimson:person:' + pid.Bram, 'gold:place:', 'teal:person:' + pid.Dov, 'violet:place:'].sort());
  // Bram pins Dov too (green, keyboard): a fan of two on Dov
  await bram.page.getByRole('button', { name: 'Point and pins' }).click();
  await bram.page.getByRole('radio', { name: 'Green' }).click();
  await bram.page.getByRole('button', { name: 'Close point and pins' }).click();
  s = await toScreen(bram, { x: d.x, y: d.y - 14 });
  await bram.page.mouse.move(s.x, s.y);
  await bram.page.keyboard.press('KeyF');
  await bram.tap.until(() => pinsOf(bram).length === 5, 5000, 'Bram sees five pins');
  await ada.tap.until(() => pinsOf(ada).length === 5, 5000, 'Ada sees five pins');
  await expect.poll(async () => (await drawn(bram.page)).pins.filter((p) => p.visible).length, { timeout: 3000 }).toBe(5);
  await ada.page.mouse.move(10, 10);
  await shot(ada.page, 'pins-desktop');
  await shot(bram.page, 'pins-other-view');
  // hover a pin: tooltip
  const gold = pinsOf(ada).find((p) => p.color === 'gold')!;
  const gs = await toScreen(ada, { x: gold.target.x, y: gold.target.y });
  await ada.page.mouse.move(gs.x, gs.y - 26);
  await expect(ada.page.getByRole('tooltip')).toContainText('Your pin', { timeout: 3000 });
  await shot(ada.page, 'tooltip-remove');
  await bram.page.mouse.move((await toScreen(bram, gold.target)).x, (await toScreen(bram, gold.target)).y - 26);
  await expect(bram.page.getByRole('tooltip')).toContainText('Ada’s pin', { timeout: 3000 });

  // --- 3. Cleo, inside her cottage, sees none of it
  await cleo.page.waitForTimeout(500);
  const outdoorIds = new Set(pinsOf(ada).map((p) => p.id));
  for (const snap of cleo.tap.received('world:snapshot', t1)) for (const p of snap.pins ?? []) expect(outdoorIds.has(p.id), 'outdoor pin leaked indoors').toBe(false);
  await shot(cleo.page, 'inside-none');

  // --- 4. Ada clicks her gold pin: removed
  const t4 = Date.now();
  await ada.page.mouse.click(gs.x, gs.y - 26);
  const unpin = await ada.tap.until(() => ada.tap.sent('social:unpin', t4)[0], 5000, 'unpin sent');
  expect(unpin.id).toBe(gold.id);
  await bram.tap.until(() => !pinsOf(bram).some((p) => p.id === gold.id), 5000, 'gone for Bram');

  // --- 5. phone (Esme): long-press radial
  await esme.page.close();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await installSocketTap(phone);
  await phone.addCookies(await esme.ctx.cookies());
  await phone.addInitScript(noHints);
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  const phoneAcc: Acc = { name: 'Esme-phone', ctx: phone, page: pp, tap: new FrameTap('Esme-phone', pp), pid: pid.Esme! };
  await pp.goto(`/lobby/${id}`);
  await phoneAcc.tap.until(() => where(phoneAcc, 'Ada'), 20_000, 'phone sees Ada');
  await pp.waitForTimeout(2500);
  const cdp = await phone.newCDPSession(pp);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y) }] });
  // long-press on Ada, lift, then tap "Point"
  const a2 = where(phoneAcc, 'Ada')!;
  let ps2 = await toScreen(phoneAcc, { x: a2.x, y: a2.y - 14 });
  const t5 = Date.now();
  await touch('touchStart', ps2.x, ps2.y);
  await pp.waitForTimeout(520);
  await expect(pp.locator('[data-social-act="point"]')).toBeVisible();
  await shot(pp, 'radial-phone');
  await touch('touchEnd', ps2.x, ps2.y);
  await hold(pp, true);
  await pp.locator('[data-social-act="point"]').tap();
  await expect.poll(() => handOf(pp, pid.Esme!), { timeout: 3000, intervals: [50] }).toBe(true);
  await pp.screenshot({ path: path.join(OUT, 'v2-social-point-phone.png') });
  await hold(pp, false);
  const phonePoint = await phoneAcc.tap.until(() => phoneAcc.tap.sent('social:emote', t5)[0], 5000, 'phone point');
  expect(phonePoint.pid).toBe(pid.Ada);
  await ada.tap.until(() => ada.tap.received('social:emote', t5).find((e) => e.pid === pid.Esme), 5000, 'Ada sees Esme point');
  // long-press a spot and slide onto "Pin"
  const e2 = where(phoneAcc, 'Esme')!;
  ps2 = await toScreen(phoneAcc, { x: e2.x + 30, y: e2.y + 40 });
  await touch('touchStart', ps2.x, ps2.y);
  await pp.waitForTimeout(500);
  const pinBtn = await pp.locator('[data-social-act="pin"]').boundingBox();
  expect(pinBtn).not.toBeNull();
  await touch('touchMove', ps2.x + 6, ps2.y - 10);
  await touch('touchMove', pinBtn!.x + pinBtn!.width / 2, pinBtn!.y + pinBtn!.height / 2);
  await pp.waitForTimeout(80);
  await touch('touchEnd', pinBtn!.x + pinBtn!.width / 2, pinBtn!.y + pinBtn!.height / 2);
  await phoneAcc.tap.until(() => phoneAcc.tap.sent('social:pin', t5)[0], 5000, 'phone pin');
  await phoneAcc.tap.until(() => pinsOf(phoneAcc).some((p) => p.by === pid.Esme), 5000, 'phone pin arrives');
  await expect(pp.locator('.cts-radial')).toHaveCount(0);
  // a short tap still walks
  const t6 = Date.now();
  const walkTo = await toScreen(phoneAcc, { x: e2.x - 40, y: e2.y + 10 });
  await pp.touchscreen.tap(walkTo.x, walkTo.y);
  await phoneAcc.tap.until(() => phoneAcc.tap.sent('move', t6).some((m) => m.moving), 5000, 'a tap still walks');
  await pp.waitForTimeout(1500);
  await shot(pp, 'pins-phone');
  await pp.locator('.cts-toggle').tap();
  await shot(pp, 'dock-phone');
  await pp.locator('.cts-toggle').tap();

  // --- 6. the Storyteller clears everything
  await st.page.getByRole('button', { name: 'Point and pins' }).click();
  await shot(st.page, 'dock-storyteller');
  const t7 = Date.now();
  await st.page.getByRole('button', { name: 'Clear all' }).click();
  await st.tap.until(() => st.tap.sent('social:clearPins', t7)[0]?.scope === 'all', 5000, 'clear all sent');
  await ada.tap.until(() => pinsOf(ada).length === 0, 5000, 'all pins cleared');
  await phone.close();
  expect(errors, errors.join('\n')).toEqual([]);
});

// Quick phone-only check (waiting room, no game): long-press radial, slide-to-pin, tap-to-point, a short tap walks.
test('v2 social: phone long-press (quick)', async ({ browser }) => {
  test.setTimeout(240_000);
  const st = await account(browser, 'Teller2');
  const lr = await st.page.request.post('/api/lobbies', { data: { name: 'Social phone', maxPlayers: 15, takeStoryteller: true } });
  const id = ((await lr.json()) as { lobby: { id: string } }).lobby.id;
  await st.page.goto(`/lobby/${id}`);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, extraHTTPHeaders: { 'X-Forwarded-For': `10.90.${process.pid % 200}.${++ipNo}` } });
  await installSocketTap(phone);
  await phone.addInitScript(noHints);
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  const acc: Acc = { name: 'Pia', ctx: phone, page: pp, tap: new FrameTap('Pia', pp), pid: '' };
  await pp.goto('/');
  expect((await pp.request.post('/api/auth/create', { data: { displayName: 'Pia' } })).status()).toBeLessThan(300);
  await pp.goto(`/lobby/${id}`);
  await acc.tap.until(() => ents(acc).find((e) => e.id === youPid(acc)), 30_000, 'phone in town');
  await pp.waitForTimeout(2500);
  const cdp = await phone.newCDPSession(pp);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y) }] });
  const me = ents(acc).find((e) => e.id === youPid(acc))!;
  const t0 = Date.now();
  let p = await toScreen(acc, { x: me.x + 30, y: me.y + 30 });
  await touch('touchStart', p.x, p.y);
  await pp.waitForTimeout(600);
  await expect(pp.locator('[data-social-act="point"]')).toBeVisible();
  await touch('touchEnd', p.x, p.y);
  await pp.waitForTimeout(400);
  const dbg = await pp.evaluate(() => (window as any).__ctSocial?.seen());
  expect(await pp.locator('[data-social-act="point"]').count(), `radial stays open after lifting (log: ${JSON.stringify(dbg)})`).toBe(1);
  await pp.locator('[data-social-act="point"]').tap();
  await acc.tap.until(() => acc.tap.sent('social:emote', t0)[0], 5000, 'phone point');
  // slide to pin
  p = await toScreen(acc, { x: me.x - 30, y: me.y + 40 });
  await touch('touchStart', p.x, p.y);
  await pp.waitForTimeout(600);
  const b = (await pp.locator('[data-social-act="pin"]').boundingBox())!;
  await touch('touchMove', p.x + 4, p.y - 8);
  await touch('touchMove', b.x + b.width / 2, b.y + b.height / 2);
  await pp.waitForTimeout(60);
  await touch('touchEnd', b.x + b.width / 2, b.y + b.height / 2);
  await acc.tap.until(() => acc.tap.sent('social:pin', t0)[0], 5000, 'phone pin');
  await acc.tap.until(() => pinsOf(acc).length === 1, 5000, 'pin arrives');
  await pp.waitForTimeout(600);
  await shot(pp, 'quick-phone-pin');
  // a short tap still walks
  const t1 = Date.now();
  p = await toScreen(acc, { x: me.x + 40, y: me.y - 20 });
  await pp.touchscreen.tap(p.x, p.y);
  await acc.tap.until(() => acc.tap.sent('move', t1).some((m) => m.moving), 5000, 'a tap still walks');
  // tap my pin: removed
  await pp.waitForTimeout(2500);
  const pin = pinsOf(acc)[0];
  const ps = await toScreen(acc, { x: pin.target.x, y: pin.target.y });
  const t2 = Date.now();
  await pp.touchscreen.tap(ps.x, ps.y - 10);
  await acc.tap.until(() => acc.tap.sent('social:unpin', t2)[0], 5000, 'tap own pin removes it');
  await phone.close();
  expect(errors, errors.join('\n')).toEqual([]);
});
