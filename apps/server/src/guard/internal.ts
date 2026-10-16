// (v2.3 security, sec-host — HOST-07 / WEB-5 / AUTH-11) Host-only routes and the "is this a direct
// local request" test.
//
// Behind the Cloudflare Tunnel EVERY request arrives from 127.0.0.1 (cloudflared), but always with
// X-Forwarded-For and CF-Connecting-IP set by the edge (clients cannot strip them). A request is
// "local" only if the socket peer is loopback AND neither header is present: the deploy scripts,
// smoke tests and test harness on hshi-u1 itself. Everything else gets a 404, exactly like an
// unknown route.
import type { Express, Request, Response } from 'express';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalRequest(req: Request): boolean {
  const peer = req.socket.remoteAddress ?? '';
  if (!LOOPBACK.has(peer) || !LOOPBACK.has(req.ip ?? '')) return false;
  return !req.headers['x-forwarded-for'] && !req.headers['cf-connecting-ip'] && !req.headers['forwarded'];
}

function notFound(res: Response) {
  res.status(404).json({ error: 'not_found', message: 'No such route' });
}

export interface InternalRouteDeps {
  env: string;
  version: string;
  activeGames: () => number;
}

/**
 * GET /healthz            public liveness only: `{ ok: true }` (no env, no commit).
 * GET /internal/version   local only: `{ ok, env, version }` — deploy/test health checks match the exact commit here.
 * GET /internal/active-games  local only: `{ activeGames }` — the prod deploy guard.
 */
export function registerInternalRoutes(app: Express, deps: InternalRouteDeps): void {
  app.get('/healthz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  });
  app.get('/internal/version', (req, res) => {
    if (!isLocalRequest(req)) return notFound(res);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, env: deps.env, version: deps.version });
  });
  app.get('/internal/active-games', (req, res) => {
    if (!isLocalRequest(req)) return notFound(res);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ activeGames: deps.activeGames() });
  });
}
