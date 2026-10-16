// Pack the generated 5-column / 8-direction source into the runtime atlas.
// No mirroring: Brianbi's right foot is bare in every view.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAST_DIRS, CAST_FRAMES } from '../../src/cast.js';
import { Img } from '../lib/img.js';

const art = new URL('../../art/', import.meta.url);
const src = Img.fromPNG(readFileSync(new URL('brianbi-source.png', art)));
// Generated grids have slightly uneven gutters. Cut only on empty scanlines so a
// row's hair/feet cannot be sliced off by an assumed exact eighth of the canvas.
const rowCuts = [0, ...Array.from({ length: 7 }, (_, i) => {
  const expected = (i + 1) * src.h / 8;
  const gap: number[] = [];
  for (let y = Math.round(expected - src.h / 40); y < expected + src.h / 40; y++) {
    let clear = true;
    for (let x = 0; x < src.w; x++) if (src.alpha(x, y) >= 32) { clear = false; break; }
    if (clear) gap.push(y);
  }
  if (!gap.length) throw new Error(`No clear gutter before Brianbi direction ${i + 1}`);
  return gap[Math.floor(gap.length / 2)]!;
}), src.h];
const cells = CAST_DIRS.flatMap((_, row) => CAST_FRAMES.map((_, col) => {
  const left = Math.round(col * src.w / 5), right = Math.round((col + 1) * src.w / 5);
  const top = rowCuts[row]!, bottom = rowCuts[row + 1]!;
  let x0 = right, x1 = left, y0 = bottom, y1 = top;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (src.alpha(x, y) < 32) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < x0 || y1 < y0) throw new Error(`Empty Brianbi frame ${row}/${col}`);
  if (y0 <= top || y1 >= bottom - 1) throw new Error(`Clipped Brianbi frame ${row}/${col}`);
  // Align the head, not the moving arms/feet, to prevent lateral jitter during a stride.
  let hx0 = right, hx1 = left;
  for (let y = y0; y < y0 + (y1 - y0) * 0.16; y++) for (let x = x0; x <= x1; x++) {
    if (src.alpha(x, y) < 128) continue;
    hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x);
  }
  return { row, col, left, right, top, bottom, x0, x1, y0, y1, cx: (hx0 + hx1) / 2 };
}));
// One common scale preserves body proportions throughout the animation.
const heights = cells.map((c) => c.y1 - c.y0 + 1).sort((a, b) => a - b);
const scale = 170 / heights[Math.floor(heights.length / 2)]!;
const out = new Img(160 * 8, 200 * 5);
for (const c of cells) {
  for (let y = 0; y < 200; y++) for (let x = 0; x < 160; x++) {
    const sx = c.cx + (x - 80) / scale;
    const sy = c.y1 + (y - 190) / scale;
    // Premultiplied-alpha bilinear resampling keeps silhouette edges clean.
    let a = 0, r = 0, g = 0, b = 0;
    const ix = Math.floor(sx), iy = Math.floor(sy);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      if (ix + i < c.left || ix + i >= c.right || iy + j < c.top || iy + j >= c.bottom) continue;
      const p = src.get(ix + i, iy + j);
      if (p[3] < 8) continue; // discard near-transparent compression/matte specks
      const w = (i ? sx - ix : 1 - (sx - ix)) * (j ? sy - iy : 1 - (sy - iy));
      const wa = w * p[3];
      a += wa; r += p[0] * wa; g += p[1] * wa; b += p[2] * wa;
    }
    if (a > 0) out.set(c.row * 160 + x, c.col * 200 + y, [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a)]);
  }
}
const target = new URL('brianbi.png', art);
writeFileSync(target, out.toPNG());
console.log(`Packed 40 Brianbi frames into ${fileURLToPath(target)}`);
