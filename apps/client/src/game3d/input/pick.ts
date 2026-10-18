// v3 WP1 (v3-core). screenToWorld for the 3D town: the two-stage pick of docs/v3/INTEGRATION.md §3 "ST taps".
//
// A ground-plane ray cannot hit buildings: at pitch 30° a click on a cottage roof (ridge ≈ 4.7 m) lands ≈ 8 m
// north, behind the house. So, outdoors:
//   1. the view ray (coords.ts §1.5 inverse) against per-house proxy boxes (oriented boxes, the shape of pixel3d
//      town.js houseBox); the nearest hit means that house: its outdoor door tile centre, location 'outdoors';
//   2. else the ground (Y = heightAt, refined twice) -> px.
// Inside house i: the interior floor plane (Y = INTERIOR_FLOOR_Y) through the §2.3 interior translation -> px
// of the band room. Other buildings (no 3D interior): null.
//
// Pure maths over coords.ts (no three, no DOM): unit tested with hand-built camera states.
import { tileCenterPx, type BuildingDef, type LocationId, type TownLayout } from '@ct/protocol';
import { cssToRay, houseOfLocation, interiorMap, PX_PER_M, rayAtHeight, rayGround, type ProjectionState, type Ray } from '../coords';
import type { Px } from '../contract';

/** The interior floor height (m): pixel3d interiors/kit.js Room floors sit at y = 0 around originOf(i). */
export const INTERIOR_FLOOR_Y = 0;
/** Default proxy height when the drawn town gives none (m; a cottage ridge is ≈ 4.7 m). */
export const DEFAULT_PROXY_TOP = 5;
/** Footprint margin of the default proxies (m), as houseBox's `e`. */
export const DEFAULT_PROXY_MARGIN = 0.35;

/**
 * An oriented box around a placed house (pixel3d src/town/town.js houseBox): centre (X, Z) m, half extents
 * along the house's local axes, y range, yaw `ry` (radians). `id` = the layout building id ('house-<i>').
 */
export interface HouseProxy {
  id: string;
  center: readonly [number, number];
  half: readonly [number, number];
  y: readonly [number, number];
  ry: number;
}

export interface PickResult extends Px {
  location: LocationId;
  /** Set when stage 1 hit a house (x, y = its door tile centre). */
  houseId?: string;
}

/**
 * Entry distance of the ray into an oriented box (null = miss). Same local frame as pixel3d rayHitsBox
 * (L = [dx·c − dz·s, y, dx·s + dz·c]); a ray starting inside enters at t = 0.
 */
export function rayBoxEntry(r: Ray, b: HouseProxy): number | null {
  const c = Math.cos(b.ry);
  const s = Math.sin(b.ry);
  const dx = r.origin.X - b.center[0];
  const dz = r.origin.Z - b.center[1];
  const L = [dx * c - dz * s, r.origin.Y, dx * s + dz * c];
  const F = [r.dir.X * c - r.dir.Z * s, r.dir.Y, r.dir.X * s + r.dir.Z * c].map((v) => Math.sign(v || 1) * Math.max(Math.abs(v), 1e-9));
  const lo = [-b.half[0], b.y[0], -b.half[1]];
  const hi = [b.half[0], b.y[1], b.half[1]];
  let tN = -Infinity;
  let tF = Infinity;
  for (let k = 0; k < 3; k++) {
    const a = (lo[k]! - L[k]!) / F[k]!;
    const e = (hi[k]! - L[k]!) / F[k]!;
    tN = Math.max(tN, Math.min(a, e));
    tF = Math.min(tF, Math.max(a, e));
  }
  if (!(tF > Math.max(tN, 0))) return null;
  return Math.max(tN, 0);
}

/** The nearest proxy the ray passes through. */
export function pickHouse(r: Ray, proxies: readonly HouseProxy[]): { id: string; t: number } | null {
  let best: { id: string; t: number } | null = null;
  for (const b of proxies) {
    const t = rayBoxEntry(r, b);
    if (t !== null && (!best || t < best.t)) best = { id: b.id, t };
  }
  return best;
}

/**
 * Proxies from the layout alone: each building's tile footprint (the AABB of the placed outline, §2.2) plus a
 * margin, axis aligned, DEFAULT_PROXY_TOP high. The drawn town (WP3) may hand in tighter oriented boxes.
 */
export function layoutProxies(layout: TownLayout, top = DEFAULT_PROXY_TOP, margin = DEFAULT_PROXY_MARGIN): HouseProxy[] {
  const ts = layout.tileSize;
  const k = ts / PX_PER_M; // tiles -> metres (1 for 16 px tiles)
  return layout.buildings.map((b) => {
    const f = b.footprint;
    return { id: b.id, center: [(f.x + f.w / 2) * k, (f.y + f.h / 2) * k] as const, half: [(f.w / 2) * k + margin, (f.h / 2) * k + margin] as const, y: [0.03, top] as const, ry: 0 };
  });
}

export interface PickCtx {
  layout: TownLayout;
  /** Ground height (m) outdoors. */
  heightAt(X: number, Z: number): number;
  proxies: readonly HouseProxy[];
  /** The location the camera shows (the viewer's). */
  shown: LocationId;
}

/** The building whose interior is `loc` (null outdoors / unknown). */
export function buildingOf(layout: TownLayout, loc: LocationId): BuildingDef | null {
  if (loc === 'outdoors') return null;
  return layout.buildings.find((b) => `bld:${b.id}` === loc) ?? null;
}

/** Page CSS px -> the world point a tap means (§3 "ST taps"); null when nothing pickable is under it. */
export function pickScreen(proj: ProjectionState, ctx: PickCtx, cssX: number, cssY: number): PickResult | null {
  const ray = cssToRay(proj, cssX, cssY);
  if (!ray) return null;
  return pickRay(ray, ctx);
}

export function pickRay(ray: Ray, ctx: PickCtx): PickResult | null {
  const { layout } = ctx;
  if (ctx.shown !== 'outdoors') {
    const b = buildingOf(layout, ctx.shown);
    const i = houseOfLocation(ctx.shown);
    if (!b || i === null) return null;
    const hit = rayAtHeight(ray, INTERIOR_FLOOR_Y);
    if (!hit) return null;
    let m;
    try {
      m = interiorMap(i, b.interior);
    } catch {
      return null; // no 3D interior for this house index
    }
    const p = m.toPx(hit);
    return { x: p.x, y: p.y, location: ctx.shown };
  }
  const g = rayGround(ray, ctx.heightAt, 2);
  const house = pickHouse(ray, ctx.proxies);
  // a house counts only if the ray meets it before the ground (rolling ground at the rim)
  if (house && (!g || house.t <= rayParam(ray, g))) {
    const b = layout.buildings.find((x) => x.id === house.id);
    if (b) {
      const d = tileCenterPx(layout, b.door);
      return { x: d.x, y: d.y, location: 'outdoors', houseId: b.id };
    }
  }
  if (!g) return null;
  return { x: g.X * PX_PER_M, y: g.Z * PX_PER_M, location: 'outdoors' };
}

/** Ray parameter of a point on the ray (distance along the unit direction). */
function rayParam(r: Ray, p: { X: number; Y: number; Z: number }): number {
  return (p.X - r.origin.X) * r.dir.X + (p.Y - r.origin.Y) * r.dir.Y + (p.Z - r.origin.Z) * r.dir.Z;
}
