/** Offline scene-art export; run from repository root with node --import tsx.
 * All pixels come from the generated game atlases. This is deliberately not a browser capture:
 * actors, UI, animated FX, lighting render textures and the final grade are excluded.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Img } from './lib/img.js';
import { townLayout } from '../src/layout.js';
import { FOREGROUND } from '../src/foreground.js';

type Rect = { x: number; y: number; w: number; h: number };
type Prop = { name: string; value: unknown };
type Obj = { id: number; type: string; x: number; y: number; width: number; height: number; properties?: Prop[] };
type TileLayer = { name: string; type: string; width: number; data?: number[]; objects?: Obj[] };
type Tileset = { firstgid: number; image: string; columns: number; tilecount: number };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(root, 'generated');
const output = path.resolve(process.argv[2] ?? path.join(root, 'ai/target/layers'));
const json = <T>(name: string): T => JSON.parse(readFileSync(path.join(generated, name), 'utf8')) as T;
const map = json<{ tilewidth: number; tileheight: number; properties: Prop[]; layers: TileLayer[]; tilesets: Tileset[] }>('town.json');
const atlas = json<{ density: number; frames: Record<string, Rect> }>('objects.json');
const baked = json<{ density: number; buildings: Record<string, Rect>; foreground: Record<string, Rect> }>('baked.json');
const density = Number(map.properties.find(p => p.name === 'density')?.value ?? 2);
const W = 1280, H = 800, ZX = 3, ZY = 1.8, UPRIGHT = 1 / 0.6;
const cache = new Map<string, Img>();
const sources = new Map<string, string>();
function image(name: string): Img {
  let im = cache.get(name);
  if (!im) {
    const bytes = readFileSync(path.join(generated, name));
    sources.set(name, createHash('sha256').update(bytes).digest('hex'));
    im = Img.fromPNG(bytes); cache.set(name, im);
  }
  return im;
}
const property = (o: Obj, key: string) => o.properties?.find(p => p.name === key)?.value;
const tavern = townLayout.buildings.find(b => b.id === 'tavern')!;
const frames = [
  { name: 'square-day', x: 776, y: 760, night: false, inside: false },
  { name: 'square-night', x: 776, y: 760, night: true, inside: false },
  { name: 'lane-night', x: 300, y: 330, night: true, inside: false },
  { name: 'tavern-interior', x: (tavern.interior.x + tavern.interior.w / 2) * townLayout.tileSize, y: (tavern.interior.y + tavern.interior.h / 2) * townLayout.tileSize, night: true, inside: true },
];
for (const frame of frames) {
  const dir = path.join(output, frame.name); mkdirSync(path.join(dir, 'ordered'), { recursive: true });
  const left = Math.round(frame.x - W / ZX / 2), top = Math.round(frame.y - H / ZY / 2);
  const groups = new Map<string, Img>();
  const preview = new Img(W, H);
  const records: { file: string; category: string; depth: number; source: string; objectId?: number; crop?: Rect }[] = [];
  const queue: { category: string; depth: number; source: string; objectId?: number; crop?: Rect; draw: (im: Img) => void }[] = [];
  // Inverse nearest-neighbour sampling matches the atlases' pixel treatment, without a blur pass.
  function stamp(dest: Img, src: Img, r: Rect, x: number, y: number, sx: number, sy: number, cropTop = 0, cropBottom = r.h) {
    const px = (x - left) * ZX, py = (y - top) * ZY;
    const dx = sx * ZX, dy = sy * ZY;
    for (let iy = Math.max(0, Math.ceil(py + cropTop * dy)); iy < Math.min(H, Math.ceil(py + cropBottom * dy)); iy++) {
      const v = Math.floor((iy - py) / dy);
      for (let ix = Math.max(0, Math.ceil(px)); ix < Math.min(W, Math.ceil(px + r.w * dx)); ix++) {
        const u = Math.floor((ix - px) / dx);
        if (u >= 0 && u < r.w && v >= cropTop && v < cropBottom) dest.blend(ix, iy, src.get(r.x + u, r.y + v));
      }
    }
  }
  for (const name of ['ground', 'decor']) {
    const layer = map.layers.find(l => l.name === name)!;
    const dest = new Img(W, H);
    for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
      const wx = (left + ix / ZX) * density, wy = (top + iy / ZY) * density;
      const tx = Math.floor(wx / map.tilewidth), ty = Math.floor(wy / map.tileheight);
      if (tx < 0 || tx >= layer.width || ty < 0) continue;
      const gid = (layer.data?.[ty * layer.width + tx] ?? 0) & 0x1fffffff;
      if (!gid) continue;
      const set = [...map.tilesets].reverse().find(s => gid >= s.firstgid);
      if (!set || gid >= set.firstgid + set.tilecount) continue;
      const n = gid - set.firstgid;
      dest.blend(ix, iy, image(set.image).get(n % set.columns * map.tilewidth + Math.floor(wx % map.tilewidth), Math.floor(n / set.columns) * map.tileheight + Math.floor(wy % map.tileheight)));
    }
    queue.push({ category: 'ground', depth: name === 'ground' ? 0 : 1, source: `town.json:${name}`, draw: im => im.blit(dest, 0, 0) });
  }
  for (const o of map.layers.find(l => l.name === 'objects')?.objects ?? []) {
    if (o.type === 'light') continue; // metadata only; no invented light/haze pixels
    const name = String(property(o, 'frame'));
    const building = o.type === 'building';
    const rect = (building ? baked.buildings[name] : undefined) ?? atlas.frames[name];
    if (!rect) throw new Error(`Missing atlas frame: ${name}`);
    const source = building && baked.buildings[name] ? `buildings-${frame.night ? 'night' : 'day'}.png` : 'objects.png';
    const src = image(source), sy = o.type === 'flat' ? 1 : UPRIGHT;
    const x = o.x / density, originalY = o.y / density, h = o.height / density;
    const y = originalY + h - h * sy;
    const depth = o.type === 'flat' ? 2 : 10 + Number(property(o, 'depth') ?? o.y + o.height) / density;
    let split = 0;
    if (building) {
      const b = townLayout.buildings.find(b => b.id === String(property(o, 'building')));
      if (b) split = Math.round(Math.max(0, h * sy - b.footprint.h * townLayout.tileSize) * atlas.density / sy);
    } else if (o.type === 'prop' && h * sy >= 40) split = Math.round(Math.round(h * sy * 0.7) * atlas.density / sy);
    const category = building ? 'buildings-lower' : o.type === 'flat' ? 'ground' : originalY + h < frame.y - 60 ? 'distant-scenery' : 'objects';
    const add = (category: string, lo: number, hi: number) => queue.push({ category, depth, source: `${source}#${name}`, objectId: o.id, crop: { x: 0, y: lo, w: rect.w, h: hi - lo }, draw: im => stamp(im, src, rect, x, y, 1 / atlas.density, sy / atlas.density, lo, hi) });
    if (split > 0) { add(category, split, rect.h); add('upper-architecture-canopies', 0, Math.min(rect.h, split + 2)); }
    else add(category, 0, rect.h);
  }
  if (!frame.inside) for (const f of FOREGROUND) {
    const name = baked.foreground[f.kind] ? f.kind : `fg_${f.kind}`;
    const rect = baked.foreground[name]; if (!rect) throw new Error(`Missing foreground: ${name}`);
    const ground = f.y + (f.depthBias ?? 0), bottom = ground - (ground - f.y) * UPRIGHT;
    const p = f.parallax ?? 0.05;
    const x = f.x + (f.x + f.w / 2 - (left + W / ZX / 2)) * p;
    const y = bottom + (bottom - f.h * UPRIGHT / 2 - (top + H / ZY / 2)) * p - f.h * UPRIGHT;
    queue.push({ category: 'soft-foreground', depth: 10 + ground + 0.5, source: `foreground-baked.png#${name}`, draw: im => stamp(im, image('foreground-baked.png'), rect, x, y, 1 / baked.density, UPRIGHT / baked.density) });
  }
  for (const q of queue.sort((a, b) => a.depth - b.depth)) {
    const im = new Img(W, H); q.draw(im);
    if (!im.data.some((v, i) => i % 4 === 3 && v > 0)) continue;
    const file = `ordered/${String(records.length).padStart(3, '0')}-${q.category}.png`;
    writeFileSync(path.join(dir, file), im.toPNG());
    let group = groups.get(q.category); if (!group) { group = new Img(W, H); groups.set(q.category, group); }
    group.blit(im, 0, 0); preview.blit(im, 0, 0);
    records.push({ file, category: q.category, depth: q.depth, source: q.source, ...(q.objectId === undefined ? {} : { objectId: q.objectId }), ...(q.crop ? { crop: q.crop } : {}) });
  }
  for (const [name, im] of groups) writeFileSync(path.join(dir, `${name}.png`), im.toPNG());
  writeFileSync(path.join(dir, 'composition.png'), preview.toPNG());
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, frame, width: W, height: H, camera: { left, top, zoomX: ZX, zoomY: ZY, uprightY: UPRIGHT }, composition: 'composition.png', compositing: 'source-over ordered files in the listed sequence, at (0,0); category images are inspection summaries and cannot preserve interleaved y sorting', ordered: records, categories: [...groups.keys()], sources: Object.fromEntries([...sources, ['town.json', createHash('sha256').update(readFileSync(path.join(generated, 'town.json'))).digest('hex')]]), limitations: ['Static scene artwork only, not final browser-render parity.', 'No actors, occupancy data, UI, clock hands, animated effects, corner framing, final ambient multiply/add lighting or color grade.', 'Night differs through actual baked building-night artwork; terrain and props retain their source colors.', 'No standalone light/haze texture exists in the current baked data; glows already painted into building art remain there.', 'Upper crops use the runtime two-texel overlap; no visible-character cutaway or upper parallax is applied.', 'Soft focus comes exclusively from foreground-baked.png; no runtime or export blur.'] }, null, 2) + '\n');
  console.log(`${frame.name}: ${records.length} ordered layers; ${[...groups.keys()].join(', ')}`);
}
