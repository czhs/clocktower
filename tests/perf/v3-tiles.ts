// v3.3 tiles (v33-tiles): A/B of the cached static layer (apps/client/src/game3d/vendor/tiles.ts, ct.debug.v3tiles)
// against the live renderer, in ONE page (the town is mounted with ct.debug.v3tiles=ab: patched, switchable at run
// time through __ctCamera.tilesOn / tilesOff), so both sides see the same town, avatars and hour.
//
//   stills   the same engine time rendered live and from the tiles, read back from the canvas in the same task, diffed
//            per pixel (count of pixels whose max channel diff > 0 / 8 / 32, bounding box); PNGs of both + an amplified
//            diff in --out. Scenes: day (spawn, 10:00), cut (own player at a cottage door: the cut-away box is live),
//            vote (yaw 45 deg, pitch 23 deg over the voting circle: a fresh tile set).
//   windows  RAF windows (the real game loop, 14 remotes walking on the square), off / on alternating, standing and
//            walking (camera pans into new tiles), at CPU x1 and x4 (CDP throttle): per-frame RAF JS, renderAt JS,
//            draw calls, fps; the tile layer's own totals (bakes, worst bake ms in a frame, live fallbacks).
//   synced   back-to-back renderAt + a 1-px readPixels (raster included: the SwiftShader number), off / on.
//
// Run ON THE HOST from the repo root (Vite DEV like tests/perf/v3-frame.ts), heavy + browser lock held:
//   CT_AGENT=v33-tiles scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
//     timeout 900 pnpm exec tsx tests/perf/v3-tiles.ts --gl gpu --tier high --out test-results/v3-tiles-gpu-high'
// Args: --port 3470 (v33-tiles: 3470-3474) --gl gpu|swiftshader --tier high|low|cpu --viewport 1920x1080 --players 14
//       --secs 6 --cpu 1,4 --scenes day,cut,vote --modes stills,windows,synced --phase waiting|night --out <dir>
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const PORT = Number(arg('port', '3470'));
if (!(PORT >= 3470 && PORT <= 3474)) throw new Error('v3-tiles: ports 3470-3474 only (v33-tiles)');
const GL = arg('gl', 'gpu');
const TIER = arg('tier', 'high');
const [VW, VH] = arg('viewport', '1920x1080').split('x').map(Number) as [number, number];
const PLAYERS = Number(arg('players', '14'));
const SECS = Number(arg('secs', '6'));
const CPUS = arg('cpu', '1,4').split(',').map(Number);
const SCENES = arg('scenes', 'day,cut,vote').split(',').filter(Boolean);
const MODES = new Set(arg('modes', 'stills,windows,synced').split(','));
const PHASE = arg('phase', 'waiting');
const OUT = path.resolve(arg('out', path.join(ROOT, 'test-results/v3-tiles')));
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });
const log = (...a: unknown[]) => console.error(`[v3-tiles ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r2 = (v: number) => Math.round(v * 100) / 100;

let vite: ChildProcess | null = null;
let browser: Browser | null = null;
const watchdog = setTimeout(() => {
  log('watchdog: 14 min, aborting');
  void cleanup().finally(() => process.exit(3));
}, 14 * 60_000);

async function cleanup() {
  try {
    await browser?.close();
  } catch {
    /* gone */
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

type Json = Record<string, unknown>;

/** In-page: render the same engine time live and from the tiles, read both back, diff. */
async function still(page: Page, scene: string): Promise<Json> {
  const res = await page.evaluate(
    ({ scene }) => {
      type Cam = { set(o: Record<string, unknown>): void; target: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }; yaw: number; pitch: number; viewHeight: number };
      const P = (window as unknown as { __v3f: { engine: { renderAt(t: number): void; time: number; camera: Cam; renderer: { getContext(): WebGL2RenderingContext; domElement: HTMLCanvasElement } } } }).__v3f;
      const C = (window as unknown as { __ctCamera: Record<string, () => unknown> }).__ctCamera;
      const e = P.engine;
      const T = e.time + 0.5;
      const pose = { x: e.camera.target.x, y: e.camera.target.y, z: e.camera.target.z, yaw: e.camera.yaw, pitch: e.camera.pitch, vh: e.camera.viewHeight };
      if (scene === 'vote') {
        // a vote pose over the voting circle (input/camera's stepped vote frames use yaw 0 / +-45 deg, pitch 23 / 30 deg)
        pose.x = 22.5;
        pose.z = 19.75;
        pose.yaw = Math.PI / 4;
        pose.pitch = (23 * Math.PI) / 180;
        pose.vh = 15;
      }
      const setPose = () => {
        e.camera.target.set(pose.x, pose.y, pose.z);
        e.camera.set({ yaw: pose.yaw, pitch: pose.pitch, viewHeight: pose.vh });
      };
      const gl = e.renderer.getContext();
      const cv = e.renderer.domElement;
      const w = cv.width;
      const h = cv.height;
      const read = () => {
        const b = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
        return b;
      };
      C.tilesOff!();
      setPose();
      e.renderAt(T);
      setPose();
      e.renderAt(T);
      const A = read();
      C.tilesOn!();
      let info: { active?: boolean; frame?: { baked: number } } = {};
      let renders = 0;
      for (let k = 0; k < 40; k++) {
        setPose();
        e.renderAt(T);
        renders++;
        info = C.tiles!() as typeof info;
        if (info.active && info.frame && info.frame.baked === 0) break;
      }
      const B = read();
      const infoOn = C.tiles!();
      C.tilesOff!();
      let n0 = 0;
      let n8 = 0;
      let n32 = 0;
      let maxD = 0;
      let x0 = w;
      let y0 = h;
      let x1 = -1;
      let y1 = -1;
      const D = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const d = Math.max(Math.abs(A[i]! - B[i]!), Math.abs(A[i + 1]! - B[i + 1]!), Math.abs(A[i + 2]! - B[i + 2]!));
          const o = ((h - 1 - y) * w + x) * 4;
          D[o] = D[o + 1] = D[o + 2] = d ? Math.min(255, 64 + d * 4) : 0;
          D[o + 3] = 255;
          if (!d) continue;
          n0++;
          if (d > 8) n8++;
          if (d > 32) n32++;
          maxD = Math.max(maxD, d);
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      const png = (buf: Uint8Array | Uint8ClampedArray, flip: boolean) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const img = new ImageData(w, h);
        for (let y = 0; y < h; y++) {
          const src = flip ? (h - 1 - y) * w * 4 : y * w * 4;
          img.data.set(buf.subarray(src, src + w * 4), y * w * 4);
        }
        c.getContext('2d')!.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
      };
      return {
        w,
        h,
        renders,
        diff: { px: n0, gt8: n8, gt32: n32, pct: Math.round((n0 / (w * h)) * 1e5) / 1e3, max: maxD, bbox: n0 ? [x0, y0, x1, y1] : null },
        tiles: infoOn,
        cut: (C.stage!() as { cut?: unknown })?.cut ?? null,
        live: png(A, true),
        cached: png(B, true),
        delta: png(D, false),
      };
    },
    { scene },
  );
  for (const k of ['live', 'cached', 'delta'] as const) {
    const b64 = String(res[k]).split(',')[1]!;
    writeFileSync(path.join(OUT, `${scene}-${k}.png`), Buffer.from(b64, 'base64'));
    delete (res as Json)[k];
  }
  return res;
}

async function main() {
  vite = spawn(process.execPath, [path.join(ROOT, 'apps/client/node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: path.join(ROOT, 'apps/client'), stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  vite.stderr?.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  for (let i = 0; i < 160; i++) {
    try {
      if ((await fetch(`${BASE}/@vite/client`)).ok) break;
    } catch {
      /* not yet */
    }
    await sleep(500);
  }
  const glArgs = GL === 'gpu' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  browser = await chromium.launch({ args: [...glArgs, '--enable-precise-memory-info'] });
  const out: Json = { at: new Date().toISOString(), gl: GL, tier: TIER, viewport: [VW, VH], players: PLAYERS, phase: PHASE, load0: loadavg() };
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(600_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  await page.route(/\/(api|healthz|matchmake)(\/|$|\?)/, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(`${BASE}/__v3tiles.html`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>v3 tiles</title><body style="margin:0;background:#000"></body>' }));
  await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || ((f) => f);' });
  await page.addInitScript({ content: `${readFileSync(path.join(HERE, 'v3-frame-probe.js'), 'utf8')}\n//# sourceURL=v3-frame-probe.js` });
  await page.goto(`${BASE}/__v3tiles.html`);
  await page.evaluate((tier) => {
    localStorage.clear();
    localStorage.setItem('ct.debug.camera', '1');
    localStorage.setItem('ct.debug.v3tiles', 'ab');
    if (tier === 'low') localStorage.setItem('ct.fxQuality', 'low');
  }, TIER);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  type V3F = Record<string, (...a: never[]) => unknown>;
  const call = <T>(name: string, a: unknown = {}) => page.evaluate(([n, x]) => ((window as unknown as { __v3f: V3F }).__v3f[n as string] as (y: unknown) => T)(x), [name, a] as const) as Promise<T>;
  const cam = <T>(name: string) => page.evaluate((n) => ((window as unknown as { __ctCamera: Record<string, () => unknown> }).__ctCamera[n]?.() ?? null) as T, name);
  out.patch = await call('patchVendor');
  const gameView = PHASE === 'night' ? { kind: 'player', phase: 'night', dayNumber: 1, players: [], you: { pid: 'me', seat: 0 }, day: null, clock: null } : null;
  const mount = await call<Json>('mount', { tier: TIER, world: 'v3', players: PLAYERS, w: VW, h: VH, gameView });
  out.mount = { readyMs: mount.readyMs, readyErr: mount.readyErr, fallbacks: mount.fallbacks };
  log('mount', JSON.stringify(out.mount));
  if (mount.readyErr) throw new Error(String(mount.readyErr));
  await sleep(3000);
  out.tilesAtMount = await cam('tiles');
  log('tiles', JSON.stringify(out.tilesAtMount).slice(0, 400));

  if (MODES.has('stills')) {
    const stills: Json = {};
    for (const s of SCENES) {
      if (s === 'cut') {
        // own player at a cottage door: the vendor cut-away aims its player box + the door cottage box there
        await page.evaluate(() => {
          const m = (window as unknown as { __v3f: { m: { layout: { tileSize: number; buildings: { id: string; door: { x: number; y: number } }[] }; handlers: { get(k: string): ((x: unknown) => void) | undefined } } } }).__v3f.m;
          const b = m.layout.buildings.find((x) => x.id === 'house-3') ?? m.layout.buildings.find((x) => /^house-/.test(x.id))!;
          const T = m.layout.tileSize;
          m.handlers.get('world:teleport')?.({ seq: 1, x: (b.door.x + 0.5) * T, y: (b.door.y + 1.5) * T, location: 'outdoors', reason: 'st' });
        });
        await sleep(2500);
      }
      try {
        stills[s] = await still(page, s);
      } catch (e) {
        stills[s] = { error: String((e as Error)?.message ?? e).slice(0, 400) };
      }
      log('still', s, JSON.stringify(stills[s]).slice(0, 600));
    }
    out.stills = stills;
    // back to the spawn for the windows
    await page.evaluate(() => {
      const m = (window as unknown as { __v3f: { m: { layout: { tileSize: number; playerSpawn: { x: number; y: number } }; handlers: { get(k: string): ((x: unknown) => void) | undefined } } } }).__v3f.m;
      const T = m.layout.tileSize;
      m.handlers.get('world:teleport')?.({ seq: 2, x: m.layout.playerSpawn.x * T + T / 2, y: m.layout.playerSpawn.y * T + T - 2, location: 'outdoors', reason: 'st' });
    });
    await sleep(1500);
  }

  if (MODES.has('windows')) {
    const windows: Json[] = [];
    for (const rate of CPUS) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      for (const walk of [false, true])
        for (const mode of ['off', 'on', 'off', 'on']) {
          await cam(mode === 'on' ? 'tilesOn' : 'tilesOff');
          await call('walk', walk);
          await sleep(1200); // settle: bakes after the switch, the walk starting
          const t0 = (await cam<{ totals?: Json }>('tiles'))?.totals ?? null;
          const { metrics: mA } = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
          const split = (await call<Json>('run', { secs: SECS, minFrames: 20 })) as Json & { perFrame?: Record<string, { mean: number; p50: number; p95: number; max: number }>; fps?: number; wallMs: number };
          const { metrics: mB } = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
          const g = (m: { name: string; value: number }[], n: string) => m.find((x) => x.name === n)?.value ?? 0;
          const t1 = (await cam<{ totals?: Json }>('tiles'))?.totals ?? null;
          await call('walk', false);
          const pf = split.perFrame ?? {};
          const row = {
            cpu: rate,
            walk,
            mode,
            fps: split.fps,
            rafMs: pf.raf ?? null,
            renderAtMs: pf.renderAt ?? null,
            calls: pf.calls ?? null,
            tris: pf.tris ?? null,
            shadowCalls: pf.shadowCalls ?? null,
            stageCalls: Object.fromEntries(Object.entries((split.stageCalls ?? {}) as Record<string, { mean: number }>).map(([k, v]) => [k, v.mean])),
            tilesFrame: ((await cam<{ frame?: unknown }>('tiles')) ?? {}).frame ?? null,
            taskMsPerSec: r2(((g(mB, 'TaskDuration') - g(mA, 'TaskDuration')) * 1000) / (split.wallMs / 1000)),
            tilesDelta: t0 && t1 ? Object.fromEntries(Object.keys(t1).map((k) => [k, r2(Number(t1[k]) - Number(t0[k] ?? 0))])) : null,
            tilesMaxBakeMsFrame: t1?.maxBakeMsFrame ?? null,
          };
          windows.push(row);
          log('window', JSON.stringify(row).slice(0, 700));
        }
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    out.windows = windows;
  }

  if (MODES.has('synced')) {
    const synced: Json = {};
    for (const mode of ['off', 'on', 'off', 'on']) {
      await cam(mode === 'on' ? 'tilesOn' : 'tilesOff');
      await call('synced', { n: 4 }); // bakes / warm
      const s = (await call<Json>('synced', { n: 10 })) as Json & { total?: unknown; perFrame?: Record<string, unknown> };
      (synced[mode] ??= [] as Json[]) && (synced[mode] as Json[]).push({ total: s.total, calls: s.perFrame?.calls, renderAt: s.perFrame?.renderAt });
      log('synced', mode, JSON.stringify(s.total));
    }
    out.synced = synced;
  }
  out.tilesEnd = await cam('tiles');
  out.v3 = await page.evaluate(() => (window as unknown as { __ctCamera?: { v3?: () => unknown } }).__ctCamera?.v3?.() ?? null);
  out.errors = errors.slice(0, 40);
  out.load1 = loadavg();
  try {
    await call('destroy');
  } catch {
    /* best effort */
  }
  await ctx.close();
  const file = path.join(OUT, 'v3-tiles.json');
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ file, stills: out.stills ? Object.fromEntries(Object.entries(out.stills as Record<string, Json>).map(([k, v]) => [k, v.diff ?? v.error])) : null, errors: errors.length }, null, 1));
}

let code = 1;
try {
  await main();
  code = 0;
} catch (e) {
  log('failed:', (e as Error)?.stack ?? e);
} finally {
  await cleanup();
  clearTimeout(watchdog);
}
process.exit(code);
