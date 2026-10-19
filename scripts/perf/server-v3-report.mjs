#!/usr/bin/env node
// (v3 perf recon, front "server") Summarise tests/perf/v3-server-load.ts output (one or more JSON files) as a
// markdown table (median over rounds per world x phase x lobby count) and check the PROPOSED server budget keys
// (docs/perf-v3/server.md "Proposed budgets") without touching scripts/perf/budgets.mjs.
//
//   node scripts/perf/server-v3-report.mjs /tmp/ct-v3srv/v3-server-load.json [/tmp/ct-v3srv6/v3-server-load.json …] [--check]
//   A/B: node scripts/perf/server-v3-report.mjs before=/tmp/a/v3-server-load.json after=/tmp/b/v3-server-load.json --check-tag after --check
//
// --check exits 1 when a proposed key is over its max (keys whose input is missing are SKIP).
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const CHECK_TAG = argv.includes('--check-tag') ? argv[argv.indexOf('--check-tag') + 1] : null;
/** `[tag=]file`: a tag (e.g. before / after) keeps two trees apart in the table; --check-tag picks the one to check. */
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--check-tag');
if (!files.length) {
  console.error('usage: server-v3-report.mjs <v3-server-load.json>... [--check]');
  process.exit(2);
}

// Proposed keys (mirrors docs/perf-v3/server.md "Proposed budgets"; the final perf gate merges them into budgets.mjs).
// Inputs: tests/perf/v3-server-load.ts --hz 15 (the v3 client's move rate) --stops yes (default), profiler off.
const isA = (r) => r.label.startsWith('A');
const isB = (r) => r.label.startsWith('B');
/** Average S2C B/s of the non-Storyteller clients (rx[0] is the ST of lobby 1; avg is over every client). */
const playerAvg = (r) => {
  const s = r.s2cBytesPerSecPerClient;
  return s && r.clients > 1 ? Math.round((s.avg * r.clients - s.st) / (r.clients - 1)) : null;
};
export const PROPOSED = {
  serverCpuPct16v3: { max: 6, unit: '% core', pick: (r) => r.world === 'v3' && r.lobbies === 1 && isA(r) && r.serverCpuPct },
  serverStageCpuPct16v3: { max: 6, unit: '% core', pick: (r) => r.world === 'v3' && r.lobbies === 1 && isB(r) && r.serverCpuPct },
  serverCpuPctPerLobby6x10v3: { max: 2.5, unit: '% core', pick: (r) => r.world === 'v3' && r.lobbies >= 6 && isA(r) && r.serverCpuPerLobbyPct },
  snapshotBytesPerSecPerPlayerV3: { max: 2000, unit: 'B/s', pick: (r) => r.world === 'v3' && r.lobbies === 1 && isA(r) && playerAvg(r) },
  stDownlinkBytesPerSecV3: { max: 16000, unit: 'B/s', pick: (r) => r.world === 'v3' && r.lobbies === 1 && isA(r) && r.s2cBytesPerSecPerClient?.st },
  stGameViewsPerSecStageV3: { max: 4, unit: '/s', pick: (r) => r.world === 'v3' && r.lobbies === 1 && isB(r) && r.perType?.st?.['game:view']?.perSec },
  serverEldP99Ms6x10v3: { max: 25, unit: 'ms', pick: (r) => r.world === 'v3' && r.lobbies >= 6 && r.runtime?.eldP99MsMaxOfSeconds },
  serverGcPauseMaxMs6x10v3: { max: 20, unit: 'ms', pick: (r) => r.world === 'v3' && r.lobbies >= 6 && r.runtime?.gcPauseMaxMsBucket },
};

const rows = [];
for (const spec of files) {
  const eq = spec.indexOf('=');
  const tag = eq > 0 ? spec.slice(0, eq) : '';
  const f = eq > 0 ? spec.slice(eq + 1) : spec;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const run of j.runs) for (const p of run.phases) rows.push({ ...p, file: f, tag, cpuprof: j.config.cpuprof });
}
const med = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const groups = new Map();
for (const r of rows) {
  const k = `${r.lobbies}x${r.clients / r.lobbies}|${r.world}|${r.label.slice(0, 1)}|prof=${r.cpuprof}|${r.tag ?? ''}`;
  (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
}
const cols = [
  ['CPU %', (r) => r.serverCpuPct],
  ['CPU p95', (r) => r.serverCpuP95],
  ['CPU/lobby', (r) => r.serverCpuPerLobbyPct],
  ['ELU %', (r) => r.runtime?.eluPct],
  ['ms/tick (ELU)', (r) => r.runtime?.eluActiveMsPerTick24],
  ['ELD p99 ms', (r) => r.runtime?.eldP99MsMaxOfSeconds],
  ['GC ms/s', (r) => r.runtime?.gcMsPerSec],
  ['GC max ms', (r) => r.runtime?.gcPauseMaxMsBucket],
  ['anon MB', (r) => r.rssAnonMb?.max],
  ['S2C B/s/cl', (r) => r.s2cBytesPerSecPerClient?.avg],
  ['S2C player', playerAvg],
  ['S2C ST', (r) => r.s2cBytesPerSecPerClient?.st],
  ['C2S B/s/cl', (r) => r.c2sBytesPerSecPerClient],
  ['tp/cl/min', (r) => r.teleportsPerClientMin],
  ['ST game:view/s', (r) => r.perType?.st?.['game:view']?.perSec],
];
console.log(`| lobbies x clients | world (tree) | phase | profiler | n | ${cols.map((c) => c[0]).join(' | ')} |`);
console.log(`|${'---|'.repeat(5 + cols.length)}`);
for (const [k, rs] of [...groups.entries()].sort()) {
  const [lc, world, phase, prof, tag] = k.split('|');
  console.log(`| ${lc} | ${world}${tag ? ` (${tag})` : ''} | ${phase} | ${prof.slice(5)} | ${rs.length} | ${cols.map(([, f]) => med(rs.map(f)) ?? '—').join(' | ')} |`);
}

// Budget check (median over matching phases, profiler-off rows only).
const off = rows.filter((r) => !r.cpuprof && (CHECK_TAG === null || r.tag === CHECK_TAG));
let over = 0;
console.log('');
const measured = {};
for (const [name, b] of Object.entries(PROPOSED)) {
  if (b.derived) continue;
  measured[name] = med(off.map((r) => b.pick(r)).filter((v) => typeof v === 'number'));
}
for (const [name, b] of Object.entries(PROPOSED)) {
  const v = measured[name];
  const st = v == null ? 'SKIP' : v <= b.max ? 'ok' : 'OVER';
  if (st === 'OVER') over++;
  console.log(`${st.padEnd(4)}  ${name.padEnd(32)} ${v == null ? '—' : String(v).padStart(8)} / ${String(b.max).padStart(5)} ${b.unit}`);
}
if (CHECK) process.exit(over ? 1 : 0);
