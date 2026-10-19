// v3 WP0 (v3-lead). The ONLY px <-> metres implementation and the pixel-camera projection maths
// (docs/v3/INTEGRATION.md §1.5, §2.3). Pure numbers: no three.js import, unit tested without WebGL.
//
// Outdoors:  X = x_px / 16, Z = y_px / 16 (y-down px = +Z = south; no flips), Y = ground height.
// Interiors: house i's server band room R_i maps onto the 3D room at originOf(i) by a pure translation
//            (1 m = 16 px), anchored so the doorway centre lands on the doorway tile's centre (§2.3); the
//            clock tower's room (bld:clocktower, band column 6) the same way, anchored on its exit spot.
// Screen:    the pixel camera renders MARGIN texels wider per side, snaps to the texel grid and keeps the
//            sub-texel remainder in camera.offset; the final pass samples s + MARGIN + off. worldToCss
//            reproduces that exactly (a naive project() is off by MARGIN·scale CSS px).
import type { LocationId, TileRect } from '@ct/protocol';

export const PX_PER_M = 16;
/** pixel3d src/core/PixelCamera.js MARGIN (low-res texels rendered beyond each edge). */
export const MARGIN = 2;
/** A tile's feet point inside the tile (m), as the v2 feet rule tileCenterPx (y + 14 of 16 px). */
export const FEET_IN_TILE = { x: 0.5, z: 0.875 } as const;

export interface M3 {
  X: number;
  Y: number;
  Z: number;
}
export interface P2 {
  x: number;
  y: number;
}

/** Outdoor px -> metres (Y = 0; the caller adds the ground height). */
export function pxToM(p: P2): M3 {
  return { X: p.x / PX_PER_M, Y: 0, Z: p.y / PX_PER_M };
}
/** Outdoor metres -> px (Y ignored). */
export function mToPx(m: { X: number; Z: number }): P2 {
  return { x: m.X * PX_PER_M, y: m.Z * PX_PER_M };
}
/** A tile's feet point in metres. */
export function tileFeetM(tx: number, ty: number): { X: number; Z: number } {
  return { X: tx + FEET_IN_TILE.x, Z: ty + FEET_IN_TILE.z };
}
/** Facing -> unit vector on the ground (m): down = +Z, up = −Z, right = +X, left = −X. */
export function facingVector(f: 'down' | 'up' | 'left' | 'right'): { X: number; Z: number } {
  return f === 'down' ? { X: 0, Z: 1 } : f === 'up' ? { X: 0, Z: -1 } : f === 'right' ? { X: 1, Z: 0 } : { X: -1, Z: 0 };
}
/** pixel3d yaw (radians around +Y; 0 faces +Z) of a px-space direction. */
export function yawOfPx(dx: number, dy: number): number {
  return Math.atan2(dx, dy);
}

// ------------------------------------------------------------------------------------ interiors

/** pixel3d src/town/interiors/index.js INTERIOR_ORIGIN / INTERIOR_TIE (vendor baseline; vendorGuard pins them). */
export const INTERIOR_ORIGIN = { x: 200, z: 20, spacing: 30 } as const;
export const INTERIOR_TIE = { x: 0.0047, z: 0.0071 } as const;
/** Interior wall thickness (pixel3d interiors/kit.js Room `t`, default 0.3). */
export const ROOM_T = 0.3;
/** Per house: 3D room floor w × d (m), from interiors/house-<i>.js `export const ROOM` (vendor baseline). */
export const INTERIOR_ROOMS: readonly { w: number; d: number }[] = [
  { w: 6.6, d: 6.6 },
  { w: 8.6, d: 6.2 },
  { w: 9, d: 6.4 },
  { w: 10, d: 6.0 },
  { w: 8.6, d: 6.0 },
  { w: 9, d: 6 },
  { w: 9, d: 6 },
  { w: 7.6, d: 5.6 },
  { w: 8.4, d: 5.6 },
  { w: 9.4, d: 6 },
  { w: 8, d: 5.4 },
  { w: 8, d: 6 },
  { w: 6.4, d: 5.0 },
  { w: 9, d: 6.2 },
  { w: 9, d: 6 },
];
export const HOUSE_COUNT = 15;
/** First interior band column (tiles): town 45 + 2 free columns. */
export const BAND_X0 = 47;
export const BAND_STRIDE_X = 13;
export const BAND_STRIDE_Y = 14;
export const BAND_SIZE = 12;

/** The server band room of house i (tiles), v3 layout rule §2.3. */
export function bandRoom(i: number): TileRect {
  return { x: BAND_X0 + (i % 5) * BAND_STRIDE_X, y: 1 + Math.floor(i / 5) * BAND_STRIDE_Y, w: BAND_SIZE, h: BAND_SIZE };
}
/** The doorway tile of a band room (bottom row, centre column), as v2 paintRoom. */
export function doorwayTile(room: TileRect): P2 {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + room.h - 1 };
}
/** World origin (floor centre) of interior i, as pixel3d originOf(i). */
export function interiorOrigin(i: number): { X: number; Z: number } {
  return { X: INTERIOR_ORIGIN.x + INTERIOR_ORIGIN.spacing * i + INTERIOR_TIE.x, Z: INTERIOR_ORIGIN.z + INTERIOR_TIE.z };
}

export interface InteriorMap {
  house: number;
  room: TileRect;
  /** px point that maps onto the 3D origin (§2.3 A_i). */
  anchorPx: P2;
  originM: { X: number; Z: number };
  toM(p: P2): { X: number; Z: number };
  toPx(m: { X: number; Z: number }): P2;
}

/**
 * The px <-> m translation of house i's interior. `room` = the layout's interior rect (defaults to the
 * §2.3 band rule). The doorway centre (room-local z = RD/2 + RT/2) maps onto the doorway tile's centre.
 */
export function interiorMap(i: number, room: TileRect = bandRoom(i)): InteriorMap {
  const dims = INTERIOR_ROOMS[i];
  if (!dims) throw new Error(`no interior for house ${i}`);
  const D = doorwayTile(room);
  const anchorPx = { x: (D.x + 0.5) * PX_PER_M, y: (D.y + 0.5) * PX_PER_M - (dims.d / 2 + ROOM_T / 2) * PX_PER_M };
  const o = interiorOrigin(i);
  return {
    house: i,
    room,
    anchorPx,
    originM: o,
    toM: (p) => ({ X: o.X + (p.x - anchorPx.x) / PX_PER_M, Z: o.Z + (p.y - anchorPx.y) / PX_PER_M }),
    toPx: (m) => ({ x: anchorPx.x + (m.X - o.X) * PX_PER_M, y: anchorPx.y + (m.Z - o.Z) * PX_PER_M }),
  };
}

/** House index of a `bld:house-<i>` location (null outdoors / for other buildings). */
export function houseOfLocation(loc: LocationId): number | null {
  const m = /^bld:house-(\d+)$/.exec(loc);
  return m ? Number(m[1]) : null;
}

// ------------------------------------------------------------------------------------ the clock tower's room

/** The enterable clock tower's location (v3 world; §2.2 "The clock tower room"). */
export const TOWER_LOCATION = 'bld:clocktower' as LocationId;
/**
 * bld:clocktower (§2.3): the same pure translation as a cottage, anchored on the vendor room's EXIT spot
 * (src/demo/tower-interior.js ORIGIN (650, 20) + exit z 2.5) = the doorway tile's centre px. Equal to
 * `towerRoomV3` of @ct/assets/hollowmere (coords.test pins it), copied so this module stays data-free.
 */
export const TOWER_ROOM = { anchorPx: { x: 1896, y: 200 }, anchorM: { X: 650, Z: 22.5 }, origin: { X: 650, Z: 20 } } as const;

/** Is this location the clock tower's room? */
export function isTowerLocation(loc: LocationId): boolean {
  return loc === TOWER_LOCATION;
}

/** The px <-> m translation of a room location (a cottage or the clock tower); null for other locations. */
export function roomMapOf(loc: LocationId, room?: TileRect): Pick<InteriorMap, 'toM' | 'toPx'> | null {
  if (isTowerLocation(loc)) {
    const a = TOWER_ROOM.anchorPx;
    const m = TOWER_ROOM.anchorM;
    return {
      toM: (p) => ({ X: m.X + (p.x - a.x) / PX_PER_M, Z: m.Z + (p.y - a.y) / PX_PER_M }),
      toPx: (q) => ({ x: a.x + (q.X - m.X) * PX_PER_M, y: a.y + (q.Z - m.Z) * PX_PER_M }),
    };
  }
  const i = houseOfLocation(loc);
  if (i === null || i >= HOUSE_COUNT) return null;
  return interiorMap(i, room);
}

/**
 * px + location -> metres. Outdoors the plain scale; inside house i the interior translation (room =
 * that building's interior rect when known); inside the clock tower its own translation. Other buildings: null.
 */
export function locToM(p: P2, loc: LocationId, room?: TileRect): { X: number; Z: number } | null {
  if (loc === 'outdoors') return { X: p.x / PX_PER_M, Z: p.y / PX_PER_M };
  const map = roomMapOf(loc, room);
  return map ? map.toM(p) : null;
}

// ------------------------------------------------------------------------------------ projection

/** What the projection needs from the engine after this frame's camera.update(). */
export interface ProjectionState {
  /** Low-res render size (texels) without the margin (engine.lowW / lowH). */
  lowW: number;
  lowH: number;
  /** engine.pixelScale (CSS px per texel; the renderer runs at pixel ratio 1). */
  scale: number;
  /** camera.offset: sub-texel remainder in texels, y-up. */
  offset: P2;
  /** The final pass rounds the offset to whole screen px (pipeline.upscale.snapScreen, 'auto' = integer scale). */
  snapScreen: boolean;
  /** engine.height: canvas height in CSS px. */
  height: number;
  /** Canvas client rect origin (page CSS px). */
  rect: { left: number; top: number };
  /** cam.projectionMatrix × cam.matrixWorldInverse, column-major (three's Matrix4.elements). */
  viewProj: ArrayLike<number>;
}

/** The offset exactly as the final-pass shader uses it. */
export function shaderOffset(s: Pick<ProjectionState, 'offset' | 'snapScreen' | 'scale'>): P2 {
  if (!s.snapScreen) return { x: s.offset.x, y: s.offset.y };
  return { x: Math.floor(s.offset.x * s.scale + 0.5) / s.scale, y: Math.floor(s.offset.y * s.scale + 0.5) / s.scale };
}

/** Column-major 4x4 × (x, y, z, 1) -> NDC (after the perspective divide). */
export function projectNdc(m: ArrayLike<number>, X: number, Y: number, Z: number): { x: number; y: number; z: number } {
  const w = m[3]! * X + m[7]! * Y + m[11]! * Z + m[15]!;
  const iw = w === 0 ? 1 : 1 / w;
  return {
    x: (m[0]! * X + m[4]! * Y + m[8]! * Z + m[12]!) * iw,
    y: (m[1]! * X + m[5]! * Y + m[9]! * Z + m[13]!) * iw,
    z: (m[2]! * X + m[6]! * Y + m[10]! * Z + m[14]!) * iw,
  };
}

/** NDC -> page CSS px (§1.5). */
export function ndcToCss(s: ProjectionState, ndc: { x: number; y: number }): P2 {
  const padX = ((ndc.x + 1) / 2) * (s.lowW + 2 * MARGIN);
  const padY = ((ndc.y + 1) / 2) * (s.lowH + 2 * MARGIN);
  const off = shaderOffset(s);
  const sx = padX - MARGIN - off.x;
  const sy = padY - MARGIN - off.y;
  return { x: s.rect.left + sx * s.scale, y: s.rect.top + s.height - sy * s.scale };
}

/** Page CSS px -> NDC (the inverse of ndcToCss). */
export function cssToNdc(s: ProjectionState, cssX: number, cssY: number): P2 {
  const off = shaderOffset(s);
  const sx = (cssX - s.rect.left) / s.scale;
  const sy = (s.height - (cssY - s.rect.top)) / s.scale;
  const padX = sx + MARGIN + off.x;
  const padY = sy + MARGIN + off.y;
  return { x: (padX / (s.lowW + 2 * MARGIN)) * 2 - 1, y: (padY / (s.lowH + 2 * MARGIN)) * 2 - 1 };
}

/** World metres -> page CSS px. */
export function worldToCss(s: ProjectionState, X: number, Y: number, Z: number): P2 {
  return ndcToCss(s, projectNdc(s.viewProj, X, Y, Z));
}

/** Inverse of a column-major 4x4 (null when singular). */
export function invert4(m: ArrayLike<number>): number[] | null {
  const a = Array.from({ length: 16 }, (_, i) => m[i]!);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  const d = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d,
    (a02 * b10 - a01 * b11 - a03 * b09) * d,
    (a31 * b05 - a32 * b04 + a33 * b03) * d,
    (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d,
    (a00 * b11 - a02 * b08 + a03 * b07) * d,
    (a32 * b02 - a30 * b05 - a33 * b01) * d,
    (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d,
    (a01 * b08 - a00 * b10 - a03 * b06) * d,
    (a30 * b04 - a31 * b02 + a33 * b00) * d,
    (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d,
    (a00 * b09 - a01 * b07 + a02 * b06) * d,
    (a31 * b01 - a30 * b03 - a32 * b00) * d,
    (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
}

export interface Ray {
  origin: M3;
  dir: M3;
}

/** The view ray (world metres) through page CSS px (orthographic or perspective camera alike). */
export function cssToRay(s: ProjectionState, cssX: number, cssY: number): Ray | null {
  const inv = invert4(s.viewProj);
  if (!inv) return null;
  const n = cssToNdc(s, cssX, cssY);
  const a = projectNdc(inv, n.x, n.y, -1);
  const b = projectNdc(inv, n.x, n.y, 1);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { origin: { X: a.x, Y: a.y, Z: a.z }, dir: { X: dx / l, Y: dy / l, Z: dz / l } };
}

/** Where the ray meets the horizontal plane Y = y (null if parallel or behind). */
export function rayAtHeight(r: Ray, y: number): { X: number; Z: number } | null {
  if (Math.abs(r.dir.Y) < 1e-9) return null;
  const t = (y - r.origin.Y) / r.dir.Y;
  if (t < 0) return null;
  return { X: r.origin.X + r.dir.X * t, Z: r.origin.Z + r.dir.Z * t };
}

/**
 * Ground pick: intersect Y = heightAt, refined `iterations` times (the ground rolls at the rim; §3 stage 2).
 */
export function rayGround(r: Ray, heightAt: (X: number, Z: number) => number, iterations = 2): { X: number; Y: number; Z: number } | null {
  let y = 0;
  let hit = rayAtHeight(r, y);
  for (let k = 0; hit && k < iterations; k++) {
    y = heightAt(hit.X, hit.Z);
    hit = rayAtHeight(r, y);
  }
  return hit ? { X: hit.X, Y: y, Z: hit.Z } : null;
}

/** pixelScale for a canvas height (§1.3 step 5): max(1, round(h/360)), low tier round(h/300). */
export function pixelScaleFor(heightCss: number, tier: 'low' | 'high'): number {
  return Math.max(1, Math.round(heightCss / (tier === 'low' ? 300 : 360)));
}
