// Shared pixel-art drawing helpers (shading conventions: moonlight from the upper left).
import { bayer, col, dpick, hash, Img, mix, type Color, vnoise } from './img.js';

export const LX = -0.62;
export const LY = -0.78;

/** Shade an ellipse like a sphere lit from the upper-left. */
export function sphere(img: Img, cx: number, cy: number, rx: number, ry: number, pal: readonly Color[], opts: { bias?: number; seed?: number; tex?: number } = {}) {
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let v = 0.5 + (nx * LX + ny * LY) * 0.45 + nz * 0.2 - 0.1;
    v += opts.bias ?? 0;
    if (opts.tex) v += (vnoise(x, y, 2, opts.seed ?? 1) - 0.5) * opts.tex;
    return dpick(pal, v, x, y);
  });
}

/** Leafy canopy from overlapping clusters; each pixel shaded by its dominant cluster. */
export function canopy(img: Img, clusters: [number, number, number][], pal: readonly Color[], seed: number, opts: { tex?: number; bias?: number } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y, r] of clusters) {
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++)
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      let best = -1;
      let bv = 0;
      for (let i = 0; i < clusters.length; i++) {
        const [cx, cy, r] = clusters[i]!;
        // leafy edge: radius wobble
        const ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const rr = r * (0.9 + 0.12 * Math.sin(ang * 7 + i * 1.7 + seed) + 0.06 * (hash(x, y, seed) - 0.5));
        const nx = (x + 0.5 - cx) / rr;
        const ny = (y + 0.5 - cy) / rr;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        // later clusters (drawn on top) win
        const nz = Math.sqrt(1 - d);
        best = i;
        bv = 0.5 + (nx * LX + ny * LY) * 0.5 + nz * 0.25 - 0.12;
      }
      if (best < 0) continue;
      let v = bv + (opts.bias ?? 0) + (vnoise(x, y, 2.5, seed + 3) - 0.5) * (opts.tex ?? 0.45);
      // leaf clumps
      if (hash(x, y, seed + 9) < 0.06) v += 0.25;
      img.set(x, y, dpick(pal, v, x, y));
    }
}

/** Soft drop shadow ellipse (semi transparent). */
export function shadow(img: Img, cx: number, cy: number, rx: number, ry: number, a = 0.38) {
  img.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const d = nx * nx + ny * ny;
    const al = a * (d < 0.55 ? 1 : 0.6);
    if (img.alpha(x, y) > 0) return null;
    return [10, 6, 18, Math.round(al * 255)] as const;
  });
}

/** Vertical/horizontal wooden planks. */
export function planks(img: Img, x: number, y: number, w: number, h: number, pal: readonly Color[], opts: { vertical?: boolean; size?: number; seed?: number } = {}) {
  const size = opts.size ?? 4;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const u = opts.vertical ? i : j;
      const v = opts.vertical ? j : i;
      const k = Math.floor(u / size);
      const lu = u % size;
      let t = 0.35 + hash(k, 0, opts.seed ?? 5) * 0.3 + (vnoise(v, k * 9, 4, (opts.seed ?? 5) + 1) - 0.5) * 0.35;
      if (lu === 0) t += 0.25;
      let c = dpick(pal, t, x + i, y + j);
      if (lu === size - 1) c = mix(pal[0]!, '#08040a', 0.5);
      img.set(x + i, y + j, c);
    }
}

/** Box seen in 3/4: top face (lighter) of height `top`, front face below. */
export function box(img: Img, x: number, y: number, w: number, h: number, top: number, pal: readonly Color[], opts: { outline?: boolean } = {}) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const isTop = j < top;
      let v = isTop ? 0.75 : 0.35;
      if (!isTop && i < 2) v += 0.1;
      if (!isTop && i > w - 3) v -= 0.15;
      if (isTop && j === 0) v += 0.15;
      img.set(x + i, y + j, dpick(pal, v + (bayer(i, j) - 0.5) * 0.1, x + i, y + j));
    }
  if (opts.outline !== false) {
    const o = mix(pal[0]!, '#05030a', 0.6);
    img.hline(x, x + w - 1, y, o);
    img.hline(x, x + w - 1, y + h - 1, o);
    img.vline(x, y, y + h - 1, o);
    img.vline(x + w - 1, y, y + h - 1, o);
    img.hline(x + 1, x + w - 2, y + top, mix(pal[0]!, '#05030a', 0.3));
  }
}

/** Stone blocks texture in a rect. */
export function stonework(img: Img, x: number, y: number, w: number, h: number, pal: readonly Color[], mortar: Color, opts: { rh?: number; sw?: number; seed?: number; shade?: (i: number, j: number) => number } = {}) {
  const rh = opts.rh ?? 5;
  const sw = opts.sw ?? 8;
  const seed = opts.seed ?? 3;
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / rh);
    const ly = j % rh;
    const off = (row % 2) * Math.floor(sw / 2) + Math.floor(hash(row, 1, seed) * 3);
    for (let i = 0; i < w; i++) {
      const q = i + off;
      const sx = Math.floor(q / sw);
      const lx = q % sw;
      if (ly === rh - 1 || lx === sw - 1) {
        img.set(x + i, y + j, mortar);
        continue;
      }
      let v = 0.3 + hash(sx, row, seed) * 0.4;
      if (ly === 0 || lx === 0) v += 0.25;
      if (ly === rh - 2) v -= 0.15;
      v += opts.shade ? opts.shade(i, j) : 0;
      img.set(x + i, y + j, dpick(pal, v + (hash(x + i, y + j, seed + 1) - 0.5) * 0.2, x + i, y + j));
    }
  }
}

/** Little flame (2-3 px wide) at (x, y) bottom. */
export function flame(img: Img, x: number, y: number, big = false) {
  img.set(x, y, '#ffcf5a');
  img.set(x, y - 1, '#ffe9a0');
  img.set(x, y - 2, '#ffb43a');
  if (big) {
    img.set(x - 1, y, '#e8862e');
    img.set(x + 1, y, '#e8862e');
    img.set(x, y - 3, '#d0602a');
  }
}

export function outlineDark(img: Img, darken = 0.72) {
  img.outline({ darken });
}

export const C = col;
