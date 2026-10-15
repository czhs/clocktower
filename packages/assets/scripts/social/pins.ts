// Map pins (teardrop marker with a round socket for the dropper's head icon), the pin's ground
// shadow and the little "drop" sparkle played when a pin lands.
import { PIN_COLORS, type PinColor } from '@ct/protocol';
import { col, Img, mix, ramp, type Color, type RGBA } from '../lib/img.js';
import { ICON, inDisc } from './icons.js';

export const PIN_W = 18;
export const PIN_H = 26;
/** Head circle centre / radius (frame px). The icon disc sits in its middle. */
const HC = 9;
const HR = 9;
export const PIN_ICON = { x: HC, y: HC, r: ICON / 2, left: HC - ICON / 2, top: HC - ICON / 2 };
/** Bottom pixel of the needle tip: put this pixel on the marked spot. */
export const PIN_ANCHOR = { x: 8, y: PIN_H - 1 };

/** Base colours: muted-saturated, hue-spaced so they never get confused (also at night). */
export const PIN_BASE: Record<PinColor, string> = {
  gold: '#e6b632',
  crimson: '#c42c3c',
  violet: '#8a52cc',
  teal: '#22a6b4',
  green: '#5cb23a',
  orange: '#e8701e',
  white: '#ece6da',
  black: '#2c2636',
};

interface PinPal {
  o: RGBA;
  d2: RGBA;
  d1: RGBA;
  b: RGBA;
  l1: RGBA;
  l2: RGBA;
  spec: RGBA;
}
function pinPal(c: PinColor): PinPal {
  if (c === 'black')
    return { o: col('#5e5672'), d2: col('#110d16'), d1: col('#1c1724'), b: col('#2a2434'), l1: col('#443c52'), l2: col('#6c6280'), spec: col('#b4aac8') };
  if (c === 'white') return { o: col('#2a2030'), d2: col('#8c8094'), d1: col('#b6aab0'), b: col('#ece6da'), l1: col('#f8f4ea'), l2: col('#fffdf6'), spec: col('#ffffff') };
  const r = ramp(PIN_BASE[c]);
  return { ...r, spec: mix(PIN_BASE[c], '#fffbef', 0.75) };
}

/** Teardrop mask: head circle + a cone whose apex is the anchor pixel. */
function pinMask(): boolean[][] {
  const m: boolean[][] = [];
  const d = PIN_ANCHOR.y + 0.9 - HC; // centre -> apex
  const a = Math.acos(HR / d);
  const tx = HR * Math.sin(a);
  const ty = HC + HR * Math.cos(a);
  const ax = PIN_ANCHOR.x + 0.5;
  const ay = PIN_ANCHOR.y + 0.9;
  for (let y = 0; y < PIN_H; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < PIN_W; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let inside = (px - HC) ** 2 + (py - HC) ** 2 <= HR * HR - 0.6;
      if (!inside && py >= ty && py <= ay) {
        const t = (py - ty) / (ay - ty);
        const l = HC - tx + (ax - (HC - tx)) * t;
        const r = HC + tx + (ax - (HC + tx)) * t;
        inside = px >= l - 0.15 && px <= r + 0.15;
      }
      row.push(inside);
    }
    m.push(row);
  }
  // the very tip: exactly one pixel
  for (let x = 0; x < PIN_W; x++) m[PIN_ANCHOR.y]![x] = x === PIN_ANCHOR.x;
  return m;
}
const MASK = pinMask();

const BACK = col('#efe2c2');

export function drawPin(c: PinColor): Img {
  const p = pinPal(c);
  const img = new Img(PIN_W, PIN_H);
  const M = (x: number, y: number) => x >= 0 && y >= 0 && x < PIN_W && y < PIN_H && MASK[y]![x]!;
  const sock = (x: number, y: number) => inDisc(x - PIN_ICON.left, y - PIN_ICON.top);
  for (let y = 0; y < PIN_H; y++)
    for (let x = 0; x < PIN_W; x++) {
      if (!M(x, y)) continue;
      const edge = !M(x - 1, y) || !M(x + 1, y) || !M(x, y - 1) || !M(x, y + 1);
      if (edge) {
        img.set(x, y, p.o);
        continue;
      }
      if (sock(x, y)) {
        img.set(x, y, BACK);
        continue;
      }
      const dx = x + 0.5 - HC;
      const dy = y + 0.5 - HC;
      const r = Math.hypot(dx, dy);
      let cc: Color;
      if (y + 0.5 > HC + 6.2 && r > HR - 1.2) {
        // cone: lit from the left
        cc = x < PIN_ANCHOR.x - 1 ? p.b : x <= PIN_ANCHOR.x ? p.d1 : p.d2;
        if (y === PIN_ANCHOR.y - 4 && x === PIN_ANCHOR.x - 2) cc = p.l1;
      } else {
        // ring around the socket: light from the upper left
        const v = -(dx * 0.62 + dy * 0.78) / Math.max(1, r);
        cc = v > 0.55 ? p.l1 : v > -0.15 ? p.b : v > -0.65 ? p.d1 : p.d2;
        // inset bevel: the socket's upper-left lip is shadowed, the lower-right lip catches light
        const nearSock = sock(x + 1, y) || sock(x, y + 1) || sock(x - 1, y) || sock(x, y - 1);
        if (nearSock && v > 0.35) cc = p.d1;
        else if (nearSock && v < -0.55) cc = p.l1;
      }
      img.set(x, y, cc);
    }
  // specular glints on the upper-left of the ring
  img.set(4, 3, p.spec);
  img.set(3, 4, p.l2);
  img.set(5, 2, p.l2);
  return img;
}

/** Soft plum ground shadow under the tip (partial alpha). */
export function pinShadow(): Img {
  const img = new Img(12, 5);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const nx = (x + 0.5 - 6) / 6;
      const ny = (y + 0.5 - 2.5) / 2.5;
      const d = nx * nx + ny * ny;
      if (d >= 1) continue;
      img.set(x, y, [16, 8, 26, Math.round(150 * Math.min(1, (1 - d) * 1.6))]);
    }
  return img;
}
export const PIN_SHADOW_ANCHOR = { x: 6, y: 2 };

/** Landing sparkle: dust kicked out along the ground + a fan of twinkles, then fading. */
export const DROP_W = 26;
export const DROP_H = 16;
export const DROP_ANCHOR = { x: 13, y: 12 };
const SPARK: RGBA[] = [col('#fffaea'), col('#ffe08a'), col('#d9a23a')];
const DUST: RGBA[] = [col('#efe4c8'), col('#c8b898'), col('#8f8068')];
export function pinDrop(f: number): Img {
  const img = new Img(DROP_W, DROP_H);
  const { x: ax, y: ay } = DROP_ANCHOR;
  // dust puffs left and right of the tip
  const dd = [3, 5, 7, 8][f]!;
  for (const s of [-1, 1]) {
    const x = ax + s * dd - (s < 0 ? 1 : 0);
    if (f === 0) {
      img.set(x, ay, DUST[0]!);
      img.set(x + s, ay, DUST[1]!);
    } else if (f === 1) {
      img.set(x, ay - 1, DUST[0]!);
      img.set(x + s, ay, DUST[0]!);
      img.set(x, ay, DUST[1]!);
      img.set(x + 2 * s, ay, DUST[1]!);
    } else if (f === 2) {
      img.set(x + s, ay - 1, DUST[1]!);
      img.set(x + 2 * s, ay, DUST[2]!);
    } else img.set(x + 2 * s, ay - 1, DUST[2]!);
  }
  if (f === 0) {
    // the impact flash: a little four-point star just above the tip
    const x = ax - 1;
    const y = ay - 3;
    img.set(x, y, SPARK[0]!);
    for (const [ox, oy, k] of [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [2, 0, 2],
      [-2, 0, 2],
      [0, -2, 2],
    ] as const)
      img.set(x + ox, y + oy, SPARK[k]!);
    return img;
  }
  // twinkles in an upward fan
  const r = [4, 7, 9, 10][f]!;
  [-150, -112, -68, -30].forEach((deg, k) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.round(ax - 0.5 + Math.cos(a) * r * 1.15);
    const y = Math.round(ay - 3 + Math.sin(a) * r * 0.8);
    if (f <= 1 && k % 3 === 0) {
      img.set(x, y, SPARK[0]!);
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        img.set(x + ox, y + oy, SPARK[f === 0 ? 1 : 2]!);
    } else if (f <= 2) {
      img.set(x, y, SPARK[f === 2 ? 1 : 0]!);
      if (f === 1) img.set(x, y + 1, SPARK[2]!);
    } else if (k % 3 === 0) img.set(x, y, SPARK[2]!);
  });
  return img;
}

export function buildPins(): [string, Img][] {
  const out: [string, Img][] = [];
  for (const c of PIN_COLORS) out.push([`pin_${c}`, drawPin(c)]);
  out.push(['pin_shadow', pinShadow()]);
  for (let f = 0; f < 4; f++) out.push([`pin_drop_${f}`, pinDrop(f)]);
  return out;
}
