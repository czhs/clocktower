import type { Facing, LocationId, SelfControl, WorldSnapshot } from '@ct/protocol';

// Server-driven local avatar (bedtime escort, Storyteller "walk to", freeze).
//
// While WorldSnapshot.you is present the player does not control their avatar: the client stops
// predicting and shows its own entity where the server says, interpolated INTERP_DELAY_MS behind
// like TownScene.stepRemotes so the walk looks identical to everyone else's. When `you`
// disappears we keep interpolating until the last server sample has been reached, then hand
// control back (TownScene resumes prediction from that exact spot: no snap, no rubber-band).

const INTERP_DELAY_MS = 110; // keep equal to TownScene's
const MAX_SAMPLES = 12;
const STALE_MS = 600;

interface Sample {
  t: number;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

export interface Pose {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

export class SelfDriver {
  private samples: Sample[] = [];
  private loc: LocationId | null = null;
  /** `you` from the latest snapshot (undefined = the player is in control). */
  control: SelfControl | undefined;
  /** True from the first snapshot with `you` until the interpolation has caught up afterwards. */
  private active = false;
  private last: { x: number; y: number } | null = null;
  /** performance.now() of the first snapshot without `you` after a drive (null while driven). */
  private releasedAt: number | null = null;

  /** Feed every snapshot (own entity located by pid). */
  onSnapshot(s: WorldSnapshot, myPid: string | null): void {
    this.control = s.you;
    if (s.you) {
      this.active = true;
      this.releasedAt = null;
    } else if (this.active && this.releasedAt === null) this.releasedAt = performance.now();
    const e = myPid ? s.entities.find((x) => x.id === myPid) : undefined;
    if (!e) return;
    if (e.location !== this.loc) {
      // went through a door (TownScene gets the matching 'world:teleport'): never slide across the map
      this.samples = [];
      this.loc = e.location;
      this.last = null;
    }
    this.samples.push({ t: performance.now(), x: e.x, y: e.y, facing: e.facing, moving: e.moving });
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }

  /**
   * Pose to show this frame, or null when the player is in control. `me` = TownScene's current
   * local avatar (used while samples are missing or belong to another location).
   */
  pose(me: { x: number; y: number; location: LocationId; facing: Facing }): Pose | null {
    if (!this.active) return null;
    const s = this.samples;
    const still = (x: number, y: number, facing: Facing): Pose => ({ x, y, facing, moving: false });
    // No samples yet, or they are from the other side of a door teleport: hold where TownScene put us.
    if (!s.length || this.loc !== me.location) {
      if (!this.control) this.active = false;
      return this.active ? still(me.x, me.y, me.facing) : null;
    }
    const lastS = s[s.length - 1]!;
    const now = performance.now();
    if (this.control?.mode === 'frozen') {
      this.last = { x: lastS.x, y: lastS.y };
      return still(lastS.x, lastS.y, lastS.facing);
    }
    const renderAt = now - INTERP_DELAY_MS;
    // Release once the interpolation has reached the moment the server let go. (Comparing with the
    // LATEST sample never succeeds: own-entity samples keep arriving every ~83 ms < INTERP_DELAY.)
    if (!this.control && ((this.releasedAt !== null && renderAt >= this.releasedAt) || now - lastS.t > STALE_MS)) {
      this.releasedAt = null;
      // Released and caught up: final pose is the exact server spot, then hand back control.
      this.active = false;
      this.last = null;
      return null;
    }
    let x = lastS.x;
    let y = lastS.y;
    let ref = lastS;
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
    if (s.length === 1 && renderAt < lastS.t) ref = lastS;
    const stale = now - lastS.t > STALE_MS;
    const stepped = this.last ? Math.hypot(x - this.last.x, y - this.last.y) > 0.01 : false;
    this.last = { x, y };
    return { x, y, facing: ref.facing, moving: !stale && (stepped || ref.moving) };
  }

  /** Whether drive() is (still) overriding the local avatar. */
  isActive(): boolean {
    return this.active;
  }
}
