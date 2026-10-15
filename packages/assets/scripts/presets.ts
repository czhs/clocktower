// Premade character sheets (src/presets.ts). Interim art: each preset is flattened from the
// procedural layers of its recipe; the ghost variant is derived from the (possibly AI-remastered)
// alive sheet so the dead keep a recognisable silhouette: pale blue-white, translucent, floating
// a few pixels up with feet dissolving into wisps and a faint cold rim.
import { CHARACTER_PRESETS, type CharacterPreset } from '../src/presets.js';
import { DIRS, FH, FRAMES, FW } from './characters.js';
import { Img } from './lib/img.js';

export function presetLayers(p: CharacterPreset): string[] {
  const r = p.recipe;
  const keys = [`body/${r.skin}`, `outfit/${r.outfit}/${r.palette}`];
  if (r.hair !== 'bald') keys.push(`hair/${r.hair}/${r.hairColor}`);
  if (r.accessory !== 'none') keys.push(`accessory/${r.accessory}`);
  return keys;
}

export function composePreset(sheets: Map<string, Img>, p: CharacterPreset): Img {
  const first = sheets.get(`body/${p.recipe.skin}`)!;
  const out = new Img(first.w, first.h);
  for (const k of presetLayers(p)) {
    const s = sheets.get(k);
    if (!s) throw new Error(`preset ${p.id}: missing layer ${k}`);
    out.blit(s, 0, 0);
  }
  return out;
}

const BOB = [-2, -3, -3, -2, -1];
// docs/art-direction.md "Ghosts": contour, mist, spirit light (+ a deeper fold for dark areas).
const GHOST = { contour: [82, 110, 131], fold: [104, 138, 158], mist: [142, 180, 194], light: [204, 225, 222] } as const;
const GHOST_ALPHA = 0.85;

/** Repaint one opaque pixel in the ghost ramp by its luminance (keeps hair/hat/costume structure). */
function ghostTone(R: number, G: number, B: number): readonly number[] {
  const lum = (0.3 * R + 0.59 * G + 0.11 * B) / 255;
  return lum < 0.3 ? GHOST.fold : lum < 0.64 ? GHOST.mist : GHOST.light;
}
function isWarmLight(R: number, G: number, B: number) {
  return R > 200 && G > 140 && B < 120; // lantern flames stay warm
}

/** Darker 1 px contour on the silhouette edge (inside the shape), per 24x32 frame. */
function contour(out: Img, keepWarm = false) {
  const FW = out.w / FRAMES.length;
  const FH = out.h / DIRS.length;
  const edge: [number, number][] = [];
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      if (out.alpha(x, y) === 0) continue;
      const fx = x % FW;
      const fy = y % FH;
      const solid = (dx: number, dy: number) => {
        const nx = fx + dx;
        const ny = fy + dy;
        return nx >= 0 && ny >= 0 && nx < FW && ny < FH && out.alpha(x + dx, y + dy) > 0;
      };
      if (!solid(1, 0) || !solid(-1, 0) || !solid(0, 1) || !solid(0, -1)) edge.push([x, y]);
    }
  for (const [x, y] of edge) {
    const a = out.alpha(x, y);
    const c = out.get(x, y);
    if (keepWarm && isWarmLight(c[0], c[1], c[2])) continue;
    out.set(x, y, [GHOST.contour[0], GHOST.contour[1], GHOST.contour[2], a]);
  }
}

/** Ghost variant of a living sheet: floats 1-3 px, dissolving hem, unified ghost palette. */
export function ghostOf(sheet: Img): Img {
  // frame size from the sheet (1x: 24x32, 2x: 48x64); bob/hem distances scale with it
  const FW = sheet.w / FRAMES.length;
  const FH = sheet.h / DIRS.length;
  const k = FH / 32;
  const out = new Img(sheet.w, sheet.h);
  for (let r = 0; r < DIRS.length; r++)
    for (let c = 0; c < FRAMES.length; c++) {
      const ox = c * FW;
      const oy = r * FH;
      const dy = BOB[c % BOB.length]! * k;
      for (let y = 0; y < FH; y++)
        for (let x = 0; x < FW; x++) {
          const [R, G, B, A] = sheet.get(ox + x, oy + y);
          if (A < 200) continue; // drop the living contact shadow
          const ty = y + dy;
          if (ty < 0 || ty >= FH) continue;
          const feet = y >= 22 * k ? Math.max(0, 1 - (y - 22 * k) / (7 * k)) : 1;
          if (feet <= 0.05 || (((x / k) | 0) + ((y / k) | 0) + c) & 1 && feet < 0.6) continue; // broken, tapering hem
          const col = ghostTone(R, G, B); // preset ghosts: no warm exceptions (hair/brass would stay yellow)
          out.set(ox + x, oy + ty, [col[0]!, col[1]!, col[2]!, Math.round(255 * GHOST_ALPHA * (0.55 + 0.45 * feet))]);
        }
    }
  contour(out);
  return out;
}

/** Bring a procedural ghost-style sheet (ghost/*) onto the same ghost palette and contour. */
export function unifyGhost(sheet: Img): Img {
  const out = new Img(sheet.w, sheet.h);
  for (let y = 0; y < sheet.h; y++)
    for (let x = 0; x < sheet.w; x++) {
      const [R, G, B, A] = sheet.get(x, y);
      if (A === 0) continue;
      const col = isWarmLight(R, G, B) ? [R, G, B] : ghostTone(R, G, B); // the lantern ghost keeps its flame
      out.set(x, y, [col[0]!, col[1]!, col[2]!, Math.round(Math.min(255, A * 1.05) * GHOST_ALPHA)]);
    }
  contour(out, true);
  return out;
}

/** 48x48 head-and-shoulders portrait (down-facing idle frame; 1x art is doubled, 2x art is native). */
export function portraitOf(sheet: Img): Img {
  const fw = sheet.w / FRAMES.length;
  const k = fw / FW;
  const crop = new Img(fw, fw);
  crop.copy(sheet, 0, 0, 0, 2 * k, fw, fw);
  const f = 48 / fw;
  const out = new Img(48, 48);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.set(x, y, crop.get(Math.floor(x / f), Math.floor(y / f)));
  return out;
}

export function addPresetSheets(sheets: Map<string, Img>) {
  for (const p of CHARACTER_PRESETS) {
    const alive = composePreset(sheets, p);
    sheets.set(`preset/${p.id}`, alive);
    sheets.set(`preset/${p.id}/ghost`, ghostOf(alive));
  }
}
