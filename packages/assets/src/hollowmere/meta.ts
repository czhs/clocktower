// OWNED BY v3-world (WP5a). The exporter's review data and freshness hashes for the v3 world "Hollowmere"
// (scripts/v3/export-hollowmere.mjs writes hollowmere.meta.json next to hollowmere.generated.json; docs/v3/INTEGRATION.md
// §2.2). TESTS AND TOOLS ONLY: no runtime module imports this file (packages/assets/test/hollowmere.test.ts checks
// that), so the review data never reaches a client bundle or the server.
import type { TilePoint } from '@ct/protocol';
import data from './hollowmere.meta.json';

/** Shape of hollowmere.meta.json (keys sorted by the exporter). */
export interface HollowmereMeta {
  meta: {
    /** The canopy rule the export ran with (CANOPIES_BLOCK): true = canopy-hidden tiles are blocked like walls. */
    canopiesBlock: boolean;
    /** Interior wall quantisation error per house, metres (§2.3 table). */
    wallError: Record<string, { x: number; z: number }>;
    /** The vendor's ?occl=1 statistic per cottage: [nearest hidden ground line z (m), x range of it (m)]. */
    occl: Record<string, [number, number, number]>;
    /** Outdoor tiles blocked because the gameplay camera cannot see a character there (rule (b)). */
    hidden: { x: number; y: number; by: string }[];
    /** Hidden tiles left open because they are a door's only approach (door tiles included). */
    hiddenKept: { x: number; y: number; by: string }[];
    /**
     * Walkable tiles where a character is hidden only with a tree canopy / soft dressing in the way (house-11's oak
     * crown, the free-standing trees and the rim forest: `by` = 'house-<i>' or 'foliage:<kind>' / 'foliage:rim').
     * Empty when canopiesBlock. The 3D renderer must keep avatars there visible (§11).
     */
    hiddenSoft: { x: number; y: number; by: string }[];
    /** Walkable outdoor pockets the player spawn cannot reach (blocked). */
    pockets: TilePoint[];
    centreTiles: number;
    /** Door tiles the exporter opened (inside a vendor door corridor but blocked by border ground). */
    openedDoors: { id: string; x: number; y: number }[];
    /** Free interior floor tiles the interior door cannot reach (blocked). */
    interiorPockets: { id: string; x: number; y: number }[];
    /** Free tiles per room ('house-<i>', 'clocktower'). */
    interiorFreeTiles: Record<string, number>;
    /** 3D floor size per room (m); cottages also carry the wall thickness `t`. */
    rooms: Record<string, { w: number; d: number; t?: number }>;
    /** The clock tower room's walkable tiles ("x,y") -> floor height (m: 0 floor, stair steps, 1.1 landing). */
    towerHeights: Record<string, number>;
    /** Tower room tiles blocked by the height-cliff rule (a neighbour more than 0.5 m higher: the landing's edge). */
    towerCliffs: { x: number; y: number; h: number; up: number }[];
    /** Placed outline corners [x, z] (m) of every cottage (rotated houses: the true shape). */
    outlines: Record<string, [number, number][]>;
    /** Placed real door points (m). */
    doorPoints: Record<string, { x: number; z: number }>;
  };
  /** Every vendor module the exporter loaded (repo-relative). */
  vendorFiles: string[];
  /** sha256 over vendorFiles (path + content). */
  vendorHash: string;
  /** The exporter (repo-relative path). */
  generator: string;
  /** sha256 over the exporter's path + content and the three version it ran against. */
  generatorHash: string;
  /** apps/client's three version at export time. */
  three: string;
}

export const hollowmereMeta = data as unknown as HollowmereMeta;
