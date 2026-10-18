// (v3 perf recon, front "server") Deterministic in-process micro-bench of the server's per-lobby hot paths on the v2
// layout vs the v3 Hollowmere layout, with the REAL world module (apps/server/src/world) behind a fake RoomHost and a
// fake clock. No sockets, no other processes: numbers isolate what the bigger v3 map (collision, interiors bands,
// rotated houses, A* routes, seat stones) costs per operation. The end-to-end view is tests/perf/v3-server-load.ts.
//
//   CT_AGENT=v3-perf-server scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock \
//     pnpm exec tsx tests/perf/v3-server-bench.ts [--worlds v2,v3] [--secs 20] [--out /tmp/ct-v3bench.json]'
//
// Measures (per world): 16 entities (1 ST + 15 seats) walking valid paths at 10 Hz for --secs simulated seconds:
//   move    : world.handleMove (speed budget + swept collision + location), µs per move
//   snap    : snapshotFor x 16 viewers + SnapshotEncoder.encode + msgpack pack, µs per 12 Hz fan-out (and B/frame)
//   tick    : world.tick at 24 Hz with seats set (stageView JSON key compare every tick), µs per tick
//   escort  : walkTo(all 15, home) planning (findPath: A* + string pulling, doors, interiors), ms per batch, cold + warm
//   seat    : walkTo(all, seat) planning with the circle gathered (circleSpots + findPath), ms per batch
//   grid    : pathGrid() build (first findPath on a layout; once per process per layout), ms
//   zones   : @ct/voice computeZones over the 16 members (voice recompute runs at 5 Hz), µs per call
//   misc    : isBlockedPx / locationAt / segment sweep ns per call (inner loops of the above)
import { writeFileSync } from 'node:fs';
import { pack } from '@colyseus/msgpackr';
import {
  circleSpots,
  isBlockedPx,
  locationAt,
  PLAYER_SPEED,
  SnapshotEncoder,
  tileCenterPx,
  type Facing,
  type TownLayout,
} from '../../packages/protocol/src/index.js';
import { townLayout } from '../../packages/assets/src/index.js';
import { townLayoutV3 } from '../../packages/assets/src/hollowmere/layoutV3.js';
import { computeZones } from '../../packages/voice/src/zones.js';
import { createWorldModule } from '../../apps/server/src/world/index.js';
import { findPath, pathGrid } from '../../apps/server/src/world/path.js';
import type { RoomEvent, RoomHost, RoomMember } from '../../apps/server/src/rooms/modules.js';
import { Grid } from './v3-grid.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
};
const WORLDS = arg('worlds', 'v2,v3').split(',') as ('v2' | 'v3')[];
const SECS = Number(arg('secs', '20'));
const OUT = arg('out', '');
const LAYOUTS = { v2: townLayout, v3: townLayoutV3 } as const;
const r2 = (v: number) => Math.round(v * 100) / 100;

// Deterministic PRNG so v2 and v3 runs see the same decisions sequence.
let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function makeHost(L: TownLayout, clock: { now: number }) {
  const members: RoomMember[] = [];
  const sent = { n: 0, teleports: 0, corrections: 0 };
  const queue: RoomEvent[] = [];
  const host = {
    lobbyId: 'bench',
    env: 'test',
    log: { debug() {}, info() {}, warn() {}, error() {} },
    layout: () => L,
    now: () => clock.now,
    members: () => members,
    member: (pid: string) => members.find((m) => m.pid === pid),
    storytellerPid: () => members.find((m) => m.role === 'storyteller')?.pid ?? null,
    send(_pid: string, type: string, payload: { reason?: string }) {
      sent.n++;
      if (type === 'world:teleport') {
        sent.teleports++;
        if (payload?.reason === 'correction') sent.corrections++;
      }
    },
    emit(e: RoomEvent) {
      queue.push(e);
    },
    markGameDirty() {},
    markLobbyDirty() {},
    game: { seatOf: (pid: string) => members.find((m) => m.pid === pid)?.seat ?? null } as unknown as RoomHost['game'],
    world: null as unknown as RoomHost['world'],
    voice: null as unknown as RoomHost['voice'],
  };
  return { host: host as unknown as RoomHost & { world: RoomHost['world'] }, members, sent, queue };
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return { n: s.length, mean: r2(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)), p50: r2(q(0.5)), p95: r2(q(0.95)), p99: r2(q(0.99)), max: r2(s.at(-1) ?? 0) };
}
const nowUs = () => Number(process.hrtime.bigint()) / 1000;

function benchWorld(world: 'v2' | 'v3') {
  seed = 1;
  const L = LAYOUTS[world];
  const clock = { now: 1_000_000 };
  const { host, members, sent, queue } = makeHost(L, clock);
  const w = createWorldModule(host, { layout: L });
  (host as { world: unknown }).world = w;
  const drain = () => {
    while (queue.length) w.onEvent(queue.shift()!);
  };
  const N = 15;
  const st: RoomMember = { pid: 'st', accountId: 'a-st', displayName: 'ST', role: 'storyteller', seat: null, connected: true, cosmetics: {} as RoomMember['cosmetics'], isHost: true };
  members.push(st);
  w.onEvent({ type: 'member_joined', pid: 'st' });
  for (let i = 0; i < N; i++) {
    members.push({ pid: `p${i}`, accountId: `a${i}`, displayName: `P${i}`, role: 'player', seat: i, connected: true, cosmetics: {} as RoomMember['cosmetics'], isHost: false });
    w.onEvent({ type: 'member_joined', pid: `p${i}` });
  }
  w.onEvent({ type: 'game_started', seats: members.filter((m) => m.seat !== null).map((m) => ({ pid: m.pid, seat: m.seat! })), storytellerPid: 'st' });
  w.onEvent({ type: 'phase_changed', phase: 'day', prev: 'first_night', phaseEndsAt: null });
  drain();

  // pathGrid build (first use on this layout in this process).
  let t = nowUs();
  pathGrid(L);
  const gridMs = r2((nowUs() - t) / 1000);

  // Put everyone on a random free outdoor tile (teleport through the stage API, as the ST could).
  const grid = new Grid(L);
  const tb = L.townBounds;
  const freeOutdoor = () => {
    for (;;) {
      const tx = tb.x + Math.floor(rand() * tb.w);
      const ty = tb.y + Math.floor(rand() * tb.h);
      if (grid.walkable(tx, ty) && locationAt(L, tx * L.tileSize + 8, ty * L.tileSize + 14) === 'outdoors') return tileCenterPx(L, { x: tx, y: ty });
    }
  };
  for (const m of members) {
    const p = freeOutdoor();
    if (m.role === 'storyteller') w.teleportSelf(m.pid, { kind: 'point', x: p.x, y: p.y });
    else w.teleportTo(m.pid, { kind: 'point', x: p.x, y: p.y });
  }
  drain();

  // ---- walk: handleMove at 10 Hz, snapshots at 12 Hz, ticks at 24 Hz (simulated clock, 1 ms resolution) ----
  type B = { pid: string; pos: { x: number; y: number }; path: { x: number; y: number }[]; seq: number; facing: Facing };
  const bots: B[] = members.map((m) => ({ pid: m.pid, pos: w.positionOf(m.pid)!, path: [], seq: 1, facing: 'down' }));
  const encoders = new Map(members.map((m) => [m.pid, new SnapshotEncoder()]));
  const moveUs: number[] = [];
  const snapUs: number[] = [];
  const tickUs: number[] = [];
  let snapBytes = 0;
  let snapFrames = 0;
  const pathsPlanned = { n: 0, us: 0 };
  const T = SECS * 1000;
  const start = clock.now;
  let nextMove = start;
  let nextSnap = start;
  let nextTick = start;
  sent.corrections = 0;
  while (clock.now - start < T) {
    clock.now = Math.min(nextMove, nextSnap, nextTick);
    if (clock.now === nextMove) {
      nextMove += 100;
      for (const b of bots) {
        if (!b.path.length) {
          const p0 = nowUs();
          for (let i = 0; i < 10 && !b.path.length; i++) {
            const g = grid.nearby(b.pos);
            if (g) b.path = grid.plan(b.pos, g) ?? [];
          }
          pathsPlanned.n++;
          pathsPlanned.us += nowUs() - p0;
        }
        const wp = b.path[0];
        if (wp) {
          const dx = wp.x - b.pos.x;
          const dy = wp.y - b.pos.y;
          const d = Math.hypot(dx, dy);
          const step = PLAYER_SPEED * 0.9 * 0.1;
          const nx = d <= step ? wp.x : b.pos.x + (dx / d) * step;
          const ny = d <= step ? wp.y : b.pos.y + (dy / d) * step;
          if (d <= step) b.path.shift();
          if (isBlockedPx(L, nx, ny)) b.path = [];
          else {
            if (d > 0.01) b.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
            b.pos = { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 };
          }
        }
        const t0 = nowUs();
        w.handleMove(b.pid, { seq: b.seq++, x: b.pos.x, y: b.pos.y, facing: b.facing, moving: !!wp });
        moveUs.push(nowUs() - t0);
        const sp = w.positionOf(b.pid)!;
        if (sp.x !== b.pos.x || sp.y !== b.pos.y) {
          b.pos = { ...sp };
          b.path = [];
        }
      }
      drain();
    }
    if (clock.now === nextTick) {
      nextTick += 1000 / 24;
      const t0 = nowUs();
      w.tick(1000 / 24);
      tickUs.push(nowUs() - t0);
      drain();
    }
    if (clock.now === nextSnap) {
      nextSnap += 1000 / 12;
      const t0 = nowUs();
      // (v3-perf-server) as GameRoom.sendSnapshots: one shared fan-out when the world module has it
      const snapFor = (w as { snapshotFanout?: () => (pid: string) => ReturnType<typeof w.snapshotFor> }).snapshotFanout?.() ?? ((pid: string) => w.snapshotFor(pid));
      for (const m of members) {
        const frame = encoders.get(m.pid)!.encode(snapFor(m.pid));
        if (frame) {
          snapBytes += pack(frame).length;
          snapFrames++;
        }
      }
      snapUs.push(nowUs() - t0);
    }
  }
  const walkCorrections = sent.corrections;

  // ---- escort / stage planning (findPath) ----
  const batch = (to: Parameters<typeof w.walkTo>[1], label: string) => {
    const t0 = nowUs();
    for (const m of members) if (m.role === 'player') w.walkTo(m.pid, to);
    const ms = (nowUs() - t0) / 1000;
    for (const m of members) if (m.role === 'player') w.walkTo(m.pid, null);
    drain();
    return { label, ms: r2(ms) };
  };
  const escortCold = batch({ kind: 'home' }, 'home cold');
  const escortWarm: number[] = [];
  for (let k = 0; k < 10; k++) {
    for (const m of members) {
      const p = freeOutdoor();
      if (m.role !== 'storyteller') w.teleportTo(m.pid, { kind: 'point', x: p.x, y: p.y });
    }
    drain();
    escortWarm.push(batch({ kind: 'home' }, 'home').ms);
  }
  w.setCircle(members.filter((m) => m.seat !== null).map((m) => m.seat!));
  const seatBatches: number[] = [];
  for (let k = 0; k < 10; k++) {
    for (const m of members) {
      const p = freeOutdoor();
      if (m.role !== 'storyteller') w.teleportTo(m.pid, { kind: 'point', x: p.x, y: p.y });
    }
    drain();
    seatBatches.push(batch({ kind: 'seat' }, 'seat').ms);
  }
  // Server-driven walking cost: everyone walks home (ticks only, no moves), 24 Hz until all arrive or 60 s.
  for (const m of members) {
    const p = freeOutdoor();
    if (m.role !== 'storyteller') w.teleportTo(m.pid, { kind: 'point', x: p.x, y: p.y });
  }
  drain();
  for (const m of members) if (m.role === 'player') w.walkTo(m.pid, { kind: 'home' });
  const walkTickUs: number[] = [];
  let walkTicks = 0;
  while (walkTicks < 24 * 60 && members.some((m) => m.role === 'player' && !w.isHome(m.pid))) {
    clock.now += 1000 / 24;
    const t0 = nowUs();
    w.tick(1000 / 24);
    walkTickUs.push(nowUs() - t0);
    drain();
    walkTicks++;
  }
  const homeCount = members.filter((m) => m.role === 'player' && w.isHome(m.pid)).length;

  // circleSpots (uncached cost) and voice zones.
  const seats = members.filter((m) => m.seat !== null).map((m) => m.seat!);
  t = nowUs();
  for (let k = 0; k < 50; k++) circleSpots(L, seats);
  const circleUs = r2((nowUs() - t) / 50);
  const zoneIn = () => ({
    phase: 'day' as const,
    layout: L,
    members: members.map((m) => ({ pid: m.pid, role: m.role, seat: m.seat, location: w.locationOf(m.pid), x: w.positionOf(m.pid)?.x ?? null, y: w.positionOf(m.pid)?.y ?? null })),
  });
  for (let k = 0; k < 2000; k++) computeZones(zoneIn());
  t = nowUs();
  for (let k = 0; k < 20000; k++) computeZones(zoneIn());
  const zonesUs = r2((nowUs() - t) / 20000);

  // Inner-loop primitives.
  const prim = (fn: (i: number) => unknown, n = 2_000_000) => {
    for (let i = 0; i < 200_000; i++) fn(i);
    const t0 = nowUs();
    let sink = 0;
    for (let i = 0; i < n; i++) if (fn(i)) sink++;
    return { nsPerCall: r2(((nowUs() - t0) * 1000) / n), sink };
  };
  const W = L.widthTiles * L.tileSize;
  const H = L.heightTiles * L.tileSize;
  const isBlocked = prim((i) => isBlockedPx(L, (i * 7.3) % W, (i * 3.1) % H));
  const locAt = prim((i) => locationAt(L, (i * 7.3) % W, (i * 3.1) % H) === 'outdoors');
  const longPath = (() => {
    const a = tileCenterPx(L, L.playerSpawn);
    const far = [...L.buildings].sort((x, y) => Math.hypot(y.door.x - L.playerSpawn.x, y.door.y - L.playerSpawn.y) - Math.hypot(x.door.x - L.playerSpawn.x, x.door.y - L.playerSpawn.y))[0]!;
    const b = tileCenterPx(L, far.door);
    for (let k = 0; k < 20; k++) findPath(L, a, b, 'outdoors');
    const t0 = nowUs();
    let pts = 0;
    for (let k = 0; k < 200; k++) pts = findPath(L, a, b, 'outdoors')?.length ?? -1;
    return { to: far.id, usPerCall: r2((nowUs() - t0) / 200), waypoints: pts };
  })();

  const mem = process.memoryUsage();
  return {
    world,
    map: { widthTiles: L.widthTiles, heightTiles: L.heightTiles, tiles: L.widthTiles * L.heightTiles, blockedPct: r2((L.collision.filter((c) => c === 1).length / L.collision.length) * 100), buildings: L.buildings.length },
    simulatedSecs: SECS,
    moveUs: stats(moveUs),
    snapFanoutUs: stats(snapUs),
    snapBytesPerFrame: r2(snapBytes / Math.max(1, snapFrames)),
    tickUs: stats(tickUs),
    walkCorrections,
    botPlanUsPerPlan: r2(pathsPlanned.us / Math.max(1, pathsPlanned.n)),
    gridBuildMs: gridMs,
    escortHomeMs: { cold: escortCold.ms, warm: stats(escortWarm) },
    walkToSeatMs: stats(seatBatches),
    serverWalkTickUs: { ...stats(walkTickUs), ticks: walkTicks, home: homeCount },
    circleSpotsUs: circleUs,
    voiceZonesUs: zonesUs,
    longestDoorPathUs: longPath,
    isBlockedPxNs: isBlocked.nsPerCall,
    locationAtNs: locAt.nsPerCall,
    heapUsedMb: r2(mem.heapUsed / 1048576),
  };
}

const results = WORLDS.map((w) => {
  const r = benchWorld(w);
  console.log(JSON.stringify(r, null, 1));
  return r;
});
const derived = (r: ReturnType<typeof benchWorld>) => ({
  world: r.world,
  /** World-module CPU of one 16-client walking lobby per second: 160 moves + 12 fan-outs + 24 ticks (µs/s = 1e-4 % core). */
  worldUsPerSec: r2(r.moveUs.mean * 160 + r.snapFanoutUs.mean * 12 + r.tickUs.mean * 24),
  worldPctCore: r2((r.moveUs.mean * 160 + r.snapFanoutUs.mean * 12 + r.tickUs.mean * 24) / 1e4),
});
console.log('derived', JSON.stringify(results.map(derived)));
if (OUT) writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), secs: SECS, results, derived: results.map(derived) }, null, 1));
