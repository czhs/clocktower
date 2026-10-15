// house-7 — the Toadstool (Briarfield; west-facing: its door is on the left of the round stalk).
// A whitewashed round stalk under a great crimson toadstool cap with ivory spots, a round green
// door with a lantern hung from the cap's rim, porthole windows, an eyebrow dormer in the cap, a
// crooked stovepipe and climbing briar roses. The only round silhouette in the village.
import type { DoorSpec } from '../buildings.js';
import { doorAssembly } from '../buildings.js';
import { LX, LY } from '../lib/draw.js';
import { type Color, dpick, hash, Img, vnoise } from '../lib/img.js';
import { briar, finish, hangLantern, P } from './lib-houses-b.js';
import type { HouseArt } from './types.js';

const STALK = ['#4a4038', '#6a5e50', '#8c806c', '#aea28a', '#cac0a4', '#e2dabe'];
const TRIM = ['#14100c', '#24190f', '#3a2818', '#543a22', '#6e4e2e'];

const art: HouseArt = (b, _style, seed) => {
  const W = b.footprint.w * 16;
  const H = b.footprint.h * 16 + 32;
  const img = new Img(W, H);
  const windows: { x: number; y: number }[] = [];

  // --- the stalk: a slightly flared cylinder
  const cx = 34;
  const hwB = 24; // half width at the ground
  const ryB = 6; // depth of the base ellipse
  const cyB = H - 1 - ryB;
  const stalkTop = 54;
  const hw = (y: number) => 20 + 4 * Math.pow(Math.max(0, (y - stalkTop) / (cyB - stalkTop)), 2.2);
  const ground = (x: number) => {
    const n = (x + 0.5 - cx) / hwB;
    return Math.floor(cyB + ryB * Math.sqrt(Math.max(0, 1 - n * n)));
  };
  for (let y = stalkTop; y < H; y++)
    for (let x = 0; x < W; x++) {
      const h = hw(Math.min(y, cyB));
      const nx = (x + 0.5 - cx) / h;
      if (Math.abs(nx) > 1) continue;
      if (y > ground(x)) continue;
      const nz = Math.sqrt(1 - nx * nx);
      let v = 0.52 + nx * LX * 0.55 + nz * 0.18 - 0.05;
      v += (vnoise(x * 2.2, y * 0.25, 3, seed) - 0.5) * 0.14; // fibrous streaks
      if (hash(x, y, seed) < 0.02) v -= 0.15;
      const gy = ground(x) - y;
      if (gy < 4) v -= (4 - gy) * 0.07; // damp, mossy foot
      let c: Color = dpick(STALK, v, x, y);
      if (gy < 3 && vnoise(x, y, 2.5, seed + 4) > 0.5) c = dpick(P.leaf, 0.4 + nx * -0.2, x, y);
      img.set(x, y, c);
    }

  // --- round green door on the left of the stalk, following the curve of the base
  const DW = 9;
  const DH = 19;
  const dx0 = 15;
  const spec: DoorSpec = { w: DW, h: DH, arched: true, kind: 'planks', hinge: 'left', paint: '#4e7a3e', wreath: false, seed };
  const T = (i: number, j: number): [number, number] => {
    const x = dx0 + i;
    return [x, ground(x) - 3 - (DH - 1 - j)];
  };
  const d = doorAssembly(img, T, spec, 1, seed);
  // a flat round stepping stone
  img.ellipse(dx0 + DW / 2, ground(dx0 + 4) - 1, 7, 2.2, (x, y, nx, ny) => dpick(P.dstone, 0.85 - ny * 0.35 - nx * 0.1, x, y));
  for (let i = 0; i < DW; i++) {
    const [x, y] = T(i, DH - 1);
    img.set(x, y + 1, dpick(P.dstone, 0.9, x, y + 1));
    img.set(x, y + 2, dpick(P.dstone, 0.6, x, y + 2));
  }

  // porthole windows (foreshortened toward the right)
  const port = (px: number, py: number, r: number) => {
    const n = (px - cx) / hw(py);
    const rx = Math.max(1.6, r * Math.sqrt(1 - n * n));
    img.ellipse(px, py, rx + 1.2, r + 1.2, (x, y, nx, ny) => dpick(TRIM, 0.75 - nx * 0.3 - ny * 0.4, x, y));
    img.ellipse(px, py, rx, r, (x, y, nx, ny) => dpick(P.glass, 0.95 - ny * 0.35 - Math.abs(nx) * 0.15, x, y));
    img.vline(Math.floor(px), Math.ceil(py - r), Math.floor(py + r - 1), TRIM[1]!);
    if (r >= 4) img.hline(Math.ceil(px - rx), Math.floor(px + rx - 1), Math.floor(py), TRIM[1]!);
    // sill
    img.hline(Math.round(px - rx - 1), Math.round(px + rx), Math.round(py + r + 1), P.dstone[4]!);
    windows.push({ x: Math.round(px), y: Math.round(py) });
  };
  port(39, 86, 5);
  port(53.5, 80, 3.5);
  // climbing briar roses on the stalk's right flank
  briar(img, 44, 66, 16, 44, seed + 3, 0.55, (x, y) => img.alpha(x, y) > 0 && Math.abs(x + 0.5 - cx) < hw(y) - 0.5 && !(Math.abs(x - 53.5) < 4.5 && Math.abs(y - 80) < 5.5) && !(Math.abs(x - 39) < 7 && Math.abs(y - 86) < 7));

  // --- the cap: a flattened dome with a rolled rim, lit from the upper left
  const ccx = 32;
  const cyC = 57;
  const ryC = 46;
  const rimD = 8;
  const top = (x: number) => {
    const n = (x + 0.5 - ccx) / 32;
    return cyC - ryC * Math.pow(Math.max(0, 1 - n * n), 0.42);
  };
  const rim = (x: number) => {
    const n = (x + 0.5 - ccx) / 32;
    return cyC + rimD * Math.sqrt(Math.max(0, 1 - n * n));
  };
  // shadow of the cap on the stalk
  for (let x = 0; x < W; x++) for (let k = 0; k < 7; k++) img.blend(x, Math.floor(rim(x)) + 1 + k, '#120a1a', 0.62 - k * 0.08);
  const capShade = (x: number, y: number) => {
    const nx = (x + 0.5 - ccx) / 32;
    const ny = Math.max(-1, Math.min(1, (y + 0.5 - cyC) / ryC));
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return 0.5 + (nx * LX + ny * LY) * 0.5 + nz * 0.22 - 0.08;
  };
  for (let x = 0; x < W; x++) {
    const t = top(x);
    const r = rim(x);
    for (let y = Math.ceil(t); y <= Math.floor(r); y++) {
      let v = capShade(x, y) + (vnoise(x, y, 4, seed + 1) - 0.5) * 0.12;
      const fromRim = r - y;
      if (fromRim < 1) v = 0.05; // the underside edge
      else if (fromRim < 3) v += 0.12; // rolled lip catching light
      else if (fromRim < 4) v -= 0.18;
      img.set(x, y, dpick(P.capRed, v, x, y));
    }
  }
  // gills peeking under the lip (front only)
  for (let x = 4; x < W - 4; x++) {
    const y = Math.floor(rim(x)) + 1;
    if (x % 2 === 0) img.set(x, y, dpick(P.gill, 0.6 - Math.abs(x - 32) / 64, x, y));
    else img.set(x, y, P.gill[0]!);
  }
  // ivory spots, foreshortened across the dome
  const spots: [number, number, number][] = [
    [18, 25, 5.5],
    [38, 18, 4],
    [52, 30, 4.5],
    [28, 39, 5],
    [8, 42, 3.2],
    [45, 47, 3],
    [58, 46, 2.2],
    [3, 53, 2],
    [18, 52, 3],
    [33, 52, 2.2],
    [44, 23, 2],
    [26, 15, 2.4],
    [10, 30, 2],
  ];
  for (const [sx, sy, r] of spots) {
    const nx = (sx - ccx) / 32;
    const ny = (sy - cyC) / ryC;
    const rx = r * Math.sqrt(Math.max(0.15, 1 - nx * nx)) + 0.4;
    const ry = r * 0.82 * Math.sqrt(Math.max(0.2, 1 - ny * ny * 0.6)) + 0.4;
    img.ellipse(sx, sy, rx, ry, (x, y, ex, ey) => {
      if (y < top(x) + 0.5 || y > rim(x) - 3) return null;
      const v = capShade(x, y) + 0.12 - (ex + ey) * 0.18 + (hash(x, y, seed + 2) < 0.1 ? -0.1 : 0);
      return dpick(P.spot, v, x, y);
    });
  }
  // eyebrow dormer in the cap: a round light under a little hood of cap
  {
    const ox = 41;
    const oy = 36;
    img.ellipse(ox, oy + 1, 6, 4.5, (x, y, nx, ny) => (ny < 0.2 ? dpick(P.capRed, capShade(x, y) + 0.25 - ny * 0.1, x, y) : null));
    img.ellipse(ox, oy + 3, 4.2, 3.6, (x, y) => dpick(TRIM, 0.5, x, y));
    img.ellipse(ox, oy + 3.4, 3, 2.6, (x, y, nx, ny) => dpick(P.glass, 0.95 - ny * 0.3, x, y));
    img.vline(ox, oy + 1, oy + 5, TRIM[1]!);
    img.hline(ox - 5, ox + 4, oy + 6, P.capRed[1]!);
    windows.push({ x: ox, y: oy + 3 });
  }
  // a crooked stovepipe through the cap, with a little conical hat
  let chim: { x: number; y: number } | null = null;
  {
    const px = 50;
    const py = Math.ceil(top(px)) + 4;
    const seg = (x: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let i = 0; i < 3; i++) img.set(x + i, y, P.iron[i === 0 ? 4 : i === 1 ? 3 : 1]!);
    };
    seg(px, py - 7, py);
    seg(px + 1, py - 10, py - 7);
    seg(px + 2, py - 14, py - 10);
    img.hline(px - 1, px + 3, py - 4, P.iron[2]!);
    for (let j = 0; j < 3; j++) img.hline(px + 1 - j, px + 4 + j, py - 17 + j, j === 2 ? P.iron[1]! : P.iron[3]!);
    img.set(px + 3, py - 18, P.iron[3]!);
    chim = { x: px + 3, y: py - 18 };
  }
  // the door lantern, hung from the cap's rim on a long cord
  windows.push(hangLantern(img, 12, Math.ceil(rim(12)) + 1, 12, '#ffd27a'));

  // garden: a rose briar bush at the right foot, little toadstools by the step
  briar(img, 50, 96, 14, 16, seed + 9, 0.9, (x, y) => (x - 57) * (x - 57) / 49 + (y - 106) * (y - 106) / 64 < 1 && y <= H - 2);
  const toad = (x: number, y: number, r: number) => {
    img.vline(x, y - r, y, STALK[4]!);
    img.ellipse(x + 0.5, y - r - 0.5, r + 0.5, r * 0.6 + 0.4, (px, py, nx, ny) => (ny > 0.3 ? null : dpick(P.capRed, 0.7 - nx * 0.3 - ny * 0.3, px, py)));
    img.set(x - 1, y - r - 1, P.spot[4]!);
  };
  toad(4, H - 3, 2);
  toad(8, H - 2, 1.5);
  toad(29, H - 1, 1.5);

  return finish(img, windows, d, 'left', chim);
};
export default art;

