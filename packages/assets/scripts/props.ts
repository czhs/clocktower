// Every non-building object sprite (nature, town furniture, interior furniture), drawn by code.
// Frame sizes must match PROP_DEFS in src/layout.ts (asserted by the generator).
import { PROP_DEFS } from '../src/layout.js';
import { box, canopy, flame, planks, shadow, sphere, stonework } from './lib/draw.js';
import { bayer, dpick, hash, Img, mix, ramp, vnoise } from './lib/img.js';

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
      // branch tips: the tier's skirt is jagged, not a smooth cone
      const tips = f > 0.55 ? 1 - Math.abs(Math.sin((y + t * 3) * 1.3 + seed)) * 0.18 * f : 1;
      const half = hw * Math.pow(f, 0.85) * tips;
      const droop = f > 0.82 ? 1 : 0;
      for (let x = Math.floor(w / 2 - half); x <= Math.ceil(w / 2 + half - 1); x++) {
        const nx = (x + 0.5 - w / 2) / Math.max(1, half);
        if (f > 0.86 && hash(x, t, seed + 5) < 0.35 && Math.abs(nx) > 0.2) continue; // ragged hem
        let v = 0.55 - nx * 0.45 + (1 - f) * 0.15 - droop * 0.3;
        v += (hash(x, y, seed) - 0.5) * 0.3;
        if (hash(x, y, seed + 1) < 0.05) v += 0.3;
        // needle strokes slanting down from the trunk
        if ((x + Math.floor(y * 0.5) * (nx < 0 ? 1 : -1)) % 4 === 0) v -= 0.12;
        // lit rim on the upper-left of each tier
        if (nx < -0.75 && f < 0.8) v += 0.25;
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
      [4.5, 10.5, 4.5],
      [11.5, 10.5, 4.5],
      [8, 7, 5.5],
      [8, 11, 4.5],
    ],
    OAK,
    berries ? 61 : 62,
    { tex: 0.35 },
  );
  if (berries) {
    for (const [x, y] of [
      [4, 9],
      [9, 5],
      [12, 10],
      [7, 11],
      [10, 8],
    ]) {
      img.set(x!, y!, '#9a3a8a');
      img.set(x! + 1, y!, '#5a2068');
      img.set(x!, y! - 1, '#d07ac0');
    }
  } else {
    for (const [x, y] of [
      [5, 8],
      [11, 9],
      [8, 5],
    ]) {
      img.set(x!, y!, '#e8e2ec');
      img.set(x!, y! + 1, '#b8b0c0');
    }
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
  for (let y = 7; y < 14; y++)
    for (let x = 3; x < 13; x++) {
      let v = 0.75 - (x - 3) / 12 + (hash(x, y, 9) - 0.5) * 0.25;
      if ((x + (y >> 1)) % 3 === 0) v -= 0.15;
      img.set(x, y, dpick(BARK, v, x, y));
    }
  // roots
  img.set(2, 13, BARK[2]!);
  img.set(13, 13, BARK[1]!);
  img.set(1, 14, BARK[1]!);
  img.ellipse(8, 7, 5, 2.2, (x, y) => {
    const ring = Math.hypot(x + 0.5 - 8, (y + 0.5 - 7) * 2.2);
    return dpick(['#5a4430', '#7a5e40', '#9a7c58'], 0.55 + Math.sin(ring * 2.2) * 0.35 - (x - 8) * 0.04, x, y);
  });
  img.set(4, 9, '#3a5a34');
  img.set(5, 10, '#2e4a2a');
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
  const b = img.h - 2; // ground line
  shadow(img, 8, b, 5, 1.6, 0.42);
  const HI = '#545068';
  // stepped plinth
  for (const [y0, y1, x0, x1] of [
    [b - 1, b, 4, 11],
    [b - 3, b - 2, 5, 10],
    [b - 5, b - 4, 6, 9],
  ] as [number, number, number, number][])
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) img.set(x, y, x === x0 ? HI : x === x1 ? IRON[0]! : y === y0 ? IRON[3]! : IRON[2]!);
  // post with two collars
  for (let y = 17; y < b - 5; y++) {
    img.set(7, y, HI);
    img.set(8, y, IRON[1]!);
  }
  for (const y of [b - 15, 20]) {
    img.hline(6, 9, y, IRON[2]!);
    img.set(6, y, HI);
  }
  // scroll brackets under the lantern
  for (const s of [-1, 1]) {
    const x = s < 0 ? 5 : 10;
    img.set(x, 18, IRON[2]!);
    img.set(x - s, 17, IRON[2]!);
    img.set(x, 16, IRON[1]!);
    img.set(x + s, 17, IRON[1]!);
  }
  // lantern: tray, glass, frame, roof, finial
  img.hline(4, 11, 16, IRON[1]!);
  img.hline(5, 10, 17, IRON[0]!);
  for (let y = 7; y <= 15; y++)
    for (let x = 5; x <= 10; x++) {
      const d = Math.hypot(x - 7.5, (y - 12) * 0.8);
      img.set(x, y, dpick(GLOW, 1 - d * 0.16 - (y < 9 ? 0.1 : 0), x, y));
    }
  img.vline(4, 7, 15, IRON[2]!);
  img.vline(11, 7, 15, IRON[0]!);
  img.vline(7, 8, 15, '#7a5a2e');
  img.set(7, 12, '#fff6d0');
  img.set(8, 12, '#ffe08a');
  img.set(7, 11, '#fff6d0');
  img.hline(3, 12, 6, IRON[1]!);
  img.hline(4, 11, 5, IRON[2]!);
  img.hline(5, 10, 4, IRON[2]!);
  img.hline(6, 9, 3, IRON[3]!);
  img.set(5, 5, HI);
  img.set(6, 4, HI);
  img.hline(7, 8, 2, IRON[2]!);
  img.set(7, 1, HI);
  img.set(8, 1, IRON[1]!);
  img.set(7, 0, IRON[2]!);
  img.outline({ darken: 0.55 });
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

function stall(img: Img, cloth: string[], seed: number) {
  const w = img.w;
  const b = img.h - 2;
  shadow(img, w / 2, b, 23, 3);
  // posts
  for (const x of [3, w - 5]) {
    img.vline(x, 12, b - 1, WOOD_LIGHT[3]!);
    img.vline(x + 1, 12, b - 1, WOOD[1]!);
  }
  // counter: top + front planks + a shadow line under the lip
  box(img, 1, b - 15, w - 2, 14, 4, WOOD_LIGHT);
  planks(img, 2, b - 10, w - 4, 9, WOOD, { vertical: true, size: 5, seed: 3 + seed });
  img.hline(2, w - 3, b - 10, WOOD[0]!);
  // goods in baskets on the counter
  const goods: [string, string][] = [
    ['#a83a32', '#e0705a'],
    ['#c8782a', '#f0b050'],
    ['#4a7a3a', '#8ab060'],
    ['#7a4a8a', '#b088c0'],
    ['#c8a048', '#f0d890'],
  ];
  for (let k = 0; k < 3; k++) {
    const cx = 9 + k * 15;
    const cy = b - 15;
    const [dk, lt] = goods[(k + seed * 2) % goods.length]!;
    // fruit heap
    for (let i = 0; i < 7; i++) {
      const fx = cx - 4 + (i % 4) * 2.6 + (i >= 4 ? 1.3 : 0);
      const fy = cy - 2 - (i >= 4 ? 2 : 0);
      img.ellipse(fx, fy, 1.6, 1.4, (x, y, nx, ny) => (nx + ny < -0.4 ? lt : dk));
    }
    // wicker basket
    for (let x = cx - 6; x <= cx + 6; x++)
      for (let y = cy - 1; y <= cy + 2; y++) img.set(x, y, dpick(['#4a3418', '#6e5024', '#94743a'], 0.5 + ((x + y) % 2 ? 0.25 : -0.15) - (x - cx) * 0.03, x, y));
    img.hline(cx - 6, cx + 6, cy - 1, '#a88a4a');
  }
  // striped awning (sloping towards the viewer) with a scalloped valance
  const top = 4;
  const bot = 16;
  for (let y = top; y < bot; y++) {
    const f = (y - top) / (bot - top);
    const inset = Math.round((1 - f) * 3);
    for (let x = inset; x < w - inset; x++) {
      const stripe = Math.floor((x - w / 2 + 300) / 6) % 2 === 0;
      const pal = stripe ? cloth : CLOTH.cream!;
      let v = 0.8 - f * 0.45 - (x / w) * 0.15;
      if (y === top) v += 0.2;
      img.set(x, y, dpick(pal, v, x, y));
    }
  }
  for (let x = 0; x < w; x++) {
    const stripe = Math.floor((x - w / 2 + 300) / 6) % 2 === 0;
    const pal = stripe ? cloth : CLOTH.cream!;
    const u = (x + 300 - w / 2) % 6;
    img.set(x, bot, pal[1]!);
    if (u >= 1 && u <= 4) img.set(x, bot + 1, pal[1]!);
    if (u >= 2 && u <= 3) img.set(x, bot + 2, pal[0]!);
  }
  // awning shade on the posts and a string of garlic / a lantern hanging from it
  img.blendRect(3, bot + 1, 2, 4, '#0a0610', 0.35);
  img.blendRect(w - 5, bot + 1, 2, 4, '#0a0610', 0.35);
  if (seed % 2 === 0) {
    img.vline(w - 12, bot + 1, bot + 5, '#3a2a1a');
    for (let i = 0; i < 3; i++) img.ellipse(w - 12, bot + 7 + i * 3, 1.6, 1.5, (x, y, nx) => (nx < 0 ? '#e8dcc4' : '#b8a888'));
  } else {
    img.vline(10, bot + 1, bot + 3, IRON[2]!);
    img.rect(9, bot + 4, 3, 4, '#ffc04a');
    img.hline(9, 11, bot + 4, IRON[1]!);
    img.set(10, bot + 6, '#fff0b0');
  }
  img.outline({ darken: 0.7 });
}

function bench(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 15, 2);
  // back rest: two slats between iron ends
  for (const [y0, h] of [
    [3, 3],
    [7, 3],
  ] as const)
    for (let y = y0; y < y0 + h; y++)
      for (let x = 4; x <= 27; x++) img.set(x, y, dpick(WOOD_LIGHT, (y === y0 ? 0.85 : y === y0 + h - 1 ? 0.25 : 0.55) + (hash(x >> 3, y0, 9) - 0.5) * 0.2, x, y));
  // seat
  for (let y = 12; y <= 16; y++)
    for (let x = 1; x <= 30; x++) {
      const v = y < 15 ? 0.75 - (y - 12) * 0.12 + ((x + 1) % 10 === 0 ? -0.3 : 0) : 0.3 - (y - 15) * 0.15;
      img.set(x, y, dpick(WOOD_LIGHT, v + (hash(x >> 2, y, 10) - 0.5) * 0.12, x, y));
    }
  // iron ends with a curl
  for (const x of [2, 28]) {
    img.vline(x, 2, b - 1, IRON[2]!);
    img.vline(x + 1, 2, b - 1, IRON[1]!);
    img.set(x, 1, IRON[3]!);
    img.set(x + 1, 1, IRON[2]!);
    img.hline(x - 1, x + 2, b, IRON[1]!);
  }
  img.set(1, 11, IRON[2]!);
  img.set(0, 12, IRON[2]!);
  img.set(31, 12, IRON[1]!);
  img.set(30, 11, IRON[2]!);
  img.outline({ darken: 0.7 });
}

function barrel(img: Img) {
  const b = img.h - 2;
  shadow(img, 8, b, 7, 2);
  const top = b - 16;
  for (let y = top; y < b; y++) {
    const f = (y - top) / 16;
    const bulge = Math.sin(f * Math.PI) * 1.5;
    const x0 = 2 - bulge;
    const x1 = 14 + bulge;
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const t = (x + 0.5 - x0) / (x1 - x0);
      let v = 0.85 - t * 0.7 + Math.sin(f * Math.PI) * 0.08;
      const stave = (x - 2) % 3 === 0;
      if (stave) v -= 0.15;
      img.set(x, y, dpick(WOOD_LIGHT, v + (hash(x, y, 4) - 0.5) * 0.1, x, y));
    }
  }
  for (const y of [top + 2, b - 4]) {
    const bulge = Math.sin(((y - top) / 16) * Math.PI) * 1.5;
    for (let x = Math.floor(2 - bulge); x < Math.ceil(14 + bulge); x++) {
      img.set(x, y, x < 6 ? IRON[3]! : IRON[2]!);
      img.set(x, y + 1, IRON[1]!);
    }
  }
  img.ellipse(8, top, 6.2, 2.4, (x, y, nx, ny) => {
    const d = nx * nx + ny * ny;
    if (d > 0.62) return dpick(WOOD_LIGHT, 0.85 - nx * 0.3, x, y);
    return dpick(WOOD, 0.55 - nx * 0.2 + ((x + 1) % 4 === 0 ? -0.25 : 0), x, y);
  });
  img.outline({ darken: 0.7 });
}

function crateAt(img: Img, x: number, y: number, s: number, top: number, seed: number) {
  // top face
  for (let j = 0; j < top; j++)
    for (let i = 0; i < s; i++) img.set(x + i, y + j, dpick(WOOD_LIGHT, 0.82 - j * 0.04 + ((i + seed) % 5 === 0 ? -0.25 : 0), x + i, y + j));
  // front: planks + frame + brace
  for (let j = top; j < s; j++)
    for (let i = 0; i < s; i++) {
      const frame = i < 2 || i > s - 3 || j < top + 2 || j > s - 3;
      let v = frame ? 0.62 : 0.4 + (Math.floor((j - top) / 3) % 2 ? -0.05 : 0.05);
      if (!frame && (j - top) % 3 === 2) v -= 0.2;
      if (i === 0) v += 0.15;
      img.set(x + i, y + j, dpick(WOOD_LIGHT, v + (hash(x + i, y + j, seed) - 0.5) * 0.12, x + i, y + j));
    }
  img.line(x + 2, y + s - 3, x + s - 3, y + top + 2, WOOD_LIGHT[3]!);
  img.line(x + 2, y + s - 2, x + s - 3, y + top + 3, WOOD[1]!);
  for (const [i, j] of [
    [1, top + 1],
    [s - 2, top + 1],
    [1, s - 2],
    [s - 2, s - 2],
  ] as const)
    img.set(x + i, y + j, IRON[3]!);
  img.hline(x, x + s - 1, y + top, WOOD[1]!);
}

function crates(img: Img) {
  const b = img.h - 2;
  shadow(img, 16, b, 15, 2);
  crateAt(img, 1, b - 14, 14, 4, 1);
  crateAt(img, 15, b - 13, 13, 4, 2);
  crateAt(img, 7, b - 27, 13, 4, 3);
  // a sack slumped on the right crate
  sphere(img, 25, b - 15, 4.5, 3.5, ['#4a3a24', '#6a5636', '#8a744c', '#a89064'], { tex: 0.2 });
  img.rect(24, b - 19, 2, 1, '#3a2a1a');
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
const QUILT_ACCENT = '#d8ccb0';

function bed(img: Img, wide: boolean, seed: number) {
  const w = img.w;
  const h = img.h;
  const q = BLANKETS[seed % BLANKETS.length]!;
  // headboard with turned posts
  for (let y = 2; y < 9; y++)
    for (let x = 1; x < w - 1; x++) img.set(x, y, dpick(WOOD, 0.55 - (x / w) * 0.25 + (y === 2 ? 0.3 : 0) + ((x - 1) % 4 === 0 && y > 3 ? -0.2 : 0), x, y));
  for (const x of [0, w - 2]) {
    img.vline(x, 1, h - 1, WOOD_LIGHT[2]!);
    img.vline(x + 1, 1, h - 1, WOOD[1]!);
    img.set(x, 0, WOOD_LIGHT[4]!);
    img.set(x + 1, 0, WOOD_LIGHT[2]!);
  }
  // mattress edge visible on the right side
  img.rect(2, 9, w - 4, h - 12, '#c8bca4');
  // pillow(s)
  const pw = wide ? Math.floor((w - 6) / 2) : w - 6;
  for (let k = 0; k < (wide ? 2 : 1); k++) {
    const px = 3 + k * (pw + 0);
    img.ellipse(px + pw / 2, 11.5, pw / 2, 2.6, (x, y, nx, ny) => dpick(['#9a9284', '#bcb4a4', '#d8d0c0', '#eee8da'], 0.75 - ny * 0.35 - nx * 0.15, x, y));
  }
  // folded sheet, then the patchwork quilt draping over the side
  const qy = 15;
  for (let x = 2; x < w - 2; x++) {
    img.set(x, qy, '#e6e0d2');
    img.set(x, qy + 1, '#b8b0a0');
  }
  for (let y = qy + 2; y < h - 3; y++)
    for (let x = 2; x < w - 2; x++) {
      const cx = Math.floor((x - 2) / 4);
      const cy = Math.floor((y - qy - 2) / 4);
      const patch = (cx * 2 + cy + seed) % 3;
      let k = patch === 0 ? 3 : patch === 1 ? 1 : 2;
      if (x >= w - 5) k = Math.max(0, k - 1);
      if (y === qy + 2) k = Math.min(4, k + 1);
      let c = mix(q[k]!, q[k]!, 0);
      if (patch === 2 && (x + y) % 2 === 0 && (y - qy - 2) % 4 === 2) c = mix(QUILT_ACCENT, q[2]!, 0.5);
      if ((x - 2) % 4 === 0 || (y - qy - 2) % 4 === 0) c = mix(c, q[0]!, 0.3); // stitching
      img.set(x, y, c);
    }
  // quilt overhang shading on the right edge and the bottom
  img.vline(w - 3, qy + 2, h - 4, q[0]!);
  img.hline(2, w - 3, h - 4, q[1]!);
  // footboard
  for (let x = 1; x < w - 1; x++) {
    img.set(x, h - 3, WOOD_LIGHT[3]!);
    img.set(x, h - 2, WOOD[2]!);
    img.set(x, h - 1, WOOD[0]!);
  }
  img.outline({ darken: 0.7 });
}

function nightstand(img: Img) {
  // cabinet
  box(img, 2, 11, 12, 11, 3, WOOD_LIGHT);
  img.rect(4, 15, 8, 4, WOOD_LIGHT[2]!);
  img.hline(4, 11, 15, WOOD_LIGHT[3]!);
  img.hline(4, 11, 18, WOOD[1]!);
  img.set(8, 17, BRASS[4]!);
  img.set(7, 17, BRASS[2]!);
  img.rect(3, 22, 2, 2, WOOD[1]!);
  img.rect(11, 22, 2, 2, WOOD[1]!);
  // candle in a brass dish, and a little book
  img.ellipse(6.5, 11, 3, 1.2, (x, y, nx) => (nx < 0 ? BRASS[4]! : BRASS[2]!));
  img.rect(6, 6, 2, 5, '#e8e0cc');
  img.set(7, 6, '#b8b0a0');
  img.set(6, 5, '#ffcf5a');
  img.set(6, 4, '#ffe9a0');
  img.set(7, 5, '#ffb43a');
  img.set(6, 3, '#ffb43a');
  img.rect(10, 9, 3, 2, '#5a2a3a');
  img.hline(10, 12, 9, '#d8ccb0');
  img.outline({ darken: 0.7 });
}

function table(img: Img, round: boolean) {
  const w = img.w;
  if (round) {
    // pedestal + round top
    img.rect(w / 2 - 2, 12, 4, 9, WOOD[2]!);
    img.vline(w / 2 - 2, 12, 20, WOOD_LIGHT[3]!);
    img.ellipse(w / 2, 21.5, 8, 2, (x, y, nx) => dpick(WOOD, 0.6 - nx * 0.3, x, y));
    img.ellipse(w / 2, 9.5, 15, 3, WOOD[1]!);
    img.ellipse(w / 2, 8, 15, 6, (x, y, nx, ny) => {
      const ring = Math.hypot(nx, ny);
      return dpick(WOOD_LIGHT, 0.72 - nx * 0.18 - ny * 0.22 + (ring > 0.88 ? 0.12 : 0) + (Math.floor(x / 4) % 2 ? -0.04 : 0.04), x, y);
    });
  } else {
    for (const x of [2, w - 5]) {
      img.rect(x, 11, 3, 12, WOOD[1]!);
      img.vline(x, 11, 22, WOOD_LIGHT[2]!);
    }
    img.hline(5, w - 6, 18, WOOD[1]!);
    // top (planks running along) + apron
    for (let y = 2; y < 10; y++)
      for (let x = 0; x < w; x++) {
        let v = 0.75 - (y - 2) * 0.03 - (x / w) * 0.15 + (y === 2 ? 0.15 : 0);
        if ((y - 2) % 3 === 2) v -= 0.18;
        img.set(x, y, dpick(WOOD_LIGHT, v + (hash(x >> 3, y, 11) - 0.5) * 0.1, x, y));
      }
    for (let x = 0; x < w; x++) {
      img.set(x, 10, WOOD[3]!);
      img.set(x, 11, WOOD[1]!);
    }
  }
  // a candle, a loaf and a mug
  const cx = w / 2;
  img.rect(cx - 1, 1, 2, 5, '#e8e0cc');
  img.set(cx, 1, '#b8b0a0');
  img.set(cx - 1, 0, '#ffcf5a');
  img.ellipse(cx, 6, 2.5, 1, BRASS[3]!);
  img.ellipse(cx - 8, 6, 3.5, 2, (x, y, nx, ny) => (nx + ny < -0.3 ? '#d8a058' : '#a0702a'));
  img.set(cx - 9, 5, '#e8c080');
  img.rect(cx + 6, 3, 3, 4, '#7a6a5a');
  img.vline(cx + 6, 3, 6, '#9a8a7a');
  img.set(cx + 9, 4, '#7a6a5a');
  img.hline(cx + 6, cx + 8, 3, '#d8d0c0');
  img.outline({ darken: 0.7 });
}

function chair(img: Img) {
  // back: two posts, a top rail and spindles
  for (const x of [3, 11]) {
    img.vline(x, 1, 22, WOOD_LIGHT[3]!);
    img.vline(x + 1, 1, 22, WOOD[1]!);
  }
  for (let y = 1; y <= 3; y++) img.hline(3, 12, y, y === 1 ? WOOD_LIGHT[4]! : y === 2 ? WOOD_LIGHT[2]! : WOOD[1]!);
  for (const x of [6, 8]) {
    img.vline(x, 4, 11, WOOD_LIGHT[2]!);
    img.vline(x + 1, 4, 11, WOOD[1]!);
  }
  img.hline(3, 12, 7, WOOD[2]!);
  // seat
  for (let y = 12; y <= 15; y++)
    for (let x = 2; x <= 13; x++) img.set(x, y, dpick(WOOD_LIGHT, y < 14 ? 0.78 - (x - 2) * 0.03 : 0.3, x, y));
  img.hline(2, 13, 12, WOOD_LIGHT[4]!);
  // legs + stretcher
  for (const x of [2, 12]) {
    img.vline(x, 16, 23, WOOD[2]!);
    img.vline(x + 1, 16, 23, WOOD[1]!);
  }
  img.hline(4, 11, 20, WOOD[1]!);
  img.outline({ darken: 0.7 });
}

function stool(img: Img) {
  img.ellipse(8, 6, 6, 3, (x, y, nx, ny) => dpick(WOOD_LIGHT, 0.7 - nx * 0.2 - ny * 0.3, x, y));
  for (const x of [4, 11]) img.rect(x, 8, 2, 7, WOOD[1]!);
  img.outline({ darken: 0.7 });
}

function wardrobe(img: Img) {
  const w = img.w;
  // cornice
  for (let y = 0; y < 4; y++) for (let x = 0; x < w; x++) img.set(x, y, dpick(WOOD, y === 0 ? 0.85 : y === 3 ? 0.15 : 0.55 - (x / w) * 0.2, x, y));
  // carcass
  for (let y = 4; y < 36; y++) for (let x = 1; x < w - 1; x++) img.set(x, y, dpick(WOOD, 0.5 - (x / w) * 0.3 + (hash(x >> 2, y >> 3, 12) - 0.5) * 0.1, x, y));
  img.vline(1, 4, 35, WOOD[3]!);
  // two doors with raised panels
  for (const dx of [3, 17]) {
    for (const [py, ph] of [
      [7, 12],
      [21, 12],
    ] as const) {
      for (let y = py; y < py + ph; y++)
        for (let x = dx; x < dx + 12; x++) {
          let v = 0.55;
          if (x === dx || y === py) v = 0.2;
          else if (x === dx + 11 || y === py + ph - 1) v = 0.85;
          else if (x === dx + 1 || y === py + 1) v = 0.75;
          img.set(x, y, dpick(WOOD, v - (x / w) * 0.15, x, y));
        }
    }
  }
  img.vline(15, 5, 35, WOOD[0]!);
  img.vline(16, 5, 35, WOOD[2]!);
  for (const x of [13, 18]) {
    img.set(x, 19, BRASS[4]!);
    img.set(x, 20, BRASS[2]!);
  }
  // plinth + bun feet
  for (let x = 0; x < w; x++) {
    img.set(x, 36, WOOD[3]!);
    img.set(x, 37, WOOD[1]!);
  }
  for (const x of [2, w - 5]) img.rect(x, 38, 3, 2, WOOD[1]!);
  img.outline({ darken: 0.7 });
}

function bookshelf(img: Img) {
  const w = img.w;
  for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) img.set(x, y, dpick(WOOD, y === 0 ? 0.85 : y === 2 ? 0.15 : 0.55, x, y));
  for (let y = 3; y < 38; y++) {
    for (const x of [1, 2]) img.set(x, y, x === 1 ? WOOD[3]! : WOOD[2]!);
    for (const x of [w - 3, w - 2]) img.set(x, y, x === w - 2 ? WOOD[0]! : WOOD[1]!);
    for (let x = 3; x < w - 3; x++) img.set(x, y, '#1a110c');
  }
  const bookCols = ['#7a2a2a', '#2a4a6a', '#3a5a2a', '#7a5e2a', '#4a2a5a', '#8a6a4a', '#2a2a3a', '#5a3a2a'];
  const shelves = [12, 23, 34];
  shelves.forEach((sy, si) => {
    for (let x = 3; x < w - 3; x++) {
      img.set(x, sy, WOOD_LIGHT[3]!);
      img.set(x, sy + 1, WOOD[1]!);
    }
    let x = 3;
    let k = si * 3;
    const ornAt = si === 1 ? 19 : si === 2 ? 6 : -99;
    while (x < w - 4) {
      if (x >= ornAt && x < ornAt + 6) {
        if (si === 1) {
          // a candle stub
          img.rect(x + 2, sy - 5, 2, 5, '#e8e0cc');
          img.set(x + 2, sy - 6, '#ffcf5a');
          img.hline(x + 1, x + 4, sy - 1, BRASS[3]!);
        } else {
          // a little globe
          sphere(img, x + 3, sy - 4, 2.5, 2.5, ['#1e3a5a', '#2a5a7a', '#4a7a5a', '#8ab0a0']);
          img.hline(x + 2, x + 4, sy - 1, BRASS[3]!);
        }
        x += 6;
        continue;
      }
      const bw = 2 + Math.floor(hash(x, sy, 3) * 2);
      const bh = 6 + Math.floor(hash(x, sy, 4) * 4);
      const c = bookCols[k++ % bookCols.length]!;
      const lean = hash(x, sy, 6) < 0.12 && x < w - 8;
      for (let j = 0; j < bh; j++) {
        const lx = lean ? Math.floor(j / 3) : 0;
        for (let i = 0; i < bw; i++) img.set(x + i + lx - (lean ? 2 : 0) + (lean ? 2 : 0), sy - 1 - j, i === 0 ? mix(c, '#fff1cc', 0.25) : i === bw - 1 ? mix(c, '#000000', 0.3) : c);
      }
      img.set(x + 1, sy - bh + 1, BRASS[3]!);
      if (bh > 7) img.hline(x, x + bw - 1, sy - 3, mix(c, '#d8c890', 0.5));
      x += bw + (hash(x, sy, 5) < 0.18 ? 1 : 0);
    }
  });
  for (let x = 0; x < w; x++) {
    img.set(x, 38, WOOD[2]!);
    img.set(x, 39, WOOD[0]!);
  }
  img.outline({ darken: 0.7 });
}

function chest(img: Img) {
  // domed lid
  for (let y = 3; y <= 7; y++)
    for (let x = 1; x <= 14; x++) {
      const dome = y === 3 && (x < 3 || x > 12);
      if (dome) continue;
      img.set(x, y, dpick(WOOD_LIGHT, 0.85 - (y - 3) * 0.1 - (x - 1) * 0.02, x, y));
    }
  img.hline(1, 14, 8, WOOD[0]!);
  for (let y = 9; y <= 14; y++) for (let x = 1; x <= 14; x++) img.set(x, y, dpick(WOOD_LIGHT, 0.45 - (x - 1) * 0.02 + ((y - 9) % 3 === 2 ? -0.15 : 0), x, y));
  for (const x of [3, 12]) {
    img.vline(x, 3, 14, IRON[2]!);
    img.set(x, 4, IRON[3]!);
  }
  img.rect(7, 7, 2, 3, BRASS[3]!);
  img.set(7, 7, BRASS[4]!);
  img.set(8, 9, '#1a1008');
  img.outline({ darken: 0.7 });
}

function fireplace(img: Img) {
  const w = img.w;
  const h = img.h;
  // stone surround
  stonework(img, 0, 7, w, h - 7, STONE, '#16131c', { rh: 5, sw: 8, seed: 21, shade: (i) => (i < 3 ? 0.12 : i > w - 4 ? -0.15 : 0) });
  // the firebox: arched opening, sooty back, faint firebrick
  const ox0 = 6;
  const ox1 = w - 7;
  const oy0 = 13;
  for (let y = oy0 - 3; y < h - 2; y++)
    for (let x = ox0; x <= ox1; x++) {
      const cx = (ox0 + ox1) / 2;
      const arch = y < oy0 ? Math.hypot((x + 0.5 - cx) / ((ox1 - ox0 + 1) / 2), (y + 0.5 - oy0) / 4) > 1 : false;
      if (arch) continue;
      const glow = Math.max(0, 1 - Math.hypot(x - cx, (y - (h - 6)) * 1.3) / 12);
      let c = mix('#0b0607', '#4a1e14', glow * 0.8);
      if (y > oy0 + 2 && (y + (Math.floor(y / 3) % 2) * 2 + x) % 6 === 0 && glow > 0.2) c = mix(c, '#000000', 0.3);
      img.set(x, y, c);
    }
  // keystone + voussoirs
  img.rect(w / 2 - 2, oy0 - 6, 4, 3, STONE[4]!);
  img.hline(w / 2 - 2, w / 2 + 1, oy0 - 6, STONE[5]!);
  // andirons + logs + embers
  for (const x of [ox0 + 2, ox1 - 2]) {
    img.vline(x, h - 7, h - 3, IRON[3]!);
    img.set(x, h - 8, BRASS[4]!);
  }
  for (let x = ox0 + 2; x <= ox1 - 2; x++) {
    img.set(x, h - 4, BARK[3]!);
    img.set(x, h - 3, BARK[1]!);
  }
  img.line(ox0 + 3, h - 7, ox1 - 4, h - 4, BARK[4]!);
  img.line(ox0 + 3, h - 6, ox1 - 4, h - 3, BARK[2]!);
  for (let x = ox0 + 1; x <= ox1 - 1; x++) if (hash(x, 1, 25) < 0.6) img.set(x, h - 3, hash(x, 2, 26) < 0.5 ? '#ff8a3a' : '#c04a20');
  // flames: a few tongues, white-hot at the root
  const cx = (ox0 + ox1) / 2;
  for (let x = ox0 + 2; x <= ox1 - 2; x++) {
    const u = (x - cx) / ((ox1 - ox0) / 2);
    const fh = Math.max(0, (1 - u * u) * 10 + Math.sin(x * 1.9) * 2.4 + Math.sin(x * 0.7 + 1) * 1.5);
    for (let k = 0; k < fh; k++) {
      const y = h - 5 - k;
      const t = k / Math.max(1, fh);
      const c = t < 0.25 ? '#fff6d0' : t < 0.5 ? '#ffd870' : t < 0.78 ? '#f0902e' : '#b84a24';
      img.set(x, y, c);
    }
  }
  // hearth lip
  for (let x = 1; x < w - 1; x++) {
    img.set(x, h - 2, STONE[4]!);
    img.set(x, h - 1, STONE[1]!);
  }
  // mantel shelf with a few things on it
  for (let y = 4; y < 8; y++) for (let x = 0; x < w; x++) img.set(x, y, dpick(WOOD, y === 4 ? 0.9 : y === 7 ? 0.1 : 0.55 - (x / w) * 0.2, x, y));
  for (const x of [3, w - 5]) {
    img.rect(x, 1, 2, 3, '#e8e0cc');
    img.set(x, 0, '#ffcf5a');
    img.hline(x - 1, x + 2, 3, BRASS[3]!);
  }
  img.rect(12, 1, 3, 3, '#4a6a7a');
  img.hline(12, 14, 1, '#7a9aaa');
  img.ellipse(19, 2, 2, 2, (x, y, nx, ny) => (nx * nx + ny * ny < 0.35 ? '#e8e0cc' : BRASS[3]!));
  img.outline({ darken: 0.6 });
}

function wallshelf(img: Img) {
  const w = img.w;
  for (let x = 0; x < w; x++) {
    img.set(x, 10, WOOD_LIGHT[4]!);
    img.set(x, 11, WOOD_LIGHT[2]!);
    img.set(x, 12, WOOD[0]!);
  }
  for (const x of [4, w - 6]) {
    img.vline(x, 13, 15, WOOD[2]!);
    img.set(x + 1, 13, WOOD[2]!);
  }
  // jars, a jug, two books
  const items: [number, string, number, number][] = [
    [2, '#5a7a8a', 4, 6],
    [8, '#a06040', 4, 5],
    [19, '#5a7a4a', 3, 4],
    [24, '#8a4a6a', 4, 6],
  ];
  for (const [x, c, iw, ih] of items) {
    for (let y = 10 - ih; y < 10; y++)
      for (let i = 0; i < iw; i++) img.set(x + i, y, i === 0 ? mix(c, '#fff1cc', 0.35) : i === iw - 1 ? mix(c, '#000000', 0.35) : c);
    img.hline(x, x + iw - 1, 10 - ih, mix(c, '#000000', 0.45));
    img.set(x + 1, 10 - ih + 1, mix(c, '#ffffff', 0.5));
  }
  for (const [x, c] of [
    [13, '#6a2a2a'],
    [15, '#2a4a5a'],
  ] as const) {
    img.rect(x, 3, 2, 7, c);
    img.vline(x, 3, 9, mix(c, '#fff1cc', 0.3));
    img.set(x + 1, 4, BRASS[3]!);
  }
  img.outline({ darken: 0.6 });
}

function windowInterior(img: Img) {
  // frame
  img.rect(2, 1, 12, 12, WOOD[2]!);
  img.hline(2, 13, 1, WOOD_LIGHT[3]!);
  // glass: dusk sky, a crescent moon, a star
  for (let y = 2; y < 12; y++)
    for (let x = 3; x < 13; x++) img.set(x, y, dpick(['#141a38', '#1e2a52', '#33406a', '#5a5478', '#8a6a7a'], 0.05 + (y - 2) * 0.09 + (x < 6 ? 0.05 : 0), x, y));
  img.set(10, 3, '#f0e8c8');
  img.set(11, 4, '#f0e8c8');
  img.set(11, 3, '#c8c0a8');
  img.set(5, 4, '#c8d0e8');
  // a sill-high hill silhouette and mullions
  for (let x = 3; x < 13; x++) for (let y = 10 - Math.round(Math.sin(x * 0.7) * 0.8 + 0.8); y < 12; y++) img.set(x, y, '#1a2420');
  img.vline(7, 2, 11, WOOD[1]!);
  img.vline(8, 2, 11, WOOD[3]!);
  img.hline(3, 12, 6, WOOD[1]!);
  img.set(4, 3, '#8a9ac8');
  img.set(4, 4, '#6a7aa8');
  // curtains tied back
  for (const [x0, s] of [
    [0, 1],
    [13, -1],
  ] as const) {
    for (let y = 0; y < 13; y++) {
      const wdt = y < 7 ? 3 : 2 + (y > 9 ? 0 : 1);
      for (let i = 0; i < wdt; i++) {
        const x = s > 0 ? x0 + i : x0 + 2 - i;
        img.set(x, y, dpick(CLOTH.red!, 0.65 - i * 0.18 + ((x + y) % 3 === 0 ? -0.1 : 0), x, y));
      }
    }
    img.set(s > 0 ? 2 : 13, 8, BRASS[3]!);
  }
  img.hline(0, 15, 0, WOOD[1]!);
  // sill
  img.hline(1, 14, 12, WOOD_LIGHT[4]!);
  img.hline(1, 14, 13, WOOD_LIGHT[2]!);
  img.hline(2, 13, 14, WOOD[0]!);
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
  // terracotta pot with a rim
  img.poly(
    [
      [4, b - 7],
      [12, b - 7],
      [11, b],
      [5, b],
    ],
    (x, y) => dpick(['#4a2214', '#7a3a22', '#a0522e', '#c06a40'], 0.8 - (x - 4) / 9 + (y === b ? -0.3 : 0), x, y),
  );
  for (let x = 3; x < 13; x++) {
    img.set(x, b - 8, x < 6 ? '#d0845a' : '#b06a40');
    img.set(x, b - 7, '#6a3020');
  }
  img.hline(4, 11, b - 9, '#2a1a12');
  // fronds arching out
  const LEAF = ['#16301f', '#1f4026', '#2c522e', '#3e6838', '#55804a', '#6e9a5a'];
  const fronds: [number, number][] = [
    [-2.2, 9],
    [-1.4, 11],
    [-0.5, 12],
    [0.4, 12],
    [1.3, 11],
    [2.1, 9],
    [-0.1, 8],
  ];
  fronds.forEach(([a, len], k) => {
    for (let s = 0; s <= len; s++) {
      const t = s / len;
      const x = 8 + Math.sin(a * 0.75) * s * 0.9;
      const y = b - 9 - Math.cos(a * 0.6) * s + t * t * Math.abs(a) * 3.2;
      const v = 0.55 + (a < 0 ? 0.15 : -0.1) + (1 - t) * 0.1;
      img.set(x, y, dpick(LEAF, v, Math.round(x), Math.round(y)));
      if (s > 1 && s < len - 1 && s % 2 === k % 2) {
        img.set(x - 1, y, dpick(LEAF, v - 0.1, Math.round(x), Math.round(y)));
        img.set(x + 1, y, dpick(LEAF, v + 0.15, Math.round(x), Math.round(y)));
      }
    }
  });
  img.outline({ darken: 0.7 });
}

function loom(img: Img) {
  const w = img.w;
  // uprights
  for (const x of [2, w - 4]) {
    img.vline(x, 2, 31, WOOD_LIGHT[3]!);
    img.vline(x + 1, 2, 31, WOOD[1]!);
  }
  // top and breast beams
  for (const y of [3, 22]) {
    img.hline(1, w - 2, y, WOOD_LIGHT[3]!);
    img.hline(1, w - 2, y + 1, WOOD[2]!);
    img.hline(1, w - 2, y + 2, WOOD[0]!);
  }
  // warp threads
  for (let x = 5; x < w - 5; x++) if (x % 2 === 1) img.vline(x, 6, 12, '#c8bca0');
  // the cloth woven so far, with a band pattern
  for (let y = 13; y < 22; y++)
    for (let x = 5; x < w - 5; x++) {
      const band = y % 6;
      const pal = band < 2 ? CLOTH.gold! : CLOTH.red!;
      let v = 0.5 + ((x + y) % 2 === 0 ? 0.12 : -0.08);
      if (band === 3 && (x % 4 === 0)) v += 0.3;
      img.set(x, y, dpick(pal, v, x, y));
    }
  img.hline(5, w - 6, 12, '#3a2a1a');
  // shuttle + bench
  img.rect(12, 11, 8, 2, WOOD_LIGHT[4]!);
  img.set(15, 11, '#c8bca0');
  img.rect(5, 27, w - 10, 2, WOOD_LIGHT[3]!);
  img.hline(5, w - 6, 29, WOOD[1]!);
  img.outline({ darken: 0.7 });
}

function rug(img: Img, pal: string[], long = false) {
  const w = img.w;
  const h = img.h;
  const fr = long ? 0 : 2; // fringe width
  const x0 = fr;
  const x1 = w - 1 - fr;
  const y0 = 1;
  const y1 = h - 2;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const bx = Math.min(x - x0, x1 - x);
      const by = Math.min(y - y0, y1 - y);
      const e = Math.min(bx, by);
      let v: number;
      if (e === 0) v = 0.05;
      else if (e <= 3) {
        // border band with a little running motif
        const along = bx < by ? y : x;
        v = e === 1 || e === 3 ? 0.62 : (along + (bx < by ? 0 : 1)) % 4 === 0 ? 0.92 : 0.28;
      } else if (e === 4) v = 0.1;
      else {
        // field: quiet with a soft abrash, a low-contrast medallion and corner spandrels
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const md = Math.abs(x + 0.5 - cx - 0.5) / ((x1 - x0) * 0.22) + Math.abs(y + 0.5 - cy - 0.5) / ((y1 - y0) * 0.3);
        v = 0.45 + (vnoise(0, y, 3, 77) - 0.5) * 0.12;
        if (md < 1) v = md > 0.8 ? 0.2 : md < 0.3 ? 0.78 : 0.6;
        const sp = Math.min(bx, 99) + Math.min(by, 99);
        if (bx < 12 && by < 10 && sp < 13) v = sp > 11 ? 0.2 : 0.6;
      }
      img.set(x, y, dpick(pal, v, x, y));
    }
  if (!long)
    for (let y = y0 + 1; y < y1; y += 2) {
      img.set(0, y, '#c8bca0');
      img.set(1, y, '#a89c80');
      img.set(w - 2, y, '#a89c80');
      img.set(w - 1, y, '#c8bca0');
    }
  // its thickness: a dark lip along the bottom
  img.blendRect(x0, h - 1, x1 - x0 + 1, 1, '#000000', 0.45);
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
  const x0 = 2;
  const x1 = 13;
  const y0 = 5;
  const y1 = 13;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const corner = (x === x0 || x === x1) && (y === y0 || y === y1);
      if (corner) continue;
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      const stripe = (y === y0 + 2 || y === y1 - 2) && x > x0 + 1 && x < x1 - 1;
      let c: string;
      if (y === y1) c = '#2a1c10';
      else if (edge) c = '#4a3418';
      else if (stripe) c = '#7a3a2a';
      else c = (x + (y >> 1)) % 2 === 0 ? '#8a6a3c' : '#6e5230';
      img.set(x, y, c);
    }
  // bristle tufts at the ends
  for (const y of [y0 + 1, y0 + 3, y0 + 5, y0 + 7]) {
    img.set(x0 - 1, y, '#5a4024');
    img.set(x1 + 1, y, '#5a4024');
  }
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
  stall_red: (i) => stall(i, CLOTH.red!, 0),
  stall_green: (i) => stall(i, CLOTH.green!, 1),
  stall_blue: (i) => stall(i, CLOTH.blue!, 2),
  stall_gold: (i) => stall(i, CLOTH.gold!, 3),
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

