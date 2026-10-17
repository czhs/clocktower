// Demo lead: which shader programs compile AFTER the warm-up (runs on render-host via tools/remote.sh).
//   node tools/demo-lead-programs.mjs [--q "tod=noon&speed=0"] [--secs 40] [--set '{"timeSpeed":120}']
// Polls renderer.info.programs every 250 ms; for every program added / released prints its name, cacheKey head and
// the scene objects whose material currently uses it (renderer.properties). Exit 1 on console / page errors.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const bad = [];
page.on('console', (m) => { if (m.type() === 'error') bad.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => bad.push(`[pageerror] ${e.stack || e.message}`));
await page.route('http://pixel3d.local/**', (route) => {
  const u = new URL(route.request().url());
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
await page.goto(`http://pixel3d.local/demo.html${opt('q', '') ? '?' + opt('q', '') : ''}`);
await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors.length), null, { timeout: 120000 });
await page.evaluate(() => {
  const d = window.__demo.demo, r = d.engine.renderer;
  const owners = (prog) => {
    const out = [];
    const look = (o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        const p = r.properties.get(m);
        if (p.currentProgram === prog || (p.programs && [...p.programs.values()].includes(prog))) {
          const chain = []; let x = o; while (x && chain.length < 5) { chain.push(x.name || x.type); x = x.parent; }
          out.push(`${chain.join(' < ')} [${m.name || m.type}${o.visible ? '' : ' hidden'}]`);
        }
      }
    };
    d.engine.scene.traverse(look);
    return [...new Set(out)].slice(0, 6);
  };
  window.__progLog = [];
  let prev = new Set(r.info.programs);
  const t0 = performance.now();
  setInterval(() => {
    const now = new Set(r.info.programs);
    for (const p of now) if (!prev.has(p)) window.__progLog.push({ s: ((performance.now() - t0) / 1000).toFixed(1), hours: d.time?.hours?.toFixed?.(2), add: p.name, key: p.cacheKey.slice(0, 80), owners: owners(p), cam: d.store.state.camera, player: [d.player?.position.x.toFixed(1), d.player?.position.z.toFixed(1)] });
    for (const p of prev) if (!now.has(p)) window.__progLog.push({ s: ((performance.now() - t0) / 1000).toFixed(1), hours: d.time?.hours?.toFixed?.(2), del: p.name, key: p.cacheKey.slice(0, 80) });
    prev = now;
  }, 250);
  return r.info.programs.length;
}).then((n) => console.log('programs at ready:', n));
if (opt('set', '')) await page.evaluate((p) => window.__demo.set(JSON.parse(p)), opt('set', ''));
for (const k of (opt('keys', '') || '').split(',').filter(Boolean)) {
  const [key, ms] = k.split(':');
  await page.keyboard.down(key); await page.waitForTimeout(Number(ms || 500)); await page.keyboard.up(key);
}
await page.waitForTimeout(Number(opt('secs', '40')) * 1000);
const log = await page.evaluate(() => ({ log: window.__progLog, n: window.__demo.demo.engine.renderer.info.programs.length, errors: window.__demo.errors }));
for (const e of log.log) console.log(JSON.stringify(e));
console.log('programs at end:', log.n);
if (log.errors.length) bad.push(...log.errors);
if (bad.length) console.error('ERRORS:\n' + bad.join('\n'));
await browser.close();
process.exit(bad.length ? 1 : 0);
