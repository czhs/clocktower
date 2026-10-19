// Renderer-free local movement (prediction) and remote interpolation, shared by the Phaser town and the
// v3 3D town. (v3 WP0: extracted from TownScene.stepLocal / sendMove / stepRemotes; no behaviour change.)
//
//   prediction   keys (or a tap route) -> PLAYER_SPEED × the Storyteller's travel multiplier, axis-separable
//                tile collision (protocol isBlockedPx) that never crosses into another location
//   moves        sent at MOVE_HZ while the pose changed, positions rounded to 1/100 px, seq increments
//   remotes      rendered INTERP_DELAY_MS in the past between snapshot samples; stale after STALE_MS
import { isBlockedPx, locationAt, PLAYER_SPEED, STORYTELLER_MAX_SPEED_MULT, type Facing, type LocationId, type TownLayout } from '@ct/protocol';
import { dir8, fromFacing, type Dir8 } from './input';

export const MOVE_HZ = 15;
export const INTERP_DELAY_MS = 110;
/** A remote whose last sample is older than this shows standing (ms). */
export const REMOTE_STALE_MS = 600;
/** A Storyteller sample jump larger than this is a teleport (poof, no slide) (px). */
export const ST_JUMP_PX = 48;
/** Snapshot samples kept per remote. */
export const MAX_SAMPLES = 12;
/** localPlayer store notifications (HUD subscribers) at most this often; get() is always current. */
export const LOCAL_PUBLISH_MS = 100;

export interface Vec {
  x: number;
  y: number;
}
export interface Route {
  pts: Vec[];
  /** A building to enter (or, inside it, leave) when the route ends. */
  enter: string | null;
}

/** Speed (px/s): PLAYER_SPEED, times the Storyteller's travel multiplier for the Storyteller. */
export function moveSpeed(storytellerMult: number | null): number {
  const mult = storytellerMult === null ? 1 : Math.min(STORYTELLER_MAX_SPEED_MULT, Math.max(1, storytellerMult));
  return PLAYER_SPEED * mult;
}

export type RouteStep =
  /** Nothing to follow. */
  | { kind: 'none' }
  /** The route ends at a door still in the anti-bounce cooldown: stand still until it ends. */
  | { kind: 'hold' }
  /** The last waypoint was reached: the route is over (enter = its building, if any). */
  | { kind: 'arrived'; enter: string | null }
  /** A waypoint was reached and dropped this frame (no movement this frame). */
  | { kind: 'advance' }
  /** Walk toward the next waypoint (unit vector). */
  | { kind: 'follow'; vx: number; vy: number };

/** One frame of tap-route following (only called while no movement key is held). Drops reached waypoints. */
export function routeStep(route: Route | null, me: Vec, enterCooldown: boolean): RouteStep {
  if (!route) return { kind: 'none' };
  const next = route.pts[0];
  // A door at the end of the route waits out the anti-bounce cooldown (a tap right after leaving would
  // otherwise be dropped silently; Isaac's doors.spec), then goes through.
  if (!next && route.enter && enterCooldown) return { kind: 'hold' };
  if (!next) return { kind: 'arrived', enter: route.enter };
  const dx = next.x - me.x;
  const dy = next.y - me.y;
  const dd = Math.hypot(dx, dy);
  if (dd < 2) {
    route.pts.shift();
    return { kind: 'advance' };
  }
  return { kind: 'follow', vx: dx / dd, vy: dy / dd };
}

/**
 * Move `me` by `step` px along the unit vector (vx, vy) against the tile collision, x then y, never into
 * another location. Mutates and returns `me`; `moved` = it actually moved (> 0.01 px).
 */
export function integrateStep(layout: TownLayout, me: Vec & { location: LocationId }, vx: number, vy: number, step: number): { moved: boolean } {
  const nx = me.x + vx * step;
  const ny = me.y + vy * step;
  const x0 = me.x;
  const y0 = me.y;
  if (!isBlockedPx(layout, nx, me.y) && locationAt(layout, nx, me.y) === me.location) me.x = nx;
  if (!isBlockedPx(layout, me.x, ny) && locationAt(layout, me.x, ny) === me.location) me.y = ny;
  return { moved: Math.hypot(me.x - x0, me.y - y0) > 0.01 };
}

export interface SentPose {
  x: number;
  y: number;
  moving: boolean;
  facing: Facing;
}
/** The pose differs from the last one sent (a move message is due at the next MOVE_HZ slot). */
export function poseChanged(me: SentPose, last: SentPose): boolean {
  return Math.abs(me.x - last.x) > 0.05 || Math.abs(me.y - last.y) > 0.05 || me.moving !== last.moving || me.facing !== last.facing;
}
/** Position as sent on the wire (1/100 px). */
export const wirePx = (v: number) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------------------------ remotes

export interface Sample {
  t: number;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

/** The interpolated position at `renderAt` (ms, same clock as the samples) and the sample it is heading to. */
export function interpolate(s: readonly Sample[], renderAt: number): { x: number; y: number; ref: Sample } | null {
  if (!s.length) return null;
  let x = s[s.length - 1]!.x;
  let y = s[s.length - 1]!.y;
  let ref = s[s.length - 1]!;
  for (let i = s.length - 1; i > 0; i--) {
    const s0 = s[i - 1]!;
    const s1 = s[i]!;
    if (s0.t <= renderAt && renderAt <= s1.t) {
      const k = s1.t === s0.t ? 1 : (renderAt - s0.t) / (s1.t - s0.t);
      x = s0.x + (s1.x - s0.x) * k;
      y = s0.y + (s1.y - s0.y) * k;
      ref = s1;
      break;
    }
    if (i === 1 && renderAt < s0.t) {
      x = s0.x;
      y = s0.y;
      ref = s0;
    }
  }
  return { x, y, ref };
}

/** A remote's 8-way facing: from its motion while moving, else the server facing (cardinal directions only). */
export function remoteDir(prev: Dir8, moving: boolean, mx: number, my: number, refFacing: Facing): Dir8 {
  if (moving && Math.hypot(mx, my) > 0.25) return dir8(mx, my);
  if (!moving && (prev === 'left' || prev === 'right' || prev === 'up' || prev === 'down') && prev !== refFacing) return fromFacing(refFacing);
  return prev;
}

/** Add a snapshot sample (keeps the last MAX_SAMPLES). Returns the samples array to keep (a new one after a reset). */
export function pushSample(samples: Sample[], sample: Sample): Sample[] {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  return samples;
}
