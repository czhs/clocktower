// Progress & Preservation (15-312): a matching pair of small, chubby, un-armoured frogs in knit
// scarves. Same body, different colour + accessory: Progress (green, orange scarf, little
// backpack — always takes a step) and Preservation (blue, yellow scarf, round glasses — never
// changes type). Deliberately nothing like Sir Croaksworth the knight frog (no armour, no cape).
import { ball, finish, GLINT, GY, INK, layer, newFrame, pose, ramp, sh, type Img, type Pose, type Ramp } from './lib-c.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

export interface FrogSpec {
  id: string;
  skin: string;
  belly: string;
  scarf: string;
  extra: 'backpack' | 'glasses';
  mouth: 'open' | 'smile';
}

const PACK = ramp('#a8642e');
const RIM = '#3a2e2a';
const TONGUE = '#d86a78';
const MOUTHC = '#3a1a26';

interface Pal {
  s: Ramp;
  bl: Ramp;
  sc: Ramp;
}

function feetFront(img: Img, p: Pose, pal: Pal, xs: [number, number]) {
  for (const [k, side] of [-1, 1].entries()) {
    const fx = xs[k]!;
    const lift = p.step !== 0 && side !== p.step ? 1 : 0;
    const y = GY - lift;
    // wide webbed foot, toes splayed
    img.hline(fx, fx + 3, y, sh(pal.s, side < 0 ? 0.55 : 0.35));
    img.set(fx + (side < 0 ? 0 : 3), y - 1, sh(pal.s, 0.45));
    img.set(fx + 1, y - 1, sh(pal.s, 0.5));
    img.set(fx + 2, y - 1, sh(pal.s, 0.4));
  }
}

/** Big round eye bump on top of the head; pupil looks toward (px, py) offset. */
function eyeBump(l: Img, cx: number, cy: number, pal: Pal, bias: number) {
  ball(l, cx, cy, 3, 2.8, pal.s, bias);
}
function eyeball(img: Img, x: number, y: number, px: number, closed: boolean) {
  // 3x2 white with a 1x2 pupil
  img.hline(x, x + 2, y, '#f4eee2');
  img.hline(x, x + 2, y + 1, '#e2dacc');
  if (closed) {
    img.hline(x, x + 2, y + 1, INK);
    return;
  }
  img.vline(x + 1 + px, y, y + 1, INK);
  img.set(x + 1 + px, y, GLINT);
  img.set(x + 1 + px, y + 1, INK);
}
function glasses(img: Img, x: number, y: number, w = 3) {
  // round rim around a 3x2 eye
  img.hline(x, x + w - 1, y - 1, RIM);
  img.hline(x, x + w - 1, y + 2, RIM);
  img.vline(x - 1, y, y + 1, RIM);
  img.vline(x + w, y, y + 1, RIM);
}

function scarfFront(img: Img, pal: Pal, x0: number, x1: number, y: number, tailX: number) {
  for (let x = x0; x <= x1; x++) {
    const knit = (x - x0) % 2 === 0 ? 0.08 : -0.08;
    img.set(x, y, sh(pal.sc, 0.7 - ((x - x0) / (x1 - x0)) * 0.4 + knit));
    img.set(x, y + 1, sh(pal.sc, 0.45 - ((x - x0) / (x1 - x0)) * 0.4 - knit));
  }
  // hanging end with a fringe
  for (let j = 2; j <= 5; j++) img.hline(tailX, tailX + 1, y + j, sh(pal.sc, j === 5 ? 0.25 : 0.55 - j * 0.05));
  img.set(tailX, y + 6, pal.sc.d1);
}

function down(p: Pose, sp: FrogSpec, pal: Pal): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  feetFront(img, p, pal, [9, 19]);
  layer(img, (l) => {
    // haunches
    ball(l, 10.5, 33 + b, 3, 2.8, pal.s, 0.05);
    ball(l, 21.5, 33 + b, 3, 2.8, pal.s, -0.1);
    ball(l, 16, 30 + b, 6.5, 5.6, pal.s, 0, (x, y, nx, ny, v) => (Math.abs(nx) < 0.62 && ny > -0.45 ? sh(pal.bl, v + 0.1) : null));
  });
  // little arms
  layer(img, (l) => {
    l.rect(9, 27 + b - s, 2, 4, sh(pal.s, 0.55));
    l.hline(8, 10, 31 + b - s, sh(pal.s, 0.6));
    l.rect(21, 27 + b + s, 2, 4, sh(pal.s, 0.3));
    l.hline(21, 23, 31 + b + s, sh(pal.s, 0.35));
  });
  layer(img, (l) => {
    eyeBump(l, 11.5, 15.8 + b, pal, 0.05);
    eyeBump(l, 20.5, 15.8 + b, pal, -0.05);
    ball(l, 16, 20.5 + b, 8.2, 4.9, pal.s, 0.02);
  });
  eyeball(img, 10, 15 + b, 0, false);
  eyeball(img, 19, 15 + b, 0, false);
  if (sp.extra === 'glasses') {
    glasses(img, 10, 15 + b);
    glasses(img, 19, 15 + b);
    img.hline(13, 18, 15 + b, RIM);
  }
  // cheeks
  img.set(9, 21 + b, '#e09a9a');
  img.set(22, 21 + b, '#e09a9a');
  if (sp.mouth === 'open') {
    // big happy open mouth
    img.hline(11, 20, 21 + b, MOUTHC);
    img.hline(12, 19, 22 + b, MOUTHC);
    img.hline(14, 17, 23 + b, TONGUE);
    img.hline(13, 18, 22 + b, MOUTHC);
    img.set(10, 20 + b, MOUTHC);
    img.set(21, 20 + b, MOUTHC);
  } else {
    // calm wide smile
    img.hline(12, 19, 22 + b, MOUTHC);
    img.set(11, 21 + b, MOUTHC);
    img.set(20, 21 + b, MOUTHC);
  }
  if (sp.extra === 'backpack') {
    img.vline(10, 25 + b, 28 + b, PACK.d2);
    img.vline(21, 25 + b, 28 + b, PACK.d2);
  }
  scarfFront(img, pal, 10, 21, 24 + b, 18);
  finish(img, 8);
  return img;
}

function downRight(p: Pose, sp: FrogSpec, pal: Pal): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  if (sp.extra === 'backpack') layer(img, (l) => l.rect(7, 24 + b, 7, 8, PACK.b));
  feetFront(img, p, pal, [10, 19]);
  layer(img, (l) => {
    ball(l, 11, 33 + b, 3, 2.8, pal.s, 0.05);
    ball(l, 22, 33 + b, 2.6, 2.8, pal.s, -0.1);
    ball(l, 16.5, 30 + b, 6.5, 5.6, pal.s, 0, (x, y, nx, ny, v) => (nx > -0.35 && nx < 0.85 && ny > -0.45 ? sh(pal.bl, v + 0.1) : null));
  });
  layer(img, (l) => {
    l.rect(10, 27 + b - s, 2, 4, sh(pal.s, 0.55));
    l.hline(9, 11, 31 + b - s, sh(pal.s, 0.6));
    l.rect(22, 27 + b + s, 2, 4, sh(pal.s, 0.3));
    l.hline(22, 24, 31 + b + s, sh(pal.s, 0.35));
  });
  layer(img, (l) => {
    eyeBump(l, 13, 15.8 + b, pal, 0.05);
    eyeBump(l, 21.5, 15.8 + b, pal, -0.05);
    ball(l, 17, 20.5 + b, 8, 4.9, pal.s, 0.02);
  });
  eyeball(img, 12, 15 + b, 1, false);
  eyeball(img, 20, 15 + b, 1, false);
  if (sp.extra === 'glasses') {
    glasses(img, 12, 15 + b);
    glasses(img, 20, 15 + b);
    img.hline(15, 19, 15 + b, RIM);
  }
  img.set(23, 21 + b, '#e09a9a');
  img.set(11, 21 + b, '#e09a9a');
  if (sp.mouth === 'open') {
    img.hline(13, 22, 21 + b, MOUTHC);
    img.hline(14, 21, 22 + b, MOUTHC);
    img.hline(16, 19, 23 + b, TONGUE);
    img.set(12, 20 + b, MOUTHC);
    img.set(23, 20 + b, MOUTHC);
  } else {
    img.hline(14, 21, 22 + b, MOUTHC);
    img.set(13, 21 + b, MOUTHC);
    img.set(22, 21 + b, MOUTHC);
  }
  if (sp.extra === 'backpack') img.vline(12, 25 + b, 29 + b, PACK.d2);
  scarfFront(img, pal, 11, 22, 24 + b, 20);
  finish(img, 8);
  return img;
}

function right(p: Pose, sp: FrogSpec, pal: Pal): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  // feet: long flat frog feet pointing forward
  const feet: [number, boolean][] = s === 0 ? [[14, false]] : [[11, true], [17, false]];
  for (const [fx, back] of feet) {
    img.hline(fx, fx + 4, GY, sh(pal.s, back ? 0.15 : 0.45));
    img.set(fx + 4, GY - 1, sh(pal.s, back ? 0.2 : 0.5));
  }
  if (sp.extra === 'backpack')
    layer(img, (l) => {
      for (let y = 24; y <= 31; y++) for (let x = 6; x <= 10; x++) l.set(x, y + b, sh(PACK, 0.65 - (x - 6) * 0.06 - (y - 24) * 0.03));
      l.hline(6, 10, 27 + b, PACK.d2);
      l.set(8, 28 + b, '#d8b450');
    });
  layer(img, (l) => {
    ball(l, 15.5, 30 + b, 5.6, 5.6, pal.s, 0, (x, y, nx, ny, v) => (nx > 0.25 && ny > -0.4 ? sh(pal.bl, v + 0.1) : null));
    // big bent back leg (haunch)
    ball(l, 13 - (s !== 0 ? 1 : 0), 33 + b, 4, 3, pal.s, -0.02);
  });
  layer(img, (l) => {
    l.rect(17 + s, 27 + b, 2, 4, sh(pal.s, 0.5));
    l.hline(17 + s, 20 + s, 31 + b, sh(pal.s, 0.55));
  });
  layer(img, (l) => {
    eyeBump(l, 14, 15.8 + b, pal, -0.15); // far eye
  });
  layer(img, (l) => {
    ball(l, 17, 20.5 + b, 6.8, 4.8, pal.s, 0.02, (x, y, nx, ny, v) => (ny > 0.45 && nx > 0.1 ? sh(pal.bl, v + 0.1) : null));
    eyeBump(l, 19, 15.8 + b, pal, 0.05);
  });
  eyeball(img, 18, 15 + b, 1, false);
  if (sp.extra === 'glasses') {
    glasses(img, 18, 15 + b);
    img.set(22, 16 + b, RIM);
  }
  img.set(19, 21 + b, '#e09a9a');
  if (sp.mouth === 'open') {
    img.hline(19, 23, 22 + b, MOUTHC);
    img.hline(20, 22, 23 + b, TONGUE);
    img.set(18, 21 + b, MOUTHC);
  } else {
    img.hline(19, 23, 22 + b, MOUTHC);
    img.set(18, 21 + b, MOUTHC);
  }
  // scarf: band + ends flying back
  for (let x = 12; x <= 20; x++) {
    img.set(x, 24 + b, sh(pal.sc, 0.6 - (x - 12) * 0.03 + ((x % 2) - 0.5) * 0.15));
    img.set(x, 25 + b, sh(pal.sc, 0.4 - (x - 12) * 0.03));
  }
  layer(img, (l) => {
    l.hline(9, 11, 25 + b, sh(pal.sc, 0.55));
    l.hline(8, 10, 26 + b + (s === 0 ? 0 : 1), sh(pal.sc, 0.4));
    l.set(8, 27 + b + (s === 0 ? 0 : 1), pal.sc.d1);
  }, 0.6);
  if (sp.extra === 'backpack') img.line(12, 24 + b, 13, 29 + b, PACK.d2);
  finish(img, 8);
  return img;
}

function upRight(p: Pose, sp: FrogSpec, pal: Pal): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  feetFront(img, p, pal, [9, 19]);
  layer(img, (l) => {
    ball(l, 10.5, 33 + b, 3, 2.8, pal.s, 0.05);
    ball(l, 21.5, 33 + b, 3, 2.8, pal.s, -0.1);
    ball(l, 16, 30 + b, 6.5, 5.6, pal.s, -0.03);
  });
  layer(img, (l) => {
    l.rect(9, 27 + b + s, 2, 4, sh(pal.s, 0.55));
    l.rect(22, 27 + b - s, 2, 4, sh(pal.s, 0.3));
  });
  layer(img, (l) => {
    eyeBump(l, 12, 15.8 + b, pal, 0.0);
    eyeBump(l, 20, 15.5 + b, pal, -0.08);
    ball(l, 16, 20.5 + b, 8, 4.9, pal.s, -0.02);
  });
  if (sp.extra === 'glasses') img.set(23, 16 + b, RIM); // temple arm peeking
  for (let x = 9; x <= 22; x++) {
    img.set(x, 24 + b, sh(pal.sc, 0.65 - (x - 9) * 0.03 + ((x % 2) - 0.5) * 0.15));
    img.set(x, 25 + b, sh(pal.sc, 0.45 - (x - 9) * 0.03));
  }
  // knot + ends at the back
  img.hline(12, 13, 26 + b, sh(pal.sc, 0.5));
  img.hline(12, 13, 27 + b, sh(pal.sc, 0.4));
  img.set(12, 28 + b, pal.sc.d1);
  if (sp.extra === 'backpack')
    layer(img, (l) => {
      for (let y = 25; y <= 32; y++) for (let x = 11; x <= 18; x++) l.set(x, y + b, sh(PACK, 0.65 - (x - 11) * 0.05 - (y - 25) * 0.03));
      l.hline(11, 18, 28 + b, PACK.d2);
      l.set(14, 29 + b, '#d8b450');
      l.rect(12, 30 + b, 6, 2, PACK.l1);
    });
  finish(img, 8);
  return img;
}

function up(p: Pose, sp: FrogSpec, pal: Pal): Img {
  const img = newFrame();
  const b = p.bob;
  const s = p.step;
  feetFront(img, p, pal, [9, 19]);
  layer(img, (l) => {
    ball(l, 10.5, 33 + b, 3, 2.8, pal.s, 0.05);
    ball(l, 21.5, 33 + b, 3, 2.8, pal.s, -0.1);
    ball(l, 16, 30 + b, 6.5, 5.6, pal.s, -0.03);
  });
  layer(img, (l) => {
    l.rect(9, 27 + b + s, 2, 4, sh(pal.s, 0.55));
    l.rect(21, 27 + b - s, 2, 4, sh(pal.s, 0.3));
  });
  layer(img, (l) => {
    eyeBump(l, 11.5, 15.8 + b, pal, 0.0);
    eyeBump(l, 20.5, 15.8 + b, pal, -0.08);
    ball(l, 16, 20.5 + b, 8.2, 4.9, pal.s, -0.02);
  });
  if (sp.extra === 'glasses') {
    img.set(8, 16 + b, RIM);
    img.set(23, 16 + b, RIM);
  }
  for (let x = 10; x <= 21; x++) {
    img.set(x, 24 + b, sh(pal.sc, 0.65 - (x - 10) * 0.03 + ((x % 2) - 0.5) * 0.15));
    img.set(x, 25 + b, sh(pal.sc, 0.45 - (x - 10) * 0.03));
  }
  img.hline(14, 15, 26 + b, sh(pal.sc, 0.5));
  img.hline(14, 15, 27 + b, sh(pal.sc, 0.4));
  img.hline(14, 15, 28 + b, pal.sc.d1);
  if (sp.extra === 'backpack')
    layer(img, (l) => {
      for (let y = 25; y <= 32; y++) for (let x = 12; x <= 19; x++) l.set(x, y + b, sh(PACK, 0.65 - (x - 12) * 0.05 - (y - 25) * 0.03));
      l.hline(12, 19, 28 + b, PACK.d2);
      l.set(15, 29 + b, '#d8b450');
      l.rect(13, 30 + b, 6, 2, PACK.l1);
    });
  finish(img, 8);
  return img;
}

export function frogArt(sp: FrogSpec): CharacterArt {
  const pal: Pal = { s: ramp(sp.skin), bl: ramp(sp.belly), sc: ramp(sp.scarf) };
  return {
    id: sp.id,
    draw(dir: DrawnDir, frame: FrameIndex) {
      const p = pose(frame);
      switch (dir) {
        case 'down':
          return down(p, sp, pal);
        case 'down-right':
          return downRight(p, sp, pal);
        case 'right':
          return right(p, sp, pal);
        case 'up-right':
          return upRight(p, sp, pal);
        case 'up':
          return up(p, sp, pal);
      }
    },
  };
}
