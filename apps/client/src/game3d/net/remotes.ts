// v3 WP1 (v3-core). Remote entities of the 3D town (docs/v3/INTEGRATION.md §3 "Remote avatars", "localPlayer /
// remoteEntities writers"): snapshot samples in, interpolated poses out.
//
//   ingest(snapshot)   one WorldSnapshot: samples per remote (reset on a location change or a Storyteller jump
//                      > ST_JUMP_PX), remotes that left the snapshot are dropped (and leave remoteEntities)
//   step(now)          interpolates every remote INTERP_DELAY_MS in the past into `poses` (v2 px, the same
//                      Pose objects every frame) and into the shared `remoteEntities` map (voice / sound / HUD)
//   events             'poof' (the Storyteller appears / disappears / jumps in the viewer's location) and 'door'
//                      (a remote went through a door: in -> its building, out -> outdoors) for the drawing layers
//
// Pure logic over the extracted rules (game/rules/movement.ts); no three, no DOM. Secrecy: only what the
// server's snapshot contains is ever stored; drawers additionally show a remote only in the viewer's location.
import type { EntityState, Facing, LocationId, WorldSnapshot } from '@ct/protocol';
import { remoteEntities } from '../../net/localPlayer';
import { fromFacing, type Dir8 } from '../../game/rules/input';
import { interpolate, INTERP_DELAY_MS, pushSample, remoteDir, REMOTE_STALE_MS, ST_JUMP_PX, type Sample } from '../../game/rules/movement';
import type { Pose } from '../contract';

export interface PoofEvent {
  pid: string;
  x: number;
  y: number;
  location: LocationId;
  /** 'in' = appeared here, 'out' = left from here. */
  kind: 'in' | 'out';
}

export interface DoorEvent {
  pid: string;
  /** The building whose door was used. */
  buildingId: string;
  /** 'enter' = outdoors -> inside, 'leave' = inside -> outdoors. */
  kind: 'enter' | 'leave';
  /** Where the door is seen from (the location the viewer must be in to see the door move). */
  seenFrom: LocationId;
}

export interface RemoteEvents {
  poof(e: PoofEvent): void;
  door(e: DoorEvent): void;
}

interface Remote {
  pid: string;
  samples: Sample[];
  location: LocationId;
  dir: Dir8;
  last: { x: number; y: number };
  /** A sample was interpolated at least once (the pose is meaningful). */
  placed: boolean;
}

export interface RemoteTrackerCtx {
  /** Is this pid the Storyteller (poofs instead of slides)? */
  isStoryteller(pid: string): boolean;
  /** The viewer's current location (poofs only where the viewer is). */
  myLocation(): LocationId;
  /** The viewer is placed (before the first teleport nothing is shown, no poofs). */
  ready(): boolean;
  /** Write remoteEntities (default true; tests may switch it off). */
  shareEntities?: boolean;
}

export type RemotePose = Pose & { dir: Dir8; stale: boolean };

const isBuilding = (l: LocationId): l is `bld:${string}` => l !== 'outdoors';

export class RemoteTracker {
  private readonly remotes = new Map<string, Remote>();
  private readonly out = new Map<string, RemotePose>();
  private readonly listeners = new Map<keyof RemoteEvents, Set<(e: never) => void>>();
  private readonly share: boolean;

  constructor(private readonly ctx: RemoteTrackerCtx) {
    this.share = ctx.shareEntities !== false;
  }

  on<K extends keyof RemoteEvents>(kind: K, fn: RemoteEvents[K]): () => void {
    let set = this.listeners.get(kind);
    if (!set) this.listeners.set(kind, (set = new Set()));
    const f = fn as (e: never) => void;
    set.add(f);
    return () => set.delete(f);
  }
  private emit<K extends keyof RemoteEvents>(kind: K, e: Parameters<RemoteEvents[K]>[0]): void {
    for (const fn of (this.listeners.get(kind) ?? []) as Set<(e: unknown) => void>) {
      try {
        fn(e);
      } catch (err) {
        console.warn(`[town3d] ${kind} listener failed`, err);
      }
    }
  }

  /** One snapshot's entities (the viewer's own entity is skipped by pid). `now` = performance.now(). */
  ingest(entities: readonly EntityState[], myPid: string | null, now: number): void {
    const seen = new Set<string>();
    const here = this.ctx.myLocation();
    const ready = this.ctx.ready();
    for (const e of entities) {
      if (e.id === myPid) continue;
      seen.add(e.id);
      const st = this.ctx.isStoryteller(e.id);
      let r = this.remotes.get(e.id);
      if (!r) {
        r = { pid: e.id, samples: [], location: e.location, dir: fromFacing(e.facing), last: { x: e.x, y: e.y }, placed: false };
        this.remotes.set(e.id, r);
        if (st && ready && e.location === here) this.emit('poof', { pid: e.id, x: e.x, y: e.y, location: e.location, kind: 'in' });
      }
      if (r.location !== e.location) {
        const from = r.location;
        // through a door: the door moves for whoever sees it (outdoors for 'enter', inside for 'leave')
        if (from === 'outdoors' && isBuilding(e.location)) this.emit('door', { pid: e.id, buildingId: e.location.slice(4), kind: 'enter', seenFrom: 'outdoors' });
        else if (isBuilding(from) && e.location === 'outdoors') this.emit('door', { pid: e.id, buildingId: from.slice(4), kind: 'leave', seenFrom: from });
        r.samples = [];
        r.location = e.location;
      }
      const lastS = r.samples[r.samples.length - 1];
      if (lastS && st && Math.hypot(lastS.x - e.x, lastS.y - e.y) > ST_JUMP_PX) {
        // a Storyteller jump (teleport): poof out, poof in, no sliding across the square
        if (r.location === here && ready) {
          this.emit('poof', { pid: e.id, x: lastS.x, y: lastS.y, location: r.location, kind: 'out' });
          this.emit('poof', { pid: e.id, x: e.x, y: e.y, location: r.location, kind: 'in' });
        }
        r.samples = [];
      }
      pushSample(r.samples, { t: now, x: e.x, y: e.y, facing: e.facing, moving: e.moving });
    }
    for (const [pid, r] of this.remotes)
      if (!seen.has(pid)) {
        if (this.ctx.isStoryteller(pid) && ready && r.location === here && r.placed) this.emit('poof', { pid, x: r.last.x, y: r.last.y, location: r.location, kind: 'out' });
        this.remotes.delete(pid);
        this.out.delete(pid);
        if (this.share) remoteEntities.delete(pid);
      }
  }

  /** Convenience: ingest a whole snapshot. */
  ingestSnapshot(s: WorldSnapshot, myPid: string | null, now: number): void {
    this.ingest(s.entities, myPid, now);
  }

  /** Interpolate every remote at `now - INTERP_DELAY_MS` (ms, performance.now() clock). */
  step(now: number): void {
    const renderAt = now - INTERP_DELAY_MS;
    for (const [pid, r] of this.remotes) {
      const at = interpolate(r.samples, renderAt);
      if (!at) continue;
      const stale = now - r.samples[r.samples.length - 1]!.t > REMOTE_STALE_MS;
      const moving = at.ref.moving && !stale;
      r.dir = remoteDir(r.dir, moving, at.x - r.last.x, at.y - r.last.y, at.ref.facing);
      r.last.x = at.x;
      r.last.y = at.y;
      r.placed = true;
      let p = this.out.get(pid);
      if (!p) {
        p = { pid, x: at.x, y: at.y, location: r.location, facing: at.ref.facing, moving, dir: r.dir, stale };
        this.out.set(pid, p);
      }
      p.x = at.x;
      p.y = at.y;
      p.location = r.location;
      p.facing = facingOf(r.dir, at.ref.facing);
      p.moving = moving;
      p.dir = r.dir;
      p.stale = stale;
      if (this.share) {
        const e = remoteEntities.get(pid);
        if (e) {
          e.x = at.x;
          e.y = at.y;
          e.location = r.location;
        } else remoteEntities.set(pid, { x: at.x, y: at.y, location: r.location });
      }
    }
  }

  /** Interpolated poses (live map, same objects every frame; only remotes placed at least once). */
  poses(): ReadonlyMap<string, RemotePose> {
    return this.out;
  }

  /** Pids in a location (sorted: the Storyteller last, then by pid — the v2 occupants order). */
  inLocation(location: LocationId): string[] {
    const list: string[] = [];
    for (const [pid, r] of this.remotes) if (r.location === location) list.push(pid);
    return list.sort((a, b) => Number(this.ctx.isStoryteller(a)) - Number(this.ctx.isStoryteller(b)) || (a < b ? -1 : 1));
  }

  /**
   * Drop one pid silently (no poof, no door): the viewer's own entity, stored as a remote because a snapshot came
   * before lobby:view told us our pid.
   */
  forget(pid: string): void {
    if (!this.remotes.delete(pid)) return;
    this.out.delete(pid);
    if (this.share) remoteEntities.delete(pid);
  }

  has(pid: string): boolean {
    return this.remotes.has(pid);
  }

  clear(): void {
    if (this.share) for (const pid of this.remotes.keys()) remoteEntities.delete(pid);
    this.remotes.clear();
    this.out.clear();
  }
}

/** 4-way server facing for an 8-way display direction (diagonals keep the reference's axis). */
function facingOf(d: Dir8, ref: Facing): Facing {
  if (d === 'left' || d === 'right' || d === 'up' || d === 'down') return d;
  const h: Facing = d.endsWith('right') ? 'right' : 'left';
  const v: Facing = d.startsWith('up') ? 'up' : 'down';
  return ref === h || ref === v ? ref : v;
}
