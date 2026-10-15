// Per-browser volume preferences. Every access is wrapped: blocked storage (private mode, previews)
// must never break the game, it just falls back to the defaults.

/** Shared with ui/common/Settings.tsx (the slider writes the same key). */
export const AMBIENT_KEY = 'ct.ambientVolume';
export const SFX_KEY = 'ct.sfxVolume';
/** Low by default: ambience must sit well under voice chat. */
export const AMBIENT_DEFAULT = 0.25;
export const SFX_DEFAULT = 0.7;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

export function readVolume(key: string, fallback: number): number {
  try {
    const raw = storage()?.getItem(key);
    if (raw === null || raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp01(n) : fallback;
  } catch {
    return fallback;
  }
}

export function writeVolume(key: string, v: number): void {
  try {
    storage()?.setItem(key, String(clamp01(v)));
  } catch {
    // ignore
  }
}
