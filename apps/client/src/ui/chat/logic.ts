// (v2.3 chat/ux) Pure helpers for the chat panel (unit-tested in apps/client/test/chat.logic.test.ts).
// Everything here works on data the client already legitimately has: its own location, the lobby /
// game views and the entities its own world snapshot contains. Nothing reveals who is inside a room
// the viewer is not in.
import { cleanText, type AnnouncementView, type ChatMessage, type GamePhase, type LocationId, type MemberRole } from '@ct/protocol';

// ------------------------------------------------------------------------------ scope

/** Phases in which players are kept in their own homes (mirrors @ct/voice isNightLike). */
export function isNightLike(phase: GamePhase | null | undefined): boolean {
  return phase === 'first_night' || phase === 'night' || phase === 'dawn';
}

export interface ScopeInput {
  role: MemberRole | null;
  /** Game phase (null = no game: waiting room / between games). */
  phase: GamePhase | null;
  /** The viewer's own location (null = not placed in the town yet). */
  location: LocationId | null;
  /** The viewer's seat (= house index) once a game started. */
  seat: number | null;
  /** How many people (incl. the viewer) the viewer's OWN snapshot shows in the same location. */
  here: number;
  /** Building id -> display name. */
  buildingName: (id: string) => string | null;
  /** Building id -> house index (cottages) or null. */
  houseIndexOf: (id: string) => number | null;
  /** House index -> the player who lives there (public once seats are dealt), or null. */
  ownerOf: (houseIndex: number) => string | null;
}

export interface ChatScope {
  /** Stable key of the area (the voice/chat zone as far as the client can tell). */
  key: string;
  kind: 'square' | 'room' | 'home' | 'nobody' | 'unknown';
  /** Header line, e.g. "Town square" / "Inside Wychwood Cottage". */
  title: string;
  /** Who reads it, e.g. "everyone outside · 7 here" / "only this room · just you". */
  detail: string;
  /** Input placeholder. */
  placeholder: string;
  /** Short tag for lines said somewhere else, e.g. "square" / "in Wychwood Cottage". */
  tag: string;
}

function people(n: number, where: 'here' | 'outside'): string {
  if (n <= 1) return 'just you';
  return `${n} ${where}`;
}

/**
 * Who reads a chat line right now. Mirrors the server rule (chat audience = the sender's voice zone,
 * see @ct/voice zoneForMember): outdoors = the whole town outside, inside a building = that room,
 * players at night = their own home, the Storyteller outdoors at night = nobody.
 */
export function chatScope(i: ScopeInput): ChatScope {
  const st = i.role === 'storyteller';
  const asSt = st ? ' · you write as the Storyteller' : '';
  const night = isNightLike(i.phase);
  const loc = i.location;
  if (night && !st && i.seat !== null) {
    // Seat-based at night: a player is always in their own home as far as chat/voice are concerned.
    const inOwnHome = !!loc && loc.startsWith('bld:') && i.houseIndexOf(loc.slice(4)) === i.seat;
    if (!inOwnHome) {
      return {
        key: `home:${i.seat}`,
        kind: 'home',
        title: 'Your home',
        detail: 'private · only people in your home',
        placeholder: 'Say something at home…',
        tag: 'at home',
      };
    }
  }
  if (!loc) {
    return { key: 'unknown', kind: 'unknown', title: 'Nearby', detail: `people near you${asSt}`, placeholder: 'Say something nearby…', tag: 'nearby' };
  }
  if (loc === 'outdoors') {
    if (night && st) {
      return {
        key: 'outdoors:night',
        kind: 'nobody',
        title: 'Outside at night',
        detail: 'nobody can read this · step into a home to talk',
        placeholder: 'Nobody is outside at night…',
        tag: 'outside at night',
      };
    }
    return {
      key: 'outdoors',
      kind: 'square',
      title: 'Town square',
      detail: `everyone outside · ${people(i.here, 'outside')}${asSt}`,
      placeholder: 'Say something to everyone outside…',
      tag: 'square',
    };
  }
  const id = loc.slice(4);
  const name = i.buildingName(id) ?? 'a building';
  const hi = i.houseIndexOf(id);
  if (night && !st && hi !== null && hi === i.seat) {
    return {
      key: loc,
      kind: 'home',
      title: `Your home · ${name}`,
      detail: `private · ${people(i.here, 'here')}`,
      placeholder: 'Say something at home…',
      tag: 'at home',
    };
  }
  const owner = hi !== null ? i.ownerOf(hi) : null;
  return {
    key: loc,
    kind: 'room',
    title: `Inside ${name}`,
    detail: `${owner ? `${owner}’s home · ` : ''}only this room · ${people(i.here, 'here')}${asSt}`,
    placeholder: `Say something in ${name}…`,
    tag: `in ${name}`,
  };
}

/** Count of the people the viewer's own snapshot shows in `loc` (only members; never other rooms). */
export function countHere(entities: readonly { id: string; location: LocationId }[], loc: LocationId | null, isMember: (pid: string) => boolean): number {
  if (!loc) return 1;
  let n = 0;
  for (const e of entities) if (e.location === loc && isMember(e.id)) n++;
  return Math.max(1, n);
}

// ------------------------------------------------------------------------- rate limit

/** Client mirror of the server's per-pid token bucket for 'chat:send' (never over-send). */
export class TokenBucket {
  private tokens: number;
  private at: number;
  constructor(
    readonly capacity: number,
    readonly refillPerSec: number,
    now = 0,
  ) {
    this.tokens = capacity;
    this.at = now;
  }
  private refill(now: number) {
    if (now > this.at) this.tokens = Math.min(this.capacity, this.tokens + ((now - this.at) / 1000) * this.refillPerSec);
    this.at = Math.max(this.at, now);
  }
  take(now: number): boolean {
    this.refill(now);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
  /** Milliseconds until one token is available (0 = now). */
  waitMs(now: number): number {
    this.refill(now);
    return this.tokens >= 1 ? 0 : Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
  }
  /** The server refused: assume the bucket is empty for a moment. */
  drain(now: number) {
    this.refill(now);
    this.tokens = Math.min(this.tokens, 0);
  }
}

/** Mirrors GameRoom MESSAGE_LIMITS['chat:send'] (keep in sync; the server stays authoritative). */
export const CHAT_BUCKET = { capacity: 6, refillPerSec: 2 } as const;
/** Mirrors the server's duplicate-line guard (moderation/lobby.ts DUPLICATE_WINDOW_MS). */
export const DUPLICATE_WINDOW_MS = 5_000;
/** A sent line that is not echoed back within this time is marked "not delivered". */
export const ECHO_TIMEOUT_MS = 6000;
/** Back-off after the server said "slow down" / "busy". */
export const RETRY_AFTER_MS = 2000;
export const MAX_TRIES = 3;

/** Whole seconds left for a countdown ("sending in 2s"); never 0 while time remains. */
export function secondsLeft(untilMs: number, now: number): number {
  return Math.max(0, Math.ceil((untilMs - now) / 1000));
}

// --------------------------------------------------------------------------- outbox

/** Same normalisation as the server's duplicate guard (moderation/lobby.ts normLine). */
export function normLine(t: string): string {
  return t.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** What the server will actually deliver ('' = nothing left after cleaning). */
export function cleanChat(t: string): string {
  return cleanText(t);
}

export type OutState = 'queued' | 'sending' | 'failed';

export interface OutLine {
  cid: string;
  text: string;
  state: OutState;
  /** When it was typed (for ordering / display). */
  at: number;
  /** When it went to the server (sending). */
  sentAt?: number;
  /** Not before this time (queued after a "slow down"). */
  notBefore?: number;
  tries: number;
  reason?: string;
  /** The viewer's chat area when it was written. */
  zoneKey: string;
  zoneTag: string;
}

/**
 * An own message arrived from the server: which pending line does it confirm? Lines are processed in
 * order by the server, so the oldest 'sending' line with the same (normalised) text wins; if none has
 * the same text (the host's chat filter masked it), the oldest 'sending' line.
 */
export function matchEcho(out: readonly OutLine[], text: string, cid?: string): number {
  // (v2.3) servers that echo our client id: exact (even for a line that already timed out as failed)
  if (cid) {
    const byId = out.findIndex((o) => o.cid === cid);
    if (byId >= 0) return byId;
  }
  const n = normLine(text);
  const same = out.findIndex((o) => o.state === 'sending' && normLine(o.text) === n);
  if (same >= 0) return same;
  return out.findIndex((o) => o.state === 'sending');
}

/** Lines sent but never echoed (e.g. silently dropped) become 'failed' after ECHO_TIMEOUT_MS. */
export function expireOutbox(out: readonly OutLine[], now: number, timeoutMs = ECHO_TIMEOUT_MS): OutLine[] | null {
  let changed = false;
  const next = out.map((o) => {
    if (o.state === 'sending' && o.sentAt !== undefined && now - o.sentAt > timeoutMs) {
      changed = true;
      return { ...o, state: 'failed' as const, reason: 'Not delivered' };
    }
    return o;
  });
  return changed ? next : null;
}

/** Client id for an optimistic line: ≤16 chars of [A-Za-z0-9_-] (ChatSendMsg.cid). */
export function makeCid(now: number, rand: () => number = Math.random): string {
  return `c${now.toString(36)}${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')}`.slice(0, 16);
}

/** Error codes that mean "never deliverable as is" for every pending line (not just the oldest). */
export const FAIL_ALL_CODES: readonly string[] = ['muted', 'forbidden'];

/** The server refused the oldest in-flight line ('rate_limited' → retry later; else → failed). */
export function refuseOldest(out: readonly OutLine[], code: string, message: string, now: number): OutLine[] {
  const i = out.findIndex((o) => o.state === 'sending');
  if (i < 0) return out as OutLine[];
  const o = out[i]!;
  const retry = code === 'rate_limited' && o.tries < MAX_TRIES;
  const next = [...out];
  next[i] = retry
    ? { ...o, state: 'queued', notBefore: now + RETRY_AFTER_MS, sentAt: undefined }
    : { ...o, state: 'failed', reason: code === 'rate_limited' ? 'The chat is busy' : message || 'Not sent' };
  return next;
}

/** Is `text` the same line the viewer said within the duplicate window (the server would drop it)? */
export function isRecentDuplicate(text: string, last: { text: string; at: number } | null, now: number, pending: readonly OutLine[] = []): boolean {
  const n = normLine(text);
  if (pending.some((o) => o.state !== 'failed' && normLine(o.text) === n)) return true;
  return !!last && normLine(last.text) === n && now - last.at < DUPLICATE_WINDOW_MS;
}

// --------------------------------------------------------------------------- log

export type LogItem =
  | { type: 'chat'; key: string; at: number; msg: ChatMessage }
  | { type: 'crier'; key: string; at: number; ann: AnnouncementView };

/** Key for an announcement: ids restart every game (a1, a2…), so the time is part of it. */
export const annKey = (a: AnnouncementView) => `${a.id}@${a.at}`;

/** Union of announcement lists (game view history + live ones), deduped, oldest first, last `max`. */
export function mergeAnnouncements(lists: readonly (readonly AnnouncementView[])[], max = 60): AnnouncementView[] {
  const seen = new Map<string, AnnouncementView>();
  for (const l of lists) for (const a of l) seen.set(annKey(a), a);
  return [...seen.values()].sort((a, b) => a.at - b.at).slice(-max);
}

/** Chat lines and (optionally) announcements interleaved by time; stable for equal times. */
export function buildLog(chat: readonly ChatMessage[], anns: readonly AnnouncementView[], withCrier: boolean): LogItem[] {
  const items: LogItem[] = chat.map((msg) => ({ type: 'chat', key: `c:${msg.id}`, at: msg.at, msg }));
  if (withCrier) for (const ann of anns) items.push({ type: 'crier', key: `a:${annKey(ann)}`, at: ann.at, ann });
  return items.sort((a, b) => a.at - b.at);
}

/** Unread = chat lines from OTHER people after the last line the viewer saw (cap-safe: by id). */
export function unreadAfter(chat: readonly ChatMessage[], lastSeenId: string | null, youPid: string | null): number {
  let start = 0;
  if (lastSeenId) {
    const i = chat.findIndex((m) => m.id === lastSeenId);
    start = i >= 0 ? i + 1 : 0;
  }
  let n = 0;
  for (let k = start; k < chat.length; k++) if (chat[k]!.fromPid !== youPid || !youPid) n++;
  return n;
}

// --------------------------------------------------------------------------- scroll

/** Is the list scrolled to (or within `slack` px of) its bottom? */
export function atBottom(el: { scrollTop: number; clientHeight: number; scrollHeight: number }, slack = 24): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= slack;
}

/**
 * New-lines pill: lines that arrived while the reader was scrolled up. Reset when they reach the
 * bottom; own lines always jump to the bottom (and clear it).
 */
export function nextPill(prev: number, added: number, wasAtBottom: boolean, ownAdded: boolean): number {
  if (ownAdded || wasAtBottom) return 0;
  return prev + added;
}

/** "14:05" for a line's title / hover time. */
export function clockTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
