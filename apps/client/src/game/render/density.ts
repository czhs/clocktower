// Art density (docs/art-direction.md "Visual overhaul": 2x contract). World coordinates, collision,
// doors and the server stay on the 16 px grid; art may be authored at `density` texels per world
// px and is drawn at scale 1/density with nearest sampling. Every manifest defaults to 1.
import type * as Phaser from 'phaser';
import objectsAtlas from '@ct/assets/generated/objects.json';
import { CHAR } from '../sprites';

const d = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

/** objects.json: frame rects are in texels. */
export const OBJ_DENSITY = d((objectsAtlas as unknown as { density?: number }).density);
/** characters.json: frameWidth/Height and anchor are in texels. */
export const CHAR_DENSITY = d((CHAR as unknown as { density?: number }).density);
/** Character frame geometry in WORLD px. */
export const CHAR_WORLD = {
  w: CHAR.frameWidth / CHAR_DENSITY,
  h: CHAR.frameHeight / CHAR_DENSITY,
  anchorY: CHAR.anchor.y / CHAR_DENSITY,
};

/** Tiled custom property (array form or object form). */
export function tiledProp(props: unknown, name: string): unknown {
  if (Array.isArray(props)) return (props as { name: string; value: unknown }[]).find((x) => x.name === name)?.value;
  if (props && typeof props === 'object') return (props as Record<string, unknown>)[name];
  return undefined;
}

/** town.json: map property `density`, else tile size / world tile size. Object coords are texels. */
export function mapDensity(map: Phaser.Tilemaps.Tilemap, worldTile: number): number {
  const p = tiledProp(map.properties, 'density');
  if (p !== undefined) return d(p);
  return d(Math.round(map.tileWidth / worldTile));
}
