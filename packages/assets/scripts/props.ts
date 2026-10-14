// Every non-building object sprite (nature, town furniture, interior furniture), drawn by code.
// Frame sizes must match PROP_DEFS in src/layout.ts (asserted by the generator).
import { PROP_DEFS } from '../src/layout.js';
import { box, canopy, flame, planks, shadow, sphere, stonework } from './lib/draw.js';
import { bayer, dpick, hash, Img, mix, ramp, vnoise, type Color } from './lib/img.js';

type Draw = (img: Img) => void;

// palettes
const BARK = ['#1c1418', '#2a1f1f', '#3a2b26', '#4b3a30', '#5b4a3c'];
const OAK = ['#0f2018', '#16301f', '#1f4026', '#2c522e', '#3e6838', '#55804a'];
const OAK_AUTUMN = ['#1e1a12', '#2e2816', '#47391c', '#634c22', '#80602c', '#9c7a3a'];
const PINE = ['#0b1717', '#10211f', '#163029', '#1f4034', '#2c5242', '#3d6650'];
const STONE = ['#24212c', '#312d3a', '#3f3a48', '#4e4858', '#5f5869', '#726a7a'];
const IRON = ['#0f0d14', '#1b1822', '#2a2632', '#3c3746'];
const WOOD = ['#22160f', '#311f15', '#422b1d', '#543826', '#674630'];
const WOOD_LIGHT = ['#3a2618', '#4d3421', '#61432c', '#755438', '#8a6646'];
const BRASS = ['#3a2a10', '#5e4518', '#8a6a24', '#b8913a', '#e0c060'];
const GLOW = ['#b0602a', '#e8902e', '#ffc04a', '#ffe08a', '#fff6d0'];
const CLOTH: Record<string, string[]> = {
  red: ['#3a1016', '#5c1a22', '#80262c', '#a33a3a', '#c45a50'],
  green: ['#0f2a1c', '#18402a', '#22583a', '#2e704a', '#4a8a5e'],
  blue: ['#121a3a', '#1c2a58', '#283c78', '#385096', '#5470b0'],
  gold: ['#3a2a0e', '#5e4416', '#8a6420', '#b8902e', '#d8b450'],
  purple: ['#24123a', '#361c56', '#4a2872', '#62388e', '#7e52a8'],
  cream: ['#5a5040', '#7a6e58', '#9a8e74', '#b8ac90', '#d4c8ac'],
};

function trunk(img: Img, cx: number, base: number, top: number, w: number) {
  for (let y = top; y <= base; y++) {
    const flare = y > base - 4 ? base - 4 - y + 0 : 0;
    const hw = w / 2 - flare * 0.6;
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) {
      const t = (x - (cx - hw)) / (2 * hw);
      let v = 0.75 - t * 0.6 + (vnoise(x * 2, y * 0.4, 2, 7) - 0.5) * 0.5;
      if (hash(x, y, 8) < 0.08) v -= 0.3;
      img.set(x, y, dpick(BARK, v, x, y));
    }
  }
}

function oakTree(img: Img, autumn: boolean, seed: number) {
  const w = img.w;
  const base = img.h - 3;
  shadow(img, w / 2, base, 16, 4, 0.4);
  trunk(img, w / 2, base, base - 22, 7);
  // a couple of visible branches
  img.line(w / 2 - 2, base - 14, w / 2 - 8, base - 22, BARK[1]!);
  img.line(w / 2 + 2, base - 16, w / 2 + 9, base - 23, BARK[1]!);
  const pal = autumn ? OAK_AUTUMN : OAK;
  const top = img.h - (autumn ? 54 : 62);
  const clusters: [number, number, number][] = [
    [w / 2 - 11, base - 22, 10],
    [w / 2 + 11, base - 21, 10],
    [w / 2, base - 24, 12],
    [w / 2 - 9, top + 18, 11],
    [w / 2 + 9, top + 17, 11],
    [w / 2, top + 11, 11],
  ];
  canopy(img, clusters, pal, seed);
  img.outline({ darken: 0.75 });
}

function pineTree(img: Img, tiers: number, seed: number) {
  const w = img.w;
  const base = img.h - 3;
  shadow(img, w / 2, base, 12, 3.5, 0.4);
  trunk(img, w / 2, base, base - 8, 5);
  const topY = 2;
  const bottomY = base - 5;
  const step = (bottomY - topY) / tiers;
  for (let t = 0; t < tiers; t++) {
    const ty = topY + t * step * 0.92;
    const by = ty + step * 1.45;
    const hw = 4 + ((t + 1) / tiers) * (w / 2 - 3);
    for (let y = Math.floor(ty); y <= by; y++) {
      const f = (y - ty) / (by - ty);
      const half = hw * Math.pow(f, 0.85);
      const droop = f > 0.82 ? 1 : 0;
      for (let x = Math.floor(w / 2 - half); x <= Math.ceil(w / 2 + half - 1); x++) {
        const nx = (x + 0.5 - w / 2) / Math.max(1, half);
        let v = 0.55 - nx * 0.45 + (1 - f) * 0.15 - droop * 0.3;
        v += (hash(x, y, seed) - 0.5) * 0.3;
        if (hash(x, y, seed + 1) < 0.05) v += 0.3;
        img.set(x, y, dpick(PINE, v, x, y));
      }
    }
  }
  img.outline({ darken: 0.75 });
}

function deadTree(img: Img) {
  const w = img.w;
  const base = img.h - 3;
  shadow(img, w / 2, base, 13, 3.5, 0.35);
  trunk(img, w / 2, base, base - 30, 6);
  const GREY = ['#1d171b', '#2b2327', '#3a3034', '#4a3f40'];
  const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const steps = Math.ceil(len);
    for (let i = 0; i <= steps; i++) {
      const px = x + ((x2 - x) * i) / steps;
      const py = y + ((y2 - y) * i) / steps;
      img.set(px, py, GREY[depth > 2 ? 2 : 1]!);
      if (depth < 2) img.set(px + 1, py, GREY[0]!);
    }
    if (depth >= 4) return;
    branch(x2, y2, ang - 0.5 - hash(depth, Math.round(len), 3) * 0.3, len * 0.68, depth + 1);
    branch(x2, y2, ang + 0.45 + hash(depth, Math.round(len), 4) * 0.3, len * 0.62, depth + 1);
  };
  branch(w / 2, base - 28, -Math.PI / 2 - 0.5, 13, 1);
  branch(w / 2, base - 26, -Math.PI / 2 + 0.6, 12, 1);
  branch(w / 2, base - 18, -Math.PI / 2 - 1.1, 9, 2);
  img.outline({ darken: 0.6 });
}

function willow(img: Img) {
  const w = img.w;
  const base = img.h - 3;
  shadow(img, w / 2, base, 22, 4.5, 0.38);
  trunk(img, w / 2, base, base - 22, 8);
  const WIL = ['#0f2016', '#16301d', '#204326', '#2d5730', '#3f6d3c', '#5a8a4c'];
  canopy(
    img,
    [
      [w / 2 - 12, 18, 12],
      [w / 2 + 12, 18, 12],
      [w / 2, 13, 13],
    ],
    WIL,
    41,
  );
  // drooping strands
  for (let x = 6; x < w - 6; x += 2) {
    const len = 20 + Math.floor(hash(x, 0, 42) * 18);
    const sx = x + (hash(x, 1, 43) < 0.5 ? 0 : 1);
    for (let y = 22; y < 22 + len && y < base - 2; y++) {
      if (Math.abs(sx - w / 2) < 4 && y > base - 26) continue;
      const v = 0.6 - (y - 22) / len * 0.5 + (bayer(sx, y) - 0.5) * 0.2;
      img.set(sx + Math.round(Math.sin(y / 6 + x) * 0.6), y, dpick(WIL, v, sx, y));
    }
  }
  img.outline({ darken: 0.75 });
}

function fruitTree(img: Img) {
  const w = img.w;
  const base = img.h - 2;
  shadow(img, w / 2, base, 10, 3, 0.38);
  trunk(img, w / 2, base, base - 14, 4);
  canopy(
    img,
    [
      [w / 2 - 6, 18, 8],
      [w / 2 + 6, 18, 8],
      [w / 2, 12, 9],
    ],
    OAK,
    51,
  );
  for (const [x, y] of [
    [10, 14],
    [20, 11],
    [14, 21],
    [22, 19],
    [8, 20],
    [17, 7],
  ]) {
    img.set(x!, y!, '#c0302a');
    img.set(x! + 1, y!, '#8a1e1e');
    img.set(x!, y! - 1, '#ff7a5a');
  }
  img.outline({ darken: 0.75 });
}

function bush(img: Img, berries: boolean) {
  shadow(img, 8, 14, 7, 2, 0.35);
  canopy(
    img,
    [
      [5, 10, 5],
      [11, 10, 5],
      [8, 7, 5.5],
    ],
    OAK,
    berries ? 61 : 62,
  );
  if (berries)
    for (const [x, y] of [
      [4, 9],
      [9, 6],
      [12, 10],
      [7, 11],
    ]) {
      img.set(x!, y!, '#8a3a9a');
      img.set(x! + 1, y!, '#5a2068');
    }
  img.outline({ darken: 0.75 });
}

function rock(img: Img, big: boolean) {
  const w = img.w;
  const h = img.h;
  shadow(img, w / 2, h - 2, w / 2 - 1, 2.5, 0.35);
  sphere(img, w / 2, h - (big ? 12 : 6), w / 2 - 1.5, big ? 10 : 5.5, STONE, { tex: 0.4, seed: big ? 3 : 4 });
  // moss cap
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) if (img.alpha(x, y) > 200 && img.alpha(x, y - 2) === 0 && hash(x, y, 5) < 0.7) img.set(x, y, '#3a5a34');
  img.outline({ darken: 0.7 });
}

function stump(img: Img) {
  shadow(img, 8, 14, 7, 2);
  for (let y = 7; y < 14; y++) for (let x = 3; x < 13; x++) img.set(x, y, dpick(BARK, 0.7 - (x - 3) / 14 + (hash(x, y, 9) - 0.5) * 0.3, x, y));
  img.ellipse(8, 7, 5, 2.2, (x, y) => dpick(['#5a4430', '#7a5e40', '#8e7050'], 0.5 + Math.sin(Math.hypot(x - 8, (y - 7) * 2) * 2) * 0.4, x, y));
  img.outline({ darken: 0.7 });
}

function reeds(img: Img) {
  for (let i = 0; i < 7; i++) {
    const x = 2 + i * 2 + (hash(i, 0, 3) < 0.5 ? 0 : 1);
    const top = 3 + Math.floor(hash(i, 1, 4) * 6);
    for (let y = top; y < 15; y++) img.set(x + (y < 7 && i % 2 ? 1 : 0), y, dpick(['#1e3a24', '#2e5232', '#4a6e3e'], 0.3 + (15 - y) / 20, x, y));
    if (i % 2 === 0) {
      img.rect(x, top, 1, 3, '#5a3a22');
      img.set(x, top, '#7a5634');
    }
  }
  img.outline({ darken: 0.75 });
}

function waterfall(img: Img) {
  const w = img.w;
  const h = img.h;
  for (let x = 6; x < w - 6; x++)
    for (let y = 0; y < h - 6; y++) {
      const streak = vnoise(x * 3, y * 0.15, 3, 71);
      let v = 0.3 + streak * 0.6;
      if ((x === 6 || x === w - 7) && hash(x, y, 2) < 0.6) v -= 0.4;
      img.set(x, y, dpick(['#1c3550', '#2e5070', '#5a80a0', '#9ac0d8', '#e0f0f8'], v, x, y));
    }
  // mist/foam at the base
  for (let i = 0; i < 160; i++) {
    const x = 3 + Math.floor(hash(i, 0, 72) * (w - 6));
    const y = h - 10 + Math.floor(hash(i, 1, 73) * 9);
    img.blend(x, y, '#e8f4ff', 0.75);
  }
}

// --- town furniture ------------------------------------------------------------------------

function lamp(img: Img) {
  shadow(img, 8, img.h - 2, 5, 1.5, 0.4);
  const b = img.h - 3;
  img.rect(5, b - 2, 6, 3, IRON[1]!); // foot
  img.rect(6, b - 4, 4, 2, IRON[2]!);
  for (let y = 12; y < b - 3; y++) {
    img.set(7, y, IRON[3]!);
    img.set(8, y, IRON[1]!);
  }
  img.rect(6, 22, 4, 2, IRON[2]!); // collar
  // lantern head
  img.rect(4, 4, 8, 2, IRON[1]!);
  img.set(7, 3, IRON[2]!);
  img.set(8, 3, IRON[2]!);
  img.set(7, 2, IRON[3]!);
  for (let y = 6; y < 12; y++) for (let x = 4; x < 12; x++) img.set(x, y, dpick(GLOW, 0.95 - Math.abs(x - 7.5) * 0.1 - (y - 6) * 0.05, x, y));
  img.vline(4, 6, 11, IRON[1]!);
  img.vline(11, 6, 11, IRON[1]!);
  img.vline(8, 6, 11, IRON[2]!);
  img.rect(5, 12, 6, 1, IRON[1]!);
  img.outline({ darken: 0.5 });
}

function well(img: Img) {
  const w = img.w;
  const b = img.h - 2;
  shadow(img, w / 2, b, 15, 3);
  // stone cylinder
  for (let y = b - 12; y < b; y++)
    for (let x = 2; x < w - 2; x++) {
      const t = (x - 2) / (w - 4);
      img.set(x, y, dpick(STONE, 0.7 - t * 0.5 + (y % 4 === 0 ? -0.25 : 0) + (hash(x >> 2, y >> 2, 1) - 0.5) * 0.3, x, y));
    }
  img.ellipse(w / 2, b - 12, 14, 4, (x, y, nx, ny) => (nx * nx + ny * ny > 0.45 ? dpick(STONE, 0.75 - nx * 0.3, x, y) : dpick(['#06080e', '#0e1626', '#1a2a40'], 0.3 - ny * 0.4, x, y)));
  // posts and roof
  for (const px of [4, w - 6]) img.rect(px, b - 30, 2, 18, WOOD[3]!);
  img.hline(5, w - 6, b - 27, WOOD[2]!);
  img.vline(w / 2, b - 27, b - 18, '#6a5a48');
  img.rect(w / 2 - 2, b - 19, 5, 4, WOOD[2]!);
  img.poly(
    [
      [0, b - 30],
      [w / 2, b - 38],
      [w, b - 30],
      [w - 2, b - 28],
      [2, b - 28],
    ],
    (x, y) => dpick(['#2a2236', '#3a3048', '#4c405c'], 0.3 + (y % 3 === 0 ? 0.4 : 0) + (x < w / 2 ? 0.2 : 0), x, y),
  );
  img.outline({ darken: 0.7 });
}

function fountain(img: Img) {
  const w = img.w;
  const b = img.h - 2;
  shadow(img, w / 2, b, 23, 4);
  for (let y = b - 9; y < b; y++) for (let x = 1; x < w - 1; x++) img.set(x, y, dpick(STONE, 0.75 - (x / w) * 0.5 + (y === b - 9 ? 0.3 : 0), x, y));
  img.ellipse(w / 2, b - 10, 22, 6, (x, y, nx, ny) => (nx * nx + ny * ny > 0.62 ? dpick(STONE, 0.8 - nx * 0.3, x, y) : dpick(['#14253a', '#213b57', '#3a6080', '#8fb2c9'], 0.4 - ny * 0.3 + (hash(x, y, 3) < 0.08 ? 0.5 : 0), x, y)));
  img.rect(w / 2 - 3, b - 26, 6, 16, STONE[3]!);
  img.vline(w / 2 - 3, b - 26, b - 11, STONE[4]!);
  img.vline(w / 2 + 2, b - 26, b - 11, STONE[1]!);
  img.ellipse(w / 2, b - 27, 6, 2.5, STONE[4]!);
  for (let i = 0; i < 6; i++) {
    img.set(w / 2 - 4 - i, b - 26 + i * 2, '#9ac0d8');
    img.set(w / 2 + 4 + i, b - 26 + i * 2, '#9ac0d8');
  }
  img.set(w / 2, b - 31, '#cfe6f4');
  img.set(w / 2, b - 30, '#9ac0d8');
  img.outline({ darken: 0.7 });
}

function stall(img: Img, cloth: string[]) {
  const w = img.w;
  const b = img.h - 2;
  shadow(img, w / 2, b, 23, 3);
  // counter
  box(img, 2, b - 14, w - 4, 13, 4, WOOD_LIGHT);
  planks(img, 3, b - 9, w - 6, 7, WOOD, { vertical: true, size: 5, seed: 3 });
  // goods
  const goods = ['#c0302a', '#d08a2a', '#6a8a3a', '#8a5aa0', '#d0c070'];
  for (let i = 0; i < 9; i++) {
    const x = 5 + i * 4.4;
    const c = goods[(i + cloth.length) % goods.length]!;
    img.ellipse(x, b - 15, 2, 1.6, (xx, yy, nx, ny) => (nx + ny < -0.3 ? mix(c, '#ffffff', 0.35) : c));
  }
  // posts
  img.rect(3, b - 34, 2, 22, WOOD[2]!);
  img.rect(w - 5, b - 34, 2, 22, WOOD[2]!);
  // striped awning
  for (let y = b - 42; y < b - 30; y++)
    for (let x = 0; x < w; x++) {
      const slope = (y - (b - 42)) / 12;
      if (x < 2 - slope * 2 || x > w - 3 + slope * 2) continue;
      const stripe = Math.floor(x / 6) % 2 === 0;
      const pal = stripe ? cloth : CLOTH.cream!;
      let v = 0.75 - slope * 0.5;
      img.set(x, y, dpick(pal, v, x, y));
    }
  for (let x = 0; x < w; x++) {
    const scallop = (x % 6) < 3 ? 1 : 0;
    const stripe = Math.floor(x / 6) % 2 === 0;
    img.set(x, b - 30, (stripe ? cloth : CLOTH.cream!)[1]!);
    if (scallop) img.set(x, b - 29, (stripe ? cloth : CLOTH.cream!)[0]!);
  }
  img.outline({ darken: 0.7 });
}

function bench(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 15, 2);
  for (const x of [4, 26]) img.rect(x, b - 7, 2, 7, IRON[2]!);
  box(img, 1, b - 11, 30, 5, 3, WOOD_LIGHT);
  planks(img, 2, b - 19, 28, 6, WOOD_LIGHT, { size: 3, seed: 9 });
  for (const x of [4, 26]) img.rect(x, b - 19, 2, 8, IRON[1]!);
  img.outline({ darken: 0.7 });
}

function barrel(img: Img) {
  const b = img.h - 2;
  shadow(img, 8, b, 7, 2);
  for (let y = b - 16; y < b; y++) {
    const bulge = Math.sin(((y - (b - 16)) / 16) * Math.PI) * 1.5;
    for (let x = Math.floor(2 - bulge); x < Math.ceil(14 + bulge); x++) {
      const t = (x - 2 + bulge) / (12 + 2 * bulge);
      let v = 0.8 - t * 0.6;
      if (x % 3 === 0) v -= 0.12;
      img.set(x, y, dpick(WOOD_LIGHT, v, x, y));
    }
  }
  for (const y of [b - 14, b - 4]) img.hline(1, 14, y, IRON[2]!);
  img.ellipse(8, b - 16, 6, 2, (x, y) => dpick(WOOD, 0.6 + (x - 8) * -0.05, x, y));
  img.outline({ darken: 0.7 });
}

function crates(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 15, 2);
  const crate = (x: number, y: number, s: number) => {
    box(img, x, y, s, s, 4, WOOD_LIGHT);
    img.line(x + 1, y + 5, x + s - 2, y + s - 2, WOOD[2]!);
    img.rect(x + 1, y + 5, s - 2, 1, WOOD[2]!);
  };
  crate(1, b - 14, 14);
  crate(15, b - 13, 13);
  crate(7, b - 27, 13);
  img.outline({ darken: 0.7 });
}

function cart(img: Img) {
  const b = img.h - 2;
  shadow(img, 22, b, 22, 2.5);
  box(img, 4, b - 20, 34, 12, 3, WOOD_LIGHT);
  planks(img, 5, b - 16, 32, 7, WOOD, { vertical: true, size: 4 });
  img.line(38, b - 12, 47, b - 8, WOOD[3]!);
  img.line(38, b - 11, 47, b - 7, WOOD[1]!);
  // wheel
  img.ellipse(14, b - 7, 7, 7, (x, y, nx, ny) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d > 0.72) return dpick(WOOD, 0.7 - nx * 0.3, x, y);
    if (Math.abs(nx) < 0.15 || Math.abs(ny) < 0.15 || Math.abs(nx - ny) < 0.15) return WOOD[2]!;
    return null;
  });
  img.set(14, b - 7, IRON[3]!);
  // hay in cart
  for (let x = 6; x < 36; x++) for (let y = b - 24; y < b - 19; y++) if (hash(x, y, 5) < 0.8 - (b - 19 - y) * 0.12) img.set(x, y, dpick(['#6a5420', '#9a7a30', '#c0a048'], hash(x, y, 6), x, y));
  img.outline({ darken: 0.7 });
}

function haystack(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 15, 3);
  img.ellipse(16, b - 10, 14, 11, (x, y, nx, ny) => {
    let v = 0.55 + (nx * -0.62 + ny * -0.78) * 0.45 + (hash(x, y, 7) - 0.5) * 0.35;
    if ((x + Math.floor(y / 2)) % 4 === 0) v -= 0.15;
    return dpick(['#3e2e10', '#6a5020', '#94762e', '#bc9a40', '#dcc060'], v, x, y);
  });
  img.outline({ darken: 0.7 });
}

function signpost(img: Img) {
  const b = img.h - 2;
  shadow(img, 8, b, 4, 1.5);
  img.rect(7, 6, 2, b - 6, WOOD[3]!);
  img.vline(8, 6, b, WOOD[1]!);
  box(img, 1, 6, 14, 6, 1, WOOD_LIGHT);
  box(img, 3, 13, 12, 5, 1, WOOD_LIGHT);
  img.hline(3, 11, 9, '#d8c8a0');
  img.hline(5, 12, 15, '#d8c8a0');
  img.outline({ darken: 0.7 });
}

function noticeboard(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 14, 2);
  for (const x of [3, 27]) img.rect(x, 8, 2, b - 8, WOOD[2]!);
  box(img, 1, 6, 30, 16, 2, WOOD_LIGHT);
  const papers: [number, number, number, number, string][] = [
    [4, 9, 6, 8, '#d8ccb0'],
    [12, 10, 7, 6, '#c8b890'],
    [21, 9, 6, 9, '#e0d6c0'],
  ];
  for (const [x, y, w, h, c] of papers) {
    img.rect(x, y, w, h, c);
    for (let j = y + 2; j < y + h - 1; j += 2) img.hline(x + 1, x + w - 2, j, '#6a5a50');
    img.set(x + Math.floor(w / 2), y, '#a03030');
  }
  img.rect(0, 4, 32, 3, WOOD[3]!);
  img.outline({ darken: 0.7 });
}

function scarecrow(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 6, 2);
  img.rect(15, 14, 2, b - 14, WOOD[3]!);
  img.rect(4, 20, 24, 2, WOOD[2]!);
  // coat
  img.poly(
    [
      [9, 19],
      [23, 19],
      [24, 34],
      [8, 34],
    ],
    (x, y) => dpick(CLOTH.purple!, 0.6 - (x - 9) / 30 + (hash(x, y, 2) - 0.5) * 0.2, x, y),
  );
  img.rect(5, 19, 5, 4, CLOTH.purple![2]!);
  img.rect(22, 19, 5, 4, CLOTH.purple![1]!);
  for (const x of [4, 27]) for (let i = 0; i < 3; i++) img.set(x + (x < 10 ? -i % 2 : i % 2), 22 + i, '#c0a048');
  // sack head + hat
  sphere(img, 16, 14, 5, 5, ['#5a4a30', '#7a6644', '#9a8460', '#b8a07a'], { tex: 0.2 });
  img.set(14, 14, '#1a1010');
  img.set(18, 14, '#1a1010');
  img.hline(14, 18, 17, '#3a2a1a');
  img.rect(8, 9, 16, 2, '#2a2230');
  img.poly(
    [
      [12, 9],
      [16, 1],
      [20, 9],
    ],
    '#3a3044',
  );
  img.outline({ darken: 0.7 });
}

function grave(img: Img, v: 1 | 2 | 3) {
  const b = img.h - 2;
  shadow(img, 8, b, 6, 2);
  const G = ['#2a2732', '#3a3644', '#4c4756', '#5e5868', '#736c7c'];
  if (v === 1) {
    img.poly(
      [
        [3, b - 1],
        [3, b - 12],
        [8, b - 16],
        [13, b - 12],
        [13, b - 1],
      ],
      (x, y) => dpick(G, 0.75 - (x - 3) / 14 + (hash(x, y, 3) - 0.5) * 0.25, x, y),
    );
    img.ellipse(8, b - 12, 5, 4, (x, y) => dpick(G, 0.8 - (x - 3) / 14, x, y));
    img.hline(6, 10, b - 10, G[1]!);
    img.hline(6, 9, b - 8, G[1]!);
  } else if (v === 2) {
    img.rect(7, b - 18, 3, 17, G[3]!);
    img.rect(3, b - 14, 11, 3, G[3]!);
    img.vline(7, b - 18, b - 1, G[4]!);
    img.hline(3, 13, b - 14, G[4]!);
    img.vline(9, b - 11, b - 1, G[1]!);
    img.rect(4, b - 3, 9, 2, G[2]!);
  } else {
    img.rect(5, b - 24, 7, 23, G[2]!);
    for (let y = b - 24; y < b - 1; y++) {
      img.set(5, y, G[4]!);
      img.set(6, y, G[3]!);
      img.set(11, y, G[1]!);
    }
    img.poly(
      [
        [4, b - 24],
        [8.5, b - 30],
        [13, b - 24],
      ],
      G[3]!,
    );
    img.rect(3, b - 4, 11, 3, G[2]!);
  }
  // moss
  for (let x = 0; x < 16; x++) for (let y = 0; y < img.h; y++) if (img.alpha(x, y) > 0 && hash(x, y, 9) < 0.08) img.set(x, y, '#3a5034');
  img.outline({ darken: 0.7 });
}

function crypt(img: Img) {
  const w = img.w;
  const b = img.h - 2;
  shadow(img, w / 2, b, 31, 4);
  // body
  stonework(img, 4, b - 38, w - 8, 37, STONE, '#1a1720', { rh: 6, sw: 10 });
  // columns
  for (const x of [6, w - 12]) {
    img.rect(x, b - 40, 6, 39, STONE[3]!);
    img.vline(x, b - 40, b - 1, STONE[5]!);
    img.vline(x + 5, b - 40, b - 1, STONE[1]!);
  }
  // pediment
  img.poly(
    [
      [1, b - 40],
      [w / 2, b - 60],
      [w - 1, b - 40],
    ],
    (x, y) => dpick(STONE, 0.7 - (x / w) * 0.4 + (y % 4 === 0 ? 0.1 : 0), x, y),
  );
  img.rect(0, b - 42, w, 3, STONE[4]!);
  img.poly(
    [
      [w / 2 - 6, b - 48],
      [w / 2, b - 54],
      [w / 2 + 6, b - 48],
    ],
    STONE[1]!,
  );
  // iron door
  img.rect(w / 2 - 8, b - 26, 16, 25, '#0e0c12');
  for (let x = w / 2 - 7; x < w / 2 + 8; x += 3) img.vline(x, b - 25, b - 2, IRON[3]!);
  img.hline(w / 2 - 8, w / 2 + 7, b - 18, IRON[3]!);
  img.ellipse(w / 2, b - 26, 8, 4, (x, y, nx, ny) => (ny < 0 ? STONE[2]! : null));
  // cross finial
  img.rect(w / 2 - 1, b - 68, 2, 9, STONE[4]!);
  img.rect(w / 2 - 3, b - 66, 6, 2, STONE[4]!);
  img.outline({ darken: 0.7 });
}

function angel(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 13, 3);
  const G = ['#2e2b36', '#3e3a48', '#524d5c', '#686272', '#827b8a'];
  box(img, 6, b - 10, 20, 9, 3, G);
  // robe
  img.poly(
    [
      [11, b - 10],
      [13, b - 30],
      [19, b - 30],
      [21, b - 10],
    ],
    (x, y) => dpick(G, 0.75 - (x - 11) / 14 + ((x + y) % 3 === 0 ? -0.1 : 0), x, y),
  );
  // wings
  for (const s of [-1, 1]) {
    img.poly(
      [
        [16 + s * 3, b - 30],
        [16 + s * 14, b - 40],
        [16 + s * 12, b - 22],
        [16 + s * 4, b - 20],
      ],
      (x, y) => dpick(G, (s < 0 ? 0.75 : 0.35) + ((y % 3) === 0 ? 0.15 : 0), x, y),
    );
  }
  sphere(img, 16, b - 33, 3.5, 3.5, G);
  img.outline({ darken: 0.7 });
}

function gatepost(img: Img) {
  const b = img.h - 2;
  stonework(img, 1, b - 30, 14, 30, STONE, '#1a1720', { rh: 5, sw: 7, shade: (i) => (i < 4 ? 0.15 : i > 10 ? -0.2 : 0) });
  box(img, 0, b - 33, 16, 4, 2, STONE);
  // lantern on top
  img.rect(5, b - 44, 6, 2, IRON[1]!);
  for (let y = b - 42; y < b - 35; y++) for (let x = 5; x < 11; x++) img.set(x, y, dpick(GLOW, 0.9 - Math.abs(x - 7.5) * 0.12, x, y));
  img.rect(5, b - 35, 6, 2, IRON[1]!);
  img.vline(5, b - 42, b - 36, IRON[1]!);
  img.vline(10, b - 42, b - 36, IRON[1]!);
  img.outline({ darken: 0.7 });
}

function anvil(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 13, 2);
  box(img, 9, b - 8, 14, 8, 2, WOOD);
  img.poly(
    [
      [3, b - 14],
      [26, b - 14],
      [29, b - 12],
      [24, b - 10],
      [21, b - 8],
      [11, b - 8],
      [9, b - 10],
      [3, b - 12],
    ],
    (x, y) => dpick(IRON, y < b - 12 ? 0.9 : 0.4, x, y),
  );
  img.outline({ darken: 0.6 });
}

function shed(img: Img) {
  const w = img.w;
  const b = img.h - 2;
  planks(img, 2, b - 30, w - 4, 30, WOOD, { vertical: true, size: 5, seed: 13 });
  img.rect(w / 2 - 7, b - 22, 14, 22, WOOD[0]!);
  planks(img, w / 2 - 6, b - 21, 12, 21, WOOD_LIGHT, { vertical: true, size: 4, seed: 14 });
  img.line(w / 2 - 6, b - 21, w / 2 + 5, b - 1, WOOD[2]!);
  // roof
  for (let y = b - 52; y < b - 28; y++)
    for (let x = 0; x < w; x++) {
      const row = Math.floor((y - (b - 52)) / 4);
      let v = 0.75 - (y - (b - 52)) / 40;
      if ((y - (b - 52)) % 4 === 3) v -= 0.3;
      if ((x + row * 3) % 8 === 0) v -= 0.2;
      img.set(x, y, dpick(['#1e1a28', '#2c2638', '#3c344a', '#4c4460'], v, x, y));
    }
  img.hline(0, w - 1, b - 28, '#0e0b14');
  img.blendRect(2, b - 28, w - 4, 3, '#000000', 0.35);
  // tools leaning
  img.line(6, b - 2, 9, b - 22, WOOD[3]!);
  img.rect(5, b - 4, 4, 3, IRON[3]!);
  img.outline({ darken: 0.7 });
}

function windmill(img: Img) {
  const w = img.w;
  const b = img.h - 2;
  shadow(img, w / 2, b, 34, 5);
  // tapered stone tower
  const topY = b - 92;
  for (let y = topY; y < b; y++) {
    const f = (y - topY) / (b - topY);
    const hw = 16 + f * 12;
    for (let x = Math.floor(w / 2 - hw); x < Math.ceil(w / 2 + hw); x++) {
      const t = (x - (w / 2 - hw)) / (2 * hw);
      const row = Math.floor(y / 5);
      const brick = (x + (row % 2) * 4) % 9 === 0 || y % 5 === 0;
      let v = 0.8 - t * 0.65 + (hash(Math.floor((x + (row % 2) * 4) / 9), row, 4) - 0.5) * 0.25;
      if (brick) v -= 0.3;
      img.set(x, y, dpick(['#3a3440', '#4c4552', '#605866', '#766c78', '#8a8088'], v, x, y));
    }
  }
  // door + window
  img.rect(w / 2 - 6, b - 20, 12, 20, '#140e0c');
  planks(img, w / 2 - 5, b - 19, 10, 19, WOOD, { vertical: true, size: 3, seed: 2 });
  img.ellipse(w / 2, b - 20, 6, 3, (x, y, nx, ny) => (ny < 0 ? '#140e0c' : null));
  img.rect(w / 2 - 3, b - 58, 6, 8, '#ffc04a');
  img.rect(w / 2 - 3, b - 58, 6, 1, '#8a5a2a');
  img.vline(w / 2, b - 58, b - 51, '#5a3a20');
  // conical cap
  img.poly(
    [
      [w / 2 - 20, topY + 2],
      [w / 2, topY - 22],
      [w / 2 + 20, topY + 2],
    ],
    (x, y) => dpick(['#2a1a1a', '#3e2424', '#562e2c', '#6e3a34'], 0.75 - (x - (w / 2 - 20)) / 50 + ((y % 4) === 0 ? -0.15 : 0), x, y),
  );
  // sails (X)
  const hub = [w / 2, topY + 4] as const;
  const sail = (ang: number) => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    for (let r = 4; r < 46; r++) {
      const x = hub[0] + dx * r;
      const y = hub[1] + dy * r;
      img.set(x, y, WOOD[2]!);
      if (r > 10)
        for (let s = 1; s <= 6; s++) {
          const sx = x + -dy * s;
          const sy = y + dx * s;
          const lattice = r % 5 === 0 || s === 6;
          img.set(sx, sy, lattice ? WOOD[1]! : dpick(['#8a7e6a', '#a89a80', '#c8bca0'], 0.6 - s * 0.05, Math.round(sx), Math.round(sy)));
        }
    }
  };
  sail(-Math.PI / 4);
  sail(Math.PI / 4);
  sail((3 * Math.PI) / 4);
  sail((-3 * Math.PI) / 4);
  sphere(img, hub[0], hub[1], 3, 3, IRON);
  img.outline({ darken: 0.7 });
}

function pumpkins(img: Img) {
  for (const [x, y, r] of [
    [5, 11, 4],
    [11, 12, 3.5],
  ] as const) {
    sphere(img, x, y, r + 0.5, r - 0.5, ['#5a2a0a', '#8a4410', '#c06a1a', '#e8902e'], { tex: 0.2 });
    img.set(x, y - r + 0.5, '#2e4a20');
    img.set(x, y - r - 0.5, '#2e4a20');
  }
  img.outline({ darken: 0.7 });
}

/** Wooden fence / iron railing piece with auto-connection mask (N=1 E=2 S=4 W=8). */
function fencePiece(img: Img, mask: number, iron: boolean) {
  const b = img.h - 1;
  const post = iron ? IRON : WOOD_LIGHT;
  const rail = iron ? IRON[2]! : WOOD_LIGHT[2]!;
  const railHi = iron ? IRON[3]! : WOOD_LIGHT[4]!;
  if (mask & 2 || mask & 8) {
    const x0 = mask & 8 ? 0 : 7;
    const x1 = mask & 2 ? 15 : 8;
    if (iron) {
      img.hline(x0, x1, b - 13, rail);
      img.hline(x0, x1, b - 3, rail);
      for (let x = x0; x <= x1; x++)
        if (x % 3 === 1) {
          img.vline(x, b - 15, b - 1, IRON[1]!);
          img.set(x, b - 16, IRON[3]!);
        }
    } else {
      for (const y of [b - 13, b - 7]) {
        img.hline(x0, x1, y, railHi);
        img.hline(x0, x1, y + 1, rail);
        img.hline(x0, x1, y + 2, WOOD[1]!);
      }
    }
  }
  if (mask & 1 || mask & 4) {
    // receding run: show a thin rail line
    const y0 = mask & 1 ? 0 : b - 14;
    const y1 = mask & 4 ? b : b - 10;
    img.vline(iron ? 8 : 7, y0 + 8, y1, rail);
    img.vline(iron ? 7 : 8, y0 + 8, y1, railHi);
  }
  // post
  const ph = iron ? 19 : 17;
  for (let y = b - ph; y <= b; y++) {
    img.set(6, y, post[3]!);
    img.set(7, y, post[2]!);
    img.set(8, y, post[1]!);
    if (!iron) img.set(9, y, post[1]!);
  }
  if (iron) {
    img.set(7, b - ph - 1, post[3]!);
    img.set(7, b - ph - 2, '#5a5468');
  } else {
    img.hline(6, 9, b - ph, post[4]!);
  }
  img.outline({ darken: 0.6 });
}

// --- interior furniture ------------------------------------------------------------------------

const BLANKETS = [CLOTH.red!, CLOTH.blue!, CLOTH.green!, CLOTH.purple!, CLOTH.gold!];

function bed(img: Img, wide: boolean, seed: number) {
  const w = img.w;
  const blanket = BLANKETS[seed % BLANKETS.length]!;
  box(img, 0, 0, w, 9, 3, WOOD); // headboard
  img.rect(1, 9, w - 2, img.h - 10, WOOD[1]!);
  // pillow(s)
  const pillows = wide ? [2, w / 2 + 1] : [2];
  for (const px of pillows) img.ellipse(px + (wide ? 6 : 6), 12, wide ? 6 : 6, 3, (x, y, nx, ny) => dpick(['#8a8478', '#b0a898', '#d4ccbc', '#ece6d8'], 0.7 - ny * 0.3 - nx * 0.2, x, y));
  // blanket
  for (let y = 15; y < img.h - 2; y++)
    for (let x = 1; x < w - 1; x++) {
      let v = 0.6 - (x / w) * 0.35 + (y === 15 ? 0.35 : 0);
      if ((x + y) % 6 === 0 && y > 17) v += 0.15;
      img.set(x, y, dpick(blanket, v, x, y));
    }
  img.hline(1, w - 2, 16, mix(blanket[4]!, '#ffffff', 0.2));
  img.rect(0, img.h - 3, w, 3, WOOD[2]!);
  img.outline({ darken: 0.7 });
}

function nightstand(img: Img) {
  box(img, 2, 10, 12, 13, 4, WOOD_LIGHT);
  img.hline(4, 11, 18, WOOD[1]!);
  img.set(8, 19, BRASS[3]!);
  // candle
  img.rect(7, 6, 2, 5, '#e8e0cc');
  img.set(8, 6, '#b8b0a0');
  flame(img, 7, 5);
  img.rect(5, 10, 6, 1, BRASS[2]!);
  img.outline({ darken: 0.7 });
}

function table(img: Img, round: boolean) {
  const w = img.w;
  if (round) {
    img.rect(w / 2 - 2, 10, 4, 12, WOOD[1]!);
    img.rect(w / 2 - 6, 20, 12, 2, WOOD[1]!);
    img.ellipse(w / 2, 8, 15, 6, (x, y, nx, ny) => dpick(WOOD_LIGHT, 0.7 - nx * 0.2 - ny * 0.3 + (ny > 0.6 ? -0.4 : 0), x, y));
  } else {
    for (const x of [2, w - 5]) img.rect(x, 10, 3, 13, WOOD[1]!);
    box(img, 0, 2, w, 10, 7, WOOD_LIGHT);
  }
  // mug + bread
  img.rect(w / 2 - 6, 3, 3, 4, '#8a7a6a');
  img.set(w / 2 - 6, 3, '#d8d0c0');
  img.ellipse(w / 2 + 5, 6, 3, 2, '#a0702a');
  img.set(w / 2 + 4, 5, '#d0a050');
  img.outline({ darken: 0.7 });
}

function chair(img: Img) {
  box(img, 3, 0, 10, 12, 2, WOOD_LIGHT);
  for (let y = 3; y < 11; y += 3) img.hline(4, 11, y, WOOD[1]!);
  box(img, 2, 11, 12, 5, 3, WOOD_LIGHT);
  for (const x of [3, 11]) img.rect(x, 16, 2, 7, WOOD[1]!);
  img.outline({ darken: 0.7 });
}

function stool(img: Img) {
  img.ellipse(8, 6, 6, 3, (x, y, nx, ny) => dpick(WOOD_LIGHT, 0.7 - nx * 0.2 - ny * 0.3, x, y));
  for (const x of [4, 11]) img.rect(x, 8, 2, 7, WOOD[1]!);
  img.outline({ darken: 0.7 });
}

function wardrobe(img: Img) {
  box(img, 1, 2, 30, 37, 4, WOOD);
  img.vline(16, 7, 37, WOOD[0]!);
  for (const x of [5, 19]) {
    img.rect(x, 9, 8, 11, WOOD[2]!);
    img.rect(x, 23, 8, 11, WOOD[2]!);
  }
  img.set(14, 22, BRASS[3]!);
  img.set(18, 22, BRASS[3]!);
  img.rect(0, 0, 32, 3, WOOD[3]!);
  img.outline({ darken: 0.7 });
}

function bookshelf(img: Img) {
  box(img, 1, 1, 30, 38, 3, WOOD);
  const bookCols = ['#7a2a2a', '#2a4a6a', '#3a5a2a', '#6a5a2a', '#4a2a5a', '#8a6a4a', '#2a2a3a'];
  for (const sy of [6, 16, 26]) {
    img.rect(3, sy + 8, 26, 2, WOOD[3]!);
    let x = 3;
    let k = sy;
    while (x < 28) {
      const bw = 2 + Math.floor(hash(x, sy, 3) * 2);
      const bh = 6 + Math.floor(hash(x, sy, 4) * 3);
      const c = bookCols[k++ % bookCols.length]!;
      img.rect(x, sy + 8 - bh, bw, bh, c);
      img.vline(x, sy + 8 - bh, sy + 7, mix(c, '#ffffff', 0.25));
      img.set(x, sy + 9 - bh + 2, BRASS[3]!);
      x += bw + (hash(x, sy, 5) < 0.15 ? 2 : 0);
    }
  }
  img.outline({ darken: 0.7 });
}

function chest(img: Img) {
  box(img, 1, 4, 14, 11, 4, WOOD_LIGHT);
  img.hline(1, 14, 8, IRON[2]!);
  img.vline(4, 4, 14, IRON[2]!);
  img.vline(11, 4, 14, IRON[2]!);
  img.rect(7, 8, 2, 3, BRASS[3]!);
  img.outline({ darken: 0.7 });
}

function fireplace(img: Img) {
  const w = img.w;
  stonework(img, 0, 2, w, 30, STONE, '#16131c', { rh: 5, sw: 8, seed: 21 });
  box(img, 0, 0, w, 4, 2, WOOD);
  // hearth opening
  img.rect(7, 14, 18, 18, '#0a0608');
  img.ellipse(16, 14, 9, 4, (x, y, nx, ny) => (ny < 0 ? '#0a0608' : null));
  // logs + fire
  img.rect(9, 28, 14, 3, BARK[3]!);
  img.rect(10, 27, 12, 1, BARK[4]!);
  for (let i = 0; i < 40; i++) {
    const x = 10 + Math.floor(hash(i, 0, 22) * 12);
    const h = Math.floor(hash(i, 1, 23) * 10);
    for (let y = 27 - h; y < 27; y++) img.set(x, y, dpick(GLOW, (27 - y) / 10 < 0.5 ? 0.9 : 0.5, x, y));
  }
  img.outline({ darken: 0.6 });
}

function wallshelf(img: Img) {
  img.rect(0, 11, 32, 2, WOOD[3]!);
  img.hline(0, 31, 13, WOOD[0]!);
  for (const [x, c, h] of [
    [3, '#6a8aa0', 6],
    [9, '#a06040', 5],
    [14, '#d8c8a0', 7],
    [21, '#5a7a4a', 5],
    [26, '#8a4a6a', 6],
  ] as const) {
    sphere(img, x + 2, 11 - h / 2, 2.4, h / 2, [mix(c, '#000000', 0.5), mix(c, '#000000', 0.25), c, mix(c, '#ffffff', 0.35)]);
  }
  img.outline({ darken: 0.6 });
}

function windowInterior(img: Img) {
  img.rect(2, 2, 12, 12, WOOD[2]!);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) img.set(x, y, dpick(['#121a34', '#1a2850', '#2a3c6a', '#4a5e8a'], 0.2 + (13 - y) * 0.06 + (x < 6 ? 0.15 : 0), x, y));
  img.set(10, 5, '#e8e8d0');
  img.set(10, 4, '#a0a8c0');
  img.vline(8, 3, 12, WOOD[1]!);
  img.hline(3, 12, 8, WOOD[1]!);
  img.rect(1, 13, 14, 2, WOOD[3]!);
  img.outline({ darken: 0.6 });
}

function stainedGlass(img: Img) {
  const G2 = ['#a02a3a', '#2a5aa0', '#c0a02a', '#3a8a5a', '#7a3aa0'];
  img.rect(2, 4, 12, 26, STONE[2]!);
  img.ellipse(8, 6, 6, 5, STONE[2]!);
  for (let y = 3; y < 29; y++)
    for (let x = 4; x < 12; x++) {
      if (y < 7 && Math.hypot(x + 0.5 - 8, y - 7) > 4.2) continue;
      const cell = (Math.floor(x / 2) * 3 + Math.floor(y / 3)) % G2.length;
      const lead = x % 2 === 0 && y % 3 === 0;
      img.set(x, y, lead ? '#141018' : mix(G2[cell]!, '#ffffff', 0.15 + (hash(x, y, 4) < 0.15 ? 0.3 : 0)));
    }
  img.vline(8, 4, 28, '#141018');
  img.outline({ darken: 0.6 });
}

function plant(img: Img) {
  const b = img.h - 1;
  img.poly(
    [
      [4, b - 7],
      [12, b - 7],
      [11, b],
      [5, b],
    ],
    (x, y) => dpick(['#5a2a1a', '#8a4428', '#aa5a36'], 0.7 - (x - 4) / 10, x, y),
  );
  img.rect(3, b - 8, 10, 2, '#b06a40');
  canopy(
    img,
    [
      [5, b - 12, 4],
      [11, b - 12, 4],
      [8, b - 16, 5],
    ],
    OAK,
    81,
  );
  img.outline({ darken: 0.7 });
}

function loom(img: Img) {
  for (const x of [2, 28]) img.rect(x, 4, 2, 28, WOOD[2]!);
  img.rect(2, 4, 28, 2, WOOD[3]!);
  img.rect(2, 22, 28, 2, WOOD[3]!);
  for (let x = 5; x < 27; x++)
    for (let y = 7; y < 22; y++) img.set(x, y, dpick(CLOTH.red!, 0.5 + (x % 2 === 0 ? 0.2 : -0.1) + (y > 15 ? 0.1 : -0.2), x, y));
  img.rect(4, 26, 24, 4, WOOD[1]!);
  img.outline({ darken: 0.7 });
}

function rug(img: Img, pal: string[], long = false) {
  const w = img.w;
  const h = img.h;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const bx = Math.min(x - 1, w - 2 - x);
      const by = Math.min(y - 1, h - 2 - y);
      const border = Math.min(bx, by);
      let v = 0.45;
      if (border < 2) v = 0.85;
      else if (border < 3) v = 0.15;
      else {
        const cx = x - w / 2;
        const cy = y - h / 2;
        const diamond = (Math.abs(cx) / (w / 2) + Math.abs(cy) / (h / 2)) * 6;
        v = Math.floor(diamond) % 2 === 0 ? 0.55 : 0.35;
      }
      img.set(x, y, dpick(pal, v, x, y));
    }
  // fringe
  if (!long)
    for (let y = 2; y < h - 2; y += 2) {
      img.set(0, y, pal[3]!);
      img.set(w - 1, y, pal[3]!);
    }
  img.blendRect(1, h - 2, w - 2, 1, '#000000', 0.3);
}

function bar(img: Img) {
  const w = img.w;
  box(img, 0, 6, w, 24, 6, WOOD);
  planks(img, 1, 13, w - 2, 16, WOOD_LIGHT, { vertical: true, size: 6, seed: 31 });
  img.hline(1, w - 2, 12, BRASS[2]!);
  for (const x of [8, 26, 40, 60, 78]) {
    img.rect(x, 1, 4, 5, '#8a7a6a');
    img.rect(x, 1, 4, 1, '#e8e0d0');
    img.set(x + 4, 3, '#8a7a6a');
  }
  img.ellipse(52, 4, 3, 2, '#5a2a3a');
  img.rect(51, 0, 2, 3, '#2a3a2a');
  img.outline({ darken: 0.7 });
}

function kegs(img: Img) {
  img.rect(1, 22, 46, 3, WOOD[1]!);
  for (const x of [0, 16, 32]) {
    img.ellipse(x + 8, 14, 8, 9, (xx, yy, nx, ny) => {
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 0.82) return WOOD[1]!;
      if (d > 0.6 && d < 0.68) return IRON[2]!;
      return dpick(WOOD_LIGHT, 0.6 - nx * 0.2 - ny * 0.3, xx, yy);
    });
    img.rect(x + 7, 20, 2, 3, BRASS[3]!);
  }
  img.outline({ darken: 0.7 });
}

function pew(img: Img) {
  const w = img.w;
  box(img, 0, 0, w, 10, 2, WOOD);
  box(img, 0, 10, w, 7, 3, WOOD_LIGHT);
  for (const x of [1, w - 4]) img.rect(x, 17, 3, 6, WOOD[1]!);
  img.outline({ darken: 0.7 });
}

function altar(img: Img) {
  const w = img.w;
  box(img, 2, 8, w - 4, 22, 5, STONE);
  for (let y = 8; y < 26; y++) for (let x = w / 2 - 6; x < w / 2 + 6; x++) img.set(x, y, dpick(CLOTH.purple!, 0.6 + (y === 8 ? 0.3 : 0) - (x - (w / 2 - 6)) / 30, x, y));
  img.rect(w / 2 - 6, 24, 12, 2, BRASS[3]!);
  // book + candles
  img.rect(w / 2 - 4, 5, 8, 3, '#d8ccb0');
  img.vline(w / 2, 5, 7, '#6a5a40');
  for (const x of [6, w - 8]) {
    img.rect(x, 2, 2, 6, '#e8e0cc');
    flame(img, x, 1);
  }
  img.outline({ darken: 0.7 });
}

function candelabra(img: Img) {
  const b = img.h - 1;
  img.rect(5, b - 2, 6, 2, BRASS[2]!);
  img.vline(8, b - 20, b - 2, BRASS[3]!);
  img.vline(7, b - 20, b - 2, BRASS[1]!);
  img.hline(3, 12, b - 20, BRASS[3]!);
  for (const x of [3, 8, 12]) {
    img.rect(x - (x === 8 ? 1 : 0), b - 25, 2, 5, '#e8e0cc');
    flame(img, x, b - 26);
  }
  img.outline({ darken: 0.6 });
}

function gears(img: Img) {
  const gear = (cx: number, cy: number, r: number, teeth: number) => {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const tooth = Math.cos(a * teeth) > 0.3 ? 2 : 0;
        if (d > r + tooth || d < r * 0.3) continue;
        if (d > r * 0.55 && d < r * 0.75 && Math.cos(a * 4) < 0.4) continue;
        img.set(x, y, dpick(BRASS, 0.7 - (x - cx) / (r * 3) - (y - cy) / (r * 3), x, y));
      }
  };
  img.rect(4, 30, 40, 16, WOOD[1]!);
  box(img, 2, 30, 44, 17, 3, WOOD);
  gear(14, 18, 11, 10);
  gear(33, 14, 8, 8);
  gear(36, 29, 5, 6);
  img.outline({ darken: 0.65 });
}

function bellrope(img: Img) {
  for (let y = 0; y < img.h - 4; y++) img.set(8 + (y % 6 < 3 ? 0 : 1), y, y % 3 === 0 ? '#8a6a3a' : '#b89a5a');
  sphere(img, 8.5, img.h - 4, 3, 3.5, ['#3a1a1a', '#6a2a2a', '#9a3a3a', '#c06050']);
  img.outline({ darken: 0.6 });
}

function ladder(img: Img) {
  for (const x of [3, 12]) img.rect(x, 0, 2, img.h, WOOD[3]!);
  for (let y = 3; y < img.h; y += 5) img.rect(4, y, 9, 2, WOOD[2]!);
  img.outline({ darken: 0.7 });
}

function counter(img: Img) {
  const w = img.w;
  box(img, 0, 6, w, 24, 6, WOOD);
  planks(img, 1, 13, w - 2, 16, WOOD_LIGHT, { vertical: true, size: 8, seed: 41 });
  // scales + ledger + jar
  img.rect(8, 2, 10, 2, BRASS[3]!);
  img.vline(13, 0, 3, BRASS[2]!);
  img.rect(28, 3, 10, 4, '#d8ccb0');
  img.rect(46, 0, 6, 7, '#5a8a9a');
  img.rect(46, 0, 6, 1, '#c0e0e8');
  img.outline({ darken: 0.7 });
}

function shopshelf(img: Img) {
  const w = img.w;
  box(img, 0, 1, w, 38, 3, WOOD);
  const potion = ['#a02a3a', '#2a8a5a', '#3a5aa0', '#c0a02a', '#7a3aa0', '#d0d0e0'];
  for (const sy of [12, 24, 36]) {
    img.rect(2, sy, w - 4, 2, WOOD[3]!);
    for (let i = 0; i < 6; i++) {
      const x = 4 + i * 7;
      const c = potion[(i + sy) % potion.length]!;
      const h = 4 + ((i + sy) % 3);
      img.rect(x, sy - h, 4, h, c);
      img.set(x, sy - h, mix(c, '#ffffff', 0.5));
      img.rect(x + 1, sy - h - 2, 2, 2, '#8a7a6a');
    }
  }
  img.outline({ darken: 0.7 });
}

function sacks(img: Img) {
  for (const [x, y] of [
    [8, 14],
    [22, 15],
    [15, 9],
  ] as const) {
    sphere(img, x, y, 7, 6, ['#4a3a24', '#6a5636', '#8a744c', '#a89064'], { tex: 0.2 });
    img.rect(x - 1, y - 7, 3, 2, '#3a2a1a');
  }
  img.outline({ darken: 0.7 });
}

function doormat(img: Img) {
  for (let y = 4; y < 14; y++) for (let x = 2; x < 14; x++) img.set(x, y, dpick(['#3a2a1a', '#5a4428', '#7a6038'], ((x + y) % 3) / 3, x, y));
}

// ---------------------------------------------------------------------------------------

const DRAW: Record<string, Draw> = {
  oak: (i) => oakTree(i, false, 11),
  oak2: (i) => oakTree(i, true, 12),
  pine: (i) => pineTree(i, 4, 21),
  pinetall: (i) => pineTree(i, 5, 22),
  deadtree: deadTree,
  willow,
  fruittree: fruitTree,
  bush: (i) => bush(i, false),
  bushberry: (i) => bush(i, true),
  rock: (i) => rock(i, false),
  bigrock: (i) => rock(i, true),
  stump,
  reeds,
  waterfall,
  lamp,
  well,
  fountain,
  stall_red: (i) => stall(i, CLOTH.red!),
  stall_green: (i) => stall(i, CLOTH.green!),
  stall_blue: (i) => stall(i, CLOTH.blue!),
  stall_gold: (i) => stall(i, CLOTH.gold!),
  bench,
  barrel,
  crates,
  cart,
  haystack,
  signpost,
  noticeboard,
  scarecrow,
  grave1: (i) => grave(i, 1),
  grave2: (i) => grave(i, 2),
  grave3: (i) => grave(i, 3),
  crypt,
  angel,
  gatepost,
  anvil,
  shed,
  windmill,
  pumpkins,
  bed: (i) => bed(i, false, 0),
  bedwide: (i) => bed(i, true, 3),
  nightstand,
  table: (i) => table(i, false),
  roundtable: (i) => table(i, true),
  chair,
  stool,
  wardrobe,
  bookshelf,
  chest,
  fireplace,
  wallshelf,
  window: windowInterior,
  stainedglass: stainedGlass,
  plant,
  loom,
  rug_red: (i) => rug(i, CLOTH.red!),
  rug_blue: (i) => rug(i, CLOTH.blue!),
  rug_green: (i) => rug(i, CLOTH.green!),
  rug_long: (i) => rug(i, CLOTH.red!, true),
  bar,
  kegs,
  pew,
  altar,
  candelabra,
  gears,
  bellrope,
  ladder,
  counter,
  shopshelf,
  sacks,
  doormat,
};

/** All prop frames: name -> image. Fence/iron produce 16 auto-connect frames each. */
export function drawProps(): Map<string, Img> {
  const out = new Map<string, Img>();
  for (const [kind, def] of Object.entries(PROP_DEFS)) {
    if (kind === 'fence' || kind === 'iron') {
      for (let m = 0; m < 16; m++) {
        const img = new Img(def.w, def.h);
        fencePiece(img, m, kind === 'iron');
        out.set(`${kind}_${m}`, img);
      }
      continue;
    }
    const fn = DRAW[kind];
    if (!fn) throw new Error(`no drawing for prop ${kind}`);
    const img = new Img(def.w, def.h);
    fn(img);
    out.set(kind, img);
  }
  // Extra bed colour variants for houses (keeps cottages distinct).
  for (let s = 0; s < BLANKETS.length; s++) {
    const a = new Img(PROP_DEFS.bed!.w, PROP_DEFS.bed!.h);
    bed(a, false, s);
    out.set(`bed_${s}`, a);
  }
  return out;
}

export const _unused: Color = '#000';
export { ramp };
