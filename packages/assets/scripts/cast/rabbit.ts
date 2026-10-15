// Clover, the herbalist: a white rabbit with long upright ears (pink inside), big dark eyes, a pink
// nose, a moss-green dress with a cream apron, a cotton tail, holding a little bouquet of colourful
// flowers at the chest with both paws.
import { CX, P, Sprite, ball, feat, legs, litS, near, onRing, pose, ramp, revolve, stamp, tone, view, type DrawnDir, type FrameIndex } from './lib-b.js';
import type { CharacterArt } from './types.js';

const FUR = ramp('#ece4e0');
const PINK = ramp('#e898a4');
const DRESS = ramp('#4c7a44');
const APRON = ramp('#e8dcc0');
const BOOT = ramp('#6a4430');
const STEM = ramp('#3e6a2e');
const FLOWERS = ['#f4f0e6', '#f2c84a', '#e7849a', '#b994e0', '#f4f0e6', '#e7849a', '#f2c84a'];
const EYE = '#1a1020';

function draw(dir: DrawnDir, f: FrameIndex) {
  const v = view(dir);
  const p = pose(f);
  const b = p.bob;
  const sp = new Sprite();
  const face = v.c > -0.2;
  const hc = CX + v.s * 0.7;

  sp.layer((l) => legs(l, v, p, { hip: 34 + b, spread: 2, stride: 1.6, legW: 2, pants: FUR, boot: BOOT }));

  // cotton tail (behind the dress when facing the camera)
  const tq = P(v, 0, -5.2);
  const tail = () => sp.layer((l) => ball(l, CX + tq.x, 32 + b, 2.2, 2, FUR, 0.1));
  if (tq.d < 0) tail();

  // ears: drawn back to front
  const ear = (side: number) => {
    const base = P(v, side * 2.3, -0.6);
    const tilt = side * 1.1 * Math.abs(v.c) - v.s * 1.6 + (p.walk && p.bob === 0 ? -v.s * 0.5 : 0);
    return { side, x: hc + base.x, tip: hc + base.x + tilt, d: base.d };
  };
  const ears = [ear(-1), ear(1)].sort((a, c) => a.d - c.d);
  const drawEar = (e: ReturnType<typeof ear>, far: boolean) =>
    sp.layer((l) => {
      const y0 = 7 + b + (far && v.s > 0.9 ? 1 : 0);
      const y1 = 18 + b;
      for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / (y1 - y0);
        const cx = e.tip + (e.x - e.tip) * t;
        const w = y === y0 ? 1 : y === y0 + 1 ? 2 : 3;
        stamp(l, cx, y, w, 1, (i) => {
          const inner = w === 3 && i === 1 && face && y > y0 + 1 && y < y1 - 1 && (Math.abs(v.c) > 0.3 || !far);
          if (inner) return tone(PINK, 0.5 + (y < y0 + 4 ? 0.2 : 0));
          return tone(FUR, (far ? 0.35 : 0.7) - i * 0.18 - t * 0.1);
        }, false);
      }
    });
  drawEar(ears[0]!, Math.abs(ears[0]!.d - ears[1]!.d) > 0.5);

  // arms reaching to the bouquet, dress, apron
  const bq = P(v, 0, 4.4);
  const arm = (side: number) => {
    const sh = P(v, side * 3.8, 0);
    const hd = P(v, side * 1.6, 4.0);
    return { sx: CX + sh.x, hx: CX + hd.x, d: hd.d };
  };
  const drawArm = (a: ReturnType<typeof arm>) =>
    sp.layer((l) => {
      const far = a.d < 0;
      for (let y = 26 + b; y <= 30 + b; y++) {
        const t = (y - 26 - b) / 4;
        stamp(l, a.sx + (a.hx - a.sx) * t, y, 2, 1, (i) => tone(y < 29 + b ? DRESS : FUR, (far ? 0.3 : 0.65) - i * 0.25), false);
      }
    });
  const arms = [arm(-1), arm(1)].sort((a, c) => a.d - c.d);
  if (bq.d < 0) for (const a of arms) drawArm(a);

  sp.layer((l) => {
    revolve(l, v, CX, 25 + b, 35, (y) => (y === 25 + b ? 3.4 : 4.3 + ((y - 25 - b) / (35 - 25 - b)) * 2), (az, y, s) => {
      const yy = y - b;
      if (y === 35) return tone(DRESS, litS(s) - 0.3);
      if (near(az, 0, 0.8) && yy >= 28 && y <= 33) return tone(APRON, litS(s) - (yy === 28 ? 0.15 : 0));
      if (yy === 27 && near(az, 0, 1.6)) return tone(APRON, litS(s) - 0.25); // apron ties
      return tone(DRESS, litS(s) - (yy - 25) * 0.01);
    });
  });
  if (tq.d >= 0) tail();

  // head
  sp.layer((l) => {
    const cy = 21.4 + b;
    revolve(l, v, hc, 16 + b, 26 + b, (y) => {
      const t = (y + 0.5 - cy) / 5.3;
      return t < -1 ? 0 : 6.1 * Math.sqrt(Math.max(0, 1 - t * t)) + (y > cy + 1 && y < cy + 4 ? 0.5 : 0);
    }, (_az, y, s) => tone(FUR, litS(s) + 0.1 - (y - 16 - b) * 0.015));
    if (!face) return;
    for (const e of [-0.66, 0.66]) {
      const q = feat(v, hc, 4.7, e);
      if (q.vis < 0.05) continue;
      const w = q.fore ? 1 : 2;
      stamp(l, q.x, 19 + b, w, 3, (i, j) => (i === 0 && j === 0 && w === 2 ? '#f8f0ff' : EYE));
      if (q.vis > 0.3) {
        const c = feat(v, hc, 5.3, e * 1.45);
        if (c.vis > 0.2) stamp(l, c.x, 23 + b, 1, 1, tone(PINK, 0.7));
      }
    }
    const n = feat(v, hc, 6, 0);
    stamp(l, n.x, 22 + b, n.fore ? 1 : 2, 1, tone(PINK, 0.4));
    const m = feat(v, hc, 5.8, 0);
    stamp(l, m.x, 23 + b, 1, 1, tone(FUR, 0.05));
  });

  drawEar(ears[1]!, false);

  if (bq.d >= 0)
    sp.layer((l) => {
      for (const a of arms) {
        if (a.d < -0.5) continue;
        for (let y = 26 + b; y <= 30 + b; y++) {
          const t = (y - 26 - b) / 4;
          stamp(l, a.sx + (a.hx - a.sx) * t, y, 2, 1, (i) => tone(y < 29 + b ? DRESS : FUR, 0.65 - i * 0.25), false);
        }
      }
    });
  // bouquet held at the chest
  if (bq.d >= 0)
    sp.layer((l) => {
      const x = CX + bq.x;
      const y = 27 + b;
      for (let j = 3; j <= 5; j++) stamp(l, x, y + j, 2, 1, (i) => tone(STEM, 0.6 - i * 0.3), false);
      const heads: [number, number][] = [[-2, 1], [0, 0], [2, 1], [-1, 2], [1, 2], [-3, 3], [2, 3]];
      heads.forEach(([dx, dy], k) => {
        const hx = Math.round(x + dx * (0.6 + 0.4 * Math.abs(v.c)) - 0.5);
        l.set(hx, y + dy, FLOWERS[k]!);
        l.set(hx + 1, y + dy, FLOWERS[k]!);
        l.set(hx, y + dy + 1, FLOWERS[k]!);
      });
      l.set(Math.round(x - 0.5), y + 1, '#c88a2a');
      // leaves
      l.set(Math.round(x - 2.5), y + 3, STEM.l1);
      l.set(Math.round(x + 1.5), y + 3, STEM.b);
    }, { darken: 0.6 });
  void onRing;
  return sp.done(6);
}

const art: CharacterArt = { id: 'rabbit', draw };
export default art;
