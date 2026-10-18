// (v3 perf recon, front "net", CT_AGENT=v3-perf-net) Server-side voice cost, in process (no LiveKit, no network):
//
//   1. token mint: mintVoiceToken (livekit-server-sdk AccessToken + HS256) µs per token, token / voice:grant size;
//   2. one lobby's VoiceCoordinator over a simulated game (fake host / world / game as apps/server/test/voice.test.ts,
//      real tokens, room epochs ON as in production, every member wants voice): 1 ST + N players, day with house
//      visits, then bedtime → night → dawn → day twice. Counts grants (mints), revokes, voice:grant bytes, and the
//      LiveKit RoomService calls the coordinator makes (listParticipants = revocation audits, removeParticipant),
//      per simulated minute; wall time of voice.tick() (24 Hz, recompute every 200 ms). Run for the v2 and the v3
//      layout (zones are layout-driven: square / bld:<id>).
//   3. the process-wide reconciler (voice/reconciler.ts): one runOnce() over R live rooms with P participants each,
//      with a simulated LiveKit API round trip (--rtt ms): calls per run and wall time (sequential listParticipants).
//
//   CT_AGENT=v3-perf-net scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock \
//     pnpm exec tsx tests/perf/net-voice-bench.ts --players 15 --minutes 20 --rtt 40 --out /tmp/ct-v3net/voice'
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pack } from '@colyseus/msgpackr';
import type { GamePhase, LocationId, TownLayout, VoiceGrant } from '../../packages/protocol/src/index.js';
import { townLayout } from '../../packages/assets/src/index.js';
import { townLayoutV3 } from '../../packages/assets/src/hollowmere/layoutV3.js';
import { MemoryVoiceUsageStore, mintVoiceToken, roomNameFor } from '../../packages/voice/src/index.js';
import type { GameModule, WorldModule } from '../../apps/server/src/rooms/modules.js';
import { createVoiceModule } from '../../apps/server/src/voice/index.js';
import { createVoiceReconciler } from '../../apps/server/src/voice/reconciler.js';
import { createFakeHost } from '../../apps/server/test/helpers/fakeHost.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
};
const PLAYERS = Number(arg('players', '15'));
const MINUTES = Number(arg('minutes', '20'));
const RTT = Number(arg('rtt', '40'));
const LIST_ROOMS = arg('listrooms', 'yes') !== 'no';
const OUT = path.resolve(arg('out', '/tmp/ct-netvoice'));
mkdirSync(OUT, { recursive: true });
const log = (...a: unknown[]) => console.log(`[voice ${new Date().toISOString().slice(11, 19)}]`, ...a);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const KEY = 'APIperfBenchKey';
const SECRET = 'perf-bench-secret-perf-bench-secret-0123456789';
const URL = 'wss://example-perf.livekit.cloud';

async function mintBench() {
  const o = { apiKey: KEY, apiSecret: SECRET, identity: 'p_abcdef123456', name: 'Somebody Long', room: roomNameFor('prod', 'amber-fox-lantern', 'bld:house-7', 'e1x2y3z4'), canPublish: true };
  for (let i = 0; i < 300; i++) await mintVoiceToken(o);
  const n = 3000;
  const t0 = process.hrtime.bigint();
  let token = '';
  for (let i = 0; i < n; i++) token = await mintVoiceToken(o);
  const us = Number(process.hrtime.bigint() - t0) / n / 1000;
  const grant: VoiceGrant = { provider: 'livekit', url: URL, token, room: o.room, zone: 'bld:house-7', mode: 'private', purpose: 'zone', canPublish: true, expiresAt: Date.now() + 600_000 };
  const res = { usPerMint: r1(us), tokenB: token.length, voiceGrantMsgpackB: pack(grant).length + 'voice:grant'.length + 2 };
  log('mint', JSON.stringify(res));
  return res;
}

type P = { x: number; y: number; location: LocationId };

async function lobbySim(L: TownLayout, label: string) {
  const host = createFakeHost(`perf-${label}`);
  const pos = new Map<string, P>();
  const world = {
    onEvent() {},
    locationOf: (p: string) => pos.get(p)?.location ?? null,
    positionOf: (p: string) => {
      const q = pos.get(p);
      return q ? { x: q.x, y: q.y } : null;
    },
  } as unknown as WorldModule;
  const gs = { phase: null as GamePhase | null };
  const seats = new Map<string, number>();
  const game = { onEvent() {}, phase: () => gs.phase, seatOf: (p: string) => seats.get(p) ?? null, isAlive: () => true, directoryPhase: () => 'day' } as unknown as GameModule;
  // (net front, after the audit change) LiveKit as an honest game sees it: every grant holder is connected to
  // exactly its room (synced once per simulated second), rooms persist after they empty; --listrooms no = a
  // RoomService without listRooms (the coordinator's fallback path).
  const calls = { listRooms: 0, listParticipants: 0, removeParticipant: 0 };
  const lkRooms = new Map<string, Set<string>>();
  const rs = {
    async removeParticipant(room: string, identity: string) {
      calls.removeParticipant++;
      lkRooms.get(room)?.delete(identity);
    },
    async listParticipants(room: string) {
      calls.listParticipants++;
      return [...(lkRooms.get(room) ?? [])].map((identity) => ({ identity }));
    },
    ...(LIST_ROOMS
      ? {
          async listRooms() {
            calls.listRooms++;
            return [...lkRooms].map(([name, ids]) => ({ name, numParticipants: ids.size }));
          },
        }
      : {}),
  };
  const syncLivekit = () => {
    for (const ids of lkRooms.values()) ids.clear();
    for (const pid of pids) {
      const r = voice.heldRooms(pid).zone;
      if (!r) continue;
      if (!lkRooms.has(r)) lkRooms.set(r, new Set());
      lkRooms.get(r)!.add(pid);
    }
  };
  const voice = createVoiceModule(host, {
    livekit: { url: URL, apiKey: KEY, apiSecret: SECRET, roomPrefix: 'perf', configured: true },
    monthlyMinutes: 1_000_000,
    usage: new MemoryVoiceUsageStore(),
    roomService: rs,
    layout: L,
    limits: { autoOptIn: true, maxPerLobby: 0, maxConcurrent: 0, maxPerIp: 0, idleMs: 0, waitingMaxMs: 0 },
    isDisabled: () => false,
  });
  host.setModules({ world, game, voice });
  const TS = L.tileSize;
  const tb = L.townBounds;
  const houses = L.buildings.filter((b) => b.kind === 'house');
  const outdoor = (): P => ({ x: (tb.x + 2 + Math.random() * (tb.w - 4)) * TS, y: (tb.y + 2 + Math.random() * (tb.h - 4)) * TS, location: 'outdoors' });
  const insideOf = (id: string): P => {
    const b = L.buildings.find((x) => x.id === id)!;
    return { x: (b.interior.x + 2) * TS + 8, y: (b.interior.y + 2) * TS + 14, location: `bld:${id}` };
  };
  const place = (pid: string, p: P) => {
    const prev = pos.get(pid)?.location ?? null;
    pos.set(pid, p);
    if (prev !== p.location) host.emit({ type: 'location_changed', pid, location: p.location, prev });
  };
  const setPhase = (phase: GamePhase) => {
    const prev = gs.phase;
    gs.phase = phase;
    host.emit({ type: 'phase_changed', phase, prev, phaseEndsAt: null });
  };
  const pids = ['st', ...Array.from({ length: PLAYERS }, (_, i) => `p${i}`)];
  pids.forEach((pid, i) => {
    host.addMember({ pid, role: i === 0 ? 'storyteller' : 'player', seat: i === 0 ? null : i - 1 });
    if (i) seats.set(pid, i - 1);
    pos.set(pid, outdoor());
    host.emit({ type: 'member_joined', pid });
  });
  setPhase('day');
  await voice.whenIdle();
  const tickMs = 1000 / 24;
  const tickCost: number[] = [];
  const visitUntil = new Map<string, number>();
  const nextVisit = new Map<string, number>(pids.map((p) => [p, host.clock.now + Math.random() * 60_000]));
  const start = host.clock.now;
  const end = start + MINUTES * 60_000;
  // Phase script: per 10 simulated minutes: 6 min day, 1 bedtime, 2 night, 1 dawn (≈ a real game's rhythm).
  const phaseAt = (t: number): GamePhase => {
    const m = ((t - start) / 60_000) % 10;
    return m < 6 ? 'day' : m < 7 ? 'bedtime' : m < 9 ? 'night' : 'dawn';
  };
  let ticks = 0;
  while (host.clock.now < end) {
    host.clock.now += tickMs;
    const now = host.clock.now;
    const ph = phaseAt(now);
    if (ph !== gs.phase) {
      setPhase(ph);
      if (ph === 'night') pids.slice(1).forEach((pid, i) => place(pid, insideOf(houses[i % houses.length]!.id)));
      if (ph === 'day') pids.forEach((pid) => place(pid, outdoor()));
    }
    if (ph === 'day') {
      for (const pid of pids) {
        const until = visitUntil.get(pid);
        if (until !== undefined && now >= until) {
          visitUntil.delete(pid);
          place(pid, outdoor());
        } else if (until === undefined && now >= nextVisit.get(pid)!) {
          place(pid, insideOf(houses[Math.floor(Math.random() * houses.length)]!.id));
          visitUntil.set(pid, now + 15_000 + Math.random() * 15_000);
          nextVisit.set(pid, now + 45_000 + Math.random() * 60_000);
        } else if (until === undefined) {
          const p = pos.get(pid)!;
          pos.set(pid, { ...p, x: Math.min((tb.x + tb.w - 2) * TS, Math.max((tb.x + 2) * TS, p.x + (Math.random() - 0.5) * 10)), y: Math.min((tb.y + tb.h - 2) * TS, Math.max((tb.y + 2) * TS, p.y + (Math.random() - 0.5) * 10)) });
        }
      }
    }
    const t0 = process.hrtime.bigint();
    voice.tick(now);
    tickCost.push(Number(process.hrtime.bigint() - t0) / 1000);
    if (++ticks % 24 === 0) {
      await voice.whenIdle();
      syncLivekit();
    }
  }
  await voice.whenIdle();
  let grants = 0;
  let grantB = 0;
  let revokes = 0;
  for (const list of host.sent.values())
    for (const m of list) {
      if (m.type === 'voice:grant') {
        grants++;
        grantB += pack(m.payload).length + m.type.length + 2;
      } else if (m.type === 'voice:revoke') revokes++;
    }
  tickCost.sort((a, b) => a - b);
  const mins = MINUTES;
  const res = {
    layout: label,
    members: pids.length,
    simulatedMinutes: mins,
    grantsPerMin: r1(grants / mins),
    revokesPerMin: r1(revokes / mins),
    grantBytesPerMinLobby: Math.round(grantB / mins),
    livekitListRoomsPerMin: r1(calls.listRooms / mins),
    livekitListParticipantsPerMin: r1(calls.listParticipants / mins),
    livekitCallsPerMin: r1((calls.listRooms + calls.listParticipants + calls.removeParticipant) / mins),
    livekitRemoveParticipantPerMin: r1(calls.removeParticipant / mins),
    tickUs: { p50: r2(tickCost[Math.floor(tickCost.length * 0.5)]!), p99: r2(tickCost[Math.floor(tickCost.length * 0.99)]!), max: r2(tickCost.at(-1)!), avg: r2(tickCost.reduce((a, b) => a + b, 0) / tickCost.length) },
    tickCpuPctOfCore: r2((tickCost.reduce((a, b) => a + b, 0) / 1e6 / (mins * 60)) * 100),
  };
  log('lobby', JSON.stringify(res));
  await voice.dispose();
  return res;
}

async function reconcilerBench(rooms: number, perRoom: number) {
  const calls = { listRooms: 0, listParticipants: 0 };
  const names = Array.from({ length: rooms }, (_, i) => roomNameFor('perf', `lobby-${i % 8}`, i % 3 ? `bld:house-${i % 15}` : 'square', `ep${String(i).padStart(4, '0')}`));
  const delay = () => new Promise<void>((r) => setTimeout(r, RTT));
  const rs = {
    async listRooms() {
      calls.listRooms++;
      await delay();
      return names.map((name) => ({ name, numParticipants: perRoom }));
    },
    async listParticipants() {
      calls.listParticipants++;
      await delay();
      return Array.from({ length: perRoom }, (_, k) => ({ identity: `p${k}` }));
    },
    async removeParticipant() {},
  };
  const rec = createVoiceReconciler({
    prefix: 'perf',
    env: 'test',
    roomService: rs,
    usage: new MemoryVoiceUsageStore(),
    authorize: () => 'ok',
    now: () => Date.now(),
    log: { debug() {}, info() {}, warn() {}, error() {} },
    intervalMs: 60_000,
  });
  const t0 = performance.now();
  const r = await rec.runOnce();
  const ms = performance.now() - t0;
  const res = { rooms, perRoom, rttMs: RTT, apiCallsPerRun: calls.listRooms + calls.listParticipants, wallMsPerRun: Math.round(ms), participants: r.participants };
  log('reconciler', JSON.stringify(res));
  return res;
}

async function main() {
  const out: Record<string, unknown> = { host: { cpus: os.cpus().length, loadAvg1Before: r1(os.loadavg()[0]!) } };
  out.mint = await mintBench();
  out.lobbyV2 = await lobbySim(townLayout, 'v2');
  out.lobbyV3 = await lobbySim(townLayoutV3, 'v3');
  out.reconciler = [await reconcilerBench(8, 4), await reconcilerBench(40, 4), await reconcilerBench(120, 3)];
  (out.host as Record<string, unknown>).loadAvg1After = r1(os.loadavg()[0]!);
  writeFileSync(path.join(OUT, 'net-voice-bench.json'), JSON.stringify(out, null, 1));
  log('wrote', path.join(OUT, 'net-voice-bench.json'));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
