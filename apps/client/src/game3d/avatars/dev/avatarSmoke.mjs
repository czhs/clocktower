#!/usr/bin/env node
// v3 WP2 (v3-avatars) DEV ONLY: the avatar smoke (hand-over to WP7's harness). Serves apps/client with Vite (DEV),
// opens a blank same-origin page in Chromium on SwiftShader (CPU only: never GPU flags on the game host) and runs
// smokePage.ts twice: (1) low tier, Hollowmere + the real avatar layer with all 33 v2 cast ids + the townsfolk;
// (2) high tier (FX motes, smears, no LOD) on 6 ids + 2 late joiners (pre-warmed: their first drawn frame
// compiles nothing). Each: walking, a vote, talking (rim pixel check), a door step +
// a poof (rig at rest), everyone dead and walking as ghosts, revival in place, night lanterns, destroy; programs
// constant throughout. Screenshots + result JSON -> test-results/v3-avatars-smoke/ (high-tier shots: high-*.png).
//
// Run ON THE HOST from the repo root, under the locks and a timeout:
//   CT_AGENT=v3-avatars scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
//     timeout 2500 nice -n 19 node apps/client/src/game3d/avatars/dev/avatarSmoke.mjs'
// Env: SMOKE_PORT (default 3462, the v3-avatars range 3462-3464; 3461 is taken by an orphaned server). Exit 0 = every check passed.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const PORT = Number(process.env.SMOKE_PORT ?? 3462);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(root, 'test-results/v3-avatars-smoke');
const log = (...a) => console.error('[avsmoke]', ...a);
mkdirSync(OUT, { recursive: true });

let vite = null;
let browser = null;
const watchdog = setTimeout(() => {
  log('watchdog: 40 min, aborting');
  cleanup().finally(() => process.exit(3));
}, 40 * 60_000);

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
  // a leftover server on the port (an interrupted earlier run) would serve a stale tree: refuse instead
  const busy = await fetch(`${BASE}/`).then(() => true, () => false);
  if (busy) throw new Error(`port ${PORT} is already in use (a leftover dev server?): stop it or set SMOKE_PORT`);
  vite = spawn(process.execPath, [path.join(root, 'apps/client/node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: path.join(root, 'apps/client'),
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
  vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  await waitForVite();
  log('vite up');
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // pass 1: the low tier with every cast id + the townsfolk (the game's phone / low path)
  const low = await runPass('low', { tier: 'low' });
  writeFileSync(path.join(OUT, 'result-low.json'), JSON.stringify({ checks: checksLow(low), low }, null, 1));
  log('low pass', JSON.stringify(checksLow(low)));
  // pass 2: the high tier (FX motes, smears, no LOD) on a subset with FX / smears: programs must stay constant there too
  const high = await runPass('high', { tier: 'high', ids: HIGH_IDS, npcs: false, lateJoin: LATE_IDS });
  const checks = { ...prefix('low', checksLow(low)), ...prefix('high', checksHigh(high)) };
  const ok = Object.values(checks).every(Boolean);
  writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ ok, checks, low, high }, null, 1));
  console.log(JSON.stringify({ ok, checks, shotErrors, summary: { low: summary(low), high: summary(high) } }, null, 1));
  return ok;
}

/** Shipped 3D cast ids (INTEGRATION.md §4): a stand-in for any of them is a vendor regression. */
const SHIPPED = ['frog', 'mushroom', 'fox', 'owl', 'crow', 'moth', 'goat', 'skeleton-chef', 'rabbit', 'mole', 'snail', 'toad', 'green-hood', 'honk', 'chonk', 'polly', 'clarabelle', 'requin', 'progress', 'preservation', 'opal', 'cilantro', 'mincut'];
/** High-tier subset: specs with FX / smears, a shared and clips ghost each, the stand-in. */
const HIGH_IDS = ['frog', 'fox', 'goat', 'crow', 'cilantro', 'wanderer'];
/**
 * High tier: join one by one after the rest ran (each first drawn frame must compile no program: the pre-warm did).
 * owl = a rig with FX / smears (vendor extras in engine.scene); nicksong = a billboard (a program new to this pass).
 */
const LATE_IDS = ['owl', 'nicksong'];
/** Talking rim: minimum mean-luminance lift (0..255) of a talker's screen box, rim on vs off. */
const RIM_MIN_DELTA = 3;

const shotErrors = [];
const prefix = (p, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}.${k}`, v]));

async function runPass(name, opts) {
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
  await page.evaluate((o) => {
    localStorage.clear();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px';
    document.body.appendChild(el);
    import('/src/game3d/avatars/dev/smokePage.ts').then((m) => m.runAvatarSmoke(el, o));
  }, opts);
  let res = null;
  const shots = new Set();
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const o = window.__avSmoke;
      return o ? { phase: o.phase, done: o.done } : null;
    });
    if (s?.phase?.startsWith('shot:') && !shots.has(s.phase)) {
      const shot = s.phase.slice(5);
      shots.add(s.phase);
      try {
        await page.screenshot({ path: path.join(OUT, name === 'low' ? `${shot}.png` : `${name}-${shot}.png`), timeout: name === 'high' ? 300_000 : 120_000 });
        log(name, 'shot', shot);
      } catch (e) {
        // a still is evidence, not a check: a loaded host (SwiftShader) can stall the compositor; carry on
        shotErrors.push(`${name}/${shot}: ${String(e?.message ?? e).split('\n')[0]}`);
        log(name, 'shot FAILED', shot, String(e?.message ?? e).split('\n')[0]);
      }
      await page.evaluate((n) => (window.__avSmokeGo = n), shot);
    }
    if (s?.done) {
      res = await page.evaluate(() => window.__avSmoke);
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await page.close();
  if (!res) throw new Error(`smoke page (${name}) did not finish`);
  // the talking-rim crops (rim off / on per talker) as files, not in the JSON
  for (const [pid, c] of Object.entries(res.result.rimCrops ?? {})) {
    for (const [tag, url] of Object.entries(c ?? {})) {
      if (typeof url === 'string' && url.startsWith('data:image/png;base64,')) writeFileSync(path.join(OUT, `${name}-rim-${pid}-${tag}.png`), Buffer.from(url.slice(22), 'base64'));
    }
  }
  delete res.result.rimCrops;
  return { r: res.result, pageErrors: res.errors, log: res.log, errors, warns: warns.slice(0, 40) };
}

function common(p, n) {
  const r = p.r;
  const built = r.built ?? [];
  const players = built.filter((b) => b.key.startsWith('p'));
  const ghosts = (r.ghosts ?? []).filter((g) => g.key.startsWith('p'));
  const ghostWalk = r.ghostWalk ?? {};
  const kindOf = Object.fromEntries(players.map((b) => [b.key, b.kind]));
  const walk = Object.entries(r.walkFrames ?? {}).filter(([k]) => k.startsWith('p'));
  const tele = r.teleports ?? [];
  return {
    allBuilt: r.settled === true && players.length === n && players.every((b) => !!b.texture && !b.failed),
    gpuIsSwiftShader: /swiftshader/i.test(r.gpu ?? ''),
    // rigs: some frame leaves idle or the vendor gait is in 'move'; billboards: walk frames 1..4
    walking: walk.length === players.length && walk.every(([k, f]) => (kindOf[k] === 'billboard' ? f.some((x) => /\|[1-4]#/.test(x)) : f.some((x) => !/^idle\|/.test(x) || /#move$/.test(x)))),
    everyGhost: ghosts.length === players.length && ghosts.every((g) => /^dead:/.test(g.ghost ?? '')),
    clipsGhostsHoldTheirLoopWhileWalking: ghosts.filter((g) => g.ghostMode === 'clips').every((g) => (ghostWalk[g.key] ?? []).every((f) => /^dead:[12]\|ghost(-spent)?\|/.test(f))),
    programsConstantWalking: r.programsWalk === r.programsAlive,
    programsConstantOnDeath: r.programsGhost === r.programsAlive,
    programsConstantOnRevive: r.programsRevived === r.programsAlive,
    programsConstantWhileTalking: r.programsTalk === r.programsAlive,
    talkingRim: (r.talkLooks ?? []).length >= 2 && r.talkLooks.every((b) => b.rim > 0) && r.rimOff === true,
    // each talker's box gets visibly brighter with the rim on (same talk loop, rim off vs on)
    talkingRimVisible: (r.rimLuma ?? []).length >= 2 && r.rimLuma.every((x) => x.delta !== null && x.delta >= RIM_MIN_DELTA),
    // a door step / a poof leaves the rig at rest: not running, no lean, no velocity kick
    teleportAtRest: tele.length >= 3 && tele.every((x) => x.run === false && !/^run\|/.test(x.frame) && x.mode !== 'move' && typeof x.lean === 'number' && x.lean < 1 && typeof x.vel === 'number' && x.vel < 0.5),
    reviveInPlace: r.reviveSameBodies === true && r.reviveAnchorGaps === 0,
    noGlErrors: r.glAlive === null && r.glGhost === null,
    destroyClean: r.scene?.holdersAfter === 0,
    selfDebug: !!r.selfAvatar && typeof r.selfAvatar.frame === 'string',
    pick: r.pickP1 === 'p1',
    fade: r.fadeStart === 0 && r.fadeEnd === 1,
    noPageErrors: p.errors.length === 0 && p.pageErrors.length === 0,
  };
}

function checksLow(p) {
  const r = p.r;
  const built = r.built ?? [];
  const players = built.filter((b) => b.key.startsWith('p'));
  const cast = players.filter((b) => b.cast !== 'no-such-cast');
  const standins = cast.filter((b) => b.standin).map((b) => b.cast);
  return {
    ...common(p, 34),
    billboards: ['brianbi', 'nicksong'].every((id) => cast.find((b) => b.cast === id)?.texture === `v3-billboard:${id}`),
    rigsAreSpecs: cast.filter((b) => !['brianbi', 'nicksong'].includes(b.cast)).every((b) => b.texture === `v3:${b.cast}` || b.standin),
    // a stand-in is tolerated only for the WIP specs (§4); never for a shipped one
    noShippedStandin: !standins.some((id) => SHIPPED.includes(id)),
    unknownIsStandin: players.find((b) => b.cast === 'no-such-cast')?.texture === 'v3:wanderer',
    // low tier: only LOW_TIER_AMBIENCE.townsfolk are out (the rest stay parked and are never built)
    townsfolk: built.some((b) => b.key.startsWith('npc:') && !!b.texture) && built.filter((b) => b.key.startsWith('npc:')).every((b) => !!b.texture || b.parked),
    npcsOutOfSquare: (r.npcsInSquare ?? 1) === 0,
    lanternsAtNight: r.leasesNight >= 2 && r.leasesDay === 0,
    lanternAnchored: r.anchorsSeen >= 2,
  };
}

function checksHigh(p) {
  const lj = p.r.lateJoin;
  return {
    ...common(p, HIGH_IDS.length),
    lateJoinPrewarmed:
      Array.isArray(lj) &&
      lj.length === LATE_IDS.length &&
      lj.every((x, i) => x.texture === (LATE_IDS[i] === 'nicksong' ? 'v3-billboard:nicksong' : `v3:${LATE_IDS[i]}`) && x.firstShowPre >= 0 && x.firstShowPost === x.firstShowPre),
  };
}

function summary(p) {
  const r = p.r;
  const players = (r.built ?? []).filter((b) => b.key.startsWith('p'));
  return {
    tier: r.tier,
    gpu: r.gpu,
    buildMs: r.buildMs,
    reviveMs: r.reviveMs,
    programs: { alive: r.programsAlive, walk: r.programsWalk, talk: r.programsTalk, ghost: r.programsGhost, revived: r.programsRevived },
    newPrograms: { walk: r.newProgramsWalk, talk: r.newProgramsTalk, ghost: r.newProgramsGhost, revived: r.newProgramsRevived },
    warm: r.warm,
    calls: r.callsAlive,
    standins: players.filter((b) => b.standin).map((b) => b.cast),
    rimLuma: r.rimLuma,
    teleports: r.teleports,
    lateJoin: r.lateJoin,
    ghostAnchors: r.ghostAnchors,
    leases: [r.leasesNight, r.leasesDay, r.maxLeases],
    lanterns: r.lanterns,
    memory: r.memory,
    errors: p.errors,
    pageErrors: p.pageErrors,
    warns: p.warns.slice(0, 15),
  };
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
