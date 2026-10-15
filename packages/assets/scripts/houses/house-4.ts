// house-4 — Mossbank: a low drystone blackhouse of rounded fieldstones under a deep hipped turf roof
// (long grass, wildflowers, toadstools, a rowan sapling) with an eyebrow window peeping out of it and a stubby fieldstone chimney. A round-
// topped red door, tall sunflowers, a raised bed of cabbages and straw beehive skeps on a bench.
import { TS } from '../../src/layout.js';
import { paintWindow, wallLantern, type DoorSpec } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { hash, Img, vnoise } from '../lib/img.js';
import { BEAM, cabbage, dp, fieldstone, finish, flowerBox, frontDoor, LOGS, roundWindow, RUBBLE, skep, sunflower, TURF, type Pt } from './lib-houses-a.js';
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

  // --- drystone walls of rounded fieldstones (a turf-roofed blackhouse), timber lintels
  fieldstone(img, 3, wallTop, W - 6, H - 4 - wallTop, seed, { rh: 5, shadeX: (i) => (i < 4 ? 0.12 : i > W - 12 ? -0.22 : 0) });
  // big rounded corner stones
  for (let y = wallTop + 2; y < H - 6; y += 7)
    for (const [ex, right] of [
      [4, false],
      [W - 6, true],
    ] as const)
      img.ellipse(ex + 1, y + 2, 3.2, 2.8, (x, yy, nx, ny) => dp(['#2a2622', '#3e3932', '#565048', '#6e675c', '#878070', '#9e9684'], 0.62 - nx * 0.3 - ny * 0.35 - (right ? 0.25 : 0), x, yy));
  stonework(img, 2, H - 4, W - 4, 4, RUBBLE, '#141118', { rh: 4, sw: 6, seed: seed + 2 });

  // windows with green shutters and flower boxes
  const st = { ...style, shutters: '#3e5a32' };
  for (const wx of [17, 63]) {
    const win = paintWindow(st, 8, 8, true, seed + wx);
    for (let j = 0; j < win.h; j++) for (let i = 0; i < win.w; i++) if (win.get(i, j)[3]) img.set(wx - Math.floor(win.w / 2) + i, 64 + j, win.get(i, j));
    windows.push({ x: wx, y: 68 });
    for (let i = -7; i <= 7; i++) {
      img.set(wx + i, 62, BEAM[3]!);
      img.set(wx + i, 63, BEAM[1]!);
    }
    flowerBox(img, wx - 6, 75, 12, seed + wx, ['#e8c030', '#e8e0d0', '#c060a0', '#e8a030']);
  }

  // --- door: round-topped, poppy red, lamp on the left
  const spec: DoorSpec = { w: 12, h: 20, arched: true, kind: 'window', hinge: 'right', paint: '#8a2e22', wreath: true, seed };
  const { d, x0: dx0 } = frontDoor(img, cx, doorBottom, spec, { jamb: 2 });
  wallLantern(img, dx0 - 6, doorBottom - 20 + 9, false);
  windows.push({ x: dx0 - 5, y: doorBottom - 20 + 6 });

  // --- the turf roof: a hipped roof grown over with thick grass, held at the eave by a log
  const ridge = 15;
  const eaveY = wallTop + 4;
  const halfAt = (y: number) => {
    const f = Math.max(0, Math.min(1, (y - ridge) / (eaveY - ridge)));
    return 22 + 19 * Math.pow(f, 0.7);
  };
  for (let y = ridge - 3; y <= eaveY; y++) {
    const hw = halfAt(y);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - 40) / hw;
      const edge = 1 + (vnoise(x, y, 2.5, seed + 1) - 0.5) * 0.08;
      if (Math.abs(u) > edge) continue;
      // lumpy ridge line with tufts
      const ridgeHere = ridge + Math.round((vnoise(x, 0, 4, seed + 2) - 0.5) * 3);
      if (y < ridgeHere && !(hash(x, 1, seed) < 0.3 && y >= ridgeHere - 2)) continue;
      const f = (y - ridge) / (eaveY - ridge);
      // hip ends: the left one catches the light, the right one is in shadow
      const hipW = 22 * (1 - Math.pow(Math.max(0, f), 0.7) * 0.25);
      const lHip = x + 0.5 < 40 - hw + hipW * (1 - f) + 3;
      const rHip = x + 0.5 > 40 + hw - hipW * (1 - f) - 3;
      let v = 0.72 - f * 0.38 + (lHip ? 0.1 : 0) - (rHip ? 0.24 : 0);
      v += (vnoise(x * 2.2, y * 0.6, 2, seed + 3) - 0.5) * 0.45; // grass blades
      if (hash(x, y, seed + 4) < 0.06) v += 0.22;
      if (y < ridgeHere + 2) v += 0.12;
      img.set(x, y, dp(TURF, v, x, y));
    }
  }
  // the turf-retaining log along the eave, with round log ends
  for (let x = 0; x < W; x++) {
    img.set(x, eaveY + 1, dp(LOGS, 0.85 - (x > W - 10 ? 0.25 : 0), x, eaveY + 1));
    img.set(x, eaveY + 2, dp(LOGS, 0.55, x, eaveY + 2));
    img.set(x, eaveY + 3, dp(LOGS, 0.2, x, eaveY + 3));
    // grass hanging over it
    if (hash(x, 5, seed) < 0.5) img.set(x, eaveY + 1, dp(TURF, 0.4, x, eaveY + 1));
    if (hash(x, 6, seed) < 0.18) img.set(x, eaveY + 2, TURF[2]!);
    img.blend(x, eaveY + 4, '#05030a', 0.45);
    img.blend(x, eaveY + 5, '#05030a', 0.3);
  }
  for (const ex of [1, W - 2])
    img.ellipse(ex, eaveY + 2, 2, 2, (x, y, nx, ny) => dp(['#5a3a1c', '#8a6236', '#b08a52', '#cfae74'], (Math.hypot(nx, ny) < 0.5 ? 0.85 : 0.55) - nx * 0.3 - (ex > 40 ? 0.25 : 0), x, y));
  // wildflowers
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(hash(k, 1, seed) * W);
    const y = ridge + 2 + Math.floor(hash(k, 2, seed) * (eaveY - ridge - 4));
    if (img.alpha(x, y) === 0 || img.alpha(x, y - 1) === 0 || y > eaveY - 3) continue;
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
    [58, 21, false],
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
