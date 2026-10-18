#!/usr/bin/env node
// v2.2 WP7 — perf budgets for a release candidate. Reads the JSON the existing perf scripts write
// and fails (exit 1) when a measured value is over budget. Budgets = v2.2 measured value + ~20 %
// slack (the host is shared with prod, so numbers are noisy). Missing inputs are reported as SKIP.
//
//   node scripts/perf/budgets.mjs \
//     [--bundle /tmp/ct-bundle.json]            # node scripts/perf/bundle-report.mjs --json /tmp/ct-bundle.json
//     [--server /tmp/ct-srv/server-profile.json] # tests/perf/server-profile.ts --snap2 yes --cpuprof no --out …
//                                                  (v2.4: profiler off — --cpu-prof itself costs ~3 % of a core and a
//                                                   cold tsx cache adds ~3 % more; see perf-v2.2-results.md P3)
//     [--client /tmp/ct-client/client-perf.json] # tests/perf/client-perf.ts --gpu yes --win 20 --only desktop-idle,desktop-walk,mobile-walk,night-home
//     [--load   /tmp/ct-load/client-perf.json]   # tests/perf/client-perf.ts --gpu yes --only load
//     [--atlases packages/assets/generated]      # shipped *.webp atlas bytes (default)
//     [--out tests/perf/results/<date>.json]
// Commands and the measured v2.2 baseline: docs/perf-v2.2-results.md (WP7).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const KiB = 1024;

// name → max allowed value (and unit for printing)
export const BUDGETS = {
  entryJsBrKiB: { max: 45, unit: 'KiB br', why: 'JS before sign-in (v2.2: 36.5)' },
  entryCssBrKiB: { max: 15, unit: 'KiB br', why: 'entry CSS, base + theme (v2.4: 11.4; v2.3: 24.9)' },
  lobbyChunkBrKiB: { max: 72, unit: 'KiB br', why: 'LobbyRoute chunk (v2.4: 63.8; v2.3: 83.4)' },
  townChunkBrKiB: { max: 300, unit: 'KiB br', why: 'TownGame chunk, Phaser (v2.2: 284.5)' },
  town3dChunkBrKiB: { max: 300, unit: 'KiB br', why: 'v3 town3d chunk, three + pixel3d (v3.0: 270.4; v3.1: 282.7)' },
  townAtlasKiB: { max: 700, unit: 'KiB', why: 'WebP atlases loaded on town entry (v2.4: 578; HD/ghosts on demand)' },
  snapshotBytesPerSecPerClient: { max: 2000, unit: 'B/s', why: 'S2C per client, day walk (v2.2: 1487)' },
  serverCpuPct16: { max: 4, unit: '% core', why: 'server CPU, 16 clients walking, profiler off (v2.4: 2.0-2.5)' },
  desktopWalkFrameP95Ms: { max: 20, unit: 'ms', why: 'desktop-walk frame p95 (v2.2: 16.7)' },
  desktopWalkMainPct: { max: 9, unit: '%', why: 'desktop-walk, outdoors (v2.4: 6.0; v2.3 real walk: 15)' },
  mobileWalkMainPct: { max: 24, unit: '%', why: 'phone profile walk, outdoors (v2.4: 15-20, noisy; v2.3 real walk: 44)' },
  mobileWalkDomMutPerSec: { max: 6, unit: '/s', why: 'HUD churn while walking (v2.4: 3.3; compass gated to 2/s)' },
  authScreenMs: { max: 3500, unit: 'ms', why: 'Slow-4G phone profile, local uncompressed (v2.2: 2.5 s)' },
  townNetworkIdleMs: { max: 19000, unit: 'ms', why: 'Slow-4G phone profile, local uncompressed (v2.4: 16.5 s)' },
};

const readJson = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const measured = {};

const bundle = readJson(arg('bundle'));
if (bundle) {
  const chunks = Object.entries(bundle.chunks ?? {});
  const br = (pred) => {
    // Sum every match: since v2.4 the entry CSS is two files (index-base-* + the theme index-*).
    const fs = (bundle.files ?? []).filter((x) => pred(x.file) && x.br != null);
    return fs.length ? fs.reduce((a, x) => a + x.br, 0) / KiB : null;
  };
  const entry = chunks.find(([, c]) => c.isEntry)?.[0];
  if (entry) measured.entryJsBrKiB = br((f) => f === entry);
  measured.entryCssBrKiB = br((f) => /^assets\/index-[^/]+\.css$/.test(f));
  measured.lobbyChunkBrKiB = br((f) => /^assets\/LobbyRoute-[^/]+\.js$/.test(f));
  measured.townChunkBrKiB = br((f) => /^assets\/TownGame-[^/]+\.js$/.test(f));
  measured.town3dChunkBrKiB = br((f) => /^assets\/town3d-[^/]+\.js$/.test(f));
}

const atlasDir = arg('atlases', 'packages/assets/generated');
if (existsSync(atlasDir)) {
  const runtime = ['cast', 'terrain', 'objects', 'decor', 'lights', 'square-props', 'social'];
  let total = 0;
  for (const n of runtime) {
    const p = path.join(atlasDir, `${n}.webp`);
    if (existsSync(p)) total += statSync(p).size;
  }
  if (total) measured.townAtlasKiB = total / KiB;
}

const server = readJson(arg('server'));
if (server) {
  const walk = server.results?.find((r) => String(r.label ?? '').startsWith('A '));
  if (walk) {
    measured.snapshotBytesPerSecPerClient = walk.s2cBytesPerSecPerClient?.avg ?? null;
    measured.serverCpuPct16 = walk.serverCpuPct ?? null;
  }
}

const client = readJson(arg('client'));
if (client) {
  measured.desktopWalkFrameP95Ms = client.desktopWalk?.frameMs?.p95 ?? null;
  measured.desktopWalkMainPct = client.desktopWalk?.mainThreadBusyPct ?? null;
  measured.mobileWalkMainPct = client.mobileWalk?.mainThreadBusyPct ?? null;
  measured.mobileWalkDomMutPerSec = client.mobileWalk?.domMutationsPerSec ?? null;
}

const load = readJson(arg('load'));
if (load) {
  measured.authScreenMs = load.loadAuth?.authScreenMs ?? null;
  measured.townNetworkIdleMs = load.loadTown?.townNetworkIdleMs ?? null;
}

let failed = 0;
const rows = [];
for (const [name, b] of Object.entries(BUDGETS)) {
  const v = measured[name];
  const status = v == null ? 'SKIP' : v <= b.max ? 'ok' : 'OVER';
  if (status === 'OVER') failed++;
  rows.push({ name, value: v == null ? null : Math.round(v * 10) / 10, max: b.max, unit: b.unit, status, why: b.why });
  console.log(`${status.padEnd(4)}  ${name.padEnd(30)} ${v == null ? '—' : (Math.round(v * 10) / 10).toString().padStart(8)} / ${String(b.max).padStart(6)} ${b.unit.padEnd(7)}  ${b.why}`);
}
const out = arg('out');
if (out) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
  console.log(`wrote ${out}`);
}
console.log(failed ? `\n${failed} budget(s) over` : '\nall measured budgets ok');
process.exit(failed ? 1 : 0);
