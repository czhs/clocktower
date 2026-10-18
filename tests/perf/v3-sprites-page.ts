// v3.3 sprites prototype bench, BROWSER side (loaded from the Vite DEV server through /@fs/, never in the app or
// dist/; runner: tests/perf/v3-sprites.mjs). Mounts the real engine + Hollowmere town + avatar layer (no
// TownGame3d, no server) on a scripted Scene3dState and compares the two character paths on the SAME engine:
//   rigs    (today: one vendor skinned rig per player)
//   sprites (ct.debug.v3sprites=1: baked atlas + one camera-facing quad per player, avatars/sprites/)
// window.__v3spr = { mount, layer, settle, cost, still, ghosts, talk, info, ready }.
import * as THREE from 'three';
import type { PlayerGameView, PublicPlayerView } from '../../packages/protocol/src/index';
import type { MemberLook, Pose, Scene3dState, Tier } from '../../apps/client/src/game3d/contract';
import { createEngineHost, type EngineHost } from '../../apps/client/src/game3d/vendor/engineHost';
import { buildHollowmere, groundHeight, warmWholeTown, type TodPreset } from '../../apps/client/src/game3d/vendor/town';
import { createAvatarLayer, type AvatarLayer } from '../../apps/client/src/game3d/avatars/layer';

type Json = Record<string, unknown>;
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const mean = (v: number[]) => (v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : 0);
const pct = (v: number[], q: number) => (v.length ? +[...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * q))]!.toFixed(3) : 0);
const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;

const longTasks: number[] = [];
let longOn = false;
try {
  new PerformanceObserver((l) => {
    if (longOn) for (const e of l.getEntries()) longTasks.push(Math.round(e.duration));
  }).observe({ type: 'longtask', buffered: false });
} catch {
  /* none */
}

interface M {
  host: EngineHost;
  engine: EngineHost['engine'];
  heightAt: (x: number, z: number) => number;
  layer: AvatarLayer | null;
  state: Scene3dState;
  members: Map<string, MemberLook>;
  remotes: Map<string, Pose>;
  players: PublicPlayerView[];
  t: number;
  walking: boolean;
  angle: number;
  ids: string[];
  tier: Tier;
}
let m: M | null = null;

function ring(layout: Scene3dState['layout'], i: number, n: number, a0: number, rk = 0.55): { x: number; y: number } {
  const sq = (layout as unknown as { square: { cx: number; cy: number; r: number } }).square;
  const a = a0 + (i / Math.max(1, n)) * Math.PI * 2;
  return { x: sq.cx + Math.sin(a) * sq.r * rk, y: sq.cy + Math.cos(a) * sq.r * rk };
}

async function mount(cfg: { tier?: Tier; tod?: TodPreset; w?: number; h?: number; viewHeight?: number }): Promise<Json> {
  if (m) {
    m.layer?.destroy();
    m.host.dispose();
    document.body.innerHTML = '';
    m = null;
  }
  const tier = cfg.tier ?? 'low';
  const parent = document.createElement('div');
  parent.className = 'ct-game-canvas';
  parent.style.cssText = `position:relative;width:${cfg.w ?? 1280}px;height:${cfg.h ?? 720}px;overflow:hidden`;
  document.body.appendChild(parent);
  const host = createEngineHost(parent, { tier, fpsLimit: 0 });
  const engine = host.engine;
  const town = await buildHollowmere(engine, { quality: tier, tod: cfg.tod ?? 'noon', lights: 8 });
  host.installRuntimeOpts();
  const heightAt = groundHeight(town);
  const layout = (await import('../../packages/assets/src/hollowmere/layoutV3')).townLayoutV3 as unknown as Scene3dState['layout'];
  const members = new Map<string, MemberLook>();
  const remotes = new Map<string, Pose>();
  const players: PublicPlayerView[] = [];
  const game = {
    kind: 'player', phase: 'day', dayNumber: 1, phaseEndsAt: null, players,
    you: { pid: 'me', seat: 0, alive: true, ghostVoteAvailable: true, canNominate: true, role: null },
    day: { nominationsOpen: true, nominations: [], onTheBlock: null, executedSeat: null },
    prompts: [], info: [], announcements: [], storytellerVisitingYou: false, result: null,
  } as unknown as PlayerGameView;
  const state: Scene3dState = { me: null, myPid: 'me', amStoryteller: false, remotes, members, game, phase: 'day', layout, world: 'v3', tier, reducedMotion: false, hour: cfg.tod === 'night' ? 23 : 12 };
  const sq = (layout as unknown as { square: { cx: number; cy: number } }).square;
  engine.camera.set({ target: new THREE.Vector3(sq.cx / 16, 0, sq.cy / 16), yaw: 0, pitch: Math.PI / 6, viewHeight: cfg.viewHeight ?? 12 });
  host.renderNow(0);
  warmWholeTown(engine);
  m = { host, engine, heightAt, layer: null, state, members, remotes, players, t: 1, walking: false, angle: 0, ids: [], tier };
  const gl = engine.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { tier, pixelScale: engine.pixelScale, lowW: engine.lowW, lowH: engine.lowH, texel: +engine.camera.texelWorld.toFixed(5), gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?' };
}

/** A fresh avatar layer in rig or sprite mode with these cast specs on a ring around the square. */
async function layer(cfg: { sprites: boolean; ids: string[]; rk?: number }): Promise<Json> {
  const r = m!;
  r.layer?.destroy();
  try {
    if (cfg.sprites) localStorage.setItem('ct.debug.v3sprites', '1');
    else localStorage.removeItem('ct.debug.v3sprites');
  } catch {
    /* none */
  }
  r.layer = createAvatarLayer({ engine: r.engine, tier: r.tier, heightAt: r.heightAt, lights: null, npcs: false, self: false });
  r.remotes.clear();
  r.members.clear();
  r.players.length = 0;
  r.ids = cfg.ids;
  r.angle = 0;
  cfg.ids.forEach((id, i) => {
    const pid = `p${i}`;
    r.members.set(pid, { name: `${id}-${i}`, castId: id, seat: i, role: 'player' });
    const p = ring(r.state.layout, i, cfg.ids.length, 0, cfg.rk);
    r.remotes.set(pid, { pid, x: p.x, y: p.y, location: 'outdoors', facing: 'down', moving: false });
    r.players.push({ pid, seat: i, name: pid, alive: true, ghostVoteAvailable: true, nominatedToday: false, wasNominatedToday: false, connected: true } as PublicPlayerView);
  });
  return { sprites: cfg.sprites, n: cfg.ids.length };
}

function step(render = true, dt = 1 / 60): { upd: number; ren: number } {
  const r = m!;
  r.t += dt;
  if (r.walking) {
    const sq = (r.state.layout as unknown as { square: { r: number } }).square;
    r.angle += (150 * dt) / (sq.r * 0.55); // PLAYER_SPEED 150 px/s
    let i = 0;
    for (const p of r.remotes.values()) {
      const nx = ring(r.state.layout, i++, r.remotes.size, r.angle);
      p.facing = Math.abs(nx.x - p.x) > Math.abs(nx.y - p.y) ? (nx.x > p.x ? 'right' : 'left') : nx.y > p.y ? 'down' : 'up';
      p.x = nx.x;
      p.y = nx.y;
      p.moving = true;
    }
  } else for (const p of r.remotes.values()) p.moving = false;
  const a = performance.now();
  r.layer!.update(r.state, r.t, dt);
  const b = performance.now();
  if (render) r.host.renderNow(r.t);
  const c = performance.now();
  return { upd: b - a, ren: c - b };
}

async function settle(limitMs = 300_000): Promise<Json> {
  const r = m!;
  longTasks.length = 0;
  longOn = true;
  const h0 = heap();
  const p0 = r.engine.renderer.info.programs?.length ?? 0;
  const t0 = performance.now();
  const frameMs: number[] = [];
  step();
  await raf();
  while (!r.layer!.settled() && performance.now() - t0 < limitMs) {
    const a = performance.now();
    step();
    await raf();
    frameMs.push(performance.now() - a);
  }
  for (let i = 0; i < 4; i++) {
    step();
    await raf();
  }
  longOn = false;
  const dbg = r.layer!.debug!() as Record<string, (...a: unknown[]) => unknown>;
  const list = dbg.avatars3d!() as Json[];
  const spr = dbg.sprites ? await (dbg.sprites() as Promise<Json>) : null;
  const mem = r.engine.renderer.info.memory;
  return {
    wallMs: Math.round(performance.now() - t0),
    frames: frameMs.length,
    maxFrameMs: Math.round(Math.max(0, ...frameMs)),
    longTasks: { n: longTasks.length, max: Math.max(0, ...longTasks), sum: longTasks.reduce((a, b) => a + b, 0) },
    programsAdded: (r.engine.renderer.info.programs?.length ?? 0) - p0,
    heapDeltaMiB: +((heap() - h0) / 1048576).toFixed(1),
    geometries: mem.geometries,
    textures: mem.textures,
    kinds: list.reduce<Record<string, number>>((acc, e) => ((acc[String(e.texture).split(':')[0]!] = (acc[String(e.texture).split(':')[0]!] ?? 0) + 1), acc), {}),
    failed: list.filter((e) => e.failed).map((e) => e.cast),
    sprites: spr,
  };
}

/** n frames timed (virtual 60 Hz). uncapped = no rAF wait between frames, gl.finish() each frame (GPU-inclusive). */
async function cost(cfg: { frames?: number; walking: boolean; uncapped?: boolean }): Promise<Json> {
  const r = m!;
  r.walking = cfg.walking;
  for (let i = 0; i < 20; i++) {
    step();
    await raf();
  }
  const n = cfg.frames ?? 120;
  const upd: number[] = [];
  const ren: number[] = [];
  const wall: number[] = [];
  const calls: number[] = [];
  const tris: number[] = [];
  const gl = r.engine.renderer.getContext();
  const px = new Uint8Array(4);
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    const s = step();
    if (cfg.uncapped) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // sync: the frame's GPU work done
    wall.push(performance.now() - a);
    upd.push(s.upd);
    ren.push(s.ren);
    calls.push(r.engine.renderer.info.render.calls);
    tris.push(r.engine.renderer.info.render.triangles);
    if (!cfg.uncapped || i % 30 === 29) await raf();
  }
  r.walking = false;
  return { walking: cfg.walking, uncapped: !!cfg.uncapped, updMs: mean(upd), updP95: pct(upd, 0.95), renderMs: mean(ren), renderP95: pct(ren, 0.95), frameMs: mean(wall), frameP95: pct(wall, 0.95), calls: mean(calls), tris: Math.round(mean(tris)) };
}

/** Render one still (canvas PNG data URL) + every avatar's frame name. pin = spec -> vendor drawing (sprites). */
async function still(cfg: { pin?: Record<string, string> | null; walking?: boolean; frames?: number; t?: number }): Promise<Json> {
  const r = m!;
  // the town's own animation (grass wind, clouds, water) must be identical between the rig and sprite stills
  r.t = (cfg.t ?? 500) - (cfg.frames ?? 30) / 60;
  r.angle = 0.3;
  const spr = (await import('../../apps/client/src/game3d/avatars/sprites/spriteBody')).spriteDebug;
  spr.force = cfg.pin ?? {};
  r.walking = !!cfg.walking;
  for (let i = 0; i < (cfg.frames ?? 30); i++) {
    step();
    await raf();
  }
  r.walking = false;
  const dbg = r.layer!.debug!() as Record<string, (...a: unknown[]) => unknown>;
  step(false, 0);
  r.host.renderNow(r.t);
  const url = r.engine.renderer.domElement.toDataURL('image/png');
  const list = (dbg.avatars3d!() as Json[]).map((e) => ({ key: e.key, cast: e.cast, frame: e.frame, texture: e.texture }));
  spr.force = {};
  return { url, avatars: list };
}

function ghosts(cfg: { dead: boolean; ghostVote?: boolean }): Json {
  for (const p of m!.players) {
    p.alive = !cfg.dead;
    p.ghostVoteAvailable = cfg.ghostVote ?? true;
  }
  return { dead: cfg.dead };
}

function talk(cfg: { on: boolean; n?: number }): Json {
  let i = 0;
  for (const pid of m!.remotes.keys()) if (i++ < (cfg.n ?? 99)) m!.layer!.setTalking!(pid, cfg.on);
  return { talking: cfg.on };
}

function info(): Json {
  const r = m!;
  return { heapMiB: +(heap() / 1048576).toFixed(1), memory: r.engine.renderer.info.memory, programs: r.engine.renderer.info.programs?.length };
}

(window as unknown as { __v3spr: unknown }).__v3spr = { mount, layer, settle, cost, still, ghosts, talk, info, ready: true };
