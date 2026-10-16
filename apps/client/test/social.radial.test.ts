// v2.2 radial: pure gesture + wedge logic behind the point / pin pie menu
// (apps/client/src/game/social/radialLogic.ts).
import { describe, expect, it } from 'vitest';
import { PIN_COLORS } from '@ct/protocol';
import {
  clampCenter,
  DEAD_ZONE_PX,
  gestureMove,
  gestureRelease,
  gestureTick,
  pieItems,
  RIGHT_DRAG_PX,
  RIGHT_HOLD_MS,
  startGesture,
  wedgeAngle,
  wedgeAt,
} from '../src/game/social/radialLogic';

describe('pie items', () => {
  it('a spot: Point at the top, then the 8 colours clockwise', () => {
    const it = pieItems({ name: null });
    expect(it.map((i) => i.key)).toEqual(['point', ...PIN_COLORS.map((c) => `pin:${c}`)]);
    expect(it[0]!.label).toBe('Point here');
    expect(it[2]!.label).toBe('Crimson pin here');
  });
  it('a person: labels name them; yourself reads "yourself"', () => {
    const it = pieItems({ name: 'Ada' });
    expect(it[0]!.label).toBe('Point at Ada');
    expect(it[1]!.label).toBe('Pin Ada · gold');
    expect(pieItems({ name: 'Me', self: true })[0]!.label).toBe('Point at yourself');
  });
  it('a removable pin adds Remove at 6 o’clock', () => {
    const it = pieItems({ name: null, removable: { id: 'p1', mine: true, byName: 'Me' } });
    expect(it).toHaveLength(10);
    const i = it.findIndex((x) => x.key === 'unpin');
    expect(i).toBe(5);
    expect(it[i]!.action).toEqual({ kind: 'unpin', id: 'p1' });
    expect(it[i]!.label).toBe('Remove my pin');
    expect(wedgeAngle(i, it.length)).toBeCloseTo(Math.PI / 2); // straight down
    expect(pieItems({ name: null, removable: { id: 'p2', mine: false, byName: 'Bram' } })[5]!.label).toBe('Remove Bram’s pin');
  });
});

describe('angle -> wedge', () => {
  const n = 9;
  const dz = DEAD_ZONE_PX.mouse;
  it('the dead zone picks nothing', () => {
    expect(wedgeAt(0, 0, n, dz)).toBeNull();
    expect(wedgeAt(dz - 1, 0, n, dz)).toBeNull();
    expect(wedgeAt(0, -(dz - 0.5), n, dz)).toBeNull();
  });
  it('straight up is wedge 0 (Point); clockwise from there', () => {
    expect(wedgeAt(0, -50, n, dz)).toBe(0);
    expect(wedgeAt(0, -500, n, dz)).toBe(0); // no outer limit: direction selects
    // each wedge's own centre direction picks it
    for (let i = 0; i < n; i++) {
      const a = wedgeAngle(i, n);
      expect(wedgeAt(Math.cos(a) * 60, Math.sin(a) * 60, n, dz)).toBe(i);
    }
  });
  it('wedge boundaries: just either side of half a step', () => {
    const step = (2 * Math.PI) / n;
    const a1 = -Math.PI / 2 + step / 2 - 0.01;
    const a2 = -Math.PI / 2 + step / 2 + 0.01;
    expect(wedgeAt(Math.cos(a1) * 60, Math.sin(a1) * 60, n, dz)).toBe(0);
    expect(wedgeAt(Math.cos(a2) * 60, Math.sin(a2) * 60, n, dz)).toBe(1);
    // just left of top wraps to the last wedge
    const a3 = -Math.PI / 2 - step / 2 - 0.01;
    expect(wedgeAt(Math.cos(a3) * 60, Math.sin(a3) * 60, n, dz)).toBe(n - 1);
  });
  it('with Remove (10 wedges) straight down picks Remove', () => {
    expect(wedgeAt(0, 80, 10, dz)).toBe(5);
  });
});

describe('right-button gesture', () => {
  const c = { x: 100, y: 100 };
  it('a quick still click is a click (point, as before)', () => {
    const g = startGesture('mouse', 100, 100, 0);
    expect(gestureRelease(g, 100, 100, 120, 9)).toEqual({ kind: 'click' });
    // a tiny wobble under the threshold is still a click
    const g2 = gestureMove(g, 100 + RIGHT_DRAG_PX - 1, 100);
    expect(g2.phase).toBe('pending');
    expect(gestureRelease(g2, 100 + RIGHT_DRAG_PX - 1, 100, 200, 9)).toEqual({ kind: 'click' });
  });
  it('dragging past the threshold opens the pie', () => {
    const g = gestureMove(startGesture('mouse', 100, 100, 0), 100 + RIGHT_DRAG_PX + 1, 100);
    expect(g.phase).toBe('open');
    expect(g.left).toBe(false); // still inside the dead zone
  });
  it('holding still opens it after RIGHT_HOLD_MS; a still release then leaves it sticky', () => {
    const g = startGesture('mouse', 100, 100, 0);
    expect(gestureTick(g, RIGHT_HOLD_MS - 1).phase).toBe('pending');
    const g2 = gestureTick(g, RIGHT_HOLD_MS);
    expect(g2.phase).toBe('open');
    expect(gestureRelease(g2, 101, 100, 900, 9, c)).toEqual({ kind: 'sticky' });
    // a late release without ticks in between behaves the same
    expect(gestureRelease(g, 100, 100, RIGHT_HOLD_MS + 50, 9)).toEqual({ kind: 'sticky' });
  });
  it('releasing on a wedge commits it', () => {
    let g = startGesture('mouse', 100, 100, 0);
    g = gestureMove(g, 100, 92);
    g = gestureMove(g, 100, 40, c);
    expect(g.left).toBe(true);
    expect(gestureRelease(g, 100, 40, 300, 9, c)).toEqual({ kind: 'commit', index: 0 });
    // a fast flick with no move events in between still commits (direction from the press)
    expect(gestureRelease(startGesture('mouse', 100, 100, 0), 100, 180, 90, 10)).toEqual({ kind: 'commit', index: 5 });
  });
  it('coming back to the middle and releasing cancels', () => {
    let g = startGesture('mouse', 100, 100, 0);
    g = gestureMove(g, 160, 100, c);
    g = gestureMove(g, 160, 100, c);
    expect(g.left).toBe(true);
    expect(gestureRelease(g, 103, 102, 600, 9, c)).toEqual({ kind: 'cancel' });
  });
});

describe('touch gesture (opened by the long-press)', () => {
  it('opens immediately; lift in the middle = sticky, slide + lift = commit, back to the middle = cancel', () => {
    const g = startGesture('touch', 200, 300, 0, true);
    expect(g.phase).toBe('open');
    const c = { x: 200, y: 300 };
    expect(gestureRelease(g, 205, 304, 500, 9, c)).toEqual({ kind: 'sticky' });
    const g2 = gestureMove(g, 200 + DEAD_ZONE_PX.touch + 20, 300, c);
    expect(gestureRelease(g2, 200 + DEAD_ZONE_PX.touch + 20, 300, 700, 9, c).kind).toBe('commit');
    expect(gestureRelease(g2, 200, 301, 800, 9, c)).toEqual({ kind: 'cancel' });
  });
  it('the touch dead zone is larger than the mouse one', () => {
    expect(DEAD_ZONE_PX.touch).toBeGreaterThan(DEAD_ZONE_PX.mouse);
    expect(wedgeAt(DEAD_ZONE_PX.mouse + 2, 0, 9, DEAD_ZONE_PX.touch)).toBeNull();
  });
});

describe('clampCenter', () => {
  it('keeps the pie on screen, untouched when it fits', () => {
    expect(clampCenter(400, 300, 800, 600, 100)).toEqual({ x: 400, y: 300 });
    expect(clampCenter(10, 590, 800, 600, 100, 8)).toEqual({ x: 108, y: 492 });
    expect(clampCenter(10, 10, 150, 600, 100, 8)).toEqual({ x: 75, y: 108 }); // too narrow: centred
  });
});
