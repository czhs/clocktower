import { randomInt } from 'node:crypto';
import { EFF_LARGE_WORDLIST } from './effWordlist.js';

/** Words per generated passphrase. 6 × log2(7776) ≈ 77.5 bits (see NOTICE.md). */
export const PASSPHRASE_WORDS = 6;
export const PASSPHRASE_ENTROPY_BITS = PASSPHRASE_WORDS * Math.log2(EFF_LARGE_WORDLIST.length);

if (EFF_LARGE_WORDLIST.length < 7776) throw new Error('passphrase word list is incomplete');

/**
 * Generates a passphrase of independently, uniformly chosen words (crypto.randomInt uses a
 * CSPRNG with rejection sampling, so there is no modulo bias). Words are space-separated for
 * display; sign-in accepts any separator (see normalizePassphrase).
 */
export function generatePassphrase(words = PASSPHRASE_WORDS): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(EFF_LARGE_WORDLIST[randomInt(EFF_LARGE_WORDLIST.length)]!);
  return out.join(' ');
}

/**
 * Canonical form used for both the HMAC lookup and the scrypt verifier: NFKC, lower-case, every
 * run of non-letters (spaces, hyphens, dots, newlines from copy/paste) becomes a single '-'.
 * So "Abacus  yo-yo Chef" == "abacus-yo-yo-chef" == "abacus yo yo chef".
 */
export function normalizePassphrase(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
