// Notebook real-browser check (notebook agent). Runs ON hshi-u1 from the notebook sandbox against a
// throwaway server on 127.0.0.1:$PORT. ONE Chromium: Ada (desktop 1440x900) and Bram (phone
// 390x844, touch, reduced motion) are real browsers; the Storyteller + 3 fillers are colyseus.js
// clients. Screenshots -> $OUT/v2-notebook-*.png
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { Client } from 'colyseus.js';
import { unpack } from '@colyseus/msgpackr';

const PORT = Number(process.env.PORT ?? 3356);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT ?? path.resolve('test-results/notebook');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[nb]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 0;
const xff = () => `10.91.${process.pid % 200}.${++ip}`;
const fails = [];
const check = (ok, what) => {
  log(ok ? 'PASS' : 'FAIL', what);
  if (!ok) fails.push(what);
};
async function until(fn, ms, what) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await sleep(100);
  }
}

// ------------------------------------------------------------------ node clients (ST + fillers)
async function apiAccount(name) {
  const r = await fetch(`${BASE}/api/auth/create`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': xff() }, body: JSON.stringify({ displayName: name }) });
  if (r.status !== 201) throw new Error(`create ${name}: ${r.status} ${await r.text()}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { name, cookie };
}
async function nodeJoin(acc, lobbyId, intent) {
  const t = await fetch(`${BASE}/api/lobbies/${lobbyId}/ticket`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: acc.cookie }, body: JSON.stringify({ intent }) });
  const tk = await t.json();
  const room = await new Client(`ws://127.0.0.1:${PORT}`).joinById(tk.roomId, { ticket: tk.ticket });
  const msgs = [];
  room.onMessage('*', (type, payload) => msgs.push({ type: String(type), payload }));
  return { ...acc, room, msgs, last: (type) => msgs.filter((m) => m.type === type).at(-1)?.payload };
}

// ------------------------------------------------------------------ browsers
const ROOM_DATA = 13;
function decode(buf) {
  if (buf.length < 2 || buf[0] !== ROOM_DATA) return null;
  let off = 1;
  const p = buf[off];
  let len = null;
  if (p > 0xa0 && p < 0xc0) (len = p & 0x1f), (off += 1);
  else if (p === 0xd9) (len = buf[off + 1]), (off += 2);
  if (len === null) return null;
  const type = buf.subarray(off, off + len).toString('utf8');
  off += len;
  return { type, payload: off < buf.length ? unpack(buf.subarray(off)) : undefined };
}

async function browserPlayer(browser, name, opts) {
  const ctx = await browser.newContext({ ...opts, extraHTTPHeaders: { 'X-Forwarded-For': xff() } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('ct.hint.move.v1', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  return wire({ name, ctx, page });
}
function wire(p) {
  p.frames = [];
  p.raw = [];
  p.page.on('dialog', (d) => void d.accept());
  p.page.on('pageerror', (e) => log(`${p.name} pageerror`, e.message));
  p.page.on('websocket', (ws) => {
    ws.on('framereceived', (d) => {
      if (typeof d.payload === 'string') return;
      p.raw.push(Buffer.from(d.payload));
      try {
        const f = decode(Buffer.from(d.payload));
        if (f) p.frames.push({ dir: 'in', ...f, at: Date.now() });
      } catch {}
    });
    ws.on('framesent', (d) => {
      if (typeof d.payload === 'string') return;
      try {
        const f = decode(Buffer.from(d.payload));
        if (f) p.frames.push({ dir: 'out', ...f, at: Date.now() });
      } catch {}
    });
  });
  p.last = (type) => p.frames.filter((f) => f.dir === 'in' && f.type === type).at(-1)?.payload;
  p.sent = (type) => p.frames.filter((f) => f.dir === 'out' && f.type === type).map((f) => f.payload);
  p.rawHas = (s) => p.raw.some((b) => b.includes(Buffer.from(s, 'utf8')));
  return p;
}

async function shot(p, name) {
  await p.page.waitForTimeout(400);
  const file = path.join(OUT, `v2-notebook-${name}.png`);
  await p.page.screenshot({ path: file });
  log('screenshot', file);
}

const book = (p) => p.page.locator('.ctn-book');
const drawer = (p) => p.page.locator('#ctn-drawer');
const status = (p) => p.page.locator('.ctn-status');
const row = (p, name) => p.page.locator('.ctn-seat', { hasText: name });

async function waitGame(p) {
  await p.page.waitForSelector('.ctn-book', { timeout: 90_000 });
}
async function waitSaved(p) {
  await until(async () => (await status(p).textContent())?.includes('Saved'), 15_000, `${p.name} saved`);
}
const myEntity = (p) => {
  const pid = p.last('lobby:view')?.youPid;
  return p.last('world:snapshot')?.entities?.find((e) => e.id === pid);
};

const browser = await chromium.launch({ args: ['--disable-gpu', '--mute-audio'] });
const nodeClients = [];
try {
  const stAcc = await apiAccount('Storyteller Sol');
  const lr = await fetch(`${BASE}/api/lobbies`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: stAcc.cookie }, body: JSON.stringify({ name: 'Notebook check', maxPlayers: 10, takeStoryteller: true }) });
  const lobbyId = (await lr.json()).lobby.id;
  const st = await nodeJoin(stAcc, lobbyId, 'storyteller');
  nodeClients.push(st);
  log('lobby', lobbyId);

  const ada = await browserPlayer(browser, 'Ada', { viewport: { width: 1440, height: 900 } });
  const bram = await browserPlayer(browser, 'Bram', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  for (const p of [ada, bram]) {
    await p.page.goto(`${BASE}/`);
    const r = await p.page.request.post(`${BASE}/api/auth/create`, { data: { displayName: p.name } });
    if (r.status() !== 201) throw new Error(`browser create ${p.name} ${r.status()}`);
    await p.page.goto(`${BASE}/lobby/${lobbyId}`);
    const ready = p.page.getByRole('button', { name: "I'm ready" });
    await ready.waitFor({ timeout: 60_000 });
    await until(async () => await ready.isEnabled(), 30_000, `${p.name} ready enabled`);
    await ready.click();
  }
  for (const n of ['Fen', 'Gil', 'Hal']) {
    const f = await nodeJoin(await apiAccount(n), lobbyId, 'player');
    nodeClients.push(f);
    await until(() => f.last('lobby:view'), 10_000, `${n} lobby view`);
    f.room.send('lobby:ready', { ready: true });
  }
  await until(() => st.last('lobby:view')?.canStart, 30_000, 'canStart');
  st.room.send('lobby:start', {});
  await until(() => st.last('game:view')?.phase === 'setup', 15_000, 'setup');
  st.room.send('st:command', { type: 'random_setup' });
  await until(() => st.last('game:view')?.charactersAssigned, 15_000, 'assigned');
  st.room.send('st:command', { type: 'force_phase', to: 'day' });
  await until(() => st.last('game:view')?.phase === 'day', 15_000, 'day');
  const matchId = st.last('notebook:data')?.matchId;
  check(!!matchId && st.last('notebook:data').rev === 0, 'Storyteller got a fresh notebook at game start');

  // ---------------------------------------------------------------- Ada (desktop)
  await waitGame(ada);
  await ada.page.waitForTimeout(2500);
  await shot(ada, 'desktop-closed');
  const before = myEntity(ada);
  // N opens it (not while typing)
  await ada.page.keyboard.press('KeyN');
  await drawer(ada).waitFor({ timeout: 5000 });
  check(await drawer(ada).isVisible(), 'N opens the notebook (desktop)');
  const players = st.last('game:view').players;
  const other = players.find((p) => p.name === 'Bram') ?? players[1];
  const fen = players.find((p) => p.name === 'Fen');
  await row(ada, other.name).locator('.ctn-note').fill('ADA-SECRET claims Empath, said 1');
  await row(ada, other.name).getByRole('button', { name: 'Unsure' }).click();
  await row(ada, other.name).locator('select').selectOption('empath');
  await row(ada, fen.name).locator('.ctn-note').fill('ADA-SECRET quiet, voted twice');
  await row(ada, fen.name).getByRole('button', { name: 'Suspect' }).click();
  await row(ada, fen.name).locator('select').selectOption('imp');
  await row(ada, 'Gil').getByRole('button', { name: 'Trust' }).click();
  await ada.page.locator('.ctn-text').fill('ADA-SECRET Day 1: Fen pushed hard on Hal. Bram & Gil confirm each other.\nTheory: Fen = Imp, Hal = Poisoner?');
  await waitSaved(ada);
  check(true, 'desktop autosave shows Saved');
  await shot(ada, 'desktop');
  // Escape closes, focus back to the town
  await ada.page.keyboard.press('Escape');
  await drawer(ada).waitFor({ state: 'detached', timeout: 3000 });
  check(true, 'Escape closes the notebook');
  // Movement keys work while it is closed (not stolen)
  const p0 = myEntity(ada);
  await ada.page.keyboard.down('KeyD');
  await ada.page.waitForTimeout(700);
  await ada.page.keyboard.up('KeyD');
  await ada.page.waitForTimeout(500);
  const p1 = myEntity(ada);
  check(p0 && p1 && Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) > 10, `walking keys work while closed (${p0?.x},${p0?.y} -> ${p1?.x},${p1?.y})`);
  // Typing in a note does not walk
  await book(ada).click();
  await drawer(ada).waitFor();
  const q0 = myEntity(ada);
  await row(ada, 'Hal').locator('.ctn-note').click();
  await ada.page.keyboard.type('wasd dddd');
  await ada.page.waitForTimeout(800);
  const q1 = myEntity(ada);
  check(q0 && q1 && Math.abs(q1.x - q0.x) + Math.abs(q1.y - q0.y) < 2, 'typing WASD in a note does not move the character');
  check((await row(ada, 'Hal').locator('.ctn-note').inputValue()) === 'wasd dddd', 'N inside a note is just a letter');
  await row(ada, 'Hal').locator('.ctn-note').fill('');
  await waitSaved(ada);
  // Chat box: N must not toggle
  await ada.page.keyboard.press('Escape');
  await drawer(ada).waitFor({ state: 'detached' });
  log('before walking', JSON.stringify(before));

  // refresh -> restored
  await ada.page.reload();
  await waitGame(ada);
  await book(ada).click();
  await drawer(ada).waitFor();
  await until(async () => (await ada.page.locator('.ctn-text').inputValue()).includes('Theory: Fen = Imp'), 15_000, 'ada restored');
  check((await row(ada, fen.name).locator('.ctn-note').inputValue()) === 'ADA-SECRET quiet, voted twice', 'desktop refresh restores seat notes');
  check((await row(ada, fen.name).locator('select').inputValue()) === 'imp', 'desktop refresh restores role guesses');
  check((await row(ada, fen.name).getByRole('button', { name: 'Suspect' }).getAttribute('aria-pressed')) === 'true', 'desktop refresh restores trust markers');
  await shot(ada, 'desktop-restored');

  // ---------------------------------------------------------------- Bram (phone)
  await waitGame(bram);
  await bram.page.waitForTimeout(2000);
  await shot(bram, 'phone-closed');
  await book(bram).tap();
  await drawer(bram).waitFor();
  const anim = await drawer(bram).evaluate((el) => getComputedStyle(el).animationName);
  check(anim === 'none', `reduced motion: no drawer animation (${anim})`);
  const box = await drawer(bram).boundingBox();
  check(box && box.x >= 0 && box.x + box.width <= 390.5 && box.y + box.height <= 844.5 && box.y > 100, `phone bottom sheet fits the screen ${JSON.stringify(box)}`);
  const bramText = await drawer(bram).innerText();
  check(!bramText.includes('ADA-SECRET'), "Bram's notebook does not show Ada's notes");
  await shot(bram, 'phone-empty');
  await row(bram, 'Ada').locator('.ctn-note').fill('BRAM-SECRET says Chef, 0 pairs');
  await row(bram, 'Ada').getByRole('button', { name: 'Trust' }).tap();
  await row(bram, 'Ada').locator('select').selectOption('chef');
  await bram.page.locator('.ctn-text').fill('BRAM-SECRET I am the Empath: 1 evil neighbour.');
  await bram.page.locator('.ctn-text').blur();
  await waitSaved(bram);
  await bram.page.locator('.ctn-body').evaluate((el) => (el.scrollTop = 0));
  await shot(bram, 'phone');
  await bram.page.reload();
  await waitGame(bram);
  await book(bram).tap();
  await drawer(bram).waitFor();
  await until(async () => (await bram.page.locator('.ctn-text').inputValue()).includes('BRAM-SECRET I am the Empath'), 15_000, 'bram restored');
  check((await row(bram, 'Ada').locator('.ctn-note').inputValue()) === 'BRAM-SECRET says Chef, 0 pairs', 'phone refresh restores notes');
  await shot(bram, 'phone-restored');
  await row(bram, 'Ada').locator('.ctn-note').focus();
  await bram.page.waitForTimeout(300);
  await shot(bram, 'phone-typing');

  // ---------------------------------------------------------------- Ada switches to a second device (phone)
  const state = await ada.ctx.storageState();
  const adaPhoneCtx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, extraHTTPHeaders: { 'X-Forwarded-For': xff() } });
  const adaPhone = wire({ name: 'Ada-phone', ctx: adaPhoneCtx, page: await adaPhoneCtx.newPage() });
  await adaPhone.page.goto(`${BASE}/lobby/${lobbyId}`);
  await waitGame(adaPhone);
  await book(adaPhone).tap();
  await drawer(adaPhone).waitFor();
  await until(async () => (await adaPhone.page.locator('.ctn-text').inputValue()).includes('Theory: Fen = Imp'), 15_000, 'ada phone restored');
  check(true, 'device switch: the second device gets the same notebook');
  await shot(adaPhone, 'device-switch');
  await adaPhoneCtx.close();

  // ---------------------------------------------------------------- privacy over the wire
  await sleep(500);
  check(!bram.rawHas('ADA-SECRET'), "no frame Bram received contains Ada's notes");
  check(!ada.rawHas('BRAM-SECRET'), "no frame Ada received contains Bram's notes");
  for (const c of nodeClients) {
    const dump = JSON.stringify(c.msgs);
    check(!dump.includes('ADA-SECRET') && !dump.includes('BRAM-SECRET'), `${c.name} (node client) never received any notebook content`);
  }
  check(bram.frames.filter((f) => f.dir === 'in' && f.type === 'notebook:data').every((f) => !JSON.stringify(f.payload).includes('ADA')), 'every notebook:data Bram got is his own');
  const saves = ada.sent('notebook:save');
  check(saves.length > 0 && saves.every((s) => s.matchId === matchId), `Ada autosaved ${saves.length}x (debounced) for the current match`);
} catch (e) {
  fails.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  for (const c of nodeClients) await c.room.leave(true).catch(() => undefined);
  await browser.close();
}
log(fails.length ? `FAILED: ${fails.length}` : 'ALL PASSED');
for (const f of fails) log('  -', f);
process.exit(fails.length ? 1 : 0);
