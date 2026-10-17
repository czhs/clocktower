// Markers variant "pointerScale: 'v2'" (owner: markers group; docs/UI.md §6 "variants"): the pointing finger redrawn at
// the size the v2 finger had RELATIVE TO THE v2 CAST, scaled to the pixel3d cast at the game camera (vh 12).
//
// Measurement (shots/ui-variants/measure_v2.py + measure_new.py, numbers in docs/UI.md):
//   v2 point_<dir>_0 opaque bbox (incl. outline): right/left 17x11, diagonals 14x14, up/down 11x17 (20x20 frames)
//   v2 cast idle-down in its 32x40 cell: 25..38 texels tall, median 31 (refs/ui/_src/cast-portraits, all 33 sprites)
//   pixel3d cast at vh 12: 32..45 texels tall (body; staffs / FX excluded), median 35 (diff of cast=1 vs cast=0 captures:
//   frog 35, owl 32, fox 32, mushroom 35, rabbit 33, goat 40, crow 37, Storyteller 45)
//   -> K = 35 / 31 = 1.13: v2-relative finger = right 19.2x12.4, diagonal 15.8, up/down 12.4x19.2; drawn 20x13 / 16x16 /
//      13x20 (rounded up by <= 1 texel so the fist keeps thumb + 3 curled fingers at whole texels). The 'new' finger is
//      15x11 / 14x14 / 11x15: 0.43 H long vs v2's 0.55 H; the v2-size one is 0.57 H.
// Redrawn at that size (new templates, one texel = one scene texel, no upscaled pixels), painted by the same
// paintGrid as the 'new' finger (light from the upper left, shading after the rotation, own-family line).
// Frame names = v2 (point_<dir>_<0..2>); frames 24x24, anchor (12, 12) = the fist centre, offset 16 (v2 14 x K).
// Every other markers frame (pins, ping, trail, ...) is unchanged and shared, so a variant atlas
// (out/ui/markers-v2size.{png,json}) is a complete drop-in for markers.{png,json}.
import { PixelImage, ramp } from '../kit.js';
import { POINT, POINT_DIRS, POINT_VEC, ANCHORS, buildFrames, palette, paintGrid, fistCentre, rotCW, flipGridX } from './art.js';

/** The measured scale (pixel3d cast median height / v2 cast median height at their game cameras). */
export const V2_MEASURE = {
  v2Finger: { right: [17, 11], diagonal: [14, 14], down: [11, 17] },
  v2CastH: { min: 25, median: 31, max: 38, n: 33 },
  newCastH: { min: 32, median: 35, max: 45, n: 8, camera: 'vh 12, yaw 0, pitch 30 deg' },
  K: 35 / 31,
  target: { right: [19.2, 12.4], diagonal: [15.8, 15.8], down: [12.4, 19.2] },
  drawn: { right: [20, 13], diagonal: [16, 16], down: [13, 20] },
};
/** Point geometry of the v2-size variant (same keys as art.js POINT / ANCHORS.point). */
export const POINT_V2 = { ...POINT, size: 24, offset: 16 };
export const ANCHOR_V2 = { x: 12, y: 12 };
export const ANCHORS_V2 = { ...ANCHORS, point: ANCHOR_V2 };

// 18x11 (+ 1-px line = 20x13): cuff (3 wide gold band), fist with three curled fingers (creases k), the thumb riding on
// top, the index finger 2 texels thick out to the right
const RIGHT_V2 = [
  '....ggggg.........',
  '...gggggggg.......',
  'cccggggggggggggggg',
  'cccggggggggggggggg',
  'cccggggggggkkkk...',
  'cccgggggggggggg...',
  'cccggggggggkkkk...',
  'cccgggggggggggg...',
  'cccgggggggkkkk....',
  'cccgggggggggggg...',
  '...ggggggggggg....',
];
// 14x14 (+ line = 16x16): the up-right view, finger in 45-degree steps; the curled fingers step down-left along the
// shaded side, each step cut by a crease tick at the silhouette (a smooth round fist read as a magnifying glass at 1x)
const UPRIGHT_V2 = [
  '............gg',
  '...........ggg',
  '..........ggg.',
  '.........ggg..',
  '....ggggggg...',
  '...gggggggggg.',
  '..ggggggggkk..',
  '.cgggggggggg..',
  'ccgggggggkk...',
  'cgggggggggg...',
  'ccggggggkk....',
  '.ccggggggg....',
  '..ccgggkk.....',
  '...cccgg......',
];
function handGridV2(dir) {
  switch (dir) {
    case 'right': return RIGHT_V2;
    case 'left': return flipGridX(RIGHT_V2);
    case 'down': return rotCW(RIGHT_V2);
    case 'up': return rotCW(rotCW(rotCW(RIGHT_V2)));
    case 'up-right': return UPRIGHT_V2;
    case 'up-left': return flipGridX(UPRIGHT_V2);
    case 'down-right': return rotCW(UPRIGHT_V2);
    case 'down-left': return flipGridX(rotCW(UPRIGHT_V2));
  }
  throw new Error(`markers: unknown point dir ${dir}`);
}
/** point_<dir>_<f> at v2 size: 24x24, fist centre on (12, 12), jab 0/1/3 texels (v2 JAB x 1.2 x K). */
export function drawHandV2(dir, f, P) {
  const g = handGridV2(dir), [fx, fy] = fistCentre(g), [vx, vy] = POINT_VEC[dir];
  const j = [0, 1.2, 2.6][f];
  const S = POINT_V2.size, gw = g[0].length, gh = g.length;
  const ox = Math.max(1, Math.min(S - 1 - gw, Math.round(ANCHOR_V2.x - fx + vx * j)));
  const oy = Math.max(1, Math.min(S - 1 - gh, Math.round(ANCHOR_V2.y - fy + vy * j)));
  const img = new PixelImage(S, S), glove = P.glove;
  // creases one step below the glove's shade band (ramp of the parchment token): at 20 px the fist has a form-shadow band
  // of glove.sh along its shaded side, and creases in that same tone vanished there (the 'new' finger uses glove.sh)
  const crease = ramp(P.T.parchment, { dark: 0.3 }).sh;
  paintGrid(img, g, ox, oy, { g: glove, c: P.gold, k: { flat: crease, line: glove.line } }, { k: 'g' });
  if (f === 2) {
    // speed ticks behind the fist on the jab frame: 2 x 3-texel dashes (the 'new' finger: 2 x 2), glove shadow, no line
    const px = -vy, py = vx;
    for (const s of [-1, 1]) {
      const bx = ANCHOR_V2.x - vx * 10 + px * s * 4, by = ANCHOR_V2.y - vy * 10 + py * s * 4;
      for (const d of [0, 1, 2]) {
        const x = Math.round(bx - vx * d), y = Math.round(by - vy * d);
        if (!img.alpha(x, y)) img.set(x, y, glove.sh);
      }
    }
  }
  return img;
}
/** The full markers frame set with the v2-size finger (same names and order as art.js buildFrames). */
export function buildFramesV2size(T) {
  const P = palette(T);
  return buildFrames(T).map(([n, im]) => {
    const m = /^point_(.+)_(\d)$/.exec(n);
    return m && POINT_DIRS.includes(m[1]) ? [n, drawHandV2(m[1], Number(m[2]), P)] : [n, im];
  });
}
const _cache = new Map();
/**
 * Cached Map name -> PixelImage of the v2-size set, tagged with its point geometry (F.point / F.anchors), which
 * draw.js drawPoint / put read (absent on the 'new' set = the art.js defaults).
 */
export function markerFramesV2size(T) {
  let m = _cache.get(T);
  if (!m) { m = new Map(buildFramesV2size(T)); m.point = POINT_V2; m.anchors = ANCHORS_V2; m.pointerScale = 'v2'; _cache.set(T, m); }
  return m;
}
