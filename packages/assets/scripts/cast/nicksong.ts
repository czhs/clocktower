// Nick Song (villager): a young guy on the plain v1 townsfolk body (lib-d-human). Thick, shaggy,
// messy jet-black hair with a heavy fringe over the forehead and tufts sticking out at the sides;
// light skin; a sly closed-mouth smirk; a loose charcoal crewneck sweatshirt with a small light print
// on the chest; grey-blue jeans; light grey sneakers; a dark smartphone (bright screen) in one hand.
import { drawHuman, type HDir, type HPose, type Off, ramp, sh } from './lib-d-human.js';
import type { CharacterArt } from './types.js';

const SKIN = '#f0d0b4';
const HAIR = ramp('#24222c');
const PHONE = '#16161e';
const SCREEN = '#9fe6ff';
const SCREEN_DIM = '#4f86a8';
const PRINT = '#d6d3cc';
const LIP = '#9a5a52';

// Hair masks in v1 coordinates: column k = x - 4 (head cols 7..16 = k 3..12), row r = y - (t - 3)
// (head rows t..t+9 = r 3..12). '#' = hair.
const HAIR_MASK: Record<HDir, string[]> = {
  down: [
    '....#..##.#.....',
    '...##########...',
    '..############..',
    '.##############.',
    '################',
    '################',
    '.##############.',
    '..#.#..##..#.#..',
    '..#..........#..',
    '..#..........#..',
  ],
  dr: [
    '...#..##.#......',
    '..###########...',
    '.#############..',
    '###############.',
    '################',
    '################',
    '###############.',
    '####.#.##.#.#...',
    '###.............',
    '###.............',
    '.##.............',
    '..#.............',
  ],
  right: [
    '..#.##.#.#......',
    '.###########....',
    '#############...',
    '##############..',
    '###############.',
    '###############.',
    '##############..',
    '#######.#.##.#..',
    '######..........',
    '######..........',
    '.#####..........',
    '..###...........',
    '...#............',
  ],
  ur: [
    '...#..##.#......',
    '..###########...',
    '.#############..',
    '###############.',
    '################',
    '################',
    '################',
    '###########.....',
    '###########.....',
    '###########.....',
    '.##########.....',
    '..#.#######.....',
    '...#.##.##......',
  ],
  up: [
    '....#..##.#.....',
    '...##########...',
    '..############..',
    '.##############.',
    '################',
    '################',
    '.##############.',
    '.##############.',
    '.##############.',
    '.##############.',
    '..############..',
    '..#.########.#..',
    '...#.##..##.#...',
    '......#..#......',
  ],
};

function hairDraw(o: Off, d: HDir, _p: HPose, t: number) {
  const rows = HAIR_MASK[d];
  rows.forEach((row, r) => {
    for (let k = 0; k < row.length; k++) {
      if (row[k] !== '#') continue;
      // flat light from the upper-left, a few glossy strands on the crown, darker tips
      let v = 0.55 - k * 0.018 - r * 0.03;
      if (r <= 4 && (k * 2 + r) % 5 === 0) v += 0.28;
      else if ((k + r * 3) % 7 === 0) v -= 0.14;
      const below = rows[r + 1]?.[k] === '#';
      if (!below) v -= 0.12;
      o.set(4 + k, t - 3 + r, sh(HAIR, v));
    }
  });
}

/** Half-lidded eyes and a lopsided closed-mouth smirk. */
function face(o: Off, d: HDir, t: number, r: ReturnType<typeof ramp>) {
  const ink = '#1a1020';
  if (d === 'down') {
    for (const ex of [9, 14]) {
      o.set(ex, t + 5, r.d1); // heavy lid
      o.set(ex, t + 6, ink);
    }
    o.set(10, t + 6, ink);
    o.set(15, t + 6, ink);
    o.set(8, t + 7, r.b); // no blush: just the smirk
    o.set(15, t + 7, r.b);
    // smirk: flat on his right, the left corner pulled up
    o.set(11, t + 8, r.b);
    o.set(12, t + 8, LIP);
    o.set(13, t + 8, LIP);
    o.set(14, t + 7, LIP);
  } else if (d === 'dr') {
    for (const ex of [11, 15]) {
      o.set(ex, t + 5, r.d1);
      o.set(ex, t + 6, ink);
    }
    o.set(12, t + 6, ink);
    o.set(10, t + 7, r.b);
    o.set(13, t + 8, r.b);
    o.set(14, t + 8, LIP);
    o.set(15, t + 8, LIP);
    o.set(16, t + 7, LIP);
  } else if (d === 'right') {
    o.set(15, t + 5, r.d1);
    o.set(15, t + 6, ink);
    o.set(16, t + 6, ink);
    o.set(15, t + 8, LIP);
    o.set(16, t + 7, LIP);
  }
}

function hands(d: HDir, p: HPose): [number, number][] {
  const hy = 21 + p.bob;
  if (d === 'right') return [[12 + p.step * -1, hy - 1]]; // phone raised a little, small arm swing
  if (d === 'down' || d === 'dr') return [[6, hy - p.step], [16, hy - 1]];
  const swing = -p.step;
  return [[d === 'ur' ? 7 : 6, hy - swing], [d === 'ur' ? 17 : 16, hy + swing]];
}

function over(o: Off, d: HDir, p: HPose) {
  const hy = 21 + p.bob;
  const skin = ramp(SKIN);
  if (d === 'down' || d === 'dr') {
    // held up at the waist, screen towards him: we see the dark back with the lit screen's edge
    // held low at his side, tilted so we catch the lit screen
    const x = d === 'dr' ? 17 : 16;
    o.rect(x, hy - 4, 3, 5, PHONE);
    o.set(x + 1, hy - 3, SCREEN);
    o.set(x + 1, hy - 2, SCREEN_DIM);
    o.rect(x, hy, 2, 2, skin.b); // the hand around it
    o.set(x + 1, hy + 1, skin.d1);
  } else if (d === 'right') {
    // in profile: the lit screen faces him (left), the case faces away
    const x = 13 + p.step * -1;
    o.vline(x, hy - 4, hy - 2, SCREEN);
    o.vline(x + 1, hy - 4, hy - 2, PHONE);
    o.set(x, hy - 2, SCREEN_DIM);
    o.rect(x - 1, hy - 1, 2, 2, skin.b);
    o.set(x, hy, skin.d1);
  }
}

const art: CharacterArt = {
  id: 'nicksong',
  draw(dir, f) {
    return drawHuman(
      {
        skin: SKIN,
        hair: '#24222c',
        hairStyle: 'short',
        hairDraw,
        face,
        top: '#44444c',
        legs: '#5d6f88',
        shoes: '#c9ccd2',
        hands,
        detail(o, d, p, m) {
          const top = 16 + p.bob;
          // crewneck rib + a ribbed hem band (loose sweatshirt)
          if (d === 'down' || d === 'dr') {
            const c = d === 'dr' ? 1 : 0;
            o.hline(10 + c, 13 + c, top, m.d2);
            o.hline(9 + c, 14 + c, top + 1, m.l1);
            // small light text print on the chest
            o.hline(9 + c, 11 + c, top + 3, PRINT);
            o.set(13 + c, top + 3, PRINT);
            o.hline(10 + c, 12 + c, top + 4, m.l1);
            o.hline(8, 15, top + 7, m.d1);
          } else if (d === 'right') {
            o.hline(9, 14, top + 7, m.d1);
          } else {
            o.hline(9, 14, top, m.d1);
            o.hline(8, 15, top + 7, m.d1);
          }
        },
        over,
      },
      dir,
      f,
    );
  },
};
export default art;
