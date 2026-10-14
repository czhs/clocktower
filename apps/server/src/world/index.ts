// OWNED BY world-art. Authoritative positions, movement validation (speed + swept collision),
// doors and their phase-based access rules, bedtime/night relocation and per-viewer visibility.
//
// Visibility (snapshotFor):
//   storyteller            -> every entity
//   night / first_night    -> a player sees only entities inside their own home
//                             (so a visiting Storyteller is visible only to the visited player)
//   everything else        -> entities in the same location (outdoors <-> outdoors, same interior)
//
// Door access for players (the Storyteller may always use any door):
//   waiting / setup / day / bedtime / finished -> may enter and exit any building
//   night / first_night / dawn                 -> locked inside their own home (cannot exit);
//                                                 if somehow outdoors, may only enter their own home
import { townLayout } from '@ct/assets';
import {
  isBlockedPx,
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
  type TownLayout,
  type WorldSnapshot,
  type WorldTeleport,
} from '@ct/protocol';
import type { RoomEvent, RoomHost, WorldModule } from '../rooms/modules.js';

/** Max px the client may lead its last accepted position by (burst allowance, seconds of travel). */
const BURST_SECONDS = 0.6;
/** Flat slack for rounding / jitter (px). */
const SLACK_PX = 3;
/** Door "use" radius from the door tile centre (px). */
export const DOOR_RANGE_PX = 22;
/** Sweep step for collision checks along a move segment (px). */
const SWEEP_STEP = 2;

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

  const isST = (pid: string) => host.member(pid)?.role === 'storyteller' || host.storytellerPid() === pid;
  const seatOf = (pid: string): number | null => seatOverride.get(pid) ?? host.member(pid)?.seat ?? null;
  const homeOf = (pid: string): BuildingDef | undefined => {
    const seat = seatOf(pid);
    return seat === null ? undefined : buildingById.get(`house-${seat}`);
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

  function teleport(e: Entity, x: number, y: number, reason: WorldTeleport['reason']) {
    const prev = e.location;
    e.x = x;
    e.y = y;
    e.moving = false;
    e.location = locationAt(layout, x, y);
    e.budget = 0;
    e.budgetAt = host.now();
    host.send(e.id, 'world:teleport', { x, y, location: e.location, reason, seq: e.lastSeq });
    if (prev !== e.location) host.emit({ type: 'location_changed', pid: e.id, location: e.location, prev });
  }

  function correct(e: Entity, seq: number) {
    e.lastSeq = Math.max(e.lastSeq, seq);
    host.send(e.id, 'world:teleport', { x: e.x, y: e.y, location: e.location, reason: 'correction', seq });
  }

  function ensureEntity(pid: string): Entity | undefined {
    const m = host.member(pid);
    if (!m) return undefined;
    let e = entities.get(pid);
    if (!e) {
      const p = spawnPoint(pid);
      e = { id: pid, x: p.x, y: p.y, facing: 'down', moving: false, location: locationAt(layout, p.x, p.y), lastSeq: 0, budget: 0, budgetAt: host.now() };
      entities.set(pid, e);
      host.send(pid, 'world:teleport', { x: e.x, y: e.y, location: e.location, reason: 'spawn', seq: 0 });
      host.emit({ type: 'location_changed', pid, location: e.location, prev: null });
    }
    return e;
  }

  /** True when the straight segment a->b never overlaps blocked tiles. */
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
    if (phase && LOCKED_PHASES.has(phase)) return homeOf(pid)?.id === b.id;
    return true;
  }
  function canExit(pid: string, b: BuildingDef): boolean {
    if (isST(pid)) return true;
    if (phase && LOCKED_PHASES.has(phase)) return homeOf(pid)?.id !== b.id;
    return true;
  }

  function onPhase(next: GamePhase) {
    phase = next;
    if (NIGHT_PHASES.has(next)) {
      for (const m of host.members()) if (m.role === 'player' && seatOf(m.pid) !== null) api.sendHome(m.pid, 'night');
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
          travelMult.delete(e.pid);
          seatOverride.delete(e.pid);
          break;
        case 'member_connection': {
          // Reconnect: tell the client where it is (restores the right house mid-night).
          const ent = e.connected ? (entities.get(e.pid) ?? ensureEntity(e.pid)) : undefined;
          if (ent) host.send(e.pid, 'world:teleport', { x: ent.x, y: ent.y, location: ent.location, reason: 'spawn', seq: ent.lastSeq });
          break;
        }
        case 'role_changed':
          ensureEntity(e.pid);
          if (e.role !== 'storyteller') travelMult.delete(e.pid);
          break;
        case 'game_started':
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
          break;
        default:
          break;
      }
    },

    handleMove(pid, msg: C2SParsed<'move'>) {
      const e = entities.get(pid);
      if (!e) return;
      if (msg.seq <= e.lastSeq) return; // stale / duplicate
      const now = host.now();
      const speed = maxSpeed(pid);
      e.budget = Math.min(speed * BURST_SECONDS, e.budget + (Math.max(0, now - e.budgetAt) / 1000) * speed);
      e.budgetAt = now;
      const dist = Math.hypot(msg.x - e.x, msg.y - e.y);
      if (dist > e.budget + SLACK_PX) return correct(e, msg.seq);
      if (dist > 0) {
        if (locationAt(layout, msg.x, msg.y) !== e.location) return correct(e, msg.seq);
        if (isBlockedPx(layout, msg.x, msg.y) || !pathClear(e.x, e.y, msg.x, msg.y)) return correct(e, msg.seq);
      }
      e.budget = Math.max(0, e.budget - dist);
      e.x = msg.x;
      e.y = msg.y;
      e.facing = msg.facing;
      e.moving = msg.moving;
      e.lastSeq = msg.seq;
    },

    handleUseDoor(pid, msg: C2SParsed<'world:useDoor'>) {
      const e = entities.get(pid);
      const b = buildingById.get(msg.buildingId);
      if (!e || !b) {
        host.send(pid, 'error', { code: 'not_found', message: 'No such door.', for: 'world:useDoor' });
        return;
      }
      const inside = e.location === `bld:${b.id}`;
      if (inside) {
        if (!nearTile(e, b.interiorDoor)) return host.send(pid, 'error', { code: 'forbidden', message: 'Too far from the door.', for: 'world:useDoor' });
        if (!canExit(pid, b)) return host.send(pid, 'error', { code: 'phase', message: 'You must stay home until morning.', for: 'world:useDoor' });
        const p = tileCenterPx(layout, b.door);
        teleport(e, p.x, p.y, 'door');
        return;
      }
      if (e.location !== 'outdoors' || !nearTile(e, b.door)) return host.send(pid, 'error', { code: 'forbidden', message: 'Too far from the door.', for: 'world:useDoor' });
      if (!canEnter(pid, b)) return host.send(pid, 'error', { code: 'phase', message: 'The door is locked for the night.', for: 'world:useDoor' });
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
      return { t, ackSeq: me.lastSeq, entities: list };
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

    tick() {
      // Movement is event-driven; snapshots are pulled by the room via snapshotFor().
    },
  };
  return api;
}

