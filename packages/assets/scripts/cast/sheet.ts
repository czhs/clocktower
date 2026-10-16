// Cast sheet arrangement (shared by the generator and packages/assets/test).
import { CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW } from '../../src/cast.js';

const SW = CAST_FW * CAST_FRAMES.length;
const SH = CAST_FH * CAST_DIRS.length;

/**
 * Blocks per sheet row (v2.2 perf): the fewest empty blocks — every empty 160x320 block is 200 KiB of
 * GPU memory for nothing — then the squarest sheet, never more than 4096 px on a side. 83 blocks:
 * 12 x 7 (1920x2240, 16.4 MiB) instead of 8 x 11 (1280x3520, 17.2 MiB). The client reads every
 * block position from cast.json, so the arrangement is free.
 */
export function sheetCols(blocks: number, maxPx = 4096): number {
  let best = 0;
  let bestScore = Infinity;
  for (let c = 1; c * SW <= maxPx; c++) {
    const r = Math.ceil(blocks / c);
    if (r * SH > maxPx) continue;
    const score = (c * r - blocks) * 1e6 + Math.abs(c * SW - r * SH);
    if (score < bestScore) (best = c), (bestScore = score);
  }
  if (!best) throw new Error(`cast: ${blocks} sheet blocks do not fit in ${maxPx}x${maxPx}`);
  return best;
}
