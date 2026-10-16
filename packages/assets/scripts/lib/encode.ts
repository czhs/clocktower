// Runtime atlas encoders (v2.2 perf, WP1). Every atlas the client downloads is written twice:
//   <name>.webp  WebP LOSSLESS (exact RGBA, incl. the colour under fully transparent pixels) — what
//                every current browser loads (Safari >= 14 / iOS 14);
//   <name>.png   the same pixels as a re-optimised PNG — the fallback for anything older.
// Lossy WebP is never used: it is bigger than lossless for this pixel art and smears pixels.
// Deterministic: sharp is pinned to an exact version in package.json (it bundles its own libwebp),
// and pngjs/zlib are deterministic for fixed options — re-running produces byte-identical files.
import { PNG } from 'pngjs';
import sharp from 'sharp';
import type { Img } from './img.js';

/**
 * PNG at zlib level 9, smallest of a few filter choices. pngjs' defaults (Z_RLE + adaptive filters)
 * are 2–6x bigger on flat pixel art; for these sheets "no filter" + the default strategy usually wins
 * (cast 3588 → 606 KiB), the soft light glows prefer the Sub filter.
 */
export function optimisedPNG(img: Img): Buffer {
  const png = new PNG({ width: img.w, height: img.h });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  let best: Buffer | null = null;
  for (const filterType of [0, 1, -1]) {
    const b = PNG.sync.write(png, { colorType: 6, deflateLevel: 9, deflateStrategy: 0, filterType });
    if (!best || b.length < best.length) best = b;
  }
  return best!;
}

/**
 * WebP lossless at maximum compression (quality 100 = most effort in lossless mode, method 6).
 * `exact` keeps the RGB of fully transparent pixels, so the decode is bit-identical to the PNG.
 */
export async function losslessWebP(img: Img): Promise<Buffer> {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.w, height: img.h, channels: 4 } })
    .webp({ lossless: true, quality: 100, effort: 6, exact: true })
    .toBuffer();
}

/** Decode a WebP to raw RGBA (tests / verification). */
export async function decodeWebP(buf: Buffer): Promise<{ width: number; height: number; data: Buffer }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}
