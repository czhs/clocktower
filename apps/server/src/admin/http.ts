import os from 'node:os';
import express, { type Request, type RequestHandler, type Response } from 'express';
import type { AdminStatusView } from '@ct/protocol';
import { createAdminRepo, type AccountRecord, type AdminAccountRow } from '@ct/db';
import type { Services } from '../services.js';
import { getRecentErrors } from '../log.js';
import { diskView } from '../guard/disk.js';
import { accountModerationView, opsView, registerModerationAdmin } from '../moderation/admin.js'; // (v2.3 OPS)
import { clientRange, currentAccount, handler, HttpError, isReservedName, parseBody, rateLimit, requireAccount, sendError } from '../auth/http.js';
import { RateLimiter } from '../auth/rateLimit.js';
import { randomId } from '../auth/crypto.js';
import type { LobbyDirectory, LobbyRoomHandle } from '../directory/service.js';
import { voiceUsageView } from '../voice/index.js';
import { recordsRepo } from '../records/index.js'; // (records)
import {
  AccountId,
  AccountListQuery,
  AuditQuery,
  BulkDeleteBody,
  ConfirmSelfBody,
  DeleteBody,
  EmptyBody,
  GameQuery,
  GamesQuery,
  LobbyId,
  MatchId,
  RenameBody,
} from './schemas.js';
import type {
  AdminAccountsPage,
  AdminAccountView,
  AdminAuditView,
  AdminBulkDeleteResponse,
  AdminGamesPage,
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
//   GET  /api/admin/games?limit&before&accountId       (records) saved games, newest first
//   GET  /api/admin/games/:id[?download=1]             (records) one full game record (JSON)
//
// Every successful mutation is appended to the admin_audit table (append-only; DB triggers
// refuse UPDATE/DELETE) and logged as `admin action` with ids only — never passphrases/tokens.

const VERSION = process.env.CT_VERSION ?? 'dev';
const startedAt = Date.now();

/** (v2.3 AUTH-8) Account takeover / deletion needs a sign-in this recent, or the passphrase again. */
export const STEP_UP_MS = 15 * 60_000;

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

  // (v2.3 AUTH-9) refused admin attempts leave a (rate-limited) trace: who probed which path.
  const deniedLog = new RateLimiter({ capacity: 5, refillPerSec: 1 / 60 }, 1000);
  const requireAdmin: RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const id = currentAccount(res).id;
    if (!services.auth.isAdmin(id)) {
      if (deniedLog.take(id)) services.log.warn('admin access denied', { accountId: id, method: req.method, path: req.originalUrl.split('?')[0]!.slice(0, 80) });
      return sendError(res, 403, 'forbidden', 'Admins only');
    }
    next();
  };

  /**
   * (v2.3 AUTH-8) Step-up for actions that take over or destroy accounts: the admin signed in within
   * the last STEP_UP_MS, or re-enters their own passphrase now (checked through the scrypt gate).
   */
  const stepUp = async (req: Request, res: Response, passphrase: string | undefined): Promise<void> => {
    const me = currentAccount(res);
    if (passphrase !== undefined) {
      const ok = await services.scryptGate.run(clientRange(req), () => services.auth.verifyPassphrase(me.id, passphrase));
      if (ok) return;
      throw new HttpError(401, 'reauth_required', 'That is not your passphrase');
    }
    const since = res.locals.sessionCreatedAt as number | undefined;
    if (since !== undefined && now() - since < STEP_UP_MS) return;
    throw new HttpError(401, 'reauth_required', 'Confirm with your own passphrase to do this');
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
    ...accountModerationView(services, row.id), // (v2.3 OPS-1) suspension + whether a network is known
  });

  const audit = (
    admin: AccountRecord,
    action: string,
    target: { type: 'account' | 'lobby' | 'game'; id: string; name?: string | null },
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
        disk: diskView(services.config.databasePath), // v2.3 HOST-04
      },
      ops: opsView(services), // (v2.3 OPS-2/4) panic switches, open reports, last backup marker
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

  // ---- (records) saved games: read-only -------------------------------------------------

  r.get(
    '/admin/games',
    handler((req, res) => {
      const q = parseBody(GamesQuery, req.query);
      const repo = recordsRepo(services.database);
      const body: AdminGamesPage = {
        games: repo.listRecords(q).map((g) => ({
          matchId: g.matchId,
          lobbyId: g.lobbyId,
          lobbyName: g.lobbyName,
          script: g.script,
          status: g.status,
          startedAt: iso(g.startedAt),
          endedAt: iso(g.endedAt),
          durationSec: Math.max(0, Math.round((g.endedAt - g.startedAt) / 1000)),
          playerCount: g.playerCount,
          winner: g.winner,
          reason: g.reason,
          storytellerName: g.storytellerName,
          storytellerAccountId: g.storytellerAccountId,
        })),
        total: repo.count(),
      };
      res.json(body);
    }),
  );

  r.get(
    '/admin/games/:id',
    handler((req, res) => {
      const p = MatchId.safeParse(req.params.id);
      const q = parseBody(GameQuery, req.query);
      const json = p.success ? recordsRepo(services.database).getRecordJson(p.data) : null;
      if (!p.success || !json) throw new HttpError(404, 'not_found', 'Game not found');
      // (v2.3 AUTH-8) full records hold every grimoire and night info: who looked is audited.
      audit(currentAccount(res), q.download === '1' ? 'game.download' : 'game.view', { type: 'game', id: p.data });
      if (q.download === '1') res.setHeader('Content-Disposition', `attachment; filename="clocktower-game-${p.data}.json"`);
      res.type('application/json').send(json);
    }),
  );

  // ---- account mutations --------------------------------------------------------------

  r.post(
    '/admin/accounts/bulk-delete',
    limited,
    handler(async (req, res) => {
      const body = parseBody(BulkDeleteBody, req.body);
      const me = currentAccount(res);
      await stepUp(req, res, body.passphrase); // (v2.3 AUTH-8)
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
        services.auth.revokeAll(id, 'account_deleted'); // (v2.3 AUTH-1) open streams / sockets too
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
      await stepUp(req, res, body.passphrase); // (v2.3 AUTH-8)
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
    handler(async (req, res) => {
      const id = accountParam(req);
      const body = parseBody(DeleteBody, req.body);
      const me = currentAccount(res);
      const row = loadTarget(id);
      const blocker = deleteBlocker(row, me, directoryEntries(services.directory));
      if (blocker) throw new HttpError(blocker.status, blocker.status === 409 ? 'conflict' : 'forbidden', blocker.reason);
      await stepUp(req, res, body.passphrase); // (v2.3 AUTH-8)
      services.auth.revokeAll(id, 'account_deleted'); // (v2.3 AUTH-1) open streams / sockets too
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

  // (v2.3 OPS-1/2/6) suspend / network blocks / panic switches / reports (moderation/admin.ts)
  registerModerationAdmin(r, services, { audit, limited, isAdmin: (id) => services.auth.isAdmin(id), stepUp });

  return r;
}
