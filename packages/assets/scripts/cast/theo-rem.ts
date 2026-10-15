// Theo Rem the hedgehog (21-127): small and round, a brown crown of spines, cream face and belly,
// a black button nose and tiny round spectacles. Q.E.D.
import { ball, eyes, INK, legs, pose, ramp, Scene, specs, spiky, View } from './lib-d.js';
import type { CharacterArt } from './types.js';

const SPINE = ramp('#5e3c2a');
const TIP = '#e2c290';
const CREAM = ramp('#e8cfa4');
const SKIN = ramp('#a77a5a');
const BRASS = '#b0904c';

const art: CharacterArt = {
  id: 'theo-rem',
  draw(dir, f) {
    const p = pose(f);
    const v = new View(dir, p);
    const sc = new Scene(v);
    legs(sc, { sep: 2.3, hip: 4.5, w: 3, foot: SKIN, leg: SKIN, stride: 1.4, footL: 1.8 });
    // the spine mass: a spiky dome over the back of the head and body
    {
      const lz = -1.6;
      const cx = v.x(0, lz);
      const cy = v.y(14, 0, lz);
      const rx = v.rx(7.4, 6.8);
      sc.add(v.d(0, lz) - 2, (img) => spiky(img, cx, cy, rx, 9.6, SPINE, { n: 15, amp: 0.15, tip: TIP, phase: 0.25 }));
    }
    // cream belly + face
    sc.ball(0, 2.4, 8.2, 4.4, 3.0, 4.4, CREAM, { bias: 0.05 });
    for (const s of [-1, 1]) {
      const lz = -p.step * s * 1.2;
      sc.ball(s * 4.8, lz + 1.0, 9.6, 1.5, 1.5, 1.6, SKIN, { ol: 0.55, dz: 0.5 });
    }
    const hh = 16.4;
    for (const s of [-1, 1]) sc.ball(s * 3.9, 0.6, hh + 4.1, 1.4, 1.0, 1.3, SKIN, { dz: -0.2, ol: 0.5 });
    sc.ball(0, 2.2, hh, 4.6, 4.2, 4.4, CREAM, { bias: 0.04 });
    sc.ball(0, 5.6, hh - 1.4, 2.2, 2.4, 1.8, CREAM, { bias: 0.1, dz: 0.2 });
    sc.ball(0, 7.8, hh - 1.0, 1.1, 0.8, 0.9, ramp('#2a1c20'), { bias: -0.2, dz: 1 });
    // eyes with spectacles
    const eh = hh + 1.0;
    const R = 4.4;
    const RZ = 4.4;
    const spread = 0.56;
    const pts: { x: number; y: number }[] = [];
    for (const sgn of [-1, 1]) {
      const lx = sgn * R * Math.sin(spread);
      const lz = 2.2 + RZ * Math.cos(spread);
      if (v.d(sgn * Math.sin(spread), Math.cos(spread)) < 0.15) continue;
      const lim = v.rx(4.6, 4.2) - 2;
      const cx0 = v.x(0, 2.2);
      pts.push({ x: Math.max(cx0 - lim, Math.min(cx0 + lim, v.x(lx, lz))), y: v.y(eh, lx, lz) });
    }
    if (pts.length) {
      sc.add(55, (img) => {
        for (const q of pts) specs(img, q.x, q.y, BRASS);
        if (pts.length === 2) {
          const a = pts[0]!;
          const b = pts[1]!;
          const y = Math.round(a.y - 1) + 0;
          for (let x = Math.round(Math.min(a.x, b.x) + 1); x < Math.round(Math.max(a.x, b.x) - 1); x++) img.set(x, y, BRASS);
        }
      });
      eyes(sc, { h: eh, R, RZ, spread, lz0: 2.2, glint: '#f4ecdc', w: 2, hgt: 2, color: INK, dz: 10, edge: 2 });
    }
    void ball;
    return sc.render({ shadow: 7 });
  },
};
export default art;
