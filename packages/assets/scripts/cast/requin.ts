// Requin the Shark (15-213): a friendly upright grey-blue shark on stubby legs, white belly, a
// toothy grin, dorsal fin and tail, a black beret worn at a jaunty angle and a red neckerchief.
// Carries a little lit bomb in one fin (bomb lab — it's personal).
import { ball, finish, GLINT, GY, INK, layer, newFrame, pose, ramp, sh, type Img, type Pose } from './lib-c.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const SKIN = ramp('#6c88a4');
const BELLY = ramp('#e4e2dc');
const BERET = ramp('#2a2632');
const SCARF = ramp('#b8343c');
const BOMB = ramp('#3a3644');
const MOUTH = '#4a1c2c';
const TOOTH = '#f6f2ea';

function legs(img: Img, p: Pose, xs: [number, number]) {
  for (const [k, side] of [-1, 1].entries()) {
    const lx = xs[k]!;
    const lift = p.step !== 0 && side !== p.step ? 1 : 0;
    img.vline(lx, 33, GY - lift, sh(SKIN, side < 0 ? 0.5 : 0.3));
    img.vline(lx + 1, 33, GY - lift, sh(SKIN, side < 0 ? 0.35 : 0.2));
    img.set(lx + (side < 0 ? -1 : 2), GY - lift, SKIN.d1);
  }
}

/** Lit bomb with a short fuse and a spark (the spark flickers between two pixels per frame pair). */
function bomb(img: Img, x: number, y: number, f: number) {
  layer(img, (l) => ball(l, x, y, 2.6, 2.6, BOMB, 0.1));
  img.set(Math.round(x - 1), Math.round(y - 1.5), BOMB.l2);
  img.set(Math.round(x + 1), Math.round(y - 3), '#9a8a6a');
  img.set(Math.round(x + 2), Math.round(y - 4), '#9a8a6a');
  const spark = f % 2 === 0 ? '#ffd860' : '#ff9a3a';
  img.set(Math.round(x + 3), Math.round(y - 5), spark);
  img.set(Math.round(x + 3), Math.round(y - 6), '#fff1b0');
}

/** 2x2 friendly eye with a glint. */
function eye(img: Img, x: number, y: number) {
  img.rect(x, y, 2, 2, INK);
  img.set(x, y, GLINT);
}

/** Beret: a flat dark disc tilted down toward `side`, with the little stalk on top. */
function beret(l: Img, cx: number, cy: number, rx: number, side: number) {
  for (let y = Math.floor(cy - 3); y <= cy + 3; y++)
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const tilt = dx * side * 1.1;
      const dy = (y + 0.5 - cy - tilt) / 1.9;
      if (dx * dx + dy * dy > 1) continue;
      l.set(x, y, sh(BERET, 0.55 - dx * 0.3 - dy * 0.35));
    }
  l.set(Math.round(cx), Math.round(cy - 2.5), BERET.b);
}

/** Toothy grin: upper lip, a zigzag row of teeth, lower lip. */
function grin(img: Img, x0: number, x1: number, y: number) {
  for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1;
    img.set(x, y, edge ? MOUTH : TOOTH);
    img.set(x, y + 1, edge || (x - x0) % 2 === 0 ? MOUTH : TOOTH);
    if (!edge) img.set(x, y + 2, MOUTH);
  }
  img.set(x0 - 1, y - 1, MOUTH);
  img.set(x1 + 1, y - 1, MOUTH);
}

/** Neckerchief: a 2-row band with the knot/triangle hanging at `kx`. */
function scarf(img: Img, x0: number, x1: number, y: number, kx: number, front = true) {
  for (let x = x0; x <= x1; x++) {
    img.set(x, y, sh(SCARF, 0.65 - ((x - x0) / (x1 - x0)) * 0.4));
    img.set(x, y + 1, sh(SCARF, 0.4 - ((x - x0) / (x1 - x0)) * 0.4));
  }
  if (!front) return;
  img.hline(kx - 1, kx + 2, y + 2, SCARF.d1);
  img.hline(kx, kx + 1, y + 3, SCARF.d2);
}

function down(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legs(img, p, [12, 18]);
  layer(img, (l) => {
    ball(l, 16, 23.2 + b, 7.2, 11.4, SKIN, 0, (x, y, nx, ny, v) => (Math.abs(nx) < 0.58 && ny > -0.05 ? sh(BELLY, v + 0.1) : null));
  });
  // pectoral fins (the right one holds the bomb)
  layer(img, (l) => {
    l.poly([[10, 23 + b], [5, 28 + b - s], [7, 29 + b - s], [10, 27 + b]], (x, y) => sh(SKIN, 0.6 - (y - 23 - b) * 0.04));
    l.poly([[22, 23 + b], [27, 28 + b + s], [25, 29 + b + s], [22, 27 + b]], (x, y) => sh(SKIN, 0.3 - (y - 23 - b) * 0.04));
  });
  bomb(img, 26, 31 + b + s, p.frame);
  // gills
  img.vline(10, 19 + b, 20 + b, SKIN.d2);
  img.vline(21, 19 + b, 20 + b, SKIN.d2);
  // eyes + grin
  eye(img, 11, 14 + b);
  eye(img, 19, 14 + b);
  grin(img, 12, 19, 17 + b);
  scarf(img, 10, 21, 21 + b, 15);
  layer(img, (l) => beret(l, 15, 10 + b, 5.5, -0.6));
  finish(img, 8);
  return img;
}

function downRight(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legs(img, p, [12, 18]);
  layer(img, (l) => {
    // tail behind (lower left) and dorsal fin peeking on the back
    l.poly([[11, 30 + b], [5, 27 + b], [7, 31 + b], [5, 35 + b], [11, 33 + b]], (x, y) => sh(SKIN, 0.35));
    ball(l, 16.5, 23.2 + b, 7.2, 11.4, SKIN, 0, (x, y, nx, ny, v) => (nx > -0.3 && nx < 0.75 && ny > -0.05 ? sh(BELLY, v + 0.1) : null));
  });
  layer(img, (l) => {
    l.poly([[11, 23 + b], [7, 28 + b - s], [9, 29 + b - s], [11, 27 + b]], (x, y) => sh(SKIN, 0.55));
    l.poly([[23, 23 + b], [27, 28 + b + s], [25, 29 + b + s], [23, 27 + b]], (x, y) => sh(SKIN, 0.3));
  });
  bomb(img, 26, 31 + b + s, p.frame);
  img.vline(12, 19 + b, 20 + b, SKIN.d2);
  eye(img, 12, 14 + b);
  eye(img, 21, 14 + b);
  grin(img, 15, 22, 17 + b);
  scarf(img, 11, 23, 21 + b, 18);
  layer(img, (l) => beret(l, 16, 10 + b, 5.5, -0.6));
  finish(img, 8);
  return img;
}

function right(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  const lg: [number, boolean][] = s === 0 ? [[15, false]] : [[13, true], [17, false]];
  for (const [lx, back] of lg) {
    img.vline(lx, 33, GY, sh(SKIN, back ? 0.15 : 0.45));
    img.vline(lx + 1, 33, GY, sh(SKIN, back ? 0.1 : 0.3));
    img.set(lx + 2, GY, back ? SKIN.d2 : SKIN.d1);
  }
  layer(img, (l) => {
    // tail (crescent) behind the legs
    l.poly([[11, 29 + b], [4, 25 + b], [7, 30 + b], [4, 36 + b], [11, 33 + b]], (x, y) => sh(SKIN, 0.4 - (y - 25 - b) * 0.02));
    // dorsal fin
    l.poly([[10, 18 + b], [4, 16 + b], [9, 25 + b]], (x, y) => sh(SKIN, 0.45 + (y - 16 - b) * 0.01));
    ball(l, 15, 23.2 + b, 6.6, 11.4, SKIN, 0, (x, y, nx, ny, v) => (nx > 0.2 && ny > -0.15 ? sh(BELLY, v + 0.1) : null));
    // the snout juts forward
    l.poly([[14, 12 + b], [21, 14 + b], [24, 17 + b], [21, 20 + b], [16, 21 + b]], (x, y) => (y >= 19 + b && x > 17 ? sh(BELLY, 0.6) : sh(SKIN, 0.62 - (y - 12 - b) * 0.04)));
  });
  // near fin + bomb held out front
  layer(img, (l) => l.poly([[14, 23 + b], [19 - s, 28 + b], [16 - s, 29 + b], [13, 27 + b]], (x, y) => sh(SKIN, 0.45)));
  bomb(img, 21 - s, 30 + b, p.frame);
  img.vline(12, 20 + b, 22 + b, SKIN.d2);
  img.vline(14, 20 + b, 22 + b, SKIN.d2);
  eye(img, 18, 14 + b);
  // grin under the snout
  for (let x = 17; x <= 22; x++) {
    img.set(x, 18 + b, x === 22 ? MOUTH : TOOTH);
    img.set(x, 19 + b, x % 2 === 0 || x === 22 ? MOUTH : TOOTH);
    if (x < 22) img.set(x, 20 + b, MOUTH);
  }
  img.set(16, 17 + b, MOUTH);
  scarf(img, 10, 20, 21 + b, 19, false);
  img.set(21, 22 + b, SCARF.d1);
  img.set(20, 23 + b, SCARF.d1);
  img.set(21, 23 + b, SCARF.d2);
  layer(img, (l) => beret(l, 14, 9.5 + b, 5.2, -0.6));
  finish(img, 8);
  return img;
}

function upRight(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legs(img, p, [12, 18]);
  layer(img, (l) => {
    l.poly([[22, 23 + b], [27, 28 + b - s], [25, 29 + b - s], [22, 27 + b]], (x, y) => sh(SKIN, 0.3));
    ball(l, 16, 23.2 + b, 7.2, 11.4, SKIN, -0.03);
    l.poly([[10, 23 + b], [5, 28 + b + s], [7, 29 + b + s], [10, 27 + b]], (x, y) => sh(SKIN, 0.55));
  });
  // dorsal fin pointing back at us (left of centre), tail fin low
  // dorsal fin on the back (sticking out to the left) and the tail sweeping out low-left
  layer(img, (l) => {
    l.poly([[12, 29 + b], [5, 26 + b], [8, 31 + b], [5, 36 + b], [13, 33 + b]], (x, y) => sh(SKIN, 0.5 - (y - 26 - b) * 0.02));
  });
  layer(img, (l) => l.poly([[14.5, 21 + b], [10, 28 + b], [17.5, 28 + b]], (x, y) => (x < 14 ? sh(SKIN, 0.8 - (y - 21 - b) * 0.03) : sh(SKIN, 0.45 - (y - 21 - b) * 0.03))), 0.5);
  img.set(23, 17 + b, MOUTH); // grin corner peeking
  scarf(img, 9, 22, 21 + b, 0, false);
  layer(img, (l) => beret(l, 15, 10 + b, 5.5, 0.6));
  finish(img, 8);
  return img;
}

function up(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legs(img, p, [12, 18]);
  layer(img, (l) => {
    l.poly([[22, 23 + b], [27, 28 + b - s], [25, 29 + b - s], [22, 27 + b]], (x, y) => sh(SKIN, 0.3));
    l.poly([[10, 23 + b], [5, 28 + b + s], [7, 29 + b + s], [10, 27 + b]], (x, y) => sh(SKIN, 0.55));
    ball(l, 16, 23.2 + b, 7.2, 11.4, SKIN, -0.03);
  });
  // tiny bomb fuse spark peeking past the right fin
  img.set(27, 26 + b - s, '#ffd860');
  // the classic fin shape on the back (reads "shark" at any size); tail swept to one side
  layer(img, (l) => {
    l.poly([[12, 30 + b], [5, 28 + b], [8, 33 + b], [5, 37 + b], [13, 34 + b]], (x, y) => sh(SKIN, 0.55 - (y - 28 - b) * 0.02));
  });
  layer(img, (l) => {
    l.poly([[16.5, 22 + b], [12, 29 + b], [20, 29 + b]], (x, y) => (x < 16 ? sh(SKIN, 0.8 - (y - 22 - b) * 0.03) : sh(SKIN, 0.45 - (y - 22 - b) * 0.03)));
  }, 0.5);
  scarf(img, 9, 22, 21 + b, 0, false);
  layer(img, (l) => beret(l, 17, 10 + b, 5.5, 0.6));
  finish(img, 8);
  return img;
}

const art: CharacterArt = {
  id: 'requin',
  draw(dir: DrawnDir, frame: FrameIndex) {
    const p = pose(frame);
    switch (dir) {
      case 'down':
        return down(p);
      case 'down-right':
        return downRight(p);
      case 'right':
        return right(p);
      case 'up-right':
        return upRight(p);
      case 'up':
        return up(p);
    }
  },
};
export default art;
