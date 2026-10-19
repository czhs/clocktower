// v3 perf(stage). The sun shadow-map cadence: every frame at high, every 2nd at low, forced on cuts / room switches.
import { describe, expect, it } from 'vitest';
import { createShadowCadence, CUT_M, SHADOW_EVERY, shadowEveryFor } from '../../src/game3d/world/shadowCadence';

const frame = (o: Partial<{ ready: boolean; location: string; x: number; z: number; viewHeight: number }> = {}) => ({ ready: true, location: 'outdoors', x: 10, z: 20, viewHeight: 12, ...o });

describe('shadow cadence', () => {
  it('tier defaults and the debug override', () => {
    expect(SHADOW_EVERY.high).toBe(1);
    expect(SHADOW_EVERY.low).toBe(2);
    expect(shadowEveryFor('low')).toBe(2);
    expect(shadowEveryFor('high', null)).toBe(1);
    expect(shadowEveryFor('low', '1')).toBe(1);
    expect(shadowEveryFor('high', '3')).toBe(3);
    for (const bad of ['', '0', '9', 'x', '1.5']) expect(shadowEveryFor('low', bad)).toBe(2);
    expect(shadowEveryFor('cpu')).toBe(1); // an unlisted tier: every frame
  });

  it('every = 1 renders every frame', () => {
    const c = createShadowCadence(1);
    for (let i = 0; i < 10; i++) expect(c.step(frame())).toBe(true);
    expect(c.skipped).toBe(0);
  });

  it('every = 2 alternates on a still camera, and always renders the first frame', () => {
    const c = createShadowCadence(2);
    const got = Array.from({ length: 8 }, () => c.step(frame()));
    expect(got).toEqual([true, false, true, false, true, false, true, false]);
    expect(c.rendered).toBe(4);
    expect(c.skipped).toBe(4);
  });

  it('a walking camera (small steps) keeps the cadence', () => {
    const c = createShadowCadence(2);
    const got = Array.from({ length: 6 }, (_, i) => c.step(frame({ x: 10 + i * 0.05 })));
    expect(got).toEqual([true, false, true, false, true, false]);
  });

  it('forced while not ready, on a location change and on a camera cut', () => {
    const c = createShadowCadence(2);
    expect(c.step(frame({ ready: false }))).toBe(true);
    expect(c.step(frame({ ready: false }))).toBe(true);
    expect(c.step(frame())).toBe(false);
    expect(c.step(frame({ location: 'house-3' }))).toBe(true); // into a room
    expect(c.step(frame({ location: 'house-3' }))).toBe(false);
    expect(c.step(frame({ location: 'house-3', x: 10 + CUT_M + 0.5 }))).toBe(true); // target jump
    expect(c.step(frame({ location: 'house-3', x: 10 + CUT_M + 0.5 }))).toBe(false);
    expect(c.step(frame({ location: 'house-3', x: 10 + CUT_M + 0.5, viewHeight: 19 }))).toBe(true); // zoom cut
    expect(c.step(frame({ location: 'outdoors', x: 10 + CUT_M + 0.5, viewHeight: 19 }))).toBe(true); // back out
    expect(c.step(frame({ location: 'outdoors', x: 10 + CUT_M + 0.5, viewHeight: 19 }))).toBe(false);
  });
});
