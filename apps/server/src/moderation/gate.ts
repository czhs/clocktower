// (v2.3 OPS-1/2, sec-ops) /api gate for the panic switches and network blocks. Mounted once in
// services.registerHttpRoutes right after mutationGuard (body already parsed by express.json).
//   - network block (ipKey of req.ip; IPv6 per /64): sign-up, sign-in, lobby create, join tickets
//   - sign-up mode: open | code (invite code in the body) | closed
//   - maintenance: every /api route except sign-in/out, /me and /admin answers 503 'maintenance'
//     (games already running keep going; static files stay up so the client can show the notice)
import type { RequestHandler, Response } from 'express';
import type { Services } from '../services.js';
import { clientIp } from '../auth/http.js';
import type { ModerationError } from './service.js';

const NETWORK_GATED = /^\/(auth\/create|auth\/signin|lobbies|lobbies\/[^/]+\/ticket)\/?$/;
const MAINTENANCE_ALLOWED = /^\/(auth\/signin|auth\/signout|auth\/signout-all|me|admin(\/.*)?)\/?$/;

export function sendModerationError(res: Response, e: ModerationError): void {
  res.status(e.status).json({ error: e.code, message: e.message });
}

export function moderationGate(services: Services): RequestHandler {
  return (req, res, next) => {
    const mod = services.moderation;
    const path = req.path;
    if (req.method === 'POST' && NETWORK_GATED.test(path) && mod.ipBlock(clientIp(req))) {
      return sendModerationError(res, mod.blockedError());
    }
    const m = mod.maintenance();
    if (m.on && !MAINTENANCE_ALLOWED.test(path)) {
      res.setHeader('Retry-After', '300');
      return sendModerationError(res, { status: 503, code: 'maintenance', message: m.message });
    }
    if (req.method === 'POST' && path === '/auth/create') {
      const body = req.body as { inviteCode?: unknown } | undefined;
      const err = mod.signupCheck(typeof body?.inviteCode === 'string' ? body.inviteCode : undefined);
      if (err) return sendModerationError(res, err);
    }
    next();
  };
}
