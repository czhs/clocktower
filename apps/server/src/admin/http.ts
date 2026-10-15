import os from 'node:os';
import express from 'express';
import type { AdminStatusView } from '@ct/protocol';
import type { Services } from '../services.js';
import { getRecentErrors } from '../log.js';
import { currentAccount, requireAccount, sendError } from '../auth/http.js';
import { voiceUsageView } from '../voice/index.js';

const VERSION = process.env.CT_VERSION ?? 'dev';
const startedAt = Date.now();

/** GET /api/admin/status — only for accounts listed in ADMIN_ACCOUNT_IDS. */
export function adminRouter(services: Services): express.Router {
  const r = express.Router();
  r.get('/admin/status', requireAccount(services), (_req, res) => {
    if (!services.auth.isAdmin(currentAccount(res).id)) return sendError(res, 403, 'forbidden', 'Admins only');
    const mem = process.memoryUsage();
    const view: AdminStatusView = {
      env: services.config.env,
      version: VERSION,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576) },
      cpu: { load1: Math.round((os.loadavg()[0] ?? 0) * 100) / 100, cores: os.cpus().length },
      lobbies: services.directory.adminView(),
      voice: voiceUsageView(),
      recentErrors: getRecentErrors().slice(-20),
    };
    res.setHeader('Cache-Control', 'no-store');
    res.json(view);
  });
  /** POST /api/admin/lobbies/:id/close — disconnect everyone and dispose the lobby (SR-2 remedy). */
  r.post('/admin/lobbies/:id/close', requireAccount(services), (req, res) => {
    const account = currentAccount(res);
    if (!services.auth.isAdmin(account.id)) return sendError(res, 403, 'forbidden', 'Admins only');
    const id = String(req.params.id ?? '');
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(id) || !services.directory.close(id)) return sendError(res, 404, 'not_found', 'Lobby not found');
    services.log.info('admin closed lobby', { lobbyId: id, adminId: account.id });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  });
  return r;
}
