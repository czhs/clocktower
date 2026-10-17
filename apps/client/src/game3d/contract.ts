// v3 WP0 (v3-lead). The shared interfaces of the 3D town (docs/v3/INTEGRATION.md §1.4). Every package
// (net/, input/, avatars/, world/, overlay/, debug/) builds against these; no three.js type leaks out of
// game3d/ through them. Coordinate rule: every value that crosses a package boundary is in v2 world px
// (y down, FEET positions) plus a LocationId; metres exist only inside drawing code, via coords.ts.
import type { Facing, GamePhase, LocationId, PlayerGameView, StorytellerGameView, TownLayout, WorldId } from '@ct/protocol';
import type { TownBridge } from '../game/TownScene';

export type Tier = 'low' | 'high';
export type RendererKind = 'v3' | 'classic';
export type FallbackReason = 'perf' | 'error';

/** The bridge GameScreen hands to either renderer. Classic ignores `requestFallback`. */
export interface TownBridge3d extends TownBridge {
  /** Ask GameScreen to swap this 3D town for Classic in place ('perf': too slow, 'error': crash / context loss). */
  requestFallback?(reason: FallbackReason): void;
}

/** A mounted town (either renderer). */
export interface TownHandle {
  destroy(): void;
  /**
   * Resolves once the town is drawn (v3: after the build and the shader warm-up, just before the loop
   * starts); rejects when the build crashes (the fallback has then already been requested). GameScreen keeps
   * its loading state until then. Absent = ready at once (Classic).
   */
  ready?: Promise<void>;
}

export interface Px {
  /** v2 world px, y-down, FEET */
  x: number;
  y: number;
}

export interface Pose {
  pid: string;
  x: number;
  y: number;
  location: LocationId;
  facing: Facing;
  moving: boolean;
}

export interface MemberLook {
  name: string;
  /** v2 cast id ('storyteller' for the Storyteller). */
  castId: string;
  seat: number | null;
  role: 'player' | 'storyteller';
}

/** Written by net/ once per frame, read by every layer. */
export interface Scene3dState {
  me: Pose | null;
  myPid: string | null;
  amStoryteller: boolean;
  /** Already interpolated (INTERP_DELAY_MS). */
  remotes: ReadonlyMap<string, Pose>;
  members: ReadonlyMap<string, MemberLook>;
  game: PlayerGameView | StorytellerGameView | null;
  phase: GamePhase | 'waiting' | 'finished';
  layout: TownLayout;
  world: WorldId;
  tier: Tier;
  reducedMotion: boolean;
  /** Game hour 0..24 (§3.1). */
  hour: number;
}

/** One package's contribution to the frame. Layers run in registration order after the state update. */
export interface Layer3d {
  update(state: Scene3dState, t: number, dt: number): void;
  destroy(): void;
  /** Members merged into window.__ctCamera by debug/ (only when the debug hook is on). */
  debug?(): Record<string, () => unknown>;
}

/** Implemented by input/camera over coords.ts. */
export interface View3d {
  /** Page CSS px of a world point (§1.5); null when it is off the canvas or not in the shown location. */
  worldToScreen(p: Px, location: LocationId, heightM?: number): { x: number; y: number } | null;
  /** The world point under page CSS px (§3 "ST taps"). */
  screenToWorld(cssX: number, cssY: number): (Px & { location: LocationId; houseId?: string }) | null;
  /** CSS px per v2 px at the focus (≈ zoom). */
  cssPerPx(): number;
}

export interface Anchor3d {
  feet: Px;
  displayFeet: Px;
  headTopCss: { x: number; y: number };
  heightM: number;
}

export interface AvatarDebug {
  texture: string;
  frame: string;
  width: number;
  height: number;
  x: number;
  y: number;
  screen: { x: number; y: number; w: number; h: number };
}

export interface AvatarRegistry {
  anchorOf(pid: string): Anchor3d | null;
  pidAt(cssX: number, cssY: number): string | null;
  debug(pid: string): AvatarDebug | null;
}
