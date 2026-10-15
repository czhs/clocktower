// Maxflow (15-451): a BIG soft plush-toy fox. Very round, bright orange, big white muzzle and
// chest, black ears and stubby black legs, a huge fluffy tail with a white tip, button eyes,
// no clothes. Deliberately nothing like the slim tavern fox.
import { ball, eyes, legs, limb, pose, ramp, Scene, shape, View } from './lib-d.js';
import type { CharacterArt } from './types.js';

const FUR = ramp('#d8692c');
const WHITE = ramp('#f2eadc');
const BLACK = ramp('#2c2228');
const NOSE = ramp('#1e161c');

const art: CharacterArt = {
  id: 'maxflow',
  draw(dir, f) {
    const p = pose(f);
    const v = new View(dir, p);
    const sc = new Scene(v);
    legs(sc, { sep: 3.4, hip: 4.5, w: 4, foot: BLACK, leg: BLACK, stride: 1.4, footL: 2.0, footW: 2.4, footH: 1.6 });
    // huge fluffy tail sweeping up behind the right side, white tip
    const sw = p.step * 0.5;
    const tail: [number, number, number, number, boolean][] = [
      [2.0, -5.5, 5.5, 3.8, false],
      [4.6 + sw, -6.8, 7.4, 4.3, false],
      [6.4 + sw * 1.4, -6.8, 10.2, 3.9, false],
      [7.2 + sw * 1.8, -6.2, 13.2, 3.0, true],
    ];
    tail.forEach(([lx, lz, h, r, tip], i) => sc.ball(lx, lz, h, r, r, r * 0.95, tip ? WHITE : FUR, { dz: 0.05 * i, bias: 0.04 }));
    // round plush body with a white chest
    sc.ball(0, 0, 10.5, 7.4, 6.2, 7.0, FUR);
    sc.ball(0, 3.8, 10.8, 4.4, 3.0, 5.0, WHITE, { bias: 0.08, dz: 0.2 });
    // stubby arms with black paws, swinging opposite the feet
    for (const s of [-1, 1]) {
      const lz = -p.step * s * 1.2;
      const lx = s * 6.9;
      sc.add(v.d(lx, lz) + 0.1, (img) => {
        const x = v.x(lx, lz);
        ball(img, x, v.y(11.5, lx, lz), 2.0, 2.8, FUR, s < 0 ? 0.05 : -0.05);
        ball(img, x, v.y(9.2, lx, lz), 1.8, 1.4, BLACK, 0.1);
      }, 0.55);
    }
    // head
    const hh = 23.5;
    for (const s of [-1, 1]) {
      // black triangular ears with cream insides
      shape(sc, [[s * 1.8, 1.2, hh + 4.6], [s * 7.2, -3.2, hh + 2.4], [s * 5.8, -1.4, hh + 10.6]], BLACK, { dz: -3, ol: 0.5, bias: 0.1 });
      if (v.face) shape(sc, [[s * 3.0, 0.8, hh + 4.6], [s * 6.0, -2.0, hh + 3.6], [s * 5.3, -0.9, hh + 8.6]], WHITE, { dz: -2.9, bias: -0.1 });
    }
    sc.ball(0, 0.4, hh, 8.0, 6.4, 6.5, FUR, { bias: 0.05 });
    sc.ball(0, 5.0, hh - 2.6, 4.6, 3.4, 3.1, WHITE, { bias: 0.12, dz: 0.2 });
    for (const s of [-1, 1]) sc.ball(s * 4.6, 3.8, hh - 2.2, 2.6, 2.0, 2.3, WHITE, { bias: 0.1, dz: 0.1 });
    sc.ball(0, 8.0, hh - 1.2, 1.7, 1.1, 1.2, NOSE, { bias: -0.1, dz: 1 });
    eyes(sc, { h: hh + 1.4, R: 6.6, RZ: 5.6, spread: 0.5, lz0: 0.4 });
    void limb;
    return sc.render({ shadow: 9 });
  },
};
export default art;
