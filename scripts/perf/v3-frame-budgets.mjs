#!/usr/bin/env node
// v3 perf recon, front "frame" (v3-perf-frame): PREVIEW of the proposed v3 frame keys for scripts/perf/budgets.mjs,
// read from tests/perf/v3-frame.ts output. Not wired into budgets.mjs (WP7 owns that file): it prints the same
// ok / OVER / SKIP rows so the optimisation swarm can check a change against the proposed values today.
//
//   node scripts/perf/v3-frame-budgets.mjs <v3-frame.json> [--out <file.json>]
//
// Counts (draw calls, programs, lights, shadow maps, post passes) are renderer facts and do not depend on the
// machine; *Sws* keys are SwiftShader-on-the-game-host numbers (CPU raster, shared host): relative only, generous.
// Values and rationale: docs/perf-v3/recon-frame.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
if (!file || !existsSync(file)) {
  console.error('usage: node scripts/perf/v3-frame-budgets.mjs <v3-frame.json> [--out file]');
  process.exit(2);
}
const data = JSON.parse(readFileSync(file, 'utf8'));

// name -> { max, unit, why, pick(tierRecord, headline) }
export const V3_FRAME_BUDGETS = {
  v3CallsHigh: { tier: 'high', max: 330, unit: 'calls', why: 'town + own avatar at the square, high, 1080p, incl. the 30 Hz river reflection frame (C0b / HEAD r1: 284)', pick: (h) => h.calls },
  v3CallsLow: { tier: 'low', max: 240, unit: 'calls', why: 'town + own avatar at the square, low, 1080p (C0b / HEAD r1: 193-196)', pick: (h) => h.calls },
  v3CallsPerCharHigh: { tier: 'high', max: 12, unit: 'calls', why: 'INTEGRATION.md §7: <= 12 calls per visible character at high', pick: (h) => h.callsPerChar },
  v3CallsPerCharLow: { tier: 'low', max: 6, unit: 'calls', why: 'INTEGRATION.md §7: <= 6 calls per visible character at low (LOD)', pick: (h) => h.callsPerChar },
  v3ProgramsHigh: { tier: 'high', max: 48, unit: 'programs', why: 'compiled programs at high (C0b 35, HEAD 42 with the light pool; re-set at C1)', pick: (h) => Math.max(...(h.programs ?? [NaN])) },
  v3ProgramsLow: { tier: 'low', max: 48, unit: 'programs', why: 'compiled programs at low (C0b 35, HEAD 41; re-set at C1)', pick: (h) => Math.max(...(h.programs ?? [NaN])) },
  v3ProgramDriftHigh: { tier: 'high', max: 0, unit: 'changes', why: 'programs constant across the window (no per-frame recompile)', pick: (h) => (h.programs ? h.programs.length - 1 : null) },
  v3ProgramDriftLow: { tier: 'low', max: 0, unit: 'changes', why: 'programs constant across the window', pick: (h) => (h.programs ? h.programs.length - 1 : null) },
  v3PointLightsHigh: { tier: 'high', max: 12, unit: 'lights', why: 'INTEGRATION.md §7 light budget (constant 12 at high)', pick: (h, t) => t.census?.lights?.PointLight?.visible ?? 0 },
  v3PointLightsLow: { tier: 'low', max: 8, unit: 'lights', why: 'INTEGRATION.md §7 light budget (constant 8 at low)', pick: (h, t) => t.census?.lights?.PointLight?.visible ?? 0 },
  v3ShadowMapLow: { tier: 'low', max: 2048, unit: 'px', why: '§7 low = 2048 sun shadow map', pick: (h, t) => Math.max(0, ...(t.census?.shadowMaps ?? []).map((s) => s.mapSize[0])) },
  v3ShadowCastersLow: { tier: 'low', max: 1, unit: 'maps', why: 'one shadow-casting light (the sun) per frame', pick: (h, t) => (t.census?.shadowMaps ?? []).length },
  v3PostPassesLow: { tier: 'low', max: 8, unit: 'passes', why: 'enabled low-res post passes at the square, low (measured 8)', pick: (h) => h.postPasses?.length ?? null },
  v3PostPassesHigh: { tier: 'high', max: 8, unit: 'passes', why: 'enabled low-res post passes at the square, high (r1: 8)', pick: (h) => h.postPasses?.length ?? null },
  v3AllocKbPerFrameHigh: { tier: 'high', max: 64, unit: 'KiB/frame', why: 'PROVISIONAL: renderAt allocations per real frame (heapSynced, incl. collected objects); re-set at C1', pick: (h) => h.allocKbPerFrame },
  v3AllocKbPerFrameLow: { tier: 'low', max: 64, unit: 'KiB/frame', why: 'PROVISIONAL: renderAt allocations per real frame (heapSynced); re-set at C1', pick: (h) => h.allocKbPerFrame },
  v3SwsJsFrameP50MsLow: { tier: 'low', max: 20, unit: 'ms', why: 'RAF JS per frame on the SwiftShader host, low (r1 stub 6.6-6.9): relative only', pick: (h) => h.jsFrameP50 },
  v3SwsJsFrameP50MsHigh: { tier: 'high', max: 25, unit: 'ms', why: 'RAF JS per frame on the SwiftShader host, high (r1 stub 6.1-6.7): relative only', pick: (h) => h.jsFrameP50 },
  v3WalkDomMutPerSec: { tier: 'low', max: 40, unit: '/s', why: 'INTEGRATION.md §7 overlay DOM writes while walking with 15 labels', pick: (h) => h.domMutPerSec },
};

const byTier = new Map((data.headline ?? []).map((h) => [h.tier, h]));
const recByTier = new Map((data.tiers ?? []).map((t) => [t.tier, t]));
let failed = 0;
const rows = [];
console.log(`v3-frame budgets preview: ${file}\n  at ${data.at} rev ${data.rev ?? '?'} viewport ${data.viewport?.join('x')} load ${data.load?.before?.join(' ')} -> ${data.load?.after?.join(' ')}\n`);
for (const [name, b] of Object.entries(V3_FRAME_BUDGETS)) {
  const h = byTier.get(b.tier);
  const t = recByTier.get(b.tier);
  let v = null;
  try {
    v = h && t ? b.pick(h, t) : null;
  } catch {
    v = null;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) v = null;
  const status = v == null ? 'SKIP' : v <= b.max ? 'ok' : 'OVER';
  if (status === 'OVER') failed++;
  rows.push({ name, value: v, max: b.max, unit: b.unit, status, why: b.why });
  console.log(`${status.padEnd(4)}  ${name.padEnd(26)} ${v == null ? '—'.padStart(8) : String(Math.round(v * 10) / 10).padStart(8)} / ${String(b.max).padStart(6)} ${b.unit.padEnd(9)} ${b.why}`);
}
if (outArg) {
  mkdirSync(path.dirname(outArg), { recursive: true });
  writeFileSync(outArg, JSON.stringify({ at: new Date().toISOString(), source: file, rows }, null, 2));
}
console.log(failed ? `\n${failed} proposed budget(s) over` : '\nall measured proposed budgets ok');
process.exit(failed ? 1 : 0);
