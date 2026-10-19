/// <reference lib="dom" />
// (v3 WP5b, v3-world acting for world-art) URLs of the Classic 2D art for the v3 world "Hollowmere"
// (docs/v3/INTEGRATION.md §2.5; written by scripts/v3/classic.ts). Browser/Vite only. Kept out of ./runtime so the
// main bundle does not grow: only the lazy Classic town chunk (TownScene) imports this module, and a v3 lobby is the
// only place that fetches the files.
//
//   townV3JsonUrl          Tiled map (112 x 43) — ground / decor / collision layers + objects + map properties
//   terrainV3Url           its ground tileset (lossless WebP, PNG fallback; same switch as ./runtime)
//   objectsV3Url / objectsV3JsonUrl  the v3-only sprites (generic cottages), atlas + frame table
//   squarePropsV3JsonUrl   meta.houses in v3 world px (frames: the v2 square-props atlas)
import terrainV3Png from '../generated/terrain-v3.png?url';
import terrainV3Webp from '../generated/terrain-v3.webp?url';
import objectsV3Png from '../generated/objects-v3.png?url';
import objectsV3Webp from '../generated/objects-v3.webp?url';
import objectsV3Json from '../generated/objects-v3.json?url';
import townV3Json from '../generated/town-v3.json?url';
import squarePropsV3Json from '../generated/square-props-v3.json?url';
import { atlasFormat } from './runtime.js';

export let terrainV3Url: string = terrainV3Png;
export let objectsV3Url: string = objectsV3Png;
export const objectsV3JsonUrl: string = objectsV3Json;
export const townV3JsonUrl: string = townV3Json;
export const squarePropsV3JsonUrl: string = squarePropsV3Json;

/** Resolves once the URL exports are final (follows ./runtime's WebP decision). */
export const atlasFormatV3 = atlasFormat.then((f) => {
  if (f === 'webp') {
    terrainV3Url = terrainV3Webp;
    objectsV3Url = objectsV3Webp;
  }
  return f;
});
