// Render a review sheet for some characters (8 idle directions + down/right/up walk cycles, 6x).
// usage: pnpm --filter @ct/assets exec tsx scripts/cast/preview.ts frog fox [--out .review/x.png] [--night]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW } from '../../src/cast.js';
import { Img } from '../lib/img.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1]! : join(here, '..', '..', '.review', `cast-${args.filter((a) => !a.startsWith('--')).join('-').slice(0, 60)}.png`);
const night = args.includes('--night');
const ids = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
const S = 6;
const cells: [string, number][] = [...CAST_DIRS.map((d) => [d, 0] as [string, number]), ...[1, 2, 3, 4].map((f) => ['down', f] as [string, number]), ...[1, 2, 3, 4].map((f) => ['right', f] as [string, number]), ...[1, 2, 3, 4].map((f) => ['up', f] as [string, number])];
const img = new Img(cells.length * (CAST_FW + 2) * S, ids.length * (CAST_FH + 2) * S);
img.rect(0, 0, img.w, img.h, night ? '#1b2238' : '#3f5d3b');
const mirror = (src: Img) => {
  const o = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) o.set(src.w - 1 - x, y, src.get(x, y));
  return o;
};
for (const [row, id] of ids.entries()) {
  const art = ((await import(`./${id}.js`)) as { default: CharacterArt }).default;
  cells.forEach(([dir, f], k) => {
    const left = dir === 'left' || dir === 'up-left' || dir === 'down-left';
    const fr = left
      ? art.drawMirrored
        ? art.drawMirrored(dir as 'left', f as FrameIndex)
        : mirror(art.draw(({ left: 'right', 'up-left': 'up-right', 'down-left': 'down-right' } as Record<string, DrawnDir>)[dir]!, f as FrameIndex))
      : art.draw(dir as DrawnDir, f as FrameIndex);
    for (let y = 0; y < CAST_FH; y++)
      for (let x = 0; x < CAST_FW; x++) {
        const p = fr.get(x, y);
        if (p[3] === 0) continue;
        const bg = img.get((k * (CAST_FW + 2) + x) * S, (row * (CAST_FH + 2) + y) * S);
        const a = p[3] / 255;
        const c = [Math.round(bg[0] + (p[0] - bg[0]) * a), Math.round(bg[1] + (p[1] - bg[1]) * a), Math.round(bg[2] + (p[2] - bg[2]) * a), 255] as const;
        img.rect((k * (CAST_FW + 2) + x) * S, (row * (CAST_FH + 2) + y) * S, S, S, c);
      }
  });
}
void CAST_FRAMES;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, img.toPNG());
console.log('wrote', out);
