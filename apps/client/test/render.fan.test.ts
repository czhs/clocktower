// v3 perf (classic): render/fan.ts emits the same polygons as Phaser's fillEllipse / slice / fillCircle,
// as non-overlapping triangle fans (same pixels, no per-render earcut).
import { describe, expect, it } from 'vitest';
import { arcPoints, fillCircleFan, fillEllipseFan, fillSliceFan } from '../src/game/render/fan';

type T = [number, number, number, number, number, number];
const rec = () => {
  const tris: T[] = [];
  return { tris, g: { fillTriangle: (...a: number[]) => (tris.push(a as T), undefined) } as never };
};
const signed = (t: T) => ((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 2;
const shoelace = (p: readonly number[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    a += p[i]! * p[j + 1]! - p[j]! * p[i + 1]!;
  }
  return a / 2;
};
/** Fan triangles never overlap when they all wind the same way around the apex and sum to the polygon. */
const checkFan = (tris: T[], poly: readonly number[]) => {
  const areas = tris.map(signed);
  expect(areas.every((a) => a >= -1e-9)).toBe(true);
  expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(shoelace(poly), 9);
};

describe('fillEllipseFan', () => {
  it('32 triangles from the centre over Ellipse.getPoints(32)', () => {
    const { g, tris } = rec();
    fillEllipseFan(g, 100, 50, 16, 9);
    expect(tris).toHaveLength(32);
    const poly: number[] = [];
    for (let i = 0; i < 32; i++) {
      const a = Math.PI * 2 * (i / 32); // Phaser FromPercent(i / quantity, 0, PI2)
      poly.push(100 + 8 * Math.cos(a), 50 + 4.5 * Math.sin(a));
    }
    tris.forEach((t, i) => {
      expect([t[0], t[1]]).toEqual([100, 50]);
      expect(t[2]).toBeCloseTo(poly[2 * i]!, 12);
      expect(t[3]).toBeCloseTo(poly[2 * i + 1]!, 12);
    });
    checkFan(tris, poly);
  });
});

describe('arc fans', () => {
  it('arcPoints follows the renderer: 0.01 steps + the exact end point; open path starts at iteration 0', () => {
    const open = arcPoints(0, 0, 10, 0, Math.PI, true);
    const fresh = arcPoints(0, 0, 10, 0, Math.PI, false);
    expect(open.length / 2).toBe(fresh.length / 2);
    expect(open.length / 2).toBeGreaterThanOrEqual(101);
    expect(open[0]).toBeCloseTo(10, 12);
    expect(open[open.length - 2]).toBeCloseTo(-10, 12);
    expect(open[open.length - 1]).toBeCloseTo(0, 12);
  });
  it('slice: fan from the apex covers exactly apex + arc, for small, half and > half sweeps', () => {
    const top = -Math.PI / 2;
    for (const frac of [0.01, 0.5, 0.73, 1]) {
      const { g, tris } = rec();
      fillSliceFan(g, 20, 30, 7, top, top + frac * Math.PI * 2);
      const arc = arcPoints(20, 30, 7, top, top + frac * Math.PI * 2, true);
      expect(tris).toHaveLength(arc.length / 2 - 1);
      checkFan(tris, [20, 30, ...arc]);
    }
  });
  it('circle: convex 100-gon from the centre', () => {
    const { g, tris } = rec();
    fillCircleFan(g, 5, 5, 3);
    const arc = arcPoints(5, 5, 3, 0, Math.PI * 2, false);
    checkFan(tris, arc);
    expect(shoelace(arc)).toBeCloseTo(Math.PI * 9, 1);
  });
});
