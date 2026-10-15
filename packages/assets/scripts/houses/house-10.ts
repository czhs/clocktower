// house-10 — The Old Cobbler's House: the cobbler lives in an enormous old boot (east-facing).
// The camera sees the boot in profile — heel and laced shaft on the left, the toe pointing at the
// lane — with a mossy little roof and dormer capping the shaft (crooked stovepipe), a shop window of
// tiny shoes under a striped awning, and the front door set into the turned-up toe.
import type { HouseArt } from './types.js';
import { BRASS, dormer, GLASS, IRON, paintWindow, place, roof, wallLantern } from '../buildings.js';
import { dpick, hash, Img, mix, vnoise } from '../lib/img.js';
import { finish, groundLine, sideDoor, type Pt } from './lib-houses-c.js';

const LEATHER = ['#241014', '#3c1a18', '#58281e', '#763a26', '#955230', '#b26c3e', '#cc8a52'];
const TAN = ['#3a2416', '#5a3a20', '#7e5630', '#a27442', '#c29458', '#dcb478'];
const SOLE = ['#120c10', '#1e161a', '#2c2226', '#3c3034'];
const LACE = '#e8dcc0';

const art: HouseArt = (b, style, seed) => {
  const W = b.footprint.w * 16;
  const H = b.footprint.h * 16 + 16;
  const img = new Img(W, H);
  const windows: Pt[] = [];
  const NOSE = 48; // the toe turns away from the camera from here on (oblique, like a side wall)
  const nb = (x: number) => (x < NOSE ? H - 1 : groundLine(H, NOSE)(x)); // bottom of the sole
  const ub = (x: number) => nb(x) - 4; // last leather row
  const SHAFT_R = 33;
  const SHAFT_TOP = 22;
  const xl = (y: number) => (y < 62 ? 5 : y < 80 ? 5 - Math.round((y - 62) / 9) : 3);
  const vt = (x: number) => {
    // top edge of the foot (instep -> toe), a rounded superellipse
    const t = Math.min(1, (x - SHAFT_R) / 30);
    return 91 - 39 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 1 / 2.4);
  };

  // --- the leather upper
  for (let y = SHAFT_TOP; y < H; y++)
    for (let x = 0; x < W - 1; x++) {
      if (y > ub(x) || x < xl(y)) continue;
      const inShaft = x <= SHAFT_R;
      if (!inShaft && (x > 62 || y < vt(x))) continue;
      let v: number;
      if (inShaft && y < 56) {
        // cylinder lit from the left, with a soft sheen
        const u = (x - xl(y)) / (SHAFT_R - xl(y));
        v = 0.66 - u * 0.36 + Math.max(0, 0.2 - Math.abs(u - 0.2) * 1.4);
      } else {
        const top = inShaft ? 99 : y - vt(x);
        v = 0.5 + (top < 2 ? 0.3 : top < 5 ? 0.15 : 0) - (y > ub(x) - 3 ? 0.14 : 0);
        if (x < 10) v += 0.08;
        if (x >= NOSE) v -= 0.06 + (x - NOSE) * 0.012;
      }
      // creases and wear
      v += (vnoise(x, y * 2.5, 5, seed) - 0.5) * 0.1;
      if (hash(x, y, seed) < 0.01) v -= 0.16;
      img.set(x, y, dpick(LEATHER, v, x, y));
    }
  // instep creases (an old, well-worn boot)
  for (let k = 0; k < 3; k++) {
    const x0 = 33 + k * 3;
    for (let s = 0; s < 6; s++) {
      const x = x0 + s;
      const y = Math.round(vt(x)) + 2 + Math.round(s * 0.5) + k;
      img.set(x, y, LEATHER[1]!);
      img.set(x, y - 1, LEATHER[5]!);
    }
  }
  // quarter/vamp seam: a stitched curve from the instep down to the sole
  for (let y = 55; y <= 90; y++) {
    const x = Math.round(31 - (y - 55) * 0.22);
    img.set(x + 1, y, LEATHER[1]!);
    if (y % 3 !== 0) img.set(x, y, mix(TAN[4]!, LEATHER[3]!, 0.3));
  }
  // a stitched patch on the heel side
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 9; i++) {
      const x = 7 + i;
      const y = 72 + j;
      const edge = i === 0 || j === 0 || i === 8 || j === 7;
      img.set(x, y, edge ? ((i + j) % 2 ? TAN[5]! : TAN[2]!) : dpick(TAN, 0.42 + (j < 2 ? 0.15 : 0) + (hash(i, j, 3) - 0.5) * 0.2, x, y));
    }
  // the welt: stitches just above the sole, brass nails at the heel
  for (let x = 4; x < 62; x++) if (x % 2 === 0) img.set(x, ub(x), TAN[4]!);

  // --- sole and heel
  for (let x = 2; x < 63; x++) {
    const top = ub(x) + 1;
    const arch = x >= 20 && x <= 28;
    const heel = x <= 18;
    const bot = arch ? top + 1 : nb(x);
    if (x === 2 && !heel) continue;
    for (let y = top; y <= bot; y++) {
      let v = 0.55 - (y - top) * 0.12;
      if (y === top) v = 0.85;
      if (heel && (y - top) % 2 === 1) v -= 0.25; // stacked leather heel
      img.set(x, y, dpick(SOLE, v, x, y));
    }
  }
  for (const x of [5, 9, 13, 17]) img.set(x, H - 2, BRASS[3]!);

  // --- folded cuff
  for (let y = SHAFT_TOP; y < SHAFT_TOP + 8; y++)
    for (let x = 4; x <= SHAFT_R + 1; x++) {
      const u = (x - 4) / (SHAFT_R - 3);
      let v = 0.7 - u * 0.45 + (y === SHAFT_TOP ? 0.25 : 0) - (y === SHAFT_TOP + 7 ? 0.35 : 0);
      if (y === SHAFT_TOP + 5 && x % 2 === 0) v = 0.95; // stitch line
      img.set(x, y, dpick(TAN, v + (hash(x, y, seed + 2) - 0.5) * 0.12, x, y));
    }

  // --- the lacing up the front of the shaft: tongue, brass eyelets, criss-crossed laces, a bow
  for (let y = SHAFT_TOP + 8; y < 55; y++)
    for (let x = 28; x <= 32; x++) img.set(x, y, dpick(TAN, 0.42 - (x - 28) * 0.06 + (x === 28 ? -0.2 : 0), x, y));
  for (let y = SHAFT_TOP + 10; y < 54; y += 5) {
    img.set(27, y, BRASS[4]!);
    img.set(33, y, BRASS[2]!);
    if (y + 5 < 54) {
      img.line(27, y, 33, y + 4, LACE);
      img.line(33, y, 27, y + 4, mix(LACE, '#5a4a40', 0.35));
    }
  }
  // bow: two loops out over the instep and the dangling ends
  const bx = 34;
  const by = SHAFT_TOP + 10;
  for (const [dx, dy] of [
    [1, -1], [2, -2], [3, -2], [3, -1], [2, 0],
    [1, 1], [2, 2], [3, 2], [3, 3], [2, 3],
  ] as const)
    img.set(bx + dx, by + dy, LACE);
  for (let k = 0; k < 6; k++) img.set(bx + 1 + (k > 3 ? 1 : 0), by + 4 + k, mix(LACE, '#8a7a60', 0.25));
  img.set(bx, by, LACE);

  // --- windows in the shaft
  {
    const win = paintWindow(style, 7, 10, true, seed);
    place(img, win, (i, j) => [7 + i, 34 + j]);
    windows.push({ x: 14, y: 40 });
    img.rect(7, 46, 15, 2, TAN[4]!);
    img.hline(7, 21, 47, TAN[1]!);
    const win2 = paintWindow(style, 6, 6, false, seed + 1);
    place(img, win2, (i, j) => [10 + i, 55 + j]);
    windows.push({ x: 13, y: 58 });
    // window box with flowers
    img.rect(9, 63, 10, 3, '#4a2e1e');
    img.hline(9, 18, 63, '#6a4430');
    for (let i = 0; i < 10; i++) {
      img.set(9 + i, 62, i % 2 ? '#3a6232' : '#28482a');
      if (hash(i, 7, seed) < 0.6) img.set(9 + i, 62 - (i % 2), ['#c0304a', '#e8e0d0', '#e8a030'][i % 3]!);
    }
  }

  // --- the shop window: tiny shoes on display, under a striped awning
  {
    const x0 = 29;
    const y0 = 72;
    const w = 15;
    const h = 12;
    img.rect(x0 - 1, y0 - 1, w + 2, h + 2, '#1a110c');
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) img.set(x0 + i, y0 + j, dpick(GLASS, 0.82 - j / (h * 1.8) - Math.abs(i + 0.5 - w / 2) / (w * 2.6), x0 + i, y0 + j));
    img.vline(x0 + 7, y0, y0 + h - 1, '#271a12');
    // display shelf and shoes
    img.hline(x0, x0 + w - 1, y0 + 8, '#462f22');
    const shoe = (x: number, y: number, c: string, boot: boolean) => {
      img.rect(x, y - 1, 4, 2, c);
      img.set(x + 4, y, c);
      if (boot) img.rect(x, y - 4, 2, 3, c);
      img.set(x, y - (boot ? 4 : 1), mix(c, '#fff1cc', 0.4));
    };
    shoe(x0 + 1, y0 + 7, '#2a1418', true);
    shoe(x0 + 9, y0 + 7, '#8a2028', false);
    shoe(x0 + 2, y0 + 11, '#5a3a20', false);
    shoe(x0 + 9, y0 + 11, '#1e2a3a', true);
    windows.push({ x: x0 + 7, y: y0 + 5 });
    // sill
    img.rect(x0 - 2, y0 + h + 1, w + 4, 2, TAN[3]!);
    img.hline(x0 - 2, x0 + w + 1, y0 + h + 2, TAN[1]!);
    // awning: alternating stripes in the shutter colour and cream, scalloped hem
    const ac = style.shutters;
    for (let j = 0; j < 6; j++)
      for (let i = -3 + Math.floor(j / 2); i < w + 3 - Math.floor(j / 2) + j; i++) {
        const x = x0 + i - Math.floor(j / 2) + Math.floor(j / 3);
        const y = y0 - 7 + j;
        const stripe = Math.floor((i + 40) / 3) % 2 === 0;
        const base = stripe ? ac : '#e6d8b8';
        img.set(x, y, mix(base, j < 2 ? '#fff1cc' : '#0b0714', j < 2 ? 0.15 : j * 0.05));
      }
    for (let i = -1; i < w + 5; i++) {
      const x = x0 + i;
      if (i % 3 !== 2) img.set(x, y0 - 1, mix(Math.floor((i + 43) / 3) % 2 === 0 ? ac : '#e6d8b8', '#0b0714', 0.3));
    }
  }

  // --- front door in the turned-up toe, lamp beside it
  const { d } = sideDoor(img, { x0: 49, base: nb, paint: '#2f6a5a', seed, kind: 'planks', arched: true });
  wallLantern(img, 46, 67, true);
  windows.push({ x: 47, y: 63 });

  // --- a little mossy hipped roof capping the shaft, a dormer, a crooked stovepipe
  const rs = { ...style, roof: 'moss' as const };
  roof(img, rs, 0, 38, 3, 25, 9, seed + 5);
  img.blendRect(4, 26, 30, 2, '#05030a', 0.4);
  windows.push(dormer(img, rs, 14, 6, seed));
  // stovepipe: up through the roof, a kink, a little cap
  const pipe = ['#2a2632', '#4a4452', '#6a6474', '#8a8496'];
  for (let y = 6; y <= 14; y++) for (let i = 0; i < 3; i++) img.set(24 + i, y, pipe[i === 0 ? 3 : i === 1 ? 2 : 1]!);
  for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) img.set(24 + Math.ceil(k / 2) + i, 5 - k, pipe[i === 0 ? 3 : i === 1 ? 2 : 1]!);
  img.rect(26, 1, 5, 1, pipe[3]!);
  img.rect(27, 0, 3, 1, pipe[2]!);
  img.hline(24, 26, 10, IRON[0]!);
  const chim = { x: 28, y: 1 };

  return finish(img, d, windows, chim);
};
export default art;
