// perf-audit: server + network profile of ONE realistic lobby (1 human Storyteller + N players,
// default 15) on its own test server (never 3000/3001). Phases measured:
//   A "day-walk"   : everyone wanders outdoors at 10 Hz for --walk seconds (pings 1/s)
//   B "day-vote"   : nominations open, one nomination + clockwise vote with N-1 hands (game:view churn)
// Records: server CPU% (/proc), per-client S2C bytes/s by message type (actual WS frames + msgpack /
// JSON size of each payload), game:view count + size per viewer kind, snapshot entity counts, and a
// V8 CPU profile of the server (NODE_OPTIONS=--cpu-prof) summarised by tests/perf/cpuprofile-summary.ts.
//
//   CT_AGENT=perf-audit scripts/remote.sh npx tsx tests/perf/server-profile.ts [--players 15] [--walk 40] [--voice yes] [--out /tmp/ct-perf]
//   (v2.2 WP4) [--snap2 yes] bots join with the compact 'world:snap2' capability like the real client;
//   [--ports 3370-3373] another port range for the test server (default 3390-3394).
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pack } from '@colyseus/msgpackr';
import { makeBots, type Bot } from '../support/bot.js';
import { nominateAndVote, safeNominee, setupGame, until } from '../support/game.js';
import { pickPort, startServer } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
};
const PLAYERS = Number(arg('players', '15'));
const WALK_S = Number(arg('walk', '40'));
const VOTE_S = Number(arg('vote', '45'));
const VOICE = arg('voice', 'yes') === 'yes';
const OUT = path.resolve(arg('out', '/tmp/ct-perf'));
const SNAP2 = arg('snap2', 'no') === 'yes';
const [PORT_MIN, PORT_MAX] = arg('ports', '3390-3394').split('-').map(Number) as [number, number];
const PROF_DIR = path.join(OUT, 'cpuprof');
mkdirSync(PROF_DIR, { recursive: true });
for (const f of readdirSync(PROF_DIR)) if (f.endsWith('.cpuprofile')) execSync(`rm -f ${path.join(PROF_DIR, f)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[perf ${new Date().toISOString().slice(11, 19)}]`, ...a);

const CLK = Number(execSync('getconf CLK_TCK').toString().trim()) || 100;
const ticks = (pid: number) => {
  const f = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const a = f.slice(f.lastIndexOf(')') + 2).split(' ');
  return Number(a[11]) + Number(a[12]);
};
const rss = (pid: number) => Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)![1]) / 1024;

type TypeStat = { n: number; frameBytes: number; mp: number; json: number; maxMp: number };
/** Per-bot per-type accounting. Frame bytes come from the raw socket (msgpack + colyseus framing). */
/** Snapshot what-ifs: how many entities did not change since the previous snapshot, and the msgpack size
 * of a quantised array encoding ([idx, x*10|0, y*10|0, facing*2+moving, locIdx]) with and without
 * unchanged entities. Pure measurement — the real protocol is unchanged. */
const snapWhatIf = { n: 0, entities: 0, unchanged: 0, quantB: 0, quantDeltaB: 0, actualB: 0 };
const ids = new Map<string, number>();
const locs = new Map<string, number>();
const FACING: Record<string, number> = { down: 0, up: 1, left: 2, right: 3 };
let prevSnap = new Map<string, string>();
function whatIf(s: { t: number; ackSeq: number; entities: { id: string; x: number; y: number; facing: string; moving: boolean; location: string }[] }) {
  const cur = new Map<string, string>();
  const rows: number[][] = [];
  const changed: number[][] = [];
  for (const e of s.entities) {
    const k = `${e.x},${e.y},${e.facing},${e.moving},${e.location}`;
    cur.set(e.id, k);
    if (!ids.has(e.id)) ids.set(e.id, ids.size);
    if (!locs.has(e.location)) locs.set(e.location, locs.size);
    const row = [ids.get(e.id)!, Math.round(e.x * 10), Math.round(e.y * 10), (FACING[e.facing] ?? 0) * 2 + (e.moving ? 1 : 0), locs.get(e.location)!];
    rows.push(row);
    if (prevSnap.get(e.id) !== k) changed.push(row);
    else snapWhatIf.unchanged++;
  }
  prevSnap = cur;
  snapWhatIf.n++;
  snapWhatIf.entities += s.entities.length;
  snapWhatIf.actualB += pack(s).length;
  snapWhatIf.quantB += pack([s.t, s.ackSeq, rows]).length;
  snapWhatIf.quantDeltaB += pack([s.t, s.ackSeq, changed]).length;
}

function meter(b: Bot, analyse = false) {
  const by: Record<string, TypeStat> = {};
  let window = true;
  b.recorder.onMessage((m) => {
    if (analyse && m.type === 'world:snapshot') whatIf(m.payload as Parameters<typeof whatIf>[0]);
    if (!window) return;
    const s = (by[m.type] ??= { n: 0, frameBytes: 0, mp: 0, json: 0, maxMp: 0 });
    const mp = pack(m.payload).length + m.type.length + 2;
    s.n++;
    s.mp += mp;
    s.json += m.json.length;
    s.maxMp = Math.max(s.maxMp, mp);
  });
  return {
    by,
    reset() {
      for (const k of Object.keys(by)) delete by[k];
      window = true;
    },
  };
}

async function measure(label: string, bots: Bot[], meters: ReturnType<typeof meter>[], pid: number, run: () => Promise<void>) {
  for (const m of meters) m.reset();
  const rx0 = bots.map((b) => b.recorder.rxBytes);
  const tx0 = bots.map((b) => b.recorder.txBytes);
  const t0 = performance.now();
  const c0 = ticks(pid);
  const cpuSamples: number[] = [];
  let last = c0;
  let lastT = t0;
  const sampler = setInterval(() => {
    const c = ticks(pid);
    const t = performance.now();
    cpuSamples.push(((c - last) / CLK / ((t - lastT) / 1000)) * 100);
    last = c;
    lastT = t;
  }, 1000);
  await run();
  clearInterval(sampler);
  const secs = (performance.now() - t0) / 1000;
  const cpu = (((ticks(pid) - c0) / CLK) / secs) * 100;
  const rx = bots.map((b, i) => (b.recorder.rxBytes - rx0[i]!) / secs);
  const tx = bots.map((b, i) => (b.recorder.txBytes - tx0[i]!) / secs);
  const sorted = [...cpuSamples].sort((a, b) => a - b);
  const res = {
    label,
    secs: Math.round(secs * 10) / 10,
    serverCpuPct: Math.round(cpu * 10) / 10,
    serverCpuP95: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
    rssMb: Math.round(rss(pid)),
    s2cBytesPerSecPerClient: { avg: Math.round(rx.reduce((a, b) => a + b, 0) / rx.length), max: Math.round(Math.max(...rx)), st: Math.round(rx[0]!) },
    c2sBytesPerSecPerClient: Math.round(tx.reduce((a, b) => a + b, 0) / tx.length),
    perType: Object.fromEntries(
      (['st', 'player'] as const).map((who, i) => [
        who,
        Object.fromEntries(
          Object.entries(meters[i]!.by)
            .sort((a, b) => b[1].mp - a[1].mp)
            .map(([t, s]) => [t, { perSec: Math.round((s.n / secs) * 10) / 10, avgMsgpackB: Math.round(s.mp / s.n), maxMsgpackB: s.maxMp, avgJsonB: Math.round(s.json / s.n), msgpackBps: Math.round(s.mp / secs) }]),
        ),
      ]),
    ),
  };
  log(label, JSON.stringify(res, null, 1));
  return res;
}

async function main() {
  const port = await pickPort(PORT_MIN, PORT_MAX);
  const env: Record<string, string> = {
    LOBBY_IDLE_TIMEOUT_SEC: '120',
    NODE_OPTIONS: `--cpu-prof --cpu-prof-dir=${PROF_DIR} --cpu-prof-interval=500`,
  };
  if (VOICE)
    Object.assign(env, { LIVEKIT_URL: 'ws://127.0.0.1:9', LIVEKIT_API_KEY: 'perfkey', LIVEKIT_API_SECRET: 'perf-secret-0123456789abcdef0123456789abcdef' });
  const server = await startServer({ mode: 'source', port, env });
  log('server', server.url, 'pid', server.pid);
  const results: unknown[] = [];
  try {
    const bots = await makeBots(PLAYERS + 1, `pf${Math.random().toString(36).slice(2, 5)}-`, server.url, server.wsUrl, { record: false, snap2: SNAP2 });
    const meters = [meter(bots[0]!), meter(bots[1]!, true)];
    const g = await setupGame(server.url, server.wsUrl, { players: PLAYERS, bots, maxPlayers: PLAYERS });
    if (!g) throw new Error('game did not start');
    log('day reached; seats', g.players.length);
    for (const b of bots) b.exitBuildings = true;
    g.st.startWandering(10, 1.5);
    for (const p of g.players) p.startWandering(10);
    for (const b of bots) b.startPinging(1000);
    await until(() => bots.filter((b) => b.location === 'outdoors').length >= bots.length * 0.9, 45_000, 'bots outdoors').catch(() => log('warn: not all outdoors'));
    results.push(await measure('A day-walk (16 clients wandering 10 Hz)', bots, meters, server.pid, () => sleep(WALK_S * 1000)));
    results.push(
      await measure('B day-vote (nomination + clockwise vote, still wandering)', bots, meters, server.pid, async () => {
        const { nominator, entry, nominee } = safeNominee(g);
        // The clockwise hand visits all seats: a 15-seat vote can outlast the helper's 40 s tally wait.
        await Promise.race([nominateAndVote(g, nominator, entry.seat, g.players.filter((p) => p !== nominee)).catch((e) => log('vote:', (e as Error).message.slice(0, 120))), sleep(VOTE_S * 1000)]);
      }),
    );
    // One full sample of each big message for the plan (sizes only; no secrets are printed).
    const stView = g.st.gameView;
    const plView = g.players[0]!.gameView;
    const snap = (g.players[0]!.latest as Record<string, unknown>)['world:snapshot'];
    const sizes = {
      stGameViewJson: JSON.stringify(stView).length,
      stGameViewMsgpack: pack(stView).length,
      playerGameViewJson: JSON.stringify(plView).length,
      playerGameViewMsgpack: pack(plView).length,
      snapshotJson: JSON.stringify(snap).length,
      snapshotMsgpack: pack(snap).length,
      snapshotEntities: (snap as { entities?: unknown[] })?.entities?.length,
      snapshotKeys: Object.keys((snap as object) ?? {}),
      stViewTopKeys: Object.fromEntries(Object.entries((stView as object) ?? {}).map(([k, v]) => [k, JSON.stringify(v)?.length ?? 0]).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 12)),
      playerViewTopKeys: Object.fromEntries(Object.entries((plView as object) ?? {}).map(([k, v]) => [k, JSON.stringify(v)?.length ?? 0]).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 12)),
    };
    const w = snapWhatIf;
    const whatIfRes = { snapshots: w.n, avgEntities: +(w.entities / w.n).toFixed(1), unchangedEntityPct: +((w.unchanged / w.entities) * 100).toFixed(1), avgActualB: Math.round(w.actualB / w.n), avgQuantisedB: Math.round(w.quantB / w.n), avgQuantisedDeltaB: Math.round(w.quantDeltaB / w.n) };
    log('snapshot what-if (player bot, whole run)', JSON.stringify(whatIfRes));
    results.push({ snapshotWhatIf: whatIfRes });
    log('sizes', JSON.stringify(sizes, null, 1));
    results.push({ sizes });
    for (const b of bots) b.stopActivity();
    await Promise.all(bots.map((b) => b.leave().catch(() => undefined)));
  } finally {
    await server.stop();
  }
  await sleep(500);
  const prof = readdirSync(PROF_DIR).filter((f) => f.endsWith('.cpuprofile'));
  log('cpu profiles', prof.join(', ') || 'NONE (server did not exit cleanly)');
  writeFileSync(path.join(OUT, 'server-profile.json'), JSON.stringify({ players: PLAYERS, walkS: WALK_S, voice: VOICE, results, profiles: prof }, null, 1));
  log('wrote', path.join(OUT, 'server-profile.json'));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
