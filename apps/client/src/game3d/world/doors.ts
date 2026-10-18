// v3 WP3 (v3-stage). Door art driven only by the game (docs/v3/INTEGRATION.md §3 "Doors", "Boarded-up"):
//   - a house door swings open over 300 ms, holds, and closes again whenever somebody (the own player or a
//     remote) goes through it: a location change outdoors <-> bld:house-i seen in Scene3dState. Nothing else
//     moves a door (life's door drivers are off, §3.1 "Life"), so the town never shows a door opening by itself.
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
  /** Watch every pose's location; a transition through a house door starts (or extends) that door's swing. */
  observe(state: Pick<Scene3dState, 'me' | 'remotes'>, t: number): void;
  /** Start a swing now (also used for the own player's 'door' teleport). */
  trigger(houseId: string, t: number): void;
  /** Advance the swings; writes setDoor only when the opening changed. */
  tick(t: number): void;
  /** Houses whose door is currently not closed (debug). */
  open(): string[];
  /** setDoor calls made so far, per house (debug: `v3-life` asserts no door moved without one). */
  readonly writes: ReadonlyMap<string, number>;
}

export function createDoorDriver(setDoor: (houseId: string, f: number) => void): DoorDriver {
  const last = new Map<string, LocationId>();
  const swings = new Map<string, { t0: number; f: number }>();
  const writes = new Map<string, number>();
  const seen = new Set<string>();
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
      seen.clear();
      const see = (pid: string, loc: LocationId) => {
        seen.add(pid);
        const prev = last.get(pid);
        last.set(pid, loc);
        if (prev === undefined || prev === loc) return;
        const a = houseIdOf(prev);
        const b = houseIdOf(loc);
        // in or out through a cottage door (a teleport between two interiors swings neither: no door used)
        if (a && loc === 'outdoors') driver.trigger(a, t);
        else if (b && prev === 'outdoors') driver.trigger(b, t);
      };
      if (state.me) see(state.me.pid, state.me.location);
      for (const [pid, p] of state.remotes) see(pid, p.location);
      for (const pid of [...last.keys()]) if (!seen.has(pid)) last.delete(pid);
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
