// house-2 — The Weaver's House: a tall half-timbered house with a jettied upper floor on carved
// brackets over an ochre-stone shop, a red-tiled roof with a big loft gable whose hoist beam lowers a
// bale of wool, a wide loom window (warp threads and half-woven cloth in the glow), a shop counter
// of cloth bolts and spools, skeins of dyed yarn hanging under the jetty, and a spool sign hanging
// off the corner (the sprite overhangs 8 px to the right for it).
import { TS } from '../../src/layout.js';
import { chimney, hangingSign, roof, wallTexture, WALLS, type DoorSpec } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { hash, Img, mix } from '../lib/img.js';
import { BEAM, CREAM, dp, finish, flowerBox, frontDoor, GLASS, IRON, OCHRE_STONE, RED_TILE, skein, type Pt } from './lib-houses-a.js';
import type { HouseArt } from './types.js';

const art: HouseArt = (b, style, seed) => {
  const BW = b.footprint.w * TS; // 80: the house body
  const W = BW + 8; // + the sign overhang on the right
  const H = b.footprint.h * TS + 48; // 112
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const cx = (b.door.x - b.footprint.x) * TS + 8; // 40
  const doorBottom = H - 4;
  const jettyY = 80;
  const st = { ...style, roof: 'red' as const, shutters: '#2a3a6a' };

  // --- ground floor: ochre stone shop
  stonework(img, 3, jettyY + 4, BW - 6, H - 4 - jettyY - 4 + 1, OCHRE_STONE, '#1e1612', { rh: 5, sw: 9, seed, shade: (i) => (i < 4 ? 0.14 : i > BW - 12 ? -0.2 : 0) });
  stonework(img, 2, H - 4, BW - 4, 4, OCHRE_STONE.slice(0, 5), '#1a120e', { rh: 4, sw: 7, seed: seed + 1 });

  // loom window (left)
  {
    const x0 = 6;
    const y0 = 89;
    const ww = 20;
    const hh = 12;
    img.rect(x0 - 2, y0 - 2, ww + 4, hh + 4, BEAM[0]!);
    for (let j = 0; j < hh; j++)
      for (let i = 0; i < ww; i++) img.set(x0 + i, y0 + j, dp(GLASS, 0.92 - j / 28 - Math.abs(i - ww / 2) / 40, x0 + i, y0 + j));
    // the loom: frame, warp threads, woven cloth with stripes, the beater bar
    img.rect(x0 + 2, y0 + 1, ww - 4, 1, BEAM[1]!);
    img.vline(x0 + 2, y0 + 1, y0 + hh - 1, BEAM[1]!);
    img.vline(x0 + ww - 3, y0 + 1, y0 + hh - 1, BEAM[1]!);
    for (let i = x0 + 4; i < x0 + ww - 4; i += 2) img.vline(i, y0 + 2, y0 + 6, '#f4e6c0');
    const stripes = ['#a8303a', '#c8a040', '#2e4a8a', '#a8303a', '#e8dcc0'];
    for (let j = 0; j < 4; j++) for (let i = x0 + 3; i < x0 + ww - 3; i++) img.set(i, y0 + 7 + j, mix(stripes[j]!, '#000000', (i + j) % 2 ? 0.15 : 0));
    img.hline(x0 + 3, x0 + ww - 4, y0 + 6, BEAM[2]!);
    img.rect(x0 + 6, y0 + 4, 4, 1, '#d8b070'); // shuttle
    // sill + mullions
    img.hline(x0 - 3, x0 + ww + 2, y0 + hh + 2, OCHRE_STONE[5]!);
    img.hline(x0 - 3, x0 + ww + 2, y0 + hh + 3, OCHRE_STONE[1]!);
    windows.push({ x: x0 + 10, y: y0 + 6 });
  }
  // shop counter window (right): shutter let down as a counter with bolts of cloth and spools
  {
    const x0 = 52;
    const y0 = 90;
    const ww = 21;
    const hh = 9;
    img.rect(x0 - 2, y0 - 2, ww + 4, hh + 3, BEAM[0]!);
    for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) img.set(x0 + i, y0 + j, dp(GLASS, 0.85 - j / 24, x0 + i, y0 + j));
    img.vline(x0 + 7, y0, y0 + hh - 1, BEAM[1]!);
    img.vline(x0 + 14, y0, y0 + hh - 1, BEAM[1]!);
    windows.push({ x: x0 + 10, y: y0 + 4 });
    // counter board
    const cy = y0 + hh;
    for (let i = -3; i < ww + 3; i++) {
      img.set(x0 + i, cy, BEAM[3]!);
      img.set(x0 + i, cy + 1, BEAM[2]!);
      img.set(x0 + i, cy + 2, BEAM[0]!);
    }
    img.set(x0 - 2, cy + 3, BEAM[1]!);
    img.set(x0 + ww + 1, cy + 3, BEAM[1]!);
    // bolts of cloth (rolls seen end-on) and spools on the counter
    const bolts = ['#a8303a', '#2e4a8a', '#c8a040', '#3e6a3a', '#7a3a7a'];
    bolts.forEach((c, k) => {
      const bx = x0 + 1 + k * 4;
      img.rect(bx, cy - 3, 4, 3, c);
      img.hline(bx, bx + 3, cy - 3, mix(c, '#fff1cc', 0.35));
      img.set(bx + 3, cy - 2, mix(c, '#0b0714', 0.4));
      img.set(bx + 1, cy - 2, mix(c, '#0b0714', 0.25));
    });
    for (const [sx, c] of [
      [x0 + 21, '#e8dcc0'],
      [x0 + 24, '#a8303a'],
    ] as const) {
      img.hline(sx - 1, sx + 1, cy - 4, BEAM[3]!);
      img.rect(sx - 1, cy - 3, 3, 2, c);
      img.hline(sx - 1, sx + 1, cy - 1, BEAM[3]!);
    }
  }

  // --- door: indigo (the dyer's blue), panelled, under the jetty
  const spec: DoorSpec = { w: 12, h: 20, arched: false, kind: 'panel', hinge: 'right', paint: '#2a3a6a', wreath: false, seed };
  const { d, x0: dx0 } = frontDoor(img, cx, doorBottom, spec, { jamb: 2 });
  void dx0;

  // --- jetty: the upper floor sails out over carved brackets
  const upTop = 54;
  wallTexture(img, 0, upTop, BW, jettyY - upTop, 'plaster', seed + 3);
  for (let y = upTop; y < jettyY; y++) for (let x = 0; x < BW; x++) img.set(x, y, mix(img.get(x, y), CREAM[3]!, 0.25));
  const tb = (x: number, y: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.set(x + i, y + j, dp(BEAM, 0.6 + (i === 0 || j === 0 ? 0.3 : 0) + (hash(x + i, y + j, 5) - 0.5) * 0.3, x + i, y + j));
  };
  // the weaver's long window: a ribbon of lights right across the upper floor (light for the loom)
  const rwTop = 58;
  const rwH = 8;
  for (let x = 2; x < BW - 2; x++)
    for (let j = 0; j < rwH; j++) {
      const y = rwTop + j;
      img.set(x, y, (x - 2) % 5 === 4 ? BEAM[1]! : dp(GLASS, 0.9 - j / 16 - (hash(Math.floor(x / 5), j, seed) < 0.12 ? 0.25 : 0), x, y));
    }
  for (const wx of [12, 40, 68]) windows.push({ x: wx, y: rwTop + 4 });
  tb(0, rwTop - 2, BW, 2); // head rail
  tb(0, rwTop + rwH, BW, 2); // sill rail
  // posts, and St Andrew's crosses in the panels below the long window
  for (const px of [0, 20, 38, 58, BW - 2]) {
    tb(px, upTop, 2, rwTop - upTop);
    tb(px, rwTop + rwH, 2, jettyY - rwTop - rwH);
  }
  for (const [a0, a1] of [
    [2, 20],
    [22, 38],
    [40, 58],
    [60, BW - 2],
  ] as const) {
    const y0 = rwTop + rwH + 2;
    const y1 = jettyY - 1;
    img.line(a0, y0, a1 - 1, y1, BEAM[1]!);
    img.line(a0, y1, a1 - 1, y0, BEAM[1]!);
    img.line(a0 + 1, y0, a1, y1, BEAM[2]!);
    img.line(a0 + 1, y1, a1, y0, BEAM[2]!);
  }
  // flower boxes along the sill rail
  flowerBox(img, 4, rwTop + rwH + 2, 14, seed + 1);
  flowerBox(img, 62, rwTop + rwH + 2, 14, seed + 2);
  // jetty beam + projecting joist ends + brackets
  for (let x = 0; x < BW; x++) {
    img.set(x, jettyY, BEAM[3]!);
    img.set(x, jettyY + 1, BEAM[2]!);
    img.set(x, jettyY + 2, BEAM[1]!);
    img.set(x, jettyY + 3, BEAM[0]!);
  }
  for (let x = 3; x < BW - 2; x += 6) {
    img.set(x, jettyY + 1, BEAM[3]!);
    img.set(x + 1, jettyY + 1, BEAM[2]!);
    img.set(x, jettyY + 2, BEAM[2]!);
  }
  for (const bx of [4, 31, 48, BW - 6]) {
    for (let k = 0; k < 5; k++) {
      img.hline(bx, bx + 4 - k, jettyY + 4 + k, k === 0 ? BEAM[3]! : BEAM[1]!);
    }
  }
  img.blendRect(3, jettyY + 4, BW - 6, 3, '#05030a', 0.4);
  // hanging lantern (chain from the jetty) left of the door
  {
    const lx = 29;
    img.vline(lx, jettyY + 4, jettyY + 7, IRON[2]!);
    img.rect(lx - 2, jettyY + 8, 5, 1, IRON[1]!);
    img.rect(lx - 2, jettyY + 9, 5, 5, GLASS[3]!);
    img.set(lx - 1, jettyY + 10, GLASS[4]!);
    img.set(lx, jettyY + 10, GLASS[4]!);
    img.vline(lx + 2, jettyY + 9, jettyY + 13, GLASS[2]!);
    img.vline(lx, jettyY + 9, jettyY + 13, IRON[1]!);
    img.rect(lx - 2, jettyY + 14, 5, 1, IRON[1]!);
    img.set(lx, jettyY + 15, IRON[1]!);
    windows.push({ x: lx, y: jettyY + 11 });
  }
  const yarn = ['#a8303a', '#c8a040', '#2e4a8a', '#3e6a3a', '#7a3a7a', '#d87a30'];
  for (let k = 0; k < 6; k++) skein(img, 51 + k * 4, jettyY + 4, yarn[k]!, 5 + (k % 2));

  // --- roof (red tile, hipped) and the loft gable with its hoist
  const roofTop = 18;
  const roofBottom = upTop + 1;
  roof(img, st, 0, BW - 1, roofTop, roofBottom, 11, seed + 5);
  img.blendRect(1, roofBottom + 1, BW - 2, 2, '#05030a', 0.45);
  const chim = chimney(img, 14, 6, roofTop + 12, 'brick', 2, seed);
  {
    const gTop = 4;
    const gBot = roofBottom;
    const halfW = 19;
    const tmp = new Img(W, H);
    wallTexture(tmp, cx - halfW, gTop, halfW * 2, gBot - gTop + 1, 'plaster', seed + 7);
    img.poly(
      [
        [cx - halfW + 3, gBot],
        [cx, gTop + 4],
        [cx + halfW - 3, gBot],
      ],
      (x, y) => mix(tmp.get(x, y), CREAM[3]!, 0.25),
    );
    // timbers in the gable: king post + collar
    for (let y = gTop + 8; y < gBot; y++) img.set(cx - 1, y, y > 34 && y < 49 ? img.get(cx - 1, y) : BEAM[1]!);
    img.hline(cx - 13, cx + 12, 33, BEAM[1]!);
    img.hline(cx - 13, cx + 12, 34, BEAM[2]!);
    // loft door: two leaves thrown open, warm interior, a bolt of cloth inside
    const lx0 = cx - 6;
    const ly0 = 36;
    img.rect(lx0 - 1, ly0 - 1, 14, 14, BEAM[0]!);
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) img.set(lx0 + i, ly0 + j, dp(GLASS, 0.75 - j / 22 - Math.abs(i - 6) / 30, lx0 + i, ly0 + j));
    img.rect(lx0 + 2, ly0 + 8, 8, 4, '#6a2a2a');
    img.hline(lx0 + 2, lx0 + 9, ly0 + 8, '#a8303a');
    windows.push({ x: cx, y: ly0 + 5 });
    for (const [sx, dir] of [
      [lx0 - 5, -1],
      [lx0 + 13, 1],
    ] as const)
      for (let j = 0; j < 12; j++)
        for (let i = 0; i < 4; i++) {
          const x = sx + i;
          img.set(x, ly0 + j, dp(['#141c34', '#1e2a4a', '#2a3a6a', '#3e5084'], (dir < 0 ? 0.7 : 0.35) - (i === (dir < 0 ? 0 : 3) ? 0.3 : 0) + (j % 4 === 0 ? -0.2 : 0), x, ly0 + j));
        }
    img.hline(lx0 - 2, lx0 + 13, ly0 + 13, BEAM[3]!);
    // bargeboards
    for (let side = -1; side <= 1; side += 2)
      for (let t = 0; t <= 1.0001; t += 1 / 90) {
        const x = cx + side * t * halfW;
        const y = gTop + t * (gBot - gTop);
        for (let k = 0; k < 4; k++) img.set(x, y + k - 2, dp(RED_TILE, (k < 1 ? 0.95 : k < 3 ? 0.55 : 0.1) - (side > 0 ? 0.18 : 0), Math.round(x), Math.round(y + k)));
      }
    // hoist beam end + pulley, rope down to a bale of wool swinging by the loft door
    img.rect(cx - 2, gTop + 7, 4, 3, BEAM[3]!);
    img.hline(cx - 2, cx + 1, gTop + 9, BEAM[1]!);
    img.ellipse(cx + 3, gTop + 12, 1.6, 1.6, IRON[3]!);
    img.vline(cx + 4, gTop + 10, 30, '#b8a070');
    img.ellipse(cx + 4.5, 31.5, 4, 3.2, (x, y, nx, ny) => dp(['#8a8070', '#b8ae98', '#ddd2b8', '#f2ead8'], 0.75 - nx * 0.35 - ny * 0.35 + (hash(x, y, 9) - 0.5) * 0.3, x, y));
    img.set(cx + 4, 28, '#8a7a5a');
    img.set(cx + 2, 34, '#9a8a6a');
    img.set(cx + 6, 34, '#9a8a6a');
    // finial
    img.vline(cx, gTop - 1, gTop + 2, BEAM[3]!);
    img.set(cx, gTop - 2, '#c8a040');
    img.blendRect(cx - 14, gBot + 1, 28, 2, '#05030a', 0.35);
  }

  // the weaver's sign: a spool, hanging off the right corner of the jetty
  hangingSign(img, BW - 1, jettyY - 2, 'spool', false);

  void WALLS;
  return finish(img, d, windows, chim);
};
export default art;
