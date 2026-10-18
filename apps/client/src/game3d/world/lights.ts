// v3 WP3 (v3-stage). Carried lights from the CONSTANT light pool (docs/v3/INTEGRATION.md §3 "Carried
// lanterns"): the scene's PointLight count must never change (every lit material would recompile), so the
// stage creates a fixed reserve of PointLights before the shader warm-up (intensity 0, parked below the
// ground) and lends them out. The town's own pool (vendor time.js createTime) gets the tier's budget minus
// this reserve, so the total stays 12 (high) / 8 (low).
//
//   borrowLight(anchor, opts?) -> { release() } | null      null when every reserve light is lent out
//   anchor(): world point in METRES ({x, y, z}, e.g. a hand bone's world position) or null (= dark this frame)
//
// Intensity follows the darkness of the hour (no lantern pools at noon) unless `opts.always`.
import * as THREE from 'three';

export interface LightAnchor {
  x: number;
  y: number;
  z: number;
}
export type LightAnchorFn = () => LightAnchor | null;

export interface BorrowOptions {
  color?: THREE.ColorRepresentation;
  /** Peak intensity (default 1.4, the vendor's lantern anchors). */
  intensity?: number;
  /** Reach (m, default 3.5). */
  distance?: number;
  /** Light by day too (default false: scaled by the hour's darkness). */
  always?: boolean;
}

export interface BorrowedLight {
  release(): void;
}

export interface LightReserve {
  /** Lend one light; null when none is free. */
  borrow(anchor: LightAnchorFn, opts?: BorrowOptions): BorrowedLight | null;
  /** Per frame (before the render): position + intensity of the lent lights. `dark` 0..1. */
  update(dark: number, t: number): void;
  readonly size: number;
  readonly lent: number;
  dispose(): void;
}

/** Reserve size per tier: the lantern-carrying cast member + the Storyteller at night (§3). */
export const RESERVE = { high: 2, low: 2, cpu: 2 } as const;
/** The tier's total point-light budget (vendor time.js / town.js installLights). */
// 'cpu' keeps the low pool (same game logic: borrow / aim / dim); vendor/cpuTier.ts keeps every PointLight out of the
// render (light layer), so its programs compile with 0 point lights.
export const LIGHT_BUDGET = { high: 12, low: 8, cpu: 8 } as const;

const PARK_Y = -50;

export function createLightReserve(scene: THREE.Scene, n: number): LightReserve {
  const group = new THREE.Group();
  group.name = 'ct-carried-lights';
  scene.add(group);
  const slots = Array.from({ length: n }, () => {
    const light = new THREE.PointLight(0xffc46b, 0, 3.5, 1.5);
    light.castShadow = false;
    light.name = 'ct-carried-light';
    light.position.set(0, PARK_Y, 0);
    group.add(light);
    return { light, anchor: null as LightAnchorFn | null, opts: null as Required<Omit<BorrowOptions, 'color'>> | null, token: 0 };
  });
  let lent = 0;
  const park = (s: (typeof slots)[number]) => {
    s.light.intensity = 0;
    s.light.position.set(0, PARK_Y, 0);
  };
  return {
    size: n,
    get lent() {
      return lent;
    },
    borrow(anchor, opts = {}) {
      const s = slots.find((x) => !x.anchor);
      if (!s) return null;
      s.anchor = anchor;
      s.opts = { intensity: opts.intensity ?? 1.4, distance: opts.distance ?? 3.5, always: !!opts.always };
      s.light.color.set(opts.color ?? 0xffc46b);
      s.light.distance = s.opts.distance;
      const token = ++s.token;
      lent++;
      return {
        release() {
          if (s.token !== token || !s.anchor) return;
          s.anchor = null;
          s.opts = null;
          lent--;
          park(s);
        },
      };
    },
    update(dark, t) {
      for (const s of slots) {
        if (!s.anchor || !s.opts) continue;
        const p = s.anchor();
        if (!p) {
          park(s);
          continue;
        }
        s.light.position.set(p.x, p.y, p.z);
        // the vendor's stepped 8 fps lantern flicker (installLights), so a carried flame reads like the town's
        const k = Math.floor(t * 8 + s.token * 3.7);
        const h = (((Math.sin(k * 12.9898) * 43758.5453) % 1) + 1) % 1;
        const f = h < 0.25 ? 0.8 : h < 0.5 ? 0.9 : h < 0.75 ? 0.96 : 1;
        s.light.intensity = s.opts.intensity * f * (s.opts.always ? 1 : dark);
      }
    },
    dispose() {
      for (const s of slots) s.anchor = null;
      lent = 0;
      group.removeFromParent();
    },
  };
}

/** A pool light this close (m, on x and z) to a boarded cottage's light anchor is that anchor's (time.js hugs ≤ 0.39 m). */
export const BOARDED_LIGHT_M = 0.5;

/**
 * Boarded cottages keep their lantern pools dark (vendor createTime's lit-in-order map does not know them): after each
 * `time.update`, zero every lit pool light within `r` m (x and z) of a boarded anchor. Only intensities change: the
 * light count and positions stay. Returns how many were zeroed.
 */
export function dimNearAnchors(pool: readonly THREE.PointLight[], anchors: readonly { x: number; z: number }[], r = BOARDED_LIGHT_M): number {
  if (!anchors.length) return 0;
  let n = 0;
  for (const l of pool) {
    if (l.intensity <= 0) continue;
    for (const a of anchors)
      if (Math.abs(l.position.x - a.x) < r && Math.abs(l.position.z - a.z) < r) {
        l.intensity = 0;
        n++;
        break;
      }
  }
  return n;
}
