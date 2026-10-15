// OWNED BY voice. Server-derived acoustic membership for one lobby: decides each member's zone,
// issues LiveKit join tokens for exactly one zone room per member, revokes the previous room
// server-side, runs Storyteller announcements, accounts participant-minutes and scopes chat.
//
// Invariants (tested in apps/server/test/voice*.test.ts):
//   - a member holds at most one zone grant (+ at most one 'announce' overlay grant);
//   - every room name is built from host.lobbyId + the env prefix and re-checked before minting;
//   - leaving a zone => voice:revoke + RoomServiceClient.removeParticipant(oldRoom, pid);
//   - only members whose own zone changed receive voice messages (night visits stay secret);
//   - tokens / secrets are never logged.
import type { AcousticZoneId, C2SParsed, TownLayout, VoiceGrant, VoiceRevoke, VoiceUnavailable } from '@ct/protocol';
import {
  assertRoomInLobby,
  audibleRadiusPx,
  distancePx,
  heartbeatCreditMs,
  mintVoiceToken,
  modeOfZone,
  monthKeyUtc,
  msToMinutes,
  quotaLevel,
  roomNameFor,
  VOICE_DEFAULTS,
  ZONE_ANNOUNCE,
  ZONE_NONE,
  ZONE_STREET,
  ZoneTracker,
  type ZoneChange,
  type ZoneMemberInput,
  type VoiceUsageStore,
} from '@ct/voice';
import type { RoomEvent, RoomHost, VoiceModule } from '../rooms/modules.js';

export interface LivekitSettings {
  url: string;
  apiKey: string;
  apiSecret: string;
  roomPrefix: string;
  configured: boolean;
}

/** The subset of livekit-server-sdk's RoomServiceClient we use (mocked in tests). */
export interface VoiceRoomService {
  removeParticipant(room: string, identity: string): Promise<void>;
  listParticipants(room: string): Promise<{ identity: string }[]>;
}

export interface VoiceTuning {
  tokenTtlSec: number;
  refreshBeforeMs: number;
  recomputeIntervalMs: number;
  /** Grant refresh / retry sweep cadence. */
  maintainIntervalMs: number;
  retryIntervalMs: number;
  announceIdleMs: number;
  auditIntervalMs: number;
  /** How long a room is audited after a revocation (token TTL + LiveKit refresh-token life). */
  auditWindowMs: number;
  maxHeartbeatCreditMs: number;
  squareMarginPx: number;
  zoneDebounceMs: number;
  statusStaleMs: number;
}

export const DEFAULT_TUNING: VoiceTuning = {
  tokenTtlSec: VOICE_DEFAULTS.tokenTtlSec,
  refreshBeforeMs: VOICE_DEFAULTS.refreshBeforeMs,
  recomputeIntervalMs: 200,
  maintainIntervalMs: 1_000,
  retryIntervalMs: 5_000,
  announceIdleMs: VOICE_DEFAULTS.announceIdleMs,
  auditIntervalMs: 15_000,
  auditWindowMs: VOICE_DEFAULTS.tokenTtlSec * 1000 + 10 * 60_000,
  maxHeartbeatCreditMs: VOICE_DEFAULTS.maxHeartbeatCreditMs,
  squareMarginPx: VOICE_DEFAULTS.squareMarginPx,
  zoneDebounceMs: VOICE_DEFAULTS.zoneDebounceMs,
  statusStaleMs: 75_000,
};

export interface VoiceDeps {
  livekit: LivekitSettings;
  monthlyMinutes: number;
  usage: VoiceUsageStore;
  roomService: VoiceRoomService | null;
  layout: TownLayout;
  tuning?: Partial<VoiceTuning>;
  /** Override for tests; defaults to mintVoiceToken. */
  mint?: typeof mintVoiceToken;
}

interface Held {
  room: string;
  zone: AcousticZoneId;
  canPublish: boolean;
  expiresAt: number;
  /** false until a token was actually minted + sent to a connected member. */
  delivered: boolean;
}

interface MemberVoice {
  zoneGen: number;
  announceGen: number;
  zone: Held | null;
  announce: Held | null;
  lastCreditAt: number | null;
  status: { connected: boolean; publishing: boolean; room: string | null; at: number } | null;
  unavailable: VoiceUnavailable['reason'] | null;
}

export interface VoiceCoordinator extends VoiceModule {
  /** Resolves when all in-flight token mints / LiveKit API calls settled (tests). */
  whenIdle(): Promise<void>;
  /** Current committed zone of a member ('none' when it has no room). */
  zoneOf(pid: string): AcousticZoneId;
  /** Rooms this member currently holds grants for (debug/tests). */
  heldRooms(pid: string): { zone: string | null; announce: string | null };
  /** Members with a recent "connected" heartbeat (admin dashboard). */
  activeParticipants(now?: number): number;
  readonly configured: boolean;
}

export function createVoiceCoordinator(host: RoomHost, deps: VoiceDeps): VoiceCoordinator {
  const tune: VoiceTuning = { ...DEFAULT_TUNING, ...deps.tuning };
  const lk = deps.livekit;
  const configured = Boolean(lk.configured && lk.url && lk.apiKey && lk.apiSecret);
  const mint = deps.mint ?? mintVoiceToken;
  const tracker = new ZoneTracker({ squareMarginPx: tune.squareMarginPx, debounceMs: tune.zoneDebounceMs });
  const state = new Map<string, MemberVoice>();
  const pending = new Set<Promise<unknown>>();
  const audits = new Map<string, number>(); // room -> audit until
  const auditing = new Set<string>();
  const announce = { active: false, lastActivityAt: 0, by: null as string | null };
  /** pids that left (seat released) — ignored even if the room still lists them briefly. */
  const departed = new Set<string>();
  let lastPhase: string | null | undefined;
  let lastRecompute = -Infinity;
  let lastRetry = -Infinity;
  let lastMaintain = -Infinity;
  let quotaCache: { at: number; exhausted: boolean } | null = null;
  let lastAudit = -Infinity;
  let disposed = false;

  const track = <T>(p: Promise<T>): Promise<T> => {
    pending.add(p);
    void p.finally(() => pending.delete(p)).catch(() => undefined);
    return p;
  };

  const st = (pid: string): MemberVoice => {
    let s = state.get(pid);
    if (!s) {
      s = { zoneGen: 0, announceGen: 0, zone: null, announce: null, lastCreditAt: null, status: null, unavailable: null };
      state.set(pid, s);
    }
    return s;
  };

  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const phase = () => safe(() => host.game.phase(), null);

  // -- quota ------------------------------------------------------------------------------
  const quotaExhausted = (now: number): boolean => {
    if (quotaCache && now - quotaCache.at < 2_000 && now >= quotaCache.at) return quotaCache.exhausted;
    const used = msToMinutes(safe(() => deps.usage.get(monthKeyUtc(now)).totalMs, 0));
    const exhausted = quotaLevel(used, deps.monthlyMinutes) === 'exhausted';
    quotaCache = { at: now, exhausted };
    return exhausted;
  };

  const unavailable = (pid: string, reason: VoiceUnavailable['reason'], force = false) => {
    const s = st(pid);
    if (s.unavailable === reason && !force) return;
    s.unavailable = reason;
    const message =
      reason === 'not_configured'
        ? 'Voice is not configured on this server. Text chat works as usual.'
        : reason === 'quota_exhausted'
          ? 'The monthly voice allowance is used up. Text chat continues.'
          : 'The voice provider is unavailable right now. Text chat continues.';
    host.send(pid, 'voice:unavailable', { reason, message });
  };

  // -- LiveKit server API -----------------------------------------------------------------
  const removeFromRoom = (room: string, pid: string) => {
    if (!deps.roomService || !configured) return;
    track(
      deps.roomService.removeParticipant(room, pid).catch((err: unknown) => {
        // not_found = the member never connected / already left: expected.
        const code = (err as { code?: string; status?: number })?.code;
        if (code !== 'not_found' && (err as { status?: number })?.status !== 404) {
          host.log.warn('voice: removeParticipant failed', { room, pid, code: String(code ?? 'unknown') });
        }
      }),
    );
  };

  // Every room a member was revoked from is audited, not only private ones: a modified client that
  // keeps (or re-joins with) its square/street token could otherwise stay connected to the square
  // from inside a building or through the night (two such clients could talk at night).
  const scheduleAudit = (room: string, _zone: AcousticZoneId, now: number) => {
    if (!deps.roomService || !configured) return;
    audits.set(room, Math.max(audits.get(room) ?? 0, now + tune.auditWindowMs));
  };

  const authorizedFor = (identity: string, room: string): boolean => {
    if (!host.member(identity) || departed.has(identity)) return false;
    const s = state.get(identity);
    return s?.zone?.room === room || s?.announce?.room === room;
  };

  const runAudits = (now: number) => {
    if (!deps.roomService) return;
    for (const [room, until] of audits) {
      if (now > until) {
        audits.delete(room);
        continue;
      }
      if (auditing.has(room)) continue;
      auditing.add(room);
      track(
        deps.roomService
          .listParticipants(room)
          .then((list) => {
            for (const p of list) {
              if (!authorizedFor(p.identity, room)) {
                host.log.info('voice: removing unauthorized participant', { room, pid: p.identity });
                removeFromRoom(room, p.identity);
                // A connected intruder receives LiveKit refresh tokens and may re-join: keep watching.
                audits.set(room, Math.max(audits.get(room) ?? 0, host.now() + tune.auditWindowMs));
              }
            }
          })
          .catch(() => undefined)
          .finally(() => auditing.delete(room)),
      );
    }
  };

  // -- grants -----------------------------------------------------------------------------
  const roomFor = (zone: AcousticZoneId) => {
    const room = roomNameFor(lk.roomPrefix, host.lobbyId, zone);
    assertRoomInLobby(lk.roomPrefix, host.lobbyId, room);
    return room;
  };

  const deliver = (pid: string, purpose: 'zone' | 'announce', held: Held, gen: number) => {
    const m = host.member(pid);
    if (!m || !m.connected) return;
    const s = st(pid);
    track(
      mint({
        apiKey: lk.apiKey,
        apiSecret: lk.apiSecret,
        identity: pid,
        name: m.displayName,
        room: held.room,
        canPublish: held.canPublish,
        ttlSec: tune.tokenTtlSec,
      })
        .then((token) => {
          const cur = purpose === 'zone' ? s.zone : s.announce;
          const curGen = purpose === 'zone' ? s.zoneGen : s.announceGen;
          if (disposed || curGen !== gen || cur !== held) return; // superseded meanwhile
          held.delivered = true;
          s.unavailable = null;
          const grant: VoiceGrant = {
            provider: 'livekit',
            url: lk.url,
            token,
            room: held.room,
            zone: held.zone,
            mode: modeOfZone(held.zone) ?? 'private',
            purpose,
            canPublish: held.canPublish,
            expiresAt: held.expiresAt,
          };
          host.send(pid, 'voice:grant', grant);
        })
        .catch(() => {
          host.log.warn('voice: token mint failed', { pid, room: held.room });
          unavailable(pid, 'provider_error', true);
        }),
    );
  };

  const revokeZone = (pid: string, reason: VoiceRevoke['reason'], now: number) => {
    const s = st(pid);
    s.zoneGen++;
    const held = s.zone;
    if (!held) return;
    s.zone = null;
    s.lastCreditAt = null;
    host.send(pid, 'voice:revoke', { purpose: 'zone', room: held.room, reason });
    removeFromRoom(held.room, pid);
    scheduleAudit(held.room, held.zone, now);
  };

  const grantZone = (pid: string, zone: AcousticZoneId, now: number, refresh = false) => {
    if (zone === ZONE_NONE) return;
    if (!configured) {
      unavailable(pid, 'not_configured');
      return;
    }
    const s = st(pid);
    const room = roomFor(zone);
    if (s.zone && s.zone.room !== room) revokeZone(pid, 'zone_change', now); // never two zone rooms
    if (quotaExhausted(now)) {
      if (!refresh) unavailable(pid, 'quota_exhausted');
      return;
    }
    const gen = ++s.zoneGen;
    const held: Held = { room, zone, canPublish: true, expiresAt: now + tune.tokenTtlSec * 1000, delivered: false };
    s.zone = held;
    deliver(pid, 'zone', held, gen);
  };

  const revokeAnnounce = (pid: string, reason: VoiceRevoke['reason'], now: number) => {
    const s = st(pid);
    s.announceGen++;
    const held = s.announce;
    if (!held) return;
    s.announce = null;
    host.send(pid, 'voice:revoke', { purpose: 'announce', room: held.room, reason });
    removeFromRoom(held.room, pid);
    scheduleAudit(held.room, held.zone, now);
  };

  const grantAnnounce = (pid: string, now: number, refresh = false) => {
    if (!configured || !announce.active) return;
    if (quotaExhausted(now)) {
      if (!refresh) unavailable(pid, 'quota_exhausted');
      return;
    }
    const s = st(pid);
    const gen = ++s.announceGen;
    const held: Held = {
      room: roomFor(ZONE_ANNOUNCE),
      zone: ZONE_ANNOUNCE,
      canPublish: pid === host.storytellerPid(), // players are listen-only
      expiresAt: now + tune.tokenTtlSec * 1000,
      delivered: false,
    };
    s.announce = held;
    deliver(pid, 'announce', held, gen);
  };

  const stopAnnounce = (now: number) => {
    if (!announce.active) return;
    announce.active = false;
    announce.by = null;
    for (const pid of state.keys()) revokeAnnounce(pid, 'announce_end', now);
  };

  // -- zone recomputation -----------------------------------------------------------------
  const memberInputs = (): ZoneMemberInput[] =>
    host
      .members()
      .filter((m) => !departed.has(m.pid))
      .map((m) => {
        const pos = safe(() => host.world.positionOf(m.pid), null);
        return {
          pid: m.pid,
          role: m.role,
          seat: m.seat ?? safe(() => host.game.seatOf(m.pid), null),
          location: safe(() => host.world.locationOf(m.pid), null),
          x: pos?.x ?? null,
          y: pos?.y ?? null,
        };
      });

  const applyChange = (c: ZoneChange, reason: VoiceRevoke['reason'], now: number) => {
    if (c.to === null) {
      revokeZone(c.pid, 'left', now);
      revokeAnnounce(c.pid, 'left', now);
      state.delete(c.pid);
      return;
    }
    if (c.to === ZONE_NONE) {
      revokeZone(c.pid, reason, now);
      return;
    }
    const s = st(c.pid);
    if (s.zone && s.zone.room !== roomFor(c.to)) revokeZone(c.pid, reason, now);
    grantZone(c.pid, c.to, now);
  };

  const recompute = (now: number) => {
    if (disposed) return;
    lastRecompute = now;
    const ph = phase();
    const phaseChanged = lastPhase !== undefined && lastPhase !== ph;
    lastPhase = ph;
    const changes = tracker.update({ phase: ph, layout: deps.layout, members: memberInputs() }, now);
    for (const c of changes) applyChange(c, phaseChanged ? 'phase' : 'zone_change', now);
  };

  /** Re-deliver grants that are missing / expiring and retry refused ones (rate-limited). */
  const maintain = (now: number) => {
    if (!configured) return;
    for (const m of host.members()) {
      if (!m.connected || departed.has(m.pid)) continue;
      const zone = tracker.zoneOf(m.pid);
      const s = st(m.pid);
      if (zone && zone !== ZONE_NONE) {
        if (!s.zone) {
          if (now - lastRetry >= tune.retryIntervalMs) grantZone(m.pid, zone, now);
        } else if (s.zone.expiresAt - now <= tune.refreshBeforeMs) {
          grantZone(m.pid, zone, now, true);
        }
      }
      if (announce.active && s.announce && s.announce.expiresAt - now <= tune.refreshBeforeMs) grantAnnounce(m.pid, now, true);
    }
    if (now - lastRetry >= tune.retryIntervalMs) lastRetry = now;
  };

  const onConnected = (pid: string, now: number) => {
    if (departed.has(pid)) return;
    const s = st(pid);
    s.lastCreditAt = null;
    s.unavailable = null;
    if (!configured) unavailable(pid, 'not_configured', true);
    const genBefore = s.zoneGen;
    recompute(now);
    if (!configured) return;
    // (Re)deliver a fresh token for the current zone unless recompute just issued one
    // (page reloads / reconnects lose the client's grant).
    const zone = tracker.zoneOf(pid);
    if (zone && zone !== ZONE_NONE && st(pid).zoneGen === genBefore) grantZone(pid, zone, now);
    if (announce.active) grantAnnounce(pid, now);
  };

  const onEvent = (e: RoomEvent) => {
    if (disposed) return;
    const now = host.now();
    switch (e.type) {
      case 'member_joined':
        departed.delete(e.pid);
        onConnected(e.pid, now);
        return;
      case 'member_connection':
        if (e.connected) onConnected(e.pid, now);
        else {
          const s = st(e.pid);
          s.lastCreditAt = null;
          s.status = null;
          if (e.pid === host.storytellerPid()) stopAnnounce(now);
        }
        return;
      case 'member_left': {
        if (announce.active && announce.by === e.pid) stopAnnounce(now);
        departed.add(e.pid);
        tracker.remove(e.pid);
        revokeZone(e.pid, 'left', now);
        revokeAnnounce(e.pid, 'left', now);
        state.delete(e.pid);
        return;
      }
      case 'role_changed':
        stopAnnounce(now);
        recompute(now);
        return;
      case 'game_started':
      case 'phase_changed':
      case 'location_changed':
      case 'visit_changed':
      case 'game_finished':
        recompute(now);
        return;
      default:
        return;
    }
  };

  // -- public API -------------------------------------------------------------------------
  const coordinator: VoiceCoordinator = {
    configured,
    onEvent,

    handleStatus(pid: string, msg: C2SParsed<'voice:status'>) {
      if (disposed || !host.member(pid) || departed.has(pid)) return;
      const now = host.now();
      const s = st(pid);
      const held = [s.zone?.room, s.announce?.room].filter((r): r is string => Boolean(r));
      // Only members with an active grant for the room they claim count towards usage.
      const valid = configured && msg.connected && !!msg.room && held.includes(msg.room);
      if (valid && s.lastCreditAt !== null) {
        const connections = s.announce ? 2 : 1; // zone room + announce overlay
        const credit = heartbeatCreditMs(now - s.lastCreditAt, tune.maxHeartbeatCreditMs) * connections;
        if (credit > 0) {
          try {
            deps.usage.add(host.env, monthKeyUtc(now), credit);
          } catch {
            host.log.warn('voice: usage store write failed');
          }
        }
      }
      s.lastCreditAt = valid ? now : null;
      s.status = { connected: msg.connected, publishing: msg.publishing, room: msg.room ?? null, at: now };
    },

    handleAnnounce(pid: string, msg: C2SParsed<'voice:announce'>) {
      if (disposed) return;
      const now = host.now();
      if (pid !== host.storytellerPid()) {
        host.send(pid, 'error', { code: 'forbidden', message: 'Only the Storyteller can make announcements.', for: 'voice:announce' });
        return;
      }
      if (!msg.active) {
        stopAnnounce(now);
        return;
      }
      announce.lastActivityAt = now;
      if (announce.active) return;
      if (!configured) {
        unavailable(pid, 'not_configured', true);
        return;
      }
      announce.active = true;
      announce.by = pid;
      for (const m of host.members()) if (m.connected && !departed.has(m.pid)) grantAnnounce(m.pid, now);
    },

    audienceOf(pid: string): string[] {
      if (!host.member(pid) || departed.has(pid)) return [];
      const zone = tracker.zoneOf(pid);
      if (!zone || zone === ZONE_NONE) return [pid];
      const same = tracker
        .entries()
        .filter(([, z]) => z === zone)
        .map(([p]) => p)
        .filter((p) => host.member(p) && !departed.has(p));
      if (zone !== ZONE_STREET) return same;
      const me = safe(() => host.world.positionOf(pid), null);
      if (!me) return [pid];
      const radius = audibleRadiusPx({ tileSize: deps.layout.tileSize });
      return same.filter((p) => {
        if (p === pid) return true;
        const pos = safe(() => host.world.positionOf(p), null);
        return pos !== null && distancePx(me, pos) <= radius;
      });
    },

    tick(_now: number) {
      if (disposed) return;
      const now = host.now();
      if (now - lastRecompute >= tune.recomputeIntervalMs) recompute(now);
      if (announce.active && now - announce.lastActivityAt > tune.announceIdleMs) stopAnnounce(now);
      if (now - lastMaintain >= tune.maintainIntervalMs) {
        lastMaintain = now;
        maintain(now);
      }
      if (now - lastAudit >= tune.auditIntervalMs) {
        lastAudit = now;
        runAudits(now);
      }
    },

    async dispose() {
      if (disposed) return;
      for (const pid of [...state.keys()]) {
        const s = st(pid);
        if (s.zone) removeFromRoom(s.zone.room, pid);
        if (s.announce) removeFromRoom(s.announce.room, pid);
        s.zone = null;
        s.announce = null;
        s.zoneGen++;
        s.announceGen++;
      }
      disposed = true;
      announce.active = false;
      audits.clear();
      tracker.clear();
      await coordinator.whenIdle();
      state.clear();
    },

    async whenIdle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },

    zoneOf(pid: string) {
      return tracker.zoneOf(pid) ?? ZONE_NONE;
    },

    heldRooms(pid: string) {
      const s = state.get(pid);
      return { zone: s?.zone?.room ?? null, announce: s?.announce?.room ?? null };
    },

    activeParticipants(now = host.now()) {
      let n = 0;
      for (const s of state.values()) {
        if (s.status?.connected && now - s.status.at <= tune.statusStaleMs) n += s.announce ? 2 : 1;
      }
      return n;
    },
  };
  return coordinator;
}
