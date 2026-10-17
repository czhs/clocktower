// OWNED BY voice. Server-derived acoustic membership for one lobby: decides each member's zone,
// issues LiveKit join tokens for exactly one zone room per member, revokes the previous room
// server-side, runs Storyteller announcements, accounts participant-minutes and scopes chat.
//
// Invariants (tested in apps/server/test/voice*.test.ts, tests/security/voice-cost.test.ts):
//   - a member holds at most one zone grant (+ at most one 'announce' overlay grant);
//   - every room name is built from host.lobbyId + the env prefix and re-checked before minting;
//   - leaving a zone => voice:revoke + RoomServiceClient.removeParticipant(oldRoom, pid);
//   - only members whose own zone/room changed receive voice messages (night visits stay secret);
//   - tokens / secrets are never logged.
// v2.3 (sec-voice) cost + abuse controls:
//   - VOICE-4 tokens only for members that opted in (`voice:status.wanted`); caps per lobby, per
//     process and per client IP ('busy', retried);
//   - VOICE-2/6 quota exhaustion or the kill switch revoke + remove EVERY grant at once;
//   - VOICE-3 a member disconnected for > 60 s loses its grants (and LiveKit seat);
//   - VOICE-7 idle members (no talking / moving / talk in their room) and long waiting-room voice
//     are switched off ('idle');
//   - VOICE-9 room names carry an epoch: a room is renamed when it empties and every room at
//     bedtime / night / dawn, so old tokens point at dead rooms; intruders found by the audit /
//     LiveKit sweep get their permissions stripped before removal;
//   - VOICE-10 LiveKit removals are coalesced per (room, pid) and retried on failure.
import { randomBytes } from 'node:crypto';
import type { AcousticZoneId, C2SParsed, TownLayout, VoiceGrant, VoiceRevoke, VoiceUnavailable } from '@ct/protocol';
import {
  assertRoomInLobby,
  audibleRadiusPx,
  distancePx,
  heartbeatCreditMs,
  isNightLike,
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

/** Permissions written onto an intruder before it is removed (VOICE-9). */
export const STRIPPED_PERMISSION = { canSubscribe: false, canPublish: false, canPublishData: false } as const;

/** The subset of livekit-server-sdk's RoomServiceClient we use (mocked in tests). */
export interface VoiceRoomService {
  removeParticipant(room: string, identity: string): Promise<void>;
  listParticipants(room: string): Promise<{ identity: string }[]>;
  /** Optional: strip an intruder's permissions (LiveKit refresh tokens then carry them too). */
  updateParticipant?(room: string, identity: string, options: { permission: typeof STRIPPED_PERMISSION }): Promise<unknown>;
  /** Optional: used by the usage reconciler / orphan sweep (voice/reconciler.ts). */
  listRooms?(): Promise<{ name: string; numParticipants?: number }[]>;
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
  /** (VOICE-3) a member disconnected from the game this long loses its voice grants. */
  disconnectRevokeMs: number;
  /** (VOICE-10) removals of the same (room, pid) closer together than this are coalesced. */
  removalCoalesceMs: number;
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
  disconnectRevokeMs: 60_000,
  removalCoalesceMs: 1_000,
};

/** (v2.3) Cost / abuse limits. A cap of 0 means "no limit"; an idle time of 0 means "never". */
export interface VoiceLimits {
  maxPerLobby: number;
  maxConcurrent: number;
  maxPerIp: number;
  /** Idle limit outside a running game (waiting room / finished); doubled during a game, paused at night. */
  idleMs: number;
  /** Continuous voice in a lobby without a game. */
  waitingMaxMs: number;
  /** TEST ONLY: members want voice without opting in (harnesses use grants as a zone oracle). */
  autoOptIn: boolean;
  /** Hard cap on one Storyteller announcement (0 = no cap). */
  announceMaxMs: number;
}

export const DEFAULT_LIMITS: VoiceLimits = {
  maxPerLobby: 16,
  maxConcurrent: 64,
  maxPerIp: 4,
  idleMs: 20 * 60_000,
  waitingMaxMs: 60 * 60_000,
  autoOptIn: false,
  announceMaxMs: 5 * 60_000,
};

export interface VoiceDeps {
  livekit: LivekitSettings;
  /** Monthly participant-minute allowance; a getter is read on every check (live settings). */
  monthlyMinutes: number | (() => number);
  usage: VoiceUsageStore;
  roomService: VoiceRoomService | null;
  layout: TownLayout;
  tuning?: Partial<VoiceTuning>;
  /** Caps / idle limits; a getter is read at the moment of use (live settings, voice/settings.ts). */
  limits?: Partial<VoiceLimits> | (() => Partial<VoiceLimits>);
  /** Override for tests; defaults to mintVoiceToken. */
  mint?: typeof mintVoiceToken;
  /** Kill switch (voice/control.ts). */
  isDisabled?: () => boolean;
  /** Zone-grant holders in OTHER lobbies of this process (concurrent cap). */
  otherHolders?: () => number;
  /** Client IP key of a member of this lobby (per-IP cap). */
  ipOf?: (pid: string) => string | null;
  /** Zone-grant holders with this IP key in OTHER lobbies of this process. */
  otherIpHolders?: (ip: string) => number;
  /** Room-name epochs (VOICE-9). false = legacy names without an epoch (unit tests). */
  roomEpochs?: boolean;
  /** Epoch generator (tests). */
  newEpoch?: () => string;
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
  /** (VOICE-4) the member switched voice on. */
  wanted: boolean;
  /** (VOICE-7) last talking / moving / talk-in-my-room. */
  lastActiveAt: number;
  lastPos: { x: number; y: number } | null;
  /** (VOICE-7) since when voice is wanted in a lobby without a game. */
  waitingSince: number | null;
  /** (VOICE-3) since when the member's game connection is down. */
  disconnectedAt: number | null;
}

interface Removal {
  room: string;
  pid: string;
  lastSentAt: number;
  /** Another removal was requested inside the coalescing window. */
  again: boolean;
  attempts: number;
  retryAt: number | null;
  strip: boolean;
}

export interface VoiceCoordinator extends VoiceModule {
  readonly lobbyId: string;
  /** Resolves when all in-flight token mints / LiveKit API calls settled (tests). */
  whenIdle(): Promise<void>;
  /** Current committed zone of a member ('none' when it has no room). */
  zoneOf(pid: string): AcousticZoneId;
  /** Rooms this member currently holds grants for (debug/tests). */
  heldRooms(pid: string): { zone: string | null; announce: string | null };
  /** Members with a recent "connected" heartbeat (admin dashboard). */
  activeParticipants(now?: number): number;
  /** Members holding a zone grant (caps). */
  holders(): number;
  /** Members holding a zone grant whose client IP key is `ip` (per-IP cap). */
  holdersWithIp(ip: string): number;
  /** May `identity` be in `room` right now? (audit / LiveKit orphan sweep) */
  isAuthorized(identity: string, room: string): boolean;
  /** Strip permissions and remove a participant (audit / LiveKit orphan sweep). */
  evict(room: string, identity: string): void;
  /** Apply the kill switch / quota now (revoke everything when blocked, re-grant when not). */
  enforce(now?: number): void;
  readonly configured: boolean;
}

const QUOTA_REASON: Record<'disabled' | 'quota_exhausted', VoiceRevoke['reason']> = { disabled: 'disabled', quota_exhausted: 'quota' };

export function createVoiceCoordinator(host: RoomHost, deps: VoiceDeps): VoiceCoordinator {
  const tune: VoiceTuning = { ...DEFAULT_TUNING, ...deps.tuning };
  const lim = (): VoiceLimits => ({ ...DEFAULT_LIMITS, ...(typeof deps.limits === 'function' ? deps.limits() : deps.limits) });
  const monthly = (): number => (typeof deps.monthlyMinutes === 'function' ? deps.monthlyMinutes() : deps.monthlyMinutes);
  const lk = deps.livekit;
  const configured = Boolean(lk.configured && lk.url && lk.apiKey && lk.apiSecret);
  const mint = deps.mint ?? mintVoiceToken;
  const useEpochs = deps.roomEpochs !== false;
  const newEpoch = deps.newEpoch ?? (() => randomBytes(5).toString('hex'));
  const tracker = new ZoneTracker({ squareMarginPx: tune.squareMarginPx, debounceMs: tune.zoneDebounceMs });
  const state = new Map<string, MemberVoice>();
  const pending = new Set<Promise<unknown>>();
  const audits = new Map<string, number>(); // room -> audit until
  const auditing = new Set<string>();
  const removals = new Map<string, Removal>(); // `${room}\0${pid}`
  const epochs = new Map<AcousticZoneId, string>();
  /**
   * Storyteller announcement. `lastActivityAt` moves only when the ST actually talks (voice:status
   * publishing), never on the client's voice:announce keep-alive. After the server ended it by itself
   * (idle / cap / night / visit), `blocked` ignores voice:announce {active:true} until the ST sends
   * {active:false}: an old client's keep-alive must not silently restart it.
   */
  const announce = { active: false, lastActivityAt: 0, startedAt: 0, by: null as string | null, blocked: false };
  const NIGHT_PHASES = new Set(['first_night', 'night', 'dawn']);
  /** pids that left (seat released) — ignored even if the room still lists them briefly. */
  const departed = new Set<string>();
  let lastPhase: string | null | undefined;
  let lastRecompute = -Infinity;
  let lastRetry = -Infinity;
  let lastMaintain = -Infinity;
  let quotaCache: { at: number; exhausted: boolean } | null = null;
  let lastAudit = -Infinity;
  let disposed = false;
  /** While revoking everything (kill switch / quota), rotation does not re-grant anyone. */
  let suspending = false;
  let removeWarnAt = -Infinity;

  const track = <T>(p: Promise<T>): Promise<T> => {
    pending.add(p);
    void p.finally(() => pending.delete(p)).catch(() => undefined);
    return p;
  };

  const st = (pid: string): MemberVoice => {
    let s = state.get(pid);
    if (!s) {
      s = {
        zoneGen: 0,
        announceGen: 0,
        zone: null,
        announce: null,
        lastCreditAt: null,
        status: null,
        unavailable: null,
        wanted: lim().autoOptIn,
        lastActiveAt: host.now(),
        lastPos: null,
        waitingSince: null,
        disconnectedAt: null,
      };
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
  const connected = (pid: string) => host.member(pid)?.connected === true;

  // -- quota / kill switch ------------------------------------------------------------------
  const quotaExhausted = (now: number): boolean => {
    if (quotaCache && now - quotaCache.at < 2_000 && now >= quotaCache.at) return quotaCache.exhausted;
    const used = msToMinutes(safe(() => deps.usage.get(monthKeyUtc(now)).totalMs, 0));
    const exhausted = quotaLevel(used, monthly()) === 'exhausted';
    quotaCache = { at: now, exhausted };
    return exhausted;
  };

  const blocked = (now: number): 'disabled' | 'quota_exhausted' | null =>
    safe(() => deps.isDisabled?.() === true, true) ? 'disabled' : quotaExhausted(now) ? 'quota_exhausted' : null;

  const MESSAGES: Record<VoiceUnavailable['reason'], string> = {
    not_configured: 'Voice is not configured on this server. Text chat works as usual.',
    quota_exhausted: 'The monthly voice allowance is used up. Text chat continues.',
    provider_error: 'The voice provider is unavailable right now. Text chat continues.',
    disabled: 'Voice is switched off on this server right now. Text chat continues.',
    busy: 'Voice is full right now (too many people talking on this server). It connects by itself when a place frees up.',
    idle: 'Voice was switched off after a long time without activity. Press Enable voice to turn it back on.',
  };

  const unavailable = (pid: string, reason: VoiceUnavailable['reason'], force = false) => {
    const s = st(pid);
    if (s.unavailable === reason && !force) return;
    s.unavailable = reason;
    host.send(pid, 'voice:unavailable', { reason, message: MESSAGES[reason] });
  };

  // -- LiveKit server API -----------------------------------------------------------------
  const authorizedFor = (identity: string, room: string): boolean => {
    if (!host.member(identity) || departed.has(identity)) return false;
    const s = state.get(identity);
    return s?.zone?.room === room || s?.announce?.room === room;
  };

  const sendRemoval = (r: Removal) => {
    if (!deps.roomService) return;
    const rs = deps.roomService;
    r.lastSentAt = host.now();
    r.again = false;
    r.retryAt = null;
    const strip = r.strip && rs.updateParticipant ? rs.updateParticipant(r.room, r.pid, { permission: STRIPPED_PERMISSION }).catch(() => undefined) : Promise.resolve();
    track(
      strip
        .then(() => rs.removeParticipant(r.room, r.pid))
        .catch((err: unknown) => {
          // not_found = the member never connected / already left: expected.
          const code = (err as { code?: string; status?: number })?.code;
          if (code === 'not_found' || (err as { status?: number })?.status === 404) return;
          if (r.attempts < 3) r.retryAt = host.now() + [2_000, 5_000, 10_000][r.attempts]!;
          r.attempts++;
          const now = host.now();
          if (now - removeWarnAt > 10_000) {
            removeWarnAt = now;
            host.log.warn('voice: removeParticipant failed', { room: r.room, pid: r.pid, code: String(code ?? 'unknown'), attempt: r.attempts });
          }
        }),
    );
  };

  /** (VOICE-10) coalesced per (room, pid); failures are retried while the pid is still not authorised. */
  const removeFromRoom = (room: string, pid: string, strip = false) => {
    if (!deps.roomService || !configured) return;
    const key = `${room}\u0000${pid}`;
    const now = host.now();
    const r = removals.get(key);
    if (r && now - r.lastSentAt < tune.removalCoalesceMs) {
      r.again = true;
      r.strip ||= strip;
      return;
    }
    const next: Removal = r ?? { room, pid, lastSentAt: now, again: false, attempts: 0, retryAt: null, strip };
    next.strip ||= strip;
    if (!r) removals.set(key, next);
    else next.attempts = 0;
    sendRemoval(next);
  };

  const runRemovals = (now: number) => {
    for (const [key, r] of removals) {
      const due = (r.again && now - r.lastSentAt >= tune.removalCoalesceMs) || (r.retryAt !== null && now >= r.retryAt);
      if (due) {
        if (authorizedFor(r.pid, r.room)) removals.delete(key);
        else sendRemoval(r);
      } else if (!r.again && r.retryAt === null && now - r.lastSentAt > 30_000) removals.delete(key);
    }
  };

  // Every room a member was revoked from is audited, not only private ones: a modified client that
  // keeps (or re-joins with) its square/street token could otherwise stay connected to the square
  // from inside a building or through the night (two such clients could talk at night).
  const scheduleAudit = (room: string, _zone: AcousticZoneId, now: number) => {
    if (!deps.roomService || !configured) return;
    audits.set(room, Math.max(audits.get(room) ?? 0, now + tune.auditWindowMs));
  };

  const evict = (room: string, identity: string) => {
    host.log.info('voice: removing unauthorized participant', { room, pid: identity });
    removeFromRoom(room, identity, true);
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
                evict(room, p.identity);
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
    let epoch: string | undefined;
    if (useEpochs) {
      epoch = epochs.get(zone);
      if (!epoch) epochs.set(zone, (epoch = newEpoch()));
    }
    const room = roomNameFor(lk.roomPrefix, host.lobbyId, zone, epoch);
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

  /**
   * (VOICE-9) a member left `held.room`: once the room is EMPTY it gets a fresh name for its next
   * occupants, so tokens for the old name are useless. Rooms are deliberately not renamed while
   * people are still inside (that would drop their audio on every departure); see rotateOnPhase.
   */
  const rotateAfterLeave = (pid: string, held: Held, _now: number) => {
    if (!useEpochs || held.zone === ZONE_ANNOUNCE) return;
    if (epochs.has(held.zone) && roomNameFor(lk.roomPrefix, host.lobbyId, held.zone, epochs.get(held.zone)) !== held.room) return; // already rotated
    const occupied = [...state.entries()].some(([p, s]) => p !== pid && s.zone?.room === held.room);
    if (!occupied) epochs.delete(held.zone);
  };

  /**
   * (VOICE-9) bedtime / night / dawn: every room gets a fresh name. Members still holding a room are
   * moved to the new name (one reconnect per phase change, for everyone alike — reveals nothing).
   */
  const ROTATE_PHASES = new Set(['bedtime', 'first_night', 'night', 'dawn']);
  const rotateOnPhase = (now: number) => {
    if (!useEpochs || suspending) return;
    for (const z of [...epochs.keys()]) if (z !== ZONE_ANNOUNCE) epochs.delete(z);
    for (const [pid, s] of [...state]) {
      if (!s.zone || s.zone.zone === ZONE_ANNOUNCE) continue;
      const zone = s.zone.zone;
      if (roomFor(zone) === s.zone.room) continue;
      revokeZone(pid, 'phase', now);
      grantZone(pid, zone, now);
    }
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
    rotateAfterLeave(pid, held, now);
  };

  /** (VOICE-4) 'busy' when a cap is reached (the caller holds no zone grant at this point). */
  const capped = (pid: string): boolean => {
    const limits = lim();
    let local = 0;
    for (const [p, s] of state) if (p !== pid && s.zone) local++;
    if (limits.maxPerLobby > 0 && local >= limits.maxPerLobby) return true;
    if (limits.maxConcurrent > 0 && local + safe(() => deps.otherHolders?.() ?? 0, 0) >= limits.maxConcurrent) return true;
    const ip = limits.maxPerIp > 0 ? safe(() => deps.ipOf?.(pid) ?? null, null) : null;
    if (ip) {
      let n = safe(() => deps.otherIpHolders?.(ip) ?? 0, 0);
      for (const [p, s] of state) if (p !== pid && s.zone && safe(() => deps.ipOf?.(p) ?? null, null) === ip) n++;
      if (n >= limits.maxPerIp) return true;
    }
    return false;
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
    if (!s.wanted || departed.has(pid) || !connected(pid)) return; // VOICE-4 / VOICE-3: no token for them
    const b = blocked(now);
    if (b) {
      if (!refresh) unavailable(pid, b);
      return;
    }
    if (!s.zone && capped(pid)) {
      unavailable(pid, 'busy');
      return;
    }
    const gen = ++s.zoneGen;
    const held: Held = { room: roomFor(zone), zone, canPublish: true, expiresAt: now + tune.tokenTtlSec * 1000, delivered: false };
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
    const s = st(pid);
    if (!s.wanted || departed.has(pid) || !connected(pid)) return;
    const b = blocked(now);
    if (b) {
      if (!refresh) unavailable(pid, b);
      return;
    }
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

  /** The server ends the announcement by itself; the ST must switch it off before starting again. */
  const endAnnounceAutomatically = (now: number, why: 'idle' | 'cap' | 'night' | 'visit') => {
    if (!announce.active) return;
    host.log.info('voice: announcement ended automatically', { why });
    stopAnnounce(now);
    announce.blocked = true;
  };

  const stopAnnounce = (now: number) => {
    if (!announce.active) return;
    announce.active = false;
    announce.by = null;
    for (const pid of state.keys()) revokeAnnounce(pid, 'announce_end', now);
    epochs.delete(ZONE_ANNOUNCE); // the next announcement uses a new room name
  };

  /** Revoke every grant (kill switch / quota). */
  const suspendAll = (b: 'disabled' | 'quota_exhausted', now: number) => {
    suspending = true;
    try {
      for (const [pid, s] of [...state]) {
        const had = Boolean(s.zone || s.announce);
        revokeZone(pid, QUOTA_REASON[b], now);
        revokeAnnounce(pid, QUOTA_REASON[b], now);
        if (had || s.wanted) unavailable(pid, b);
      }
    } finally {
      suspending = false;
    }
  };

  // -- opt-in / idle ------------------------------------------------------------------------
  const setWanted = (pid: string, wanted: boolean, now: number) => {
    const s = st(pid);
    if (s.wanted === wanted) return;
    s.wanted = wanted;
    if (!wanted) {
      revokeZone(pid, 'left', now);
      revokeAnnounce(pid, 'left', now);
      s.waitingSince = null;
      return;
    }
    s.lastActiveAt = now;
    s.waitingSince = null;
    s.unavailable = null;
    if (!configured) return unavailable(pid, 'not_configured', true);
    const zone = tracker.zoneOf(pid);
    if (zone && zone !== ZONE_NONE) grantZone(pid, zone, now);
    if (announce.active) grantAnnounce(pid, now);
  };

  const idleOut = (pid: string, now: number) => {
    const s = st(pid);
    host.log.info('voice: switched off after inactivity', { pid });
    revokeZone(pid, 'idle', now);
    revokeAnnounce(pid, 'idle', now);
    s.wanted = false;
    s.waitingSince = null;
    unavailable(pid, 'idle', true);
  };

  /** Everyone holding a grant for `room` counts as active (someone talks there). */
  const roomActive = (room: string, now: number) => {
    for (const s of state.values()) if (s.zone?.room === room) s.lastActiveAt = now;
  };

  const checkIdle = (now: number) => {
    const limits = lim();
    const ph = phase();
    const night = isNightLike(ph);
    const outsideGame = ph === null || ph === 'finished';
    for (const [pid, s] of state) {
      if (!s.wanted || departed.has(pid)) continue;
      if (night || s.disconnectedAt !== null) s.lastActiveAt = Math.max(s.lastActiveAt, now - 1); // paused
      const idleLimit = outsideGame ? limits.idleMs : limits.idleMs * 2;
      if (limits.idleMs > 0 && now - s.lastActiveAt >= idleLimit) {
        idleOut(pid, now);
        continue;
      }
      if (ph === null && limits.waitingMaxMs > 0) {
        s.waitingSince ??= now;
        if (now - s.waitingSince >= limits.waitingMaxMs) idleOut(pid, now);
      } else s.waitingSince = null;
    }
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
    const inputs = memberInputs();
    // (VOICE-7) moving counts as activity.
    for (const m of inputs) {
      if (m.x === null || m.y === null) continue;
      const s = state.get(m.pid);
      if (!s) continue;
      if (!s.lastPos || Math.abs(s.lastPos.x - m.x) + Math.abs(s.lastPos.y - m.y) > 1) {
        if (s.lastPos) s.lastActiveAt = now;
        s.lastPos = { x: m.x, y: m.y };
      }
    }
    const changes = tracker.update({ phase: ph, layout: deps.layout, members: inputs }, now);
    for (const c of changes) applyChange(c, phaseChanged ? 'phase' : 'zone_change', now);
    if (phaseChanged && ph !== null && ROTATE_PHASES.has(ph)) rotateOnPhase(now);
  };

  /** Re-deliver grants that are missing / expiring and retry refused ones (rate-limited). */
  const maintain = (now: number) => {
    if (!configured) return;
    const b = blocked(now);
    if (b) {
      suspendAll(b, now);
      return;
    }
    // (VOICE-3) a member whose game connection has been down for a while loses its grants.
    for (const [pid, s] of state) {
      if (s.disconnectedAt !== null && now - s.disconnectedAt >= tune.disconnectRevokeMs && (s.zone || s.announce)) {
        revokeZone(pid, 'left', now);
        revokeAnnounce(pid, 'left', now);
      }
    }
    checkIdle(now);
    const retry = now - lastRetry >= tune.retryIntervalMs;
    for (const m of host.members()) {
      if (!m.connected || departed.has(m.pid)) continue;
      const zone = tracker.zoneOf(m.pid);
      const s = st(m.pid);
      if (!s.wanted) continue;
      if (zone && zone !== ZONE_NONE) {
        if (!s.zone) {
          if (retry) grantZone(m.pid, zone, now);
        } else if (s.zone.expiresAt - now <= tune.refreshBeforeMs) {
          grantZone(m.pid, zone, now, true);
        }
      }
      if (announce.active) {
        if (!s.announce) {
          if (retry) grantAnnounce(m.pid, now);
        } else if (s.announce.expiresAt - now <= tune.refreshBeforeMs) grantAnnounce(m.pid, now, true);
      }
    }
    if (retry) lastRetry = now;
  };

  const onConnected = (pid: string, now: number) => {
    if (departed.has(pid)) return;
    const s = st(pid);
    s.lastCreditAt = null;
    s.unavailable = null;
    s.disconnectedAt = null;
    s.lastActiveAt = now;
    if (!configured) unavailable(pid, 'not_configured', true);
    else if (safe(() => deps.isDisabled?.() === true, true)) unavailable(pid, 'disabled', true);
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
          s.disconnectedAt = now;
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
        announce.blocked = false;
        stopAnnounce(now);
        recompute(now);
        return;
      case 'phase_changed':
        // Privacy: an announcement never runs into the night (the ST's mic would follow them into
        // private home visits).
        if (NIGHT_PHASES.has(e.phase)) endAnnounceAutomatically(now, 'night');
        recompute(now);
        return;
      case 'visit_changed':
        if (e.seat !== null) endAnnounceAutomatically(now, 'visit');
        recompute(now);
        return;
      case 'game_started':
      case 'location_changed':
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
    lobbyId: host.lobbyId,
    onEvent,

    handleStatus(pid: string, msg: C2SParsed<'voice:status'>) {
      if (disposed || !host.member(pid) || departed.has(pid)) return;
      const now = host.now();
      const s = st(pid);
      // (VOICE-4) any status from a client means its voice engine runs; `wanted:false` = switched off.
      setWanted(pid, msg.wanted ?? true, now);
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
      // The announcement stays up only while the Storyteller actually talks (not on keep-alives).
      if (announce.active && pid === announce.by && msg.publishing && msg.connected && s.announce) announce.lastActivityAt = now;
      // (VOICE-7) talking keeps the talker and everyone in the same room active.
      if (valid && msg.publishing) {
        s.lastActiveAt = now;
        if (s.zone && s.zone.room === msg.room) roomActive(s.zone.room, now);
      }
    },

    handleAnnounce(pid: string, msg: C2SParsed<'voice:announce'>) {
      if (disposed) return;
      const now = host.now();
      if (pid !== host.storytellerPid()) {
        host.send(pid, 'error', { code: 'forbidden', message: 'Only the Storyteller can make announcements.', for: 'voice:announce' });
        return;
      }
      if (!msg.active) {
        announce.blocked = false;
        stopAnnounce(now);
        return;
      }
      st(pid).lastActiveAt = now;
      if (announce.active || announce.blocked) return; // keep-alives do not extend it
      if (NIGHT_PHASES.has(phase() ?? '')) {
        host.send(pid, 'error', { code: 'phase', message: 'Announcements to the whole town are not available at night.', for: 'voice:announce' });
        return;
      }
      if (!configured) {
        unavailable(pid, 'not_configured', true);
        return;
      }
      const b = blocked(now);
      if (b) {
        unavailable(pid, b, true);
        return;
      }
      announce.active = true;
      announce.by = pid;
      announce.startedAt = now;
      announce.lastActivityAt = now;
      host.log.info('voice: announcement started');
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
      if (announce.active) {
        const max = lim().announceMaxMs;
        if (now - announce.lastActivityAt > tune.announceIdleMs) endAnnounceAutomatically(now, 'idle');
        else if (max > 0 && now - announce.startedAt >= max) endAnnounceAutomatically(now, 'cap');
      }
      if (now - lastMaintain >= tune.maintainIntervalMs) {
        lastMaintain = now;
        maintain(now);
        runRemovals(now);
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
      removals.clear();
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

    holders() {
      if (disposed) return 0;
      let n = 0;
      for (const s of state.values()) if (s.zone) n++;
      return n;
    },

    holdersWithIp(ip: string) {
      if (disposed) return 0;
      let n = 0;
      for (const [pid, s] of state) if (s.zone && safe(() => deps.ipOf?.(pid) ?? null, null) === ip) n++;
      return n;
    },

    isAuthorized(identity: string, room: string) {
      return !disposed && authorizedFor(identity, room);
    },

    evict(room: string, identity: string) {
      if (disposed || authorizedFor(identity, room)) return;
      evict(room, identity);
      scheduleAudit(room, ZONE_NONE, host.now());
    },

    enforce(now = host.now()) {
      if (disposed || !configured) return;
      quotaCache = null;
      const b = blocked(now);
      if (b) {
        suspendAll(b, now);
        return;
      }
      lastRetry = -Infinity; // re-grant wanted members right away
      maintain(now);
    },
  };
  return coordinator;
}
