// The POINT emote: a white cartoon glove (gold cuff) pointing in one of 8 directions, with a
// 3-frame "jab" toward the target, plus a ground "ping" ring drawn at the pointed spot.
import { col, Img, type RGBA } from '../lib/img.js';

export const POINT_DIRS = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'] as const;
export type PointDir = (typeof POINT_DIRS)[number];
/** Unit-ish vectors (screen space, y down) for each direction. */
export const POINT_VEC: Record<PointDir, [number, number]> = {
  right: [1, 0],
  'down-right': [0.7071, 0.7071],
  down: [0, 1],
  'down-left': [-0.7071, 0.7071],
  left: [-1, 0],
  'up-left': [-0.7071, -0.7071],
  up: [0, -1],
  'up-right': [0.7071, -0.7071],
};
export const POINT_SIZE = 20;
/** Fist centre at rest (frame 0). Place this point beside the character's head. */
export const POINT_CENTER = { x: 10, y: 10 };
const JAB = [0, 1, 2];

const OUT = col('#26182c');
const GLOVE = { hi: col('#fffbf0'), b: col('#eee4d0'), sh: col('#bfaea6'), crease: col('#9a868c') };
const CUFF = { hi: col('#f2cc66'), b: col('#d29a34'), sh: col('#9a6424') };

type L = 0 | 1 | 2 | 3; // 0 empty, 1 glove, 2 cuff, 3 crease

/**
 * Hand pointing RIGHT as a label template (fist ~ centre, index finger to the right, thumb lying
 * on top, gold cuff on the left). '.' empty, 'w' glove, 'c' cuff, 'k' crease (curled fingers).
 */
const RIGHT = [
  '....www........', //
  '...wwwwk.......',
  'ccwwwwwwwwwwwww',
  'ccwwwwwwwwwwwww',
  'ccwwwwwwkk.....',
  'ccwwwwwwwk.....',
  'ccwwwwwwww.....',
  '..wwwwwwk......',
  '...wwwww.......',
];
/** Hand pointing UP-RIGHT. */
const UPRIGHT = [
  '..........ww', //
  '.........www',
  '........www.',
  '.......www..',
  '...wwwwww...',
  '..wwwwwwkk..',
  '.cwwwwwwwww.',
  'ccwwwwwwkk..',
  'cwwwwwwwww..',
  'ccwwwwwwk...',
  '.ccwwwwww...',
  '..ccwww.....',
];
const lab = (ch: string): L => (ch === 'w' ? 1 : ch === 'c' ? 2 : ch === 'k' ? 3 : 0);
const parse = (t: string[]): L[][] => t.map((r) => [...r].map(lab));

// grid transforms (x right, y down)
const rotCW = (g: L[][]): L[][] => {
  const h = g.length;
  const w = g[0]!.length;
  return Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => g[h - 1 - x]![y]!));
};
const flipX = (g: L[][]): L[][] => g.map((r) => [...r].reverse());

function grid(dir: PointDir): L[][] {
  const R = parse(RIGHT);
  const U = parse(UPRIGHT);
  switch (dir) {
    case 'right':
      return R;
    case 'left':
      return flipX(R);
    case 'down':
      return rotCW(R);
    case 'up':
      return rotCW(rotCW(rotCW(R)));
    case 'up-right':
      return U;
    case 'up-left':
      return flipX(U);
    case 'down-right':
      return rotCW(U);
    case 'down-left':
      return flipX(rotCW(U));
  }
}

/** Fist centre inside each template grid (so every direction pivots around the same point). */
function fistCentre(g: L[][]): [number, number] {
  // centroid of glove pixels weighted toward the fist (the finger is thin, so plain centroid is close)
  let sx = 0;
  let sy = 0;
  let n = 0;
  g.forEach((r, y) =>
    r.forEach((v, x) => {
      if (v === 0) return;
      // count pixels with many neighbours (fist) more
      let k = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        if ((g[y + dy]?.[x + dx] ?? 0) !== 0) k++;
      const w = k === 4 ? 3 : 1;
      sx += (x + 0.5) * w;
      sy += (y + 0.5) * w;
      n += w;
    }),
  );
  return [sx / n, sy / n];
}

export function drawHand(dir: PointDir, frame: number): Img {
  const g = grid(dir);
  const [fx, fy] = fistCentre(g);
  const [vx, vy] = POINT_VEC[dir];
  const j = JAB[frame]!;
  const ox = Math.round(POINT_CENTER.x - fx + vx * j * 1.2);
  const oy = Math.round(POINT_CENTER.y - fy + vy * j * 1.2);
  const img = new Img(POINT_SIZE, POINT_SIZE);
  const at = (x: number, y: number): L => g[y - oy]?.[x - ox] ?? 0;
  for (let y = 0; y < POINT_SIZE; y++)
    for (let x = 0; x < POINT_SIZE; x++) {
      const v = at(x, y);
      if (!v) continue;
      // auto-shade from the upper left
      const lit = at(x - 1, y) === 0 || at(x, y - 1) === 0;
      const dark = at(x + 1, y) === 0 || at(x, y + 1) === 0;
      let c: RGBA;
      if (v === 2) c = lit && !dark ? CUFF.hi : dark && !lit ? CUFF.sh : CUFF.b;
      else if (v === 3) c = GLOVE.crease;
      else c = lit && !dark ? GLOVE.hi : dark && !lit ? GLOVE.sh : GLOVE.b;
      img.set(x, y, c);
    }
  img.outline({ color: OUT });
  // speed ticks behind the hand on the jab frame
  if (frame === 2) {
    const px = -vy;
    const py = vx;
    for (const s of [-1, 1]) {
      const bx = POINT_CENTER.x - vx * 8 + px * s * 3;
      const by = POINT_CENTER.y - vy * 8 + py * s * 3;
      img.set(Math.round(bx), Math.round(by), GLOVE.b);
      img.set(Math.round(bx - vx), Math.round(by - vy), GLOVE.sh);
    }
  }
  return img;
}

/** Ground ping at the pointed spot: a flattened gold ring that expands and fades. */
export const PING_W = 28;
export const PING_H = 14;
export const PING_ANCHOR = { x: 14, y: 7 };
const PING_HI = col('#fff3c4');
const PING_B = col('#f0bc48');
const PING_D = col('#c08428');
const PING_SH: RGBA = [24, 12, 30, 140];
export function ping(f: number): Img {
  const img = new Img(PING_W, PING_H);
  const cx = PING_ANCHOR.x;
  const cy = PING_ANCHOR.y + 0.5;
  const rx = [4.2, 7.5, 10.5, 13.2][f]!;
  const ry = [2.2, 3.4, 4.7, 5.9][f]!;
  const inE = (x: number, y: number, a: number, b: number, dy = 0) => ((x + 0.5 - cx) / a) ** 2 + ((y + 0.5 - cy - dy) / b) ** 2 <= 1;
  const ring = (x: number, y: number, dy = 0) => inE(x, y, rx, ry, dy) && !inE(x, y, rx - 1.5, ry - 1, dy);
  const dither = (x: number, y: number) => f === 3 && (x + y) % 2 === 1;
  for (let y = 0; y < PING_H; y++)
    for (let x = 0; x < PING_W; x++) {
      if (ring(x, y) || !ring(x, y, 1) || dither(x, y)) continue;
      img.set(x, y, PING_SH);
    }
  for (let y = 0; y < PING_H; y++)
    for (let x = 0; x < PING_W; x++) {
      if (!ring(x, y) || dither(x, y)) continue;
      const top = y + 0.5 < cy;
      img.set(x, y, f === 3 ? PING_D : top && x + 0.5 < cx + 2 ? PING_HI : top ? PING_B : PING_D);
    }
  if (f <= 1) {
    // bright centre dot
    img.set(cx - 1, PING_ANCHOR.y, PING_HI);
    img.set(cx, PING_ANCHOR.y, PING_B);
    img.set(cx - 1, PING_ANCHOR.y + 1, PING_SH);
    img.set(cx, PING_ANCHOR.y + 1, PING_SH);
  }
  return img;
}

/** The emote-palette button icon (12x12): the glove pointing up-right. */
export function emoteIcon(): Img {
  const big = drawHand('up-right', 0);
  // trim to the drawn bounds, centre in 14x14
  let x0 = big.w;
  let y0 = big.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < big.h; y++)
    for (let x = 0; x < big.w; x++)
      if (big.alpha(x, y) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const S = Math.max(w, h);
  const o = new Img(S, S);
  o.copy(big, Math.floor((S - w) / 2), Math.floor((S - h) / 2), x0, y0, w, h);
  return o;
}

export function buildPoint(): [string, Img][] {
  const out: [string, Img][] = [];
  for (const d of POINT_DIRS) for (let f = 0; f < 3; f++) out.push([`point_${d}_${f}`, drawHand(d, f)]);
  for (let f = 0; f < 4; f++) out.push([`ping_${f}`, ping(f)]);
  out.push(['emote_point', emoteIcon()]);
  return out;
}
