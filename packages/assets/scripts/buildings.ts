// Building sprites (15 distinct cottages, tavern, chapel, clock tower, curio shop) drawn in 3/4
// view. Each sprite's bottom-left corner sits at the bottom-left of the building footprint; the
// sprite may extend above the footprint (roof, chimney, steeple, spire).
import type { BuildingDef } from '@ct/protocol';
import { townLayout, townMap, TS, type BuildingStyle } from '../src/layout.js';
import { box, planks, stonework } from './lib/draw.js';
import { bayer, dpick, hash, Img, mix, vnoise, type Color } from './lib/img.js';

export interface BuildingSprite {
  img: Img;
  /** Window glow points in sprite coords (for night facade lights). */
  windows: { x: number; y: number }[];
}

const EXTRA: Record<string, number> = { house: 16, shop: 16, tavern: 20, chapel: 104, clocktower: 176 };

const ROOFS: Record<string, string[]> = {
  slate: ['#16172a', '#1f2236', '#292e45', '#353c58', '#444d6c', '#565f80'],
  red: ['#260f12', '#3a1618', '#521e1c', '#6a2a24', '#82382e', '#9a4a3a'],
  moss: ['#141c1a', '#1c2622', '#25312a', '#303e34', '#3e4c3e', '#4e5c48'],
  thatch: ['#2e2210', '#463416', '#5e471e', '#785c28', '#927234', '#ac8a44'],
  blue: ['#0f1924', '#152331', '#1c2e3f', '#253b4f', '#304a60', '#3e5c74'],
  plum: ['#1c1220', '#271a2e', '#33233c', '#402d4c', '#4f395e', '#604872'],
};
const WALLS: Record<string, string[]> = {
  timber: ['#5e5446', '#766a58', '#8c806a', '#a0947c', '#b2a68e'],
  stone: ['#2c2a30', '#3a373e', '#49454c', '#58535a', '#68626a'],
  plaster: ['#5c5850', '#726d62', '#8a8476', '#a09a8a', '#b4ae9c'],
  brick: ['#3a1c1c', '#4c2424', '#5e2e2a', '#723a32', '#86483c'],
  planks: ['#24180f', '#332217', '#432d1f', '#533828', '#634432'],
};
const BEAM = ['#1a110c', '#271a12', '#36241a', '#462f22'];
const STONE = ['#24212c', '#312d3a', '#3f3a48', '#4e4858', '#5f5869', '#726a7a'];
const GLASS = ['#7a3e1a', '#c06a24', '#eda040', '#ffd27a', '#fff0c0'];
const IRON = ['#0f0d14', '#1b1822', '#2a2632', '#3c3746'];
const BRASS = ['#3a2a10', '#5e4518', '#8a6a24', '#b8913a', '#e0c060'];

// ---------------------------------------------------------------------------------------

function wallTexture(img: Img, x0: number, y0: number, w: number, h: number, kind: string, seed: number) {
  const pal = WALLS[kind]!;
  if (kind === 'stone') {
    stonework(img, x0, y0, w, h, pal, '#18161c', { rh: 6, sw: 9, seed, shade: (i) => (i < 3 ? 0.15 : i > w - 4 ? -0.15 : 0) });
    return;
  }
  if (kind === 'brick') {
    stonework(img, x0, y0, w, h, pal, '#1e1012', { rh: 4, sw: 8, seed, shade: (i) => (i < 3 ? 0.15 : i > w - 4 ? -0.15 : 0) });
    return;
  }
  if (kind === 'planks') {
    planks(img, x0, y0, w, h, pal, { vertical: true, size: 5, seed });
    return;
  }
  // plaster / timber infill
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const y = y0 + j;
      let v = 0.55 + (vnoise(x, y, 6, seed) - 0.5) * 0.35 + (i < 3 ? 0.12 : 0) - (i > w - 4 ? 0.15 : 0);
      if (hash(x, y, seed + 1) < 0.03) v -= 0.25;
      img.set(x, y, dpick(pal, v, x, y));
    }
  if (kind === 'plaster') {
    // exposed brick patch and cracks
    const px = x0 + Math.floor(hash(seed, 1, 2) * (w - 16)) + 4;
    const py = y0 + 4;
    stonework(img, px, py, 9, 6, WALLS.brick!, '#3a2a28', { rh: 3, sw: 5, seed: seed + 3 });
    for (let k = 0; k < 6; k++) img.set(x0 + w - 8 + (k % 2), y0 + 3 + k, pal[1]!);
  }
}

function timberFrame(img: Img, x0: number, y0: number, w: number, h: number, avoid: { x: number; w: number }[]) {
  const beam = (x: number, y: number, ww: number, hh: number) => {
    for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) img.set(x + i, y + j, dpick(BEAM, 0.6 - (i === 0 || j === 0 ? -0.3 : 0) + (hash(x + i, y + j, 5) - 0.5) * 0.3, x + i, y + j));
  };
  beam(x0, y0, w, 3);
  beam(x0, y0 + Math.floor(h / 2) - 1, w, 2);
  beam(x0, y0, 3, h);
  beam(x0 + w - 3, y0, 3, h);
  // braces in free panels
  const free = (x: number) => !avoid.some((a) => x + 10 > a.x && x < a.x + a.w);
  for (let x = x0 + 6; x < x0 + w - 14; x += 18) {
    if (!free(x)) continue;
    for (let k = 0; k < Math.floor(h / 2) - 4; k++) {
      img.set(x + k, y0 + 3 + k, BEAM[2]!);
      img.set(x + k + 1, y0 + 3 + k, BEAM[1]!);
    }
  }
}

function windowAt(img: Img, cx: number, top: number, style: BuildingStyle, wide = 12, tall = 12) {
  const x0 = cx - Math.floor(wide / 2);
  // shutters
  if (style.wall !== 'stone') {
    for (const sx of [x0 - 4, x0 + wide + 1]) {
      for (let j = 0; j < tall; j++)
        for (let i = 0; i < 3; i++) img.set(sx + i, top + j, mix(style.shutters, j % 3 === 0 ? '#000000' : '#ffffff', j % 3 === 0 ? 0.35 : i === 0 ? 0.15 : 0));
    }
  }
  img.rect(x0 - 1, top - 1, wide + 2, tall + 2, BEAM[0]!);
  for (let j = 0; j < tall; j++)
    for (let i = 0; i < wide; i++) {
      const v = 0.85 - j / (tall * 1.6) - Math.abs(i - wide / 2) / (wide * 2.2);
      img.set(x0 + i, top + j, dpick(GLASS, v, x0 + i, top + j));
    }
  img.vline(cx, top, top + tall - 1, BEAM[1]!);
  img.hline(x0, x0 + wide - 1, top + Math.floor(tall / 2), BEAM[1]!);
  // sill
  img.rect(x0 - 2, top + tall + 1, wide + 4, 2, STONE[4]!);
  img.hline(x0 - 2, x0 + wide + 1, top + tall + 2, STONE[1]!);
  if (style.flowers) {
    img.rect(x0 - 1, top + tall + 3, wide + 2, 3, '#4a2e1e');
    for (let i = 0; i < wide + 2; i++) {
      const c = ['#c0304a', '#e8e0d0', '#a040a0', '#e8a030'][(i + cx) % 4]!;
      if (hash(i, cx, 3) < 0.65) img.set(x0 - 1 + i, top + tall + 2 - (i % 2), c);
      img.set(x0 - 1 + i, top + tall + 3, i % 2 ? '#2e5a2a' : '#1e4020');
    }
  }
}

function doorAt(img: Img, cx: number, bottom: number, paint: string, w = 12, h = 20, arched = true) {
  const x0 = cx - Math.floor(w / 2);
  const top = bottom - h;
  // stone surround
  for (let j = -2; j < h; j++)
    for (let i = -2; i < w + 2; i++) {
      const edge = i < 0 || i >= w || j < 0;
      if (!edge) continue;
      if (arched && j < 3 && (i < 1 || i > w - 2) && j < 0) continue;
      img.set(x0 + i, top + j, dpick(STONE, 0.65 - (i > w / 2 ? 0.25 : 0) + (hash(i, j, 7) - 0.5) * 0.2, x0 + i, top + j));
    }
  const pal = [mix(paint, '#000000', 0.55), mix(paint, '#000000', 0.3), paint, mix(paint, '#ffffff', 0.18)];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (arched && j < 3) {
        const d = Math.hypot(i + 0.5 - w / 2, (j + 0.5 - 3) * 1.8);
        if (d > w / 2) {
          img.set(x0 + i, top + j, STONE[3]!);
          continue;
        }
      }
      let v = 0.45 + (i % 4 === 0 ? -0.25 : 0) + (i % 4 === 1 ? 0.15 : 0) - j / (h * 4);
      img.set(x0 + i, top + j, dpick(pal, v, x0 + i, top + j));
    }
  // hinges + knob
  for (const y of [top + 5, top + h - 6]) img.hline(x0, x0 + Math.floor(w / 2), y, IRON[2]!);
  img.set(x0 + w - 3, top + Math.floor(h / 2) + 1, BRASS[4]!);
  img.set(x0 + w - 3, top + Math.floor(h / 2) + 2, BRASS[2]!);
  // step
  img.rect(x0 - 2, bottom, w + 4, 1, STONE[2]!);
  // shadow inside the frame top
  img.blendRect(x0, top, w, 2, '#000000', 0.35);
}

function wallLantern(img: Img, x: number, y: number) {
  img.hline(x - 3, x, y - 6, IRON[2]!);
  img.rect(x - 1, y - 5, 4, 1, IRON[1]!);
  img.rect(x - 1, y - 4, 4, 4, GLASS[3]!);
  img.set(x, y - 3, GLASS[4]!);
  img.rect(x - 1, y, 4, 1, IRON[1]!);
}

/** Hip/side roof between rows top..bottom with an inset at the top. */
function roof(img: Img, style: BuildingStyle, x0: number, x1: number, top: number, bottom: number, inset: number, seed: number) {
  const pal = ROOFS[style.roof]!;
  const thatch = style.roof === 'thatch';
  const H = bottom - top;
  for (let y = top; y <= bottom; y++) {
    const f = (y - top) / H;
    const ins = Math.round(inset * (1 - f));
    for (let x = x0 + ins; x <= x1 - ins; x++) {
      const ly = y - top;
      let v = 0.78 - f * 0.55;
      // hip facets: left lit, right shaded
      if (x < x0 + inset + 2 && x - x0 < (inset + 2) * (1 - f) + 3) v += 0.12;
      if (x > x1 - inset - 2 && x1 - x < (inset + 2) * (1 - f) + 3) v -= 0.18;
      if (thatch) {
        v += (vnoise(x * 3, y * 0.4, 3, seed) - 0.5) * 0.45;
        if (hash(x, y, seed) < 0.08) v -= 0.2;
      } else {
        const row = Math.floor(ly / 4);
        const rl = ly % 4;
        const off = (row % 2) * 3;
        const sx = Math.floor((x + off) / 6);
        v += (hash(sx, row, seed) - 0.5) * 0.25;
        if (rl === 3) v -= 0.35;
        else if ((x + off) % 6 === 0) v -= 0.22;
        else if (rl === 0) v += 0.08;
        if (style.roof === 'red' && rl === 2 && (x + off) % 6 === 3) v += 0.15;
        if (style.roof === 'moss' && vnoise(x, y, 5, seed + 9) > 0.62) {
          img.set(x, y, dpick(['#1e3220', '#2a4428', '#3a5a32'], v, x, y));
          continue;
        }
      }
      img.set(x, y, dpick(pal, v, x, y));
    }
  }
  // ridge
  for (let x = x0 + inset; x <= x1 - inset; x++) {
    img.set(x, top, pal[5]!);
    img.set(x, top + 1, pal[thatch ? 4 : 1]!);
  }
  // eave
  for (let x = x0; x <= x1; x++) {
    if (thatch) {
      const rag = hash(x, 0, seed + 4) < 0.5 ? 1 : 0;
      img.set(x, bottom + rag, pal[1]!);
      img.set(x, bottom + 1 + rag, pal[0]!);
    } else {
      img.set(x, bottom, pal[0]!);
      img.set(x, bottom - 1, pal[2]!);
    }
  }
}

function chimney(img: Img, cx: number, top: number, bottom: number, wall: string) {
  const w = 10;
  const x0 = cx - w / 2;
  stonework(img, x0, top, w, bottom - top, wall === 'brick' ? WALLS.brick! : STONE, '#141118', { rh: 4, sw: 5, seed: 31, shade: (i) => (i < 2 ? 0.2 : i > 7 ? -0.2 : 0) });
  img.rect(x0 - 1, top, w + 2, 3, STONE[4]!);
  img.hline(x0 - 1, x0 + w, top + 2, STONE[1]!);
  img.rect(x0 + 2, top, w - 4, 1, '#0a080c');
  // a wisp of smoke
  for (let k = 0; k < 7; k++) img.blend(cx + Math.round(Math.sin(k * 0.9) * 2), top - 2 - k * 2, '#8a8496', 0.35 - k * 0.04);
}

function frontGable(img: Img, style: BuildingStyle, cx: number, top: number, bottom: number, halfW: number, seed: number) {
  const pal = ROOFS[style.roof]!;
  // wall triangle
  const tri: [number, number][] = [
    [cx - halfW + 4, bottom],
    [cx, top + 5],
    [cx + halfW - 4, bottom],
  ];
  const tmp = new Img(img.w, img.h);
  wallTexture(tmp, cx - halfW, top, halfW * 2, bottom - top + 1, style.wall === 'stone' || style.wall === 'brick' ? style.wall : 'plaster', seed);
  img.poly(tri, (x, y) => tmp.get(x, y));
  // round window
  img.ellipse(cx, top + (bottom - top) * 0.62, 4, 4, (x, y, nx, ny) => (nx * nx + ny * ny > 0.55 ? BEAM[0]! : dpick(GLASS, 0.75 - ny * 0.3, x, y)));
  // barge boards (roof edges)
  for (let side = -1; side <= 1; side += 2) {
    for (let t = 0; t <= 1.0001; t += 1 / ((bottom - top) * 1.5)) {
      const x = cx + side * t * halfW;
      const y = top + t * (bottom - top);
      for (let k = 0; k < 6; k++) {
        const v = k < 2 ? 0.8 : k < 5 ? 0.45 : 0.1;
        img.set(x - side * 0 + 0, y + k - 4, dpick(pal, v - (side > 0 ? 0.15 : 0), Math.round(x), Math.round(y + k)));
      }
    }
  }
  img.set(cx, top - 4, pal[5]!);
  img.set(cx, top - 5, pal[4]!);
}

function cottage(b: BuildingDef, style: BuildingStyle, extra: number, seed: number): BuildingSprite {
  const W = b.footprint.w * TS;
  const FH = b.footprint.h * TS;
  const H = FH + extra;
  const img = new Img(W, H);
  const windows: { x: number; y: number }[] = [];
  const isTavern = b.kind === 'tavern';
  const isShop = b.kind === 'shop';
  const wallH = isTavern ? 76 : Math.min(42, Math.round(FH * 0.46));
  const wallTop = H - wallH;
  const dx = (b.door.x - b.footprint.x) * TS + 8;

  wallTexture(img, 2, wallTop, W - 4, wallH, style.wall, seed);
  const winTop = wallTop + 10;
  const winXs: number[] = [];
  const candidates = W >= 160 ? [24, 56, W - 56, W - 24] : W >= 112 ? [20, W - 20] : W >= 96 ? [18, W - 18] : [14, W - 14];
  for (const x of candidates) if (Math.abs(x - dx) >= 18) winXs.push(x);
  if (style.wall === 'timber') timberFrame(img, 2, wallTop + 2, W - 4, wallH - 5, [...winXs.map((x) => ({ x: x - 8, w: 16 })), { x: dx - 8, w: 16 }]);
  // foundation
  stonework(img, 1, H - 4, W - 2, 4, STONE, '#141118', { rh: 4, sw: 7, seed: seed + 2 });

  if (isTavern) {
    // upper storey windows (above the jetty beam) + lower windows
    const upper = wallTop + 8;
    for (const x of [24, 56, 88, 120, 152]) {
      windowAt(img, x, upper, style);
      windows.push({ x, y: upper + 6 });
    }
    img.rect(0, wallTop + 30, W, 3, BEAM[2]!);
    img.hline(0, W - 1, wallTop + 33, BEAM[0]!);
    for (const x of winXs) {
      windowAt(img, x, wallTop + 42, style, 14, 14);
      windows.push({ x, y: wallTop + 49 });
    }
  } else if (isShop) {
    // display window with awning left of the door, regular window right
    const sx = Math.max(16, dx - 34);
    windowAt(img, sx + 4, winTop + 4, { ...style, flowers: false }, 22, 14);
    windows.push({ x: sx + 4, y: winTop + 10 });
    // goods in display
    for (let i = 0; i < 5; i++) img.rect(sx - 6 + i * 4, winTop + 13, 3, 4, ['#a02a3a', '#2a8a5a', '#3a5aa0', '#c0a02a', '#7a3aa0'][i]!);
    for (let y = winTop - 4; y < winTop + 2; y++)
      for (let x = sx - 12; x < sx + 20; x++) {
        const stripe = Math.floor((x - sx) / 4) % 2 === 0;
        img.set(x, y, stripe ? mix('#2a6a6a', '#ffffff', y === winTop - 4 ? 0.2 : 0) : '#c8bca0');
      }
    for (let x = sx - 12; x < sx + 20; x += 2) img.set(x, winTop + 2, '#1e4a4a');
    for (const x of winXs.filter((x) => x > dx)) {
      windowAt(img, x, winTop, style);
      windows.push({ x, y: winTop + 6 });
    }
  } else {
    for (const x of winXs) {
      windowAt(img, x, winTop, style);
      windows.push({ x, y: winTop + 6 });
    }
  }
  doorAt(img, dx, H - 1, style.shutters, isTavern ? 16 : 12, isTavern ? 24 : 20);
  if (style.lantern) wallLantern(img, dx + (isTavern ? 13 : 11), H - 16);

  // roof
  const roofBottom = wallTop + 2;
  const roofTop = extra + 2;
  roof(img, style, 0, W - 1, roofTop, roofBottom, Math.min(14, Math.floor(W / 7)), seed + 5);
  img.blendRect(2, roofBottom + 1, W - 4, 4, '#05030a', 0.45);
  if (style.chimney !== 'none') {
    const cx = style.chimney === 'left' ? Math.round(W * 0.26) : Math.round(W * 0.74);
    chimney(img, cx, 3, roofTop + 14, style.wall);
  }
  if (style.roofType === 'cross') frontGable(img, style, dx, roofTop + 8, roofBottom, Math.min(26, Math.floor(W / 3.4)), seed + 7);

  if (isTavern) {
    // hanging sign with a tankard
    const sx = dx - 30;
    img.hline(sx - 2, sx + 12, wallTop + 36, IRON[2]!);
    img.vline(sx + 1, wallTop + 36, wallTop + 39, IRON[2]!);
    img.vline(sx + 10, wallTop + 36, wallTop + 39, IRON[2]!);
    box(img, sx - 2, wallTop + 39, 16, 13, 2, ['#2a1a10', '#3e2818', '#543824', '#6a4a30']);
    img.rect(sx + 3, wallTop + 43, 6, 7, '#c0a050');
    img.rect(sx + 3, wallTop + 43, 6, 2, '#f0e8d0');
    img.vline(sx + 9, wallTop + 45, wallTop + 48, '#c0a050');
  }
  if (isShop) {
    const sx = dx + 14;
    img.hline(sx, sx + 10, wallTop + 6, IRON[2]!);
    box(img, sx, wallTop + 8, 12, 12, 2, ['#1a2a2a', '#2a3e3e', '#3a5252', '#4a6666']);
    img.rect(sx + 5, wallTop + 11, 2, 2, '#c0c0d0');
    img.ellipse(sx + 6, wallTop + 16, 3, 3, '#7a3aa0');
    img.set(sx + 5, wallTop + 15, '#d0a0f0');
  }
  img.outline({ darken: 0.72 });
  return { img, windows };
}

function chapel(b: BuildingDef, style: BuildingStyle, extra: number): BuildingSprite {
  const W = b.footprint.w * TS;
  const FH = b.footprint.h * TS;
  const H = FH + extra;
  const img = new Img(W, H);
  const windows: { x: number; y: number }[] = [];
  const wallH = 60;
  const wallTop = H - wallH;
  const cx = (b.door.x - b.footprint.x) * TS + 8;
  stonework(img, 2, wallTop, W - 4, wallH, STONE, '#16131c', { rh: 6, sw: 10, seed: 3, shade: (i) => (i < 4 ? 0.15 : i > W - 8 ? -0.2 : 0) });
  // lancet stained-glass windows
  const holy = ['#3a1a4a', '#6a2a6a', '#a0408a', '#d07aa0', '#f0c0d0'];
  for (const x of [26, 56, W - 56, W - 26]) {
    for (let y = wallTop + 10; y < wallTop + 38; y++)
      for (let i = -3; i <= 3; i++) {
        if (y < wallTop + 16 && Math.abs(i) > (y - (wallTop + 10)) / 2) continue;
        const cell = (Math.floor((i + 3) / 2) + Math.floor(y / 4)) % 3;
        const lead = (y % 4 === 0 && Math.abs(i) < 3) || i === 0;
        img.set(x + i, y, lead ? '#140f18' : dpick(cell === 0 ? holy : cell === 1 ? ['#1a2a5a', '#2a4a8a', '#4a7ac0', '#8ab0e0', '#d0e0f8'] : ['#4a3a10', '#8a6a1a', '#c0a030', '#e8d070', '#fff4c0'], 0.65 - (y - wallTop) / 80, x + i, y));
      }
    img.rect(x - 5, wallTop + 39, 11, 2, STONE[4]!);
    windows.push({ x, y: wallTop + 24 });
  }
  // buttresses
  for (const x of [8, 40, W - 44, W - 12]) {
    stonework(img, x - 2, wallTop - 4, 8, wallH + 4, STONE, '#16131c', { rh: 6, sw: 8, seed: 8, shade: (i) => (i < 2 ? 0.3 : i > 5 ? -0.3 : 0.05) });
    img.poly(
      [
        [x - 3, wallTop - 4],
        [x + 2, wallTop - 10],
        [x + 7, wallTop - 4],
      ],
      STONE[3]!,
    );
  }
  // great door + rose window
  doorAt(img, cx, H - 1, style.shutters, 20, 30);
  img.vline(cx, H - 30, H - 2, '#1a1010');
  // steep slate roof
  const roofTop = extra + 6;
  roof(img, style, 0, W - 1, roofTop, wallTop + 2, 18, 41);
  img.blendRect(2, wallTop + 3, W - 4, 4, '#05030a', 0.45);
  // front gable over the door with rose window
  const gTop = wallTop - 34;
  img.poly(
    [
      [cx - 34, wallTop + 4],
      [cx, gTop],
      [cx + 34, wallTop + 4],
    ],
    (x, y) => dpick(STONE, 0.55 - (x - cx) / 120 + (hash(Math.floor(x / 9), Math.floor(y / 6), 5) - 0.5) * 0.25 + (y % 6 === 0 ? -0.2 : 0), x, y),
  );
  img.ellipse(cx, wallTop - 8, 9, 9, (x, y, nx, ny) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d > 0.82) return STONE[1]!;
    const a = Math.atan2(ny, nx);
    if (Math.abs(Math.sin(a * 4)) < 0.18 || d < 0.2) return '#140f18';
    return dpick(holy, 0.85 - d * 0.5, x, y);
  });
  windows.push({ x: cx, y: wallTop - 8 });
  for (let side = -1; side <= 1; side += 2)
    for (let t = 0; t <= 1; t += 0.01) {
      const x = cx + side * t * 36;
      const y = gTop + t * 38;
      for (let k = 0; k < 4; k++) img.set(x, y + k - 3, ROOFS.slate![k < 2 ? 4 : 1]!);
    }
  // steeple tower
  const tw = 30;
  const tx = cx - tw / 2;
  const tTop = 56;
  stonework(img, tx, tTop, tw, gTop - tTop + 4, STONE, '#16131c', { rh: 6, sw: 8, seed: 12, shade: (i) => (i < 4 ? 0.2 : i > tw - 6 ? -0.25 : 0) });
  // belfry louvres
  img.rect(cx - 6, tTop + 8, 12, 16, '#0c0a10');
  img.ellipse(cx, tTop + 8, 6, 4, (x, y, nx, ny) => (ny < 0 ? '#0c0a10' : null));
  for (let y = tTop + 10; y < tTop + 24; y += 3) img.hline(cx - 5, cx + 5, y, '#3a3040');
  img.rect(tx - 2, tTop - 2, tw + 4, 4, STONE[4]!);
  // spire
  img.poly(
    [
      [tx - 2, tTop - 1],
      [cx, 8],
      [tx + tw + 2, tTop - 1],
    ],
    (x, y) => dpick(ROOFS.slate!, 0.75 - (x - tx) / 40 + ((y % 5) === 0 ? -0.25 : 0), x, y),
  );
  // finial cross
  img.rect(cx - 1, 0, 2, 10, BRASS[3]!);
  img.rect(cx - 3, 3, 6, 2, BRASS[3]!);
  img.outline({ darken: 0.72 });
  return { img, windows };
}

function clocktower(b: BuildingDef, extra: number): BuildingSprite {
  const W = b.footprint.w * TS;
  const FH = b.footprint.h * TS;
  const H = FH + extra;
  const img = new Img(W, H);
  const windows: { x: number; y: number }[] = [];
  const cx = W / 2;
  const TS2 = ['#211e28', '#2d2935', '#3a3543', '#484252', '#575062', '#686072'];
  const shade = (w: number) => (i: number) => (i < 5 ? 0.22 : i > w - 7 ? -0.25 : 0);
  // plinth
  stonework(img, 0, H - 40, W, 40, TS2, '#14111a', { rh: 6, sw: 10, seed: 51, shade: shade(W) });
  img.rect(0, H - 42, W, 3, TS2[4]!);
  // shaft
  const sx = 8;
  const sw = W - 16;
  stonework(img, sx, 96, sw, H - 42 - 96, TS2, '#14111a', { rh: 6, sw: 9, seed: 52, shade: shade(sw) });
  // corner quoins
  for (let y = 96; y < H - 42; y += 6) {
    img.rect(sx, y, (y / 6) % 2 === 0 ? 6 : 4, 5, TS2[4]!);
    img.rect(sx + sw - ((y / 6) % 2 === 0 ? 6 : 4), y, (y / 6) % 2 === 0 ? 6 : 4, 5, TS2[2]!);
  }
  // slit windows
  for (const y of [H - 90, H - 64]) {
    img.rect(cx - 2, y, 4, 10, GLASS[2]!);
    img.rect(cx - 2, y, 4, 1, BEAM[0]!);
    windows.push({ x: cx, y: y + 5 });
  }
  // clock face
  const fy = 132;
  img.ellipse(cx, fy, 22, 22, (x, y, nx, ny) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d > 0.9) return BRASS[2]!;
    if (d > 0.84) return BRASS[4]!;
    const a = Math.atan2(ny, nx);
    const tick = Math.abs(Math.sin(a * 6)) < 0.12 && d > 0.66 && d < 0.8;
    if (tick) return '#1a1420';
    return dpick(['#8a8270', '#b0a890', '#d4ccb4', '#ece4cc'], 0.85 - d * 0.4 - nx * 0.15, x, y);
  });
  // hands (five to midnight)
  img.line(cx, fy, cx - 2, fy - 16, '#120e16');
  img.line(cx + 1, fy, cx - 1, fy - 16, '#120e16');
  img.line(cx, fy, cx - 9, fy - 6, '#120e16');
  img.set(cx, fy, BRASS[4]!);
  windows.push({ x: cx, y: fy });
  // cornice + belfry
  img.rect(sx - 4, 92, sw + 8, 5, TS2[4]!);
  img.hline(sx - 4, sx + sw + 3, 96, TS2[0]!);
  stonework(img, sx + 2, 48, sw - 4, 44, TS2, '#14111a', { rh: 6, sw: 8, seed: 53, shade: shade(sw - 4) });
  for (const ox of [-14, 14]) {
    img.rect(cx + ox - 6, 56, 12, 30, '#0c0a10');
    img.ellipse(cx + ox, 56, 6, 5, (x, y, nx, ny) => (ny < 0.1 ? '#0c0a10' : null));
  }
  // the bell, visible through the arches
  img.ellipse(cx - 14, 74, 5, 7, (x, y, nx, ny) => (ny < -0.2 || y < 80 ? dpick(BRASS, 0.75 - nx * 0.4, x, y) : null));
  img.ellipse(cx + 14, 74, 5, 7, (x, y, nx, ny) => (ny < -0.2 || y < 80 ? dpick(BRASS, 0.55 - nx * 0.4, x, y) : null));
  img.rect(sx - 2, 44, sw + 4, 5, TS2[4]!);
  // battlement teeth
  for (let x = sx - 2; x < sx + sw + 2; x += 8) img.rect(x, 40, 4, 4, TS2[3]!);
  // spire
  img.poly(
    [
      [sx + 2, 44],
      [cx, 2],
      [sx + sw - 2, 44],
    ],
    (x, y) => dpick(ROOFS.slate!, 0.8 - (x - sx) / 70 + ((y % 5) === 0 ? -0.25 : 0) + (bayer(x, y) - 0.5) * 0.1, x, y),
  );
  // weathervane
  img.vline(cx, 0, 4, IRON[3]!);
  img.hline(cx - 4, cx + 4, 1, IRON[3]!);
  img.set(cx + 4, 0, IRON[3]!);
  // door
  doorAt(img, cx, H - 1, '#3a2a1e', 16, 26);
  wallLantern(img, cx + 14, H - 18);
  wallLantern(img, cx - 12, H - 18);
  img.outline({ darken: 0.72 });
  return { img, windows };
}

export function drawBuildings(): Map<string, BuildingSprite> {
  const out = new Map<string, BuildingSprite>();
  townLayout.buildings.forEach((b, i) => {
    const style = townMap.styles[b.id]!;
    const extra = EXTRA[b.kind] ?? 16;
    let s: BuildingSprite;
    if (b.kind === 'chapel') s = chapel(b, style, extra);
    else if (b.kind === 'clocktower') s = clocktower(b, extra);
    else s = cottage(b, style, extra, 100 + i * 13);
    out.set(b.id, s);
  });
  return out;
}

export const _c: Color = '#000';
