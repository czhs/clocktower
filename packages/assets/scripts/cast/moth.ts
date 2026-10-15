// Lumen — the lamplighter moth: a fluffy cream head with huge glossy black eyes, two feathery tan
// antennae, a fuzzy collar, pale wings folded behind like a cape, a small brown coat, and a glowing
// lantern (the client adds the warm night glow; cast.ts marks her `lantern: true`).
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';
import { arm, armFwd, at, ball, Comp, feet, finish, hand, lantern, lathe, onHead, pose, pxl, ramp, shade, view, type Img, type View } from './lib-a.js';

const FLUFF = ramp('#eee0c2');
const ANT = ramp('#b98a4e');
const WING = ramp('#d8c7a2');
const SPOT = ramp('#8a6a4a');
const COAT = ramp('#5a3a2c');
const BRASS = ramp('#d0a24a');
const BOOT = ramp('#4a2e22');

function antenna(img: Img, v: View, side: number, hx: number, hy: number) {
  const th = side * 30;
  const base = onHead(v, hx, hy, 6.4, 6, th, -0.78);
  // the frond sweeps up and outward (less when seen edge-on), leaning back from the facing direction
  const spread = Math.abs(Math.cos(((th + v.yaw) * Math.PI) / 180));
  const sx = Math.sin(((th + v.yaw) * Math.PI) / 180);
  const out = (Math.abs(sx) < 0.2 ? side : Math.sign(sx)) * (0.45 + 0.55 * Math.max(spread, Math.abs(sx)));
  const back = -v.s * 1.5;
  let prev: [number, number] | null = null;
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const x = base.x + out * (t * 0.8 + t * t * 5.2) + back * t;
    const y = base.y - t * 8.2 + t * t * 1.2;
    const px = pxl(x, 1);
    const py = Math.round(y);
    if (prev && prev[0] === px && prev[1] === py) continue;
    prev = [px, py];
    img.set(px, py, ANT.d1);
    if (t > 0.25 && py % 2 === 0) {
      // comb-like feathery barbs on the outer side, a short one inside
      const len = t > 0.85 ? 1 : 2;
      const o = out > 0 ? 1 : -1;
      for (let i = 1; i <= len; i++) img.set(px + o * i, py + i - 1, shade(ANT, 0.78 - i * 0.14));
      img.set(px - o, py + 1, shade(ANT, 0.45));
    }
  }
}

/** Fuzzy edge: knock out / add pixels along the rim deterministically. */
function fuzz(img: Img, cx: number, cy: number, rx: number, ry: number, r: ReturnType<typeof ramp>) {
  for (const a of [165, 195, 228, 312, 345, 15]) {
    const t = (a * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(t) * (rx + 0.6) - 0.5);
    const y = Math.round(cy + Math.sin(t) * (ry + 0.6) - 0.5);
    if (Math.sin(t) > 0.5) continue; // not under the chin
    img.set(x, y, shade(r, 0.62 - Math.cos(t) * 0.25 - Math.sin(t) * 0.25));
  }
}

function draw(dir: DrawnDir, frame: FrameIndex): Img {
  const v = view(dir);
  const p = pose(frame);
  const b = p.bob;
  const comp = new Comp();
  const hx = 16 + v.s * 0.4;
  const hy = 18 + b;

  feet(comp, v, p, { sep: 2.5, hip: 34, boot: BOOT, bootW: 3, bootH: 2, stride: 2 });

  // folded wings: a pale cape over the back that flares past the sides
  const lag = [0, 1, 1.6][p.lag]!;
  const wing = {
    y0: 23 + b,
    y1: 35 + b,
    rx: (_y: number, t: number) => 5.2 + Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.62) * 4.2,
    rz: (_y: number, t: number) => 4.6 + t * 2.4,
    dx: (_y: number, t: number) => -v.s * t * lag,
    arc: [100, 260] as [number, number],
  };
  const wingCol = (layer: 'front' | 'back') => (h: { th: number; v: number; y: number; t: number; x: number }) => {
    if (h.y === 35 + b && (h.x & 1) === 0) return null; // scalloped trailing edge
    const a = Math.abs(h.th);
    if (layer === 'front' && a > 176) return shade(WING, h.v - 0.35); // the two wings meet
    // eyespots
    const spot = Math.hypot((a - 140) / 16, (h.t - 0.55) / 0.13);
    if (spot < 1 && layer === 'front') return spot < 0.55 ? SPOT.l2 : SPOT.d1;
    if (h.t > 0.82 && layer === 'front') return shade(WING, h.v - 0.12);
    return shade(WING, h.v + 0.1);
  };
  comp.add(-10, (img) => lathe(img, v, { ...wing, layer: 'back', color: wingCol('back') }), 0.7);
  comp.add(2.6, (img) => lathe(img, v, { ...wing, layer: 'front', color: wingCol('front') }), 0.7);

  // little brown coat with brass buttons
  comp.add(0, (img) =>
    lathe(img, v, {
      y0: 24 + b,
      y1: 34 + b,
      rx: (_y, t) => 4.2 + t * 1.8,
      rz: (_y, t) => 3.8 + t * 1.6,
      color: (h) => {
        const a = Math.abs(h.th);
        if (h.y === 34 + b) return shade(BRASS, h.v - 0.15);
        if (a < 4) return shade(COAT, h.v - 0.3);
        if (a < 12 && (h.y - b === 27 || h.y - b === 30)) return BRASS.l1;
        return shade(COAT, h.v);
      },
    }),
  );

  // arms; the lantern hangs from the left paw
  for (const side of [-1, 1]) {
    const sh = at(v, 4.4, side * 90, 26 + b);
    const hd = hand(v, p, side, 5.8, 29 + b, 1.3);
    const far = hd.z < -2;
    comp.add(1 + hd.z * 0.3, (img) => arm(img, sh, hd, COAT, FLUFF, 2, far));
    if (side === 1) {
      const lp = at(v, 7.2, 64, 0, armFwd(p, side) * 1.3 + 0.8);
      const swing = p.walking ? (p.f % 2 === 0 ? 0 : -armFwd(p, side)) : 0;
      comp.add(far ? -7 : 1.4 + hd.z * 0.3, (img) => lantern(img, pxl(lp.x, 1) + swing, 30 + b), 0.5);
    }
  }

  // fuzzy collar
  comp.add(3, (img) => {
    lathe(img, v, { y0: 23 + b, y1: 25 + b, rx: (_y, t) => 4.8 + t * 1.3, color: (h) => (h.y === 25 + b && (h.x & 1) ? null : shade(FLUFF, h.v + 0.05)) });
  });

  // head
  for (const s of [-1, 1]) {
    const e = onHead(v, hx, hy, 6.4, 6, s * 30, -0.78);
    comp.add(4 + e.z * 0.01, (img) => antenna(img, v, s, hx, hy));
  }
  comp.add(5, (img) => {
    ball(img, hx, hy, 6.6, 6, FLUFF, 0.08);
    fuzz(img, hx, hy, 6.6, 6, FLUFF);
    if (!v.face) return;
    // huge glossy eyes
    for (const s of [-1, 1]) {
      const e = onHead(v, hx, hy, 6.6, 6, s * 38, 0.12);
      if (e.vis < 0.15) continue;
      const big = e.vis > 0.55;
      const w = big ? 4 : 2;
      const ex = e.x - (e.vis < 0.7 ? Math.sign(e.x - hx) * 0.9 : 0);
      const x0 = pxl(ex, w);
      const y0 = Math.round(e.y) - 2;
      if (big) {
        img.rect(x0, y0 + 1, 4, 3, '#120a18');
        img.hline(x0 + 1, x0 + 2, y0, '#120a18');
        img.hline(x0 + 1, x0 + 2, y0 + 4, '#120a18');
        img.set(x0 + 1, y0 + 1, '#fff6e0');
        img.set(x0 + 2, y0 + 1, '#cfc4e0');
        img.set(x0 + 2, y0 + 3, '#4a3c64');
      } else {
        img.rect(x0, y0, 2, 4, '#120a18');
        img.set(x0 + (v.s > 0 ? 1 : 0), y0 + 1, '#fff6e0');
      }
    }
    // tiny smile
    const m = onHead(v, hx, hy, 6.6, 6, 0, 0.55);
    if (m.vis > 0.5) {
      const mx = pxl(m.x + v.s * 0.8, 2);
      img.set(mx, Math.round(m.y), FLUFF.d2);
      img.set(mx + 1, Math.round(m.y), FLUFF.d2);
    }
  }, 0.72);

  return finish(comp.render(), 7.5);
}

const moth: CharacterArt = { id: 'moth', draw };
export default moth;
