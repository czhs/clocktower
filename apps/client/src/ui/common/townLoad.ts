// LEAD-OWNED (v3 WP8). Real loading progress for the v3 loading scene (./v3loading.tsx), without hooks in the 3D
// code: the browser's Resource Timing reports every lazy chunk the town fetches (`PerformanceObserver`, `buffered`
// so chunks fetched before the scene mounted count too):
//   the v3 layout chunk  (`layoutV3-*.js`, while the lobby joins)
//   the town chunk       (`town3d-*.js` for the 3D town, `TownGame-*.js` for Classic 2D: the CPU-only path)
//   the town pieces      (the 21 BUILD_ORDER pieces of v3/pixel3d/src/town/town.js: ground, props, house-0..14,
//                         clocktower, dais, foliage, life; vendor buildTown imports them one by one, in order)
// After the last piece the 3D town warms its shaders up (WP3 `stage.warmUp`) until GameScreen leaves its loading
// state, which unmounts the scene. A chunk already in the module map (a rebuild, a second lobby in the same page)
// is not fetched again: its buffered entry from the first fetch still counts, so the scene starts further along.
// Lobby chunk (JoinPreview.tsx, townLoading.tsx). Nothing is stored or sent anywhere.

/** BUILD_ORDER length (unit test: equal to the vendor's pieces/ + life). */
export const TOWN_PIECES = 21;
export const PIECE_RE = /\/assets\/(?:ground|props|house-\d{1,2}|clocktower|dais|foliage|life)-[\w-]{8}\.js(?:[?#]|$)/;
export const TOWN3D_RE = /\/assets\/town3d-[\w-]{8}\.js(?:[?#]|$)/;
export const CLASSIC_RE = /\/assets\/TownGame-[\w-]{8}\.js(?:[?#]|$)/;
export const LAYOUT_RE = /\/assets\/layoutV3-[\w-]{8}\.js(?:[?#]|$)/;

export interface LoadSeen {
  layout: boolean;
  town3d: boolean;
  classic: boolean;
  /** Distinct town pieces fetched (0..TOWN_PIECES). */
  pieces: number;
}

/** Fold resource URLs into what has been seen (pure; `pieceSet` collects distinct piece files). */
export function foldResources(prev: LoadSeen, urls: Iterable<string>, pieceSet: Set<string>): LoadSeen {
  let next = prev;
  for (const u of urls) {
    const path = u.replace(/^[a-z]+:\/\/[^/]+/i, '');
    if (!next.layout && LAYOUT_RE.test(path)) next = { ...next, layout: true };
    else if (!next.town3d && TOWN3D_RE.test(path)) next = { ...next, town3d: true };
    else if (!next.classic && CLASSIC_RE.test(path)) next = { ...next, classic: true };
    else if (PIECE_RE.test(path)) {
      const id = path.match(/\/assets\/([a-z]+(?:-\d+)?)-/)?.[1] ?? path;
      if (!pieceSet.has(id)) {
        pieceSet.add(id);
        next = { ...next, pieces: Math.min(TOWN_PIECES, pieceSet.size) };
      }
    }
  }
  return next;
}

export type LoadStep = 'boot' | 'join' | 'town';

/** What the scene says and how far along it is. Monotonic within a step; steps follow each other. Pure. */
export function loadProgress(step: LoadStep, seen: LoadSeen, renderer: 'v3' | 'classic' = 'v3'): { frac: number; label: string; detail: string | null } {
  if (step === 'boot') return { frac: 0.03, label: 'Opening the town gates…', detail: null };
  if (step === 'join') return seen.layout ? { frac: 0.16, label: 'Unrolling the map…', detail: null } : { frac: 0.08, label: 'Finding the lobby…', detail: null };
  if (renderer === 'classic')
    return seen.classic ? { frac: 0.85, label: 'Drawing the town…', detail: null } : { frac: 0.3, label: 'Fetching the town…', detail: null };
  if (!seen.town3d) return { frac: 0.2, label: 'Fetching the town…', detail: null };
  if (seen.pieces < TOWN_PIECES) return { frac: 0.45 + (0.45 * seen.pieces) / TOWN_PIECES, label: 'Raising the cottages…', detail: `${seen.pieces} / ${TOWN_PIECES}` };
  return { frac: 0.93, label: 'Lighting the lamps…', detail: null };
}

// ------------------------------------------------------------------------------------ the page-wide tracker

const EMPTY: LoadSeen = { layout: false, town3d: false, classic: false, pieces: 0 };
let seen: LoadSeen = EMPTY;
const pieceSet = new Set<string>();
const listeners = new Set<(s: LoadSeen) => void>();
let observing = false;

function take(urls: Iterable<string>): void {
  const next = foldResources(seen, urls, pieceSet);
  if (next === seen) return;
  seen = next;
  for (const l of listeners) l(seen);
}

function observe(): void {
  if (observing || typeof PerformanceObserver === 'undefined') return;
  observing = true;
  try {
    const po = new PerformanceObserver((list) => take(list.getEntries().map((e) => e.name)));
    po.observe({ type: 'resource', buffered: true });
  } catch {
    // no Resource Timing: the scene still shows its step labels, with the step-level progress only
    try {
      take(performance.getEntriesByType('resource').map((e) => e.name));
    } catch {
      // nothing to read
    }
  }
}

/** The current state (starts the page-wide observer on first use). */
export function loadSeen(): LoadSeen {
  observe();
  return seen;
}

/** Subscribe to changes; returns the unsubscribe. */
export function onLoadSeen(fn: (s: LoadSeen) => void): () => void {
  observe();
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
