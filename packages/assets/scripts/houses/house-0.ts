// house-0 — the Stargazer's Tower: a round rubble-stone tower-house under a tall violet fish-scale
// cone with a brass moon-and-star finial and a telescope poking out of a little lucarne. A stone
// lean-to (woodpile) hugs its left side and a half-timbered wing with the chimney sits on its right.
// The tallest silhouette at the left end of the top row, framing the square with Ravenscroft.
import { TS } from '../../src/layout.js';
import { chimney, paintWindow, roof, ROOFS, timberFrame, wallLantern, wallTexture, woodpile, type DoorSpec } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { hash, Img } from '../lib/img.js';
import { BEAM, BRASS, cone, cylinder, dp, finish, flowerBox, frontDoor, GLASS, IRON, LEAF, PURPLE_SLATE, roundWindow, WARM_RUBBLE as RUBBLE, type Pt } from './lib-houses-a.js';
import type { HouseArt } from './types.js';

const art: HouseArt = (b, style, seed) => {
  const W = b.footprint.w * TS; // 80
  const H = b.footprint.h * TS + 48; // 112
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const cx = (b.door.x - b.footprint.x) * TS + 8; // 40: door (and tower) centre
  const doorBottom = H - 4;
  const r = 21;
  const MORTAR = '#141118';

  // --- left lean-to (stone, pent roof sloping away from the tower)
  stonework(img, 2, 82, cx - r + 4 - 2, H - 4 - 82, RUBBLE, MORTAR, { rh: 4, sw: 7, seed: seed + 1, shade: (i) => (i < 3 ? 0.15 : 0) });
  for (let x = 0; x <= cx - r + 3; x++) {
    const t = x / (cx - r + 3);
    const y0 = Math.round(80 - t * 8);
    for (let y = y0; y <= 82; y++) img.set(x, y, dp(ROOFS.slate!, 0.75 - (y - y0) * 0.1 + (x % 5 === 0 ? -0.15 : 0), x, y));
    img.set(x, 83, ROOFS.slate![0]!);
  }
  {
    const w = paintWindow({ ...style, shutters: '#2f4f63' }, 6, 6, false, seed + 3);
    for (let j = 0; j < w.h; j++) for (let i = 0; i < w.w; i++) if (w.get(i, j)[3]) img.set(7 + i, 88 + j, w.get(i, j));
    windows.push({ x: 11, y: 92 });
  }
  woodpile(img, 3, H - 1, 12);

  // --- right wing (half-timbered, side roof, chimney)
  const wx0 = cx + r - 4;
  wallTexture(img, wx0, 80, W - 2 - wx0, H - 4 - 80, 'plaster', seed + 4);
  timberFrame(img, wx0, 80, W - 2 - wx0, H - 4 - 80, [{ x: 64, w: 14 }], seed + 4);
  roof(img, { ...style, roof: 'slate' }, wx0 - 4, W - 1, 64, 81, 7, seed + 8);
  img.blendRect(wx0, 82, W - 2 - wx0, 2, '#05030a', 0.45);
  {
    const w = paintWindow({ ...style, shutters: '#2f4f63' }, 8, 8, true, seed + 5);
    for (let j = 0; j < w.h; j++) for (let i = 0; i < w.w; i++) if (w.get(i, j)[3]) img.set(65 + i, 88 + j, w.get(i, j));
    windows.push({ x: 72, y: 92 });
    flowerBox(img, 65, 99, 14, seed, ['#e8e0d0', '#a040a0', '#e8e0d0', '#c0304a']);
  }
  const chim = chimney(img, 72, 44, 70, 'stone', 1, seed);

  // --- the tower body
  cylinder(img, cx, r, 46, H - 9, RUBBLE, MORTAR, { seed, rh: 5, bw: 9, arc: 3 });
  // plinth: a course of bigger, paler footing stones
  cylinder(img, cx, r + 1.5, H - 13, H - 3, RUBBLE.slice(1), MORTAR, { seed: seed + 9, rh: 5, bw: 12, arc: 3 });
  // a string course (moulding) at the first floor
  for (let x = cx - r; x < cx + r; x++) {
    const nx = (x + 0.5 - cx) / r;
    const c = Math.sqrt(Math.max(0, 1 - nx * nx));
    const y = Math.round(80 + 3 * c);
    img.set(x, y, dp(RUBBLE, 0.95 - nx * 0.5, x, y));
    img.set(x, y + 1, dp(RUBBLE, 0.35 - nx * 0.3, x, y + 1));
  }
  // ivy climbing the lit flank
  for (let y = 58; y < H - 6; y++) {
    const reach = 6 - (y < 70 ? (70 - y) * 0.4 : 0) + Math.sin(y * 0.7) * 1.5;
    for (let i = 0; i < reach; i++) {
      const x = cx - r + i + (y < 84 ? 0 : 1);
      if (hash(x, y, seed + 6) < 0.35 + i * 0.08) continue;
      img.set(x, y, dp(LEAF, 0.4 + hash(x, y, 2) * 0.5, x, y));
    }
  }

  // tall arched window (first floor) + a stair slit
  {
    const x0 = cx - 11;
    const y0 = 55;
    const ww = 7;
    const hh = 12;
    for (let j = -1; j <= hh; j++)
      for (let i = -1; i <= ww; i++) {
        const arch = j < 3 && Math.hypot(i + 0.5 - ww / 2, (3 - j) * 1.1) > ww / 2 + 0.6;
        if (arch) continue;
        const edge = i < 0 || i >= ww || j < 0 || j >= hh;
        img.set(x0 + i, y0 + j, edge ? dp(RUBBLE, i < ww / 2 ? 0.95 : 0.6, x0 + i, y0 + j) : dp(GLASS, 0.92 - j / 22 - Math.abs(i - 3) * 0.04, x0 + i, y0 + j));
      }
    img.vline(x0 + 3, y0 + 1, y0 + hh - 1, BEAM[1]!);
    img.hline(x0, x0 + ww - 1, y0 + 6, BEAM[1]!);
    img.hline(x0 - 2, x0 + ww + 1, y0 + hh + 1, RUBBLE[6]!);
    windows.push({ x: x0 + 3, y: y0 + 6 });
    // stair slit, lower right
    img.rect(cx + 9, 66, 3, 8, '#0b0810');
    img.rect(cx + 10, 68, 1, 5, GLASS[2]!);
    img.set(cx + 10, 69, GLASS[3]!);
    img.hline(cx + 8, cx + 12, 74, RUBBLE[5]!);
    windows.push({ x: cx + 10, y: 70 });
  }

  // --- door (arched, deep teal-blue), stoop, lamp
  const spec: DoorSpec = { w: 12, h: 20, arched: true, kind: 'panel', hinge: 'left', paint: '#2f4f63', wreath: false, seed };
  const { d, x0: dx0 } = frontDoor(img, cx, doorBottom, spec, { jamb: 2 });
  wallLantern(img, dx0 + 12 + 4, doorBottom - 20 + 9, true);
  windows.push({ x: dx0 + 12 + 5, y: doorBottom - 20 + 6 });

  // --- eave shadow + corbel ring, then the cone
  for (let x = cx - r; x < cx + r; x++) {
    const nx = (x + 0.5 - cx) / r;
    const c = Math.sqrt(Math.max(0, 1 - nx * nx));
    const y = Math.round(46 + 3 * c);
    for (let k = 0; k < 5; k++) img.blend(x, y + k, '#05030a', 0.55 - k * 0.1);
    if (Math.round(x - cx) % 5 === 0) {
      img.set(x, y + 1, RUBBLE[5]!);
      img.set(x, y + 2, RUBBLE[3]!);
    }
  }
  cone(img, cx, 7, 45, 27, 6, PURPLE_SLATE, { seed: seed + 2, rowH: 4, colW: 5, fish: true });
  // eave lip
  for (let x = cx - 27; x <= cx + 27; x++) {
    const nx = (x + 0.5 - cx) / 27.5;
    if (Math.abs(nx) > 1) continue;
    const y = Math.round(45 + 6 * Math.sqrt(1 - nx * nx));
    img.set(x, y, PURPLE_SLATE[0]!);
    img.set(x, y - 1, dp(PURPLE_SLATE, 0.5 - nx * 0.3, x, y - 1));
  }

  // lucarne with a brass telescope
  {
    const lx = cx + 7;
    const ly = 26;
    // cheeks + face (rubble), lit window, little gabled slate hood
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) img.set(lx + i, ly + j, dp(RUBBLE, (i < 2 ? 0.75 : i > 5 ? 0.3 : 0.5) + (hash(i, j, 3) - 0.5) * 0.2, lx + i, ly + j));
    img.rect(lx + 2, ly + 2, 4, 5, '#0b0810');
    img.rect(lx + 2, ly + 3, 4, 4, GLASS[3]!);
    img.set(lx + 2, ly + 3, GLASS[2]!);
    img.vline(lx + 4, ly + 3, ly + 6, BEAM[1]!);
    for (let j = 0; j < 6; j++)
      for (let i = -2; i <= 9; i++) {
        const half = j + 0.6;
        const dxm = Math.abs(i + 0.5 - 4);
        if (dxm > half) continue;
        const left = i + 0.5 < 4;
        const y = ly - 5 + j;
        img.set(lx + i, y, dp(PURPLE_SLATE, (left ? 0.92 : 0.42) + (j === 5 ? -0.3 : 0) + (dxm < 0.6 ? 0.1 : 0), lx + i, y));
      }
    img.hline(lx - 1, lx + 8, ly + 1, PURPLE_SLATE[0]!);
    img.blendRect(lx, ly + 8, 8, 2, '#05030a', 0.45);
    windows.push({ x: lx + 4, y: ly + 4 });
    // the telescope: brass tube angled up and right
    for (let k = 0; k < 9; k++) {
      const x = lx + 5 + k;
      const y = ly + 4 - Math.round(k * 0.55);
      img.set(x, y, BRASS[k > 6 ? 4 : 3]!);
      img.set(x, y + 1, BRASS[1]!);
    }
    img.set(lx + 14, ly - 1, BRASS[4]!);
    img.set(lx + 14, ly, BRASS[2]!);
  }
  // a small round window low on the cone, left
  roundWindow(img, cx - 9, 36, 2.5, PURPLE_SLATE[0]!);
  windows.push({ x: cx - 9, y: 36 });

  // finial: rod, brass ball, crescent moon and a star
  img.vline(cx, 4, 8, IRON[3]!);
  img.set(cx - 1, 6, BRASS[3]!);
  img.set(cx, 6, BRASS[4]!);
  img.set(cx - 1, 7, BRASS[2]!);
  img.set(cx, 7, BRASS[2]!);
  const moon: [number, number][] = [
    [-2, 0], [-3, 1], [-3, 2], [-2, 3], [-1, 3], [-4, 1], [-4, 2], [-3, 0], [-3, 3], [-2, 4], [-3, -1],
  ];
  for (const [i, j] of moon) img.set(cx + i + 1, j, j < 2 ? BRASS[4]! : BRASS[3]!);
  img.set(cx + 2, 1, BRASS[4]!);
  img.set(cx + 3, 0, BRASS[3]!);
  img.set(cx + 3, 2, BRASS[3]!);
  img.set(cx + 4, 1, BRASS[3]!);
  img.set(cx + 3, 1, '#fff0c0');

  return finish(img, d, windows, chim);
};
export default art;
