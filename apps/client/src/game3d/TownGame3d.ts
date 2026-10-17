// v3 WP0 (v3-lead). The 3D town's composition root (docs/v3/INTEGRATION.md §1.1, §1.4): lazy chunk
// "town3d", mounted by GameScreen instead of game/TownGame when chooseRenderer() says 'v3'.
//
//   createTownGame3d(parent, bridge, {tier}) -> { destroy() }      same bridge + handle shape as Classic
//
// WP0 STUB SCOPE (the later packages replace the marked parts; the shape stays):
//   - engine host + Hollowmere at the square at noon (vendor/engineHost.ts, vendor/town.ts stub -> WP3)
//   - own avatar = 'wanderer' with local prediction, 15 Hz moves, teleports, auto-enter doors, door prompt,
//     Escape / Leave (rules from game/rules/**; WP1 owns the full net/ + input/ adapter: routes, taps,
//     server-driven walks, interiors)
//   - remote positions interpolated into `remoteEntities` (voice / sound proximity), not drawn (WP2 draws)
//   - camera follows the player (WP1: square rest + lean, zoom ladder)
//   - window.__ctCamera {me, view, worldToScreen, v3} per §1.5 / §6.1 when ct.debug.camera = '1'
//   - Layer3d registry, empty in WP0: each package registers its layers in `LAYERS` below
//   - crash rule: a build error, a throw in the frame loop or webglcontextlost -> bridge.requestFallback('error')
//     (Classic in place); `handle.ready` resolves after the warm-up and rejects on a build crash
import * as THREE from 'three';
import { tileCenterPx, type LobbyRoomView, type LocationId, type PlayerGameView, type StorytellerGameView, type WorldSnapshot, type WorldTeleport } from '@ct/protocol';
import { localPlayer, remoteEntities } from '../net/localPlayer';
import { currentLayout, currentWorld } from '../net/layout';
import { noteServerTime } from '../net/serverTime';
import { playCue, type Cue } from '../game/audio';
import { reducedMotion } from '../game/fx/motion';
import { isTyping, keyDir, keyVector, dir8, toFacing, type Dir8 } from '../game/rules/input';
import { autoEnterDoor, doorLocked, doorPrompt, doorSpots, houseInUse, lockText, type DoorRuleCtx, type DoorSpot } from '../game/rules/doors';
import { integrateStep, interpolate, INTERP_DELAY_MS, LOCAL_PUBLISH_MS, MOVE_HZ, moveSpeed, poseChanged, pushSample, remoteDir, REMOTE_STALE_MS, wirePx, type Sample } from '../game/rules/movement';
import { BootTracker, markBooting } from './bootMark';
import { cssToRay, PX_PER_M, rayGround, worldToCss } from './coords';
import type { Layer3d, Pose, Scene3dState, Tier, TownBridge3d, TownHandle } from './contract';
import { createEngineHost, type EngineHost } from './vendor/engineHost';
import { buildHollowmere, groundHeight } from './vendor/town';
import { driveAlong, spawnCharacter, type CharacterHandle, type Track } from './vendor/characters';

/** Layers in update order. WP1-WP4 add theirs here (factories get the shared services). Empty in WP0. */
export type LayerFactory = (svc: Layer3dServices) => Layer3d;
export interface Layer3dServices {
  engine: unknown;
  bridge: TownBridge3d;
  tier: Tier;
}
const LAYERS: readonly LayerFactory[] = [];

export interface TownGame3dOptions {
  tier: Tier;
}

type GameView = PlayerGameView | StorytellerGameView;
type Phase = Scene3dState['phase'];

const STUB_CHARACTER = 'wanderer';
/** The pixel3d gameplay camera (src/town/api.js CAMERAS.gameplay). */
const VIEW_HEIGHT = 12;

export function createTownGame3d(parent: HTMLElement, bridge: TownBridge3d, opts: TownGame3dOptions): TownHandle {
  const conn = bridge.conn;
  const layout = currentLayout();
  const doors: DoorSpot[] = doorSpots(layout);
  const offs: (() => void)[] = [];
  const layers: Layer3d[] = [];
  let destroyed = false;
  let crashed = false;
  let host: EngineHost | null = null;
  let tracker: BootTracker | null = null;
  let handle: CharacterHandle | null = null;
  let track: Track | null = null;
  let heightAt: (x: number, z: number) => number = () => 0;
  let debugHook: Record<string, unknown> | null = null;

  // ------------------------------------------------------------------ state
  let lobby: LobbyRoomView | null = conn.lobbyView.get();
  let gview: GameView | null = conn.gameView.get();
  let myPid: string | null = lobby?.youPid ?? null;
  const me = { x: tileCenterPx(layout, layout.playerSpawn).x, y: tileCenterPx(layout, layout.playerSpawn).y, facing: 'down' as Pose['facing'], moving: false, location: 'outdoors' as LocationId };
  let myDir: Dir8 = 'down';
  let ready = false;
  let seq = 0;
  let fenceSeq = 0;
  let lastSent = { x: NaN, y: NaN, moving: false, facing: 'down' as Pose['facing'] };
  let lastSentAt = -Infinity;
  let enterCooldownUntil = 0;
  let resetTrack = true;
  const keys = new Set<string>();
  const remotes = new Map<string, { samples: Sample[]; location: LocationId; dir: Dir8; last: { x: number; y: number } }>();
  const lastPublish = { x: NaN, y: NaN, loc: '', at: -Infinity };
  let lastPromptKey = '';
  let flashUntil = 0;
  let lastInsideKey = '';
  /** updateInside's inputs changed (snapshot, teleport, lobby / game view) since the last check. */
  let insideDirty = true;

  const phase = (): Phase => gview?.phase ?? (lobby?.lobby.phase === 'finished' ? 'finished' : 'waiting');
  const amStoryteller = () => gview?.kind === 'storyteller' || !!lobby?.members.find((m) => m.pid === myPid && m.role === 'storyteller');
  const mySeat = () => (gview?.kind === 'player' ? gview.you.seat : (lobby?.members.find((m) => m.pid === myPid)?.seat ?? null));
  const ruleCtx = (): DoorRuleCtx => ({ layout, amStoryteller: amStoryteller(), phase: phase(), mySeat: mySeat(), override: () => null });
  const currentBuilding = () => (me.location === 'outdoors' ? undefined : layout.buildings.find((b) => `bld:${b.id}` === me.location));

  // ------------------------------------------------------------------ network
  const sendMove = (now: number, moving: boolean) => {
    seq++;
    conn.send('move', { seq, x: wirePx(me.x), y: wirePx(me.y), facing: me.facing, moving });
    lastSent = { x: me.x, y: me.y, moving, facing: me.facing };
    lastSentAt = now;
  };
  const publishLocal = (force: boolean) => {
    const cur = localPlayer.get();
    const now = performance.now();
    const moved = Math.abs(lastPublish.x - me.x) >= 0.5 || Math.abs(lastPublish.y - me.y) >= 0.5;
    if (force || lastPublish.loc !== me.location || cur.pid !== myPid || (moved && now - lastPublish.at >= LOCAL_PUBLISH_MS)) {
      Object.assign(lastPublish, { x: me.x, y: me.y, loc: me.location, at: now });
      localPlayer.set({ pid: myPid, x: me.x, y: me.y, location: me.location });
      return;
    }
    cur.x = me.x;
    cur.y = me.y;
  };
  const placeMe = (x: number, y: number, location: LocationId) => {
    me.x = x;
    me.y = y;
    me.location = location;
    me.moving = false;
    ready = true;
    resetTrack = true;
    publishLocal(true);
  };
  const onTeleport = (t: WorldTeleport) => {
    // a rejoined page starts at seq 0, but the server keeps the last accepted sequence (cafb858)
    seq = Math.max(seq, t.seq);
    if (t.reason === 'correction' && t.seq <= fenceSeq) return;
    fenceSeq = seq;
    lastSent = { x: t.x, y: t.y, moving: false, facing: me.facing };
    const changed = t.location !== me.location;
    placeMe(t.x, t.y, t.location);
    insideDirty = true;
    if (t.reason === 'door' && changed) playCue('door');
  };
  const onSnapshot = (s: WorldSnapshot) => {
    seq = Math.max(seq, s.ackSeq);
    noteServerTime(s.t);
    insideDirty = true;
    const now = performance.now();
    const seen = new Set<string>();
    for (const e of s.entities) {
      if (e.id === myPid) {
        if (!ready) placeMe(e.x, e.y, e.location);
        continue;
      }
      seen.add(e.id);
      let r = remotes.get(e.id);
      if (!r) {
        r = { samples: [], location: e.location, dir: e.facing, last: { x: e.x, y: e.y } };
        remotes.set(e.id, r);
      }
      if (r.location !== e.location) {
        r.samples = [];
        r.location = e.location;
      }
      pushSample(r.samples, { t: now, x: e.x, y: e.y, facing: e.facing, moving: e.moving });
    }
    for (const pid of [...remotes.keys()])
      if (!seen.has(pid)) {
        remotes.delete(pid);
        remoteEntities.delete(pid);
      }
  };
  offs.push(conn.lobbyView.subscribe((v) => {
    lobby = v;
    myPid = v?.youPid ?? myPid;
    insideDirty = true;
  }));
  offs.push(
    conn.gameView.subscribe((g) => {
      gview = g;
      insideDirty = true;
    }),
  );
  offs.push(conn.events.on('world:teleport', onTeleport));
  offs.push(conn.events.on('world:snapshot', onSnapshot));
  offs.push(conn.events.on('sound', (s) => playCue(s.cue as Cue)));

  // ------------------------------------------------------------------ doors
  const enter = (id: string) => {
    const b = layout.buildings.find((x) => x.id === id);
    if (!b) return;
    const now = performance.now();
    if (now < enterCooldownUntil) return;
    if (doorLocked(ruleCtx(), b, false)) return flash(lockText(ruleCtx(), b, false));
    enterCooldownUntil = now + 900;
    sendMove(now, false); // the server judges the door range from the latest feet position
    conn.send('world:useDoor', { buildingId: b.id });
  };
  const leave = () => {
    const b = currentBuilding();
    if (!b || !ready) return;
    const now = performance.now();
    if (now < enterCooldownUntil) return;
    if (doorLocked(ruleCtx(), b, true)) return flash(lockText(ruleCtx(), b, true));
    enterCooldownUntil = now + 600;
    conn.send('world:useDoor', { buildingId: b.id });
  };
  const flash = (text: string) => {
    bridge.setPrompt({ key: '', text, locked: true });
    lastPromptKey = 'flash';
    flashUntil = performance.now() + 2200;
  };
  bridge.registerLeave?.(leave);
  offs.push(() => bridge.registerLeave?.(null));

  // ------------------------------------------------------------------ input
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    const k = keyDir(e.code);
    if (k) {
      keys.add(k);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
    if (e.code === 'Escape' && me.location !== 'outdoors') leave();
  };
  const up = (e: KeyboardEvent) => {
    const k = keyDir(e.code);
    if (k) keys.delete(k);
  };
  const blur = () => keys.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  offs.push(() => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  });

  // ------------------------------------------------------------------ per frame
  const stepLocal = (dt: number, now: number) => {
    if (!ready) return;
    const { vx: kx, vy: ky } = keyVector(keys);
    const len = Math.hypot(kx, ky);
    let moving = false;
    if (len > 0) {
      const vx = kx / len;
      const vy = ky / len;
      const step = moveSpeed(amStoryteller() && gview?.kind === 'storyteller' ? gview.travelSpeedMult : null) * dt;
      moving = integrateStep(layout, me, vx, vy, step).moved;
      myDir = dir8(vx, vy);
      me.facing = toFacing(myDir, vx, vy);
      const d = autoEnterDoor(me, vx, vy, doors);
      if (d) {
        if (!houseInUse(gview, d.b) && !amStoryteller()) flash('Nobody lives here');
        else enter(d.b.id);
      }
    }
    me.moving = moving;
    if (poseChanged(me, lastSent) && now - lastSentAt >= 1000 / MOVE_HZ) sendMove(now, moving);
    publishLocal(false);
  };
  const stepRemotes = (now: number) => {
    const renderAt = now - INTERP_DELAY_MS;
    for (const [pid, r] of remotes) {
      const at = interpolate(r.samples, renderAt);
      if (!at) continue;
      const stale = now - r.samples[r.samples.length - 1]!.t > REMOTE_STALE_MS;
      r.dir = remoteDir(r.dir, at.ref.moving && !stale, at.x - r.last.x, at.y - r.last.y, at.ref.facing);
      r.last = { x: at.x, y: at.y };
      const e = remoteEntities.get(pid);
      if (e) {
        e.x = at.x;
        e.y = at.y;
        e.location = r.location;
      } else remoteEntities.set(pid, { x: at.x, y: at.y, location: r.location });
    }
  };
  const updatePrompt = () => {
    if (lastPromptKey === 'flash' && performance.now() < flashUntil) return;
    let p: { text: string; locked: boolean } | null = null;
    if (ready && me.location === 'outdoors') {
      const ctx = ruleCtx();
      p = doorPrompt(me, doors, {
        amStoryteller: ctx.amStoryteller,
        inUse: (b) => houseInUse(gview, b),
        locked: (b) => doorLocked(ctx, b, false),
        lockText: (b) => lockText(ctx, b, false),
        title: (b) => {
          const res = gview?.players.find((x) => x.seat === b.houseIndex);
          return !res ? b.name : res.pid === myPid ? 'Your home' : `${res.name}’s home`;
        },
      });
    }
    const key = p ? `${p.text}|${p.locked}` : '';
    if (key === lastPromptKey) return;
    lastPromptKey = key;
    bridge.setPrompt(p ? { key: '', text: p.text, locked: p.locked } : null);
  };
  const updateInside = () => {
    // re-derived only when a snapshot / teleport / view changed it (not per frame)
    if (!insideDirty) return;
    insideDirty = false;
    const b = currentBuilding();
    const others = b ? [...remotes.entries()].filter(([, r]) => r.location === me.location).map(([pid]) => lobby?.members.find((m) => m.pid === pid)?.displayName ?? '…') : [];
    const locked = b ? doorLocked(ruleCtx(), b, true) : false;
    const key = b ? `${b.id}|${others.join(',')}|${locked}` : '';
    if (key === lastInsideKey) return;
    lastInsideKey = key;
    bridge.setInside?.(b ? { buildingId: b.id, name: b.name, others, canLeave: !locked, ...(locked ? { lockedReason: lockText(ruleCtx(), b, true) } : {}) } : null);
  };

  // camera focus (m), smoothed
  const focus = new THREE.Vector3();
  let focusInit = false;
  const stepCamera = (dt: number) => {
    if (!host || me.location !== 'outdoors') return;
    const X = me.x / PX_PER_M;
    const Z = me.y / PX_PER_M;
    if (!focusInit || dt <= 0) focus.set(X, 0, Z);
    else {
      const k = 1 - Math.exp(-dt * 5);
      focus.x += (X - focus.x) * k;
      focus.z += (Z - focus.z) * k;
    }
    focusInit = true;
    host.engine.camera.set({ target: focus, yaw: 0, pitch: Math.PI / 6, viewHeight: VIEW_HEIGHT });
  };

  // One Scene3dState for the whole mount, mutated in place each frame (no per-frame Maps / Poses).
  const statePoses = new Map<string, Pose>();
  const myPose: Pose = { pid: '', x: 0, y: 0, location: 'outdoors', facing: 'down', moving: false };
  const state: Scene3dState = {
    me: null,
    myPid: null,
    amStoryteller: false,
    remotes: statePoses,
    members: new Map(),
    game: null,
    phase: 'waiting',
    layout,
    world: currentWorld(),
    tier: opts.tier,
    reducedMotion: false,
    hour: 12,
  };
  const sceneState = (): Scene3dState => {
    for (const pid of statePoses.keys()) if (!remotes.has(pid)) statePoses.delete(pid);
    for (const [pid, r] of remotes) {
      const e = remoteEntities.get(pid);
      const ref = r.samples[r.samples.length - 1];
      if (!e || !ref) {
        statePoses.delete(pid);
        continue;
      }
      let p = statePoses.get(pid);
      if (!p) {
        p = { pid, x: 0, y: 0, location: r.location, facing: ref.facing, moving: false };
        statePoses.set(pid, p);
      }
      p.x = e.x;
      p.y = e.y;
      p.location = r.location;
      p.facing = ref.facing;
      p.moving = ref.moving;
    }
    if (myPid && ready) {
      myPose.pid = myPid;
      myPose.x = me.x;
      myPose.y = me.y;
      myPose.location = me.location;
      myPose.facing = me.facing;
      myPose.moving = me.moving;
      state.me = myPose;
    } else state.me = null;
    state.myPid = myPid;
    state.amStoryteller = amStoryteller();
    state.game = gview;
    state.phase = phase();
    state.reducedMotion = reducedMotion();
    return state;
  };

  let lastFrameAt = performance.now();
  const frame = (t: number, dtMs: number) => {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    tracker?.frame(dtMs);
    stepLocal(dt, now);
    stepRemotes(now);
    updatePrompt();
    updateInside();
    stepCamera(dt);
    if (handle && track) {
      const outdoors = me.location === 'outdoors';
      handle.root.visible = ready && outdoors; // WP0: no interiors yet (WP3 builds them)
      const X = me.x / PX_PER_M;
      const Z = me.y / PX_PER_M;
      if (resetTrack) track.reset(t, X, Z);
      else track.push(t, X, Z);
      resetTrack = false;
      handle.update(t);
    }
    if (layers.length) {
      const st = sceneState();
      for (const l of layers) l.update(st, t, dt);
    }
  };

  // ------------------------------------------------------------------ debug hook (§6.1)
  const projectPx = (x: number, y: number, heightM = 0) => {
    if (!host) return null;
    const X = x / PX_PER_M;
    const Z = y / PX_PER_M;
    return worldToCss(host.projection(), X, heightAt(X, Z) + heightM, Z);
  };
  const installDebug = () => {
    let on = false;
    try {
      on = localStorage.getItem('ct.debug.camera') === '1';
    } catch {
      on = false;
    }
    if (!on || !host) return;
    const h = host;
    const frames: number[] = [];
    let prev = performance.now();
    const hook: Record<string, unknown> = {
      worldToScreen: (x: number, y: number, heightM = 0) => projectPx(x, y, heightM),
      view: () => {
        const p = h.projection();
        const r = h.engine.renderer.domElement.getBoundingClientRect();
        const pts = [
          [r.left, r.top],
          [r.right, r.top],
          [r.left, r.bottom],
          [r.right, r.bottom],
        ].map(([cx, cy]) => {
          const ray = cssToRay(p, cx!, cy!);
          return ray ? rayGround(ray, () => 0, 0) : null;
        });
        const ok = pts.filter((q): q is { X: number; Y: number; Z: number } => !!q);
        const xs = ok.map((q) => q.X * PX_PER_M);
        const ys = ok.map((q) => q.Z * PX_PER_M);
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        const zoom = h.engine.pixelScale / h.engine.camera.texelWorld / PX_PER_M;
        return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0, zoom };
      },
      me: () => ({ x: me.x, y: me.y, facing: me.facing, moving: me.moving, location: me.location }),
      v3: () => {
        const i = h.info();
        const sorted = [...frames].sort((a, b) => a - b);
        const q = (f: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]! : 0);
        return { ready: !!handle, tier: opts.tier, pixelScale: i.pixelScale, calls: i.calls, tris: i.tris, programs: i.programs, frameMs: { p50: q(0.5), p95: q(0.95) }, gpu: h.gpu(), building: [], life: null };
      },
    };
    for (const l of layers) Object.assign(hook, l.debug?.() ?? {});
    debugHook = hook;
    (window as unknown as { __ctCamera?: unknown }).__ctCamera = hook;
    // frame times for v3() (last 600)
    const sample = () => {
      const now = performance.now();
      frames.push(now - prev);
      prev = now;
      if (frames.length > 600) frames.shift();
    };
    afterFrame = sample;
  };
  let afterFrame: (() => void) | null = null;

  // ------------------------------------------------------------------ build
  let resolveReady: () => void = () => undefined;
  let rejectReady: (e: unknown) => void = () => undefined;
  const readyP = new Promise<void>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  readyP.catch(() => undefined); // nobody awaiting it must not surface as an unhandled rejection
  const crash = (e: unknown) => {
    if (destroyed || crashed) return;
    crashed = true;
    console.error('[town3d] failed, switching to Classic:', e);
    tracker?.crashed();
    rejectReady(e);
    bridge.requestFallback?.('error');
  };
  const build = async () => {
    const bootId = markBooting();
    tracker = new BootTracker(bootId);
    let fpsLimit = 0;
    try {
      fpsLimit = Number(localStorage.getItem('ct.debug.fps') ?? 0) || 0;
    } catch {
      fpsLimit = 0;
    }
    host = createEngineHost(parent, { tier: opts.tier, fpsLimit });
    const canvas = host.engine.renderer.domElement;
    const lost = (ev: Event) => {
      ev.preventDefault();
      // WP1: the first loss rebuilds (new Engine); WP0 swaps to Classic at once
      crash(new Error('webglcontextlost'));
    };
    canvas.addEventListener('webglcontextlost', lost);
    offs.push(() => canvas.removeEventListener('webglcontextlost', lost));
    const town = await buildHollowmere(host.engine, { quality: opts.tier });
    if (destroyed) return;
    host.installRuntimeOpts();
    heightAt = groundHeight(town);
    const X = me.x / PX_PER_M;
    const Z = me.y / PX_PER_M;
    handle = await spawnCharacter(host.engine, STUB_CHARACTER, { x: X, z: Z, heightAt, lite: opts.tier === 'low' });
    if (destroyed) {
      handle.dispose();
      handle = null;
      return;
    }
    host.engine.scene.add(handle.root);
    track = driveAlong(handle, heightAt);
    track.reset(0, X, Z);
    for (const f of LAYERS) layers.push(f({ engine: host.engine, bridge, tier: opts.tier }));
    stepCamera(0);
    // shader warm-up behind the loading state: t = 0 and one more frame (programs compile here)
    host.renderNow(0);
    host.renderNow(1 / 60);
    tracker?.rendered();
    installDebug();
    resolveReady();
    host.start(frame, () => afterFrame?.(), crash);
  };
  build().catch(crash);

  return {
    ready: readyP,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs.splice(0)) off();
      for (const l of layers.splice(0)) {
        try {
          l.destroy();
        } catch (e) {
          console.warn('[town3d] layer destroy failed', e);
        }
      }
      try {
        handle?.dispose();
      } catch (e) {
        console.warn('[town3d] character dispose failed', e);
      }
      handle = null;
      host?.dispose();
      host = null;
      if (!crashed) tracker?.finish(); // a clean destroy clears the boot mark (a crash already went through tracker.crashed())
      tracker?.dispose();
      const w = window as unknown as { __ctCamera?: unknown };
      if (debugHook && w.__ctCamera === debugHook) delete w.__ctCamera;
      debugHook = null;
      remoteEntities.clear();
      bridge.setPrompt(null);
      bridge.setInside?.(null);
    },
  };
}
