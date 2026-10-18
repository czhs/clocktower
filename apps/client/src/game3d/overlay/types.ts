// v3 WP4 (v3-overlay). Shared types of the overlay views (overlay/index.ts composes them).
import type { LocationId } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import type { GameplayFrame } from '../../game/gameplay/core';
import type { AvatarRegistry, Px, Scene3dState, View3d } from '../contract';
import type { Atlas, Tod, Tokens } from './atlas';
import type { Rect } from './anchors';
import type { OverlayStats } from './place';
import type { FxCanvas, OverlaySurface } from './surface';

/** What the composition root (TownGame3d) hands the overlay. */
export interface OverlayDeps {
  /** The town parent (`.ct-game-canvas`); the overlay root is appended to it. */
  parent: HTMLElement;
  /** The element that receives the town's pointer events (the 3D canvas). Default: `parent`. */
  surface?: HTMLElement;
  conn: Pick<RoomConnection, 'events' | 'lobbyView' | 'gameView' | 'send'>;
  view: View3d;
  avatars: AvatarRegistry;
  /** WP1's gameplay core frame of this tick (gameplay/core.ts frame(); call it once per frame), or null. */
  gameplay?: () => GameplayFrame | null;
  /** The UI texel scale (engine.pixelScale; pass it). Default: coords.ts pixelScaleFor(overlay height, tier). */
  pixelScale?: () => number;
  /**
   * Page CSS px of a world point in the shown location WITHOUT the on-canvas clip (hint edge markers).
   * Default: the view's own `project(p, location, heightM)` when it has one (WP1 Camera3d does), else none
   * (then off-screen targets get no edge marker). CONTRACT-REQUEST(WP1): an optional `View3d.projectUnclipped`.
   */
  projectUnclipped?: (p: Px, location: LocationId, heightM?: number) => { x: number; y: number } | null;
  /**
   * The avatar of `pid` is drawn in the viewer's location (it has a body and is shown), regardless of the
   * camera. Default: the registry's `isShown(pid)` when it has one, else "had an anchor since it entered the
   * viewer's location". CONTRACT-REQUEST(WP2): an optional `AvatarRegistry.isShown(pid)`.
   */
  avatarShown?: (pid: string) => boolean;
  /** Turn the local avatar toward a world point (pointing). WP1. */
  faceToward?(x: number, y: number): void;
  /** Run the town's normal primary tap at page CSS px without asking the social layer again. WP1. */
  passTap?(cssX: number, cssY: number): void;
  /**
   * The social view listens to the surface's pointer events itself (harness without WP1's input layer).
   * Default false: WP1's input/pointer.ts forwards them to `OverlayLayer.socialSink` (setSocial).
   */
  ownPointerInput?: boolean;
  /** Install `window.__ctSocial` (when ct.debug.social = '1') from the social view. Default true; false = the
   *  host installs it from `OverlayLayer.social.debugMembers()` (e.g. WP1's debug/hooks.ts installSocialHook). */
  socialHook?: boolean;
  /** Disable the social view (tests / harness). Default: on. */
  social?: boolean;
}

/** One avatar the 3D town draws this frame (yourself or a remote in your location), as the overlay sees it. */
export interface DrawnAvatar {
  pid: string;
  name: string;
  castId: string;
  storyteller: boolean;
  /** Publicly dead (game view). */
  ghost: boolean;
  me: boolean;
  feet: Px;
  heightM: number;
  /** Head top, root-local CSS px. */
  head: { x: number; y: number };
  /** Feet on the ground, root-local CSS px (null when not projectable). */
  foot: { x: number; y: number } | null;
  /** The name label box (root-local CSS px), filled by the labels view; null = no label drawn. */
  label: Rect | null;
  /** Top (root-local CSS px) of the person pins stacked over the label, filled by the social view; null = none. */
  stackTop: number | null;
}

/** Everything a view needs for one overlay frame (one object, reused). */
export interface OverlayFrame {
  state: Scene3dState;
  /** performance.now() ms. */
  now: number;
  dt: number;
  px: number;
  w: number;
  h: number;
  night: boolean;
  tod: Tod;
  tokens: Tokens;
  still: boolean;
  location: LocationId;
  /** CSS px per metre at the focus (View3d.cssPerPx() × 16). */
  cssPerM: number;
  fx: FxCanvas;
  /** The drawn avatars whose head can be projected this frame (on the canvas). */
  avatars: DrawnAvatar[];
  byPid: Map<string, DrawnAvatar>;
  /**
   * Every avatar drawn in the viewer's location, on screen or not ("drawn" ≠ "on screen": bubbles and pins of a
   * speaker whose head is momentarily off the canvas survive; only their drawing is skipped).
   */
  drawn: ReadonlySet<string>;
  /** World px (+ height) -> root-local CSS px in the shown location, or null when off the canvas. Writes into `out` when given. */
  project(p: Px, heightM?: number, out?: { x: number; y: number }): { x: number; y: number } | null;
  /** project() without the on-canvas clip (null when no unclipped projection is available). */
  projectFree(p: Px, heightM?: number, out?: { x: number; y: number }): { x: number; y: number } | null;
}

export interface OverlayEnv {
  deps: OverlayDeps;
  surface: OverlaySurface;
  atlas: Atlas;
  stats: OverlayStats;
}

/** One overlay view. */
export interface OverlayView {
  update(f: OverlayFrame): void;
  destroy(): void;
}
