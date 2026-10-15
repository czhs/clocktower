// Clarabelle the Parallel Cow (15-210): an upright black-and-white cow with floppy ears, little
// horns, a big pink snout and a brass bell on a red collar.
import { ball, finish, GLINT, GY, INK, layer, newFrame, pose, ramp, sh, type Img, type Pose, type RGBA } from './lib-c.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const HIDE = ramp('#e6e0de');
const SPOT = ramp('#2e2a34');
const PINK = ramp('#e2a0a4');
const HOOF = ramp('#4a3c42');
const HORN = ramp('#e2d2ac');
const COLLAR = ramp('#a8343c');
const BELL = ramp('#d4a640');

type Spot = [number, number, number, number];
/** Shade a hide pixel: black spots where any spot ellipse covers it. */
function hide(spots: Spot[], bias = 0) {
  return (x: number, y: number, _nx: number, _ny: number, v: number): RGBA | null => {
    for (const [cx, cy, rx, ry] of spots) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) return sh(SPOT, v * 0.7 + bias);
    }
    return sh(HIDE, v + bias);
  };
}

function legs(img: Img, p: Pose, xs: [number, number]) {
  for (const [k, side] of [-1, 1].entries()) {
    const lx = xs[k]!;
    const lift = p.step !== 0 && side !== p.step ? 1 : 0;
    for (let y = 32; y <= GY - 2 - lift; y++) img.hline(lx, lx + 1, y, sh(HIDE, side < 0 ? 0.55 : 0.35));
    img.hline(lx, lx + 1, GY - 1 - lift, HOOF.b);
    img.hline(lx, lx + 1, GY - lift, HOOF.d2);
  }
}

/** Arm ending in a dark hoof (optionally with a spot). */
function arm(l: Img, x: number, top: number, light: number, spotty: boolean) {
  for (let j = 0; j < 5; j++) {
    l.set(x, top + j, spotty && j === 2 ? SPOT.b : sh(HIDE, light));
    l.set(x + 1, top + j, spotty && j >= 1 && j <= 2 ? SPOT.d1 : sh(HIDE, light - 0.2));
  }
  l.hline(x, x + 1, top + 5, HOOF.b);
  l.hline(x, x + 1, top + 6, HOOF.d1);
}

function bell(img: Img, x: number, y: number) {
  img.set(x, y, BELL.l2);
  img.set(x + 1, y, BELL.b);
  img.set(x, y + 1, BELL.b);
  img.set(x + 1, y + 1, BELL.d1);
  img.set(x, y + 2, BELL.d2);
  img.set(x + 1, y + 2, BELL.d2);
}

function ear(l: Img, cx: number, cy: number, side: number) {
  ball(l, cx, cy, 2.6, 1.4, HIDE, side < 0 ? 0.1 : -0.1);
  l.set(Math.round(cx - 0.5 + side * 0.5), Math.round(cy - 0.5), PINK.b);
}

function down(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legs(img, p, [13, 17]);
  layer(img, (l) => {
    ball(l, 16, 28 + b, 5.5, 5.5, HIDE, 0, hide([[13, 26 + b, 2.2, 1.8], [19.5, 30.5 + b, 2, 2.4]]));
  });
  layer(img, (l) => {
    arm(l, 9, 23 + b - s, 0.6, false);
    arm(l, 21, 23 + b + s, 0.35, true);
  });
  // collar + bell
  img.hline(12, 19, 22 + b, COLLAR.b);
  img.set(12, 22 + b, COLLAR.l1);
  img.set(19, 22 + b, COLLAR.d1);
  layer(img, (l) => {
    ear(l, 7.5, 13.5 + b, -1);
    ear(l, 24.5, 13.5 + b, 1);
  });
  layer(img, (l) => {
    ball(l, 16, 15 + b, 6.3, 5.4, HIDE, 0.05, hide([[20, 11.5 + b, 2.8, 2.2]]));
    // horns
    l.set(11, 9 + b, HORN.l1);
    l.set(10, 8 + b, HORN.b);
    l.set(20, 9 + b, HORN.b);
    l.set(21, 8 + b, HORN.d1);
  });
  // tuft between the horns
  img.set(15, 10 + b, SPOT.b);
  img.set(16, 10 + b, SPOT.d1);
  img.set(16, 9 + b, SPOT.b);
  // snout
  layer(
    img,
    (l) => {
      ball(l, 16, 18 + b, 4.2, 2.3, PINK, 0.1);
      l.set(14, 18 + b, PINK.d2);
      l.set(17, 18 + b, PINK.d2);
    },
    0.45,
  );
  img.vline(13, 14 + b, 15 + b, INK);
  img.vline(18, 14 + b, 15 + b, INK);
  img.set(13, 14 + b, GLINT);
  img.set(18, 14 + b, GLINT);
  bell(img, 15, 23 + b);
  return img;
}

function downRight(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legs(img, p, [13, 18]);
  layer(img, (l) => {
    // tail behind, left
    l.line(11, 27 + b, 8, 32 + b, HIDE.d1);
    l.rect(7, 32 + b, 2, 2, SPOT.b);
    ball(l, 16.5, 28 + b, 5.5, 5.5, HIDE, 0, hide([[13.5, 26 + b, 2, 1.8], [20, 30.5 + b, 2, 2.4]]));
  });
  layer(img, (l) => {
    arm(l, 10, 23 + b - s, 0.6, false);
    arm(l, 22, 23 + b + s, 0.35, true);
  });
  img.hline(13, 20, 22 + b, COLLAR.b);
  img.set(13, 22 + b, COLLAR.l1);
  layer(img, (l) => {
    ear(l, 9.5, 13 + b, -1);
    ear(l, 25.5, 14 + b, 1);
  });
  layer(img, (l) => {
    ball(l, 17, 15 + b, 6.2, 5.4, HIDE, 0.05, hide([[13, 11.5 + b, 2.6, 2.2]]));
    l.set(13, 9 + b, HORN.l1);
    l.set(12, 8 + b, HORN.b);
    l.set(21, 9 + b, HORN.b);
    l.set(22, 8 + b, HORN.d1);
  });
  img.set(17, 10 + b, SPOT.b);
  img.set(17, 9 + b, SPOT.d1);
  layer(
    img,
    (l) => {
      ball(l, 18.5, 18 + b, 4.2, 2.3, PINK, 0.1);
      l.set(17, 18 + b, PINK.d2);
      l.set(20, 18 + b, PINK.d2);
    },
    0.45,
  );
  img.vline(15, 14 + b, 15 + b, INK);
  img.vline(20, 14 + b, 15 + b, INK);
  img.set(15, 14 + b, GLINT);
  img.set(20, 14 + b, GLINT);
  bell(img, 17, 23 + b);
  return img;
}

function right(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  const lg: [number, boolean][] = s === 0 ? [[15, false]] : [[13, true], [17, false]];
  for (const [lx, back] of lg) {
    for (let y = 32; y <= GY - 2; y++) img.hline(lx, lx + 1, y, sh(HIDE, back ? 0.2 : 0.5));
    img.hline(lx, lx + 1, GY - 1, back ? HOOF.d1 : HOOF.b);
    img.hline(lx, lx + 2, GY, HOOF.d2);
  }
  layer(img, (l) => {
    // swishing tail with a dark tuft
    l.line(11, 26 + b, 8, 30 + b, HIDE.d1);
    l.line(8, 30 + b, 8, 32 + b, HIDE.d1);
    l.rect(7, 32 + b, 2, 3, SPOT.b);
    ball(l, 15.5, 28 + b, 5, 5.5, HIDE, 0, hide([[12.5, 26.5 + b, 2.4, 2.2], [17.5, 31 + b, 1.6, 1.6]]));
  });
  layer(img, (l) => arm(l, 15 - s, 23 + b, 0.55, false));
  img.hline(14, 20, 21 + b, COLLAR.b);
  layer(img, (l) => {
    ball(l, 16, 15 + b, 5.6, 5.4, HIDE, 0.05, hide([[13, 12 + b, 2.6, 2.6]]));
    l.set(16, 9 + b, HORN.b);
    l.set(17, 8 + b, HORN.l1);
  });
  layer(img, (l) => ear(l, 10.5, 14 + b, -1));
  layer(
    img,
    (l) => {
      ball(l, 21.5, 17.5 + b, 3, 2.6, PINK, 0.1);
      l.set(23, 17 + b, PINK.d2);
      l.hline(20, 22, 19 + b, PINK.d1);
    },
    0.45,
  );
  img.vline(19, 13 + b, 14 + b, INK);
  img.set(19, 13 + b, GLINT);
  bell(img, 19, 22 + b);
  return img;
}

function upRight(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legs(img, p, [13, 18]);
  layer(img, (l) => {
    ball(l, 16, 28 + b, 5.5, 5.5, HIDE, -0.05, hide([[18, 25.5 + b, 2.6, 2], [13, 30 + b, 2, 2.2]]));
    l.line(14, 30 + b, 12, 34 + b, HIDE.d1);
    l.rect(11, 34 + b, 2, 2, SPOT.b);
  });
  layer(img, (l) => {
    arm(l, 9, 23 + b + s, 0.55, true);
    arm(l, 21, 23 + b - s, 0.35, false);
  });
  img.hline(12, 20, 22 + b, COLLAR.d1);
  layer(img, (l) => {
    ear(l, 8.5, 14 + b, -1);
    ear(l, 23.5, 13 + b, 1);
  });
  layer(img, (l) => {
    ball(l, 15.5, 15 + b, 6.2, 5.4, HIDE, -0.05, hide([[13, 13 + b, 3, 2.6]]));
    l.set(11, 9 + b, HORN.l1);
    l.set(10, 8 + b, HORN.b);
    l.set(19, 9 + b, HORN.b);
    l.set(20, 8 + b, HORN.d1);
  });
  img.set(21, 18 + b, PINK.d1); // snout edge peeking
  return img;
}

function up(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  legs(img, p, [13, 17]);
  layer(img, (l) => {
    ball(l, 16, 28 + b, 5.5, 5.5, HIDE, -0.05, hide([[18.5, 25.5 + b, 2.4, 2], [12.5, 30 + b, 2, 2.2]]));
    l.vline(16, 29 + b, 33 + b, HIDE.d1);
    l.rect(15, 33 + b, 2, 2, SPOT.b);
  });
  layer(img, (l) => {
    arm(l, 9, 23 + b + s, 0.55, true);
    arm(l, 21, 23 + b - s, 0.35, false);
  });
  img.hline(12, 19, 22 + b, COLLAR.d1);
  layer(img, (l) => {
    ear(l, 7.5, 13.5 + b, -1);
    ear(l, 24.5, 13.5 + b, 1);
  });
  layer(img, (l) => {
    ball(l, 16, 15 + b, 6.3, 5.4, HIDE, -0.05, hide([[12, 12 + b, 2.8, 2.4], [19, 17 + b, 2, 1.6]]));
    l.set(11, 9 + b, HORN.l1);
    l.set(10, 8 + b, HORN.b);
    l.set(20, 9 + b, HORN.b);
    l.set(21, 8 + b, HORN.d1);
  });
  return img;
}

const art: CharacterArt = {
  id: 'clarabelle',
  draw(dir: DrawnDir, frame: FrameIndex) {
    const p = pose(frame);
    const img = dir === 'down' ? down(p) : dir === 'down-right' ? downRight(p) : dir === 'right' ? right(p) : dir === 'up-right' ? upRight(p) : up(p);
    finish(img, 7);
    return img;
  },
};
export default art;
