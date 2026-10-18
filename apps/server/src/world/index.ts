// OWNED BY world-art. Authoritative positions, movement validation (speed + swept collision),
// doors and their phase-based access rules, bedtime/night relocation and per-viewer visibility.
//
// Visibility (snapshotFor):
//   storyteller            -> every entity
//   night / first_night    -> a player sees only entities inside their own home
//                             (so a visiting Storyteller is visible only to the visited player)
//   everything else        -> entities in the same location (outdoors <-> outdoors, same interior)
//
// Doors (v2 one-screen town): ENTERING needs the player outdoors within DOOR_RANGE_PX of the
// building's outdoor door tile (the client sends 'world:useDoor' when it walks into the doorway; the
// tile sits below the footprint for 'south' cottages and beside it for 'east'/'west' ones). Entering
// puts you on the building's interior door spot (just above the doorway in the room's bottom wall).
// EXITING works from anywhere inside: the HUD's "Leave" button, or (client side) walking down
// through the doorway / tapping it — both are the same 'world:useDoor'.
//
// Interiors (v2.2) are small walkable rooms in the same coordinate space: walls, the doorway and the
// furniture (bed, hearth, table, …) are in layout.collision, so handleMove validates moves inside
// exactly like outdoors (speed + burst budget, swept collision, same-location rule, corrections) and
// a move can never cross into another location (only doors change location). Server-driven walks
// still leave a building at once (no interior leg) and enter straight to their destination inside
// (the bed for escorts); within one location (e.g. home -> bed at nightfall) they path-find (path.ts).
//
// Door access for players (the Storyteller may always use any door):
//   waiting / setup / day / bedtime / finished -> may enter and exit any building
//   night / first_night / dawn                 -> locked inside their own home (cannot exit);
//                                                 if somehow outdoors, may only enter their own home
//
// Storyteller placement around the night (night-visit secrecy, docs/world-audit.md):
//   night starts  -> an ST standing inside a cottage is moved to its doorstep (outdoors, unseen)
//   dawn / day    -> the ST is returned to the storyteller spawn, so nobody can infer the last visit
//                    from where the ST stands when the doors unlock
//
// Walking, not teleporting (gameplay, 2026-10-15):
//   bedtime       -> players walk home themselves (no relocation at the bell)
//   overtime      -> setEscort(true) when the countdown ends: every seated player not inside their own
//                    home is walked there by the server (A* through doors at walking speed, see
//                    path.ts); players already home cannot leave. The client shows its own avatar at
//                    the server position while `snapshot.you` says 'auto'.
//   night starts  -> a player who is home but not in bed walks to bed; ONLY a player still not home
//                    (the Storyteller forced the night) is teleported to bed ("absolutely necessary")
//   morning       -> nobody is moved: players wake in bed and walk out (doors unlock at day)
//   Storyteller   -> explicit teleport / walk_to / freeze / door locks / circle seats (stage API)
import { townLayout } from '@ct/assets';
import {
  circleSpots,
  CIRCLE_SEATED_PX,
  DEFAULT_ST_SETTINGS,
  homeBuilding,
  locationAt,
  MOVE_TOLERANCE,
  PLAYER_SPEED,
  STORYTELLER_MAX_SPEED_MULT,
  tileCenterPx,
  type BuildingDef,
  type C2SParsed,
  type EntityState,
  type Facing,
  type GamePhase,
  type LocationId,
  type SelfControl,
  type StagePlayerView,
  type StagePresence,
  type StageTarget,
  type StageView,
  type DoorTag,
  type StSettings,
  type TownLayout,
  type WorldSnapshot,
  type WorldTeleport,
} from '@ct/protocol';
import type { RoomEvent, RoomHost, WorldModule } from '../rooms/modules.js';
import { blockedPx as isBlockedPx, findPath, nearestFree, type Pt } from './path.js';

/**
 * Max seconds of travel the client may lead its last accepted position by. Moves arrive in bursts
 * on lossy links (a 200-600 ms stall + 300 ms RTT, then a catch-up burst); the budget keeps
 * accumulating at the max speed for up to this long, so physically plausible catch-up is accepted
 * while sustained speed hacks (budget refills at only MOVE_TOLERANCE x walking speed) and long-range
 * teleports stay impossible. The swept collision check stays strict. (v2: 2 -> 1.5 s when walking went
 * 72 -> 150 px/s, so the longest single accepted jump stays ~300 px and still covers a 0.9 s stall.)
 */
export const BURST_SECONDS = 1.5;
/**
 * After the server told a client where it is (door / Storyteller teleport, correction), moves that
 * were already in flight still describe the old position. Within this window failing moves are
 * dropped silently (never applied): the client is already being snapped to the server position, and
 * correcting every in-flight move would multiply the rubber-banding on slow links (RTT p95 ~800 ms).
 */
const SYNC_GRACE_MS = 1500;
/** Flat slack for rounding / jitter (px). */
const SLACK_PX = 3;
/** Door "use" radius from the door tile centre (px). */
export const DOOR_RANGE_PX = 22;
/** Sweep step for collision checks along a move segment (px). */
const SWEEP_STEP = 2;
/**
 * (v3 perf) The Storyteller's stage view (presence dots, door locks) is re-checked at most every this many
 * ms instead of on every 24 Hz tick, and a change re-projects ONLY the Storyteller's game:view
 * (`host.markGameDirtyFor`). Before, every presence flip (a player starting / stopping, each door of a
 * server-driven walk) re-projected and stringified all viewers and sent the ST a full ~10 KB view: up to
 * ~9 views/s (~90 KB/s to the ST) while the town walks home. Players' views never contain the stage.
 */
export const STAGE_CHECK_MS = 250;
/**
 * (v3 perf) A change that is ONLY players flipping between 'walking' and 'outdoors' (start / stop: with 15 players
 * that is several per second all day long, measured 4.4 ST views/s) refreshes the stage at most this often.
 * Everything else (home / seated / inside / escorted / frozen / doors / the ST's own place) within STAGE_CHECK_MS.
 */
export const STAGE_WALKING_MS = 1000;

interface Entity {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  location: LocationId;
  lastSeq: number;
  /** Distance budget (px) the client may still travel; refilled over time at the max speed. */
  budget: number;
  budgetAt: number;
  /** Last time the server sent this client its position (teleport / correction), for SYNC_GRACE_MS. */
  syncedAt: number;
  /** Where the client believed it was when that sync was sent (in-flight moves continue from here). */
  preSync: { x: number; y: number; location: LocationId } | null;
  /** Highest seq dropped silently inside the grace window: corrected later unless a newer move is accepted (B6). */
  droppedSeq: number;
  /** Storyteller froze this player's own movement. */
  frozen: boolean;
  /** Server-driven walk in progress. */
  walk: Walk | null;
}

interface Dest {
  location: LocationId;
  x: number;
  y: number;
  facing?: Facing;
}

interface Walk {
  goal: NonNullable<SelfControl['goal']>;
  dest: Dest;
  /** Bedtime escort (ends when setEscort(false)). */
  escort: boolean;
  /** Remaining waypoints of the current leg (current location). */
  pts: Pt[];
  /** Door to pass at the end of the current leg (building id), if any. */
  door: { building: string; exit: boolean } | null;
}

export interface WorldOptions {
  layout?: TownLayout;
}

const LOCKED_PHASES: ReadonlySet<GamePhase> = new Set(['first_night', 'night', 'dawn']);
const NIGHT_PHASES: ReadonlySet<GamePhase> = new Set(['first_night', 'night']);

export function createWorldModule(host: RoomHost, opts: WorldOptions = {}): WorldModule {
  const layout = opts.layout ?? townLayout;
  const entities = new Map<string, Entity>();
  const buildingById = new Map(layout.buildings.map((b) => [b.id, b]));
  const travelMult = new Map<string, number>();
  let phase: GamePhase | null = null;
  const seatOverride = new Map<string, number>();
  /** Nomination circle seats (null = not gathered). */
  let circleSeats: number[] | null = null;
  let escort = false;
  const doorLocks = new Map<string, boolean>();
  let lastStageKey = '';
  /** The stage key with 'walking' / 'outdoors' merged (see STAGE_WALKING_MS). */
  let lastStageCoarse = '';
  let stageCheckAcc = 0;
  let stageSentAt = -Infinity;
  /** Storyteller settings that affect the world (door tags). */
  let settings: StSettings = { ...DEFAULT_ST_SETTINGS };
  /** Publicly dead players (alive_changed carries the PUBLIC status): ghost door tags. */
  const ghosts = new Set<string>();

  const isST = (pid: string) => host.member(pid)?.role === 'storyteller' || host.storytellerPid() === pid;
  const seatOf = (pid: string): number | null => seatOverride.get(pid) ?? host.member(pid)?.seat ?? null;
  const homeOf = (pid: string): BuildingDef | undefined => {
    const seat = seatOf(pid);
    return homeBuilding(layout, seat);
  };
  const maxSpeed = (pid: string) => PLAYER_SPEED * (isST(pid) ? Math.min(STORYTELLER_MAX_SPEED_MULT, Math.max(1, travelMult.get(pid) ?? 1)) : 1) * MOVE_TOLERANCE;

  // ---------------------------------------------------------------------------------------
  // helpers

  function spawnPoint(pid: string): { x: number; y: number } {
    const base = isST(pid) ? layout.storytellerSpawn : layout.playerSpawn;
    // Spread arrivals on a small ring of free tiles around the spawn tile.
    const idx = host.members().findIndex((m) => m.pid === pid);
    const ring: [number, number][] = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-2, 0],
      [2, 0],
      [-1, 1],
      [1, 1],
      [0, 1],
      [-2, 1],
      [2, 1],
      [-3, 0],
      [3, 0],
      [-3, 1],
      [3, 1],
      [0, 2],
      [-1, 2],
    ];
    for (let k = 0; k < ring.length; k++) {
      const [dx, dy] = ring[(Math.max(0, idx) + k) % ring.length]!;
      const p = tileCenterPx(layout, { x: base.x + dx, y: base.y + dy });
      if (!isBlockedPx(layout, p.x, p.y)) return p;
    }
    return tileCenterPx(layout, base);
  }

  function teleport(e: Entity, x: number, y: number, reason: WorldTeleport['reason'], facing?: Facing, keepWalk = false) {
    const prev = e.location;
    if (!keepWalk) e.walk = null;
    e.syncedAt = host.now();
    e.preSync = { x: e.x, y: e.y, location: e.location };
    if (facing) e.facing = facing;
    e.x = x;
    e.y = y;
    e.moving = false;
    e.location = locationAt(layout, x, y);
    e.budget = 0;
    e.budgetAt = host.now();
    host.send(e.id, 'world:teleport', { x, y, location: e.location, reason, seq: e.lastSeq });
    if (prev !== e.location) host.emit({ type: 'location_changed', pid: e.id, location: e.location, prev });
  }

  /** A move that continues the client's pre-sync trajectory (sent before it learnt the new position). */
  function inFlight(e: Entity, x: number, y: number): boolean {
    const p = e.preSync;
    if (!p || host.now() - e.syncedAt >= SYNC_GRACE_MS) return false;
    return locationAt(layout, x, y) === p.location && Math.hypot(x - p.x, y - p.y) <= maxSpeed(e.id) * BURST_SECONDS + SLACK_PX && !isBlockedPx(layout, x, y);
  }

  function correct(e: Entity, seq: number, why = 'invalid', at?: { x: number; y: number }) {
    // A position sync is already on its way and this move merely continues the old trajectory:
    // drop it silently (never applied). Anything else (teleport hacks, walls, other places) is answered.
    if (at && inFlight(e, at.x, at.y)) {
      e.droppedSeq = Math.max(e.droppedSeq, seq);
      return;
    }
    host.log.debug('move corrected', { lobbyId: host.lobbyId, why });
    e.syncedAt = host.now();
    e.preSync = at ? { x: at.x, y: at.y, location: locationAt(layout, at.x, at.y) } : null;
    e.lastSeq = Math.max(e.lastSeq, seq);
    host.send(e.id, 'world:teleport', { x: e.x, y: e.y, location: e.location, reason: 'correction', seq });
  }

  function ensureEntity(pid: string): Entity | undefined {
    const m = host.member(pid);
    if (!m) return undefined;
    let e = entities.get(pid);
    if (!e) {
      const p = spawnPoint(pid);
      e = { id: pid, x: p.x, y: p.y, facing: 'down', moving: false, location: locationAt(layout, p.x, p.y), lastSeq: 0, budget: 0, budgetAt: host.now(), syncedAt: -Infinity, preSync: null, droppedSeq: 0, frozen: false, walk: null };
      entities.set(pid, e);
      host.send(pid, 'world:teleport', { x: e.x, y: e.y, location: e.location, reason: 'spawn', seq: 0 });
      host.emit({ type: 'location_changed', pid, location: e.location, prev: null });
    }
    return e;
  }

  /** True when the straight segment a->b never overlaps blocked tiles. */
  // (kept local: same sweep as path.ts segmentClear)
  function segmentClear(ax: number, ay: number, bx: number, by: number): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(d / SWEEP_STEP));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (isBlockedPx(layout, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }
  /** Straight sweep, or an axis-aligned L (client prediction slides along walls). */
  function pathClear(ax: number, ay: number, bx: number, by: number): boolean {
    if (segmentClear(ax, ay, bx, by)) return true;
    return (segmentClear(ax, ay, bx, ay) && segmentClear(bx, ay, bx, by)) || (segmentClear(ax, ay, ax, by) && segmentClear(ax, by, bx, by));
  }

  function nearTile(e: Entity, p: { x: number; y: number }): boolean {
    const c = tileCenterPx(layout, p);
    return Math.hypot(e.x - c.x, e.y - c.y) <= DOOR_RANGE_PX;
  }

  function placeAt(b: BuildingDef, spot: 'bed' | 'visit' | 'door') {
    const p = spot === 'bed' ? (b.bed ?? b.interiorDoor) : spot === 'visit' ? (b.visitPoint ?? b.interiorDoor) : b.interiorDoor;
    return tileCenterPx(layout, p);
  }

  function canEnter(pid: string, b: BuildingDef): boolean {
    if (isST(pid)) return true;
    const o = doorLocks.get(b.id);
    if (o !== undefined) return !o;
    if (phase && LOCKED_PHASES.has(phase)) return homeOf(pid)?.id === b.id;
    return true;
  }
  function canExit(pid: string, b: BuildingDef): boolean {
    if (isST(pid)) return true;
    const o = doorLocks.get(b.id);
    if (o !== undefined) return !o;
    if (phase && LOCKED_PHASES.has(phase)) return homeOf(pid)?.id !== b.id;
    // Bedtime overtime: whoever made it home stays home.
    if (escort && phase === 'bedtime') return homeOf(pid)?.id !== b.id;
    return true;
  }

  // ---------------------------------------------------------------------------------------
  // stage: seats, homes, targets, server-driven walks

  const isHomeEntity = (e: Entity): boolean => {
    const home = homeOf(e.id);
    return !!home && e.location === `bld:${home.id}`;
  };

  function allSeats(): number[] {
    const seats = new Set<number>();
    for (const m of host.members()) {
      if (isST(m.pid)) continue;
      const s = seatOf(m.pid);
      if (s !== null) seats.add(s);
    }
    return [...seats];
  }

  function seatSpot(pid: string): { x: number; y: number; facing: Facing } | null {
    const seat = seatOf(pid);
    if (seat === null) return null;
    const seats = circleSeats ?? allSeats();
    return spotsFor(seats.includes(seat) ? seats : [...seats, seat]).find((s) => s.seat === seat) ?? null;
  }
  let spotCache: { key: string; spots: ReturnType<typeof circleSpots> } = { key: '', spots: [] };
  function spotsFor(seats: number[]) {
    const key = [...seats].sort((a, b) => a - b).join(',');
    if (spotCache.key !== key) spotCache = { key, spots: circleSpots(layout, seats) };
    return spotCache.spots;
  }

  /** Small deterministic spread so a group sent to one point does not stand on one pixel. */
  function spread(pid: string, base: Pt): Pt {
    const seat = seatOf(pid) ?? 0;
    const ring = seat === 0 ? { x: 0, y: 0 } : { x: Math.round(Math.cos(seat * 2.4) * (10 + seat)), y: Math.round(Math.sin(seat * 2.4) * (6 + seat * 0.6)) };
    return nearestFree(layout, { x: base.x + ring.x, y: base.y + ring.y }, 40) ?? nearestFree(layout, base, 40) ?? base;
  }

  /** Resolve a Storyteller target for one player. string = error. */
  function resolveTarget(pid: string, to: StageTarget): (Dest & { goal: Walk['goal'] }) | string {
    const at = (p: Pt, goal: Walk['goal'], facing?: Facing) => ({ location: locationAt(layout, p.x, p.y), x: p.x, y: p.y, goal, ...(facing ? { facing } : {}) });
    switch (to.kind) {
      case 'seat': {
        const s = seatSpot(pid);
        return s ? at(s, 'seat', s.facing) : 'That player has no seat';
      }
      case 'home': {
        const home = homeOf(pid);
        return home ? at(placeAt(home, 'bed'), 'home') : 'That player has no home';
      }
      case 'square':
        return at(spread(pid, { x: layout.square.cx, y: layout.square.cy + 24 }), 'square');
      case 'storyteller': {
        const st = storyteller();
        if (!st) return 'No Storyteller in town';
        const base = { x: st.x, y: st.y + 12 };
        const p = spread(pid, base);
        return locationAt(layout, p.x, p.y) === st.location ? at(p, 'point') : at({ x: st.x, y: st.y }, 'point');
      }
      case 'building': {
        const b = buildingById.get(to.buildingId);
        if (!b) return 'No such building';
        return at(spread(pid, placeAt(b, 'door')), 'building');
      }
      case 'point': {
        const p = nearestFree(layout, { x: to.x, y: to.y }, 24);
        if (!p) return 'That spot is not walkable';
        return at(spread(pid, p), 'point');
      }
    }
  }

  /** Plan the next leg of a walk from the entity's current spot. false = no route. */
  function planLeg(e: Entity, w: Walk): boolean {
    const here = e.location;
    const dest = w.dest;
    if (here === dest.location) {
      const pts = findPath(layout, { x: e.x, y: e.y }, dest, here);
      if (!pts) return false;
      w.pts = pts;
      w.door = null;
      return true;
    }
    // Leave the current building first (at once: no interior leg to the doorway), then walk
    // outdoors to the destination's door.
    if (here !== 'outdoors') {
      const b = buildingById.get(here.slice(4));
      if (!b) return false;
      w.pts = [];
      w.door = { building: b.id, exit: true };
      return true;
    }
    const b = buildingById.get(dest.location.slice(4));
    if (!b) return false;
    const pts = findPath(layout, { x: e.x, y: e.y }, tileCenterPx(layout, b.door), 'outdoors');
    if (!pts) return false;
    w.pts = pts;
    w.door = { building: b.id, exit: false };
    return true;
  }

  function startWalk(e: Entity, dest: Dest, goal: Walk['goal'], isEscort: boolean): void {
    const w: Walk = { goal, dest, escort: isEscort, pts: [], door: null };
    if (!planLeg(e, w)) {
      // No route (should not happen on the shipped map): the only fallback is a teleport.
      host.log.warn('walk: no route, teleporting', { lobbyId: host.lobbyId, goal });
      teleport(e, dest.x, dest.y, isEscort ? 'bedtime' : 'storyteller', dest.facing);
      return;
    }
    e.walk = w;
    e.budget = 0;
  }

  function finishWalk(e: Entity): void {
    const w = e.walk!;
    e.walk = null;
    e.moving = false;
    if (w.dest.facing) e.facing = w.dest.facing;
    e.budget = 0;
    e.budgetAt = host.now();
  }

  /** Advance one server-driven walk by dt. */
  function stepWalk(e: Entity, dt: number): void {
    const w = e.walk!;
    let budget = PLAYER_SPEED * dt;
    let guard = 0;
    while (budget > 0 && e.walk === w && guard++ < 50) {
      const next = w.pts[0];
      if (!next) {
        if (w.door) {
          const b = buildingById.get(w.door.building)!;
          // Entering: straight to the destination inside (the bed / visit spot; no interior leg).
          const p = w.door.exit ? tileCenterPx(layout, b.door) : w.dest.location === `bld:${b.id}` ? { x: w.dest.x, y: w.dest.y } : placeAt(b, 'door');
          w.door = null;
          teleport(e, p.x, p.y, 'door', undefined, true);
          if (!planLeg(e, w)) {
            teleport(e, w.dest.x, w.dest.y, w.escort ? 'bedtime' : 'storyteller', w.dest.facing);
            return;
          }
          continue;
        }
        finishWalk(e);
        return;
      }
      const dx = next.x - e.x;
      const dy = next.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) e.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      if (d <= budget) {
        e.x = next.x;
        e.y = next.y;
        w.pts.shift();
        budget -= d;
      } else {
        e.x += (dx / d) * budget;
        e.y += (dy / d) * budget;
        budget = 0;
      }
      e.moving = true;
    }
  }

  function escortStragglers(): void {
    for (const m of host.members()) {
      if (isST(m.pid) || seatOf(m.pid) === null) continue;
      const e = entities.get(m.pid) ?? ensureEntity(m.pid);
      if (!e || isHomeEntity(e) || e.walk?.goal === 'home') continue;
      const home = homeOf(m.pid)!;
      const bed = placeAt(home, 'bed');
      startWalk(e, { location: `bld:${home.id}`, x: bed.x, y: bed.y }, 'home', true);
    }
  }

  /**
   * Door tags: who is inside each building (public, identical for every viewer). Daytime only
   * (waiting / setup / day) and never the Storyteller, so nothing about the night or about ST
   * visits can ever show up here. Deterministic order (seat, then pid).
   */
  function doorTags(): Record<string, DoorTag[]> | null {
    if (!settings.doorTags) return null;
    if (phase !== null && phase !== 'setup' && phase !== 'day') return null;
    let out: Record<string, DoorTag[]> | null = null;
    const inside = [...entities.values()].filter((e) => e.location !== 'outdoors' && !isST(e.id) && host.member(e.id));
    inside.sort((a, b) => (seatOf(a.id) ?? 99) - (seatOf(b.id) ?? 99) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const e of inside) {
      const id = e.location.slice(4);
      out ??= {};
      (out[id] ??= []).push({ pid: e.id, ghost: ghosts.has(e.id) });
    }
    return out;
  }

  function presenceOf(e: Entity): { presence: StagePresence; building: string | null } {
    if (isHomeEntity(e)) return { presence: 'home', building: e.location.slice(4) };
    if (e.walk) return { presence: 'escorted', building: e.location === 'outdoors' ? null : e.location.slice(4) };
    if (e.location !== 'outdoors') return { presence: 'inside', building: e.location.slice(4) };
    if (circleSeats) {
      const s = seatSpot(e.id);
      if (s && Math.hypot(s.x - e.x, s.y - e.y) <= CIRCLE_SEATED_PX) return { presence: 'seated', building: null };
    }
    return { presence: e.moving ? 'walking' : 'outdoors', building: null };
  }

  /** Stage key in which a player only starting / stopping (walking <-> outdoors) is no change. */
  function stageCoarseKey(v: StageView): string {
    return JSON.stringify({ ...v, players: v.players.map((p) => (p.presence === 'walking' ? { ...p, presence: 'outdoors' } : p)) });
  }

  function storyteller(): Entity | undefined {
    const st = host.storytellerPid();
    return st ? entities.get(st) : undefined;
  }

  function onPhase(next: GamePhase) {
    const prev = phase;
    phase = next;
    if (NIGHT_PHASES.has(next)) {
      escort = false;
      for (const m of host.members()) {
        if (m.role !== 'player' || seatOf(m.pid) === null) continue;
        const e = entities.get(m.pid) ?? ensureEntity(m.pid);
        if (!e) continue;
        const home = homeOf(m.pid)!;
        const bed = placeAt(home, 'bed');
        if (isHomeEntity(e)) {
          // Home already: walk to bed (no teleport). Night isolation hides it from everyone else.
          if (Math.hypot(e.x - bed.x, e.y - bed.y) >= 1 && e.walk?.goal !== 'home') startWalk(e, { location: `bld:${home.id}`, x: bed.x, y: bed.y }, 'home', false);
        } else {
          // Still en route although the night has fallen (the Storyteller forced it): teleport.
          e.walk = null;
          api.sendHome(m.pid, 'night');
        }
      }
      // world-audit: the night starts with the Storyteller OUTSIDE every home. Otherwise an ST who
      // lingered in a cottage at bedtime is physically "in" that home (visible to / audible by its
      // occupant) without the rules engine registering a visit.
      const st = storyteller();
      if (st && !(prev && NIGHT_PHASES.has(prev)) && st.location !== 'outdoors' && buildingById.get(st.location.slice(4))?.kind === 'house') {
        api.exitBuilding(st.id, 'storyteller');
      }
    }
    // world-audit (night-visit secrecy): when the night ends the Storyteller is returned to their
    // spawn in the square. Left where they were, players walking out at daybreak would find the ST
    // inside, or standing at the door of, the LAST home visited (exitBuilding / leave_home puts the
    // ST on that home's doorstep) — revealing whom the ST saw last.
    if ((next === 'dawn' || next === 'day') && prev && LOCKED_PHASES.has(prev)) {
      const st = storyteller();
      if (st) {
        const p = spawnPoint(st.id);
        if (st.location !== 'outdoors' || Math.hypot(st.x - p.x, st.y - p.y) >= 1 || st.facing !== 'down') {
          st.facing = 'down'; // also forget the night's last heading
          teleport(st, p.x, p.y, 'dawn');
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------

  const api: WorldModule = {
    onEvent(e: RoomEvent) {
      switch (e.type) {
        case 'member_joined':
          ensureEntity(e.pid);
          break;
        case 'member_left':
          entities.delete(e.pid);
          lastStageKey = '';
          travelMult.delete(e.pid);
          seatOverride.delete(e.pid);
          break;
        case 'member_connection': {
          // Reconnect: tell the client where it is (restores the right house mid-night). A seated
          // player who is somehow not in their own home during a locked phase is put to bed first.
          if (e.connected && phase && LOCKED_PHASES.has(phase) && !isST(e.pid)) {
            const home = homeOf(e.pid);
            if (home && entities.get(e.pid)?.location !== `bld:${home.id}`) api.sendHome(e.pid, 'night');
          }
          const ent = e.connected ? (entities.get(e.pid) ?? ensureEntity(e.pid)) : undefined;
          if (ent) host.send(e.pid, 'world:teleport', { x: ent.x, y: ent.y, location: ent.location, reason: 'spawn', seq: ent.lastSeq });
          break;
        }
        case 'role_changed':
          ensureEntity(e.pid);
          if (e.role !== 'storyteller') travelMult.delete(e.pid);
          break;
        case 'alive_changed':
          if (e.alive) ghosts.delete(e.pid);
          else ghosts.add(e.pid);
          break;
        case 'game_started':
          ghosts.clear();
          circleSeats = null;
          escort = false;
          doorLocks.clear();
          for (const s of e.seats) {
            seatOverride.set(s.pid, s.seat);
            ensureEntity(s.pid);
          }
          ensureEntity(e.storytellerPid);
          break;
        case 'phase_changed':
          onPhase(e.phase);
          break;
        case 'travel_speed':
          travelMult.set(e.pid, e.mult);
          break;
        case 'game_finished':
          phase = 'finished';
          seatOverride.clear();
          circleSeats = null;
          escort = false;
          doorLocks.clear();
          for (const ent of entities.values()) {
            ent.walk = null;
            ent.frozen = false;
          }
          break;
        default:
          break;
      }
    },

    handleMove(pid, msg: C2SParsed<'move'>) {
      const e = entities.get(pid);
      if (!e) return;
      if (msg.seq <= e.lastSeq) return; // stale / duplicate
      // Server-driven (walk) or frozen: the player's own moves are not applied.
      if (e.walk || e.frozen) return correct(e, msg.seq, e.walk ? 'walk' : 'frozen', msg);
      const now = host.now();
      const speed = maxSpeed(pid);
      e.budget = Math.min(speed * BURST_SECONDS, e.budget + (Math.max(0, now - e.budgetAt) / 1000) * speed);
      e.budgetAt = now;
      const dist = Math.hypot(msg.x - e.x, msg.y - e.y);
      if (dist > e.budget + SLACK_PX) return correct(e, msg.seq, 'speed', msg);
      if (dist > 0) {
        if (locationAt(layout, msg.x, msg.y) !== e.location) return correct(e, msg.seq, 'location', msg);
        if (isBlockedPx(layout, msg.x, msg.y) || !pathClear(e.x, e.y, msg.x, msg.y)) return correct(e, msg.seq, 'collision', msg);
      }
      e.budget = Math.max(0, e.budget - dist);
      e.x = msg.x;
      e.y = msg.y;
      e.facing = msg.facing;
      e.moving = msg.moving;
      e.lastSeq = msg.seq;
      if (e.droppedSeq <= msg.seq) e.droppedSeq = 0;
    },

    handleUseDoor(pid, msg: C2SParsed<'world:useDoor'>) {
      const e = entities.get(pid);
      const b = buildingById.get(msg.buildingId);
      if (!e || !b) {
        host.send(pid, 'error', { code: 'not_found', message: 'No such door.', for: 'world:useDoor' });
        return;
      }
      if (e.walk) return; // the server is walking them; ignore
      if (e.frozen) return host.send(pid, 'error', { code: 'forbidden', message: 'The Storyteller has paused your movement.', for: 'world:useDoor' });
      const inside = e.location === `bld:${b.id}`;
      if (inside) {
        // Leaving works from anywhere inside ("Leave" button, or walking out through the doorway).
        if (!canExit(pid, b)) return host.send(pid, 'error', { code: 'phase', message: doorLocks.get(b.id) ? 'The door is locked.' : 'You must stay home until morning.', for: 'world:useDoor' });
        const p = tileCenterPx(layout, b.door);
        teleport(e, p.x, p.y, 'door');
        return;
      }
      if (e.location !== 'outdoors' || !nearTile(e, b.door)) return host.send(pid, 'error', { code: 'forbidden', message: 'Too far from the door.', for: 'world:useDoor' });
      if (!canEnter(pid, b)) return host.send(pid, 'error', { code: 'phase', message: doorLocks.get(b.id) ? 'The door is locked.' : 'The door is locked for the night.', for: 'world:useDoor' });
      const p = placeAt(b, 'door');
      teleport(e, p.x, p.y, 'door');
    },

    locationOf: (pid) => entities.get(pid)?.location ?? null,
    positionOf: (pid) => {
      const e = entities.get(pid);
      return e ? { x: e.x, y: e.y } : null;
    },

    snapshotFor(pid): WorldSnapshot {
      const me = entities.get(pid);
      const t = host.now();
      if (!me) return { t, ackSeq: 0, entities: [] };
      let visible: (e: Entity) => boolean;
      if (isST(pid)) visible = () => true;
      else if (phase && NIGHT_PHASES.has(phase)) {
        const home = homeOf(pid);
        const loc: LocationId | null = home ? `bld:${home.id}` : null;
        visible = (o) => o.id === pid || (loc !== null && o.location === loc);
      } else visible = (o) => o.id === pid || o.location === me.location;
      const list: EntityState[] = [];
      for (const o of entities.values())
        if (visible(o)) list.push({ id: o.id, x: Math.round(o.x * 10) / 10, y: Math.round(o.y * 10) / 10, facing: o.facing, moving: o.moving, location: o.location });
      const snap: WorldSnapshot = { t, ackSeq: me.lastSeq, entities: list };
      if (me.walk) snap.you = { mode: 'auto', goal: me.walk.goal, path: me.walk.pts.slice(0, 12).map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })) };
      else if (me.frozen) snap.you = { mode: 'frozen' };
      if (doorLocks.size) snap.doors = Object.fromEntries(doorLocks);
      const tags = doorTags();
      if (tags) snap.doorTags = tags;
      return snap;
    },

    sendHome(pid, reason) {
      // Idempotent: a player already home is left alone at bedtime, and only re-seated at the
      // bed for the night if they are not standing on it already (no spurious events).
      const e = entities.get(pid) ?? ensureEntity(pid);
      if (!e || isST(pid)) return;
      const home = homeOf(pid);
      if (!home) return;
      const atHome = e.location === `bld:${home.id}`;
      const p = placeAt(home, 'bed');
      if (atHome && (reason === 'bedtime' || Math.hypot(e.x - p.x, e.y - p.y) < 1)) return;
      teleport(e, p.x, p.y, reason);
    },

    exitBuilding(pid, reason) {
      const e = entities.get(pid);
      if (!e || e.location === 'outdoors') return;
      const b = buildingById.get(e.location.slice(4));
      if (!b) return;
      const p = tileCenterPx(layout, b.door);
      teleport(e, p.x, p.y, reason);
    },

    teleportToBuilding(pid, buildingId, reason) {
      const e = entities.get(pid) ?? ensureEntity(pid);
      const b = buildingById.get(buildingId);
      if (!e || !b) return;
      const p = reason === 'storyteller' && b.kind === 'house' ? placeAt(b, 'visit') : placeAt(b, 'door');
      teleport(e, p.x, p.y, reason);
    },

    tick(dtMs) {
      // Player movement is event-driven; only server-driven walks advance here.
      const dt = Math.min(0.25, Math.max(0, dtMs) / 1000);
      if (escort && phase === 'bedtime') escortStragglers();
      // B6: every move is eventually either applied (acked) or corrected. Moves dropped silently
      // inside a sync grace window get one late correction once the window is over, unless a newer
      // move was accepted meanwhile (then the client is consistent again).
      const nowMs = host.now();
      for (const e of entities.values())
        if (e.droppedSeq > e.lastSeq && nowMs - e.syncedAt >= SYNC_GRACE_MS) {
          const seq = e.droppedSeq;
          e.droppedSeq = 0;
          e.lastSeq = seq;
          e.syncedAt = nowMs;
          e.preSync = null;
          host.send(e.id, 'world:teleport', { x: e.x, y: e.y, location: e.location, reason: 'correction', seq });
        } else if (e.droppedSeq && e.droppedSeq <= e.lastSeq) e.droppedSeq = 0;
      for (const e of entities.values()) if (e.walk) stepWalk(e, dt);
      // Presence changes refresh the Storyteller's stage view (coalesced: STAGE_CHECK_MS).
      stageCheckAcc += Math.max(0, dtMs);
      if (seatOverride.size && (stageCheckAcc >= STAGE_CHECK_MS || lastStageKey === '')) {
        stageCheckAcc = 0;
        const view = api.stageView();
        const key = JSON.stringify(view);
        const now = host.now();
        if (key !== lastStageKey && (lastStageKey === '' || stageCoarseKey(view) !== lastStageCoarse || now - stageSentAt >= STAGE_WALKING_MS)) {
          lastStageKey = key;
          lastStageCoarse = stageCoarseKey(view);
          stageSentAt = now;
          // Only the Storyteller's view carries the stage (game viewFor); no Storyteller = nobody to tell
          // (a Storyteller who takes the seat later gets a full view on joining).
          const st = host.storytellerPid();
          if (!host.markGameDirtyFor) host.markGameDirty();
          else if (st) host.markGameDirtyFor(st);
        }
      }
    },

    setCircle(seats) {
      circleSeats = seats && seats.length ? [...seats].sort((a, b) => a - b) : null;
    },

    setEscort(on) {
      if (escort === on) return;
      escort = on;
      if (on) escortStragglers();
      else
        for (const e of entities.values())
          if (e.walk?.escort) {
            e.walk = null;
            e.moving = false;
            e.budget = 0;
            e.budgetAt = host.now();
          }
    },

    isHome(pid) {
      const e = entities.get(pid);
      return !!e && isHomeEntity(e);
    },

    teleportTo(pid, to) {
      const e = entities.get(pid) ?? ensureEntity(pid);
      if (!e || isST(pid)) return 'Not a player';
      const d = resolveTarget(pid, to);
      if (typeof d === 'string') return d;
      teleport(e, d.x, d.y, 'storyteller', d.facing);
      return null;
    },

    walkTo(pid, to) {
      const e = entities.get(pid) ?? ensureEntity(pid);
      if (!e || isST(pid)) return 'Not a player';
      if (to === null) {
        if (e.walk) {
          e.walk = null;
          e.moving = false;
          e.budget = 0;
          e.budgetAt = host.now();
        }
        return null;
      }
      const d = resolveTarget(pid, to);
      if (typeof d === 'string') return d;
      startWalk(e, d, d.goal, false);
      return null;
    },

    setFrozen(pid, frozen) {
      const e = entities.get(pid) ?? ensureEntity(pid);
      if (!e || isST(pid)) return;
      e.frozen = frozen;
      if (frozen) e.moving = false;
      e.budget = 0;
      e.budgetAt = host.now();
    },

    setDoorLock(buildingId, locked) {
      if (!buildingById.has(buildingId)) return 'No such building';
      if (locked === null) doorLocks.delete(buildingId);
      else doorLocks.set(buildingId, locked);
      return null;
    },

    applySettings(next) {
      settings = { ...DEFAULT_ST_SETTINGS, ...next };
    },

    teleportSelf(pid, to) {
      if (!isST(pid)) return 'Storyteller only';
      const e = entities.get(pid) ?? ensureEntity(pid);
      if (!e) return 'Not in town';
      if (to.kind === 'building') {
        const b = buildingById.get(to.buildingId);
        if (!b) return 'No such building';
        // Same placement as visit_home / teleportToBuilding(pid, id, 'storyteller').
        const p = placeAt(b, b.kind === 'house' ? 'visit' : 'door');
        teleport(e, p.x, p.y, 'storyteller');
        return null;
      }
      // A map point: the nearest free OUTDOOR spot (never an interior, never inside a wall).
      const tb = layout.townBounds;
      const ts = layout.tileSize;
      const inTown = (x: number, y: number) => x >= tb.x * ts && y >= tb.y * ts && x < (tb.x + tb.w) * ts && y < (tb.y + tb.h) * ts;
      if (!inTown(to.x, to.y) || locationAt(layout, to.x, to.y) !== 'outdoors') return 'Pick a spot in town';
      const p = nearestFree(layout, { x: to.x, y: to.y }, 48, (x, y) => inTown(x, y));
      if (!p) return 'That spot is not walkable';
      teleport(e, p.x, p.y, 'storyteller');
      return null;
    },

    stageView(): StageView {
      const players: StagePlayerView[] = [];
      for (const [pid, seat] of [...seatOverride.entries()].sort((a, b) => a[1] - b[1])) {
        const e = entities.get(pid);
        if (!e) continue;
        const p = presenceOf(e);
        players.push({ seat, pid, presence: p.presence, building: p.building, frozen: e.frozen });
      }
      return { players, doors: Object.fromEntries(doorLocks), storytellerLocation: storyteller()?.location ?? null };
    },
  };
  return api;
}

