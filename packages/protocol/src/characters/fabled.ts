// Fabled — Storyteller props, not players. A Fabled has no seat: it changes the rules of the game
// or records a decision the Storyteller made, and it is shown to everyone.
//
// They are pure data here and in packages/rules/src/scripts/fabled.ts: a Fabled must never have a
// night step, because there is no player to wake (asserted in packages/rules/test/travellers.test.ts).
import type { CharacterInfo } from './types.js';

export const FABLED_CHARACTER_IDS = [
  'doomsayer',
  'angel',
  'buddhist',
  'hells_librarian',
  'revolutionary',
  'fiddler',
  'toymaker',
  'fibbin',
  'duchess',
  'sentinel',
  'spirit_of_ivory',
  'djinn',
] as const;

export type FabledCharacterId = (typeof FABLED_CHARACTER_IDS)[number];

export const FABLED_CHARACTER_INFO: Record<FabledCharacterId, CharacterInfo> = {
  doomsayer: {
    name: 'Doomsayer',
    type: 'fabled',
    alignment: 'good',
    ability: 'If four or more players live, each living player may publicly call for a death once per day: the Storyteller kills a player of that alignment.',
  },
  angel: {
    name: 'Angel',
    type: 'fabled',
    alignment: 'good',
    ability: 'Something bad might happen to whoever is most responsible for a new player’s death. A new player cannot die on the first night or day.',
    setupHint: '[Protects a player new to the game]',
  },
  buddhist: {
    name: 'Buddhist',
    type: 'fabled',
    alignment: 'good',
    ability: 'For the first two minutes of each day, veteran players may not talk.',
  },
  hells_librarian: {
    name: "Hell's Librarian",
    type: 'fabled',
    alignment: 'good',
    ability: 'Something bad might happen to whoever talks when the Storyteller has asked for silence.',
  },
  revolutionary: {
    name: 'Revolutionary',
    type: 'fabled',
    alignment: 'good',
    ability: 'Two neighbouring players are known to be on the same team. Once per game, one of them registers falsely.',
    setupHint: '[Two neighbours are publicly the same team]',
  },
  fiddler: {
    name: 'Fiddler',
    type: 'fabled',
    alignment: 'good',
    ability: 'Once per game, the Demon secretly picks an opposing player: everyone votes on which of the two wins, and that team wins.',
  },
  toymaker: {
    name: 'Toymaker',
    type: 'fabled',
    alignment: 'good',
    ability: 'The Demon may choose not to kill, and learns three not-in-play good characters. On the final night the Demon must kill.',
  },
  fibbin: {
    name: 'Fibbin',
    type: 'fabled',
    alignment: 'good',
    ability: 'Once per game, one good player may be given false information.',
  },
  duchess: {
    name: 'Duchess',
    type: 'fabled',
    alignment: 'good',
    ability: 'Each day, after the first, three players may choose to visit you. At night they learn how many visitors were evil, and one of them learns a lie.',
  },
  sentinel: {
    name: 'Sentinel',
    type: 'fabled',
    alignment: 'good',
    ability: 'There might be one extra Outsider, or one fewer.',
    setupHint: '[±1 Outsider, your choice]',
  },
  spirit_of_ivory: {
    name: 'Spirit of Ivory',
    type: 'fabled',
    alignment: 'good',
    ability: 'There cannot be more than one extra evil player.',
  },
  djinn: {
    name: 'Djinn',
    type: 'fabled',
    alignment: 'good',
    ability: 'Use the special rule printed for this script’s jinxed character pair.',
  },
};
