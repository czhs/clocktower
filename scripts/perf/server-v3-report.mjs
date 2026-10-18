#!/usr/bin/env node
// (v3 perf recon, front "server") Summarise tests/perf/v3-server-load.ts output (one or more JSON files) as a
// markdown table (median over rounds per world x phase x lobby count) and check the PROPOSED server budget keys
// (docs/perf-v3/recon-server.md §Budgets) without touching scripts/perf/budgets.mjs.
//
//   node scripts/perf/server-v3-report.mjs /tmp/ct-v3srv/v3-server-load.json [/tmp/ct-v3srv6/v3-server-load.json …] [--check]
//
// --check exits 1 when a proposed key is over its max (keys whose input is missing are SKIP).
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const files = argv.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('usage: server-v3-report.mjs <v3-server-load.json>... [--check]');
  process.exit(2);
}

// Proposed keys (mirrors the recon doc; the lead decides whether they move into budgets.mjs).
export const PROPOSED = {
  serverCpuPct16v3: { max: 4, unit: '% core', pick: (r) => r.world === 'v3' && r.lobbies === 1 && r.label.startsWith('A') && r.serverCpuPct },
  serverCpuV3OverV2Pct: { max: 15, unit: '% more', derived: true },
  snapshotBytesPerSecPerClientV3: { max: 2000, unit: 'B/s', pick: (r) => r.world === 'v3' && r.lobbies === 1 && r.label.startsWith('A') && r.s2cBytesPerSecPerClient.avg },
  serverStageCpuPct16v3: { max: 6, unit: '% core', pick: (r) => r.world === 'v3' && r.lobbies === 1 && r.label.startsWith('B') && r.serverCpuPct },
  serverCpuPctPerLobby6x10v3: { max: 3, unit: '% core', pick: (r) => r.world === 'v3' && r.lobbies >= 6 && r.label.startsWith('A') && r.serverCpuPerLobbyPct },
  serverEldP99Ms6x10v3: { max: 25, unit: 'ms', pick: (r) => r.world === 'v3' && r.lobbies >= 6 && r.runtime?.eldP99MsMaxOfSeconds },
  serverGcPauseMaxMs6x10v3: { max: 20, unit: 'ms', pick: (r) => r.world === 'v3' && r.lobbies >= 6 && r.runtime?.gcPauseMaxMsBucket },
  serverAnonRssMb6x10v3: { max: 220, unit: 'MB', pick: (r) => r.world === 'v3' && r.lobbies >= 6 && r.rssAnonMb?.max },
};

const rows = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const run of j.runs) for (const p of run.phases) rows.push({ ...p, file: f, cpuprof: j.config.cpuprof });
}
const med = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const groups = new Map();
for (const r of rows) {
  const k = `${r.lobbies}x${r.clients / r.lobbies}|${r.world}|${r.label.slice(0, 1)}|prof=${r.cpuprof}`;
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
  ['C2S B/s/cl', (r) => r.c2sBytesPerSecPerClient],
  ['tp/cl/min', (r) => r.teleportsPerClientMin],
  ['ST game:view/s', (r) => r.perType?.st?.['game:view']?.perSec],
];
console.log(`| lobbies x clients | world | phase | profiler | n | ${cols.map((c) => c[0]).join(' | ')} |`);
console.log(`|${'---|'.repeat(5 + cols.length)}`);
for (const [k, rs] of [...groups.entries()].sort()) {
  const [lc, world, phase, prof] = k.split('|');
  console.log(`| ${lc} | ${world} | ${phase} | ${prof.slice(5)} | ${rs.length} | ${cols.map(([, f]) => med(rs.map(f)) ?? '—').join(' | ')} |`);
}

// Budget check (median over matching phases, profiler-off rows only).
const off = rows.filter((r) => !r.cpuprof);
let over = 0;
console.log('');
const measured = {};
for (const [name, b] of Object.entries(PROPOSED)) {
  if (b.derived) continue;
  measured[name] = med(off.map((r) => b.pick(r)).filter((v) => typeof v === 'number'));
}
const v2 = med(off.filter((r) => r.world === 'v2' && r.lobbies === 1 && r.label.startsWith('A')).map((r) => r.serverCpuPct));
const v3 = measured.serverCpuPct16v3;
measured.serverCpuV3OverV2Pct = v2 && v3 != null ? Math.round(((v3 - v2) / v2) * 1000) / 10 : null;
for (const [name, b] of Object.entries(PROPOSED)) {
  const v = measured[name];
  const st = v == null ? 'SKIP' : v <= b.max ? 'ok' : 'OVER';
  if (st === 'OVER') over++;
  console.log(`${st.padEnd(4)}  ${name.padEnd(32)} ${v == null ? '—' : String(v).padStart(8)} / ${String(b.max).padStart(5)} ${b.unit}`);
}
if (CHECK) process.exit(over ? 1 : 0);
