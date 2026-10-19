// v3 WP0 (v3-lead). net/layout.ts (the lobby's layout: v2, or v3 = Hollowmere since WP5a) and the
// renderer-free door rules extracted to game/rules (the v3 doorNormal inward rule).
import { townLayout } from '@ct/assets';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import type { BuildingDef } from '@ct/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { currentLayout, currentWorld, ensureLayout, selectLayoutIfLoaded, setV3LayoutForTests } from '../../src/net/layout';
import { autoEnterDoor, doorInward, doorLocked, doorPrompt, doorSpots, houseInUse, lockText, tapTarget } from '../../src/game/rules/doors';
import { dir8, keyDir, keyVector, toFacing } from '../../src/game/rules/input';
import { integrateStep, interpolate, moveSpeed, poseChanged, routeStep } from '../../src/game/rules/movement';

afterEach(async () => {
  setV3LayoutForTests(null);
  await ensureLayout('v2');
});

describe('net/layout', () => {
  it('v2 (and absent) is the classic layout, synchronously', async () => {
    expect(currentLayout()).toBe(townLayout);
    expect(selectLayoutIfLoaded(undefined)).toBe(true);
    await ensureLayout(undefined);
    expect(currentWorld()).toBe('v2');
    expect(currentLayout()).toBe(townLayout);
  });

  it('v3 (WP5a): ensureLayout loads Hollowmere; the previous world stays current until it resolved', async () => {
    expect(selectLayoutIfLoaded('v3')).toBe(false);
    const p = ensureLayout('v3');
    // while the chunk loads, consumers of the previous (v2) lobby keep their layout
    expect(currentWorld()).toBe('v2');
    expect(currentLayout()).toBe(townLayout);
    await p;
    expect(currentWorld()).toBe('v3');
    expect(currentLayout()).toBe(townLayoutV3);
    expect(currentLayout().widthTiles).toBe(125);
    await ensureLayout('v2'); // leaving for a v2 lobby in the same page works
    expect(currentLayout()).toBe(townLayout);
    expect(selectLayoutIfLoaded('v3')).toBe(true); // loaded once, switching back is synchronous
    expect(currentLayout()).toBe(townLayoutV3);
  });


  it('world switches only once the v3 layout resolved; a later v2 request wins the race', async () => {
    const fake = { ...townLayout, version: 3 };
    setV3LayoutForTests(fake);
    await ensureLayout('v3');
    expect(currentWorld()).toBe('v3');
    expect(currentLayout()).toBe(fake);
    await ensureLayout('v2');
    expect(currentLayout()).toBe(townLayout);
    // v3 requested, then v2 before it settles: v2 must stay current
    const p3 = ensureLayout('v3');
    const p2 = ensureLayout('v2');
    await Promise.all([p3, p2]);
    expect(currentWorld()).toBe('v2');
    expect(currentLayout()).toBe(townLayout);
  });

  it('a loaded v3 layout becomes current', async () => {
    const fake = { ...townLayout, version: 3 };
    setV3LayoutForTests(fake);
    expect(selectLayoutIfLoaded('v3')).toBe(true);
    expect(currentLayout()).toBe(fake);
  });
});

describe('game/rules', () => {
  const house = (over: Partial<BuildingDef>): BuildingDef => ({ ...townLayout.buildings.find((b) => b.kind === 'house')!, ...over });

  it('inward: v2 footprint rule; v3 doorNormal wins (negated, normalised)', () => {
    for (const b of townLayout.buildings) {
      const v = doorInward(b);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9);
    }
    const b = house({ doorNormal: [0.6, 0.8] });
    expect(doorInward(b).x).toBeCloseTo(-0.6, 9);
    expect(doorInward(b).y).toBeCloseTo(-0.8, 9);
    const r = house({ doorNormal: [3, 0] });
    expect(doorInward(r)).toEqual({ x: -1, y: 0 });
  });

  it('locks: night locks every door but home (and home from inside); the Storyteller is never locked', () => {
    const home = townLayout.buildings.find((b) => b.houseIndex === 2)!;
    const other = townLayout.buildings.find((b) => b.houseIndex === 3)!;
    const ctx = { layout: townLayout, amStoryteller: false, phase: 'night', mySeat: 2, override: () => null };
    expect(doorLocked(ctx, home, false)).toBe(false);
    expect(doorLocked(ctx, other, false)).toBe(true);
    expect(doorLocked(ctx, home, true)).toBe(true);
    expect(lockText(ctx, other, false)).toBe('Locked for the night');
    expect(doorLocked({ ...ctx, amStoryteller: true }, other, false)).toBe(false);
    expect(doorLocked({ ...ctx, phase: 'day', override: (id) => id === other.id }, other, false)).toBe(true);
    expect(lockText({ ...ctx, phase: 'day' }, other, false)).toBe(`${other.name} is locked by the Storyteller`);
    expect(houseInUse(null, other)).toBe(true);
    expect(houseInUse({ players: [{ seat: 2 }] }, other)).toBe(false);
  });

  it('auto-enter: a straight push from 20 px enters, a diagonal brush past does not; the prompt names the door', () => {
    const doors = doorSpots(townLayout);
    const d = doors.find((x) => x.b.houseIndex === 0)!;
    const from = { x: d.at.x - d.inward.x * 18, y: d.at.y - d.inward.y * 18, location: 'outdoors' as const };
    expect(autoEnterDoor(from, d.inward.x, d.inward.y, doors)?.b.id).toBe(d.b.id);
    expect(autoEnterDoor(from, d.inward.y, -d.inward.x, doors)).toBeNull();
    expect(autoEnterDoor({ ...from, location: 'bld:x' }, d.inward.x, d.inward.y, doors)).toBeNull();
    const p = doorPrompt(d.at, doors, { amStoryteller: false, inUse: () => true, locked: () => false, lockText: () => '', title: (b) => b.name });
    expect(p).toEqual({ text: `Walk in: ${d.b.name}`, locked: false });
    expect(tapTarget(townLayout, doors, d.at.x + 3, d.at.y)).toEqual({ x: d.at.x, y: d.at.y, enter: d.b.id });
  });

  it('input + movement helpers', () => {
    expect(keyDir('KeyW')).toBe('up');
    expect(keyDir('ArrowRight')).toBe('right');
    expect(keyDir('KeyQ')).toBeNull();
    expect(keyVector(new Set(['up', 'left']))).toEqual({ vx: -1, vy: -1 });
    expect(dir8(1, 1)).toBe('down-right');
    expect(toFacing('down-right', 1, 0.5)).toBe('right');
    expect(moveSpeed(null)).toBe(150);
    expect(moveSpeed(100)).toBeGreaterThan(150);
    const me = { x: 0, y: 0, moving: false, facing: 'down' as const };
    expect(poseChanged(me, { ...me })).toBe(false);
    expect(poseChanged({ ...me, x: 0.06 }, me)).toBe(true);
    const r = { pts: [{ x: 1, y: 0 }], enter: 'house-0' };
    expect(routeStep(r, { x: 0, y: 0 }, false)).toEqual({ kind: 'advance' });
    expect(routeStep(r, { x: 0, y: 0 }, true)).toEqual({ kind: 'hold' });
    expect(routeStep(r, { x: 0, y: 0 }, false)).toEqual({ kind: 'arrived', enter: 'house-0' });
    expect(routeStep({ pts: [{ x: 10, y: 0 }], enter: null }, { x: 0, y: 0 }, false)).toEqual({ kind: 'follow', vx: 1, vy: 0 });
    const s = [
      { t: 0, x: 0, y: 0, facing: 'right' as const, moving: true },
      { t: 100, x: 10, y: 0, facing: 'right' as const, moving: true },
    ];
    expect(interpolate(s, 50)).toMatchObject({ x: 5, y: 0 });
    expect(interpolate(s, -10)).toMatchObject({ x: 0, y: 0 });
    expect(interpolate([], 0)).toBeNull();
    const spawn = { x: townLayout.playerSpawn.x * 16 + 8, y: townLayout.playerSpawn.y * 16 + 14, location: 'outdoors' as const };
    expect(integrateStep(townLayout, spawn, 1, 0, 2).moved).toBe(true);
  });
});
