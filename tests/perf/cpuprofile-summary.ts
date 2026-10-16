// perf-audit: summarise a V8 .cpuprofile (from --cpu-prof): total sampled time, GC/idle share,
// top functions by SELF time, and INCLUSIVE time of named hot paths (tick, sendSnapshots, viewFor…).
//   npx tsx tests/perf/cpuprofile-summary.ts <file.cpuprofile> [--focus name1,name2] [--top 40]
import { readFileSync } from 'node:fs';

type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[]; hitCount?: number };
const argv = process.argv.slice(2);
const file = argv[0]!;
const top = Number(argv[argv.indexOf('--top') + 1] ?? 40) || 40;
const focusArg = argv.indexOf('--focus') >= 0 ? argv[argv.indexOf('--focus') + 1]! : '';
const focus = (focusArg ||
  'tick,sendSnapshots,flushViews,snapshotFor,pinsFor,viewFor,stageView,doorTags,record,recordState,commit,afterHandler,onMessage,handleMove,send,sendTo,encode,pack,stringify,_onMessage,broadcast,voice,coordinator,grantsFor,recompute')
  .split(',');
const p = JSON.parse(readFileSync(file, 'utf8')) as { nodes: Node[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number };
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map<number, number>();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const selfUs = new Map<number, number>();
for (let i = 0; i < p.samples.length; i++) selfUs.set(p.samples[i]!, (selfUs.get(p.samples[i]!) ?? 0) + (p.timeDeltas[i] ?? 0));
const total = [...selfUs.values()].reduce((a, b) => a + b, 0);
const wall = p.endTime - p.startTime;
const short = (u: string) => u.replace(/^.*\/(apps|packages|node_modules)\//, '$1/').replace(/^file:\/\//, '');
const key = (n: Node) => `${n.callFrame.functionName || '(anon)'} ${short(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
const self = new Map<string, number>();
for (const [id, us] of selfUs) {
  const k = key(byId.get(id)!);
  self.set(k, (self.get(k) ?? 0) + us);
}
const pct = (us: number) => `${((us / wall) * 100).toFixed(2)}% wall`;
const ms = (us: number) => `${(us / 1000).toFixed(0)} ms`;
const special = (name: string) => [...self.entries()].filter(([k]) => k.startsWith(name)).reduce((a, [, v]) => a + v, 0);
console.log(`profile ${file}\nwall ${ms(wall)}; sampled ${ms(total)}; idle ${ms(special('(idle)'))}; GC ${ms(special('(garbage collector)'))} (${pct(special('(garbage collector)'))}); program ${ms(special('(program)'))}`);
const busy = total - special('(idle)');
console.log(`busy (non-idle) ${ms(busy)} = ${pct(busy)} = ${((busy / wall) * 100).toFixed(1)}% of one core`);
console.log(`\n# top ${top} by self time`);
for (const [k, v] of [...self.entries()].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${ms(v).padStart(8)}  ${pct(v).padStart(12)}  ${k}`);
// inclusive: a sample counts once for each distinct focus name on its stack
const incl = new Map<string, number>();
const inclKeys = new Map<string, Map<string, number>>();
for (let i = 0; i < p.samples.length; i++) {
  const seen = new Set<string>();
  let id: number | undefined = p.samples[i]!;
  while (id !== undefined) {
    const n = byId.get(id)!;
    const fn = n.callFrame.functionName;
    for (const f of focus)
      if (fn === f && !seen.has(f)) {
        seen.add(f);
        incl.set(f, (incl.get(f) ?? 0) + (p.timeDeltas[i] ?? 0));
        const m = inclKeys.get(f) ?? new Map();
        const k = key(n);
        m.set(k, (m.get(k) ?? 0) + (p.timeDeltas[i] ?? 0));
        inclKeys.set(f, m);
      }
    id = parent.get(id);
  }
}
console.log(`\n# inclusive time of focus functions`);
for (const [f, v] of [...incl.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${ms(v).padStart(8)}  ${pct(v).padStart(12)}  ${f}`);
  for (const [k, kv] of [...inclKeys.get(f)!.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log(`            ${ms(kv).padStart(8)}  ${k}`);
}
// app-only self time grouped by source file
const files = new Map<string, number>();
for (const [id, us] of selfUs) {
  const u = short(byId.get(id)!.callFrame.url);
  const g = u.startsWith('apps/') || u.startsWith('packages/') ? u : u.startsWith('node_modules/') ? u.split('/').slice(0, u.includes('/.pnpm/') ? 4 : 2).join('/') : u || '(native/vm)';
  files.set(g, (files.get(g) ?? 0) + us);
}
console.log(`\n# self time by file/package`);
for (const [k, v] of [...files.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${ms(v).padStart(8)}  ${pct(v).padStart(12)}  ${k}`);
