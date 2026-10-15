// Per-cottage overlays for houses nobody lives in, derived from the real building sprites so they
// fit exactly whatever the buildings agent draws:
//   boarded_<id>  planks nailed across that cottage's door leaf (same rect as the `door` object;
//                 follows the 2:1 shear on side-wall doors)
//   unlit_<id>    every warm window pane (and the door lamp) of that cottage turned dark and cold
// Placement rects are in sprite coords and in WORLD px (meta.houses[id]).
import { townLayout, TS } from '../../src/layout.js';
import { drawBuildings, type BuildingSprite } from '../buildings.js';
import { col, dpick, hash, Img, vnoise } from '../lib/img.js';
import { WOOD_OLD } from './common.js';

const GLASS = ['#7a3e1a', '#c06a24', '#eda040', '#ffd27a', '#fff0c0'];
const MULLION = '#271a12';
const DEAD_DOOR = ['#141018', '#1c1720', '#26202a', '#302834'];
const DARK_GLASS = ['#0e1019', '#171a27', '#222738', '#323a52', '#4a5676'];

const key = (c: readonly number[]) => (c[0]! << 16) | (c[1]! << 8) | c[2]!;
const GLASS_SET = new Set(GLASS.map((h) => key(col(h))));
const MULLION_KEY = key(col(MULLION));

export interface Placement {
  frame: string;
  /** sprite coords */
  x: number;
  y: number;
  w: number;
  h: number;
  /** world px (top-left) */
  wx: number;
  wy: number;
}
export interface HouseMeta {
  boarded?: Placement;
  unlit?: Placement;
  /** World point for the doorglow anchor (bottom-centre of the door leaf, on the step). */
  doorglow?: { x: number; y: number };
  /** World point for the smoke anchor (chimney top), when the cottage has a chimney. */
  smoke?: { x: number; y: number };
  /** Suggested world point for the name board's post foot (beside the door, off the lamp side). */
  board?: { x: number; y: number };
}

/** Planks across a door leaf of any shape; `leaf` alpha is the mask. */
export function boardUp(leaf: Img, seed: number): Img {
  const w = leaf.w;
  const h = leaf.h;
  const out = new Img(w, h);
  const inM = (i: number, j: number) => leaf.alpha(i, j) > 0;
  const top: number[] = [];
  const bot: number[] = [];
  for (let i = 0; i < w; i++) {
    let t = -1;
    let b = -1;
    for (let j = 0; j < h; j++)
      if (inM(i, j)) {
        if (t < 0) t = j;
        b = j;
      }
    top.push(t);
    bot.push(b);
  }
  // shear of the wall (0 on the camera-facing front, ~+-0.5 on side walls)
  const cols = [...top.keys()].filter((i) => bot[i]! >= 0);
  const i0 = cols[0]!;
  const i1 = cols[cols.length - 1]!;
  const slope = i1 > i0 ? (bot[i1]! - bot[i0]!) / (i1 - i0) : 0;
  const colH = Math.max(...cols.map((i) => bot[i]! - top[i]! + 1));
  // dead door
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inM(i, j)) continue;
      const v = 0.45 + (i % 4 === 0 ? -0.3 : i % 4 === 1 ? 0.15 : 0) - j / 60 + (hash(i, j, seed) - 0.5) * 0.15;
      out.set(i, j, dpick(DEAD_DOOR, v, i, j));
    }
  // cobweb in the upper corner
  const ci = i0 + 1;
  if (inM(ci + 1, top[ci + 1]! + 1)) {
    out.set(ci + 1, top[ci + 1]! + 1, '#8a8496');
    out.set(ci, top[ci]! + 2, '#8a8496');
    out.set(ci + 1, top[ci + 1]! + 2, '#5a5466');
  }
  const th = w >= 10 ? 3 : 2;
  const planksAt: [number, number][] = [
    [0.24, 2],
    [0.52, -2],
    [0.8, 1],
  ];
  planksAt.forEach(([f, tilt], k) => {
    for (let i = 0; i < w; i++) {
      if (bot[i]! < 0) continue;
      const base = bot[i0]! + slope * (i - i0) - (1 - f) * (colH - 1);
      const yc = Math.round(base + (tilt * (i - (w - 1) / 2)) / Math.max(1, w - 1));
      for (let t = 0; t < th; t++) {
        const y = yc + t;
        if (!inM(i, y)) continue;
        const v = t === 0 ? 0.88 : t === th - 1 ? 0.3 : 0.6 + (vnoise(i * 2, k * 7, 3, seed + k) - 0.5) * 0.18;
        out.set(i, y, dpick(WOOD_OLD, v, i, y));
      }
      if (inM(i, yc + th)) out.set(i, yc + th, '#0a080c');
    }
    // nails at the ends
    for (const i of [i0 + 1, i1 - 1]) {
      const yc = Math.round(bot[i0]! + slope * (i - i0) - (1 - f) * (colH - 1) + (tilt * (i - (w - 1) / 2)) / Math.max(1, w - 1));
      const ny = yc + (th > 2 ? 1 : 0);
      if (inM(i, ny)) out.set(i, ny, '#a8a2b0');
    }
  });
  return out;
}

/** Dark glass for every pane connected to the building's glow points. */
function unlitOverlay(s: BuildingSprite): { img: Img; x: number; y: number } | null {
  const src = s.img;
  const mark = new Uint8Array(src.w * src.h); // 1 glass, 2 mullion
  for (const p of s.windows) {
    const q: [number, number][] = [];
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (src.inb(x, y) && GLASS_SET.has(key(src.get(x, y))) && !mark[y * src.w + x]) {
          mark[y * src.w + x] = 1;
          q.push([x, y]);
        }
      }
    while (q.length) {
      const [x, y] = q.pop()!;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!src.inb(nx, ny) || Math.abs(nx - p.x) > 9 || Math.abs(ny - p.y) > 9) continue;
          const k = ny * src.w + nx;
          if (mark[k]) continue;
          const c = key(src.get(nx, ny));
          if (GLASS_SET.has(c)) mark[k] = 1;
          else if (c === MULLION_KEY) mark[k] = 2;
          else continue;
          q.push([nx, ny]);
        }
    }
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++)
      if (mark[y * src.w + x] === 1) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null;
  const img = new Img(x1 - x0 + 1, y1 - y0 + 1);
  // per-pane gradient: dark at the bottom, a cold moonlit sheen and one diagonal glint up top
  for (const p of s.windows)
    for (let y = p.y - 9; y <= p.y + 9; y++)
      for (let x = p.x - 9; x <= p.x + 9; x++) {
        if (!src.inb(x, y) || mark[y * src.w + x] !== 1 || img.alpha(x - x0, y - y0) > 0) continue;
        const u = (x - p.x) / 9;
        const v = (y - p.y) / 9;
        let val = 0.42 - v * 0.55 - u * 0.12;
        if (Math.abs(u + v + 0.25) < 0.09) val += 0.35; // glint streak
        img.set(x - x0, y - y0, dpick(DARK_GLASS, val, x, y));
      }
  return { img, x: x0, y: y0 };
}

export function houseOverlays(): { frames: [string, Img][]; houses: Record<string, HouseMeta> } {
  const sprites = drawBuildings();
  const frames: [string, Img][] = [];
  const houses: Record<string, HouseMeta> = {};
  townLayout.buildings.forEach((b, n) => {
    const s = sprites.get(b.id);
    if (!s) return;
    const left = b.footprint.x * TS;
    const bottom = (b.footprint.y + b.footprint.h) * TS;
    const top = bottom - s.img.h;
    const meta: HouseMeta = {};
    if (s.door && s.leaf) {
      const name = `boarded_${b.id}`;
      frames.push([name, boardUp(s.leaf, 7 + n)]);
      const d = s.door;
      meta.boarded = { frame: name, x: d.x, y: d.y, w: d.w, h: d.h, wx: left + d.x, wy: top + d.y };
      // lowest leaf pixel = the threshold
      let by = 0;
      let bx = d.x + d.w / 2;
      for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) if (s.leaf.alpha(i, j) > 0 && j >= by) [by, bx] = [j, d.x + i];
      const side = b.door.x * TS + 8 < left + s.img.w / 2 ? -1 : 1;
      meta.doorglow = { x: Math.round(left + (d.w >= 10 ? d.x + d.w / 2 : bx)), y: top + d.y + by + 2 };
      // board: on the hinge side (the lamp hangs on the latch side), a step in front of the wall
      const hingeSide = d.hinge === 'left' ? -1 : 1;
      meta.board =
        d.w >= 10
          ? { x: left + d.x + d.w / 2 + hingeSide * 18, y: bottom + 14 }
          : { x: left + d.x + d.w / 2 + side * 10, y: top + d.y + by + 12 };
    }
    if (s.chimney) meta.smoke = { x: left + s.chimney.x, y: top + s.chimney.y };
    const u = unlitOverlay(s);
    if (u) {
      const name = `unlit_${b.id}`;
      frames.push([name, u.img]);
      meta.unlit = { frame: name, x: u.x, y: u.y, w: u.img.w, h: u.img.h, wx: left + u.x, wy: top + u.y };
    }
    houses[b.id] = meta;
  });
  return { frames, houses };
}

export { drawBuildings };
