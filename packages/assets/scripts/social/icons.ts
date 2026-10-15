// Character head icons for pins and the UI, derived automatically from each character's
// 'down' idle frame in cast.png (so they always match the sprite the players see).
//
// Pipeline per character:
//   1. solid mask (alpha >= 200; the semi-transparent ground shadow is ignored);
//   2. a 4-neighbour opening removes 1-2 px wide structures, the largest remaining component
//      inside a column window around the body centre is the body (staffs/props stick out);
//      its top rows give the head's top and x-span (thin ears/eyestalks are flooded back in);
//   3. the FACE centre = centroid of the head pixels that differ between the front ('down') and
//      back ('up') idle frames — hats, caps, ears and hoods look alike from both sides, while
//      eyes, snouts and mouths only exist in front. This finds faces under mushroom caps, chef
//      hats, hoods and beret brims, and between tall ears, without per-character data;
//   4. an ICON x ICON square (1:1 pixels, crisp) is cropped around the face centre (TWEAK holds
//      small per-character nudges; a larger crop `c` is resampled down with a feature-preserving
//      box filter: outline stripped first and re-drawn after, high-contrast pixels such as eyes win);
//   5. the head is laid on a warm parchment backdrop and clipped to a disc of radius ICON/2.
// If no face is found (front == back), the top of the head is used.
import { CAST, CAST_DIRS } from '../../src/cast.js';
import { col, Img, mix, type RGBA } from '../lib/img.js';

export const ICON = 12;
const MAX_CROP = 16;
const HEAD_EXTRA = 4;
/** Half-width of the column window around the body centre that may contain the head. */
const WINDOW = 7.5;
/** Rows below the head top searched for the face. */
const FACE_ROWS = 16;

/**
 * Per-character nudges of the automatic face centre (px in the 32x40 frame; c = crop size).
 * Frogs: eyes on top of the head; mushroom / rabbit / goat: the cap, ears or horns pull the
 * centroid up; foxes: include the ears (14 px resampled to 12).
 */
const TWEAK: Record<string, { dx?: number; dy?: number; c?: number }> = {
  frog: { dy: -2 },
  progress: { dy: -3 },
  preservation: { dy: -3 },
  mushroom: { dy: 4 },
  rabbit: { dy: 5 },
  goat: { dy: 2 },
  fox: { c: 14 },
  maxflow: { c: 14 },
};

const lum = (c: RGBA) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;

/** Pixels inside the icon disc (centre ICON/2, radius ICON/2). Shared with the pin's socket. */
export function inDisc(x: number, y: number, size = ICON, r = ICON / 2): boolean {
  const c = size / 2;
  const dx = x + 0.5 - c;
  const dy = y + 0.5 - c;
  return dx * dx + dy * dy <= r * r + 0.5;
}

export interface HeadCrop {
  /** Crop square in the 32x40 frame. */
  x: number;
  y: number;
  size: number;
  /** Centre of the face (front-vs-back difference), frame px; null = fallback crop. */
  face: { x: number; y: number } | null;
}

export function findHead(f: Img, back: Img | null, id: string): HeadCrop {
  const W = f.w;
  const H = f.h;
  const S = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && f.alpha(x, y) >= 200;
  // opening with a plus-shaped kernel
  const E = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S(x, y) && S(x - 1, y) && S(x + 1, y) && S(x, y - 1) && S(x, y + 1)) E[y * W + x] = 1;
  const e = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && E[y * W + x] === 1;
  const O = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (e(x, y) || e(x - 1, y) || e(x + 1, y) || e(x, y - 1) || e(x, y + 1)) O[y * W + x] = 1;
  // largest 4-connected component
  const lab = new Int32Array(W * H).fill(-1);
  let best = -1;
  let bestN = 0;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!O[i] || lab[i]! >= 0) continue;
    const st = [i];
    lab[i] = n;
    let cnt = 0;
    while (st.length) {
      const p = st.pop()!;
      cnt++;
      const px = p % W;
      const py = (p / W) | 0;
      for (const [qx, qy] of [
        [px - 1, py],
        [px + 1, py],
        [px, py - 1],
        [px, py + 1],
      ] as const) {
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const q = qy * W + qx;
        if (O[q] && lab[q]! < 0) {
          lab[q] = n;
          st.push(q);
        }
      }
    }
    if (cnt > bestN) {
      bestN = cnt;
      best = n;
    }
    n++;
  }
  // body centre column (median x of the solid pixels): heads sit over it, staffs/props stick out
  const xs: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S(x, y)) xs.push(x);
  xs.sort((a, b) => a - b);
  const cx0 = xs.length ? xs[xs.length >> 1]! : W / 2;
  const M = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && Math.abs(x + 0.5 - cx0) <= WINDOW && (best < 0 ? S(x, y) : lab[y * W + x] === best);
  let top = H;
  for (let y = 0; y < H && top === H; y++) for (let x = 0; x < W; x++) if (M(x, y)) top = y;
  // head span over the first rows
  let hl = W;
  let hr = -1;
  for (let y = top; y < Math.min(H, top + 8); y++)
    for (let x = 0; x < W; x++)
      if (M(x, y)) {
        hl = Math.min(hl, x);
        hr = Math.max(hr, x);
      }
  // thin details on the head: flood the original mask upward from the head's top rows
  let top2 = top;
  const seen = new Set<number>();
  const st: [number, number][] = [];
  for (let x = hl; x <= hr; x++) if (M(x, top)) st.push([x, top]);
  while (st.length) {
    const [x, y] = st.pop()!;
    const k = y * W + x;
    if (seen.has(k)) continue;
    seen.add(k);
    top2 = Math.min(top2, y);
    for (const [qx, qy] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
    ] as const)
      if (qx >= hl - 1 && qx <= hr + 1 && qy >= top - HEAD_EXTRA && qy <= top && S(qx, qy)) st.push([qx, qy]);
  }
  const t = TWEAK[id] ?? {};
  // The FACE is what differs between the front ('down') and back ('up') views of the head: hats,
  // caps, ears and hoods look alike from both sides, eyes/snouts/mouths only exist in front.
  let fx = 0;
  let fy = 0;
  let fn = 0;
  if (back)
    for (let y = top2; y < Math.min(H, top2 + FACE_ROWS); y++)
      for (let x = 0; x < W; x++) {
        if (!M(x, y) || back.alpha(x, y) < 200) continue;
        const p = f.get(x, y);
        const q = back.get(x, y);
        if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 60) continue;
        fx += x + 0.5;
        fy += y + 0.5;
        fn++;
      }
  if (fn >= 4) {
    const cy = fy / fn + (t.dy ?? 0);
    const cx = fx / fn + (t.dx ?? 0);
    const size = Math.max(ICON, Math.min(MAX_CROP, t.c ?? ICON));
    return { x: Math.round(cx - size / 2), y: Math.max(top2 - 1, Math.round(cy - size / 2)), size, face: { x: cx, y: cy } };
  }
  // fallback: the top of the head
  const size = Math.max(ICON, Math.min(MAX_CROP, t.c ?? hr - hl + 2));
  const cx = (hl + hr + 1) / 2 + (t.dx ?? 0);
  return { x: Math.round(cx - size / 2), y: Math.max(0, top2 - (size > ICON + 1 ? 1 : 0)) + (t.dy ?? 0), size, face: null };
}

/** Feature-preserving box downscale of a binary-alpha sprite (outline already stripped). */
function resample(src: Img, n: number): Img {
  const s = src.w / n;
  const out = new Img(n, n);
  const solid = (x: number, y: number) => src.alpha(x, y) >= 200;
  const feature = (x: number, y: number) => {
    const c = lum(src.get(x, y));
    let sum = 0;
    let k = 0;
    for (const [qx, qy] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const) {
      if (!solid(qx, qy)) return 0;
      sum += lum(src.get(qx, qy));
      k++;
    }
    return Math.abs(sum / k - c) > 0.2 ? 1 : 0;
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x0 = i * s;
      const x1 = x0 + s;
      const y0 = j * s;
      const y1 = y0 + s;
      let sw = 0;
      const score = new Map<string, { c: RGBA; v: number }>();
      for (let py = Math.floor(y0); py < Math.ceil(y1); py++)
        for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
          const w = (Math.min(x1, px + 1) - Math.max(x0, px)) * (Math.min(y1, py + 1) - Math.max(y0, py));
          if (w <= 0 || !solid(px, py)) continue;
          sw += w;
          const c = src.get(px, py);
          const key = c.join(',');
          const e = score.get(key) ?? { c, v: 0 };
          e.v += w * (1 + 1.6 * feature(px, py));
          score.set(key, e);
        }
      if (sw < 0.5 * s * s) continue;
      let bc: RGBA | null = null;
      let bv = -1;
      for (const e of score.values()) if (e.v > bv) (bv = e.v), (bc = e.c);
      if (bc) out.set(i, j, [bc[0], bc[1], bc[2], 255]);
    }
  return out;
}

/** The bare head (transparent background, v1 outline), ICON x ICON. */
export function headSprite(f: Img, crop: HeadCrop): Img {
  const S = (x: number, y: number) => f.alpha(x, y) >= 200;
  const raw = new Img(crop.size, crop.size);
  for (let y = 0; y < crop.size; y++)
    for (let x = 0; x < crop.size; x++) {
      const fx = crop.x + x;
      const fy = crop.y + y;
      if (!S(fx, fy)) continue;
      raw.set(x, y, f.get(fx, fy));
    }
  if (crop.size === ICON) return raw;
  // strip the outline (silhouette pixels next to transparency in the FULL frame), resample, re-outline
  const inner = new Img(crop.size, crop.size);
  for (let y = 0; y < crop.size; y++)
    for (let x = 0; x < crop.size; x++) {
      const fx = crop.x + x;
      const fy = crop.y + y;
      if (!S(fx, fy)) continue;
      if (!S(fx - 1, fy) || !S(fx + 1, fy) || !S(fx, fy - 1) || !S(fx, fy + 1)) continue;
      inner.set(x, y, f.get(fx, fy));
    }
  const small = resample(inner, ICON);
  small.outline({ darken: 0.72 });
  return small;
}

const BACK_HI = col('#f4e8c8');
const BACK_LO = col('#c4a982');

/** Round portrait: parchment disc + head, clipped. */
export function portrait(head: Img): Img {
  const o = new Img(ICON, ICON);
  for (let y = 0; y < ICON; y++)
    for (let x = 0; x < ICON; x++) {
      if (!inDisc(x, y)) continue;
      // light from the upper left
      const t = Math.max(0, Math.min(1, ((x + 0.5) / ICON) * 0.45 + ((y + 0.5) / ICON) * 0.75 - 0.15));
      o.set(x, y, mix(BACK_HI, BACK_LO, t));
      const p = head.get(x, y);
      if (p[3] >= 200) o.set(x, y, p);
    }
  return o;
}

export interface IconSet {
  icons: Map<string, Img>;
  crops: Record<string, HeadCrop>;
}

export function buildIcons(castImg: Img, manifest: { sheets: Record<string, { x: number; y: number }>; frameWidth: number; frameHeight: number }): IconSet {
  const icons = new Map<string, Img>();
  const crops: Record<string, HeadCrop> = {};
  for (const c of CAST) {
    const s = manifest.sheets[c.id];
    if (!s) throw new Error(`social: cast sheet missing for ${c.id}`);
    const f = new Img(manifest.frameWidth, manifest.frameHeight);
    f.copy(castImg, 0, 0, s.x, s.y, manifest.frameWidth, manifest.frameHeight); // row 0 = down, col 0 = idle
    const b = new Img(manifest.frameWidth, manifest.frameHeight);
    b.copy(castImg, 0, 0, s.x, s.y + CAST_DIRS.indexOf('up') * manifest.frameHeight, manifest.frameWidth, manifest.frameHeight);
    const crop = findHead(f, b, c.id);
    crops[c.id] = crop;
    icons.set(c.id, portrait(headSprite(f, crop)));
  }
  return { icons, crops };
}
