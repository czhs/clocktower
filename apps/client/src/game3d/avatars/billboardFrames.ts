// v3 WP2 (v3-avatars). Frame selection for the flat v2-sprite billboards (brianbi, nicksong; docs/v3/INTEGRATION.md
// §4 "Billboards"). Pure (avatars.billboard.test.ts): which sheet, which cell, which frame name.
//
// Sheets (packages/assets/generated):
//   cast.json     every cast key, 8 directions (rows) x 5 frames (idle, walk1..4), 32 x 40 cells, anchor (16, 38)
//   cast-hd.json  photo-real members (brianbi): 8 directions (columns) x 5 frames (rows), 160 x 200 cells (5x),
//                 plus 1-frame ghost rows 'brianbi/ghost' and 'brianbi/ghost-spent'
//   cast.json `ghosts` -> cast-ghosts.png: '<id>/ghost' / '<id>/ghost-spent', one cell per direction (cellHeight
//                 rows apart), frame f = the cell shifted down rowOffset[f] px (a hover bob; idle cycle
//                 0,1,2,3,4,3,2,1 at 5 fps, as TownScene defineGhostCast)
// Frame names keep the v2 format `<key>|<dir8>|<n>` (hd-cast.spec.ts reads __ctCamera.avatar().frame).
import type { Dir8 } from '../../game/rules/input';

export interface CastSheetManifest {
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number };
  directions: readonly string[];
  frames: readonly string[];
  walkFps: number;
  sheets: Record<string, { x: number; y: number }>;
  ghosts?: { cellHeight: number; rowOffset: readonly number[]; sheets: Record<string, { x: number; y: number }> };
}
export interface CastHdManifest {
  scale: number;
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number };
  directions: readonly string[];
  frames: readonly string[];
  walkFps: number;
  rows: Record<string, number>;
}

/** Billboard height (m) for the full v2 cell (40 px), anchored at the feet. */
export const BILLBOARD_HEIGHT_M = 1.3;
/** v2 walk frame rate multiplier (TownScene defineCast: walkFps · 1.25 on cast.png). */
export const CAST_WALK_FPS_K = 1.25;

export type SheetKind = 'cast' | 'cast-hd' | 'cast-ghosts';
/** Ghost bob cycle on cast-ghosts (TownScene: frames 0,1,2,3,4,3,2,1 at 5 fps). */
export const GHOST_BOB = [0, 1, 2, 3, 4, 3, 2, 1] as const;
export const GHOST_BOB_FPS = 5;

export interface FrameCell {
  sheet: SheetKind;
  /** Cell rect in sheet pixels (y down). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** `<key>|<dir8>|<n>`. */
  name: string;
}

export interface BillboardArt {
  sheet: SheetKind;
  /** Living sheet key (the cast id). */
  key: string;
  /** Sheet of the ghost keys ('cast-hd' rows, or cast-ghosts.png for cast.png members). */
  ghostSheet: SheetKind | null;
  /** Ghost sheet keys, when the art has them. */
  ghostKey: string | null;
  spentKey: string | null;
  cellW: number;
  cellH: number;
  anchor: { x: number; y: number };
  walkFps: number;
  frameCount: number;
}

/** Pick the art for a cast id: the HD sheet when it has a row for it, else cast.png; null when neither has it. */
export function billboardArt(id: string, cast: CastSheetManifest, hd: CastHdManifest | null): BillboardArt | null {
  if (hd && hd.rows[id] !== undefined) {
    return {
      sheet: 'cast-hd',
      key: id,
      ghostSheet: hd.rows[`${id}/ghost`] !== undefined ? 'cast-hd' : null,
      ghostKey: hd.rows[`${id}/ghost`] !== undefined ? `${id}/ghost` : null,
      spentKey: hd.rows[`${id}/ghost-spent`] !== undefined ? `${id}/ghost-spent` : null,
      cellW: hd.frameWidth,
      cellH: hd.frameHeight,
      anchor: hd.anchor,
      walkFps: hd.walkFps,
      frameCount: hd.frames.length,
    };
  }
  if (cast.sheets[id]) {
    return {
      sheet: 'cast',
      key: id,
      ghostSheet: cast.ghosts?.sheets[`${id}/ghost`] ? 'cast-ghosts' : null,
      ghostKey: cast.ghosts?.sheets[`${id}/ghost`] ? `${id}/ghost` : null,
      spentKey: cast.ghosts?.sheets[`${id}/ghost-spent`] ? `${id}/ghost-spent` : null,
      cellW: cast.frameWidth,
      cellH: cast.frameHeight,
      anchor: cast.anchor,
      walkFps: cast.walkFps * CAST_WALK_FPS_K,
      frameCount: cast.frames.length,
    };
  }
  return null;
}

/** The ghost frame on cast-ghosts.png: the hover bob (held at 0 under reduced motion). */
export function ghostFrameIndex(tS: number, still: boolean): number {
  return still ? 0 : GHOST_BOB[Math.floor(tS * GHOST_BOB_FPS) % GHOST_BOB.length]!;
}

/** The frame number shown: 0 idle; walking 1..4 at the sheet's walk rate; reduced motion holds 0. */
export function frameIndex(moving: boolean, tS: number, art: Pick<BillboardArt, 'walkFps' | 'frameCount'>, still: boolean): number {
  if (!moving || still || art.frameCount < 2) return 0;
  const walk = art.frameCount - 1;
  return 1 + (Math.floor(tS * art.walkFps) % walk);
}

/** The sheet cell of `<key>|<dir>|<n>`. */
export function frameCell(sheet: SheetKind, key: string, dir: Dir8, n: number, cast: CastSheetManifest, hd: CastHdManifest | null): FrameCell | null {
  if (sheet === 'cast-ghosts') {
    const g = cast.ghosts;
    const pos = g?.sheets[key];
    const r = cast.directions.indexOf(dir);
    if (!g || !pos || r < 0) return null;
    const f = Math.max(0, Math.min(n, g.rowOffset.length - 1));
    return { sheet, x: pos.x, y: pos.y + r * g.cellHeight + g.rowOffset[f]!, w: cast.frameWidth, h: cast.frameHeight, name: `${key}|${dir}|${f}` };
  }
  if (sheet === 'cast-hd') {
    if (!hd) return null;
    const row = hd.rows[key];
    const col = hd.directions.indexOf(dir);
    if (row === undefined || col < 0) return null;
    const ghost = key.includes('/ghost');
    const f = ghost ? 0 : Math.min(n, hd.frames.length - 1);
    return { sheet: 'cast-hd', x: col * hd.frameWidth, y: (row + f) * hd.frameHeight, w: hd.frameWidth, h: hd.frameHeight, name: `${key}|${dir}|${f}` };
  }
  const pos = cast.sheets[key];
  const r = cast.directions.indexOf(dir);
  if (!pos || r < 0) return null;
  const f = Math.min(n, cast.frames.length - 1);
  return { sheet: 'cast', x: pos.x + f * cast.frameWidth, y: pos.y + r * cast.frameHeight, w: cast.frameWidth, h: cast.frameHeight, name: `${key}|${dir}|${f}` };
}

/** UVs (three, flipY textures: v up) of a cell, inset by `inset` sheet px against bleeding at linear filtering. */
export function cellUv(c: Pick<FrameCell, 'x' | 'y' | 'w' | 'h'>, sheetW: number, sheetH: number, inset = 0): { u0: number; v0: number; u1: number; v1: number } {
  return {
    u0: (c.x + inset) / sheetW,
    u1: (c.x + c.w - inset) / sheetW,
    v0: 1 - (c.y + c.h - inset) / sheetH,
    v1: 1 - (c.y + inset) / sheetH,
  };
}
