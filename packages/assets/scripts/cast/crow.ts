// Mortimer — the gravedigger crow: black feathered head with a long pale plague-doctor beak, amber
// eyes, a wide-brimmed brown hat, a long charcoal coat with brass buttons, and an iron shovel.
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';
import { arm, armFwd, at, ball, Comp, feet, finish, hand, lathe, onHead, pose, pxl, ramp, shade, view, type Img } from './lib-a.js';

const FEATH = ramp('#2c2a3c');
const SHEEN = '#5c6688';
const COAT = ramp('#4a4a5c');
const LINING = ramp('#5a2c3a');
const BRASS = ramp('#c89a48');
const HAT = ramp('#4e3528');
const BAND = ramp('#7a5236');
const BEAK = ramp('#e2cfa0');
const IRON = ramp('#7c8290');
const WOOD = ramp('#8a5e38');
const TALON = ramp('#4a4450');
const EYE = '#f2a83a';

function draw(dir: DrawnDir, frame: FrameIndex): Img {
  const v = view(dir);
  const p = pose(frame);
  const b = p.bob;
  const comp = new Comp();
  const hx = 16 + v.s * 0.4;
  const hy = 18 + b;

  feet(comp, v, p, { sep: 2.6, hip: 34, boot: TALON, bootW: 3, bootH: 2, stride: 2, kind: 'talon' });

  // long coat; hem in ragged feather points, coat tails lag when walking
  const lag = [0, 1, 2][p.lag]!;
  comp.add(0, (img) =>
    lathe(img, v, {
      y0: 23 + b,
      y1: 35 + b,
      rx: (_y, t) => 4.6 + t * 2.9,
      rz: (_y, t) => 4.2 + t * 2.4,
      dx: (_y, t) => -v.s * Math.max(0, t - 0.5) * 2 * lag * 0.6,
      color: (h) => {
        const a = Math.abs(h.th);
        if (h.y === 35 + b && h.x % 3 === 0 && a > 20) return null; // ragged hem
        if (a < 5 && h.y > 24 + b) return shade(COAT, h.v - 0.3); // coat seam
        if (a < 13 && (h.y - b === 26 || h.y - b === 29 || h.y - b === 32)) return BRASS.l1; // buttons
        if (h.y === 31 + b && a > 110) return shade(BRASS, h.v - 0.1); // half-belt at the back
        if (a > 160 && h.y > 31 + b) return shade(COAT, h.v - 0.3); // back vent
        return shade(COAT, h.v);
      },
    }),
  );
  // feather ruff collar
  comp.add(2, (img) =>
    lathe(img, v, {
      y0: 22 + b,
      y1: 24 + b,
      rx: (_y, t) => 4.8 + t * 1.2,
      color: (h) => ((h.x + h.y) % 2 === 0 && h.y === 24 + b ? null : shade(FEATH, h.v + 0.05)),
    }),
  );

  // arms; the shovel in the right hand, planted like a walking stick
  for (const side of [-1, 1]) {
    const sh = at(v, 4.8, side * 90, 25 + b);
    const hd = hand(v, p, side, 6.2, 29 + b, 1.4);
    const far = hd.z < -2;
    comp.add(1 + hd.z * 0.3, (img) => {
      arm(img, sh, hd, ramp('#3a3848'), FEATH, 2, far);
      // turned-back cuff
      const lx = pxl(hd.x, 2);
      img.hline(lx, lx + 1, Math.round(hd.y) - 1, LINING.b);
    });
    if (side === -1) {
      const top = at(v, 7.4, -90, 0, armFwd(p, side) * 1.4 + 0.5);
      const bot = at(v, 8.2, -90, 0, armFwd(p, side) * 1.4 + 1.2);
      comp.add(far ? -6 : 1.5 + hd.z * 0.3, (img) => {
        const x0 = pxl(top.x, 1);
        const x1 = pxl(bot.x, 1);
        const yTop = 19 + b;
        const yBlade = 31 + b;
        // handle with a T grip
        for (let y = yTop; y < yBlade; y++) {
          const x = Math.round(x0 + ((x1 - x0) * (y - yTop)) / (yBlade - yTop));
          img.set(x, y, y % 4 === 0 ? WOOD.d1 : WOOD.b);
        }
        img.hline(x0 - 1, x0 + 1, yTop - 1, WOOD.l1);
        // iron blade (spade), face-on width depends on the turn
        const bw = Math.abs(v.c) > 0.3 ? 4 : 2;
        const bx = pxl(x1, bw);
        for (let y = yBlade; y <= 36; y++) {
          const inset = y === 36 ? 1 : 0;
          for (let i = inset; i < bw - inset; i++) img.set(bx + i, y, shade(IRON, 0.75 - i * 0.12 - (y - yBlade) * 0.04));
        }
        img.hline(bx, bx + bw - 1, yBlade, IRON.l2);
        if (bw === 4) img.set(bx + 1, yBlade + 2, IRON.d1);
      }, 0.68);
    }
  }

  // head: black, round, feathered tuft at the back
  const beakBase = onHead(v, hx, hy, 5.6, 5, 0, 0.25);
  const beakTipX = hx + v.s * 9.5;
  const beakTipY = hy + 1.5 + 4.2 * Math.max(0, v.c) + (v.c < 0 ? 0 : 0);
  const beakZ = beakBase.z;
  const drawBeak = (img: Img) => {
    // a tapered wedge from the face to the tip, curving down at the end
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = beakBase.x + (beakTipX - beakBase.x) * t;
      const y = beakBase.y + (beakTipY - beakBase.y) * t + t * t * 1.4 * Math.abs(v.s);
      const w = Math.max(1, Math.round(3.4 * (1 - t) * (0.7 + 0.3 * Math.abs(v.c)) + 0.4));
      const hgt = Math.max(1, Math.round(3 * (1 - t) + 0.5));
      const lx = pxl(x, w);
      for (let j = 0; j < hgt; j++)
        for (let k = 0; k < w; k++) img.set(lx + k, Math.round(y) - Math.floor(hgt / 2) + j, shade(BEAK, 0.78 - k * (0.5 / Math.max(1, w)) - j * 0.12));
    }
    // nostril line
    if (Math.abs(v.s) > 0.5) img.set(pxl(beakBase.x + v.s * 2.5, 1), Math.round(beakBase.y - 0.5), BEAK.d2);
  };
  comp.add(beakZ < -1 ? 4.5 : 6.5, drawBeak, 0.7);
  comp.add(5, (img) => {
    ball(img, hx, hy, 5.8, 5.2, FEATH, 0.06, (_x, _y, nx, ny) => (nx < -0.2 && ny < -0.1 && nx + ny > -1.25 && nx + ny < -0.75 ? SHEEN : undefined));
    // feather tuft on the back of the head
    const tf = onHead(v, hx, hy, 5.8, 5.2, 180, 0.35);
    if (tf.vis > -0.9) {
      const tx = pxl(tf.x - v.s * 0.8, 1);
      img.set(tx, Math.round(tf.y), FEATH.d1);
      img.set(tx - Math.sign(v.s || 1), Math.round(tf.y) + 1, FEATH.d1);
    }
    if (!v.face) return;
    for (const s of [-1, 1]) {
      const e = onHead(v, hx, hy, 5.8, 5.2, s * 44, 0.0);
      if (e.vis < 0.2) continue;
      const ex = pxl(e.x - (e.vis < 0.6 ? Math.sign(e.x - hx) * 0.8 : 0), e.vis > 0.6 ? 2 : 1);
      const ey = Math.round(e.y) - 1;
      img.rect(ex, ey, e.vis > 0.6 ? 2 : 1, 2, EYE);
      img.set(ex + (e.vis > 0.6 ? 1 : 0), ey + 1, '#1a0e10');
    }
  }, 0.72);

  // wide-brimmed hat: brim ellipse + crown with a band
  const ty = 13 + b;
  comp.add(7, (img) => {
    img.ellipse(hx, ty + 0.5, 10, 1.9, (_x, y, nx) => shade(HAT, (y <= ty ? 0.66 : 0.3) - nx * 0.25));
    for (let y = ty - 5; y <= ty; y++) {
      const half = y === ty - 5 ? 3.6 : 4.1;
      for (let x = Math.ceil(hx - half - 0.5); x <= Math.floor(hx + half - 0.5); x++) {
        const nx = (x + 0.5 - hx) / half;
        let c = shade(HAT, 0.66 - nx * 0.32 - (y - ty + 5) * 0.03);
        if (y >= ty - 2 && y <= ty - 1) c = shade(BAND, 0.6 - nx * 0.3);
        if (y === ty - 2 && Math.abs(x + 0.5 - (hx + v.s * 3.2)) < 1 && v.face) c = BRASS.l1; // buckle
        img.set(x, y, c);
      }
    }
    img.hline(Math.ceil(hx - 3.5 - 0.5) + 1, Math.floor(hx + 3.5 - 0.5) - 1, ty - 5, HAT.l1);
  }, 0.72);

  return finish(comp.render(), 7);
}

const crow: CharacterArt = { id: 'crow', draw };
export default crow;
