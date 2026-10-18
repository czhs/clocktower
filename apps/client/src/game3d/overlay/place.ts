// v3 WP4 (v3-overlay). The §7 overlay update rule, as a small pure module (no DOM types needed, unit-tested
// with plain objects in apps/client/test/game3d/overlay.place.test.ts):
//
//   * positions are written as `style.transform = translate3d(x, y, 0)` (CSSOM: allowed by `style-src 'self'`);
//   * a write is skipped when the projected position moved < 0.5 CSS px since the last write;
//   * off-screen elements are culled by PARKING them: one transform write far outside the overlay root (which
//     clips, overflow hidden), so crossing the canvas edge while walking is a position write, not a visibility
//     flip (v3.1: the edge flips were ~8 non-transform writes/s, against the ≤ 5/s §7 budget). An element that
//     was never shown (or was hidden on purpose with setShown) stays hidden and gets no write;
//   * nothing here reads layout: element sizes are measured by the callers once, on content change.
//
// Every write is counted in an OverlayStats (`__ctCamera.overlay()`, the `v3WalkDomMutPerSec` budget key).

/** Projected moves below this (CSS px) do not touch the DOM. */
export const MOVE_EPS = 0.5;

/** What place() writes to (an HTMLElement satisfies it; tests pass plain objects). */
export interface StyleTarget {
  style: { transform: string; visibility: string };
}

/** Per-element memory of the last write. */
export interface PlaceState {
  /** The raw (unrounded) position of the last transform write; NaN = never written. */
  x: number;
  y: number;
  /** Last written visibility (null = never written). */
  shown: boolean | null;
}

export const newPlaceState = (): PlaceState => ({ x: NaN, y: NaN, shown: null });

/** DOM write counters (cumulative; the debug hook derives per-second rates). */
export interface OverlayStats {
  /** style.transform writes. */
  transforms: number;
  /** style.visibility writes. */
  visibility: number;
  /** Structural / content mutations: nodes added or removed, text or class changes. */
  content: number;
}

export const newStats = (): OverlayStats => ({ transforms: 0, visibility: 0, content: 0 });

/** The viewport rectangle (CSS px, overlay-root local) used for culling, with a margin. */
export interface CullRect {
  w: number;
  h: number;
  /** Extra CSS px kept around the view (an element's size is not known here). */
  margin: number;
}

export function inView(x: number, y: number, view: CullRect): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= -view.margin && y >= -view.margin && x <= view.w + view.margin && y <= view.h + view.margin;
}

/**
 * Write one CSSOM style property (camelCase), skipping a write that changes nothing, and count it as a
 * content mutation. Every non-position style write of the overlay goes through here, so the counters match
 * what a MutationObserver with `attributes: true` sees (minus the transform writes, counted by place()).
 * The no-op check compares with the inline value; browsers normalise some values (colours become rgb()),
 * so a caller writing per frame keeps its own last value and calls this only on change.
 */
export function setStyle(el: { style: object }, prop: string, value: string, stats: OverlayStats): boolean {
  const st = el.style as Record<string, string>;
  if (st[prop] === value) return false;
  st[prop] = value;
  stats.content++;
  return true;
}

/** Set an element's text (textContent only, never markup), skipping no-op writes; counted as content. */
export function setText(el: { textContent: string | null }, text: string, stats: OverlayStats): boolean {
  if (el.textContent === text) return false;
  el.textContent = text;
  stats.content++;
  return true;
}

/** Show / hide an element (written only on change). */
export function setShown(el: StyleTarget, st: PlaceState, shown: boolean, stats: OverlayStats): void {
  if (st.shown === shown) return;
  st.shown = shown;
  el.style.visibility = shown ? 'visible' : 'hidden';
  stats.visibility++;
}

/** Where a culled element is parked (CSS px, overlay-root local): far outside any canvas. */
export const PARK_PX = -100000;
export const PARK_TRANSFORM = `translate3d(${PARK_PX}px, ${PARK_PX}px, 0)`;

/**
 * Cull an element that is off the canvas: a shown element is parked outside the (clipping) overlay root with one
 * transform write (once); a hidden or never-shown element is left alone. The next place() on screen moves it back
 * with a transform write and no visibility write.
 */
export function cull(el: StyleTarget, st: PlaceState, stats: OverlayStats): void {
  if (st.shown !== true || st.x === PARK_PX) return;
  st.x = PARK_PX;
  st.y = PARK_PX;
  el.style.transform = PARK_TRANSFORM;
  stats.transforms++;
}

/**
 * Move an element to (x, y) (overlay-root CSS px, the element's top-left). `null` (or a point outside
 * `view`) culls it (cull(): parked when shown). Returns true when the transform was written.
 */
export function place(el: StyleTarget, st: PlaceState, x: number | null, y: number, stats: OverlayStats, view?: CullRect): boolean {
  if (x === null || !Number.isFinite(x) || !Number.isFinite(y) || (view && !inView(x, y, view))) {
    cull(el, st, stats);
    return false;
  }
  let wrote = false;
  if (!(Math.abs(x - st.x) < MOVE_EPS && Math.abs(y - st.y) < MOVE_EPS)) {
    st.x = x;
    st.y = y;
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    stats.transforms++;
    wrote = true;
  }
  setShown(el, st, true, stats);
  return wrote;
}

/**
 * Rolling per-second rates over the stats (for `__ctCamera.overlay()`): call `sample(now)` from the
 * debug hook; it compares with the previous sample at least `windowMs` old. `mutationsPerSec` is the
 * `v3WalkDomMutPerSec` budget figure: every DOM write EXCEPT the transform writes (§7 "transform writes
 * only": positions may move every frame; nodes, text, classes and visibility must not churn while walking).
 */
export function createRate(stats: OverlayStats, windowMs = 1000) {
  let at = -Infinity;
  let base = { ...stats };
  let last = { transformsPerSec: 0, visibilityPerSec: 0, contentPerSec: 0, mutationsPerSec: 0, domWritesPerSec: 0 };
  return {
    sample(now: number) {
      const dt = now - at;
      if (dt >= windowMs || !Number.isFinite(at)) {
        if (Number.isFinite(at) && dt > 0) {
          const k = 1000 / dt;
          const t = (stats.transforms - base.transforms) * k;
          const v = (stats.visibility - base.visibility) * k;
          const c = (stats.content - base.content) * k;
          // domWritesPerSec = what a MutationObserver with attributes:true counts (transforms included); which
          // one the v3WalkDomMutPerSec budget means is the lead's §7 call (review round 1, issue 3)
          last = { transformsPerSec: t, visibilityPerSec: v, contentPerSec: c, mutationsPerSec: v + c, domWritesPerSec: t + v + c };
        }
        at = now;
        base = { ...stats };
      }
      return last;
    },
  };
}
