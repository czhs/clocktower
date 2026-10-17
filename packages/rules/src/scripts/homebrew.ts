// Homebrew character definitions.
//
// These two exist as worked examples at the two ends of the spectrum: a PUBLIC DAY ABILITY
// (Wizard) and a DEATH TRIGGER (Plague Doctor). Both are deliberately open-ended abilities that
// must NOT mutate the game on their own — they mark themselves used and tell the Storyteller what
// they now owe the table. Copy whichever shape fits your character; docs/homebrew.md has templates
// for the other common shapes (info role, night choice, protection, setup modifier).
import type { ScriptRoleDefs } from '../rolekit.js';
import { addReminder, alert, log, who } from '../util.js';

const ONCE_USED = 'Ability used';

export const HOMEBREW_ROLES: ScriptRoleDefs = {
  /**
   * Wizard — once per game, in public, ask the Storyteller for anything.
   *
   * There is nothing to compute: the ability is a conversation. So the hook spends the one-shot,
   * records it where the Storyteller can see it, and says plainly that the ruling is theirs. It
   * reaches the player through the same public path as the Slayer's shot, so the whole table sees
   * the claim being made — which is the point of the character.
   */
  wizard: {
    firstNight: null,
    otherNight: null,
    reminders: [ONCE_USED, 'Wish granted', 'Paid the price'],
    nightNote:
      'The Wizard may publicly ask you for anything, once per game. You decide whether it happens and what it costs. Nothing is automatic.',
    dayAbility: {
      label: 'Make a wish',
      resolve: (s, op, p) => {
        if (p.reminders.includes(ONCE_USED)) return 'Nothing happens.';
        addReminder(p, ONCE_USED);
        log(s, op, `Wizard ${who(p)} made their wish`);
        alert(
          s,
          op,
          `Wizard ${who(p)} has made their one wish. Rule on it yourself: grant it, refuse it, or grant it with a price. Mark "Wish granted" / "Paid the price" as you go.`,
        );
        return `${p.name} makes a wish, and the Storyteller considers it…`;
      },
    },
  },

  /**
   * Plague Doctor — when they die, the Storyteller gains a Minion ability.
   *
   * A death trigger. The engine cannot pick which Minion ability the Storyteller should have, and
   * should not: the hook raises an alert and leaves a token. The Storyteller then plays that
   * ability themselves (there is no seat to assign it to).
   */
  plague_doctor: {
    firstNight: null,
    otherNight: null,
    reminders: ['Storyteller has a Minion ability'],
    setupNote: 'When the Plague Doctor dies, you gain a Minion ability of your choice for the rest of the game.',
    onDeath: (s, op, p) => {
      addReminder(p, 'Storyteller has a Minion ability');
      log(s, op, `Plague Doctor ${who(p)} died: the Storyteller gains a Minion ability`);
      alert(
        s,
        op,
        `Plague Doctor ${who(p)} has died: choose a Minion ability that is not in play and use it yourself for the rest of the game.`,
      );
    },
  },
};
