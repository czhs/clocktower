// (v2.3 OPS-6, sec-ops) Per-lobby moderation state, owned by the moderation service and used by
// GameRoom through small hook lines. Lives as long as the lobby (dropped on room dispose).
//   - removals (host/ST kick): by account AND by the account's network key, until unbanned
//   - chat mutes (by account, so they survive reconnects / new devices)
//   - chat filter mode (host setting)
//   - chat guards: duplicate line per pid, per-lobby ceiling
//   - a ring buffer of the last chat lines WITH their server-computed audience, so a report can
//     attach only lines the reporter actually received
import { DEFAULT_CHAT_FILTER, REPORT_MAX_MESSAGES, type ChatFilterMode, type ChatMessage, type RemovedMemberView } from '@ct/protocol';
import { randomId } from '../auth/crypto.js';
import { RateLimiter } from '../auth/rateLimit.js';
import { normalizeFilterMode } from './chatFilter.js';

/** Chat lines kept per lobby for report context (in memory only; never persisted unless reported). */
export const CHAT_RING_SIZE = 100;
/** The same (normalised) line from the same member within this window is dropped. */
export const DUPLICATE_WINDOW_MS = 5_000;
/** Whole-lobby chat ceiling (fan-out cost bound): burst 30, 30 lines/s. */
export const LOBBY_CHAT_CEILING = { capacity: 30, refillPerSec: 30 };
/** Report limits: one per 30 s per reporter, at most 5 per reporter per lobby. */
export const REPORT_LIMIT = { capacity: 1, refillPerSec: 1 / 30 };
export const REPORTS_PER_LOBBY = 5;

/** Loopback / unknown keys are never used for network bans (local dev, tests, host-side tools). */
const NO_NETWORK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'unknown', '']);
export const isBannableNetwork = (ipKey: string | null | undefined): ipKey is string => !!ipKey && !NO_NETWORK.has(ipKey);

interface Removal {
  accountId: string;
  ipKey: string | null;
  displayName: string;
  at: number;
}

interface ChatRecord {
  msg: ChatMessage;
  fromAccountId: string;
  audience: ReadonlySet<string>;
}

export interface ReportLine {
  id: string;
  fromName: string;
  text: string;
  scope: ChatMessage['scope'];
  at: number;
  /** Server-side only (admin queue); never sent to players. */
  fromAccountId: string;
}

const normLine = (t: string) => t.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export class LobbyModeration {
  chatFilter: ChatFilterMode;
  private removals = new Map<string, Removal>(); // key -> removal
  private muted = new Set<string>(); // accountIds
  private mutedNoticeAt = new Map<string, number>(); // pid -> last "you are muted" notice
  private ring: ChatRecord[] = [];
  private lastLine = new Map<string, { text: string; at: number }>(); // pid -> last line
  private ceiling: RateLimiter;
  private reportLimiter = new RateLimiter(REPORT_LIMIT);
  private reportCount = new Map<string, number>(); // reporter accountId -> reports filed here

  constructor(
    private readonly now: () => number = Date.now,
    /** (v2.3 settings registry) live / per-lobby knobs; defaults = the constants above. */
    private readonly cfg: { chatFilter?: unknown; duplicateWindowMs?: () => number; lobbyLinesPerSec?: number; reportsPerLobby?: () => number } = {},
  ) {
    this.chatFilter = normalizeFilterMode(cfg.chatFilter ?? DEFAULT_CHAT_FILTER);
    const lps = cfg.lobbyLinesPerSec ?? LOBBY_CHAT_CEILING.refillPerSec;
    this.ceiling = new RateLimiter({ capacity: lps, refillPerSec: lps });
  }

  // ---- removals ------------------------------------------------------------------------
  remove(accountId: string, ipKey: string | null, displayName: string): void {
    for (const [k, r] of this.removals) if (r.accountId === accountId) this.removals.delete(k);
    this.removals.set(`r_${randomId(10)}`, { accountId, ipKey: isBannableNetwork(ipKey) ? ipKey : null, displayName, at: this.now() });
  }

  isRemoved(accountId: string, ipKey: string | null | undefined): boolean {
    const net = isBannableNetwork(ipKey) ? ipKey : null;
    for (const r of this.removals.values()) {
      if (r.accountId === accountId) return true;
      if (net && r.ipKey === net) return true;
    }
    return false;
  }

  unban(key: string): Removal | null {
    const r = this.removals.get(key) ?? null;
    if (r) this.removals.delete(key);
    return r;
  }

  removedView(): RemovedMemberView[] {
    return [...this.removals].map(([key, r]) => ({ key, displayName: r.displayName, at: r.at }));
  }

  // ---- mutes ---------------------------------------------------------------------------
  setMuted(accountId: string, on: boolean): boolean {
    const was = this.muted.has(accountId);
    if (on) this.muted.add(accountId);
    else this.muted.delete(accountId);
    return was !== on;
  }

  isMuted(accountId: string): boolean {
    return this.muted.has(accountId);
  }

  private noticeAt = new Map<string, number>();
  /** True at most once per `ms` per (kind, pid): e.g. the duplicate-line notice. */
  shouldNotice(kind: string, pid: string, ms: number): boolean {
    const t = this.now();
    const k = `${kind}:${pid}`;
    if ((this.noticeAt.get(k) ?? -Infinity) + ms > t) return false;
    this.noticeAt.set(k, t);
    if (this.noticeAt.size > 1000) this.noticeAt.clear();
    return true;
  }

  /** True at most once per 30 s per pid (so a muted sender is told, without an error flood). */
  shouldNoticeMuted(pid: string): boolean {
    const t = this.now();
    if ((this.mutedNoticeAt.get(pid) ?? 0) + 30_000 > t) return false;
    this.mutedNoticeAt.set(pid, t);
    return true;
  }

  // ---- chat guards ---------------------------------------------------------------------
  /** 'ok' or why the line is dropped. Call before delivering; records the line for the duplicate guard. */
  admitLine(pid: string, text: string): 'ok' | 'duplicate' | 'busy' {
    const t = this.now();
    const n = normLine(text);
    const last = this.lastLine.get(pid);
    if (last && last.text === n && t - last.at < (this.cfg.duplicateWindowMs?.() ?? DUPLICATE_WINDOW_MS)) return 'duplicate';
    if (!this.ceiling.take('lobby', t)) return 'busy';
    this.lastLine.set(pid, { text: n, at: t });
    return 'ok';
  }

  /** Remember a delivered line and exactly who received it. */
  record(msg: ChatMessage, fromAccountId: string, audience: Iterable<string>): void {
    this.ring.push({ msg, fromAccountId, audience: new Set(audience) });
    if (this.ring.length > CHAT_RING_SIZE) this.ring.shift();
  }

  forgetPid(pid: string): void {
    this.lastLine.delete(pid);
    this.mutedNoticeAt.delete(pid);
  }

  // ---- reports -------------------------------------------------------------------------
  /** null = allowed (and counted); otherwise the reason it is refused. */
  takeReport(reporterAccountId: string): string | null {
    const n = this.reportCount.get(reporterAccountId) ?? 0;
    if (n >= (this.cfg.reportsPerLobby?.() ?? REPORTS_PER_LOBBY)) return 'You have already sent several reports from this lobby. An admin will look at them.';
    if (!this.reportLimiter.take(reporterAccountId, this.now())) return 'Please wait a little before sending another report.';
    this.reportCount.set(reporterAccountId, n + 1);
    return null;
  }

  /**
   * The chat lines named by id that the reporter actually RECEIVED (their pid in the line's
   * audience). Unknown ids and lines delivered only to others are silently dropped.
   */
  reportLines(reporterPid: string, messageIds: readonly string[]): ReportLine[] {
    const want = new Set(messageIds.slice(0, REPORT_MAX_MESSAGES));
    const out: ReportLine[] = [];
    for (const r of this.ring) {
      if (!want.has(r.msg.id) || !r.audience.has(reporterPid)) continue;
      out.push({ id: r.msg.id, fromName: r.msg.fromName, text: r.msg.text, scope: r.msg.scope, at: r.msg.at, fromAccountId: r.fromAccountId });
    }
    return out;
  }
}
