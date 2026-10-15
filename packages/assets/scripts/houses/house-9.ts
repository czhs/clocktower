// house-9 — the Clockmaker's (Gloamend; south-facing, door in the middle of the front).
// A crow-stepped brick gable rising through a verdigris copper standing-seam roof, a big clock
// dial in the gable crowned by a gilded gear finial, two bow shop windows full of clock faces and
// pendulums, a brass cog sign hung from the gable, twin lamps by a fanlit door.
import type { DoorSpec } from '../buildings.js';
import { chimney, doorAssembly, wallLantern } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { dpick, hash, Img, mix } from '../lib/img.js';
import { dial, finish, gear, P } from './lib-houses-b.js';
import type { HouseArt } from './types.js';

const BRICK = ['#2e1616', '#421e1c', '#552824', '#6a342c', '#7e4234', '#925440'];
const ASHLAR = ['#26222e', '#332e3c', '#423c4c', '#524b5c', '#655d6e', '#7a7282'];
const WOOD = ['#1a1010', '#2a1814', '#3e241c', '#543226', '#6a4232'];
const VELVET = ['#120a14', '#1e0e1c', '#2e1424', '#441c2c'];

const art: HouseArt = (b, _style, seed) => {
  const W = b.footprint.w * 16; // 80
  const H = b.footprint.h * 16 + 16; // 80
  const img = new Img(W, H);
  const windows: { x: number; y: number }[] = [];
  const dx = (b.door.x - b.footprint.x) * 16 + 8; // 40: door centre
  const wallH = 34;
  const wallTop = H - wallH; // 46
  const roofTop = 16;
  const roofBottom = wallTop + 2;

  // --- facade: dark ashlar with quoins and a plinth
  stonework(img, 2, wallTop, W - 4, wallH - 4, ASHLAR, '#16131c', { rh: 5, sw: 10, seed, shade: (i) => (i < 3 ? 0.15 : i > W - 8 ? -0.15 : 0) });
  stonework(img, 1, H - 4, W - 2, 4, P.stone, '#141118', { rh: 4, sw: 7, seed: seed + 2 });
  for (let y = wallTop; y < H - 4; y += 5)
    for (let j = 0; j < 4; j++) {
      const long = ((y - wallTop) / 5) % 2 === 0;
      for (let i = 0; i < (long ? 5 : 3); i++) {
        img.set(2 + i, y + j, dpick(P.dstone, j === 0 ? 0.85 : 0.65, 2 + i, y + j));
        img.set(W - 3 - i, y + j, dpick(P.dstone, j === 0 ? 0.5 : 0.32, W - 3 - i, y + j));
      }
    }

  // --- two bow shop windows full of clocks
  const bow = (x0: number, seedK: number) => {
    const bw = 19;
    const gy0 = wallTop + 9;
    const gh = 14;
    // stall riser (panelled) and sill
    for (let j = 0; j < 6; j++)
      for (let i = 0; i < bw; i++) {
        const x = x0 + i;
        const y = gy0 + gh + 1 + j;
        const panel = j >= 1 && j <= 4 && (i % 6 !== 0 && i % 6 !== 5);
        img.set(x, y, dpick(WOOD, panel ? 0.45 - (j === 1 ? 0.15 : 0) : 0.75, x, y));
      }
    img.hline(x0 - 1, x0 + bw, gy0 + gh, P.dstone[4]!);
    img.hline(x0 - 1, x0 + bw, gy0 + gh + 1, P.dstone[2]!);
    // velvet-dark interior, a lamp glow low in the middle
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < bw; i++) {
        const x = x0 + i;
        const y = gy0 + j;
        const glow = Math.max(0, 1 - Math.hypot((i - bw / 2) / (bw * 0.55), (j - gh * 0.75) / (gh * 0.5)));
        img.set(x, y, glow > 0.4 ? dpick(['#2a140e', '#4e2614', '#7a4218', '#a8601e'], glow * 0.85 - 0.2, x, y) : dpick(VELVET, 0.3 + glow * 0.8, x, y));
      }
    // transom bar near the top
    img.hline(x0, x0 + bw - 1, gy0 + 3, WOOD[1]!);
    // a tall case clock with a brass pendulum, one big dial, a little carriage clock
    const left = seedK % 2 === 0;
    const tc = left ? x0 + 2 : x0 + bw - 6;
    for (let j = 4; j < gh; j++) for (let i = 0; i < 4; i++) img.set(tc + i, gy0 + j, dpick(WOOD, 0.6 + (i === 0 ? 0.25 : i === 3 ? -0.3 : 0), tc + i, gy0 + j));
    img.rect(tc + 1, gy0 + 5, 2, 2, '#ece4cc');
    img.set(tc + 2, gy0 + 5, '#b0a68c');
    img.rect(tc + 1, gy0 + 8, 2, 4, '#1a0c10');
    img.set(tc + 1 + (seedK % 2), gy0 + 10, P.brass[4]!);
    img.set(tc + 1 + (seedK % 2), gy0 + 11, P.brass[3]!);
    const bx = left ? x0 + 11 : x0 + 7;
    dial(img, bx + 0.5, gy0 + 7.5, 3.5, 1.2 + seedK * 2, 4 + seedK);
    // carriage clock on the sill
    const cc = left ? x0 + 15 : x0 + 2;
    img.rect(cc, gy0 + gh - 4, 3, 4, P.brass[3]!);
    img.set(cc, gy0 + gh - 4, P.brass[5]!);
    img.set(cc + 1, gy0 + gh - 3, '#ece4cc');
    img.set(cc + 1, gy0 + gh - 5, P.brass[2]!);
    // frame
    for (let j = -1; j <= gh; j++) {
      img.set(x0 - 1, gy0 + j, WOOD[0]!);
      img.set(x0 + bw, gy0 + j, WOOD[0]!);
    }
    // copper canopy over the bow
    for (let j = 0; j < 4; j++)
      for (let i = -2 + (3 - j); i < bw + 2 - (3 - j); i++) {
        const x = x0 + i;
        const y = gy0 - 5 + j;
        img.set(x, y, j === 3 ? P.copper[0]! : dpick(P.copper, 0.85 - j * 0.15 + ((x - x0) % 4 === 0 ? -0.2 : 0), x, y));
      }
    windows.push({ x: x0 + Math.floor(bw / 2), y: gy0 + 6 });
  };
  bow(7, 0);
  bow(W - 7 - 19, 1);

  // --- door: deep red panel door under a fanlight, pale surround, step, lamps either side
  const DW = 12;
  const DH = 20;
  const dx0 = dx - DW / 2;
  const doorBottom = H - 4;
  const spec: DoorSpec = { w: DW, h: DH, arched: false, kind: 'window', hinge: 'right', paint: '#5e1e26', wreath: false, seed };
  const T = (i: number, j: number): [number, number] => [dx0 + i, doorBottom - (DH - 1) + j];
  const d = doorAssembly(img, T, spec, 2, seed);
  // fanlight (half-round, above the door head)
  {
    const fy = doorBottom - DH - 2;
    img.ellipse(dx, fy, 8, 6, (x, y, nx, ny) => (ny > 0 ? null : nx * nx + ny * ny > 0.62 ? dpick(P.dstone, 0.8 - nx * 0.2, x, y) : dpick(P.glass, 0.85 + ny * 0.2, x, y)));
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) img.line(dx - 0.5, fy, dx - 0.5 + Math.sin(a) * 5, fy - Math.cos(a) * 4, WOOD[1]!);
    windows.push({ x: dx, y: fy - 2 });
  }
  for (let j = 0; j < 3; j++)
    for (let i = -3 - (j > 0 ? 1 : 0); i < DW + 3 + (j > 0 ? 1 : 0); i++) {
      const x = dx0 + i;
      const y = doorBottom + 1 + j;
      img.set(x, y, j === 0 ? dpick(P.dstone, 0.85 + (hash(x, y, 4) - 0.5) * 0.15, x, y) : dpick(P.dstone, j === 1 ? 0.45 : 0.25, x, y));
    }
  wallLantern(img, dx0 - 6, doorBottom - DH + 9, true);
  wallLantern(img, dx0 + DW + 4, doorBottom - DH + 9, false);
  windows.push({ x: dx0 - 5, y: doorBottom - DH + 6 }, { x: dx0 + DW + 5, y: doorBottom - DH + 6 });

  // --- copper standing-seam hip roof
  {
    const inset = 14;
    for (let y = roofTop; y <= roofBottom; y++) {
      const f = (y - roofTop) / (roofBottom - roofTop);
      const ins = Math.round(inset * (1 - f));
      for (let x = ins; x <= W - 1 - ins; x++) {
        let v = 0.78 - f * 0.4;
        const seam = (x + 1) % 5 === 0;
        if (seam) v += 0.18;
        else if ((x + 2) % 5 === 0) v -= 0.12;
        if (x - ins < 3) v += 0.12; // hip edges
        if (W - 1 - ins - x < 3) v -= 0.18;
        if (y - roofTop < 2) v = 0.95;
        // patina streaks
        if (hash(x, Math.floor(y / 3), seed) < 0.06) v += 0.15;
        img.set(x, y, dpick(P.copper, v, x, y));
      }
    }
    img.hline(0, W - 1, roofBottom, P.copper[0]!);
    img.hline(0, W - 1, roofBottom - 1, P.copper[2]!);
    img.blendRect(2, roofBottom + 1, W - 4, 3, '#05030a', 0.45);
  }
  // brick chimney on the right of the roof
  const chim = chimney(img, W - 20, 4, roofTop + 12, 'brick', 1, seed);

  // --- the crow-stepped gable (brick, pale coping on each step)
  {
    const gx0 = dx - 20;
    const gx1 = dx + 19;
    const steps = 3;
    const sw = 5; // step width
    const top = 9;
    const stepH = Math.floor((wallTop - top) / (steps + 1));
    const edgeAt = (y: number) => {
      // inner x offset of the gable outline at row y (staircase)
      const k = Math.min(steps, Math.max(0, Math.floor((wallTop - y) / stepH)));
      return k * sw;
    };
    for (let y = top; y < wallTop + 1; y++) {
      const e = edgeAt(y);
      for (let x = gx0 + e; x <= gx1 - e; x++) {
        const i = x - gx0;
        img.set(x, y, dpick(BRICK, 0.5 + (i < 3 ? 0.12 : 0) - (gx1 - x < 3 ? 0.15 : 0) + ((y % 3 === 2 || (x + (Math.floor(y / 3) % 2) * 3) % 6 === 0) ? -0.35 : 0) + (hash(x, y, seed) - 0.5) * 0.18, x, y));
      }
    }
    // coping stones on each step tread + the step risers
    for (let k = 0; k <= steps; k++) {
      const y = wallTop - (k + 1) * stepH + (k === steps ? 0 : 0);
      const ty = k === steps ? top : y + 1;
      const e = k * sw;
      for (const s of [-1, 1]) {
        const xa = s < 0 ? gx0 + e - 1 : gx1 - e - sw + 1;
        const len = k === steps ? 0 : sw + 1;
        for (let i = 0; i < len; i++) {
          img.set(xa + i, ty, dpick(P.dstone, 0.95, xa + i, ty));
          img.set(xa + i, ty + 1, dpick(P.dstone, 0.55, xa + i, ty + 1));
        }
      }
    }
    const tx0 = gx0 + steps * sw - 1;
    const tx1 = gx1 - steps * sw + 1;
    for (let x = tx0; x <= tx1; x++) {
      img.set(x, top - 1, dpick(P.dstone, 0.95, x, top - 1));
      img.set(x, top, dpick(P.dstone, 0.55, x, top));
    }
    // the gilded gear finial on the top step
    gear(img, dx - 0.5, top - 5, 4.6, 8, P.brass, 0.3);
    // a small lancet light below the finial
    img.rect(dx - 2, top + 3, 3, 6, '#0b0810');
    img.set(dx - 1, top + 2, '#0b0810');
    img.rect(dx - 1, top + 5, 1, 3, P.glass[3]!);
    windows.push({ x: dx - 1, y: top + 6 });
    // the clock dial in the gable (five to midnight, like the tower — it keeps the same time)
    const cy = wallTop - 15;
    img.ellipse(dx - 0.5, cy, 9.5, 9.5, (x, y, nx, ny) => dpick(P.dstone, 0.8 - nx * 0.25 - ny * 0.25, x, y));
    dial(img, dx - 0.5, cy, 7.5, -Math.PI / 36, -Math.PI / 6);
    img.ellipse(dx - 0.5, cy, 9.5, 9.5, (x, y, nx, ny) => (nx * nx + ny * ny > 0.84 ? dpick(P.dstone, 0.85 - nx * 0.3 - ny * 0.3, x, y) : null));
    windows.push({ x: dx, y: cy });
    // little cogs either side of the dial
    gear(img, dx - 14, cy + 8, 2.8, 6, P.brass, 0.3);
    gear(img, dx + 13, cy + 8, 2.8, 6, P.brass, 0.3);
    // the brass cog sign hung from an iron bracket off the gable's lower-left step
    const by = wallTop - stepH + 2;
    const bx = gx0 - 1;
    for (let k = 0; k <= 10; k++) img.set(bx - k, by, P.iron[2]!);
    img.line(bx - 1, by + 4, bx - 6, by, P.iron[2]!);
    img.set(bx - 10, by - 1, P.iron[3]!);
    img.vline(bx - 8, by + 1, by + 2, P.iron[3]!);
    gear(img, bx - 7.5, by + 8, 5.5, 10, P.brass, 0.32);
  }


  return finish(img, windows, d, 'right', chim);
};
export default art;
