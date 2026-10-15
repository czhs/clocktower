// Sir Croaksworth — a knight frog: big green head with eye bumps, steel plate with brass edges,
// red cape, round blue shield with a gold star, short sword, brown boots.
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';
import { arm, armFwd, at, ball, Comp, feet, finish, hand, lathe, pose, pxl, ramp, shade, sphereTh, stroke, view, type Img, type Pt, type View } from './lib-a.js';

const GREEN = ramp('#5ea83c');
const LEG = ramp('#3f7a2c');
const CREAM = ramp('#efdcae');
const STEEL = ramp('#55688e');
const BRASS = ramp('#d0a548');
const CAPE = ramp('#b0303c');
const BOOT = ramp('#6e4329');
const BLADE = ramp('#c4cad6');
const SHIELD = ramp('#2f4a8a');
const MOUTH = '#2a1622';

function eyeBump(img: Img, v: View, e: Pt, cy: number) {
  ball(img, e.x, cy, 3, 2.9, GREEN, 0.08);
  if (e.vis <= 0.02) return;
  const rx = 1.1 + 1.0 * e.vis;
  img.ellipse(e.x + v.s * 0.4, cy, rx, 2.1, (x, y, nx, ny) => shade(CREAM, 0.85 - nx * 0.3 - ny * 0.2));
  // pupil: 2x2 (1 px wide on the far eye), looking where the frog walks
  const pw = e.vis > 0.4 ? 2 : 1;
  const px = pxl(e.x + v.s * 0.9, pw);
  img.rect(px, cy - 1, pw, 2, '#140c1c');
  img.set(px, cy - 1, pw === 2 ? '#3a2a40' : '#140c1c');
}

function draw(dir: DrawnDir, frame: FrameIndex): Img {
  const v = view(dir);
  const p = pose(frame);
  const b = p.bob;
  const comp = new Comp();

  feet(comp, v, p, { sep: 3, hip: 33, leg: LEG, boot: BOOT, bootW: 4, bootH: 2 });

  // cape: hangs from the shoulders, trails behind when walking
  const lagPx = [0, 1, 2][p.lag]!;
  const cape = {
    y0: 24 + b,
    y1: 35 + b,
    rx: (_y: number, t: number) => 5.6 + t * 3.4,
    rz: (_y: number, t: number) => 4.8 + t * 2.4,
    dx: (_y: number, t: number) => -v.s * t * lagPx,
    arc: [105, 255] as [number, number],
  };
  const capeCol = (layer: 'front' | 'back') => (h: { th: number; v: number; y: number; t: number; x: number }) => {
    let c = shade(CAPE, h.v + (Math.abs(((h.th + 360) % 30) - 15) < 3 && h.t > 0.3 ? -0.18 : 0));
    if (h.y === cape.y1) c = layer === 'front' ? BRASS.d1 : CAPE.d2;
    return c;
  };
  comp.add(-10, (img) => lathe(img, v, { ...cape, layer: 'back', color: capeCol('back') }));
  comp.add(2.5, (img) => lathe(img, v, { ...cape, layer: 'front', color: capeCol('front') }));

  // armoured body
  comp.add(0, (img) =>
    lathe(img, v, {
      y0: 24 + b,
      y1: 34 + b,
      rx: (_y, t) => 5.3 + t * 1.4,
      rz: (_y, t) => 4.6 + t * 1.2,
      color: (h) => {
        const front = Math.abs(h.th) < 70;
        if (h.y === 31 + b) return Math.abs(h.th) < 14 && front ? BRASS.l1 : '#5a3a26';
        if (h.y === 34 + b) return shade(BRASS, h.v - 0.1);
        if (h.y === 24 + b) return shade(BRASS, h.v);
        if (h.y < 31 + b && Math.abs(h.th) < 8) return shade(STEEL, h.v + 0.3);
        if (h.y > 31 + b && Math.abs(((h.th + 360) % 40) - 20) < 3) return STEEL.d2; // tasset splits
        return shade(STEEL, h.v);
      },
    }),
  );

  // arms
  const sides = [-1, 1] as const;
  for (const side of sides) {
    const sh = at(v, 6.2, side * 90, 26 + b);
    const hd = hand(v, p, side, 7.4, 30 + b, 1.6);
    const far = hd.z < -2;
    comp.add(1 + hd.z * 0.3, (img) => {
      arm(img, sh, hd, STEEL, GREEN, 2, far);
      // pauldron
      ball(img, sh.x, sh.y - 0.5, 2.2, 1.8, STEEL, far ? -0.2 : 0.1);
    });
    if (side === -1) {
      // short sword in the right hand: points down, out and a little forward
      const tip = at(v, 11.5, -90, 35 + b, armFwd(p, side) + 2.2);
      comp.add(1.2 + hd.z * 0.3 + (tip.z > hd.z ? 0.2 : -0.6), (img) => {
        stroke(img, hd.x, hd.y + 1, tip.x, tip.y, 1, (_x, _y, t) => (t < 0.85 ? BLADE.l2 : BLADE.b));
        stroke(img, hd.x + (tip.x > hd.x ? 1 : -1) * 0.7, hd.y + 1.6, tip.x + (tip.x > hd.x ? 1 : -1) * 0.7, tip.y + 0.4, 1, BLADE.d1);
        const gx = pxl(hd.x, 3);
        img.hline(gx, gx + 2, hd.y + 1, BRASS.b);
        img.set(pxl(hd.x, 1), hd.y + 2, BRASS.d1);
      }, 0.6);
    } else {
      // round shield on the left arm; its face points out-front (normal at +35 deg)
      const c = at(v, 8.2, 58, 29.5 + b, armFwd(p, side) * 1.6);
      const n = Math.cos(((12 + v.yaw) * Math.PI) / 180);
      const rx = Math.max(1.3, 3.6 * Math.abs(n));
      comp.add(1.4 + c.z * 0.35, (img) => {
        if (n > 0) {
          img.ellipse(c.x, c.y, rx, 3.8, (x, y, nx, ny) => {
            const d = nx * nx + ny * ny;
            if (d > 0.6) return shade(BRASS, 0.75 - nx * 0.3 - ny * 0.3);
            return shade(SHIELD, 0.65 - nx * 0.3 - ny * 0.25);
          });
          if (rx >= 2.5) {
            // gold star
            const sx = pxl(c.x, 1);
            const sy = Math.round(c.y - 0.5);
            img.vline(sx, sy - 1, sy + 1, BRASS.l2);
            img.hline(sx - 1, sx + 1, sy, BRASS.l1);
          }
        } else {
          img.ellipse(c.x, c.y, rx, 3.8, (x, y, nx) => shade(ramp('#6a4a32'), 0.5 - nx * 0.3));
        }
      }, 0.65);
    }
  }

  // head + eye bumps
  const hy = 19 + b;
  const eyes = sides.map((side) => at(v, 5.4, side * 40, 14 + b));
  for (const e of eyes) if (e.vis <= 0.02) comp.add(4, (img) => eyeBump(img, v, e, 14 + b));
  comp.add(5, (img) => {
    ball(img, 16 + v.s * 0.6, hy, 8.4, 5.8, GREEN, 0.04, (_x, _y, nx, ny) => {
      const { th } = sphereTh(v, nx, ny);
      const a = Math.abs(th);
      if (a < 80 && ny >= 0.18 && ny < 0.36) return MOUTH;
      if (a >= 58 && a < 80 && ny >= 0.0 && ny < 0.18) return MOUTH;
      if (a < 85 && ny >= 0.36) return shade(CREAM, 0.75 - nx * 0.3 - (ny - 0.36));
      if (a < 70 && ny > -0.05 && ny < 0.15 && Math.abs(a - 52) < 8) return '#d77a6a'; // cheek
      return undefined;
    });
    // cape collar + clasp under the chin
    if (v.face) {
      const cl = at(v, 5.6, 0, 24 + b);
      if (cl.vis > 0.3) img.rect(pxl(cl.x, 2), 24 + b, 2, 1, BRASS.l1);
    }
  }, 0.72);
  for (const e of eyes) if (e.vis > 0.02) comp.add(6, (img) => eyeBump(img, v, e, 14 + b), 0.72);

  return finish(comp.render(), 7);
}

const frog: CharacterArt = { id: 'frog', draw };
export default frog;
