// Old Delve, the blacksmith: a stout dark grey-brown mole with a big pink nose, tiny squinting eyes,
// brass goggles pushed up on the head, a slate shirt under a brown leather apron, big pink digging
// claws, and a smithing hammer held upright in his right hand.
import { CX, P, Sprite, ball, feat, legs, litS, near, pose, ramp, revolve, stamp, tone, view, type DrawnDir, type FrameIndex } from './lib-b.js';
import type { CharacterArt } from './types.js';

const FUR = ramp('#54485a');
const MUZZLE = ramp('#7a6a74');
const NOSE = ramp('#e8909c');
const CLAW = ramp('#e2a0a4');
const SHIRT = ramp('#3d5684');
const LEATHER = ramp('#86582f');
const BRASS = ramp('#d0a446');
const GLASS = ramp('#7ab4b0');
const PANTS = ramp('#3a3038');
const BOOT = ramp('#4a3024');
const IRON = ramp('#8e94a6');
const HANDLE = ramp('#7a5434');
const EYE = '#120a16';

function draw(dir: DrawnDir, f: FrameIndex) {
  const v = view(dir);
  const p = pose(f);
  const b = p.bob;
  const sp = new Sprite();
  const face = v.c > -0.2;
  const hc = CX + v.s * 0.6;
  const armF = (side: number) => (p.step === 0 ? 0 : side === p.step ? -1 : 1);

  sp.layer((l) => legs(l, v, p, { hip: 34 + b, spread: 2.6, stride: 1.6, legW: 3, pants: PANTS, boot: BOOT }));

  // arms: right (u<0) holds the hammer, left hangs with its claws
  const arm = (side: number) => {
    const sh = P(v, side * 5.4, 0);
    const hd = P(v, side * (side < 0 ? 7.6 : 6.6), (side < 0 ? 0.8 + 2.8 * v.s : 0.8) + armF(side) * 1.3);
    return { side, sx: CX + sh.x, hx: CX + hd.x, d: hd.d };
  };
  const hammer = (a: ReturnType<typeof arm>) =>
    sp.layer((l) => {
      const x = Math.round(a.hx - 0.5);
      const top = 22 + Math.round(2 * v.s) + b;
      for (let y = top + 3; y <= 31 + b; y++) l.set(x, y, tone(HANDLE, y % 3 === 0 ? 0.35 : 0.6));
      const hw = 1.5 + 1.5 * Math.abs(v.s);
      const hx = x + 0.5 + (v.s > 0.3 ? 0.6 : 0);
      stamp(l, hx, top, Math.round(hw * 2), 3, (i, j) => tone(IRON, 0.75 - i * 0.12 - j * 0.15), false);
      stamp(l, hx, top + 3, 1, 1, tone(IRON, 0.2), false);
    });
  const drawArm = (a: ReturnType<typeof arm>) =>
    sp.layer((l) => {
      const far = a.d < -0.5 && Math.abs(a.hx - CX) < 6;
      for (let y = 25 + b; y <= 29 + b; y++) {
        const t = (y - 25 - b) / 4;
        stamp(l, a.sx + (a.hx - a.sx) * t, y, 3, 1, (i) => tone(SHIRT, (far ? 0.3 : 0.62) - i * 0.2), false);
      }
      // big pink claws
      stamp(l, a.hx, 30 + b, 3, 2, (i, j) => tone(CLAW, (far ? 0.3 : 0.65) - i * 0.15 - j * 0.15), false);
      stamp(l, a.hx, 32 + b, 3, 1, (i) => (i === 1 ? null : tone(CLAW, far ? 0.15 : 0.35)), false);
    });
  const arms = [arm(-1), arm(1)];
  const behind = arms.filter((a) => a.d < -0.5 && Math.abs(a.hx - CX) < 6);
  for (const a of behind) {
    if (a.side < 0) hammer(a);
    drawArm(a);
  }

  // torso: shirt + leather apron with a bib and straps
  sp.layer((l) => {
    revolve(l, v, CX, 24 + b, 34 + b, (y) => (y === 24 + b ? 4.6 : 5.6 + (y - 25 - b) * 0.08), (az, y, s) => {
      const yy = y - b;
      if (near(az, 0, yy >= 29 ? 1.15 : 0.6) && yy >= 26) {
        let vv = litS(s) - (yy - 26) * 0.015;
        if (yy === 29 && near(az, 0, 1.1)) vv -= 0.25; // waist seam
        if (near(az, 0.35, 0.18) && yy >= 30 && yy <= 31) vv -= 0.3; // pocket
        return tone(LEATHER, vv);
      }
      if (yy <= 26 && (near(az, 0.62, 0.17) || near(az, -0.62, 0.17))) return tone(LEATHER, litS(s) - 0.1); // straps
      if (yy >= 25 && yy <= 30 && near(az, Math.PI, 0.9)) {
        // straps crossing on the back
        const k = (yy - 25) / 5;
        if (near(az, Math.PI + (0.7 - 1.4 * k), 0.15) || near(az, Math.PI - (0.7 - 1.4 * k), 0.15)) return tone(LEATHER, litS(s) - 0.1);
      }
      if (yy === 30 && near(az, Math.PI, 1.6)) return tone(LEATHER, litS(s) - 0.25); // apron tie
      return tone(SHIRT, litS(s));
    });
  });

  // head
  sp.layer((l) => {
    const cy = 19.6 + b;
    revolve(l, v, hc, 14 + b, 25 + b, (y) => {
      const t = (y + 0.5 - cy) / 5.6;
      return t < -1 ? 0 : 6.5 * Math.sqrt(Math.max(0, 1 - t * t));
    }, (az, y, s) => {
      const yy = y - b;
      if (yy === 16) return tone(BRASS, litS(s) - 0.3); // goggle strap
      if (face && near(az, 0, 1.0) && yy >= 21) return tone(MUZZLE, litS(s));
      return tone(FUR, litS(s) + 0.08 - (yy - 14) * 0.01);
    });
    if (face) {
      for (const e of [-0.62, 0.62]) {
        const q = feat(v, hc, 4.9, e);
        if (q.vis < 0.1) continue;
        stamp(l, q.x, 20 + b, q.fore ? 1 : 2, 1, EYE);
      }
      const n = feat(v, hc, 6.3, 0);
      const nw = n.fore ? 3 : 4;
      const nx = n.x + v.s * 1.2;
      l.ellipse(nx, 22.6 + b, nw / 2 + 0.2, 1.6, (px, py, nx2, ny2) => tone(NOSE, 0.6 - nx2 * 0.3 - ny2 * 0.4));
      l.set(Math.round(nx - 1), 22 + b, NOSE.l2);
      // whiskers
      if (v.c > 0.5) {
        l.set(Math.round(nx - nw / 2 - 1.5), 23 + b, tone(MUZZLE, 0.85));
        l.set(Math.round(nx + nw / 2 + 0.5), 23 + b, tone(MUZZLE, 0.85));
      }
    }
  });
  // nose sticks out past the head outline in profile
  // goggles (pushed up on the forehead), back buckle
  sp.layer((l) => {
    for (const e of [-0.5, 0.5]) {
      const q = feat(v, hc, 5.9, e);
      if (q.vis < -0.15) continue;
      const w = q.fore ? 2 : 4;
      stamp(l, q.x, 13 + b, w, 3, (i, j) => {
        if (w === 4 && (i === 0 || i === 3) && (j === 0 || j === 2)) return null;
        if (w === 4 && (i === 1 || i === 2) && j === 1) return tone(GLASS, i === 1 ? 0.95 : 0.6);
        return tone(BRASS, 0.8 - i * 0.12 - j * 0.15);
      }, false);
    }
  }, { darken: 0.6 });

  for (const a of arms) {
    if (behind.includes(a)) continue;
    drawArm(a);
    if (a.side < 0) hammer(a);
  }
  void ball;
  return sp.done(7);
}

const art: CharacterArt = { id: 'mole', draw };
export default art;
