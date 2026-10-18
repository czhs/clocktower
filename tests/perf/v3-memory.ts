// v3 perf recon, front "chars" (CT_AGENT=v3-perf-chars): characters + overlay + memory, measured on the real
// game3d pieces (vendor/engineHost + vendor/town + avatars/layer + overlay) WITHOUT TownGame3d, in ONE headless
// Chromium on SwiftShader (CPU only; never GPU flags on the game host). Serves apps/client with Vite DEV on
// 127.0.0.1:<port> and loads tests/perf/v3-chars-page.ts through /@fs/ (never part of the app or dist/).
//
// Scenarios (--only, comma list; default all):
//   cost     N = 0 / 1 / 5 / 15 rigs (distinct specs) idle + walking on the plaza ring, 15 ghosts (+ revival
//            rebuild), 15 same-spec rigs, 15 billboards, 5 talkers (FX canvas): per window layer.update ms,
//            render CPU ms, overlay ms, overlay writes / frame, alloc KiB / frame (approx.), calls / tris /
//            stage calls / programs / geometries / textures; build wall time, long tasks, programs added.
//   churn    one engine, --rounds x (15 players join, settle, leave): GPU memory / programs / heap per round.
//   cycles   --cycles x mount / destroy of a whole "lobby" (engine + town + 15 avatars + overlay): after each
//            destroy, forced GC, then JS heap, DOM nodes, JS event listeners (CDP Memory.getDOMCounters,
//            Performance.getMetrics) and retained object counts (CDP Runtime.queryObjects: WebGLRenderer,
//            Scene, SkinnedMesh, Mesh, BufferGeometry, Material, Texture, render targets, canvases, WebGL2 / 2D
//            contexts, ResizeObservers, images). Leak rule (INTEGRATION.md §1.3 step 5, §7): heap growth
//            < 10 MB from cycle 1 to cycle N, no retained WebGLRenderer / Scene / SkinnedMesh, canvases at baseline.
//   profile  after the cycles: one more mount, a V8 CPU profile of --pframes walking frames with 15 rigs
//            (summarise: npx tsx tests/perf/cpuprofile-summary.ts <out>/v3-walk15.cpuprofile --focus update,_step,...).
//
// Run ON THE HOST from the repo root, holding the heavy + browser locks for the whole measurement window:
//   CT_AGENT=v3-perf-chars scripts/remote.sh sh -c 'cat /proc/loadavg; flock $HOME/clocktower/v3-heavy.lock \
//     flock $HOME/clocktower/browser.lock nice -n 19 pnpm exec tsx tests/perf/v3-memory.ts --port 3490 \
//     --tier low --out test-results/v3-perf-chars; cat /proc/loadavg'
// Options: --port (3490; v3-perf-chars owns 3490-3491) --tier low|high --frames 60 --dt 0.016667 --cycles 5
//   --rounds 5 --groups empty,rig1,rig5,rig15,ghost15,same15,billboard15 --overlay yes|no --talkers 5
//   --viewHeight 19 --settleRenderEvery 8 --leakfix none|listener|full --pframes 120 --timeout-min 60 --out <dir>
// Output: <out>/v3-memory-<tier>[-leakfix-<mode>][-<tag>].json (+ .cpuprofile); --tag <name> keeps runs apart. Exit 0 = ran (and, for cycles, the leak rule held).
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';
import { REPO_ROOT } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const PORT = Number(arg('port', '3490'));
const TIER = arg('tier', 'low') === 'high' ? 'high' : 'low';
const ONLY = arg('only', 'cost,churn,cycles,profile').split(',');
const OUT = path.resolve(REPO_ROOT, arg('out', 'test-results/v3-perf-chars'));
const CYCLES = Number(arg('cycles', '5'));
const PFRAMES = Number(arg('pframes', '120'));
const TIMEOUT_MIN = Number(arg('timeout-min', '60'));
const pageCfg = {
  tier: TIER,
  frames: Number(arg('frames', '60')),
  dt: Number(arg('dt', String(1 / 60))),
  overlay: arg('overlay', 'yes') === 'yes',
  rounds: Number(arg('rounds', '5')),
  talkers: Number(arg('talkers', '5')),
  viewHeight: Number(arg('viewHeight', '19')),
  settleRenderEvery: Number(arg('settleRenderEvery', '8')),
  leakfix: arg('leakfix', 'none'),
  ...(argv.includes('--groups') ? { groups: arg('groups', '').split(',') } : {}),
};
const TAG = arg('tag', '');
const OUTFILE = path.join(OUT, `v3-memory-${TIER}${pageCfg.leakfix !== 'none' ? `-leakfix-${pageCfg.leakfix}` : ''}${TAG ? `-${TAG}` : ''}.json`);
const PROFILE_FILE = path.join(OUT, `v3-walk15-${TIER}${pageCfg.leakfix !== 'none' ? `-leakfix-${pageCfg.leakfix}` : ''}${TAG ? `-${TAG}` : ''}.cpuprofile`);
if (PORT < 3490 || PORT > 3494) throw new Error('--port must be in the v3-perf-chars / v3-perf-client range 3490-3494');
// --gl swiftshader (default, the recon method) | gpu (the host GPU via ANGLE/Vulkan, allowed since 2026-10-18)
const GL_ARGS = arg('gl', 'swiftshader') === 'gpu' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const BASE = `http://127.0.0.1:${PORT}`;
const log = (...a: unknown[]) => console.error(`[v3-memory ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

let vite: ChildProcess | null = null;
let browser: Browser | null = null;

async function cleanup() {
  try {
    await browser?.close();
  } catch (e) {
    log('browser close failed', (e as Error)?.message);
  }
  browser = null;
  if (vite && vite.exitCode === null && vite.pid) {
    for (const sig of ['SIGTERM', 'SIGKILL'] as const) {
      try {
        process.kill(-vite.pid, sig);
      } catch {
        /* gone */
      }
      await sleep(400);
    }
  }
  vite = null;
}

async function waitForVite() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/@vite/client`)).ok) return;
    } catch {
      /* not yet */
    }
    await sleep(500);
  }
  throw new Error('vite did not come up');
}

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
  const r = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
}

const PROTOS = ['Engine', 'WebGLRenderer', 'Scene', 'SkinnedMesh', 'Mesh', 'BufferGeometry', 'Material', 'Texture', 'WebGLRenderTarget', 'Skeleton', 'HTMLCanvasElement', 'WebGL2RenderingContext', 'CanvasRenderingContext2D', 'ResizeObserver', 'HTMLImageElement'];

/** Live objects whose prototype chain contains window.__v3protos[name] (CDP Runtime.queryObjects). */
async function retained(cdp: CDPSession): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const name of PROTOS) {
    try {
      const ev = (await cdp.send('Runtime.evaluate', { expression: `window.__v3protos[${JSON.stringify(name)}]`, objectGroup: 'v3mem' })) as { result: { objectId?: string } };
      if (!ev.result.objectId) {
        out[name] = null;
        continue;
      }
      const qo = (await cdp.send('Runtime.queryObjects', { prototypeObjectId: ev.result.objectId, objectGroup: 'v3mem' })) as { objects: { objectId?: string } };
      const len = (await cdp.send('Runtime.callFunctionOn', { objectId: qo.objects.objectId!, functionDeclaration: 'function(){return this.length}', returnByValue: true })) as { result: { value: number } };
      out[name] = len.result.value;
    } catch (e) {
      out[name] = null;
      log('queryObjects', name, (e as Error).message);
    }
  }
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'v3mem' }).catch(() => undefined);
  return out;
}

async function memSnap(cdp: CDPSession, label: string) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(200);
  await cdp.send('HeapProfiler.collectGarbage');
  const m = await metrics(cdp);
  const dc = (await cdp.send('Memory.getDOMCounters')) as { documents: number; nodes: number; jsEventListeners: number };
  const objs = await retained(cdp);
  const s = { label, heapMiB: Math.round(((m.JSHeapUsedSize ?? 0) / 1048576) * 10) / 10, heapTotalMiB: Math.round(((m.JSHeapTotalSize ?? 0) / 1048576) * 10) / 10, domNodes: dc.nodes, documents: dc.documents, jsEventListeners: dc.jsEventListeners, retained: objs };
  log('mem', JSON.stringify(s));
  return s;
}

async function callPage<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return (await page.evaluate(([f, a]) => (window as unknown as Record<string, Record<string, (...x: unknown[]) => Promise<unknown>>>).__v3chars![f as string]!(...(a as unknown[])), [fn, args] as const)) as T;
}

async function main(): Promise<boolean> {
  const busy = await fetch(`${BASE}/`).then(
    () => true,
    () => false,
  );
  if (busy) throw new Error(`port ${PORT} is already in use (a leftover dev server?)`);
  const results: Record<string, unknown> = { at: new Date().toISOString(), tier: TIER, cfg: pageCfg, loadavgBefore: loadavg().map((x) => Math.round(x * 100) / 100), method: 'Vite DEV build of the working tree, headless Chromium, SwiftShader (CPU), 960x540, virtual 60 Hz time' };
  vite = spawn(process.execPath, [path.join(REPO_ROOT, 'apps/client/node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: path.join(REPO_ROOT, 'apps/client'),
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
  vite.stderr?.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  await waitForVite();
  log('vite up', BASE);
  browser = await chromium.launch({ args: [...GL_ARGS, '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors: string[] = [];
  const warns: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 400));
    if (m.type() === 'warning') warns.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 400)}`));
  // never reach the dev service through Vite's proxy
  await page.route(/\/(api|healthz|matchmake)(\/|$|\?)/, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(`${BASE}/__v3perf.html`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>v3 perf chars</title><body style="margin:0;background:#000"></body>' }));
  await page.goto(`${BASE}/__v3perf.html`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  const pageUrl = `/@fs${path.join(REPO_ROOT, 'tests/perf/v3-chars-page.ts')}`;
  await page.evaluate(async (u) => {
    localStorage.clear();
    await import(/* @vite-ignore */ u);
  }, pageUrl);
  await page.waitForFunction(() => !!(window as unknown as { __v3chars?: { ready: boolean } }).__v3chars?.ready, null, { timeout: 300_000 });
  log('page ready');
  let ok = true;

  if (ONLY.includes('cost')) {
    const t0 = Date.now();
    results.cost = await callPage(page, 'cost', pageCfg);
    log('cost done', Math.round((Date.now() - t0) / 1000), 's');
    writeFileSync(OUTFILE, JSON.stringify({ ...results, errors, warns: warns.slice(0, 40) }, null, 1));
  }
  if (ONLY.includes('churn')) {
    const t0 = Date.now();
    results.churn = await callPage(page, 'churn', pageCfg);
    log('churn done', Math.round((Date.now() - t0) / 1000), 's');
    writeFileSync(OUTFILE, JSON.stringify({ ...results, errors, warns: warns.slice(0, 40) }, null, 1));
  }
  if (ONLY.includes('cycles')) {
    const snaps: unknown[] = [await memSnap(cdp, 'baseline (page loaded, nothing mounted)')];
    const mounts: unknown[] = [];
    for (let k = 1; k <= CYCLES; k++) {
      const t0 = Date.now();
      const m = await callPage<Record<string, unknown>>(page, 'mount', pageCfg);
      const u = await callPage<Record<string, unknown>>(page, 'unmount');
      mounts.push({ cycle: k, wallS: Math.round((Date.now() - t0) / 100) / 10, ...m, after: u });
      log('cycle', k, JSON.stringify(m.live), JSON.stringify(u));
      snaps.push(await memSnap(cdp, `after destroy #${k}`));
    }
    const first = snaps[1] as { heapMiB: number; domNodes: number; jsEventListeners: number; retained: Record<string, number | null> };
    const last = snaps[snaps.length - 1] as typeof first;
    const base = snaps[0] as typeof first;
    const leak = {
      heapGrowthMiB_cycle1_to_N: Math.round((last.heapMiB - first.heapMiB) * 10) / 10,
      heapGrowthMiB_baseline_to_N: Math.round((last.heapMiB - base.heapMiB) * 10) / 10,
      domNodesGrowth: last.domNodes - base.domNodes,
      listenersGrowth_cycle1_to_N: last.jsEventListeners - first.jsEventListeners,
      retainedGrowth: Object.fromEntries(PROTOS.map((p) => [p, (last.retained[p] ?? 0) - (base.retained[p] ?? 0)])),
    };
    const pass = leak.heapGrowthMiB_cycle1_to_N < 10 && (leak.retainedGrowth.WebGLRenderer ?? 0) <= 0 && (leak.retainedGrowth.Scene ?? 0) <= 0 && (leak.retainedGrowth.SkinnedMesh ?? 0) <= 0 && (leak.retainedGrowth.HTMLCanvasElement ?? 0) <= 0;
    ok = ok && pass;
    results.cycles = { n: CYCLES, mounts, snaps, leak, pass };
    log('leak', JSON.stringify(leak), pass ? 'PASS' : 'FAIL');
    writeFileSync(OUTFILE, JSON.stringify({ ...results, errors, warns: warns.slice(0, 40) }, null, 1));
  }
  if (ONLY.includes('profile')) {
    await callPage(page, 'mount', pageCfg);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    const w = await callPage<Record<string, unknown>>(page, 'walk', PFRAMES, pageCfg);
    const { profile } = (await cdp.send('Profiler.stop')) as { profile: unknown };
    const file = PROFILE_FILE;
    writeFileSync(file, JSON.stringify(profile));
    await callPage(page, 'unmount');
    results.profile = { ...w, file: path.relative(REPO_ROOT, file) };
    log('profile', file);
  }
  results.loadavgAfter = loadavg().map((x) => Math.round(x * 100) / 100);
  results.errors = errors;
  results.warns = warns.slice(0, 40);
  writeFileSync(OUTFILE, JSON.stringify(results, null, 1));
  log('wrote', OUTFILE, 'errors', errors.length);
  return ok;
}

const watchdog = setTimeout(() => {
  log(`watchdog: ${TIMEOUT_MIN} min, aborting`);
  void cleanup().finally(() => process.exit(3));
}, TIMEOUT_MIN * 60_000);
let code = 1;
try {
  code = (await main()) ? 0 : 1;
} catch (e) {
  log('failed:', (e as Error)?.stack ?? e);
  code = 2;
} finally {
  await cleanup();
  clearTimeout(watchdog);
}
process.exit(code);
