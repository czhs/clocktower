// Point / pin pie menu controller (v2.2 radial). Created by the social layer (index.ts); drawn by
// apps/client/src/ui/social/PieMenu.tsx from the `pieMenu` store (a DOM overlay in viewport px).
//
//   desktop  right press: a quick still click points (as before); drag > 6 px (or hold 250 ms) opens
//            the pie centred on the press; the direction picks a wedge; releasing the right button
//            commits; Esc / releasing in the dead zone cancels (a still hold that never left the dead
//            zone leaves the pie open for a click instead).
//   touch    the long-press (index.ts) opens the same pie at the finger; slide + lift commits, lift
//            in the middle leaves it open for a tap; a tap elsewhere closes it.
//
// Cost: nothing while closed (no per-frame work); window listeners only while a right press is live.
// Every choice goes through the layer's own point / pin / unpin (the existing C2S messages, client
// rate limits and optimistic pins); the server stays authoritative.
import type { PinColor } from '@ct/protocol';
import { createStore } from '../../net/store';
import { clampCenter, DEAD_ZONE_PX, gestureMove, gestureRelease, gestureTick, PIE_STICKY_MS, pieItems, RIGHT_HOLD_MS, startGesture, wedgeAt, type PieGesture, type PieInput, type PieItem, type PieTargetInfo } from './radialLogic';
import type { SocialTarget } from './state';

/** Outer radius of the pie (CSS px) per input; the overlay uses the same numbers. */
export const PIE_RADIUS = { mouse: 84, touch: 104 } as const;

export interface PieView {
  /** Where the pie is drawn (viewport CSS px; clamped on screen) and where the press was. */
  x: number;
  y: number;
  px: number;
  py: number;
  input: PieInput;
  items: PieItem[];
  /** Index of the picked wedge, or null. */
  hot: number | null;
  /** Released without choosing: wedges are clickable / tappable until closed. */
  sticky: boolean;
  /** Caption shown when nothing is picked. */
  title: string;
  /** The remembered pin colour (marked on its wedge). */
  color: PinColor;
}
export const pieMenu = createStore<PieView | null>(null);

export interface PieDeps {
  point(t: SocialTarget): void;
  pin(t: SocialTarget, color: PinColor): void;
  unpin(id: string): void;
  color(): PinColor;
  log?(s: string): void;
}

export interface PieOpen {
  /** Press point, viewport CSS px. */
  cx: number;
  cy: number;
  target: SocialTarget;
  info: PieTargetInfo;
}

export interface PieController {
  /** A right-button press on the town (desktop). The controller follows the mouse until release. */
  rightPress(o: PieOpen): void;
  /** Open the pie straight away (touch long-press). Feed moves / the lift with move() / release(). */
  openTouch(o: PieOpen): void;
  move(cx: number, cy: number): void;
  release(cx: number, cy: number): void;
  /** Choose wedge `i` (a click / tap on it while sticky). */
  choose(i: number): void;
  close(why?: string): void;
  isOpen(): boolean;
  /** A right press or an open pie is live (the town should not treat the pointer as its own). */
  busy(): boolean;
  destroy(): void;
}

let active: PieController | null = null;
/** For the overlay: the live controller (wedge clicks while sticky). */
export const pieControl = { get: (): PieController | null => active };

export function createPie(deps: PieDeps): PieController {
  let g: PieGesture | null = null;
  let cur: PieOpen | null = null;
  let center = { x: 0, y: 0 };
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let stickyTimer: ReturnType<typeof setTimeout> | null = null;
  let listening = false;
  let suppressMenuUntil = 0;
  const now = () => performance.now();
  const log = (s: string) => deps.log?.(s);

  const vp = () => ({ w: window.innerWidth || 800, h: window.innerHeight || 600 });

  function show(o: PieOpen, input: PieInput) {
    const r = PIE_RADIUS[input];
    const v = vp();
    center = clampCenter(o.cx, o.cy, v.w, v.h, r + 24, 8);
    const items = pieItems(o.info);
    const who = o.info.name === null ? null : o.info.self ? 'yourself' : o.info.name;
    pieMenu.set({ x: center.x, y: center.y, px: o.cx, py: o.cy, input, items, hot: null, sticky: false, title: who ? `Point at or pin ${who}` : 'Point or pin', color: deps.color() });
    log(`pie-open:${input}`);
  }

  function setHot(cx: number, cy: number) {
    const m = pieMenu.get();
    if (!m || m.sticky) return;
    const hot = wedgeAt(cx - center.x, cy - center.y, m.items.length, DEAD_ZONE_PX[m.input]);
    if (hot !== m.hot) pieMenu.set({ ...m, hot });
  }

  function commit(i: number) {
    const m = pieMenu.get();
    const o = cur;
    const it = m?.items[i];
    close(`commit:${it?.key ?? '?'}`);
    if (!it || !o) return;
    if (it.action.kind === 'point') deps.point(o.target);
    else if (it.action.kind === 'pin') deps.pin(o.target, it.action.color);
    else deps.unpin(it.action.id);
  }

  // --- mouse: window listeners while a right press is live --------------------------------
  const onMouseMove = (e: MouseEvent) => {
    if (!g) return;
    const was = g.phase;
    g = gestureMove(g, e.clientX, e.clientY, was === 'pending' ? { x: g.x0, y: g.y0 } : center);
    if (was === 'pending' && g.phase === 'open' && cur) {
      show(cur, 'mouse');
      g = { ...g, left: Math.hypot(e.clientX - center.x, e.clientY - center.y) >= DEAD_ZONE_PX.mouse };
    }
    if (g.phase === 'open') setHot(e.clientX, e.clientY);
  };
  const onMouseUp = (e: MouseEvent) => {
    if (!g || e.button !== 2) return;
    e.preventDefault();
    suppressMenuUntil = now() + 400; // Windows opens the context menu after the release
    finish(e.clientX, e.clientY);
  };
  const onContextMenu = (e: Event) => {
    if (g || pieMenu.get() || now() < suppressMenuUntil) e.preventDefault();
  };
  const onBlur = () => close('blur');
  // sticky: a press anywhere outside the pie (and off the town canvas, whose tap the layer handles
  // itself so it is not also a walk) closes it
  const onStickyDown = (e: Event) => {
    const t = e.target as Element | null;
    if (!t || t.closest?.('[data-pie]') || t.tagName === 'CANVAS') return;
    close('outside');
  };
  let stickyListen = false;
  function listenSticky(on: boolean) {
    if (on === stickyListen) return;
    stickyListen = on;
    if (on) window.addEventListener('pointerdown', onStickyDown, true);
    else window.removeEventListener('pointerdown', onStickyDown, true);
  }

  function listen(on: boolean) {
    if (on === listening) return;
    listening = on;
    const f = on ? window.addEventListener.bind(window) : window.removeEventListener.bind(window);
    f('mousemove', onMouseMove as EventListener, true);
    f('mouseup', onMouseUp as EventListener, true);
    f('blur', onBlur);
  }
  // the context-menu guard stays for the controller's life (cheap: one listener, no work while idle)
  window.addEventListener('contextmenu', onContextMenu, true);

  function clearTimers() {
    if (holdTimer) clearTimeout(holdTimer);
    if (stickyTimer) clearTimeout(stickyTimer);
    holdTimer = stickyTimer = null;
  }

  function finish(cx: number, cy: number) {
    if (!g || !cur) return close('lost');
    const wasPending = g.phase === 'pending';
    const n = pieMenu.get()?.items.length ?? pieItems(cur.info).length;
    const res = gestureRelease(g, cx, cy, now(), n, wasPending ? { x: g.x0, y: g.y0 } : center);
    if (wasPending && res.kind !== 'click') {
      // released far away / late without a move event in between: the pie opens at the press
      show(cur, g.input);
      const res2 = gestureRelease({ ...g, phase: 'open' }, cx, cy, now(), pieMenu.get()!.items.length, center);
      return apply(res2);
    }
    apply(res);
  }

  function apply(res: ReturnType<typeof gestureRelease>) {
    const o = cur;
    if (res.kind === 'click') {
      close('click');
      if (o) deps.point(o.target);
    } else if (res.kind === 'commit') commit(res.index);
    else if (res.kind === 'cancel') close('cancel');
    else {
      // sticky: keep it up for a click / tap
      g = null;
      listen(false);
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      const m = pieMenu.get();
      if (m) pieMenu.set({ ...m, sticky: true, hot: null });
      log('pie-sticky');
      listenSticky(true);
      stickyTimer = setTimeout(() => close('timeout'), PIE_STICKY_MS);
    }
  }

  function close(why = '') {
    const had = !!g || !!pieMenu.get();
    g = null;
    cur = null;
    clearTimers();
    listen(false);
    listenSticky(false);
    if (pieMenu.get()) pieMenu.set(null);
    if (had && why) log(`pie-close:${why}`);
  }

  const ctl: PieController = {
    rightPress(o) {
      close();
      cur = o;
      g = startGesture('mouse', o.cx, o.cy, now());
      listen(true);
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!g || g.phase !== 'pending' || !cur) return;
        g = gestureTick(g, now() + 1); // timers may fire a hair early
        if (g.phase === 'open') show(cur, 'mouse');
      }, RIGHT_HOLD_MS);
    },
    openTouch(o) {
      close();
      cur = o;
      g = startGesture('touch', o.cx, o.cy, now(), true);
      show(o, 'touch');
    },
    move(cx, cy) {
      if (!g || g.phase !== 'open') return;
      g = gestureMove(g, cx, cy, center);
      setHot(cx, cy);
    },
    release(cx, cy) {
      if (!g) return;
      finish(cx, cy);
    },
    choose(i) {
      if (!pieMenu.get()) return;
      commit(i);
    },
    close,
    isOpen: () => !!pieMenu.get(),
    busy: () => !!g || !!pieMenu.get(),
    destroy() {
      close();
      window.removeEventListener('contextmenu', onContextMenu, true);
      if (active === ctl) active = null;
    },
  };
  active = ctl;
  return ctl;
}
