// v3.3 sprites prototype (ct.debug.v3sprites=1). Pure math of the baked character sprites: cell sizes in exact
// low-res texels, the atlas grid, facing selection (8 facings relative to the camera yaw, stepped like the vendor
// Character: hysteresis + one 45° step per turn hold), locomotion drawing selection, and the per-texel encodings
// the bake writes (plane A = view normal xy + depth offset; plane B = palette slot / side / halo / part id / lift /
// bind height). No three.js here (unit-tested: apps/client/test/game3d/sprites.test.ts).

export const FACINGS = 8;
const TAU = Math.PI * 2;
const STEP = TAU / FACINGS;

// ------------------------------------------------------------------------------------ cells and atlas

export interface CellSpec {
  /** Cell size (texels). Even width: the anchor (feet) sits on a texel corner at x = w / 2. */
  w: number;
  h: number;
  /** Texels below the anchor (the part of the figure in front of the feet, lower on screen). */
  below: number;
}

/**
 * The sprite cell of a figure (bind reach r m around the vertical axis, top y m) seen at `pitch` with `texel` m per
 * low-res texel. Screen-plane extents: up = top·cos(pitch) + r·sin(pitch), down = r·sin(pitch); both with a margin
 * for animation (arms up, lean) and rounded out to whole texels.
 */
export function cellFor(r: number, top: number, pitch: number, texel: number, margin = 0.12): CellSpec {
  const t = Math.max(1e-4, texel);
  const rr = r * 1.25 + margin;
  const up = (top * 1.12 + margin) * Math.cos(pitch) + rr * Math.sin(pitch);
  const down = rr * Math.sin(pitch) + margin;
  const half = Math.ceil(rr / t) + 1;
  const below = Math.ceil(down / t) + 1;
  const above = Math.ceil(up / t) + 1;
  return { w: 2 * half, h: below + above, below };
}

export interface AtlasGrid {
  cols: number;
  rows: number;
  /** Atlas size (texels). */
  width: number;
  height: number;
}

/** A grid of `n` cells, as square as the max texture size allows. */
export function atlasGrid(n: number, cell: Pick<CellSpec, 'w' | 'h'>, maxSize = 4096): AtlasGrid {
  const count = Math.max(1, n);
  let cols = Math.max(1, Math.ceil(Math.sqrt((count * cell.h) / cell.w)));
  cols = Math.min(cols, Math.max(1, Math.floor(maxSize / cell.w)));
  const rows = Math.ceil(count / cols);
  if (rows * cell.h > maxSize) throw new Error(`sprite atlas too large: ${count} cells of ${cell.w}x${cell.h}`);
  return { cols, rows, width: cols * cell.w, height: rows * cell.h };
}

/** Texel origin (bottom-left, GL rows bottom-up) of cell i. */
export function cellOrigin(i: number, grid: AtlasGrid, cell: Pick<CellSpec, 'w' | 'h'>): { x: number; y: number } {
  return { x: (i % grid.cols) * cell.w, y: Math.floor(i / grid.cols) * cell.h };
}

/** Bytes of an atlas: two RGBA8 planes. */
export function atlasBytes(grid: AtlasGrid): number {
  return grid.width * grid.height * 4 * 2;
}

// ------------------------------------------------------------------------------------ facings

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  const w = a - Math.round(a / TAU) * TAU;
  return w <= -Math.PI ? w + TAU : w;
}

/** Facing index 0..7 of a pixel3d yaw (0 = +Z) relative to the camera yaw. */
export function facingIndex(yaw: number, camYaw: number): number {
  const k = Math.round(wrapAngle(yaw - camYaw) / STEP);
  return ((k % FACINGS) + FACINGS) % FACINGS;
}

/** The yaw (pixel3d) drawn by facing k for the camera yaw. */
export function facingYaw(k: number, camYaw: number): number {
  return wrapAngle(camYaw + k * STEP);
}

/**
 * The displayed facing after one turn step toward `yaw`: like the vendor Character (facingSteps 8), a facing
 * changes only past `hysteresisDeg` beyond the half-way line, and steps one 45° direction at a time (the shorter
 * way round). Call once per turn hold (the vendor: turnHold 2 grid frames at 30 Hz = 1/15 s).
 */
export function stepFacing(cur: number, yaw: number, camYaw: number, hysteresisDeg = 8): number {
  const rel = wrapAngle(yaw - camYaw - cur * STEP);
  const thr = STEP / 2 + (hysteresisDeg * Math.PI) / 180;
  if (Math.abs(rel) <= thr) return cur;
  const dir = rel > 0 ? 1 : -1;
  return (((cur + dir) % FACINGS) + FACINGS) % FACINGS;
}

// ------------------------------------------------------------------------------------ drawings

/** Drawing index of a locomotion cycle: `phase` in cycles (distance / cycle length), `poses` drawings per cycle. */
export function cycleDrawing(phase: number, poses: number): number {
  if (poses <= 1) return 0;
  const k = Math.floor(phase * poses + 1e-6);
  return ((k % poses) + poses) % poses;
}

/** Index of the held key at time t (s) of a looping keyed clip: keys = start times (s, ascending), length (s). */
export function heldKeyAt(t: number, keys: readonly number[], length: number): number {
  if (!keys.length) return 0;
  const L = Math.max(1e-6, length);
  const u = ((t % L) + L) % L;
  let i = 0;
  for (let j = 0; j < keys.length; j++) if (keys[j]! <= u + 1e-9) i = j;
  return i;
}

// ------------------------------------------------------------------------------------ encodings

/** Depth offset range (m, toward the camera from the anchor plane) of plane A's 16-bit depth. */
export const DEPTH_LO = -2;
export const DEPTH_RANGE = 5;

/** Depth offset (m, + = toward the camera) -> two bytes [hi, lo]. */
export function encodeDepth(dz: number): [number, number] {
  const q = Math.round(Math.min(1, Math.max(0, (dz - DEPTH_LO) / DEPTH_RANGE)) * 65535);
  return [q >> 8, q & 255];
}
export function decodeDepth(hi: number, lo: number): number {
  return ((hi * 256 + lo) / 65535) * DEPTH_RANGE + DEPTH_LO;
}

/** Side of a texel's bone: 0 midline (or a held prop), 1 = the character's left, 2 = right. */
export type Side = 0 | 1 | 2;

export interface TexelB {
  /** Palette slot 0..15, or -1 = empty texel. */
  slot: number;
  side: Side;
  /** The shared ghost's halo. */
  halo: boolean;
  /** look.js part id, -156..156 (0 = none). */
  part: number;
  /** Lift 0..1 in % steps. */
  lift: number;
  /** Bind height / ghost height, 0..1.25 in 1/204 steps. */
  bindY: number;
}

/** Bind height scale of plane B's alpha byte (bindY / BIND_MAX * 255). */
export const BIND_MAX = 1.25;

export function encodeB(t: TexelB): [number, number, number, number] {
  if (t.slot < 0) return [0, 0, 0, 0];
  const p = Math.max(-160, Math.min(351, Math.round(t.part))) + 160;
  return [
    ((t.slot + 1) & 31) | ((t.side & 3) << 5) | ((t.halo ? 1 : 0) << 7),
    p & 255,
    ((p >> 8) & 1) | (Math.max(0, Math.min(100, Math.round(t.lift * 100))) << 1),
    Math.round(Math.min(1, Math.max(0, t.bindY / BIND_MAX)) * 255),
  ];
}

export function decodeB(r: number, g: number, b: number, a: number): TexelB {
  const s1 = r & 31;
  if (s1 === 0) return { slot: -1, side: 0, halo: false, part: 0, lift: 0, bindY: 0 };
  return {
    slot: s1 - 1,
    side: ((r >> 5) & 3) as Side,
    halo: ((r >> 7) & 1) === 1,
    part: g + ((b & 1) << 8) - 160,
    lift: (b >> 1) / 100,
    bindY: (a / 255) * BIND_MAX,
  };
}

/**
 * look.js far side (farSide) for a facing: s = dot(character left axis, camera forward) on the ground. The left
 * axis of yaw f is (cos f, 0, -sin f) (three's rotation.y applied to +X); `fwd` = the camera forward (engine
 * camera.forward), only x/z used. |s| <= dead: the side turned away from the sun (sunTieBreak), else none.
 * Returns the far Side (1 left, 2 right) or 0.
 */
export function farSideOf(yaw: number, fwd: { x: number; z: number }, sun: { x: number; z: number } | null, dead = 0.3): Side {
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  const fn = Math.hypot(fwd.x, fwd.z) || 1;
  const s = (lx * fwd.x + lz * fwd.z) / fn;
  if (s > dead) return 1;
  if (s < -dead) return 2;
  if (!sun) return 0;
  const n = Math.hypot(sun.x, sun.z);
  if (n < 1e-3) return 0;
  const k = (lx * sun.x + lz * sun.z) / n;
  return k > 0.25 ? 2 : k < -0.25 ? 1 : 0;
}
