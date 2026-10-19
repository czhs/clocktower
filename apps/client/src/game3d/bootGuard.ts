// v3 WP0 (v3-lead). Crash-loop guard for the 3D town (docs/v3/INTEGRATION.md §1.2 "Boot guard").
// Static import (main bundle): no three.js.
//
// iOS Safari / low-memory Android kill the GPU process or the tab on OOM and reload it with no JS error.
// Before every 3D engine is created we mark the boot (`ct.graphics.booting` = {tabId: ISO time}, and the
// time appended to `ct.graphics.boots`, last 10 min). The mark is cleared after 10 s of stable frames, on a
// clean destroy(), or on `pagehide` once a frame has rendered (a clean unload / F5 fires it; an OOM or
// GPU-process kill does not). A caught crash (JS error, context loss) clears the mark but keeps the boot
// counted as unclean. On the next mount THIS tab's leftover mark — or ≥ 2 unclean boots within 10 minutes
// from any tab — makes chooseRenderer pick Classic (row 4), even for an explicit 'v3' pref. The mark is per
// tab (a sessionStorage id, which survives the reload of an OOM-killed tab) so a second tab opened while
// the first one boots is not blocked. This module only READS the guard (main bundle); bootMark.ts writes
// the marks (lazy 3D chunk only).

export const BOOTING_KEY = 'ct.graphics.booting';
export const BOOTS_KEY = 'ct.graphics.boots';
/** sessionStorage: this tab's id for the per-tab booting mark. */
export const TAB_KEY = 'ct.graphics.tab';
export const BOOT_WINDOW_MS = 10 * 60_000;
export const STABLE_MS = 10_000;
/** Unclean boots within BOOT_WINDOW_MS that block v3. */
export const UNCLEAN_LIMIT = 2;

export type GuardStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function storage(): GuardStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

let tabCache: string | null = null;
/** This tab's id ('' when sessionStorage is unavailable: then every tab shares one mark). */
export function currentTab(): string {
  if (tabCache !== null) return tabCache;
  let id = '';
  try {
    if (typeof sessionStorage !== 'undefined') {
      id = sessionStorage.getItem(TAB_KEY) ?? '';
      if (!id) {
        id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem(TAB_KEY, id);
      }
    }
  } catch {
    id = '';
  }
  tabCache = id;
  return id;
}

/** The booting marks per tab (ms). A legacy / corrupt value counts as a mark of every tab ('*'). */
export function readBooting(s: GuardStorage): Record<string, number> {
  let raw: string | null = null;
  try {
    raw = s.getItem(BOOTING_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, number> = {};
      for (const [k, t] of Object.entries(v as Record<string, unknown>)) {
        const ms = typeof t === 'string' ? Date.parse(t) : NaN;
        out[k] = Number.isFinite(ms) ? ms : 0;
      }
      return out;
    }
  } catch {
    /* legacy ISO string / corrupt */
  }
  return { '*': 0 };
}

export function readBoots(s: GuardStorage, now: number): number[] {
  try {
    const raw = JSON.parse(s.getItem(BOOTS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && now - t < BOOT_WINDOW_MS && t <= now);
  } catch {
    return [];
  }
}

export interface BootGuardState {
  /** The previous 3D boot never finished cleanly (no stable 10 s, no clean destroy). */
  leftover: boolean;
  /** Boots within the window that were never confirmed stable (incl. the leftover one). */
  unclean: number;
  /** v3 must not be used now (row 4). */
  blocked: boolean;
}

/** Read the guard (pure over the storage) for `tab`. */
export function bootGuardState(now = Date.now(), s: GuardStorage | null = storage(), tab: string = currentTab()): BootGuardState {
  if (!s) return { leftover: false, unclean: 0, blocked: false };
  const marks = readBooting(s);
  const leftover = tab in marks || '*' in marks;
  // `boots` holds only boots that were not confirmed stable (markStable removes its own entry).
  const unclean = readBoots(s, now).length;
  return { leftover, unclean, blocked: leftover || unclean >= UNCLEAN_LIMIT };
}

/** "Try v3" after a blocked boot: forget the unclean history. */
export function resetBootGuard(s: GuardStorage | null = storage()): void {
  if (!s) return;
  try {
    s.removeItem(BOOTING_KEY);
    s.removeItem(BOOTS_KEY);
  } catch {
    /* best effort */
  }
}
