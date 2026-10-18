// (OH) The overhead-stack STRESS shots (owner: ui; docs/DEMO.md §4.7 "Overhead stack"): the demo headless on
// render-host, 4 townsfolk close round the player (tools/demo-play-overhead.mjs setupStress), a full screenshot + a crop
// round the cluster per configuration, and gameui.info().overhead + its overlap test in a JSON next to them.
//   PIXEL3D_RDIR=pixel3d-hd2 tools/remote.sh node tools/demo-overhead.mjs --tag before|after [--cfg 720,1080,phone,d1]
//   PIXEL3D_RDIR=pixel3d-hd2 tools/pull.sh shots/overhead            # then LOOK at them
// Writes shots/overhead/<tag>-<cfg>.png, <tag>-<cfg>-crop.png, <tag>-<cfg>.json.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { setupStress, overheadOf, overlaps } from './demo-play-overhead.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = opt('out', 'shots/overhead'), TAG = opt('tag', 'after');
const CFG = {
  720: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, q: '' },
  1080: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, q: '' },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, q: '' },
  d1: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, q: '&uidensity=1' },
};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
let failed = 0;
for (const name of opt('cfg', '720,1080').split(',')) {
  const c = CFG[name];
  const { q, ...ctxOpts } = c;
  const ctx = await browser.newContext(ctxOpts);
  await ctx.route('http://pixel3d.local/**', (route) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://pixel3d.local/demo.html?intro=0&tod=noon&npcs=${opt('npcs', '3')}${q}`);
  await page.waitForFunction(() => window.__demo?.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__demo.set({ timeSpeed: 0 }));
  await page.waitForTimeout(2500);
  await setupStress(page, { ghosts: 2 });
  const f = path.join(OUT, `${TAG}-${name}.png`);
  await page.screenshot({ path: f });
  const ov = await overheadOf(page);
  const meta = await page.evaluate(() => {
    const d = window.__demo.demo, g = d.gameui.info(), c = d.engine.renderer.domElement.getBoundingClientRect();
    const you = g.members.find((m) => m.you);
    return { unit: g.unit, hd: g.hd, screen: g.screen, you: you?.screen ?? null, canvas: [c.left, c.top, c.width, c.height], fps: window.__demo.info?.()?.fps ?? null,
      members: g.members.map((m) => ({ name: m.name, label: m.label, bubble: m.bubble, screen: m.screen })), pops: g.pops, pins: g.personPins.length };
  });
  // the crop round the player (client px): 1/2 the width x 0.6 the height, centred on the player's screen point
  if (meta.you) {
    const ux = meta.canvas[0] + meta.you.x * meta.unit, uy = meta.canvas[1] + meta.you.y * meta.unit;
    const w = Math.round(c.viewport.width * 0.5), h = Math.round(c.viewport.height * 0.6);
    const x = Math.max(0, Math.min(c.viewport.width - w, Math.round(ux - w / 2))), y = Math.max(0, Math.min(c.viewport.height - h, Math.round(uy - h * 0.7)));
    await page.screenshot({ path: path.join(OUT, `${TAG}-${name}-crop.png`), clip: { x, y, width: w, height: h } });
  }
  const bad = ov ? overlaps(ov) : null;
  if (bad?.length) failed++;
  fs.writeFileSync(path.join(OUT, `${TAG}-${name}.json`), JSON.stringify({ meta, overhead: ov, overlaps: bad, errors: errs }, null, 1));
  console.log(`${name}: ${f} fps ${meta.fps} · rects ${ov ? ov.rects.filter((r) => r.who != null).length : 'n/a'} · overlaps ${bad ? bad.length : 'n/a'} · clashes ${ov?.clashes?.length ?? 'n/a'} · dropped ${ov?.dropped ?? 'n/a'} · errors ${errs.length}`);
  if (bad?.length) console.log('   ' + JSON.stringify(bad.slice(0, 8)));
  if (errs.length) console.log('   ' + errs.slice(0, 4).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `OVERHEAD STRESS: ${failed} configuration(s) with overlaps` : 'OVERHEAD STRESS OK');
