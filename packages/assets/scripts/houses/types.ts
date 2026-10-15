// Contract for a hand-designed house (scripts/houses/house-<i>.ts). See ./README in index.ts.
import type { BuildingDef } from '@ct/protocol';
import type { BuildingStyle } from '../../src/layout.js';
import type { BuildingSprite } from '../buildings.js';

/**
 * Draw one house. The sprite's bottom-left corner sits at the bottom-left of b.footprint; width =
 * footprint.w*16 (may overhang by at most 8 px on a side only if the brief allows), height =
 * footprint.h*16 + extra (extra ≤ the house's MAX_EXTRA). Must return a complete BuildingSprite:
 * windows (night glow points), door (rect + hinge, exactly where b.door says the player stands —
 * south: centred on tile b.door.x, bottom of the sprite; east/west: in the visible side wall next
 * to the door tile), leaf + doorway images (use cutDoor() from ../buildings.js), chimney (or null).
 */
export type HouseArt = (b: BuildingDef, style: BuildingStyle, seed: number, index: number) => BuildingSprite;
