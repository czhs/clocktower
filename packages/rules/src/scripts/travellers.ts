// Traveller definitions.
//
// Travellers are a different kind of character and the engine treats them differently:
//
//  * they are never dealt by `randomAssignment` and do not count toward the setup distribution;
//  * they are never EXECUTED, they are EXILED — a separate vote that everyone (including the dead)
//    may join without spending a ghost vote. See ../exile.ts;
//  * their alignment is chosen per game by the Storyteller, so nothing here may assume it.
//
// Most Traveller abilities change the rules of the DAY (who may nominate, how votes count, who may
// speak), which this engine deliberately does not police — the Storyteller runs the table. Those
// are implemented as `nightNote` guidance plus reminder tokens. The ones with a concrete nightly
// or death-time effect get real hooks.
import { killPlayer } from '../deaths.js';
import { choose, chosen, target, type ScriptRoleDefs } from '../rolekit.js';
import { addReminder, alert, charName, impaired, log, removeReminder, who } from '../util.js';

const ONCE_USED = 'Ability used';

export const TRAVELLERS_ROLES: ScriptRoleDefs = {
  // ------------------------------------------------------------------------- Trouble Brewing

  scapegoat: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'If a player of the Scapegoat’s alignment is executed, you MAY execute the Scapegoat instead. Your call.',
  },

  gunslinger: {
    firstNight: null,
    otherNight: null,
    // A public day ability, resolved through the same path as the Slayer's shot.
    dayAbility: {
      label: 'Gunslinger shot',
      resolve: (s, op, shooter, t) => {
        if (shooter.reminders.includes(ONCE_USED)) return 'Nothing happens.';
        if (impaired(shooter)) {
          log(s, op, `Gunslinger ${who(shooter)} is drunk/poisoned: shot wasted`);
          return 'Nothing happens.';
        }
        // The real rule is "a player who voted"; the Storyteller confirms that before allowing it.
        killPlayer(s, op, t, 'slayer');
        log(s, op, `Gunslinger ${who(shooter)} shoots ${who(t)}`);
        return `${t.name} has been shot and is dead.`;
      },
    },
    nightNote: 'The Gunslinger may only shoot a player who voted on the first tallied nomination of the day.',
  },

  beggar: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'The Beggar may only vote with a token handed to them, and learns that player’s alignment. Hand out the information yourself.',
    reminders: ['Was given a vote'],
  },

  bureaucrat: {
    firstNight: 55,
    otherNight: 55,
    prompt: () => choose('Choose a player', 1, false, false, 'Tomorrow their vote counts three times.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      return {
        text: t ? `${who(t)}'s vote counts three times tomorrow.` : 'Waiting for the Bureaucrat to choose a player.',
        notes: impaired(p) ? [`Bureaucrat ${who(p)} is drunk/poisoned: no effect.`] : ['Apply it with set_vote / set_block when the vote is tallied.'],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      for (const q of s.players) removeReminder(q, 'Vote counts x3');
      if (impaired(p)) return `Bureaucrat ${who(p)} is drunk/poisoned: no effect.`;
      addReminder(t, 'Vote counts x3');
      log(s, op, `Bureaucrat triples ${who(t)}'s vote`);
      return `${who(t)}'s vote counts three times tomorrow.`;
    },
    reminders: ['Vote counts x3'],
  },

  thief: {
    firstNight: 55,
    otherNight: 55,
    prompt: () => choose('Choose a player', 1, false, false, 'Tomorrow their vote counts negatively.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      return {
        text: t ? `${who(t)}'s vote counts as −1 tomorrow.` : 'Waiting for the Thief to choose a player.',
        notes: impaired(p) ? [`Thief ${who(p)} is drunk/poisoned: no effect.`] : ['Apply it with set_block when the vote is tallied.'],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      for (const q of s.players) removeReminder(q, 'Vote counts -1');
      if (impaired(p)) return `Thief ${who(p)} is drunk/poisoned: no effect.`;
      addReminder(t, 'Vote counts -1');
      log(s, op, `Thief negates ${who(t)}'s vote`);
      return `${who(t)}'s vote counts negatively tomorrow.`;
    },
    reminders: ['Vote counts -1'],
  },

  // ------------------------------------------------------------------------ Bad Moon Rising

  apprentice: {
    firstNight: 17,
    otherNight: null,
    suggest: (_s, p) => ({
      text: `Give the Apprentice an ability: a Townsfolk one if they are good, a Minion one if they are evil (they are currently ${p.alignment}).`,
      notes: ['Use change_character on the Apprentice if you want the engine to run the borrowed ability.'],
    }),
    resolve: (s, op, p) => {
      addReminder(p, 'Has an ability');
      log(s, op, `Apprentice ${who(p)} was given an ability`);
      return 'Apprentice has been given an ability (set it with change_character if you want it automated).';
    },
    reminders: ['Has an ability'],
  },

  matron: {
    firstNight: null,
    otherNight: null,
    nightNote: 'No private conversations, and no groups larger than three. Enforce it at the table.',
  },

  judge: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'Once per game, after a vote is tallied, the Judge may force the execution to happen or not. Use force_execute / execute(null).',
    reminders: [ONCE_USED],
  },

  bishop: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'Only you may nominate, and at least one opposing player must be nominated each day. Use create_nomination.',
  },

  voudon: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'Only the Voudon and the dead may vote, dead votes need no token, and a tie is enough to execute. Run the vote yourself.',
  },

  // ----------------------------------------------------------------------- Sects & Violets

  barista: {
    firstNight: 18,
    otherNight: 18,
    prompt: () => choose('Choose a player', 1, false, false, 'Until dusk they are either sober and healthy, or their ability works twice.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      return {
        text: t
          ? `${who(t)} is either made sober and healthy, or has their ability work twice — you choose, and they are told which.`
          : 'Waiting for the Barista to choose a player.',
        notes: impaired(p) ? [`Barista ${who(p)} is drunk/poisoned: no effect.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      for (const q of s.players) {
        removeReminder(q, 'Barista: sober & healthy');
        removeReminder(q, 'Barista: ability twice');
      }
      if (impaired(p)) return `Barista ${who(p)} is drunk/poisoned: no effect.`;
      addReminder(t, 'Barista: sober & healthy');
      log(s, op, `Barista affects ${who(t)}`);
      return `${who(t)} is sober and healthy until dusk (swap to "ability twice" with the reminders if you prefer).`;
    },
    reminders: ['Barista: sober & healthy', 'Barista: ability twice'],
  },

  harlot: {
    firstNight: null,
    otherNight: 52,
    prompt: () => choose('Choose a living player', 1, false, false, 'If they agree, you learn their character — but you might both die.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Harlot to choose a player.' };
      const text = `${t.name} is the ${charName(t.character)}.`;
      return {
        text: `Harlot on ${who(t)}: the ${charName(t.character)} — only if that player agrees`,
        info: { text, seats: [t.seat], characters: [t.character] },
        notes: ['Ask the chosen player whether they agree. You may then kill either or both of them.'],
      };
    },
    infoOnly: true,
  },

  butcher: {
    firstNight: null,
    otherNight: null,
    nightNote: 'After the first execution each day, a second nomination may be made.',
  },

  bone_collector: {
    firstNight: null,
    otherNight: 28,
    wakes: (s, p) => !p.reminders.includes(ONCE_USED) && s.players.some((q) => !q.alive),
    prompt: () => choose('Choose a dead player', 1, false, true, 'Once per game. They regain their ability until dusk.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      return { text: t ? `${who(t)} regains their ability until dusk.` : 'Waiting for the Bone Collector (once per game).' };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      addReminder(p, ONCE_USED);
      if (impaired(p)) return `Bone Collector ${who(p)} is drunk/poisoned: ability spent with no effect.`;
      addReminder(t, 'Has ability (Bone Collector)');
      log(s, op, `Bone Collector restores ${who(t)}'s ability`);
      alert(s, op, `${who(t)} has their ability back until dusk: add their night step if they should wake.`);
      return `${who(t)} regains their ability until dusk.`;
    },
    reminders: [ONCE_USED, 'Has ability (Bone Collector)'],
  },

  deviant: {
    firstNight: null,
    otherNight: null,
    nightNote: 'If you judge that the Deviant was funny today, they cannot be exiled.',
    reminders: ['Was funny'],
  },
};
