// (v2.2, lobby-auth) Simple-word lobby ids and names. zod-free: re-exported verbatim by both the
// full entry (index.ts) and the browser entry (client.ts).
//
//   id    `<adjective>-<noun>-<noun>`, lowercase, e.g. `amber-fox-lantern`   (share link /lobby/<id>)
//   name  `<Adjective> <Noun>`, e.g. `Amber Lantern`   (default / suggested display name)
//
// Lobby ids are public (every lobby is listed in the finder; see LobbySummary.id) and are NOT a
// credential, so they only need to be unique among live lobbies (the directory retries on
// collision and avoids recently retired ids). Words are short (<= 7 letters), common, spelled one
// way, with no well-known homophones (no "bear", "knight", "sail", ...), nothing rude or scary.

export const LOBBY_ADJECTIVES = [
  'amber', 'brave', 'bright', 'brisk', 'calm', 'cheery', 'clever', 'copper', 'coral', 'crimson',
  'crisp', 'eager', 'early', 'fancy', 'fluffy', 'frosty', 'fuzzy', 'gentle', 'glad', 'golden',
  'grand', 'green', 'happy', 'honest', 'humble', 'ivory', 'jolly', 'kind', 'lively', 'lofty',
  'loyal', 'lucky', 'magic', 'mellow', 'mighty', 'misty', 'modest', 'neat', 'nimble', 'noble',
  'plucky', 'polite', 'proud', 'quick', 'rosy', 'royal', 'rustic', 'scarlet', 'shiny', 'silky',
  'silver', 'sleepy', 'smooth', 'snowy', 'steady', 'sturdy', 'sunlit', 'swift', 'tidy', 'tiny',
  'trusty', 'velvet', 'violet', 'vivid', 'warm', 'witty', 'young', 'zesty',
] as const;

export const LOBBY_NOUNS = [
  // creatures
  'badger', 'beetle', 'bison', 'camel', 'cricket', 'crow', 'donkey', 'duck', 'eagle', 'falcon',
  'ferret', 'finch', 'fox', 'frog', 'gecko', 'goose', 'hamster', 'heron', 'kitten', 'kiwi',
  'koala', 'lark', 'lemur', 'lion', 'magpie', 'moth', 'newt', 'otter', 'owl',
  'panda', 'parrot', 'pony', 'puffin', 'rabbit', 'raven', 'robin', 'sparrow', 'swan',
  'tiger', 'trout', 'turtle', 'walrus', 'wolf', 'yak', 'zebra',
  // nature
  'acorn', 'apple', 'birch', 'blossom', 'breeze', 'brook', 'canyon', 'cedar', 'cherry', 'cliff',
  'clover', 'cloud', 'comet', 'cove', 'daisy', 'dune', 'ember', 'fern', 'forest', 'frost',
  'garden', 'grove', 'harvest', 'hill', 'lagoon', 'lake', 'lemon', 'lily', 'maple', 'meadow',
  'meteor', 'moon', 'moss', 'orchard', 'pebble', 'pine', 'planet', 'pond', 'poppy', 'rainbow',
  'reef', 'river', 'spruce', 'star', 'stone', 'storm', 'summit', 'thistle', 'thunder', 'tulip',
  'valley', 'willow',
  // things
  'anchor', 'arrow', 'banner', 'barrel', 'basket', 'bridge', 'bucket', 'button', 'cabin', 'candle',
  'castle', 'chimney', 'compass', 'cookie', 'cottage', 'crown', 'drum', 'feather', 'fiddle',
  'flute', 'harp', 'honey', 'kettle', 'kite', 'ladder', 'lantern', 'mango', 'market', 'mitten',
  'muffin', 'needle', 'peach', 'pepper', 'pretzel', 'pumpkin', 'puzzle', 'quill', 'ribbon', 'riddle',
  'saddle', 'scroll', 'sled', 'spoon', 'teapot', 'thimble', 'tower', 'turnip', 'wagon', 'waffle',
  'walnut', 'whistle', 'window',
] as const;

/** Format of a simple-word lobby id (new lobbies since v2.2). */
export const WORD_LOBBY_ID_RE = /^[a-z]+-[a-z]+-[a-z]+$/;
/** Every lobby id the server accepts in URLs / APIs: simple-word ids and the older random ids. */
export const LOBBY_ID_RE = /^[A-Za-z0-9_-]{4,32}$/;

/** Uniform integer in [0, n) — crypto when available (browsers, Node >= 19), Math.random otherwise. */
function randomIndex(n: number): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    const limit = Math.floor(0x1_0000_0000 / n) * n;
    const buf = new Uint32Array(1);
    for (;;) {
      c.getRandomValues(buf);
      if (buf[0]! < limit) return buf[0]! % n;
    }
  }
  return Math.floor(Math.random() * n);
}

const pick = <T>(list: readonly T[], rand: (n: number) => number): T => list[rand(list.length)]!;
const title = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

/** A fresh simple-word lobby id, e.g. `amber-fox-lantern` (the two nouns always differ). */
export function wordLobbyId(rand: (n: number) => number = randomIndex): string {
  const a = pick(LOBBY_ADJECTIVES, rand);
  const n1 = pick(LOBBY_NOUNS, rand);
  let n2 = pick(LOBBY_NOUNS, rand);
  for (let i = 0; n2 === n1 && i < 16; i++) n2 = pick(LOBBY_NOUNS, rand);
  if (n2 === n1) n2 = LOBBY_NOUNS[(LOBBY_NOUNS.indexOf(n1) + 1) % LOBBY_NOUNS.length]!;
  return `${a}-${n1}-${n2}`;
}

/** A friendly default / suggested lobby name, e.g. `Amber Lantern`. */
export function wordLobbyName(rand: (n: number) => number = randomIndex): string {
  return `${title(pick(LOBBY_ADJECTIVES, rand))} ${title(pick(LOBBY_NOUNS, rand))}`;
}

/**
 * Canonical form of an incoming lobby id: simple-word ids are case-insensitive
 * (`Amber-Fox-Lantern` -> `amber-fox-lantern`, e.g. when a link was retyped on a phone); any other
 * id (the older random, mixed-case ids) is returned untouched because its case is significant.
 */
export function normalizeLobbyId(id: string): string {
  return /^[A-Za-z]+-[A-Za-z]+-[A-Za-z]+$/.test(id) ? id.toLowerCase() : id;
}
