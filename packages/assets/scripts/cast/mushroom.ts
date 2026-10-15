// Brother Morel — mushroom monk: a huge red cap with cream spots (wider than the body), a small
// shy face under it, an ivory robe with a red stole and hem, and a little golden star staff.
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';
import { arm, at, ball, Comp, feet, finish, hand, lathe, onHead, pose, pxl, ramp, shade, sphereTh, view, type Img } from './lib-a.js';

const CAP = ramp('#c23a34');
const SPOT = ramp('#f3e6c8');
const SKIN = ramp('#efd9b4');
const ROBE = ramp('#e6ddc8');
const TRIM = ramp('#b8343a');
const BOOT = ramp('#5a3626');
const GOLD = ramp('#e0b44c');

/** Spots on the cap: [turntable angle, elevation (-1 top .. 0 rim), radius (cos threshold)]. */
const SPOTS: [number, number, number][] = [
  [0, -0.45, 0.955],
  [62, -0.25, 0.965],
  [-62, -0.25, 0.965],
  [125, -0.4, 0.96],
  [-125, -0.4, 0.96],
  [180, -0.2, 0.965],
  [30, -0.9, 0.965],
  [-150, -0.85, 0.97],
  [95, -0.75, 0.975],
];
const vec = (th: number, el: number): [number, number, number] => {
  const k = Math.sqrt(Math.max(0, 1 - el * el));
  const r = (th * Math.PI) / 180;
  return [k * Math.sin(r), el, k * Math.cos(r)];
};
const SPOTV = SPOTS.map(([th, el, c]) => ({ v: vec(th, el), c }));

function draw(dir: DrawnDir, frame: FrameIndex): Img {
  const v = view(dir);
  const p = pose(frame);
  const b = p.bob;
  const comp = new Comp();

  feet(comp, v, p, { sep: 2.5, hip: 34, boot: BOOT, bootW: 3, bootH: 2, stride: 2 });

  // robe
  comp.add(0, (img) =>
    lathe(img, v, {
      y0: 24 + b,
      y1: 35 + b,
      rx: (_y, t) => 3.9 + t * 2.6,
      rz: (_y, t) => 3.6 + t * 2.2,
      color: (h) => {
        const a = Math.abs(h.th);
        if (h.y >= 34 + b) return shade(TRIM, h.v - 0.05);
        // red stole: two bands down the front
        if (a > 12 && a < 30 && h.y < 34 + b) return shade(TRIM, h.v + 0.05 + (a < 21 ? 0.12 : 0));
        return shade(ROBE, h.v + 0.05);
      },
    }),
  );

  // arms: ivory sleeves; staff in the left hand
  for (const side of [-1, 1]) {
    const sh = at(v, 4.2, side * 90, 26 + b);
    const hd = hand(v, p, side, 5.6, 30 + b, 1.4);
    const far = hd.z < -2;
    comp.add(1 + hd.z * 0.3, (img) => {
      ball(img, sh.x, sh.y + 0.6, 2, 2, ROBE, far ? -0.25 : 0.05);
      arm(img, sh, hd, ROBE, SKIN, 2, far);
    });
    if (side === 1) {
      const sx = hd.x + (hd.x >= 16 ? 0.6 : -0.6);
      comp.add(hd.z < -2 ? -5 : 7, (img) => {
        const x = pxl(sx, 1);
        for (let y = 11 + b; y <= 36; y++) img.set(x, y, y < hd.y || y > hd.y + 1 ? (y % 5 === 0 ? GOLD.d1 : GOLD.b) : GOLD.b);
        // star
        const sy = 9 + b;
        img.set(x, sy - 2, GOLD.l2);
        img.hline(x - 2, x + 2, sy, GOLD.l1);
        img.rect(x - 1, sy - 1, 3, 3, GOLD.l1);
        img.set(x, sy, '#fff6d0');
        img.set(x - 1, sy + 2, GOLD.b);
        img.set(x + 1, sy + 2, GOLD.d1);
      }, 0.7);
    }
  }

  // face under the cap
  const fx = 16 + v.s * 0.5;
  const fy = 22 + b;
  comp.add(4, (img) => {
    ball(img, fx, fy, 5.4, 4.2, SKIN, 0.05);
    if (v.face) {
      for (const s of [-1, 1]) {
        const e = onHead(v, fx, fy, 5.4, 4.2, s * 32, -0.05);
        if (e.vis < 0.15) continue;
        const ex = pxl(e.x + v.s * 0.3 - (e.vis < 0.75 ? Math.sign(e.x - fx) : 0), 1);
        img.set(ex, Math.round(e.y) - 1, '#1a1020');
        img.set(ex, Math.round(e.y), '#1a1020');
        const ch = onHead(v, fx, fy, 5.4, 4.2, s * 50, 0.4);
        if (ch.vis > 0.3) img.set(pxl(ch.x, 1), Math.round(ch.y), '#e49a86');
      }
      const m = onHead(v, fx, fy, 5.4, 4.2, 0, 0.5);
      if (m.vis > 0.3) {
        const mx = pxl(m.x + v.s * 0.6, 1);
        img.set(mx, Math.round(m.y), SKIN.d2);
        if (v.down) {
          img.set(mx - 1, Math.round(m.y) - 1, SKIN.d2);
          img.set(mx + 1, Math.round(m.y) - 1, SKIN.d2);
          img.set(mx + 1, Math.round(m.y), SKIN.d2);
        } else img.set(mx + 1, Math.round(m.y) - 1, SKIN.d2);
      }
    }
  }, 0.72);

  // the cap: a dome, flat underneath; spots fixed on it so they turn with him
  const cy = 17 + b;
  comp.add(6, (img) => {
    const rx = 9.6;
    const ry = 7.8;
    img.ellipse(16, cy, rx, ry, (x, y, nx, ny) => {
      if (y > cy + 1) return null;
      // underside rim: the bottom row is the shaded lip
      if (y === cy + 1) return shade(CAP, 0.18 - nx * 0.1);
      if (y === cy) return shade(CAP, 0.3 - nx * 0.2);
      const { th, el } = sphereTh(v, nx, ny);
      const pv = vec(th, el);
      const lv = 0.5 + (nx * -0.62 + ny * -0.78) * 0.42 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.14;
      for (const s of SPOTV) {
        const d = pv[0] * s.v[0] + pv[1] * s.v[1] + pv[2] * s.v[2];
        if (d > s.c) return shade(SPOT, lv + 0.2);
      }
      return shade(CAP, lv);
    });
  }, 0.72);
  // shadow under the cap brim on the face
  comp.add(6.1, (img) => {
    for (let x = 0; x < 32; x++) {
      const y = cy + 2;
      if (img.alpha(x, y) && img.alpha(x, y - 1)) img.tint(x, y, '#5a2a3a', 0.35);
    }
  });

  return finish(comp.render(), 7.5);
}

const mushroom: CharacterArt = { id: 'mushroom', draw };
export default mushroom;
