#!/usr/bin/env node
// Link-preview (Open Graph / Twitter card) image: the landing hero night scene, cropped to
// 1200x630, with the logo over the sky on the right. Output: apps/client/public/og-image.jpg.
// Run on hshi-u1:  CT_AGENT=lead scripts/remote.sh node scripts/make-og-image.mjs
//                  then scripts/pull.sh apps/client/public/og-image.jpg
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(path.join(root, 'packages/assets/package.json'))('sharp');
const pub = path.join(root, 'apps/client/public');
const W = 1200;
const H = 630;

const hero = await sharp(path.join(pub, 'landing/hero-d.jpg')).resize(W, H, { fit: 'cover', position: 'left' }).toBuffer();
// darken the right half a little so the logo reads on the sky
const shade = Buffer.from(
  `<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">` +
    `<stop offset="0.35" stop-color="#120d1f" stop-opacity="0"/><stop offset="1" stop-color="#120d1f" stop-opacity="0.55"/>` +
    `</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
);
const logoW = 560;
const logo = await sharp(path.join(pub, 'landing/logo.png')).resize({ width: logoW, kernel: 'nearest' }).toBuffer();
const logoH = (await sharp(logo).metadata()).height ?? 0;

await sharp(hero)
  .composite([
    { input: shade, top: 0, left: 0 },
    { input: logo, top: Math.round(H * 0.08), left: W - logoW - 40 },
  ])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(path.join(pub, 'og-image.jpg'));
console.log(`wrote apps/client/public/og-image.jpg (${W}x${H}, logo ${logoW}x${logoH})`);
