// Cilantro the giraffe (15-251): the tallest in town. Tan with brown patches, little ossicones,
// a blue hoodie (hood bunched behind the neck) and a green scarf.
import { vnoise } from '../lib/img.js';
import { ball, eyes, flat, legs, limb, pose, ramp, Scene, View } from './lib-d.js';
import type { CharacterArt } from './types.js';

const TAN = ramp('#d6a456');
const PATCH = ramp('#8e5530');
const MUZ = ramp('#ead0a0');
const HOOF = ramp('#3c2a28');
const HOOD = ramp('#3f5f98');
const SCARF = ramp('#4c8a3c');
const KNOB = ramp('#5a3626');

const art: CharacterArt = {
  id: 'cilantro',
  draw(dir, f) {
    const p = pose(f);
    const v = new View(dir, p);
    const sc = new Scene(v);
    const bob = p.bob;
    // brown patches, pinned to the body (screen pattern minus the bob so it never crawls)
    const spots = (seed: number) => (x: number, y: number, _nx: number, _ny: number, lv: number) => (vnoise(x * 1.0, (y - bob) * 1.0, 2.1, seed) > 0.6 ? flat(PATCH, lv + 0.1) : undefined);
    legs(sc, { sep: 2.3, hip: 6, w: 3, foot: HOOF, leg: TAN, stride: 1.5, footL: 1.6, footH: 1.4 });
    // hoodie body + pocket
    sc.ball(0, 0, 11, 5.3, 4.2, 5.6, HOOD);
    sc.ball(0, 3.3, 8.6, 3.2, 1.4, 1.7, HOOD, { bias: -0.22, dz: 0.3 });
    // hood bunched at the back of the neck
    sc.ball(0, -2.6, 16.4, 3.6, 2.2, 2.2, HOOD, { bias: -0.08, ol: 0.55 });
    // sleeves with tan hooves for hands, swinging opposite the feet
    for (const s of [-1, 1]) {
      const lz = -p.step * s * 1.4;
      sc.add(v.d(s * 5.4, lz), (img) => {
        const x = v.x(s * 5.4, lz);
        limb(img, x, v.y(14.5, s * 5.4, lz), v.y(9.5, s * 5.4, lz), 3, HOOD, s < 0 ? 0.1 : -0.05);
        ball(img, x, v.y(8.6, s * 5.4, lz), 1.5, 1.3, TAN);
      }, 0.6);
    }
    // neck: a stack of patched tan discs leaning slightly forward
    for (let i = 0; i < 6; i++) {
      const h = 17.5 + i * 1.75;
      sc.ball(0, 0.4 + i * 0.22, h, 2.3, 2.3, 1.6, TAN, { dz: -1 + i * 0.01, paint: spots(7) });
    }
    // scarf: a ring at the base of the neck plus a hanging end
    sc.ball(0, 0.2, 16.6, 3.6, 3.2, 1.7, SCARF, { bias: 0.05, ol: 0.55, paint: (x, _y, _nx, _ny, lv) => ((x + 1) % 3 === 0 ? flat(SCARF, lv - 0.25) : undefined) });
    {
      const lx = -1.6;
      const lz = 2.9;
      const sway = p.step * 0.6;
      sc.add(v.d(lx, lz) + 0.5, (img) => {
        const x = v.x(lx, lz) + sway * v.c;
        limb(img, x, v.y(15.6, lx, lz), v.y(11.2, lx, lz), 2, SCARF, 0.05);
        img.set(Math.round(x - 1), Math.round(v.y(11.4, lx, lz)), SCARF.l1);
      }, 0.55);
    }
    // head
    const hh = 28.2;
    for (const s of [-1, 1]) {
      // ossicones
      const lx = s * 2.1;
      const oz = 0.2 - s * 0.9;
      sc.add(v.d(lx, oz) - 0.2, (img) => {
        const x = v.x(lx, oz);
        limb(img, x, v.y(34, lx, oz), v.y(30.5, lx, oz), 1, TAN, s < 0 ? 0.1 : -0.1);
        ball(img, x, v.y(34, lx, oz), 1.0, 1.0, KNOB, 0.1);
      });
      // ears stick out sideways
      sc.ball(s * 4.0, -1.6, hh + 2.3, 1.7, 0.9, 0.9, TAN, { dz: -1.5, bias: -0.1, ol: 0.35 });
    }
    sc.ball(0, 1.2, hh, 4.0, 4.4, 3.4, TAN);
    sc.ball(0, 4.7, hh - 1.9, 2.8, 2.4, 2.0, MUZ, { bias: 0.08 });
    // nostrils
    if (v.face) {
      for (const s of [-1, 1]) {
        const lx = s * 1.1;
        const lz = 6.6;
        if (v.d(s * 0.5, 1) > 0.1) sc.add(60, (img) => img.set(Math.round(v.x(lx, lz) - 0.5), Math.round(v.y(hh - 0.9, lx, lz) - 0.5), MUZ.d2));
      }
    }
    eyes(sc, { h: hh + 1.3, R: 3.9, RZ: 4.0, spread: 0.62, lz0: 1.0, edge: 1.4 });
    return sc.render({ shadow: 7 });
  },
};
export default art;
