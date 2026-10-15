// Procedural blockouts for the CMU easter-egg sprites (cmu-eggs).
//
// Each frame is drawn at its final size in the town's palette and conventions (3/4 top-down view,
// 16 px tiles, moonlight from the upper left, dark 1 px outline, bottom edge = ground contact).
// They serve two purposes, exactly like the procedural sprites of the main pipeline:
//   1. the silhouette/colour reference sent to gpt-6-astra (eggs/scripts/refs.ts), and
//   2. the fallback art when an AI frame fails validation (eggs/scripts/build.ts).
// Deterministic: no randomness except the fixed integer hash.
import { hash, Img, mix, type Color } from '../../scripts/lib/img.js';
import { box, flame, planks, shadow, sphere, stonework } from '../../scripts/lib/draw.js';
import { drawMascots } from './mascots.js';

// palettes shared with scripts/props.ts (same hues as the town)
const STONE = ['#24212c', '#312d3a', '#3f3a48', '#4e4858', '#5f5869', '#726a7a'];
const CONCRETE = ['#2a2a30', '#38383f', '#47474f', '#57575f', '#686870', '#7b7b82'];
const IRON = ['#0f0d14', '#1b1822', '#2a2632', '#3c3746'];
const WOOD = ['#22160f', '#311f15', '#422b1d', '#543826', '#674630'];
const BRASS = ['#3a2a10', '#5e4518', '#8a6a24', '#b8913a', '#e0c060'];
const SLATE = ['#1a1d2c', '#232838', '#2e3446', '#3a4256', '#4a5468'];
const ROCK = ['#1f1c22', '#2b272e', '#38333a', '#474049', '#575058'];
const GLASS = '#ffc04a';
const GLASS_HI = '#ffe08a';
const DARKWIN = '#141a26';
const TARTAN_RED = ['#4a1418', '#6e1e22', '#8e2a2c', '#a8383a'];
const TARTAN_GREEN = '#1f3a2a';
const TARTAN_BLUE = '#1e2a4a';
const PAINT = [
  // nightly paint schemes for the Fence: [base, accent1, accent2, accent3]
  ['#7a2a3a', '#d0a040', '#e8e0c8', '#3a5a8a'],
  ['#2a5a4a', '#e0c060', '#c84a4a', '#e8e0c8'],
  ['#3a3a7a', '#e8a0c0', '#a0d0e0', '#f0e0a0'],
  ['#6a4a1a', '#e8e0c8', '#4a8a6a', '#b04040'],
];

export type Frames = Map<string, Img>;
const pick = (pal: readonly Color[], v: number) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]!;

// -------------------------------------------------------------------------------------------
// The Fence: a stubby, absurdly thick plank fence, so caked in paint the boards have rounded
// edges. 4 tiles wide, collision on the bottom row only.

function fence(variant: number): Img {
  const img = new Img(64, 32);
  const b = 30; // ground line
  shadow(img, 32, b, 31, 3);
  const P = PAINT[variant % PAINT.length]!;
  // posts (blobby with paint)
  for (const px of [3, 30, 57]) {
    img.ellipse(px + 2, b - 21, 4, 3, P[0]!);
    img.rect(px - 1, b - 21, 7, 20, P[0]!);
  }
  // two rails, each a fat rounded slab of paint
  for (const ry of [b - 18, b - 9]) {
    img.ellipse(32, ry + 3, 31, 5, (x, y, nx, ny) => (ny < -0.4 ? mix(P[0]!, '#fff1cc', 0.25) : ny > 0.5 ? mix(P[0]!, '#160d2a', 0.35) : P[0]!));
  }
  // painted lettering-like strokes (abstract, never legible) and drips
  for (let i = 0; i < 9; i++) {
    const x = 6 + i * 6 + Math.floor(hash(i, variant, 4) * 3);
    const y = b - 19 + Math.floor(hash(i, variant, 5) * 3);
    const c = P[1 + (i % 3)]!;
    img.rect(x, y, 2, 4, c);
    if (hash(i, variant, 6) < 0.5) img.rect(x + 2, y + 1, 2, 2, c);
    img.rect(x, y + 9, 3, 2, P[1 + ((i + 1) % 3)]!);
    if (hash(i, variant, 7) < 0.4) img.vline(x + 1, y + 11, y + 13, c); // drip
  }
  // paint pooled at the feet
  img.ellipse(5, b - 1, 5, 1.5, mix(P[0]!, '#160d2a', 0.2));
  img.ellipse(59, b - 1, 5, 1.5, mix(P[0]!, '#160d2a', 0.2));
  img.outline({ darken: 0.72 });
  return img;
}

/** Overnight guard camp next to the Fence (tent + lantern), shown at night only. */
function camp(): Img {
  const img = new Img(32, 24);
  const b = 22;
  shadow(img, 13, b, 12, 2);
  img.poly(
    [
      [2, b],
      [12, b - 15],
      [23, b],
    ],
    (x, y) => (x < 12 ? pick(TARTAN_RED, 0.75 - (b - y) / 40) : pick(TARTAN_RED, 0.35)),
  );
  // tartan stripes on the tent
  for (let y = b - 14; y <= b; y += 4) img.hline(Math.max(3, 12 - (y - (b - 15))), Math.min(22, 12 + (y - (b - 15))), y, TARTAN_GREEN);
  img.poly(
    [
      [10, b],
      [12, b - 7],
      [14, b],
    ],
    '#0e0a10',
  );
  // lantern on a stick
  img.vline(27, b - 14, b, WOOD[2]!);
  img.rect(26, b - 17, 3, 4, BRASS[2]!);
  flame(img, 27, b - 14);
  img.outline({ darken: 0.72 });
  return img;
}

// -------------------------------------------------------------------------------------------
// The Weanworks: a grey, many-windowed keep (too many low floors) whose skybridge leaves its
// 7th floor and enters the 2nd floor of the workshop next door (which sits on a rock).

/** Height (px above the ground line) of the skybridge floor: the keep's 7th floor = the workshop's 2nd. */
export const BRIDGE_FLOOR = 84;
const BRIDGE_H = 11;
const KEEP_FLOOR_H = 11;
const KEEP_BASE = 18;

function wean(): Img {
  const img = new Img(64, 160);
  const b = 158; // ground line (sprite bottom has 2 px of contact shadow)
  const W = 46; // tower width (3 tiles minus the outline margin)
  const x0 = 1;
  shadow(img, 24, b, 23, 4);
  const floors = 9;
  const roof = b - KEEP_BASE - floors * KEEP_FLOOR_H; // top of the 9th floor
  const top = roof - 12; // mechanical penthouse
  for (let y = roof; y < b; y++)
    for (let x = x0; x < x0 + W; x++) {
      let v = 0.45 + (hash(x >> 2, y >> 3, 11) - 0.5) * 0.1;
      if (x < x0 + 3) v += 0.15; // moonlit left edge
      if (x > x0 + W - 5) v -= 0.18;
      if (y > b - 8) v -= 0.12; // darker lower band
      img.set(x, y, pick(CONCRETE, v));
    }
  // penthouse block + parapet
  img.rect(x0 + 8, top, W - 16, roof - top, CONCRETE[2]!);
  img.hline(x0 + 8, x0 + W - 9, top, CONCRETE[5]!);
  img.rect(x0, roof - 3, W, 4, CONCRETE[4]!);
  img.hline(x0, x0 + W - 1, roof - 3, CONCRETE[5]!);
  // nine low floors of identical slit windows
  for (let f = 0; f < floors; f++) {
    const fy = b - KEEP_BASE - (f + 1) * KEEP_FLOOR_H; // top of floor f+1
    img.hline(x0 + 1, x0 + W - 2, fy + KEEP_FLOOR_H - 1, CONCRETE[1]!); // slab line
    for (let k = 0; k < 5; k++) {
      const wx = x0 + 4 + k * 8;
      const lit = hash(f, k, 21) < 0.35;
      img.rect(wx, fy + 2, 5, KEEP_FLOOR_H - 5, lit ? GLASS : DARKWIN);
      if (lit) img.hline(wx, wx + 4, fy + 2, GLASS_HI);
    }
  }
  // entrance: heavy projecting canopy over a double door
  img.rect(x0 + 13, b - 16, 20, 15, '#0e0c12');
  img.rect(x0 + 9, b - 19, 28, 4, CONCRETE[3]!);
  img.hline(x0 + 9, x0 + 36, b - 19, CONCRETE[5]!);
  img.rect(x0 + 16, b - 14, 6, 13, '#3a2a1e');
  img.rect(x0 + 24, b - 14, 6, 13, '#3a2a1e');
  img.set(x0 + 21, b - 8, BRASS[4]!);
  img.set(x0 + 24, b - 8, BRASS[4]!);
  // skybridge leaving the 7th floor, running to the right edge
  const by = b - BRIDGE_FLOOR - BRIDGE_H;
  img.rect(x0 + W, by, 64 - x0 - W, BRIDGE_H + 1, CONCRETE[3]!);
  img.hline(x0 + W, 63, by, CONCRETE[5]!);
  img.hline(x0 + W, 63, by + BRIDGE_H, CONCRETE[0]!);
  for (let x = x0 + W + 2; x < 62; x += 5) img.rect(x, by + 3, 3, 4, GLASS);
  // a little tartan pennant on the penthouse
  img.vline(x0 + 34, top - 12, top, IRON[3]!);
  img.rect(x0 + 35, top - 12, 7, 5, TARTAN_RED[2]!);
  img.hline(x0 + 35, x0 + 41, top - 10, TARTAN_GREEN);
  img.vline(x0 + 38, top - 12, top - 8, TARTAN_BLUE);
  img.outline({ darken: 0.72 });
  return img;
}

function hamerschlag(): Img {
  const img = new Img(64, 160);
  const b = 158;
  shadow(img, 26, b, 25, 4);
  const rockTop = b - 52;
  // rocky outcrop: the workshop stands on higher ground
  img.poly(
    [
      [1, b],
      [3, rockTop + 10],
      [10, rockTop],
      [42, rockTop - 1],
      [48, rockTop + 12],
      [49, b],
    ],
    (x, y) => pick(ROCK, 0.6 - (x / 60) * 0.5 + (hash(x >> 2, y >> 2, 31) - 0.5) * 0.3),
  );
  // two tall floors of buff/grey stone
  const f2 = b - BRIDGE_FLOOR; // floor of storey 2
  const top = f2 - 32; // eaves
  stonework(img, 6, top, 38, rockTop - top, ['#3a3430', '#4a433c', '#5c5448', '#6e6556', '#807664', '#948a76'], '#1e1a18', { rh: 5, sw: 9, seed: 7 });
  img.hline(6, 43, f2, '#2a2420'); // floor line between storeys
  // slate roof
  img.poly(
    [
      [4, top + 2],
      [25, top - 16],
      [46, top + 2],
    ],
    (x, y) => pick(SLATE, 0.8 - (x / 50) * 0.5 + ((y & 1) === 0 ? 0.05 : 0)),
  );
  // round tower with a small dome (it hides the chimney)
  for (let y = top - 30; y < f2; y++)
    for (let x = 8; x < 20; x++) {
      const nx = (x - 14) / 6;
      img.set(x, y, pick(['#3a3430', '#4a433c', '#5c5448', '#6e6556', '#807664'], 0.6 - nx * 0.35));
    }
  for (let x = 8; x < 20; x++) img.set(x, top - 30, '#948a76');
  sphere(img, 14, top - 31, 7, 5, ['#2a3a34', '#36504a', '#466a5e', '#5a8272'], { tex: 0.2 });
  img.vline(14, top - 42, top - 36, IRON[3]!);
  // 2nd-floor bridge door on the left edge, flush with the keep's skybridge
  const by = b - BRIDGE_FLOOR - BRIDGE_H;
  img.rect(0, by, 8, BRIDGE_H + 1, CONCRETE[3]!);
  img.hline(0, 7, by, CONCRETE[5]!);
  img.rect(4, by + 2, 4, BRIDGE_H - 2, '#0e0c12');
  // big brass gear on the facade + a chimney stack
  img.ellipse(33, f2 + 15, 8, 8, (x, y, nx, ny) => {
    const r = Math.hypot(nx, ny);
    const ang = Math.atan2(ny, nx);
    if (r > 0.82 && Math.cos(ang * 8) < 0.3) return null;
    if (r < 0.3) return BRASS[1]!;
    return pick(BRASS, 0.7 - nx * 0.3 - ny * 0.2);
  });
  img.rect(36, top - 20, 6, 14, STONE[2]!);
  // arched windows: one glowing upstairs, one dark (the broken lab)
  for (const [wx, wy, lit] of [
    [24, top + 8, true],
    [36, top + 8, false],
    [24, f2 + 6, true],
  ] as const) {
    img.rect(wx, wy, 5, 10, lit ? GLASS : DARKWIN);
    img.set(wx + 2, wy - 1, lit ? GLASS : DARKWIN);
  }
  // ground door (up a few rock steps)
  img.rect(20, rockTop - 14, 9, 14, '#3a2a1e');
  for (let k = 0; k < 4; k++) img.hline(18 - k, 30 + k, rockTop + 2 + k * 3, ROCK[3]!);
  // water wheel on the right edge (it dips into the river)
  img.ellipse(55, b - 14, 8, 12, (x, y, nx, ny) => {
    const r = Math.hypot(nx, ny);
    if (r < 0.2) return IRON[3]!;
    if (r > 0.78) return pick(WOOD, 0.6 - ny * 0.3);
    return Math.abs(Math.sin(Math.atan2(ny, nx) * 4)) < 0.25 ? WOOD[3]! : null;
  });
  img.outline({ darken: 0.72 });
  return img;
}

// -------------------------------------------------------------------------------------------
// "Walking to the sky": a slender iron pole leaning into the sky with tiny figures striding up.

function sky(): Img {
  const img = new Img(48, 112);
  const b = 110;
  shadow(img, 24, b, 10, 3);
  box(img, 17, b - 6, 14, 6, 2, STONE);
  // the pole: from (24, b-6) to (40, 6)
  const x0 = 24;
  const y0 = b - 6;
  const x1 = 40;
  const y1 = 6;
  const n = y0 - y1;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = y0 - i;
    img.set(x, y, IRON[3]!);
    img.set(x + 1, y, IRON[1]!);
  }
  // seven tiny walkers on the pole, two on the ground looking up
  const walker = (cx: number, cy: number, c: string) => {
    img.rect(cx, cy - 6, 2, 3, c); // body
    img.set(cx, cy - 7, '#c8b8a0'); // head
    img.set(cx + 1, cy - 7, '#c8b8a0');
    img.set(cx - 1, cy - 2, c); // stride
    img.set(cx + 2, cy - 2, c);
  };
  const cols = ['#4a5a7a', '#7a3a3a', '#3a6a4a', '#6a5a2a', '#5a3a6a', '#3a5a6a', '#7a6a5a'];
  for (let k = 0; k < 7; k++) {
    const i = 12 + k * 13;
    walker(Math.round(x0 + ((x1 - x0) * i) / n) - 1, y0 - i, cols[k]!);
  }
  walker(10, b - 1, '#4a4a5a');
  walker(36, b - 1, '#5a4a3a');
  img.outline({ darken: 0.72 });
  return img;
}

// -------------------------------------------------------------------------------------------
// Small props

function hatch(): Img {
  const img = new Img(16, 16);
  planks(img, 2, 3, 12, 11, WOOD, { vertical: true, size: 3, seed: 51 });
  img.hline(2, 13, 6, IRON[2]!);
  img.hline(2, 13, 11, IRON[2]!);
  img.set(8, 8, BRASS[3]!);
  // a thin gap of greenish light along one edge (an old screen glowing below)
  img.hline(3, 12, 13, '#5adf8a');
  img.outline({ darken: 0.72 });
  return img;
}

// -------------------------------------------------------------------------------------------

export function drawEggSprites(): Frames {
  const f: Frames = new Map();
  f.set('egg_fence', fence(0));
  for (let v = 1; v < PAINT.length; v++) f.set(`egg_fence_${v}`, fence(v));
  f.set('egg_camp', camp());
  f.set('egg_wean', wean());
  f.set('egg_hamerschlag', hamerschlag());
  f.set('egg_sky', sky());
  f.set('egg_hatch', hatch());
  for (const [k, im] of drawMascots()) f.set(k, im);
  return f;
}

