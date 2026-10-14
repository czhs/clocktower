import type { VoiceUsageView } from '@ct/protocol';
import { QUOTA_THRESHOLDS } from './constants.js';

// Participant-minutes = connected participants x real-time duration (LiveKit Cloud billing unit).
// Usage is accumulated from client heartbeats by the VoiceCoordinator and persisted by the
// VoiceUsageStore (SQLite implementation in @ct/db / services, in-memory here).

export type QuotaLevel = VoiceUsageView['level'];

export interface VoiceUsageMonth {
  byEnv: Record<string, number>;
  totalMs: number;
}

export interface VoiceUsageStore {
  /** Add `ms` participant-milliseconds for `env` in `month` (YYYY-MM, UTC). */
  add(env: string, month: string, ms: number): void;
  get(month: string): VoiceUsageMonth;
}

export class MemoryVoiceUsageStore implements VoiceUsageStore {
  private months = new Map<string, Map<string, number>>();
  add(env: string, month: string, ms: number): void {
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    let m = this.months.get(month);
    if (!m) this.months.set(month, (m = new Map()));
    m.set(env, (m.get(env) ?? 0) + ms);
  }
  get(month: string): VoiceUsageMonth {
    const byEnv: Record<string, number> = {};
    let totalMs = 0;
    for (const [env, ms] of this.months.get(month) ?? []) {
      byEnv[env] = ms;
      totalMs += ms;
    }
    return { byEnv, totalMs };
  }
}

export function monthKeyUtc(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function msToMinutes(ms: number): number {
  return ms / 60_000;
}

/** ok < 70% <= warn < 90% <= critical < 100% <= exhausted. A limit of 0 disables voice. */
export function quotaLevel(usedMinutes: number, limitMinutes: number): QuotaLevel {
  if (!(limitMinutes > 0)) return 'exhausted';
  const r = usedMinutes / limitMinutes;
  if (r >= QUOTA_THRESHOLDS.exhausted) return 'exhausted';
  if (r >= QUOTA_THRESHOLDS.critical) return 'critical';
  if (r >= QUOTA_THRESHOLDS.warn) return 'warn';
  return 'ok';
}

/** Minutes of wall-clock time a group of `participants` can talk before using `minutes`. */
export function sessionMinutesFor(minutes: number, participants: number): number {
  return participants > 0 ? minutes / participants : 0;
}

/**
 * Credit for one heartbeat: real elapsed time since the previous credited heartbeat, capped so a
 * client cannot inflate (or a long gap over-count) usage. Negative / NaN -> 0.
 */
export function heartbeatCreditMs(elapsedMs: number, capMs: number): number {
  if (!(elapsedMs > 0) || !Number.isFinite(elapsedMs)) return 0;
  return Math.min(elapsedMs, capMs);
}

export function buildUsageView(args: {
  configured: boolean;
  now: number;
  store: VoiceUsageStore;
  monthlyLimit: number;
  activeParticipants: number;
}): VoiceUsageView {
  const month = monthKeyUtc(args.now);
  const u = args.store.get(month);
  const minutes = msToMinutes(u.totalMs);
  const byEnv: Record<string, number> = {};
  for (const [k, v] of Object.entries(u.byEnv)) byEnv[k] = Math.round(msToMinutes(v) * 10) / 10;
  return {
    configured: args.configured,
    month,
    participantMinutes: Math.round(minutes * 10) / 10,
    monthlyLimit: args.monthlyLimit,
    level: quotaLevel(minutes, args.monthlyLimit),
    activeParticipants: args.activeParticipants,
    byEnv,
  };
}
