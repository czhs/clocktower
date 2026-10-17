// Cast sheet arrangement (shared by the generator and packages/assets/test).
import { CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW } from '../../src/cast.js';

const SW = CAST_FW * CAST_FRAMES.length;
const SH = CAST_FH * CAST_DIRS.length;

/**
 * (v2.4 perf P2) Ghost frames are the idle frame of each direction floated up by GHOST_HOVER px
 * (scripts/cast/index.ts ghostOf): every hover frame is the frame-0 cell shifted by 0..2 rows. The
 * ghost atlas (cast-ghosts.*) therefore stores ONE cell per direction, GHOST_CELL_H = 40 + 2 rows
 * tall (the 2 extra rows are always transparent), and frame f is the 32x40 window starting
 * GHOST_ROW_OFFSET[f] rows down in that cell — the same pixels as the old 5-frame block at a fifth
 * of the size. One ghost key = one column of 8 cells (32 x 336).
 */
export const GHOST_HOVER = [-2, -3, -4, -3, -2] as const;
export const GHOST_ROW_OFFSET = GHOST_HOVER.map((d) => GHOST_HOVER[0] - d);
export const GHOST_CELL_H = CAST_FH + Math.max(...GHOST_ROW_OFFSET);
const GW = CAST_FW;
const GH = GHOST_CELL_H * CAST_DIRS.length;

/** Columns for `blocks` blocks of w x h: the fewest empty blocks, then the squarest, within maxPx. */
function cols(blocks: number, w: number, h: number, maxPx: number, what: string): number {
  let best = 0;
  let bestScore = Infinity;
  for (let c = 1; c * w <= maxPx; c++) {
    const r = Math.ceil(blocks / c);
    if (r * h > maxPx) continue;
    const score = (c * r - blocks) * 1e6 + Math.abs(c * w - r * h);
    if (score < bestScore) (best = c), (bestScore = score);
  }
  if (!best) throw new Error(`${what}: ${blocks} blocks do not fit in ${maxPx}x${maxPx}`);
  return best;
}

/** Columns of the ghost atlas (one GW x GH block per ghost key). */
export function ghostCols(blocks: number, maxPx = 4096): number {
  return cols(blocks, GW, GH, maxPx, 'cast ghosts');
}

/**
 * Blocks per sheet row (v2.2 perf): the fewest empty blocks — every empty 160x320 block is 200 KiB of
 * GPU memory for nothing — then the squarest sheet, never more than 4096 px on a side. The client
 * reads every block position from cast.json, so the arrangement is free. (v2.4) Living sheets only
 * (33 blocks: 11 x 3 = 1760x960, 6.4 MiB; was 89 blocks incl. ghosts, 2400x1920, 17.6 MiB).
 */
export function sheetCols(blocks: number, maxPx = 4096): number {
  return cols(blocks, SW, SH, maxPx, 'cast');
}
