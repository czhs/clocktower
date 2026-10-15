import os from 'node:os';
import express, { type Request, type RequestHandler } from 'express';
import type { AdminStatusView } from '@ct/protocol';
import { createAdminRepo, type AccountRecord, type AdminAccountRow } from '@ct/db';
import type { Services } from '../services.js';
import { getRecentErrors } from '../log.js';
import { currentAccount, handler, HttpError, isReservedName, parseBody, rateLimit, requireAccount, sendError } from '../auth/http.js';
import { RateLimiter } from '../auth/rateLimit.js';
import { randomId } from '../auth/crypto.js';
import type { LobbyDirectory, LobbyRoomHandle } from '../directory/service.js';
import { voiceUsageView } from '../voice/index.js';
import {
  AccountId,
  AccountListQuery,
  AuditQuery,
  BulkDeleteBody,
  ConfirmSelfBody,
  DeleteBody,
  EmptyBody,
  LobbyId,
  RenameBody,
} from './schemas.js';
import type {
  AdminAccountsPage,
  AdminAccountView,
  AdminAuditView,
  AdminBulkDeleteResponse,
  AdminLobbyView,
  AdminOverview,
  AdminRotateResponse,
} from './types.js';

// Admin console API. Mounted under /api by services.ts (registerHttpRoutes → adminRouter), behind
// the global mutationGuard (JSON-only bodies + Origin check). EVERY /api/admin/* request passes
// requireAccount + requireAdmin first (401 / 403), including unknown admin paths.
//
//   GET  /api/admin/status                         legacy health view (AdminStatusView)
//   GET  /api/admin/overview                       system + totals + lobbies + voice + errors
//   GET  /api/admin/accounts?q&match&sort&dir&limit&offset
//   POST /api/admin/accounts/:id/rename            { displayName, confirmSelf? }
//   POST /api/admin/accounts/:id/rotate-passphrase { confirmSelf? }   -> passphrase shown ONCE
//   POST /api/admin/accounts/:id/signout-all       { confirmSelf? }
//   POST /api/admin/accounts/:id/delete            { confirm: 'delete' }
//   POST /api/admin/accounts/bulk-delete           { ids: [...], confirm: 'delete' }
//   POST /api/admin/lobbies/:id/close              {}
//   GET  /api/admin/audit?limit&before
//
// Every successful mutation is appended to the admin_audit table (append-only; DB triggers
// refuse UPDATE/DELETE) and logged as `admin action` with ids only — never passphrases/tokens.

const VERSION = process.env.CT_VERSION ?? 'dev';
const startedAt = Date.now();

/** Per-admin mutation budget: burst 30, then one every 2 s. */
export const ADMIN_MUTATION_LIMIT = { capacity: 30, refillPerSec: 0.5 };

type DirEntry = { id: string; summary: { name: string }; handle: LobbyRoomHandle | null };

/**
 * Live lobby entries, including room handles (for "is this account in a lobby?").
 * CONTRACT-REQUEST (lobby-auth): expose `LobbyDirectory.lobbyOfAccount(accountId)` publicly; until
 * then this reads the directory's private index (read-only, defensive if its shape changes).
 */
function directoryEntries(directory: LobbyDirectory): DirEntry[] {
  const entries = (directory as unknown as { entries?: unknown }).entries;
  return entries instanceof Map ? ([...entries.values()] as DirEntry[]) : [];
}

function lobbyOf(entries: DirEntry[], accountId: string): { id: string; name: string } | null {
  for (const e of entries) {
    try {
      if (e.handle?.isMember(accountId)) return { id: e.id, name: e.summary.name };
    } catch {
      // a room mid-dispose: treat as not a member
    }
  }
  return null;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function adminRouter(services: Services): express.Router {
  const r = express.Router();
  const repo = createAdminRepo(services.database);
  const mutationLimiter = new RateLimiter(ADMIN_MUTATION_LIMIT, 1000);
  const now = () => Date.now();

  const requireAdmin: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!services.auth.isAdmin(currentAccount(res).id)) return sendError(res, 403, 'forbidden', 'Admins only');
    next();
  };
  // Gate for the whole /admin subtree (also turns unknown /api/admin/* paths into 401/403 for
  // non-admins instead of revealing which routes exist).
  r.use('/admin', requireAccount(services), requireAdmin);
  const limited = rateLimit(mutationLimiter, (_req, res) => `admin:${currentAccount(res).id}`);

  const view = (row: AdminAccountRow, me: AccountRecord, entries: DirEntry[]): AdminAccountView => ({
    id: row.id,
    displayName: row.displayName,
    createdAt: iso(row.createdAt),
    lastSeenAt: iso(row.lastSeenAt),
    gamesPlayed: row.gamesPlayed,
    gamesWon: row.gamesWon,
    gamesStorytold: row.gamesStorytold,
    activeSessions: row.activeSessions,
    isAdmin: services.auth.isAdmin(row.id),
    isYou: row.id === me.id,
    lobby: lobbyOf(entries, row.id),
  });

  const audit = (
    admin: AccountRecord,
    action: string,
    target: { type: 'account' | 'lobby'; id: string; name?: string | null },
    detail?: Record<string, unknown>,
  ) => {
    repo.appendAudit({
      at: now(),
      adminAccountId: admin.id,
      adminName: admin.displayName,
      action,
      targetType: target.type,
      targetId: target.id,
      targetName: target.name ?? null,
      detail: detail ?? null,
    });
    // Server log: ids and action only (no names, passphrases or tokens).
    services.log.info('admin action', { action, adminId: admin.id, targetType: target.type, targetId: target.id });
  };

  const accountParam = (req: Request): string => {
    const p = AccountId.safeParse(req.params.id);
    if (!p.success) throw new HttpError(404, 'not_found', 'Account not found');
    return p.data;
  };
  const loadTarget = (id: string): AdminAccountRow => {
    const row = repo.getAccount(id, now());
    if (!row) throw new HttpError(404, 'not_found', 'Account not found');
    return row;
  };
  const requireSelfConfirm = (me: AccountRecord, targetId: string, confirmSelf: boolean | undefined, what: string) => {
    if (targetId === me.id && confirmSelf !== true) {
      throw new HttpError(409, 'conflict', `This is your own account — confirm that you want to ${what} yourself.`);
    }
  };
  /** Why an account may not be deleted (null = deletable). */
  const deleteBlocker = (row: AdminAccountRow, me: AccountRecord, entries: DirEntry[]): { status: number; reason: string } | null => {
    if (row.id === me.id) return { status: 403, reason: 'You cannot delete your own account here' };
    if (services.auth.isAdmin(row.id)) return { status: 403, reason: 'Admin accounts cannot be deleted (remove the id from ADMIN_ACCOUNT_IDS first)' };
    const lobby = lobbyOf(entries, row.id);
    if (lobby) return { status: 409, reason: `Currently in the lobby “${lobby.name}” — close that lobby first` };
    return null;
  };
  const tombstone = () => `deleted-${randomId(12)}`;

  // ---- read ---------------------------------------------------------------------------

  /** Legacy status view (kept for existing clients/tests). */
  r.get('/admin/status', (_req, res) => {
    const mem = process.memoryUsage();
    const body: AdminStatusView = {
      env: services.config.env,
      version: VERSION,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576) },
      cpu: { load1: Math.round((os.loadavg()[0] ?? 0) * 100) / 100, cores: os.cpus().length },
      lobbies: services.directory.adminView(),
      voice: voiceUsageView(),
      recentErrors: getRecentErrors().slice(-20),
    };
    res.json(body);
  });

  r.get('/admin/overview', (_req, res) => {
    const mem = process.memoryUsage();
    const lobbies: AdminLobbyView[] = services.directory.adminView().map((l) => {
      const s = services.directory.get(l.id);
      return {
        id: l.id,
        name: l.name,
        phase: l.phase,
        players: l.players,
        maxPlayers: s?.maxPlayers ?? null,
        connected: l.connected,
        storytellerName: s?.storytellerName ?? null,
        hostName: s?.hostName ?? null,
        createdAt: s ? iso(s.createdAt) : null,
      };
    });
    const t = repo.totals(now());
    const body: AdminOverview = {
      system: {
        env: services.config.env,
        version: VERSION,
        node: process.version,
        startedAt: iso(startedAt),
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576) },
        cpu: { load1: Math.round((os.loadavg()[0] ?? 0) * 100) / 100, cores: os.cpus().length },
      },
      totals: {
        ...t,
        lobbies: lobbies.length,
        activeGames: lobbies.filter((l) => l.phase !== 'waiting' && l.phase !== 'finished').length,
      },
      lobbies,
      voice: voiceUsageView(),
      recentErrors: getRecentErrors().slice(-20),
    };
    res.json(body);
  });

  r.get(
    '/admin/accounts',
    handler((req, res) => {
      const q = parseBody(AccountListQuery, req.query);
      const me = currentAccount(res);
      const { total, rows } = repo.listAccounts({ ...q, now: now() });
      const entries = directoryEntries(services.directory);
      const body: AdminAccountsPage = { accounts: rows.map((row) => view(row, me, entries)), total, limit: q.limit, offset: q.offset };
      res.json(body);
    }),
  );

  r.get(
    '/admin/audit',
    handler((req, res) => {
      const q = parseBody(AuditQuery, req.query);
      const entries: AdminAuditView[] = repo.listAudit({ limit: q.limit, before: q.before }).map((e) => ({
        id: e.id,
        at: iso(e.at),
        adminId: e.adminAccountId,
        adminName: e.adminName,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        targetName: e.targetName,
        detail: e.detail,
      }));
      res.json({ entries });
    }),
  );

  // ---- account mutations --------------------------------------------------------------

  r.post(
    '/admin/accounts/bulk-delete',
    limited,
    handler((req, res) => {
      const body = parseBody(BulkDeleteBody, req.body);
      const me = currentAccount(res);
      const entries = directoryEntries(services.directory);
      const out: AdminBulkDeleteResponse = { deleted: [], skipped: [] };
      for (const id of new Set(body.ids)) {
        const row = repo.getAccount(id, now());
        if (!row) {
          out.skipped.push({ id, displayName: null, reason: 'Not found' });
          continue;
        }
        const blocker = deleteBlocker(row, me, entries);
        if (blocker) {
          out.skipped.push({ id, displayName: row.displayName, reason: blocker.reason });
          continue;
        }
        if (repo.deleteAccountAnonymised(id, tombstone())) {
          out.deleted.push({ id, displayName: row.displayName });
          audit(me, 'account.delete', { type: 'account', id, name: row.displayName }, { bulk: true });
        } else out.skipped.push({ id, displayName: row.displayName, reason: 'Not found' });
      }
      res.json(out);
    }),
  );

  r.post(
    '/admin/accounts/:id/rename',
    limited,
    handler((req, res) => {
      const id = accountParam(req);
      const body = parseBody(RenameBody, req.body);
      const me = currentAccount(res);
      const row = loadTarget(id);
      requireSelfConfirm(me, id, body.confirmSelf, 'rename');
      if (isReservedName(body.displayName)) throw new HttpError(400, 'bad_request', 'That name is reserved, please pick another');
      if (body.displayName === row.displayName) return res.json(view(row, me, directoryEntries(services.directory)));
      services.accounts.updateProfile(id, { displayName: body.displayName });
      audit(me, 'account.rename', { type: 'account', id, name: body.displayName }, { from: row.displayName, to: body.displayName });
      res.json(view(loadTarget(id), me, directoryEntries(services.directory)));
    }),
  );

  r.post(
    '/admin/accounts/:id/rotate-passphrase',
    limited,
    handler(async (req, res) => {
      const id = accountParam(req);
      const body = parseBody(ConfirmSelfBody, req.body);
      const me = currentAccount(res);
      const row = loadTarget(id);
      if (id !== me.id && services.auth.isAdmin(id)) {
        throw new HttpError(403, 'forbidden', 'Another admin’s passphrase cannot be rotated from here');
      }
      requireSelfConfirm(me, id, body.confirmSelf, 'rotate the passphrase of (and sign out)');
      const passphrase = await services.auth.adminRotatePassphrase(id);
      if (!passphrase) throw new HttpError(404, 'not_found', 'Account not found');
      audit(me, 'account.rotate_passphrase', { type: 'account', id, name: row.displayName }, { sessionsRevoked: row.activeSessions });
      const out: AdminRotateResponse = { account: view(loadTarget(id), me, directoryEntries(services.directory)), passphrase };
      res.json(out);
    }),
  );

  r.post(
    '/admin/accounts/:id/signout-all',
    limited,
    handler((req, res) => {
      const id = accountParam(req);
      const body = parseBody(ConfirmSelfBody, req.body);
      const me = currentAccount(res);
      const row = loadTarget(id);
      requireSelfConfirm(me, id, body.confirmSelf, 'sign out');
      services.auth.adminSignOutEverywhere(id);
      audit(me, 'account.signout_all', { type: 'account', id, name: row.displayName }, { sessionsRevoked: row.activeSessions });
      res.json(view(loadTarget(id), me, directoryEntries(services.directory)));
    }),
  );

  r.post(
    '/admin/accounts/:id/delete',
    limited,
    handler((req, res) => {
      const id = accountParam(req);
      parseBody(DeleteBody, req.body);
      const me = currentAccount(res);
      const row = loadTarget(id);
      const blocker = deleteBlocker(row, me, directoryEntries(services.directory));
      if (blocker) throw new HttpError(blocker.status, blocker.status === 409 ? 'conflict' : 'forbidden', blocker.reason);
      if (!repo.deleteAccountAnonymised(id, tombstone())) throw new HttpError(404, 'not_found', 'Account not found');
      audit(me, 'account.delete', { type: 'account', id, name: row.displayName }, { gamesPlayed: row.gamesPlayed });
      res.json({ ok: true });
    }),
  );

  // ---- lobbies ------------------------------------------------------------------------

  /** POST /api/admin/lobbies/:id/close — disconnect everyone and dispose the lobby (SR-2 remedy). */
  r.post(
    '/admin/lobbies/:id/close',
    limited,
    handler((req, res) => {
      parseBody(EmptyBody, req.body);
      const me = currentAccount(res);
      const p = LobbyId.safeParse(req.params.id);
      const id = p.success ? p.data : '';
      const name = id ? (services.directory.adminView().find((l) => l.id === id)?.name ?? null) : null;
      if (!id || !services.directory.close(id)) throw new HttpError(404, 'not_found', 'Lobby not found');
      audit(me, 'lobby.close', { type: 'lobby', id, name });
      res.json({ ok: true });
    }),
  );

  return r;
}
