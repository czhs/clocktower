import { killPlayer, proposeResult } from './deaths.js';
import { RuleError, type DayState, type GameState, type NominationState } from './types.js';
import {
  aliveCount,
  alert,
  announce,
  impaired,
  log,
  mustPlayer,
  publicAliveCount,
  seatsClockwiseFrom,
  typeOf,
  who,
  type Op,
} from './util.js';

export function newDay(): DayState {
  return {
    nominationsOpen: false,
    nominations: [],
    block: null,
    highWater: 0,
    executedSeat: null,
    executionOccurred: false,
    vote: null,
    nomSeq: 0,
  };
}

function day(s: GameState): DayState {
  if (s.phase !== 'day' || !s.day) throw new RuleError('phase', 'Only during the day');
  return s.day;
}

/** Minimum votes to put someone on the block: half the living players, rounded up. */
export function minVotes(s: GameState): number {
  return Math.ceil(publicAliveCount(s) / 2);
}

function findNomination(d: DayState, id: string): NominationState {
  const n = d.nominations.find((x) => x.id === id);
  if (!n) throw new RuleError('not_found', 'Unknown nomination');
  return n;
}

export function nominate(s: GameState, op: Op, nominatorSeat: number, nomineeSeat: number): void {
  const d = day(s);
  if (!d.nominationsOpen) throw new RuleError('phase', 'Nominations are not open');
  if (d.executionOccurred) throw new RuleError('phase', 'Someone has already been executed today');
  if (d.nominations.some((n) => n.status === 'pending' || n.status === 'voting'))
    throw new RuleError('phase', 'Another nomination is in progress');
  const nominator = mustPlayer(s, nominatorSeat);
  const nominee = mustPlayer(s, nomineeSeat);
  if (!nominator.publicAlive) throw new RuleError('forbidden', 'Dead players cannot nominate');
  if (nominator.nominatedToday) throw new RuleError('forbidden', 'You have already nominated today');
  if (nominee.wasNominatedToday) throw new RuleError('forbidden', 'That player has already been nominated today');
  nominator.nominatedToday = true;
  nominator.nominationsMade += 1;
  nominee.wasNominatedToday = true;
  const n: NominationState = {
    id: `d${s.dayNumber}-nom${++d.nomSeq}`,
    nominatorSeat,
    nomineeSeat,
    status: 'pending',
    votes: {},
    threshold: Math.max(minVotes(s), d.highWater + 1),
    voteCount: 0,
  };
  d.nominations.push(n);
  announce(s, op, 'nomination', `${nominator.name} nominates ${nominee.name}.`);
  log(s, op, `${who(nominator)} nominated ${who(nominee)}`);

  // Virgin: the first nomination spends the ability; a Townsfolk nominator is executed at once.
  // A dead Virgin has no ability.
  if (nominee.character === 'virgin' && nominee.alive && !nominee.abilityUsed) {
    nominee.abilityUsed = true;
    if (impaired(nominee)) {
      log(s, op, `Virgin ${who(nominee)} is drunk/poisoned: ability spent without effect`);
    } else if (typeOf(nominator.character) === 'townsfolk') {
      n.status = 'cancelled';
      executeNow(s, op, nominator.seat, 'virgin');
    } else if (nominator.character === 'spy' && !impaired(nominator) && s.adjudicator?.spyRegistersAsTownsfolk?.(nominator, nominee)) {
      // (auto-st) automatic games: the Spy registered as a Townsfolk.
      log(s, op, `Spy ${who(nominator)} registers as a Townsfolk for the Virgin`);
      n.status = 'cancelled';
      executeNow(s, op, nominator.seat, 'virgin');
    } else if (nominator.character === 'spy' && !impaired(nominator)) {
      alert(
        s,
        op,
        `Spy ${who(nominator)} nominated the Virgin: the Spy may register as a Townsfolk. Use "execute" on seat ${nominator.seat + 1} if you want the Virgin to trigger.`,
      );
    }
  }
}

export function startVote(s: GameState, op: Op, nominationId: string): void {
  const d = day(s);
  if (d.vote) throw new RuleError('phase', 'A vote is already running');
  const n = findNomination(d, nominationId);
  if (n.status !== 'pending') throw new RuleError('invalid', 'Nomination is not pending');
  n.status = 'voting';
  n.threshold = Math.max(minVotes(s), d.highWater + 1);
  d.vote = {
    nominationId,
    order: seatsClockwiseFrom(s, n.nomineeSeat),
    index: 0,
    nextAt: op.now + s.voteStepMs,
    // Hands raised while the nomination was pending carry over (gameplay B2).
    hands: (n.hands ?? []).filter((seat) => canVote(s, seat)),
  };
  delete n.hands;
  log(s, op, `Vote started on nomination ${n.id}`);
}

export function cancelNomination(s: GameState, op: Op, nominationId: string): void {
  const d = day(s);
  const n = findNomination(d, nominationId);
  if (n.status !== 'pending' && n.status !== 'voting') throw new RuleError('invalid', 'Nomination already finished');
  n.status = 'cancelled';
  if (d.vote?.nominationId === n.id) d.vote = null;
  const nominator = mustPlayer(s, n.nominatorSeat);
  const nominee = mustPlayer(s, n.nomineeSeat);
  nominator.nominatedToday = false;
  nominator.nominationsMade = Math.max(0, nominator.nominationsMade - 1);
  nominee.wasNominatedToday = false;
  announce(s, op, 'nomination', `The nomination of ${nominee.name} was withdrawn by the Storyteller.`);
}

function canVote(s: GameState, seat: number): boolean {
  const p = mustPlayer(s, seat);
  return p.publicAlive || p.ghostVoteAvailable;
}

/** Raise/lower a hand. Locked once the clock hand passes this seat. */
export function setHand(s: GameState, _op: Op, seat: number, nominationId: string, vote: boolean): void {
  const d = day(s);
  const v = d.vote;
  const n = findNomination(d, nominationId);
  // (gameplay B2) Before the clock starts, hands may be raised/lowered as soon as the nomination exists.
  if (n.status === 'pending' && (!v || v.nominationId !== nominationId)) {
    if (vote && !canVote(s, seat)) throw new RuleError('forbidden', 'Your ghost vote is already spent');
    n.hands = (n.hands ?? []).filter((x) => x !== seat);
    if (vote) n.hands.push(seat);
    return;
  }
  if (!v || v.nominationId !== nominationId) throw new RuleError('phase', 'No vote in progress for that nomination');
  if (seat in n.votes) throw new RuleError('forbidden', 'Your vote is already locked');
  if (vote && !canVote(s, seat)) throw new RuleError('forbidden', 'Your ghost vote is already spent');
  v.hands = v.hands.filter((x) => x !== seat);
  if (vote) v.hands.push(seat);
}

function lockVote(s: GameState, op: Op, n: NominationState, seat: number): void {
  const v = s.day!.vote!;
  const p = mustPlayer(s, seat);
  let yes = v.hands.includes(seat) && canVote(s, seat);
  // (auto-st) automatic games: a healthy Butler's vote only counts if their master votes too.
  if (yes && s.adjudicator?.enforceButler && p.character === 'butler' && p.alive && !impaired(p)) {
    const m = p.butlerMasterSeat;
    const masterVotes = m === null ? false : m in n.votes ? n.votes[m] === true : v.hands.includes(m);
    if (!masterVotes) {
      yes = false;
      log(s, op, `Butler ${who(p)} raised a hand without their master: the vote does not count`);
    }
  }
  n.votes[seat] = yes;
  v.hands = v.hands.filter((x) => x !== seat);
  if (!yes) return;
  n.voteCount += 1;
  if (!p.publicAlive) {
    p.ghostVoteAvailable = false;
    p.ghostVoteUsed = true;
  }
  if (p.character === 'butler' && p.alive && !impaired(p)) {
    const m = p.butlerMasterSeat;
    const masterVotes = m === null ? false : m in n.votes ? n.votes[m] === true : v.hands.includes(m);
    if (!masterVotes)
      alert(s, op, `Butler ${who(p)} voted although their master${m === null ? ' (none chosen)' : ` (seat ${m + 1})`} has not raised a hand.`);
  }
}

function tally(s: GameState, op: Op, n: NominationState): void {
  const d = s.day!;
  d.vote = null;
  n.status = 'tallied';
  const nominee = mustPlayer(s, n.nomineeSeat);
  const min = minVotes(s);
  const c = n.voteCount;
  n.minVotes = min;
  if (c >= min && c > d.highWater) {
    d.block = { seat: n.nomineeSeat, votes: c };
    d.highWater = c;
    announce(s, op, 'nomination', `${nominee.name} received ${c} votes and is about to be executed.`);
  } else if (c >= min && c === d.highWater) {
    d.block = null;
    announce(s, op, 'nomination', `${nominee.name} received ${c} votes: a tie. Nobody is about to be executed.`);
  } else {
    announce(s, op, 'nomination', `${nominee.name} received ${c} vote${c === 1 ? '' : 's'}: not enough.`);
  }
}

/** Advance the clock hand (call from tick). Returns true if anything changed. */
export function tickVote(s: GameState, op: Op): boolean {
  const v = s.day?.vote;
  // The clock hand waits while the ST reviews a detected game end.
  if (!v || s.phase !== 'day' || s.resultPending || v.pausedRemainingMs != null) return false;
  const n = findNomination(s.day!, v.nominationId);
  let changed = false;
  while (s.day?.vote === v && op.now >= v.nextAt) {
    const seat = v.order[v.index]!;
    lockVote(s, op, n, seat);
    v.index += 1;
    changed = true;
    if (v.index >= v.order.length) tally(s, op, n);
    else v.nextAt += s.voteStepMs;
  }
  return changed;
}

/** (gameplay) ST pauses / resumes the clock hand. */
export function pauseVoteClock(s: GameState, op: Op, pause: boolean): void {
  const v = s.day?.vote;
  if (!v) throw new RuleError('invalid', 'No vote is running');
  if (pause && v.pausedRemainingMs == null) {
    v.pausedRemainingMs = Math.max(0, v.nextAt - op.now);
    log(s, op, 'Vote clock paused');
  } else if (!pause && v.pausedRemainingMs != null) {
    v.nextAt = op.now + v.pausedRemainingMs;
    v.pausedRemainingMs = null;
    log(s, op, 'Vote clock resumed');
  }
}

/** Lock every remaining vote immediately (ST "close vote", and tests). */
export function finishVoteNow(s: GameState, op: Op): void {
  const v = s.day?.vote;
  if (!v) throw new RuleError('phase', 'No vote running');
  v.pausedRemainingMs = null;
  v.nextAt = op.now;
  while (s.day?.vote === v) {
    v.nextAt = op.now;
    tickVote(s, op);
  }
}

/** The day ends with `seat` on the block: they are executed (rules: no vote needed again). */
export function executeOnBlock(s: GameState, op: Op, seat: number): void {
  executeNow(s, op, seat, 'execution');
}

function executeNow(s: GameState, op: Op, seat: number, cause: 'execution' | 'virgin'): void {
  const d = s.day!;
  const p = mustPlayer(s, seat);
  d.executionOccurred = true;
  d.executedSeat = seat;
  d.block = null;
  d.nominationsOpen = false;
  d.vote = null;
  for (const n of d.nominations) if (n.status === 'pending' || n.status === 'voting') n.status = 'cancelled';
  p.executed = true;
  log(s, op, `${who(p)} executed (${cause})`);
  if (!p.alive) {
    announce(s, op, 'execution', `${p.name} is executed, but was already dead.`);
    return;
  }
  if (p.character === 'saint') {
    if (!impaired(p)) {
      killPlayer(s, op, p, cause, { raw: true });
      s.lastExecutedDiedSeat = seat;
      proposeResult(s, op, 'evil', 'The Saint was executed.');
      return;
    }
    alert(s, op, `Saint ${who(p)} was executed while drunk/poisoned: good does not lose.`);
  }
  killPlayer(s, op, p, cause);
  s.lastExecutedDiedSeat = seat;
}

export function execute(s: GameState, op: Op, seat: number | null): void {
  const d = day(s);
  if (d.executionOccurred) throw new RuleError('forbidden', 'Only one execution per day');
  if (d.vote) throw new RuleError('phase', 'Wait for the vote to finish');
  if (seat === null) {
    d.block = null;
    d.nominationsOpen = false;
    announce(s, op, 'execution', 'Nobody is executed today.');
    return;
  }
  executeNow(s, op, seat, 'execution');
}

export function slayerShot(s: GameState, op: Op, shooterSeat: number, targetSeat: number): void {
  day(s);
  const shooter = mustPlayer(s, shooterSeat);
  const target = mustPlayer(s, targetSeat);
  if (!shooter.publicAlive) throw new RuleError('forbidden', 'Dead players cannot shoot');
  if (shooter.slayerShotTaken) throw new RuleError('forbidden', 'You have already taken your shot');
  if (!target.publicAlive) throw new RuleError('invalid', 'That player is already dead');
  shooter.slayerShotTaken = true;
  announce(s, op, 'storyteller', `${shooter.name} claims to be the Slayer and shoots at ${target.name}…`);
  let killed = false;
  if (shooter.character === 'slayer' && !shooter.abilityUsed) {
    shooter.abilityUsed = true;
    if (!impaired(shooter)) {
      if (typeOf(target.character) === 'demon') {
        killed = killPlayer(s, op, target, 'slayer');
      } else if (target.character === 'recluse' && !impaired(target) && s.adjudicator?.recluseRegistersAsDemon?.(target, shooter)) {
        // (auto-st) automatic games: the Recluse registered as the Demon.
        log(s, op, `Recluse ${who(target)} registers as the Demon for the Slayer`);
        killed = killPlayer(s, op, target, 'slayer');
      } else if (target.character === 'recluse' && !impaired(target)) {
        alert(
          s,
          op,
          `Slayer shot the Recluse ${who(target)}: the Recluse may register as the Demon. Use "kill" (announce) if you rule that they die.`,
        );
      }
    } else log(s, op, `Slayer ${who(shooter)} is drunk/poisoned: shot wasted`);
  }
  if (!killed) announce(s, op, 'storyteller', 'Nothing happens.');
}

/** End-of-day Mayor check. Returns true if the game ended. */
export function mayorCheck(s: GameState, op: Op): boolean {
  if (!s.day || s.day.executionOccurred || s.day.mayorOverridden) return false;
  if (aliveCount(s) !== 3) return false;
  const mayor = s.players.find((p) => p.alive && p.character === 'mayor');
  if (!mayor) return false;
  if (impaired(mayor)) {
    alert(s, op, `Mayor ${who(mayor)} is drunk/poisoned: no Mayor win with three alive.`);
    return false;
  }
  proposeResult(s, op, 'good', MAYOR_WIN_REASON);
  return true;
}

export const MAYOR_WIN_REASON = 'Three players remain, nobody was executed, and the Mayor lives.';

/** Recompute today's block from the tallied nominations (after the ST struck a vote). */
function recomputeBlock(s: GameState): void {
  const d = s.day!;
  if (d.executionOccurred) return;
  let block: DayState['block'] = null;
  let high = 0;
  for (const n of d.nominations) {
    if (n.status !== 'tallied') continue;
    const min = n.minVotes ?? minVotes(s);
    if (n.voteCount >= min && n.voteCount > high) {
      block = { seat: n.nomineeSeat, votes: n.voteCount };
      high = n.voteCount;
    } else if (n.voteCount >= min && n.voteCount === high) block = null;
  }
  d.block = block;
  d.highWater = high;
}

/** ST: strike one counted vote (e.g. a Butler voting without their master). */
export function strikeVote(s: GameState, op: Op, nominationId: string, seat: number): void {
  const d = day(s);
  const n = findNomination(d, nominationId);
  if (n.status !== 'tallied' && n.status !== 'voting') throw new RuleError('invalid', 'That nomination has no counted votes');
  if (n.votes[seat] !== true) throw new RuleError('invalid', 'That player did not vote yes');
  const p = mustPlayer(s, seat);
  n.votes[seat] = false;
  n.voteCount -= 1;
  if (p.ghostVoteUsed && !p.publicAlive) {
    p.ghostVoteAvailable = true;
    p.ghostVoteUsed = false;
  }
  if (n.status === 'tallied') {
    if (d.executionOccurred) alert(s, op, 'A vote was struck after the execution: the execution stands.');
    recomputeBlock(s);
  }
  const nominee = mustPlayer(s, n.nomineeSeat);
  announce(s, op, 'nomination', `The Storyteller struck ${p.name}'s vote on ${nominee.name}: ${n.voteCount} vote${n.voteCount === 1 ? '' : 's'}.`);
  log(s, op, `Struck the vote of ${who(p)} on ${n.id}`);
}

// ------------------------------------------------------------------------------------------
// (gameplay 2026-10-15) Storyteller "props": overrides that ignore the usual day rules. The engine
// only advises (alerts); it never refuses these for rules reasons.

/** Refund ghost votes spent on a nomination (its votes are being discarded / re-run). */
function refundGhostVotes(s: GameState, n: NominationState): void {
  for (const [k, yes] of Object.entries(n.votes)) {
    if (!yes) continue;
    const p = mustPlayer(s, Number(k));
    if (!p.publicAlive && p.ghostVoteUsed) {
      p.ghostVoteAvailable = true;
      p.ghostVoteUsed = false;
    }
  }
}

/** Stop the running vote (if any): its nomination returns to 'pending' with its votes discarded. */
function abortRunningVote(s: GameState): NominationState | null {
  const d = s.day!;
  const v = d.vote;
  if (!v) return null;
  const n = findNomination(d, v.nominationId);
  refundGhostVotes(s, n);
  n.hands = [...v.hands]; // raised hands stay up for the re-run
  n.votes = {};
  n.voteCount = 0;
  n.status = 'pending';
  d.vote = null;
  return n;
}

/** ST: start a vote on any nomination (re-votes reset it); a running vote is stopped first. */
export function forceVote(s: GameState, op: Op, nominationId: string): void {
  const d = day(s);
  const n = findNomination(d, nominationId);
  const stopped = abortRunningVote(s);
  if (stopped && stopped !== n) alert(s, op, `The running vote on seat ${stopped.nomineeSeat + 1} was stopped (it is pending again).`);
  if (n.status === 'tallied' || n.status === 'cancelled') {
    if (n.status === 'tallied') refundGhostVotes(s, n);
    n.votes = {};
    n.voteCount = 0;
    n.status = 'pending';
    delete n.minVotes;
    mustPlayer(s, n.nominatorSeat).nominatedToday = true;
    mustPlayer(s, n.nomineeSeat).wasNominatedToday = true;
    recomputeBlock(s);
  }
  if (d.executionOccurred) alert(s, op, 'Someone was already executed today; this vote cannot put anyone on the block by the rules.');
  startVote(s, op, n.id);
  announce(s, op, 'nomination', `The Storyteller calls the vote on ${mustPlayer(s, n.nomineeSeat).name}.`);
}

/** ST: create a nomination ignoring who may nominate / be nominated (no Virgin trigger). */
export function createNomination(s: GameState, op: Op, nominatorSeat: number, nomineeSeat: number, start: boolean): NominationState {
  const d = day(s);
  const nominator = mustPlayer(s, nominatorSeat);
  const nominee = mustPlayer(s, nomineeSeat);
  if (start) {
    const stopped = abortRunningVote(s);
    if (stopped) alert(s, op, `The running vote on seat ${stopped.nomineeSeat + 1} was stopped (it is pending again).`);
  }
  nominator.nominatedToday = true;
  nominator.nominationsMade += 1;
  nominee.wasNominatedToday = true;
  const n: NominationState = {
    id: `d${s.dayNumber}-nom${++d.nomSeq}`,
    nominatorSeat,
    nomineeSeat,
    status: 'pending',
    votes: {},
    threshold: Math.max(minVotes(s), d.highWater + 1),
    voteCount: 0,
  };
  d.nominations.push(n);
  announce(s, op, 'nomination', `${nominator.name} nominates ${nominee.name}.`);
  log(s, op, `Storyteller recorded a nomination: ${who(nominator)} -> ${who(nominee)}`);
  if (nominee.character === 'virgin' && nominee.alive && !nominee.abilityUsed)
    alert(s, op, `${who(nominee)} is the Virgin: the Storyteller-made nomination does not trigger it; use force execute if it should.`);
  if (start) startVote(s, op, n.id);
  return n;
}

/** ST: end the running vote now: tally (lock every remaining hand) or cancel (discard, back to pending). */
export function closeVote(s: GameState, op: Op, mode: 'tally' | 'cancel'): void {
  const d = day(s);
  if (!d.vote) throw new RuleError('invalid', 'No vote is running');
  if (mode === 'tally') return finishVoteNow(s, op);
  const n = abortRunningVote(s)!;
  announce(s, op, 'nomination', `The Storyteller stopped the vote on ${mustPlayer(s, n.nomineeSeat).name}.`);
}

/** ST: put a player on the block with a vote count, or clear the block. */
export function setBlock(s: GameState, op: Op, seat: number | null, votes?: number): void {
  const d = day(s);
  if (seat === null) {
    d.block = null;
    announce(s, op, 'nomination', 'The Storyteller clears the block: nobody is about to be executed.');
    return;
  }
  const p = mustPlayer(s, seat);
  const count = votes ?? Math.max(d.highWater, d.block?.votes ?? 0, minVotes(s));
  d.block = { seat, votes: count };
  d.highWater = count;
  if (d.executionOccurred) alert(s, op, 'Someone was already executed today; the block will not be executed automatically.');
  announce(s, op, 'nomination', `The Storyteller places ${p.name} on the block (${count} vote${count === 1 ? '' : 's'}).`);
}

/** ST: set one recorded vote (yes adds a counted vote, no removes it). */
export function setVote(s: GameState, op: Op, nominationId: string, seat: number, vote: boolean): void {
  const d = day(s);
  const n = findNomination(d, nominationId);
  const p = mustPlayer(s, seat);
  const v = d.vote && d.vote.nominationId === n.id ? d.vote : null;
  if (v && !(seat in n.votes)) {
    // The clock hand has not reached this seat yet: raise/lower the hand for them.
    v.hands = v.hands.filter((x) => x !== seat);
    if (vote) v.hands.push(seat);
    log(s, op, `Storyteller ${vote ? 'raised' : 'lowered'} the hand of ${who(p)}`);
    return;
  }
  if (n.status !== 'tallied' && n.status !== 'voting') throw new RuleError('invalid', 'That nomination has no recorded votes');
  const was = n.votes[seat] === true;
  if (was === vote) return;
  n.votes[seat] = vote;
  n.voteCount += vote ? 1 : -1;
  if (!p.publicAlive) {
    if (vote) {
      p.ghostVoteAvailable = false;
      p.ghostVoteUsed = true;
    } else if (p.ghostVoteUsed) {
      p.ghostVoteAvailable = true;
      p.ghostVoteUsed = false;
    }
  }
  if (n.status === 'tallied') {
    if (d.executionOccurred) alert(s, op, 'A vote changed after the execution: the execution stands.');
    recomputeBlock(s);
  }
  const nominee = mustPlayer(s, n.nomineeSeat);
  announce(s, op, 'nomination', `The Storyteller recorded ${p.name}'s vote on ${nominee.name} as ${vote ? 'yes' : 'no'}: ${n.voteCount} vote${n.voteCount === 1 ? '' : 's'}.`);
}

/** ST: execute (or "nobody is executed") regardless of today's execution / a running vote / the phase. */
export function forceExecute(s: GameState, op: Op, seat: number | null): void {
  const d = s.day;
  if (!d || s.phase !== 'day') {
    if (seat === null) throw new RuleError('invalid', 'There is no day to end without an execution');
    const p = mustPlayer(s, seat);
    p.executed = true;
    log(s, op, `${who(p)} executed outside the day (Storyteller)`);
    if (!p.alive) announce(s, op, 'execution', `${p.name} is executed, but was already dead.`);
    else killPlayer(s, op, p, 'execution', { announce: true });
    s.lastExecutedDiedSeat = seat;
    return;
  }
  if (d.vote) abortRunningVote(s);
  if (seat === null) {
    d.block = null;
    d.nominationsOpen = false;
    for (const n of d.nominations) if (n.status === 'pending') n.status = 'cancelled';
    announce(s, op, 'execution', 'Nobody is executed today.');
    return;
  }
  if (d.executionOccurred) alert(s, op, 'A second execution today (Storyteller override).');
  executeNow(s, op, seat, 'execution');
}
