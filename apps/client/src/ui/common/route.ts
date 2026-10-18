// LEAD-OWNED. The tiny path router of the shell (main.tsx), in its own module so the lazily loaded
// lobby chunk can navigate without importing the entry module.
//   /               account home + lobby finder (or auth when signed out)
//   /lobby/:id      join/restore that lobby; town is rendered behind the waiting-room overlay
//   /admin          admin status (server enforces ADMIN_ACCOUNT_IDS)
// (v3 URL paths) The same routes exist under /v2 (the v2 app, ./appWorld.ts): the prefix is stripped when
// parsing and kept on every push, so the v2 app never drops into the v3 one.
import { appPath, stripWorldPrefix } from './appWorld';

export type Route = { name: 'home' } | { name: 'lobby'; id: string; intent: 'player' | 'storyteller' } | { name: 'admin' };

export function parseRoute(): Route {
  const p = stripWorldPrefix(location.pathname);
  const m = p.match(/^\/lobby\/([A-Za-z0-9_-]{4,32})\/?$/);
  if (m) return { name: 'lobby', id: m[1]!, intent: 'player' };
  if (p === '/admin') return { name: 'admin' };
  return { name: 'home' };
}

export function navigate(route: Route) {
  const path = route.name === 'lobby' ? `/lobby/${route.id}` : route.name === 'admin' ? '/admin' : '/';
  history.pushState(route, '', appPath(path));
  window.dispatchEvent(new CustomEvent('ct:navigate', { detail: route }));
}
