// Mock screens built ONLY from the panel kit (owner: panels group; docs/UI.md §4 "panels" mock screens). Each one is a
// pure function of (screen image, kit K, context, t): the v2 lobby / waiting room, notebook, Storyteller panel, endgame
// pamphlet, settings modal, plus the kit showcase and the scripted interaction demo. Screen tier (S), 640x360 coords.
// ctx = { P (portraits atlas or null), cast (hud.cast), st, t (UI clock, s), reduced, night }
import { drawText, textWidth, wrapText, PixelImage, dissolve, GRID_HZ } from '../kit.js';
import { button, tabs, input, select, slider, rowFrame, divider, title, countPill, CURSORS, LABEL, DISPLAY } from './art.js';
import { drawPageTabs, drawNotesPage, notesRect, TAB_W } from '../notebook/page.js';   // notebook group: Seats | Notes page switch

const gk = (t) => Math.floor(t * GRID_HZ + 0.01);   // whole grid frame of a time (0.01-frame tolerance, emotes learning)
export const variantOf = (m) => (m.dead ? 'dead' : m.ghostSpent ? 'ghost-spent' : m.ghost ? 'ghost' : 'alive');
const icon = (ctx, m) => (ctx.P && m ? ctx.P.icon(m.id, variantOf(m)) : null);

export function link(img, x, y, s, color) { drawText(img, x, y, s, { color }); img.hline(x, y + 7, textWidth(s), color); return textWidth(s); }
// small caps labels use the hud LABEL face (kit tiny + 5-wide M/W): the kit tiny M/W read as H (MONK -> HONK)
const tiny = (img, x, y, s, color, align = 'left') => drawText(img, x, y, s, { font: LABEL, color, align });
const body = (img, x, y, s, color, align = 'left') => drawText(img, x, y, s, { color, align });
export function cursor(img, K, name, x, y) { const c = CURSORS[name]; img.blit(K.img[name], x - c.hot[0], y - c.hot[1]); }
/** 12x12 icon in a 16x16 socket (falls back to an initial when the portraits atlas is absent). */
function well(img, K, ctx, m, x, y) {
  img.blit(K.img.well, x, y);
  const ic = icon(ctx, m);
  if (ic) img.blit(ic, x + 2, y + 2); else if (m) body(img, x + 8, y + 5, m.name[0], K.T.textDim, 'center');
}
function badgeRow(img, K, x, y, names) { for (const n of names) { img.blit(K.img[`badge-${n}`], x, y); x += K.img[`badge-${n}`].w + 2; } return x; }

// ------------------------------------------------------------------------------------------------ notebook (HUD slot)
/**
 * Notebook in the side-panel slot (132x158). Rows sit exactly where the portraits group draws its 12x12 icons
 * (pr.x + 7, pr.y + 25 + 26 i) so both modules agree. opts: { sel 1, hover 2, marks, caret, note, popAt }.
 */
export function notebook(img, K, r, ctx, o = {}) {
  const T = K.T, t = ctx.t;
  K.nine.panel(img, r.x, r.y, r.w, r.h);
  title(img, K, r.x + 8, r.y + 5, 'Notebook');
  // page switch (notebook group, src/ui/notebook/page.js): Seats | Notes glyph tabs standing on the header rule (they
  // draw the rule, the active tab breaks it); o.page = 'players' (default) | 'notes' (free text, o.notes = page state)
  const page = o.page === 'notes' ? 'notes' : 'players', tabX = r.x + r.w - 5 - (2 * TAB_W + 1);
  const sv = K.img['badge-saved'];
  if (o.saved !== false && page === 'players') img.blit(sv, tabX - 3 - sv.w, r.y + 4);
  drawPageTabs(img, K, tabX, r.y + 2, page, { stripFrom: r.x + 3, stripTo: r.x + r.w - 3 });
  if (page === 'notes') { drawNotesPage(img, K, notesRect(r), { t, reduced: ctx.reduced, ...(o.notes || {}) }); return; }
  const marks = o.marks || [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, 0, 0]];
  const names = ['star', 'maybe', 'no'];
  ctx.cast.slice(0, 4).forEach((m, i) => {
    const y = r.y + 19 + i * 26;
    rowFrame(img, K, r.x + 3, y, r.w - 6, 24, i === (o.sel ?? 1) ? 'selected' : i === (o.hover ?? 2) ? 'hover' : 'normal');
    well(img, K, ctx, m, r.x + 5, y + 4);
    body(img, r.x + 23, y + 4, m.name, m.you ? T.gold : T.text);
    tiny(img, r.x + 23, y + 14, `SEAT ${m.seat}`, T.textDim);
    // ★ ? ✗ marks: 11x11 cells; on = gold segment, the mark pops in (1 step smaller for 2 grid frames)
    let bx = r.x + r.w - 6 - 3 * 12;
    names.forEach((n, j) => {
      const on = marks[i][j];
      K.nine[on ? 'segment-on' : 'segment'](img, bx, y + 6, 11, 11);
      const g = K.img[`toggle_${n}`];
      const pop = on && o.popAt && o.popAt[0] === i && o.popAt[1] === j && !ctx.reduced && gk(t - o.popAt[2]) >= 0 && gk(t - o.popAt[2]) < 2;
      if (!on) img.blit(K.img[`toggle_${n}-off`], bx + 2, y + 8);
      else if (pop) img.blit(g.crop(1, 1, 5, 5), bx + 3, y + 9); else img.blit(g, bx + 2, y + 8);
      bx += 12;
    });
  });
  const sel = ctx.cast[o.sel ?? 1];
  const ny = r.y + 19 + 4 * 26 + 1;
  input(img, K, r.x + 4, ny, r.w - 8, o.note ?? `${sel ? sel.name : ''} claims Chef: 1`, { state: o.focus === false ? 'normal' : 'focus', caret: o.caret ?? ((gk(t) % 32) < 16) });
  select(img, K, r.x + 8, ny + 15, 66, 'Role? Chef');
  button(img, K, r.x + 77, ny + 15, r.w - 85, 'Clear', 'normal', { h: 13 });
}

// ------------------------------------------------------------------------------------------------ lobby / waiting room
export function lobby(img, K, ctx, o = {}) {
  const T = K.T, x = 6, y = 6, w = 252, h = 222;
  K.nine.panel(img, x, y, w, h);
  title(img, K, x + 9, y + 8, 'Hollowmere, night three');
  body(img, x + 9, y + 20, 'Trouble Brewing · 5/10 · host Teller', T.textDim);
  button(img, K, x + w - 50, y + 7, 41, 'Leave', o.hoverLeave ? 'hover' : 'normal');
  input(img, K, x + 9, y + 31, 180, '<public-host>/l/bxCx', { h: 15 });
  button(img, K, x + 192, y + 31, w - 201, 'Copy link', 'normal');
  // left column: Storyteller + players
  const lx = x + 9, lw = 150;
  title(img, K, lx, y + 51, 'Storyteller');
  rowFrame(img, K, lx, y + 62, lw, 18);
  if (ctx.st) { const ic = icon(ctx, ctx.st); if (ic) img.blit(ic, lx + 3, y + 65); }
  body(img, lx + 18, y + 67, 'Teller', T.st);
  badgeRow(img, K, lx + 18 + textWidth('Teller') + 4, y + 66, ['st', 'host']);
  title(img, K, lx, y + 85, 'Players');
  body(img, lx + textWidth('Players', DISPLAY) + 4, y + 88, '(5/10)', T.textDim);   // body cap 6 on the display baseline
  const st = ['ready', 'ready', 'notready', 'ready', 'ready', 'notready'];
  ctx.cast.slice(0, 5).forEach((m, i) => {
    const ry = y + 96 + i * 20;
    const hov = i === (o.hover ?? 2);
    rowFrame(img, K, lx, ry, lw, 18, hov ? 'hover' : 'normal');
    const ic = icon(ctx, m); if (ic) img.blit(ic, lx + 3, ry + 3);
    body(img, lx + 18, ry + 5, m.name, m.you ? T.gold : T.text);
    let bx = lx + 18 + textWidth(m.name) + 4;
    if (m.you) bx = badgeRow(img, K, bx, ry + 4, ['you']);
    if (!hov) badgeRow(img, K, bx, ry + 4, [st[i]]);
    else { link(img, lx + lw - 72, ry + 5, 'Make host', T.gold); link(img, lx + lw - 24, ry + 5, 'Kick', T.danger); }
  });
  // right column: actions
  const rx = x + 166, rw = w - 175;
  button(img, K, rx, y + 52, rw, 'Start game', o.startState || 'primary');
  button(img, K, rx, y + 70, rw, 'Give up seat', 'normal');
  button(img, K, rx, y + 88, rw, "I'm ready", 'selected');
  tiny(img, rx, y + 110, 'STORYTELLER', T.textDim);
  K.nine['segment-on'](img, rx, y + 117, 38, 13); body(img, rx + 19, y + 120, 'Human', T.goldHi, 'center');
  K.nine.segment(img, rx + 38, y + 117, rw - 38, 13); body(img, rx + 38 + Math.floor((rw - 38) / 2), y + 120, 'Auto', T.text, 'center');
  img.blit(K.img['checkbox-on'], rx, y + 136); body(img, rx + 12, y + 137, 'Voice chat', T.text);
  img.blit(K.img.checkbox, rx, y + 149); body(img, rx + 12, y + 150, 'Spectators', T.text);
  link(img, rx, y + 166, 'Lobby settings…', T.gold);
  link(img, rx, y + 180, 'Change look…', T.gold);
  // first-time tip strip (v2 .ct-waiting-newbie)
  K.nine['tip-strip'](img, x + 9, y + h - 23, w - 18, 15);
  img.blit(K.img.glyph_help, x + 12, y + h - 23);
  body(img, x + 30, y + h - 19, 'First time here?', T.text);
  link(img, x + 30 + textWidth('First time here?') + 4, y + h - 19, 'How to play', T.gold);
  // lobby chat dock (bottom left)
  const cy = 236, ch = 64;
  K.nine['panel-plain'](img, x, cy, 190, ch);
  tiny(img, x + 6, cy + 5, 'LOBBY CHAT', T.gold);
  button(img, K, x + 190 - 17, cy + 3, 13, '', 'normal', { h: 12 }); img.hline(x + 190 - 13, cy + 8, 5, T.text);
  divider(img, K, x + 3, cy + 15, 184);
  body(img, x + 6, cy + 20, 'Ada: who wants to be the Imp?', T.text);
  body(img, x + 6, cy + 30, 'Cleo: not me, I swear.', T.textDim);
  input(img, K, x + 5, cy + 44, 140, 'Message the lobby…', { placeholder: true, h: 14 });
  button(img, K, x + 148, cy + 44, 37, 'Send', 'disabled', { h: 15 });
}

// ------------------------------------------------------------------------------------------------ storyteller panel
const STEPS = [['Setup', 'glyph_edit'], ['1st nt', 'glyph_firstnight'], ['Day', 'glyph_day'], ['Gather', 'glyph_gather'], ['Bed', 'glyph_bedtime'],
  ['Night', 'glyph_night'], ['Dawn', 'glyph_dawn'], ['End', 'glyph_end']];
const EVIL_ROLES = /Imp|Poisoner|Spy|Scarlet|Baron/;
export function storyteller(img, K, ctx, o = {}) {
  const T = K.T, w = 248, x = 640 - 6 - w, y = 6, h = 252;
  K.nine.panel(img, x, y, w, h);
  tiny(img, x + 10, y + 10, 'STORYTELLER', T.gold);
  title(img, K, x + 10 + textWidth('STORYTELLER', LABEL) + 6, y + 6, 'Day 1');
  button(img, K, x + w - 68, y + 6, 42, 'Undo', 'normal', { h: 13 });
  img.blit(K.img.glyph_swap, x + w - 24, y + 4);
  // phase stepper: NOW = gold, NEXT = violet badge; 8 steps of 29 x 31 (glyph + LABEL caps). r1: GATHER (23 texels)
  // overflowed a 27-wide step; every label must leave >= 1 texel to the edge ring on both sides.
  const bw = 29, sx = x + Math.floor((w - 8 * bw) / 2), sy = y + 24;
  STEPS.forEach(([lab, g], i) => {
    const now = i === 3, next = i === 4, bx = sx + i * bw, L = lab.toUpperCase();
    if (textWidth(L, LABEL) > bw - 6) throw new Error(`panels: stepper label ${L} is ${textWidth(L, LABEL)} > ${bw - 6} texels`);
    K.nine[now ? 'button-selected' : next ? 'button-hover' : 'button'](img, bx, sy, bw, 31);
    img.blit(K.img[g], bx + 7, sy + 3);
    tiny(img, bx + 15, sy + 21, L, now ? T.gold : T.textDim, 'center');
    if (now) img.blit(K.img['badge-now'], bx + 15 - (K.img['badge-now'].w >> 1), sy - 8);
    if (next) img.blit(K.img['badge-next'], bx + 15 - (K.img['badge-next'].w >> 1), sy - 7);
  });
  // actions
  const cx0 = x + 9, cw0 = w - 18, ay = sy + 36;
  button(img, K, cx0, ay, 108, 'Circle gathered', 'selected', { h: 13 });
  button(img, K, cx0 + 111, ay, cw0 - 111, 'Nominations open', 'normal', { h: 13 });
  body(img, cx0, ay + 19, 'Ada', T.text); body(img, cx0 + 18, ay + 19, '→', T.gold); body(img, cx0 + 26, ay + 19, 'Finn', T.text);
  button(img, K, x + w - 84, ay + 16, 54, 'Start vote', o.voteState || 'primary', { h: 13 });
  button(img, K, x + w - 27, ay + 16, 18, '', 'normal', { h: 13 }); img.blit(K.img.glyph_close.crop(2, 2, 12, 12), x + w - 24, ay + 16);
  K.nine['banner-danger'](img, cx0, ay + 33, cw0, 17);
  body(img, cx0 + 5, ay + 38, 'Nobody is on the block.', T.textDim);
  button(img, K, x + w - 72, ay + 35, 60, 'No execution', 'normal', { h: 13 });
  // the big primary: ring the bedtime bell
  button(img, K, cx0, ay + 54, cw0, 'Ring the bedtime bell', o.bellState || 'primary', { h: 22, icon: 'glyph_bell' });
  // seat grid 2 x 4: name on line 1, role on line 2 in the BODY font coloured good / evil (v2 'alive · Empath' is
  // normal text; r1 set roles in tiny caps and MONK read as HONK). Dead = sunk row, dim name, ghost-vote glyph.
  const gy = ay + 81, cw = (cw0 - 2) >> 1;
  ctx.cast.slice(0, 7).forEach((m, i) => {
    const cx = cx0 + (i % 2) * (cw + 2), cy = gy + Math.floor(i / 2) * 22;
    rowFrame(img, K, cx, cy, cw, 21, m.ghost ? 'dead' : i === (o.sel ?? 0) ? 'selected' : 'normal');
    const ic = icon(ctx, m); if (ic) img.blit(ic, cx + 3, cy + 4);
    body(img, cx + 18, cy + 3, `${m.seat}. ${m.name}`, m.ghost ? T.textDim : T.text);
    const evil = EVIL_ROLES.test(m.role);
    body(img, cx + 18, cy + 11, m.role, evil ? T.evil : T.good);
    if (m.ghost) img.blit(K.img['ghost-vote'], cx + cw - 18, cy + 3);
  });
  divider(img, K, x + 3, y + h - 17, w - 6);
  img.blit(K.img.glyph_scroll, x + 8, y + h - 16);
  tiny(img, x + 26, y + h - 11, 'GRIMOIRE + TOOLS', T.gold);
}

// ------------------------------------------------------------------------------------------------ endgame pamphlet
export function endgame(img, K, ctx, o = {}) {
  const T = K.T, M = K.M, w = 236, x = (640 - w) >> 1, y = 28, h = 214;
  img.rect(0, 0, img.w, img.h, T.scrim);   // modal (Back to lobby / Close): scrim behind it, as settings
  K.nine['scroll-top'](img, x, y, w, 7);
  K.nine['scroll-body'](img, x + 2, y + 7, w - 4, h - 14);
  K.nine['scroll-bottom'](img, x, y + h - 7, w, 7);
  const ix = x + 14, iw = w - 28;
  img.blit(K.img.glyph_star, ix, y + 12);
  // the title is the biggest, darkest line (display cap 9 in the team's dark tone), the sentence sits under it in body
  title(img, K, ix + 20, y + 12, 'Good wins', { color: M.good.line, shadow: false });
  img.blit(K.img['badge-good'], ix + iw - K.img['badge-good'].w, y + 13);
  drawText(img, ix + 20, y + 26, 'The Demon is dead. Dawn breaks.', { color: T.textInk });
  divider(img, K, ix, y + 37, iw, 'parchment');
  const roles = [['Undertaker', 0, 1], ['Empath', 0, 1], ['Imp', 1, 0], ['Chef', 0, 1], ['Scarlet Woman', 1, 0], ['Monk', 0, 0], ['Butler', 0, 1]];
  ctx.cast.slice(0, 7).forEach((m, i) => {
    const ry = y + 44 + i * 18;
    const [role, evil, alive] = roles[i];
    if (i % 2 === 0) img.rect(ix, ry - 2, iw, 17, T.parchmentHi);
    const ic = icon(ctx, { ...m, ghost: !alive }); if (ic) img.blit(ic, ix + 2, ry);
    tiny(img, ix + 18, ry + 4, String(i + 1), T.textInk);
    drawText(img, ix + 28, ry + 3, m.name, { color: T.textInk });
    drawText(img, ix + 84, ry + 3, role, { color: evil ? M.evil.line : M.good.line });
    tiny(img, ix + iw - 4, ry + 4, alive ? 'ALIVE' : 'DEAD', alive ? M.ok.line : T.parchmentLine, 'right');
  });
  divider(img, K, ix, y + h - 40, iw, 'parchment');
  button(img, K, ix, y + h - 32, 92, 'Back to lobby', o.backState || 'primary');
  button(img, K, ix + iw - 50, y + h - 32, 50, 'Close', 'normal');
}

// ------------------------------------------------------------------------------------------------ settings modal
export function settings(img, K, ctx, o = {}) {
  const T = K.T, w = 300, h = 214, x = (640 - w) >> 1, y = (360 - h) >> 1;
  const k = o.openK ?? 99;          // grid frames since open (pop on 0..1)
  const box = new PixelImage(w, h + 1);
  K.nine.modal(box, 0, 0, w, h);
  title(box, K, 10, 8, 'Settings');
  box.blit(K.img.glyph_close, w - 24, 4);
  tabs(box, K, 9, 20, w - 18, ['General', 'Audio', 'Video', 'Keys'], o.tab ?? 1, { hover: o.tabHover ?? 2 });
  const cx = 12, cw = w - 34;
  let ry = 42;
  const row = (label, hint) => { body(box, cx, ry + 3, label, T.text); if (hint) tiny(box, cx, ry + 13, hint, T.textDim); };
  row('Master volume', 'ALL VOICES AND BELLS');
  slider(box, K, cx + 120, ry + 1, cw - 150, o.vol ?? 0.7, { knob: o.knob || '' });
  body(box, cx + cw - 2, ry + 3, `${Math.round((o.vol ?? 0.7) * 100)}%`, T.textDim, 'right');
  ry += 24; divider(box, K, cx, ry - 3, cw);
  row('Microphone');
  K.nine[o.ptt === false ? 'segment' : 'segment-on'](box, cx + 120, ry, 62, 13); body(box, cx + 151, ry + 3, 'Push to talk', o.ptt === false ? T.text : T.goldHi, 'center');
  K.nine[o.ptt === false ? 'segment-on' : 'segment'](box, cx + 182, ry, 50, 13); body(box, cx + 207, ry + 3, 'Open mic', o.ptt === false ? T.goldHi : T.text, 'center');
  ry += 20;
  row('Reduce motion', 'NO POPS OR BOBS');
  box.blit(K.img[`switch_${o.switchK ?? 3}`], cx + 120, ry + 2);
  ry += 22;
  row('Show names');
  box.blit(K.img[o.names === false ? 'checkbox' : 'checkbox-on'], cx + 120, ry + 2);
  body(box, cx + 132, ry + 3, 'Over everyone', T.textDim);
  ry += 18;
  row('UI scale');
  box.blit(K.img['radio-on'], cx + 120, ry + 2); body(box, cx + 132, ry + 3, 'x2', T.text);
  box.blit(K.img.radio, cx + 152, ry + 2); body(box, cx + 164, ry + 3, 'x3', T.text);
  ry += 18;
  row('Input device');
  select(box, K, cx + 120, ry, 112, 'Default microphone');
  // scrollbar along the content
  K.nine['scrollbar-track'](box, w - 16, 40, 6, 130);
  K.nine['scrollbar-thumb'](box, w - 16, 44, 6, 60);
  divider(box, K, 3, h - 25, w - 6);
  button(box, K, w - 120, h - 21, 52, 'Cancel', 'normal');
  button(box, K, w - 64, h - 21, 54, 'Save', o.saveState || 'primary');
  // scrim + pop / dissolve (docs/UI.md §2.8)
  if (o.closeK != null) { const s = Math.floor(o.closeK / 2); if (s >= 3) return; dissolve(box, [0.25, 0.5, 0.75][s]); }
  img.rect(0, 0, img.w, img.h, T.scrim);
  if (k < 2 && !ctx.reduced) { const sm = new PixelImage(w - 8, h - 6); K.nine.modal(sm, 0, 0, w - 8, h - 7); img.blit(sm, x + 4, y + 3); return; }
  img.blit(box, x, y);
}

// ------------------------------------------------------------------------------------------------ "Your home" + voice cards
export function interior(img, K, ctx) {
  const T = K.T, w = 170, x = (640 - w) >> 1, y = 300;
  K.nine['panel-plain'](img, x, y, w, 52);
  title(img, K, x + (w >> 1), y + 5, 'Your home', { align: 'center' });
  body(img, x + w / 2, y + 18, 'Nobody else is here.', T.textDim, 'center');
  button(img, K, x + 55, y + 31, 60, 'Leave', 'primary');
}

// ------------------------------------------------------------------------------------------------ kit showcase
/** Every element of the kit, labelled, on two panels left and right (the cast stays visible in the middle). */
export function kitShowcase(img, K, ctx) {
  const T = K.T, t = ctx.t;
  const sec = (x, y, s) => tiny(img, x, y, s, T.gold);
  const lab = (x, y, s) => tiny(img, x, y, s, T.textDim);
  // ---- left panel: buttons, tabs, inputs, controls, slider, scrollbar, spinner, cursors
  let x = 4, y = 4; const w = 214;
  K.nine.panel(img, x, y, w, 352);
  x += 9; y += 9;
  sec(x, y, 'BUTTONS'); y += 8;
  [['Idle', 'normal'], ['Hover', 'hover'], ['Press', 'pressed'], ['Off', 'disabled'], ['On', 'selected']].forEach(([l, s], i) => button(img, K, x + i * 39, y, 37, l, s));
  y += 18;
  [['Start', 'primary'], ['Hover', 'primary-hover'], ['Press', 'primary-pressed'], ['Off', 'primary-disabled'], ['Kick', 'danger']].forEach(([l, s], i) => button(img, K, x + i * 39, y, 37, l, s));
  y += 18;
  button(img, K, x, y, 37, 'Kick', 'danger-hover');
  button(img, K, x + 39, y, 37, 'Small', 'normal', { h: 13 });
  K.nine['segment-on'](img, x + 78, y, 34, 13); body(img, x + 95, y + 3, 'Human', T.goldHi, 'center');
  K.nine.segment(img, x + 112, y, 30, 13); body(img, x + 127, y + 3, 'Auto', T.text, 'center');
  K.nine.kbd(img, x + 146, y, 9, 10); tiny(img, x + 148, y + 2, 'F', T.text);
  K.nine.kbd(img, x + 157, y, 21, 10); tiny(img, x + 159, y + 2, 'ESC', T.text);
  y += 18;
  sec(x, y, 'TABS'); y += 8;
  tabs(img, K, x, y, w - 18, ['General', 'Audio', 'Video', 'Keys'], 1, { hover: 2 });
  y += 18;
  sec(x, y, 'FIELDS'); y += 8;
  input(img, K, x, y, 96, 'Ada lies', { state: 'normal' });
  input(img, K, x + 100, y, 96, 'Bram is good', { state: 'focus', caret: (gk(t) % 32) < 16 });
  y += 15;
  input(img, K, x, y, 96, 'Hovered', { state: 'hover' });
  input(img, K, x + 100, y, 96, 'Disabled', { state: 'disabled' });
  y += 15;
  select(img, K, x, y, 96, 'Role? Empath');
  input(img, K, x + 100, y, 96, 'Message…', { placeholder: true });
  y += 17;
  sec(x, y, 'CHECK  RADIO  SWITCH'); y += 8;
  ['checkbox', 'checkbox-on', 'checkbox-hover', 'checkbox-mixed', 'checkbox-disabled', 'checkbox-pop'].forEach((n, i) => img.blit(K.img[n], x + i * 17, y));
  ['radio', 'radio-on', 'radio-hover'].forEach((n, i) => img.blit(K.img[n], x + 112 + i * 17, y));
  y += 11;
  ['OFF', 'ON', 'HOV', 'MIX', 'DIS', 'POP', 'OFF', 'ON', 'HOV'].forEach((l, i) => lab(x + i * 17 + (i >= 6 ? 10 : 0), y, l));
  y += 8;
  [0, 1, 2, 3].forEach((k) => { img.blit(K.img[`switch_${k}`], x + k * 22, y); lab(x + 7 + k * 22, y + 11, String(k)); });
  lab(x + 92, y + 2, 'SWITCH: 4 GRID FRAMES');
  y += 10;
  y += 9;
  sec(x, y, 'SLIDER'); y += 8;
  slider(img, K, x, y, 52, 0.35);
  slider(img, K, x + 56, y, 44, 0.6, { knob: 'hover' });
  slider(img, K, x + 104, y, 44, 0.85, { knob: 'pressed' });
  slider(img, K, x + 152, y, 44, 0.2, { knob: 'disabled' });
  y += 18;
  sec(x, y, 'SCROLL  FOCUS  TIP  SPIN'); y += 8;
  K.nine['scrollbar-track'](img, x, y, 6, 36); K.nine['scrollbar-thumb'](img, x, y + 3, 6, 18);
  K.nine['scrollbar-track'](img, x + 9, y, 6, 36); K.nine['scrollbar-thumb-hover'](img, x + 9, y + 15, 6, 18);
  button(img, K, x + 22, y + 3, 40, 'Focus', 'normal'); K.nine.focus(img, x + 20, y + 1, 44, 19);
  K.nine.tooltip(img, x + 70, y + 2, 76, 13); body(img, x + 74, y + 5, 'Your pin', T.text); img.blit(K.img['tooltip-tail'], x + 80, y + 13);
  img.blit(K.img[`spinner_${Math.floor(gk(t) / 3) % 9}`], x + 156, y + 2);
  K.nine['chip'](img, x + 22, y + 24, 30, 11); tiny(img, x + 26, y + 27, 'CHIP', T.text);
  K.nine['chip-gold'](img, x + 54, y + 24, 30, 11); tiny(img, x + 58, y + 27, 'GOLD', T.gold);
  K.nine['chip-ok'](img, x + 86, y + 24, 22, 11); tiny(img, x + 90, y + 27, 'OK', T.ok);
  K.nine['chip-violet'](img, x + 110, y + 24, 22, 11); tiny(img, x + 114, y + 27, 'ST', T.st);
  K.nine['chip-dim'](img, x + 134, y + 24, 34, 11); tiny(img, x + 138, y + 27, 'AWAY', T.textDim);
  y += 37;
  sec(x, y, 'CURSORS'); y += 8;
  ['cursor-arrow', 'cursor-pointer', 'cursor-pointer-down', 'cursor-text', 'cursor-grab', 'cursor-not-allowed'].forEach((n, i) => img.blit(K.img[n], x + i * 20, y));
  y += 17;
  sec(x, y, 'BANNERS'); y += 8;
  K.nine['tip-strip'](img, x, y, w - 18, 15); img.blit(K.img.glyph_help, x + 3, y); body(img, x + 21, y + 4, 'First time here?', T.text);
  y += 17;
  K.nine['banner-danger'](img, x, y, w - 18, 15); body(img, x + 5, y + 4, 'Nobody is on the block.', T.textDim);

  // ---- right panel: badges, rows, wells, dividers, parchment, glyphs, v2 icons
  x = 640 - 4 - w; y = 4;
  K.nine.panel(img, x, y, w, 352);
  x += 9; y += 9;
  sec(x, y, 'BADGES'); y += 8;
  let bx = x;
  for (const n of ['you', 'host', 'notready', 'ready', 'st', 'alive', 'dead', 'now', 'next', 'saved', 'good', 'evil']) {
    const b = K.img[`badge-${n}`];
    if (bx + b.w > x + w - 18) { bx = x; y += 13; }
    img.blit(b, bx, y); bx += b.w + 3;
  }
  if (bx + 34 > x + w - 18) { bx = x; y += 13; }
  bx += countPill(img, K, bx, y, 4) + 3; countPill(img, K, bx, y, 12, 'count');   // chat unread + crier count
  y += 16;
  sec(x, y, 'ROWS  WELLS'); y += 8;
  ['normal', 'hover', 'selected', 'dead'].forEach((s, i) => {
    const m = ctx.cast[[0, 2, 1, 4][i]] || ctx.cast[0];
    const ry = y + i * 20;
    rowFrame(img, K, x, ry, 140, 18, s);
    const ic = icon(ctx, s === 'dead' ? { ...m, ghost: true } : m); if (ic) img.blit(ic, x + 3, ry + 3);
    body(img, x + 18, ry + 5, m.name, s === 'dead' ? T.textDim : T.text);
    lab(x + 100, ry + 6, s.toUpperCase());
  });
  img.blit(K.img['avatar-well'], x + 150, y);
  const av = ctx.P && ctx.cast[1] ? ctx.P.avatar(ctx.cast[1].id) : null; if (av) img.blit(av, x + 152, y + 2);
  well(img, K, ctx, ctx.cast[3], x + 156, y + 34);
  y += 82;
  sec(x, y, 'DIVIDERS  PARCHMENT'); y += 8;
  divider(img, K, x, y, 92, 'v2');
  divider(img, K, x, y + 12, 92);
  img.blit(K.img['divider-orn'], x + 40, y + 17);
  K.nine['scroll-top'](img, x + 100, y - 2, 96, 7);
  K.nine['scroll-body'](img, x + 102, y + 5, 92, 20);
  K.nine['scroll-bottom'](img, x + 100, y + 25, 96, 7);
  title(img, K, x + 148, y + 7, 'Good wins', { color: K.M.good.line, shadow: false, align: 'center' });
  divider(img, K, x + 108, y + 20, 80, 'parchment');
  y += 38;
  sec(x, y, 'GLYPHS 16X16'); y += 8;
  const gl = Object.keys(K.img).filter((n) => n.startsWith('glyph_'));
  gl.forEach((n, i) => img.blit(K.img[n], x + (i % 11) * 18, y + Math.floor(i / 11) * 17));
  y += Math.ceil(gl.length / 11) * 17 + 3;
  sec(x, y, 'V2 ART/UI ICONS'); y += 8;
  ['alive', 'dead', 'ghost-vote', 'ghost-vote-spent', 'host', 'locked', 'muted', 'nominate', 'phase-dawn', 'phase-day', 'phase-dusk', 'phase-night', 'speaking', 'storyteller', 'vote-hand', 'vote-yes']
    .forEach((n, i) => img.blit(K.img[n], x + (i % 11) * 18, y + Math.floor(i / 11) * 17));
  y += 36;
  sec(x, y, 'NOTEBOOK MARKS'); y += 8;
  ['star', 'maybe', 'no'].forEach((n, i) => { K.nine[i === 0 ? 'segment-on' : 'segment'](img, x + i * 13, y, 11, 11); img.blit(K.img[`toggle_${n}`], x + i * 13 + 2, y + 2); });
}

// ------------------------------------------------------------------------------------------------ scripted interaction demo
export const DEMO_CYCLE = 6.4;   // s
/** Stepped cursor path: waypoints [t, x, y]; position moves 1 drawing per 2 grid frames (15 fps), whole pixels. */
function along(path, t) {
  const tq = Math.floor(t * 15 + 0.01) / 15;
  for (let i = 1; i < path.length; i++) {
    const [t1, x1, y1] = path[i], [t0, x0, y0] = path[i - 1];
    if (tq <= t1) { const k = t1 > t0 ? Math.max(0, (tq - t0) / (t1 - t0)) : 1; return [Math.round(x0 + (x1 - x0) * k), Math.round(y0 + (y1 - y0) * k)]; }
  }
  return path[path.length - 1].slice(1);
}
/** A small settings-style panel with every interactive control, driven by a scripted cursor (1x real time). */
export function demo(img, K, ctx, o = {}) {
  const T = K.T, u = ((ctx.t % DEMO_CYCLE) + DEMO_CYCLE) % DEMO_CYCLE;
  const x = 4, y = 72, w = 190, h = 186;
  K.nine.panel(img, x, y, w, h);
  title(img, K, x + 9, y + 8, 'Lobby');
  img.blit(K.img[`spinner_${ctx.reduced ? 0 : Math.floor(gk(ctx.t) / 3) % 9}`], x + w - 22, y + 6);
  tiny(img, x + w - 26, y + 10, 'CONNECTING', T.textDim, 'right');
  divider(img, K, x + 3, y + 21, w - 6);
  const cx = x + 10;
  // 1. button: hover 0.6, press 1.0-1.2 (5 grid frames), release -> selected
  const bState = u < 0.6 ? 'normal' : u < 1.0 ? 'hover' : u < 1.2 ? 'pressed' : 'selected';
  button(img, K, cx, y + 27, 80, "I'm ready", bState);
  body(img, cx + 86, y + 31, u < 1.2 ? 'Not ready' : 'Ready!', u < 1.2 ? T.textDim : T.ok);
  // 2. switch at 2.0: drawings 1, 2 (2 grid frames each) then on
  const sk = u < 2.0 ? 0 : ctx.reduced ? 3 : Math.min(3, 1 + Math.floor(gk(u - 2.0) / 2));
  body(img, cx, y + 52, 'Reduce motion', T.text); img.blit(K.img[`switch_${sk}`], cx + 150, y + 51);
  // 3. checkbox at 2.8 (pop: the ON drawing 1 step smaller for 2 grid frames; r1 flashed the 'mixed' drawing)
  const cOn = u >= 2.8, cPop = cOn && gk(u - 2.8) < 2 && !ctx.reduced;
  body(img, cx, y + 68, 'Voice chat', T.text);   // clicked on its label (the cursor never hides the box)
  img.blit(K.img[cOn ? (cPop ? 'checkbox-pop' : 'checkbox-on') : u > 2.7 ? 'checkbox-hover' : 'checkbox'], cx + 158, y + 67);
  // 4. slider drag 3.5 -> 4.3
  const v = u < 3.5 ? 0.3 : u < 4.3 ? 0.3 + 0.5 * (Math.floor((u - 3.5) * 15 + 0.01) / 12) : 0.8;
  const sx = cx + 70, sw = 100;
  body(img, cx, y + 85, 'Volume', T.text);
  slider(img, K, sx, y + 83, sw, Math.min(0.8, v), { knob: u >= 3.5 && u < 4.4 ? 'pressed' : u > 3.0 && u < 3.5 ? 'hover' : '' });
  // 5. text field: click 5.0, type one char per 3 grid frames
  const s = 'Ada lies', n = u < 5.0 ? 0 : Math.min(s.length, Math.floor(gk(u - 5.0) / 3));
  body(img, cx, y + 104, 'Note', T.text);
  input(img, K, cx + 30, y + 101, w - 50, n ? s.slice(0, n) : 'Claims, suspicions…', { state: u >= 5.0 ? 'focus' : u > 4.6 ? 'hover' : 'normal', placeholder: !n, caret: u >= 5.0 && (n < s.length || gk(u) % 32 < 16) });
  // 6. notebook marks + tab strip (static context)
  tabs(img, K, cx, y + 122, w - 20, ['Town', 'Notes', 'Crier'], u < 5.9 ? 1 : 2, { hover: u > 5.6 && u < 5.9 ? 2 : -1 });
  body(img, cx, y + 142, 'Bram', T.text);
  ['star', 'maybe', 'no'].forEach((g, i) => { K.nine[i === 0 ? 'segment-on' : 'segment'](img, cx + 40 + i * 13, y + 141, 11, 11); img.blit(K.img[`toggle_${g}`], cx + 42 + i * 13, y + 143); });
  button(img, K, x + w - 64, y + h - 23, 54, 'Save', u >= 6.0 && u < 6.2 ? 'primary-pressed' : u > 5.95 ? 'primary-hover' : 'primary');
  // cursor
  const path = [[0, 120, 300], [0.55, cx + 40, y + 34], [1.4, cx + 40, y + 34], [1.9, cx + 158, y + 55], [2.4, cx + 158, y + 55], [2.75, cx + 40, y + 72],
    [3.0, cx + 40, y + 72], [3.4, sx + Math.round((sw - 7) * 0.3) + 3, y + 88], [3.5, sx + Math.round((sw - 7) * 0.3) + 3, y + 88], [4.3, sx + Math.round((sw - 7) * 0.8) + 3, y + 88],
    [4.6, sx + Math.round((sw - 7) * 0.8) + 3, y + 88], [4.95, cx + 80, y + 107], [5.5, cx + 80, y + 107], [5.85, cx + 60, y + 128], [5.95, x + w - 37, y + h - 15], [6.4, x + w - 37, y + h - 15]];
  const [px, py] = along(path, u);
  const pressing = (u >= 1.0 && u < 1.2) || (u >= 2.0 && u < 2.1) || (u >= 2.8 && u < 2.9) || (u >= 5.0 && u < 5.1) || (u >= 6.0 && u < 6.2);
  const name = u >= 3.5 && u < 4.4 ? 'cursor-grab' : u >= 4.7 && u < 5.5 ? 'cursor-text' : pressing ? 'cursor-pointer-down' : u < 0.55 ? 'cursor-arrow' : 'cursor-pointer';
  cursor(img, K, name, px, py);
}

// ------------------------------------------------------------------------------------------------ voice panel (#47)
/** 5x5 status dot (round: corners left untouched, never erased, so the panel shows through, not the world). */
function dot(img, x, y, col, line, hi) {
  ['.lll.', 'lhccl', 'lcccl', 'lcccl', '.lll.'].forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') img.set(x + i, y + j, c === 'l' ? line : c === 'h' ? hi : col); }));
}
/** v2 .ctv header: status dot, 'Voice' title, optional zone chip, gear + collapse glyphs, divider. Returns content y. */
function voiceHead(img, K, x, y, w, { on, zone }) {
  const T = K.T, M = K.M;
  dot(img, x + 8, y + 8, on ? T.ok : M.steel.mid, on ? M.ok.line : T.outline, on ? M.ok.hi : M.steel.hi);
  title(img, K, x + 16, y + 6, 'Voice');
  if (zone) {
    const zx = x + 18 + textWidth('Voice', DISPLAY) + 4, zw = textWidth(zone, LABEL) + 8;
    K.nine['chip-ok'](img, zx, y + 6, zw, 11); tiny(img, zx + 4, y + 9, zone, T.ok);
  }
  img.blit(K.img.glyph_gear, x + w - 39, y + 4);
  img.blit(K.img.glyph_chevron, x + w - 21, y + 4);
  divider(img, K, x + 3, y + 21, w - 6);
  return y + 26;
}
/** Voice cards: off (gold Enable voice + note) and on (segmented PTT / Open mic, Hold / Mute / Deafen, hold-to-talk,
 *  transmit line, volume sliders, nearby list, settings link, Storyteller announce). v2 ui/voice/index.tsx, voice.css. */
export function voice(img, K, ctx, o = {}) {
  const T = K.T;
  // --- off card (top left)
  { const x = 6, y = 6, w = 156, h = 76;
    K.nine['panel-plain'](img, x, y, w, h);
    let cy = voiceHead(img, K, x, y, w, { on: false });
    button(img, K, x + 8, cy, w - 16, 'Enable voice', o.enableState || 'primary', { h: 19, icon: 'glyph_mic' });
    cy += 24;
    for (const l of wrapText('Talk to whoever is near you. You can also just listen.', w - 16, { maxLines: 3 })) { body(img, x + 8, cy, l, T.textDim); cy += 9; }
  }
  // --- on card (right)
  const w = 168, x = 640 - 6 - w, y = 6, h = 254;
  K.nine.panel(img, x, y, w, h);
  let cy = voiceHead(img, K, x, y, w, { on: true, zone: 'SQUARE' });
  const ix = x + 9, iw = w - 18;
  body(img, ix, cy, 'Near the well: 3 can hear you.', T.textDim); cy += 12;
  const ptt = o.ptt !== false, sw = 70;
  K.nine[ptt ? 'segment-on' : 'segment'](img, ix, cy, sw, 13); body(img, ix + (sw >> 1), cy + 3, 'Push to talk', ptt ? T.goldHi : T.text, 'center');
  K.nine[ptt ? 'segment' : 'segment-on'](img, ix + sw, cy, iw - sw, 13); body(img, ix + sw + ((iw - sw) >> 1), cy + 3, 'Open mic', ptt ? T.text : T.goldHi, 'center');
  cy += 17;
  button(img, K, ix, cy, 52, 'Hold V', 'normal', { h: 13 });
  button(img, K, ix + 55, cy, 45, 'Mute', 'normal', { h: 13 });
  button(img, K, ix + 103, cy, iw - 103, 'Deafen', o.deafen ? 'selected' : 'normal', { h: 13 });
  cy += 17;
  const held = !!o.held;
  button(img, K, ix, cy, iw, held ? 'Talking… release' : 'Hold here to talk', held ? 'pressed' : 'normal');
  cy += 20;
  img.blit(K.img[held ? 'speaking' : 'glyph_mic'], ix - 1, cy - 4);
  body(img, ix + 17, cy + 1, held ? 'Transmitting' : 'Hold V to talk', held ? T.gold : T.textDim);
  cy += 14;
  divider(img, K, x + 3, cy, w - 6); cy += 6;
  for (const [l, v] of [['Voices', 0.8], ['Bells', 0.45]]) {
    body(img, ix, cy + 3, l, T.text);
    slider(img, K, ix + 38, cy, iw - 62, v);
    body(img, ix + iw, cy + 3, `${Math.round(v * 100)}%`, T.textDim, 'right');
    cy += 15;
  }
  divider(img, K, x + 3, cy, w - 6); cy += 5;
  tiny(img, ix, cy, 'NEARBY', T.gold); cy += 8;
  const who = ctx.cast.slice(1, 4);
  who.forEach((m, i) => {
    const talking = i === 0, muted = i === 2;
    rowFrame(img, K, ix, cy, iw, 17, talking ? 'selected' : 'normal');
    const ic = icon(ctx, m); if (ic) img.blit(ic, ix + 3, cy + 3);
    body(img, ix + 18, cy + 5, m.name, T.text);
    if (talking) tiny(img, ix + iw - 5, cy + 6, 'TALKING', T.gold, 'right');
    else if (muted) { K.nine['chip-dim'](img, ix + iw - 34, cy + 3, 30, 11); tiny(img, ix + iw - 30, cy + 6, 'MUTED', T.textDim); }
    cy += 18;
  });
  cy += 3;
  link(img, ix, cy, 'Voice & sound settings…', T.gold); cy += 13;
  button(img, K, ix, cy, iw, 'Announce to the town', 'normal', { h: 19, icon: 'glyph_bell' });
}

// ------------------------------------------------------------------------------------------------ chat dock (#44)
/** Open dock (tabs Chat | Crier with a violet new-count, minimise, scope bar, log, field + Send) and the folded state
 *  (peek line + Chat toggle with the danger unread pill). v2 ui/chat/index.tsx, chat.css. */
export function chat(img, K, ctx, o = {}) {
  const T = K.T, t = ctx.t;
  const x = 6, w = 196, h = 128, y = 360 - 6 - h;
  K.nine['panel-plain'](img, x, y, w, h);
  const tb = tabs(img, K, x + 6, y + 5, w - 30, ['Chat', 'Crier'], o.tab ?? 0);
  countPill(img, K, tb[1].x + tb[1].w - 5, y + 1, o.crierNew ?? 3, 'count');   // notification corner of the Crier tab
  button(img, K, x + w - 20, y + 4, 15, '', 'normal', { h: 13 }); img.hline(x + w - 16, y + 9, 7, T.text);
  // scope bar: who reads your messages right now
  const sy = y + 23;
  K.nine.row(img, x + 4, sy, w - 8, 18);
  img.blit(K.img.glyph_home, x + 6, sy + 1);
  body(img, x + 23, sy + 6, 'Town square', T.text);
  body(img, x + 23 + textWidth('Town square') + 4, sy + 6, '· 4 nearby read this', T.textDim);
  // log
  const msgs = [['9:38', 'Bram', 'Meet at the well after dusk.', T.text], ['9:39', 'Crier', 'Night falls on Hollowmere.', T.st],
    ['9:40', 'Teller', 'Everyone home, please.', T.st], ['9:41', 'You', 'On my way.', T.gold]];
  let ly = sy + 23;
  for (const [tm, from, txt, col] of msgs) {
    tiny(img, x + 8, ly + 1, tm, T.textDim);
    if (from === 'Crier') { K.nine['chip-violet'](img, x + 27, ly - 2, 32, 11); tiny(img, x + 31, ly + 1, 'CRIER', T.st); body(img, x + 63, ly, txt, T.text); }
    else { body(img, x + 27, ly, from, col); body(img, x + 27 + textWidth(from) + 4, ly, txt, T.text); }
    ly += 12;
  }
  // field + Send
  const fy = y + h - 22, typed = o.typed ?? 'who is the Imp';
  input(img, K, x + 5, fy, w - 52, typed, { state: 'focus', caret: (gk(t) % 32) < 16, h: 14 });
  button(img, K, x + w - 45, fy, 40, 'Send', typed ? 'primary' : 'disabled', { h: 15 });
  // --- folded: peek line + Chat toggle with the unread pill
  const px = 214, py = 360 - 6 - 46;
  tiny(img, px, py - 9, 'FOLDED', T.gold);
  K.nine['panel-plain'](img, px, py, 168, 21);
  body(img, px + 6, py + 6, 'Bram', T.gold); body(img, px + 6 + textWidth('Bram') + 4, py + 6, 'meet at the well', T.text);
  button(img, K, px, py + 25, 44, 'Chat', 'normal');
  countPill(img, K, px + 44 - 6, py + 21, o.unread ?? 7);
  countPill(img, K, px + 60, py + 27, 128);   // '99+' cap
  tiny(img, px + 92, py + 30, 'UNREAD 7 / 99+', T.textDim);
}

// ------------------------------------------------------------------------------------------------ help + admin + status (#45)
/** How-to-play dialog (keys tab) over the scrim, the reconnect status card, and the admin games tab. */
export function dialogs(img, K, ctx) {
  const T = K.T;
  img.rect(0, 0, img.w, img.h, T.scrim);
  // --- help dialog
  { const x = 12, y = 14, w = 244, h = 186;
    K.nine.modal(img, x, y, w, h);
    title(img, K, x + 10, y + 8, 'How to play');
    img.blit(K.img.glyph_close, x + w - 24, y + 4);
    tabs(img, K, x + 9, y + 22, w - 18, ['Basics', 'Voice', 'Keys'], 2, { hover: 0 });
    const keys = [[['W', 'A', 'S', 'D'], 'Walk'], [['E'], 'Enter or knock'], [['V'], 'Hold to talk'], [['T'], 'Chat'], [['Q'], 'Point'], [['ESC'], 'Close a panel']];
    let ky = y + 44;
    for (const [ks, what] of keys) {
      let kx = x + 14;
      for (const k of ks) { const kw = Math.max(11, textWidth(k, LABEL) + 6); K.nine.kbd(img, kx, ky, kw, 11); tiny(img, kx + 3 + ((kw - 6 - textWidth(k, LABEL)) >> 1), ky + 3, k, T.text); kx += kw + 2; }
      body(img, x + 74, ky + 2, what, T.text);
      ky += 16;
    }
    K.nine['tip-strip'](img, x + 10, ky + 2, w - 20, 15); img.blit(K.img.glyph_help, x + 13, ky + 2);
    body(img, x + 31, ky + 6, 'The Storyteller can always help.', T.text);
    divider(img, K, x + 3, y + h - 25, w - 6);
    img.blit(K.img.checkbox, x + 12, y + h - 17); body(img, x + 24, y + h - 16, 'Do not show again', T.textDim);
    button(img, K, x + w - 64, y + h - 21, 54, 'Got it', 'primary');
  }
  // --- status card (v2 StatusScreen: connecting / reconnecting)
  { const x = 12, y = 210, w = 244, h = 40;
    K.nine['panel-plain'](img, x, y, w, h);
    img.blit(K.img[`spinner_${ctx.reduced ? 0 : Math.floor(gk(ctx.t) / 3) % 9}`], x + 9, y + 9);
    title(img, K, x + 28, y + 7, 'Reconnecting');
    body(img, x + 28, y + 21, 'Your seat is kept for 2 minutes.', T.textDim);
    button(img, K, x + w - 52, y + 8, 42, 'Retry', 'normal');
  }
  // --- admin (v2 ui/admin: tabs, stat tiles, games table)
  const x = 266, y = 14, w = 368, h = 212;
  K.nine.panel(img, x, y, w, h);
  title(img, K, x + 10, y + 8, 'Admin');
  const cw = textWidth('OPERATOR', LABEL) + 8;
  K.nine['chip-violet'](img, x + 14 + textWidth('Admin', DISPLAY), y + 8, cw, 11); tiny(img, x + 18 + textWidth('Admin', DISPLAY), y + 11, 'OPERATOR', T.st);
  button(img, K, x + w - 60, y + 6, 50, 'Sign out', 'normal', { h: 13 });
  tabs(img, K, x + 9, y + 22, w - 18, ['Overview', 'Accounts', 'Games', 'Safety', 'Settings'], 2, { hover: 3 });
  const tiles = [['3', 'GAMES'], ['17', 'PLAYERS'], ['2', 'VOICE ROOMS'], ['0', 'REPORTS']];
  const tw4 = Math.floor((w - 18 - 3 * 4) / 4);
  tiles.forEach(([n, l], i) => {
    const tx = x + 9 + i * (tw4 + 4), ty = y + 44;
    K.nine.well(img, tx, ty, tw4, 30);
    drawText(img, tx + 6, ty + 5, n, { font: DISPLAY, color: i === 3 ? T.ok : T.gold });
    tiny(img, tx + 6, ty + 20, l, T.textDim);
  });
  let ry = y + 82;
  const cols = [0, 104, 160, 222];
  ['LOBBY', 'PLAYERS', 'PHASE', 'STORYTELLER'].forEach((c, i) => tiny(img, x + 14 + cols[i], ry, c, T.gold));
  ry += 8;
  const games = [['Hollowmere', '7/10', 'Day 2', 'Teller'], ['Ashgrove', '5/8', 'Night 1', 'Auto'], ['Saltmarsh', '2/10', 'Lobby', '—']];
  games.forEach(([n, p, ph, st], i) => {
    rowFrame(img, K, x + 9, ry, w - 18, 18, i === 1 ? 'hover' : 'normal');
    body(img, x + 14 + cols[0], ry + 5, n, T.text);
    body(img, x + 14 + cols[1], ry + 5, p, T.textDim);
    body(img, x + 14 + cols[2], ry + 5, ph, T.text);
    body(img, x + 14 + cols[3], ry + 5, st, st === 'Teller' ? T.st : T.textDim);
    button(img, K, x + w - 54, ry + 2, 40, 'Close', i === 1 ? 'danger-hover' : 'danger', { h: 13 });
    ry += 20;
  });
  ry += 4;
  divider(img, K, x + 3, ry, w - 6); ry += 7;
  tiny(img, x + 12, ry, 'SAFETY', T.gold); ry += 9;
  body(img, x + 12, ry + 3, 'New lobbies', T.text); img.blit(K.img.switch_3, x + 100, ry + 2);
  body(img, x + 132, ry + 3, 'Voice', T.text); img.blit(K.img.switch_0, x + 162, ry + 2);
  body(img, x + 194, ry + 3, 'Max lobbies', T.text); input(img, K, x + 248, ry, 34, '12');
  ry += 18;
  K.nine['banner-danger'](img, x + 9, ry, w - 18, 17);
  body(img, x + 15, ry + 5, 'Closing a game ends it for everyone in it.', T.textDim);
  img.blit(K.img['cursor-pointer'], x + w - 26, y + 82 + 8 + 20 + 8);
}
