// Sects & Violets — 25 character definitions.
//
// This script runs on misinformation, so the division of labour is sharper than on the others:
//
// THE ENGINE COMPUTES THE TRUTH; THE STORYTELLER DECIDES WHAT IS SAID. Every info character's
// `suggest` returns the TRUTHFUL answer plus a ready-to-send `info`. The Storyteller always
// presses send, and on this script they very often send something else on purpose — the Vortox
// requires it, and madness/Mutant/Savant are entirely their call. Nothing here auto-delivers.
//
// MADNESS IS NOT MECHANISED. Mutant and Cerenovus madness, and the Savant's two statements, are
// prompts plus reminder tokens plus advisory text. The engine never executes anyone for breaking
// madness and never invents the Savant's statements: that is the Storyteller's job and trying to
// automate it would gate them (docs/vision.md, principle 2).
//
// POISON SOURCES. `PlayerState.poisonedBy` only distinguishes `'poisoner'` from `'storyteller'`,
// so the Demons on this script poison with `'storyteller'` plus a reminder token naming the
// source (`Poisoned by the No Dashii`). The token is the source of truth for clearing it, so two
// sources never cancel each other out, and the Storyteller sees the cause in the Grimoire.
import { becomeDemon, killPlayer } from '../deaths.js';
import {
  choose,
  chooseCharacter,
  chosen,
  target,
  targets,
  type ScriptHooks,
  type ScriptRoleDefs,
} from '../rolekit.js';
import { RuleError, type GameState, type PlayerState } from '../types.js';
import {
  addReminder,
  aliveCount,
  alert,
  charName,
  impaired,
  livingNeighbours,
  log,
  pick,
  playerAt,
  removeReminder,
  seatsClockwiseFrom,
  shuffle,
  typeOf,
  who,
} from '../util.js';
import { CHARACTER_INFO, charactersOfScript, type CharacterId } from '@ct/protocol';

// -------------------------------------------------------------------------------------- helpers

const ONCE_USED = 'Ability used';
const onceUsed = (p: PlayerState) => p.reminders.includes(ONCE_USED);
const spendOnce = (p: PlayerState) => addReminder(p, ONCE_USED);

/** Poison with a named source, so independent sources never clear each other. */
function poisonFrom(p: PlayerState, source: string): void {
  addReminder(p, `Poisoned by the ${source}`);
  if (p.poisonedBy === null) p.poisonedBy = 'storyteller';
}

function clearPoisonFrom(s: GameState, source: string): void {
  const token = `Poisoned by the ${source}`;
  for (const q of s.players) {
    if (!q.reminders.includes(token)) continue;
    removeReminder(q, token);
    // Only release the shared flag when no other named source is still poisoning them.
    if (q.poisonedBy === 'storyteller' && !q.reminders.some((r) => r.startsWith('Poisoned by the '))) {
      q.poisonedBy = null;
    }
  }
}

/** Seat distance around the circle, counting living players only (Clockmaker). */
function stepsBetween(s: GameState, fromSeat: number, toSeat: number): number {
  const order = seatsClockwiseFrom(s, fromSeat);
  const forward = order.indexOf(toSeat) + 1;
  const backward = order.length - forward + 1;
  return Math.min(forward, backward);
}

/** The two closest living Townsfolk neighbours, walking outwards (No Dashii). */
function nearestTownsfolkNeighbours(s: GameState, seat: number): PlayerState[] {
  const order = seatsClockwiseFrom(s, seat).filter((x) => x !== seat);
  const forward = order.map((x) => playerAt(s, x)!).find((q) => q.alive && typeOf(q.character) === 'townsfolk');
  const backward = [...order]
    .reverse()
    .map((x) => playerAt(s, x)!)
    .find((q) => q.alive && typeOf(q.character) === 'townsfolk');
  const out: PlayerState[] = [];
  if (forward) out.push(forward);
  if (backward && backward !== forward) out.push(backward);
  return out;
}

/** Good characters on this script, for "name a good character" prompts (Philosopher, Cerenovus). */
const goodSnvCharacters = (): CharacterId[] =>
  charactersOfScript('sects-and-violets').filter((c) => CHARACTER_INFO[c].alignment === 'good');

/** True when a Vortox is alive and healthy: every Townsfolk's information must be false tonight. */
function vortoxActive(s: GameState): boolean {
  return s.players.some((q) => q.alive && q.character === 'vortox' && !impaired(q));
}

/** Advisory note appended to every Townsfolk info step while a Vortox is in play. */
function vortoxNote(s: GameState): string[] {
  return vortoxActive(s)
    ? ['VORTOX IS ACTIVE: this Townsfolk must be given FALSE information. The suggestion below is the truth.']
    : [];
}

export const SNV_ROLES: ScriptRoleDefs = {
  // ------------------------------------------------------------------------------- Townsfolk

  clockmaker: {
    firstNight: 42,
    otherNight: null,
    suggest: (s) => {
      const demon = s.players.find((q) => typeOf(q.character) === 'demon');
      const minions = s.players.filter((q) => typeOf(q.character) === 'minion');
      if (!demon || !minions.length) {
        const none = 'There is no Demon and Minion pair to measure.';
        return { text: none, info: { text: none, number: 0 }, notes: vortoxNote(s) };
      }
      const n = Math.min(...minions.map((m) => stepsBetween(s, demon.seat, m.seat)));
      const text = `It is ${n} step${n === 1 ? '' : 's'} from the Demon to its nearest Minion.`;
      return {
        text: `Clockmaker number: ${n} (Demon ${who(demon)}, nearest Minion ${minions
          .map((m) => `${m.name}:${stepsBetween(s, demon.seat, m.seat)}`)
          .join(', ')})`,
        info: { text, number: n },
        notes: vortoxNote(s),
      };
    },
    infoOnly: true,
  },

  dreamer: {
    firstNight: 46,
    otherNight: 46,
    prompt: () => choose('Choose a player', 1, false, false, 'You learn one good and one evil character, one of which is theirs.'),
    prepare: (s, p, rng) => {
      // The decoy is fixed when the night is built so the answer is stable across re-reads.
      const pool = charactersOfScript('sects-and-violets');
      const good = shuffle(rng, pool.filter((c) => CHARACTER_INFO[c].alignment === 'good'));
      const evil = shuffle(rng, pool.filter((c) => CHARACTER_INFO[c].alignment === 'evil'));
      void p;
      return { character: good[0] ?? null, seats: [], number: pool.indexOf(evil[0] ?? 'witch') };
    },
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Dreamer to choose a player.' };
      const pool = charactersOfScript('sects-and-violets');
      const theirs = t.character;
      const theirsIsGood = CHARACTER_INFO[theirs].alignment === 'good';
      // The real character, plus a decoy of the opposite alignment.
      const decoyPool = pool.filter((c) => CHARACTER_INFO[c].alignment !== CHARACTER_INFO[theirs].alignment);
      const decoy = decoyPool[(step.fixed?.number ?? 0) % Math.max(1, decoyPool.length)] ?? decoyPool[0]!;
      const goodOne = theirsIsGood ? theirs : decoy;
      const evilOne = theirsIsGood ? decoy : theirs;
      const text = `One of these is ${t.name}: the ${charName(goodOne)} or the ${charName(evilOne)}.`;
      return {
        text: `Dreamer on ${who(t)} (really the ${charName(theirs)}): show ${charName(goodOne)} / ${charName(evilOne)}`,
        info: { text, seats: [t.seat], characters: [goodOne, evilOne] },
        notes: vortoxNote(s),
      };
    },
    infoOnly: true,
  },

  snake_charmer: {
    firstNight: 15,
    otherNight: 15,
    prompt: () => choose('Choose a living player', 1, false, false, 'If you pick the Demon, you swap characters and they are poisoned.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Snake Charmer to choose a player.' };
      const isDemon = typeOf(t.character) === 'demon';
      return {
        text: isDemon
          ? `${who(t)} IS the Demon: swap characters — ${p.name} becomes the ${charName(t.character)} and ${t.name} becomes the Snake Charmer and is poisoned.`
          : `${who(t)} is not the Demon: nothing happens.`,
        notes: impaired(p) ? [`Snake Charmer ${who(p)} is drunk/poisoned: no swap.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Snake Charmer ${who(p)} is drunk/poisoned: no effect.`;
      if (typeOf(t.character) !== 'demon') return `${who(t)} is not the Demon: nothing happens.`;
      const demonId = t.character;
      // Swap characters. The old Snake Charmer becomes the Demon; the Demon becomes the Snake
      // Charmer and is poisoned from now on.
      becomeDemon(s, op, p, demonId, 'you charmed the Demon and took its place');
      t.character = 'snake_charmer';
      t.believedCharacter = 'snake_charmer';
      t.alignment = 'good';
      t.believedAlignment = 'good';
      poisonFrom(t, 'Snake Charmer swap');
      addReminder(t, 'Was the Demon');
      log(s, op, `Snake Charmer ${who(p)} swapped with the Demon ${who(t)}`);
      alert(s, op, `${who(p)} is now the ${charName(demonId)}; ${who(t)} is the poisoned Snake Charmer.`);
      return `Swapped: ${who(p)} is the ${charName(demonId)}, ${who(t)} is the poisoned Snake Charmer.`;
    },
    reminders: ['Poisoned by the Snake Charmer swap', 'Was the Demon'],
  },

  mathematician: {
    firstNight: 47,
    otherNight: 47,
    suggest: (s) => {
      // "Abnormal" = a player whose ability was impaired by another character tonight. Drunk and
      // poisoned players are the mechanical proxy the engine can actually count.
      const abnormal = s.players.filter((q) => q.alive && impaired(q) && q.character !== 'drunk');
      const n = abnormal.length;
      const text = `${n} player${n === 1 ? "'s ability" : "s' abilities"} worked abnormally tonight.`;
      return {
        text: `Mathematician number: ${n} (${abnormal.map(who).join(', ') || 'nobody'})`,
        info: { text, number: n },
        notes: [
          'The engine counts drunk/poisoned players. Add anyone else whose ability misfired for another reason.',
          ...vortoxNote(s),
        ],
      };
    },
    infoOnly: true,
  },

  flowergirl: {
    firstNight: null,
    otherNight: 48,
    suggest: (s) => {
      const demon = s.players.find((q) => typeOf(q.character) === 'demon');
      // `s.day` is cleared at nightfall, so this reads the captured summary of yesterday.
      const voted = !!demon && (s.lastDay?.voterSeats ?? []).includes(demon.seat);
      const text = voted ? 'The Demon voted today.' : 'The Demon did not vote today.';
      return {
        text: `Flowergirl: Demon ${demon ? who(demon) : 'none'} ${voted ? 'VOTED' : 'did not vote'} today`,
        info: { text, yes: voted },
        notes: ["Reads yesterday's tallied votes. Re-check it if you struck or added a vote.", ...vortoxNote(s)],
      };
    },
    infoOnly: true,
  },

  town_crier: {
    firstNight: null,
    otherNight: 48,
    suggest: (s) => {
      const minionNominated = (s.lastDay?.nominatorSeats ?? []).some((seat) => {
        const nom = playerAt(s, seat);
        return !!nom && typeOf(nom.character) === 'minion';
      });
      const text = minionNominated ? 'A Minion nominated today.' : 'No Minion nominated today.';
      return {
        text: `Town Crier: a Minion ${minionNominated ? 'DID' : 'did not'} nominate today`,
        info: { text, yes: minionNominated },
        notes: vortoxNote(s),
      };
    },
    infoOnly: true,
  },

  oracle: {
    firstNight: null,
    otherNight: 49,
    suggest: (s) => {
      const deadEvil = s.players.filter((q) => !q.alive && q.alignment === 'evil');
      const n = deadEvil.length;
      const text = `${n} dead player${n === 1 ? ' is' : 's are'} evil.`;
      return {
        text: `Oracle number: ${n} (${deadEvil.map(who).join(', ') || 'none'})`,
        info: { text, number: n },
        notes: vortoxNote(s),
      };
    },
    infoOnly: true,
  },

  savant: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'Each day the Savant may visit you privately. Give them two statements, exactly one of which is true. Both are yours to invent — use send_info twice.',
    reminders: ['Visited today'],
  },

  seamstress: {
    firstNight: 50,
    otherNight: 50,
    wakes: (_s, p) => !onceUsed(p),
    prompt: () =>
      choose('Choose two other players', 2, false, false, 'Once per game. You learn whether they are the same alignment.'),
    suggest: (s, _p, step) => {
      const picks = chosen(s, step);
      if (picks.length < 2) return { text: 'Waiting for the Seamstress to choose two players (once per game).' };
      const same = picks[0]!.alignment === picks[1]!.alignment;
      const text = same ? 'They are the same alignment.' : 'They are different alignments.';
      return {
        text: `Seamstress: ${picks.map((q) => `${q.name} (${q.alignment})`).join(' / ')} -> ${same ? 'SAME' : 'DIFFERENT'}`,
        info: { text, yes: same, seats: picks.map((q) => q.seat) },
        notes: vortoxNote(s),
      };
    },
    resolve: (_s, _op, p) => {
      spendOnce(p);
      return 'Seamstress ability spent.';
    },
    reminders: [ONCE_USED],
  },

  philosopher: {
    firstNight: 16,
    otherNight: 16,
    wakes: (_s, p) => !onceUsed(p),
    prompt: () =>
      chooseCharacter(
        'Name a good character',
        goodSnvCharacters(),
        'Once per game. You gain that ability. If that character is in play, they become drunk.',
      ),
    suggest: (s, p, step) => {
      const want = step.response?.character;
      if (!want) return { text: 'Waiting for the Philosopher to name a good character (once per game).' };
      const holder = s.players.find((q) => q.character === want && q !== p);
      return {
        text: holder
          ? `${p.name} gains the ${charName(want)} ability; ${who(holder)} (the real one) becomes drunk.`
          : `${p.name} gains the ${charName(want)} ability; that character is not in play, so nobody becomes drunk.`,
        notes: [
          'The Philosopher now acts as that character: use change_character on the Philosopher if you want the engine to run the new ability for them.',
          ...(impaired(p) ? [`Philosopher ${who(p)} is drunk/poisoned: ability spent with no effect.`] : []),
        ],
      };
    },
    resolve: (s, op, p, step, input) => {
      const want = input.character ?? step.response?.character;
      if (!want) throw new RuleError('invalid', 'The Philosopher must name a good character');
      spendOnce(p);
      if (impaired(p)) return `Philosopher ${who(p)} is drunk/poisoned: ability spent with no effect.`;
      addReminder(p, `Philosopher: ${charName(want)}`);
      const holder = s.players.find((q) => q.character === want && q !== p);
      if (holder) {
        addReminder(holder, 'Drunk (Philosopher)');
        holder.drunkOverride = true;
        log(s, op, `Philosopher takes the ${charName(want)} ability; ${who(holder)} is drunk`);
        return `${p.name} gained the ${charName(want)} ability; ${who(holder)} is drunk from now on.`;
      }
      log(s, op, `Philosopher takes the ${charName(want)} ability (not in play)`);
      return `${p.name} gained the ${charName(want)} ability.`;
    },
    reminders: [ONCE_USED, 'Drunk (Philosopher)'],
  },

  artist: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'Once per game the Artist may privately ask you any yes/no question. Answer truthfully (unless a Vortox is active). Mark it used.',
    reminders: [ONCE_USED],
  },

  juggler: {
    firstNight: null,
    otherNight: 51,
    wakes: (s, p) => s.dayNumber >= 1 && p.reminders.includes('Juggled'),
    suggest: (s, p) => {
      const correct = p.reminders.filter((r) => r.startsWith('Juggle correct:')).length;
      const text = `You guessed ${correct} correctly.`;
      return {
        text: `Juggler number: ${correct} (from your "Juggle correct:" reminders)`,
        info: { text, number: correct },
        notes: [
          'The guesses are made publicly in the day. Record each correct one as a "Juggle correct: <name>" reminder before resolving.',
          ...vortoxNote(s),
        ],
      };
    },
    infoOnly: true,
    reminders: ['Juggled'],
    nightNote: "The Juggler's guesses are public and counted by you; add a reminder per correct guess.",
  },

  sage: {
    firstNight: null,
    otherNight: null,
    dynamicOrder: 36,
    prepare: (s, p, rng) => {
      const demon = s.players.find((q) => typeOf(q.character) === 'demon');
      if (!demon) return { seats: [] };
      const others = s.players.filter((q) => q !== p && q !== demon);
      const decoy = others.length ? pick(rng, others) : undefined;
      return { seats: shuffle(rng, decoy ? [demon.seat, decoy.seat] : [demon.seat]) };
    },
    suggest: (s, _p, step) => {
      const seats = step.fixed?.seats ?? [];
      const ps = seats.map((x) => playerAt(s, x)!).filter(Boolean);
      if (!ps.length) return { text: 'There is no Demon to point at.' };
      const text = `One of these two is the Demon: ${ps.map((q) => q.name).join(' or ')}.`;
      return {
        text: `Sage: show ${ps.map(who).join(' / ')}`,
        info: { text, seats: [...seats] },
        notes: vortoxNote(s),
      };
    },
    infoOnly: true,
    onDeath: (s, op, p, cause) => {
      if (cause !== 'demon') return;
      alert(s, op, `Sage ${who(p)} was killed by the Demon: wake them and show two players, one of whom is the Demon.`);
    },
  },

  // -------------------------------------------------------------------------------- Outsiders

  mutant: {
    firstNight: null,
    otherNight: null,
    nightNote:
      'The Mutant is mad about being an Outsider. If they break madness, you MAY execute them — your call, never automatic.',
    reminders: ['Mad: Outsider'],
  },

  sweetheart: {
    firstNight: null,
    otherNight: null,
    onDeath: (s, op, p) => {
      alert(s, op, `Sweetheart ${who(p)} died: choose a player to be drunk from now on (set_drunk).`);
    },
    reminders: ['Drunk (Sweetheart)'],
  },

  barber: {
    firstNight: null,
    otherNight: null,
    onDeath: (s, op, p) => {
      addReminder(p, 'Barber died');
      alert(s, op, `Barber ${who(p)} died: the Demon may swap two players' characters tonight.`);
    },
    reminders: ['Barber died'],
    nightNote: "After the Barber dies, the Demon may pick two players and you swap their characters (change_character twice).",
  },

  klutz: {
    firstNight: null,
    otherNight: null,
    onDeath: (s, op, p) => {
      alert(
        s,
        op,
        `Klutz ${who(p)} learned they died: they must publicly choose a living player. If that player is evil, good loses — use override_result/confirm_result.`,
      );
    },
  },

  // ---------------------------------------------------------------------------------- Minions

  evil_twin: {
    firstNight: 61,
    otherNight: null,
    prepare: (s, p, rng) => {
      const good = s.players.filter((q) => q.alignment === 'good');
      if (!good.length) return { seats: [] };
      const twin = pick(rng, good);
      return { seats: [twin.seat], character: twin.character };
    },
    suggest: (s, _p, step) => {
      const seat = step.fixed?.seats?.[0];
      const twin = seat === undefined ? undefined : playerAt(s, seat);
      if (!twin || !step.fixed?.character) return { text: 'There is no good player to twin with.' };
      const text = `${twin.name} is your twin, and they are the ${charName(step.fixed.character)}.`;
      return {
        text: `Evil Twin pairs with ${who(twin)} (the ${charName(step.fixed.character)}) — show BOTH players each other`,
        info: { text, seats: [twin.seat], characters: [step.fixed.character] },
        notes: [
          'Both twins learn each other and each other\'s character. Mark both with the twin reminder.',
          'Good cannot win while the Evil Twin lives, and executing the good twin makes evil win.',
        ],
      };
    },
    infoOnly: true,
    reminders: ['Good twin', 'Evil twin'],
  },

  witch: {
    firstNight: 23,
    otherNight: 23,
    wakes: (s) => aliveCount(s) > 3,
    prompt: () => choose('Choose a player to curse', 1, false, false, 'If they nominate tomorrow, they die.'),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      return {
        text: t ? `${who(t)} is cursed: if they nominate tomorrow, they die.` : 'Waiting for the Witch to choose a player.',
        notes: impaired(p) ? [`Witch ${who(p)} is drunk/poisoned: no curse.`] : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      for (const q of s.players) removeReminder(q, 'Cursed');
      if (impaired(p)) return `Witch ${who(p)} is drunk/poisoned: nobody is cursed.`;
      addReminder(t, 'Cursed');
      log(s, op, `Witch curses ${who(t)}`);
      return `${who(t)} is cursed.`;
    },
    reminders: ['Cursed'],
  },

  cerenovus: {
    firstNight: 21,
    otherNight: 21,
    prompt: () =>
      chooseCharacter(
        'Name the character they must claim',
        goodSnvCharacters(),
        'First choose the player. They are mad about being this character tomorrow.',
      ),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      const want = step.response?.character;
      if (!t) return { text: 'Waiting for the Cerenovus to choose a player.' };
      return {
        text: want
          ? `${who(t)} is mad about being the ${charName(want)} tomorrow.`
          : `${who(t)} chosen. Record the character they must claim when you resolve.`,
        notes: [
          'If they break madness you MAY execute them. Never automatic.',
          ...(impaired(p) ? [`Cerenovus ${who(p)} is drunk/poisoned: no madness.`] : []),
        ],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      const want = input.character ?? step.response?.character;
      if (!want) throw new RuleError('invalid', 'Record the character the Cerenovus named');
      for (const q of s.players) q.reminders = q.reminders.filter((r) => !r.startsWith('Mad: '));
      if (impaired(p)) return `Cerenovus ${who(p)} is drunk/poisoned: nobody is made mad.`;
      addReminder(t, `Mad: ${charName(want)}`);
      log(s, op, `Cerenovus makes ${who(t)} mad about the ${charName(want)}`);
      return `${who(t)} is mad about being the ${charName(want)} tomorrow.`;
    },
    nightNote: 'Madness is social: you decide whether a player broke it and whether to execute them for it.',
  },

  pit_hag: {
    firstNight: 19,
    otherNight: 19,
    prompt: (s) =>
      chooseCharacter(
        'Name the character they become',
        [...charactersOfScript('sects-and-violets')].filter((c) => !s.players.some((q) => q.character === c)),
        'First choose the player. If that character is already in play, nothing happens.',
      ),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      const want = step.response?.character;
      if (!t) return { text: 'Waiting for the Pit-Hag to choose a player.' };
      if (!want) return { text: `${who(t)} chosen. Record the character they become when you resolve.` };
      const alreadyInPlay = s.players.some((q) => q.character === want);
      return {
        text: alreadyInPlay
          ? `The ${charName(want)} is already in play: nothing happens.`
          : `${who(t)} becomes the ${charName(want)}.`,
        notes: [
          ...(typeOf(want) === 'demon' ? ['A newly created Demon kills tonight: add their step.'] : []),
          ...(impaired(p) ? [`Pit-Hag ${who(p)} is drunk/poisoned: no change.`] : []),
        ],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      const want = input.character ?? step.response?.character;
      if (!want) throw new RuleError('invalid', 'Record the character the Pit-Hag named');
      if (impaired(p)) return `Pit-Hag ${who(p)} is drunk/poisoned: no change.`;
      if (s.players.some((q) => q.character === want)) return `The ${charName(want)} is already in play: nothing happens.`;
      if (typeOf(want) === 'demon') {
        becomeDemon(s, op, t, want, 'the Pit-Hag remade you');
        alert(s, op, `${who(t)} is a new Demon and kills tonight: add their night step.`);
        return `${who(t)} became the ${charName(want)} and kills tonight.`;
      }
      t.character = want;
      t.believedCharacter = want;
      t.alignment = CHARACTER_INFO[want].alignment;
      t.believedAlignment = t.alignment;
      addReminder(t, `Pit-Hag made them the ${charName(want)}`);
      log(s, op, `Pit-Hag turns ${who(t)} into the ${charName(want)}`);
      return `${who(t)} became the ${charName(want)}.`;
    },
  },

  // ----------------------------------------------------------------------------------- Demons

  fang_gu: {
    firstNight: null,
    otherNight: 30,
    setupNote: 'One extra Outsider.',
    setupModifier: (c) => ({ ...c, townsfolk: c.townsfolk - 1, outsiders: c.outsiders + 1 }),
    prompt: () => choose('Choose a player to kill', 1, false, false),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Fang Gu to choose a player.' };
      const jumps = typeOf(t.character) === 'outsider' && !p.reminders.includes('Jumped');
      return {
        text: impaired(p)
          ? `Fang Gu is drunk/poisoned: ${who(t)} survives.`
          : jumps
            ? `${who(t)} is an Outsider: THEY become the Fang Gu and ${p.name} dies instead (once per game).`
            : `${who(t)} dies.`,
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Fang Gu ${who(p)} is drunk/poisoned: no kill.`;
      if (typeOf(t.character) === 'outsider' && !p.reminders.includes('Jumped')) {
        addReminder(p, 'Jumped');
        becomeDemon(s, op, t, 'fang_gu', 'the Fang Gu jumped into you');
        killPlayer(s, op, p, 'starpass');
        log(s, op, `Fang Gu jumps into Outsider ${who(t)}`);
        alert(s, op, `${who(t)} is the new Fang Gu; ${who(p)} died instead.`);
        return `${who(t)} became the Fang Gu and ${who(p)} died.`;
      }
      return killPlayer(s, op, t, 'demon') ? `${who(t)} was killed.` : `${who(t)} survived.`;
    },
    reminders: ['Jumped'],
  },

  vigormortis: {
    firstNight: null,
    otherNight: 30,
    setupNote: 'One fewer Outsider.',
    setupModifier: (c) => ({ ...c, townsfolk: c.townsfolk + 1, outsiders: Math.max(0, c.outsiders - 1) }),
    prompt: () => choose('Choose a player to kill', 1, false, false),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Vigormortis to choose a player.' };
      const isMinion = typeOf(t.character) === 'minion';
      return {
        text: impaired(p)
          ? `Vigormortis is drunk/poisoned: ${who(t)} survives.`
          : `${who(t)} dies.${isMinion ? ' They KEEP their ability, and one of their Townsfolk neighbours is poisoned.' : ''}`,
        notes: isMinion
          ? [`Pick which Townsfolk neighbour of ${t.name} is poisoned and mark them.`]
          : [],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Vigormortis ${who(p)} is drunk/poisoned: no kill.`;
      const isMinion = typeOf(t.character) === 'minion';
      const died = killPlayer(s, op, t, 'demon');
      if (!died) return `${who(t)} survived.`;
      if (!isMinion) return `${who(t)} was killed.`;
      addReminder(t, 'Keeps ability (Vigormortis)');
      const nb = nearestTownsfolkNeighbours(s, t.seat);
      if (nb.length) {
        poisonFrom(nb[0]!, 'Vigormortis');
        log(s, op, `Vigormortis kills Minion ${who(t)}; ${who(nb[0]!)} is poisoned`);
        return `${who(t)} died but keeps their ability; ${who(nb[0]!)} is poisoned. Change the poisoned neighbour if you prefer the other one.`;
      }
      return `${who(t)} died but keeps their ability.`;
    },
    reminders: ['Keeps ability (Vigormortis)', 'Poisoned by the Vigormortis'],
  },

  no_dashii: {
    firstNight: null,
    otherNight: 30,
    prompt: () => choose('Choose a player to kill', 1, false, false),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      const nb = nearestTownsfolkNeighbours(s, p.seat);
      return {
        text: t
          ? impaired(p)
            ? `No Dashii is drunk/poisoned: ${who(t)} survives.`
            : `${who(t)} dies.`
          : 'Waiting for the No Dashii to choose a player.',
        notes: [`Poisoned Townsfolk neighbours: ${nb.map(who).join(', ') || 'none'} (re-checked every night).`],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      // The poisoned neighbours are recomputed every night, because deaths move them.
      clearPoisonFrom(s, 'No Dashii');
      if (impaired(p)) return `No Dashii ${who(p)} is drunk/poisoned: no kill and no poison.`;
      const nb = nearestTownsfolkNeighbours(s, p.seat);
      for (const q of nb) poisonFrom(q, 'No Dashii');
      const died = killPlayer(s, op, t, 'demon');
      log(s, op, `No Dashii kills ${who(t)}; poisons ${nb.map(who).join(', ') || 'nobody'}`);
      return `${who(t)} ${died ? 'was killed' : 'survived'}. Poisoned: ${nb.map(who).join(', ') || 'nobody'}.`;
    },
    reminders: ['Poisoned by the No Dashii'],
  },

  vortox: {
    firstNight: null,
    otherNight: 30,
    prompt: () => choose('Choose a player to kill', 1, false, false),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      // The single most useful thing the Storyteller can see on this script: who must be lied to.
      const townsfolkWoke = s.nightQueue
        .filter((st) => st.seat !== null && st.kind !== 'dusk' && st.kind !== 'dawn')
        .map((st) => playerAt(s, st.seat!))
        .filter((q): q is PlayerState => !!q && typeOf(q.character) === 'townsfolk');
      return {
        text: t
          ? impaired(p)
            ? `Vortox is drunk/poisoned: ${who(t)} survives, and information is TRUE tonight.`
            : `${who(t)} dies.`
          : 'Waiting for the Vortox to choose a player.',
        notes: impaired(p)
          ? ['The Vortox is impaired: give TRUE information tonight.']
          : [
              `EVERY Townsfolk must receive FALSE information tonight: ${
                townsfolkWoke.map(who).join(', ') || 'none woke'
              }.`,
              'If nobody is executed today, evil wins — check it at the end of the day.',
            ],
      };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Vortox ${who(p)} is drunk/poisoned: no kill, and information is true tonight.`;
      return killPlayer(s, op, t, 'demon') ? `${who(t)} was killed.` : `${who(t)} survived.`;
    },
    nightNote: 'All Townsfolk information is false. If no execution happens on a day, evil wins.',
  },
};

// --------------------------------------------------------------------------------- script hooks

/**
 * Sects & Violets abilities that react to other players' events.
 *
 * The Vortox's "evil wins if nobody is executed" is raised as a Storyteller alert rather than
 * ending the game, because the engine must not declare a winner the Storyteller did not confirm
 * (the result-pending flow in deaths.ts exists for exactly this).
 */
export const SNV_HOOKS: ScriptHooks = {
  onAnyDeath: (s, op, dead, cause) => {
    // Witch: the curse is spent when the cursed player dies.
    if (dead.reminders.includes('Cursed')) removeReminder(dead, 'Cursed');
    // Evil Twin: executing the GOOD twin wins the game for evil.
    if ((cause === 'execution' || cause === 'virgin') && dead.reminders.includes('Good twin')) {
      alert(
        s,
        op,
        `The good twin ${who(dead)} was executed: evil wins. Confirm the result to end the game.`,
      );
    }
    log(s, op, `snv: watched death of ${who(dead)} (${cause})`);
  },
};
