// Markers slot of the mock HUD (owner: markers group; docs/UI.md §3.3). World-only slot: a live moment of the v2
// social markers over the town square, on a 6 s loop of the stage clock:
//   - Ada (seat 1) points at Cleo (seat 3): finger + marching trail (A), ping at Cleo's feet (Ag), 3.5 s
//   - place pins on the cobbles: Ada's teal (settled), your own gold one with the remove badge (hover), Gus's orange
//     dropping at 2.0 s (fall + dig-in + sparkle) and removed at 5.2 s (dissolve)
//   - person pins over Finn's name: Dov's crimson + Gus's violet, fanned, 1-px bob (Finn: no chat bubble in the mock)
// r2 phases (draw.js header): place pins are depth-tested (pinPass.js, registered in setup), the trail draws at z 15
// under the indicators' labels/bubbles (registered in setup), everything else in this slot's draw at z 30.
import { drawPoint, drawPlacePin, drawPersonPins } from './draw.js';
import { markersContext } from './stage.js';

export const LOOP = 6;
let M = null;

export function drawLive(hud, L, M, { still = false, loop = LOOP } = {}) {
  const F = M.frames(L), T = L.tok, t = L.t, c = ((t % loop) + loop) % loop;
  const ada = hud.bySeat(1), cleo = hud.bySeat(3), dov = hud.you || hud.bySeat(4), finn = hud.bySeat(6), gus = hud.bySeat(7);
  // place pins (drawn first: the point trail and finger stay on top)
  const pin = (who, color, r, ang, extra = {}) => {
    if (!who) return;
    drawPlacePin(L, F, { spot: M.ground(L, hud.place(r, ang)), color, ...M.icon(who, T), still, ...extra });
  };
  pin(ada, 'teal', 2.4, 128, { age: 9, settled: true });
  pin(dov, 'gold', 3.1, 158, { age: 9, settled: true, hover: true });
  pin(gus, 'orange', 2.2, -150, { age: c - 2.0, removeAt: 3.2 });
  // person pins over Finn
  if (finn) {
    const lt = M.labelTop(L, finn);
    drawPersonPins(L, F, { cx: lt.x, labelTop: lt.y, t, still, pins: [
      { color: 'crimson', ...M.icon(dov, T), age: 9, settled: true },
      { color: 'violet', ...M.icon(gus, T), age: 9, settled: true },
    ] });
  }
  // Ada points at Cleo
  if (ada && cleo) drawPoint(L, F, { head: M.head(L, ada), aim: M.aim(L, cleo), spot: M.feet(L, cleo), person: true, age: c - 0.3, still });
}

const stillOf = (hud) => hud.P('still', '0') === '1';
export default {
  z: 30,                                   // finger / person pins above labels / bubbles (v2 order: pins > bubble > label)
  async setup(hud) {
    M = await markersContext(hud);
    M.register((L) => drawLive(hud, L, M, { still: stillOf(hud) }), { main: false });   // pins (pass 301) + trail (z 15)
  },
  draw(hud, L) { if (M) drawLive(hud, M.phase(L, 'main'), M, { still: stillOf(hud) }); },
};
