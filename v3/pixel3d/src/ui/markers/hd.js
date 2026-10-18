// Markers at UI DENSITY D=2 (owner: markers group; docs/UI.md §2.10 "Density", wave 1). Every markers frame redrawn at
// twice the detail on the same on-screen footprint: sizes and anchors are exactly 2x the 1x frames (art.js / v2size.js),
// so a 1x layout carries over unchanged. Pure JS, deterministic, token colours only (kit tokens + PIN_ART / ramps).
//
//   import { markerFramesHD, attachMarkersHD, drawPointHD, putGroundHD } from './hd.js';
//   const FH = markerFramesHD(T, 'new' | 'v2')   // Map name -> HD PixelImage (same names as markerFrames), FH.anchors /
//                                                // FH.point (2x the 1x geometry)
//   attachMarkersHD(F, T, 'new' | 'v2')          // withHD(frame, hdFrame) on every frame of a 1x set: anything that
//                                                // blits those frames through a density view (L.hd.worldView) draws HD
//   drawPointHD(L, FH, {head, aim, spot, spotP, person, age, still})   the point emote on L.hd.world + the HD ground ping
//   putGroundHD(L.hd, img, x, y, p)              a ground decal on the depth tier (hidden under characters like L.ground)
//
// Language at D=2 (docs/UI.md §2.10): 1 HD px = half a scene texel. Lines are 1 HD px in the material's own line tone
// (the finger: a 2-HD-px line = the 1x weight, so it holds on noon cobbles), shading lit from the upper left with a
// 1-px hi edge and a 2-px form-shadow band, binary alpha, no rotation (8 directions = exact pixel permutations of two
// hand-drawn grids, shaded AFTER the permutation so the light never turns with the hand).
import { PixelImage, withHD, frameAt, dissolve, ramp, annulus } from '../kit.js';
import { POINT, POINT_DIRS, POINT_VEC, ANCHORS, FPS, palette, fistCentre, rotCW, flipGridX } from './art.js';
import { POINT_V2, ANCHORS_V2 } from './v2size.js';
import { TIMING, nearestDir, pointEnvelope } from './draw.js';

const D = 2;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** HD anchors: 2x the 1x anchors (art.js ANCHORS; the v2-size finger: v2size.js ANCHORS_V2). */
export const ANCHORS_MHD = Object.fromEntries(Object.entries(ANCHORS).map(([k, a]) => [k, { x: a.x * D, y: a.y * D }]));
export const ANCHORS_MHD_V2 = { ...ANCHORS_MHD, point: { x: ANCHORS_V2.point.x * D, y: ANCHORS_V2.point.y * D } };
/** HD point geometry: frame size x2; offset stays in TEXELS (drawPointHD multiplies by L.hd.k). */
export const POINT_HD = { ...POINT, size: POINT.size * D };
export const POINT_HD_V2 = { ...POINT_V2, size: POINT_V2.size * D };

// ------------------------------------------------------------------------------------------------ the HD painter
/**
 * Paint a char grid at HD: lit from the upper left (1-px hi edge where up/left is open), a 2-px form-shadow band where
 * down/right is open (sh), mid elsewhere; flat materials keep one colour; then lineW rings (4-neighbour) of the line of
 * the material they border (alias maps flat details to their host material's line). Optional cream rim on the
 * convex upper-left corners (rim: colour).
 */
export function paintGridHD(img, g, ox, oy, mats, alias = {}, { lineW = 1, rim = null } = {}) {
  const H = g.length, W = g[0].length;
  const at = (x, y) => (g[y]?.[x] ?? '.');
  const solid = (x, y) => at(x, y) !== '.';
  const run = (x, y, dx, dy) => { let n = 0; while (solid(x + dx * (n + 1), y + dy * (n + 1)) && n < 4) n++; return n + 1; };   // 1 = edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = at(x, y);
    if (ch === '.') continue;
    const m = mats[ch];
    if (m.flat) { img.set(ox + x, oy + y, m.flat); continue; }
    const ul = Math.min(run(x, y, 0, -1), run(x, y, -1, 0)), dr = Math.min(run(x, y, 0, 1), run(x, y, 1, 0));
    let c = m.mid;
    if (ul === 1 && dr > 1) c = m.hi;
    else if (dr <= 2 && ul > 1) c = m.sh;
    else if (dr === 1) c = m.sh;
    if (rim && ul === 1 && !solid(x, y - 1) && !solid(x - 1, y) && m.rim !== false) c = rim;
    img.set(ox + x, oy + y, c);
  }
  // line rings: ring 1 borders the grid; ring k borders ring k-1 (same colour as the pixel it grows from)
  let src = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid(x, y)) src.set(`${x},${y}`, mats[alias[at(x, y)] ?? at(x, y)].line);
  const owned = new Set(src.keys());
  for (let r = 0; r < lineW; r++) {
    const next = new Map();
    for (const [k, c] of src) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of N4) {
        const kk = `${x + dx},${y + dy}`;
        if (owned.has(kk) || next.has(kk)) continue;
        next.set(kk, c);
      }
    }
    for (const [k, c] of next) { const [x, y] = k.split(',').map(Number); img.set(ox + x, oy + y, c); owned.add(k); }
    src = next;
  }
  return img;
}
/**
 * Scale2x (EPX) of a char grid + D=2 detail rules: creases ('k') thinned to 1-px lines (the lower row of each 2-px
 * block), a 1-px seam ('C') where the cuff meets the glove. Used for the v2-size finger (its own 1x grids); the 'new'
 * finger has fully hand-drawn HD grids (RIGHT_HD / UPRIGHT_HD).
 */
export function refine2x(g) {
  const W = g[0].length, H = g.length, at = (x, y) => g[y]?.[x] ?? '.';
  const o = Array.from({ length: H * 2 }, () => Array(W * 2).fill('.'));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), Dn = at(x, y + 1);
    o[2 * y][2 * x] = C === A && C !== Dn && A !== B ? A : P;
    o[2 * y][2 * x + 1] = A === B && A !== C && B !== Dn ? B : P;
    o[2 * y + 1][2 * x] = Dn === C && Dn !== B && C !== A ? C : P;
    o[2 * y + 1][2 * x + 1] = B === Dn && B !== A && Dn !== C ? Dn : P;
  }
  // thin the creases to 1-px lines (the lower row of each 2-px block)
  for (let y = 0; y < o.length - 1; y++) for (let x = 0; x < o[0].length; x++) if (o[y][x] === 'k' && o[y + 1][x] === 'k') o[y][x] = 'g';
  for (let y = 0; y < o.length; y++) for (let x = 0; x < o[0].length; x++) {
    if (o[y][x] !== 'c') continue;
    if (N4.some(([dx, dy]) => o[y + dy]?.[x + dx] === 'g')) o[y][x] = 'C';
  }
  return o.map((r) => r.join(''));
}

// ------------------------------------------------------------------------------------------------ pointing finger
// Hand-drawn D=2 grids of the 'new' finger (art.js RIGHT 13x9 -> 26x18, UPRIGHT 12x12 -> 24x24): the same glove, now
// with a thumb lying along the index finger (its underside crease), a rounded fingertip with a knuckle crease, three
// curled fingers separated by 1-px creases that end in notches at the silhouette, and a gold cuff with a seam ('C').
// 'g' glove, 'c' cuff, 'C' cuff seam, 'k' crease.
const RIGHT_HD = [
  '.......gggggg.............',
  '.....gggggggggg...........',
  '.ccC.ggggggggggg..........',
  'cccCgggggggkkkkgg.........',
  'cccCgggggggggggggggggggg..',
  'cccCgggggggggggggggggggggg',
  'cccCgggggggggggggggggggggg',
  'cccCgggggggggggggggkggg...',
  'cccCgggggggggkkkkkkkk.....',
  'cccCgggggggggggggggggg....',
  'cccCgggggggggggggggggg....',
  'cccCgggggggggkkkkkkkk.....',
  'cccCgggggggggggggggggg....',
  'cccCgggggggggggggggggg....',
  'cccCgggggggggkkkkkkk......',
  'cccCgggggggggggggggg......',
  '.ccCggggggggggggggg.......',
  '.....ggggggggggg..........',
];
// up-right: the index finger as an exact 45-degree band 5 px across (clean 1-px steps), a rounded tip, a joint crease;
// the curled fingers step down-left along the shaded side, each cut by a crease tick at the silhouette; the cuff a
// diagonal band toward the lower left with its seam.
const UPRIGHT_HD = [
  '.....................gg.',
  '...................ggggg',
  '..................gggggg',
  '.................gggggg.',
  '................gggggg..',
  '...............gggkgg...',
  '..............gggggk....',
  '.............gggggg.....',
  '......gggggggggggg......',
  '....gggggkkkkggggg......',
  '...ggggggggggggggggg....',
  '..Cgggggggggggggggggg...',
  '.cCggggggggggggkkkkkk...',
  'ccCgggggggggggggggg.....',
  'ccCgggggggggggggggg.....',
  'ccCgggggggggggkkkkkk....',
  '.cCCgggggggggggggggg....',
  '..cCggggggggggggggg.....',
  '...cCgggggggggkkkkk.....',
  '....cCCggggggggggg......',
  '.....ccCCgggggggg.......',
  '......cccCCgggg.........',
  '.......cccc.............',
  '........................',
];
for (const [n, g] of [['RIGHT_HD', RIGHT_HD], ['UPRIGHT_HD', UPRIGHT_HD]]) {
  const bad = g.findIndex((r) => r.length !== g[0].length);
  if (bad >= 0) throw new Error(`markers hd: ${n} row ${bad} is ${g[bad].length} wide (row 0: ${g[0].length})`);
}
function handGridHD(dir, variant) {
  const R = variant === 'v2' ? refine2x(V2G.right) : RIGHT_HD, U = variant === 'v2' ? refine2x(V2G.upright) : UPRIGHT_HD;
  switch (dir) {
    case 'right': return R;
    case 'left': return flipGridX(R);
    case 'down': return rotCW(R);
    case 'up': return rotCW(rotCW(rotCW(R)));
    case 'up-right': return U;
    case 'up-left': return flipGridX(U);
    case 'down-right': return rotCW(U);
    case 'down-left': return flipGridX(rotCW(U));
  }
  throw new Error(`markers hd: unknown point dir ${dir}`);
}
// the v2-size finger's 1x grids (v2size.js keeps them private: copied verbatim, then refine2x)
const V2G = {
  right: [
    '....ggggg.........', '...gggggggg.......', 'cccggggggggggggggg', 'cccggggggggggggggg', 'cccggggggggkkkk...', 'cccgggggggggggg...',
    'cccggggggggkkkk...', 'cccgggggggggggg...', 'cccgggggggkkkk....', 'cccgggggggggggg...', '...ggggggggggg....'],
  upright: [
    '............gg', '...........ggg', '..........ggg.', '.........ggg..', '....ggggggg...', '...gggggggggg.', '..ggggggggkk..',
    '.cgggggggggg..', 'ccgggggggkk...', 'cgggggggggg...', 'ccggggggkk....', '.ccggggggg....', '..ccgggkk.....', '...cccgg......'],
};
/** Glove / cuff materials of a palette (art.js palette(T)) at D=2: crease one step under the shade band. */
function gloveMats(P) {
  const glove = P.glove, crease = ramp(P.T.parchment, { dark: 0.3 }).sh;
  return { g: glove, c: { ...P.gold, rim: false }, C: { flat: P.gold.sh, line: P.gold.line }, k: { flat: crease, line: glove.line } };
}
/**
 * point_<dir>_<f> at D=2: 40x40 ('new', anchor 20,20) or 48x48 ('v2', anchor 24,24); fist centre on the anchor, jab
 * 0/1/2 texels (x 1.2 as the 1x frames, 'v2' 0/1.2/2.6) = 2x in HD px; a 2-px own-family line.
 */
export function drawHandHD(dir, f, P, variant = 'new') {
  const g = handGridHD(dir, variant), [fx, fy] = fistCentre(g), [vx, vy] = POINT_VEC[dir];
  const S = (variant === 'v2' ? POINT_V2.size : POINT.size) * D, A = variant === 'v2' ? ANCHORS_MHD_V2.point : ANCHORS_MHD.point;
  const j = (variant === 'v2' ? [0, 1.2, 2.6][f] : [0, 1, 2][f] * 1.2) * D;
  const gw = g[0].length, gh = g.length, LW = 2;
  const ox = Math.max(LW, Math.min(S - LW - gw, Math.round(A.x - fx + vx * j)));
  const oy = Math.max(LW, Math.min(S - LW - gh, Math.round(A.y - fy + vy * j)));
  const img = new PixelImage(S, S);
  paintGridHD(img, g, ox, oy, gloveMats(P), { k: 'g', C: 'c' }, { lineW: LW, rim: P.rim });
  if (f === 2) {
    // speed ticks behind the fist on the jab frame: 3 thin 1-px dashes (glove shadow tone, no line: they are air)
    const px = -vy, py = vx, back = variant === 'v2' ? 21 : 17, spread = variant === 'v2' ? 8 : 7, len = variant === 'v2' ? 5 : 4;
    for (const s of [-1, 0, 1]) {
      const bx = A.x - vx * (back + (s === 0 ? 3 : 0)) + px * s * spread, by = A.y - vy * (back + (s === 0 ? 3 : 0)) + py * s * spread;
      for (let d = 0; d < len - (s === 0 ? 1 : 0); d++) {
        const x = Math.round(bx - vx * d), y = Math.round(by - vy * d);
        if (!img.alpha(x, y)) img.set(x, y, P.glove.sh);
      }
    }
  }
  return img;
}

// ------------------------------------------------------------------------------------------------ trail, ping, mark
/** trail_0 / trail_1 at D=2: 6x6 (anchor 2,2): a round bead (trail_0 bright with a cream glint, trail_1 dim). */
export function drawTrailDotHD(k, P) {
  // a round bead: a 4x4 octagon core (lit upper-left) in a 1-px goldLine octagon ring
  const rows = k === 0 ? ['..LL..', '.LrhL.', 'LhhmmL', 'LhmmsL', '.LmsL.', '..LL..'] : ['..LL..', '.LmmL.', 'LmmssL', 'LmsssL', '.LssL.', '..LL..'];
  const G = P.gold, C = { L: G.line, r: P.rim, h: G.hi, m: G.mid, s: G.sh }, img = new PixelImage(6, 6);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') img.set(x, y, C[ch]); }));
  return img;
}
/** ping_<f> at D=2: 56x28 (anchor 28,14): the base ring 3 px across at the sides (lit far-left arc, goldLine outside),
 *  the wave rings growing out of it, the last one dissolving in a 1-px checker; f0 = a lit centre dot. */
export function drawPingHD(f, P) {
  const W = 56, H = 28, img = new PixelImage(W, H), G = P.gold, cx = 28, cy = 14;
  const ring = (rx, ry, tx, ty, col) => {
    const t = new PixelImage(W, H);
    annulus(t, cx, cy, rx, ry, '#ffffff', { tx, ty });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (t.alpha(x, y)) { const c = col(x, y); if (c) img.set(x, y, c); }
    return t;
  };
  const lineOut = (t, rx, ry) => {
    const ins = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
    const hits = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (!t.alpha(x, y) && !img.alpha(x, y) && !ins(x, y) && N4.some(([dx, dy]) => t.alpha(x + dx, y + dy))) hits.push(x, y);
    for (let i = 0; i < hits.length; i += 2) img.set(hits[i], hits[i + 1], G.line);
  };
  if (f === 1) { const t = ring(18, 9, 2, 1, (x, y) => (y < cy ? G.hi : G.mid)); lineOut(t, 18, 9); }
  if (f === 2) { const t = ring(24, 12, 2, 1, (x, y) => (y < cy ? G.mid : G.sh)); lineOut(t, 24, 12); }
  if (f === 3) ring(26, 13, 1, 0.6, (x, y) => (((x + y) % 3) === 0 ? G.sh : null));
  // the steady base ring on top: 3 px at the sides, ~1.5 at the poles; hi on the far-left arc, a lighter inner rim
  const base = ring(12, 6, 3, 1.5, (x, y) => {
    const far = y + 0.5 < cy, left = x + 0.5 < cx, inner = ((x + 0.5 - cx) / 10.5) ** 2 + ((y + 0.5 - cy) / 5) ** 2 <= 1.12;
    return far && left ? (inner ? G.mid : G.hi) : far ? G.mid : inner ? G.mid : G.sh;
  });
  lineOut(base, 12, 6);
  if (f === 0) {
    img.rect(cx - 3, cy - 1, 6, 3, G.mid); img.rect(cx - 2, cy - 2, 4, 1, G.hi); img.rect(cx - 2, cy + 2, 4, 1, G.sh);
    img.set(cx - 2, cy - 1, P.rim);
    for (const [x, y] of [[cx - 4, cy - 1], [cx - 4, cy], [cx - 4, cy + 1], [cx + 3, cy - 1], [cx + 3, cy], [cx + 3, cy + 1], [cx - 3, cy - 2], [cx + 2, cy - 2], [cx - 3, cy + 2], [cx + 2, cy + 2], [cx - 2, cy - 3], [cx - 1, cy - 3], [cx, cy - 3], [cx + 1, cy - 3], [cx - 2, cy + 3], [cx - 1, cy + 3], [cx, cy + 3], [cx + 1, cy + 3]])
      if (!img.alpha(x, y)) img.set(x, y, G.line);
  }
  return img;
}
/** ping_mark at D=2: 18x12 chevron (anchor 8,10): a stepped gold chevron with a centre ridge, lit upper-left, 1-px line. */
export function drawPingMarkHD(P) {
  const g = [
    '..............',
    'gggggggggggggg',
    '.gggggggggggg.',
    '..gggggggggg..',
    '...gggggggg...',
    '....gggggg....',
    '.....gggg.....',
    '......gg......',
  ];
  const img = new PixelImage(18, 12);
  paintGridHD(img, g.slice(1), 2, 2, { g: P.gold }, {}, { lineW: 1, rim: P.rim });
  return img;
}

// ------------------------------------------------------------------------------------------------ pins: shadow, drop, badge
/** pin_shadow at D=2: 24x10 (anchor 12,4): a cool contact ellipse with a darker core under the tip (2 tones, binary). */
export function drawPinShadowHD(P) {
  const img = new PixelImage(24, 10);
  img.ellipse(12, 5, 12, 5, P.shadow.mid);
  img.ellipse(11.5, 5, 6, 2, P.shadow.core);
  return img;
}
/**
 * pin_drop_<f> at D=2: 52x32 (anchor 26,24), 4 frames once at 15 fps. Gold sparks with 1-px rays (a real 4-point
 * twinkle: a 2x2 core, long thin arms tapering hi -> mid -> sh) in a 1-px goldLine; parchment dust ring + puffs.
 */
export function drawPinDropHD(f, P) {
  const W = 52, H = 32, img = new PixelImage(W, H), G = P.gold, Du = P.dust, ax = 26, ay = 24;
  const dust = new PixelImage(W, H);
  if (f === 0) annulus(dust, ax, ay + 1, 9, 3, Du.mid, { tx: 1.6, ty: 1 });
  if (f === 1) annulus(dust, ax, ay + 1, 15, 5, Du.mid, { tx: 1.4, ty: 0.9, keep: (x, y) => ((x >> 1) + (y >> 0)) % 2 === 0 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dust.alpha(x, y)) img.set(x, y, y + 0.5 > ay + 1 ? Du.sh : Du.mid);
  const dd = [10, 17, 21, 23][f];
  for (const s of [-1, 1]) {
    const x = ax + s * dd - (s < 0 ? 1 : 0);
    if (f === 1) { img.rect(x - (s < 0 ? 1 : 0), ay - 2, 2, 2, Du.mid); img.set(x + s * 2, ay - 2, Du.sh); img.set(x + s, ay - 3, Du.hi); }
    else if (f === 2) { img.rect(x - (s < 0 ? 1 : 0), ay - 3, 2, 2, Du.mid); img.set(x + s * 2, ay - 4, Du.sh); }
    else if (f === 3) { img.set(x, ay - 4, Du.sh); img.set(x + s, ay - 5, Du.sh); }
  }
  const sp = new PixelImage(W, H);
  /** a 4-point twinkle centred on (x, y): hi core + its 4 neighbours, 1-px arms to length a (hi -> mid -> sh, the
   *  upper/left arms lit), short diagonal glints when big */
  const star = (x, y, a, big) => {
    sp.set(x, y, G.hi);
    for (let k = 1; k <= a; k++) {
      const c = k === 1 ? G.hi : k < a ? G.mid : G.sh, cs = k === 1 ? G.mid : k < a ? G.sh : G.sh;
      sp.set(x - k, y, c); sp.set(x, y - k, c); sp.set(x + k, y, cs); sp.set(x, y + k, cs);
    }
    if (big) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sp.set(x + dx, y + dy, dx + dy < 0 ? G.mid : G.sh);
  };
  const dot = (x, y, c) => { sp.set(x, y, c); };
  if (f === 0) { star(ax, ay - 8, 5, true); sp.set(ax, ay - 8, P.rim); }
  else {
    const r = [0, 14, 18, 20][f];
    [-150, -112, -68, -30].forEach((deg, k) => {
      const a = (deg * Math.PI) / 180;
      const x = Math.round(ax - 1 + Math.cos(a) * r * 1.15), y = Math.round(ay - 8 + Math.sin(a) * r * 0.8);
      if (f === 1) star(x, y, k % 3 === 0 ? 3 : 2, false);
      else if (f === 2) { if (k % 3 === 0) star(x, y, 2, false); else { sp.rect(x, y, 2, 2, G.mid); sp.set(x, y, G.hi); } }
      else if (k % 3 === 0) { sp.rect(x, y, 2, 2, G.sh); sp.set(x, y, G.mid); } else dot(x, y + 1, G.sh);
    });
    if (f === 1) { sp.rect(ax - 2, ay + 1, 2, 1, P.rim); sp.rect(ax, ay + 1, 2, 1, G.hi); sp.set(ax - 3, ay + 2, G.mid); sp.set(ax + 2, ay + 2, G.mid); }
  }
  sp.outline(G.line);
  img.blit(sp, 0, 0);
  return img;
}
/** pin_remove at D=2: 18x18 (anchor 8,8): a lit danger disc (hi crescent upper-left, sh lower-right, 1-px line) with a
 *  cream X of 2-px strokes and clean 1-px-step diagonals, its arms ending 3 px inside the disc. */
export function drawRemoveBadgeHD(P) {
  const S = 18, img = new PixelImage(S, S), Dg = P.danger, c = 9;
  const inD = (x, y) => (x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 <= 8.7 * 8.7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inD(x, y)) continue;
    if (!inD(x - 1, y) || !inD(x + 1, y) || !inD(x, y - 1) || !inD(x, y + 1)) { img.set(x, y, Dg.line); continue; }
    const v = -((x + 0.5 - c) * 0.62 + (y + 0.5 - c) * 0.78), r = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    img.set(x, y, v > 4.6 && r > 5.2 ? Dg.hi : v < -4.2 && r > 5.2 ? Dg.sh : Dg.mid);
  }
  for (let k = 0; k < 8; k++) {
    // X strokes 2 px wide (k, k) + (k + 1, k); the shadow pixel under each lower-right step (a 1-px emboss)
    for (const [x, y] of [[5 + k, 5 + k], [6 + k, 5 + k], [12 - k, 5 + k], [11 - k, 5 + k]]) if (x >= 5 && x <= 12) img.set(x, y, P.rim);
  }
  for (let k = 0; k < 7; k++) { if (!isRim(img, 5 + k, 6 + k, P)) img.set(5 + k, 6 + k, Dg.sh); if (!isRim(img, 12 - k, 6 + k, P)) img.set(12 - k, 6 + k, Dg.sh); }
  return img;
}
const isRim = (img, x, y, P) => { const v = img.get(x, y), r = P._rimRGB ??= hexRGB(P.rim); return v[3] && v[0] === r[0] && v[1] === r[1] && v[2] === r[2]; };
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ------------------------------------------------------------------------------------------------ the HD frame set
/** Every markers frame at D=2, same names and order as art.js buildFrames (the pins themselves: src/ui/hd/art.js pinHD). */
export function buildFramesHD(T, variant = 'new') {
  const P = palette(T), out = [];
  out.push(['pin_shadow', drawPinShadowHD(P)]);
  for (let f = 0; f < 4; f++) out.push([`pin_drop_${f}`, drawPinDropHD(f, P)]);
  for (const d of POINT_DIRS) for (let f = 0; f < 3; f++) out.push([`point_${d}_${f}`, drawHandHD(d, f, P, variant)]);
  for (let f = 0; f < 4; f++) out.push([`ping_${f}`, drawPingHD(f, P)]);
  out.push(['pin_remove', drawRemoveBadgeHD(P)]);
  out.push(['trail_0', drawTrailDotHD(0, P)], ['trail_1', drawTrailDotHD(1, P)]);
  out.push(['ping_mark', drawPingMarkHD(P)]);
  return out;
}
const _hd = new Map();
/** Cached Map name -> HD PixelImage for a token set + finger variant ('new' | 'v2'); .anchors / .point / .density. */
export function markerFramesHD(T, variant = 'new') {
  const key = `${variant}|${T.gold}|${T.parchment}|${T.ink}`;
  let m = _hd.get(key);
  if (!m) {
    m = new Map(buildFramesHD(T, variant));
    m.anchors = variant === 'v2' ? ANCHORS_MHD_V2 : ANCHORS_MHD; m.point = variant === 'v2' ? POINT_HD_V2 : POINT_HD; m.density = D; m.pointerScale = variant;
    _hd.set(key, m);
  }
  return m;
}
/**
 * Attach the HD frames to a 1x frame set (markerFrames(T) or markerFramesV2size(T); idempotent): every frame with an
 * HD twin gets `.hd`, so draw.js put() / any img.blit(frame) THROUGH A DENSITY VIEW draws the HD art at the same
 * anchor (HD anchors are exactly 2x). Direct 1x callers never read `.hd` (byte-identical). Returns F.
 * Limit: the dissolve path of put() clones the frame (the clone has no .hd: blocks for those 3 grid frames).
 */
export function attachMarkersHD(F, T, variant = F.pointerScale === 'v2' ? 'v2' : 'new') {
  if (F._hdKey === variant + T.gold) return F;
  const H = markerFramesHD(T, variant);
  for (const [n, im] of F) if (H.has(n)) withHD(im, H.get(n));
  F._hdKey = variant + T.gold;
  return F;
}

// ------------------------------------------------------------------------------------------------ runtime (L.hd)
const _rows = new WeakMap();
/**
 * A ground decal (ping, you-ring) on the HD depth tier, hidden under characters and props like L.ground: each HD row
 * gets the view depth of the ground at that row (two depthOf samples of the decal's world point p: flat-ground
 * linear), so the ground passes the depth test and anything standing nearer hides the decal. H = L.hd (useDepth()).
 * (x, y) = HD world px of the image's top-left; anchorRow = the image row that sits on p (default: the centre row).
 */
export function putGroundHD(H, img, x, y, p, { anchorRow = img.h >> 1, k = 0 } = {}) {
  let rows = _rows.get(img);
  if (!rows) {
    rows = [];
    for (let j = 0; j < img.h; j++) {
      const r = img.crop(0, j, img.w, 1);
      rows.push(r.bbox() ? r : null);
    }
    _rows.set(img, rows);
  }
  const d0 = H.depthOf(p), q0 = H.at(p);
  // depth per HD row on flat ground, any camera yaw: depth, row and column are linear in the ground (x, z); two 2-m
  // samples (+x, -z) give the ground step that moves one HD row down the SAME column, and its depth change
  const a = p.clone(), b = p.clone(); a.x += 2; b.z -= 2;
  const qa = H.at(a), qb = H.at(b), da = H.depthOf(a) - d0, db = H.depthOf(b) - d0;
  const ra = qa.y - q0.y, rb = qb.y - q0.y, ca = qa.x - q0.x, cb = qb.x - q0.x, det = ra * cb - rb * ca;
  const dRow = Math.abs(det) > 1e-6 ? (cb * da - ca * db) / det : 0;
  for (let j = 0; j < rows.length; j++) {
    if (!rows[j]) continue;
    H.putDepth(rows[j], x, y + j, d0 + (j - anchorRow) * dRow, k);
  }
}
/**
 * The point emote at D=2 (markers drawPoint on the HD tiers; same timing, directions, trail and ping rules).
 * head / aim = HD world px (L.hd.at(worldPoint)) of the emoter head and the aim point, spot = HD world px of the ping,
 * spotP = its world point (ground depth for the HD ping; null = no ping). Phases as draw.js: L.phase 'trail' draws the
 * marching trail (call it under the labels), 'main' the finger + ping + place chevron; no phase = everything.
 * FH = markerFramesHD(T, variant). Offsets (point.offset, trail gap) are in texels x L.hd.k.
 */
export function drawPointHD(L, FH, { head, aim, spot, spotP = null, person = true, age, still = false }) {
  const e = pointEnvelope(age, still), H = L.hd;
  if (!e || L.phase === 'pins' || !H) return null;
  const k = H.k, A = FH.anchors, Pt = FH.point;
  const dir = nearestDir(aim.x - head.x, aim.y - head.y), [vx, vy] = POINT_VEC[dir];
  const off = (Pt.offset - (e.pop ? 3 : 0)) * k;
  const hx = Math.round(head.x + vx * off), hy = Math.round(head.y + vy * off);
  const main = L.phase === undefined || L.phase === 'main', trail = L.phase === undefined || L.phase === 'trail';
  const put = (name, x, y, akey, kk = e.dis) => {
    let src = FH.get(name);
    const a = A[akey], dx = Math.round(x) - a.x, dy = Math.round(y) - a.y;
    if (kk > 0) { src = src.clone(); dissolve(src, kk, dx, dy); }
    putWorld(H.world, src, dx, dy);
  };
  if (main && spotP) {
    const pf = e.pop ? 0 : still ? 1 : frameAt(age, FPS.ping, 4), src = FH.get(`ping_${pf}`), a = A.ping;
    putGroundHD(H, src, spot.x - a.x, spot.y - a.y, spotP, { anchorRow: a.y, k: e.dis });
  }
  if (main && !person) put('ping_mark', spot.x, spot.y - (4 + (still ? 0 : frameAt(age, 2, 2))) * k, 'ping_mark');
  const tx = hx + vx * (Pt.size / 2), ty = hy + vy * (Pt.size / 2);
  const ddx = aim.x - tx, ddy = aim.y - ty, dist = Math.hypot(ddx, ddy), gap = TIMING.TRAIL_GAP * k;
  if (trail && !e.pop && dist > gap * 2) {
    const ux = ddx / dist, uy = ddy / dist, end = dist - 6 * k;
    // the march: 1 TEXEL per 7.5 fps step (= the 1x speed on screen), dots every TRAIL_GAP texels
    const phase = (still ? 0 : frameAt(age, 7.5, TIMING.TRAIL_GAP)) * k;
    for (let d = 3 * k + phase; d < end; d += gap) put(d < 3 * k + gap - k ? 'trail_1' : 'trail_0', tx + ux * d, ty + uy * d, 'trail');
  }
  const f = still ? 0 : frameAt(age, FPS.point, 3, { seq: Pt.sequence });
  if (main) put(`point_${dir}_${f}`, hx, hy, 'point');
  return { dir, f, hand: { x: hx, y: hy } };
}
/** Copy a sprite into an HD layer image (opaque replaces) and mark its band (= hd/draw.js fastBlit, no import cycle). */
function putWorld(dst, src, x, y) {
  x |= 0; y |= 0;
  const W = dst.w, Hh = dst.h, sw = src.w, sd = src.data, dd = dst.data;
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + sw), y1 = Math.min(Hh, y + src.h);
  if (x1 <= x0 || y1 <= y0) return;
  for (let yy = y0; yy < y1; yy++) {
    let si = ((yy - y) * sw + (x0 - x)) * 4, di = (yy * W + x0) * 4;
    for (let xx = x0; xx < x1; xx++, si += 4, di += 4) {
      if (!sd[si + 3]) continue;
      dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = sd[si + 3];
    }
  }
  dst.mark?.(x0, y0, x1 - 1, y1 - 1);
}
export { POINT_DIRS };
