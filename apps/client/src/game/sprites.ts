// Phaser-free helpers for the generated character sheets (shared by the town scene and the
// lobby cosmetics preview). Sheets are composed per cosmetic combination on an offscreen canvas.
import type { Cosmetics } from '@ct/protocol';
import charManifest from '@ct/assets/generated/characters.json';
import charactersUrl from '@ct/assets/generated/characters.png';

export const CHAR = charManifest as unknown as {
  image: string;
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number };
  sheetWidth: number;
  sheetHeight: number;
  directions: readonly ('down' | 'up' | 'left' | 'right')[];
  frames: readonly string[];
  walkFps: number;
  sheets: Record<string, { x: number; y: number }>;
};
export const CHARACTERS_URL = charactersUrl;

export type SpriteKind = { kind: 'player'; cosmetics: Cosmetics; ghost: boolean } | { kind: 'storyteller' };

/** Is this premade character present in the generated atlas? */
export const hasPreset = (id: string | null | undefined): id is string => !!id && !!CHAR.sheets[`preset/${id}`];

/**
 * Ordered sheet keys to composite for an appearance. Precedence: a premade preset (if it exists
 * in the atlas) -> the layered cosmetics ("advanced customization").
 */
export function layerKeys(s: SpriteKind): string[] {
  if (s.kind === 'storyteller') return ['storyteller'];
  const c = s.cosmetics;
  if (hasPreset(c.preset)) {
    const k = s.ghost ? `preset/${c.preset}/ghost` : `preset/${c.preset}`;
    if (CHAR.sheets[k]) return [k];
  }
  if (s.ghost) return [`ghost/${c.ghost}`];
  const keys = [`body/${c.skin}`, `outfit/${c.outfit}/${c.palette}`];
  if (c.hair !== 'bald') keys.push(`hair/${c.hair}/${c.hairColor}`);
  if (c.accessory !== 'none') keys.push(`accessory/${c.accessory}`);
  return keys.filter((k) => CHAR.sheets[k]);
}
export const appearanceKey = (s: SpriteKind) => 'char:' + layerKeys(s).join('|');

/** Draw the composed sheet (all frames) into a new canvas. */
export function composeSheet(img: CanvasImageSource, keys: string[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CHAR.sheetWidth;
  c.height = CHAR.sheetHeight;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (const k of keys) {
    const p = CHAR.sheets[k];
    if (!p) continue;
    ctx.drawImage(img, p.x, p.y, CHAR.sheetWidth, CHAR.sheetHeight, 0, 0, CHAR.sheetWidth, CHAR.sheetHeight);
  }
  return c;
}

export const dirRow = (d: 'down' | 'up' | 'left' | 'right') => CHAR.directions.indexOf(d);
export const frameIndex = (dir: 'down' | 'up' | 'left' | 'right', col: number) => dirRow(dir) * CHAR.frames.length + col;

let imgPromise: Promise<HTMLImageElement> | null = null;
/** Lazily load the characters atlas image once (for non-Phaser consumers). */
export function loadCharactersImage(): Promise<HTMLImageElement> {
  if (!imgPromise)
    imgPromise = new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => {
        imgPromise = null;
        reject(new Error('characters atlas failed to load'));
      };
      i.src = CHARACTERS_URL;
    });
  return imgPromise;
}

