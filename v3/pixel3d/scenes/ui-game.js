// Mock GAME SCREEN state + extras (owner: UI lead; used by scenes/ui-hud.js ?game=1, docs/UI_GALLERY.md §1).
// UI integration r2 (whole-screen critic, 21/24): one mock clock + one game state drive every slot, so the screen tells
// ONE moment per frame; plus the always-on v2 elements the screen lacked and two variants.
//
//   ?game=1                       day 2 nominations: Ada nominated Cleo, the vote clock walks the voters (events 9.6 s loop)
//   ?game=1&view=st               the Storyteller's screen: ST clock control (left), host toolbar, no role chip, the pick
//                                 crosshair ('Move Ada here'), numbered seat plaques (events), no notebook
//   ?game=1&phase=1               phase transitions on the 9.6 s loop (tod=golden): the game-start banner, the first
//                                 night falls (veil, golden -> night under cover), dawn of day 2 (night -> noon under the
//                                 dawn light); the vote is off, chips / toasts / hint follow the same timeline
//   tod = lighting only: the game state is the same at noon / golden / night (night = the same vote by lantern light).
//
// Always on (v2 shows them in every game state): the folded chat dock (panels chatFolded, bottom left) and the voice
// dock pill (hud drawVoicePill, bottom right under the social dock), talkers = the members whose talk outline is on.
import { MOCK_GAME } from './ui-hud.js';

export const GAME_LOOP = 9.6;
const PHASE_T = { banner: 0.3, night: 4.4, dawn: 7.6 };          // phase=1 timeline (s into the loop): start, night 1, dawn

/** Before the groups are set up: the game state, the indicators bubble copy, which group modules to skip. */
export async function preGame(hud) {
  const P = hud.P, view = P('view', 'player'), phase = P('phase', '0') === '1';
  const D = await import('../src/ui/events/draw.js');
  const { mockVote } = await import('../src/ui/events/hud.js');
  const vote = mockVote(hud), nominee = hud.bySeat(vote.nominee)?.name ?? 'Cleo';
  const nominator = MOCK_GAME.nominator;
  const doneT = (vote.order.length * D.TIMING.vote.perVoterF) / 30;            // the hand has passed every voter
  const passT = (() => {                                                        // the lock that reaches `needed`
    for (let f = 0; f < vote.order.length * D.TIMING.vote.perVoterF; f++) if (D.voteAt(vote, f / 30).passed) return f / 30;
    return null;
  })();
  const loopOf = (t) => { const base = Math.floor(t / GAME_LOOP) * GAME_LOOP; return { base, u: t - base }; };

  function hudAt(t) {
    const { base, u } = loopOf(t);
    if (phase) {
      const kN = D.gridK(u - PHASE_T.night), kD = D.gridK(u - PHASE_T.dawn);
      const N = D.TIMING.night, covered = kN >= N.outF - N.outHold;
      if (kD >= 1) return { view, chip: { stage: 'discussion', leftS: 359 - (u - PHASE_T.dawn), totalS: 360 }, phase: { phase: 'day', day: 2 },
        toasts: [{ text: 'Dawn breaks: day 2.', kind: 'info', at: base + PHASE_T.dawn + 0.1 }], hint: null };
      if (covered) return { view, chip: { stage: 'bedtime', leftS: 0, totalS: 120 }, phase: { phase: 'night', day: 1 },
        toasts: [{ text: 'The bell tolls: bedtime.', kind: 'info', at: base + PHASE_T.night }], hint: null };
      return { view, chip: { stage: 'bedtime', leftS: Math.max(1, PHASE_T.night + 0.6 - u), totalS: 120 }, phase: { phase: 'bedtime', day: 1 },
        toasts: [{ text: 'The game begins. Seats are drawn.', kind: 'info', at: base + PHASE_T.banner + 0.1 }],
        hint: { parts: [{ s: 'Night is falling: walk home.' }], short: [{ s: 'Walk home' }], at: base + 0.1 } };
    }
    const S = D.voteAt(vote, u);
    const toasts = [{ text: `${nominator} nominates ${nominee}.`, kind: 'info', at: base + 0.1 }];
    if (passT != null) toasts.push({ text: `${nominee} has ${vote.needed} votes: enough for the block.`, kind: 'vote', name: nominee, at: base + passT + 0.1 });
    if (S.done) toasts.push({ text: `${nominee} is on the block (${S.tally})`, kind: 'block', name: nominee, at: base + doneT + 0.1 });
    return {
      view,
      chip: { stage: 'nominations', leftS: 296 - u, totalS: 300, onTheBlock: S.passed },
      phase: { phase: 'day', day: MOCK_GAME.day, gathered: true },
      toasts,
      hint: view === 'st' || S.done ? null : { parts: 'Hands are counted seat by seat.', short: [{ s: 'Vote now' }], at: base + 0.4 },
    };
  }
  hud.game = { ...MOCK_GAME, loop: GAME_LOOP, vote, view, phase, hudAt, doneT, passT };
  // the mock's chat bubbles: Cleo's one-liner (the 3-line bubble, lifted over Bram's, covered Bram's body)
  const byName = (n) => hud.cast.find((m) => m.name === n);
  hud.indicatorsConfig = { ...(hud.indicatorsConfig || {}), bubbles: [
    { m: byName('Cleo'), text: 'Who was at my door?', at: 0, period: 9 },
    { m: byName('Bram'), text: 'Who slept well?', at: 0.4, period: 9 },
  ].filter((b) => b.m) };
  return { skip: phase ? ['events'] : [] };
}

/** After the groups are set up: extras on the layers (chat dock, voice pill, ST view, phase moments). */
export async function postGame(hud) {
  const G = hud.game, engine = hud.engine;
  const [{ panelKit }, { chatFolded, CHAT_FOLDED_H }, HA] = await Promise.all([
    import('../src/ui/panels/art.js'), import('../src/ui/panels/screens.js'), import('../src/ui/hud/art.js')]);
  const talkers = hud.cast.filter((m) => m.clip === 'talk').map((m) => m.name);
  // folded chat dock, bottom left (v2 .ct-chat folded: peek line + Chat toggle + unread pill); 120 wide so it stays clear
  // of the offscreen arrow near the bottom edge (Wren) and the joystick slot is phones-only
  hud.ui.add((L) => {
    const K = panelKit(L.tok);
    const night = G.phase && hud.tod === 'night';   // the crier's night call only in the phase variant
    chatFolded(L.screen, K, 4, L.screen.h - 4 - CHAT_FOLDED_H, night
      ? { w: 120, crier: true, text: 'Night falls on Hollowmere.', unread: 3 }
      : { w: 120, from: 'Bram', text: 'meet at the well', unread: 2 });
  }, 76);
  // voice dock pill (row 22), the hud group's SLOTS.hud[6]: right-aligned 32 px from the right edge (the portrait button)
  hud.ui.add((L) => {
    const W = L.screen.w, H = L.screen.h;
    HA.drawVoicePill(L.screen, W - 32, H - 4 - 15, L.tok, { link: 'ok', mic: 'idle', talkers, t: L.t });
  }, 76);

  if (G.view === 'st') {
    if (hud.panels) hud.panels.panel = 'none';                // the clock control takes the left column (hud gameShowcase)
    const { markersContext } = await import('../src/ui/markers/stage.js');
    const { drawPick } = await import('../src/ui/markers/draw.js');
    const M = await markersContext(hud);
    const spot = hud.place(4.6, -30);              // the gap in the circle between Gus (seat 7) and Ada (seat 1)
    spot.y = hud.terrain.heightAt(spot.x, spot.z);
    hud.ui.add((L) => {
      const at = L.at(spot);
      drawPick(L, M.frames(L), { at: { x: Math.round(at.x), y: Math.round(at.y) }, label: 'Move Ada here', hint: 'CLICK TO PLACE · ESC', t: L.t, T: L.tok, avoid: M.labelRects ? M.labelRects(L) : [] });
    }, 31);
  }

  if (G.phase) {
    const D = await import('../src/ui/events/draw.js');
    const { applyTimeOfDay, setClouds } = await import('../src/world/sky.js');
    const { sunFor } = await import('./char-stage.js');
    const Tn = hud.kit.tokens('night'), start = hud.tod, N = D.TIMING.night;
    let cur = start;
    const swap = (name) => {
      if (cur === name) return;
      cur = name;
      applyTimeOfDay(engine, name, { ...sunFor(name, hud.P), shadowExtent: 18 });
      setClouds(engine, name === 'noon' ? { scale: 0.045, cover: 0.62 } : { scale: 0 });
      hud.ui.setTod(name); hud.tod = name; hud.tok = hud.kit.tokens(name);
    };
    const uOf = (t) => t - Math.floor(t / GAME_LOOP) * GAME_LOOP;
    engine.onUpdate((tE) => {
      const u = uOf(hud.clock(tE));
      swap(D.gridK(u - PHASE_T.dawn) >= 1 ? 'noon' : D.gridK(u - PHASE_T.night) >= N.outF - N.outHold ? 'night' : start);
    });
    hud.ui.add((L) => D.drawNightVeil(L, D.gridK(uOf(L.t) - PHASE_T.night), Tn), 1);          // under every HUD element
    hud.ui.add((L) => D.drawDawn(L, D.gridK(uOf(L.t) - PHASE_T.dawn), L.tok), 2);             // under the labels
    hud.ui.add((L) => {
      const F = D.framesFor(L.tok), u = uOf(L.t), kN = D.gridK(u - PHASE_T.night), kD = D.gridK(u - PHASE_T.dawn);
      D.drawSeats(hud, L, F, { t: L.t });
      if (kD >= 0) D.drawCaption(L, F, { text: 'Dawn breaks over Hollowmere.', glyph: 'sun', k: kD, durF: D.TIMING.caption.dawnF });
      else if (kN >= 0) D.drawCaption(L, F, { text: 'Night falls. You are alone in your home…', glyph: 'moon', k: kN, durF: D.TIMING.caption.nightF });
      D.drawBanner(L, F, 'start', D.gridK(u - PHASE_T.banner));
    }, 25);
  }

  // (night cast visibility, critic issue 'scene lighting': a PointLight fill over the circle made no visible change in an A/B
  // at intensity 6, shots/ui-gallery/r2/z-fill0.png vs z-fill6.png - the cast materials do not take it here. Left to the
  // cast / lighting owners: docs/UI_GALLERY.md 'Known limits'.)
}
