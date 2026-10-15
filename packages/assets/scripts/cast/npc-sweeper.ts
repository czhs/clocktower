// Sweeper (NPC): a plain, muted townsperson with short grey hair, a slate tunic and a straw broom.
// Deliberately boring so it never competes with the players' characters.
import { drawHuman, type HDir, type HPose, mix, type Off, ramp, sh } from './lib-d-human.js';
import type { CharacterArt } from './types.js';

const STICK = ramp('#6a5640');
const STRAW = ramp(mix('#a89060', '#7a7270', 0.3));
const BAND = '#4e4038';

/** Broom: stick from (x0, y0) down to (x1, y1), bristles below (v1 coordinates). */
function broom(o: Off, x0: number, y0: number, x1: number, y1: number, flip: boolean) {
  o.line(x0, y0, x1, y1, STICK.b);
  o.line(x0 + 1, y0 + 1, x1 + 1, y1, STICK.d1);
  const bx = x1;
  for (let j = 0; j < 4; j++) {
    const w = 1 + Math.floor(j / 1.5);
    for (let i = -w; i <= w + 1; i++) o.set(bx + i, y1 + 1 + j, sh(STRAW, 0.65 - (i + w) * 0.1 * (flip ? -1 : 1) - j * 0.06 + ((i + j) % 2 ? -0.12 : 0)));
  }
  o.hline(bx - 1, bx + 2, y1 + 1, BAND);
}

function under(o: Off, d: HDir, p: HPose) {
  const b = p.bob;
  const sweep = p.step;
  if (d === 'down') broom(o, 18, 13 + b, 18 + sweep, 25, false);
  else if (d === 'dr') broom(o, 18, 13 + b, 19 + sweep, 25, false);
  else if (d === 'up') broom(o, 6, 13 + b, 5 - sweep, 25, true);
  else if (d === 'ur') broom(o, 7, 13 + b, 6 - sweep, 25, true);
}
function over(o: Off, d: HDir, p: HPose) {
  if (d !== 'right') return;
  // pushed ahead, the hand on the stick
  const hx = 12 + p.step * -2;
  broom(o, hx - 2, 15 + p.bob, 18 + p.step, 25, false);
}

const art: CharacterArt = {
  id: 'npc-sweeper',
  draw(dir, f) {
    return drawHuman(
      {
        skin: '#a58060',
        hair: '#6c6870',
        hairStyle: 'short',
        top: '#5a5e66',
        legs: '#3a3430',
        shoes: '#2a201c',
        detail(o, d, p) {
          const belt = 22 + p.bob;
          if (d === 'right') o.hline(9, 14, belt, '#5e4c38');
          else o.hline(8, 15, belt, '#5e4c38');
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
