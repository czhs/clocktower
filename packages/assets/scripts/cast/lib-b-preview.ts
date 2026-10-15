// cast-b review tool: per character a block of rows (8 idle dirs; walk cycles of the 5 drawn dirs)
// at a chosen scale, plus a 1x and 2x strip on a cobble-ish background.
// usage: tsx scripts/cast/lib-b-preview.ts snail toad [--out .review/x.png] [--night] [--scale 6]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CAST_DIRS, CAST_FH, CAST_FW } from '../../src/cast.js';
import { Img } from '../lib/img.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = opt('--out') ?? '.review/cast-b.png';
const S = Number(opt('--scale') ?? 6);
const night = args.includes('--night');
const ids = args.filter((a, i) => !a.startsWith('--') && !['--out', '--scale', '--rows', '--cols'].includes(args[i - 1] ?? ''));
const BG = night ? '#1b2238' : '#5a4e52';
const mirror = (src: Img) => {
  const o = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) o.set(src.w - 1 - x, y, src.get(x, y));
  return o;
};
function frame(art: CharacterArt, dir: string, f: number): Img {
  const left = dir === 'left' || dir === 'up-left' || dir === 'down-left';
  if (!left) return art.draw(dir as DrawnDir, f as FrameIndex);
  if (art.drawMirrored) return art.drawMirrored(dir as 'left', f as FrameIndex);
  return mirror(art.draw(({ left: 'right', 'up-left': 'up-right', 'down-left': 'down-right' } as Record<string, DrawnDir>)[dir]!, f as FrameIndex));
}
const allRows: [string, number][][] = [CAST_DIRS.map((d) => [d, 0] as [string, number])];
for (const d of ['down', 'down-right', 'right', 'up-right', 'up']) allRows.push([0, 1, 2, 3, 4].map((f) => [d, f] as [string, number]));
const pick = opt('--rows');
const ncol = Number(opt('--cols') ?? 8);
const rows = (pick ? pick.split(',').map((i) => allRows[Number(i)]!) : allRows).map((r) => r.slice(0, ncol));
const CW = (CAST_FW + 2) * S;
const CH = (CAST_FH + 2) * S;
const block = rows.length * CH + (CAST_FH + 4) * 3;
const img = new Img(Math.max(ncol * CW, 8 * (CAST_FW + 2) * 3 + 30), ids.length * block);
img.rect(0, 0, img.w, img.h, BG);
const put = (fr: Img, ox: number, oy: number, s: number) => {
  for (let y = 0; y < CAST_FH; y++)
    for (let x = 0; x < CAST_FW; x++) {
      const p = fr.get(x, y);
      if (p[3] === 0) continue;
      const bg = img.get(ox + x * s, oy + y * s);
      const a = p[3] / 255;
      img.rect(ox + x * s, oy + y * s, s, s, [Math.round(bg[0] + (p[0] - bg[0]) * a), Math.round(bg[1] + (p[1] - bg[1]) * a), Math.round(bg[2] + (p[2] - bg[2]) * a), 255]);
    }
};
for (const [k, id] of ids.entries()) {
  const art = ((await import(`./${id}.js`)) as { default: CharacterArt }).default;
  const oy = k * block;
  rows.forEach((r, j) => r.forEach(([d, f], i) => put(frame(art, d, f), i * CW, oy + j * CH, S)));
  // 1x and 2x strips (idle 8 dirs)
  const sy = oy + rows.length * CH;
  CAST_DIRS.forEach((d, i) => put(frame(art, d, 0), 4 + i * (CAST_FW + 2), sy, 1));
  CAST_DIRS.forEach((d, i) => put(frame(art, d, 0), 8 * (CAST_FW + 2) + 20 + i * (CAST_FW + 2) * 2, sy, 2));
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, img.toPNG());
console.log('wrote', out);
