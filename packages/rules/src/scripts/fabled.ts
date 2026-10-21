// Fabled definitions — pure data.
//
// A Fabled has no seat and no player, so it must never have a night step: there is nobody to wake.
// What it CAN carry is setup guidance, a setup modifier, reminder tokens and night-order notes for
// the Storyteller's panel. `packages/rules/test/travellers.test.ts` asserts the no-wake invariant.
import type { ScriptRoleDefs } from '../rolekit.js';

export const FABLED_ROLES: ScriptRoleDefs = {
  doomsayer: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'With four or more alive, each living player may publicly call for a death once per day; you then kill a player of that alignment.',
  },

  angel: {
    firstNight: null,
    otherNight: null,
    setupNote: 'Mark the player who is new to the game. They cannot die on the first night or day.',
    nightNote: 'Something bad may happen to whoever is most responsible for the new player’s death.',
    reminders: ['Something bad happens', 'Protected (new player)'],
  },

  buddhist: {
    firstNight: null,
    otherNight: null,
    nightNote: 'For the first two minutes of each day, players with more than one year of experience may not talk.',
  },

  hells_librarian: {
    firstNight: null,
    otherNight: null,
    nightNote: 'Something bad may happen to whoever talks while you have asked for silence.',
    reminders: ['Something bad happens'],
  },

  revolutionary: {
    firstNight: null,
    otherNight: null,
    setupNote: 'Pick two neighbouring players who are publicly known to be on the same team.',
    nightNote: 'Once per game, one of those two registers falsely.',
    reminders: ['Same team', 'Used'],
  },

  fiddler: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'Once per game, the Demon secretly picks an opposing player; everyone votes on which of the two wins, and that team wins the game.',
    reminders: ['Used'],
  },

  toymaker: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'The Demon may choose not to kill, and learns three good characters that are not in play. On the final night the Demon must kill.',
    reminders: ['Final night'],
  },

  fibbin: {
    firstNight: null,
    otherNight: null,
    nightNote: 'Once per game you may give one good player false information.',
    reminders: ['Used'],
  },

  duchess: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'Each day after the first, three players may visit the Duchess. At night each visitor learns how many visitors were evil, and one visitor is told a lie.',
    reminders: ['Visitor', 'Is told a lie'],
  },

  sentinel: {
    firstNight: null,
    otherNight: null,
    setupNote: 'You may add one extra Outsider or remove one. Decide before dealing.',
    // The direction is the Storyteller's choice, so the modifier leans toward the extra Outsider
    // and the setup sheet tells them to flip it if they prefer the other way.
    setupModifier: (c) => ({ ...c, townsfolk: c.townsfolk - 1, outsiders: c.outsiders + 1 }),
  },

  spirit_of_ivory: {
    firstNight: null,
    otherNight: null,
    setupNote: 'There cannot be more than one extra evil player beyond the standard distribution.',
  },

  djinn: {
    firstNight: null,
    otherNight: null,
    nightNote: 'Apply this script’s special jinx rule for the pair of characters it was added for.',
  },
};
