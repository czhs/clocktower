// v3.3 sprites prototype: atlas math, facing selection, drawing selection and the per-texel encodings
// (apps/client/src/game3d/avatars/sprites/atlas.ts).
import { describe, expect, it } from 'vitest';
import {
  atlasBytes,
  atlasGrid,
  cellFor,
  cellOrigin,
  cycleDrawing,
  decodeB,
  decodeDepth,
  encodeB,
  encodeDepth,
  facingIndex,
  facingYaw,
  farSideOf,
  heldKeyAt,
  stepFacing,
  wrapAngle,
} from '../../src/game3d/avatars/sprites/atlas';

const D = Math.PI / 180;

describe('sprite cells and atlas', () => {
  it('cells are whole texels, even wide, the anchor on a corner, and grow as texels shrink', () => {
    const c = cellFor(0.4, 1.3, 30 * D, 0.04);
    expect(c.w % 2).toBe(0);
    expect(Number.isInteger(c.h) && Number.isInteger(c.below)).toBe(true);
    expect(c.below).toBeGreaterThan(0);
    expect(c.h).toBeGreaterThan(c.below);
    // the figure (1.3 m at 30°: 1.13 m on screen) fits above the anchor
    expect((c.h - c.below) * 0.04).toBeGreaterThan(1.3 * Math.cos(30 * D));
    const fine = cellFor(0.4, 1.3, 30 * D, 0.02);
    expect(fine.w).toBeGreaterThan(c.w * 1.8);
    expect(fine.h).toBeGreaterThan(c.h * 1.8);
  });

  it('a lower pitch shows more height (vote 23° vs 30°)', () => {
    expect(cellFor(0.4, 1.3, 23 * D, 0.04).h).toBeGreaterThanOrEqual(cellFor(0.4, 1.3, 30 * D, 0.04).h);
  });

  it('the grid holds every cell inside the size limit, cells never overlap', () => {
    const cell = { w: 40, h: 46 };
    const g = atlasGrid(8 * 18, cell);
    expect(g.cols * g.rows).toBeGreaterThanOrEqual(144);
    expect(g.width).toBeLessThanOrEqual(4096);
    const seen = new Set<string>();
    for (let i = 0; i < 144; i++) {
      const o = cellOrigin(i, g, cell);
      expect(o.x + cell.w).toBeLessThanOrEqual(g.width);
      expect(o.y + cell.h).toBeLessThanOrEqual(g.height);
      seen.add(`${o.x},${o.y}`);
    }
    expect(seen.size).toBe(144);
    expect(atlasBytes(g)).toBe(g.width * g.height * 8);
    expect(() => atlasGrid(100_000, cell, 1024)).toThrow();
  });
});

describe('sprite facings', () => {
  it('wraps to (-PI, PI]', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.25)).toBeCloseTo(0.25);
  });

  it('8 facings relative to the camera yaw; facingYaw inverts facingIndex', () => {
    for (const cam of [0, 45 * D, -45 * D]) {
      for (let k = 0; k < 8; k++) {
        expect(facingIndex(facingYaw(k, cam), cam)).toBe(k);
        expect(facingIndex(facingYaw(k, cam) + 20 * D, cam)).toBe(k);
        expect(facingIndex(facingYaw(k, cam) - 20 * D, cam)).toBe(k);
      }
    }
    // the vote yaws ±45° use the same 8 drawings: a figure facing south is facing 1 / 7 under them
    expect(facingIndex(0, 45 * D)).toBe(7);
    expect(facingIndex(0, -45 * D)).toBe(1);
  });

  it('steps one 45° facing at a time with hysteresis, the short way round', () => {
    expect(stepFacing(0, 26 * D, 0)).toBe(0); // inside 22.5° + 8°
    expect(stepFacing(0, 32 * D, 0)).toBe(1);
    expect(stepFacing(0, 180 * D, 0)).not.toBe(4); // one step only
    let f = 0;
    const seq: number[] = [];
    for (let i = 0; i < 6 && f !== 4; i++) seq.push((f = stepFacing(f, 179 * D, 0)));
    expect(seq).toEqual([1, 2, 3, 4]);
    expect(stepFacing(1, -90 * D, 0)).toBe(0);
    expect(stepFacing(0, -90 * D, 0)).toBe(7);
  });

  it('far side matches look.js farSide (camera looking north, sun from the east)', () => {
    const fwd = { x: 0, z: -1 };
    const sunE = { x: 1, z: 0 };
    // facing east (yaw +90°): the left axis points north = away from the camera -> left is far
    expect(farSideOf(90 * D, fwd, sunE)).toBe(1);
    expect(farSideOf(-90 * D, fwd, sunE)).toBe(2);
    // facing the camera (south, yaw 0): left axis +X faces the sun -> the right side is far
    expect(farSideOf(0, fwd, sunE)).toBe(2);
    expect(farSideOf(0, fwd, { x: 0, z: 1 })).toBe(0); // sun side-on: nothing forced
    expect(farSideOf(0, fwd, null)).toBe(0);
  });
});

describe('sprite drawings', () => {
  it('locomotion drawing follows the stride phase', () => {
    expect([0, 0.1, 0.17, 0.5, 0.99, 1.0, 1.2].map((p) => cycleDrawing(p, 6))).toEqual([0, 0, 1, 3, 5, 0, 1]);
    expect(cycleDrawing(-0.1, 6)).toBe(5);
    expect(cycleDrawing(3.3, 1)).toBe(0);
  });

  it('held keys of a looping clip', () => {
    const keys = [0, 1.2, 1.4, 2.6];
    expect([0, 1.19, 1.2, 1.5, 2.7, 2.81, 4.1].map((t) => heldKeyAt(t, keys, 2.8))).toEqual([0, 0, 1, 2, 3, 0, 1]);
    expect(heldKeyAt(5, [], 2.8)).toBe(0);
  });
});

describe('sprite texel encodings', () => {
  it('depth round-trips to < 0.1 mm over the range and clamps outside', () => {
    for (const dz of [-1.9, -0.5, 0, 0.0123, 0.7, 2.9]) {
      const [h, l] = encodeDepth(dz);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(256);
      expect(Math.abs(decodeDepth(h, l) - dz)).toBeLessThan(1e-4);
    }
    expect(decodeDepth(...encodeDepth(10))).toBeCloseTo(3, 3);
  });

  it('plane B round-trips slot / side / halo / part id / lift / bind height', () => {
    for (const t of [
      { slot: 0, side: 0 as const, halo: false, part: 0, lift: 0, bindY: 0 },
      { slot: 15, side: 2 as const, halo: true, part: -156, lift: 1, bindY: 1.25 },
      { slot: 7, side: 1 as const, halo: false, part: 156, lift: 0.3, bindY: 0.5 },
      { slot: 3, side: 0 as const, halo: false, part: -79, lift: 0.35, bindY: 0.9 },
    ]) {
      const d = decodeB(...encodeB(t));
      expect(d.slot).toBe(t.slot);
      expect(d.side).toBe(t.side);
      expect(d.halo).toBe(t.halo);
      expect(d.part).toBe(t.part);
      expect(d.lift).toBeCloseTo(t.lift, 2);
      expect(Math.abs(d.bindY - t.bindY)).toBeLessThan(1.25 / 255);
    }
    expect(decodeB(...encodeB({ slot: -1, side: 0, halo: false, part: 0, lift: 0, bindY: 0 })).slot).toBe(-1);
    expect(encodeB({ slot: -1, side: 1, halo: true, part: 5, lift: 1, bindY: 1 })).toEqual([0, 0, 0, 0]);
  });
});
