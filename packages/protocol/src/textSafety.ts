// User-text safety helpers (v2.3, sec-web WEB-6/WEB-7). Zod-free: re-exported by both the full
// protocol entry and the client entry.

/**
 * Characters that render as nothing (or as blank space) but are letters/symbols, so `\p{Cf}` and
 * `\s` miss them: Hangul fillers, Braille blank, Khmer inherent vowels, Mongolian vowel separator,
 * combining grapheme joiner, musical-symbol nulls. Treated like whitespace by cleanText.
 */
export const INVISIBLE_CHARS = /[\u115F\u1160\u3164\uFFA0\u2800\u17B4\u17B5\u180E\u034F\u{1D159}\u{1D173}-\u{1D17A}]/gu;

/** Max combining marks kept after one base character (Zalgo stacks are cut to this). */
export const MAX_COMBINING_MARKS = 3;
const MARK_RUN = /(\p{M}{3})\p{M}+/gu;

/** Cuts runs of combining marks to MAX_COMBINING_MARKS (expects NFC input). */
export function capCombiningMarks(s: string): string {
  return s.replace(MARK_RUN, '$1');
}

// Look-alikes folded to one Latin letter (after NFKC + lower-casing + mark stripping). Over-folding
// is harmless: the only consequence of a skeleton collision is a "(2)" suffix on the later joiner.
const CONFUSABLE: Record<string, string> = {
  // Cyrillic
  а: 'a', в: 'b', е: 'e', ё: 'e', з: '3', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  ѕ: 's', і: 'l', ї: 'l', ј: 'j', ԁ: 'd', ԛ: 'q', ԝ: 'w', ӏ: 'l', һ: 'h', ь: 'b', ъ: 'b', п: 'n', г: 'r', и: 'u', л: 'n', д: 'a', ү: 'y',
  // Greek
  α: 'a', β: 'b', γ: 'y', ε: 'e', ζ: 'z', η: 'n', ι: 'l', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w', ς: 'c', σ: 'o',
  // Latin / digits / punctuation look-alikes
  ı: 'l', ȷ: 'j', ł: 'l', ø: 'o', đ: 'd', ħ: 'h', ŀ: 'l',
  i: 'l', '1': 'l', '|': 'l', '!': 'l', '0': 'o', '5': 's', '$': 's', '@': 'a',
};

/**
 * Comparison key for "do these two display names look the same?": NFKC (full-width, ligatures),
 * lower-case, marks stripped (á → a), confusables folded (Cyrillic а → a, I/l/1 → l, 0 → o,
 * rn → m, vv → w), invisible characters, spaces and punctuation dropped, and a trailing "(n)" that
 * would forge the room's own duplicate suffix removed.
 */
export function nameSkeleton(name: string): string {
  let s = name.normalize('NFKC').replace(INVISIBLE_CHARS, '').trim();
  s = s.replace(/\s*\(\s*\d+\s*\)\s*$/u, '');
  s = s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  s = Array.from(s, (c) => CONFUSABLE[c] ?? c).join('');
  return s
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Whether text has anything visible left once invisible fillers, marks and spaces are removed. */
export function hasVisibleText(s: string): boolean {
  return s.replace(INVISIBLE_CHARS, '').replace(/[\p{M}\p{Z}\s\p{Cc}\p{Cf}]/gu, '').length > 0;
}

/**
 * (v2.3 WEB-1) cleanText for multi-line text (Storyteller prompt bodies, info, announcements):
 * same character rules, but line breaks survive (at most one blank line in a row).
 */
export function cleanMultiline(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?|[\u2028\u2029\u0085]/g, '\n')
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? c : ' '))
    .replace(INVISIBLE_CHARS, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^\p{M}+/u, '')
    .replace(MARK_RUN, '$1');
}
