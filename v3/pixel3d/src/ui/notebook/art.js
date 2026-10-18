// Notebook art (owner: notebook group; docs/UI.md row 41b/41c, §6). Two things, both pure + deterministic PixelImages
// from the kit token set (no three.js, no Math.random/Date):
//
//  (B) the in-world "reading the notebook" book that OTHER players see at a reader's hands: 8 facings (the v2 point
//      dir names), frames book_<dir>_open_0..3, book_<dir>_hold_0..2, book_<dir>_close_0..2, book_<dir>_write_0..3
//      (quill moving on clean pages), and the dim ghost variant bookghost_<dir>_<phase>_<f>. 16x16 cells, anchor (8, 11) = the grip
//      point between the hands (placed at the hand point of the character, draw.js).
//  (A) the Notes page pieces of the notebook panel: the lined parchment page 9-slice (binding holes + rose margin), the
//      rule tile, ink caret, selection highlight, parchment scrollbar, page-tab glyphs and the save-state badges.
//
// Book views (r2). The reader holds the book open at the belly, pages UP, looking down into it, so from the high game
// camera every open view shows the cream spread (pages curving up from the gutter = a shallow V) + a red ribbon, and
// the closed / half drawings show the leather boards (the open reads as "the book swings open"):
//   down, up     the full spread (13 wide), gutter vertical; half = boards swinging (down) / narrow spread (up)
//   down-right, up-right   the spread seen obliquely (left page wide, right page short)
//   right        a narrow three-quarter spread (near page wide, 1 column of far page, boards under both; r6); closed =
//                edge-on with the fore-edge strata; half = '<' (boards in profile)
//   left, down-left, up-left = exact mirrors, shaded AFTER the flip (light stays upper-left; markers learning).
// Readers facing away hold the book off to their right side (draw.js PLACE), so it shows beside the body.
// Masks: '.' empty, a cover, b page, e page stratum (fixed page shade), i ink scribble (fixed), k spine / gutter
// crease (cover line), g gold emblem, r ribbon. Materials auto-shade by exposure to EMPTY texels (top/left open -> hi,
// bottom/right open -> sh), then a 1-px 4-neighbour outline in the line tone of the material it touches.
import { PixelImage, ramp, drawText, textWidth, nineSlice, TOKENS } from '../kit.js';
import { grid } from '../panels/art.js';
import { LABEL } from '../hud/font.js';

export const DIRS = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];   // = markers POINT_DIRS
export const MIRROR = { left: 'right', 'down-left': 'down-right', 'up-left': 'up-right' };
export const CELL = 16;
export const ANCHOR = { x: 8, y: 11 };           // grip point (mask (7, 10) + 1 px outline pad)
const MW = 14, MH = 13;                          // mask size (cell minus the outline pad; one spare row at the bottom)

// ------------------------------------------------------------------------------------------------ materials
/** Book materials for a token set; ghost = the dim ghost-family recolour (dead players still keep notes). */
export function bookMats(T, ghost = false) {
  if (ghost) {
    const g = ramp(T.ghost), gs = ramp(T.ghostSh, { line: 0.3 });
    return {
      a: { ...gs }, b: { hi: g.hi, mid: T.ghost, sh: ramp(T.ghost, { dark: 0.08 }).sh, line: gs.line },
      g: { hi: g.hi, mid: g.hi, sh: T.ghost, line: gs.line }, r: { ...gs, mid: gs.sh, hi: gs.mid },
      e: gs.mid, i: gs.mid, k: gs.line,
      w: { hi: g.hi, mid: T.ghost, sh: gs.mid, line: gs.line }, v: { ...gs }, n: gs.line,
    };
  }
  // leather: the goldSh family pushed one step darker (a book, not a coin: tan reads as "gold" at 12 px), so the cream
  // page rim carries the value contrast on beige cobbles and the dark line separates it from grey grout
  const lea = ramp(T.goldSh, { light: 0.07, dark: 0.12, line: 0.3 });
  const leather = { hi: T.goldSh, mid: lea.sh, sh: ramp(lea.sh, { dark: 0.08 }).sh, line: ramp(T.goldSh, { line: 0.36 }).line };
  // r6 (critic): at night the spread drops one step toward the night key (hi -> parchment, mid -> its dark step, sh ->
  // parchmentSh) and keeps its outline, so it still separates from the dimmed body without glowing at day value
  const night = T === TOKENS.night;
  const page = night
    ? { hi: T.parchment, mid: ramp(T.parchment, { dark: 0.07 }).sh, sh: T.parchmentSh, line: ramp(T.parchment, { line: 0.58 }).line }
    : { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: ramp(T.parchment, { line: 0.58 }).line };
  const rib = ramp(T.danger);
  return {
    a: leather, b: page, g: { hi: T.goldHi, mid: T.gold, sh: T.gold, line: T.goldLine }, r: { hi: rib.mid, mid: rib.mid, sh: rib.sh, line: rib.line },
    e: page.sh, i: ramp(T.parchment, { line: 0.36 }).line, k: leather.line,
    // quill (r6): one strong silhouette and a single dark nib texel (no outline ring around the nib: renderBookMask).
    // (demo round, 2026-10-18) the feather was the page's own cream with the page's own line: on the open spread its
    // outline read as a crack / a torn V in the pages at 1x, not a quill. Now a cool white goose feather (the ghost
    // ramp: hi / mid / sh) with a violet-ink line, so it separates from the warm pages by hue AND value.
    w: { hi: ramp(T.ghost, { light: 0.06 }).hi, mid: T.ghost, sh: T.ghostSh, line: ramp(T.ghostSh, { line: 0.42 }).line }, v: { hi: T.gold, mid: T.goldSh, sh: T.goldSh, line: T.goldLine }, n: T.outline,
  };
}

// ------------------------------------------------------------------------------------------------ mask rendering
const FIXED = new Set(['e', 'i', 'k', 'n']);
/**
 * Render a mask (rows of chars) to a PixelImage (w + 2) x (h + 2) with the book shading rules (header). flipX mirrors
 * the MASK first, so shading and outline are computed after the flip.
 */
export function renderBookMask(rows, M, { flipX = false } = {}) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const src = rows.map((r) => r.padEnd(w, '.'));
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : (flipX ? src[y][w - 1 - x] : src[y][x]));
  const img = new PixelImage(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y);
    if (c === '.') continue;
    if (FIXED.has(c)) { img.set(x + 1, y + 1, M[c]); continue; }
    const R = M[c];
    const hiE = at(x, y - 1) === '.' || at(x - 1, y) === '.', shE = at(x, y + 1) === '.' || at(x + 1, y) === '.';
    img.set(x + 1, y + 1, hiE && !shE ? R.hi : shE && !hiE ? R.sh : R.mid);
  }
  const lineOf = (c) => (c === 'e' || c === 'i' ? M.b.line : c === 'k' ? M.a.line : c === 'n' ? M.n : M[c].line);
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (at(x, y) !== '.') continue;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const c = at(x + dx, y + dy);
      if (c === 'n') continue;          // the quill nib is one dark texel: no outline ring around it (r6)
      if (c !== '.') { img.set(x + 1, y + 1, lineOf(c)); break; }
    }
  }
  return img;
}
/** One step smaller drawing of a mask (the pop): erode texels with an empty 4-neighbour, keep the grip row. */
export function erodeMask(rows) {
  const h = rows.length, w = rows[0].length;
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : rows[y][x]);
  return rows.map((r, y) => [...r].map((c, x) => (c !== '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === '.') ? '.' : c)).join(''));
}

// ------------------------------------------------------------------------------------------------ book masks
/**
 * The open V / '^' builder. Columns left and right of the spine column sx; dy[i] = how much column i+1 (counted from
 * the spine) is raised (cover views: outer edges farther = HIGHER) or lowered (page views: outer edges nearer = LOWER).
 *   face 'cover': column = cover texels top..top+h-1 with a cream page rim at top-1; spine 'k'
 *   face 'page' : column = page texels top..top+h-2 (ink on rows top+1, top+3) + a cover row at top+h-1; the
 *                 outermost column is the cover edge; gutter 'k'
 */
function vBook({ sx = 7, top, h, L, R, face, ribbon = true, rise = -1 }) {
  const G = grid(MW, MH);
  const up = rise;   // -1: outer columns higher (boards swinging away; pages curving up from the gutter)
  const col = (x, t, outer, i, n) => {
    if (face === 'cover') {
      G.put(x, t - 1, 'b');
      for (let j = 0; j < h; j++) G.put(x, t + j, 'a');
    } else if (outer) {
      for (let j = 0; j < h; j++) G.put(x, t + j, 'a');
    } else {
      for (let j = 0; j < h - 1; j++) G.put(x, t + j, 'b');
      G.put(x, t + h - 1, 'a');
      // ink scribbles: broken dashes, 1 texel in from the gutter and the outer edge
      if (i >= 2 && i <= n - 1) { G.put(x, t + 1, (x + t) % 4 === 3 ? 'b' : 'i'); if (i <= n - 2 || n <= 3) G.put(x, t + 3, (x + t + 1) % 5 === 0 ? 'b' : 'i'); }
    }
  };
  L.forEach((d, k) => col(sx - k - 1, top + up * d, k === L.length - 1, k + 1, L.length));
  R.forEach((d, k) => col(sx + k + 1, top + up * d, k === R.length - 1, k + 1, R.length));
  if (face === 'cover') {
    G.put(sx, top - 1, 'b');
    for (let j = 0; j < h; j++) G.put(sx, top + j, 'k');
    if (ribbon) G.put(sx, top + h, 'r');
  } else {
    for (let j = 0; j < h - 1; j++) G.put(sx, top + j, 'k');
    G.put(sx, top + h - 1, 'a');
    if (ribbon && R.length >= 3) for (let j = 1; j <= 3; j++) G.put(sx + 2, top + up * R[1] + j, 'r');   // ribbon over the right page
  }
  return G;
}
const add = (G, cells, ch = 'b') => { for (const [x, y] of cells) G.put(x, y, ch); return G; };

/** Closed book drawings (what the open starts from and the close ends on). */
function closedMask(view) {
  const G = grid(MW, MH);
  if (view === 'down' || view === 'up') {
    G.rect(4, 3, 7, 8, 'a');
    G.put(4, 2, 'a'); G.put(10, 2, 'a'); G.rect(5, 2, 5, 1, 'b');            // page tops between the boards
    if (view === 'down') add(G, [[7, 5], [6, 6], [8, 6], [7, 7]], 'g');            // gold medallion ring (a diamond: a cross read as a prayer book)
    else for (let y = 3; y < 11; y++) G.put(4, y, 'k');                      // the back board: spine crease on its left
    if (view === 'down') G.put(8, 11, 'r');
  } else if (view === 'down-right' || view === 'up-right') {
    G.rect(4, 3, 6, 8, 'a');
    for (let y = 3; y < 10; y++) G.put(10, y, y % 2 ? 'e' : 'b');             // fore-edge (page block) on the turned side
    G.put(10, 10, 'a'); G.put(4, 2, 'a'); G.rect(5, 2, 5, 1, 'b'); G.put(10, 2, 'b');
    if (view === 'down-right') add(G, [[7, 5], [6, 6], [8, 6], [7, 7]], 'g'); else for (let y = 3; y < 11; y++) G.put(4, y, 'k');
    if (view === 'down-right') G.put(8, 11, 'r');
  } else {   // right: edge-on (spine side toward the reader), board + fore-edge strata + board
    G.rect(7, 3, 4, 8, 'a');
    for (let y = 3; y < 10; y++) G.put(9, y, y % 2 ? 'e' : 'b');
    G.rect(7, 2, 4, 1, 'b'); G.put(8, 3, 'k'); for (let y = 3; y < 11; y++) G.put(8, y, 'k');
    G.put(10, 11, 'r');
  }
  return G.rows();
}

/**
 * Open drawings per view: k = 'half' | 'open'; flutter 0 | 1 (page corner lifts) | 2 (a page stands up).
 * r2: the open book is held at the belly with its pages UP (the reader looks down into it), so from the high game camera
 * every view shows the cream spread (pages curving up from the gutter = a shallow V); the half drawing shows the boards
 * swinging (front views) so the open reads as "the book opens". r1 drew upright books: the front view was a brown V on
 * brown bodies and vanished (shots/ui-notebook/r1/z/ada.png).
 */
function openMask(view, k, flutter = 0) {
  let G;
  const spread = (o) => vBook({ top: 5, h: 6, face: 'page', ...o });
  if (view === 'down' || view === 'up') {
    G = k === 'half' ? (view === 'down' ? vBook({ top: 4, h: 7, L: [0, 1, 1, 2], R: [0, 1, 1, 2], face: 'cover' }) : spread({ top: 5, L: [0, 1, 1, 2], R: [0, 1, 1, 2] }))
      : spread({ L: [0, 0, 1, 1, 2, 2], R: [0, 0, 1, 1, 2, 2] });
    if (k === 'open' && flutter === 1) add(G, [[11, 3], [12, 2], [13, 2]]);
    if (k === 'open' && flutter === 2) add(G, [[7, 4], [7, 3], [7, 2], [8, 2], [8, 1]]);
  } else if (view === 'down-right' || view === 'up-right') {
    G = k === 'half' ? (view === 'down-right' ? vBook({ sx: 8, top: 4, h: 7, L: [0, 1, 1, 2], R: [1, 2], face: 'cover' }) : spread({ sx: 8, L: [0, 1, 1, 2], R: [1, 2] }))
      : spread({ sx: 8, L: [0, 0, 1, 1, 2, 2], R: [1, 2, 3] });
    if (k === 'open' && flutter === 1) add(G, [[2, 2], [3, 2], [4, 3]]);
    if (k === 'open' && flutter === 2) add(G, [[8, 4], [8, 3], [8, 2], [9, 2], [9, 1]]);
  } else if (k === 'half') {   // right, half: the boards swing up in profile ('<': far half page face, near half board)
    G = grid(MW, MH);
    const far = [[5, 4], [6, 4], [7, 4], [8, 5], [9, 5]];
    for (const [x, t] of far) { for (let j = 0; j < 4; j++) G.put(x, t + j, 'b'); }
    for (const [x, t] of far.slice(1, -1)) G.put(x, t + 1, (x % 3) ? 'i' : 'b');
    for (const [x] of far) for (let j = 0; j < 3; j++) G.put(x, 8 + j, 'a');
    for (let y = 5; y < 11; y++) G.put(10, y, 'k');
  } else {   // right, open (r6): a slight three-quarter spread, not an edge-on page block (the r5 profile read as a cream
    // card, critic): the near page (4 columns + its board edge) and 1 column of the far page beyond the spine, both
    // boards showing under the pages, ribbon under the spine
    G = spread({ sx: 9, L: [0, 0, 1, 1, 2], R: [1, 2] });
    G.put(9, 11, 'r');
    if (flutter === 1) add(G, [[3, 2], [4, 2], [5, 3]]);
    if (flutter === 2) add(G, [[9, 4], [9, 3], [9, 2], [10, 2], [10, 1]]);
  }
  return G.rows();
}

// quill (write variant, r6): 7x7, one long 45-degree silhouette (a 2-texel cream feather stroke, no shaft colour) that
// pokes out above the book's far edge, nib = one dark texel at the bottom-left (0, 6). r5 had a 6x7 quill with a gold
// shaft over ink lines: a dark scribble at 1x (critic, Dov's red cap); an upright r6 draft read as a standing page.
const QUILL = ['.....ww', '....ww.', '...ww..', '..ww...', '.ww....', '.w.....', 'n......'];
/** Quill offsets per write drawing (relative to the view's writing spot): the nib moves 1 px per frame, side to side. */
export const WRITE_PATH = [[-1, 0], [0, 0], [1, 0], [0, 0]];
const WRITE_SPOT = { down: [5, 7], 'down-right': [5, 7], right: [6, 7], 'up-right': [5, 7], up: [5, 7] };   // nib on the page
// r2: every open view shows the pages, so the quill is always drawn on top of the book
const QUILL_BEHIND = { down: false, 'down-right': false, right: false, 'up-right': false, up: false };

/** Compose a frame: book mask (+ optional quill) into a 16x16 cell. */
function cell(bookRows, M, { flipX = false, quill = null, behind = false } = {}) {
  const out = new PixelImage(CELL, CELL);
  const book = renderBookMask(bookRows, M, { flipX });
  if (quill) {
    // quill = nib position in (unflipped) mask coords; the rendered quill has its nib at local (1, q.h - 2)
    const q = renderBookMask(QUILL, M, { flipX });
    const [qx, qy] = quill;
    const x = flipX ? (MW - 1 - qx) + 1 - (q.w - 2) : qx, y = qy + 1 - (q.h - 2);
    const draw = () => out.blit(q, x, y);
    if (behind) { draw(); out.blit(book, 0, 0); } else { out.blit(book, 0, 0); draw(); }
  } else out.blit(book, 0, 0);
  return out;
}

/**
 * The page under the quill (r6): the open spread with its ink scribbles removed (clean cream pages read as "a book" at
 * 1x even under the quill) and only one 2-texel ink dash: the words just written, left of the nib's path.
 */
function writePage(rows, wx, wy) {
  const R = rows.map((r) => r.replace(/i/g, 'b').split(''));
  let n = 0;
  for (let x = wx + WRITE_PATH.reduce((m, [dx]) => Math.min(m, dx), 0) - 1; x >= 0 && n < 2; x--) if (R[wy]?.[x] === 'b') { R[wy][x] = 'i'; n++; }
  return R.map((r) => r.join(''));
}

export const PHASES = { open: 4, hold: 3, close: 3, write: 4 };
/**
 * All book frames for one token set: [[name, PixelImage], ...] in atlas order (dir-major, v2 point dir order).
 * prefix 'book' (alive) or 'bookghost' (ghost recolour).
 */
export function buildBookFrames(T, { ghost = false } = {}) {
  const M = bookMats(T, ghost), pre = ghost ? 'bookghost' : 'book', out = [];
  for (const dir of DIRS) {
    const view = MIRROR[dir] || dir, flipX = !!MIRROR[dir];
    const closed = closedMask(view), half = openMask(view, 'half'), open = openMask(view, 'open');
    const f1 = openMask(view, 'open', 1), f2 = openMask(view, 'open', 2), pop = erodeMask(closed);
    const c = (rows, o = {}) => cell(rows, M, { flipX, ...o });
    out.push([`${pre}_${dir}_open_0`, c(pop)], [`${pre}_${dir}_open_1`, c(closed)], [`${pre}_${dir}_open_2`, c(half)], [`${pre}_${dir}_open_3`, c(open)]);
    out.push([`${pre}_${dir}_hold_0`, c(open)], [`${pre}_${dir}_hold_1`, c(f1)], [`${pre}_${dir}_hold_2`, c(f2)]);
    out.push([`${pre}_${dir}_close_0`, c(half)], [`${pre}_${dir}_close_1`, c(closed)], [`${pre}_${dir}_close_2`, c(pop)]);
    const [wx, wy] = WRITE_SPOT[view], clean = writePage(open, wx, wy);
    WRITE_PATH.forEach(([dx, dy], f) => out.push([`${pre}_${dir}_write_${f}`, c(clean, { quill: [wx + dx, wy + dy], behind: QUILL_BEHIND[view] })]));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ (A) notes page
export const PAGE = {
  pitch: 10,          // ruled line pitch = text line advance (body cap 6 + desc 2 + 2)
  ins: { l: 14, t: 3, r: 7, b: 5 },   // page 9-slice insets (binding strip + margin on the left, scrollbar room right)
  textX: 16,          // text x from the page's left edge (2 px right of the margin rule)
  textY: 4,           // first cap top from the page's top edge
  ruleDy: 8,          // rule row below a line's cap top (just under the descenders)
};
/** Notes page palette (tokens or ramps of tokens). */
export function pageMats(T) {
  const line = ramp(T.parchment, { line: 0.5 }).line;
  return {
    line, fill: T.parchment, hi: T.parchmentHi, sh: T.parchmentSh, rule: ramp(T.parchment, { dark: 0.07 }).sh,
    margin: ramp(T.evil).hi, ink: T.textInk, hint: T.parchmentLine, sel: T.goldHi, selEdge: T.gold,
    hole: T.inkSunk, holeLit: T.parchmentSh, saved: ramp(T.ok, { line: 0.42 }).line, warn: ramp(T.warn, { line: 0.4 }).line,
    count: T.parchmentLine, thumb: ramp(T.parchmentSh, { dark: 0.1 }).sh, thumbHi: T.parchmentSh, track: ramp(T.parchment, { dark: 0.04 }).sh,
  };
}
/**
 * The page plate (any size): outer line, lit top/left + shaded bottom/right edge ring, parchment fill, 1-px drop shadow,
 * the binding strip (punched holes every PAGE.pitch texels, the panel showing through) and the rose margin rule.
 * holeY0 = phase of the holes (0 in the panel: r6 fixes the holes to the page frame like the DOM border-image; only the
 * rules and the text scroll).
 */
export function pagePlate(w, h, T, { holeY0 = 0, holes = true } = {}) {
  const C = pageMats(T), img = new PixelImage(w, h), ph = h - 1;
  for (let y = 0; y < ph; y++) for (let x = 0; x < w; x++) {
    if ((x === 0 || x === w - 1) && (y === 0 || y === ph - 1)) continue;     // 1-px notch corners
    const edge = x === 0 || y === 0 || x === w - 1 || y === ph - 1;
    img.set(x, y, edge ? C.line : y === 1 || x === 1 ? C.hi : y === ph - 2 || x === w - 2 ? C.sh : C.fill);
  }
  for (let x = 1; x < w; x++) img.set(x, ph, T.shadow);
  for (let y = 2; y < ph - 2; y++) img.set(PAGE.ins.l - 2, y, C.margin);      // margin rule
  if (holes) for (let y = 2 + (((holeY0 % PAGE.pitch) + PAGE.pitch) % PAGE.pitch); y + 5 < ph - 2; y += PAGE.pitch) {
    // 3x2 punched hole: panel ink inside, shadowed upper-left rim, lit lower-right rim
    for (let i = 0; i < 3; i++) { img.set(4 + i, y + 3, C.hole); img.set(4 + i, y + 4, C.hole); img.set(4 + i, y + 2, C.line); img.set(4 + i, y + 5, C.hi); }
    img.set(3, y + 3, C.line); img.set(3, y + 4, C.line); img.set(7, y + 3, C.holeLit); img.set(7, y + 4, C.holeLit);
  }
  return img;
}
/** Rule tile for the DOM textarea background (8 x pitch, rule on row ruleDy + textY offset baked to row pitch-2). */
export function ruleTile(T) { const C = pageMats(T), im = new PixelImage(8, PAGE.pitch); im.hline(0, PAGE.pitch - 2, 8, C.rule); return im; }
/** 9x9 page-tab glyphs: 'seats' (three rows: head dot + line) and 'notes' (a quill). */
export function tabGlyph(name, T, on) {
  const im = new PixelImage(9, 9), c = on ? T.gold : T.textDim, d = on ? T.goldSh : T.iron;
  if (name === 'seats') {
    for (const y of [0, 3, 6]) { im.rect(1, y, 2, 2, c); im.hline(4, y, 4, c); im.hline(4, y + 1, 3, d); }
  } else {
    // a quill: feather widening toward the upper right, shaft, dark nib at the lower left (r2: a line over two rules
    // read as 'Z', shots/ui-notebook/r3/z/head-notes.png)
    const rows = ['.......cc', '.....cccc', '....cccc.', '...cccd..', '...ccd...', '..ccd....', '..cd.....', '.dd......', 'd........'];
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'c') im.set(x, y, c); else if (ch === 'd') im.set(x, y, d); }));
  }
  return im;
}

/** Page plates + pieces for the bake (names: notes-*), and the CSS skin's sources. */
export function pageFrames(T) {
  const C = pageMats(T), out = [];
  // 9-slice: PAGE.ins, middle = ONE hole period (r6: a 2-period middle left half-tile gaps at odd row counts under
  // border-image 'space', shots/ui-notebook/r6/dom-css.png tiles 5, 6a, 3), so any 8 + 10 n height tiles whole holes
  out.push(['notes-page', pagePlate(32, PAGE.ins.t + PAGE.pitch + PAGE.ins.b, T)]);
  out.push(['notes-rule', ruleTile(T)]);
  out.push(['notes-caret', (() => { const im = new PixelImage(1, 8); im.vline(0, 0, 8, C.ink); return im; })()]);
  out.push(['notes-sel', (() => { const im = new PixelImage(4, PAGE.pitch - 1); im.rect(0, 0, 4, PAGE.pitch - 1, C.sel); im.hline(0, PAGE.pitch - 2, 4, C.selEdge); return im; })()]);
  out.push(['notes-scroll-track', (() => { const im = new PixelImage(3, 8); im.rect(0, 0, 3, 8, C.track); im.vline(0, 0, 8, C.sh); return im; })()]);
  out.push(['notes-scroll-thumb', scrollThumb(T, 12)]);
  for (const n of ['seats', 'notes']) { out.push([`tab-glyph-${n}`, tabGlyph(n, T, false)]); out.push([`tab-glyph-${n}-on`, tabGlyph(n, T, true)]); }
  out.push(['notes-quill', emptyQuill(T)]);
  for (const s of ['saved', 'saving', 'offline', 'full']) out.push([`notes-status-${s}`, statusChip(s, T, { count: '' })]);
  return out;
}
export function scrollThumb(T, h) {
  const C = pageMats(T), im = new PixelImage(3, h);
  im.rect(0, 0, 3, h, C.thumb); im.vline(0, 1, h - 2, C.thumbHi); im.set(1, 0, C.line); im.set(1, h - 1, C.line);
  im.set(0, 0, C.line); im.set(2, 0, C.line); im.set(0, h - 1, C.line); im.set(2, h - 1, C.line);
  return im;
}
/** 13x13 empty-state illustration: an inked quill over a dotted line. */
export function emptyQuill(T) {
  const M = bookMats(T);
  const rows = ['..........ww', '.........wwv', '........wwv.', '.......wwv..', '......wwv...', '.....wwv....', '....wwv.....', '....wv......', '...v........', '..n.........'];
  const q = renderBookMask(rows, M);
  const im = new PixelImage(q.w, q.h + 2);
  im.blit(q, 0, 0);
  for (let x = 0; x < im.w; x += 2) im.set(x, im.h - 1, pageMats(T).hint);
  return im;
}
const STATUS = { saved: ['✓ SAVED', 'saved'], saving: ['SAVING…', 'count'], offline: ['OFFLINE', 'warn'], full: ['FULL', 'warn'] };
/** Status line (LABEL caps) drawn straight on the page: '✓ SAVED' (ok line), 'SAVING…', 'OFFLINE · saves later', '85% FULL'. */
export function statusChip(state, T, { count = '' } = {}) {
  const C = pageMats(T), [s, col] = STATUS[state];
  const text = state === 'full' ? `${count || '85%'} FULL` : s;
  const w = Math.max(1, textWidth(text.replace('✓ ', ''), LABEL) + (text.startsWith('✓') ? 7 : 0));
  const im = new PixelImage(w, 7);
  let x = 0;
  if (text.startsWith('✓')) { for (const [cx, cy] of [[0, 3], [1, 4], [2, 3], [3, 2], [4, 1]]) im.set(cx, cy, C[col]); x = 7; }
  drawText(im, x, 1, text.replace('✓ ', ''), { font: LABEL, color: C[col] });
  return im;
}

/** nineSlice of the page plate (cached per token set) for drawing any size. */
const _nine = new Map();
export function pageNine(T) {
  if (!_nine.has(T)) _nine.set(T, nineSlice(pagePlate(32, PAGE.ins.t + PAGE.pitch + PAGE.ins.b, T), PAGE.ins));
  return _nine.get(T);
}
