// v3 WP1 (v3-core). Pointer input of the 3D town (docs/v3/INTEGRATION.md §6.1 "Tap target", §3 "ST pick", "Pins /
// points / emotes"). Listens on the town container (`.ct-game-canvas`; the canvas and every pointer-events:none
// overlay are inside it) and keeps TownScene's order for a pointer press:
//
//   1. a Storyteller map-point pick (gameplay core pickAt) takes a primary press first;
//   2. else the primary press is a tap: the social layer may claim it (pin removal, armed dock modes, touch holds),
//      otherwise the tap rules run (input/tap.ts via `onTap`);
//   3. every press / move / release is also forwarded to the social layer's gesture state machine (right-click
//      point, pie menu, long-press), as page CSS px (`SocialPointer.sx/sy` = clientX/Y for the v3 renderer);
//   4. a release lets the avatar walk again (gameplay core releasePointer).
//
// The browser context menu and the touch callout are suppressed on the town (the social layer uses right-click
// and long-press).
import type { SocialController, SocialPointer } from '../../game/social/controller';

export type SocialSink = Pick<SocialController, 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerOver' | 'pointerOut' | 'onTap'>;

export interface PointerInputCtx {
  /** The town is ready for taps (the viewer is placed). */
  ready(): boolean;
  /** A Storyteller pick is armed: complete it at this screen point (returns true when it did). */
  pick(cssX: number, cssY: number): boolean;
  /** Screen -> world px for the social layer's claim (null = nothing pickable there). */
  worldAt(cssX: number, cssY: number): { x: number; y: number } | null;
  /** The tap rules (walk / enter / Storyteller teleport) for an unclaimed primary tap. */
  onTap(cssX: number, cssY: number): void;
  /** Primary release (gameplay core releasePointer). */
  onRelease(): void;
}

export interface PointerInput {
  /** The social layer (WP4 overlay/socialView) receives presses / moves / releases and may claim taps. */
  setSocial(s: SocialSink | null): void;
  /** Run the tap rules for a screen point without asking the social layer (SocialControllerCtx.passTap). */
  tapAt(cssX: number, cssY: number): void;
  /** The last pointer position over the town (page CSS px), for the pick crosshair. */
  cursor(): { x: number; y: number; over: boolean };
  destroy(): void;
}

type PtrEvent = Pick<PointerEvent, 'pointerId' | 'button' | 'clientX' | 'clientY' | 'pointerType' | 'shiftKey' | 'target' | 'preventDefault'>;

export function toSocialPointer(e: PtrEvent): SocialPointer {
  return { id: e.pointerId, button: e.button, sx: e.clientX, sy: e.clientY, wasTouch: e.pointerType === 'touch', event: e };
}

export function createPointerInput(el: HTMLElement, ctx: PointerInputCtx): PointerInput {
  let social: SocialSink | null = null;
  const cur = { x: 0, y: 0, over: false };
  const down = (e: PointerEvent) => {
    cur.x = e.clientX;
    cur.y = e.clientY;
    const p = toSocialPointer(e);
    try {
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId); // the release arrives even off the canvas
    } catch {
      /* not capturable */
    }
    if (e.button === 0) primary(p);
    social?.pointerDown(p);
  };
  const primary = (p: SocialPointer) => {
    if (ctx.pick(p.sx, p.sy)) return;
    if (!ctx.ready()) return;
    if (social) {
      const w = ctx.worldAt(p.sx, p.sy);
      if (w && social.onTap(w.x, w.y, p)) return; // pointing / pinning / a held touch
    }
    ctx.onTap(p.sx, p.sy);
  };
  const move = (e: PointerEvent) => {
    cur.x = e.clientX;
    cur.y = e.clientY;
    cur.over = true;
    social?.pointerMove(toSocialPointer(e));
  };
  const up = (e: PointerEvent) => {
    if (e.button === 0 || e.type === 'pointercancel') ctx.onRelease();
    social?.pointerUp(toSocialPointer(e));
  };
  const over = () => {
    cur.over = true;
    social?.pointerOver();
  };
  const out = () => {
    cur.over = false;
    social?.pointerOut();
  };
  const menu = (e: Event) => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerenter', over);
  el.addEventListener('pointerleave', out);
  el.addEventListener('contextmenu', menu);
  const cs = el.style as CSSStyleDeclaration & { webkitTouchCallout?: string; webkitUserSelect?: string };
  const prev = { callout: cs.webkitTouchCallout ?? '', select: cs.userSelect, wselect: cs.webkitUserSelect ?? '', touch: cs.touchAction };
  try {
    cs.webkitTouchCallout = 'none';
    cs.webkitUserSelect = 'none';
    cs.userSelect = 'none';
  } catch {
    /* no style */
  }
  return {
    setSocial(s) {
      social = s;
    },
    tapAt(cssX, cssY) {
      if (!ctx.ready()) return;
      ctx.onTap(cssX, cssY);
    },
    cursor: () => cur,
    destroy() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerenter', over);
      el.removeEventListener('pointerleave', out);
      el.removeEventListener('contextmenu', menu);
      try {
        cs.webkitTouchCallout = prev.callout;
        cs.webkitUserSelect = prev.wselect;
        cs.userSelect = prev.select;
        cs.touchAction = prev.touch;
      } catch {
        /* no style */
      }
      social = null;
    },
  };
}
