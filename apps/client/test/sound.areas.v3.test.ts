// (v3 WP5a, v3-world for world-art) sound/areas.ts follows the lobby's world: in a v3 lobby the ground lookups,
// distance fields (water, forest, square) and fountains come from Hollowmere (townMapV3), cached per world.
import { townMap } from '@ct/assets';
import { townMapV3 } from '@ct/assets/hollowmere';
import { afterEach, describe, expect, it } from 'vitest';
import { ambientMix, groundAt, loadAreaMap, surfaceAt } from '../src/game/sound/areas';
import { ensureLayout } from '../src/net/layout';

const TS = 16;
/** Feet px of tile (tx, ty). */
const feet = (tx: number, ty: number) => [(tx + 0.5) * TS, ty * TS + 14] as const;

afterEach(async () => {
  await ensureLayout('v2');
});

describe('sound areas per world', () => {
  it('ground / surface: the v3 south bay (rows 37+) exists only in Hollowmere', async () => {
    const [x, y] = feet(20, 40);
    expect(groundAt(x, y)).toBe(' '); // v2: beyond the 37-row map
    expect(surfaceAt(x, y)).toBe('cobble');
    await ensureLayout('v3');
    await loadAreaMap('v3');
    expect(townMapV3.ground[40]![20]).toBe(':');
    expect(groundAt(x, y)).toBe(':');
    expect(surfaceAt(x, y)).toBe('grass');
    await ensureLayout('v2');
    expect(groundAt(x, y)).toBe(' '); // back in a v2 lobby: the v2 map again (cached per world)
  });

  it('fountain: the v3 fountain stands 2 tiles west of the v2 one', async () => {
    const v3f = townMapV3.objects.find((o) => o.kind === 'fountain')!;
    const v2f = townMap.objects.find((o) => o.kind === 'fountain')!;
    expect(v3f.x).not.toBe(v2f.x);
    const px = (v3f.x + 1.5) * TS;
    const py = (v3f.y + 0.5) * TS;
    expect(ambientMix('outdoors', px, py, 'day').loops.fountain.level).toBeLessThan(1); // v2: its fountain is elsewhere
    await ensureLayout('v3');
    await loadAreaMap('v3');
    expect(ambientMix('outdoors', px, py, 'day').loops.fountain.level).toBe(1);
  });

  it('forest: the bay is ringed by Hollowmere forest (wind follows the v3 forest field)', async () => {
    const [x, y] = feet(22, 40);
    // v2 clamps the point onto its bottom border row (dense forest, distance 0): full woods
    expect(ambientMix('outdoors', x, y, 'day').loops.wind.level).toBeCloseTo(0.85, 5);
    await ensureLayout('v3');
    await loadAreaMap('v3');
    // v3: the nearest forest tile is the border row 42, 2 tiles south: woods = (1 - 1/7)^2
    const woods = (1 - 1 / 7) ** 2;
    expect(ambientMix('outdoors', x, y, 'day').loops.wind.level).toBeCloseTo(0.5 + 0.35 * woods, 5);
  });

  it('square and water: v3 fields are built from the v3 map (plaza at the centre, no water in town)', async () => {
    await ensureLayout('v3');
    await loadAreaMap('v3');
    const [x, y] = feet(22, 19);
    expect(townMapV3.ground[19]![22]).toBe('o');
    const mix = ambientMix('outdoors', x, y, 'day').loops;
    expect(mix.wind.level).toBeCloseTo(0.35, 5); // 0.5 - 0.15 in the square, no woods nearby
    expect(mix.river.level).toBe(0);
    expect(townMapV3.ground.some((r) => r.includes('~'))).toBe(false);
  });

  it('interiors stay layout-driven in v3 (homes: wind through the walls)', async () => {
    await ensureLayout('v3');
    await loadAreaMap('v3');
    const r = ambientMix('bld:house-3', 0, 0, 'night');
    expect(r.loops.wind.level).toBeCloseTo(0.22, 5);
    expect(r.loops.crickets.level).toBeCloseTo(0.4, 5);
  });
});
