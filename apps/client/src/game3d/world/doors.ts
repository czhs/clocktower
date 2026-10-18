// v3 WP3 (v3-stage). Door art driven only by the game (docs/v3/INTEGRATION.md §3 "Doors", "Boarded-up"):
//   - a house door swings open over 300 ms, holds, and closes again whenever somebody (the own player or a
//     remote) goes through it. Nothing else moves a door (life's door drivers are off, §3.1 "Life"), so the town
//     never shows a door opening by itself. Two ways to see somebody use a door:
//       1. a location change outdoors <-> bld:house-i in Scene3dState (the own player; every remote for the
//          Storyteller, who sees all locations);
//       2. for everybody else the server only sends the entities in the viewer's own location
//          (apps/server/src/world snapshotFor), so a remote going in simply VANISHES from the outdoor view and one
//          coming out APPEARS (not for the Storyteller's view): a remote last seen outdoors within DOOR_NEAR_PX of a cottage door tile that vanishes,
//          or one first seen outdoors that close to a door, used that door. Appearances / disappearances are only
//          read while the viewer's own view is settled (same own location and phase for VIEW_SETTLE_S), so the
//          first snapshot, the own player leaving a room and the night / dawn visibility switch swing nothing.
//   - an unused cottage (no seated player has it as home, rules/doors houseInUse) is boarded: windows unlit
//     and a plank prop across the door.
// Pure: the drivers call back into the vendor wrappers (house api setDoor / setLit, plank visibility).
import type { LocationId, TownLayout } from '@ct/protocol';
import { houseInUse } from '../../game/rules/doors';
import type { Scene3dState } from '../contract';

export const DOOR_OPEN_S = 0.3;
export const DOOR_HOLD_S = 0.9;
export const DOOR_CLOSE_S = 0.3;
export const DOOR_SWING_S = DOOR_OPEN_S + DOOR_HOLD_S + DOOR_CLOSE_S;
/** A remote that vanishes / appears outdoors within this many px of a cottage door tile centre went through it. */
export const DOOR_NEAR_PX = 24;
/** Appearances / disappearances count only once the own view (location + phase) has been the same this long (s). */
export const VIEW_SETTLE_S = 1.5;

/** A cottage door tile centre (world px) for the appearance / disappearance inference. */
export interface DoorTile {
  id: string;
  x: number;
  y: number;
}

/** Door tile centres (px) of every cottage `house-i` of a layout. */
export function doorTiles(layout: Pick<TownLayout, 'buildings' | 'tileSize'>): DoorTile[] {
  const T = layout.tileSize;
  return layout.buildings.filter((b) => /^house-\d+$/.test(b.id)).map((b) => ({ id: b.id, x: (b.door.x + 0.5) * T, y: (b.door.y + 0.5) * T }));
}

/** The cottage whose door tile is nearest to (x, y) within DOOR_NEAR_PX, or null. */
export function doorNear(tiles: readonly DoorTile[], x: number, y: number): string | null {
  let best: string | null = null;
  let bd = DOOR_NEAR_PX * DOOR_NEAR_PX;
  for (const d of tiles) {
    const dx = d.x - x;
    const dy = d.y - y;
    const q = dx * dx + dy * dy;
    if (q <= bd) {
      bd = q;
      best = d.id;
    }
  }
  return best;
}

const smooth = (x: number) => {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
};

/** Door opening 0..1 at `s` seconds into a swing. */
export function doorOpenAt(s: number): number {
  if (s <= 0) return 0;
  if (s < DOOR_OPEN_S) return smooth(s / DOOR_OPEN_S);
  if (s < DOOR_OPEN_S + DOOR_HOLD_S) return 1;
  if (s < DOOR_SWING_S) return 1 - smooth((s - DOOR_OPEN_S - DOOR_HOLD_S) / DOOR_CLOSE_S);
  return 0;
}

/** `house-<i>` of a location (null outdoors / other buildings). */
export function houseIdOf(loc: LocationId): string | null {
  const m = /^bld:(house-\d+)$/.exec(loc);
  return m ? m[1]! : null;
}

export interface DoorDriver {
  /** Watch every pose (and the own view); somebody going through a house door starts (or extends) its swing. */
  observe(state: Pick<Scene3dState, 'me' | 'remotes'> & { phase?: string; amStoryteller?: boolean }, t: number): void;
  /** Start a swing now (also used for the own player's 'door' teleport). */
  trigger(houseId: string, t: number): void;
  /** Advance the swings; writes setDoor only when the opening changed. */
  tick(t: number): void;
  /** Houses whose door is currently not closed (debug). */
  open(): string[];
  /** setDoor calls made so far, per house (debug: `v3-life` asserts no door moved without one). */
  readonly writes: ReadonlyMap<string, number>;
}

interface Seen {
  loc: LocationId;
  x: number;
  y: number;
  /** observe() call that last saw this pid */
  stamp: number;
  remote: boolean;
}

/**
 * `doors` = the cottages' door tiles (px, `doorTiles(layout)`) for the appearance / disappearance inference;
 * without them only explicit location changes swing a door.
 */
export function createDoorDriver(setDoor: (houseId: string, f: number) => void, doors: readonly DoorTile[] = []): DoorDriver {
  const last = new Map<string, Seen>();
  const swings = new Map<string, { t0: number; f: number }>();
  const writes = new Map<string, number>();
  let stamp = 0;
  let viewLoc: LocationId | null | undefined = undefined;
  let viewPhase: string | undefined = undefined;
  let viewSince = 0;
  const write = (id: string, f: number) => {
    setDoor(id, f);
    writes.set(id, (writes.get(id) ?? 0) + 1);
  };
  const driver: DoorDriver = {
    writes,
    trigger(id, t) {
      const s = swings.get(id);
      if (!s) {
        swings.set(id, { t0: t, f: 0 });
        return;
      }
      // already swinging: keep it open (restart the hold without closing first)
      const at = t - s.t0;
      if (at > DOOR_OPEN_S) s.t0 = t - DOOR_OPEN_S;
    },
    observe(state, t) {
      stamp++;
      // the own view: who the server sends depends on the own location (and at night on the phase)
      const meLoc = state.me ? state.me.location : null;
      if (meLoc !== viewLoc || state.phase !== viewPhase) {
        viewLoc = meLoc;
        viewPhase = state.phase;
        viewSince = t;
      }
      // only an outdoor viewer who is sent outdoor entities only; the Storyteller sees every location (path 1)
      const infer = doors.length > 0 && meLoc === 'outdoors' && !state.amStoryteller && t - viewSince >= VIEW_SETTLE_S;
      const see = (pid: string, loc: LocationId, x: number, y: number, remote: boolean) => {
        const prev = last.get(pid);
        if (!prev) {
          last.set(pid, { loc, x, y, stamp, remote });
          // first sight: a remote stepping out of a cottage
          if (remote && infer && loc === 'outdoors') {
            const id = doorNear(doors, x, y);
            if (id) driver.trigger(id, t);
          }
          return;
        }
        const was = prev.loc;
        prev.loc = loc;
        prev.x = x;
        prev.y = y;
        prev.stamp = stamp;
        prev.remote = remote;
        if (was === loc) return;
        const a = houseIdOf(was);
        const b = houseIdOf(loc);
        // in or out through a cottage door (a teleport between two interiors swings neither: no door used)
        if (a && loc === 'outdoors') driver.trigger(a, t);
        else if (b && was === 'outdoors') driver.trigger(b, t);
      };
      if (state.me) see(state.me.pid, state.me.location, state.me.x, state.me.y, false);
      for (const [pid, p] of state.remotes) see(pid, p.location, p.x, p.y, true);
      for (const [pid, e] of last) {
        if (e.stamp === stamp) continue;
        // gone from the view: a remote that was standing at a cottage door outdoors went in
        if (e.remote && infer && e.loc === 'outdoors') {
          const id = doorNear(doors, e.x, e.y);
          if (id) driver.trigger(id, t);
        }
        last.delete(pid);
      }
    },
    tick(t) {
      for (const [id, s] of swings) {
        const f = doorOpenAt(t - s.t0);
        if (Math.abs(f - s.f) > 1e-3 || (f === 0 && s.f !== 0)) {
          s.f = f;
          write(id, f);
        }
        if (t - s.t0 >= DOOR_SWING_S) {
          if (s.f !== 0) write(id, 0);
          swings.delete(id);
        }
      }
    },
    open: () => [...swings.entries()].filter(([, s]) => s.f > 0).map(([id]) => id),
  };
  return driver;
}

/** Cottages nobody lives in (a game is running and no player sits in that house's seat). */
export function boardedHouses(layout: TownLayout, game: { players: readonly { seat: number }[] } | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!game) return out;
  for (const b of layout.buildings) if (b.houseIndex !== undefined && b.houseIndex !== null && /^house-\d+$/.test(b.id) && !houseInUse(game, b)) out.add(b.id);
  return out;
}

export interface BoardDriver {
  apply(boarded: ReadonlySet<string>): void;
  readonly boarded: ReadonlySet<string>;
}

/** Applies a boarded set through `setBoarded(houseId, on)`, only for houses whose state changed. */
export function createBoardDriver(houseIds: readonly string[], setBoarded: (houseId: string, on: boolean) => void): BoardDriver {
  const cur = new Set<string>();
  return {
    get boarded() {
      return cur;
    },
    apply(next) {
      for (const id of houseIds) {
        const on = next.has(id);
        if (on === cur.has(id)) continue;
        if (on) cur.add(id);
        else cur.delete(id);
        setBoarded(id, on);
      }
    },
  };
}
