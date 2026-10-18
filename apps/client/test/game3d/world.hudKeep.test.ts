// v3.1 release (QA C2 HIGH): the vote frame's keep-out boxes from the HUD actually over the canvas (world/hudKeep.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hudKeepOuts, keepKey, mergeCells } from '../../src/game3d/world/hudKeep';

describe('mergeCells', () => {
  it('merges row runs and stacks equal runs into rectangles', () => {
    // 4 x 3: a 2x2 block top-left, a lone cell bottom-right
    const g = [true, true, false, false, true, true, false, false, false, false, false, true];
    const r = mergeCells(g, 4, 3).sort((a, b) => a[0] - b[0]);
    expect(r).toEqual([
      [0, 0, 2, 2],
      [3, 2, 4, 3],
    ]);
  });
  it('an empty grid has no boxes', () => {
    expect(mergeCells(new Array(6).fill(false), 3, 2)).toEqual([]);
  });
});

describe('hudKeepOuts', () => {
  afterEach(() => vi.unstubAllGlobals());
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 128, height: 64 }) } as unknown as HTMLElement;
  const stubDom = (hit: (x: number, y: number) => unknown) => vi.stubGlobal('document', { elementFromPoint: hit });
  const el = (o: { contains?: boolean; toast?: boolean } = {}) => ({ contains: () => !!o.contains, closest: () => (o.toast ? {} : null) });

  it('a panel over the left quarter becomes one low-res box; the canvas, its ancestors and toasts do not count', () => {
    const panel = el();
    const ancestor = el({ contains: true });
    const toast = el({ toast: true });
    stubDom((x, y) => (x < 32 ? panel : y < 32 && x > 96 ? toast : x > 64 ? canvas : ancestor));
    expect(hudKeepOuts(canvas, 2, 32)).toEqual([{ x0: 0, y0: 0, x1: 16, y1: 32 }]);
  });
  it('null without a DOM, for a zero-size canvas, or when the HUD covers most of the canvas', () => {
    vi.stubGlobal('document', undefined);
    expect(hudKeepOuts(canvas, 2)).toBeNull();
    stubDom(() => el());
    expect(hudKeepOuts(canvas, 2, 32)).toBeNull();
    const zero = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) } as unknown as HTMLElement;
    expect(hudKeepOuts(zero, 2)).toBeNull();
  });
  it('keepKey: stable, rounded, "default" for none', () => {
    expect(keepKey(null)).toBe('default');
    expect(keepKey([{ x0: 0.2, y0: 1.6, x1: 10.4, y1: 20 }])).toBe('0,2,10,20');
  });
});
