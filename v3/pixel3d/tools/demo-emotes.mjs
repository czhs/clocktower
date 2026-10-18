// Which offered characters carry the FULL game emote set (talk, vote, point, die, ghost + a signature)? (owner: ui;
// docs/DEMO.md §4.7: the default spawn character must have all six, critic P1-2). Loads demo.html headless on render-host,
// swaps through the offered roster and prints each handle's emote map.
//   node tools/demo-emotes.mjs [--ids fox,frog,owl]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.route('http://pixel3d.local/**', (route) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
});
await page.goto('http://pixel3d.local/demo.html?intro=0&npcs=0');
await page.waitForFunction(() => window.__demo?.ready, null, { timeout: 120000 });
const ids = opt('ids', '') ? opt('ids').split(',') : await page.evaluate(() => window.__demo.demo.characters.filter((c) => c.complete && c.offered !== false && c.status !== 'wip').map((c) => c.id));
const full = [];
for (const id of ids) {
  const r = await page.evaluate(async (id) => {
    const d = window.__demo.demo;
    await d.player.setCharacter(id);
    const h = d.player.handle;
    const e = h?.emotes ?? {}, ok = (k) => !!(e[k] && h.spec?.clips?.[e[k]]);
    return { id: h?.id, emotes: Object.fromEntries(['talk', 'vote', 'point', 'die', 'ghost', 'signature'].map((k) => [k, ok(k) ? e[k] : null])) };
  }, id);
  const all = Object.values(r.emotes).every(Boolean);
  if (all) full.push(id);
  console.log(`${id.padEnd(14)} ${all ? 'FULL' : '    '} ${JSON.stringify(r.emotes)}`);
}
console.log('full set:', full.join(' '));
await browser.close();
