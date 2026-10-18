// v3 WP0 (v3-lead) + C1 (integrator). The 3D town's composition root (docs/v3/INTEGRATION.md §1.1, §1.4): lazy
// chunk "town3d", mounted by GameScreen instead of game/TownGame when chooseRenderer() says 'v3'.
//
//   createTownGame3d(parent, bridge, {tier}) -> { ready, destroy() }      same bridge + handle shape as Classic
//
// One mount = ONE net / input / camera core (net/core.ts createCore3d: own avatar prediction, remotes, doors, taps,
// keys, pointer, the camera rig, the ONE GameplayCore, __ctCamera) that survives every rebuild, and a lifecycle
// (net/lifecycle.ts: boot guard, perf sampler + safe moments, context-loss rebuild then Classic, crash -> Classic)
// that (re)builds the drawn scene. Each build is a NEW Engine (§1.3 "Rebuild"):
//   engine host -> WP3 stage (town, time, doors, dais, interiors incl. the clock tower, light pool)
//   -> WP2 avatars (registered after net/, before overlay/; the own avatar's first build is awaited, at most
//      SELF_READY_MS, while a build-only pump feeds it the state)
//   -> WP3 shader warm-up behind the loading state -> core.attachScene (camera, picks, debug answer from now on)
//   -> WP4 overlay (labels, DOM bubbles, pins / points / pie via overlay.socialSink -> pointer.setSocial, boards,
//      house names, seat markers, hints, poofs) -> layers [stage, avatars, overlay] -> the frame loop.
// Per frame: core.frame (state) -> layers.update -> engine.renderAt -> core.afterRender + lifecycle.frame.
// Wiring: core.on('placed') / remote Storyteller poofs -> avatars.fadeIn; voicePresence -> avatars.setTalking (the
// emissive talking rim; v2 colours: rose for yourself on air, pale gold for others).
// Teardown order (rebuild or destroy): detach the core from the scene, unhook the social sink, the layers (overlay,
// avatars, stage: DOM, listeners, geometries, textures, programs), the context-loss listener, then the Engine.
import { FX_QUALITY_KEY } from '../game/fx/quality';
import { currentLayout, currentWorld } from '../net/layout';
import { voicePresence } from '../voice/VoiceClient';
import type { Layer3d, Tier, TownBridge3d, TownHandle } from './contract';
import { createAvatarLayer, type AvatarLayer } from './avatars';
import { createCore3d, type Core3d } from './net/core';
import { createBusyOverlay, Lifecycle, watchContextLoss, type BuildControl } from './net/lifecycle';
import { createOverlayLayer, type OverlayLayer } from './overlay';
import { readPerfFlags } from './perf';
import { readGraphicsPref } from './select';
import { layoutProxies, type HouseProxy } from './input/pick';
import { createEngineHost, type EngineHost } from './vendor/engineHost';
import { lifeStats } from './vendor/town';
import { hudKeepOuts } from './world/hudKeep';
import { createStage, type Stage } from './world/stage';
import type { Box } from './world/voteFrame';

/** Extra layers in update order (after the stage, the avatars and the overlay). Empty; kept as an extension point. */
export type LayerFactory = (svc: Layer3dServices) => Layer3d;
export interface Layer3dServices {
  engine: unknown;
  bridge: TownBridge3d;
  tier: Tier;
  /** WP3: the town stage (light pool `borrowLight`, `heightAt`, `interiorCamera`, `houseProxies`, `drawnLocation`). */
  stage: Stage;
}
const LAYERS: readonly LayerFactory[] = [];

export interface TownGame3dOptions {
  tier: Tier;
}

/** The own avatar's first build may hold the warm-up at most this long (a stalled spec import never blocks the mount). */
export const SELF_READY_MS = 5000;
/** The build-only pump (before the frame loop runs) steps the core + avatars this often (ms). */
const PUMP_MS = 50;
/** The vote frame re-measures the HUD once this long after vote entry (ms). */
const VOTE_KEEP_SETTLE_MS = 700;
/** The talking rim colours (game/fx/talking.ts COLOR_SELF / COLOR_TALK). */
export const RIM_SELF = '#ff8f8a';
export const RIM_TALK = '#ffe7a3';

/** One drawn scene (one Engine): everything a rebuild throws away. */
interface Scene3d {
  host: EngineHost;
  stage: Stage | null;
  avatars: AvatarLayer | null;
  overlay: OverlayLayer | null;
  layers: Layer3d[];
  offs: (() => void)[];
  running: boolean;
}

const storage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

/**
 * The talking set of a voice presence: the speakers, plus yourself while transmitting (v2 fx/talking.ts draws your
 * own outline then too). pid -> rim colour.
 */
export function talkingRims(p: { speaking: readonly string[]; selfPid: string | null; selfTransmitting: boolean }, myPid: string | null): Map<string, string> {
  const out = new Map<string, string>();
  const self = myPid ?? p.selfPid;
  for (const pid of p.speaking) out.set(pid, pid === self ? RIM_SELF : RIM_TALK);
  if (self && p.selfTransmitting) out.set(self, RIM_SELF);
  return out;
}

export function createTownGame3d(parent: HTMLElement, bridge: TownBridge3d, opts: TownGame3dOptions): TownHandle {
  const layout = currentLayout();
  const world = currentWorld();
  let destroyed = false;
  let scene: Scene3d | null = null;
  let stage: Stage | null = null;
  const offs: (() => void)[] = [];
  const s = storage();

  const core: Core3d = createCore3d({ bridge, layout, world, tier: opts.tier, parent, hour: () => stage?.hour() ?? 12 });

  // ------------------------------------------------------------------ voice -> talking rims (re-applied on rebuild)
  let rims = new Map<string, string>();
  const applyRims = (a: AvatarLayer | null, prev: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>) => {
    if (!a) return;
    for (const pid of prev.keys()) if (!next.has(pid)) a.setTalking(pid, false);
    for (const [pid, rim] of next) if (prev.get(pid) !== rim) a.setTalking(pid, true, rim);
  };
  const readRims = () => talkingRims(voicePresence.get(), core.state.myPid ?? bridge.conn.lobbyView.get()?.youPid ?? null);
  offs.push(
    voicePresence.subscribe(() => {
      const next = readRims();
      applyRims(scene?.avatars ?? null, rims, next);
      rims = next;
    }),
  );

  // ------------------------------------------------------------------ teleport cross-fades
  offs.push(
    core.on('placed', (e) => {
      const pid = core.state.myPid ?? bridge.conn.lobbyView.get()?.youPid;
      if (pid && e.reason !== 'correction') scene?.avatars?.fadeIn(pid);
    }),
  );
  offs.push(
    core.on('poof', (e) => {
      if (e.kind === 'in' && e.pid !== core.state.myPid) scene?.avatars?.fadeIn(e.pid);
    }),
  );

  /** Frames run by the loop (debug: `camera3d().frames` tells a stalled page from a stale state). */
  let frameCount = 0;
  let lastFrameAt = 0;
  /** ms of the last / slowest frame step (core + layers) and render (engine.renderAt), debug */
  const cost = { step: 0, render: 0, maxStep: 0, maxRender: 0 };

  // (v3.1) the vote frame's keep-out boxes = the HUD over the canvas (world/hudKeep.ts), measured on vote entry (no call
  // for a second), on a canvas resize, and once more VOTE_KEEP_SETTLE_MS after entry (the vote card mounts a render later)
  let vk: { key: string; boxes: Box[] | null; enteredAt: number; settled: boolean; lastCall: number } | null = null;
  const voteKeep = (canvas: HTMLElement, w: number, h: number, ps: number): Box[] | null => {
    const now = performance.now();
    const key = `${w}x${h}@${ps}`;
    if (!vk || vk.key !== key || now - vk.lastCall > 1000) vk = { key, boxes: hudKeepOuts(canvas, ps), enteredAt: now, settled: false, lastCall: now };
    else if (!vk.settled && now - vk.enteredAt > VOTE_KEEP_SETTLE_MS) {
      vk.settled = true;
      vk.boxes = hudKeepOuts(canvas, ps);
    }
    vk.lastCall = now;
    return vk.boxes;
  };

  // ------------------------------------------------------------------ the camera override (__ctCamera.setCamera)
  const debugLayer: Layer3d = {
    update: () => undefined,
    destroy: () => undefined,
    debug: () => ({
      /** Harness stills: hold the camera on {focus: [x, y] world px, viewHeight m} (null = the game camera again). */
      setCamera: (o?: unknown) => {
        const c = o as { focus?: [number, number]; viewHeight?: number } | null | undefined;
        if (!c || !Array.isArray(c.focus)) return core.view.setOverride(null);
        core.view.setOverride({ X: c.focus[0] / 16, Y: 0, Z: c.focus[1] / 16, viewHeight: Number(c.viewHeight) > 0 ? Number(c.viewHeight) : 12 });
      },
      /** The camera: mode (follow / vote / room), focus (m), viewHeight, yaw / pitch (deg), a running transition. */
      camera3d: () => {
        const sh = core.view.shot();
        return { mode: core.view.cameraMode(), X: +sh.X.toFixed(3), Z: +sh.Z.toFixed(3), viewHeight: +sh.viewHeight.toFixed(3), yaw: Math.round(((sh.yaw ?? 0) * 180) / Math.PI), pitch: Math.round(((sh.pitch ?? 0) * 180) / Math.PI), transitioning: core.view.transitioning, frames: frameCount, sinceFrameMs: Math.round(performance.now() - lastFrameAt), lifecycle: lifecycle.state, waiting: lifecycle.waiting, cost: { step: +cost.step.toFixed(1), render: +cost.render.toFixed(1), maxStep: +cost.maxStep.toFixed(1), maxRender: +cost.maxRender.toFixed(1) } };
      },
    }),
  };

  // ------------------------------------------------------------------ build / teardown (one Engine each)
  const disposeScene = (sc: Scene3d) => {
    sc.running = false;
    if (scene === sc) {
      core.detachScene();
      core.pointer.setSocial(null);
      core.setLayers([debugLayer]);
      scene = null;
      stage = null;
    }
    for (const off of sc.offs.splice(0)) off();
    // overlay first (DOM over the canvas), then avatars (bodies, sheets), then the stage (rooms, lights, the time facade)
    for (const l of [sc.overlay, sc.avatars, sc.stage]) {
      if (!l) continue;
      try {
        l.destroy();
      } catch (e) {
        console.warn('[town3d] layer destroy failed', e);
      }
    }
    for (const l of sc.layers.splice(0)) {
      if (l === sc.overlay || l === sc.avatars || l === sc.stage?.layer) continue;
      try {
        l.destroy();
      } catch (e) {
        console.warn('[town3d] layer destroy failed', e);
      }
    }
    sc.overlay = null;
    sc.avatars = null;
    sc.stage = null;
    sc.host.dispose();
  };

  let fpsLimit = 0;
  try {
    fpsLimit = Number(s?.getItem('ct.debug.fps') ?? 0) || 0;
  } catch {
    fpsLimit = 0;
  }

  const build = async (tier: Tier, ctl: BuildControl): Promise<void> => {
    const host = createEngineHost(parent, { tier, fpsLimit });
    const sc: Scene3d = { host, stage: null, avatars: null, overlay: null, layers: [], offs: [], running: false };
    const cancelled = () => {
      if (ctl.isCurrent() && !destroyed) return false;
      disposeScene(sc);
      return true;
    };
    // ONE context loss per Engine, from whichever comes first: the webglcontextlost event, or a throw while the context
    // is already lost (loseContext() / a driver reset takes effect at once, the event is a later task: a frame in
    // between that compiles a program throws in three's shader check, getProgramInfoLog() = null). Such a throw is the
    // loss, not a crash, and the event that follows must not count as a second loss.
    let lostOnce = false;
    const lost = () => {
      if (lostOnce || destroyed || !ctl.isCurrent()) return;
      lostOnce = true;
      lifecycle.contextLost();
    };
    const isLost = () => {
      try {
        return host.engine.renderer.getContext().isContextLost();
      } catch {
        return false;
      }
    };
    try {
      sc.offs.push(watchContextLoss(host.engine.renderer.domElement, lost));
      // WP3 stage: town (strict) -> runtime opts -> boards / light gates / carried-light reserve -> time facade
      const g0 = bridge.conn.gameView.get();
      const phase0 = g0?.phase ?? (bridge.conn.lobbyView.get()?.lobby.phase === 'finished' ? 'finished' : 'waiting');
      const st = await createStage(host, { layout, tier, initial: { phase: phase0, game: g0 }, driveInteriorCamera: false });
      sc.stage = st;
      if (cancelled()) return;
      // WP2 avatars: after net/ (they read Scene3dState), before overlay/ (it reads their registry)
      const avatars = createAvatarLayer({ engine: host.engine, tier, heightAt: st.heightAt, floorAt: st.floorAt, view: core.view, lights: st });
      sc.avatars = avatars;
      // the own avatar's first build, fed by a build-only pump (no render) until it lands or SELF_READY_MS pass
      let pt = 0;
      const pump = setInterval(() => {
        if (!ctl.isCurrent() || destroyed) return;
        try {
          pt += PUMP_MS / 1000;
          avatars.update(core.frame(pt, PUMP_MS), pt, PUMP_MS / 1000);
        } catch (e) {
          console.warn('[town3d] pre-warm pump failed', e);
        }
      }, PUMP_MS);
      try {
        await avatars.selfReady(SELF_READY_MS);
      } finally {
        clearInterval(pump);
      }
      if (cancelled()) return;
      // WP3 shader warm-up behind the loading state (two frames, every dais state, the whole town, one room; 'ready')
      await st.warmUp((t) => host.renderNow(t));
      if (cancelled()) return;
      // the core reads this scene from now on: camera, picks (the drawn cottages + layout boxes for the rest, e.g. the
      // clock tower), room floors, the vote frame, __ctCamera.v3().ready
      const drawn: HouseProxy[] = st.houseProxies().map((b) => ({ id: b.id, center: b.center, half: b.half, y: b.y, ry: b.ry }));
      const have = new Set(drawn.map((b) => b.id));
      const proxies = [...drawn, ...layoutProxies(layout).filter((b) => !have.has(b.id))];
      core.attachScene({
        host,
        heightAt: st.heightAt,
        floorAt: st.floorAt,
        proxies,
        interiorCamera: (loc) => st.interiorCamera(loc),
        interiorPending: (loc) => st.interiorPending(loc),
        voteCamera: (w, h, ps) => st.voteCamera(w, h, ps, voteKeep(host.engine.renderer.domElement, w, h, ps)),
        stats: { building: () => [], life: () => lifeStats(host.engine) },
      });
      scene = sc;
      stage = st;
      // WP4 overlay: world-anchored UI over the canvas; the social view gets the pointer events through WP1's input
      const overlay = createOverlayLayer({
        parent,
        conn: bridge.conn,
        view: core.view,
        avatars: avatars.registry,
        gameplay: () => core.gameplayFrame(),
        pixelScale: () => host.engine.pixelScale,
        faceToward: (x, y) => core.local.faceToward(x, y),
        passTap: (x, y) => core.pointer.tapAt(x, y),
      });
      sc.overlay = overlay;
      core.pointer.setSocial(overlay.socialSink);
      sc.layers.push(st.layer, avatars, overlay);
      for (const f of LAYERS) sc.layers.push(f({ engine: host.engine, bridge, tier, stage: st }));
      core.setLayers([...sc.layers, debugLayer]);
      // voice rims onto the new bodies
      applyRims(avatars, new Map(), rims);
      // the loop: state -> layers -> render -> stats / lifecycle
      let lastDtMs = 16;
      let stepEnd = 0;
      sc.running = true;
      host.start(
        (t, dtMs) => {
          lastDtMs = dtMs;
          frameCount++;
          const t0 = performance.now();
          lastFrameAt = t0;
          const state = core.frame(t, dtMs);
          const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
          for (const l of sc.layers) l.update(state, t, dt);
          stepEnd = performance.now();
          cost.step = stepEnd - t0;
          if (cost.step > cost.maxStep) cost.maxStep = cost.step;
        },
        () => {
          cost.render = performance.now() - stepEnd;
          if (cost.render > cost.maxRender) cost.maxRender = cost.render;
          core.afterRender(lastDtMs);
          lifecycle.frame(lastDtMs);
        },
        (e) => (isLost() ? lost() : lifecycle.crash(e)),
      );
    } catch (e) {
      // a build error: the lifecycle crashes to Classic when this build is still current; the half-built scene goes.
      // On a lost context it is that loss instead: lost() supersedes this build (a rebuild starts), so the rethrown
      // error is ignored by the lifecycle.
      const wasLost = isLost(); // (read before the dispose, which may force a loss itself)
      if (scene !== sc) disposeScene(sc);
      if (wasLost) lost();
      throw e;
    }
  };

  const teardown = () => {
    if (scene) disposeScene(scene);
  };

  const busy = (() => {
    try {
      return createBusyOverlay(parent);
    } catch {
      return null;
    }
  })();
  let allowPromote = false;
  try {
    allowPromote = readGraphicsPref(s) === 'auto' && s?.getItem(FX_QUALITY_KEY) !== 'low';
  } catch {
    allowPromote = false;
  }
  const lifecycle = new Lifecycle({
    startTier: opts.tier,
    build,
    onTier: (t) => core.setTier(t),
    teardown,
    fallback: (reason) => {
      if (!destroyed) bridge.requestFallback?.(reason);
    },
    safe: () => core.safeInput(),
    flags: readPerfFlags(s),
    allowPromote,
    ...(busy ? { overlay: busy } : {}),
  });
  core.setLayers([debugLayer]);
  const ready = lifecycle.start();
  ready.catch(() => undefined); // nobody awaiting it must not surface as an unhandled rejection

  return {
    ready,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs.splice(0)) off();
      lifecycle.destroy(); // a clean destroy clears the boot mark; cancels a running build
      teardown();
      busy?.destroy();
      core.destroy(); // keys, pointer, crosshair, perf overlay, __ctCamera, the gameplay core, prompt / inside panel
      bridge.setPrompt(null);
      bridge.setInside?.(null);
    },
  };
}
