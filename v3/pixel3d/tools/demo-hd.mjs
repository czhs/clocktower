// UI density evidence + perf for the demo's game UI (owner: ui; docs/DEMO.md §4.7 "Density"). Plays demo.html headless
// on render-host with the same scene at each viewport (the HUD with the tip + the social palette open, a person pin and a
// place pin, the action bar + its tray with a tooltip, the notebook's Notes / Seats pages, the tip flying into the
// bulb), writes full screenshots + 3x zoom crops of each UI element, and measures the UI's per-frame cost.
//   node tools/demo-hd.mjs --out shots/demo-hd/after [--q "uidensity=1"] [--sizes 1280x720,1920x1080,390x844]
//        [--tods noon,night] [--parts shots,perf] [--page demo.html] [--secs 4]
// Sizes ending in 'p' (e.g. 390x844p) are phones (touch, deviceScaleFactor 2, isMobile). Crops are cut from the
// screenshot with tools/demo-hd.py (PIL, nearest x3). Rects come from gameui.info() in its screen units (info().unit =
// CSS px per unit; older builds: engine.pixelScale). Writes <out>/<size>-<tod>-<name>.png, <out>/zoom/<...>.png,
// <out>/report.json. Exit 1 on a page / console error or a CSP line.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = opt('out', 'shots/demo-hd/after');
const Q = opt('q', '');
const PAGE = opt('page', 'demo.html');
const SIZES = opt('sizes', '1280x720,1920x1080').split(',');
const TODS = opt('tods', 'noon,night').split(',');
const PARTS = new Set(opt('parts', 'shots,perf').split(','));
const SECS = Number(opt('secs', '4'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.webp': 'image/webp', '.bin': 'application/octet-stream' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(path.join(OUT, 'zoom'), { recursive: true });
const NOTES = 'Ada trusts Cleo. The mill light at 2:10 — who? Gus voted ✓, Bram did not…';

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const bad = [], report = { q: Q, runs: {} };

async function open(size, tod) {
  const phone = size.endsWith('p');
  const [W, H] = size.replace('p', '').split('x').map(Number);
  const ctx = await browser.newContext(phone ? { viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(m.text())) bad.push(`[${size} ${tod} console] ${m.text()}`); });
  page.on('pageerror', (e) => bad.push(`[${size} ${tod} pageerror] ${e.stack || e.message}`));
  await page.route('http://pixel3d.local/**', (route) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
  await page.addInitScript((notes) => { try { localStorage.setItem('hollowmere-notebook:notes', JSON.stringify(notes)); localStorage.setItem('hollowmere-notebook:page', JSON.stringify('notes')); } catch { /* none */ } }, NOTES);
  await page.goto(`http://pixel3d.local/${PAGE}?intro=0&tod=${tod}${Q ? '&' + Q : ''}`);
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors?.length), null, { timeout: 120000 });
  await sleep(1500);
  const gi = () => page.evaluate(() => window.__demo.demo.gameui.info());
  const S = await page.evaluate(() => window.__demo.demo.engine.pixelScale);
  return { ctx, page, gi, S, phone, W, H };
}
/** unit rect -> device-px clip (padded, clamped to the viewport) */
const clipOf = (r, u, W, H, pad = 3) => {
  const x = Math.max(0, Math.floor((r.x - pad) * u)), y = Math.max(0, Math.floor((r.y - pad) * u));
  return { x, y, width: Math.max(1, Math.min(W, Math.ceil((r.x + r.w + pad) * u)) - x), height: Math.max(1, Math.min(H, Math.ceil((r.y + r.h + pad) * u)) - y) };
};
const union = (list) => { const L = list.filter(Boolean); if (!L.length) return null; const x0 = Math.min(...L.map((r) => r.x)), y0 = Math.min(...L.map((r) => r.y)); return { x: x0, y: y0, w: Math.max(...L.map((r) => r.x + r.w)) - x0, h: Math.max(...L.map((r) => r.y + r.h)) - y0 }; };

async function scene(P, tod) {
  const { page, gi, S, W, H } = P;
  const tag = `${P.phone ? W + 'x' + H + 'p' : W + 'x' + H}-${tod}`;
  const rep = report.runs[tag] = { crops: {} };
  await page.evaluate((night) => window.__demo.set({ camera: 'follow', timeSpeed: 0, zoom: 12, yaw: 0, timeOfDay: night ? 22.5 : 12.5, phase: 'day', ui: !0 }), tod === 'night');
  await page.evaluate(() => window.__demo.demo.player.teleport(22.5, 25.5));
  await sleep(1200);
  let g = await gi();
  const u = g.unit ?? S;
  rep.unit = u; rep.screen = g.screen; rep.density = g.density ?? null; rep.pixelScale = S;
  const cl = (s, dy = 0) => ({ x: (s.x + 0.5) * u, y: (s.y + dy + 0.5) * u });
  // a person pin on a visible townsperson (F at their body), a place pin beside you
  const npc = g.members.find((m) => !m.you && m.screen.x > 40 && m.screen.x < g.screen[0] - (g.cover.right || 0) - 60 && m.screen.y > 70 && m.screen.y < g.screen[1] - 60);
  const me = g.members.find((m) => m.you);
  if (npc) { const a = cl(npc.screen, -10); await page.mouse.move(a.x, a.y); await page.keyboard.press('KeyF'); await sleep(200); }
  if (me) await page.evaluate(([x, y]) => { const G = window.__demo.demo.gameui; G.color = 'teal'; G.dropPin(G.targetAt(x, y)); G.color = 'crimson'; }, [cl({ x: me.screen.x + 46, y: me.screen.y + 4 }).x, cl({ x: me.screen.x + 46, y: me.screen.y + 4 }).y]);
  await page.evaluate(() => { const G = window.__demo.demo.gameui; G.dockOpen = true; G.tip(null, 0, { auto: false }); });
  await page.mouse.move(Math.round(W * 0.45), Math.round(H * 0.62));
  await sleep(1300);
  g = await gi();
  const full = path.join(OUT, `${tag}-hud.png`);
  await page.screenshot({ path: full });
  const crops = [];
  const add = (name, r, pad = 3, src = full) => { if (!r) return; const c = clipOf(r, u, W, H, pad); crops.push([src, name, c]); rep.crops[name] = c; };
  add('toolbar', union(Object.values(g.toolbar ?? {})), 4);
  add('chips', { x: 0, y: 0, w: Math.round(g.screen[0] * 0.36), h: 24 }, 0);
  add('palette', union([...Object.values(g.dock.rects ?? {}), g.dock.button]), 4);
  add('tip', g.tipState.rect, 4);
  const pp = g.personPins?.[0];
  if (npc && pp) { const m = g.members.find((x) => x.id === npc.id); add('label-personpin', union([pp, { x: m.screen.x - 34, y: m.screen.y - 4, w: 68, h: 8 }]), 2); }
  const place = g.pins.find((p) => p.kind === 'place');
  if (place?.screen) add('placepin', { x: place.screen.x - 14, y: place.screen.y - 32, w: 28, h: 38 }, 0);
  add('actionbar', union(g.bar ?? []), 4);
  // hover the person pin (hand cursor + the remove badge + the tooltip)
  if (pp) {
    await page.mouse.move((pp.x + pp.w / 2) * u, (pp.y + pp.h / 2) * u); await sleep(350);
    const hv = path.join(OUT, `${tag}-pinhover.png`);
    await page.screenshot({ path: hv });
    const g2 = await gi(); rep.pinHover = { hover: g2.hover, cursor: g2.cursor };
    add('pinhover', { x: pp.x - 50, y: pp.y - 22, w: pp.w + 100, h: pp.h + 30 }, 0, hv);
  }
  // the tray + a tooltip
  await page.evaluate(() => { const G = window.__demo.demo.gameui; G.closeTip?.('close'); G.dockOpen = false; G.barAction('more'); });
  await sleep(900);
  g = await gi();
  const bell = g.tray.items?.find((x) => x.code === 'KeyB');
  if (bell) { await page.mouse.move((bell.x + bell.w / 2) * u, (bell.y + bell.h / 2) * u); await sleep(350); }
  const tr = path.join(OUT, `${tag}-tray.png`);
  await page.screenshot({ path: tr });
  g = await gi();
  add('tray', union([...(g.tray.items ?? []), ...(g.bar ?? []), bell ? { x: bell.x - 40, y: bell.y - 22, w: 100, h: 20 } : null]), 4, tr);
  await page.evaluate(() => window.__demo.demo.gameui.barAction('more'));
  await page.evaluate(() => window.__demo.demo.gameui.barAction('emote'));
  await sleep(300);
  const pal = path.join(OUT, `${tag}-emotes.png`);
  await page.screenshot({ path: pal });
  g = await gi();
  add('emotes', union([...(g.palette.items ?? []), ...(g.bar ?? [])]), 4, pal);
  await page.evaluate(() => window.__demo.demo.gameui.barAction('emote'));
  // the notebook: Notes, then Seats
  await page.mouse.move(Math.round(W * 0.7), Math.round(H * 0.5));
  await page.evaluate(() => window.__demo.demo.gameui.notebook.open('notes'));
  await sleep(700);
  await page.evaluate(() => document.activeElement?.blur?.());
  await sleep(200);
  const nbp = path.join(OUT, `${tag}-notebook.png`);
  await page.screenshot({ path: nbp });
  const nbr = await page.evaluate(() => { const e = document.querySelector('.dnb'); const r = e?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; });
  if (nbr) { const c = clipOf(nbr, 1, W, H, 4); crops.push([nbp, 'notebook', c]); rep.crops.notebook = c; }   // (client px)
  await page.evaluate(() => window.__demo.demo.gameui.notebook.setPage('seats'));
  await sleep(400);
  const nbs = path.join(OUT, `${tag}-notebook-seats.png`);
  await page.screenshot({ path: nbs });
  if (nbr) { const r2 = await page.evaluate(() => { const r = document.querySelector('.dnb')?.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }); const c = clipOf(r2, 1, W, H, 4); crops.push([nbs, 'notebook-seats', c]); rep.crops['notebook-seats'] = c; }
  await page.evaluate(() => { const nb = window.__demo.demo.gameui.notebook; nb.setPage('notes'); nb.close(); });
  // the tip flies into the bulb: frames
  await page.evaluate(() => window.__demo.demo.gameui.tip(null, 0, { auto: false }));
  await sleep(400);
  g = await gi();
  const fr = [];
  await page.evaluate(() => window.__demo.demo.gameui.closeTip('close'));
  for (let k = 0; k < 6; k++) { const f = path.join(OUT, `${tag}-tipfly-${k}.png`); await page.screenshot({ path: f }); fr.push(f); await sleep(70); }
  const fly = union([g.tipState.rect, g.toolbar?.tip]);
  if (fly) for (let k = 0; k < fr.length; k++) add(`tipfly-${k}`, fly, 6, fr[k]);
  // the 3x zoom crops (PIL on the host)
  for (const [src, name, c] of crops) {
    try { execFileSync('python3', [path.join(ROOT, 'tools/demo-hd.py'), 'zoom', src, path.join(OUT, 'zoom', `${tag}-${name}.png`), String(c.x), String(c.y), String(c.width), String(c.height), '3']); }
    catch (e) { bad.push(`[zoom ${name}] ${e.message}`); }
  }
  await page.evaluate(() => window.__demo.demo.gameui.clearPins());
  rep.csp = await page.evaluate(() => window.__demo.errors ?? []);
}

/** The UI's per-frame cost with a busy HUD (tip + palette open, a person + a place pin, labels): RAF frame ms, the
 *  CPU ms of renderAt, the UI layer's redraw ms (its pass update) and the texels / HD px uploaded per frame. */
async function perf(P, tod) {
  const { page, gi, S, W, H } = P;
  const tag = `${P.phone ? W + 'x' + H + 'p' : W + 'x' + H}-${tod}`;
  await page.evaluate((night) => window.__demo.set({ camera: 'follow', timeSpeed: 1, zoom: 12, yaw: 0, timeOfDay: night ? 22.5 : 12.5, phase: 'day' }), tod === 'night');
  await page.evaluate(() => window.__demo.demo.player.teleport(22.5, 25.5));
  await sleep(900);
  let g = await gi();
  const u = g.unit ?? S;
  const npc = g.members.find((m) => !m.you && m.screen.x > 40 && m.screen.x < g.screen[0] - (g.cover.right || 0) - 60 && m.screen.y > 70);
  if (npc) await page.evaluate(([x, y]) => { const G = window.__demo.demo.gameui; G.dropPin(G.targetAt(x, y)); }, [(npc.screen.x + 0.5) * u, (npc.screen.y - 10) * u]);
  const me = g.members.find((m) => m.you);
  if (me) await page.evaluate(([x, y]) => { const G = window.__demo.demo.gameui; G.dropPin(G.targetAt(x, y)); }, [(me.screen.x + 46) * u, (me.screen.y + 4) * u]);
  const res = {};
  // modes: busy (tip + palette open, pins, labels), idle (pins + labels), point (idle + the point emote at a townsperson
  // re-played every 3.2 s: the finger, its trail and the ping on the HD tiers)
  for (const mode of ['busy', 'idle', 'point']) {
    await page.evaluate((busy) => { const G = window.__demo.demo.gameui; G.dockOpen = busy; if (busy) G.tip(null, 0, { auto: false }); else G.closeTip?.('close'); }, mode === 'busy');
    await page.mouse.move(Math.round(W * 0.45), Math.round(H * 0.62));
    await sleep(1200);
    res[mode] = await page.evaluate(async ([secs, pointAt]) => {
      const G0 = window.__demo.demo.gameui, pt = pointAt ? () => G0.doPoint(G0.targetAt(pointAt[0], pointAt[1])) : null;
      let iv = null; if (pt) { pt(); iv = setInterval(pt, 3200); }
      const d = window.__demo.demo, e = d.engine, L = d.gameui.L, pass = L.pass;
      const raf = [], cpu = [], ui = [];
      let on = true, last = null;
      const ra = e.renderAt, pu = pass.update;
      e.renderAt = function (t) { const a = performance.now(); const r = ra.call(this, t); cpu.push(performance.now() - a); return r; };
      pass.update = function (...x) { const a = performance.now(); const r = pu.apply(this, x); ui.push(performance.now() - a); return r; };
      const s0 = { up: L.stats.uploadPx, n: L.stats.uploads, hu: L.hd?.stats.uploadPx ?? 0, hn: L.hd?.stats.uploads ?? 0, f: L.stats.frames };
      const tick = (now) => { if (last !== null) raf.push(now - last); last = now; if (on) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, secs * 1000));
      on = false; e.renderAt = ra; pass.update = pu; if (iv) clearInterval(iv);
      const f = Math.max(1, L.stats.frames - s0.f);
      const st = (a) => { const s = [...a].sort((x, y) => x - y); return { mean: +(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(2), p95: +(s[Math.floor(0.95 * (s.length - 1))] ?? 0).toFixed(2), max: +(s[s.length - 1] ?? 0).toFixed(2) }; };
      return { frames: raf.length, fps: +(1000 / (raf.reduce((a, b) => a + b, 0) / Math.max(1, raf.length))).toFixed(1), frameMs: st(raf), cpuMs: st(cpu), uiMs: st(ui),
        upload1xPxPerFrame: Math.round((L.stats.uploadPx - s0.up) / f), uploadHDPxPerFrame: Math.round(((L.hd?.stats.uploadPx ?? 0) - s0.hu) / f),
        uploadsPerFrame: +(((L.stats.uploads - s0.n) + ((L.hd?.stats.uploads ?? 0) - s0.hn)) / f).toFixed(2) };
    }, [SECS, mode === 'point' && npc ? [(npc.screen.x + 0.5) * u, (npc.screen.y - 10) * u] : null]);
  }
  report.runs[tag] = { ...(report.runs[tag] ?? {}), perf: res };
  console.log(`perf ${tag}: busy ${JSON.stringify(res.busy)}\n           idle ${JSON.stringify(res.idle)}\n           point ${JSON.stringify(res.point)}`);
  await page.evaluate(() => window.__demo.demo.gameui.clearPins());
}

try {
  for (const size of SIZES) for (const tod of TODS) {
    const P = await open(size, tod);
    try {
      if (PARTS.has('shots')) await scene(P, tod);
      if (PARTS.has('perf')) await perf(P, tod);
      const errs = await P.page.evaluate(() => window.__demo.errors ?? []);
      if (errs.length) bad.push(...errs.map((e) => `[${size} ${tod} __demo] ${e}`));
    } catch (e) { bad.push(`[${size} ${tod}] ${e.stack || e.message}`); }
    await P.ctx.close();
    console.log(`done ${size} ${tod}`);
  }
} finally {
  report.errors = bad;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close();
}
console.log(bad.length ? `DEMO-HD FAIL (${bad.length})\n${bad.slice(0, 12).join('\n')}` : `DEMO-HD OK -> ${OUT}`);
process.exit(bad.length ? 1 : 0);
