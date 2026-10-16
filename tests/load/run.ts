// Load test (qa-deploy): N lobbies x (P player bots + 1 Storyteller bot) moving at realistic rates
// for D seconds. Measures server CPU% / RSS (from /proc/<pid>, same host), WebSocket message and
// byte rates, ping RTT (ping/pong), world-snapshot delay, errors. Writes JSON + Markdown summaries
// to tests/load/results/.
//
//   pnpm --filter @ct/server build && pnpm test:load  # own test server (prod bundle) on 127.0.0.1:3399, 2 x (15+1), 60 s
//   pnpm test:load -- --lobbies 3 --players 15 --duration 120
//   pnpm test:load -- --url http://127.0.0.1:3001 --server-pid $(systemctl --user show -p MainPID --value clocktower-dev)
//
// Never point this at production: it creates accounts and lobbies.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bot, makeBots } from '../support/bot.js';
import { REPO_ROOT, startServer, type TestServer } from '../support/server.js';

// ---- args ------------------------------------------------------------------------------------
const argv = process.argv.slice(2).filter((a) => a !== '--');
function arg(name: string, def: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
}
const LOBBIES = Number(arg('lobbies', '2'));
const PLAYERS = Number(arg('players', '15'));
const DURATION_S = Number(arg('duration', '60'));
const MOVE_HZ = Number(arg('move-hz', '10'));
const PING_MS = Number(arg('ping-ms', '1000'));
const TARGET = arg('url', '');
const START_GAME = arg('game', 'yes') !== 'no';
const MODE = arg('mode', 'dist') as 'dist' | 'source'; // dist = production bundle (build it first)
let serverPid = Number(arg('server-pid', '0')) || 0;
const OUT_DIR = path.resolve(arg('out', path.join(REPO_ROOT, 'tests/load/results')));
if (/:3000\b/.test(TARGET) || /ts\.net/.test(TARGET)) {
  console.error('refusing to load-test production');
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[load ${new Date().toISOString().slice(11, 19)}]`, ...a);

function pct(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! * 10) / 10;
}
const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
const max = (v: number[]) => (v.length ? Math.round(Math.max(...v) * 10) / 10 : null);

// ---- /proc sampling --------------------------------------------------------------------------
const CLK_TCK = (() => {
  try {
    return Number(execSync('getconf CLK_TCK').toString().trim()) || 100;
  } catch {
    return 100;
  }
})();
function procTicks(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return Number(f[11]) + Number(f[12]); // utime + stime (fields 14,15)
  } catch {
    return null;
  }
}
function procRssMb(pid: number): number | null {
  try {
    const m = readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)\s+kB/);
    return m ? Math.round(Number(m[1]) / 102.4) / 10 : null;
  } catch {
    return null;
  }
}
function loBytes(): number | null {
  try {
    const line = readFileSync('/proc/net/dev', 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('lo:'));
    return line ? Number(line.split(':')[1]!.trim().split(/\s+/)[0]) : null;
  } catch {
    return null;
  }
}

interface Sample {
  t: number;
  cpuPct: number | null;
  rssMb: number | null;
  loadCpuPct: number;
  rxMsgs: number;
  txMsgs: number;
  /** server -> clients WS payload KB/s in this 1 s window (= outbound tunnel traffic, before TLS/framing) */
  s2cKBps: number;
}

// ---- main ------------------------------------------------------------------------------------
async function main() {
  let server: TestServer | null = null;
  let baseUrl = TARGET;
  if (!baseUrl) {
    const dist = MODE === 'dist';
    if (dist && !existsSync(path.join(REPO_ROOT, 'apps/server/dist/server.js'))) throw new Error('no server bundle: run `pnpm --filter @ct/server build` or pass --mode source');
    server = await startServer({
      mode: MODE,
      port: 3399,
      env: { LOBBY_MAX_COUNT: String(Math.max(4, LOBBIES + 1)), LOBBY_IDLE_TIMEOUT_SEC: '120' },
    });
    baseUrl = server.url;
    serverPid = server.pid;
    log(`started ${dist ? 'dist' : 'source'} test server ${baseUrl} pid ${serverPid}`);
  }
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  const health = await (await fetch(`${baseUrl}/internal/version`)).json().catch(() => ({ ok: 'unknown (non-local target)' }));
  log('target', baseUrl, JSON.stringify(health));

  // Accounts + lobbies.
  const t0 = Date.now();
  const lobbies: { id: string; st: Bot; players: Bot[] }[] = [];
  for (let l = 0; l < LOBBIES; l++) {
    const bots = await makeBots(PLAYERS + 1, `L${l + 1}-`, baseUrl, wsUrl, { record: false });
    const [st, ...players] = bots as [Bot, ...Bot[]];
    const id = await st.createLobby(`Load lobby ${l + 1}`, PLAYERS, true);
    await st.join(id, 'storyteller');
    for (let i = 0; i < players.length; i += 5) await Promise.all(players.slice(i, i + 5).map((p) => p.join(id)));
    lobbies.push({ id, st, players });
    log(`lobby ${l + 1}/${LOBBIES} ${id}: ST + ${players.length} players joined`);
  }
  const setupMs = Date.now() - t0;
  const everyone = lobbies.flatMap((l) => [l.st, ...l.players]);
  await sleep(1000);
  for (const l of lobbies) {
    const n = l.st.lobbyView?.members.length;
    if (n !== PLAYERS + 1) log(`WARNING lobby ${l.id}: ST sees ${n} members (expected ${PLAYERS + 1})`);
  }

  // Optionally start each game (ready -> start -> random setup -> first night -> day).
  const gameState: Record<string, string> = {};
  if (START_GAME) {
    for (const l of lobbies) {
      for (const p of l.players) p.send('lobby:ready', { ready: true });
    }
    await sleep(800);
    for (const l of lobbies) l.st.send('lobby:start', {});
    await sleep(2000);
    for (const l of lobbies) {
      const v = l.st.gameView as { kind?: string } | undefined;
      if (v?.kind !== 'storyteller') {
        gameState[l.id] = 'not started (game module did not send a Storyteller view)';
        continue;
      }
      l.st.send('st:command', { type: 'random_setup' });
      await sleep(500);
      l.st.send('st:command', { type: 'begin_first_night' });
      await sleep(1500);
      for (const step of ((l.st.gameView as any)?.nightQueue ?? []) as { id: string }[])
        l.st.send('st:command', { type: 'skip_step', stepId: step.id });
      l.st.send('st:command', { type: 'advance_phase', to: 'day' });
      await sleep(1000);
      gameState[l.id] = `phase=${(l.st.gameView as any)?.phase ?? '?'}`;
    }
    log('game state', JSON.stringify(gameState));
  }

  // Activity: everyone walks (valid BFS paths over walkable tiles) and leaves buildings when allowed.
  for (const l of lobbies) {
    for (const b of [l.st, ...l.players]) b.exitBuildings = true;
    l.st.startWandering(MOVE_HZ, 1.5);
    l.st.startPinging(PING_MS);
    for (const p of l.players) {
      p.startWandering(MOVE_HZ);
      p.startPinging(PING_MS);
    }
  }
  // Warm-up: wait (max 45 s) until bots have walked out of their homes into the town.
  const outdoors = () => everyone.filter((b) => b.location === 'outdoors').length;
  const warm0 = Date.now();
  while (Date.now() - warm0 < 45_000 && outdoors() < everyone.length * 0.9) await sleep(1000);
  const outdoorsAtStart = outdoors();
  log(`warm-up ${Math.round((Date.now() - warm0) / 1000)}s: ${outdoorsAtStart}/${everyone.length} bots outdoors`);
  const samples: Sample[] = [];
  const lo0 = loBytes();
  let lastTicks = serverPid ? procTicks(serverPid) : null;
  let lastCpu = process.cpuUsage();
  let lastT = performance.now();
  const totals = () => {
    let rx = 0;
    let tx = 0;
    for (const b of everyone) {
      rx += b.recorder.rxFrames;
      tx += b.recorder.txFrames;
    }
    return { rx, tx };
  };
  const base = totals();
  const baseBytes = everyone.reduce((a, b) => ({ rx: a.rx + b.recorder.rxBytes, tx: a.tx + b.recorder.txBytes }), { rx: 0, tx: 0 });
  const start = performance.now();
  let lastTotals = base;
  let lastRxBytes = baseBytes.rx;
  const corrections0 = everyone.reduce((a, b) => a + (b.recorder.typeCounts['world:teleport'] ?? 0), 0);
  const snapEnt0 = everyone.reduce((a, b) => a + b.snapshotEntities, 0);
  const snapN0 = everyone.reduce((a, b) => a + b.snapshotDelays.length, 0);
  log(`running ${DURATION_S}s: ${everyone.length} clients, move ${MOVE_HZ} Hz, ping every ${PING_MS} ms`);
  while (performance.now() - start < DURATION_S * 1000) {
    await sleep(1000);
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    const ticks = serverPid ? procTicks(serverPid) : null;
    const cpuPct = ticks !== null && lastTicks !== null ? Math.round(((ticks - lastTicks) / CLK_TCK / dt) * 1000) / 10 : null;
    const cu = process.cpuUsage(lastCpu);
    const tt = totals();
    samples.push({
      t: Math.round((now - start) / 100) / 10,
      cpuPct,
      rssMb: serverPid ? procRssMb(serverPid) : null,
      loadCpuPct: Math.round(((cu.user + cu.system) / 1e6 / dt) * 1000) / 10,
      rxMsgs: Math.round((tt.rx - lastTotals.rx) / dt),
      txMsgs: Math.round((tt.tx - lastTotals.tx) / dt),
      s2cKBps: (() => {
        const rxNow = everyone.reduce((a, b) => a + b.recorder.rxBytes, 0);
        const v = Math.round((rxNow - lastRxBytes) / dt / 102.4) / 10;
        lastRxBytes = rxNow;
        return v;
      })(),
    });
    lastTicks = ticks;
    lastCpu = process.cpuUsage();
    lastT = now;
    lastTotals = tt;
    if (samples.length % 10 === 0) {
      const s = samples.at(-1)!;
      log(`t=${s.t}s server cpu ${s.cpuPct}% rss ${s.rssMb} MB | s2c ${s.rxMsgs} msg/s ${s.s2cKBps} KB/s | c2s ${s.txMsgs} msg/s | outdoors ${outdoors()}/${everyone.length}`);
    }
  }
  const elapsed = (performance.now() - start) / 1000;
  for (const b of everyone) b.stopActivity();
  await sleep(1500); // let in-flight pongs arrive
  const lo1 = loBytes();
  const end = totals();
  const endBytes = everyone.reduce((a, b) => ({ rx: a.rx + b.recorder.rxBytes, tx: a.tx + b.recorder.txBytes }), { rx: 0, tx: 0 });

  // Aggregate.
  const rtts = everyone.flatMap((b) => b.ping.rtts);
  const delays = everyone.flatMap((b) => b.snapshotDelays);
  const typeTotals: Record<string, number> = {};
  for (const b of everyone) for (const [k, v] of Object.entries(b.recorder.typeCounts)) typeTotals[k] = (typeTotals[k] ?? 0) + v;
  const pingSent = everyone.reduce((a, b) => a + b.ping.sent, 0);
  const pingRecv = everyone.reduce((a, b) => a + b.ping.received, 0);
  const errors = everyone.flatMap((b) => b.errors.map((e) => `${b.name}: ${e.code} ${e.message}`));
  const disconnected = everyone.filter((b) => !b.room).map((b) => `${b.name} (close ${b.lastCloseCode})`);
  const cpu = samples.map((s) => s.cpuPct).filter((v): v is number => v !== null);
  const rss = samples.map((s) => s.rssMb).filter((v): v is number => v !== null);

  const summary = {
    at: new Date().toISOString(),
    host: os.hostname(),
    cpuModel: os.cpus()[0]?.model,
    cores: os.cpus().length,
    target: baseUrl,
    serverVersion: health.version,
    serverPid: serverPid || null,
    config: { lobbies: LOBBIES, playersPerLobby: PLAYERS, storytellers: LOBBIES, clients: everyone.length, durationS: DURATION_S, moveHz: MOVE_HZ, pingMs: PING_MS, startGame: START_GAME },
    setupMs,
    gameState,
    elapsedS: Math.round(elapsed * 10) / 10,
    server: {
      cpuPctAvg: avg(cpu),
      cpuPctP95: pct(cpu, 95),
      cpuPctMax: max(cpu),
      rssMbStart: rss[0] ?? null,
      rssMbMax: max(rss),
      rssMbEnd: rss.at(-1) ?? null,
    },
    loadGenerator: { cpuPctAvg: avg(samples.map((s) => s.loadCpuPct)) },
    traffic: {
      c2sMsgsPerSec: Math.round((end.tx - base.tx) / elapsed),
      s2cMsgsPerSec: Math.round((end.rx - base.rx) / elapsed),
      c2sKBps: Math.round((endBytes.tx - baseBytes.tx) / elapsed / 102.4) / 10,
      s2cKBps: Math.round((endBytes.rx - baseBytes.rx) / elapsed / 102.4) / 10,
      perClientS2cKBps: Math.round((endBytes.rx - baseBytes.rx) / elapsed / everyone.length / 102.4) / 10,
      s2cKBpsP95: pct(samples.map((x) => x.s2cKBps), 95),
      s2cKBpsMax: max(samples.map((x) => x.s2cKBps)),
      s2cMbitPerSec: Math.round(((endBytes.rx - baseBytes.rx) * 8) / elapsed / 1e4) / 100,
      loopbackKBps: lo0 !== null && lo1 !== null ? Math.round((lo1 - lo0) / elapsed / 102.4) / 10 : null,
      s2cByType: typeTotals,
    },
    latency: {
      pingSent,
      pongReceived: pingRecv,
      rttMsP50: pct(rtts, 50),
      rttMsP95: pct(rtts, 95),
      rttMsP99: pct(rtts, 99),
      rttMsMax: max(rtts),
      snapshotSamples: delays.length - snapN0,
      entitiesPerSnapshotAvg:
        delays.length - snapN0 > 0
          ? Math.round(((everyone.reduce((a, b) => a + b.snapshotEntities, 0) - snapEnt0) / (delays.length - snapN0)) * 10) / 10
          : null,
      serverCorrections: everyone.reduce((a, b) => a + (b.recorder.typeCounts['world:teleport'] ?? 0), 0) - corrections0,
      outdoorsAtStart,
      outdoorsAtEnd: outdoors(),
      snapshotDelayMsP50: pct(delays, 50),
      snapshotDelayMsP95: pct(delays, 95),
      snapshotDelayMsMax: max(delays),
    },
    errors: { count: errors.length, sample: errors.slice(0, 20), disconnected },
    samples,
  };

  // Clean up.
  await Promise.all(everyone.map((b) => b.leave().catch(() => undefined)));
  if (server) await server.stop();

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = summary.at.replace(/[:.]/g, '-').slice(0, 19);
  const base_ = path.join(OUT_DIR, `${stamp}-${LOBBIES}x${PLAYERS}p-${DURATION_S}s`);
  writeFileSync(`${base_}.json`, JSON.stringify(summary, null, 2));
  writeFileSync(`${base_}.md`, markdown(summary));
  log(`wrote ${base_}.{json,md}`);
  console.log(markdown(summary));
  const ok = errors.length === 0 && disconnected.length === 0 && (pingSent === 0 || pingRecv / pingSent > 0.95);
  process.exit(ok ? 0 : 1);
}

function markdown(s: any): string {
  const v = (x: unknown) => (x === null || x === undefined ? 'n/a' : String(x));
  return `# Load test ${s.at}

- Host: ${s.host} (${s.cores} cores, ${s.cpuModel}); target ${s.target} (version ${s.serverVersion}, pid ${v(s.serverPid)})
- Config: ${s.config.lobbies} lobbies x (${s.config.playersPerLobby} players + 1 Storyteller) = ${s.config.clients} WebSocket clients, ${s.elapsedS}s, moves ${s.config.moveHz} Hz/client, ping every ${s.config.pingMs} ms
- Setup (accounts + lobbies + joins): ${s.setupMs} ms; game: ${Object.values(s.gameState).join('; ') || 'not attempted'}

| Metric | Value |
|---|---|
| Server CPU % (avg / p95 / max, 100% = 1 core) | ${v(s.server.cpuPctAvg)} / ${v(s.server.cpuPctP95)} / ${v(s.server.cpuPctMax)} |
| Server RSS MB (start / max / end) | ${v(s.server.rssMbStart)} / ${v(s.server.rssMbMax)} / ${v(s.server.rssMbEnd)} |
| C2S messages/s (all clients) | ${s.traffic.c2sMsgsPerSec} |
| S2C messages/s (all clients) | ${s.traffic.s2cMsgsPerSec} |
| C2S / S2C KB/s (WS payload) | ${s.traffic.c2sKBps} / ${s.traffic.s2cKBps} |
| S2C KB/s per client | ${s.traffic.perClientS2cKBps} |
| **Outbound (S2C) KB/s p95 / max; Mbit/s avg** | ${v(s.traffic.s2cKBpsP95)} / ${v(s.traffic.s2cKBpsMax)}; ${v(s.traffic.s2cMbitPerSec)} |
| Bots outdoors at start / end of window | ${s.latency.outdoorsAtStart} / ${s.latency.outdoorsAtEnd} of ${s.config.clients} |
| Server move corrections (world:teleport) during window | ${s.latency.serverCorrections} |
| Loopback KB/s (all lo traffic) | ${v(s.traffic.loopbackKBps)} |
| Ping RTT ms (p50 / p95 / p99 / max) | ${v(s.latency.rttMsP50)} / ${v(s.latency.rttMsP95)} / ${v(s.latency.rttMsP99)} / ${v(s.latency.rttMsMax)} |
| Pongs / pings | ${s.latency.pongReceived} / ${s.latency.pingSent} |
| Snapshot delay ms (p50 / p95 / max; ${s.latency.snapshotSamples} samples) | ${v(s.latency.snapshotDelayMsP50)} / ${v(s.latency.snapshotDelayMsP95)} / ${v(s.latency.snapshotDelayMsMax)} |
| Entities per snapshot (avg) | ${v(s.latency.entitiesPerSnapshotAvg)} |
| Load generator CPU % avg | ${v(s.loadGenerator.cpuPctAvg)} |
| Errors / disconnected clients | ${s.errors.count} / ${s.errors.disconnected.length} |

${s.latency.entitiesPerSnapshotAvg === 0 ? '\n> **Caveat:** world snapshots contained no entities (WorldModule stub at this commit), so movement fan-out is NOT represented in these numbers.\n' : ''}
S2C messages by type: ${Object.entries(s.traffic.s2cByType).map(([k, n]) => `${k}=${n}`).join(', ') || 'none'}
${s.errors.count ? `\nErrors (first 20):\n${s.errors.sample.map((e: string) => `- ${e}`).join('\n')}\n` : ''}${s.errors.disconnected.length ? `\nDisconnected: ${s.errors.disconnected.join(', ')}\n` : ''}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
