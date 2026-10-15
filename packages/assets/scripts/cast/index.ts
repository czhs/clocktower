// Assembles generated/cast.png + cast.json from the per-character modules in this folder.
// Each module default-exports a CharacterArt (see types.ts). Missing modules get a placeholder
// (a labelled silhouette) so the game always has a sheet for every roster id.
import { CAST, CAST_ANCHOR, CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW } from '../../src/cast.js';
import { Img } from '../lib/img.js';
import type { CharacterArt, DrawnDir, FrameIndex } from './types.js';

const SW = CAST_FW * CAST_FRAMES.length;
const SH = CAST_FH * CAST_DIRS.length;
const COLS = 8;

function placeholder(id: string): CharacterArt {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const body = `hsl(${h % 360},40%,45%)`;
  return {
    id,
    draw(_dir, frame) {
      const im = new Img(CAST_FW, CAST_FH);
      const bob = frame === 2 || frame === 4 ? 1 : 0;
      im.ellipse(16, 30 - bob, 7, 8, () => hslToHex(body));
      im.ellipse(16, 18 - bob, 6, 6, () => hslToHex(body));
      im.outline({ darken: 0.72 });
      return im;
    },
  };
}
function hslToHex(s: string): string {
  const m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(s)!;
  const H = Number(m[1]) / 360;
  const S = Number(m[2]) / 100;
  const L = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + H * 12) % 12;
    const a = S * Math.min(L, 1 - L);
    return Math.round((L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Ghost of a character, derived from its own living frame so every ghost is recognisably that
 * character: no ground shadow, pale spectral blue-white, translucent and fading towards the feet,
 * a soft 1 px halo, floating (the walk frames become a gentle hover on the idle pose).
 */
const GHOST_HOVER = [-2, -3, -4, -3, -2];
/** `halo` = the ghost still has their ghost vote (pale glowing rim + a little gold ring over the head). */
function ghostOf(alive: Img, frame: FrameIndex, halo: boolean): Img {
  const src = alive;
  const o = new Img(src.w, src.h);
  const dy = GHOST_HOVER[frame]!;
  let top = src.h;
  let bottom = 0;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++)
      if (src.get(x, y)[3] >= 200) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  const span = Math.max(1, bottom - top);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < src.w && y < src.h && src.get(x, y)[3] >= 200;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const p = src.get(x, y);
      const ty = y + dy;
      if (ty < 0 || ty >= o.h) continue;
      if (p[3] < 200) {
        // halo: a faint pale rim around the silhouette (only while the ghost vote is unspent)
        if (halo && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) {
          const t = (y - top) / span;
          o.set(x, ty, [196, 228, 238, Math.round(60 * (1 - t * 0.8))]);
        }
        continue;
      }
      const lum = (0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]) / 255;
      const dark = lum < 0.16; // outline / deepest shadow
      const v = dark ? 0.32 : 0.55 + lum * 0.55;
      const r = Math.min(255, Math.round(150 * v + 40));
      const g = Math.min(255, Math.round(205 * v + 30));
      const b = Math.min(255, Math.round(225 * v + 30));
      const t = (y - top) / span; // 0 head .. 1 feet
      const a = Math.round(255 * (halo ? 1 : 0.72) * Math.max(0.08, 0.82 - Math.pow(Math.max(0, t - 0.35) / 0.65, 1.4) * 0.78));
      o.set(x, ty, dark ? [58, 74, 108, a] : [r, g, b, a]);
    }
  if (halo && top < src.h) {
    // the halo ring: a small flat gold ellipse floating just above the head
    let minX = src.w;
    let maxX = 0;
    for (let y = top; y < top + 4; y++) for (let x = 0; x < src.w; x++) if (solid(x, y)) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x));
    const cx = Math.round((minX + maxX) / 2);
    const cy = top + dy - 3;
    for (let x = -4; x <= 4; x++)
      for (const yy of [-1, 1]) {
        const e = Math.abs(x) <= 2 ? yy : 0;
        const px = cx + x;
        const py = cy + (Math.abs(x) === 4 ? 0 : e);
        if (py >= 0 && py < o.h && px >= 0 && px < o.w) o.set(px, py, Math.abs(x) <= 1 && yy < 0 ? [255, 236, 160, 255] : [232, 190, 84, 255]);
      }
  }
  return o;
}

function mirror(src: Img): Img {
  const o = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) o.set(src.w - 1 - x, y, src.get(x, y));
  return o;
}

export async function buildCast(): Promise<{ img: Img; manifest: unknown; review: Img }> {
  const arts = new Map<string, CharacterArt>();
  for (const c of CAST) {
    try {
      const m = (await import(`./${c.id}.js`)) as { default: CharacterArt };
      arts.set(c.id, m.default);
    } catch (e) {
      if ((e as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw e;
      arts.set(c.id, placeholder(c.id));
    }
  }
  const ghostIds = CAST.filter((c) => c.kind === 'villager' || c.kind === 'mascot').map((c) => c.id);
  // '<id>/ghost' = dead, ghost vote unspent (halo); '<id>/ghost-spent' = dead, vote used (no halo).
  const keys = [...CAST.map((c) => c.id), ...ghostIds.flatMap((id) => [`${id}/ghost`, `${id}/ghost-spent`])];
  const rows = Math.ceil(keys.length / COLS);
  const img = new Img(COLS * SW, rows * SH);
  const sheets: Record<string, { x: number; y: number }> = {};
  const placeholders: string[] = [];
  const drawFrame = (art: CharacterArt, id: string, dir: (typeof CAST_DIRS)[number], f: FrameIndex): Img => {
    let frame: Img;
    if (dir === 'left' || dir === 'up-left' || dir === 'down-left') {
      frame = art.drawMirrored ? art.drawMirrored(dir, f) : mirror(art.draw(({ left: 'right', 'up-left': 'up-right', 'down-left': 'down-right' } as const)[dir] as DrawnDir, f));
    } else frame = art.draw(dir as DrawnDir, f);
    if (frame.w !== CAST_FW || frame.h !== CAST_FH) throw new Error(`cast ${id} ${dir}/${f}: frame is ${frame.w}x${frame.h}, want ${CAST_FW}x${CAST_FH}`);
    return frame;
  };
  keys.forEach((key, i) => {
    const ghost = key.endsWith('/ghost') || key.endsWith('/ghost-spent');
    const id = ghost ? key.slice(0, key.lastIndexOf('/')) : key;
    const halo = key.endsWith('/ghost');
    const art = arts.get(id)!;
    if (!ghost && art.id !== id) placeholders.push(id);
    const ox = (i % COLS) * SW;
    const oy = Math.floor(i / COLS) * SH;
    sheets[key] = { x: ox, y: oy };
    CAST_DIRS.forEach((dir, r) => {
      for (let f = 0; f < CAST_FRAMES.length; f++) {
        // ghosts hover on their idle pose instead of stepping
        const frame = ghost ? ghostOf(drawFrame(art, id, dir, 0), f as FrameIndex, halo) : drawFrame(art, id, dir, f as FrameIndex);
        img.copy(frame, ox + f * CAST_FW, oy + r * CAST_FH);
      }
    });
  });
  // Review sheet: per character the 8 idle directions + the down and right walk cycles, 4x, on grass.
  const RS = 4;
  const per = 8 + 5 + 5;
  const review = new Img(per * CAST_FW * RS, CAST.length * CAST_FH * RS);
  review.rect(0, 0, review.w, review.h, '#3f5d3b');
  CAST.forEach((c, i) => {
    const s = sheets[c.id]!;
    const cells: [number, number][] = [...CAST_DIRS.map((_, r) => [0, r] as [number, number]), ...[0, 1, 2, 3, 4].map((f) => [f, 0] as [number, number]), ...[0, 1, 2, 3, 4].map((f) => [f, 2] as [number, number])];
    cells.forEach(([f, r], k) => {
      for (let y = 0; y < CAST_FH; y++)
        for (let x = 0; x < CAST_FW; x++) {
          const p = img.get(s.x + f * CAST_FW + x, s.y + r * CAST_FH + y);
          if (p[3] === 0) continue;
          review.rect((k * CAST_FW + x) * RS, (i * CAST_FH + y) * RS, RS, RS, p);
        }
    });
  });
  const manifest = {
    image: 'cast.png',
    frameWidth: CAST_FW,
    frameHeight: CAST_FH,
    anchor: CAST_ANCHOR,
    directions: CAST_DIRS,
    frames: CAST_FRAMES,
    walkFps: 10,
    sheetWidth: SW,
    sheetHeight: SH,
    sheets,
    placeholders,
  };
  return { img, manifest, review };
}
