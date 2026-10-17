// Exile — the Traveller equivalent of an execution.
//
// An exile differs from an execution in every way that matters:
//
//   * ANYONE may vote, including dead players, and a dead player does NOT spend their ghost vote;
//   * a simple majority of the living is enough, and it is not compared against today's block, so
//     an exile never competes with (or blocks) a normal execution;
//   * at most one exile vote runs at a time, but an exile does not use up the day's execution;
//   * an exiled Traveller leaves the game: they are dead and their ability ends.
//
// Travellers also cannot be nominated for a normal execution — `canBeNominated` is the single
// place that rule lives, and day.ts consults it.
//
// This module is pure, like the rest of @ct/rules: it only reads and writes `GameState`.
import { CHARACTER_INFO, type CharacterId } from '@ct/protocol';
import { killPlayer } from './deaths.js';
import { RuleError, type GameState, type PlayerState } from './types.js';
import { addReminder, alert, announce, log, mustPlayer, publicAliveCount, who, type Op } from './util.js';

export interface ExileState {
  id: string;
  /** Seat of the Traveller being exiled. */
  travellerSeat: number;
  /** Seat of whoever called for the exile (the Storyteller may call it themselves: null). */
  callerSeat: number | null;
  status: 'pending' | 'voting' | 'tallied' | 'cancelled';
  /** seat -> vote. Dead players appear here too and keep their ghost vote. */
  votes: Record<number, boolean>;
  voteCount: number;
  /** Votes needed: more than half the LIVING players. */
  threshold: number;
  /** Raised hands not yet locked in. */
  hands: number[];
  exiled: boolean;
}

export const EXILE_REMINDER = 'Exiled';

/** Is this player a Traveller? */
export function isTravellerPlayer(p: PlayerState): boolean {
  return CHARACTER_INFO[p.character].type === 'traveller';
}

/** Travellers are exiled, never executed, so they may not be nominated. */
export function canBeNominated(p: PlayerState): boolean {
  return !isTravellerPlayer(p);
}

/** Living travellers currently in the game. */
export function travellersIn(s: GameState): PlayerState[] {
  return s.players.filter((p) => isTravellerPlayer(p));
}

/** Votes needed to exile: strictly more than half the living players. */
export function exileThreshold(s: GameState): number {
  return Math.floor(publicAliveCount(s) / 2) + 1;
}

function requireExileState(s: GameState): ExileState {
  if (!s.exile) throw new RuleError('not_found', 'No exile vote is running');
  return s.exile;
}

/**
 * Open an exile vote on a Traveller. Returns the new state. The Storyteller runs this; `callerSeat`
 * is recorded for the story but grants no special rights.
 */
export function callExile(s: GameState, op: Op, travellerSeat: number, callerSeat: number | null = null): ExileState {
  if (s.phase !== 'day') throw new RuleError('phase', 'Exiles happen during the day');
  const t = mustPlayer(s, travellerSeat);
  if (!isTravellerPlayer(t)) throw new RuleError('invalid', `${who(t)} is not a Traveller`);
  if (t.reminders.includes(EXILE_REMINDER)) throw new RuleError('invalid', `${who(t)} is already exiled`);
  if (s.exile && (s.exile.status === 'pending' || s.exile.status === 'voting'))
    throw new RuleError('phase', 'Another exile vote is in progress');
  s.exileSeq = (s.exileSeq ?? 0) + 1;
  const ex: ExileState = {
    id: `d${s.dayNumber}-exile${s.exileSeq}`,
    travellerSeat,
    callerSeat,
    status: 'pending',
    votes: {},
    voteCount: 0,
    threshold: exileThreshold(s),
    hands: [],
    exiled: false,
  };
  s.exile = ex;
  announce(s, op, 'nomination', `${t.name} is called to be exiled.`);
  log(s, op, `Exile called on ${who(t)}${callerSeat === null ? '' : ` by seat ${callerSeat + 1}`}`);
  return ex;
}

export function startExileVote(s: GameState, op: Op): void {
  const ex = requireExileState(s);
  if (ex.status !== 'pending') throw new RuleError('invalid', 'That exile vote is not pending');
  ex.status = 'voting';
  ex.threshold = exileThreshold(s);
  log(s, op, `Exile vote started on ${who(mustPlayer(s, ex.travellerSeat))}`);
}

/**
 * Raise or lower a hand in an exile vote. EVERY player may vote, alive or dead, and a dead player
 * does not spend their ghost vote — that is the whole point of an exile.
 */
export function setExileHand(s: GameState, _op: Op, seat: number, vote: boolean): void {
  const ex = requireExileState(s);
  if (ex.status !== 'pending' && ex.status !== 'voting') throw new RuleError('invalid', 'That exile vote is finished');
  mustPlayer(s, seat); // validates the seat
  if (seat in ex.votes) throw new RuleError('forbidden', 'Your vote is already locked');
  ex.hands = ex.hands.filter((x) => x !== seat);
  if (vote) ex.hands.push(seat);
}

/** Lock every hand and decide the outcome. */
export function tallyExile(s: GameState, op: Op): ExileState {
  const ex = requireExileState(s);
  if (ex.status === 'tallied' || ex.status === 'cancelled') throw new RuleError('invalid', 'That exile vote is finished');
  for (const p of s.players) {
    if (p.seat in ex.votes) continue;
    ex.votes[p.seat] = ex.hands.includes(p.seat);
  }
  ex.voteCount = Object.values(ex.votes).filter(Boolean).length;
  ex.hands = [];
  ex.status = 'tallied';
  ex.threshold = exileThreshold(s);
  const t = mustPlayer(s, ex.travellerSeat);
  if (ex.voteCount >= ex.threshold) {
    ex.exiled = true;
    exilePlayer(s, op, ex.travellerSeat);
    announce(s, op, 'execution', `${t.name} received ${ex.voteCount} votes and is exiled.`);
  } else {
    announce(s, op, 'nomination', `${t.name} received ${ex.voteCount} vote${ex.voteCount === 1 ? '' : 's'}: not enough to exile.`);
  }
  log(s, op, `Exile vote on ${who(t)} tallied: ${ex.voteCount}/${ex.threshold}`);
  return ex;
}

export function cancelExile(s: GameState, op: Op): void {
  const ex = requireExileState(s);
  if (ex.status === 'tallied') throw new RuleError('invalid', 'That exile already happened');
  ex.status = 'cancelled';
  announce(s, op, 'nomination', 'The Storyteller withdrew the exile.');
  log(s, op, 'Exile cancelled');
}

/**
 * Remove a Traveller from the game. Exile is not a death caused by a character, so it uses a `raw`
 * kill: no protection applies and no death-triggered ability fires.
 */
export function exilePlayer(s: GameState, op: Op, seat: number): void {
  const t = mustPlayer(s, seat);
  if (!isTravellerPlayer(t)) throw new RuleError('invalid', `${who(t)} is not a Traveller`);
  addReminder(t, EXILE_REMINDER);
  killPlayer(s, op, t, 'storyteller', { raw: true, announce: true });
  t.publicAlive = false;
  // An exiled Traveller is out of the game entirely: no ghost vote, no outstanding prompts.
  t.ghostVoteAvailable = false;
  t.prompts = [];
  for (const st of s.nightQueue) {
    if (st.seat === seat && st.status !== 'resolved') st.status = 'skipped';
  }
  log(s, op, `${who(t)} (${t.character}) was exiled`);
  alert(s, op, `${who(t)} is exiled and out of the game.`);
}

/**
 * Add a Traveller to a game in progress. Travellers sit outside the setup distribution, so this
 * does not touch the townsfolk/outsider/minion/demon counts.
 */
export function addTraveller(
  s: GameState,
  op: Op,
  seat: number,
  character: CharacterId,
  alignment: 'good' | 'evil',
): void {
  const p = mustPlayer(s, seat);
  if (CHARACTER_INFO[character].type !== 'traveller')
    throw new RuleError('invalid', `${CHARACTER_INFO[character].name} is not a Traveller`);
  p.character = character;
  p.startingCharacter = character;
  p.believedCharacter = character;
  p.alignment = alignment;
  p.believedAlignment = alignment;
  p.reminders = [];
  addReminder(p, `Traveller (${alignment})`);
  log(s, op, `${who(p)} joined as the ${CHARACTER_INFO[character].name} (${alignment})`);
  announce(s, op, 'storyteller', `${p.name} joins the town as a Traveller.`);
}
