// Mincut the red panda (15-451): plush-toy cute, russet fur, white face markings and white-rimmed
// ears, dark legs and belly, and a big fluffy ringed tail curling up behind.
import { ball, eyes, legs, limb, pose, ramp, Scene, View } from './lib-d.js';
import type { CharacterArt } from './types.js';

const FUR = ramp('#c65a2a');
const RING = ramp('#5c2618');
const DARK = ramp('#3e211e');
const WHITE = ramp('#eee4d4');

const art: CharacterArt = {
  id: 'mincut',
  draw(dir, f) {
    const p = pose(f);
    const v = new View(dir, p);
    const sc = new Scene(v);
    legs(sc, { sep: 2.4, hip: 5.5, w: 3, foot: DARK, leg: DARK, stride: 1.5, footL: 1.7 });
    // ringed tail curling up behind her left side; sways with the walk
    const sw = p.step * 0.5;
    const tail: [number, number, number, number][] = [
      [1.2, -3.8, 6.5, 2.8],
      [2.8 + sw, -5.4, 8.6, 3.0],
      [4.0 + sw * 1.6, -6.2, 11.2, 3.0],
      [4.8 + sw * 2.2, -6.4, 13.9, 2.8],
      [5.0 + sw * 2.6, -6.0, 16.4, 2.4],
    ];
    tail.forEach(([lx, lz, h, r], i) => sc.ball(lx, lz, h, r, r, r * 0.95, i % 2 ? RING : FUR, { dz: 0.05 * i, bias: i % 2 ? 0.05 : 0.08 }));
    // body with dark belly and arms
    sc.ball(0, 0, 10, 5.0, 4.0, 5.0, FUR);
    sc.ball(0, 2.4, 9.4, 3.0, 2.0, 3.6, DARK, { bias: -0.05, dz: 0.2 });
    for (const s of [-1, 1]) {
      const lz = -p.step * s * 1.4;
      const lx = s * 4.7;
      sc.add(v.d(lx, lz) + 0.1, (img) => {
        const x = v.x(lx, lz);
        limb(img, x, v.y(13, lx, lz), v.y(9, lx, lz), 3, DARK, 0.1);
        ball(img, x, v.y(8.6, lx, lz), 1.5, 1.3, DARK, 0.05);
      }, 0.55);
    }
    // head
    const hh = 20.2;
    for (const s of [-1, 1]) {
      // white-rimmed ears with dark centres
      sc.ball(s * 4.6, -1.2, hh + 5.0, 2.3, 1.2, 2.2, WHITE, { dz: -2, ol: 0.55 });
      sc.ball(s * 4.5, -0.4, hh + 4.7, 1.3, 0.7, 1.3, RING, { dz: -1.9, bias: -0.15 });
    }
    sc.ball(0, 0.4, hh, 7.0, 5.6, 5.5, FUR, { bias: 0.04 });
    // white face mask: cheeks, eyebrow spots, muzzle; red "tear" marks under the eyes
    for (const s of [-1, 1]) {
      sc.ball(s * 3.8, 3.9, hh - 1.9, 2.0, 1.6, 1.7, WHITE, { bias: 0.1, dz: 0.1 });
      sc.ball(s * 2.6, 4.3, hh + 3.6, 1.1, 0.8, 0.8, WHITE, { bias: 0.15, dz: 0.2 });
    }
    sc.ball(0, 4.8, hh - 1.6, 2.7, 2.1, 2.0, WHITE, { bias: 0.1, dz: 0.3 });
    sc.ball(0, 6.8, hh - 0.6, 1.2, 0.8, 0.8, DARK, { bias: -0.2, dz: 1 });
    eyes(sc, { h: hh + 1.4, R: 6.0, RZ: 5.0, spread: 0.52, lz0: 0.4 });
    return sc.render({ shadow: 7 });
  },
};
export default art;
