// Cast portraits (v2 roster): draws one frame of a character's sheet from the generated
// packages/assets/generated/cast.png (+ cast.json) onto a canvas, pixel-crisp. Shared by the
// character picker, the waiting room and anything else outside the Phaser scene that shows "who".
// (v2.2 perf) 'down' frames come from the small portrait strip (cast-portraits.*: every 'down' frame
// of the playable cast + the idle 'down' frame of everyone else and every ghost, the same pixels), so
// the DOM UI never downloads the full game sheet; any other frame still loads cast.* on demand.
//
//   <CastPortrait id="frog" size={48} />               square box, sprite fitted (integer scale)
//   <CastPortrait id="frog" size={120} crop="frame" animate />   whole 32x40 frame, walking in place
//   <CastPortrait id="frog" size={24} crop="bust" ghost />       head-and-shoulders ghost avatar
//   await drawCastPortrait(canvas, 'frog', { size: 48 })          same, onto your own canvas
//
// Until the sheet has loaded (or for an id the sheet does not have yet) a small silhouette in the
// character's own colour is drawn instead, so layouts never jump and nothing is ever blank.
// The manifest is looked up with import.meta.glob; the image URLs (WebP or PNG) come from @ct/assets/runtime.
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { atlasFormat, castHdUrl, castUrl, portraitsUrl } from '@ct/assets/runtime';
import portraitStrip from '@ct/assets/generated/cast-portraits.json';
// CONTRACT-REQUEST(lobby-ui -> lead/world-art): export the cast roster from '@ct/assets' (src/index.ts)
// so clients can `import { CAST, PLAYABLE, castById } from '@ct/assets'`; until then the source is
// imported directly (it has no imports of its own).
import { CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW, CAST_HD_SCALE, castById, type CastDir } from '../../../../../packages/assets/src/cast';
import { reducedMotion } from '../../game/fx/motion';

export interface CastManifest {
  image: string;
  frameWidth: number;
  frameHeight: number;
  directions: readonly string[];
  frames: readonly string[];
  /** Sheet key (`<id>`, `<id>/ghost`, `<id>/ghost-spent`) -> top-left of its 5x8 frame block. */
  sheets: Record<string, { x: number; y: number }>;
  /** Ids still drawn as generator placeholders. */
  placeholders?: string[];
}

/** cast-portraits.json: sheet key -> its idle 'down' cell in the strip; `frames` cells follow. */
interface PortraitStrip {
  dir: string;
  sheets: Record<string, { x: number; y: number; frames: number }>;
}

const MANIFESTS = import.meta.glob('../../../../../packages/assets/generated/cast.json', { eager: true, import: 'default' }) as Record<string, CastManifest>;
const MANIFEST: CastManifest | null = Object.values(MANIFESTS)[0] ?? null;
const STRIP = portraitStrip as PortraitStrip;
const STRIP_ROW = CAST_DIRS.indexOf(STRIP.dir as CastDir);

// Photo-real members (CastMember.hd) also have high-res animation rows in cast-hd.* (WebP or PNG via
// @ct/assets/runtime, like every atlas); they are drawn from it smoothed (not pixel-crisp), cropped
// with the same frame-local boxes x CAST_HD_SCALE. Only loaded when such a portrait is drawn.
const HD_MANIFEST = (Object.values(import.meta.glob('../../../../../packages/assets/generated/cast-hd.json', { eager: true, import: 'default' }))[0] ?? null) as {
  rows: Record<string, number>;
} | null;
let hdSheet: HTMLImageElement | null = null;
let hdPromise: Promise<HTMLImageElement | null> | null = null;
function loadHdSheet(): Promise<HTMLImageElement | null> {
  if (hdPromise) return hdPromise;
  if (!HD_MANIFEST || typeof Image === 'undefined') return (hdPromise = Promise.resolve(null));
  return (hdPromise = loadImage(() => castHdUrl).then((img) => (hdSheet = img)));
}
const isHd = (key: string): boolean => HD_MANIFEST?.rows[key] !== undefined;

/** The cast manifest, or null when this build has no generated cast art. */
export const castManifest = (): CastManifest | null => MANIFEST;

let sheet: HTMLImageElement | null = null;
let sheetPromise: Promise<HTMLImageElement | null> | null = null;
let strip: HTMLImageElement | null = null;
let stripPromise: Promise<HTMLImageElement | null> | null = null;

/** Decode one image (WebP or PNG, whichever @ct/assets/runtime settled on); null on failure. */
function loadImage(url: () => string): Promise<HTMLImageElement | null> {
  return atlasFormat.then(
    () =>
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url();
      }),
  );
}

/** Load the full cast sheet once (resolves null when there is no sheet or it fails to load). */
export function loadCastSheet(): Promise<HTMLImageElement | null> {
  if (sheetPromise) return sheetPromise;
  if (!MANIFEST || typeof Image === 'undefined') return (sheetPromise = Promise.resolve(null));
  return (sheetPromise = loadImage(() => castUrl).then((img) => (sheet = img)));
}
/** Load the portrait strip once (resolves null when it fails to load). */
function loadPortraitStrip(): Promise<HTMLImageElement | null> {
  if (stripPromise) return stripPromise;
  if (!MANIFEST || typeof Image === 'undefined') return (stripPromise = Promise.resolve(null));
  return (stripPromise = loadImage(() => portraitsUrl).then((img) => (strip = img)));
}
/** True once the full cast sheet is decoded. */
export const castSheetReady = (): boolean => sheet !== null;

export type CastCrop = 'frame' | 'fit' | 'bust';
export interface CastPortraitOpts {
  /** true = ghost with their vote (halo), 'spent' = ghost whose vote is used. */
  ghost?: boolean | 'spent';
  dir?: CastDir;
  /** 0 = idle, 1..4 = walk frames. */
  frame?: number;
  /**
   * 'frame' = the whole 32x40 frame (true relative size between characters), 'fit' = trimmed to
   * the sprite, 'bust' = a square around the head and shoulders (small avatars). Default 'fit'.
   */
  crop?: CastCrop;
  /**
   * CSS px of the square box to draw into: the canvas backing store becomes size x devicePixelRatio
   * and the art is scaled by the largest whole number that fits (half steps between 2x and 3x,
   * the exact fit below 2x). Omit to get the crop at its native 1x size (scale it yourself with
   * `image-rendering: pixelated`).
   */
  size?: number;
  /** Override devicePixelRatio (tests, offscreen use). */
  dpr?: number;
}

export const castSheetKey = (id: string, ghost?: boolean | 'spent'): string => (ghost ? `${id}/${ghost === 'spent' ? 'ghost-spent' : 'ghost'}` : id);

type Box = { x: number; y: number; w: number; h: number };
const bboxCache = new Map<string, Box>();

/** Opaque-pixel bounds of one frame (frame-local coords). */
function frameBounds(img: HTMLImageElement, sx: number, sy: number, cacheKey: string): Box {
  const hit = bboxCache.get(cacheKey);
  if (hit) return hit;
  let box: Box = { x: 0, y: 0, w: CAST_FW, h: CAST_FH };
  try {
    const c = document.createElement('canvas');
    c.width = CAST_FW;
    c.height = CAST_FH;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(img, sx, sy, CAST_FW, CAST_FH, 0, 0, CAST_FW, CAST_FH);
      const d = g.getImageData(0, 0, CAST_FW, CAST_FH).data;
      let x0 = CAST_FW, y0 = CAST_FH, x1 = -1, y1 = -1;
      for (let y = 0; y < CAST_FH; y++)
        for (let x = 0; x < CAST_FW; x++)
          if (d[(y * CAST_FW + x) * 4 + 3]! > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      if (x1 >= 0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
  } catch {
    /* tainted / no 2d context: use the full frame */
  }
  bboxCache.set(cacheKey, box);
  return box;
}

/** Source rectangle (frame-local) for a crop of a sprite whose opaque bounds are `b`. */
function cropRect(b: Box, crop: CastCrop, hd = false): Box {
  if (crop === 'frame') return { x: 0, y: 0, w: CAST_FW, h: CAST_FH };
  if (crop === 'fit') return { ...b };
  // Human proportions have a much smaller head than the chibi cast. Keep face badges
  // on the head/shoulders, centered on the HD sheet's aligned head, not the swinging arms.
  if (hd) {
    const side = Math.max(8, Math.round(b.h * 0.28));
    return pad({ x: (CAST_FW - side) / 2, y: b.y, w: side, h: side }, 1);
  }
  // bust: a square from the top of the sprite, as wide as it is (heads are the widest part of
  // most of the cast), at most ~60% of its height so tall characters still show a face.
  const side = Math.max(10, Math.min(b.w, Math.round(b.h * 0.62)));
  return pad({ x: Math.round(b.x + b.w / 2 - side / 2), y: b.y, w: side, h: side }, 1);
}
function pad(b: Box, p: number): Box {
  return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p };
}

function hueOf(id: string): number {
  let hsh = 0;
  for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  return hsh % 360;
}

/** The drawing scale for a crop that would exactly fit at `fit` (see `layout`). */
export const castScale = (fit: number): number => (fit >= 3 ? Math.floor(fit) : fit >= 2 ? Math.floor(fit * 2) / 2 : fit);

/** Size the canvas for `opts` and return the target rect for a `cw` x `ch` source. */
function layout(canvas: HTMLCanvasElement, cw: number, ch: number, opts: CastPortraitOpts, exact = false): { k: number; dx: number; dy: number } {
  if (!opts.size) {
    canvas.width = cw;
    canvas.height = ch;
    return { k: 1, dx: 0, dy: 0 };
  }
  const dpr = Math.min(3, Math.max(1, opts.dpr ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)));
  const S = Math.max(1, Math.round(opts.size * dpr));
  if (canvas.width !== S) canvas.width = S;
  if (canvas.height !== S) canvas.height = S;
  // Whole-number scales from 3x up; 2x-3x in half steps (2.5x doubles every other pixel, an even
  // pattern that still reads as pixel art); below 2x the exact fit, so small boxes on 1x screens
  // aren't stuck at 1x and neighbouring portraits come out the same size.
  const k = exact ? Math.min(S / cw, S / ch) : castScale(Math.min(S / cw, S / ch));
  const dx = Math.round((S - cw * k) / 2);
  // Standing sprites sit on the bottom edge; busts are centred.
  const dy = opts.crop === 'bust' ? Math.round((S - ch * k) / 2) : Math.round(S - ch * k);
  return { k, dx, dy };
}

/** The loading / missing-art stand-in: a little two-blob silhouette in the character's colour. */
function drawFallback(canvas: HTMLCanvasElement, id: string, opts: CastPortraitOpts) {
  const crop = opts.crop ?? 'fit';
  const src: Box = crop === 'frame' ? { x: 0, y: 0, w: CAST_FW, h: CAST_FH } : crop === 'bust' ? { x: 8, y: 9, w: 16, h: 16 } : { x: 7, y: 9, w: 18, h: 31 };
  const { k, dx, dy } = layout(canvas, src.w, src.h, opts);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const hue = hueOf(id);
  const ghost = !!opts.ghost;
  g.save();
  g.translate(dx - src.x * k, dy - src.y * k);
  g.scale(k, k);
  g.globalAlpha = ghost ? 0.55 : 0.85;
  g.fillStyle = ghost ? '#b9dbe6' : `hsl(${hue} 32% 42%)`;
  g.beginPath();
  g.ellipse(16, 30, 7, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(16, 17, 6, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Which frame `opts` asks for: sheet key (a missing ghost variant falls back to the living sheet), row, frame. */
interface FrameReq {
  key: string;
  r: number;
  f: number;
}
function frameReq(id: string, opts: CastPortraitOpts): FrameReq | null {
  const k = castSheetKey(id, opts.ghost);
  const key = MANIFEST?.sheets[k] ? k : MANIFEST?.sheets[id] ? id : null;
  if (!key) return null;
  const r = Math.max(0, CAST_DIRS.indexOf(opts.dir ?? 'down'));
  const f = Math.min(CAST_FRAMES.length - 1, Math.max(0, Math.round(opts.frame ?? 0)));
  return { key, r, f };
}
const inStrip = (q: FrameReq): boolean => q.r === STRIP_ROW && q.f < (STRIP.sheets[q.key]?.frames ?? 0);

/**
 * The decoded image holding the frame, its top-left (sx, sy) and the top-left of the same row's
 * idle frame (ix, iy) — or null while neither the strip (when it has the frame) nor the sheet is ready.
 */
function source(q: FrameReq): { img: HTMLImageElement; sx: number; sy: number; ix: number; iy: number } | null {
  const p = STRIP.sheets[q.key];
  if (strip && p && inStrip(q)) return { img: strip, sx: p.x + q.f * CAST_FW, sy: p.y, ix: p.x, iy: p.y };
  const o = MANIFEST?.sheets[q.key];
  if (sheet && o) return { img: sheet, sx: o.x + q.f * CAST_FW, sy: o.y + q.r * CAST_FH, ix: o.x, iy: o.y + q.r * CAST_FH };
  return null;
}
/** Load whatever `q` needs: the strip if it has the frame (the full sheet if the strip fails), else the sheet. */
async function loadFor(q: FrameReq): Promise<void> {
  if (inStrip(q) && (await loadPortraitStrip())) return;
  await loadCastSheet();
}

/**
 * Draw a character onto `canvas` (sizing its backing store, see `CastPortraitOpts.size`).
 * Draws the fallback silhouette straight away if the art is not decoded yet, then the real
 * frame once it is. Resolves true when real art was drawn, false for the fallback.
 */
export async function drawCastPortrait(canvas: HTMLCanvasElement, id: string, opts: CastPortraitOpts = {}): Promise<boolean> {
  const q = frameReq(id, opts);
  const placeholder = !q || !source(q);
  if (placeholder) drawFallback(canvas, id, opts);
  if (!q) return false;
  if (placeholder) await loadFor(q);
  if (!source(q) && placeholder) return false;
  if (isHd(q.key) || isHd(id)) await loadHdSheet();
  return paint(canvas, id, opts);
}

function paint(canvas: HTMLCanvasElement, id: string, opts: CastPortraitOpts): boolean {
  const q = frameReq(id, opts);
  const src0 = q && source(q);
  if (!q || !src0) {
    drawFallback(canvas, id, opts);
    return false;
  }
  const { img, sx, sy } = src0;
  const crop = opts.crop ?? 'fit';
  const { key, r, f } = q;
  // Crop from the idle frame's bounds so walk frames don't make the box breathe; photo-real members
  // swing their arms/feet much wider, so they use a fixed union of all their poses instead.
  const n = isHd(key) && !opts.ghost && (img === sheet || inStrip({ key, r, f: CAST_FRAMES.length - 1 })) ? CAST_FRAMES.length : 1;
  let bounds = frameBounds(img, src0.ix, src0.iy, `${key}|${r}`);
  for (let i = 1; i < n; i++) {
    const b = frameBounds(img, src0.ix + i * CAST_FW, src0.iy, `${key}|${r}|${i}`);
    const x0 = Math.min(bounds.x, b.x);
    const y0 = Math.min(bounds.y, b.y);
    bounds = { x: x0, y: y0, w: Math.max(bounds.x + bounds.w, b.x + b.w) - x0, h: Math.max(bounds.y + bounds.h, b.y + b.h) - y0 };
  }
  const src = cropRect(bounds, crop, isHd(key));
  const hdKey = isHd(key) ? key : isHd(id) ? id : null;
  const hd = hdKey !== null && hdSheet ? hdSheet : null;
  const { k, dx, dy } = layout(canvas, src.w, src.h, { ...opts, crop }, !!hd);
  const g = canvas.getContext('2d');
  if (!g) return false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = !!hd;
  if (hd) g.imageSmoothingQuality = 'high';
  // Clip the source to the frame cell so neighbouring frames never bleed into a padded crop.
  const cx0 = Math.max(0, src.x);
  const cy0 = Math.max(0, src.y);
  const cx1 = Math.min(CAST_FW, src.x + src.w);
  const cy1 = Math.min(CAST_FH, src.y + src.h);
  if (cx1 <= cx0 || cy1 <= cy0) return true;
  if (hd) {
    const K = CAST_HD_SCALE;
    const hx = r * CAST_FW * K;
    const hy = (HD_MANIFEST!.rows[hdKey!]! + (hdKey!.includes('/ghost') ? 0 : f)) * CAST_FH * K;
    g.drawImage(hd, hx + cx0 * K, hy + cy0 * K, (cx1 - cx0) * K, (cy1 - cy0) * K, dx + (cx0 - src.x) * k, dy + (cy0 - src.y) * k, (cx1 - cx0) * k, (cy1 - cy0) * k);
    return true;
  }
  g.drawImage(img, sx + cx0, sy + cy0, cx1 - cx0, cy1 - cy0, dx + (cx0 - src.x) * k, dy + (cy0 - src.y) * k, (cx1 - cx0) * k, (cy1 - cy0) * k);
  return true;
}

/** The roster name for an id (falls back to the id itself). */
export const castName = (id: string | null | undefined): string => castById(id)?.name ?? id ?? '';

const WALK = [1, 2, 3, 4];

/**
 * A character portrait. `size` is the CSS px of the square box. Decorative by default
 * (aria-hidden); pass `label` to expose it as an image.
 */
export function CastPortrait({
  id,
  size = 48,
  ghost,
  crop = 'fit',
  dir = 'down',
  animate = false,
  label,
  class: cls,
}: {
  id: string;
  size?: number;
  ghost?: boolean | 'spent';
  crop?: CastCrop;
  dir?: CastDir;
  /** Walk in place (off under reduced motion). */
  animate?: boolean;
  label?: string;
  class?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [real, setReal] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let live = true;
    void drawCastPortrait(c, id, { ghost, crop, dir, size }).then((ok) => live && setReal(ok));
    if (!animate) return () => void (live = false);
    let i = 0;
    const t = setInterval(() => {
      if (!ref.current) return;
      const still = reducedMotion();
      const next = (i + 1) % WALK.length;
      const opts = { ghost, crop, dir, size, frame: still ? 0 : WALK[next] };
      const q = frameReq(id, opts);
      if (!q) return;
      if (!source(q)) return void loadFor(q); // not decoded yet (e.g. a frame only the full sheet has)
      i = next;
      paint(ref.current, id, opts);
    }, 140);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id, size, ghost, crop, dir, animate]);
  return h('canvas', {
    ref,
    class: `ct-cast-portrait${real ? '' : ' is-fallback'}${cls ? ` ${cls}` : ''}`,
    style: { width: `${size}px`, height: `${size}px`, imageRendering: isHd(id) ? 'auto' : 'pixelated', display: 'block', flex: 'none' },
    'data-cast': id,
    ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }),
  });
}
