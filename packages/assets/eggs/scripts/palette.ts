// docs/art-direction.md "Master palette" as data + the snap/limit pass every egg frame goes
// through (blockout or AI): opaque pixels snap to the nearest master swatch, translucent pixels
// (contact shadows) become Soot at their own alpha, then the frame is limited to its colour budget
// (ordinary prop 8, creature/character 12, landmark 16) by merging the rarest swatches.
import { Img } from '../../scripts/lib/img.js';

const HEX = `
#191C29 #333646 #626979
#353442 #505061 #747383 #A39DAB
#252C41 #394764 #596D89 #889BAE
#402832 #713E3D #A65F4B #C98967
#493C2D #77603B #AE8C4E #D1B879
#30282C #594034 #876044 #B18C62
#8B8277 #BDB3A0 #DED2B7
#3B3330 #66503D #937354
#243A34 #3F5540 #64774B #91A46A
#1F3046 #304F6B #577B93 #A6C5CA
#4B3035 #805047 #B57D60
#75463D #B67D59 #DDA677
#A06B58 #D8A17E #F0C8A0
#30243F #574064 #806184
#492C3B #814953 #B37072
#243F44 #41676A #729395
#665032 #A38348 #D5B56A
#526E83 #8EB4C2 #CCE1DE
#243452 #D98043 #F0B85F #FFE2A0
`;
export const MASTER: [number, number, number][] = HEX.trim()
  .split(/\s+/)
  .map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
export const SOOT: [number, number, number] = [0x19, 0x1c, 0x29];

function dist(c: readonly number[], r: number, g: number, b: number): number {
  const rm = (c[0]! + r) / 2;
  const dr = c[0]! - r;
  const dg = c[1]! - g;
  const db = c[2]! - b;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
function nearestOf(pal: readonly (readonly number[])[], r: number, g: number, b: number): number {
  let bi = 0;
  let bd = Infinity;
  pal.forEach((c, i) => {
    const d = dist(c, r, g, b);
    if (d < bd) [bd, bi] = [d, i];
  });
  return bi;
}

export function budgetFor(frame: string): number {
  if (frame === 'egg_wean' || frame === 'egg_hamerschlag') return 16;
  if (frame.startsWith('egg_fence')) return 10;
  if (/^egg_(scotty|honk|chonk|cow|requin|polly|frog|opal|cilantro|fox|panda|theo|greenting)/.test(frame)) return 12;
  return 8;
}

/** Snap to the master palette and enforce the colour budget (in place). Returns colours used. */
export function toMaster(img: Img, budget: number): number {
  const d = img.data;
  const idx = new Int16Array(img.w * img.h).fill(-1);
  for (let p = 0; p < img.w * img.h; p++) {
    const a = d[p * 4 + 3]!;
    if (a === 0) continue;
    if (a < 200) {
      // soft contact shadow: Soot mask at its own alpha
      d[p * 4] = SOOT[0];
      d[p * 4 + 1] = SOOT[1];
      d[p * 4 + 2] = SOOT[2];
      continue;
    }
    idx[p] = nearestOf(MASTER, d[p * 4]!, d[p * 4 + 1]!, d[p * 4 + 2]!);
  }
  const count = new Map<number, number>();
  for (const i of idx) if (i >= 0) count.set(i, (count.get(i) ?? 0) + 1);
  // the outline swatch is always kept
  while (count.size > budget) {
    const [rare] = [...count.entries()].filter(([i]) => i !== 0).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]!;
    const keep = [...count.keys()].filter((i) => i !== rare);
    const to = keep[nearestOf(keep.map((i) => MASTER[i]!), ...(MASTER[rare]! as [number, number, number]))]!;
    count.set(to, count.get(to)! + count.get(rare)!);
    count.delete(rare);
    for (let p = 0; p < idx.length; p++) if (idx[p] === rare) idx[p] = to;
  }
  for (let p = 0; p < idx.length; p++) {
    const i = idx[p]!;
    if (i < 0) continue;
    const c = MASTER[i]!;
    d[p * 4] = c[0];
    d[p * 4 + 1] = c[1];
    d[p * 4 + 2] = c[2];
    d[p * 4 + 3] = 255;
  }
  return count.size;
}
