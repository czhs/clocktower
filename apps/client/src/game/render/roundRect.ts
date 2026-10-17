// v2.4 perf (P1): rounded rectangles / discs for Phaser Graphics WITHOUT paths.
//
// Phaser 3.90 re-tessellates every Graphics path on EVERY rendered frame: an `arc` is always 100
// points (iterStep 0.01) and `fillPath` runs earcut over the result. So `fillRoundedRect` (4 arcs ≈ 400
// points) or `fillCircle` (100 points) on a label that never changes still costs an earcut per frame;
// 15 house-name backdrops were ≈ 8 % of the desktop main thread and ≈ 30 % on the 4x-throttled phone
// profile (v2.4 CPU profile: earcutLinked + isEarHashed + batchFillPath on top).
//
// `roundRectRows` slices the same shape into non-overlapping horizontal bands (so a translucent fill
// blends exactly once): `n` stepped bands at the top and bottom corners (one band per `step` px —
// pass ≈ 1 screen pixel in world units) and one tall middle band. `fillRect` batches as a plain quad.

export type Band = readonly [x: number, y: number, w: number, h: number];

/** Max corner bands per side (keeps the quad count bounded at extreme zooms). */
export const MAX_CORNER_BANDS = 12;

/**
 * Non-overlapping horizontal bands covering a rounded rect (x, y, w, h, corner radius r). `step` is
 * the band height in the same units (≈ one screen pixel); r is clamped to min(w, h) / 2.
 */
export function roundRectRows(x: number, y: number, w: number, h: number, r: number, step: number): Band[] {
  if (!(w > 0) || !(h > 0)) return [];
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rad === 0) return [[x, y, w, h]];
  const st = Math.max(step > 0 && Number.isFinite(step) ? step : 1, rad / MAX_CORNER_BANDS);
  const n = Math.min(Math.ceil(rad / st), Math.floor(h / 2 / st));
  const out: Band[] = [];
  const bottom: Band[] = [];
  for (let i = 0; i < n; i++) {
    // inset of the corner arc at the middle of this band
    const dy = rad - (i + 0.5) * st;
    const inset = dy > 0 ? rad - Math.sqrt(rad * rad - dy * dy) : 0;
    const bw = w - 2 * inset;
    if (bw <= 0) continue;
    out.push([x + inset, y + i * st, bw, st]);
    bottom.push([x + inset, y + h - (i + 1) * st, bw, st]);
  }
  const midH = h - 2 * n * st;
  if (midH > 0) out.push([x, y + n * st, w, midH]);
  for (let i = bottom.length - 1; i >= 0; i--) out.push(bottom[i]!);
  return out;
}

/** Minimal Graphics surface used by the fills below (Phaser.GameObjects.Graphics satisfies it). */
export interface RectFiller {
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/** `g.fillRoundedRect` look-alike made of plain rects (no per-frame earcut). Uses the current fillStyle. */
export function fillRoundRectBands(g: RectFiller, x: number, y: number, w: number, h: number, r: number, step: number): void {
  for (const b of roundRectRows(x, y, w, h, r, step)) g.fillRect(b[0], b[1], b[2], b[3]);
}

/** `g.fillCircle` look-alike made of plain rects. Uses the current fillStyle. */
export function fillDiscBands(g: RectFiller, cx: number, cy: number, radius: number, step: number): void {
  fillRoundRectBands(g, cx - radius, cy - radius, radius * 2, radius * 2, radius, step);
}
