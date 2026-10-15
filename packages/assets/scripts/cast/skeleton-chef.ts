// Bones, the baker: a friendly cartoon skeleton (round skull, big dark eye sockets, a toothy smile)
// in a tall puffy chef's toque, dark shirt, white apron (bow at the back), carrying a wicker basket
// of golden loaves in both hands. Cute, not scary.
import { CX, P, Sprite, ball, byDepth, feat, legs, litS, near, onRing, pose, ramp, revolve, stamp, tone, view, type DrawnDir, type FrameIndex } from './lib-b.js';
import type { CharacterArt } from './types.js';

const BONE = ramp('#e6dcc2');
const HAT = ramp('#eee8dc');
const SHIRT = ramp('#323a5a');
const APRON = ramp('#e4ddd0');
const PANTS = ramp('#2a2a3a');
const BOOT = ramp('#5e3a26');
const WICKER = ramp('#9a6634');
const BREAD = ramp('#d89a44');
const HOLE = '#160e1c';

function draw(dir: DrawnDir, f: FrameIndex) {
  const v = view(dir);
  const p = pose(f);
  const b = p.bob;
  const sp = new Sprite();
  const face = v.c > -0.2;

  // legs
  sp.layer((l) => legs(l, v, p, { hip: 33 + b, spread: 2.2, stride: 1.6, legW: 2, pants: PANTS, boot: BOOT }));

  // basket (in front of the belly) and arms reaching round it
  const bk = P(v, 0, 4.6);
  const bx = CX + bk.x;
  const by = 30 + b;
  const halfW = 3.7 * Math.abs(v.c) + 2.8 * Math.abs(v.s);
  const basket = () =>
    sp.layer((l) => {
      for (const t of [-0.6, 0.6, 0]) {
        const lx = bx + t * halfW * 0.95;
        ball(l, lx, by - 1 - (t === 0 ? 0.7 : 0), t === 0 ? 2.1 : 1.8, 1.5, BREAD, 0.15);
      }
      for (let y = by; y <= by + 3; y++) {
        const hw = halfW - (y === by + 3 ? 0.8 : 0);
        for (let x = Math.floor(bx - hw); x <= Math.ceil(bx + hw); x++) {
          if (Math.abs(x + 0.5 - bx) > hw) continue;
          const s = (x + 0.5 - bx) / hw;
          let vv = litS(s) - (y - by) * 0.06;
          if (y === by) vv += 0.25;
          else if ((x + y) % 2 === 0) vv -= 0.18; // weave
          l.set(x, y, tone(WICKER, vv));
        }
      }
    });
  const arm = (side: number) => {
    const sh = P(v, side * 4.4, 0);
    const hd = P(v, side * (halfW > 3 ? 3.6 : 2.6), 3.4);
    return { side, sx: CX + sh.x, hx: CX + hd.x, d: hd.d };
  };
  const drawArm = (a: ReturnType<typeof arm>) =>
    sp.layer((l) => {
      const far = a.d < -0.5;
      for (let y = 26 + b; y <= by - 1; y++) {
        const t = (y - 26 - b) / (by - 1 - 26 - b);
        const cx = a.sx + (a.hx - a.sx) * t;
        stamp(l, cx, y, 2, 1, (i) => tone(SHIRT, (far ? 0.25 : 0.6) - i * 0.25), false);
      }
      stamp(l, a.hx, by - 1, 2, 2, (i, j) => tone(BONE, (far ? 0.35 : 0.75) - i * 0.2 - j * 0.2), false);
    });
  const arms = [arm(-1), arm(1)];

  if (bk.d < 0) {
    for (const a of arms) drawArm(a);
    basket();
  }

  // torso (shirt + apron, bow at the back)
  sp.layer((l) => {
    revolve(l, v, CX, 25 + b, 34 + b, (y) => (y === 25 + b ? 3.6 : 4.6 + (y - 25 - b) * 0.12), (az, y, s) => {
      const yy = y - b;
      const apron = near(az, 0, 1.0) && yy >= 27;
      if (yy === 29 && !apron && v.c < 0) return tone(APRON, litS(s) - 0.1); // apron strings
      if (yy === 29 && near(az, Math.PI, 0.5)) return tone(APRON, litS(s));
      if (apron) return tone(APRON, litS(s) - (yy - 27) * 0.02);
      return tone(SHIRT, litS(s));
    });
  });
  sp.layer((l) => {
    // bow at the back
    const q = onRing(v, 4.8, Math.PI);
    if (q.d > 1) {
      const x = Math.round(CX + q.x);
      const yb = 29 + b;
      const hi = tone(APRON, 0.8);
      const lo = tone(APRON, 0.45);
      for (const [dx, dy, c] of [[-3, -1, hi], [-2, -1, hi], [-3, 0, hi], [-2, 0, lo], [-3, 1, lo], [-2, 1, lo], [1, -1, hi], [2, -1, lo], [1, 0, lo], [2, 0, lo], [1, 1, lo], [2, 1, lo], [-1, 0, hi], [0, 0, lo], [-1, 1, lo], [-2, 2, lo], [1, 2, lo]] as [number, number, typeof hi][])
        l.set(x + dx, yb + dy, c);
    }
  }, { darken: 0.6 });

  // skull
  sp.layer((l) => {
    const hc = CX + v.s * 0.8;
    const cy = 19.4 + b;
    const ry = 5.3;
    revolve(l, v, hc, 14 + b, 25 + b, (y) => {
      const t = (y + 0.5 - cy) / ry;
      if (y >= 23 + b) return 4.6 - (y - 23 - b) * 0.6; // jaw
      return t < -1 ? 0 : 6.6 * Math.sqrt(Math.max(0, 1 - t * t));
    }, (_az, y, s) => tone(BONE, litS(s) + 0.1 - (y - 14 - b) * 0.012));
    if (!face) return;
    const ey = 18 + b;
    for (const e of [-0.68, 0.68]) {
      const q = feat(v, hc, 4.6, e);
      if (q.vis < 0.05) continue;
      const w = q.fore ? 2 : 3;
      stamp(l, q.x, ey, w, 4, (i, j) => (j === 3 && (i === 0 || i === w - 1) && w === 3 ? null : HOLE));
    }
    const n = feat(v, hc, 5.4, 0);
    stamp(l, n.x, 22 + b, n.fore ? 1 : 2, 1, HOLE);
    // smile with teeth
    for (let k = -5; k <= 5; k++) {
      const q = feat(v, hc, 4.8, k * 0.11);
      if (q.vis < 0.1) continue;
      const curve = Math.abs(k) >= 5 ? -1 : 0;
      stamp(l, q.x, 24 + b + curve, 1, 1, '#5e4c58');
      if (k === -2 || k === 2 || k === 0) stamp(l, q.x, 25 + b, 1, 1, tone(BONE, 0.25));
    }
  });

  // toque: a band and a cluster of puffs that turn with the head; creases where puffs overlap
  sp.layer((l) => {
    const hc = CX + v.s * 0.5;
    revolve(l, v, hc, 12 + b, 14 + b, () => 4.9, (_az, y, s) => tone(HAT, litS(s) - (y === 14 + b ? 0.2 : 0.05)));
    const puffs: { x: number; y: number; rx: number; ry: number; d: number }[] = [];
    for (const az of [-1.3, 1.3, Math.PI, 0]) {
      const q = onRing(v, 3, az);
      puffs.push({ x: hc + q.x, y: 10.2 + b, rx: 3.3, ry: 2.7, d: q.d });
    }
    puffs.push({ x: hc - 0.6, y: 7.6 + b, rx: 2.6, ry: 2.2, d: 9 });
    puffs.sort((a, c) => a.d - c.d);
    const id = (x: number, y: number) => {
      let k = -1;
      puffs.forEach((pf, i) => {
        const nx = (x + 0.5 - pf.x) / pf.rx;
        const ny = (y + 0.5 - pf.y) / pf.ry;
        if (nx * nx + ny * ny <= 1) k = i;
      });
      return k;
    };
    for (let y = 4 + b; y <= 13 + b; y++)
      for (let x = 6; x <= 26; x++) {
        const k = id(x, y);
        if (k < 0) continue;
        const pf = puffs[k]!;
        const nx = (x + 0.5 - pf.x) / pf.rx;
        const ny = (y + 0.5 - pf.y) / pf.ry;
        let vv = 0.78 - (x - hc + 5) * 0.035 - (y - 5 - b) * 0.035 - (nx > 0.55 ? 0.12 : 0) - (ny > 0.6 ? 0.1 : 0);
        // crease: this puff is behind a neighbour that belongs to a puff in front
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]] as [number, number][]) {
          const k2 = id(x + dx, y + dy);
          if (k2 > k) vv = Math.min(vv, 0.3);
        }
        l.set(x, y, tone(HAT, vv));
      }
  });

  if (bk.d >= 0) {
    const fr = arms.filter((a) => a.d < 0.5 && !(v.down));
    for (const a of fr) drawArm(a);
    basket();
    for (const a of arms) if (!fr.includes(a)) drawArm(a);
  }
  return sp.done(7);
}

const art: CharacterArt = { id: 'skeleton-chef', draw };
export default art;
