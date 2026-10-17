// v3 WP0 (v3-lead). chooseRenderer decision table (docs/v3/INTEGRATION.md §1.2): all 9 rows in order,
// ct.debug.v3force skipping rows 3-8, the starting tier, and the boot guard feeding row 4.
import { describe, expect, it } from 'vitest';
import { bootGuardState } from '../../src/game3d/bootGuard';
import { markBooting } from '../../src/game3d/bootMark';
import { AUTO_FALLBACK_KEY, browserEnv, chooseRenderer, GRAPHICS_KEY, mayUseV3, parseGraphicsPref, startingTier, type SelectEnv } from '../../src/game3d/select';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const GOOD_GPU = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)';

function env(over: Partial<SelectEnv> = {}, gpu: string | null = GOOD_GPU, caveatGpu: string | null = gpu): SelectEnv & { probes: boolean[] } {
  const probes: boolean[] = [];
  return {
    world: 'v3',
    pref: 'auto',
    force: false,
    probe: (caveat) => {
      probes.push(caveat);
      const r = caveat ? caveatGpu : gpu;
      return r === null ? null : { renderer: r };
    },
    bootGuard: { leftover: false, unclean: 0, blocked: false },
    autoFallbackAt: null,
    now: NOW,
    coarsePointer: false,
    shortSide: 1080,
    fxLow: false,
    ...over,
    probes,
  };
}

describe('chooseRenderer', () => {
  it('row 1: a v2 world is always Classic (even forced, even pref v3)', () => {
    for (const w of ['v2', undefined] as const) {
      expect(chooseRenderer(env({ world: w }))).toMatchObject({ renderer: 'classic', row: 1, reason: 'world-v2' });
      expect(chooseRenderer(env({ world: w, force: true, pref: 'v3' }))).toMatchObject({ renderer: 'classic', row: 1 });
    }
  });

  it('row 2: v3force skips rows 3-8 and probes WITHOUT the caveat flag; only a missing webgl2 fails it', () => {
    const e = env({ force: true, pref: 'classic', bootGuard: { leftover: true, unclean: 3, blocked: true }, autoFallbackAt: new Date(NOW - 1000).toISOString(), coarsePointer: true, shortSide: 390 }, 'Google SwiftShader', null);
    const c = chooseRenderer(e);
    expect(c).toMatchObject({ renderer: 'v3', row: 2, reason: 'forced', gpu: 'Google SwiftShader' });
    expect(e.probes).toEqual([false]);
    expect(chooseRenderer(env({ force: true }, null))).toMatchObject({ renderer: 'classic', row: 2, reason: 'forced-no-webgl2' });
    // the tier still follows row 9 (fx low -> low)
    expect(chooseRenderer(env({ force: true, fxLow: true })).tier).toBe('low');
  });

  it('row 3: pref classic', () => {
    const e = env({ pref: 'classic' });
    expect(chooseRenderer(e)).toMatchObject({ renderer: 'classic', row: 3 });
    expect(e.probes).toEqual([]); // no GPU probe for an explicit Classic
  });

  it('row 4: the boot guard wins even over an explicit v3', () => {
    for (const pref of ['auto', 'v3'] as const) expect(chooseRenderer(env({ pref, bootGuard: { leftover: true, unclean: 1, blocked: true } }))).toMatchObject({ renderer: 'classic', row: 4, reason: 'boot-guard' });
  });

  it('row 5: no webgl2 with failIfMajorPerformanceCaveat', () => {
    const e = env({}, GOOD_GPU, null);
    expect(chooseRenderer(e)).toMatchObject({ renderer: 'classic', row: 5, reason: 'no-webgl2' });
    expect(e.probes).toEqual([true]);
  });

  it.each(['Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver (Software)'])('row 6: software GL %s -> Classic', (gpu) => {
    expect(chooseRenderer(env({ pref: 'v3' }, gpu))).toMatchObject({ renderer: 'classic', row: 6, reason: 'software-gl' });
  });

  it('row 7: an auto-fallback within 7 days keeps Auto on Classic; older memos or an explicit v3 do not', () => {
    const day = 86_400_000;
    expect(chooseRenderer(env({ autoFallbackAt: new Date(NOW - 6 * day).toISOString() }))).toMatchObject({ renderer: 'classic', row: 7, reason: 'auto-fallback' });
    expect(chooseRenderer(env({ autoFallbackAt: new Date(NOW - 8 * day).toISOString() }))).toMatchObject({ renderer: 'v3', row: 9 });
    expect(chooseRenderer(env({ pref: 'v3', autoFallbackAt: new Date(NOW - day).toISOString() }))).toMatchObject({ renderer: 'v3', row: 9 });
    expect(chooseRenderer(env({ autoFallbackAt: 'garbage' }))).toMatchObject({ renderer: 'v3' });
  });

  it('row 8: phones under Auto get Classic; an explicit v3 runs on a phone at the low tier', () => {
    const phone = { coarsePointer: true, shortSide: 390 };
    expect(chooseRenderer(env(phone))).toMatchObject({ renderer: 'classic', row: 8, reason: 'phone' });
    expect(chooseRenderer(env({ ...phone, pref: 'v3' }))).toMatchObject({ renderer: 'v3', row: 9, tier: 'low' });
    // a tablet (coarse, larger) is not a phone: v3 at the low tier
    expect(chooseRenderer(env({ coarsePointer: true, shortSide: 768 }))).toMatchObject({ renderer: 'v3', tier: 'low' });
  });

  it('row 9: starting tier', () => {
    expect(chooseRenderer(env())).toMatchObject({ renderer: 'v3', row: 9, reason: 'ok', tier: 'high', gpu: GOOD_GPU });
    expect(chooseRenderer(env({ fxLow: true })).tier).toBe('low');
    for (const g of ['ANGLE (Intel, Intel(R) UHD Graphics 620)', 'Mali-G78', 'Adreno (TM) 650', 'Apple GPU', 'PowerVR Rogue', 'Intel Iris OpenGL Engine'])
      expect(chooseRenderer(env({}, g)).tier, g).toBe('low');
    expect(startingTier({ fxLow: false, coarsePointer: false }, null)).toBe('high');
  });

  it('parses the pref leniently', () => {
    expect(parseGraphicsPref(' V3 ')).toBe('v3');
    expect(parseGraphicsPref('classic')).toBe('classic');
    expect(parseGraphicsPref('nope')).toBe('auto');
    expect(parseGraphicsPref(null)).toBe('auto');
  });
});

describe('browserEnv / mayUseV3 (storage side)', () => {
  const mem = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  it('reads pref, force, memo and the boot guard from storage', () => {
    const s = mem({ [GRAPHICS_KEY]: 'v3', 'ct.debug.v3force': '1', [AUTO_FALLBACK_KEY]: '2026-10-16T00:00:00.000Z', 'ct.fxQuality': 'low' });
    markBooting(Date.now(), s);
    const e = browserEnv('v3', s);
    expect(e).toMatchObject({ world: 'v3', pref: 'v3', force: true, autoFallbackAt: '2026-10-16T00:00:00.000Z', fxLow: true });
    expect(e.bootGuard.blocked).toBe(true);
    expect(bootGuardState(Date.now(), s).leftover).toBe(true);
  });
  it('mayUseV3: forced yes, pref classic no, boot guard no (no document: the probe finds no webgl2)', () => {
    expect(mayUseV3(mem({ 'ct.debug.v3force': '1' }))).toBe(true);
    expect(mayUseV3(mem({ [GRAPHICS_KEY]: 'classic' }))).toBe(false);
    const s = mem();
    markBooting(Date.now(), s);
    expect(mayUseV3(s)).toBe(false);
    expect(mayUseV3(mem())).toBe(false); // node: no canvas -> no webgl2
  });
});
