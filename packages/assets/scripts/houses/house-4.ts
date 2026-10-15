// house-4 — Mossbank: a low log cottage buried under a deep rounded turf roof (grass, wildflowers,
// toadstools) with an eyebrow window peeping out of it and a stubby fieldstone chimney. A round-
// topped red door, tall sunflowers, a raised bed of cabbages and straw beehive skeps on a bench.
import { TS } from '../../src/layout.js';
import { paintWindow, wallLantern, type DoorSpec } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { hash, Img, mix, vnoise } from '../lib/img.js';
import { BEAM, cabbage, dp, finish, flowerBox, frontDoor, LOGS, roundWindow, RUBBLE, skep, sunflower, TURF, type Pt } from './lib-houses-a.js';
import type { HouseArt } from './types.js';

const SOD = ['#1a100a', '#2a1a10', '#3c2816', '#50361e'];

const art: HouseArt = (b, style, seed) => {
  const W = b.footprint.w * TS; // 80
  const H = b.footprint.h * TS + 32; // 96
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const cx = (b.door.x - b.footprint.x) * TS + 8; // 40
  const doorBottom = H - 4;
  const wallTop = 54;

  // --- log walls: horizontal logs with round ends at the corners
  for (let y = wallTop; y < H - 4; y++) {
    const row = Math.floor((y - wallTop) / 4);
    const ly = (y - wallTop) % 4;
    for (let x = 4; x < W - 4; x++) {
      let v = 0.55 + (ly === 0 ? 0.25 : ly === 3 ? -0.4 : ly === 2 ? -0.12 : 0.05) + (vnoise(x, row * 7, 6, seed) - 0.5) * 0.3;
      if (x < 8) v += 0.1;
      if (x > W - 10) v -= 0.18;
      if (hash(x, row, seed) < 0.04) v -= 0.25; // knots and checks
      img.set(x, y, dp(LOGS, v, x, y));
    }
    // log ends
    if (ly === 0)
      for (const ex of [3, W - 5]) {
        const right = ex > cx;
        img.ellipse(ex + 1, y + 2, 2.4, 2.1, (x, yy, nx, ny) => {
          const d = Math.sqrt(nx * nx + ny * ny);
          if (d > 0.82) return mix(LOGS[1]!, '#000000', 0.2);
          return dp(['#5a3a1c', '#8a6236', '#b08a52', '#cfae74'], (d < 0.4 ? 0.85 : 0.6) - nx * 0.3 - ny * 0.2 - (right ? 0.25 : 0), x, yy);
        });
      }
  }
  stonework(img, 2, H - 4, W - 4, 4, RUBBLE, '#141118', { rh: 4, sw: 6, seed: seed + 2 });

  // windows with green shutters and flower boxes
  const st = { ...style, shutters: '#3e5a32' };
  for (const wx of [17, 63]) {
    const win = paintWindow(st, 8, 8, true, seed + wx);
    for (let j = 0; j < win.h; j++) for (let i = 0; i < win.w; i++) if (win.get(i, j)[3]) img.set(wx - Math.floor(win.w / 2) + i, 64 + j, win.get(i, j));
    windows.push({ x: wx, y: 68 });
    flowerBox(img, wx - 6, 75, 12, seed + wx, ['#e8c030', '#e8e0d0', '#c060a0', '#e8a030']);
  }

  // --- door: round-topped, poppy red, lamp on the left
  const spec: DoorSpec = { w: 12, h: 20, arched: true, kind: 'window', hinge: 'right', paint: '#8a2e22', wreath: true, seed };
  const { d, x0: dx0 } = frontDoor(img, cx, doorBottom, spec, { jamb: 2 });
  wallLantern(img, dx0 - 6, doorBottom - 20 + 9, false);
  windows.push({ x: dx0 - 5, y: doorBottom - 20 + 6 });

  // --- the turf roof: a fat, rounded loaf of grass lit from the upper left
  const rcx = 40;
  const rcy = 50;
  const rx = 41;
  const ry = 44;
  const bottomEdge = (x: number) => wallTop + 5 + Math.round(2 * Math.sin(x * 0.9 + seed) + (hash(x, 3, seed) < 0.3 ? 1 : 0));
  for (let y = 4; y < wallTop + 9; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - rcx) / rx;
      const ny = (y + 0.5 - rcy) / ry;
      const lumpy = (vnoise(x, y, 3, seed + 1) - 0.5) * 0.08;
      if (Math.pow(Math.abs(nx), 2.6) + Math.pow(Math.abs(Math.min(0, ny)), 2.2) > 1 + lumpy) continue;
      const be = bottomEdge(x);
      if (y > be) continue;
      // sod edge: the cut turf shows a band of dark soil above the grass fringe
      if (y >= be - 2 && Math.abs(nx) < 0.97) {
        img.set(x, y, y === be ? SOD[0]! : dp(SOD, 0.7 - (y - be + 2) * 0.3, x, y));
        continue;
      }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - Math.min(0, ny) * Math.min(0, ny)));
      let v = 0.58 - nx * 0.32 - Math.min(0, ny) * 0.3 + nz * 0.1 - Math.max(0, (y - 44) / 20) * 0.2;
      v += (vnoise(x, y, 2.5, seed + 3) - 0.5) * 0.4;
      if (hash(x, y, seed + 4) < 0.07) v += 0.25;
      img.set(x, y, dp(TURF, v, x, y));
    }
  // grass fringe hanging over the sod edge
  for (let x = 1; x < W - 1; x++) {
    const be = bottomEdge(x);
    if (hash(x, 5, seed) < 0.55) img.set(x, be + 1, dp(TURF, 0.35, x, be + 1));
    if (hash(x, 6, seed) < 0.25) img.set(x, be + 2, TURF[1]!);
    img.blend(x, be + 2, '#05030a', 0.35);
    img.blend(x, be + 3, '#05030a', 0.25);
  }
  // wildflowers
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(hash(k, 1, seed) * W);
    const y = 8 + Math.floor(hash(k, 2, seed) * (wallTop - 8));
    if (img.alpha(x, y) === 0 || img.alpha(x, y - 1) === 0 || y > bottomEdge(x) - 4) continue;
    const c = ['#e8c030', '#f0ead8', '#c060a0', '#e8e0d0', '#8a7ad0'][k % 5]!;
    img.set(x, y, c);
    if (k % 3 === 0) img.set(x, y + 1, TURF[2]!);
  }
  // eyebrow window: the turf lifts over a little round window
  {
    const ex = 56;
    const ey = 33;
    img.ellipse(ex, ey + 1, 7, 5, (x, y, _nx, ny) => (ny > 0.2 ? dp(LOGS, 0.35, x, y) : null));
    roundWindow(img, ex, ey + 2, 3, BEAM[0]!);
    windows.push({ x: ex, y: ey + 2 });
    for (let x = ex - 9; x <= ex + 9; x++) {
      const t = (x - ex) / 9;
      const y = Math.round(ey - 3 - 3 * (1 - t * t));
      img.set(x, y, dp(TURF, 0.85 - t * 0.3, x, y));
      img.set(x, y + 1, dp(TURF, 0.5 - t * 0.3, x, y + 1));
      img.set(x, y + 2, SOD[1]!);
      if (Math.abs(t) < 0.8 && hash(x, 9, seed) < 0.5) img.set(x, y + 3, TURF[1]!);
    }
  }
  // toadstools and a sapling on the roof
  for (const [mx, my, big] of [
    [14, 30, true],
    [19, 33, false],
    [66, 18, false],
  ] as const) {
    const r = big ? 2.6 : 1.8;
    img.vline(mx, my - 1, my + 1, '#e8dcc0');
    img.ellipse(mx, my - 2, r, r * 0.7, (x, y, nx, ny) => (ny > 0.4 ? null : dp(['#5a1414', '#8a2020', '#b83228', '#d85a40'], 0.75 - nx * 0.4 - ny * 0.3, x, y)));
    img.set(mx - 1, my - 3, '#f0e8d8');
    if (big) img.set(mx + 1, my - 2, '#f0e8d8');
  }
  {
    // a little rowan sapling growing out of the turf
    const sx = 45;
    const sy = 10;
    img.vline(sx, sy, sy + 5, LOGS[2]!);
    img.ellipse(sx, sy - 1, 3.5, 3, (x, y, nx, ny) => dp(['#1c3220', '#2a4a2a', '#3e6a36', '#5a8a44'], 0.7 - nx * 0.4 - ny * 0.4 + (hash(x, y, 1) - 0.5) * 0.3, x, y));
    img.set(sx + 2, sy, '#c03030');
    img.set(sx + 1, sy + 1, '#c03030');
  }
  // stubby fieldstone chimney poking through the turf
  stonework(img, 22, 6, 8, 12, RUBBLE, '#141118', { rh: 3, sw: 4, seed: seed + 6, shade: (i) => (i < 2 ? 0.25 : i > 5 ? -0.25 : 0) });
  img.rect(21, 4, 10, 2, RUBBLE[5]!);
  img.hline(21, 30, 5, RUBBLE[3]!);
  img.rect(23, 4, 6, 1, '#0a080c');
  for (let x = 20; x <= 31; x++) if (hash(x, 7, seed) < 0.7) img.set(x, 17 + (x % 2), dp(TURF, 0.6, x, 17));
  const chim = { x: 26, y: 4 };

  // --- the garden: sunflowers, a raised bed of cabbages, skeps on a bench
  sunflower(img, 5, H - 5, 30, -1);
  sunflower(img, 10, H - 5, 24, 1);
  {
    // raised bed (left of the door)
    const bx = 12;
    const bw = 15;
    for (const [x, y, r] of [
      [bx + 3, H - 6, 3],
      [bx + 8, H - 7, 3.2],
      [bx + 12, H - 6, 2.6],
    ] as const)
      cabbage(img, x, y, r, seed + x);
    for (let i = 0; i < bw; i++) {
      img.set(bx + i, H - 6, BEAM[3]!);
      for (let j = 1; j < 5; j++) img.set(bx + i, H - 6 + j, dp(['#24180f', '#3a2618', '#523622', '#6a4630'], j === 1 ? 0.8 : 0.4 - (i % 5 === 0 ? 0.2 : 0), bx + i, H - 6 + j));
    }
    for (const x of [bx + 2, bx + 6, bx + 10])
      if (x < bx + bw - 1) {
        img.set(x, H - 7, '#e87a20');
        img.set(x, H - 8, '#4a8a3a');
        img.set(x + 1, H - 9, '#5a9a42');
      }
  }
  {
    // bench + two skeps (right)
    const bx = 56;
    for (let i = 0; i < 20; i++) {
      img.set(bx + i, H - 7, BEAM[3]!);
      img.set(bx + i, H - 6, BEAM[1]!);
    }
    for (const lx of [bx + 1, bx + 17]) img.rect(lx, H - 5, 2, 4, BEAM[1]!);
    skep(img, bx + 5, H - 8, 4.5);
    skep(img, bx + 14, H - 8, 4);
  }

  return finish(img, d, windows, chim);
};
export default art;
