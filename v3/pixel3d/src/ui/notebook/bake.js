// Notebook atlas (owner: notebook group; docs/UI.md §3.4, row 41b/41c): out/ui/notebook.{png,json}
//   tools/uibake.sh notebook                 (day/golden tokens; night: tools/uibake.sh notebook:notebook-night)
// Frames: the in-world reading book book_<dir>_<phase>_<f> (+ ghost bookghost_*), 16x16, anchor (8, 11), and the Notes
// page pieces notes-* / tab-glyph-* (files(): notebook.css = the DOM skin proposal for the v2 <textarea class="ctn-text">,
// with the opt-in pixel webfont built by ttf.js).
// All new-style (v2 has no reading sprite and no notebook art): no v2 coverage manifest.
import { tokens, hex, ramp } from '../kit.js';
import { buildBookFrames, pageFrames, DIRS, ANCHOR, CELL, PHASES, PAGE, WRITE_PATH } from './art.js';
import { TIMING, BOOK_FPS, HOLD_SEQ, PLACE } from './draw.js';
import { BIG3D_PHASES, BIG3D_FPS, BIG3D_TIMING, HOLD_SEQ_3D, PLACE3D, BOOK_DIM, WRITE_LINE } from './book3d.js';
import { renderBook3DFrames, BAKE3D } from './bake3d.js';
import { buildCss } from './css.js';

export function notebookMeta(T, tod, frames, this3d = { anchors: {}, cells: {}, mixed: null }) {
  // palette audit (docs/UI.md §2.3): every opaque colour = a token or a kit ramp() tone of a token
  const allowed = new Set(Object.values(T).filter((v) => typeof v === 'string').map((v) => hex(v)));
  const R = (c, o) => { for (const v of Object.values(ramp(c, o))) allowed.add(hex(v)); };
  R(T.goldSh, { light: 0.07, dark: 0.12, line: 0.3 }); R(ramp(T.goldSh, { light: 0.07, dark: 0.12, line: 0.3 }).sh, { dark: 0.08 }); R(T.goldSh, { line: 0.36 });
  R(T.parchment, { line: 0.58 }); R(T.parchment, { line: 0.36 }); R(T.parchment, { line: 0.5 }); R(T.parchment, { dark: 0.07 }); R(T.parchment, { dark: 0.04 });
  R(T.danger); R(T.evil); R(T.ok, { line: 0.42 }); R(T.warn, { line: 0.4 }); R(T.parchmentSh, { dark: 0.1 });
  R(T.ghost); R(T.ghostSh, { line: 0.3 }); R(T.ghost, { dark: 0.08 });
  const used = new Set(); for (const [n, im] of frames) if (!n.startsWith('bookbig')) for (const c of im.colors()) used.add(c);
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
    // bookStyle 'big' = the REAL 3D book (book3d.js) in live pixel3d scenes; these frames are its port bake (bake3d.js):
    // the same model rendered from the gameplay camera for 8 facings x every drawing (replaces the flat r1 big book)
    bigBook: {
      option: "bookStyle: 'held' (default, book_*) | 'big' (live: a 3D book in the scene graph; port: bookbig_<dir>_*) | 'held3d' (live only, opt-in: the 3D model at held size at the held grip; evaluated, not the default) | 'bigsprite' (mock HUD: the port sprites); live via hud.uiOptions.bookStyle / setOptions(hud, {bookStyle}); mock HUD ?book=big|bigsprite",
      frames: 'bookbig_<dir>_<phase>_<f> / bookbigghost_<dir>_<phase>_<f>, dir = v2 point dir names: open_0..5 (pop, closed + rise, cover lifts, cover past upright + leaves trail, cover falls + leaves fan, open), hold_0..4 (open, page corner lifts, page stands, passes upright, lands left), close_0..3 (cover rises, nearly shut, closed, pop away), write_0..3 (quill writes the near line, ink grows)',
      dirs: DIRS, counts: BIG3D_PHASES, fps: BIG3D_FPS, timing: BIG3D_TIMING, holdSeq: HOLD_SEQ_3D, write: WRITE_LINE,
      anchors: this3d.anchors, cells: this3d.cells,
      anchor: 'per dir: the READER\'S FEET texel inside the frame (draw at feet - anchors[dir]); ghost frames include the 0.2 m hover',
      depth: 'avatar depth + epsilon (always over its own reader, under name labels / bubbles / the finger); the live book does the same with a view-space depth bias',
      place: PLACE3D, model: BOOK_DIM,
      render: { camera: `yaw 0, pitch 30 deg, orthographic, vh ${BAKE3D.vh} (30 texels/m at 640x360)`, light: `sky.js '${tod}' preset + sunFor('${tod}')`, mixedTexels: this3d.mixed,
        note: 'colours come from the toon renderer (3D lit), not from UI tokens: excluded from the palette audit below' },
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
  width: 512,
  async frames(env) {
    const { tod } = env, T = tokens(tod);
    // bookStyle 'big': the 3D book's port frames, rendered by the pipeline (appended: existing frames keep their order)
    this._3d = await renderBook3DFrames(env.engine, { tod });
    this._f = [...buildBookFrames(T), ...buildBookFrames(T, { ghost: true }), ...pageFrames(T), ...this._3d.frames];
    return this._f;
  },
  meta({ tod }) { const T = tokens(tod); return notebookMeta(T, tod, this._f, this._3d); },
  // r6: the DOM skin is an extra text output (bake contract files()) -> out/ui/notebook.css (was meta.cssText + mkcss.py)
  files({ tod }) { return { 'notebook.css': buildCss(tokens(tod)) }; },
};
