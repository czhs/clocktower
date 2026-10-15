// OWNED BY notebook. Pure notebook state (no DOM, no network): the reducer behind the autosaving
// private notebook, plus the serializer that keeps a save inside the protocol limits.
//
// Sync model ("newer rev wins", see packages/protocol/src/notebook.ts):
//   * `base` is the rev of the last copy the server confirmed or sent us. A save is always
//     `rev = base + 1` with the full local data; at most one save is in flight.
//   * 'saved' ack for our in-flight rev -> base = rev; still dirty if we typed since sending.
//   * 'newer' (our save lost) or a 'load' with a rev above `base` while we had unsaved edits -> the
//     server copy wins; if our local copy differed it is kept aside as `notice.discarded`, so the
//     player can choose "Keep this device's version" (re-saved as base + 1).
//   * a different matchId = a different game: start over from what the server sent.
import {
  EMPTY_NOTEBOOK,
  NOTEBOOK_MARKS,
  NOTEBOOK_MAX_BYTES,
  NOTEBOOK_NOTE_MAX,
  NOTEBOOK_TEXT_MAX,
  notebookBytes,
  type CharacterId,
  type NotebookData,
  type NotebookDataMsg,
  type NotebookMark,
  type NotebookSeatNote,
  type NotebookUnavailableMsg,
} from '@ct/protocol';

export type SaveStatus = 'loading' | 'saved' | 'unsaved' | 'saving' | 'retrying' | 'offline' | 'closed';

export interface NotebookState {
  /** null = no notebook (no game yet / back in the waiting room). */
  matchId: string | null;
  /** Local working copy (normalized). */
  data: NotebookData;
  /** Rev of the last server-confirmed copy we are based on. */
  base: number;
  savedAt: number | null;
  /** Local edits the server has not confirmed yet. */
  dirty: boolean;
  /** The save in flight (rev + exact JSON sent). */
  inflight: { rev: number; json: string } | null;
  /** The last save we sent (to recognise our own save echoed back after a reconnect). */
  lastSent: { rev: number; json: string } | null;
  /** Server copy received at least once for matchId. */
  loaded: boolean;
  online: boolean;
  /** Don't send before this time (rate limit / storage busy). */
  retryAt: number;
  notice: { kind: 'newer'; discarded: NotebookData } | null;
}

export const initialNotebook = (): NotebookState => ({
  matchId: null,
  data: EMPTY_NOTEBOOK,
  base: 0,
  savedAt: null,
  dirty: false,
  inflight: null,
  lastSent: null,
  loaded: false,
  online: true,
  retryAt: 0,
  notice: null,
});

export type NotebookAction =
  | { type: 'server'; msg: NotebookDataMsg }
  | { type: 'unavailable'; msg: NotebookUnavailableMsg; now: number }
  | { type: 'edit'; edit: NotebookEdit }
  | { type: 'sent'; rev: number; json: string }
  | { type: 'online'; online: boolean }
  | { type: 'keepMine' }
  | { type: 'dismissNotice' }
  | { type: 'noGame' };

export type NotebookEdit =
  | { kind: 'text'; text: string }
  | { kind: 'note'; seat: number; note: string }
  | { kind: 'guess'; seat: number; guess: CharacterId | null }
  | { kind: 'mark'; seat: number; mark: NotebookMark | null };

// ------------------------------------------------------------------------------- serializer

/** Canonical JSON (fixed key order, seats sorted, empty seats dropped) — also the equality test. */
export function serialize(d: NotebookData): string {
  return JSON.stringify(normalize(d));
}

const sameData = (a: NotebookData, b: NotebookData) => serialize(a) === serialize(b);

/** Cut a string to at most `max` UTF-16 units without splitting a surrogate pair. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

const isMark = (m: unknown): m is NotebookMark => typeof m === 'string' && (NOTEBOOK_MARKS as readonly string[]).includes(m);

/** One-line note: no line breaks / control characters, length-capped. */
export function cleanNote(s: string): string {
  // eslint-disable-next-line no-control-regex
  return clip(s.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ''), NOTEBOOK_NOTE_MAX);
}

/**
 * Keep a notebook inside the protocol limits: canonical key order, one entry per seat (0..14),
 * sorted, empty entries dropped, fields capped, and the whole JSON <= NOTEBOOK_MAX_BYTES (the
 * free-text page is trimmed from the end if a pathological mix of multi-byte notes overflows).
 */
export function normalize(d: NotebookData): NotebookData {
  const bySeat = new Map<number, NotebookSeatNote>();
  for (const s of d.seats) {
    if (!Number.isInteger(s.seat) || s.seat < 0 || s.seat > 14) continue;
    const note = cleanNote(s.note ?? '');
    const guess = s.guess ?? null;
    const mark = isMark(s.mark) ? s.mark : null;
    if (!note && !guess && !mark) {
      bySeat.delete(s.seat);
      continue;
    }
    const e: NotebookSeatNote = { seat: s.seat, note };
    if (guess) e.guess = guess;
    if (mark) e.mark = mark;
    bySeat.set(s.seat, e);
  }
  const seats = [...bySeat.values()].sort((a, b) => a.seat - b.seat);
  let text = clip(d.text ?? '', NOTEBOOK_TEXT_MAX);
  let out: NotebookData = { text, seats };
  while (notebookBytes(out) > NOTEBOOK_MAX_BYTES && text.length) {
    const over = notebookBytes(out) - NOTEBOOK_MAX_BYTES;
    text = clip(text, Math.max(0, text.length - Math.max(1, Math.ceil(over / 3))));
    out = { text, seats };
  }
  return out;
}

/** Bytes used / allowed (for a "nearly full" hint). */
export const usage = (d: NotebookData) => notebookBytes(d) / NOTEBOOK_MAX_BYTES;

export function seatNote(d: NotebookData, seat: number): NotebookSeatNote {
  return d.seats.find((s) => s.seat === seat) ?? { seat, note: '' };
}

export function applyEdit(d: NotebookData, e: NotebookEdit): NotebookData {
  if (e.kind === 'text') return normalize({ ...d, text: e.text });
  const cur = { ...seatNote(d, e.seat) };
  if (e.kind === 'note') cur.note = e.note;
  else if (e.kind === 'guess') cur.guess = e.guess;
  else cur.mark = e.mark;
  return normalize({ ...d, seats: [...d.seats.filter((s) => s.seat !== e.seat), cur] });
}

// ---------------------------------------------------------------------------------- reducer

export function reduce(s: NotebookState, a: NotebookAction): NotebookState {
  switch (a.type) {
    case 'server': {
      const m = a.msg;
      const data = normalize(m.data);
      // A different game (or our first copy — edits are impossible before it): start from the server's.
      if (m.matchId !== s.matchId || !s.loaded) {
        return { ...initialNotebook(), online: s.online, matchId: m.matchId, data, base: m.rev, savedAt: m.savedAt, loaded: true };
      }
      if (m.cause === 'saved') {
        if (!s.inflight || s.inflight.rev !== m.rev) return { ...s, base: Math.max(s.base, m.rev), savedAt: m.savedAt };
        const typedSince = serialize(s.data) !== s.inflight.json;
        return { ...s, base: m.rev, savedAt: m.savedAt, inflight: null, dirty: typedSince };
      }
      // 'load' or 'newer'
      const local = s.data;
      const ownEcho = s.lastSent && s.lastSent.rev === m.rev && s.lastSent.json === serialize(data);
      if (m.cause === 'load' && (m.rev <= s.base || ownEcho)) {
        // Nothing newer than what we are based on (or it is our own save, applied before a drop).
        const base = Math.max(s.base, m.rev);
        if (s.dirty || s.inflight) return { ...s, base, savedAt: m.savedAt ?? s.savedAt, inflight: null, dirty: !sameData(local, data) };
        return { ...s, base, savedAt: m.savedAt, data };
      }
      // The server holds a newer copy than ours: it wins.
      const lost = (s.dirty || !!s.inflight || m.cause === 'newer') && !sameData(local, data);
      return {
        ...s,
        data,
        base: m.rev,
        savedAt: m.savedAt,
        dirty: false,
        inflight: null,
        notice: lost ? { kind: 'newer', discarded: local } : s.notice,
      };
    }
    case 'unavailable': {
      if (a.msg.reason === 'no_game') return { ...initialNotebook(), online: s.online };
      return { ...s, inflight: null, retryAt: a.now + Math.max(1000, a.msg.retryInMs ?? 3000) };
    }
    case 'edit': {
      if (!s.matchId) return s;
      const data = applyEdit(s.data, a.edit);
      if (sameData(data, s.data)) return s;
      return { ...s, data, dirty: true };
    }
    case 'sent':
      return { ...s, inflight: { rev: a.rev, json: a.json }, lastSent: { rev: a.rev, json: a.json } };
    case 'online':
      // A save in flight when the socket dropped may or may not have landed: resend after the reload.
      return a.online ? { ...s, online: true } : { ...s, online: false, inflight: null };
    case 'keepMine':
      if (!s.notice) return s;
      return { ...s, data: normalize(s.notice.discarded), dirty: true, notice: null };
    case 'dismissNotice':
      return { ...s, notice: null };
    case 'noGame':
      return { ...initialNotebook(), online: s.online };
  }
}

/** The save to send now, if any (one in flight at a time; never before the first load). */
export function nextSave(s: NotebookState, now: number): { matchId: string; rev: number; data: NotebookData; json: string } | null {
  if (!s.matchId || !s.loaded || !s.dirty || s.inflight || !s.online || now < s.retryAt) return null;
  const data = normalize(s.data);
  return { matchId: s.matchId, rev: s.base + 1, data, json: JSON.stringify(data) };
}

export function saveStatus(s: NotebookState, now: number): SaveStatus {
  if (!s.matchId) return 'closed';
  if (!s.loaded) return s.online ? 'loading' : 'offline';
  if (!s.dirty && !s.inflight) return 'saved';
  if (!s.online) return 'offline';
  if (s.inflight) return 'saving';
  if (now < s.retryAt) return 'retrying';
  return 'unsaved';
}
