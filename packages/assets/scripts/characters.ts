// Layered character sprite sheets. Every sheet has the same grid: 5 columns (idle, walk1..4) x 4
// rows (down, up, left, right) of 24x32 frames, feet at y = 30. Layers are composited in order
// body -> outfit -> hair -> accessory. Ghost sheets and the Storyteller are complete sprites.
import { ACCESSORIES, GHOST_STYLES, HAIR_COLORS, HAIR_STYLES, OUTFIT_PALETTES, OUTFITS, SKIN_TONES } from '@ct/protocol';
import { dpick, hash, Img, mix, ramp, type Color, type Ramp } from './lib/img.js';

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

/** Flat (non-dithered) ramp pick: tiny sprites read cleaner without dithering. */
const shade = (r: Ramp, v: number, _x: number, _y: number) => {
  const pal = [r.d2, r.d1, r.b, r.l1, r.l2];
  return pal[Math.max(0, Math.min(4, Math.round(v * 4)))]!;
};

// ---------------------------------------------------------------------------------------
// Body (skin): shadow, head with face, neck, hands.

function headShape(img: Img, cx: number, top: number, r: Ramp, dir: Dir) {
  // 10 x 10 rounded head
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 10; i++) {
      const corner = (j === 0 || j === 9) && (i < 2 || i > 7);
      const corner2 = (j === 1 || j === 8) && (i === 0 || i === 9);
      if (corner || corner2) continue;
      const v = 0.7 - i * 0.045 - j * 0.035 + (i < 2 && j > 1 && j < 8 ? 0.08 : 0);
      img.set(cx - 5 + i, top + j, shade(r, v, cx - 5 + i, top + j));
    }
  if (dir === 'right') {
    img.set(cx + 5, top + 5, r.b); // nose
    img.set(cx + 5, top + 6, r.d1);
    img.set(cx - 1, top + 5, r.d1); // ear
    img.set(cx - 1, top + 6, r.d2);
  }
}

function drawBody(img: Img, dir: Dir, p: Pose, skin: string) {
  const r = ramp(skin);
  // ground shadow (does not bob)
  img.ellipse(12, 29.5, 6, 1.7, [12, 6, 20, 90]);
  const top = 6 + p.bob;
  headShape(img, 12, top, r, dir);
  // neck
  img.rect(11, top + 10, 2, 2, r.d1);
  if (dir === 'down') {
    // eyes, brows, cheeks, mouth
    for (const ex of [9, 14]) {
      img.set(ex, top + 5, '#1a1020');
      img.set(ex, top + 6, '#1a1020');
      img.set(ex + (ex < 12 ? -0 : 0), top + 4, r.d1);
    }
    img.set(8, top + 7, mix(r.b, '#c04848', 0.3));
    img.set(15, top + 7, mix(r.b, '#c04848', 0.3));
    img.set(11, top + 8, r.d1);
    img.set(12, top + 8, r.d1);
  } else if (dir === 'right') {
    img.set(15, top + 5, '#1a1020');
    img.set(15, top + 6, '#1a1020');
    img.set(14, top + 7, mix(r.b, '#c04848', 0.3));
    img.set(15, top + 8, r.d1);
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
  img.outline({ darken: 0.62, skip: [] });
  // re-draw the shadow alpha after outline (outline must not ring the shadow)
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
    main: (c) => ramp(mix(c, '#8a7a60', 0.25)),
    pants: '#3e2c22',
    shoes: '#2a1c16',
    detail(img, dir, p) {
      const belt = 22 + p.bob;
      if (dir === 'right') img.hline(9, 14, belt, '#7a5a30');
      else {
        img.hline(8, 15, belt, '#7a5a30');
        img.set(11, belt + 1, '#9a7a44');
      }
      if (dir === 'down') {
        img.set(11, 16 + p.bob, '#00000000');
        img.set(12, 16 + p.bob, '#00000000');
        img.set(11, 17 + p.bob, mix('#000000', '#ffffff', 0.15));
      }
    },
  },
  merchant: {
    robe: false,
    main: (c) => ramp(c),
    pants: '#2a2430',
    shoes: '#16121a',
    detail(img, dir, p, m) {
      const top = 16 + p.bob;
      if (dir === 'down') {
        img.hline(9, 14, top, '#e8e0d0');
        for (const y of [top + 2, top + 4, top + 6]) img.set(12, y, '#e0c060');
        img.vline(11, top + 1, top + 8, m.d2);
        // coat tails
        img.rect(8, top + 8, 2, 2, m.d1);
        img.rect(14, top + 8, 2, 2, m.d2);
      } else if (dir === 'right') {
        img.hline(12, 14, top, '#e8e0d0');
        img.set(14, top + 3, '#e0c060');
        img.rect(9, top + 8, 2, 2, m.d1);
      } else {
        img.vline(12, top + 4, top + 9, m.d2);
      }
      img.hline(dir === 'right' ? 9 : 8, dir === 'right' ? 14 : 15, top + 6, m.d2);
    },
  },
  noble: {
    robe: false,
    main: (c) => ramp(c),
    pants: '#1e1a26',
    shoes: '#120e16',
    detail(img, dir, p, m, pal) {
      const top = 16 + p.bob;
      const gold = '#d8b450';
      if (dir === 'down') {
        // ruff collar
        for (let x = 8; x <= 15; x++) img.set(x, top, x % 2 ? '#f0ece0' : '#c8c0b0');
        img.vline(12, top + 1, top + 7, gold);
        img.hline(8, 15, top + 7, gold);
        // cape edges
        img.vline(5, top + 1, top + 8, mix(pal, '#000000', 0.55));
        img.vline(18, top + 1, top + 8, mix(pal, '#000000', 0.65));
      } else if (dir === 'up') {
        // cape over the back
        for (let y = top; y < top + 10; y++) for (let x = 6 - (y > top + 5 ? 1 : 0); x < 18 + (y > top + 5 ? 1 : 0); x++) img.set(x, y, shade(ramp(mix(pal, '#000000', 0.3)), 0.6 - (x - 6) * 0.04, x, y));
        img.hline(7, 16, top, '#f0ece0');
      } else {
        img.hline(10, 15, top, '#f0ece0');
        img.hline(9, 14, top + 7, gold);
        for (let y = top + 1; y < top + 10; y++) img.set(8, y, mix(pal, '#000000', 0.5));
      }
      void m;
    },
  },
  cleric: {
    robe: true,
    main: (c) => ramp(c),
    pants: '#000000',
    shoes: '#1a1418',
    detail(img, dir, p, m) {
      const top = 16 + p.bob;
      if (dir === 'down') {
        img.vline(10, top, 27 + p.bob, '#e8e2d4');
        img.vline(13, top, 27 + p.bob, '#e8e2d4');
        img.hline(11, 12, top, '#e8e2d4');
        img.hline(8, 15, top + 6, '#8a6a3a');
      } else if (dir === 'right') {
        img.vline(13, top, 27 + p.bob, '#e8e2d4');
        img.hline(9, 14, top + 6, '#8a6a3a');
      } else {
        img.hline(8, 15, top + 6, '#8a6a3a');
        img.vline(12, top + 1, 26 + p.bob, m.d2);
      }
    },
  },
  smith: {
    robe: false,
    main: (c) => ramp(mix(c, '#6a5a50', 0.2)),
    pants: '#2e241e',
    shoes: '#1a120e',
    detail(img, dir, p) {
      const top = 16 + p.bob;
      const apron = ramp('#5e3c24');
      if (dir === 'down') {
        for (let y = top + 2; y < top + 11; y++) for (let x = 9; x < 15; x++) img.set(x, y, shade(apron, 0.6 - (x - 9) * 0.06, x, y));
        img.hline(8, 9, top + 1, '#3a2414');
        img.hline(14, 15, top + 1, '#3a2414');
        img.set(12, top + 5, '#9a9aa8');
      } else if (dir === 'right') {
        for (let y = top + 2; y < top + 11; y++) for (let x = 12; x < 16; x++) img.set(x, y, shade(apron, 0.5, x, y));
      } else {
        img.hline(8, 15, top + 5, '#3a2414');
      }
      // rolled sleeve cuffs
      if (dir !== 'right') {
        img.set(6, top + 4, '#c8bca8');
        img.set(17, top + 4, '#a89c88');
      }
    },
  },
  scholar: {
    robe: true,
    main: () => ramp('#2c2834'),
    pants: '#000000',
    shoes: '#141018',
    detail(img, dir, p, _m, pal) {
      const top = 16 + p.bob;
      const mantle = ramp(pal);
      if (dir === 'right') {
        for (let y = top; y < top + 4; y++) for (let x = 9; x < 15; x++) img.set(x, y, shade(mantle, 0.65 - (x - 9) * 0.08, x, y));
        img.rect(9, top + 8, 3, 4, '#5a3a22'); // satchel-book
        return;
      }
      for (let y = top; y < top + 4; y++) for (let x = 7; x < 17; x++) img.set(x, y, shade(mantle, 0.7 - (x - 7) * 0.05 - (y - top) * 0.05, x, y));
      if (dir === 'down') {
        img.vline(12, top + 4, top + 8, mantle.b);
        img.set(12, top + 9, mantle.l1);
        img.rect(13, top + 7, 3, 3, '#6a4a2a'); // pouch
      }
    },
  },
};

function drawOutfit(img: Img, dir: Dir, p: Pose, outfit: string, palette: string) {
  const spec = OUTFIT_SPECS[outfit]!;
  const pal = PALETTE[palette]!;
  const main = spec.main(pal);
  const pants = ramp(spec.pants);
  const shoes = ramp(spec.shoes);
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
  img.outline({ darken: 0.65, skip: ['up'] });
}

// ---------------------------------------------------------------------------------------
// Hair

function drawHair(img: Img, dir: Dir, p: Pose, style: string, color: string) {
  if (style === 'bald') return;
  const r = ramp(HAIR[color]!);
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
      const cloth = ramp(mix(HAIR[color]!, '#2a2236', 0.6));
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
      return;
    }
    cap(3);
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
        px(16, t + j, j % 2 ? 0.6 : 0.3);
        px(17, t + j, j % 2 ? 0.3 : 0.15);
      }
      img.set(16, t + 17, '#a03030');
      img.set(17, t + 17, '#a03030');
    } else if (style === 'bun') {
      img.ellipse(12, t - 2, 3, 2.4, (x, y, nx, ny) => shade(r, 0.65 - nx * 0.3 - ny * 0.3, x, y));
    }
  } else if (dir === 'up') {
    if (style === 'hood') {
      const cloth = ramp(mix(HAIR[color]!, '#2a2236', 0.6));
      for (let j = -2; j < 14; j++)
        for (let i = -1; i < 11; i++) {
          if (j === -2 && (i < 2 || i > 7)) continue;
          if (j === -1 && (i < 0 || i > 9)) continue;
          img.set(7 + i, t + j, shade(cloth, 0.65 - (i + 1) * 0.04 - (j + 2) * 0.02, 7 + i, t + j));
        }
      img.set(12, t + 12, cloth.d2);
      img.set(12, t + 13, cloth.d2);
      return;
    }
    // full back of head
    for (let j = -1; j < 10; j++)
      for (let i = -1; i < 11; i++) {
        if (j === -1 && (i < 2 || i > 7)) continue;
        if ((i === -1 || i === 10) && (j < 1 || j > 7)) continue;
        if (j >= 8 && (i < 1 || i > 8)) continue;
        px(7 + i, t + j, 0.7 - (i + 1) * 0.04 - j * 0.03 + ((i + j) % 3 === 0 ? -0.1 : 0));
      }
    if (style === 'long') for (let j = 9; j < 15; j++) for (let i = 0; i < 10; i++) px(7 + i, t + j, 0.5 - i * 0.03 - (j - 9) * 0.04);
    if (style === 'braid')
      for (let j = 9; j < 18; j++) {
        px(11, t + j, j % 2 ? 0.6 : 0.3);
        px(12, t + j, j % 2 ? 0.35 : 0.55);
      }
    if (style === 'bun') img.ellipse(12, t + 1, 3, 2.6, (x, y, nx, ny) => shade(r, 0.65 - nx * 0.3 - ny * 0.3, x, y));
  } else {
    // right-facing profile: hair over the back (left) of the head
    if (style === 'hood') {
      const cloth = ramp(mix(HAIR[color]!, '#2a2236', 0.6));
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
      return;
    }
    cap(2);
    for (let j = 2; j < 8; j++) for (let i = -1; i < 4; i++) px(7 + i, t + j, 0.55 - i * 0.05 - j * 0.03);
    px(14, t + 2, 0.4);
    px(15, t + 2, 0.35);
    if (style === 'long') for (let j = 7; j < 15; j++) for (let i = -1; i < 3; i++) px(7 + i, t + j, 0.5 - j * 0.02 - i * 0.04);
    if (style === 'braid') {
      for (let j = 8; j < 18; j++) {
        px(7, t + j, j % 2 ? 0.6 : 0.3);
        px(8, t + j, j % 2 ? 0.3 : 0.5);
      }
      img.set(7, t + 18, '#a03030');
    }
    if (style === 'bun') img.ellipse(8, t - 1, 2.6, 2.6, (x, y, nx, ny) => shade(r, 0.65 - nx * 0.3 - ny * 0.3, x, y));
  }
  img.outline({ darken: 0.6 });
}

// ---------------------------------------------------------------------------------------
// Accessories

function drawAccessory(img: Img, dir: Dir, p: Pose, acc: string) {
  const t = 6 + p.bob;
  if (acc === 'none') return;
  if (acc === 'hat') {
    const felt = ramp('#2e2638');
    for (let y = t - 6; y < t + 1; y++) for (let x = 8; x < 16; x++) img.set(x + (dir === 'right' ? -1 : 0), y, shade(felt, 0.7 - (x - 8) * 0.06 - (y - t + 6) * 0.02, x, y));
    img.hline(dir === 'right' ? 7 : 8, dir === 'right' ? 14 : 15, t - 1, '#8c2a32');
    img.ellipse(dir === 'right' ? 12 : 12, t + 1, 8.5, 1.6, (x, y, nx) => shade(felt, 0.6 - nx * 0.3, x, y));
    img.outline({ darken: 0.6 });
    return;
  }
  if (acc === 'spectacles') {
    if (dir === 'up') return;
    const brass = '#c8a450';
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
      img.set(cx, t + 5, '#c8d8e880');
    };
    if (dir === 'down') {
      ring(9);
      ring(14);
      img.hline(11, 12, t + 5, brass);
    } else {
      ring(15);
      img.hline(11, 13, t + 5, brass);
    }
    return;
  }
  if (acc === 'scarf') {
    const wool = ramp('#c0902a');
    const ny = 16 + p.bob;
    if (dir === 'right') {
      for (let x = 9; x < 15; x++) for (let y = ny - 1; y < ny + 2; y++) img.set(x, y, shade(wool, 0.6 - (x - 9) * 0.06 + (x % 3 === 0 ? -0.2 : 0), x, y));
      for (let y = ny + 2; y < ny + 6; y++) img.rect(9 - (y - ny) / 3, y, 2, 1, wool.d1);
    } else {
      for (let x = 8; x < 16; x++) for (let y = ny - 1; y < ny + 2; y++) img.set(x, y, shade(wool, 0.65 - (x - 8) * 0.05 + (x % 3 === 0 ? -0.2 : 0), x, y));
      const tx = dir === 'down' ? 9 : 13;
      for (let y = ny + 2; y < ny + 7; y++) {
        img.set(tx, y, y % 2 ? wool.b : '#8c2a32');
        img.set(tx + 1, y, wool.d1);
      }
    }
    img.outline({ darken: 0.6 });
    return;
  }
  if (acc === 'satchel') {
    const leather = ramp('#6a4428');
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
      img.set(bx + 2, top + 7, '#d8b450');
    }
    img.outline({ darken: 0.6 });
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
    img.vline(lx, ly - 1, ly, '#2a2632');
    img.rect(lx - 2, ly + 1, 5, 1, '#2a2632');
    for (let y = ly + 2; y < ly + 6; y++) for (let x = lx - 2; x <= lx + 2; x++) img.set(x, y, dpick(['#c06a24', '#eda040', '#ffd27a', '#fff0c0'], 0.95 - Math.abs(x - lx) * 0.2 - (y - ly - 2) * 0.08, x, y));
    img.rect(lx - 2, ly + 6, 5, 1, '#2a2632');
    img.outline({ darken: 0.5 });
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
      img.set(x, y, hollow ? '#100c1c' : '#1a3040');
      img.set(x, y + 1, hollow ? '#100c1c' : '#1a3040');
    }
  };
  if (style === 'wisp') {
    const r = ['#1e4a66', '#2e6c8e', '#4a9ac0', '#8ad0e8', '#d8f6ff'];
    for (let y = 16; y < 29; y++) {
      const f2 = (y - 16) / 13;
      const w = 5.5 * (1 - f2 * 0.85);
      const cx = 12 + Math.sin(f2 * 3 + f) * 1.4 * f2 + sway * f2;
      for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) img.set(x, y + bob, dpick(r, 0.7 - (x - cx + w) / (w * 3) - f2 * 0.3, x, y));
    }
    img.ellipse(12, 13 + bob, 6.5, 6.5, (x, y, nx, ny) => dpick(r, 0.75 - nx * 0.25 - ny * 0.3, x, y));
    eyes(12, 13 + bob, false);
    img.outline({ color: '#7ad0f080' });
    img.fade(0.82);
    return;
  }
  if (style === 'shroud') {
    const r = ['#4e4e6e', '#7a7a9a', '#a8a8c8', '#d4d4ea', '#f2f2fc'];
    for (let y = 5; y < 29; y++) {
      const f2 = (y - 5) / 24;
      const w = y < 12 ? Math.sqrt(Math.max(0, 1 - ((12 - y) / 7) ** 2)) * 6.5 : 6.5 + f2 * 2.5;
      for (let x = Math.floor(12 - w); x <= Math.ceil(12 + w - 1); x++) {
        if (y > 25) {
          const scallop = Math.sin((x - 3 + sway) * 1.3) > (y - 26) * 0.6 - 0.2;
          if (!scallop) continue;
        }
        img.set(x + (y > 18 ? Math.round(sway * (y - 18) / 10) : 0), y + bob, dpick(r, 0.8 - (x - 12 + w) / (w * 2.6) - f2 * 0.25, x, y));
      }
    }
    if (dir !== 'up') {
      const xs = dir === 'down' ? [9, 14] : [15];
      for (const x of xs) img.rect(x, 10 + bob, 2, 3, '#120e1e');
      if (dir === 'down') img.rect(11, 15 + bob, 2, 2, '#120e1e');
    }
    img.outline({ color: '#2a2a4a' });
    img.fade(0.78);
    return;
  }
  if (style === 'lantern') {
    const r = ['#0e2626', '#1a3e3a', '#2a5e52', '#4a8a70', '#8ad0a0'];
    for (let y = 4; y < 29; y++) {
      const f2 = (y - 4) / 25;
      const w = y < 11 ? Math.sqrt(Math.max(0, 1 - ((11 - y) / 7) ** 2)) * 6 : 6 + f2 * 3;
      for (let x = Math.floor(12 - w); x <= Math.ceil(12 + w - 1); x++) {
        if (y > 26 && hash(x, f, 3) < 0.5) continue;
        img.set(x, y + bob, dpick(r, 0.7 - (x - 12 + w) / (w * 2.4) - f2 * 0.3, x, y));
      }
    }
    // dark hood opening + eyes
    if (dir !== 'up') {
      const cx = dir === 'down' ? 12 : 14;
      img.ellipse(cx, 11 + bob, 3.5, 3.5, '#06100e');
      const xs = dir === 'down' ? [11, 13] : [15];
      for (const x of xs) img.set(x, 11 + bob, '#c8ff90');
    }
    // lantern
    const lx = dir === 'up' ? 6 : dir === 'down' ? 18 : 17;
    const ly = 20 + bob + (f % 2);
    img.vline(lx, ly - 2, ly, '#1e2a28');
    for (let y = ly + 1; y < ly + 5; y++) for (let x = lx - 1; x <= lx + 1; x++) img.set(x, y, x === lx ? '#e0ffb0' : '#90e070');
    img.outline({ color: '#0a1a18' });
    img.fade(0.85);
    return;
  }
  // pale: translucent humanoid fading downwards
  const r = ramp('#9aaacc');
  const p: Pose = { bob, step: 0 };
  headShape(img, 12, 6 + bob, r, dir);
  for (let y = 16 + bob; y < 29; y++) {
    const w = 4 + (y - 16) * 0.12;
    for (let x = Math.floor(12 - w); x < Math.ceil(12 + w); x++) img.set(x, y, shade(r, 0.6 - (x - 8) * 0.04, x, y));
  }
  for (const ax of [6, 16]) for (let y = 16 + bob; y < 22 + bob; y++) img.set(ax + (ax < 12 ? 1 : 0), y, r.d1);
  eyes(12, 11 + bob, true);
  void p;
  img.outline({ color: '#3a4a6a' });
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const a = img.alpha(x, y);
      if (!a) continue;
      const fade = y < 20 ? 0.86 : Math.max(0, 0.86 - (y - 20) * 0.09);
      img.data[(y * FW + x) * 4 + 3] = a * fade;
    }
}

function storytellerFrame(img: Img, dir: Dir, p: Pose) {
  img.ellipse(12, 29.5, 7, 1.8, [12, 6, 20, 90]);
  const cloak = ramp('#2a1838');
  const trim = '#c9a24a';
  const t = 4 + p.bob;
  // robe body (wide, to the ground)
  for (let y = t + 10; y < 30; y++) {
    const f2 = (y - t - 10) / (30 - t - 10);
    const w = 5.5 + f2 * 3.5;
    const cx = 12 + (dir === 'right' ? -0.5 : 0);
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w - 1); x++) {
      let v = 0.65 - (x - cx + w) / (w * 2.4) - f2 * 0.15;
      if ((x + (p.step !== 0 ? 1 : 0)) % 4 === 0 && y > t + 14) v -= 0.12;
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
    img.ellipse(cx, t + 6, 3.8, 3.6, '#07040c');
    const xs = dir === 'down' ? [10, 14] : [15];
    for (const x of xs) {
      img.set(x, t + 6, '#ffcf5a');
      img.set(x, t + 7, '#b0602a');
    }
    // hood trim
    for (let a = 0; a < Math.PI; a += 0.15) img.set(Math.round(cx + Math.cos(a + Math.PI) * 4.6), Math.round(t + 6 + Math.sin(a + Math.PI) * 4.6), trim);
  }
  // lantern
  const lx = dir === 'up' ? 5 : dir === 'down' ? 19 : 18;
  const ly = 18 + p.bob + (p.step !== 0 ? 1 : 0);
  img.rect(lx - 1, ly - 2, 1, 2, '#2a2632');
  img.rect(lx - 2, ly, 5, 1, '#1e1a24');
  for (let y = ly + 1; y < ly + 6; y++) for (let x = lx - 2; x <= lx + 2; x++) img.set(x, y, dpick(['#c06a24', '#eda040', '#ffd27a', '#fff0c0'], 0.95 - Math.abs(x - lx) * 0.2 - (y - ly) * 0.05, x, y));
  img.rect(lx - 2, ly + 6, 5, 1, '#1e1a24');
  // sleeve reaching the lantern
  if (dir !== 'up') img.rect(dir === 'down' ? 16 : 15, ly - 2, 3, 3, cloak.d1);
  img.outline({ darken: 0.7 });
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

export const _col: Color = '#000';
