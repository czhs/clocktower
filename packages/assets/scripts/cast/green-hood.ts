// Wisp: a small child-sized wanderer in a big moss-green hooded cloak (tan trim, belt with a brass
// buckle, a leaf emblem), the face inside the hood is darkness with two little glowing yellow eyes;
// little dark boots peek out and step. Smaller and greener than the Storyteller, no props.
import { CX, GY, P, Sprite, litS, near, onRing, pose, ramp, revolve, tone, view, type DrawnDir, type FrameIndex } from './lib-b.js';
import type { CharacterArt } from './types.js';

const CLOAK = ramp('#3a5c2a');
const TRIM = ramp('#c4a266');
const BELT = ramp('#6a4428');
const BRASS = ramp('#d8b050');
const BOOT = ramp('#5a3a2a');
const MITT = ramp('#6e4a32');
const VOID = '#07040c';

function draw(dir: DrawnDir, f: FrameIndex) {
  const v = view(dir);
  const p = pose(f);
  const b = p.bob;
  const sp = new Sprite();
  const sw = P(v, p.step * 0.8, p.walk ? -0.8 : 0).x;
  const hemCx = (y: number) => CX + sw * Math.max(0, Math.min(1, (y - 30) / 5));
  const top = 26 + b;
  const hw = (y: number) => 4.6 + ((y - top) / (35 - top)) * 2.4;

  // boots
  sp.layer((l) => {
    for (const side of [-1, 1]) {
      const fw = p.step === 0 ? 0 : side === p.step ? 1 : -1;
      const q = P(v, side * 2, fw * 1.5);
      const lift = fw < 0 ? 1 : 0;
      const x = Math.round(CX + q.x - 1.5) + (v.s > 0.5 ? 1 : 0);
      const far = q.d < -0.5;
      l.rect(x, GY - 1 - lift, 3, 2, tone(BOOT, far ? 0.2 : 0.45));
      l.set(x, GY - 1 - lift, tone(BOOT, far ? 0.4 : 0.75));
    }
  });

  const armF = (side: number) => (p.step === 0 ? 0 : side === p.step ? -1 : 1);
  const arm = (side: number) => {
    const sh = P(v, side * 4, 0);
    const hd = P(v, side * 5.2, 0.6 + armF(side) * 1.2);
    return { sx: CX + sh.x, hx: CX + hd.x, d: hd.d };
  };
  const sleeve = (side: number) =>
    sp.layer((l) => {
      const a = arm(side);
      const t0 = 26 + b;
      const t1 = 30 + b;
      for (let y = t0; y <= t1; y++) {
        const t = (y - t0) / (t1 - t0);
        const cx = a.sx + (a.hx - a.sx) * t;
        const half = 1.1 + t * 0.7;
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          if (Math.abs(x + 0.5 - cx) > half) continue;
          const vv = (a.d < -0.3 ? 0.3 : 0.6) - (x + 0.5 - cx) * 0.2;
          l.set(x, y, y === t1 ? tone(TRIM, vv) : tone(CLOAK, vv));
        }
      }
      const hx = Math.round(a.hx - 1);
      l.rect(hx, t1 + 1, 2, 2, tone(MITT, 0.5));
      l.set(hx, t1 + 1, tone(MITT, 0.75));
    });
  const arms = [arm(-1), arm(1)].map((a, i) => ({ side: i === 0 ? -1 : 1, ...a }));
  for (const a of arms) if (a.d < -0.3 && Math.abs(a.hx - CX) < 5) sleeve(a.side);

  // cloak body
  sp.layer((l) => {
    revolve(l, v, hemCx, top, 35, hw, (az, y, s) => {
      if (y === 35) return tone(TRIM, 0.62 - s * 0.3);
      if (y === 31 + b) {
        if (near(az, 0, 0.3)) return tone(BRASS, 0.75 - s * 0.4);
        return tone(BELT, litS(s));
      }
      let vv = litS(s) - (y - top) * 0.01;
      if (y > 31 + b) for (const k of [-2.2, -1.1, 1.1, 2.2, Math.PI]) if (near(az, k + (p.walk ? p.step * 0.2 : 0), 0.1)) vv -= 0.3;
      if (y > 31 + b && near(az, 0, 0.09)) return tone(TRIM, 0.45 - s * 0.3);
      return tone(CLOAK, vv);
    });
    // leaf emblems (front, both sides of the opening, and the back)
    for (const [az, big] of [[Math.PI, true]] as [number, boolean][]) {
      const vis = Math.cos(az + v.phi);
      if (vis < 0.35) continue;
      const q = onRing(v, hw(33), az);
      const x = Math.round(hemCx(33) + q.x - 0.5);
      const c = tone(TRIM, 0.55);
      l.set(x, 34, c);
      l.set(x, 33, c);
      l.set(x, 32, c);
      if (vis > 0.7) {
        l.set(x - 1, 33, c);
        l.set(x + 1, 32, c);
        if (big) {
          l.set(x, 31, c);
          l.set(x - 1, 31, c);
          l.set(x + 1, 33, c);
        }
      }
    }
  });

  // hood (big, peaked, tip flopping back)
  sp.layer((l) => {
    const hc = CX + v.s * 0.5;
    const cy = 21 + b;
    const ry = 6.2;
    revolve(l, v, hc, 15 + b, 28 + b, (y) => {
      const t = (y + 0.5 - cy) / ry;
      if (y >= 27 + b) return 5.4 + (y - 27 - b) * 0.5;
      return t < -1 ? 0 : 6.2 * Math.sqrt(Math.max(0, 1 - t * t));
    }, (az, y, s) => {
      if (y === 28 + b) return tone(CLOAK, litS(s) - 0.2);
      return tone(CLOAK, litS(s) + 0.06 - (y - 15 - b) * 0.02);
    });
    // peak: leans back and to the side
    const tx = Math.round(hc - 0.5 - v.s * 2 - (v.c > 0 ? 0 : 0));
    l.rect(tx - 1, 14 + b, 3, 1, CLOAK.l1);
    l.set(tx + (v.s > 0.3 ? -1 : 0), 13 + b, CLOAK.b);
    if (v.c > -0.2) {
      const ox = hc + 3.4 * v.s;
      const orx = 3.9 - 1.6 * v.s;
      const ocy = 21.5 + b;
      l.ellipse(ox, ocy, orx + 1, 4.3, (x, y) => (l.alpha(x, y) ? tone(TRIM, 0.7 - (x - ox) * 0.08 - (y - ocy) * 0.06) : null));
      l.ellipse(ox, ocy, orx, 3.5, VOID);
      for (const az of [-0.6, 0.6]) {
        const vis = Math.cos(az + v.phi);
        if (vis < 0.15) continue;
        const q = onRing(v, 3.2, az);
        const x = Math.round(hc + q.x - 0.5);
        l.set(x, ocy - 0.5, '#fff4b0');
        l.set(x, ocy + 0.5, '#f0c040');
      }
    }
  });

  for (const a of arms) if (!(a.d < -0.3 && Math.abs(a.hx - CX) < 5)) sleeve(a.side);
  return sp.done(6);
}

const art: CharacterArt = { id: 'green-hood', draw };
export default art;
