// Notebook atlas (owner: notebook group; docs/UI.md §3.4, row 41b/41c): out/ui/notebook.{png,json}
//   tools/uibake.sh notebook                 (day/golden tokens; night: tools/uibake.sh notebook:notebook-night)
// Frames: the in-world reading book book_<dir>_<phase>_<f> (+ ghost bookghost_*), 16x16, anchor (8, 11), and the Notes
// page pieces notes-* / tab-glyph-* (files(): notebook.css = the DOM skin proposal for the v2 <textarea class="ctn-text">,
// with the opt-in pixel webfont built by ttf.js).
// All new-style (v2 has no reading sprite and no notebook art): no v2 coverage manifest.
import { tokens, hex, ramp } from '../kit.js';
import { buildBookFrames, pageFrames, DIRS, ANCHOR, CELL, PHASES, PAGE, WRITE_PATH } from './art.js';
import { TIMING, BOOK_FPS, HOLD_SEQ, PLACE } from './draw.js';
import { buildBigBookFrames, BIG_ANCHOR, BIG_CELL, BIG_PHASES, BIG_FPS, BIG_TIMING, BIG_HOLD_SEQ, BIG_WRITE, PLACE_BIG } from './bigbook.js';
import { buildCss } from './css.js';

export function notebookMeta(T, tod, frames) {
  // palette audit (docs/UI.md §2.3): every opaque colour = a token or a kit ramp() tone of a token
  const allowed = new Set(Object.values(T).filter((v) => typeof v === 'string').map((v) => hex(v)));
  const R = (c, o) => { for (const v of Object.values(ramp(c, o))) allowed.add(hex(v)); };
  R(T.goldSh, { light: 0.07, dark: 0.12, line: 0.3 }); R(ramp(T.goldSh, { light: 0.07, dark: 0.12, line: 0.3 }).sh, { dark: 0.08 }); R(T.goldSh, { line: 0.36 });
  R(T.parchment, { line: 0.58 }); R(T.parchment, { line: 0.36 }); R(T.parchment, { line: 0.5 }); R(T.parchment, { dark: 0.07 }); R(T.parchment, { dark: 0.04 });
  R(T.danger); R(T.evil); R(T.ok, { line: 0.42 }); R(T.warn, { line: 0.4 }); R(T.parchmentSh, { dark: 0.1 });
  R(T.ghost); R(T.ghostSh, { line: 0.3 }); R(T.ghost, { dark: 0.08 });
  const used = new Set(); for (const [, im] of frames) for (const c of im.colors()) used.add(c);
  return {
    anchors: { book: ANCHOR, cell: CELL },
    dirs: DIRS,
    fps: BOOK_FPS,
    frames: {
      book: 'book_<dir>_<phase>_<f>: open_0..3 (pop, closed, half, open), hold_0..2 (open, page corner lifts, page stands), close_0..2 (half, closed, pop), write_0..3 (open + quill scribble)',
      bookghost: 'bookghost_<dir>_<phase>_<f>: the same set in the ghost family (dead players keep notes too)',
      counts: PHASES,
    },
    timing: TIMING,
    holdSeq: HOLD_SEQ,
    // variants (additive): bookStyle 'big' = the big book in front of the reader (bigbook.js), facing-independent
    bigBook: {
      option: "bookStyle: 'held' (default, book_*) | 'big' (bookbig_*); live via hud.uiOptions.bookStyle / setOptions(hud, {bookStyle}); mock HUD ?book=big",
      frames: 'bookbig_<phase>_<f> / bookbigghost_<phase>_<f>: open_0..4 (pop, closed, cover standing, cover falling, spread), hold_0..3 (spread, right corner lifts, page stands, lands), close_0..2 (cover standing, closed, pop), write_0..3 (quill, ink grows)',
      anchor: BIG_ANCHOR, cell: BIG_CELL, counts: BIG_PHASES, fps: BIG_FPS, timing: BIG_TIMING, holdSeq: BIG_HOLD_SEQ, write: BIG_WRITE, place: PLACE_BIG,
      tier: 'A (L.world, z 18: over the scene, under labels / bubbles z 20 and the finger z 30); anchor at the reader feet (screen) + place.dy, ghosts + 0.2 m hover; one view for every facing',
    },
    writePath: WRITE_PATH,
    place: PLACE,
    page: PAGE,
    nineSlice: { 'notes-page': PAGE.ins, 'notes-scroll-thumb': { l: 0, t: 2, r: 0, b: 2 } },
    newStyle: {
      notebook: {
        tod,
        book: 'tier A-depth: a depth-tested billboard at the hand point (src/ui/notebook/draw.js, pinPass instance at order 302: masked by L.world so labels / bubbles / the pointing finger stay on top; hidden by the reader\'s own body when facing away and by anyone standing in front)',
        page: 'tier S (panel) + CSS (DOM textarea skin, out/ui/notebook.css; opt-in pixel webfont .ctn-pixelfont)',
      },
    },
    paletteAudit: { colours: used.size, untraced: [...used].filter((c) => !allowed.has(c)) },
  };
}

export default {
  image: 'notebook.png',
  width: 256,
  async frames({ tod }) {
    const T = tokens(tod);
    this._f = [...buildBookFrames(T), ...buildBookFrames(T, { ghost: true }), ...pageFrames(T),
      ...buildBigBookFrames(T), ...buildBigBookFrames(T, { ghost: true })];     // variants: bookStyle 'big' (appended: existing frames keep their order)
    return this._f;
  },
  meta({ tod }) { const T = tokens(tod); return notebookMeta(T, tod, this._f); },
  // r6: the DOM skin is an extra text output (bake contract files()) -> out/ui/notebook.css (was meta.cssText + mkcss.py)
  files({ tod }) { return { 'notebook.css': buildCss(tokens(tod)) }; },
};
