import type { AcousticZoneId, GamePhase, LocationId, MemberRole, TownLayout, VoiceMode } from '@ct/protocol';
import { VOICE_DEFAULTS } from './constants.js';

// ---------------------------------------------------------------------------------------
// Acoustic zone graph (pure). The server decides every member's zone; the client never does.
//
//   outdoors (anywhere: v2 single-screen town) -> 'square'  broadcast, full volume
//   ('street' proximity is retired: the town is one screen, private talk = go into a house together)
//   inside a building interior         -> 'bld:<id>'    private (separate LiveKit room)
//   first_night / night / dawn         -> players are in their own home 'bld:house-<seat>';
//                                         the Storyteller is wherever they physically are
//                                         (a home only while inside it = the private visit);
//                                         outdoors at night the ST has no room ('none').
//   waiting / setup / day / bedtime / finished -> the normal rules above.

export const ZONE_SQUARE = 'square';
export const ZONE_STREET = 'street';
export const ZONE_ANNOUNCE = 'announce';
export const ZONE_NONE = 'none';

export interface ZoneMemberInput {
  pid: string;
  role: MemberRole;
  /** Player seat (= house index) once the game started. */
  seat?: number | null;
  location: LocationId | null;
  x: number | null;
  y: number | null;
}

export interface ZoneInput {
  /** null = waiting room (no game yet). */
  phase: GamePhase | null;
  members: readonly ZoneMemberInput[];
  layout: TownLayout;
}

export interface ZoneAssignment {
  zone: AcousticZoneId;
  /** null for 'none' (no voice room). */
  mode: VoiceMode | null;
}

export interface ZoneOptions {
  /** Previously committed zones (for square hysteresis). */
  prev?: ReadonlyMap<string, AcousticZoneId>;
  squareMarginPx?: number;
}

/** Phases in which players are locked inside their homes. */
export function isNightLike(phase: GamePhase | null): boolean {
  return phase === 'first_night' || phase === 'night' || phase === 'dawn';
}

export function isBuildingZone(zone: AcousticZoneId): boolean {
  return zone.startsWith('bld:');
}

/** Rooms that must be enforced server-side (never rely on client attenuation). */
export function isPrivateZone(zone: AcousticZoneId): boolean {
  return isBuildingZone(zone) || zone === ZONE_ANNOUNCE;
}

export function modeOfZone(zone: AcousticZoneId): VoiceMode | null {
  if (zone === ZONE_SQUARE || zone === ZONE_ANNOUNCE) return 'broadcast';
  if (zone === ZONE_STREET) return 'proximity';
  if (isBuildingZone(zone)) return 'private';
  return null;
}

export function houseZoneForSeat(layout: TownLayout, seat: number): AcousticZoneId | null {
  const b = layout.buildings.find((bb) => bb.kind === 'house' && bb.houseIndex === seat);
  return b ? `bld:${b.id}` : null;
}

function knownBuilding(layout: TownLayout, loc: LocationId): boolean {
  if (!loc.startsWith('bld:')) return false;
  const id = loc.slice(4);
  return layout.buildings.some((b) => b.id === id);
}

function outdoorZone(_layout: TownLayout, _x: number, _y: number, _prev: AcousticZoneId | undefined, _marginPx: number): AcousticZoneId {
  return ZONE_SQUARE;
}

/** Zone of a single member (pure). */
export function zoneForMember(
  m: ZoneMemberInput,
  phase: GamePhase | null,
  layout: TownLayout,
  prev?: AcousticZoneId,
  marginPx: number = VOICE_DEFAULTS.squareMarginPx,
): AcousticZoneId {
  if (isNightLike(phase)) {
    if (m.role === 'player') {
      // Seat-based: a player is always in their own home at night, wherever a glitch put them.
      if (m.seat != null) {
        const house = houseZoneForSeat(layout, m.seat);
        if (house) return house;
      }
      if (m.location && knownBuilding(layout, m.location)) return m.location;
      return ZONE_NONE;
    }
    // Storyteller: physically located. Outdoors at night nobody can hear them -> no room
    // (saves participant-minutes; reveals nothing because players never see the ST's zone).
    if (m.location && knownBuilding(layout, m.location)) return m.location;
    return ZONE_NONE;
  }
  if (!m.location) return ZONE_NONE;
  if (m.location !== 'outdoors') return knownBuilding(layout, m.location) ? m.location : ZONE_NONE;
  if (m.x == null || m.y == null || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return ZONE_NONE;
  return outdoorZone(layout, m.x, m.y, prev, marginPx);
}

/** Per-pid zone + mode for every member (pure; hysteresis uses `opts.prev`). */
export function computeZones(input: ZoneInput, opts: ZoneOptions = {}): Map<string, ZoneAssignment> {
  const out = new Map<string, ZoneAssignment>();
  const margin = opts.squareMarginPx ?? VOICE_DEFAULTS.squareMarginPx;
  for (const m of input.members) {
    const zone = zoneForMember(m, input.phase, input.layout, opts.prev?.get(m.pid), margin);
    out.set(m.pid, { zone, mode: modeOfZone(zone) });
  }
  return out;
}

export interface ZoneChange {
  pid: string;
  from: AcousticZoneId | null;
  /** null = member no longer present. */
  to: AcousticZoneId | null;
  mode: VoiceMode | null;
}

export interface ZoneTrackerOptions {
  squareMarginPx?: number;
  /** Only square<->street changes are debounced; private-zone changes apply immediately. */
  debounceMs?: number;
}

function isOutdoorZone(z: AcousticZoneId) {
  return z === ZONE_SQUARE || z === ZONE_STREET;
}

/**
 * Stateful zone tracker: hysteresis at the square boundary (enter at r, leave at r + margin)
 * plus a stability debounce for square<->street. Entering/leaving buildings, phase changes and
 * night isolation are applied immediately (privacy first: never linger in a private room).
 */
export class ZoneTracker {
  private committed = new Map<string, AcousticZoneId>();
  private pending = new Map<string, { zone: AcousticZoneId; since: number }>();
  private readonly margin: number;
  private readonly debounceMs: number;

  constructor(opts: ZoneTrackerOptions = {}) {
    this.margin = opts.squareMarginPx ?? VOICE_DEFAULTS.squareMarginPx;
    this.debounceMs = opts.debounceMs ?? VOICE_DEFAULTS.zoneDebounceMs;
  }

  zoneOf(pid: string): AcousticZoneId | undefined {
    return this.committed.get(pid);
  }

  entries(): [string, AcousticZoneId][] {
    return [...this.committed.entries()];
  }

  /** Recompute from fresh input; returns committed changes (in member order). */
  update(input: ZoneInput, now: number): ZoneChange[] {
    const raw = computeZones(input, { prev: this.committed, squareMarginPx: this.margin });
    const changes: ZoneChange[] = [];
    for (const [pid, a] of raw) {
      const cur = this.committed.get(pid);
      if (cur === a.zone) {
        this.pending.delete(pid);
        continue;
      }
      if (cur !== undefined && this.debounceMs > 0 && isOutdoorZone(cur) && isOutdoorZone(a.zone)) {
        const p = this.pending.get(pid);
        if (!p || p.zone !== a.zone) {
          this.pending.set(pid, { zone: a.zone, since: now });
          continue;
        }
        if (now - p.since < this.debounceMs) continue;
      }
      this.pending.delete(pid);
      this.committed.set(pid, a.zone);
      changes.push({ pid, from: cur ?? null, to: a.zone, mode: a.mode });
    }
    for (const [pid, cur] of [...this.committed]) {
      if (raw.has(pid)) continue;
      this.committed.delete(pid);
      this.pending.delete(pid);
      changes.push({ pid, from: cur, to: null, mode: null });
    }
    return changes;
  }

  remove(pid: string): AcousticZoneId | undefined {
    const cur = this.committed.get(pid);
    this.committed.delete(pid);
    this.pending.delete(pid);
    return cur;
  }

  clear() {
    this.committed.clear();
    this.pending.clear();
  }
}
