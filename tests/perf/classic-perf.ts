// v3 perf recon (front "classic", CT_AGENT=v3-perf-classic): the v2 Classic (Phaser) client in a v2 OR a v3
// (Hollowmere, Classic-in-v3, INTEGRATION.md §2.5) lobby, measured on the build host with SOFTWARE GL ONLY
// (SwiftShader; the host GPU is not ours to use, INTEGRATION.md §6.3). Sibling of tests/perf/client-perf.ts
// (which it does not change) with what that script cannot see:
//   * `rendersPerSec`   rAF ticks in which the page issued >= 1 WebGL draw call = frames Phaser actually rendered
//                       (client-perf's `fps` counts browser rAF callbacks, so the low tier's 30 fps cap and
//                       FrameGate skips were invisible, perf-v2.2-results.md v2.4 P1 follow-up).
//   * `drawsPerRender`  WebGL draw calls per rendered frame; `texUploadKiBPerSec` texImage2D/texSubImage2D bytes
//                       per second (Phaser Text labels and dynamic textures re-upload on every change).
//   * `gpuTextures`     live texture memory (RGBA8 estimate, level 0) + the largest textures by size: cast sheet,
//                       terrain / terrain-v3 atlases, the baked ground RenderTexture, light RT.
//   * `canvas`          canvas px vs CSS px = the tier's render scale (0.75 = low tier) and the GL renderer string.
// The script REFUSES to measure when the GL renderer is not software (SwiftShader / llvmpipe).
//
// Scenario (both worlds): 1 Storyteller bot + 14 player bots + the browser as the 15th player, day, every bot
// teleported outdoors by the Storyteller and walking random straight legs on the lobby's own layout (bots in
// tests/support/bot.ts plan on the v2 layout only, so this script drives their `move`s itself), the browser
// player teleported to an open outdoor walk spot of the lobby's layout. `--clock yes` (default) runs a stage
// timer on the clock tower (TownScene.drawTownClock wedge = the v2.4 per-frame earcut leftover).
// Windows (each --win s): desktop-idle, desktop-walk, mobile-walk (390x844, 4x CPU), gather (seated in the nomination
// circle, 1440x900), night-home; `load` =
// Slow-4G phone cold load of / and of a lobby of the same world (bytes by type, auth screen / town idle ms).
// JSON keys desktopWalk / mobileWalk / loadAuth / loadTown match scripts/perf/budgets.mjs --client / --load.
//
// Prereq: a client build of the tree under test (pnpm --filter @ct/client build; for --profile use an
// unminified one: pnpm --filter @ct/client exec vite build --minify false --outDir dist-nomin).
// Run (host, heavy + browser locks for the whole window, own ports 3494-3495):
//   CT_AGENT=v3-perf-classic scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
//     pnpm exec tsx tests/perf/classic-perf.ts --ports 3494-3495 --world v3 --out /tmp/ct-v3pc/v3 --win 20'
// Options: --world v2|v3 (default v2; v3 needs a tree with @ct/assets/hollowmere), --only a,b, --profile yes|no
// (CPU profile of the walk + gather windows; summarise with tests/perf/cpuprofile-summary.ts --focus
// earcut,isEarHashed,batchFillPath,drawTownClock,update), --quality auto|low|medium|high, --clock yes|no,
// --bots 15 (total incl. the Storyteller), --dist apps/client/dist.
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { makeBots, type Bot } from '../support/bot.js';
import { toDay, toNight, until, type Game } from '../support/game.js';
import { pickPort, REPO_ROOT, startServer } from '../support/server.js';
import { isBlockedPx, locationAt, PLAYER_SPEED, type TownLayout } from '../../packages/protocol/src/index.js';
import { townLayout } from '../../packages/assets/src/index.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const DIST = path.resolve(REPO_ROOT, arg('dist', 'apps/client/dist'));
const WIN_S = Number(arg('win', '20'));
const PROFILE = arg('profile', 'no') === 'yes';
const OUT = path.resolve(arg('out', '/tmp/ct-v3pc'));
const ONLY = arg('only', '');
const WORLD = arg('world', 'v2') as 'v2' | 'v3';
const CLOCK = arg('clock', 'yes') === 'yes';
const N_BOTS = Math.max(2, Math.min(15, Number(arg('bots', '15'))));
if (argv.includes('--gpu')) throw new Error('classic-perf measures software GL only (no --gpu on the host)');
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[classic-perf ${new Date().toISOString().slice(11, 19)}]`, ...a);
const want = (n: string) => !ONLY || ONLY.split(',').includes(n);
const NAME_SHIM = 'globalThis.__name = globalThis.__name || ((f) => f);';
// CPU-only GL (the e2e `v3` project's args, INTEGRATION.md §6.2). Never GPU flags on the host.
const SW_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Installed before any page script: rAF + WebGL draw/upload counters, texture registry, DOM mutations, long tasks. */
function probes() {
  type Tex = { w: number; h: number; src: string; uploads: number; at: number };
  const P = {
    on: false,
    frames: [] as number[],
    renders: 0,
    renderGaps: [] as number[],
    draws: 0,
    uploadBytes: 0,
    uploads: 0,
    muts: 0,
    by: {} as Record<string, number>,
    longTasks: [] as number[],
    reset() {
      this.frames = [];
      this.renders = 0;
      this.renderGaps = [];
      this.draws = 0;
      this.uploadBytes = 0;
      this.uploads = 0;
      this.muts = 0;
      this.by = {};
      this.longTasks = [];
    },
  };
  const w = window as unknown as { __cp: typeof P & { tex: Map<object, Tex> } };
  const tex = new Map<object, Tex>();
  let drawsTotal = 0;
  w.__cp = Object.assign(P, { tex });
  // ---- WebGL instrumentation (both WebGL1 and WebGL2; Phaser 3 uses webgl1, pixel3d/three webgl2)
  const bound = new WeakMap<object, object | null>();
  const srcOf = (s: unknown): { w: number; h: number; src: string } | null => {
    if (!s || typeof s !== 'object') return null;
    const o = s as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number; videoWidth?: number; src?: string; constructor?: { name?: string } };
    const w = o.naturalWidth || o.videoWidth || o.width || 0;
    const h = o.naturalHeight || o.height || 0;
    const src = typeof o.src === 'string' && o.src && !o.src.startsWith('blob:') ? o.src.split('/').pop()!.split('?')[0]! : o.constructor?.name ?? 'source';
    return { w, h, src };
  };
  for (const C of [window.WebGLRenderingContext, (window as unknown as { WebGL2RenderingContext?: typeof WebGLRenderingContext }).WebGL2RenderingContext]) {
    if (!C) continue;
    const pr = C.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
      const orig = pr[fn];
      if (!orig) continue;
      pr[fn] = function (this: unknown, ...a: unknown[]) {
        drawsTotal++;
        if (P.on) P.draws++;
        return orig.apply(this, a);
      };
    }
    const bind = pr.bindTexture!;
    pr.bindTexture = function (this: object, ...a: unknown[]) {
      bound.set(this, (a[1] as object | null) ?? null);
      return bind.apply(this, a);
    };
    const del = pr.deleteTexture!;
    pr.deleteTexture = function (this: object, ...a: unknown[]) {
      if (a[0]) tex.delete(a[0] as object);
      return del.apply(this, a);
    };
    const up = (name: string, sub: boolean) => {
      const orig = pr[name];
      if (!orig) return;
      pr[name] = function (this: object, ...a: unknown[]) {
        try {
          const level = a[1] as number;
          let d: { w: number; h: number; src: string } | null = null;
          if (name === 'texStorage2D') d = { w: a[3] as number, h: a[4] as number, src: 'storage' };
          else if (!sub && a.length >= 9) d = { w: a[3] as number, h: a[4] as number, src: a[8] ? 'pixels' : 'empty(rt)' };
          else if (!sub) d = srcOf(a[5]);
          else if (a.length >= 9) d = { w: a[4] as number, h: a[5] as number, src: 'sub' };
          else d = srcOf(a[6]);
          if (d && level === 0) {
            const t = bound.get(this);
            if (!sub && t) {
              const prev = tex.get(t);
              tex.set(t, { w: d.w, h: d.h, src: d.src, uploads: (prev?.uploads ?? 0) + 1, at: prev?.at ?? Math.round(performance.now()) });
            } else if (sub && t) {
              const prev = tex.get(t);
              if (prev) prev.uploads++;
            }
            if (P.on && d.src !== 'empty(rt)' && d.src !== 'storage') {
              P.uploads++;
              P.uploadBytes += d.w * d.h * 4;
            }
          }
        } catch {
          /* never break the page */
        }
        return orig.apply(this, a);
      };
    };
    up('texImage2D', false);
    up('texSubImage2D', true);
    up('texStorage2D', false);
  }
  // ---- frames: browser rAF ticks, and ticks in which a render happened (draws since the previous tick)
  let last = 0;
  let lastDraws = 0;
  let lastRender = 0;
  const raf = (t: number) => {
    if (P.on && last) {
      P.frames.push(t - last);
      if (drawsTotal !== lastDraws) {
        P.renders++;
        if (lastRender) P.renderGaps.push(t - lastRender);
        lastRender = t;
      }
    }
    if (!P.on) lastRender = 0;
    lastDraws = drawsTotal;
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
        while (el && !(el.getAttribute('class') ?? '').trim() && el.parentElement) el = el.parentElement;
        const k = `${m.type}${m.attributeName ? ':' + m.attributeName : ''} ${el ? el.tagName.toLowerCase() + '.' + (el.getAttribute('class') ?? '').trim().split(/\s+/).slice(0, 2).join('.') : '?'}`;
        P.by[k] = (P.by[k] ?? 0) + n;
      }
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
    localStorage.setItem('ct.debug.camera', '1');
    localStorage.setItem('ct.graphics', 'classic'); // v3-game tree: a v3 lobby must render Classic here
  } catch {
    /* ignore */
  }
}

const q = (v: number[], p: number) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]! * 10) / 10;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
async function metrics(cdp: CDPSession) {
  const r = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
}

/** Canvas size vs CSS size (= tier render scale) and the GL renderer string. */
const canvasInfo = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.ct-game-canvas canvas') as HTMLCanvasElement | null;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      px: `${c.width}x${c.height}`,
      css: `${Math.round(r.width)}x${Math.round(r.height)}`,
      renderScale: r.width ? Math.round((c.width / r.width) * 100) / 100 : null,
      renderer: gl && dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : gl ? 'webgl (no debug info)' : 'none',
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
    };
  });

/** Live texture registry: total RGBA8 MiB and the largest textures. */
const gpuTextures = (page: Page) =>
  page.evaluate(() => {
    type T = { w: number; h: number; src: string; uploads: number; at: number };
    const t = [...(window as unknown as { __cp: { tex: Map<object, T> } }).__cp.tex.values()];
    const mib = (x: { w: number; h: number }) => (x.w * x.h * 4) / 1048576;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const total = t.reduce((a, x) => a + mib(x), 0);
    // histogram: same size + kind -> count, MiB, first/last creation time (ms after navigation)
    const groups = new Map<string, { n: number; mib: number; at0: number; at1: number; uploads: number }>();
    for (const x of t) {
      const k = `${x.w}x${x.h} ${x.src}`;
      const g = groups.get(k) ?? { n: 0, mib: 0, at0: Infinity, at1: 0, uploads: 0 };
      g.n++;
      g.mib += mib(x);
      g.at0 = Math.min(g.at0, x.at);
      g.at1 = Math.max(g.at1, x.at);
      g.uploads += x.uploads;
      groups.set(k, g);
    }
    const byKind: Record<string, { n: number; mib: number }> = {};
    for (const x of t) {
      const b = (byKind[x.src] ??= { n: 0, mib: 0 });
      b.n++;
      b.mib = r1(b.mib + mib(x));
    }
    return {
      count: t.length,
      totalMiB: r1(total),
      byKind,
      groups: [...groups.entries()]
        .sort((a, b) => b[1].mib - a[1].mib)
        .slice(0, 24)
        .map(([k, g]) => `${g.n}x ${k} = ${r1(g.mib)}MiB (created ${Math.round(g.at0 / 1000)}-${Math.round(g.at1 / 1000)} s, uploads ${g.uploads})`),
    };
  });

let diag: ((page: Page) => Promise<unknown>) | null = null;

async function measure(name: string, page: Page, cdp: CDPSession, during?: (stop: () => boolean) => Promise<void>, profile = false) {
  await page.evaluate(() => {
    const p = (window as unknown as { __cp: { reset(): void; on: boolean } }).__cp;
    p.reset();
    p.on = true;
  });
  const m0 = await metrics(cdp);
  if (profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  const load0 = loadavg()[0]!;
  const t0 = Date.now();
  let done = false;
  const act = during ? during(() => done) : Promise.resolve();
  await sleep(WIN_S * 1000);
  done = true;
  await act;
  let profFile: string | null = null;
  if (profile) {
    const { profile: prof } = (await cdp.send('Profiler.stop')) as { profile: unknown };
    profFile = path.join(OUT, `classic-${WORLD}-${name}.cpuprofile`);
    writeFileSync(profFile, JSON.stringify(prof));
  }
  const m1 = await metrics(cdp);
  const secs = (Date.now() - t0) / 1000;
  const p = await page.evaluate(() => {
    const x = (window as unknown as { __cp: { frames: number[]; renders: number; renderGaps: number[]; draws: number; uploads: number; uploadBytes: number; muts: number; by: Record<string, number>; longTasks: number[]; on: boolean } }).__cp;
    x.on = false;
    return { frames: x.frames, renders: x.renders, renderGaps: x.renderGaps, draws: x.draws, uploads: x.uploads, uploadBytes: x.uploadBytes, muts: x.muts, by: x.by, longTasks: x.longTasks };
  });
  const d = (k: string) => (m1[k] ?? 0) - (m0[k] ?? 0);
  const res = {
    name,
    world: WORLD,
    secs: r1(secs),
    fps: r1(p.frames.length / secs),
    rendersPerSec: r1(p.renders / secs),
    frameMs: { p50: q(p.frames, 0.5), p95: q(p.frames, 0.95), p99: q(p.frames, 0.99), max: Math.round(Math.max(0, ...p.frames)) },
    renderGapMs: { p50: q(p.renderGaps, 0.5), p95: q(p.renderGaps, 0.95), p99: q(p.renderGaps, 0.99) },
    framesOver33ms: p.frames.filter((f) => f > 33.4).length,
    drawsPerRender: p.renders ? r1(p.draws / p.renders) : 0,
    texUploadsPerSec: r1(p.uploads / secs),
    texUploadKiBPerSec: r1(p.uploadBytes / 1024 / secs),
    mainThreadBusyPct: r1((d('TaskDuration') / secs) * 100),
    scriptPct: r1((d('ScriptDuration') / secs) * 100),
    layoutPlusStylePct: r1(((d('LayoutDuration') + d('RecalcStyleDuration')) / secs) * 100),
    layoutsPerSec: r1(d('LayoutCount') / secs),
    styleRecalcsPerSec: r1(d('RecalcStyleCount') / secs),
    jsHeapMb: Math.round((m1.JSHeapUsedSize ?? 0) / 1048576),
    jsHeapDeltaMb: r1(d('JSHeapUsedSize') / 1048576),
    domNodes: m1.Nodes,
    domMutationsPerSec: r1(p.muts / secs),
    domMutationsTop: Object.entries(p.by)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, n]) => `${r1(n / secs)}/s ${k}`),
    longTasks: { n: p.longTasks.length, maxMs: Math.round(Math.max(0, ...p.longTasks)) },
    canvas: await canvasInfo(page),
    textures: await gpuTextures(page).then((g) => ({ count: g.count, totalMiB: g.totalMiB })),
    hostLoad1m: { before: r1(load0), after: r1(loadavg()[0]!) },
    profFile,
    scene: diag ? await diag(page) : undefined,
  };
  log(JSON.stringify(res));
  return res;
}

type Me = { x: number; y: number; location?: string } | null;
const readMe = (page: Page) => page.evaluate(() => ((window as unknown as { __ctCamera?: { me(): unknown } }).__ctCamera?.me() ?? null) as Me).catch(() => null);
const MIN_WALK_PX = 100;
const LEG_MS = 1200;

/**
 * An open outdoor spot for the walk window (client-perf's rule, any layout): first a spot whose whole D→S→A→W loop box
 * (+ margin) is walkable, outdoors and away from doors; Hollowmere (v3) is denser (trees, fences, props), so then a
 * smaller margin, then a straight strip walked back and forth (D/A, or S/W). Nearest to the square centre wins.
 */
type WalkSpot = { x: number; y: number; keys: string[]; shape: string };
function openWalkSpot(L: TownLayout): WalkSpot {
  const leg = (PLAYER_SPEED * LEG_MS) / 1000;
  const doors = L.buildings.map((b) => ({ x: (b.door.x + 0.5) * L.tileSize, y: (b.door.y + 0.5) * L.tileSize }));
  const free = (x0: number, y0: number, w: number, h: number, m: number, padTiles: number) => {
    const pad = m + L.tileSize * padTiles;
    if (doors.some((d) => d.x > x0 - pad && d.x < x0 + w + pad && d.y > y0 - pad && d.y < y0 + h + pad)) return false;
    for (let x = x0 - m; x <= x0 + w + m; x += 4)
      for (let y = y0 - m; y <= y0 + h + m; y += 4) if (isBlockedPx(L, x, y) || locationAt(L, x, y) !== 'outdoors') return false;
    return true;
  };
  const { cx, cy } = L.square;
  const tries: { shape: string; w: number; h: number; m: number; pad: number; keys: string[] }[] = [
    { shape: 'loop', w: leg, h: leg, m: 28, pad: 1.5, keys: ['KeyD', 'KeyS', 'KeyA', 'KeyW'] },
    { shape: 'loop-tight', w: leg, h: leg, m: 12, pad: 1, keys: ['KeyD', 'KeyS', 'KeyA', 'KeyW'] },
    { shape: 'strip-x', w: leg, h: 0, m: 14, pad: 1, keys: ['KeyD', 'KeyA'] },
    { shape: 'strip-y', w: 0, h: leg, m: 14, pad: 1, keys: ['KeyS', 'KeyW'] },
  ];
  for (const t of tries) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let x = 32; x < L.widthTiles * L.tileSize - t.w - 32; x += 8)
      for (let y = 32; y < L.heightTiles * L.tileSize - t.h - 32; y += 8) {
        const d = Math.hypot(x + t.w / 2 - cx, y + t.h / 2 - cy);
        if ((!best || d < best.d) && free(x, y, t.w, t.h, t.m, t.pad)) best = { x, y, d };
      }
    if (best) return { x: best.x, y: best.y, keys: t.keys, shape: t.shape };
  }
  throw new Error('no open outdoor walk spot in the layout');
}

/** Random open outdoor points near the square (bot placement). */
function outdoorPoints(L: TownLayout, n: number, avoid: { x: number; y: number }): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const { cx, cy } = L.square;
  for (let i = 0; i < 4000 && out.length < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = 40 + Math.random() * 220;
    const x = Math.round(cx + Math.cos(a) * rr);
    const y = Math.round(cy + Math.sin(a) * rr);
    if (x < 8 || y < 8 || isBlockedPx(L, x, y) || locationAt(L, x, y) !== 'outdoors') continue;
    if (Math.hypot(x - avoid.x, y - avoid.y) < 60 || out.some((p) => Math.hypot(p.x - x, p.y - y) < 18)) continue;
    out.push({ x, y });
  }
  return out;
}

/** Layout-aware bot walking (straight legs, collision checked on L, stays outdoors), `move` at 10 Hz. */
function wander(bot: Bot, L: TownLayout, hz = 10): () => void {
  const b = bot as unknown as { room: { send(t: string, m: unknown): void } | null; pos: { x: number; y: number } | null; seq: number; location: string };
  let goal: { x: number; y: number } | null = null;
  let pause = 0;
  let facing: 'down' | 'up' | 'left' | 'right' = 'down';
  const dt = 1 / hz;
  const t = setInterval(() => {
    if (!b.room || !b.pos || b.location !== 'outdoors') return;
    if (pause > 0) {
      pause -= dt;
      return;
    }
    if (!goal) {
      for (let i = 0; i < 20 && !goal; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = 32 + Math.random() * 120;
        const g = { x: b.pos.x + Math.cos(a) * rr, y: b.pos.y + Math.sin(a) * rr };
        if (!isBlockedPx(L, g.x, g.y) && locationAt(L, g.x, g.y) === 'outdoors') goal = g;
      }
      if (goal && Math.random() < 0.3) pause = 0.5 + Math.random() * 2;
    }
    let moving = false;
    if (goal) {
      const dx = goal.x - b.pos.x;
      const dy = goal.y - b.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.min(dist, PLAYER_SPEED * 0.9 * dt);
      const nx = b.pos.x + (dist ? (dx / dist) * step : 0);
      const ny = b.pos.y + (dist ? (dy / dist) * step : 0);
      if (dist < 1 || isBlockedPx(L, nx, ny) || locationAt(L, nx, ny) !== 'outdoors') goal = null;
      else {
        facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        b.pos = { x: nx, y: ny };
        moving = true;
      }
    }
    try {
      b.room.send('move', { seq: b.seq++, x: r1(b.pos.x), y: r1(b.pos.y), facing, moving });
    } catch {
      /* closing */
    }
  }, 1000 / hz);
  return () => clearInterval(t);
}

let WALK_KEYS = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
async function walk(page: Page, stop: () => boolean, track: WalkTrack) {
  const keys = WALK_KEYS;
  let i = 0;
  let last: Me = await readMe(page);
  track.start = last;
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      await sleep(200);
      const m = await readMe(page);
      if (m && last && m.location === last.location) {
        track.path += Math.hypot(m.x - last.x, m.y - last.y);
        track.samples++;
      }
      if (m && m.location !== 'outdoors') track.leftOutdoors = m.location ?? '?';
      if (m) last = m;
    }
  })();
  while (!stop()) {
    const k = keys[i++ % keys.length]!;
    await page.keyboard.down(k);
    await sleep(LEG_MS);
    await page.keyboard.up(k);
  }
  sampling = false;
  await sampler;
  track.end = await readMe(page);
  track.path = Math.round(track.path);
}
type WalkTrack = { path: number; start: Me; end: Me; samples: number; leftOutdoors: string | null };
let toWalkSpot: ((page: Page) => Promise<void>) | null = null;

async function walkWindow(name: string, page: Page, cdp: CDPSession, profile: boolean) {
  if (toWalkSpot) await toWalkSpot(page);
  const track: WalkTrack = { path: 0, start: null, end: null, samples: 0, leftOutdoors: null };
  const res = await measure(name, page, cdp, (stop) => walk(page, stop, track), profile);
  const moved = { ...track, minPx: MIN_WALK_PX, ok: track.path >= MIN_WALK_PX && !track.leftOutdoors };
  log(name, 'moved', JSON.stringify(moved));
  if (!moved.ok) throw new Error(`${name}: invalid walk window (path ${track.path} px; left outdoors: ${track.leftOutdoors})`);
  return { ...res, moved };
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
  const out: Record<string, unknown> = { label, world: WORLD };
  let t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'Create account' }).first().waitFor({ timeout: 120_000 });
  out.authScreenMs = Date.now() - t0;
  await page.waitForLoadState('load');
  out.authLoadEventMs = Date.now() - t0;
  out.authBytes = { ...bytes };
  out.authFiles = files.splice(0).sort((a, b) => b.bytes - a.bytes).slice(0, 14);
  for (const k of Object.keys(bytes)) delete bytes[k];
  if (town) {
    const r = await page.request.post(base + '/api/auth/create', { data: { displayName: `Load${label}` } });
    if (r.status() >= 300) throw new Error(`account: ${r.status()}`);
    const l = await page.request.post(base + '/api/lobbies', { data: { name: `Load ${label}`, maxPlayers: 6, ...(WORLD === 'v3' ? { world: 'v3' } : {}) } });
    if (l.status() >= 300) throw new Error(`lobby: ${l.status()} ${await l.text()}`);
    const lobbyId = ((await l.json()) as { lobby: { id: string } }).lobby.id;
    t0 = Date.now();
    await page.goto(`${base}/lobby/${lobbyId}`, { waitUntil: 'commit' });
    await page.locator('.ct-game-canvas canvas').waitFor({ timeout: 180_000 });
    out.townCanvasMs = Date.now() - t0;
    await page.locator('.ct-game-loading').waitFor({ state: 'detached', timeout: 180_000 }).catch(() => undefined);
    // The Phaser scene's create() (atlases + map loaded and decoded) installs the opt-in __ctCamera hook. Without
    // this wait, software GL + 4x CPU boots Phaser so slowly that `networkidle` fires before preload starts and
    // the atlases are not counted at all (client-perf.ts has the same gap; its v2.4 numbers were on a GPU).
    await page.waitForFunction(() => !!(window as unknown as { __ctCamera?: unknown }).__ctCamera, null, { timeout: 180_000 }).catch(() => undefined);
    out.townSceneMs = Date.now() - t0;
    await page.waitForLoadState('networkidle', { timeout: 180_000 }).catch(() => undefined);
    out.townNetworkIdleMs = Date.now() - t0;
    out.townBytes = { ...bytes };
    out.townFiles = files.splice(0).sort((a, b) => b.bytes - a.bytes).slice(0, 16);
    out.gpuTextures = await gpuTextures(page);
    out.canvas = await canvasInfo(page);
  }
  log('load', JSON.stringify(out));
  await ctx.close();
  return out;
}

async function main() {
  const [pLo, pHi] = arg('ports', '3494-3495').split('-').map(Number) as [number, number];
  const port = await pickPort(pLo, pHi);
  let L: TownLayout = townLayout;
  if (WORLD === 'v3') L = ((await import('../../packages/assets/src/hollowmere/layoutV3.js')) as { townLayoutV3: TownLayout }).townLayoutV3;
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
  log('server', base, 'dist', DIST, 'world', WORLD, 'host load', loadavg().map(r1).join(' '), 'cores', cpus().length);
  const browser = await chromium.launch({ headless: true, args: SW_ARGS });
  const results: Record<string, unknown> = { tool: 'classic-perf', dist: path.relative(REPO_ROOT, DIST) || DIST, world: WORLD, winS: WIN_S, clock: CLOCK, bots: N_BOTS, hostLoadStart: loadavg().map(r1) };
  const bots: Bot[] = [];
  const stops: (() => void)[] = [];
  try {
    if (want('load')) results.loadAuth = await loadTiming(browser, base, false, 'auth');
    bots.push(...(await makeBots(N_BOTS, `cl${Math.random().toString(36).slice(2, 5)}-`, base, server.wsUrl, { record: false })));
    const [st, ...players] = bots as [Bot, ...Bot[]];
    const lobbyId =
      WORLD === 'v3'
        ? await (async () => {
            const r = await st.api.createLobby({ name: 'Perf v3', maxPlayers: 15, takeStoryteller: true, world: 'v3' } as never);
            if (r.status !== 200 && r.status !== 201) throw new Error(`createLobby v3 ${r.status}: ${r.text.slice(0, 200)}`);
            return (r.body as { lobby: { id: string } }).lobby.id;
          })()
        : await st.createLobby('Perf town', 15, true);
    await st.join(lobbyId, 'storyteller');
    for (const p of players) await p.join(lobbyId);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: NAME_SHIM });
    await ctx.addInitScript(probes);
    const quality = arg('quality', '');
    if (quality)
      await ctx.addInitScript((qv: string) => {
        try {
          localStorage.setItem('ct.fxQuality', qv);
        } catch {
          /* about:blank */
        }
      }, quality);
    const page = await ctx.newPage();
    await page.goto(base + '/');
    const acc = await page.request.post(base + '/api/auth/create', { data: { displayName: 'Perfy' } });
    if (acc.status() >= 300) throw new Error(`account: ${acc.status()} ${await acc.text()}`);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/lobby/${lobbyId}`);
    await page.getByRole('button', { name: "I'm ready" }).click({ timeout: 60_000 });
    for (const p of players) p.send('lobby:ready', { ready: true });
    await until(() => st.lobbyView?.canStart, 15_000, 'canStart');
    const g = { lobbyId, st, players, seatOf: new Map(), grimoire: [], stView: () => st.gameView as never, cmd: (c: unknown) => st.send('st:command', c) } as unknown as Game;
    st.send('lobby:start', {});
    await st.waitFor<{ kind?: string }>('game:view', (v) => v?.kind === 'storyteller', 10_000);
    g.cmd({ type: 'random_setup' });
    await until(() => ((st.gameView as { grimoire?: unknown[] })?.grimoire?.length ?? 0) === N_BOTS, 8000, 'grimoire');
    g.cmd({ type: 'begin_first_night' });
    await until(() => (st.gameView as { phase?: string })?.phase === 'first_night', 8000, 'first night');
    await sleep(1500);
    await toDay(g);
    log('day');
    if (CLOCK) g.cmd({ type: 'day_clock', action: 'set', stage: 'discussion', minutes: 30 });
    const spot = openWalkSpot(L);
    WALK_KEYS = spot.keys;
    results.walkSpot = spot;
    log('walk spot', JSON.stringify(spot));
    const grim = () => ((st.gameView as { grimoire?: { seat: number; name: string }[] })?.grimoire ?? []);
    const browserSeat = () => grim().find((e) => e.name === 'Perfy')?.seat;
    // every bot outdoors (Storyteller teleport onto open points near the square), then walking
    const pts = outdoorPoints(L, players.length, spot);
    for (const [i, p] of players.entries()) {
      const seat = (p.gameView as { you?: { seat: number } })?.you?.seat;
      const pt = pts[i % Math.max(1, pts.length)];
      if (seat !== undefined && pt) g.cmd({ type: 'teleport', who: [seat], to: { kind: 'point', x: pt.x, y: pt.y } });
    }
    await until(() => players.filter((p) => p.location === 'outdoors').length >= Math.min(players.length, 10), 20_000, 'bots outdoors').catch(() => log('warn: bots not outdoors'));
    for (const p of players) stops.push(wander(p, L));
    toWalkSpot = async (pg) => {
      const seat = browserSeat();
      if (seat === undefined) throw new Error('browser seat not found');
      for (let attempt = 0; attempt < 3; attempt++) {
        g.cmd({ type: 'teleport', who: [seat], to: { kind: 'point', x: spot.x, y: spot.y } });
        const t0 = Date.now();
        while (Date.now() - t0 < 4000) {
          const m = await readMe(pg);
          if (m && m.location === 'outdoors' && Math.hypot(m.x - spot.x, m.y - spot.y) < 24) {
            await sleep(500);
            return;
          }
          await sleep(200);
        }
      }
      throw new Error(`could not place the browser player on the walk spot: ${JSON.stringify(await readMe(pg))}`);
    };
    await toWalkSpot(page);
    const town = await page.evaluate(() => (window as unknown as { __ctCamera?: { town?(): unknown } }).__ctCamera?.town?.() ?? null);
    results.town = town;
    if (WORLD === 'v3' && (town as { world?: string } | null)?.world !== 'v3') throw new Error(`Classic does not draw the v3 town: ${JSON.stringify(town)}`);
    diag = async (pg) => ({
      botsConnected: bots.filter((b) => b.room).length,
      botsOutdoors: players.filter((b) => b.room && b.location === 'outdoors').length,
      botErrors: bots.reduce((n, b) => n + b.errors.length, 0),
      me: await readMe(pg),
      clock: !!(st.gameView as { clock?: unknown })?.clock,
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
    const cv = await canvasInfo(page);
    results.canvasAtStart = cv;
    log('canvas', JSON.stringify(cv));
    if (!cv || !/SwiftShader|llvmpipe|Software/i.test(cv.renderer)) throw new Error(`refusing to measure: GL renderer is not software (${cv?.renderer})`);
    await sleep(3000);
    if (want('desktop-idle')) results.desktopIdle = await measure('desktop-idle', page, cdp);
    if (want('desktop-walk')) results.desktopWalk = await walkWindow('desktop-walk', page, cdp, PROFILE);
    results.gpuTextures = await gpuTextures(page);
    log('gpuTextures', JSON.stringify(results.gpuTextures));
    if (want('mobile-walk')) {
      await page.setViewportSize({ width: 390, height: 844 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await sleep(1500);
      results.mobileWalk = await walkWindow('mobile-walk', page, cdp, PROFILE);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    // ---- gathered nomination circle: 15 seat markers drawn by gameplay/phaserView.ts every frame (fillEllipse /
    // strokeEllipse paths = earcut per frame; never profiled in v2.4, which measured the day walk only)
    if (want('gather')) {
      for (const s of stops.splice(0)) s();
      g.cmd({ type: 'gather', on: true });
      await sleep(500);
      g.cmd({ type: 'teleport', who: 'all', to: { kind: 'seat' } });
      await sleep(4000);
      results.gather = await measure('gather', page, cdp, undefined, PROFILE);
      g.cmd({ type: 'gather', on: false });
      await sleep(500);
    }
    if (want('night-home')) {
      for (const s of stops.splice(0)) s();
      await toNight(g);
      await sleep(4000);
      results.nightHome = await measure('night-home', page, cdp);
    }
    results.pageErrors = errors.slice(0, 10);
    if (want('load')) results.loadTown = await loadTiming(browser, base, true, 'town');
    await ctx.close();
  } finally {
    for (const s of stops) s();
    for (const b of bots) b.stopActivity();
    await Promise.all(bots.map((b) => b.leave().catch(() => undefined)));
    await browser.close();
    await server.stop();
  }
  results.hostLoadEnd = loadavg().map(r1);
  const file = path.join(OUT, `classic-perf-${WORLD}.json`);
  writeFileSync(file, JSON.stringify(results, null, 1));
  // budgets.mjs --client / --load read this name
  writeFileSync(path.join(OUT, 'client-perf.json'), JSON.stringify(results, null, 1));
  log('wrote', file);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
