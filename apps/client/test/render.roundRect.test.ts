import { describe, expect, it } from 'vitest';
import { fillDiscBands, fillRoundRectBands, MAX_CORNER_BANDS, roundRectRows } from '../src/game/render/roundRect';

const area = (bands: readonly (readonly number[])[]) => bands.reduce((a, b) => a + b[2]! * b[3]!, 0);

describe('roundRectRows (v2.4: rounded rects without per-frame earcut)', () => {
  it('bands never overlap vertically and cover exactly [y, y + h]', () => {
    for (const [w, h, r, step] of [
      [40, 12, 5, 0.25],
      [40, 12, 6, 0.5],
      [9, 9, 4.5, 0.5],
      [30, 7.3, 3.1, 0.33],
      [100, 20, 0, 1],
    ] as const) {
      const b = roundRectRows(3, 7, w, h, r, step);
      let y = 7;
      for (const band of b) {
        expect(band[1]).toBeCloseTo(y, 9);
        y = band[1] + band[3];
      }
      expect(y).toBeCloseTo(7 + h, 9);
    }
  });

  it('is symmetric, stays inside the box and approximates the exact area', () => {
    const [x, y, w, h, r] = [10, 20, 40, 12, 5];
    const b = roundRectRows(x, y, w, h, r, 0.1);
    for (const band of b) {
      expect(band[0]).toBeGreaterThanOrEqual(x - 1e-9);
      expect(band[0] + band[2]).toBeLessThanOrEqual(x + w + 1e-9);
      expect(band[0] - x).toBeCloseTo(x + w - (band[0] + band[2]), 9);
    }
    const exact = w * h - (4 - Math.PI) * r * r;
    expect(Math.abs(area(b) - exact) / exact).toBeLessThan(0.01);
    // top and bottom bands mirror each other
    expect(b[0]![2]).toBeCloseTo(b.at(-1)![2], 9);
  });

  it('a square with r = side / 2 is a disc (area ≈ π r²)', () => {
    const b = roundRectRows(0, 0, 9, 9, 4.5, 0.05);
    expect(Math.abs(area(b) - Math.PI * 4.5 * 4.5) / (Math.PI * 4.5 * 4.5)).toBeLessThan(0.02);
  });

  it('clamps r, ignores empty boxes and bounds the band count', () => {
    expect(roundRectRows(0, 0, 0, 10, 2, 1)).toEqual([]);
    expect(roundRectRows(0, 0, 10, -1, 2, 1)).toEqual([]);
    expect(roundRectRows(0, 0, 10, 4, 0, 1)).toEqual([[0, 0, 10, 4]]);
    const huge = roundRectRows(0, 0, 400, 200, 1000, 0.001);
    expect(huge.length).toBeLessThanOrEqual(2 * MAX_CORNER_BANDS + 1);
    const bad = roundRectRows(0, 0, 40, 12, 5, Number.NaN);
    expect(bad.length).toBeGreaterThan(1);
  });

  it('fill helpers only call fillRect (no paths)', () => {
    const calls: number[][] = [];
    const g = { fillRect: (...a: number[]) => calls.push(a) };
    fillRoundRectBands(g, 0, 0, 30, 10, 4, 0.5);
    const n = calls.length;
    expect(n).toBeGreaterThan(3);
    fillDiscBands(g, 5, 5, 4.5, 0.5);
    expect(calls.length).toBeGreaterThan(n);
    for (const c of calls) expect(c).toHaveLength(4);
  });
});
