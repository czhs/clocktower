// Events slot of the mock HUD (owner: events group; docs/UI.md §3.3, rows 50–59). A live nomination moment over the
// town square on a 9.6 s loop of the stage clock:
//   - seat plaques in front of every seat (Ag; yours gold and pulsing, Esme's a mist plaque with a wisp: she is dead)
//   - Ada has nominated Cleo: clay nominee ring; the gold clock hand walks the voters from seat 4 clockwise (Ag)
//   - raised hands pop in over the voters (A), lock to gold with a flash when the hand counts them; Esme spends her
//     ghost vote (ghost hand); Bram (vote clip) has his hand up from the start
//   - HUD vote clock + tally (S, left under the side panel) and the phase caption in the events slot (S)
// The scene scenes/ui-events.js shows every other event (night fall, dawn, execution, poof, banners).
import { framesFor, drawSeats, makeVote, drawVoteWorld, drawVoteHud, drawCaption, gridK, scheduleGhostSpent, voteAt, TIMING } from './draw.js';

export const LOOP = 9.6;
/** Screen rect of the HUD vote clock (CONTRACT-REQUEST: SLOTS.events gains { name: 'vote clock', x: 4, y: 188, w: 69, h: 90 }). */
export const VOTE_RECT = { x: 4, y: 188, w: 69, h: 90 };
export function mockVote(hud) {
  const ghosts = hud.cast.filter((m) => m.ghost).map((m) => m.seat);
  const alive = hud.cast.length - ghosts.length;
  return makeVote({ nominee: 3, order: [4, 5, 6, 7, 1, 2, 3], raise: { 2: -1, 5: 0.3, 7: 2.2, 1: 3.9 }, ghosts, dead: ghosts, t0: 0, needed: Math.ceil(alive / 2) });
}
const stillOf = (hud) => hud.P('still', '0') === '1';

export function drawLive(hud, L, { vote, still = false, loop = LOOP } = {}) {
  const F = framesFor(L.tok), t = ((L.t % loop) + loop) % loop;
  drawSeats(hud, L, F, { states: { [vote.nominee]: 'nominee' }, t, still });
  drawVoteWorld(hud, L, F, vote, { t, still });
  drawVoteHud(hud, L, F, vote, VOTE_RECT, { t, still });
  const nom = hud.bySeat(vote.nominee)?.name ?? 'the nominee';
  // UI integration r2 (whole-screen critic: one consistent moment): once the hand has passed every voter the caption
  // tells the result (as the 'vote' state of scenes/ui-events.js does), not 'Raise a hand' over 'VOTES 4 / 3'
  const S = voteAt(vote, t), doneF = vote.order.length * TIMING.vote.perVoterF;
  if (!S.done) drawCaption(L, F, { text: `${nom} is nominated. Raise a hand to vote.`, glyph: 'hand', k: gridK(t), durF: doneF - 4, still });
  else drawCaption(L, F, { text: S.passed ? `${nom} is on the block (${S.tally} votes).` : 'Not enough votes.', glyph: 'bell', k: gridK(t) - doneF, durF: Math.round(loop * 30) - doneF - 8, still });
}

let VOTE = null;
export default {
  z: 25,                                    // hands above labels (20), below markers' finger / person pins (30)
  async setup(hud) { VOTE = mockVote(hud); scheduleGhostSpent(hud, VOTE, { loop: LOOP }); },   // halo off once counted
  draw(hud, L) { drawLive(hud, L, { vote: VOTE, still: stillOf(hud) }); },
};
