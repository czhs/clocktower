import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAST_DIRS, CAST_FRAMES } from '../src/cast.js';
import { hdFrame } from '../scripts/cast/hd.js';
import { Img } from '../scripts/lib/img.js';

describe('HD cast artwork', () => {
  it('keeps complete silhouettes inside every frame, with space for hair and feet', () => {
    for (const dir of CAST_DIRS) for (let f = 0; f < CAST_FRAMES.length; f++) {
      const img = hdFrame('brianbi', dir, f);
      let minX = img.w, minY = img.h, maxX = 0, maxY = 0;
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
        if (img.alpha(x, y) < 32) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      expect(minX, `${dir}/${f} left`).toBeGreaterThan(4);
      expect(minY, `${dir}/${f} hair`).toBeGreaterThan(10);
      expect(maxX, `${dir}/${f} right`).toBeLessThan(img.w - 5);
      expect(maxY, `${dir}/${f} feet`).toBeLessThan(img.h - 5);
      expect(maxY - minY).toBeGreaterThan(150);
    }
  });

  it('ships five distinct poses per direction and an atlas matching its manifest', () => {
    const url = new URL('../generated/cast-hd.json', import.meta.url);
    const manifest = JSON.parse(readFileSync(url, 'utf8'));
    const atlas = Img.fromPNG(readFileSync(new URL('../generated/cast-hd.png', import.meta.url)));
    for (const dir of CAST_DIRS) {
      const hashes = CAST_FRAMES.map((_, f) => createHash('sha256').update(hdFrame('brianbi', dir, f).data).digest('hex'));
      expect(new Set(hashes).size).toBe(CAST_FRAMES.length);
      for (let f = 0; f < CAST_FRAMES.length; f++) {
        const cell = new Img(manifest.frameWidth, manifest.frameHeight);
        cell.copy(atlas, 0, 0, CAST_DIRS.indexOf(dir) * cell.w, (manifest.rows.brianbi + f) * cell.h, cell.w, cell.h);
        expect(cell.data).toEqual(hdFrame('brianbi', dir, f).data);
      }
    }
    expect(atlas.h).toBe((manifest.rows['brianbi/ghost-spent'] + 1) * manifest.frameHeight);
  });
});
