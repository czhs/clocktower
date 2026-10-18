// v3.2 perf (fullstack.md lever 3): which town chunk a page prefetches (ui/common/townPrefetch.ts). Node, no DOM:
// no webgl2 here, so select.ts picks Classic for every world (row 5) — the browser-side behaviour (a v3 join loads
// town3d, not Phaser) is checked with a Playwright network log (docs/perf-v3/fullstack.md §10).
import { describe, expect, it } from 'vitest';
import { classicHere, prefetchAllowed } from '../src/ui/common/townPrefetch';

describe('prefetchAllowed', () => {
  it('allows prefetch without Network Information, or on a fast connection', () => {
    expect(prefetchAllowed({})).toBe(true);
    expect(prefetchAllowed(undefined)).toBe(true);
    expect(prefetchAllowed({ connection: { effectiveType: '4g' } })).toBe(true);
    expect(prefetchAllowed({ connection: {} })).toBe(true);
  });
  it('never with Save-Data or a slow effective connection', () => {
    expect(prefetchAllowed({ connection: { saveData: true, effectiveType: '4g' } })).toBe(false);
    for (const t of ['slow-2g', '2g', '3g']) expect(prefetchAllowed({ connection: { effectiveType: t } })).toBe(false);
  });
});

describe('classicHere', () => {
  it('a v2 lobby is always Classic; without webgl2 a v3 lobby is too', () => {
    expect(classicHere('v2')).toBe(true);
    expect(classicHere('v3')).toBe(true);
  });
});
