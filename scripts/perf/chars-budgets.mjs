#!/usr/bin/env node
// v3 perf recon, front "chars": budget check for the characters / overlay / memory numbers written by
// tests/perf/v3-memory.ts (component level) and tests/perf/v3-lobby-switch.ts (real app). Same row format as
// scripts/perf/budgets.mjs; the keys below are PROPOSED for its v3 section (WP7 owns budgets.mjs; until they are
// merged there this script is the check). Missing inputs are SKIP. Exit 1 when a measured value is over budget.
//
//   node scripts/perf/chars-budgets.mjs [--memory test-results/v3-perf-chars/v3-memory-low.json]
//                                       [--switch test-results/v3-perf-chars/lobby-switch-v3.json] [--out <json>]
//
// CPU numbers (ms) come from SwiftShader on the shared game host (a CPU proxy, dev build, 60 Hz virtual time):
// compare them only with runs of the same script on the same host under the heavy lock. Counts (calls, programs,
// geometries, textures, retained objects) and DOM writes are deterministic and host-independent.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const readJson = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

export const CHAR_BUDGETS = {
  // counts (deterministic; v3-memory.ts on the 4998ca5+WIP tree measured: low 3.0 calls / rig, 1 program / distinct spec)
  v3CallsPerRigLow: { max: 4, unit: 'calls', why: 'per visible rig at low, frame mean (rig15 − empty) / 15; measured 3.0 (shadow + colour + normal); §7 allows 6' },
  v3CallsPerRigHigh: { max: 12, unit: 'calls', why: '§7: same at high, frame means (the water reflection renders at 30 Hz: use callsMean)' },
  v3ProgramsAdded15: { max: 16, unit: 'programs', why: '15 distinct specs arriving; measured 15 (one char program per spec + char-depth-snap)' },
  v3ProgramsConstantGhost: { max: 0, unit: 'programs', why: '15 deaths + revivals; measured 0' },
  // CPU on the host (SwiftShader, Vite DEV build, 60 Hz virtual time, heavy lock held; noisy: ~40 % slack)
  v3AvatarUpdateMs15: { max: 2, unit: 'ms', why: 'avatars layer.update, 15 rigs walking, frame mean; measured 1.42' },
  v3AvatarUpdateMsPerRig: { max: 0.13, unit: 'ms', why: '(rig15 walk − empty) / 15; measured 0.093' },
  v3RenderCpuMsPerRig: { max: 0.27, unit: 'ms', why: 'renderNow main-thread CPU (rig15 walk − empty) / 15; measured 0.19' },
  v3OverlayFlushMs15: { max: 0.4, unit: 'ms', why: 'overlay flush, 15 labels walking, frame mean; measured 0.20 (5 talkers 0.25)' },
  v3OverlayContentWritesPerFrame: { max: 0.05, unit: '/frame', why: 'labels walking: content + visibility writes per frame; measured 0' },
  v3AllocKiBPerRigFrame: { max: 10, unit: 'KiB', why: 'approx. JS allocation per rig per frame ((rig15 walk − empty) / 15); measured ≈ 8.3 (town alone ≈ 186 KiB / frame)' },
  // memory
  v3HeapPerRigMiB: { max: 4, unit: 'MiB', why: 'JS heap per rig (churn: full − empty after round 1, / 15); measured ≈ 9 (rig.js build arrays kept alive by closures)' },
  v3ChurnGeometriesDelta: { max: 0, unit: 'geoms', why: 'geometries, last round empty vs round 1 empty (one-time +4 after the first round is a cache)' },
  v3ChurnTexturesDelta: { max: 0, unit: 'textures', why: 'textures, last round empty vs round 1 empty' },
  v3ChurnHeapGrowthMiB: { max: 5, unit: 'MiB', why: 'JS heap (forced GC), last round empty vs round 1 empty; measured −0.7' },
  v3MountHeapGrowthMiB: { max: 10, unit: 'MiB', why: '§1.3/§7 leak rule: heap after destroy #N vs #1; measured ≈ +70 / cycle (OVER)' },
  v3MountRetainedRenderers: { max: 0, unit: 'objects', why: 'Engine + WebGLRenderer + Scene + SkinnedMesh retained after N destroys vs #1; measured +1 engine / cycle (OVER)' },
  v3SwitchHeapGrowthMiB: { max: 10, unit: 'MiB', why: 'real app: heap on the home screen, visit N vs 1; measured v3 +280 over 4 visits (OVER), Classic +1' },
  v3SwitchLiveContextsGrowth: { max: 0, unit: 'objects', why: 'real app: canvases + WebGL contexts + WebSockets + AudioContexts, visit N vs 1; measured v3 +32 (OVER), Classic 0' },
  // real devices only (SwiftShader compiles take seconds): read from the ct.debug.v3perf overlay, not checked here
  v3AvatarBuildLongTaskMaxMs: { max: 150, unit: 'ms', why: 'longest main-thread task while a rig builds (build + first update + compile); real device only' },
};

const measured = {};
const mem = readJson(arg('memory', 'test-results/v3-perf-chars/v3-memory-low.json'));
if (mem?.cost?.groups) {
  const g = mem.cost.groups;
  const empty = g.empty?.idle;
  const r15 = g.rig15;
  const perRig = (a, b, f) => (a && b ? (f(a) - f(b)) / 15 : null);
  if (r15 && empty) {
    const k = mem.tier === 'high' ? 'v3CallsPerRigHigh' : 'v3CallsPerRigLow';
    measured[k] = perRig(r15.idle, empty, (w) => w.callsMean ?? w.calls);
    measured.v3AvatarUpdateMsPerRig = perRig(r15.walk, empty, (w) => w.updateMs.mean);
    measured.v3RenderCpuMsPerRig = perRig(r15.walk, empty, (w) => w.renderCpuMs.mean);
    measured.v3AllocKiBPerRigFrame = perRig(r15.walk, empty, (w) => w.allocKiBPerFrame);
  }
  if (r15) {
    measured.v3ProgramsAdded15 = (g.rig1?.build?.programsAdded ?? 0) + (g.rig5?.build?.programsAdded ?? 0) + (r15.build?.programsAdded ?? 0);
    measured.v3AvatarUpdateMs15 = r15.walk?.updateMs?.mean ?? null;
    measured.v3OverlayFlushMs15 = r15.walk?.overlayMs?.mean ?? null;
    measured.v3OverlayContentWritesPerFrame = r15.walk?.overlayWritesPerFrame ? r15.walk.overlayWritesPerFrame.content + r15.walk.overlayWritesPerFrame.visibility : null;
    if (!/SwiftShader/i.test(String(mem.cost.gpu ?? ''))) measured.v3AvatarBuildLongTaskMaxMs = Math.max(g.rig1?.build?.longTasks?.maxMs ?? 0, g.rig5?.build?.longTasks?.maxMs ?? 0, r15.build?.longTasks?.maxMs ?? 0);
  }
  if (g.ghost15 && r15) measured.v3ProgramsConstantGhost = (g.ghost15.walk?.programs ?? 0) - (r15.walk?.programs ?? 0) + (g.ghost15.revive?.programsAdded ?? 0);
}
if (mem?.churn?.rounds?.length) {
  const rs = mem.churn.rounds;
  const first = rs[0].empty;
  const last = rs[rs.length - 1].empty;
  measured.v3ChurnGeometriesDelta = last.geometries - first.geometries;
  measured.v3ChurnTexturesDelta = last.textures - first.textures;
  measured.v3ChurnHeapGrowthMiB = last.heapMiB - first.heapMiB;
  measured.v3HeapPerRigMiB = (rs[0].full.heapMiB - first.heapMiB) / 15;
}
if (mem?.cycles?.leak) {
  const l = mem.cycles.leak;
  measured.v3MountHeapGrowthMiB = l.heapGrowthMiB_cycle1_to_N;
  const rg = l.retainedGrowth ?? {};
  measured.v3MountRetainedRenderers = Math.max(0, rg.WebGLRenderer ?? 0) + Math.max(0, rg.Scene ?? 0) + Math.max(0, rg.SkinnedMesh ?? 0);
}
const sw = readJson(arg('switch'));
if (sw?.leak) {
  measured.v3SwitchHeapGrowthMiB = sw.leak.heapGrowthMiB_visit1_to_N;
  const lg = sw.leak.liveGrowth_visit1_to_N ?? {};
  measured.v3SwitchLiveContextsGrowth = ['HTMLCanvasElement', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'WebSocket', 'AudioContext'].reduce((a, k) => a + Math.max(0, lg[k] ?? 0), 0);
}

let failed = 0;
const rows = [];
for (const [name, b] of Object.entries(CHAR_BUDGETS)) {
  const v = measured[name];
  const status = v == null ? 'SKIP' : v <= b.max ? 'ok' : 'OVER';
  if (status === 'OVER') failed++;
  const shown = v == null ? null : Math.round(v * 100) / 100;
  rows.push({ name, value: shown, max: b.max, unit: b.unit, status, why: b.why });
  console.log(`${status.padEnd(4)}  ${name.padEnd(32)} ${shown == null ? '—' : String(shown).padStart(8)} / ${String(b.max).padStart(6)} ${b.unit.padEnd(8)}  ${b.why}`);
}
const out = arg('out');
if (out) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
}
console.log(failed ? `\n${failed} budget(s) over` : '\nall measured budgets ok');
process.exit(failed ? 1 : 0);
