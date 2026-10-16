// perf-audit: in-process cost of the game module on a 15-seat AUTOMATIC game (rules engine + auto
// Storyteller + recorder + real world module), simulated clock, seeded bots (apps/server/test/autoHarness).
// Times every call of: game.tick (20 Hz in prod), game.viewFor (per viewer on every dirty flush),
// recorder.observe (state diff after every commit), world.stageView JSON (dirty detection), and the
// per-viewer JSON.stringify the room does for de-duplication.
//   CT_AGENT=perf-audit scripts/remote.sh pnpm exec tsx tests/perf/game-module-bench.ts [--games 5] [--players 15]
import { performance } from 'node:perf_hooks';
import { autoRig, playOut } from '../../apps/server/test/autoHarness.js';
import { recorderOf } from '../../apps/server/src/records/index.js';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const GAMES = Number(arg('games', '5'));
const N = Number(arg('players', '15'));

type Acc = { n: number; ms: number; max: number; bytes: number };
const acc: Record<string, Acc> = {};
const add = (k: string, ms: number, bytes = 0) => {
  const a = (acc[k] ??= { n: 0, ms: 0, max: 0, bytes: 0 });
  a.n++;
  a.ms += ms;
  a.max = Math.max(a.max, ms);
  a.bytes += bytes;
};
function wrap<T extends object>(obj: T, name: keyof T & string, label: string, sizeOf?: (r: unknown) => number) {
  const orig = (obj[name] as unknown as (...a: unknown[]) => unknown).bind(obj);
  (obj as Record<string, unknown>)[name] = (...a: unknown[]) => {
    const t = performance.now();
    const r = orig(...a);
    add(label, performance.now() - t, sizeOf ? sizeOf(r) : 0);
    return r;
  };
}

let simMs = 0;
let ticks = 0;
let wall = 0;
for (let g = 0; g < GAMES; g++) {
  const rig = autoRig(N, { seed: 100 + g, fateSeed: 200 + g, botSeed: 300 + g, world: true });
  wrap(rig.game, 'tick', 'game.tick');
  wrap(rig.game, 'viewFor', 'game.viewFor (bots + room)');
  const rec = recorderOf(rig.game);
  if (rec) wrap(rec, 'observe', 'recorder.observe');
  // what GameRoom.flushViews does per viewer on every dirty flush: viewFor + JSON.stringify for de-dup
  let dirtyFlushes = 0;
  const origMark = rig.host.markGameDirty?.bind(rig.host);
  const t0 = performance.now();
  const r = playOut(rig, 4 * 3600_000, () => {
    // emulate one room flush per tick for all 15 viewers (upper bound: prod only flushes when dirty)
    if (ticks++ % 1 === 0) {
      const t = performance.now();
      let bytes = 0;
      for (let s = 0; s < N; s++) bytes += JSON.stringify(rig.game.viewFor(`p${s}`)).length;
      add('flush: viewFor+stringify x15 viewers', performance.now() - t, bytes);
      dirtyFlushes++;
    }
  });
  void origMark;
  wall += performance.now() - t0;
  simMs += r.simulatedMs;
  console.log(`game ${g}: finished=${r.finished} simulated ${(r.simulatedMs / 60000).toFixed(1)} min, ${r.ticks} ticks, timeline ${rec?.timeline.length ?? 0} lines, log ${rec?.state.log.length ?? 0}`);
}
console.log(`\n${GAMES} games x ${N} seats: wall ${wall.toFixed(0)} ms for ${(simMs / 60000).toFixed(1)} simulated min (${ticks} ticks)`);
console.log('call                                       calls    total ms   avg µs    max ms   avg bytes');
for (const [k, a] of Object.entries(acc).sort((x, y) => y[1].ms - x[1].ms))
  console.log(`${k.padEnd(42)} ${String(a.n).padStart(7)} ${a.ms.toFixed(0).padStart(10)} ${((a.ms / a.n) * 1000).toFixed(0).padStart(8)} ${a.max.toFixed(2).padStart(9)} ${a.bytes ? String(Math.round(a.bytes / a.n)).padStart(10) : ''}`);
