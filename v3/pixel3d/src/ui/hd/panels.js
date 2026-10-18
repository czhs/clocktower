// D=2 DOM panel skin (owner: panels; wave 2 of the density round, docs/UI-HD-WAVE2.md). The panels.css 9-slice frames
// and form controls redrawn on the HD grid (every image 2x its 1x frame, insets x2) and a scoped stylesheet that maps
// 1 HD image px to var(--hdpx) CSS px (= L.hd.scale; set by the page next to --px). Same frame names, tokens and light.
//
//   plateHD(w, h, s, T)        a lit plate at HD size (the panels plate() language at D=2: 1-px line, 2-px edge ring lit
//                              upper-left, 1-px fill bevels, rounder corners: 1x notch -> [2, 1], 1x pill -> [4, 2, 1, 1])
//   panelKitHD(T)              {img, insets, nine}: every 9-slice frame of panels panelKit(T) that the DOM skin uses + the
//                              checkbox / radio / switch / slider-knob / scrollbar controls, at D=2
//   buildPanelsCssHD(KH, {scope})   CSS text: the frame + control rules of out/ui/panels.css under `scope` (default
//                              '.ctp-hd'), sizes in calc(n px * var(--hdpx)); later rules win over panels.css by specificity
//   installPanelsHD(doc, T, {scope, apply})   build + inject <style id="ctp-hd-css"> once per token set (browser only);
//                              apply: add the scope class to <html>. Pair with installHDCss (hd/css.js) for the HD text.
import { PixelImage, ramp, toCanvas, nineSlice, drawText, textWidth, fontAt } from '../kit.js';
import { mats } from '../panels/art.js';
import { LABEL } from '../hud/font.js';
import { shadeGrid } from './emotes.js';
import { memo, tkey } from './hud.js';

const CUTS = { 0: [], 1: [2, 1], 2: [4, 2, 1, 1] };
/**
 * A lit plate at HD size w x h (w, h = 2 x the 1x plate). s = the panels plate() spec { line, eHi, eSh, eMid, fill, fHi,
 * fSh, corner, shadow, press, open: 'bottom' }. Shadow = 2 HD rows; press = the plate 2 HD px down.
 */
export function plateHD(w, h, s, T) {
  const img = new PixelImage(w, h);
  const y0 = s.press ? 2 : 0, ph = s.shadow && !s.press ? h - 2 : h - y0, open = s.open === 'bottom';
  const cuts = CUTS[s.corner || 0];
  const out = (i, j) => {
    if (i < 0 || i >= w || j < 0 || (!open && j >= ph)) return true;
    if (open && j >= ph) return false;
    const dx = Math.min(i, w - 1 - i), dy = open ? j : Math.min(j, ph - 1 - j);
    return dy < cuts.length && dx < cuts[dy];
  };
  const dist = (i, j) => { let d = 9; for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) { const m = Math.abs(a) + Math.abs(b); if (m && m <= 4 && out(i + a, j + b)) d = Math.min(d, m - 1); } return d; };
  for (let j = 0; j < ph; j++) for (let i = 0; i < w; i++) {
    if (out(i, j)) continue;
    const d = dist(i, j);
    let col;
    if (d === 0) col = s.line;
    else if (d <= 2) {
      const dt = j, dl = i, dr = w - 1 - i, db = open ? 99 : ph - 1 - j, m = Math.min(dt, dl, dr, db);
      if ((dt <= 3 && dr <= 3) || (db <= 3 && dl <= 3)) col = s.eMid ?? s.eHi;
      else col = m === dt || m === dl ? s.eHi : s.eSh;
    } else if (d === 3 && s.fHi && j === 3) col = s.fHi;
    else if (d === 3 && s.fSh && !open && j === ph - 4) col = s.fSh;
    else col = s.fill;
    img.set(i, y0 + j, col);
  }
  if (s.shadow && !s.press) for (let r = 0; r < 2; r++) for (let i = 2; i < w; i++) if (!out(i - 2, ph - 2 + r)) img.set(i, ph + r, s.shadow);
  return img;
}
/** Corner brackets at D=2 (panel / modal / parchment): 3-px arms 12 long with a 1-px line, a round rivet, lit upper-left. */
function bracketsHD(img, T, { mat = 'iron', rivet = 'gold', y1 = null } = {}) {
  const w = img.w, h = y1 ?? img.h, M = mats(T);
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; };
  const corner = (fx, fy) => {
    const X = (i) => (fx ? w - 1 - i : i), Y = (j) => (fy ? h - 1 - j : j);
    for (let i = 2; i <= 12; i++) for (let j = 2; j <= 4; j++) { put(X(i), Y(j), 'a'); put(X(j), Y(i), 'a'); }
    for (let i = 5; i <= 6; i++) for (let j = 5; j <= 6; j++) put(X(i), Y(j), 'a');
    for (const [i, j] of [[3, 3], [4, 3], [3, 4], [4, 4]]) put(X(i), Y(j), 'b');
  };
  corner(0, 0); corner(1, 0); corner(0, 1); corner(1, 1);
  const art = shadeGrid(g.map((r) => r.join('')), { a: M[mat], b: M[rivet] }, { pad: 0 });
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const v = art.get(x, y); if (v[3]) img.set(x, y, v); }
  return img;
}
/** Badge pill at D=2 (LABEL / body text in the D=2 faces). */
function badgeHD(text, st, T) {
  const body = st.font === 'body', tw = textWidth(text, body ? 'body' : LABEL), w = (tw + 8) * 2, h = (body ? 12 : 11) * 2;
  const im = plateHD(w, h, { line: T.outline, eHi: st.edge, eSh: st.edgeSh ?? st.edge, eMid: st.edge, fill: st.fill ?? T.ink, corner: 2 }, T);
  drawText(im, 8, 6, text, { font: body ? fontAt('body', 2) : fontAt(LABEL, 2), color: st.text });
  return im;
}

// ------------------------------------------------------------------------------------------------ the kit
/** The HD panel kit of token set T: { T, img, insets (HD px), nine } (the frames + controls the DOM skin uses). */
export function panelKitHD(T) {
  return memo(`panelsHD${tkey(T)}`, () => {
    const M = mats(T), D = M.danger, OK = M.ok, V = M.violet, img = {}, insets = {};
    const add = (n, im, ins = null) => { img[n] = im; if (ins) insets[n] = Object.fromEntries(Object.entries(ins).map(([k, v]) => [k, v * 2])); return im; };
    const P = (w, h, s) => plateHD(w * 2, h * 2, s, T);
    const I3 = { l: 3, t: 3, r: 3, b: 3 }, I34 = { l: 3, t: 3, r: 3, b: 4 };
    const btn = (fill, eHi, eSh, eMid, line = T.outline, extra = {}) => ({ line, eHi, eSh, eMid, fill, corner: 1, shadow: T.shadow, ...extra });
    add('panel', bracketsHD(P(48, 48, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.ink, fHi: T.inkRaised, corner: 1, shadow: T.shadow }), T, { y1: 94 }), { l: 8, t: 8, r: 8, b: 8 });
    add('panel-parchment', bracketsHD(P(48, 48, { line: M.parch.line, eHi: T.parchmentHi, eSh: T.parchmentSh, eMid: T.parchment, fill: T.parchment, fSh: T.parchmentSh, corner: 1, shadow: T.shadow }), T, { y1: 94 }), { l: 8, t: 8, r: 8, b: 8 });
    add('modal', bracketsHD(P(48, 48, { line: T.outline, eHi: T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: T.ink, fHi: T.inkRaised, corner: 1, shadow: T.shadow }), T, { mat: 'gold', rivet: 'iron', y1: 94 }), { l: 8, t: 8, r: 8, b: 8 });
    add('panel-plain', P(24, 24, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.ink, fHi: T.inkRaised, corner: 1, shadow: T.shadow }), I34);
    add('button', P(48, 16, btn(T.inkRaised, T.ironHi, T.ironSh, T.iron)), I34);
    add('button-hover', P(48, 16, btn(T.bubbleHi, T.ironHi, T.iron, T.ironHi, T.outline, { fHi: T.iron })), I34);
    add('button-primary', P(48, 16, btn(T.goldLine, T.goldHi, T.goldSh, T.gold, T.outline, { fHi: T.goldSh })), I34);
    add('button-pressed', P(48, 16, btn(T.inkSunk, T.shadow, T.iron, T.ironSh, T.outline, { press: true })), I3);
    add('button-disabled', P(48, 16, { line: T.outline, eHi: T.ironSh, eSh: T.ironSh, eMid: T.ironSh, fill: T.ink, corner: 1, shadow: null }), I3);
    add('button-selected', P(48, 16, btn(T.inkRaised, T.goldHi, T.goldSh, T.gold)), I34);
    add('button-primary-hover', P(48, 16, btn(T.goldLine, T.goldHi, T.gold, T.goldHi, T.outline, { fHi: T.gold })), I34);
    add('button-primary-pressed', P(48, 16, btn(T.goldLine, T.goldLine, T.gold, T.goldSh, T.outline, { press: true, fHi: T.shadow })), I3);
    add('button-primary-disabled', P(48, 16, { line: T.outline, eHi: T.goldSh, eSh: T.goldSh, eMid: T.goldSh, fill: T.inkSunk, corner: 1 }), I3);
    add('button-danger', P(48, 16, btn(T.ink, D.hi, D.sh, D.mid)), I34);
    add('button-danger-hover', P(48, 16, btn(T.inkRaised, D.hi, D.mid, D.hi, T.outline, { fHi: D.line })), I34);
    add('segment', P(24, 13, { line: T.outline, eHi: T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: T.inkRaised, corner: 0 }), I3);
    add('segment-on', P(24, 13, { line: T.outline, eHi: T.goldSh, eSh: T.gold, eMid: T.goldSh, fill: T.goldLine, corner: 0 }), I3);
    add('tab', P(24, 12, { line: T.outline, eHi: T.ironSh, eSh: T.ironSh, eMid: T.ironSh, fill: T.inkSunk, corner: 1, open: 'bottom' }), { l: 3, t: 3, r: 3, b: 1 });
    add('tab-hover', P(24, 12, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.inkRaised, corner: 1, open: 'bottom' }), { l: 3, t: 3, r: 3, b: 1 });
    add('tab-active', (() => { const im = P(24, 13, { line: T.outline, eHi: T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: T.ink, corner: 1, open: 'bottom' }); im.hline(4, 2, 40, T.goldHi); im.hline(4, 3, 40, T.gold); im.hline(4, 4, 40, T.goldSh); return im; })(), { l: 3, t: 3, r: 3, b: 1 });
    add('tab-strip', (() => { const im = new PixelImage(8, 4); im.hline(0, 0, 8, T.ironHi); im.hline(0, 1, 8, T.iron); im.hline(0, 2, 8, T.outline); im.hline(0, 3, 8, T.outline); return im; })());
    const well = (eHi, eSh, fill = T.inkSunk) => P(32, 13, { line: T.outline, eHi, eSh, eMid: T.ironSh, fill, corner: 1 });
    add('input', well(T.shadow, T.iron), I3);
    add('input-hover', well(T.shadow, T.ironHi), I3);
    add('input-focus', well(T.goldLine, T.gold), I3);
    add('input-disabled', well(T.ink, T.ironSh, T.ink), I3);
    add('row', P(24, 24, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.inkRaised, corner: 1 }), I3);
    add('row-hover', P(24, 24, { line: T.outline, eHi: T.ironHi, eSh: T.iron, eMid: T.ironHi, fill: T.bubbleHi, corner: 1 }), I3);
    add('row-selected', P(24, 24, { line: T.outline, eHi: T.goldHi, eSh: T.goldSh, eMid: T.gold, fill: T.inkRaised, corner: 1 }), I3);
    add('row-dead', P(24, 24, { line: T.outline, eHi: T.ironSh, eSh: T.ironSh, eMid: T.ironSh, fill: T.inkSunk, corner: 1 }), I3);
    add('well', P(16, 16, { line: T.outline, eHi: T.shadow, eSh: T.iron, eMid: T.ironSh, fill: T.inkSunk, corner: 1 }), I3);
    add('avatar-well', P(28, 28, { line: T.outline, eHi: T.shadow, eSh: T.iron, eMid: T.ironSh, fill: T.inkSunk, corner: 1 }), I3);
    add('tooltip', P(16, 13, { line: T.outline, eHi: T.goldSh, eSh: T.goldSh, eMid: T.goldSh, fill: T.ink, corner: 1, shadow: T.shadow }), I34);
    add('tip-strip', (() => { const im = P(16, 16, { line: T.outline, eHi: T.goldSh, eSh: T.goldLine, eMid: T.goldSh, fill: T.ink, corner: 0 }); im.vline(4, 4, 24, T.goldHi); im.vline(5, 4, 24, T.gold); return im; })(), { l: 4, t: 3, r: 3, b: 3 });
    add('banner-danger', P(16, 16, { line: T.outline, eHi: D.sh, eSh: D.line, eMid: D.sh, fill: T.inkSunk, corner: 1 }), I3);
    add('chip', P(16, 11, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.ink, corner: 2 }), I3);
    add('chip-gold', P(16, 11, { line: T.outline, eHi: T.gold, eSh: T.goldSh, eMid: T.gold, fill: T.ink, corner: 2 }), I3);
    add('chip-ok', P(16, 11, { line: T.outline, eHi: OK.sh, eSh: OK.line, eMid: OK.sh, fill: T.ink, corner: 2 }), I3);
    add('chip-violet', P(16, 11, { line: T.outline, eHi: V.mid, eSh: V.sh, eMid: V.mid, fill: T.ink, corner: 2 }), I3);
    add('chip-dim', P(16, 11, { line: T.outline, eHi: T.ironSh, eSh: T.ironSh, eMid: T.ironSh, fill: T.inkSunk, corner: 2 }), I3);
    add('badge-unread', P(16, 11, { line: D.line, eHi: D.hi, eSh: D.sh, eMid: D.mid, fill: D.mid, corner: 2 }), I3);
    add('badge-count', P(16, 11, { line: V.line, eHi: V.hi, eSh: V.sh, eMid: V.mid, fill: V.sh, corner: 2 }), I3);
    add('kbd', P(9, 10, { line: T.outline, eHi: T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: T.inkRaised, corner: 1, shadow: T.shadow }), I34);
    // controls
    const box = (on, dis, hov) => P(9, 9, { line: T.outline, eHi: on ? T.goldSh : dis ? T.ink : T.shadow, eSh: on ? T.gold : dis ? T.ironSh : T.ironHi, eMid: on ? T.goldSh : dis ? T.ironSh : T.iron, fill: dis ? T.ink : hov ? T.inkRaised : T.inkSunk, corner: 1 });
    const tick = (im, small = false) => {          // a 2-px check stroke, lit on its upper edge
      const pts = small ? [[6, 9], [7, 10], [8, 11], [9, 10], [10, 9], [11, 8]] : [[4, 9], [5, 10], [6, 11], [7, 12], [8, 11], [9, 10], [10, 9], [11, 8], [12, 7], [13, 6]];
      for (const [x, y] of pts) { im.set(x, y, T.goldHi); im.set(x, y + 1, T.gold); im.set(x, y + 2, T.goldSh); }
      return im;
    };
    add('checkbox', box(false, false, false)); add('checkbox-hover', box(false, false, true)); add('checkbox-disabled', box(false, true, false));
    add('checkbox-on', tick(box(true, false, false)));
    add('checkbox-mixed', (() => { const im = box(true, false, false); im.rect(4, 8, 10, 2, T.gold); im.hline(4, 8, 10, T.goldHi); return im; })());
    add('checkbox-pop', tick(box(true, false, false), true));
    const radio = (on, hov) => {
      const im = new PixelImage(18, 18);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
        const dx = x + 0.5 - 9, dy = y + 0.5 - 9, d = Math.hypot(dx, dy);
        if (d > 8.9) continue;
        let c = d > 7.9 ? T.outline : d > 5.6 ? (dx + dy < 0 ? (on ? T.goldSh : T.shadow) : on ? T.gold : T.ironHi) : hov && !on ? T.inkRaised : T.inkSunk;
        if (on && d <= 3.4) c = dx + dy < -2 ? T.goldHi : dx + dy > 2.4 ? T.goldSh : T.gold;
        im.set(x, y, c);
      }
      return im;
    };
    add('radio', radio(false, false)); add('radio-on', radio(true, false)); add('radio-hover', radio(false, true));
    const sw = (k) => {
      const on = k >= 2, im = P(17, 9, { line: T.outline, eHi: on ? T.goldSh : T.shadow, eSh: on ? T.gold : T.ironHi, eMid: on ? T.goldSh : T.iron, fill: on ? T.goldLine : T.inkSunk, corner: 2 });
      const knob = P(7, 9, on ? { line: T.goldLine, eHi: T.goldHi, eSh: T.goldSh, eMid: T.gold, fill: T.gold, corner: 2 } : { line: T.outline, eHi: M.steel.hi, eSh: M.steel.sh, eMid: M.steel.mid, fill: M.steel.mid, corner: 2 });
      im.blit(knob, [1, 4, 7, 9][k] * 2, 0);
      if (!on) im.rect(26, 8, 2, 2, T.ironSh); else im.rect(8, 8, 2, 2, T.goldSh);
      return im;
    };
    add('switch', sw(0)); add('switch-on', sw(3)); for (let k = 0; k < 4; k++) add(`switch_${k}`, sw(k));
    const track = (fill) => { const im = new PixelImage(32, 10); im.hline(0, 0, 32, T.outline); im.hline(0, 9, 32, T.outline); im.hline(0, 1, 32, fill ? T.goldSh : T.shadow); im.rect(0, 2, 32, 4, fill ? T.gold : T.inkSunk); im.hline(0, 2, 32, fill ? T.goldHi : T.inkSunk); im.rect(0, 6, 32, 3, fill ? T.gold : T.ironSh); im.hline(0, 8, 32, fill ? T.goldSh : T.iron); return im; };
    add('slider-track', track(false), { l: 2, t: 0, r: 2, b: 0 }); add('slider-fill', track(true), { l: 2, t: 0, r: 2, b: 0 });
    const knob = (st) => {
      const gold = st === 'pressed', dis = st === 'disabled';
      const R = gold ? { line: T.goldLine, eHi: T.goldHi, eSh: T.goldSh, eMid: T.gold, fill: T.gold } : { line: T.outline, eHi: dis ? T.iron : T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: dis ? T.ironSh : st === 'hover' ? T.ironHi : T.iron };
      const im = P(7, 12, { ...R, corner: 1, shadow: T.shadow });
      for (const y of [8, 11, 14]) { im.hline(4, y, 6, R.eSh); im.hline(4, y + 1, 6, R.eHi); }
      return im;
    };
    for (const s of ['', 'hover', 'pressed', 'disabled']) add(`slider-knob${s ? '-' + s : ''}`, knob(s));
    const thumb = (hov) => { const im = P(6, 14, { line: T.outline, eHi: hov ? T.ironHi : T.iron, eSh: T.ironSh, eMid: T.iron, fill: hov ? T.iron : T.ironSh, corner: 1 }); for (const y of [11, 14, 17]) { im.hline(4, y, 4, T.outline); im.hline(4, y + 1, 4, hov ? T.ironHi : T.iron); } return im; };
    add('scrollbar-thumb', thumb(false), { l: 0, t: 4, r: 0, b: 4 }); add('scrollbar-thumb-hover', thumb(true), { l: 0, t: 4, r: 0, b: 4 });
    add('scrollbar-track', (() => { const im = new PixelImage(12, 16); im.rect(0, 0, 12, 16, T.inkSunk); im.vline(0, 0, 16, T.outline); im.vline(1, 0, 16, T.shadow); im.vline(2, 0, 16, T.shadow); im.vline(11, 0, 16, T.ironSh); return im; })(), { l: 0, t: 2, r: 0, b: 2 });
    add('divider-iron', (() => { const im = new PixelImage(8, 4); im.hline(0, 0, 8, T.ironSh); im.hline(0, 1, 8, T.shadow); im.hline(0, 2, 8, T.ironHi); im.hline(0, 3, 8, T.iron); return im; })());
    const B = {
      you: ['YOU', { edge: T.iron, edgeSh: T.ironSh, text: T.text }], host: ['HOST', { edge: T.goldSh, edgeSh: T.goldLine, text: T.gold }],
      ready: ['READY', { edge: OK.sh, edgeSh: OK.line, text: T.ok }], st: ['STORYTELLER', { edge: V.mid, edgeSh: V.sh, text: T.st }],
      dead: ['DEAD', { edge: T.ironSh, fill: T.inkSunk, text: T.textDim }], saved: ['SAVED', { edge: OK.sh, edgeSh: OK.line, text: T.ok }],
    };
    for (const [k, [t, st]] of Object.entries(B)) add(`badge-${k}`, badgeHD(t, st, T));
    const nine = {};
    for (const [n, ins] of Object.entries(insets)) nine[n] = nineSlice(img[n], ins);
    return { T, img, insets, nine };
  });
}

// ------------------------------------------------------------------------------------------------ CSS
/** Prefix every selector of a selector list with `scope ` (top-level commas only). */
const scoped = (scope, sel) => {
  const parts = []; let depth = 0, cur = '';
  for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch; }
  parts.push(cur.trim());
  return parts.map((p) => `${scope} ${p}`).join(', ');
};
/** The HD skin rules (frames + controls of out/ui/panels.css) under `scope`, 1 HD image px = var(--hdpx) CSS px. */
export function buildPanelsCssHD(KH, { scope = '.ctp-hd' } = {}) {
  const { img, insets } = KH;
  const uri = (im) => toCanvas(im).toDataURL('image/png');
  const px = (n) => `calc(${n}px * var(--hdpx, 1))`;
  const nine = (name, extra = '') => {
    const i = insets[name];
    return `border-style: solid; border-color: transparent; border-width: ${px(i.t)} ${px(i.r)} ${px(i.b)} ${px(i.l)}; ` +
      `border-image: url(${uri(img[name])}) ${i.t} ${i.r} ${i.b} ${i.l} fill / ${px(i.t)} ${px(i.r)} ${px(i.b)} ${px(i.l)} / 0 repeat; ` +
      `background: none; border-radius: 0; image-rendering: pixelated;${extra}`;
  };
  const pic = (name) => `width: ${px(img[name].w)}; height: ${px(img[name].h)}; background: url(${uri(img[name])}) 0 0 / 100% 100% no-repeat; image-rendering: pixelated;`;
  const L = [`/* pixel3d panel skin at UI density 2 (src/ui/hd/panels.js; generated at runtime). Scope ${scope}; --hdpx = L.hd.scale. */`];
  const rule = (sel, body) => L.push(`${scoped(scope, sel)} { ${body} }`);
  rule('.panel, .ct-art-panel, .ct-chat, .ct-help, .ctp-panel', nine('panel'));
  rule('.ct-modal, .ctp-modal', nine('modal'));
  rule('.ct-art-parchment, .cty-pamphlet, .ctp-parchment', nine('panel-parchment', ' color: var(--ink);'));
  rule('.ctp-panel-plain', nine('panel-plain'));
  const scope2 = ':is(.ct-auth, .ct-home, .ct-waiting, .ct-modal, .ct-help-foot, .ct-chat-form, .screen.center, .ct-toolbar, .ct-admin, .ct-art-buttons, .ctp-skin)';
  const B = `${scope2} button:not(.ct-link, .ct-preset, .ct-waiting-toggle, .ct-chat-min, .ct-help-close, .ct-waiting-newbie, [role='tab'], [role='radio'], .ct-danger-btn, .ct-switch, .ctp-switch)`;
  rule(B, nine('button', ' color: var(--text);'));
  rule(`${B}:hover:not(:disabled)`, nine('button-hover'));
  rule(`${B}:active:not(:disabled)`, nine('button-pressed', ' transform: none;'));
  rule(`${B}[aria-pressed='true']`, nine('button-selected', ' filter: none;'));
  rule(`${B}:disabled`, nine('button-disabled', ' filter: none; color: var(--muted);'));
  rule(`${B}.primary`, nine('button-primary', ' color: #F7E0A0;'));
  rule(`${B}.primary:hover:not(:disabled)`, nine('button-primary-hover'));
  rule(`${B}.primary:active:not(:disabled)`, nine('button-primary-pressed'));
  rule(`${B}.primary:disabled`, nine('button-primary-disabled', ' color: #A57B36;'));
  rule(`${scope2} button.ct-danger-btn`, nine('button-danger'));
  rule(`${scope2} button.ct-danger-btn:hover:not(:disabled)`, nine('button-danger-hover'));
  rule(".ct-seg button, .ct-seg [role='radio']", nine('segment'));
  rule(".ct-seg [aria-checked='true'], .ct-seg [aria-pressed='true']", nine('segment-on', ' color: #F7E0A0;'));
  rule("[role='tab']", nine('tab'));
  rule("[role='tab']:hover:not([aria-selected='true'])", nine('tab-hover'));
  rule("[role='tab'][aria-selected='true']", nine('tab-active', ' color: var(--accent);'));
  rule("[role='tablist']", `border-bottom: ${px(4)} solid transparent; border-image: url(${uri(img['tab-strip'])}) 0 0 4 0 / 0 0 ${px(4)} 0 repeat;`);
  rule("input:not([type='checkbox'], [type='radio'], [type='range']), textarea", nine('input'));
  rule("input:not([type='checkbox'], [type='radio'], [type='range']):hover:not(:disabled), textarea:hover:not(:disabled)", nine('input-hover'));
  rule("input:not([type='checkbox'], [type='radio'], [type='range']):focus-visible, textarea:focus-visible", nine('input-focus', ' outline: none;'));
  rule('input:disabled, textarea:disabled', nine('input-disabled'));
  rule("input[type='checkbox']", `appearance: none; -webkit-appearance: none; border: 0; border-image: none; margin: 0; padding: 0; ${pic('checkbox')}`);
  rule("input[type='checkbox']:hover:not(:disabled)", `background-image: url(${uri(img['checkbox-hover'])});`);
  rule("input[type='checkbox']:checked", `background-image: url(${uri(img['checkbox-on'])});`);
  rule("input[type='checkbox']:indeterminate", `background-image: url(${uri(img['checkbox-mixed'])});`);
  rule("input[type='checkbox']:disabled", `background-image: url(${uri(img['checkbox-disabled'])});`);
  rule("input[type='radio']", `appearance: none; -webkit-appearance: none; border: 0; border-image: none; margin: 0; padding: 0; ${pic('radio')}`);
  rule("input[type='radio']:hover:not(:disabled)", `background-image: url(${uri(img['radio-hover'])});`);
  rule("input[type='radio']:checked", `background-image: url(${uri(img['radio-on'])});`);
  rule('button.ct-switch, .ct-switch, .ctp-switch', `border: 0; border-image: none; padding: 0; min-height: 0; ${pic('switch')}`);
  rule('button.ct-switch.on, .ct-switch.on, .ctp-switch.on', `background-image: url(${uri(img['switch-on'])});`);
  rule("input[type='range']", `appearance: none; -webkit-appearance: none; background: none; height: ${px(24)}; border: 0;`);
  for (const [tr, th] of [['::-webkit-slider-runnable-track', '::-webkit-slider-thumb'], ['::-moz-range-track', '::-moz-range-thumb']]) {
    rule(`input[type='range']${tr}`, `height: ${px(10)}; ${nine('slider-track')}`);
    rule(`input[type='range']${th}`, `appearance: none; -webkit-appearance: none; border: 0; border-radius: 0; margin-top: ${px(-8)}; ${pic('slider-knob')}`);
    rule(`input[type='range']:active${th}`, `background-image: url(${uri(img['slider-knob-pressed'])});`);
  }
  rule("input[type='range']::-moz-range-progress", `height: ${px(10)}; ${nine('slider-fill')}`);
  rule('::-webkit-scrollbar', `width: ${px(12)}; height: ${px(12)};`);
  rule('::-webkit-scrollbar-track', nine('scrollbar-track'));
  rule('::-webkit-scrollbar-thumb', nine('scrollbar-thumb'));
  rule('::-webkit-scrollbar-thumb:hover', nine('scrollbar-thumb-hover'));
  rule('.ct-member, .ctn-seat, .ctp-row', nine('row'));
  rule('.ct-member:hover, .ctn-seat:hover, .ctp-row:hover', nine('row-hover'));
  rule('.ctp-row.selected, .ctn-seat.selected', nine('row-selected'));
  rule('.ct-member-away, .ctp-row.dead', nine('row-dead'));
  rule('.ct-badge', nine('chip', ' font-variant: small-caps;'));
  rule('.ct-badge-host', nine('chip-gold'));
  rule('.ct-badge-ready, .ctn-status-saved', nine('chip-ok'));
  rule('.ct-badge-st', nine('chip-violet'));
  rule('.ct-badge-away', nine('chip-dim'));
  rule('.ctp-tooltip, [role=tooltip]', nine('tooltip'));
  rule('.ct-chat-unread, .ctp-unread', nine('badge-unread', ` color: ${KH.T.parchmentHi}; border-radius: 0; background: none;`));
  rule('.ct-chat-dot, .ctp-count', nine('badge-count', ` color: ${KH.T.parchmentHi}; border-radius: 0; background: none;`));
  rule('.ct-waiting-newbie, .ctp-tip', nine('tip-strip'));
  rule('.ctp-well', nine('well'));
  rule('.ctp-avatar-well, .ctn-portrait', nine('avatar-well'));
  rule('hr, .ctp-divider', `border: 0; height: ${px(4)}; background: url(${uri(img['divider-iron'])}) 0 0 / ${px(8)} ${px(4)} repeat-x;`);
  rule('kbd, .ctp-kbd', nine('kbd'));
  return L.join('\n') + '\n';
}
const installed = new Map();
/**
 * Browser: build the HD skin of token set T and inject it once (<style id="ctp-hd-css">, replaced when T changes, e.g.
 * day -> night). apply: add the scope class to <html> (or add `ctp-hd` to any container yourself). Returns the CSS text.
 */
export function installPanelsHD(doc, T, { scope = '.ctp-hd', apply = false } = {}) {
  const k = tkey(T) + scope;
  let css = installed.get(k);
  if (!css) { css = buildPanelsCssHD(panelKitHD(T), { scope }); installed.set(k, css); }
  let el = doc.getElementById('ctp-hd-css');
  if (!el) { el = doc.createElement('style'); el.id = 'ctp-hd-css'; doc.head.append(el); }
  if (el.textContent !== css) el.textContent = css;
  if (apply) doc.documentElement.classList.add(scope.replace(/^\./, ''));
  void ramp;
  return css;
}
