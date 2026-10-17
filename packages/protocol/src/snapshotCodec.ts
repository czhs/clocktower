import type { DoorTag, EntityState, Facing, SelfControl, WorldSnapshot } from './world.js';
import type { PinView } from './social.js';

// ---------------------------------------------------------------------------------------
// (v2.2, WP4) Compact world snapshots on the wire: 'world:snap2'.
//
// The server still computes the full per-viewer `WorldSnapshot` with `snapshotFor(pid)` (+ pins)
// exactly as before; one `SnapshotEncoder` PER CONNECTION then turns that viewer's sequence of
// snapshots into frames, and the client's `SnapshotDecoder` turns the frames back into the SAME
// `WorldSnapshot` objects (bit-identical: positions are already rounded to 0.1 px server-side).
//
// Secrecy: an encoder only ever sees one viewer's own snapshots, and its output is a pure function
// of that sequence (values + timestamps). It never adds information: the string table holds only
// ids/locations that were in this viewer's snapshots on this connection (indexed lazily on first
// send), and "nothing changed" (a skipped frame) is derivable from the full stream too.
//
// Frame = [kind, t, ackSeq, ents?, defs?, extras?] (trailing absent fields are dropped, null = absent)
//   kind   SNAP_DELTA: only entities whose tuple changed; the visible set is unchanged (never removes)
//          SNAP_KEY  : every visible entity; the client REPLACES its set (removal = not listed)
//          SNAP_RESET: SNAP_KEY after clearing the string table (first frame of a connection)
//   t      SNAP_KEY/RESET: server ms; SNAP_DELTA: ms since the last keyframe's t
//   ents   flat [idx, round(x*10), round(y*10), facing*2+moving, locIdx, ...]
//   defs   strings appended to the per-connection string table (pids + location ids), in order
//   extras keyframe: every present per-viewer field (absent = not set); delta: changed fields only
//          (null = cleared). Fields: you, doors, doorTags, pins.
// A keyframe is sent on the first frame, at least every SNAP_KEYFRAME_MS, and whenever the ordered
// list of visible ids changes (so "omitted because unchanged" can never be mistaken for "removed").
// When nothing changed at all only a keepalive delta [0, dt, ackSeq] goes out every
// SNAP_KEEPALIVE_MS (the client's dead-feed watchdog stays satisfied).

/** Join option announcing that the client understands 'world:snap2'. */
export const SNAP_CAPABILITY = 2;
export const SNAP_DELTA = 0;
export const SNAP_KEY = 1;
export const SNAP_RESET = 2;
export const SNAP_KEYFRAME_MS = 950; // every 12th frame at 12 Hz (1 s)
export const SNAP_KEEPALIVE_MS = 450; // every 6th frame at 12 Hz (2 Hz) when nothing changed
/** Restart the string table (SNAP_RESET) once it grows past this (lobby churn over many hours). */
export const SNAP_TABLE_MAX = 512;

export interface Snap2Extras {
  you?: SelfControl | null;
  doors?: Record<string, boolean> | null;
  doorTags?: Record<string, DoorTag[]> | null;
  pins?: PinView[] | null;
}
export type Snap2Frame =
  | [kind: number, t: number, ackSeq: number]
  | [kind: number, t: number, ackSeq: number, ents: number[] | null, defs?: string[] | null, extras?: Snap2Extras | null];

/** True when raw join options carry the 'world:snap2' capability (unknown/garbage -> false). */
export function snapCapable(options: unknown): boolean {
  return !!options && typeof options === 'object' && (options as { snap?: unknown }).snap === SNAP_CAPABILITY;
}

const FACING_CODE: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
const FACING_OF: readonly Facing[] = ['down', 'up', 'left', 'right'];
const EXTRAS = ['you', 'doors', 'doorTags', 'pins'] as const;
type ExtraKey = (typeof EXTRAS)[number];

/** Server side: one per connection (a new connection = a new encoder = a SNAP_RESET first). */
export class SnapshotEncoder {
  private table = new Map<string, number>();
  private ids: string[] = [];
  private sent = new Map<string, [number, number, number, number]>();
  private extras: Record<ExtraKey, string> = { you: '', doors: '', doorTags: '', pins: '' };
  private ack = -1;
  private keyT = 0;
  private lastSentT = 0;
  private started = false;

  /** The frame for this viewer's next snapshot, or null when nothing needs to go out. */
  encode(s: WorldSnapshot): Snap2Frame | null {
    const reset = !this.started || this.table.size > SNAP_TABLE_MAX;
    const sameSet = !reset && s.entities.length === this.ids.length && s.entities.every((e, i) => e.id === this.ids[i]);
    const key = reset || !sameSet || s.t - this.keyT >= SNAP_KEYFRAME_MS;
    if (reset) {
      this.table.clear();
      this.sent.clear();
      this.started = true;
    }
    const defs: string[] = [];
    const ref = (str: string): number => {
      let i = this.table.get(str);
      if (i === undefined) {
        i = this.table.size;
        this.table.set(str, i);
        defs.push(str);
      }
      return i;
    };
    const ents: number[] = [];
    for (const e of s.entities) {
      const tup: [number, number, number, number] = [Math.round(e.x * 10), Math.round(e.y * 10), FACING_CODE[e.facing] * 2 + (e.moving ? 1 : 0), ref(e.location)];
      const prev = this.sent.get(e.id);
      if (!key && prev && prev[0] === tup[0] && prev[1] === tup[1] && prev[2] === tup[2] && prev[3] === tup[3]) continue;
      ents.push(ref(e.id), tup[0], tup[1], tup[2], tup[3]);
      this.sent.set(e.id, tup);
    }
    if (key) {
      // Forget entities that are no longer visible: their next appearance is sent in full anyway.
      const now = new Set(s.entities.map((e) => e.id));
      for (const id of this.sent.keys()) if (!now.has(id)) this.sent.delete(id);
      this.ids = s.entities.map((e) => e.id);
    }
    let extras: Snap2Extras | null = null;
    for (const k of EXTRAS) {
      const v = s[k];
      const json = v === undefined ? '' : JSON.stringify(v);
      if (!key && json === this.extras[k]) continue;
      this.extras[k] = json;
      if (key && v === undefined) continue; // keyframe: absent = not listed
      (extras ??= {})[k] = (v ?? null) as never;
    }
    const ackChanged = s.ackSeq !== this.ack;
    this.ack = s.ackSeq;
    if (!key && !ents.length && !defs.length && !extras && !ackChanged && s.t - this.lastSentT < SNAP_KEEPALIVE_MS) return null;
    this.lastSentT = s.t;
    if (key) this.keyT = s.t;
    const kind = reset ? SNAP_RESET : key ? SNAP_KEY : SNAP_DELTA;
    const frame: Snap2Frame = [kind, key ? s.t : s.t - this.keyT, s.ackSeq, ents.length || key ? ents : null, defs.length ? defs : null, extras];
    while (frame.length > 3 && frame[frame.length - 1] === null) frame.pop();
    return frame;
  }
}

/** Client side: one per connection. Returns the full snapshot the server computed for this viewer. */
export class SnapshotDecoder {
  private table: string[] = [];
  private ents = new Map<string, EntityState>();
  private extras: Pick<WorldSnapshot, ExtraKey> = {};
  private keyT = 0;
  private t = 0;
  private ack = 0;
  private ready = false;

  /** Decode one frame; null if it cannot be applied (a delta before any keyframe). */
  decode(f: Snap2Frame): WorldSnapshot | null {
    const [kind, t, ackSeq, ents, defs, extras] = f as [number, number, number, (number[] | null)?, (string[] | null)?, (Snap2Extras | null)?];
    const key = kind === SNAP_KEY || kind === SNAP_RESET;
    if (!key && !this.ready) return null;
    if (kind === SNAP_RESET) this.table = [];
    if (defs) for (const d of defs) this.table.push(d);
    if (key) {
      this.ready = true;
      this.keyT = t;
      this.ents = new Map();
      this.extras = {};
    }
    this.t = key ? t : this.keyT + t;
    this.ack = ackSeq;
    if (ents)
      for (let i = 0; i + 4 < ents.length; i += 5) {
        const id = this.table[ents[i]!];
        const location = this.table[ents[i + 4]!];
        if (id === undefined || location === undefined) continue;
        const fm = ents[i + 3]!;
        this.ents.set(id, { id, x: ents[i + 1]! / 10, y: ents[i + 2]! / 10, facing: FACING_OF[fm >> 1] ?? 'down', moving: (fm & 1) === 1, location: location as EntityState['location'] });
      }
    if (extras)
      for (const k of EXTRAS) {
        if (!(k in extras)) continue;
        const v = extras[k];
        if (v === null || v === undefined) delete this.extras[k];
        else this.extras[k] = v as never;
      }
    return this.current();
  }

  /** The current state again (the client repeats it while nobody moves), at server time `t`. */
  current(t = this.t): WorldSnapshot | null {
    if (!this.ready) return null;
    const s: WorldSnapshot = { t, ackSeq: this.ack, entities: [...this.ents.values()].map((e) => ({ ...e })) };
    if (this.extras.you !== undefined) s.you = this.extras.you;
    if (this.extras.doors !== undefined) s.doors = this.extras.doors;
    if (this.extras.doorTags !== undefined) s.doorTags = this.extras.doorTags;
    if (this.extras.pins !== undefined) s.pins = this.extras.pins;
    return s;
  }

  /** Server time of the last decoded frame. */
  get serverT(): number {
    return this.t;
  }
}
