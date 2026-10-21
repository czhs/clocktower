// Bad Moon Rising — 25 character definitions.
//
// The script's theme is that people die every night, so most of the work here is protection,
// drunkenness and death triggers. Three conventions matter:
//
// DRUNKENNESS. `PlayerState` has a single `drunkOverride` boolean, which is not enough for a
// script with five independent sources of drunkenness. Each source adds a reminder token of the
// form `Drunk (<source>)` and `syncDrunk` recomputes `drunkOverride` from those tokens. The
// Storyteller sees exactly which sources are active in the Grimoire, which is where they want it.
//
// DURABLE STATE. Everything else that must survive a phase change also lives in `reminders`
// (`Charged`, `Died once`, `Ability used`, ...). Nothing here adds fields to `PlayerState`.
//
// STORYTELLER JUDGEMENT. Several abilities on this script are deliberately "might" abilities
// (Tinker, Pacifist, Shabaloth's regurgitation, Mastermind, Goon). Those are implemented as night
// order + prompt + reminders + advisory text and never mutate the game on their own — the engine
// advises and never gates (docs/vision.md, principle 2).
import { killPlayer, killPrevention } from '../deaths.js';
import {
  choose,
  chooseCharacter,
  chooseRange,
  chosen,
  target,
  targets,
  yesNo,
  type ScriptHooks,
  type ScriptRoleDefs,
} from '../rolekit.js';
import { RuleError, type GameState, type PlayerState } from '../types.js';
import {
  addReminder,
  alert,
  charName,
  impaired,
  livingNeighbours,
  log,
  pick,
  playerAt,
  removeReminder,
  typeOf,
  who,
} from '../util.js';

// ------------------------------------------------------------------------------ drunkenness kit

/** Any reminder of this shape makes the player drunk. */
const DRUNK_PREFIX = 'Drunk (';

const drunkToken = (source: string) => `${DRUNK_PREFIX}${source})`;

function syncDrunk(p: PlayerState): void {
  // The real Drunk is always drunk regardless of tokens; `isDrunk` checks the character too.
  p.drunkOverride = p.reminders.some((r) => r.startsWith(DRUNK_PREFIX));
}

function makeDrunk(p: PlayerState, source: string): void {
  addReminder(p, drunkToken(source));
  syncDrunk(p);
}

/** Remove one source of drunkenness from everyone (a nightly effect expiring). */
function clearDrunkEverywhere(s: GameState, source: string): void {
  for (const q of s.players) {
    removeReminder(q, drunkToken(source));
    syncDrunk(q);
  }
}

// ------------------------------------------------------------------------------ shared helpers

const ONCE_USED = 'Ability used';

const onceUsed = (p: PlayerState) => p.reminders.includes(ONCE_USED);

function spendOnce(p: PlayerState): void {
  addReminder(p, ONCE_USED);
}

/** Did this seat wake for its OWN ability tonight (Chambermaid)? */
function wokeTonight(s: GameState, seat: number): boolean {
  return s.nightQueue.some(
    (st) => st.seat === seat && st.kind !== 'dusk' && st.kind !== 'dawn' && st.status !== 'skipped',
  );
}

/** Characters currently in play, de-duplicated (for "name a character" prompts). */
const charactersInPlay = (s: GameState) => [...new Set(s.players.map((q) => q.character))];

export const BMR_ROLES: ScriptRoleDefs = {
  // ------------------------------------------------------------------------------- Townsfolk

  grandmother: {
    firstNight: 43,
    otherNight: null,
    // The grandchild is chosen once, on the first night, and kept in `step.fixed`.
    prepare: (s, p, rng) => {
      const good = s.players.filter((q) => q !== p && q.alignment === 'good');
      if (!good.length) return { seats: [], character: null };
      const g = pick(rng, good);
      return { seats: [g.seat], character: g.character };
    },
    suggest: (s, _p, step) => {
      const seat = step.fixed?.seats?.[0];
      const g = seat === undefined ? undefined : playerAt(s, seat);
      if (!g || !step.fixed?.character) {
        const none = 'There is no other good player.';
        return { text: none, info: { text: none } };
      }
      const text = `${g.name} is the ${charName(step.fixed.character)}.`;
      return {
        text: `Grandchild: ${who(g)} is the ${charName(step.fixed.character)}`,
        info: { text, seats: [g.seat], characters: [step.fixed.character] },
        notes: ['Mark the grandchild. If the Demon kills them, the Grandmother dies too.'],
      };
    },
    infoOnly: true,
    reminders: ['Grandchild'],
    nightNote: 'When the grandchild is killed by the Demon, the Grandmother dies as well.',
  },

  sailor: {
    firstNight: 12,
    otherNight: 12,
    prompt: () => choose('Choose a player to drink with', 1, false, false, 'One of you is drunk until dusk tomorrow.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Sailor to choose a drinking partner.' };
      return {
        text: `${who(t)} drinks with the Sailor: you choose which of the two is drunk until dusk tomorrow.`,
        notes: [
          `Resolve with seats [${t.seat}] to make ${t.name} drunk, or [${p.seat}] to make the Sailor drunk.`,
          'A sober Sailor cannot die.',
        ],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      clearDrunkEverywhere(s, 'Sailor');
      if (impaired(p)) return `Sailor ${who(p)} is drunk/poisoned: nobody becomes drunk.`;
      makeDrunk(t, 'Sailor');
      log(s, op, `Sailor makes ${who(t)} drunk`);
      return `${who(t)} is drunk until dusk tomorrow.`;
    },
    preventsKill: (_s, p) => (impaired(p) ? null : { reason: `${who(p)} is the Sailor and cannot die.` }),
    reminders: [drunkToken('Sailor')],
  },

  chambermaid: {
    firstNight: 44,
    otherNight: 44,
    prompt: () =>
      choose('Choose two other players', 2, false, false, 'Learn how many of them woke tonight for their ability.'),
    suggest: (s, _p, step) => {
      const picks = chosen(s, step);
      if (picks.length < 2) return { text: 'Waiting for the Chambermaid to choose two players.' };
      const n = picks.filter((q) => wokeTonight(s, q.seat)).length;
      const text = `${n} of them woke tonight.`;
      return {
        text: `Chambermaid number: ${n} (${picks
          .map((q) => `${q.name}: ${wokeTonight(s, q.seat) ? 'woke' : 'slept'}`)
          .join(', ')})`,
        info: { text, number: n, seats: picks.map((q) => q.seat) },
        notes: ['Counts waking for their OWN ability, not being woken to be told something.'],
      };
    },
    infoOnly: true,
  },

  exorcist: {
    firstNight: null,
    otherNight: 24,
    prompt: () =>
      choose('Choose a player to exorcise', 1, false, false, 'Different from last night. A chosen Demon does not wake tonight.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Exorcist to choose a player.' };
      const isDemon = typeOf(t.character) === 'demon';
      return {
        text: isDemon
          ? `${who(t)} IS the Demon: they learn the Exorcist's identity and do not act tonight.`
          : `${who(t)} is not the Demon: nothing happens.`,
        notes: isDemon ? ["Show the Demon who the Exorcist is, and skip the Demon's step."] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (t.reminders.includes('Exorcised last night'))
        throw new RuleError('invalid', 'The Exorcist must choose a different player from last night');
      for (const q of s.players) removeReminder(q, 'Exorcised last night');
      addReminder(t, 'Exorcised last night');
      if (impaired(p)) return `Exorcist ${who(p)} is drunk/poisoned: no effect.`;
      if (typeOf(t.character) !== 'demon') return `${who(t)} is not the Demon: nothing happens.`;
      for (const st of s.nightQueue) {
        if (st.seat === t.seat && st.status !== 'resolved' && st.status !== 'skipped') st.status = 'skipped';
      }
      log(s, op, `Exorcist blocks the Demon ${who(t)}`);
      alert(s, op, `Demon ${who(t)} was exorcised: they do not act tonight and learn who the Exorcist is.`);
      return `${who(t)} is the Demon and does not act tonight.`;
    },
    reminders: ['Exorcised last night'],
  },

  innkeeper: {
    firstNight: null,
    otherNight: 26,
    prompt: () => choose('Choose two players', 2, false, false, 'They cannot die tonight, but one of them is drunk.'),
    suggest: (s, _p, step) => {
      const picks = chosen(s, step);
      if (picks.length < 2) return { text: 'Waiting for the Innkeeper to choose two players.' };
      return {
        text: `${picks.map(who).join(' and ')} are safe tonight; one of them is drunk until dusk tomorrow.`,
        notes: [`Resolve with both seats, the DRUNK one first (e.g. [${picks[0]!.seat}, ${picks[1]!.seat}]).`],
      };
    },
    resolve: (s, op, p, step, input) => {
      const picks = targets(s, input, step);
      if (picks.length < 2) throw new RuleError('invalid', 'The Innkeeper protects two players');
      clearDrunkEverywhere(s, 'Innkeeper');
      if (impaired(p)) return `Innkeeper ${who(p)} is drunk/poisoned: nobody is protected.`;
      for (const q of picks) q.protectedTonight = true;
      makeDrunk(picks[0]!, 'Innkeeper');
      log(s, op, `Innkeeper protects ${picks.map(who).join(', ')}`);
      return `${picks.map(who).join(' and ')} are safe tonight; ${who(picks[0]!)} is drunk.`;
    },
    reminders: [drunkToken('Innkeeper'), 'Safe (Innkeeper)'],
  },

  gambler: {
    firstNight: null,
    otherNight: 41,
    // The protocol's prompts are either "choose players" or "choose a character", not both, so the
    // player picks the player and the Storyteller records the guessed character when resolving.
    prompt: () => choose('Choose a player to bet on', 1, false, false, 'Tell the Storyteller which character you guess.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      const guess = step.response?.character;
      if (!t) return { text: 'Waiting for the Gambler to choose a player.' };
      if (!guess)
        return {
          text: `${who(t)} chosen. Record the guessed character when you resolve (resolve input: character).`,
          notes: [`${t.name} is really the ${charName(t.character)}.`],
        };
      const right = t.character === guess;
      return {
        text: right
          ? `Correct: ${who(t)} really is the ${charName(guess)}. The Gambler lives.`
          : `Wrong: ${who(t)} is the ${charName(t.character)}, not the ${charName(guess)}. The Gambler dies.`,
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      const guess = input.character ?? step.response?.character;
      if (!guess) throw new RuleError('invalid', 'Record the character the Gambler guessed');
      if (impaired(p)) return `Gambler ${who(p)} is drunk/poisoned: no effect whatever they guessed.`;
      if (t.character === guess) return `${who(t)} is the ${charName(guess)}: the Gambler guessed right and lives.`;
      killPlayer(s, op, p, 'storyteller');
      log(s, op, `Gambler ${who(p)} guessed wrong and died`);
      return `${who(t)} is the ${charName(t.character)}: the Gambler guessed wrong and dies.`;
    },
  },

  gossip: {
    firstNight: null,
    otherNight: 45,
    prompt: () => yesNo("Was the Gossip's public statement true?", 'If it was, a player dies tonight.'),
    suggest: (s, p) => ({
      text: "Was the Gossip's public statement today true? If so, a player of your choice dies tonight.",
      notes: [
        impaired(p)
          ? `Gossip ${who(p)} is drunk/poisoned: no death however true the statement was.`
          : 'Resolve with the seat of the player who dies, or resolve with no seats if nobody does.',
      ],
    }),
    resolve: (s, op, p, step, input) => {
      const seats = input.seats ?? step.response?.seats ?? [];
      if (impaired(p)) return `Gossip ${who(p)} is drunk/poisoned: nobody dies.`;
      if (!seats.length) return 'The statement was false (or you ruled no death): nobody dies.';
      const t = target(s, input, step);
      killPlayer(s, op, t, 'storyteller');
      log(s, op, `Gossip's true statement kills ${who(t)}`);
      return `${who(t)} dies because the Gossip spoke the truth.`;
    },
    nightNote: "The Gossip's statement is public; judging it and assigning the death are both yours.",
  },

  courtier: {
    firstNight: 14,
    otherNight: 14,
    wakes: (_s, p) => !onceUsed(p),
    prompt: (s) =>
      chooseCharacter(
        'Name a character to get drunk',
        charactersInPlay(s),
        'Once per game. If that character is in play, they are drunk for three nights and three days.',
      ),
    suggest: (s, p, step) => {
      const guess = step.response?.character;
      if (!guess) return { text: 'Waiting for the Courtier to name a character (once per game).' };
      const holder = s.players.find((q) => q.character === guess);
      return {
        text: holder
          ? `${charName(guess)} is in play (${who(holder)}): they are drunk for three nights and days.`
          : `${charName(guess)} is not in play: the ability is spent for nothing.`,
        notes: impaired(p) ? [`Courtier ${who(p)} is drunk/poisoned: no effect.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const guess = input.character ?? step.response?.character;
      if (!guess) throw new RuleError('invalid', 'The Courtier must name a character');
      spendOnce(p);
      if (impaired(p)) return `Courtier ${who(p)} is drunk/poisoned: ability spent with no effect.`;
      const holder = s.players.find((q) => q.character === guess);
      if (!holder) return `${charName(guess)} is not in play: nothing happens.`;
      makeDrunk(holder, 'Courtier 3');
      log(s, op, `Courtier makes the ${charName(guess)} drunk for three days`);
      return `${who(holder)} (the ${charName(guess)}) is drunk for three nights and three days.`;
    },
    reminders: [ONCE_USED, drunkToken('Courtier 3'), drunkToken('Courtier 2'), drunkToken('Courtier 1')],
    nightNote: "Count the Courtier's three days down each dusk: 3 → 2 → 1 → sober.",
  },

  professor: {
    firstNight: null,
    otherNight: 37,
    wakes: (s, p) => !onceUsed(p) && s.players.some((q) => !q.alive),
    prompt: () =>
      choose('Choose a dead player to revive', 1, false, true, 'Once per game. If they are a Townsfolk, they come back to life.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Professor to choose a dead player (once per game).' };
      const ok = typeOf(t.character) === 'townsfolk';
      return {
        text: ok
          ? `${who(t)} is a Townsfolk and returns to life.`
          : `${who(t)} is the ${charName(t.character)}, not a Townsfolk: nothing happens.`,
        notes: impaired(p) ? [`Professor ${who(p)} is drunk/poisoned: no revival.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      spendOnce(p);
      if (impaired(p)) return `Professor ${who(p)} is drunk/poisoned: ability spent with no effect.`;
      if (t.alive) return `${who(t)} is already alive: nothing happens.`;
      if (typeOf(t.character) !== 'townsfolk') return `${who(t)} is not a Townsfolk: nothing happens.`;
      t.alive = true;
      t.died = false;
      addReminder(t, 'Revived by the Professor');
      log(s, op, `Professor revives ${who(t)}`);
      alert(s, op, `${who(t)} was revived by the Professor; it becomes public when the day starts.`);
      return `${who(t)} comes back to life.`;
    },
    reminders: [ONCE_USED, 'Revived by the Professor'],
  },

  minstrel: {
    firstNight: null,
    otherNight: null,
    // Triggered by a MINION's execution, so the logic lives in BMR_HOOKS.onAnyDeath.
    nightNote: 'When a Minion dies by execution, everyone except the Minstrel is drunk until dusk tomorrow.',
    reminders: [drunkToken('Minstrel')],
  },

  tea_lady: {
    firstNight: null,
    otherNight: null,
    // Protects her NEIGHBOURS, so the logic lives in BMR_HOOKS.preventsKill.
    nightNote: "If both of the Tea Lady's living neighbours are good, neither of them can die.",
  },

  pacifist: {
    firstNight: null,
    otherNight: null,
    nightNote: 'You may rule that an executed good player survives. Nothing is automatic.',
  },

  fool: {
    firstNight: null,
    otherNight: null,
    preventsKill: (_s, p, _cause, opts) => {
      if (impaired(p) || onceUsed(p)) return null;
      if (!opts.preview) spendOnce(p);
      return { reason: `${who(p)} is the Fool and survives their first death.` };
    },
    reminders: [ONCE_USED],
  },

  // -------------------------------------------------------------------------------- Outsiders

  tinker: {
    firstNight: null,
    otherNight: null,
    nightNote: 'The Tinker may die at any time, at your discretion. Use "kill" when you want it to happen.',
  },

  moonchild: {
    firstNight: null,
    otherNight: null,
    dynamicOrder: 38,
    prompt: () =>
      choose('Choose a player publicly', 1, false, false, 'You have learned you are dead. If they are good, they die tonight.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: "Waiting for the Moonchild's public choice." };
      return {
        text: t.alignment === 'good' ? `${who(t)} is good and dies tonight.` : `${who(t)} is evil: nothing happens.`,
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Moonchild ${who(p)} was drunk/poisoned: nobody dies.`;
      if (t.alignment !== 'good') return `${who(t)} is evil: nothing happens.`;
      killPlayer(s, op, t, 'storyteller');
      log(s, op, `Moonchild's choice kills ${who(t)}`);
      return `${who(t)} dies because the Moonchild chose them.`;
    },
    onDeath: (s, op, p) => {
      alert(s, op, `Moonchild ${who(p)} learned they died: have them publicly choose a player.`);
    },
  },

  goon: {
    firstNight: null,
    otherNight: null,
    nightNote:
      "The first player to pick the Goon with their ability each night becomes drunk until dusk, and the Goon turns to that player's alignment. Apply it yourself with set_drunk / change_character.",
    reminders: [drunkToken('Goon'), 'Turned good', 'Turned evil'],
  },

  lunatic: {
    firstNight: 13,
    otherNight: 31,
    believesOther: 'demon',
    prompt: () => chooseRange('Choose your victims', 1, 3, true, true, 'You are the Demon. Choose who dies tonight.'),
    suggest: (s, p, step) => {
      const picks = chosen(s, step);
      return {
        text: picks.length
          ? `Lunatic ${who(p)} "kills" ${picks.map(who).join(', ')}: NOTHING happens.`
          : 'Waiting for the Lunatic to choose (nothing will happen whatever they choose).',
        notes: [
          'The Lunatic believes they are the Demon. Go through the motions, then resolve with no effect.',
          'Show the real Demon who the Lunatic is and who they chose.',
        ],
      };
    },
    resolve: (s, _op, p, step, input) => {
      const seats = input.seats ?? step.response?.seats ?? [];
      return `Lunatic ${who(p)} chose ${seats.length ? seats.map((x) => x + 1).join(', ') : 'nobody'}: no effect.`;
    },
    setupNote: 'The Lunatic is told they are the Demon and receives Demon bluffs; their ability does nothing.',
  },

  // ---------------------------------------------------------------------------------- Minions

  godfather: {
    firstNight: 40,
    otherNight: 34,
    setupNote: 'One extra Outsider (you may instead rule one fewer). Decide before dealing.',
    setupModifier: (c) => ({ ...c, townsfolk: c.townsfolk - 1, outsiders: c.outsiders + 1 }),
    wakes: (s, _p, first) => first || s.players.some((q) => q.reminders.includes('Outsider died today')),
    prompt: () => choose('Choose a player to kill', 1, false, false, 'An Outsider died today.'),
    suggest: (s, p, step) => {
      if (s.phase === 'first_night') {
        const chars = [...new Set(s.players.filter((q) => typeOf(q.character) === 'outsider').map((q) => q.character))];
        const text = chars.length
          ? `The Outsiders in play are: ${chars.map(charName).join(', ')}.`
          : 'There are no Outsiders in play.';
        return {
          text: `Godfather learns Outsiders: ${chars.map(charName).join(', ') || 'none'}`,
          info: { text, characters: chars },
        };
      }
      const [t] = chosen(s, step);
      return {
        text: t ? `${who(t)} dies (an Outsider died today).` : 'Waiting for the Godfather to choose a player.',
        notes: impaired(p) ? [`Godfather ${who(p)} is drunk/poisoned: no kill.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      if (s.phase === 'first_night') return 'Outsider list shown to the Godfather.';
      const t = target(s, input, step);
      if (impaired(p)) return `Godfather ${who(p)} is drunk/poisoned: no kill.`;
      return killPlayer(s, op, t, 'demon') ? `${who(t)} was killed by the Godfather.` : `${who(t)} survived.`;
    },
    reminders: ['Outsider died today'],
  },

  devils_advocate: {
    firstNight: 22,
    otherNight: 22,
    prompt: () =>
      choose('Choose a living player', 1, true, false, 'Different from last night. If they are executed tomorrow, they survive.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      return {
        text: t ? `${who(t)} survives execution tomorrow.` : "Waiting for the Devil's Advocate to choose a player.",
        notes: impaired(p) ? [`Devil's Advocate ${who(p)} is drunk/poisoned: no effect.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (t.reminders.includes("Devil's Advocate last night"))
        throw new RuleError('invalid', "The Devil's Advocate must choose a different player from last night");
      for (const q of s.players) {
        removeReminder(q, "Devil's Advocate last night");
        removeReminder(q, 'Survives execution');
      }
      addReminder(t, "Devil's Advocate last night");
      if (impaired(p)) return `Devil's Advocate ${who(p)} is drunk/poisoned: no effect.`;
      addReminder(t, 'Survives execution');
      log(s, op, `Devil's Advocate protects ${who(t)} from execution`);
      return `${who(t)} survives execution tomorrow.`;
    },
    reminders: ["Devil's Advocate last night", 'Survives execution'],
  },

  assassin: {
    firstNight: null,
    otherNight: 33,
    wakes: (_s, p) => !onceUsed(p),
    prompt: () =>
      choose('Choose a player to assassinate', 1, false, false, 'Once per game. They die even if something would save them.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      return {
        text: t ? `${who(t)} dies — nothing can prevent it.` : 'Waiting for the Assassin to choose (once per game), or skip.',
        notes: impaired(p) ? [`Assassin ${who(p)} is drunk/poisoned: ability spent with no effect.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      spendOnce(p);
      if (impaired(p)) return `Assassin ${who(p)} is drunk/poisoned: ability spent with no effect.`;
      // `raw` bypasses every protection, which is exactly the Assassin's point.
      killPlayer(s, op, t, 'demon', { raw: true });
      log(s, op, `Assassin kills ${who(t)} (unpreventable)`);
      return `${who(t)} was assassinated and could not be saved.`;
    },
    reminders: [ONCE_USED],
  },

  mastermind: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'If the Demon is executed, you may play one more day. If a player is executed that day, their team loses. Use override_result to keep the game going.',
    onDemonDeath: (s, op, p) => {
      if (impaired(p)) {
        alert(s, op, `Mastermind ${who(p)} is drunk/poisoned: the game ends normally.`);
        return false;
      }
      alert(
        s,
        op,
        `Mastermind ${who(p)} is alive: you may override the result and play one more day. If anyone is executed that day, their team loses.`,
      );
      // The Mastermind does not become the Demon, so the detected result stands unless the
      // Storyteller overrides it — correct, non-gating behaviour.
      return false;
    },
  },

  // ----------------------------------------------------------------------------------- Demons

  zombuul: {
    firstNight: null,
    otherNight: 30,
    wakes: (s) => !s.players.some((q) => q.reminders.includes('Died today')),
    prompt: () => choose('Choose a player to kill', 1, false, false, 'Only if nobody died today.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Zombuul to choose a player.' };
      const blocked = killPrevention(s, t, 'demon', { preview: true });
      return {
        text: impaired(p)
          ? `Zombuul is drunk/poisoned: ${who(t)} survives.`
          : blocked
            ? `${blocked.reason} Nobody dies.`
            : `${who(t)} dies.`,
        notes: ['The Zombuul registers as dead until it dies a second time (reminder "Died once").'],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Zombuul ${who(p)} is drunk/poisoned: no kill.`;
      return killPlayer(s, op, t, 'demon') ? `${who(t)} was killed.` : `${who(t)} survived.`;
    },
    // The first death only marks the Zombuul; the second is real.
    preventsKill: (_s, p, _cause, opts) => {
      if (p.reminders.includes('Died once')) return null;
      if (!opts.preview) addReminder(p, 'Died once');
      return { reason: `${who(p)} is the Zombuul: it now registers as dead but is not truly dead.` };
    },
    reminders: ['Died once', 'Died today'],
    nightNote: 'The Zombuul only kills on a day when nobody died, and survives its first death.',
  },

  pukka: {
    firstNight: 20,
    otherNight: 20,
    prompt: () => choose('Choose a player to poison', 1, false, false, "They are poisoned. Last night's victim dies now."),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      const dying = s.players.find((q) => q.reminders.includes('Poisoned by the Pukka'));
      const parts: string[] = [];
      if (t) parts.push(`${who(t)} is poisoned`);
      if (dying) parts.push(`${who(dying)} (poisoned last night) dies`);
      return {
        text: parts.length ? `${parts.join('; ')}.` : 'Waiting for the Pukka to choose a player.',
        notes: impaired(p) ? [`Pukka ${who(p)} is drunk/poisoned: no effect.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Pukka ${who(p)} is drunk/poisoned: no effect.`;
      const prev = s.players.find((q) => q.reminders.includes('Poisoned by the Pukka'));
      addReminder(t, 'Poisoned by the Pukka');
      if (t.poisonedBy === null) t.poisonedBy = 'storyteller';
      let text = `${who(t)} is poisoned.`;
      if (prev && prev !== t) {
        removeReminder(prev, 'Poisoned by the Pukka');
        if (prev.poisonedBy === 'storyteller') prev.poisonedBy = null;
        text += killPlayer(s, op, prev, 'demon')
          ? ` ${who(prev)} dies from last night's poison.`
          : ` ${who(prev)} survived.`;
      }
      log(s, op, `Pukka poisons ${who(t)}`);
      return text;
    },
    reminders: ['Poisoned by the Pukka'],
  },

  shabaloth: {
    firstNight: null,
    otherNight: 32,
    prompt: () => choose('Choose two players to kill', 2, false, false),
    suggest: (s, p, step) => {
      const picks = chosen(s, step);
      const regurg = s.players.filter((q) => q.reminders.includes('Eaten last night'));
      if (picks.length < 2) return { text: 'Waiting for the Shabaloth to choose two players.' };
      return {
        text: impaired(p)
          ? `Shabaloth is drunk/poisoned: ${picks.map(who).join(' and ')} survive.`
          : `${picks.map(who).join(' and ')} die.`,
        notes: regurg.length
          ? [`You MAY bring one of last night's victims back: ${regurg.map(who).join(', ')}. Use "set_alive" if you do.`]
          : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const picks = targets(s, input, step);
      if (picks.length < 2) throw new RuleError('invalid', 'The Shabaloth kills two players');
      for (const q of s.players) removeReminder(q, 'Eaten last night');
      if (impaired(p)) return `Shabaloth ${who(p)} is drunk/poisoned: nobody dies.`;
      const outcomes: string[] = [];
      for (const t of picks) {
        const died = killPlayer(s, op, t, 'demon');
        if (died) addReminder(t, 'Eaten last night');
        outcomes.push(`${who(t)} ${died ? 'died' : 'survived'}`);
      }
      log(s, op, `Shabaloth eats ${picks.map(who).join(', ')}`);
      return `${outcomes.join('; ')}. You may regurgitate one of them tomorrow night.`;
    },
    reminders: ['Eaten last night'],
    nightNote: 'Regurgitation is your choice: revive one of last night\'s victims with "set_alive" if you want to.',
  },

  po: {
    firstNight: null,
    otherNight: 33,
    prompt: (_s, p) =>
      p.reminders.includes('Charged')
        ? choose('Choose three players to kill', 3, false, false, 'You chose nobody last night, so you strike three times.')
        : chooseRange('Choose a player to kill, or nobody', 0, 1, false, false, 'Choosing nobody charges you for three kills.'),
    suggest: (s, p, step) => {
      const picks = chosen(s, step);
      const charged = p.reminders.includes('Charged');
      if (!picks.length) {
        return {
          text: charged
            ? 'The Po is charged and must kill three players.'
            : 'The Po chose nobody: it charges up and kills three players tomorrow night.',
        };
      }
      return {
        text: impaired(p)
          ? `Po is drunk/poisoned: ${picks.map(who).join(', ')} survive.`
          : `${picks.map(who).join(', ')} die.`,
      };
    },
    resolve: (s, op, p, step, input) => {
      const picks = targets(s, input, step);
      const charged = p.reminders.includes('Charged');
      if (!picks.length) {
        if (charged) throw new RuleError('invalid', 'A charged Po must choose three players');
        addReminder(p, 'Charged');
        return 'The Po chose nobody and is now charged: three kills tomorrow night.';
      }
      if (charged && picks.length !== 3) throw new RuleError('invalid', 'A charged Po kills exactly three players');
      removeReminder(p, 'Charged');
      if (impaired(p)) return `Po ${who(p)} is drunk/poisoned: nobody dies.`;
      const outcomes = picks.map((t) => `${who(t)} ${killPlayer(s, op, t, 'demon') ? 'died' : 'survived'}`);
      log(s, op, `Po kills ${picks.map(who).join(', ')}`);
      return `${outcomes.join('; ')}.`;
    },
    reminders: ['Charged'],
  },
};

// --------------------------------------------------------------------------------- script hooks

/**
 * True when the Tea Lady protects `victim`: she is alive and healthy, `victim` is one of her two
 * living neighbours, and both of those neighbours are good. Exported for tests.
 */
export function teaLadyProtects(s: GameState, victim: PlayerState): boolean {
  const tl = s.players.find((q) => q.alive && q.character === 'tea_lady' && !impaired(q));
  if (!tl) return false;
  const nb = livingNeighbours(s, tl.seat);
  if (nb.length < 2 || !nb.includes(victim)) return false;
  return nb.every((q) => q.alignment === 'good');
}

/**
 * Abilities that react to OTHER players' events, so they cannot live on the affected player's own
 * definition: the Tea Lady protects her neighbours, and the Minstrel reacts to a Minion dying.
 */
export const BMR_HOOKS: ScriptHooks = {
  preventsKill: (s, victim) =>
    teaLadyProtects(s, victim)
      ? { reason: `${who(victim)} is protected by the Tea Lady (both her living neighbours are good).` }
      : null,

  onAnyDeath: (s, op, dead, cause) => {
    // The Zombuul only kills on a day when nobody died.
    if (!dead.reminders.includes('Died today')) addReminder(dead, 'Died today');

    // Minstrel: a Minion executed makes everyone else drunk until dusk tomorrow.
    if (cause !== 'execution' && cause !== 'virgin') return;
    if (typeOf(dead.character) !== 'minion') return;
    const minstrel = s.players.find((q) => q.alive && q.character === 'minstrel');
    if (!minstrel) return;
    if (impaired(minstrel)) {
      alert(s, op, `Minstrel ${who(minstrel)} is drunk/poisoned: nobody becomes drunk.`);
      return;
    }
    clearDrunkEverywhere(s, 'Minstrel');
    for (const q of s.players) if (q !== minstrel && q.alive) makeDrunk(q, 'Minstrel');
    log(s, op, `Minstrel: everyone except ${who(minstrel)} is drunk until dusk tomorrow`);
    alert(s, op, `A Minion was executed: everyone except Minstrel ${who(minstrel)} is drunk until dusk tomorrow.`);
  },
};
