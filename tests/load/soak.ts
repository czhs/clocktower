// Memory-leak soak (qa-deploy). Runs ON hshi-u1 against its own test instance (prod bundle):
// for --minutes, --workers parallel workers loop over realistic lobby lifecycles — create lobby,
// join, ready, start, setup, night, day vote/execution, declare winner, sometimes rematch, switch
// lobbies, abrupt drops, leave (-> lobby disposal) — while RSS (/proc) and V8 heap
// (/api/admin/status, as an admin account) are sampled every --sample-s seconds.
//
//   pnpm --filter @ct/server --filter @ct/client build && pnpm exec tsx tests/load/soak.ts -- --minutes 30
//
// Output: tests/load/results/soak-<ts>.{json,md} with the growth slope (MB/hour, least squares over
// the steady phase) and idle-baseline vs idle-final comparison.
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bot, makeBots } from '../support/bot.js';
import { playFullGame, setupGame, until } from '../support/game.js';
import { ApiClient } from '../support/http.js';
import { REPO_ROOT, startServer } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1]! : d;
};
const MINUTES = Number(arg('minutes', '30'));
const WORKERS = Number(arg('workers', '3'));
const SAMPLE_S = Number(arg('sample-s', '30'));
const PORT = Number(arg('port', '3397'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[soak ${new Date().toISOString().slice(11, 19)}]`, ...a);

function rssMb(pid: number): number | null {
  try {
    const m = readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/);
    return m ? Math.round(Number(m[1]) / 102.4) / 10 : null;
  } catch {
    return null;
  }
}
function fdCount(pid: number): number | null {
  try {
    return Number(execSync(`ls /proc/${pid}/fd | wc -l`).toString().trim());
  } catch {
    return null;
  }
}
/** least-squares slope of y over x (x in hours) */
function slope(pts: { x: number; y: number }[]): number | null {
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const num = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return den ? Math.round((num / den) * 100) / 100 : null;
}

interface Sample {
  t: number;
  phase: 'warmup' | 'load' | 'idle';
  rssMb: number | null;
  heapUsedMb: number | null;
  serverRssMb: number | null;
  fds: number | null;
  lobbies: number | null;
  cycles: number;
}

async function main() {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'ct-soak-'));
  const env = { LOBBY_MAX_COUNT: '12', LOBBY_IDLE_TIMEOUT_SEC: '10', RECONNECT_GRACE_SEC: '5' };
  // Phase A: create the admin account, then restart with ADMIN_ACCOUNT_IDS.
  let server = await startServer({ mode: 'dist', port: PORT, dataDir, env });
  const admin = new ApiClient(server.url, { 'X-Forwarded-For': '10.250.0.1' });
  const created = await admin.createAccount('soak admin');
  const adminId = created.body.account.id;
  const passphrase = created.body.passphrase;
  const secrets = { SESSION_SECRET: server.env.SESSION_SECRET!, PASSPHRASE_PEPPER: server.env.PASSPHRASE_PEPPER! };
  await server.stop();
  // Same DB + same secrets (a new pepper would invalidate every passphrase, by design).
  server = await startServer({ mode: 'dist', port: PORT, dataDir, env: { ...env, ...secrets, ADMIN_ACCOUNT_IDS: adminId } });
  const signin = await admin.signIn(passphrase);
  if (signin.status !== 200) throw new Error(`admin sign-in ${signin.status}`);
  const pid = server.pid;
  log(`server pid ${pid} on :${PORT}; ${WORKERS} workers for ${MINUTES} min, sampling every ${SAMPLE_S}s`);

  const stats = { cycles: 0, games: 0, rematches: 0, switches: 0, drops: 0, failures: 0, failureSamples: [] as string[] };
  const samples: Sample[] = [];
  const t0 = Date.now();
  let phase: Sample['phase'] = 'warmup';
  const sample = async () => {
    const st = await admin.adminStatus().catch(() => null);
    const body = st?.status === 200 ? (st.body as any) : null;
    samples.push({
      t: Math.round((Date.now() - t0) / 1000),
      phase,
      rssMb: rssMb(pid),
      heapUsedMb: body?.memory?.heapUsedMb ?? null,
      serverRssMb: body?.memory?.rssMb ?? null,
      fds: fdCount(pid),
      lobbies: body?.lobbies?.length ?? null,
      cycles: stats.cycles,
    });
    const s = samples.at(-1)!;
    log(`t=${s.t}s ${s.phase} rss ${s.rssMb} MB heap ${s.heapUsedMb} MB fds ${s.fds} lobbies ${s.lobbies} cycles ${s.cycles} games ${stats.games} fail ${stats.failures}`);
  };

  // A shared pool of accounts (6 per worker + spares for switching).
  const pool = await makeBots(WORKERS * 6 + 4, 'soak-', server.url, server.wsUrl, { record: false });
  const spares = pool.slice(WORKERS * 6);
  const openLobbies = new Set<string>();

  const turn = new Array<number>(WORKERS).fill(0);
  async function cycle(w: number) {
    // Rotate the host/ST role so no account trips the per-account open-lobby limit (2) while its
    // previous, now-empty lobbies wait for the idle timeout.
    const own = pool.slice(w * 6, w * 6 + 6);
    const k = (turn[w] = (turn[w] ?? 0) + 1) % 6;
    const bots = [...own.slice(k), ...own.slice(0, k)];
    for (const b of bots) b.stopActivity();
    const r = Math.random();
    const g = await setupGame(server.url, server.wsUrl, { bots, players: 5, maxPlayers: 6, noStart: r < 0.25, toDay: true });
    if (!g) throw new Error('game did not start');
    openLobbies.add(g.lobbyId);
    for (const b of bots) {
      b.exitBuildings = true;
      b.startWandering(8);
      b.startPinging(2000);
    }
    if (r < 0.25) {
      // Waiting-room churn: spares join/leave, someone switches lobbies, an abrupt drop.
      const spare = spares[Math.floor(Math.random() * spares.length)]!;
      if (!spare.room) {
        await spare.join(g.lobbyId).catch(() => undefined);
        await sleep(1000);
        const other = [...openLobbies].find((id) => id !== g.lobbyId);
        await spare.leave(true);
        if (other) {
          await spare.join(other).catch(() => undefined);
          stats.switches++;
          await sleep(500);
          await spare.leave(true);
        }
      }
      await bots[2]!.drop();
      stats.drops++;
      await sleep(2000);
    } else {
      await sleep(3000);
      await playFullGame(g);
      stats.games++;
      if (Math.random() < 0.4) {
        g.st.send('lobby:start', {}); // rematch: back to waiting with the same members
        await until(() => g.st.lobbyView?.lobby.phase === 'waiting', 8000, 'rematch -> waiting');
        stats.rematches++;
        await sleep(1000);
      }
    }
    for (const b of bots) b.stopActivity();
    await Promise.all(bots.map((b) => b.leave(Math.random() < 0.8)));
    openLobbies.delete(g.lobbyId);
    stats.cycles++;
  }

  // Warm-up: one cycle per worker, then wait for disposal and take the idle baseline.
  await Promise.all(Array.from({ length: WORKERS }, (_, w) => cycle(w).catch((e) => void stats.failureSamples.push(String(e)))));
  await sleep(15_000);
  await sample();
  const baseline = samples.at(-1)!;
  phase = 'load';
  const loadStart = Date.now();
  const deadline = loadStart + MINUTES * 60_000;
  const timer = setInterval(() => void sample(), SAMPLE_S * 1000);
  await Promise.all(
    Array.from({ length: WORKERS }, async (_, w) => {
      while (Date.now() < deadline) {
        try {
          await cycle(w);
        } catch (e) {
          stats.failures++;
          if (stats.failureSamples.length < 15) stats.failureSamples.push(`${new Date().toISOString().slice(11, 19)} w${w}: ${(e as Error).message}`);
          const bots = pool.slice(w * 6, w * 6 + 6);
          for (const b of bots) b.stopActivity();
          await Promise.all(bots.map((b) => b.leave(true).catch(() => undefined)));
          await sleep(8000);
        }
      }
    }),
  );
  clearInterval(timer);
  // Idle: everybody gone; give lobbies time to dispose (idle timeout 10 s) and GC time to run.
  phase = 'idle';
  await Promise.all(pool.map((b) => b.leave(true).catch(() => undefined)));
  for (let i = 0; i < 4; i++) {
    await sleep(15_000);
    await sample();
  }
  const final = samples.at(-1)!;
  const loadPts = samples.filter((s) => s.phase === 'load');
  const hours = (s: Sample) => s.t / 3600;
  const summary = {
    at: new Date().toISOString(),
    host: os.hostname(),
    config: { minutes: MINUTES, workers: WORKERS, sampleS: SAMPLE_S, env },
    stats,
    baseline,
    final,
    peak: { rssMb: Math.max(...samples.map((s) => s.rssMb ?? 0)), heapUsedMb: Math.max(...samples.map((s) => s.heapUsedMb ?? 0)) },
    slopeMbPerHour: {
      rss: slope(loadPts.filter((s) => s.rssMb !== null).map((s) => ({ x: hours(s), y: s.rssMb! }))),
      heapUsed: slope(loadPts.filter((s) => s.heapUsedMb !== null).map((s) => ({ x: hours(s), y: s.heapUsedMb! }))),
      fdsPerHour: slope(loadPts.filter((s) => s.fds !== null).map((s) => ({ x: hours(s), y: s.fds! }))),
    },
    idleDelta: {
      rssMb: final.rssMb !== null && baseline.rssMb !== null ? Math.round((final.rssMb - baseline.rssMb) * 10) / 10 : null,
      heapUsedMb: final.heapUsedMb !== null && baseline.heapUsedMb !== null ? Math.round((final.heapUsedMb - baseline.heapUsedMb) * 10) / 10 : null,
      fds: final.fds !== null && baseline.fds !== null ? final.fds - baseline.fds : null,
      lobbiesLeft: final.lobbies,
    },
    samples,
  };
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
  const out = path.join(REPO_ROOT, 'tests/load/results');
  mkdirSync(out, { recursive: true });
  const base = path.join(out, `soak-${summary.at.replace(/[:.]/g, '-').slice(0, 19)}-${MINUTES}m`);
  writeFileSync(`${base}.json`, JSON.stringify(summary, null, 2));
  const md = `# Soak ${summary.at}

- ${MINUTES} min, ${WORKERS} workers (each: 1 ST + 5 players), test instance on :${PORT} (prod bundle), env ${JSON.stringify(env)}
- Cycles ${stats.cycles} (full games ${stats.games}, rematches ${stats.rematches}, lobby switches ${stats.switches}, abrupt drops ${stats.drops}); failed cycles ${stats.failures}

| | idle baseline | peak | idle final | Δ idle | slope during load |
|---|---|---|---|---|---|
| RSS MB | ${baseline.rssMb} | ${summary.peak.rssMb} | ${final.rssMb} | ${summary.idleDelta.rssMb} | ${summary.slopeMbPerHour.rss} MB/h |
| V8 heapUsed MB | ${baseline.heapUsedMb} | ${summary.peak.heapUsedMb} | ${final.heapUsedMb} | ${summary.idleDelta.heapUsedMb} | ${summary.slopeMbPerHour.heapUsed} MB/h |
| open fds | ${baseline.fds} | ${Math.max(...samples.map((s) => s.fds ?? 0))} | ${final.fds} | ${summary.idleDelta.fds} | ${summary.slopeMbPerHour.fdsPerHour} /h |
| lobbies | ${baseline.lobbies} | ${Math.max(...samples.map((s) => s.lobbies ?? 0))} | ${final.lobbies} | | |
${stats.failureSamples.length ? `\nFailure samples:\n${stats.failureSamples.map((f) => `- ${f}`).join('\n')}\n` : ''}`;
  writeFileSync(`${base}.md`, md);
  console.log(md);
  log(`wrote ${base}.{json,md}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
