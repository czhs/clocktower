// Vendor (NPC): olive skin, brown hair in a bun, a muted ochre-brown coat and a plain cream apron.
// Deliberately boring so it never competes with the players' characters.
import { drawHuman, ramp, sh } from './lib-d-human.js';
import type { CharacterArt } from './types.js';

const APRON = ramp('#bcb29e');
const STRING = '#8a806e';

const art: CharacterArt = {
  id: 'npc-vendor',
  draw(dir, f) {
    return drawHuman(
      {
        skin: '#b48e68',
        hair: '#4e3a2c',
        hairStyle: 'bun',
        top: '#76603e',
        legs: '#3a3236',
        shoes: '#221a1c',
        detail(o, d, p) {
          const top = 16 + p.bob;
          if (d === 'down' || d === 'dr') {
            const x0 = d === 'dr' ? 10 : 9;
            for (let y = top + 3; y < top + 11; y++) for (let x = x0; x < x0 + 6; x++) o.set(x, y, sh(APRON, 0.66 - (x - x0) * 0.06 - (y - top) * 0.01));
            o.hline(8, 15, top + 4, STRING);
            o.set(x0 + 2, top + 2, STRING);
            o.set(x0 + 3, top + 2, STRING);
            o.hline(x0 + 1, x0 + 4, top + 7, APRON.d1); // pocket
          } else if (d === 'right') {
            for (let y = top + 3; y < top + 11; y++) for (let x = 12; x < 16; x++) o.set(x, y, sh(APRON, 0.55 - (x - 12) * 0.05));
            o.hline(9, 12, top + 4, STRING);
          } else {
            o.hline(8, 15, top + 4, STRING);
            o.set(12, top + 5, STRING);
            o.set(11, top + 6, STRING);
            o.set(13, top + 6, STRING);
          }
        },
      },
      dir,
      f,
    );
  },
};
export default art;
