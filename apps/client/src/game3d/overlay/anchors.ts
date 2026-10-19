// v3 WP4 (v3-overlay). Where each world-anchored overlay sits relative to an avatar's head, in CSS px
// (pure; unit-tested in apps/client/test/game3d/overlay.anchors.test.ts). The vertical stack over one
// avatar, bottom to top (indicators.json meta.anchors):
//
//   head top (AvatarRegistry.anchorOf(pid).headTopCss = feet + visual height + 0.1 m)
//   └─ name label      text centred on the head x, bottom edge 1 texel above the head top
//      ├─ talk glyph   left edge 1 texel right of the label box, top = label top − 1 texel
//      ├─ person pins  tip 1 texel above the label box (fanned with social/logic fanSlot)
//      └─ chat bubble  tail tip 1 texel above the label box; newer bubbles climb over older ones they
//                      would cover (social/speech stackBubbles, gap 2 texels); a lifted bubble drops its
//                      tail (it no longer touches its speaker) and every bubble is clamped into the view
//
// One texel = `px` CSS px (the UI scale = engine.pixelScale), so the overlay keeps the pixel grid of the
// 3D image.
import { stackBubbles, type BubbleBox } from '../../game/social/speech';

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The name label's box for a head top and a measured label size (CSS px). */
export function labelBox(head: Pt, size: { w: number; h: number }, px: number, out: Rect = { x: 0, y: 0, w: 0, h: 0 }): Rect {
  out.x = head.x - size.w / 2;
  out.y = head.y - px - size.h;
  out.w = size.w;
  out.h = size.h;
  return out;
}

/** The talk glyph's top-left (beside the label; above the head when the avatar has no label). */
export function glyphAt(label: Rect | null, head: Pt, px: number, glyph: { w: number; h: number }): Pt {
  if (label) return { x: label.x + label.w + px, y: label.y - px };
  return { x: head.x + 4 * px, y: head.y - px - glyph.h };
}

/** The point everything above the label stands on (person pin tips, bubble tails): 1 texel over the label. */
export function stackBase(label: Rect | null, head: Pt, px: number, out: Pt = { x: 0, y: 0 }): Pt {
  out.x = head.x;
  out.y = label ? label.y - px : head.y - px;
  return out;
}

/** One bubble to lay out: centred on `x`, tail tip at `y`; w/h = box size incl. the tail rows (CSS px). */
export interface BubbleIn {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tail rows under the box (CSS px; part of h). */
  tail: number;
}
export interface BubbleOut {
  /** Box top-left (CSS px). */
  left: number;
  top: number;
  /** The box was raised over an older bubble. */
  lifted: boolean;
  /** Tail tip x relative to `left` (CSS px), or -1 = no tail (lifted). */
  tailX: number;
}

/**
 * Stack bubbles (given oldest first) and clamp each into [0, viewW]. Reuses `boxes`/`out` arrays (no
 * allocations once warm). Returns the number laid out.
 */
export function layoutBubbles(items: readonly BubbleIn[], n: number, viewW: number, px: number, boxes: BubbleBox[], out: BubbleOut[], maxLift = 200): number {
  for (let i = 0; i < n; i++) {
    const it = items[i]!;
    const b = (boxes[i] ??= { x: 0, y: 0, w: 0, h: 0, lift: 0 });
    b.x = it.x;
    b.y = it.y;
    b.w = it.w;
    b.h = it.h;
    b.lift = 0;
  }
  stackBubbles(boxes, n, 2 * px, maxLift);
  for (let i = 0; i < n; i++) {
    const it = items[i]!;
    const b = boxes[i]!;
    const o = (out[i] ??= { left: 0, top: 0, lifted: false, tailX: -1 });
    const half = it.w / 2;
    let cx = it.x;
    if (viewW > it.w + 2 * px) cx = Math.min(viewW - half - px, Math.max(half + px, cx));
    o.left = Math.round(cx - half);
    o.top = Math.round(it.y - b.lift - it.h);
    o.lifted = b.lift > 0.5;
    // the tail stays over the speaker while it fits under the box (never in the rounded corners)
    o.tailX = o.lifted ? -1 : Math.max(3 * px, Math.min(it.w - 3 * px, Math.round(it.x - o.left)));
  }
  return n;
}

/** Person pin tip for fan slot `slot` over a stack base (CSS px). `bob` in CSS px. */
export function personPinTip(base: Pt, slot: { dx: number; dy: number }, bob: number): Pt {
  return { x: base.x + slot.dx, y: base.y + slot.dy + bob };
}

/** Is `p` inside the rect `r` grown by `slack` (CSS px)? */
export function inRect(p: Pt, r: Rect, slack = 0): boolean {
  return p.x >= r.x - slack && p.x <= r.x + r.w + slack && p.y >= r.y - slack && p.y <= r.y + r.h + slack;
}

/**
 * The 8-way screen heading closest to (dx, dy) (y down), in the atlas frame-name order
 * right, down-right, down, down-left, left, up-left, up, up-right.
 */
export const HEADINGS = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'] as const;
export type Heading = (typeof HEADINGS)[number];
export function headingOf(dx: number, dy: number): Heading {
  const a = Math.atan2(dy, dx); // y down: 'down' is +pi/2
  const k = Math.round(a / (Math.PI / 4));
  return HEADINGS[((k % 8) + 8) % 8]!;
}

/**
 * Where an off-screen target's edge marker goes: the point where the ray from the view centre toward the
 * target leaves the view inset by `pad` (CSS px), or null when the target is inside that inset view.
 */
export function edgePoint(target: Pt, viewW: number, viewH: number, pad: number): Pt | null {
  const cx = viewW / 2;
  const cy = viewH / 2;
  const hw = Math.max(1, cx - pad);
  const hh = Math.max(1, cy - pad);
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) return null;
  const k = Math.min(hw / Math.max(1e-9, Math.abs(dx)), hh / Math.max(1e-9, Math.abs(dy)));
  return { x: cx + dx * k, y: cy + dy * k };
}
