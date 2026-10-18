// v3 perf, front "ui" (v3-perf-ui): the DOM/CSS cost of a v3 GAME SCREEN (HUD, social palette, chat, voice chips,
// overlay labels) in a real 15-player game, in headless Chromium on the host GPU (ANGLE/Vulkan; CT_GL=swiftshader for
// CPU raster). Own throwaway server (127.0.0.1:3480-3484, never 3000/3001) serving a client build; 1 Storyteller bot +
// 14 player bots wandering at 10 Hz + the browser as the 15th player, in a Hollowmere (world 'v3') lobby.
//
// Windows (each --win seconds):
//   idle    standing outdoors by day, 15 others wandering
//   walk    walking a WASD square on an open outdoor spot (Storyteller teleport first)
//   vote    a 15-seat nomination vote running (clock hand moving, hands going up), the page standing
// Per window: DOM mutations/s (MutationObserver on <body>: all, and without the overlay's per-frame `style`
// transform writes) + the top churning elements, style recalcs/s, layouts/s, layout+style ms/s (CDP
// Performance.getMetrics), long tasks, rAF fps, the overlay's own counters (__ctCamera.overlay()).
// Static: the CSS on the page (bytes per stylesheet), the images decoded (resource timing + decoded size).
//
// Prereq: a client build (pnpm --filter @ct/client build). Run ON THE HOST holding the heavy lock EXCLUSIVE (short):
//   CT_AGENT=v3-perf-ui scripts/remote.sh flock $HOME/clocktower/v3-heavy.lock pnpm exec tsx tests/perf/v3-ui.ts \
//     --dist apps/client/dist --win 12 --out test-results/v3-ui
// Args: --dist <dir> --win 12 --out <dir> --ports 3480-3484 --only idle,walk,vote --viewport 1440x900 --label base
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type CDPSession, type Page } from '@playwright/test';
import { makeBots, type Bot } from '../support/bot.js';
import { toDay, until, type Game } from '../support/game.js';
import { pickPort, REPO_ROOT, startServer } from '../support/server.js';
import { isBlockedPx, locationAt, PLAYER_SPEED, type PlayerGameView, type StorytellerGameView } from '../../packages/protocol/src/index.js';
import { townLayoutV3 } from '../../packages/assets/src/hollowmere/layoutV3.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const DIST = path.resolve(REPO_ROOT, arg('dist', 'apps/client/dist'));
const WIN_S = Number(arg('win', '12'));
const OUT = path.resolve(REPO_ROOT, arg('out', 'test-results/v3-ui'));
const LABEL = arg('label', 'run');
const ONLY = arg('only', '');
const [VW, VH] = arg('viewport', '1440x900').split('x').map(Number) as [number, number];
const PROFILE = arg('profile', 'no') === 'yes';
const want = (n: string) => !ONLY || ONLY.split(',').includes(n);
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[v3-ui ${new Date().toISOString().slice(11, 19)}]`, ...a);
const NAME_SHIM = 'globalThis.__name = globalThis.__name || ((f) => f);';
const GL_ARGS =
  process.env.CT_GL === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'];

type PerfWin = { frames: number[]; muts: number; mutsNoTransform: number; by: Record<string, number>; longTasks: number[]; on: boolean; reset(): void };

/** Installed before any page script: frame-time + DOM-mutation + long-task recorders, v3 + debug flags. */
function probes() {
  const w = window as unknown as { __perf: PerfWin };
  const P: PerfWin = {
    frames: [],
    muts: 0,
    mutsNoTransform: 0,
    by: {},
    longTasks: [],
    on: false,
    reset() {
      this.frames = [];
      this.muts = 0;
      this.mutsNoTransform = 0;
      this.by = {};
      this.longTasks = [];
    },
  };
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
      if (!P.on) return;
      for (const m of l) {
        const n = m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length || 1 : 1;
        P.muts += n;
        let el = (m.target.nodeType === 1 ? m.target : m.target.parentElement) as Element | null;
        // a style write that only changed transform/opacity-free placement: the overlay's per-frame placement
        let transformOnly = false;
        if (m.type === 'attributes' && m.attributeName === 'style' && el) {
          const now = (el as HTMLElement).getAttribute('style') ?? '';
          const strip = (s: string) => s.replace(/(^|;)\s*(transform|translate)\s*:[^;]*/g, '').replace(/[;\s]+/g, '');
          transformOnly = strip(now) === strip(m.oldValue ?? '');
        }
        if (!transformOnly) P.mutsNoTransform += n;
        while (el && !(el.getAttribute('class') ?? '').trim() && el.parentElement) el = el.parentElement;
        const k = `${transformOnly ? 'T ' : ''}${m.type}${m.attributeName ? ':' + m.attributeName : ''} ${el ? el.tagName.toLowerCase() + '.' + (el.getAttribute('class') ?? '').trim().split(/\s+/).slice(0, 2).join('.') : '?'}`;
        P.by[k] = (P.by[k] ?? 0) + n;
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
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
    for (const k of ['ct.intro.seen', 'ct.intro.seen.v1', 'ct.hint.move.v1', 'ct.hint.social.v1', 'ct.help.seen', 'ct.help.seen.v1', 'ct.debug.camera', 'ct.debug.v3force'])
      localStorage.setItem(k, '1');
  } catch {
    /* ignore */
  }
}

const q = (v: number[], p: number) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]! * 10) / 10;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
async function metrics(cdp: CDPSession) {
  const r = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
}
const overlayStats = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __ctCamera?: { overlay?: () => Record<string, unknown> } }).__ctCamera;
    const o = c?.overlay?.() as Record<string, unknown> | undefined;
    if (!o) return null;
    const pick: Record<string, unknown> = {};
    for (const k of ['transformsPerSec', 'visibilityPerSec', 'contentPerSec', 'mutationsPerSec', 'domWritesPerSec']) if (k in o) pick[k] = o[k];
    return pick;
  });

async function measure(name: string, page: Page, cdp: CDPSession, during?: (stop: () => boolean) => Promise<void>) {
  await page.evaluate(() => {
    const p = (window as unknown as { __perf: PerfWin }).__perf;
    p.reset();
    p.on = true;
  });
  const m0 = await metrics(cdp);
  if (PROFILE) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.send('Profiler.start');
  }
  const t0 = Date.now();
  let done = false;
  const act = during ? during(() => done) : Promise.resolve();
  await sleep(WIN_S * 1000);
  done = true;
  await act;
  const m1 = await metrics(cdp);
  const secs = (Date.now() - t0) / 1000;
  let profileByFile: string[] | undefined;
  if (PROFILE) {
    const { profile } = (await cdp.send('Profiler.stop')) as { profile: { nodes: { id: number; callFrame: { url: string; functionName: string } }[]; samples: number[]; timeDeltas: number[] } };
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self: Record<string, number> = {};
    const fns: Record<string, number> = {};
    profile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const u = n?.callFrame.url ? n.callFrame.url.split('/').pop()!.split('?')[0]! : n?.callFrame.functionName || '?';
      const dt = (profile.timeDeltas[i] ?? 0) / 1000;
      self[u] = (self[u] ?? 0) + dt;
      const f = `${u}:${n?.callFrame.functionName || '(anon)'}`;
      fns[f] = (fns[f] ?? 0) + dt;
    });
    profileByFile = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, ms]) => `${r1(ms / secs)} ms/s ${k}`);
    const ui = Object.entries(fns).filter(([k]) => /^(index|LobbyRoute|storyteller|StoryParts|SettingsDialog|v3atlas|townParts)-/.test(k));
    profileByFile.push('-- UI chunks, top functions:', ...ui.sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, ms]) => `${r1(ms / secs)} ms/s ${k}`));
  }
  const p = await page.evaluate(() => {
    const x = (window as unknown as { __perf: PerfWin }).__perf;
    x.on = false;
    return { frames: x.frames, muts: x.muts, mutsNoTransform: x.mutsNoTransform, by: x.by, longTasks: x.longTasks };
  });
  const d = (k: string) => (m1[k] ?? 0) - (m0[k] ?? 0);
  const frames = Math.max(1, p.frames.length);
  const res = {
    name,
    secs: r1(secs),
    fps: r1(p.frames.length / secs),
    frameMs: { p50: q(p.frames, 0.5), p95: q(p.frames, 0.95), max: Math.round(Math.max(0, ...p.frames)) },
    mainThreadBusyPct: r1((d('TaskDuration') / secs) * 100),
    scriptPct: r1((d('ScriptDuration') / secs) * 100),
    layoutMsPerSec: r1((d('LayoutDuration') * 1000) / secs),
    styleMsPerSec: r1((d('RecalcStyleDuration') * 1000) / secs),
    layoutsPerSec: r1(d('LayoutCount') / secs),
    styleRecalcsPerSec: r1(d('RecalcStyleCount') / secs),
    layoutsPerFrame: Math.round((d('LayoutCount') / frames) * 100) / 100,
    styleRecalcsPerFrame: Math.round((d('RecalcStyleCount') / frames) * 100) / 100,
    domNodes: m1.Nodes,
    jsHeapMb: Math.round((m1.JSHeapUsedSize ?? 0) / 1048576),
    domMutationsPerSec: r1(p.muts / secs),
    domMutationsNoTransformPerSec: r1(p.mutsNoTransform / secs),
    domMutationsTop: Object.entries(p.by)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, n]) => `${r1(n / secs)}/s ${k}`),
    longTasks: { n: p.longTasks.length, maxMs: Math.round(Math.max(0, ...p.longTasks)), totalMs: Math.round(p.longTasks.reduce((a, b) => a + b, 0)) },
    overlay: await overlayStats(page),
    profileByFile,
  };
  log(JSON.stringify(res));
  return res;
}

type Me = { x: number; y: number; location?: string } | null;
const readMe = (page: Page) => page.evaluate(() => ((window as unknown as { __ctCamera?: { me(): unknown } }).__ctCamera?.me?.() ?? null) as Me).catch(() => null);
let LEG_MS = 1200;

/** An open outdoor spot on the v3 layout whose whole D→S→A→W box is walkable outdoors, near the square. */
function openWalkSpot(): { x: number; y: number } {
  // the Hollowmere square is crowded (circle stones, well, stalls): shorter legs / no door margin when needed
  for (const [legMs, doorPad, m] of [[1200, true, 28], [800, true, 20], [800, false, 16], [500, false, 12]] as const) {
    const s = spotFor(legMs, doorPad, m);
    if (s) {
      LEG_MS = legMs;
      return s;
    }
  }
  throw new Error('no open outdoor walk spot in the v3 layout');
}
function spotFor(legMs: number, doorPad: boolean, m: number): { x: number; y: number } | null {
  const L = townLayoutV3;
  const leg = (PLAYER_SPEED * legMs) / 1000;
  const doors = L.buildings.map((b) => ({ x: (b.door.x + 0.5) * L.tileSize, y: (b.door.y + 0.5) * L.tileSize }));
  const ok = (x0: number, y0: number) => {
    const pad = m + L.tileSize * 1.5;
    if (doorPad && doors.some((d) => d.x > x0 - pad && d.x < x0 + leg + pad && d.y > y0 - pad && d.y < y0 + leg + pad)) return false;
    for (let x = x0 - m; x <= x0 + leg + m; x += 4)
      for (let y = y0 - m; y <= y0 + leg + m; y += 4) if (isBlockedPx(L, x, y) || locationAt(L, x, y) !== 'outdoors') return false;
    return true;
  };
  const { cx, cy } = L.square;
  let best: { x: number; y: number; d: number } | null = null;
  for (let x = 32; x < L.widthTiles * L.tileSize - leg - 32; x += 8)
    for (let y = 32; y < L.heightTiles * L.tileSize - leg - 32; y += 8) {
      const d = Math.hypot(x + leg / 2 - cx, y + leg / 2 - cy);
      if (best && d >= best.d) continue;
      if (ok(x, y)) best = { x, y, d };
    }
  return best ? { x: best.x, y: best.y } : null;
}

async function walk(page: Page, stop: () => boolean, track: { path: number }) {
  const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
  let i = 0;
  let last = await readMe(page);
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      await sleep(250);
      const m = await readMe(page);
      if (m && last) track.path += Math.hypot(m.x - last.x, m.y - last.y);
      if (m) last = m;
    }
  })();
  while (!stop()) {
    const k = keys[i++ % 4]!;
    await page.keyboard.down(k);
    await sleep(LEG_MS);
    await page.keyboard.up(k);
  }
  sampling = false;
  await sampler;
  track.path = Math.round(track.path);
}

async function main() {
  const [pLo, pHi] = arg('ports', '3480-3484').split('-').map(Number) as [number, number];
  if (pLo < 3480 || pHi > 3484) throw new Error('v3-perf-ui owns ports 3480-3484 only');
  const port = await pickPort(pLo, pHi);
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
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const results: Record<string, unknown> = { label: LABEL, dist: path.relative(REPO_ROOT, DIST) || DIST, winS: WIN_S, viewport: `${VW}x${VH}`, gl: process.env.CT_GL ?? 'gpu' };
  const bots: Bot[] = [];
  try {
    bots.push(...(await makeBots(15, `ui${Math.random().toString(36).slice(2, 5)}-`, base, server.wsUrl, { record: false })));
    const [st, ...players] = bots as [Bot, ...Bot[]];
    for (const b of bots) b.autoRespondEnabled = false;
    const lobbyId = await st.createLobby('UI perf town', 15, true, { world: 'v3' });
    await st.join(lobbyId, 'storyteller');
    for (const p of players) await p.join(lobbyId);
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: NAME_SHIM });
    await ctx.addInitScript(probes);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e.stack ?? e).slice(0, 600)));
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text().slice(0, 200)}`));
    const r = await page.request.post(base + '/api/auth/create', { data: { displayName: 'Perfy' } });
    if (r.status() >= 300) throw new Error(`account: ${r.status()}`);
    const tLoad = Date.now();
    await page.goto(`${base}/lobby/${lobbyId}`);
    await page.getByRole('button', { name: "I'm ready" }).click({ timeout: 60_000 });
    for (const p of players) p.send('lobby:ready', { ready: true });
    await until(() => st.lobbyView?.canStart, 20_000, 'canStart');
    // the 3D town ready (__ctCamera.v3().ready)
    const v3 = () => page.evaluate(() => (window as unknown as { __ctCamera?: { v3?: () => { ready?: boolean; gpu?: string; tier?: string } } }).__ctCamera?.v3?.() ?? null);
    for (let i = 0; i < 240 && !(await v3())?.ready; i++) await sleep(1000);
    const info = await v3();
    results.v3 = { ...(info ?? {}), readyMs: Date.now() - tLoad };
    log('v3', JSON.stringify(results.v3));
    if (!info?.ready) throw new Error('3D town not ready');
    const stView = () => st.gameView as StorytellerGameView | undefined;
    const g = { lobbyId, st, players, seatOf: new Map(), grimoire: [], stView, cmd: (c: unknown) => st.send('st:command', c) } as unknown as Game;
    st.send('lobby:start', {});
    await until(() => stView()?.kind === 'storyteller', 10_000, 'ST view');
    g.cmd({ type: 'random_setup' });
    await until(() => (stView()?.grimoire?.length ?? 0) === 15, 8000, 'grimoire');
    g.cmd({ type: 'begin_first_night' });
    await until(() => stView()?.phase === 'first_night', 8000, 'first night');
    await sleep(1500);
    await toDay(g);
    log('day');
    for (const b of bots) b.exitBuildings = true;
    st.startWandering(10, 1.5);
    for (const p of players) p.startWandering(10);
    const grim = () => stView()?.grimoire ?? [];
    const botSeats = new Set(players.map((p) => (p.gameView as PlayerGameView | undefined)?.you?.seat));
    const mySeat = () => grim().find((e) => e.name === 'Perfy')?.seat ?? grim().find((e) => !botSeats.has(e.seat))?.seat;
    const spot = openWalkSpot();
    log('walk spot', JSON.stringify(spot), 'leg ms', LEG_MS);
    const toSpot = async () => {
      const seat = mySeat();
      if (seat === undefined) throw new Error('browser seat not found');
      for (let attempt = 0; attempt < 3; attempt++) {
        g.cmd({ type: 'teleport', who: [seat], to: { kind: 'point', x: spot.x, y: spot.y } });
        const t0 = Date.now();
        while (Date.now() - t0 < 4000) {
          const m = await readMe(page);
          if (m && m.location === 'outdoors' && Math.hypot(m.x - spot.x, m.y - spot.y) < 24) return sleep(800);
          await sleep(200);
        }
      }
      log('warn: not on the walk spot', JSON.stringify(await readMe(page)));
    };
    // let every avatar build (the first seconds of a v3 day build 15 rigs) before measuring
    await sleep(12_000);
    await toSpot();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
    if (want('idle')) results.idle = await measure('idle', page, cdp);
    if (want('walk')) {
      await toSpot();
      const track = { path: 0 };
      results.walk = { ...(await measure('walk', page, cdp, (stop) => walk(page, stop, track))), walkedPx: track.path };
      log('walked px', track.path);
    }
    if (want('vote')) {
      g.cmd({ type: 'set_nominations_open', open: true });
      const [nominator, nominee] = players;
      await until(() => (nominator!.gameView as PlayerGameView | undefined)?.day?.nominationsOpen, 8000, 'nominations open');
      nominator!.send('game:nominate', { nomineeSeat: (nominee!.gameView as PlayerGameView).you.seat });
      const nom = await until(() => stView()?.day?.nominations[0], 8000, 'nomination');
      g.cmd({ type: 'start_vote', nominationId: nom.id });
      await until(() => stView()?.day?.nominations[0]?.status === 'voting', 8000, 'voting');
      // half the bots raise their hands over the first seconds
      players.slice(0, 8).forEach((b, i) => setTimeout(() => b.send('game:vote', { nominationId: nom.id, vote: true }), 300 + i * 700));
      results.vote = await measure('vote', page, cdp);
      results.voteStatusAfter = stView()?.day?.nominations[0]?.status;
    }
    results.css = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((e) => /\.css(\?|$)/.test(e.name))
        .map((e) => ({ url: e.name.split('/').pop(), transfer: (e as PerformanceResourceTiming).transferSize, body: (e as PerformanceResourceTiming).decodedBodySize })),
    );
    results.images = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((e) => /\.(png|webp|avif|jpg)(\?|$)/.test(e.name))
        .map((e) => ({ url: e.name.split('/').pop(), body: (e as PerformanceResourceTiming).decodedBodySize, start: Math.round(e.startTime) })),
    );
    results.styleSheets = await page.evaluate(() => [...document.styleSheets].map((s) => ({ href: s.href?.split('/').pop() ?? 'inline', rules: (() => { try { return s.cssRules.length; } catch { return -1; } })() })));
    results.pageErrors = errors.slice(0, 12);
    await ctx.close();
  } finally {
    for (const b of bots) b.stopActivity();
    await Promise.all(bots.map((b) => b.leave().catch(() => undefined)));
    await browser.close();
    await server.stop();
  }
  const file = path.join(OUT, `v3-ui-${LABEL}.json`);
  writeFileSync(file, JSON.stringify(results, null, 1));
  log('wrote', file);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
