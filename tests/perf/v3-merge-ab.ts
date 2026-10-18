// v3.1 stage: pixel A/B of the static kit merge (game3d/world/merge.ts) on the mock-world harness, the SAME frame
// rendered with the merge off, on, and off again (window.__ctMergeAB, `ct.debug.v3mergeAB=1`): the frame state does not
// advance between the renders (the harness pauses its clock at a shot; the renders skip the updaters), so any pixel that
// differs between "off" and "on" is the merge's, and off vs off-again proves the frame is reproducible.
//
// Needs the harness build (apps/client/dist-harness, `HARNESS_PORT=<port> pnpm --filter @ct/client exec vite build -c
// vite.harness.config.ts`), then on the host (heavy lock shared, browser lock exclusive):
//   HARNESS_PORT=3467 pnpm exec tsx tests/perf/v3-merge-ab.ts --port 3467 --gl gpu --tiers low,high \
//     --scenarios square-day-8,night-15,vote-12 --dpr 1 --out test-results/merge-ab
// Writes <out>/<scenario>-<tier>-{off,on}.png (+ -diff.png when pixels differ) and <out>/merge-ab.json.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const PORT = Number(arg('port', '3467'));
if (!(PORT >= 3465 && PORT <= 3469)) throw new Error('v3-merge-ab: ports 3465-3469 (v3 stage) only');
const GL = arg('gl', 'gpu');
const TIERS = arg('tiers', 'low,high').split(',');
const SCENARIOS = arg('scenarios', 'square-day-8,night-15,vote-12').split(',');
const DPR = Number(arg('dpr', '1'));
const CELL = arg('cell', ''); // ct.debug.v3mergeCell (m); default: the stage's
const OUT = path.resolve(arg('out', path.join(ROOT, 'test-results/merge-ab')));
const BASE = `http://127.0.0.1:${PORT}`;
const log = (...a: unknown[]) => console.error(`[merge-ab ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

let server: ChildProcess | null = null;
let browser: Browser | null = null;
async function cleanup() {
  await browser?.close().catch(() => undefined);
  if (server?.pid && server.exitCode === null) {
    for (const sig of ['SIGTERM', 'SIGKILL'] as const) {
      try {
        process.kill(-server.pid, sig);
      } catch {
        /* gone */
      }
      await sleep(300);
    }
  }
}
const watchdog = setTimeout(() => void cleanup().finally(() => process.exit(3)), 15 * 60_000);

async function main() {
  server = spawn('pnpm', ['--filter', '@ct/client', 'exec', 'vite', 'preview', '-c', 'vite.harness.config.ts', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    env: { ...process.env, HARNESS_PORT: String(PORT) },
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/v3-harness.html`)).ok) break;
    } catch {
      /* not yet */
    }
    if (i > 120) throw new Error('preview did not come up');
    await sleep(500);
  }
  const args = GL === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'];
  browser = await chromium.launch({ args });
  const results: Record<string, unknown>[] = [];
  for (const scenario of SCENARIOS)
    for (const tier of TIERS) {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: DPR });
      // tsx (esbuild keepNames) wraps named functions inside page.evaluate bodies in __name(...)
      await ctx.addInitScript({ content: 'window.__name = (f) => f;' });
      await ctx.addInitScript((cell: string) => {
        try {
          if (cell) localStorage.setItem('ct.debug.v3mergeCell', cell);
          localStorage.setItem('ct.debug.v3mergeAB', '1');
          localStorage.setItem('ct.fxQuality', new URLSearchParams(location.search).get('tier') ?? 'low');
        } catch {
          /* ignore */
        }
      }, CELL);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
      await page.goto(`${BASE}/v3-harness.html?scenario=${scenario}&tier=${tier}&fps=60`);
      const rec: Record<string, unknown> = { scenario, tier, dpr: DPR, shots: [] as unknown[] };
      const deadline = Date.now() + 180_000;
      let k = 0;
      for (;;) {
        const st = await page.evaluate(() => {
          const H = (window as unknown as { __harness?: { pending: { name: string } | null; done: boolean; error: string | null } }).__harness;
          return { pending: H?.pending?.name ?? null, done: !!H?.done, error: H?.error ?? null };
        });
        if (st.error) {
          rec.error = st.error;
          break;
        }
        if (st.done || Date.now() > deadline || k >= 3) break;
        if (!st.pending) {
          await sleep(100);
          continue;
        }
        k++;
        const r = await page.evaluate(() => {
          const ab = (window as unknown as { __ctMergeAB?: { set(on: boolean): void; render(): number; info(): unknown; drawn(): unknown } }).__ctMergeAB;
          const gl = document.querySelector('.ct-game-canvas canvas') as HTMLCanvasElement | null;
          if (!ab || !gl) return { error: `no hook (${!!ab}) / canvas (${!!gl})` };
          const calls: number[] = [];
          const grab = (on: boolean) => {
            ab.set(on);
            calls.push(ab.render());
            const c = document.createElement('canvas');
            c.width = gl.width;
            c.height = gl.height;
            const x = c.getContext('2d')!;
            x.drawImage(gl, 0, 0);
            return { c, d: x.getImageData(0, 0, c.width, c.height).data };
          };
          ab.set(false);
          const drawnOff = ab.drawn();
          ab.set(true);
          const drawnOn = ab.drawn();
          const off = grab(false);
          const on = grab(true);
          const off2 = grab(false);
          ab.set(true);
          const cmp = (a: Uint8ClampedArray, b: Uint8ClampedArray, mark?: ImageData) => {
            let n = 0, max = 0;
            for (let i = 0; i < a.length; i += 4) {
              const d = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
              if (d > 0) {
                n++;
                if (d > max) max = d;
                if (mark) {
                  mark.data[i] = 255;
                  mark.data[i + 3] = 255;
                }
              }
            }
            return { n, max };
          };
          const dc = document.createElement('canvas');
          dc.width = gl.width;
          dc.height = gl.height;
          const dx = dc.getContext('2d')!;
          const mark = dx.createImageData(dc.width, dc.height);
          const offOn = cmp(off.d, on.d, mark);
          const offOff = cmp(off.d, off2.d);
          dx.drawImage(off.c, 0, 0);
          dx.globalAlpha = 0.35;
          dx.fillStyle = '#000';
          dx.fillRect(0, 0, dc.width, dc.height);
          const tmp = document.createElement('canvas');
          tmp.width = dc.width;
          tmp.height = dc.height;
          tmp.getContext('2d')!.putImageData(mark, 0, 0);
          dx.globalAlpha = 1;
          dx.drawImage(tmp, 0, 0);
          return { info: ab.info(), drawnOff, drawnOn, calls, w: gl.width, h: gl.height, pixels: gl.width * gl.height, offOn, offOff, offPng: off.c.toDataURL(), onPng: on.c.toDataURL(), diffPng: offOn.n ? dc.toDataURL() : null };
        });
        const name = await page.evaluate(() => (window as unknown as { __harness: { pending: { name: string } | null } }).__harness.pending?.name ?? 'shot');
        const base = path.join(OUT, `${scenario}-${tier}-${name}${DPR !== 1 ? `-dpr${DPR}` : ''}`);
        if ('error' in r) (rec.shots as unknown[]).push({ name, error: r.error });
        else {
          const save = (url: string | null, f: string) => url && writeFileSync(f, Buffer.from(url.split(',')[1]!, 'base64'));
          save(r.offPng, `${base}-off.png`);
          save(r.onPng, `${base}-on.png`);
          save(r.diffPng, `${base}-diff.png`);
          rec.info = r.info;
          if (!rec.drawnOn) Object.assign(rec, { drawnOff: r.drawnOff, drawnOn: r.drawnOn });
          (rec.shots as unknown[]).push({ name, calls: r.calls, w: r.w, h: r.h, offOn: r.offOn, offOff: r.offOff });
          log(scenario, tier, name, `calls off/on ${r.calls.join('/')}`, `off/on ${r.offOn.n} px (max ${r.offOn.max})`, `off/off ${r.offOff.n} px`);
        }
        await page.evaluate(() => (window as unknown as { __harness: { ack(): void } }).__harness.ack());
      }
      rec.errors = errors;
      results.push(rec);
      await ctx.close();
    }
  writeFileSync(path.join(OUT, 'merge-ab.json'), JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results.map((r) => ({ s: r.scenario, t: r.tier, info: r.info, shots: r.shots, err: r.error ?? null, pageErrors: (r.errors as string[]).length })), null, 1));
}

main()
  .catch((e) => {
    log('failed', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    clearTimeout(watchdog);
    await cleanup();
  });
