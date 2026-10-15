// Magistrate Billings — the judge goat: a white goat head with big curled tan horns, floppy ears and
// a little beard (and a corner of the evidence in his mouth), a gold-and-brown magistrate robe with
// a red collar, and a tall wooden staff with a brass top.
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';
import { arm, armFwd, at, ball, chain, Comp, feet, finish, hand, lathe, onHead, pose, pxl, ramp, shade, sphereTh, view, type Img, type View } from './lib-a.js';

const WOOL = ramp('#ece4d6');
const NOSE = ramp('#d8a8a0');
const HORN = ramp('#c49a62');
const ROBE = ramp('#b8892e');
const PANEL = ramp('#5a3a26');
const COLLAR = ramp('#a02c34');
const GOLD = ramp('#e2bc58');
const STAFF = ramp('#7a5232');
const BOOT = ramp('#4a3024');
const PAPER = ramp('#f2ead8');

function ear(img: Img, v: View, side: number, hx: number, hy: number) {
  const e = onHead(v, hx, hy, 6.4, 5.4, side * 88, -0.05);
  const sph = Math.sin(((side * 88 + v.yaw) * Math.PI) / 180);
  // ears flop outward; seen edge-on they hang back, away from the facing direction
  const dir = Math.abs(sph) > 0.3 ? Math.sign(sph) : -Math.sign(v.s) || side;
  const reach = Math.abs(sph) > 0.3 ? 0.9 + 1.1 * Math.abs(sph) : 2.6;
  const x0 = Math.abs(sph) > 0.3 ? e.x + dir * reach : hx - v.s * 5.6;
  img.ellipse(x0, e.y + 2, 1.8, 1.4, (x, y, nx, ny) => {
    if (e.vis > -0.1 && Math.abs(sph) > 0.3 && ny > -0.2 && Math.abs(nx) < 0.6) return NOSE.b; // pink inner
    return shade(WOOL, 0.6 - nx * 0.2 - ny * 0.2);
  });
  const tx = pxl(x0 + dir * 1.2, 1);
  img.set(tx, Math.round(e.y + 3), WOOL.d1);
  img.set(tx, Math.round(e.y + 4), WOOL.d2);
}

function draw(dir: DrawnDir, frame: FrameIndex): Img {
  const v = view(dir);
  const p = pose(frame);
  const b = p.bob;
  const comp = new Comp();
  const hx = 16 + v.s * 0.6;
  const hy = 18 + b;

  feet(comp, v, p, { sep: 2.6, hip: 35, boot: BOOT, bootW: 3, bootH: 2, stride: 2 });

  // magistrate robe: gold, dark front panel, gold hem
  comp.add(0, (img) =>
    lathe(img, v, {
      y0: 23 + b,
      y1: 35 + b,
      rx: (_y, t) => 4.6 + t * 2.8,
      rz: (_y, t) => 4.2 + t * 2.4,
      color: (h) => {
        const a = Math.abs(h.th);
        if (h.y === 35 + b) return shade(PANEL, h.v - 0.1);
        if (a < 16 && h.y > 25 + b) return shade(PANEL, h.v + 0.05);
        if (Math.abs(a - 18) < 3 && h.y > 25 + b) return shade(GOLD, h.v + 0.05);
        if (a < 16 && h.y > 26 + b && (h.y - b) % 3 === 0) return GOLD.l1;
        if (h.y === 33 + b) return shade(GOLD, h.v - 0.05); // embroidered band
        return shade(ROBE, h.v);
      },
    }),
  );
  // red collar / mantle with a gold edge
  comp.add(3, (img) =>
    lathe(img, v, {
      y0: 22 + b,
      y1: 26 + b,
      rx: (_y, t) => 5 + t * 2,
      rz: (_y, t) => 4.6 + t * 1.8,
      color: (h) => {
        const a = Math.abs(h.th);
        if (a < 14 + (h.y - 22 - b) * 7) return null; // V opening at the front
        if (h.y === 26 + b || a < 18 + (h.y - 22 - b) * 7) return shade(GOLD, h.v);
        return shade(COLLAR, h.v + 0.05);
      },
    }),
  );

  // arms; tall staff in the right hand
  for (const side of [-1, 1]) {
    const sh = at(v, 5, side * 90, 25 + b);
    const hd = hand(v, p, side, 6.4, 29 + b, 1.3);
    const far = hd.z < -2;
    comp.add(side === -1 && !far ? 4.6 : 1 + hd.z * 0.3, (img) => {
      arm(img, sh, hd, ROBE, WOOL, 2, far);
      const lx = pxl(hd.x, 2);
      img.hline(lx, lx + 1, Math.round(hd.y) - 1, COLLAR.b); // red cuff
    });
    if (side === -1) {
      const st = at(v, 7.6, -90, 0, armFwd(p, side) * 1.3 + 0.6);
      comp.add(far ? -7 : 4.5, (img) => {
        const x = pxl(st.x, 1);
        for (let y = 9 + b; y <= 37; y++) img.set(x, y, y % 5 === 2 ? STAFF.d1 : STAFF.b);
        img.set(x - 1, 30 + b, STAFF.l1);
        // brass head: a knob with a ring
        ball(img, x + 0.5, 7.5 + b, 1.9, 1.9, GOLD, 0.1);
        img.hline(x - 1, x + 1, 10 + b, GOLD.d1);
      }, 0.7);
    }
  }

  // horns: curl up, back and down on each side
  for (const side of [-1, 1]) {
    // key points (radius, angle, height above the head centre): up from the crown, arching back, curling down
    const K: [number, number, number][] = [
      [2.4, 22, -4.6],
      [3.6, 50, -7.4],
      [5.2, 92, -8.2],
      [6.4, 128, -6.4],
      [6.6, 150, -3.4],
      [5.4, 160, -1.6],
    ];
    const pts = [];
    const N = 15;
    for (let k = 0; k <= N; k++) {
      const u = (k / N) * (K.length - 1);
      const i = Math.min(K.length - 2, Math.floor(u));
      const f = u - i;
      const A = K[i]!;
      const B = K[i + 1]!;
      pts.push({ r: A[0] + (B[0] - A[0]) * f, th: side * (A[1] + (B[1] - A[1]) * f), y: hy + A[2] + (B[2] - A[2]) * f, rad: 1.7 - (k / N) * 0.8, ramp: HORN });
    }
    const [back, front] = chain(v, pts);
    comp.add(4, (img) => {
      back(img);
      // ridges
    }, 0.7);
    comp.add(6.4 + side * 0.01, front, 0.7);
  }
  for (const side of [-1, 1]) {
    const e = onHead(v, hx, hy, 6.4, 5.4, side * 88, 0);
    comp.add(e.vis < -0.15 ? 4.2 : 6.2, (img) => ear(img, v, side, hx, hy), 0.7);
  }

  // head
  comp.add(5, (img) => {
    ball(img, hx, hy, 6.2, 5.6, WOOL, 0.06, (_x, _y, nx, ny) => {
      const { th } = sphereTh(v, nx, ny);
      if (Math.abs(th) < 70 && ny < -0.62) return WOOL.l2; // fluffy forelock
      return undefined;
    });
    if (!v.face) {
      return;
    }
    // muzzle (long, pinkish nose) protruding along the facing direction
    const mz = onHead(v, hx, hy, 6.2, 5.6, 0, 0.42);
    const mx = mz.x + v.s * 1.6;
    img.ellipse(mx, mz.y + 0.6, 2.6 + Math.abs(v.c) * 0.4, 2, (x, y, nx, ny) => shade(WOOL, 0.8 - nx * 0.25 - ny * 0.25));
    const nxp = pxl(mx + v.s * 1.6, v.right ? 1 : 2);
    img.rect(nxp, Math.round(mz.y), v.right ? 1 : 2, 1, NOSE.d1);
    // the evidence: a paper corner sticking out of his mouth
    const pp = pxl(mx + (v.down ? 1.6 : v.s * 1.2), 2);
    const py = Math.round(mz.y) + 2;
    img.rect(pp, py, 2, 2, PAPER.l1);
    img.set(pp + 1, py + 1, PAPER.d1);
    img.set(pp, py + 1, '#6a6070');
    // eyes
    for (const s of [-1, 1]) {
      const e = onHead(v, hx, hy, 6.2, 5.6, s * 40, -0.08);
      if (e.vis < 0.2) continue;
      const w = e.vis > 0.6 ? 2 : 1;
      const ex = pxl(e.x - (e.vis < 0.75 ? Math.sign(e.x - hx) * 0.8 : 0), w);
      const ey = Math.round(e.y) - 1;
      img.rect(ex, ey, w, 2, '#1a1020');
      if (w === 2) img.set(ex, ey, '#fff4dc');
      // stern brow
      img.hline(ex, ex + w - 1, ey - 1, WOOL.d2);
    }
  }, 0.72);
  // beard tuft under the chin
  if (v.face || v.ur) {
    const bd = onHead(v, hx, hy, 6.2, 5.6, 0, 0.9);
    comp.add(v.face ? 5.5 : 4.4, (img) => {
      const bx = pxl(bd.x + v.s * 1.2, 2);
      const by = Math.round(bd.y) + 1;
      img.rect(bx, by, 2, 2, WOOL.b);
      img.set(bx, by, WOOL.l1);
      img.set(bx + (v.s > 0 ? 1 : 0), by + 2, WOOL.d1);
    }, 0.7);
  }

  return finish(comp.render(), 7.5);
}

const goat: CharacterArt = { id: 'goat', draw };
export default goat;
