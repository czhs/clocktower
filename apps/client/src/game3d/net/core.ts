// v3 WP1 (v3-core). The 3D town's core: net, input, camera and debug in one object the composition root
// (TownGame3d.ts) creates once per mount (docs/v3/INTEGRATION.md §1.4, §3, §6.1, §8 WP1). It survives tier rebuilds
// and context-loss rebuilds: only the drawn scene is attached / detached around them.
//
//   const core = createCore3d({ bridge, layout, world, tier, parent });
//   ... after each (re)build: core.attachScene({ host, heightAt, proxies?, interiorCamera?, stats? }); core.setLayers(layers)
//   per frame (engineHost.start): frame = (t, dtMs) => { const st = core.frame(t, dtMs); for (l of layers) l.update(st, t, dt) }
//                                 after = () => { core.afterRender(dtMs); lifecycle.frame(dtMs) }
//   before a rebuild: core.detachScene();  on destroy: core.destroy()
//
// What it does each frame: own avatar (prediction / server walk / routes / doors, net/local.ts), remote
// interpolation (net/remotes.ts), the door prompt and inside panel, the camera (input/camera.ts), the Scene3dState
// every layer reads, the gameplay core frame (seat markers, hands, hints, pick label; WP4 draws it), the pick
// crosshair. Input: window keys (input/keys.ts) and pointer taps on `parent` (input/pointer.ts, social first).
// Debug: window.__ctCamera (ct.debug.camera) with the layers' members merged, the ct.debug.v3perf overlay.
import type { TownLayout, WorldId, WorldSnapshot, WorldTeleport } from '@ct/protocol';
import { playCue as realPlayCue, type Cue } from '../../game/audio';
import { reducedMotion } from '../../game/fx/motion';
import { createGameplayCore, type GameplayCore, type GameplayFrame } from '../../game/gameplay/core';
import { stagePick } from '../../game/gameplay/pick';
import { castIdentity } from '../../game/rules/cast';
import { remoteEntities } from '../../net/localPlayer';
import { noteServerTime } from '../../net/serverTime';
import type { Layer3d, MemberLook, Pose, Scene3dState, Tier, TownBridge3d } from '../contract';
import { CameraRig, turnKeys, type CameraFrameInput, type Plaza, type RigHost, type RigScene } from '../input/camera';
import { createCrosshair, type Crosshair } from '../input/crosshair';
import { createKeyInput, type KeyInput, type KeyTarget } from '../input/keys';
import { createPointerInput, type PointerInput } from '../input/pointer';
import { resolveTap } from '../input/tap';
import { FrameStats } from '../debug/frameStats';
import { CAMERA_FLAG, debugFlag, installCameraHook, PERF_FLAG, type CameraHook } from '../debug/hooks';
import { createPerfOverlay, type PerfOverlay, type V3Stats } from '../debug/perfOverlay';
import type { SafeMomentInput } from '../perf';
import { createLocalController, type GameView, type LocalController, type PlacedEvent } from './local';
import { RemoteTracker, type DoorEvent, type PoofEvent } from './remotes';

export interface SceneStats {
  /** Interiors / pieces being built (WP3). */
  building?(): string[];
  /** Life piece counters (WP3, §3.1 "Life"). */
  life?(): { walkers: number; doors: number; folk: boolean } | null;
}

/** What the core needs from a (re)built scene. vendor/engineHost.ts EngineHost satisfies `host`. */
export interface SceneHooks extends RigScene {
  host: RigHost & {
    info(): { calls: number; tris: number; programs: number | null; pixelScale: number; lowW: number; lowH: number };
    gpu(): string | null;
  };
  stats?: SceneStats;
}

export interface Core3dOptions {
  bridge: TownBridge3d;
  layout: TownLayout;
  world: WorldId;
  tier: Tier;
  /** The town container (`.ct-game-canvas`): pointer input, crosshair and overlays live in it. */
  parent: HTMLElement;
  /** The square the camera rests on (default @ct/assets PLAZA; v3: townMapV3.plaza). */
  plaza?: Plaza;
  /** §3.1 phase -> hour (WP3); default noon. */
  hour?(state: Scene3dState, nowMs: number): number;
  playCue?(c: Cue): void;
  now?(): number;
  keyTarget?: KeyTarget;
}

export interface Core3dEvents {
  /** The Storyteller appears / disappears / jumps (own teleports too, as in v2). */
  poof(e: PoofEvent): void;
  /** Someone used a door (remote location changes, own door teleports). */
  door(e: DoorEvent): void;
  /** The viewer was placed / teleported (own avatar cross-fade; reason 'correction' = a snap only). */
  placed(e: PlacedEvent): void;
}

export interface Core3d {
  readonly state: Scene3dState;
  readonly view: CameraRig;
  readonly gameplay: GameplayCore;
  readonly local: LocalController;
  readonly remotes: RemoteTracker;
  readonly pointer: PointerInput;
  readonly keys: KeyInput;
  on<K extends keyof Core3dEvents>(kind: K, fn: Core3dEvents[K]): () => void;
  /** This frame's gameplay frame (seat markers, hands, vote clock, hints, pick); valid until the next frame(). */
  gameplayFrame(): GameplayFrame | null;
  /** A (re)built scene is drawn: camera, picks and debug read it from now on. */
  attachScene(scene: SceneHooks): void;
  /** Before a rebuild / teardown: nothing reads the old engine any more. */
  detachScene(): void;
  readonly attached: boolean;
  /** (Re)merge the layers' debug members into __ctCamera. */
  setLayers(layers: readonly Layer3d[]): void;
  setTier(t: Tier): void;
  /** Per frame, before the layers: net + input + camera; returns the state the layers read. */
  frame(t: number, dtMs: number): Scene3dState;
  /** Per frame, after the render: frame stats, crosshair. */
  afterRender(dtMs: number): void;
  /** __ctCamera.v3() / the perf overlay. */
  stats(): V3Stats;
  /** The safe-moment inputs (lifecycle.ts). */
  safeInput(): SafeMomentInput;
  destroy(): void;
}

export interface VoteState {
  voting: boolean;
  nominationOpen: boolean;
}

/**
 * The voting-circle camera is wanted (user request 1, §9.1): the nominations are open, or a nomination is pending /
 * being voted on, during the day. input/camera.ts applies it only while the viewer stands on the square.
 */
export function voteCameraWanted(g: GameView | null): boolean {
  if (!g || g.phase !== 'day' || !g.day) return false;
  if (g.day.nominationsOpen) return true;
  for (const n of g.day.nominations ?? []) if (n.status === 'pending' || n.status === 'voting') return true;
  return false;
}

/** Vote / nomination state of a game view (safe moment, vote framing); fills `out` when given (no allocation). */
export function voteState(g: GameView | null, out: VoteState = { voting: false, nominationOpen: false }): VoteState {
  out.voting = false;
  out.nominationOpen = false;
  for (const n of g?.day?.nominations ?? []) {
    if (n.status === 'voting') out.voting = true;
    else if (n.status === 'pending') out.nominationOpen = true;
  }
  return out;
}

export function createCore3d(o: Core3dOptions): Core3d {
  const { bridge, layout } = o;
  const conn = bridge.conn;
  const now = o.now ?? (() => performance.now());
  const playCue = o.playCue ?? realPlayCue;
  const offs: (() => void)[] = [];
  let destroyed = false;
  let lobby = conn.lobbyView.get();
  let game: GameView | null = conn.gameView.get();
  let myPid: string | null = lobby?.youPid ?? null;
  let tier = o.tier;
  let scene: SceneHooks | null = null;
  let snapCamera = true;
  let gpFrame: GameplayFrame | null = null;
  const members = new Map<string, MemberLook>();
  let membersDirty = true;

  const listeners: { [K in keyof Core3dEvents]: Set<Core3dEvents[K]> } = { poof: new Set(), door: new Set(), placed: new Set() };
  const emit = <K extends keyof Core3dEvents>(kind: K, e: Parameters<Core3dEvents[K]>[0]) => {
    for (const fn of listeners[kind] as Set<(e: unknown) => void>) {
      try {
        fn(e);
      } catch (err) {
        console.warn(`[town3d] ${kind} listener failed`, err);
      }
    }
  };

  const isStoryteller = (pid: string) => lobby?.members.find((m) => m.pid === pid)?.role === 'storyteller';
  let local: LocalController | null = null;
  const beforeLocal = { x: 0, y: 0, location: 'outdoors' as const, facing: 'down' as const };
  const remotes = new RemoteTracker({ isStoryteller, myLocation: () => local?.me.location ?? 'outdoors', ready: () => !!local?.ready });
  offs.push(remotes.on('poof', (e) => emit('poof', e)));
  offs.push(remotes.on('door', (e) => emit('door', e)));

  const gameplay = createGameplayCore({
    conn,
    myPid: () => myPid,
    me: () => local?.me ?? beforeLocal, // createGameplayCore reads me() once while it is being built
    amStoryteller: () => local?.amStoryteller() ?? false,
  });
  local = createLocalController({
    conn,
    layout,
    bridge,
    myPid: () => myPid,
    lobby: () => lobby,
    game: () => game,
    gameplay,
    occupants: (loc) => remotes.inLocation(loc),
    playCue,
    now,
    onPlaced(e) {
      snapCamera = true;
      emit('placed', e);
      // the Storyteller's own teleports get the poof (where you left, where you arrive), as in v2
      if (e.reason === 'storyteller' && myPid && local?.amStoryteller()) {
        if (e.from.location === e.to.location) emit('poof', { pid: myPid, x: e.from.x, y: e.from.y, location: e.from.location, kind: 'out' });
        emit('poof', { pid: myPid, x: e.to.x, y: e.to.y, location: e.to.location, kind: 'in' });
      }
    },
    onDoor: (e) => emit('door', e),
  });
  const me = local;

  // ------------------------------------------------------------------ network
  offs.push(
    conn.lobbyView.subscribe((v) => {
      lobby = v;
      const was = myPid;
      myPid = v?.youPid ?? myPid;
      // a snapshot before lobby:view stored our own entity as a remote: drop it silently (no duplicate, no poof)
      if (myPid && myPid !== was) remotes.forget(myPid);
      membersDirty = true;
      me.markDirty();
    }),
  );
  offs.push(
    conn.gameView.subscribe((g) => {
      game = g;
      membersDirty = true;
      me.markDirty();
    }),
  );
  offs.push(conn.events.on('world:teleport', (t: WorldTeleport) => me.onTeleport(t)));
  offs.push(
    conn.events.on('world:snapshot', (s: WorldSnapshot) => {
      noteServerTime(s.t);
      me.onSnapshot(s);
      remotes.ingestSnapshot(s, myPid, now());
      me.markDirty();
    }),
  );
  offs.push(conn.events.on('sound', (s) => playCue(s.cue as Cue)));

  // ------------------------------------------------------------------ camera + input
  const view = new CameraRig(layout, o.plaza);
  const vs: VoteState = { voting: false, nominationOpen: false };
  const camIn: CameraFrameInput = { me: null, voting: false, snap: false, still: false };
  /** The held keys turned by the camera yaw (keys stay screen-relative under the ±45° vote frame). */
  const turned = { vx: 0, vy: 0 };
  const safeIn: SafeMomentInput = { phase: 'waiting', voting: false, nominationOpen: false };
  const keys = createKeyInput(
    {
      onMoveKey: () => me.keyPressed(),
      onEscape: () => me.leave(),
      picking: () => !!stagePick.get(),
    },
    o.keyTarget,
  );
  const stView = () => me.amStoryteller() && game?.kind === 'storyteller';
  const pointer = createPointerInput(o.parent, {
    ready: () => me.ready && !!scene,
    pick(x, y) {
      if (!gameplay.isPicking()) return false;
      const w = view.screenToWorld(x, y);
      if (w) gameplay.pickAt(w.x, w.y);
      return true;
    },
    worldAt: (x, y) => view.screenToWorld(x, y),
    onTap(x, y) {
      const a = resolveTap({ layout, doors: me.doors, location: me.me.location, storyteller: stView() }, view.screenToWorld(x, y));
      switch (a.kind) {
        case 'st-building':
          conn.send('st:command', { type: 'teleport_self', to: { kind: 'building', buildingId: a.buildingId } });
          break;
        case 'st-point':
          conn.send('st:command', { type: 'teleport_self', to: { kind: 'point', x: a.x, y: a.y } });
          break;
        case 'walk':
          me.goTo({ x: a.x, y: a.y, enter: a.enter });
          break;
        case 'inside':
          me.walkInside(a.tap);
          break;
        default:
          break;
      }
    },
    onRelease: () => gameplay.releasePointer(),
  });
  let crosshair: Crosshair | null = null;
  try {
    crosshair = createCrosshair(o.parent);
  } catch {
    crosshair = null; // no DOM (tests)
  }

  // ------------------------------------------------------------------ state
  const refreshMembers = () => {
    if (!membersDirty) return;
    membersDirty = false;
    members.clear();
    for (const m of lobby?.members ?? []) {
      const c = castIdentity(m.pid, lobby, game, myPid);
      const seat = game?.players.find((p) => p.pid === m.pid)?.seat ?? m.seat;
      members.set(m.pid, { name: c.name, castId: c.id, seat, role: c.st ? 'storyteller' : 'player' });
    }
  };
  const myPose: Pose = { pid: '', x: 0, y: 0, location: 'outdoors', facing: 'down', moving: false };
  const state: Scene3dState = {
    me: null,
    myPid: null,
    amStoryteller: false,
    remotes: remotes.poses(),
    members,
    game: null,
    phase: 'waiting',
    layout,
    world: o.world,
    tier,
    reducedMotion: false,
    hour: 12,
  };
  const phase = (): Scene3dState['phase'] => game?.phase ?? (lobby?.lobby.phase === 'finished' ? 'finished' : 'waiting');
  const fillState = (nowMs: number) => {
    refreshMembers();
    if (myPid && me.ready) {
      myPose.pid = myPid;
      myPose.x = me.me.x;
      myPose.y = me.me.y;
      myPose.location = me.me.location;
      myPose.facing = me.me.facing;
      myPose.moving = me.me.moving;
      state.me = myPose;
    } else state.me = null;
    state.myPid = myPid;
    state.amStoryteller = me.amStoryteller();
    state.game = game;
    state.phase = phase();
    state.tier = tier;
    state.reducedMotion = reducedMotion();
    state.hour = o.hour ? o.hour(state, nowMs) : 12;
  };

  // ------------------------------------------------------------------ debug
  const frames = new FrameStats();
  const stats = (): V3Stats => {
    const s = scene;
    const i = s?.host.info();
    const f = frames.summary();
    return {
      ready: !!s,
      tier,
      pixelScale: i?.pixelScale ?? 0,
      calls: i?.calls ?? 0,
      tris: i?.tris ?? 0,
      programs: i?.programs ?? null,
      frameMs: { p50: f.p50, p95: f.p95 },
      gpu: s?.host.gpu() ?? null,
      building: s?.stats?.building?.() ?? [],
      life: s?.stats?.life?.() ?? null,
    };
  };
  let hook: CameraHook | null = null;
  const installHook = (layers: readonly Layer3d[]) => {
    if (hook) {
      hook.setLayers(layers);
      return;
    }
    hook = installCameraHook(
      {
        worldToScreen: (x: number, y: number, heightM = 0) => view.project({ x, y }, undefined, heightM),
        view: () => view.footprint(),
        // null until the server placed us in a drawn town (Classic installs its hook only once its scene exists;
        // the 3D build takes seconds): the v2 specs' `__ctCamera?.me()?.location` polls must not pass before
        // worldToScreen can answer
        me: () => (me.ready && scene ? { x: me.me.x, y: me.me.y, facing: me.me.facing, moving: me.me.moving, location: me.me.location } : null),
        v3: () => stats(),
      },
      layers,
      debugFlag(CAMERA_FLAG),
    );
  };
  installHook([]); // members answer null / not-ready until a scene is attached and we are placed
  let perf: PerfOverlay | null = null;
  if (debugFlag(PERF_FLAG)) {
    try {
      perf = createPerfOverlay(o.parent, () => {
        const e = scene?.host.engine;
        return { stats: stats(), frames: frames.count, size: { w: e?.width ?? 0, h: e?.height ?? 0 } };
      });
    } catch {
      perf = null;
    }
  }

  // ------------------------------------------------------------------ per frame
  let lastAt = now();
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

  const core: Core3d = {
    state,
    view,
    gameplay,
    local: me,
    remotes,
    pointer,
    keys,
    on(kind, fn) {
      const set = listeners[kind] as Set<typeof fn>;
      set.add(fn);
      return () => set.delete(fn);
    },
    gameplayFrame: () => gpFrame,
    attachScene(s) {
      scene = s;
      view.attach(s);
      snapCamera = true;
    },
    detachScene() {
      scene = null;
      view.detach();
    },
    get attached() {
      return !!scene;
    },
    setLayers(layers) {
      installHook(layers);
    },
    setTier(t) {
      tier = t;
    },
    frame(_t, _dtMs) {
      const n = now();
      const dt = Math.min(0.1, Math.max(0, (n - lastAt) / 1000));
      lastAt = n;
      if (destroyed) return state;
      const kv = keys.vector();
      const yaw = view.yaw();
      // keys stay screen-relative when the vote frame turns the camera (±45°)
      me.step(dt, yaw !== 0 && (kv.vx !== 0 || kv.vy !== 0) ? turnKeys(kv, yaw, turned) : kv);
      remotes.step(n);
      me.updateHud();
      gpFrame = gameplay.frame();
      camIn.me = me.ready ? me.me : null;
      camIn.voting = voteCameraWanted(game);
      camIn.snap = snapCamera;
      camIn.still = reducedMotion();
      view.step(dt, camIn);
      snapCamera = false;
      fillState(n);
      return state;
    },
    afterRender(dtMs) {
      if (destroyed) return;
      frames.push(dtMs, visible());
      crosshair?.update(gpFrame?.picking?.label ?? null, pointer.cursor());
    },
    stats,
    safeInput() {
      voteState(game, vs);
      safeIn.phase = phase();
      safeIn.voting = vs.voting;
      safeIn.nominationOpen = vs.nominationOpen;
      return safeIn; // reused: SafeMoment.offer reads it at once
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs.splice(0)) off();
      keys.destroy();
      pointer.destroy();
      crosshair?.destroy();
      perf?.destroy();
      hook?.uninstall();
      hook = null;
      gameplay.destroy();
      me.destroy();
      remotes.clear();
      remoteEntities.clear();
      scene = null;
      view.detach();
      for (const k of Object.keys(listeners) as (keyof Core3dEvents)[]) listeners[k].clear();
    },
  };
  return core;
}
