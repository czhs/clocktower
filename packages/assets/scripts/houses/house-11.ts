// house-11 — Fernlea: a home hollowed into an ancient oak (east-facing). A fat furrowed trunk with
// flaring roots holds the round-topped front door (in the trunk's right flank, facing the lane), a
// round window and a lantern; a plank stair winds up the trunk to a little gabled cabin perched
// in the crown, wrapped in leaves and strung with lanterns. Ferns and toadstools at the roots.
import type { HouseArt } from './types.js';
import { GLASS, paintWindow, place, ROOFS, wallLantern, WALLS } from '../buildings.js';
import { canopy } from '../lib/draw.js';
import { dpick, hash, Img, vnoise } from '../lib/img.js';
import { finish, groundLine, hangLantern, roundWindow, sideDoor, type Pt } from './lib-houses-c.js';

const BARK = ['#181214', '#261c1c', '#382a24', '#4c3a2c', '#624e38', '#7c6648', '#96805a'];
const FOLI = ['#0c1812', '#14261a', '#1e3822', '#2a4e2a', '#3c6630', '#56803a', '#76984a'];
const WOOD = ['#2a1a10', '#40281a', '#5a3a24', '#76502e', '#94683c'];

const art: HouseArt = (b, style, seed) => {
  const W = b.footprint.w * 16;
  const H = b.footprint.h * 16 + 32;
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const CX = 31; // trunk centre
  const DOORX = 45;
  const base = (x: number) => (x < DOORX - 1 ? H - 1 : groundLine(H, DOORX - 1)(x));

  // --- crown (behind everything): a broad canopy
  canopy(
    img,
    [
      [10, 34, 11],
      [54, 34, 10],
      [18, 18, 13],
      [44, 16, 14],
      [31, 10, 11],
      [6, 50, 7],
      [58, 50, 6],
      [31, 30, 14],
    ],
    FOLI,
    seed,
    { tex: 0.4, bias: -0.04 },
  );

  // --- limbs from the trunk top into the crown
  const limb = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const r = w0 + (w1 - w0) * t;
      for (let k = -r; k <= r; k++) {
        const px = Math.round(x + k);
        const v = 0.55 - (k / r) * 0.3 + (vnoise(px, y, 3, seed + 4) - 0.5) * 0.25;
        img.set(px, Math.round(y), dpick(BARK, v, px, Math.round(y)));
      }
    }
  };
  limb(CX - 6, 64, 8, 42, 5, 2);
  limb(CX + 6, 62, 56, 46, 5, 2);
  limb(CX, 60, CX - 2, 40, 6, 3);

  // --- the trunk: a fat furrowed cylinder with a slight waist, flaring at the foot
  const MOSS = ['#1e3220', '#2a4428', '#3a5a32', '#4e7038'];
  for (let y = 50; y < H; y++) {
    const t = (y - 50) / (H - 50);
    const hw = 15 - Math.sin(t * Math.PI) * 1.5 + t * 6 + Math.pow(Math.max(0, t - 0.78) / 0.22, 2) * 8;
    const lean = Math.sin(y * 0.05) * 1.2;
    for (let x = Math.floor(CX - hw + lean); x <= Math.ceil(CX + hw + lean); x++) {
      if (x < 0 || x > W - 2) continue;
      if (y > base(x)) continue;
      const u = (x + 0.5 - (CX - hw + lean)) / (2 * hw);
      if (u < 0 || u > 1) continue;
      const furrow = vnoise(x * 1.3, y * 0.12, 3, seed);
      let v = 0.74 - u * 0.55 + Math.max(0, 0.15 - Math.abs(u - 0.22)) * 1.2;
      if (furrow < 0.36) v -= 0.32;
      else if (furrow > 0.68) v += 0.14;
      if (u > 0.8) v -= 0.1;
      if (y > H - 4) v -= 0.12;
      // moss on the lit, shady-damp lower flank
      if (u < 0.4 && vnoise(x, y, 4, seed + 21) > 0.6 - t * 0.12 && furrow >= 0.36) {
        img.set(x, y, dpick(MOSS, v + 0.1, x, y));
        continue;
      }
      img.set(x, y, dpick(BARK, v + (hash(x, y, seed) - 0.5) * 0.08, x, y));
    }
  }
  // gnarled roots running out over the ground
  {
    const root = (x0: number, y0: number, x1: number, y1: number, r0: number) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 1.5;
        const r = r0 * (1 - t * 0.75);
        for (let k = -r; k <= r; k += 1) {
          const py = Math.round(y + k);
          const px = Math.round(x);
          if (py > H - 1) continue;
          const v = 0.62 - (k / r) * 0.35 + (vnoise(px, py, 3, seed + 5) - 0.5) * 0.2;
          img.set(px, py, dpick(BARK, v, px, py));
        }
      }
    };
    root(14, 100, 1, 108, 4);
    root(24, 104, 15, 110, 3);
    root(38, 104, 41, 110, 3);
  }
  // a knot hole
  img.ellipse(17, 66, 2.5, 3, (x, y, nx, ny) => (nx * nx + ny * ny > 0.45 ? BARK[4]! : BARK[0]!));

  // --- the winding plank stair up the trunk to the crown
  const steps: [number, number][] = [];
  for (let k = 0; k < 8; k++) steps.push([9 + k * 3.7, 98 - k * 5.2]);
  for (const [sx, sy] of steps) {
    const x = Math.round(sx);
    const y = Math.round(sy);
    for (let i = 0; i < 7; i++) {
      img.set(x + i, y, i === 0 ? WOOD[4]! : '#b89060');
      img.set(x + i, y + 1, dpick(WOOD, 0.6 - i * 0.04, x + i, y + 1));
      img.set(x + i, y + 2, WOOD[1]!);
      img.blend(x + i, y + 3, '#05030a', 0.5);
    }
  }
  // rope rail with posts on every other step
  for (let k = 0; k < steps.length; k += 2) {
    const [sx, sy] = steps[k]!;
    img.vline(Math.round(sx) + 1, Math.round(sy) - 6, Math.round(sy) - 1, WOOD[3]!);
    img.set(Math.round(sx) + 1, Math.round(sy) - 6, WOOD[4]!);
  }
  for (let k = 0; k + 2 < steps.length; k += 2) {
    const [ax, ay] = steps[k]!;
    const [bx2, by2] = steps[k + 2]!;
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      img.set(Math.round(ax + 1 + (bx2 - ax) * t), Math.round(ay - 6 + (by2 - ay) * t + Math.sin(t * Math.PI) * 1.5), '#c8b080');
    }
  }

  // --- round window in the trunk with a little flower box
  windows.push(roundWindow(img, 20.5, 80.5, 4, ['#2a1a10', '#5a3a24', '#94683c'], GLASS));
  img.rect(15, 86, 12, 2, WOOD[3]!);
  img.hline(15, 26, 87, WOOD[1]!);
  for (let i = 0; i < 12; i++) {
    img.set(15 + i, 85, i % 2 ? FOLI[4]! : FOLI[3]!);
    if (hash(i, 11, seed) < 0.55) img.set(15 + i, 84 + (i % 2), ['#e8e0d0', '#c0304a', '#e8a030', '#a040a0'][i % 4]!);
  }

  // --- the cabin in the crown: plank walls, a window, a gable roof, balcony rail
  const cx0 = 30;
  const cw = 24;
  const cTop = 28;
  let chim: Pt = { x: 0, y: 0 };
  const cBot = 44;
  {
    const tex = new Img(cw, cBot - cTop);
    const pk = WALLS.planks!;
    for (let j = 0; j < tex.h; j++)
      for (let i = 0; i < cw; i++) {
        const lu = i % 4;
        let v = 0.55 + (hash(Math.floor(i / 4), 2, seed) - 0.5) * 0.3 + (i < 3 ? 0.15 : 0) - (i > cw - 4 ? 0.2 : 0);
        if (lu === 3) v = 0.08;
        if (j < 2) v -= 0.3; // eave shadow
        tex.set(i, j, dpick(pk, v, i, j));
      }
    img.blit(tex, cx0, cTop);
    const win = paintWindow(style, 6, 6, true, seed + 3);
    place(img, win, (i, j) => [cx0 + Math.floor((cw - win.w) / 2) + i, cTop + 4 + j]);
    windows.push({ x: cx0 + cw / 2, y: cTop + 7 });
    // gable roof
    const pal = ROOFS[style.roof] ?? ROOFS.blue!;
    const ax = cx0 + cw / 2;
    const ay = cTop - 15;
    for (let y = ay; y <= cTop + 1; y++) {
      const hw = ((y - ay) / (cTop + 1 - ay)) * (cw / 2 + 4) + 0.5;
      for (let x = Math.round(ax - hw); x < Math.round(ax + hw); x++) {
        const left = x < ax;
        const edge = Math.abs(x + 0.5 - ax) > hw - 2.2;
        let v = left ? 0.72 : 0.38;
        if ((y - ay) % 3 === 2) v -= 0.18;
        if (edge) v = left ? 0.95 : 0.6;
        if (y === cTop + 1) v = 0.05;
        img.set(x, y, dpick(pal, v, x, y));
      }
    }
    // gable infill under the roof: a small round attic light
    windows.push(roundWindow(img, ax, cTop - 4, 2, ['#2a1a10', '#5a3a24', '#94683c'], GLASS, false));
    // stovepipe from the far slope
    const px = ax + 7;
    for (let y = ay + 2; y < ay + 10; y++) for (let i = 0; i < 3; i++) img.set(px + i, y, ['#6a6474', '#4a4452', '#2a2632'][i]!);
    img.rect(px - 1, ay + 1, 5, 1, '#8a8496');
    chim = { x: px + 1, y: ay + 1 };
    // platform + balcony
    for (let x = cx0 - 4; x < cx0 + cw + 4; x++) {
      img.set(x, cBot, dpick(WOOD, 0.85, x, cBot));
      img.set(x, cBot + 1, dpick(WOOD, 0.4, x, cBot + 1));
      img.set(x, cBot + 2, WOOD[0]!);
    }
    for (let x = cx0 - 4; x < cx0 + cw + 4; x++) img.set(x, cBot - 5, WOOD[4]!);
    for (let x = cx0 - 4; x < cx0 + cw + 4; x += 3) img.vline(x, cBot - 4, cBot - 1, WOOD[2]!);
    // struts down to the trunk
    img.line(cx0 - 2, cBot + 3, CX - 6, cBot + 12, WOOD[2]!);
    img.line(cx0 + cw + 2, cBot + 3, CX + 10, cBot + 14, WOOD[2]!);
  }
  // leaves tumbling over the cabin's corners so it sits *in* the tree
  canopy(img, [[cx0 - 3, cBot - 2, 6], [cx0 + cw + 4, cBot - 3, 6], [cx0 + cw + 3, cTop - 2, 5]], FOLI, seed + 7, { tex: 0.45 });
  // a string of little lanterns sagging between the limbs
  for (let k = 0; k <= 20; k++) {
    const x = 6 + k * 1.1;
    const y = 50 + Math.sin((k / 20) * Math.PI) * 5;
    img.set(Math.round(x), Math.round(y), '#3a3040');
  }
  for (const k of [3, 10, 17]) {
    const x = Math.round(6 + k * 1.1);
    const y = Math.round(50 + Math.sin((k / 20) * Math.PI) * 5) + 1;
    img.set(x, y, '#ffd27a');
    img.set(x, y + 1, '#e8862e');
  }
  windows.push({ x: 17, y: 56 });

  // --- the front door in the trunk's right flank, a lantern on the left
  const { d } = sideDoor(img, { x0: DOORX, base, paint: '#6a4a8a', seed, kind: 'dutch', arched: true, h: 20 });
  wallLantern(img, 41, 87, true);
  windows.push({ x: 42, y: 84 });
  // hanging lantern from the right limb
  windows.push(hangLantern(img, 55, 60, 6, ['#0f0d14', '#1b1822', '#3c3746'], GLASS));

  // --- ferns and toadstools at the roots
  const fern = (x: number, y: number, dir: number, len: number) => {
    for (let k = 0; k < len; k++) {
      const px = x + dir * k;
      const py = y - Math.round(Math.sin((k / len) * 2.2) * len * 0.45);
      img.set(px, py, FOLI[5]!);
      if (k % 2 === 0 && k < len - 1) {
        img.set(px, py - 1, FOLI[6]!);
        img.set(px, py + 1, FOLI[3]!);
      }
    }
  };
  fern(4, 110, 1, 8);
  fern(10, 110, -1, 7);
  fern(6, 109, 1, 6);
  fern(56, 108, 1, 6);
  const shroom = (x: number, y: number, big: boolean) => {
    img.vline(x, y - (big ? 2 : 1), y, '#e8dcc0');
    const r = big ? 2 : 1;
    for (let i = -r; i <= r; i++) img.set(x + i, y - (big ? 3 : 2), '#c0303a');
    if (big) for (let i = -1; i <= 1; i++) img.set(x + i, y - 4, '#d84a4a');
    img.set(x - 1, y - (big ? 3 : 2), '#f0e8d8');
    if (big) img.set(x + 1, y - 4, '#f0e8d8');
  };
  shroom(28, 110, true);
  shroom(32, 110, false);
  shroom(40, 109, false);

  return finish(img, d, windows, chim);
};
export default art;
