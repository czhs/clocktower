// Small square props: name board, boarded-up door, closed shutters, brazier.
import { bayer, dpick, hash, Img, vnoise } from '../lib/img.js';
import { BRASS, ditherShadow, FIRE, glowMax, IRON, PARCH, STONE, WOOD, WOOD_LIGHT, WOOD_OLD } from './common.js';
import { boardUp } from './houses.js';

// ---------------------------------------------------------------------------------------
// Name board: a little wooden board on a post beside a cottage door. The client prints the
// resident's name on the parchment (BOARD_PARCHMENT, relative to the frame).

export const BOARD_W = 22;
export const BOARD_H = 28;
export const BOARD_PARCHMENT = { x: 4, y: 7, w: 14, h: 9 };

export function board(): Img {
  const img = new Img(BOARD_W, BOARD_H);
  const b = BOARD_H - 2; // ground row (feet of the post)
  // post
  for (let y = 17; y <= b; y++) {
    img.set(10, y, WOOD[3]!);
    img.set(11, y, WOOD[1]!);
  }
  img.set(10, 19, WOOD[4]!);
  img.set(11, 22, WOOD[0]!);
  // stone footing
  img.rect(8, b - 1, 6, 2, STONE[3]!);
  img.hline(8, 13, b - 1, STONE[4]!);
  img.set(13, b, STONE[1]!);
  // board frame (2 px wood border, lit top/left)
  const x0 = 2;
  const y0 = 4;
  const w = 18;
  const h = 14;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let v = 0.45 + (vnoise(i * 3, j, 3, 41) - 0.5) * 0.3;
      if (j === 0 || i === 0) v += 0.3;
      if (j === h - 1 || i === w - 1) v -= 0.3;
      img.set(x0 + i, y0 + j, dpick(WOOD_LIGHT, v, x0 + i, y0 + j));
    }
  // inner bevel (dark groove around the parchment)
  const P = BOARD_PARCHMENT;
  img.rect(P.x - 1, P.y - 1, P.w + 2, P.h + 2, WOOD[1]!);
  // parchment: light, low-noise so printed names stay legible
  for (let j = 0; j < P.h; j++)
    for (let i = 0; i < P.w; i++) {
      let v = 0.78 - j * 0.012 + (hash(i, j, 77) - 0.5) * 0.06;
      if (i === 0 || j === 0) v += 0.08;
      if (i === P.w - 1 || j === P.h - 1) v -= 0.22;
      img.set(P.x + i, P.y + j, dpick(PARCH, v, P.x + i, P.y + j));
    }
  // curled lower-right corner
  img.set(P.x + P.w - 1, P.y + P.h - 1, WOOD[1]!);
  img.set(P.x + P.w - 2, P.y + P.h - 1, PARCH[1]!);
  img.set(P.x + P.w - 1, P.y + P.h - 2, PARCH[1]!);
  // little roof cap (two shingle rows) keeps it cottage-like and readable at small zoom
  const roof = ['#24141a', '#3a1c22', '#52262a', '#6a3230', '#844238'];
  for (let j = 0; j < 4; j++) {
    const ins = 3 - j;
    for (let i = ins; i < BOARD_W - ins - 1; i++) {
      let v = j === 0 ? 0.85 : j === 3 ? 0.15 : 0.5 + ((i + j * 2) % 4 === 0 ? -0.25 : 0);
      if (i > BOARD_W / 2) v -= 0.1;
      img.set(i, 1 + j, dpick(roof, v, i, 1 + j));
    }
  }
  // brass nails
  for (const [nx, ny] of [
    [3, 6],
    [18, 6],
    [3, 16],
    [18, 16],
  ] as const)
    img.set(nx, ny, BRASS[3]!);
  img.outline({ darken: 0.7 });
  ditherShadow(img, 11, b + 1, 5, 1.2);
  return img;
}

/** A red map pin (3x4 plus outline) the client can stick on the board. */
export function boardPin(): Img {
  const img = new Img(5, 6);
  img.set(1, 1, '#d84a4a');
  img.set(2, 1, '#a02a32');
  img.set(1, 2, '#a02a32');
  img.set(2, 2, '#701c26');
  img.set(1, 1, '#f08a7a');
  img.set(2, 3, '#b4aeb8');
  img.set(2, 4, '#6a6470');
  img.outline({ darken: 0.7 });
  return img;
}

// ---------------------------------------------------------------------------------------
// Generic boarded-up door for the standard camera-facing cottage door (12x20, arched leaf as
// in buildings.ts leafIn()). Per-cottage exact versions (boarded_<id>, incl. sheared side doors)
// come from houses.ts; prefer those.
export const DOOR_W = 12;
export const DOOR_H = 20;

export function boarded(): Img {
  const mask = new Img(DOOR_W, DOOR_H);
  const r = DOOR_W / 2;
  const ar = Math.min(4, Math.ceil(DOOR_W / 3));
  for (let j = 0; j < DOOR_H; j++)
    for (let i = 0; i < DOOR_W; i++) if (j >= ar || Math.hypot(i + 0.5 - r, (j + 0.5 - ar) * (r / ar)) <= r + 0.05) mask.set(i, j, '#ffffff');
  return boardUp(mask, 5);
}

// Closed shutters over a camera-facing cottage window (10x10 glass + 1 px frame = 12x12).
// Anchor (6,6) = the window's glow point (BuildingSprite.windows: x, winTop+5).
export const SHUT_W = 12;
export const SHUT_H = 12;

export function shutters(): Img {
  const img = new Img(SHUT_W, SHUT_H);
  const pal = WOOD_OLD;
  const half = SHUT_W / 2;
  for (let j = 0; j < SHUT_H; j++)
    for (let i = 0; i < SHUT_W; i++) {
      const left = i < half;
      const li = left ? i : i - half;
      let v = 0.5 + (vnoise(i * 3, j, 4, 21) - 0.5) * 0.3 + (left ? 0.08 : -0.06);
      if (li % 3 === 2) v -= 0.3;
      if (li === 0) v += 0.15;
      if (j === 0) v += 0.2;
      if (j === SHUT_H - 1) v -= 0.25;
      img.set(i, j, dpick(pal, v + (bayer(i, j) - 0.5) * 0.06, i, j));
    }
  for (let j = 0; j < SHUT_H; j++) {
    img.set(0, j, IRON[1]!);
    img.set(SHUT_W - 1, j, IRON[1]!);
    img.set(half - 1, j, '#0c0a10');
  }
  img.hline(0, SHUT_W - 1, 0, IRON[1]!);
  img.hline(0, SHUT_W - 1, SHUT_H - 1, IRON[1]!);
  // Z braces
  for (const ox of [1, half]) {
    img.hline(ox, ox + 3, 2, pal[4]!);
    img.hline(ox, ox + 3, 8, pal[4]!);
    for (let k = 0; k < 5; k++) img.set(ox + 3 - Math.round(k * 0.75), 3 + k, pal[4]!);
    img.hline(ox, ox + 3, 3, pal[1]!);
    img.hline(ox, ox + 3, 9, pal[1]!);
  }
  img.set(half - 1, 5, IRON[3]!);
  img.set(half, 5, IRON[3]!);
  img.set(half, 6, IRON[0]!);
  return img;
}

// ---------------------------------------------------------------------------------------
// Brazier: stone pedestal, iron bowl, flickering flame. 16x24, feet at (8,23).

export const BRAZIER_W = 16;
export const BRAZIER_H = 24;

function brazierBase(): Img {
  const img = new Img(BRAZIER_W, BRAZIER_H);
  const b = BRAZIER_H - 2;
  // plinth
  for (let y = b - 2; y <= b; y++)
    for (let x = 3; x <= 12; x++) img.set(x, y, dpick(STONE, (y === b - 2 ? 0.85 : 0.45) - (x - 3) * 0.04 + (hash(x, y, 3) - 0.5) * 0.15, x, y));
  // column
  for (let y = 15; y < b - 2; y++)
    for (let x = 5; x <= 10; x++) {
      let v = 0.62 - (x - 5) * 0.09 + (hash(x >> 1, y >> 1, 4) - 0.5) * 0.15;
      if (y === 17) v -= 0.3; // mortar line
      img.set(x, y, dpick(STONE, v, x, y));
    }
  // iron bowl, tapering
  const rows: [number, number, number][] = [
    [11, 2, 13],
    [12, 3, 12],
    [13, 4, 11],
    [14, 5, 10],
  ];
  for (const [y, xa, xb] of rows)
    for (let x = xa; x <= xb; x++) {
      let v = 0.55 - (x - xa) / (xb - xa) * 0.5 + (y === 11 ? 0.3 : 0);
      if ((x - xa) % 3 === 0 && y > 11) v -= 0.15; // riveted bands
      img.set(x, y, dpick(IRON, v, x, y));
    }
  img.set(3, 12, BRASS[2]!);
  img.set(12, 12, BRASS[1]!);
  // glowing coals in the bowl mouth
  for (let x = 3; x <= 12; x++) img.set(x, 10, dpick(['#3a120c', '#7a2414', '#c04a1c', '#f08a30'], 0.5 + Math.sin(x * 1.9) * 0.3, x, 10));
  img.outline({ darken: 0.68 });
  ditherShadow(img, 8, b + 1, 6, 1.4);
  return img;
}

/** Flame body: tongues sway per frame, white-hot core, dark-red tips. */
function brazierFlame(img: Img, f: number) {
  const base = 10; // flame sits on the coals (row 10)
  const cx = 7.5;
  const phase = f * (Math.PI / 2);
  // three tongues, heights cycle so the silhouette changes every frame
  const tongues = [
    { x: cx - 2.2, h: 6 + 1.5 * Math.sin(phase + 0.4), w: 2.4 },
    { x: cx + 0.2, h: 9 + 1.5 * Math.sin(phase + 2.1), w: 3.2 },
    { x: cx + 2.4, h: 5.5 + 1.5 * Math.sin(phase + 4.2), w: 2.2 },
  ];
  const heat = new Float32Array(BRAZIER_W * BRAZIER_H);
  for (const t of tongues)
    for (let y = base - Math.ceil(t.h); y <= base; y++) {
      const u = (base - y) / t.h; // 0 at base, 1 at tip
      if (u >= 1) continue;
      const sway = Math.sin(u * 2.6 + phase + t.x) * u * 1.1;
      const hw = t.w * Math.pow(1 - u, 0.75) + 0.35;
      for (let x = 0; x < BRAZIER_W; x++) {
        const d = Math.abs(x + 0.5 - (t.x + sway)) / hw;
        if (d >= 1) continue;
        const h = (1 - d) * (1 - u * 0.75);
        const k = y * BRAZIER_W + x;
        heat[k] = Math.max(heat[k]!, h);
      }
    }
  for (let y = 0; y <= base; y++)
    for (let x = 0; x < BRAZIER_W; x++) {
      const h = heat[y * BRAZIER_W + x]!;
      if (h <= 0.02) continue;
      const v = Math.min(1, h * 1.25 + (y === base ? 0.15 : 0));
      img.set(x, y, dpick(FIRE, v, x, y));
    }
  // a spark or two drifting up
  const sparks: [number, number][] = [
    [5 + (f % 2) * 4, 1 - (f % 2)],
    [9 - f, 3 - Math.floor(f / 2)],
  ];
  for (const [sx, sy] of sparks) if (sy >= 0 && heat[sy * BRAZIER_W + sx]! < 0.02) img.set(sx, sy, f % 2 ? FIRE[3]! : FIRE[2]!);
}

export function brazier(f: number): Img {
  const img = brazierBase();
  brazierFlame(img, f);
  return img;
}

/** Warm halo for lamps / the brazier, three flicker strengths (24x24, partial alpha). */
export function lampGlow(f: number): Img {
  const img = new Img(24, 24);
  const peak = [0.5, 0.42, 0.56][f]!;
  const r = [11.5, 10.8, 11.8][f]!;
  glowMax(img, 12, 12, r, r, '#ffb860', peak, 1.8);
  return img;
}
