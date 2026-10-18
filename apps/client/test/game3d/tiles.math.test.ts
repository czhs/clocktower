// v3.3 tiles: the pure tile math (game3d/tiles/tileMath.ts).
import { describe, expect, it } from 'vitest';
import { axisFrame, cellBounds, cellCentre, depthShift, depthToF, emod, lightKey, mergeRects, ringBytes, ringFor, slotRect, tileCentre, TileBook, tileSpan, windowRect } from '../../src/game3d/tiles/tileMath';

describe('frame lattice', () => {
  it('pixel centres of the frame land on cell centres for both parities', () => {
    for (const size of [644, 645, 364, 365]) {
      for (const index of [-17, 0, 3, 1000]) {
        const a = axisFrame(index, size);
        expect(Number.isInteger(a.origin)).toBe(true);
        for (const px of [0, 1, size - 1]) {
          // the frame's pixel px centre in texels (PixelCamera: symmetric about the snapped camera)
          const centre = index + px + 0.5 - size / 2;
          expect(cellCentre(a.origin + px, a.parity)).toBeCloseTo(centre, 9);
        }
      }
    }
  });
  it('a tile camera puts its pixel centres on the same lattice', () => {
    const T = 128;
    for (const parity of [0, 1] as const)
      for (const i of [-3, 0, 5]) {
        const c = tileCentre(i, T, parity);
        for (const q of [0, 64, 127]) expect(c - T / 2 + q + 0.5).toBeCloseTo(cellCentre(i * T + q, parity), 9);
      }
  });
  it('tile spans and euclidean modulo', () => {
    expect(tileSpan(0, 128, 128)).toEqual([0, 0]);
    expect(tileSpan(-1, 129, 128)).toEqual([-1, 1]);
    expect(tileSpan(10, 20, 128, 1)).toEqual([-1, 1]);
    expect(emod(-1, 8)).toBe(7);
    expect(emod(17, 8)).toBe(1);
  });
});

describe('ring', () => {
  it('holds every visible tile + a prefetch ring in distinct slots', () => {
    const r = ringFor(644, 364, 128, 1);
    expect(r.NI).toBe(Math.ceil(644 / 128) + 3);
    expect(r.NJ).toBe(Math.ceil(364 / 128) + 3);
    // any window of the frame size maps its tiles to distinct slots
    for (const ox of [-1000, -1, 0, 77, 513]) {
      const [i0, i1] = tileSpan(ox, ox + 644, 128, 1);
      const slots = new Set<number>();
      for (let i = i0; i <= i1; i++) slots.add(slotRect(i, 0, r)[0]);
      expect(slots.size).toBe(i1 - i0 + 1);
    }
  });
  it('is capped and its memory is reported', () => {
    const r = ringFor(5000, 5000, 128, 1, 2048);
    expect(r.NI * r.T).toBeLessThanOrEqual(2048);
    const h = ringFor(644, 364, 128, 1);
    expect(ringBytes(h, 4) / 2 ** 20).toBeLessThan(64);
  });
});

describe('depth re-base', () => {
  it('round-trips a world distance through the bake depth and shifts it into the frame', () => {
    const near = 0.1;
    const far = 340;
    const bakeF = -120;
    const camF = -133.25;
    const PF = -40.5; // P . F
    const dTile = (PF - bakeF - near) / (far - near);
    const dFrame = (PF - camF - near) / (far - near);
    expect(dTile + depthShift(bakeF, camF, near, far)).toBeCloseTo(dFrame, 12);
    expect(depthToF(dTile, bakeF, near, far)).toBeCloseTo(PF, 9);
  });
});

describe('live rects', () => {
  const ax = axisFrame(100, 644);
  const ay = axisFrame(-50, 364);
  it('a cut window maps to a padded, clipped pixel rect around its cells', () => {
    const t = 12 / 360;
    // a window centred on the camera: around the frame centre
    const cx = (100 + 0.0) * t;
    const cy = -50 * t;
    const r = windowRect(cx, cy, 0.45, 0.9, t, ax, ay, 2)!;
    expect(r.x0).toBeLessThan(322);
    expect(r.x1).toBeGreaterThan(322);
    expect(r.x1 - r.x0).toBeGreaterThanOrEqual(Math.ceil((0.9 / t))); // at least the window width
    expect(r.y1 - r.y0).toBeGreaterThanOrEqual(Math.ceil(1.8 / t));
    expect(windowRect(1e4, 0, 1, 1, t, ax, ay)).toBeNull();
  });
  it('merges overlapping rects', () => {
    const m = mergeRects([
      { x0: 0, y0: 0, x1: 10, y1: 10 },
      { x0: 5, y0: 5, x1: 20, y1: 20 },
      { x0: 100, y0: 100, x1: 110, y1: 110 },
    ]);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ x0: 0, y0: 0, x1: 20, y1: 20 });
  });
  it('cell bounds of projected points include a pad', () => {
    const [k0, k1, l0, l1] = cellBounds([{ r: 0, u: 0 }, { r: 1, u: 2 }], 0.5, 0, 0, 1);
    expect(k0).toBeLessThanOrEqual(-1);
    expect(k1).toBeGreaterThanOrEqual(3);
    expect(l0).toBeLessThanOrEqual(-1);
    expect(l1).toBeGreaterThanOrEqual(5);
  });
});

describe('TileBook (invalidation rules)', () => {
  const ring = ringFor(300, 200, 100, 1);
  it('plans missing tiles first, then stale after a relight, prefetch last', () => {
    const b = new TileBook(ring);
    let p = b.plan(0, 0, 300, 200, 1);
    expect(p.missing.length).toBe(p.visible);
    for (const [i, j] of p.missing) b.baked(i, j);
    p = b.plan(0, 0, 300, 200, 1);
    expect(p.missing).toHaveLength(0);
    expect(p.stale).toHaveLength(0);
    expect(p.prefetch.length).toBeGreaterThan(0);
    b.relight();
    p = b.plan(0, 0, 300, 200, 1);
    expect(p.missing).toHaveLength(0);
    expect(p.stale.length).toBe(p.visible);
    expect(b.count().stale).toBe(p.visible);
  });
  it('a pan only needs the newly exposed column', () => {
    const b = new TileBook(ring);
    for (const [i, j] of b.plan(0, 0, 300, 200, 0).missing) b.baked(i, j);
    const p = b.plan(150, 0, 300, 200, 0);
    // cells 150..449 -> tiles 1..4; 1..2 baked, 3 baked (0..299 -> tiles 0..2), 4 new
    expect(p.missing.filter(([, j]) => j === 0).map(([i]) => i)).toEqual([3, 4]);
  });
  it('flush empties everything; invalidateCells drops only overlapping tiles', () => {
    const b = new TileBook(ring);
    for (const [i, j] of b.plan(0, 0, 300, 200, 0).missing) b.baked(i, j);
    const n0 = b.count().valid;
    expect(b.invalidateCells(150, 160, 10, 20)).toBe(1);
    expect(b.get(1, 0)).toBeNull();
    expect(b.count().valid).toBe(n0 - 1);
    b.flush();
    expect(b.count().valid).toBe(0);
  });
  it('a far tile in the same slot evicts the old one', () => {
    const b = new TileBook(ring);
    b.baked(0, 0);
    b.baked(ring.NI, 0);
    expect(b.get(0, 0)).toBeNull();
    expect(b.get(ring.NI, 0)).not.toBeNull();
  });
});

describe('light key', () => {
  it('quantises small noise away and keeps real steps', () => {
    expect(lightKey([0.5, 1])).toBe(lightKey([0.50000001, 1]));
    expect(lightKey([0.5, 1])).not.toBe(lightKey([0.51, 1]));
  });
});
