#!/usr/bin/env node
// v3 WP3 (v3-stage) DEV ONLY: the town-stage smoke (hand-over to WP7's harness / e2e v3-vote, v3-life). It lives in
// scripts/v3 (not apps/client/src) because it reads the review-only hollowmere.meta.json, which no client source may
// name (packages/assets/test/hollowmere.test.ts). Serves
// apps/client with Vite (DEV), opens a blank same-origin page in Chromium on SwiftShader (CPU only: never GPU flags
// on the game host), mounts the REAL createTownGame3d on the v3 layout (Hollowmere, townLayoutV3) over a scripted
// fake connection and walks it through: ready -> a day with 5 players (10 boarded cottages, the hour from the
// stage clock, the tower timer hook) -> remotes under house-11's oak crown (canopy fade D1: pixels in front of the
// avatar change, the program count does not) -> a vote (dais) -> a remote entering house-3 (door swing, seen the way
// the server sends it to an outdoor player: the remote VANISHES at the door) -> night -> the own player walks up to
// house-5 (prefetch) and goes in (interior switch <= 120 ms) and out again -> a Storyteller teleport into a room that
// was not prefetched (measured, not asserted) -> dawn -> 6 s idle (no door / bell without the game)
// -> destroy. Screenshots + result JSON -> test-results/v3-stage-smoke/.
//
// Run ON THE HOST from the repo root, under the locks and a timeout:
//   CT_AGENT=v3-stage scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock flock $HOME/clocktower/browser.lock \
//     timeout 1500 nice -n 19 node scripts/v3/stage-smoke.mjs'
// Env: SMOKE_PORT (default 3465, the v3-stage range 3465-3469), SMOKE_TIER (low | high, default low).
// Exit 0 = every check passed.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.SMOKE_PORT ?? 3465);
const TIER = process.env.SMOKE_TIER === 'high' ? 'high' : 'low';
/** SMOKE_CANOPY=0: build without the canopy fade (ct.debug.v3canopy=0), an A/B run for frame times. */
const CANOPY = process.env.SMOKE_CANOPY !== '0';
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(root, 'test-results/v3-stage-smoke');
const log = (...a) => console.error('[stagesmoke]', ...a);
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

/** Tiles for the canopy check: a house-11 canopy-hidden tile for the remote, a nearby open tile south of it for me. */
function canopyTiles() {
  const gen = JSON.parse(readFileSync(path.join(root, 'packages/assets/src/hollowmere/hollowmere.generated.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(path.join(root, 'packages/assets/src/hollowmere/hollowmere.meta.json'), 'utf8')).meta;
  const soft = meta.hiddenSoft.filter((t) => t.by === 'house-11');
  if (!soft.length) throw new Error('no house-11 hiddenSoft tile (canopy rule changed?)');
  const hid = new Set([...meta.hiddenSoft, ...meta.hidden].map((t) => `${t.x},${t.y}`));
  const open = (x, y) => y >= 0 && y < gen.heightTiles && x >= 0 && x < 45 && gen.collision[y][x] === '0' && !hid.has(`${x},${y}`);
  // the remote: the canopy tile with the most canopy tiles around it (deep under the crown)
  const near = (t) => soft.filter((s) => Math.abs(s.x - t.x) <= 1 && Math.abs(s.y - t.y) <= 1).length;
  const r = soft.slice().sort((a, b) => near(b) - near(a) || a.y - b.y || a.x - b.x)[0];
  let me = null;
  for (let d = 3; d <= 7 && !me; d++)
    for (const [dx, dy] of [[0, d], [-1, d], [1, d], [-2, d], [2, d], [d, 0], [-d, 0], [d, d], [-d, d]]) if (!me && open(r.x + dx, r.y + dy)) me = { x: r.x + dx, y: r.y + dy };
  if (!me) throw new Error(`no open tile near ${r.x},${r.y}`);
  return { remote: { x: r.x, y: r.y }, me, softCount: soft.length };
}

async function main() {
  const tiles = canopyTiles();
  log('canopy tiles', JSON.stringify(tiles));
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
  page.setDefaultTimeout(240_000);
  const consoleErrors = [];
  const pieceWarns = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    if (m.type() === 'warning' && /\[town\] piece .* failed|interior failed/.test(m.text())) pieceWarns.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  const proxied = [];
  await page.route(/\/(api|healthz|matchmake)(\/|$|\?)/, (route) => {
    proxied.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route(`${BASE}/__v3stage.html`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>v3 stage smoke</title><body style="margin:0;background:#000"></body>' }));
  await page.goto(`${BASE}/__v3stage.html`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('ct.debug.camera', '1');
  });
  if (!CANOPY) await page.evaluate(() => localStorage.setItem('ct.debug.v3canopy', '0'));
  // rAF deltas over `ms` (median / max), per step: SwiftShader frame cost of what the step shows
  const frameStats = (ms) =>
    page.evaluate(
      (ms) =>
        new Promise((res) => {
          const d = [];
          let prev = null;
          const end = performance.now() + ms;
          const f = (t) => {
            if (prev !== null) d.push(t - prev);
            prev = t;
            if (performance.now() < end || d.length < 3) requestAnimationFrame(f);
            else {
              d.sort((a, b) => a - b);
              res({ n: d.length, p50: Math.round(d[Math.floor(d.length / 2)]), max: Math.round(d[d.length - 1]) });
            }
          };
          requestAnimationFrame(f);
        }),
      ms,
    );
  const frames = {};
  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, `${CANOPY ? "" : "nocanopy-"}${name}.png`) });
    log('shot', name);
  };
  const step = async (name, fn, arg) => {
    const t0 = Date.now();
    const r = await page.evaluate(fn, arg);
    log(name, `${Date.now() - t0} ms`, JSON.stringify(r).slice(0, 600));
    return r;
  };

  // ---------------------------------------------------------------- A. mount on the v3 layout
  const A = await step(
    'mount',
    async ({ tier }) => {
      const { ensureLayout, currentLayout } = await import('/src/net/layout.ts');
      await ensureLayout('v3');
      const layout = currentLayout();
      const { createTownGame3d } = await import('/src/game3d/TownGame3d.ts');
      const mk = (v) => {
        let val = v;
        const subs = new Set();
        return { get: () => val, set: (x) => ((val = x), subs.forEach((f) => f(x))), subscribe: (f) => (subs.add(f), () => subs.delete(f)) };
      };
      const handlers = new Map();
      const sent = [];
      const members = ['me', 'r1', 'r2', 'r3', 'r4'].map((pid, i) => ({ pid, role: 'player', seat: i, displayName: pid }));
      const conn = {
        lobbyView: mk({ youPid: 'me', world: 'v3', members, lobby: { phase: 'waiting', world: 'v3' } }),
        gameView: mk(null),
        status: mk('open'),
        events: { on: (k, f) => (handlers.set(k, f), () => handlers.delete(k)) },
        send: (k, m) => sent.push(k),
      };
      const fallbacks = [];
      const bridge = { conn, setPrompt() {}, setCaption() {}, setInside() {}, registerLeave() {}, requestFallback: (r) => fallbacks.push(r) };
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px';
      document.body.appendChild(el);
      const t0 = performance.now();
      const h = createTownGame3d(el, bridge, { tier });
      let readyOk = false;
      let readyErr = null;
      try {
        await h.ready;
        readyOk = true;
      } catch (e) {
        readyErr = String(e?.stack ?? e).slice(0, 400);
      }
      const readyMs = Math.round(performance.now() - t0);
      const T = layout.tileSize;
      const feet = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T - 2 });
      // remotes: a 12 Hz snapshot pump over `ents`
      const ents = new Map();
      const pump = () => handlers.get('world:snapshot')?.({ t: Date.now(), ackSeq: 0, entities: [...ents.values()] });
      const timer = setInterval(pump, 80);
      const sp = feet(layout.playerSpawn.x, layout.playerSpawn.y);
      handlers.get('world:teleport')?.({ seq: 0, x: sp.x, y: sp.y, location: 'outdoors', reason: 'spawn' });
      const cam = () => window.__ctCamera;
      window.__ss = { h, el, conn, handlers, layout, ents, pump, timer, feet, fallbacks, sent, cam };
      await new Promise((r) => setTimeout(r, 1500));
      const c = cam();
      return { readyOk, readyErr, readyMs, world: layout.widthTiles, v3: c?.v3?.(), stage: c?.stage?.(), dais: c?.dais?.() };
    },
    { tier: TIER },
  );
  if (!A.readyOk) throw new Error(`not ready: ${A.readyErr}`);
  await shot('a-ready');
  frames['a-ready'] = await frameStats(3000);
  log('frames', 'a-ready', JSON.stringify(frames['a-ready']));

  // ---------------------------------------------------------------- B. a day: 5 players, discussion clock running
  const gameView = (o) => ({
    kind: 'player',
    phase: 'day',
    dayNumber: 1,
    phaseEndsAt: null,
    players: ['me', 'r1', 'r2', 'r3', 'r4'].map((pid, seat) => ({ seat, pid, name: pid, alive: true, ghostVoteAvailable: true, nominatedToday: false, wasNominatedToday: false, connected: true })),
    you: { pid: 'me', seat: 0, alive: true, ghostVoteAvailable: true, canNominate: true, role: null },
    day: { nominationsOpen: false, nominations: [], onTheBlock: null, executedSeat: null },
    prompts: [],
    info: [],
    announcements: [],
    storytellerVisitingYou: false,
    result: null,
    clock: null,
    ...o,
  });
  const B = await step(
    'day',
    async ({ gv }) => {
      const s = window.__ss;
      const sp = s.feet(s.layout.playerSpawn.x, s.layout.playerSpawn.y);
      ['r1', 'r2', 'r3', 'r4'].forEach((pid, i) => s.ents.set(pid, { id: pid, x: sp.x - 48 + i * 32, y: sp.y + 24, location: 'outdoors', facing: 'down', moving: false }));
      s.pump();
      const { serverNow } = await import('/src/net/serverTime.ts');
      gv.clock = { stage: 'discussion', endsAt: serverNow() + 120_000, remainingMs: null, paused: false, totalMs: 300_000 };
      s.conn.gameView.set(gv);
      await new Promise((r) => setTimeout(r, 2500));
      const c = s.cam();
      return { stage: c.stage(), dais: c.dais(), v3: c.v3() };
    },
    { gv: gameView({}) },
  );
  await shot('b-day');
  frames['b-day'] = await frameStats(3000);
  log('frames', 'b-day', JSON.stringify(frames['b-day']));

  // ---------------------------------------------------------------- C. canopy fade under house-11's crown
  const C = await step(
    'canopy',
    async ({ tiles }) => {
      const s = window.__ss;
      const pr = s.feet(tiles.remote.x, tiles.remote.y);
      const pm = s.feet(tiles.me.x, tiles.me.y);
      s.handlers.get('world:teleport')?.({ seq: 0, x: pm.x, y: pm.y, location: 'outdoors', reason: 'spawn' });
      for (const pid of ['r2', 'r3', 'r4']) s.ents.delete(pid);
      const c = s.cam();
      const sample = () =>
        new Promise((res) =>
          requestAnimationFrame(() => {
            const gl = s.el.querySelector('canvas');
            const cv = document.createElement('canvas');
            cv.width = gl.width;
            cv.height = gl.height;
            const ctx = cv.getContext('2d');
            ctx.drawImage(gl, 0, 0);
            // the lower body: there the hole reveals the ground behind the crown (higher up it reveals the crown's
            // own back half, which looks the same until WP2 draws the avatar there)
            const p = c.worldToScreen(pr.x, pr.y, 0.3);
            const box = { x: Math.round(p.x - 20), y: Math.round(p.y - 16), w: 40, h: 32 };
            res({ box, data: Array.from(ctx.getImageData(box.x, box.y, box.w, box.h).data) });
          }),
        );
      const diff = (a, b) => {
        let n = 0;
        for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 30) n++;
        return n;
      };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      // frame times after the teleport (SwiftShader pipeline JIT on newly seen geometry shows up here)
      const frames = [];
      let prevT = null;
      const until = performance.now() + 4000;
      await new Promise((res) => {
        const f = (t) => {
          if (prevT !== null) frames.push(Math.round(t - prevT));
          prevT = t;
          if (performance.now() < until) requestAnimationFrame(f);
          else res();
        };
        requestAnimationFrame(f);
      });
      // the camera must have settled on me (the focus eases 1 - e^(-5 dt))
      const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
      let v0 = c.view();
      for (let i = 0, still = 0; i < 200 && still < 3; i++) {
        await nextFrame();
        await nextFrame();
        const v1 = c.view();
        still = Math.abs(v1.x - v0.x) < 0.02 && Math.abs(v1.y - v0.y) < 0.02 ? still + 1 : 0;
        v0 = v1;
      }
      const slot = (key) => c.stage().canopy.slots.find((x) => x.key === key)?.w ?? 0;
      const waitSlot = async (key, w) => {
        for (let i = 0; i < 200 && Math.abs(slot(key) - w) > 1e-6; i++) await wait(50);
      };
      // rounds of: r1 absent (two samples one frame apart), present (two samples one frame apart). Same-state pairs
      // measure the wind / life / sub-texel noise of one frame (SwiftShader frames are ~1 s on the host); switch
      // pairs (absent -> present -> absent) carry the canopy hole on top of that noise.
      const ROUNDS = 4;
      let same = 0;
      let swap = 0;
      let programs0 = null;
      let canopyOn = null;
      let present = null;
      const setR1 = async (on) => {
        if (on) s.ents.set('r1', { id: 'r1', x: pr.x, y: pr.y, location: 'outdoors', facing: 'down', moving: false });
        else s.ents.delete('r1');
        s.pump();
        await waitSlot('r1', on ? 1 : 0);
      };
      let prev = null;
      for (let k = 0; k < ROUNDS; k++) {
        await setR1(false);
        programs0 ??= c.v3().programs;
        const a1 = await sample();
        if (prev) swap += diff(prev, a1);
        await nextFrame(); // same-state pairs span as many frames as a switch (the slot eases in one frame here)
        const a2 = await sample();
        same += diff(a1, a2);
        await setR1(true);
        const p1 = await sample();
        swap += diff(a2, p1);
        await nextFrame();
        present = await sample();
        same += diff(p1, present);
        prev = present;
        canopyOn ??= c.stage().canopy;
      }
      const programs1 = c.v3().programs;
      const nSame = 2 * ROUNDS;
      const nSwap = 2 * ROUNDS - 1;
      return { pr, pm, box: present.box, baseline: Math.round(same / nSame), hole: Math.round(swap / nSwap), pixels: present.data.length / 4, canopyOn, programs0, programs1, cut: c.stage().cut, frames: { n: frames.length, max: Math.max(0, ...frames), sum: frames.reduce((a, b) => a + b, 0), first: frames.slice(0, 12) }, frameMs: c.v3().frameMs };
    },
    { tiles },
  );
  await shot('c-canopy');
  frames['c-canopy'] = await frameStats(3000);
  log('frames', 'c-canopy', JSON.stringify(frames['c-canopy']));

  // ---------------------------------------------------------------- D. a vote (dais)
  const D = await step(
    'vote',
    async ({ gv }) => {
      const s = window.__ss;
      const sp = s.feet(s.layout.playerSpawn.x, s.layout.playerSpawn.y);
      s.handlers.get('world:teleport')?.({ seq: 0, x: sp.x, y: sp.y - 64, location: 'outdoors', reason: 'spawn' });
      s.conn.gameView.set(gv);
      await new Promise((r) => setTimeout(r, 3000));
      const c = s.cam();
      return { dais: c.dais(), stage: c.stage(), v3: c.v3() };
    },
    {
      gv: gameView({
        day: {
          nominationsOpen: true,
          nominations: [{ id: 'n1', nominatorSeat: 1, nomineeSeat: 2, status: 'voting', votes: { 3: true, 4: false }, currentVoterSeat: 0, voteCount: 1, threshold: 3 }],
          onTheBlock: null,
          executedSeat: null,
        },
      }),
    },
  );
  await shot('d-vote');
  frames['d-vote'] = await frameStats(3000);
  log('frames', 'd-vote', JSON.stringify(frames['d-vote']));

  // ---------------------------------------------------------------- E. a remote enters house-3 (door swing)
  // The server sends an outdoor player only the outdoor entities (apps/server/src/world snapshotFor): a remote
  // going in drops out of the snapshot at the door; it is never seen with location bld:house-3.
  const E = await step('door', async () => {
    const s = window.__ss;
    const b = s.layout.buildings.find((x) => x.id === 'house-3');
    const d = s.feet(b.door.x, b.door.y);
    s.ents.set('r2', { id: 'r2', x: d.x, y: d.y, location: 'outdoors', facing: 'up', moving: false });
    s.pump();
    // the stage must have SEEN r2 outdoors first (a first sight inside swings nothing): its canopy slot exists then
    for (let i = 0; i < 300 && !s.cam().stage().canopy.slots.some((x) => x.key === 'r2'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // the door inference needs a settled own view (VIEW_SETTLE_S 1.5 s since the last own location / phase change)
    await new Promise((r) => setTimeout(r, 1600));
    s.ents.delete('r2');
    s.pump();
    await new Promise((r) => setTimeout(r, 350));
    const mid = s.cam().stage().doors;
    // the swing is 1.5 s of engine time: poll (slow SwiftShader frames) until it closed again
    for (let i = 0; i < 300 && (!s.cam().stage().doors.writes['house-3'] || s.cam().stage().doors.open.length); i++) await new Promise((r) => setTimeout(r, 50));
    return { mid, after: s.cam().stage().doors, frameMs: s.cam().v3().frameMs };
  });

  // ---------------------------------------------------------------- F. night
  const F = await step(
    'night',
    async ({ gv }) => {
      const s = window.__ss;
      s.conn.gameView.set(gv);
      await new Promise((r) => setTimeout(r, 3500));
      const c = s.cam();
      return { stage: c.stage(), dais: c.dais(), v3: c.v3() };
    },
    { gv: gameView({ phase: 'night', day: null }) },
  );
  await shot('f-night');
  frames['f-night'] = await frameStats(3000);
  log('frames', 'f-night', JSON.stringify(frames['f-night']));

  // ---------------------------------------------------------------- G. the own player in house-5 and out again
  const G = await step('interior', async () => {
    const s = window.__ss;
    const b = s.layout.buildings.find((x) => x.id === 'house-5');
    const c = s.cam();
    // the own player walks up to the door first: the stage prefetches the room within 3 tiles of its door
    const atDoor = s.feet(b.door.x, b.door.y);
    s.handlers.get('world:teleport')?.({ seq: 0, x: atDoor.x, y: atDoor.y + 20, location: 'outdoors', reason: 'spawn' });
    let prefetched = false;
    for (let i = 0; i < 300 && !prefetched; i++) {
      await new Promise((r) => setTimeout(r, 100));
      prefetched = c.stage().interiors.cached.includes(5);
    }
    await new Promise((r) => setTimeout(r, 300));
    // rAF deltas: 1 s before the switch (baseline) and 1 s after (the switch frame's hitch), reported only
    const deltas = (ms) =>
      new Promise((res) => {
        const d = [];
        let prev = null;
        const end = performance.now() + ms;
        const f = (t) => {
          if (prev !== null) d.push(t - prev);
          prev = t;
          if (performance.now() < end || d.length < 3) requestAnimationFrame(f);
          else res(d);
        };
        requestAnimationFrame(f);
      });
    const base = (await deltas(1000)).sort((a, z) => a - z);
    const inside = s.feet(b.interiorDoor.x, b.interiorDoor.y);
    const afterP = deltas(1000);
    s.handlers.get('world:teleport')?.({ seq: 0, x: inside.x, y: inside.y, location: 'bld:house-5', reason: 'door' });
    const after = await afterP;
    const hitch = { baseP50: Math.round(base[Math.floor(base.length / 2)] ?? 0), afterMax: Math.round(Math.max(0, ...after)) };
    let drawn = null;
    for (let i = 0; i < 100 && drawn !== 'bld:house-5'; i++) {
      await new Promise((r) => setTimeout(r, 100));
      drawn = c.stage().drawn;
    }
    await new Promise((r) => setTimeout(r, 1200));
    const inStage = c.stage();
    const inV3 = c.v3();
    window.__ssInside = true;
    return { drawn, prefetched, hitch, inStage, inV3 };
  });
  await shot('g-interior');
  frames['g-interior'] = await frameStats(3000);
  log('frames', 'g-interior', JSON.stringify(frames['g-interior']));
  const G2 = await step('leave', async () => {
    const s = window.__ss;
    const b = s.layout.buildings.find((x) => x.id === 'house-5');
    const out = s.feet(b.door.x, b.door.y);
    s.handlers.get('world:teleport')?.({ seq: 0, x: out.x, y: out.y, location: 'outdoors', reason: 'door' });
    await new Promise((r) => setTimeout(r, 1500));
    const c = s.cam();
    return { stage: c.stage(), v3: c.v3() };
  });

  // ---------------------------------------------------------------- G3. a Storyteller teleport into a room nobody prefetched
  // (neither the own home nor near a door): the full room build is paid on the switch; measured and reported only
  // (§7 budget = a prefetched entry, see G)
  const G3 = await step('cold-interior', async () => {
    const s = window.__ss;
    const c = s.cam();
    const cached = c.stage().interiors.cached;
    const home = s.layout.buildings.find((x) => x.houseIndex === 0 && /^house-\d+$/.test(x.id));
    const b = s.layout.buildings.find((x) => /^house-\d+$/.test(x.id) && x.id !== home?.id && !cached.includes(Number(x.id.slice(6))) && x.id !== 'house-5');
    const i = Number(b.id.slice(6));
    const inside = s.feet(b.interiorDoor.x, b.interiorDoor.y);
    s.handlers.get('world:teleport')?.({ seq: 0, x: inside.x, y: inside.y, location: `bld:${b.id}`, reason: 'storyteller' });
    let drawn = null;
    for (let k = 0; k < 100 && drawn !== `bld:${b.id}`; k++) {
      await new Promise((r) => setTimeout(r, 100));
      drawn = c.stage().drawn;
    }
    await new Promise((r) => setTimeout(r, 600));
    const ms = c.stage().interiors.lastSwitchMs;
    const inV3 = c.v3();
    const out = s.feet(b.door.x, b.door.y);
    s.handlers.get('world:teleport')?.({ seq: 0, x: out.x, y: out.y + 20, location: 'outdoors', reason: 'storyteller' });
    await new Promise((r) => setTimeout(r, 1500));
    return { house: i, cachedBefore: cached, drawn, lastSwitchMs: ms, inV3, stage: c.stage(), v3: c.v3() };
  });

  // ---------------------------------------------------------------- H. dawn, then I. idle
  const H = await step(
    'dawn',
    async ({ gv }) => {
      const s = window.__ss;
      s.conn.gameView.set(gv);
      await new Promise((r) => setTimeout(r, 2500));
      const c = s.cam();
      return { stage: c.stage(), v3: c.v3() };
    },
    { gv: gameView({ phase: 'dawn', day: null }) },
  );
  await shot('h-dawn');
  frames['h-dawn'] = await frameStats(3000);
  log('frames', 'h-dawn', JSON.stringify(frames['h-dawn']));
  const I = await step('idle', async () => {
    const s = window.__ss;
    const c = s.cam();
    const before = c.stage();
    await new Promise((r) => setTimeout(r, 6000));
    const after = c.stage();
    return { before: { bells: before.bells, writes: before.doors.writes, angles: before.doors.angles }, after: { bells: after.bells, writes: after.doors.writes, angles: after.doors.angles, life: after.life }, v3: c.v3() };
  });

  // ---------------------------------------------------------------- J. destroy
  const J = await step('destroy', async () => {
    const s = window.__ss;
    clearInterval(s.timer);
    s.h.destroy();
    s.el.remove();
    return { canvases: document.querySelectorAll('canvas').length, ctCameraGone: !('__ctCamera' in window), pixelGone: !('__pixel' in window), fallbacks: s.fallbacks };
  });

  // ---------------------------------------------------------------- checks
  const P0 = A.v3?.programs;
  const progs = { ready: P0, day: B.v3.programs, canopyOff: C.programs0, canopyOn: C.programs1, vote: D.v3.programs, night: F.v3.programs, interior: G.inV3.programs, back: G2.v3.programs, coldInterior: G3.inV3.programs, coldBack: G3.v3.programs, dawn: H.v3.programs, idle: I.v3.programs };
  const sameAngles = JSON.stringify(I.before.angles) === JSON.stringify(I.after.angles);
  const checks = {
    ready: A.readyOk && A.world === 112,
    boarded10: B.stage.boarded.length === 10,
    dayHour: B.stage.targetHour > 12.5 && B.stage.targetHour < 14.5,
    bellOnFirstDay: B.stage.bells === 1,
    timerHook: B.stage.timer.available === false && /^\d+:\d\d$/.test(B.stage.timer.readout ?? ''),
    voteCameraHook: !!B.stage.vote && B.stage.vote.viewHeight > 0,
    cutDriven: !!C.cut && C.cut.on === true && C.cut.boxes >= 1,
    canopyPatched: CANOPY ? C.canopyOn.patched > 0 : C.canopyOn.patched === 0,
    canopyActive: C.canopyOn.active >= 2,
    canopyHole: CANOPY ? C.hole > Math.max(1.5 * C.baseline, C.baseline + 80) : C.hole < 1.5 * C.baseline + 40,
    programsConstant: Object.values(progs).every((p) => p === P0),
    vote: D.dais.phase === 'vote' && D.dais.hand !== null && D.dais.seats.filter((x) => x.occupied).length === 5 && D.dais.seats.some((x) => x.voteHand),
    doorSwing: (D.stage.doors.writes['house-3'] ?? 0) === 0 && (E.after.writes['house-3'] ?? 0) > 1 && E.after.open.length === 0 && E.after.angles['house-3-door'] === 0,
    night: F.stage.targetHour === 23 && F.dais.phase === 'night' && F.stage.bells === 2,
    interior: G.drawn === 'bld:house-5' && G.inStage.interiors.parked === true && G.inStage.cut?.inside === true,
    interiorPrefetched: G.prefetched === true,
    interiorSwitchMs: typeof G.inStage.interiors.lastSwitchMs === 'number' && G.inStage.interiors.lastSwitchMs <= 120,
    coldInterior: G3.drawn === `bld:house-${G3.house}` && typeof G3.lastSwitchMs === 'number' && G3.stage.drawn === 'outdoors',
    outAgain: G2.stage.drawn === 'outdoors' && G2.stage.interiors.parked === false,
    dawn: H.stage.bells === 3 && H.stage.targetHour >= 6.25 && H.stage.targetHour <= 8,
    idleNoBell: I.before.bells === I.after.bells,
    idleNoDoor: sameAngles && JSON.stringify(I.before.writes) === JSON.stringify(I.after.writes),
    lifeOff: !!I.after.life && I.after.life.walkers === 0 && I.after.life.doors === 0 && !I.after.life.folk && !I.after.life.ambient,
    destroyed: J.canvases === 0 && J.ctCameraGone && J.pixelGone && J.fallbacks.length === 0,
    noConsoleErrors: consoleErrors.length === 0,
    noPieceWarnings: pieceWarns.length === 0,
    noDevServiceCalls: proxied.length === 0,
  };
  const ok = Object.values(checks).every(Boolean);
  const result = { done: true, ok, tier: TIER, canopyBuilt: CANOPY, frames, checks, programs: progs, interiorSwitchMs: G.inStage.interiors.lastSwitchMs, interiorHitch: G.hitch, coldInteriorSwitchMs: G3.lastSwitchMs, readyMs: A.readyMs, gpu: A.v3?.gpu, canopy: { tiles, box: C.box, baseline: C.baseline, hole: C.hole, pixels: C.pixels, uniforms: C.canopyOn, frames: C.frames, frameMs: C.frameMs }, cut: C.cut, consoleErrors, pieceWarns, proxied, raw: { A, B, C, D, E, F, G, G2, G3, H, I, J } };
  writeFileSync(path.join(OUT, `result-${TIER}${CANOPY ? '' : '-nocanopy'}.json`), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ ok, tier: TIER, canopyBuilt: CANOPY, frames, checks, programs: progs, interiorSwitchMs: result.interiorSwitchMs, interiorHitch: G.hitch, coldInteriorSwitchMs: G3.lastSwitchMs, readyMs: A.readyMs, gpu: A.v3?.gpu, canopy: result.canopy, cut: C.cut, consoleErrors, pieceWarns }, null, 1));
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
