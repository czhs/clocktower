// HUD art (owner: hud group; docs/UI.md §1 rows 22, 26–38, §2 language, §4 "hud"). Pure, deterministic drawers for
// the v2 player HUD rebuilt in the pixel3d style: every function paints into a kit PixelImage (the screen layer
// L.screen in the mock HUD, or a frame for the atlas) from a plain state object + the token set T (+ t seconds for
// animated parts, always on the 30 Hz grid). No three.js here (the tower clock wedge is ./tower.js).
//
// Language: ink panels with iron keylines, parchment text, gold for primary/focus, stage colours from the v2 clock
// (discussion gold, nominations red = danger ramp, bedtime blue = good ramp, paused iron + dashed keyline). Small lit
// objects (mini dial medallion, glyphs, knob) are shaded from the upper left: hi top-left, sh bottom-right, a darker
// cooler line. Text: kit 'body' for sentences, DISPLAY (./font.js) for titles + timer figures, LABEL for small caps.
//
//   drawClockChip / dial          ctc-chip + ctc-dial (stage, urgent pulse, paused, due) + ctc-plus
//   drawTray / drawVoteCard / drawClockResult / drawClockNote     ctc-tray, ctc-vote (+drain), ctc-result, ctc-note
//   drawStClock                   ctc-stctl (Storyteller clock control)
//   drawRoleChip / drawRoleCard   cth-card closed (role · house · dead · badge) / expanded (ability, chips, tabs)
//   drawToolbar / drawPhaseChip   ct-toolbar (notebook, abort, settings, help, leave) / cth-phase (+ icon, countdown)
//   drawToast                     cth-toast(-death|-execution|-error|-game_over) + ct-toast (error)
//   drawHint / drawPrompt / drawKeyHint   cth-hint (tones, full -> pill), ct-game-prompt, ct-hint (first-run keys)
//   drawCountdown                 ct-countdown(-low)
//   drawVoicePill + dot / wave / micChip   ctv-pill, ctv-dot-*, ctv-wave, ctv-mic-*, ctv-pill-talk
//   drawJoystick / drawUseButton  ct-touch-stick + knob, ct-touch-use (+locked)
//   drawConn / drawLoading / spinner   ct-conn(-lost), ct-game-loading/failed, ct-spinner
//   glyphs: GLYPH[name](T) 9x9 / 7x7 sprites (toolbar, phase, house, ghost, lock, mic, close, kbd)
import { PixelImage, drawText, textWidth, wrapText, drawBox, ramp, withAlpha, dissolve, GRID_HZ, withHD } from '../kit.js';
import { DISPLAY, LABEL, italicize } from './font.js';

// ------------------------------------------------------------------------------------------------ density (D=2) hooks
/**
 * (density wave 2, additive; docs/UI-HD-WAVE2.md) Empty unless src/ui/hd/hud.js prepareHudHD() fills it. Drawers that
 * build their own images take the HD route only when the target is a density VIEW (img.isView); the small sprite
 * factories return the same 1x pixels with an extra `.hd` (a view blits it, a plain image never reads it). With no
 * hooks (the default) every function below is byte-identical to before (shots/ui-hd-wave2/regress.mjs).
 */
export const HD_HOOKS = {};
const hdOf = (k, im, ...a) => (HD_HOOKS[k] ? withHD(im, HD_HOOKS[k](...a)) : im);

// ------------------------------------------------------------------------------------------------ timing (v2, kept)
/** v2 durations (ms) — game rules / UX tuning, kept exactly; animation is expressed in whole 30 Hz grid frames. */
export const TIMING = {
  URGENT_MS: 30_000,          // clock/logic.ts: the chip pulses in the last 30 s
  PULSE_MS: 1600,             // clock.css ctc-pulse 1.6 s
  RESULT_MS: 2800,            // ClockChip RESULT_MS
  NOTE_MS: 4500,              // ClockChip note timeout
  ASK_MS: 4000,               // "Asking the town…" gives up
  PROPOSAL_WINDOW_MS: 30_000, // clock/logic.ts
  HINT_MS: 6000,              // hints.tsx HINT_MS (fade keyframes run 6.6 s: in 0–5 %, out 88–100 %)
  HINT_ANIM_MS: 6600,
  LOW_S: 10,                  // shared.tsx Countdown: low at <= 10 s, pulse 1 s
  LOW_PULSE_MS: 1000,
  WAIT_PULSE_MS: 1000,        // voice.css ctv-pulse 1 s
  VISIT_PULSE_MS: 2400,       // hud.css cth-visit 2.4 s
  TOAST_ERROR_MS: 9000,       // logic.ts toastMs
  toastMs: (kind, text) => (kind === 'error' ? 9000 : Math.max(6000, Math.min(14_000, 3500 + 60 * text.length))),
  SPINNER_FPS: 10,
  WAVE_FPS: 7.5,
};
/** Grid frame index of t seconds (tolerant to capture times rounded to 4 decimals: docs/UI.md §6 emotes). */
export const gf = (t) => Math.floor(Math.max(0, t) * GRID_HZ + 0.01);
/** Signed grid frame index (negative before an event starts): ages of timed elements. */
export const sgf = (t) => Math.floor(t * GRID_HZ + 0.01);

// ------------------------------------------------------------------------------------------------ small helpers
/** Stamp string-art rows (one char per pixel) through a colour key ({char: colour}); unknown chars stay clear. */
export function stamp(img, x, y, rows, key) {
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = key[r[i]]; if (c) img.set(x + i, y + j, c); } });
  return img;
}
export function sprite(rows, key) {
  const im = new PixelImage(Math.max(...rows.map((r) => r.length)), rows.length);
  return stamp(im, 0, 0, rows, key);
}
const tw = (s, f = 'body') => textWidth(s, f);
/** drawText at a baseline-free "box" convention: y = cap top. Thin wrapper so fonts are objects or names. */
const text = (img, x, y, s, color, font = 'body', align = 'left', extra = {}) => drawText(img, x, y, s, { font, color, align, ...extra });
/** Pill / box styles (token names or colours; kit drawBox resolves names against T). */
const S = {
  chip: (edge = 'iron') => ({ line: 'outline', edge, fill: 'ink', hi: 'inkRaised', sh: null, corner: 2, shadow: false }),
  nest: (edge, fill) => ({ line: 'outline', edge, fill, hi: null, sh: null, corner: 2, shadow: false }),
  panel: (edge = 'iron') => ({ line: 'outline', edge, fill: 'ink', hi: 'inkRaised', sh: null, corner: 1, shadow: true }),
  button: (state = 'normal') => state === 'pressed' ? { line: 'outline', edge: 'iron', fill: 'inkSunk', hi: 'ironSh', corner: 1, press: 1 }
    : state === 'hover' ? { line: 'outline', edge: 'ironHi', fill: 'inkRaised', hi: 'ironHi', sh: 'ironSh', corner: 1 }
      : state === 'disabled' ? { line: 'outline', edge: 'ironSh', fill: 'ink', hi: null, sh: null, corner: 1 }
        : state === 'gold' ? { line: 'goldLine', edge: 'gold', fill: 'goldSh', hi: 'goldHi', sh: null, corner: 1 }
          : state === 'selected' ? { line: 'outline', edge: 'goldHi', fill: 'inkRaised', hi: 'gold', sh: null, corner: 1 }
            : { line: 'outline', edge: 'iron', fill: 'inkRaised', hi: 'ironHi', sh: 'ironSh', corner: 1 },
};
/** Re-colour every 2-of-4 pixel of a box's keyline ring with its fill (v2 `border-style: dashed`, paused clock). */
function dashEdge(img, x, y, w, h, fill, from = 0) {
  for (let i = 2 + from; i < w - 2; i++) if (((i - from) >> 1) & 1) { img.set(x + i, y + 1, fill); img.set(x + i, y + h - 2, fill); }
}
/** 1-px glow rings (≤ 2 alpha steps, light FX only: docs/UI.md §2.3) around the opaque shape of `shape`. */
function glowRings(shape, color, alphas) {
  const g = shape.clone();
  for (const a of alphas) g.outline(withAlpha(color, a), {});
  return g;
}

// ------------------------------------------------------------------------------------------------ stage palettes
/** v2 stage colours (clock.css) re-expressed in tokens: discussion = gold, nominations = danger ramp, bedtime = good ramp. */
export function stagePal(stage, T) {
  if (stage === 'nominations') { const r = ramp(T.danger); return { stage, edge: T.danger, wedge: T.danger, hi: r.hi, sh: r.sh, line: r.line, time: T.evil, label: T.text }; }
  if (stage === 'bedtime') { const r = ramp(T.good); return { stage, edge: r.sh, wedge: T.good, hi: r.hi, sh: r.sh, line: r.line, time: T.good, label: T.text }; }
  if (stage === 'paused') return { stage, edge: T.iron, wedge: T.ironHi, hi: T.ironHi, sh: T.ironSh, line: T.outline, time: T.textDim, label: T.textDim, dashed: true };
  // wedge = goldSh (not gold): a full gold wedge under the gold bezel read as a coin and hid the 12 o'clock hand
  return { stage: 'discussion', edge: T.goldSh, wedge: T.goldSh, hi: T.goldHi, sh: T.goldSh, line: T.goldLine, time: T.gold, label: T.text };
}
export const STAGES = ['discussion', 'nominations', 'bedtime'];
/** v2 clockLine() labels: [counting, at zero]. */
export function stageLabel(stage, { onTheBlock = true, due = false, paused = false } = {}) {
  if (paused) return 'Paused';
  const L = { discussion: ['Nominations open in', 'Nominations open'], nominations: onTheBlock ? ['Execution in', 'Time for the execution'] : ['Nominations close in', 'Nominations close'], bedtime: ['Bedtime', 'Night falls'] }[stage];
  return due ? L[1] : L[0];
}
/** v2 formatCountdown: whole seconds rounded UP, m:ss (h:mm:ss over an hour). */
export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ------------------------------------------------------------------------------------------------ mini dial (ctc-dial)
/**
 * The mini dial as a brass medallion (a tiny tower dial): outer line, a lit gold bezel (hi upper-left, sh lower-right),
 * a dark face, the stage wedge = time left (clockwise from 12, v2 MiniDial), the parchment hand at the wedge end and a
 * gold hub. Paused: the wedge is half-stippled (v2 35 % opacity) and two parchment bars replace the hand.
 */
export function dial(T, { stage = 'discussion', frac = 1, paused = false, size = 15 } = {}) {
  const P = stagePal(stage, T);
  const im = new PixelImage(size, size);
  const c = size / 2, R = c - 0.2, Rb = R - 1, Rf = Rb - 1.25, mid = Math.floor(c);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
    if (d > R) continue;
    if (d > Rb) { im.set(x, y, T.goldLine); continue; }
    if (d > Rf) { const s = dx + dy; im.set(x, y, s < -1.6 ? T.goldHi : s > 1.6 ? T.goldSh : T.gold); continue; }
    if (d > Rf - 0.9) { im.set(x, y, T.goldLine); continue; }          // the bezel's inner lip: keeps a full wedge apart from the brass
    let col = T.inkSunk;
    const a = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
    const inW = frac >= 0.999 || (frac > 0.002 && a < frac);
    if (inW && (!paused || ((x + y) & 1) === 0)) col = P.wedge;
    im.set(x, y, col);
  }
  if (paused) { im.rect(mid - 2, mid - 2, 2, 5, T.parchment); im.rect(mid + 1, mid - 2, 2, 5, T.parchment); }
  else {
    const a = (frac > 0.002 ? frac : 0) * 2 * Math.PI, r = Rf - 1.3;
    im.line(mid, mid, Math.round(mid + Math.sin(a) * r), Math.round(mid - Math.cos(a) * r), T.parchmentHi);
    im.set(mid, mid, T.gold);
  }
  return hdOf('dial', im, T, { stage, frac, paused, size });
}

// ------------------------------------------------------------------------------------------------ clock chip (ctc-chip)
const CHIP_H = 15;
export function clockChipWidth(o) {
  const lw = tw(o.label.toUpperCase(), LABEL), tm = o.time ? tw(o.time, DISPLAY) : 0, pw = o.plus ? tw('+ time') + 10 : 0;
  return 15 + 4 + lw + (tm ? 5 + tm : 0) + (pw ? 5 + pw + 2 : 7);
}
/** Urgent pulse bands (v2 ctc-pulse 1.6 s ease-in-out box-shadow): 0 / 1 / 2 rings, stepped on the grid. */
export function pulseBands(t, period = TIMING.PULSE_MS) {
  const n = Math.round(period / 1000 * GRID_HZ), k = gf(t) % n, q = k / n;
  return q < 0.25 ? 0 : q < 0.375 ? 1 : q < 0.625 ? 2 : q < 0.75 ? 1 : 0;
}
/**
 * Clock chip at (x, y) (left edge of the dial medallion). o = {stage, label, time, frac, paused, urgent, due, plus:
 * null|'normal'|'on'|'disabled', t, reduced, st}. The dial medallion is set into the chip's left end. Returns {w, h}.
 */
export function drawClockChip(img, x, y, T, o) {
  if (img.isView && HD_HOOKS.drawClockChip) return HD_HOOKS.drawClockChip(img, x, y, T, o);
  const P = stagePal(o.paused ? 'paused' : o.stage, T), w = clockChipWidth(o), H = CHIP_H;
  const edge = o.urgent ? T.danger : P.edge;
  const shape = new PixelImage(w + 4, H + 4);
  drawBox(shape, 9, 2, w - 7, H, S.chip(edge), T);
  shape.blit(dial(T, { stage: o.stage, frac: o.frac, paused: o.paused }), 2, 2);
  if (o.urgent && !o.reduced) {
    const n = pulseBands(o.t || 0);
    if (n) img.blit(glowRings(shape, T.danger, n === 2 ? [150, 70] : [110]), x - 2, y - 2);
  }
  img.blit(shape, x - 2, y - 2);
  if (P.dashed) dashEdge(img, x + 7, y, w - 7, H, T.ink, 3);
  let cx = x + 19;
  const label = o.label.toUpperCase();
  text(img, cx, y + 5, label, o.due ? T.goldHi : P.label, LABEL);
  cx += tw(label, LABEL) + 5;
  if (o.time) { text(img, cx, y + 2, o.time, o.urgent ? ramp(T.danger).hi : P.time, DISPLAY); cx += tw(o.time, DISPLAY) + 5; }
  if (o.plus) drawPlus(img, x + w - 2 - (tw('+ time') + 10), y + 2, o.plus, T);
  return { w, h: H };
}
/** ctc-plus "+ time" nested pill (11 tall): normal (brown + gold keyline) | on (gold) | disabled (iron). Returns width. */
export function drawPlus(img, x, y, state, T) {
  const pw = tw('+ time') + 10;
  const st = state === 'on' ? S.nest('gold', 'goldSh') : state === 'disabled' ? S.nest('ironSh', 'ink') : S.nest('goldSh', 'goldLine');
  drawBox(img, x, y, pw, 11, st, T);
  text(img, x + 5, y + 2, '+ time', state === 'on' ? T.parchmentHi : state === 'disabled' ? T.textDim : T.goldHi);
  return pw;
}
/** Urgent glow bands alone (no chip) around a box of w x h (corner 2): n = 1 | 2 rings. */
export function urgentGlow(w, h, n, T) {
  const sh = new PixelImage(w + 4, h + 4);
  drawBox(sh, 2, 2, w, h, S.chip('danger'), T);
  const g = glowRings(sh, T.danger, n === 2 ? [150, 70] : [110]);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (sh.alpha(x, y)) g.erase(x, y);
  return g;
}

// ------------------------------------------------------------------------------------------------ tray / vote / result
const btn = (img, x, y, w, h, label, state, T, { font = 'body', color = null, glyph = null } = {}) => {
  const st = S.button(state === 'on-yes' || state === 'on-no' ? 'pressed' : state);
  if (state === 'on-yes') Object.assign(st, { edge: 'ok', fill: ramp(T.ok, { line: 0.42 }).line, hi: ramp(T.ok).sh });
  if (state === 'on-no') Object.assign(st, { edge: 'danger', fill: ramp(T.danger, { line: 0.4 }).line, hi: ramp(T.danger).sh });
  drawBox(img, x, y, w, h, st, T);
  const press = st.press ? 1 : 0;
  const c = color || (state === 'disabled' ? T.textDim : state === 'gold' ? T.parchmentHi : state === 'on-yes' ? ramp(T.ok).hi : state === 'on-no' ? T.parchmentHi : T.text);
  const gw = glyph ? glyph.w + (label ? 3 : 0) : 0, lw = label ? tw(label, font) : 0;
  const x0 = x + Math.floor((w - gw - lw) / 2) + press;
  const ty = y + Math.floor((h - (font === 'body' ? 6 : font === LABEL ? 5 : 7)) / 2) + press;
  if (glyph) img.blit(glyph, x0, y + Math.floor((h - glyph.h) / 2) + press);
  if (label) text(img, x0 + gw, ty, label, c, font);
};
export const buttonWidth = (label, pad = 8, font = 'body') => tw(label, font) + 2 * pad;

/** ctc-tray: "Ask for" + [+1 min][+2 min][+5 min] (an option over today's cap is disabled). Returns {w, h}. */
export function drawTray(img, cx, y, T, { options = [{ minutes: 1, ok: true }, { minutes: 2, ok: true }, { minutes: 5, ok: false }], hover = null } = {}) {
  const labels = options.map((o) => `+${o.minutes} min`), bw = labels.map((l) => buttonWidth(l, 5));
  const w = 6 + tw('Ask for') + 4 + bw.reduce((a, b) => a + b + 3, 0) + 3, h = 21, x = cx - Math.floor(w / 2);
  drawBox(img, x, y, w, h, S.panel('iron'), T);
  text(img, x + 6, y + 8, 'Ask for', T.textDim);
  let bx = x + 6 + tw('Ask for') + 4;
  options.forEach((o, i) => { btn(img, bx, y + 3, bw[i], 15, labels[i], !o.ok ? 'disabled' : hover === i ? 'hover' : 'normal', T); bx += bw[i] + 3; });
  return { w, h, x };
}
/**
 * ctc-vote: "Ada proposes +2 min" + [Yes][No] + "1 OF 3 · 29 S" + the draining window bar (whole px, gold; green when
 * passing). my = null|'yes'|'no'. Returns {w, h}.
 */
export function drawVoteCard(img, x, y, w, T, { title = 'Ada proposes +2 min', my = null, yes = 1, needed = 3, secs = 29, frac = 29 / 30, passing = false, hover = null } = {}) {
  const h = 40, edge = passing ? ramp(T.ok).sh : T.goldSh;
  drawBox(img, x, y, w, h, S.panel(edge), T);
  text(img, x + 6, y + 5, title, T.goldHi);
  const closed = secs <= 0;
  btn(img, x + 5, y + 15, 32, 16, 'Yes', closed ? 'disabled' : my === 'yes' ? 'on-yes' : hover === 'yes' ? 'hover' : 'normal', T);
  btn(img, x + 40, y + 15, 32, 16, 'No', closed ? 'disabled' : my === 'no' ? 'on-no' : hover === 'no' ? 'hover' : 'normal', T);
  const tally = `${Math.min(yes, 99)} OF ${needed}`, rest = ` · ${secs} S`;
  const mx = x + w - 6 - tw(tally + rest, LABEL);
  text(img, mx, y + 21, tally, passing ? T.ok : T.text, LABEL);
  text(img, mx + tw(tally, LABEL), y + 21, rest, T.textDim, LABEL);
  // drain: 2-px bar along the bottom inside the keyline (v2 3 px at x2 = 1.5 -> 2 texels), whole-px width steps
  const bx = x + 2, bw = w - 4, fill = Math.round(bw * Math.max(0, Math.min(1, frac)));
  img.rect(bx, y + h - 5, bw, 2, T.inkSunk);
  if (fill > 0) { img.rect(bx, y + h - 5, fill, 1, passing ? ramp(T.ok).hi : T.goldHi); img.rect(bx, y + h - 4, fill, 1, passing ? T.ok : T.gold); }
  return { w, h };
}
/** ctc-result / ctc-note: a one-line card under the chip (RESULT_MS 2800 / NOTE_MS 4500). kind ok|no|asking|note. */
export function drawClockResult(img, cx, y, T, { text: s = '+2 min added', kind = 'ok' } = {}) {
  const str = kind === 'ok' ? `✓ ${s}` : s;
  const w = tw(str) + 14, h = 15, x = cx - Math.floor(w / 2);
  const edge = kind === 'ok' ? ramp(T.ok).sh : kind === 'note' ? ramp(T.danger).sh : T.iron;
  drawBox(img, x, y, w, h, kind === 'note' ? { ...S.panel(edge), fill: ramp(T.danger, { line: 0.4 }).line, hi: null } : S.panel(edge), T);
  text(img, x + 7, y + 4, str, kind === 'ok' ? ramp(T.ok).hi : kind === 'no' ? T.textDim : kind === 'note' ? T.parchmentHi : T.text);
  return { w, h, x };
}

// ------------------------------------------------------------------------------------------------ glyphs
// 9x9 toolbar glyphs (7x7 art + own line), 7x7 inline glyphs (phase, house, ghost, lock), 5x7 mic, 5x5 close.
const gk = (T) => ({ H: T.goldHi, M: T.gold, S: T.goldSh, L: T.goldLine, P: T.parchment, p: T.parchmentSh, h: T.parchmentHi, D: T.inkSunk });
export const GLYPH = {
  // a notebook: gold spine + parchment page with ink lines (v2 📓 glyph)
  notebook: (T) => sprite([
    'LLLLLLLL.', 'LHhhhhhpL', 'LMPnnnPpL', 'LMPPPPPpL', 'LMPnnnnpL', 'LMPPPPPpL', 'LSPnnPPpL', 'LSppppppL', 'LLLLLLLL.'],
  { ...gk(T), n: T.parchmentLine }),
  // a cog: 8 teeth round a plus-shaped hole, lit from the upper left
  gear: (T) => {
    const k = gk(T), rows = ['..#.#..', '.#####.', '###.###', '.#...#.', '###.###', '.#####.', '..#.#..'];
    const im = new PixelImage(9, 9);
    rows.forEach((r, y) => { for (let x = 0; x < 7; x++) if (r[x] === '#') im.set(x + 1, y + 1, x + y < 5 ? k.H : x + y > 7 ? k.S : k.M); });
    im.outline(k.L, {});
    return im;
  },
  help: (T) => { const im = sprite(['.HHH.', 'HM.MM', '...MM', '..MS.', '..M..', '.....', '..S..'], gk(T)); const o = new PixelImage(7, 9); o.blit(im, 1, 1); o.outline(T.goldLine, {}); return o; },
  leave: (T) => sprite(['..L....', '.LHL...', 'LHHMLLL', 'LMMMMML', 'LSMSLLL', '.LSL...', '..L....'], gk(T)),
  abort: (T) => { const r = ramp(T.warn); return sprite(['LLLLLLL', 'LHHHHML', 'LHMMMSL', 'LHMMMSL', 'LHMMMSL', 'LMSSSSL', 'LLLLLLL'], { L: r.line, H: r.hi, M: r.mid, S: r.sh }); },
  sun: (T) => sprite(['...H...', '.H...M.', '..HHM..', 'H.HMM.S', '..MMS..', '.M...S.', '...S...'], gk(T)),
  dawn: (T) => sprite(['...H...', '.H...M.', '..HHM..', '.HHMMS.', 'SSSSSSS', '.......', '.S.S.S.'], gk(T)),
  moon: (T) => {
    const im = new PixelImage(7, 7), g = ramp(T.good);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const a = Math.hypot(x + 0.5 - 3.5, y + 0.5 - 3.5) <= 3.4, b = Math.hypot(x + 0.5 - 5.0, y + 0.5 - 2.6) <= 2.9;
      if (a && !b) im.set(x, y, x + y < 5 ? g.hi : x + y > 7 ? g.sh : T.good);
    }
    return im;
  },
  star: (T) => sprite(['...H...', '...H...', '..HMM..', 'HHMMMSS', '..MMS..', '...S...', '...S...'], gk(T)),
  bell: (T) => sprite(['...M...', '..HMM..', '.HMMMS.', '.HMMMS.', '.HMMMS.', 'HMMMMSS', '...S...'], gk(T)),
  ring: (T) => sprite(['..MMM..', '.M...M.', 'M.....S', 'M.....S', 'M.....S', '.M...S.', '..SSS..'], gk(T)),
  candle: (T) => sprite(['..H..', '.HM..', '..S..', '.hPp.', '.hPp.', '.hPp.', 'SSSSS'], gk(T)),
  house: (T) => sprite(['...M...', '..HMM..', '.HMMMS.', 'SSSSSSS', '.hP.Pp.', '.hPDPp.', '.hPDPp.'], gk(T)),
  ghost: (T) => sprite(['..ggg..', '.ggggs.', 'ggLgLss', 'gggggss', 'gggggss', 'ggggsss', 'g.gs.s.'], { g: T.ghost, s: T.ghostSh, L: T.outline }),
  skull: (T) => sprite(['.hhhh.', 'hPPPPp', 'PDPPDp', 'PPPPPp', '.PDPp.', '.P.p..'], gk(T)),
  lock: (T) => sprite(['..SSS..', '.S...S.', '.S...S.', 'HMMMMMS', 'HMMDMMS', 'HMMDMMS', 'SSSSSSS'], gk(T)),
  door: (T) => sprite(['..LLLLL..', '.LHHMMSL.', 'LHHMMMSSL', 'LHMMMMMSL', 'LHMMMMHSL', 'LHMMMMMSL', 'LHMMMMMSL', 'LHMMMMMSL', 'LLLLLLLLL'], gk(T)),
  // ✋ raised hand (v2 short 'Hand up'): three fingers split by parchmentLine over the palm, thumb left. 7x7
  hand: (T) => sprite(['.h.h.h.', '.PlPlP.', '.PlPlPp', 'hPPPPPp', '.PPPPPp', '..PPPp.', '..ppp..'], { ...gk(T), l: T.parchmentLine }),
  // ❄ snowflake (v2 short 'Paused', frozen tone): ghost-blue arms, lower-right arms in ghostSh. 7x7
  snow: (T) => sprite(['...g...', '.g.g.g.', '..ggg..', 'ggg.sss', '..sss..', '.s.s.s.', '...s...'], { g: T.ghost, s: T.ghostSh }),
  // ⚖ scales (v2 vote-result / on-the-block): post + beam, two hanging pans, foot; gold lit from the upper left. 9x9
  scales: (T) => sprite(['....H....', '.HHHMMSS.', '.H..M..S.', 'H.H.M.S.S', 'HMM.M.MSS', '.M..M..S.', '....M....', '..HMMMS..', '.SSSSSSS.'], gk(T)),
  close: (T, c = T.textDim) => sprite(['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], { '#': c }),
  pause: (T, c = T.text) => sprite(['##.##', '##.##', '##.##', '##.##', '##.##'], { '#': c }),
  play: (T, c = T.text) => sprite(['#...', '##..', '###.', '##..', '#...'], { '#': c }),
  minus: (T, c = T.text) => sprite(['#####'], { '#': c }),
  plus: (T, c = T.text) => sprite(['..#..', '..#..', '#####', '..#..', '..#..'], { '#': c }),
  caretUp: (T, c = T.gold) => sprite(['..#..', '.###.', '#####'], { '#': c }),
  caretDown: (T, c = T.gold) => sprite(['#####', '.###.', '..#..'], { '#': c }),
  mic: (T, c = T.text, off = false) => {
    const im = sprite(['.###.', '.###.', '.###.', '#.#.#', '.###.', '..#..', '.###.'], { '#': c });
    if (off) { const r = ramp(T.danger); for (let i = 0; i < 7; i++) im.set(Math.min(4, Math.floor(i * 5 / 7)), i, r.hi); }
    return im;
  },
};
/** Phase pill icon per v2 PhaseBar: ☾ night, 🔔 bedtime, ☀ dawn, ☼ day (◯ gathered), ✦ otherwise. */
export function phaseIcon(phase, gathered, T) {
  if (phase === 'night' || phase === 'first_night') return GLYPH.moon(T);
  if (phase === 'bedtime') return GLYPH.bell(T);
  if (phase === 'dawn') return GLYPH.dawn(T);
  if (phase === 'day') return gathered ? GLYPH.ring(T) : GLYPH.sun(T);
  return GLYPH.star(T);
}
export const PHASE_LABEL = { setup: 'Setting up', first_night: 'First night', day: 'Day', bedtime: 'Bedtime', night: 'Night', dawn: 'Dawn', finished: 'Game over' };
export function phaseTitle(phase, day) {
  if (phase === 'bedtime' && day === 0) return 'Bedtime — first night';
  if (phase === 'day' || phase === 'bedtime') return `${PHASE_LABEL[phase]} ${day}`;
  return PHASE_LABEL[phase];
}

// ------------------------------------------------------------------------------------------------ countdown (ct-countdown)
/** m:ss in gold; <= 10 s: red, blinking at the v2 1 s pulse (2 stepped states; reduced motion: steady red). */
export function drawCountdown(img, x, y, secs, T, { font = LABEL, t = 0, reduced = false, align = 'left' } = {}) {
  const s = Math.max(0, Math.ceil(secs)), str = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const low = s <= TIMING.LOW_S;
  const dim = low && !reduced && gf(t) % 30 >= 15;
  const col = low ? (dim ? ramp(T.danger).sh : T.evil) : T.gold;
  return { ...drawText(img, x, y, str, { font, color: col, align }), str, low };
}

// ------------------------------------------------------------------------------------------------ phase chip (cth-phase)
/** cth-phase at the RIGHT edge rx: "DAY 1" + icon (+ countdown, + visit candle). Returns {x, w, h}. */
export function drawPhaseChip(img, rx, y, T, { phase = 'day', day = 1, gathered = false, countdown = null, visit = false, t = 0, reduced = false } = {}) {
  const label = phaseTitle(phase, day).toUpperCase(), icon = phaseIcon(phase, gathered, T);
  const cd = countdown !== null ? `${Math.floor(Math.ceil(countdown) / 60)}:${String(Math.ceil(countdown) % 60).padStart(2, '0')}` : null;
  const w = 6 + tw(label, LABEL) + 4 + icon.w + (cd ? 4 + tw(cd, LABEL) : 0) + (visit ? 8 : 0) + 6, h = 11, x = rx - w;
  drawBox(img, x, y, w, h, S.chip('iron'), T);
  let cx = x + 6;
  text(img, cx, y + 3, label, T.text, LABEL); cx += tw(label, LABEL) + 4;
  img.blit(icon, cx, y + 2); cx += icon.w + 4;
  if (cd) { drawCountdown(img, cx, y + 3, countdown, T, { t, reduced }); cx += tw(cd, LABEL) + 4; }
  if (visit) {
    const on = reduced || gf(t) % Math.round(TIMING.VISIT_PULSE_MS / 1000 * GRID_HZ) < 36;   // v2 2.4 s pulse: lit 1.2 s, dim 1.2 s
    const c = GLYPH.candle(T);
    img.blit(on ? c : (c.hd ? withHD(c.clone(), c.hd, c.hdOff) : c.clone()), cx - 1, y + 2, on ? {} : { tint: T.goldSh });
  }
  return { x, w, h };
}

// ------------------------------------------------------------------------------------------------ toolbar (ct-toolbar)
/** ct-toolbar at the RIGHT edge rx: [notebook] ([■ Abort game]) [⚙] [?] [⇦ Leave]. hover = button key. Returns {x, w}. */
export function toolbarButtons(T, { host = false } = {}) {
  const b = [{ k: 'notebook', g: GLYPH.notebook(T), w: 15 }];
  if (host) b.push({ k: 'abort', g: GLYPH.abort(T), label: 'Abort game', w: 13 + buttonWidth('Abort game', 3) });
  b.push({ k: 'settings', g: GLYPH.gear(T), w: 15 }, { k: 'help', g: GLYPH.help(T), w: 15 }, { k: 'leave', g: GLYPH.leave(T), label: 'Leave', w: 12 + buttonWidth('Leave', 4) });
  return b;
}
export function drawToolbar(img, rx, y, T, { host = false, hover = null, pressed = null } = {}) {
  const b = toolbarButtons(T, { host });
  const w = b.reduce((a, q) => a + q.w + 2, -2);
  let x = rx - w;
  const x0 = x;
  for (const q of b) {
    const st = pressed === q.k ? 'pressed' : hover === q.k ? 'hover' : 'normal';
    const s = S.button(st);
    if (q.k === 'abort') s.edge = ramp(T.danger).sh;             // v2 .ct-tb-abort border #a0473a
    drawBox(img, x, y, q.w, 15, s, T);
    const p = st === 'pressed' ? 1 : 0;
    if (q.label) { img.blit(q.g, x + 4 + p, y + Math.floor((15 - q.g.h) / 2) + p); text(img, x + 4 + q.g.w + 3 + p, y + 5 + p, q.label, T.text); }
    else img.blit(q.g, x + Math.floor((q.w - q.g.w) / 2) + p, y + Math.floor((15 - q.g.h) / 2) + p);
    x += q.w + 2;
  }
  return { x: x0, w };
}

// ------------------------------------------------------------------------------------------------ role chip (cth-card closed)
/** cth-house nested pill: ⌂ + name (9 tall). Returns width. (Role card head; the closed chip uses drawHouseBare.) */
export function drawHousePill(img, x, y, house, T) {
  const hw = 3 + 7 + 3 + tw(house) + 4;
  drawBox(img, x, y, hw, 9, { line: 'ironSh', edge: 'inkSunk', fill: 'inkSunk', corner: 2 }, T);
  img.blit(GLYPH.house(T), x + 3, y + 1);
  text(img, x + 13, y + 1, house, T.text);
  return hw;
}
/** Bare house (closed role chip): 1-px ironSh divider, ⌂, 2 px, name. 9 tall. Width = HOUSE_BARE + tw(name). */
export const HOUSE_BARE = 1 + 3 + 7 + 2;
export function drawHouseBare(img, x, y, house, T) {
  img.vline(x, y + 1, 7, T.ironSh);
  img.blit(GLYPH.house(T), x + 4, y + 1);
  text(img, x + 4 + 7 + 2, y + 1, house, T.text);
  return HOUSE_BARE + tw(house);
}
/** cth-badge: red disc 9x9 with the count (LABEL digit), lit top-left, own dark line. */
export const badgeImg = (n, T) => {
  const r = ramp(T.danger), im = new PixelImage(9, 9);
  im.disc(4.5, 4.5, 4.4, T.danger); im.set(2, 2, r.hi); im.set(3, 1, r.hi); im.set(1, 3, r.hi);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (im.alpha(x, y) && Math.hypot(x + 0.5 - 4.5, y + 0.5 - 4.5) > 3.6) im.set(x, y, r.line);
  drawText(im, 4, 2, String(Math.min(n, 9)), { font: LABEL, color: T.parchmentHi, align: 'center' });
  return hdOf('badge', im, n, T);
};
/**
 * cth-card closed: role (display small caps, team colour) · ⌂ house sub-pill · Dead (· ghost · 1 vote) sub-pill ·
 * unread badge. Height 13. Returns {w, h}.
 */
export const ROLE_CHIP_MAX = 180;   // truncate the house only past this (CONTRACT-REQUEST: SLOTS.hud[0].w 150 -> 180)
/**
 * Layout of the closed role chip within maxW. The house is the player's way home, so it is the LAST thing to go:
 * 1) display small-caps role + bare ⌂ house; 2) role in LABEL caps (3x5) + full house; 3) LABEL role + house with an
 * ellipsis; 4) no house. Returns {font, rw, house, dw, w}.
 */
export function roleChipLayout({ role = 'Empath', house = 'Ravenscroft', dead = null, badge = 0, maxW = ROLE_CHIP_MAX } = {}) {
  const deadTxt = dead === 'vote' ? '1 vote' : null;
  const dw = dead ? 4 + tw('Dead') + (deadTxt ? 3 + 7 + 2 + tw(deadTxt) : 0) + 4 : 0;
  const tail = (dw ? 4 + dw : 0) + (badge ? 4 + 9 : 0) + 5;
  const width = (rw, hs) => 5 + rw + (hs ? 3 + HOUSE_BARE + tw(hs) : 0) + tail;
  const dRw = tw(role.toLowerCase(), DISPLAY), lRw = tw(role.toUpperCase(), LABEL);
  const out = (font, hs) => { const rw = font === DISPLAY ? dRw : lRw; return { font, rw, house: hs, dw, deadTxt, w: width(rw, hs) }; };
  if (width(dRw, house) <= maxW) return out(DISPLAY, house);
  if (!house) return out(LABEL, null);
  if (width(lRw, house) <= maxW) return out(LABEL, house);
  const room = maxW - width(lRw, null) - 3 - HOUSE_BARE;
  let hs = null;
  if (room >= 12) { let h0 = house; while (h0.length > 1 && tw(h0 + '…') > room) h0 = h0.slice(0, -1); hs = h0 + '…'; }
  return { font: LABEL, rw: lRw, house: hs, dw, deadTxt, w: width(lRw, hs) };
}
export function drawRoleChip(img, x, y, T, { role = 'Empath', team = 'good', house = 'Ravenscroft', dead = null, badge = 0, hover = false, maxW = ROLE_CHIP_MAX } = {}) {
  const Lo = roleChipLayout({ role, house, dead, badge, maxW }), { dw, deadTxt } = Lo;
  const w = Lo.w, h = 13;
  drawBox(img, x, y, w, h, S.chip(hover ? 'ironHi' : 'iron'), T);
  let cx = x + 5;
  const rc = team === 'evil' ? T.evil : T.good;
  if (Lo.font === DISPLAY) text(img, cx, y + 1, role.toLowerCase(), rc, DISPLAY);
  else text(img, cx, y + 4, role.toUpperCase(), rc, LABEL);
  cx += Lo.rw;
  if (Lo.house) cx += 3 + drawHouseBare(img, cx + 3, y + 2, Lo.house, T);
  if (dw) {
    cx += 4;
    const r = ramp(T.danger);
    drawBox(img, cx, y + 2, dw, 9, { line: r.sh, edge: 'inkSunk', fill: 'inkSunk', corner: 2 }, T);
    text(img, cx + 4, y + 3, 'Dead', T.evil);
    if (deadTxt) { const gx = cx + 4 + tw('Dead') + 3; img.blit(GLYPH.ghost(T), gx, y + 3); text(img, gx + 9, y + 3, deadTxt, T.ghost); }
    cx += dw;
  }
  if (badge) cx += 4;
  if (badge) img.blit(badgeImg(badge, T), cx, y + 2);
  return { w, h };
}

// ------------------------------------------------------------------------------------------------ role card (expanded)
/** Small status pill (cth-chip): tone ok | dead | plain. Returns width. */
export function drawPill(img, x, y, s, tone, T) {
  const w = tw(s) + 10, edge = tone === 'ok' ? ramp(T.ok).sh : tone === 'dead' ? ramp(T.danger).sh : T.iron;
  drawBox(img, x, y, w, 11, { line: 'outline', edge, fill: 'ink', corner: 2 }, T);
  text(img, x + 5, y + 3, s, tone === 'ok' ? T.ok : tone === 'dead' ? T.evil : T.textDim);
  return w;
}
/** Italic body line (pixel shear, ./font.js italicize). */
export function drawItalic(img, x, y, s, color) {
  if (img.isView && HD_HOOKS.drawItalic) return HD_HOOKS.drawItalic(img, x, y, s, color);
  const w = tw(s) + 4, tmp = new PixelImage(w, 9);
  drawText(tmp, 1, 0, s, { color });
  img.blit(italicize(tmp, 0, 6), x - 1, y);
  return w;
}
/**
 * cth-card expanded (role card): title (display, team colour) + (type), house pill + ▲, the ability in pixel italic,
 * alignment line, status pills, tabs Town / Notes (badge) / Crier, and the first Town row. Returns {w, h}.
 */
export function drawRoleCard(img, x, y, w, T, o = {}) {
  const { role = 'Undertaker', type = 'townsfolk', team = 'good', house = "Stargazer's Tower", ability = 'Each night after the first: you learn which character was executed that day.',
    pills = [['Alive', 'ok'], ['Seat 1', ''], ['May nominate? No', ''], ['Ghost vote available', 'ok']], tab = 'town', badge = 1,
    rows = [[1, 'Bram'], [2, 'Cleo'], [5, 'Esme', 'dead']] } = o;
  const lines = wrapText(ability, w - 14, { maxLines: 4 });
  // layout pass (heights)
  const pillRows = []; { let row = [], rw = 0; for (const p of pills) { const pw = tw(p[0]) + 10; if (row.length && rw + pw > w - 12) { pillRows.push(row); row = []; rw = 0; } row.push(p); rw += pw + 3; } if (row.length) pillRows.push(row); }
  // head: title (display, team colour) + (type); the house pill sits right of it, or on a second row when it would collide
  const hw = 3 + 7 + 3 + tw(house) + 4, titleW = tw(role, DISPLAY) + 4 + tw(`(${type})`);
  const twoRows = 6 + titleW + 6 + hw + 16 > w;
  const headH = twoRows ? 27 : 16, abilityH = lines.length * 9 + 4, alignH = 11, pillsH = pillRows.length * 13 + 2, tabsH = 14, rowsH = rows.length * 11 + 4;
  const h = 2 + headH + 4 + abilityH + alignH + pillsH + tabsH + rowsH + 2;
  drawBox(img, x, y, w, h, S.panel('iron'), T);
  text(img, x + 6, y + 4, role, team === 'evil' ? T.evil : T.good, DISPLAY);
  text(img, x + 6 + tw(role, DISPLAY) + 4, y + 7, `(${type})`, T.textDim);
  const hx = twoRows ? x + 6 : x + w - 16 - hw, hy = twoRows ? y + 17 : y + 5;
  drawHousePill(img, hx, hy, house, T);
  img.blit(GLYPH.caretUp(T), x + w - 11, y + 8);
  let cy = y + 2 + headH;
  img.hline(x + 2, cy, w - 4, T.ironSh); cy += 4;
  lines.forEach((l, i) => drawItalic(img, x + 7, cy + i * 9, l, T.text)); cy += abilityH;
  text(img, x + 7, cy, 'You are ', T.text); text(img, x + 7 + tw('You are '), cy, team === 'evil' ? 'Evil.' : 'Good.', team === 'evil' ? T.evil : T.good); cy += alignH;
  for (const row of pillRows) { let px = x + 6; for (const [s, tone] of row) px += drawPill(img, px, cy, s, tone, T) + 3; cy += 13; }
  cy += 2;
  // tabs
  img.hline(x + 2, cy, w - 4, T.ironSh); img.hline(x + 2, cy + tabsH - 1, w - 4, T.ironSh);
  const tabs = [['town', 'Town'], ['notes', 'Notes'], ['crier', 'Crier']], tw3 = Math.floor((w - 4) / 3);
  tabs.forEach(([k, s], i) => {
    const tx = x + 2 + i * tw3, on = tab === k, lw = tw(s) + (k === 'notes' && badge ? 11 : 0);
    text(img, tx + Math.floor((tw3 - lw) / 2), cy + 4, s, on ? T.gold : T.textDim);
    if (k === 'notes' && badge) img.blit(badgeImg(badge, T), tx + Math.floor((tw3 - lw) / 2) + tw(s) + 2, cy + 2);
    if (on) { img.hline(tx + 1, cy + tabsH - 3, tw3 - 2, T.gold); img.hline(tx + 1, cy + tabsH - 2, tw3 - 2, T.goldSh); }
  });
  cy += tabsH + 2;
  for (const [seat, name, st] of rows) {
    text(img, x + 14, cy + 2, String(seat), T.textDim, LABEL, 'right');
    text(img, x + 19, cy + 1, name, st === 'dead' ? T.textDim : T.gold);
    if (st === 'dead') { img.hline(x + 18, cy + 4, tw(name) + 2, ramp(T.danger).sh); img.blit(GLYPH.ghost(T), x + 22 + tw(name), cy); }
    img.hline(x + 6, cy + 10, w - 12, T.inkRaised);
    cy += 11;
  }
  return { w, h };
}

// ------------------------------------------------------------------------------------------------ toasts
/**
 * Toast kinds -> rule colour / fill / text colour (v2 cth-toast border-left 3 px + ct-toast error). Round kinds (no
 * rule, corner 2, ⚖ glyph): 'vote' = v2 .cth-vote-pill (gold keyline, right-aligned text, × hide), 'block' = v2
 * .cth-block (dark red pill, red keyline, fits its text, no ×).
 */
export function toastStyle(kind, T) {
  const r = ramp(T.danger);
  if (kind === 'death' || kind === 'execution') return { rule: T.danger, ruleHi: r.hi, fill: 'ink', edge: 'iron', text: T.text };
  if (kind === 'error') return { rule: T.danger, ruleHi: r.hi, fill: ramp(T.danger, { line: 0.4 }).line, edge: r.sh, text: T.parchmentHi };
  if (kind === 'game_over') return { rule: T.parchmentHi, ruleHi: T.parchmentHi, fill: 'ink', edge: 'goldSh', text: T.goldHi, title: true };
  if (kind === 'vote') return { round: true, fill: 'ink', edge: 'goldSh', text: T.text, name: T.goldHi, right: true, close: true };
  if (kind === 'block') return { round: true, fill: ramp(T.danger, { line: 0.4 }).line, edge: T.danger, text: T.parchmentHi, name: T.goldHi, fit: true, close: false };
  return { rule: T.gold, ruleHi: T.goldHi, fill: 'ink', edge: 'iron', text: T.text };
}
const TOAST_GLYPH_W = 9 + 3;   // ⚖ + gap (round kinds)
/** Text column of a toast: {x0 (from the toast's left), tw (wrap width)}. */
function toastCols(w, kind) {
  if (kind === 'vote' || kind === 'block') return { x0: 5 + TOAST_GLYPH_W, tw: w - 5 - TOAST_GLYPH_W - (kind === 'vote' ? 14 : 7) };
  return { x0: 7, tw: w - 20 };
}
/** Width a toast takes in a column of width w ('block' shrinks to its text like v2's inline pill). */
export function toastWidth(s, w, kind = 'info') {
  if (kind !== 'block') return w;
  return Math.min(w, 5 + TOAST_GLYPH_W + tw(s) + 7);
}
/**
 * Lines of a toast. Round kinds break at ' · ' first (v2 "Cora: 4 votes (needed 3) · ✓ your vote counted" keeps the
 * "✓ your vote counted" clause whole on its own line), then word-wrap; ≤ 3 lines.
 */
export function toastLines(s, w, kind = 'info') {
  const max = toastCols(toastWidth(s, w, kind), kind).tw;
  if (kind !== 'vote' && kind !== 'block') return wrapText(s, max, { maxLines: 3 });
  const segs = String(s).split(' · '), out = [];
  let cur = '';
  for (const g of segs) { const cand = cur ? `${cur} · ${g}` : g; if (!cur || tw(cand) <= max) cur = cand; else { out.push(cur); cur = g; } }
  out.push(cur);
  return out.flatMap((l) => wrapText(l, max)).slice(0, 3);
}
export function toastHeight(s, w, kind = 'info') {
  if (kind === 'game_over') return 14;
  return toastLines(s, w, kind).length * 9 + 5;
}
/** One body line with highlighted substrings: his = [[substring, colour], ...] (first match per line each). */
function segLine(img, x, y, line, base, his = []) {
  const marks = [];
  for (const [sub, c] of his) { if (!sub) continue; const i = line.indexOf(sub); if (i >= 0) marks.push([i, i + sub.length, c]); }
  marks.sort((a, b) => a[0] - b[0]);
  let px = x, at = 0;
  for (const [i0, i1, c] of marks) {
    if (i0 < at) continue;
    const pre = line.slice(at, i0); if (pre) { text(img, px, y, pre, base); px += tw(pre) + 1; }   // + the 1-px tracking between runs
    const mid = line.slice(i0, i1); text(img, px, y, mid, c); px += tw(mid) + 1; at = i1;
  }
  const rest = line.slice(at); if (rest) text(img, px, y, rest, base);
}
/**
 * One toast at (x, y), width w: left rule (2 px, kind colour, lit top px), wrapped body text (≤ 3 lines), × close.
 * Round kinds ('vote', 'block'): ⚖ glyph, corner 2, optional `name` (gold) and `counted` (ok green) highlights.
 */
export function drawToast(img, x, y, w, T, { text: s = 'Ada nominates Cleo.', kind = 'info', close = true, hoverClose = false, name = null } = {}) {
  const st = toastStyle(kind, T), h = toastHeight(s, w, kind);
  if (st.round) {
    const bw = toastWidth(s, w, kind), cols = toastCols(bw, kind);
    drawBox(img, x, y, bw, h, { line: 'outline', edge: st.edge, fill: st.fill, hi: null, corner: 2, shadow: true }, T);
    img.blit(GLYPH.scales(T), x + 5, y + 2);
    const his = [[name, st.name], ['✓ your vote counted', T.ok], ['not counted', T.textDim]];
    toastLines(s, w, kind).forEach((l, i) => {
      const lx = st.right ? x + cols.x0 + cols.tw - tw(l) : x + cols.x0;
      segLine(img, lx, y + 3 + i * 9, l, st.text, his);
    });
    if (st.close && close) img.blit(GLYPH.close(T, hoverClose ? T.text : T.textDim), x + bw - 9, y + 4);
    return { w: bw, h };
  }
  drawBox(img, x, y, w, h, { line: 'outline', edge: st.edge, fill: st.fill, hi: null, corner: 1, shadow: true }, T);
  if (img.isView && HD_HOOKS.toastRule) HD_HOOKS.toastRule(img, x, y, h, st, T);
  else { img.rect(x + 1, y + 1, 2, h - 2, st.rule); img.set(x + 1, y + 1, st.ruleHi); img.set(x + 2, y + 1, st.ruleHi); }
  if (st.title) text(img, x + 7, y + 2, s, st.text, DISPLAY);
  else wrapText(s, w - 20, { maxLines: 3 }).forEach((l, i) => segLine(img, x + 7, y + 3 + i * 9, l, st.text, name ? [[name, T.goldHi]] : []));
  if (close) img.blit(GLYPH.close(T, hoverClose ? T.text : T.textDim), x + w - 9, y + 4);
  return { w, h };
}
/**
 * Empty stretchable toast frame for a DOM border-image skin (kind colours, no text, no ×): 24 x (14 + 1 shadow).
 * Insets: rule kinds l 3 t 2 r 2 b 3; round kinds 3/3/3/4 (meta.nineSlice).
 */
export function toastFrame9(kind, T) {
  const st = toastStyle(kind, T), w = 24, h = 14, im = new PixelImage(w, h + 1);
  if (st.round) { drawBox(im, 0, 0, w, h, { line: 'outline', edge: st.edge, fill: st.fill, hi: null, corner: 2, shadow: true }, T); return im; }
  drawBox(im, 0, 0, w, h, { line: 'outline', edge: st.edge, fill: st.fill, hi: null, corner: 1, shadow: true }, T);
  im.rect(1, 1, 2, h - 2, st.rule); im.set(1, 1, st.ruleHi); im.set(2, 1, st.ruleHi);
  return im;
}

// ------------------------------------------------------------------------------------------------ hints and prompts
/** cth-hint tones (border / text) per v2 hud.css. */
export function hintTone(tone, T) {
  const v = ramp(T.stViolet);
  switch (tone) {
    case 'ok': return { edge: ramp(T.ok).sh, text: T.ok };
    case 'auto': return { edge: T.stViolet, text: v.hi };
    case 'private': return { edge: T.stViolet, text: v.hi, fill: v.line };
    case 'frozen': return { edge: ramp(T.good).sh, text: T.ghost };
    case 'vote': return { edge: T.gold, text: T.parchmentHi };
    case 'night': return { edge: T.ironHi, text: T.ghost };
    case 'dead': return { edge: T.iron, text: T.textDim };
    default: return { edge: T.goldSh, text: T.text };
  }
}
/** Parts of a hint (string | [{s, color?} | {countdown} | {g: GLYPH name}]) -> list. */
const hintList = (parts) => (typeof parts === 'string' ? [{ s: parts }] : parts);
const INLINE_GLYPH_W = { candle: 5 };   // the 7x7 inline glyphs, except the 5-wide candle
const partW = (p) => (p.countdown !== undefined ? tw(formatCountdown(p.countdown * 1000), LABEL) : p.g ? (INLINE_GLYPH_W[p.g] ?? 7) : tw(p.s));
const listW = (list) => list.reduce((a, p, i) => a + partW(p) + (i ? 3 : 0), 0);
/**
 * cth-hint centred at cx: full (13 tall, padding 7) -> 'mid' -> 'pill' (11 tall, padding 4) = v2's 300 ms shrink of a
 * sticky hint in 2 grid steps. parts: string or [{s, color?, countdown?, g?}] (a countdown part = seconds, g = a 7x7
 * GLYPH name). short: v2's pill label (hints.tsx `short`: '◯ Seat 5', '⌂ Walk home', 'Vote now', '❄ Paused',
 * '🕯 Private visit', '✋ Hand up') as parts; in mid/pill mode it replaces the sentence (countdown parts are kept, as
 * v2 keeps <Countdown> beside the span). 'mid' = halfway width between the full hint and the pill. Returns {x, w, h}.
 */
export function drawHint(img, cx, y, T, { parts = 'Seated (seat 5).', short = null, tone = 'ok', mode = 'full', t = 0, reduced = false } = {}) {
  const P = hintTone(tone, T), full = hintList(parts);
  const shortList = short ? [...hintList(short), ...full.filter((p) => p.countdown !== undefined)] : full;
  const list = mode === 'full' ? full : shortList;
  const pad = mode === 'full' ? 7 : mode === 'mid' ? 5 : 4, h = mode === 'full' ? 13 : mode === 'mid' ? 12 : 11;
  const inner = listW(list);
  let w = inner + 2 * pad;
  if (mode === 'mid' && short) w = Math.round((listW(full) + 14 + listW(shortList) + 8) / 2);
  const x = cx - Math.floor(w / 2);
  const pill = mode !== 'full';
  // v2 .pill: opacity 0.9 -> the neutral tones drop to textDim; coloured tones keep their colour (identity)
  const tcol = pill && (tone === '' || tone === 'default' || tone === 'dead' || tone === 'night') ? T.textDim : P.text;
  drawBox(img, x, y, w, h, { line: 'outline', edge: P.edge, fill: P.fill || 'ink', hi: P.fill || pill ? null : 'inkRaised', corner: 2 }, T);
  let px = x + Math.floor((w - inner) / 2);
  const ty = y + Math.floor((h - 6) / 2);
  list.forEach((p, i) => {
    if (i) px += 3;
    if (p.countdown !== undefined) drawCountdown(img, px, ty + 1, p.countdown, T, { t, reduced });
    else if (p.g) img.blit(GLYPH[p.g](T), px, y + Math.floor((h - 7) / 2));
    else text(img, px, ty, p.s, p.color || tcol);
    px += partW(p);
  });
  return { x, w, h };
}
/** v2 hints.tsx short labels as hint parts (glyph + 1-2 words). */
export const HINT_SHORT = {
  seat: (n) => [{ g: 'ring' }, { s: `Seat ${n}` }],
  walkHome: () => [{ g: 'house' }, { s: 'Walk home' }],
  notYourHouse: () => [{ g: 'house' }, { s: 'Not your house' }],
  vote: () => [{ s: 'Vote now' }],
  paused: () => [{ g: 'snow' }, { s: 'Paused' }],
  privateVisit: () => [{ g: 'candle' }, { s: 'Private visit' }],
  handUp: () => [{ g: 'hand' }, { s: 'Hand up' }],
};
/** kbd chip (ct-hint kbd / ct-game-prompt kbd): gold keyline, dark well, gold LABEL letters, 9 tall. Returns width. */
export function drawKbd(img, x, y, s, T) {
  const w = Math.max(9, tw(s.toUpperCase(), LABEL) + 6);
  drawBox(img, x, y, w, 9, { line: 'outline', edge: 'goldSh', fill: 'inkSunk', hi: null, corner: 1 }, T);
  text(img, x + Math.floor((w - tw(s.toUpperCase(), LABEL)) / 2), y + 2, s.toUpperCase(), T.gold, LABEL);
  return w;
}
/** ct-game-prompt centred at cx: optional kbd + text; locked = dim italic + lock glyph. Returns {x, w, h}. */
export function drawPrompt(img, cx, y, T, { text: s = 'Walk in: Ravenscroft', key = '', locked = false } = {}) {
  const kw = key && !locked ? tw(key.toUpperCase(), LABEL) + 6 + 4 : 0, gw = locked ? 7 + 4 : 0, sw = tw(s) + (locked ? 3 : 0);
  const w = 7 + kw + gw + sw + 7, h = 15, x = cx - Math.floor(w / 2);
  drawBox(img, x, y, w, h, S.panel('iron'), T);
  let px = x + 7;
  if (kw) { px += drawKbd(img, px, y + 3, key, T) + 4; }
  if (locked) { img.blit(GLYPH.lock(T), px, y + 4); px += 11; drawItalic(img, px, y + 4, s, T.textDim); }
  else text(img, px, y + 4, s, T.text);
  return { x, w, h };
}
/**
 * ct-hint (first-run keys) centred at cx, wrapped to maxW: tokens {b} bold-gold text, {k} kbd chips, plain text, ×.
 * Returns {x, w, h}.
 */
export function drawKeyHint(img, cx, y, T, { tokens = KEY_HINT, maxW = 280 } = {}) {
  // flow layout: split text tokens into words
  const items = [];
  for (const tk of tokens) {
    if (tk.k) items.push({ k: tk.k, w: Math.max(9, tw(tk.k.toUpperCase(), LABEL) + 6) });
    else for (const [i, wd] of tk.s.split(' ').entries()) { if (i > 0) items.push({ space: true }); if (wd) items.push({ s: wd, b: tk.b, w: tw(wd) }); }
  }
  const lines = [[]]; let lw = 0;
  const limit = maxW - 14 - 10;
  for (const it of items) {
    const iw = it.space ? 3 : it.w + (it.k ? 1 : 0);
    if (!it.space && lw + iw > limit && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
    if (it.space && lw === 0) continue;
    lines[lines.length - 1].push(it); lw += iw;
  }
  const widths = lines.map((l) => l.reduce((a, it) => a + (it.space ? 3 : it.w + (it.k ? 1 : 0)), 0));
  const w = Math.max(...widths) + 14 + 10, h = lines.length * 11 + 6, x = cx - Math.floor(w / 2);
  drawBox(img, x, y, w, h, S.panel('goldSh'), T);
  lines.forEach((l, j) => {
    let px = x + 7 + Math.floor((Math.max(...widths) - widths[j]) / 2);
    const ly = y + 4 + j * 11;
    for (const it of l) {
      if (it.space) { px += 3; continue; }
      if (it.k) { drawKbd(img, px, ly - 1, it.k, T); px += it.w + 1; continue; }
      text(img, px, ly + 1, it.s, it.b ? T.goldHi : T.text); px += it.w;
    }
  });
  img.blit(GLYPH.close(T), x + w - 10, y + 4);
  return { x, w, h };
}
export const KEY_HINT = [
  { s: 'Click a cottage', b: true }, { s: ' to go in, or walk with ' }, { k: 'W' }, { k: 'A' }, { k: 'S' }, { k: 'D' },
  { s: ' — walk into a door to enter · ' }, { k: 'Enter' }, { s: ' to chat · ' }, { k: '?' }, { s: ' all keys' },
];
export const KEY_HINT_TOUCH = [{ s: 'Tap a cottage', b: true }, { s: ' to walk there and go in · or drag the joystick' }];

// ------------------------------------------------------------------------------------------------ voice presence (ctv-*)
/** ctv-dot (5x5): ok | live (red + 2-band glow) | wait (gold, 1 s pulse) | bad (red ring) | idle (iron). */
export function voiceDot(state, T, t = 0, reduced = false) {
  const im = new PixelImage(9, 9);
  // tones from tokens (gold / iron families) or ramp() of a token (ok / danger)
  const shade = (mid, r = ramp(mid)) => { im.disc(4.5, 4.5, 2.6, mid); im.set(3, 3, r.hi); im.set(4, 3, r.hi); im.set(3, 4, r.hi); im.set(5, 6, r.sh); im.set(6, 5, r.sh); im.set(6, 6, r.sh); return r; };
  if (state === 'ok') shade(T.ok);
  else if (state === 'live') { shade(T.danger); const g = glowRings(im, T.danger, [140, 60]); im.clear(); im.blit(g, 0, 0); shade(T.danger); }
  else if (state === 'wait') {
    const dim = !reduced && gf(t) % Math.round(TIMING.WAIT_PULSE_MS / 1000 * GRID_HZ) >= 15;
    if (dim) shade(T.goldSh, { hi: T.gold, sh: T.goldLine }); else shade(T.gold, { hi: T.goldHi, sh: T.goldSh });
  } else if (state === 'bad') { const r = ramp(T.danger); im.disc(4.5, 4.5, 2.6, T.danger); im.set(4, 4, r.line); im.set(4, 5, r.line); im.set(5, 4, r.line); im.set(5, 5, r.line); }
  else shade(T.iron, { hi: T.ironHi, sh: T.ironSh });
  return hdOf('voiceDot', im, state, T, t, reduced);
}
/** ctv-wave: 3 one-px bars stepping at 7.5 fps (4 drawings), centred in 7x7. reduced = frame 0. */
export const WAVE = [[2, 5, 3], [4, 3, 5], [5, 2, 4], [3, 4, 2]];
export function wave(T, k, color = T.ok) {
  const im = new PixelImage(7, 7);
  WAVE[k % 4].forEach((h, i) => im.rect(1 + i * 2, 3 - Math.floor((h - 1) / 2), 1, h, color));
  return hdOf('wave', im, T, k, color);
}
/** ctv-mic chip: idle (iron keyline), live ("On air", red fill), muted (dark red, pink text, struck mic). Returns {w}. */
export function drawMicChip(img, x, y, T, { state = 'idle', label = null } = {}) {
  const r = ramp(T.danger);
  const s = label ?? (state === 'live' ? 'On air' : state === 'muted' ? 'Muted' : 'Mic');
  const w = 4 + 5 + 3 + tw(s) + 5;
  const st = state === 'live' ? { line: 'outline', edge: r.hi, fill: T.danger, corner: 2 } : state === 'muted' ? { line: 'outline', edge: T.danger, fill: ramp(T.danger, { line: 0.4 }).line, corner: 2 } : { line: 'outline', edge: 'iron', fill: 'ink', corner: 2 };
  drawBox(img, x, y, w, 11, st, T);
  const c = state === 'live' ? T.parchmentHi : state === 'muted' ? r.hi : T.text;
  img.blit(GLYPH.mic(T, c, state === 'muted'), x + 4, y + 2);
  text(img, x + 12, y + 3, s, c);
  return { w };
}
/** ctv-pill (collapsed voice dock): dot · "VOICE" · mic chip · talk pill (wave + first talker +N). Right-aligned at rx. */
export function drawVoicePill(img, rx, y, T, { link = 'ok', mic = 'idle', talkers = ['Cleo', 'Gus'], t = 0, reduced = false } = {}) {
  const micW = 4 + 5 + 3 + tw(mic === 'live' ? 'On air' : mic === 'muted' ? 'Muted' : 'Mic') + 5;
  const tname = talkers.length ? talkers[0] + (talkers.length > 1 ? ` +${talkers.length - 1}` : '') : '';
  const talkW = tname ? 7 + 2 + tw(tname) : 0;
  const w = 3 + 9 + 1 + tw('VOICE', LABEL) + 4 + micW + (talkW ? 4 + talkW : 0) + 5, h = 15, x = rx - w;
  drawBox(img, x, y, w, h, S.chip('iron'), T);
  img.blit(voiceDot(link, T, t, reduced), x + 3, y + 3);
  let cx = x + 13;
  text(img, cx, y + 5, 'VOICE', T.textDim, LABEL); cx += tw('VOICE', LABEL) + 4;
  cx += drawMicChip(img, cx, y + 2, T, { state: mic }).w + 4;
  if (talkW) { img.blit(wave(T, reduced ? 0 : Math.floor(gf(t) / 4)), cx, y + 4); text(img, cx + 9, y + 4, tname, T.ok); }
  return { x, w, h };
}

// ------------------------------------------------------------------------------------------------ touch controls
/**
 * ct-touch-stick: 64 texels across (v2 128 CSS px at x2). Outline + gold keyline (brighter when active), then a SOLID
 * inkSunk rim ring 5 px wide (1-px ironHi arc on its upper-left outer row = lit from the upper left, ironSh lower-right)
 * closed by a 1-px iron keyline; the well inside is the scrim token (the one translucent token, docs/UI.md §2.7), so
 * the town shows through dimmed instead of a 50 % checker that read as grey mesh noise over grass. The knob = a lit gold
 * sphere r 13 (v2 52 px) offset by (kx, ky) texels while dragging.
 */
export function drawJoystick(img, x, y, T, { active = false, kx = 0, ky = 0 } = {}) {
  if (img.isView && HD_HOOKS.drawJoystick) return HD_HOOKS.drawJoystick(img, x, y, T, { active, kx, ky });
  const D = 64, c = D / 2, RIM = 5;
  for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
    const dx = i + 0.5 - c, dy = j + 0.5 - c, d = Math.hypot(dx, dy);
    if (d > c) continue;
    let col;
    if (d > c - 1) col = T.outline;
    else if (d > c - 2) col = active ? T.gold : T.goldSh;
    else if (d > c - 3) { const s = (dx + dy) / d; col = s < -0.75 ? T.ironHi : s > 0.75 ? T.ironSh : T.inkSunk; }
    else if (d > c - 2 - RIM) col = T.inkSunk;
    else if (d > c - 3 - RIM) col = active ? T.goldSh : T.iron;
    else col = T.scrim;
    img.set(x + i, y + j, col);
  }
  const k = knob(T);
  const m = Math.hypot(kx, ky), lim = 18, s = m > lim ? lim / m : 1;
  img.blit(k, x + c - 14 + Math.round(kx * s), y + c - 14 + Math.round(ky * s));
  return { w: D, h: D };
}
/** The joystick knob: gold sphere lit from the upper left (hi / mid / sh bands + goldLine + one cream glint). 28x28. */
export function knob(T) {
  const im = new PixelImage(28, 28), c = 14, r = 13;
  for (let j = 0; j < 28; j++) for (let i = 0; i < 28; i++) {
    const dx = i + 0.5 - c, dy = j + 0.5 - c, d = Math.hypot(dx, dy);
    if (d > r) continue;
    if (d > r - 1) { im.set(i, j, T.goldLine); continue; }
    const lx = (dx + 4.5) / r, ly = (dy + 4.5) / r, l = Math.hypot(lx, ly);   // distance from the light spot (upper left)
    im.set(i, j, l < 0.42 ? T.goldHi : l < 1.05 ? T.gold : T.goldSh);
  }
  im.rect(8, 8, 2, 2, T.parchmentHi); im.set(10, 8, T.parchmentHi);
  return hdOf('knob', im, T);
}
/** ct-touch-use: a gold pill (door glyph + "Walk in"), locked = ink + iron + lock + dim italic. Returns {w, h}. */
export function drawUseButton(img, x, y, T, { label = 'Walk in', locked = false, pressed = false } = {}) {
  const g = locked ? GLYPH.lock(T) : GLYPH.door(T);
  const w = Math.max(38, 7 + g.w + 4 + tw(label) + 8), h = 24;
  const st = locked ? { line: 'outline', edge: 'iron', fill: 'inkRaised', hi: null, corner: 2 } : { line: 'goldLine', edge: 'gold', fill: pressed ? 'goldLine' : 'goldSh', hi: pressed ? null : 'goldHi', corner: 2 };
  drawBox(img, x, y, w, h, st, T);
  img.blit(g, x + 7, y + Math.floor((h - g.h) / 2) + (pressed ? 1 : 0));
  if (locked) drawItalic(img, x + 7 + g.w + 4, y + 8, label, T.textDim);
  else text(img, x + 7 + g.w + 4, y + 9 + (pressed ? 1 : 0), label, T.parchmentHi);
  return { w, h };
}

// ------------------------------------------------------------------------------------------------ connection / loading
/** ct-spinner: 8 dots on a ring, a 3-step comet tail, 10 fps (frame k). 9x9. */
export function spinner(T, k, { head = T.goldHi, mid = T.gold, tail = T.goldSh, rest = T.ironSh } = {}) {
  const P = [[4, 1], [6, 2], [7, 4], [6, 6], [4, 7], [2, 6], [1, 4], [2, 2]];
  const im = new PixelImage(9, 9);
  P.forEach(([x, y], i) => { const d = (k - i + 8) % 8; im.set(x, y, d === 0 ? head : d === 1 ? mid : d === 2 ? tail : rest); });
  return hdOf('spinner', im, T, k, { head, mid, tail, rest });
}
/** ct-conn: reconnecting banner (spinner + v2 text) or lost (text + [Try again]). Centred at cx. Returns {x, w, h}. */
export function drawConn(img, cx, y, T, { lost = false, t = 0, reduced = false } = {}) {
  const r = ramp(T.danger), fill = ramp(T.danger, { line: 0.4 }).line;
  const msg = lost ? 'Disconnected from the lobby.' : 'Connection lost — reconnecting… your seat is kept.';
  const bw = lost ? buttonWidth('Try again', 6) : 0;
  const w = 8 + (lost ? 0 : 9 + 5) + tw(msg) + (lost ? 6 + bw : 0) + 8, h = lost ? 19 : 15, x = cx - Math.floor(w / 2);
  drawBox(img, x, y, w, h, { line: 'outline', edge: r.sh, fill, hi: null, corner: 1, shadow: true }, T);
  let px = x + 8;
  if (!lost) { img.blit(spinner(T, reduced ? 0 : Math.floor(gf(t) / 3), { head: T.parchmentHi, mid: T.parchment, tail: T.parchmentSh, rest: r.sh }), px, y + 3); px += 14; }
  text(img, px, y + Math.floor((h - 6) / 2), msg, T.parchmentHi); px += tw(msg) + 6;
  if (lost) btn(img, px, y + 2, bw, 15, 'Try again', 'gold', T);
  return { x, w, h };
}
/** ct-game-loading ("Lighting the lamps…" + spinner) / failed ("The town failed to load." + [Reload]). Centred. */
export function drawLoading(img, cx, cy, T, { failed = false, t = 0, reduced = false } = {}) {
  if (failed) {
    const s = 'The town failed to load.', bw = buttonWidth('Reload', 8), w = Math.max(tw(s), bw) + 20, h = 36, x = cx - Math.floor(w / 2), y = cy - 18;
    drawBox(img, x, y, w, h, S.panel('iron'), T);
    text(img, cx, y + 5, s, T.text, 'body', 'center');
    btn(img, cx - Math.floor(bw / 2), y + 17, bw, 15, 'Reload', 'gold', T);
    return { x, w, h };
  }
  const s = 'Lighting the lamps…', w = 9 + 5 + tw(s) + 4 + 16, h = 17, x = cx - Math.floor(w / 2), y = cy - 8;
  drawBox(img, x, y, w, h, S.panel('iron'), T);
  img.blit(spinner(T, reduced ? 0 : Math.floor(gf(t) / 3)), x + 8, y + 4);
  drawItalic(img, x + 22, y + 5, s, T.textDim);
  return { x, w, h };
}

// ------------------------------------------------------------------------------------------------ storyteller clock control
/**
 * ctc-stctl (inside the Storyteller panel): row 1 "Town clock:" + what the tower shows + [❚❚ Pause | ▶ Resume] [+1m] [✕];
 * row 2 "Set" [−] "5 min" [+] "for"; row 3 the stage buttons (the running stage selected). w ≈ 160. Returns {w, h}.
 */
export function drawStClock(img, x, y, w, T, o = {}) {
  // (additive, 2026-10-17, the demo critic's P3-13) o.done: the countdown is at zero: the stage's due label ("Nominations
  // open") and a "Start" button (restart) instead of "Pause" beside the 0:00; the clear x (reset) stays. No o.done = as before.
  const { isSet = true, stage = 'nominations', time = '4:12', paused = false, urgent = false, minutes = 5, hover = null, onTheBlock = true, done = false } = o;
  const h = 58;
  const goLabel = paused ? 'Resume' : done ? 'Start' : 'Pause', goKey = paused ? 'resume' : done ? 'start' : 'pause';
  drawBox(img, x, y, w, h, S.panel('iron'), T);
  text(img, x + 6, y + 4, 'Town clock:', T.textDim);
  if (isSet) {
    const P = stagePal(paused ? 'paused' : stage, T), lab = stageLabel(stage, { paused, onTheBlock, due: done }).toUpperCase();
    // UI integration r2: a long stage label ('NOMINATIONS CLOSE IN') pushed the timer under the row-1 buttons, which
    // then covered its top rows. Measure the buttons first; when the label + timer would reach them, drop the line 4 px
    // (below the buttons, still above row 2).
    const btnW = 13 + buttonWidth('+1m', 4) + buttonWidth(goLabel, 4) + 7 + 6;
    const dy = x + 6 + tw(lab, LABEL) + 4 + tw(time, DISPLAY) > x + w - 5 - btnW - 2 ? 4 : 0;
    text(img, x + 6, y + 15 + dy, lab, P.label, LABEL);
    text(img, x + 6 + tw(lab, LABEL) + 4, y + 12 + dy, time, urgent ? ramp(T.danger).hi : P.time, DISPLAY);
  } else text(img, x + 9 + tw('Town clock:'), y + 4, 'not set', T.textDim);
  // row-1 buttons (right)
  if (isSet) {
    let bx = x + w - 5;
    const items = [['clear', null, GLYPH.close(T, T.text), 13], ['add', '+1m', null, buttonWidth('+1m', 4)], [goKey, goLabel, paused || done ? GLYPH.play(T) : GLYPH.pause(T), 0]];
    items[2][3] = buttonWidth(items[2][1], 4) + 7;
    for (const [k, l, g, bw] of items) { bx -= bw; btn(img, bx, y + 3, bw, 13, l, hover === k ? 'hover' : 'normal', T, { glyph: g }); bx -= 2; }
  }
  // row 2: Set [−] N min [+] for
  const r2 = y + 27;
  text(img, x + 6, r2 + 4, 'Set', T.textDim);
  let bx = x + 6 + tw('Set') + 4;
  btn(img, bx, r2 + 1, 11, 11, null, minutes <= 1 ? 'disabled' : hover === 'minus' ? 'hover' : 'normal', T, { glyph: GLYPH.minus(T, minutes <= 1 ? T.textDim : T.text) }); bx += 13;
  const mt = `${minutes} min`;
  text(img, bx + 3, r2 + 4, mt, T.parchmentHi); bx += tw(mt) + 6;
  btn(img, bx, r2 + 1, 11, 11, null, minutes >= 30 ? 'disabled' : hover === 'plus' ? 'hover' : 'normal', T, { glyph: GLYPH.plus(T) }); bx += 14;
  text(img, bx, r2 + 4, 'for', T.textDim);
  // row 3: stages
  const r3 = y + 41, names = { discussion: 'Discussion', nominations: 'Nominations', bedtime: 'Bedtime' };
  let sx = x + 5;
  for (const s of STAGES) {
    const bw = buttonWidth(names[s], 4), on = isSet && stage === s;
    btn(img, sx, r3, bw, 13, names[s], on ? 'selected' : hover === s ? 'hover' : 'normal', T, { color: on ? T.goldHi : null });
    sx += bw + 2;
  }
  return { w, h };
}

// ------------------------------------------------------------------------------------------------ appear / disappear
/**
 * docs/UI.md §2.8 envelope on a rendered element (PixelImage tmp, modified in place): age (grid frames since shown)
 * 0 -> pop (1 px higher, 50 % stipple), >= 1 full; left (grid frames since hide started) -> 3-step Bayer dissolve at
 * 15 fps, null when gone. Returns {img, dy} or null.
 */
export function envelopeFx(tmp, age, left = null, { reduced = false, ox = 0, oy = 0 } = {}) {
  if (age < 0) return null;
  if (left !== null && left >= 0) {
    if (reduced) return null;
    const k = Math.floor(left / 2);
    if (k >= 3) return null;
    dissolve(tmp, [0.25, 0.5, 0.75][k], ox, oy);
    return { img: tmp, dy: 0 };
  }
  if (age < 1 && !reduced) { dissolve(tmp, 0.5, ox, oy); return { img: tmp, dy: -1 }; }
  return { img: tmp, dy: 0 };
}
