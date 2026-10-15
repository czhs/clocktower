// Porter (NPC): brown skin, a dark hood, a dull-green work tunic with a leather apron and a plain
// sack slung over the back. Deliberately boring so it never competes with the players.
import { drawHuman, type HDir, type HPose, mix, type Off, ramp, sh } from './lib-d-human.js';
import type { CharacterArt } from './types.js';

const SACK = ramp(mix('#8e7c5c', '#7a7270', 0.25));
const LEATHER = ramp('#5c4432');

function sack(o: Off, cx: number, cy: number, rx: number, ry: number) {
  o.ellipse(cx, cy, rx, ry, (_x, _y, nx, ny) => sh(SACK, 0.6 - nx * 0.28 - ny * 0.3 + (Math.abs(nx + ny * 0.4) < 0.12 ? -0.2 : 0)));
}
function under(o: Off, d: HDir, p: HPose) {
  const b = p.bob;
  // seen from the front the sack shows over the left shoulder
  if (d === 'down') sack(o, 5.5, 15 + b, 4.0, 5.0);
  else if (d === 'dr') sack(o, 6, 15 + b, 4.2, 5.0);
}
function over(o: Off, d: HDir, p: HPose) {
  const b = p.bob;
  if (d === 'right') {
    sack(o, 8, 17 + b, 3.6, 4.8);
    o.set(10, 12 + b, SACK.d1); // tied neck
    o.set(11, 12 + b, SACK.d2);
  } else if (d === 'up' || d === 'ur') {
    const x = d === 'ur' ? 11 : 12;
    sack(o, x, 18 + b, 5.0, 5.2);
    o.hline(x - 1, x + 1, 12 + b, SACK.d2);
    o.set(x, 13 + b, SACK.d1);
  }
}

const art: CharacterArt = {
  id: 'npc-porter',
  draw(dir, f) {
    return drawHuman(
      {
        skin: '#8a6448',
        hair: '#3a3438',
        hairStyle: 'hood',
        top: '#4e5a46',
        legs: '#33302c',
        shoes: '#1e1a18',
        detail(o, d, p) {
          const top = 16 + p.bob;
          if (d === 'down' || d === 'dr') {
            const x0 = d === 'dr' ? 10 : 9;
            for (let y = top + 2; y < top + 10; y++) for (let x = x0; x < x0 + 6; x++) o.set(x, y, sh(LEATHER, 0.6 - (x - x0) * 0.06));
            o.line(d === 'dr' ? 9 : 8, top, 15, top + 6, LEATHER.d2); // sack strap
          } else if (d === 'right') {
            for (let y = top + 2; y < top + 10; y++) for (let x = 12; x < 16; x++) o.set(x, y, sh(LEATHER, 0.5));
          } else {
            o.hline(8, 15, top + 6, LEATHER.d1);
          }
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
