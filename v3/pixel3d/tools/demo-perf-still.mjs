// Before / after stills for the perf work: the demo in CAPTURE mode (no real-time loop; every frame is renderAt(t) at
// fixed times, so two variants render the same t), one PNG per variant, plus a pixel diff (python3 + PIL + numpy).
//   node tools/demo-perf-still.mjs <outdir> [--q "tod=night&quality=low"] [--t 5] [--variants ",rtopt=0"]
//        [--steps "location=house-8:2,location=town:2"]   (store.set then N seconds of 60 fps frames, before the still)
// Writes <outdir>/<name>-<variant>.png and <outdir>/<name>-diff.png; prints changed-pixel counts.
// Exit 1 on any console / page error.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const outdir = args[0];
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const T = Number(opt('t', '5'));
const name = opt('name', 'still');
const variants = opt('variants', ',rtopt=0').split(',');
const steps = opt('steps', '').split(',').filter(Boolean).map((s) => { const [kv, sec] = s.split(':'); const [k, v] = kv.split('='); return { k, v, sec: Number(sec || 2) }; });
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const bad = [], files = [];
for (const [vi, v] of variants.entries()) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => bad.push(`[${v}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') bad.push(`[${v}] ${m.text()}`); });
  await page.route('http://pixel3d.local/**', (route) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
  const q = ['capture=1', 'intro=0', 'ui=0', opt('q', ''), v].filter(Boolean).join('&');
  await page.goto(`http://pixel3d.local/demo.html?${q}`);
  await page.waitForFunction(() => window.__demo?.ready || window.__demo?.errors?.length, null, { timeout: 240000 });
  const info = await page.evaluate(async ([T, steps]) => {
    const d = window.__demo.demo, e = d.engine;
    let t = 1 / 60;
    for (const s of steps) {
      d.store.set({ [s.k]: s.v }, 'test');
      const n = Math.round(s.sec * 60);
      for (let i = 0; i < n; i++) { t += 1 / 60; e.renderAt(t); await (i % 30 === 29 ? new Promise((r) => setTimeout(r, 0)) : null); }
    }
    // a few frames up to T, then T itself twice (stepped / held drawings settle identically)
    for (const x of [T - 0.05, T - 1 / 60, T]) e.renderAt(Math.max(t + 1 / 60, x));
    for (const id of ['demo-ui', 'demo-loading', 'demo-boot', 'demo-fade']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
    for (const el of document.querySelectorAll('body > div')) if (!el.querySelector('canvas')) el.style.visibility = 'hidden';
    return { loc: d.player?.location, programs: e.renderer.info.programs.length, calls: e.renderer.info.render.calls, park: d.townPark?.parked ?? null };
  }, [T, steps]);
  const f = path.join(outdir, `${name}-${v ? v.replace(/[^\w]+/g, '') : 'opt'}${variants.indexOf(v) !== vi ? '-' + vi : ''}.png`);
  await page.screenshot({ path: f });
  console.log('wrote', f, JSON.stringify(info));
  files.push(f);
  await page.close();
}
await browser.close();
if (files.length === 2) {
  const py = `
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int); b = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
d = np.abs(a - b).max(axis=2)
m = d > 0
print('diff: %d px changed (%.3f%%), max %d' % (m.sum(), 100.0 * m.mean(), d.max()))
out = (np.where(m[..., None], [255, 0, 255], a // 3)).astype(np.uint8)
Image.fromarray(out).save(sys.argv[3])
`;
  const r = spawnSync('python3', ['-c', py, files[0], files[1], path.join(outdir, `${name}-diff.png`)], { encoding: 'utf8' });
  process.stdout.write(r.stdout + r.stderr);
}
if (bad.length) { console.error('ERRORS:\n' + bad.join('\n')); process.exit(1); }
