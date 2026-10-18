// Evaluate expressions in a live demo page (owner: ui; a debugging aid). Loads demo.html headless on render-host, waits for
// ready, runs each --js expression (page context, awaited) and prints its JSON.
//   node tools/demo-eval.mjs [--q "tod=night"] [--size 1280x720] [--wait 2000] --js "<expr>" [--js "<expr>" ...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const all = (k) => args.flatMap((a, i) => (a === '--' + k ? [args[i + 1]] : []));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text()); });
await page.route('http://pixel3d.local/**', (route) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
await page.goto(`http://pixel3d.local/demo.html?intro=0${opt('q', '') ? '&' + opt('q') : ''}`);
await page.waitForFunction(() => window.__demo?.ready || window.__demo?.errors?.length, null, { timeout: 120000 });
await page.waitForTimeout(Number(opt('wait', '2000')));
for (const js of all('js')) {
  try { console.log(js.slice(0, 80), '=>', JSON.stringify(await page.evaluate(`(async () => (${js}))()`), null, 1)); } catch (e) { console.log(js.slice(0, 80), '=> ERROR', e.message.split('\n')[0]); }
}
await browser.close();
