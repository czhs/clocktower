// In-world social layer (emotes + pins). STUB — implemented by the social-client agent.
// Contract with TownScene (lead-owned): created once in create(); update(dt) every frame after
// remote interpolation; onTap(x, y) is asked FIRST on every primary tap/click on the town and returns
// true when it consumed the tap (pointing / dropping / removing a pin); destroy() on shutdown.
import type * as Phaser from 'phaser';
import type { Facing, LocationId } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';

export interface SocialCtx {
  conn: RoomConnection;
  myPid(): string | null;
  me(): { x: number; y: number; location: LocationId; facing: Facing };
  amStoryteller(): boolean;
  /** Feet position of a pid the viewer can currently SEE (rendered avatar, incl. yourself), else null. */
  positionOf(pid: string): { x: number; y: number } | null;
  /** The visible character under a world point (generous hit box), else null. */
  entityAt(x: number, y: number): string | null;
  /** Cast id used to draw this pid ('storyteller' for the Storyteller). */
  characterOf(pid: string): string;
  /** Make the local avatar face a world point (pointing). */
  faceToward(x: number, y: number): void;
}

export interface SocialLayer {
  update(dt: number): void;
  onTap(x: number, y: number): boolean;
  destroy(): void;
}

export function createSocialLayer(_scene: Phaser.Scene, _ctx: SocialCtx): SocialLayer {
  return { update() {}, onTap: () => false, destroy() {} };
}
