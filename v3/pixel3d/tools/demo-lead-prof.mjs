// Demo lead diagnostic: per-updater CPU time + pipeline time for N frames of the running demo (real-time page).
//   node tools/demo-lead-prof.mjs [--q "tod=night"] [--frames 20]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.route('http://pixel3d.local/**', (route) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
  if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
await page.goto(`http://pixel3d.local/demo.html?${opt('q', '')}`);
await page.waitForFunction(() => window.__demo?.ready, null, { timeout: 120000 });
await page.waitForTimeout(3000);
const r = await page.evaluate((n) => {
  const e = window.__demo.demo.engine, ups = e.updaters, acc = ups.map(() => 0);
  const orig = ups.slice();
  ups.forEach((fn, i) => { ups[i] = (...a) => { const t0 = performance.now(); fn(...a); acc[i] += performance.now() - t0; }; });
  const gl = e.renderer.getContext(), px = new Uint8Array(4);
  let pipe = 0, total = 0, sun = 0;
  const t0 = e.time;
  for (let k = 0; k < n; k++) {
    const a = performance.now();
    e.renderAt(t0 + (k + 1) / 60);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    total += performance.now() - a;
  }
  orig.forEach((fn, i) => { ups[i] = fn; });
  const rows = acc.map((v, i) => [i, +(v / n).toFixed(2), String(orig[i]).slice(0, 90).replace(/\s+/g, ' ')]).sort((x, y) => y[1] - x[1]).slice(0, 8);
  return { meanFrameMs: +(total / n).toFixed(2), updaters: ups.length, top: rows, programs: e.renderer.info.programs.length, lights: e.scene.children.filter(o=>o.name==='town-lights').length };
}, Number(opt('frames', 20)));
console.log(JSON.stringify(r, null, 1));
await browser.close();
