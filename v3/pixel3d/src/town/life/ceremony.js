// life ceremony (owner: life agent): a demo of the voting ceremony on the dais, driven through the dais API
// (setSeat / setPhase / setNight, docs/TOWN.md §4) as a pure function of t: every frame the full dais state for t is
// re-applied (seats + phase), then the dais' own update(t) is re-run so the state shows in the same frame.
//
// Script (seconds from t0):
//   0.0  day; 8 villagers already sit; -3.6..2.7: the town takes its seats one by one, clockwise from XII (each seat's
//        candle catches with a spark pop); seats 3 and 11 are the dead (ghost-lights)
//   8.0  nomination: seat 6 is nominated (ember halo), the braziers rise, an ember burst
//  11.0  the vote: the brass hand sweeps clockwise from the nominee one seat per 0.55 s; raised hands glow gold
//  19.8  the tally; 21.0 execution: the braziers FLARE (embers from all four), the crows burst off the lectern
//  25.0  the nominee's candle goes out (dead); 27.0 night: coals, the grimoire glows
import { held } from './util.js';

const N = 15;
export const CEREMONY = {
  // fill starts BEFORE t 0 (art-director round: an empty ring at t 0-2 read as 'nobody in the seats'): 8 seats are
  // taken at t 0, the remaining ones catch one by one until t 2.7
  fill: -3.6, per: 0.45, dead: [3, 11], ghost: { 3: true, 11: false }, nominee: 6,
  voters: [7, 9, 10, 12, 0, 1, 2, 4], nominate: 8.0, vote: 11.0, perSeat: 0.55, tally: 19.8, execute: 21.0, die: 25.0, night: 27.0,
  order: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 3, 11],
};

export function createCeremony(registry, { t0 = 0, toEngine = (tl) => tl, seatTimes = {} } = {}) {
  const dais = registry.get('dais');
  const api = dais?.api;
  const C = CEREMONY;
  // seats owned by a walking villager catch when the walker steps onto the stone (seatTimes: {seat: life t})
  const seatTime = new Map(C.order.map((s, k) => [s, seatTimes[s] ?? t0 + C.fill + k * C.per]));
  const phases = [[-1e9, 'day'], [t0 + C.nominate, 'nomination'], [t0 + C.vote, 'vote'], [t0 + C.execute, 'execution'], [t0 + C.night, 'night']];
  const flares = [t0 + C.nominate, t0 + C.vote, t0 + C.execute, t0 + C.execute + 1.6];
  let lastKey = null;
  function seatState(i, t) {
    const ts = seatTime.get(i);
    if (t < ts) return 'empty';
    if (C.dead.includes(i)) return { dead: true, ghostVote: C.ghost[i] };
    const st = {};
    if (i === C.nominee && t >= t0 + C.nominate) {
      if (t >= t0 + C.die) return { dead: true, ghostVote: true };
      st.nominated = true;
      if (t >= t0 + C.tally) st.onBlock = true;
    }
    if (C.voters.includes(i) && t >= t0 + C.vote) st.voteHand = true;
    return st;
  }
  return {
    seatTime, flares, script: C, t0,
    phaseAt: (t) => held(phases, t),
    seatState: (i, t) => seatState(i, t),
    /** life time the brass hand reaches seat i in the vote sweep (dais: seat from + j at vote + (j - 1) * perSeat). */
    reachTime: (i) => t0 + C.vote + (((i - C.nominee + N) % N) - 1) * C.perSeat,
    update(t, engineT) {
      if (!api?.setSeat) return;
      const ph = held(phases, t);
      const key = [ph, ...Array.from({ length: N }, (_, i) => JSON.stringify(seatState(i, t)))].join('|');
      if (key !== lastKey) {
        lastKey = key;
        for (let i = 0; i < N; i++) api.setSeat(i, seatState(i, t));
        if (ph === 'vote') api.setPhase('vote', { from: C.nominee, t0: toEngine(t0 + C.vote), perSeat: C.perSeat });
        else api.setPhase(ph);
        api.setNight?.(ph === 'night');
      }
      dais.update?.(engineT);
    },
  };
}
