// Interactive-controls smoke test for PixelCamera (runs on render-host via tools/remote.sh).
//   node tools/crawl.mjs [--scene _test-camera] [--size 1280x720] [--out shots/camera/controls]
// Loads the scene WITHOUT capture=1 (real rAF loop + enableControls), then drives the keyboard /
// mouse like a user: Q/E 45° rotation (incl. rapid double press), WASD pan, drag pan, wheel zoom ladder.
// Asserts the camera state after each step and saves a screenshot per step. Exit code 1 on failure.
// (Pixel crawl itself is checked by tools/crawl.py on deterministic captures.)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const scene = opt('scene', '_test-camera');
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const out = opt('out', 'shots/camera/controls');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
await page.route('http://pixel3d.local/**', async (route) => {
  const u = new URL(route.request().url());
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
await page.goto(`http://pixel3d.local/index.html?scene=${scene}&bob=0`);
await page.waitForFunction(() => window.__pixel && (window.__pixel.ready || window.__pixel.errors.length), null, { timeout: 60000 });
const state = () => page.evaluate(() => {
  const c = window.__pixel.camera;
  return { yawDeg: c.yaw * 180 / Math.PI, target: c.targetYaw * 180 / Math.PI, rotating: c.rotating, vh: c.viewHeight,
    tx: c.target.x, tz: c.target.z, exact45: Math.abs(c.yaw / (Math.PI / 4) - Math.round(c.yaw / (Math.PI / 4))) < 1e-12 };
});
const wait = (ms) => page.waitForTimeout(ms);
fs.mkdirSync(path.join(ROOT, out), { recursive: true });
let fails = 0, step = 0;
const check = async (name, cond, s) => {
  const ok = cond(s);
  if (!ok) fails++;
  await page.screenshot({ path: path.join(ROOT, out, `${String(step++).padStart(2, '0')}-${name}.png`) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(16)} ${JSON.stringify(s, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v))}`);
};
await wait(300);
const s0 = await state();
await check('initial', (s) => Math.abs(s.yawDeg - 45) < 1e-9, s0);
await page.mouse.move(W / 2, H / 2);
await page.keyboard.press('q');
await wait(30);
await check('q-mid', (s) => s.rotating && Math.abs(s.target - 90) < 1e-9, await state());
await wait(600);
await check('q-done', (s) => !s.rotating && Math.abs(s.yawDeg - 90) < 1e-9 && s.exact45, await state());
await page.keyboard.press('e'); await wait(40); await page.keyboard.press('e');   // rapid double press chains
await wait(800);
await check('ee-done', (s) => !s.rotating && Math.abs(s.yawDeg - 0) < 1e-9 && s.exact45, await state());
await page.keyboard.press('q'); await wait(700);
await check('q-back45', (s) => Math.abs(s.yawDeg - 45) < 1e-9, await state());
const before = await state();
await page.keyboard.down('d'); await wait(400); await page.keyboard.up('d');
await check('pan-d', (s) => Math.hypot(s.tx - before.tx, s.tz - before.tz) > 0.3, await state());
const b2 = await state();
await page.mouse.move(600, 360); await page.mouse.down(); await page.mouse.move(700, 360, { steps: 5 }); await page.mouse.up();
await check('drag', (s) => Math.hypot(s.tx - b2.tx, s.tz - b2.tz) > 0.5, await state());
await page.mouse.move(640, 360);
await page.mouse.wheel(0, 100); await wait(100);
await check('wheel-out', (s) => Math.abs(s.vh - 12) < 1e-9, await state());
await page.mouse.wheel(0, -100); await wait(50); await page.mouse.wheel(0, -100); await wait(100);
await check('wheel-in', (s) => Math.abs(s.vh - 9) < 1e-9, await state());
if (logs.length) { console.log(logs.join('\n')); fails++; }
console.log(fails ? `FAIL (${fails})` : 'PASS');
await browser.close();
process.exit(fails ? 1 : 0);
