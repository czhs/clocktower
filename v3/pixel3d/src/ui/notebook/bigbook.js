// Notebook variant "bookStyle: 'big'" (owner: notebook group; docs/UI.md §6 variants): instead of the small book at the
// reader's hands, a BIG book unfolds in front of the reader, presented like the pointing finger: a world-anchored
// marker sprite (tier A, L.world, z 18: over the scene, under name labels / bubbles (20) and the finger (30)), about the
// v2-size finger's size (25 x 15 texels open, finger 20 x 13), so "Bram is reading" reads from across the square.
//
//   frames  bookbig_<phase>_<f> (+ ghost family bookbigghost_<phase>_<f>), cell 30x22, anchor (13, 17) = the bottom of
//           the cover under the gutter (the spine stays put while the book flips open):
//     open_0..4   pop, closed (cover to the viewer, gold diamond), cover standing up (right page shows), cover falling
//                 left (endpaper shows), the full spread                                       15 fps (2 grid frames)
//     hold_0..3   spread, right page corner lifts, a page stands up mid-turn, it lands (left corner lifted)
//                 10 fps, BIG_HOLD_SEQ (open 2.4 s, then the page turn), seeded per reader
//     close_0..2  cover standing up, closed, pop                                              15 fps
//     write_0..3  spread + quill writing a line on the right page (the ink grows 1 texel per drawing)  10 fps
//   Facing-independent (one view): the big book is a status marker for OTHER viewers, not a held prop. It always sits
//   on the camera side of its reader (never hidden by the body, the same spot for every facing, like the finger that
//   is drawn at head + vector whatever the body does). 8 facings at 25 texels would make the book change shape every
//   time a reader turns and read worse from across the square; the held style keeps the 8 views.
//   Placement: anchor = feet (screen) + PLACE_BIG.dy (just in front of the feet), ghosts + their 0.2 m hover. The book
//   covers the legs and belly; the face, the name label and anything stacked above stay clear.
// Materials, shading and outlines = the held book (art.js bookMats / renderBookMask): leather goldSh family, parchment
// pages (one step dimmer at night), red ribbon, gold emblem, cream quill with a gold shaft; ghost family for the dead.
import { PixelImage, GRID_HZ } from '../kit.js';
import { bookMats, renderBookMask, erodeMask } from './art.js';
import { grid } from '../panels/art.js';

export const BIG_CELL = { w: 30, h: 22 };
export const BIG_ANCHOR = { x: 13, y: 17 };
export const BIG_PHASES = { open: 5, hold: 4, close: 3, write: 4 };
export const BIG_FPS = { open: 15, hold: 10, close: 15, write: 10 };
export const BIG_TIMING = { OPEN_FRAMES: 10, CLOSE_FRAMES: 6, HOLD_LOOP_S: 3.0 };
/** Hold drawing per 10 fps step: spread 2.4 s, corner lifts, page stands (2 steps), lands, spread. */
export const BIG_HOLD_SEQ = [...Array(24).fill(0), 1, 2, 2, 3, 0, 0];
export const PLACE_BIG = {
  dy: 1,              // anchor row = feet row + dy (the book stands just in front of the feet, on the camera side)
  ghostLift: 0.2,     // m (cast ghost clips hover ~0.2 m)
  z: 18,              // L.world draw order: over the scene, under labels / bubbles (20) and the finger (30)
};

const MW = 25, MH = 19, GX = 12, Y0 = 4;
// spread profile per distance d from the gutter (1..10): page top / bottom rows (the pages curve up from the gutter)
const TOP = [0, 6, 5, 4, 4, 4, 4, 4, 4, 4, 5];
const BOT = [0, 14, 14, 13, 13, 13, 12, 12, 12, 12, 12];
const INK_ROWS = [6, 8, 10];
const INK_LEN = { 6: 9, 8: 8, 10: 5 };      // inked columns from d = 3 (paragraph ends short)

/** The full open spread (pages, gutter crease, page-block strata, boards, ribbon). ink: false = clean right page row 10. */
function spreadMask({ inkRight10 = true } = {}) {
  const G = grid(MW, MH);
  for (const s of [-1, 1]) {
    for (let d = 1; d <= 10; d++) {
      const x = GX + s * d, t = TOP[d], b = BOT[d];
      for (let y = t; y <= b; y++) G.put(x, y, d === 1 ? 'e' : 'b');       // d 1 = the shadow in the gutter
      G.put(x, b + 1, 'e'); G.put(x, b + 2, 'a');                          // page-block stratum, board under it
      for (const r of INK_ROWS) {
        if (s > 0 && r === 10 && !inkRight10) continue;
        const len = INK_LEN[r] - (s < 0 && r === 8 ? 1 : 0);
        if (d >= 3 && d < 3 + len && r > t && r < b && (x * 3 + r) % 7 !== 0) G.put(x, r, 'i');
      }
    }
    const xo = GX + s * 11;                                                 // the board's outer edge
    for (let y = TOP[10] + 1; y <= BOT[10] + 2; y++) G.put(xo, y, 'a');
  }
  for (let y = TOP[1]; y <= BOT[1]; y++) G.put(GX, y, 'k');                 // gutter crease
  G.put(GX, BOT[1] + 1, 'e'); G.put(GX, BOT[1] + 2, 'a');
  for (let y = BOT[1] + 1; y <= BOT[1] + 4; y++) G.put(GX + 2, y, 'r');     // ribbon hangs below the boards
  return G;
}
/** Closed: the front cover faces the viewer on the right of the spine (spine at the gutter column). */
function closedMask() {
  const G = grid(MW, MH);
  G.put(GX, 3, 'a'); for (let x = GX + 1; x <= GX + 9; x++) G.put(x, 3, 'b'); G.put(GX + 10, 3, 'a');   // top: page block between the boards
  G.rect(GX, 4, 11, 12, 'a');
  for (let y = 4; y < 16; y++) G.put(GX, y, 'k');                          // spine crease
  for (const [x, y] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) G.put(GX + 5 + x, 9 + y, 'g');   // gold diamond
  G.put(GX + 5, 9, 'g');
  for (const x of [GX + 2, GX + 8]) { G.put(x, 5, 'g'); G.put(x, 14, 'g'); }  // corner studs
  G.put(GX + 7, 16, 'r'); G.put(GX + 7, 17, 'r');
  return G.rows();
}
/** The right half of the spread (page + boards) alone: what the open shows under the turning cover. */
function rightHalf(G) {
  const S = spreadMask();
  for (let y = 0; y < MH; y++) for (let x = GX + 1; x < MW; x++) { const c = S.get(x, y); if (c !== '.') G.put(x, y, c); }
  return G;
}
/** Cover standing up (about 90 degrees): an edge-on board rising above the gutter, the right page revealed. */
function standingMask() {
  const G = rightHalf(grid(MW, MH));
  for (let y = 1; y <= 16; y++) { G.put(GX, y, 'k'); G.put(GX - 1, y, 'a'); }
  G.put(GX - 1, 0, 'a'); G.put(GX, 0, 'b');                               // the board's top edge, endpaper glint
  return G.rows();
}
/** Cover falling left (about 135 degrees): the endpaper, narrower and higher than the final left page. */
function fallingMask() {
  const G = rightHalf(grid(MW, MH));
  const top = [0, 5, 4, 3, 3, 2, 2], bot = [0, 13, 12, 12, 11, 11, 10];
  for (let d = 1; d <= 6; d++) { const x = GX - d; for (let y = top[d]; y <= bot[d]; y++) G.put(x, y, d === 1 ? 'e' : 'b'); G.put(x, bot[d] + 1, 'a'); }
  for (let y = top[6] + 1; y <= bot[6] + 1; y++) G.put(GX - 7, y, 'a');
  for (let y = TOP[1]; y <= BOT[1]; y++) G.put(GX, y, 'k');
  G.put(GX, BOT[1] + 1, 'e'); G.put(GX, BOT[1] + 2, 'a');
  return G.rows();
}
/** Hold flutter: 1 = right corner lifts, 3 = left corner lifted (the page landed); 2 = the standing page (overlay). */
function holdMask(k) {
  const G = spreadMask();
  if (k === 1) { G.put(GX + 8, 3, 'b'); G.put(GX + 9, 3, 'b'); G.put(GX + 10, 2, 'b'); G.put(GX + 10, 3, 'b'); G.put(GX + 9, 4, 'e'); G.put(GX + 10, 4, 'e'); }
  if (k === 3) { G.put(GX - 8, 3, 'b'); G.put(GX - 9, 3, 'b'); G.put(GX - 10, 2, 'b'); G.put(GX - 10, 3, 'b'); G.put(GX - 9, 4, 'e'); G.put(GX - 10, 4, 'e'); }
  return G.rows();
}
// a page standing up mid-turn (own outline over the spread): 4 columns rising from the gutter, its far edge shaded
const TURN_PAGE = ['.bb.', 'bbbb', 'bbbe', 'bbbe', 'bbbe', 'bbbe', 'bbbe', 'bbbe', 'bbbe', 'bbbe', 'bbbe', 'bbe.'];
// the big quill: a cream feather (page hi + page line), a gold shaft, one dark nib texel at the bottom left (0, 8)
const QUILL_BIG = ['......www', '.....wwww', '....wwww.', '...wwww..', '..wwww...', '..www....', '.vw......', '.v.......', 'n........'];
/** Write drawing f: the nib on the right page's row 10, moving right 1 texel per drawing; the ink grows behind it. */
export const BIG_WRITE = { row: 10, x0: GX + 3, path: [0, 1, 2, 3] };

function compose(rows, M, overlays = []) {
  const out = new PixelImage(BIG_CELL.w, BIG_CELL.h);
  out.blit(renderBookMask(rows, M), 0, 0);
  for (const [orows, x, y] of overlays) out.blit(renderBookMask(orows, M), x, y);
  return out;
}

/**
 * All big-book frames for one token set: [[name, PixelImage], ...]. prefix 'bookbig' (alive) / 'bookbigghost'.
 * Mask texel (x, y) lands at image (x + 1, y + 1) (renderBookMask's outline pad).
 */
export function buildBigBookFrames(T, { ghost = false } = {}) {
  const M = bookMats(T, ghost), pre = ghost ? 'bookbigghost' : 'bookbig', out = [];
  const closed = closedMask(), standing = standingMask(), falling = fallingMask(), spread = spreadMask().rows(), pop = erodeMask(erodeMask(closed));
  out.push([`${pre}_open_0`, compose(pop, M)], [`${pre}_open_1`, compose(closed, M)], [`${pre}_open_2`, compose(standing, M)],
    [`${pre}_open_3`, compose(falling, M)], [`${pre}_open_4`, compose(spread, M)]);
  out.push([`${pre}_hold_0`, compose(spread, M)], [`${pre}_hold_1`, compose(holdMask(1), M)],
    [`${pre}_hold_2`, compose(spread, M, [[TURN_PAGE, GX + 1, -1 + 1]])], [`${pre}_hold_3`, compose(holdMask(3), M)]);
  out.push([`${pre}_close_0`, compose(standing, M)], [`${pre}_close_1`, compose(closed, M)], [`${pre}_close_2`, compose(pop, M)]);
  BIG_WRITE.path.forEach((dx, f) => {
    const G = spreadMask({ inkRight10: false });
    for (let x = BIG_WRITE.x0; x < BIG_WRITE.x0 + dx + 1; x++) G.put(x, BIG_WRITE.row, 'i');
    const nx = BIG_WRITE.x0 + dx + 1, ny = BIG_WRITE.row;               // nib texel (mask coords), right of the ink
    // the quill image has its nib at local (1, 9) (pad 1): mask (nx, ny) -> image (nx + 1, ny + 1)
    out.push([`${pre}_write_${f}`, compose(G.rows(), M, [[QUILL_BIG, nx, ny - 8]])]);
  });
  return out;
}

const gf = (s) => Math.floor(s * GRID_HZ + 0.01);
/**
 * Which big-book drawing a reader shows at time t (same inputs as draw.js bookState). { phase, f } or null.
 * A close that starts before the cover stood up (open drawing 2) skips close_0. Reduced motion: no open / close
 * drawings, no flutter, the quill still.
 */
export function bigBookState(t, { openAt, closeAt = Infinity, typing = false, seed = 0, still = false }) {
  if (openAt === undefined || openAt === null || t < openAt) return null;
  if (t >= closeAt) {
    if (still) return null;
    const c = gf(t - closeAt), reached = gf(closeAt - openAt);
    const k = (reached >= 4 ? 0 : 1) + (c >> 1);
    return k < 3 ? { phase: 'close', f: k } : null;
  }
  const g = gf(t - openAt);
  if (!still && g < BIG_TIMING.OPEN_FRAMES) return { phase: 'open', f: g >> 1 };
  if (typing) return { phase: 'write', f: still ? 0 : Math.floor((gf(t) + seed * 2) / 3) % 4 };
  if (still) return { phase: 'hold', f: 0 };
  const k = Math.floor((g - BIG_TIMING.OPEN_FRAMES) / 3) + seed * 7, n = BIG_HOLD_SEQ.length;
  return { phase: 'hold', f: BIG_HOLD_SEQ[((k % n) + n) % n] };
}
export const bigFrameName = (s, ghost = false) => `${ghost ? 'bookbigghost' : 'bookbig'}_${s.phase}_${s.f}`;

const _frames = new Map();
/** Cached Map name -> PixelImage (alive + ghost) per token set. */
export function bigBookFrames(T) {
  if (!_frames.has(T)) _frames.set(T, new Map([...buildBigBookFrames(T), ...buildBigBookFrames(T, { ghost: true })]));
  return _frames.get(T);
}

/**
 * Draw one big book for member m on L.world (tier A). opts = draw.js drawReader opts. Returns the state (or null).
 */
export function drawBigBook(L, m, opts = {}) {
  const s = bigBookState(L.t, opts);
  if (!s || !m) return null;
  const ghost = opts.ghost ?? !!m.ghost;
  const lift = ghost ? PLACE_BIG.ghostLift : 0;
  const q = L.at(m.pos.clone().setY(m.pos.y + lift));
  const img = bigBookFrames(L.tok).get(bigFrameName(s, ghost));
  const x = q.x - BIG_ANCHOR.x, y = q.y + PLACE_BIG.dy - BIG_ANCHOR.y;
  L.world.blit(img, x, y);
  return { ...s, style: 'big', x: q.x, y: q.y + PLACE_BIG.dy };
}
