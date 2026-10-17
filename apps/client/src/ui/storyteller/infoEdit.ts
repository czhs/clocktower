// (st-control) What a player is told is the Storyteller's choice. The engine suggests an answer
// (the truth, or a false one for a drunk/poisoned player) with the players, characters and number
// it points at; the Storyteller may change any of them. Swapping one keeps the sentence in step:
// the old name / character / number in the text becomes the new one. Pure (unit-tested).
import { CHARACTER_INFO, type CharacterId } from '@ct/protocol';

export interface InfoAttachments {
  seats?: number[];
  characters?: CharacterId[];
  number?: number;
}

export interface InfoDraft extends InfoAttachments {
  text: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace `from` with `to` where it stands as a whole word (names, character names, numbers). */
export function replaceWord(text: string, from: string, to: string): string {
  if (!from || from === to) return text;
  return text.replace(new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(from)}(?=$|[^\\p{L}\\p{N}_])`, 'gu'), (_m, pre: string) => `${pre}${to}`);
}

/** Point attachment `i` at another player; the text follows. */
export function swapSeat(d: InfoDraft, i: number, seat: number, nameOf: (seat: number) => string): InfoDraft {
  const seats = [...(d.seats ?? [])];
  const old = seats[i];
  if (old === undefined || old === seat) return d;
  seats[i] = seat;
  return { ...d, seats, text: replaceWord(d.text, nameOf(old), nameOf(seat)) };
}

/** Show another character in place of attachment `i`; the text follows. */
export function swapCharacter(d: InfoDraft, i: number, c: CharacterId): InfoDraft {
  const characters = [...(d.characters ?? [])];
  const old = characters[i];
  if (old === undefined || old === c) return d;
  characters[i] = c;
  return { ...d, characters, text: replaceWord(d.text, CHARACTER_INFO[old].name, CHARACTER_INFO[c].name) };
}

/** Tell another number (Chef, Empath, ...); the text follows. */
export function swapNumber(d: InfoDraft, n: number): InfoDraft {
  if (d.number === undefined || d.number === n) return d;
  return { ...d, number: n, text: replaceWord(d.text, String(d.number), String(n)) };
}
