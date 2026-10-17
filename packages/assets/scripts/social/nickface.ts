// The NICK-FACE emote (only Nick Song may use it): for a few seconds his whole head (hair included)
// is replaced by a pixel-art 😝 — a round warm-yellow ball with an orange rim, eyes squeezed shut as
// '>' '<', a wide open grin and a pink-red tongue sticking out and down. Drawn procedurally at the
// cast head size (the v1 townsfolk head is 10x10 plus hair; the ball is 16x16 so it covers the hair).
//
// Placement (client): hide every pixel of the avatar frame above row NICK_FACE_CROP_Y (frame px),
// then draw `nick_face` with its anchor (bottom centre, the "neck") at the avatar's feet + NECK.
import { col, Img, type RGBA } from '../lib/img.js';

export const NICK_FACE_SIZE = 16;
/** Frame pixel that sits on the neck: bottom centre of the ball. */
export const NICK_FACE_ANCHOR = { x: 8, y: 15 };
/** Neck point relative to the avatar's feet anchor (world px): ball spans cast frame x 8..23, y 10..25. */
export const NICK_FACE_NECK = { x: 0, y: -13 };
/** Cast-frame rows above this are hidden while the emote plays (head + hair; the torso starts at 24). */
export const NICK_FACE_CROP_Y = 24;

const OUT = col('#5c2a0a');
const RIM = col('#e8861c');
const SHADE = col('#f6a826');
const FILL = col('#ffcc36');
const LIGHT = col('#ffe680');
const GLINT = col('#fff6c8');
const INK = col('#2a0e04');
const MOUTH = col('#5a1414');
const TEETH = col('#fff8ea');
const TONGUE = col('#ff6a86');
const TONGUE_SH = col('#d8344e');
const TONGUE_HI = col('#ffa0b2');

export function buildNickFace(): Img {
  const N = NICK_FACE_SIZE;
  const im = new Img(N, N);
  const c = (N - 1) / 2;
  // the ball: dark rim outline, orange rim/shading towards the lower right, a soft highlight top-left
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > c + 0.45) continue;
      let p: RGBA;
      if (d > c - 0.6) p = OUT;
      else {
        const lit = (-dx - dy) / c; // +1 upper-left .. -1 lower-right
        if (d > c - 1.7 && lit < 0.3) p = RIM;
        else if (lit < -0.75) p = SHADE;
        else if (lit > 0.9 && d > 3.2 && d < c - 1.4) p = LIGHT;
        else p = FILL;
      }
      im.set(x, y, p);
    }
  im.set(4, 3, GLINT);
  im.set(5, 3, GLINT);
  im.set(3, 4, GLINT);
  // eyes squeezed shut: '>' (left) and '<' (right), 3 wide x 5 tall
  const chevron = (x0: number, right: boolean) => {
    const pts: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [1, 3],
      [0, 4],
    ];
    for (const [i, j] of pts) im.set(right ? x0 + i : x0 + 2 - i, 3 + j, INK);
    // a 2 px thick inner stroke so it reads at 1x
    im.set(x0 + 1, 3 + 2, INK);
  };
  chevron(3, true);
  chevron(10, false);
  // wide open grin (a "D" laid flat): lip line, upper teeth, dark mouth
  const rows: [number, number, number][] = [
    // y, x0, x1
    [9, 3, 12],
    [10, 3, 12],
    [11, 4, 11],
    [12, 5, 10],
  ];
  for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) im.set(x, y, MOUTH);
  for (let x = 4; x <= 11; x++) im.set(x, 9, x === 4 || x === 11 ? MOUTH : TEETH);
  im.set(2, 9, INK); // grin corners curl up
  im.set(13, 9, INK);
  im.set(3, 8, INK);
  im.set(12, 8, INK);
  im.hline(4, 11, 13, INK); // lower lip edge under the mouth
  im.set(3, 12, INK);
  im.set(12, 12, INK);
  im.set(3, 11, INK);
  im.set(12, 11, INK);
  // the tongue: out of the lower lip, hanging down over the chin, a little right of centre
  const tongue: [number, number, RGBA][] = [
    [7, 11, TONGUE_HI],
    [8, 11, TONGUE],
    [9, 11, TONGUE],
    [10, 11, TONGUE_SH],
    [7, 12, TONGUE],
    [8, 12, TONGUE_SH], // the middle groove
    [9, 12, TONGUE],
    [10, 12, TONGUE_SH],
    [7, 13, TONGUE],
    [8, 13, TONGUE_SH],
    [9, 13, TONGUE],
    [10, 13, TONGUE_SH],
    [8, 14, TONGUE_SH],
    [9, 14, TONGUE_SH],
  ];
  for (const [x, y, p] of tongue) im.set(x, y, p);
  im.set(6, 12, INK);
  im.set(6, 13, INK);
  im.set(11, 13, INK);
  im.set(7, 14, INK);
  im.set(10, 14, INK);
  im.set(8, 15, OUT);
  im.set(9, 15, OUT);
  return im;
}
