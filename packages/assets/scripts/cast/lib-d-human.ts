// Plain v1-style townsfolk for the cast-d NPCs (sweeper, vendor, elder, porter).
// Ported from scripts/characters.ts (24x32 people: 10x10 rounded head, blocky torso, separately
// outlined layers body -> outfit -> hair -> prop, flat ramp shading lit from the upper-left) and
// extended with the two diagonal views. Drawn in v1 coordinates and placed at (+4, +8) so the feet
// land on the cast anchor (16, 38).
import { Img, mix, ramp, type Color, type Ramp } from '../lib/img.js';
import { flat, groundShadow } from './lib-d.js';
import type { DrawnDir, FrameIndex } from './types.js';

export const OX = 4;
export const OY = 8;

/** An Img whose drawing calls are offset into the 32x40 cast frame (v1 coordinates in). */
export class Off extends Img {
  constructor() {
    super(32, 40);
  }
  override set(x: number, y: number, c: Color) {
    super.set(Math.round(x) + OX, Math.round(y) + OY, c);
  }
  /** Copy to a plain Img (outline() must not go through the offset). */
  plain(): Img {
    const o = new Img(32, 40);
    o.data.set(this.data);
    return o;
  }
}

export type HDir = 'down' | 'dr' | 'right' | 'ur' | 'up';
export const hdir = (d: DrawnDir): HDir => (d === 'down-right' ? 'dr' : d === 'up-right' ? 'ur' : d);

export interface HPose {
  bob: number;
  step: number;
}
export function hpose(f: FrameIndex): HPose {
  return { bob: f === 2 || f === 4 ? -1 : 0, step: f === 1 ? -1 : f === 3 ? 1 : 0 };
}

const sh = (r: Ramp, v: number) => flat(r, v);
const front = (d: HDir) => d === 'down' || d === 'dr';
const back = (d: HDir) => d === 'up' || d === 'ur';

export interface HumanSpec {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'bun' | 'bald' | 'hood';
  top: string;
  legs: string;
  shoes: string;
  /** Long robe to the ground instead of trousers. */
  robe?: boolean;
  /** Head/shoulders dip forward (elder). */
  stoop?: number;
  /** Extra outfit details (apron, belt...), drawn on the outfit layer. */
  detail?: (img: Off, d: HDir, p: HPose, top: Ramp) => void;
  /** Prop layer drawn behind everything (e.g. a sack seen from the front). */
  under?: (img: Off, d: HDir, p: HPose) => void;
  /** Prop layer drawn over everything (broom, cane...). */
  over?: (img: Off, d: HDir, p: HPose) => void;
  /** Hands hidden (holding a prop): positions handled by the prop. */
  hands?: (d: HDir, p: HPose) => [number, number][] | null;
}

// ---------------------------------------------------------------------------------------
// body: head with face, neck, hands

function headShape(img: Off, cx: number, top: number, r: Ramp) {
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 10; i++) {
      const corner = (j === 0 || j === 9) && (i < 2 || i > 7);
      const corner2 = (j === 1 || j === 8) && (i === 0 || i === 9);
      if (corner || corner2) continue;
      const v = 0.7 - i * 0.045 - j * 0.035 + (i < 2 && j > 1 && j < 8 ? 0.08 : 0);
      img.set(cx - 5 + i, top + j, sh(r, v));
    }
}

function defaultHands(d: HDir, p: HPose): [number, number][] {
  const hy = 21 + p.bob;
  if (d === 'right') return [[12 + p.step * -2, hy]];
  const swing = front(d) ? p.step : -p.step;
  if (d === 'dr') return [[6, hy - swing], [16, hy + swing]];
  if (d === 'ur') return [[7, hy - swing], [17, hy + swing]];
  return [[6, hy - swing], [16, hy + swing]];
}

function drawBody(img: Off, d: HDir, p: HPose, s: HumanSpec, top: number) {
  const r = ramp(s.skin);
  headShape(img, 12, top, r);
  img.rect(11, top + 10, 2, 2, r.d1);
  const blush = mix(r.b, '#c04848', 0.25);
  const ink = '#1a1020';
  if (d === 'down') {
    for (const ex of [9, 14]) {
      img.set(ex, top + 5, ink);
      img.set(ex, top + 6, ink);
    }
    img.set(8, top + 7, blush);
    img.set(15, top + 7, blush);
    img.set(11, top + 8, r.d1);
    img.set(12, top + 8, r.d1);
  } else if (d === 'dr') {
    for (const ex of [11, 15]) {
      img.set(ex, top + 5, ink);
      img.set(ex, top + 6, ink);
    }
    img.set(10, top + 7, blush);
    img.set(16, top + 7, blush);
    img.set(13, top + 8, r.d1);
    img.set(14, top + 8, r.d1);
    img.set(8, top + 5, r.d1); // ear
    img.set(8, top + 6, r.d2);
  } else if (d === 'right') {
    img.set(17, top + 5, r.b); // nose
    img.set(17, top + 6, r.d1);
    img.set(11, top + 5, r.d1); // ear
    img.set(11, top + 6, r.d2);
    img.set(15, top + 5, ink);
    img.set(15, top + 6, ink);
    img.set(14, top + 7, blush);
    img.set(15, top + 8, r.d1);
  } else if (d === 'ur') {
    img.set(15, top + 5, r.d1); // ear
    img.set(15, top + 6, r.d2);
  }
  for (const [hx, hy] of s.hands?.(d, p) ?? defaultHands(d, p)) {
    img.rect(hx, hy, 2, 2, r.b);
    img.set(hx + 1, hy + 1, r.d1);
  }
}

// ---------------------------------------------------------------------------------------
// outfit: torso, sleeves, legs or robe, shoes

function legs(img: Off, d: HDir, p: HPose, pants: Ramp, shoes: Ramp) {
  const hip = 24 + p.bob;
  if (d === 'right') {
    const front = 12 + (p.step !== 0 ? 2 : 0);
    const backX = 11 - (p.step !== 0 ? 2 : 0);
    const pair = p.step === 0 ? [11] : [backX, front];
    for (const [k, lx] of pair.entries()) {
      const isBack = pair.length > 1 && k === 0;
      for (let y = hip; y < 28; y++) for (let i = 0; i < 3; i++) img.set(lx + i, y, sh(pants, isBack ? 0.25 : 0.55 - i * 0.12));
      img.rect(lx, 28, 4, 2, shoes.d1);
      img.set(lx + 3, 28, shoes.b);
      img.hline(lx, lx + 3, 29, shoes.d2);
    }
    return;
  }
  // front/back/diagonals: two legs; the trailing foot lifts; on diagonals the leading foot also
  // slides one pixel along the facing.
  const lift = (side: number) => (p.step !== 0 && side !== p.step ? 1 : 0);
  const diag = d === 'dr' || d === 'ur';
  for (const side of [-1, 1]) {
    const slide = diag && p.step !== 0 ? (side === p.step ? 1 : -1) * (d === 'dr' ? 1 : 1) : 0;
    const lx = (side < 0 ? 9 : 12) + (diag ? (side < 0 ? 1 : 0) : 0) + slide;
    const footY = 29 - lift(side);
    for (let y = hip; y < footY - 1; y++) for (let i = 0; i < 3; i++) img.set(lx + i, y, sh(pants, 0.5 - (side > 0 ? 0.15 : 0) - i * 0.08));
    const sx = diag ? lx : side < 0 ? lx - 1 : lx;
    img.rect(sx, footY - 1, 4, 2, shoes.d1);
    img.hline(sx, sx + 3, footY - 1, shoes.b);
    img.hline(sx, sx + 3, footY, shoes.d2);
  }
  if (!diag) img.vline(12, hip, 27, pants.d2);
}

function torso(img: Off, d: HDir, p: HPose, main: Ramp, length: number, stoop: number) {
  const top = 16 + p.bob;
  const bottom = Math.min(29, length + p.bob);
  if (d === 'right') {
    for (let y = top; y < bottom; y++) {
      const flare = y > 24 + p.bob ? Math.floor((y - 24 - p.bob) / 2) : 0;
      const lean = y < top + 3 ? stoop : 0;
      for (let x = 9 - flare + lean; x < 15 + flare + lean; x++) {
        if (y === top && (x === 9 + lean || x === 14 + lean)) continue;
        img.set(x, y, sh(main, 0.6 - (x - 9) * 0.07 - (y - top) * 0.012));
      }
    }
    const ax = 11 + p.step * -2 + stoop;
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
      let v = 0.62 - (x - 8) * 0.045 - (y - top) * 0.012;
      if (d === 'dr' && x > 13) v -= 0.1; // the far side turns away
      if (d === 'ur' && x < 10) v -= 0.08;
      img.set(x, y, sh(main, v));
    }
  }
  const swing = front(d) ? p.step : -p.step;
  for (let y = top; y < top + 5; y++) {
    const sw = y > top + 2 ? swing : 0;
    if (d === 'ur') {
      img.set(7, y - sw, main.b);
    } else {
      img.set(6, y - sw, main.l1);
      img.set(7, y - sw, main.b);
    }
    if (d === 'dr') {
      img.set(16, y + sw, main.d1);
    } else {
      img.set(16, y + sw, main.d1);
      img.set(17, y + sw, main.d2);
    }
  }
}

function robeFeet(img: Off, d: HDir, p: HPose, shoes: Ramp) {
  if (d === 'right') {
    img.rect(12 + p.step, 29, 4, 1, shoes.d1);
    return;
  }
  const o = d === 'dr' ? 1 : 0;
  if (p.step <= 0) img.rect(8 + o + (p.step < 0 ? 0 : 1), 29, 3, 1, shoes.d1);
  if (p.step >= 0) img.rect(13 + o - (p.step > 0 ? 0 : 1), 29, 3, 1, shoes.d1);
}

// ---------------------------------------------------------------------------------------
// hair

function drawHair(img: Off, d: HDir, p: HPose, s: HumanSpec, t: number) {
  const r = ramp(s.hair);
  const px = (x: number, y: number, v: number) => img.set(x, y, sh(r, v));
  const style = s.hairStyle;
  if (style === 'hood') {
    const cloth = ramp(s.hair);
    for (let j = -2; j < 14; j++)
      for (let i = -2; i < 12; i++) {
        if (j === -2 && (i < 2 || i > 7)) continue;
        if (j === -1 && (i < 0 || i > 9)) continue;
        if (i < -1 || i > 10) {
          if (!(j > 1 && j < 12 && ((d === 'right' && i === -2) || (d === 'dr' && i === -2)))) continue;
        }
        if ((i === -1 || i === 10) && j < 0) continue;
        let face = false;
        if (d === 'down') face = i >= 0 && i <= 9 && j >= 3 && j <= 10;
        else if (d === 'dr') face = i >= 2 && i <= 10 && j >= 3 && j <= 10;
        else if (d === 'right') face = i >= 6 && j >= 3 && j <= 10;
        if (face) continue;
        if (d === 'right' && i > 9 && j > 1) continue;
        if (j > 11 && (i < 1 || i > 8)) continue;
        img.set(7 + i, t + j, sh(cloth, 0.7 - (i + 1) * 0.04 - (j + 2) * 0.02));
      }
    if (back(d)) {
      img.set(12, t + 12, cloth.d2);
      img.set(12, t + 13, cloth.d2);
    }
    return;
  }
  if (style === 'bald') {
    // a fringe of white hair around the back and sides; scalp shows
    const band = (x0: number, x1: number, y0: number, y1: number, v: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, v - (x - x0) * 0.04);
    };
    if (d === 'down') {
      band(7, 7, t + 3, t + 6, 0.6);
      band(16, 16, t + 3, t + 6, 0.35);
    } else if (d === 'dr') {
      band(7, 8, t + 4, t + 7, 0.55);
    } else if (d === 'right') {
      band(7, 9, t + 4, t + 7, 0.55);
    } else {
      band(7, d === 'ur' ? 14 : 16, t + 5, t + 8, 0.55);
    }
    return;
  }
  const cap = (fringe: number) => {
    for (let j = -1; j < fringe; j++)
      for (let i = -1; i < 11; i++) {
        if (j === -1 && (i < 2 || i > 7)) continue;
        if (j === 0 && (i < 0 || i > 9)) continue;
        if ((i === -1 || i === 10) && j < 1) continue;
        px(7 + i, t + j, 0.75 - (i + 1) * 0.04 - j * 0.05 + (j === -1 ? 0.15 : 0));
      }
  };
  if (d === 'down') {
    cap(3);
    for (let i = 0; i < 10; i += 2) px(7 + i + (i % 4 === 0 ? 1 : 0), t + 3, 0.35);
    for (let j = 3; j < 6; j++) {
      px(7, t + j, 0.5);
      px(16, t + j, 0.2);
    }
  } else if (d === 'dr') {
    cap(3);
    for (let i = 4; i < 10; i += 2) px(7 + i + (i % 4 === 0 ? 1 : 0), t + 3, 0.35);
    for (let j = 2; j < 8; j++) for (let i = -1; i < 2; i++) px(7 + i, t + j, 0.55 - i * 0.05 - j * 0.03);
    px(16, t + 3, 0.2);
    px(16, t + 4, 0.2);
  } else if (d === 'right') {
    cap(2);
    for (let j = 2; j < 8; j++) for (let i = -1; i < 4; i++) px(7 + i, t + j, 0.55 - i * 0.05 - j * 0.03);
    px(14, t + 2, 0.4);
    px(15, t + 2, 0.35);
  } else {
    for (let j = -1; j < 10; j++)
      for (let i = -1; i < 11; i++) {
        if (j === -1 && (i < 2 || i > 7)) continue;
        if ((i === -1 || i === 10) && (j < 1 || j > 7)) continue;
        if (j >= 8 && (i < 1 || i > 8)) continue;
        if (d === 'ur' && i >= 8 && j >= 4) continue; // cheek + ear show on the right
        px(7 + i, t + j, 0.7 - (i + 1) * 0.04 - j * 0.03 + ((i + j) % 3 === 0 ? -0.1 : 0));
      }
  }
  if (style === 'bun') {
    const bx = d === 'down' ? 12 : d === 'dr' ? 10 : d === 'right' ? 8 : d === 'ur' ? 11 : 12;
    const by = d === 'up' ? t + 1 : d === 'ur' ? t : t - 2 + (d === 'right' ? 1 : 0);
    img.ellipse(bx, by, 3, 2.4, (_x, _y, nx, ny) => sh(r, 0.65 - nx * 0.3 - ny * 0.3));
  }
}

// ---------------------------------------------------------------------------------------

function layer(fn: (o: Off) => void, darken: number, skip: ('up' | 'down' | 'left' | 'right')[] = []): Img {
  const o = new Off();
  fn(o);
  const pl = o.plain();
  pl.outline({ darken, skip });
  return pl;
}

export function drawHuman(s: HumanSpec, dir: DrawnDir, f: FrameIndex): Img {
  const d = hdir(dir);
  const p = hpose(f);
  const stoop = s.stoop ?? 0;
  const t = 6 + p.bob + (stoop ? 1 : 0);
  const main = ramp(s.top);
  const out = new Img(32, 40);
  const layers: Img[] = [];
  if (s.under) layers.push(layer((o) => s.under!(o, d, p), 0.62));
  // head shifts forward a pixel for a stoop when seen from the side
  const hx = d === 'right' ? stoop : d === 'dr' ? (stoop ? 1 : 0) : 0;
  layers.push(
    layer((o) => {
      const sub = new Off();
      drawBody(sub, d, p, s, t);
      if (s.hairStyle === 'bald') drawHair(sub, d, p, s, t); // fringe is part of the head (no own outline)
      // shift head+hands by hx (blit with offset)
      for (let y = 0; y < 40; y++)
        for (let x = 0; x < 32; x++) {
          const c = sub.get(x, y);
          if (c[3]) o.set(x + hx - OX, y - OY, c);
        }
    }, 0.62),
  );
  layers.push(
    layer(
      (o) => {
        if (s.robe) {
          torso(o, d, p, main, 29, stoop);
          robeFeet(o, d, p, ramp(s.shoes));
          if (p.step !== 0 && d !== 'right') o.set(p.step < 0 ? 6 : 17, 28 + p.bob, main.d1);
        } else {
          legs(o, d, p, ramp(s.legs), ramp(s.shoes));
          torso(o, d, p, main, 24, stoop);
        }
        s.detail?.(o, d, p, main);
      },
      0.65,
      ['up'],
    ),
  );
  layers.push(
    layer((o) => {
      const sub = new Off();
      if (s.hairStyle !== 'bald') drawHair(sub, d, p, s, t);
      for (let y = 0; y < 40; y++)
        for (let x = 0; x < 32; x++) {
          const c = sub.get(x, y);
          if (c[3]) o.set(x + hx - OX, y - OY, c);
        }
    }, 0.6),
  );
  if (s.over) layers.push(layer((o) => s.over!(o, d, p), 0.6));
  for (const l of layers) out.blit(l, 0, 0);
  groundShadow(out, 6);
  return out;
}

export { ramp, mix, sh };
