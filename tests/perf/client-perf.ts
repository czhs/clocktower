// perf-audit: client runtime + load profile in ONE headless Chromium (keep the shared host light).
// Own throwaway server (127.0.0.1:3390-3394, never 3000/3001) serving a client build; 1 Storyteller bot
// + 14 player bots (Node, wandering at 10 Hz) + the browser as the 15th player.
//
// Windows (each --win seconds): frame times (rAF), main-thread CPU (CDP Performance.getMetrics),
// JS heap, DOM mutations/s (HUD churn proxy), long tasks; optional V8 CPU profile (CDP Profiler) of a
// walking window (summarise with tests/perf/cpuprofile-summary.ts — use an UNMINIFIED build for names).
//   desktop-idle   1440x900, standing outdoors by day, 15 others wandering
//   desktop-walk   1440x900, walking (WASD) — localPlayer store publishes every frame
//   mobile-walk    390x844 touch, CPU throttled 4x (CDP), walking
//   night-home     1440x900, inside own home at night (lighting + interior)
// Load: cold navigation to / and to /lobby/<id> with CDP network throttling (Slow 4G: 150 ms RTT,
// 1.6 Mbit/s down) + 4x CPU — bytes by type and time to auth screen / town canvas ready.
//
// Prereq: client build (pnpm --filter @ct/client build, or an unminified one, see --dist).
//   CT_AGENT=perf-audit scripts/remote.sh pnpm exec tsx tests/perf/client-perf.ts [--dist apps/client/dist] [--win 20] [--profile yes] [--out /tmp/ct-perf]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { makeBots, type Bot } from '../support/bot.js';
import { toDay, toNight, until, type Game } from '../support/game.js';
import { pickPort, REPO_ROOT, startServer } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const DIST = path.resolve(REPO_ROOT, arg('dist', 'apps/client/dist'));
const WIN_S = Number(arg('win', '20'));
const PROFILE = arg('profile', 'yes') === 'yes';
const OUT = path.resolve(arg('out', '/tmp/ct-perf'));
const ONLY = arg('only', ''); // comma list of window names
const GPU = arg('gpu', 'no') === 'yes';
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[client-perf ${new Date().toISOString().slice(11, 19)}]`, ...a);
const want = (n: string) => !ONLY || ONLY.split(',').includes(n);

/** tsx (esbuild keepNames) wraps functions in `__name(...)`; functions serialised into the page need it. */
const NAME_SHIM = 'globalThis.__name = globalThis.__name || ((f) => f);';

/** Installed before any page script: frame-time + DOM-mutation + long-task recorders. */
function probes() {
  const w = window as unknown as { __perf: { frames: number[]; muts: number; longTasks: number[]; reset(): void; on: boolean } };
  const P = { frames: [] as number[], muts: 0, longTasks: [] as number[], on: false, reset() { this.frames = []; this.muts = 0; this.longTasks = []; } };
  w.__perf = P;
  let last = 0;
  const raf = (t: number) => {
    if (P.on && last) P.frames.push(t - last);
    last = t;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  const start = () => {
    new MutationObserver((l) => {
      if (P.on) for (const m of l) P.muts += m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length || 1 : 1;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
  try {
    new PerformanceObserver((l) => {
      if (P.on) for (const e of l.getEntries()) P.longTasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    /* no longtask API */
  }
  try {
    localStorage.setItem('ct.intro.seen', '1');
    localStorage.setItem('ct.hint.move.v1', '1');
    localStorage.setItem('ct.help.seen', '1');
  } catch {
    /* ignore */
  }
}

const q = (v: number[], p: number) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]! * 10) / 10;
};
async function metrics(cdp: CDPSession) {
  const r = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
}

async function measure(name: string, page: Page, cdp: CDPSession, during?: (stop: () => boolean) => Promise<void>, profile = false) {
  await page.evaluate(() => {
    const p = (window as unknown as { __perf: { reset(): void; on: boolean } }).__perf;
    p.reset();
    p.on = true;
  });
  const m0 = await metrics(cdp);
  if (profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  const t0 = Date.now();
  let done = false;
  const act = during ? during(() => done) : Promise.resolve();
  await sleep(WIN_S * 1000);
  done = true;
  await act;
  let profFile: string | null = null;
  if (profile) {
    const { profile: prof } = (await cdp.send('Profiler.stop')) as { profile: unknown };
    profFile = path.join(OUT, `client-${name}.cpuprofile`);
    writeFileSync(profFile, JSON.stringify(prof));
  }
  const m1 = await metrics(cdp);
  const secs = (Date.now() - t0) / 1000;
  const p = await page.evaluate(() => {
    const x = (window as unknown as { __perf: { frames: number[]; muts: number; longTasks: number[]; on: boolean } }).__perf;
    x.on = false;
    return { frames: x.frames, muts: x.muts, longTasks: x.longTasks };
  });
  const d = (k: string) => (m1[k] ?? 0) - (m0[k] ?? 0);
  const res = {
    name,
    secs: Math.round(secs * 10) / 10,
    fps: Math.round((p.frames.length / secs) * 10) / 10,
    frameMs: { p50: q(p.frames, 0.5), p95: q(p.frames, 0.95), p99: q(p.frames, 0.99), max: Math.round(Math.max(0, ...p.frames)) },
    framesOver33ms: p.frames.filter((f) => f > 33.4).length,
    mainThreadBusyPct: Math.round((d('TaskDuration') / secs) * 1000) / 10,
    scriptPct: Math.round((d('ScriptDuration') / secs) * 1000) / 10,
    layoutPlusStylePct: Math.round(((d('LayoutDuration') + d('RecalcStyleDuration')) / secs) * 1000) / 10,
    layoutsPerSec: Math.round((d('LayoutCount') / secs) * 10) / 10,
    styleRecalcsPerSec: Math.round((d('RecalcStyleCount') / secs) * 10) / 10,
    jsHeapMb: Math.round((m1.JSHeapUsedSize ?? 0) / 1048576),
    jsHeapDeltaMb: Math.round((d('JSHeapUsedSize') / 1048576) * 10) / 10,
    domNodes: m1.Nodes,
    domMutationsPerSec: Math.round((p.muts / secs) * 10) / 10,
    longTasks: { n: p.longTasks.length, maxMs: Math.round(Math.max(0, ...p.longTasks)) },
    profFile,
  };
  log(JSON.stringify(res));
  return res;
}

/** Walk in a slow square-ish loop with WASD until stop(). */
async function walk(page: Page, stop: () => boolean) {
  const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
  let i = 0;
  while (!stop()) {
    const k = keys[i++ % 4]!;
    await page.keyboard.down(k);
    await sleep(1200);
    await page.keyboard.up(k);
  }
}

async function enterLobby(ctx: BrowserContext, base: string, name: string) {
  const page = await ctx.newPage();
  await page.goto(base + '/');
  const r = await page.request.post(base + '/api/auth/create', { data: { displayName: name } });
  if (r.status() >= 300) throw new Error(`account: ${r.status()} ${await r.text()}`);
  return page;
}

async function loadTiming(browser: import('@playwright/test').Browser, base: string, town: boolean, label: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.addInitScript({ content: NAME_SHIM });
  await ctx.addInitScript(probes);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const bytes: Record<string, number> = {};
  const urls = new Map<string, string>();
  cdp.on('Network.responseReceived', (e: { requestId: string; type: string; response: { url: string } }) => urls.set(e.requestId, `${e.type}|${e.response.url}`));
  const files: { url: string; bytes: number; type: string }[] = [];
  cdp.on('Network.loadingFinished', (e: { requestId: string; encodedDataLength: number }) => {
    const u = urls.get(e.requestId) ?? 'Other|?';
    const [type, url] = u.split('|') as [string, string];
    bytes[type] = (bytes[type] ?? 0) + e.encodedDataLength;
    files.push({ url: url.replace(base, ''), bytes: e.encodedDataLength, type });
  });
  const out: Record<string, unknown> = { label };
  let t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'Create account' }).first().waitFor({ timeout: 120_000 });
  out.authScreenMs = Date.now() - t0;
  await page.waitForLoadState('load');
  out.authLoadEventMs = Date.now() - t0;
  out.authBytes = { ...bytes };
  out.authFiles = files.splice(0).sort((a, b) => b.bytes - a.bytes).slice(0, 12);
  for (const k of Object.keys(bytes)) delete bytes[k];
  if (town) {
    const r = await page.request.post(base + '/api/auth/create', { data: { displayName: `Load${label}` } });
    if (r.status() >= 300) throw new Error(`account: ${r.status()}`);
    const l = await page.request.post(base + '/api/lobbies', { data: { name: `Load ${label}`, maxPlayers: 6 } });
    if (l.status() >= 300) throw new Error(`lobby: ${l.status()} ${await l.text()}`);
    const lobbyId = ((await l.json()) as { lobby: { id: string } }).lobby.id;
    t0 = Date.now();
    await page.goto(`${base}/lobby/${lobbyId}`, { waitUntil: 'commit' });
    await page.locator('.ct-game-canvas canvas').waitFor({ timeout: 180_000 });
    out.townCanvasMs = Date.now() - t0;
    await page.locator('.ct-game-loading').waitFor({ state: 'detached', timeout: 180_000 }).catch(() => undefined);
    // Phaser preload done = the scene drew (canvas exists); textures finished when network idles
    await page.waitForLoadState('networkidle', { timeout: 180_000 }).catch(() => undefined);
    out.townNetworkIdleMs = Date.now() - t0;
    out.townBytes = { ...bytes };
    out.townFiles = files.splice(0).sort((a, b) => b.bytes - a.bytes).slice(0, 12);
  }
  log('load', JSON.stringify(out));
  await ctx.close();
  return out;
}

async function main() {
  const port = await pickPort(3390, 3394);
  const server = await startServer({
    mode: 'source',
    port,
    env: {
      CLIENT_DIST: DIST,
      LOBBY_IDLE_TIMEOUT_SEC: '120',
      LIVEKIT_URL: 'wss://perf-fake.livekit.invalid',
      LIVEKIT_API_KEY: 'APIperffake',
      LIVEKIT_API_SECRET: 'perf-secret-0123456789abcdef0123456789abcdef',
    },
  });
  const base = server.url;
  log('server', base, 'dist', DIST);
  const browser = await chromium.launch({
    headless: true,
    args: GPU ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] : [],
  });
  const results: Record<string, unknown> = { dist: DIST, winS: WIN_S, gpu: GPU };
  const bots: Bot[] = [];
  try {
    // ---- cold load (before any lobby exists: auth screen only)
    if (want('load')) results.loadAuth = await loadTiming(browser, base, false, 'auth');

    // ---- lobby with 14 bot players + browser player, human Storyteller bot
    bots.push(...(await makeBots(15, `cp${Math.random().toString(36).slice(2, 5)}-`, base, server.wsUrl, { record: false })));
    const [st, ...players] = bots as [Bot, ...Bot[]];
    const lobbyId = await st.createLobby('Perf town', 15, true);
    await st.join(lobbyId, 'storyteller');
    for (const p of players) await p.join(lobbyId);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: NAME_SHIM });
  await ctx.addInitScript(probes);
    const page = await enterLobby(ctx, base, 'Perfy');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/lobby/${lobbyId}`);
    await page.getByRole('button', { name: "I'm ready" }).click({ timeout: 60_000 });
    for (const p of players) p.send('lobby:ready', { ready: true });
    await until(() => st.lobbyView?.canStart, 15_000, 'canStart');
    const stView = () => st.gameView as never;
    const g = { lobbyId, st, players, seatOf: new Map(), grimoire: [], stView, cmd: (c: unknown) => st.send('st:command', c) } as unknown as Game;
    st.send('lobby:start', {});
    await st.waitFor<{ kind?: string }>('game:view', (v) => v?.kind === 'storyteller', 10_000);
    g.cmd({ type: 'random_setup' });
    await until(() => ((st.gameView as { grimoire?: unknown[] })?.grimoire?.length ?? 0) === 15, 8000, 'grimoire');
    g.cmd({ type: 'begin_first_night' });
    await until(() => (st.gameView as { phase?: string })?.phase === 'first_night', 8000, 'first night');
    await sleep(1500);
    await toDay(g);
    log('day');
    for (const b of bots) b.exitBuildings = true;
    st.startWandering(10, 1.5);
    for (const p of players) p.startWandering(10);
    // the browser player leaves home
    const leave = page.locator('.ct-inside').getByRole('button');
    await leave.click({ timeout: 30_000 }).catch(() => log('warn: no Leave button'));
    await page.locator('.ct-inside').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => log('warn: still inside'));
    await until(() => bots.filter((b) => b.location === 'outdoors').length >= 12, 45_000, 'bots outdoors').catch(() => log('warn: bots not outdoors'));
    await sleep(2000);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
    const probe = await page.evaluate(
      () =>
        new Promise<unknown>((r) => {
          let n = 0;
          const t = performance.now();
          const f = () => {
            n++;
            if (performance.now() - t < 1000) requestAnimationFrame(f);
            else r({ rafPerSec: n, perf: typeof (window as unknown as { __perf?: unknown }).__perf, vis: document.visibilityState, hasFocus: document.hasFocus() });
          };
          requestAnimationFrame(f);
          setTimeout(() => r({ rafPerSec: n, timeout: true, vis: document.visibilityState }), 3000);
        }),
    );
    log('probe', JSON.stringify(probe));
    if (want('desktop-idle')) results.desktopIdle = await measure('desktop-idle', page, cdp);
    if (want('desktop-walk')) results.desktopWalk = await measure('desktop-walk', page, cdp, (stop) => walk(page, stop), PROFILE);
    // ---- texture / GPU memory (WebGL) and Phaser objects
    results.gpu = await page.evaluate(() => {
      const c = document.querySelector('.ct-game-canvas canvas') as HTMLCanvasElement | null;
      const gl = (c?.getContext('webgl2') ?? c?.getContext('webgl')) as WebGLRenderingContext | null;
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        canvas: c ? `${c.width}x${c.height}` : null,
        renderer: gl && dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl ? 'webgl (no debug info)' : 'canvas2d/none',
        images: performance.getEntriesByType('resource').filter((e) => /\.(png|webp)$/.test(e.name)).map((e) => e.name.split('/').pop()),
      };
    });
    log('gpu', JSON.stringify(results.gpu));
    // ---- mobile profile: same session, phone viewport + touch, CPU 4x
    if (want('mobile-walk')) {
      await page.setViewportSize({ width: 390, height: 844 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await sleep(1500);
      results.mobileWalk = await measure('mobile-walk', page, cdp, (stop) => walk(page, stop), PROFILE);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    // ---- 20-minute style memory check is separate (--only memory); here a heap snapshot of growth over the windows
    if (want('night-home')) {
      for (const b of bots) b.stopActivity();
      await toNight(g);
      await sleep(4000);
      results.nightHome = await measure('night-home', page, cdp);
    }
    if (want('memory')) {
      // long session: N windows back-to-back while walking, heap after forced GC each time
      const n = Number(arg('memwin', '6'));
      const heap: number[] = [];
      for (let i = 0; i < n; i++) {
        await measure(`mem-${i}`, page, cdp, (stop) => walk(page, stop));
        await cdp.send('HeapProfiler.collectGarbage');
        heap.push(Math.round(((await metrics(cdp)).JSHeapUsedSize ?? 0) / 1048576 * 10) / 10);
        log('heap after GC (MB)', heap.join(' '));
      }
      results.memory = { windowsS: WIN_S, heapAfterGcMb: heap };
    }
    results.pageErrors = errors.slice(0, 10);
    if (want('load')) results.loadTown = await loadTiming(browser, base, true, 'town');
    await ctx.close();
  } finally {
    for (const b of bots) b.stopActivity();
    await Promise.all(bots.map((b) => b.leave().catch(() => undefined)));
    await browser.close();
    await server.stop();
  }
  writeFileSync(path.join(OUT, 'client-perf.json'), JSON.stringify(results, null, 1));
  log('wrote', path.join(OUT, 'client-perf.json'));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
