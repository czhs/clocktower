import type { Alignment, CharacterId, GameResult } from '@ct/protocol';
import { ROLES, SCRIPT_HOOKS } from './roles.js';
import type { KillPrevention } from './rolekit.js';
import type { GameState, PlayerState } from './types.js';
import {
  addReminder,
  aliveCount,
  charName,
  alert,
  announce,
  giveInfo,
  impaired,
  actingRole,
  isNightPhase,
  log,
  pick,
  sound,
  typeOf,
  who,
  type Op,
} from './util.js';

export type { DeathCause } from './rolekit.js';
import type { DeathCause } from './rolekit.js';

/**
 * Ask the victim's character whether it stops this kill (Soldier and friends). Pure: the engine
 * calls it both to preview the outcome for the Storyteller and to apply it.
 */
export function killPrevention(
  s: GameState,
  p: PlayerState,
  cause: DeathCause,
  opts: { preview?: boolean } = {},
): KillPrevention | null {
  const preview = opts.preview === true;
  const own = ROLES[p.character]?.preventsKill?.(s, p, cause, { preview });
  if (own) return own;
  for (const hooks of SCRIPT_HOOKS) {
    const blocked = hooks.preventsKill?.(s, p, cause, { preview });
    if (blocked) return blocked;
  }
  return null;
}

export interface KillOptions {
  /** Force the death to be public now (day deaths always are). */
  announce?: boolean;
  /** Skip Scarlet Woman / victory processing (raw ST correction). */
  raw?: boolean;
}

/** Whether a death right now becomes public immediately (day) or at the next dawn (night). */
function publicNow(s: GameState, opts: KillOptions): boolean {
  return opts.announce === true || !isNightPhase(s);
}

/**
 * Kill a player (no protection checks here — callers decide whether the kill lands).
 * Returns true if the player was alive and died.
 */
export function killPlayer(s: GameState, op: Op, p: PlayerState, cause: DeathCause, opts: KillOptions = {}): boolean {
  if (!p.alive) return false;
  // Single gate for every death that is not a raw Storyteller correction. Callers may also check
  // `killPrevention` first to show the Storyteller the outcome before committing (preview: true).
  if (!opts.raw && cause !== 'storyteller') {
    if (cause === 'demon' && p.protectedTonight) {
      log(s, op, `${who(p)} was protected and survived a Demon kill`);
      return false;
    }
    const blocked = killPrevention(s, p, cause);
    if (blocked) {
      log(s, op, `${who(p)} survived (${cause}): ${blocked.reason}`);
      return false;
    }
  }
  const aliveBefore = aliveCount(s);
  p.alive = false;
  p.died = true;
  log(s, op, `${who(p)} (${p.character}) died: ${cause}`);
  if (publicNow(s, opts)) publish(s, op, p, cause);
  // Abilities end on death.
  if (p.character === 'poisoner') endPoisonerPoison(s);
  if (p.character === 'monk') {
    for (const q of s.players) q.protectedTonight = false;
  }
  // Later night steps of a dead player no longer happen.
  for (const st of s.nightQueue) {
    if (st.seat === p.seat && (st.status === 'pending' || st.status === 'visiting') && st.kind !== 'ravenkeeper')
      st.status = 'skipped';
  }
  // Death-triggered abilities. Dispatched on the ACTING role, so a Drunk who believes they are
  // the Ravenkeeper still wakes (and learns nothing true).
  ROLES[actingRole(p)]?.onDeath?.(s, op, p, cause);
  // Script-level death watchers (the Minstrel reacting to a Minion's execution, and so on).
  for (const hooks of SCRIPT_HOOKS) hooks.onAnyDeath?.(s, op, p, cause);
  // Star-pass: the caller picks the successor and then checks victory itself.
  if (opts.raw || cause === 'starpass') return true;
  if (typeOf(p.character) === 'demon') demonDied(s, op, aliveBefore);
  checkVictory(s, op);
  return true;
}

/** Make a dead player's death public (announcement + toll). */
export function publish(s: GameState, op: Op, p: PlayerState, cause: DeathCause | 'night'): void {
  if (p.publicAlive === p.alive) return;
  p.publicAlive = p.alive;
  if (p.alive) {
    announce(s, op, 'storyteller', `${p.name} has returned to life.`);
    return;
  }
  const text =
    cause === 'execution'
      ? `${p.name} has been executed and is dead.`
      : cause === 'virgin'
        ? `${p.name} has been executed on the spot and is dead.`
        : cause === 'slayer'
          ? `${p.name} has been slain and is dead.`
          : `${p.name} is dead.`;
  announce(s, op, cause === 'execution' || cause === 'virgin' ? 'execution' : 'death', text);
  sound(op, 'toll');
}

/**
 * Turn a player into a Demon (`demonId`) and tell them privately. Used by the Imp's star-pass, the
 * Scarlet Woman, and any script's equivalent succession.
 */
export function becomeDemon(s: GameState, op: Op, p: PlayerState, demonId: CharacterId, why: string): void {
  // Losing the Minion character ends its ability at once (the Poisoner's victim recovers).
  if (p.character === 'poisoner') endPoisonerPoison(s);
  p.character = demonId;
  p.believedCharacter = demonId;
  p.alignment = 'evil';
  p.believedAlignment = 'evil';
  addReminder(p, `Became the ${charName(demonId)}`);
  // The new Imp no longer acts with their old (Minion) ability tonight.
  for (const st of s.nightQueue) {
    if (st.seat === p.seat && st.kind !== demonId && st.status !== 'resolved' && st.status !== 'skipped') {
      st.status = 'skipped';
      p.prompts = p.prompts.filter((q) => q.stepId !== st.id);
    }
  }
  giveInfo(s, p, { text: `You are now the ${charName(demonId)} (${why}).`, characters: [demonId] });
  log(s, op, `${who(p)} became the ${charName(demonId)}: ${why}`);
}

/** Back-compat alias (the records recorder matches on this log wording). */
export function becomeImp(s: GameState, op: Op, p: PlayerState, why: string): void {
  becomeDemon(s, op, p, 'imp', why);
}

/**
 * No Demon is alive any more (and it was not a star-pass). Offer every living character a chance
 * to take over (Scarlet Woman and any script's equivalent), in seat order.
 */
export function demonDied(s: GameState, op: Op, aliveBefore: number): void {
  if (s.players.some((p) => p.alive && typeOf(p.character) === 'demon')) return;
  for (const p of [...s.players].sort((a, b) => a.seat - b.seat)) {
    if (!p.alive) continue;
    if (ROLES[p.character]?.onDemonDeath?.(s, op, p, aliveBefore)) return;
  }
}

/**
 * Imp picked themself. The Imp dies; the Scarlet Woman (healthy, 5+ alive) has priority,
 * otherwise the ST's chosen Minion, otherwise a random living Minion.
 */
export function starPass(s: GameState, op: Op, imp: PlayerState, chosenSeat: number | undefined): string {
  const aliveBefore = aliveCount(s);
  killPlayer(s, op, imp, 'starpass');
  const minions = s.players.filter((p) => p.alive && typeOf(p.character) === 'minion');
  const sw = minions.find((p) => p.character === 'scarlet_woman' && !impaired(p));
  let successor: PlayerState | undefined;
  if (sw && aliveBefore >= 5) successor = sw;
  else if (chosenSeat !== undefined) successor = minions.find((p) => p.seat === chosenSeat);
  if (!successor && minions.length) successor = pick(s.rng, minions);
  if (!successor) {
    checkVictory(s, op);
    return `Imp ${who(imp)} killed themself with no living Minion: the Demon is gone.`;
  }
  // The successor becomes whatever Demon the dying player was.
  becomeDemon(s, op, successor, imp.character, 'the previous Imp passed the role to you');
  alert(
    s,
    op,
    `Imp self-kill: ${who(successor)} is now the Imp` +
      (successor === sw ? ' (Scarlet Woman priority).' : '. Use change_character if you prefer another Minion.'),
  );
  checkVictory(s, op);
  return `Imp ${who(imp)} killed themself; ${who(successor)} became the Imp.`;
}

export function endPoisonerPoison(s: GameState): void {
  for (const q of s.players) if (q.poisonedBy === 'poisoner') q.poisonedBy = null;
}

/** Automatic victory conditions (Saint and Mayor are checked where they trigger). */
export function checkVictory(s: GameState, op: Op): void {
  if (s.phase === 'finished' || !s.assigned) return;
  const demonAlive = s.players.some((p) => p.alive && typeOf(p.character) === 'demon');
  if (!demonAlive) {
    proposeResult(s, op, 'good', 'The Demon is dead.');
    return;
  }
  if (aliveCount(s) <= 2) proposeResult(s, op, 'evil', 'Only two players remain alive.');
}

function revealOf(s: GameState): GameResult['reveal'] {
  return s.players.map((p) => ({ seat: p.seat, pid: p.pid, name: p.name, character: p.character, alignment: p.alignment, alive: p.alive }));
}

/**
 * The engine detected a game-ending result. It is held for the Storyteller (confirm_result /
 * override_result) instead of ending the game irreversibly: players see nothing yet, and the ST
 * can still undo a mistaken command.
 */
export function proposeResult(s: GameState, op: Op, winner: Alignment, reason: string): void {
  if (s.phase === 'finished' || s.resultPending) return;
  s.resultPending = true;
  s.result = { winner, reason, reveal: revealOf(s) };
  alert(s, op, `Game end detected: ${winner === 'good' ? 'Good' : 'Evil'} wins (${reason}) Confirm to end the game, or override to continue.`);
}

export function finish(s: GameState, op: Op, winner: Alignment, reason: string): void {
  const prev = s.phase;
  s.phase = 'finished';
  s.phaseEndsAt = null;
  s.bedtimePausedRemainingMs = null;
  s.visitingSeat = null;
  if (s.day) {
    s.day.vote = null;
    // A vote/nomination interrupted by the end of the game never completes.
    for (const n of s.day.nominations) if (n.status === 'pending' || n.status === 'voting') n.status = 'cancelled';
  }
  for (const p of s.players) {
    p.publicAlive = p.alive;
    p.prompts = [];
  }
  s.endedAt = op.now;
  s.resultPending = false;
  s.result = { winner, reason, reveal: revealOf(s) };
  log(s, op, `Game over (${prev}): ${winner} wins — ${reason}`);
  announce(s, op, 'game_over', `${winner === 'good' ? 'Good' : 'Evil'} wins! ${reason}`);
}
