// Polly the Polymorphic Parrot (15-150): a scarlet macaw (blue + yellow wing feathers, white face
// patches, big hooked ivory beak) in a black tee with a tiny white λ. The λ is never mirrored:
// left-facing frames are drawn mirrored WITHOUT the λ and the λ is stamped on afterwards.
import { ball, finish, GY, INK, layer, mirror, MIRROR_OF, newFrame, pose, ramp, sh, stamp, type Img, type Pose } from './lib-c.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const RED = ramp('#c4323c');
const YEL = ramp('#e2b23e');
const BLUE = ramp('#3a64b4');
const SHIRT = ramp('#2c2834');
const BEAK = ramp('#e6dac2');
const MAND = '#3a2e36';
const FACE = '#f0e8e2';
const LEGS = ramp('#9a8a86');
const LAMBDA = ['X...', '.X..', '.XX.', 'X..X'];
const LW = 4;

interface Out {
  img: Img;
  /** top-left of the λ (if visible). */
  lam?: [number, number];
}

function legsFront(img: Img, p: Pose, xs: [number, number]) {
  for (const [k, side] of [-1, 1].entries()) {
    const lx = xs[k]!;
    const lift = p.step !== 0 && side !== p.step ? 1 : 0;
    img.vline(lx, 33, GY - 1 - lift, LEGS.d1);
    img.hline(lx - 1, lx + 1, GY - lift, LEGS.b);
    img.set(lx + side, GY - lift, LEGS.d1);
  }
}

/** A hanging wing: red shoulder, yellow band, blue flight feathers. */
function wing(l: Img, x: number, top: number, w: number, len: number, light: number) {
  for (let j = 0; j < len; j++) {
    const r = j < len * 0.45 ? RED : j < len * 0.72 ? YEL : BLUE;
    for (let i = 0; i < w; i++) {
      if (j === len - 1 && (i === 0 || i === w - 1) && w > 1) continue;
      l.set(x + i, top + j, sh(r, light - i * 0.15 - j * 0.02));
    }
  }
}

function tee(l: Img, x0: number, x1: number, top: number, bottom: number, light = 0.62) {
  for (let y = top; y <= bottom; y++)
    for (let x = x0; x <= x1; x++) {
      if ((y === top || y === bottom) && (x === x0 || x === x1)) continue;
      l.set(x, y, sh(SHIRT, light - ((x - x0) / (x1 - x0)) * 0.4 - ((y - top) / (bottom - top)) * 0.1 + (y === bottom ? -0.2 : 0)));
    }
}

/** Long tail feathers, red fading to blue tips, drawn as a thick line. */
function tail(l: Img, pts: [number, number][], w = 2) {
  const n = pts.length;
  for (let k = 0; k < n - 1; k++) {
    const [x0, y0] = pts[k]!;
    const [x1, y1] = pts[k + 1]!;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const t = (k + s / Math.max(1, steps)) / (n - 1);
      const x = Math.round(x0 + ((x1 - x0) * s) / Math.max(1, steps));
      const y = Math.round(y0 + ((y1 - y0) * s) / Math.max(1, steps));
      const r = t < 0.6 ? RED : BLUE;
      for (let i = 0; i < w; i++) l.set(x + i, y, sh(r, 0.55 - i * 0.2));
    }
  }
}

function eyePatch(img: Img, x: number, y: number, w: number) {
  for (let j = 0; j < 4; j++) for (let i = 0; i < w; i++) if (!((j === 0 || j === 3) && (i === 0 || i === w - 1)) || w < 3) img.set(x + i, y + j, FACE);
}

function down(p: Pose): Out {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legsFront(img, p, [14, 17]);
  layer(img, (l) => {
    ball(l, 16, 32.5 + b, 4.5, 2.6, RED);
    tee(l, 11, 20, 21 + b, 31 + b);
    // sleeves
    l.rect(9, 21 + b, 2, 4, SHIRT.b);
    l.rect(21, 21 + b, 2, 4, SHIRT.d1);
    l.set(9, 21 + b, SHIRT.l1);
  });
  layer(img, (l) => {
    wing(l, 9, 25 + b - s, 2, 7, 0.65);
    wing(l, 21, 25 + b + s, 2, 7, 0.45);
  });
  layer(img, (l) => {
    ball(l, 16, 15 + b, 6, 5.5, RED, 0.05);
    l.set(16, 9 + b, RED.l1);
    l.set(17, 8 + b, RED.b);
  });
  eyePatch(img, 11, 13 + b, 3);
  eyePatch(img, 18, 13 + b, 3);
  img.vline(12, 14 + b, 15 + b, INK);
  img.vline(19, 14 + b, 15 + b, INK);
  // big hooked beak
  stamp(img, 14, 15 + b, ['abcd', 'bccd', 'mccd', '.mcd', '..d.'], { a: BEAK.l2, b: BEAK.l1, c: BEAK.b, d: BEAK.d1, m: MAND });
  return { img, lam: [14, 24 + b] };
}

function downRight(p: Pose): Out {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legsFront(img, p, [14, 18]);
  layer(img, (l) => {
    tail(l, [[12, 30 + b], [10, 34], [8, 37]]);
    ball(l, 16.5, 32.5 + b, 4.5, 2.6, RED);
    tee(l, 11, 21, 21 + b, 31 + b);
    l.rect(9, 21 + b, 2, 4, SHIRT.b);
    l.rect(22, 21 + b, 1, 4, SHIRT.d1);
  });
  layer(img, (l) => {
    wing(l, 9, 25 + b - s, 2, 7, 0.65);
    wing(l, 22, 25 + b + s, 1, 7, 0.4);
  });
  layer(img, (l) => {
    ball(l, 17, 15 + b, 6, 5.5, RED, 0.05);
    l.set(16, 9 + b, RED.l1);
    l.set(17, 8 + b, RED.b);
  });
  eyePatch(img, 13, 13 + b, 2);
  eyePatch(img, 19, 13 + b, 3);
  img.vline(14, 14 + b, 15 + b, INK);
  img.vline(20, 14 + b, 15 + b, INK);
  stamp(img, 16, 15 + b, ['abccd', 'bcccd', '.mccd', '..mcd', '...d.'], { a: BEAK.l2, b: BEAK.l1, c: BEAK.b, d: BEAK.d1, m: MAND });
  return { img, lam: [16, 24 + b] };
}

function right(p: Pose): Out {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  const legs: [number, boolean][] = s === 0 ? [[15, false]] : [[13, true], [17, false]];
  for (const [lx, back] of legs) {
    img.vline(lx, 33, GY - 1, back ? LEGS.d2 : LEGS.d1);
    img.hline(lx - 1, lx + 2, GY, back ? LEGS.d1 : LEGS.b);
  }
  layer(img, (l) => {
    tail(l, [[12, 28 + b], [9, 33], [6, 37]]);
    ball(l, 15.5, 32.5 + b, 4, 2.6, RED);
    tee(l, 11, 19, 21 + b, 31 + b, 0.55);
  });
  layer(img, (l) => {
    // near sleeve + wing, swinging
    l.rect(13, 21 + b, 4, 3, SHIRT.b);
    l.set(13, 21 + b, SHIRT.l1);
    wing(l, 14 - s, 24 + b, 3, 8, 0.65);
  });
  layer(img, (l) => {
    ball(l, 16, 15 + b, 5.6, 5.4, RED, 0.05);
    l.set(14, 9 + b, RED.l1);
    l.set(13, 8 + b, RED.b);
  });
  eyePatch(img, 17, 13 + b, 3);
  img.vline(18, 14 + b, 15 + b, INK);
  stamp(img, 20, 14 + b, ['abc..', 'bcccd', 'mcccd', 'mm.cd', '....d'], { a: BEAK.l2, b: BEAK.l1, c: BEAK.b, d: BEAK.d1, m: MAND });
  return { img };
}

function upRight(p: Pose): Out {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legsFront(img, p, [14, 18]);
  layer(img, (l) => {
    ball(l, 16, 32.5 + b, 4.5, 2.6, RED, -0.1);
    l.rect(9, 21 + b, 2, 4, SHIRT.b);
    l.rect(21, 21 + b, 2, 4, SHIRT.d1);
    tee(l, 11, 21, 21 + b, 31 + b, 0.55);
  });
  layer(img, (l) => {
    wing(l, 9, 25 + b + s, 2, 7, 0.6);
    wing(l, 21, 25 + b - s, 2, 7, 0.4);
    tail(l, [[13, 29 + b], [12, 33], [11, 37]], 3);
  });
  layer(img, (l) => {
    ball(l, 15.5, 15 + b, 6, 5.5, RED, -0.05);
    l.set(14, 9 + b, RED.l1);
    l.set(13, 8 + b, RED.b);
  });
  img.set(21, 16 + b, BEAK.b);
  img.set(21, 17 + b, BEAK.d1);
  return { img };
}

function up(p: Pose): Out {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legsFront(img, p, [13, 18]);
  layer(img, (l) => {
    ball(l, 16, 32.5 + b, 4.5, 2.6, RED, -0.1);
    l.rect(9, 21 + b, 2, 4, SHIRT.b);
    l.rect(21, 21 + b, 2, 4, SHIRT.d1);
    tee(l, 11, 20, 21 + b, 31 + b, 0.55);
  });
  layer(img, (l) => {
    wing(l, 9, 25 + b + s, 2, 7, 0.6);
    wing(l, 21, 25 + b - s, 2, 7, 0.4);
    tail(l, [[15, 29 + b], [15, 37]], 2);
  });
  layer(img, (l) => {
    ball(l, 16, 15 + b, 6, 5.5, RED, -0.05);
    l.set(15, 9 + b, RED.l1);
    l.set(14, 8 + b, RED.b);
  });
  return { img };
}

function render(dir: DrawnDir, frame: FrameIndex): Out {
  const p = pose(frame);
  const o = dir === 'down' ? down(p) : dir === 'down-right' ? downRight(p) : dir === 'right' ? right(p) : dir === 'up-right' ? upRight(p) : up(p);
  finish(o.img, 7);
  return o;
}
function withLambda(img: Img, lam: [number, number] | undefined, flip: boolean) {
  if (!lam) return img;
  const x = flip ? img.w - lam[0] - LW : lam[0];
  stamp(img, x, lam[1], LAMBDA, { X: '#f2eee6' });
  return img;
}

const art: CharacterArt = {
  id: 'polly',
  draw(dir, frame) {
    const o = render(dir, frame);
    return withLambda(o.img, o.lam, false);
  },
  drawMirrored(dir, frame) {
    const o = render(MIRROR_OF[dir], frame);
    return withLambda(mirror(o.img), o.lam, true);
  },
};
export default art;
