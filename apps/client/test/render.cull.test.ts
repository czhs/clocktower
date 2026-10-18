// v3 perf (classic): render/cull.ts hides exactly the static sprites whose box lies wholly outside the
// camera view grown by the margin, under any sequence of camera moves (walks, jumps, zoom changes).
import { describe, expect, it } from 'vitest';
import { StaticCuller } from '../src/game/render/cull';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('StaticCuller', () => {
  it('matches a brute-force box test after every move', () => {
    const r = rng(7);
    const margin = 64;
    const c = new StaticCuller(256, margin);
    const items = Array.from({ length: 450 }, () => {
      const o = { visible: true, sets: 0, setVisible(v: boolean) {
        this.visible = v;
        this.sets++;
      } };
      const b = { x: r() * 2000, y: r() * 688, w: 8 + r() * 120, h: 8 + r() * 150 };
      c.add(o, b.x, b.y, b.w, b.h);
      return { o, b };
    });
    expect(c.size).toBe(450);
    let view = { x: 600, y: 200, w: 640, h: 400 };
    for (let step = 0; step < 600; step++) {
      const k = r();
      if (k < 0.8) view = { ...view, x: view.x + (r() - 0.5) * 12, y: view.y + (r() - 0.5) * 12 }; // walking
      else if (k < 0.95) view = { ...view, x: r() * 2200 - 100, y: r() * 800 - 100 }; // teleport / building
      else {
        const z = 0.5 + r() * 2; // resize / zoom
        view = { ...view, w: 390 * z, h: 844 * z * (r() < 0.5 ? 1 : 0.46) };
      }
      c.update(view.x, view.y, view.w, view.h);
      for (const { o, b } of items) {
        const want = b.x + b.w >= view.x - margin && b.x <= view.x + view.w + margin && b.y + b.h >= view.y - margin && b.y <= view.y + view.h + margin;
        expect(o.visible).toBe(want);
      }
    }
  });
  it('a phone-sized view hides most of a wide map; showAll restores everything', () => {
    const c = new StaticCuller();
    const os = Array.from({ length: 100 }, (_, i) => {
      const o = { visible: true, setVisible(v: boolean) {
        this.visible = v;
      } };
      c.add(o, i * 20, 300, 16, 24);
      return o;
    });
    c.update(800, 0, 390, 700);
    const shown = os.filter((o) => o.visible).length;
    expect(shown).toBeGreaterThan(20);
    expect(shown).toBeLessThan(35);
    c.showAll();
    expect(os.every((o) => o.visible)).toBe(true);
  });
});
