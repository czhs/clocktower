// Panels slot module for the mock HUD (owner: panels; docs/UI.md §3.3). Draws the side panel slot (SLOTS.panels[0],
// 132x158 at 4,24) as the Notebook built from the panel kit: bracketed iron panel, gold title, SAVED badge, 4 seat rows
// (16x16 icon wells exactly where the portraits group puts its 12x12 icons), ★ ? ✗ marks, note field with a blinking
// caret, role select + Clear. Screen tier (S); tokens follow the scene tod (L.tok).
//   ?panel=notebook (default) | none
import { SLOTS, rect } from '../placeholders.js';
import { panelKit } from './art.js';
import { notebook } from './screens.js';

export default {
  z: 70,
  async setup(hud) {
    const S = hud.panels = { P: null, panel: hud.P('panel', 'notebook'), reduced: hud.P('rm', '0') === '1' };
    try { const { loadPortraits } = await import('../portraits/atlas.js'); S.P = await loadPortraits(); } catch (e) { console.warn('panels: no portraits atlas', e.message); }
  },
  draw(hud, L) {
    const S = hud.panels;
    if (!S || S.panel === 'none') return;
    const K = panelKit(L.tok), r = rect(SLOTS.panels[0], L.screen.w, L.screen.h);
    // page switch: the notebook group's slot (src/ui/notebook/hud.js) sets hud.notebook = { page, notesAt(t) } (?nbpage=notes)
    const nb = hud.notebook;
    notebook(L.screen, K, r, { P: S.P, cast: hud.cast, st: hud.st, t: L.t, reduced: S.reduced }, { popAt: [1, 0, 0.5], page: nb?.page, notes: nb?.notesAt?.(L.t) });
  },
};
