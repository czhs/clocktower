// v3 WP2 (v3-avatars). Placing avatars and reading them back on screen.
//   - pxToMetres: a pose (v2 px + location) -> metres via coords.ts (outdoors, or the house interior map with the
//     layout's own interior rect); null for a location with no 3D room.
//   - fallbackView: a View3d over the engine's camera with coords.ts's §1.5 projection, for when the layer is
//     mounted without WP1's view (the WP0 stub, the avatar smoke page). Only worldToScreen / cssPerPx; the
//     ground pick is WP1's (screenToWorld returns null here).
import type { LocationId, TownLayout } from '@ct/protocol';
import * as THREE from 'three';
import { locToM, PX_PER_M, worldToCss, type ProjectionState } from '../coords';
import type { Px, View3d } from '../contract';

/** The 3D floor height inside interiors (pixel3d interiors stand on y = 0). */
export const INTERIOR_FLOOR_Y = 0;

export function pxToMetres(layout: TownLayout, p: Px, loc: LocationId): { X: number; Z: number } | null {
  if (loc === 'outdoors') return { X: p.x / PX_PER_M, Z: p.y / PX_PER_M };
  const b = layout.buildings.find((x) => `bld:${x.id}` === loc);
  return locToM(p, loc, b?.interior);
}

/** Ground height of a location: the town terrain outdoors, the flat floor indoors. */
export function heightFor(loc: LocationId, heightAt: (X: number, Z: number) => number): (X: number, Z: number) => number {
  return loc === 'outdoors' ? heightAt : () => INTERIOR_FLOOR_Y;
}

interface EngineLike {
  camera: { cam: THREE.Camera & { projectionMatrix: THREE.Matrix4; matrixWorldInverse: THREE.Matrix4 }; offset: { x: number; y: number }; texelWorld: number } | null;
  pipeline: { upscale?: { snapScreen?: boolean | 'auto' } } | null;
  renderer: { domElement: HTMLCanvasElement } | null;
  pixelScale: number;
  lowW: number;
  lowH: number;
  height: number;
}

/**
 * A projection-only View3d. `frame()` must be called once per frame (it invalidates the cached canvas rect, so
 * the page layout is read at most once per frame and only when something projects).
 */
export function fallbackView(engine: unknown, layout: TownLayout, heightAt: () => (X: number, Z: number) => number): View3d & { frame(): void } {
  const e = engine as EngineLike;
  const vp = new THREE.Matrix4();
  const rect = { left: 0, top: 0 };
  let rectAt = -1;
  let frameNo = 0;
  const proj: ProjectionState = { lowW: 1, lowH: 1, scale: 1, offset: { x: 0, y: 0 }, snapScreen: true, height: 1, rect, viewProj: vp.elements };
  const state = (): ProjectionState | null => {
    const cam = e.camera?.cam;
    if (!cam || !e.renderer) return null;
    if (rectAt !== frameNo) {
      rectAt = frameNo;
      const r = e.renderer.domElement.getBoundingClientRect();
      rect.left = r.left;
      rect.top = r.top;
    }
    vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const scale = e.pixelScale;
    const ss = e.pipeline?.upscale?.snapScreen ?? 'auto';
    proj.lowW = e.lowW;
    proj.lowH = e.lowH;
    proj.scale = scale;
    proj.offset.x = e.camera!.offset.x;
    proj.offset.y = e.camera!.offset.y;
    proj.snapScreen = ss === 'auto' ? Math.abs(scale - Math.round(scale)) < 1e-6 : !!ss;
    proj.height = e.height;
    return proj;
  };
  return {
    frame() {
      frameNo++;
    },
    worldToScreen(p, location, heightM = 0) {
      const s = state();
      const m = pxToMetres(layout, p, location);
      if (!s || !m) return null;
      const y = heightFor(location, heightAt())(m.X, m.Z) + heightM;
      return worldToCss(s, m.X, y, m.Z);
    },
    screenToWorld() {
      return null;
    },
    cssPerPx() {
      const c = e.camera;
      if (!c || !c.texelWorld) return 1;
      return e.pixelScale / c.texelWorld / PX_PER_M;
    },
  };
}
