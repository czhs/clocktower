// Toadley, the merchant: a big wide olive toad with bumpy skin, sleepy heavy-lidded golden eyes on
// top of the head and a wide smile, cream shirt, dark-green waistcoat with brass buttons, belt, and a
// leather satchel of goods (a scroll poking out) on the right hip, strap across the chest.
import { CX, P, Sprite, ball, feat, hashB, legs, litS, near, pose, ramp, revolve, stamp, tone, view, type DrawnDir, type FrameIndex } from './lib-b.js';
import type { CharacterArt } from './types.js';

const SKIN = ramp('#7e8444');
const BELLY = ramp('#e2d6a8');
const SHIRT = ramp('#e6dcc4');
const VEST = ramp('#2e4c3e');
const BRASS = ramp('#d4a848');
const PANTS = ramp('#5a3e2c');
const BOOT = ramp('#3e2a20');
const BAG = ramp('#8a5a30');
const IRIS = '#e0a43c';
const EYE = '#160c12';

function draw(dir: DrawnDir, f: FrameIndex) {
  const v = view(dir);
  const p = pose(f);
  const b = p.bob;
  const sp = new Sprite();
  const face = v.c > -0.25;
  const hc = CX + v.s * 0.9;
  const armF = (side: number) => (p.step === 0 ? 0 : side === p.step ? -1 : 1);

  sp.layer((l) => legs(l, v, p, { hip: 33 + b, spread: 3, stride: 1.6, legW: 3, pants: PANTS, boot: BOOT }));

  // satchel on the right hip (u<0)
  const sat = P(v, -6.2, -1.8);
  const satchel = () =>
    sp.layer((l) => {
      const x = CX + sat.x;
      const y = 30 + b;
      const w = Math.round(3 + 2 * Math.abs(v.s) + 1 * Math.abs(v.c));
      // scroll poking out
      stamp(l, x + 0.5, y - 2, 1, 2, (_i, j) => (j === 0 ? '#f4ecd4' : '#d8ccb0'), false);
      stamp(l, x, y, w, 4, (i, j) => tone(BAG, (j === 0 ? 0.75 : 0.5) - i * 0.12 - (j === 1 ? 0.25 : 0)), false);
      stamp(l, x, y + 1, 1, 1, BRASS.l1, false);
    });
  const arm = (side: number) => {
    const sh = P(v, side * 6.4, 0);
    const hd = P(v, side * 7.4, 1.2 + armF(side) * 1.4);
    return { side, sx: CX + sh.x, hx: CX + hd.x, d: hd.d };
  };
  const drawArm = (a: ReturnType<typeof arm>) =>
    sp.layer((l) => {
      const far = hidden(a.hx, a.d);
      for (let y = 25 + b; y <= 29 + b; y++) {
        const t = (y - 25 - b) / 4;
        const w = y <= 27 + b ? 3 : 2;
        stamp(l, a.sx + (a.hx - a.sx) * t, y, w, 1, (i) => tone(SHIRT, (far ? 0.3 : 0.7) - i * 0.18), false);
      }
      stamp(l, a.hx, 30 + b, 3, 2, (i, j) => tone(SKIN, (far ? 0.3 : 0.65) - i * 0.15 - j * 0.2), false);
    });
  const arms = [arm(-1), arm(1)];
  const hidden = (x: number, d: number, lim = 6.5) => d < -0.5 && Math.abs(x - CX) < lim;
  for (const a of arms) if (hidden(a.hx, a.d)) drawArm(a);
  if (hidden(CX + sat.x, sat.d, 5)) satchel();

  // torso
  sp.layer((l) => {
    revolve(l, v, CX, 24 + b, 33 + b, (y) => (y === 24 + b ? 5.6 : 6.6 + Math.min(0.6, (y - 25 - b) * 0.2)), (az, y, s) => {
      const yy = y - b;
      if (yy === 31) return near(az, 0, 0.18) ? tone(BRASS, 0.8 - s * 0.3) : tone(PANTS, litS(s) - 0.2); // belt
      if (yy >= 32) return tone(PANTS, litS(s) - 0.05);
      if (near(az, 0, 0.2 + (yy - 24) * 0.02)) return tone(SHIRT, litS(s) - (yy === 24 ? 0.2 : 0));
      if ((yy === 27 || yy === 29) && (near(az, 0.5, 0.09) || near(az, -0.5, 0.09))) return tone(BRASS, 0.7);
      return tone(VEST, litS(s) + 0.05);
    });
    // satchel strap from the left shoulder down to the right hip
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const q = P(v, 4.8 - 11 * t, 4.4 + 1.2 * Math.sin(t * Math.PI));
      const qb = P(v, 4.8 - 11 * t, -4.4 - 1.2 * Math.sin(t * Math.PI));
      const y = Math.round(24 + b + t * 5);
      if (q.d > 0) stamp(l, CX + q.x, y, 1, 1, tone(BAG, 0.35));
      if (qb.d > 0) stamp(l, CX + qb.x, Math.round(24 + b + (1 - t) * 1 + t * 5), 1, 1, tone(BAG, 0.35));
    }
  });

  // head: wide, bumpy, cream throat, wide smile
  sp.layer((l) => {
    const cy = 19.8 + b;
    revolve(l, v, hc, 15 + b, 25 + b, (y) => {
      const t = (y + 0.5 - cy) / 5.2;
      return t < -1 ? 0 : 7.6 * Math.sqrt(Math.max(0, 1 - t * t)) + (y > cy ? 0.4 : 0);
    }, (az, y, s) => {
      const yy = y - b;
      if (face && yy >= 22 && near(az, 0, 1.0)) return tone(BELLY, litS(s) - 0.05);
      let vv = litS(s) + 0.05 - (yy - 15) * 0.01;
      const wart = hashB(Math.round(az * 4), yy);
      if (wart < 0.16) vv -= 0.22;
      else if (wart > 0.9) vv += 0.18;
      return tone(SKIN, vv);
    });
    if (!face) return;
    // wide smile
    for (let k = -8; k <= 8; k++) {
      const q = feat(v, hc, 6.4, k * 0.12);
      if (q.vis < 0.15) continue;
      const up = Math.abs(k) >= 7 ? -1 : 0;
      stamp(l, q.x, 22 + b + up, 1, 1, tone(SKIN, 0.0));
    }
  });
  // eye bumps on top of the head, sleepy lids
  sp.layer((l) => {
    const bumps = [-0.66, 0.66].map((e) => ({ e, q: feat(v, hc, 5.2, e) })).sort((a, c) => a.q.vis - c.q.vis);
    for (const { q } of bumps) {
      if (q.vis < -0.6) continue;
      ball(l, q.x, 16.6 + b, q.fore ? 1.8 : 2.4, 2.2, SKIN, 0.05);
      if (q.vis < 0.05) continue;
      const w = q.fore ? 2 : 3;
      // lid (upper half) then golden eye with a horizontal pupil
      stamp(l, q.x, 16 + b, w, 1, (i) => tone(SKIN, 0.2 - i * 0.05), false);
      stamp(l, q.x, 17 + b, w, 1, (i) => (i === Math.floor(w / 2) ? EYE : IRIS), false);
      stamp(l, q.x, 18 + b, w, 1, (i) => (i === 0 ? '#f0c870' : '#b07a2a'), false);
    }
  }, { darken: 0.7 });

  if (!hidden(CX + sat.x, sat.d, 5)) satchel();
  for (const a of arms) if (!hidden(a.hx, a.d)) drawArm(a);
  return sp.done(8);
}

const art: CharacterArt = { id: 'toad', draw };
export default art;
