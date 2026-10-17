// The portrait strip (v2.2 perf, WP1): generated/cast-portraits.{webp,png,json}. The DOM UI
// (character picker, waiting room, notebook, social palette, Storyteller script) only ever draws the
// 'down' row of a character, so it loads this small strip instead of the whole cast sheet:
//   - every playable character: the 5 'down' frames (idle + the walk cycle the picker plays in
//     place), side by side;
//   - the Storyteller, the NPCs and every ghost variant ('<id>/ghost', '<id>/ghost-spent'): the
//     'down' idle frame only.
// Cells are exact copies of the cast sheet's frames (same 32x40 cell, same pixels), so a portrait
// cropped from here is identical to one cropped from cast.png. Anything else (other directions,
// ghost hover frames) still comes from the full sheets (cast.*, cast-ghosts.*) — see
// apps/client/src/ui/common/castPortrait.ts.
import { CAST_DIRS, CAST_FH, CAST_FRAMES, CAST_FW, PLAYABLE_IDS } from '../../src/cast.js';
import { Img } from '../lib/img.js';

export interface PortraitManifest {
  image: string;
  frameWidth: number;
  frameHeight: number;
  /** The only direction in the strip. */
  dir: 'down';
  /** Sheet key -> top-left of its idle 'down' cell; `frames` cells follow left to right (idle, walk1…). */
  sheets: Record<string, { x: number; y: number; frames: number }>;
}

const WIDTH = 640;

/** cast.json as far as the strip needs it: living blocks + (v2.4) the compact ghost atlas. */
export interface CastManifestForPortraits {
  sheets: Record<string, { x: number; y: number }>;
  ghosts: { cellHeight: number; rowOffset: readonly number[]; sheets: Record<string, { x: number; y: number }> };
}

export function buildPortraits(cast: Img, ghosts: Img, manifest: CastManifestForPortraits): { img: Img; manifest: PortraitManifest } {
  const down = CAST_DIRS.indexOf('down');
  const keys = [...Object.keys(manifest.sheets), ...Object.keys(manifest.ghosts.sheets)];
  const walking = keys.filter((k) => PLAYABLE_IDS.has(k));
  const still = keys.filter((k) => !PLAYABLE_IDS.has(k));
  const perWalking = Math.floor(WIDTH / (CAST_FW * CAST_FRAMES.length));
  const perStill = Math.floor(WIDTH / CAST_FW);
  const walkingRows = Math.ceil(walking.length / perWalking);
  const img = new Img(WIDTH, (walkingRows + Math.ceil(still.length / perStill)) * CAST_FH);
  const sheets: PortraitManifest['sheets'] = {};
  const place = (key: string, x: number, y: number, frames: number) => {
    const s = manifest.sheets[key];
    if (s) img.copy(cast, x, y, s.x, s.y + down * CAST_FH, frames * CAST_FW, CAST_FH);
    else {
      // a ghost's idle 'down' frame (cast-ghosts: row offset 0 of its 'down' cell)
      const g = manifest.ghosts.sheets[key]!;
      img.copy(ghosts, x, y, g.x, g.y + down * manifest.ghosts.cellHeight + manifest.ghosts.rowOffset[0]!, CAST_FW, CAST_FH);
    }
    sheets[key] = { x, y, frames };
  };
  walking.forEach((k, i) => place(k, (i % perWalking) * CAST_FW * CAST_FRAMES.length, Math.floor(i / perWalking) * CAST_FH, CAST_FRAMES.length));
  still.forEach((k, i) => place(k, (i % perStill) * CAST_FW, (walkingRows + Math.floor(i / perStill)) * CAST_FH, 1));
  return { img, manifest: { image: 'cast-portraits.png', frameWidth: CAST_FW, frameHeight: CAST_FH, dir: 'down', sheets } };
}
