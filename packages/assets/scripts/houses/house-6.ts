// house-6 — the Lantern-maker's (Candlewick; west-facing, door in the left side wall).
// A tall, steep gable of soot-dark weatherboards with bone-white trim under a fish-scale plum
// slate roof — and lanterns everywhere: strings of coloured lanterns swagged down both
// bargeboards, a row hung from the shop canopy, a great brass lantern for a sign in the gable,
// more along the side eave. The candle-shop window glows beneath. Dark house, many small lights.
import type { DoorSpec } from '../buildings.js';
import { chimney, wallLantern } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { type Color, dpick, hash, Img, mix } from '../lib/img.js';
import { barge, finish, glassWindow, hangLantern, P, put, scales, slope, texPoly, type V2, West, westDoor, westStep } from './lib-houses-b.js';
import type { HouseArt } from './types.js';

const BOARDS = ['#120e16', '#1c1620', '#272030', '#342b3c', '#43384c', '#56495e'];
const BONE = ['#4a4236', '#6e6450', '#9a8e74', '#c4b896', '#e2d8b8'];
const TONES: Color[] = ['#ffd27a', '#f08a5a', '#ffe0a0', '#e86a7a', '#f8c060', '#f0a0b0'];

/** Horizontal weatherboards: 3-row boards, lit lip on top, shadow under the lap. */
function weatherboards(img: Img, x0: number, y0: number, w: number, h: number, seed: number, bias = 0, shade: (i: number) => number = () => 0) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const y = y0 + j;
      const r = (y + 300) % 3;
      const board = Math.floor((y + 300) / 3);
      let v = r === 0 ? 0.7 : r === 1 ? 0.5 : 0.26;
      v += (hash(Math.floor((x + board * 7) / 9), board, seed) - 0.5) * 0.16 + bias + shade(i);
      if ((x + board * 5) % 13 === 0 && r !== 0) v -= 0.12; // butt joints
      img.set(x, y, dpick(BOARDS, v, x, y));
    }
}

const art: HouseArt = (b, _style, seed) => {
  const w = new West(b, 16);
  const { img, W, H, SW, R, windows } = w;
  const wallH = 34;
  const wallTop = H - wallH; // 62
  const roof = P.plum;

  // --- side wall (lit): weatherboards, bone corner board, stone plinth
  {
    const tex = new Img(SW, wallH);
    weatherboards(tex, 0, 0, SW, wallH, seed + 11, 0.08);
    stonework(tex, 0, wallH - 4, SW, 4, P.stone, '#141118', { rh: 4, sw: 6, seed: seed + 3 });
    for (let j = 0; j < wallH - 4; j++) tex.set(SW - 1, j, dpick(BONE, 0.45, SW - 1, j));
    w.sideTex(tex, 0, 0.02);
  }
  // --- front wall
  weatherboards(img, SW, wallTop, W - SW, wallH - 4, seed, 0, (i) => (i < 3 ? 0.08 : i > W - SW - 4 ? -0.1 : 0));
  stonework(img, SW, H - 4, W - SW, 4, P.stone, '#141118', { rh: 4, sw: 7, seed: seed + 2 });
  for (let y = wallTop; y < H - 4; y++) {
    img.set(SW, y, dpick(BONE, 0.85, SW, y));
    img.set(SW + 1, y, dpick(BONE, 0.6, SW + 1, y));
    img.set(W - 2, y, dpick(BONE, 0.4, W - 2, y));
    img.set(W - 1, y, dpick(BONE, 0.2, W - 1, y));
  }

  // --- the candle-shop window (ground floor)
  const cx = SW + Math.floor((W - SW) / 2); // 43
  {
    const x0 = SW + 5;
    const x1 = W - 6;
    const y0 = H - 16;
    const y1 = H - 7;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const v = 0.5 - (y - y0) * 0.02 + Math.max(0, 0.22 - Math.abs(x - (x0 + x1) / 2) / 40);
        img.set(x, y, dpick(['#1a0c0a', '#3a1c10', '#6e3a18', '#a8601e', '#d89038'], v, x, y));
      }
    const shelf = y0 + 4;
    for (let x = x0; x <= x1; x++) img.set(x, shelf, P.beam[3]!);
    for (const base of [shelf - 1, y1])
      for (let x = x0 + 1; x <= x1 - 1; x += 2) {
        if (hash(x, base, seed) < 0.2) continue;
        const hgt = 1 + Math.floor(hash(x, base, seed + 1) * (base === y1 ? 4 : 2));
        const wax = hash(x, base, seed + 2) < 0.25 ? '#e8b0a0' : hash(x, base, seed + 3) < 0.2 ? '#c8d0a0' : '#f0e6cc';
        for (let k = 0; k < hgt; k++) img.set(x, base - k, wax);
        img.set(x, base - hgt, '#ffe9a0');
      }
    // bone frame + glazing bars + sill
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      img.set(x0 - 1, y, BONE[2]!);
      img.set(x1 + 1, y, BONE[1]!);
    }
    for (let x = x0 - 1; x <= x1 + 1; x++) img.set(x, y0 - 1, BONE[2]!);
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      img.set(x, y1 + 1, BONE[4]!);
      img.set(x, y1 + 2, BONE[1]!);
    }
    for (let x = x0 + 5; x < x1; x += 6) for (let y = y0; y <= y1; y++) img.set(x, y, BONE[1]!);
    windows.push({ x: cx, y: y0 + 3 });
  }
  // the shop canopy (plum slate pent) with lanterns hung from its edge
  {
    const cy0 = H - 23;
    for (let j = 0; j < 4; j++)
      for (let x = SW - 1; x <= W - 1; x++) {
        const y = cy0 + j;
        img.set(x, y, j === 3 ? roof[0]! : dpick(roof, 0.92 - j * 0.2 + ((x + j) % 4 === 0 && j > 0 ? -0.18 : 0), x, y));
      }
    img.blendRect(SW + 2, cy0 + 4, W - SW - 3, 1, '#05030a', 0.45);
    const xs = [SW + 4, SW + 12, SW + 20, SW + 29, W - 4];
    xs.forEach((x, k) => {
      const g = hangLantern(img, x, cy0 + 4, 1 + (k % 2) * 2, TONES[k % TONES.length]!);
      if (k === 0 || k === xs.length - 1) windows.push(g);
    });
  }
  // upper-storey lancet windows with bone frames
  for (const wx of [SW + 9, W - 12]) {
    const win = glassWindow(5, 8, { arch: true, bars: true, seed: seed + wx, frame: BONE[1] });
    put(img, win, (i, j) => [wx - 3 + i, wallTop + 3 + j]);
    windows.push({ x: wx - 1, y: wallTop + 8 });
    img.hline(wx - 4, wx + 2, wallTop + 13, BONE[3]!);
  }

  // --- side door (mustard gold), step, lamp, little lanterns along the side eave
  const spec: DoorSpec = { w: 8, h: 20, arched: true, kind: 'panel', hinge: 'left', paint: '#a8782a', wreath: false, seed };
  const { d, x0: dx0 } = westDoor(w, spec, 2, 1, seed);
  westStep(w, dx0 - 1, dx0 + spec.w);
  {
    const lx = dx0 - 4;
    const ly = w.base(lx) - 4 - spec.h + 9;
    wallLantern(img, lx, ly, true);
    windows.push({ x: lx + 1, y: ly - 3 });
  }

  // --- roof: a very steep gable, fish-scale slates
  const gh = 34;
  const apex: V2 = [cx - 0.5, wallTop - gh];
  slope(img, [W + 1, wallTop + 1], apex, R, roof, (ux, ly) => scales(ux, ly, seed), -0.1);
  slope(img, [SW - 2, wallTop + 1], apex, R, roof, (ux, ly) => scales(ux, ly, seed + 1), 0.06);
  for (let x = 0; x < SW; x++) for (let j = 0; j <= 2; j++) img.blend(x, w.base(x) - wallH + 1 + j, '#05030a', 0.42);
  // lanterns hung along the side eave
  for (const x of [3, 9]) hangLantern(img, x, w.base(x) - wallH + 2, 1 + (x % 3), TONES[(x + 2) % TONES.length]!);
  // gable infill
  texPoly(
    img,
    [
      [SW + 1, wallTop + 1],
      [apex[0] + 0.5, apex[1] + 3],
      [W - 1, wallTop + 1],
    ],
    (t) => weatherboards(t, SW, Math.floor(apex[1]), W - SW, wallTop - Math.floor(apex[1]) + 2, seed + 7, 0.02, (i) => (i < 4 ? 0.08 : i > W - SW - 5 ? -0.1 : 0)),
  );
  img.blendRect(SW + 2, wallTop, W - SW - 4, 1, '#05030a', 0.3);
  // quatrefoil light high in the gable
  const qy = Math.round(apex[1] + gh * 0.42);
  {
    for (const [ox, oy] of [
      [0, -2],
      [0, 2],
      [-2, 0],
      [2, 0],
    ] as const)
      img.ellipse(cx - 0.5 + ox, qy + oy, 2.2, 2.2, BONE[2]!);
    for (const [ox, oy] of [
      [0, -2],
      [0, 2],
      [-2, 0],
      [2, 0],
    ] as const)
      img.ellipse(cx - 0.5 + ox, qy + oy, 1.3, 1.3, (x, y) => dpick(P.glass, 0.9 - (y - qy) * 0.06, x, y));
    img.rect(cx - 2, qy - 1, 3, 3, P.glass[3]!);
    windows.push({ x: cx - 1, y: qy });
  }
  // the great brass lantern on a scrolled bracket: the trade sign
  {
    const by = qy + 7;
    img.hline(cx - 5, cx + 3, by, P.iron[3]!);
    img.set(cx - 6, by - 1, P.iron[3]!);
    img.set(cx + 4, by - 1, P.iron[3]!);
    img.set(cx - 7, by - 2, P.iron[2]!);
    img.set(cx + 5, by - 2, P.iron[2]!);
    img.set(cx - 1, by + 1, P.iron[2]!);
    const ly0 = by + 2;
    img.hline(cx - 2, cx, ly0, P.brass[4]!);
    img.hline(cx - 3, cx + 1, ly0 + 1, P.brass[3]!);
    img.hline(cx - 4, cx + 2, ly0 + 2, P.brass[2]!);
    for (let j = 0; j < 6; j++)
      for (let i = -3; i <= 1; i++) img.set(cx + i, ly0 + 3 + j, i === -3 || i === 1 ? P.brass[i === -3 ? 3 : 1]! : dpick(P.glass, 1 - j * 0.08 - (i === 0 ? 0.1 : 0), cx + i, ly0 + 3 + j));
    img.hline(cx - 4, cx + 2, ly0 + 9, P.brass[2]!);
    img.set(cx - 1, ly0 + 10, P.brass[3]!);
    img.set(cx - 1, ly0 + 11, P.brass[4]!);
    windows.push({ x: cx - 1, y: ly0 + 5 });
  }
  // bone-white bargeboards with a drop pendant and a spike finial
  barge(img, [apex[0] + 0.5, apex[1]], [SW - 2, wallTop + 2], BONE, 4, 0.05);
  barge(img, [apex[0] + 0.5, apex[1]], [W, wallTop + 2], BONE, 4, -0.2);
  img.vline(cx - 1, apex[1] - 6, apex[1] + 6, BONE[2]!);
  img.set(cx - 1, apex[1] + 7, BONE[3]!);
  img.set(cx - 1, apex[1] - 7, P.brass[4]!);
  // strings of coloured lanterns swagged down both bargeboards
  for (const s of [-1, 1]) {
    const ex = s < 0 ? SW - 1 : W - 1;
    const p0: V2 = [apex[0] + 0.5 + s, apex[1] + 5];
    const p1: V2 = [ex - s * 2, wallTop + 1];
    const n = 4;
    let prev: V2 | null = null;
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const sag = Math.sin(t * Math.PI * n) ** 2 * 2.5;
      const pt: V2 = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t + sag + 2];
      if (prev) img.line(prev[0], prev[1], pt[0], pt[1], '#7a6a52');
      prev = pt;
    }
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = Math.round(p0[0] + (p1[0] - p0[0]) * t);
      const y = Math.round(p0[1] + (p1[1] - p0[1]) * t + 2 + 2.5);
      const tone = TONES[(k * 2 + (s > 0 ? 1 : 0)) % TONES.length]!;
      img.rect(x - 1, y, 3, 3, tone);
      img.set(x - 1, y, mix(tone, '#fff6e0', 0.5));
      img.vline(x + 1, y, y + 2, mix(tone, '#3a0a10', 0.35));
      img.set(x, y + 3, P.iron[1]!);
    }
  }

  // --- slim stone chimney on the ridge, toward the back
  let chim: { x: number; y: number } | null = null;
  {
    const u = 0.75;
    const ccx = Math.round(apex[0] + R[0] * u);
    const ry2 = Math.round(apex[1] + R[1] * u);
    chim = chimney(img, ccx, Math.max(1, ry2 - 12), ry2 + 3, 'stone', 1, seed);
  }

  return finish(img, windows, d, 'left', chim);
};
export default art;
