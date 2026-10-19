// LEAD-OWNED (v3 URL paths, user decision 2026-10-18, docs/v3/INTEGRATION.md §11): which town this page is.
//   /            the v3 app: every lobby created here is world 'v3' (Hollowmere); the list shows v3 lobbies only
//   /v2, /v2/…   the v2 app exactly as before (Classic town); the list shows v2 lobbies only
// One client build, one server, the same accounts. In-app paths are written WITHOUT the prefix ('/', '/lobby/x',
// '/admin') and go through `appPath` / `pathInWorld`, so the v2 app keeps its /v2 prefix on every history push.
// A lobby opened under the other world's path (an old v2 share link at /lobby/x) is moved to the right path in
// place by `syncWorldPath` (history.replaceState: no reload, the join keeps going). Pure helpers + two tiny
// location wrappers; entry chunk (ui/common/route.ts imports it).
import type { WorldId } from '@ct/protocol';

export const V2_PREFIX = '/v2';

/** The world a path belongs to: '/v2' or '/v2/…' → 'v2', everything else (the default link) → 'v3'. */
export const worldOfPath = (pathname: string): WorldId => (pathname === V2_PREFIX || pathname.startsWith(`${V2_PREFIX}/`) ? 'v2' : 'v3');

/** The in-app path without the world prefix: '/v2/lobby/x' → '/lobby/x', '/v2' → '/'. */
export function stripWorldPrefix(pathname: string): string {
  if (worldOfPath(pathname) === 'v3') return pathname || '/';
  return pathname.slice(V2_PREFIX.length) || '/';
}

/** An in-app path ('/', '/lobby/x', '/admin#t') inside a world's app: v2 → '/v2/', '/v2/lobby/x'; v3 unchanged. */
export function pathInWorld(world: WorldId, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return world === 'v2' ? V2_PREFIX + p : p;
}

/** The same in-app path inside `world`'s app ('/lobby/x' ↔ '/v2/lobby/x'). Pure. */
export const moveToWorld = (pathname: string, world: WorldId): string => pathInWorld(world, stripWorldPrefix(pathname));

/** This page's world (from the address bar). */
export const appWorld = (): WorldId => worldOfPath(location.pathname);

/** An in-app path inside this page's app. */
export const appPath = (path: string): string => pathInWorld(appWorld(), path);

/**
 * A lobby of `world` is open on this page: if the address bar is in the other app, move it (replaceState, same
 * history entry, no reload). Returns true when it moved. Idempotent.
 */
export function syncWorldPath(world: WorldId): boolean {
  if (typeof location === 'undefined' || worldOfPath(location.pathname) === world) return false;
  try {
    history.replaceState(history.state, '', moveToWorld(location.pathname, world) + location.search + location.hash);
  } catch {
    return false;
  }
  return true;
}
