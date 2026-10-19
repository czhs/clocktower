// v3 WP7 (v3-qa). The mock-world harness page (apps/client/v3-harness.html, docs/v3/INTEGRATION.md §6.3): mounts the
// REAL 3D town (createTownGame3d, the package entry point) on a fake RoomConnection (harness/fakeConn.ts) and replays
// a scenario (tests/v3/scenarios/<name>.json, harness/scenario.ts). No server, no network: built by
// apps/client/vite.harness.config.ts only (never part of `pnpm build`), served with the production CSP.
//
//   v3-harness.html?scenario=square-day-8&tier=low&fps=15     replay a scenario (stills via the driver)
//   v3-harness.html?mode=cycles&cycles=5                      mount/destroy leak cycle (+2 tier rebuilds, 1 crash)
//   v3-harness.html?scenario=projection                       the §1.5 marker check (engine only)
//
// Hook: window.__harness = { mode, scenario, ready, done, error, t, shots: [{name, t, camera?}], pending, ack(),
//   perf: {frames: number[]}, sent: {type: count}, result }.
//   The scenario clock (deterministic `t`) advances by the real frame delta, clamped to 100 ms, and STOPS while a
//   shot is pending: the driver (tests/v3/render-check.spec.ts) takes the still and calls __harness.ack().
import { tileCenterPx, type LobbyRoomView, type TownLayout } from '@ct/protocol';
import { currentLayout, ensureLayout } from '../../net/layout';
import { voicePresence } from '../../voice/VoiceClient';
import type { FallbackReason, TownBridge3d, TownHandle } from '../contract';
import { createFakeConn, type FakeConn } from './fakeConn';
import { lobbyViewOf, ScenarioPlayer, type Scenario, type ScenarioShot } from './scenario';

type CreateTown = (parent: HTMLElement, bridge: TownBridge3d, opts: { tier: 'low' | 'high' }) => TownHandle;

interface HarnessHook {
  mode: string;
  scenario: string | null;
  ready: boolean;
  done: boolean;
  error: string | null;
  t: number;
  shots: { name: string; t: number; camera?: ScenarioShot['camera']; cameraApplied?: boolean }[];
  pending: { name: string; t: number } | null;
  ack(): void;
  perf: { frames: number[]; readyMs: number | null };
  sent: Record<string, number>;
  fallbacks: FallbackReason[];
  consoleErrors: string[];
  result: unknown;
}

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'scenario';
const scenarioName = params.get('scenario') ?? (mode === 'cycles' ? 'square-day-8' : null);
const tierParam = params.get('tier');
const fps = Number(params.get('fps') ?? 15) || 0;
const READY_TIMEOUT_MS = Number(params.get('readyTimeout') ?? 240_000);

const H: HarnessHook = {
  mode,
  scenario: scenarioName,
  ready: false,
  done: false,
  error: null,
  t: 0,
  shots: [],
  pending: null,
  ack: () => undefined,
  perf: { frames: [], readyMs: null },
  sent: {},
  fallbacks: [],
  consoleErrors: [],
  result: null,
};
(window as unknown as { __harness: HarnessHook }).__harness = H;
window.addEventListener('error', (e) => H.consoleErrors.push(`error: ${String(e.message).slice(0, 300)}`));
window.addEventListener('unhandledrejection', (e) => H.consoleErrors.push(`rejection: ${String((e.reason as Error)?.message ?? e.reason).slice(0, 300)}`));

// the scenarios are bundled (static glob: CSP-safe, no fetch of repo files)
const SCENARIOS = import.meta.glob<Scenario>('../../../../../tests/v3/scenarios/*.json', { import: 'default' });

async function loadScenario(name: string): Promise<Scenario> {
  const key = Object.keys(SCENARIOS).find((k) => k.endsWith(`/${name}.json`));
  if (!key) throw new Error(`unknown scenario '${name}' (have: ${Object.keys(SCENARIOS).map((k) => k.split('/').pop()).join(', ')})`);
  return SCENARIOS[key]!();
}

function setFlags(): void {
  try {
    localStorage.setItem('ct.debug.camera', '1');
    localStorage.setItem('ct.debug.social', '1');
    // the harness mounts the 3D town directly; the force flag keeps the perf sampler off (SwiftShader frame times)
    localStorage.setItem('ct.debug.v3force', '1');
    localStorage.setItem('ct.debug.fps', String(fps));
    localStorage.removeItem('ct.graphics.booting');
    localStorage.removeItem('ct.graphics.boots');
  } catch {
    /* storage blocked: the town still mounts */
  }
}

function stage(viewport?: [number, number]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ct-game-canvas';
  el.style.position = 'fixed';
  el.style.left = '0';
  el.style.top = '0';
  el.style.width = viewport ? `${viewport[0]}px` : '100vw';
  el.style.height = viewport ? `${viewport[1]}px` : '100vh';
  el.style.overflow = 'hidden';
  document.body.appendChild(el);
  return el;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what}: timed out after ${ms} ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

async function loadTown(): Promise<CreateTown> {
  const m = (await import('../TownGame3d')) as unknown as { createTownGame3d: CreateTown };
  if (typeof m.createTownGame3d !== 'function') throw new Error('TownGame3d.createTownGame3d is not exported (WP0 entry point changed)');
  return m.createTownGame3d;
}

function bridgeFor(fake: FakeConn): TownBridge3d {
  return {
    conn: fake.conn,
    setPrompt() {},
    setCaption() {},
    setInside() {},
    registerLeave() {},
    requestFallback: (r) => H.fallbacks.push(r),
  };
}

function spawnOf(s: Scenario, L: TownLayout): { x: number; y: number; location: 'outdoors' | `bld:${string}` } {
  if (s.spawn) return { x: s.spawn.x, y: s.spawn.y, location: (s.spawn.location ?? 'outdoors') as 'outdoors' };
  const lv = lobbyViewOf(s);
  const st = lv.members.find((m) => m.pid === lv.youPid)?.role === 'storyteller';
  const p = tileCenterPx(L, st ? L.storytellerSpawn : L.playerSpawn);
  return { x: p.x, y: p.y, location: 'outdoors' };
}

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

// ------------------------------------------------------------------------------------------- scenario mode
async function runScenario(s: Scenario): Promise<void> {
  await ensureLayout(s.world);
  const L = currentLayout();
  const createTownGame3d = await loadTown();
  let fake: FakeConn | null = null;
  const player = new ScenarioPlayer(s, { now: () => Date.now(), ackSeq: () => fake?.ackSeq() ?? 0, self: () => fake?.self() ?? null });
  fake = createFakeConn({ lobbyView: player.lobbyView as LobbyRoomView, layout: () => currentLayout() });
  const parent = stage(s.viewport);
  const t0 = performance.now();
  const handle = createTownGame3d(parent, bridgeFor(fake), { tier: (tierParam as 'low' | 'high' | null) ?? s.tier ?? 'low' });
  const sp = spawnOf(s, L);
  fake.teleport(sp.x, sp.y, sp.location, 'spawn');
  await withTimeout(handle.ready ?? Promise.resolve(), READY_TIMEOUT_MS, 'town ready');
  H.perf.readyMs = Math.round(performance.now() - t0);
  H.ready = true;
  fake.teleport(sp.x, sp.y, sp.location, 'spawn'); // again, after the build (a stub may have ignored the early one)

  let t = 0;
  let last = performance.now();
  let paused = false;
  const cam = () => (window as unknown as { __ctCamera?: Record<string, (...a: unknown[]) => unknown> }).__ctCamera;
  for (;;) {
    const now = await nextFrame();
    const dt = now - last;
    last = now;
    if (H.perf.frames.length < 20_000) H.perf.frames.push(Math.round(dt * 100) / 100);
    if (paused) continue;
    t += Math.min(100, dt);
    H.t = Math.round(t);
    for (const ev of player.advance(t)) {
      if (ev.kind === 'gameView') fake.conn.gameView.set(ev.payload);
      else if (ev.kind === 'voice') {
        const cur = voicePresence.get();
        const speaking = new Set(cur.speaking);
        for (const [pid, on] of Object.entries(ev.payload)) on ? speaking.add(pid) : speaking.delete(pid);
        voicePresence.set({ ...cur, speaking: [...speaking] });
      } else if (ev.kind === 'shot') {
        let cameraApplied: boolean | undefined;
        if (ev.shot.camera) {
          const set = cam()?.setCamera;
          cameraApplied = typeof set === 'function';
          // CONTRACT-REQUEST(v3 integrator): a __ctCamera.setCamera({focus:[x,y] px, viewHeight}) debug member for stills
          if (cameraApplied) set!({ focus: ev.shot.camera.focus, viewHeight: ev.shot.camera.viewHeight });
        }
        // let the camera / overlays settle for a few frames before the still
        for (let k = 0; k < 4; k++) await nextFrame();
        H.shots.push({ name: ev.shot.name, t: Math.round(t), ...(ev.shot.camera ? { camera: ev.shot.camera, cameraApplied } : {}) });
        H.pending = { name: ev.shot.name, t: Math.round(t) };
        paused = true;
        await new Promise<void>((resolve) => {
          H.ack = () => {
            H.pending = null;
            H.ack = () => undefined;
            resolve();
          };
        });
        paused = false;
        last = performance.now();
        break;
      } else (fake.conn.events as unknown as { emit(t: string, p: unknown): void }).emit(ev.type, ev.payload);
    }
    for (const m of fake.sent.splice(0)) H.sent[m.type] = (H.sent[m.type] ?? 0) + 1;
    if (t >= player.duration && player.done) break;
  }
  const v3 = cam()?.v3?.();
  H.result = { readyMs: H.perf.readyMs, v3, fallbacks: H.fallbacks, sent: H.sent };
  handle.destroy();
  parent.remove();
}

// ------------------------------------------------------------------------------------------- cycles mode
interface CycleResult {
  i: number;
  kind: 'mount' | 'rebuild' | 'crash';
  tier: 'low' | 'high';
  readyOk: boolean;
  readyMs: number;
  canvasesAtReady: number;
  moved: boolean | null;
  info: unknown;
  fallbacks: FallbackReason[];
  canvasesAfter: number;
  ctCameraGone: boolean;
  pixelGone: boolean;
  bootingAfter: string | null;
  bootsAfter: number;
  heapMB: number | null;
}

function heapMB(): number | null {
  const gc = (window as unknown as { gc?: () => void }).gc;
  gc?.();
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? Math.round((mem.usedJSHeapSize / 1048576) * 100) / 100 : null;
}

async function runCycles(s: Scenario): Promise<void> {
  await ensureLayout(s.world);
  const L = currentLayout();
  const createTownGame3d = await loadTown();
  const cycles = Number(params.get('cycles') ?? 5);
  const plan: { kind: CycleResult['kind']; tier: 'low' | 'high' }[] = [
    ...Array.from({ length: cycles }, () => ({ kind: 'mount' as const, tier: 'low' as const })),
    // a tier rebuild = destroy + a NEW Engine at the other tier (§1.3 "Rebuild"); twice
    { kind: 'rebuild', tier: 'high' },
    { kind: 'rebuild', tier: 'low' },
    { kind: 'crash', tier: 'low' },
  ];
  const results: CycleResult[] = [];
  const heap0 = heapMB();
  const lv = lobbyViewOf({ ...s, members: (s.members ?? []).slice(0, 1) });
  for (const [i, step] of plan.entries()) {
    const fake = createFakeConn({ lobbyView: lv, layout: () => currentLayout() });
    const fallbacks: FallbackReason[] = [];
    const bridge = { ...bridgeFor(fake), requestFallback: (r: FallbackReason) => fallbacks.push(r) };
    const parent = stage(s.viewport);
    const t0 = performance.now();
    const h = createTownGame3d(parent, bridge, { tier: step.tier });
    const sp = spawnOf(s, L);
    fake.teleport(sp.x, sp.y, sp.location, 'spawn');
    let readyOk = false;
    try {
      await withTimeout(h.ready ?? Promise.resolve(), READY_TIMEOUT_MS, `cycle ${i} ready`);
      readyOk = true;
    } catch (e) {
      H.consoleErrors.push(`cycle ${i}: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    }
    const readyMs = Math.round(performance.now() - t0);
    // the 3D canvas (a direct child; WP4's overlay draws its own 2D FX canvas inside .ct-v3-overlay)
    const canvasesAtReady = parent.querySelectorAll(':scope > canvas').length;
    fake.teleport(sp.x, sp.y, sp.location, 'spawn');
    await new Promise((r) => setTimeout(r, 300));
    const camHook = () => (window as unknown as { __ctCamera?: { me?: () => { x: number } | null; v3?: () => unknown } }).__ctCamera;
    let moved: boolean | null = null;
    if (step.kind === 'crash') fake.failSends(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
    await new Promise((r) => setTimeout(r, step.kind === 'crash' ? 1500 : 700));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' }));
    await new Promise((r) => setTimeout(r, step.kind === 'crash' ? 1000 : 600));
    if (step.kind !== 'crash') {
      const me = camHook()?.me?.();
      moved = me ? me.x > sp.x : null;
    }
    const info = camHook()?.v3?.() ?? null;
    h.destroy();
    parent.remove();
    await new Promise((r) => setTimeout(r, 100));
    let booting: string | null = null;
    let boots = 0;
    try {
      booting = localStorage.getItem('ct.graphics.booting');
      boots = (JSON.parse(localStorage.getItem('ct.graphics.boots') ?? '[]') as unknown[]).length;
    } catch {
      /* ignore */
    }
    results.push({
      i,
      kind: step.kind,
      tier: step.tier,
      readyOk,
      readyMs,
      canvasesAtReady,
      moved,
      info,
      fallbacks,
      canvasesAfter: document.querySelectorAll('canvas').length,
      ctCameraGone: !('__ctCamera' in window),
      pixelGone: !('__pixel' in window),
      bootingAfter: booting,
      bootsAfter: boots,
      heapMB: heapMB(),
    });
    H.t = i + 1;
    // the boot guard counts unclean boots; a clean destroy must not leave one, but reset the list between cycles
    try {
      localStorage.removeItem('ct.graphics.boots');
    } catch {
      /* ignore */
    }
  }
  const normal = results.filter((r) => r.kind !== 'crash');
  const crash = results.find((r) => r.kind === 'crash');
  const mounts = results.filter((r) => r.kind === 'mount');
  const heaps = normal.map((r) => r.heapMB).filter((x): x is number => x !== null);
  const heapGrowth = heaps.length >= 2 ? Math.round((heaps[heaps.length - 1]! - heaps[0]!) * 100) / 100 : null;
  const checks = {
    allReady: normal.every((r) => r.readyOk && r.canvasesAtReady === 1),
    movedRight: mounts.every((r) => r.moved === true),
    noFallbacks: normal.every((r) => r.fallbacks.length === 0),
    ctCameraGone: results.every((r) => r.ctCameraGone),
    pixelGone: results.every((r) => r.pixelGone),
    canvasesGone: results.every((r) => r.canvasesAfter === 0),
    bootMarkClearedOnDestroy: normal.every((r) => r.bootingAfter === null),
    crashFallbackOnce: !!crash && crash.fallbacks.length === 1 && crash.fallbacks[0] === 'error',
    crashClearsMark: !!crash && crash.bootingAfter === null,
    // §1.3 leak test: < 10 MB JS heap growth across the cycles (needs --js-flags=--expose-gc for a stable number)
    heapGrowthUnder10MB: heapGrowth === null ? null : heapGrowth < 10,
  };
  H.result = { ok: Object.values(checks).every((v) => v !== false), checks, heap0, heapGrowth, results };
}

// ------------------------------------------------------------------------------------------- boot
async function main(): Promise<void> {
  setFlags();
  if (!scenarioName) throw new Error('missing ?scenario=<name> (or ?mode=cycles)');
  const s = await loadScenario(scenarioName);
  if (s.mode === 'projection') {
    const { runProjection } = await import('./projection');
    const root = stage(s.viewport ?? [1000, 1500]);
    H.ready = true;
    H.result = await runProjection(root, s.points ?? [], s.scales ?? [2, 3, 4]);
    return;
  }
  if (mode === 'cycles') await runCycles(s);
  else await runScenario(s);
}

main().then(
  () => {
    H.done = true;
  },
  (e: unknown) => {
    H.error = String((e as Error)?.stack ?? e).slice(0, 2000);
    H.done = true;
  },
);
