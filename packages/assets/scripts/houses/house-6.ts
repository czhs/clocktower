// house-6 — the Lantern-maker's (Candlewick; west-facing, door in the left side wall).
// A tall, steep, jettied Tudor gable: ochre plaster between close-set dark studs, a carved
// bressumer beam with a row of glowing lanterns hung beneath it, a candle-shop window, scalloped
// bargeboards with a finial and a great brass lantern hung in the gable. Red tile roof, brick stack.
import type { DoorSpec } from '../buildings.js';
import { chimney, wallLantern } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { type Color, dpick, hash, Img, mix } from '../lib/img.js';
import { barge, finish, glassWindow, hangLantern, P, plaster, put, slope, texPoly, type V2, West, westDoor, westStep } from './lib-houses-b.js';
import type { HouseArt } from './types.js';

const BEAMS = ['#140c08', '#21140d', '#301e14', '#42291b', '#563724'];
const LANTERN_TONES = ['#ffd27a', '#f0a050', '#ffe0a0', '#e88a6a', '#f8c060'];

function studs(img: Img, x0: number, y0: number, w: number, h: number, every: number, seed: number) {
  for (let x = x0 + 1; x < x0 + w - 1; x += every)
    for (let y = y0; y < y0 + h; y++) {
      img.set(x, y, dpick(BEAMS, 0.7 + (hash(x, y, seed) - 0.5) * 0.2, x, y));
      img.set(x + 1, y, dpick(BEAMS, 0.35, x + 1, y));
    }
}

const art: HouseArt = (b, _style, seed) => {
  const w = new West(b, 16);
  const { img, W, H, SW, R, windows } = w;
  const wallH = 34;
  const wallTop = H - wallH; // 62
  const jetty = H - 19; // bressumer rows jetty, jetty+1; ground floor below
  const FX0 = SW; // upper storey spans FX0..W-1
  const GX0 = SW; // ground floor (the jetty reads from the beam + its shadow)
  const GX1 = W - 1;
  const roof = P.redTile;

  // --- side wall (lit): close studding over ochre plaster, stone plinth
  {
    const tex = new Img(SW, wallH);
    plaster(tex, 0, 0, SW, wallH, P.ochre, seed + 11, (i) => (i > SW - 3 ? -0.1 : 0));
    studs(tex, 0, 2, SW, wallH - 6, 5, seed);
    for (let i = 0; i < SW; i++) {
      tex.set(i, 0, BEAMS[3]!);
      tex.set(i, 1, BEAMS[1]!);
      tex.set(i, 15, BEAMS[3]!);
      tex.set(i, 16, BEAMS[1]!);
    }
    stonework(tex, 0, wallH - 5, SW, 5, P.stone, '#141118', { rh: 5, sw: 6, seed: seed + 3 });
    w.sideTex(tex, 0, 0.03);
  }

  // --- front: ground floor (set back), shopfront with candles
  stonework(img, GX0, H - 4, GX1 - GX0 + 1, 4, P.stone, '#141118', { rh: 4, sw: 7, seed: seed + 2 });
  for (let y = jetty + 2; y < H - 4; y++)
    for (let x = GX0; x <= GX1; x++) img.set(x, y, dpick(BEAMS, 0.55 + (x - GX0 < 2 ? 0.2 : 0) - (GX1 - x < 2 ? 0.25 : 0) + ((x - GX0) % 4 === 3 ? -0.2 : 0), x, y));
  img.blendRect(GX0, jetty + 2, GX1 - GX0 + 1, 2, '#05030a', 0.55); // shadow under the jetty
  // shop window full of candles
  {
    const x0 = GX0 + 4;
    const x1 = GX1 - 4;
    const y0 = jetty + 5;
    const y1 = H - 6;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const v = 0.48 - (y - y0) * 0.02 + Math.max(0, 0.2 - Math.abs(x - (x0 + x1) / 2) / 40);
        img.set(x, y, dpick(['#1a0c0a', '#3a1c10', '#6e3a18', '#a8601e', '#d89038'], v, x, y));
      }
    // a shelf, candles of different heights on it and on the sill
    const shelf = y0 + 5;
    for (let x = x0; x <= x1; x++) img.set(x, shelf, BEAMS[3]!);
    for (const base of [shelf - 1, y1])
      for (let x = x0 + 1; x <= x1 - 1; x += 2) {
        if (hash(x, base, seed) < 0.18) continue;
        const hgt = 1 + Math.floor(hash(x, base, seed + 1) * 3);
        const wax = hash(x, base, seed + 2) < 0.25 ? '#e8b0a0' : hash(x, base, seed + 3) < 0.2 ? '#c8d0a0' : '#f0e6cc';
        for (let k = 0; k < hgt; k++) img.set(x, base - k, k === hgt - 1 ? mix(wax, '#ffffff', 0.2) : wax);
        img.set(x, base - hgt, '#ffe9a0');
        if (hash(x, base, seed + 5) < 0.4) img.set(x, base - hgt - 1, '#ffb43a');
      }
    // frame and glazing bars
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      img.set(x0 - 1, y, BEAMS[0]!);
      img.set(x1 + 1, y, BEAMS[0]!);
    }
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      img.set(x, y0 - 1, BEAMS[0]!);
      img.set(x, y1 + 1, P.dstone[4]!);
    }
    for (let x = x0 + 5; x < x1; x += 6) for (let y = y0; y <= y1; y++) img.set(x, y, BEAMS[1]!);
    windows.push({ x: Math.round((x0 + x1) / 2), y: y0 + 4 });
  }

  // --- jettied upper storey
  plaster(img, FX0, wallTop, W - FX0, jetty - wallTop, P.ochre, seed, (i) => (i < 3 ? 0.08 : i > W - FX0 - 4 ? -0.12 : 0));
  studs(img, FX0, wallTop + 2, W - FX0, jetty - wallTop - 2, 4, seed + 1);
  // two leaded casements breaking the studs
  for (const cxw of [FX0 + 10, W - 11]) {
    const win = glassWindow(6, 7, { diamond: true, seed: seed + cxw });
    put(img, win, (i, j) => [cxw - 4 + i, wallTop + 4 + j]);
    windows.push({ x: cxw - 1, y: wallTop + 8 });
  }
  for (let x = FX0; x < W; x++) {
    img.set(x, wallTop, BEAMS[4]!);
    img.set(x, wallTop + 1, BEAMS[2]!);
  }
  // the carved bressumer beam with joist ends below
  for (let x = FX0 - 1; x <= W - 1; x++) {
    img.set(x, jetty, dpick(BEAMS, 0.95, x, jetty));
    img.set(x, jetty + 1, dpick(BEAMS, (x + seed) % 3 === 0 ? 0.25 : 0.6, x, jetty + 1));
  }
  for (let x = FX0 + 1; x < W - 1; x += 4) {
    img.set(x, jetty + 2, BEAMS[2]!);
    img.set(x + 1, jetty + 2, BEAMS[1]!);
  }
  // lanterns hanging under the jetty
  {
    const xs = [FX0 + 3, FX0 + 13, W - 14, W - 4];
    xs.forEach((x, k) => {
      const cord = 1 + ((k * 2) % 3);
      windows.push(hangLantern(img, x, jetty + 2, cord, LANTERN_TONES[k % LANTERN_TONES.length]!));
    });
  }

  // --- side door (deep teal), step, lamp, candle sign
  const spec: DoorSpec = { w: 8, h: 20, arched: false, kind: 'planks', hinge: 'left', paint: '#2f5a5a', wreath: false, seed };
  const { d, x0: dx0 } = westDoor(w, spec, 2, 1, seed);
  westStep(w, dx0 - 1, dx0 + spec.w);
  {
    const lx = dx0 - 4;
    const ly = w.base(lx) - 4 - spec.h + 9;
    wallLantern(img, lx, ly, true);
    windows.push({ x: lx + 1, y: ly - 3 });
  }
  // a little candle-maker's tally: three hanging candles by the back of the side wall
  for (let k = 0; k < 3; k++) {
    const x = 1 + k * 2;
    const y = w.base(x) - 27;
    img.set(x, y, '#5a4a30');
    img.vline(x, y + 1, y + 4 + k, '#f0e6cc');
    img.set(x, y + 5 + k, '#d8ccb0');
  }
  img.hline(0, 6, w.base(3) - 28, BEAMS[3]!);

  // --- roof: steep gable
  const gh = 32;
  const cx = FX0 + Math.floor((W - FX0) / 2); // 43
  const apex: V2 = [cx - 0.5, wallTop - gh];
  const tiles = (ux: number, ly: number) => {
    const row = Math.floor(ly / 3);
    const off = (row % 2) * 2;
    let v = (hash(Math.floor((ux + off) / 4), row, seed) - 0.5) * 0.25;
    if (ly % 3 === 2) v -= 0.32;
    else if ((ux + off) % 4 === 0) v -= 0.2;
    return v;
  };
  slope(img, [W + 1, wallTop + 1], apex, R, roof, tiles, -0.12);
  slope(img, [SW - 2, wallTop + 1], apex, R, roof, tiles, 0.03);
  for (let x = 0; x < SW; x++) for (let j = 0; j <= 2; j++) img.blend(x, w.base(x) - wallH + 1 + j, '#05030a', 0.42);
  // ridge crest tiles
  for (let k = 0; k <= SW; k++) {
    const x = Math.round(apex[0]) - k;
    const y = Math.round(apex[1]) - Math.floor((k + 1) / 2);
    img.set(x, y, roof[6]!);
    if (k % 3 === 0) img.set(x, y - 1, roof[5]!);
  }
  // gable infill: ochre plaster, king post + arched braces, a round light
  const half = (W - FX0) / 2;
  texPoly(
    img,
    [
      [FX0 + 1, wallTop + 1],
      [apex[0] + 0.5, apex[1] + 3],
      [W - 1, wallTop + 1],
    ],
    (t) => {
      plaster(t, FX0, apex[1], W - FX0, wallTop - apex[1] + 2, P.ochre, seed + 7, (i) => (i < 4 ? 0.08 : i > W - FX0 - 5 ? -0.1 : 0));
      for (let y = Math.round(apex[1]); y < wallTop + 1; y++) {
        t.set(cx - 1, y, BEAMS[3]!);
        t.set(cx, y, BEAMS[1]!);
      }
      const cb = wallTop - 9;
      for (let x = FX0; x < W; x++) {
        t.set(x, cb, BEAMS[3]!);
        t.set(x, cb + 1, BEAMS[1]!);
      }
      // curved braces from the collar beam down to the posts (an arch either side of the king post)
      for (let k = 0; k <= 8; k++) {
        const yy = cb + 2 + Math.round(8 - Math.sqrt(64 - k * k));
        for (const s of [-1, 1]) {
          const xx = s < 0 ? cx - 2 - k : cx + 1 + k;
          t.set(xx, yy, BEAMS[2]!);
          t.set(xx, yy + 1, BEAMS[1]!);
        }
      }
    },
  );
  img.blendRect(FX0 + 2, wallTop, W - FX0 - 4, 1, '#05030a', 0.3);
  // round light in the gable
  const ry = Math.round(apex[1] + gh * 0.5);
  img.ellipse(cx - 0.5, ry, 4, 4, (x, y, nx, ny) => (nx * nx + ny * ny > 0.55 ? BEAMS[0]! : dpick(P.glass, 0.85 - ny * 0.3, x, y)));
  img.vline(cx - 1, ry - 3, ry + 2, BEAMS[1]!);
  img.hline(cx - 4, cx + 2, ry - 1, BEAMS[1]!);
  windows.push({ x: cx - 1, y: ry });
  // the great brass lantern on a scrolled bracket below the round light (the trade sign)
  {
    const by = ry + 6;
    img.hline(cx - 4, cx + 2, by, P.iron[3]!);
    img.set(cx - 5, by - 1, P.iron[3]!);
    img.set(cx + 3, by - 1, P.iron[3]!);
    img.set(cx - 1, by + 1, P.iron[2]!);
    const ly0 = by + 2;
    // cap
    img.hline(cx - 2, cx, ly0, P.brass[4]!);
    img.hline(cx - 3, cx + 1, ly0 + 1, P.brass[3]!);
    // glass body
    for (let j = 0; j < 5; j++)
      for (let i = -3; i <= 1; i++) img.set(cx - 1 + i + 1, ly0 + 2 + j, i === -3 || i === 1 ? P.brass[2]! : dpick(P.glass, 0.95 - j * 0.08, cx + i, ly0 + 2 + j));
    img.hline(cx - 3, cx + 1, ly0 + 7, P.brass[2]!);
    img.set(cx - 1, ly0 + 8, P.brass[3]!);
    windows.push({ x: cx - 1, y: ly0 + 4 });
  }
  // scalloped bargeboards + finial
  barge(img, [apex[0] + 0.5, apex[1]], [SW - 2, wallTop + 2], BEAMS, 4, 0.1);
  barge(img, [apex[0] + 0.5, apex[1]], [W, wallTop + 2], BEAMS, 4, -0.05);
  for (const s of [-1, 1]) {
    const x1 = s < 0 ? SW - 2 : W;
    for (let t = 0.12; t < 0.97; t += 0.075) {
      const x = apex[0] + 0.5 + (x1 - apex[0] - 0.5) * t;
      const y = apex[1] + (wallTop + 2 - apex[1]) * t + 2;
      img.set(x, y, BEAMS[2]!);
      img.set(x + s * -0.6, y + 1, BEAMS[3]!);
    }
  }
  img.vline(cx - 1, apex[1] - 6, apex[1] - 1, BEAMS[3]!);
  img.set(cx - 2, apex[1] - 3, BEAMS[2]!);
  img.set(cx, apex[1] - 3, BEAMS[2]!);
  img.set(cx - 1, apex[1] - 7, P.brass[4]!);
  // a string of paper lanterns draped along the right bargeboard
  {
    const tones: Color[] = ['#e05a4a', '#f0b040', '#e8806a', '#d8c060'];
    for (let k = 0; k < 4; k++) {
      const t = 0.3 + k * 0.17;
      const x = Math.round(apex[0] + 0.5 + (W - 1 - apex[0]) * t);
      const y = Math.round(apex[1] + (wallTop + 2 - apex[1]) * t) + 3;
      img.set(x, y, P.iron[1]!);
      img.rect(x - 1, y + 1, 3, 3, tones[k]!);
      img.set(x - 1, y + 1, mix(tones[k]!, '#fff1cc', 0.5));
      img.vline(x + 1, y + 1, y + 3, mix(tones[k]!, '#3a0a10', 0.35));
    }
  }

  // --- brick chimney stack on the ridge, toward the back
  let chim: { x: number; y: number } | null = null;
  {
    const u = 0.72;
    const ccx = Math.round(apex[0] + R[0] * u);
    const ry2 = Math.round(apex[1] + R[1] * u);
    chim = chimney(img, ccx, Math.max(1, ry2 - 16), ry2 + 3, 'brick', 2, seed);
  }

  return finish(img, windows, d, 'left', chim);
};
export default art;
