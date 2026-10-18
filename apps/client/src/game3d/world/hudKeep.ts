// v3.1 release (QA C2 HIGH "vote framing does not fit the circle"): the voting-circle frame's keep-out boxes from the
// HUD that is ACTUALLY over the canvas, instead of the fixed corner sizes in voteFrame.ts VOTE_KEEP_CSS (which missed
// the Storyteller panel, the open chat, the voice card, the vote card and the "Your home" chip, so seats, the nominee and
// the Storyteller ended up under them).
//
// How: hit-test a coarse grid of cell centres over the canvas with document.elementFromPoint. A cell is covered when
// the topmost element there is neither the canvas nor one of its ancestors (the overlay root is pointer-events:none, so
// labels / bubbles never count) and is not a transient toast; plus the boxes of a few pointer-events:none HUD pieces
// that still cover the town (SOLID). Covered cells merge into rectangles (row runs, then equal
// runs stacked), returned in low-res px for voteFrame's `keep`. Called once on vote entry / resize (TownGame3d), so the
// ~1-2 k hit tests cost a few ms once, not per frame.
import type { Box } from './voteFrame';

/** CSS px per hit-test cell. */
export const HUD_CELL = 32;
/** Elements that never count as HUD (short-lived toasts, v2 and v3 HUD class names). */
const IGNORE = '.ct-toasts, .ct-toast, .cth-toasts, .cth-toast';
/** pointer-events:none HUD pieces that still hide what is under them (the home compass chip; NOT the gameplay hint
 *  pill: it is transient and sits over the circle's middle, dodging it zoomed the frame far out). */
const SOLID = '.ct-compass';

/** Merge a covered-cell grid (row-major, cols x rows) into rectangles [c0, r0, c1, r1) in cell units. */
export function mergeCells(covered: readonly boolean[], cols: number, rows: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  let open = new Map<string, [number, number, number, number]>();
  for (let r = 0; r < rows; r++) {
    const next = new Map<string, [number, number, number, number]>();
    let c = 0;
    while (c < cols) {
      if (!covered[r * cols + c]) {
        c++;
        continue;
      }
      const c0 = c;
      while (c < cols && covered[r * cols + c]) c++;
      const k = `${c0}:${c}`;
      const prev = open.get(k);
      if (prev) {
        prev[3] = r + 1;
        next.set(k, prev);
        open.delete(k);
      } else next.set(k, [c0, r, c, r + 1]);
    }
    for (const b of open.values()) out.push(b);
    open = next;
  }
  for (const b of open.values()) out.push(b);
  return out;
}

/**
 * The HUD over `canvas` as low-res px boxes (canvas drawn at `pixelScale` CSS px per texel), or null when it cannot be
 * measured (no DOM, a zero-size canvas): the caller then keeps voteFrame.ts keepOuts().
 */
export function hudKeepOuts(canvas: HTMLElement, pixelScale: number, cell = HUD_CELL): Box[] | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width >= 1 && rect.height >= 1)) return null;
  const s = pixelScale > 0 ? pixelScale : 1;
  const cols = Math.ceil(rect.width / cell);
  const rows = Math.ceil(rect.height / cell);
  const covered: boolean[] = new Array(cols * rows).fill(false);
  for (let r = 0; r < rows; r++) {
    const y = rect.top + Math.min(rect.height - 1, (r + 0.5) * cell);
    for (let c = 0; c < cols; c++) {
      const x = rect.left + Math.min(rect.width - 1, (c + 0.5) * cell);
      const el = document.elementFromPoint(x, y);
      if (!el || el === canvas || el.contains(canvas) || el.closest(IGNORE)) continue;
      covered[r * cols + c] = true;
    }
  }
  for (const el of Array.from(document.querySelectorAll?.(SOLID) ?? [])) {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) continue;
    const c0 = Math.max(0, Math.floor((b.left - rect.left) / cell));
    const c1 = Math.min(cols, Math.ceil((b.right - rect.left) / cell));
    const r0 = Math.max(0, Math.floor((b.top - rect.top) / cell));
    const r1 = Math.min(rows, Math.ceil((b.bottom - rect.top) / cell));
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) covered[r * cols + c] = true;
  }
  // a full-screen interactive layer (a modal, the notebook) would leave nothing to frame into: keep the defaults
  if (covered.filter(Boolean).length > covered.length * 0.6) return null;
  return mergeCells(covered, cols, rows).map(([c0, r0, c1, r1]) => ({
    x0: (c0 * cell) / s,
    y0: (r0 * cell) / s,
    x1: Math.min(rect.width, c1 * cell) / s,
    y1: Math.min(rect.height, r1 * cell) / s,
  }));
}

/** Cache key of a keep-out list (low-res px, rounded). */
export function keepKey(keep: readonly Box[] | null | undefined): string {
  if (!keep) return 'default';
  return keep.map((b) => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`).join(';');
}
