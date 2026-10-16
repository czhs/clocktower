// OWNED BY rules-storyteller. (qol) Pure helpers for the player HUD (unit-tested in
// apps/client/test/hud.logic.test.ts). Everything here reads only what the own view contains.
import type { GameResult, NominationView } from '@ct/protocol';

/** Mark for one seat in the Town list while a nomination is pending / voting (all public). */
export type VoteMark = 'yes' | 'no' | 'raised' | null;

export function voteMark(nom: NominationView | undefined, seat: number): VoteMark {
  if (!nom || (nom.status !== 'voting' && nom.status !== 'pending')) return null;
  const v = nom.votes[seat];
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return (nom.handsRaised ?? []).includes(seat) ? 'raised' : null;
}

/** "Choose 2 players · 1 chosen" for a choose_players prompt. */
export function chooseLine(min: number, max: number, chosen: number): string {
  const n = min === max ? `${min}` : `${min}–${max}`;
  const base = `Choose ${n} player${max === 1 ? '' : 's'}`;
  return chosen > 0 ? `${base} · ${chosen} chosen` : `${base}.`;
}

/** The own line of the endgame reveal ("You were the Imp — Evil wins: you won"); null for the ST. */
export function ownOutcome(result: GameResult, seat: number | null): { won: boolean; alignment: 'good' | 'evil' } | null {
  if (seat === null) return null;
  const row = result.reveal.find((r) => r.seat === seat);
  if (!row) return null;
  return { won: row.alignment === result.winner, alignment: row.alignment };
}

type KeyLike = { key: string; code: string; repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean };
type ElLike = { tagName?: string; isContentEditable?: boolean } | null | undefined;

export function isTypingElement(el: ElLike): boolean {
  if (!el || !el.tagName) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || !!el.isContentEditable;
}

/**
 * Whether a single-key HUD shortcut may fire: never while typing, with Ctrl/Cmd/Alt, on key
 * repeat, under a modal dialog, or when the key is the player's push-to-talk key.
 */
export function shortcutAllowed(e: KeyLike, active: ElLike, opts: { modalOpen: boolean; pttCode: string | null }): boolean {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (opts.modalOpen || isTypingElement(active)) return false;
  if (opts.pttCode && e.code === opts.pttCode) return false;
  return true;
}

/** The push-to-talk key the voice panel stored (default V); read-only, never written here. */
export function storedPttCode(): string | null {
  try {
    const raw = localStorage.getItem('ct.voice.prefs');
    const p = raw ? (JSON.parse(raw) as { pttKey?: unknown }) : null;
    return typeof p?.pttKey === 'string' ? p.pttKey : 'KeyV';
  } catch {
    return 'KeyV';
  }
}
