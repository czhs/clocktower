// v3.3 sprites: atlas math, facing selection, drawing selection, the per-texel encodings (sprites/atlas.ts), the
// timelines / tight cells / feet-on-steps / cache keys of the ship version, the slice runner (runner.ts), the
// shadow proxy clustering (proxy.ts), the bake clip set and the tier default (layer.ts spritesDefault).
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
  compressSteps,
  customVaryings,
  decodeCustom4,
  DEPTH_RANGE,
  encodeCustom4,
  fnv1a,
  packShelves,
  persistKey,
  stepOffset,
  tightCell,
  timelineCell,
  timelineKey,
  MAX_DIP_M,
} from '../../src/game3d/avatars/sprites/atlas';
import { createSliceRunner, type SliceGen } from '../../src/game3d/avatars/sprites/runner';
import { clusterProxy, runToEnd } from '../../src/game3d/avatars/sprites/proxy';
import { clipSetOf, drawingAlias } from '../../src/game3d/avatars/sprites/bake';
import { spritesDefault } from '../../src/game3d/avatars/layer';

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
      expect(Math.abs(decodeDepth(h, l) - dz)).toBeLessThan(DEPTH_RANGE / 4095);
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

describe('v3.3 ship: timelines', () => {
  it('a loop wraps, a one-shot holds its last drawing', () => {
    const keys = [0, 0.2, 0.5];
    expect(timelineKey(0.1, keys, 1, true)).toBe(0);
    expect(timelineKey(0.6, keys, 1, true)).toBe(2);
    expect(timelineKey(1.1, keys, 1, true)).toBe(0);
    expect(timelineKey(1.1, keys, 1, false)).toBe(2);
    expect(timelineKey(-1, keys, 1, false)).toBe(0);
    expect(timelineCell({ keys, cells: [8, 16, 24], length: 1, loop: false }, 5)).toBe(24);
    expect(timelineKey(3, [], 1, true)).toBe(0);
  });
  it('compressSteps keys every change of drawing', () => {
    const c = compressSteps(['a', 'a', 'b', 'b', 'b', 'a'], 0.1);
    expect(c.keys).toEqual([0, 0.2, 0.5]);
    expect(c.first).toEqual([0, 2, 5]);
  });
});

describe('v3.3 ship: spec varyings in plane A', () => {
  it('parses the float varyings of a spec vertexHead', () => {
    expect(customVaryings('flat varying float vGhost; flat varying float vGhostHalo;')).toEqual(['vGhost', 'vGhostHalo']);
    expect(customVaryings('flat varying float vMothGhost; flat varying float vMothHalo; flat varying float vMothLamp;', 3)).toEqual(['vMothGhost', 'vMothHalo', 'vMothLamp']);
    expect(customVaryings('varying highp float vWispGhost;')).toEqual(['vWispGhost']);
    expect(customVaryings(undefined)).toEqual([]);
    expect(customVaryings('varying vec3 vX;')).toEqual([]);
  });
  it('the 4 custom bits keep the vendor ghost levels and flags', () => {
    for (const g of [0, 0.5, 1, 2]) for (const h of [0, 1]) for (const l of [0, 1]) expect(decodeCustom4(encodeCustom4([g, h, l]))).toEqual([g, h, l]);
    expect(encodeCustom4([])).toBe(0);
  });
  it('the 12-bit depth keeps the custom bits apart', () => {
    for (const dz of [-1.9, 0, 0.731, 2.9]) {
      const [b, a] = encodeDepth(dz, 13);
      expect(a & 15).toBe(13);
      expect(Math.abs(decodeDepth(b, a) - dz)).toBeLessThan(DEPTH_RANGE / 4095);
      expect(b).toBeLessThanOrEqual(255);
    }
  });
});

describe('v3.3 ship: tight cells', () => {
  it('a tight cell covers the extent with a margin, the anchor on a whole texel', () => {
    const c = tightCell(-0.3, 0.25, -0.1, 1.4, 0.05, 2);
    expect(c.ax).toBe(6 + 2);
    expect(c.w).toBe(8 + 5 + 2);
    expect(c.ay).toBe(2 + 2);
    expect(c.h).toBe(4 + 28 + 2);
  });
  it('shelf packing: no overlaps, inside the atlas, about square', () => {
    const sizes = Array.from({ length: 200 }, (_, i) => ({ w: 10 + (i % 17), h: 20 + ((i * 7) % 31) }));
    const p = packShelves(sizes);
    for (let i = 0; i < sizes.length; i++) {
      const a = p.at[i]!;
      expect(a.x + sizes[i]!.w).toBeLessThanOrEqual(p.width);
      expect(a.y + sizes[i]!.h).toBeLessThanOrEqual(p.height);
      for (let j = i + 1; j < sizes.length; j++) {
        const b = p.at[j]!;
        const sep = a.x + sizes[i]!.w <= b.x || b.x + sizes[j]!.w <= a.x || a.y + sizes[i]!.h <= b.y || b.y + sizes[j]!.h <= a.y;
        expect(sep).toBe(true);
      }
    }
    const area = sizes.reduce((s, z) => s + z.w * z.h, 0);
    expect(p.width * p.height).toBeLessThan(area * 1.5);
    expect(() => packShelves([{ w: 5000, h: 10 }])).toThrow();
  });
});

describe('v3.3 ship: feet on steps', () => {
  it('flat ground: no offset; a lower foot dips the figure at most MAX_DIP_M; feet above the root raise it', () => {
    expect(stepOffset(1, 1, 1)).toBe(0);
    expect(stepOffset(1, 0.95, 1)).toBeCloseTo(-0.05);
    expect(stepOffset(1, 0.6, 1)).toBeCloseTo(-MAX_DIP_M);
    expect(stepOffset(1, 1.05, 1.2)).toBeCloseTo(0.05);
    expect(stepOffset(1, Number.NaN, 1)).toBe(0);
  });
});

describe('v3.3 ship: cache keys', () => {
  it('fnv1a is stable, persistKey separates every input and ignores the clip order', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    expect(fnv1a('')).toMatch(/^[0-9a-f]{8}$/);
    const k = { format: 3, vendor: 'deadbeef', specId: 'frog', texel: 0.0333333, pitch: 0.5236, yaw: 0, clips: ['idle', 'move', 'die'] };
    expect(persistKey(k)).toBe(persistKey({ ...k, clips: ['die', 'idle', 'move'] }));
    for (const d of [{ format: 4 }, { vendor: 'x' }, { specId: 'fox' }, { texel: 0.034 }, { pitch: 0.4 }, { yaw: 0.78 }, { clips: ['idle'] }]) expect(persistKey({ ...k, ...d })).not.toBe(persistKey(k));
  });
});

describe('v3.3 ship: bake clip set and drawing names', () => {
  it('bakes exactly the clips the game shows for the spec', () => {
    expect(clipSetOf({ clips: { idle: {}, vote: {}, talk: {}, die: {} }, ghost: true }, { talk: 'talk', die: 'die' })).toEqual(['idle', 'move', 'ghostIdle', 'vote', 'talk', 'die']);
    expect(clipSetOf({ clips: { idle: {}, ghost: {}, 'ghost-spent': {} } }, {})).toEqual(['idle', 'move', 'ghost', 'ghost-spent']);
    expect(clipSetOf({ clips: { idle: {} } }, {})).toEqual(['idle', 'move']);
  });
  it('debug names: the vendor drawing name, tag-prefixed for the shared ghost idle', () => {
    expect(drawingAlias('idle|idle:2')).toBe('idle:2');
    expect(drawingAlias('move|run:1')).toBe('run:1');
    expect(drawingAlias('die|die:3')).toBe('die:3');
    expect(drawingAlias('ghostIdle|idle:2')).toBe('ghostIdle|idle:2');
    expect(drawingAlias('vote')).toBe('vote');
  });
});

describe('v3.3 ship: tier default', () => {
  it('sprites at low / cpu, rigs at high; the debug flag and the build flag force either way', () => {
    expect(spritesDefault('low', null)).toBe(true);
    expect(spritesDefault('cpu' as never, null)).toBe(true);
    expect(spritesDefault('high', null)).toBe(false);
    expect(spritesDefault('high', '1')).toBe(true);
    expect(spritesDefault('low', '0')).toBe(false);
    expect(spritesDefault('low', 'yes')).toBe(true);
    expect(spritesDefault('low', '1', '0')).toBe(false);
    expect(spritesDefault('high', null, '1')).toBe(true);
  });
});

describe('v3.3 ship: slice runner', () => {
  it('spends at most the budget per pump (at least one unit), in priority order, one job at a time', () => {
    let now = 0;
    const r = createSliceRunner(() => now);
    const log: string[] = [];
    function* job(name: string, n: number, cost: number): SliceGen<string> {
      for (let i = 0; i < n; i++) {
        now += cost;
        log.push(`${name}${i}`);
        yield;
      }
      return name;
    }
    const pa = r.enqueue(job('a', 3, 2));
    const pb = r.enqueue(job('b', 2, 2), 5);
    expect(r.pending()).toBe(2);
    expect(r.pump(4).units).toBe(2);
    expect(log).toEqual(['b0', 'b1']);
    r.pump(4);
    expect(log.slice(2)).toEqual(['a0', 'a1']);
    while (r.pending()) r.pump(4);
    // a unit bigger than the budget still runs (progress), alone
    now = 0;
    const pc = r.enqueue(job('c', 1, 50), 9);
    expect(r.pump(4).units).toBe(1);
    expect(log.at(-1)).toBe('c0');
    for (let i = 0; i < 5; i++) r.pump(4);
    expect(r.pending()).toBe(0);
    return Promise.all([pa, pb, pc]).then((v) => expect(v).toEqual(['a', 'b', 'c']));
  });
  it('waits for a yielded promise (blocking the queue), sends its value, throws its error into the job', async () => {
    const r = createSliceRunner(() => 0);
    let release: (v: number) => void = () => undefined;
    const got: unknown[] = [];
    function* waits(): SliceGen<number> {
      const v = (yield new Promise<number>((res) => (release = res))) as number;
      got.push(v);
      try {
        yield Promise.reject(new Error('boom'));
      } catch (e) {
        got.push((e as Error).message);
      }
      return v * 2;
    }
    function* other(): SliceGen<string> {
      got.push('other');
      yield;
      return 'o';
    }
    const p1 = r.enqueue(waits());
    const p2 = r.enqueue(other());
    r.pump(10);
    r.pump(10);
    expect(got).toEqual([]);
    release(21);
    await Promise.resolve();
    await Promise.resolve();
    r.pump(10);
    await new Promise((res) => setTimeout(res, 0));
    r.pump(10);
    r.pump(10);
    r.pump(10);
    expect(await p1).toBe(42);
    expect(await p2).toBe('o');
    expect(got).toEqual([21, 'boom', 'other']);
  });
  it('a throwing job rejects and the queue goes on', async () => {
    const r = createSliceRunner(() => 0);
    // eslint-disable-next-line require-yield
    function* bad(): SliceGen<void> {
      throw new Error('bad');
    }
    function* good(): SliceGen<number> {
      yield;
      return 1;
    }
    const pb = r.enqueue(bad());
    const pg = r.enqueue(good());
    r.pump(10);
    r.pump(10);
    await expect(pb).rejects.toThrow('bad');
    expect(await pg).toBe(1);
  });
});

describe('v3.3 ship: shadow proxy clustering', () => {
  it('merges vertices per bone and grid cell, drops degenerate and duplicate triangles', () => {
    // two triangles on bone 0 sharing an edge, plus a sliver collapsing into one cell, plus a triangle on bone 1
    const P = [0, 0, 0, 1, 0, 0, 0, 1, 0, /**/ 1, 0, 0, 1, 1, 0, 0, 1, 0, /**/ 0, 0, 0, 0.001, 0, 0, 0, 0.001, 0, /**/ 0, 0, 0, 1, 0, 0, 0, 1, 0];
    const SI: number[] = [];
    const SW: number[] = [];
    for (let i = 0; i < 12; i++) {
      SI.push(i < 9 ? 0 : 1, 0, 0, 0);
      SW.push(1, 0, 0, 0);
    }
    const m = runToEnd(clusterProxy({ position: P, skinIndex: SI, skinWeight: SW, count: 12, index: null }, 0.1, 2));
    expect(m).not.toBeNull();
    expect(m!.index.length / 3).toBe(3);
    expect(m!.position.length / 3).toBe(7);
    expect([...m!.bone].filter((b) => b === 1).length).toBe(3);
    // the live part only
    const live = runToEnd(clusterProxy({ position: P, skinIndex: SI, skinWeight: SW, count: 6, index: null }, 0.1));
    expect(live!.index.length / 3).toBe(2);
  });
  it('the dominant skin weight picks the bone', () => {
    const m = runToEnd(clusterProxy({ position: [0, 0, 0, 1, 0, 0, 0, 1, 0], skinIndex: [3, 5, 0, 0, 3, 5, 0, 0, 3, 5, 0, 0], skinWeight: [0.2, 0.8, 0, 0, 0.9, 0.1, 0, 0, 0.5, 0.5, 0, 0], count: 3, index: null }, 0.1));
    expect([...m!.bone]).toEqual([5, 3, 3]);
  });
});
