// Time / town-states check (owner: time; docs/DEMO.md §4.3, §9 items 5-7). Runs on render-host via tools/remote.sh.
// Loads demo.html in REAL TIME, waits for __demo.ready, then runs one scenario and writes PNGs + a JSON report.
//   node tools/demo-time.mjs <outdir> [--q "..."] [--size 1280x720] [--scenario scrub|run|phases|life|bell|walk]
//     scrub   paused clock, jump to a list of hours (--hours "5,6.25,..."), one screenshot each (settles 0.6 s)
//     run     clock at --speed (min/s) for --ms, per-frame dt recorder: max frame gap, programs before / after,
//             screenshots every --every ms
//     phases  seats + nominee + day -> nomination -> vote -> execution -> night, a screenshot per phase (vote camera)
//     ceremony  P (the scripted ceremony through the store), screenshots along it
//     life    life off / on (update skipped: piece.update is the no-op), screenshots
// Exit 1 on any console error / pageerror / __demo.errors.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const outDir = args[0];
if (!outDir || outDir.startsWith('--')) { console.error('usage: demo-time.mjs <outdir> [opts]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const scenario = opt('scenario', 'scrub');
const opt_q = opt('quality', 'low');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [], bad = [];
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  if (m.type() === 'error') bad.push(line);
  if (['error', 'warning'].includes(m.type()) || /THREE\.WebGL|shader|program/i.test(m.text())) logs.push(line);
});
page.on('pageerror', (e) => bad.push(`[pageerror] ${e.stack || e.message}`));
await page.route('http://pixel3d.local/**', (route) => {
  const u = new URL(route.request().url());
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});

const report = { scenario, q: opt('q', ''), steps: [] };
const snap = () => page.evaluate(() => {
  const d = window.__demo, dm = d.demo, e = window.__pixel.info?.() ?? {};
  const tm = dm.time;
  return {
    hours: tm ? +tm.hours.toFixed(3) : null, preset: tm?.preset, period: tm?.period, tinfo: tm ? { ...tm.info } : null,
    programs: e.programs, calls: e.calls, frames: d.frames, fps: d.info?.().fps, ceremony: tm?.ceremony ?? null,
    phase: dm.store.state.phase, nominee: dm.store.state.nominee, glow: null,
    seats: dm.store.state.seats.map((s) => (s.occupied ? 1 : 0) + (s.dead ? 2 : 0)).join(''),
    lifeVisible: dm.town.registry.get('life')?.group?.visible,
    sky: '#' + dm.engine.style.sky.getHexString(), sun: dm.engine.uniforms.uSunDir.value.toArray().map((v) => +v.toFixed(3)),
    fog: dm.engine.pipeline.getPass('fog')?.enabled ?? null, errors: d.errors.length,
    progs: (dm.engine.renderer.info.programs ?? []).map((p) => { const k = String(p.cacheKey); let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; return p.name + ':' + (h >>> 0).toString(36) + ':' + k.slice(0, 60); }),
  };
});
const shot = async (name) => { const f = path.join(outDir, name + '.png'); await page.screenshot({ path: f }); return f; };
const set = (p) => page.evaluate((x) => window.__demo.set(x), p);
const wait = (ms) => page.waitForTimeout(ms);
// frame-gap recorder (rAF timestamps in the page)
const recStart = () => page.evaluate(() => { const r = window.__rec = { gaps: [], last: null, on: true }; const f = (ts) => { if (!r.on) return; if (r.last !== null) r.gaps.push(ts - r.last); r.last = ts; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const recStop = () => page.evaluate(() => { const r = window.__rec; r.on = false; const g = r.gaps.slice().sort((a, b) => a - b); return { n: g.length, median: +(g[g.length >> 1] ?? 0).toFixed(2), p99: +(g[Math.floor(g.length * 0.99)] ?? 0).toFixed(2), max: +(g[g.length - 1] ?? 0).toFixed(2), over50: g.filter((x) => x > 50).length }; });

let code = 0;
try {
  const t0 = Date.now();
  await page.goto(`http://pixel3d.local/demo.html${opt('q', '') ? '?' + opt('q', '') : ''}`);
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors.length), null, { timeout: 120000 });
  report.readyMs = Date.now() - t0;
  await wait(Number(opt('wait', '1500')));
  report.start = await snap();
  if (scenario === 'scrub') {
    await set({ paused: true });
    for (const h of opt('hours', '0,5,6,6.25,6.6,7,8,10,12.5,15,16,17.5,18.5,19,19.4,19.75,20.5,22').split(',').map(Number)) {
      await set({ timeOfDay: h });
      await wait(Number(opt('settle', '700')));
      const f = await shot(`h${String(h.toFixed(2)).padStart(5, '0')}`);
      report.steps.push({ h, file: f, ...(await snap()) });
    }
  } else if (scenario === 'run') {
    await set({ timeSpeed: Number(opt('speed', '600')), paused: false });
    await recStart();
    const ms = Number(opt('ms', '10000')), every = Number(opt('every', '0'));
    const tEnd = Date.now() + ms;
    let k = 0;
    while (Date.now() < tEnd) {
      await wait(every || 1000);
      if (every) { const f = await shot(`run-${String(k++).padStart(2, '0')}`); report.steps.push({ file: f, ...(await snap()) }); }
      else report.steps.push(await snap());
    }
    report.frames = await recStop();
  } else if (scenario === 'phases') {
    const seats = Array.from({ length: 15 }, (_, i) => ({ occupied: i < Number(opt('seats', '11')), dead: i === 3 || i === 9, ghostVote: i === 3, nominated: false, onBlock: false }));
    await set({ seats, nominee: 6, camera: opt('cam', 'vote'), paused: true });
    for (const ph of ['day', 'nomination', 'vote', 'execution', 'night']) {
      await set({ phase: ph });
      if (ph === 'vote') await page.evaluate(() => { for (const i of [7, 8, 10, 12, 0, 1]) window.__demo.demo.time.setVote(i, true); });
      await wait(ph === 'vote' ? 6500 : 1500);
      const f = await shot(`phase-${ph}`);
      report.steps.push({ ph, file: f, ...(await snap()) });
    }
  } else if (scenario === 'ceremony') {
    await recStart();
    await page.keyboard.press('p');
    for (const ms of [2500, 4500, 3500, 4000, 6000, 4500, 4000]) {
      await wait(ms);
      const s = await snap();
      const f = await shot(`cer-${String(report.steps.length).padStart(2, '0')}-${s.phase}`);
      report.steps.push({ file: f, ...s });
    }
    report.frames = await recStop();
  } else if (scenario === 'life') {
    await recStart(); await wait(2000); report.lifeOn = await recStop();
    await page.keyboard.press('l'); await wait(800);
    report.steps.push({ file: await shot('life-off'), ...(await snap()) });
    report.lifeUpdate = await page.evaluate(() => window.__demo.demo.town.registry.get('life').update.toString().slice(0, 40));
    await recStart(); await wait(2000); report.lifeOff = await recStop();
    await page.keyboard.press('l'); await wait(800);
    report.steps.push({ file: await shot('life-on'), ...(await snap()) });
  } else if (scenario === 'bell') {
    await set({ paused: true });
    await page.keyboard.press('b'); await wait(500);
    report.steps.push({ file: await shot('bell-0'), ...(await snap()) });
    await wait(500);
    report.steps.push({ file: await shot('bell-1'), ...(await snap()) });
    // hour strike: run from xx:59 at x1
    await set({ timeOfDay: Number(opt('from', '17.975')), paused: false, timeSpeed: 1 });
    await wait(4000);
    report.steps.push({ file: await shot('strike'), ...(await snap()) });
  } else if (scenario === 'quality') {
    // quality change = a reload through the URL: clock, phase, seats, character and the player position survive
    await set({ phase: 'vote', nominee: 4, timeSpeed: 5 });
    const before = await page.evaluate(() => ({ url: location.search, info: window.__demo.info() }));
    report.steps.push({ key: 'before', player: before.info.player, file: await shot('q-before'), ...(await snap()) });
    await Promise.all([page.waitForNavigation({ timeout: 60000 }), set({ quality: opt_q })]);
    await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors.length), null, { timeout: 120000 });
    await wait(1500);
    const after = await page.evaluate(() => ({ url: location.search, info: window.__demo.info() }));
    report.urlAfter = after.url;
    report.steps.push({ key: 'after', player: after.info.player, file: await shot('q-after'), ...(await snap()) });
  } else if (scenario === 'eval') {
    // ad-hoc probes: --js "<expr>;;<expr>..." each evaluated in the page, a snapshot 800 ms after each
    for (const js of opt('js', '').split(';;').filter(Boolean)) {
      const r = await page.evaluate((c) => { try { return String(eval(c)); } catch (e) { return 'ERR ' + e.message; } }, js);
      await wait(800);
      report.steps.push({ key: js.slice(0, 50), player: r, file: await shot(`eval-${report.steps.length}`), ...(await snap()) });
    }
  } else if (scenario === 'walk') {
    // walk around at night with the lights re-aiming
    await set({ paused: true });
    for (const k of (opt('keys', 'KeyA:2500,KeyW:2500,KeyD:2500') || '').split(',').filter(Boolean)) {
      const [key, ms] = k.split(':');
      const kk = key.replace(/^Key/, '').length === 1 ? key.replace(/^Key/, '').toLowerCase() : key;
      await page.keyboard.down(kk); await wait(Number(ms)); await page.keyboard.up(kk); await wait(500);
      const s = await snap();
      const pl = await page.evaluate(() => window.__demo.info().player);
      report.steps.push({ key, player: pl, file: await shot(`walk-${report.steps.length}`), ...s });
    }
  }
  report.end = await snap();
  const errs = await page.evaluate(() => window.__demo.errors);
  if (errs.length) bad.push(...errs.map((e) => `[__demo] ${e}`));
} catch (e) { bad.push('CHECK FAILED: ' + e.stack); }
report.logs = logs.slice(0, 40); report.bad = bad.slice(0, 40);
fs.writeFileSync(path.join(outDir, `report-${scenario}.json`), JSON.stringify(report, null, 1));
if (report.start?.progs && report.end?.progs) report.newPrograms = report.end.progs.filter((x) => !report.start.progs.includes(x));
if (report.start) delete report.start.progs; if (report.end) delete report.end.progs; for (const st of report.steps) delete st.progs;
console.log(JSON.stringify({ urlAfter: report.urlAfter, newPrograms: report.newPrograms, readyMs: report.readyMs, start: report.start, end: report.end, frames: report.frames, lifeOn: report.lifeOn, lifeOff: report.lifeOff, lifeUpdate: report.lifeUpdate,
  steps: report.steps.map((s) => ({ h: s.h, ph: s.ph, key: s.key, player: s.player, hours: s.hours, preset: s.preset, period: s.period, programs: s.programs, fps: s.fps, phase: s.phase, seats: s.seats, lit: s.tinfo?.lit, strikes: s.tinfo?.strikes, sky: s.sky, sun: s.sun, fog: s.fog, life: s.lifeVisible, cer: s.ceremony })) }, null, 0));
if (logs.length) console.log('console:\n' + logs.slice(0, 30).join('\n'));
if (bad.length) { console.error('ERRORS:\n' + bad.slice(0, 30).join('\n')); code = 1; }
await browser.close();
process.exit(code);
