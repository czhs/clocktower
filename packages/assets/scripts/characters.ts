// Layered character sprite sheets. Every sheet has the same grid: 5 columns (idle, walk1..4) x 4
// rows (down, up, left, right) of 24x32 frames, feet at y = 30. Layers are composited in order
// body -> outfit -> hair -> accessory. Ghost sheets and the Storyteller are complete sprites.
import { ACCESSORIES, GHOST_STYLES, HAIR_COLORS, HAIR_STYLES, OUTFIT_PALETTES, OUTFITS, SKIN_TONES } from '@ct/protocol';
import { hash, Img, type Ramp } from './lib/img.js';

export const FW = 24;
export const FH = 32;
export const ANCHOR = { x: 12, y: 30 };
export const DIRS = ['down', 'up', 'left', 'right'] as const;
export const FRAMES = ['idle', 'walk1', 'walk2', 'walk3', 'walk4'] as const;
type Dir = 'down' | 'up' | 'right';

interface Pose {
  bob: number;
  step: number; // -1 left leg forward, +1 right leg forward, 0 together
}
const POSES: Pose[] = [
  { bob: 0, step: 0 },
  { bob: 0, step: -1 },
  { bob: -1, step: 0 },
  { bob: 0, step: 1 },
  { bob: -1, step: 0 },
];

const SKIN: Record<string, string> = {
  porcelain: '#f2dccb',
  fair: '#e2b896',
  olive: '#c49a6c',
  tan: '#ad7d54',
  brown: '#7c5136',
  umber: '#4f3122',
};
const HAIR: Record<string, string> = {
  black: '#25202c',
  brown: '#4e3222',
  auburn: '#8a3a22',
  blonde: '#c9a654',
  grey: '#807c88',
  white: '#d8d4dc',
};
const PALETTE: Record<string, string> = {
  crimson: '#8c2a32',
  forest: '#2f5c3c',
  midnight: '#2c3766',
  ochre: '#a07a2a',
  plum: '#62305f',
  slate: '#4c566a',
};

// The original colour constants above remain stable lookup keys. Only their authored
// swatches change; the Ramp aliases keep every existing drawing formula intact.
const SOOT = '#191C29';
const BRASS = '#D5B56A'; // Small fittings catch warm light; cloth keeps its darker body.
const LINEN = '#DED2B7';
const swatch = (hex: string): Ramp['b'] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16), 255,
];
const edgeShadows = new Map<number, Ramp['b']>();
const rgbKey = (c: Ramp['b']) => (c[0] << 16) | (c[1] << 8) | c[2];
function authored(shadow: string, body: string, light: string): Ramp {
  const d = swatch(shadow), b = swatch(body), l = swatch(light);
  for (const c of [d, b, l]) edgeShadows.set(rgbKey(c), d);
  return { o: swatch(SOOT), d2: d, d1: d, b, l1: l, l2: l };
}
const MATERIALS: Record<string, Ramp> = {
  // Two complexions per guide ramp, distinguished by the size of the light plane.
  '#f2dccb': authored('#A06B58', '#D8A17E', '#F0C8A0'),
  '#e2b896': authored('#A06B58', '#D8A17E', '#F0C8A0'),
  '#c49a6c': authored('#75463D', '#B67D59', '#DDA677'),
  '#ad7d54': authored('#75463D', '#B67D59', '#DDA677'),
  '#7c5136': authored('#4B3035', '#805047', '#B57D60'),
  '#4f3122': authored('#4B3035', '#805047', '#B57D60'),
  '#25202c': authored(SOOT, '#252C41', '#333646'),
  '#4e3222': authored('#30282C', '#594034', '#876044'),
  '#8a3a22': authored('#402832', '#A65F4B', '#C98967'),
  '#c9a654': authored('#77603B', '#AE8C4E', '#D1B879'),
  '#807c88': authored('#505061', '#747383', '#A39DAB'),
  '#d8d4dc': authored('#A39DAB', LINEN, '#E4D8BA'),
  '#8c2a32': authored('#492C3B', '#814953', '#B37072'),
  '#2f5c3c': authored('#243F44', '#41676A', '#729395'),
  '#2c3766': authored('#252C41', '#394764', '#596D89'),
  '#a07a2a': authored('#665032', '#A38348', '#D5B56A'),
  '#62305f': authored('#30243F', '#574064', '#806184'),
  '#4c566a': authored('#333646', '#626979', '#889BAE'),
  // Shared dark cloth, leather, felt and the complete-sprite materials.
  '#2c2834': authored('#252C41', '#394764', '#596D89'),
  '#5e3c24': authored('#665032', '#A38348', '#D5B56A'),
  '#6a4428': authored('#665032', '#A38348', '#D5B56A'),
  '#2e2638': authored(SOOT, '#252C41', '#333646'),
  '#c0902a': authored('#665032', '#A38348', '#D5B56A'),
  '#9aaacc': authored('#526E83', '#8EB4C2', '#CCE1DE'),
  '#2a1838': authored('#30243F', '#574064', '#806184'),
};
// Legs sit one authored value step below midnight cloth; boots remain Soot.
const DARK_CLOTH = authored(SOOT, '#252C41', '#333646');
for (const key of ['#3e2c22', '#2a1c16', '#2a2430', '#16121a', '#1e1a26',
  '#120e16', '#000000', '#1a1418', '#2e241e', '#1a120e', '#141018'])
  MATERIALS[key] = DARK_CLOTH;
const BOOTS = authored(SOOT, SOOT, '#252C41');
for (const key of ['#2a1c16', '#16121a', '#120e16', '#1a1418', '#1a120e', '#141018'])
  MATERIALS[key] = BOOTS;
const material = (base: string): Ramp => MATERIALS[base]!;
const complexions = new Set(Object.values(SKIN).map(material));
const lightComplexions = new Set([MATERIALS[SKIN.porcelain!]!, MATERIALS[SKIN.olive!]!, MATERIALS[SKIN.brown!]!]);
const clothPlanes = new Set([
  ...Object.values(PALETTE), '#2c2834', '#5e3c24', '#6a4428', '#c0902a',
].map(material));
const blackMaterials = new Set([material(HAIR.black!), material('#2e2638')]);

/** Three flat value planes, never generated blends or ordered dithering. */
const shade = (r: Ramp, v: number, _x: number, _y: number) => {
  // Broaden connected cloth highlights without washing out their saturated bodies.
  // Black keeps its cool highlight in the upper-left cluster, never Worn iron grey.
  const value = v + (lightComplexions.has(r) ? 0.12 : clothPlanes.has(r) ? 0.10 : 0);
  if (blackMaterials.has(r)) return v < 0.55 ? r.d1 : v < 0.75 ? r.b : r.l1;
  return value < 0.30 ? r.d1 : value < 0.60 ? r.b : r.l1;
};
const flatPick = (colors: readonly string[], v: number, _x: number, _y: number) =>
  colors[Math.max(0, Math.min(colors.length - 1, Math.round(v * (colors.length - 1))))]!;

/**
 * Keep the ORIGINAL external outline footprint (including the outfit's skipped top).
 * Only recolour its pixels: Soot below/right, material shadow on lit upper/left edges.
 * Contact shadows and translucent lenses are never made opaque by this pass.
 */
function outline(img: Img, skipUp = false, dark = SOOT) {
  const source = img.clone();
  img.outline({ color: dark, skip: skipUp ? ['up'] : [] });
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (source.alpha(x, y) !== 0 || img.alpha(x, y) === 0) continue;
    if (source.alpha(x, y - 1) >= 100 || source.alpha(x - 1, y) >= 100) continue;
    const lit = !skipUp && source.alpha(x, y + 1) >= 100 ? source.get(x, y + 1)
      : source.alpha(x + 1, y) >= 100 ? source.get(x + 1, y) : undefined;
    if (!lit) continue;
    const shadow = edgeShadows.get(rgbKey(lit));
    const edge = shadow && rgbKey(shadow) === 0x191c29 ? lit : shadow;
    if (edge) img.set(x, y, [edge[0], edge[1], edge[2], img.alpha(x, y)]);
  }
}

/** Previously unoutlined layers get an inset edge, never a larger silhouette. */
function insetContour(img: Img) {
  const source = img.clone();
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (source.alpha(x, y) !== 255) continue;
    const lower = source.alpha(x, y + 1) === 0 && source.alpha(x, y - 1) === 255;
    const right = source.alpha(x + 1, y) === 0 && source.alpha(x - 1, y) === 255;
    if (lower || right) img.set(x, y, SOOT);
  }
}

// Colour-only marks: neither accents nor strands can occupy a new pixel.
function paintOnLayer(img: Img, x: number, y: number, color: string | Ramp['b']) {
  if (img.alpha(x, y) === 255) img.set(x, y, color);
}
function outfitAccent(img: Img, dir: Dir, p: Pose, outfit: string, m: Ramp) {
  const t = 16 + p.bob;
  const dot = (x: number, y: number, color: string | Ramp['b']) => paintOnLayer(img, x, y, color);
  if (outfit === 'peasant') {
    // One small repaired cloth patch.
    const x = dir === 'right' ? 10 : 9;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) dot(x + i, t + 3 + j, j === 0 ? m.l1 : m.d1);
  } else if (outfit === 'merchant') {
    // Pocket welt; the original collar/buttons and tails are untouched.
    for (let x = 13; x <= 14; x++) dot(x, t + 5, m.l1);
  } else if (outfit === 'noble') {
    // A pair of small fasteners beside the existing trim.
    for (const y of [t + 3, t + 5]) dot(dir === 'right' ? 13 : 14, y, BRASS);
  } else if (outfit === 'cleric') {
    // A short stitched end on the existing stole (back: its shoulder return).
    for (const x of dir === 'right' ? [13] : dir === 'up' ? [11, 12] : [10, 13])
      dot(x, dir === 'up' ? t + 1 : t + 9, BRASS);
  } else if (outfit === 'smith') {
    // Apron straps, clipped to the original torso and bib.
    for (let j = 0; j < 4; j++) {
      if (dir === 'up') dot(9 + j, t + 1 + j, BRASS);
      else for (const x of dir === 'right' ? [13] : [9, 14]) dot(x, t + j, '#D5B56A');
    }
  } else if (outfit === 'scholar') {
    // Strap leading to the original book/pouch; no new bag or silhouette.
    for (let j = 0; j < 7; j++)
      dot(dir === 'right' ? 12 - Math.floor(j / 3) : dir === 'up' ? 14 - Math.floor(j * 5 / 6) : 9 + Math.floor(j * 5 / 6), t + 2 + j, BRASS);
  }
}

function hairHighlights(img: Img, dir: Dir, t: number, style: string, r: Ramp) {
  const strand = (x: number, y: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++)
      paintOnLayer(img, x + i, y + j, r.l1);
  };
  // Two stepped, connected locks; long back hair retains its original full volume.
  if (dir === 'up') {
    strand(8, t + 1, 2, 3);
    strand(8, t + 4, 1, style === 'long' ? 8 : 2);
    strand(12, t + 2, 2, 2);
    strand(12, t + 4, 1, style === 'long' ? 6 : 2);
  } else if (dir === 'down') {
    strand(9, t, 3, 1);
    strand(9, t + 1, 2, 1);
    strand(13, t + 1, 2, 2);
    if (style === 'long') strand(6, t + 5, 1, 6);
  } else {
    strand(9, t, 3, 1);
    strand(9, t + 1, 2, 1);
    strand(7, t + 3, 2, 2);
    strand(7, t + 5, 1, style === 'long' ? 8 : 2);
  }
  if (style === 'bun') strand(dir === 'right' ? 7 : 11, t + (dir === 'up' ? 0 : -3), 2, 1);
}

// ---------------------------------------------------------------------------------------
// Body (skin): shadow, head with face, neck, hands.

function headTone(r: Ramp, i: number, j: number) {
  const v = 0.7 - i * 0.045 - j * 0.035 + (i < 2 && j > 1 && j < 8 ? 0.08 : 0);
  // Keep guide shadows at the silhouette/neck, not as noise inside living faces.
  // Each complexion uses its light swatch on the lit plane and body on the turn.
  if (complexions.has(r)) return v + (lightComplexions.has(r) ? 0.12 : 0) < 0.38 ? r.b : r.l1;
  return shade(r, v, i, j);
}

function headShape(img: Img, cx: number, top: number, r: Ramp, dir: Dir) {
  // 10 x 10 rounded head
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 10; i++) {
      const corner = (j === 0 || j === 9) && (i < 2 || i > 7);
      const corner2 = (j === 1 || j === 8) && (i === 0 || i === 9);
      if (corner || corner2) continue;
      img.set(cx - 5 + i, top + j, headTone(r, i, j));
    }
  if (dir === 'right') {
    img.set(cx + 5, top + 5, r.b); // nose
    img.set(cx + 5, top + 6, complexions.has(r) ? r.b : r.d1);
    img.set(cx - 1, top + 5, complexions.has(r) ? headTone(r, 4, 5) : r.d1); // ear plane
    img.set(cx - 1, top + 6, complexions.has(r) ? headTone(r, 4, 6) : r.d2);
  }
}

function drawBody(img: Img, dir: Dir, p: Pose, skin: string) {
  const r = material(skin);
  // ground shadow (does not bob)
  img.ellipse(12, 29.5, 6, 1.7, [25, 28, 41, 90]);
  const top = 6 + p.bob;
  const face = (x: number, j: number) => headTone(r, x - 7, j);
  headShape(img, 12, top, r, dir);
  // neck
  img.rect(11, top + 10, 2, 2, r.d1);
  if (dir === 'down') {
    // Two single-pixel eyes; old facial marks are repainted into the same plane.
    for (const ex of [9, 14]) {
      img.set(ex, top + 5, SOOT);
      img.set(ex, top + 6, face(ex, 6));
      img.set(ex + (ex < 12 ? -0 : 0), top + 4, face(ex, 4));
    }
    img.set(8, top + 7, face(8, 7));
    img.set(15, top + 7, face(15, 7));
    img.set(11, top + 8, face(11, 8));
    img.set(12, top + 8, face(12, 8));
  } else if (dir === 'right') {
    img.set(15, top + 5, SOOT);
    img.set(15, top + 6, face(15, 6));
    img.set(14, top + 7, face(14, 7));
    img.set(15, top + 8, face(15, 8));
  }
  // hands
  const hy = 21 + p.bob;
  if (dir === 'right') {
    const hx = 12 + p.step * -2;
    img.rect(hx, hy, 2, 2, r.b);
    img.set(hx + 1, hy + 1, r.d1);
  } else {
    const swing = dir === 'down' ? p.step : -p.step;
    img.rect(6, hy - swing, 2, 2, r.b);
    img.set(6, hy - swing + 1, r.d1);
    img.rect(16, hy + swing, 2, 2, r.b);
    img.set(17, hy + swing + 1, r.d1);
  }
  outline(img);
  // The original translucent contact shadow is excluded by the outline's alpha threshold.
}

// ---------------------------------------------------------------------------------------
// Outfit: torso, sleeves, legs/robe, shoes.

interface OutfitSpec {
  robe: boolean;
  main: (pal: string) => Ramp;
  pants: string;
  shoes: string;
  detail: (img: Img, dir: Dir, p: Pose, main: Ramp, pal: string) => void;
}

const legs = (img: Img, dir: Dir, p: Pose, pants: Ramp, shoes: Ramp) => {
  const hip = 24 + p.bob;
  if (dir === 'right') {
    const front = 12 + p.step * 0 + (p.step !== 0 ? 2 : 0);
    const back = 11 - (p.step !== 0 ? 2 : 0);
    const legPair = p.step === 0 ? [11] : [back, front];
    for (const [k, lx] of legPair.entries()) {
      const isBack = legPair.length > 1 && k === 0;
      for (let y = hip; y < 28; y++) for (let i = 0; i < 3; i++) img.set(lx + i, y, shade(pants, isBack ? 0.25 : 0.55 - i * 0.12, lx + i, y));
      img.rect(lx, 28, 4, 2, shoes.d1);
      img.set(lx + 3, 28, shoes.b);
      img.hline(lx, lx + 3, 29, shoes.d2);
    }
    return;
  }
  const lift = (side: number) => (p.step !== 0 && side !== p.step ? 1 : 0);
  for (const side of [-1, 1]) {
    const lx = side < 0 ? 9 : 12;
    const footY = 29 - lift(side);
    for (let y = hip; y < footY - 1; y++) for (let i = 0; i < 3; i++) img.set(lx + i, y, shade(pants, 0.5 - (side > 0 ? 0.15 : 0) - i * 0.08, lx + i, y));
    const sx = side < 0 ? lx - 1 : lx;
    img.rect(sx, footY - 1, 4, 2, shoes.d1);
    img.hline(sx, sx + 3, footY - 1, shoes.b);
    img.hline(sx, sx + 3, footY, shoes.d2);
  }
  img.vline(12, hip, 27, pants.d2);
};

function torso(img: Img, dir: Dir, p: Pose, main: Ramp, length = 24) {
  const top = 16 + p.bob;
  const bottom = Math.min(29, length + p.bob);
  if (dir === 'right') {
    for (let y = top; y < bottom; y++) {
      const flare = y > 24 + p.bob ? Math.floor((y - 24 - p.bob) / 2) : 0;
      for (let x = 9 - flare; x < 15 + flare; x++) {
        if (y === top && (x === 9 || x === 14)) continue;
        img.set(x, y, shade(main, 0.6 - (x - 9) * 0.07 - (y - top) * 0.012, x, y));
      }
    }
    // arm (sleeve) swinging
    const ax = 11 + p.step * -2;
    for (let y = top + 1; y < top + 6; y++) {
      const sx = ax + Math.round(((y - top) / 6) * -p.step);
      img.set(sx, y, main.l1);
      img.set(sx + 1, y, main.b);
      img.set(sx + 2, y, main.d1);
    }
    return;
  }
  for (let y = top; y < bottom; y++) {
    const flare = y > 24 + p.bob ? Math.floor((y - 24 - p.bob + 1) / 2) : 0;
    for (let x = 8 - flare; x < 16 + flare; x++) {
      if (y === top && (x === 8 || x === 15)) continue;
      img.set(x, y, shade(main, 0.62 - (x - 8) * 0.045 - (y - top) * 0.012, x, y));
    }
  }
  // sleeves
  const swing = dir === 'down' ? p.step : -p.step;
  for (let y = top; y < top + 5; y++) {
    img.set(6, y - (y > top + 2 ? swing : 0), main.l1);
    img.set(7, y - (y > top + 2 ? swing : 0), main.b);
    img.set(16, y + (y > top + 2 ? swing : 0), main.d1);
    img.set(17, y + (y > top + 2 ? swing : 0), main.d2);
  }
}

function robeFeet(img: Img, dir: Dir, p: Pose, shoes: Ramp) {
  if (dir === 'right') {
    const x = 12 + p.step * 1;
    img.rect(x, 29, 4, 1, shoes.d1);
    return;
  }
  if (p.step <= 0) img.rect(8 + (p.step < 0 ? 0 : 1), 29, 3, 1, shoes.d1);
  if (p.step >= 0) img.rect(13 - (p.step > 0 ? 0 : 1), 29, 3, 1, shoes.d1);
}

const OUTFIT_SPECS: Record<string, OutfitSpec> = {
  peasant: {
    robe: false,
    main: (c) => material(c),
    pants: '#3e2c22',
    shoes: '#2a1c16',
    detail(img, dir, p) {
      const belt = 22 + p.bob;
      if (dir === 'right') img.hline(9, 14, belt, '#665032');
      else {
        img.hline(8, 15, belt, '#665032');
        img.set(11, belt + 1, BRASS);
      }
      if (dir === 'down') {
        img.set(11, 16 + p.bob, '#00000000');
        img.set(12, 16 + p.bob, '#00000000');
        img.set(11, 17 + p.bob, SOOT);
      }
    },
  },
  merchant: {
    robe: false,
    main: (c) => material(c),
    pants: '#2a2430',
    shoes: '#16121a',
    detail(img, dir, p, m) {
      const top = 16 + p.bob;
      if (dir === 'down') {
        img.hline(9, 14, top, LINEN);
        for (const y of [top + 2, top + 4, top + 6]) img.set(12, y, '#D5B56A');
        img.vline(11, top + 1, top + 8, m.d2);
        // coat tails
        img.rect(8, top + 8, 2, 2, m.d1);
        img.rect(14, top + 8, 2, 2, m.d2);
      } else if (dir === 'right') {
        img.hline(12, 14, top, LINEN);
        img.set(14, top + 3, '#D5B56A');
        img.rect(9, top + 8, 2, 2, m.d1);
      } else {
        img.vline(12, top + 4, top + 9, m.d2);
      }
      img.hline(dir === 'right' ? 9 : 8, dir === 'right' ? 14 : 15, top + 6, m.d2);
    },
  },
  noble: {
    robe: false,
    main: (c) => material(c),
    pants: '#1e1a26',
    shoes: '#120e16',
    detail(img, dir, p, m, pal) {
      const top = 16 + p.bob;
      const gold = BRASS;
      if (dir === 'down') {
        // ruff collar
        for (let x = 8; x <= 15; x++) img.set(x, top, x < 12 ? LINEN : '#BDB3A0');
        img.vline(12, top + 1, top + 7, gold);
        img.hline(8, 15, top + 7, gold);
        // cape edges
        img.vline(5, top + 1, top + 8, m.d1);
        img.vline(18, top + 1, top + 8, SOOT);
      } else if (dir === 'up') {
        // cape over the back
        for (let y = top; y < top + 10; y++) for (let x = 6 - (y > top + 5 ? 1 : 0); x < 18 + (y > top + 5 ? 1 : 0); x++) img.set(x, y, shade(material(pal), 0.6 - (x - 6) * 0.04, x, y));
        img.hline(7, 16, top, LINEN);
      } else {
        img.hline(10, 15, top, LINEN);
        img.hline(9, 14, top + 7, gold);
        for (let y = top + 1; y < top + 10; y++) img.set(8, y, m.d1);
      }
      void m;
    },
  },
  cleric: {
    robe: true,
    main: (c) => material(c),
    pants: '#000000',
    shoes: '#1a1418',
    detail(img, dir, p, m) {
      const top = 16 + p.bob;
      if (dir === 'down') {
        img.vline(10, top, 27 + p.bob, LINEN);
        img.vline(13, top, 27 + p.bob, LINEN);
        img.hline(11, 12, top, LINEN);
        img.hline(8, 15, top + 6, BRASS);
      } else if (dir === 'right') {
        img.vline(13, top, 27 + p.bob, LINEN);
        img.hline(9, 14, top + 6, BRASS);
      } else {
        img.hline(8, 15, top + 6, BRASS);
        img.vline(12, top + 1, 26 + p.bob, m.d2);
      }
    },
  },
  smith: {
    robe: false,
    main: (c) => material(c),
    pants: '#2e241e',
    shoes: '#1a120e',
    detail(img, dir, p) {
      const top = 16 + p.bob;
      const apron = material('#5e3c24');
      if (dir === 'down') {
        for (let y = top + 2; y < top + 11; y++) for (let x = 9; x < 15; x++) img.set(x, y, shade(apron, 0.6 - (x - 9) * 0.06, x, y));
        img.hline(8, 9, top + 1, '#665032');
        img.hline(14, 15, top + 1, '#665032');
        img.set(12, top + 5, '#D5B56A');
      } else if (dir === 'right') {
        for (let y = top + 2; y < top + 11; y++) for (let x = 12; x < 16; x++) img.set(x, y, shade(apron, 0.5, x, y));
      } else {
        img.hline(8, 15, top + 5, '#665032');
      }
      // rolled sleeve cuffs
      if (dir !== 'right') {
        img.set(6, top + 4, LINEN);
        img.set(17, top + 4, '#BDB3A0');
      }
    },
  },
  scholar: {
    robe: true,
    main: () => material('#2c2834'),
    pants: '#000000',
    shoes: '#141018',
    detail(img, dir, p, _m, pal) {
      const top = 16 + p.bob;
      const mantle = material(pal);
      if (dir === 'right') {
        for (let y = top; y < top + 4; y++) for (let x = 9; x < 15; x++) img.set(x, y, shade(mantle, 0.65 - (x - 9) * 0.08, x, y));
        img.rect(9, top + 8, 3, 4, BRASS); // satchel-book
        return;
      }
      for (let y = top; y < top + 4; y++) for (let x = 7; x < 17; x++) img.set(x, y, shade(mantle, 0.7 - (x - 7) * 0.05 - (y - top) * 0.05, x, y));
      if (dir === 'down') {
        img.vline(12, top + 4, top + 8, mantle.b);
        img.set(12, top + 9, mantle.l1);
        img.rect(13, top + 7, 3, 3, BRASS); // pouch
      }
    },
  },
};

function drawOutfit(img: Img, dir: Dir, p: Pose, outfit: string, palette: string) {
  const spec = OUTFIT_SPECS[outfit]!;
  const pal = PALETTE[palette]!;
  const main = spec.main(pal);
  const pants = material(spec.pants);
  const shoes = material(spec.shoes);
  if (spec.robe) {
    torso(img, dir, p, main, 29);
    robeFeet(img, dir, p, shoes);
    // hem sway
    if (p.step !== 0 && dir !== 'right') img.set(p.step < 0 ? 6 : 17, 28 + p.bob, main.d1);
  } else {
    legs(img, dir, p, pants, shoes);
    torso(img, dir, p, main, 24);
  }
  spec.detail(img, dir, p, main, pal);
  outfitAccent(img, dir, p, outfit, main);
  outline(img, true);
}

// ---------------------------------------------------------------------------------------
// Hair

function drawHair(img: Img, dir: Dir, p: Pose, style: string, color: string) {
  if (style === 'bald') return;
  const r = material(HAIR[color]!);
  const t = 6 + p.bob; // head top
  const px = (x: number, y: number, v: number) => img.set(x, y, shade(r, v, x, y));
  const cap = (fringe: number) => {
    // covers the top of the head, fringe rows below the top
    for (let j = -1; j < fringe; j++)
      for (let i = -1; i < 11; i++) {
        const x = 7 + i;
        const y = t + j;
        if (j === -1 && (i < 2 || i > 7)) continue;
        if (j === 0 && (i < 0 || i > 9)) continue;
        if ((i === -1 || i === 10) && j < 1) continue;
        px(x, y, 0.75 - (i + 1) * 0.04 - j * 0.05 + (j === -1 ? 0.15 : 0));
      }
  };
  if (dir === 'down') {
    if (style === 'hood') {
      const cloth = material(HAIR[color]!);
      for (let j = -2; j < 13; j++)
        for (let i = -1; i < 11; i++) {
          const x = 7 + i;
          const y = t + j;
          if (j === -2 && (i < 2 || i > 7)) continue;
          if (j === -1 && (i < 0 || i > 9)) continue;
          const face = i >= 1 && i <= 8 && j >= 3 && j <= 10;
          if (face) continue;
          img.set(x, y, shade(cloth, 0.7 - (i + 1) * 0.04 - (j + 2) * 0.02, x, y));
        }
      for (let i = 1; i <= 8; i++) px(7 + i, t + 3, 0.6 - i * 0.03);
      for (let i = 2; i <= 7; i += 2) px(7 + i, t + 4, 0.4);
      insetContour(img);
      return;
    }
    cap(3);
    // Original fringe footprint: this hash chooses geometry, not shading noise.
    // jagged bangs
    for (let i = 0; i < 10; i += 2) px(7 + i + (hash(i, 0, 3) < 0.5 ? 1 : 0), t + 3, 0.35);
    // sideburns
    for (let j = 3; j < 6; j++) {
      px(7, t + j, 0.5);
      px(16, t + j, 0.2);
    }
    if (style === 'long') {
      for (let j = 3; j < 15; j++) {
        px(6, t + j, 0.55 - j * 0.02);
        px(7, t + j, 0.45);
        px(16, t + j, 0.25);
        px(17, t + j, 0.15);
      }
    } else if (style === 'braid') {
      for (let j = 5; j < 17; j++) {
        px(16, t + j, j < 12 ? 0.55 : 0.3);
        px(17, t + j, 0.25);
      }
      img.set(16, t + 17, '#814953');
      img.set(17, t + 17, '#814953');
    } else if (style === 'bun') {
      img.ellipse(12, t - 2, 3, 2.4, (x, y, nx, ny) => shade(r, 0.65 - nx * 0.3 - ny * 0.3, x, y));
    }
  } else if (dir === 'up') {
    if (style === 'hood') {
      const cloth = material(HAIR[color]!);
      for (let j = -2; j < 14; j++)
        for (let i = -1; i < 11; i++) {
          if (j === -2 && (i < 2 || i > 7)) continue;
          if (j === -1 && (i < 0 || i > 9)) continue;
          img.set(7 + i, t + j, shade(cloth, 0.65 - (i + 1) * 0.04 - (j + 2) * 0.02, 7 + i, t + j));
        }
      img.set(12, t + 12, cloth.d2);
      img.set(12, t + 13, cloth.d2);
      insetContour(img);
      return;
    }
    // full back of head
    for (let j = -1; j < 10; j++)
      for (let i = -1; i < 11; i++) {
        if (j === -1 && (i < 2 || i > 7)) continue;
        if ((i === -1 || i === 10) && (j < 1 || j > 7)) continue;
        if (j >= 8 && (i < 1 || i > 8)) continue;
        px(7 + i, t + j, 0.7 - (i + 1) * 0.04 - j * 0.03);
      }
    if (style === 'long') for (let j = 9; j < 15; j++) for (let i = 0; i < 10; i++) px(7 + i, t + j, 0.5 - i * 0.03 - (j - 9) * 0.04);
    if (style === 'braid')
      for (let j = 9; j < 18; j++) {
        px(11, t + j, j < 12 ? 0.55 : 0.3);
        px(12, t + j, 0.35);
      }
    if (style === 'bun') img.ellipse(12, t + 1, 3, 2.6, (x, y, nx, ny) => shade(r, 0.65 - nx * 0.3 - ny * 0.3, x, y));
  } else {
    // right-facing profile: hair over the back (left) of the head
    if (style === 'hood') {
      const cloth = material(HAIR[color]!);
      for (let j = -2; j < 13; j++)
        for (let i = -2; i < 11; i++) {
          if (j === -2 && (i < 1 || i > 7)) continue;
          if (j === -1 && (i < -1 || i > 9)) continue;
          if (i >= 6 && j >= 3 && j <= 10) continue;
          if (i > 9 && j > 1) continue;
          img.set(7 + i, t + j, shade(cloth, 0.7 - (i + 2) * 0.04 - (j + 2) * 0.02, 7 + i, t + j));
        }
      px(13, t + 3, 0.5);
      px(14, t + 3, 0.5);
      insetContour(img);
      return;
    }
    cap(2);
    for (let j = 2; j < 8; j++) for (let i = -1; i < 4; i++) px(7 + i, t + j, 0.55 - i * 0.05 - j * 0.03);
    px(14, t + 2, 0.4);
    px(15, t + 2, 0.35);
    if (style === 'long') for (let j = 7; j < 15; j++) for (let i = -1; i < 3; i++) px(7 + i, t + j, 0.5 - j * 0.02 - i * 0.04);
    if (style === 'braid') {
      for (let j = 8; j < 18; j++) {
        px(7, t + j, j < 12 ? 0.55 : 0.3);
        px(8, t + j, 0.3);
      }
      img.set(7, t + 18, '#814953');
    }
    if (style === 'bun') img.ellipse(8, t - 1, 2.6, 2.6, (x, y, nx, ny) => shade(r, 0.65 - nx * 0.3 - ny * 0.3, x, y));
  }
  hairHighlights(img, dir, t, style, r);
  outline(img);
}

// ---------------------------------------------------------------------------------------
// Accessories

function drawAccessory(img: Img, dir: Dir, p: Pose, acc: string) {
  const t = 6 + p.bob;
  if (acc === 'none') return;
  if (acc === 'hat') {
    const felt = material('#2e2638');
    for (let y = t - 6; y < t + 1; y++) for (let x = 8; x < 16; x++) img.set(x + (dir === 'right' ? -1 : 0), y, shade(felt, 0.7 - (x - 8) * 0.06 - (y - t + 6) * 0.02, x, y));
    img.hline(dir === 'right' ? 7 : 8, dir === 'right' ? 14 : 15, t - 1, '#814953');
    img.ellipse(dir === 'right' ? 12 : 12, t + 1, 8.5, 1.6, (x, y, nx) => shade(felt, 0.6 - nx * 0.3, x, y));
    outline(img);
    return;
  }
  if (acc === 'spectacles') {
    if (dir === 'up') return;
    const brass = BRASS;
    const ring = (cx: number) => {
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ])
        img.set(cx + dx!, t + 5 + dy!, brass);
      img.set(cx, t + 5, '#DED2B780');
    };
    if (dir === 'down') {
      ring(9);
      ring(14);
      img.hline(11, 12, t + 5, brass);
    } else {
      ring(15);
      img.hline(11, 13, t + 5, brass);
    }
    insetContour(img);
    return;
  }
  if (acc === 'scarf') {
    const wool = material('#c0902a');
    const ny = 16 + p.bob;
    if (dir === 'right') {
      for (let x = 9; x < 15; x++) for (let y = ny - 1; y < ny + 2; y++) img.set(x, y, shade(wool, 0.6 - (x - 9) * 0.06, x, y));
      for (let y = ny + 2; y < ny + 6; y++) img.rect(9 - (y - ny) / 3, y, 2, 1, wool.d1);
    } else {
      for (let x = 8; x < 16; x++) for (let y = ny - 1; y < ny + 2; y++) img.set(x, y, shade(wool, 0.65 - (x - 8) * 0.05, x, y));
      const tx = dir === 'down' ? 9 : 13;
      for (let y = ny + 2; y < ny + 7; y++) {
        img.set(tx, y, y < ny + 5 ? wool.b : wool.d1);
        img.set(tx + 1, y, wool.d1);
      }
    }
    outline(img);
    return;
  }
  if (acc === 'satchel') {
    const leather = material('#6a4428');
    const top = 16 + p.bob;
    if (dir === 'right') {
      img.line(13, top, 10, top + 6, leather.d1);
      for (let y = top + 6; y < top + 11; y++) for (let x = 7; x < 11; x++) img.set(x, y, shade(leather, 0.6 - (x - 7) * 0.08, x, y));
    } else {
      const flip = dir === 'up';
      img.line(flip ? 8 : 15, top, flip ? 15 : 8, top + 6, leather.d1);
      const bx = flip ? 15 : 4;
      for (let y = top + 5; y < top + 10; y++) for (let x = bx; x < bx + 5; x++) img.set(x, y, shade(leather, 0.65 - (x - bx) * 0.08 - (y - top - 5) * 0.03, x, y));
      img.hline(bx, bx + 4, top + 6, leather.d2);
      img.set(bx + 2, top + 7, BRASS);
    }
    outline(img);
    return;
  }
  if (acc === 'lantern') {
    // held in the right hand
    let lx: number;
    let ly: number;
    if (dir === 'right') {
      lx = 12 + p.step * -2 + 1;
      ly = 23 + p.bob;
    } else if (dir === 'down') {
      lx = 17;
      ly = 23 + p.bob + p.step;
    } else {
      lx = 6;
      ly = 23 + p.bob + p.step;
    }
    img.vline(lx, ly - 1, ly, SOOT);
    img.rect(lx - 2, ly + 1, 5, 1, SOOT);
    for (let y = ly + 2; y < ly + 6; y++) for (let x = lx - 2; x <= lx + 2; x++) img.set(x, y, flatPick(['#D98043', '#F0B85F', '#FFE2A0'], 0.95 - Math.abs(x - lx) * 0.2 - (y - ly - 2) * 0.08, x, y));
    img.rect(lx - 2, ly + 6, 5, 1, SOOT);
    outline(img);
  }
}

// ---------------------------------------------------------------------------------------
// Ghosts and Storyteller (complete sprites)

function ghostFrame(img: Img, dir: Dir, f: number, style: string) {
  const bob = Math.round(Math.sin((f / 5) * Math.PI * 2) * 1.2) - 1;
  const sway = f === 0 ? 0 : Math.round(Math.sin((f / 4) * Math.PI * 2) * 1.5);
  const eyes = (cx: number, y: number, hollow: boolean) => {
    if (dir === 'up') return;
    const xs = dir === 'down' ? [cx - 2, cx + 2] : [cx + 3];
    for (const x of xs) {
      img.set(x, y, hollow ? '#526E83' : '#CCE1DE');
      img.set(x, y + 1, hollow ? '#526E83' : '#CCE1DE');
    }
  };
  if (style === 'wisp') {
    const r = ['#526E83', '#8EB4C2', '#CCE1DE'];
    for (let y = 16; y < 29; y++) {
      const f2 = (y - 16) / 13;
      const w = 5.5 * (1 - f2 * 0.85);
      const cx = 12 + Math.sin(f2 * 3 + f) * 1.4 * f2 + sway * f2;
      for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) img.set(x, y + bob, flatPick(r, 0.7 - (x - cx + w) / (w * 3) - f2 * 0.3, x, y));
    }
    img.ellipse(12, 13 + bob, 6.5, 6.5, (x, y, nx, ny) => flatPick(r, 0.75 - nx * 0.25 - ny * 0.3, x, y));
    eyes(12, 13 + bob, false);
    outline(img, false, '#526E8380');
    img.fade(0.82);
    return;
  }
  if (style === 'shroud') {
    const r = ['#526E83', '#8EB4C2', '#CCE1DE'];
    for (let y = 5; y < 29; y++) {
      const f2 = (y - 5) / 24;
      const w = y < 12 ? Math.sqrt(Math.max(0, 1 - ((12 - y) / 7) ** 2)) * 6.5 : 6.5 + f2 * 2.5;
      for (let x = Math.floor(12 - w); x <= Math.ceil(12 + w - 1); x++) {
        if (y > 25) {
          const scallop = Math.sin((x - 3 + sway) * 1.3) > (y - 26) * 0.6 - 0.2;
          if (!scallop) continue;
        }
        img.set(x + (y > 18 ? Math.round(sway * (y - 18) / 10) : 0), y + bob, flatPick(r, 0.8 - (x - 12 + w) / (w * 2.6) - f2 * 0.25, x, y));
      }
    }
    if (dir !== 'up') {
      const xs = dir === 'down' ? [9, 14] : [15];
      for (const x of xs) img.rect(x, 10 + bob, 2, 3, '#526E83');
      if (dir === 'down') img.rect(11, 15 + bob, 2, 2, '#526E83');
    }
    outline(img, false, '#526E83');
    img.fade(0.78);
    return;
  }
  if (style === 'lantern') {
    const r = ['#526E83', '#8EB4C2', '#CCE1DE'];
    for (let y = 4; y < 29; y++) {
      const f2 = (y - 4) / 25;
      const w = y < 11 ? Math.sqrt(Math.max(0, 1 - ((11 - y) / 7) ** 2)) * 6 : 6 + f2 * 3;
      for (let x = Math.floor(12 - w); x <= Math.ceil(12 + w - 1); x++) {
        if (y > 26 && hash(x, f, 3) < 0.5) continue;
        img.set(x, y + bob, flatPick(r, 0.7 - (x - 12 + w) / (w * 2.4) - f2 * 0.3, x, y));
      }
    }
    // dark hood opening + eyes
    if (dir !== 'up') {
      const cx = dir === 'down' ? 12 : 14;
      img.ellipse(cx, 11 + bob, 3.5, 3.5, '#526E83');
      const xs = dir === 'down' ? [11, 13] : [15];
      for (const x of xs) img.set(x, 11 + bob, '#CCE1DE');
    }
    // lantern
    const lx = dir === 'up' ? 6 : dir === 'down' ? 18 : 17;
    const ly = 20 + bob + (f % 2);
    img.vline(lx, ly - 2, ly, '#526E83');
    for (let y = ly + 1; y < ly + 5; y++) for (let x = lx - 1; x <= lx + 1; x++) img.set(x, y, x === lx ? '#CCE1DE' : '#8EB4C2');
    outline(img, false, '#526E83');
    img.fade(0.85);
    return;
  }
  // pale: translucent humanoid fading downwards
  const r = material('#9aaacc');
  const p: Pose = { bob, step: 0 };
  headShape(img, 12, 6 + bob, r, dir);
  for (let y = 16 + bob; y < 29; y++) {
    const w = 4 + (y - 16) * 0.12;
    for (let x = Math.floor(12 - w); x < Math.ceil(12 + w); x++) img.set(x, y, shade(r, 0.6 - (x - 8) * 0.04, x, y));
  }
  for (const ax of [6, 16]) for (let y = 16 + bob; y < 22 + bob; y++) img.set(ax + (ax < 12 ? 1 : 0), y, r.d1);
  eyes(12, 11 + bob, true);
  void p;
  outline(img, false, '#526E83');
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const a = img.alpha(x, y);
      if (!a) continue;
      const fade = y < 20 ? 0.86 : Math.max(0, 0.86 - (y - 20) * 0.09);
      img.data[(y * FW + x) * 4 + 3] = a * fade;
    }
}

function storytellerFrame(img: Img, dir: Dir, p: Pose) {
  img.ellipse(12, 29.5, 7, 1.8, [25, 28, 41, 90]);
  const cloak = material('#2a1838');
  const trim = BRASS;
  const t = 4 + p.bob;
  // robe body (wide, to the ground)
  for (let y = t + 10; y < 30; y++) {
    const f2 = (y - t - 10) / (30 - t - 10);
    const w = 5.5 + f2 * 3.5;
    const cx = 12 + (dir === 'right' ? -0.5 : 0);
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w - 1); x++) {
      let v = 0.65 - (x - cx + w) / (w * 2.4) - f2 * 0.15;
      if (x >= cx + 2 && x <= cx + 3 && y > t + 14) v -= 0.12;
      img.set(x, y, shade(cloak, v, x, y));
    }
    if (y === 29) for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w - 1); x++) img.set(x, y, trim);
  }
  if (dir === 'down') img.vline(12, t + 11, 28, trim);
  // hood
  for (let j = 0; j < 12; j++)
    for (let i = -6; i <= 6; i++) {
      const top = j < 4 ? Math.abs(i) <= j + 2 : true;
      if (!top) continue;
      const w = j < 4 ? j + 2 : 6;
      if (Math.abs(i) > w) continue;
      img.set(12 + i, t + j - 1, shade(cloak, 0.75 - (i + 6) * 0.04 - j * 0.02, 12 + i, t + j));
    }
  img.set(12, t - 2, cloak.l1);
  if (dir !== 'up') {
    const cx = dir === 'down' ? 12 : 14;
    img.ellipse(cx, t + 6, 3.8, 3.6, SOOT);
    const xs = dir === 'down' ? [10, 14] : [15];
    for (const x of xs) {
      img.set(x, t + 6, '#F0B85F');
      img.set(x, t + 7, '#D98043');
    }
    // hood trim
    for (let a = 0; a < Math.PI; a += 0.15) img.set(Math.round(cx + Math.cos(a + Math.PI) * 4.6), Math.round(t + 6 + Math.sin(a + Math.PI) * 4.6), trim);
  }
  // lantern
  const lx = dir === 'up' ? 5 : dir === 'down' ? 19 : 18;
  const ly = 18 + p.bob + (p.step !== 0 ? 1 : 0);
  img.rect(lx - 1, ly - 2, 1, 2, SOOT);
  img.rect(lx - 2, ly, 5, 1, SOOT);
  for (let y = ly + 1; y < ly + 6; y++) for (let x = lx - 2; x <= lx + 2; x++) img.set(x, y, flatPick(['#D98043', '#F0B85F', '#FFE2A0'], 0.95 - Math.abs(x - lx) * 0.2 - (y - ly) * 0.05, x, y));
  img.rect(lx - 2, ly + 6, 5, 1, SOOT);
  // sleeve reaching the lantern
  if (dir !== 'up') img.rect(dir === 'down' ? 16 : 15, ly - 2, 3, 3, cloak.d1);
  outline(img);
}

// ---------------------------------------------------------------------------------------

type FrameFn = (img: Img, dir: Dir, frame: number, p: Pose) => void;

/** Build a 5x4 sheet; 'left' row is the mirrored 'right' row. */
function sheet(fn: FrameFn): Img {
  const out = new Img(FW * FRAMES.length, FH * DIRS.length);
  DIRS.forEach((d, row) => {
    FRAMES.forEach((_, colIdx) => {
      const f = new Img(FW, FH);
      const dir: Dir = d === 'left' ? 'right' : d;
      fn(f, dir, colIdx, POSES[colIdx]!);
      out.blit(d === 'left' ? f.flipped() : f, colIdx * FW, row * FH);
    });
  });
  return out;
}

export interface CharacterSheets {
  sheets: Map<string, Img>;
  /** Extra alpha the client should apply (ghosts are already translucent). */
  meta: Record<string, { alpha?: number }>;
}

export function drawCharacters(): CharacterSheets {
  const sheets = new Map<string, Img>();
  for (const s of SKIN_TONES) sheets.set(`body/${s}`, sheet((img, dir, _f, p) => drawBody(img, dir, p, SKIN[s]!)));
  for (const o of OUTFITS) for (const pal of OUTFIT_PALETTES) sheets.set(`outfit/${o}/${pal}`, sheet((img, dir, _f, p) => drawOutfit(img, dir, p, o, pal)));
  for (const h of HAIR_STYLES) {
    if (h === 'bald') continue;
    for (const c of HAIR_COLORS) sheets.set(`hair/${h}/${c}`, sheet((img, dir, _f, p) => drawHair(img, dir, p, h, c)));
  }
  for (const a of ACCESSORIES) {
    if (a === 'none') continue;
    sheets.set(`accessory/${a}`, sheet((img, dir, _f, p) => drawAccessory(img, dir, p, a)));
  }
  for (const g of GHOST_STYLES) sheets.set(`ghost/${g}`, sheet((img, dir, f) => ghostFrame(img, dir, f, g)));
  sheets.set('storyteller', sheet((img, dir, _f, p) => storytellerFrame(img, dir, p)));
  return { sheets, meta: {} };
}
