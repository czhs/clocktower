// LEAD-OWNED. The tiny path router of the shell (main.tsx), in its own module so the lazily loaded
// lobby chunk can navigate without importing the entry module.
//   /               account home + lobby finder (or auth when signed out)
//   /lobby/:id      join/restore that lobby; town is rendered behind the waiting-room overlay
//   /admin          admin status (server enforces ADMIN_ACCOUNT_IDS)

export type Route = { name: 'home' } | { name: 'lobby'; id: string; intent: 'player' | 'storyteller' } | { name: 'admin' };

export function parseRoute(): Route {
  const m = location.pathname.match(/^\/lobby\/([A-Za-z0-9_-]{4,32})\/?$/);
  if (m) return { name: 'lobby', id: m[1]!, intent: 'player' };
  if (location.pathname === '/admin') return { name: 'admin' };
  return { name: 'home' };
}

export function navigate(route: Route) {
  const path = route.name === 'lobby' ? `/lobby/${route.id}` : route.name === 'admin' ? '/admin' : '/';
  history.pushState(route, '', path);
  window.dispatchEvent(new CustomEvent('ct:navigate', { detail: route }));
}
