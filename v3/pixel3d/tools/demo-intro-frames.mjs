// Capture the demo's opening cinematic as frames (owner: main session). Runs on render-host via tools/remote.sh:
//   tools/remote.sh node tools/demo-intro-frames.mjs [--out shots/intro-frames] [--fps 8]
// Loads demo.html?intro=1 in real time (repo served by request interception), waits for the flight, grabs a screenshot
// every 1/fps s until the title card, and reports frame gaps + shader programs. Exit 1 on console / page errors.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, opt('out', 'shots/intro-frames'));
const FPS = Number(opt('fps', '8'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const bad = [];
page.on('console', (m) => { if (m.type() === 'error' && !/computeBoundingSphere/.test(m.text())) bad.push(m.text()); });
page.on('pageerror', (e) => bad.push(String(e)));
await page.route('http://pixel3d.local/**', (route) => {
  const u = new URL(route.request().url());
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
await page.goto('http://pixel3d.local/demo.html?intro=1');
const phase = () => page.evaluate(() => window.__demo?.demo?.intro?.phase ?? null);
for (let i = 0; i < 600 && (await phase()) !== 'fly'; i++) await page.waitForTimeout(100);
let n = 0;
const poses = [];
while ((await phase()) === 'fly' && n < 200) {
  const p = await page.evaluate(() => { const c = window.__demo.demo.engine.camera; const i = window.__demo.demo.intro.info; return { stage: i.stage, yaw: +(c.yaw * 180 / Math.PI).toFixed(2), vh: +c.viewHeight.toFixed(2) }; });
  poses.push(p);
  await page.screenshot({ path: path.join(OUT, `f-${String(n).padStart(3, '0')}.png`) });
  n++;
  await page.waitForTimeout(1000 / FPS);
}
const info = await page.evaluate(() => window.__demo?.demo?.intro?.info ?? null);
console.log(JSON.stringify({ frames: n, phaseAfter: await phase(), programs: info?.programs, maxGapMs: info?.maxGapMs, slow: info?.slow,
  turn: poses.filter((p) => p.stage === 'turn').map((p) => p.yaw), descend: poses.filter((p) => p.stage === 'descend').map((p) => p.vh), errors: bad }));
await browser.close();
process.exit(bad.length ? 1 : 0);
