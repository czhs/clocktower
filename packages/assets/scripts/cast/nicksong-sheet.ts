// Contact sheet for Nick Song + his 'nick-face' emote (review only, not shipped).
// usage: pnpm --filter @ct/assets exec tsx scripts/cast/nicksong-sheet.ts [--out file.png]
//   row 1: the 8 idle directions; row 2: walk down + walk right; row 3: the emote in 8 directions
//   (head hidden above NICK_FACE_CROP_Y, nick_face on the neck) — all at 6x on grass;
//   bottom: game scale (1x, 2x, 3x) on cobbles next to other townsfolk, normal and emoting.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST_ANCHOR, CAST_DIRS, CAST_FH, CAST_FW } from '../../src/cast.js';
import { Img } from '../lib/img.js';
import { buildNickFace, NICK_FACE_ANCHOR, NICK_FACE_CROP_Y, NICK_FACE_NECK } from '../social/nickface.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1]! : join(here, '..', '..', '.review', 'nicksong-sheet.png');

const load = async (id: string) => ((await import(`./${id}.js`)) as { default: CharacterArt }).default;
const nick = await load('nicksong');
const mirror = (src: Img) => {
  const o = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) o.set(src.w - 1 - x, y, src.get(x, y));
  return o;
};
function frame(art: CharacterArt, dir: string, f: number): Img {
  const m: Record<string, DrawnDir> = { left: 'right', 'up-left': 'up-right', 'down-left': 'down-right' };
  return m[dir] ? mirror(art.draw(m[dir]!, f as FrameIndex)) : art.draw(dir as DrawnDir, f as FrameIndex);
}
const face = buildNickFace();
function emoting(src: Img): Img {
  const o = new Img(src.w, src.h);
  o.copy(src, 0, NICK_FACE_CROP_Y, 0, NICK_FACE_CROP_Y, src.w, src.h - NICK_FACE_CROP_Y);
  o.blit(face, CAST_ANCHOR.x + NICK_FACE_NECK.x - NICK_FACE_ANCHOR.x, CAST_ANCHOR.y + NICK_FACE_NECK.y - NICK_FACE_ANCHOR.y);
  return o;
}
function put(dst: Img, src: Img, x0: number, y0: number, s: number) {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const p = src.get(x, y);
      if (p[3] === 0) continue;
      const bg = dst.get(x0 + x * s, y0 + y * s);
      const a = p[3] / 255;
      dst.rect(x0 + x * s, y0 + y * s, s, s, [Math.round(bg[0] + (p[0] - bg[0]) * a), Math.round(bg[1] + (p[1] - bg[1]) * a), Math.round(bg[2] + (p[2] - bg[2]) * a), 255]);
    }
}

const S = 6;
const CW = (CAST_FW + 2) * S;
const CH = (CAST_FH + 2) * S;
const gameH = 3 * (CAST_FH + 8) * 3;
const img = new Img(10 * CW, 3 * CH + gameH);
img.rect(0, 0, img.w, 3 * CH, '#3f5d3b');
img.rect(0, 3 * CH, img.w, gameH, '#8a8274');
CAST_DIRS.forEach((d, i) => put(img, frame(nick, d, 0), i * CW, 0, S));
// face alone, big
put(img, face, 8 * CW + S * 4, S * 6, S + 2);
[0, 1, 2, 3, 4].forEach((f, i) => put(img, frame(nick, 'down', f), i * CW, CH, S));
[1, 2, 3, 4].forEach((f, i) => put(img, frame(nick, 'right', f), (5 + i) * CW, CH, S));
CAST_DIRS.forEach((d, i) => put(img, emoting(frame(nick, d, 0)), i * CW, 2 * CH, S));
put(img, emoting(frame(nick, 'down', 2)), 8 * CW, 2 * CH, S);
// game scale
const others = await Promise.all(['npc-vendor', 'fox', 'npc-elder'].map(load));
let y = 3 * CH + 6;
for (const s of [1, 2, 3]) {
  let x = 8;
  const row: Img[] = [frame(others[0]!, 'down', 0), frame(nick, 'down', 0), frame(nick, 'down-right', 0), emoting(frame(nick, 'down', 0)), emoting(frame(nick, 'right', 0)), frame(others[1]!, 'down', 0), frame(others[2]!, 'down', 0)];
  for (const fr of row) {
    put(img, fr, x, y, s);
    x += (CAST_FW + 4) * s;
  }
  y += (CAST_FH + 6) * s;
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, img.toPNG());
console.log('wrote', out);
