// Flat 16x16 decor tiles (Tiled "decor" layer): grass tufts, flowers, crops, cracks, leaves…
// Plus small UI bits: favicon and the light-glow texture.
import { canopy } from './lib/draw.js';
import { dpick, hash, Img, mix } from './lib/img.js';

const LEAF = ['#16301f', '#1f4026', '#2c522e', '#3e6838', '#55804a'];

function tuft(img: Img, seed: number) {
  for (let k = 0; k < 3; k++) {
    const x = 3 + Math.floor(hash(k, 0, seed) * 10);
    const y = 6 + Math.floor(hash(k, 1, seed) * 7);
    for (let b = -2; b <= 2; b++) {
      const h = 2 + Math.floor(hash(k, b, seed + 1) * 3);
      for (let j = 0; j < h; j++) img.set(x + b + (j > 1 ? Math.sign(b) : 0), y - j, dpick(['#28402e', '#3f5d3b', '#5a7a48', '#7a9458'], 0.3 + j * 0.25, x + b, y - j));
    }
  }
}

function flowers(img: Img, petal: string, seed: number) {
  for (let k = 0; k < 4; k++) {
    const x = 2 + Math.floor(hash(k, 0, seed) * 12);
    const y = 3 + Math.floor(hash(k, 1, seed) * 11);
    img.set(x, y + 1, '#2c4a2a');
    img.set(x, y + 2, '#2c4a2a');
    img.set(x - 1, y, petal);
    img.set(x + 1, y, mix(petal, '#000000', 0.25));
    img.set(x, y - 1, mix(petal, '#ffffff', 0.25));
    img.set(x, y + 0, '#f0d060');
    img.set(x, y + 1 - 0, mix(petal, '#000000', 0.35));
  }
}

function mushrooms(img: Img) {
  for (const [x, y] of [
    [5, 10],
    [9, 12],
    [11, 8],
  ] as const) {
    img.vline(x, y, y + 2, '#d8ccb8');
    img.hline(x - 2, x + 2, y - 1, '#8a2a2a');
    img.hline(x - 1, x + 1, y - 2, '#a83a32');
    img.set(x - 1, y - 2, '#e8d8c8');
  }
}

function crack(img: Img) {
  let x = 3;
  let y = 4;
  for (let i = 0; i < 12; i++) {
    img.set(x, y, '#1a1820');
    x += hash(i, 0, 3) < 0.6 ? 1 : 0;
    y += hash(i, 1, 4) < 0.7 ? 1 : 0;
  }
  img.set(8, 6, '#1a1820');
  img.set(9, 5, '#1a1820');
}

function leaves(img: Img) {
  const cols = ['#5a3a1e', '#7a4a20', '#8a2a1e', '#6a5a24'];
  for (let k = 0; k < 6; k++) {
    const x = 1 + Math.floor(hash(k, 0, 7) * 14);
    const y = 1 + Math.floor(hash(k, 1, 7) * 14);
    img.set(x, y, cols[k % 4]!);
    img.set(x + 1, y, mix(cols[k % 4]!, '#000000', 0.3));
  }
}

function pebbles(img: Img) {
  for (let k = 0; k < 4; k++) {
    const x = 2 + Math.floor(hash(k, 0, 9) * 12);
    const y = 2 + Math.floor(hash(k, 1, 9) * 12);
    img.set(x, y, '#8a7e70');
    img.set(x + 1, y, '#5e544a');
    img.set(x, y + 1, '#3e362e');
  }
}

function wheat(img: Img, off: number) {
  for (let i = 0; i < 6; i++) {
    const x = 1 + i * 3 + (off % 2);
    if (x > 15) continue;
    for (let j = 0; j < 9; j++) img.set(x, 15 - j, dpick(['#5a4a1e', '#8a702c', '#b8963c'], 0.2 + j * 0.1, x, 15 - j));
    for (let j = 9; j < 13; j++) {
      img.set(x, 15 - j, j % 2 ? '#d8b850' : '#a88a34');
      if (j % 2) img.set(x + 1, 15 - j, '#c0a040');
    }
  }
}

function crop(img: Img, kind: 'cabbage' | 'carrots') {
  if (kind === 'cabbage') {
    for (const [x, y] of [
      [4, 6],
      [11, 11],
    ] as const)
      canopy(
        img,
        [
          [x - 1, y, 3],
          [x + 2, y, 3],
          [x, y - 2, 3],
        ],
        ['#2a4a2a', '#3a6a3a', '#5a8a4a', '#8ab070'],
        x * 3,
      );
  } else {
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 4;
      const y = 8 + (i % 2) * 4;
      img.set(x, y, '#d07a2a');
      img.set(x + 1, y, '#a05a1e');
      for (const d of [-1, 0, 1]) {
        img.set(x + d, y - 1, '#3a7a3a');
        img.set(x + d * 2, y - 2, '#4a9a4a');
      }
    }
  }
}

function vines(img: Img) {
  img.vline(3, 0, 15, '#5a3a22');
  img.vline(12, 0, 15, '#5a3a22');
  for (let y = 0; y < 16; y += 2) {
    img.set(4 + (y % 4 === 0 ? 1 : 0), y, LEAF[3]!);
    img.set(11 - (y % 4 === 0 ? 1 : 0), y + 1, LEAF[2]!);
    if (y % 6 === 0) {
      img.set(5, y + 1, '#5a2a6a');
      img.set(10, y, '#5a2a6a');
    }
  }
}

export const DECAL_NAMES = [
  'tuft',
  'tuft2',
  'flowers_red',
  'flowers_violet',
  'flowers_white',
  'flowers_yellow',
  'mushrooms',
  'crack',
  'leaves',
  'pebbles',
  'wheat',
  'wheat2',
  'cabbage',
  'carrots',
  'vines',
] as const;

export function drawDecals(): Map<string, Img> {
  const m = new Map<string, Img>();
  const mk = (name: string, fn: (i: Img) => void) => {
    const i = new Img(16, 16);
    fn(i);
    m.set(name, i);
  };
  mk('tuft', (i) => tuft(i, 1));
  mk('tuft2', (i) => tuft(i, 2));
  mk('flowers_red', (i) => flowers(i, '#c0304a', 3));
  mk('flowers_violet', (i) => flowers(i, '#8a50c0', 4));
  mk('flowers_white', (i) => flowers(i, '#e8e4f0', 5));
  mk('flowers_yellow', (i) => flowers(i, '#e8c040', 6));
  mk('mushrooms', mushrooms);
  mk('crack', crack);
  mk('leaves', leaves);
  mk('pebbles', pebbles);
  mk('wheat', (i) => wheat(i, 0));
  mk('wheat2', (i) => wheat(i, 1));
  mk('cabbage', (i) => crop(i, 'cabbage'));
  mk('carrots', (i) => crop(i, 'carrots'));
  mk('vines', vines);
  for (const n of DECAL_NAMES) if (!m.has(n)) throw new Error(`missing decal ${n}`);
  return m;
}

/** White radial glow (tinted at runtime) + a softer large one. 2 frames of 128x128. */
export function drawLights(): Img {
  const img = new Img(256, 128);
  for (let f = 0; f < 2; f++)
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const d = Math.hypot(x + 0.5 - 64, y + 0.5 - 64) / 64;
        if (d >= 1) continue;
        const a = f === 0 ? Math.pow(1 - d, 1.6) : Math.pow(1 - d, 0.9) * (d < 0.85 ? 1 : (1 - d) / 0.15);
        img.set(f * 128 + x, y, [255, 255, 255, Math.round(a * 255)]);
      }
  return img;
}

/** 32x32 favicon: the clock tower against a moon. */
export function drawFavicon(): Img {
  const img = new Img(32, 32);
  img.ellipse(16, 16, 15.5, 15.5, (x, y, nx, ny) => dpick(['#120e1e', '#1c1630', '#2a2244'], 0.6 - ny * 0.4, x, y));
  img.ellipse(21, 9, 5, 5, (x, y, nx, ny) => dpick(['#b8b0a0', '#e0d8c0', '#fff4d8'], 0.7 - nx * 0.3 - ny * 0.3, x, y));
  // tower silhouette
  img.poly(
    [
      [12, 9],
      [16, 1],
      [20, 9],
    ],
    '#3a3456',
  );
  img.rect(12, 9, 8, 21, '#2a2638');
  img.rect(11, 9, 10, 2, '#4a4466');
  img.ellipse(16, 15, 3, 3, (x, y, nx, ny) => (nx * nx + ny * ny > 0.5 ? '#c9a24a' : '#e8e0c8'));
  img.set(16, 14, '#1a1420');
  img.set(16, 13, '#1a1420');
  img.set(17, 15, '#1a1420');
  img.rect(15, 24, 2, 6, '#ffc04a');
  img.rect(4, 26, 7, 4, '#1e1a2a');
  img.rect(21, 25, 8, 5, '#1e1a2a');
  img.poly(
    [
      [3, 26],
      [7, 22],
      [11, 26],
    ],
    '#4a2a2a',
  );
  img.poly(
    [
      [20, 25],
      [25, 21],
      [30, 25],
    ],
    '#2a3048',
  );
  img.set(6, 28, '#ffc04a');
  img.set(25, 27, '#ffc04a');
  return img;
}
