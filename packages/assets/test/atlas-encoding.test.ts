// v2.2 perf (WP1): the runtime atlases ship as lossless WebP + PNG fallback — they must decode to
// the exact same RGBA; the portrait strip must hold exact copies of the cast sheet's 'down' frames;
// the cast sheet must not carry avoidable empty blocks.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW, PLAYABLE_IDS } from '../src/cast.js';
import { atlasFormat, castGhostsUrl, castHdPortraitsUrl, castHdUrl, castUrl, portraitsUrl, terrainUrl, WEBP_LOSSLESS_PROBE } from '../src/runtime.js';
import { GHOST_CELL_H, ghostCols, sheetCols } from '../scripts/cast/sheet.js';
import { decodeWebP, losslessWebP, optimisedPNG } from '../scripts/lib/encode.js';
import { Img } from '../scripts/lib/img.js';

const GEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated');
const ATLASES = ['cast', 'cast-ghosts', 'cast-hd', 'cast-hd-portraits', 'cast-portraits', 'terrain', 'decor', 'objects', 'lights', 'square-props', 'social'];
const png = (name: string) => PNG.sync.read(readFileSync(join(GEN, `${name}.png`)));

describe('runtime atlases: WebP lossless == PNG', () => {
  for (const name of ATLASES)
    it(`${name}.webp decodes to exactly ${name}.png`, async () => {
      expect(existsSync(join(GEN, `${name}.webp`))).toBe(true);
      const p = png(name);
      const buf = readFileSync(join(GEN, `${name}.webp`));
      expect(buf.subarray(12, 16).toString('latin1')).toBe('VP8L'); // lossless bitstream, never lossy VP8
      const w = await decodeWebP(buf);
      expect([w.width, w.height]).toEqual([p.width, p.height]);
      expect(Buffer.compare(w.data, p.data)).toBe(0);
    });

  it('the encoders are exact, incl. the colour under fully transparent pixels', async () => {
    const img = new Img(37, 23);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) img.set(x, y, [(x * 7) & 255, (y * 11) & 255, (x * y) & 255, (x + y) % 3 === 0 ? 0 : (x * 29 + y) & 255]);
    const raw = Buffer.from(img.data);
    const w = await decodeWebP(await losslessWebP(img));
    expect(Buffer.compare(w.data, raw)).toBe(0);
    expect(Buffer.compare(PNG.sync.read(optimisedPNG(img)).data, raw)).toBe(0);
  });

  it('the browser probe is a 1x1 lossless WebP', async () => {
    const buf = Buffer.from(WEBP_LOSSLESS_PROBE.split(',')[1]!, 'base64');
    expect(buf.subarray(12, 16).toString('latin1')).toBe('VP8L');
    const w = await decodeWebP(buf);
    expect([w.width, w.height]).toEqual([1, 1]);
  });

  it('outside a browser the runtime URLs stay on the PNG fallback', async () => {
    expect(await atlasFormat).toBe('png');
    for (const u of [castUrl, castGhostsUrl, castHdUrl, castHdPortraitsUrl, portraitsUrl, terrainUrl]) expect(u).toMatch(/\.png(\?|$)/);
  });
});

describe('cast sheet + ghost atlas + portrait strip', () => {
  type Ghosts = { image: string; cellHeight: number; rowOffset: number[]; sheets: Record<string, { x: number; y: number }> };
  const castJson = JSON.parse(readFileSync(join(GEN, 'cast.json'), 'utf8')) as { sheets: Record<string, { x: number; y: number }>; sheetWidth: number; sheetHeight: number; ghosts: Ghosts };
  const strip = JSON.parse(readFileSync(join(GEN, 'cast-portraits.json'), 'utf8')) as { dir: string; frameWidth: number; frameHeight: number; sheets: Record<string, { x: number; y: number; frames: number }> };

  it('the cast sheet has the fewest empty blocks that fit 4096x4096 and only living sheets (v2.4: <= 8 MiB GPU)', () => {
    const c = png('cast');
    const blocks = Object.keys(castJson.sheets).length;
    const cols = c.width / castJson.sheetWidth;
    const rows = c.height / castJson.sheetHeight;
    expect(cols).toBe(sheetCols(blocks));
    expect(rows).toBe(Math.ceil(blocks / cols));
    expect(Math.max(c.width, c.height)).toBeLessThanOrEqual(4096);
    expect(cols * rows - blocks).toBeLessThan(cols);
    expect(Object.keys(castJson.sheets).some((k) => k.includes('/ghost'))).toBe(false);
    expect((c.width * c.height * 4) / 2 ** 20).toBeLessThanOrEqual(8);
  });

  it('the ghost atlas: one column of 8 cells per ghost key, tightly packed, the 2 spare rows of every cell empty', () => {
    const g = png('cast-ghosts');
    const keys = Object.keys(castJson.ghosts.sheets);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => /\/ghost(-spent)?$/.test(k))).toBe(true);
    expect(castJson.ghosts.cellHeight).toBe(GHOST_CELL_H);
    const cols = ghostCols(keys.length);
    expect([g.width, g.height]).toEqual([cols * CAST_FW, Math.ceil(keys.length / cols) * GHOST_CELL_H * CAST_DIRS.length]);
    for (const [key, o] of Object.entries(castJson.ghosts.sheets))
      for (let r = 0; r < CAST_DIRS.length; r++)
        for (let y = CAST_FH; y < GHOST_CELL_H; y++)
          for (let x = 0; x < CAST_FW; x++) expect(g.data[((o.y + r * GHOST_CELL_H + y) * g.width + o.x + x) * 4 + 3], `${key} ${r} ${x},${y}`).toBe(0);
  });

  it('every cast key is in the strip: playable = all down frames, the rest = the idle down frame, pixel-identical', () => {
    const c = png('cast');
    const g = png('cast-ghosts');
    const s = png('cast-portraits');
    expect(strip.dir).toBe('down');
    expect([strip.frameWidth, strip.frameHeight]).toEqual([CAST_FW, CAST_FH]);
    expect(Object.keys(strip.sheets).sort()).toEqual([...Object.keys(castJson.sheets), ...Object.keys(castJson.ghosts.sheets)].sort());
    const down = CAST_DIRS.indexOf('down');
    const cells: [string, PNG, number, number][] = [
      ...Object.entries(castJson.sheets).map(([k, o]) => [k, c, o.x, o.y + down * CAST_FH] as [string, PNG, number, number]),
      ...Object.entries(castJson.ghosts.sheets).map(([k, o]) => [k, g, o.x, o.y + down * GHOST_CELL_H + castJson.ghosts.rowOffset[0]!] as [string, PNG, number, number]),
    ];
    for (const [key, src, x0, y0] of cells) {
      const p = strip.sheets[key]!;
      expect(p.frames).toBe(PLAYABLE_IDS.has(key) ? CAST_FRAMES.length : 1);
      for (let y = 0; y < CAST_FH; y++) {
        const a = ((y0 + y) * src.width + x0) * 4;
        const b = ((p.y + y) * s.width + p.x) * 4;
        const n = p.frames * CAST_FW * 4;
        expect(Buffer.compare(src.data.subarray(a, a + n), s.data.subarray(b, b + n)), `${key} row ${y}`).toBe(0);
      }
    }
  });
});
