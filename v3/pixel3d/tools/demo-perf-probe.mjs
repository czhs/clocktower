// Perf probe: load demo.html (real time), wait for ready + settle, evaluate a probe script (a JS file whose text is an
// async function body receiving `demo`; its return value is printed as JSON).
//   node tools/demo-perf-probe.mjs <probe.js> [--q "tod=night"] [--settle 2500] [--throttle 1]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const body = fs.readFileSync(args[0], 'utf8');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const bad = [];
page.on('pageerror', (e) => bad.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') bad.push(m.text()); });
await page.route('http://pixel3d.local/**', (route) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
if (Number(opt('throttle', 1)) > 1) { const c = await page.context().newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: Number(opt('throttle')) }); }
await page.goto(`http://pixel3d.local/demo.html?intro=0${opt('q', '') ? '&' + opt('q') : ''}`);
await page.waitForFunction(() => window.__demo?.ready || window.__demo?.errors?.length, null, { timeout: 240000 });
await page.waitForTimeout(Number(opt('settle', 2500)));
const r = await page.evaluate(async (src) => { const fn = new (Object.getPrototypeOf(async function () {}).constructor)('demo', src); return await fn(window.__demo.demo); }, body);
console.log(JSON.stringify({ result: r, errors: bad.slice(0, 10) }, null, 1));
await browser.close();
