// Elder (NPC): bald with a white fringe, fair skin, a long dark slate robe, a little stooped,
// leaning on a plain wooden cane. Deliberately boring so it never competes with the players.
import { drawHuman, type HDir, type HPose, type Off, ramp } from './lib-d-human.js';
import type { CharacterArt } from './types.js';

const WOOD = ramp('#6a5038');

/** Cane: crook at (x, y0), shaft down to the ground at x + lean. */
function cane(o: Off, x: number, y0: number, lean: number, crookLeft: boolean) {
  o.line(x, y0, x + lean, 29, WOOD.b);
  const cx = crookLeft ? x - 1 : x + 1;
  o.set(cx, y0 - 1, WOOD.l1);
  o.set(x, y0 - 1, WOOD.l1);
  o.set(crookLeft ? x - 2 : x + 2, y0, WOOD.d1);
  o.set(x + lean, 29, WOOD.d2);
}
function hands(d: HDir, p: HPose): [number, number][] {
  const hy = 21 + p.bob;
  const plant = p.step; // the cane moves with the walk
  if (d === 'down') return [[6, hy], [17, hy - 1 + (plant > 0 ? -1 : 0)]];
  if (d === 'dr') return [[6, hy], [17, hy - 1 + (plant > 0 ? -1 : 0)]];
  if (d === 'right') return [[14 + (plant > 0 ? 1 : 0), hy - 1]];
  if (d === 'ur') return [[6, hy - 1 + (plant > 0 ? -1 : 0)], [16, hy]];
  return [[5, hy - 1 + (plant > 0 ? -1 : 0)], [16, hy]];
}
function under(o: Off, d: HDir, p: HPose) {
  const hy = 21 + p.bob + (p.step > 0 ? -1 : 0);
  if (d === 'down' || d === 'dr') cane(o, 18, hy - 1, p.step > 0 ? 1 : 0, false);
  else if (d === 'up') cane(o, 5, hy - 1, p.step > 0 ? -1 : 0, true);
  else if (d === 'ur') cane(o, 6, hy - 1, p.step > 0 ? -1 : 0, true);
}
function over(o: Off, d: HDir, p: HPose) {
  if (d !== 'right') return;
  const hy = 21 + p.bob;
  cane(o, 15 + (p.step > 0 ? 1 : 0), hy - 1, p.step > 0 ? 2 : 1, false);
  // the hand over the crook
  const skin = ramp('#d8b494');
  o.rect(14 + (p.step > 0 ? 1 : 0), hy - 1, 2, 2, skin.b);
  o.set(15 + (p.step > 0 ? 1 : 0), hy, skin.d1);
}

const art: CharacterArt = {
  id: 'npc-elder',
  draw(dir, f) {
    return drawHuman(
      {
        skin: '#d8b494',
        hair: '#aeaab0',
        hairStyle: 'bald',
        top: '#4a4c58',
        legs: '#000000',
        shoes: '#1e1a20',
        robe: true,
        stoop: 1,
        hands,
        detail(o, d, p, m) {
          const top = 16 + p.bob;
          if (d === 'right') o.hline(10, 15, top + 6, '#5a4a3a');
          else o.hline(8, 15, top + 6, '#5a4a3a');
          if (d === 'down' || d === 'dr') o.vline(d === 'dr' ? 13 : 12, top + 1, 27 + p.bob, m.d2);
        },
        under,
        over,
      },
      dir,
      f,
    );
  },
};
export default art;
