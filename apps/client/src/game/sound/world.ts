import { townLayout } from '@ct/assets';
import type { LocationId } from '@ct/protocol';
import { ambientMix, surfaceAt, type Surface } from './areas';
import { LOOP_IDS, type ClipId } from './catalog';
import { mulberry32, type SoundEngine } from './engine';

// The world sound director: per frame it turns (local player, VISIBLE entities, PUBLIC phase) into
// ambience levels, footsteps and night calls. Inputs are deliberately minimal:
//   - ambience and owls use only the local player's own position/location and the public phase;
//   - remote footsteps/doors use only entities that are in the local player's own location (the
//     same rule TownScene uses to show avatars), so at night a player hears the Storyteller only
//     when the Storyteller is visibly in their own home.
// Every random choice comes from a stream that only these legitimate inputs advance.

export interface Listener {
  x: number;
  y: number;
  location: LocationId;
}
export interface Entity extends Listener {
  id: string;
}
export interface FrameInput {
  me: (Listener & { id: string | null }) | null;
  /** Entities from world snapshots (any location: filtered here). */
  others: Iterable<Entity>;
  /** The public game phase ('waiting' outside a game). */
  phase: string;
}

/** Pixels walked per footstep (PLAYER_SPEED 72 px/s → ~2.8 steps/s). */
export const STRIDE = 26;
/** A position jump larger than this in one frame is a teleport: no steps. */
const TELEPORT_PX = 48;
/** Remote footsteps fade out to nothing at this distance (px). */
const HEAR_PX = 190;
/** At most this many remote walkers are heard (nearest first). */
const MAX_REMOTE_WALKERS = 4;
const DOOR_PX = 28;
const AMBIENT_HZ = 10;

const STEP_CLIP: Record<Surface, ClipId> = { cobble: 'step-cobble', grass: 'step-grass', wood: 'step-wood', gravel: 'step-gravel' };

interface Walker {
  x: number;
  y: number;
  acc: number;
  step: number;
}

export class SoundDirector {
  private local: (Walker & { location: LocationId }) | null = null;
  private remotes = new Map<string, Walker>();
  private remoteLoc: LocationId | null = null;
  private lastAmbient = -Infinity;
  private nextOwl = Infinity;
  // Separate random streams: local steps, remote steps, ambience (night calls).
  private rngLocal: () => number;
  private rngRemote: () => number;
  private rngAmb: () => number;

  constructor(
    private engine: SoundEngine,
    seed = 0xc10c,
  ) {
    this.rngLocal = mulberry32(seed ^ 0x11);
    this.rngRemote = mulberry32(seed ^ 0x22);
    this.rngAmb = mulberry32(seed ^ 0x33);
  }

  /** Call once per animation frame. `now` is in seconds (any monotonic clock). */
  frame(input: FrameInput, now: number): void {
    const me = input.me;
    if (!me) {
      this.local = null;
      this.remotes.clear();
      return;
    }
    this.localSteps(me);
    this.remoteSteps(me, input.others);
    if (now - this.lastAmbient >= 1 / AMBIENT_HZ) {
      this.lastAmbient = now;
      this.ambience(me, input.phase, now);
    }
  }

  // --- ambience ------------------------------------------------------------------------------

  private ambience(me: Listener, phase: string, now: number): void {
    const { loops, calls } = ambientMix(me.location, me.x, me.y, phase);
    for (const id of LOOP_IDS) {
      const l = loops[id];
      this.engine.setLoop(id, l.level, { lowpass: l.lowpass, warm: l.warm });
    }
    // Sporadic owls: a Poisson-ish timer driven only by time and the listener's own spot.
    if (calls.owlsPerMin <= 0) {
      this.nextOwl = Infinity;
      return;
    }
    const mean = 60 / calls.owlsPerMin;
    if (!Number.isFinite(this.nextOwl)) this.nextOwl = now + mean * (0.3 + this.rngAmb());
    if (now >= this.nextOwl) {
      const r = this.rngAmb;
      this.engine.play('owl', { variant: 1 + Math.floor(r() * 3), pan: (r() * 2 - 1) * 0.7, gain: 0.5 + 0.5 * r(), rate: 0.95 + 0.1 * r(), lowpass: calls.lowpass });
      this.nextOwl = now + mean * (0.5 + r());
    }
  }

  // --- footsteps -----------------------------------------------------------------------------

  private localSteps(me: Listener & { id: string | null }): void {
    const l = this.local;
    if (!l || l.location !== me.location || Math.hypot(me.x - l.x, me.y - l.y) > TELEPORT_PX) {
      this.local = { x: me.x, y: me.y, acc: STRIDE * 0.6, step: 0, location: me.location };
      return;
    }
    l.acc += Math.hypot(me.x - l.x, me.y - l.y);
    l.x = me.x;
    l.y = me.y;
    if (l.acc >= STRIDE) {
      l.acc %= STRIDE;
      const r = this.rngLocal;
      this.engine.play(STEP_CLIP[surfaceAt(me.x, me.y)], { variant: 1 + ((l.step++ + Math.floor(r() * 3)) % 4), rate: 0.93 + 0.14 * r(), gain: 0.85 + 0.15 * r() });
    }
  }

  private remoteSteps(me: Listener & { id: string | null }, others: Iterable<Entity>): void {
    // Changing room: forget everyone (no door/step sounds from the old place), and take the people
    // already in the new place as they are (no door sounds for them on this first frame).
    const seeding = this.remoteLoc !== me.location;
    if (seeding) {
      this.remoteLoc = me.location;
      this.remotes.clear();
    }
    const seen = new Set<string>();
    const due: { e: Entity; d: number; w: Walker }[] = [];
    for (const e of others) {
      // THE night-leak gate: only entities in our own location are audible (as they are visible).
      if (e.id === me.id || e.location !== me.location) continue;
      seen.add(e.id);
      const w = this.remotes.get(e.id);
      if (!w) {
        this.remotes.set(e.id, { x: e.x, y: e.y, acc: 0, step: 0 });
        if (!seeding && this.nearDoor(me.location, e.x, e.y)) this.remoteDoor(me, e.x, e.y);
        continue;
      }
      const moved = Math.hypot(e.x - w.x, e.y - w.y);
      w.x = e.x;
      w.y = e.y;
      if (moved > TELEPORT_PX) {
        w.acc = 0;
        continue;
      }
      w.acc += moved;
      if (w.acc >= STRIDE) {
        w.acc %= STRIDE;
        const d = Math.hypot(e.x - me.x, e.y - me.y);
        if (d < HEAR_PX) due.push({ e, d, w });
      }
    }
    for (const [id, w] of this.remotes)
      if (!seen.has(id)) {
        if (this.nearDoor(me.location, w.x, w.y)) this.remoteDoor(me, w.x, w.y);
        this.remotes.delete(id);
      }
    due.sort((a, b) => a.d - b.d);
    for (const { e, d, w } of due.slice(0, MAX_REMOTE_WALKERS)) {
      const r = this.rngRemote;
      const att = (1 - d / HEAR_PX) ** 2;
      this.engine.play(STEP_CLIP[surfaceAt(e.x, e.y)], {
        variant: 1 + (w.step++ % 4),
        gain: 0.8 * att,
        pan: Math.max(-0.8, Math.min(0.8, (e.x - me.x) / 160)),
        rate: 0.93 + 0.14 * r(),
      });
    }
  }

  private nearDoor(location: LocationId, x: number, y: number): boolean {
    const ts = townLayout.tileSize;
    for (const b of townLayout.buildings) {
      const p = location === 'outdoors' ? b.door : location === `bld:${b.id}` ? b.interiorDoor : null;
      if (p && Math.hypot((p.x + 0.5) * ts - x, (p.y + 0.5) * ts - y) <= DOOR_PX) return true;
    }
    return false;
  }

  private remoteDoor(me: Listener, x: number, y: number): void {
    const d = Math.hypot(x - me.x, y - me.y);
    if (d >= HEAR_PX * 1.5) return;
    this.engine.play('door', { gain: 0.6 * (1 - d / (HEAR_PX * 1.5)) ** 2, pan: Math.max(-0.8, Math.min(0.8, (x - me.x) / 160)) });
  }
}
