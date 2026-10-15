// Offline art preparation. The browser only crossfades these aligned images.
// Alpha, anchors and collision footprints are unchanged by the lighting bake.
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Img } from './lib/img.js';
import { detectWindows, processJob, AI_DIR } from '../ai/scripts/remaster.js';
import { JOBS } from '../ai/scripts/jobs.js';

type Rect = { x: number; y: number; w: number; h: number };
function pack(frames: Map<string, Img>, width = 1024) {
  const rects: Record<string, Rect> = {};
  let x = 4, y = 4, row = 0;
  for (const [name, f] of frames) {
    if (x + f.w + 4 > width) { x = 4; y += row + 8; row = 0; }
    rects[name] = { x, y, w: f.w, h: f.h };
    x += f.w + 8; row = Math.max(row, f.h);
  }
  const image = new Img(width, y + row + 4);
  for (const [name, f] of frames) image.copy(f, rects[name]!.x, rects[name]!.y);
  return { image, frames: rects };
}

// Premultiplied-alpha separable blur is performed ONCE at asset-build time.
// Sampling transparent RGB directly would introduce black fringes around leaves.
function soften(src: Img, radius: number): Img {
  let cur = src;
  for (const horizontal of [true, false]) {
    const out = new Img(src.w, src.h);
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      let a = 0, r = 0, g = 0, b = 0, weight = 0;
      for (let d = -radius; d <= radius; d++) {
        const c = cur.get(x + (horizontal ? d : 0), y + (horizontal ? 0 : d));
        const w = radius + 1 - Math.abs(d);
        a += c[3] * w; r += c[0] * c[3] * w; g += c[1] * c[3] * w; b += c[2] * c[3] * w; weight += w;
      }
      if (a) out.set(x, y, [r / a, g / a, b / a, a / weight]);
    }
    cur = out;
  }
  return cur;
}

export function bakeBuilding(src: Img, night: boolean, density: number): Img {
  const out = src.clone();
  // Connected emissive clusters, not every isolated golden stone highlight.
  const windows = detectWindows(src).filter(p => p.y > src.h * 0.25);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.get(x, y);
    if (!c[3]) continue;
    const d = Math.min(Infinity, ...windows.map(p => Math.hypot(x - p.x, y - p.y)));
    const warm = c[0] > 145 && c[1] > 85 && c[0] > c[2] * 1.45 && c[1] > c[2] * 1.15 && d < 8 * density;
    if (night) {
      if (warm) { out.set(x, y, [Math.min(255, c[0] * 1.05), Math.min(255, c[1] * 1.02), c[2], c[3]]); continue; }
      const pool = Math.exp(-d * d / (2 * (10 * density) ** 2)) * 0.2;
      out.set(x, y, [c[0] * 0.78 + pool * 95, c[1] * 0.83 + pool * 39, c[2] * 1.04 - pool * 8, c[3]]);
    } else {
      // Daylight panes reflect the cool sky rather than glowing orange all afternoon.
      out.set(x, y, [c[0] * 1.04 + 2, c[1] * 1.02 + 1, c[2] * 0.98, c[3]]);
    }
  }
  return out;
}

export function writeBakedArt(frames: Map<string, Img>, outDir: string, density: number) {
  const day = new Map<string, Img>(), night = new Map<string, Img>(), foreground = new Map<string, Img>();
  for (const [name, f] of frames) {
    if (name.startsWith('bld_')) {
      const path = join(AI_DIR, 'target', 'production', 'cottages-day.png');
      const job = JOBS.find(j => j.id === `hd-bld-${name.slice(4)}`);
      const paintedDay = name.startsWith('bld_house-') && job && existsSync(path) ? processJob(job, () => f, [], path)?.[0]?.img : undefined;
      day.set(name, paintedDay ?? bakeBuilding(f, false, density));
      night.set(name, bakeBuilding(f, true, density));
    }
    if (name.startsWith('fg_') || name.startsWith('bunting')) foreground.set(name, soften(f, name.includes('bough') || name.includes('branch') ? 3 : 1));
  }
  const d = pack(day), n = pack(night), fg = pack(foreground);
  writeFileSync(join(outDir, 'buildings-day.png'), d.image.toPNG());
  writeFileSync(join(outDir, 'buildings-night.png'), n.image.toPNG());
  writeFileSync(join(outDir, 'foreground-baked.png'), fg.image.toPNG());
  writeFileSync(join(outDir, 'baked.json'), JSON.stringify({ density, buildings: d.frames, foreground: fg.frames, cameraZoom: 3, runtime: 'one grade pass; no blur/bloom chain' }));
}
