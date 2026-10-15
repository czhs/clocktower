// house-1 — the crooked witch's cottage: a sagging witch-hat roof of patched, mossy shingles whose
// tip curls over to the left, a zig-zag brick chimney, skewed walls of stained plaster on a
// fieldstone base, a diamond-leaded window and a porthole, a purple door with a moon cut-out, a
// bubbling cauldron by the step, pumpkins and a besom broom.
import { TS } from '../../src/layout.js';
import { CLAY, wallLantern, WALLS, wallTexture, type DoorSpec } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { hash, Img, mix, vnoise } from '../lib/img.js';
import { BEAM, broom, cauldron, dp, finish, frontDoor, GLASS, IRON, LEAF, PURPLE_SLATE, pumpkin, RED_TILE, roundWindow, RUBBLE, WITCH_ROOF, type Pt } from './lib-houses-a.js';
import type { HouseArt } from './types.js';

const art: HouseArt = (b, _style, seed) => {
  const W = b.footprint.w * TS; // 80
  const H = b.footprint.h * TS + 48; // 112
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const cx = (b.door.x - b.footprint.x) * TS + 8; // 40
  const doorBottom = H - 4;

  // --- walls: a skewed box (leans right), stained plaster over a fieldstone base
  const wallPoly: [number, number][] = [
    [6, 64],
    [75, 62],
    [77, H - 3],
    [3, H - 3],
  ];
  const tmp = new Img(W, H);
  wallTexture(tmp, 0, 60, W, H - 60, 'plaster', seed);
  stonework(tmp, 0, H - 17, W, 15, RUBBLE, '#141118', { rh: 4, sw: 6, seed: seed + 2, shade: (i) => (i < 8 ? 0.15 : i > W - 10 ? -0.2 : 0) });
  img.poly(wallPoly, (x, y) => {
    const c = tmp.get(x, y);
    // damp, greenish stains running down from the eave
    const stain = y < H - 17 ? Math.max(0, vnoise(x, 0, 5, seed + 3) - 0.45) * 1.2 * (1 - (y - 64) / 40) : 0;
    const shade = x > 66 ? 0.25 : x < 12 ? -0.05 : 0;
    return mix(mix(mix(c, '#4a4630', 0.3), '#2a3a2a', stain), '#0b0714', shade);
  });
  // crooked timbers
  const beam = (x0: number, y0: number, x1: number, y1: number) => {
    img.line(x0, y0, x1, y1, BEAM[1]!);
    img.line(x0 + 1, y0, x1 + 1, y1, BEAM[3]!);
  };
  beam(6, 66, 5, H - 18);
  beam(73, 64, 75, H - 18);
  img.line(5, H - 18, 76, H - 19, BEAM[2]!);
  img.line(5, H - 17, 76, H - 18, BEAM[0]!);
  beam(29, 66, 28, H - 18);
  beam(50, 65, 52, H - 18);
  img.line(8, 92, 26, 74, BEAM[1]!);
  img.line(54, 74, 70, 92, BEAM[1]!);

  // diamond-leaded window, skewed
  {
    const x0 = 9;
    const y0 = 76;
    const ww = 15;
    const hh = 13;
    for (let j = -1; j <= hh; j++) {
      const sk = Math.floor(j / 5);
      for (let i = -1; i <= ww; i++) {
        const x = x0 + i + sk;
        const y = y0 + j;
        if (i < 0 || j < 0 || i >= ww || j >= hh) {
          img.set(x, y, BEAM[0]!);
          continue;
        }
        const lead = (i + j) % 4 === 0 || (i - j + 40) % 4 === 0;
        img.set(x, y, lead ? mix(BEAM[0]!, GLASS[1]!, 0.25) : dp(GLASS, 0.92 - j / 26 - Math.abs(i - 7) * 0.03 + (hash(i, j, 4) < 0.08 ? -0.2 : 0), x, y));
      }
    }
    img.hline(x0 - 1, x0 + ww + 3, y0 + hh + 1, RUBBLE[5]!);
    img.hline(x0 - 1, x0 + ww + 3, y0 + hh + 2, RUBBLE[2]!);
    windows.push({ x: x0 + 8, y: y0 + 6 });
    // a little row of potion bottles on the sill
    const bc = ['#3e8a5a', '#8a3a6a', '#3a5a9a', '#b08a2a'];
    for (let k = 0; k < 4; k++) {
      const bx = x0 + 1 + k * 4;
      img.rect(bx, y0 + hh - 2, 2, 3, bc[k]!);
      img.set(bx, y0 + hh - 3, mix(bc[k]!, '#ffffff', 0.4));
      img.set(bx + 1, y0 + hh - 1, mix(bc[k]!, '#000000', 0.4));
    }
  }
  // porthole window
  img.ellipse(63, 81, 7.5, 7.5, (x, y, nx, ny) => dp(RUBBLE, 0.8 - nx * 0.4 - ny * 0.3 + (hash(x, y, 3) - 0.5) * 0.2, x, y));
  roundWindow(img, 63, 81, 5, BEAM[0]!);
  windows.push({ x: 63, y: 82 });

  // --- door: arched, deep purple, a glowing crescent cut-out; lamp on the left
  const spec: DoorSpec = { w: 12, h: 20, arched: true, kind: 'planks', hinge: 'right', paint: '#4a2a5e', wreath: false, seed };
  const { d, x0: dx0, top: dTop } = frontDoor(img, cx, doorBottom, spec, { jamb: 2 });
  {
    const mx = dx0 + 6;
    const my = dTop + 6;
    const moon: [number, number][] = [
      [0, -2], [-1, -1], [-1, 0], [-1, 1], [0, 2], [1, 2], [-2, 0], [1, -2],
    ];
    for (const [i, j] of moon) img.set(mx + i, my + j, j <= 0 ? GLASS[4]! : GLASS[3]!);
  }
  wallLantern(img, dx0 - 6, doorBottom - 20 + 9, false);
  windows.push({ x: dx0 - 5, y: doorBottom - 20 + 6 });

  // --- the hat roof
  const top = 18; // where the curled tip joins the body
  const eaveL = 68;
  const eaveR = 64;
  const eave = (x: number) => Math.round(eaveL + ((eaveR - eaveL) * x) / W);
  const geom = (y: number) => {
    const t = Math.max(0, Math.min(1, (y - top) / (eaveL - top)));
    const hw = 5 + 37 * Math.pow(t, 1.45);
    const c = 41 - 9 * Math.pow(1 - t, 2);
    return { t, hw, c };
  };
  const roofPx = (x: number, y: number, v0: number) => {
    const { c, hw, t } = geom(y);
    const u = (x + 0.5 - c) / hw; // -1 .. 1 across
    const sag = 2.5 * (1 - u * u);
    const ry = y - sag;
    const row = Math.floor(ry / 4);
    const ly = ((Math.floor(ry) % 4) + 4) % 4;
    const cw = 4 + Math.floor(hash(row, 1, seed) * 3);
    const q = (x + hash(row, 2, seed) * 7) / cw;
    const cell = Math.floor(q);
    const lx = (q - cell) * cw;
    let v = v0 - u * 0.34 - t * 0.12 + (hash(cell, row, seed) - 0.5) * 0.18;
    if (ly === 3) v -= 0.32;
    else if (lx < 1) v -= 0.2;
    else if (ly === 0) v += 0.08;
    const patch = hash(cell, row, seed + 5);
    let pal: readonly string[] = WITCH_ROOF;
    if (patch < 0.045) pal = PURPLE_SLATE;
    else if (patch < 0.075) pal = RED_TILE;
    // moss creeping over the lower courses
    if (vnoise(x, y, 4, seed + 8) > 0.6 - t * 0.12 && ly !== 3) return dp(['#1e3220', '#2a4428', '#3a5a32', '#4e6e3a'], v + 0.1, x, y);
    return dp(pal, v, x, y);
  };
  for (let y = top; y <= eaveL + 1; y++) {
    const { c, hw } = geom(y);
    for (let x = Math.floor(c - hw); x <= Math.ceil(c + hw); x++) {
      if (x < 0 || x >= W) continue;
      if (y > eave(x)) continue;
      img.set(x, y, roofPx(x, y, 0.72));
    }
  }
  // the curled tip: discs of shrinking radius along a curve that droops to the left
  const tip: [number, number, number][] = [];
  for (let k = 0; k <= 40; k++) {
    const s = k / 40;
    const x = 33 - 3 * s - 14 * Math.pow(s, 2.2);
    const y = top + 1 - 15 * Math.sin(s * Math.PI * 0.62) + 6 * Math.pow(s, 3);
    tip.push([x, y, 5.2 * (1 - s) + 0.8]);
  }
  for (const [tx, ty, tr] of tip)
    img.ellipse(tx, ty, tr, tr, (x, y, nx, ny) => {
      if (x < 0 || y < 0) return null;
      return roofPx(x, y + 0, 0.78 - nx * 0.2 - ny * 0.25);
    });
  // a little star charm dangling off the tip
  {
    const [ex, ey] = tip[tip.length - 1]!;
    img.vline(Math.round(ex), Math.round(ey) + 1, Math.round(ey) + 4, '#8a7a5a');
    img.set(Math.round(ex), Math.round(ey) + 5, '#ffe9a0');
    img.set(Math.round(ex) - 1, Math.round(ey) + 6, '#ffcf5a');
    img.set(Math.round(ex) + 1, Math.round(ey) + 6, '#ffcf5a');
    img.set(Math.round(ex), Math.round(ey) + 6, '#fff0c0');
    img.set(Math.round(ex), Math.round(ey) + 7, '#ffcf5a');
  }
  // eave: ragged dark lip + shadow on the wall
  for (let x = 0; x < W; x++) {
    const y = eave(x);
    img.set(x, y + 1, WITCH_ROOF[0]!);
    img.set(x, y, WITCH_ROOF[2]!);
    if (hash(x, 1, seed) < 0.3) img.set(x, y + 2, WITCH_ROOF[0]!);
    for (let k = 2; k < 5; k++) img.blend(x, y + k + 1, '#05030a', 0.42 - k * 0.08);
  }

  // crooked dormer with a round window (left slope)
  {
    const dx = 24;
    const dy = 44;
    for (let j = 0; j < 11; j++) for (let i = -6; i <= 6; i++) img.set(dx + i + (j < 4 ? 1 : 0), dy + j, dp(WALLS.plaster!, 0.45 + (i < -3 ? 0.15 : 0) - (i > 3 ? 0.2 : 0), dx + i, dy + j));
    roundWindow(img, dx + 0.5, dy + 5.5, 3.5, BEAM[0]!);
    windows.push({ x: dx, y: dy + 5 });
    for (let j = 0; j < 8; j++)
      for (let i = -9 + j; i <= 9 - j; i++) {
        const x = dx + i + Math.round(j * 0.35);
        const y = dy + 2 - j;
        img.set(x, y, dp(WITCH_ROOF, 0.6 + (i < 0 ? 0.15 : -0.15) + (j === 7 ? 0.2 : 0) + (i % 3 === 0 ? -0.12 : 0), x, y));
      }
    img.hline(dx - 9, dx + 9, dy + 2, WITCH_ROOF[0]!);
    img.blendRect(dx - 6, dy + 3, 13, 1, '#05030a', 0.5);
  }

  // the zig-zag brick chimney on the right slope
  let chim: Pt;
  {
    const segs: [number, number, number][] = [
      [57, 40, 54],
      [59, 32, 40],
      [62, 24, 32],
      [60, 17, 24],
    ];
    for (const [x, y0, y1] of segs) stonework(img, x, y0, 7, y1 - y0, WALLS.brick!, '#1e1012', { rh: 3, sw: 4, seed: seed + y0, shade: (i) => (i < 2 ? 0.25 : i > 4 ? -0.25 : 0) });
    // soot-dark ledges at each bend
    for (const [x, y0] of segs.slice(1)) img.hline(x - 1, x + 7, y0 + (y0 === 17 ? 0 : 0), '#2a1416');
    img.rect(59, 14, 9, 3, RUBBLE[5]!);
    img.hline(59, 67, 16, RUBBLE[3]!);
    img.rect(61, 11, 2, 3, CLAY[2]!);
    img.set(61, 11, CLAY[4]!);
    img.rect(64, 12, 2, 2, CLAY[3]!);
    chim = { x: 62, y: 11 };
  }

  // --- yard: cauldron (left), broom, pumpkins (right), mushrooms
  cauldron(img, 18, H - 2);
  broom(img, 52, H - 4, 22);
  pumpkin(img, 66, H - 1, 6, 4.5, true);
  pumpkin(img, 75, H - 1, 3.5, 3, false);
  pumpkin(img, 58, H - 1, 3, 2.5, false);
  for (const [mx, my] of [
    [4, H - 2],
    [27, H - 2],
  ] as const) {
    img.rect(mx - 1, my - 3, 3, 1, '#b03a3a');
    img.set(mx, my - 3, '#e8e0d0');
    img.vline(mx, my - 2, my, '#d8ccb0');
  }
  // hanging bottle charms under the right eave
  for (let k = 0; k < 3; k++) {
    const hx = 69 + k * 3;
    const hy = eave(hx) + 2;
    img.vline(hx, hy, hy + 2 + k, IRON[3]!);
    img.rect(hx - 1, hy + 3 + k, 2, 2, ['#3e8a5a', '#a0408a', '#3a6aaa'][k]!);
  }
  void LEAF;

  return finish(img, d, windows, chim);
};
export default art;
