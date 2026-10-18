// The ACTION BAR's art at UI density D=2 (owner: ui; docs/DEMO.md §4.7 "Density"; the library's language docs/UI.md
// §2.10): the ~30 button glyphs redrawn on a 14x14 HD grid (+ a 1-HD-px line in the material's own line tone = 16x16,
// the 1x glyphs' 9x9 footprint at 2x minus the block line), lit from the upper left, token colours only, binary alpha;
// and the key-hint plates in the D=2 tiny face (tiny@2, cap 10) with HD [ ] ` = and the space-bar / mouse symbols.
// actionbar.js attaches these to its 1x sprites (kit withHD): a density view blits them, the 1x path never sees them.
//
//   glyphHD(k, T, {color, paused})   the HD glyph of a button key (null = none: the 1x glyph is block-scaled)
//   hintPlateHD(label, T)            the HD key-hint plate (15 HD px tall)
// Pure JS, deterministic, cached per token set.
import { PixelImage, drawText, textWidth, ramp, PIN_HEX } from '../ui/kit.js';
import * as HA from '../ui/hud/art.js';
import { glyphHD as LIB, swatchHD, gloveHD } from '../ui/hd/art.js';

const cache = new Map();
const memo = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); } return v; };
const tk = (T) => `${T.ink}${T.gold}${T.parchment}${T.ghost}`;
const N = 14;   // art grid (HD px); + the 1-px line = 16

/** A 1-HD-px 4-neighbour line round the art, in its own line tone. */
const lined = (im, line) => { const o = new PixelImage(im.w + 2, im.h + 2); o.blit(im, 1, 1); o.outline(line, {}); return o; };
const key = (T) => ({ H: T.goldHi, M: T.gold, S: T.goldSh, L: T.goldLine, P: T.parchment, p: T.parchmentSh, h: T.parchmentHi, n: T.parchmentLine,
  D: T.inkSunk, g: T.ghost, s: T.ghostSh, I: T.ironHi, i: T.iron, j: T.ironSh, O: T.outline });
const art = (rows, T) => HA.sprite(rows, key(T));
/** Upper-left light on a gold field: a pixel's tone from its offset to the shape centre (hi / mid / shadow). */
const goldAt = (T, dx, dy, r = 1) => { const v = -(dx * 0.62 + dy * 0.78) / Math.max(1, r); return v > 0.45 ? T.goldHi : v < -0.35 ? T.goldSh : T.gold; };
/** Paint every grid px where inside(x + .5, y + .5) with the gold ramp lit round (cx, cy). */
const shape = (T, inside, cx = 7, cy = 7, r = 6) => {
  const im = new PixelImage(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inside(x + 0.5, y + 0.5)) im.set(x, y, goldAt(T, x + 0.5 - cx, y + 0.5 - cy, r));
  return im;
};
/** A gold stroke figure: px inside get the mid tone, their upper / left free edge the hi, lower / right free edge the shadow. */
const stroke = (T, inside) => {
  const im = new PixelImage(N, N), I = (x, y) => x >= 0 && y >= 0 && x < N && y < N && inside(x + 0.5, y + 0.5);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!I(x, y)) continue;
    const up = !I(x, y - 1) || !I(x - 1, y), dn = !I(x, y + 1) || !I(x + 1, y);
    im.set(x, y, up && !dn ? T.goldHi : dn && !up ? T.goldSh : T.gold);
  }
  return im;
};

// ------------------------------------------------------------------------------------------------ ascii art (14 x 14)
const ROWS = {
  talk: [
    '..hhhhhhhhhh..',
    '.hhPPPPPPPPPp.',
    'hhPPPPPPPPPPPp',
    'hPPPPPPPPPPPPp',
    'hPDDPPDDPPDDPp',
    'hPDDPPDDPPDDPp',
    'hPPPPPPPPPPPPp',
    '.pPPPPPPPPPPp.',
    '..pPPppppppp..',
    '..pPp.........',
    '.pPp..........',
    '.pp...........',
    'p.............',
    '..............'],
  vote: [
    '.....hh.......',
    '..hh.hP.hh....',
    '..hP.hP.hP....',
    '..hP.hP.hP.hh.',
    '..hP.hP.hP.hP.',
    '..hPphPphPphP.',
    'h.hPPPPPPPPPp.',
    'hPhPPPPPPPPPp.',
    '.hPPPPPPPPPPp.',
    '.hPPPPPPPPPPp.',
    '..pPPPPPPPPp..',
    '...pPPPPPPp...',
    '...MMMMMMMS...',
    '...SSSSSSSS...'],
  die: [
    '....hhhhhh....',
    '..hhPPPPPPpp..',
    '.hPPPPPPPPPPp.',
    '.hPPPPPPPPPPp.',
    'hPPDDDPPDDDPPp',
    'hPPDDDPPDDDPPp',
    'hPPDDPPPPDDPPp',
    '.pPPPPDDPPPPp.',
    '..pPPPDDPPPp..',
    '...pPPPPPPp...',
    '...PDPDPDPp...',
    '...pPpPpPpp...',
    '....pppppp....',
    '..............'],
  ghost: [
    '....gggggg....',
    '..gggggggggs..',
    '.ggggggggggss.',
    '.ggDDggggDDgs.',
    'gggDDggggDDgss',
    'gggggggggggsss',
    'ggggggDDgggsss',
    'ggggggDDggggss',
    'ggggggggggggss',
    'gggggggggggsss',
    'ggggggggggssss',
    'ggg.ggg.ggg.ss',
    'g...g...g...s.',
    '..............'],
  camera: [
    '..............',
    '..............',
    '..HHM.........',
    'HHHHHHHHHHHHHM',
    'HMMMMIIIIMMMMS',
    'HMMMIDDDDiMMMS',
    'HMMIDDhhDDiMMS',
    'HMMIDDhDDDiMMS',
    'HMMIDDDDDDiMMS',
    'HMMMIDDDDiMMMS',
    'HMMMMiiiiMMMMS',
    'SSSSSSSSSSSSSS',
    '..............',
    '..............'],
  bell: [
    '......HM......',
    '.....HMMS.....',
    '....HHMMMS....',
    '...HHMMMMMS...',
    '...HMMMMMMS...',
    '...HMMMMMMS...',
    '..HHMMMMMMMS..',
    '..HMMMMMMMMS..',
    '.HHMMMMMMMMMS.',
    'HHMMMMMMMMMMSS',
    'SSSSSSSSSSSSSS',
    '.....SMMS.....',
    '......SS......',
    '..............'],
  scales: [
    '......HM......',
    'HMMMMMMMMMMMMS',
    '..S...MS...S..',
    '..S...MS...S..',
    'HMMMS.MS.HMMMS',
    '.SSS..MS..SSS.',
    '......MS......',
    '......MS......',
    '......MS......',
    '......MS......',
    '....HMMMMS....',
    '...HMMMMMMS...',
    '...SSSSSSSS...',
    '..............'],
  candle: [
    '.......H......',
    '......HM......',
    '......MhS.....',
    '.....HMhMS....',
    '......SMS.....',
    '.......n......',
    '.....hPPPp....',
    '.....hPPPp....',
    '.....hPPPp....',
    '.....hPPPp....',
    '.....hPPPp....',
    '..IIIIIIIIIi..',
    '...iiiiiiii...',
    '..............'],
  // (critic P2-2) the tower timer's tray row: an hourglass in an iron frame (start / pause the tower's countdown)
  timer: [
    'IIIIIIIIIIIIII',
    '.jiiiiiiiiiij.',
    '..hhhhhhhhhp..',
    '..hhhhhhhhhp..',
    '...hPPPPPPp...',
    '....hPPPPp....',
    '.....hPPp.....',
    '......Pp......',
    '.....h.Pp.....',
    '....h..PPp....',
    '...h..PPPPp...',
    '..hPPPPPPPPp..',
    '.jiiiiiiiiiij.',
    'IIIIIIIIIIIIII'],
  life: [
    '.....HHMM.....',
    '...HHMMMMMS...',
    '..HMMMMMMMMS..',
    '.HMMSMMMMSMMS.',
    '.HMMMMMMMMMSS.',
    'HMMMMMSMMMMMSS',
    '.SMMMMMMMMMSS.',
    '..SSMMMMMSSS..',
    '......MS......',
    '......MS......',
    '......MS......',
    '....SSMSSS....',
    '...SSSSSSSS...',
    '..............'],
};

// ------------------------------------------------------------------------------------------------ procedural glyphs
const G = {
  emote: (T) => {   // a gold face: round, lit from the upper left; ink eyes and a smile
    const im = shape(T, (x, y) => (x - 7) ** 2 + (y - 7) ** 2 <= 6.6 ** 2, 7, 7, 6.6);
    for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5], [8, 4], [9, 4], [8, 5], [9, 5]]) im.set(x, y, T.inkSunk);
    for (const [x, y] of [[3, 8], [4, 9], [5, 10], [6, 10], [7, 10], [8, 10], [9, 9], [10, 8]]) im.set(x, y, T.inkSunk);
    return im;
  },
  more: (T) => {   // three round 4-px beads
    const im = new PixelImage(N, N);
    for (const cx of [0, 5, 10]) for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      if ((dx === 0 || dx === 3) && (dy === 0 || dy === 3)) continue;
      im.set(cx + dx, 5 + dy, dx + dy <= 1 ? T.goldHi : dx + dy >= 5 ? T.goldSh : T.gold);
    }
    return im;
  },
  minus: (T) => stroke(T, (x, y) => x > 2 && x < 11 && y > 6 && y < 9),
  plus: (T) => stroke(T, (x, y) => (x > 2 && x < 11 && y > 6 && y < 9) || (x > 6 && x < 9 && y > 2 && y < 11)),
  pause: (T) => stroke(T, (x, y) => y > 2 && y < 12 && ((x > 3 && x < 6) || (x > 8 && x < 11))),
  play: (T) => stroke(T, (x, y) => x > 3.5 && x < 12 && Math.abs(y - 7) < (12 - x) * 0.62),
  close: (T) => stroke(T, (x, y) => x > 2 && x < 12 && y > 2 && y < 12 && (Math.abs(x - y) < 1.2 || Math.abs(x + y - 14) < 1.2)),
  /** chevrons: n = 1 | 2, dir = -1 (left) | 1 (right) */
  chev: (T, n, dir) => stroke(T, (x, y) => {
    const u = dir < 0 ? x : N - x, dy = Math.abs(y - 7);
    if (dy > (n === 1 ? 5 : 4.2)) return false;
    for (let k = 0; k < n; k++) { const a = (n === 1 ? 4 : 2.5) + k * 5.2; if (u - dy * (n === 1 ? 0.9 : 0.95) >= a && u - dy * (n === 1 ? 0.9 : 0.95) < a + 2.2) return true; }
    return false;
  }),
  /** a rotate arrow: a 2-px arc round (7, 7.5) open at the lower left (rotL) / lower right (rotR, mirrored), its end a
   *  downward arrowhead */
  rot: (T, mirror) => {
    const im = stroke(T, (x, y) => {
      const X = mirror ? N - x : x, dx = X - 7, dy = y - 7.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) * 180 / Math.PI;
      const arc = r >= 3.4 && r <= 5.6 && !(a > 100 && a < 180);
      const head = y >= 6.5 && y <= 10 && Math.abs(X - 2.5) <= (10 - y) * 0.85 + 0.2;
      return arc || head;
    });
    return im;
  },
  star: (T) => {
    const pts = [];
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.9 : 6.9; pts.push([7 + r * Math.cos(a), 7.4 + r * Math.sin(a)]); }
    const inside = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    return shape(T, inside, 7, 7.4, 5);
  },
  dawn: (T) => {   // a sun half over the horizon, three rays
    const im = shape(T, (x, y) => y < 10 && (x - 7) ** 2 + (y - 10) ** 2 <= 4.6 ** 2, 7, 8, 4.6);
    for (let x = 0; x < N; x++) { im.set(x, 10, x < 2 ? T.goldHi : T.gold); im.set(x, 11, T.goldSh); }
    for (const [x, y, c] of [[6, 1, T.goldHi], [7, 1, T.gold], [6, 2, T.goldHi], [7, 2, T.goldSh], [1, 4, T.goldHi], [2, 5, T.gold], [12, 4, T.gold], [11, 5, T.goldSh], [0, 8, T.goldHi], [1, 8, T.gold], [12, 8, T.gold], [13, 8, T.goldSh]]) im.set(x, y, c);
    return im;
  },
  palette: (T) => {   // four pin colours as round gems, each with its own ramp and line
    const im = new PixelImage(N, N);
    [['crimson', 3.5, 3.5], ['gold', 10.5, 3.5], ['teal', 3.5, 10.5], ['violet', 10.5, 10.5]].forEach(([c, cx, cy]) => {
      const R = ramp(PIN_HEX[c]);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
        if (r > 3.3) continue;
        const v = -(dx * 0.62 + dy * 0.78) / 3;
        im.set(x, y, r > 2.4 ? R.line : v > 0.35 ? R.hi : v < -0.3 ? R.sh : R.mid);
      }
    });
    return im;
  },
};

const LINE = { talk: 'n', vote: 'n', die: 'n', ghost: 'O', camera: 'L', bell: 'L', scales: 'L', candle: 'L', life: 'L', timer: 'O' };
// (critic P2-2) the timer row's reset (back to the start: a bar + a left triangle) and the -1 / +1 minute glyphs
G.reset = (T) => stroke(T, (x, y) => (x > 1.5 && x < 4 && y > 2 && y < 12) || (x > 5 && x < 12.5 && y > 2 && y < 12 && Math.abs(y - 7) <= (x - 5) * 0.72 + 0.2));
const one = (x, y) => (x > 8.5 && x < 10.8 && y > 2 && y < 12) || (y > 2 && y < 5 && x > 6.8 && x < 9 && x + y > 10.5) || (y > 10 && y < 12 && x > 7 && x < 12.5);
G.minus1 = (T) => stroke(T, (x, y) => (x > 0.5 && x < 6 && y > 6 && y < 8) || one(x, y));
G.plus1 = (T) => stroke(T, (x, y) => (x > 0.5 && x < 6.5 && y > 6 && y < 8) || (x > 2.5 && x < 4.5 && y > 4 && y < 10) || one(x, y));
/** The HD glyph image of a button key (16x16 incl. its line; library glyphs keep their size), or null. */
export function glyphHD(k, T, { color = 'crimson', paused = false } = {}) {
  return memo(`${k}|${color}|${paused}|${tk(T)}`, () => {
    const Lc = (c) => key(T)[c];
    if (ROWS[k]) return lined(art(ROWS[k], T), Lc(LINE[k]));
    switch (k) {
      case 'emote': case 'more': case 'minus': case 'plus': case 'close': case 'star': case 'dawn':
      case 'reset': case 'minus1': case 'plus1': return lined(G[k](T), T.goldLine);
      case 'palette': return lined(G.palette(T), T.outline);
      case 'pause': return lined(paused ? G.play(T) : G.pause(T), T.goldLine);
      case 'slower': return lined(G.chev(T, 2, -1), T.goldLine);
      case 'faster': return lined(G.chev(T, 2, 1), T.goldLine);
      case 'prev': return lined(G.chev(T, 1, -1), T.goldLine);
      case 'next': return lined(G.chev(T, 1, 1), T.goldLine);
      case 'rotL': return lined(G.rot(T, false), T.goldLine);
      case 'rotR': return lined(G.rot(T, true), T.goldLine);
      case 'point': case 'pointE': return gloveHD(T);
      case 'pin': return swatchHD(color, T, { icon: 'dot' });
      case 'notebook': return LIB.notebook(T);
      case 'gear': return LIB.gear(T);
      case 'help': return LIB.help(T);
      case 'bulb': return LIB.bulb(T, false);
      default: return null;
    }
  });
}

// ------------------------------------------------------------------------------------------------ key hints at D=2
// tiny@2 (cap 10) has caps, digits and - , . ; these are drawn here on the same 10-row grid
const EXTRA_HD = {
  '[': ['####', '##..', '##..', '##..', '##..', '##..', '##..', '##..', '##..', '####'],
  ']': ['####', '..##', '..##', '..##', '..##', '..##', '..##', '..##', '..##', '####'],
  '`': ['##..', '.##.', '..##', '....', '....', '....', '....', '....', '....', '....'],
  '=': ['......', '......', '......', '######', '......', '......', '######', '......', '......', '......'],
  // (critic P2-3) the tiny@2 V read as U and C as [: a V that narrows to a point, a C with turned-in tips
  V: ['##...##', '##...##', '##...##', '.##.##.', '.##.##.', '.##.##.', '..###..', '..###..', '...#...', '...#...'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##....', '##....', '##....', '##..##', '.####.'],
  // a space bar (the bracket under a key)
  '␣': ['..........', '..........', '..........', '..........', '..........', '##......##', '##......##', '##......##', '##########', '##########'],
  // a mouse with its right button lit (RMB)
  '◐': ['..###.##..', '.#..#.###.', '#...#.####', '#...#.####', '##########', '#........#', '#........#', '#........#', '.#......#.', '..######..'],
};
const SYMBOL = { SPC: '␣', RMB: '◐' };
/** The key-hint plate at D=2: tiny@2 gold caps on an ink plate (1-HD-px outline + ink keyline, notched corners). */
export function hintPlateHD(label, T) {
  return memo(`hint|${label}|${tk(T)}`, () => {
    const chars = SYMBOL[label] ? [SYMBOL[label]] : [...String(label).toUpperCase()];
    const ws = chars.map((c) => (EXTRA_HD[c] ? EXTRA_HD[c][0].length : textWidth(c, 'tiny@2')));
    const tw = ws.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * 2;
    const w = tw + 8, h = 15, im = new PixelImage(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      if (corner) continue;
      const ring = x === 1 || y === 1 || x === w - 2 || y === h - 2;
      im.set(x, y, edge ? T.outline : ring ? T.ink : T.inkSunk);
    }
    let x = 4;
    chars.forEach((c, i) => {
      if (EXTRA_HD[c]) EXTRA_HD[c].forEach((r, y) => { for (let j = 0; j < r.length; j++) if (r[j] === '#') im.set(x + j, 3 + y, T.gold); });
      else drawText(im, x, 3, c, { font: 'tiny@2', color: T.gold });
      x += ws[i] + 2;
    });
    return im;
  });
}
