// (v2.4 P3, perf server) Micro-benchmark of per-message server hot paths that v2.3 added, to put a number
// on them next to the end-to-end server-profile.ts (where they are far below the run-to-run noise).
//   CT_AGENT=<you> scripts/remote.sh pnpm exec tsx tests/perf/server-hotpath-bench.ts [--n 2000000]
// Prints ns/op for: the per-frame socket budget (pre-v2.4 per-frame spec object vs the cached live spec),
// the violation score (only ever runs on a violation), and a 'move' Zod parse for scale.
import { C2S } from '../../packages/protocol/src/index.js';
import { FrameMeter, liveSocketBudget, type SocketBudgetSpec } from '../../apps/server/src/guard/socketBudget.js';
import { getHostLimits } from '../../apps/server/src/guard/hostLimits.js';
import { createViolationTracker } from '../../apps/server/src/guard/violations.js';

const argv = process.argv.slice(2);
const N = Number(argv[argv.indexOf('--n') + 1]) || 2_000_000;
/** --only old|new: one socket-budget variant per process (call sites stay monomorphic, as in the server). */
const ONLY = argv.indexOf('--only') >= 0 ? argv[argv.indexOf('--only') + 1] : '';

/** The v2.3 getter: a fresh spec object for every frame. */
function v23LiveSocketBudget(): SocketBudgetSpec {
  const l = getHostLimits();
  return { frameBurst: l.socketFrameBurst, framesPerSec: l.socketFramesPerSec, byteBurst: l.socketByteBurst, bytesPerSec: l.socketBytesPerSec };
}

function bench(name: string, fn: (i: number) => unknown, n = N) {
  for (let i = 0; i < Math.min(n, 200_000); i++) fn(i); // warm-up / JIT
  const runs: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fn(i);
    runs.push(Number(process.hrtime.bigint() - t0) / n);
  }
  runs.sort((a, b) => a - b);
  console.log(`${name.padEnd(48)} ${runs[2]!.toFixed(1).padStart(8)} ns/op (median of 5 x ${n})`);
  return runs[2]!;
}

// One meter per run, timestamps 1 ms apart (the bucket never empties: the pass path, as for honest clients).
let t = 0;
if (ONLY !== 'new') {
  const old = new FrameMeter(v23LiveSocketBudget, 0);
  bench('socket budget take(), v2.3 spec per frame', () => old.take(40, (t += 1)));
}
t = 0;
if (ONLY !== 'old') {
  const cur = new FrameMeter(liveSocketBudget, 0);
  bench('socket budget take(), v2.4 cached live spec', () => cur.take(40, (t += 1)));
}
const tracker = createViolationTracker();
const conns = Array.from({ length: 16 }, () => ({}));
bench('violation score record() (violations only)', (i) => tracker.record(conns[i & 15]!, 'lobby:ready', 'invalid_payload'), 200_000);
const move = { x: 412.5, y: 233.25, facing: 'left', moving: true, seq: 1 };
bench("C2S['move'].safeParse (every move, for scale)", () => (C2S as Record<string, { safeParse(v: unknown): unknown }>)['move']!.safeParse(move), 500_000);
