import { z } from 'zod';
import {
  CHAT_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  LOBBY_DESCRIPTION_MAX,
  LOBBY_NAME_MAX,
  LOBBY_NAME_MIN,
} from './constants.js';

/**
 * Normalises user-supplied text: NFC, strips control/format characters (incl. bidi overrides
 * and zero-width chars), collapses whitespace. UI must still render text via textContent /
 * framework escaping — this is defence in depth, not HTML sanitisation.
 */
export function cleanText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const cleaned = (min: number, max: number) =>
  z
    .string()
    .max(max * 4)
    .transform(cleanText)
    .pipe(z.string().min(min).max(max));

export const DisplayName = cleaned(DISPLAY_NAME_MIN, DISPLAY_NAME_MAX);
export const LobbyName = cleaned(LOBBY_NAME_MIN, LOBBY_NAME_MAX);
export const LobbyDescription = cleaned(0, LOBBY_DESCRIPTION_MAX);
export const ChatText = cleaned(1, CHAT_MAX);
