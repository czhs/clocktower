// Panel kit art (owner: panels group; docs/UI.md §2, §4 "panels"). Every DOM-skin element of the Clocktower v2 lobby /
// notebook / story / storyteller / settings / admin screens, drawn in the pixel3d style as PixelImages:
//   - 9-slice frames (panels, buttons in 4 states, primary, danger, tabs, inputs, rows, tooltip, badges, scroll, focus)
//   - controls: checkbox / radio / switch (+ toggle steps), slider track/fill/knob, scrollbar, select chevron, caret
//   - dividers, parchment scroll caps, modal scrim tile, cursors, spinner, 16x16 glyphs + the v2 art/ui icons
// Pure + deterministic (no three.js, no Math.random/Date). Colours come only from the token set T (kit tokens(tod)) or a
// kit ramp() of a token (docs/UI.md §2.3 palette rule). Light from the upper left in every piece (§2.3).
//
//   import { panelKit } from './art.js';  const K = panelKit(T);  K.img.button / K.nine.panel(img, x, y, w, h)
import { PixelImage, ramp, drawText, textWidth, nineSlice } from '../kit.js';
// The hud group's fonts (docs/UI.md §2.4): DISPLAY = titling face (cap 9, small caps), LABEL = kit tiny with a 5-wide
// M / W and 4-wide N (the kit tiny M reads as H: MONK -> HONK). CONTRACT-REQUEST: register both in kit FONTS.
import { DISPLAY, LABEL } from '../hud/font.js';
export { DISPLAY, LABEL };

// ------------------------------------------------------------------------------------------------ materials
/** 3-tone + line ramps per material, all from tokens (or a kit ramp of a token). */
export function mats(T) {
  return {
    iron: { hi: T.ironHi, mid: T.iron, sh: T.ironSh, line: T.outline },
    gold: { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine },
    // parchmentLine equals the noon cobble tone (markers learning): the glove/cursor line is a darker own shade
    parch: { hi: T.parchmentHi, mid: T.parchment, sh: T.parchmentSh, line: ramp(T.parchment, { line: 0.5 }).line },
    ghost: { hi: ramp(T.ghost).hi, mid: T.ghost, sh: T.ghostSh, line: ramp(T.ghostSh, { line: 0.3 }).line },
    ink: { hi: T.inkRaised, mid: T.ink, sh: T.inkSunk, line: T.outline },
    // steel = lit iron for free-standing glyphs (iron itself is too close to the ink panels to read at 16 px)
    steel: { ...ramp(T.ironHi, { light: 0.12, dark: 0.1 }), line: T.outline },
    ok: ramp(T.ok), danger: ramp(T.danger), warn: ramp(T.warn), good: ramp(T.good), evil: ramp(T.evil), violet: ramp(T.stViolet),
  };
}

// ------------------------------------------------------------------------------------------------ mask glyphs
/** Character grid for authoring glyph masks (w x h). '.' = empty; letters = material slots; 'k' = inner line detail. */
export function grid(w = 14, h = 14) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const G = {
    g, w, h,
    put(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; return G; },
    get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? g[y][x] : '.'; },
    rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) G.put(x + i, y + j, c); return G; },
    disc(cx, cy, r, c) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) G.put(x, y, c); return G; },
    /** rows of chars at (ox, oy); '.' keeps, '_' erases. */
    str(rows, ox = 0, oy = 0) { rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '_') G.put(ox + i, oy + j, '.'); else if (ch !== '.') G.put(ox + i, oy + j, ch); })); return G; },
    each(fn) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y, g[y][x]); if (c !== undefined) g[y][x] = c; } return G; },
    rows() { return g.map((r) => r.join('')); },
  };
  return G;
}

/**
 * Render a mask (array of strings) into a PixelImage of (w + 2) x (h + 2): each material pixel auto-shaded from its
 * exposure (top/left open -> hi, bottom/right open -> sh, both or neither -> mid), 'k' = the line tone of the
 * neighbouring material, then a 1-px 4-neighbour outline in the line tone of the material it touches (never black).
 * slots: { a: 'gold', b: 'iron', ... } -> mats(T) keys.
 */
export function renderMask(rows, slots, T, { pad = 1, outline = true } = {}) {
  const M = mats(T);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : rows[y][x] || '.');
  const ramp0 = (c) => M[slots[c]] || M[slots.a] || M.iron;
  const img = new PixelImage(w + 2 * pad, h + 2 * pad);
  const nearMat = (x, y) => {
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c = at(x + dx, y + dy); if (c !== '.' && c !== 'k') return c; }
    return 'a';
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y);
    if (c === '.') continue;
    if (c === 'k') { img.set(x + pad, y + pad, ramp0(nearMat(x, y)).line); continue; }
    const R = ramp0(c);
    const hiE = at(x, y - 1) !== c || at(x - 1, y) !== c, shE = at(x, y + 1) !== c || at(x + 1, y) !== c;
    img.set(x + pad, y + pad, hiE && !shE ? R.hi : shE && !hiE ? R.sh : R.mid);
  }
  if (outline) {
    const hits = [];
    for (let y = -pad; y < h + pad; y++) for (let x = -pad; x < w + pad; x++) {
      if (at(x, y) !== '.') continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const c = at(x + dx, y + dy);
        if (c === '.') continue;
        hits.push([x, y, c === 'k' ? ramp0(nearMat(x + dx, y + dy)).line : ramp0(c).line]);
        break;
      }
    }
    for (const [x, y, col] of hits) img.set(x + pad, y + pad, col);
  }
  return img;
}

// ------------------------------------------------------------------------------------------------ frames
/**
 * One lit plate (9-slice source). s: { line, eHi, eMid, eSh, fill, fHi?, fSh?, corner 0|1|2, shadow (token colour
 * or null), press (plate 1 px down, no shadow), open ('bottom' = tab: no bottom line/edge) }.
 * Edge ring: top + left = eHi, bottom + right = eSh, the two off-corners eMid (light from the upper left).
 */
export function plate(w, h, s, T) {
  const img = new PixelImage(w, h);
  const y0 = s.press ? 1 : 0;
  const ph = s.shadow && !s.press ? h - 1 : h - y0;
  const c = s.corner || 0, open = s.open === 'bottom';
  const cut = (i, j) => {
    const dx = Math.min(i, w - 1 - i), dy = open ? j : Math.min(j, ph - 1 - j);
    if (c === 1) return dx === 0 && dy === 0;
    if (c === 2) return (dx === 0 && dy <= 1) || (dy === 0 && dx <= 1);
    return false;
  };
  for (let j = 0; j < ph; j++) for (let i = 0; i < w; i++) {
    if (cut(i, j)) continue;
    const bottomLine = !open && j === ph - 1, bottomEdge = !open && j === ph - 2;
    const isLine = i === 0 || j === 0 || i === w - 1 || bottomLine || (c === 2 && (cut(i - 1, j) || cut(i + 1, j) || cut(i, j - 1) || cut(i, j + 1)));
    let col;
    if (isLine) col = s.line;
    else if (i === 1 || j === 1 || i === w - 2 || bottomEdge) {
      const top = j === 1, left = i === 1, right = i === w - 2, bot = bottomEdge;
      if ((top && right) || (bot && left)) col = s.eMid ?? s.eHi;
      else if (top || left) col = s.eHi;
      else col = s.eSh;
      if (open && j > 1 && (left || right) && j === ph - 1) col = left ? s.eHi : s.eSh;
    } else if (s.fHi && j === 2) col = s.fHi;
    else if (s.fSh && !open && j === ph - 3) col = s.fSh;
    else col = s.fill;
    img.set(i, y0 + j, col);
  }
  if (s.shadow && !s.press) for (let i = 1; i < w; i++) if (!(c && i === w - 1 && c === 2)) img.set(i, ph, s.shadow);
  return img;
}

/** Iron corner brackets bolted onto a framed plate (panel / modal / parchment): 2-px arms, a rivet, own line. */
function brackets(img, T, { mat = 'iron', rivet = 'gold', arm = 6, y1 = null } = {}) {
  const w = img.w, h = y1 ?? img.h;
  const G = grid(w, h);
  const corner = (fx, fy) => {
    const X = (i) => (fx ? w - 1 - i : i), Y = (j) => (fy ? h - 1 - j : j);
    for (let i = 1; i <= arm; i++) for (let j = 1; j <= 2; j++) { G.put(X(i), Y(j), 'a'); G.put(X(j), Y(i), 'a'); }
    G.put(X(3), Y(3), 'a');
    G.put(X(2), Y(2), 'b');
  };
  corner(0, 0); corner(1, 0); corner(0, 1); corner(1, 1);
  const art = renderMask(G.rows(), { a: mat, b: rivet }, T, { pad: 0 });
  // keep the plate's own outer line ring: only blit inside it
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const v = art.get(x, y); if (v[3]) img.set(x, y, v); }
  return img;
}

/** A tiny-font badge / chip (11 px tall pill): line, edge ring, 1 px pad, tiny caps, 1 px pad. */
export function badge(text, st, T) {
  if (st.font === 'body') {   // body-font badge (mixed case)
    const tw = textWidth(text), w = tw + 8, h = 12;
    const im = plate(w, h, { line: T.outline, eHi: st.edge, eSh: st.edgeSh ?? st.edge, eMid: st.edge, fill: st.fill ?? T.ink, corner: 2 }, T);
    drawText(im, 4, 3, text, { color: st.text });
    return im;
  }
  const tw = textWidth(text, LABEL), w = tw + 8, h = 11;
  const im = plate(w, h, { line: T.outline, eHi: st.edge, eSh: st.edgeSh ?? st.edge, eMid: st.edge, fill: st.fill ?? T.ink, corner: 2 }, T);
  drawText(im, 4, 3, text, { font: LABEL, color: st.text });
  return im;
}

// ------------------------------------------------------------------------------------------------ glyph masks
// 14 x 14 masks (16 x 16 with the outline; docs/UI.md §2.6 "16x16: toolbar / dock / pie icons, glyph set").
const SUN = ['......aa......', '......aa......', '.a..........a.', '..a..aaaa..a..', '....aaaaaa....', '...aaaaaaaa...', 'aa.aaaaaaaa.aa',
  'aa.aaaaaaaa.aa', '...aaaaaaaa...', '....aaaaaa....', '..a..aaaa..a..', '.a..........a.', '......aa......', '......aa......'];
const crescent = (left = true) => grid().each((x, y) => {
  const o = (x + 0.5 - 6.5) ** 2 + (y + 0.5 - 7) ** 2 <= 36, cx = left ? 9.6 : 3.4;
  const i = (x + 0.5 - cx) ** 2 + (y + 0.5 - 5.6) ** 2 <= 26;
  return o && !i ? 'a' : undefined;
});
const GHOST = ['....aaaaa.....', '...aaaaaaa....', '..aaaaaaaaa...', '..akkaaakka...', '..akkaaakka...', '..aaaaaaaaa...', '.aaaaaaaaaaa..',
  '.aaaaaaaaaaa..', '.aaaaaaaaaaa..', '.aaaaaaaaaaa..', '.aaaaaaaaaaa..', '.aa.aaa.aaa...', '.a...a...a....', '..............'];
const HAND = ['.....aa.......', '..aa.aa.aa....', '..aa.aa.aa....', '..aa.aa.aa.aa.', '..aa.aa.aa.aa.', '..aaaaaaaaaaa.', '..aaaaaaaaaaa.',
  'aaaaaaaaaaaaa.', '.aaaaaaaaaaaa.', '..aaaaaaaaaa..', '...aaaaaaaaa..', '....aaaaaaa...', '....bbbbbbb...', '....bbbbbbb...'];
const SPEAKER = ['..............', '..............', '.....a........', '....aa...b....', '...aaa....b...', 'aaaaaa..b..b..', 'aaaaaa...b.b..',
  'aaaaaa...b.b..', 'aaaaaa..b..b..', '...aaa....b...', '....aa...b....', '.....a........', '..............', '..............'];
const MIC = ['.....aaaa.....', '....aaaaaa....', '....aaaaaa....', '....aaaaaa....', '....aaaaaa....', '....aaaaaa....', '....aaaaaa....',
  '..b.aaaaaa.b..', '..b..aaaa..b..', '...bb....bb...', '.....bbbb.....', '......bb......', '....bbbbbb....', '....bbbbbb....'];
const LOCK = ['....bbbbbb....', '...bbbbbbbb...', '..bbb....bbb..', '..bb......bb..', '..bb......bb..', '.aaaaaaaaaaaa.', '.aaaaaaaaaaaa.',
  '.aaaaakkaaaaa.', '.aaaaakkaaaaa.', '.aaaaaakaaaaa.', '.aaaaaakaaaaa.', '.aaaaaaaaaaaa.', '.aaaaaaaaaaaa.', '..............'];
const CHECK = ['..............', '..............', '..............', '...........aa.', '..........aaa.', '.........aaa..', '........aaa...',
  '.aa....aaa....', '.aaa..aaa.....', '..aaaaaa......', '...aaaa.......', '....aa........', '..............', '..............'];
const xMark = (t = 1) => grid().each((x, y) => (Math.abs(x - y) <= t || Math.abs(x + y - 13) <= t) && x > 1 && x < 12 && y > 1 && y < 12 ? 'a' : undefined);
const STAR = ['......aa......', '......aa......', '.....aaaa.....', '.....aaaa.....', 'aaaaaaaaaaaaaa', '.aaaaaaaaaaaa.', '..aaaaaaaaaa..',
  '...aaaaaaaa...', '...aaaaaaaa...', '..aaaaaaaaaa..', '..aaaa..aaaa..', '.aaa......aaa.', '.aa........aa.', '..............'];
const pencil = () => grid().each((x, y) => {
  const p = x + y - 13, u = x - y;   // p across the shaft, u along it (tip at u = -11, eraser at +11)
  if (u < -10 || u > 11) return undefined;
  if (u <= -8) return Math.abs(p) <= (u + 10) * 0.5 ? (u <= -9 ? 'k' : 'b') : undefined;
  if (Math.abs(p) > 1.5) return undefined;
  return u >= 7 ? 'c' : u <= -6 ? 'b' : 'a';
});
const gear = () => grid().each((x, y) => {
  const dx = x + 0.5 - 7, dy = y + 0.5 - 7, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const tooth = Math.cos(a * 8) > 0.35;
  if (r <= 1.9) return undefined;
  return r <= 4.6 || (tooth && r <= 6.6) ? 'a' : undefined;
});
const ring = (ro, ri, cx = 7, cy = 7) => (x, y) => { const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); return r <= ro && r > ri; };

export const GLYPHS = {
  edit: { m: { a: 'gold', b: 'parch', c: 'danger' }, f: () => pencil().rows() },
  firstnight: { m: { a: 'parch', b: 'gold' }, f: () => crescent(false).str(['.b.', 'bbb', '.b.'], 1, 1).rows() },
  day: { m: { a: 'gold' }, rows: SUN },
  gather: { m: { a: 'gold' }, f: () => grid().each((x, y) => (ring(6.6, 4.8)(x, y) || Math.hypot(x + 0.5 - 7, y + 0.5 - 7) <= 2.3 ? 'a' : undefined)).rows() },
  bedtime: { m: { a: 'gold' }, rows: ['..............', '.....aaaaaaaa.', '.....aaaaaaaa.', '.....a......a.', '.....a......a.', '.....a......a.',
    '.....a......a.', '.....a......a.', '.....a....aaa.', '..aaaa...aaaa.', '.aaaaa...aaaa.', '.aaaaa....aa..', '..aaa.........', '..............'] },
  night: { m: { a: 'parch', b: 'gold' }, f: () => crescent(true).str(['.b.', 'bbb', '.b.'], 10, 9).rows() },
  dawn: { m: { a: 'gold', b: 'steel' }, rows: ['..............', '..............', '......aa......', '..a...aa...a..', '...a......a...', '..............',
    '.....aaaa.....', '...aaaaaaaa...', 'a.aaaaaaaaaa.a', '..aaaaaaaaaa..', 'bbbbbbbbbbbbbb', 'bbbbbbbbbbbbbb', '..............', '..............'] },
  end: { m: { a: 'danger', b: 'steel' }, rows: ['.bb...........', '.bbaaaa..aaa..', '.bbaaaaaaaaaa.', '.bbaaaaaaaaaa.', '.bbaaaaaaaaaa.', '.bbaaaaaaaaa..',
    '.bb.aaa..aaa..', '.bb...........', '.bb...........', '.bb...........', '.bb...........', '.bb...........', 'bbbb..........', 'bbbb..........'] },
  undo: { m: { a: 'parch' }, rows: ['..............', '.....aaaa.....', '...aaaaaaaa...', '..aaa....aaa..', '..aa......aa..', '..aa.......aa.',
    'aaaaaa.....aa.', '.aaaa......aa.', '..aa......aaa.', '..........aa..', '........aaa...', '......aaaa....', '......aa......', '..............'] },
  swap: { m: { a: 'parch', b: 'gold' }, rows: ['.........a....', '.........aa...', '.aaaaaaaaaaa..', '.aaaaaaaaaaaa.', '.aaaaaaaaaaa..', '.........aa...',
    '.........a....', '....b.........', '...bb.........', '..bbbbbbbbbbb.', '.bbbbbbbbbbbb.', '..bbbbbbbbbbb.', '...bb.........', '....b.........'] },
  home: { m: { a: 'parch', b: 'danger', c: 'gold' }, rows: ['......bb......', '.....bbbb.....', '....bbbbbb....', '...bbbbbbbb...', '..bbbbbbbbbb..', '.bbbbbbbbbbbb.',
    '..aaaaaaaaaa..', '..aaaaaaaaaa..', '..aaaaaacca...', '..akkaaacca...', '..akkaaaaaaa..', '..akkaaaaaaa..', '..akkaaaaaaa..', '..............'] },
  gear: { m: { a: 'steel' }, f: () => gear().rows() },
  help: { m: { a: 'parch' }, rows: ['..............', '.....aaaaa....', '....aaaaaaa...', '...aaa...aaa..', '...aaa...aaa..', '.........aaa..',
    '........aaa...', '.......aaa....', '.......aaa....', '..............', '.......aaa....', '.......aaa....', '..............', '..............'] },
  leave: { m: { a: 'parch', b: 'steel' }, rows: ['........bbbbbb', '........b....b', '....a...b....b', '...aa...b....b', '..aaaaaaaaaa.b', '.aaaaaaaaaaa.b',
    '.aaaaaaaaaaa.b', '..aaaaaaaaaa.b', '...aa...b....b', '....a...b....b', '........b....b', '........b....b', '........bbbbbb', '..............'] },
  check: { m: { a: 'ok' }, rows: CHECK },
  cross: { m: { a: 'danger' }, f: () => xMark(1).rows() },
  close: { m: { a: 'steel' }, f: () => grid().each((x, y) => ((x === y || x === y + 1 || x + y === 13 || x + y === 12) && x > 2 && x < 11 && y > 2 && y < 11 ? 'a' : undefined)).rows() },
  minimize: { m: { a: 'steel' }, f: () => grid().rect(3, 6, 8, 2, 'a').rows() },
  chevron: { m: { a: 'gold' }, rows: ['..............', '..............', '..............', '..............', '..aa......aa..', '..aaa....aaa..',
    '...aaa..aaa...', '....aaaaaa....', '.....aaaa.....', '......aa......', '..............', '..............', '..............', '..............'] },
  star: { m: { a: 'gold' }, rows: STAR },
  ghost: { m: { a: 'ghost' }, rows: GHOST },
  hand: { m: { a: 'parch', b: 'gold' }, rows: HAND },
  scale: { m: { a: 'gold', b: 'steel' }, rows: ['......bb......', '.....bbbb.....', 'bbbbbbbbbbbbbb', '..b...bb...b..', '..b...bb...b..', '..b...bb...b..',
    'aaaaa.bb.aaaaa', '.aaa..bb..aaa.', '......bb......', '......bb......', '......bb......', '.....bbbb.....', '...bbbbbbbb...', '...bbbbbbbb...'] },
  scroll: { m: { a: 'parch', b: 'parch' }, rows: ['..bbbbbbbbbb..', '.bbbbbbbbbbbb.', '..bbbbbbbbbb..', '...aaaaaaaa...', '...akkkkkka...', '...aaaaaaaa...',
    '...akkkkkaa...', '...aaaaaaaa...', '...akkkkkka...', '...aaaaaaaa...', '...akkkaaaa...', '..bbbbbbbbbb..', '.bbbbbbbbbbbb.', '..bbbbbbbbbb..'] },
  mic: { m: { a: 'steel', b: 'iron' }, rows: MIC },
  speaker: { m: { a: 'steel', b: 'gold' }, rows: SPEAKER },
  mute: { m: { a: 'steel', c: 'danger' }, f: () => grid().str(SPEAKER.map((r) => r.replace(/b/g, '.'))).str(['c...c', '.c.c.', '..c..', '.c.c.', 'c...c'], 8, 4).rows() },
  lock: { m: { a: 'gold', b: 'steel' }, rows: LOCK },
  bell: { m: { a: 'gold', b: 'steel' }, rows: ['......bb......', '.....aaaa.....', '....aaaaaa....', '...aaaaaaaa...', '...aaaaaaaa...', '...aaaaaaaa...',
    '...aaaaaaaa...', '..aaaaaaaaaa..', '..aaaaaaaaaa..', '.aaaaaaaaaaaa.', 'aaaaaaaaaaaaaa', '......bb......', '......bb......', '..............'] },
  notebook: { m: { a: 'violet', b: 'parch', c: 'gold' }, rows: ['..............', '..aaaaaaaaa...', '..aaaaaaaaab..', '..aacccccaab..', '..aacccccaab..', '..aaaaaaaaab..',
    '..aaaaaaaaab..', '..aaaaaaaaab..', '..aaaaaaaaab..', '..aaaaaaaaab..', '..aaaaaaaaab..', '..aaaaaaaaab..', '...bbbbbbbbb..', '..............'] },
  chat: { m: { a: 'parch' }, rows: ['..............', '..aaaaaaaaaa..', '.aaaaaaaaaaaa.', '.aaaaaaaaaaaa.', '.aakkakkakkaa.', '.aakkakkakkaa.', '.aaaaaaaaaaaa.',
    '.aaaaaaaaaaaa.', '..aaaaaaaaaa..', '...aa.........', '..aa..........', '.aa...........', '..............', '..............'] },
  link: { m: { a: 'steel', b: 'gold' }, rows: ['..............', '..............', '..aaaaa.......', '.aa...aa......', '.a.....a......', '.a...bbbbb....', '.a..bba.abb...',
    '.aa.b.aa..b...', '..aabaaa..b...', '.....b.....b..', '.....bb...bb..', '......bbbbb...', '..............', '..............'] },
  eye: { m: { a: 'parch', b: 'good' }, rows: ['..............', '..............', '..............', '....aaaaaa....', '..aaabbbbaaa..', '.aaabbkkbbaaa.', 'aaaabbkkbbaaaa',
    '.aaabbbbbbaaa.', '..aaabbbbaaa..', '....aaaaaa....', '..............', '..............', '..............', '..............'] },
  crown: { m: { a: 'gold', b: 'danger' }, rows: ['..............', '..............', '..............', '.a....aa....a.', '.aa...aa...aa.', '.aaa.aaaa.aaa.', '.aaaaaaaaaaaa.',
    '.aaaaaaaaaaaa.', '.aabaaaaaabaa.', '.aaaaaaaaaaaa.', '.aaaaaaaaaaaa.', '..............', '..............', '..............'] },
};

// v2 apps/client/public/art/ui/*.png (16x16 icons): same names, new art. Some reuse a glyph's mask.
export const V2_ICONS = {
  alive: { m: { a: 'ok', b: 'ok' }, rows: ['..............', '..............', '..........aa..', '...aa....aaaa.', '..aaaa..aaaa..', '..aaaaa.aaa...',
    '...aaaa.aa....', '.....aabaa....', '......bb......', '......b.......', '......b.......', '......b.......', '.....bbb......', '..............'] },
  dead: { m: { a: 'steel', b: 'ok' }, rows: ['..............', '....aaaaaa....', '...aaaaaaaa...', '..aaaaaaaaaa..', '..aaaakaaaaa..', '..aaakkkaaaa..',
    '..aaaakaaaaa..', '..aaaakaaaaa..', '..aaaaaaaaaa..', '..aaaaaaaaaa..', '..aaaaaaaaaa..', '..aaaaaaaaaa..', '.bbbbbbbbbbbb.', '..............'] },
  'ghost-vote': { m: { a: 'ghost', b: 'gold' }, f: () => grid().str(GHOST.map((r) => r.slice(1)), -1, 0).disc(11.5, 10.5, 2.6, 'b').rows() },
  'ghost-vote-spent': { m: { a: 'ghost', b: 'steel' }, f: () => grid().str(GHOST.map((r) => r.slice(1)), -1, 0).each((x, y) => (ring(2.7, 1.4, 11.5, 10.5)(x, y) ? 'b' : undefined)).rows() },
  host: { m: { a: 'gold' }, f: () => grid().disc(3.8, 7, 3.6, 'a').disc(3.8, 7, 1.3, '.').rect(7, 6, 7, 2, 'a').rect(10, 8, 1, 2, 'a').rect(12, 8, 1, 3, 'a').rows() },
  locked: { m: { a: 'gold', b: 'steel' }, rows: LOCK },
  muted: { m: { a: 'steel', b: 'iron', c: 'danger' }, f: () => grid().str(MIC).each((x, y) => (Math.abs(x + y - 13.5) <= 0.6 && x > 0 && x < 13 ? 'c' : undefined)).rows() },
  nominate: { m: { a: 'parch', b: 'gold' }, rows: ['..............', '..............', '..............', '....aaaa......', '..bbaaaaaaaaaa', '..bbaaaaaaaaaa', '..bbaaaaa.....',
    '..bbaaaaaa....', '..bbaaaaa.....', '..bbaaaaaa....', '....aaaaa.....', '..............', '..............', '..............'] },
  'phase-dawn': { ref: 'dawn' },
  'phase-day': { ref: 'day' },
  'phase-dusk': { m: { a: 'warn', b: 'steel', c: 'violet' }, rows: ['..............', '..............', '..............', '..............', '.cc.......cc..', '..cc.....cc...',
    '..............', '.....aaaa.....', '...aaaaaaaa...', '..aaaaaaaaaa..', 'bbbbbbbbbbbbbb', 'bbbbbbbbbbbbbb', '..............', '..............'] },
  'phase-night': { ref: 'night' },
  speaking: { m: { a: 'steel', b: 'gold' }, rows: SPEAKER },
  storyteller: { m: { a: 'warn', b: 'gold', c: 'parch' }, rows: ['......bb......', '.....b..b.....', '....bbbbbb....', '...bbbbbbbb...', '....bccccb....', '....bcaacb....',
    '....bcaacb....', '....bcaacb....', '....bccccb....', '...bbbbbbbb...', '....bbbbbb....', '..............', '..............', '..............'] },
  'vote-hand': { ref: 'hand' },
  'vote-yes': { m: { a: 'parch', b: 'gold', c: 'ok' }, f: () => grid().str(HAND.map((r) => r.slice(2)), 0, 0).str(['....c', '...cc', 'c.cc.', 'ccc..', '.c...'], 9, 8).rows() },
};
export function glyphImage(name, T) {
  let s = GLYPHS[name] || V2_ICONS[name];
  if (s?.ref) s = GLYPHS[s.ref];
  const rows = s.rows || s.f();
  return renderMask(rows, s.m, T);
}
// 7x7 notebook toggles (inline with body text): 5x5 masks + outline
const TOGGLES = {
  star: { m: { a: 'gold' }, rows: ['..a..', '..a..', 'aaaaa', '.aaa.', '.a.a.'] },
  maybe: { m: { a: 'parch' }, rows: ['.aaa.', 'a...a', '..aa.', '.....', '..a..'] },
  no: { m: { a: 'danger' }, rows: ['a...a', '.a.a.', '..a..', '.a.a.', 'a...a'] },
};
export const toggleGlyph = (name, T) => renderMask(TOGGLES[name].rows, TOGGLES[name].m, T);
/**
 * Off mark: the same shape, flat textDim, no outline (r1: steel on the inkRaised segment was nearly invisible at 1x; a
 * recoloured outline turned the shapes into blobs). The on state keeps its own colour on the gold segment.
 */
export const toggleGlyphOff = (name, T) => {
  const R = TOGGLES[name].rows, im = new PixelImage(7, 7);
  R.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') im.set(x + 1, y + 1, T.textDim); }));
  return im;
};

// ------------------------------------------------------------------------------------------------ controls
function checkbox(T, state) {
  const on = state === 'on' || state === 'mixed' || state === 'pop', dis = state === 'disabled', hov = state === 'hover';
  const im = plate(9, 9, { line: T.outline, eHi: on ? T.goldSh : dis ? T.ink : T.shadow, eSh: on ? T.gold : dis ? T.ironSh : T.ironHi, eMid: on ? T.goldSh : dis ? T.ironSh : T.iron, fill: dis ? T.ink : hov ? T.inkRaised : T.inkSunk, corner: 1 }, T);
  if (state === 'on') { const c = renderMask(['....a', '...a.', 'a.a..', '.a...'], { a: 'gold' }, T, { outline: false, pad: 0 }); im.blit(c, 2, 2); im.set(6, 2, T.goldHi); im.set(2, 4, T.goldHi); }
  if (state === 'mixed') im.hline(2, 4, 5, T.gold);
  // pop = the ON drawing one step smaller (3x3 tick, inset 1 px): never another state's drawing (r1 flashed 'mixed')
  if (state === 'pop') { const c = renderMask(['..a', 'a.a', '.a.'], { a: 'gold' }, T, { outline: false, pad: 0 }); im.blit(c, 3, 3); im.set(5, 3, T.goldHi); }
  return im;
}
function radio(T, state) {
  const on = state === 'on', hov = state === 'hover';
  const im = new PixelImage(9, 9);
  im.disc(4.5, 4.5, 4.6, T.outline);
  im.disc(4.5, 4.5, 3.6, T.inkSunk);
  // inner bevel: shadow on the upper left of the well, lit lower right rim
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const d = Math.hypot(x + 0.5 - 4.5, y + 0.5 - 4.5);
    if (d > 2.6 && d <= 3.6) im.set(x, y, x + y < 8 ? (on ? T.goldSh : T.shadow) : on ? T.gold : T.ironHi);
    else if (d <= 2.6 && hov && !on) im.set(x, y, T.inkRaised);
  }
  if (on) { im.rect(3, 3, 3, 3, T.gold); im.set(3, 3, T.goldHi); im.set(5, 5, T.goldSh); }
  return im;
}
/** Switch 17x9: k = 0 (off) .. 3 (on); 1, 2 = the two in-between drawings (v2 120 ms -> 4 grid frames). */
export function switchImg(T, k) {
  const on = k >= 2;
  const im = plate(17, 9, { line: T.outline, eHi: on ? T.goldSh : T.shadow, eSh: on ? T.gold : T.ironHi, eMid: on ? T.goldSh : T.iron, fill: on ? T.goldLine : T.inkSunk, corner: 2 }, T);
  const kx = [1, 4, 7, 9][k];
  const knob = plate(7, 9, on ? { line: T.goldLine, eHi: T.goldHi, eSh: T.goldSh, eMid: T.gold, fill: T.gold, corner: 2 } : { line: T.outline, eHi: mats(T).steel.hi, eSh: mats(T).steel.sh, eMid: mats(T).steel.mid, fill: mats(T).steel.mid, corner: 2 }, T);
  im.blit(knob, kx, 0);
  if (!on) { im.set(13, 4, T.ironSh); } else { im.set(4, 4, T.goldSh); }   // the off/on tick in the empty half
  return im;
}
function sliderTrack(T, fill) {
  const im = new PixelImage(16, 5);
  im.hline(0, 0, 16, T.outline); im.hline(0, 4, 16, T.outline);
  im.hline(0, 1, 16, fill ? T.goldSh : T.shadow); im.hline(0, 2, 16, fill ? T.gold : T.inkSunk); im.hline(0, 3, 16, fill ? T.gold : T.ironSh);
  if (fill) im.set(0, 1, T.goldSh);
  return im;
}
function sliderKnob(T, st) {
  const gold = st === 'pressed', dis = st === 'disabled';
  const R = gold ? { line: T.goldLine, eHi: T.goldHi, eSh: T.goldSh, eMid: T.gold, fill: T.gold } : { line: T.outline, eHi: dis ? T.iron : T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: dis ? T.ironSh : st === 'hover' ? T.ironHi : T.iron };
  const im = plate(7, 12, { ...R, corner: 1, shadow: T.shadow }, T);
  im.hline(2, 4, 3, R.eSh); im.hline(2, 6, 3, R.eSh);   // grip
  im.hline(2, 5, 3, R.eHi); im.hline(2, 7, 3, R.eHi);
  return im;
}
function scrollThumb(T, hov) {
  const im = plate(6, 14, { line: T.outline, eHi: hov ? T.ironHi : T.iron, eSh: T.ironSh, eMid: T.iron, fill: hov ? T.iron : T.ironSh, corner: 1 }, T);
  for (const y of [5, 7]) { im.hline(2, y, 2, T.outline); im.hline(2, y + 1, 2, hov ? T.ironHi : T.iron); }
  return im;
}
function scrollTrack(T) {
  const im = new PixelImage(6, 8);
  im.rect(0, 0, 6, 8, T.inkSunk); im.vline(0, 0, 8, T.outline); im.vline(1, 0, 8, T.shadow); im.vline(5, 0, 8, T.ironSh);
  return im;
}
/** Spinner 13x13, drawing k of 9 (v2 .ct-spinner 0.9 s turn -> 9 drawings x 3 grid frames). Per-pixel angle test. */
export function spinner(T, k) {
  const im = new PixelImage(13, 13);
  const a0 = (k / 9) * Math.PI * 2;
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const dx = x + 0.5 - 6.5, dy = y + 0.5 - 6.5, r = Math.hypot(dx, dy);
    if (r > 6.3 || r <= 3.6) continue;
    let a = Math.atan2(dx, -dy) - a0; a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const head = a > 2 * Math.PI - 2.2;
    const edge = r > 5.3 || r <= 4.6;
    im.set(x, y, head ? (a > 2 * Math.PI - 0.8 ? T.goldHi : edge ? T.goldSh : T.gold) : edge ? T.outline : T.inkSunk);
  }
  return im;
}
function chevronSmall(T) { return renderMask(['a...a', '.a.a.', '..a..'], { a: 'gold' }, T, { outline: false, pad: 0 }); }

// ------------------------------------------------------------------------------------------------ cursors
// 16x16 cells, hotspot in CURSORS[name].hot (texels). Parchment-gloved like the markers finger; line darker own shade.
export const CURSORS = {
  'cursor-arrow': { hot: [1, 1], m: { a: 'parch', b: 'gold' }, rows: ['a.........', 'aa........', 'aaa.......', 'aaaa......', 'aaaaa.....', 'aaaaaa....', 'aaaaaaa...',
    'aaaaaaaa..', 'aaaaaaaaa.', 'aaaaaa....', 'aa.aaa....', 'a...aaa...', '....aaa...', '.....aa...'] },
  'cursor-pointer': { hot: [5, 1], m: { a: 'parch', b: 'gold' }, rows: ['....aa......', '....aa......', '....aa......', '....aa......', '....aaaa.a..', '....aaaaaaa.', '.aa.aaaaaaaa',
    '.aaaaaaaaaaa', '..aaaaaaaaaa', '..aaaaaaaaaa', '...aaaaaaaa.', '...aaaaaaaa.', '....bbbbbb..', '....bbbbbb..'] },
  'cursor-pointer-down': { hot: [5, 2], m: { a: 'parch', b: 'gold' }, rows: ['............', '....aa......', '....aa......', '....aa......', '....aaaa.a..', '....aaaaaaa.', '....aaaaaaaa',
    '.aaaaaaaaaaa', '..aaaaaaaaaa', '..aaaaaaaaaa', '...aaaaaaaa.', '...aaaaaaaa.', '....bbbbbb..', '....bbbbbb..'] },
  'cursor-text': { hot: [3, 7], m: { a: 'parch' }, rows: ['aa.aa', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', 'aa.aa'] },
  'cursor-grab': { hot: [6, 6], m: { a: 'parch', b: 'gold' }, rows: ['...a.a.a....', '..aaaaaaa...', '..aaaaaaaa..', '..aaaaaaaa..', 'aaaaaaaaaa..', '.aaaaaaaaa..', '..aaaaaaaa..',
    '..aaaaaaa...', '...bbbbbb...', '...bbbbbb...'] },
  'cursor-not-allowed': { hot: [7, 7], m: { a: 'danger' }, f: () => grid(13, 13).each((x, y) => {
    const r = Math.hypot(x + 0.5 - 6.5, y + 0.5 - 6.5);
    return (r <= 6.4 && r > 4.6) || (Math.abs(x - y) <= 0.6 && r <= 5) ? 'a' : undefined;
  }).rows() },
};
export function cursorImage(name, T) {
  const c = CURSORS[name];
  const art = renderMask(c.rows || c.f(), c.m, T);
  const im = new PixelImage(16, 16);
  im.blit(art, 0, 0);
  return im;
}

// ------------------------------------------------------------------------------------------------ the kit
const _kits = new WeakMap();
/** All panel-kit frames for a token set: { img: {name: PixelImage}, insets: {name: {l,t,r,b}}, nine: {name: draw} }. */
export function panelKit(T) {
  if (_kits.has(T)) return _kits.get(T);
  const M = mats(T), D = M.danger, OK = M.ok, V = M.violet;
  const img = {}, insets = {};
  const add = (n, im, ins = null) => { img[n] = im; if (ins) insets[n] = ins; return im; };
  const I3 = { l: 3, t: 3, r: 3, b: 3 }, I34 = { l: 3, t: 3, r: 3, b: 4 };
  const btn = (fill, eHi, eSh, eMid, line = T.outline, extra = {}) => ({ line, eHi, eSh, eMid, fill, corner: 1, shadow: T.shadow, ...extra });

  // --- v2 names (apps/client/public/art/ui): panel 48x48 (slice 8), panel-parchment 48x48 (8), button* 48x16, divider 64x8
  add('panel', brackets(plate(48, 48, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.ink, fHi: T.inkRaised, corner: 1, shadow: T.shadow }, T), T, { y1: 47 }), { l: 8, t: 8, r: 8, b: 8 });
  add('panel-parchment', brackets(plate(48, 48, { line: M.parch.line, eHi: T.parchmentHi, eSh: T.parchmentSh, eMid: T.parchment, fill: T.parchment, fSh: T.parchmentSh, corner: 1, shadow: T.shadow }, T), T, { y1: 47 }), { l: 8, t: 8, r: 8, b: 8 });
  add('button', plate(48, 16, btn(T.inkRaised, T.ironHi, T.ironSh, T.iron), T), I34);
  add('button-hover', plate(48, 16, btn(T.bubbleHi, T.ironHi, T.iron, T.ironHi, T.outline, { fHi: T.iron }), T), I34);
  add('button-primary', plate(48, 16, btn(T.goldLine, T.goldHi, T.goldSh, T.gold, T.outline, { fHi: T.goldSh }), T), I34);
  add('divider', (() => {
    const im = new PixelImage(64, 8);
    im.hline(8, 3, 48, T.ironHi); im.hline(8, 4, 48, T.ironSh);   // lit rule: top cream-iron, lower shadow
    const knot = renderMask(['.a.', 'aba', '.a.'].map((r) => r), { a: 'gold', b: 'gold' }, T);
    const end = renderMask(['..a..', '.aaa.', 'aaaaa', '.aaa.', '..a..'], { a: 'gold' }, T);
    im.blit(end, 0, 0); im.blit(end, 57, 0); void knot;
    return im;
  })(), { l: 8, t: 0, r: 8, b: 0 });

  // --- buttons (new-style states; insets 3/3/4/3, shadow row included)
  add('button-pressed', plate(48, 16, btn(T.inkSunk, T.shadow, T.iron, T.ironSh, T.outline, { press: true }), T), I3);
  add('button-disabled', plate(48, 16, { line: T.outline, eHi: T.ironSh, eSh: T.ironSh, eMid: T.ironSh, fill: T.ink, corner: 1, shadow: null }, T), I3);
  add('button-selected', plate(48, 16, btn(T.inkRaised, T.goldHi, T.goldSh, T.gold), T), I34);
  add('button-primary-hover', plate(48, 16, btn(T.goldLine, T.goldHi, T.gold, T.goldHi, T.outline, { fHi: T.gold }), T), I34);
  add('button-primary-pressed', plate(48, 16, btn(T.goldLine, T.goldLine, T.gold, T.goldSh, T.outline, { press: true, fHi: T.shadow }), T), I3);
  add('button-primary-disabled', plate(48, 16, { line: T.outline, eHi: T.goldSh, eSh: T.goldSh, eMid: T.goldSh, fill: T.inkSunk, corner: 1 }, T), I3);
  add('button-danger', plate(48, 16, btn(T.ink, D.hi, D.sh, D.mid), T), I34);
  add('button-danger-hover', plate(48, 16, btn(T.inkRaised, D.hi, D.mid, D.hi, T.outline, { fHi: D.line }), T), I34);
  // segmented control (Storyteller | Automatic, Push-to-talk | Open mic): square-cornered, no shadow
  add('segment', plate(24, 13, { line: T.outline, eHi: T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: T.inkRaised, corner: 0 }, T), I3);
  add('segment-on', plate(24, 13, { line: T.outline, eHi: T.goldSh, eSh: T.gold, eMid: T.goldSh, fill: T.goldLine, corner: 0 }, T), I3);

  // --- tabs (top corners notched, open bottom: they stand on tab-strip)
  add('tab', plate(24, 12, { line: T.outline, eHi: T.ironSh, eSh: T.ironSh, eMid: T.ironSh, fill: T.inkSunk, corner: 1, open: 'bottom' }, T), { l: 3, t: 3, r: 3, b: 1 });
  add('tab-hover', plate(24, 12, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.inkRaised, corner: 1, open: 'bottom' }, T), { l: 3, t: 3, r: 3, b: 1 });
  add('tab-active', (() => {
    const im = plate(24, 13, { line: T.outline, eHi: T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: T.ink, corner: 1, open: 'bottom' }, T);
    im.hline(2, 1, 20, T.goldHi); im.hline(2, 2, 20, T.goldSh);   // gold lip = selected (not by colour alone: 1 px taller)
    return im;
  })(), { l: 3, t: 3, r: 3, b: 1 });
  add('tab-strip', (() => { const im = new PixelImage(4, 2); im.hline(0, 0, 4, T.ironHi); im.hline(0, 1, 4, T.outline); return im; })());

  // --- inputs (sunk well: dark upper-left inner rim, lit lower-right)
  const well = (eHi, eSh, fill = T.inkSunk) => plate(32, 13, { line: T.outline, eHi, eSh, eMid: T.ironSh, fill, corner: 1 }, T);
  add('input', well(T.shadow, T.iron), I3);
  add('input-hover', well(T.shadow, T.ironHi), I3);
  add('input-focus', well(T.goldLine, T.gold), I3);
  add('input-disabled', well(T.ink, T.ironSh, T.ink), I3);
  add('select', (() => { const im = well(T.shadow, T.iron); im.blit(chevronSmall(T), 24, 5); return im; })(), { l: 3, t: 3, r: 11, b: 3 });
  add('select-chevron', chevronSmall(T));
  add('caret', (() => { const im = new PixelImage(1, 8); im.vline(0, 0, 8, T.text); return im; })());
  add('focus', (() => { const im = new PixelImage(12, 12); im.frame(1, 1, 10, 10, T.gold); im.frame(0, 0, 12, 12, T.goldLine); im.frame(2, 2, 8, 8, T.goldLine); for (const [x, y] of [[0, 0], [11, 0], [0, 11], [11, 11]]) im.erase(x, y); return im; })(), I3);

  // --- checkboxes / radios / switch / slider / scrollbar
  for (const s of ['off', 'on', 'hover', 'mixed', 'disabled', 'pop']) add(`checkbox${s === 'off' ? '' : '-' + s}`, checkbox(T, s));
  for (const s of ['off', 'on', 'hover']) add(`radio${s === 'off' ? '' : '-' + s}`, radio(T, s));
  add('switch', switchImg(T, 0)); add('switch-on', switchImg(T, 3));
  for (let k = 0; k < 4; k++) add(`switch_${k}`, switchImg(T, k));
  add('slider-track', sliderTrack(T, false), { l: 2, t: 0, r: 2, b: 0 });
  add('slider-fill', sliderTrack(T, true), { l: 2, t: 0, r: 2, b: 0 });
  for (const s of ['', 'hover', 'pressed', 'disabled']) add(`slider-knob${s ? '-' + s : ''}`, sliderKnob(T, s));
  add('scrollbar-track', scrollTrack(T), { l: 0, t: 2, r: 0, b: 2 });
  add('scrollbar-thumb', scrollThumb(T, false), { l: 0, t: 4, r: 0, b: 4 });
  add('scrollbar-thumb-hover', scrollThumb(T, true), { l: 0, t: 4, r: 0, b: 4 });

  // --- panels, rows, cards
  add('panel-plain', plate(24, 24, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.ink, fHi: T.inkRaised, corner: 1, shadow: T.shadow }, T), I34);
  add('modal', brackets(plate(48, 48, { line: T.outline, eHi: T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: T.ink, fHi: T.inkRaised, corner: 1, shadow: T.shadow }, T), T, { mat: 'gold', rivet: 'iron', y1: 47 }), { l: 8, t: 8, r: 8, b: 8 });
  add('row', plate(24, 24, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.inkRaised, corner: 1 }, T), I3);
  add('row-hover', plate(24, 24, { line: T.outline, eHi: T.ironHi, eSh: T.iron, eMid: T.ironHi, fill: T.bubbleHi, corner: 1 }, T), I3);
  add('row-selected', plate(24, 24, { line: T.outline, eHi: T.goldHi, eSh: T.goldSh, eMid: T.gold, fill: T.inkRaised, corner: 1 }, T), I3);
  add('row-dead', plate(24, 24, { line: T.outline, eHi: T.ironSh, eSh: T.ironSh, eMid: T.ironSh, fill: T.inkSunk, corner: 1 }, T), I3);
  add('well', plate(16, 16, { line: T.outline, eHi: T.shadow, eSh: T.iron, eMid: T.ironSh, fill: T.inkSunk, corner: 1 }, T), I3);   // 12x12 icon socket
  add('avatar-well', plate(28, 28, { line: T.outline, eHi: T.shadow, eSh: T.iron, eMid: T.ironSh, fill: T.inkSunk, corner: 1 }, T), I3);   // 24x24 avatar socket
  add('tooltip', plate(16, 13, { line: T.outline, eHi: T.goldSh, eSh: T.goldSh, eMid: T.goldSh, fill: T.ink, corner: 1, shadow: T.shadow }, T), I34);
  add('tooltip-tail', (() => {   // 7x5, placed at (x, boxBottom - 2): opens the edge + line rows and continues them as a tail
    const im = new PixelImage(7, 5), P = { L: T.outline, g: T.goldSh, i: T.ink };
    ['.giiig.', 'LgiiigL', '.LgigL.', '..LgL..', '...L...'].forEach((r, j) => [...r].forEach((c, i) => { if (P[c]) im.set(i, j, P[c]); }));
    return im;
  })());
  add('tip-strip', (() => { const im = plate(16, 16, { line: T.outline, eHi: T.goldSh, eSh: T.goldLine, eMid: T.goldSh, fill: T.ink, corner: 0 }, T); im.vline(2, 2, 12, T.gold); return im; })(), { l: 4, t: 3, r: 3, b: 3 });
  add('banner-danger', plate(16, 16, { line: T.outline, eHi: D.sh, eSh: D.line, eMid: D.sh, fill: T.inkSunk, corner: 1 }, T), I3);
  add('chip', plate(16, 11, { line: T.outline, eHi: T.iron, eSh: T.ironSh, eMid: T.iron, fill: T.ink, corner: 2 }, T), I3);
  add('chip-gold', plate(16, 11, { line: T.outline, eHi: T.gold, eSh: T.goldSh, eMid: T.gold, fill: T.ink, corner: 2 }, T), I3);
  add('chip-ok', plate(16, 11, { line: T.outline, eHi: OK.sh, eSh: OK.line, eMid: OK.sh, fill: T.ink, corner: 2 }, T), I3);
  add('chip-violet', plate(16, 11, { line: T.outline, eHi: V.mid, eSh: V.sh, eMid: V.mid, fill: T.ink, corner: 2 }, T), I3);
  add('chip-dim', plate(16, 11, { line: T.outline, eHi: T.ironSh, eSh: T.ironSh, eMid: T.ironSh, fill: T.inkSunk, corner: 2 }, T), I3);
  // chat dock: unread count (v2 .ct-chat-unread: danger pill) + crier new-count (v2 .ct-chat-dot: violet pill)
  add('badge-unread', plate(16, 11, { line: D.line, eHi: D.hi, eSh: D.sh, eMid: D.mid, fill: D.mid, corner: 2 }, T), I3);
  add('badge-count', plate(16, 11, { line: V.line, eHi: V.hi, eSh: V.sh, eMid: V.mid, fill: V.sh, corner: 2 }, T), I3);
  add('kbd', plate(9, 10, { line: T.outline, eHi: T.ironHi, eSh: T.ironSh, eMid: T.iron, fill: T.inkRaised, corner: 1, shadow: T.shadow }, T), I34);

  // --- parchment pamphlet (endgame / story): rolled caps + body
  add('scroll-body', (() => { const im = new PixelImage(16, 8); im.rect(0, 0, 16, 8, T.parchment); im.vline(0, 0, 8, M.parch.line); im.vline(15, 0, 8, M.parch.line); im.vline(1, 0, 8, T.parchmentHi); im.vline(14, 0, 8, T.parchmentSh); return im; })(), { l: 3, t: 0, r: 3, b: 0 });
  const roll = (bottom) => {
    const G = grid(48, 7);
    G.rect(3, 1, 42, 5, 'a');                       // the rolled paper
    G.rect(0, 0, 3, 7, 'b'); G.rect(45, 0, 3, 7, 'b');   // iron end knobs
    if (bottom) G.rect(4, 0, 40, 1, 'a'); else G.rect(4, 6, 40, 1, 'a');
    const im = renderMask(G.rows(), { a: 'parch', b: 'iron' }, T, { pad: 0 });
    im.hline(3, bottom ? 4 : 3, 42, M.parch.line);   // the curl seam
    // the 9-slice centre (x 4..43) tiles: copy one interior column across it so no exposure-shaded end column repeats
    // as a 1-px dash every 40 texels (r1 critic z-endgame-top.png)
    for (let x = 4; x < 44; x++) for (let y = 0; y < 7; y++) im.set(x, y, im.get(24, y));
    return im;
  };
  add('scroll-top', roll(false), { l: 4, t: 0, r: 4, b: 0 });
  add('scroll-bottom', roll(true), { l: 4, t: 0, r: 4, b: 0 });
  add('divider-iron', (() => { const im = new PixelImage(4, 2); im.hline(0, 0, 4, T.ironSh); im.hline(0, 1, 4, T.ironHi); return im; })());
  add('divider-parchment', (() => { const im = new PixelImage(4, 2); im.hline(0, 0, 4, T.parchmentSh); im.hline(0, 1, 4, T.parchmentHi); return im; })());
  add('divider-orn', renderMask(['.....a.....', 'aaa.aaa.aaa', '.....a.....'], { a: 'gold' }, T));
  add('scrim', (() => { const im = new PixelImage(4, 4); im.fill(T.scrim); return im; })());

  // --- badges (lobby: You / Host / Not ready / Ready / Storyteller; seats: alive / dead; stepper NOW / NEXT; notebook SAVED)
  const B = {
    you: ['YOU', { edge: T.iron, edgeSh: T.ironSh, text: T.text }], host: ['HOST', { edge: T.goldSh, edgeSh: T.goldLine, text: T.gold }],
    notready: ['NOT READY', { edge: T.ironSh, text: T.textDim }], ready: ['READY', { edge: OK.sh, edgeSh: OK.line, text: T.ok }],
    st: ['STORYTELLER', { edge: V.mid, edgeSh: V.sh, text: T.st }], alive: ['ALIVE', { edge: OK.sh, edgeSh: OK.line, text: T.ok }],
    dead: ['DEAD', { edge: T.ironSh, fill: T.inkSunk, text: T.textDim }], now: ['NOW', { edge: T.gold, edgeSh: T.goldSh, fill: T.goldLine, text: T.goldHi }],
    next: ['NEXT', { edge: V.mid, edgeSh: V.sh, text: V.hi }], saved: ['SAVED', { edge: OK.sh, edgeSh: OK.line, text: T.ok }],
    good: ['GOOD', { edge: M.good.sh, edgeSh: M.good.line, text: T.good }], evil: ['EVIL', { edge: M.evil.sh, edgeSh: M.evil.line, text: T.evil }],
  };
  for (const [k, [t, st]] of Object.entries(B)) add(`badge-${k}`, badge(t, st, T));

  // --- spinner, cursors, glyphs, v2 icons, notebook toggles
  for (let k = 0; k < 9; k++) add(`spinner_${k}`, spinner(T, k));
  for (const n of Object.keys(CURSORS)) add(n, cursorImage(n, T));
  for (const n of Object.keys(GLYPHS)) add(`glyph_${n}`, glyphImage(n, T));
  for (const n of Object.keys(V2_ICONS)) add(n, glyphImage(n, T));
  for (const n of Object.keys(TOGGLES)) { add(`toggle_${n}`, toggleGlyph(n, T)); add(`toggle_${n}-off`, toggleGlyphOff(n, T)); }

  const nine = {};
  for (const [n, ins] of Object.entries(insets)) nine[n] = nineSlice(img[n], ins);
  const K = { T, M, img, insets, nine };
  _kits.set(T, K);
  return K;
}

// ------------------------------------------------------------------------------------------------ widgets (composed)
/** Text button (any width; h 16 = v2 size incl. shadow, or 13 = compact). state: normal|hover|pressed|disabled|selected|primary[-hover|-pressed|-disabled]|danger[-hover] */
export function button(img, K, x, y, w, label, state = 'normal', { h = 16, icon = null, font = 'body' } = {}) {
  const T = K.T;
  K.nine[state === 'normal' ? 'button' : `button-${state}`](img, x, y, w, h);
  const down = /pressed/.test(state) ? 1 : 0;
  const prim = /primary/.test(state), dis = /disabled/.test(state), dan = /danger/.test(state);
  const col = dis ? (prim ? T.goldSh : T.textDim) : prim ? T.goldHi : dan ? K.M.danger.hi : T.text;
  const ty = y + Math.floor((h - 1 - 6) / 2) + down;
  const tw = textWidth(label, font) + (icon ? 18 : 0);
  let tx = x + Math.floor((w - tw) / 2);
  if (icon) { img.blit(K.img[icon], tx, y + Math.floor((h - 1 - 16) / 2) + down); tx += 18; }
  drawText(img, tx, ty + (font === 'tiny' ? 1 : 0), label, { font, color: col });
}
export function tabs(img, K, x, y, w, labels, active, { hover = -1 } = {}) {
  const T = K.T;
  let cx = x;
  const out = [];
  for (let i = 0; i < labels.length; i++) {
    const tw = textWidth(labels[i]) + 10, on = i === active;
    if (on) K.nine['tab-active'](img, cx, y, tw, 13); else K.nine[i === hover ? 'tab-hover' : 'tab'](img, cx, y + 1, tw, 12);
    drawText(img, cx + 5, y + 4, labels[i], { color: on ? T.gold : i === hover ? T.text : T.textDim });
    out.push({ x: cx, w: tw });
    cx += tw + 1;
  }
  // strip under the inactive tabs; the active tab breaks it (its fill continues into the panel)
  for (let i = x; i < x + w; i++) {
    const a = out[active];
    if (a && i > a.x && i < a.x + a.w - 1) continue;
    img.set(i, y + 13, T.ironHi); img.set(i, y + 14, T.outline);
  }
  return out;
}
export function input(img, K, x, y, w, text, { state = 'normal', placeholder = false, caret = false, h = 13 } = {}) {
  const T = K.T;
  K.nine[state === 'normal' ? 'input' : `input-${state}`](img, x, y, w, h);
  const s = text;
  drawText(img, x + 4, y + Math.floor((h - 6) / 2) - 1 + 1, s, { color: placeholder ? T.textDim : state === 'disabled' ? T.textDim : T.text });
  // 1 empty texel between the last glyph and the caret (r1: 'Ad|' merged with d / l)
  if (caret) img.vline(x + 4 + (placeholder ? 0 : textWidth(s) + 2), y + 3, h - 6, T.text);
}
export function select(img, K, x, y, w, text, { h = 13 } = {}) {
  K.nine.select(img, x, y, w, h);
  drawText(img, x + 4, y + Math.floor((h - 6) / 2), text, { color: K.T.text });
  img.blit(K.img['select-chevron'], x + w - 9, y + Math.floor(h / 2) - 1);
}
export function slider(img, K, x, y, w, v, { knob = '' } = {}) {
  const fx = Math.round((w - 7) * v);
  K.nine['slider-track'](img, x, y + 3, w, 5);
  if (fx > 1) K.nine['slider-fill'](img, x, y + 3, fx + 3, 5);
  img.blit(K.img[`slider-knob${knob ? '-' + knob : ''}`], x + fx, y);
}
/** Labelled row with an icon well. */
export function rowFrame(img, K, x, y, w, h = 24, state = 'normal') { K.nine[state === 'normal' ? 'row' : `row-${state}`](img, x, y, w, h); }
export function divider(img, K, x, y, w, kind = 'iron') {
  if (kind === 'v2') { K.nine.divider(img, x, y, w, 8); return; }
  for (let i = 0; i < w; i++) { img.set(x + i, y, kind === 'parchment' ? K.T.parchmentSh : K.T.ironSh); img.set(x + i, y + 1, kind === 'parchment' ? K.T.parchmentHi : K.T.ironHi); }
}
/** Panel title: the hud DISPLAY face (cap 9, small caps; y = cap top), gold with a 1-px shadow on ink (none on parchment). */
export function title(img, K, x, y, s, { color = null, shadow = true, align = 'left' } = {}) {
  return drawText(img, x, y, s, { font: DISPLAY, color: color || K.T.gold, shadow: shadow ? K.T.shadow : undefined, align });
}
/** Count pill (chat unread = danger, crier = violet): LABEL digits, '99+' cap. Returns its width. */
export function countPill(img, K, x, y, n, kind = 'unread') {
  const s = n > 99 ? '99+' : String(n), w = Math.max(11, textWidth(s, LABEL) + 6);
  K.nine[`badge-${kind}`](img, x, y, w, 11);
  drawText(img, x + Math.floor((w - textWidth(s, LABEL)) / 2), y + 3, s, { font: LABEL, color: K.T.parchmentHi });
  return w;
}
