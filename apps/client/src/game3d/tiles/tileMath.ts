// v3.3 tiles (v33-tiles). Pure math of the cached static layer (docs/perf-v3/tiles.md): world-anchored texel
// "cells" in the pixel camera's snap space, square tiles of cells, a toroidal ring texture that holds the tiles
// around the view, the per-frame plan (which tiles to bake now / later), invalidation and the depth re-base.
//
// Snap space (vendor core/PixelCamera.js): the camera's right / up axes, anchored at the world origin; the camera
// position along R / U is always a whole number of texels (t = viewHeight / lowH). The low-res frame is
// Wp x Hp = (lowW + 2 MARGIN) x (lowH + 2 MARGIN) pixels, symmetric about the snapped camera position, so pixel px's
// centre sits at (Ia + px + 0.5 - Wp / 2) texels along R. With Wp even the centres are at k + 0.5, with Wp odd at
// whole k: the "parity" of the frame. A cell k is the texel whose centre is at k + 0.5 * (1 - parity); the frame's
// pixel px is cell `origin + px`. A tile camera that puts its pixel centres on the same lattice rasterises static
// geometry exactly like the frame (an orthographic camera translated by whole texels).

/** One axis of the frame in cells. */
export interface AxisFrame {
  /** cell of pixel 0 */
  origin: number;
  /** frame size in pixels (padded) */
  size: number;
  /** 0 = pixel centres at k + 0.5, 1 = at whole k */
  parity: 0 | 1;
}

/** Frame axis from the snapped camera index (texels along the axis, an integer) and the padded frame size. */
export function axisFrame(index: number, size: number): AxisFrame {
  const parity = (size & 1) as 0 | 1;
  // origin = index - size / 2 (+ 0.5 when odd) -> always an integer
  return { origin: index - (size - parity) / 2, size, parity };
}

/** Centre of cell k in texels along the axis (multiply by the texel size for metres). */
export function cellCentre(k: number, parity: 0 | 1): number {
  return k + 0.5 * (1 - parity);
}

/** Centre of tile i (T cells) in texels: where its bake camera sits along the axis. */
export function tileCentre(i: number, T: number, parity: 0 | 1): number {
  return i * T + T / 2 - 0.5 * parity;
}

/** Tiles [i0, i1] (inclusive) covering cells [c0, c1) on one axis, `pad` extra tiles each side. */
export function tileSpan(c0: number, c1: number, T: number, pad = 0): [number, number] {
  return [Math.floor(c0 / T) - pad, Math.floor((c1 - 1) / T) + pad];
}

/** Euclidean modulo (always 0..n-1). */
export function emod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export interface RingSpec {
  /** tile size in cells */
  T: number;
  /** ring size in tiles */
  NI: number;
  NJ: number;
}

/**
 * The ring for a padded frame of w x h pixels: enough tiles that every tile the frame touches, plus a prefetch ring of
 * `pad` tiles, maps to its own slot (tile i -> slot i mod NI). Cap: `maxTexels` per side.
 */
export function ringFor(w: number, h: number, T: number, pad = 1, maxTexels = 2048): RingSpec {
  // a frame of w pixels touches at most ceil(w / T) + 1 tiles; + pad on each side
  const ni = Math.ceil(w / T) + 1 + 2 * pad;
  const nj = Math.ceil(h / T) + 1 + 2 * pad;
  const cap = Math.max(1, Math.floor(maxTexels / T));
  return { T, NI: Math.min(ni, cap), NJ: Math.min(nj, cap) };
}

/** The ring texel rect (x, y, w, h) of tile (i, j). */
export function slotRect(i: number, j: number, r: RingSpec): [number, number, number, number] {
  return [emod(i, r.NI) * r.T, emod(j, r.NJ) * r.T, r.T, r.T];
}

export const tileKey = (i: number, j: number) => `${i},${j}`;

/**
 * Depth re-base. Tiles store the orthographic window depth of a bake camera whose position projects to `bakeF` on
 * the view direction F; the frame's camera projects to `camF`. Same near / far: depth_frame = depth_tile + shift.
 */
export function depthShift(bakeF: number, camF: number, near: number, far: number): number {
  return (bakeF - camF) / (far - near);
}

/** World distance along F of a stored tile depth (inverse of the bake projection). */
export function depthToF(depth: number, bakeF: number, near: number, far: number): number {
  return bakeF + near + depth * (far - near);
}

/** A pixel rect in the frame (x0, y0 inclusive; x1, y1 exclusive). */
export interface PxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Screen window (metres along R / U from the world origin: centre + half extents, the cut-away's uCutBoxS) -> frame
 * pixel rect, padded by `pad` pixels and clipped to the frame. Null when it misses the frame.
 */
export function windowRect(cx: number, cy: number, hx: number, hy: number, texel: number, ax: AxisFrame, ay: AxisFrame, pad = 2): PxRect | null {
  const lo = (c: number, h: number, a: AxisFrame) => Math.floor((c - h) / texel - 0.5 * (1 - a.parity)) - a.origin - pad;
  const hi = (c: number, h: number, a: AxisFrame) => Math.ceil((c + h) / texel - 0.5 * (1 - a.parity)) - a.origin + 1 + pad;
  const r = { x0: Math.max(0, lo(cx, hx, ax)), y0: Math.max(0, lo(cy, hy, ay)), x1: Math.min(ax.size, hi(cx, hx, ax)), y1: Math.min(ay.size, hi(cy, hy, ay)) };
  return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
}

/** Merge overlapping / touching rects (few rects: O(n^2) is fine). */
export function mergeRects(rects: readonly PxRect[]): PxRect[] {
  const out = rects.map((r) => ({ ...r }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let a = 0; a < out.length && !merged; a++)
      for (let b = a + 1; b < out.length; b++) {
        const A = out[a]!;
        const B = out[b]!;
        if (A.x0 <= B.x1 && B.x0 <= A.x1 && A.y0 <= B.y1 && B.y0 <= A.y1) {
          out[a] = { x0: Math.min(A.x0, B.x0), y0: Math.min(A.y0, B.y0), x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1) };
          out.splice(b, 1);
          merged = true;
          break;
        }
      }
  }
  return out;
}

/** Cells (along R and U, metres -> cells) covered by a set of world points projected on R / U: [k0, k1) x [l0, l1). */
export function cellBounds(points: readonly { r: number; u: number }[], texel: number, parR: 0 | 1, parU: 0 | 1, pad = 1): [number, number, number, number] {
  let r0 = Infinity;
  let r1 = -Infinity;
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const p of points) {
    r0 = Math.min(r0, p.r);
    r1 = Math.max(r1, p.r);
    u0 = Math.min(u0, p.u);
    u1 = Math.max(u1, p.u);
  }
  const k = (m: number, par: 0 | 1) => m / texel - 0.5 * (1 - par);
  return [Math.floor(k(r0, parR)) - pad, Math.ceil(k(r1, parR)) + 1 + pad, Math.floor(k(u0, parU)) - pad, Math.ceil(k(u1, parU)) + 1 + pad];
}

// ------------------------------------------------------------------------------------------------ tile bookkeeping

export interface SlotState {
  i: number;
  j: number;
  /** lighting generation the tile was baked at */
  gen: number;
}

export interface FramePlan {
  /** tiles the frame touches, missing (never baked / evicted / geometry-invalid): must be baked before compositing */
  missing: [number, number][];
  /** visible tiles baked at an older lighting generation (displayable, re-bake soon) */
  stale: [number, number][];
  /** prefetch-ring tiles not baked yet */
  prefetch: [number, number][];
  /** every tile the frame touches */
  visible: number;
}

/**
 * Which tile sits in which ring slot, at what lighting generation. Geometry changes (zoom, yaw / pitch, frame parity,
 * the cut-away circle) call `flush()`: every slot empty. Lighting steps call `relight()`: tiles become stale (still
 * shown, re-baked under a budget). Local changes call `invalidateCells()`: the touched tiles become missing.
 */
export class TileBook {
  readonly slots: (SlotState | null)[];
  gen = 0;
  constructor(readonly ring: RingSpec) {
    this.slots = new Array<SlotState | null>(ring.NI * ring.NJ).fill(null);
  }
  private slotIndex(i: number, j: number): number {
    return emod(j, this.ring.NJ) * this.ring.NI + emod(i, this.ring.NI);
  }
  get(i: number, j: number): SlotState | null {
    const s = this.slots[this.slotIndex(i, j)];
    return s && s.i === i && s.j === j ? s : null;
  }
  /** Record a bake (evicts whatever tile held the slot). */
  baked(i: number, j: number): void {
    this.slots[this.slotIndex(i, j)] = { i, j, gen: this.gen };
  }
  flush(): void {
    this.slots.fill(null);
  }
  relight(): void {
    this.gen++;
  }
  /** Drop every tile overlapping cells [k0, k1) x [l0, l1). Returns how many were dropped. */
  invalidateCells(k0: number, k1: number, l0: number, l1: number): number {
    const T = this.ring.T;
    let n = 0;
    for (let s = 0; s < this.slots.length; s++) {
      const st = this.slots[s];
      if (!st) continue;
      if (st.i * T < k1 && (st.i + 1) * T > k0 && st.j * T < l1 && (st.j + 1) * T > l0) {
        this.slots[s] = null;
        n++;
      }
    }
    return n;
  }
  /** Tiles that hold valid (current or stale) content. */
  count(): { valid: number; stale: number } {
    let valid = 0;
    let stale = 0;
    for (const s of this.slots)
      if (s) {
        valid++;
        if (s.gen !== this.gen) stale++;
      }
    return { valid, stale };
  }
  /** The frame's needs: visible tiles over cells [ox, ox + w) x [oy, oy + h), plus `pad` prefetch tiles. */
  plan(ox: number, oy: number, w: number, h: number, pad = 1): FramePlan {
    const T = this.ring.T;
    const [i0, i1] = tileSpan(ox, ox + w, T);
    const [j0, j1] = tileSpan(oy, oy + h, T);
    const missing: [number, number][] = [];
    const stale: [number, number][] = [];
    const prefetch: [number, number][] = [];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const s = this.get(i, j);
        if (!s) missing.push([i, j]);
        else if (s.gen !== this.gen) stale.push([i, j]);
      }
    // prefetch: the ring of tiles around the view that still fits the ring without evicting a visible tile
    const fitsI = i1 - i0 + 1 + 2 * pad <= this.ring.NI;
    const fitsJ = j1 - j0 + 1 + 2 * pad <= this.ring.NJ;
    if (pad > 0 && fitsI && fitsJ)
      for (let j = j0 - pad; j <= j1 + pad; j++)
        for (let i = i0 - pad; i <= i1 + pad; i++) {
          if (i >= i0 && i <= i1 && j >= j0 && j <= j1) continue;
          const s = this.get(i, j);
          if (!s || s.gen !== this.gen) prefetch.push([i, j]);
        }
    // nearest the view centre first
    const cx = (i0 + i1) / 2;
    const cy = (j0 + j1) / 2;
    const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy);
    prefetch.sort(near);
    stale.sort(near);
    return { missing, stale, prefetch, visible: (i1 - i0 + 1) * (j1 - j0 + 1) };
  }
}

/** Ring memory in bytes: `colorTargets` RGBA16F targets + one Float32 depth texture (+ a depth renderbuffer each). */
export function ringBytes(r: RingSpec, colorTargets: number): number {
  const texels = r.NI * r.T * r.NJ * r.T;
  return texels * (colorTargets * (8 + 4) + 4);
}

/** Quantised key of a lighting state (numbers): equal keys = the same baked look. */
export function lightKey(values: readonly number[], q = 1e-4): string {
  let s = '';
  for (const v of values) s += `${Math.round(v / q)},`;
  return s;
}
