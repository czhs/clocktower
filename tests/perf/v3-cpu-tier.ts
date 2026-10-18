// v3 perf, CPU-only tier prototype (v3-perf-cpu). Measures the 3D town in Chromium on SwiftShader (CPU raster: the
// stand-in for "no GPU") at a small viewport, lever by lever (tests/perf/v3-cpu-probe.js), then lever sets, with
// real RAF frame rates and an input-to-motion probe. Reuses the frame front's probe (tests/perf/v3-frame-probe.js:
// fake connection, 14 remotes on a 12 Hz snapshot pump, the REAL createTownGame3d) and its Vite DEV setup.
//
// Locks: the mount (Vite + town build + warm-up) runs under the heavy lock SHARED; every measurement window takes it
// EXCLUSIVE (a child `flock` holds it while its stdin is open), so builds / tests of other agents can run in between
// and the numbers stay clean. Run ON THE HOST (sandbox CT_AGENT=v3-perf-cpu*), WITHOUT an outer flock:
//   CT_AGENT=v3-perf-cpu scripts/remote.sh sh -c 'timeout 3000 pnpm exec tsx tests/perf/v3-cpu-tier.ts --tiers low --out test-results/v3-cpu'
//
// Args: --port 3486 (v3-perf-cpu range 3486-3489, v31-cpu 3490-3494) --tiers low[,high,cpu] --viewport 960x540 --players 14
//       --levers a,b,c (single-lever synced runs; default: all) --sets 'name=a+b+c;name2=...' (RAF + input + synced)
//       --gl swiftshader|gpu --raf-secs 10 --n 6 --out <dir>
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const PORT = Number(arg('port', '3486'));
// v3-perf-cpu: 3486-3489; v3.1 cpu front (v31-cpu): 3490-3494
if (PORT < 3486 || PORT > 3494) throw new Error('the cpu perf runs own ports 3486-3494 only');
const TIERS = arg('tiers', 'low').split(',');
const [VW, VH] = arg('viewport', '960x540').split('x').map(Number) as [number, number];
const PLAYERS = Number(arg('players', '14'));
const LEVERS = arg('levers', 'all');
const SETS = arg('sets', '');
const GL = arg('gl', 'swiftshader');
const RAF_SECS = Number(arg('raf-secs', '10'));
const N = Number(arg('n', '6'));
const INPUT_TRIALS = Number(arg('input-trials', '6'));
const OUT = path.resolve(arg('out', path.join(ROOT, 'test-results/v3-cpu')));
const LOCK = path.join(homedir(), 'clocktower/v3-heavy.lock');
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });
const log = (...a: unknown[]) => console.error(`[v3-cpu ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const load = () => readFileSync('/proc/loadavg', 'utf8').trim().split(' ').slice(0, 3).map(Number);
/** cpu.stat of this process's cgroup (the remote.sh scope: CPUQuota 300 %) and of its parent slice. */
const cgPath = (() => {
  try {
    const l = readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((x) => x.startsWith('0::'));
    return l ? `/sys/fs/cgroup${l.slice(3)}` : null;
  } catch {
    return null;
  }
})();
const cpuStat = (dir: string | null) => {
  try {
    if (!dir) return null;
    const o: Record<string, number> = {};
    for (const line of readFileSync(`${dir}/cpu.stat`, 'utf8').trim().split('\n')) {
      const [k, v] = line.split(' ');
      o[k!] = Number(v);
    }
    return o;
  } catch {
    return null;
  }
};
const cgDelta = (a: Record<string, number> | null, b: Record<string, number> | null) =>
  a && b ? { usageMs: Math.round((b.usage_usec! - a.usage_usec!) / 1000), throttledMs: Math.round(((b.throttled_usec ?? 0) - (a.throttled_usec ?? 0)) / 1000), periods: (b.nr_periods ?? 0) - (a.nr_periods ?? 0), throttledPeriods: (b.nr_throttled ?? 0) - (a.nr_throttled ?? 0) } : null;

// ------------------------------------------------------------------ the heavy lock (child flock holds it)
type Held = { release(): void; waitedMs: number };
async function takeLock(mode: 'shared' | 'exclusive'): Promise<Held> {
  const t0 = Date.now();
  const c = spawn('flock', [mode === 'shared' ? '-s' : '-x', LOCK, 'sh', '-c', 'echo locked; cat >/dev/null'], { stdio: ['pipe', 'pipe', 'inherit'] });
  await new Promise<void>((res, rej) => {
    c.stdout!.on('data', (d) => String(d).includes('locked') && res());
    c.on('exit', (code) => rej(new Error(`flock exited ${code}`)));
  });
  return { waitedMs: Date.now() - t0, release: () => c.stdin!.end() };
}
const lockLog: { mode: string; what: string; waitedMs: number; heldMs: number; loadIn: number[]; loadOut: number[]; scope: unknown; slice: unknown }[] = [];
async function withLock<T>(mode: 'shared' | 'exclusive', what: string, fn: () => Promise<T>): Promise<T> {
  const h = await takeLock(mode);
  const t0 = Date.now();
  const loadIn = load();
  const sc0 = cpuStat(cgPath);
  const sl0 = cpuStat(cgPath ? path.dirname(cgPath) : null);
  try {
    return await fn();
  } finally {
    lockLog.push({ mode, what, waitedMs: h.waitedMs, heldMs: Date.now() - t0, loadIn, loadOut: load(), scope: cgDelta(sc0, cpuStat(cgPath)), slice: cgDelta(sl0, cpuStat(cgPath ? path.dirname(cgPath) : null)) });
    h.release();
  }
}

let vite: ChildProcess | null = null;
let browser: Browser | null = null;
const watchdog = setTimeout(() => {
  log('watchdog: 48 min, aborting');
  void cleanup().finally(() => process.exit(3));
}, 48 * 60_000);
async function cleanup() {
  try {
    await browser?.close();
  } catch {
    /* gone */
  }
  browser = null;
  if (vite?.pid && vite.exitCode === null)
    for (const sig of ['SIGTERM', 'SIGKILL'] as const) {
      try {
        process.kill(-vite.pid, sig);
      } catch {
        /* gone */
      }
      await sleep(400);
    }
  vite = null;
}

type Json = Record<string, unknown>;
async function measureTier(tier: string): Promise<Json> {
  const out: Json = { tier, viewport: [VW, VH] };
  const ctx = await browser!.newContext({ viewport: { width: VW, height: VH } });
  const page: Page = await ctx.newPage();
  page.setDefaultTimeout(600_000);
  const consoleErrors: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /town3d|context|webgl|avatars/i.test(m.text()))) && consoleErrors.push(`${m.type()}: ${m.text().slice(0, 300)}`));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  await page.route(/\/(api|healthz|matchmake)(\/|$|\?)/, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(`${BASE}/__v3cpu.html`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>v3 cpu</title><body style="margin:0;background:#000"></body>' }));
  await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || ((f) => f);' });
  await page.addInitScript({ content: `${readFileSync(path.join(HERE, 'v3-frame-probe.js'), 'utf8')}\n//# sourceURL=v3-frame-probe.js` });
  await page.addInitScript({ content: `${readFileSync(path.join(HERE, 'v3-cpu-probe.js'), 'utf8')}\n//# sourceURL=v3-cpu-probe.js` });
  await page.goto(`${BASE}/__v3cpu.html`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('ct.debug.camera', '1');
    // the runtime perf sampler off (as in the v3 e2e): a measurement must not demote / swap the town under it
    localStorage.setItem('ct.debug.v3force', '1');
  });
  await page.addInitScript({ content: `addEventListener('webglcontextlost', () => ((window.__v3lost = (window.__v3lost || 0) + 1)), true);` });
  const f = <T>(name: string, a: unknown = {}) => page.evaluate(([n, x]) => ((window as unknown as { __v3f: Record<string, (y: unknown) => T> }).__v3f[n as string]!)(x), [name, a] as const) as Promise<T>;
  const c = <T>(name: string, a: unknown = {}) => page.evaluate(([n, x]) => ((window as unknown as { __v3c: Record<string, (y: unknown) => T> }).__v3c[n as string]!)(x), [name, a] as const) as Promise<T>;

  await withLock('shared', `mount ${tier}`, async () => {
    out.patch = await f('patchVendor');
    const mount = await f<Json>('mount', { tier, world: 'v3', players: PLAYERS, w: VW, h: VH });
    out.mount = mount;
    log(tier, 'mount', JSON.stringify(mount).slice(0, 300));
    if (mount.readyErr) throw new Error(`not ready (${tier}): ${mount.readyErr}`);
    // three for the 'unlit' lever: the module URL the app loaded
    await page.evaluate(async () => {
      const u = performance.getEntriesByType('resource').map((x) => x.name).find((n) => /\.vite\/deps\/three\.js|three\.module\.js/.test(n.split('?')[0]!));
      if (u) (window as unknown as { __v3cTHREE: unknown }).__v3cTHREE = await import(/* @vite-ignore */ u);
    });
    // every remote avatar built (one build at a time; SwiftShader compiles each body behind a scratch target)
    const want = PLAYERS + 1;
    const t0 = Date.now();
    let built = 0;
    while (Date.now() - t0 < 240_000) {
      built = await page.evaluate(() => {
        const e = (window as unknown as { __v3f: { engine: { scene: { children: { name: string }[] } } | null } }).__v3f.engine;
        return e ? e.scene.children.filter((o) => /^avatar:(?!npc)/.test(o.name)).length : 0;
      });
      if (built >= want) break;
      await sleep(3000);
    }
    out.avatarsBuilt = { built, want, ms: Date.now() - t0 };
    log(tier, 'avatars', JSON.stringify(out.avatarsBuilt));
    await sleep(3000);
  });

  const levers = LEVERS === 'all' ? await page.evaluate(() => (window as unknown as { __v3c: { levers: string[] } }).__v3c.levers) : LEVERS === 'none' ? [] : LEVERS.split(',');
  const sets = SETS ? SETS.split(';').map((s) => s.split('=')).map(([name, l]) => ({ name: name!, levers: l ? l.split('+') : [] })) : [];

  await withLock('exclusive', `levers ${tier}`, async () => {
    out.census = await f('census');
    out.trisByPiece = await c('trisByPiece');
    out.base = { synced: await c('synced', { n: N }), passes: await c('syncedPasses', { n: 4 }) };
    log(tier, 'base', JSON.stringify(out.base));
    const one: Json = {};
    for (const l of levers) {
      await c('apply', [l]);
      try {
        one[l] = await c('synced', { n: N });
      } finally {
        await c('restore');
      }
      log(tier, 'lever', l, JSON.stringify(one[l]));
    }
    out.levers = one;
    out.baseAgain = await c('synced', { n: N });
  });

  const setOut: Json = {};
  for (const s of [{ name: 'baseline', levers: [] as string[] }, ...sets]) {
    await withLock('exclusive', `set ${tier} ${s.name}`, async () => {
      await c('apply', s.levers);
      try {
        const synced = await c('synced', { n: N });
        const passes = await c('syncedPasses', { n: 4 });
        const raf = await c('raf', { secs: RAF_SECS });
        const input = await c('input', { trials: INPUT_TRIALS });
        const state = await page.evaluate(() => ({ v3: (window as unknown as { __ctCamera?: { v3?: () => unknown } }).__ctCamera?.v3?.() ?? null, lost: (window as unknown as { __v3lost?: number }).__v3lost ?? 0, swaps: (window as unknown as { __v3f: { engineSwaps?: number } }).__v3f.engineSwaps ?? 0 }));
        setOut[s.name] = { levers: s.levers, synced, passes, raf, input, state };
        log(tier, 'set', s.name, JSON.stringify(setOut[s.name]).slice(0, 900));
        await page.screenshot({ path: path.join(OUT, `cpu-${tier}-${s.name}.png`) });
      } finally {
        await c('restore');
      }
    });
  }
  out.sets = setOut;
  out.v3End = await page.evaluate(() => (window as unknown as { __ctCamera?: { v3?: () => unknown } }).__ctCamera?.v3?.() ?? null);
  out.probeErrors = await page.evaluate(() => [...(window as unknown as { __v3f: { errors: string[] } }).__v3f.errors, ...(window as unknown as { __v3c: { errors: string[] } }).__v3c.errors]);
  out.destroy = await f('destroy');
  out.consoleErrors = consoleErrors;
  await ctx.close();
  return out;
}

async function main() {
  log('root', ROOT, 'load', load().join(' '), 'cores', cpus().length, 'gl', GL);
  vite = spawn(process.execPath, [path.join(ROOT, 'apps/client/node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: path.join(ROOT, 'apps/client'), stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  vite.stderr?.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/@vite/client`)).ok) break;
    } catch {
      /* not yet */
    }
    if (i > 160) throw new Error('vite did not come up');
    await sleep(500);
  }
  const glArgs = GL === 'gpu' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  browser = await chromium.launch({ args: [...glArgs, '--enable-precise-memory-info'] });
  const tiers: Json[] = [];
  for (const t of TIERS) {
    for (let attempt = 1; ; attempt++) {
      try {
        tiers.push({ ...(await measureTier(t)), attempt });
        break;
      } catch (e) {
        log(t, 'FAILED', attempt, (e as Error)?.stack ?? e);
        // the agent slice is shared (7 GiB for every agent): an OOM-killed renderer gets one more try
        if (attempt < 2 && /crash|closed/i.test(String((e as Error)?.message))) {
          await sleep(30_000);
          continue;
        }
        tiers.push({ tier: t, error: String((e as Error)?.message ?? e), attempt });
        break;
      }
    }
  }
  const result = { at: new Date().toISOString(), viewport: [VW, VH], players: PLAYERS, gl: GL, browser: browser.version(), cores: cpus().length, locks: lockLog, tiers };
  const file = path.join(OUT, 'v3-cpu.json');
  writeFileSync(file, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ file, locks: lockLog, errors: tiers.map((t) => t.error ?? null) }));
  return tiers.every((t) => !t.error);
}

let code = 1;
try {
  code = (await main()) ? 0 : 1;
} catch (e) {
  log('failed:', (e as Error)?.stack ?? e);
} finally {
  await cleanup();
  clearTimeout(watchdog);
}
process.exit(code);
