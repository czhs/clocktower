// Dev runner for the social sheet (does not touch generated/): reads generated/cast.png + cast.json
// (and preview-town.png for an in-situ mock), writes review images into .review/social/.
//   pnpm --filter @ct/assets exec tsx scripts/social/preview.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from '../lib/img.js';
import { buildSocial, type CastManifestLike } from './index.js';
import { PIN_ICON } from './pins.js';

const here = dirname(fileURLToPath(import.meta.url));
const GEN = join(here, '..', '..', 'generated');
const OUT = join(here, '..', '..', '.review', 'social');
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const cast = Img.fromPNG(readFileSync(join(GEN, 'cast.png')));
const cm = JSON.parse(readFileSync(join(GEN, 'cast.json'), 'utf8')) as CastManifestLike;
const res = buildSocial(cast, cm);
console.log(`buildSocial ${Date.now() - t0} ms`);
writeFileSync(join(OUT, 'social.png'), res.img.toPNG());
writeFileSync(join(OUT, 'social-x4.png'), res.review!.toPNG());
writeFileSync(join(OUT, 'social.json'), JSON.stringify(res.manifest, null, 1));
const man = res.manifest as { frames: Record<string, { x: number; y: number; w: number; h: number }>; meta: { headCrops: Record<string, { x: number; y: number; size: number; face: { x: number; y: number } | null }> } };
const frame = (n: string) => {
  const r = man.frames[n]!;
  const o = new Img(r.w, r.h);
  o.copy(res.img, 0, 0, r.x, r.y, r.w, r.h);
  return o;
};
const up = (src: Img, f: number) => {
  const o = new Img(src.w * f, src.h * f);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(Math.floor(x / f), Math.floor(y / f)));
  return o;
};

// head-crop debug: every down idle frame with its crop box, 4x
{
  const ids = Object.keys(man.meta.headCrops);
  const S = 4;
  const PER = 8;
  const CW = 34 * S;
  const CH = 40 * S + 60;
  const o = new Img(PER * CW, Math.ceil(ids.length / PER) * CH);
  o.rect(0, 0, o.w, o.h, '#3f5d3b');
  ids.forEach((id, i) => {
    const gx = (i % PER) * CW;
    const gy = Math.floor(i / PER) * CH;
    const s = cm.sheets[id]!;
    const f = new Img(32, 40);
    f.copy(cast, 0, 0, s.x, s.y, 32, 40);
    const c = man.meta.headCrops[id]!;
    for (let k = 0; k < c.size; k++) {
      for (const [x, y] of [
        [c.x + k, c.y],
        [c.x + k, c.y + c.size - 1],
        [c.x, c.y + k],
        [c.x + c.size - 1, c.y + k],
      ] as const)
        if (f.alpha(x, y) < 200) f.set(x, y, '#ff00ff');
    }
    if (c.face) f.set(Math.floor(c.face.x), Math.floor(c.face.y), '#00ffff');
    o.blit(up(f, S), gx, gy);
    o.blit(up(frame(`icon_${id}`), 4), gx + 40, gy + 40 * S + 4);
  });
  writeFileSync(join(OUT, 'crops.png'), o.toPNG());
}

// in-situ mock on the town preview (day + night), 2x and 1x
const townPath = join(GEN, 'preview-town.png');
if (existsSync(townPath)) {
  const town = Img.fromPNG(readFileSync(townPath));
  const CX = 18 * 16;
  const CY = 13 * 16;
  const W = 260;
  const H = 150;
  const scene = new Img(W, H);
  scene.copy(town, 0, 0, CX, CY, W, H);
  const put = (id: string, fx: number, fy: number, dirRow = 0) => {
    const s = cm.sheets[id]!;
    const f = new Img(32, 40);
    f.copy(cast, 0, 0, s.x, s.y + dirRow * 40, 32, 40);
    scene.blit(f, fx - 16, fy - 38);
  };
  const ov = new Img(W, H); // overlay layer: pins + emotes
  const pin = (color: string, id: string, x: number, y: number, shadow = true) => {
    if (shadow) ov.blit(frame('pin_shadow'), x - 6, y - 2);
    const p = frame(`pin_${color}`);
    p.blit(frame(`icon_${id}`), PIN_ICON.left, PIN_ICON.top);
    ov.blit(p, x - 8, y - 25);
  };
  put('fox', 60, 80);
  put('frog', 150, 100, 6);
  put('cilantro', 210, 70);
  put('snail', 110, 130);
  put('chonk', 236, 140);
  // fox points right at the frog
  ov.blit(frame('point_right_1'), 60 + 14 - 10, 80 - 26 - 10);
  ov.blit(frame('ping_1'), 150 - 13, 100 - 7);
  // place-pins and person-pins
  pin('crimson', 'owl', 40, 130);
  pin('gold', 'storyteller', 210, 70 - 40, false);
  pin('violet', 'rabbit', 110, 130 - 30, false);
  pin('teal', 'fox', 236, 140 - 38, false);
  pin('black', 'requin', 90, 40);
  pin('white', 'polly', 180, 40);
  pin('green', 'mole', 20, 60);
  pin('orange', 'goat', 250, 30);
  ov.blit(frame('pin_drop_1'), 40 - 12, 130 - 9);
  const tint = (im: Img) => {
    for (let i = 0; i < im.data.length; i += 4) {
      im.data[i] = im.data[i]! * 0.32;
      im.data[i + 1] = im.data[i + 1]! * 0.36;
      im.data[i + 2] = im.data[i + 2]! * 0.62;
    }
    return im;
  };
  const day = scene.clone();
  day.blit(ov, 0, 0);
  const nightAll = tint(day.clone());
  const nightTop = tint(scene.clone());
  nightTop.blit(ov, 0, 0);
  const out = new Img(W * 2, H * 6 + 16);
  out.blit(up(day, 2), 0, 0);
  out.blit(up(nightAll, 2), 0, H * 2 + 8);
  out.blit(up(nightTop, 2), 0, H * 4 + 16);
  writeFileSync(join(OUT, 'scene.png'), out.toPNG());
  writeFileSync(join(OUT, 'scene-1x.png'), day.toPNG());
}
console.log('ok');
