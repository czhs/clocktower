// Evidence screenshots of the demo's game UI (owner: demo; docs/DEMO.md §9): plays the page headless on render-host with
// REAL mouse / keys / touch and writes the named PNGs a review asks for, plus the frames of the tip flying into the
// lightbulb (made into a GIF by tools/demo-evidence.sh with PIL). Default page: the BUNDLE (dist/v3-art-demo/index.html,
// served by request interception from the repo root).
//   node tools/demo-evidence.mjs [--out shots/demo-passA/final] [--page dist/v3-art-demo/index.html] [--only a,b]
//   parts: desktop (bar + tray + tooltip, tip + fly + glow frames, person pins, off-screen arrows, events, ghost,
//          night ambient), storyteller (?wip=1 night swap: poof + lantern), phone (390 x 844 touch: bar, pie, tray, night)
// Writes <out>/<name>.png, <out>/tipfly/NN.png + tipfly.json (frame times), <out>/evidence.json. Exit 1 on any page /
// console error.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = opt('out', 'shots/demo-passA/final');
const PAGE = opt('page', 'dist/v3-art-demo/index.html');
const ONLY = new Set(opt('only', 'desktop,storyteller,phone').split(','));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(path.join(OUT, 'tipfly'), { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const bad = [], rep = {};
async function open(ctxOpts, q) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') bad.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => bad.push(`[pageerror] ${e.message}`));
  await page.route('http://pixel3d.local/**', (route) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
  await page.goto(`http://pixel3d.local/${PAGE}?intro=0&${q}`);
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors?.length), null, { timeout: 120000 });
  await sleep(1500);
  const gi = () => page.evaluate(() => window.__demo.demo.gameui.info());
  const set = (p) => page.evaluate((x) => window.__demo.set(x), p);
  const S = await page.evaluate(() => window.__demo.demo.engine.pixelScale);
  const shot = (name, o = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...o });
  const tele = (x, z) => page.evaluate(([x, z]) => window.__demo.demo.player.teleport(x, z), [x, z]);
  const blur = () => page.evaluate(() => document.activeElement?.blur?.());
  return { ctx, page, gi, set, S, shot, tele, blur };
}
const mid = (r, S) => ({ x: (r.x + r.w / 2) * S, y: (r.y + r.h / 2) * S });

// ------------------------------------------------------------------------------------------------ desktop
if (ONLY.has('desktop')) {
  const { ctx, page, gi, set, S, shot, tele, blur } = await open({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, 'tod=noon');
  const R = rep.desktop = {};
  await set({ camera: 'follow', timeSpeed: 0, zoom: 12, yaw: 0 });
  // wait out the first-run tip (it flies into the bulb by itself)
  for (let k = 0; k < 60; k++) { const g = await gi(); if (g.tipState.shownCount && !g.tipState.shown && !g.tipState.flying && !g.tipState.glowing) break; await sleep(250); }
  // the bar + the tray + a tooltip
  let g = await gi();
  const bar = Object.fromEntries(g.bar.map((b) => [b.k, b]));
  await page.mouse.click(mid(bar.more, S).x, mid(bar.more, S).y); await sleep(300);
  g = await gi();
  const bell = g.tray.items.find((x) => x.code === 'KeyB');
  await page.mouse.move(mid(bell, S).x, mid(bell, S).y); await sleep(300);
  await shot('desktop-actionbar-tray-tooltip');
  await page.mouse.move(640, 300); await sleep(200);
  await shot('desktop-actionbar-tray');
  await blur(); await page.keyboard.press('Escape'); await sleep(200);
  await page.mouse.click(mid(bar.emote, S).x, mid(bar.emote, S).y); await sleep(300);
  await shot('desktop-actionbar-emotes');
  await page.keyboard.press('Escape'); await sleep(200);
  // the tip: the bulb opens it; close = it flies into the bulb, then the bulb glows (frames for the GIF)
  g = await gi();
  await page.mouse.click(mid(g.toolbar.tip, S).x, mid(g.toolbar.tip, S).y); await sleep(700);
  await page.mouse.move(640, 300); await sleep(150);
  await shot('desktop-tip-open');
  g = await gi();
  const close = mid(g.tipState.rect.close, S);
  const frames = [];
  for (let k = 0; k < 4; k++) { const t = Date.now(); await page.screenshot({ path: path.join(OUT, 'tipfly', `${String(frames.length).padStart(2, '0')}.png`) }); frames.push({ t, info: null }); }
  await page.mouse.click(close.x, close.y);
  const t0 = Date.now();
  while (Date.now() - t0 < 2900) {
    const t = Date.now();
    await page.screenshot({ path: path.join(OUT, 'tipfly', `${String(frames.length).padStart(2, '0')}.png`) });
    const st = await page.evaluate(() => { const s = window.__demo.demo.gameui.info().tipState; return { flying: s.flying, glowing: s.glowing }; });
    frames.push({ t, ...st });
  }
  fs.writeFileSync(path.join(OUT, 'tipfly', 'tipfly.json'), JSON.stringify(frames.map((f) => ({ ...f, t: f.t - t0 }))));
  R.tipFrames = frames.length;
  R.tipFlyFrames = frames.filter((f) => f.flying).length;
  // person pins: F on the Hound, then a click on the pin removes it
  g = await gi();
  const npc = g.members.find((m) => !m.you && m.shown && m.screen.x > 30 && m.screen.x < g.screen[0] - g.cover.right - 30);
  if (npc) {
    const body = { x: npc.screen.x * S + S / 2, y: (npc.screen.y - 12) * S };
    await page.mouse.move(body.x, body.y); await blur(); await page.keyboard.press('KeyF'); await sleep(900);
    g = await gi();
    const rc = g.personPins.find((x) => !x.removing);
    await page.mouse.move(mid(rc, S).x, mid(rc, S).y); await sleep(300);
    await shot('desktop-person-pin-on-hover');
    await page.mouse.click(mid(rc, S).x, mid(rc, S).y); await sleep(900);
    await page.mouse.move(640, 650); await sleep(200);
    await shot('desktop-person-pin-removed');
    R.personPin = { npc: npc.id, after: (await gi()).pins.filter((p) => p.kind === 'person' && !p.removing).length };
    // off-screen arrows: a pin on them + a place pin, then walk away
    await page.mouse.move(body.x, body.y); await page.keyboard.press('KeyF'); await sleep(400);
    await page.mouse.move(640 + 120, 420); await page.keyboard.press('KeyF'); await sleep(400);
    await tele(40, 32); await sleep(1500);
    await page.mouse.click(Math.round(640 / S) * S - 200, 200, { button: 'right' }); await sleep(300);   // a point too
    await tele(6, 34); await sleep(1600);
    await shot('desktop-offscreen-arrows');
    R.offscreen = (await gi()).offscreen;
    await page.evaluate(() => window.__demo.demo.gameui.clearPins());
  }
  // events: nomination -> vote clock -> execution -> nightfall
  await tele(22.5, 25.5); await sleep(800);
  const seats = Array.from({ length: 15 }, (_, i) => ({ occupied: i < 9, dead: i === 2, ghostVote: i === 2, nominated: false, onBlock: false }));
  await set({ seats, nominee: 5, phase: 'nomination' }); await sleep(800);
  await shot('desktop-events-nomination');
  await page.evaluate(() => { const t = window.__demo.demo.time; for (const v of [0, 1, 3, 6, 7]) t.setVote(v, true); });
  await set({ phase: 'vote' }); await sleep(3200);
  await shot('desktop-events-vote');
  await set({ phase: 'execution' }); await sleep(1500);
  await shot('desktop-events-execution');
  await set({ phase: 'night' }); await sleep(700);
  await shot('desktop-events-nightfall');
  await sleep(3000);
  await set({ phase: 'day', seats: Array.from({ length: 15 }, () => ({ occupied: false, dead: false, ghostVote: true, nominated: false, onBlock: false })), nominee: null }); await sleep(400);
  await shot('desktop-events-dawn');
  await sleep(2500);
  // the walking ghost (a toggle: 5 on, walk, 5 off)
  await set({ character: 'clarabelle' });
  for (let k = 0; k < 60; k++) { if (await page.evaluate(() => window.__demo.demo.player.handle?.id === 'clarabelle')) break; await sleep(100); }
  await sleep(900); await blur();
  await page.keyboard.press('Digit5'); await sleep(900);
  await shot('desktop-ghost-standing');
  await page.keyboard.down('KeyD'); await sleep(500);
  await shot('desktop-ghost-walking');
  R.ghost = await page.evaluate(() => ({ on: window.__demo.demo.player.ghost, level: window.__demo.demo.player.ghostLevel, moving: window.__demo.demo.player.moving }));
  await sleep(200); await page.keyboard.up('KeyD'); await sleep(500);
  await page.keyboard.press('Digit5'); await sleep(600);
  await set({ character: 'wanderer' }); await sleep(1500);
  // night ambient: fireflies over the west green, moths at the lamps
  await set({ timeOfDay: 23 }); await tele(9.5, 18.5); await sleep(2500);
  await shot('desktop-ambient-night');
  R.ambient = await page.evaluate(() => { const a = window.__demo.demo.ambient.info(); return { calls: a.calls, lights: a.lights, ff: a.per.fireflies?.ff, moth: a.per.fireflies?.moth }; });
  await set({ timeOfDay: 12.5 }); await tele(20.4, 29.2); await sleep(1500);
  await shot('desktop-ambient-pigeons-before');
  await page.keyboard.down('KeyA'); await sleep(800); await page.keyboard.up('KeyA'); await sleep(250);
  await shot('desktop-ambient-pigeons-scatter');
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------ the Storyteller
if (ONLY.has('storyteller')) {
  const { ctx, page, shot, set } = await open({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, 'wip=1&tod=23&npcs=0');
  const R = rep.storyteller = {};
  await page.evaluate(() => window.__demo.demo.gameui.closeTip());
  await sleep(2600);
  R.before = await page.evaluate(() => window.__demo.demo.engine.renderer.info.programs.length);
  await shot('desktop-storyteller-before');
  await set({ character: 'storyteller' });
  for (let k = 0; k < 80; k++) { if (await page.evaluate(() => window.__demo.demo.player.handle?.id === 'storyteller')) break; await sleep(25); }
  for (let k = 0; k < 4; k++) { await shot(`desktop-storyteller-poof-${k}`); await sleep(60); }
  await sleep(2500);
  await shot('desktop-storyteller-lantern');
  R.after = await page.evaluate(() => ({ programs: window.__demo.demo.engine.renderer.info.programs.length, carried: window.__demo.demo.time.info.carried }));
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------ phone
if (ONLY.has('phone')) {
  const { ctx, page, gi, set, shot } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'tod=noon');
  const R = rep.phone = {};
  await page.evaluate(() => window.__demo.demo.gameui.closeTip());
  await sleep(2600);
  const cl = (x, y) => page.evaluate(([x, y]) => {
    const d = window.__demo.demo, e = d.engine, c = e.renderer.domElement, b = c.getBoundingClientRect(), s = e.pixelScale || 1, H = d.gameui.info().screen[1];
    return { x: b.left + (x + 0.5) * s * b.width / e.width, y: b.top + (e.height - (H - 1 - y + 0.5) * s) * b.height / e.height };
  }, [x, y]);
  await shot('phone-bar');
  let g = await gi();
  const me = g.members.find((m) => m.you), sp = await cl(me.screen.x - 30, me.screen.y + 20);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', sp.x, sp.y); await sleep(800);
  g = await gi(); R.pie = g.pie;
  if (g.pie) { const k = g.pie.items.indexOf('pin:gold'), n = g.pie.items.length, a = -Math.PI / 2 + k * 2 * Math.PI / n; const wp = await cl(g.pie.at[0] + Math.cos(a) * 32, g.pie.at[1] + Math.sin(a) * 32); await touch('touchMove', wp.x, wp.y); await sleep(250); }
  await shot('phone-pie');
  await touch('touchEnd'); await sleep(900);
  g = await gi(); R.pins = g.pins.length;
  const more = g.bar.find((b) => b.k === 'more'), mp = await cl(more.x + more.w / 2, more.y + more.h / 2);
  await page.touchscreen.tap(mp.x, mp.y); await sleep(400);
  await shot('phone-tray');
  await page.touchscreen.tap(mp.x, mp.y); await sleep(300);
  await set({ timeOfDay: 23 }); await sleep(2000);
  await shot('phone-night-bar');
  await ctx.close();
}

const errs = bad.filter((b) => !/favicon/.test(b));
rep.errors = errs;
fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep, null, 1));
await browser.close();
if (errs.length) { console.log('EVIDENCE ERRORS:\n' + errs.join('\n')); process.exit(1); }
console.log(`EVIDENCE OK -> ${OUT}`);
