// house-8 — Hearthstone, the log cabin (west-facing, door in the left side wall).
// Round-log walls with end-grain log ends at the corners, a low broad gable of board-and-batten
// under a thick, mossy cedar-shake roof, and a massive tapering fieldstone chimney built up the
// outside of the gable end. Pent hood over the side door, a woodpile, a chopping block with an axe.
import type { DoorSpec } from '../buildings.js';
import { doorHood, wallLantern } from '../buildings.js';
import { dpick, hash, Img, mix, vnoise } from '../lib/img.js';
import { barge, fieldstone, finish, glassWindow, logWall, P, put, shakes, slope, texPoly, type V2, West, westDoor, westStep } from './lib-houses-b.js';
import type { HouseArt } from './types.js';

const BOARD = ['#24160e', '#352216', '#4a3220', '#60442c', '#785838'];

const art: HouseArt = (b, _style, seed) => {
  const w = new West(b, 16);
  const { img, W, H, SW, R, windows } = w;
  const wallH = 30;
  const wallTop = H - wallH; // 66
  const LH = 5;

  // --- side wall: logs (lit)
  {
    const tex = new Img(SW, wallH);
    logWall(tex, 0, 0, SW, wallH - 2, seed + 11, LH, 0.06);
    for (let i = 0; i < SW; i++) for (const j of [wallH - 2, wallH - 1]) tex.set(i, j, dpick(P.stone, j === wallH - 2 ? 0.6 : 0.3, i, j));
    w.sideTex(tex, 0, 0.0);
  }
  // --- front wall: logs, with the plinth
  logWall(img, SW, wallTop, W - SW, wallH - 2, seed, LH, 0);
  for (let x = SW; x < W; x++) {
    img.set(x, H - 2, dpick(P.stone, 0.6, x, H - 2));
    img.set(x, H - 1, dpick(P.stone, 0.3, x, H - 1));
  }
  // log ends at both front corners (end grain rings)
  const logEnd = (x: number, y: number, r: number) => {
    img.ellipse(x, y, r, r * 0.95, (px, py, nx, ny) => {
      const d = Math.hypot(nx, ny);
      if (d > 0.82) return dpick(P.logs, 0.55 - nx * 0.3 - ny * 0.3, px, py); // bark
      const ring = Math.floor(d * 4) % 2 === 0;
      return dpick(P.endGrain, 0.7 - nx * 0.25 - ny * 0.25 - (ring ? 0.18 : 0), px, py);
    });
  };
  for (let k = 0; k * LH < wallH - 3; k++) {
    const y = wallTop + k * LH + 1.6;
    logEnd(SW + 1, y, 2.6);
    logEnd(W - 2.2, y, 2.6);
  }

  // --- front window with plank shutters and a window box
  const wx = SW + 12;
  {
    const win = glassWindow(9, 9, { bars: true, seed });
    put(img, win, (i, j) => [wx - 5 + i, wallTop + 6 + j]);
    windows.push({ x: wx, y: wallTop + 10 });
    for (const sx of [wx - 9, wx + 6])
      for (let j = 0; j < 11; j++)
        for (let i = 0; i < 4; i++) img.set(sx + i, wallTop + 6 + j, dpick(['#3a1a14', '#55261a', '#6e3422', '#8a4630'], 0.55 + (i === 0 ? 0.2 : i === 3 ? -0.3 : 0) + (j === 2 || j === 8 ? -0.35 : 0), sx + i, wallTop + 6 + j));
    // window box with herbs and marigolds
    img.rect(wx - 6, wallTop + 17, 13, 3, BOARD[2]!);
    img.hline(wx - 6, wx + 6, wallTop + 17, BOARD[4]!);
    for (let i = 0; i < 13; i++) {
      img.set(wx - 6 + i, wallTop + 16, i % 2 ? P.leaf[3]! : P.leaf[2]!);
      if (hash(i, 7, seed) < 0.55) img.set(wx - 6 + i, wallTop + 15 - (i % 2), ['#e8a030', '#f0c040', '#c05a2a'][i % 3]!);
    }
  }

  // --- side door (oxblood), step, pent hood, lamp, woodpile further back
  const spec: DoorSpec = { w: 8, h: 20, arched: false, kind: 'dutch', hinge: 'left', paint: '#7a2e24', wreath: false, seed };
  const { d, T, x0: dx0 } = westDoor(w, spec, 2, 1, seed);
  westStep(w, dx0 - 1, dx0 + spec.w);
  {
    const lx = dx0 - 4;
    const ly = w.base(lx) - 4 - spec.h + 9;
    wallLantern(img, lx, ly, true);
    windows.push({ x: lx + 1, y: ly - 3 });
  }
  // woodpile against the back of the side wall
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 3; k++) {
      const x = 0 + k * 3 + (r % 2);
      if (x + 2 > dx0 - 6) continue;
      const y = w.base(x + 1) - 1 - r * 3;
      img.rect(x, y - 1, 3, 3, P.logs[1]!);
      img.set(x + 1, y, P.endGrain[2]!);
      img.set(x, y - 1, P.endGrain[1]!);
      img.set(x + 1, y - 1, P.endGrain[3]!);
    }

  // --- roof: a low, broad gable of thick shakes with moss
  const gh = 24;
  const cx = SW + Math.floor((W - SW) / 2);
  const apex: V2 = [cx - 0.5, wallTop - gh];
  const moss = (x: number, y: number) => vnoise(x, y, 5, seed + 9) > 0.64;
  slope(img, [W + 1, wallTop + 2], apex, R, P.shakes, (ux, ly) => shakes(ux, ly, seed, 4, 4), -0.12, { moss, eaveRows: 2.5 });
  slope(img, [SW - 3, wallTop + 2], apex, R, P.shakes, (ux, ly) => shakes(ux, ly, seed + 1, 4, 4), 0.04, { moss, eaveRows: 2.5 });
  for (let x = 0; x < SW; x++) for (let j = 0; j <= 3; j++) img.blend(x, w.base(x) - wallH + 1 + j, '#05030a', 0.45);
  doorHood(img, T, spec, 'pent', P.shakes);
  // gable: vertical board and batten
  texPoly(
    img,
    [
      [SW + 1, wallTop + 1],
      [apex[0] + 0.5, apex[1] + 3],
      [W - 1, wallTop + 1],
    ],
    (t) => {
      for (let y = Math.floor(apex[1]); y <= wallTop + 1; y++)
        for (let x = SW; x < W; x++) {
          const lu = (x - SW) % 5;
          let v = 0.5 + (hash(Math.floor((x - SW) / 5), 1, seed) - 0.5) * 0.2 + (vnoise(x, y, 5, seed) - 0.5) * 0.15;
          if (lu === 0) v = 0.82;
          else if (lu === 1) v = 0.25;
          v += x < SW + 4 ? 0.08 : x > W - 5 ? -0.12 : 0;
          t.set(x, y, dpick(BOARD, v, x, y));
        }
    },
  );
  img.blendRect(SW + 1, wallTop, W - SW - 2, 2, '#05030a', 0.4);
  // small gable window + a pair of antlers above it
  {
    const gx = cx - 7;
    const gy = wallTop - 13;
    const win = glassWindow(5, 5, { bars: true, seed: seed + 3 });
    put(img, win, (i, j) => [gx - 3 + i, gy + j]);
    windows.push({ x: gx, y: gy + 3 });
    const ay = gy - 3;
    const A = '#d8c8a8';
    const A2 = '#a8987a';
    img.rect(gx - 1, ay, 2, 2, P.beam[3]!);
    for (const s of [-1, 1]) {
      const ox = s < 0 ? gx - 1 : gx;
      img.set(ox + s * 1, ay, A);
      img.set(ox + s * 2, ay - 1, A);
      img.set(ox + s * 3, ay - 2, A);
      img.set(ox + s * 3, ay - 3, A2);
      img.set(ox + s * 2, ay - 3, A2);
      img.set(ox + s * 4, ay - 3, A);
      img.set(ox + s * 4, ay - 4, A2);
    }
  }
  // thick verge: the roof's slab edge along both gable sides
  barge(img, [apex[0] + 0.5, apex[1] - 1], [SW - 3, wallTop + 3], P.shakes, 5, 0.05);
  barge(img, [apex[0] + 0.5, apex[1] - 1], [W, wallTop + 3], P.shakes, 5, -0.12);
  // moss tufts along the verge
  for (let k = 0; k < 14; k++) {
    const t = hash(k, 2, seed);
    const s = k % 2 ? 1 : -1;
    const x = apex[0] + 0.5 + s * t * (s < 0 ? apex[0] - SW + 3 : W - apex[0]);
    const y = apex[1] - 3 + t * (gh + 4);
    if (hash(k, 3, seed) < 0.5) img.set(x, y, P.leaf[3]!), img.set(x + 1, y, P.leaf[2]!);
  }

  // --- the great fieldstone chimney up the outside of the gable end
  let chim: { x: number; y: number } | null = null;
  {
    const top = 14;
    const shoulder1 = wallTop + 4;
    const shoulder2 = wallTop - 16;
    const span = (y: number): [number, number] => (y >= shoulder1 ? [W - 15, W - 1] : y >= shoulder2 ? [W - 13, W - 2] : [W - 12, W - 4]);
    const stoneImg = new Img(W, H);
    fieldstone(stoneImg, W - 16, top, 16, H - top, seed + 21, (i) => (i < 4 ? 0.12 : i > 11 ? -0.18 : 0));
    for (let y = top; y < H; y++) {
      const [a, z] = span(y);
      for (let x = a; x <= z; x++) {
        let c = stoneImg.get(x, y);
        if (x === a) c = mix(c, '#fff1cc', 0.12);
        if (x === z) c = mix(c, '#0b0714', 0.25);
        img.set(x, y, c);
      }
    }
    // sloped weatherings at the shoulders
    for (const sy of [shoulder1, shoulder2]) {
      const [a, z] = span(sy);
      const [a2, z2] = span(sy - 1);
      for (let x = a; x <= z; x++) {
        img.set(x, sy, dpick(P.dstone, x < a2 || x > z2 ? 0.75 : 0.45, x, sy));
        if (x >= a2 && x <= z2) continue;
        img.set(x, sy + 1, dpick(P.dstone, 0.35, x, sy + 1));
      }
    }
    // the cap: a flat stone slab on corner stones, the flue dark between
    const [a, z] = span(top);
    img.rect(a - 1, top - 2, z - a + 3, 2, P.dstone[3]!);
    img.hline(a - 1, z + 1, top - 2, P.dstone[5]!);
    img.rect(a, top - 4, 2, 2, P.river[4]!);
    img.rect(z - 1, top - 4, 2, 2, P.river[2]!);
    img.rect(a - 1, top - 5, z - a + 3, 1, P.dstone[4]!);
    img.rect(a + 2, top - 4, z - a - 3, 2, '#0a080c');
    chim = { x: Math.round((a + z) / 2), y: top - 4 };
    // soot stains below the cap
    for (let x = a; x <= z; x++) for (let k = 0; k < 4; k++) img.blend(x, top + k, '#0a080c', 0.3 - k * 0.07);
  }

  // chopping block with an axe at the front-left corner
  {
    const sx = SW + 3;
    const by = H - 1;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) img.set(sx + i, by - j, dpick(P.logs, j === 4 ? 0.9 : 0.5 + (i < 2 ? 0.15 : i > 4 ? -0.2 : 0), sx + i, by - j));
    img.hline(sx + 1, sx + 5, by - 4, P.endGrain[3]!);
    img.hline(sx, sx + 6, by - 5, P.endGrain[1]!);
    // the axe, handle leaning right, head bitten into the block
    img.line(sx + 3, by - 5, sx + 7, by - 11, P.logs[4]!);
    img.rect(sx + 1, by - 7, 3, 2, P.iron[4]!);
    img.set(sx + 1, by - 7, '#c8c4d0');
  }

  return finish(img, windows, d, 'left', chim);
};
export default art;
