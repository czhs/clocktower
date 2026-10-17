// The rulebook Grimoire's content: which "books" (bookmark tabs) exist, which characters each one
// lists, the general rules text, and search. Pure (no DOM), so it is unit-tested in
// apps/client/test/rulebook.test.ts.
//
// Character data comes straight from the catalogue (@ct/protocol) and the night order straight from
// the engine's role table (@ct/rules), so the rulebook can never disagree with the game. All rules
// prose here is our own paraphrase, never rulebook text (same policy as CHARACTER_INFO.ability).
import {
  CHARACTER_IDS,
  CHARACTER_INFO,
  FABLED_IDS,
  SCRIPT_INFO,
  TB_DISTRIBUTION,
  TRAVELLER_IDS,
  charactersOfScript,
  scriptOfCharacter,
  type CharacterId,
  type CharacterType,
  type ScriptId,
} from '@ct/protocol';
import { ROLES, firstNightOrder, otherNightOrder } from '@ct/rules';

export const BOOK_IDS = ['rules', 'trouble-brewing', 'bad-moon-rising', 'sects-and-violets', 'travellers', 'fabled', 'homebrew'] as const;
export type BookId = (typeof BOOK_IDS)[number];

export const HOMEBREW_IDS: readonly CharacterId[] = CHARACTER_IDS.filter((c) => scriptOfCharacter(c) === 'homebrew');

export interface Book {
  id: BookId;
  /** Full title (page heading). */
  title: string;
  /** Short label for the bookmark ribbon. */
  tab: string;
  blurb: string;
  /** Characters on this book's pages (empty for the general rules). */
  characters: readonly CharacterId[];
  /** Book-specific rules, as short paragraphs. */
  rules: readonly RuleSection[];
  /** Whether a night order exists for this book (only the three playable scripts). */
  nightOrder: boolean;
}

export interface RuleSection {
  heading: string;
  points: readonly string[];
}

export const TYPE_ORDER: readonly CharacterType[] = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled'];
export const TYPE_LABEL: Record<CharacterType, string> = {
  townsfolk: 'Townsfolk',
  outsider: 'Outsiders',
  minion: 'Minions',
  demon: 'Demons',
  traveller: 'Travellers',
  fabled: 'Fabled',
};

const GENERAL_RULES: readonly RuleSection[] = [
  {
    heading: 'The two teams',
    points: [
      'Good is the Townsfolk and Outsiders. Evil is the Minions and the Demon.',
      'Good wins when the Demon dies. Evil wins when only two players are left alive (not counting Travellers).',
      'You may say anything at any time, including lies. Only the Storyteller sees the whole truth, in the Grimoire.',
    ],
  },
  {
    heading: 'How a game flows',
    points: [
      'Setup: the Storyteller gives every player a character in secret. Evil players learn who each other are on the first night.',
      'Night: everyone goes home. The Storyteller wakes characters one at a time, in the night order, to use their abilities or learn information.',
      'Day: the town talks in the square and in private cottages, then gathers for nominations.',
      'Drunk or poisoned players have no ability, but they are not told. The Storyteller may give them false information.',
    ],
  },
  {
    heading: 'Nominations and execution',
    points: [
      'Each living player may nominate once per day, and each player may be nominated once per day.',
      'Votes go clockwise around the circle, starting next to the nominee. Raise your hand to vote.',
      'A nominee needs votes from at least half the living players, and more votes than anyone else today, to be "about to die".',
      'At the end of the day, the player about to die is executed. A tie for the most votes means nobody is executed.',
      'At most one execution happens per day.',
    ],
  },
  {
    heading: 'Death',
    points: [
      'Dead players keep talking and stay in the game. Their team can still win.',
      'Dead players lose their ability and cannot nominate.',
      'Each dead player has one ghost vote for the rest of the game. Using it spends it.',
    ],
  },
  {
    heading: 'Setup counts',
    points: [
      'The number of each type in play depends on the player count (see the table). Some characters change it; their entry says how.',
      'Travellers sit outside this table: they are added on top of a legal setup.',
    ],
  },
  {
    heading: 'Chance and the Storyteller',
    points: [
      'Chance decides which characters are dealt and who gets each one.',
      'The Storyteller decides who the Drunk is, which characters may be dealt at all, the Demon\'s bluffs, and everything each player is told at night.',
      'Votes are counted exactly as they are cast: nothing about voting is left to chance.',
      'In an automatic game there is no Storyteller, so the Drunk is dealt at random like any other character.',
    ],
  },
];

const TB_RULES: readonly RuleSection[] = [
  {
    heading: 'About this script',
    points: [
      'The best first script. Information is mostly reliable and the Demon kills one player each night.',
      'The Drunk believes they are a Townsfolk. The Fortune Teller has one good player who reads as the Demon (the red herring).',
      'If the Demon dies with five or more players alive, the Scarlet Woman becomes the new Demon.',
    ],
  },
];

const BMR_RULES: readonly RuleSection[] = [
  {
    heading: 'About this script',
    points: [
      'Deaths come thick and fast: most Demons can kill more than one player, and some deaths happen during the day.',
      'Protection matters. Many good characters keep others alive, and evil characters stop that protection.',
      'Characters that are "told" a result may be lied to when drunk or poisoned, as usual. Information here is about deaths more than identities.',
    ],
  },
];

const SNV_RULES: readonly RuleSection[] = [
  {
    heading: 'About this script',
    points: [
      'Information is unreliable by design: madness, characters changing, and players learning false things.',
      '"Mad" means a player must try to convince the town they are something. The Storyteller may punish players who break madness.',
      'Characters can change mid-game. Your current character is always the one in your role card.',
    ],
  },
];

const TRAVELLER_RULES: readonly RuleSection[] = [
  {
    heading: 'Travellers',
    points: [
      'A Traveller is a player who joins late or must leave early. Everyone knows which character they are.',
      'The Storyteller secretly decides whether each Traveller is good or evil.',
      'Travellers are never executed. Instead, anyone may call for them to be exiled.',
    ],
  },
  {
    heading: 'Exile',
    points: [
      'Everyone may vote on an exile, including dead players, and dead players do not spend their ghost vote.',
      'An exile needs votes from at least half the living players, the same as an execution.',
      'An exile is not an execution: it does not use up the day\'s execution, and it is not compared with today\'s nominations.',
      'An exiled Traveller dies and their ability ends.',
    ],
  },
];

const FABLED_RULES: readonly RuleSection[] = [
  {
    heading: 'Fabled',
    points: [
      'Fabled are not players. The Storyteller puts one into play to change a rule, often to help new or special groups.',
      'Everyone can see which Fabled are in play. A Fabled never wakes at night.',
    ],
  },
];

const HOMEBREW_RULES: readonly RuleSection[] = [
  {
    heading: 'Homebrew',
    points: [
      'Characters invented for this town. They are not on any official script.',
      'They only appear in a custom script, which the Storyteller builds from any mix of characters.',
    ],
  },
];

export const BOOKS: Record<BookId, Book> = {
  rules: { id: 'rules', title: 'Rules of the Town', tab: 'Rules', blurb: 'How every game works, whatever the script.', characters: [], rules: GENERAL_RULES, nightOrder: false },
  'trouble-brewing': scriptBook('trouble-brewing', 'TB', TB_RULES),
  'bad-moon-rising': scriptBook('bad-moon-rising', 'BMR', BMR_RULES),
  'sects-and-violets': scriptBook('sects-and-violets', 'S&V', SNV_RULES),
  travellers: { id: 'travellers', title: 'Travellers', tab: 'Travellers', blurb: 'Late arrivals and early leavers, offered on every script.', characters: TRAVELLER_IDS, rules: TRAVELLER_RULES, nightOrder: false },
  fabled: { id: 'fabled', title: 'Fabled', tab: 'Fabled', blurb: 'Storyteller props that change the rules for everyone.', characters: FABLED_IDS, rules: FABLED_RULES, nightOrder: false },
  homebrew: { id: 'homebrew', title: 'Homebrew', tab: 'Homebrew', blurb: 'Custom characters made for this town.', characters: HOMEBREW_IDS, rules: HOMEBREW_RULES, nightOrder: false },
};

function scriptBook(id: 'trouble-brewing' | 'bad-moon-rising' | 'sects-and-violets', tab: string, rules: readonly RuleSection[]): Book {
  return { id, title: SCRIPT_INFO[id].name, tab, blurb: SCRIPT_INFO[id].blurb, characters: charactersOfScript(id), rules, nightOrder: true };
}

/**
 * The book the Grimoire opens on for a lobby's script. A custom script can mix anything, so it
 * opens on Homebrew (the only characters you cannot find on an official script).
 */
export function bookForScript(script: ScriptId | undefined | null): BookId {
  if (script === 'trouble-brewing' || script === 'bad-moon-rising' || script === 'sects-and-violets') return script;
  if (script === 'custom') return 'homebrew';
  return 'trouble-brewing';
}

/** The book a character's own entry lives in. */
export function bookOfCharacter(c: CharacterId): BookId {
  const s = scriptOfCharacter(c);
  return s === 'custom' ? 'homebrew' : s;
}

/** A book's characters grouped by type, in the standard order (empty groups dropped). */
export function groupsOf(book: Book): { type: CharacterType; label: string; ids: CharacterId[] }[] {
  return TYPE_ORDER.map((type) => ({ type, label: TYPE_LABEL[type], ids: book.characters.filter((c) => CHARACTER_INFO[c].type === type) })).filter(
    (g) => g.ids.length > 0,
  );
}

/** Night order for a playable script's book, from the engine itself. */
export function nightOrderOf(book: Book): { first: CharacterId[]; other: CharacterId[] } | null {
  if (!book.nightOrder) return null;
  const script = book.id as ScriptId;
  return { first: firstNightOrder(script), other: otherNightOrder(script) };
}

export interface CharacterFacts {
  id: CharacterId;
  name: string;
  type: CharacterType;
  alignment: 'good' | 'evil';
  ability: string;
  setupHint?: string;
  book: BookId;
  wakesFirstNight: boolean;
  wakesOtherNights: boolean;
  /** Woken only when something happens (the Ravenkeeper on death). */
  wakesOnTrigger: boolean;
  reminders: readonly string[];
  believesOther?: CharacterType;
  dayAbility?: string;
  nightNote?: string;
}

export function factsOf(c: CharacterId): CharacterFacts {
  const info = CHARACTER_INFO[c];
  const def = ROLES[c];
  return {
    id: c,
    name: info.name,
    type: info.type,
    alignment: info.alignment,
    ability: info.ability,
    setupHint: info.setupHint ?? def?.setupNote,
    book: bookOfCharacter(c),
    wakesFirstNight: def?.firstNight != null,
    wakesOtherNights: def?.otherNight != null,
    wakesOnTrigger: def?.dynamicOrder !== undefined && def?.otherNight == null,
    reminders: def?.reminders ?? [],
    believesOther: def?.believesOther,
    dayAbility: def?.dayAbility?.label,
    nightNote: def?.nightNote,
  };
}

/** One-line summary of when a character acts, for the detail page. */
export function wakeSummary(f: CharacterFacts): string {
  if (f.type === 'fabled') return 'Never wakes (not a player).';
  if (f.wakesFirstNight && f.wakesOtherNights) return 'Wakes on the first night and every night after.';
  if (f.wakesFirstNight) return 'Wakes on the first night only.';
  if (f.wakesOtherNights) return 'Wakes each night after the first.';
  if (f.wakesOnTrigger) return 'Wakes only when their ability is triggered.';
  return 'Does not wake at night.';
}

/** Setup table rows for 5-15 players (shared by the three official scripts). */
export function setupRows(): { players: number; townsfolk: number; outsiders: number; minions: number; demons: number }[] {
  return Object.entries(TB_DISTRIBUTION)
    .map(([n, c]) => ({ players: Number(n), ...c }))
    .sort((a, b) => a.players - b.players);
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Search every character in every book by name, type or ability text. Name matches come first,
 * then type, then ability.
 */
export function searchCharacters(query: string, limit = 40): CharacterId[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: { c: CharacterId; score: number }[] = [];
  for (const c of CHARACTER_IDS) {
    const info = CHARACTER_INFO[c];
    const name = fold(info.name);
    const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : fold(TYPE_LABEL[info.type]).includes(q) ? 2 : fold(info.ability).includes(q) ? 3 : -1;
    if (score >= 0) scored.push({ c, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || CHARACTER_INFO[a.c].name.localeCompare(CHARACTER_INFO[b.c].name))
    .slice(0, limit)
    .map((x) => x.c);
}
