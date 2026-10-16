// OWNED BY voice (v2.3 sec-voice, VOICE-1 / VOICE-5). Server-side truth for voice cost.
//
// Every `intervalMs` (default 60 s) the reconciler lists LiveKit rooms carrying this env's prefix and
// their participants:
//   - usage: every listed participant is credited min(elapsed, maxCreditMs) participant-ms (what
//     LiveKit bills), so a client that never sends voice:status heartbeats is still counted;
//   - orphan sweep: a participant that no live lobby of this process authorises for that room
//     (closed lobby, server restart, stale token, revoked member) gets its permissions stripped and
//     is removed;
//   - liveParticipants: the real concurrent count (admin view, alerts).
// Client heartbeats are buffered (HeartbeatBuffer) and only used for an interval in which LiveKit
// could not be listed (provider outage), so usage is never double-counted.
// No-op when LiveKit is not configured (the reconciler is only created with a RoomService).
import { monthKeyUtc, parseRoomName, type VoiceUsageMonth, type VoiceUsageStore } from '@ct/voice';
import type { Logger } from '../rooms/modules.js';
import { STRIPPED_PERMISSION, type VoiceRoomService } from './coordinator.js';

export interface ReconcileRoomService extends VoiceRoomService {
  listRooms(): Promise<{ name: string; numParticipants?: number }[]>;
}

/** Usage store façade for coordinators while the reconciler measures: heartbeats are held back. */
export class HeartbeatBuffer implements VoiceUsageStore {
  private pendingMs = new Map<string, number>(); // `${env}\0${month}`
  constructor(private readonly inner: VoiceUsageStore) {}
  add(env: string, month: string, ms: number): void {
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    const k = `${env}\u0000${month}`;
    this.pendingMs.set(k, (this.pendingMs.get(k) ?? 0) + ms);
  }
  get(month: string): VoiceUsageMonth {
    return this.inner.get(month);
  }
  /** LiveKit measured this interval: drop the estimates. */
  discard(): void {
    this.pendingMs.clear();
  }
  /** LiveKit could not be listed: fall back to the client estimates for this interval. */
  flush(): number {
    let total = 0;
    for (const [k, ms] of this.pendingMs) {
      const [env, month] = k.split('\u0000') as [string, string];
      this.inner.add(env, month, ms);
      total += ms;
    }
    this.pendingMs.clear();
    return total;
  }
}

export type Authorization = 'ok' | 'unauthorized' | 'orphan';

export interface ReconcilerDeps {
  prefix: string;
  env: string;
  roomService: ReconcileRoomService;
  usage: VoiceUsageStore;
  heartbeats?: HeartbeatBuffer;
  /** Is `identity` allowed in `room` (a room of live lobby `lobbyId`)? 'orphan' = no live lobby. */
  authorize(lobbyId: string, identity: string, room: string): Authorization;
  /** Remove through the owning lobby's coordinator (coalesced); null = no live lobby. */
  evictVia?(lobbyId: string, room: string, identity: string): boolean;
  now(): number;
  log: Logger;
  /** Listing cadence; a getter is re-read before every run (live settings). */
  intervalMs: number | (() => number);
  /** Credit cap per participant per run (a long gap, e.g. event-loop stall, never over-counts). */
  maxCreditMs?: number;
  /** Called after every successful run. */
  onMeasured?(r: ReconcileResult): void;
}

export interface ReconcileResult {
  ok: boolean;
  rooms: number;
  participants: number;
  creditedMs: number;
  evicted: [string, string][];
}

export interface VoiceReconciler {
  runOnce(): Promise<ReconcileResult>;
  start(): void;
  stop(): void;
  /** Participants LiveKit reported at the last successful run (null before / after failures). */
  liveParticipants(): number | null;
  readonly measuring: boolean;
}

export function createVoiceReconciler(d: ReconcilerDeps): VoiceReconciler {
  let lastRunAt: number | null = null;
  let live: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  const interval = () => Math.max(1_000, typeof d.intervalMs === 'function' ? d.intervalMs() : d.intervalMs);
  let running: Promise<ReconcileResult> | null = null;
  let failures = 0;

  const evictDirect = async (room: string, identity: string) => {
    const rs = d.roomService;
    if (rs.updateParticipant) await rs.updateParticipant(room, identity, { permission: STRIPPED_PERMISSION }).catch(() => undefined);
    await rs.removeParticipant(room, identity).catch(() => undefined);
  };

  const run = async (): Promise<ReconcileResult> => {
    const now = d.now();
    const every = interval();
    const elapsed = lastRunAt === null ? every : Math.max(0, now - lastRunAt);
    const credit = Math.min(elapsed, d.maxCreditMs ?? Math.round(every * 1.5));
    const res: ReconcileResult = { ok: false, rooms: 0, participants: 0, creditedMs: 0, evicted: [] };
    try {
      const rooms = (await d.roomService.listRooms()).filter((r) => r.name.startsWith(`${d.prefix}-`));
      for (const r of rooms) {
        if (r.numParticipants === 0) continue;
        res.rooms++;
        const parsed = parseRoomName(d.prefix, r.name);
        const list = await d.roomService.listParticipants(r.name);
        for (const p of list) {
          res.participants++;
          const verdict: Authorization = parsed ? d.authorize(parsed.lobbyId, p.identity, r.name) : 'orphan';
          if (verdict === 'ok') continue;
          res.evicted.push([r.name, p.identity]);
          if (!(parsed && d.evictVia?.(parsed.lobbyId, r.name, p.identity))) await evictDirect(r.name, p.identity);
        }
      }
      res.creditedMs = res.participants * credit;
      if (res.creditedMs > 0) d.usage.add(d.env, monthKeyUtc(now), res.creditedMs);
      d.heartbeats?.discard();
      res.ok = true;
      live = res.participants;
      failures = 0;
      if (res.evicted.length) d.log.warn('voice: removed participants without a grant', { count: res.evicted.length });
      d.onMeasured?.(res);
    } catch (e) {
      live = null;
      const fallback = d.heartbeats?.flush() ?? 0;
      if (failures++ % 10 === 0) {
        d.log.warn('voice: LiveKit room listing failed; usage estimated from client heartbeats', {
          err: e instanceof Error ? e.message.slice(0, 120) : 'unknown',
          estimatedMs: fallback,
        });
      }
    }
    lastRunAt = now;
    return res;
  };

  const reconciler: VoiceReconciler = {
    get measuring() {
      return live !== null;
    },
    runOnce() {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
    start() {
      if (started) return;
      started = true;
      const loop = () => {
        if (!started) return;
        timer = setTimeout(() => void reconciler.runOnce().finally(loop), interval());
        timer.unref?.();
      };
      void reconciler.runOnce().finally(loop);
    },
    stop() {
      started = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    liveParticipants() {
      return live;
    },
  };
  return reconciler;
}
