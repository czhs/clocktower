// Ginger — the innkeeper fox: orange head with white muzzle, tall dark-tipped ears, red dress with
// a white apron and a blue bow, a big white-tipped tail, and a foaming wooden mug.
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';
import { arm, armFwd, at, ball, chain, Comp, feet, finish, hand, lathe, onHead, pose, pxl, ramp, shade, sphereTh, view, type Img, type View } from './lib-a.js';

const FUR = ramp('#d9682c');
const WHITE = ramp('#f1e4cf');
const DARK = ramp('#3a2228');
const INNER = ramp('#e8a08a');
const DRESS = ramp('#9c2f3a');
const APRON = ramp('#efe6d6');
const BOW = ramp('#3d5ea6');
const BOOT = ramp('#4a2c22');
const WOOD = ramp('#8a5a32');
const FOAM = ramp('#f6eedc');

function ear(img: Img, v: View, side: number, hx: number, hy: number) {
  const base = onHead(v, hx, hy, 6.2, 6, side * 40, -0.6);
  const tipX = base.x + side * Math.abs(Math.cos(((side * 40 + v.yaw) * Math.PI) / 180)) * 1.2;
  const front = base.vis > 0.15;
  const bw = 3.1;
  const pts: [number, number][] = [
    [base.x - bw, base.y + 1.5],
    [base.x + bw, base.y + 1.5],
    [tipX + 0.6, base.y - 7],
    [tipX - 0.6, base.y - 7],
  ];
  img.poly(pts, (x, y) => {
    const ty = y + 0.5 - (base.y - 7);
    if (ty < 2) return ty < 1 ? DARK.b : DARK.l1;
    const inner = front && Math.abs(x + 0.5 - (base.x + (tipX - base.x) * 0.3)) < 1.0 && ty > 2.5;
    if (inner) return INNER.b;
    return shade(FUR, 0.62 - (x - (base.x - bw)) * 0.07 - ty * 0.02);
  });
}

function draw(dir: DrawnDir, frame: FrameIndex): Img {
  const v = view(dir);
  const p = pose(frame);
  const b = p.bob;
  const comp = new Comp();
  const hx = 16 + v.s * 0.5;
  const hy = 19 + b;

  feet(comp, v, p, { sep: 2.6, hip: 34, boot: BOOT, bootW: 3, bootH: 2, stride: 2 });

  // tail: from the lower back, out to the right-back, curling up; sways when walking
  const sway = p.walking ? (p.step !== 0 ? p.step * 8 : 0) : 0;
  const tailPts = [];
  const N = 12;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const th = 180 + (42 + sway) * t + 16 * t * t;
    tailPts.push({ r: 3.5 + t * 7.6, th, y: 34 + b - Math.sin(t * Math.PI * 0.85) * 3.6 + (p.lag === 2 ? t * 0.8 : 0), rad: 1.5 + Math.sin(t * Math.PI * 0.75) * 1.9, ramp: t > 0.86 ? WHITE : FUR });
  }
  const [tailBack, tailFront] = chain(v, tailPts);
  comp.add(-8, tailBack, 0.72);
  comp.add(3, tailFront, 0.72);

  // dress (A-line) with apron + bow
  comp.add(0, (img) =>
    lathe(img, v, {
      y0: 24 + b,
      y1: 35 + b,
      rx: (_y, t) => 4.3 + t * 2.8 + (t > 0.85 ? 0.3 : 0),
      rz: (_y, t) => 3.9 + t * 2.4,
      color: (h) => {
        const a = Math.abs(h.th);
        if (h.y === 35 + b) return shade(DRESS, h.v - 0.25);
        const apronTop = 28 + b;
        if (h.y >= apronTop && h.y <= 34 + b && a < 36) return shade(APRON, h.v + 0.15 - (a > 28 ? 0.15 : 0));
        if (h.y >= 25 + b && h.y < apronTop && a < 17) return shade(APRON, h.v + 0.15);
        if (a > 135 && h.y === 26 + b && Math.abs(a - 180) < 30) return APRON.d1; // apron strings at the back
        return shade(DRESS, h.v);
      },
    }),
  );
  // bow at the collar (front) / apron bow at the back
  comp.add(4.5, (img) => {
    const fr = at(v, 4.5, 0, 24 + b);
    if (fr.vis > 0.2) {
      const x = pxl(fr.x, 1);
      img.set(x, 24 + b, BOW.l1);
      img.set(x - 1, 24 + b, BOW.b);
      img.set(x + 1, 24 + b, BOW.d1);
      img.set(x - 1, 25 + b, BOW.d1);
      img.set(x + 1, 25 + b, BOW.d2);
    }
    const bk = at(v, 4.8, 180, 27 + b);
    if (bk.vis > 0.2) {
      const x = pxl(bk.x, 1);
      img.set(x, 27 + b, APRON.b);
      img.set(x - 1, 26 + b, APRON.l1);
      img.set(x + 1, 26 + b, APRON.b);
      img.set(x - 1, 28 + b, APRON.d1);
      img.set(x + 1, 28 + b, APRON.d1);
    }
  });

  // arms: puffed red sleeves, dark paws; the mug in the left paw
  for (const side of [-1, 1]) {
    const sh = at(v, 4.6, side * 90, 26 + b);
    const hd = hand(v, p, side, 5.8, 30 + b, 1.4);
    const far = hd.z < -2;
    comp.add(1 + hd.z * 0.3, (img) => {
      ball(img, sh.x, sh.y + 0.5, 2.1, 2.1, DRESS, far ? -0.2 : 0.1);
      arm(img, sh, hd, DRESS, FUR, 2, far);
    });
    if (side === 1) {
      const m = at(v, 7.4, 70, 29 + b, armFwd(p, side) * 1.4 + 1);
      comp.add(1.3 + m.z * 0.3, (img) => {
        const x0 = pxl(m.x, 4);
        const y0 = Math.round(m.y);
        for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 4; x++) img.set(x, y, shade(WOOD, 0.75 - (x - x0) * 0.15 - (y - y0) * 0.03));
        img.hline(x0, x0 + 3, y0 + 1, WOOD.d2);
        img.hline(x0, x0 + 3, y0 + 3, WOOD.d2);
        img.hline(x0, x0 + 3, y0 - 1, FOAM.b);
        img.set(x0 + 1, y0 - 2, FOAM.l1);
        img.set(x0 + 2, y0 - 2, FOAM.b);
        img.set(x0, y0, FOAM.d1);
        // handle on the outer side
        const hs = m.x >= 16 ? 1 : -1;
        const hxp = hs > 0 ? x0 + 4 : x0 - 1;
        img.set(hxp, y0 + 1, WOOD.d1);
        img.set(hxp, y0 + 2, WOOD.d1);
        img.set(hxp, y0 + 3, WOOD.d1);
      }, 0.65);
    }
  }

  // head
  const eyes = [-1, 1].map((s) => onHead(v, hx, hy, 6.6, 6, s * 30, 0.05));
  const snout = onHead(v, hx, hy, 6.6, 6, 0, 0.42);
  for (const s of [-1, 1]) {
    const e = onHead(v, hx, hy, 6.2, 6, s * 40, -0.62);
    comp.add(4 + e.z * 0.01, (img) => ear(img, v, s, hx, hy), 0.72);
  }
  comp.add(5, (img) => {
    ball(img, hx, hy, 7, 6, FUR, 0.04, (_x, _y, nx, ny) => {
      const { th } = sphereTh(v, nx, ny);
      const a = Math.abs(th);
      // white cheeks / muzzle: lower face, widening to the sides
      if (a < 88 && ny > 0.3 - Math.max(0, a - 30) * 0.004) return shade(WHITE, 0.75 - nx * 0.25 - (ny - 0.3) * 0.3);
      return undefined;
    });
    if (v.face) {
      // cheek fluff tufts on the silhouette
      for (const s of [-1, 1]) {
        const c = onHead(v, hx, hy, 7, 6, s * 92, 0.45);
        if (c.vis > -0.25) {
          const x = pxl(c.x + (c.x > hx ? 0.6 : -0.6), 1);
          img.set(x, Math.round(c.y), WHITE.d1);
          img.set(x, Math.round(c.y) + 1, WHITE.d2);
        }
      }
    }
  }, 0.72);
  if (v.face) {
    comp.add(6, (img) => {
      // snout bump + nose
      if (v.down) {
        const nx0 = pxl(hx, 2);
        const ny0 = Math.round(hy + 1.6);
        img.rect(nx0, ny0, 2, 1, DARK.d2);
        img.set(nx0 - 1, ny0 + 1, DARK.b);
        img.set(nx0 + 2, ny0 + 1, DARK.b);
        img.set(nx0, ny0 + 1, WHITE.d1);
        img.set(nx0 + 1, ny0 + 1, WHITE.d1);
      } else if (snout.vis > -0.1) {
        const sx = snout.x + v.s * 1.4;
        img.ellipse(sx, snout.y + 0.4, 2 + Math.abs(v.s) * 0.4, 1.6, (x, y, nx, ny) => shade(WHITE, 0.85 - nx * 0.25 - ny * 0.25));
        const nxp = pxl(sx + v.s * 1.6, 2);
        img.rect(nxp, Math.round(snout.y - 1), v.right ? 1 : 2, 1, DARK.d2);
        if (!v.right) img.set(nxp, Math.round(snout.y - 1), DARK.b);
        else img.set(nxp + 1, Math.round(snout.y - 1), DARK.d2);
        // smile
        if (!v.right) {
          const my = Math.round(snout.y + 1);
          img.set(pxl(sx, 1) - 1, my, DARK.b);
          img.set(pxl(sx, 1) + 1, my, DARK.b);
        }
      }
      for (const e of eyes) {
        if (e.vis < 0.1) continue;
        const w = e.vis > 0.45 ? 2 : 1;
        const x = pxl(e.x + v.s * 0.4, w);
        img.rect(x, Math.round(e.y) - 1, w, 2, '#160c18');
        if (w === 2) img.set(x, Math.round(e.y) - 1, '#fff2d8');
      }
    });
  }

  return finish(comp.render(), 6.5);
}

const fox: CharacterArt = { id: 'fox', draw };
export default fox;
