// v3 perf recon, front "frame" (v3-perf-frame). Frame cost of the 3D town per quality tier, in Chromium on
// SwiftShader (CPU only: never GPU flags on the game host). Serves apps/client with Vite DEV (unminified: CPU / heap
// profiles attribute by source file), opens a blank same-origin page, mounts the REAL createTownGame3d over a fake
// connection (the C0 smoke's pattern, scripts/v3/smoke-mount.mjs) and measures, per tier:
//
//   census   scene + pipeline facts: canvas / low-res size, pixelScale, render targets, post passes, preRender hooks,
//            lights by type (visible, casting), shadow maps, meshes / instanced / casters, materials, programs by name
//   counts   per frame: draw calls, triangles, programs, pipeline.stageCalls (preRender / color / normal / post),
//            shadow-pass calls
//   split    per frame JS ms: RAF callback (game frame() + after()), the microtask tail after it, renderAt, vendor
//            updaters (+ top updaters), camera, sun, updateMatrixWorld, shadow / colour / normal / post / upscale
//            render() issue time, rAF delta p50 / p95, DOM mutations / s, JS heap min / max / drops
//   synced   back-to-back renderAt + a 1-px readPixels (SwiftShader raster included), optionally synced per pass
//   whatif   synced frame cost with one thing removed at a time (shadow render, half shadow map, normal pass, preRender
//            reflections, each post pass, all post, pixelScale + 1, point lights): ranks optimisations by raster share
//   cpu      V8 CPU profile of a window, self ms / frame by source bucket (three, pixel3d/<dir>, game3d/<dir>, GC, …)
//   heap     V8 sampling heap profile incl. objects already collected (minor + major GC): bytes allocated / frame,
//            top allocation sites
//   chars    the same counts / split / synced with K extra vendor characters walking around the player (per-character
//            draw calls and ms; `lite` at low like the stub)
//
// SwiftShader is CPU raster on a shared, loaded host: treat absolute ms / fps as a lower bound; compare counts and
// ratios (tier vs tier, pass vs pass, 0 vs K characters). The page reads /proc/loadavg before / after.
//
// Run ON THE HOST from the repo root, holding the heavy + browser locks for the WHOLE measurement:
//   CT_AGENT=v3-perf-frame scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
//     timeout 2400 nice -n 19 pnpm exec tsx tests/perf/v3-frame.ts --out test-results/v3-frame'
// A clean committed tree (no half-written files of a running swarm): scripts/perf/v3-frame-tree.sh <rev> [args].
// Budget preview of the JSON: node scripts/perf/v3-frame-budgets.mjs test-results/v3-frame/v3-frame.json
//
// Args: --port 3488 (v3-perf-frame range 3488-3489) --tiers high,low --viewport 1920x1080 --world v3 --players 14
//       --modes census,counts,split,synced,whatif,cpu,heap,chars --whatif-n 4 --secs 8 --frames 24 --chars 6 --char-ids wanderer,fox,hound
//       --walk yes --passes yes (per-pass synced) --root <tree> (default: this repo) --out <dir>
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const ROOT = path.resolve(arg('root', path.resolve(HERE, '../..')));
const PORT = Number(arg('port', '3488'));
// v3-perf-frame owns 3488-3489; v3-perf-client (the merged client front) runs it on its own 3490-3494
if (PORT < 3488 || PORT > 3494) throw new Error('v3-frame: ports 3488-3489 (v3-perf-frame) or 3490-3494 (v3-perf-client) only');
// --gl swiftshader (default: CPU raster, the recon method) | gpu (the host GPU via ANGLE/Vulkan, allowed since 2026-10-18)
const GL = arg('gl', 'swiftshader');
const GL_ARGS = GL === 'gpu' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const TIERS = arg('tiers', 'high,low').split(',') as ('high' | 'low')[];
const [VW, VH] = arg('viewport', '1920x1080').split('x').map(Number) as [number, number];
const WORLD = arg('world', 'v3');
const PLAYERS = Number(arg('players', '14'));
const MODES = new Set(arg('modes', 'census,counts,split,synced,whatif,cpu,heap,chars').split(','));
const WHATIF_N = Number(arg('whatif-n', '4'));
const SECS = Number(arg('secs', '8'));
const FRAMES = Number(arg('frames', '24'));
const CHARS = Number(arg('chars', '6'));
const CHAR_IDS = arg('char-ids', 'wanderer,fox,hound,goat,frog,mole').split(',');
const WALK = arg('walk', 'yes') === 'yes';
const PASSES = arg('passes', 'yes') === 'yes';
const OUT = path.resolve(arg('out', path.join(ROOT, 'test-results/v3-frame')));
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });
const log = (...a: unknown[]) => console.error(`[v3-frame ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r2 = (v: number) => Math.round(v * 100) / 100;
const load = () => {
  try {
    return readFileSync('/proc/loadavg', 'utf8').trim().split(' ').slice(0, 3).map(Number);
  } catch {
    return loadavg().map(r2);
  }
};

let vite: ChildProcess | null = null;
let browser: Browser | null = null;
const watchdog = setTimeout(() => {
  log('watchdog: 38 min, aborting');
  void cleanup().finally(() => process.exit(3));
}, 38 * 60_000);

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
  for (let i = 0; i < 160; i++) {
    try {
      if ((await fetch(`${BASE}/@vite/client`)).ok) return;
    } catch {
      /* not yet */
    }
    await sleep(500);
  }
  throw new Error('vite did not come up');
}

// ------------------------------------------------------------------ CPU profile buckets
type ProfNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] };
type Profile = { nodes: ProfNode[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number };
export function bucketOf(url: string, fn: string): string {
  if (!url) return fn.startsWith('(') ? fn : '(native)';
  const u = url.split('?')[0]!;
  // Vite DEV pre-bundles three into node_modules/.vite/deps/chunk-*.js (the only optimised dep on this page)
  if (/three(\.module)?(\.min)?\.js$|\/three\/build\/|\/\.vite\/deps\//.test(u)) return 'three';
  const px = u.match(/\/pixel3d\/src\/([^/]+)/);
  if (px) return `pixel3d/${px[1]}`;
  if (/\/pixel3d\/characters\//.test(u)) return 'pixel3d/characters';
  const g3 = u.match(/\/src\/game3d\/([^/]+)\//);
  if (g3) return `game3d/${g3[1]}`;
  if (/\/src\/game3d\//.test(u)) return 'game3d/(root)';
  if (/\/src\/game\//.test(u)) return 'client/game';
  if (/\/src\//.test(u)) return 'client/other';
  if (/\/packages\//.test(u)) return 'packages';
  if (/\/@vite\/|\/node_modules\/vite/.test(u)) return 'vite-dev';
  if (/v3-frame-probe/.test(u)) return 'probe/other';
  return 'other';
}
function summariseCpu(p: Profile, frames: number) {
  const self = new Map<number, number>();
  for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i]!, (self.get(p.samples[i]!) ?? 0) + (p.timeDeltas[i] ?? 0));
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const buckets: Record<string, number> = {};
  const fns = new Map<string, number>();
  for (const [id, us] of self) {
    const n = byId.get(id)!;
    const b = bucketOf(n.callFrame.url, n.callFrame.functionName);
    buckets[b] = (buckets[b] ?? 0) + us;
    const k = `${n.callFrame.functionName || '(anon)'} ${b} ${n.callFrame.url.split('/').pop()?.split('?')[0]}:${n.callFrame.lineNumber + 1}`;
    fns.set(k, (fns.get(k) ?? 0) + us);
  }
  // inclusive time of a few hot three / vendor functions (sum over distinct nodes; recursion double-counts are rare here)
  const incl = new Map<number, number>();
  const visit = (id: number): number => {
    const n = byId.get(id)!;
    let s = self.get(id) ?? 0;
    for (const c of n.children ?? []) s += visit(c);
    incl.set(id, s);
    return s;
  };
  const root = p.nodes[0];
  if (root) visit(root.id);
  const WANT = ['renderAt', 'render', 'projectObject', 'renderObjects', 'renderBufferDirect', 'setProgram', 'getProgram', 'updateMatrixWorld', 'upload', 'refreshUniformsCommon', 'setupLights', 'shadowMap.render', 'update', '_updateSun', 'step', 'frame'];
  const inclusive: Record<string, number> = {};
  // count only the outermost occurrence of a name on each stack
  const walk = (id: number, seen: Set<string>) => {
    const n = byId.get(id)!;
    const name = n.callFrame.functionName;
    const key = `${name}@${bucketOf(n.callFrame.url, name)}`;
    let added = false;
    if (WANT.includes(name) && !seen.has(key)) {
      inclusive[key] = (inclusive[key] ?? 0) + (incl.get(id) ?? 0);
      seen.add(key);
      added = true;
    }
    for (const c of n.children ?? []) walk(c, seen);
    if (added) seen.delete(key);
  };
  if (root) walk(root.id, new Set());
  const wallUs = p.endTime - p.startTime;
  const perFrame = (us: number) => r2(us / 1000 / Math.max(1, frames));
  return {
    wallMs: Math.round(wallUs / 1000),
    frames,
    bucketsMsPerFrame: Object.fromEntries(Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, perFrame(v)])),
    bucketsPctWall: Object.fromEntries(Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r2((v / wallUs) * 100)])),
    topSelfMsPerFrame: [...fns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, perFrame(v)]),
    inclusiveMsPerFrame: Object.fromEntries(Object.entries(inclusive).filter(([k]) => !k.endsWith('@(native)')).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k, v]) => [k, perFrame(v)])),
  };
}

// ------------------------------------------------------------------ heap sampling
type HeapNode = { callFrame: { functionName: string; url: string; lineNumber: number }; selfSize: number; children: HeapNode[] };
function summariseHeap(head: HeapNode, frames: number) {
  const sites = new Map<string, number>();
  const buckets: Record<string, number> = {};
  let total = 0;
  const visit = (n: HeapNode) => {
    if (n.selfSize) {
      total += n.selfSize;
      const b = bucketOf(n.callFrame.url, n.callFrame.functionName);
      buckets[b] = (buckets[b] ?? 0) + n.selfSize;
      const k = `${n.callFrame.functionName || '(anon)'} ${b} ${n.callFrame.url.split('/').pop()?.split('?')[0]}:${n.callFrame.lineNumber + 1}`;
      sites.set(k, (sites.get(k) ?? 0) + n.selfSize);
    }
    for (const c of n.children) visit(c);
  };
  visit(head);
  const f = Math.max(1, frames);
  return {
    frames,
    totalKB: r2(total / 1024),
    kbPerFrame: r2(total / 1024 / f),
    bucketsKbPerFrame: Object.fromEntries(Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r2(v / 1024 / f)])),
    topSitesKbPerFrame: [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, r2(v / 1024 / f)]),
    // the game's own sites (game3d/*, client/*, packages): what the client front can fix without a vendor change
    gameSitesKbPerFrame: [...sites.entries()].filter(([k]) => / (game3d\/|client\/|packages)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, r2(v / 1024 / f)]),
  };
}

const hostFrames = (page: Page) => page.evaluate(() => (window as unknown as { __v3f: { renderAts: number } }).__v3f.renderAts);

/** CPU profile of a RAF window (`secs`), or of ONE synchronous run of `synced` renderAt(t += 1/60) frames (vendor
 *  frame JS at the real 60 fps step rate; the (idle) bucket there is the SwiftShader raster wait of the sync read). */
async function cpuWindow(page: Page, cdp: CDPSession, secs: number, synced = 0) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  const f0 = await hostFrames(page);
  await cdp.send('Profiler.start');
  if (synced) await page.evaluate((n) => (window as unknown as { __v3f: { synced(o: { n: number }): unknown } }).__v3f.synced({ n }), synced);
  else await sleep(secs * 1000);
  const { profile } = (await cdp.send('Profiler.stop')) as unknown as { profile: Profile };
  const f1 = await hostFrames(page);
  await cdp.send('Profiler.disable');
  return { mode: synced ? 'synced' : 'raf', ...summariseCpu(profile, synced ? synced : f1 - f0) };
}

/**
 * Allocation sampling. `synced` = inside ONE synchronous run of `frames` renderAt(t += 1/60) calls (no timers, no
 * snapshot pump, time-stepped systems at their real 60 fps rate): bytes per real frame of the vendor frame + the
 * extra characters. Otherwise a RAF window of `secs` (includes timer work such as the 12 Hz snapshot pump: read
 * kbPerSec, and kbPerFrame only with care at SwiftShader frame rates).
 */
async function heapWindow(page: Page, cdp: CDPSession, secs: number, synced = 0) {
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const f0 = await hostFrames(page);
  const t0 = Date.now();
  // include objects already collected by minor / major GC: allocation RATE, not what is still alive
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } as never);
  if (synced) await page.evaluate((n) => (window as unknown as { __v3f: { synced(o: { n: number }): unknown } }).__v3f.synced({ n }), synced);
  else await sleep(secs * 1000);
  const { profile } = (await cdp.send('HeapProfiler.stopSampling')) as unknown as { profile: { head: HeapNode } };
  const wallS = (Date.now() - t0) / 1000;
  const f1 = await hostFrames(page);
  const usage = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number; totalSize: number };
  await cdp.send('HeapProfiler.disable');
  const h = summariseHeap(profile.head, synced ? synced : f1 - f0);
  return { mode: synced ? 'synced' : 'raf', ...h, kbPerSec: r2(h.totalKB / wallS), heapUsedMB: r2(usage.usedSize / 2 ** 20), heapTotalMB: r2(usage.totalSize / 2 ** 20) };
}

async function metrics(cdp: CDPSession) {
  const { metrics: m } = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  const g = (n: string) => m.find((x) => x.name === n)?.value ?? 0;
  return { task: g('TaskDuration'), script: g('ScriptDuration'), layout: g('LayoutDuration'), style: g('RecalcStyleDuration'), layouts: g('LayoutCount'), styles: g('RecalcStyleCount'), heapMB: g('JSHeapUsedSize') / 2 ** 20 };
}

type Json = Record<string, unknown>;
async function measureTier(tier: 'high' | 'low'): Promise<Json> {
  const out: Json = { tier };
  const ctx = await browser!.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(300_000);
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  // never reach the dev service through Vite's proxy
  await page.route(/\/(api|healthz|matchmake)(\/|$|\?)/, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(`${BASE}/__v3frame.html`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>v3 frame</title><body style="margin:0;background:#000"></body>' }));
  // tsx (esbuild keepNames) may wrap serialised functions in __name(...)
  await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || ((f) => f);' });
  // sourceURL: the probe's own CPU / allocation samples land in the 'probe/other' bucket, not '(native)'
  await page.addInitScript({ content: `${readFileSync(path.join(HERE, 'v3-frame-probe.js'), 'utf8')}\n//# sourceURL=v3-frame-probe.js` });
  await page.goto(`${BASE}/__v3frame.html`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('ct.debug.camera', '1');
    // no runtime perf sampler / auto fallback while measuring (as the e2e specs): a slow first second must not swap
    // the measured town for Classic or a rebuilt tier mid-run
    localStorage.setItem('ct.debug.v3force', '1');
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  type V3F = Record<string, (...a: never[]) => unknown>;
  const call = <T>(name: string, a: unknown = {}) => page.evaluate(([n, x]) => ((window as unknown as { __v3f: V3F }).__v3f[n as string] as (y: unknown) => T)(x), [name, a] as const) as Promise<T>;

  out.patch = await call('patchVendor');
  log(tier, 'patched', JSON.stringify(out.patch));
  const m0 = await metrics(cdp);
  const mount = await call<Json>('mount', { tier, world: WORLD, players: PLAYERS, w: VW, h: VH });
  out.mount = mount;
  log(tier, 'mount', JSON.stringify(mount).slice(0, 400));
  if (mount.readyErr) throw new Error(`not ready (${tier}): ${mount.readyErr}`);
  const m1 = await metrics(cdp);
  out.mountMetrics = { scriptMs: Math.round((m1.script - m0.script) * 1000), taskMs: Math.round((m1.task - m0.task) * 1000), heapMB: r2(m1.heapMB) };
  await sleep(3000); // settle: first frames after ready, lazy pieces
  if (MODES.has('census')) {
    out.census = await call('census');
    log(tier, 'census', JSON.stringify(out.census).slice(0, 600));
  }
  const windowSet = async (label: string) => {
    const r: Json = {};
    if (MODES.has('counts') || MODES.has('split')) {
      if (WALK) await call('walk', true);
      const mA = await metrics(cdp);
      r.split = await call('run', { secs: SECS, minFrames: FRAMES });
      const mB = await metrics(cdp);
      const wall = (r.split as { wallMs: number }).wallMs / 1000;
      r.mainThread = { taskPct: r2(((mB.task - mA.task) / wall) * 100), scriptPct: r2(((mB.script - mA.script) / wall) * 100), layoutsPerSec: r2((mB.layouts - mA.layouts) / wall), stylesPerSec: r2((mB.styles - mA.styles) / wall) };
      if (WALK) await call('walk', false);
      log(tier, label, 'split', JSON.stringify(r.split).slice(0, 900));
    }
    if (MODES.has('synced')) {
      r.synced = await call('synced', { n: 8, passes: false });
      if (PASSES) r.syncedPasses = await call('synced', { n: 6, passes: true });
      log(tier, label, 'synced', JSON.stringify(r.synced).slice(0, 500));
    }
    return r;
  };
  out.base = await windowSet('base');
  if (MODES.has('whatif')) {
    out.whatIf = await call('whatIf', { n: WHATIF_N });
    log(tier, 'whatIf', JSON.stringify(out.whatIf).slice(0, 1500));
  }
  if (MODES.has('cpu')) {
    out.cpuSynced = await cpuWindow(page, cdp, 0, 12);
    log(tier, 'cpuSynced', JSON.stringify(out.cpuSynced).slice(0, 700));
    if (WALK) await call('walk', true);
    out.cpu = await cpuWindow(page, cdp, SECS);
    if (WALK) await call('walk', false);
    log(tier, 'cpu', JSON.stringify(out.cpu).slice(0, 700));
  }
  if (MODES.has('heap')) {
    out.heapSynced = await heapWindow(page, cdp, 0, 16);
    log(tier, 'heapSynced', JSON.stringify(out.heapSynced).slice(0, 700));
    if (WALK) await call('walk', true);
    out.heap = await heapWindow(page, cdp, SECS);
    if (WALK) await call('walk', false);
    log(tier, 'heap', JSON.stringify(out.heap).slice(0, 700));
  }
  if (MODES.has('chars') && CHARS > 0) {
    out.addChars = await call('addChars', { k: CHARS, ids: CHAR_IDS, lite: tier === 'low' });
    log(tier, 'chars', JSON.stringify(out.addChars));
    await sleep(2500);
    out.charDelta = await call('charDelta', { n: 6 });
    log(tier, 'charDelta', JSON.stringify(out.charDelta));
    out.chars = await windowSet(`chars+${CHARS}`);
    if (MODES.has('census')) out.charsCensus = await call('census');
    if (MODES.has('heap')) {
      out.charsHeapSynced = await heapWindow(page, cdp, 0, 16);
      if (WALK) await call('walk', true);
      out.charsHeap = await heapWindow(page, cdp, SECS);
      if (WALK) await call('walk', false);
    }
    if (MODES.has('cpu')) {
      out.charsCpuSynced = await cpuWindow(page, cdp, 0, 12);
      if (WALK) await call('walk', true);
      out.charsCpu = await cpuWindow(page, cdp, SECS);
      if (WALK) await call('walk', false);
    }
  }
  out.v3End = await page.evaluate(() => (window as unknown as { __ctCamera?: { v3?: () => unknown } }).__ctCamera?.v3?.() ?? null);
  out.probeErrors = await page.evaluate(() => (window as unknown as { __v3f: { errors: string[] } }).__v3f.errors);
  await page.screenshot({ path: path.join(OUT, `v3-frame-${tier}.png`) });
  out.destroy = await call('destroy');
  out.consoleErrors = consoleErrors;
  await ctx.close();
  return out;
}

/** The headline numbers per tier (also what scripts/perf/v3-frame-budgets.mjs reads). */
function headline(t: Json) {
  type Agg = { p50: number; p95: number; mean: number };
  const g = (o: unknown, ...ks: string[]) => ks.reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);
  const pf = (w: string, k: string, s: keyof Agg = 'p50') => (g(t, w, 'split', 'perFrame', k) as Agg | undefined)?.[s] ?? null;
  // draw calls from the deterministic synced run (mean over both parities of 30 fps sub-systems)
  const sc = (w: string, k: string, s: keyof Agg = 'mean') => (g(t, w, 'synced', 'perFrame', k) as Agg | undefined)?.[s] ?? null;
  const calls0 = sc('base', 'calls');
  const callsK = sc('chars', 'calls');
  const k = (g(t, 'addChars', 'spawned') as number | undefined) ?? 0;
  return {
    tier: t.tier,
    pixelScale: g(t, 'census', 'pixelScale'),
    low: g(t, 'census', 'low'),
    readyMs: g(t, 'mount', 'readyMs'),
    calls: calls0,
    callsByStage: g(t, 'base', 'split', 'stageCalls'),
    tris: sc('base', 'tris'),
    shadowCalls: sc('base', 'shadowCalls'),
    syncedJsRenderAtMs: sc('base', 'renderAt', 'p50'),
    syncedJsUpdatersMs: sc('base', 'upd', 'p50'),
    syncedJsPipeMs: sc('base', 'pipe', 'p50'),
    programs: g(t, 'base', 'split', 'programsSeen'),
    lightsVisible: g(t, 'census', 'lights'),
    postPasses: (g(t, 'census', 'passes') as { name: string; enabled: boolean }[] | undefined)?.filter((p) => p.enabled).map((p) => p.name),
    rafDeltaP50: (g(t, 'base', 'split', 'delta') as Agg | undefined)?.p50 ?? null,
    rafDeltaP95: (g(t, 'base', 'split', 'delta') as Agg | undefined)?.p95 ?? null,
    jsFrameP50: pf('base', 'raf'),
    jsFrameP95: pf('base', 'raf', 'p95'),
    renderAtP50: pf('base', 'renderAt'),
    gameJsP50: pf('base', 'game'),
    microP50: pf('base', 'micro'),
    syncedP50: (g(t, 'base', 'synced', 'total') as Agg | undefined)?.p50 ?? null,
    allocKbPerFrame: g(t, 'heapSynced', 'kbPerFrame') ?? g(t, 'heap', 'kbPerFrame'),
    allocKbPerSecRaf: g(t, 'heap', 'kbPerSec'),
    gcMsPerFrame: (g(t, 'cpu', 'bucketsMsPerFrame') as Record<string, number> | undefined)?.['(garbage collector)'] ?? null,
    domMutPerSec: g(t, 'base', 'split', 'domMutPerSec'),
    extraChars: k,
    // exact per-character cost at one camera position (charDelta); window-to-window deltas also move with the view
    callsPerChar: (g(t, 'charDelta', 'perChar', 'calls') as number | undefined) ?? (k && calls0 != null && callsK != null ? r2((callsK - calls0) / k) : null),
    charDelta: g(t, 'charDelta', 'perChar') ?? null,
    jsMsPerChar: k ? r2(((sc('chars', 'renderAt', 'p50') ?? 0) - (sc('base', 'renderAt', 'p50') ?? 0)) / k) : null,
    rafJsMsPerChar: k ? r2(((pf('chars', 'raf') ?? 0) - (pf('base', 'raf') ?? 0)) / k) : null,
    syncedMsPerChar: k ? r2((((g(t, 'chars', 'synced', 'total') as Agg | undefined)?.p50 ?? 0) - ((g(t, 'base', 'synced', 'total') as Agg | undefined)?.p50 ?? 0)) / k) : null,
    whatIfSavedPct: Object.fromEntries(Object.entries((t.whatIf as Record<string, { savedPct?: number }> | undefined) ?? {}).filter(([, v]) => v && typeof v === 'object' && v.savedPct != null).map(([k, v]) => [k, v.savedPct!])),
    syncedPostByMs: g(t, 'base', 'syncedPasses', 'postByMs'),
    syncedPassMs: (() => {
      const p = g(t, 'base', 'syncedPasses', 'perFrame') as Record<string, Agg> | undefined;
      return p ? Object.fromEntries(['shadow', 'color', 'normal', 'pre', 'post', 'up', 'upd', 'mw'].map((k) => [k, p[k]?.p50 ?? null])) : null;
    })(),
    allocKbPerFramePerChar: k ? r2((((g(t, 'charsHeapSynced', 'kbPerFrame') as number | undefined) ?? 0) - ((g(t, 'heapSynced', 'kbPerFrame') as number | undefined) ?? 0)) / k) : null,
  };
}

async function main() {
  const loadBefore = load();
  log('root', ROOT, 'load before', loadBefore.join(' '), 'cores', cpus().length);
  vite = spawn(process.execPath, [path.join(ROOT, 'apps/client/node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: path.join(ROOT, 'apps/client'),
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
  vite.stderr?.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  await waitForVite();
  log('vite up');
  browser = await chromium.launch({ args: [...GL_ARGS, '--enable-precise-memory-info'] });
  const tiers: Json[] = [];
  for (const tier of TIERS) {
    const t0 = Date.now();
    try {
      tiers.push(await measureTier(tier));
    } catch (e) {
      log(tier, 'FAILED', (e as Error)?.stack ?? e);
      tiers.push({ tier, error: String((e as Error)?.message ?? e) });
    }
    log(tier, `done in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  const loadAfter = load();
  const result = {
    at: new Date().toISOString(),
    root: ROOT,
    rev: process.env.V3_FRAME_REV ?? null,
    viewport: [VW, VH],
    gl: GL,
    world: WORLD,
    players: PLAYERS,
    walk: WALK,
    secs: SECS,
    load: { before: loadBefore, after: loadAfter, cores: cpus().length },
    browser: browser.version(),
    headline: tiers.filter((t) => !t.error).map(headline),
    tiers,
  };
  const file = path.join(OUT, 'v3-frame.json');
  writeFileSync(file, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ file, load: result.load, headline: result.headline, errors: tiers.map((t) => t.error ?? null) }, null, 1));
  return tiers.every((t) => !t.error);
}

let code = 1;
try {
  code = (await main()) ? 0 : 1;
} catch (e) {
  log('failed:', (e as Error)?.stack ?? e);
  code = 1;
} finally {
  await cleanup();
  clearTimeout(watchdog);
}
process.exit(code);
