// (v2.3 OPS-6, sec-ops) Server-side chat filter. Runs in GameRoom.handleChat BEFORE a line is
// delivered, so every recipient (chat pane, speech bubbles, reports) sees the same masked text and a
// modified client cannot opt out. Word list + leetspeak/confusable handling: `obscenity` (MIT,
// zero dependencies; https://github.com/jo3-l/obscenity) English dataset.
//   off    nothing masked
//   slurs  identity slurs only (DEFAULT)
//   strict the whole English dataset (slurs + sexual terms + general profanity)
import {
  asteriskCensorStrategy,
  DataSet,
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
  TextCensor,
  type EnglishProfaneWord,
} from 'obscenity';
import { DEFAULT_CHAT_FILTER, type ChatFilterMode } from '@ct/protocol';

/** Identity slurs in obscenity's English dataset (the 'slurs' mode). */
export const SLUR_WORDS: ReadonlySet<EnglishProfaneWord> = new Set<EnglishProfaneWord>([
  'abeed',
  'abo',
  'africoon',
  'arabush',
  'boonga',
  'chingchong',
  'chink',
  'dyke',
  'fag',
  'kike',
  'negro',
  'nigger',
  'retard',
  'spastic',
  'tranny',
]);

type Meta = { originalWord: EnglishProfaneWord };

function buildMatcher(onlySlurs: boolean): RegExpMatcher {
  const data = new DataSet<Meta>().addAll(englishDataset);
  if (onlySlurs) data.removePhrasesIf((p) => !p.metadata || !SLUR_WORDS.has(p.metadata.originalWord));
  return new RegExpMatcher({ ...data.build(), ...englishRecommendedTransformers });
}

let matchers: { slurs: RegExpMatcher; strict: RegExpMatcher } | null = null;
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/** Built lazily once per process (a few ms). */
function get(mode: 'slurs' | 'strict'): RegExpMatcher {
  matchers ??= { slurs: buildMatcher(true), strict: buildMatcher(false) };
  return matchers[mode];
}

export function normalizeFilterMode(mode: unknown): ChatFilterMode {
  return mode === 'off' || mode === 'slurs' || mode === 'strict' ? mode : DEFAULT_CHAT_FILTER;
}

/** Masks the matched spans with '*' (same length). Never throws: on an internal error the text is returned unchanged. */
export function filterChat(text: string, mode: ChatFilterMode): string {
  if (mode === 'off' || !text) return text;
  try {
    const m = get(mode);
    const matches = m.getAllMatches(text, true);
    return matches.length ? censor.applyTo(text, matches) : text;
  } catch {
    return text;
  }
}
