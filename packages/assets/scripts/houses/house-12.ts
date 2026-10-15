// house-12 — Rookery House: a tall, narrow, crooked half-timbered townhouse (east-facing). A stone
// ground floor carries two jettied timber storeys that step out over the street and lean a little
// further each floor, under a steep tiled gable with a rook weathervane; a leaded oriel bay
// window, a leaning chimney and the rooks themselves on the ridge. Door in the stone side wall.
import type { HouseArt } from './types.js';
import { BEAM, BRASS, GLASS, IRON, paintWindow, ROOFS, STONE, wallLantern, WALLS } from '../buildings.js';
import { stonework } from '../lib/draw.js';
import { type Color, dpick, hash, Img, mix, vnoise } from '../lib/img.js';
import { finish, groundLine, rise, shearPlace, sideDoor, type Pt } from './lib-houses-c.js';

const OCHRE = ['#4a3a22', '#6a5430', '#8a7040', '#a88a50', '#c0a462', '#d4bc7a'];
const TIMBER = ['#120c0a', '#1e1410', '#2c1e16', '#3c2a1e'];

const art: HouseArt = (b, style, seed) => {
  const W = b.footprint.w * 16;
  const H = b.footprint.h * 16 + 16;
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const SIDE_SHADE = 0.26;

  /** A storey: front face x0..x1 (incl.), rows y0..y1, and its side wall (sw px, sheared). */
  const storey = (x0: number, x1: number, y0: number, y1: number, sw: number, paint: (i: number, j: number, w: number, h: number, side: boolean) => Color, lean = 0) => {
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const sh = (j: number) => Math.round((h - 1 - j) * lean);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.set(x0 + i + sh(j), y0 + j, paint(i, j, w, h, false));
    for (let j = 0; j < h; j++)
      for (let i = 0; i < sw; i++) img.set(x1 + 1 + i + sh(j), y1 - rise(i) - (h - 1 - j), mix(paint(i, j, sw, h, true), "#0b0714", SIDE_SHADE));
    // corner shadow
    for (let j = 0; j < h; j++) img.set(x1 + sh(j), y0 + j, mix(img.get(x1 + sh(j), y0 + j), "#000000", 0.3));
  };
  const timber = (style2: 'studs' | 'cross') => (i: number, j: number, w: number, h: number, side: boolean): Color => {
    const post = i < 2 || i >= w - 2 || j < 1 || j >= h - 1;
    let beam = post;
    if (style2 === 'studs') beam ||= i % 5 === 0 || j === Math.floor(h / 2);
    else {
      const pi = (i - 2) % 9;
      const pj = j - 1;
      beam ||= pi === 0 || (pj >= 0 && pj < 9 && (Math.abs(pi - 1 - pj * 0.9) < 0.7 || Math.abs(pi - 1 - (8 - pj) * 0.9) < 0.7));
    }
    if (beam) return dpick(TIMBER, 0.55 + (j === 0 ? 0.3 : 0) + (hash(i, j, seed) - 0.5) * 0.25, i, j);
    const v = 0.6 + (vnoise(i + (side ? 50 : 0), j, 5, seed) - 0.5) * 0.3 + (i < 4 && !side ? 0.1 : 0) - (hash(i, j, seed + 1) < 0.04 ? 0.25 : 0);
    return dpick(OCHRE, v, i + (side ? 7 : 0), j);
  };

  // --- ground floor: stone, with the front door in its side wall
  const G0 = { x0: 4, x1: 35, y0: 72, y1: H - 1 };
  {
    const stone = new Img(W, H);
    stonework(stone, 0, 0, W, H, STONE, '#141118', { rh: 5, sw: 8, seed, shade: (i) => (i < 8 ? 0.16 : 0) });
    storey(G0.x0, G0.x1, G0.y0, G0.y1, 24, (i, j, w, _h, side) => stone.get(i + (side ? 30 : G0.x0), j + G0.y0));
  }
  // jetty beam 1 + brackets
  const jetty = (x0: number, x1: number, y: number, sw: number, brackets: number[]) => {
    for (let x = x0; x <= x1; x++) {
      img.set(x, y, dpick(TIMBER, 0.95, x, y));
      img.set(x, y + 1, dpick(TIMBER, 0.5, x, y + 1));
      img.set(x, y + 2, TIMBER[0]!);
    }
    for (let k = 0; k < sw; k++) {
      const x = x1 + 1 + k;
      const yy = y - rise(k);
      img.set(x, yy, mix(TIMBER[3]!, '#0b0714', 0.2));
      img.set(x, yy + 1, TIMBER[1]!);
      img.set(x, yy + 2, TIMBER[0]!);
    }
    for (const bx of brackets)
      for (let k = 0; k < 4; k++) {
        img.hline(bx - (3 - k) + 1, bx, y + 3 + k, k === 0 ? TIMBER[3]! : TIMBER[1]!);
        img.set(bx - (3 - k) + 1, y + 3 + k, TIMBER[3]!);
      }
  };
  // --- first floor: close-studded timber with ochre infill, jettied out 2 px
  const S1 = { x0: 2, x1: 37, y0: 52, y1: 69 };
  storey(S1.x0, S1.x1, S1.y0, S1.y1, 24, timber("studs"), 0.06);
  jetty(1, 38, 69, 24, [6, 20, 34]);
  // --- second floor: decorative cross-bracing, jettied again and leaning right
  const S2 = { x0: 1, x1: 40, y0: 34, y1: 50 };
  storey(S2.x0, S2.x1, S2.y0, S2.y1, 22, timber("cross"), 0.13);
  jetty(0, 41, 50, 22, [5, 21, 37]);

  // --- windows
  // ground floor: a stout mullioned window
  {
    const win = paintWindow(style, 10, 8, true, seed);
    for (let j = 0; j < win.h; j++) for (let i = 0; i < win.w; i++) if (win.get(i, j)[3]) img.set(11 + i, 78 + j, win.get(i, j));
    windows.push({ x: 19, y: 82 });
    img.rect(11, 88, win.w, 2, STONE[5]!);
    img.hline(11, 11 + win.w - 1, 89, STONE[2]!);
  }
  // first floor: a projecting oriel with leaded diamond panes
  {
    const ox = 9;
    const ow = 20;
    const oy = 55;
    const oh = 11;
    // little sloped roof on top
    const rp = ROOFS[style.roof] ?? ROOFS.red!;
    for (let j = 0; j < 3; j++) for (let i = -1 - j; i < ow + 1 + j; i++) img.set(ox + i, oy - 3 + j, dpick(rp, 0.85 - j * 0.25 - (i > ow / 2 ? 0.1 : 0), ox + i, oy - 3 + j));
    // frame + glass
    img.rect(ox - 1, oy, ow + 2, oh + 1, TIMBER[1]!);
    for (let j = 0; j < oh - 1; j++)
      for (let i = 0; i < ow; i++) {
        const x = ox + i;
        const y = oy + 1 + j;
        const lead = (i + j) % 4 === 0 || (i - j + 40) % 4 === 0;
        const mull = i === 6 || i === 13;
        if (mull) img.set(x, y, TIMBER[2]!);
        else img.set(x, y, lead ? mix(GLASS[1]!, '#2a1a10', 0.45) : dpick(GLASS, 0.9 - j / 18 - Math.abs(i - ow / 2) / 40, x, y));
      }
    // the bay's sill and its bracketed base
    for (let k = 0; k < 4; k++) img.hline(ox + k, ox + ow - 1 - k, oy + oh + k, k === 0 ? TIMBER[3]! : dpick(TIMBER, 0.4, ox, oy + oh + k));
    windows.push({ x: ox + 3, y: oy + 5 }, { x: ox + ow - 4, y: oy + 5 });
  }
  // second floor: a pair of small casements
  for (const wx of [5, 27]) {
    const win = paintWindow(style, 6, 7, false, seed + wx);
    for (let j = 0; j < win.h; j++) for (let i = 0; i < win.w; i++) if (win.get(i, j)[3]) img.set(wx + 1 + i + (j < 4 ? 1 : 0), 38 + j, win.get(i, j));
  }
  windows.push({ x: 10, y: 42 }, { x: 32, y: 42 });
  // side windows (sheared)
  {
    const win = paintWindow(style, 5, 7, false, seed + 9);
    shearPlace(img, win, S1.x1 + 9, (x) => S1.y1 - rise(x - S1.x1 - 1), 5);
    const win2 = paintWindow(style, 4, 5, false, seed + 10);
    shearPlace(img, win2, S2.x1 + 8, (x) => S2.y1 - rise(x - S2.x1 - 1), 5);
  }

  // --- the front door in the stone side wall, lamp beyond it
  const base0 = groundLine(H, G0.x1 + 1);
  const { d } = sideDoor(img, { x0: G0.x1 + 6, base: base0, paint: '#7a2a2a', seed, kind: 'panel', arched: true, h: 19 });
  const lx = G0.x1 + 19;
  wallLantern(img, lx, base0(lx) - 12, true);
  windows.push({ x: lx + 1, y: base0(lx) - 15 });

  // --- steep crooked gable + the near roof slope (half-hipped at the back so it stays on canvas)
  const pal = ROOFS[style.roof] ?? ROOFS.red!;
  const ay = 13;
  const ax = 25; // the apex leans right of the gable middle
  const eaveY = S2.y0 + 1;
  const gl = S2.x0 + 1;
  const gr = S2.x1 + 3;
  {
    // near slope: right barge -> ridge (receding) -> hip down to the back corner
    const poly: [number, number][] = [
      [gr + 1, eaveY + 1],
      [ax, ay],
      [ax + 16, ay - 8],
      [W - 1, eaveY - 11],
      [W - 1, eaveY - 9],
      [gr + 1 + 22, eaveY + 1 - 11],
    ];
    img.poly(poly, (x, y) => {
      const lyy = y - (ay + (x - ax) * ((eaveY - ay) / (gr - ax)));
      const k = y + Math.floor((x - gr) / 2); // courses parallel to the eave
      let v = 0.42 + (y - ay) * -0.006 + (k % 4 === 3 ? -0.25 : 0) + (k % 4 === 0 ? 0.06 : 0);
      if ((x + (Math.floor(k / 4) % 2) * 3) % 6 === 0 && k % 4 !== 3) v -= 0.15;
      if (x > ax + 16 + (y - (ay - 8)) * 1.6) v -= 0.12; // hip face
      void lyy;
      return dpick(pal, v + (hash(x, y, seed) - 0.5) * 0.1, x, y);
    });
    // eave line along the side wall
    for (let k = 0; k <= 22; k++) {
      img.set(gr + 1 + k, eaveY + 1 - rise(k), pal[0]!);
      img.set(gr + 1 + k, eaveY - rise(k), pal[1]!);
    }
    // ridge
    for (let k = 0; k <= 16; k++) img.set(ax + k, ay - Math.round(k / 2), pal[5]!);
  }
  // gable wall: ochre plaster with a king post and a pointed attic light
  img.poly(
    [
      [gl + 2, eaveY],
      [ax + 0.5, ay + 3],
      [gr - 1, eaveY],
    ],
    (x, y) => {
      if (Math.abs(x - ax) < 1 && y > ay + 13) return TIMBER[2]!;
      if (y === eaveY - 1 || y === ay + 14) return TIMBER[1]!;
      return dpick(OCHRE, 0.62 + (x < ax ? 0.08 : -0.08) + (vnoise(x, y, 4, seed + 3) - 0.5) * 0.25, x, y);
    },
  );
  {
    // pointed attic window
    const wx = ax - 3;
    const wy = ay + 15;
    for (let j = 0; j < 9; j++)
      for (let i = 0; i < 7; i++) {
        if (j < 3 && Math.abs(i - 3) > j + 0.5) continue;
        const edge = i === 0 || i === 6 || j === 8 || (j < 3 && Math.abs(i - 3) > j - 0.5);
        img.set(wx + i, wy + j, edge ? TIMBER[1]! : i === 3 ? TIMBER[2]! : dpick(GLASS, 0.85 - j * 0.05, wx + i, wy + j));
      }
    windows.push({ x: ax, y: wy + 5 });
  }
  // barge boards, carved, with a slight sag on the left (the crooked old house)
  for (const side of [-1, 1]) {
    const ex = side < 0 ? gl : gr + 1;
    const n = 80;
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const x = ax + 0.5 + (ex - ax - 0.5) * t;
      const sag = side < 0 ? Math.sin(t * Math.PI) * 1.6 : 0;
      const y = ay + (eaveY + 2 - ay) * t + sag;
      for (let k = 0; k < 4; k++) {
        const v = k < 1 ? 0.95 : k < 3 ? 0.5 : 0.08;
        img.set(x, y + k - 2, dpick(pal, v + (side > 0 ? -0.12 : 0.04), Math.round(x), Math.round(y + k)));
      }
    }
  }
  // rooks: a little 9x7 pixel sprite (facing right unless flipped)
  const ROOK = ['......##.', '.....###b', '....####.', '#.######.', '.##s#s##.', '..#####..', '...l..l..'];
  const rook = (x: number, y: number, flip: boolean) => {
    ROOK.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        if (ch === '.') return;
        const px = flip ? x + 8 - i : x + i;
        img.set(px, y + j, ch === 'b' ? '#8a8496' : ch === 's' ? '#3a3452' : ch === 'l' ? '#2a2632' : '#0e0a12');
      }),
    );
  };
  // finial + rook weathervane at the apex
  img.vline(ax, ay - 7, ay - 1, IRON[3]!);
  img.hline(ax - 3, ax + 3, ay - 4, IRON[2]!);
  img.set(ax - 3, ay - 5, IRON[3]!);
  img.set(ax + 3, ay - 3, IRON[3]!);
  img.set(ax, ay - 2, BRASS[4]!);
  rook(ax - 5, ay - 13, false);
  // leaning brick chimney on the slope, two clay pots
  let chim: Pt;
  {
    const cx = 47;
    const top = 4;
    const bottom = 26;
    const bw = 6;
    for (let y = top + 2; y <= bottom; y++) {
      const lean = Math.round((bottom - y) * 0.12);
      for (let i = 0; i < bw; i++) {
        const x = cx + i + lean;
        const brick = (y + (Math.floor((x - lean + (Math.floor(y / 3) % 2) * 2) / 4) % 2 ? 0 : 0)) % 3 === 2 || (x - lean + (Math.floor(y / 3) % 2) * 2) % 4 === 0;
        img.set(x, y, brick ? '#1e1012' : dpick(WALLS.brick!, 0.75 - i * 0.12, x, y));
      }
    }
    const lean = Math.round((bottom - top) * 0.12);
    img.rect(cx - 1 + lean, top + 1, bw + 2, 2, STONE[5]!);
    img.hline(cx - 1 + lean, cx + bw + lean, top + 2, STONE[3]!);
    img.rect(cx + lean, top - 1, 2, 2, '#8a4a2a');
    img.rect(cx + 3 + lean, top - 2, 2, 3, '#b06a3a');
    img.set(cx + 3 + lean, top - 2, '#d08a52');
    chim = { x: cx + 4 + lean, y: top - 2 };
  }
  rook(ax + 5, ay - 11, false);
  rook(chim.x - 6, chim.y - 9, true);
  // ivy up the lit corner of the stone floor
  for (let y = 74; y < H - 1; y++)
    for (let x = G0.x0; x < G0.x0 + 7; x++) {
      const n = vnoise(x, y, 2.5, seed + 31);
      if (n < 0.45 + (x - G0.x0) / 12 + (H - y) / 90) continue;
      img.set(x, y, dpick(['#122016', '#1c3220', '#28482a', '#3a6232', '#567e3e'], 0.3 + n * 0.6, x, y));
    }
  void BEAM;

  return finish(img, d, windows, chim);
};
export default art;
