// UI owner's headless check (runs on render-host via tools/remote.sh). Drives the control panel of demo.html in REAL TIME
// with real mouse clicks / keys and checks that every control lands in the shared store (window.__demo.state()).
//   node tools/demo-ui.mjs [--out shots/demo-ui] [--size 1280x720] [--q "tod=noon"] [--only a,b]
// Writes <out>/<step>.png per step. Exit 1 on any console error / pageerror / __demo.errors / failed expectation.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'shots/demo-ui');
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const bad = [], fails = [];
page.on('console', (m) => { if (m.type() === 'error') bad.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => bad.push(`[pageerror] ${e.stack || e.message}`));
await page.route('http://pixel3d.local/**', (route) => {
  const u = new URL(route.request().url());
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});

const state = () => page.evaluate(() => window.__demo.state());
const info = () => page.evaluate(() => window.__demo.info?.() ?? null);
const expect = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) fails.push(name); };
const shot = async (name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); console.log('wrote', f); };
const openSec = (id) => page.evaluate((id) => { const d = document.querySelector(`.dui-sec[data-sec="${id}"]`); d.open = true; d.scrollIntoView({ block: 'start' }); }, id);
const closeSec = (id) => page.evaluate((id) => { document.querySelector(`.dui-sec[data-sec="${id}"]`).open = false; }, id);
const btnIn = (sec, text) => page.locator(`.dui-sec[data-sec="${sec}"] button`, { hasText: new RegExp(`^\\s*${text}\\s*$`) }).first();
const step = (name) => !ONLY || ONLY.has(name);

try {
  const t0 = Date.now();
  // fresh profile per run: no remembered panel prefs
  await page.goto(`http://pixel3d.local/demo.html${opt('q', '') ? '?' + opt('q', '') : ''}`);
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors.length), null, { timeout: 120000 });
  console.log('ready after', Date.now() - t0, 'ms');
  await page.waitForTimeout(2500);
  expect('panel mounted', await page.locator('.dui-panel').isVisible());
  await shot('01-panel');

  if (opt('probe', '')) {
    const r = await page.evaluate((id) => {
      const d = window.__demo.demo, L = d.layout, rec = L.houses.find((h) => h.id === id);
      const anchors = d.town.registry.anchors('doors').filter((a) => a.piece === id).map((a) => ({ point: a.point, normal: a.normal, hasPivot: !!a.pivot }));
      const tiles = [];
      for (let z = Math.floor(rec.doorPoint.z) - 3; z <= Math.floor(rec.doorPoint.z) + 3; z++) {
        let row = `${z}: `;
        for (let x = Math.floor(rec.doorPoint.x) - 4; x <= Math.floor(rec.doorPoint.x) + 4; x++) row += L.blocked(x, z) ? '#' : '.';
        tiles.push(row);
      }
      return { rec: { doorPoint: rec.doorPoint, doorNormal: rec.doorNormal, fp: rec.footprint }, anchors, spot: d.ui.travelSpot(id), x0: Math.floor(rec.doorPoint.x) - 4, tiles };
    }, opt('probe', ''));
    console.log(JSON.stringify(r, null, 1));
  }

  if (step('character')) {
    const chars = await page.locator('.dui-char').allTextContents();
    console.log('roster:', chars.join(' | '));
    const target = await page.evaluate(() => [...document.querySelectorAll('.dui-char')].map((b) => b.dataset.id).find((id) => id !== window.__demo.state().character));
    await page.locator(`.dui-char[data-id="${target}"]`).click();
    await page.waitForFunction((id) => window.__demo.info?.().character === id, target, { timeout: 15000 }).catch(() => {});
    const i = await info();
    expect('character switch via roster', i?.character === target && i?.state.character === target, `${target} -> ${i?.character}`);
    await page.waitForTimeout(800);
    await shot('02-character');
  }

  if (step('time')) {
    await btnIn('time', 'golden').click();
    await page.waitForTimeout(400);
    let s = await state();
    expect('preset golden', Math.abs(s.timeOfDay - 18.5) < 0.05, String(s.timeOfDay));
    // drag the slider to ~6 h (a quarter of its width)
    const box = await page.locator('.dui-range input').boundingBox();
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.waitForTimeout(300);
    s = await state();
    expect('slider click ~6h', Math.abs(s.timeOfDay - 6) < 0.6, s.timeOfDay.toFixed(2));
    await btnIn('time', '60\u00D7').click();
    s = await state();
    expect('speed 60', s.timeSpeed === 60 && !s.paused);
    await page.locator('.dui-sec[data-sec="time"] .dui-row .dui-btn.icon').first().click();
    s = await state();
    expect('pause button', s.paused === true);
    const clock = await page.locator('.dui-clock-big').textContent();
    expect('clock readout', /^\d\d:\d\d$/.test(clock), clock);
    // keyboard focus must not stay in the slider: W walks after a slider click
    const p0 = (await info()).player;
    await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
    const p1 = (await info()).player;
    expect('walk after slider (no focus trap)', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.2, `${p0} -> ${p1}`);
    await btnIn('time', 'night').click();
    await page.waitForTimeout(1500);
    await shot('03-time-night');
    await btnIn('time', 'noon').click();
    await page.locator('.dui-sec[data-sec="time"] .dui-row .dui-btn.icon').first().click();   // run again
    await btnIn('time', '1\u00D7').click();
  }

  if (step('town')) {
    await closeSec('character');
    await openSec('town');
    await page.waitForTimeout(200);
    await btnIn('town', 'play ceremony').click();
    const hasCer = await page.evaluate(() => !!window.__demo.demo.time?.playCeremony);
    let s;
    if (hasCer) {
      expect('ceremony running (time.ceremony)', await page.evaluate(() => !!window.__demo.demo.time.ceremony));
      await page.waitForFunction(() => window.__demo.state().phase === 'vote', null, { timeout: 40000 }).catch(() => {});
      s = await state();
      expect('ceremony reaches the vote', s.phase === 'vote' && s.nominee !== null && s.seats.filter((x) => x.occupied).length >= 5, `${s.phase} #${s.nominee} cam ${s.camera}`);
      await page.waitForTimeout(1500);
      await shot('04a-ceremony-vote');
      await page.waitForTimeout(400);
      const label = await page.locator('.dui-sec[data-sec="town"] .dui-btns button').first().textContent();
      expect('button shows stop while running', label.trim() === 'stop ceremony', label);
      await page.locator('.dui-sec[data-sec="town"] .dui-btns button').first().click();
      expect('ceremony stopped', !(await page.evaluate(() => !!window.__demo.demo.time.ceremony)));
      await btnIn('render', 'follow').click().catch(() => {});
      await page.evaluate(() => window.__demo.set({ camera: 'follow' }));
    } else {
      s = await state();
      expect('ceremony: nomination + nominee + seats', s.phase === 'nomination' && s.nominee !== null && s.seats.filter((x) => x.occupied).length >= 5, `${s.phase} #${s.nominee}`);
      await page.waitForTimeout(3400);
      s = await state();
      expect('ceremony: vote after 3 s', s.phase === 'vote', s.phase);
    }
    // seat 12: dead toggle (implies occupied), ghost vote off - from a cleared circle filled with 10
    await btnIn('town', 'clear').click();
    await btnIn('town', '10').click();
    s = await state();
    expect('clear + fill 10', s.seats.filter((x) => x.occupied).length === 10 && !s.seats.some((x) => x.dead), String(s.seats.filter((x) => x.occupied).length));
    await page.locator('.dui-cell.k-dead').nth(11).click();
    await page.locator('.dui-cell.k-ghostVote').nth(11).click();
    s = await state();
    expect('seat 12 dead, seated, ghost vote spent', s.seats[11].dead && s.seats[11].occupied && !s.seats[11].ghostVote, JSON.stringify(s.seats[11]));
    await page.locator('.dui-cell.k-nominee').nth(2).click();
    s = await state();
    expect('nominee seat 3', s.nominee === 2);
    await btnIn('town', 'execute').click();
    s = await state();
    expect('phase execute', s.phase === 'execution');
    await btnIn('town', 'ring bell').click();
    await page.waitForTimeout(500);
    await shot('04-town');
    await btnIn('town', 'day').click();
  }

  if (step('render')) {
    await openSec('render');
    await btnIn('render', 'vote').click();
    let s = await state();
    expect('camera vote', s.camera === 'vote');
    await page.waitForTimeout(1200);
    await shot('05-camera-vote');
    await btnIn('render', 'follow').click();
    await btnIn('render', 'off').click();
    s = await state();
    expect('cut-away off', s.cutaway === 'off');
    await btnIn('render', 'auto').click();
    await page.locator('.dui-sec[data-sec="render"] button[title^="rotate left"]').click();
    await page.locator('.dui-sec[data-sec="render"] button[title^="zoom out"]').click();
    s = await state();
    expect('yaw 45 + zoom out', s.yaw === 45 && s.zoom > 12, `yaw ${s.yaw} zoom ${s.zoom}`);
    await page.locator('.dui-sec[data-sec="render"] button', { hasText: 'townsfolk about' }).click();
    s = await state();
    expect('life off', s.life === false);
    await page.waitForTimeout(1200);
    const perf = await page.locator('.dui-perf b').allTextContents();
    console.log('perf readout:', perf.join(' | '));
    expect('perf readout filled', perf.every((x) => x !== '-'), perf.join(','));
    await shot('06-render');
    await page.locator('.dui-sec[data-sec="render"] button', { hasText: 'town stands still' }).click();
    await page.locator('.dui-sec[data-sec="render"] button[title^="rotate right"]').click();
    await page.locator('.dui-sec[data-sec="render"] button[title^="zoom in"]').click();
  }

  if (step('travel')) {
    await closeSec('town');
    await openSec('travel');
    const res = [];
    for (let i = 0; i < 15; i++) {
      await page.locator('.dui-sec[data-sec="travel"] select').selectOption(`house-${i}`);
      await page.waitForTimeout(350);
      const it = await info();
      res.push(`${i}:${it.nearDoor ?? '-'}@${it.player[0]},${it.player[1]}`);
      expect(`travel house-${i} -> nearDoor`, it.nearDoor === `house-${i}`, `${it.nearDoor} @ ${it.player}`);
    }
    await page.locator('.dui-sec[data-sec="travel"] select').selectOption('house-3');
    await page.waitForTimeout(1200);
    await shot('07-travel-house3');
    await btnIn('travel', 'tower').click();
    await page.waitForTimeout(1200);
    let it = await info();
    console.log('clock tower ->', it.player, it.nearDoor);
    await shot('08-travel-tower');
    await btnIn('travel', 'dais').click();
    await page.waitForTimeout(1200);
    it = await info();
    console.log('dais ->', it.player);
    await shot('09-travel-dais');
    // walk mode: the player follows a path to the clock-tower door
    await btnIn('travel', 'walk').click();
    await btnIn('travel', 'tower').click();
    const tw = Date.now();
    await page.waitForFunction(() => window.__demo.info?.().nearDoor === 'clocktower', null, { timeout: 20000 }).catch(() => {});
    it = await info();
    expect('walk-travel reaches the clock tower', it.nearDoor === 'clocktower', `${it.player} after ${Date.now() - tw} ms`);
    await btnIn('travel', 'jump').click();
    await btnIn('travel', 'dais').click();
    await page.waitForTimeout(500);
    it = await info();
    // W must walk right after using the select
    const p0 = it.player;
    await page.keyboard.down('s'); await page.waitForTimeout(400); await page.keyboard.up('s');
    const p1 = (await info()).player;
    expect('walk after travel (no focus trap)', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.15, `${p0} -> ${p1}`);
  }

  if (step('keys')) {
    await page.keyboard.press('h');
    await page.waitForTimeout(300);
    expect('H opens help', await page.locator('.dui-help').isVisible());
    await shot('10-help');
    await page.keyboard.press('Escape');
    expect('Esc closes help', !(await page.locator('.dui-help').isVisible()));
    await page.keyboard.press('Backquote');
    await page.waitForTimeout(300);
    expect('` hides panel', !(await page.locator('.dui-panel').isVisible()) && (await state()).ui === false);
    await shot('11-hidden');
    await page.keyboard.press('Backquote');
    expect('` shows panel', await page.locator('.dui-panel').isVisible());
    await page.locator('.dui-head button[title="fold the panel"]').click();
    await page.waitForTimeout(200);
    await shot('12-folded');
    await page.locator('.dui-head button[title="fold the panel"]').click();
  }

  const d = await page.evaluate(() => ({ errors: window.__demo.errors, fps: window.__demo.info?.().fps, programs: window.__pixel.info?.().programs }));
  console.log('end:', JSON.stringify(d));
  if (d.errors?.length) bad.push(...d.errors.map((e) => `[__demo] ${e}`));
} catch (e) { bad.push('CHECK FAILED: ' + (e.stack || e.message)); }
if (fails.length) console.error('FAILED EXPECTATIONS:', fails.join(', '));
if (bad.length) console.error('ERRORS:\n' + bad.slice(0, 40).join('\n'));
await browser.close();
process.exit(bad.length || fails.length ? 1 : 0);
