// v2.2 perf (WP1): the runtime atlases ship as lossless WebP + PNG fallback — they must decode to
// the exact same RGBA; the portrait strip must hold exact copies of the cast sheet's 'down' frames;
// the cast sheet must not carry avoidable empty blocks.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW, PLAYABLE_IDS } from '../src/cast.js';
import { atlasFormat, castHdUrl, castUrl, portraitsUrl, terrainUrl, WEBP_LOSSLESS_PROBE } from '../src/runtime.js';
import { sheetCols } from '../scripts/cast/sheet.js';
import { decodeWebP, losslessWebP, optimisedPNG } from '../scripts/lib/encode.js';
import { Img } from '../scripts/lib/img.js';

const GEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated');
const ATLASES = ['cast', 'cast-hd', 'cast-portraits', 'terrain', 'decor', 'objects', 'lights', 'square-props', 'social'];
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
    for (const u of [castUrl, castHdUrl, portraitsUrl, terrainUrl]) expect(u).toMatch(/\.png(\?|$)/);
  });
});

describe('cast sheet + portrait strip', () => {
  const castJson = JSON.parse(readFileSync(join(GEN, 'cast.json'), 'utf8')) as { sheets: Record<string, { x: number; y: number }>; sheetWidth: number; sheetHeight: number };
  const strip = JSON.parse(readFileSync(join(GEN, 'cast-portraits.json'), 'utf8')) as { dir: string; frameWidth: number; frameHeight: number; sheets: Record<string, { x: number; y: number; frames: number }> };

  it('the cast sheet has the fewest empty blocks that fit 4096x4096', () => {
    const c = png('cast');
    const blocks = Object.keys(castJson.sheets).length;
    const cols = c.width / castJson.sheetWidth;
    const rows = c.height / castJson.sheetHeight;
    expect(cols).toBe(sheetCols(blocks));
    expect(rows).toBe(Math.ceil(blocks / cols));
    expect(Math.max(c.width, c.height)).toBeLessThanOrEqual(4096);
    expect(cols * rows - blocks).toBeLessThan(cols);
  });

  it('every cast key is in the strip: playable = all down frames, the rest = the idle down frame, pixel-identical', () => {
    const c = png('cast');
    const s = png('cast-portraits');
    expect(strip.dir).toBe('down');
    expect([strip.frameWidth, strip.frameHeight]).toEqual([CAST_FW, CAST_FH]);
    expect(Object.keys(strip.sheets).sort()).toEqual(Object.keys(castJson.sheets).sort());
    const row = CAST_DIRS.indexOf('down') * CAST_FH;
    for (const [key, o] of Object.entries(castJson.sheets)) {
      const p = strip.sheets[key]!;
      expect(p.frames).toBe(PLAYABLE_IDS.has(key) ? CAST_FRAMES.length : 1);
      for (let y = 0; y < CAST_FH; y++) {
        const a = ((o.y + row + y) * c.width + o.x) * 4;
        const b = ((p.y + y) * s.width + p.x) * 4;
        const n = p.frames * CAST_FW * 4;
        expect(Buffer.compare(c.data.subarray(a, a + n), s.data.subarray(b, b + n)), `${key} row ${y}`).toBe(0);
      }
    }
  });
});
