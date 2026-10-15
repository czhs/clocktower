// Town critters: a ginger tabby cat (16x16) and pigeons (8x8). Hand-placed pixel templates,
// shaded with v1 ramps, auto 1 px outline, dithered ground shadow.
import { Img, ramp, type Color } from '../lib/img.js';
import { ditherShadow, tpl } from './common.js';

const FUR = ramp('#c07a3e');
const CAT: Record<string, Color> = {
  K: FUR.d2, // stripes / far limbs
  D: FUR.d1,
  B: FUR.b,
  L: FUR.l1,
  H: FUR.l2,
  W: '#ece0c6', // cream chest / socks
  w: '#b4a48c',
  E: '#d8e060', // eyes
  e: '#3a2418', // closed eye / mouth line
  N: '#e08a8a', // nose
};

// --- side view, facing right. Rows 3..14, legs added per frame.
const SIDE_BODY = [
  '..K.......L..L..', // 3 ears + tail tip
  '.B........LLLB..', // 4
  '.B.......LHLEBW.', // 5
  '..B......LBBBWN.', // 6
  '..B......DBBWW..', // 7
  '...BLLLHLLBBW...', // 8
  '...BKBBKBBKBW...', // 9
  '...DKBBKBBKBw...', // 10
  '....DDDDDDDDw...', // 11
];

function catSide(f: number): Img {
  const img = new Img(16, 16);
  // tail sways a touch while walking
  const body = SIDE_BODY.slice();
  if (f === 2) {
    body[0] = '...K......L..L..';
    body[1] = '..B.......LLLB..';
  }
  tpl(img, body, CAT, 0, 3);
  // legs: [x, bottom-x offset, colour]; far legs darker
  const legs: Record<number, [number, number, string][]> = {
    0: [
      [4, 0, 'K'],
      [5, 0, 'D'],
      [10, 0, 'K'],
      [11, 0, 'W'],
    ],
    1: [
      [3, -1, 'K'],
      [6, 1, 'D'],
      [10, 1, 'K'],
      [12, -1, 'W'],
    ],
    2: [
      [4, 1, 'K'],
      [5, -1, 'D'],
      [11, -1, 'K'],
      [10, 1, 'W'],
    ],
  };
  for (const [x, dx, c] of legs[f]!) {
    img.set(x, 12, CAT[c]!);
    img.set(x, 13, CAT[c]!);
    img.set(x + dx, 14, CAT[c]!);
  }
  img.outline({ darken: 0.66 });
  ditherShadow(img, 8, 15, 6, 1);
  return img;
}

const FRONT = [
  '....L....B......', // 2 ears
  '....LL..BB......', // 3
  '....LHLLBBD.....', // 4
  '....LELLBEB.....', // 5
  '....LBWNWBD..B..', // 6
  '.....DWWWD...B..', // 7
  '....LBWWWBD.B...', // 8
  '....BBWWWBD.B...', // 9
  '....BBWWWBDB....', // 10
  '....DBWWWBDD....', // 11
];
const BACK = [
  '....L....B......', // 2
  '....LL..BB......', // 3
  '....LHLLBBD.....', // 4
  '....LKLLKBD.....', // 5
  '....LBBBBBD.....', // 6
  '.....DLLB.......', // 7
  '....LBBKLBD.....', // 8
  '....BKBBBKD.....', // 9
  '....BBBKBBD.....', // 10
  '....DBBBBDD.....', // 11
];

function catFront(f: number, back: boolean): Img {
  const img = new Img(16, 16);
  tpl(img, back ? BACK : FRONT, CAT, 0, 2);
  if (back) {
    // tail straight up the middle, tip curls
    const tx = f === 2 ? 8 : 7;
    for (let y = 3; y <= 8; y++) img.set(tx, y + (y < 5 ? 0 : 0), CAT[y < 5 ? 'K' : 'B']!);
    img.set(tx + (f === 1 ? -1 : 1), 3, CAT.K!);
  }
  // legs: two front (or hind) legs, one lifts per walk frame
  const lx = [5, 9];
  lx.forEach((x, k) => {
    const lifted = (f === 1 && k === 0) || (f === 2 && k === 1);
    const c = back ? (k === 0 ? 'B' : 'D') : 'W';
    img.set(x, 12, CAT[back ? c : k === 0 ? 'D' : 'D']!);
    img.set(x, 13, CAT[c]!);
    if (!lifted) img.set(x, 14, CAT[c]!);
    if (!back) {
      img.set(x + (k === 0 ? 1 : -1), 12, CAT.W!);
      img.set(x + (k === 0 ? 1 : -1), 13, CAT.w!);
      if (!lifted) img.set(x + (k === 0 ? 1 : -1), 14, CAT.W!);
    }
  });
  img.outline({ darken: 0.66 });
  ditherShadow(img, 7.5, 15, 5, 1);
  return img;
}

const SIT = [
  '.......L..B.....', // 2 ears
  '.......LLBB.....', // 3
  '......LHLBBW....', // 4
  '......LLBEBWN...', // 5
  '......DBBBWW....', // 6
  '.......LBDWW....', // 7
  '......LLBBWW....', // 8
  '.....LHBKBWW....', // 9
  '.....LBBBBWW....', // 10
  '.....BBKBBWw....', // 11
  '....LBBBBDWW....', // 12
  '.KKBBBBBDDWWW...', // 13
  '..KKDDDDDD.ww...', // 14
];
const SLEEP = [
  '..........L.L...', // 9
  '.....LLLLLLLLB..', // 10
  '....LHLBKBBLeBB.', // 11
  '...LBBKBBKBBBWN.', // 12
  '...DBBBBBBBBWW..', // 13
  '....KKKKKKKDWw..', // 14
];

function catPose(rows: string[], top: number): Img {
  const img = new Img(16, 16);
  tpl(img, rows, CAT, 0, top);
  img.outline({ darken: 0.66 });
  ditherShadow(img, 8, 15, 6, 1);
  return img;
}

export function cats(): Map<string, Img> {
  const out = new Map<string, Img>();
  for (let f = 0; f < 3; f++) {
    const r = catSide(f);
    out.set(`cat_down_${f}`, catFront(f, false));
    out.set(`cat_up_${f}`, catFront(f, true));
    out.set(`cat_left_${f}`, r.flipped());
    out.set(`cat_right_${f}`, r);
  }
  out.set('cat_sit', catPose(SIT, 2));
  out.set('cat_sleep', catPose(SLEEP, 9));
  return out;
}

// --- pigeons (8x8, facing right; flip for left)
const PIG = ramp('#7e8098');
const PG: Record<string, Color> = {
  K: PIG.d2,
  D: PIG.d1,
  B: PIG.b,
  L: PIG.l1,
  H: '#8a8ca4', // head
  N: '#4e8a78', // iridescent neck (green)
  M: '#7a5a96', // iridescent neck (violet)
  E: '#1a1018', // eye
  b: '#c8a8a0', // beak
  f: '#c06464', // feet
  W: '#2a2a3c', // wing bars
};
const PIGEON: string[][] = [
  [
    '........',
    '....HH..',
    '....HEb.',
    '...NM...',
    '..LLBB..',
    '.KBWBD..',
    '...f.f..',
    '........',
  ],
  [
    '........',
    '........',
    '....HH..',
    '...NHEb.',
    '.LLMB...',
    'KBWBBD..',
    '...f.f..',
    '........',
  ],
  [
    '........',
    '........',
    '........',
    '.LLB....',
    'KBWBNM..',
    '.DBBDHH.',
    '...f.fEb',
    '........',
  ],
];
const PIGEON_FLY: string[][] = [
  [
    '..L.....',
    '..LL....',
    '...LL.H.',
    '.KBBBNEb',
    '..DBBD..',
    '........',
    '........',
    '........',
  ],
  [
    '........',
    '........',
    '......H.',
    '.KBBBNEb',
    '..DLLD..',
    '...LL...',
    '...L....',
    '........',
  ],
];

function pigeonImg(rows: string[], shadow: boolean): Img {
  const img = new Img(8, 8);
  tpl(img, rows, PG);
  img.outline({ darken: 0.62 });
  if (shadow) {
    img.set(2, 7, '#140c1e');
    img.set(4, 7, '#140c1e');
  }
  return img;
}

export function pigeons(): Map<string, Img> {
  const out = new Map<string, Img>();
  PIGEON.forEach((r, i) => out.set(`pigeon_${i}`, pigeonImg(r, true)));
  PIGEON_FLY.forEach((r, i) => out.set(`pigeon_fly_${i}`, pigeonImg(r, false)));
  return out;
}
