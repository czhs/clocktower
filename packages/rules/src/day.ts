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
    hands: [],
  };
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
  if (!v || v.nominationId !== nominationId) throw new RuleError('phase', 'No vote in progress for that nomination');
  const n = findNomination(d, nominationId);
  if (seat in n.votes) throw new RuleError('forbidden', 'Your vote is already locked');
  if (vote && !canVote(s, seat)) throw new RuleError('forbidden', 'Your ghost vote is already spent');
  v.hands = v.hands.filter((x) => x !== seat);
  if (vote) v.hands.push(seat);
}

function lockVote(s: GameState, op: Op, n: NominationState, seat: number): void {
  const v = s.day!.vote!;
  const p = mustPlayer(s, seat);
  const yes = v.hands.includes(seat) && canVote(s, seat);
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
  if (!v || s.phase !== 'day' || s.resultPending) return false;
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

/** Lock every remaining vote immediately (ST "close vote", and tests). */
export function finishVoteNow(s: GameState, op: Op): void {
  const v = s.day?.vote;
  if (!v) throw new RuleError('phase', 'No vote running');
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
