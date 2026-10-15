// Opal the Optimizing Otter (15-411): sleek brown otter, cream face and belly, small round ears,
// long thick tail, a teal vest, and a smooth round pebble held to her chest.
import { ball, eyes, legs, pose, ramp, Scene, View } from './lib-d.js';
import type { CharacterArt } from './types.js';

const FUR = ramp('#8c5836');
const DARK = ramp('#563222');
const CREAM = ramp('#eed8b0');
const VEST = ramp('#2a8880');
const PEBBLE = ramp('#a2aec4');

const art: CharacterArt = {
  id: 'opal',
  draw(dir, f) {
    const p = pose(f);
    const v = new View(dir, p);
    const sc = new Scene(v);
    const step = p.step;
    legs(sc, { sep: 2.4, hip: 6, w: 3, foot: DARK, leg: FUR, stride: 1.5, footL: 1.8 });
    // tail: thick at the root, tapering behind and to her left, swishing a little when walking
    const sw = step * 0.6;
    const tail: [number, number, number, number][] = [
      [1, -4, 6.5, 2.8],
      [2.6 + sw, -6.0, 4.8, 2.5],
      [4.4 + sw * 1.5, -7.2, 3.7, 2.1],
      [6.2 + sw * 2, -7.8, 3.2, 1.7],
      [7.8 + sw * 2.4, -8.0, 3.2, 1.3],
    ];
    tail.forEach(([lx, lz, h, r], i) => sc.ball(lx, lz, h, r, r, Math.max(1.3, r * 0.85), i % 2 ? FUR : FUR, { bias: i === 0 ? 0 : 0.04, dz: -0.1 * i }));
    // body = teal vest over brown fur; cream belly shows down the open front
    sc.ball(0, 0, 10.5, 5.6, 4.4, 5.6, VEST, {
      paint: (_x, _y, _nx, ny) => (ny > 0.62 ? FUR.d1 : undefined),
    });
    sc.ball(0, 2.6, 10.5, 2.2, 2.2, 4.4, CREAM, { bias: 0.1, dz: 0.2 });
    // arms holding the pebble to the chest
    const ay = 11;
    for (const s of [-1, 1]) sc.ball(s * 3.0, 3.6, ay - 0.5, 1.6, 1.6, 1.6, FUR, { ol: 0.6, dz: 0.4 });
    sc.ball(0, 4.6, ay - 1.5, 2.2, 1.4, 1.7, PEBBLE, { bias: 0.15, ol: 0.65, dz: 0.3 });
    // head: broad and flat, tiny ears low on the sides
    const hh = 20.6;
    sc.ball(0, 0, hh, 7.5, 6.0, 5.3, FUR, { bias: 0.04 });
    for (const s of [-1, 1]) sc.ball(s * 6.3, -2.2, hh + 2.2, 1.4, 1.1, 1.4, DARK, { dz: -1.5, bias: 0.15 });
    // cream throat, whisker pads, nose
    sc.ball(0, 1.8, hh - 4.2, 3.0, 2.2, 1.8, CREAM, { bias: 0.1, dz: -0.6 });
    sc.ball(0, 5.0, hh - 2.0, 4.4, 3.1, 2.6, CREAM, {
      bias: 0.12,
      paint: (x, y, nx, ny) => (Math.abs(nx) > 0.35 && Math.abs(nx) < 0.75 && ny > -0.2 && ny < 0.5 && (x + y) % 2 === 0 ? CREAM.d1 : undefined),
    });
    sc.ball(0, 7.8, hh - 0.5, 1.5, 1.0, 1.0, DARK, { bias: -0.2, dz: 1 });
    eyes(sc, { h: hh + 1.5, R: 6.4, RZ: 5.3, spread: 0.58, lz0: 0.2 });
    return sc.render({ shadow: 7 });
  },
};
export default art;
