// Group font registration for the UI pages (src/ui/fonts.js) (owner: UI lead; module fix 2026-10-17). kit.js cannot import group
// modules (ownership + circular import: src/ui/hud/font.js derives from kit FONTS at import), so the pages register
// group faces into kit FONTS here: FONTS.display = the hud group's DISPLAY face (src/ui/hud/font.js). Imported by
// scenes/ui-hud.js (so every scene built on buildHudStage has it) and scenes/ui-bake.js (every bake).
// A missing or broken font module never fails the page: drawText({font: 'display'}) then falls back to body.
import { FONTS, registerFont } from './kit.js';

let done = null;
export function registerGroupFonts() {
  return (done ??= (async () => {
    try {
      const F = await import('./hud/font.js');
      if (F.DISPLAY && !FONTS.display) registerFont('display', F.DISPLAY);
    } catch (e) { console.warn(`ui fonts: hud display face not registered (${String(e.message || e).slice(0, 120)})`); }
    return FONTS;
  })());
}
