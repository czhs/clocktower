// /tutorial/manifest.json (written by the capture script). Videos live in public/ (same origin,
// CSP media-src 'self'); nothing here is bundled into the JS.

export interface ClipInfo {
  webm: string;
  mp4: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
}

export interface TourManifest {
  version: number;
  generatedAt: string;
  clips: Record<string, ClipInfo>;
}

const BASE = '/tutorial/';
let pending: Promise<TourManifest | null> | null = null;

/** Fetched once per page; null when missing (the tour still works, without footage). */
export function loadManifest(): Promise<TourManifest | null> {
  pending ??= fetch(`${BASE}manifest.json`, { cache: 'no-cache', credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<TourManifest>) : null))
    .then((m) => (m && typeof m === 'object' && m.clips && typeof m.clips === 'object' ? m : null))
    .catch(() => null);
  return pending;
}

const SAFE_FILE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** Same-origin URL for a manifest file (cache-busted per recording). */
export function clipUrl(m: TourManifest, file: string): string | null {
  if (!SAFE_FILE.test(file)) return null;
  return `${BASE}${file}?v=${encodeURIComponent(m.generatedAt ?? '')}`;
}
