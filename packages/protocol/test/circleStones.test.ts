// (v3 WP0) circleSpots with fixed seat stones (TownLayout.circle.stones, the 3D dais' 15 stones):
// seat k of n (ascending) sits on stone round(k·stones/n) % stones; layouts without `stones` are unchanged.
import { describe, expect, it } from 'vitest';
import { townLayout } from '../../assets/src/layout.js';
import { circleSpots, stoneOfSeatIndex, type TownLayout } from '../src/index.js';

// An open plaza (no collision) so the spiral search keeps every ideal spot.
const open: TownLayout = {
  ...townLayout,
  collision: townLayout.collision.map(() => 0),
  circle: { cx: 360, cy: 316, rx: 100, ry: 100, startDeg: 0, sweepDeg: 360, stones: 15 },
};

describe('circle stones', () => {
  it('stoneOfSeatIndex: distinct stones for every n ≤ 15, n = 15 is the identity', () => {
    for (let n = 1; n <= 15; n++) {
      const st = Array.from({ length: n }, (_, k) => stoneOfSeatIndex(k, n, 15));
      expect(new Set(st).size).toBe(n);
      expect(st.every((s) => s >= 0 && s < 15)).toBe(true);
      expect(st[0]).toBe(0);
    }
    expect(Array.from({ length: 15 }, (_, k) => stoneOfSeatIndex(k, 15, 15))).toEqual(Array.from({ length: 15 }, (_, k) => k));
    expect(Array.from({ length: 5 }, (_, k) => stoneOfSeatIndex(k, 5, 15))).toEqual([0, 3, 6, 9, 12]);
  });

  it.each(Array.from({ length: 11 }, (_, i) => i + 5))('n = %i: each seat sits on its stone angle (clockwise from 12 o’clock)', (n) => {
    const seats = Array.from({ length: n }, (_, i) => (i * 7) % 15).sort((a, b) => a - b);
    const spots = circleSpots(open, [...seats].reverse());
    expect(spots.map((s) => s.seat)).toEqual(seats);
    spots.forEach((s, k) => {
      const th = (2 * Math.PI * stoneOfSeatIndex(k, n, 15)) / 15;
      expect(s.x).toBe(Math.round(360 + Math.sin(th) * 100));
      expect(s.y).toBe(Math.round(316 - Math.cos(th) * 100));
    });
  });

  it('no stones: the v2 rule is unchanged (full ring evenly spaced by n)', () => {
    const v2 = { ...open, circle: { ...open.circle!, stones: undefined } };
    const spots = circleSpots(v2, [0, 1, 2, 3]);
    spots.forEach((s, k) => {
      const th = (2 * Math.PI * k) / 4;
      expect(s.x).toBe(Math.round(360 + Math.sin(th) * 100));
      expect(s.y).toBe(Math.round(316 - Math.cos(th) * 100));
    });
  });
});
