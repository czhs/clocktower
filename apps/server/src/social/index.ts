// OWNED BY social-server. Emotes (pointing) and character pins: purely social gestures, never game
// state, server-authoritative and per lobby (in memory; a rematch recreates the module).
//
// Visibility — mirrors WorldModule.snapshotFor exactly (test: social.visibility.test.ts asserts
// canSee(v, t) === "snapshotFor(v) contains t" across every phase):
//   storyteller            -> sees every member that has a world entity
//   night / first_night    -> a player sees only members inside their own home (and themselves)
//   everything else        -> members in the same location (and themselves)
// The viewer's "view location" is the place whose pins they are shown: the Storyteller's own
// location, a player's own home at night, otherwise the player's location.
//
// Pins:
//   * a pin belongs to the location it was dropped in (the dropper's location at drop time); a
//     snapshot carries only the pins of the viewer's view location;
//   * a PERSON pin is carried only while the viewer can see its target AND the target stands in that
//     same view location (otherwise its presence would tell the viewer who is where; the Storyteller,
//     who sees everyone, still only gets person-pins whose target is in the ST's own location);
//   * person pins may only be dropped on someone the dropper can see, in the dropper's location;
//   * NIGHT PINS ARE EPHEMERAL: every pin dropped during first_night / night is removed when the night
//     ends. Otherwise a pin left (or a person-pin aimed) by the Storyteller in a cottage at night
//     would show the next day's visitors which home the Storyteller visited (night-visit secrecy);
//   * pin ids are random (a counter would leak how many pins were dropped elsewhere / at night);
//   * MAX_PINS_PER_MEMBER per member, dropping one more evicts that member's oldest;
//   * removed: on game start/finish (all), when a member leaves (theirs + person-pins on them),
//     by 'social:unpin' (own; the Storyteller: any) and 'social:clearPins' ('all' = Storyteller only).
//
// Emotes: validated (point inside the emoter's location; an optional target must be someone the
// emoter can see there — the point is then snapped to the target's server position) and delivered
// ONLY to members who can currently see the emoter (incl. the emoter). Nobody else learns of it.
//
// 'nick-face' (v2.2): Nick Song's head becomes a 😝 for a moment. Only the player whose lobby character
// is 'nicksong' may send it ('invalid' otherwise); same rate limit and same viewer rule as pointing.
//
// Errors go to the sender only and are identical for "no such pin" and "not your pin".
import { townLayout } from '@ct/assets';
import {
  homeBuilding,
  locationAt,
  MAX_PINS_PER_MEMBER,
  NICK_FACE_CHARACTER,
  type C2SParsed,
  type EmoteEvent,
  type GamePhase,
  type LocationId,
  type PinColor,
  type PinView,
  type ServerErrorMsg,
  type TownLayout,
} from '@ct/protocol';
import { randomId } from '../auth/crypto.js';
import { RateLimiter } from '../auth/rateLimit.js';
import type { RoomEvent, RoomHost, SocialModule } from '../rooms/modules.js';

/** Emotes: 2/s sustained, burst 4 (per member). */
export const EMOTE_LIMIT = { capacity: 4, refillPerSec: 2 } as const;
/** Pin drop / remove / clear (one shared bucket per member): 3/s sustained, burst 6. */
export const PIN_OPS_LIMIT = { capacity: 6, refillPerSec: 3 } as const;
/** Outdoor points this far outside the town bounds are clamped in; further out they are rejected. */
const TOWN_MARGIN_PX = 24;

const NIGHT_PHASES: ReadonlySet<GamePhase> = new Set(['first_night', 'night']);
/**
 * (security v2.3, SEC-3) Pins dropped in these phases vanish when they end. Dawn is still "the night"
 * for this purpose (homes are locked and the Storyteller may still be inside one); a pin the ST leaves
 * in a cottage at dawn must not show the next day's visitors where the ST was. Visibility (NIGHT_PHASES)
 * is unchanged: at dawn, like the world snapshot, members see their own location.
 */
const EPHEMERAL_PHASES: ReadonlySet<GamePhase> = new Set(['first_night', 'night', 'dawn']);

type SocialType = 'social:emote' | 'social:pin' | 'social:unpin' | 'social:clearPins';

interface Pin {
  id: string;
  by: string;
  character: string;
  color: PinColor;
  target: PinView['target'];
  location: LocationId;
  at: number;
  /** Dropped during a night phase: removed when the night ends. */
  night: boolean;
}

export interface SocialOptions {
  layout?: TownLayout;
}

export function createSocialModule(host: RoomHost, opts: SocialOptions = {}): SocialModule & {
  /** (tests / diagnostics) visibility predicate shared by pins and emotes. */
  canSee(viewer: string, target: string): boolean;
  /** (tests / diagnostics) every live pin, with its location. */
  allPins(): readonly (PinView & { location: LocationId })[];
} {
  const layout = opts.layout ?? townLayout;
  /** Insertion order = drop order (oldest first). */
  const pins = new Map<string, Pin>();
  let phase: GamePhase | null = null;
  const emoteLimiter = new RateLimiter(EMOTE_LIMIT);
  const pinLimiter = new RateLimiter(PIN_OPS_LIMIT);

  const isST = (pid: string) => host.member(pid)?.role === 'storyteller' || host.storytellerPid() === pid;
  const isNight = () => phase !== null && NIGHT_PHASES.has(phase);
  const isEphemeral = () => phase !== null && EPHEMERAL_PHASES.has(phase);
  const loc = (pid: string): LocationId | null => (host.member(pid) ? host.world.locationOf(pid) : null);

  function homeLoc(pid: string): LocationId | null {
    const b = homeBuilding(layout, host.member(pid)?.seat ?? null);
    return b ? `bld:${b.id}` : null;
  }

  /** Same rule as WorldModule.snapshotFor. */
  function canSee(viewer: string, target: string): boolean {
    const vl = loc(viewer);
    const tl = loc(target);
    if (vl === null || tl === null) return false;
    if (viewer === target) return true;
    if (isST(viewer)) return true;
    if (isNight()) {
      const home = homeLoc(viewer);
      return home !== null && tl === home;
    }
    return tl === vl;
  }

  /** The location whose pins this viewer is shown (null = none). */
  function viewLocation(viewer: string): LocationId | null {
    const vl = loc(viewer);
    if (vl === null) return null;
    if (isST(viewer) || !isNight()) return vl;
    return homeLoc(viewer);
  }

  /** The viewer sees `target` standing in the viewer's view location (where pins / pointing apply). */
  function seesHere(viewer: string, target: string): boolean {
    const here = viewLocation(viewer);
    return here !== null && canSee(viewer, target) && loc(target) === here;
  }

  function fail(pid: string, type: SocialType, code: ServerErrorMsg['code'], message: string) {
    host.send(pid, 'error', { code, message, for: type });
  }

  /** Validate / clamp a point in `where`. null = not allowed. */
  function placePoint(where: LocationId, x: number, y: number): { x: number; y: number } | null {
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const ts = layout.tileSize;
    if (where !== 'outdoors') {
      // (security v2.3, SEC-8) Interiors are walkable rooms in world coordinates (v2.2): a point must
      // lie in (or just next to, then clamped into) the room it is dropped in.
      const r = layout.buildings.find((b) => `bld:${b.id}` === where)?.interior;
      if (!r) return null;
      const [rx0, ry0, rx1, ry1] = [r.x * ts, r.y * ts, (r.x + r.w) * ts - 0.5, (r.y + r.h) * ts - 0.5];
      if (x < rx0 - TOWN_MARGIN_PX || x > rx1 + TOWN_MARGIN_PX || y < ry0 - TOWN_MARGIN_PX || y > ry1 + TOWN_MARGIN_PX) return null;
      const q = { x: r1(Math.min(rx1, Math.max(rx0, x))), y: r1(Math.min(ry1, Math.max(ry0, y))) };
      return locationAt(layout, q.x, q.y) === where ? q : null;
    }
    const tb = layout.townBounds;
    const x0 = tb.x * ts;
    const y0 = tb.y * ts;
    const x1 = (tb.x + tb.w) * ts - 0.5;
    const y1 = (tb.y + tb.h) * ts - 0.5;
    if (x < x0 - TOWN_MARGIN_PX || x > x1 + TOWN_MARGIN_PX || y < y0 - TOWN_MARGIN_PX || y > y1 + TOWN_MARGIN_PX) return null;
    const p = { x: r1(Math.min(x1, Math.max(x0, x))), y: r1(Math.min(y1, Math.max(y0, y))) };
    return locationAt(layout, p.x, p.y) === 'outdoors' ? p : null;
  }

  /** Where `pid` may gesture right now (their location, if it is also what they are shown). */
  function gestureLocation(pid: string): LocationId | null {
    const here = loc(pid);
    return here !== null && here === viewLocation(pid) ? here : null;
  }

  function newPinId(): string {
    let id = randomId(12);
    while (pins.has(id)) id = randomId(12);
    return id;
  }

  function removeWhere(pred: (p: Pin) => boolean): number {
    let n = 0;
    for (const [id, p] of pins)
      if (pred(p)) {
        pins.delete(id);
        n++;
      }
    return n;
  }

  function characterOf(pid: string): string {
    if (isST(pid)) return 'storyteller';
    return host.member(pid)?.cosmetics.preset ?? 'villager';
  }

  // ---------------------------------------------------------------------------------------

  function emote(pid: string, msg: C2SParsed<'social:emote'>) {
    const type = 'social:emote';
    if (!emoteLimiter.take(`${pid}:`, host.now())) return fail(pid, type, 'rate_limited', 'Easy there: one point at a time.');
    if (msg.kind === 'nick-face') return nickFace(pid);
    const here = gestureLocation(pid);
    if (!here) return fail(pid, type, 'forbidden', "You can't point at anything right now.");
    let point: { x: number; y: number } | null;
    let target: string | undefined;
    if (msg.pid !== undefined) {
      if (!seesHere(pid, msg.pid)) return fail(pid, type, 'not_found', "You can't see them from here.");
      const p = host.world.positionOf(msg.pid);
      if (!p) return fail(pid, type, 'not_found', "You can't see them from here.");
      point = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
      target = msg.pid;
    } else point = placePoint(here, msg.x, msg.y);
    if (!point) return fail(pid, type, 'invalid', 'Point at something in town.');
    const ev: EmoteEvent = { pid, kind: msg.kind, x: point.x, y: point.y, ...(target !== undefined ? { target } : {}), at: host.now() };
    for (const m of host.members()) if (canSee(m.pid, pid)) host.send(m.pid, 'social:emote', ev);
  }

  /**
   * 'nick-face' (v2.2): only a PLAYER whose lobby character is NICK_FACE_CHARACTER may send it (the
   * Storyteller never, whatever their preset). No target, no point: the event carries the emoter's own
   * position and goes, like every emote, only to members who can currently see the emoter.
   */
  function nickFace(pid: string) {
    const type = 'social:emote';
    if (isST(pid) || host.member(pid)?.cosmetics.preset !== NICK_FACE_CHARACTER) return fail(pid, type, 'invalid', 'Only Nick Song can pull that face.');
    const p = host.world.positionOf(pid);
    if (loc(pid) === null || !p) return fail(pid, type, 'forbidden', "You can't do that right now.");
    const ev: EmoteEvent = { pid, kind: 'nick-face', x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, at: host.now() };
    for (const m of host.members()) if (canSee(m.pid, pid)) host.send(m.pid, 'social:emote', ev);
  }

  function drop(pid: string, msg: C2SParsed<'social:pin'>) {
    const type = 'social:pin';
    const here = gestureLocation(pid);
    if (!here) return fail(pid, type, 'forbidden', "You can't drop a pin right now.");
    let target: Pin['target'];
    if (msg.target.kind === 'person') {
      if (!seesHere(pid, msg.target.pid)) return fail(pid, type, 'not_found', "You can't see them from here.");
      target = { kind: 'person', pid: msg.target.pid };
    } else {
      const p = placePoint(here, msg.target.x, msg.target.y);
      if (!p) return fail(pid, type, 'invalid', 'Pins go somewhere in town.');
      target = { kind: 'place', x: p.x, y: p.y };
    }
    // Evict this member's oldest pins beyond the cap (Map order = drop order).
    const mine = [...pins.values()].filter((p) => p.by === pid);
    for (let i = 0; i <= mine.length - MAX_PINS_PER_MEMBER; i++) pins.delete(mine[i]!.id);
    const pin: Pin = { id: newPinId(), by: pid, character: characterOf(pid), color: msg.color, target, location: here, at: host.now(), night: isEphemeral() };
    pins.set(pin.id, pin);
  }

  function unpin(pid: string, msg: C2SParsed<'social:unpin'>) {
    const p = pins.get(msg.id);
    // Same answer for "no such pin" and "not yours": ids of other people's pins are not probeable.
    if (!p || (p.by !== pid && !isST(pid))) return fail(pid, 'social:unpin', 'not_found', 'That pin is already gone.');
    pins.delete(p.id);
  }

  function clear(pid: string, msg: C2SParsed<'social:clearPins'>) {
    if (msg.scope === 'all') {
      if (!isST(pid)) return fail(pid, 'social:clearPins', 'forbidden', 'Only the Storyteller can clear everyone’s pins.');
      pins.clear();
      return;
    }
    removeWhere((p) => p.by === pid);
  }

  function onPhase(next: GamePhase) {
    const wasNight = isEphemeral();
    phase = next;
    if (wasNight && !isEphemeral()) removeWhere((p) => p.night);
  }

  return {
    onEvent(e: RoomEvent) {
      switch (e.type) {
        case 'member_left':
          removeWhere((p) => p.by === e.pid || (p.target.kind === 'person' && p.target.pid === e.pid));
          emoteLimiter.delete(`${e.pid}:`);
          pinLimiter.delete(`${e.pid}:`);
          break;
        case 'game_started':
          pins.clear();
          phase = null;
          break;
        case 'phase_changed':
          onPhase(e.phase);
          break;
        case 'game_finished':
          pins.clear();
          phase = 'finished';
          break;
        default:
          break;
      }
    },

    handle(pid, type, msg) {
      if (!host.member(pid)) return;
      if (type === 'social:emote') return emote(pid, msg as C2SParsed<'social:emote'>);
      if (!pinLimiter.take(`${pid}:`, host.now())) return fail(pid, type, 'rate_limited', 'Easy with the pins: try again in a moment.');
      if (type === 'social:pin') return drop(pid, msg as C2SParsed<'social:pin'>);
      if (type === 'social:unpin') return unpin(pid, msg as C2SParsed<'social:unpin'>);
      return clear(pid, msg as C2SParsed<'social:clearPins'>);
    },

    pinsFor(pid): PinView[] {
      const here = viewLocation(pid);
      if (here === null || pins.size === 0) return [];
      const out: PinView[] = [];
      for (const p of pins.values()) {
        if (p.location !== here) continue;
        if (p.target.kind === 'person' && !seesHere(pid, p.target.pid)) continue;
        out.push({ id: p.id, by: p.by, character: p.character, color: p.color, target: { ...p.target }, at: p.at });
      }
      return out;
    },

    canSee,
    allPins: () => [...pins.values()].map((p) => ({ id: p.id, by: p.by, character: p.character, color: p.color, target: { ...p.target }, at: p.at, location: p.location })),
  };
}
