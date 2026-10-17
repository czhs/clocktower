import type { Database } from '../database.js';

// (v2.3 OPS-1/2/6) Moderation storage: suspensions, network blocks, last network key per account,
// runtime ops switches and player reports. Plain prepared statements (bound parameters only).

export interface Suspension {
  accountId: string;
  at: number;
  /** null = until lifted. */
  until: number | null;
  reason: string;
  adminAccountId: string;
}

export interface IpBlock {
  key: string;
  at: number;
  until: number | null;
  reason: string;
  adminAccountId: string;
}

export type ReportStatus = 'open' | 'resolved';

export interface ReportRow {
  id: number;
  at: number;
  reporterAccountId: string;
  targetAccountId: string;
  lobbyId: string;
  reason: string;
  note: string | null;
  context: unknown;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: number | null;
  resolution: string | null;
}

export interface NewReport {
  at: number;
  reporterAccountId: string;
  targetAccountId: string;
  lobbyId: string;
  reason: string;
  note: string | null;
  context: unknown;
}

const active = (until: number | null, now: number) => until === null || until > now;

export function createModerationRepo({ sqlite }: Database) {
  const getSusp = sqlite.prepare(
    'SELECT account_id AS accountId, at, until, reason, admin_account_id AS adminAccountId FROM account_suspensions WHERE account_id = ?',
  );
  const upsertSusp = sqlite.prepare(
    `INSERT INTO account_suspensions (account_id, at, until, reason, admin_account_id) VALUES (@accountId, @at, @until, @reason, @adminAccountId)
     ON CONFLICT(account_id) DO UPDATE SET at = excluded.at, until = excluded.until, reason = excluded.reason, admin_account_id = excluded.admin_account_id`,
  );
  const delSusp = sqlite.prepare('DELETE FROM account_suspensions WHERE account_id = ?');
  const listSusp = sqlite.prepare(
    'SELECT account_id AS accountId, at, until, reason, admin_account_id AS adminAccountId FROM account_suspensions',
  );

  const getBlock = sqlite.prepare('SELECT key, at, until, reason, admin_account_id AS adminAccountId FROM ip_blocks WHERE key = ?');
  const upsertBlock = sqlite.prepare(
    `INSERT INTO ip_blocks (key, at, until, reason, admin_account_id) VALUES (@key, @at, @until, @reason, @adminAccountId)
     ON CONFLICT(key) DO UPDATE SET at = excluded.at, until = excluded.until, reason = excluded.reason, admin_account_id = excluded.admin_account_id`,
  );
  const delBlock = sqlite.prepare('DELETE FROM ip_blocks WHERE key = ?');
  const listBlocks = sqlite.prepare('SELECT key, at, until, reason, admin_account_id AS adminAccountId FROM ip_blocks ORDER BY at DESC LIMIT 500');
  const purgeBlocks = sqlite.prepare('DELETE FROM ip_blocks WHERE until IS NOT NULL AND until <= ?');
  const purgeSusp = sqlite.prepare('DELETE FROM account_suspensions WHERE until IS NOT NULL AND until <= ?');

  const upsertIp = sqlite.prepare(
    `INSERT INTO account_ips (account_id, ip_key, at) VALUES (?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET ip_key = excluded.ip_key, at = excluded.at`,
  );
  const getIp = sqlite.prepare('SELECT ip_key AS ipKey, at FROM account_ips WHERE account_id = ?');

  const getFlags = sqlite.prepare('SELECT key, value_json AS json FROM ops_flags');
  const setFlag = sqlite.prepare(
    `INSERT INTO ops_flags (key, value_json, updated_at, admin_account_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, admin_account_id = excluded.admin_account_id`,
  );

  const REPORT_COLS = `id, at, reporter_account_id AS reporterAccountId, target_account_id AS targetAccountId, lobby_id AS lobbyId,
    reason, note, context_json AS contextJson, status, resolved_by AS resolvedBy, resolved_at AS resolvedAt, resolution`;
  const insReport = sqlite.prepare(
    `INSERT INTO reports (at, reporter_account_id, target_account_id, lobby_id, reason, note, context_json)
     VALUES (@at, @reporterAccountId, @targetAccountId, @lobbyId, @reason, @note, @contextJson)`,
  );
  const listReports = sqlite.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE status = ? ORDER BY at DESC LIMIT ?`);
  const getReport = sqlite.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`);
  const resolveReport = sqlite.prepare(
    "UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution = ? WHERE id = ? AND status = 'open'",
  );
  const countOpen = sqlite.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'");
  const purgeReports = sqlite.prepare("DELETE FROM reports WHERE status = 'resolved' AND resolved_at < ?");
  const sessionAccounts = sqlite.prepare('SELECT DISTINCT account_id AS accountId FROM sessions WHERE created_at < ?');
  const delSessionsBefore = sqlite.prepare('DELETE FROM sessions WHERE created_at < ? AND token_hash != ?');

  type RawReport = Omit<ReportRow, 'context'> & { contextJson: string };
  const report = (r: RawReport | undefined): ReportRow | null => {
    if (!r) return null;
    const { contextJson, ...rest } = r;
    let context: unknown = null;
    try {
      context = JSON.parse(contextJson);
    } catch {
      context = null;
    }
    return { ...rest, context };
  };

  return {
    // ---- suspensions -----------------------------------------------------------------
    /** The account's suspension if it is in force at `now` (expired rows are ignored). */
    suspension(accountId: string, now: number): Suspension | null {
      const s = getSusp.get(accountId) as Suspension | undefined;
      return s && active(s.until, now) ? s : null;
    },
    suspend(s: Suspension): void {
      upsertSusp.run(s);
    },
    unsuspend(accountId: string): boolean {
      return delSusp.run(accountId).changes > 0;
    },
    suspensions(now: number): Suspension[] {
      return (listSusp.all() as Suspension[]).filter((s) => active(s.until, now));
    },

    // ---- network blocks ----------------------------------------------------------------
    ipBlock(key: string, now: number): IpBlock | null {
      const b = getBlock.get(key) as IpBlock | undefined;
      return b && active(b.until, now) ? b : null;
    },
    block(b: IpBlock): void {
      upsertBlock.run(b);
    },
    unblock(key: string): boolean {
      return delBlock.run(key).changes > 0;
    },
    ipBlocks(now: number): IpBlock[] {
      return (listBlocks.all() as IpBlock[]).filter((b) => active(b.until, now));
    },

    // ---- last network key per account ----------------------------------------------------
    noteIp(accountId: string, ipKey: string, now: number): void {
      upsertIp.run(accountId, ipKey, now);
    },
    lastIp(accountId: string): { ipKey: string; at: number } | null {
      return (getIp.get(accountId) as { ipKey: string; at: number } | undefined) ?? null;
    },

    // ---- ops flags ---------------------------------------------------------------------
    flags(): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      for (const r of getFlags.all() as { key: string; json: string }[]) {
        try {
          out[r.key] = JSON.parse(r.json);
        } catch {
          // ignore a corrupt row: the default applies
        }
      }
      return out;
    },
    setFlag(key: string, value: unknown, adminAccountId: string, now: number): void {
      setFlag.run(key, JSON.stringify(value), now, adminAccountId);
    },

    // ---- reports -----------------------------------------------------------------------
    addReport(r: NewReport): number {
      return Number(insReport.run({ ...r, contextJson: JSON.stringify(r.context) }).lastInsertRowid);
    },
    reports(status: ReportStatus, limit = 100): ReportRow[] {
      return (listReports.all(status, limit) as RawReport[]).map((r) => report(r)!);
    },
    report(id: number): ReportRow | null {
      return report(getReport.get(id) as RawReport | undefined);
    },
    resolveReport(id: number, adminAccountId: string, resolution: string, now: number): boolean {
      return resolveReport.run(adminAccountId, now, resolution, id).changes > 0;
    },
    openReportCount(): number {
      return (countOpen.get() as { n: number }).n;
    },

    // ---- housekeeping / global revoke ----------------------------------------------------
    /** Drops expired blocks/suspensions and reports resolved before `reportsBefore`. */
    purge(now: number, reportsBefore: number): void {
      purgeBlocks.run(now);
      purgeSusp.run(now);
      purgeReports.run(reportsBefore);
    },
    /** Global revoke: deletes every session created before `before` except `keepTokenHash`; returns the affected account ids. */
    revokeSessionsBefore(before: number, keepTokenHash = ''): string[] {
      const ids = (sessionAccounts.all(before) as { accountId: string }[]).map((r) => r.accountId);
      delSessionsBefore.run(before, keepTokenHash);
      return ids;
    },
  };
}

export type ModerationRepo = ReturnType<typeof createModerationRepo>;
