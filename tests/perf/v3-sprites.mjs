// v3.3 sprites prototype bench, NODE side. Drives tests/perf/v3-sprites-page.ts in Chromium against a Vite DEV
// server of this repo (started on the build host: `pnpm --filter @ct/client exec vite --port <p> --strictPort
// --host 127.0.0.1`, reached through an SSH tunnel), so the browser can run on a machine with a real GPU.
//
//   node tests/perf/v3-sprites.mjs --base http://127.0.0.1:3486 --root <repo path ON THE VITE HOST> --out <dir>
//     [--gl gpu|swiftshader] [--cdp http://127.0.0.1:<port>] (connect to a running Chrome instead of launching)
//     [--ids frog,fox,owl,...] [--tiers low,cpu] [--only build,cost,stills,throttle] [--frames 120]
// Playwright: PW_MODULE (default 'playwright-core'); a local browser: --exe <chromium path>.
// Output: <out>/sprites-<tag>.json, stills <out>/still-<scene>-<rig|sprite|diff>.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const BASE = arg('base', 'http://127.0.0.1:3486');
const ROOT = arg('root', '');
const OUT = path.resolve(arg('out', 'test-results/v3-sprites'));
const TAG = arg('tag', 'run');
const ONLY = arg('only', 'build,cost,stills,throttle').split(',');
const IDS = arg('ids', 'frog,fox,owl,crow,moth,goat,rabbit,toad,cilantro,clarabelle,opal,progress,requin,mincut,storyteller').split(',');
const TIERS = arg('tiers', 'low').split(',');
const FRAMES = Number(arg('frames', '120'));
const pw = require(process.env.PW_MODULE || 'playwright-core');
const { PNG } = require(process.env.PNG_MODULE || 'pngjs');
const log = (...a) => console.error(`[v3-sprites ${new Date().toISOString().slice(11, 19)}]`, ...a);
mkdirSync(OUT, { recursive: true });
if (!ROOT) throw new Error('--root <repo path on the Vite host> is required');

const GL = arg('gl', 'gpu') === 'gpu' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const results = { base: BASE, tag: TAG, ids: IDS, runs: [] };
const save = () => writeFileSync(path.join(OUT, `sprites-${TAG}.json`), JSON.stringify(results, null, 1));

function png(url) {
  return PNG.sync.read(Buffer.from(url.split(',')[1], 'base64'));
}
/** Pixel diff of two PNGs: pixels whose max channel difference > tol; writes a diff image (red = differs). */
function diff(a, b, file, tol = 6) {
  const out = new PNG({ width: a.width, height: a.height });
  let n = 0;
  let any = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    const g = (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 9;
    if (d > 0) any++;
    if (d > tol) {
      n++;
      out.data.set([255, 0, 0, 255], i);
    } else out.data.set([g, g, g, 255], i);
  }
  writeFileSync(file, PNG.sync.write(out));
  return { px: a.width * a.height, differ: n, differPct: +((100 * n) / (a.width * a.height)).toFixed(3), anyDiff: any };
}

async function main() {
  let browser;
  if (arg('cdp', '')) browser = await pw.chromium.connectOverCDP(arg('cdp', ''));
  else browser = await pw.chromium.launch({ headless: true, executablePath: arg('exe', undefined), args: [...GL, '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error' || /sprite|bake/i.test(m.text())) errors.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  await page.route(/\/(api|healthz|matchmake)(\/|$|\?)/, (r) => r.fulfill({ status: 204, body: '' }));
  await page.route(`${BASE}/__v3spr.html`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>v3 sprites</title><body style="margin:0;background:#000"></body>' }));
  await page.goto(`${BASE}/__v3spr.html`);
  const cdp = await ctx.newCDPSession(page);
  await page.evaluate(async (u) => {
    await import(/* @vite-ignore */ u);
  }, `/@fs${ROOT}/tests/perf/v3-sprites-page.ts`);
  await page.waitForFunction(() => !!window.__v3spr?.ready, null, { timeout: 300_000 });
  const call = (fn, cfg) => page.evaluate(([f, c]) => window.__v3spr[f](c), [fn, cfg]);
  log('page ready');

  for (const tier of TIERS) {
    const run = { tier, errors };
    results.runs.push(run);
    run.mount = await call('mount', { tier, tod: 'noon' });
    log('mounted', JSON.stringify(run.mount));
    for (const mode of ['rig', 'sprite']) {
      const sprites = mode === 'sprite';
      await call('layer', { sprites, ids: IDS, cold: arg('warm', '0') !== '1', keepKits: arg('keepKits', '1') === '1', persist: arg('persist', '1') === '1' });
      const t0 = Date.now();
      run[`${mode}Build`] = await call('settle', {});
      log(mode, 'built in', Date.now() - t0, 'ms', JSON.stringify(run[`${mode}Build`]).slice(0, 400));
      if (sprites && arg('rejoin', '1') === '1') {
        // a repeat join: a fresh layer (no kits) with the persistent cache of the first join (after every sheet of the
        // first join was stored: the store writes in the background, one sheet at a time)
        const tw = Date.now();
        for (;;) {
          const st = (await call('atlasDump', {})).store;
          if (!st || st.stored + st.storeFails >= st.bakes || Date.now() - tw > 60000) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        run.spriteStoreMs = Date.now() - tw;
        log('sprite sheets stored in', run.spriteStoreMs, 'ms');
        await call('layer', { sprites, ids: IDS, cold: false, keepKits: arg('keepKits', '1') === '1', persist: arg('persist', '1') === '1' });
        run.spriteRejoin = await call('settle', {});
        log('sprite rejoin', JSON.stringify(run.spriteRejoin).slice(0, 600));
      }
      if (ONLY.includes('cost')) {
        run[`${mode}Cost`] = {
          idle: await call('cost', { walking: false, frames: FRAMES }),
          walk: await call('cost', { walking: true, frames: FRAMES }),
          idleUncapped: await call('cost', { walking: false, frames: FRAMES, uncapped: true }),
          walkUncapped: await call('cost', { walking: true, frames: FRAMES, uncapped: true }),
        };
        log(mode, 'cost', JSON.stringify(run[`${mode}Cost`]));
      }
      if (ONLY.includes('fps')) {
        run[`${mode}Fps`] = { idle: await call('fps', { walking: false, seconds: Number(arg('fpsS', '10')) }), walk: await call('fps', { walking: true, seconds: Number(arg('fpsS', '10')) }) };
        log(mode, 'fps', JSON.stringify(run[`${mode}Fps`]));
      }
      if (ONLY.includes('throttle')) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        run[`${mode}CostX4`] = {
          walk: await call('cost', { walking: true, frames: 60 }),
          walkUncapped: await call('cost', { walking: true, frames: 60, uncapped: true }),
        };
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        log(mode, 'x4', JSON.stringify(run[`${mode}CostX4`]));
      }
      run[`${mode}Info`] = await call('info', {});
      if (ONLY.includes('atlas') && sprites) {
        const zlib = require('node:zlib');
        const d = await call('atlasDump', {});
        run.atlas = d.sheets.map((s) => {
          const raw = Buffer.concat(s.planes.map((p) => Buffer.from(p, 'base64')));
          const br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
          return { id: s.id, w: s.w, h: s.h, raw: raw.length, br };
        });
        log('atlas', JSON.stringify(run.atlas), 'total br', run.atlas.reduce((a, b) => a + b.br, 0));
      }
      if (ONLY.includes('vote')) {
        run[`${mode}VoteCam`] = await call('voteCam', { viewHeight: 12.887, pitchDeg: 23, yawDeg: 45, maxMs: sprites ? 20000 : 1000 });
        log(mode, 'vote camera', JSON.stringify(run[`${mode}VoteCam`]));
        run[`${mode}VoteCost`] = await call('cost', { walking: false, frames: 60 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        run[`${mode}VoteCostX4`] = await call('cost', { walking: false, frames: 60 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        log(mode, 'vote cost', JSON.stringify(run[`${mode}VoteCost`]), JSON.stringify(run[`${mode}VoteCostX4`]));
        await call('mount', { tier, tod: 'noon' });
      }
      save();
    }
    if (ONLY.includes('night')) {
      // the town light pool at night (lanterns) and the ghosts (shared / clips / tint looks), both modes
      for (const mode of ['rig', 'sprite']) {
        await call('mount', { tier, tod: 'night' });
        await call('layer', { sprites: mode === 'sprite', ids: IDS, cold: false, keepKits: arg('keepKits', '1') === '1' });
        await call('settle', {});
        run[`${mode}Night`] = { walkUncapped: await call('cost', { walking: true, frames: FRAMES, uncapped: true }), idleUncapped: await call('cost', { walking: false, frames: FRAMES, uncapped: true }) };
        await call('ghosts', { dead: true });
        await call('cost', { walking: false, frames: 120 });
        run[`${mode}NightGhosts`] = { walkUncapped: await call('cost', { walking: true, frames: FRAMES, uncapped: true }), idleUncapped: await call('cost', { walking: false, frames: FRAMES, uncapped: true }) };
        log(mode, 'night', JSON.stringify(run[`${mode}Night`]), 'ghosts', JSON.stringify(run[`${mode}NightGhosts`]));
        save();
      }
      await call('mount', { tier, tod: 'noon' });
    }
    if (ONLY.includes('stills')) {
      // same moment, same positions: rigs first (record each one's drawing), then sprites pinned to those drawings
      const scenes = [
        { name: 'day-idle', tod: 'noon' },
        { name: 'day-walk', tod: 'noon', walking: true },
        { name: 'day-talk', tod: 'noon', talk: true },
        { name: 'day-ghost', tod: 'noon', dead: true },
        { name: 'dying', tod: 'noon', dying: true },
        { name: 'vote', tod: 'noon', hands: true, voteCam: true },
        { name: 'golden', tod: 'golden' },
        { name: 'night', tod: 'night' },
        { name: 'night-ghost', tod: 'night', dead: true },
      ].filter((sc) => !arg('scenes', '') || arg('scenes', '').split(',').includes(sc.name));
      const ids = IDS.slice(0, Number(arg('stillN', '6')));
      run.stills = {};
      let curTod = 'noon';
      for (const sc of scenes) {
        if (sc.tod !== curTod) {
          await call('mount', { tier, tod: sc.tod });
          curTod = sc.tod;
        }
        const shots = {};
        for (const mode of ['rig', 'sprite']) {
          await call('layer', { sprites: mode === 'sprite', ids, rk: 0.22 });
          await call('settle', {});
          if (sc.voteCam) await call('voteCam', { viewHeight: 12.887, pitchDeg: 23, yawDeg: 45, maxMs: mode === 'sprite' ? 20000 : 500 });
          if (sc.hands) await call('hands', { on: true });
          if (sc.dead || sc.dying) await call('ghosts', { dead: true });
          if (sc.talk) await call('talk', { on: true, n: 3 });
          let pin = null;
          if (mode === 'sprite' && shots.rig) {
            pin = {};
            for (const a of shots.rig.avatars) {
              const f = String(a.frame ?? '').split('|');
              const spec = String(a.texture ?? '').replace(/^v3:/, '');
              if (f.length === 3) pin[spec] = f[0] === 'vote' ? 'vote' : `${f[0]}:${f[2]}`;
            }
          }
          shots[mode] = await call('still', { pin, walking: !!sc.walking, frames: sc.dead ? 120 : 40 });
          if (sc.hands) await call('hands', { on: false });
          if (sc.voteCam) await call('mount', { tier, tod: sc.tod });
          writeFileSync(path.join(OUT, `still-${tier}-${sc.name}-${mode}.png`), Buffer.from(shots[mode].url.split(',')[1], 'base64'));
        }
        const d = diff(png(shots.rig.url), png(shots.sprite.url), path.join(OUT, `still-${tier}-${sc.name}-diff.png`));
        run.stills[sc.name] = { ...d, rig: shots.rig.avatars.map((a) => a.frame), sprite: shots.sprite.avatars.map((a) => a.frame) };
        log('still', sc.name, JSON.stringify(d));
        save();
      }
    }
  }
  save();
  await browser.close();
  log('done', errors.length, 'errors');
}
main().catch((e) => {
  log('FAILED', e);
  save();
  process.exit(1);
});
