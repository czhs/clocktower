// Group font registration for the UI pages (src/ui/fonts.js) (owner: UI lead; module fix 2026-10-17). kit.js cannot import group
// modules (ownership + circular import: src/ui/hud/font.js derives from kit FONTS at import), so the pages register
// group faces into kit FONTS here: FONTS.display = the hud group's DISPLAY face (src/ui/hud/font.js). Imported by
// scenes/ui-hud.js (so every scene built on buildHudStage has it) and scenes/ui-bake.js (every bake).
// A missing or broken font module never fails the page: drawText({font: 'display'}) then falls back to body.
// (density round, additive) also registers FONTS['display@2'] = derive2x(DISPLAY) (Scale2x-smoothed: the display face
// already has 2-px stems at 1x, so its D=2 version keeps the weight and gets round bowls / clean diagonals), and
// checkDensityFaces() lists any D=2 glyph whose advance is not exactly 2x its 1x glyph (layouts would drift).
import { FONTS, registerFont, derive2x } from './kit.js';

let done = null;
export function registerGroupFonts() {
  return (done ??= (async () => {
    try {
      const F = await import('./hud/font.js');
      if (F.DISPLAY && !FONTS.display) registerFont('display', F.DISPLAY);
      if (F.DISPLAY && !FONTS['display@2']) registerFont('display@2', derive2x(F.DISPLAY, { smooth: true, name: 'display@2' }));
    } catch (e) { console.warn(`ui fonts: hud display face not registered (${String(e.message || e).slice(0, 120)})`); }
    return FONTS;
  })());
}

/** D=2 faces whose glyph advances are not 2x their 1x glyphs: [{face, ch, w1, w2}] (empty = drop-in safe). */
export function checkDensityFaces(pairs = [['body', 'body@2'], ['tiny', 'tiny@2'], ['display', 'display@2']]) {
  const bad = [];
  for (const [a, b] of pairs) {
    const A = FONTS[a], B = FONTS[b];
    if (!A || !B) continue;
    for (const [ch, g] of A.map) { const h = B.map.get(ch); if (h && h.w !== 2 * g.w) bad.push({ face: b, ch, w1: g.w, w2: h.w }); }
    for (const k of ['space', 'tracking', 'cap', 'desc', 'lineH']) if ((B[k] ?? 0) !== 2 * (A[k] ?? 0)) bad.push({ face: b, metric: k, v1: A[k], v2: B[k] });
  }
  return bad;
}
