// OWNED BY v3-world (WP5b, acting for world-art). The Classic 2D art pass for the v3 world "Hollowmere"
// (docs/v3/INTEGRATION.md §2.5). Writes, next to the v2 files in packages/assets/generated/:
//
//   terrain-v3.{png,webp}  the v3 ground (scripts/ground.ts painting the v3 ground codes), sliced into a tileset
//   town-v3.json           the Tiled map TownScene loads in a v3 lobby (112 x 43): ground / decor / collision layers
//                          from the v3 layout + an object layer (v2 sprites placed by scripts/v3/placement.ts, the
//                          v3 lights, door-swing objects, chimney / clock anchors) and map properties
//                          (world, townBounds, square, plaza, npcHomes)
//   square-props-v3.json   meta.houses for the v3 world (boarded / unlit overlays, door glow, board and smoke
//                          anchors in v3 world px); its frames are the v2 square-props.* atlas, which it reuses
//   objects-v3.{png,webp,json}  the few sprites only the v3 world draws (placement.ts GENERIC_SOUTH cottages:
//                          building, door leaf / doorway, boarded / unlit overlays); objects and overlays that use
//                          them carry `atlas: 'objects-v3'`
//
// Runs after the v2 pass (it reads generated/objects.json and generated/square-props.json) in its own process,
// because scripts/ground.ts derives the world it paints at import time (scripts/lib/world.ts):
//   pnpm assets:generate                         (scripts/generate.ts spawns this at the end)
//   pnpm --filter @ct/assets exec tsx scripts/v3/classic.ts [--review]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
if (process.env.CT_ASSETS_WORLD !== 'v3') {
  // re-run in a v3 process (the same node + loader flags: tsx)
  const r = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, CT_ASSETS_WORLD: 'v3' } });
  process.exit(r.status ?? 1);
}

const { PROP_DEFS, TS } = await import('../../src/layout.js');
const { townLayoutV3, townMapV3, npcHomesV3 } = await import('../../src/hollowmere/layoutV3.js');
const { classicWorldV3, drawnBuildings } = await import('./placement.js');
const { renderGround, sliceTiles } = await import('../ground.js');
const { WORLD } = await import('../lib/world.js');
const { cottageFront, drawBuildings, EXTRA } = await import('../buildings.js');
const { houseMetaFor } = await import('../fx/houses.js');
const { DECAL_NAMES, drawDecals } = await import('../decals.js');
const { losslessWebP, optimisedPNG } = await import('../lib/encode.js');
const { Img } = await import('../lib/img.js');
type ImgT = InstanceType<typeof Img>;
if (WORLD !== 'v3') throw new Error('classic v3: scripts/lib/world.ts did not select the v3 world');

const OUT = join(here, '..', '..', 'generated');
const REVIEW = join(here, '..', '..', '.review');
const review = process.argv.includes('--review');
const t0 = Date.now();
const log = (m: string) => console.log(`[assets v3 ${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const write = (name: string, data: Buffer | string) => {
  writeFileSync(join(OUT, name), data);
  log(`wrote ${name} (${(Buffer.byteLength(data) / 1024).toFixed(0)} KiB)`);
};

const L = townLayoutV3;
const world = classicWorldV3();
const W = L.widthTiles;
const H = L.heightTiles;

// 1. Ground
log('rendering v3 ground…');
const groundImg = renderGround();
if (groundImg.w !== W * TS || groundImg.h !== H * TS) throw new Error(`classic v3: ground ${groundImg.w}x${groundImg.h}, expected ${W * TS}x${H * TS}`);
const { tileset: terrainImg, indices, count } = sliceTiles(groundImg);
log(`v3 ground: ${count} unique tiles`);
write('terrain-v3.png', optimisedPNG(terrainImg));
write('terrain-v3.webp', await losslessWebP(terrainImg));

// 2. Objects (atlas frames of the v2 pass)
const atlas = JSON.parse(readFileSync(join(OUT, 'objects.json'), 'utf8')) as { frames: Record<string, { x: number; y: number; w: number; h: number }> };
const sprites = drawBuildings(); // the v2 sprites (same pixels as the atlas): windows, doors, chimneys, the dial
const drawn = new Map(drawnBuildings().map((d) => [d.id, d]));
// v3-only sprites (GENERIC_SOUTH): a generic front-door cottage in the house's own v2 style, in objects-v3.*
const EXTRA_ATLAS = 'objects-v3';
const extraFrames = new Map<string, ImgT>();
const frameName = (kind: string, id: string) => `${kind}_${drawn.get(id)?.generic ? `${id}@v3` : id}`;
{
  let i = 0;
  for (const d of drawn.values()) {
    if (d.generic) {
      const style = { ...townMapV3.styles[d.id]!, facing: 'south' as const };
      const s = cottageFront({ ...d.def, footprint: d.footprint }, style, EXTRA[d.def.kind] ?? 16, 100 + i * 13, i);
      sprites.set(d.id, s);
      extraFrames.set(frameName('bld', d.id), s.img);
      if (s.leaf) extraFrames.set(frameName('door', d.id), s.leaf);
      if (s.doorway) extraFrames.set(frameName('doorway', d.id), s.doorway);
    }
    i++;
  }
}
const extraHouseFx = new Map<string, ReturnType<typeof houseMetaFor>['meta']>();
for (const d of drawn.values()) {
  if (!d.generic) continue;
  const h = houseMetaFor({ ...d.def, footprint: d.footprint }, sprites.get(d.id)!, d.def.houseIndex ?? 0, d.footprint.x * TS, (d.footprint.y + d.footprint.h) * TS, `${d.id}@v3`);
  for (const [n, img] of h.frames) extraFrames.set(n, img);
  extraHouseFx.set(d.id, h.meta);
}
const extraRects: Record<string, { x: number; y: number; w: number; h: number }> = {};
{
  let x = 0;
  let hMax = 0;
  for (const [n, img] of [...extraFrames].sort(([a], [b]) => (a < b ? -1 : 1))) {
    extraRects[n] = { x, y: 0, w: img.w, h: img.h };
    x += img.w + 2;
    hMax = Math.max(hMax, img.h);
  }
  const strip = new Img(Math.max(4, Math.ceil(x / 4) * 4), Math.max(4, Math.ceil(hMax / 4) * 4));
  for (const [n, r] of Object.entries(extraRects)) strip.copy(extraFrames.get(n)!, r.x, r.y);
  write('objects-v3.png', optimisedPNG(strip));
  write('objects-v3.webp', await losslessWebP(strip));
  write('objects-v3.json', JSON.stringify({ image: 'objects-v3.png', width: strip.w, height: strip.h, frames: extraRects }));
}
const rectOf = (frame: string) => atlas.frames[frame] ?? extraRects[frame];
const atlasProp = (frame: string): Prop[] => (extraRects[frame] ? [{ name: 'atlas', type: 'string', value: EXTRA_ATLAS }] : []);
let oid = 1;
type Prop = { name: string; type: string; value: string | number | boolean };
const tobj = (name: string, type: string, x: number, y: number, w: number, h: number, props: Prop[]) => ({ id: oid++, name, type, class: type, x, y, width: w, height: h, rotation: 0, visible: true, properties: props });
const objects: ReturnType<typeof tobj>[] = [];
for (const o of world.townMap.objects) {
  const frame = o.kind === 'building' ? `bld_${o.frame}` : (o.frame ?? o.kind);
  const r = rectOf(frame);
  if (!r) throw new Error(`classic v3: missing atlas frame ${frame}`);
  const bottom = (o.y + 1) * TS;
  const def = o.kind === 'building' ? null : PROP_DEFS[o.kind]!;
  const type = o.kind === 'building' ? 'building' : def?.flat ? 'flat' : 'prop';
  const props: Prop[] = [
    { name: 'frame', type: 'string', value: frame },
    { name: 'depth', type: 'float', value: bottom },
    ...atlasProp(frame),
  ];
  if (o.kind === 'building') {
    props.push({ name: 'building', type: 'string', value: o.frame!.replace(/@v3$/, '') });
    // the drawn footprint (tiles): what TownScene taps / boards against (the server footprint is the placed AABB)
    props.push({ name: 'footprint', type: 'string', value: JSON.stringify(drawn.get(o.frame!.replace(/@v3$/, ''))!.footprint) });
  }
  objects.push(tobj(o.kind === 'building' ? o.frame!.replace(/@v3$/, '') : o.kind, type, o.x * TS, bottom - r.h, r.w, r.h, props));
}
const lightObj = (l: { x: number; y: number; r: number; color: string; building: string | null; facade?: boolean }) =>
  tobj('light', 'light', Math.round(l.x), Math.round(l.y), 0, 0, [
    { name: 'radius', type: 'float', value: l.r },
    { name: 'color', type: 'string', value: l.color },
    { name: 'building', type: 'string', value: l.building ?? '' },
    { name: 'facade', type: 'bool', value: !!l.facade },
  ]);
// the v3 lights (street lamps outdoors, the 3D rooms' lamps indoors) + the v2 sprites' window glows where drawn
for (const l of townMapV3.lights) objects.push(lightObj(l));
const spriteBox = (id: string) => {
  const d = drawn.get(id)!;
  const s = sprites.get(id)!;
  const left = d.footprint.x * TS;
  const bottom = (d.footprint.y + d.footprint.h) * TS;
  return { s, d, left, bottom, top: bottom - s.img.h };
};
for (const id of drawn.keys()) {
  const { s, d, left, top } = spriteBox(id);
  for (const w of s.windows) objects.push(lightObj({ x: left + w.x, y: top + w.y, r: d.def.kind === 'chapel' ? 40 : 30, color: d.def.kind === 'chapel' ? 'holy' : 'warm', building: null, facade: true }));
}
for (const id of drawn.keys()) {
  const { s, left, top, bottom } = spriteBox(id);
  const bo = objects.find((o) => o.type === 'building' && o.name === id);
  if (bo && s.clock) bo.properties.push({ name: 'clock', type: 'string', value: JSON.stringify({ x: left + s.clock.x, y: top + s.clock.y, r: s.clock.r }) });
  if (bo && s.chimney && drawn.get(id)!.def.kind !== 'clocktower') bo.properties.push({ name: 'chimney', type: 'string', value: JSON.stringify({ x: left + s.chimney.x, y: top + s.chimney.y }) });
  if (!s.door || !s.leaf || !s.doorway || drawn.get(id)!.def.kind === 'clocktower') continue;
  const leaf = frameName('door', id);
  objects.push(
    tobj(id, 'door', left + s.door.x, top + s.door.y, s.door.w, s.door.h, [
      { name: 'frame', type: 'string', value: leaf },
      { name: 'depth', type: 'float', value: bottom + 0.5 },
      ...atlasProp(leaf),
      { name: 'building', type: 'string', value: id },
      { name: 'leaf', type: 'string', value: leaf },
      { name: 'hole', type: 'string', value: frameName('doorway', id) },
      { name: 'hinge', type: 'string', value: s.door.hinge },
    ]),
  );
}

// 3. The Tiled map
const decorGid0 = 1 + count;
const collisionGid = decorGid0 + DECAL_NAMES.length;
const decorData = new Array<number>(W * H).fill(0);
for (const d of townMapV3.decals) {
  const k = DECAL_NAMES.indexOf(d.name as (typeof DECAL_NAMES)[number]);
  if (k < 0) throw new Error(`classic v3: unknown decal ${d.name}`);
  decorData[d.y * W + d.x] = decorGid0 + k;
}
const decorW = DECAL_NAMES.length * TS;
const tsDef = (name: string, image: string, iw: number, ih: number, firstgid: number) => ({ firstgid, name, image, imagewidth: iw, imageheight: ih, tilewidth: TS, tileheight: TS, tilecount: (iw / TS) * (ih / TS), columns: iw / TS, margin: 0, spacing: 0 });
const tileLayer = (id: number, name: string, data: number[], visible = true) => ({ id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible, data });
const npcHomes = Object.fromEntries(Object.entries(npcHomesV3).sort(([a], [b]) => (a < b ? -1 : 1)));
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
    { name: 'world', type: 'string', value: 'v3' },
    { name: 'townBounds', type: 'string', value: JSON.stringify(L.townBounds) },
    { name: 'square', type: 'string', value: JSON.stringify(L.square) },
    { name: 'plaza', type: 'string', value: JSON.stringify(townMapV3.plaza) },
    { name: 'npcHomes', type: 'string', value: JSON.stringify(npcHomes) },
  ],
  tilesets: [tsDef('terrain', 'terrain-v3.png', terrainImg.w, terrainImg.h, 1), tsDef('decor', 'decor.png', decorW, TS, decorGid0), tsDef('collision', 'collision.png', TS, TS, collisionGid)],
  layers: [
    tileLayer(1, 'ground', indices.map((i) => i + 1)),
    tileLayer(2, 'decor', decorData),
    tileLayer(3, 'collision', L.collision.map((c) => (c ? collisionGid : 0)), false),
    { id: 4, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
  ],
};
write('town-v3.json', JSON.stringify(tiled));

// 4. square-props-v3.json: the v2 per-house overlays / anchors moved with each sprite
type Pt = { x: number; y: number };
type Ov = { frame: string; x: number; y: number; w: number; h: number; wx: number; wy: number; atlas?: string };
type HouseFx = { boarded?: Ov; unlit?: Ov; doorglow?: Pt; board?: Pt; smoke?: Pt };
const fx = JSON.parse(readFileSync(join(OUT, 'square-props.json'), 'utf8')) as { image?: string; meta?: { houses?: Record<string, HouseFx> } };
const houses: Record<string, HouseFx> = {};
for (const [id, h] of Object.entries(fx.meta?.houses ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
  const d = drawn.get(id);
  if (!d) continue;
  const extra = extraHouseFx.get(id);
  if (extra) {
    // its own sprite: overlays from objects-v3.*, anchors already in v3 world px
    const own: HouseFx = {};
    for (const [k, v] of Object.entries(extra)) (own as Record<string, unknown>)[k] = k === 'boarded' || k === 'unlit' ? { ...(v as Ov), atlas: EXTRA_ATLAS } : v;
    houses[id] = own;
    continue;
  }
  const sx = d.shift.dx * TS;
  const sy = d.shift.dy * TS;
  const pt = (p: Pt | undefined) => (p ? { x: p.x + sx, y: p.y + sy } : undefined);
  const ov = (o: Ov | undefined) => (o ? { ...o, wx: o.wx + sx, wy: o.wy + sy } : undefined);
  const out: HouseFx = {};
  for (const [k, v] of [
    ['boarded', ov(h.boarded)],
    ['unlit', ov(h.unlit)],
    ['doorglow', pt(h.doorglow)],
    ['board', pt(h.board)],
    ['smoke', pt(h.smoke)],
  ] as const)
    if (v) (out as Record<string, unknown>)[k] = v;
  houses[id] = out;
}
write('square-props-v3.json', JSON.stringify({ world: 'v3', image: fx.image ?? 'square-props.png', note: 'frames: square-props.json (same atlas)', meta: { houses } }));

// 5. (--review) the whole v3 town as Classic draws it, for the Q7 look review (never committed)
if (review) {
  mkdirSync(REVIEW, { recursive: true });
  const objImg = Img.fromPNG(readFileSync(join(OUT, 'objects.png')));
  const decals = drawDecals();
  const img = groundImg.clone();
  for (const d of townMapV3.decals) img.blit(decals.get(d.name)!, d.x * TS, d.y * TS);
  const frame = (name: string): ImgT => {
    if (extraFrames.has(name)) return extraFrames.get(name)!;
    const r = atlas.frames[name]!;
    const f = new Img(r.w, r.h);
    f.copy(objImg, 0, 0, r.x, r.y, r.w, r.h);
    return f;
  };
  const sorted = objects
    .filter((o) => o.type !== 'light' && o.type !== 'door')
    .sort((a, b) => Number(a.type !== 'flat') - Number(b.type !== 'flat') || (a.properties[1]!.value as number) - (b.properties[1]!.value as number));
  for (const o of sorted) img.blit(frame(o.properties[0]!.value as string), o.x, o.y);
  const town = new Img(L.townBounds.w * TS, L.townBounds.h * TS);
  town.copy(img, 0, 0, 0, 0, town.w, town.h);
  writeFileSync(join(REVIEW, 'town-v3.png'), town.toPNG());
  const rooms = new Img((W - L.townBounds.w) * TS, H * TS);
  rooms.copy(img, 0, 0, L.townBounds.w * TS, 0, rooms.w, rooms.h);
  writeFileSync(join(REVIEW, 'interiors-v3.png'), rooms.toPNG());
  log('review images written (.review/town-v3.png, .review/interiors-v3.png)');
}
log('done');
