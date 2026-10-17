// UI atlas baker (owner: UI lead; runs on the render host via tools/uibake.sh). Loads scenes/ui-bake.js for one
// group, writes <out>/<group>.png + <group>.json + <group>-sheet.png and prints v2 frame-name coverage.
//   node tools/uibake.mjs <group>|<group>:<name> [--out shots/ui-<group>/bake] [--q "tod=night&width=512"] [--strict]
// --strict: exit 1 if any v2 frame name is missing (drop-in check). Same request-interception server as shot.mjs.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const group = args[0];
if (!group || group.startsWith('--')) { console.error('usage: uibake.mjs <group> [--out dir] [--q k=v&..] [--strict]'); process.exit(2); }
const [G0, SUB] = group.split(':');               // '<group>:<name>' = second atlas src/ui/<group>/<name>.bake.js
const NAME = SUB || G0;
const OUT = opt('out', `shots/ui-${G0}/bake`);
const extra = opt('q', '').replace(/#/g, '%23');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.route('http://pixel3d.local/**', (route) => {
  const u = new URL(route.request().url());
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
let code = 0;
try {
  await page.goto(`http://pixel3d.local/index.html?scene=ui-bake&group=${encodeURIComponent(group)}&capture=1${extra ? '&' + extra : ''}`);
  await page.waitForFunction(() => window.__pixel && (window.__pixel.ready || window.__pixel.errors.length), null, { timeout: 120000 });
  const errs = await page.evaluate(() => window.__pixel.errors);
  if (errs.length) throw new Error('PAGE ERRORS:\n' + errs.join('\n'));
  const r = await page.evaluate(() => window.__uibake);
  if (!r) throw new Error('no window.__uibake (bake module failed?)');
  fs.mkdirSync(OUT, { recursive: true });
  const b64 = (u) => Buffer.from(u.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, `${NAME}.png`), b64(r.png));
  fs.writeFileSync(path.join(OUT, `${NAME}-sheet.png`), b64(r.sheet));
  fs.writeFileSync(path.join(OUT, `${NAME}.json`), JSON.stringify(r.json, null, 1) + '\n');
  console.log(`wrote ${OUT}/${NAME}.png ${r.size.join('x')} (${r.frames} frames), ${NAME}.json, ${NAME}-sheet.png`);
  if (r.coverage) {
    const c = r.coverage;
    if (c.error) console.log('coverage: error', c.error);
    else {
      console.log(`coverage: ${c.v2 - c.missing.length}/${c.v2} v2 frame names present` + (c.missing.length ? `; MISSING: ${c.missing.join(', ')}` : '') +
        (c.extra.length ? `; extra (new-style only): ${c.extra.length}` : ''));
      if (c.missing.length && args.includes('--strict')) code = 1;
    }
  }
} catch (e) { console.error('BAKE FAILED:', e.message); code = 1; }
if (logs.length) console.log('console:\n' + logs.slice(0, 30).join('\n'));
await browser.close();
process.exit(code);
