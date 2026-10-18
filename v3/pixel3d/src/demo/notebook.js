// The player's notebook (owner: ui; docs/DEMO.md §4.7). A real DOM panel in the new UI library's skin:
//   out/ui/panels.css (the ctp-panel 9-slice, buttons, tabs) + out/ui/notebook.css (the lined Notes page: a native
//   <textarea class="ctn-text">, its height snapped to whole rule rows, docs/UI.md §5 "Notebook").
//
//   createNotebook(demo, { avatarURL(id), people() }) -> nb = { el, isOpen, page, open(page?), close(), toggle(),
//        setPage(p), typing(now), openAt, closeAt, info(), dispose() }
//   Pages (role="tablist", .ctn-tab-seats / .ctn-tab-notes): Seats = the townsfolk in sight (you + the NPCs) with their
//   portrait, three marks (★ trust, ? unsure, ✗ suspect) and a one-line note; Notes = the free-text page.
//   Persistence: each page in its own localStorage key ('hollowmere-notebook:notes', 'hollowmere-notebook:seats'),
//   every access in try/catch: a private window / blocked storage only loses the persistence, never the panel.
//   Saving is debounced (TIMING.SAVE_DEBOUNCE_MS 900 ms: "Saving…" -> "✓ Saved", as the v2 notebook controller).
//   The reader state for the in-world book (gameui.js): openAt / closeAt in DEMO seconds (the engine clock) and
//   typing(now) = an input event in the last WRITE_HOLD_MS (1.5 s): the book shows the quill.
// Keys: J toggles (bound by gameui.js through demo.input; N is the clock's next time of day); Esc in the panel closes it. Keys typed into the textarea /
// inputs never reach the game (api.js createInput ignores form fields). User text only through .value / textContent.
import { TIMING } from '../ui/notebook/draw.js';
import { TEXT_MAX, HINT } from '../ui/notebook/page.js';

const KEY = 'hollowmere-notebook';
const load = (k, d) => { try { const v = localStorage.getItem(`${KEY}:${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(`${KEY}:${k}`, JSON.stringify(v)); return true; } catch { return false; } };
export const MARKS = [['trust', '★', 'trust'], ['unsure', '?', 'unsure'], ['suspect', '✗', 'suspect']];

const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
};

export function createNotebook(demo, { avatarURL = () => null, people = () => [], hd = false, hdpx = () => 1 } = {}) {
  const engine = demo.engine;
  const now = () => engine.time ?? 0;
  const root = document.getElementById('demo-ui') ?? document.body;
  const state = { open: false, page: load('page', 'seats') === 'notes' ? 'notes' : 'seats', openAt: null, closeAt: null, lastInput: -1e9,
    saved: true, saveTimer: null, storage: save('probe', 1) };
  let notes = String(load('notes', '') ?? '').slice(0, TEXT_MAX);
  const seats = (() => { const v = load('seats', {}); return v && typeof v === 'object' ? v : {}; })();

  // ---- shell
  const tabSeats = h('button', { type: 'button', role: 'tab', class: 'ctn-tab ctn-tab-seats', 'aria-label': 'Seats', title: 'Seats' });
  const tabNotes = h('button', { type: 'button', role: 'tab', class: 'ctn-tab ctn-tab-notes', 'aria-label': 'Notes', title: 'Notes' });
  const status = h('span', { class: 'dnb-status', 'aria-live': 'polite' });
  const closeBtn = h('button', { type: 'button', class: 'dnb-close', title: 'close (J / Esc)', 'aria-label': 'close the notebook' }, h('span', { class: 'ctp-glyph-close' }));
  const rows = h('div', { class: 'dnb-rows' });
  const seatsPage = h('div', { class: 'dnb-page dnb-seats', role: 'tabpanel', 'aria-label': 'Seats' }, rows,
    h('p', { class: 'dnb-foot' }, 'Marks and notes stay in this browser.'));
  const text = h('textarea', { class: 'ctn-text', spellcheck: 'false', maxlength: String(TEXT_MAX), placeholder: HINT, 'aria-label': 'notes' });
  text.value = notes;
  const notesPage = h('div', { class: 'dnb-page dnb-notes', role: 'tabpanel', 'aria-label': 'Notes' }, text);
  // (density, docs/DEMO.md §4.7 "Density") hd: the page in the D=2 pixel face (.ctn-pixelfont-hd, line = 20 HD px at
  // --hdpx) and the notebook's own text (status, names, marks, notes, foot) in it too (.dnb-hd: ui.css, 16 px = 1 glyph px)
  const el = h('div', { class: `dnb ctn ${hd ? 'ctn-pixelfont-hd dnb-hd' : 'ctn-pixelfont'} ctp-panel ctp-skin`, role: 'dialog', 'aria-label': 'Notebook', hidden: '' },
    h('div', { class: 'dnb-head' }, h('span', { class: 'ctp-glyph-notebook' }), h('span', { class: 'dnb-title' }, 'Notebook'), status,
      h('div', { class: 'ctn-tabs', role: 'tablist', 'aria-label': 'notebook pages' }, tabSeats, tabNotes), closeBtn),
    seatsPage, notesPage);
  root.append(el);
  const px = () => Math.max(1, Math.round(engine.pixelScale || 2));

  // ---- saving
  const paintStatus = () => {
    status.textContent = !state.storage ? 'not saved (storage off)' : state.saved ? '✓ Saved' : 'Saving…';
    status.className = `dnb-status ${state.saved && state.storage ? 'ctn-status-saved' : ''}`;
  };
  const queueSave = (what) => {
    state.saved = false; paintStatus();
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      state.storage = what === 'notes' ? save('notes', notes) : save('seats', seats);
      state.saved = true; paintStatus();
    }, TIMING.SAVE_DEBOUNCE_MS);
  };
  text.addEventListener('input', () => { notes = text.value.slice(0, TEXT_MAX); state.lastInput = now(); queueSave('notes'); });

  // ---- seats page: one row per person in sight (rebuilt when the set changes)
  let shownKey = '';
  const buildRows = () => {
    const list = people();
    const key = list.map((p) => `${p.key}:${p.id}`).join('|');
    if (key === shownKey) return;
    shownKey = key;
    rows.replaceChildren(...list.map((p) => {
      const rec = (seats[p.id] ??= { mark: null, note: '' });
      const src = avatarURL(p.id);
      const pic = h('span', { class: 'ctn-portrait dnb-pic' }, src ? h('img', { src, alt: '' }) : String(p.name || p.id)[0].toUpperCase());
      const marks = MARKS.map(([k, g, label]) => {
        // (density: the D=2 face has no ✗; its × reads small at 16 px: a capital X)
        const b = h('button', { type: 'button', class: `dnb-mark m-${k}`, title: label, 'aria-label': `${p.name}: ${label}`, 'aria-pressed': rec.mark === k ? 'true' : 'false' }, hd && g === '✗' ? 'X' : g);
        b.addEventListener('click', () => { rec.mark = rec.mark === k ? null : k; for (const o of marks) o.setAttribute('aria-pressed', o === b && rec.mark === k ? 'true' : 'false'); queueSave('seats'); b.blur(); });
        return b;
      });
      const note = h('input', { type: 'text', class: 'dnb-note', maxlength: '60', placeholder: 'note…', 'aria-label': `note on ${p.name}` });
      note.value = rec.note || '';
      note.addEventListener('input', () => { rec.note = note.value.slice(0, 60); state.lastInput = now(); queueSave('seats'); });
      return h('div', { class: `ctn-seat dnb-row${p.you ? ' you' : ''}`, dataset: { id: p.id } }, pic,
        h('span', { class: 'dnb-name' }, p.name, p.you ? h('small', {}, ' you') : null), h('span', { class: 'dnb-marks' }, marks), note);
    }));
  };

  // ---- the page skin pinned inline. panels.css's generic `textarea:hover` / `textarea:focus-visible` field skins
  // out-rank notebook.css's `.ctn-text` page while the cursor is over it or it has focus (higher specificity), which
  // turned the lined page into an ink input field. The page look is read from a never-hovered, never-focused twin
  // (same classes, hidden) and set as inline style, which no selector overrides. Re-read on open / resize (the --px).
  const PAGE_PROPS = ['border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-style', 'border-color',
    'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-attachment',
    'background-clip', 'color', 'caret-color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'line-height',
    'font-family', 'font-size', 'outline-style', 'box-shadow'];
  const twin = h('textarea', { class: 'ctn-text', tabindex: '-1', 'aria-hidden': 'true' });
  // (density / wave 2) the twin lives OUTSIDE #demo-ui: the HD panel skin (.ctp-hd scope on #demo-ui, src/ui/hd/panels.js)
  // has a generic `.ctp-hd textarea` input skin that out-ranks the page's `.ctn-text`; the twin carries the page
  // classes itself (.ctn + the pixel-font class) so the notebook.css / hd css.js page rules still match it
  const twinBox = h('div', { class: `dnb-twin ctn ${hd ? 'ctn-pixelfont-hd' : 'ctn-pixelfont'}` }, twin);
  twinBox.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
  document.body.append(twinBox);
  const pinPage = () => {
    const cs = getComputedStyle(twin);
    if (!cs.getPropertyValue('border-image-source') || cs.getPropertyValue('border-image-source') === 'none') return false;   // sheet not loaded yet
    for (const k of PAGE_PROPS) text.style.setProperty(k, cs.getPropertyValue(k));
    return true;
  };

  // ---- layout: the textarea height snapped to whole rule rows (notebook.css: border box = (8 + 10 n) texels)
  let rowsShown = null;
  const fit = () => {
    el.style.setProperty('--px', String(px()));
    // a phone (< 700 px wide, ui.css): the panel is capped at 40 % of the height (the reader stays in view below it)
    const narrow = innerWidth < 700;
    const avail = narrow ? Math.max(60, innerHeight * 0.4 - 64) : Math.max(120, innerHeight - 16 - 130);
    if (hd) {
      // (density) the HD page's line is 20 HD px = 20 x --hdpx CSS px (at 1080p 'round': 40 px, not the 30-px rule of
      // the --px frame): whole HD lines, the frame's --ctn-rows set so its height = 8 texels + n HD lines exactly
      const lh = 20 * Math.max(1, hdpx()), n = Math.max(narrow ? 3 : 6, Math.min(18, Math.floor((avail - 8 * px()) / lh)));
      text.style.setProperty('--ctn-rows', String((n * lh) / (10 * px())));
      rowsShown = n;
    } else {
      const rowsN = Math.max(narrow ? 3 : 6, Math.min(18, Math.floor((avail / px() - 8) / 10)));
      text.style.setProperty('--ctn-rows', String(rowsN));
      rowsShown = rowsN;
    }
    pinPage();
  };

  const setPage = (p) => {
    state.page = p === 'notes' ? 'notes' : 'seats';
    save('page', state.page);
    tabSeats.setAttribute('aria-selected', state.page === 'seats' ? 'true' : 'false');
    tabNotes.setAttribute('aria-selected', state.page === 'notes' ? 'true' : 'false');
    seatsPage.hidden = state.page !== 'seats';
    notesPage.hidden = state.page !== 'notes';
    if (state.page === 'seats') buildRows();
    if (state.open && state.page === 'notes') queueMicrotask(() => text.focus({ preventScroll: true }));
  };
  tabSeats.addEventListener('click', () => { setPage('seats'); tabSeats.blur(); });
  tabNotes.addEventListener('click', () => setPage('notes'));
  const open = (page) => {
    if (page) setPage(page);
    if (state.open) return;
    state.open = true; state.openAt = now(); state.closeAt = null;
    fit(); buildRows();
    el.hidden = false;
    setPage(state.page);
    demo.events?.emit?.('notebook', { open: true, page: state.page });
  };
  const close = () => {
    if (!state.open) return;
    state.open = false; state.closeAt = now();
    if (el.contains(document.activeElement)) document.activeElement.blur();
    el.hidden = true;
    demo.events?.emit?.('notebook', { open: false, page: state.page });
  };
  closeBtn.addEventListener('click', close);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  // buttons inside the panel never keep focus (Space / letters belong to the game), the text fields do
  el.addEventListener('mousedown', (e) => { if (e.target.closest?.('button')) e.preventDefault(); });
  addEventListener('resize', fit);
  setPage(state.page);
  paintStatus();

  const nb = {
    el,
    get isOpen() { return state.open; },
    get page() { return state.page; },
    get openAt() { return state.openAt; },
    get closeAt() { return state.closeAt; },
    /** An input event in the last WRITE_HOLD_MS (the book shows the quill). */
    typing: (t = now()) => state.open && t - state.lastInput < TIMING.WRITE_HOLD_MS / 1000,
    open, close, setPage,
    toggle(page) { if (state.open && (!page || page === state.page)) close(); else open(page); },
    /** Re-list the Seats page (the townsfolk changed). */
    refresh() { if (state.open && state.page === 'seats') buildRows(); },
    get text() { return text; },
    info: () => ({ open: state.open, page: state.page, openAt: state.openAt, closeAt: state.closeAt, typing: nb.typing(), chars: notes.length,
      saved: state.saved, storage: state.storage, rows: rows.children.length, textRows: rowsShown, hd }),
    dispose() { clearTimeout(state.saveTimer); removeEventListener('resize', fit); el.remove(); twinBox.remove(); },
  };
  return nb;
}
