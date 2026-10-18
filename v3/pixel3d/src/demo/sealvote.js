// (B) THE SEAL VOTE (docs/DEMO.md §4.9 "the seal vote"): the vote as the town sees it. The user (2026-10-18): "hand raising
// is not very clear. perhaps they slap the seal onto the ground in front of the character - that would be a very clear
// vote. this is important so that butler can be played properly"; "when vote is locked, how about a spotlight on the
// character".
//
// A voter SLAPS a wax seal onto the ground in front of their feet (votes) and may TAKE IT BACK (withdraws) any time
// before the clock hand reaches them; when the hand reaches a seat, the seal lying there at that moment is pressed and
// COUNTS (locked: gold seal + spotlight); no seal = no vote. A dead player's one ghost vote works the same (a pale seal);
// it is spent once counted.
//
// THE LOG (time.js owns it: time.seals): per seat (0-based) a time-sorted list of [t (engine s), down (bool)] changes.
// Scripted voters (the ceremony) are written AHEAD (future times), so every state is a pure function of t: single-frame
// captures agree with live play. The player's own seal (X / the action bar's seal button) appends at engine.time.
//   downAt(list, t)                     the seal lies on the ground at t
//   changeAt(list, t)                   the last change at or before t: [t, down] | null
//   sealVoteAt(V, t, log)               every voter's state at demo time t for the running vote V (gameui.voteOf(t):
//                                       { v (EV.makeVote), clock, reach, per }): { seats {seat (1-based): {down, yes, no,
//                                       eligible, ghost, dead, lockAt, changeAt, on}}, tally, needed, passed, passedAt,
//                                       current, done, hand, k } (current / hand / done: the events vote clock)
//   CEREMONY_SEALS + scheduleCeremony(log, {from, t0, per, open, skip})   the demo ceremony's script (time.js)
import * as EV from '../ui/events/draw.js';
import { GRID_HZ } from '../ui/kit.js';

const N = 15;

export function downAt(list, t) {
  let on = false;
  if (list) for (const e of list) { if (e[0] <= t + 1e-9) on = e[1]; else break; }
  return on;
}
export function changeAt(list, t) {
  let c = null;
  if (list) for (const e of list) { if (e[0] <= t + 1e-9) c = e; else break; }
  return c;
}
/** insert a change keeping the list time-sorted; a change that does not change the state is dropped */
export function pushChange(list, t, on) {
  let i = list.length;
  while (i > 0 && list[i - 1][0] > t) i--;
  const before = i > 0 ? list[i - 1][1] : false;
  if (before === on) return false;
  list.splice(i, 0, [t, on]);
  return true;
}

/** demo time of a vote-clock time (inverse of gameui's piecewise-linear voteClock) */
export function realOfClock(V, c) {
  const { reach, per } = V, n = reach.length;
  if (c < 0) return reach[0] + c;
  const i = Math.min(n - 1, Math.floor(c / per));
  if (i >= n - 1) return reach[n - 1] + (c - (n - 1) * per);
  return reach[i] + ((c - i * per) / per) * (reach[i + 1] - reach[i]);
}
/** demo time at which the clock hand locks the j-th voter in order (the events vote's lockAtF into that voter's slot) */
export const lockReal = (V, j) => realOfClock(V, (j * EV.TIMING.vote.perVoterF + EV.TIMING.vote.lockAtF) / GRID_HZ);

export function sealVoteAt(V, t, log) {
  const v = V.v, base = EV.voteAt(v, V.clock);
  const seats = {};
  let tally = 0, passedAt = null;
  v.order.forEach((s, j) => {
    const i = s - 1, L = log?.get?.(i) ?? null;
    const dead = v.dead.has(s), ghost = v.ghosts.has(s), eligible = !dead || ghost;
    const lockAt = lockReal(V, j), decided = t >= lockAt - 1e-9;
    const downLock = eligible && downAt(L, lockAt);
    const yes = decided && downLock, no = decided && !downLock;
    if (yes) { tally++; if (tally === v.needed && passedAt === null) passedAt = lockAt; }
    const c = eligible ? changeAt(L, Math.min(t, lockAt)) : null;
    seats[s] = { down: decided ? yes : eligible && downAt(L, t), yes, no, eligible, ghost, dead, lockAt, changeAt: c ? c[0] : null, on: c ? c[1] : false };
  });
  return { seats, tally, needed: v.needed, passed: tally >= v.needed, passedAt, current: base.current, done: base.done, hand: base.hand, k: base.k, cur: base.cur };
}

// ------------------------------------------------------------------------------------------------ the ceremony script
// (the demo's ceremony: CEREMONY (life/ceremony.js) nominee 6, voters 7 9 10 12 0 1 2 4, dead 3 (ghost vote) + 11
// (spent), 13 living = 7 needed). Every voter in `open` slaps as the vote OPENS, in a cascade round the ring before the
// hand starts; `late` slaps `s` seconds before the hand reaches them; `withdraw` takes the seal back `s` seconds before
// the hand reaches them; `ghost` spends a ghost vote (slaps a pale seal) at t0 + `s`. Result: 9 votes, 7 needed - the
// threshold falls on seat 2 with three seats still to come (one withdrew, one slapped late, the ghost voted).
export const CEREMONY_SEALS = { open: [7, 9, 10, 12, 0, 1, 2, 4], late: { 14: 1.1 }, withdraw: { 1: 1.6 }, ghost: { 3: 0.5 } };
export const OPEN_LEAD = 1.6;          // s between the vote opening and the hand starting (the slaps land first)
export const OPEN_STAGGER = 0.12;      // s between two opening slaps (clockwise from the nominee)
/**
 * Write the ceremony's seals into `log` for a vote opening at `open` (engine s) whose hand reaches seat offset k (1 =
 * the seat after the nominee) at t0 + (k - 1) * per; `skip` = seats the script leaves alone (the player's seat).
 */
export function scheduleCeremony(log, { from, t0, per, open, skip = new Set(), script = CEREMONY_SEALS }) {
  const reachOf = (i) => t0 + ((((i - from + N) % N) || N) - 1) * per;
  const ord = [...script.open].filter((i) => !skip.has(i)).sort((a, b) => ((a - from + N) % N) - ((b - from + N) % N));
  const put = (i, t, on) => { if (skip.has(i)) return; if (!log.has(i)) log.set(i, []); pushChange(log.get(i), t, on); };
  ord.forEach((i, r) => put(i, open + 0.25 + r * OPEN_STAGGER, true));
  for (const [i, s] of Object.entries(script.late ?? {})) put(+i, reachOf(+i) - s, true);
  for (const [i, s] of Object.entries(script.withdraw ?? {})) put(+i, reachOf(+i) - s, false);
  for (const [i, s] of Object.entries(script.ghost ?? {})) put(+i, t0 + s, true);
}
