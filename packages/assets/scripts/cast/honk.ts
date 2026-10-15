// Honk (15-122): a grey goose with a black neck, white chinstrap and an orange beak, carrying the
// clipboard of contracts he checks (//@requires, //@ensures). Waddles.
import { ball, finish, GLINT, GY, layer, newFrame, pose, ramp, sh, type Img, type Pose } from './lib-c.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const BODY = ramp('#857a6c');
const WING = ramp('#6c6052');
const BELLY = ramp('#c4bcae');
const NECK = ramp('#37323c');
const CHEEK = '#efe8dc';
const BEAK = ramp('#e08a32');
const BOARD = ramp('#8a5a32');
const PAPER = '#efe6d0';

/** Body pixel colour: barred wings at the sides, pale belly in the middle (`bc` = belly centre in nx). */
function plumage(bc: number, bw: number) {
  return (x: number, y: number, nx: number, ny: number, v: number) => {
    const inBelly = Math.abs(nx - bc) < bw && ny > -0.7;
    if (inBelly) return sh(BELLY, v + 0.1);
    // barred wing feathers: a darker scallop every other row
    const bar = (y + (nx < 0 ? 0 : 1)) % 3 === 0;
    return sh(WING, v - (bar ? 0.28 : 0));
  };
}

function frontFeet(img: Img, p: Pose, cx: number, gap: number, toe: number) {
  for (const side of [-1, 1]) {
    const lift = p.step !== 0 && side !== p.step ? 1 : 0;
    const fx = cx + side * gap - (side < 0 ? 1 : 0);
    const fy = GY - lift;
    img.set(fx, fy - 2, BEAK.d1);
    img.set(fx, fy - 1, BEAK.b);
    img.set(fx - 1 + toe, fy, BEAK.d1);
    img.set(fx + toe, fy, BEAK.b);
    img.set(fx + 1 + toe, fy, BEAK.d1);
  }
}

function clipboard(img: Img, x: number, y: number, back = false) {
  layer(img, (l) => {
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) l.set(x + i, y + j, sh(BOARD, 0.6 - i * 0.08 - j * 0.03));
    if (back) return;
    for (let j = 1; j < 6; j++) for (let i = 1; i < 4; i++) l.set(x + i, y + j, PAPER);
    l.set(x + 2, y, '#c8a450'); // clip
    // a red tick and a line of "contract"
    l.set(x + 1, y + 3, '#b8343c');
    l.set(x + 2, y + 4, '#b8343c');
    l.set(x + 3, y + 2, '#b8343c');
    l.set(x + 1, y + 1, '#9a948a');
    l.set(x + 2, y + 1, '#9a948a');
  });
}

/** Eye on the black head: a bright eye with a stern little brow slanting toward the beak. */
function eye(img: Img, x: number, y: number, side: number) {
  img.set(x, y, GLINT);
  img.set(x, y + 1, '#8a7a68');
  img.set(x - side, y - 1, NECK.o);
  img.set(x, y - 1, NECK.d2);
}

function head(img: Img, cx: number, cy: number) {
  ball(img, cx, cy, 3.8, 3.4, NECK, 0.12);
}

function down(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const w = p.sway;
  frontFeet(img, p, 16, 3, 0);
  layer(img, (l) => {
    ball(l, 16 + w, 29 + b, 7, 6.6, BODY, 0, plumage(0, 0.45));
    // neck
    for (let y = 15 + b; y <= 24 + b; y++) for (let x = 14; x <= 17; x++) l.set(x + w, y, sh(NECK, x === 14 ? 0.55 : x === 17 ? 0.25 : 0.4));
    head(l, 16 + w, 13 + b);
  });
  const hx = w;
  // white chinstrap under the beak and up the cheeks
  for (const [x, y] of [[13, 14], [13, 15], [14, 15], [14, 16], [15, 16], [16, 16], [17, 16], [17, 15], [18, 15], [18, 14]] as const) img.set(x + hx, y + b, CHEEK);
  // eyes (determined little brows)
  eye(img, 14 + hx, 12 + b, -1);
  eye(img, 17 + hx, 12 + b, 1);
  // beak (pointing at us)
  img.rect(15 + hx, 13 + b, 2, 2, BEAK.b);
  img.set(15 + hx, 13 + b, BEAK.l2);
  img.set(16 + hx, 14 + b, BEAK.d1);
  img.set(15 + hx, 15 + b, BEAK.d2);
  img.set(16 + hx, 15 + b, BEAK.d2);
  clipboard(img, 21 + w, 26 + b);
  finish(img, 8);
  return img;
}

function downRight(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const w = p.sway;
  frontFeet(img, p, 16, 3, 1);
  layer(img, (l) => {
    // tail tip behind, upper left
    l.poly([[9, 26 + b], [6, 23 + b], [6, 26 + b], [9, 29 + b]], WING.d1);
    ball(l, 16 + w, 29 + b, 7.4, 6.6, BODY, 0, plumage(0.3, 0.45));
    for (let y = 15 + b; y <= 24 + b; y++) for (let x = 17; x <= 20; x++) l.set(x + w, y, sh(NECK, x === 17 ? 0.55 : x === 20 ? 0.25 : 0.4));
    head(l, 18.5 + w, 13 + b);
  });
  const hx = w;
  for (const [x, y] of [[16, 14], [16, 15], [17, 15], [17, 16], [18, 16], [19, 16], [20, 16], [21, 15]] as const) img.set(x + hx, y + b, CHEEK);
  eye(img, 17 + hx, 12 + b, -1);
  eye(img, 20 + hx, 12 + b, 1);
  // beak pointing down-right
  img.rect(19 + hx, 13 + b, 3, 2, BEAK.b);
  img.set(19 + hx, 13 + b, BEAK.l2);
  img.set(22 + hx, 14 + b, BEAK.b);
  img.set(20 + hx, 15 + b, BEAK.d2);
  img.set(21 + hx, 15 + b, BEAK.d2);
  img.set(21 + hx, 14 + b, BEAK.d1);
  clipboard(img, 21 + w, 26 + b);
  finish(img, 8);
  return img;
}

function right(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  // legs
  const legs: [number, boolean][] = p.step === 0 ? [[15, false]] : [[13, true], [18, false]];
  for (const [lx, back] of legs) {
    const r = back ? BEAK.d1 : BEAK.b;
    img.set(lx, GY - 2, BEAK.d1);
    img.set(lx, GY - 1, r);
    img.hline(lx - 1, lx + 2, GY, back ? BEAK.d2 : BEAK.d1);
    img.set(lx + 2, GY, r);
  }
  layer(img, (l) => {
    // tail, up and back
    l.poly([[9, 25 + b], [4, 21 + b], [4, 24 + b], [8, 29 + b]], WING.d1);
    ball(l, 15, 29 + b, 8, 6, BODY, 0, (x, y, nx, ny, v) => (ny > 0.1 && nx > -0.5 ? sh(BELLY, v + 0.15) : null));
    // folded wing
    ball(l, 12.5, 27.5 + b, 5.6, 3.3, WING, -0.05, (x, y, nx, ny, v) => ((x + y) % 3 === 0 && nx < 0.4 ? sh(WING, v - 0.3) : null));
    // neck rising from the chest
    for (let y = 15 + b; y <= 25 + b; y++) for (let x = 19; x <= 21; x++) l.set(x, y, sh(NECK, x === 19 ? 0.55 : 0.35));
    ball(l, 21.5, 13.5 + b, 3.6, 3, NECK, 0.12);
  });
  // wing edge
  img.set(8, 27 + b, WING.d2);
  img.set(9, 28 + b, WING.d2);
  // cheek + eye + beak
  for (const [x, y] of [[20, 14], [21, 14], [20, 15], [21, 15], [21, 16], [22, 16]] as const) img.set(x, y + b, CHEEK);
  eye(img, 22, 12 + b, 1);
  img.rect(25, 13 + b, 2, 1, BEAK.l1);
  img.rect(25, 14 + b, 3, 1, BEAK.b);
  img.rect(25, 15 + b, 2, 1, BEAK.d2);
  img.set(27, 14 + b, BEAK.d1);
  finish(img, 8);
  return img;
}

function upRight(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const w = p.sway;
  frontFeet(img, p, 16, 3, 1);
  layer(img, (l) => {
    ball(l, 16 + w, 29 + b, 7.4, 6.6, BODY, 0, (x, y, nx, ny, v) => sh(WING, v - ((y + (nx < 0 ? 0 : 1)) % 3 === 0 ? 0.28 : 0)));
    // tail toward us (lower left), white rump band
    l.poly([[11, 29 + b], [6, 28 + b], [7, 32 + b], [12, 33 + b]], NECK.b);
    l.set(10, 29 + b, CHEEK);
    l.set(11, 30 + b, CHEEK);
    for (let y = 15 + b; y <= 24 + b; y++) for (let x = 18; x <= 21; x++) l.set(x + w, y, sh(NECK, x === 18 ? 0.5 : x === 21 ? 0.2 : 0.35));
    ball(l, 19.5 + w, 13 + b, 3.6, 3.3, NECK, 0.06);
  });
  img.set(22 + w, 15 + b, CHEEK);
  img.set(22 + w, 14 + b, CHEEK);
  img.set(21 + w, 16 + b, CHEEK);
  img.set(23 + w, 14 + b, BEAK.d1); // beak tip peeking out
  finish(img, 8);
  return img;
}

function up(p: Pose): Img {
  const img = newFrame();
  const b = p.bob;
  const w = p.sway;
  frontFeet(img, p, 16, 3, 0);
  clipboard(img, 6 + w, 25 + b, true);
  layer(img, (l) => {
    ball(l, 16 + w, 29 + b, 7, 6.6, BODY, 0, (x, y, nx, ny, v) => sh(WING, v - ((y + (nx < 0 ? 0 : 1)) % 3 === 0 ? 0.28 : 0)));
    // white rump + dark tail fan pointing at us
    l.ellipse(16 + w, 34.5 + b, 2.6, 2.2, (x, y, nx, ny) => sh(NECK, 0.45 - ny * 0.2 - nx * 0.2));
    for (let y = 15 + b; y <= 24 + b; y++) for (let x = 14; x <= 17; x++) l.set(x + w, y, sh(NECK, x === 14 ? 0.5 : x === 17 ? 0.2 : 0.35));
    ball(l, 16 + w, 13 + b, 3.8, 3.4, NECK, 0.06);
  });
  img.set(12 + w, 15 + b, CHEEK);
  img.set(19 + w, 15 + b, CHEEK);
  finish(img, 8);
  return img;
}

const art: CharacterArt = {
  id: 'honk',
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
