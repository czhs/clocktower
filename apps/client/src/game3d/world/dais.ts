// v3 WP3 (v3-stage). Game view -> the 3D dais (docs/v3/INTEGRATION.md §3.2). Pure: no three, no vendor;
// the driver talks to the dais piece api ({setSeat, setPhase, setHand}) through the DaisApi interface.
//
//   - Stone of a seat = the server's circleSpots rule: the k-th seat (ascending) of n players sits on stone
//     round(k·15/n) % 15 (stoneOfSeatIndex, @ct/protocol), so the dais stones match the seat spots.
//   - setSeat(stone, {occupied, dead, ghostVote, nominated, onBlock, voteHand}) from players[] (PUBLIC alive
//     state: never the Grimoire) + day.nominations[last]; unused stones 'empty'.
//   - No auto-sweep: setPhase('vote', {from: nomineeStone, t0: −1e9, perSeat: 1}) makes the dais'
//     voteProgress reach every stone at once, so a stone's vote lamp lights exactly when its voteHand is set;
//     voteHand is set only once that voter's vote is resolved (votes[seat] === true).
//   - setHand(stone of currentVoterSeat) while voting, setHand(null) otherwise.
//   - Night (candle halos) follows the hour and is set by the time facade (vendor time.js applyHours).
import { stoneOfSeatIndex, type DayView, type NominationView, type PublicPlayerView } from '@ct/protocol';
import type { StagePhase } from './hour';

export const STONES = 15;
export type DaisPhase = 'day' | 'nomination' | 'vote' | 'execution' | 'night';

export interface DaisSeatState {
  occupied: true;
  dead: boolean;
  ghostVote: boolean;
  nominated: boolean;
  onBlock: boolean;
  voteHand: boolean;
}
export type DaisSeat = 'empty' | DaisSeatState;

export interface DaisVoteOpts {
  from: number;
  t0: number;
  perSeat: number;
}
export interface DaisPlan {
  phase: DaisPhase;
  /** setPhase options (vote only). */
  vote: DaisVoteOpts | null;
  /** Stone the long hand points at (null = the dais' own rest / execution pose). */
  hand: number | null;
  /** Per stone (15). */
  seats: DaisSeat[];
}

/** The game view fields the dais reads (both PlayerGameView and StorytellerGameView have them). */
export interface DaisGameInput {
  players: readonly Pick<PublicPlayerView, 'seat' | 'alive' | 'ghostVoteAvailable'>[];
  day: Pick<DayView, 'nominationsOpen' | 'nominations' | 'onTheBlock' | 'executedSeat'> | null;
}

/** seat -> stone for the current player list (null when the seat is not in the game). */
export function stoneMap(players: readonly { seat: number }[], stones = STONES): Map<number, number> {
  const seats = [...new Set(players.map((p) => p.seat))].sort((a, b) => a - b);
  const out = new Map<number, number>();
  seats.forEach((s, k) => out.set(s, stoneOfSeatIndex(k, seats.length, stones)));
  return out;
}

/** The last nomination of the day that is still relevant to draw. */
function lastNomination(day: DaisGameInput['day']): NominationView | null {
  const list = day?.nominations ?? [];
  return list.length ? list[list.length - 1]! : null;
}

export const VOTE_T0 = -1e9;

export function daisPlan(game: DaisGameInput | null, phase: StagePhase): DaisPlan {
  const seats: DaisSeat[] = Array.from({ length: STONES }, () => 'empty' as const);
  if (!game) return { phase: 'day', vote: null, hand: null, seats };
  const map = stoneMap(game.players);
  const day = phase === 'day' ? game.day : null;
  const nom = lastNomination(day);
  const active = nom && (nom.status === 'pending' || nom.status === 'voting') ? nom : null;
  const shownVotes = nom && (nom.status === 'voting' || nom.status === 'tallied') ? nom.votes : null;
  const executed = day?.executedSeat ?? null;
  const block = executed ?? day?.onTheBlock?.seat ?? null;
  for (const p of game.players) {
    const stone = map.get(p.seat);
    if (stone === undefined) continue;
    const dead = !p.alive;
    seats[stone] = {
      occupied: true,
      dead,
      ghostVote: dead && !!p.ghostVoteAvailable,
      nominated: !!active && active.nomineeSeat === p.seat && !dead,
      onBlock: block === p.seat,
      voteHand: !!shownVotes && shownVotes[p.seat] === true,
    };
  }
  let dp: DaisPhase = 'day';
  let vote: DaisVoteOpts | null = null;
  let hand: number | null = null;
  if (phase === 'night' || phase === 'first_night') dp = 'night';
  else if (phase === 'day') {
    if (executed !== null) dp = 'execution';
    else if (active?.status === 'voting') {
      dp = 'vote';
      vote = { from: map.get(active.nomineeSeat) ?? 0, t0: VOTE_T0, perSeat: 1 };
      hand = active.currentVoterSeat !== null ? (map.get(active.currentVoterSeat) ?? null) : null;
    } else if (active || day?.nominationsOpen) dp = 'nomination';
  }
  return { phase: dp, vote, hand, seats };
}

/** The dais piece api (vendor src/town/pieces/dais.js api). */
export interface DaisApi {
  setSeat(i: number, st: DaisSeat): void;
  setPhase(p: DaisPhase, opts?: DaisVoteOpts): void;
  setHand(i: number | null): void;
}

export interface DaisDriver {
  /** Apply a plan: only the stones / phase / hand that changed are written (setSeat repaints vertex colours). */
  apply(plan: DaisPlan): void;
  /** What the dais shows now (debug `dais()`). */
  readonly shown: DaisPlan | null;
  /** Number of api calls made (tests / debug). */
  readonly calls: number;
  /** Forget what is shown (after something else wrote the dais): the next apply writes everything. */
  invalidate(): void;
}

/**
 * A plan that shows every dais state at once (shader warm-up): occupied, dead with / without a ghost vote,
 * nominated, on the block, vote lamps, the long hand on a stone, phase vote. The first real vote otherwise
 * pays a one-off stall (measured: 17.7 s on SwiftShader) for parts the warm-up never drew.
 */
export function showcasePlan(phase: DaisPhase = 'vote'): DaisPlan {
  const seats: DaisSeat[] = Array.from({ length: STONES }, (_, i) => ({
    occupied: true as const,
    dead: i % 4 === 1 || i % 4 === 2,
    ghostVote: i % 4 === 1,
    nominated: i === 0,
    onBlock: i === 5,
    voteHand: i % 2 === 0,
  }));
  return { phase, vote: phase === 'vote' ? { from: 0, t0: VOTE_T0, perSeat: 1 } : null, hand: phase === 'vote' ? 3 : null, seats };
}

const seatKey = (s: DaisSeat) => (s === 'empty' ? 'e' : `${+s.dead}${+s.ghostVote}${+s.nominated}${+s.onBlock}${+s.voteHand}`);

export function createDaisDriver(api: DaisApi): DaisDriver {
  let shown: DaisPlan | null = null;
  const keys: (string | null)[] = Array.from({ length: STONES }, () => null);
  let phaseKey = '';
  let hand: number | null | undefined = undefined;
  let calls = 0;
  return {
    get shown() {
      return shown;
    },
    get calls() {
      return calls;
    },
    invalidate() {
      keys.fill(null);
      phaseKey = '';
      hand = undefined;
      shown = null;
    },
    apply(plan) {
      plan.seats.forEach((s, i) => {
        const k = seatKey(s);
        if (keys[i] === k) return;
        keys[i] = k;
        api.setSeat(i, s === 'empty' ? 'empty' : { ...s });
        calls++;
      });
      const pk = plan.vote ? `${plan.phase}|${plan.vote.from}` : plan.phase;
      if (pk !== phaseKey) {
        phaseKey = pk;
        if (plan.vote) api.setPhase(plan.phase, { ...plan.vote });
        else api.setPhase(plan.phase);
        calls++;
      }
      if (plan.hand !== hand) {
        hand = plan.hand;
        api.setHand(plan.hand);
        calls++;
      }
      shown = plan;
    },
  };
}

/** `__ctCamera.dais()` (§6.1): `{phase, hand, seats: [{stone, occupied, dead, voteHand}]}`. */
export function daisDebug(plan: DaisPlan | null): { phase: DaisPhase | null; hand: number | null; seats: { stone: number; occupied: boolean; dead: boolean; voteHand: boolean }[] } {
  if (!plan) return { phase: null, hand: null, seats: [] };
  return {
    phase: plan.phase,
    hand: plan.hand,
    seats: plan.seats.map((s, stone) => (s === 'empty' ? { stone, occupied: false, dead: false, voteHand: false } : { stone, occupied: true, dead: s.dead, voteHand: s.voteHand })),
  };
}
