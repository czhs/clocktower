// (v2.4 perf P2) The ghost variants moved to their own compact atlas (cast-ghosts.*: one cell per
// direction, hover frames as row offsets). Every frame must be pixel-identical to the old 5-frame
// ghost block (ghostOf on the living idle frame), and the committed atlas must be what the
// generator builds.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW } from '../src/cast.js';
import { buildCast, ghostFrame, ghostOf } from '../scripts/cast/index.js';
import { hdPortraitStrip } from '../scripts/cast/hd.js';
import type { FrameIndex } from '../scripts/cast/types.js';
import { Img } from '../scripts/lib/img.js';

const gen = (n: string) => new URL(`../generated/${n}`, import.meta.url);

describe('cast-ghosts atlas', () => {
  it('reproduces every old ghost frame exactly and matches the committed files', async () => {
    const cast = await buildCast();
    const m = cast.manifest as { sheets: Record<string, { x: number; y: number }>; ghosts: { sheets: Record<string, { x: number; y: number }> } };
    expect(Buffer.compare(Buffer.from(cast.img.data), Buffer.from(Img.fromPNG(readFileSync(gen('cast.png'))).data))).toBe(0);
    expect(Buffer.compare(Buffer.from(cast.ghosts.data), Buffer.from(Img.fromPNG(readFileSync(gen('cast-ghosts.png'))).data))).toBe(0);
    expect(JSON.parse(readFileSync(gen('cast.json'), 'utf8'))).toEqual(JSON.parse(JSON.stringify(cast.manifest)));
    let n = 0;
    for (const [key, at] of Object.entries(m.ghosts.sheets)) {
      const id = key.slice(0, key.lastIndexOf('/'));
      const live = m.sheets[id]!;
      CAST_DIRS.forEach((_, r) => {
        const alive = new Img(CAST_FW, CAST_FH);
        alive.copy(cast.img, 0, 0, live.x, live.y + r * CAST_FH, CAST_FW, CAST_FH);
        for (let f = 0; f < CAST_FRAMES.length; f++) {
          const want = ghostOf(alive, f as FrameIndex, key.endsWith('/ghost'));
          expect(Buffer.compare(Buffer.from(ghostFrame(cast.ghosts, at, r, f).data), Buffer.from(want.data)), `${key} ${CAST_DIRS[r]} ${f}`).toBe(0);
          n++;
        }
      });
    }
    expect(n).toBe(Object.keys(m.ghosts.sheets).length * CAST_DIRS.length * CAST_FRAMES.length);
  }, 60_000);

  it('cast-hd-portraits is the down column of cast-hd', () => {
    const sheet = Img.fromPNG(readFileSync(gen('cast-hd.png')));
    const strip = Img.fromPNG(readFileSync(gen('cast-hd-portraits.png')));
    expect(Buffer.compare(Buffer.from(strip.data), Buffer.from(hdPortraitStrip(sheet).data))).toBe(0);
    expect(strip.h).toBe(sheet.h);
    expect(strip.w * CAST_DIRS.length).toBe(sheet.w);
    expect(CAST_DIRS.indexOf('down')).toBe(0);
  });
});
