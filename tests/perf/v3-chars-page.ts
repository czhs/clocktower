// v3 perf recon, front "chars" (CT_AGENT=v3-perf-chars). BROWSER side of tests/perf/v3-memory.ts: loaded from the
// Vite DEV server as /@fs/<repo>/tests/perf/v3-chars-page.ts (never imported by the app, never in dist/). It mounts
// the real game3d pieces WITHOUT TownGame3d (the integrator is rewriting it): vendor/engineHost + vendor/town
// (Hollowmere) + avatars/layer + overlay (fake connection, fallback View3d), on a scripted Scene3dState, and
// exposes measurement scenarios on window.__v3chars for the Node runner:
//
//   cost(cfg)    one engine: N = 0 / 1 / 5 / 15 rigs (distinct specs) idle + walking, 15 ghosts, 15 same-spec rigs,
//                15 billboards; per config: layer.update ms, render CPU ms, overlay ms, calls / tris / programs /
//                geometries / textures (renderer.info), per-stage calls (pipeline.stageCalls), long tasks while the
//                characters build (rig build + shader compile hitches), approximate JS allocation rate.
//   churn(cfg)   one engine: `rounds` x (15 players join, settle, leave): renderer.info.memory / programs / heap per
//                round (in-lobby avatar leak: joins, leaves, cast changes, 'clips' revivals rebuild bodies).
//   mount(cfg) / unmount()   one "lobby" (engine + town + 15 avatars + overlay) for the runner's mount/destroy cycles;
//                the runner measures heap / DOM / listeners / retained objects over CDP between them.
//
// Time is VIRTUAL inside measured windows: t advances by cfg.dt (default 1/60 s) per frame, so the Character's
// fixed 60 Hz simulation runs one step per frame like on a 60 fps device, however slow SwiftShader renders.
// Numbers from SwiftShader are CPU-side only; GPU cost (skinning, fill) must come from a real device.
import * as THREE from 'three';
import type { LocationId, PlayerGameView, PublicPlayerView } from '../../packages/protocol/src/index';
import type { MemberLook, Pose, Scene3dState, Tier } from '../../apps/client/src/game3d/contract';
import { createEngineHost, type EngineHost } from '../../apps/client/src/game3d/vendor/engineHost';
import { buildHollowmere, groundHeight, warmWholeTown } from '../../apps/client/src/game3d/vendor/town';
import { createAvatarLayer, type AvatarLayer } from '../../apps/client/src/game3d/avatars/layer';
import { fallbackView } from '../../apps/client/src/game3d/avatars/project';
import { createOverlayLayer, type OverlayLayer } from '../../apps/client/src/game3d/overlay/index';
import { createStore, Emitter } from '../../apps/client/src/net/store';
import { voicePresence } from '../../apps/client/src/voice/VoiceClient';

type Json = Record<string, unknown>;

/** 15 distinct shipped specs: 8 'clips' ghosts, 6 'shared' ghosts, the storyteller ('tint'). */
export const MIX15 = ['frog', 'fox', 'owl', 'crow', 'moth', 'goat', 'rabbit', 'toad', 'cilantro', 'clarabelle', 'opal', 'progress', 'requin', 'mincut', 'storyteller'];
const BILLBOARD15 = Array.from({ length: 15 }, (_, i) => (i % 2 ? 'nicksong' : 'brianbi'));
const SAME15 = Array.from({ length: 15 }, () => 'frog');

export interface Cfg {
  tier: Tier;
  /** measured frames per window */
  frames: number;
  /** virtual seconds per frame */
  dt: number;
  /** overlay on (labels for every player) */
  overlay: boolean;
  /** cost(): which groups to run */
  groups: string[];
  /** churn(): rounds */
  rounds: number;
  /** cost(): talkers for the FX-canvas window */
  talkers: number;
  /** camera view height (m): 19 = the vote framing on the plaza */
  viewHeight: number;
  /** settle() / unmeasured waits: render only every n-th frame (and whenever an avatar was added to the scene) —
   *  builds are paced by animation frames, not renders, and a SwiftShader render is slow */
  settleRenderEvery: number;
  /**
   * A/B of the PROPOSED engineHost dispose fix, applied from outside (engineHost.ts is not edited here):
   *  'none'     = today's dispose;
   *  'listener' = also remove the window listeners added while the Engine was constructed (the vendor's
   *               un-removable `resize` arrow function, which keeps every destroyed engine reachable);
   *  'full'     = 'listener' + null every own field of the engine and drop the shadowed `resize` closure (it closes
   *               over createEngineHost's whole context: canvas, parent, ResizeObserver, host).
   */
  leakfix: 'none' | 'listener' | 'full';
}
const DEFAULTS: Cfg = { tier: 'low', frames: 60, dt: 1 / 60, overlay: true, groups: ['empty', 'rig1', 'rig5', 'rig15', 'ghost15', 'same15', 'billboard15'], rounds: 5, talkers: 5, viewHeight: 19, settleRenderEvery: 8, leakfix: 'none' };

interface Rig {
  host: EngineHost;
  /** window listeners added during `new Engine` (leakfix) */
  ctorListeners: [string, EventListenerOrEventListenerObject, unknown][];
  leakfix: Cfg['leakfix'];
  engine: EngineHost['engine'];
  parent: HTMLElement;
  layer: AvatarLayer;
  overlay: OverlayLayer | null;
  /** the overlay's View3d (fallbackView: frame() once per frame, after the render) */
  ovView: { frame(): void } | null;
  state: Scene3dState;
  members: Map<string, MemberLook>;
  remotes: Map<string, Pose>;
  players: PublicPlayerView[];
  lobbyView: ReturnType<typeof createStore<unknown>>;
  t: number;
  /** scene child count at the last frame (sparse frames render when an avatar holder was added) */
  lastKids: number;
  sparseNo: number;
  walking: boolean;
  angle: number;
  /** ms spent in layer.update / renderNow / overlay (update + flush) per frame of the last window */
  rec: { upd: number[]; ren: number[]; ovl: number[]; heap: number[]; calls: number[]; tris: number[]; pre: number[] } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise<number>((r) => requestAnimationFrame(r));
const q = (v: number[], p: number) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]! * 100) / 100;
};
const mean = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : 0);
const heapNow = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
const gc = () => (window as unknown as { gc?: () => void }).gc?.();

// long tasks (rig builds, shader compiles) while characters come in
const longTasks: number[] = [];
let longOn = false;
try {
  new PerformanceObserver((l) => {
    if (longOn) for (const e of l.getEntries()) longTasks.push(Math.round(e.duration));
  }).observe({ type: 'longtask', buffered: false });
} catch {
  /* no longtask API */
}

/** The plaza ring the 15 stand on (v2 px): the voting circle of Hollowmere (square cx 360, cy 364, r 144 px). */
function ringPos(layout: Scene3dState['layout'], i: number, n: number, a0 = 0): { x: number; y: number } {
  const sq = (layout as unknown as { square: { cx: number; cy: number; r: number } }).square;
  const a = a0 + (i / Math.max(1, n)) * Math.PI * 2;
  const r = sq.r * 0.7;
  return { x: sq.cx + Math.sin(a) * r, y: sq.cy + Math.cos(a) * r };
}

async function mountRig(parentEl: HTMLElement, cfg: Cfg): Promise<Rig> {
  const parent = document.createElement('div');
  parent.className = 'ct-game-canvas';
  parent.style.cssText = 'position:relative;width:960px;height:540px;overflow:hidden';
  parentEl.appendChild(parent);
  const ctorListeners: [string, EventListenerOrEventListenerObject, unknown][] = [];
  let host: EngineHost;
  if (cfg.leakfix !== 'none') {
    // capture what the Engine constructor (and the host) add to window, to remove it on unmount
    const orig = window.addEventListener;
    window.addEventListener = function (this: Window, type: string, fn: EventListenerOrEventListenerObject, o?: unknown) {
      ctorListeners.push([type, fn, o]);
      return orig.call(this, type, fn, o as AddEventListenerOptions);
    } as typeof window.addEventListener;
    try {
      host = createEngineHost(parent, { tier: cfg.tier, fpsLimit: 0 });
    } finally {
      window.addEventListener = orig;
    }
  } else host = createEngineHost(parent, { tier: cfg.tier, fpsLimit: 0 });
  const engine = host.engine;
  // the vendor Engine class (for the runner's retained-shell count: Engine.constructor's window 'resize' listener
  // can never be removed, so every destroyed engine stays reachable as a shell)
  (window as unknown as { __v3protos: Record<string, object> }).__v3protos.Engine ??= Object.getPrototypeOf(engine) as object;
  const town = await buildHollowmere(engine, { quality: cfg.tier });
  host.installRuntimeOpts();
  const heightAt = groundHeight(town);
  const layout = (await import('../../packages/assets/src/hollowmere/layoutV3')).townLayoutV3 as unknown as Scene3dState['layout'];
  const members = new Map<string, MemberLook>();
  const remotes = new Map<string, Pose>();
  const players: PublicPlayerView[] = [];
  const game = {
    kind: 'player',
    phase: 'day',
    dayNumber: 1,
    phaseEndsAt: null,
    players,
    you: { pid: 'me', seat: 0, alive: true, ghostVoteAvailable: true, canNominate: true, role: null },
    day: { nominationsOpen: true, nominations: [], onTheBlock: null, executedSeat: null },
    prompts: [],
    info: [],
    announcements: [],
    storytellerVisitingYou: false,
    result: null,
  } as unknown as PlayerGameView;
  const state: Scene3dState = {
    me: null, // the viewer is a spectator-like camera on the plaza: every measured avatar is a remote
    myPid: 'me',
    amStoryteller: false,
    remotes,
    members,
    game,
    phase: 'day',
    layout,
    world: 'v3',
    tier: cfg.tier,
    reducedMotion: false,
    hour: 12,
  };
  const layer = createAvatarLayer({ engine, tier: cfg.tier, heightAt, lights: null, npcs: false, self: false });
  const sq = (layout as unknown as { square: { cx: number; cy: number } }).square;
  engine.camera.set({ target: new THREE.Vector3(sq.cx / 16, 0, sq.cy / 16), yaw: 0, pitch: Math.PI / 6, viewHeight: cfg.viewHeight });
  const lobbyView = createStore<unknown>({ youPid: 'me', members: [] });
  let overlay: OverlayLayer | null = null;
  let ovView: { frame(): void } | null = null;
  if (cfg.overlay) {
    const view = fallbackView(engine, layout, () => heightAt);
    ovView = view;
    const events = new Emitter<Record<string, unknown>>();
    const conn = { events, lobbyView, gameView: createStore<unknown>(null), send: () => undefined };
    overlay = createOverlayLayer({
      parent,
      surface: engine.renderer.domElement,
      conn: conn as never,
      view,
      avatars: layer.registry,
      pixelScale: () => engine.pixelScale,
      socialHook: false,
    });
  }
  host.renderNow(0);
  warmWholeTown(engine);
  return { host, ctorListeners, leakfix: cfg.leakfix, engine, parent, layer, overlay, ovView, state, members, remotes, players, lobbyView, t: 1, lastKids: -1, sparseNo: 0, walking: false, angle: 0, rec: null };
}

/** One frame: avatars (+ overlay) update, render, overlay flush; timed when a window is recording. */
function step(r: Rig, cfg: Cfg, render = true): void {
  r.t += cfg.dt;
  if (r.walking) {
    // everyone walks the ring at ~5 m/s (80 px/s, the v3 game speed option Q1a)
    const n = r.remotes.size;
    const sq = (r.state.layout as unknown as { square: { r: number } }).square;
    r.angle += (80 * cfg.dt) / (sq.r * 0.7);
    let i = 0;
    for (const p of r.remotes.values()) {
      const nx = ringPos(r.state.layout, i++, n, r.angle);
      const dx = nx.x - p.x;
      const dy = nx.y - p.y;
      p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      p.x = nx.x;
      p.y = nx.y;
      p.moving = true;
    }
  }
  const h0 = r.rec ? heapNow() : 0;
  const a = performance.now();
  r.layer.update(r.state, r.t, cfg.dt);
  const b = performance.now();
  r.overlay?.update(r.state, r.t, cfg.dt);
  if (render) r.host.renderNow(r.t);
  const c = performance.now();
  r.ovView?.frame();
  r.overlay?.flush();
  const d = performance.now();
  if (r.rec) {
    r.rec.upd.push(b - a);
    r.rec.ren.push(c - b);
    r.rec.ovl.push(d - c); // update() only queues; the flush is the overlay's per-frame work
    const h1 = heapNow();
    r.rec.heap.push(h1 > h0 ? h1 - h0 : 0);
    // calls / tris of THIS frame (the high tier's water reflection renders at 30 Hz: every other 60 Hz frame differs)
    const ri = r.engine.renderer.info.render;
    r.rec.calls.push(ri.calls);
    r.rec.tris.push(ri.triangles);
    r.rec.pre.push(((r.engine.pipeline as unknown as { stageCalls?: { preRender?: number } }).stageCalls?.preRender) ?? 0);
  }
}

async function frames(r: Rig, cfg: Cfg, n: number, sparse = false): Promise<void> {
  for (let i = 0; i < n; i++) {
    const kids = r.engine.scene.children.length;
    const render = !sparse || ++r.sparseNo % Math.max(1, cfg.settleRenderEvery) === 0 || kids !== r.lastKids;
    r.lastKids = kids;
    step(r, cfg, render);
    await raf();
  }
}

function setPlayers(r: Rig, ids: readonly string[]): void {
  r.remotes.clear();
  r.members.clear();
  r.players.length = 0;
  const lv: { pid: string; displayName: string; role: string; seat: number | null }[] = [{ pid: 'me', displayName: 'Viewer', role: 'player', seat: null }];
  ids.forEach((id, i) => {
    const pid = `p${i}`;
    const st = id === 'storyteller';
    r.members.set(pid, { name: `${id}-${i}`, castId: id, seat: st ? null : i, role: st ? 'storyteller' : 'player' });
    const p = ringPos(r.state.layout, i, ids.length, r.angle);
    r.remotes.set(pid, { pid, x: p.x, y: p.y, location: 'outdoors' as LocationId, facing: 'down', moving: false });
    if (!st) r.players.push({ pid, seat: i, name: pid, alive: true, ghostVoteAvailable: true, nominatedToday: false, wasNominatedToday: false, connected: true } as PublicPlayerView);
    lv.push({ pid, displayName: `${id}-${i}`, role: st ? 'storyteller' : 'player', seat: st ? null : i });
  });
  r.lobbyView.set({ youPid: 'me', members: lv });
}

/** Run frames until every player has a body (or failed); returns build stats. */
async function settle(r: Rig, cfg: Cfg, limitMs = 600_000): Promise<Json> {
  longTasks.length = 0;
  longOn = true;
  const t0 = performance.now();
  const p0 = r.engine.renderer.info.programs?.length ?? 0;
  const frameMs: number[] = [];
  await frames(r, cfg, 1);
  while (!r.layer.settled() && performance.now() - t0 < limitMs) {
    const a = performance.now();
    await frames(r, cfg, 1, true);
    frameMs.push(performance.now() - a);
  }
  await frames(r, cfg, 3); // first updates + first render of the last body (rendered: compiles land here at the latest)
  longOn = false;
  const list = (r.layer.debug!().avatars3d as () => Json[])();
  return {
    settled: r.layer.settled(),
    wallMs: Math.round(performance.now() - t0),
    framesWhileBuilding: frameMs.length,
    maxFrameMs: Math.round(Math.max(0, ...frameMs)),
    longTasks: { n: longTasks.length, maxMs: Math.max(0, ...longTasks), sumMs: longTasks.reduce((a, b) => a + b, 0) },
    programsAdded: (r.engine.renderer.info.programs?.length ?? 0) - p0,
    failed: list.filter((e) => e.failed).map((e) => e.cast),
    kinds: list.reduce<Record<string, number>>((m, e) => ((m[String(e.kind)] = (m[String(e.kind)] ?? 0) + 1), m), {}),
  };
}

function sceneStats(r: Rig): Json {
  let meshes = 0;
  let skinned = 0;
  let bones = 0;
  let tris = 0;
  let points = 0;
  const perSpec: Record<string, { tris: number; bones: number; meshes: number }> = {};
  for (const c of r.engine.scene.children) {
    if (!c.name.startsWith('avatar:')) continue;
    const spec = (perSpec[c.name.slice(7)] ??= { tris: 0, bones: 0, meshes: 0 });
    const t0 = tris;
    const b0 = bones;
    const m0 = meshes;
    c.traverse((o) => {
      const m = o as THREE.Mesh & THREE.SkinnedMesh;
      if ((o as THREE.Points).isPoints) points++;
      if (!m.isMesh) return;
      meshes++;
      if (m.isSkinnedMesh) {
        skinned++;
        bones += m.skeleton?.bones.length ?? 0;
      }
      const g = m.geometry;
      tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    });
    // per spec (one avatar of it; the same for every instance)
    spec.tris = Math.round(tris - t0);
    spec.bones = bones - b0;
    spec.meshes = meshes - m0;
  }
  return { avatarMeshes: meshes, skinned, bones, avatarTris: Math.round(tris), points, perSpec };
}

/** One measured window of cfg.frames frames. */
async function window_(r: Rig, cfg: Cfg, label: string, walking: boolean): Promise<Json> {
  r.walking = walking;
  await frames(r, cfg, 10); // warm (gait reaches its cycle, overlays placed)
  gc();
  r.rec = { upd: [], ren: [], ovl: [], heap: [], calls: [], tris: [], pre: [] };
  const o0 = r.overlay ? ((r.overlay.debug!().overlay as () => Json)() as Json) : null;
  const wall0 = performance.now();
  await frames(r, cfg, cfg.frames);
  const wall = performance.now() - wall0;
  const o1 = r.overlay ? ((r.overlay.debug!().overlay as () => Json)() as Json) : null;
  const rec = r.rec;
  r.rec = null;
  const info = r.engine.renderer.info;
  const n = cfg.frames;
  const per = (k: string) => (o0 && o1 ? Math.round((((o1[k] as number) - (o0[k] as number)) / n) * 100) / 100 : null);
  const res = {
    label,
    walking,
    players: r.remotes.size,
    updateMs: { mean: mean(rec.upd), p50: q(rec.upd, 0.5), p95: q(rec.upd, 0.95) },
    renderCpuMs: { mean: mean(rec.ren), p50: q(rec.ren, 0.5), p95: q(rec.ren, 0.95) },
    overlayMs: { mean: mean(rec.ovl), p50: q(rec.ovl, 0.5), p95: q(rec.ovl, 0.95) },
    // per frame: what the overlay wrote (transforms / visibility / content writes)
    overlayWritesPerFrame: o1 ? { transforms: per('transforms'), visibility: per('visibility'), content: per('content'), labels: o1.labels } : null,
    allocKiBPerFrame: Math.round(rec.heap.reduce((a, b) => a + b, 0) / n / 102.4) / 10,
    calls: info.render.calls,
    tris: info.render.triangles,
    // per-frame means / max over the window (calls / tris above = the last frame only)
    callsMean: mean(rec.calls),
    callsMax: Math.max(0, ...rec.calls),
    trisMean: Math.round(mean(rec.tris)),
    preRenderCallsMean: mean(rec.pre),
    stageCalls: { ...((r.engine.pipeline as unknown as { stageCalls?: Json }).stageCalls ?? {}) },
    programs: info.programs?.length ?? null,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    scene: sceneStats(r),
    wallFps: Math.round((n / (wall / 1000)) * 10) / 10,
  };
  return res;
}

let current: Rig | null = null;
const root = (): HTMLElement => {
  let el = document.getElementById('v3perf-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'v3perf-root';
    document.body.appendChild(el);
  }
  return el;
};

async function cost(partial: Partial<Cfg>): Promise<Json> {
  const cfg = { ...DEFAULTS, ...partial };
  const r = await mountRig(root(), cfg);
  const out: Json = { cfg, gpu: (window as unknown as { __pixel?: { gpu?: unknown } }).__pixel?.gpu ?? null, pixelScale: r.engine.pixelScale, lowW: r.engine.lowW, lowH: r.engine.lowH, groups: {} };
  const groups = out.groups as Record<string, Json>;
  const want = (g: string) => cfg.groups.includes(g);
  try {
    if (want('empty')) {
      setPlayers(r, []);
      groups.empty = { idle: await window_(r, cfg, 'empty', false) };
    }
    for (const [g, n] of [['rig1', 1], ['rig5', 5], ['rig15', 15]] as const) {
      if (!want(g)) continue;
      setPlayers(r, MIX15.slice(0, n));
      const build = await settle(r, cfg);
      groups[g] = { build, idle: await window_(r, cfg, `${g}-idle`, false), walk: await window_(r, cfg, `${g}-walk`, true) };
      if (g === 'rig15' && r.overlay && cfg.talkers > 0) {
        // FX canvas: talking glyph + ripple for `talkers` players (labels.ts reads voicePresence.speaking)
        voicePresence.set({ ...voicePresence.get(), speaking: [...r.remotes.keys()].slice(0, cfg.talkers) });
        groups[g]!.talking = await window_(r, cfg, `${g}-talk${cfg.talkers}`, true);
        voicePresence.set({ ...voicePresence.get(), speaking: [] });
      }
    }
    if (want('ghost15')) {
      if (r.remotes.size !== 15 || !want('rig15')) {
        setPlayers(r, MIX15);
        await settle(r, cfg);
      }
      for (const [i, p] of r.players.entries()) {
        p.alive = false;
        p.ghostVoteAvailable = i % 2 === 0;
      }
      await frames(r, cfg, Math.ceil(2 / cfg.dt), true); // the 1.5 s collapse
      groups.ghost15 = { idle: await window_(r, cfg, 'ghost15-idle', false), walk: await window_(r, cfg, 'ghost15-walk', true) };
      for (const p of r.players) p.alive = true;
      const rebuild = await settle(r, cfg); // 'clips' bodies are rebuilt on revival
      groups.ghost15.revive = rebuild;
    }
    if (want('same15')) {
      setPlayers(r, []);
      await frames(r, cfg, 3);
      setPlayers(r, SAME15);
      const build = await settle(r, cfg);
      groups.same15 = { build, idle: await window_(r, cfg, 'same15-idle', false), walk: await window_(r, cfg, 'same15-walk', true) };
    }
    if (want('billboard15')) {
      setPlayers(r, []);
      await frames(r, cfg, 3);
      setPlayers(r, BILLBOARD15);
      const build = await settle(r, cfg);
      groups.billboard15 = { build, idle: await window_(r, cfg, 'billboard15-idle', false), walk: await window_(r, cfg, 'billboard15-walk', true) };
    }
  } finally {
    unmountRig(r);
  }
  return out;
}

async function churn(partial: Partial<Cfg>): Promise<Json> {
  const cfg = { ...DEFAULTS, ...partial };
  const r = await mountRig(root(), cfg);
  const rounds: Json[] = [];
  const snap = (label: string) => {
    gc();
    const i = r.engine.renderer.info;
    return { label, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? null, heapMiB: Math.round(heapNow() / 104857.6) / 10, sceneChildren: r.engine.scene.children.length, domNodes: document.getElementsByTagName('*').length };
  };
  try {
    setPlayers(r, []);
    await frames(r, cfg, 5);
    const base = snap('base');
    for (let k = 0; k < cfg.rounds; k++) {
      // alternate the casts so every round also exercises "a different spec arrives"
      const ids = k % 2 ? [...MIX15].reverse() : MIX15;
      setPlayers(r, ids);
      const build = await settle(r, cfg);
      await frames(r, cfg, 20);
      const full = snap(`round${k}-full`);
      setPlayers(r, []);
      await frames(r, cfg, 10);
      rounds.push({ build: { wallMs: build.wallMs, programsAdded: build.programsAdded, longTasks: build.longTasks }, full, empty: snap(`round${k}-empty`) });
    }
    return { cfg, base, rounds };
  } finally {
    unmountRig(r);
  }
}

function unmountRig(r: Rig): void {
  voicePresence.set({ ...voicePresence.get(), speaking: [] });
  r.overlay?.destroy();
  r.layer.destroy();
  r.host.dispose();
  if (r.leakfix !== 'none') {
    for (const [type, fn, o] of r.ctorListeners) window.removeEventListener(type, fn, o as EventListenerOptions);
    r.ctorListeners.length = 0;
  }
  if (r.leakfix === 'full') {
    const e = r.engine as unknown as Record<string, unknown>;
    for (const k of Object.keys(e)) if (k !== '__ctDisposed') e[k] = null;
    e.resize = () => undefined;
  }
  r.parent.remove();
}

/** The runner's lobby-switch cycle: mount one lobby (15 players, settled, walking a bit). */
async function mount(partial: Partial<Cfg>): Promise<Json> {
  const cfg = { ...DEFAULTS, ...partial };
  if (current) unmountRig(current);
  const t0 = performance.now();
  const r = await mountRig(root(), cfg);
  current = r;
  setPlayers(r, MIX15);
  const build = await settle(r, cfg);
  r.walking = true;
  await frames(r, cfg, 30);
  r.walking = false;
  const i = r.engine.renderer.info;
  return { mountMs: Math.round(performance.now() - t0), build, live: { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? null, calls: i.render.calls } };
}

/** After mount(): `n` walking frames of the mounted lobby (the runner wraps them in a CPU profile). */
async function walk(n: number, partial: Partial<Cfg> = {}): Promise<Json> {
  if (!current) return { walked: 0 };
  const cfg = { ...DEFAULTS, ...partial };
  current.walking = true;
  const t0 = performance.now();
  await frames(current, cfg, n);
  current.walking = false;
  return { walked: n, wallMs: Math.round(performance.now() - t0) };
}

async function unmount(): Promise<Json> {
  if (!current) return { unmounted: false };
  const r = current;
  current = null;
  unmountRig(r);
  await sleep(50);
  return { unmounted: true, pixelGlobal: !!(window as unknown as { __pixel?: unknown }).__pixel, canvases: document.getElementsByTagName('canvas').length, overlayRoots: document.querySelectorAll('.ct-v3-overlay').length };
}

// prototypes for the runner's Runtime.queryObjects (retained-object counts after GC)
(window as unknown as { __v3protos: Record<string, object> }).__v3protos = {
  WebGLRenderer: THREE.WebGLRenderer.prototype,
  Scene: THREE.Scene.prototype,
  SkinnedMesh: THREE.SkinnedMesh.prototype,
  Mesh: THREE.Mesh.prototype,
  BufferGeometry: THREE.BufferGeometry.prototype,
  Material: THREE.Material.prototype,
  Texture: THREE.Texture.prototype,
  WebGLRenderTarget: THREE.WebGLRenderTarget.prototype,
  Skeleton: THREE.Skeleton.prototype,
  HTMLCanvasElement: HTMLCanvasElement.prototype,
  WebGL2RenderingContext: WebGL2RenderingContext.prototype,
  CanvasRenderingContext2D: CanvasRenderingContext2D.prototype,
  ResizeObserver: ResizeObserver.prototype,
  HTMLImageElement: HTMLImageElement.prototype,
};
(window as unknown as { __v3chars: unknown }).__v3chars = { cost, churn, mount, walk, unmount, ready: true };
