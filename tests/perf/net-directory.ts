// (v3 perf recon, front "net", CT_AGENT=v3-perf-net) Lobby directory (SSE) cost with many lobbies.
//
// Part A, in process (no server, cheap; --bench yes): LobbyDirectory (apps/server/src/directory/service.ts) with M
//   lobbies and S subscribers whose write() is the real SSE line (`data: ${JSON.stringify(e)}\n\n`). Measures
//   update() without a change (the per-tick compare GameRoom.flushViews triggers), update() with a change (fan-out
//   to S streams, one JSON.stringify per subscriber as today), the same fan-out with ONE stringify per event (the
//   proposed change; implemented here only), list() + the 'snapshot' event size for M lobbies (each LobbySummary
//   now carries `world`), and the 30 s resync GET /api/lobbies body (client net/api.ts subscribeDirectory).
// Part B, end to end (--e2e yes, a real test server on --ports): M lobbies (one creator account each), S SSE
//   readers (3 streams per account, the SR-6 cap), J churn bots that join a random lobby, stay 1-3 s and leave.
//   Measures per-stream event rate and bytes/s, the snapshot bytes at connect, server CPU, host load.
//
//   CT_AGENT=v3-perf-net scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock \
//     pnpm exec tsx tests/perf/net-directory.ts --lobbies 30 --subs 60 --churn 6 --secs 30 --ports 3496-3497 --out /tmp/ct-v3net/dir'
import { execSync } from 'node:child_process';
import http from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DirectoryEvent, LobbySummary } from '../../packages/protocol/src/index.js';
import { LobbyDirectory, type LobbyRoomHandle } from '../../apps/server/src/directory/service.js';
import { makeBots, type Bot } from '../support/bot.js';
import { pickPort, startServer } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
};
const M = Number(arg('lobbies', '30'));
const S = Number(arg('subs', '60'));
const J = Number(arg('churn', '6'));
const SECS = Number(arg('secs', '30'));
const BENCH = arg('bench', 'yes') === 'yes';
const E2E = arg('e2e', 'yes') === 'yes';
const [PORT_MIN, PORT_MAX] = arg('ports', '3496-3497').split('-').map(Number) as [number, number];
const OUT = path.resolve(arg('out', '/tmp/ct-netdir'));
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[dir ${new Date().toISOString().slice(11, 19)}]`, ...a);
const r1 = (v: number) => Math.round(v * 10) / 10;
const rand = (n: number) => Math.floor(Math.random() * n);
const CLK = Number(execSync('getconf CLK_TCK').toString().trim()) || 100;
const ticks = (pid: number) => {
  const f = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const a = f.slice(f.lastIndexOf(')') + 2).split(' ');
  return Number(a[11]) + Number(a[12]);
};

function bench(name: string, fn: (i: number) => unknown, n: number) {
  for (let i = 0; i < Math.min(n, 20_000); i++) fn(i);
  const runs: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fn(i);
    runs.push(Number(process.hrtime.bigint() - t0) / n);
  }
  runs.sort((a, b) => a - b);
  const ns = runs[2]!;
  log(`${name.padEnd(64)} ${(ns / 1000).toFixed(2).padStart(9)} µs/op`);
  return r1(ns / 1000);
}

/** A realistic summary (human game, v3 world, names of typical length). */
function summary(i: number, world: 'v2' | 'v3'): LobbySummary {
  return {
    id: `amber-fox-lantern-${i}`,
    name: `Amber Lantern ${i}`,
    description: i % 3 ? '' : 'Friendly game, new players welcome. Voice on, be kind.',
    script: 'trouble-brewing',
    maxPlayers: 15,
    playerCount: 3 + (i % 12),
    storytellerName: i % 4 ? `Storyteller${i}` : null,
    storytellerSeatOpen: i % 4 === 0,
    phase: 'waiting',
    joinable: true,
    hostName: `Host${i}`,
    createdAt: 1_760_000_000_000 + i * 1000,
    updatedAt: 1_760_000_000_000 + i * 1000,
    storytellerMode: 'human',
    chatFilter: 'slurs',
    world,
  } as LobbySummary;
}

async function partA() {
  const quiet = { debug() {}, info() {}, warn() {}, error() {} };
  const dir = new LobbyDirectory({
    log: quiet,
    tickets: { issue: () => ({ ticket: 't', expiresAt: 0 }) } as never,
    lobbyMaxCount: M + 10,
    playerMaxPerLobby: 15,
    createRoom: async (id) => ({ roomId: id }),
    perAccountLimit: 1,
    perIpLimit: 1000,
  });
  const live: LobbySummary[] = [];
  for (let i = 0; i < M; i++) {
    const created = await dir.create({ id: `acct${i}`, displayName: `Host${i}` } as never, { name: `Amber Lantern ${i}`, description: '', script: 'trouble-brewing', maxPlayers: 15, takeStoryteller: true, world: 'v3' } as never);
    const s = { ...summary(i, 'v3'), id: created.id };
    live.push(s);
    const handle: LobbyRoomHandle = { roomId: created.id, isMember: () => false, isBanned: () => false, connectedCount: () => 0, summary: () => s };
    dir.attachRoom(created.id, handle);
    dir.update(s);
  }
  let written = 0;
  // (net front, after) the stream's real line builder when the tree has it (directory/http.ts sseLine: one
  // JSON.stringify per event, cached for every stream); before that change, one stringify per subscriber.
  const http = (await import('../../apps/server/src/directory/http.js')) as { sseLine?: (e: DirectoryEvent) => string };
  const lineOf = http.sseLine ?? ((e: DirectoryEvent) => `data: ${JSON.stringify(e)}\n\n`);
  const writers: ((e: DirectoryEvent) => void)[] = [];
  for (let k = 0; k < S; k++) {
    const w = (e: DirectoryEvent) => {
      written += lineOf(e).length;
    };
    writers.push(w);
    dir.subscribe(w);
  }
  const snapshotB = `data: ${JSON.stringify({ type: 'snapshot', lobbies: dir.list() })}\n\n`.length;
  const listBodyB = JSON.stringify({ lobbies: dir.list() }).length;
  const upsertB = `data: ${JSON.stringify({ type: 'upsert', lobby: live[0] })}\n\n`.length;
  const v2Upsert = `data: ${JSON.stringify({ type: 'upsert', lobby: { ...live[0], world: undefined } })}\n\n`.length;
  // update() with no change: what every lobby:view flush costs the directory (GameRoom.flushViews).
  // `cur[i]` is the summary the directory holds for lobby i (never mutated after it was handed over).
  const cur = live.map((s) => ({ ...s }));
  cur.forEach((s) => dir.update(s));
  const noChange = bench(`update() unchanged summary (${S} subs)`, (i) => dir.update({ ...cur[i % M]!, updatedAt: i }), 200_000);
  const next = (i: number) => {
    const k = i % M;
    const s = { ...cur[k]!, playerCount: cur[k]!.playerCount === 3 ? 4 : 3, updatedAt: i };
    cur[k] = s;
    return s;
  };
  let before = written;
  const changed = bench(`update() changed → fan-out to ${S} subs (${http.sseLine ? 'real sseLine' : 'stringify per sub'})`, (i) => dir.update(next(i)), 5_000);
  if (written === before) throw new Error('fan-out bench published nothing');
  // Proposed: publish() stringifies once and hands every stream the same line.
  const once = (e: DirectoryEvent) => {
    const line = `data: ${JSON.stringify(e)}\n\n`;
    for (let k = 0; k < S; k++) written += line.length;
  };
  before = written;
  const changedOnce = bench(`same fan-out, one stringify per event (proposed)`, (i) => once({ type: 'upsert', lobby: next(i) }), 5_000);
  if (written === before) throw new Error('proposed bench wrote nothing');
  const list = bench(`list() + snapshot JSON (${M} lobbies, per new stream / resync)`, () => JSON.stringify({ type: 'snapshot', lobbies: dir.list() }), 5_000);
  void written;
  const res = { lobbies: M, subscribers: S, snapshotEventB: snapshotB, resyncGetBodyB: listBodyB, upsertEventB: upsertB, upsertEventWithoutWorldB: v2Upsert, usUpdateUnchanged: noChange, usUpdateFanoutToday: changed, fanoutUsesSseLine: Boolean(http.sseLine), usUpdateFanoutStringifyOnce: changedOnce, usListSnapshot: list };
  log('partA', JSON.stringify(res));
  return res;
}

interface Reader {
  bytes: number;
  events: Record<string, number>;
  snapshotB: number;
  close(): void;
}
function openStream(baseUrl: string, cookie: string): Promise<Reader> {
  return new Promise((resolve, reject) => {
    const r: Reader = { bytes: 0, events: {}, snapshotB: 0, close: () => undefined };
    const req = http.get(`${baseUrl}/api/lobbies/stream`, { headers: { Cookie: cookie, Accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`stream ${res.statusCode}`));
        res.resume();
        return;
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        r.bytes += Buffer.byteLength(chunk);
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block.split('\n').find((l) => l.startsWith('data: '));
          if (!data) continue;
          try {
            const e = JSON.parse(data.slice(6)) as DirectoryEvent;
            r.events[e.type] = (r.events[e.type] ?? 0) + 1;
            if (e.type === 'snapshot' && !r.snapshotB) r.snapshotB = block.length + 2;
          } catch {
            /* partial */
          }
        }
      });
      r.close = () => req.destroy();
      resolve(r);
    });
    req.on('error', (e) => (r.bytes ? undefined : reject(e)));
  });
}

async function partB() {
  const port = await pickPort(PORT_MIN, PORT_MAX);
  const server = await startServer({ port, env: { LOBBY_MAX_COUNT: String(M + 5), LOBBY_IDLE_TIMEOUT_SEC: '300' } });
  log('server', server.url, 'pid', server.pid, 'load', os.loadavg().map(r1).join(' '));
  try {
    const creators = await makeBots(M, `dc${Math.random().toString(36).slice(2, 5)}-`, server.url, server.wsUrl, { record: false, snap2: true });
    const lobbyIds: string[] = [];
    for (const [i, c] of creators.entries()) {
      const r = await c.api.req<{ lobby: { id: string } }>('POST', '/api/lobbies', { name: `Lobby ${i}`, maxPlayers: 15, takeStoryteller: true, world: i % 2 ? 'v3' : 'v2' });
      if (r.status !== 201) throw new Error(`create ${r.status} ${r.text.slice(0, 120)}`);
      lobbyIds.push(r.body.lobby.id);
      await c.join(r.body.lobby.id, 'storyteller'); // keeps the lobby alive (empty lobbies dispose after 2 min)
    }
    log('lobbies', lobbyIds.length);
    const readerAccounts = await makeBots(Math.ceil(S / 3), `dr${Math.random().toString(36).slice(2, 5)}-`, server.url, server.wsUrl, { record: false });
    const readers: Reader[] = [];
    for (let k = 0; k < S; k++) readers.push(await openStream(server.url, readerAccounts[Math.floor(k / 3)]!.api.cookieHeader()));
    await sleep(1500);
    // Idle cost of M lobbies (each GameRoom ticks at 24 Hz with one connected Storyteller) + S open streams.
    const ci0 = ticks(server.pid);
    const ti0 = performance.now();
    await sleep(8000);
    const idleCpu = r1(((ticks(server.pid) - ci0) / CLK / ((performance.now() - ti0) / 1000)) * 100);
    log('idle cpu %', idleCpu);
    const churners = await makeBots(J, `dj${Math.random().toString(36).slice(2, 5)}-`, server.url, server.wsUrl, { record: false, snap2: true });
    const b0 = readers.map((r) => r.bytes);
    const e0 = readers.map((r) => ({ ...r.events }));
    const load0 = os.loadavg();
    const c0 = ticks(server.pid);
    const t0 = performance.now();
    let joins = 0;
    let stop = false;
    const loops = churners.map(async (b: Bot) => {
      while (!stop) {
        try {
          await b.join(lobbyIds[rand(lobbyIds.length)]!);
          joins++;
          await sleep(1000 + rand(2000));
          await b.leave();
        } catch (e) {
          log('churn:', (e as Error).message.slice(0, 100));
          await sleep(500);
        }
      }
    });
    await sleep(SECS * 1000);
    stop = true;
    const secs = (performance.now() - t0) / 1000;
    const cpu = ((ticks(server.pid) - c0) / CLK / secs) * 100;
    const load1 = os.loadavg();
    await Promise.race([Promise.all(loops), sleep(8000)]);
    const bytes = readers.map((r, i) => r.bytes - b0[i]!);
    const upserts = readers.map((r, i) => (r.events.upsert ?? 0) - (e0[i]!.upsert ?? 0));
    const listGet = await readerAccounts[0]!.api.req('GET', '/api/lobbies');
    const res = {
      lobbies: M,
      streams: S,
      churnBots: J,
      secs: r1(secs),
      joinsPerSec: r1(joins / secs),
      loadAvg1: { before: r1(load0[0]!), after: r1(load1[0]!) },
      serverCpuPct: r1(cpu),
      serverCpuIdlePct: idleCpu,
      perStream: { bytesPerSec: Math.round(bytes.reduce((a, b) => a + b, 0) / bytes.length / secs), upsertsPerSec: r1(upserts.reduce((a, b) => a + b, 0) / upserts.length / secs), snapshotB: readers[0]!.snapshotB },
      allStreamsBytesPerSec: Math.round(bytes.reduce((a, b) => a + b, 0) / secs),
      resyncGetBodyB: listGet.text.length,
      resyncAllStreamsBytesPerSec: Math.round((listGet.text.length * S) / 30),
    };
    log('partB', JSON.stringify(res));
    for (const r of readers) r.close();
    await Promise.all([...creators, ...churners].map((b) => b.leave().catch(() => undefined)));
    return res;
  } finally {
    await server.stop();
  }
}

async function main() {
  const out: Record<string, unknown> = { host: { cpus: os.cpus().length } };
  if (BENCH) out.partA = await partA();
  if (E2E) out.partB = await partB();
  writeFileSync(path.join(OUT, 'net-directory.json'), JSON.stringify(out, null, 1));
  log('wrote', path.join(OUT, 'net-directory.json'));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
