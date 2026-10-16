// HD source sheets have eight direction columns and five animation rows (idle + four steps).
// Both the HD town texture and the small portrait/pin atlas use the same authored poses.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST, CAST_ANCHOR, CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW, CAST_HD_SCALE as K } from '../../src/cast.js';
import { Img } from '../lib/img.js';

const ART = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'art');
const HW = CAST_FW * K;
const HH = CAST_FH * K;

const sheets = new Map<string, Img>();
function sheetOf(id: string): Img {
  let s = sheets.get(id);
  if (!s) {
    s = Img.fromPNG(readFileSync(join(ART, `${id}.png`)));
    if (s.w !== HW * CAST_DIRS.length || s.h !== HH * CAST_FRAMES.length) throw new Error(`art/${id}.png is ${s.w}x${s.h}, want ${HW * CAST_DIRS.length}x${HH * CAST_FRAMES.length}`);
    sheets.set(id, s);
  }
  return s;
}

/** The HD pose of `id` facing `dir` (0 = idle, 1..4 = walk). */
export function hdFrame(id: string, dir: (typeof CAST_DIRS)[number], frame = 0): Img {
  const o = new Img(HW, HH);
  o.copy(sheetOf(id), 0, 0, CAST_DIRS.indexOf(dir) * HW, frame * HH, HW, HH);
  return o;
}

/** Box-filter downscale by K with premultiplied alpha (no dark/light fringes). */
export function areaDownscale(src: Img, k = K): Img {
  const o = new Img(Math.floor(src.w / k), Math.floor(src.h / k));
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const p = src.get(x * k + i, y * k + j);
          r += p[0] * p[3];
          g += p[1] * p[3];
          b += p[2] * p[3];
          a += p[3];
        }
      if (a === 0) continue;
      o.set(x, y, [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / (k * k))]);
    }
  return o;
}

/** Matching 32x40 pose for cast.png, including articulated walk frames. */
export function smallFrame(id: string, dir: (typeof CAST_DIRS)[number], frame: number): Img {
  return areaDownscale(hdFrame(id, dir, frame));
}

/**
 * HD ghost, matching the pixel cast's ghostOf: pale spectral blue-white, fading towards the feet;
 * `halo` (ghost vote unspent) adds a soft pale rim and a gold ring over the head.
 */
function hdGhost(src: Img, halo: boolean): Img {
  const o = new Img(src.w, src.h);
  let top = src.h;
  let bottom = 0;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.get(x, y)[3] >= 128) (top = Math.min(top, y)), (bottom = Math.max(bottom, y));
  const span = Math.max(1, bottom - top);
  if (halo) {
    // rim: alpha of the silhouette grown by ~K px, faint and fading downwards
    const R = K;
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        if (src.get(x, y)[3] >= 128) continue;
        let near = 0;
        for (let j = -R; j <= R && !near; j += 1) for (let i = -R; i <= R; i += 1) if (i * i + j * j <= R * R && src.get(x + i, y + j)[3] >= 128) (near = 1), (i = R + 1);
        if (!near) continue;
        const t = Math.max(0, (y - top) / span);
        o.set(x, y, [196, 228, 238, Math.round(70 * (1 - t * 0.8))]);
      }
  }
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const p = src.get(x, y);
      if (p[3] === 0) continue;
      const lum = (0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]) / 255;
      const v = 0.45 + lum * 0.65;
      const t = Math.max(0, (y - top) / span);
      const fade = Math.max(0.08, 0.82 - Math.pow(Math.max(0, t - 0.35) / 0.65, 1.4) * 0.78);
      const a = Math.round(p[3] * (halo ? 1 : 0.72) * fade);
      o.blend(x, y, [Math.min(255, Math.round(150 * v + 40)), Math.min(255, Math.round(205 * v + 30)), Math.min(255, Math.round(225 * v + 30)), 255], a / 255);
    }
  if (halo && top < src.h) {
    // gold ring floating just above the head
    let minX = src.w;
    let maxX = 0;
    for (let y = top; y < top + 4 * K; y++) for (let x = 0; x < src.w; x++) if (src.get(x, y)[3] >= 128) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x));
    const cx = (minX + maxX) / 2;
    const cy = top - 1.6 * K;
    const rx = 4 * K;
    const ry = 1.2 * K;
    for (let y = Math.floor(cy - ry - K); y <= cy + ry + K; y++)
      for (let x = Math.floor(cx - rx - K); x <= cx + rx + K; x++) {
        const e = Math.hypot((x - cx) / rx, (y - cy) / ry);
        const d = Math.abs(e - 1) * Math.min(rx, ry);
        const a = Math.max(0, Math.min(1, 1.6 - d / (K * 0.35)));
        if (a > 0) o.blend(x, y, y < cy ? [255, 236, 160, 255] : [232, 190, 84, 255], a);
      }
  }
  return o;
}

/** generated/cast-hd.png + manifest, or null when no cast member is hd. */
export function buildCastHd(): { img: Img; manifest: unknown } | null {
  const ids = CAST.filter((c) => c.hd).map((c) => c.id);
  if (!ids.length) return null;
  const keys = ids.flatMap((id) => [id, `${id}/ghost`, `${id}/ghost-spent`]);
  // Alive keys have five rows; ghosts hover in their idle pose and need only one.
  const img = new Img(HW * CAST_DIRS.length, HH * ids.length * (CAST_FRAMES.length + 2));
  const rows: Record<string, number> = {};
  let r = 0;
  keys.forEach((key) => {
    rows[key] = r;
    const id = key.split('/')[0]!;
    const ghost = key !== id;
    CAST_DIRS.forEach((dir, c) => {
      for (let frame = 0; frame < (ghost ? 1 : CAST_FRAMES.length); frame++) {
        const f = hdFrame(id, dir, frame);
        img.copy(ghost ? hdGhost(f, key.endsWith('/ghost')) : f, c * HW, (r + frame) * HH);
      }
    });
    r += ghost ? 1 : CAST_FRAMES.length;
  });
  const manifest = {
    image: 'cast-hd.png',
    scale: K,
    frameWidth: HW,
    frameHeight: HH,
    anchor: { x: CAST_ANCHOR.x * K, y: CAST_ANCHOR.y * K },
    directions: CAST_DIRS,
    frames: CAST_FRAMES,
    walkFps: 8,
    /** Sheet key -> starting row; direction columns, animation rows. Ghosts have only idle. */
    rows,
  };
  return { img, manifest };
}
