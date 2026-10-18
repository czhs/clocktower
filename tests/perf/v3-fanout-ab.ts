// (v3-perf-server) Interleaved in-process A/B of one 12 Hz snapshot fan-out on the v3 layout: A = 16 x
// world.snapshotFor(pid) (the old GameRoom loop), B = world.snapshotFanout() shared by the 16 viewers; both followed by
// a per-viewer SnapshotEncoder.encode (each side has its own encoders). A and B alternate every round on the same
// world state, so host-load drift hits both equally (the shared build host is rarely idle).
//
//   CT_AGENT=v3-perf-server scripts/remote.sh sh -c 'flock ~/clocktower/v3-heavy.lock \
//     pnpm exec tsx tests/perf/v3-fanout-ab.ts --rounds 20000'
import { SnapshotEncoder } from '../../packages/protocol/src/index.js';
import { townLayoutV3 as L } from '../../packages/assets/src/hollowmere/layoutV3.js';
import { createWorldModule } from '../../apps/server/src/world/index.js';
import { createFakeHost } from '../../apps/server/test/helpers/fakeHost.js';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
};
const ROUNDS = Number(arg('rounds', '20000'));
const DOORTAGS = arg('doortags', 'yes') === 'yes';

const host = createFakeHost();
const world = createWorldModule(host, { layout: L });
host.setModules({ world });
const pids = Array.from({ length: 15 }, (_, i) => `p${i}`);
pids.forEach((pid, seat) => {
  host.addMember({ pid, seat });
  host.emit({ type: 'member_joined', pid });
});
host.addMember({ pid: 'st', role: 'storyteller' });
host.emit({ type: 'member_joined', pid: 'st' });
host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
host.emit({ type: 'phase_changed', phase: 'day', prev: 'first_night', phaseEndsAt: null });
if (!DOORTAGS) world.applySettings({ doorTags: false } as never);
// a typical day: most outdoors, a few inside (door tags), two door locks
const blds = L.buildings;
world.teleportToBuilding('p1', blds[0]!.id, 'door');
world.teleportToBuilding('p2', blds[0]!.id, 'door');
world.teleportToBuilding('p3', blds[3]!.id, 'door');
world.setDoorLock(blds[5]!.id, true);
world.setDoorLock(blds[6]!.id, false);
const viewers = [...pids, 'st'];
const encA = new Map(viewers.map((v) => [v, new SnapshotEncoder()]));
const encB = new Map(viewers.map((v) => [v, new SnapshotEncoder()]));
let seq = 0;
const nudge = () => {
  // move four walkers a little so the rounded states change between rounds
  for (const pid of ['p4', 'p5', 'p6', 'p7']) {
    const p = world.positionOf(pid)!;
    host.clock.now += 20;
    world.handleMove(pid, { seq: ++seq, x: p.x + (seq % 2 ? 0.7 : -0.7), y: p.y, facing: 'right', moving: true });
  }
};
const runA = () => {
  for (const v of viewers) encA.get(v)!.encode(world.snapshotFor(v));
};
const runB = () => {
  const f = world.snapshotFanout!();
  for (const v of viewers) encB.get(v)!.encode(f(v));
};
const a: number[] = [];
const b: number[] = [];
for (let r = 0; r < ROUNDS; r++) {
  nudge();
  host.clock.now += 83;
  const first = r % 2 ? runA : runB;
  const second = r % 2 ? runB : runA;
  const t0 = performance.now();
  first();
  const t1 = performance.now();
  second();
  const t2 = performance.now();
  if (r < 500) continue; // JIT warm-up
  (first === runA ? a : b).push((t1 - t0) * 1000);
  (second === runA ? a : b).push((t2 - t1) * 1000);
}
const stat = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y);
  const q = (f: number) => Math.round(s[Math.floor(s.length * f)]! * 100) / 100;
  return { n: s.length, mean: Math.round((s.reduce((x, y) => x + y, 0) / s.length) * 100) / 100, p50: q(0.5), p95: q(0.95), p99: q(0.99) };
};
const A = stat(a);
const B = stat(b);
console.log(JSON.stringify({ layout: 'v3', viewers: viewers.length, doorTags: DOORTAGS, snapshotForLoopUs: A, snapshotFanoutUs: B, p50SavedPct: Math.round((1 - B.p50 / A.p50) * 1000) / 10 }));
