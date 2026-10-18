// The game UI's ACTION BAR art (owner: ui; docs/DEMO.md §4.7 "Action bar"): every keyboard action of the demo as a
// clickable / tappable pixel button in the library's look (kit drawBox frames, hud / emotes / indicators glyphs, the
// tiny face for the key hints). Pure drawing + tables; gameui.js lays it out, hit-tests and runs the actions (through
// demo.input.press(code): the SAME code path as the key).
//
//   BAR      the bar: emote palette (Space), point (right-click), pin (F), palette = the social dock (G), notebook (J),
//            more (the tray with every other key)
//   EMOTES   the emote palette: talk 1, vote 2, point 3, die 4, ghost 5, signature 6 (critic P1-2: Space OPENS this
//            palette; the signature emote is 6 / its palette button)
//   TRAY     the tray: camera Q E - = C, clock T , . N, town B V P L, characters [ ], panel `, keys H, Esc
//   glyph(k, T, o)   9x9-ish glyph (7x7 art + its own gold line) for a button key; hdOf(glyph) = its D=2 art
//                    (actionbar-hd.js: 14x14 + line), drawn by buttonInto through a density view
//   button(T, {state, glyph, hint, w, h})   one button image (raised / hover / pressed / disabled / lit)
//   buttonInto(img, T, o)   the same drawn INTO img (a PixelImage or a density view: D=2 frame + HD glyph + HD plate)
//   hintImage(label, T)   the key hint plate (tiny face; [ ] ` = drawn here, the tiny face has no such glyphs)
//   bulb(T, lit)     the lightbulb glyph (lit: gold glass + 1-px rays) for the tip button
//   tipTokens(touch) the controls tip (hud drawKeyHint tokens), mouse or touch wording
//   tooltipImage(text, T) / tooltipInto(img, text, T) / tooltipSize(text)   a tooltip plate
//   keyWord(hint)    the hint as words for a tooltip ('SPC' -> 'Space', '`' -> 'backtick' ...)
import { PixelImage, drawBox, drawText, textWidth, PIN_HEX } from '../ui/kit.js';
import * as HA from '../ui/hud/art.js';
import * as E from '../ui/emotes/art.js';
import { glyphHD, hintPlateHD } from './actionbar-hd.js';
import * as EJ from '../ui/emotes/emoji.js';
import { emojiIconHD } from '../ui/hd/emoji.js';

export const BTN = 18;          // button size (texels)
export const GAP = 2;

export const BAR = [
  { k: 'emote', tip: 'Emotes: talk, vote, point, die, ghost, signature', hint: 'SPC', glyph: 'emote' },
  { k: 'point', tip: 'Point: click a townsperson or a spot', hint: 'RMB', glyph: 'point' },
  { k: 'pin', tip: 'Pin: click a spot or a townsperson (their pin again: remove)', hint: 'F', glyph: 'pin' },
  // (emoji, docs/UI-EMOJI.md) the social dock is the REACTIONS dock now: 7 reactions (1-7 while it is open), point,
  // pin, the pin colour behind its small button, clear my pins
  { k: 'dock', tip: 'React: agree, doubt, gasp, laugh, trust (then 1-7) + pins', hint: 'G', glyph: 'react' },
  { k: 'notebook', tip: 'Notebook', hint: 'J', glyph: 'notebook' },
  { k: 'more', tip: 'More: camera, clock, town, characters', hint: null, glyph: 'more' },
];
export const EMOTES = [
  { k: 'talk', code: 'Digit1', hint: '1', tip: 'Talk', glyph: 'talk' },
  { k: 'vote', code: 'Digit2', hint: '2', tip: 'Vote (raise a hand)', glyph: 'vote' },
  { k: 'point', code: 'Digit3', hint: '3', tip: 'Point', glyph: 'pointE' },
  { k: 'die', code: 'Digit4', hint: '4', tip: 'Die', glyph: 'die' },
  { k: 'ghost', code: 'Digit5', hint: '5', tip: 'Ghost on / off', glyph: 'ghost' },
  { k: 'signature', code: 'Digit6', hint: '6', tip: 'Signature emote', glyph: 'star' },
];
export const TRAY = [
  [
    { code: 'KeyQ', hint: 'Q', tip: 'Rotate the camera left', glyph: 'rotL' },
    { code: 'KeyE', hint: 'E', tip: 'Rotate the camera right', glyph: 'rotR' },
    { code: 'Minus', hint: '-', tip: 'Zoom out', glyph: 'minus' },
    { code: 'Equal', hint: '=', tip: 'Zoom in', glyph: 'plus' },
    { code: 'KeyC', hint: 'C', tip: 'Camera mode', glyph: 'camera' },
    { code: 'KeyT', hint: 'T', tip: 'Pause / run the clock', glyph: 'pause' },
    { code: 'Comma', hint: ',', tip: 'Clock slower', glyph: 'slower' },
    { code: 'Period', hint: '.', tip: 'Clock faster', glyph: 'faster' },
    { code: 'KeyN', hint: 'N', tip: 'Next time of day', glyph: 'dawn' },
  ],
  [
    { code: 'KeyB', hint: 'B', tip: 'Ring the bell', glyph: 'bell' },
    { code: 'KeyV', hint: 'V', tip: 'Next phase', glyph: 'scales' },
    { code: 'KeyP', hint: 'P', tip: 'Voting ceremony', glyph: 'candle' },
    { code: 'KeyL', hint: 'L', tip: 'Town life on / off', glyph: 'life' },
    { code: 'BracketLeft', hint: '[', tip: 'Previous character', glyph: 'prev' },
    { code: 'BracketRight', hint: ']', tip: 'Next character', glyph: 'next' },
    { code: 'Backquote', hint: '`', tip: 'Show / hide the control panel', glyph: 'gear' },
    { code: 'KeyH', hint: 'H', tip: 'All keys', glyph: 'help' },
    { code: 'Escape', hint: 'ESC', tip: 'Close the pie / notebook / overlay', glyph: 'close' },
  ],
];
/** A key hint as words for a tooltip (critic P2-3: the body face has no backquote glyph; 'SPC' / 'RMB' read as codes). */
export const keyWord = (hint) => ({ SPC: 'Space', RMB: 'right-click', '`': 'backtick key', ESC: 'Esc', ',': 'comma', '.': 'period', '-': 'minus', '=': 'equals', '[': '[ key', ']': '] key' })[hint] ?? hint;

// ------------------------------------------------------------------------------------------------ glyphs
const gk = (T) => ({ H: T.goldHi, M: T.gold, S: T.goldSh, L: T.goldLine, P: T.parchment, p: T.parchmentSh, h: T.parchmentHi, D: T.inkSunk, g: T.ghost, s: T.ghostSh, I: T.iron, i: T.ironSh });
const lined = (im, T, line = T.goldLine) => { const o = new PixelImage(im.w + 2, im.h + 2); o.blit(im, 1, 1); o.outline(line, {}); return o; };
const art = (rows, T, extra = {}) => lined(HA.sprite(rows, { ...gk(T), ...extra }), T);
const ROWS = {
  emote: ['..HHM..', '.HMMMS.', 'HMDMDMS', 'HMMMMMS', 'HDMMMDS', '.SDDDS.', '..SSS..'],
  talk: ['.hhhhh.', 'hPPPPPp', 'hPDPDPp', 'hPPPPPp', '.pPpppp', '..pp...', '.p.....'],
  more: ['.......', '.......', 'HM.HM.HM', 'MS.MS.MS', '.......', '.......', '.......'],
  rotL: ['..MMMM.', '.H....S', 'HMH...S', '.H....S', '......S', '.M...S.', '..SSS..'],
  rotR: ['.MMMM..', 'H....S.', 'H...SMS', 'H....S.', 'H......', '.H...S.', '..HHM..'],
  camera: ['.HM....', 'HMMMMMS', 'HMDDDMS', 'HMDhDMS', 'HMDDDMS', 'SSSSSSS', '.......'],
  slower: ['...M..M', '..M..M.', '.M..M..', 'H..H...', '.M..M..', '..M..M.', '...S..S'],
  faster: ['M..M...', '.M..M..', '..M..M.', '...H..H', '..M..M.', '.M..M..', 'S..S...'],
  life: ['..HMM..', '.HMMMS.', 'HMMMMMS', '.SSMSS.', '...M...', '...M...', '..SSS..'],   // a little tree (town life)
  prev: ['....M', '...M.', '..H..', '.H...', '..M..', '...S.', '....S'],
  next: ['M....', '.M...', '..H..', '...H.', '..M..', '.S...', 'S....'],
  palette: ['.......', '.cc.yy.', '.cc.yy.', '.......', '.tt.vv.', '.tt.vv.', '.......'],
  // (critic P2-2) the tower timer's tray row: its own glyphs (they reused T / Esc / zoom - +, read as duplicates)
  timer: ['IIIIIII', '.HhhhS.', '..HhS..', '...M...', '..HPS..', '.HPPPS.', 'IIIIIII'],   // an hourglass in an iron frame
  reset: ['HS...HS', 'HS..HMS', 'HS.HMMS', 'HSHMMMS', 'HS.SMMS', 'HS..SMS', 'HS...SS'],   // back to the start (bar + triangle)
  minus1: ['.......', '.....M.', '....HM.', 'HMS..M.', '.....M.', '.....M.', '....HMS'],     // "-1" (a minute less)
  plus1: ['.M.....', '.M...M.', 'HMS.HM.', '.M...M.', '.....M.', '.....M.', '....HMS'],      // "+1" (a minute more)
};
const glyphCache = new Map();
const HD_OF = new WeakMap();
/** The D=2 art of a glyph returned by glyph() (or null: the 1x glyph is block-scaled). */
export const hdOf = (g) => (g ? HD_OF.get(g) ?? null : null);
/** The glyph image of a button key (cached per token set; pin by colour); its D=2 art registered for hdOf. */
export function glyph(k, T, { color = 'crimson', paused = false } = {}) {
  const key = `${k}|${color}|${paused}|${T.ink}`;
  let g = glyphCache.get(key);
  if (g) return g;
  g = glyph1x(k, T, { color, paused });
  // (shared memoized sprites, e.g. the pin swatch, map to the same HD art for the same key: harmless)
  // (emoji) the reactions button: the laughing face of the emoji emotes, its own 26x26 HD art
  const h = k === 'react' ? emojiIconHD('laugh', T) : glyphHD(k, T, { color, paused });
  if (h) HD_OF.set(g, h);
  glyphCache.set(key, g);
  return g;
}
function glyph1x(k, T, { color = 'crimson', paused = false } = {}) {
  const G = HA.GLYPH;
  switch (k) {
    case 'emote': case 'talk': case 'more': case 'rotL': case 'rotR': case 'camera': case 'slower': case 'faster': case 'life': case 'prev': case 'next':
    case 'timer': case 'reset': case 'minus1': case 'plus1':
      return art(ROWS[k], T);
    case 'palette': return art(ROWS.palette, T, { c: PIN_HEX.crimson, y: PIN_HEX.gold, t: PIN_HEX.teal, v: PIN_HEX.violet });
    case 'react': return EJ.emojiIcon('laugh', T);
    case 'point': return lined(E.emotePoint(T), T);
    case 'pointE': return lined(E.emotePointSmall(T), T);
    case 'pin': return E.pinIcon(color, T);
    case 'notebook': return G.notebook(T);
    case 'vote': return lined(G.hand(T), T);
    case 'die': return lined(G.skull(T), T);
    case 'ghost': return lined(G.ghost(T), T, T.outline);
    case 'star': return lined(G.star(T), T);
    case 'minus': return lined(G.minus(T, T.gold), T);
    case 'plus': return lined(G.plus(T, T.gold), T);
    case 'pause': return lined(paused ? G.play(T, T.gold) : G.pause(T, T.gold), T);
    case 'dawn': return lined(G.dawn(T), T);
    case 'bell': return lined(G.bell(T), T);
    case 'scales': return G.scales(T);
    case 'candle': return lined(G.candle(T), T);
    case 'gear': return G.gear(T);
    case 'help': return G.help(T);
    case 'close': return lined(G.close(T, T.gold), T);
    case 'bulb': return bulb(T, false);
    default: return new PixelImage(1, 1);
  }
}

/** The lightbulb (tip button): parchment glass + iron cap; lit = gold glass, a hot core and 1-px rays (11 x 11). */
export function bulb(T, lit = false) {
  // glass with a filament (the dark V), a cap of two iron bands; lit: hot gold glass, pale filament
  const rows = lit
    ? ['..HHH..', '.HhhHM.', 'HhHHHMS', 'HMhhhMS', '.HhMhS.', '..IIi..', '..iIi..']
    // (unlit: a filament bar on two legs low in the glass; the earlier two-dot filament read as a skull's eyes)
    : ['..hhh..', '.hPPPp.', 'hPPPPPp', 'hPDDDPp', '.pDPDp.', '..IIi..', '..iIi..'];
  const g = HA.sprite(rows, gk(T));
  const o = new PixelImage(11, 11);
  o.blit(g, 2, 2);
  o.outline(lit ? T.goldLine : T.outline, {});
  if (lit) for (const [x, y] of [[5, 0], [0, 4], [10, 4], [1, 1], [9, 1]]) o.set(x, y, T.goldHi);
  return o;
}

// ------------------------------------------------------------------------------------------------ key hints
// the tiny face (kit 'tiny') has caps, digits and - , . but no [ ] ` = : drawn here in the same 3x5 grid
const EXTRA = { '[': ['##', '#.', '#.', '#.', '##'], ']': ['##', '.#', '.#', '.#', '##'], '`': ['#.', '.#', '..', '..', '..'], '=': ['...', '###', '...', '###', '...'],
  // (pass A look round: 'SPC' / 'RMB' plates covered half the bar's glyphs) a space bar and a mouse with its right
  // button lit, one character each
  '␣': ['.....', '.....', '.....', '#...#', '#####'], '◐': ['#.##', '#.##', '####', '#..#', '.##.'] };
// plate labels drawn as one symbol (the tables keep the readable names for the tooltips)
const SYMBOL = { SPC: '␣', RMB: '◐' };
const hintCache = new Map();
/** The key hint plate: tiny gold caps on an ink plate with an iron-line ring, 7 px tall. */
export function hintImage(label, T) {
  const key = `${label}|${T.ink}`;
  let im = hintCache.get(key);
  if (im) return im;
  const chars = SYMBOL[label] ? [SYMBOL[label]] : [...String(label).toUpperCase()];
  const ws = chars.map((c) => (EXTRA[c] ? EXTRA[c][0].length : textWidth(c, 'tiny')));
  const tw = ws.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1);
  im = new PixelImage(tw + 4, 9);
  drawBox(im, 0, 0, tw + 4, 9, { line: 'outline', edge: 'ink', fill: 'inkSunk', hi: null, sh: null, corner: 1 }, T);
  let x = 2;
  chars.forEach((c, i) => {
    if (EXTRA[c]) EXTRA[c].forEach((r, y) => { for (let j = 0; j < r.length; j++) if (r[j] === '#') im.set(x + j, 2 + y, T.gold); });
    else drawText(im, x, 2, c, { font: 'tiny', color: T.gold });
    x += ws[i] + 1;
  });
  hintCache.set(key, im);
  return im;
}

/** A greyed copy (the disabled look) of a sprite. */
const greyed = (g) => { const d = g.clone(); for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3]) { const v = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3 * 0.55; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; } return d; };
const greyCache = new WeakMap();
const greyOf = (g) => { let v = greyCache.get(g); if (!v) { v = greyed(g); greyCache.set(g, v); } return v; };

/** One button image: frame (state raised | hover | pressed | disabled | lit), glyph centred, key hint bottom right. */
export function button(T, o) {
  const im = new PixelImage((o.w ?? BTN) + 2, (o.h ?? BTN) + 2);
  buttonInto(im, T, o);
  return im;
}
/**
 * The button drawn INTO img at (0, 0) (img = a PixelImage, or a density view: the D=2 frame, the glyph's HD art
 * (hdOf) and the HD key-hint plate at HD px; a glyph without HD art is block-scaled). img must be (w + 2) x (h + 2).
 */
export function buttonInto(img, T, { state = 'raised', glyph: g, hint = null, w = BTN, h = BTN, showHint = true }) {
  const frame = state === 'lit' ? 'gold' : state === 'disabled' ? 'disabled' : state;
  drawBox(img, 0, 0, w, h, frame, T);
  const q = state === 'pressed' ? 1 : 0, hinted = !!(hint && showHint);
  const D = img.isView ? img.density : 1, gh = D > 1 ? hdOf(g) : null;
  if (gh) {
    const G = state === 'disabled' ? greyOf(gh) : gh;
    const gx = Math.floor((w * D - G.w) / 2) + q * D, gy = Math.floor((h * D - G.h) / 2) - (hinted ? 3 : 0) + q * D;
    img.base.blit(G, gx + img.ox, gy + img.oy);
  } else if (g) {
    const gx = Math.floor((w - g.w) / 2) + q, gy = Math.floor((h - g.h) / 2) - (hinted ? 1 : 0) + q;
    img.blit(state === 'disabled' ? greyOf(g) : g, gx, gy);
  }
  if (hinted) {
    if (D > 1) { const hp = hintPlateHD(hint, T); img.base.blit(hp, (w + 1) * D - hp.w + img.ox, (h + 1) * D - hp.h + img.oy); }
    else { const hi = hintImage(hint, T); img.blit(hi, w - hi.w + 1, h - hi.h + 1); }
  }
  return img;
}

/** The controls tip (hud drawKeyHint tokens): mouse / touch wording; both name the action bar. */
export function tipTokens(touch) {
  return touch
    ? [{ s: 'Tip:', b: true }, { s: ' tap to walk · hold a finger on the town to point, pin or react · tap your pin to remove it · the buttons at the bottom do the rest' }]
    : [{ s: 'Tip:', b: true }, { s: ' ' }, { k: 'Space' }, { s: ' emotes (or ' }, { k: '1' }, { s: '-' }, { k: '6' }, { s: ') · ' },
      { k: 'Right' }, { s: ' point, drag: react or pin · ' }, { k: 'G' }, { s: ' reactions (' }, { k: '1' }, { s: '-' }, { k: '7' }, { s: ') · ' },
      { k: 'J' }, { s: ' notebook · or click the buttons at the bottom' }];
}

/** A tooltip plate's size (logical px: w + 1 x 15). */
export const tooltipSize = (text) => ({ w: textWidth(text) + 11, h: 15 });
/** A tooltip plate (kit 'tooltip' frame + body text) drawn into img (a PixelImage or a density view) at (0, 0). */
export function tooltipInto(img, text, T) {
  const w = textWidth(text) + 10;
  drawBox(img, 0, 0, w, 14, 'tooltip', T);
  drawText(img, 5, 4, text, { color: T.text });
  return img;
}
/** A tooltip plate (kit 'tooltip' frame + body text), drawn once per text. */
export function tooltipImage(text, T) {
  const s = tooltipSize(text), im = new PixelImage(s.w, s.h);
  return tooltipInto(im, text, T);
}
