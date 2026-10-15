// Procedural blockouts for the CMU CS course mascots (cmu-eggs), reinterpreted as bold, chunky
// village characters. The list was confirmed by the user on 2026-10-15 (docs/easter-eggs.md):
//   15-122 Honk (grey goose) + Chonk (giant white goose)       15-150 Polly (parrot, black λ tee)
//   15-210 Clarabelle the Parallel Cow                          15-213 Requin (French shark, beret)
//   15-312 Progress & Preservation (green / blue frogs)         15-411 Opal the Optimizing Otter
//   15-251 Cilantro the giraffe (blue hoodie, green scarf)      15-451 Mincut & Maxflow (fox + red panda)
//   15-151/21-127 Theo Rem the hedgehog                         UCT Greenting (green rounded creature)
// Blockouts fix size, silhouette, anchor and main colours only; gpt-6-astra repaints them
// (eggs-mascots-* jobs) and the result is cut back to these exact sizes. All face RIGHT.
import { Img, mix } from '../../scripts/lib/img.js';
import { shadow } from '../../scripts/lib/draw.js';

const OUT = 0.62;
const SOOT = '#191C29';

/** Filled ellipse shaded from the upper left (3 values). */
function blob(img: Img, cx: number, cy: number, rx: number, ry: number, base: string) {
  img.ellipse(cx, cy, rx, ry, (_x, _y, nx, ny) => (nx + ny < -0.7 ? mix(base, '#fff1cc', 0.28) : nx + ny > 0.8 ? mix(base, '#160d2a', 0.35) : base));
}
const eye = (img: Img, x: number, y: number) => {
  img.set(x, y, SOOT);
  img.set(x, y - 1, SOOT);
};

function goose(frame: number): Img {
  // Honk: chunky grey goose, 20x20. 0/1 waddle, 2 honk (neck up, beak open)
  const img = new Img(20, 20);
  const b = 18;
  shadow(img, 9, b, 7, 1.5);
  blob(img, 8, b - 6, 7, 5, '#747383');
  img.rect(2, b - 9, 3, 3, '#505061');
  const top = frame === 2 ? b - 18 : b - 15;
  img.rect(12, top + 3, 3, b - 9 - top, '#333646');
  blob(img, 14, top + 2, 3, 2.5, '#333646');
  img.set(14, top + 3, '#DED2B7');
  eye(img, 15, top + 2);
  img.rect(17, top + 2, 2, 2, '#D98043');
  if (frame === 2) img.set(18, top + 4, '#D98043');
  for (const lx of frame === 1 ? [6, 10] : [7, 9]) img.rect(lx, b - 2, 1, 2, '#D98043');
  img.outline({ darken: OUT });
  return img;
}

function chonk(frame: number): Img {
  // Chonk: a goose as tall as a villager, 32x40; 0 idle, 1 honk
  const img = new Img(32, 40);
  const b = 38;
  shadow(img, 14, b, 12, 2.5);
  blob(img, 13, b - 11, 12, 9, '#DED2B7');
  img.rect(2, b - 16, 4, 4, '#BDB3A0');
  const top = frame === 1 ? b - 37 : b - 34;
  img.rect(19, top + 5, 6, b - 16 - top, '#DED2B7');
  img.vline(19, top + 5, b - 12, '#BDB3A0');
  blob(img, 22, top + 4, 5, 4, '#DED2B7');
  eye(img, 24, top + 3);
  img.rect(27, top + 3, 4, 3, '#D98043');
  if (frame === 1) img.rect(28, top + 6, 3, 1, '#D98043');
  for (const lx of [10, 16]) img.rect(lx, b - 3, 2, 3, '#D98043');
  img.outline({ darken: OUT });
  return img;
}

function requin(frame: number): Img {
  // Requin: a shark fin cutting through the pond, wearing a black beret; 20x16
  const img = new Img(20, 16);
  img.poly(
    [
      [5, 13],
      [10, 4],
      [15, 13],
    ],
    (x) => (x < 10 ? '#596D89' : '#394764'),
  );
  // beret, jaunty, with its little stalk
  img.ellipse(10, 4, 4.5, 2, '#191C29');
  img.set(8, 3, '#333646');
  img.set(10, 1, '#191C29');
  img.hline(3, 17, 13, '#252C41');
  const foam = '#A6C5CA';
  for (const [x, y] of frame === 0
    ? [
        [1, 14],
        [3, 13],
        [17, 14],
      ]
    : [
        [0, 13],
        [2, 14],
        [18, 13],
      ])
    img.set(x!, y!, foam);
  img.hline(4, 16, 14, '#577B93');
  return img;
}

function requinGrin(): Img {
  // Requin surfacing: big head, toothy grin, beret still on; 24x16
  const img = new Img(24, 16);
  blob(img, 11, 9, 9, 5, '#596D89');
  img.hline(4, 18, 12, '#DED2B7'); // teeth
  for (let x = 5; x < 18; x += 2) img.set(x, 13, '#DED2B7');
  img.hline(4, 18, 11, '#191C29');
  eye(img, 14, 7);
  img.ellipse(9, 4, 5, 2, '#191C29'); // beret
  img.set(9, 1, '#191C29');
  img.hline(0, 23, 14, '#577B93');
  img.set(1, 15, '#A6C5CA');
  img.set(21, 15, '#A6C5CA');
  img.outline({ darken: OUT });
  return img;
}

const POLLY_PALETTES: [string, string, string][] = [
  ['#64774B', '#D5B56A', '#B37072'], // leaf-green body, brass wing, wine head
  ['#596D89', '#D98043', '#729395'],
  ['#806184', '#8EB4C2', '#D5B56A'],
];
export const POLLY_VARIANTS = POLLY_PALETTES.length;

function parrot(variant: number, frame: number): Img {
  // Polly: chunky perched parrot in a black λ T-shirt, 16x20; frame 1 = wings out
  const img = new Img(16, 20);
  const [body, wing, head] = POLLY_PALETTES[variant]!;
  const b = 19;
  blob(img, 7, b - 7, 4.5, 5.5, '#191C29'); // the tee is the body
  img.set(7, b - 8, '#DED2B7'); // λ
  img.set(6, b - 7, '#DED2B7');
  img.set(8, b - 7, '#DED2B7');
  img.set(5, b - 6, '#DED2B7');
  img.set(9, b - 6, '#DED2B7');
  img.set(7, b - 9, '#DED2B7');
  blob(img, 8, b - 14, 4, 3.5, head);
  img.set(9, b - 15, '#DED2B7');
  eye(img, 10, b - 14);
  img.rect(12, b - 15, 2, 3, '#BDB3A0'); // beak
  img.set(13, b - 12, '#8B8277');
  if (frame === 0) img.rect(3, b - 10, 2, 5, wing);
  else {
    img.rect(0, b - 13, 4, 3, wing);
    img.rect(12, b - 10, 3, 2, wing);
  }
  img.rect(4, b - 3, 3, 2, body); // tail feathers
  img.rect(7, b - 2, 1, 2, body);
  img.hline(5, 10, b, '#876044'); // feet on the perch
  img.outline({ darken: OUT });
  return img;
}

function cow(frame: number): Img {
  // Clarabelle: chunky black-and-white cow, 28x22; 0 head up, 1 grazing
  const img = new Img(28, 22);
  const b = 20;
  shadow(img, 13, b, 11, 2);
  blob(img, 12, b - 9, 9, 6, '#DED2B7');
  img.rect(8, b - 13, 5, 4, '#191C29');
  img.rect(14, b - 8, 4, 3, '#191C29');
  for (const lx of [6, 9, 15, 18]) img.rect(lx, b - 4, 2, 4, '#8B8277');
  img.rect(2, b - 12, 2, 1, '#BDB3A0');
  const hy = frame === 0 ? b - 17 : b - 9;
  blob(img, 22, hy + 3, 4, 3.5, '#DED2B7');
  img.rect(20, hy, 3, 3, '#191C29');
  img.rect(24, hy + 4, 3, 2, '#B37072');
  eye(img, 23, hy + 3);
  img.set(20, hy - 1, '#BDB3A0');
  img.set(24, hy - 1, '#BDB3A0');
  img.outline({ darken: OUT });
  return img;
}

function frog(color: 'green' | 'blue', frame: number): Img {
  // Progress (green) & Preservation (blue): 14x12, big eyes, white belly; 0 sit, 1 hop
  const img = new Img(14, 12);
  const base = color === 'green' ? '#64774B' : '#596D89';
  const b = frame === 0 ? 11 : 8;
  blob(img, 7, b - 3, 5, 3, base);
  img.hline(4, 10, b - 1, '#DED2B7');
  blob(img, 5, b - 6, 1.6, 1.6, base);
  blob(img, 9, b - 6, 1.6, 1.6, base);
  img.set(5, b - 6, SOOT);
  img.set(9, b - 6, SOOT);
  if (frame === 0) {
    img.rect(1, b - 1, 3, 1, mix(base, '#160d2a', 0.35));
    img.rect(10, b - 1, 3, 1, mix(base, '#160d2a', 0.35));
  } else {
    img.rect(0, b + 1, 3, 1, mix(base, '#160d2a', 0.35));
    img.rect(11, b + 1, 3, 1, mix(base, '#160d2a', 0.35));
  }
  img.outline({ darken: OUT });
  return img;
}

function opal(frame: number): Img {
  // Opal: otter floating on her back in the river with a little harness; 24x14; 0 float, 1 swim
  const img = new Img(24, 14);
  const B = '#594034';
  if (frame === 0) {
    blob(img, 11, 8, 8, 3.5, B);
    img.hline(5, 17, 6, '#B18C62'); // pale belly up
    img.rect(9, 5, 4, 5, '#713E3D'); // harness strap
    blob(img, 19, 6, 3.5, 3, B);
    img.set(20, 5, SOOT);
    img.set(22, 6, SOOT);
    img.rect(5, 4, 2, 2, B); // paws up
    img.rect(13, 4, 2, 2, B);
    img.rect(1, 8, 3, 2, B);
  } else {
    blob(img, 10, 9, 8, 3, B);
    img.rect(8, 7, 3, 4, '#713E3D');
    blob(img, 19, 7, 3.5, 3, B);
    img.hline(18, 21, 9, '#B18C62');
    img.set(20, 6, SOOT);
    img.rect(0, 9, 3, 2, B);
  }
  img.hline(0, 23, 12, '#577B93');
  img.set(3, 13, '#A6C5CA');
  img.set(21, 13, '#A6C5CA');
  img.outline({ darken: OUT });
  return img;
}

function cilantro(frame: number): Img {
  // Cilantro: a giraffe in a blue hoodie and a green scarf, 24x48; 0 idle, 1 chewing (head dips)
  const img = new Img(24, 48);
  const b = 46;
  const Y = '#D1B879';
  shadow(img, 10, b, 8, 2);
  for (const lx of [5, 8, 12, 15]) img.rect(lx, b - 10, 2, 10, Y);
  blob(img, 10, b - 13, 8, 5, '#394764'); // hoodie body
  img.rect(4, b - 16, 12, 2, '#596D89');
  const dy = frame === 1 ? 2 : 0;
  img.rect(13, b - 34 + dy, 4, 20 - dy, Y); // neck
  for (const sy of [b - 30, b - 25, b - 20]) img.rect(14, sy + dy, 2, 2, '#876044'); // spots
  img.rect(12, b - 22 + dy, 6, 3, '#3F5540'); // scarf
  img.rect(11, b - 20 + dy, 2, 5, '#64774B');
  blob(img, 17, b - 37 + dy, 5, 3.5, Y);
  eye(img, 18, b - 38 + dy);
  img.rect(15, b - 42 + dy, 1, 3, '#876044'); // ossicones
  img.rect(18, b - 42 + dy, 1, 3, '#876044');
  img.rect(21, b - 36 + dy, 2, 2, '#AE8C4E');
  img.outline({ darken: OUT });
  return img;
}

function fox(frame: number): Img {
  // the big orange fox of the 15-451 pair, lying down, 32x24; frame 1 = tail swish
  const img = new Img(32, 24);
  const b = 22;
  const O = '#D98043';
  shadow(img, 15, b, 13, 2);
  blob(img, 14, b - 6, 11, 5, O);
  img.hline(6, 22, b - 2, '#DED2B7');
  blob(img, 24, b - 10, 6, 5, O); // head
  img.rect(24, b - 8, 6, 3, '#DED2B7'); // white muzzle
  img.set(30, b - 8, SOOT); // nose
  eye(img, 25, b - 11);
  img.poly(
    [
      [20, b - 13],
      [21, b - 19],
      [24, b - 14],
    ],
    SOOT,
  );
  img.poly(
    [
      [25, b - 14],
      [28, b - 19],
      [29, b - 13],
    ],
    SOOT,
  );
  const ty = frame === 1 ? b - 12 : b - 6;
  blob(img, 4, ty, 4, 3.5, O);
  img.rect(0, ty - 1, 2, 3, '#DED2B7');
  img.outline({ darken: OUT });
  return img;
}

function redPanda(frame: number): Img {
  // the small red panda of the 15-451 pair, sitting, 16x18; frame 1 = blink + tail
  const img = new Img(16, 18);
  const b = 17;
  const R = '#A65F4B';
  shadow(img, 8, b, 5, 1.5);
  blob(img, 7, b - 5, 4.5, 4.5, '#402832');
  blob(img, 8, b - 10, 5, 4, R);
  img.rect(5, b - 9, 2, 2, '#DED2B7');
  img.rect(9, b - 9, 2, 2, '#DED2B7');
  if (frame === 0) {
    img.set(6, b - 10, SOOT);
    img.set(10, b - 10, SOOT);
  } else {
    img.hline(5, 6, b - 10, SOOT);
    img.hline(9, 10, b - 10, SOOT);
  }
  img.rect(4, b - 14, 2, 2, R);
  img.rect(10, b - 14, 2, 2, R);
  const tx = frame === 1 ? 12 : 11;
  for (let k = 0; k < 4; k++) img.rect(tx + (k & 1), b - 5 + k, 3, 1, k % 2 ? '#713E3D' : R);
  img.outline({ darken: OUT });
  return img;
}

function hedgehog(frame: number): Img {
  // Theo Rem: a round hedgehog (a theorem: small, prickly, eventually comes out at night); 16x12
  const img = new Img(16, 12);
  const b = 11;
  img.ellipse(7, b - 4, 6.5, 4.5, (x, y, nx, ny) => ((x + y) % 2 === 0 && ny < 0.3 ? '#594034' : nx + ny < -0.4 ? '#876044' : '#30282C'));
  blob(img, 12, b - 3, 3, 2.5, '#B18C62');
  img.set(15, b - 3, SOOT);
  img.set(12, b - 4, SOOT);
  for (const lx of frame === 1 ? [4, 9] : [5, 8]) img.set(lx, b, '#30282C');
  img.outline({ darken: OUT });
  return img;
}

function greenting(frame: number): Img {
  // Greenting: a green, rounded, slightly tilted creature head with a dark mark; 16x16
  const img = new Img(16, 16);
  const G = '#64774B';
  img.poly(
    [
      [2, 15],
      [2, 6],
      [5, 2],
      [10, 1],
      [14, 4],
      [14, 15],
    ],
    (x, y) => (x + y < 9 ? mix(G, '#fff1cc', 0.22) : x > 11 ? mix(G, '#160d2a', 0.3) : G),
  );
  if (frame === 0) {
    img.set(9, 6, SOOT);
    img.set(9, 5, SOOT);
  } else img.hline(8, 10, 6, SOOT); // blink
  // the dark mark (a little clock-hand-like dash)
  img.line(6, 10, 10, 12, SOOT);
  img.set(6, 11, SOOT);
  img.outline({ darken: OUT });
  return img;
}

function scotty(frame: number): Img {
  // Scotty: black Scottish terrier in a tartan coat (blue/red/green/yellow), 18x16; 0/1 trot, 2 sit
  const img = new Img(18, 16);
  const b = 14;
  const K = '#191C29';
  const K2 = '#333646';
  shadow(img, 8, b, 7, 1.5);
  if (frame < 2) {
    img.rect(3, b - 7, 10, 5, K2);
    img.rect(12, b - 10, 5, 5, K2);
    img.set(17, b - 8, K);
    img.rect(12, b - 12, 1, 2, K2);
    img.rect(15, b - 12, 1, 2, K2);
    img.rect(13, b - 5, 4, 1, '#626979');
    img.rect(2, b - 10, 1, 3, K2);
    for (const lx of frame === 0 ? [3, 5, 10, 12] : [4, 6, 9, 11]) img.rect(lx, b - 3, 1, 3, K);
    img.rect(4, b - 8, 7, 4, '#713E3D');
    img.hline(4, 10, b - 6, '#3F5540');
    img.vline(7, b - 8, b - 5, '#394764');
    img.set(9, b - 7, '#D5B56A');
  } else {
    img.rect(5, b - 8, 7, 7, K2);
    img.rect(10, b - 12, 5, 5, K2);
    img.set(15, b - 10, K);
    img.rect(10, b - 14, 1, 2, K2);
    img.rect(13, b - 14, 1, 2, K2);
    img.rect(5, b - 7, 5, 4, '#713E3D');
    img.hline(5, 9, b - 5, '#3F5540');
    img.set(7, b - 6, '#D5B56A');
    img.rect(10, b - 2, 2, 2, K);
    img.rect(4, b - 2, 2, 2, K);
  }
  img.outline({ darken: OUT });
  return img;
}

export function drawMascots(): Map<string, Img> {
  const f = new Map<string, Img>();
  for (let i = 0; i < 3; i++) f.set(`egg_scotty_${i}`, scotty(i));
  for (let i = 0; i < 3; i++) f.set(`egg_honk_${i}`, goose(i));
  f.set('egg_chonk', chonk(0));
  for (let i = 0; i < 2; i++) f.set(`egg_requin_${i}`, requin(i));
  f.set('egg_requin_grin', requinGrin());
  for (let v = 0; v < POLLY_VARIANTS; v++) for (let i = 0; i < 2; i++) f.set(`egg_polly_${v}_${i}`, parrot(v, i));
  for (let i = 0; i < 2; i++) f.set(`egg_cow_${i}`, cow(i));
  for (const c of ['green', 'blue'] as const) for (let i = 0; i < 2; i++) f.set(`egg_frog_${c}_${i}`, frog(c, i));
  for (let i = 0; i < 2; i++) f.set(`egg_opal_${i}`, opal(i));
  for (let i = 0; i < 2; i++) f.set(`egg_cilantro_${i}`, cilantro(i));
  for (let i = 0; i < 2; i++) f.set(`egg_fox_${i}`, fox(i));
  for (let i = 0; i < 2; i++) f.set(`egg_panda_${i}`, redPanda(i));
  for (let i = 0; i < 2; i++) f.set(`egg_theo_${i}`, hedgehog(i));
  for (let i = 0; i < 2; i++) f.set(`egg_greenting_${i}`, greenting(i));
  return f;
}
