// Building sprites drawn in 3/4 view with a fixed front: 15 distinct cottages (each one player's
// home), the clock tower landmark, plus legacy chapel support. Each sprite's bottom-left corner sits
// at the bottom-left of the building footprint; the sprite may extend above the footprint (roof,
// chimney, spire).
//
// Every cottage also exports its front door (rect + hinge side), a cut-out of the closed door leaf
// and an "open doorway" image of the same size, so the client can swing the door open when the
// local player walks up, and the top of its chimney so the client can puff smoke from it.
//
// SECRECY: nothing here depends on who lives in or is inside a cottage. All cottages carry the same
// kinds of lights (windows + door lamp); the doorway art is identical in kind for every house.
import type { BuildingDef } from '@ct/protocol';
import { townLayout, townMap, TS, type BuildingStyle } from '../src/layout.js';
import { planks, stonework } from './lib/draw.js';
import { bayer, type Color, dpick, hash, Img, mix, toHex, vnoise } from './lib/img.js';
import { HOUSE_ART } from './houses/index.js';

export interface DoorRect {
  /** Door leaf rect in sprite coords (the hole the leaf fills). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Side the leaf is hinged on (it swings inward around this edge). */
  hinge: 'left' | 'right';
}

export interface BuildingSprite {
  img: Img;
  /** Glow points in sprite coords (windows, door lamps) for night facade lights. */
  windows: { x: number; y: number }[];
  /** Front door (cottages only; null for landmarks). */
  door: DoorRect | null;
  /** Top centre of the chimney opening in sprite coords (client adds smoke); null = no chimney. */
  chimney: { x: number; y: number } | null;
  /** Closed door leaf (door.w x door.h), cut from the final sprite; transparent outside the leaf. */
  leaf: Img | null;
  /** Open doorway (door.w x door.h): dark interior + hearth glow + leaf swung against the jamb. */
  doorway: Img | null;
  /** (v2.1) Clock tower only: the dial centre + radius (sprite coords); the client draws live hands. */
  clock?: { x: number; y: number; r: number };
}

export const EXTRA: Record<string, number> = { house: 16, shop: 16, tavern: 20, chapel: 104, clocktower: 80 };

export const ROOFS: Record<string, string[]> = {
  slate: ['#16172a', '#1f2236', '#292e45', '#353c58', '#444d6c', '#565f80'],
  red: ['#260f12', '#3a1618', '#521e1c', '#6a2a24', '#82382e', '#9a4a3a'],
  moss: ['#141c1a', '#1c2622', '#25312a', '#303e34', '#3e4c3e', '#4e5c48'],
  thatch: ['#2e2210', '#463416', '#5e471e', '#785c28', '#927234', '#ac8a44'],
  blue: ['#0f1924', '#152331', '#1c2e3f', '#253b4f', '#304a60', '#3e5c74'],
  plum: ['#1c1220', '#271a2e', '#33233c', '#402d4c', '#4f395e', '#604872'],
};
export const WALLS: Record<string, string[]> = {
  timber: ['#5e5446', '#766a58', '#8c806a', '#a0947c', '#b2a68e'],
  stone: ['#2c2a30', '#3a373e', '#49454c', '#58535a', '#68626a'],
  plaster: ['#5c5850', '#726d62', '#8a8476', '#a09a8a', '#b4ae9c'],
  brick: ['#3a1c1c', '#4c2424', '#5e2e2a', '#723a32', '#86483c'],
  planks: ['#24180f', '#332217', '#432d1f', '#533828', '#634432'],
};
export const BEAM = ['#1a110c', '#271a12', '#36241a', '#462f22'];
export const STONE = ['#24212c', '#312d3a', '#3f3a48', '#4e4858', '#5f5869', '#726a7a'];
/** Pale dressed stone for door surrounds and steps (high contrast against every wall). */
export const DSTONE = ['#3a3138', '#574b4e', '#786a69', '#9a8a7c', '#bba891', '#d9c8a8'];
export const GLASS = ['#7a3e1a', '#c06a24', '#eda040', '#ffd27a', '#fff0c0'];
export const IRON = ['#0f0d14', '#1b1822', '#2a2632', '#3c3746'];
export const BRASS = ['#3a2a10', '#5e4518', '#8a6a24', '#b8913a', '#e0c060'];
export const LEAF = ['#122016', '#1c3220', '#28482a', '#3a6232', '#567e3e'];
export const CLAY = ['#3a1a12', '#62301e', '#8a4a2a', '#b06a3a', '#d08a52'];
export const LOG = ['#2a1a10', '#4a3020', '#6e4a2e', '#9a7048', '#c8a070'];
/** Doorway interior: dark room, warm hearth light. */
export const ROOM = ['#0a060c', '#160c14', '#2a1216', '#4e2018', '#84401e', '#c0702c'];
export const FLOOR = ['#120808', '#26140c', '#442412', '#6e3c1a', '#a2602a', '#d4924a'];

// ---------------------------------------------------------------------------------------
// Per-cottage personality (indexed by houseIndex). Pure decoration: never tied to occupants.

export type Hood = 'pent' | 'arch' | 'lintel';
export type DoorKind = 'planks' | 'panel' | 'window' | 'dutch';
export type Extra = 'ivy' | 'pots' | 'woodpile' | 'herbs' | 'cat' | 'barrel' | 'dormer' | 'vane' | 'wreath' | 'twopots' | 'birds';
export interface Persona {
  hood: Hood;
  door: DoorKind;
  hinge: 'left' | 'right';
  extras: Extra[];
}
export const P = (hood: Hood, door: DoorKind, hinge: 'left' | 'right', ...extras: Extra[]): Persona => ({ hood, door, hinge, extras });
export const PERSONAS: Persona[] = [
  P('pent', 'panel', 'left', 'ivy', 'pots', 'twopots'),
  P('lintel', 'planks', 'right', 'woodpile', 'herbs'),
  P('arch', 'window', 'left', 'cat', 'barrel'),
  P('pent', 'dutch', 'right', 'dormer', 'pots'),
  P('lintel', 'planks', 'left', 'ivy', 'vane', 'barrel'),
  P('arch', 'panel', 'right', 'woodpile', 'cat', 'wreath'),
  P('pent', 'window', 'left', 'dormer', 'barrel', 'birds'),
  P('arch', 'planks', 'right', 'herbs', 'pots', 'vane'),
  P('lintel', 'dutch', 'left', 'cat', 'woodpile', 'twopots'),
  P('pent', 'panel', 'right', 'ivy', 'dormer'),
  P('arch', 'window', 'left', 'barrel', 'pots', 'birds'),
  P('lintel', 'planks', 'right', 'pots', 'vane', 'herbs'),
  P('pent', 'panel', 'left', 'dormer', 'woodpile', 'wreath'),
  P('arch', 'dutch', 'right', 'ivy', 'cat', 'twopots'),
  P('lintel', 'window', 'left', 'barrel', 'herbs', 'birds'),
];

// ---------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------
// Small local painters. "Local" images are drawn upright and then placed into the sprite through
// a transform T(i, j) -> sprite (x, y), which lets the same door / window art sit on the camera-
// facing front (identity) or on an oblique side wall (2:1 shear, rising away from the viewer).

export type Tf = (i: number, j: number) => [number, number];

/** Copy the opaque pixels of a local image into `dst` through T. */
export function place(dst: Img, local: Img, T: Tf) {
  for (let j = 0; j < local.h; j++)
    for (let i = 0; i < local.w; i++) {
      const c = local.get(i, j);
      if (c[3] === 0) continue;
      const [x, y] = T(i, j);
      dst.set(x, y, c);
    }
}

/** Leaf shape: rectangle, optionally with a rounded (3-row) top. */
export function leafIn(w: number, h: number, arched: boolean) {
  const r = w / 2;
  const ar = Math.min(4, Math.ceil(w / 3));
  return (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    if (!arched || j >= ar) return true;
    return Math.hypot(i + 0.5 - r, (j + 0.5 - ar) * (r / ar)) <= r + 0.05;
  };
}

export interface DoorSpec {
  w: number;
  h: number;
  arched: boolean;
  kind: DoorKind;
  hinge: 'left' | 'right';
  paint: string;
  wreath: boolean;
  seed: number;
}

/** The closed door leaf, upright, w x h (transparent outside the leaf shape). */
export function paintLeaf(d: DoorSpec): Img {
  const { w, h } = d;
  const img = new Img(w, h);
  const inLeaf = leafIn(w, h, d.arched);
  const base = mix(d.paint, '#fff1cc', 0.1);
  const pal = [mix(base, '#0b0714', 0.62), mix(base, '#160d2a', 0.38), base, mix(base, '#fff1cc', 0.2), mix(base, '#fff6e0', 0.38)];
  const latchLeft = d.hinge === 'right';
  const mid = Math.floor(h / 2);
  const pw = w >= 10 ? 3 : 2; // plank width
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inLeaf(i, j)) continue;
      let v = 0.5;
      const lu = i % pw;
      if (d.kind === 'planks' || d.kind === 'window' || d.kind === 'dutch') {
        v = 0.5 + (lu === 0 ? 0.14 : 0) + (hash(Math.floor(i / pw), 3, d.seed) - 0.5) * 0.16;
        if (lu === pw - 1) v = 0.14;
      }
      if (d.kind === 'panel') {
        // two tall recessed panels per side, framed by lighter stiles and rails
        const ci = i < w / 2 ? i - 2 : i - Math.ceil(w / 2) - 1;
        const pwid = Math.max(1, Math.floor(w / 2) - 3);
        const inPx = ci >= 0 && ci < pwid;
        const r1 = j >= 4 && j < mid - 1;
        const r2 = j >= mid + 1 && j < h - 3;
        if (inPx && (r1 || r2)) {
          const top = r1 ? j === 4 : j === mid + 1;
          v = 0.36 + (top || ci === 0 ? -0.18 : 0) + (ci === pwid - 1 ? 0.14 : 0);
        } else v = 0.62;
      }
      if (d.kind === 'dutch') {
        if (j === mid) v = 0.08;
        if (j === mid + 1) v = 0.85; // the little ledge of the lower half
      }
      v -= j / (h * 6);
      if (i === 0) v += 0.1;
      if (i === w - 1) v -= 0.12;
      img.set(i, j, dpick(pal, v, i, j));
    }
  if (d.kind === 'window') {
    // small glowing pane high in the door
    const gw = Math.max(2, w - 6);
    const gx = Math.floor((w - gw) / 2);
    const gy = d.arched ? 4 : 3;
    for (let j = 0; j < 4; j++) for (let i = 0; i < gw; i++) img.set(gx + i, gy + j, dpick(GLASS, 0.85 - j * 0.12, gx + i, gy + j));
    if (gw >= 4) img.vline(gx + Math.floor(gw / 2), gy, gy + 3, pal[0]!);
    img.hline(gx - 1, gx + gw, gy - 1, pal[0]!);
    img.hline(gx - 1, gx + gw, gy + 4, pal[0]!);
  }
  // iron strap hinges (plank doors) on the hinge side
  if (d.kind !== 'panel') {
    for (const y of [Math.max(3, Math.round(h * 0.22)), h - 5]) {
      const len = Math.ceil(w * 0.55);
      for (let k = 0; k < len; k++) {
        const x = latchLeft ? w - 1 - k : k;
        if (inLeaf(x, y)) img.set(x, y, k === len - 1 ? IRON[3]! : IRON[1]!);
      }
    }
  }
  // brass latch / knob on the latch side
  const kx = latchLeft ? 1 : w - 2;
  img.set(kx, mid + 1, BRASS[4]!);
  img.set(kx, mid + 2, BRASS[2]!);
  if (w >= 10) img.set(latchLeft ? kx + 1 : kx - 1, mid + 1, BRASS[1]!);
  if (d.wreath && w >= 10) {
    const cx = w / 2;
    const cy = Math.round(h * 0.3);
    img.ellipse(cx, cy, 3, 3, (x, y, nx, ny) => (nx * nx + ny * ny < 0.25 ? null : dpick(LEAF, 0.65 - ny * 0.4, x, y)));
    img.set(Math.floor(cx), cy + 2, '#c0304a');
    img.set(Math.floor(cx) - 1, cy + 2, '#a02038');
    img.set(Math.floor(cx) - 2, cy - 1, '#e04a50');
    img.set(Math.floor(cx) + 1, cy - 2, '#e04a50');
  }
  // the recess: the top of the leaf sits in the frame's shadow
  for (let i = 0; i < w; i++)
    for (let j = 0; j < 2; j++) {
      let jj = j;
      while (jj < h && !inLeaf(i, jj)) jj++;
      if (jj + (j === 0 ? 0 : 0) < h && inLeaf(i, jj)) img.tint(i, jj + 0, '#05030a', j === 0 ? 0.45 : 0);
    }
  return img;
}

/** The open doorway, upright, w x h: dark room, hearth glow, the leaf swung in against the jamb. */
export function paintDoorway(d: DoorSpec): Img {
  const { w, h } = d;
  const img = new Img(w, h);
  const inLeaf = leafIn(w, h, d.arched);
  const hingeLeft = d.hinge === 'left';
  const gx = hingeLeft ? w * 0.64 : w * 0.36; // the hearth sits across the room from the hinge
  const gy = h - 6;
  const floorTop = h - 4;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inLeaf(i, j)) continue;
      const dist = Math.hypot((i + 0.5 - gx) / (w * 0.55), (j + 0.5 - gy) / (h * 0.45));
      const warm = Math.max(0, 1 - dist);
      let c: Color;
      if (j >= floorTop) {
        // floorboards running into the room, lit by the fire
        const seam = (i + (j - floorTop) * 2) % 4 === 0;
        c = dpick(FLOOR, 0.18 + warm * 0.7 + (j - floorTop) * 0.06 - (seam ? 0.12 : 0), i, j);
      } else {
        c = dpick(ROOM, 0.06 + warm * warm * 0.95 + (j > floorTop - 2 ? 0.05 : 0), i, j);
      }
      img.set(i, j, c);
    }
  // the hearth on the back wall: a small fire-box with flames
  const hx = Math.round(gx);
  const hw = Math.max(3, Math.round(w * 0.36));
  const hx0 = hx - Math.floor(hw / 2);
  for (let i = -1; i <= hw; i++) img.set(hx0 + i, gy - 3, inLeaf(hx0 + i, gy - 3) ? STONE[4]! : img.get(hx0 + i, gy - 3));
  for (let j = gy - 2; j <= gy + 1; j++)
    for (let i = 0; i < hw; i++) {
      const x = hx0 + i;
      if (!inLeaf(x, j)) continue;
      const f = j - (gy - 2);
      const centre = Math.abs(i + 0.5 - hw / 2) / (hw / 2);
      img.set(x, j, f >= 2 - (centre < 0.5 ? 1 : 0) ? (centre < 0.4 ? '#ffe9a0' : '#ffb43a') : f >= 1 && centre < 0.7 ? '#e8862e' : '#2a0e0a');
    }
  img.set(hx0 - 1, gy - 2, STONE[3]!);
  img.set(hx0 + hw, gy - 2, STONE[2]!);
  // light spilling onto the floor toward the door
  for (let i = 0; i < w; i++) img.blend(i, h - 1, '#ffb060', 0.18);
  // the leaf, swung inward against the hinge-side jamb: a narrow foreshortened strip
  const base = mix(d.paint, '#0b0714', 0.35);
  const lw = Math.max(2, Math.round(w / 4));
  for (let j = 0; j < h; j++) {
    let start = -1;
    for (let k = 0; k < w; k++) {
      const x = hingeLeft ? k : w - 1 - k;
      if (inLeaf(x, j)) {
        start = k;
        break;
      }
    }
    if (start < 0) continue;
    for (let k = 0; k < lw; k++) {
      const x = hingeLeft ? start + k : w - 1 - start - k;
      const edge = k === lw - 1;
      let c: Color = mix(base, '#0b0714', k === 0 ? 0.35 : 0.1);
      if (edge) c = mix(d.paint, '#ffb060', 0.35); // the free edge catches the firelight
      if (j === Math.max(3, Math.round(h * 0.22)) || j === h - 5) c = k === 0 ? IRON[1]! : mix(c, IRON[2]!, 0.5);
      img.set(x, j, c);
    }
  }
  // the head of the doorway is in shadow
  for (let i = 0; i < w; i++) {
    let jj = 0;
    while (jj < h && !inLeaf(i, jj)) jj++;
    img.tint(i, jj, '#05030a', 0.55);
    img.tint(i, jj + 1, '#05030a', 0.3);
  }
  return img;
}

/** Window (glass + mullions + frame, optional shutters), upright. Returns the local image. */
export function paintWindow(style: BuildingStyle, wide: number, tall: number, shutters: boolean, seed: number): Img {
  const sh = shutters ? 3 : 0;
  const img = new Img(wide + 2 + sh * 2, tall + 2);
  const x0 = sh + 1;
  if (shutters) {
    for (const sx of [0, x0 + wide + 1])
      for (let j = 0; j < tall; j++)
        for (let i = 0; i < 3; i++) {
          const slat = j % 3 === 0;
          img.set(sx + i, 1 + j, mix(style.shutters, slat ? '#0b0714' : '#fff1cc', slat ? 0.4 : i === (sx === 0 ? 0 : 2) ? 0.22 : 0.06));
        }
  }
  img.rect(x0 - 1, 0, wide + 2, tall + 2, BEAM[0]!);
  for (let j = 0; j < tall; j++)
    for (let i = 0; i < wide; i++) {
      const v = 0.88 - j / (tall * 1.7) - Math.abs(i + 0.5 - wide / 2) / (wide * 2.4) + (hash(i, j, seed) < 0.05 ? 0.15 : 0);
      img.set(x0 + i, 1 + j, dpick(GLASS, v, x0 + i, 1 + j));
    }
  if (wide >= 6) img.vline(x0 + Math.floor(wide / 2) - (wide % 2 === 0 ? 1 : 0), 1, tall, BEAM[1]!);
  if (tall >= 6) img.hline(x0, x0 + wide - 1, 1 + Math.floor(tall / 2), BEAM[1]!);
  return img;
}

export function wallLantern(img: Img, x: number, y: number, armLeft: boolean) {
  // bracket arm from the wall, a little iron lantern with a warm pane
  if (armLeft) img.hline(x - 3, x, y - 7, IRON[2]!);
  else img.hline(x + 1, x + 4, y - 7, IRON[2]!);
  img.rect(x - 1, y - 6, 4, 1, IRON[1]!);
  img.rect(x, y - 7, 2, 1, IRON[1]!);
  img.rect(x - 1, y - 5, 4, 4, GLASS[3]!);
  img.set(x, y - 4, GLASS[4]!);
  img.set(x + 1, y - 4, GLASS[4]!);
  img.vline(x + 2, y - 5, y - 2, GLASS[2]!);
  img.rect(x - 1, y - 1, 4, 1, IRON[1]!);
  img.set(x, y, IRON[1]!);
  img.set(x + 1, y, IRON[1]!);
}

// ---------------------------------------------------------------------------------------
// Walls, timber, roofs

export function wallTexture(img: Img, x0: number, y0: number, w: number, h: number, kind: string, seed: number) {
  const pal = WALLS[kind]!;
  if (kind === 'stone') {
    stonework(img, x0, y0, w, h, pal, '#18161c', { rh: 5, sw: 8, seed, shade: (i) => (i < 3 ? 0.15 : i > w - 4 ? -0.15 : 0) });
    return;
  }
  if (kind === 'brick') {
    stonework(img, x0, y0, w, h, pal, '#1e1012', { rh: 3, sw: 6, seed, shade: (i) => (i < 3 ? 0.15 : i > w - 4 ? -0.15 : 0) });
    return;
  }
  if (kind === 'planks') {
    planks(img, x0, y0, w, h, pal, { vertical: true, size: 4, seed });
    return;
  }
  // plaster / timber infill
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const y = y0 + j;
      let v = 0.58 + (vnoise(x, y, 6, seed) - 0.5) * 0.3 + (i < 3 ? 0.12 : 0) - (i > w - 4 ? 0.15 : 0);
      if (hash(x, y, seed + 1) < 0.03) v -= 0.22;
      img.set(x, y, dpick(pal, v, x, y));
    }
  if (kind === 'plaster' && w > 30) {
    // a patch of exposed brick where the plaster fell away
    const px = x0 + 3 + Math.floor(hash(seed, 1, 2) * (w - 14));
    stonework(img, px, y0 + 3, 7, 5, WALLS.brick!, '#3a2a28', { rh: 3, sw: 4, seed: seed + 3 });
  }
}

export function timberFrame(img: Img, x0: number, y0: number, w: number, h: number, avoid: { x: number; w: number }[], seed: number) {
  const beam = (x: number, y: number, ww: number, hh: number) => {
    for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) img.set(x + i, y + j, dpick(BEAM, 0.6 + (i === 0 || j === 0 ? 0.3 : 0) + (hash(x + i, y + j, 5) - 0.5) * 0.3, x + i, y + j));
  };
  beam(x0, y0, w, 2);
  beam(x0, y0 + Math.floor(h / 2) - 1, w, 2);
  beam(x0, y0, 2, h);
  beam(x0 + w - 2, y0, 2, h);
  const free = (x: number, ww: number) => !avoid.some((a) => x + ww > a.x && x < a.x + a.w);
  // braces in the free panels (lower storey) and posts
  const bh = Math.floor(h / 2) - 3;
  for (let x = x0 + 4; x < x0 + w - 4 - bh; x += bh + 4) {
    if (!free(x, bh + 1)) continue;
    const flip = hash(x, 0, seed) < 0.5;
    for (let k = 0; k < bh; k++) {
      const xx = flip ? x + bh - 1 - k : x + k;
      img.set(xx, y0 + 2 + k, BEAM[2]!);
      img.set(xx + 1, y0 + 2 + k, BEAM[1]!);
    }
  }
}

/** Hip/side roof between rows top..bottom with an inset at the top (camera-facing cottages). */
export function roof(img: Img, style: BuildingStyle, x0: number, x1: number, top: number, bottom: number, inset: number, seed: number) {
  const pal = ROOFS[style.roof]!;
  const thatch = style.roof === 'thatch';
  const H = bottom - top;
  for (let y = top; y <= bottom; y++) {
    const f = (y - top) / H;
    const ins = Math.round(inset * (1 - f));
    for (let x = x0 + ins; x <= x1 - ins; x++) {
      const ly = y - top;
      let v = 0.8 - f * 0.5;
      if (x < x0 + inset + 2 && x - x0 < (inset + 2) * (1 - f) + 3) v += 0.12;
      if (x > x1 - inset - 2 && x1 - x < (inset + 2) * (1 - f) + 3) v -= 0.2;
      v += shingle(style, x, ly, seed);
      if (style.roof === 'moss' && !thatch && vnoise(x, y, 5, seed + 9) > 0.62 && ly % 4 !== 3) {
        img.set(x, y, dpick(['#1e3220', '#2a4428', '#3a5a32', '#4a6a3a'], v, x, y));
        continue;
      }
      img.set(x, y, dpick(pal, v, x, y));
    }
  }
  for (let x = x0 + inset; x <= x1 - inset; x++) {
    img.set(x, top, pal[5]!);
    img.set(x, top + 1, pal[thatch ? 4 : 2]!);
  }
  eave(img, style, x0, x1, bottom, seed);
}

/** Shingle / thatch texture offset for a roof pixel at (x, row-from-ridge). */
export function shingle(style: BuildingStyle, x: number, ly: number, seed: number): number {
  if (style.roof === 'thatch') {
    let v = (vnoise(x * 3, ly * 0.4, 3, seed) - 0.5) * 0.45;
    if (hash(x, ly, seed) < 0.08) v -= 0.2;
    if (ly % 7 === 6) v -= 0.18; // thatch courses
    return v;
  }
  const row = Math.floor(ly / 4);
  const rl = ly % 4;
  const off = (row % 2) * 3;
  const sx = Math.floor((x + off) / 6);
  let v = (hash(sx, row, seed) - 0.5) * 0.25;
  if (rl === 3) v -= 0.35;
  else if ((x + off) % 6 === 0) v -= 0.22;
  else if (rl === 0) v += 0.08;
  if (style.roof === 'red' && rl === 2 && (x + off) % 6 === 3) v += 0.15;
  return v;
}

export function eave(img: Img, style: BuildingStyle, x0: number, x1: number, y: number, seed: number) {
  const pal = ROOFS[style.roof]!;
  for (let x = x0; x <= x1; x++) {
    if (style.roof === 'thatch') {
      const rag = hash(x, 0, seed + 4) < 0.5 ? 1 : 0;
      img.set(x, y + rag, pal[1]!);
      img.set(x, y + 1 + rag, pal[0]!);
    } else {
      img.set(x, y, pal[0]!);
      img.set(x, y - 1, pal[2]!);
    }
  }
}

/** Stone chimney stack with a cap and optional clay pots. Returns the smoke point. */
export function chimney(img: Img, cx: number, top: number, bottom: number, wall: string, pots: number, seed: number): { x: number; y: number } {
  const w = 8;
  const x0 = cx - w / 2;
  const capY = top + (pots ? 2 : 0);
  stonework(img, x0, capY + 2, w, bottom - capY - 2, wall === 'brick' ? WALLS.brick! : STONE, '#141118', { rh: 3, sw: 4, seed, shade: (i) => (i < 2 ? 0.22 : i > w - 3 ? -0.22 : 0) });
  img.rect(x0 - 1, capY, w + 2, 2, STONE[5]!);
  img.hline(x0 - 1, x0 + w, capY + 1, STONE[3]!);
  if (pots) {
    const xs = pots === 1 ? [cx - 1] : [cx - 3, cx + 1];
    for (const px of xs) {
      img.rect(px, top, 2, 2, CLAY[2]!);
      img.set(px, top, CLAY[4]!);
      img.set(px + 1, top + 1, CLAY[1]!);
    }
    return { x: cx, y: top };
  }
  img.rect(x0 + 2, capY, w - 4, 1, '#0a080c');
  return { x: cx, y: capY };
}

// ---------------------------------------------------------------------------------------
// Little extras (all purely decorative)

export function cat(img: Img, x: number, y: number, faceLeft: boolean) {
  // sitting cat silhouette, bottom at y, ~6x7
  const C0 = '#141018';
  const C1 = '#2a2232';
  const s = faceLeft ? -1 : 1;
  img.rect(x - 2, y - 3, 5, 3, C0); // body
  img.rect(x - 1, y - 4, 3, 1, C0);
  img.rect(x - 1 + s, y - 7, 3, 3, C0); // head
  img.set(x - 1 + s, y - 8, C0); // ears
  img.set(x + 1 + s, y - 8, C0);
  img.set(x + s - (faceLeft ? 0 : 0), y - 6, '#e8d060'); // eyes
  img.set(x + s + 1 * (faceLeft ? -1 : 1) + (faceLeft ? 1 : 0) + 0, y - 6, '#e8d060');
  img.set(x - 2, y - 3, C1);
  // tail curling down
  img.set(x - 3 * s, y - 1, C0);
  img.set(x - 4 * s, y - 2, C0);
  img.set(x - 4 * s, y - 3, C0);
}

export function vane(img: Img, x: number, y: number) {
  img.vline(x, y - 9, y, IRON[3]!);
  img.hline(x - 3, x + 3, y - 4, IRON[2]!);
  // rooster
  img.rect(x - 2, y - 9, 4, 2, IRON[3]!);
  img.set(x + 2, y - 10, IRON[3]!);
  img.set(x - 3, y - 10, IRON[3]!);
  img.set(x - 3, y - 11, IRON[3]!);
  img.set(x + 2, y - 11, '#a03030');
}

export function birds(img: Img, x: number, y: number) {
  for (const [dx, dy] of [
    [0, 0],
    [5, 0],
  ] as const) {
    img.rect(x + dx, y + dy - 2, 3, 2, '#141018');
    img.set(x + dx + (dx ? 3 : -1), y + dy - 3, '#141018');
    img.set(x + dx + (dx ? 3 : -1) + (dx ? 1 : -1), y + dy - 3, '#c08030');
  }
}

export function pot(img: Img, x: number, bottom: number, seed: number) {
  // clay pot with a flowering plant, ~5x7
  img.rect(x, bottom - 2, 5, 3, CLAY[2]!);
  img.hline(x, x + 4, bottom - 3, CLAY[3]!);
  img.set(x, bottom - 2, CLAY[3]!);
  img.vline(x + 4, bottom - 2, bottom, CLAY[1]!);
  img.ellipse(x + 2.5, bottom - 5, 3, 2.5, (px, py, nx, ny) => dpick(LEAF, 0.6 - ny * 0.3 - nx * 0.2, px, py));
  const fl = ['#e8e0d0', '#c0304a', '#e8a030', '#a040a0'][Math.floor(hash(x, bottom, seed) * 4)]!;
  img.set(x + 1, bottom - 6, fl);
  img.set(x + 3, bottom - 5, fl);
  img.set(x + 2, bottom - 7, fl);
}

export function woodpile(img: Img, x: number, bottom: number, w: number) {
  // split logs stacked under a little lean-to plank
  const rows = 3;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k * 3 < w - (r % 2) * 1; k++) {
      const cx = x + 1 + k * 3 + (r % 2);
      const cy = bottom - 1 - r * 3;
      if (cx + 1 >= x + w) continue;
      img.rect(cx, cy - 1, 3, 3, LOG[1]!);
      img.set(cx + 1, cy, LOG[3]!);
      img.set(cx, cy - 1, LOG[2]!);
      img.set(cx + 1, cy - 1, LOG[4]!);
    }
  img.hline(x - 1, x + w, bottom - rows * 3 - 1, BEAM[3]!);
  img.hline(x - 1, x + w, bottom - rows * 3, BEAM[1]!);
}

export function rainBarrel(img: Img, x: number, bottom: number) {
  const pal = ['#2a1a10', '#3e2818', '#5a3a22', '#7a5230'];
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 7; i++) {
      if ((j === 0 || j === 8) && (i === 0 || i === 6)) continue;
      let v = 0.55 - Math.abs(i - 2) * 0.1;
      if (j === 2 || j === 6) {
        img.set(x + i, bottom - 8 + j, IRON[2]!);
        continue;
      }
      img.set(x + i, bottom - 8 + j, dpick(pal, v, x + i, bottom - 8 + j));
    }
  img.hline(x + 1, x + 5, bottom - 8, '#1e2a3a');
  img.set(x + 2, bottom - 8, '#4a6a8a');
}

export function herbs(img: Img, x: number, y: number) {
  // a few bundles of drying herbs hanging from the eave
  for (let k = 0; k < 3; k++) {
    const bx = x + k * 3;
    const len = 1 + (k % 2);
    img.vline(bx, y, y + len, '#5a4a30');
    img.rect(bx - 1, y + len + 1, 2, 3, k === 1 ? '#6a5a2a' : LEAF[3]!);
    img.set(bx - 1, y + len + 1, k === 1 ? '#8a7a3a' : LEAF[4]!);
  }
}

export function ivy(img: Img, x0: number, bottom: number, w: number, top: number, seed: number) {
  for (let y = top; y <= bottom; y++) {
    const t = (bottom - y) / Math.max(1, bottom - top);
    const reach = w * (1 - t * 0.7) + (vnoise(0, y, 4, seed) - 0.5) * 4;
    for (let i = 0; i < reach; i++) {
      const x = x0 + i;
      const n = vnoise(x, y, 2.5, seed + 1);
      if (n < 0.42 + (i / reach) * 0.25) continue;
      img.set(x, y, dpick(LEAF, 0.35 + n * 0.5 - (hash(x, y, seed) < 0.15 ? 0.2 : 0), x, y));
    }
  }
}

export function dormer(img: Img, style: BuildingStyle, cx: number, top: number, seed: number): { x: number; y: number } {
  const pal = ROOFS[style.roof]!;
  // front wall
  const wt = WALLS[style.wall === 'stone' || style.wall === 'brick' ? style.wall : 'plaster']!;
  for (let j = 4; j < 13; j++) for (let i = -5; i <= 4; i++) img.set(cx + i, top + j, dpick(wt, 0.55 + (i < -3 ? 0.15 : 0) + (hash(i, j, seed) - 0.5) * 0.2, cx + i, top + j));
  const win = paintWindow(style, 4, 5, false, seed);
  place(img, win, (i, j) => [cx - 3 + i, top + 6 + j]);
  // little gable roof
  for (let j = 0; j < 6; j++)
    for (let i = -7 + j; i <= 6 - j; i++) {
      const side = i < 0 ? 0.15 : -0.15;
      img.set(cx + i, top + 5 - j, dpick(pal, 0.55 + side + (j === 5 ? 0.25 : 0), cx + i, top + 5 - j));
    }
  img.hline(cx - 7, cx + 6, top + 5, pal[0]!);
  img.blendRect(cx - 5, top + 13, 10, 1, '#05030a', 0.5);
  return { x: cx, y: top + 9 };
}

// ---------------------------------------------------------------------------------------
// Door assembly: surround (pale dressed stone), leaf, hood, all drawn through T.

export interface DoorOut {
  /** Sprite-sized mask of leaf pixels. */
  mask: Uint8Array;
  /** Sprite-sized image holding the doorway pixels (transparent outside the mask). */
  hole: Img;
  spec: DoorSpec;
}

export function doorAssembly(img: Img, T: Tf, spec: DoorSpec, jamb: number, seed: number): DoorOut {
  const { w, h } = spec;
  const inLeaf = leafIn(w, h, spec.arched);
  // surround
  for (let j = -2; j < h; j++)
    for (let i = -jamb; i < w + jamb; i++) {
      if (inLeaf(i, j)) continue;
      let near = false;
      for (let dj = -2; dj <= 0 && !near; dj++) for (let di = -jamb; di <= jamb; di++) if (inLeaf(i + di, j - dj) || inLeaf(i + di, j + -dj)) near = true;
      if (!near) continue;
      const left = i < w / 2;
      let v = 0.66 + (left ? 0.1 : -0.14) + (hash(i, j, seed) - 0.5) * 0.16;
      if (j < 0) v += 0.08;
      if ((i < 0 || i >= w) && (j + 40) % 5 === 4) v -= 0.3; // block joints on the jambs
      // inner reveal: the stone right next to the leaf on the shaded side
      if (!left && inLeaf(i - 1, j)) v -= 0.25;
      const [x, y] = T(i, j);
      img.set(x, y, dpick(DSTONE, v, x, y));
    }
  if (spec.arched) {
    // keystone
    const kx = Math.floor(w / 2) - 1;
    for (let j = -3; j <= -1; j++)
      for (let i = kx; i < kx + 2 + (w % 2); i++) {
        const [x, y] = T(i, j);
        img.set(x, y, j === -3 ? DSTONE[5]! : DSTONE[4]!);
      }
  }
  // leaf
  const leaf = paintLeaf(spec);
  place(img, leaf, T);
  // outputs
  const mask = new Uint8Array(img.w * img.h);
  const hole = new Img(img.w, img.h);
  const dw = paintDoorway(spec);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inLeaf(i, j)) continue;
      const [x, y] = T(i, j);
      if (!img.inb(x, y)) continue;
      mask[y * img.w + x] = 1;
      hole.set(x, y, dw.get(i, j));
    }
  return { mask, hole, spec };
}

/** The door hood (pent canopy / timber lintel), drawn after the roof so the eave never hides it. */
export function doorHood(img: Img, T: Tf, spec: DoorSpec, hood: Hood, roofPal: string[]) {
  const { w } = spec;
  if (hood === 'pent') {
    for (let j = -6; j <= -3; j++)
      for (let i = -4; i < w + 4; i++) {
        const r = j + 6; // 0 top .. 3 eave
        if (r === 0 && (i < -3 || i > w + 2)) continue;
        const [x, y] = T(i, j);
        img.set(x, y, r === 3 ? roofPal[0]! : dpick(roofPal, 0.85 - r * 0.18 + (i % 4 === 0 && r > 0 ? -0.18 : 0), x, y));
      }
    for (const i of [-2, w + 1]) {
      const [x, y] = T(i, -2);
      img.set(x, y, BEAM[2]!);
      const [x2, y2] = T(i + (i < 0 ? 1 : -1), -1);
      img.set(x2, y2, BEAM[1]!);
    }
  } else if (hood === 'lintel') {
    for (let j = -5; j <= -3; j++)
      for (let i = -4; i < w + 4; i++) {
        const [x, y] = T(i, j);
        img.set(x, y, dpick(BEAM, j === -5 ? 0.95 : j === -4 ? 0.6 : 0.2, x, y));
      }
    for (const i of [-2, w + 1]) {
      const [x, y] = T(i, -4);
      img.set(x, y, '#8a7058');
    }
  }
}

/** After the sprite is final (outlined, maybe flipped): cut the leaf and the doorway frames. */
export function cutDoor(img: Img, d: DoorOut, hinge: 'left' | 'right'): { door: DoorRect; leaf: Img; doorway: Img } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (d.mask[y * img.w + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const leaf = new Img(w, h);
  const doorway = new Img(w, h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const y = y0 + j;
      const inMask = d.mask[y * img.w + x] === 1;
      if (inMask) leaf.set(i, j, img.get(x, y));
      doorway.set(i, j, inMask ? d.hole.get(x, y) : img.get(x, y));
    }
  return { door: { x: x0, y: y0, w, h, hinge }, leaf, doorway };
}

export function flipMask(m: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + (w - 1 - x)] = m[y * w + x]!;
  return o;
}

export function personaOf(b: BuildingDef, index: number): Persona {
  return PERSONAS[(b.houseIndex ?? index) % PERSONAS.length]!;
}

export function tradeSign(b: BuildingDef): 'boot' | 'spool' | 'candle' | null {
  if (/cobbler/i.test(b.name)) return 'boot';
  if (/weaver/i.test(b.name)) return 'spool';
  if (/candle/i.test(b.name)) return 'candle';
  return null;
}

/** Hanging trade sign: bracket from the wall at (x, y) to the right (or left), board below. */
export function hangingSign(img: Img, x: number, y: number, kind: 'boot' | 'spool' | 'candle', toLeft: boolean) {
  const s = toLeft ? -1 : 1;
  for (let k = 0; k <= 8; k++) img.set(x + s * k, y, IRON[2]!);
  img.set(x + s, y + 1, IRON[2]!);
  const bx = toLeft ? x - 9 : x + 1;
  img.vline(bx + 1, y + 1, y + 2, IRON[3]!);
  img.vline(bx + 6, y + 1, y + 2, IRON[3]!);
  for (let j = 0; j < 7; j++) for (let i = 0; i < 8; i++) img.set(bx + i, y + 3 + j, dpick(['#2a1a10', '#3e2818', '#5a3a22', '#7a5230'], 0.5 + (i === 0 || j === 0 ? 0.3 : 0) - (i === 7 || j === 6 ? 0.3 : 0), bx + i, y + 3 + j));
  const gx = bx + 2;
  const gy = y + 4;
  if (kind === 'boot') {
    img.rect(gx + 1, gy, 2, 3, '#c0a050');
    img.rect(gx + 1, gy + 3, 4, 1, '#c0a050');
    img.set(gx + 1, gy, '#f0e0a0');
  } else if (kind === 'spool') {
    img.hline(gx, gx + 3, gy, '#e0c070');
    img.rect(gx + 1, gy + 1, 2, 3, '#c04060');
    img.hline(gx, gx + 3, gy + 4, '#e0c070');
  } else {
    img.rect(gx + 1, gy + 2, 2, 3, '#f0e8d0');
    img.set(gx + 1, gy + 1, '#ffcf5a');
    img.set(gx + 1, gy, '#ffe9a0');
  }
}

// ---------------------------------------------------------------------------------------
// Camera-facing cottage (door in the front wall)

export function frontGable(img: Img, style: BuildingStyle, cx: number, top: number, bottom: number, halfW: number, seed: number, windows: { x: number; y: number }[]) {
  const pal = ROOFS[style.roof]!;
  const tri: [number, number][] = [
    [cx - halfW + 4, bottom],
    [cx, top + 5],
    [cx + halfW - 4, bottom],
  ];
  const tmp = new Img(img.w, img.h);
  wallTexture(tmp, cx - halfW, top, halfW * 2, bottom - top + 1, style.wall === 'stone' || style.wall === 'brick' ? style.wall : 'plaster', seed);
  img.poly(tri, (x, y) => tmp.get(x, y));
  const wy = Math.round(top + (bottom - top) * 0.62);
  img.ellipse(cx, wy, 3.5, 3.5, (x, y, nx, ny) => (nx * nx + ny * ny > 0.5 ? BEAM[0]! : dpick(GLASS, 0.8 - ny * 0.3, x, y)));
  img.vline(cx, wy - 2, wy + 2, BEAM[1]!);
  windows.push({ x: cx, y: wy });
  for (let side = -1; side <= 1; side += 2) {
    for (let t = 0; t <= 1.0001; t += 1 / ((bottom - top) * 1.6)) {
      const x = cx + side * t * halfW;
      const y = top + t * (bottom - top);
      for (let k = 0; k < 5; k++) {
        const v = k < 1 ? 0.95 : k < 3 ? 0.55 : 0.12;
        img.set(x, y + k - 3, dpick(pal, v - (side > 0 ? 0.18 : 0), Math.round(x), Math.round(y + k)));
      }
    }
  }
  img.set(cx, top - 3, pal[5]!);
  img.set(cx, top - 4, pal[4]!);
}

export function cottageFront(b: BuildingDef, style: BuildingStyle, extra: number, seed: number, index: number): BuildingSprite {
  const W = b.footprint.w * TS;
  const FH = b.footprint.h * TS;
  const H = FH + extra;
  const img = new Img(W, H);
  const windows: { x: number; y: number }[] = [];
  const per = personaOf(b, index);
  const has = (e: Extra) => per.extras.includes(e);
  const wallH = Math.round(FH * 0.5);
  const wallTop = H - wallH;
  const dx = (b.door.x - b.footprint.x) * TS + 8;
  const DW = 12;
  const DH = 20;
  const dx0 = dx - DW / 2;
  const doorBottom = H - 4; // last leaf row

  wallTexture(img, 2, wallTop, W - 4, wallH, style.wall, seed);
  const winW = 10;
  const winH = 10;
  const winTop = wallTop + 6;
  const m = Math.round(W * 0.19);
  const winXs = [m, W - m].filter((x) => Math.abs(x - dx) >= 18);
  if (style.wall === 'timber') timberFrame(img, 2, wallTop + 1, W - 4, wallH - 4, [...winXs.map((x) => ({ x: x - 9, w: 18 })), { x: dx0 - 4, w: DW + 8 }], seed);
  stonework(img, 1, H - 4, W - 2, 4, STONE, '#141118', { rh: 4, sw: 7, seed: seed + 2 });

  for (const x of winXs) {
    const win = paintWindow(style, winW, winH, style.wall !== 'stone', seed + x);
    place(img, win, (i, j) => [x - Math.floor(win.w / 2) + i, winTop - 1 + j]);
    windows.push({ x, y: winTop + 5 });
    // sill + window box
    img.rect(x - 7, winTop + winH + 1, 14, 2, STONE[4]!);
    img.hline(x - 7, x + 6, winTop + winH + 2, STONE[1]!);
    if (style.flowers) {
      const by = winTop + winH + 3;
      img.rect(x - 6, by, 12, 3, '#4a2e1e');
      img.hline(x - 6, x + 5, by, '#6a4430');
      for (let i = 0; i < 12; i++) {
        const c = ['#c0304a', '#e8e0d0', '#a040a0', '#e8a030'][(i + x) % 4]!;
        img.set(x - 6 + i, by - 1, i % 2 ? LEAF[3]! : LEAF[2]!);
        if (hash(i, x, 3) < 0.6) img.set(x - 6 + i, by - 1 - (i % 2), c);
      }
    }
  }

  // door: stone surround, leaf, hood, step, lamp
  const spec: DoorSpec = { w: DW, h: DH, arched: per.hood === 'arch', kind: per.door, hinge: per.hinge, paint: style.shutters, wreath: has('wreath'), seed };
  const T: Tf = (i, j) => [dx0 + i, doorBottom - (DH - 1) + j];
  const d = doorAssembly(img, T, spec, 2, seed);
  // the step (a pale stoop wider than the door)
  for (let j = 0; j < 3; j++)
    for (let i = -3 - (j > 0 ? 1 : 0); i < DW + 3 + (j > 0 ? 1 : 0); i++) {
      const x = dx0 + i;
      const y = doorBottom + 1 + j;
      img.set(x, y, j === 0 ? dpick(DSTONE, 0.85 + (hash(x, y, 4) - 0.5) * 0.15, x, y) : dpick(DSTONE, j === 1 ? 0.45 : 0.25, x, y));
    }
  const lampX = per.hinge === 'left' ? dx0 - 6 : dx0 + DW + 4;
  const lampY = doorBottom - DH + 9;
  wallLantern(img, lampX, lampY, per.hinge !== 'left');
  windows.push({ x: lampX + 1, y: lampY - 3 });

  // ground extras
  if (has('pots')) pot(img, per.hinge === 'left' ? dx0 + DW + 3 : dx0 - 8, H - 1, seed);
  const leftCorner = 3;
  const rightCorner = W - 11;
  if (has('woodpile')) woodpile(img, per.hinge === 'left' ? rightCorner : leftCorner, H - 1, 9);
  if (has('barrel')) rainBarrel(img, has('woodpile') ? (per.hinge === 'left' ? leftCorner : rightCorner + 1) : per.hinge === 'left' ? rightCorner + 1 : leftCorner, H - 1);
  if (has('ivy')) ivy(img, 2, H - 2, 9, wallTop - 1, seed);

  // roof
  const roofBottom = wallTop + 2;
  const roofTop = extra + 2;
  roof(img, style, 0, W - 1, roofTop, roofBottom, Math.min(12, Math.floor(W / 7)), seed + 5);
  img.blendRect(2, roofBottom + 1, W - 4, 3, '#05030a', 0.45);
  doorHood(img, T, spec, per.hood, ROOFS[style.roof]!);
  if (has('ivy')) ivy(img, 0, roofBottom + 1, 6, roofBottom - 5, seed + 1);
  let chim: { x: number; y: number } | null = null;
  const chimX = style.chimney === 'left' ? Math.round(W * 0.27) : Math.round(W * 0.73);
  if (style.chimney !== 'none') chim = chimney(img, chimX, 3, roofTop + 13, style.wall, has('twopots') ? 2 : (seed >> 2) % 2, seed);
  if (style.roofType === 'cross') frontGable(img, style, dx, roofTop + 7, roofBottom, Math.min(24, Math.floor(W / 3.3)), seed + 7, windows);
  if (has('dormer')) {
    const ox = style.roofType === 'cross' ? Math.round(W * 0.2) : Math.round(W * 0.5);
    const cx = style.chimney === 'left' ? W - ox : style.chimney === 'right' ? ox : ox;
    windows.push(dormer(img, style, cx, roofTop + 9, seed));
  }
  if (has('cat')) cat(img, style.chimney === 'left' ? Math.round(W * 0.62) : Math.round(W * 0.38), roofTop, style.chimney !== 'left');
  if (has('vane')) vane(img, style.chimney === 'left' ? Math.round(W * 0.66) : Math.round(W * 0.34), roofTop);
  if (has('birds')) birds(img, style.chimney === 'left' ? Math.round(W * 0.56) : Math.round(W * 0.36), roofTop);
  if (has('herbs')) herbs(img, (winXs[0] ?? 12) - 3, roofBottom + 1);
  const sign = tradeSign(b);
  if (sign) hangingSign(img, per.hinge === 'left' ? dx0 + DW + 2 : dx0 - 3, wallTop + 3, sign, per.hinge !== 'left');

  img.outline({ darken: 0.72 });
  const cut = cutDoor(img, d, per.hinge);
  return { img, windows, chimney: chim, ...cut };
}

// ---------------------------------------------------------------------------------------
// Side-door cottage: gable end to the camera, door in the side wall facing the square. Drawn
// for 'east' (side wall on the right, oblique 2:1, rising away from the viewer) and mirrored for
// 'west'. Light still comes from the upper left, so a west-facing side wall is drawn lit.

export function cottageSide(b: BuildingDef, style: BuildingStyle, extra: number, seed: number, index: number): BuildingSprite {
  const W = b.footprint.w * TS;
  const FH = b.footprint.h * TS;
  const H = FH + extra;
  const west = style.facing === 'west';
  const img = new Img(W, H);
  const windows: { x: number; y: number }[] = [];
  const per = personaOf(b, index);
  const has = (e: Extra) => per.extras.includes(e);
  const pal = ROOFS[style.roof]!;
  const thatch = style.roof === 'thatch';
  const SW = Math.round(W * 0.34); // visible side-wall strip width
  const FW = W - SW; // gable-end (front) width
  const wallH = 32;
  const wallTop = H - wallH;
  const rise = (k: number) => Math.floor((k + 1) / 2);
  const base = (x: number) => H - 1 - rise(x - FW); // side wall ground line
  const sideShade = west ? 0.04 : -0.24; // west-facing walls catch the light
  const nearLit = west ? -0.16 : -0.06; // the slope over the side wall
  const farLit = west ? 0.0 : 0.14;

  // --- front (gable-end) wall
  wallTexture(img, 0, wallTop, FW, wallH, style.wall, seed);
  if (style.wall === 'timber') timberFrame(img, 0, wallTop + 1, FW, wallH - 4, [{ x: FW / 2 - 9, w: 18 }], seed);
  stonework(img, 0, H - 4, FW, 4, STONE, '#141118', { rh: 4, sw: 7, seed: seed + 2 });
  // --- side wall (sheared texture)
  {
    const tex = new Img(SW, wallH);
    wallTexture(tex, 0, 0, SW, wallH, style.wall, seed + 11);
    if (style.wall === 'timber') timberFrame(tex, 0, 1, SW, wallH - 4, [{ x: 0, w: SW }], seed);
    stonework(tex, 0, wallH - 4, SW, 4, STONE, '#141118', { rh: 4, sw: 7, seed: seed + 3 });
    for (let k = 0; k < SW; k++)
      for (let j = 0; j < wallH; j++) {
        const x = FW + k;
        const y = base(x) - (wallH - 1) + j;
        const c = tex.get(k, j);
        img.set(x, y, sideShade < 0 ? mix(c, '#0b0714', -sideShade) : mix(c, '#fff1cc', sideShade));
      }
    // corner post / quoin highlight
    for (let y = wallTop; y < H; y++) img.set(FW - 1, y, mix(img.get(FW - 1, y), '#000000', 0.35));
    for (let y = wallTop; y < H; y++) img.set(FW, y, mix(img.get(FW, y), '#fff1cc', 0.1));
  }

  // front window (+ box) on the gable-end wall
  const fx = Math.round(FW / 2);
  {
    const win = paintWindow(style, 10, 10, style.wall !== 'stone', seed);
    place(img, win, (i, j) => [fx - Math.floor(win.w / 2) + i, wallTop + 5 + j]);
    windows.push({ x: fx, y: wallTop + 11 });
    img.rect(fx - 7, wallTop + 17, 14, 2, STONE[4]!);
    img.hline(fx - 7, fx + 6, wallTop + 18, STONE[1]!);
    if (style.flowers) {
      const by = wallTop + 19;
      img.rect(fx - 6, by, 12, 3, '#4a2e1e');
      img.hline(fx - 6, fx + 5, by, '#6a4430');
      for (let i = 0; i < 12; i++) {
        img.set(fx - 6 + i, by - 1, i % 2 ? LEAF[3]! : LEAF[2]!);
        if (hash(i, fx, 3) < 0.6) img.set(fx - 6 + i, by - 1 - (i % 2), ['#c0304a', '#e8e0d0', '#a040a0', '#e8a030'][(i + seed) % 4]!);
      }
    }
  }

  // --- side door (sheared), its step and lamp, plus a small side window further back
  const DW = 8;
  const DH = 20;
  const dk = 2; // door starts this far along the side wall
  const sx0 = FW + dk;
  const Ts: Tf = (i, j) => {
    const x = sx0 + i;
    return [x, base(x) - 4 - (DH - 1 - j)];
  };
  // east version: hinge on the back (right) edge so the leaf swings away from the street corner
  const spec: DoorSpec = { w: DW, h: DH, arched: per.hood === 'arch', kind: per.door === 'panel' ? 'planks' : per.door, hinge: 'right', paint: toHex(mix(style.shutters, '#fff1cc', 0.14)), wreath: false, seed };
  const d = doorAssembly(img, Ts, spec, 1, seed);
  // step: a pale slab along the wall, its top face receding with the wall
  for (let i = -1; i <= DW; i++) {
    const x = sx0 + i;
    const y = base(x) - 3;
    img.set(x, y, dpick(DSTONE, 0.9, x, y));
    img.set(x, y + 1, dpick(DSTONE, 0.75, x, y + 1));
    img.set(x, y + 2, dpick(DSTONE, 0.4, x, y + 2));
    img.set(x, y + 3, dpick(DSTONE, 0.22, x, y + 3));
  }
  const lk = dk + DW + 3;
  const [lx, ly] = [FW + lk, base(FW + lk) - 4 - DH + 9];
  wallLantern(img, lx, ly, true);
  windows.push({ x: lx + 1, y: ly - 3 });
  {
    const win = paintWindow(style, 4, 8, false, seed + 5);
    const wk = Math.min(SW - win.w, lk + 4);
    place(img, win, (i, j) => {
      const x = FW + wk + i;
      return [x, base(FW + wk + i) - 4 - DH + 2 + j];
    });
    windows.push({ x: FW + wk + 2, y: base(FW + wk + 2) - 4 - DH + 7 });
  }

  // ground extras (front-wall corners)
  if (has('woodpile')) woodpile(img, 2, H - 1, 9);
  if (has('barrel')) rainBarrel(img, has('woodpile') ? FW - 9 : 2, H - 1);
  if (has('pots')) pot(img, FW - 7 - (has('barrel') && has('woodpile') ? 9 : 0), H - 1, seed);
  if (has('ivy')) ivy(img, 0, H - 2, 8, wallTop - 1, seed);

  // --- roof: two slopes receding along the ridge, then the front gable on top
  const gh = 30; // gable height
  const apex: [number, number] = [Math.floor(FW / 2), wallTop - gh];
  const R: [number, number] = [SW, -rise(SW - 1)];
  const slope = (a: [number, number], lit: number) => {
    // parallelogram a, apex, apex+R, a+R ; texture courses parallel to the eave
    const S: [number, number] = [apex[0] - a[0], apex[1] - a[1]];
    const det = R[0] * S[1] - R[1] * S[0];
    const xs = [a[0], apex[0], apex[0] + R[0], a[0] + R[0]];
    const ys = [a[1], apex[1], apex[1] + R[1], a[1] + R[1]];
    const L = Math.hypot(S[0], S[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5 - a[0];
        const py = y + 0.5 - a[1];
        const u = (px * S[1] - py * S[0]) / det;
        const v = (R[0] * py - R[1] * px) / det;
        if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) continue;
        const ly = Math.floor((1 - v) * L); // distance from the ridge
        const ux = Math.floor(u * SW);
        let val = 0.82 - (1 - v) * 0.4 + lit;
        val += shingle(style, ux, ly, seed + 5);
        if (style.roof === 'moss' && vnoise(x, y, 5, seed + 9) > 0.62 && ly % 4 !== 3) {
          img.set(x, y, dpick(['#1e3220', '#2a4428', '#3a5a32', '#4a6a3a'], val, x, y));
          continue;
        }
        if (ly <= 0) val = 0.95;
        if (v < 0.06) val = thatch ? 0.12 : 0.05; // eave edge
        img.set(x, y, dpick(pal, val, x, y));
      }
  };
  slope([-2, wallTop + 1], farLit); // far slope (behind the gable)
  slope([FW + 1, wallTop + 1], nearLit); // near slope, over the side wall
  // ridge line
  for (let k = 0; k <= SW; k++) img.set(apex[0] + k, apex[1] - rise(k - 1), pal[5]!);
  // eave shadow along the top of the side wall
  for (let k = 0; k < SW; k++) for (let j = 1; j <= 3; j++) img.blend(FW + k, base(FW + k) - wallH + j, '#05030a', 0.45);
  doorHood(img, Ts, spec, per.hood, pal);
  // gable wall triangle
  {
    const tmp = new Img(W, H);
    wallTexture(tmp, 0, apex[1], FW, wallTop - apex[1] + 2, style.wall === 'stone' || style.wall === 'brick' ? style.wall : 'plaster', seed + 7);
    if (style.wall === 'timber' || style.wall === 'planks') {
      // upper storey of a timber house: a king post and a collar beam
      for (let y = apex[1]; y < wallTop + 2; y++) tmp.set(apex[0], y, BEAM[2]!), tmp.set(apex[0] + 1, y, BEAM[1]!);
      for (let x = 0; x < FW; x++) tmp.set(x, wallTop - 10, BEAM[2]!);
    }
    img.poly(
      [
        [1, wallTop + 1],
        [apex[0] + 0.5, apex[1] + 3],
        [FW - 1, wallTop + 1],
      ],
      (x, y) => tmp.get(x, y),
    );
    const wy = Math.round(apex[1] + gh * 0.55);
    if (style.roofType === 'cross') {
      // a pair of small attic lights
      for (const ox of [-4, 3]) {
        const win = paintWindow(style, 3, 5, false, seed + ox);
        place(img, win, (i, j) => [apex[0] + ox - 1 + i, wy - 3 + j]);
      }
      windows.push({ x: apex[0], y: wy });
    } else {
      img.ellipse(apex[0] + 0.5, wy, 3.5, 3.5, (x, y, nx, ny) => (nx * nx + ny * ny > 0.5 ? BEAM[0]! : dpick(GLASS, 0.8 - ny * 0.3, x, y)));
      img.vline(apex[0], wy - 2, wy + 2, BEAM[1]!);
      img.hline(apex[0] - 2, apex[0] + 3, wy, BEAM[1]!);
      windows.push({ x: apex[0], y: wy });
    }
    img.blendRect(1, wallTop, FW - 2, 2, '#05030a', 0.35);
  }
  // barge boards along both gable edges (overhanging the wall)
  for (let side = -1; side <= 1; side += 2) {
    const steps = gh * 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = apex[0] + 0.5 + side * t * (FW / 2 + 2);
      const y = apex[1] + t * (gh + 2);
      for (let k = 0; k < 4; k++) {
        const v = k < 1 ? 0.95 : k < 3 ? 0.55 : 0.1;
        img.set(x, y + k - 2, dpick(pal, v + (side > 0 ? -0.15 : 0.05), Math.round(x), Math.round(y + k)));
      }
    }
  }
  img.set(apex[0], apex[1] - 3, pal[5]!);

  // chimney on the ridge
  let chim: { x: number; y: number } | null = null;
  if (style.chimney !== 'none') {
    const t = style.chimney === 'left' ? 0.35 : 0.8;
    const k = Math.round(SW * t);
    const cx = apex[0] + k;
    const ry = apex[1] - rise(k - 1);
    chim = chimney(img, cx, Math.max(1, ry - 17), ry + 2, style.wall, has('twopots') ? 2 : (seed >> 2) % 2, seed);
  }
  if (has('cat')) cat(img, apex[0] + Math.round(SW * 0.55) - 2, apex[1] - rise(Math.round(SW * 0.55)) + 1, !west);
  if (has('vane')) vane(img, apex[0], apex[1] - 3);
  if (has('birds')) birds(img, apex[0] + Math.round(SW * 0.15), apex[1] - rise(Math.round(SW * 0.15)) + 1);
  if (has('herbs')) herbs(img, fx + 9, wallTop + 2);
  if (has('dormer')) {
    // a small skylight on the near slope
    const k = Math.round(SW * 0.55);
    const x = FW - 6 + k;
    const y = wallTop - 14 - rise(k);
    const win = paintWindow(style, 3, 3, false, seed);
    place(img, win, (i, j) => [x + i, y + j - rise(i)]);
    windows.push({ x: x + 2, y: y + 2 });
  }
  const sign = tradeSign(b);
  if (sign) hangingSign(img, FW - 1, wallTop + 4, sign, true);

  img.outline({ darken: 0.72 });
  // mirror for west-facing cottages (everything drawn as 'east')
  let out = img;
  let door = d;
  let hinge: 'left' | 'right' = 'right';
  let chimOut = chim;
  let win2 = windows;
  if (west) {
    out = img.flipped();
    door = { ...d, mask: flipMask(d.mask, W, H), hole: d.hole.flipped() };
    hinge = 'left';
    chimOut = chim ? { x: W - 1 - chim.x, y: chim.y } : null;
    win2 = windows.map((p) => ({ x: W - 1 - p.x, y: p.y }));
  }
  const cut = cutDoor(out, door, hinge);
  return { img: out, windows: win2, chimney: chimOut, ...cut };
}

// ---------------------------------------------------------------------------------------
// The clock tower: the landmark at the head of the square. Stepped plinth, a base with a great
// door, a tall clock stage with a big ivory dial (readable at any zoom), the belfry with its bell,
// a crenellated parade with corner pinnacles and a flared slate spire with a gilded vane.

export function clocktower(b: BuildingDef, extra: number): BuildingSprite {
  let clockFace: { x: number; y: number; r: number } | null = null;
  const W = b.footprint.w * TS;
  const FH = b.footprint.h * TS;
  const H = FH + extra;
  const img = new Img(W, H);
  const windows: { x: number; y: number }[] = [];
  const cx = W / 2;
  const TS2 = ['#1e1b26', '#2a2632', '#373240', '#46404f', '#565060', '#6a6274', '#80788a'];
  const MORTAR = '#120f18';
  const shade = (w: number) => (i: number) => (i < 4 ? 0.2 : i > w - 6 ? -0.28 : i > w * 0.6 ? -0.08 : 0);
  const moulding = (x: number, y: number, w: number, rows: number) => {
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < w; i++) {
        const v = j === 0 ? 0.95 : j === rows - 1 ? 0.15 : 0.6;
        img.set(x + i, y + j, dpick(TS2, v - (i > w - 5 ? 0.2 : 0) + (i < 3 ? 0.08 : 0), x + i, y + j));
      }
  };
  const quoins = (x: number, w: number, y0: number, y1: number) => {
    for (let y = y0; y < y1; y += 5) {
      const long = Math.floor((y - y0) / 5) % 2 === 0;
      for (let j = 0; j < 4 && y + j < y1; j++) {
        for (let i = 0; i < (long ? 5 : 3); i++) img.set(x + i, y + j, dpick(TS2, j === 0 ? 0.92 : 0.75, x + i, y + j));
        for (let i = 0; i < (long ? 5 : 3); i++) img.set(x + w - 1 - i, y + j, dpick(TS2, j === 0 ? 0.55 : 0.35, x + w - 1 - i, y + j));
      }
    }
  };

  // vertical plan (from the top): vane 0-6, spire 6-38, parade 34-42, belfry 42-64, cornice,
  // clock stage 68-106, cornice, base 110-136, steps 136-144 (scaled to H)
  const yStep = H - 8;
  const yBase = H - 34;
  const yClock = Math.round(H * 0.47);
  const yBelfry = Math.round(H * 0.29);
  const yParade = yBelfry - 6;

  // steps
  stonework(img, 0, H - 4, W, 4, TS2, MORTAR, { rh: 4, sw: 9, seed: 50, shade: shade(W) });
  img.hline(0, W - 1, H - 4, TS2[5]!);
  stonework(img, 3, yStep, W - 6, 4, TS2, MORTAR, { rh: 4, sw: 9, seed: 49, shade: shade(W - 6) });
  img.hline(3, W - 4, yStep, TS2[5]!);
  // base
  const bx = 6;
  const bw = W - 12;
  stonework(img, bx, yBase, bw, yStep - yBase, TS2, MORTAR, { rh: 5, sw: 9, seed: 51, shade: shade(bw) });
  quoins(bx, bw, yBase, yStep);
  // clock stage (shaft)
  const sx = 11;
  const sw = W - 22;
  stonework(img, sx, yClock, sw, yBase - yClock, TS2, MORTAR, { rh: 5, sw: 8, seed: 52, shade: shade(sw) });
  quoins(sx, sw, yClock, yBase);
  moulding(bx - 2, yBase - 3, bw + 4, 4);
  // belfry
  const fx = 13;
  const fw = W - 26;
  stonework(img, fx, yBelfry, fw, yClock - yBelfry, TS2, MORTAR, { rh: 5, sw: 8, seed: 53, shade: shade(fw) });
  moulding(sx - 2, yClock - 3, sw + 4, 4);
  // belfry arch with the bell
  {
    const ow = 18;
    const ox = cx - ow / 2;
    const oy = yBelfry + 4;
    const oh = yClock - 4 - oy;
    for (let j = 0; j < oh; j++)
      for (let i = 0; i < ow; i++) {
        if (j < ow / 2) {
          const d = Math.hypot(i + 0.5 - ow / 2, (j + 0.5 - ow / 2) * 1.1);
          if (d > ow / 2) continue;
        }
        img.set(ox + i, oy + j, j > oh - 3 ? '#1a1420' : '#0b0810');
      }
    // arch voussoirs
    for (let a = 0; a <= 40; a++) {
      const t = (a / 40) * Math.PI;
      const x = cx - Math.cos(t) * (ow / 2 + 1);
      const y = oy + ow / 2 - Math.sin(t) * (ow / 2 + 1) * 0.92;
      img.set(x, y, a % 6 === 0 ? TS2[2]! : TS2[6]!);
    }
    // the bell (headstock beam, crown, waist, flared lip)
    img.hline(ox + 1, ox + ow - 2, oy + 6, BEAM[2]!);
    const by = oy + 7;
    const prof = [2, 3, 4, 4, 4, 5, 5, 6, 7];
    prof.forEach((hw, j) => {
      for (let i = -hw; i < hw; i++) img.set(cx + i, by + j, dpick(BRASS, 0.85 - (i + hw) / (hw * 2) * 0.75 + (j === prof.length - 1 ? -0.1 : 0), cx + i, by + j));
    });
    img.set(cx - 1, by + prof.length, BRASS[1]!);
    img.set(cx, by + prof.length, BRASS[2]!);
    img.set(cx - 3, by + 2, BRASS[4]!);
    // a louvred sill
    img.hline(ox, ox + ow - 1, oy + oh - 1, TS2[5]!);
    // little lancets either side
    for (const lx of [fx + 4, fx + fw - 6]) {
      img.rect(lx, yBelfry + 9, 2, 8, '#0b0810');
      img.set(lx, yBelfry + 8, '#0b0810');
      img.set(lx + 1, yBelfry + 8, '#0b0810');
    }
  }
  // parade: corbelled cornice, crenellations, corner pinnacles
  moulding(fx - 3, yParade + 3, fw + 6, 3);
  for (let x = fx - 3; x < fx + fw + 3; x++) {
    const merlon = Math.floor((x - fx + 3) / 4) % 2 === 0;
    for (let y = yParade - 2; y < yParade + 3; y++) if (merlon || y >= yParade + 1) img.set(x, y, dpick(TS2, y === yParade - 2 || (!merlon && y === yParade + 1) ? 0.9 : 0.5 - (x > fx + fw - 2 ? 0.2 : 0), x, y));
  }
  for (const px of [fx - 3, fx + fw - 1]) {
    // pinnacle shaft + little spirelet
    for (let y = yParade - 7; y < yParade + 3; y++) for (let i = 0; i < 4; i++) img.set(px + i, y, dpick(TS2, (i < 2 ? 0.75 : 0.35) + (y % 4 === 0 ? -0.15 : 0), px + i, y));
    img.poly(
      [
        [px - 0.5, yParade - 7],
        [px + 2, yParade - 15],
        [px + 4.5, yParade - 7],
      ],
      (x) => (x < px + 2 ? ROOFS.slate![4]! : ROOFS.slate![1]!),
    );
    img.set(px + 1, yParade - 16, BRASS[4]!);
    img.set(px + 2, yParade - 16, BRASS[3]!);
  }
  // spire: flared (bell-cast) slate cone, lit from the left
  {
    const sTop = 7;
    const sBot = yParade - 1;
    const hb = fw / 2 - 1;
    for (let y = sTop; y <= sBot; y++) {
      const t = (y - sTop) / (sBot - sTop);
      const hw = hb * Math.pow(t, 1.35) + 0.6 + (t > 0.85 ? (t - 0.85) * 14 : 0);
      for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
        const u = (x + 0.5 - (cx - hw)) / (2 * hw); // 0 left .. 1 right
        let v = 0.92 - u * 0.75 + (u > 0.5 ? -0.06 : 0);
        const course = (y - sTop) % 4 === 3;
        if (course) v -= 0.22;
        else if (hash(Math.floor((x + ((y >> 2) % 2) * 2) / 4), y >> 2, 61) < 0.2) v += 0.1;
        if (Math.abs(x + 0.5 - cx) < 0.6) v += 0.12; // the front arris
        img.set(x, y, dpick(ROOFS.slate!, v + (bayer(x, y) - 0.5) * 0.06, x, y));
      }
    }
    // little lucarne (spire light) halfway up
    const ly = Math.round(sTop + (sBot - sTop) * 0.62);
    img.rect(cx - 2, ly, 4, 5, '#0b0810');
    img.poly(
      [
        [cx - 3.5, ly + 0.5],
        [cx, ly - 3],
        [cx + 3.5, ly + 0.5],
      ],
      (x) => (x < cx ? ROOFS.slate![5]! : ROOFS.slate![2]!),
    );
    img.set(cx - 1, ly + 2, GLASS[2]!);
    img.set(cx, ly + 2, GLASS[3]!);
    // gilded finial ball + vane
    img.ellipse(cx, sTop - 1, 2, 2, (x, y, nx, ny) => dpick(BRASS, 0.8 - nx * 0.4 - ny * 0.3, x, y));
    img.vline(cx - 1, 0, sTop - 2, BRASS[2]!);
    img.hline(cx - 6, cx + 4, 2, BRASS[3]!);
    img.rect(cx + 2, 1, 3, 3, BRASS[4]!);
    img.set(cx - 6, 1, BRASS[3]!);
    img.set(cx - 6, 3, BRASS[3]!);
  }
  // the clock: a stone surround, brass bezel, ivory dial with hour marks, hands at five to midnight
  {
    const fy = Math.round((yClock + yBase) / 2) - 1;
    const R = Math.min(17, Math.floor(sw / 2) - 4);
    img.ellipse(cx, fy, R + 3, R + 3, (x, y, nx, ny) => dpick(TS2, 0.8 - nx * 0.3 - ny * 0.3, x, y));
    img.ellipse(cx, fy, R + 1, R + 1, (x, y, nx, ny) => {
      const d = Math.sqrt(nx * nx + ny * ny) * (R + 1);
      if (d > R) return BRASS[1]!;
      if (d > R - 1.2) return dpick(BRASS, 0.85 - nx * 0.35 - ny * 0.35, x, y);
      const dd = d / R;
      // hour marks
      const a = Math.atan2(ny, nx);
      const hourA = Math.round(a / (Math.PI / 6)) * (Math.PI / 6);
      const off = Math.abs(a - hourA) * d;
      const quarter = Math.round(a / (Math.PI / 6)) % 3 === 0;
      if (dd > 0.72 && dd < 0.93 && off < (quarter ? 1.1 : 0.6)) return '#1a1420';
      if (dd > 0.94) return '#5a4a30';
      return dpick(['#8a8270', '#b0a68c', '#d4ccb0', '#ece4cc', '#f8f2de'], 0.9 - dd * 0.35 - nx * 0.18 - ny * 0.12, x, y);
    });
    // (v2.1) no baked hands: the client draws live hands showing the town clock (see clock below)
    img.set(cx, fy, BRASS[4]!);
    clockFace = { x: cx, y: fy, r: R };
    img.set(cx - 1, fy, BRASS[3]!);
    windows.push({ x: cx, y: fy });
  }
  // great door in the base: double leaf under a pointed arch, studded, lamps either side
  {
    const dw = 16;
    const dh = 22;
    const x0 = cx - dw / 2;
    const top = yStep - dh;
    for (let j = -3; j < dh; j++)
      for (let i = -3; i < dw + 3; i++) {
        const inside = i >= 0 && i < dw && j >= 0 && (j >= 6 || Math.abs(i + 0.5 - dw / 2) <= (j + 1) * 1.35);
        const frame = i >= -3 && i < dw + 3 && (j >= 3 || Math.abs(i + 0.5 - dw / 2) <= (j + 4) * 1.35);
        if (!frame) continue;
        if (!inside) {
          img.set(x0 + i, top + j, dpick(DSTONE, 0.62 + (i < dw / 2 ? 0.1 : -0.15) + (hash(i, j, 77) - 0.5) * 0.15, x0 + i, top + j));
          continue;
        }
        const pl = i % 4 === 3 || i === dw / 2 - 1;
        let v = pl ? 0.1 : 0.5 + (i % 4 === 0 ? 0.12 : 0);
        if ((j === 7 || j === dh - 5) && !pl) v = 0.15;
        img.set(x0 + i, top + j, dpick(['#1c120c', '#2e1e14', '#46301e', '#5e4228', '#7a5636'], v - j / 90, x0 + i, top + j));
      }
    for (const yy of [top + 7, top + dh - 5]) for (let i = 1; i < dw; i += 3) img.set(x0 + i, yy, IRON[3]!);
    img.set(x0 + dw / 2 - 3, top + 13, BRASS[4]!);
    img.set(x0 + dw / 2 + 2, top + 13, BRASS[4]!);
    img.blendRect(x0, top + 6, dw, 2, '#05030a', 0.3);
    wallLantern(img, x0 - 6, top + 10, false);
    wallLantern(img, x0 + dw + 4, top + 10, true);
    windows.push({ x: x0 - 5, y: top + 7 }, { x: x0 + dw + 5, y: top + 7 });
    // slit windows in the base
    for (const sx2 of [bx + 9, bx + bw - 11]) {
      img.rect(sx2, yBase + 6, 2, 9, '#0b0810');
      img.set(sx2, yBase + 8, GLASS[2]!);
      img.set(sx2 + 1, yBase + 9, GLASS[1]!);
    }
  }
  img.outline({ darken: 0.72 });
  return { img, windows, door: null, chimney: null, leaf: null, doorway: null, ...(clockFace ? { clock: clockFace } : {}) };
}

/** One building's sprite (exported for review tooling). */
export function drawBuilding(b: BuildingDef, style: BuildingStyle, index: number): BuildingSprite {
  const extra = EXTRA[b.kind] ?? 16;
  if (b.kind === 'clocktower') return clocktower(b, extra);
  const seed = 100 + index * 13;
  // A hand-designed house (scripts/houses/<id>.ts) wins over the generic cottage.
  const custom = HOUSE_ART[b.id];
  if (custom) return custom(b, style, seed, index);
  if (style.facing === 'east' || style.facing === 'west') return cottageSide(b, style, extra, seed, index);
  return cottageFront(b, style, extra, seed, index);
}

export function drawBuildings(): Map<string, BuildingSprite> {
  const out = new Map<string, BuildingSprite>();
  [...townLayout.buildings, ...townMap.landmarks].forEach((b, i) => out.set(b.id, drawBuilding(b, townMap.styles[b.id]!, i)));
  return out;
}
