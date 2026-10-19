// Demo smoke test (owner: deploy; docs/DEMO.md §4.5 / §9.1). Runs on render-host via tools/remote.sh, headless Chromium on
// the 4090, REAL-TIME mode (no capture): for every quality tier x time of day it loads demo.html, waits for
// window.__demo.ready, lets it settle, samples requestAnimationFrame for --secs seconds (fps, median / p95 / max frame ms,
// frames > 50 ms), reads __demo.info() (programs, calls, tris, player, cut), takes a screenshot, and fails on ANY
// console error, page error, __demo.errors entry, shader / program error, a boot screen that never left, or fps below
// --min-fps.
//
//   tools/remote.sh node tools/demo-smoke.mjs [--out shots/demo-deploy/smoke] [--tiers high,low] [--tods noon,night]
//        [--secs 5] [--settle 1500] [--min-fps 45] [--size 1280x720] [--q "char=keeper"] [--base http://<tailnet-ip>:8090]
//        [--page demo.html]   (the page under --base; '' = the directory index, e.g. the static bundle's index.html)
//        [--uncapped]   (Chromium without vsync / frame-rate limit: shows the headroom above 60 fps; --min-fps still applies)
//        [--expect-csp "<policy>"]   (the page's Content-Security-Policy response header must equal it exactly)
//        [--tour]   (after the tier x tod runs, one guided session: the loading screen, the cinematic (?intro=1), Esc,
//                    the square at noon, walking (W / D held), 3 interiors (--tour-houses), 2 characters (--tour-chars),
//                    night, back out; then a ?wip=1 load that must offer + load a WIP character. Writes tour-NN-*.png)
//        [--tour-houses house-2,house-8,house-12] [--tour-chars fox,owl]
// Every run counts CSP violations (a 'securitypolicyviolation' listener installed before any page script + console
// lines "Refused to ..." / "Content Security Policy"): any = failure. Playwright does not bypass the CSP (bypassCSP off).
//   rsync -az render-host:pixel3d/shots/demo-deploy/smoke/ shots/demo-deploy/smoke/      # then LOOK at the PNGs
//
// Default: the repo is served to the page by request interception (no server needed). --base <url> loads the live
// server instead (tools/demo-serve.sh). When --base has a path (a sub-path host such as .../v3-art-demo, see
// tools/demo-bundle.sh verify) every same-origin request must stay under that path (relative URLs only). Writes <out>/<tier>-<tod>.png, <out>/smoke.json; exit 0 = all green.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = opt('out', 'shots/demo-deploy/smoke');
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const TIERS = opt('tiers', 'high,low').split(',').filter(Boolean);
const TODS = opt('tods', 'noon,night').split(',').filter(Boolean);
const SECS = Number(opt('secs', '5')), SETTLE = Number(opt('settle', '1500')), MIN_FPS = Number(opt('min-fps', '45'));
const BASE = opt('base', 'http://pixel3d.local');
const EXTRA = opt('q', '');
const PAGE = opt('page', 'demo.html');
const BASE_URL = new URL(BASE + '/');
const UNCAPPED = args.includes('--uncapped');
const EXPECT_CSP = opt('expect-csp', null);
const TOUR = args.includes('--tour');
const TOUR_HOUSES = opt('tour-houses', 'house-2,house-8,house-12').split(',').filter(Boolean);
const TOUR_CHARS = opt('tour-chars', 'fox,owl').split(',').filter(Boolean);
const CSP_RX = /Content Security Policy|Refused to (execute|load|apply|evaluate|connect|create|frame)/i;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
// three's shader compile / link failures arrive as console.error ("THREE.WebGLProgram: Shader Error ...") but some
// drivers report them as warnings: treat both as errors.
const SHADER_RX = /WebGLProgram|Shader Error|shader error|program not valid|VALIDATE_STATUS|could not compile/i;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader',
  ...(UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] });

/** A page with every failure hook: console errors / shader lines / CSP lines, page errors, failed + >= 400 requests,
 *  requests outside the --base path, the CSP header check on documents, and an in-page securitypolicyviolation log. */
async function openPage(bad, warn) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(
      `${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile || '?'}:${e.lineNumber || 0} ${e.sample || ''}`.trim()));
  });
  page.on('console', (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    if (CSP_RX.test(m.text())) bad.push('[csp console] ' + m.text());
    else if (m.type() === 'error' || SHADER_RX.test(m.text())) bad.push(line);
    else if (m.type() === 'warning') warn.push(line);
  });
  page.on('response', (r) => {
    if (EXPECT_CSP && r.request().resourceType() === 'document') {
      const got = r.headers()['content-security-policy'];
      if (got !== EXPECT_CSP) bad.push(`[csp header] ${r.url()}: ${got === undefined ? 'missing' : JSON.stringify(got)}`);
    }
  });
  page.on('pageerror', (e) => bad.push(`[pageerror] ${e.stack || e.message}`));
  page.on('requestfailed', (r) => bad.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`[http ${r.status()}] ${r.url()}`); });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (BASE_URL.pathname !== '/' && u.origin === BASE_URL.origin && !u.pathname.startsWith(BASE_URL.pathname)) bad.push(`[outside ${BASE_URL.pathname}] ${r.url()}`);
  });
  if (BASE === 'http://pixel3d.local') {
    await page.route('http://pixel3d.local/**', (route) => {
      const u = new URL(route.request().url());
      const p = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
      route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
    });
  }
  return page;
}
const cspViolations = (page) => page.evaluate(() => window.__cspViolations ?? ['(no securitypolicyviolation listener)']).catch(() => []);

async function run(tier, tod) {
  const name = `${tier}-${tod}`;
  const bad = [], warn = [];
  const page = await openPage(bad, warn);
  const res = { name, tier, tod, ok: false };
  try {
    const q = new URLSearchParams(EXTRA);
    q.set('quality', tier); q.set('tod', tod);
    const t0 = Date.now();
    await page.goto(`${BASE}/${PAGE}?${q}`);
    await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors?.length), null, { timeout: 120000 });
    res.readyMs = Date.now() - t0;
    await page.waitForTimeout(SETTLE);
    // rAF sampler in the page: every frame interval for SECS seconds
    res.frames = await page.evaluate((secs) => new Promise((resolve) => {
      const dts = []; let prev = performance.now(); const end = prev + secs * 1000;
      const f = (now) => { dts.push(now - prev); prev = now; if (now < end) requestAnimationFrame(f); else resolve(dts); };
      requestAnimationFrame((now) => { prev = now; requestAnimationFrame(f); });
    }), SECS).then((dts) => {
      const s = dts.slice().sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
      const total = dts.reduce((a, b) => a + b, 0);
      return { n: dts.length, fps: +(dts.length / (total / 1000)).toFixed(1), medianMs: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2),
        maxMs: +s[s.length - 1].toFixed(1), over50: dts.filter((d) => d > 50).length };
    });
    const shot = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: shot });
    res.shot = shot;
    const info = await page.evaluate(() => {
      const d = window.__demo, i = d.info?.() ?? {}, e = window.__pixel?.info?.() ?? {};
      return { errors: d.errors ?? [], demoFps: i.fps, character: i.character, player: i.player, nearDoor: i.nearDoor, tod: i.tod, hours: i.hours,
        quality: i.state?.quality, cut: i.cut ? { on: i.cut.on, house: i.cut.house ?? null } : null,
        programs: e.programs, calls: e.calls, tris: e.tris, low: e.low, gpu: e.gpu, buildMs: e.stats?.demoBuildMs, compileMs: e.stats?.demoCompileMs,
        doorMismatch: e.stats?.doorMismatch ?? null,
        bootGone: !document.getElementById('demo-boot') || document.getElementById('demo-boot').classList.contains('done'),
        bootError: document.getElementById('demo-boot')?.classList.contains('error') ?? false };
    });
    Object.assign(res, info);
    res.csp = await cspViolations(page);
    for (const v of res.csp) bad.push('[csp] ' + v);
    if (info.errors.length) bad.push(...info.errors.map((e) => `[__demo] ${e}`));
    if (!info.bootGone || info.bootError) bad.push('[boot] boot screen still up' + (info.bootError ? ' (error)' : ''));
    if (info.quality && info.quality !== tier) bad.push(`[state] quality is ${info.quality}, asked ${tier}`);
    if (res.frames.fps < MIN_FPS) bad.push(`[perf] ${res.frames.fps} fps < --min-fps ${MIN_FPS}`);
  } catch (e) { bad.push('CHECK FAILED: ' + e.message); }
  res.errors = bad; res.warnings = warn.slice(0, 20); res.ok = bad.length === 0;
  await page.close();
  return res;
}

const results = [];
for (const tier of TIERS) for (const tod of TODS) {
  const r = await run(tier, tod);
  results.push(r);
  const f = r.frames ?? {};
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name.padEnd(12)} ready ${r.readyMs ?? '-'} ms (build ${r.buildMs ?? '-'}, warm-up ${r.compileMs ?? '-'}) | ` +
    `${f.fps ?? '-'} fps, frame median ${f.medianMs ?? '-'} / p95 ${f.p95Ms ?? '-'} / max ${f.maxMs ?? '-'} ms, >50ms: ${f.over50 ?? '-'} | ` +
    `programs ${r.programs ?? '-'}, calls ${r.calls ?? '-'}, tris ${r.tris ?? '-'} | ${r.character ?? '-'} @ ${JSON.stringify(r.player ?? null)}`);
  for (const e of r.errors) console.log('   ! ' + e.slice(0, 400));
  for (const w of r.warnings.slice(0, 5)) console.log('   ~ ' + w.slice(0, 200));
}

/** --tour: one guided session under the same hooks (see the header); then a ?wip=1 load. */
async function tour() {
  const bad = [], warn = [], steps = {};
  const page = await openPage(bad, warn);
  const sleep = (ms) => page.waitForTimeout(ms);
  let n = 0;
  const shot = async (name) => { const f = path.join(OUT, `tour-${String(++n).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); return f; };
  const set = (p) => page.evaluate((x) => window.__demo.set(x), p);
  const inf = () => page.evaluate(() => { const i = window.__demo.info?.() ?? {}; return { character: i.character, player: i.player, tod: i.tod, hours: i.hours,
    location: window.__demo.demo?.player?.location ?? null, intro: window.__demo.demo?.intro?.phase ?? null, programs: window.__pixel?.info?.()?.programs }; });
  const until = async (fn, ms, every = 100) => { for (let t = 0; t < ms; t += every) { const v = await fn().catch(() => null); if (v) return v; await sleep(every); } return null; };
  const hold = async (codes, ms, mid = null) => {
    await page.evaluate(() => document.activeElement?.blur?.());
    for (const c of codes) await page.keyboard.down(c);
    if (mid) { await sleep(ms / 2); await mid(); await sleep(ms / 2); } else await sleep(ms);
    for (const c of codes) await page.keyboard.up(c);
  };
  const res = { name: 'tour', ok: false, steps };
  try {
    const q = new URLSearchParams(EXTRA); q.set('intro', '1'); if (!q.has('tod')) q.set('tod', 'noon');
    const t0 = Date.now();
    await page.goto(`${BASE}/${PAGE}?${q}`);
    // 1 the loading screen: up from the first frame, the bar under way
    const ld = await until(() => page.evaluate(() => {
      const el = document.getElementById('demo-loading');
      const shown = !!el && getComputedStyle(el).display !== 'none' && +getComputedStyle(el).opacity > 0.5;
      return shown && !window.__demo?.ready ? { shown, text: el.innerText.replace(/\s+/g, ' ').slice(0, 80) } : null;
    }), 20000, 50);
    if (!ld) bad.push('[tour] the loading screen was never seen');
    else { await sleep(700); steps.loading = { ...ld, atMs: Date.now() - t0, shot: await shot('loading') }; }
    await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors?.length), null, { timeout: 120000 });
    steps.readyMs = Date.now() - t0;
    // 2 the cinematic: flies, then Esc
    const fly = await until(async () => { const p = (await inf()).intro; return p === 'fly' || p === 'title' ? p : null; }, 20000);
    if (!fly) bad.push(`[tour] no cinematic (intro phase ${(await inf()).intro})`);
    else {
      await sleep(2500);
      steps.cinematic = { phase: (await inf()).intro, shot: await shot('cinematic') };
      await page.keyboard.press('Escape');
      const done = await until(async () => (await inf()).intro === 'done', 5000);
      if (!done) bad.push(`[tour] Esc did not end the cinematic (${(await inf()).intro})`);
    }
    await sleep(1500);
    await set({ timeSpeed: 0, timeOfDay: 12 });
    await sleep(800);
    steps.square = { ...(await inf()), shot: await shot('square-noon') };
    // 3 walking
    const p0 = (await inf()).player;
    let walkShot = null;
    await hold(['KeyW'], 1400, async () => { walkShot = await shot('walking'); });
    await hold(['KeyD'], 800);
    const p1 = (await inf()).player;
    const moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    steps.walk = { from: p0, to: p1, moved: +moved.toFixed(2), shot: walkShot };
    if (!(moved > 1)) bad.push(`[tour] walking moved the player only ${moved.toFixed(2)} m`);
    // 4 characters (outside, walking)
    steps.chars = [];
    for (const id of TOUR_CHARS) {
      await set({ character: id });
      const ok = await until(async () => (await inf()).character === id, 15000);
      if (!ok) { bad.push(`[tour] character ${id} did not load (${(await inf()).character})`); continue; }
      await sleep(600);
      let f = null;
      await hold(['KeyS'], 1000, async () => { f = await shot(`char-${id}`); });
      steps.chars.push({ id, shot: f, programs: (await inf()).programs });
    }
    // 5 interiors
    steps.houses = [];
    for (const id of TOUR_HOUSES) {
      await set({ location: id });
      const ok = await until(async () => (await inf()).location === id, 12000);
      if (!ok) { bad.push(`[tour] ${id}: not inside (${(await inf()).location})`); continue; }
      await sleep(1600);
      steps.houses.push({ id, shot: await shot(`in-${id}`) });
      await set({ location: 'town' });
      if (!(await until(async () => (await inf()).location === 'town', 8000))) bad.push(`[tour] ${id}: did not leave`);
      await sleep(900);
    }
    // 6 night on the square
    await set({ timeOfDay: 23.5 });
    await sleep(1500);
    steps.night = { ...(await inf()), shot: await shot('square-night') };
    steps.offered = await page.evaluate(() => (window.__demo.demo?.characters ?? []).filter((c) => c.complete).map((c) => `${c.id}${c.status === 'wip' ? '(wip)' : ''}`));
    if (steps.offered.some((c) => c.endsWith('(wip)'))) bad.push(`[tour] the public page offers WIP characters: ${steps.offered.filter((c) => c.endsWith('(wip)'))}`);
    res.csp = await cspViolations(page);
    // 7 ?wip=1: the work in progress is offered and loads
    await page.goto(`${BASE}/${PAGE}?intro=0&tod=noon&wip=1`);
    await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors?.length), null, { timeout: 120000 });
    const wips = await page.evaluate(() => (window.__demo.demo?.characters ?? []).filter((c) => c.complete && c.status === 'wip').map((c) => c.id));
    steps.wip = { offered: wips };
    if (!wips.length) bad.push('[tour] ?wip=1 offers no WIP character');
    else {
      await set({ character: wips[0], timeSpeed: 0 });
      const ok = await until(async () => (await inf()).character === wips[0], 15000);
      if (!ok) bad.push(`[tour] ?wip=1: ${wips[0]} did not load`);
      await sleep(800);
      steps.wip.loaded = ok ? wips[0] : null; steps.wip.shot = await shot(`wip-${wips[0]}`);
    }
    res.csp.push(...await cspViolations(page));
    const errs = await page.evaluate(() => window.__demo.errors ?? []);
    if (errs.length) bad.push(...errs.map((e) => `[__demo] ${e}`));
    for (const v of res.csp) bad.push('[csp] ' + v);
  } catch (e) { bad.push('TOUR FAILED: ' + e.message); }
  res.errors = bad; res.warnings = warn.slice(0, 20); res.ok = bad.length === 0;
  await page.close();
  return res;
}
if (TOUR) {
  const r = await tour();
  results.push(r);
  const st = r.steps;
  console.log(`${r.ok ? 'PASS' : 'FAIL'} tour         ready ${st.readyMs ?? '-'} ms | loading ${st.loading ? 'seen' : '-'}, cinematic ${st.cinematic?.phase ?? '-'}, ` +
    `walked ${st.walk?.moved ?? '-'} m, chars ${(st.chars ?? []).map((c) => c.id).join('/')}, houses ${(st.houses ?? []).map((h) => h.id).join('/')}, ` +
    `night ${st.night?.tod ?? '-'}, wip ${st.wip?.loaded ?? '-'} of [${st.wip?.offered ?? ''}] | csp violations ${r.csp?.length ?? '-'}`);
  console.log(`   offered (public): ${(st.offered ?? []).length}: ${(st.offered ?? []).join(', ')}`);
  for (const e of r.errors) console.log('   ! ' + e.slice(0, 400));
}
console.log(`csp violations: ${results.reduce((a, r) => a + (r.csp?.length ?? 0), 0)} (securitypolicyviolation events) over ${results.length} runs` +
  (EXPECT_CSP ? '; header checked on every document' : ''));
if (results[0]?.gpu) console.log('gpu:', JSON.stringify(results[0].gpu));
if (results[0]?.doorMismatch?.length) console.log('known town issue, doorMismatch:', JSON.stringify(results[0].doorMismatch));
fs.writeFileSync(path.join(OUT, 'smoke.json'), JSON.stringify({ when: new Date().toISOString(), size: `${W}x${H}`, base: BASE, page: PAGE, secs: SECS, uncapped: UNCAPPED, results }, null, 1));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `SMOKE FAILED: ${failed}/${results.length}` : `SMOKE OK: ${results.length}/${results.length}`, '->', OUT);
process.exit(failed ? 1 : 0);
