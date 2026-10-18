// v3 WP4: the §7 overlay update rule (game3d/overlay/place.ts): transform-only writes, skipped under
// 0.5 CSS px of movement, visibility culling written only when it flips, counted for the DOM budget.
import { describe, expect, it } from 'vitest';
import { createRate, cull, inView, MOVE_EPS, newPlaceState, newStats, PARK_TRANSFORM, place, setShown, setStyle, setText, type StyleTarget } from '../../src/game3d/overlay/place';

/** A fake element that records every style write. */
function fakeEl() {
  const writes: string[] = [];
  const style = { _t: '', _v: '' };
  const el: StyleTarget & { writes: string[] } = {
    writes,
    style: {
      get transform() {
        return style._t;
      },
      set transform(v: string) {
        writes.push(`transform=${v}`);
        style._t = v;
      },
      get visibility() {
        return style._v;
      },
      set visibility(v: string) {
        writes.push(`visibility=${v}`);
        style._v = v;
      },
    },
  };
  return el;
}

describe('transform batching', () => {
  it('writes a whole-px translate3d on the first place and shows the element', () => {
    const el = fakeEl();
    const st = newPlaceState();
    const stats = newStats();
    expect(place(el, st, 10.4, 20.6, stats)).toBe(true);
    expect(el.writes).toEqual(['transform=translate3d(10px, 21px, 0)', 'visibility=visible']);
    expect(stats).toEqual({ transforms: 1, visibility: 1, content: 0 });
  });

  it('never writes for moves under 0.5 CSS px (in x or y), even when they accumulate', () => {
    const el = fakeEl();
    const st = newPlaceState();
    const stats = newStats();
    place(el, st, 100, 100, stats);
    el.writes.length = 0;
    for (const [x, y] of [
      [100.2, 100],
      [100.4, 100.1],
      [100.49, 99.6],
      [99.7, 100.3],
    ] as const)
      expect(place(el, st, x, y, stats)).toBe(false);
    expect(el.writes).toEqual([]);
    expect(stats.transforms).toBe(1);
    // the reference stays the last WRITTEN position: 0.5 px away from it writes
    expect(place(el, st, 100 + MOVE_EPS, 100, stats)).toBe(true);
    expect(place(el, st, 100.5, 100 - MOVE_EPS, stats)).toBe(true);
    expect(stats.transforms).toBe(3);
  });

  it('writes on every frame of a real pan (>= 0.5 px per frame) and nothing else', () => {
    const el = fakeEl();
    const st = newPlaceState();
    const stats = newStats();
    for (let i = 0; i < 60; i++) place(el, st, 200 + i * 0.8, 50, stats);
    expect(stats.transforms).toBe(60);
    expect(stats.visibility).toBe(1);
    expect(el.writes.every((w) => w.startsWith('transform=translate3d(') || w === 'visibility=visible')).toBe(true);
  });

  it('culls off-screen positions by parking them (one transform write, no visibility flip)', () => {
    const el = fakeEl();
    const st = newPlaceState();
    const stats = newStats();
    const view = { w: 800, h: 600, margin: 50 };
    place(el, st, 100, 100, stats, view);
    place(el, st, -60, 100, stats, view); // off-screen: parked
    place(el, st, -70, 100, stats, view); // still parked: no write
    place(el, st, null, 0, stats, view); // not projectable: no write
    cull(el, st, stats); // no write either
    expect(el.writes).toEqual(['transform=translate3d(100px, 100px, 0)', 'visibility=visible', `transform=${PARK_TRANSFORM}`]);
    place(el, st, 100, 100, stats, view); // back at the very same spot: transform only
    expect(el.writes.slice(3)).toEqual(['transform=translate3d(100px, 100px, 0)']);
    place(el, st, 100.2, 100, stats, view); // tiny move, visible already: nothing
    expect(el.writes).toHaveLength(4);
    expect(stats).toEqual({ transforms: 3, visibility: 1, content: 0 });
    // never shown / hidden on purpose: culling writes nothing, the element stays hidden
    const el2 = fakeEl();
    const st2 = newPlaceState();
    place(el2, st2, -500, 0, stats, view);
    cull(el2, st2, stats);
    setShown(el2, st2, false, stats);
    cull(el2, st2, stats);
    expect(el2.writes).toEqual(['visibility=hidden']);
    expect(inView(NaN, 0, view)).toBe(false);
    expect(inView(850, 650, view)).toBe(true);
    expect(inView(851, 0, view)).toBe(false);
  });

  it('setShown is idempotent', () => {
    const el = fakeEl();
    const st = newPlaceState();
    const stats = newStats();
    setShown(el, st, false, stats);
    setShown(el, st, false, stats);
    setShown(el, st, true, stats);
    expect(el.writes).toEqual(['visibility=hidden', 'visibility=visible']);
    expect(stats.visibility).toBe(2);
  });

  it('rates are per second over the sample window; the budget figure excludes transform writes', () => {
    const stats = newStats();
    const r = createRate(stats, 1000);
    expect(r.sample(0).mutationsPerSec).toBe(0);
    stats.transforms += 30;
    stats.content += 4;
    stats.visibility += 2;
    expect(r.sample(500).mutationsPerSec).toBe(0); // window not over yet
    const s = r.sample(2000);
    expect(s.transformsPerSec).toBe(15);
    expect(s.contentPerSec).toBe(2);
    expect(s.visibilityPerSec).toBe(1);
    expect(s.mutationsPerSec).toBe(3);
    expect(s.domWritesPerSec).toBe(18); // every write, as a MutationObserver(attributes) would count
  });

  it('setStyle / setText write only on change and count every write', () => {
    const stats = newStats();
    const el = { style: {} as Record<string, string>, textContent: '' as string | null };
    expect(setStyle(el, 'color', '#fff', stats)).toBe(true);
    expect(setStyle(el, 'color', '#fff', stats)).toBe(false);
    expect(setStyle(el, 'fontSize', '12px', stats)).toBe(true);
    expect(setText(el, 'a', stats)).toBe(true);
    expect(setText(el, 'a', stats)).toBe(false);
    expect(stats.content).toBe(3);
  });
});
