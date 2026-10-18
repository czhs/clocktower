// Notebook slot of the mock HUD (owner: notebook group; docs/UI.md §3.3, rows 41b/41c). World + page:
//   - you (Dov) have the notebook panel open (the panels group draws it in its slot), so OTHER players see Dov holding
//     the open book at his hands; while you type on the Notes page (?nbpage=notes) it becomes the quill variant
//   - Finn opens his notebook at 0.2 s, reads (page flutter) and closes it at 5.2 s, on a 6.5 s loop
//   - hud.notebook = { page, notesAt(t) } tells the panels' notebook which page to draw and the Notes page state
//     (the typing loop of page.js notesScript: text grows, Saving… -> ✓ Saved 0.9 s after the last key)
// The books go through the depth-tested pass (draw.js, order 302): Dov's own body / anyone in front hides them; labels,
// bubbles and the pointing finger stay on top. ?still=1 = reduced motion.
import { notebookContext } from './draw.js';
import { notesScript, drawNotesPage, notesRect } from './page.js';
import { panelKit } from '../panels/art.js';
import { SLOTS, rect } from '../placeholders.js';
import { preloadPortBook } from './port3d.js';

export const LOOP = 6.5;
let N = null;

/**
 * Variant option (additive; docs/UI.md §6 variants): bookStyle 'held' (default: the small book at the hands, 8 facings,
 * depth-tested) | 'big' (book3d.js: a REAL 3D book unfolding in front of the reader, in the scene graph, lit / shadowed /
 * outlined like a prop) | 'held3d' (the same 3D model at held size in the hands) | 'bigsprite' (port3d.js: the same book from its baked sprites, as the 2D game draws it).
 * Live: setOptions(hud, { bookStyle: 'big' }) (= hud.setUiOptions); the next frame draws the new style. Mock HUD: ?book=big.
 * Per call: N.drawReader(P, m, { bookStyle }) overrides it for one reader.
 */
export function setOptions(hud, { bookStyle } = {}) {
  hud.uiOptions ??= {};
  if (bookStyle !== undefined) hud.uiOptions.bookStyle = ['big', 'bigsprite', 'held3d'].includes(bookStyle) ? bookStyle : 'held';
  if (bookStyle === 'bigsprite') preloadPortBook(hud.tod);
  return hud.uiOptions;
}

/** The HUD moment (also used by scenes/ui-notebook.js state=live). P = the pass view (or L for the 2D fallback). */
export function drawLive(hud, P, N, { still = false } = {}) {
  const t = P.t, nb = hud.notebook;
  if (hud.you) N.drawReader(P, hud.you, { openAt: 0.4, typing: nb?.page === 'notes' && nb.notesAt(t).typing, seed: 0, still });
  const finn = hud.bySeat(6);
  if (finn) {
    const base = t - (((t % LOOP) + LOOP) % LOOP);
    N.drawReader(P, finn, { openAt: base + 0.2, closeAt: base + 5.2, seed: 3, still });
  }
}

export default {
  z: 25,
  async setup(hud) {
    const page = hud.P('nbpage', 'players') === 'notes' ? 'notes' : 'players';
    hud.notebook = { page, notesAt: (t) => ({ ...notesScript(t), t }) };
    N = notebookContext(hud);
    if (hud.uiOptions?.bookStyle === 'bigsprite') await preloadPortBook(hud.tod);
    const still = hud.P('still', '0') === '1';
    if (N.pass) N.add((P) => drawLive(hud, P, N, { still }));
    hud._notebookStill = still;
    // The portraits slot (z 75) stamps 12x12 icons at the Seats-page row spots of the panel slot whatever the page is;
    // on the Notes page they would print over the sheet, so the page is drawn again above them (z 76).
    // CONTRACT-REQUEST (portraits): skip the notebook-row icons when hud.notebook?.page === 'notes' (the panels'
    // notebook already draws its own icon wells from the portraits atlas); then this re-draw goes.
    if (page === 'notes' && hud.ui) hud.ui.add((L) => {
      if (!hud.panels || hud.panels.panel === 'none') return;
      const r = rect(SLOTS.panels[0], L.screen.w, L.screen.h);
      drawNotesPage(L.screen, panelKit(L.tok), notesRect(r), { ...hud.notebook.notesAt(L.t), reduced: hud.panels.reduced });
    }, 76);
  },
  // world books are drawn by the depth pass (setup); without a pipeline, the 2D fallback draws them on L.world here
  draw(hud, L) { if (N && !N.pass) drawLive(hud, L, N, { still: hud._notebookStill }); },
};
