// Bad Moon Rising — 25 characters. Deaths happen every night and protection is the whole game.
//
// Ability texts are original short paraphrases (same convention as tb.ts), written for the player
// HUD: second person, present tense, one or two sentences.
import type { CharacterInfo } from './types.js';

export const BMR_CHARACTER_IDS = [
  // Townsfolk
  'grandmother',
  'sailor',
  'chambermaid',
  'exorcist',
  'innkeeper',
  'gambler',
  'gossip',
  'courtier',
  'professor',
  'minstrel',
  'tea_lady',
  'pacifist',
  'fool',
  // Outsiders
  'tinker',
  'moonchild',
  'goon',
  'lunatic',
  // Minions
  'godfather',
  'devils_advocate',
  'assassin',
  'mastermind',
  // Demons
  'zombuul',
  'pukka',
  'shabaloth',
  'po',
] as const;

export type BmrCharacterId = (typeof BMR_CHARACTER_IDS)[number];

export const BMR_CHARACTER_INFO: Record<BmrCharacterId, CharacterInfo> = {
  // ------------------------------------------------------------------------------- Townsfolk
  grandmother: {
    name: 'Grandmother',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'First night: you learn one good player and their character. If the Demon kills them, you die too.',
  },
  sailor: {
    name: 'Sailor',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night pick a living player: either you or they are drunk until dusk tomorrow. You cannot die.',
  },
  chambermaid: {
    name: 'Chambermaid',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night pick two other living players: you learn how many of them woke tonight for their own ability.',
  },
  exorcist: {
    name: 'Exorcist',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night after the first pick a player, different from last night: if they are the Demon, they learn who you are and do not wake tonight.',
  },
  innkeeper: {
    name: 'Innkeeper',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night after the first pick two players: tonight they cannot die, but one of them is drunk.',
  },
  gambler: {
    name: 'Gambler',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each night after the first pick a player and guess their character: if you are wrong, you die.',
  },
  gossip: {
    name: 'Gossip',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Each day you may make one public statement. Tonight, if it was true, a player dies.',
  },
  courtier: {
    name: 'Courtier',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Once per game, at night, name a character: if that character is in play, they are drunk for three nights and three days.',
  },
  professor: {
    name: 'Professor',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Once per game, at night after the first, pick a dead player: if they are a Townsfolk, they come back to life.',
  },
  minstrel: {
    name: 'Minstrel',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'When a Minion dies by execution, everyone except you is drunk until dusk tomorrow.',
  },
  tea_lady: {
    name: 'Tea Lady',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'If both of your living neighbours are good, they cannot die.',
  },
  pacifist: {
    name: 'Pacifist',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'Executed good players might not die.',
  },
  fool: {
    name: 'Fool',
    type: 'townsfolk',
    alignment: 'good',
    ability: 'The first time you would die, you survive instead.',
  },
  // -------------------------------------------------------------------------------- Outsiders
  tinker: {
    name: 'Tinker',
    type: 'outsider',
    alignment: 'good',
    ability: 'You might die at any time.',
  },
  moonchild: {
    name: 'Moonchild',
    type: 'outsider',
    alignment: 'good',
    ability: 'When you learn that you died, pick a living player publicly: if they are good, they die tonight.',
  },
  goon: {
    name: 'Goon',
    type: 'outsider',
    alignment: 'good',
    ability: 'The first player to pick you with their ability each night becomes drunk until dusk, and you turn to their alignment.',
  },
  lunatic: {
    name: 'Lunatic',
    type: 'outsider',
    alignment: 'good',
    ability: 'You believe you are the Demon, but your ability does nothing. The real Demon knows who you are and who you chose.',
    setupHint: '[Believes they are the Demon]',
  },
  // ---------------------------------------------------------------------------------- Minions
  godfather: {
    name: 'Godfather',
    type: 'minion',
    alignment: 'evil',
    ability: 'First night: you learn which Outsiders are in play. If an Outsider dies by day, pick a player tonight: they die. Setup gains or loses one Outsider.',
    setupHint: '[+1 or −1 Outsider]',
  },
  devils_advocate: {
    name: "Devil's Advocate",
    type: 'minion',
    alignment: 'evil',
    ability: 'Each night pick a living player, different from last night: if they are executed tomorrow, they survive.',
  },
  assassin: {
    name: 'Assassin',
    type: 'minion',
    alignment: 'evil',
    ability: 'Once per game, at night after the first, pick a player: they die, even if nothing else could kill them.',
  },
  mastermind: {
    name: 'Mastermind',
    type: 'minion',
    alignment: 'evil',
    ability: 'If the Demon dies by execution, play continues for one more day. If a player is executed that day, their team loses.',
  },
  // ------------------------------------------------------------------------------------ Demons
  zombuul: {
    name: 'Zombuul',
    type: 'demon',
    alignment: 'evil',
    ability: 'Each night, if nobody died by day, pick a player: they die. You are only truly dead the second time you die, and you register as dead meanwhile.',
  },
  pukka: {
    name: 'Pukka',
    type: 'demon',
    alignment: 'evil',
    ability: 'Each night pick a player: they are poisoned. The player you poisoned the previous night dies, and then becomes healthy.',
  },
  shabaloth: {
    name: 'Shabaloth',
    type: 'demon',
    alignment: 'evil',
    ability: 'Each night after the first pick two players: they die. One player who died this way the previous night might come back to life.',
  },
  po: {
    name: 'Po',
    type: 'demon',
    alignment: 'evil',
    ability: 'Each night after the first you may pick a player: they die. If you chose nobody last night, pick three players instead.',
  },
};
