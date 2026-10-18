// (v3 perf recon, front "server", CT_AGENT=v3-perf-server) Server CPU / memory / GC / bytes-per-client of v2 vs v3
// ('Hollowmere') lobbies under the same bot behaviour, one fresh test server per (world, round), interleaved.
//
//   CT_AGENT=v3-perf-server scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock \
//     pnpm exec tsx tests/perf/v3-server-load.ts --worlds v2,v3 --rounds 2 --lobbies 1 --players 15 --walk 40 --stage 25 \
//       --cpuprof no --ports 3492-3493 --out /tmp/ct-v3srv'
//   many lobbies: --lobbies 6 --players 9          (6 x (9 players + 1 ST) = 60 clients)
//   hot spots:    --cpuprof yes --rounds 1         (V8 profile per server in <out>/<world>-r<k>/cpuprof; summarise with
//                                                  tests/perf/cpuprofile-summary.ts <file> --skip 20000)
//
// Phases per server (each measured separately):
//   A walk   : every client (ST at 1.5x) wanders outdoors on valid paths of ITS lobby's layout at --hz (10) for --walk s,
//              pinging 1/s (as server-profile.ts phase A, but layout-aware: tests/support/bot.ts plans on the v2 layout only)
//   B stage  : ST gathers the circle, then walk_to(all, seat) and after --stage/2 s walk_to(all, home) (server-driven
//              A* walks through the doors into the interior bands); clients stop sending moves while snapshot.you is set
// Per phase: server CPU % (/proc, user/sys, per thread), event-loop utilisation + delay, GC pauses by kind (from
// tests/perf/v3-server-preload.mjs inside the server), heap/RSS/anon RSS, S2C/C2S bytes per client, message rates by
// type (ST and one player of lobby 1), corrections (world:teleport) per client-second.
// Ports: only --ports (default 3492-3493, this agent's range). Never 3000/3001. --cpuprof yes inflates CPU (~3 % of a
// core for the profiler thread, perf-v2.2-results.md P3): budget numbers come from --cpuprof no runs.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from '@colyseus/msgpackr';
import { isBlockedPx, PLAYER_SPEED, tileCenterPx, type Facing, type TownLayout, type WorldSnapshot } from '../../packages/protocol/src/index.js';
import { townLayout } from '../../packages/assets/src/index.js';
import { townLayoutV3 } from '../../packages/assets/src/hollowmere/layoutV3.js';
import { makeBots, type Bot } from '../support/bot.js';
import { pickPort, startServer } from '../support/server.js';
import { Grid } from './v3-grid.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
};
const WORLDS = arg('worlds', 'v2,v3').split(',').map((w) => w.trim()) as ('v2' | 'v3')[];
const ROUNDS = Number(arg('rounds', '1'));
const LOBBIES = Number(arg('lobbies', '1'));
const PLAYERS = Number(arg('players', '15'));
const WALK_S = Number(arg('walk', '40'));
const STAGE_S = Number(arg('stage', '24'));
const HZ = Number(arg('hz', '10'));
/** Storyteller wander speed multiplier; 1.5 = server-profile.ts parity (above MOVE_TOLERANCE 1.35: some ST corrections). */
const ST_SPEED = Number(arg('stspeed', '1.5'));
const SNAP2 = arg('snap2', 'yes') === 'yes';
/** Send one moving:false move when a bot pauses (the real v3 client sends its stop pose: net/local.ts poseChanged). */
const STOPS = arg('stops', 'yes') === 'yes';
const CPUPROF = arg('cpuprof', 'no') === 'yes';
const VOICE = arg('voice', 'yes') === 'yes';
const VOICE_OPTIN = arg('voiceoptin', 'no') === 'yes';
const MODE = arg('mode', 'source') === 'dist' ? 'dist' : 'source';
/** Extra env for the test server, e.g. --serverenv WS_DEFLATE=off (comma-separated K=V). */
const SERVER_ENV = Object.fromEntries(
  arg('serverenv', '')
    .split(',')
    .filter((kv) => kv.includes('='))
    .map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]),
) as Record<string, string>;
const OUT = path.resolve(arg('out', '/tmp/ct-v3srv'));
const [PORT_MIN, PORT_MAX] = arg('ports', '3492-3493').split('-').map(Number) as [number, number];
if (PORT_MIN <= 3001 || PORT_MAX <= 3001) throw new Error('refusing prod/dev ports');
const LAYOUTS: Record<'v2' | 'v3', TownLayout> = { v2: townLayout, v3: townLayoutV3 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[v3srv ${new Date().toISOString().slice(11, 19)}]`, ...a);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---- /proc ---------------------------------------------------------------------------------------
const CLK = Number(execSync('getconf CLK_TCK').toString().trim()) || 100;
const statFields = (p: string) => {
  const f = readFileSync(p, 'utf8');
  return f.slice(f.lastIndexOf(')') + 2).split(' ');
};
const ticksUS = (pid: number): [number, number] => {
  const a = statFields(`/proc/${pid}/stat`);
  return [Number(a[11]), Number(a[12])];
};
const threadTicks = (pid: number): Map<string, number> => {
  const out = new Map<string, number>();
  for (const tid of readdirSync(`/proc/${pid}/task`)) {
    try {
      const f = readFileSync(`/proc/${pid}/task/${tid}/stat`, 'utf8');
      const name = f.slice(f.indexOf('(') + 1, f.lastIndexOf(')')).replace(/[0-9]+$/, '#');
      const a = f.slice(f.lastIndexOf(')') + 2).split(' ');
      out.set(name, (out.get(name) ?? 0) + Number(a[11]) + Number(a[12]));
    } catch {
      /* exited */
    }
  }
  return out;
};
const statusKb = (pid: number, key: string) => Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(new RegExp(`${key}:\\s+(\\d+)`))?.[1] ?? 0);
const loadavg = () => readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).map(Number);

// ---- preload metrics (server-side) ----------------------------------------------------------------
type PreloadLine = {
  t: number;
  pid?: number;
  eldRes?: number;
  elu: { idle: number; active: number };
  eld: { p50: number; p99: number; max: number; mean: number; n: number } | null;
  gc: Record<string, { n: number; ms: number; max: number }>;
  gcPauseBuckets025ms: number[];
  heap: { used: number; total: number; ext: number; ab: number };
  rss: number;
};
const readPreload = (file: string, pid: number): PreloadLine[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as PreloadLine)
        .filter((l) => l.pid === undefined || l.pid === pid)
    : [];

function preloadWindow(file: string, pid: number, t0: number, t1: number) {
  const lines = readPreload(file, pid);
  const inWin = lines.filter((l) => l.t >= t0 && l.t <= t1 + 50);
  const before = [...lines].reverse().find((l) => l.t <= t0) ?? inWin[0];
  const last = inWin.at(-1);
  if (!before || !last || before === last) return null;
  const activeMs = last.elu.active - before.elu.active;
  const idleMs = last.elu.idle - before.elu.idle;
  const gc: Record<string, { n: number; ms: number; perSec: number }> = {};
  const secs = (last.t - before.t) / 1000;
  let gcMax = 0;
  for (const [k, v] of Object.entries(last.gc)) {
    const b = before.gc[k] ?? { n: 0, ms: 0, max: 0 };
    gc[k] = { n: v.n - b.n, ms: r1(v.ms - b.ms), perSec: r2((v.n - b.n) / secs) };
  }
  const buckets = last.gcPauseBuckets025ms.map((n, i) => n - (before.gcPauseBuckets025ms[i] ?? 0));
  const total = buckets.reduce((a, b) => a + b, 0);
  let acc = 0;
  let p99 = 0;
  for (let i = 0; i < buckets.length; i++) {
    acc += buckets[i]!;
    if (buckets[i]! > 0) gcMax = (i + 1) * 0.25;
    if (!p99 && acc >= total * 0.99) p99 = (i + 1) * 0.25;
  }
  // Event-loop delay beyond the histogram's own sampling interval (eldRes, default 10 ms).
  const eld = inWin
    .filter((l) => !!l.eld)
    .map((l) => ({ p99: Math.max(0, l.eld!.p99 - (l.eldRes ?? 10)), max: Math.max(0, l.eld!.max - (l.eldRes ?? 10)), mean: Math.max(0, l.eld!.mean - (l.eldRes ?? 10)) }));
  const heapUsed = inWin.map((l) => l.heap.used / 1048576);
  return {
    secs: r1(secs),
    eluPct: r1((activeMs / Math.max(1, activeMs + idleMs)) * 100),
    eluActiveMsPerSec: r1(activeMs / secs),
    /** Upper bound of the per-tick cost: all JS + IO callbacks of the second / ticks per second (24 Hz). */
    eluActiveMsPerTick24: r2(activeMs / secs / 24),
    eldP99MsMaxOfSeconds: eld.length ? r2(Math.max(...eld.map((e) => e.p99))) : null,
    eldMaxMs: eld.length ? r2(Math.max(...eld.map((e) => e.max))) : null,
    eldMeanMs: eld.length ? r2(eld.reduce((a, e) => a + e.mean, 0) / eld.length) : null,
    gc,
    gcPauses: total,
    gcPauseP99Ms: p99 || null,
    gcPauseMaxMsBucket: gcMax || null,
    gcMsPerSec: r2(Object.values(gc).reduce((a, g) => a + g.ms, 0) / secs),
    heapUsedMb: heapUsed.length ? { min: r1(Math.min(...heapUsed)), max: r1(Math.max(...heapUsed)), end: r1(heapUsed.at(-1)!) } : null,
  };
}

// ---- layout-aware wandering (tests/support/bot.ts plans on the v2 layout only) ------------------------
/** Wander like Bot.startWandering, on `L`. Detects server teleports by identity (Bot replaces `pos` on world:teleport). */
function wander(bot: Bot, L: TownLayout, grid: Grid, hz: number, speedMult: number): () => void {
  let seq = 1_000_000; // above anything the server acked before (Bot's own counter is private)
  let path: { x: number; y: number }[] = [];
  let cur: { x: number; y: number } | null = null;
  let pause = 0;
  let doorWait = 0;
  let facing: Facing = 'down';
  let lastMoving = false;
  const dt = 1 / hz;
  const timer = setInterval(() => {
    const room = bot.room;
    if (!room || !bot.pos) return;
    if (bot.pos !== cur) {
      cur = bot.pos; // first position or a server teleport: re-plan from here
      path = [];
    }
    const snap = bot.latest['world:snapshot'] as WorldSnapshot | undefined;
    if (snap?.you) return; // server walk / frozen: a real client stops predicting and sending moves
    if (pause > 0) {
      pause -= dt;
      if (STOPS && lastMoving) {
        lastMoving = false;
        try {
          room.send('move', { seq: seq++, x: Math.round(cur.x * 10) / 10, y: Math.round(cur.y * 10) / 10, facing, moving: false });
        } catch {
          /* closing */
        }
      }
      return;
    }
    if (doorWait > 0) doorWait -= dt;
    let moving = false;
    if (!path.length) {
      const inside = bot.location.startsWith('bld:') ? L.buildings.find((b) => `bld:${b.id}` === bot.location) : undefined;
      const phase = (bot.latest['game:view'] as { phase?: string } | undefined)?.phase;
      const locked = phase === 'first_night' || phase === 'night' || phase === 'dawn';
      if (inside && !locked) {
        const door = tileCenterPx(L, inside.interiorDoor);
        if (Math.hypot(door.x - cur.x, door.y - cur.y) < 12) {
          if (doorWait <= 0) {
            room.send('world:useDoor', { buildingId: inside.id });
            doorWait = 1;
          }
        } else path = grid.plan(cur, inside.interiorDoor) ?? [];
      } else {
        for (let i = 0; i < 10 && !path.length; i++) {
          const g = grid.nearby(cur);
          if (g) path = grid.plan(cur, g) ?? [];
        }
        if (path.length && Math.random() < 0.3) pause = 0.5 + Math.random() * 2;
      }
    }
    const wp = path[0];
    if (wp) {
      const dx = wp.x - cur.x;
      const dy = wp.y - cur.y;
      const dist = Math.hypot(dx, dy);
      const budget = PLAYER_SPEED * speedMult * dt;
      let nx: number;
      let ny: number;
      if (dist <= budget) {
        nx = wp.x;
        ny = wp.y;
        path.shift();
      } else {
        nx = cur.x + (dx / dist) * budget;
        ny = cur.y + (dy / dist) * budget;
      }
      if (isBlockedPx(L, nx, ny)) path = [];
      else {
        if (dist > 0.01) facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        cur = { x: nx, y: ny };
        bot.pos = cur;
        moving = true;
      }
    }
    lastMoving = moving;
    try {
      room.send('move', { seq: seq++, x: Math.round(cur.x * 10) / 10, y: Math.round(cur.y * 10) / 10, facing, moving });
    } catch {
      /* closing */
    }
  }, 1000 / hz);
  return () => clearInterval(timer);
}

// ---- per-type meter (two bots of lobby 1; recorder listeners JSON-encode every payload, so not on all bots) ----
type TypeStat = { n: number; mp: number; maxMp: number };
function meter(b: Bot) {
  const by: Record<string, TypeStat> = {};
  b.recorder.onMessage((m) => {
    const s = (by[m.type] ??= { n: 0, mp: 0, maxMp: 0 });
    const mp = pack(m.payload).length + m.type.length + 2;
    s.n++;
    s.mp += mp;
    s.maxMp = Math.max(s.maxMp, mp);
  });
  return {
    by,
    reset() {
      for (const k of Object.keys(by)) delete by[k];
    },
  };
}

interface Lobby {
  id: string;
  st: Bot;
  players: Bot[];
}

async function setupLobby(world: 'v2' | 'v3', l: number, url: string, wsUrl: string): Promise<Lobby> {
  const bots = await makeBots(PLAYERS + 1, `${world}L${l}-${Math.random().toString(36).slice(2, 5)}-`, url, wsUrl, { record: false, snap2: SNAP2 });
  const [st, ...players] = bots as [Bot, ...Bot[]];
  for (const b of bots) b.autoRespondEnabled = false; // as server-profile.ts (scripted game, no prompts by day)
  // ApiClient.createLobby's type predates `world`; the body is passed through as is.
  const r = await st.api.createLobby({ name: `perf ${world} ${l}`, maxPlayers: Math.max(5, PLAYERS), takeStoryteller: true, world } as Parameters<Bot['api']['createLobby']>[0]);
  if (r.status !== 201 && r.status !== 200) throw new Error(`createLobby ${world}: ${r.status} ${r.text.slice(0, 200)}`);
  const id = r.body.lobby.id;
  if ((r.body.lobby as { world?: string }).world !== undefined && (r.body.lobby as { world?: string }).world !== world) throw new Error(`lobby world mismatch: ${(r.body.lobby as { world?: string }).world}`);
  await st.join(id, 'storyteller');
  for (let i = 0; i < players.length; i += 5) await Promise.all(players.slice(i, i + 5).map((p) => p.join(id)));
  return { id, st, players };
}

async function until(fn: () => unknown, ms: number, what: string) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timeout: ${what}`);
    await sleep(100);
  }
}

async function startGame(lb: Lobby) {
  for (const p of lb.players) p.send('lobby:ready', { ready: true });
  await until(() => lb.st.lobbyView?.canStart, 10_000, 'canStart');
  lb.st.send('lobby:start', {});
  await until(() => (lb.st.gameView as { kind?: string } | undefined)?.kind === 'storyteller', 8000, 'st view');
  const cmd = (c: unknown) => lb.st.send('st:command', c);
  cmd({ type: 'random_setup' });
  await until(() => ((lb.st.gameView as { grimoire?: unknown[] })?.grimoire?.length ?? 0) === PLAYERS, 8000, 'grimoire');
  cmd({ type: 'begin_first_night' });
  await until(() => (lb.st.gameView as { phase?: string })?.phase === 'first_night', 8000, 'first night');
  for (const s of ((lb.st.gameView as { nightQueue?: { id: string; status: string }[] })?.nightQueue ?? []))
    if (s.status !== 'resolved' && s.status !== 'skipped') cmd({ type: 'skip_step', stepId: s.id });
  if ((lb.st.gameView as { pendingResult?: unknown })?.pendingResult) cmd({ type: 'override_result' });
  cmd({ type: 'advance_phase', to: 'day' });
  await until(() => (lb.st.gameView as { phase?: string })?.phase === 'day', 8000, 'day');
}

async function runServer(world: 'v2' | 'v3', round: number) {
  const L = LAYOUTS[world];
  const grid = new Grid(L);
  const dir = path.join(OUT, `${world}-r${round}`);
  mkdirSync(path.join(dir, 'cpuprof'), { recursive: true });
  const preloadOut = path.join(dir, 'preload.jsonl');
  writeFileSync(preloadOut, '');
  const port = await pickPort(PORT_MIN, PORT_MAX);
  const nodeOpts = [`--import ${path.join(HERE, 'v3-server-preload.mjs')}`];
  if (CPUPROF) nodeOpts.push(`--cpu-prof --cpu-prof-dir=${path.join(dir, 'cpuprof')} --cpu-prof-interval=500`);
  const env: Record<string, string> = {
    LOBBY_IDLE_TIMEOUT_SEC: '120',
    LOBBY_MAX_COUNT: String(Math.max(8, LOBBIES + 1)),
    CT_PERF_PRELOAD_OUT: preloadOut,
    NODE_OPTIONS: nodeOpts.join(' '),
  };
  if (VOICE) Object.assign(env, { LIVEKIT_URL: 'ws://127.0.0.1:9', LIVEKIT_API_KEY: 'perfkey', LIVEKIT_API_SECRET: 'perf-secret-0123456789abcdef0123456789abcdef' });
  if (VOICE_OPTIN) env.VOICE_TEST_AUTO_OPT_IN = '1';
  Object.assign(env, SERVER_ENV);
  const server = await startServer({ mode: MODE, port, env });
  const pid = server.pid;
  log(`${world} r${round}: server ${server.url} pid ${pid}`);
  const phases: unknown[] = [];
  const stops: (() => void)[] = [];
  const lobbies: Lobby[] = [];
  const rssIdle = { rssMb: r1(statusKb(pid, 'VmRSS') / 1024), anonMb: r1(statusKb(pid, 'RssAnon') / 1024) };
  try {
    for (let l = 0; l < LOBBIES; l++) lobbies.push(await setupLobby(world, l, server.url, server.wsUrl));
    for (const lb of lobbies) await startGame(lb);
    const everyone = lobbies.flatMap((lb) => [lb.st, ...lb.players]);
    log(`${world} r${round}: ${lobbies.length} lobbies at day, ${everyone.length} clients`);
    const meters = [meter(lobbies[0]!.st), meter(lobbies[0]!.players[0]!)];
    for (const lb of lobbies) {
      stops.push(wander(lb.st, L, grid, HZ, ST_SPEED));
      for (const p of lb.players) stops.push(wander(p, L, grid, HZ, 0.9));
      for (const b of [lb.st, ...lb.players]) b.startPinging(1000);
    }
    const outdoors = () => everyone.filter((b) => b.location === 'outdoors').length;
    const w0 = Date.now();
    while (Date.now() - w0 < 45_000 && outdoors() < everyone.length * 0.9) await sleep(500);
    log(`${world} r${round}: ${outdoors()}/${everyone.length} outdoors after ${Math.round((Date.now() - w0) / 1000)} s`);
    await sleep(3000); // settle (JIT, first keyframes)

    const measure = async (label: string, run: () => Promise<void>) => {
      for (const m of meters) m.reset();
      const rx0 = everyone.map((b) => b.recorder.rxBytes);
      const tx0 = everyone.map((b) => b.recorder.txBytes);
      const rf0 = everyone.map((b) => b.recorder.rxFrames);
      const tf0 = everyone.map((b) => b.recorder.txFrames);
      const rtt0 = everyone.map((b) => b.ping.rtts.length);
      const tp0 = everyone.reduce((a, b) => a + (b.recorder.typeCounts['world:teleport'] ?? 0), 0);
      const la0 = loadavg();
      const us0 = ticksUS(pid);
      const th0 = threadTicks(pid);
      const t0 = Date.now();
      const p0 = performance.now();
      const cpuSamples: number[] = [];
      const anon: number[] = [];
      let lastT = ticksUS(pid);
      let lastP = p0;
      const sampler = setInterval(() => {
        const c = ticksUS(pid);
        const p = performance.now();
        cpuSamples.push(((c[0] + c[1] - lastT[0] - lastT[1]) / CLK / ((p - lastP) / 1000)) * 100);
        anon.push(r1(statusKb(pid, 'RssAnon') / 1024));
        lastT = c;
        lastP = p;
      }, 1000);
      await run();
      clearInterval(sampler);
      const secs = (performance.now() - p0) / 1000;
      const t1 = Date.now();
      const us1 = ticksUS(pid);
      const th1 = threadTicks(pid);
      const la1 = loadavg();
      const pctOf = (t: number) => r1((t / CLK / secs) * 100);
      const rx = everyone.map((b, i) => (b.recorder.rxBytes - rx0[i]!) / secs);
      const tx = everyone.map((b, i) => (b.recorder.txBytes - tx0[i]!) / secs);
      const rf = everyone.map((b, i) => (b.recorder.rxFrames - rf0[i]!) / secs);
      const tf = everyone.map((b, i) => (b.recorder.txFrames - tf0[i]!) / secs);
      const rtts = everyone.flatMap((b, i) => b.ping.rtts.slice(rtt0[i]!)).sort((a, b) => a - b);
      const q = (f: number) => (rtts.length ? r2(rtts[Math.min(rtts.length - 1, Math.floor(rtts.length * f))]!) : null);
      const sorted = [...cpuSamples].sort((a, b) => a - b);
      await sleep(1100); // let the preload write the line that closes the window
      const res = {
        label,
        world,
        round,
        lobbies: LOBBIES,
        clients: everyone.length,
        secs: r1(secs),
        loadavgBefore: la0,
        loadavgAfter: la1,
        serverCpuPct: pctOf(us1[0] + us1[1] - us0[0] - us0[1]),
        serverCpuP95: r1(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
        serverCpuUserPct: pctOf(us1[0] - us0[0]),
        serverCpuSysPct: pctOf(us1[1] - us0[1]),
        serverCpuPerLobbyPct: r2((us1[0] + us1[1] - us0[0] - us0[1]) / CLK / secs * 100 / LOBBIES),
        serverCpuThreads: Object.fromEntries(
          [...th1.entries()]
            .map(([k, v]) => [k, pctOf(v - (th0.get(k) ?? 0))] as const)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]),
        ),
        cpuProfiler: CPUPROF,
        runtime: preloadWindow(preloadOut, pid, t0, t1),
        rssMb: r1(statusKb(pid, 'VmRSS') / 1024),
        rssAnonMb: { start: anon[0] ?? null, max: anon.length ? Math.max(...anon) : null, end: anon.at(-1) ?? null },
        s2cBytesPerSecPerClient: { avg: Math.round(rx.reduce((a, b) => a + b, 0) / rx.length), max: Math.round(Math.max(...rx)), st: Math.round(rx[0]!) },
        c2sBytesPerSecPerClient: Math.round(tx.reduce((a, b) => a + b, 0) / tx.length),
        /** (v3-perf-server) WebSocket messages per second per client, server -> client / client -> server. */
        s2cMsgsPerSecPerClient: r1(rf.reduce((a, b) => a + b, 0) / rf.length),
        c2sMsgsPerSecPerClient: r1(tf.reduce((a, b) => a + b, 0) / tf.length),
        /** (v3-perf-server) ping -> pong round trip (1/s per client, loopback): queueing in the server + ws. */
        pingRttMs: { n: rtts.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: rtts.length ? r2(rtts.at(-1)!) : null },
        s2cKBpsTotal: r1(rx.reduce((a, b) => a + b, 0) / 1024),
        teleportsPerClientMin: r2(((everyone.reduce((a, b) => a + (b.recorder.typeCounts['world:teleport'] ?? 0), 0) - tp0) / everyone.length / secs) * 60),
        outdoorsEnd: outdoors(),
        perType: Object.fromEntries(
          (['st', 'player'] as const).map((who, i) => [
            who,
            Object.fromEntries(
              Object.entries(meters[i]!.by)
                .sort((a, b) => b[1].mp - a[1].mp)
                .map(([t, s]) => [t, { perSec: r1(s.n / secs), avgB: Math.round(s.mp / s.n), maxB: s.maxMp, Bps: Math.round(s.mp / secs) }]),
            ),
          ]),
        ),
      };
      log(`${label}: cpu ${res.serverCpuPct}% (p95 ${res.serverCpuP95}) elu ${res.runtime?.eluPct}% gc ${res.runtime?.gcMsPerSec} ms/s p99 ${res.runtime?.gcPauseP99Ms} ms | s2c ${res.s2cBytesPerSecPerClient.avg} B/s/client ${res.s2cMsgsPerSecPerClient} msg/s, c2s ${res.c2sBytesPerSecPerClient} B/s ${res.c2sMsgsPerSecPerClient} msg/s | rtt p50/p95 ${res.pingRttMs.p50}/${res.pingRttMs.p95} ms | anon ${res.rssAnonMb.end} MB | load ${la0.join('/')} -> ${la1.join('/')}`);
      return res;
    };

    phases.push(await measure('A walk', () => sleep(WALK_S * 1000)));
    if (STAGE_S > 0) {
      phases.push(
        await measure('B stage (gather, walk_to seat, walk_to home)', async () => {
          for (const lb of lobbies) {
            lb.st.send('st:command', { type: 'gather', on: true });
            lb.st.send('st:command', { type: 'walk_to', who: 'all', to: { kind: 'seat' } });
          }
          await sleep((STAGE_S * 1000) / 2);
          for (const lb of lobbies) {
            lb.st.send('st:command', { type: 'gather', on: false });
            lb.st.send('st:command', { type: 'walk_to', who: 'all', to: { kind: 'home' } });
          }
          await sleep((STAGE_S * 1000) / 2);
        }),
      );
      const inside = everyone.filter((b) => b.location.startsWith('bld:')).length;
      log(`${world} r${round}: after stage ${inside}/${everyone.length} inside a building`);
      (phases.at(-1) as Record<string, unknown>).insideAfter = inside;
    }
    const errs = everyone.flatMap((b) => b.errors.map((e) => `${b.name}: ${e.code} ${e.message}`));
    if (errs.length) log('room errors', errs.slice(0, 5));
  } finally {
    for (const s of stops) s();
    for (const lb of lobbies) for (const b of [lb.st, ...lb.players]) b.stopActivity();
    await Promise.all(lobbies.flatMap((lb) => [lb.st, ...lb.players]).map((b) => b.leave().catch(() => undefined)));
    await server.stop();
  }
  const profs = readdirSync(path.join(dir, 'cpuprof')).filter((f) => f.endsWith('.cpuprofile'));
  return { world, round, port, rssIdle, phases, profiles: profs.map((f) => path.join(dir, 'cpuprof', f)) };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const runs: unknown[] = [];
  const la0 = loadavg();
  for (let r = 1; r <= ROUNDS; r++)
    for (const w of r % 2 ? WORLDS : [...WORLDS].reverse()) runs.push(await runServer(w, r)); // interleave order per round
  const summary = {
    at: new Date().toISOString(),
    host: { cores: os.cpus().length, cpu: os.cpus()[0]?.model, loadavgStart: la0, loadavgEnd: loadavg() },
    config: { stSpeed: ST_SPEED, worlds: WORLDS, rounds: ROUNDS, lobbies: LOBBIES, players: PLAYERS, walkS: WALK_S, stageS: STAGE_S, hz: HZ, snap2: SNAP2, stops: STOPS, cpuprof: CPUPROF, voice: VOICE, voiceOptIn: VOICE_OPTIN, mode: MODE, serverEnv: SERVER_ENV },
    runs,
  };
  const file = path.join(OUT, 'v3-server-load.json');
  writeFileSync(file, JSON.stringify(summary, null, 1));
  log('wrote', file);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
