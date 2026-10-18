#!/usr/bin/env node
// v3 WP2 (v3-avatars) DEV ONLY: the avatar smoke (hand-over to WP7's harness). Serves apps/client with Vite (DEV),
// opens a blank same-origin page in Chromium on SwiftShader (CPU only: never GPU flags on the game host) and runs
// smokePage.ts: Hollowmere + the real avatar layer with all 33 v2 cast ids, walking, a vote, everyone dead and
// walking as ghosts, night lanterns, destroy. Screenshots + result JSON -> test-results/v3-avatars-smoke/.
//
// Run ON THE HOST from the repo root, under the locks and a timeout:
//   CT_AGENT=v3-avatars scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
//     timeout 1500 nice -n 19 node apps/client/src/game3d/avatars/dev/avatarSmoke.mjs'
// Env: SMOKE_PORT (default 3461, the v3-avatars range 3461-3464). Exit 0 = every check passed.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const PORT = Number(process.env.SMOKE_PORT ?? 3461);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(root, 'test-results/v3-avatars-smoke');
const log = (...a) => console.error('[avsmoke]', ...a);
mkdirSync(OUT, { recursive: true });

let vite = null;
let browser = null;
const watchdog = setTimeout(() => {
  log('watchdog: 24 min, aborting');
  cleanup().finally(() => process.exit(3));
}, 24 * 60_000);

async function cleanup() {
  try {
    await browser?.close();
  } catch (e) {
    log('browser close failed', e?.message);
  }
  browser = null;
  if (vite && vite.exitCode === null) {
    for (const sig of ['SIGTERM', 'SIGKILL']) {
      try {
        process.kill(-vite.pid, sig);
      } catch {
        /* gone */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  vite = null;
}

async function waitForVite() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/@vite/client`)).ok) return;
    } catch {
      /* not yet */
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
  const errors = [];
  const warns = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 400));
    if (m.type() === 'warning') warns.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 400)}`));
  // never reach the dev service through Vite's proxy
  await page.route(/\/(api|healthz|matchmake)(\/|$|\?)/, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(`${BASE}/__avsmoke.html`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>avatar smoke</title><body style="margin:0;background:#000"></body>' }));
  await page.goto(`${BASE}/__avsmoke.html`);
  await page.evaluate(() => {
    localStorage.clear();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px';
    document.body.appendChild(el);
    import('/src/game3d/avatars/dev/smokePage.ts').then((m) => m.runAvatarSmoke(el));
  });
  let res = null;
  const shots = new Set();
  const deadline = Date.now() + 22 * 60_000;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const o = window.__avSmoke;
      return o ? { phase: o.phase, done: o.done } : null;
    });
    if (s?.phase?.startsWith('shot:') && !shots.has(s.phase)) {
      const name = s.phase.slice(5);
      shots.add(s.phase);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 120_000 });
      log('shot', name);
      await page.evaluate((n) => (window.__avSmokeGo = n), name);
    }
    if (s?.done) {
      res = await page.evaluate(() => window.__avSmoke);
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!res) throw new Error('smoke page did not finish');
  const r = res.result;
  const built = r.built ?? [];
  const players = built.filter((b) => b.key.startsWith('p'));
  const cast = players.filter((b) => b.cast !== 'no-such-cast');
  const ghosts = (r.ghosts ?? []).filter((g) => g.key.startsWith('p'));
  const ghostWalk = r.ghostWalk ?? {};
  const clipsGhostsSlide = ghosts
    .filter((g) => g.ghostMode === 'clips')
    .every((g) => (ghostWalk[g.key] ?? []).every((f) => /^dead:[12]\|ghost(-spent)?\|/.test(f)));
  const checks = {
    allBuilt: r.settled === true && cast.length === 33 && cast.every((b) => !!b.texture && !b.failed),
    billboards: ['brianbi', 'nicksong'].every((id) => cast.find((b) => b.cast === id)?.texture === `v3-billboard:${id}`),
    rigsAreSpecs: cast.filter((b) => !['brianbi', 'nicksong'].includes(b.cast)).every((b) => b.texture === `v3:${b.cast}` || b.standin),
    unknownIsStandin: players.find((b) => b.cast === 'no-such-cast')?.texture === 'v3:wanderer',
    townsfolk: built.filter((b) => b.key.startsWith('npc:')).every((b) => !!b.texture),
    walking: Object.entries(r.walkFrames ?? {}).filter(([k]) => k.startsWith('p')).every(([, f]) => f.some((x) => !/^idle\|/.test(x) && !/\|0$/.test(x)) || f.length > 1),
    everyGhost: ghosts.length === players.length && ghosts.every((g) => /^dead:/.test(g.ghost ?? '')),
    clipsGhostsHoldTheirLoopWhileWalking: clipsGhostsSlide,
    programsConstantOnDeath: r.programsGhost === r.programsAlive,
    noGlErrors: r.glAlive === null && r.glGhost === null,
    lanternsAtNight: r.leasesNight >= 2 && r.leasesDay === 0,
    destroyClean: r.scene?.holdersAfter === 0,
    selfDebug: !!r.selfAvatar && typeof r.selfAvatar.frame === 'string',
    pick: r.pickP1 === 'p1',
    fade: r.fadeStart === 0 && r.fadeEnd === 1,
    lanternAnchored: r.anchorsSeen >= 2,
    noPageErrors: errors.length === 0 && res.errors.length === 0,
  };
  const ok = Object.values(checks).every(Boolean);
  writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ ok, checks, errors, warns: warns.slice(0, 40), page: res }, null, 1));
  console.log(JSON.stringify({ ok, checks, errors, pageErrors: res.errors, buildMs: r.buildMs, programs: [r.programsAlive, r.programsGhost, r.programsRevived], calls: r.callsAlive, leases: [r.leasesNight, r.leasesDay, r.maxLeases], lanterns: r.lanterns, memory: r.memory, warns: warns.slice(0, 15) }, null, 1));
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
