#!/usr/bin/env node
// v2.2 WP7 — perf budgets for a release candidate. Reads the JSON the existing perf scripts write
// and fails (exit 1) when a measured value is over budget. Budgets = v2.2 measured value + ~20 %
// slack (the host is shared with prod, so numbers are noisy). Missing inputs are reported as SKIP.
//
//   node scripts/perf/budgets.mjs \
//     [--bundle /tmp/ct-bundle.json]            # node scripts/perf/bundle-report.mjs --json …
//     [--server /tmp/ct-srv/server-profile.json] # tests/perf/server-profile.ts --snap2 yes --out …
//     [--client /tmp/ct-client/client-perf.json] # tests/perf/client-perf.ts --only desktop-idle,desktop-walk,mobile-walk,night-home
//     [--load   /tmp/ct-load/client-perf.json]   # tests/perf/client-perf.ts --only load
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
  entryCssBrKiB: { max: 27, unit: 'KiB br', why: 'entry CSS (v2.2: 22.1)' },
  lobbyChunkBrKiB: { max: 85, unit: 'KiB br', why: 'LobbyRoute chunk (v2.2: 68.2)' },
  townChunkBrKiB: { max: 300, unit: 'KiB br', why: 'TownGame chunk, Phaser (v2.2: 284.5)' },
  townAtlasKiB: { max: 950, unit: 'KiB', why: 'runtime WebP atlases (v2.2: ≈ 770)' },
  snapshotBytesPerSecPerClient: { max: 2000, unit: 'B/s', why: 'S2C per client, day walk (v2.2: 1487)' },
  serverCpuPct16: { max: 10, unit: '% core', why: 'server CPU, 16 clients walking (v2.2: 4.9)' },
  desktopWalkFrameP95Ms: { max: 20, unit: 'ms', why: 'desktop-walk frame p95 (v2.2: 16.7)' },
  desktopWalkMainPct: { max: 10, unit: '%', why: 'desktop-walk main thread (v2.2: 7.5)' },
  mobileWalkMainPct: { max: 17, unit: '%', why: 'phone profile walk main thread (v2.2: 13.9)' },
  mobileWalkDomMutPerSec: { max: 25, unit: '/s', why: 'HUD churn while walking (v2.2: 18.4)' },
  authScreenMs: { max: 3500, unit: 'ms', why: 'Slow-4G phone profile, local uncompressed (v2.2: 2.5 s)' },
  townNetworkIdleMs: { max: 21000, unit: 'ms', why: 'Slow-4G phone profile, local uncompressed (v2.2: 16.7 s)' },
};

const readJson = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const measured = {};

const bundle = readJson(arg('bundle'));
if (bundle) {
  const chunks = Object.entries(bundle.chunks ?? {});
  const br = (pred) => {
    const f = (bundle.files ?? []).find((x) => pred(x.file));
    return f?.br != null ? f.br / KiB : null;
  };
  const entry = chunks.find(([, c]) => c.isEntry)?.[0];
  if (entry) measured.entryJsBrKiB = br((f) => f === entry);
  measured.entryCssBrKiB = br((f) => /^assets\/index-[^/]+\.css$/.test(f));
  measured.lobbyChunkBrKiB = br((f) => /^assets\/LobbyRoute-[^/]+\.js$/.test(f));
  measured.townChunkBrKiB = br((f) => /^assets\/TownGame-[^/]+\.js$/.test(f));
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
