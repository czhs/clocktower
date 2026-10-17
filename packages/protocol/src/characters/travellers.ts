// Travellers — the 15 official Travellers (five per base script).
//
// Travellers sit OUTSIDE the setup distribution (`countTypes` skips non-seated types): a Traveller
// seat is added ON TOP of an otherwise legal setup, and `randomAssignment` never draws one.
//
// ALIGNMENT IS PER GAME. A Traveller may be good or evil and the Storyteller decides which when
// the Traveller joins. The `alignment` here is only the catalogue default used by pickers; the
// authoritative value is `PlayerState.alignment`, which the Storyteller sets with
// `change_character` (it takes an explicit alignment).
//
// Travellers are never executed: they are EXILED (see packages/rules/src/exile.ts).
import type { CharacterInfo } from './types.js';

export const TRAVELLERS_CHARACTER_IDS = [
  // Trouble Brewing
  'scapegoat',
  'gunslinger',
  'beggar',
  'bureaucrat',
  'thief',
  // Bad Moon Rising
  'apprentice',
  'matron',
  'judge',
  'bishop',
  'voudon',
  // Sects & Violets
  'barista',
  'harlot',
  'butcher',
  'bone_collector',
  'deviant',
] as const;

export type TravellersCharacterId = (typeof TRAVELLERS_CHARACTER_IDS)[number];

/** Appended to every Traveller's setup hint: the Storyteller owns the alignment. */
const ALIGN = '[Storyteller chooses this Traveller’s alignment]';

export const TRAVELLERS_CHARACTER_INFO: Record<TravellersCharacterId, CharacterInfo> = {
  // ------------------------------------------------------------------------- Trouble Brewing
  scapegoat: {
    name: 'Scapegoat',
    type: 'traveller',
    alignment: 'good',
    ability: 'If a player of your alignment is executed, you might be executed in their place.',
    setupHint: ALIGN,
  },
  gunslinger: {
    name: 'Gunslinger',
    type: 'traveller',
    alignment: 'good',
    ability: 'Each day, after the first vote has been tallied, you may choose a player who voted: they die.',
    setupHint: ALIGN,
  },
  beggar: {
    name: 'Beggar',
    type: 'traveller',
    alignment: 'good',
    ability: 'You may only vote if a player hands you a vote token. You learn their alignment when they do. Dead players may give you theirs.',
    setupHint: ALIGN,
  },
  bureaucrat: {
    name: 'Bureaucrat',
    type: 'traveller',
    alignment: 'evil',
    ability: 'Each night pick a player other than yourself: tomorrow their vote counts three times.',
    setupHint: ALIGN,
  },
  thief: {
    name: 'Thief',
    type: 'traveller',
    alignment: 'evil',
    ability: 'Each night pick a player other than yourself: tomorrow their vote counts negatively.',
    setupHint: ALIGN,
  },
  // ------------------------------------------------------------------------ Bad Moon Rising
  apprentice: {
    name: 'Apprentice',
    type: 'traveller',
    alignment: 'good',
    ability: 'On your first night you gain a Townsfolk ability, or a Minion one if you are evil.',
    setupHint: ALIGN,
  },
  matron: {
    name: 'Matron',
    type: 'traveller',
    alignment: 'evil',
    ability: 'Each day players may not speak privately, and may only gather in groups of no more than three.',
    setupHint: ALIGN,
  },
  judge: {
    name: 'Judge',
    type: 'traveller',
    alignment: 'good',
    ability: 'Once per game, after a vote is tallied, you may force that execution to happen, or to not happen.',
    setupHint: ALIGN,
  },
  bishop: {
    name: 'Bishop',
    type: 'traveller',
    alignment: 'good',
    ability: 'Only the Storyteller may nominate, and at least one opposing player must be nominated each day.',
    setupHint: ALIGN,
  },
  voudon: {
    name: 'Voudon',
    type: 'traveller',
    alignment: 'evil',
    ability: 'Only you and the dead may vote, and their votes do not need a token. A tie is enough to execute.',
    setupHint: ALIGN,
  },
  // ----------------------------------------------------------------------- Sects & Violets
  barista: {
    name: 'Barista',
    type: 'traveller',
    alignment: 'good',
    ability: 'Each night pick a player: until dusk, either their ability works twice, or they are sober and healthy. They know which.',
    setupHint: ALIGN,
  },
  harlot: {
    name: 'Harlot',
    type: 'traveller',
    alignment: 'good',
    ability: 'Each night pick a living player: if they agree, you learn their character, but you both might die.',
    setupHint: ALIGN,
  },
  butcher: {
    name: 'Butcher',
    type: 'traveller',
    alignment: 'evil',
    ability: 'Each day, after the first execution, a second nomination may be made.',
    setupHint: ALIGN,
  },
  bone_collector: {
    name: 'Bone Collector',
    type: 'traveller',
    alignment: 'evil',
    ability: 'Once per game, at night, pick a dead player: they regain their ability until dusk.',
    setupHint: ALIGN,
  },
  deviant: {
    name: 'Deviant',
    type: 'traveller',
    alignment: 'evil',
    ability: 'If you were funny today, you cannot be exiled.',
    setupHint: ALIGN,
  },
};
