/// <reference lib="dom" />
// Format-agnostic URLs of the generated runtime atlases (v2.2 perf, WP1) — browser/Vite only, never
// imported by the server. Every atlas exists as lossless WebP (about 4-10x smaller) and as a PNG
// fallback with identical pixels (scripts/lib/encode.ts); client code imports the URL from here and
// never names a format:
//
//   import { castUrl, terrainUrl } from '@ct/assets/runtime';
//   this.load.image('cast', castUrl);
//
// The exports are live bindings: they hold the PNG URLs until the WebP-lossless check has passed,
// then switch to the WebP URLs. In Chromium/Firefox the check is synchronous (canvas WebP encoding
// implies decoding), so the switch happens while this module evaluates; elsewhere (Safari) a 1x1
// lossless WebP is decoded — well under a frame, long before the lazy town chunk asks for a URL.
// Code that must not race (or reads a URL into a constant) can `await atlasFormat` first.
// Debug: localStorage 'ct.debug.atlas' = 'png' forces the fallback.
import castPng from '../generated/cast.png?url';
import castWebp from '../generated/cast.webp?url';
import castHdPng from '../generated/cast-hd.png?url';
import castHdWebp from '../generated/cast-hd.webp?url';
import portraitsPng from '../generated/cast-portraits.png?url';
import portraitsWebp from '../generated/cast-portraits.webp?url';
import terrainPng from '../generated/terrain.png?url';
import terrainWebp from '../generated/terrain.webp?url';
import decorPng from '../generated/decor.png?url';
import decorWebp from '../generated/decor.webp?url';
import objectsPng from '../generated/objects.png?url';
import objectsWebp from '../generated/objects.webp?url';
import lightsPng from '../generated/lights.png?url';
import lightsWebp from '../generated/lights.webp?url';
import squarePropsPng from '../generated/square-props.png?url';
import squarePropsWebp from '../generated/square-props.webp?url';
import socialPng from '../generated/social.png?url';
import socialWebp from '../generated/social.webp?url';
import townJson from '../generated/town.json?url';

export type AtlasFormat = 'webp' | 'png';

/** The 8-direction cast sheet (Phaser). */
export let castUrl: string = castPng;
/** Photo-real ("hd") cast members' full-resolution sheet (cast-hd.json, CAST_HD_SCALE x the 32x40 cell). */
export let castHdUrl: string = castHdPng;
/** The DOM UI's 'down'-row portrait strip (cast-portraits.json). */
export let portraitsUrl: string = portraitsPng;
export let terrainUrl: string = terrainPng;
export let decorUrl: string = decorPng;
export let objectsUrl: string = objectsPng;
export let lightsUrl: string = lightsPng;
export let squarePropsUrl: string = squarePropsPng;
export let socialUrl: string = socialPng;
/** The Tiled map (JSON, no image format to pick). */
export const townJsonUrl: string = townJson;

function use(format: AtlasFormat): AtlasFormat {
  if (format === 'webp') {
    castUrl = castWebp;
    castHdUrl = castHdWebp;
    portraitsUrl = portraitsWebp;
    terrainUrl = terrainWebp;
    decorUrl = decorWebp;
    objectsUrl = objectsWebp;
    lightsUrl = lightsWebp;
    squarePropsUrl = squarePropsWebp;
    socialUrl = socialWebp;
  }
  return format;
}

/** A 1x1 lossless WebP (the VP8L bitstream, not lossy VP8). */
export const WEBP_LOSSLESS_PROBE = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

function detect(): Promise<AtlasFormat> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return Promise.resolve('png');
  try {
    if (localStorage.getItem('ct.debug.atlas') === 'png') return Promise.resolve('png');
  } catch {
    /* storage blocked */
  }
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    if (c.toDataURL('image/webp').startsWith('data:image/webp')) return Promise.resolve(use('webp'));
  } catch {
    /* fall through to the decode probe */
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(use(img.width === 1 && img.height === 1 ? 'webp' : 'png'));
    img.onerror = () => resolve('png');
    img.src = WEBP_LOSSLESS_PROBE;
  });
}

/** Resolves once the URL exports are final ('webp' when this browser decodes lossless WebP). */
export const atlasFormat: Promise<AtlasFormat> = detect();
