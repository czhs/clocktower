// v3 perf (classic): ellipses, discs and pie slices for Phaser Graphics WITHOUT paths.
//
// Phaser 3.90's GraphicsWebGLRenderer replays the command buffer on EVERY rendered frame, so a filled
// path is re-tessellated (an `arc` = 100+ freshly allocated Points, iterStep 0.01) and earcut runs
// again each frame, even when the Graphics was not redrawn (see roundRect.ts). `fillTriangle` batches
// directly (FILL_TRIANGLE -> batchFillTriangle: no path, no earcut, no allocation).
//
// Each helper emits the SAME polygon Phaser would fill, vertex for vertex, as a fan of triangles from
// a point the polygon is star-shaped around (the ellipse / disc centre, or the slice's apex). A fan of
// a star-shaped polygon covers exactly the polygon, and GPU rasterisation of shared triangle edges is
// watertight (each pixel centre belongs to exactly one triangle), so translucent fills blend once and
// the pixels are the same as the earcut triangulation's.
import type * as Phaser from 'phaser';

type Tri = Pick<Phaser.GameObjects.Graphics, 'fillTriangle'>;

const PI2 = Math.PI * 2;
/** Phaser's arc tessellation step (GraphicsWebGLRenderer `iterStep`). */
const ITER_STEP = 0.01;

// Graphics.fillEllipse default smoothness 32 = Ellipse.getPoints(32): angle_i = FromPercent(i / 32, 0, PI2).
const ELLIPSE_N = 32;
const E_COS = Float64Array.from({ length: ELLIPSE_N + 1 }, (_, i) => Math.cos(PI2 * ((i % ELLIPSE_N) / ELLIPSE_N)));
const E_SIN = Float64Array.from({ length: ELLIPSE_N + 1 }, (_, i) => Math.sin(PI2 * ((i % ELLIPSE_N) / ELLIPSE_N)));

/** Same pixels as `g.fillEllipse(x, y, w, h)` (default smoothness; fill style set by the caller). */
export function fillEllipseFan(g: Tri, x: number, y: number, w: number, h: number): void {
  const hw = w / 2;
  const hh = h / 2;
  let px = x + hw * E_COS[0]!;
  let py = y + hh * E_SIN[0]!;
  for (let i = 1; i <= ELLIPSE_N; i++) {
    const nx = x + hw * E_COS[i]!;
    const ny = y + hh * E_SIN[i]!;
    g.fillTriangle(x, y, px, py, nx, ny);
    px = nx;
    py = ny;
  }
}

/**
 * The points GraphicsWebGLRenderer generates for a clockwise `ARC` command, flattened [x0, y0, x1, y1, …].
 * `pathOpen`: a MOVE_TO already started the path (slice), so the loop starts at iteration 0; otherwise
 * (beginPath + arc, e.g. fillCircle) the arc's start point opens the path and the loop starts at one step.
 */
export function arcPoints(x: number, y: number, radius: number, startAngle: number, endAngle: number, pathOpen: boolean): number[] {
  let sweep = endAngle - startAngle;
  if (sweep > PI2) sweep = PI2;
  else if (sweep < 0) sweep = PI2 + (sweep % PI2);
  const out: number[] = [];
  let iteration = 0;
  if (!pathOpen) {
    out.push(x + Math.cos(startAngle) * radius, y + Math.sin(startAngle) * radius);
    iteration += ITER_STEP;
  }
  while (iteration < 1) {
    const ta = sweep * iteration + startAngle;
    out.push(x + Math.cos(ta) * radius, y + Math.sin(ta) * radius);
    iteration += ITER_STEP;
  }
  const ta = sweep + startAngle;
  out.push(x + Math.cos(ta) * radius, y + Math.sin(ta) * radius);
  return out;
}

function fan(g: Tri, cx: number, cy: number, pts: readonly number[]): void {
  for (let i = 2; i + 1 < pts.length; i += 2) g.fillTriangle(cx, cy, pts[i - 2]!, pts[i - 1]!, pts[i]!, pts[i + 1]!);
}

/** Same pixels as `g.slice(x, y, radius, start, end, false); g.fillPath()` (clockwise). */
export function fillSliceFan(g: Tri, x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
  // Phaser's polygon: apex, the arc, apex again (CLOSE_PATH): the apex-to-arc edges are fan edges.
  fan(g, x, y, arcPoints(x, y, radius, startAngle, endAngle, true));
}

/** Same pixels as `g.fillCircle(x, y, radius)`. */
export function fillCircleFan(g: Tri, x: number, y: number, radius: number): void {
  // Phaser's polygon is the closed 101-gon of the arc (first and last point coincide); it is convex,
  // so a fan from the centre covers it exactly.
  fan(g, x, y, arcPoints(x, y, radius, 0, PI2, false));
}
