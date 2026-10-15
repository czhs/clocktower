// Greenting (UCT): a round soft green creature, basically a big rounded head-shaped body (a green
// bean / rounded thumb with a stubby snout) on two tiny feet, small deadpan black eyes, a mouth
// slit, and a bold black clock-hand mark on its front. Nobody knows what it is.
import { ball, eyes, INK, legs, pose, ramp, Scene, View } from './lib-d.js';
import type { CharacterArt } from './types.js';

const GREEN = ramp('#5a9a58');
const FOOT = ramp('#3c6a40');

const art: CharacterArt = {
  id: 'greenting',
  draw(dir, f) {
    const p = pose(f);
    const v = new View(dir, p);
    const sc = new Scene(v);
    legs(sc, { sep: 2.6, hip: 3, w: 3, foot: FOOT, leg: FOOT, stride: 1.4, footL: 1.8 });
    // the bean body, a leaning lump of a head on top, and the stubby snout
    sc.ball(0, -0.4, 11.2, 6.8, 6.2, 9.2, GREEN);
    sc.ball(0, 0.4, 19.4, 6.2, 5.8, 5.8, GREEN, { bias: 0.06, dz: 0.1 });
    sc.ball(0, 4.6, 18.2, 4.1, 4.3, 3.5, GREEN, { bias: 0.1, dz: 0.3 });
    // stubby arms
    for (const s of [-1, 1]) {
      const lz = -p.step * s * 1.2;
      sc.ball(s * 6.4, lz, 10.5, 1.4, 1.4, 1.8, GREEN, { ol: 0.3, dz: 0.2, bias: s < 0 ? 0.05 : -0.1 });
    }
    // mouth slit under the snout
    if (v.face) {
      const pts: [number, number][] = [];
      const n = v.down ? [-1.6, -0.6, 0.6, 1.6] : [-1.2, 0, 1.2];
      for (const t of n) {
        const lx = t;
        const lz = 7.6 - Math.abs(t) * 0.6;
        if (v.d(lx, lz) < 1) continue;
        pts.push([v.x(lx, lz), v.y(17.2 + (Math.abs(t) > 1 ? 0.6 : 0), lx, lz)]);
      }
      sc.add(55, (img) => {
        for (const [x, y] of pts) img.set(Math.round(x - 0.5), Math.round(y - 0.5), GREEN.o);
      });
    }
    eyes(sc, { h: 21.2, R: 5.6, RZ: 4.6, spread: 0.62, lz0: 0.6, w: 2, hgt: 2, glint: null, color: INK, edge: 1.6 });
    // the clock-hand mark, low on its front-left: a hub, a long hand up, a short hand across
    {
      const phi = -0.7;
      const nl = Math.sin(phi);
      const nz = Math.cos(phi);
      if (v.d(nl, nz) > 0.3) {
        const lx = 6.0 * nl;
        const lz = -0.4 + 6.0 * nz;
        const bx = v.x(0, -0.4);
        const brx = v.rx(6.8, 6.2);
        const cx = Math.max(bx - brx + 2.5, Math.min(bx + brx - 4.5, v.x(lx, lz)));
        const cy = v.y(8.4, lx, lz);
        sc.add(56, (img) => {
          const x = Math.round(cx - 0.5);
          const y = Math.round(cy - 0.5);
          img.rect(x, y, 2, 2, INK);
          img.rect(x, y - 5, 1, 5, INK);
          img.set(x + 1, y - 5, INK);
          img.hline(x + 2, x + 3, y + 1, INK);
          img.set(x + 3, y, INK);
        });
      }
    }
    return sc.render({ shadow: 7 });
  },
};
export default art;
