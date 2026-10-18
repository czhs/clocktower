// v3 perf recon, front "chars" (CT_AGENT=v3-perf-chars): the REAL-APP lobby-switch leak test (INTEGRATION.md §1.3
// step 5 "Leak test", §7 "JS heap < 10 MB growth across 5 mount/destroy"). Complements tests/perf/v3-memory.ts
// (component level, no TownGame3d): this one drives the shipped client (a `pnpm build` dist) through the SPA router,
// so GameScreen / TownGame3d (or Classic TownGame) mount and destroy exactly as a player switching lobbies does.
//
//   own server (127.0.0.1:<port>, never 3000/3001) + 2 lobbies of the chosen --world, each with --bots bot players
//   wandering; ONE headless Chromium (SwiftShader, CPU only); the browser player alternates A, B, A, B, … via the
//   app's own router (history.pushState + 'ct:navigate', ui/common/route.ts), --dwell seconds in each town, then
//   back to the home screen. After every visit (on the home screen, town destroyed): forced GC, JS heap, DOM nodes,
//   JS event listeners, documents (CDP Memory.getDOMCounters + Performance.getMetrics) and live-object counts of
//   page-global classes (CDP Runtime.queryObjects): canvases, WebGL / WebGL2 / 2D contexts, AudioContext, WebSocket,
//   ResizeObserver / MutationObserver / IntersectionObserver, images, Workers. In the town (before leaving):
//   __ctCamera.v3() (renderer calls / programs) when the v3 renderer is up.
//   Leak rule: heap growth after-visit-1 -> after-visit-N < 10 MiB; canvases / WebGL contexts / WebSockets /
//   AudioContexts / observers back to the after-visit-1 count.
//
// v2 lobbies (Classic) work today and give the Classic baseline; v3 lobbies need the wired v3 town (C1): with
// --world v3 the init script sets ct.debug.v3force=1 (SwiftShader), ct.debug.fps=15, ct.fxQuality=low.
//
// Prereq: a client build (pnpm --filter @ct/client build). Run ON THE HOST, holding the locks for the whole run:
//   CT_AGENT=v3-perf-chars scripts/remote.sh sh -c 'cat /proc/loadavg; flock $HOME/clocktower/v3-heavy.lock \
//     flock $HOME/clocktower/browser.lock nice -n 19 pnpm exec tsx tests/perf/v3-lobby-switch.ts --world v2 \
//     --port 3491 --out test-results/v3-perf-chars; cat /proc/loadavg'
// Options: --world v2|v3 --switches 5 --bots 4 --dwell 15 --dist apps/client/dist --port 3491 --out <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import path from 'node:path';
import { chromium, type CDPSession, type Page } from '@playwright/test';
import { makeBots, type Bot } from '../support/bot.js';
import { REPO_ROOT, startServer } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const WORLD = arg('world', 'v2') === 'v3' ? 'v3' : 'v2';
const SWITCHES = Number(arg('switches', '5'));
const BOTS = Number(arg('bots', '4'));
const DWELL_S = Number(arg('dwell', '15'));
const DIST = path.resolve(REPO_ROOT, arg('dist', 'apps/client/dist'));
const PORT = Number(arg('port', '3491'));
const OUT = path.resolve(REPO_ROOT, arg('out', 'test-results/v3-perf-chars'));
if (PORT < 3490 || PORT > 3491) throw new Error('--port must be in the v3-perf-chars range 3490-3491');
mkdirSync(OUT, { recursive: true });
const log = (...a: unknown[]) => console.error(`[lobby-switch ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** tsx (esbuild keepNames) wraps functions in `__name(...)`; functions serialised into the page need it. */
const NAME_SHIM = 'globalThis.__name = globalThis.__name || ((f) => f);';

const CLASSES = ['HTMLCanvasElement', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'CanvasRenderingContext2D', 'AudioContext', 'WebSocket', 'ResizeObserver', 'MutationObserver', 'IntersectionObserver', 'HTMLImageElement', 'Worker'];

async function liveCounts(cdp: CDPSession): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const c of CLASSES) {
    try {
      const ev = (await cdp.send('Runtime.evaluate', { expression: `typeof ${c} === 'function' ? ${c}.prototype : undefined`, objectGroup: 'sw' })) as { result: { objectId?: string } };
      if (!ev.result.objectId) {
        out[c] = null;
        continue;
      }
      const qo = (await cdp.send('Runtime.queryObjects', { prototypeObjectId: ev.result.objectId, objectGroup: 'sw' })) as { objects: { objectId?: string } };
      const n = (await cdp.send('Runtime.callFunctionOn', { objectId: qo.objects.objectId!, functionDeclaration: 'function(){return this.length}', returnByValue: true })) as { result: { value: number } };
      out[c] = n.result.value;
    } catch {
      out[c] = null;
    }
  }
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'sw' }).catch(() => undefined);
  return out;
}

async function snap(cdp: CDPSession, label: string) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(300);
  await cdp.send('HeapProfiler.collectGarbage');
  const r = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  const m = Object.fromEntries(r.metrics.map((x) => [x.name, x.value]));
  const dc = (await cdp.send('Memory.getDOMCounters')) as { documents: number; nodes: number; jsEventListeners: number };
  const s = { label, heapMiB: Math.round(((m.JSHeapUsedSize ?? 0) / 1048576) * 10) / 10, domNodes: dc.nodes, documents: dc.documents, jsEventListeners: dc.jsEventListeners, live: await liveCounts(cdp) };
  log('snap', JSON.stringify(s));
  return s;
}

const go = (page: Page, id: string | null) =>
  page.evaluate((lobby) => {
    const r = lobby ? { name: 'lobby', id: lobby, intent: 'player' } : { name: 'home' };
    history.pushState(r, '', lobby ? `/lobby/${lobby}` : '/');
    window.dispatchEvent(new CustomEvent('ct:navigate', { detail: r }));
  }, id);

async function main(): Promise<boolean> {
  const server = await startServer({ mode: 'source', port: PORT, env: { CLIENT_DIST: DIST, LOBBY_IDLE_TIMEOUT_SEC: '600' } });
  const base = server.url;
  const results: Record<string, unknown> = { at: new Date().toISOString(), world: WORLD, switches: SWITCHES, botsPerLobby: BOTS, dwellS: DWELL_S, dist: path.relative(REPO_ROOT, DIST), loadavgBefore: loadavg().map((x) => Math.round(x * 100) / 100), method: 'client dist via own server, headless Chromium SwiftShader, SPA router lobby switches' };
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const bots: Bot[] = [];
  let ok = false;
  try {
    bots.push(...(await makeBots(2 * BOTS, `sw${Math.random().toString(36).slice(2, 5)}-`, base, server.wsUrl, { record: false })));
    const lobbies: string[] = [];
    for (let k = 0; k < 2; k++) {
      const host = bots[k * BOTS]!;
      const id = await host.createLobby(`Switch ${k}`, 15, false, { world: WORLD });
      for (const b of bots.slice(k * BOTS, (k + 1) * BOTS)) {
        await b.join(id);
        b.startWandering(10);
      }
      lobbies.push(id);
    }
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: NAME_SHIM });
    await ctx.addInitScript((world: string) => {
      try {
        for (const [k, v] of Object.entries({ 'ct.intro.seen': '1', 'ct.hint.move.v1': '1', 'ct.help.seen': '1', 'ct.debug.camera': '1' })) localStorage.setItem(k, v);
        if (world === 'v3') for (const [k, v] of Object.entries({ 'ct.debug.v3force': '1', 'ct.debug.fps': '15', 'ct.fxQuality': 'low' })) localStorage.setItem(k, v);
      } catch {
        /* about:blank */
      }
    }, WORLD);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 300));
    });
    await page.goto(base + '/');
    const r = await page.request.post(base + '/api/auth/create', { data: { displayName: 'Switcher' } });
    if (r.status() >= 300) throw new Error(`account: ${r.status()}`);
    await page.goto(base + '/');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
    const snaps: unknown[] = [await snap(cdp, 'home (before any town)')];
    const visits: unknown[] = [];
    for (let k = 0; k < SWITCHES; k++) {
      const id = lobbies[k % 2]!;
      const t0 = Date.now();
      await go(page, id);
      let canvasMs: number | null = null;
      try {
        await page.locator('.ct-game-canvas canvas').first().waitFor({ timeout: 180_000 });
        canvasMs = Date.now() - t0;
      } catch {
        await page.screenshot({ path: path.join(OUT, `lobby-switch-${WORLD}-${k}-nocanvas.png`) }).catch(() => undefined);
      }
      await sleep(DWELL_S * 1000);
      const inTown = await page.evaluate(() => {
        const cam = (window as unknown as { __ctCamera?: { v3?: () => unknown } }).__ctCamera;
        let v3: unknown = null;
        try {
          v3 = cam?.v3?.() ?? null;
        } catch {
          v3 = 'threw';
        }
        return { v3, canvases: document.getElementsByTagName('canvas').length, nodes: document.getElementsByTagName('*').length };
      });
      await go(page, null);
      await sleep(3000);
      visits.push({ visit: k + 1, lobby: k % 2 ? 'B' : 'A', canvasMs, inTown });
      snaps.push(await snap(cdp, `home after visit ${k + 1}`));
    }
    type S = { heapMiB: number; domNodes: number; jsEventListeners: number; live: Record<string, number | null> };
    const first = snaps[1] as S;
    const last = snaps[snaps.length - 1] as S;
    const leak = {
      heapGrowthMiB_visit1_to_N: Math.round((last.heapMiB - first.heapMiB) * 10) / 10,
      domNodesGrowth_visit1_to_N: last.domNodes - first.domNodes,
      listenersGrowth_visit1_to_N: last.jsEventListeners - first.jsEventListeners,
      liveGrowth_visit1_to_N: Object.fromEntries(CLASSES.map((c) => [c, (last.live[c] ?? 0) - (first.live[c] ?? 0)])),
    };
    const lg = leak.liveGrowth_visit1_to_N as Record<string, number>;
    ok = visits.every((v) => (v as { canvasMs: number | null }).canvasMs !== null) && leak.heapGrowthMiB_visit1_to_N < 10 && ['HTMLCanvasElement', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'WebSocket', 'AudioContext', 'ResizeObserver'].every((c) => (lg[c] ?? 0) <= 0);
    Object.assign(results, { visits, snaps, leak, pass: ok, errors: errors.slice(0, 30) });
    log('leak', JSON.stringify(leak), ok ? 'PASS' : 'FAIL');
    await ctx.close();
  } finally {
    for (const b of bots) b.stopActivity();
    await Promise.all(bots.map((b) => b.leave().catch(() => undefined)));
    await browser.close();
    await server.stop();
    results.loadavgAfter = loadavg().map((x) => Math.round(x * 100) / 100);
    writeFileSync(path.join(OUT, `lobby-switch-${WORLD}.json`), JSON.stringify(results, null, 1));
    log('wrote', path.join(OUT, `lobby-switch-${WORLD}.json`));
  }
  return ok;
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
