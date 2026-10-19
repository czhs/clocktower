// Demo lead's headless check (runs on render-host via tools/remote.sh). Loads demo.html in REAL TIME (no capture mode),
// waits for window.__demo.ready, lets it run, optionally holds keys, screenshots the whole page (canvas + UI).
//   node tools/demo-lead.mjs <out.png> [--size 1280x720] [--wait 3000] [--q "tod=night&char=keeper"]
//        [--keys "KeyW:1500,KeyD:800"] (hold each key for N ms, in order, after the wait; one screenshot at the end)
//        [--set '{"character":"hound"}'] (store.set after the wait, then --after ms) [--shots 2] (extra screenshots 1 s apart) [--timeout 120000]
// Exit 1 on any console error / pageerror / __demo.errors / shader error. Serves the repo via request interception.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const out = args[0];
if (!out || out.startsWith('--')) { console.error('usage: demo-lead.mjs <out.png> [opts]'); process.exit(2); }
const [W, H] = opt('size', '1280x720').split('x').map(Number);
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
let code = 0;
try {
  const t0 = Date.now();
  await page.goto(`http://pixel3d.local/demo.html${opt('q', '') ? '?' + opt('q', '') : ''}`);
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors.length), null, { timeout: Number(opt('timeout', '120000')) });
  console.log('ready after', Date.now() - t0, 'ms');
  await page.waitForTimeout(Number(opt('wait', '3000')));
  if (opt('set', '')) { await page.evaluate((p) => window.__demo.set(JSON.parse(p)), opt('set', '')); await page.waitForTimeout(Number(opt('after', '1500'))); }
  for (const k of (opt('keys', '') || '').split(',').filter(Boolean)) {
    const [key, ms] = k.split(':');
    await page.keyboard.down(key.replace(/^Key/, '').length === 1 ? key.replace(/^Key/, '').toLowerCase() : key);
    await page.waitForTimeout(Number(ms || 500));
    await page.keyboard.up(key.replace(/^Key/, '').length === 1 ? key.replace(/^Key/, '').toLowerCase() : key);
  }
  if (opt('keys', '')) await page.waitForTimeout(600);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const n = Number(opt('shots', '1'));
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? out.replace(/\.png$/, `-${i}.png`) : out;
    await page.screenshot({ path: f });
    console.log('wrote', f);
    if (i < n - 1) await page.waitForTimeout(1000);
  }
  const info = await page.evaluate(() => {
    const d = window.__demo, i = d.info?.();
    if (i?.engine) i.engine = { low: i.engine.low, scale: i.engine.scale, calls: i.engine.calls, tris: i.engine.tris, programs: i.engine.programs, frameMs: i.engine.frameMs, gpu: i.engine.gpu,
      buildMs: i.engine.stats?.demoBuildMs, compileMs: i.engine.stats?.demoCompileMs, pieces: Object.fromEntries(Object.entries(i.engine.stats?.pieces ?? {}).filter(([, v]) => v[3] !== 'ok')), doorMismatch: i.engine.stats?.doorMismatch };
    if (i?.state) i.state.seats = i.state.seats.map((s) => (s.occupied ? 1 : 0) + (s.dead ? 2 : 0)).join('');
    return { errors: d.errors, frames: d.frames, info: i };
  });
  console.log('demo:', JSON.stringify(info));
  if (info.errors?.length) { bad.push(...info.errors.map((e) => `[__demo] ${e}`)); }
} catch (e) { bad.push('CHECK FAILED: ' + e.message); }
if (logs.length) console.log('console:\n' + logs.slice(0, 40).join('\n'));
if (bad.length) { console.error('ERRORS:\n' + bad.slice(0, 40).join('\n')); code = 1; }
await browser.close();
process.exit(code);
