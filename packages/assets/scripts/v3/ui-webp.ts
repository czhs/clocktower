// (v3 perf, net front; acting for world-art) Lossless WebP twins of the v3 UI atlases the client loads.
//
// The baked pixel3d UI library (v3/assets/ui, read-only vendor input) ships PNG only. These are the same
// pixels as WebP LOSSLESS (exact RGBA, incl. the colour under fully transparent pixels, like
// scripts/lib/encode.ts losslessWebP): ≈ 70 % smaller. apps/client/vite.config.ts resolves
// `@v3assets/<name>.png?url` to `generated/v3ui/<name>.webp` for every file present here, so the WP6 skin
// (ui/common/v3atlas.ts) and the WP4 overlay (game3d/overlay/atlas.ts) fetch the WebP without a code change.
// test/v3ui-webp.test.ts checks every twin decodes to exactly its PNG (a vendor refresh that changes a PNG
// fails it until this is re-run) and that every sheet the client imports has one.
//
//   CT_AGENT=world-art scripts/remote.sh pnpm --filter @ct/assets exec tsx scripts/v3/ui-webp.ts
//   CT_AGENT=world-art scripts/pull.sh packages/assets/generated/v3ui
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
export const V3_UI_SRC = join(here, '../../../../v3/assets/ui');
export const V3_UI_WEBP_DIR = join(here, '../../generated/v3ui');

/** The v3 UI sheets the client imports as `@v3assets/<name>.png?url` (WP6 v3atlas.ts + WP4 overlay/atlas.ts). */
export const V3_UI_WEBP = [
  'cast-portraits',
  'emotes',
  'events',
  'events-night',
  'indicators',
  'indicators-night',
  'markers',
  'markers-night',
  'portraits',
  'portraits-night',
] as const;

async function main() {
  mkdirSync(V3_UI_WEBP_DIR, { recursive: true });
  let png = 0;
  let webp = 0;
  for (const name of V3_UI_WEBP) {
    const src = readFileSync(join(V3_UI_SRC, `${name}.png`));
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .webp({ lossless: true, quality: 100, effort: 6, exact: true })
      .toBuffer();
    writeFileSync(join(V3_UI_WEBP_DIR, `${name}.webp`), out);
    png += src.length;
    webp += out.length;
    console.log(`${name.padEnd(18)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)} png ${(src.length / 1024).toFixed(1).padStart(6)} KiB  webp ${(out.length / 1024).toFixed(1).padStart(6)} KiB`);
  }
  console.log(`total png ${(png / 1024).toFixed(1)} KiB -> webp ${(webp / 1024).toFixed(1)} KiB (-${((1 - webp / png) * 100).toFixed(1)} %)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
