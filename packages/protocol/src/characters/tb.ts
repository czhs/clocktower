// Trouble Brewing (the original 22). Moved verbatim out of game.ts by the multi-script work;
// the texts are unchanged so existing games/records keep their wording.
import type { CharacterInfo } from './types.js';

export const TB_CHARACTER_IDS = [
  // Townsfolk
  'washerwoman',
  'librarian',
  'investigator',
  'chef',
  'empath',
  'fortune_teller',
  'undertaker',
  'monk',
  'ravenkeeper',
  'virgin',
  'slayer',
  'soldier',
  'mayor',
  // Outsiders
  'butler',
  'drunk',
  'recluse',
  'saint',
  // Minions
  'poisoner',
  'spy',
  'scarlet_woman',
  'baron',
  // Demon
  'imp',
] as const;

export type TbCharacterId = (typeof TB_CHARACTER_IDS)[number];

export const TB_CHARACTER_INFO: Record<TbCharacterId, CharacterInfo> = {
  washerwoman: { name: 'Washerwoman', type: 'townsfolk', alignment: 'good', ability: 'First night: you learn that one of two players is a particular Townsfolk.' },
  librarian: { name: 'Librarian', type: 'townsfolk', alignment: 'good', ability: 'First night: you learn that one of two players is a particular Outsider (or that there are none).' },
  investigator: { name: 'Investigator', type: 'townsfolk', alignment: 'good', ability: 'First night: you learn that one of two players is a particular Minion.' },
  chef: { name: 'Chef', type: 'townsfolk', alignment: 'good', ability: 'First night: you learn how many pairs of evil players are sitting side by side.' },
  empath: { name: 'Empath', type: 'townsfolk', alignment: 'good', ability: 'Every night: you learn how many of your two closest living neighbours are evil.' },
  fortune_teller: { name: 'Fortune Teller', type: 'townsfolk', alignment: 'good', ability: 'Every night: pick two players and learn whether either is the Demon. One good player wrongly reads as a Demon to you.' },
  undertaker: { name: 'Undertaker', type: 'townsfolk', alignment: 'good', ability: 'Each night after the first: you learn which character was executed that day.' },
  monk: { name: 'Monk', type: 'townsfolk', alignment: 'good', ability: 'Each night after the first: pick another player. The Demon cannot kill them tonight.' },
  ravenkeeper: { name: 'Ravenkeeper', type: 'townsfolk', alignment: 'good', ability: 'If the Demon kills you at night, you wake up and learn the character of one player you pick.' },
  virgin: { name: 'Virgin', type: 'townsfolk', alignment: 'good', ability: 'The first time someone nominates you, if they are a Townsfolk they are executed on the spot.' },
  slayer: { name: 'Slayer', type: 'townsfolk', alignment: 'good', ability: 'Once per game, in daylight, publicly pick a player. If they are the Demon, they die.' },
  soldier: { name: 'Soldier', type: 'townsfolk', alignment: 'good', ability: 'The Demon cannot kill you.' },
  mayor: { name: 'Mayor', type: 'townsfolk', alignment: 'good', ability: 'If three players are alive and nobody is executed today, your team wins. If you would die at night, another player might die in your place.' },
  butler: { name: 'Butler', type: 'outsider', alignment: 'good', ability: 'Each night pick another player as your master. Tomorrow you may only vote if your master votes too.' },
  drunk: { name: 'Drunk', type: 'outsider', alignment: 'good', ability: 'You believe you are a Townsfolk, but your ability never works. You are not told you are the Drunk.', setupHint: '[Believes they are a Townsfolk that is not in play]' },
  recluse: { name: 'Recluse', type: 'outsider', alignment: 'good', ability: 'You may register as evil, or as a Minion or Demon, even after death.' },
  saint: { name: 'Saint', type: 'outsider', alignment: 'good', ability: 'If you are executed, your team loses.' },
  poisoner: { name: 'Poisoner', type: 'minion', alignment: 'evil', ability: 'Every night pick a player. Their ability fails tonight and through tomorrow.' },
  spy: { name: 'Spy', type: 'minion', alignment: 'evil', ability: 'Every night you look at the Grimoire. You may register as good, or as a Townsfolk or Outsider, even after death.' },
  scarlet_woman: { name: 'Scarlet Woman', type: 'minion', alignment: 'evil', ability: 'If five or more players are alive when the Demon dies, you become the Demon.' },
  baron: { name: 'Baron', type: 'minion', alignment: 'evil', ability: 'Setup gains two extra Outsiders.', setupHint: '[+2 Outsiders]' },
  imp: { name: 'Imp', type: 'demon', alignment: 'evil', ability: 'Each night after the first pick a player: they die. If you pick yourself, a Minion becomes the Imp.' },
};
