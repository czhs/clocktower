// house-14 — Millrace Mill: a little water-mill cottage (south-facing). A big overshot wheel on the
// left is fed by a wooden flume from a sluice gate and dips into a stone millrace; the house has a
// stone ground floor, a timbered upper storey and a deep thatch with an eyebrow window, a gabled
// hoist loft (lucam) with a flour sack on its rope, a spare millstone by the wall and sacks at the
// dutch door.
import type { HouseArt } from './types.js';
import { BEAM, BRASS, chimney, doorAssembly, doorHood, DSTONE, GLASS, IRON, paintWindow, place, roof, ROOFS, STONE, type DoorSpec, type Tf } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { type Color, dpick, hash, Img, mix, vnoise } from '../lib/img.js';
import { finish, glassRect, type Pt } from './lib-houses-c.js';

const WOOD = ['#1e140c', '#2e2014', '#44301c', '#5c4226', '#765832', '#927040'];
const WATER = ['#16263a', '#1e3a52', '#2a5270', '#3c6e8c', '#5a90a8', '#8cbcc8', '#d8eef0'];
const PLASTER = ['#5c5850', '#726d62', '#8a8476', '#a09a8a', '#b4ae9c', '#c8c2ae'];

const art: HouseArt = (b, style, seed) => {
  const W = b.footprint.w * 16;
  const H = b.footprint.h * 16 + 32;
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const BX0 = 20; // the house body starts here; the wheel stands in front of its left end
  const wallTop = H - 34;
  const upperBot = wallTop + 13;
  const dx = (b.door.x - b.footprint.x) * 16 + 8;
  const DW = 12;
  const DH = 20;
  const dx0 = dx - DW / 2;
  const doorBottom = H - 4;

  // --- the house body: stone ground floor, timbered upper storey
  stonework(img, BX0, upperBot, W - BX0 - 1, H - upperBot, STONE, '#141118', { rh: 5, sw: 9, seed, shade: (i) => (i > W - BX0 - 6 ? -0.18 : 0) });
  for (let y = wallTop; y < upperBot; y++)
    for (let x = BX0 + 1; x < W - 1; x++) {
      const post = (x - BX0) % 9 < 2 || y === wallTop;
      if (post) img.set(x, y, dpick(BEAM, 0.55 + ((x - BX0) % 9 === 0 ? 0.3 : 0), x, y));
      else img.set(x, y, dpick(PLASTER, 0.62 + (vnoise(x, y, 5, seed) - 0.5) * 0.3 - (x > W - 6 ? 0.2 : 0), x, y));
    }
  for (let x = BX0; x < W - 1; x++) {
    img.set(x, upperBot, dpick(BEAM, 0.9, x, upperBot));
    img.set(x, upperBot + 1, BEAM[0]!);
  }

  // --- windows: ground floor (right), upper storey (left)
  {
    const win = paintWindow(style, 10, 9, true, seed);
    place(img, win, (i, j) => [62 - Math.floor(win.w / 2) + i, upperBot + 6 + j]);
    windows.push({ x: 62, y: upperBot + 10 });
    img.rect(55, upperBot + 17, 14, 2, STONE[4]!);
    img.hline(55, 68, upperBot + 18, STONE[1]!);
    const w2 = paintWindow(style, 6, 7, false, seed + 1);
    place(img, w2, (i, j) => [67 + i, wallTop + 4 + j]);
    windows.push({ x: 71, y: wallTop + 8 });
  }

  // --- the dutch door, step, lamp, sacks
  const spec: DoorSpec = { w: DW, h: DH, arched: false, kind: 'dutch', hinge: 'left', paint: '#3f5a3a', wreath: false, seed };
  const T: Tf = (i, j) => [dx0 + i, doorBottom - (DH - 1) + j];
  const d = doorAssembly(img, T, spec, 2, seed);
  for (let j = 0; j < 3; j++)
    for (let i = -3 - (j > 0 ? 1 : 0); i < DW + 3 + (j > 0 ? 1 : 0); i++) {
      const x = dx0 + i;
      const y = doorBottom + 1 + j;
      img.set(x, y, j === 0 ? dpick(DSTONE, 0.85 + (hash(x, y, 4) - 0.5) * 0.15, x, y) : dpick(DSTONE, j === 1 ? 0.45 : 0.25, x, y));
    }
  {
    // lamp on the right of the door
    const lx = dx0 + DW + 4;
    const ly = doorBottom - DH + 9;
    img.hline(lx + 1, lx + 4, ly - 7, IRON[2]!);
    img.rect(lx - 1, ly - 6, 4, 1, IRON[1]!);
    img.rect(lx - 1, ly - 5, 4, 4, GLASS[3]!);
    img.set(lx, ly - 4, GLASS[4]!);
    img.rect(lx - 1, ly - 1, 4, 1, IRON[1]!);
    windows.push({ x: lx + 1, y: ly - 3 });
  }
  const sack = (x: number, bottom: number, h: number) => {
    for (let j = 0; j < h; j++) {
      const w = j < 2 ? 3 : j < 4 ? 5 : 7;
      const off = Math.floor((7 - w) / 2);
      for (let i = 0; i < w; i++) {
        const u = (i + 0.5) / w;
        img.set(x + off + i, bottom - h + 1 + j, dpick(['#5a5040', '#8a8068', '#b4aa90', '#d4ccb4', '#ece6d4'], 0.82 - u * 0.5 - (j === 2 ? 0.25 : 0), x + off + i, bottom - h + 1 + j));
      }
    }
    img.set(x + 3, bottom - h, '#8a7048');
  };
  sack(dx0 + DW + 3, H - 2, 9);
  sack(dx0 + DW + 9, H - 2, 7);

  // --- a spare millstone leaning on the wall, right corner
  {
    const mx = W - 7;
    const my = H - 8;
    img.ellipse(mx, my, 5.5, 7, (x, y, nx, ny) => {
      const r = Math.sqrt(nx * nx + ny * ny);
      if (r < 0.22) return '#141118';
      const a = Math.atan2(ny, nx);
      const furrow = Math.abs(((a * 8) / Math.PI) % 1) < 0.18 && r > 0.35;
      return dpick(['#3a3640', '#58525c', '#78727a', '#9a949a', '#bab4b4'], 0.62 - nx * 0.3 - ny * 0.25 - (furrow ? 0.25 : 0) - (r > 0.88 ? 0.25 : 0), x, y);
    });
  }

  // --- roof: a deep thatch with a hip, an eyebrow window and a chimney
  const roofTop = 22;
  const roofBottom = wallTop + 2;
  roof(img, style, BX0 - 2, W - 1, roofTop, roofBottom, 10, seed + 5);
  img.blendRect(BX0, roofBottom + 1, W - BX0 - 1, 3, '#05030a', 0.45);
  doorHood(img, T, spec, 'lintel', ROOFS[style.roof]!);
  const pal = ROOFS[style.roof] ?? ROOFS.thatch!;
  {
    // a decorative thatch ridge: a thicker cap with a scalloped lower edge and crossed liggers
    const ins = 10;
    for (let y = roofTop; y < roofTop + 8; y++) {
      const f = (y - roofTop) / (roofBottom - roofTop);
      const insY = Math.round(ins * (1 - f));
      for (let x = BX0 - 2 + insY; x <= W - 1 - insY; x++) {
        const lx = x - (BX0 - 2);
        const scal = 6 + Math.round(Math.abs(Math.sin((lx * Math.PI) / 6)) * 2);
        if (y - roofTop > scal) continue;
        const ligger = y - roofTop === 3 || ((lx + (y - roofTop)) % 6 === 0 && y - roofTop > 3) || ((lx - (y - roofTop) + 60) % 6 === 0 && y - roofTop > 3);
        let v = 0.72 - (y - roofTop) * 0.04 + (hash(x, y, seed + 2) - 0.5) * 0.2;
        if (ligger) v = 0.2;
        if (y - roofTop === scal) v = 0.08;
        img.set(x, y, dpick(pal, v, x, y));
      }
    }
  }
  {
    // eyebrow window: the thatch swells over a little arched light
    const ex = 40;
    const ey = 42;
    img.ellipse(ex, ey + 1, 9, 5.5, (x, y, nx, ny) => (ny < 0 ? dpick(pal, 0.95 - ny * -0.1 - (nx > 0.3 ? 0.2 : 0) + (hash(x, y, 7) - 0.5) * 0.2, x, y) : null));
    for (let j = 0; j < 4; j++) for (let i = -4; i <= 4; i++) if (Math.abs(i) <= 4 - (j === 0 ? 1 : 0)) img.set(ex + i, ey + 1 + j, j === 3 ? BEAM[0]! : dpick(GLASS, 0.88 - j * 0.12, ex + i, ey + 1 + j));
    img.vline(ex, ey + 1, ey + 3, BEAM[1]!);
    img.hline(ex - 6, ex + 6, ey + 5, pal[0]!);
    windows.push({ x: ex, y: ey + 2 });
  }
  const chim = chimney(img, 70, 6, roofTop + 14, 'brick', 1, seed);

  // --- the lucam: a gabled hoist loft over the right of the front, with its rope and a sack
  {
    const lx0 = 50;
    const lw = 15;
    const lt = 30;
    const lb = wallTop + 3;
    for (let y = lt; y <= lb; y++)
      for (let x = lx0; x < lx0 + lw; x++) {
        const lu = (x - lx0) % 3;
        let v = 0.55 + (lu === 0 ? 0.15 : lu === 2 ? -0.2 : 0) + (x === lx0 ? 0.15 : 0) - (x === lx0 + lw - 1 ? 0.25 : 0);
        if (y > lb - 2) v -= 0.25;
        img.set(x, y, dpick(WOOD, v, x, y));
      }
    // loading doors (closed) + a small lit window above
    for (let y = lt + 10; y < lb - 2; y++)
      for (let x = lx0 + 3; x < lx0 + lw - 3; x++) img.set(x, y, x === lx0 + 7 ? WOOD[0]! : dpick(WOOD, 0.75 - (y - lt - 10) * 0.02, x, y));
    img.hline(lx0 + 3, lx0 + lw - 4, lt + 13, IRON[2]!);
    img.hline(lx0 + 3, lx0 + lw - 4, lb - 5, IRON[2]!);
    glassRect(img, lx0 + 5, lt + 4, 5, 4, GLASS);
    img.rect(lx0 + 4, lt + 3, 7, 1, WOOD[0]!);
    img.rect(lx0 + 4, lt + 8, 7, 1, WOOD[0]!);
    windows.push({ x: lx0 + 7, y: lt + 5 });
    // its little gable roof (slate, so it stands out from the thatch)
    const sp = ROOFS.slate!;
    const ax = lx0 + lw / 2;
    for (let j = 0; j < 9; j++)
      for (let i = -lw / 2 - 2 + j; i <= lw / 2 + 1 - j; i++) {
        const x = Math.round(ax + i - 0.5);
        const y = lt - j;
        img.set(x, y, dpick(sp, (i < 0 ? 0.75 : 0.4) + (j === 8 ? 0.2 : 0) + ((x + j) % 3 === 0 ? -0.15 : 0), x, y));
      }
    img.hline(lx0 - 2, lx0 + lw + 1, lt, sp[0]!);
    // hoist beam, pulley, rope, sack
    const hx = Math.round(ax);
    img.rect(hx - 1, lt - 3, 2, 3, BEAM[3]!);
    img.set(hx, lt + 1, IRON[3]!);
    img.vline(hx, lt + 2, lt + 8, '#a8946a');
    // (rope continues in front of the doors)
    img.vline(hx + 1, lt + 9, lt + 12, "#a8946a");
    sack(hx - 2, lt + 19, 7);
  }

  // --- the water wheel and its millrace
  const WCX = 15;
  const WCY = H - 23;
  const WR = 15;
  // shadow on the wall behind the wheel
  for (let y = WCY - WR; y <= WCY + WR; y++)
    for (let x = BX0; x <= WCX + WR + 3; x++) if (Math.hypot(x - WCX - 3, y - WCY - 1) < WR && img.alpha(x, y)) img.blend(x, y, '#05030a', 0.45);
  // the millrace: a stone-kerbed channel along the bottom-left
  {
    const cy0 = H - 9;
    for (let y = cy0; y < H; y++)
      for (let x = 0; x < WCX + WR + 4; x++) {
        if (y === cy0 || y === cy0 + 1) {
          img.set(x, y, dpick(DSTONE, y === cy0 ? 0.62 : 0.3, x, y));
          continue;
        }
        const rip = Math.sin(x * 0.7 + y * 2.1) > 0.75 ? 0.25 : 0;
        img.set(x, y, dpick(WATER, 0.45 - (y - cy0) * 0.04 + rip + (hash(x, y, 9) < 0.04 ? 0.3 : 0), x, y));
      }
    for (let x = 0; x < WCX + WR + 4; x++) img.set(x, H - 1, dpick(STONE, 0.4, x, H - 1));
  }
  // the wheel: rim, buckets, spokes, hub — dipping into the race
  {
    const rimIn = WR - 4;
    for (let y = WCY - WR - 1; y <= WCY + WR + 1; y++)
      for (let x = WCX - WR - 1; x <= WCX + WR + 1; x++) {
        const rx = x + 0.5 - WCX;
        const ry = y + 0.5 - WCY;
        const r = Math.hypot(rx, ry);
        const a = Math.atan2(ry, rx);
        const lit = -(rx * -0.62 + ry * -0.78) / Math.max(1, r); // >0 lit (upper-left)
        let c: Color | null = null;
        if (r <= WR + 0.5 && r > rimIn) {
          // buckets / paddles between two rims
          const paddle = Math.abs(((a / (Math.PI * 2)) * 16 + 16) % 1 - 0.5) < 0.16;
          const rim = r > WR - 1 || r < rimIn + 1.2;
          if (rim) c = dpick(WOOD, 0.62 + lit * 0.3 + (r > WR - 1 ? -0.1 : 0), x, y);
          else c = paddle ? dpick(WOOD, 0.85 + lit * 0.15, x, y) : dpick(WOOD, 0.18, x, y);
        } else if (r <= rimIn) {
          const spoke = Math.abs(((a / (Math.PI * 2)) * 8 + 8) % 1 - 0.5) > 0.42 && r > 2.5;
          if (spoke) c = dpick(WOOD, 0.6 + lit * 0.25, x, y);
          else if (r < 3.2) c = r < 1.5 ? IRON[3]! : dpick(IRON, 0.55 - ry * 0.1, x, y);
        }
        if (!c) continue;
        if (y >= H - 7) c = mix(c, WATER[3]!, 0.6); // under water
        img.set(x, y, c);
      }
    img.set(WCX - 1, WCY - 1, BRASS[4]!);
    // foam where it churns the race
    for (let x = WCX - WR + 1; x <= WCX + WR - 1; x++) if (hash(x, 3, seed) < 0.55) img.set(x, H - 7 - (hash(x, 4, seed) < 0.4 ? 1 : 0), WATER[6]!);
  }
  // the flume: a wooden trough on a trestle from a sluice gate on the left, pouring onto the wheel top
  {
    const fy = WCY - WR - 7;
    const fx1 = WCX + 4;
    for (let x = 0; x <= fx1; x++) {
      img.set(x, fy, dpick(WATER, 0.8, x, fy));
      img.set(x, fy + 1, WOOD[5]!);
      for (let j = 2; j < 5; j++) img.set(x, fy + j, dpick(WOOD, 0.5 - j * 0.08 + (x % 6 === 0 ? -0.2 : 0), x, fy + j));
    }
    img.set(fx1, fy, WOOD[4]!);
    // trestle
    img.vline(3, fy + 5, H - 10, WOOD[3]!);
    img.vline(4, fy + 5, H - 10, WOOD[1]!);
    img.line(4, fy + 12, 10, fy + 5, WOOD[2]!);
    // sluice gate with its iron wheel handle
    img.rect(0, fy - 6, 4, 6, WOOD[4]!);
    img.vline(3, fy - 6, fy - 1, WOOD[1]!);
    img.vline(2, fy - 10, fy - 7, IRON[3]!);
    img.ellipse(2, fy - 11, 2.4, 1.6, (x, y, nx, ny) => (nx * nx + ny * ny > 0.3 ? IRON[3]! : null));
    // the falling water (a bright ribbon onto the buckets), splashes
    for (let y = fy + 1; y <= WCY - WR + 4; y++) {
      const x = fx1 + 1 + Math.floor((y - fy) / 3);
      img.set(x, y, WATER[6]!);
      img.set(x + 1, y, WATER[5]!);
      if (y % 2 === 0) img.set(x + 2, y, WATER[4]!);
    }
    for (const [sx, sy] of [
      [WCX + 9, WCY - WR + 2],
      [WCX + 12, WCY - WR + 4],
      [WCX + 16, WCY - 2],
      [WCX + 17, WCY + 5],
      [WCX + 16, WCY + 10],
    ] as const)
      img.set(sx, sy, WATER[6]!);
  }

  return finish(img, d, windows, chim, 'left');
};
export default art;
