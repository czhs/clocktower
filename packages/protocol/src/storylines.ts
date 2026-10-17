// (v2.2, rules-storyteller) Preset Trouble Brewing setups ("storylines") + the standard
// distribution table. ZOD-FREE (re-exported as-is by the browser entry client.ts), pure, no I/O.
//
// A storyline is a RULE that builds a legal character bag for N players (5-15): a fixed core
// (always dealt), a preferred pool (tried first, in random order), an avoid list (never dealt) and
// the standard Trouble Brewing counts for N (the Baron adds two Outsiders and removes two
// Townsfolk). Every storyline yields a STANDARD distribution for every count it supports
// (`storylinePlayerCounts`); counts it cannot fill legally are unsupported (greyed out in the UI).
// The bag is then shuffled onto the seats by the server (@ct/rules presets.ts, StCommand
// 'deal_preset'). Unit tests: packages/rules/test/presets.test.ts.
//
// Secrecy: which storyline was dealt tells which characters are (likely) in play. It is
// Storyteller-only in human games; in automatic games the host's pick is 'secret' in the public
// lobby summary unless the host announces it (see docs/auto-storyteller.md).
import type { CharacterId, CharacterType } from './game.js';
import { TB_CHARACTER_IDS } from './characters/tb.js';

export interface TbCounts {
  townsfolk: number;
  outsiders: number;
  minions: number;
  demons: number;
}

/** Trouble Brewing base distribution by player count (before the Baron's modification). */
export const TB_DISTRIBUTION: Readonly<Record<number, TbCounts>> = {
  5: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  6: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
  7: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
  8: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
  9: { townsfolk: 5, outsiders: 2, minions: 1, demons: 1 },
  10: { townsfolk: 7, outsiders: 0, minions: 2, demons: 1 },
  11: { townsfolk: 7, outsiders: 1, minions: 2, demons: 1 },
  12: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
  13: { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 },
  14: { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 },
  15: { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 },
};

/** Standard counts for `n` players (null outside 5-15); the Baron adds two Outsiders. */
export function tbCounts(n: number, withBaron = false): TbCounts | null {
  const base = TB_DISTRIBUTION[n];
  if (!base) return null;
  return withBaron ? { ...base, townsfolk: base.townsfolk - 2, outsiders: base.outsiders + 2 } : { ...base };
}

export const STORYLINE_IDS = [
  'beginners-lantern',
  'classic-night',
  'poisoned-well',
  'town-of-liars',
  'saints-gambit',
  'drunk-bell-tower',
  'outsiders-gate',
] as const;
export type StorylineId = (typeof STORYLINE_IDS)[number];

export interface StorylineDef {
  id: StorylineId;
  title: string;
  /** One line of flavour (shown under the title). */
  blurb: string;
  /** Who it suits. */
  level: 'beginner' | 'standard' | 'tricky';
  /** Always in the bag (the Imp is always core: Trouble Brewing has one Demon). */
  core: readonly CharacterId[];
  /** Tried first (random order) when filling the remaining slots of each type. */
  prefer: readonly CharacterId[];
  /** Never dealt. */
  avoid: readonly CharacterId[];
  /** Add the Baron when the core needs more Outsiders than the count gives (and a Minion slot is free). */
  baronIfNeeded?: boolean;
  /** Preferred Townsfolk for the Drunk to believe they are (first one not in play; else random). */
  drunkBelieves?: readonly CharacterId[];
}

const INFO_TOWNSFOLK: CharacterId[] = ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortune_teller', 'undertaker'];

export const STORYLINES: readonly StorylineDef[] = [
  {
    id: 'beginners-lantern',
    title: "Beginner's Lantern",
    blurb: 'A gentle first night: plain-spoken townsfolk, no Drunk, no Spy, nobody who lies about what they are.',
    level: 'beginner',
    core: ['imp'],
    prefer: ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'undertaker', 'monk', 'soldier', 'ravenkeeper', 'slayer', 'virgin', 'scarlet_woman'],
    avoid: ['drunk', 'recluse', 'spy', 'baron'],
  },
  {
    id: 'classic-night',
    title: 'Classic Night',
    blurb: 'Lanterns lit, doors barred: a town thick with first-night whispers, and one Imp hiding among them.',
    level: 'standard',
    core: ['imp'],
    prefer: INFO_TOWNSFOLK,
    avoid: [],
  },
  {
    id: 'poisoned-well',
    title: 'The Poisoned Well',
    blurb: 'Someone has tainted the well. A Poisoner works the dark, and any whisper might be a lie.',
    level: 'standard',
    core: ['imp', 'poisoner'],
    prefer: ['empath', 'fortune_teller', 'undertaker', 'chef', 'investigator', 'washerwoman', 'ravenkeeper', 'monk'],
    avoid: [],
  },
  {
    id: 'town-of-liars',
    title: 'A Town of Liars',
    blurb: 'Nothing is what it claims: a Spy reads the Grimoire and a Recluse wears false colours.',
    level: 'tricky',
    core: ['imp', 'spy', 'recluse'],
    prefer: ['drunk', 'investigator', 'washerwoman', 'librarian', 'chef', 'empath'],
    avoid: [],
    baronIfNeeded: true,
  },
  {
    id: 'saints-gambit',
    title: "The Saint's Gambit",
    blurb: 'A Saint walks among you. Hang the wrong soul and the town is damned, and evil knows it.',
    level: 'standard',
    core: ['imp', 'saint'],
    prefer: ['virgin', 'slayer', 'mayor', 'soldier', 'scarlet_woman'],
    avoid: [],
    baronIfNeeded: true,
  },
  {
    id: 'drunk-bell-tower',
    title: 'Drunk on the Bell Tower',
    blurb: 'Someone rang the bell at midnight and swears they are the Fortune Teller. They are not.',
    level: 'tricky',
    core: ['imp', 'drunk'],
    prefer: [],
    avoid: [],
    baronIfNeeded: true,
    drunkBelieves: ['fortune_teller', 'empath', 'undertaker', 'chef', 'investigator'],
  },
  {
    id: 'outsiders-gate',
    title: 'Outsiders at the Gate',
    blurb: 'The Baron has opened the gate: strangers crowd the square and the town is thinner than it looks.',
    level: 'tricky',
    core: ['imp', 'baron'],
    prefer: ['butler', 'recluse', 'saint', 'drunk'],
    avoid: [],
  },
];

export function storylineById(id: string): StorylineDef | undefined {
  return STORYLINES.find((s) => s.id === id);
}

/** Character type lookup (pass CHARACTER_INFO: the full table lives in game.ts / client.ts). */
export type CharacterTypes = Readonly<Record<CharacterId, { type: CharacterType }>>;

const TYPES: CharacterType[] = ['minion', 'outsider', 'townsfolk'];

/**
 * Storylines are Trouble Brewing setups: their random fill draws only from the Trouble Brewing
 * pool, even though `info` (CHARACTER_INFO) now holds every script's characters.
 */
function ofType(info: CharacterTypes, t: CharacterType): CharacterId[] {
  return (TB_CHARACTER_IDS as readonly CharacterId[]).filter((c) => info[c]?.type === t);
}

/** Why `def` cannot be dealt for `n` players (null = it can). Deterministic. */
export function storylineProblem(def: StorylineDef, n: number, info: CharacterTypes): string | null {
  const base = TB_DISTRIBUTION[n];
  if (!base) return `Trouble Brewing needs 5-15 players (got ${n})`;
  const core = def.core.filter((c) => !def.avoid.includes(c));
  if (core.filter((c) => info[c].type === 'demon').length !== 1) return 'A storyline needs exactly one Demon';
  const coreOf = (t: CharacterType) => core.filter((c) => info[c].type === t);
  const avail = (t: CharacterType) => ofType(info, t).filter((c) => !def.avoid.includes(c));
  const minions = [...coreOf('minion')];
  if (def.baronIfNeeded && !minions.includes('baron') && coreOf('outsider').length > base.outsiders) minions.push('baron');
  if (minions.length > base.minions) return `Only ${base.minions} Minion${base.minions === 1 ? '' : 's'} at ${n} players`;
  if (avail('minion').length < base.minions) return `Not enough Minions for ${n} players`;
  // Which Baron outcomes can the random fill produce?
  const baronOptions = minions.includes('baron')
    ? [true]
    : def.avoid.includes('baron') || minions.length === base.minions
      ? [false]
      : avail('minion').filter((c) => !minions.includes(c)).length === base.minions - minions.length // every free Minion is dealt
        ? [true]
        : [false, true];
  for (const baron of baronOptions) {
    const want = tbCounts(n, baron)!;
    if (coreOf('outsider').length > want.outsiders) return `Too few Outsider slots at ${n} players`;
    if (avail('outsider').length < want.outsiders) return `Not enough Outsiders for ${n} players${baron ? ' with the Baron' : ''}`;
    if (coreOf('townsfolk').length > want.townsfolk) return `Too few Townsfolk slots at ${n} players`;
    if (avail('townsfolk').length < want.townsfolk) return `Not enough Townsfolk for ${n} players`;
  }
  return null;
}

/** The player counts (5-15) a storyline supports. */
export function storylinePlayerCounts(def: StorylineDef, info: CharacterTypes): number[] {
  const out: number[] = [];
  for (let n = 5; n <= 15; n++) if (storylineProblem(def, n, info) === null) out.push(n);
  return out;
}

/** "5-15", "6, 8-15", "5-12". */
export function formatCounts(counts: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < counts.length; ) {
    let j = i;
    while (j + 1 < counts.length && counts[j + 1] === counts[j]! + 1) j++;
    parts.push(j > i ? `${counts[i]}-${counts[j]}` : `${counts[i]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

function shuffled<T>(rng: () => number, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Build the character bag (no seats yet) for `n` players. Throws Error when unsupported.
 * The result is a standard distribution; order: Demon, Minions, Outsiders, Townsfolk.
 */
export function buildStorylineBag(def: StorylineDef, n: number, rng: () => number, info: CharacterTypes): CharacterId[] {
  const problem = storylineProblem(def, n, info);
  if (problem) throw new Error(`${def.title}: ${problem}`);
  const base = TB_DISTRIBUTION[n]!;
  const core = def.core.filter((c) => !def.avoid.includes(c));
  const fill = (t: CharacterType, need: number, start: CharacterId[]): CharacterId[] => {
    const chosen = [...start];
    const free = (c: CharacterId) => info[c].type === t && !def.avoid.includes(c) && !chosen.includes(c);
    const order = [...shuffled(rng, def.prefer.filter(free)), ...shuffled(rng, ofType(info, t).filter((c) => free(c) && !def.prefer.includes(c)))];
    while (chosen.length < need) chosen.push(order.shift()!);
    return chosen;
  };
  const coreOf = (t: CharacterType) => core.filter((c) => info[c].type === t);
  const minionStart = coreOf('minion');
  if (def.baronIfNeeded && !minionStart.includes('baron') && coreOf('outsider').length > base.outsiders) minionStart.push('baron');
  const minions = fill('minion', base.minions, minionStart);
  const want = tbCounts(n, minions.includes('baron'))!;
  const bag: CharacterId[] = [...coreOf('demon'), ...minions];
  for (const t of TYPES.slice(1)) bag.push(...fill(t, t === 'outsider' ? want.outsiders : want.townsfolk, coreOf(t)));
  return bag;
}
