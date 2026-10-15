// Chonk (15-122): a GIANT, perfectly round white goose. Tiny head, happy squint, tiny orange feet,
// fills the whole frame. Waddles (body leans onto the planted foot).
import { finish, GY, Img, layer, lightAt, newFrame, pose, ramp, sh, type Pose } from './lib-c.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const DOWN = ramp('#dcd5dc');
const BEAK = ramp('#e8892e');
const BLUSH = '#e8a0a0';
const INKC = '#2a1a2c';

/** Fluffy ball: radius wobbles a little so the silhouette reads as down, not a plate. */
function fluff(img: Img, cx: number, cy: number, rx: number, ry: number, seed: number, sym: boolean, fn?: (x: number, y: number, nx: number, ny: number, v: number) => ReturnType<typeof sh> | null) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const a = Math.atan2(dy, sym ? Math.abs(dx) : dx);
      // tufts only on the upper half and sides (the bottom sits flat on its feet)
      const wob = dy < ry * 0.6 ? 1 + 0.04 * Math.cos(a * 10 + seed) : 1;
      const nx = dx / (rx * wob);
      const ny = dy / (ry * wob);
      if (nx * nx + ny * ny > 1) continue;
      const v = lightAt(nx, ny, 0.02);
      img.set(x, y, (fn && fn(x, y, nx, ny, v)) ?? sh(DOWN, v));
    }
}

/** Folded wing: a softly outlined, slightly darker teardrop with scalloped feather tips, clipped to the body. */
function wing(img: Img, cx: number, cy: number, rx: number, ry: number, bias = -0.08) {
  const l = new Img(img.w, img.h);
  l.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    if (ny > 0.5 && nx * nx + ny * ny > 0.55 && (x + y) % 3 === 0) return null;
    return sh(DOWN, lightAt(nx, ny, bias));
  });
  l.outline({ darken: 0.32 });
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (l.alpha(x, y) > 0 && img.alpha(x, y) > 0) img.set(x, y, l.get(x, y));
}

function feet(img: Img, p: Pose, cx: number, gap: number, toe: number) {
  for (const side of [-1, 1]) {
    const lift = p.step !== 0 && side !== p.step ? 1 : 0;
    const fx = cx + side * gap - (side < 0 ? 1 : 0);
    const fy = GY - lift;
    img.set(fx, fy - 1, BEAK.d1);
    img.set(fx - 1 + toe, fy, BEAK.d1);
    img.set(fx + toe, fy, BEAK.b);
    img.set(fx + 1 + toe, fy, BEAK.d1);
  }
}

/** ^ ^ happy squint. */
function squint(img: Img, x: number, y: number) {
  img.set(x - 1, y + 1, INKC);
  img.set(x, y, INKC);
  img.set(x + 1, y + 1, INKC);
}

function down(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const w = p.sway;
  feet(img, p, 16, 4, 0);
  layer(img, (l) => {
    fluff(l, 16 + w, 23.5 + b, 13, 12, 0, true, (x, y, nx, ny, v) => (Math.abs(nx) < 0.42 && ny > -0.2 ? sh(DOWN, v + 0.12) : null));
    fluff(l, 16 + w, 8 + b, 4.6, 4.2, 0, true);
  });
  wing(img, 6.5 + w, 25 + b, 3.4, 7.5);
  wing(img, 25.5 + w, 25 + b, 3.4, 7.5, -0.16);
  // neck crease (a hint of the chin over the chest)
  img.hline(13 + w, 18 + w, 13 + b, DOWN.d1);
  squint(img, 13 + w, 7 + b);
  squint(img, 18 + w, 7 + b);
  img.set(12 + w, 9 + b, BLUSH);
  img.set(19 + w, 9 + b, BLUSH);
  img.rect(15 + w, 9 + b, 2, 2, BEAK.b);
  img.set(15 + w, 9 + b, BEAK.l2);
  img.set(16 + w, 10 + b, BEAK.d1);
  finish(img, 12, 2);
  return img;
}

function downRight(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const w = p.sway;
  feet(img, p, 16, 4, 1);
  layer(img, (l) => {
    // tail tuft behind, upper left
    l.poly([[6, 15 + b], [2, 11 + b], [3, 15 + b], [5, 18 + b]], DOWN.d1);
    fluff(l, 16 + w, 23.5 + b, 13, 12, 1.5, false, (x, y, nx, ny, v) => (nx > -0.15 && nx < 0.6 && ny > -0.2 ? sh(DOWN, v + 0.12) : null));
    fluff(l, 18.5 + w, 8 + b, 4.6, 4.2, 3, false);
  });
  wing(img, 6.5 + w, 25 + b, 3.8, 7.5);
  img.hline(15 + w, 21 + w, 13 + b, DOWN.d1);
  squint(img, 16 + w, 7 + b);
  squint(img, 21 + w, 7 + b);
  img.set(15 + w, 9 + b, BLUSH);
  img.rect(19 + w, 9 + b, 3, 2, BEAK.b);
  img.set(19 + w, 9 + b, BEAK.l2);
  img.set(22 + w, 10 + b, BEAK.b);
  img.set(21 + w, 10 + b, BEAK.d1);
  finish(img, 12, 2);
  return img;
}

function right(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const legs: [number, boolean][] = p.step === 0 ? [[16, false]] : [[13, true], [19, false]];
  for (const [lx, back] of legs) {
    img.set(lx, GY - 1, back ? BEAK.d2 : BEAK.d1);
    img.hline(lx - 1, lx + 2, GY, back ? BEAK.d2 : BEAK.d1);
    img.set(lx + 2, GY, back ? BEAK.d1 : BEAK.b);
  }
  layer(img, (l) => {
    l.poly([[6, 15 + b], [1, 10 + b], [2, 15 + b], [4, 19 + b]], DOWN.d1);
    fluff(l, 15, 23.5 + b, 13, 12, 2.5, false, (x, y, nx, ny, v) => (nx > 0.35 && ny > -0.3 ? sh(DOWN, v + 0.12) : null));
    fluff(l, 22.5, 8.5 + b, 4.4, 4, 4, false);
  });
  // folded wing along the flank, tip toward the tail
  wing(img, 11.5, 23.5 + b, 7.5, 5.5);
  img.set(20, 13 + b, DOWN.d1);
  img.set(21, 13 + b, DOWN.d1);
  squint(img, 23, 7 + b);
  img.set(23, 10 + b, BLUSH);
  img.rect(27, 9 + b, 2, 1, BEAK.l1);
  img.rect(27, 10 + b, 3, 1, BEAK.b);
  img.set(29, 10 + b, BEAK.d1);
  finish(img, 12, 2);
  return img;
}

function upRight(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const w = p.sway;
  feet(img, p, 16, 4, 1);
  layer(img, (l) => {
    // tail tuft sticking out behind, upper left
    l.poly([[6, 16 + b], [2, 12 + b], [3, 16 + b], [5, 19 + b]], DOWN.d1);
    fluff(l, 16 + w, 23.5 + b, 13, 12, 3.5, false);
    fluff(l, 19 + w, 8 + b, 4.6, 4.2, 5, false, (x, y, nx, ny, v) => sh(DOWN, v - 0.05));
  });
  wing(img, 25 + w, 25 + b, 3.6, 7.5, -0.16);
  wing(img, 7 + w, 25 + b, 3.4, 7.5);
  img.set(24 + w, 9 + b, BEAK.d1); // beak tip peeking
  img.set(24 + w, 10 + b, BEAK.d2);
  finish(img, 12, 2);
  return img;
}

function up(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const w = p.sway;
  feet(img, p, 16, 4, 0);
  layer(img, (l) => {
    fluff(l, 16 + w, 23.5 + b, 13, 12, 0, true);
    fluff(l, 16 + w, 8 + b, 4.6, 4.2, 0, true, (x, y, nx, ny, v) => sh(DOWN, v - 0.05));
  });
  // little tail: a fan of three feather tips pointing at us, centre-low
  for (const [x0, y0] of [[12, 30], [15, 28], [18, 30]] as const) {
    img.set(x0 + w, y0 + b, DOWN.d1);
    img.set(x0 + 1 + w, y0 - 1 + b, DOWN.d1);
    img.set(x0 + 2 + w, y0 + b, DOWN.d1);
    img.set(x0 + 1 + w, y0 + b, DOWN.l2);
    img.set(x0 + 1 + w, y0 + 1 + b, DOWN.l1);
  }
  wing(img, 6.5 + w, 25 + b, 3.4, 7.5);
  wing(img, 25.5 + w, 25 + b, 3.4, 7.5, -0.16);
  finish(img, 12, 2);
  return img;
}

const art: CharacterArt = {
  id: 'chonk',
  draw(dir: DrawnDir, frame: FrameIndex) {
    const p = pose(frame, dir !== 'right');
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
