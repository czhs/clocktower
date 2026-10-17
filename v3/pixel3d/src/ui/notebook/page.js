// Notebook Notes page (owner: notebook group; docs/UI.md row 41b). The free-text page of the notebook panel, drawn on
// the screen tier from the panel kit + the notebook page art: a lined parchment sheet (punched binding holes, rose
// margin; the holes are fixed to the page frame, the rules every 10 texels scroll WITH the text), the body pixel font in textInk, an ink caret, a gold
// highlighter selection, a parchment scrollbar, the empty-state hint + quill, and a status line (✓ SAVED / SAVING… /
// OFFLINE + "214 / 8000", or "85% FULL" past 80 %). Plus the page tabs (Seats | Notes) that the panels' notebook draws
// in its header. Pure functions of (image, kit K, rect, state, t).
//
//   drawPageTabs(img, K, x, y, active)          -> { x, w } of the tab strip (two 14x13 glyph tabs + strip)
//   drawNotesPage(img, K, r, { text, caret, sel, scroll, status, max, t, focus, reduced })
//   notesScript(t, base?)                        -> the mock HUD's typing loop (text, caret, status, typing)
import { PixelImage, drawText, textWidth, GRID_HZ } from '../kit.js';
import { LABEL } from '../hud/font.js';
import { PAGE, pageMats, pagePlate, scrollThumb, statusChip, emptyQuill, tabGlyph } from './art.js';
import { TIMING } from './draw.js';

const gk = (t) => Math.floor(t * GRID_HZ + 0.01);
export const TEXT_MAX = 8000;                       // v2 NOTEBOOK_TEXT_MAX
export const HINT = 'Anything — who claimed what, how people voted, your theory…';   // v2 placeholder

// ------------------------------------------------------------------------------------------------ tabs
export const TAB_W = 14;
/**
 * Two glyph tabs (Seats | Notes) standing on a 2-row strip at y + 13 / y + 14 (the panels' divider rows). x = left edge
 * of the tab pair. The strip itself is drawn by the caller over the full width (stripTo); the active tab breaks it.
 */
export function drawPageTabs(img, K, x, y, active, { stripFrom = null, stripTo = null } = {}) {
  const T = K.T, names = ['seats', 'notes'];
  names.forEach((n, i) => {
    const on = (active === 'notes') === (i === 1), tx = x + i * (TAB_W + 1);
    if (on) K.nine['tab-active'](img, tx, y, TAB_W, 13); else K.nine.tab(img, tx, y + 1, TAB_W, 12);
    img.blit(tabGlyph(n, T, on), tx + 3, y + (on ? 3 : 3));
  });
  if (stripFrom !== null) {
    const ax = x + (active === 'notes' ? TAB_W + 1 : 0);
    for (let i = stripFrom; i < stripTo; i++) {
      if (i > ax && i < ax + TAB_W - 1) continue;
      img.set(i, y + 13, T.ironSh); img.set(i, y + 14, T.ironHi);
    }
  }
  return { x, w: 2 * TAB_W + 1 };
}

/** The Notes page rect inside the notebook panel rect r (under the header rule; the panels' notebook uses it). */
export const notesRect = (r) => ({ x: r.x + 4, y: r.y + 19, w: r.w - 8, h: r.h - 23 });

// ------------------------------------------------------------------------------------------------ wrapping
/** Greedy word wrap that keeps character indices: [{ s, a (start index), b (end index, exclusive) }]. */
export function wrapIdx(text, maxW) {
  const out = [];
  let i = 0;
  for (const para of text.split('\n')) {
    const a0 = i;
    if (!para.length) { out.push({ s: '', a: a0, b: a0 }); i += 1; continue; }
    let start = 0;
    while (start < para.length) {
      let end = start, lastBreak = -1;
      while (end < para.length && textWidth(para.slice(start, end + 1)) <= maxW) { if (para[end] === ' ') lastBreak = end; end++; }
      if (end < para.length && lastBreak > start) end = lastBreak + 1;      // break after the space
      if (end === start) end = start + 1;
      out.push({ s: para.slice(start, end).replace(/ $/, ''), a: a0 + start, b: a0 + end });
      start = end;
    }
    i += para.length + 1;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the page
/**
 * Draw the Notes page into rect r (screen px). o: text, caret (char index | null; default end when focused), sel [a, b],
 * scroll (px), status 'saved'|'saving'|'offline', max (TEXT_MAX), t, focus (default true), blink (default true),
 * reduced (no blink). Returns layout info { lines, rows, area }.
 */
export function drawNotesPage(img, K, r, o = {}) {
  const T = K.T, C = pageMats(T), t = o.t ?? 0, text = o.text ?? '', focus = o.focus !== false;
  const scroll = Math.max(0, Math.round(o.scroll ?? 0));
  // r6: the binding holes belong to the page FRAME (the DOM port draws them in the border-image, which cannot scroll);
  // only the rules and the text scroll (background-attachment: local), so the mock matches the port
  img.blit(pagePlate(r.w, r.h, T), r.x, r.y);
  // writing area (clipped): from the margin to the scrollbar, above the footer
  const foot = 11, ax = r.x + PAGE.ins.l - 1, ay = r.y + 2, aw = r.w - PAGE.ins.l - 4, ah = r.h - 3 - foot - 2;
  const area = new PixelImage(aw, ah);
  const tx = PAGE.textX - PAGE.ins.l + 1;          // text x inside the area
  const lines = wrapIdx(text, aw - tx - 5);
  const rowY = (k) => PAGE.textY - 2 + k * PAGE.pitch - scroll;
  // rules (every pitch, also below the last line, scrolling with the text)
  for (let k = 0, y; (y = rowY(k) + PAGE.ruleDy) < ah + PAGE.pitch * 2; k++) if (y >= 0 && y < ah) area.hline(1, y, aw - 1, C.rule);
  const empty = !text.length;
  if (empty) {
    // hint: v2 placeholder, wrapped, in the dim page ink; quill illustration under it
    const hl = wrapIdx(HINT, aw - tx - 5);
    hl.forEach((l, k) => drawText(area, tx, rowY(k), l.s, { color: C.hint }));
    const q = emptyQuill(T);
    area.blit(q, Math.floor((aw - q.w) / 2), rowY(hl.length) + 6);
  }
  // selection (gold highlighter behind the glyphs, gold underline)
  const sel = o.sel && o.sel[1] > o.sel[0] ? o.sel : null;
  const xOf = (l, ci) => tx + (ci <= l.a ? 0 : textWidth(text.slice(l.a, Math.min(ci, l.a + l.s.length))) + 1);
  lines.forEach((l, k) => {
    const y = rowY(k);
    if (y < -PAGE.pitch || y > ah) return;
    if (sel && sel[0] < l.b && sel[1] > l.a) {
      const x0 = xOf(l, Math.max(sel[0], l.a)) - 1, x1 = sel[1] >= l.a + l.s.length ? tx + textWidth(l.s) + 1 : xOf(l, sel[1]) - 1;
      area.rect(x0, y - 1, Math.max(1, x1 - x0), PAGE.pitch - 1, C.sel); area.hline(x0, y + PAGE.pitch - 3, Math.max(1, x1 - x0), C.selEdge);
    }
    drawText(area, tx, y, l.s, { color: C.ink });
  });
  // caret (blinks 16 on / 16 off grid frames like the panels caret; solid while typing)
  const ci = o.caret === undefined ? (focus ? text.length : null) : o.caret;
  if (ci !== null && focus && !sel) {
    let k = 0;
    lines.forEach((l, j) => { if (l.a <= ci) k = j; });               // the last line starting at or before the caret
    const l = lines[k] || { s: '', a: 0, b: 0 };
    const on = o.typing || o.reduced || o.blink === false || gk(t) % 32 < 16;
    const x = empty ? tx : tx + (ci <= l.a ? 0 : textWidth(text.slice(l.a, ci)) + 1);
    if (on) area.vline(x, rowY(empty ? 0 : k) - 1, 8, C.ink);
  }
  img.blit(area, ax, ay);
  // scrollbar (only when the text overflows)
  const contentH = PAGE.textY + lines.length * PAGE.pitch;
  if (contentH > ah) {
    const sx = r.x + r.w - 6, sy = ay + 1, sh = ah - 2;
    img.rect(sx, sy, 3, sh, C.track); img.vline(sx, sy, sh, C.sh);
    const th = Math.max(6, Math.round(sh * ah / contentH)), tyy = sy + Math.round((sh - th) * Math.min(1, scroll / Math.max(1, contentH - ah)));
    img.blit(scrollThumb(T, th), sx, tyy);
  }
  // footer: rule + status left + count right
  const fy = r.y + r.h - 3 - foot;
  img.hline(r.x + PAGE.ins.l - 1, fy, r.w - PAGE.ins.l - 1, C.sh);
  const full = text.length / (o.max ?? TEXT_MAX);
  const st = full > 0.8 ? 'full' : o.status ?? 'saved';
  const chip = statusChip(st, T, { count: `${Math.min(100, Math.round(full * 100))}%` });
  img.blit(chip, r.x + PAGE.textX, fy + 3);
  const cnt = `${text.length} / ${o.max ?? TEXT_MAX}`;
  drawText(img, r.x + r.w - 7, fy + 4, cnt, { font: LABEL, color: C.count, align: 'right' });
  return { lines, area: { x: ax, y: ay, w: aw, h: ah }, contentH };
}

// ------------------------------------------------------------------------------------------------ mock typing loop
export const NOTES_BASE = 'N1: Bram — Chef, 1 pair.\nCleo claims Monk; saved Dov?\nAda pointed at Cleo twice.\n\nTheory: Finn + Gus evil.';
export const NOTES_TYPED = ' Gus voted no on Esme.';
export const NOTES_LOOP = 8;          // s
const TYPE_AT = 1.0, CHAR_FRAMES = 3; // one character per 3 grid frames (10 chars/s)
/**
 * The mock HUD's typing loop (whole grid frames, period NOTES_LOOP): the player types NOTES_TYPED after NOTES_BASE
 * from 1.0 s, then stops. typing = an input event in the last WRITE_HOLD_MS (the book's quill variant); status =
 * 'saving' until SAVE_DEBOUNCE_MS after the last key (+ 2 grid frames of round trip), then 'saved'.
 */
export function notesScript(t, { base = NOTES_BASE, typed = NOTES_TYPED, loop = NOTES_LOOP } = {}) {
  const L = Math.round(loop * GRID_HZ), g = ((gk(t) % L) + L) % L, g0 = Math.round(TYPE_AT * GRID_HZ);
  const n = g < g0 ? 0 : Math.min(typed.length, Math.floor((g - g0) / CHAR_FRAMES) + 1);
  const lastKey = n ? g0 + (n - 1) * CHAR_FRAMES : -Infinity;
  const since = (g - lastKey) / GRID_HZ;
  const typing = n > 0 && since * 1000 < TIMING.WRITE_HOLD_MS;
  const saving = n > 0 && since * 1000 < TIMING.SAVE_DEBOUNCE_MS + 2000 / GRID_HZ;
  return { text: base + typed.slice(0, n), typing, status: saving ? 'saving' : 'saved', n };
}
