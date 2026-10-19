// v3.3 sprites (default at the low / cpu tiers). Pure math of the baked character sprites: cell sizes in exact
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

/** Depth steps of plane A (12 bit: 1.2 mm over DEPTH_RANGE); the low 4 bits of the alpha byte carry spec varyings. */
export const DEPTH_STEPS = 4095;

/** Depth offset (m, + = toward the camera) + 4 custom bits -> plane A's blue and alpha bytes. */
export function encodeDepth(dz: number, custom4 = 0): [number, number] {
  const q = Math.round(Math.min(1, Math.max(0, (dz - DEPTH_LO) / DEPTH_RANGE)) * DEPTH_STEPS);
  return [q >> 4, ((q & 15) << 4) | (custom4 & 15)];
}
export function decodeDepth(b: number, a: number): number {
  return ((b * 16 + (a >> 4)) / DEPTH_STEPS) * DEPTH_RANGE + DEPTH_LO;
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

// ------------------------------------------------------------------------------------ timelines (v3.3 ship)

/**
 * A baked clip: the drawings it shows over time. `keys` = start times (s, ascending, keys[0] = 0) of each displayed
 * drawing, `cells` = the base cell of each (facing k = base + k), `length` (s): a loop wraps, a one-shot ('die')
 * holds its last drawing after the end.
 */
export interface Timeline {
  keys: number[];
  cells: number[];
  length: number;
  loop: boolean;
}

/** Index of the drawing a timeline shows `t` s after it started (loop: wraps; one-shot: holds the last). */
export function timelineKey(t: number, keys: readonly number[], length: number, loop: boolean): number {
  if (!keys.length) return 0;
  if (loop) return heldKeyAt(t, keys, length);
  const u = Math.max(0, t);
  let i = 0;
  for (let j = 0; j < keys.length; j++) if (keys[j]! <= u + 1e-9) i = j;
  return i;
}

/** The base cell a timeline shows at `t` (0 for an empty timeline). */
export function timelineCell(tl: Timeline, t: number): number {
  return tl.cells[timelineKey(t, tl.keys, tl.length, tl.loop)] ?? 0;
}

/**
 * Compress a recorded drawing sequence (one name per simulation step of `dt` s) into timeline keys: a key wherever
 * the drawing changes. Returns the key start times and the index into `names` of each key's first step.
 */
export function compressSteps(names: readonly string[], dt: number): { keys: number[]; first: number[] } {
  const keys: number[] = [];
  const first: number[] = [];
  for (let i = 0; i < names.length; i++) {
    if (i === 0 || names[i] !== names[i - 1]) {
      keys.push(+(i * dt).toFixed(4));
      first.push(i);
    }
  }
  return { keys, first };
}

// ------------------------------------------------------------------------------------ spec-custom varyings

/**
 * The float varyings a spec's own material GLSL computes in its vertex stage (spec.material.vertexHead): the
 * 'clips' ghost specs read their ghost state from bone matrices there (`vGhost`, `vMothLamp`, ...), which a sprite
 * quad has no skinning for. The bake writes up to 4 of them per texel into plane C; the sprite reads them back.
 */
export function customVaryings(vertexHead: unknown, max = 4): string[] {
  if (typeof vertexHead !== 'string') return [];
  const out: string[] = [];
  const re = /\bvarying\s+(?:(?:highp|mediump|lowp)\s+)?float\s+([A-Za-z_]\w*)\s*;/g;
  for (let m = re.exec(vertexHead); m; m = re.exec(vertexHead)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out.slice(0, max);
}

/** Plane C byte scale: a custom varying v (0..5.1; flags and ghost levels 0 / 1 / 2 are exact) = byte / 50. */
export const CUSTOM_SCALE = 50;
export function encodeCustom(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v * CUSTOM_SCALE)));
}
export function decodeCustom(b: number): number {
  return b / CUSTOM_SCALE;
}

/**
 * Plane A packs up to 3 spec varyings into 4 bits next to a 12-bit depth (v3.3 ship: no third plane): varying 0 in
 * 2 bits on the levels {0, 0.5, 1, 2} (the ghost specs' vGhost / vSnGhost / vWispGhost values), varyings 1 and 2 as
 * flags (> 0.5: halo, lamp). The vendor's ghost GLSL only compares them against 0.5 / 1.5 thresholds.
 */
export const CUSTOM_LEVELS = [0, 0.5, 1, 2] as const;
export function encodeCustom4(v: readonly number[]): number {
  const v0 = v[0] ?? 0;
  const q = v0 < 0.25 ? 0 : v0 < 0.75 ? 1 : v0 < 1.5 ? 2 : 3;
  return q | ((v[1] ?? 0) > 0.5 ? 4 : 0) | ((v[2] ?? 0) > 0.5 ? 8 : 0);
}
export function decodeCustom4(b: number): [number, number, number] {
  return [CUSTOM_LEVELS[b & 3]!, (b >> 2) & 1, (b >> 3) & 1];
}

// ------------------------------------------------------------------------------------ tight cells (v3.3 ship)

/** A cell rectangle in the atlas: origin x, y (texels, GL rows bottom-up), size w, h, and the feet anchor ax, ay
 *  inside it (whole texels: the feet sit on a texel corner). Flat: 6 numbers per cell. */
export const RECT_STRIDE = 6;

/**
 * The tight cell of a drawing seen from one facing: `minX..maxX` / `minY..maxY` = its screen-plane extent (m, camera
 * right / up from the feet), `texel` m, `pad` texels of margin. Returns w, h, ax, ay (whole texels).
 */
export function tightCell(minX: number, maxX: number, minY: number, maxY: number, texel: number, pad = 2): { w: number; h: number; ax: number; ay: number } {
  const t = Math.max(1e-4, texel);
  const l = Math.max(0, Math.ceil(-minX / t)) + pad;
  const r = Math.max(0, Math.ceil(maxX / t)) + pad;
  const b = Math.max(0, Math.ceil(-minY / t)) + pad;
  const u = Math.max(0, Math.ceil(maxY / t)) + pad;
  return { w: l + r, h: b + u, ax: l, ay: b };
}

/**
 * Shelf-pack rectangles (tallest first) into an atlas at most `maxSize` wide / high, about square. Returns the atlas
 * size and each rectangle's origin (input order). Throws when they do not fit.
 */
export function packShelves(sizes: readonly { w: number; h: number }[], maxSize = 4096): { width: number; height: number; at: { x: number; y: number }[] } {
  const area = sizes.reduce((a, s) => a + s.w * s.h, 0);
  const widest = sizes.reduce((a, s) => Math.max(a, s.w), 1);
  const W = Math.min(maxSize, Math.max(widest, Math.ceil(Math.sqrt(area * 1.15))));
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b]!.h - sizes[a]!.h || sizes[b]!.w - sizes[a]!.w);
  const at: { x: number; y: number }[] = sizes.map(() => ({ x: 0, y: 0 }));
  let x = 0;
  let y = 0;
  let shelf = 0;
  let width = 0;
  for (const i of order) {
    const s = sizes[i]!;
    if (x + s.w > W) {
      y += shelf;
      x = 0;
      shelf = 0;
    }
    at[i] = { x, y };
    x += s.w;
    width = Math.max(width, x);
    shelf = Math.max(shelf, s.h);
  }
  const height = y + shelf;
  if (height > maxSize || width > maxSize) throw new Error(`sprite atlas too large: ${sizes.length} cells, ${width}x${height}`);
  return { width: Math.max(1, width), height: Math.max(1, height), at };
}

// ------------------------------------------------------------------------------------ feet on steps

/** The rig's hip dip limit (character.js _solveLegs: whole texels, at most 0.1 m). */
export const MAX_DIP_M = 0.1;

/**
 * Vertical offset (m) of a baked (flat-ground) sprite whose root stands at ground height `h0` with its two feet over
 * ground heights `hl` / `hr`: like the rig (root at h0, planted feet IK'd onto their own ground, the hips dipping at
 * most MAX_DIP_M toward a foot below), the figure sinks toward the lower foot by at most MAX_DIP_M; when both feet
 * are above the root's ground (the root over a step's riser) it rises onto the lower of them (same limit).
 */
export function stepOffset(h0: number, hl: number, hr: number, maxDip = MAX_DIP_M): number {
  const lo = Math.min(hl, hr);
  if (!Number.isFinite(lo) || !Number.isFinite(h0)) return 0;
  return Math.max(-maxDip, Math.min(maxDip, lo - h0));
}

// ------------------------------------------------------------------------------------ cache keys

/** FNV-1a 32-bit over a string (cache keys: the vendor sources + spec), as 8 hex digits. */
export function fnv1a(s: string, h = 0x811c9dc5): string {
  let x = h >>> 0;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(16).padStart(8, '0');
}

/** The persistent cache key of a sheet: bake format + vendor hash + spec + exact texel / pitch / yaw + clip set. */
export function persistKey(o: { format: number; vendor: string; specId: string; texel: number; pitch: number; yaw: number; clips: readonly string[] }): string {
  return `v${o.format}|${o.vendor}|${o.specId}|${o.texel.toFixed(6)}|${o.pitch.toFixed(4)}|${o.yaw.toFixed(4)}|${[...o.clips].sort().join(',')}`;
}
