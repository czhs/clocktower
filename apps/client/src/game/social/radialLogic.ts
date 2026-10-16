// Pure logic behind the point / pin pie menu (v2.2 radial): gesture classification, the wedge list
// and angle -> wedge. No Phaser, no DOM — unit-tested in apps/client/test/social.radial.test.ts.
//
// Gesture (desktop, right button):
//   press + release without moving more than RIGHT_DRAG_PX, before RIGHT_HOLD_MS   -> 'click' (point)
//   press + drag beyond RIGHT_DRAG_PX, or hold still RIGHT_HOLD_MS                 -> the pie opens
//   while open: the direction from the centre picks a wedge (no outer limit); inside the dead zone
//   nothing is picked. Release on a wedge -> 'commit'; release in the dead zone after having left it
//   -> 'cancel'; release in the dead zone without ever leaving it (a still hold) -> 'sticky' (the pie
//   stays open for a click; a click elsewhere / Esc / a timeout closes it).
// Touch: the long-press (LONG_PRESS_MS, logic.ts) opens the same pie; then exactly as above.
import { PIN_COLORS, type PinColor } from '@ct/protocol';
import { PIN_HEX } from './logic';

/** Mouse travel (CSS px) that turns a right press into a drag (opens the pie). */
export const RIGHT_DRAG_PX = 6;
/** A still right press held this long opens the pie (so a plain right-click is a quick one). */
export const RIGHT_HOLD_MS = 250;
/** Dead zone radius (CSS px) around the pie centre: nothing is picked inside it. */
export const DEAD_ZONE_PX = { mouse: 20, touch: 28 } as const;
/** A sticky pie (opened, released without choosing) closes itself after this long. */
export const PIE_STICKY_MS = 8000;

export type PieInput = 'mouse' | 'touch';

export type PieAction = { kind: 'point' } | { kind: 'pin'; color: PinColor } | { kind: 'unpin'; id: string };

export interface PieItem {
  /** Stable key ('point' | 'pin:<color>' | 'unpin'), also the DOM data attribute. */
  key: string;
  action: PieAction;
  /** What the caption says while this wedge is picked ("Point at Ada", "Crimson pin here"). */
  label: string;
}

export interface PieTargetInfo {
  /** Display name of the person under the press (null = a spot). `self` = it is you. */
  name: string | null;
  self?: boolean;
  /** A pin under the press that you may remove (yours; the Storyteller: anyone's). */
  removable?: { id: string; mine: boolean; byName: string } | null;
}

/**
 * The wedges, clockwise from the top: Point (always at 12 o'clock), the 8 pin colours, and — only
 * when the press was on a pin you may remove — "Remove" at 6 o'clock (between the 4th and 5th colour).
 */
export function pieItems(t: PieTargetInfo): PieItem[] {
  const who = t.name === null ? null : t.self ? 'yourself' : t.name;
  const items: PieItem[] = [{ key: 'point', action: { kind: 'point' }, label: who ? `Point at ${who}` : 'Point here' }];
  const pinItem = (c: PinColor): PieItem => ({
    key: `pin:${c}`,
    action: { kind: 'pin', color: c },
    label: who ? `Pin ${who} · ${PIN_HEX[c].label.toLowerCase()}` : `${PIN_HEX[c].label} pin here`,
  });
  const half = Math.ceil(PIN_COLORS.length / 2);
  for (const c of PIN_COLORS.slice(0, half)) items.push(pinItem(c));
  if (t.removable) items.push({ key: 'unpin', action: { kind: 'unpin', id: t.removable.id }, label: t.removable.mine ? 'Remove my pin' : `Remove ${t.removable.byName}’s pin` });
  for (const c of PIN_COLORS.slice(half)) items.push(pinItem(c));
  return items;
}

/** Centre angle (radians, screen coords: 0 = right, +y down) of wedge `i` of `n` (wedge 0 at the top). */
export function wedgeAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
}

/** The wedge picked by a pointer at (dx, dy) from the centre, or null inside the dead zone. */
export function wedgeAt(dx: number, dy: number, n: number, dead: number): number | null {
  if (n <= 0 || Math.hypot(dx, dy) < dead) return null;
  const step = (2 * Math.PI) / n;
  let rel = Math.atan2(dy, dx) + Math.PI / 2; // 0 = up, clockwise
  rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.round(rel / step) % n;
}

/** Keep a pie of outer radius `r` (plus `pad`) inside a vw x vh viewport. */
export function clampCenter(cx: number, cy: number, vw: number, vh: number, r: number, pad = 8): { x: number; y: number } {
  const m = r + pad;
  const x = vw >= 2 * m ? Math.max(m, Math.min(vw - m, cx)) : vw / 2;
  const y = vh >= 2 * m ? Math.max(m, Math.min(vh - m, cy)) : vh / 2;
  return { x, y };
}

// ---------------------------------------------------------------------------------------
// gesture state machine

export interface PieGesture {
  input: PieInput;
  /** Press point (CSS px, viewport). */
  x0: number;
  y0: number;
  t0: number;
  /** 'pending' = a right press that may still be a plain click; 'open' = the pie is showing. */
  phase: 'pending' | 'open';
  /** The pointer has been outside the dead zone since the pie opened. */
  left: boolean;
}

export function startGesture(input: PieInput, x: number, y: number, t: number, open = false): PieGesture {
  return { input, x0: x, y0: y, t0: t, phase: open ? 'open' : 'pending', left: false };
}

/** A pointer move: a pending press opens once it travels beyond RIGHT_DRAG_PX; an open one notes leaving the dead zone. */
export function gestureMove(g: PieGesture, cx: number, cy: number, center: { x: number; y: number } = { x: g.x0, y: g.y0 }): PieGesture {
  if (g.phase === 'pending') {
    if (Math.hypot(cx - g.x0, cy - g.y0) > RIGHT_DRAG_PX) return { ...g, phase: 'open', left: Math.hypot(cx - center.x, cy - center.y) >= DEAD_ZONE_PX[g.input] };
    return g;
  }
  if (!g.left && Math.hypot(cx - center.x, cy - center.y) >= DEAD_ZONE_PX[g.input]) return { ...g, left: true };
  return g;
}

/** Time passing: a still pending press opens after RIGHT_HOLD_MS. */
export function gestureTick(g: PieGesture, t: number): PieGesture {
  return g.phase === 'pending' && t - g.t0 >= RIGHT_HOLD_MS ? { ...g, phase: 'open' } : g;
}

export type PieRelease = { kind: 'click' } | { kind: 'commit'; index: number } | { kind: 'sticky' } | { kind: 'cancel' };

/** The button / finger lifts at (cx, cy). `n` = wedge count; `center` = where the pie is drawn. */
export function gestureRelease(g: PieGesture, cx: number, cy: number, t: number, n: number, center: { x: number; y: number } = { x: g.x0, y: g.y0 }): PieRelease {
  const g2 = gestureTick(gestureMove(g, cx, cy, center), t);
  if (g2.phase === 'pending') return { kind: 'click' };
  const i = wedgeAt(cx - center.x, cy - center.y, n, DEAD_ZONE_PX[g.input]);
  if (i !== null) return { kind: 'commit', index: i };
  return g2.left ? { kind: 'cancel' } : { kind: 'sticky' };
}
