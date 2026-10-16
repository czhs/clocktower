// Deterministic asset generator. Run: `pnpm assets:generate` (from the repo root).
// Writes everything into packages/assets/generated/ — see packages/assets/README.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCESSORIES, GHOST_STYLES, HAIR_COLORS, HAIR_STYLES, OUTFIT_PALETTES, OUTFITS, SKIN_TONES } from '@ct/protocol';
import { PROP_DEFS, townLayout, townMap, TS } from '../src/layout.js';
import { drawBuildings } from './buildings.js';
import { ANCHOR, DIRS, drawCharacters, FH, FRAMES, FW } from './characters.js';
import { DECAL_NAMES, drawDecals, drawFavicon, drawLights } from './decals.js';
import { renderGround, sliceTiles } from './ground.js';
import { Img } from './lib/img.js';
import { drawProps } from './props.js';
import { buildCast } from './cast/index.js';
import { buildCastHd } from './cast/hd.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'generated');
const REVIEW = join(here, '..', '.review');
mkdirSync(OUT, { recursive: true });
const review = process.argv.includes('--review');
if (review) mkdirSync(REVIEW, { recursive: true });

const t0 = Date.now();
const log = (m: string) => console.log(`[assets ${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const write = (name: string, data: Buffer | string) => {
  writeFileSync(join(OUT, name), data);
  log(`wrote ${name} (${(Buffer.byteLength(data) / 1024).toFixed(0)} KiB)`);
};

// ---------------------------------------------------------------------------------------
// Shelf packer for the object atlas.
function pack(frames: Map<string, Img>, width: number, pad = 2): { img: Img; rects: Record<string, { x: number; y: number; w: number; h: number }> } {
  const items = [...frames.entries()].sort((a, b) => b[1].h - a[1].h || b[1].w - a[1].w || (a[0] < b[0] ? -1 : 1));
  const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const [name, im] of items) {
    if (x + im.w + pad > width) {
      x = 0;
      y += rowH + pad;
      rowH = 0;
    }
    rects[name] = { x, y, w: im.w, h: im.h };
    x += im.w + pad;
    rowH = Math.max(rowH, im.h);
  }
  const H = y + rowH;
  const img = new Img(width, Math.ceil(H / 4) * 4);
  for (const [name, im] of items) img.copy(im, rects[name]!.x, rects[name]!.y);
  return { img, rects: Object.fromEntries(Object.entries(rects).sort(([a], [b]) => (a < b ? -1 : 1))) };
}

// ---------------------------------------------------------------------------------------
// 1. Ground
log('rendering ground…');
const groundImg = renderGround();
const { tileset: terrainImg, indices, count } = sliceTiles(groundImg);
log(`ground: ${count} unique tiles`);
write('terrain.png', terrainImg.toPNG());

// 2. Decor
const decals = drawDecals();
const decorImg = new Img(DECAL_NAMES.length * TS, TS);
DECAL_NAMES.forEach((n, i) => decorImg.copy(decals.get(n)!, i * TS, 0));
write('decor.png', decorImg.toPNG());
const collisionTile = new Img(TS, TS);
collisionTile.rect(0, 0, TS, TS, [200, 40, 60, 110]);
write('collision.png', collisionTile.toPNG());

// 3. Objects atlas (props + buildings)
const props = drawProps();
for (const [kind, def] of Object.entries(PROP_DEFS)) {
  const f = props.get(kind === 'fence' || kind === 'iron' ? `${kind}_0` : kind)!;
  if (f.w !== def.w || f.h !== def.h) throw new Error(`prop ${kind} size ${f.w}x${f.h} != ${def.w}x${def.h}`);
}
const buildings = drawBuildings();
const frames = new Map<string, Img>(props);
for (const [id, b] of buildings) frames.set(`bld_${id}`, b.img);
// --- doors (buildings agent) ---
// Swing-open front doors: the closed leaf and the open doorway of every cottage (same size).
for (const [id, b] of buildings) {
  if (b.leaf) frames.set(`door_${id}`, b.leaf);
  if (b.doorway) frames.set(`doorway_${id}`, b.doorway);
}
// --- end doors (buildings agent) ---
const atlas = pack(frames, 1024);
write('objects.png', atlas.img.toPNG());
write('objects.json', JSON.stringify({ image: 'objects.png', width: atlas.img.w, height: atlas.img.h, frames: atlas.rects }, null, 0));

// 4. Characters
const chars = drawCharacters();
const SW = FW * FRAMES.length;
const SH = FH * DIRS.length;
const CCOLS = 10;
const charKeys = [...chars.sheets.keys()];
const charImg = new Img(CCOLS * SW, Math.ceil(charKeys.length / CCOLS) * SH);
const sheetPos: Record<string, { x: number; y: number }> = {};
charKeys.forEach((k, i) => {
  const x = (i % CCOLS) * SW;
  const y = Math.floor(i / CCOLS) * SH;
  charImg.copy(chars.sheets.get(k)!, x, y);
  sheetPos[k] = { x, y };
});
write('characters.png', charImg.toPNG());
const charManifest = {
  image: 'characters.png',
  frameWidth: FW,
  frameHeight: FH,
  anchor: ANCHOR,
  sheetWidth: SW,
  sheetHeight: SH,
  directions: DIRS,
  frames: FRAMES,
  walkFps: 9,
  layerOrder: ['body', 'outfit', 'hair', 'accessory'],
  layerOffsets: { body: { x: 0, y: 0 }, outfit: { x: 0, y: 0 }, hair: { x: 0, y: 0 }, accessory: { x: 0, y: 0 } },
  /** Layer sheet key patterns; 'bald' hair and 'none' accessory have no sheet. */
  keys: {
    body: 'body/{skin}',
    outfit: 'outfit/{outfit}/{palette}',
    hair: 'hair/{hair}/{hairColor}',
    accessory: 'accessory/{accessory}',
    ghost: 'ghost/{ghost}',
    storyteller: 'storyteller',
  },
  enums: {
    skin: SKIN_TONES,
    hair: HAIR_STYLES,
    hairColor: HAIR_COLORS,
    outfit: OUTFITS,
    palette: OUTFIT_PALETTES,
    accessory: ACCESSORIES,
    ghost: GHOST_STYLES,
  },
  sheets: sheetPos,
};
write('characters.json', JSON.stringify(charManifest, null, 0));

// 4b. The v2 cast (8-direction characters, one module per character in scripts/cast/).
{
  const cast = await buildCast();
  write('cast.png', cast.img.toPNG());
  write('cast.json', JSON.stringify(cast.manifest, null, 0));
  if (review) writeFileSync(join(REVIEW, 'cast-x4.png'), cast.review.toPNG());
  const hd = buildCastHd();
  if (hd) {
    write('cast-hd.png', hd.img.toPNG());
    write('cast-hd.json', JSON.stringify(hd.manifest, null, 0));
  }
}

// --- social (social-art agent) ---
// Pins, character head icons and the POINT emote (scripts/social/), built from the cast just written.
{
  const { buildSocial } = await import('./social/index.js');
  const { readFileSync } = await import('node:fs');
  const castImg = Img.fromPNG(readFileSync(join(OUT, 'cast.png')));
  const castManifest: unknown = JSON.parse(readFileSync(join(OUT, 'cast.json'), 'utf8'));
  const social = buildSocial(castImg, castManifest, { review });
  write('social.png', social.img.toPNG());
  write('social.json', JSON.stringify(social.manifest, null, 0));
  if (review && social.review) writeFileSync(join(REVIEW, 'social-x4.png'), social.review.toPNG());
}
// --- end social (social-art agent) ---

// 4c. Square props + ambient FX (scripts/fx/index.ts), when present.
try {
  const fx = (await import('./fx/index.js')) as { buildFx(): { img: Img; manifest: unknown; review?: Img } };
  const out = fx.buildFx();
  write('square-props.png', out.img.toPNG());
  write('square-props.json', JSON.stringify(out.manifest, null, 0));
  if (review && out.review) writeFileSync(join(REVIEW, 'square-props-x4.png'), out.review.toPNG());
} catch (e) {
  if ((e as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw e;
  log('no scripts/fx yet: square-props skipped');
}

// 5. Lights + favicon
write('lights.png', drawLights().toPNG());
write('favicon.png', drawFavicon().toPNG());

// 6. Tiled map
const W = townMap.width;
const H = townMap.height;
const decorGid0 = 1 + count;
const collisionGid = decorGid0 + DECAL_NAMES.length;
const decorData = new Array<number>(W * H).fill(0);
for (const d of townMap.decals) decorData[d.y * W + d.x] = decorGid0 + DECAL_NAMES.indexOf(d.name as (typeof DECAL_NAMES)[number]);
let oid = 1;
type Prop = { name: string; type: string; value: string | number | boolean };
const tobj = (name: string, type: string, x: number, y: number, w: number, h: number, props: Prop[]) => ({
  id: oid++,
  name,
  type,
  class: type,
  x,
  y,
  width: w,
  height: h,
  rotation: 0,
  visible: true,
  properties: props,
});
const objects: ReturnType<typeof tobj>[] = [];
for (const o of townMap.objects) {
  const frame = o.kind === 'building' ? `bld_${o.frame}` : (o.frame ?? o.kind);
  const r = atlas.rects[frame];
  if (!r) throw new Error(`missing frame ${frame}`);
  const bottom = (o.y + 1) * TS;
  const def = o.kind === 'building' ? null : PROP_DEFS[o.kind]!;
  const type = o.kind === 'building' ? 'building' : def?.flat ? 'flat' : 'prop';
  const props: Prop[] = [
    { name: 'frame', type: 'string', value: frame },
    { name: 'depth', type: 'float', value: bottom },
  ];
  if (o.kind === 'building') props.push({ name: 'building', type: 'string', value: o.frame! });
  objects.push(tobj(o.kind === 'building' ? o.frame! : o.kind, type, o.x * TS, bottom - r.h, r.w, r.h, props));
}
const lightObj = (l: { x: number; y: number; r: number; color: string; building: string | null; facade?: boolean }) =>
  tobj('light', 'light', Math.round(l.x), Math.round(l.y), 0, 0, [
    { name: 'radius', type: 'float', value: l.r },
    { name: 'color', type: 'string', value: l.color },
    { name: 'building', type: 'string', value: l.building ?? '' },
    { name: 'facade', type: 'bool', value: !!l.facade },
  ]);
for (const l of townMap.lights) objects.push(lightObj(l));
for (const b of [...townLayout.buildings, ...townMap.landmarks]) {
  const s = buildings.get(b.id)!;
  const left = b.footprint.x * TS;
  const top = (b.footprint.y + b.footprint.h) * TS - s.img.h;
  for (const w of s.windows) objects.push(lightObj({ x: left + w.x, y: top + w.y, r: b.kind === 'chapel' ? 40 : 30, color: b.kind === 'chapel' ? 'holy' : 'warm', building: null, facade: true }));
}
// --- doors (buildings agent) ---
// One 'door' object per cottage (rect = the door leaf in WORLD px; leaf/hole = atlas frames of the
// closed leaf and the open doorway, same size; hinge = edge the leaf swings around). 'frame' and
// 'depth' come first like every drawable object (frame = the closed leaf; depth just above the
// building so the door draws over it). Each cottage's 'building' object also gets a 'chimney'
// property: JSON {x,y} of the chimney's smoke point in WORLD px (absent = no chimney).
// (v2.1, lead) the clock tower's dial (WORLD px) so the client can draw the live town clock
for (const b of townMap.landmarks) {
  const s = buildings.get(b.id)!;
  if (!s.clock) continue;
  const left = b.footprint.x * TS;
  const top = (b.footprint.y + b.footprint.h) * TS - s.img.h;
  const bo = objects.find((o) => o.type === 'building' && o.name === b.id);
  if (bo) bo.properties.push({ name: 'clock', type: 'string', value: JSON.stringify({ x: left + s.clock.x, y: top + s.clock.y, r: s.clock.r }) });
}
for (const b of townLayout.buildings) {
  const s = buildings.get(b.id)!;
  const left = b.footprint.x * TS;
  const bottom = (b.footprint.y + b.footprint.h) * TS;
  const top = bottom - s.img.h;
  const bo = objects.find((o) => o.type === 'building' && o.name === b.id);
  if (bo && s.chimney) bo.properties.push({ name: 'chimney', type: 'string', value: JSON.stringify({ x: left + s.chimney.x, y: top + s.chimney.y }) });
  if (!s.door || !s.leaf || !s.doorway) continue;
  objects.push(
    tobj(b.id, 'door', left + s.door.x, top + s.door.y, s.door.w, s.door.h, [
      { name: 'frame', type: 'string', value: `door_${b.id}` },
      { name: 'depth', type: 'float', value: bottom + 0.5 },
      { name: 'building', type: 'string', value: b.id },
      { name: 'leaf', type: 'string', value: `door_${b.id}` },
      { name: 'hole', type: 'string', value: `doorway_${b.id}` },
      { name: 'hinge', type: 'string', value: s.door.hinge },
    ]),
  );
}
if (review) {
  // every cottage, door closed (top) and open (bottom), x3
  const ids = townLayout.buildings.map((b) => b.id);
  const cw = Math.max(...ids.map((id) => buildings.get(id)!.img.w)) + 4;
  const ch = Math.max(...ids.map((id) => buildings.get(id)!.img.h)) + 4;
  const sheet = new Img(cw * ids.length, ch * 2);
  sheet.rect(0, 0, sheet.w, sheet.h, '#2e4a2c');
  ids.forEach((id, k) => {
    const s = buildings.get(id)!;
    const x = k * cw + 2;
    const y = ch - 2 - s.img.h;
    sheet.blit(s.img, x, y);
    sheet.blit(s.img, x, y + ch);
    if (s.door && s.doorway) sheet.copy(s.doorway, x + s.door.x, y + ch + s.door.y);
  });
  writeFileSync(join(REVIEW, 'doors-x3.png'), upscale(sheet, 3).toPNG());
}
// --- end doors (buildings agent) ---
const tsDef = (name: string, image: string, iw: number, ih: number, firstgid: number) => ({
  firstgid,
  name,
  image,
  imagewidth: iw,
  imageheight: ih,
  tilewidth: TS,
  tileheight: TS,
  tilecount: (iw / TS) * (ih / TS),
  columns: iw / TS,
  margin: 0,
  spacing: 0,
});
const tileLayer = (id: number, name: string, data: number[], visible = true) => ({ id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible, data });
const tiled = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  width: W,
  height: H,
  tilewidth: TS,
  tileheight: TS,
  infinite: false,
  nextlayerid: 5,
  nextobjectid: oid,
  properties: [
    { name: 'townBounds', type: 'string', value: JSON.stringify(townLayout.townBounds) },
    { name: 'square', type: 'string', value: JSON.stringify(townLayout.square) },
  ],
  tilesets: [
    tsDef('terrain', 'terrain.png', terrainImg.w, terrainImg.h, 1),
    tsDef('decor', 'decor.png', decorImg.w, decorImg.h, decorGid0),
    tsDef('collision', 'collision.png', TS, TS, collisionGid),
  ],
  layers: [
    tileLayer(1, 'ground', indices.map((i) => i + 1)),
    tileLayer(2, 'decor', decorData),
    tileLayer(
      3,
      'collision',
      townLayout.collision.map((c) => (c ? collisionGid : 0)),
      false,
    ),
    { id: 4, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
  ],
};
write('town.json', JSON.stringify(tiled));

// ---------------------------------------------------------------------------------------
// 7. Preview (full town at 1x, objects y-sorted) — for eyeballing art quality.
function compose(): Img {
  const img = groundImg.clone();
  for (const d of townMap.decals) img.blit(decals.get(d.name)!, d.x * TS, d.y * TS);
  const sorted = [...objects].filter((o) => o.type !== 'light').sort((a, b) => {
    const fa = a.type === 'flat' ? 0 : 1;
    const fb = b.type === 'flat' ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return (a.properties[1]!.value as number) - (b.properties[1]!.value as number);
  });
  for (const o of sorted) img.blit(frames.get(o.properties[0]!.value as string)!, o.x, o.y);
  // a few villagers in the square
  const people: [string[], number, number][] = [
    [['body/fair', 'outfit/peasant/forest', 'hair/short/brown'], 20, 22],
    [['body/umber', 'outfit/noble/crimson', 'hair/long/black', 'accessory/hat'], 30, 22],
    [['body/olive', 'outfit/cleric/plum', 'hair/bun/grey', 'accessory/spectacles'], 17, 19],
    [['ghost/shroud'], 33, 19],
    [['storyteller'], 25, 21],
  ];
  for (const [layers, tx, ty] of people)
    for (const l of layers) {
      const p = sheetPos[l]!;
      const s = new Img(FW, FH);
      s.copy(charImg, 0, 0, p.x, p.y, FW, FH);
      img.blit(s, tx * TS + 8 - ANCHOR.x, ty * TS + 14 - ANCHOR.y);
    }
  return img;
}
const preview = compose();
write('preview-town.png', preview.toPNG());

if (review) {
  // crops + character sheet blow-ups for art review (not committed)
  const crop = (name: string, x: number, y: number, w: number, h: number, scale = 1) => {
    const c = new Img(w, h);
    c.copy(preview, 0, 0, x, y, w, h);
    const out = scale > 1 ? upscale(c, scale) : c;
    writeFileSync(join(REVIEW, name), out.toPNG());
  };
  crop('town.png', 0, 0, townLayout.townBounds.w * TS, townLayout.townBounds.h * TS, 2);
  crop('interiors.png', (townLayout.townBounds.w + 1) * TS, 0, (W - townLayout.townBounds.w - 1) * TS, H * TS, 2);
  const r0 = townLayout.buildings[0]!.interior;
  crop('house0.png', (r0.x - 1) * TS, (r0.y - 1) * TS, (r0.w + 2) * TS, (r0.h + 2) * TS, 4);
  writeFileSync(join(REVIEW, 'characters-x3.png'), upscale(charImg, 3).toPNG());
  writeFileSync(join(REVIEW, 'objects.png'), upscale(atlas.img, 2).toPNG());
  writeFileSync(join(REVIEW, 'preview-half.png'), preview.downscale(2).toPNG());
  // composed character grid
  const combos: string[][] = [];
  for (let i = 0; i < 12; i++) {
    const skin = SKIN_TONES[i % 6]!;
    const out = OUTFITS[i % 6]!;
    const pal = OUTFIT_PALETTES[(i * 5) % 6]!;
    const hair = HAIR_STYLES[(i * 7) % 6]!;
    const hc = HAIR_COLORS[(i * 5 + 1) % 6]!;
    const acc = ACCESSORIES[i % 6]!;
    const l = [`body/${skin}`, `outfit/${out}/${pal}`];
    if (hair !== 'bald') l.push(`hair/${hair}/${hc}`);
    if (acc !== 'none') l.push(`accessory/${acc}`);
    combos.push(l);
  }
  for (const g of GHOST_STYLES) combos.push([`ghost/${g}`]);
  combos.push(['storyteller']);
  const GC = 6;
  const grid = new Img(GC * SW, Math.ceil(combos.length / GC) * SH);
  combos.forEach((layers, i) => {
    for (const l of layers) {
      const p = sheetPos[l]!;
      const s = new Img(SW, SH);
      s.copy(charImg, 0, 0, p.x, p.y, SW, SH);
      grid.blit(s, (i % GC) * SW, Math.floor(i / GC) * SH);
    }
  });
  const bg = new Img(grid.w, grid.h);
  bg.rect(0, 0, bg.w, bg.h, '#3d5a37');
  bg.blit(grid, 0, 0);
  writeFileSync(join(REVIEW, 'combos-x3.png'), upscale(bg, 3).toPNG());
  log('review images written');
}

function upscale(src: Img, f: number): Img {
  const o = new Img(src.w * f, src.h * f);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(Math.floor(x / f), Math.floor(y / f)));
  return o;
}

log('done');
