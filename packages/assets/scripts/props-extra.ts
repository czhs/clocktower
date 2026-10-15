// Domestic kit, town-structure landmarks and high-use prop variants (world-art, assets-world).
// Clean style per docs/art-direction.md: guide palette swatches, 3 value steps per material
// (shadow / body / light) picked by thresholds (no dithering, no per-pixel noise), light from the
// upper left, 1 px Soot contour on the lower/right edges and a softened contour on lit edges,
// soft Soot contact shadow toward the lower right. Sizes must match PROP_DEFS (src/layout.ts).
import { Img, mix, hash, vnoise, type Color } from './lib/img.js';
import { canopy } from './lib/draw.js';

// ---------------------------------------------------------------------------------------
// Palette (docs/art-direction.md, "Master palette")
export const C = {
  soot: '#191C29',
  iron: '#333646',
  wiron: '#626979',
  mortar: '#353442',
  plum: '#505061',
  wstone: '#747383',
  chalk: '#A39DAB',
  charred: '#30282C',
  heart: '#594034',
  oak: '#876044',
  worn: '#B18C62',
  oldpl: '#8B8277',
  lime: '#BDB3A0',
  linen: '#DED2B7',
  wet: '#3B3330',
  trod: '#66503D',
  dry: '#937354',
  pine: '#243A34',
  moss: '#3F5540',
  leaf: '#64774B',
  tip: '#91A46A',
  deep: '#1F3046',
  river: '#304F6B',
  ripple: '#577B93',
  foam: '#A6C5CA',
  plumS: '#30243F',
  plumC: '#574064',
  plumF: '#806184',
  wineS: '#492C3B',
  wine: '#814953',
  wineF: '#B37072',
  tealS: '#243F44',
  teal: '#41676A',
  tealF: '#729395',
  ochre: '#665032',
  brass: '#A38348',
  brassE: '#D5B56A',
  ember: '#D98043',
  lamp: '#F0B85F',
  flame: '#FFE2A0',
  strawS: '#493C2D',
  straw: '#77603B',
  strawC: '#AE8C4E',
  strawT: '#D1B879',
  fired: '#402832',
  oxide: '#713E3D',
  clay: '#A65F4B',
  tile: '#C98967',
  slateS: '#252C41',
  slateD: '#394764',
} as const;

/** Three value steps: shadow, body, light. */
export type R3 = readonly [string, string, string];
export const WOOD3: R3 = [C.heart, C.oak, C.worn];
export const DWOOD3: R3 = [C.charred, C.heart, C.oak];
export const STONE3: R3 = [C.plum, C.wstone, C.chalk];
export const IRON3: R3 = [C.soot, C.iron, C.wiron];
export const BRASS3: R3 = [C.ochre, C.brass, C.brassE];
export const STRAW3: R3 = [C.straw, C.strawC, C.strawT];
export const LEAF3: R3 = [C.pine, C.moss, C.leaf];
export const LINEN3: R3 = [C.oldpl, C.lime, C.linen];
export const WINE3: R3 = [C.wineS, C.wine, C.wineF];
export const TEAL3: R3 = [C.tealS, C.teal, C.tealF];
export const PLUM3: R3 = [C.plumS, C.plumC, C.plumF];
export const PAPER3: R3 = [C.trod, C.dry, C.worn];
export const CLAY3: R3 = [C.oxide, C.clay, C.tile];

const LX = -0.62;
const LY = -0.78;

/** Shaded oval lit from the upper left; `hi` / `lo` thresholds pick the 3 steps. */
export function oval(img: Img, cx: number, cy: number, rx: number, ry: number, r: R3, hi = 0.35, lo = -0.25) {
  img.ellipse(cx, cy, rx, ry, (_x, _y, nx, ny) => {
    const l = nx * LX + ny * LY;
    return l > hi ? r[2] : l < lo ? r[0] : r[1];
  });
}

/** 3/4 box: top face (light) `top` rows, front face body, right column + bottom row shadow. */
export function slab(img: Img, x: number, y: number, w: number, h: number, top: number, r: R3) {
  img.rect(x, y, w, top, r[2]);
  img.rect(x, y + top, w, h - top, r[1]);
  img.vline(x + w - 1, y + top, y + h - 1, r[0]);
  img.hline(x, x + w - 1, y + h - 1, r[0]);
  if (top > 0) img.hline(x, x + w - 1, y + top, r[0]);
}

/** Vertical round post/cylinder shading (light left, shadow right). */
export function post(img: Img, x: number, y0: number, w: number, y1: number, r: R3) {
  for (let i = 0; i < w; i++) img.vline(x + i, y0, y1, i === 0 && w > 1 ? r[2] : i === w - 1 && w > 2 ? r[0] : r[1]);
}

/** Soft contact/cast shadow toward the lower right (Soot ~28%). */
export function cast(img: Img, cx: number, cy: number, rx: number, ry: number, a = 0.28) {
  img.ellipse(cx + 2, cy, rx, ry, (x, y) => (img.alpha(x, y) > 0 ? null : ([25, 28, 41, Math.round(a * 255)] as const)));
}

/**
 * Contour: transparent (or shadow) pixels next to the sprite get Soot on the lower/right side and
 * a darkened neighbour colour on the lit upper/left side.
 */
export function finish(img: Img, lit = 0.55) {
  const src = new Uint8ClampedArray(img.data);
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : src[(y * img.w + x) * 4 + 3]!);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (A(x, y) >= 100) continue;
      if (A(x, y - 1) >= 100 || A(x - 1, y) >= 100) {
        img.set(x, y, C.soot);
        continue;
      }
      for (const [nx, ny] of [
        [x, y + 1],
        [x + 1, y],
      ] as const) {
        if (A(nx, ny) >= 100) {
          const i = (ny * img.w + nx) * 4;
          img.set(x, y, mix([src[i]!, src[i + 1]!, src[i + 2]!, 255], C.soot, lit));
          break;
        }
      }
    }
}

const px = (img: Img, pts: [number, number][], c: Color) => {
  for (const [x, y] of pts) img.set(x, y, c);
};

// =========================================================================================
// Domestic kit (interiors)

export function boots(img: Img) {
  cast(img, 9, 14, 6, 1.5);
  const boot = (x: number, y: number, toeRight: boolean) => {
    // shaft
    img.rect(x, y, 4, 7, C.heart);
    img.vline(x, y, y + 6, C.oak);
    img.vline(x + 3, y, y + 6, C.charred);
    img.hline(x, x + 3, y, C.worn); // cuff
    // foot
    const fx = toeRight ? x : x - 2;
    img.rect(fx, y + 7, 6, 2, C.heart);
    img.hline(fx, fx + 5, y + 7, C.oak);
    img.hline(fx, fx + 5, y + 8, C.charred);
  };
  boot(3, 5, true);
  boot(9, 6, true);
  finish(img);
}

export function coatstand(img: Img) {
  const b = img.h - 2;
  cast(img, 8, b, 6, 1.5);
  // feet
  img.hline(3, 12, b, C.heart);
  img.hline(4, 11, b - 1, C.oak);
  post(img, 7, 4, 2, b - 1, [C.heart, C.oak, C.worn]);
  img.vline(7, 4, b - 1, C.oak);
  img.vline(8, 4, b - 1, C.heart);
  img.rect(6, 3, 4, 1, C.worn);
  px(img, [
    [5, 5],
    [10, 5],
  ], C.oak);
  // coat on the left peg
  img.poly(
    [
      [4, 6],
      [7, 6],
      [8, 21],
      [2, 21],
    ],
    (x, y) => (x <= 3 ? C.wineF : x >= 7 ? C.wineS : y > 18 ? C.wineS : C.wine),
  );
  img.hline(3, 7, 21, C.wineS);
  img.vline(5, 9, 17, C.wineS); // front opening
  // hat on the right peg
  img.rect(9, 6, 5, 1, C.plumS);
  img.rect(10, 3, 3, 3, C.plumC);
  img.vline(10, 3, 5, C.plumF);
  // scarf
  img.vline(11, 7, 12, C.tealF);
  img.vline(12, 7, 11, C.teal);
  finish(img);
}

export function blanket(img: Img) {
  cast(img, 8, 13, 6, 1.5);
  slab(img, 2, 9, 12, 5, 2, TEAL3);
  img.hline(2, 13, 11, C.tealS);
  slab(img, 3, 5, 10, 5, 2, LINEN3);
  img.hline(3, 12, 7, C.oldpl);
  // stitched stripe on the top blanket
  img.hline(4, 11, 6, C.wineF);
  finish(img);
}

export function basket(img: Img) {
  cast(img, 8, 13, 6, 1.5);
  // body (woven)
  for (let y = 8; y < 14; y++)
    for (let x = 3; x < 13; x++) {
      const inset = y === 13 ? 1 : 0;
      if (x < 3 + inset || x > 12 - inset) continue;
      const weave = (x + (y >> 1)) % 3 === 0;
      img.set(x, y, x > 10 ? C.straw : weave ? C.straw : C.strawC);
    }
  img.hline(3, 12, 8, C.strawT);
  // contents: yarn balls + needles
  oval(img, 6, 7, 2.2, 1.8, PLUM3);
  oval(img, 9.5, 7, 2.2, 1.8, TEAL3);
  img.line(8, 3, 12, 7, C.worn);
  img.set(8, 3, C.linen);
  finish(img);
}

export function broom(img: Img) {
  const b = img.h - 2;
  cast(img, 7, b, 4, 1);
  img.line(11, 2, 7, 21, C.oak);
  img.line(12, 2, 8, 21, C.heart);
  img.rect(5, 21, 5, 2, C.iron);
  img.hline(5, 9, 21, C.wiron);
  img.poly(
    [
      [5, 23],
      [10, 23],
      [12, b],
      [3, b],
    ],
    (x) => (x < 6 ? C.strawT : x > 9 ? C.straw : C.strawC),
  );
  for (const x of [5, 8, 11]) img.vline(x, 26, b, C.straw);
  finish(img);
}

export function books(img: Img) {
  cast(img, 8, 13, 6, 1.5);
  const book = (x: number, y: number, w: number, cover: R3) => {
    img.rect(x, y, w, 3, cover[1]);
    img.hline(x, x + w - 1, y, cover[2]);
    img.hline(x + 1, x + w - 2, y + 1, C.linen); // page edge
    img.vline(x + w - 1, y, y + 2, cover[0]);
  };
  book(2, 11, 11, WINE3);
  book(3, 8, 10, TEAL3);
  book(2, 5, 9, PLUM3);
  // a loose sheet with writing on top
  img.rect(5, 3, 7, 3, C.linen);
  img.hline(6, 10, 4, C.oldpl);
  img.set(11, 3, C.lime);
  finish(img);
}

export function woodpile(img: Img) {
  cast(img, 8, 13, 7, 1.5);
  const log = (cx: number, cy: number) => {
    img.ellipse(cx, cy, 2.4, 2.1, C.heart);
    img.ellipse(cx - 0.3, cy - 0.3, 1.4, 1.2, C.worn);
    img.set(Math.floor(cx), Math.floor(cy), C.oak);
  };
  for (const x of [4, 8, 12]) log(x, 12);
  for (const x of [6, 10]) log(x, 8.5);
  log(8, 5);
  finish(img);
}

function benchTop(img: Img, w: number) {
  const b = img.h - 2;
  cast(img, w / 2, b, w / 2 - 2, 1.5);
  // legs
  for (const x of [3, w - 6]) {
    img.rect(x, 12, 3, b - 12, C.heart);
    img.vline(x, 12, b, C.oak);
  }
  img.hline(4, w - 5, b - 4, C.heart); // stretcher
  slab(img, 1, 5, w - 2, 8, 4, WOOD3);
}

export function workbench(img: Img, cobbler = false) {
  const w = img.w;
  benchTop(img, w);
  if (!cobbler) {
    // vice on the right end
    img.rect(w - 7, 2, 5, 4, C.iron);
    img.hline(w - 7, w - 3, 2, C.wiron);
    img.hline(w - 9, w - 2, 4, C.wiron);
    // hammer, file and a small gear left mid-repair
    img.hline(3, 9, 6, C.oak);
    img.rect(3, 5, 2, 3, C.iron);
    img.hline(11, 16, 7, C.wiron);
    oval(img, 20, 6, 2.5, 1.6, BRASS3);
    img.set(20, 6, C.ochre);
    // shavings on the top
    px(img, [
      [14, 5],
      [16, 6],
    ], C.strawT);
  } else {
    // last with a half-finished shoe, leather strip, awl
    img.rect(4, 3, 6, 4, C.heart);
    img.hline(4, 9, 3, C.oak);
    img.rect(11, 4, 7, 2, C.wine);
    img.hline(11, 17, 4, C.wineF);
    img.line(20, 6, 24, 4, C.wiron);
    img.rect(19, 6, 2, 1, C.oak);
    px(img, [
      [26, 6],
      [27, 6],
      [26, 5],
    ], C.wiron); // tacks
  }
  finish(img);
}

export function oilcan(img: Img) {
  cast(img, 8, 13, 5, 1.5);
  // oil stain on the floor
  img.ellipse(11, 13, 3, 1, [25, 28, 41, 90]);
  img.rect(4, 8, 6, 6, C.iron);
  img.vline(4, 8, 13, C.wiron);
  img.vline(9, 8, 13, C.soot);
  img.hline(4, 9, 8, C.wiron);
  img.rect(5, 6, 4, 2, C.iron);
  img.hline(5, 8, 6, C.wiron);
  img.line(10, 9, 13, 5, C.wiron);
  img.line(4, 7, 3, 11, C.iron); // handle
  img.set(6, 10, C.brass);
  finish(img);
}

export function parcels(img: Img) {
  const b = img.h - 2;
  cast(img, 16, b, 14, 1.8);
  const parcel = (x: number, y: number, w: number, h: number, top: number, r: R3, string = true) => {
    slab(img, x, y, w, h, top, r);
    if (string) {
      const sx = x + Math.floor(w / 2);
      img.vline(sx, y, y + h - 2, C.linen);
      img.hline(x, x + w - 2, y + top + Math.floor((h - top) / 2), C.lime);
    }
  };
  parcel(1, b - 11, 12, 11, 3, PAPER3); // big wrapped box
  parcel(13, b - 8, 10, 8, 3, PAPER3);
  // cylinder parcel lying on top
  img.rect(3, b - 15, 9, 4, C.dry);
  img.hline(3, 11, b - 15, C.worn);
  img.hline(3, 11, b - 12, C.trod);
  img.ellipse(12, b - 13.5, 1.2, 2, C.trod);
  // small box with a wax seal
  parcel(23, b - 6, 7, 6, 2, LINEN3, false);
  img.set(26, b - 3, C.wine);
  img.set(27, b - 3, C.wineS);
  // label
  img.rect(15, b - 4, 3, 2, C.linen);
  finish(img);
}

export function floorpatch(img: Img) {
  // replacement boards: lighter, newer wood aligned to the 4 px floor rows, nail heads at ends
  for (const y0 of [4, 8]) {
    for (let x = 2; x < 13; x++) for (let y = y0; y < y0 + 3; y++) img.set(x, y, y === y0 ? '#7f5b40' : '#6e4e37');
    img.hline(2, 12, y0 + 3, '#2a1d17');
    img.vline(2, y0, y0 + 2, '#2a1d17');
    img.vline(12, y0, y0 + 2, '#2a1d17');
    img.set(3, y0 + 1, C.wiron);
    img.set(11, y0 + 1, C.wiron);
  }
}

export function cupboard(img: Img) {
  const b = img.h - 2;
  cast(img, 8, b, 6, 1.5);
  slab(img, 2, 4, 12, b - 3, 3, DWOOD3);
  img.vline(8, 8, b - 2, C.charred);
  img.rect(3, 9, 4, 8, C.heart);
  img.rect(9, 9, 4, 8, C.heart);
  img.rect(3, 19, 4, 7, C.heart);
  img.rect(9, 19, 4, 7, C.heart);
  img.set(7, 18, C.brass);
  img.set(9, 18, C.brass);
  // folded cloth draped over the door edge
  img.rect(10, 10, 4, 6, C.linen);
  img.vline(13, 10, 15, C.lime);
  img.hline(10, 13, 15, C.oldpl);
  // candle box on top
  img.rect(4, 1, 6, 3, C.oak);
  img.hline(4, 9, 1, C.worn);
  finish(img);
}

export function votive(img: Img) {
  const b = img.h - 2;
  cast(img, 8, b, 5, 1.5);
  // iron stand
  img.vline(4, 12, b, C.iron);
  img.vline(11, 12, b, C.iron);
  img.hline(4, 11, b - 3, C.iron);
  img.rect(2, 10, 12, 3, C.iron);
  img.hline(2, 13, 10, C.wiron);
  img.hline(2, 13, 12, C.soot);
  // candle stubs (different heights), two lit, one spent
  const stub = (x: number, h: number, lit: boolean) => {
    img.rect(x, 10 - h, 2, h, C.linen);
    img.vline(x + 1, 10 - h, 9, C.lime);
    if (lit) {
      img.set(x, 9 - h, C.lamp);
      img.set(x, 8 - h, C.flame);
    } else img.set(x, 9 - h, C.soot);
  };
  stub(3, 4, true);
  stub(6, 2, false);
  stub(9, 3, true);
  stub(12, 1, false);
  // wax drips
  img.set(5, 12, C.lime);
  img.set(10, 12, C.linen);
  finish(img);
}

// =========================================================================================
// Clock tower mechanism (replaces the floating gears): timber A-frames carry a horizontal axle
// with the gear train and a rope drum; the bell rope leaves the drum upward.

export function gearTrain(img: Img) {
  const b = img.h - 2;
  const w = img.w;
  cast(img, w / 2, b, w / 2 - 2, 2);
  // base sill
  slab(img, 1, b - 5, w - 2, 5, 2, DWOOD3);
  // A-frame supports
  for (const x0 of [4, w - 8]) {
    img.line(x0, b - 5, x0 + 2, 12, C.heart);
    img.line(x0 + 1, b - 5, x0 + 3, 12, C.oak);
    img.line(x0 + 6, b - 5, x0 + 4, 12, C.heart);
    img.line(x0 + 5, b - 5, x0 + 3, 12, C.charred);
    img.rect(x0 + 1, 10, 5, 3, C.heart);
    img.hline(x0 + 1, x0 + 5, 10, C.oak);
  }
  const gear = (cx: number, cy: number, r: number, teeth: number) => {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const tooth = Math.cos(a * teeth) > 0.3 ? 1.6 : 0;
        if (d > r + tooth || d < r * 0.28) continue;
        if (d > r * 0.5 && d < r * 0.78 && Math.cos(a * 4) < 0.35) continue; // spokes
        const l = ((x + 0.5 - cx) * LX + (y + 0.5 - cy) * LY) / r;
        img.set(x, y, d > r - 1 + tooth * 0.5 && l < -0.1 ? C.ochre : l > 0.3 ? C.brassE : l < -0.35 ? C.ochre : C.brass);
      }
  };
  // axle through both frames
  img.hline(3, w - 4, 11, C.wiron);
  img.hline(3, w - 4, 12, C.iron);
  gear(16, 11.5, 9, 10);
  gear(31, 18, 6, 8);
  gear(31, 18, 1.5, 0);
  // rope drum on the axle with the bell rope rising to the ceiling
  img.rect(36, 8, 5, 8, C.oak);
  img.vline(36, 8, 15, C.worn);
  img.vline(40, 8, 15, C.heart);
  for (let y = 9; y < 15; y += 2) img.hline(37, 39, y, C.strawC);
  img.vline(38, 0, 8, C.strawC);
  img.vline(39, 0, 7, C.straw);
  // hubs
  img.rect(15, 10, 3, 3, C.iron);
  img.set(15, 10, C.wiron);
  // pendulum rod + bob hanging below the axle
  img.vline(24, 13, 30, C.wiron);
  oval(img, 24.5, 32, 3, 2.5, BRASS3);
  finish(img);
}

// =========================================================================================
// Town structure landmarks

const BRONZE_SH = '#4b3c2a';
export function bellCradle(img: Img) {
  const w = img.w;
  const b = img.h - 2;
  cast(img, w / 2 + 1, b - 1, 21, 3);
  // sleepers (two timbers seen end-on at the ends, long in front)
  slab(img, 3, b - 9, w - 6, 5, 2, DWOOD3);
  slab(img, 5, b - 5, w - 10, 5, 2, WOOD3);
  // chocks
  for (const x of [8, w - 13]) slab(img, x, b - 12, 5, 4, 2, WOOD3);
  // bell (mouth down) on the timbers
  const cx = w / 2;
  const top = 8;
  const lip = b - 10;
  for (let y = top; y <= lip; y++) {
    const t = (y - top) / (lip - top);
    let hw = 7.5 + 3 * t + 5 * t ** 4;
    if (t < 0.14) hw *= Math.sqrt(t / 0.14) * 0.85 + 0.15;
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) {
      const nx = (x + 0.5 - cx) / hw;
      let c: string = nx < -0.55 ? C.brass : nx > 0.3 ? BRONZE_SH : C.ochre;
      if (nx < -0.75 && t > 0.2 && t < 0.7) c = C.brassE;
      if (t < 0.12 && nx < 0.2) c = C.brass;
      const band = Math.abs(t - 0.3) < 0.035 || Math.abs(t - 0.82) < 0.035;
      if (band) c = nx > 0.3 ? C.ochre : C.brass;
      if (y === lip) c = BRONZE_SH;
      img.set(x, y, c);
    }
  }
  // crown / canons
  img.rect(cx - 3, top - 4, 6, 4, C.ochre);
  img.vline(cx - 3, top - 4, top - 1, C.brass);
  img.vline(cx + 2, top - 4, top - 1, BRONZE_SH);
  img.hline(cx - 2, cx + 1, top - 4, C.brass);
  // verdigris patina on the shoulder
  px(img, [
    [cx + 2, top + 3],
    [cx + 3, top + 3],
    [cx + 4, top + 4],
    [cx - 6, top + 9],
    [cx - 5, top + 9],
    [cx + 9, lip - 3],
  ], C.tealF);
  // the crack: from the lip up into the waist, 2 px wide at the lip, lit edge on its left
  let x = cx + 5;
  for (let y = lip; y > lip - 17; y--) {
    img.set(x, y, C.soot);
    if (y > lip - 6) img.set(x + 1, y, C.soot);
    img.set(x - 1, y, C.brassE);
    if ((lip - y) % 4 === 3) x += (lip - y) % 8 === 3 ? 1 : -1;
  }
  // a chip broken from the lip
  img.set(cx + 6, lip, [0, 0, 0, 0]);
  img.set(cx + 7, lip, [0, 0, 0, 0]);
  img.set(cx + 8, lip, [0, 0, 0, 0]);
  finish(img);
}

export function plaque(img: Img) {
  const b = img.h - 2;
  cast(img, 8, b, 6, 1.5);
  slab(img, 2, 8, 12, b - 7, 3, STONE3);
  img.hline(2, 13, 8, C.chalk);
  // brass plate
  img.rect(4, 12, 8, 6, C.brass);
  img.hline(4, 11, 12, C.brassE);
  img.vline(11, 12, 17, C.ochre);
  img.hline(5, 9, 14, C.ochre);
  img.hline(5, 10, 16, C.ochre);
  // moss at the foot
  img.hline(2, 5, b, C.moss);
  finish(img);
}

function barrelBody(img: Img, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / (y1 - y0);
    const bulge = Math.round(Math.sin(t * Math.PI) * 1.2);
    for (let x = x0 - bulge; x <= x1 + bulge; x++) {
      const nx = (x - (x0 - bulge)) / (x1 - x0 + 2 * bulge);
      img.set(x, y, nx < 0.22 ? C.worn : nx > 0.72 ? C.heart : C.oak);
    }
  }
  for (const y of [y0 + 2, y1 - 2]) img.hline(x0 - 1, x1 + 1, y, C.iron);
}

export function rainBarrel(img: Img) {
  const b = img.h - 2;
  cast(img, 8, b, 6, 1.5);
  barrelBody(img, 2, 14, 12, b - 1);
  // open top with rainwater
  img.ellipse(7.5, 14, 6, 2.2, C.heart);
  img.ellipse(7.5, 14.3, 4.6, 1.4, C.deep);
  img.hline(5, 7, 14, C.ripple);
  // downpipe: runs along the ground from the tavern roof (south) and bends into the barrel top
  img.vline(13, 10, b - 1, C.iron);
  img.vline(14, 10, b - 1, C.soot);
  img.vline(13, 10, b - 1, C.wiron);
  img.hline(11, 14, 10, C.iron);
  img.hline(11, 14, 9, C.wiron);
  img.vline(11, 10, 12, C.iron);
  // tap + drip
  img.rect(5, b - 6, 2, 2, C.brass);
  img.set(5, b - 6, C.brassE);
  img.set(6, b - 3, C.ripple);
  finish(img);
}

export function runnel(img: Img, end: boolean) {
  // stone-lined channel running east-west (flat, tiles horizontally); `end` = soakaway on the west
  const x0 = end ? 6 : 0;
  for (let x = x0; x < 16; x++) {
    for (const y of [4, 5, 11, 12]) {
      const stone = Math.floor(x / 4) + (y > 8 ? 1 : 0);
      img.set(x, y, x % 4 === 3 ? C.mortar : y === 4 || y === 11 ? (stone % 2 ? C.wstone : C.chalk) : C.plum);
    }
    for (let y = 6; y <= 10; y++) img.set(x, y, y === 6 ? C.deep : C.river);
    if (x % 5 === 1) img.set(x, 8, C.ripple);
  }
  if (end) {
    // soakaway: ring of round stones around wet earth
    img.ellipse(5, 8.5, 4.5, 4, C.wet);
    img.ellipse(5.5, 8.5, 2.6, 2, C.deep);
    for (const [x, y] of [
      [1, 7],
      [2, 11],
      [5, 13],
      [2, 4],
      [6, 3],
    ] as const) {
      img.set(x, y, C.wstone);
      img.set(x + 1, y, C.plum);
    }
  }
}

export function herbs(img: Img, kind: 0 | 1 | 2) {
  cast(img, 8, 13, 6, 1.5, 0.22);
  const leaves: R3 = kind === 1 ? [C.moss, C.leaf, C.tip] : LEAF3;
  const clumps: [number, number, number][] = [
    [5, 10, 3.2],
    [10.5, 10.5, 3.4],
    [7.5, 7, 3],
  ];
  for (const [cx, cy, r] of clumps) {
    img.ellipse(cx, cy, r, r * 0.9, (x, y, nx, ny) => {
      const l = nx * LX + ny * LY + (vnoise(x, y, 2, 7 + kind) - 0.5) * 0.5;
      return l > 0.3 ? leaves[2] : l < -0.2 ? leaves[0] : leaves[1];
    });
  }
  const flower = kind === 0 ? [C.plumF, C.plumC] : kind === 2 ? [C.linen, C.lime] : null;
  if (flower)
    for (const [x, y] of [
      [5, 6],
      [8, 4],
      [11, 6],
      [4, 9],
      [12, 9],
    ] as const) {
      img.set(x, y, flower[0]!);
      img.set(x, y + 1, flower[1]!);
    }
  finish(img, 0.45);
}

export function stepstone(img: Img) {
  for (const [cx, cy, rx, ry] of [
    [6, 5.5, 5, 3.4],
    [10.5, 12, 4.6, 3],
  ] as const) {
    img.ellipse(cx + 0.7, cy + 1.2, rx, ry, C.soot);
    oval(img, cx, cy, rx, ry, STONE3, 0.55, -0.35);
  }
}

export function memorialGate(img: Img) {
  const b = img.h - 2;
  // two narrow stone piers
  for (const x0 of [3, 35]) {
    cast(img, x0 + 5, b, 6, 1.5);
    for (let y = 24; y <= b; y++)
      for (let x = x0; x < x0 + 10; x++) {
        const course = Math.floor((y - 24) / 5);
        const joint = (y - 24) % 5 === 4 || (x - x0 + (course % 2) * 5) % 10 === 9;
        img.set(x, y, joint ? C.mortar : x === x0 ? C.chalk : x >= x0 + 8 ? C.plum : C.wstone);
      }
    slab(img, x0 - 1, 19, 12, 5, 2, STONE3);
    img.rect(x0 + 2, 15, 6, 4, C.wstone);
    img.vline(x0 + 2, 15, 18, C.chalk);
    img.vline(x0 + 7, 15, 18, C.plum);
    img.hline(x0 + 2, x0 + 7, 15, C.chalk);
    // moss on the cap
    img.hline(x0 + 7, x0 + 9, 19, C.moss);
  }
  // iron arch springing from the pier caps
  const cx = 24;
  for (let a = 0; a <= 180; a += 1) {
    const r = Math.PI * (a / 180);
    const x = cx - Math.cos(r) * 19;
    const y = 18 - Math.sin(r) * 11;
    img.set(x, y, C.iron);
    img.set(x, y + 1, C.soot);
    if (a > 20 && a < 160) img.set(x, y - 1, C.wiron);
  }
  // scroll infill bars
  for (const x of [12, 18, 30, 36]) img.vline(x, 18 - Math.round(Math.sin(Math.acos((cx - x) / 19)) * 11) + 2, 18, C.iron);
  img.hline(8, 40, 18, C.iron);
  // broken-hour ring at the crown (original local motif)
  for (let a = 0; a < 360; a += 8) {
    if (a > 300 && a < 340) continue; // the notch
    const r = (a * Math.PI) / 180;
    img.set(cx + Math.cos(r) * 4, 4 + Math.sin(r) * 4, a < 180 ? C.iron : C.wiron);
  }
  img.set(cx, 4, C.wiron);
  img.set(cx, 3, C.iron);
  img.set(cx + 1, 3, C.iron);
  finish(img, 0.4);
}

/** Dark mourning yew: dense rounded column, drooping hem, short reddish trunk. */
export function yew(img: Img) {
  const w = img.w;
  const b = img.h - 2;
  cast(img, w / 2, b, 13, 2.5, 0.32);
  img.rect(w / 2 - 2, b - 8, 4, 8, C.oxide);
  img.vline(w / 2 - 2, b - 8, b, C.clay);
  img.vline(w / 2 + 1, b - 8, b, C.fired);
  const YEW: R3 = ['#1b2b27', C.pine, C.moss];
  const clusters: [number, number, number][] = [
    [w / 2, 12, 9],
    [w / 2 - 6, 22, 9],
    [w / 2 + 6, 22, 9],
    [w / 2 - 4, 32, 9.5],
    [w / 2 + 5, 32, 9],
  ];
  for (let y = 0; y < b - 4; y++)
    for (let x = 0; x < w; x++) {
      let best = -1;
      let l = 0;
      for (let i = 0; i < clusters.length; i++) {
        const [cx, cy, r] = clusters[i]!;
        const rr = r * (0.92 + 0.1 * Math.sin(Math.atan2(y - cy, x - cx) * 6 + i * 2));
        const nx = (x + 0.5 - cx) / rr;
        const ny = (y + 0.5 - cy) / rr;
        if (nx * nx + ny * ny > 1) continue;
        best = i;
        l = nx * LX + ny * LY;
      }
      if (best < 0) continue;
      l += (vnoise(x, y, 3, 77) - 0.5) * 0.7; // leaf clumps (clustered, not per pixel)
      img.set(x, y, l > 0.42 ? YEW[2] : l < -0.15 ? YEW[0] : YEW[1]);
    }
  // drooping hem strands
  for (let x = 6; x < w - 6; x += 3) {
    const len = 2 + Math.floor(hash(x, 1, 78) * 3);
    for (let j = 0; j < len; j++) if (img.alpha(x, b - 6 - j) === 0 || j === 0) img.set(x, b - 7 + j, YEW[0]);
  }
  // a few red arils
  px(img, [
    [10, 20],
    [21, 27],
    [14, 31],
  ], C.wine);
  finish(img, 0.5);
}

export function gravebed(img: Img) {
  // tended plot in front of a headstone: kerb, dark turned soil, fresh flowers in small masses
  img.rect(2, 2, 12, 12, C.plum);
  img.hline(2, 13, 2, C.wstone);
  img.vline(2, 2, 13, C.wstone);
  img.rect(3, 3, 10, 10, C.wet);
  img.hline(3, 12, 3, C.trod);
  // planting
  const mass = (x: number, y: number, a: string, b2: string) => {
    img.rect(x, y, 2, 2, a);
    img.set(x + 1, y + 1, b2);
    img.set(x, y + 2, C.moss);
  };
  mass(4, 4, C.wineF, C.wine);
  mass(8, 5, C.linen, C.lime);
  mass(5, 8, C.brassE, C.brass);
  mass(9, 9, C.plumF, C.plumC);
  // posy with ribbon lying on the kerb
  img.line(10, 12, 13, 14, C.leaf);
  img.set(10, 11, C.wineF);
  img.set(11, 11, C.linen);
  img.set(12, 13, C.tealF);
  finish(img, 0.45);
}

export function landing(img: Img) {
  // short timber landing seen from above, reaching out over the water (south); planks run across
  for (let y = 2; y < 29; y++)
    for (let x = 3; x < 29; x++) {
      const ly = (y - 2) % 4;
      const plank = Math.floor((y - 2) / 4);
      let c: string = ly === 3 ? C.charred : plank % 3 === 1 ? C.heart : C.oak;
      if (ly === 0 && c !== C.charred) c = C.worn;
      if (x === 3 && ly !== 3) c = C.worn;
      if (x === 28) c = C.charred;
      img.set(x, y, c);
    }
  // nails on the two stringers
  for (let y = 3; y < 29; y += 4) {
    img.set(6, y, C.wiron);
    img.set(25, y, C.wiron);
  }
  // front edge (fascia) + shadow on the water
  img.hline(3, 28, 29, C.heart);
  img.hline(3, 28, 30, C.soot);
  for (let x = 5; x < 31; x++) img.set(x, 31, [25, 28, 41, 110]);
  // mooring posts at the water end, a coil of rope
  for (const x of [2, 27]) {
    img.rect(x, 22, 3, 8, C.heart);
    img.vline(x, 22, 29, C.oak);
    img.hline(x, x + 2, 22, C.worn);
    img.vline(x + 2, 23, 29, C.charred);
  }
  img.ellipse(19, 9, 3.2, 2.2, C.strawC);
  img.ellipse(19, 9, 1.5, 0.9, C.heart);
  img.hline(17, 19, 7, C.strawT);
  img.vline(2, 2, 21, C.soot);
  img.hline(3, 28, 1, mix(C.worn, C.soot, 0.5));
}

export function mendstool(img: Img) {
  cast(img, 8, 13, 6, 1.5);
  // three-leg stool
  img.line(3, 13, 4, 9, C.heart);
  img.line(8, 13, 7, 9, C.heart);
  img.ellipse(5.5, 8, 4, 1.6, C.oak);
  img.hline(3, 7, 7, C.worn);
  // netting heap with a float and a shuttle
  img.ellipse(11.5, 11.5, 3.5, 2.3, (x, y) => ((x + y) % 2 === 0 ? C.lime : C.oldpl));
  img.set(13, 9, C.wine);
  img.set(13, 10, C.wineS);
  img.line(9, 7, 12, 6, C.worn);
  finish(img, 0.45);
}

export function dryingNet(img: Img) {
  const b = img.h - 2;
  for (const x of [4, 27]) cast(img, x + 1, b, 3, 1);
  // net strung between two poles, sagging in the middle
  for (let x = 6; x < 27; x++) {
    const sag = Math.round(Math.sin(((x - 6) / 21) * Math.PI) * 2);
    const top = 6 + sag;
    const bottom = 20 + sag;
    for (let y = top; y <= bottom; y++) {
      const u = x - 6 + (y - top);
      const v = x - 6 - (y - top);
      if (((u % 4) + 4) % 4 === 0 || ((v % 4) + 4) % 4 === 0) img.set(x, y, y === bottom ? C.oldpl : C.lime);
    }
    img.set(x, top, C.strawC); // head rope
    if (x % 5 === 2) img.set(x, top + 1, C.dry); // cork floats
  }
  for (const x of [4, 27]) {
    post(img, x, 3, 2, b, [C.heart, C.oak, C.worn]);
    img.vline(x, 3, b, C.oak);
    img.vline(x + 1, 3, b, C.heart);
    img.set(x, 3, C.worn);
  }
  finish(img, 0.45);
}

export function pottingShelf(img: Img) {
  const b = img.h - 2;
  cast(img, 8, b, 6, 1.5);
  for (const x of [2, 13]) {
    img.vline(x, 4, b, C.oak);
    img.vline(x + 1 > 13 ? 13 : x + 1, 4, b, C.heart);
  }
  for (const y of [12, 21, b - 1]) {
    img.hline(2, 14, y, C.worn);
    img.hline(2, 14, y + 1, C.heart);
  }
  const pot = (x: number, y: number, sprout: boolean) => {
    img.rect(x, y - 3, 4, 3, C.clay);
    img.hline(x, x + 3, y - 3, C.tile);
    img.vline(x + 3, y - 2, y - 1, C.oxide);
    if (sprout) {
      img.set(x + 1, y - 4, C.tip);
      img.set(x + 2, y - 5, C.leaf);
      img.set(x + 2, y - 4, C.leaf);
    }
  };
  pot(3, 12, true);
  pot(8, 12, false);
  pot(4, 21, true);
  pot(9, 21, true);
  // trowel + sack of compost on the bottom
  img.rect(4, b - 6, 7, 5, C.dry);
  img.hline(4, 10, b - 6, C.worn);
  img.vline(10, b - 5, b - 2, C.trod);
  img.line(11, b - 8, 13, b - 4, C.wiron);
  finish(img);
}

export function levelPost(img: Img) {
  const b = img.h - 2;
  // water ring where the post enters the water (foam reserved for obstructions)
  img.ellipse(8, b - 1, 5, 1.5, C.ripple);
  img.hline(5, 11, b - 1, C.foam);
  for (let y = 4; y <= b - 2; y++) {
    img.set(6, y, C.worn);
    img.set(7, y, C.oak);
    img.set(8, y, C.oak);
    img.set(9, y, C.heart);
  }
  // painted gauge: alternating marks, numbered every other step
  for (let y = 8; y < b - 4; y += 4) {
    img.hline(6, 8, y, y % 8 === 0 ? C.linen : C.tealF);
    if (y % 8 === 0) img.set(5, y, C.linen);
  }
  // high-water notch + iron cap
  img.hline(6, 9, 14, C.wine);
  img.rect(5, 2, 6, 2, C.iron);
  img.hline(5, 10, 2, C.wiron);
  finish(img);
}

export function kiosk(img: Img) {
  const w = img.w;
  const b = img.h - 2;
  cast(img, w / 2, b, 13, 1.8);
  for (const x of [5, 25]) {
    img.vline(x, 14, b, C.oak);
    img.vline(x + 1, 14, b, C.heart);
  }
  // board
  slab(img, 3, 18, 26, 18, 2, WOOD3);
  img.rect(5, 21, 22, 13, C.heart);
  const note = (x: number, y: number, ww: number, h: number, c: string, pin: string) => {
    img.rect(x, y, ww, h, c);
    for (let j = y + 2; j < y + h - 1; j += 2) img.hline(x + 1, x + ww - 2, j, C.oldpl);
    img.set(x + Math.floor(ww / 2), y, pin);
  };
  note(6, 22, 6, 7, C.linen, C.wine);
  note(13, 23, 5, 5, C.lime, C.iron);
  note(19, 22, 7, 9, C.linen, C.brass);
  note(13, 29, 5, 4, C.linen, C.wine);
  // teal-slated cap (the bridge address)
  for (let y = 6; y <= 16; y++) {
    const hw = 4 + (y - 6) * 1.25;
    for (let x = Math.floor(w / 2 - hw); x < Math.ceil(w / 2 + hw); x++) {
      const course = (y - 6) % 3 === 2;
      const left = x < w / 2;
      img.set(x, y, course ? C.tealS : left ? C.tealF : C.teal);
    }
  }
  img.hline(2, w - 3, 17, C.tealS);
  img.rect(w / 2 - 1, 3, 2, 3, C.iron);
  img.set(w / 2 - 1, 3, C.wiron);
  finish(img);
}

export function sheaves(img: Img) {
  const b = img.h - 2;
  cast(img, 8, b, 6, 1.5);
  // a stook: bundled sheaves leaning together, tied at the waist
  img.poly(
    [
      [3, b],
      [6, 9],
      [10, 9],
      [13, b],
    ],
    (x) => (x < 6 ? C.strawT : x > 10 ? C.straw : C.strawC),
  );
  img.hline(5, 11, 13, C.strawS);
  img.hline(5, 11, 14, C.straw);
  // ears
  for (const [x, y] of [
    [6, 6],
    [8, 5],
    [10, 6],
    [7, 7],
    [9, 7],
  ] as const) {
    img.vline(x, y, y + 2, C.strawT);
    img.set(x, y + 2, C.strawC);
  }
  finish(img);
}

/** Stubble patch (flat): short cut stalks in rows matching the soil furrows. */
export function stubble(img: Img) {
  for (let y = 1; y < 16; y += 3)
    for (let x = 1 + (y % 2); x < 15; x += 3) {
      img.set(x, y, C.strawC);
      img.set(x, y + 1, C.straw);
    }
}

// --- crate stack variant -----------------------------------------------------------------

export function crates2(img: Img) {
  const b = img.h - 2;
  cast(img, 16, b, 14, 1.8);
  const CR: R3 = [C.charred, C.heart, C.oak];
  const crate = (x: number, y: number, s: number) => {
    slab(img, x, y, s, s, 4, CR);
    img.hline(x + 1, x + s - 2, y + 1, C.worn);
    img.line(x + 1, y + s - 2, x + s - 2, y + 5, C.oak);
    img.hline(x + 1, x + s - 2, y + 5, C.charred);
  };
  // two-high stack on the left, open crate with straw on the right
  crate(2, b - 12, 12);
  crate(3, b - 24, 11);
  slab(img, 15, b - 10, 14, 10, 3, CR);
  img.rect(16, b - 10, 12, 3, C.strawC);
  for (let x = 16; x < 28; x += 2) img.set(x, b - 11, C.strawT);
  img.hline(16, 27, b - 7, C.charred);
  img.hline(16, 27, b - 4, C.oak);
  finish(img);
}

// =========================================================================================
// Derived variants of high-use props. They work on whatever sprite is in the atlas (procedural
// or AI remaster), so call deriveVariants() again after AI frames are applied (see report).

function opaqueBBox(img: Img) {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.alpha(x, y) >= 200) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1 };
}
const lum = (c: readonly number[]) => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
const warm = (c: readonly number[]) => c[0]! > c[2]! + 8;

/** Bench with one replaced (newer, paler) seat/back plank and nail heads. */
export function benchRepaired(src: Img): Img {
  const img = src.clone();
  const { x0, y0, x1, y1 } = opaqueBBox(img);
  const w = x1 - x0 + 1;
  const pxs = x0 + Math.round(w * 0.52);
  const pxe = pxs + 7;
  const ys = y0;
  const ye = y0 + Math.round((y1 - y0) * 0.62);
  for (let y = ys; y <= ye; y++)
    for (let x = pxs; x <= pxe; x++) {
      if (img.alpha(x, y) < 200) continue;
      const c = img.get(x, y);
      if (!warm(c)) continue;
      const l = lum(c);
      img.set(x, y, l > 120 ? '#c9a77a' : l > 75 ? C.worn : C.oak);
    }
  for (let y = ys; y <= ye; y++) {
    if (img.alpha(pxs - 1, y) >= 200 && warm(img.get(pxs - 1, y))) img.set(pxs - 1, y, C.charred);
    if (img.alpha(pxe + 1, y) >= 200 && warm(img.get(pxe + 1, y))) img.set(pxe + 1, y, C.charred);
  }
  // nail heads on the new plank
  for (let y = ys; y <= ye; y++) {
    if (img.alpha(pxs + 1, y) >= 200 && warm(img.get(pxs + 1, y)) && (y - ys) % 6 === 2) {
      img.set(pxs + 1, y, C.wiron);
      img.set(pxe - 1, y, C.wiron);
    }
  }
  return img;
}

/** Barrel with the lid off: dark inside with rainwater. */
export function barrelOpen(src: Img): Img {
  const img = src.clone();
  const { x0, y0, x1 } = opaqueBBox(img);
  const cx = (x0 + x1 + 1) / 2;
  const rx = (x1 - x0 + 1) / 2 - 2;
  img.ellipse(cx, y0 + 2.8, rx, 2.4, C.charred);
  img.ellipse(cx, y0 + 3.2, rx - 1.3, 1.5, C.deep);
  img.hline(Math.round(cx - 3), Math.round(cx - 1), Math.round(y0 + 3), C.ripple);
  img.hline(Math.round(cx - rx + 1), Math.round(cx + rx - 2), Math.round(y0 + 0.6), C.worn); // rim catches the light
  return img;
}

/** Erase a disc from a canopy and re-contour the cut so the silhouette changes cleanly. */
function carve(img: Img, cx: number, cy: number, r: number, keepBelow: number) {
  const cut = new Uint8Array(img.w * img.h);
  for (let y = 0; y < Math.min(img.h, keepBelow); y++)
    for (let x = 0; x < img.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const rr = r * (0.94 + 0.08 * Math.sin(Math.atan2(y - cy, x - cx) * 5));
      if (d <= rr && img.alpha(x, y) > 0) {
        img.set(x, y, [0, 0, 0, 0]);
        cut[y * img.w + x] = 1;
      }
    }
  const edge: [number, number][] = [];
  for (let y = 1; y < img.h - 1; y++)
    for (let x = 1; x < img.w - 1; x++) {
      if (img.alpha(x, y) < 200) continue;
      if (cut[y * img.w + x - 1] || cut[y * img.w + x + 1] || cut[(y - 1) * img.w + x] || cut[(y + 1) * img.w + x]) edge.push([x, y]);
    }
  for (const [x, y] of edge) img.set(x, y, mix(img.get(x, y), C.soot, 0.65));
}

/** Second canopy silhouette for broadleaf trees: lopsided, the upper-right lobe gone. */
export function canopyVariant(src: Img): Img {
  const img = src.clone();
  const { x0, y0, x1, y1 } = opaqueBBox(img);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  carve(img, x1 + w * 0.02, y0 + h * 0.12, w * 0.36, y0 + h * 0.6);
  carve(img, x0 - w * 0.08, y0 + h * 0.5, w * 0.16, y0 + h * 0.62);
  return img;
}

/** Second silhouette for conifers: wind-shorn upper right side and a blunt crown. */
export function pineVariant(src: Img): Img {
  const img = src.clone();
  const { x0, y0, x1, y1 } = opaqueBBox(img);
  const cx = (x0 + x1 + 1) / 2;
  const h = y1 - y0 + 1;
  const cut = new Uint8Array(img.w * img.h);
  for (let y = 0; y < y0 + h * 0.6; y++)
    for (let x = 0; x < img.w; x++) {
      const t = (y - y0) / h;
      const lim = cx + 1 + t * (x1 - cx) * 0.9;
      if ((x > lim || y < y0 + 4) && img.alpha(x, y) > 0) {
        img.set(x, y, [0, 0, 0, 0]);
        cut[y * img.w + x] = 1;
      }
    }
  for (let y = 1; y < img.h - 1; y++)
    for (let x = 1; x < img.w - 1; x++) {
      if (img.alpha(x, y) < 200) continue;
      if (cut[y * img.w + x + 1] || cut[(y - 1) * img.w + x]) img.set(x, y, mix(img.get(x, y), C.soot, 0.6));
    }
  return img;
}

/** Variant frames derived from base frames: name -> [base frame, derive]. */
export const DERIVED: Record<string, [string, (src: Img) => Img]> = {
  bench_r: ['bench', benchRepaired],
  barrel_o: ['barrel', barrelOpen],
  oak_b: ['oak', canopyVariant],
  oak2_b: ['oak2', canopyVariant],
  pine_b: ['pine', pineVariant],
  pinetall_b: ['pinetall', pineVariant],
};

/** (Re)derive the variant frames from the current base frames (call after AI remasters). */
export function deriveVariants(frames: Map<string, Img>): void {
  for (const [name, [base, fn]] of Object.entries(DERIVED)) {
    const src = frames.get(base);
    if (src) frames.set(name, fn(src));
  }
}

/** Draw functions for the new object kinds (merged into props.ts DRAW). */
export const EXTRA_DRAW: Record<string, (img: Img) => void> = {
  boots,
  coatstand,
  blanket,
  basket,
  broom,
  books,
  woodpile,
  workbench: (i) => workbench(i, false),
  oilcan,
  parcels,
  floorpatch,
  cupboard,
  votive,
  bellcradle: bellCradle,
  plaque,
  rainbarrel: rainBarrel,
  runnel: (i) => runnel(i, false),
  herbs: (i) => herbs(i, 0),
  stepstone,
  memorialgate: memorialGate,
  yew,
  gravebed,
  landing,
  mendstool,
  dryingnet: dryingNet,
  pottingshelf: pottingShelf,
  levelpost: levelPost,
  kiosk,
  sheaves,
  stubble,
  // town-square showpiece (assets-square)
  kerb: (i) => kerb(i),
  mosaic: (i) => mosaic(i),
  plazafountain: (i) => plazaFountain(i),
  archpier: (i) => archPier(i),
  // foreground layer kinds (src/foreground.ts)
  bunting: (i) => buntingLevel(i),
  bunting_l: (i) => buntingL(i),
  bunting_r: (i) => buntingR(i),
  fg_branch: (i) => fgBranch(i),
  fg_bough: (i) => fgBough(i),
  fg_deadbranch: (i) => fgDeadBranch(i),
  fg_lantern: (i) => fgLantern(i),
  fg_sign: (i) => fgSign(i),
  fg_sign2: (i) => fgSign2(i),
  fg_laundry: (i) => fgLaundry(i),
  fg_laundry2: (i) => fgLaundry2(i),
  fg_arch: (i) => fgArch(i),
  fg_arch_small: (i) => fgArchSmall(i),
};

/** Extra frames (variants) for existing kinds: frame -> [kind (size), draw]. */
export const EXTRA_FRAMES: Record<string, [string, (img: Img) => void]> = {
  runnel_end: ['runnel', (i) => runnel(i, true)],
  herbs2: ['herbs', (i) => herbs(i, 1)],
  herbs3: ['herbs', (i) => herbs(i, 2)],
  workbench_cobbler: ['workbench', (i) => workbench(i, true)],
  crates2: ['crates', crates2],
};

// =========================================================================================
// Town-square showpiece + foreground layer (assets-square). 1x placeholders that fix shape,
// placement and palette for the 2x redraw: carved kerb of the raised plaza, the clock-face
// mosaic (chapter ring under the voting circle), the square fountain, archway piers, and the
// overhead foreground kinds (bunting, boughs, lanterns, signs, laundry, arch spans).

const hypot = Math.hypot;
const TAU = Math.PI * 2;
/** Pixel is a face pixel `k` rows below the edge of a shape `inside(x, y)` (south faces only). */
function faceDepth(inside: (x: number, y: number) => boolean, x: number, y: number, depth: number): number {
  if (inside(x, y)) return 0;
  for (let k = 1; k <= depth; k++) if (inside(x, y - k)) return k;
  return 0;
}

/**
 * Carved kerb of the raised plaza (flat, 400x400, centre (200,200) = the square centre): a coping
 * ring on the outer paving with radial joints, a short stone face on the south half (the plaza
 * reads as one step above the grass), a drop line on the north half and newel stones where the
 * four roads come in.
 */
export function kerb(img: Img) {
  const cx = 200;
  const cy = 200;
  const R = 185; // outer edge (paved disc r = 184 + 1)
  const RIN = 177;
  const FACE = 5;
  const gap = (x: number, y: number) => (x >= 174 && x < 226 && Math.abs(y + 0.5 - cy) > 100) || (y >= 174 && y < 226 && Math.abs(x + 0.5 - cx) > 100);
  const inDisc = (x: number, y: number) => hypot(x + 0.5 - cx, y + 0.5 - cy) < R;
  const jointAt = (dx: number, dy: number, d: number) => {
    const a = (Math.atan2(dy, dx) + TAU) % TAU;
    const step = TAU / 96;
    const m = a % step;
    return Math.min(m, step - m) * d < 0.8;
  };
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (gap(x, y)) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = hypot(dx, dy);
      if (d >= RIN && d < R) {
        const lit = (dx * -0.62 + dy * -0.78) / d;
        let c: Color = C.wstone;
        if (d >= R - 1) c = lit > 0.05 ? C.chalk : lit < -0.4 ? C.plum : C.wstone;
        else if (d < RIN + 1) c = C.mortar;
        else if (d < RIN + 2) c = C.plum;
        else if (jointAt(dx, dy, d)) c = C.mortar;
        else if (hash(Math.floor((Math.atan2(dy, dx) + Math.PI) * 15), 0, 51) < 0.18) c = mix(C.wstone, C.plum, 0.5);
        img.set(x, y, c);
        continue;
      }
      const k = faceDepth(inDisc, x, y, FACE);
      if (k > 0) {
        const xo = Math.round(dx);
        let c: Color = k === FACE ? C.soot : k === 1 ? C.wstone : C.plum;
        if (k > 1 && k < FACE && jointAt(dx, dy - k, hypot(dx, dy - k))) c = C.mortar;
        if (k === FACE - 1 && hash(xo, 3, 52) < 0.12) c = C.moss;
        img.set(x, y, c);
        continue;
      }
      // contact shadow below the face, a soft drop line around the north half
      const ks = faceDepth(inDisc, x, y, FACE + 3);
      if (ks > FACE) img.blend(x, y, C.soot, ks === FACE + 1 ? 0.45 : 0.22);
      else if (d >= R && d < R + 1.2 && dy < 0) img.blend(x, y, C.soot, 0.4);
    }
  // newel stones at the road openings
  const newel = (x: number, y: number) => {
    cast(img, x + 4, y + 10, 5, 1.6, 0.3);
    slab(img, x, y, 8, 10, 4, STONE3);
    img.hline(x, x + 7, y, C.chalk);
  };
  for (const s of [-1, 1]) {
    const nx = (gx: number) => Math.sqrt(181 * 181 - (gx - cx) ** 2);
    // north / south openings (x 174..225)
    newel(166, Math.round(cy + s * nx(170)) - 6);
    newel(226, Math.round(cy + s * nx(230)) - 6);
    // west / east openings (y 174..225)
    newel(Math.round(cx + s * nx(cx + 170 - cy)) - 4, 166);
    newel(Math.round(cx + s * nx(cx + 230 - cy)) - 4, 222);
  }
}

/**
 * Clock-face mosaic (flat, 240x240, centre (120,120) = the voting circle centre): a chapter ring of
 * dark slate slabs exactly under the voting circle (players stand on it, seat 1 at XII), brass
 * edge lines, twelve hour inlays (XII a brass lozenge, III / VI / IX double brass bars, the rest
 * chalk bars) and minute dots on the outer edge. Transparent elsewhere (the dais sits inside).
 */
export function mosaic(img: Img) {
  const cx = 120;
  const cy = 120;
  const RXI = 95;
  const RYI = 83;
  const RXO = 115;
  const RYO = 103;
  const SLAB = '#4e4758';
  const SLAB2 = '#524b5c';
  const JOINT = '#403a49';
  const EDGE = mix(C.ochre, SLAB, 0.35);
  const e = (dx: number, dy: number, rx: number, ry: number) => (dx / rx) ** 2 + (dy / ry) ** 2;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ei = e(dx, dy, RXI, RYI);
      const eo = e(dx, dy, RXO, RYO);
      if (ei < 1 || eo > 1) continue;
      const a = (Math.atan2(dx, -dy) + TAU) % TAU; // clockwise from 12 o'clock
      const seg = (a / TAU) * 48;
      const segI = Math.floor(seg);
      // edge lines: 1 px brass at the inner and outer boundary
      const ei2 = e(dx, dy, RXI + 1.2, RYI + 1.2);
      const eo2 = e(dx, dy, RXO - 1.2, RYO - 1.2);
      let c: Color = segI % 2 ? SLAB : SLAB2;
      if (Math.min(seg - segI, segI + 1 - seg) * (TAU / 48) * hypot(dx, dy) < 0.7) c = JOINT;
      if (ei2 < 1 || eo2 > 1) c = EDGE;
      img.set(x, y, c);
    }
  // minute dots just inside the outer edge (skip the hour positions)
  for (let m = 0; m < 60; m++) {
    if (m % 5 === 0) continue;
    const a = (m / 60) * TAU;
    img.set(cx + Math.sin(a) * (RXO - 4), cy - Math.cos(a) * (RYO - 4), '#6c6577');
  }
  // hour inlays along the ring centre line, oriented radially
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * TAU;
    const px = cx + Math.sin(a) * 105;
    const py = cy - Math.cos(a) * 93;
    // radial unit vector (ellipse normal) and its tangent
    let nx = Math.sin(a) / 105;
    let ny = -Math.cos(a) / 93;
    const nl = hypot(nx, ny);
    nx /= nl;
    ny /= nl;
    const tx = -ny;
    const ty = nx;
    const bar = (off: number, len: number, wid: number, body: Color, shade: Color) => {
      for (let s = -len; s <= len; s += 0.5)
        for (let t = -wid; t <= wid; t += 0.5) {
          const qx = Math.round(px + nx * s + tx * (t + off));
          const qy = Math.round(py + ny * s + ty * (t + off));
          img.set(qx, qy, t > wid - 0.6 ? shade : body);
        }
    };
    if (h === 0) {
      // XII: brass lozenge pointing at the tower
      for (let s = -7; s <= 7; s += 0.5) {
        const w = 3.2 * (1 - Math.abs(s) / 7.5);
        for (let t = -w; t <= w; t += 0.5) img.set(Math.round(px + nx * s + tx * t), Math.round(py + ny * s + ty * t), t > w - 0.8 ? C.ochre : s < 0 ? C.brassE : C.brass);
      }
    } else if (h % 3 === 0) {
      bar(-2.2, 5.5, 0.9, C.brass, C.ochre);
      bar(2.2, 5.5, 0.9, C.brass, C.ochre);
    } else bar(0, 5, 1, C.chalk, C.wstone);
  }
}

/**
 * The square fountain (48x48, collision 3x2): a round stone basin with a front face and dark water,
 * a pedestal with a small upper bowl spilling into the basin, and a bronze broken-hour ring on top
 * with the jet. Basin water centre (24,34) = world (776,914).
 */
export function plazaFountain(img: Img) {
  const cx = 24;
  const b = img.h - 2;
  cast(img, cx + 1, b - 1, 23, 4, 0.32);
  const inBasin = (x: number, y: number) => ((x + 0.5 - cx) / 22) ** 2 + ((y + 0.5 - 34) / 8) ** 2 < 1;
  // front face of the basin
  for (let y = 26; y <= b; y++)
    for (let x = 1; x < 47; x++) {
      const k = faceDepth(inBasin, x, y, 7);
      if (!k) continue;
      const nx = (x - cx) / 22;
      let c: string = nx < -0.45 ? C.wstone : nx > 0.5 ? C.mortar : C.plum;
      if (k === 1) c = C.chalk;
      if (k === 7) c = C.soot;
      if (k > 1 && k < 7 && (x + (k > 3 ? 4 : 0)) % 8 === 0) c = C.mortar;
      img.set(x, y, c);
    }
  // rim + water
  img.ellipse(cx, 34, 22, 8, (x, y, nx, ny) => {
    const r = nx * nx + ny * ny;
    if (r > 0.6) return nx * -0.62 + ny * -0.78 > 0.1 ? C.chalk : r > 0.86 && ny > 0 ? C.plum : C.wstone;
    if (r > 0.52) return C.plum;
    return hash(x, y, 61) < 0.07 ? C.foam : ny < -0.3 ? C.deep : nx < -0.3 ? C.ripple : C.river;
  });
  // ripples where the bowl spills
  for (const [x, y] of [
    [13, 33],
    [14, 33],
    [34, 34],
    [35, 34],
    [24, 38],
    [25, 38],
  ] as const)
    img.set(x, y, C.foam);
  // pedestal
  post(img, cx - 3, 19, 6, 33, STONE3);
  img.hline(cx - 4, cx + 3, 32, C.plum);
  // upper bowl
  img.ellipse(cx, 18, 10, 3.2, (_x, _y, nx, ny) => (ny < -0.2 ? (nx < 0.2 ? C.ripple : C.river) : nx < -0.4 ? C.chalk : C.wstone));
  img.hline(cx - 9, cx + 8, 21, C.plum);
  img.hline(cx - 7, cx + 6, 22, C.mortar);
  // falling sheets from the bowl lip into the basin
  for (const [x0, x1] of [
    [cx - 10, cx - 11],
    [cx + 9, cx + 10],
  ] as const)
    for (let y = 19; y < 33; y++) img.set(y < 26 ? x0 : x1, y, (y & 1) === 0 ? C.foam : C.ripple);
  // bronze broken-hour ring + jet
  for (let a = 0; a < 360; a += 10) {
    if (a > 290 && a < 330) continue;
    const r = (a * Math.PI) / 180;
    img.set(cx + Math.cos(r) * 4, 9 + Math.sin(r) * 4, a > 200 && a < 340 ? C.brassE : C.brass);
  }
  img.vline(cx, 12, 16, C.ochre);
  img.vline(cx - 1, 12, 16, C.brass);
  for (let y = 1; y < 8; y++) img.set(cx + (y > 5 ? (y & 1 ? -1 : 0) : 0), y, y < 3 ? C.flame : C.foam);
  img.set(cx - 1, 2, C.foam);
  img.set(cx + 1, 3, C.foam);
  finish(img);
}

/** Stone pier of a square / lane archway (16x40, collision 1 tile). The span is a foreground kind. */
export function archPier(img: Img) {
  const b = img.h - 2;
  cast(img, 8, b, 7, 1.6);
  for (let y = 10; y <= b - 4; y++)
    for (let x = 3; x < 13; x++) {
      const course = Math.floor((y - 10) / 6);
      const joint = (y - 10) % 6 === 5 || (x - 3 + (course % 2) * 5) % 10 === 9;
      img.set(x, y, joint ? C.mortar : x === 3 ? C.chalk : x >= 11 ? C.plum : C.wstone);
    }
  slab(img, 2, b - 4, 12, 5, 2, STONE3); // plinth
  slab(img, 1, 5, 14, 6, 2, STONE3); // capital
  img.hline(1, 14, 5, C.chalk);
  img.hline(3, 5, b - 5, C.moss);
  finish(img);
}

// --- foreground kinds ------------------------------------------------------------------------

const PENNANTS = [C.wine, C.brass, C.teal, C.linen, C.plumF] as const;
/** A string of pennants from (x0,y0) to (x1,y1) sagging by `sag`. */
function bunting(img: Img, x0: number, y0: number, x1: number, y1: number, sag: number) {
  const at = (t: number) => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t + sag * 4 * t * (1 - t) });
  const n = Math.ceil(Math.abs(x1 - x0) * 1.5);
  for (let i = 0; i <= n; i++) {
    const p = at(i / n);
    img.set(p.x, p.y, C.charred);
  }
  let k = 0;
  for (let x = Math.min(x0, x1) + 3; x < Math.max(x0, x1) - 3; x += 6) {
    const t = (x - x0) / (x1 - x0);
    const p = at(t);
    const c = PENNANTS[k++ % PENNANTS.length]!;
    const top = Math.round(p.y) + 1;
    for (let j = 0; j < 6; j++) {
      const hw = 2 - j * 0.34;
      for (let i = Math.ceil(-hw - 0.5); i <= Math.floor(hw - 0.5) + 1; i++) {
        if (Math.abs(i - 0.5) > hw + 0.25) continue;
        img.set(x + i, top + j, i <= 0 && j < 3 ? mix(c, '#ffffff', 0.18) : i >= 2 ? mix(c, C.soot, 0.35) : c);
      }
    }
  }
  for (const [x, y] of [
    [x0, y0],
    [x1, y1],
  ] as const) {
    img.set(x, y, C.soot);
    img.set(x, y + 1, C.iron);
  }
}
export const buntingLevel = (img: Img) => bunting(img, 0, 2, img.w - 1, 2, 9);
export const buntingL = (img: Img) => bunting(img, 0, 2, img.w - 1, 34, 7);
export const buntingR = (img: Img) => bunting(img, 0, 34, img.w - 1, 2, 7);

const OAK6 = ['#0f2018', '#16301f', '#1f4026', '#2c522e', '#3e6838', '#55804a'];
const AUTUMN6 = ['#1e1a12', '#2e2816', '#47391c', '#634c22', '#80602c', '#9c7a3a'];
/** Overhanging bough: a dark limb entering from the lower right with leaf clumps over it. */
function bough(img: Img, pal: string[], seed: number) {
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = 46 - t * 38;
    const y = 30 - t * 14 - Math.sin(t * Math.PI) * 6;
    const w = 2.6 - t * 1.8;
    for (let k = -w; k <= w; k += 0.5) img.set(x, y + k, k < -w / 3 ? C.heart : C.charred);
  }
  img.line(26, 18, 20, 8, C.charred);
  img.line(14, 17, 6, 22, C.charred);
  canopy(
    img,
    [
      [10, 18, 8],
      [19, 11, 8],
      [29, 13, 7],
      [37, 19, 6],
      [21, 20, 6],
      [6, 11, 5],
    ],
    pal,
    seed,
    { tex: 0.4 },
  );
  // light dapples on the lit side, holes to see through
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) if (img.alpha(x, y) > 0 && hash(x, y, seed + 40) < 0.035 && y > 14) img.set(x, y, [0, 0, 0, 0]);
  img.outline({ darken: 0.6 });
}
export const fgBranch = (img: Img) => bough(img, OAK6, 71);
export const fgBough = (img: Img) => bough(img, AUTUMN6, 72);
/** Bare, crooked dead branch with twigs (gothic). */
export function fgDeadBranch(img: Img) {
  const GREY = ['#1d171b', '#2b2327', '#3a3034', '#4a3f40'];
  const limb = (x: number, y: number, ang: number, len: number, depth: number) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const n = Math.ceil(len);
    for (let i = 0; i <= n; i++) {
      const px = x + ((x2 - x) * i) / n;
      const py = y + ((y2 - y) * i) / n;
      img.set(px, py, GREY[depth > 2 ? 3 : 2]!);
      if (depth < 2) img.set(px, py + 1, GREY[0]!);
    }
    if (depth >= 4) return;
    limb(x2, y2, ang - 0.55 - hash(depth, n, 81) * 0.3, len * 0.66, depth + 1);
    limb(x2, y2, ang + 0.5 + hash(depth, n, 82) * 0.3, len * 0.6, depth + 1);
  };
  limb(47, 28, Math.PI + 0.35, 16, 1);
  limb(34, 22, Math.PI + 0.9, 10, 2);
  limb(30, 22, Math.PI - 0.4, 9, 2);
  img.outline({ darken: 0.55 });
}

/** Hanging lantern (16x32): scroll bracket from the left edge, chain, lantern centred on x = 8. */
export function fgLantern(img: Img) {
  img.hline(0, 9, 1, C.iron);
  img.hline(0, 3, 2, C.soot);
  img.set(4, 3, C.iron);
  img.set(5, 4, C.iron);
  img.set(4, 4, C.soot);
  for (let y = 2; y < 9; y++) img.set(8, y, (y & 1) === 0 ? C.wiron : C.iron);
  img.rect(5, 9, 6, 2, C.iron);
  img.hline(6, 9, 9, C.wiron);
  for (let y = 11; y < 19; y++)
    for (let x = 5; x < 11; x++) img.set(x, y, x === 5 || x === 10 ? C.iron : y < 13 ? C.flame : x < 8 ? C.lamp : C.ember);
  img.vline(8, 11, 18, C.iron);
  img.rect(5, 19, 6, 2, C.iron);
  img.set(8, 21, C.wiron);
  img.set(8, 22, C.iron);
  img.outline({ darken: 0.55 });
}

/** Hanging sign on an iron arm (32x32; arm attaches at the right edge). */
function sign(img: Img, board: R3, emblem: 'lantern' | 'key') {
  // arm + scroll brace
  img.hline(3, 31, 2, C.iron);
  img.hline(3, 31, 3, C.soot);
  img.set(31, 1, C.wiron);
  img.line(30, 4, 24, 10, C.iron);
  for (let a = 0; a < 300; a += 15) {
    const r = (a * Math.PI) / 180;
    img.set(26 + Math.cos(r) * 2.5, 6 + Math.sin(r) * 2.5, C.iron);
  }
  // chains
  for (const x of [6, 19]) for (let y = 4; y < 9; y++) img.set(x, y, (y & 1) === 0 ? C.wiron : C.iron);
  // board with a moulded frame
  slab(img, 3, 9, 20, 15, 0, board);
  img.hline(3, 22, 9, board[2]);
  img.vline(3, 9, 23, board[2]);
  img.rect(5, 11, 16, 11, board[1]);
  img.hline(5, 20, 21, board[0]);
  img.vline(20, 11, 21, board[0]);
  if (emblem === 'lantern') {
    // the Hanged Lantern: a little lantern on a noose
    img.vline(12, 11, 13, C.linen);
    img.rect(10, 14, 5, 1, C.brassE);
    img.rect(10, 15, 5, 4, C.lamp);
    img.vline(10, 15, 18, C.brass);
    img.vline(14, 15, 18, C.ochre);
    img.rect(10, 19, 5, 1, C.ochre);
  } else {
    // curio shop: a brass key
    img.ellipse(9, 16, 2.6, 2.6, (_x, _y, nx, ny) => (nx * nx + ny * ny < 0.25 ? null : nx + ny < 0 ? C.brassE : C.brass));
    img.hline(12, 18, 16, C.brass);
    img.hline(12, 18, 17, C.ochre);
    img.vline(17, 17, 19, C.brass);
    img.vline(15, 17, 18, C.brass);
  }
  finish(img, 0.45);
}
export const fgSign = (img: Img) => sign(img, WINE3, 'lantern');
export const fgSign2 = (img: Img) => sign(img, TEAL3, 'key');

/** Laundry line between two side walls: a sagging cord with pegged washing. */
function laundry(img: Img, items: [x: number, w: number, len: number, c: R3][]) {
  const W = img.w - 1;
  const sag = 5;
  const yAt = (x: number) => 3 + sag * 4 * (x / W) * (1 - x / W);
  for (let x = 0; x <= W; x++) img.set(x, yAt(x), C.oldpl);
  img.set(0, 3, C.iron);
  img.set(W, 3, C.iron);
  for (const [x0, w, len, c] of items) {
    for (let x = x0; x < x0 + w; x++) {
      const top = Math.round(yAt(x)) + 1;
      const wave = (x - x0) % 3 === 2 ? 1 : 0;
      for (let y = top; y < top + len + wave; y++) img.set(x, y, x === x0 ? c[2] : x === x0 + w - 1 ? c[0] : y === top + len + wave - 1 ? c[0] : c[1]);
    }
    for (const px of [x0, x0 + w - 1]) img.set(px, Math.round(yAt(px)), C.heart);
  }
  finish(img, 0.5);
}
export const fgLaundry = (img: Img) =>
  laundry(img, [
    [4, 7, 9, LINEN3],
    [14, 11, 13, LINEN3],
    [28, 5, 10, [C.slateS, '#394764', '#56688a']],
    [36, 7, 7, WINE3],
  ]);
export const fgLaundry2 = (img: Img) =>
  laundry(img, [
    [3, 6, 8, CLAY3],
    [12, 13, 14, LINEN3],
    [29, 7, 9, TEAL3],
    [39, 4, 5, LINEN3],
    [45, 9, 12, PLUM3],
    [57, 3, 4, WINE3],
  ]);

/** Archway span over two piers (`span` px between pier centres): capitals, voussoir ring, keystone
 *  with the broken-hour ring. The piers' own sprites end under the capitals. */
function archSpan(img: Img) {
  const W = img.w;
  const cx = W / 2;
  const spring = 30;
  const ri = cx - 16; // intrados reaches the inner pier faces
  const ro = cx - 7;
  const RYI = 20;
  const RYO = 27;
  for (let y = 0; y < spring + 1; y++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      const dy = spring - (y + 0.5);
      const ei = (dx / ri) ** 2 + (dy / RYI) ** 2;
      const eo = (dx / ro) ** 2 + (dy / RYO) ** 2;
      if (dy < 0 || ei < 1 || eo > 1) continue;
      const a = Math.atan2(dy / RYO, dx / ro); // 0..PI
      const v = Math.floor((a / Math.PI) * 11);
      const frac = (a / Math.PI) * 11 - v;
      let c: string = (dx * -0.62 + -dy * -0.78) / hypot(dx, dy) > 0.3 ? C.chalk : v % 2 ? C.wstone : '#6a6878';
      if (frac < 0.07 || frac > 0.93) c = C.mortar;
      if (eo > 0.9) c = dy > RYO * 0.6 ? C.chalk : C.wstone;
      if (ei < 1.12) c = C.plum;
      img.set(x, y, c);
    }
  // keystone
  slab(img, cx - 4, 0, 8, 11, 3, STONE3);
  for (let a = 0; a < 360; a += 30) img.set(cx + Math.cos((a * Math.PI) / 180) * 2, 6 + Math.sin((a * Math.PI) / 180) * 2, a === 300 ? C.plum : C.brass);
  // capitals over the pier tops (the pier sprites continue below y = 28)
  for (const x0 of [0, W - 16]) {
    slab(img, x0 + 1, 28, 14, 6, 2, STONE3);
    img.hline(x0 + 1, x0 + 14, 28, C.chalk);
    for (let y = 34; y < 40; y++)
      for (let x = x0 + 3; x < x0 + 13; x++) img.set(x, y, (y === 37 ? C.mortar : x === x0 + 3 ? C.chalk : x >= x0 + 11 ? C.plum : C.wstone) as string);
  }
  // ivy trailing from one haunch
  for (const [x, y] of [
    [9, 24],
    [10, 25],
    [10, 26],
    [9, 27],
    [11, 23],
  ] as const)
    img.set(x, y, C.moss);
  img.set(10, 24, C.leaf);
  finish(img, 0.5);
}
export const fgArch = archSpan;
export const fgArchSmall = archSpan;
