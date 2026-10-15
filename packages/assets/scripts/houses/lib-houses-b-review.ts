// Review sheet for houses-b (run on hshi-u1):
//   pnpm --filter @ct/assets exec tsx scripts/houses/lib-houses-b-review.ts
// Writes .review/houses-b.png (closed + open doors, x3, with the door tile marked) and checks
// the door data (leaf == sprite pixels, door next to the door tile), and draw times.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { townLayout, townMap, TS } from '../../src/layout.js';
import { drawBuilding } from '../buildings.js';
import { Img } from '../lib/img.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUTDIR = join(here, '..', '..', '.review');
mkdirSync(OUTDIR, { recursive: true });
const ids = (process.argv[2] ?? 'house-5,house-6,house-7,house-8,house-9').split(',');
const all = [...townLayout.buildings];
const pad = 20;
const sprites = ids.map((id) => {
  const b = all.find((x) => x.id === id)!;
  const i = all.indexOf(b);
  const t0 = performance.now();
  const s = drawBuilding(b, townMap.styles[id]!, i);
  const ms = performance.now() - t0;
  // checks
  const errs: string[] = [];
  if (s.door && s.leaf) {
    for (let j = 0; j < s.door.h; j++)
      for (let k = 0; k < s.door.w; k++) {
        const a = s.leaf.get(k, j);
        if (a[3] === 0) continue;
        const c = s.img.get(s.door.x + k, s.door.y + j);
        if (c.some((v, q) => v !== a[q])) errs.push(`leaf px ${k},${j} != sprite`);
      }
  } else errs.push('no door');
  const fpW = b.footprint.w * TS;
  const extra = s.img.h - b.footprint.h * TS;
  console.log(`${id} ${b.name}: ${s.img.w}x${s.img.h} (fp ${fpW}, extra ${extra}) door ${JSON.stringify(s.door)} doorTile ${JSON.stringify(b.door)} fp ${JSON.stringify(b.footprint)} windows ${s.windows.length} chimney ${JSON.stringify(s.chimney)} ${ms.toFixed(0)} ms ${errs.slice(0, 3).join('; ')}`);
  return { b, s };
});
const cw = Math.max(...sprites.map(({ s }) => s.img.w)) + pad * 2;
const ch = Math.max(...sprites.map(({ s }) => s.img.h)) + 8;
const sheet = new Img(cw * sprites.length, ch * 2);
sheet.rect(0, 0, sheet.w, sheet.h, '#2e4a2c');
sprites.forEach(({ b, s }, k) => {
  const x = k * cw + pad;
  const y = ch - 4 - s.img.h;
  for (const row of [0, 1]) {
    // door tile marker (where the player stands)
    const tx = x + (b.door.x - b.footprint.x) * TS;
    const ty = y + row * ch + s.img.h - (b.footprint.y + b.footprint.h - b.door.y) * TS;
    sheet.blendRect(tx, ty, TS, TS, '#8a6a4a', 0.6);
    sheet.blit(s.img, x, y + row * ch);
  }
  if (s.door && s.doorway) sheet.copy(s.doorway, x + s.door.x, y + ch + s.door.y);
});
const up = (src: Img, f: number) => {
  const o = new Img(src.w * f, src.h * f);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(Math.floor(x / f), Math.floor(y / f)));
  return o;
};
writeFileSync(join(OUTDIR, 'houses-b.png'), up(sheet, 3).toPNG());
writeFileSync(join(OUTDIR, 'houses-b-1x.png'), sheet.toPNG());
