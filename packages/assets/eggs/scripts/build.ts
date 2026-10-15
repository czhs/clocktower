// CMU easter-egg sprite pipeline (cmu-eggs). Runs on hshi-u1 (never on the editing machine):
//
//   tsx eggs/scripts/build.ts refs [job|all]   blockouts -> eggs/refs/<job>/{ref.png,context.png,prompt.md}
//   (Mac) packages/assets/eggs/scripts/codex-job.sh <job>        runs gpt-6-astra in eggs/staging/<job>/ and
//                                              copies the image to eggs/incoming/<job>.png
//   tsx eggs/scripts/build.ts ingest <job>     eggs/incoming/<job>.png -> eggs/raw/<job>.png (+ .json, prompts/<job>.md)
// (eggs/staging/ is never synced to hshi-u1; refs/ and incoming/ are, and are git-ignored.)
//   tsx eggs/scripts/build.ts build            blockouts + validated AI frames -> generated/eggs/*.png,
//                                              generated/eggs/manifest.json, generated/eggs/review.png
//
// Post-processing and validation reuse the main pipeline's processFrame() (ai/scripts/remaster.ts):
// grid detection, bbox alignment onto the blockout, palette reduction, cleanup, silhouette IoU and
// grounded bottom edge. A frame that fails validation ships as its procedural blockout.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img } from '../../scripts/lib/img.js';
import { AI_MODEL, CANVAS, KEY } from '../../ai/scripts/jobs.js';
import { detectWindows, paletteOf, processFrame } from '../../ai/scripts/remaster.js';
import { layoutSheet } from '../../ai/scripts/sheet.js';
import { EGG_GROUPS, EGG_JOBS, EGG_JOBS_2X, PREFER_PROCEDURAL, eggJobById, type EggJob } from './jobs.js';
import { drawEggSprites } from './sprites.js';
import { budgetFor, toMaster } from './palette.js';

const here = dirname(fileURLToPath(import.meta.url));
const EGGS = join(here, '..');
const ASSETS = join(EGGS, '..');
const GEN = join(ASSETS, 'generated');
const OUT = join(GEN, 'eggs');
const TS = 16;

function upscale(src: Img, f: number): Img {
  const o = new Img(src.w * f, src.h * f);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(Math.floor(x / f), Math.floor(y / f)));
  return o;
}

const ART_DIRECTION = join(ASSETS, '..', '..', 'docs', 'art-direction.md');

function promptFor(job: EggJob, frames: Map<string, Img>): string {
  const C = CANVAS[job.canvas];
  const k = job.scale;
  const cells = layoutSheet(job, (f) => frames.get(f)!);
  const list = cells
    .map((c) => {
      const s = frames.get(c.frame)!;
      return `- \`${c.frame}\`: ${s.w}x${s.h} art pixels, drawn at x=${c.x}..${c.x + c.w - 1}, y=${c.y}..${c.y + c.h - 1} on the canvas`;
    })
    .join('\n');
  const intro2x =
    job.density === 2
      ? `\n\nDOUBLE DENSITY REDRAW: ref.png shows our current, approved sprites enlarged 2x (every original pixel is a 2x2 block, then upscaled ${k}x on the canvas). Redraw them at twice the pixel density — one NEW art pixel = ${k}x${k} screen pixels, so each old pixel becomes 2x2 new pixels. Keep the design, colours, proportions and silhouette exactly; spend the extra resolution on crisper contours, finer texture clusters, smaller highlights, eyes and faces, and cleaner emissive cores.`
      : '';
  const style = existsSync(ART_DIRECTION) ? '\n- Follow the town\'s art direction (summarised): ' + artDirectionSummary() : '';
  return `# Easter-egg sprite prompt — job \`${job.id}\`

Model: ${AI_MODEL} via \`codex exec\` (image generation tool). Attachments: \`ref.png\` (blockout sheet), \`context.png\` (where these sprites will stand, 2x).

---

You are painting NEW original pixel-art sprites for our own game "Clocktower Town": a gothic, whimsical village at night, top-down 3/4 view, 16 px per tile. They must blend into the existing town so well that nobody can tell they were added later.

Attached images:
1. \`ref.png\` (${C.w}x${C.h}): rough blockouts of the sprites, upscaled ${k}x with nearest-neighbour (1 art pixel = ${k}x${k} screen pixels) on a flat pure magenta #FF00FF background (the magenta only marks empty space). The blockouts fix size, silhouette, footprint and the main colours; their detail is crude placeholder work.
2. \`context.png\`: a 2x crop of the current town (its real art), for palette, outline, lighting, perspective and scale.

Subject: ${job.subject}.${intro2x}

Sprite placement on the ${C.w}x${C.h} canvas (keep exactly):
${list}

Use your image generation tool to produce ONE new ${C.w}x${C.h} PNG, using ref.png as the edit/reference input:
- Same silhouette, proportions, footprint and position on the canvas as the blockouts (each sprite fills the same rectangle and stands on the same bottom edge), same top-down 3/4 perspective, same main colours.
- Repaint every surface like a skilled pixel artist matching context.png: individual stones/planks/slates with lit top edges and shadowed lower edges, 3-4 value hue-shifted ramps (cool violet-blue shadows, warmer highlights), ambient occlusion where things meet the ground, moonlight from the upper left, warm amber glow in lit windows and lanterns with a small bright core.
- Clean readable silhouettes with a dark (not black) 1-art-pixel outline; no stray pixels.
- Strict pixel art: hard-edged square pixels on a grid of ${k}x${k} screen pixels, limited palette, no anti-aliasing, no blur, no soft gradients, no painterly strokes, no photographic detail.
- Background: fully transparent (real alpha) everywhere outside the sprites; if transparency is impossible, flat pure magenta #FF00FF. No ground, no cast shadows on the background, no glow halos, no text, no labels, no borders, no grid lines.${style}${(job.notes ?? []).map((n) => `\n- ${n}`).join('')}

Call the image tool exactly once. It returns roughly 1254 px images; that is expected and fine (we rescale), so do not regenerate to fix the size or to adjust anything. Save the generated image as \`out.png\` in the current working directory (do not modify ref.png or context.png), then print the absolute path of out.png and where the image tool originally saved it.
`;
}

/** The art lead's guide is long; pass only its bullet rules (one line each) to the model. */
function artDirectionSummary(): string {
  const md = readFileSync(ART_DIRECTION, 'utf8');
  const rules = md
    .split('\n')
    .filter((l) => /^\s*[-*] /.test(l))
    .map((l) => l.replace(/^\s*[-*] /, '').trim())
    .filter((l) => l.length > 0 && l.length < 220)
    .slice(0, 24);
  return rules.join(' | ');
}

/** 2x references: the shipped 1x frames (generated/eggs/<frame>.png) upscaled 2x. */
function shipped2x(): Map<string, Img> {
  const m = new Map<string, Img>();
  for (const k of drawEggSprites().keys()) {
    const p = join(OUT, `${k}.png`);
    if (existsSync(p)) m.set(k, upscale(Img.fromPNG(readFileSync(p)), 2));
  }
  return m;
}

function refs(arg: string) {
  const frames1 = drawEggSprites();
  for (const [k, im] of frames1) toMaster(im, budgetFor(k)); // references already speak the master palette
  const all = [...EGG_JOBS, ...EGG_JOBS_2X];
  const jobs = arg === 'all' ? EGG_JOBS : arg === 'all2x' ? EGG_JOBS_2X : all.filter((j) => arg.split(',').includes(j.id));
  const frames2 = jobs.some((j) => j.density === 2) ? shipped2x() : new Map<string, Img>();
  if (!jobs.length) throw new Error(`no job ${arg}`);
  const prev = existsSync(join(GEN, 'preview-town.png')) ? Img.fromPNG(readFileSync(join(GEN, 'preview-town.png'))) : null;
  for (const job of jobs) {
    const frames = job.density === 2 ? frames2 : frames1;
    const C = CANVAS[job.canvas];
    const sheet = new Img(C.w, C.h);
    sheet.rect(0, 0, C.w, C.h, [KEY[0], KEY[1], KEY[2], 255]);
    for (const c of layoutSheet(job, (f) => frames.get(f)!)) sheet.blit(upscale(frames.get(c.frame)!, job.scale), c.x, c.y);
    const dir = join(EGGS, 'refs', job.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ref.png'), sheet.toPNG());
    if (prev) {
      const r = job.context;
      const crop = new Img(r.w * TS, r.h * TS);
      crop.copy(prev, 0, 0, r.x * TS, r.y * TS, crop.w, crop.h);
      writeFileSync(join(dir, 'context.png'), upscale(crop, 2).toPNG());
    }
    writeFileSync(join(dir, 'prompt.md'), promptFor(job, frames));
    console.log(`[eggs refs] ${job.id}: ${dir}`);
  }
}

const rawPath = (job: EggJob) => join(EGGS, 'raw', `${job.id}.png`);

function ingest(id: string) {
  const job = eggJobById(id);
  if (!job) throw new Error(`no job ${id}`);
  const im = Img.fromPNG(readFileSync(join(EGGS, 'incoming', `${id}.png`)));
  const f = job.density === 2 ? 1 : Math.max(im.w, im.h) / 1024; // 2x jobs keep full resolution (fine texel grid)
  let out = im;
  if (f > 1) {
    out = new Img(Math.round(im.w / f), Math.round(im.h / f));
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.set(x, y, im.get(Math.min(im.w - 1, Math.floor((x + 0.5) * f)), Math.min(im.h - 1, Math.floor((y + 0.5) * f))));
  }
  mkdirSync(join(EGGS, 'raw'), { recursive: true });
  writeFileSync(rawPath(job), out.toPNG());
  const meta = { job: id, model: AI_MODEL, tool: 'codex exec (image generation)', date: new Date().toISOString().slice(0, 10), modelOutput: `${im.w}x${im.h}`, stored: `${out.w}x${out.h}` };
  writeFileSync(join(EGGS, 'raw', `${id}.json`), JSON.stringify(meta, null, 2) + '\n');
  mkdirSync(join(EGGS, 'prompts'), { recursive: true });
  copyFileSync(join(EGGS, 'refs', id, 'prompt.md'), join(EGGS, 'prompts', `${id}.md`));
  console.log(`[eggs ingest] ${id}: ${im.w}x${im.h} -> ${out.w}x${out.h}`);
}

function rawHasAlpha(raw: Img): boolean {
  let n = 0;
  for (let i = 3; i < raw.data.length; i += 4) if (raw.data[i]! < 128) n++;
  return n > raw.w * raw.h * 0.02;
}

/** Frames whose lit window panes / lantern cores get a runtime night glow. */
const GLOWING = new Set(['egg_wean', 'egg_hamerschlag', 'egg_camp']);

interface FrameReport {
  glows?: [number, number][];
  frame: string;
  w: number;
  h: number;
  source: 'ai' | 'procedural';
  job?: string;
  iou?: number;
  reason?: string;
}

function build() {
  const procedural = process.argv.includes('--procedural') || process.env.CT_ASSETS_PROCEDURAL === '1';
  const blockouts = drawEggSprites();
  const final = new Map(blockouts);
  const report = new Map<string, FrameReport>();
  for (const [k, im] of blockouts) report.set(k, { frame: k, w: im.w, h: im.h, source: 'procedural' });
  for (const job of EGG_JOBS) {
    if (procedural || !job.enabled || !existsSync(rawPath(job))) {
      for (const f of job.frames) report.get(f)!.reason = procedural ? 'procedural build' : !job.enabled ? 'job disabled' : 'no raw image yet';
      continue;
    }
    const raw = Img.fromPNG(readFileSync(rawPath(job)));
    const C = CANVAS[job.canvas];
    if (Math.abs(raw.w / raw.h - C.w / C.h) > 0.02) {
      for (const f of job.frames) report.get(f)!.reason = `raw aspect ${raw.w}x${raw.h}`;
      continue;
    }
    // the last job that lists a frame decides it: start from the blockout again
    for (const f of job.frames) {
      final.set(f, blockouts.get(f)!);
      const rep = report.get(f)!;
      rep.source = 'procedural';
      delete rep.iou;
      delete rep.reason;
    }
    const cells = layoutSheet(job, (f) => blockouts.get(f)!);
    const palette = paletteOf(cells.map((c) => blockouts.get(c.frame)!));
    const alpha = rawHasAlpha(raw);
    for (const c of cells) {
      const src = blockouts.get(c.frame)!;
      const r = processFrame(job, raw, alpha, c, src, palette);
      const rep = report.get(c.frame)!;
      if (r.ok && r.img && r.img.w === src.w && r.img.h === src.h) {
        final.set(c.frame, r.img);
        rep.source = 'ai';
        rep.job = job.id;
        rep.iou = +r.iou.toFixed(3);
        delete rep.reason;
      } else {
        rep.job = job.id;
        rep.iou = +r.iou.toFixed(3);
        rep.reason = r.reason ?? 'size mismatch';
      }
    }
  }
  // reviewed preferences, then animation-group consistency (never mix AI and blockout frames)
  const revert = (f: string, why: string) => {
    final.set(f, blockouts.get(f)!);
    const rep = report.get(f)!;
    if (rep.source === 'ai') rep.reason = why;
    rep.source = 'procedural';
  };
  for (const f of PREFER_PROCEDURAL) revert(f, 'reviewed: blockout reads better at 1x');
  for (const g of EGG_GROUPS)
    if (g.some((f) => report.get(f)!.source !== 'ai')) for (const f of g) if (report.get(f)!.source === 'ai') revert(f, 'group consistency: ' + g.filter((x) => report.get(x)!.source !== 'ai' || x === f).join(','));
  // art-direction contract: master palette + per-asset colour budget, for AI and blockout frames alike
  for (const [k, im] of final) {
    const used = toMaster(im, budgetFor(k));
    const rep = report.get(k)!;
    (rep as FrameReport & { colours?: number }).colours = used;
    // lit windows / lantern cores: the client adds a night glow there (the eggs take part in the lighting)
    if (GLOWING.has(k)) rep.glows = detectWindows(im).map((p) => [Math.round(p.x), Math.round(p.y)] as [number, number]);
  }
  mkdirSync(OUT, { recursive: true });
  for (const [k, im] of final) writeFileSync(join(OUT, `${k}.png`), im.toPNG());
  const manifest = { generatedBy: 'packages/assets/eggs/scripts/build.ts', model: AI_MODEL, frames: Object.fromEntries([...report.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(OUT, 'review.png'), reviewSheet(drawEggSprites(), final).toPNG());
  build2x(final, procedural);
  for (const r of report.values()) console.log(`[eggs] ${r.frame.padEnd(18)} ${r.source.padEnd(10)} ${r.iou ?? ''} ${r.reason ?? ''}`);
}

/**
 * 2x density set (generated/eggs/2x/): every frame starts as the shipped 1x frame upscaled 2x
 * ('upscaled', a fallback that is never final art) and is replaced by a validated Astra redraw.
 */
function build2x(final1: Map<string, Img>, procedural: boolean) {
  const base = new Map<string, Img>();
  for (const [k, im] of final1) base.set(k, upscale(im, 2));
  const final = new Map(base);
  const report = new Map<string, FrameReport>();
  for (const [k, im] of base) report.set(k, { frame: k, w: im.w, h: im.h, source: 'procedural', reason: 'upscaled 1x (no 2x redraw yet)' });
  for (const job of EGG_JOBS_2X) {
    if (procedural || !job.enabled || !existsSync(rawPath(job))) continue;
    const raw = Img.fromPNG(readFileSync(rawPath(job)));
    const C = CANVAS[job.canvas];
    if (Math.abs(raw.w / raw.h - C.w / C.h) > 0.02) continue;
    const cells = layoutSheet(job, (f) => base.get(f)!);
    const palette = paletteOf(cells.map((c) => base.get(c.frame)!));
    const alpha = rawHasAlpha(raw);
    for (const c of cells) {
      const src = base.get(c.frame)!;
      const r = processFrame(job, raw, alpha, c, src, palette);
      const rep = report.get(c.frame)!;
      rep.job = job.id;
      rep.iou = +r.iou.toFixed(3);
      if (r.ok && r.img && r.img.w === src.w && r.img.h === src.h) {
        final.set(c.frame, r.img);
        rep.source = 'ai';
        delete rep.reason;
      } else rep.reason = `2x redraw rejected: ${r.reason ?? 'size mismatch'} (shipping upscaled 1x)`;
    }
  }
  for (const g of EGG_GROUPS)
    if (g.some((f) => report.get(f)!.source !== 'ai'))
      for (const f of g)
        if (report.get(f)!.source === 'ai') {
          final.set(f, base.get(f)!);
          report.get(f)!.source = 'procedural';
          report.get(f)!.reason = 'group consistency (shipping upscaled 1x)';
        }
  const dir = join(OUT, '2x');
  mkdirSync(dir, { recursive: true });
  for (const [k, im] of final) {
    (report.get(k) as FrameReport & { colours?: number }).colours = toMaster(im, budgetFor(k));
    writeFileSync(join(dir, `${k}.png`), im.toPNG());
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ density: 2, frames: Object.fromEntries([...report.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) }, null, 2) + '\n');
  writeFileSync(join(dir, 'review.png'), reviewSheet(base, final).toPNG());
  for (const r of report.values()) console.log(`[eggs 2x] ${r.frame.padEnd(18)} ${r.source.padEnd(10)} ${r.iou ?? ''} ${r.reason ?? ''}`);
}

/** blockout | final at 1x and 3x, on the town's grass colour. */
function reviewSheet(before: Map<string, Img>, after: Map<string, Img>): Img {
  const S = 3;
  const gap = 6;
  const rows = [...before.keys()];
  const W = Math.max(...rows.map((k) => before.get(k)!.w * (2 + 2 * S) + gap * 5));
  const H = rows.reduce((a, k) => a + before.get(k)!.h * S + gap, gap);
  const img = new Img(W, H);
  img.rect(0, 0, W, H, '#2f4a2c');
  let y = gap;
  for (const k of rows) {
    const b = before.get(k)!;
    const a = after.get(k)!;
    let x = gap;
    img.blit(b, x, y);
    x += b.w + gap;
    img.blit(a, x, y);
    x += b.w + gap;
    img.blit(upscale(b, S), x, y);
    x += b.w * S + gap;
    img.blit(upscale(a, S), x, y);
    y += b.h * S + gap;
  }
  return img;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'refs') refs(arg ?? 'all');
else if (cmd === 'ingest') ingest(arg!);
else if (cmd === 'build') build();
else {
  console.error('usage: build.ts refs [job|all] | ingest <job> | build [--procedural]');
  process.exit(2);
}
