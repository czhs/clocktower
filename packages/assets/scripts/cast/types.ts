// Contract for one character's drawing module (scripts/cast/<id>.ts).
import type { Img } from '../lib/img.js';

/** The five directions a module draws; the assembler mirrors right->left, up-right->up-left, down-right->down-left. */
export const DRAWN_DIRS = ['down', 'down-right', 'right', 'up-right', 'up'] as const;
export type DrawnDir = (typeof DRAWN_DIRS)[number];
/** 0 = idle, 1..4 = walk1..walk4 (contact, passing, contact (other foot), passing). */
export type FrameIndex = 0 | 1 | 2 | 3 | 4;

export interface CharacterArt {
  id: string;
  /**
   * Draw one 32x40 frame. Feet (ground contact, centre) at (16,38). Transparent background,
   * binary alpha, 1 px dark outline like v1. Must be deterministic.
   */
  draw(dir: DrawnDir, frame: FrameIndex): Img;
  /** Set when an asymmetric detail must NOT be mirrored (then the module also handles the left-facing dirs itself). */
  drawMirrored?(dir: 'left' | 'up-left' | 'down-left', frame: FrameIndex): Img;
}
