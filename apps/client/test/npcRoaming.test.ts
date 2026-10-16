import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import { isBlockedPx, locationAt } from '@ct/protocol';
import { createNpcRoamer, NPC_ROAM_RADIUS, stepNpcRoamer } from '../src/game/npcRoaming';
import { nearestFree, segmentClear } from '../src/game/path';

const open = () => true;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('bounded NPC roaming', () => {
  it('interrupts a rest and walks away from a nearby Brianbi', () => {
    const n = createNpcRoamer({ x: 0, y: 0 }, 0);
    n.waitUntil = 60_000;
    const brian = { x: -20, y: 0 };
    const delta = stepNpcRoamer(n, 0.1, 100, [brian], open);
    expect(n.avoiding).toBe(true);
    expect(delta.x).toBeGreaterThan(0);
    expect(dist(n, brian)).toBeGreaterThan(20);
  });

  it('cannot be chased outside its fixed home radius, even over several minutes', () => {
    const n = createNpcRoamer({ x: 100, y: 100 }, 0);
    for (let i = 0; i < 1800; i++) {
      // Brianbi continually follows, trying to push the NPC farther east.
      stepNpcRoamer(n, 0.1, i * 100, [{ x: n.x - 15, y: n.y }], open);
      expect(dist(n, n.home)).toBeLessThanOrEqual(NPC_ROAM_RADIUS + 1e-6);
    }
    expect(n.home).toEqual({ x: 100, y: 100 });
  });

  it('returns toward home after Brianbi leaves, then stays near it while wandering', () => {
    const n = createNpcRoamer({ x: 0, y: 0 }, 0);
    n.x = 44;
    n.avoiding = true;
    stepNpcRoamer(n, 0.1, 100, [], open);
    expect(n.avoiding).toBe(false);
    expect(n.x).toBeLessThan(44);
    for (let i = 2; i < 1200; i++) {
      stepNpcRoamer(n, 0.1, i * 100, [], open);
      expect(dist(n, n.home)).toBeLessThanOrEqual(NPC_ROAM_RADIUS);
    }
    expect(dist(n, n.home)).toBeLessThanOrEqual(28.01);
  });

  it('stays calm for distant Brianbis and never steps through an obstacle', () => {
    const n = createNpcRoamer({ x: 0, y: 0 }, 0);
    stepNpcRoamer(n, 0.1, 100, [{ x: -100, y: 0 }], open);
    expect(n.avoiding).toBe(false);
    const start = { x: n.x, y: n.y };
    stepNpcRoamer(n, 0.1, 200, [{ x: n.x - 10, y: n.y }], () => false);
    expect({ x: n.x, y: n.y }).toEqual(start);
  });

  it('keeps all four town homes and their escape paths on walkable outdoor ground', () => {
    for (const [i, [tx, ty]] of [[16, 12], [10, 17], [10, 21], [22, 34]].entries()) {
      const home = nearestFree(townLayout, { x: tx! * 16 + 8, y: ty! * 16 + 14 }, 40, (x, y) => locationAt(townLayout, x, y) === 'outdoors')!;
      expect(home).not.toBeNull();
      const n = createNpcRoamer(home, i);
      let travelled = 0;
      for (let tick = 0; tick < 600; tick++) {
        const angle = tick / 70;
        const delta = stepNpcRoamer(n, 0.1, tick * 100, [{ x: n.x + Math.cos(angle) * 20, y: n.y + Math.sin(angle) * 20 }],
          (a, b) => locationAt(townLayout, b.x, b.y) === 'outdoors' && segmentClear(townLayout, a.x, a.y, b.x, b.y));
        travelled += Math.hypot(delta.x, delta.y);
        expect(isBlockedPx(townLayout, n.x, n.y)).toBe(false);
        expect(locationAt(townLayout, n.x, n.y)).toBe('outdoors');
        expect(dist(n, home)).toBeLessThanOrEqual(NPC_ROAM_RADIUS + 1e-6);
      }
      expect(travelled).toBeGreaterThan(30);
    }
  });
});
