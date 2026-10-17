// Trouble Brewing — the original 22 characters.
//
// Moved out of roles.ts by the multi-script work. The TB behaviours that the engine used to
// hardcode (Soldier safety, Virgin, Saint, Mayor, Scarlet Woman, Baron setup, Ravenkeeper's death
// wake) are now declared here as hooks, so the engine has no character-specific branches left and
// other scripts get the same machinery for free.
import { becomeDemon, killPlayer, killPrevention, proposeResult, starPass } from '../deaths.js';
import { executeOnTheSpot, MAYOR_WIN_REASON } from '../day.js';
import { insertDynamicStep } from '../night.js';
import {
  choose,
  chosen,
  isEvilTruth,
  pairPick,
  pairSuggestion,
  target,
  type ScriptRoleDefs,
} from '../rolekit.js';
import { RuleError, type GameState } from '../types.js';
import {
  aliveCount,
  alert,
  charName,
  impaired,
  isNightPhase,
  livingNeighbours,
  log,
  playerAt,
  registrationNotes,
  typeOf,
  who,
} from '../util.js';

export const TB_ROLES: ScriptRoleDefs = {
  // ------------------------------------------------------------------------- Townsfolk
  washerwoman: {
    firstNight: 40,
    otherNight: null,
    prepare: (s, p, rng) => pairPick(s, p, rng, 'townsfolk'),
    suggest: (s, _p, step) => pairSuggestion(s, step, 'There are no other Townsfolk in play.'),
    infoOnly: true,
  },
  librarian: {
    firstNight: 41,
    otherNight: null,
    prepare: (s, p, rng) => pairPick(s, p, rng, 'outsider'),
    suggest: (s, _p, step) => pairSuggestion(s, step, 'There are no Outsiders in play.'),
    infoOnly: true,
  },
  investigator: {
    firstNight: 42,
    otherNight: null,
    prepare: (s, p, rng) => pairPick(s, p, rng, 'minion'),
    suggest: (s, _p, step) => pairSuggestion(s, step, 'There are no Minions in play.'),
    infoOnly: true,
  },
  chef: {
    firstNight: 43,
    otherNight: null,
    suggest: (s) => {
      const seats = [...s.players].sort((a, b) => a.seat - b.seat);
      let pairs = 0;
      for (let i = 0; i < seats.length; i++) {
        const a = seats[i]!;
        const b = seats[(i + 1) % seats.length]!;
        if (isEvilTruth(a) && isEvilTruth(b)) pairs++;
      }
      const text = `${pairs} pair${pairs === 1 ? '' : 's'} of evil players sit next to each other.`;
      return { text: `Chef number: ${pairs}`, info: { text, number: pairs }, notes: registrationNotes(s) };
    },
    infoOnly: true,
  },
  empath: {
    firstNight: 44,
    otherNight: 44,
    suggest: (s, p) => {
      const nb = livingNeighbours(s, p.seat);
      const n = nb.filter(isEvilTruth).length;
      const text = `${n} of your living neighbours ${n === 1 ? 'is' : 'are'} evil.`;
      return {
        text: `Empath number: ${n} (neighbours ${nb.map(who).join(', ') || 'none'})`,
        info: { text, number: n },
        notes: registrationNotes(s, nb),
      };
    },
    infoOnly: true,
  },
  fortune_teller: {
    firstNight: 45,
    otherNight: 45,
    wantsRedHerring: true,
    reminders: ['Red herring'],
    prompt: () => choose('Choose two players', 2, true, true, 'Learn whether either of them is the Demon.'),
    suggest: (s, _p, step) => {
      const picks = chosen(s, step);
      if (picks.length < 2) return { text: 'Waiting for the Fortune Teller to choose two players.' };
      const yes = picks.some((q) => typeOf(q.character) === 'demon' || q.seat === s.redHerringSeat);
      const herring = picks.some((q) => q.seat === s.redHerringSeat);
      const text = yes ? 'Yes — one of them is the Demon.' : 'No — neither of them is the Demon.';
      return {
        text: `Fortune Teller: ${yes ? 'YES' : 'NO'}${herring ? ' (red herring chosen)' : ''}`,
        info: { text, yes, seats: picks.map((q) => q.seat) },
        notes: registrationNotes(s, picks),
      };
    },
    infoOnly: true,
  },
  undertaker: {
    firstNight: null,
    otherNight: 46,
    wakes: (s) => s.lastExecutedDiedSeat !== null,
    suggest: (s) => {
      const x = s.lastExecutedDiedSeat === null ? undefined : playerAt(s, s.lastExecutedDiedSeat);
      if (!x) return { text: 'Nobody died by execution today.' };
      const text = `The player executed today was the ${charName(x.character)}.`;
      return {
        text: `Undertaker: ${who(x)} was the ${charName(x.character)}`,
        info: { text, seats: [x.seat], characters: [x.character] },
        notes: registrationNotes(s, [x]),
      };
    },
    infoOnly: true,
  },
  monk: {
    firstNight: null,
    otherNight: 25,
    prompt: () => choose('Choose a player to protect', 1, false, false),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      return { text: t ? `Protect ${who(t)} from the Demon tonight.` : 'Waiting for the Monk to choose a player.' };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (t === p) throw new RuleError('invalid', 'The Monk cannot protect themself');
      if (impaired(p)) return `Monk ${who(p)} is drunk/poisoned: ${who(t)} is not protected.`;
      t.protectedTonight = true;
      log(s, op, `Monk protects ${who(t)}`);
      return `${who(t)} is protected tonight.`;
    },
  },
  ravenkeeper: {
    firstNight: null,
    otherNight: null,
    dynamicOrder: 35,
    // Killed by the Demon at night -> wake them to learn a character.
    onDeath: (s, op, p, cause) => {
      if (cause !== 'demon' || !isNightPhase(s)) return;
      insertDynamicStep(s, p.seat, 'ravenkeeper');
      alert(s, op, `Ravenkeeper ${who(p)} was killed by the Demon: wake them to choose a player.`);
    },
    prompt: () => choose('Choose a player', 1, true, true, 'You died tonight. Learn the character of one player.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Ravenkeeper to choose a player.' };
      const text = `${t.name} is the ${charName(t.character)}.`;
      return {
        text: `Ravenkeeper: ${who(t)} is the ${charName(t.character)}`,
        info: { text, seats: [t.seat], characters: [t.character] },
        notes: registrationNotes(s, [t]),
      };
    },
    infoOnly: true,
  },
  virgin: {
    firstNight: null,
    otherNight: null,
    reminders: ['Ability used'],
    // The first nomination spends the ability; a Townsfolk nominator is executed on the spot.
    onNominated: (s, op, p, nominator) => {
      if (!p.alive || p.abilityUsed) return;
      p.abilityUsed = true;
      if (impaired(p)) {
        log(s, op, `Virgin ${who(p)} is drunk/poisoned: ability spent without effect`);
        return;
      }
      if (typeOf(nominator.character) === 'townsfolk') {
        executeOnTheSpot(s, op, nominator.seat);
        return 'cancelled';
      }
      if (nominator.character === 'spy' && !impaired(nominator)) {
        alert(
          s,
          op,
          `Spy ${who(nominator)} nominated the Virgin: the Spy may register as a Townsfolk. Use "execute" on seat ${nominator.seat + 1} if you want the Virgin to trigger.`,
        );
      }
      return;
    },
  },
  slayer: {
    firstNight: null,
    otherNight: null,
    reminders: ['Ability used'],
    dayAbility: {
      label: 'Slayer shot',
      resolve: (s, op, shooter, t) => {
        if (shooter.abilityUsed) return 'Nothing happens.';
        shooter.abilityUsed = true;
        if (impaired(shooter)) {
          log(s, op, `Slayer ${who(shooter)} is drunk/poisoned: shot wasted`);
          return 'Nothing happens.';
        }
        if (typeOf(t.character) === 'demon') {
          killPlayer(s, op, t, 'slayer');
          return `${t.name} has been slain and is dead.`;
        }
        if (t.character === 'recluse' && !impaired(t)) {
          alert(
            s,
            op,
            `Slayer shot the Recluse ${who(t)}: the Recluse may register as the Demon. Use "kill" (announce) if you rule that they die.`,
          );
        }
        return 'Nothing happens.';
      },
    },
  },
  soldier: {
    firstNight: null,
    otherNight: null,
    // Safe from the Demon (not from execution, the Slayer, or a Storyteller kill).
    preventsKill: (_s, p, cause) =>
      cause === 'demon' && !impaired(p) ? { reason: `${who(p)} is the Soldier and survives.` } : null,
  },
  mayor: {
    firstNight: null,
    otherNight: null,
    nightNote: 'A Demon kill on the Mayor may be bounced to another player (resolve with redirectSeat).',
    // Three alive, no execution, healthy Mayor -> good wins.
    onEndOfDay: (s, op, p) => {
      if (aliveCount(s) !== 3) return false;
      if (impaired(p)) {
        alert(s, op, `Mayor ${who(p)} is drunk/poisoned: no Mayor win with three alive.`);
        return false;
      }
      proposeResult(s, op, 'good', MAYOR_WIN_REASON);
      return true;
    },
  },
  // -------------------------------------------------------------------------- Outsiders
  butler: {
    firstNight: 50,
    otherNight: 50,
    prompt: () => choose('Choose your master', 1, false, true, 'Tomorrow you may only vote if your master votes too.'),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      return { text: t ? `Butler's master: ${who(t)}` : 'Waiting for the Butler to choose a master.' };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (t === p) throw new RuleError('invalid', 'The Butler cannot choose themself');
      p.butlerMasterSeat = t.seat;
      log(s, op, `Butler ${who(p)} chose master ${who(t)}`);
      return `Master: ${who(t)}.`;
    },
  },
  drunk: {
    firstNight: null,
    otherNight: null,
    believesOther: 'townsfolk',
    reminders: ['Is the Drunk'],
    setupNote: 'Believes they are a Townsfolk that is not in play; their ability never works.',
  },
  recluse: {
    firstNight: null,
    otherNight: null,
    nightNote: 'May register as evil, or as a Minion or the Demon, even when dead.',
  },
  saint: {
    firstNight: null,
    otherNight: null,
    // Executed -> good loses (unless the Saint is drunk or poisoned).
    onExecuted: (s, op, p, cause) => {
      if (impaired(p)) {
        alert(s, op, `Saint ${who(p)} was executed while drunk/poisoned: good does not lose.`);
        return;
      }
      killPlayer(s, op, p, cause, { raw: true });
      s.lastExecutedDiedSeat = p.seat;
      proposeResult(s, op, 'evil', 'The Saint was executed.');
      return 'handled';
    },
  },
  // ---------------------------------------------------------------------------- Minions
  poisoner: {
    firstNight: 20,
    otherNight: 20,
    prompt: () => choose('Choose a player to poison', 1, true, false),
    suggest: (s, _p, step) => {
      const [t] = chosen(s, step);
      return { text: t ? `Poison ${who(t)} (tonight and tomorrow).` : 'Waiting for the Poisoner to choose a player.' };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Poisoner ${who(p)} is poisoned/drunk: no effect.`;
      for (const q of s.players) if (q.poisonedBy === 'poisoner') q.poisonedBy = null;
      if (t.poisonedBy === null) t.poisonedBy = 'poisoner';
      log(s, op, `Poisoner poisons ${who(t)}`);
      return `${who(t)} is poisoned.`;
    },
  },
  spy: {
    firstNight: 60,
    otherNight: 60,
    suggest: (s, p) => ({
      text: 'Resolve to show the Spy the Grimoire (a snapshot appears in their HUD).',
      notes: impaired(p) ? [`Spy ${who(p)} is poisoned: you may skip instead.`] : [],
    }),
    resolve: (s, op, p) => {
      p.spyGrimoire = {
        night: s.nightNumber,
        entries: s.players.map((q) => ({
          seat: q.seat,
          name: q.name,
          character: q.character,
          alignment: q.alignment,
          alive: q.alive,
          poisoned: q.poisonedBy !== null,
          drunk: q.character === 'drunk' || q.drunkOverride,
          reminders: [...q.reminders],
        })),
      };
      log(s, op, `Spy ${who(p)} saw the Grimoire`);
      return 'Grimoire shown to the Spy.';
    },
  },
  scarlet_woman: {
    firstNight: null,
    otherNight: null,
    reminders: ['Became the Demon'],
    // 5+ alive when the Demon dies -> she becomes the Demon.
    onDemonDeath: (s, op, p, aliveBefore) => {
      if (aliveBefore < 5) return false;
      if (impaired(p)) {
        alert(s, op, `Scarlet Woman ${who(p)} is drunk/poisoned and does not become the Demon.`);
        return false;
      }
      becomeDemon(s, op, p, 'imp', 'the Demon died and the Scarlet Woman took its place');
      alert(s, op, `Scarlet Woman ${who(p)} became the Imp (${aliveBefore} players were alive).`);
      return true;
    },
  },
  baron: {
    firstNight: null,
    otherNight: null,
    setupNote: 'Two extra Outsiders, two fewer Townsfolk.',
    setupModifier: (c) => ({ ...c, townsfolk: c.townsfolk - 2, outsiders: c.outsiders + 2 }),
  },
  // ------------------------------------------------------------------------------ Demon
  imp: {
    firstNight: null,
    otherNight: 30,
    prompt: () => choose('Choose a player to kill', 1, true, true),
    suggest: (s, p, step) => {
      const [t] = chosen(s, step);
      if (!t) return { text: 'Waiting for the Imp to choose a player.' };
      const notes: string[] = [];
      let text: string;
      if (impaired(p)) text = `Imp is poisoned: ${who(t)} survives.`;
      else if (t === p) {
        const sw = s.players.find((q) => q.alive && q.character === 'scarlet_woman' && !impaired(q));
        const alive = s.players.filter((q) => q.alive).length;
        text = `Imp self-kill: a Minion becomes the Imp${sw && alive >= 5 ? ` (Scarlet Woman ${who(sw)} has priority)` : ''}.`;
        notes.push('Pass starpassSeat when resolving to choose which Minion becomes the Imp.');
      } else if (!t.alive) text = `${who(t)} is already dead: nothing happens.`;
      else if (t.protectedTonight) text = `${who(t)} is protected by the Monk: nobody dies.`;
      else if (killPrevention(s, t, 'demon', { preview: true }))
        text = `${killPrevention(s, t, 'demon', { preview: true })!.reason} Nobody dies.`;
      else if (t.character === 'mayor' && !impaired(t)) {
        text = `${who(t)} is the Mayor: they die unless you bounce the kill.`;
        notes.push('Pass redirectSeat when resolving to have another player die instead.');
      } else text = `${who(t)} dies.`;
      return { text, notes };
    },
    resolve: (s, op, p, step, input) => {
      const t = target(s, input, step);
      if (impaired(p)) return `Imp ${who(p)} is poisoned: no kill.`;
      if (t === p) {
        if (p.protectedTonight) return `Imp ${who(p)} chose themself but is protected by the Monk.`;
        return starPass(s, op, p, input.starpassSeat);
      }
      if (!t.alive) return `${who(t)} was already dead.`;
      if (t.protectedTonight) return `${who(t)} was protected by the Monk.`;
      const blocked = killPrevention(s, t, 'demon');
      if (blocked) return blocked.reason;
      let victim = t;
      if (t.character === 'mayor' && !impaired(t) && input.redirectSeat !== undefined) {
        const r = playerAt(s, input.redirectSeat);
        if (!r) throw new RuleError('not_found', 'Redirect seat is not a player');
        if (!r.alive) return `Mayor's kill bounced to ${who(r)}, who was already dead.`;
        // Still a Demon kill: the Monk's protection and a healthy Soldier stop it.
        if (r.protectedTonight) return `Mayor's kill bounced to ${who(r)}, who is protected by the Monk: nobody dies.`;
        const rBlocked = killPrevention(s, r, 'demon');
        if (rBlocked) return `Mayor's kill bounced to ${who(r)}: ${rBlocked.reason}`;
        victim = r;
      }
      killPlayer(s, op, victim, 'demon');
      return victim === t ? `${who(t)} was killed.` : `Mayor bounce: ${who(victim)} was killed instead of ${who(t)}.`;
    },
  },
};
