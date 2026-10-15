// Archivist Hoot — a round brown owl scholar: cream facial disc, huge amber eyes, ear tufts, a navy
// academic robe with gold trim and a burgundy mantle, a thick ledger hugged to the chest.
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';
import { at, ball, Comp, feet, finish, lathe, onHead, pose, pxl, ramp, shade, sphereTh, stroke, view, type Img, type View } from './lib-a.js';

const FEATH = ramp('#8a5a34');
const DISC = ramp('#ecdcb8');
const AMBER = ramp('#f0a22c');
const ROBE = ramp('#2e3a6e');
const GOLD = ramp('#d6ac4c');
const MANTLE = ramp('#7e2a3a');
const BOOK = ramp('#7a4326');
const PAGE = ramp('#efe2c2');
const TALON = ramp('#9a8a6a');
const BEAK = ramp('#3a3038');

function tuft(img: Img, v: View, side: number, hx: number, hy: number) {
  const base = onHead(v, hx, hy, 6.8, 6.4, side * 42, -0.72);
  const out = side * Math.max(0.3, Math.abs(Math.sin(((side * 42 + v.yaw) * Math.PI) / 180)));
  const x0 = base.x;
  img.poly(
    [
      [x0 - 2, base.y + 1.5],
      [x0 + 2, base.y + 1.5],
      [x0 + out * 2.6 + 0.6, base.y - 4.4],
      [x0 + out * 2.6 - 0.6, base.y - 4.4],
    ],
    (x, y) => shade(FEATH, 0.7 - (x - x0 + 2) * 0.08 - (y - base.y) * 0.04),
  );
}

function draw(dir: DrawnDir, frame: FrameIndex): Img {
  const v = view(dir);
  const p = pose(frame);
  const b = p.bob;
  const comp = new Comp();
  const hx = 16 + v.s * 0.4;
  const hy = 18.5 + b;

  feet(comp, v, p, { sep: 2.6, hip: 34, boot: TALON, bootW: 3, bootH: 2, stride: 2, kind: 'talon' });

  // robe: round and wide, gold hem + front edges
  comp.add(0, (img) =>
    lathe(img, v, {
      y0: 24 + b,
      y1: 35 + b,
      rx: (_y, t) => 6 + Math.sin(t * Math.PI * 0.7) * 1.4,
      rz: (_y, t) => 5.2 + Math.sin(t * Math.PI * 0.7) * 1.2,
      color: (h) => {
        const a = Math.abs(h.th);
        if (h.y === 35 + b) return shade(GOLD, h.v - 0.1);
        if (Math.abs(a - 12) < 4) return shade(GOLD, h.v); // robe opening edges
        if (a < 9) return shade(ramp('#1e2546'), h.v);
        if (h.y === 31 + b && Math.abs(Math.abs(h.th) - 60) < 8) return GOLD.d1; // embroidered fleck
        return shade(ROBE, h.v);
      },
    }),
  );
  // burgundy mantle over the shoulders
  comp.add(3, (img) =>
    lathe(img, v, {
      y0: 24 + b,
      y1: 27 + b,
      rx: (_y, t) => 6.1 + t * 1.6,
      rz: (_y, t) => 5.4 + t * 1.4,
      color: (h) => {
        if (h.y === 27 + b) return Math.abs(h.th) < 30 ? null : shade(GOLD, h.v);
        if (Math.abs(h.th) < 26 && h.y > 24 + b) return null;
        return shade(MANTLE, h.v + 0.05);
      },
    }),
  );

  // wings (sleeves) + the ledger held in front
  const bookPt = at(v, 6.4, 0, 28 + b);
  for (const side of [-1, 1]) {
    const sh = at(v, 6, side * 88, 26 + b);
    // both hands on the book: front-facing views hug it; otherwise they swing a little
    const hold = bookPt.z > -1;
    const hd = hold ? at(v, 6.2, side * 34, 30 + b) : at(v, 7, side * 90, 31 + b, -p.step * side * 1.2);
    const far = hd.z < -2.5;
    comp.add(hold ? 4 + hd.z * 0.1 : 1 + hd.z * 0.3, (img) => {
      stroke(img, sh.x, sh.y, hd.x, hd.y, 3, (x) => shade(ROBE, (far ? 0.3 : 0.55) - (x - hd.x) * 0.06));
      const lx = pxl(hd.x, 2);
      img.rect(lx, Math.round(hd.y) + 1, 2, 1, GOLD.b); // cuff
      img.rect(lx, Math.round(hd.y) + 2, 2, 1, FEATH.d1);
    });
  }
  if (bookPt.z > -1) {
    comp.add(4.5, (img) => {
      // book face-on width shrinks as he turns
      const wFace = Math.max(1, Math.round(6 * Math.abs(v.c)));
      const wSpine = v.c > 0.95 ? 0 : 2;
      const x0 = pxl(bookPt.x + (v.s > 0 ? -1 : 0), wFace + wSpine);
      const y0 = 27 + b;
      for (let y = y0; y < y0 + 6; y++) {
        for (let i = 0; i < wFace; i++) img.set(x0 + i, y, shade(BOOK, 0.68 - i * 0.05 - (y - y0) * 0.03));
        for (let i = 0; i < wSpine; i++) img.set(x0 + wFace + i, y, i === 0 ? PAGE.b : PAGE.d1);
      }
      if (wFace >= 4) {
        img.hline(x0 + 1, x0 + wFace - 2, y0 + 2, GOLD.b);
        img.set(x0 + Math.floor(wFace / 2), y0 + 3, GOLD.l1);
      }
      img.hline(x0, x0 + wFace - 1, y0, BOOK.l1);
    }, 0.65);
  }

  // head (the owl is mostly head)
  for (const s of [-1, 1]) comp.add(5.5 - 0.01 * s, (img) => tuft(img, v, s, hx, hy), 0.72);
  comp.add(6, (img) => {
    ball(img, hx, hy, 7.4, 6.6, FEATH, 0.04, (x, y, nx, ny) => {
      const { th } = sphereTh(v, nx, ny);
      // facial disc: two overlapping cream circles around the eyes
      for (const s of [-1, 1]) {
        const d = Math.hypot((th - s * 27) / 34, (ny - 0.04) / 0.5);
        if (d < 1) return shade(DISC, 0.85 - nx * 0.2 - (d > 0.82 ? 0.3 : 0));
      }
      // feather scallops on the back/crown
      if (Math.abs(th) > 70 && y % 2 === 0 && (x + (y >> 1) * 2) % 4 === 0 && ny > -0.6) return FEATH.d1;
      if (Math.abs(th) < 60 && ny > 0.55 && (x + y) % 2 === 0) return FEATH.l1;
      return undefined;
    });
    if (!v.face) return;
    // eyes: big amber with black pupils
    for (const s of [-1, 1]) {
      const e = onHead(v, hx, hy, 7.4, 6.6, s * 26, 0.0);
      if (e.vis < 0.2) continue;
      const big = e.vis > 0.6;
      const ex = e.x - (e.vis < 0.8 ? Math.sign(e.x - hx) * 0.6 : 0);
      if (big) {
        const x0 = pxl(ex, 3);
        const y0 = Math.round(e.y) - 1;
        const x4 = pxl(ex, 4);
        img.rect(x4, y0, 4, 3, AMBER.b);
        img.hline(x4 + 1, x4 + 2, y0 - 1, AMBER.l1);
        img.hline(x4 + 1, x4 + 2, y0 + 3, AMBER.d1);
        img.set(x4, y0, AMBER.l1);
        const pxp = pxl(ex + v.s * 0.6, 2);
        img.rect(pxp, y0, 2, 2, '#160c14');
        img.set(pxp, y0, '#fff4d8');
        void x0;
      } else {
        const x0 = pxl(ex, 2);
        const y0 = Math.round(e.y) - 1;
        img.rect(x0, y0, 2, 3, AMBER.b);
        img.rect(x0 + (v.s > 0 ? 1 : 0), y0, 1, 2, '#160c14');
      }
    }
    const bk = onHead(v, hx, hy, 7.4, 6.6, 0, 0.28);
    if (bk.vis > -0.05) {
      const bx = pxl(bk.x + v.s * 0.8, 1);
      const by = Math.round(bk.y);
      img.set(bx, by, BEAK.l1);
      img.set(bx, by + 1, BEAK.b);
      if (v.down) img.set(bx - 1, by, BEAK.b);
      else img.set(bx + 1, by, BEAK.b);
    }
  }, 0.72);

  return finish(comp.render(), 7.5);
}

const owl: CharacterArt = { id: 'owl', draw };
export default owl;
