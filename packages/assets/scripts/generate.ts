// Deterministic asset generator. Run: `pnpm assets:generate` (from the repo root).
// Writes everything into packages/assets/generated/ — see packages/assets/README.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCESSORIES, GHOST_STYLES, HAIR_COLORS, HAIR_STYLES, OUTFIT_PALETTES, OUTFITS, SKIN_TONES } from '@ct/protocol';
import { EGG_KINDS, PROP_DEFS, townLayout, townMap, TS } from '../src/layout.js';
import { EGG_SPRITES } from '../src/eggs/index.js';
import { clearClockHands, drawBuildings, TOWER_HD, towerPoint, enlargeTower } from './buildings.js';
import { drawCritters } from './critters.js';
import { ANCHOR, DIRS, drawCharacters, FH, FRAMES, FW } from './characters.js';
import { DECAL_NAMES, drawDecals, drawFavicon, drawLights } from './decals.js';
import { proceduralTexture, renderGround, sliceTiles, TERRAIN_TEXTURES } from './ground.js';
import { Img, scale2x } from './lib/img.js';
import { drawProps } from './props.js';
import { deriveVariants } from './props-extra.js';
import { addPresetSheets, ghostOf, portraitOf, unifyGhost } from './presets.js';
import { CHARACTER_PRESETS } from '../src/presets.js';
import { FOREGROUND } from '../src/foreground.js';
import { AI_JOBS_ENABLED_BY_DEFAULT, applyAiJobs, detectWindows, productionPlacements } from '../ai/scripts/remaster.js';
import { writeBakedArt } from './baked-art.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'generated');
const REVIEW = join(here, '..', '.review');
mkdirSync(OUT, { recursive: true });
const review = process.argv.includes('--review');
// AI remasters (packages/assets/ai): validated AI frames replace procedural ones unless disabled.
const useAi = AI_JOBS_ENABLED_BY_DEFAULT && !process.argv.includes('--procedural') && process.env.CT_ASSETS_PROCEDURAL !== '1';
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
// 0. Procedural sprites + AI remasters (validated AI frames replace procedural ones)
const props = drawProps();
// CMU easter-egg sprites (src/eggs/EGG_SPRITES): loaded as-is, validated against their defs
for (const [frame, rel] of Object.entries(EGG_SPRITES)) {
  const im = Img.fromPNG(readFileSync(join(here, '..', 'src', 'eggs', rel)));
  props.set(frame, im);
}
for (const [kind, def] of Object.entries(PROP_DEFS)) {
  const f = props.get(kind === 'fence' || kind === 'iron' ? `${kind}_0` : kind);
  if (!f) throw new Error(`no sprite for object kind ${kind}${EGG_KINDS.has(kind) ? ' (add it to EGG_SPRITES)' : ''}`);
  if (f.w !== def.w || f.h !== def.h) throw new Error(`prop ${kind} size ${f.w}x${f.h} != ${def.w}x${def.h}`);
}
const buildings = drawBuildings();
const frames = new Map<string, Img>(props);
for (const [id, b] of buildings) frames.set(`bld_${id}`, b.img);
for (const [k, im] of drawCritters()) frames.set(k, im);
const chars = drawCharacters();
for (const g of GHOST_STYLES) chars.sheets.set(`ghost/${g}`, unifyGhost(chars.sheets.get(`ghost/${g}`)!));
addPresetSheets(chars.sheets);
const terrainTex = new Map<string, Img>(TERRAIN_TEXTURES.map((t) => [t, proceduralTexture(t)]));
const newArt = new Map<string, { img: Img; outDir: string }>();
const aiReport = applyAiJobs({ objects: frames, characters: chars.sheets, terrain: terrainTex, newArt }, { enabled: useAi });
// prop variants (repaired bench, open barrel, second canopies) are derived from the final (possibly AI) frames
deriveVariants(frames);
// new AI art without procedural counterpart (UI art for the client, role icons): one PNG per frame
{
  const ROOT = join(here, '..', '..', '..');
  const dirs = new Map<string, string[]>();
  for (const [frame, { img, outDir }] of newArt) {
    mkdirSync(join(ROOT, outDir), { recursive: true });
    writeFileSync(join(ROOT, outDir, `${frame}.png`), img.toPNG());
    dirs.set(outDir, [...(dirs.get(outDir) ?? []), frame]);
  }
  for (const [dir, list] of dirs) writeFileSync(join(ROOT, dir, 'manifest.json'), JSON.stringify({ model: 'gpt-6-astra', files: list.sort().map((f) => `${f}.png`) }, null, 1) + '\n');
  if (newArt.size) log(`new AI art: ${newArt.size} files in ${[...dirs.keys()].join(', ')}`);
}
for (const r of aiReport) if (r.status === 'failed') log(`AI frame ${r.frame} (${r.job}) rejected, keeping procedural: ${r.reason}`);
log(`AI remasters: ${aiReport.filter((r) => r.status === 'ai').length} frames in use${useAi ? '' : ' (disabled: procedural only)'}`);
// preset ghosts follow the (possibly remastered) alive sheet unless a ghost was remastered itself
for (const p of CHARACTER_PRESETS) {
  const gk = `preset/${p.id}/ghost`;
  if (!aiReport.some((r) => r.frame === gk && r.status === 'ai')) chars.sheets.set(gk, ghostOf(chars.sheets.get(`preset/${p.id}`)!));
}
for (const [id, b] of buildings) {
  const f = frames.get(`bld_${id}`)!;
  // live clock hands are drawn by the client: paint the face without hands (AI or procedural)
  if (b.clock) clearClockHands(f, b.clock);
  if (f === b.img) continue;
  b.img = f;
  // Remasters keep the window layout, so the procedural facade-light points stay; check that
  // each still sits on a lit window of the AI sprite.
  const glow = detectWindows(f);
  const matched = b.windows.filter((p) => glow.some((g) => Math.abs(g.x - p.x) <= 4 && Math.abs(g.y - p.y) <= 4)).length;
  if (matched < b.windows.length) log(`bld_${id}: ${matched}/${b.windows.length} facade lights over lit AI windows`);
}

// ---------------------------------------------------------------------------------------
// 0b. Art density (docs/art-direction.md, "Visual overhaul"): D texels per world px. At D=2 every
// frame starts as the best 1x art upscaled (alignment baseline / labelled fallback) and the
// density-2 model redraws replace it. World coordinates never change.
// Default density 2 (2026-10 overhaul); `CT_ASSETS_DENSITY=1` / `--density=1` regenerates the 1x set.
const D: 1 | 2 = process.env.CT_ASSETS_DENSITY === '1' || process.argv.includes('--density=1') ? 1 : 2;
const T = TS * D; // texels per tile
let upscaledFrames: string[] = [];
const FR = new Map<string, Img>(); // final object frames (texels)
const SHEETS = new Map<string, Img>(); // final character sheets (texels)
const terrain2 = new Map<string, Img>(); // 2x base-material textures (density 2)
if (D === 1) {
  for (const [k, im] of frames) FR.set(k, im);
  for (const [k, im] of chars.sheets) SHEETS.set(k, im);
} else {
  for (const [k, im] of frames) FR.set(k, scale2x(im));
  for (const [k, im] of chars.sheets) SHEETS.set(k, scale2x(im));
  FR.set('bld_clocktower', enlargeTower(FR.get('bld_clocktower')!)); // showpiece size (TOWER_HD)
  for (const t of TERRAIN_TEXTURES) terrain2.set(t, upscale(terrainTex.get(t)!, 2));
  const report2 = applyAiJobs({ objects: FR, characters: SHEETS, terrain: terrain2, newArt }, { enabled: useAi, density: 2 });
  // terrain textures without an accepted 2x redraw use the 1x procedural texel (2x2 texel blocks)
  for (const t of TERRAIN_TEXTURES) if (!report2.some((r) => r.frame === t && r.status === 'ai')) terrain2.delete(t);
  for (const r of report2) if (r.status === 'failed') log(`AI 2x frame ${r.frame} (${r.job}) rejected, keeping the upscaled fallback: ${r.reason}`);
  aiReport.push(...report2);
  const hd = new Set(report2.filter((r) => r.status === 'ai').map((r) => r.frame));
  // the model's ghost-style redraws are opaque: give them the guide's ~85% ghost opacity
  for (const g of GHOST_STYLES) {
    const k = `ghost/${g}`;
    if (!hd.has(k)) continue;
    const im = SHEETS.get(k)!;
    for (let i = 3; i < im.data.length; i += 4) im.data[i] = Math.round(im.data[i]! * 0.85);
  }
  // layered character variants: the model redrew one base per layer (fair / crimson / brown);
  // derive the other skins, palettes and hair colours by a per-pixel colour-ratio transfer between
  // the procedural base and target variants (shading from the model, hue from the procedural ramp)
  const transfer = (ai: Img, base: Img, tgt: Img): Img => {
    const out = new Img(ai.w, ai.h);
    for (let i = 0; i < ai.data.length; i += 4) {
      if (ai.data[i + 3] === 0) continue;
      for (let c = 0; c < 3; c++) out.data[i + c] = Math.min(255, Math.round((ai.data[i + c]! * (tgt.data[i + c]! + 16)) / (base.data[i + c]! + 16)));
      out.data[i + 3] = tgt.data[i + 3]! || ai.data[i + 3]!;
    }
    return out;
  };
  const derive = (baseKey: string, keys: string[]) => {
    if (!hd.has(baseKey)) return;
    const ai = SHEETS.get(baseKey)!;
    const b2 = scale2x(chars.sheets.get(baseKey)!);
    for (const k of keys) {
      if (k === baseKey || hd.has(k) || !chars.sheets.has(k)) continue;
      SHEETS.set(k, transfer(ai, b2, scale2x(chars.sheets.get(k)!)));
      hd.add(k);
    }
  };
  derive('body/fair', SKIN_TONES.map((t) => `body/${t}`));
  for (const o of OUTFITS) derive(`outfit/${o}/crimson`, OUTFIT_PALETTES.map((p) => `outfit/${o}/${p}`));
  for (const h of HAIR_STYLES) if (h !== 'bald') derive(`hair/${h}/brown`, HAIR_COLORS.map((c) => `hair/${h}/${c}`));
  // preset ghosts follow the final 2x alive sheet
  for (const p of CHARACTER_PRESETS) {
    const gk = `preset/${p.id}/ghost`;
    if (!hd.has(gk) && hd.has(`preset/${p.id}`)) {
      SHEETS.set(gk, ghostOf(SHEETS.get(`preset/${p.id}`)!));
      hd.add(gk);
    }
  }
  upscaledFrames = [...FR.keys(), ...SHEETS.keys()].filter((k) => !hd.has(k)).sort();
  log(`density 2: ${hd.size} redrawn frames/sheets, ${upscaledFrames.length} upscaled fallbacks`);
}

// Compact the gathering architecture, leaving room in the fixed viewport for street facades.
// The clock motif is an inlay at the centre, no longer an arena wall around the voters.
for (const [name, factor] of [['kerb', 0.8], ['mosaic', 0.4]] as const) {
  const src = FR.get(name)!;
  const out = new Img(Math.round(src.w * factor), Math.round(src.h * factor));
  for(let y=0;y<out.h;y++) for(let x=0;x<out.w;x++) out.set(x,y,src.get(Math.floor(x/factor),Math.floor(y/factor)));
  FR.set(name,out);
}
// The C-derived plaza is a complete quiet paving disk, including its central inlay.
// It replaces the old kerb plus disconnected clock ring as one authored ground asset.
const plazaPath = join(here, '../ai/target/production/plaza-c.png');
if (existsSync(plazaPath)) {
  const raw = Img.fromPNG(readFileSync(plazaPath));
  const size = 320 * D;
  const out = new Img(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = raw.get(Math.floor((x + 0.5) * raw.w / size), Math.floor((y + 0.5) * raw.h / size));
    out.set(x, y, c);
  }
  FR.set('kerb', out);
  const motif = FR.get('mosaic')!;
  FR.set('mosaic', new Img(motif.w, motif.h));
}

// C tower anchors measured on the preserved 1024×1536 production source. Transform them
// through the SAME uniform fit as its artwork, rather than using the old procedural facade.
const towerFit = productionPlacements.get('bld_clocktower');
const cTowerPoint = (x: number, y: number) => towerFit ? {
  x: (towerFit.left + (x - towerFit.sourceX) * towerFit.scale) / D,
  y: (towerFit.top + (y - towerFit.sourceY) * towerFit.scale) / D,
} : null;
const towerClock = cTowerPoint(469, 753);
if (towerClock && towerFit) clearClockHands(FR.get('bld_clocktower')!, { x: towerClock.x * D, y: towerClock.y * D, r: 101 * towerFit.scale });

// 1. Ground
log('rendering ground…');
const groundImg = renderGround(Object.fromEntries(TERRAIN_TEXTURES.filter((t) => terrainTex.get(t) !== undefined && aiReport.some((r) => r.frame === t && r.status === 'ai')).map((t) => [t, terrainTex.get(t)!])));
// density 2: base materials from accepted 2x texture redraws (else the 1x procedural texel as 2x2
// blocks); edges, shores and shadows from the 1x renderer
const groundT = D === 2 ? renderGround(Object.fromEntries([...terrain2.entries()]), 2) : groundImg;
const { tileset: terrainImg, indices, count } = sliceTiles(groundT, 64, T);
log(`ground: ${count} unique tiles`);
write('terrain.png', terrainImg.toPNG());

// 2. Decor
const decals = drawDecals();
const decalT = (n: string) => (D === 2 ? scale2x(decals.get(n)!) : decals.get(n)!);
const decorImg = new Img(DECAL_NAMES.length * T, T);
DECAL_NAMES.forEach((n, i) => decorImg.copy(decalT(n), i * T, 0));
write('decor.png', decorImg.toPNG());
const collisionTile = new Img(T, T);
collisionTile.rect(0, 0, T, T, [200, 40, 60, 110]);
write('collision.png', collisionTile.toPNG());

// 3. Objects atlas (props + buildings; drawn and AI-remastered in step 0)
const atlas = pack(FR, 1024 * D);
write('objects.png', atlas.img.toPNG());
write('objects.json', JSON.stringify({ image: 'objects.png', density: D, width: atlas.img.w, height: atlas.img.h, frames: atlas.rects }, null, 0));
writeBakedArt(FR, OUT, D);

// 4. Characters (drawn above, before AI remasters were applied)
const SW = FW * D * FRAMES.length;
const SH = FH * D * DIRS.length;
const CCOLS = D === 2 ? 16 : 10;
const charKeys = [...SHEETS.keys()];
const charImg = new Img(CCOLS * SW, Math.ceil(charKeys.length / CCOLS) * SH);
const sheetPos: Record<string, { x: number; y: number }> = {};
charKeys.forEach((k, i) => {
  const x = (i % CCOLS) * SW;
  const y = Math.floor(i / CCOLS) * SH;
  charImg.copy(SHEETS.get(k)!, x, y);
  sheetPos[k] = { x, y };
});
write('characters.png', charImg.toPNG());
const charManifest = {
  image: 'characters.png',
  density: D,
  frameWidth: FW * D,
  frameHeight: FH * D,
  anchor: { x: ANCHOR.x * D, y: ANCHOR.y * D },
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
    /** Premade characters (src/presets.ts); take precedence over the layered keys. */
    preset: 'preset/{preset}',
    presetGhost: 'preset/{preset}/ghost',
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
// standalone preset sheets + portraits (picker UI)
mkdirSync(join(OUT, 'presets'), { recursive: true });
for (const p of CHARACTER_PRESETS) {
  const alive = SHEETS.get(`preset/${p.id}`)!;
  writeFileSync(join(OUT, 'presets', `${p.id}.png`), alive.toPNG());
  writeFileSync(join(OUT, 'presets', `${p.id}-ghost.png`), SHEETS.get(`preset/${p.id}/ghost`)!.toPNG());
  writeFileSync(join(OUT, 'presets', `${p.id}-portrait.png`), portraitOf(alive).toPNG());
}
write(
  'presets.json',
  JSON.stringify(
    {
      density: D,
      frameWidth: FW * D,
      frameHeight: FH * D,
      anchor: { x: ANCHOR.x * D, y: ANCHOR.y * D },
      directions: DIRS,
      frames: FRAMES,
      portrait: { w: 48, h: 48 },
      presets: CHARACTER_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        blurb: p.blurb,
        lantern: !!p.lantern,
        sheet: `presets/${p.id}.png`,
        ghost: `presets/${p.id}-ghost.png`,
        portrait: `presets/${p.id}-portrait.png`,
        art: upscaledFrames.includes(`preset/${p.id}`) ? 'upscaled' : aiReport.some((r) => r.frame === `preset/${p.id}` && r.status === 'ai') ? 'gpt-6-astra' : 'procedural',
      })),
    },
    null,
    1,
  ),
);

write(
  'ai.json',
  JSON.stringify(
    { procedural: !useAi, density: D, upscaled: upscaledFrames, frames: aiReport.filter((r) => r.status !== 'disabled').map((r) => ({ frame: r.frame, job: r.job, status: r.status, iou: r.iou, reason: r.reason })) },
    null,
    1,
  ),
);

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
  const bottom = (o.y + 1) * TS; // world px
  const def = o.kind === 'building' ? null : PROP_DEFS[o.kind]!;
  const type = o.kind === 'building' ? 'building' : def?.flat ? 'flat' : 'prop';
  const props: Prop[] = [
    { name: 'frame', type: 'string', value: frame },
    // all spatial values are texels (the client divides by the map's `density`), depth included
    { name: 'depth', type: 'float', value: bottom * D },
  ];
  if (o.kind === 'building') props.push({ name: 'building', type: 'string', value: o.frame! });
  const offX = D === 2 && frame === 'bld_clocktower' ? TOWER_HD.offsetX * D : 0;
  objects.push(tobj(o.kind === 'building' ? o.frame! : o.kind, type, o.x * T + offX, bottom * D - r.h, r.w, r.h, props));
}
const lightObj = (l: { x: number; y: number; r: number; color: string; building: string | null; facade?: boolean }) =>
  tobj('light', 'light', Math.round(l.x * D), Math.round(l.y * D), 0, 0, [
    { name: 'radius', type: 'float', value: l.r * D },
    { name: 'color', type: 'string', value: l.color },
    { name: 'building', type: 'string', value: l.building ?? '' },
    { name: 'facade', type: 'bool', value: !!l.facade },
  ]);
for (const l of townMap.lights) objects.push(lightObj(l));
const anchors: { smoke: { x: number; y: number; building: string }[]; clock: { x: number; y: number; r: number } | null } = { smoke: [], clock: null };
for (const b of townLayout.buildings) {
  const s = buildings.get(b.id)!;
  // showpiece tower at density 2: bigger sprite over the same footprint (TOWER_HD)
  const big = D === 2 && b.kind === 'clocktower';
  const pt = (p: { x: number; y: number }) => (big ? towerPoint(p, s.img.h) : p);
  const h1 = big ? s.img.h * TOWER_HD.sy : s.img.h;
  const left = b.footprint.x * TS + (big ? TOWER_HD.offsetX : 0);
  const top = (b.footprint.y + b.footprint.h) * TS - h1;
  for (const w0 of s.windows) {
    const w = pt(w0);
    objects.push(lightObj({ x: left + w.x, y: top + w.y, r: b.kind === 'chapel' ? 40 : 30, color: b.kind === 'chapel' ? 'holy' : 'warm', building: null, facade: true }));
  }
  // ambient anchors (client: chimney smoke, live clock hands) -> ambient.json (world px)
  for (const c of s.chimneys ?? []) anchors.smoke.push({ x: left + c.x, y: top + c.y, building: b.id });
  if (s.clock) {
    const c = pt(s.clock);
    anchors.clock = { x: Math.round(left + c.x), y: Math.round(top + c.y), r: Math.round(s.clock.r * (big ? TOWER_HD.sx : 1)) };
    if (big && towerClock && towerFit) anchors.clock = { x: left + towerClock.x, y: (b.footprint.y + b.footprint.h) * TS - FR.get('bld_clocktower')!.h / D + towerClock.y, r: 101 * towerFit.scale / D };
  }
}
// belfry bells (client: swing on the public bell cue): bronze clusters in the top of the final
// tower sprite, as rects relative to the sprite's top-left in WORLD px
{
  const tower = FR.get('bld_clocktower')!;
  const bronze = (x: number, y: number) => {
    const [r, g, b, a] = tower.get(x, y);
    return a > 200 && r > 140 && g > 90 && b < 90 && r - b > 70;
  };
  const seen = new Uint8Array(tower.w * tower.h);
  const boxes: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
  for (let y = 0; y < Math.floor(tower.h * 0.45); y++)
    for (let x = 0; x < tower.w; x++) {
      if (seen[y * tower.w + x] || !bronze(x, y)) continue;
      const st = [[x, y]];
      seen[y * tower.w + x] = 1;
      const bx = { x0: x, y0: y, x1: x, y1: y, n: 0 };
      while (st.length) {
        const [px, py] = st.pop()!;
        bx.n++;
        bx.x0 = Math.min(bx.x0, px!);
        bx.y0 = Math.min(bx.y0, py!);
        bx.x1 = Math.max(bx.x1, px!);
        bx.y1 = Math.max(bx.y1, py!);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const qx = px! + dx!;
          const qy = py! + dy!;
          if (qx < 0 || qy < 0 || qx >= tower.w || qy >= tower.h || seen[qy * tower.w + qx] || !bronze(qx, qy)) continue;
          seen[qy * tower.w + qx] = 1;
          st.push([qx, qy]);
        }
      }
      boxes.push(bx);
    }
  boxes.sort((a, b) => b.n - a.n);
  const bells = boxes
    .slice(0, 2)
    .sort((a, b) => a.x0 - b.x0)
    .map((b) => ({ x: Math.floor(b.x0 / D), y: Math.floor(b.y0 / D), w: Math.ceil((b.x1 - b.x0 + 1) / D), h: Math.ceil((b.y1 - b.y0 + 1) / D) }));
  const authoredBell = cTowerPoint(408, 375);
  const finalBells = authoredBell && towerFit ? [{ x: Math.round(authoredBell.x), y: Math.round(authoredBell.y), w: Math.round(159 * towerFit.scale / D), h: Math.round(198 * towerFit.scale / D) }] : bells;
  log(`belfry bells: ${JSON.stringify(finalBells)}`);
  (anchors as Record<string, unknown>).bells = finalBells;
}
write('ambient.json', JSON.stringify(anchors));
const tsDef = (name: string, image: string, iw: number, ih: number, firstgid: number) => ({
  firstgid,
  name,
  image,
  imagewidth: iw,
  imageheight: ih,
  tilewidth: T,
  tileheight: T,
  tilecount: (iw / T) * (ih / T),
  columns: iw / T,
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
  tilewidth: T,
  tileheight: T,
  infinite: false,
  nextlayerid: 5,
  nextobjectid: oid,
  properties: [
    { name: 'townBounds', type: 'string', value: JSON.stringify(townLayout.townBounds) },
    { name: 'square', type: 'string', value: JSON.stringify(townLayout.square) },
    // texels per world px: divide object/light x, y, width, height and tile sizes by this
    { name: 'density', type: 'int', value: D },
  ],
  tilesets: [
    tsDef('terrain', 'terrain.png', terrainImg.w, terrainImg.h, 1),
    tsDef('decor', 'decor.png', decorImg.w, decorImg.h, decorGid0),
    tsDef('collision', 'collision.png', T, T, collisionGid),
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
  const img = groundT.clone();
  for (const d of townMap.decals) img.blit(decalT(d.name), d.x * T, d.y * T);
  const sorted = [...objects].filter((o) => o.type !== 'light').sort((a, b) => {
    const fa = a.type === 'flat' ? 0 : 1;
    const fb = b.type === 'flat' ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return (a.properties[1]!.value as number) - (b.properties[1]!.value as number);
  });
  for (const o of sorted) img.blit(FR.get(o.properties[0]!.value as string)!, o.x, o.y);
  // a few villagers in the square
  const people: [string[], number, number][] = [
    [['preset/skeleton-baker'], 45, 53],
    [['preset/frog-knight'], 51, 53],
    [['preset/owl-archivist'], 44, 51],
    [['preset/mushroom-priest/ghost'], 52, 51],
    [['storyteller'], 48, 56],
  ];
  for (const [layers, tx, ty] of people)
    for (const l of layers) {
      const p = sheetPos[l]!;
      const s = new Img(FW * D, FH * D);
      s.copy(charImg, 0, 0, p.x, p.y, FW * D, FH * D);
      img.blit(s, (tx * TS + 8 - ANCHOR.x) * D, (ty * TS + 14 - ANCHOR.y) * D);
    }
  // foreground layer (drawn above everything in the client, with parallax)
  for (const f of FOREGROUND) img.blit(FR.get(f.kind)!, f.x * D, (f.y - f.h) * D);
  return img;
}
const previewT = compose();
// preview-town.png stays at 1 texel per world px; at D=2 the native-density square is written too
const preview = D === 2 ? previewT.downscale(2) : previewT;
write('preview-town.png', preview.toPNG());
if (D === 2) {
  const sq = new Img(36 * T, 28 * T);
  sq.copy(previewT, 0, 0, 30 * T, 34 * T, sq.w, sq.h);
  write('preview-square-2x.png', sq.toPNG());
}

if (review) {
  // crops + character sheet blow-ups for art review (not committed)
  const crop = (name: string, x: number, y: number, w: number, h: number, scale = 1) => {
    const c = new Img(w, h);
    c.copy(preview, 0, 0, x, y, w, h);
    const out = scale > 1 ? upscale(c, scale) : c;
    writeFileSync(join(REVIEW, name), out.toPNG());
  };
  crop('square.png', 30 * TS, 34 * TS, 36 * TS, 28 * TS, 2);
  crop('north.png', 0, 0, 96 * TS, 34 * TS);
  crop('nw.png', 0, 6 * TS, 40 * TS, 32 * TS, 2);
  crop('ne.png', 50 * TS, 4 * TS, 46 * TS, 30 * TS, 2);
  crop('south.png', 0, 56 * TS, 96 * TS, 40 * TS);
  crop('interiors.png', 97 * TS, 0, 63 * TS, 48 * TS, 2);
  crop('house0.png', 97 * TS, 1 * TS, 13 * TS, 11 * TS, 4);
  writeFileSync(join(REVIEW, 'characters-x3.png'), upscale(charImg, D === 2 ? 1 : 3).toPNG());
  writeFileSync(join(REVIEW, 'objects.png'), upscale(atlas.img, D === 2 ? 1 : 2).toPNG());
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
  for (const p of CHARACTER_PRESETS) combos.push([`preset/${p.id}`], [`preset/${p.id}/ghost`]);
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
  writeFileSync(join(REVIEW, 'combos-x3.png'), upscale(bg, D === 2 ? 2 : 3).toPNG());
  log('review images written');
}

function upscale(src: Img, f: number): Img {
  const o = new Img(src.w * f, src.h * f);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(Math.floor(x / f), Math.floor(y / f)));
  return o;
}

log('done');
