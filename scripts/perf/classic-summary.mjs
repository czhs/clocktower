#!/usr/bin/env node
// v3 perf recon (front "classic"): side-by-side table of tests/perf/classic-perf.ts results.
//   node scripts/perf/classic-summary.mjs label=path/classic-perf-v2.json label2=path2.json … [--md]
// Rows per window: browser rAF fps / Phaser renders per s, frame p95 / render-gap p95, main thread %, script %,
// DOM mutations/s, style recalcs/s, draws per render, texture uploads, live texture MiB; plus the load timings.
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const md = argv.includes('--md');
const runs = argv.filter((a) => a.includes('=')).map((a) => {
  const [label, file] = a.split('=');
  return { label, r: JSON.parse(readFileSync(file, 'utf8')) };
});
const W = [
  ['desktopIdle', 'desktop-idle'],
  ['desktopWalk', 'desktop-walk'],
  ['mobileWalk', 'mobile-walk'],
  ['gather', 'gather'],
  ['nightHome', 'night-home'],
];
const F = [
  ['fps / renders', (w) => `${w.fps} / ${w.rendersPerSec}`],
  ['frame p95 / render gap p95 ms', (w) => `${w.frameMs.p95} / ${w.renderGapMs?.p95 ?? '—'}`],
  ['main %', (w) => w.mainThreadBusyPct],
  ['script %', (w) => w.scriptPct],
  ['DOM mut/s', (w) => w.domMutationsPerSec],
  ['style recalc/s', (w) => w.styleRecalcsPerSec],
  ['draws/render', (w) => w.drawsPerRender],
  ['tex uploads/s (KiB/s)', (w) => `${w.texUploadsPerSec} (${w.texUploadKiBPerSec})`],
  ['live textures (MiB)', (w) => (w.textures ? `${w.textures.count} (${w.textures.totalMiB})` : '—')],
  ['canvas scale', (w) => w.canvas?.renderScale ?? '—'],
  ['host load 1m before→after', (w) => `${w.hostLoad1m?.before}→${w.hostLoad1m?.after}`],
];
const out = [];
const row = (cells) => out.push(md ? `| ${cells.join(' | ')} |` : cells.map((c, i) => String(c).padEnd(i ? 22 : 34)).join(''));
row(['', ...runs.map((x) => `${x.label} (${x.r.world})`)]);
if (md) out.push(`|${' --- |'.repeat(runs.length + 1)}`);
for (const [key, name] of W) {
  if (!runs.some((x) => x.r[key])) continue;
  row([`**${name}**`, ...runs.map(() => '')]);
  for (const [fname, f] of F) row([`  ${fname}`, ...runs.map((x) => (x.r[key] ? f(x.r[key]) : '—'))]);
  row(['  top DOM churn', ...runs.map((x) => (x.r[key]?.domMutationsTop?.slice(0, 2).join('; ') ?? '—'))]);
}
row(['**load (Slow 4G, 4x CPU)**', ...runs.map(() => '')]);
row(['  auth screen ms', ...runs.map((x) => x.r.loadAuth?.authScreenMs ?? '—')]);
row(['  town canvas / scene / network idle ms', ...runs.map((x) => (x.r.loadTown ? `${x.r.loadTown.townCanvasMs} / ${x.r.loadTown.townSceneMs ?? '—'} / ${x.r.loadTown.townNetworkIdleMs}` : '—'))]);
row(['  town bytes (Script / XHR+Fetch / Image)', ...runs.map((x) => {
  const b = x.r.loadTown?.townBytes;
  return b ? `${Math.round((b.Script ?? 0) / 1024)} / ${Math.round(((b.XHR ?? 0) + (b.Fetch ?? 0)) / 1024)} / ${Math.round((b.Image ?? 0) / 1024)} KiB` : '—';
})]);
row(['  textures after town load', ...runs.map((x) => (x.r.loadTown?.gpuTextures ? `${x.r.loadTown.gpuTextures.count} (${x.r.loadTown.gpuTextures.totalMiB} MiB)` : '—'))]);
console.log(out.join('\n'));
