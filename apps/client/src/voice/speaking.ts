// OWNED BY voice. Pure helpers for big voice rooms (the town square holds up to ~16 people):
// a hang-time debounce for "who is speaking", recent-activity ordering + overflow for the voice
// panel, and the "join big rooms muted" decision. No LiveKit, no DOM: unit-tested in
// apps/client/test/voice.speaking.test.ts.

/** Speaking indicators stay on this long after the last "speaking" report (no flicker between words). */
export const SPEAKING_HANG_MS = 300;
/** A room with at least this many people (me included) counts as a crowd. */
export const CROWD_SIZE = 8;
/** Full rows in the panel's people list before the rest collapse into compact chips. */
export const PANEL_FULL_ROWS = 5;

/**
 * Hang-time debounce: an id reported speaking stays "speaking" until `hangMs` after the last
 * report. Feed it the raw set at any rate; the returned set only changes when an id turns on or a
 * hang expires (callers compare it to publish change-only patches).
 */
export class SpeakingHold {
  private until = new Map<string, number>();
  private current = new Set<string>();
  constructor(private readonly hangMs = SPEAKING_HANG_MS) {}

  /** Returns the held set (the same Set object when nothing changed). */
  update(raw: Iterable<string>, now: number): ReadonlySet<string> {
    for (const id of raw) this.until.set(id, now + this.hangMs);
    let changed = false;
    for (const [id, t] of this.until) {
      if (t <= now) {
        this.until.delete(id);
        if (this.current.has(id)) changed = true;
      } else if (!this.current.has(id)) changed = true;
    }
    if (changed) this.current = new Set(this.until.keys());
    return this.current;
  }

  /** Forget someone at once (left the room). */
  drop(id: string) {
    this.until.delete(id);
    if (this.current.has(id)) {
      this.current = new Set(this.current);
      this.current.delete(id);
    }
  }

  clear() {
    this.until.clear();
    if (this.current.size) this.current = new Set();
  }
}

// ---------------------------------------------------------------------------------------------
// Panel ordering for crowds.

export interface Activity {
  /** When the current talk spell started (null = not speaking). */
  since: number | null;
  /** Last time this person was seen speaking (0 = never). */
  last: number;
}

/** Update per-person activity from the current participant list (mutates `map`; drops leavers). */
export function noteActivity(map: Map<string, Activity>, people: readonly { pid: string; speaking: boolean }[], now: number): void {
  const present = new Set<string>();
  for (const p of people) {
    present.add(p.pid);
    const a = map.get(p.pid);
    if (p.speaking) {
      if (!a) map.set(p.pid, { since: now, last: now });
      else {
        a.since ??= now;
        a.last = now;
      }
    } else if (a && a.since !== null) {
      a.since = null;
      a.last = now;
    }
  }
  for (const pid of [...map.keys()]) if (!present.has(pid)) map.delete(pid);
}

export interface CrowdLayout<P> {
  /** Speaking now: who started first stays on top (no reshuffling while several talk). */
  talking: P[];
  /** Full rows below the talkers: most recent speakers first, then never-spoke in input order. */
  rows: P[];
  /** Collapsed into compact chips / "+N more". */
  overflow: P[];
}

/**
 * Split the people list into talking / full rows / overflow. Everyone talking always gets a full
 * row; the remaining full rows (up to `fullRows` rows in total) go to the most recent speakers.
 * Input order is the tie-break, so the result is stable between renders.
 */
export function crowdLayout<P extends { pid: string; speaking: boolean }>(people: readonly P[], activity: ReadonlyMap<string, Activity>, fullRows = PANEL_FULL_ROWS): CrowdLayout<P> {
  const idx = new Map(people.map((p, i) => [p.pid, i]));
  const by = (f: (p: P) => number) => (a: P, b: P) => f(a) - f(b) || idx.get(a.pid)! - idx.get(b.pid)!;
  const talking = people.filter((p) => p.speaking).sort(by((p) => activity.get(p.pid)?.since ?? Infinity));
  const quiet = people.filter((p) => !p.speaking).sort(by((p) => -(activity.get(p.pid)?.last ?? 0)));
  const room = Math.max(0, fullRows - talking.length);
  return { talking, rows: quiet.slice(0, room), overflow: quiet.slice(room) };
}

/** "12 people in the square" (me included). */
export function roomCountLabel(count: number, zone: string | null): string {
  const who = count === 1 ? '1 person' : `${count} people`;
  if (zone === 'square') return `${who} in the square`;
  if (zone === 'street') return `${who} on the streets`;
  return `${who} in this room`;
}

// ---------------------------------------------------------------------------------------------
// Etiquette: join big rooms muted (open mic only — push-to-talk is already silent by default).

export interface AutoMuteInput {
  enabledPref: boolean;
  inputMode: 'ptt' | 'open';
  muted: boolean;
  /** People in the room including me. */
  count: number;
  /** Already decided for this room (fires at most once per room join). */
  decided: boolean;
}

export function shouldAutoMute(i: AutoMuteInput): boolean {
  return i.enabledPref && !i.decided && i.inputMode === 'open' && !i.muted && i.count >= CROWD_SIZE;
}
