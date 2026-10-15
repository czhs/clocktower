// house-3 — Ravenscroft: a gothic house of pale ashlar. A steep central gable with a glowing rose
// window and twin lancets rises over a pointed oak door; two lower wings with iron ridge cresting
// and tall lancet windows flank it, stepped buttresses between. Crows perch on the finial, the
// ridge and the chimney; ivy climbs the shaded corner.
import { TS } from '../../src/layout.js';
import { CLAY, ivy, wallLantern, type DoorSpec } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { hash, Img, mix } from '../lib/img.js';
import { ASHLAR, crow, DARK_SLATE, dp, DSTONE, finish, IRON, lancet, pointedDoor, roseWindow, stoop, type Pt } from './lib-houses-a.js';
import type { HouseArt } from './types.js';

const art: HouseArt = (b, _style, seed) => {
  const W = b.footprint.w * TS; // 80
  const H = b.footprint.h * TS + 48; // 112
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const cx = (b.door.x - b.footprint.x) * TS + 8; // 40
  const doorBottom = H - 4;
  const MORTAR = '#24212a';
  const ash = (x: number, y: number, w: number, h: number, s: number, shade?: (i: number, j: number) => number) =>
    stonework(img, x, y, w, h, ASHLAR, MORTAR, { rh: 5, sw: 10, seed: s, shade: shade ?? ((i) => (i < 3 ? 0.12 : i > w - 4 ? -0.18 : 0)) });

  // --- wings: walls, then hipped slate roofs with iron cresting
  const wingTop = 64;
  ash(2, wingTop, 20, H - 4 - wingTop, seed + 1);
  ash(58, wingTop, 20, H - 4 - wingTop, seed + 2, (i) => (i > 15 ? -0.25 : -0.08));
  stonework(img, 1, H - 4, W - 2, 4, ASHLAR.slice(0, 5), MORTAR, { rh: 4, sw: 12, seed: seed + 3 });
  const slate = (x0: number, x1: number, top: number, bottom: number, insetL: number, insetR: number, s: number) => {
    for (let y = top; y <= bottom; y++) {
      const f = (y - top) / (bottom - top);
      const l = x0 + Math.round(insetL * (1 - f));
      const r = x1 - Math.round(insetR * (1 - f));
      for (let x = l; x <= r; x++) {
        const ly = y - top;
        const off = (Math.floor(ly / 3) % 2) * 2;
        let v = 0.78 - f * 0.45 + (hash(Math.floor((x + off) / 4), Math.floor(ly / 3), s) - 0.5) * 0.18;
        if (ly % 3 === 2) v -= 0.3;
        else if ((x + off) % 4 === 0) v -= 0.18;
        if (x < l + 3) v += 0.12;
        if (x > r - 3) v -= 0.2;
        img.set(x, y, dp(DARK_SLATE, v, x, y));
      }
    }
    for (let x = x0; x <= x1; x++) {
      img.set(x, bottom, DARK_SLATE[0]!);
      img.set(x, bottom - 1, DARK_SLATE[3]!);
    }
  };
  slate(0, 26, 44, wingTop + 2, 10, 0, seed + 4);
  slate(54, 79, 44, wingTop + 2, 0, 10, seed + 5);
  img.blendRect(2, wingTop + 3, 20, 3, '#05030a', 0.45);
  img.blendRect(58, wingTop + 3, 20, 3, '#05030a', 0.45);
  // cresting along the wing ridges
  for (const [a, z] of [
    [11, 26],
    [54, 69],
  ] as const) {
    img.hline(a, z, 44, IRON[2]!);
    for (let x = a + 1; x < z; x += 3) {
      img.set(x, 43, IRON[3]!);
      img.set(x, 42, IRON[2]!);
      if ((x - a) % 6 === 1) img.set(x, 41, IRON[3]!);
    }
  }
  // tall chimney stack on the left wing, two clay pots
  stonework(img, 4, 18, 8, 30, ASHLAR, MORTAR, { rh: 4, sw: 5, seed: seed + 6, shade: (i) => (i < 2 ? 0.2 : i > 5 ? -0.25 : 0) });
  img.rect(3, 16, 10, 2, ASHLAR[6]!);
  img.hline(3, 12, 17, ASHLAR[3]!);
  for (const px of [5, 9]) {
    img.rect(px, 12, 2, 4, CLAY[2]!);
    img.set(px, 12, CLAY[4]!);
    img.vline(px + 1, 13, 15, CLAY[1]!);
  }
  const chim = { x: 8, y: 12 };

  // wing lancets
  windows.push(lancet(img, 9, 72, 6, 15, ASHLAR, seed + 7));
  windows.push(lancet(img, 65, 72, 6, 15, ASHLAR, seed + 8));

  // --- the central gable: slate roof planes behind, an ashlar gable wall in front
  const peak = 3;
  const base = wingTop + 2;
  img.poly(
    [
      [cx - 27, base],
      [cx, peak],
      [cx + 27, base],
    ],
    (x, y) => {
      const u = (x + 0.5 - cx) / 27;
      const ly = y - peak;
      let v = 0.72 - u * 0.5 - (ly / (base - peak)) * 0.2 + (ly % 3 === 2 ? -0.3 : 0) + (hash(Math.floor(x / 4), Math.floor(ly / 3), seed) - 0.5) * 0.16;
      return dp(DARK_SLATE, v, x, y);
    },
  );
  const gTop = 11;
  const gHalf = 21;
  const gl = new Img(W, H);
  stonework(gl, cx - gHalf, gTop, gHalf * 2, H - 4 - gTop, ASHLAR, MORTAR, { rh: 5, sw: 10, seed: seed + 9, shade: (i) => (i < 4 ? 0.14 : i > gHalf * 2 - 6 ? -0.2 : 0) });
  img.poly(
    [
      [cx - gHalf, base + 1],
      [cx, gTop],
      [cx + gHalf, base + 1],
    ],
    (x, y) => gl.get(x, y),
  );
  img.copy(gl, cx - gHalf, base, cx - gHalf, base, gHalf * 2, H - 4 - base);
  // coping stones along the gable edges (pale, stepped) + kneelers
  for (let side = -1; side <= 1; side += 2)
    for (let t = 0; t <= 1.0001; t += 1 / 120) {
      const x = cx + side * t * (gHalf + 1);
      const y = gTop - 1 + t * (base - gTop + 1);
      for (let k = 0; k < 3; k++) img.set(x, y + k - 1, dp(ASHLAR, (k === 0 ? 0.95 : k === 1 ? 0.7 : 0.35) - (side > 0 ? 0.2 : 0), Math.round(x), Math.round(y + k)));
    }
  for (const kx of [cx - gHalf - 2, cx + gHalf - 2])
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) img.set(kx + i, base - 2 + j, dp(ASHLAR, (j === 0 ? 0.9 : 0.55) - (kx > cx ? 0.2 : 0), kx + i, base - 2 + j));
  // finial: an iron spike with a crow
  img.vline(cx, gTop - 8, gTop - 1, IRON[3]!);
  img.hline(cx - 2, cx + 2, gTop - 5, IRON[2]!);
  img.set(cx, gTop - 9, IRON[3]!);
  // buttresses at the gable corners (stepped, with sloped offsets)
  for (const bx of [cx - gHalf - 2, cx + gHalf - 3]) {
    const right = bx > cx;
    for (let y = base + 2; y < H - 4; y++) {
      const step = y < base + 16 ? 0 : 1;
      const x0 = bx - (right ? 0 : step);
      const w = 5 + step;
      for (let i = 0; i < w; i++) img.set(x0 + i, y, dp(ASHLAR, (i < 2 ? 0.8 : 0.45) - (right ? 0.18 : 0) + ((y - base) % 5 === 4 ? -0.3 : 0), x0 + i, y));
    }
    for (let i = -1; i < 7; i++) img.set(bx + i - (right ? 0 : 1), base + 16, ASHLAR[6]!);
  }

  // rose window + twin lancets + a string course
  roseWindow(img, cx, 31, 7, ASHLAR);
  windows.push({ x: cx, y: 31 });
  for (let x = cx - gHalf + 6; x <= cx + gHalf - 6; x++) {
    img.set(x, 46, ASHLAR[6]!);
    img.set(x, 47, ASHLAR[2]!);
  }
  windows.push(lancet(img, cx - 6, 52, 4, 12, ASHLAR, seed + 10, false));
  lancet(img, cx + 2, 52, 4, 12, ASHLAR, seed + 11, false);

  // --- the pointed oak door with a hood mould, the stoop and an iron lamp
  const dw = 12;
  const dh = 22;
  const dx0 = cx - dw / 2;
  const dTop = doorBottom - dh + 1;
  const d = pointedDoor(img, dx0, dTop, dw, dh, '#4a1e1e', 'left', seed, DSTONE);
  // hood mould: a pale label following the arch
  for (let a = 0; a <= 60; a++) {
    const t = a / 60;
    const side = t < 0.5 ? -1 : 1;
    const k = t < 0.5 ? t * 2 : (1 - t) * 2; // 0 at springing .. 1 at apex
    const x = cx + side * (dw / 2 + 3) * (1 - k * k * 0.9);
    const y = dTop + 9 - k * 13;
    img.set(x, y, ASHLAR[6]!);
    img.set(x, y + 1, ASHLAR[2]!);
  }
  stoop(img, dx0, dw, doorBottom, DSTONE, 4);
  wallLantern(img, dx0 + dw + 5, dTop + 10, true);
  windows.push({ x: dx0 + dw + 6, y: dTop + 7 });

  // ivy on the shaded right corner, crows
  ivy(img, 72, H - 3, 7, 70, seed);
  crow(img, cx + 1, gTop - 9, false);
  crow(img, 62, 43, true);
  crow(img, 70, 43, false);
  crow(img, 7, 11, true);
  // a carved gargoyle head at the left kneeler
  img.rect(cx - gHalf - 5, base - 1, 3, 2, ASHLAR[3]!);
  img.set(cx - gHalf - 6, base - 1, ASHLAR[2]!);
  img.set(cx - gHalf - 5, base - 1, '#0b0810');

  void mix;
  return finish(img, d, windows, chim);
};
export default art;
