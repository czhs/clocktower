// v2.2 radial: pure gesture + wedge logic behind the point / pin pie menu
// (apps/client/src/game/social/radialLogic.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PIN_COLORS, type PinColor } from '@ct/protocol';
import {
  clampCenter,
  DEAD_ZONE_PX,
  gestureMove,
  gestureRelease,
  gestureTick,
  pieItems,
  pieWedgeAt,
  RIGHT_DRAG_PX,
  RIGHT_HOLD_MS,
  startGesture,
  touchGate,
  wedgeAngle,
  wedgeAt,
} from '../src/game/social/radialLogic';
import { createPie, pieMenu, PIE_RADIUS, type PieController, type PieDeps } from '../src/game/social/radial';

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

// ---------------------------------------------------------------------------------------
// D3: a touch long-press near the viewport edge. The pie is drawn clamped on screen (away from the finger),
// but the touch dead zone is measured from the PRESS point: lifting in place never commits a wedge, and a slide
// from the press point toward a drawn wedge picks it (the same angles as the pie on screen). The mouse is unchanged.

describe('touchGate / pieWedgeAt (D3)', () => {
  const press = { x: 5, y: 400 };
  const center = clampCenter(press.x, press.y, 390, 844, PIE_RADIUS.touch + 24, 8);
  it('touch gates on the press point; the mouse has no gate (the drawn centre, as before)', () => {
    expect(touchGate('touch', press)).toEqual(press);
    expect(touchGate('mouse', press)).toBeNull();
    expect(center.x).toBeGreaterThan(100); // clamped away from the finger
  });
  it('inside the press point dead zone nothing is picked, even though the finger sits over a drawn wedge', () => {
    expect(pieWedgeAt(press.x, press.y, 9, 'touch', center)).not.toBeNull(); // the old (centre-only) rule
    expect(pieWedgeAt(press.x, press.y, 9, 'touch', center, press)).toBeNull();
    expect(pieWedgeAt(press.x + DEAD_ZONE_PX.touch - 1, press.y, 9, 'touch', center, press)).toBeNull();
  });
  it('outside it, the drawn wedge under the finger is picked; the drawn hub still picks nothing', () => {
    for (let i = 0; i < 9; i++) {
      const a = wedgeAngle(i, 9);
      expect(pieWedgeAt(center.x + Math.cos(a) * 70, center.y + Math.sin(a) * 70, 9, 'touch', center, press)).toBe(i);
    }
    expect(pieWedgeAt(center.x + 3, center.y, 9, 'touch', center, press)).toBeNull();
  });
  it('gestureRelease: a lift at the press point is sticky (was a commit), a slide onto a wedge commits it', () => {
    const g = startGesture('touch', press.x, press.y, 0, true);
    expect(gestureRelease(g, press.x, press.y, 900, 9, center).kind).toBe('commit'); // the bug
    expect(gestureRelease(g, press.x, press.y, 900, 9, center, press)).toEqual({ kind: 'sticky' });
    const a = wedgeAngle(1, 9);
    const to = { x: center.x + Math.cos(a) * 72, y: center.y + Math.sin(a) * 72 };
    const g2 = gestureMove(g, to.x, to.y, press);
    expect(g2.left).toBe(true);
    expect(gestureRelease(g2, to.x, to.y, 900, 9, center, press)).toEqual({ kind: 'commit', index: 1 });
    expect(gestureRelease(g2, press.x + 2, press.y, 900, 9, center, press)).toEqual({ kind: 'cancel' }); // back to the press point
  });
});

describe('touch pie at the viewport edge (D3, createPie)', () => {
  const W = 390;
  const H = 844; // the e2e phone viewport
  const DZ = DEAD_ZONE_PX.touch;
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const mk = () => ({ point: vi.fn<PieDeps['point']>(), pin: vi.fn<PieDeps['pin']>(), unpin: vi.fn<PieDeps['unpin']>(), color: (): PinColor => 'gold', log: (s: string) => void logs.push(s) });
  let deps: ReturnType<typeof mk>;
  let logs: string[];
  let pie: PieController;
  const target = { kind: 'place', x: 0, y: 0 } as never;
  const open = (cx: number, cy: number) => pie.openTouch({ cx, cy, target, info: { name: null } });
  // all four edges and all four corners (finger 4 px from the edge), plus the middle as the control
  const presses: [string, number, number][] = [
    ['left', 4, H / 2],
    ['right', W - 4, H / 2],
    ['top', W / 2, 4],
    ['bottom', W / 2, H - 4],
    ['top-left', 4, 4],
    ['top-right', W - 4, 4],
    ['bottom-left', 4, H - 4],
    ['bottom-right', W - 4, H - 4],
  ];
  const onScreen = (x: number, y: number) => x >= 0 && x <= W && y >= 0 && y <= H;

  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal('window', {
      innerWidth: W,
      innerHeight: H,
      addEventListener: (t: string, fn: (e: unknown) => void) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(fn),
      removeEventListener: (t: string, fn: (e: unknown) => void) => void listeners.get(t)?.delete(fn),
    });
    logs = [];
    deps = mk();
    pie = createPie(deps);
  });
  afterEach(() => {
    pie.destroy();
    pieMenu.set(null);
    vi.unstubAllGlobals();
  });

  it.each(presses)('%s: the pie is drawn clamped, yet lifting in place (or within the dead zone) commits nothing', (_n, x, y) => {
    for (const [dx, dy] of [
      [0, 0],
      [DZ - 2, 0],
      [0, -(DZ - 2)],
      [-(DZ - 2) * 0.7, (DZ - 2) * 0.7],
    ] as const) {
      open(x, y);
      const m = pieMenu.get()!;
      expect(m).toMatchObject({ input: 'touch', px: x, py: y });
      expect(Math.hypot(m.x - x, m.y - y)).toBeGreaterThan(PIE_RADIUS.touch); // the finger is off the drawn hub
      const fx = Math.min(W, Math.max(0, x + dx));
      const fy = Math.min(H, Math.max(0, y + dy));
      pie.move(fx, fy);
      expect(pieMenu.get()!.hot).toBeNull(); // nothing lit while inside the press point's dead zone
      pie.release(fx, fy);
      expect(pieMenu.get()).toMatchObject({ sticky: true, hot: null }); // left open for a tap
      expect(deps.point).not.toHaveBeenCalled();
      expect(deps.pin).not.toHaveBeenCalled();
      expect(deps.unpin).not.toHaveBeenCalled();
      pie.close('test');
    }
  });

  it.each(presses)('%s: sliding out of the dead zone and back to the press point cancels', (_n, x, y) => {
    open(x, y);
    const a = Math.atan2(H / 2 - y, W / 2 - x); // toward the middle of the screen (always on screen)
    pie.move(x + Math.cos(a) * (DZ + 30), y + Math.sin(a) * (DZ + 30));
    expect(pieMenu.get()!.hot).not.toBeNull();
    pie.move(x + 3, y);
    expect(pieMenu.get()!.hot).toBeNull();
    pie.release(Math.min(W, x + 3), y);
    expect(pieMenu.get()).toBeNull();
    expect(logs).toContain('pie-close:cancel');
    expect(deps.point).not.toHaveBeenCalled();
    expect(deps.pin).not.toHaveBeenCalled();
  });

  it.each(presses)('%s: a slide from the press point onto drawn wedge i picks wedge i (every wedge is reachable)', (_n, x, y) => {
    const n = pieItems({ name: null }).length;
    for (let i = 0; i < n; i++) {
      deps.point.mockClear();
      deps.pin.mockClear();
      open(x, y);
      const m = pieMenu.get()!;
      const a = wedgeAngle(i, n);
      // the middle of the drawn wedge (as v2-social.spec.ts pieToward aims): always on screen
      const fx = m.x + Math.cos(a) * 72;
      const fy = m.y + Math.sin(a) * 72;
      expect(onScreen(fx, fy)).toBe(true);
      pie.move(x + (fx - x) * 0.25, y + (fy - y) * 0.25);
      pie.move(fx, fy);
      expect(pieMenu.get()!.hot).toBe(i); // the lit wedge = what the lift commits
      pie.release(fx, fy);
      expect(pieMenu.get()).toBeNull();
      const it = pieItems({ name: null })[i]!;
      expect(logs.at(-1)).toBe(`pie-close:commit:${it.key}`);
      if (it.action.kind === 'point') {
        expect(deps.point).toHaveBeenCalledTimes(1);
        expect(deps.pin).not.toHaveBeenCalled();
      } else {
        expect(deps.point).not.toHaveBeenCalled();
        expect(deps.pin).toHaveBeenCalledTimes(1);
        expect(deps.pin.mock.calls[0]![1]).toBe(it.action.kind === 'pin' ? it.action.color : null);
      }
    }
  });

  it('the middle of the screen is unchanged: the pie is centred on the finger and both rules agree', () => {
    open(W / 2, H / 2);
    expect(pieMenu.get()).toMatchObject({ x: W / 2, y: H / 2 });
    pie.release(W / 2 + 2, H / 2 - 3);
    expect(pieMenu.get()).toMatchObject({ sticky: true });
    pie.close();
    open(W / 2, H / 2);
    pie.move(W / 2, H / 2 - 60);
    pie.release(W / 2, H / 2 - 60);
    expect(deps.point).toHaveBeenCalledTimes(1);
  });

  it('desktop / mouse is unchanged: a right drag at the edge is still measured from the drawn centre', () => {
    const x = 4;
    const y = H / 2;
    pie.rightPress({ cx: x, cy: y, target, info: { name: null } });
    const move = listeners.get('mousemove')!;
    const up = listeners.get('mouseup')!;
    const ev = (cx: number, cy: number) => ({ clientX: cx, clientY: cy, button: 2, preventDefault() {} });
    for (const f of move) f(ev(x + RIGHT_DRAG_PX + 2, y)); // opens the pie (clamped on screen)
    const m = pieMenu.get()!;
    expect(m.input).toBe('mouse');
    expect(m.x).toBeGreaterThan(x + PIE_RADIUS.mouse);
    // straight up from the DRAWN centre = Point (from the press point it would be a pin wedge to the up-right)
    for (const f of move) f(ev(m.x, m.y - 60));
    expect(pieMenu.get()!.hot).toBe(0);
    for (const f of up) f(ev(m.x, m.y - 60));
    expect(deps.point).toHaveBeenCalledTimes(1);
    expect(deps.pin).not.toHaveBeenCalled();
  });
});
