// v3 WP4 (v3-overlay). World-anchored UI of the 3D town (docs/v3/INTEGRATION.md §3, §7, §8 WP4), as one
// Layer3d the composition root registers after the avatars:
//
//   const overlay = createOverlayLayer({ parent, surface: canvas, conn, view, avatars, gameplay: () => coreFrame,
//                                        pixelScale: () => engine.pixelScale, faceToward, passTap });
//   layers.push(overlay);                 // update(state, t, dt) each frame; destroy() on unmount
//   pointerInput.setSocial(overlay.socialSink); // WP1 forwards presses / moves and asks sink.onTap FIRST on taps
//   (passTap = pointerInput.tapAt; overlay.tapFirst(ev) is the same claim for a plain DOM event)
//
// Views, in draw order (later ones read what earlier ones laid out): labels (+ talking) → board tokens →
// house names → gameplay (seat markers, hands, hints, poof) → social (pins, points, hover) → bubbles.
//
// Frame timing (§1.5, §7): update() runs inside the frame callback, BEFORE engine.renderAt() moves the camera.
// So update() only records the state and queues the DOM batch as a microtask, which runs right after the
// RAF callback (i.e. after renderAt and its camera.update()) and before paint: overlays always use the
// projection of the frame that is being shown. `flush()` does the same synchronously (tests / harness).
import { reducedMotion } from '../../game/fx/motion';
import type { LocationId } from '@ct/protocol';
import type { AvatarRegistry, Layer3d, Px, Scene3dState, View3d } from '../contract';
import { pixelScaleFor } from '../coords';
import { createAtlas, isNightHour, todOf } from './atlas';
import { createBoardsView, createHouseNamesView } from './boards';
import { createBubblesView } from './bubbles';
import { createGameplayView } from './gameplayView';
import { createLabelsView } from './labels';
import { createRate, newStats } from './place';
import { createSocialView, type SocialSink, type SocialView } from './socialView';
import { createSurface } from './surface';
import type { DrawnAvatar, OverlayDeps, OverlayEnv, OverlayFrame, OverlayView } from './types';

export type { OverlayDeps } from './types';

export interface OverlayLayer extends Layer3d {
  /** Ask FIRST on every primary tap / click on the town; true = consumed by the social layer. */
  tapFirst(ev: PointerEvent | MouseEvent): boolean;
  /** Run the pending DOM batch now (normally a microtask after the frame). */
  flush(): void;
  /** The social view (null when disabled). */
  readonly social: SocialView | null;
  /** WP1: `pointerInput.setSocial(overlay.socialSink)` (null when the social view is disabled). */
  readonly socialSink: SocialSink | null;
}

export function createOverlayLayer(deps: OverlayDeps): OverlayLayer {
  const stats = newStats();
  const surface = createSurface(deps.parent, stats);
  const atlas = createAtlas();
  const env: OverlayEnv = { deps, surface, atlas, stats };
  const rate = createRate(stats);

  let pending: { state: Scene3dState; dt: number } | null = null;
  let queued = false;
  let destroyed = false;
  let lowTier = false;

  const labels = createLabelsView(env);
  const boards = createBoardsView(env);
  const houseNames = createHouseNamesView(env, boards);
  const gameplay = createGameplayView(env);
  const bubbles = createBubblesView(env, { lowTier: () => lowTier, myPid: () => pending?.state.myPid ?? lastState?.myPid ?? null });
  const social = deps.social === false ? null : createSocialView(env);
  // social before bubbles: bubbles climb over a speaker's person pins and are drawn on top of the pins / trails
  const views: OverlayView[] = [labels, boards, houseNames, gameplay, ...(social ? [social] : []), bubbles];

  // one frame object, reused
  const avatars: DrawnAvatar[] = [];
  const pool: DrawnAvatar[] = [];
  const footBufs: { x: number; y: number }[] = [];
  const byPid = new Map<string, DrawnAvatar>();
  const tmp = { x: 0, y: 0 };
  const deadPids = new Set<string>();
  /** Drawn in the viewer's location this frame (on screen or not). */
  const drawn = new Set<string>();
  /** Fallback "drawn" memory: pids that had an anchor since they entered the viewer's location. */
  const seen = new Set<string>();
  let seenLoc: LocationId | null = null;
  let lastState: Scene3dState | null = null;
  let location: LocationId = 'outdoors';
  const reg = deps.avatars as AvatarRegistry & { isShown?(pid: string): boolean };
  const shownOf: ((pid: string) => boolean) | null = deps.avatarShown ?? (typeof reg.isShown === 'function' ? (pid) => reg.isShown!(pid) : null);
  const view = deps.view as View3d & { project?(p: Px, location: LocationId, heightM?: number): { x: number; y: number } | null };
  const unclipped = deps.projectUnclipped ?? (typeof view.project === 'function' ? (p: Px, loc: LocationId, h?: number) => view.project!(p, loc, h) : null);
  const project = (p: Px, heightM = 0, out?: { x: number; y: number }) => {
    const s = deps.view.worldToScreen(p, location, heightM);
    if (!s) return null;
    return surface.toLocal(s.x, s.y, out ?? { x: 0, y: 0 });
  };
  const projectFree = (p: Px, heightM = 0, out?: { x: number; y: number }) => {
    if (!unclipped) return project(p, heightM, out);
    const s = unclipped(p, location, heightM);
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
    return surface.toLocal(s.x, s.y, out ?? { x: 0, y: 0 });
  };
  const frame: OverlayFrame = {
    state: null as unknown as Scene3dState,
    now: 0,
    dt: 0,
    px: 1,
    w: 0,
    h: 0,
    night: false,
    tod: 'day',
    tokens: atlas.tokens('day'),
    still: false,
    location: 'outdoors',
    cssPerM: 16,
    fx: surface.fx,
    avatars,
    byPid,
    drawn,
    project,
    projectFree,
  };

  const add = (state: Scene3dState, pid: string, me: boolean, loc: LocationId) => {
    if (loc !== location) return;
    const anchor = deps.avatars.anchorOf(pid); // null also when the head is just off the canvas
    if (anchor) seen.add(pid);
    if (!(shownOf ? shownOf(pid) : seen.has(pid))) return; // not drawn: no label, bubble, pin or hand for it
    drawn.add(pid);
    if (!anchor) return; // drawn but off screen: its overlays keep their state, only drawing is skipped
    const i = avatars.length;
    const m = state.members.get(pid);
    const a = (pool[i] ??= { pid: '', name: '', castId: '', storyteller: false, ghost: false, me: false, feet: { x: 0, y: 0 }, heightM: 1, head: { x: 0, y: 0 }, foot: null, label: null, stackTop: null });
    a.pid = pid;
    a.name = m?.name ?? '';
    a.castId = m?.castId ?? 'storyteller';
    a.storyteller = m?.role === 'storyteller';
    a.ghost = deadPids.has(pid);
    a.me = me;
    a.feet.x = anchor.displayFeet.x;
    a.feet.y = anchor.displayFeet.y;
    a.heightM = anchor.heightM;
    surface.toLocal(anchor.headTopCss.x, anchor.headTopCss.y, tmp);
    a.head.x = tmp.x;
    a.head.y = tmp.y;
    a.foot = project(anchor.displayFeet, 0, (footBufs[i] ??= { x: 0, y: 0 }));
    a.label = null;
    a.stackTop = null;
    avatars.push(a);
    byPid.set(pid, a);
  };

  function collect(state: Scene3dState) {
    avatars.length = 0;
    byPid.clear();
    drawn.clear();
    deadPids.clear();
    if (seenLoc !== location) {
      seen.clear();
      seenLoc = location;
    }
    const players = state.game?.players;
    if (players) for (let i = 0; i < players.length; i++) if (!players[i]!.alive) deadPids.add(players[i]!.pid);
    if (state.me && state.myPid) add(state, state.myPid, true, state.me.location);
    for (const [pid, p] of state.remotes) add(state, pid, false, p.location);
    // forget whoever left the location (or the room)
    if (seen.size > drawn.size) for (const pid of seen) if (!drawn.has(pid)) seen.delete(pid);
  }

  function run() {
    queued = false;
    const p = pending;
    pending = null;
    if (destroyed || !p) return;
    const state = p.state;
    lastState = state;
    location = state.me?.location ?? 'outdoors';
    lowTier = state.tier === 'low';
    const size = surface.size();
    const px = Math.max(1, Math.round(deps.pixelScale?.() ?? pixelScaleFor(size.h || (typeof window !== 'undefined' ? window.innerHeight : 720), lowTier ? 'low' : 'high')));
    frame.state = state;
    frame.now = performance.now();
    frame.dt = p.dt;
    frame.px = px;
    frame.w = size.w;
    frame.h = size.h;
    frame.night = isNightHour(state.hour);
    frame.tod = todOf(state.hour);
    frame.tokens = atlas.tokens(frame.tod);
    frame.still = state.reducedMotion || reducedMotion();
    frame.location = location;
    frame.cssPerM = Math.max(0.5, deps.view.cssPerPx() * 16);
    surface.fx.begin(px, size.w, size.h);
    collect(state);
    for (const v of views) {
      try {
        v.update(frame);
      } catch (e) {
        console.warn('[town3d] overlay view failed', e);
      }
    }
  }

  return {
    update(state, _t, dt) {
      if (destroyed) return;
      pending = { state, dt };
      if (!queued) {
        queued = true;
        queueMicrotask(run);
      }
    },
    flush: run,
    tapFirst(ev) {
      return social ? social.tapFirst(ev) : false;
    },
    social,
    socialSink: social?.sink ?? null,
    debug: () => ({
      /** Chat speech bubbles drawn right now, with page CSS px boxes (v2 shape). */
      bubbles: () => bubbles.shown(),
      /** Door boards with tokens right now, by building id (v2 boardTokens.inspect shape + `screen`). */
      doorBoards: () => boards.inspect(),
      /** Overlay DOM cost: cumulative write counters and per-second rates (the v3WalkDomMutPerSec key). */
      overlay: () => ({ ...stats, ...rate.sample(performance.now()), labels: avatars.length, talking: labels.talking(), poofs: gameplay.poofs(), atlas: atlas.ready() }),
    }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pending = null;
      for (const v of views.splice(0).reverse()) {
        try {
          v.destroy();
        } catch (e) {
          console.warn('[town3d] overlay view destroy failed', e);
        }
      }
      atlas.destroy();
      surface.destroy();
    },
  };
}
