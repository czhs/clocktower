#!/usr/bin/env node
// v3 WP0 C0 smoke (v3-lead; hand-over to v3-qa / WP7, docs/v3/INTEGRATION.md §8 C0 "Accept"). Mounts the
// stub 3D town 5x on the v2 layout and destroys it again, in Chromium on SwiftShader (CPU only: never GPU
// flags on the host), against the Vite DEV server (the production build has no way to mount v3 in a v2
// lobby until the WP7 harness exists). A 6th cycle injects a throw inside the frame loop and checks the
// crash rule (one fallback('error'), loop stopped, boot mark cleared but the boot still counted).
//
// Run ON THE HOST, from the repo root, under the locks and a timeout:
//   CT_AGENT=v3-lead scripts/remote.sh 'timeout 900 flock ~/clocktower/v3-heavy.lock flock ~/clocktower/browser.lock \
//     nice -n 19 node scripts/v3/smoke-mount.mjs'
// Env: SMOKE_PORT (default 3452, v3-lead ad-hoc range), SMOKE_CYCLES (default 5).
// Always closes the browser and kills the Vite process group in `finally`, then exits (0 = all checks ok).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.SMOKE_PORT ?? 3452);
const CYCLES = Number(process.env.SMOKE_CYCLES ?? 5);
const BASE = `http://127.0.0.1:${PORT}`;
const log = (...a) => console.error('[smoke]', ...a);

// a hard stop independent of the outer `timeout`
const watchdog = setTimeout(() => {
  log('watchdog: 12 min elapsed, aborting');
  cleanup().finally(() => process.exit(3));
}, 12 * 60_000);

let vite = null;
let browser = null;
async function cleanup() {
  try {
    await browser?.close();
  } catch (e) {
    log('browser close failed', e?.message);
  }
  browser = null;
  if (vite && vite.exitCode === null) {
    try {
      process.kill(-vite.pid, 'SIGTERM'); // the whole process group (detached)
    } catch {
      /* already gone */
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      process.kill(-vite.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
  vite = null;
}

async function waitForVite() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/@vite/client`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite did not come up');
}

async function main() {
  vite = spawn(process.execPath, [path.join(root, 'apps/client/node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: path.join(root, 'apps/client'),
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
  vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  await waitForVite();
  log('vite up');
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  // never reach the dev service through Vite's proxy (/api, /healthz, /matchmake -> 127.0.0.1:3001)
  const proxied = [];
  await page.route(/\/(api|healthz|matchmake)(\/|$|\?)/, (route) => {
    proxied.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 204, body: '' });
  });
  const badResponses = [];
  page.on('response', (r) => r.status() >= 400 && badResponses.push(`${r.status()} ${new URL(r.url()).pathname}`));
  // a blank same-origin page that does NOT boot the app (Vite's HTML fallback would serve index.html for
  // any unknown navigation); dynamic imports from it still go to the Vite dev server
  await page.route(`${BASE}/__v3smoke.html`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>v3 smoke</title><body style="margin:0"></body>' }));
  await page.goto(`${BASE}/__v3smoke.html`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('ct.debug.camera', '1');
  });

  const results = [];
  for (let i = 0; i <= CYCLES; i++) {
    const inject = i === CYCLES; // the last cycle: a throw inside the frame loop
    const r = await page.evaluate(
      async ({ i, inject }) => {
        const { createTownGame3d } = await import('/src/game3d/TownGame3d.ts');
        const mk = (v) => {
          let val = v;
          const subs = new Set();
          return { get: () => val, set: (x) => ((val = x), subs.forEach((f) => f(x))), subscribe: (f) => (subs.add(f), () => subs.delete(f)) };
        };
        const handlers = new Map();
        const fallbacks = [];
        let sendThrows = false;
        const conn = {
          lobbyView: mk({ youPid: 'me', world: 'v2', members: [{ pid: 'me', role: 'player', seat: 0, displayName: 'You' }], lobby: { phase: 'waiting', world: 'v2' } }),
          gameView: mk(null),
          status: mk('open'),
          events: {
            on: (k, f) => {
              handlers.set(k, f);
              return () => handlers.delete(k);
            },
          },
          send: () => {
            if (sendThrows) throw new Error('injected frame-loop throw');
          },
        };
        const bridge = { conn, setPrompt() {}, setCaption() {}, setInside() {}, registerLeave() {}, requestFallback: (r) => fallbacks.push(r) };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px';
        document.body.appendChild(el);
        const t0 = performance.now();
        const h = createTownGame3d(el, bridge, { tier: 'low' });
        let readyOk = false;
        try {
          await h.ready;
          readyOk = true;
        } catch {
          readyOk = false;
        }
        const readyMs = Math.round(performance.now() - t0);
        const canvasesAtReady = el.querySelectorAll('canvas').length;
        handlers.get('world:teleport')?.({ seq: 0, x: 480, y: 446, location: 'outdoors', reason: 'spawn' });
        const out = { i, inject, readyOk, readyMs, canvasesAtReady };
        if (inject) {
          sendThrows = true;
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
          await new Promise((r) => setTimeout(r, 1500));
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
          const f0 = window.__ctCamera?.v3?.().frameMs;
          await new Promise((r) => setTimeout(r, 1000));
          out.fallbacks = [...fallbacks];
          out.bootingAfterCrash = localStorage.getItem('ct.graphics.booting');
          out.bootsAfterCrash = JSON.parse(localStorage.getItem('ct.graphics.boots') ?? '[]').length;
          out.frameMsBefore = f0;
        } else {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
          await new Promise((r) => setTimeout(r, 600));
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
          await new Promise((r) => setTimeout(r, 900));
          const cam = window.__ctCamera;
          out.hookPresent = !!cam;
          out.me = cam?.me?.();
          out.w2s = cam?.worldToScreen?.(480, 446);
          out.view = cam?.view?.();
          out.info = cam?.v3?.();
          out.fallbacks = [...fallbacks];
        }
        h.destroy();
        el.remove();
        out.canvasesAfter = document.querySelectorAll('canvas').length;
        out.ctCameraGone = !('__ctCamera' in window);
        out.pixelGone = !('__pixel' in window);
        out.bootingAfterDestroy = localStorage.getItem('ct.graphics.booting');
        return out;
      },
      { i, inject },
    );
    log('cycle', JSON.stringify({ i: r.i, inject: r.inject, readyOk: r.readyOk, readyMs: r.readyMs, fallbacks: r.fallbacks, ctCameraGone: r.ctCameraGone, pixelGone: r.pixelGone }));
    results.push(r);
  }

  const crashLines = consoleErrors.filter((e) => e.includes('[town3d] failed'));
  const otherErrors = consoleErrors.filter((e) => !e.includes('[town3d] failed') && !e.includes('injected frame-loop throw'));
  const normal = results.filter((r) => !r.inject);
  const crash = results.find((r) => r.inject);
  const checks = {
    allReady: normal.every((r) => r.readyOk && r.canvasesAtReady === 1),
    movedRight: normal.every((r) => r.me && r.me.x > 480 && r.me.location === 'outdoors'),
    noFallbacks: normal.every((r) => r.fallbacks.length === 0),
    ctCameraGone: results.every((r) => r.ctCameraGone),
    pixelGone: results.every((r) => r.pixelGone),
    canvasesGone: results.every((r) => r.canvasesAfter === 0),
    bootMarkClearedOnDestroy: normal.every((r) => r.bootingAfterDestroy === null),
    crashFallbackOnce: !!crash && crash.fallbacks.length === 1 && crash.fallbacks[0] === 'error' && crashLines.length === 1,
    crashClearsMarkKeepsBoot: !!crash && crash.bootingAfterCrash === null && crash.bootsAfterCrash === 1,
    noOtherConsoleErrors: otherErrors.length === 0,
    noDevServiceCalls: proxied.length === 0,
  };
  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ done: true, ok, checks, otherErrors, badResponses, proxied, crashLines, results }, null, 1));
  return ok;
}

let code = 1;
try {
  code = (await main()) ? 0 : 1;
} catch (e) {
  log('failed:', e?.stack ?? e);
  code = 1;
} finally {
  await cleanup();
  clearTimeout(watchdog);
}
process.exit(code);
