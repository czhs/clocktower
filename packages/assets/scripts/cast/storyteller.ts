// The Storyteller: deep-purple hooded robe with gold trim and stars, a void face with glowing amber
// eyes, a small warm lantern (right hand) and a tall staff topped with a little clock (left hand).
// Unmistakable and unlike any player: tallest silhouette, the only purple, the clock-staff.
// Feet are hidden; walking sways the robe and the hem lags.
import { CX, GY, P, Sprite, byDepth, lantern, litS, mix, near, onRing, pose, ramp, revolve, sparkle, tone, view, type DrawnDir, type FrameIndex, type View } from './lib-b.js';
import type { CharacterArt } from './types.js';

const ROBE = ramp('#4c2a72');
const DEEP = ramp('#2c1846');
const GOLD = ramp('#d0a442');
const VOID = '#07040c';
const WOOD = ramp('#4a3226');
const IVORY = ramp('#efe4c8');
const STAR = '#f2cc66';
const STAR_DIM = '#a87e36';

// robe stars: [azimuth, row]
const STARS: [number, number, boolean][] = [
  [-0.75, 32, true],
  [0.55, 30, false],
  [1.25, 33, true],
  [2.2, 31, true],
  [-1.7, 30, false],
  [-2.6, 33, true],
  [3.05, 29, false],
  [0.15, 34, false],
];

function draw(dir: DrawnDir, f: FrameIndex) {
  const v = view(dir);
  const p = pose(f);
  const b = p.bob;
  const sp = new Sprite();
  // robe sway: side-to-side with the step, lagging behind when moving
  const sw = P(v, p.step * 0.9, p.walk ? -0.9 : 0).x;
  const hemCx = (y: number) => CX + sw * Math.max(0, Math.min(1, (y - 27) / 9));
  const robeTop = 21 + b;
  const hwRobe = (y: number) => 5.2 + ((y - robeTop) / (36 - robeTop)) * 4.2;

  // feet: just the toes peeking under the hem
  sp.layer((l) => {
    for (const side of [-1, 1]) {
      const fw = p.step === 0 ? 0 : side === p.step ? 1 : -1;
      if (fw < 0) continue;
      const q = P(v, side * 2.4, fw * 1.6);
      const x = Math.round(CX + q.x - 1.5) + (v.s > 0.5 ? 1 : 0);
      l.rect(x, GY, 3, 1, '#3a2620');
      l.set(x, GY, '#5a3c2c');
    }
  });

  // hands: the right hand (u<0) holds the lantern, the left hand the staff
  const armF = (side: number) => (p.step === 0 ? 0 : side === p.step ? -1 : 1);
  const lan = P(v, -7, 1.2 + armF(-1) * 1.2);
  const stf = P(v, 7, 1 + armF(1) * 0.8);
  const lanX = Math.round(CX + lan.x);
  const lanY = 28 + b;
  const stfX = Math.round(CX + stf.x);
  const stfTop = 3 + b + (armF(1) !== 0 ? 0 : 0);

  const drawStaff = () =>
    sp.layer((l) => {
      for (let y = stfTop + 5; y <= GY; y++) l.set(stfX, y, tone(WOOD, y % 5 === 0 ? 0.3 : 0.55));
      // clock head: gold rim, ivory face, two hands
      const cy = stfTop + 2;
      l.ellipse(stfX + 0.5, cy + 0.5, 3, 3, (x, y, nx, ny) => tone(GOLD, 0.6 - nx * 0.3 - ny * 0.3));
      l.ellipse(stfX + 0.5, cy + 0.5, 2, 2, (x, y, nx, ny) => tone(IVORY, 0.65 - nx * 0.25 - ny * 0.25));
      l.set(stfX, cy, '#2a1a2a');
      l.set(stfX, cy - 1, '#2a1a2a');
      l.set(stfX + 1, cy, '#5a4050');
      l.set(stfX, cy - 3, GOLD.l2); // finial
      l.set(stfX, stfTop + 5, GOLD.d1); // collar
      l.set(stfX, stfTop + 6, GOLD.b);
    });
  const drawLantern = () =>
    sp.layer((l) => {
      lantern(l, lanX, lanY, '#241c2c');
    }, { darken: 0.55 });
  const sleeve = (side: number, hx: number, depth: number) =>
    sp.layer((l) => {
      // bell sleeve from the shoulder down to the hand, gold cuff
      const sh = P(v, side * 5, 0);
      const sx = CX + sh.x;
      const top = 21 + b;
      const bot = 27 + b;
      for (let y = top; y <= bot; y++) {
        const t = (y - top) / (bot - top);
        const cx = sx + (hx - sx) * t;
        const half = 1.3 + t * 1.1;
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          if (Math.abs(x + 0.5 - cx) > half) continue;
          const vv = (depth < 0 ? 0.25 : 0.6) - (x + 0.5 - cx) * 0.18;
          l.set(x, y, y === bot ? tone(GOLD, vv) : tone(ROBE, vv));
        }
      }
      l.rect(Math.round(hx) - 1, bot + 1, 2, 1, '#2a1830'); // gloved hand
    });

  const lanD = lan.d;
  const stfD = stf.d;
  const behind: { d: number; draw: () => void }[] = [];
  const front: { d: number; draw: () => void }[] = [];
  const hidS = stfD < -0.2 && Math.abs(stf.x) < 6.5;
  const hidL = lanD < -0.2 && Math.abs(lan.x) < 6.5;
  (hidS ? behind : front).push({ d: stfD, draw: drawStaff });
  (hidL ? behind : front).push({ d: lanD, draw: drawLantern });
  byDepth(behind);
  if (hidS) sleeve(1, stfX + 0.5, -1);
  if (hidL) sleeve(-1, lanX + 0.5, -1);

  // robe
  sp.layer((l) => {
    revolve(l, v, hemCx, robeTop, 36, hwRobe, (az, y, s) => {
      if (y === 36) return tone(GOLD, 0.65 - s * 0.3);
      let vv = litS(s) - (y - robeTop) * 0.006;
      if (y >= 26) for (let k = -3; k <= 3; k++) if (near(az, k * 0.9 + 0.45 + (p.walk ? p.step * 0.18 : 0), 0.09)) vv -= 0.3;
      if (near(az, 0, 0.13) && y >= 25) return tone(GOLD, 0.7 - s * 0.3);
      if (near(az, 0, 0.36) && y >= 25) return tone(DEEP, vv);
      return tone(ROBE, vv);
    });
    for (const [az, y, big] of STARS) {
      const q = onRing(v, hwRobe(y + b), az);
      const vis = Math.cos(az + v.phi);
      if (vis < 0.2) continue;
      const x = Math.round(hemCx(y + b) + q.x - 0.5);
      sparkle(l, x, y + b, STAR, STAR_DIM, big && vis > 0.55);
    }
  });

  // capelet
  sp.layer((l) => {
    const t0 = 19 + b;
    revolve(l, v, CX, t0, 25 + b, (y) => 5.4 + (y - t0) * 0.45, (az, y, s) => {
      if (y === 25 + b) return tone(GOLD, 0.7 - s * 0.35);
      return tone(ROBE, litS(s) + 0.08 - (y - t0) * 0.03);
    });
    // clasp
    const q = onRing(v, 5.9, 0);
    if (q.d > 0.3) {
      const x = Math.round(CX + q.x - 1);
      l.rect(x, 21 + b, 2, 2, GOLD.b);
      l.set(x, 21 + b, GOLD.l2);
      l.set(x + 1, 22 + b, GOLD.d1);
    }
  });

  // hood
  sp.layer((l) => {
    const hc = CX + v.s * 0.6;
    const cy = 15.2 + b;
    const ry = 6.8;
    revolve(l, v, hc, 8 + b, 21 + b, (y) => {
      const t = (y + 0.5 - cy) / ry;
      return t < -1 ? 0 : 6.6 * Math.sqrt(Math.max(0, 1 - t * t)) + (y > cy + 2 ? 0.4 : 0);
    }, (az, y, s) => tone(ROBE, litS(s) + 0.12 - (y - 8 - b) * 0.018));
    // pointed tip, drooping back
    const tipX = Math.round(hc - 0.5 - v.s * 1.5);
    l.set(tipX, 7 + b, ROBE.l1);
    l.rect(tipX - 1, 8 + b, 3, 1, ROBE.l1);
    // the face: a void with gold-rimmed opening
    if (v.c > -0.2) {
      const ox = hc + 4 * v.s;
      const orx = 4.1 - 1.7 * v.s;
      const ory = 4;
      const ocy = 16 + b;
      l.ellipse(ox, ocy, orx + 1, ory + 0.9, (x, y) => (l.alpha(x, y) ? tone(GOLD, 0.75 - (x - ox) * 0.08 - (y - ocy) * 0.06) : null));
      l.ellipse(ox, ocy, orx, ory, VOID);
      // eyes
      const er = 3.4;
      for (const az of [-0.62, 0.62]) {
        const vis = Math.cos(az + v.phi);
        if (vis < 0.15) continue;
        const q = onRing(v, er, az);
        const x = Math.round(hc + 0.2 * v.s + q.x - 1);
        const ey = ocy - 1;
        l.set(x, ey, '#ffe9a0');
        l.set(x + 1, ey, '#ffc048');
        l.set(x, ey + 1, '#ffb43a');
        l.set(x + 1, ey + 1, '#d07a2a');
        if (vis < 0.5) {
          l.set(x + 1, ey, '#ffc048');
          l.set(x + 1, ey + 1, VOID);
          l.set(x, ey, '#ffd27a');
        }
      }
    } else {
      // back of the hood: a gold star
      const q = onRing(v, 6.3, Math.PI - 0.25);
      sparkle(l, Math.round(hc + q.x - 0.5), 12 + b, STAR, STAR_DIM, true);
    }
  });

  // arms in front, then props in front
  const fs: { d: number; draw: () => void }[] = [];
  if (!hidS) fs.push({ d: stfD, draw: () => sleeve(1, stfX + 0.5, stfD) });
  if (!hidL) fs.push({ d: lanD, draw: () => sleeve(-1, lanX + 0.5, lanD) });
  byDepth(fs);
  byDepth(front);
  return sp.done(8);
}

void mix;
void (null as unknown as View);
const art: CharacterArt = { id: 'storyteller', draw };
export default art;
