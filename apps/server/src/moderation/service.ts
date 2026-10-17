// (v2.3 OPS-1/2/6, sec-ops) Moderation + ops service: account suspensions, network blocks, the
// runtime panic switches (sign-ups, maintenance, voice, global sign-out), per-lobby moderation
// state and the player-report queue. Created once by services.ts; everything persistent lives in
// the DB (migration 6), per-lobby state in memory.
//
// Env overrides (config.ops, OPS_* keys) win over the admin console's stored values, so the switches
// still work when the console is unreachable or the admin account is lost.
import { createModerationRepo, type IpBlock, type ModerationRepo, type ReportRow, type Suspension } from '@ct/db';
import type { ApiErrorCode, ReportReason } from '@ct/protocol';
import type { AppConfig } from '../config.js';
import type { Database } from '@ct/db';
import type { Logger } from '../rooms/modules.js';
import { timingSafeEqual } from 'node:crypto';
import { isBannableNetwork, LobbyModeration, type ReportLine } from './lobby.js';
import { configureVoiceFlagStore, voiceControlState } from '../voice/control.js'; // (sec-voice VOICE-6)
import type { SettingsRegistry } from '../settings/registry.js';

export type SignupMode = 'open' | 'code' | 'closed';

export interface OpsState {
  signups: { mode: SignupMode; codeSet: boolean; fromEnv: boolean };
  maintenance: { on: boolean; message: string; fromEnv: boolean };
  /** From sec-voice's kill switch (voice/control.ts): env VOICE_DISABLED wins over the admin flag. */
  voice: { on: boolean; disabledBy: 'env' | 'admin' | 'unknown' | null; reason: string | null };
}

export interface OpsPatch {
  signupMode?: SignupMode;
  /** New invite code (6..128 chars); null clears it. */
  signupCode?: string | null;
  maintenance?: boolean;
  maintenanceMessage?: string;
  voice?: boolean;
}

export { DEFAULT_MAINTENANCE_MESSAGE } from '../settings/defs.js';
/** Resolved reports are deleted this long after resolution (retention decision 2026-10-16). */
export const REPORT_RETENTION_MS = 90 * 86_400_000; // default of settings 'reports.retentionDays'

export interface ModerationError {
  status: number;
  code: ApiErrorCode;
  message: string;
}

export interface ReportInput {
  lobbyId: string;
  lobbyName: string;
  phase: string;
  dayNumber: number | null;
  reporter: { accountId: string; pid: string; name: string };
  target: { accountId: string; pid: string; name: string };
  reason: ReportReason;
  note: string | null;
  lines: ReportLine[];
  members: { pid: string; name: string }[];
}

const eq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createModeration(deps: { database: Database; config: AppConfig; log: Logger; settings: SettingsRegistry; now?: () => number }) {
  const repo: ModerationRepo = createModerationRepo(deps.database);
  const now = deps.now ?? Date.now;
  const env = deps.config.ops;
  const settings = deps.settings;
  const lobbies = new Map<string, LobbyModeration>();
  // The admin voice switch is persisted here (ops_flags 'voice' = enabled) and applied by sec-voice's
  // process-wide kill switch, which revokes every grant at once (VOICE-6). Exposed in the settings
  // registry as 'voice.enabled' (external).
  configureVoiceFlagStore({
    load: () => repo.flags().voice === false,
    save: (disabled) => repo.setFlag('voice', !disabled, 'admin', now()),
  });

  // Start-up global sign-out (OPS_SESSIONS_NOT_BEFORE): sessions created before it are deleted.
  if (env.sessionsNotBefore && Number.isFinite(env.sessionsNotBefore)) {
    const n = repo.revokeSessionsBefore(env.sessionsNotBefore).length;
    deps.log.warn('ops: sessions created before OPS_SESSIONS_NOT_BEFORE were deleted', { accounts: n });
  }

  function state(): OpsState {
    const v = voiceControlState();
    return {
      signups: { mode: settings.get<SignupMode>('signups.mode'), codeSet: settings.get<string>('signups.inviteCode') !== '', fromEnv: settings.isLocked('signups.mode') },
      maintenance: { on: settings.get<boolean>('ops.maintenance'), message: settings.get<string>('ops.maintenanceMessage'), fromEnv: settings.isLocked('ops.maintenance') },
      voice: { on: !v.disabled, disabledBy: v.disabledBy, reason: v.reason },
    };
  }

  /** Panic-tab patch -> registry keys (each change validated, persisted, applied by the registry). */
  const OPS_KEYS: [keyof OpsPatch, string][] = [
    ['signupMode', 'signups.mode'],
    ['signupCode', 'signups.inviteCode'],
    ['maintenance', 'ops.maintenance'],
    ['maintenanceMessage', 'ops.maintenanceMessage'],
    ['voice', 'voice.enabled'],
  ];

  const service = {
    repo,
    settings,

    // ---- ops switches ----------------------------------------------------------------------
    state,
    /** Applies a Panic-tab patch through the registry. Returns [registry id, old, new] per change. */
    setOps(patch: OpsPatch, adminAccountId: string): { id: string; old: unknown; value: unknown }[] {
      const changed: { id: string; old: unknown; value: unknown }[] = [];
      for (const [k, id] of OPS_KEYS) {
        let v = patch[k];
        if (v === undefined) continue;
        if (v === null) v = '';
        if (settings.get(id) === v) continue;
        const r = settings.set(id, v, adminAccountId);
        changed.push({ id, old: r.old, value: r.value });
      }
      return changed;
    },
    maintenance(): { on: boolean; message: string } {
      const m = state().maintenance;
      return { on: m.on, message: m.message };
    },
    /** null = this sign-up may proceed. */
    signupCheck(inviteCode: string | undefined): ModerationError | null {
      const mode = settings.get<SignupMode>('signups.mode');
      if (mode === 'closed') return { status: 403, code: 'signups_closed', message: 'New accounts are paused right now. Ask the host for an invite later.' };
      if (mode === 'code') {
        const code = settings.get<string>('signups.inviteCode');
        if (!code) return { status: 403, code: 'signups_closed', message: 'New accounts are invite-only right now.' };
        if (!inviteCode) return { status: 403, code: 'invite_required', message: 'New accounts need an invite code from the host.' };
        if (!eq(inviteCode.trim(), code)) return { status: 403, code: 'invite_required', message: 'That invite code is not right.' };
      }
      return null;
    },

    // ---- suspensions -----------------------------------------------------------------------
    suspension(accountId: string): Suspension | null {
      return repo.suspension(accountId, now());
    },
    suspendedError(s: Suspension): ModerationError {
      const until = s.until ? ` until ${new Date(s.until).toISOString().slice(0, 10)}` : '';
      return { status: 403, code: 'suspended', message: `This account is suspended${until}. Reason: ${s.reason}` };
    },
    suspend(accountId: string, reason: string, days: number | null, adminAccountId: string): Suspension {
      const t = now();
      const s: Suspension = { accountId, at: t, until: days ? t + days * 86_400_000 : null, reason, adminAccountId };
      repo.suspend(s);
      return s;
    },
    unsuspend(accountId: string): boolean {
      return repo.unsuspend(accountId);
    },

    // ---- networks ----------------------------------------------------------------------------
    /** Remember the network an account last used (sign-up, sign-in, join ticket). Loopback ignored. */
    noteIp(accountId: string, ipKey: string): void {
      if (!isBannableNetwork(ipKey)) return;
      try {
        repo.noteIp(accountId, ipKey, now());
      } catch (e) {
        deps.log.warn('moderation: noteIp failed', { err: e instanceof Error ? e.message : String(e) });
      }
    },
    lastIpKey(accountId: string): string | null {
      return repo.lastIp(accountId)?.ipKey ?? null;
    },
    ipBlock(ipKey: string): IpBlock | null {
      return isBannableNetwork(ipKey) ? repo.ipBlock(ipKey, now()) : null;
    },
    blockedError(): ModerationError {
      return { status: 403, code: 'blocked', message: 'Access from your network has been blocked by the server admin.' };
    },
    block(ipKey: string, reason: string, days: number | null, adminAccountId: string): IpBlock {
      const t = now();
      const b: IpBlock = { key: ipKey, at: t, until: days ? t + days * 86_400_000 : null, reason, adminAccountId };
      repo.block(b);
      return b;
    },
    unblock(ipKey: string): boolean {
      return repo.unblock(ipKey);
    },

    // ---- lobbies ------------------------------------------------------------------------------
    lobby(lobbyId: string): LobbyModeration {
      let l = lobbies.get(lobbyId);
      if (!l) {
        l = new LobbyModeration(now, {
          chatFilter: settings.get('chat.defaultFilter'),
          duplicateWindowMs: () => settings.get<number>('chat.duplicateWindowSec') * 1000,
          lobbyLinesPerSec: settings.get<number>('chat.lobbyLinesPerSec'),
          reportsPerLobby: () => settings.get<number>('reports.perLobbyMax'),
        });
        lobbies.set(lobbyId, l);
      }
      return l;
    },
    dropLobby(lobbyId: string): void {
      lobbies.delete(lobbyId);
    },
    /** (v2.4 P3) Live per-lobby moderation states (diagnostics / leak tests). */
    lobbyCount(): number {
      return lobbies.size;
    },

    // ---- reports ------------------------------------------------------------------------------
    fileReport(r: ReportInput): number {
      const context = {
        lobby: { id: r.lobbyId, name: r.lobbyName, phase: r.phase, day: r.dayNumber },
        reporter: { pid: r.reporter.pid, name: r.reporter.name },
        target: { pid: r.target.pid, name: r.target.name },
        members: r.members,
        lines: r.lines,
      };
      const id = repo.addReport({
        at: now(),
        reporterAccountId: r.reporter.accountId,
        targetAccountId: r.target.accountId,
        lobbyId: r.lobbyId,
        reason: r.reason,
        note: r.note,
        context,
      });
      deps.log.info('player reported', { reportId: id, lobbyId: r.lobbyId, reason: r.reason });
      return id;
    },
    reports(status: 'open' | 'resolved'): ReportRow[] {
      return repo.reports(status);
    },

    // ---- housekeeping -------------------------------------------------------------------------
    purge(): void {
      const t = now();
      repo.purge(t, t - settings.get<number>('reports.retentionDays') * 86_400_000);
    },
    /** Global sign-out: every session except `keepTokenHash` is deleted. Returns the affected account ids. */
    revokeAllSessions(keepTokenHash: string): string[] {
      return repo.revokeSessionsBefore(now() + 1, keepTokenHash);
    },
  };
  return service;
}

export type ModerationService = ReturnType<typeof createModeration>;
