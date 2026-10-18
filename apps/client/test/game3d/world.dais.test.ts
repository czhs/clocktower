// v3 WP3 (v3-stage). Game view -> dais calls (docs/v3/INTEGRATION.md §3.2): stone mapping (the server's
// circleSpots rule), seat states, the vote without the auto-sweep, the long hand, and the diffing driver.
import { describe, expect, it } from 'vitest';
import { stoneOfSeatIndex, type NominationView, type PublicPlayerView } from '@ct/protocol';
import { createDaisDriver, daisDebug, daisPlan, showcasePlan, stoneMap, STONES, VOTE_T0, type DaisApi, type DaisGameInput, type DaisSeat } from '../../src/game3d/world/dais';

const player = (seat: number, o: Partial<PublicPlayerView> = {}): DaisGameInput['players'][number] => ({ seat, alive: true, ghostVoteAvailable: true, ...o });
const players = (n: number) => Array.from({ length: n }, (_, i) => player(i));
const nomination = (o: Partial<NominationView>): NominationView => ({
  id: 'n1',
  nominatorSeat: 0,
  nomineeSeat: 1,
  status: 'pending',
  votes: {},
  currentVoterSeat: null,
  voteCount: 0,
  threshold: 3,
  ...o,
});
const game = (ps: DaisGameInput['players'], noms: NominationView[] = [], o: Partial<NonNullable<DaisGameInput['day']>> = {}): DaisGameInput => ({
  players: ps,
  day: { nominationsOpen: true, nominations: noms, onTheBlock: null, executedSeat: null, ...o },
});

function recorder() {
  const calls: (['setSeat', number, DaisSeat] | ['setPhase', string, unknown] | ['setHand', number | null])[] = [];
  const api: DaisApi = {
    setSeat: (i, st) => calls.push(['setSeat', i, st]),
    setPhase: (p, opts) => calls.push(['setPhase', p, opts]),
    setHand: (i) => calls.push(['setHand', i]),
  };
  return { api, calls };
}
const occupied = (seats: DaisSeat[]) => seats.map((s, i) => (s === 'empty' ? -1 : i)).filter((i) => i >= 0);

describe('stone mapping', () => {
  it('matches the server rule round(k·15/n) % 15 for every n = 5..15', () => {
    for (let n = 5; n <= 15; n++) {
      const m = stoneMap(players(n));
      for (let k = 0; k < n; k++) expect(m.get(k)).toBe(stoneOfSeatIndex(k, n, STONES));
      expect(new Set(m.values()).size).toBe(n); // never two seats on one stone
    }
  });
  it('uses the sorted seat index, not the seat number (gaps after a leave)', () => {
    const m = stoneMap([player(0), player(2), player(7), player(9), player(11)]);
    expect([...m.entries()]).toEqual([
      [0, 0],
      [2, 3],
      [7, 6],
      [9, 9],
      [11, 12],
    ]);
  });
});

describe('daisPlan + driver', () => {
  it('n = 5, day: the five stones 0,3,6,9,12 occupied, the rest empty, phase nomination (nominations open)', () => {
    const { api, calls } = recorder();
    const d = createDaisDriver(api);
    d.apply(daisPlan(game(players(5)), 'day'));
    const seatCalls = calls.filter((c) => c[0] === 'setSeat');
    expect(seatCalls).toHaveLength(15);
    expect(occupied(d.shown!.seats)).toEqual([0, 3, 6, 9, 12]);
    expect(seatCalls.find((c) => c[1] === 3)![2]).toEqual({ occupied: true, dead: false, ghostVote: false, nominated: false, onBlock: false, voteHand: false });
    expect(calls.filter((c) => c[0] === 'setPhase')).toEqual([['setPhase', 'nomination', undefined]]);
    expect(calls.filter((c) => c[0] === 'setHand')).toEqual([['setHand', null]]);
    // the same plan again writes nothing (setSeat repaints vertex colours: never per frame)
    const before = calls.length;
    d.apply(daisPlan(game(players(5)), 'day'));
    expect(calls.length).toBe(before);
  });

  it('n = 9, a vote: setPhase vote from the nominee stone with t0 in the past, hand on the current voter, voteHand only for resolved yes votes', () => {
    const ps = players(9);
    ps[4] = player(4, { alive: false, ghostVoteAvailable: true });
    ps[6] = player(6, { alive: false, ghostVoteAvailable: false });
    const g = game(ps, [nomination({ nomineeSeat: 2, status: 'voting', votes: { 3: true, 4: true, 5: false }, currentVoterSeat: 6 })]);
    const { api, calls } = recorder();
    const d = createDaisDriver(api);
    const plan = daisPlan(g, 'day');
    d.apply(plan);
    const m = stoneMap(ps); // 0,2,3,5,7,8,10,12,13
    expect([...m.values()]).toEqual([0, 2, 3, 5, 7, 8, 10, 12, 13]);
    expect(plan.phase).toBe('vote');
    expect(calls.filter((c) => c[0] === 'setPhase')).toEqual([['setPhase', 'vote', { from: m.get(2), t0: VOTE_T0, perSeat: 1 }]]);
    expect(calls.filter((c) => c[0] === 'setHand')).toEqual([['setHand', m.get(6)]]);
    const st = (seat: number) => plan.seats[m.get(seat)!] as Exclude<DaisSeat, 'empty'>;
    expect(st(2).nominated).toBe(true);
    expect(st(3).voteHand).toBe(true);
    expect(st(4)).toMatchObject({ dead: true, ghostVote: true, voteHand: true });
    expect(st(5).voteHand).toBe(false);
    expect(st(6)).toMatchObject({ dead: true, ghostVote: false, voteHand: false });
    // the next voter: only the hand and the newly resolved stone change
    calls.length = 0;
    d.apply(daisPlan(game(ps, [nomination({ nomineeSeat: 2, status: 'voting', votes: { 3: true, 4: true, 5: false, 6: true }, currentVoterSeat: 7 })]), 'day'));
    expect(calls).toEqual([
      ['setSeat', m.get(6), { occupied: true, dead: true, ghostVote: false, nominated: false, onBlock: false, voteHand: true }],
      ['setHand', m.get(7)],
    ]);
  });

  it('n = 15, execution and night: onBlock from the executed seat; night drops nominations and votes', () => {
    const ps = players(15);
    const tallied = nomination({ nomineeSeat: 7, status: 'tallied', votes: { 8: true, 9: true } });
    const exec = daisPlan(game(ps, [tallied], { onTheBlock: { seat: 7, votes: 8 }, executedSeat: 7 }), 'day');
    expect(exec.phase).toBe('execution');
    expect(occupied(exec.seats)).toHaveLength(15);
    expect((exec.seats[7] as Exclude<DaisSeat, 'empty'>).onBlock).toBe(true);
    expect((exec.seats[7] as Exclude<DaisSeat, 'empty'>).nominated).toBe(false); // tallied: no longer nominated
    expect((exec.seats[8] as Exclude<DaisSeat, 'empty'>).voteHand).toBe(true); // a tallied vote still shows
    expect(exec.hand).toBe(null);
    const night = daisPlan(game(ps, [tallied], { onTheBlock: { seat: 7, votes: 8 } }), 'night');
    expect(night.phase).toBe('night');
    expect(night.seats.every((s) => s !== 'empty' && !s.voteHand && !s.onBlock && !s.nominated)).toBe(true);
  });

  it('no game: every stone empty, day; pending nomination: phase nomination with the nominee marked', () => {
    const none = daisPlan(null, 'waiting');
    expect(none).toEqual({ phase: 'day', vote: null, hand: null, seats: Array.from({ length: 15 }, () => 'empty') });
    const p = daisPlan(game(players(7), [nomination({ nomineeSeat: 3 })], { nominationsOpen: false }), 'day');
    expect(p.phase).toBe('nomination');
    expect((p.seats[stoneOfSeatIndex(3, 7, 15)] as Exclude<DaisSeat, 'empty'>).nominated).toBe(true);
    expect(daisPlan(game(players(7), [], { nominationsOpen: false }), 'day').phase).toBe('day');
    expect(daisPlan(game(players(7)), 'bedtime').phase).toBe('day');
  });

  it('daisDebug: the §6.1 dais() shape', () => {
    const d = daisDebug(daisPlan(game(players(5)), 'day'));
    expect(d.phase).toBe('nomination');
    expect(d.seats).toHaveLength(15);
    expect(d.seats[3]).toEqual({ stone: 3, occupied: true, dead: false, voteHand: false });
    expect(d.seats[1]).toEqual({ stone: 1, occupied: false, dead: false, voteHand: false });
    expect(daisDebug(null)).toEqual({ phase: null, hand: null, seats: [] });
  });

  it('warm-up showcase shows every state, and invalidate() makes the next real plan rewrite everything', () => {
    const v = showcasePlan('vote');
    expect(v.phase).toBe('vote');
    expect(v.hand).not.toBe(null);
    const st = v.seats.filter((x): x is Exclude<DaisSeat, 'empty'> => x !== 'empty');
    expect(st).toHaveLength(15);
    for (const k of ['dead', 'ghostVote', 'nominated', 'onBlock', 'voteHand'] as const) expect(st.some((x) => x[k]), k).toBe(true);
    expect(st.some((x) => !x.dead)).toBe(true);
    expect(showcasePlan('night')).toMatchObject({ phase: 'night', vote: null, hand: null });
    const { api, calls } = recorder();
    const d = createDaisDriver(api);
    const real = daisPlan(game(players(5)), 'day');
    d.apply(real);
    d.apply(v);
    d.invalidate();
    calls.length = 0;
    d.apply(real);
    expect(calls.filter((c) => c[0] === 'setSeat')).toHaveLength(15);
    expect(calls.filter((c) => c[0] === 'setPhase')).toHaveLength(1);
    expect(calls.filter((c) => c[0] === 'setHand')).toEqual([['setHand', null]]);
  });
});
