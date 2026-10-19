// v3 perf recon (front "load", v3-perf-load): time-to-first-v3-frame and time-to-interactive from a v3 lobby join,
// plus every fetch of the v3 load path (count, bytes, cache headers, waterfall) and the warm-up cost
// (programs, long tasks, heap). ONE headless Chromium on SwiftShader (CPU only, never GPU flags on the host),
// own throwaway server on --ports (v3-perf-load: 3486-3487), a client build served from --dist.
//
// Scenario: a Storyteller bot creates a `world: 'v3'` lobby; --bots player bots join and stand at the spawn
// (remote rigs to build, once avatars are wired); the browser then opens /lobby/<id> as a fresh player with
// ct.debug.v3force=1 (SwiftShader would otherwise pick Classic, game3d/select.ts row 6) and ct.debug.camera=1.
// Milestones (performance.now() from navigation start, recorded in the page):
//   lobbyChunk   LobbyRoute-*.js finished           town3dStart / town3dEnd   the town3d chunk request
//   layoutEnd    the hollowmere layout chunk        canvas     .ct-game-canvas canvas exists
//   ready        __ctCamera.v3().ready (after the warm-up)   loadingGone  "Lighting the lamps…" removed
//   firstFrame   the first rAF after ready          moved      first frame the own avatar moved after a key press
//   avatars      every bot pid has __ctCamera.avatar(pid) (only once WP2 is wired; else null)
// TTI here = `moved`: the key is pressed right after `ready`, so it includes the first frames' long tasks.
// Also: long tasks (count, sum, max, before/after ready), frame times for 3 s after ready, JS heap, programs /
// calls / tris (`__ctCamera.v3()`), and per response: URL, bytes (encoded), Cache-Control, timing. --bundle
// <v3-bundle.json> (scripts/perf/v3-bundle.mjs --json of the SAME dist) labels chunks (piece / interior /
// character …) and reports whether the piece chunks were fetched one after another (the buildTown waterfall).
//
// Run ON THE HOST (heavy + browser locks for the whole window; report the load average):
//   CT_AGENT=v3-perf-load scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
//     timeout 1200 pnpm exec tsx tests/perf/v3-load.ts --dist <dist> --bundle /tmp/v3b.json --out /tmp/v3-load'
// Options: --bots 14  --throttle 4 (CDP CPU)  --net slow4g|fast|none  --warm yes (second, cached visit)
//          --tier low|high (ct.fxQuality)  --fps 0 (ct.debug.fps; 0 = uncapped)  --timeout 600 (s, per visit)
//          --viewport 1280x720  --ports 3486-3487
// Numbers are SwiftShader + CPU throttle: relative (before/after an optimisation), never device frame times.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';
import { makeBots, type Bot } from '../support/bot.js';
import { pickPort, REPO_ROOT, startServer } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const DIST = path.resolve(REPO_ROOT, arg('dist', 'apps/client/dist'));
const OUT = path.resolve(arg('out', '/tmp/ct-v3-load'));
const BOTS = Number(arg('bots', '14'));
const THROTTLE = Number(arg('throttle', '4'));
const NET = arg('net', 'slow4g');
const WARM = arg('warm', 'yes') === 'yes';
const TIER = arg('tier', 'low');
const FPS = Number(arg('fps', '0'));
const TIMEOUT_S = Number(arg('timeout', '600'));
const [VW, VH] = arg('viewport', '1280x720').split('x').map(Number) as [number, number];
const BUNDLE = arg('bundle', '');
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[v3-load ${new Date().toISOString().slice(11, 19)}]`, ...a);
const NAME_SHIM = 'globalThis.__name = globalThis.__name || ((f) => f);';
/** SwiftShader only (INTEGRATION.md §6.2; the base of v3/pixel3d/charkit/tools/shot.mjs glArgs). Never GPU flags. */
// --gl swiftshader (default, the recon method) | gpu (the host GPU via ANGLE/Vulkan, allowed since 2026-10-18)
const GL_ARGS = arg('gl', 'swiftshader') === 'gpu' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const NETS: Record<string, { latency: number; down: number; up: number } | null> = {
  slow4g: { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 }, // as tests/perf/client-perf.ts loadTiming
  fast: { latency: 40, down: (10 * 1024 * 1024) / 8, up: (5 * 1024 * 1024) / 8 },
  none: null,
};

/** Chunk labels from a v3-bundle.mjs JSON of the same dist (file -> kind:id). */
function bundleLabels(): Map<string, string> {
  const m = new Map<string, string>();
  if (!BUNDLE || !existsSync(BUNDLE)) return m;
  const j = JSON.parse(readFileSync(BUNDLE, 'utf8')) as {
    summary: { pieces: { id: string }[] };
    chunks: Record<string, { facade: string | null; isEntry: boolean }>;
  };
  for (const [file, c] of Object.entries(j.chunks)) {
    const f = c.facade ?? '';
    let x: RegExpExecArray | null;
    let label = '';
    if (/^assets\/town3d-/.test(file)) label = 'town3d';
    else if (/^assets\/LobbyRoute-/.test(file)) label = 'LobbyRoute';
    else if (/^assets\/TownGame-/.test(file)) label = 'classic:TownGame';
    else if (c.isEntry) label = 'entry';
    else if ((x = /town\/pieces\/([^/]+)\.js$/.exec(f))) label = `piece:${x[1]}`;
    else if (/town\/life\/index\.js$/.test(f)) label = 'piece:life';
    else if ((x = /town\/interiors\/(house-\d+)\.js$/.exec(f))) label = `interior:${x[1]}`;
    else if ((x = /pixel3d\/characters\/([^/]+)\.js$/.exec(f))) label = `character:${x[1]}`;
    else if ((x = /pixel3d\/src\/ambient\/(.+)\.js$/.exec(f))) label = `ambient:${x[1]}`;
    else if (/hollowmere/.test(f)) label = 'layoutV3';
    else if (/v3atlas/.test(f)) label = 'v3atlas';
    else if (f) label = `chunk:${f.replace(/^.*\/(src|pixel3d)\//, '')}`;
    else label = 'shared';
    m.set(file, label);
  }
  return m;
}

/** Page-side recorder, installed before any page script. */
function probes(opts: { tier: string; fps: number }) {
  type W = Window & {
    __v3load: {
      marks: Record<string, number>;
      longTasks: { start: number; dur: number }[];
      frames: number[];
      heap: Record<string, number>;
      info: Record<string, unknown>;
      moveFrom: number | null;
      keyAt: number | null;
    };
    __ctCamera?: { v3?: () => { ready?: boolean } & Record<string, unknown>; me?: () => { x: number; y: number }; avatar?: (pid: string) => unknown };
  };
  const w = window as unknown as W;
  const R: W['__v3load'] = { marks: {}, longTasks: [], frames: [], heap: {}, info: {}, moveFrom: null, keyAt: null };
  w.__v3load = R;
  const mark = (k: string) => {
    if (R.marks[k] === undefined) R.marks[k] = Math.round(performance.now());
  };
  try {
    performance.setResourceTimingBufferSize(4000);
  } catch {
    /* ignore */
  }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) R.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* no longtask API */
  }
  const heap = (k: string) => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (m) R.heap[k] = Math.round(m.usedJSHeapSize / 1048576);
  };
  let sawLoading = false;
  let lastT = 0;
  let framesLeft = -1;
  const raf = (t: number) => {
    if (document.querySelector('.ct-game-canvas canvas')) mark('canvas');
    const loading = !!document.querySelector('.ct-game-loading');
    if (loading) sawLoading = true;
    else if (sawLoading) mark('loadingGone');
    const cam = w.__ctCamera;
    if (R.marks.ready === undefined) {
      try {
        if (cam?.v3?.()?.ready) {
          mark('ready');
          heap('ready');
          framesLeft = 180; // ~3 s of frame times after ready
        }
      } catch {
        /* not yet */
      }
    } else {
      mark('firstFrame');
      if (framesLeft > 0) {
        if (lastT) R.frames.push(Math.round((t - lastT) * 10) / 10);
        framesLeft--;
      }
    }
    if (R.keyAt !== null && R.marks.moved === undefined && cam?.me) {
      const p = cam.me();
      if (R.moveFrom === null) R.moveFrom = p.x;
      else if (Math.abs(p.x - R.moveFrom) > 0.5) mark('moved');
    }
    lastT = t;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  window.addEventListener(
    'keydown',
    () => {
      if (R.keyAt === null) {
        R.keyAt = Math.round(performance.now());
        R.moveFrom = null;
      }
    },
    true,
  );
  try {
    localStorage.setItem('ct.intro.seen', '1');
    localStorage.setItem('ct.hint.move.v1', '1');
    localStorage.setItem('ct.hint.social.v1', '1');
    localStorage.setItem('ct.help.seen', '1');
    localStorage.setItem('ct.debug.camera', '1');
    localStorage.setItem('ct.debug.v3force', '1');
    localStorage.setItem('ct.graphics', 'v3');
    localStorage.setItem('ct.fxQuality', opts.tier === 'high' ? 'high' : 'low');
    if (opts.fps > 0) localStorage.setItem('ct.debug.fps', String(opts.fps));
    else localStorage.removeItem('ct.debug.fps');
  } catch {
    /* ignore */
  }
}

const q = (v: number[], p: number) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};

interface Resp {
  url: string;
  type: string;
  status: number;
  bytes: number;
  cacheControl: string;
  contentType: string;
  fromCache: boolean;
  start: number;
  end: number;
  label: string;
}

async function visit(browser: Browser, base: string, lobbyId: string, bots: Bot[], labels: Map<string, string>, run: { name: string; cold: boolean; ctx?: import('@playwright/test').BrowserContext }) {
  const ctx = run.ctx ?? (await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 }));
  if (!run.ctx) {
    await ctx.addInitScript({ content: NAME_SHIM });
    await ctx.addInitScript(probes, { tier: TIER, fps: FPS });
  }
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /\[town|\[town3d|pixel/.test(m.text()))) errors.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  const cdp: CDPSession = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: run.cold });
  const net = NETS[NET] ?? null;
  if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.down, uploadThroughput: net.up });
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const resp = new Map<string, Partial<Resp> & { ts0?: number }>();
  let navTs: number | null = null; // CDP monotonic seconds of the navigation request
  cdp.on('Network.requestWillBeSent', (e: { requestId: string; timestamp: number; type?: string; request: { url: string } }) => {
    if (navTs === null && e.type === 'Document') navTs = e.timestamp;
    resp.set(e.requestId, { url: e.request.url.replace(base, ''), ts0: e.timestamp, type: e.type ?? '?' });
  });
  cdp.on('Network.responseReceived', (e: { requestId: string; type: string; response: { status: number; headers: Record<string, string>; fromDiskCache?: boolean; fromPrefetchCache?: boolean } }) => {
    const r = resp.get(e.requestId);
    if (!r) return;
    const h = Object.fromEntries(Object.entries(e.response.headers).map(([k, v]) => [k.toLowerCase(), v]));
    Object.assign(r, { type: e.type, status: e.response.status, cacheControl: h['cache-control'] ?? '', contentType: h['content-type'] ?? '', fromCache: !!(e.response.fromDiskCache || e.response.fromPrefetchCache) });
  });
  cdp.on('Network.loadingFinished', (e: { requestId: string; timestamp: number; encodedDataLength: number }) => {
    const r = resp.get(e.requestId);
    if (!r || r.ts0 === undefined) return;
    r.bytes = e.encodedDataLength;
    (r as { tsEnd?: number }).tsEnd = e.timestamp;
  });

  const load0 = os.loadavg();
  log(`${run.name}: navigate (cold=${run.cold}, net=${NET}, cpu x${THROTTLE}, tier=${TIER})`);
  await page.goto(`${base}/lobby/${lobbyId}`, { waitUntil: 'commit' });
  const deadline = Date.now() + TIMEOUT_S * 1000;
  const marks = async () => page.evaluate(() => (window as unknown as { __v3load: { marks: Record<string, number> } }).__v3load.marks);
  let m = await marks();
  let goneAt = 0;
  while (m.ready === undefined && Date.now() < deadline) {
    await sleep(250);
    m = await marks().catch(() => m);
    // a Classic fallback (crash) removes the loading overlay without ever reporting v3().ready: stop after 10 s
    if (m.loadingGone !== undefined) {
      goneAt ||= Date.now();
      if (Date.now() - goneAt > 10_000) break;
    }
  }
  const readyOk = m.ready !== undefined;
  // TTI probe: hold D for 600 ms right away
  if (readyOk) {
    await page.keyboard.down('KeyD');
    const t = Date.now();
    while (Date.now() - t < 15_000) {
      m = await marks();
      if (m.moved !== undefined) break;
      await sleep(100);
    }
    await page.keyboard.up('KeyD');
  }
  // avatars (WP2 wired): every bot pid drawn
  let avatarsAt: number | null = null;
  const pids = bots.map((b) => (b.latest['lobby:view'] as { youPid?: string } | undefined)?.youPid).filter((x): x is string => !!x);
  const hasAvatarHook = readyOk && (await page.evaluate(() => typeof (window as unknown as { __ctCamera?: { avatar?: unknown } }).__ctCamera?.avatar === 'function').catch(() => false));
  if (hasAvatarHook && pids.length) {
    const t = Date.now();
    while (Date.now() - t < 240_000) {
      const n = await page.evaluate((ids) => ids.filter((id) => !!(window as unknown as { __ctCamera: { avatar(p: string): unknown } }).__ctCamera.avatar(id)).length, pids).catch(() => 0);
      if (n >= pids.length) {
        avatarsAt = await page.evaluate(() => Math.round(performance.now()));
        break;
      }
      await sleep(250);
    }
  }
  await sleep(3500); // frame window after ready
  const page1 = await page.evaluate(() => {
    const w = window as unknown as {
      __v3load: { marks: Record<string, number>; longTasks: { start: number; dur: number }[]; frames: number[]; heap: Record<string, number>; keyAt: number | null };
      __ctCamera?: { v3?: () => Record<string, unknown> };
    };
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (m) w.__v3load.heap.after = Math.round(m.usedJSHeapSize / 1048576);
    let v3: Record<string, unknown> | null = null;
    try {
      v3 = w.__ctCamera?.v3?.() ?? null;
    } catch {
      v3 = null;
    }
    const res = performance.getEntriesByType('resource').map((e) => {
      const r = e as PerformanceResourceTiming;
      return { url: new URL(r.name).pathname, start: Math.round(r.startTime), end: Math.round(r.responseEnd), transfer: r.transferSize, body: r.encodedBodySize, decoded: r.decodedBodySize, initiator: r.initiatorType };
    });
    return { ...w.__v3load, v3, res, gl: (window as unknown as { __pixel?: { gpu?: unknown } }).__pixel?.gpu ?? null };
  });
  const load1 = os.loadavg();

  // ---- network table (CDP responses, times relative to the navigation request)
  const rows: Resp[] = [];
  for (const r of resp.values()) {
    if (!r.url || r.ts0 === undefined) continue;
    const file = r.url.replace(/^\//, '').replace(/\?.*$/, '');
    const end = (r as { tsEnd?: number }).tsEnd;
    rows.push({
      url: r.url,
      type: r.type ?? '?',
      status: r.status ?? 0,
      bytes: r.bytes ?? 0,
      cacheControl: r.cacheControl ?? '',
      contentType: r.contentType ?? '',
      fromCache: !!r.fromCache,
      start: navTs !== null ? Math.round((r.ts0 - navTs) * 1000) : 0,
      end: navTs !== null && end ? Math.round((end - navTs) * 1000) : -1,
      label: labels.get(file) ?? (/\.png$/.test(file) ? 'png' : /\.json$/.test(file) ? 'json' : /\.webp$/.test(file) ? 'webp' : /\.css$/.test(file) ? 'css' : file.startsWith('api/') ? 'api' : ''),
    });
  }
  rows.sort((a, b) => a.start - b.start);
  const byLabel = (re: RegExp) => rows.filter((r) => re.test(r.label));
  const town3d = rows.find((r) => r.label === 'town3d') ?? rows.find((r) => /\/assets\/town3d-/.test(r.url));
  const lobbyChunk = rows.find((r) => /\/assets\/LobbyRoute-/.test(r.url));
  const layout = rows.find((r) => r.label === 'layoutV3');
  const pieces = byLabel(/^piece:/);
  // the buildTown waterfall: a piece request that starts after the previous piece finished = serial
  let serial = 0;
  for (let i = 1; i < pieces.length; i++) if (pieces[i]!.start >= pieces[i - 1]!.end - 5) serial++;
  const sum = (xs: Resp[]) => xs.reduce((a, r) => a + r.bytes, 0);
  const kinds: Record<string, { n: number; bytes: number }> = {};
  for (const r of rows) {
    const k = r.label.split(':')[0] || r.type;
    (kinds[k] ??= { n: 0, bytes: 0 }).n++;
    kinds[k].bytes += r.bytes;
  }
  const afterLobby = lobbyChunk ? rows.filter((r) => r.start >= lobbyChunk.start) : rows;
  const lt = page1.longTasks;
  const ready = page1.marks.ready ?? null;
  const ltBefore = ready === null ? lt : lt.filter((t) => t.start < ready);
  const ltAfter = ready === null ? [] : lt.filter((t) => t.start >= ready);
  const ltSum = (xs: { dur: number }[]) => xs.reduce((a, t) => a + t.dur, 0);
  const result = {
    run: run.name,
    cold: run.cold,
    net: NET,
    cpuThrottle: THROTTLE,
    tier: TIER,
    viewport: `${VW}x${VH}`,
    gl: page1.gl,
    hostLoadavg: { before: load0.map((x) => Math.round(x * 100) / 100), after: load1.map((x) => Math.round(x * 100) / 100) },
    ok: readyOk,
    errors: errors.slice(0, 20),
    marksMs: {
      lobbyChunkEnd: lobbyChunk?.end ?? null,
      town3dStart: town3d?.start ?? null,
      town3dEnd: town3d?.end ?? null,
      layoutEnd: layout?.end ?? null,
      piecesFirstStart: pieces[0]?.start ?? null,
      piecesLastEnd: pieces.length ? Math.max(...pieces.map((p) => p.end)) : null,
      ...page1.marks,
      keyAt: page1.keyAt,
      avatars: avatarsAt,
    },
    ttfV3FrameMs: page1.marks.firstFrame ?? null,
    ttiMs: page1.marks.moved ?? null,
    keyToMoveMs: page1.marks.moved !== undefined && page1.keyAt !== null ? page1.marks.moved - page1.keyAt : null,
    warmupMs: ready !== null && town3d?.end ? ready - town3d.end : null,
    longTasks: {
      beforeReady: { n: ltBefore.length, sumMs: ltSum(ltBefore), maxMs: Math.max(0, ...ltBefore.map((t) => t.dur)) },
      afterReady: { n: ltAfter.length, sumMs: ltSum(ltAfter), maxMs: Math.max(0, ...ltAfter.map((t) => t.dur)) },
      top: [...lt].sort((a, b) => b.dur - a.dur).slice(0, 10),
    },
    framesAfterReady: { n: page1.frames.length, p50: q(page1.frames, 0.5), p95: q(page1.frames, 0.95), max: page1.frames.length ? Math.max(...page1.frames) : null },
    heapMiB: page1.heap,
    v3: page1.v3,
    network: {
      requests: rows.length,
      bytes: sum(rows),
      afterLobby: { requests: afterLobby.length, bytes: sum(afterLobby) },
      kinds,
      pieces: { n: pieces.length, bytes: sum(pieces), serialSteps: serial },
      notImmutableAssets: rows.filter((r) => r.url.startsWith('/assets/') && !/immutable/.test(r.cacheControl)).map((r) => r.url),
      fromCache: rows.filter((r) => r.fromCache).length,
      duplicateUrls: Object.entries(rows.reduce<Record<string, number>>((a, r) => ((a[r.url] = (a[r.url] ?? 0) + 1), a), {})).filter(([, n]) => n > 1),
    },
    waterfall: rows.map((r) => ({ s: r.start, e: r.end, kb: Math.round(r.bytes / 102.4) / 10, label: r.label, url: r.url.length > 70 ? r.url.slice(0, 70) + '…' : r.url, cc: r.cacheControl })),
    resourceTiming: page1.res.length,
  };
  log(`${run.name}:`, JSON.stringify({ ok: result.ok, marksMs: result.marksMs, keyToMoveMs: result.keyToMoveMs, warmupMs: result.warmupMs, longTasks: result.longTasks.beforeReady, frames: result.framesAfterReady, heap: result.heapMiB, net: { requests: result.network.requests, bytes: result.network.bytes, pieces: result.network.pieces }, v3: result.v3 && { programs: result.v3.programs, calls: result.v3.calls, tris: result.v3.tris, tier: result.v3.tier }, load: result.hostLoadavg }));
  await page.close();
  return { result, ctx };
}

async function main() {
  const [pLo, pHi] = arg('ports', '3486-3487').split('-').map(Number) as [number, number];
  const port = await pickPort(pLo, pHi);
  const server = await startServer({
    mode: 'source',
    port,
    env: {
      CLIENT_DIST: DIST,
      LOBBY_IDLE_TIMEOUT_SEC: '300',
      LIVEKIT_URL: 'wss://perf-fake.livekit.invalid',
      LIVEKIT_API_KEY: 'APIperffake',
      LIVEKIT_API_SECRET: 'perf-secret-0123456789abcdef0123456789abcdef',
    },
  });
  const base = server.url;
  log('server', base, 'dist', DIST, 'loadavg', os.loadavg().map((x) => x.toFixed(2)).join(' '));
  const labels = bundleLabels();
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const results: unknown[] = [];
  let bots: Bot[] = [];
  try {
    const all = await makeBots(BOTS + 1, 'V3L', base, server.wsUrl, { record: false });
    const st = all[0]!;
    bots = all.slice(1);
    const r = await st.api.createLobby({ name: 'v3 load', maxPlayers: 15, takeStoryteller: true, world: 'v3' } as never);
    if (r.status !== 200 && r.status !== 201) throw new Error(`createLobby ${r.status}: ${r.text.slice(0, 200)}`);
    const lobby = (r.body as { lobby: { id: string; world?: string } }).lobby;
    if (lobby.world !== 'v3') throw new Error(`lobby world is ${lobby.world}, not v3`);
    await st.join(lobby.id, 'storyteller');
    for (const b of bots) await b.join(lobby.id);
    await sleep(1500);
    log(`lobby ${lobby.id}: 1 storyteller + ${bots.length} player bots`);
    // a fresh account for the browser (session cookie in its context)
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: NAME_SHIM });
    await ctx.addInitScript(probes, { tier: TIER, fps: FPS });
    const acc = await ctx.request.post(base + '/api/auth/create', { data: { displayName: 'V3Load' } });
    if (acc.status() >= 300) throw new Error(`account ${acc.status()}`);
    const cold = await visit(browser, base, lobby.id, bots, labels, { name: 'cold', cold: true, ctx });
    results.push(cold.result);
    if (WARM) {
      // the same tab context, HTTP cache on (a reload / second lobby with the immutable chunks cached)
      const warm = await visit(browser, base, lobby.id, bots, labels, { name: 'warm', cold: false, ctx });
      results.push(warm.result);
    }
    await ctx.close();
  } finally {
    for (const b of bots) await b.leave().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await server.stop();
  }
  const out = path.join(OUT, 'v3-load.json');
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), dist: DIST, args: argv, results }, null, 1));
  log('wrote', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
