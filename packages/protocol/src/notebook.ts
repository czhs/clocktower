import { z } from 'zod';
import { CHARACTER_IDS } from './game.js';

// ---------------------------------------------------------------------------------------
// (v2, notebook) Private per-game notebook. OWNED BY notebook (additive contract).
//
// Every member of a running/finished game (each player AND the Storyteller, who gets the same
// notebook as a scratchpad next to the Grimoire) has exactly one notebook per match, keyed
// server-side by (matchId, accountId). It is OWNER-ONLY:
//   * 'notebook:data' is sent only to the owner's own connection (never broadcast, never in any
//     view / snapshot / record / stats / admin API / log line);
//   * it survives refresh, reconnect and device switch (stored in SQLite, table `notebooks`);
//   * a new game (new matchId) starts a fresh, empty notebook; old ones stay stored for their owner.
//
// Saving is "last write wins, newer rev wins": the client always saves `rev = <rev it last got
// from the server> + 1`. The server stores it only if `rev` is greater than the stored rev and
// acks with cause 'saved'; otherwise it answers with the stored (newer) copy, cause 'newer'
// (typically: another device of the same account saved in between). Saves are rate-limited and
// size-capped (NOTEBOOK_MAX_BYTES of JSON) server-side.

/** Max UTF-8 bytes of JSON.stringify(NotebookData). One save = one WebSocket frame. */
export const NOTEBOOK_MAX_BYTES = 20 * 1024;
/** Free-text page, characters. */
export const NOTEBOOK_TEXT_MAX = 8000;
/** One note next to a seat ("claims / suspicion"), characters. */
export const NOTEBOOK_NOTE_MAX = 160;
/** Highest rev the server accepts (a notebook is never saved this often; keeps numbers sane). */
export const NOTEBOOK_REV_MAX = 1_000_000_000;

/** Quick trust marker on a seat: ★ trust, ? unsure, ✗ distrust. */
export const NOTEBOOK_MARKS = ['trust', 'unsure', 'distrust'] as const;
export type NotebookMark = (typeof NOTEBOOK_MARKS)[number];

export const NotebookSeatNote = z.object({
  /** Seat index (0..14) — stable for the whole match, unlike names. */
  seat: z.number().int().min(0).max(14),
  note: z.string().max(NOTEBOOK_NOTE_MAX),
  /** Role guess from the script's character list (null / absent = no guess). */
  guess: z.enum(CHARACTER_IDS).nullable().optional(),
  mark: z.enum(NOTEBOOK_MARKS).nullable().optional(),
});
export type NotebookSeatNote = z.infer<typeof NotebookSeatNote>;

export const NotebookData = z
  .object({
    /** Free-text page. */
    text: z.string().max(NOTEBOOK_TEXT_MAX),
    /** Only seats with something on them; at most one entry per seat. */
    seats: z.array(NotebookSeatNote).max(15),
  })
  .refine((d) => new Set(d.seats.map((s) => s.seat)).size === d.seats.length, { message: 'One entry per seat' })
  .refine((d) => notebookBytes(d) <= NOTEBOOK_MAX_BYTES, { message: 'Notebook is too large' });
export type NotebookData = z.infer<typeof NotebookData>;

export const EMPTY_NOTEBOOK: NotebookData = Object.freeze({ text: '', seats: [] }) as NotebookData;

/** C2S 'notebook:save' — autosave of the whole notebook for `matchId` (must be the current game). */
export const NotebookSaveMsg = z.object({
  matchId: z.string().min(1).max(64),
  rev: z.number().int().min(1).max(NOTEBOOK_REV_MAX),
  data: NotebookData,
});
export type NotebookSaveMsg = z.infer<typeof NotebookSaveMsg>;

/** C2S 'notebook:load' — "send me my notebook for the current game" (on mount / after reconnect). */
export const NotebookLoadMsg = z.object({});

/** S2C 'notebook:data' — only ever sent to the notebook's owner. */
export interface NotebookDataMsg {
  matchId: string;
  /** 0 = never saved. */
  rev: number;
  data: NotebookData;
  /** Server time of the stored copy (ms), null if never saved. */
  savedAt: number | null;
  /**
   * load  = your notebook (join, reconnect, game start, or your 'notebook:load');
   * saved = ack of your save with this rev (data echoes what was stored);
   * newer = your save was NOT stored: this (newer) copy was saved from another device first.
   */
  cause: 'load' | 'saved' | 'newer';
}

/**
 * S2C 'notebook:unavailable' — a load/save could not be served.
 * no_game = no game in this lobby (waiting room) or `matchId` is not the current game: drop the
 * notebook; rate_limited / busy = keep your edits and retry after `retryInMs`.
 */
export interface NotebookUnavailableMsg {
  reason: 'no_game' | 'rate_limited' | 'busy';
  retryInMs: number | null;
}

/** UTF-8 byte length of JSON.stringify(data) (no TextEncoder needed). */
export function notebookBytes(data: unknown): number {
  return utf8Length(JSON.stringify(data) ?? '');
}

export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
