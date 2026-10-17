// Sects & Violets — 25 characters. Dreams, madness and misinformation: almost nothing a player
// is told on this script is reliable.
//
// Ability texts are original short paraphrases (same convention as tb.ts), written for the player
// HUD: second person, present tense, one or two sentences.
import type { CharacterInfo } from './types.js';

export const SNV_CHARACTER_IDS = [
  // Townsfolk
  'clockmaker',
  'dreamer',
  'snake_charmer',
  'mathematician',
  'flowergirl',
  'town_crier',
  'oracle',
  'savant',
  'seamstress',
  'philosopher',
  'artist',
  'juggler',
  'sage',
  // Outsiders
  'mutant',
  'sweetheart',
  'barber',
  'klutz',
  // Minions
  'evil_twin',
  'witch',
  'cerenovus',
  'pit_hag',
  // Demons
  'fang_gu',
  'vigormortis',
  'no_dashii',
  'vortox',
] as const;

export type SnvCharacterId = (typeof SNV_CHARACTER_IDS)[number];

export const SNV_CHARACTER_INFO: Record<SnvCharacterId, CharacterInfo> = {
  // ------------------------------------------------------------------------------- Townsfolk
  clockmaker: {
    name: 'Clockmaker',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'First night: you learn how many steps it is from the Demon to its nearest Minion.',
  },
  dreamer: {
    name: 'Dreamer',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night pick a player other than yourself: you learn one good and one evil character, one of which is theirs.',
  },
  snake_charmer: {
    name: 'Snake Charmer',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night pick a living player: if you pick the Demon, you swap characters with them and they become poisoned.',
  },
  mathematician: {
    name: 'Mathematician',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night: you learn how many players’ abilities worked abnormally tonight because of another character.',
  },
  flowergirl: {
    name: 'Flowergirl',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night after the first: you learn whether the Demon voted today.',
  },
  town_crier: {
    name: 'Town Crier',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night after the first: you learn whether a Minion nominated today.',
  },
  oracle: {
    name: 'Oracle',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night after the first: you learn how many dead players are evil.',
  },
  savant: {
    name: 'Savant',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each day you may visit the Storyteller privately for two statements: one is true and one is false.',
  },
  seamstress: {
    name: 'Seamstress',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Once per game, at night, pick two other players: you learn whether they are the same alignment.',
  },
  philosopher: {
    name: 'Philosopher',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Once per game, at night, name a good character: you gain that ability. If that character is in play, they become drunk.',
  },
  artist: {
    name: 'Artist',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Once per game, during the day, privately ask the Storyteller any yes/no question.',
  },
  juggler: {
    name: 'Juggler',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'On your first day you may publicly guess up to five players’ characters. Tonight you learn how many you got right.',
  },
  sage: {
    name: 'Sage',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'If the Demon kills you, you learn two players, one of which is the Demon.',
  },
  // -------------------------------------------------------------------------------- Outsiders
  mutant: {
    name: 'Mutant',
    type: 'outsider',
    alignment: 'good',
    ability: 'You are mad about being an Outsider. If you break that madness, you may be executed.',
  },
  sweetheart: {
    name: 'Sweetheart',
    type: 'outsider',
    alignment: 'good',
    ability: 'When you die, one player is drunk from then on.',
  },
  barber: {
    name: 'Barber',
    type: 'outsider',
    alignment: 'good',
    ability: 'If you died today or tonight, the Demon may pick two players tonight and swap their characters.',
  },
  klutz: {
    name: 'Klutz',
    type: 'outsider',
    alignment: 'good',
    ability: 'When you learn that you died, pick a living player publicly: if they are evil, your team loses.',
  },
  // ---------------------------------------------------------------------------------- Minions
  evil_twin: {
    name: 'Evil Twin',
    type: 'minion',
    alignment: 'evil',
    ability: 'You and an opposing player know each other. If the good twin is executed, evil wins. Good cannot win while you live.',
    setupHint: '[Paired with a good twin of the opposite alignment]',
  },
  witch: {
    name: 'Witch',
    type: 'minion',
    alignment: 'evil',
    ability: 'Each night pick a player: if they nominate tomorrow, they die. You lose this ability when only three players live.',
  },
  cerenovus: {
    name: 'Cerenovus',
    type: 'minion',
    alignment: 'evil',
    ability: 'Each night pick a player and a good character: they are mad about being that character tomorrow, or may be executed.',
  },
  pit_hag: {
    name: 'Pit-Hag',
    type: 'minion',
    alignment: 'evil',
    ability: 'Each night pick a player and a character: they become that character, unless it is already in play. A new Demon kills that night.',
  },
  // ------------------------------------------------------------------------------------ Demons
  fang_gu: {
    name: 'Fang Gu',
    type: 'demon',
    alignment: 'evil',
    ability: 'Each night after the first pick a player: they die. The first Outsider you pick this way becomes the Fang Gu and you die instead. Setup gains an extra Outsider.',
    setupHint: '[+1 Outsider]',
  },
  vigormortis: {
    name: 'Vigormortis',
    type: 'demon',
    alignment: 'evil',
    ability: 'Each night after the first pick a player: they die. Minions you kill keep their abilities, and one of their Townsfolk neighbours is poisoned. Setup loses an Outsider.',
    setupHint: '[−1 Outsider]',
  },
  no_dashii: {
    name: 'No Dashii',
    type: 'demon',
    alignment: 'evil',
    ability: 'Each night after the first pick a player: they die. Your two closest living Townsfolk neighbours are poisoned.',
  },
  vortox: {
    name: 'Vortox',
    type: 'demon',
    alignment: 'evil',
    ability: 'Each night after the first pick a player: they die. All Townsfolk learn false information. If nobody is executed today, evil wins.',
  },
};
