// Load-time harness: the same browser context loads demo.html N times (localStorage / HTTP cache persist between
// loads, like a collaborator reloading or switching quality), printing the boot timeline of each load.
//   node tools/demo-perf-reload.mjs [--q "quality=low"] [--n 3] [--throttle 1]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const bad = [];
page.on('pageerror', (e) => bad.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') bad.push(m.text()); });
await page.route('http://pixel3d.local/**', (route) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
const cdp = await ctx.newCDPSession(page);
if (Number(opt('throttle', 1)) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt('throttle')) });
const rows = [];
for (let i = 0; i < Number(opt('n', 3)); i++) {
  await page.goto(`http://pixel3d.local/demo.html?intro=0${opt('q', '') ? '&' + opt('q') : ''}`);
  await page.waitForFunction(() => window.__demo?.ready || window.__demo?.errors?.length, null, { timeout: 240000 });
  const r = await page.evaluate(() => ({ marks: Object.fromEntries((window.__demo.loadMarks ?? []).map(([k, at, took]) => [k, took ?? at])), ready: Math.round(performance.now()),
    cache: window.__demo.demo?.engine?.stats?.demoRosterCache ?? null, roster: window.__demo.demo?.engine?.stats?.demoRosterMs ?? null, thumbs: (window.__demo.demo?.characters ?? []).filter((c) => c.thumb).length }));
  rows.push(r);
  console.log(`load ${i + 1}: ready ${r.ready} ms, town ${r.marks.town}, characters ${r.marks.characters} (exercise ${r.roster}, cache ${JSON.stringify(r.cache)}), thumbs ${r.thumbs}, warm-up ${r.marks['warm-up']}`);
}
console.log(JSON.stringify({ rows, errors: bad.slice(0, 10) }));
await browser.close();
process.exit(bad.length ? 1 : 0);
