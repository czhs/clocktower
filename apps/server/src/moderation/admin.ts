// (v2.3 OPS-1/2/6, sec-ops) Admin console API for safety + panic switches. Registered inside
// adminRouter (so every route is behind requireAccount + requireAdmin and the admin mutation budget);
// every mutation is appended to admin_audit.
//
//   GET  /api/admin/ops                              switches + open reports + last backup
//   POST /api/admin/ops                              { signupMode?, signupCode?, maintenance?, maintenanceMessage?, voice? }
//   POST /api/admin/ops/revoke-all-sessions          { confirm: 'sign everyone out' }  (keeps the caller's session)
//   POST /api/admin/lobbies/close-all                { confirm: 'close all' }
//   POST /api/admin/accounts/:id/suspend             { reason, days? }
//   POST /api/admin/accounts/:id/unsuspend           {}
//   POST /api/admin/accounts/:id/block-network       { reason, days? }  (the account's last network; IPv6 per /64)
//   GET  /api/admin/ip-blocks
//   POST /api/admin/ip-blocks                        { ip, reason, days? }
//   POST /api/admin/ip-blocks/remove                 { key }
//   GET  /api/admin/reports?status=open|resolved
//   POST /api/admin/reports/:id/resolve              { action: 'dismissed'|'warned'|'suspended', note? }
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type express from 'express';
import { z } from 'zod';
import type { AccountRecord } from '@ct/db';
import type { Services } from '../services.js';
import { currentAccount, handler, HttpError, ipKey, parseBody, sessionToken } from '../auth/http.js';
import { hashToken } from '../auth/crypto.js';
import { AccountId } from '../admin/schemas.js';
import { SETTING_GROUPS, SettingError } from '../settings/index.js';

type Audit = (
  admin: AccountRecord,
  action: string,
  target: { type: 'account' | 'lobby'; id: string; name?: string | null },
  detail?: Record<string, unknown>,
) => void;

const Reason = z.string().trim().min(3).max(200);
const Days = z.number().int().min(1).max(3650).nullable().optional();
const OpsBody = z
  .object({
    signupMode: z.enum(['open', 'code', 'closed']).optional(),
    signupCode: z.string().trim().min(6).max(128).nullable().optional(),
    maintenance: z.boolean().optional(),
    maintenanceMessage: z.string().trim().min(1).max(200).optional(),
    voice: z.boolean().optional(),
  })
  .strict();
const SuspendBody = z.object({ reason: Reason, days: Days }).strict();
const BlockIpBody = z.object({ ip: z.string().trim().min(2).max(64), reason: Reason, days: Days }).strict();
const BlockAccountNetBody = z.object({ reason: Reason, days: Days }).strict();
const KeyBody = z.object({ key: z.string().min(2).max(64) }).strict();
const ResolveBody = z.object({ action: z.enum(['dismissed', 'warned', 'suspended']), note: z.string().trim().max(300).optional() }).strict();
const ReportsQuery = z.object({ status: z.enum(['open', 'resolved']).default('open') });
const Confirm = (word: string) => z.object({ confirm: z.literal(word) }).strict();

/** IPv4 dotted quad or an IPv6 address (any form); validated loosely, then normalised by ipKey(). */
const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]{2,39}(\/\d{1,3})?)$/;

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** `.last-backup` marker the backup unit writes next to the DB (OPS-4); null when absent. */
export function lastBackupView(databasePath: string): { at: string; ok: boolean; detail: string } | null {
  const file = path.join(path.dirname(databasePath), '.last-backup');
  try {
    const st = statSync(file);
    const text = readFileSync(file, 'utf8').trim().slice(0, 200);
    return { at: st.mtime.toISOString(), ok: !/^fail/i.test(text), detail: text };
  } catch {
    return null;
  }
}

/** Admin-only extras for an account row (AdminAccountView). */
export function accountModerationView(services: Services, accountId: string) {
  const s = services.moderation.suspension(accountId);
  return {
    suspended: s ? { reason: s.reason, until: iso(s.until), at: iso(s.at)! } : null,
    networkKnown: services.moderation.lastIpKey(accountId) !== null,
  };
}

export function opsView(services: Services) {
  return {
    ...services.moderation.state(),
    openReports: services.moderation.repo.openReportCount(),
    lastBackup: lastBackupView(services.config.databasePath),
  };
}

export function registerModerationAdmin(
  r: express.Router,
  services: Services,
  h: {
    audit: Audit;
    limited: express.RequestHandler;
    isAdmin: (id: string) => boolean;
    /** (AUTH-8) step-up: recent sign-in or the admin's own passphrase; throws 401 reauth_required. */
    stepUp: (req: express.Request, res: express.Response, passphrase: string | undefined) => Promise<void>;
  },
): void {
  const mod = services.moderation;
  const reg = services.settings;
  /** setting.change audit row: old -> new (sensitive keys: only whether a value is set). */
  const auditSetting = (me: AccountRecord, id: string, old: unknown, value: unknown) => {
    const def = reg.def(id);
    const detail = def?.sensitive ? { id, set: value !== '' && value !== null } : { id, from: old, to: value };
    h.audit(me, 'setting.change', { type: 'lobby', id: '*', name: def?.label ?? id }, detail);
  };

  // ---- settings registry ("Security & limits") -------------------------------------------
  r.get('/admin/settings', (_req, res) => {
    res.json({ groups: SETTING_GROUPS, settings: reg.view(), degraded: reg.degraded });
  });

  const SettingBody = z.object({ value: z.union([z.boolean(), z.number(), z.string().max(500)]), passphrase: z.string().min(1).max(256).optional() }).strict();
  const ResetBody = z.object({ passphrase: z.string().min(1).max(256).optional() }).strict();
  const settingId = (req: express.Request) => {
    const id = String(req.params.id);
    if (!/^[a-z][A-Za-z0-9.]{1,63}$/.test(id) || !reg.def(id)) throw new HttpError(404, 'not_found', 'No such setting');
    return id;
  };
  const change = async (req: express.Request, res: express.Response, id: string, value: unknown, passphrase: string | undefined) => {
    const me = currentAccount(res);
    if (reg.def(id)!.dangerous) await h.stepUp(req, res, passphrase);
    let r: { old: unknown; value: unknown };
    try {
      r = reg.set(id, value, me.id);
    } catch (e) {
      if (e instanceof SettingError) throw new HttpError(400, 'bad_request', e.message);
      throw e;
    }
    auditSetting(me, id, r.old, r.value);
    res.json({ setting: reg.view().find((v) => v.id === id) });
  };
  r.post(
    '/admin/settings/:id',
    h.limited,
    handler(async (req, res) => {
      const id = settingId(req);
      const body = parseBody(SettingBody, req.body);
      await change(req, res, id, body.value, body.passphrase);
    }),
  );
  r.post(
    '/admin/settings/:id/reset',
    h.limited,
    handler(async (req, res) => {
      const id = settingId(req);
      const body = parseBody(ResetBody, req.body);
      await change(req, res, id, reg.def(id)!.default, body.passphrase);
    }),
  );
  const target = (req: express.Request) => {
    const p = AccountId.safeParse(req.params.id);
    const acc = p.success ? services.accounts.findById(p.data) : undefined;
    if (!acc) throw new HttpError(404, 'not_found', 'Account not found');
    return acc;
  };
  const notAdminOrSelf = (me: AccountRecord, acc: AccountRecord, what: string) => {
    if (acc.id === me.id) throw new HttpError(403, 'forbidden', `You cannot ${what} your own account`);
    if (h.isAdmin(acc.id)) throw new HttpError(403, 'forbidden', `Admin accounts cannot be ${what === 'suspend' ? 'suspended' : 'blocked'} (remove the id from ADMIN_ACCOUNT_IDS first)`);
  };

  // ---- ops switches -------------------------------------------------------------------------
  r.get('/admin/ops', (_req, res) => {
    res.json(opsView(services));
  });

  r.post(
    '/admin/ops',
    h.limited,
    handler((req, res) => {
      const body = parseBody(OpsBody, req.body);
      const me = currentAccount(res);
      let changed: ReturnType<typeof mod.setOps>;
      try {
        changed = mod.setOps(body, me.id);
      } catch (e) {
        if (e instanceof SettingError) throw new HttpError(400, 'bad_request', e.message);
        throw e;
      }
      for (const c of changed) auditSetting(me, c.id, c.old, c.value);
      res.json(opsView(services));
    }),
  );

  r.post(
    '/admin/ops/revoke-all-sessions',
    h.limited,
    handler((req, res) => {
      parseBody(Confirm('sign everyone out'), req.body);
      const me = currentAccount(res);
      const token = sessionToken(req, services);
      const accounts = mod.revokeAllSessions(token ? hashToken(token) : '');
      for (const id of accounts) if (id !== me.id) services.revocations.revoke(id, 'signed_out'); // live rooms + SSE (AUTH-1)
      h.audit(me, 'ops.revoke_all_sessions', { type: 'lobby', id: '*', name: 'server' }, { accounts: accounts.length });
      res.json({ ok: true, accounts: accounts.length });
    }),
  );

  r.post(
    '/admin/lobbies/close-all',
    h.limited,
    handler((req, res) => {
      parseBody(Confirm('close all'), req.body);
      const me = currentAccount(res);
      const ids = services.directory.adminView().map((l) => l.id);
      let closed = 0;
      for (const id of ids) if (services.directory.close(id)) closed++;
      h.audit(me, 'lobby.close_all', { type: 'lobby', id: '*', name: 'all lobbies' }, { closed });
      res.json({ ok: true, closed });
    }),
  );

  // ---- accounts -----------------------------------------------------------------------------
  r.post(
    '/admin/accounts/:id/suspend',
    h.limited,
    handler((req, res) => {
      const acc = target(req);
      const body = parseBody(SuspendBody, req.body);
      const me = currentAccount(res);
      notAdminOrSelf(me, acc, 'suspend');
      const s = mod.suspend(acc.id, body.reason, body.days ?? null, me.id);
      services.auth.revokeAll(acc.id); // sessions + live rooms / streams (AUTH-1)
      h.audit(me, 'account.suspend', { type: 'account', id: acc.id, name: acc.displayName }, { reason: body.reason, until: iso(s.until) });
      res.json({ ok: true, suspended: { reason: s.reason, until: iso(s.until), at: iso(s.at) } });
    }),
  );

  r.post(
    '/admin/accounts/:id/unsuspend',
    h.limited,
    handler((req, res) => {
      const acc = target(req);
      parseBody(z.object({}).strict(), req.body);
      const me = currentAccount(res);
      if (!mod.unsuspend(acc.id)) throw new HttpError(404, 'not_found', 'This account is not suspended');
      h.audit(me, 'account.unsuspend', { type: 'account', id: acc.id, name: acc.displayName });
      res.json({ ok: true });
    }),
  );

  r.post(
    '/admin/accounts/:id/block-network',
    h.limited,
    handler((req, res) => {
      const acc = target(req);
      const body = parseBody(BlockAccountNetBody, req.body);
      const me = currentAccount(res);
      notAdminOrSelf(me, acc, 'block');
      const key = mod.lastIpKey(acc.id);
      if (!key) throw new HttpError(409, 'conflict', 'No network is known for this account yet');
      if (key === mod.lastIpKey(me.id)) throw new HttpError(409, 'conflict', 'That is your own network');
      const b = mod.block(key, body.reason, body.days ?? null, me.id);
      // The key itself is kept out of the audit text (it is shown in the IP-block list for admins).
      h.audit(me, 'network.block', { type: 'account', id: acc.id, name: acc.displayName }, { reason: body.reason, until: iso(b.until) });
      res.json({ ok: true, key, until: iso(b.until) });
    }),
  );

  // ---- network blocks -----------------------------------------------------------------------
  r.get('/admin/ip-blocks', (_req, res) => {
    const now = Date.now();
    res.json({
      blocks: mod.repo.ipBlocks(now).map((b) => ({ key: b.key, at: iso(b.at), until: iso(b.until), reason: b.reason, adminAccountId: b.adminAccountId })),
    });
  });

  r.post(
    '/admin/ip-blocks',
    h.limited,
    handler((req, res) => {
      const body = parseBody(BlockIpBody, req.body);
      if (!IP_RE.test(body.ip)) throw new HttpError(400, 'bad_request', 'Enter an IPv4 or IPv6 address');
      const me = currentAccount(res);
      const key = ipKey(body.ip.replace(/\/\d+$/, ''));
      if (key === mod.lastIpKey(me.id)) throw new HttpError(409, 'conflict', 'That is your own network');
      const b = mod.block(key, body.reason, body.days ?? null, me.id);
      h.audit(me, 'network.block', { type: 'lobby', id: '*', name: 'network' }, { reason: body.reason, until: iso(b.until) });
      res.json({ ok: true, key, until: iso(b.until) });
    }),
  );

  r.post(
    '/admin/ip-blocks/remove',
    h.limited,
    handler((req, res) => {
      const body = parseBody(KeyBody, req.body);
      const me = currentAccount(res);
      if (!mod.unblock(body.key)) throw new HttpError(404, 'not_found', 'No such block');
      h.audit(me, 'network.unblock', { type: 'lobby', id: '*', name: 'network' });
      res.json({ ok: true });
    }),
  );

  // ---- reports ------------------------------------------------------------------------------
  r.get(
    '/admin/reports',
    handler((req, res) => {
      const q = parseBody(ReportsQuery, req.query);
      const name = (id: string) => services.accounts.findById(id)?.displayName ?? null;
      res.json({
        reports: mod.reports(q.status).map((x) => ({
          id: x.id,
          at: iso(x.at),
          reason: x.reason,
          note: x.note,
          lobbyId: x.lobbyId,
          reporter: { accountId: x.reporterAccountId, name: name(x.reporterAccountId) },
          target: { accountId: x.targetAccountId, name: name(x.targetAccountId), suspended: !!mod.suspension(x.targetAccountId) },
          context: x.context,
          status: x.status,
          resolvedAt: iso(x.resolvedAt),
          resolution: x.resolution,
        })),
      });
    }),
  );

  r.post(
    '/admin/reports/:id/resolve',
    h.limited,
    handler((req, res) => {
      const id = Number(req.params.id);
      const body = parseBody(ResolveBody, req.body);
      const me = currentAccount(res);
      const rep = Number.isInteger(id) ? mod.repo.report(id) : null;
      if (!rep) throw new HttpError(404, 'not_found', 'Report not found');
      const resolution = body.note ? `${body.action}: ${body.note}` : body.action;
      if (!mod.repo.resolveReport(id, me.id, resolution, Date.now())) throw new HttpError(409, 'conflict', 'This report was already resolved');
      h.audit(me, 'report.resolve', { type: 'account', id: rep.targetAccountId, name: services.accounts.findById(rep.targetAccountId)?.displayName ?? null }, { reportId: id, action: body.action });
      res.json({ ok: true });
    }),
  );
}
