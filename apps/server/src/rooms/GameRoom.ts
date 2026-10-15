// OWNED BY lobby-auth. One Colyseus room per lobby. Responsibilities: ticket auth, seat/member
// lifecycle, duplicate-device policy, reconnection, C2S validation via the protocol C2S map,
// dispatch to Game/World/Voice modules, per-client view fan-out, stats persistence, idle disposal.
//
// Lifecycle (docs/architecture.md):
//   WAITING ──lobby:start (ST, 5..max players, all connected + ready)──▶ IN_GAME ──game_finished──▶ FINISHED
//      ▲                                                                                          │
//      └───────────────────── lobby:start while FINISHED (ST or host) = rematch ◀─────────────────┘
//
// Decisions:
// * Joining is decided synchronously in onJoin (Colyseus runs it without awaiting anything
//   else for this room), so capacity checks are atomic. Colyseus `maxClients` is deliberately
//   generous (slack for duplicate-device takeovers and pending reconnections); the real cap
//   (players <= maxPlayers, ST seat separate) is enforced here.
// * After start the room is LOGICALLY locked (non-members rejected in onJoin) instead of
//   Colyseus `lock()`: a Colyseus-locked room rejects `joinById`, which would break the
//   architecture's "fresh `reconnect` ticket restores your seat" path for a member who lost
//   their reconnection token (new tab / device / expired grace).
// * Duplicate device: newest connection wins; the older one is closed with CLOSE_CODES.replaced.
import { ClientState, Room, ServerError, type Client } from '@colyseus/core';
import { z } from 'zod';
import {
  C2S,
  CLOSE_CODES,
  RoomJoinOptions,
  SERVER_TICK_HZ,
  SNAPSHOT_HZ,
  type C2SParsed,
  type C2SType,
  type ChatMessage,
  type Cosmetics,
  type DirectoryPhase,
  type LobbyRoomView,
  type LobbySummary,
  type MemberRole,
  type S2CMessages,
  type S2CType,
  type ScriptId,
  type ServerErrorMsg,
} from '@ct/protocol';
import { getServices, type Services } from '../services.js';
import { createGameModule } from '../game/index.js';
import { createWorldModule } from '../world/index.js';
import { createVoiceModule } from '../voice/index.js';
import type { GameModule, Logger, RoomEvent, RoomHost, RoomMember, VoiceModule, WorldModule } from './modules.js';
import { randomId } from '../auth/crypto.js';
import { RateLimiter } from '../auth/rateLimit.js';
import { isAllowedPreset } from '../auth/presets.js';
import type { JoinIntent } from '../directory/tickets.js';
import { displayLabels, memberView, shuffle, startBlockers } from './memberUtil.js';

/** Waiting-room disconnect: seat held this long, then released. */
export const WAITING_GRACE_SEC = 30;
/** An empty lobby outside a running game is disposed after this long (SR-2). */
export const EMPTY_LOBBY_TIMEOUT_SEC = 120;
/** A kicked account cannot rejoin the same lobby for this long. */
export const KICK_BAN_MS = 10 * 60_000;
/** If the creator has not shown up after this long, the first joiner becomes host. */
const CREATOR_HOST_GRACE_MS = 30_000;

/** Error codes delivered to colyseus.js when a join is refused (onAuth / onJoin). */
// (Chosen outside Colyseus' own 4000-4217 protocol/matchmaking ranges; these arrive as the
// error code of the rejected join, the socket itself closes with Colyseus' WS_CLOSE_WITH_ERROR.)
export const JOIN_ERRORS = {
  unauthorized: CLOSE_CODES.unauthorized,
  lobbyFull: 4310,
  lobbyStarted: 4311,
  storytellerTaken: 4312,
  noSeat: 4313,
  banned: 4314,
} as const;

/** Per-pid message budgets (token buckets). */
const MESSAGE_LIMITS: Record<string, { capacity: number; refillPerSec: number }> = {
  move: { capacity: 40, refillPerSec: 30 },
  'chat:send': { capacity: 4, refillPerSec: 2 },
  'voice:status': { capacity: 2, refillPerSec: 1 }, // <= 1/s sustained
  'voice:announce': { capacity: 2, refillPerSec: 2 }, // <= 2/s
  default: { capacity: 20, refillPerSec: 10 },
};

type Status = 'waiting' | 'in_game' | 'finished';

interface RoomUserData {
  pid: string;
}

interface RoomAuthData {
  accountId: string;
  intent: JoinIntent;
  displayName: string;
  cosmetics: Cosmetics;
}

type GameClient = Client<RoomUserData, RoomAuthData>;
type Reconnection = ReturnType<Room['allowReconnection']>;

/** Room-private bookkeeping for one member. `member` is the object modules see. */
interface Seat {
  member: RoomMember;
  client: GameClient | null;
  ready: boolean;
  joinedAt: number;
  /** Explicit `lobby:leave` received: the following disconnect is final (waiting) / no grace. */
  leaving: boolean;
  graceTimer: { clear(): void } | null;
  reconnection: Reconnection | null;
  /**
   * Messages from a Colyseus token-reconnection client that arrived before reattach() bound it
   * to this seat (same sessionId as the seat's client; the reattach runs a few microtasks after
   * Colyseus starts listening). Replayed in order by reattach(). Bounded.
   */
  pending?: { client: GameClient; type: string; raw: unknown }[];
}

/** A connected seat whose client cannot receive (JOINING / socket not open) for this long is closed. */
const FEED_STUCK_MS = 5000;
/** Max messages held for a client that is not bound to its seat yet. */
const PENDING_MAX = 32;
/** Stale-connection warnings: at most one per pid per this many ms. */
const STALE_WARN_MS = 10_000;

const CreateOptions = z.object({ lobbyId: z.string().min(4).max(32) });

export class GameRoom extends Room<any, any, RoomUserData, RoomAuthData> {
  // Generous: see header comment. Real capacity is enforced in onJoin.
  override maxClients = 64;

  private services!: Services;
  private log!: Logger;
  lobbyId = '';
  private settings!: { name: string; description: string; script: ScriptId; maxPlayers: number };
  private createdAt = 0;
  private creatorAccountId = '';
  private creatorName = '';
  private creatorTakesStoryteller = false;
  private creatorJoined = false;

  private status: Status = 'waiting';
  private seats = new Map<string, Seat>(); // pid -> seat
  private byAccount = new Map<string, string>(); // accountId -> pid
  private bans = new Map<string, number>(); // accountId -> until
  private matchId: string | null = null;
  private matchStartedAt = 0;
  private matchRoster = new Map<string, string>(); // pid -> accountId (frozen at start)
  private matchStorytellerAccountId: string | null = null;
  private matchRecorded = false;

  private host!: RoomHost;
  private game!: GameModule;
  private world!: WorldModule;
  private voice!: VoiceModule;

  private queue: RoomEvent[] = [];
  private draining = false;
  private gameDirty = false;
  private lobbyDirty = true;
  private forceGameView = new Set<string>();
  private lastGameView = new Map<string, string>();
  private snapshotAcc = 0;
  private idleSince: number | null = null;
  private idleCheckAcc = 0;
  private disposing = false;

  private limiters = new Map<string, RateLimiter>();
  private errorLimiter = new RateLimiter({ capacity: 5, refillPerSec: 1 });

  // ------------------------------------------------------------------------------------
  // Colyseus lifecycle

  override onCreate(options: unknown) {
    this.services = getServices();
    const { lobbyId } = CreateOptions.parse(options);
    const init = this.services.directory.takeInit(lobbyId);
    if (!init) throw new Error(`unknown lobby ${lobbyId}`);
    this.lobbyId = lobbyId;
    this.settings = { name: init.name, description: init.description, script: init.script, maxPlayers: init.maxPlayers };
    this.createdAt = init.createdAt;
    this.creatorAccountId = init.creatorAccountId;
    this.creatorName = init.creatorName;
    this.creatorTakesStoryteller = init.creatorTakesStoryteller;
    const base = this.services.log;
    const ctx = { lobbyId };
    this.log = {
      debug: (m, d) => base.debug(m, { ...ctx, ...d }),
      info: (m, d) => base.info(m, { ...ctx, ...d }),
      warn: (m, d) => base.warn(m, { ...ctx, ...d }),
      error: (m, d) => base.error(m, { ...ctx, ...d }),
    };

    // A lobby must survive brief disconnects; idle disposal is ours (LOBBY_IDLE_TIMEOUT_SEC).
    this.autoDispose = false;
    this.patchRate = 0; // no Colyseus schema state; we send explicit messages only

    this.host = this.createHost();
    this.createModules();

    for (const [type, spec] of Object.entries(MESSAGE_LIMITS)) this.limiters.set(type, new RateLimiter(spec));
    this.onMessage('*', (client, type, message) => this.handleMessage(client as GameClient, String(type), message));
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / SERVER_TICK_HZ);
    // A joining socket must arrive within this many seconds of the HTTP seat reservation. The
    // Colyseus default (15 s) expired under heavy host load ("seat reservation expired", 4002),
    // which made clients retry with a second join.
    this.setSeatReservationTime(30);

    this.services.directory.attachRoom(lobbyId, {
      roomId: this.roomId,
      isMember: (accountId) => this.byAccount.has(accountId),
      isBanned: (accountId) => this.isBanned(accountId),
      connectedCount: () => this.connectedSeats().length,
      summary: () => this.summary(),
      close: () => {
        if (this.disposing) return;
        this.disposing = true;
        this.log.info('lobby closed by admin');
        for (const s of this.seats.values()) {
          try {
            s.client?.send('kicked', { reason: 'This lobby was closed by an administrator' });
          } catch {
            // already gone
          }
        }
        void this.disconnect(CLOSE_CODES.lobbyClosed);
      },
    });
    this.services.directory.update(this.summary());
    this.log.info('room created', { roomId: this.roomId });
  }

  override onAuth(_client: GameClient, options: unknown): RoomAuthData {
    const opts = RoomJoinOptions.safeParse(options);
    if (!opts.success) throw new ServerError(JOIN_ERRORS.unauthorized, 'Invalid join options');
    const check = this.services.tickets.verify(opts.data.ticket, this.lobbyId);
    if (!check.ok) {
      this.log.info('ticket rejected', { reason: check.reason });
      throw new ServerError(JOIN_ERRORS.unauthorized, `Join ticket rejected (${check.reason})`);
    }
    const account = this.services.accounts.findById(check.claims.accountId);
    if (!account) throw new ServerError(JOIN_ERRORS.unauthorized, 'Unknown account');
    return { accountId: account.id, intent: check.claims.intent, displayName: account.displayName, cosmetics: account.cosmetics };
  }

  /** Synchronous: membership + capacity decisions are atomic per room. */
  override onJoin(client: GameClient, _options: unknown, auth: RoomAuthData) {
    const existing = this.byAccount.get(auth.accountId);
    const seat = existing ? this.seats.get(existing) : undefined;
    if (seat) this.restore(seat, client, auth);
    else this.admit(client, auth);
    this.afterHandler();
  }

  override async onLeave(client: GameClient, consented: boolean) {
    const pid = client.userData?.pid;
    const seat = pid ? this.seats.get(pid) : undefined;
    if (!seat || seat.client !== client) return; // never admitted, already removed, or replaced
    seat.member.connected = false;
    this.host.emit({ type: 'member_connection', pid: seat.member.pid, connected: false });
    this.lobbyDirty = true;
    this.gameDirty = true;
    const finalLeave = consented || seat.leaving;
    if (this.status === 'waiting' && finalLeave) {
      this.removeMember(seat, 'left');
      this.afterHandler();
      return;
    }
    this.afterHandler();
    if (finalLeave) return; // in game: seat kept for the match; a fresh ticket restores it
    if (this.disposing) return;

    const graceSec = this.status === 'waiting' ? this.waitingGraceSec() : this.services.config.reconnectGraceSec;
    let reconnection: Reconnection;
    try {
      reconnection = this.allowReconnection(client, graceSec);
    } catch {
      return;
    }
    seat.reconnection = reconnection;
    try {
      const fresh = (await reconnection) as GameClient;
      if (seat.reconnection !== reconnection || !this.seats.has(seat.member.pid)) return;
      seat.reconnection = null;
      this.reattach(seat, fresh);
      this.log.info('member reconnected', { pid: seat.member.pid });
    } catch {
      if (seat.reconnection !== reconnection) return; // superseded (fresh ticket / removal / dispose)
      seat.reconnection = null;
      // Waiting room: release the seat. In game: keep it (fresh `reconnect` ticket restores).
      if (this.status === 'waiting' && seat.client === client && !seat.member.connected && this.seats.has(seat.member.pid)) {
        this.removeMember(seat, 'grace_expired');
      }
    }
    this.afterHandler();
  }

  override async onDispose() {
    this.disposing = true;
    this.services.directory.remove(this.lobbyId);
    try {
      await this.voice.dispose();
    } catch (e) {
      this.log.warn('voice dispose failed', { err: errMsg(e) });
    }
    this.log.info('room disposed');
  }

  // ------------------------------------------------------------------------------------
  // Membership

  private admit(client: GameClient, auth: RoomAuthData) {
    if (this.isBanned(auth.accountId)) throw new ServerError(JOIN_ERRORS.banned, 'You were removed from this lobby');
    if (auth.intent === 'reconnect') throw new ServerError(JOIN_ERRORS.noSeat, 'You have no seat to restore in this lobby');
    if (this.status !== 'waiting') throw new ServerError(JOIN_ERRORS.lobbyStarted, 'This game has already started');
    const isCreator = auth.accountId === this.creatorAccountId;
    const stOpen = this.storytellerSeat() === null;
    let role: MemberRole;
    if (auth.intent === 'storyteller') {
      if (!stOpen) throw new ServerError(JOIN_ERRORS.storytellerTaken, 'The Storyteller seat is taken');
      role = 'storyteller';
    } else if (isCreator && this.creatorTakesStoryteller && !this.creatorJoined && stOpen) {
      role = 'storyteller';
    } else {
      if (this.playerSeats().length >= this.settings.maxPlayers) throw new ServerError(JOIN_ERRORS.lobbyFull, 'This lobby is full');
      role = 'player';
    }
    let pid = `p_${randomId(10)}`;
    while (this.seats.has(pid)) pid = `p_${randomId(10)}`;
    const now = Date.now();
    const hasHost = [...this.seats.values()].some((s) => s.member.isHost);
    const becomesHost = !hasHost && (isCreator || this.creatorJoined || now - this.createdAt > CREATOR_HOST_GRACE_MS);
    const seat: Seat = {
      member: {
        pid,
        accountId: auth.accountId,
        displayName: auth.displayName,
        role,
        seat: null,
        connected: true,
        cosmetics: auth.cosmetics,
        isHost: becomesHost,
      },
      client,
      ready: false,
      joinedAt: now,
      leaving: false,
      graceTimer: null,
      reconnection: null,
    };
    if (isCreator) this.creatorJoined = true;
    this.seats.set(pid, seat);
    this.byAccount.set(auth.accountId, pid);
    client.userData = { pid };
    this.host.emit({ type: 'member_joined', pid });
    if (role === 'storyteller') this.host.emit({ type: 'role_changed', pid, role });
    this.lobbyDirty = true;
    this.forceGameView.add(pid);
    this.log.info('member joined', { pid, role });
  }

  /** Same account again: fresh ticket after a drop, or a second device (newest wins). */
  private restore(seat: Seat, client: GameClient, auth: RoomAuthData) {
    const old = seat.client;
    if (seat.reconnection) {
      const r = seat.reconnection;
      seat.reconnection = null;
      r.reject(new Error('superseded by a fresh join'));
    }
    if (this.status === 'waiting') {
      seat.member.displayName = auth.displayName;
    }
    this.reattach(seat, client);
    if (old && old !== client && old.state !== ClientState.LEAVING) {
      this.log.info('member replaced by newer connection', { pid: seat.member.pid });
      try {
        old.leave(CLOSE_CODES.replaced, 'This account joined from another device');
      } catch {
        // already closed
      }
    }
    if (this.status === 'waiting' && auth.intent === 'storyteller' && seat.member.role === 'player' && !this.storytellerSeat()) {
      this.setRole(seat, 'storyteller');
    }
  }

  private reattach(seat: Seat, client: GameClient) {
    const pending = seat.pending;
    seat.pending = undefined;
    seat.client = client;
    seat.leaving = false;
    seat.graceTimer?.clear();
    seat.graceTimer = null;
    client.userData = { pid: seat.member.pid };
    if (!seat.member.connected) {
      seat.member.connected = true;
      this.host.emit({ type: 'member_connection', pid: seat.member.pid, connected: true });
    }
    this.lobbyDirty = true;
    this.gameDirty = true;
    this.forceGameView.add(seat.member.pid);
    this.lastGameView.delete(seat.member.pid);
    // Replay what the reconnecting client sent before it was bound (same session only).
    if (pending?.length) {
      queueMicrotask(() => {
        for (const m of pending) if (seat.client === client && m.client.sessionId === client.sessionId) this.handleMessage(client, m.type, m.raw);
      });
    }
  }

  private removeMember(seat: Seat, reason: 'left' | 'grace_expired' | 'kicked') {
    const { pid, accountId } = seat.member;
    if (!this.seats.delete(pid)) return;
    this.byAccount.delete(accountId);
    seat.graceTimer?.clear();
    seat.graceTimer = null;
    if (seat.reconnection) {
      const r = seat.reconnection;
      seat.reconnection = null;
      r.reject(new Error('seat released'));
    }
    seat.member.connected = false;
    if (seat.member.isHost) {
      seat.member.isHost = false;
      const next = [...this.seats.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) next.member.isHost = true;
    }
    this.lastGameView.delete(pid);
    this.forceGameView.delete(pid);
    for (const l of this.limiters.values()) l.delete(`${pid}`);
    this.host.emit({ type: 'member_left', pid });
    this.lobbyDirty = true;
    this.log.info('member left', { pid, reason });
  }

  private setRole(seat: Seat, role: MemberRole) {
    if (seat.member.role === role) return;
    seat.member.role = role;
    seat.member.seat = null;
    seat.ready = false;
    this.host.emit({ type: 'role_changed', pid: seat.member.pid, role });
    this.lobbyDirty = true;
  }

  // ------------------------------------------------------------------------------------
  // Messages

  private staleWarnAt = new Map<string, number>();

  /**
   * A message from a connection that is not (or not yet) the seat's current client.
   * - Token reconnection not bound yet (same Colyseus sessionId, reconnection pending): queue it;
   *   reattach() replays it, so nothing a player clicks right after a reconnect is lost.
   * - Otherwise the connection was replaced (newer tab/device, or a client retry that opened a
   *   second socket) or its seat is gone: say so (error + close 4102) instead of dropping it
   *   silently, so the client can recover, and log it (rate-limited).
   */
  private strayMessage(client: GameClient, seat: Seat | undefined, pid: string | undefined, type: string, raw: unknown) {
    if (seat && seat.client && seat.reconnection && seat.client.sessionId === client.sessionId) {
      seat.pending ??= [];
      if (seat.pending.length < PENDING_MAX) seat.pending.push({ client, type, raw });
      return;
    }
    const key = pid ?? client.sessionId;
    const now = Date.now();
    if ((this.staleWarnAt.get(key) ?? 0) + STALE_WARN_MS <= now) {
      this.staleWarnAt.set(key, now);
      if (this.staleWarnAt.size > 500) this.staleWarnAt.clear();
      this.log.warn('message from a stale connection', { lobbyId: this.lobbyId, pid: pid ?? null, type: type.slice(0, 40), seat: seat ? 'replaced' : 'none' });
    }
    try {
      client.send('error', {
        code: 'forbidden',
        message: seat ? 'stale_connection: this connection was replaced by a newer one' : 'stale_connection: you are no longer in this lobby',
        for: type.slice(0, 40),
      } satisfies ServerErrorMsg);
      if (seat && client.state !== ClientState.LEAVING) client.leave(CLOSE_CODES.replaced, 'This connection was replaced');
    } catch {
      // already closed
    }
  }

  private handleMessage(client: GameClient, type: string, raw: unknown) {
    const pid = client.userData?.pid;
    const seat = pid ? this.seats.get(pid) : undefined;
    if (!seat || seat.client !== client) return this.strayMessage(client, seat, pid, type, raw);
    const schema = (C2S as Record<string, z.ZodType>)[type];
    if (!schema) return this.sendError(seat, { code: 'invalid', message: 'Unknown message type', for: type.slice(0, 40) });
    const limiter = this.limiters.get(type) ?? this.limiters.get('default')!;
    if (!limiter.take(`${seat.member.pid}`)) return this.sendError(seat, { code: 'rate_limited', message: 'Slow down', for: type });
    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) return this.sendError(seat, { code: 'invalid', message: 'Invalid message payload', for: type });
    try {
      this.dispatch(seat, type as C2SType, parsed.data);
    } catch (e) {
      this.log.error('message handler failed', { type, err: errMsg(e) });
      this.sendError(seat, { code: 'internal', message: 'Something went wrong', for: type });
    }
    this.afterHandler();
  }

  private dispatch(seat: Seat, type: C2SType, msg: unknown) {
    const m = seat.member;
    const isSt = m.role === 'storyteller';
    switch (type) {
      case 'lobby:ready': {
        if (!this.requireWaiting(seat, type)) return;
        if (isSt) return this.sendError(seat, { code: 'forbidden', message: 'The Storyteller does not ready up', for: type });
        seat.ready = (msg as C2SParsed<'lobby:ready'>).ready;
        this.lobbyDirty = true;
        return;
      }
      case 'lobby:cosmetics': {
        if (!this.requireWaiting(seat, type)) return;
        const { cosmetics } = msg as C2SParsed<'lobby:cosmetics'>;
        if (!isAllowedPreset(cosmetics.preset)) return this.sendError(seat, { code: 'invalid', message: 'Unknown character preset', for: type });
        m.cosmetics = cosmetics;
        this.services.accounts.updateProfile(m.accountId, { cosmetics });
        this.lobbyDirty = true;
        return;
      }
      case 'lobby:claimStoryteller': {
        if (!this.requireWaiting(seat, type)) return;
        if (isSt) return;
        if (this.storytellerSeat()) return this.sendError(seat, { code: 'forbidden', message: 'The Storyteller seat is taken', for: type });
        this.setRole(seat, 'storyteller');
        return;
      }
      case 'lobby:releaseStoryteller': {
        if (!this.requireWaiting(seat, type)) return;
        if (!isSt) return this.sendError(seat, { code: 'forbidden', message: 'You are not the Storyteller', for: type });
        if (this.playerSeats().length >= this.settings.maxPlayers) {
          return this.sendError(seat, { code: 'forbidden', message: 'No free player seat to move to', for: type });
        }
        this.setRole(seat, 'player');
        return;
      }
      case 'lobby:transferStoryteller': {
        if (!this.requireWaiting(seat, type)) return;
        const target = this.seats.get((msg as C2SParsed<'lobby:transferStoryteller'>).pid);
        const st = this.storytellerSeat();
        // Only the host or the current Storyteller may move the seat; players cannot seize it.
        if (!(m.isHost || isSt)) return this.sendError(seat, { code: 'forbidden', message: 'Only the host or Storyteller can do that', for: type });
        if (!target) return this.sendError(seat, { code: 'not_found', message: 'No such member', for: type });
        if (target === st) return;
        if (st) this.setRole(st, 'player'); // swap: player count unchanged
        this.setRole(target, 'storyteller');
        return;
      }
      case 'lobby:transferHost': {
        if (!m.isHost) return this.sendError(seat, { code: 'forbidden', message: 'Only the host can do that', for: type });
        const target = this.seats.get((msg as C2SParsed<'lobby:transferHost'>).pid);
        if (!target) return this.sendError(seat, { code: 'not_found', message: 'No such member', for: type });
        if (target === seat) return;
        m.isHost = false;
        target.member.isHost = true;
        this.lobbyDirty = true;
        return;
      }
      case 'lobby:kick': {
        if (!m.isHost) return this.sendError(seat, { code: 'forbidden', message: 'Only the host can do that', for: type });
        if (!this.requireWaiting(seat, type)) return;
        const target = this.seats.get((msg as C2SParsed<'lobby:kick'>).pid);
        if (!target) return this.sendError(seat, { code: 'not_found', message: 'No such member', for: type });
        if (target === seat) return this.sendError(seat, { code: 'forbidden', message: 'You cannot kick yourself', for: type });
        this.bans.set(target.member.accountId, Date.now() + KICK_BAN_MS);
        const c = target.client;
        this.removeMember(target, 'kicked');
        if (c) {
          try {
            c.send('kicked', { reason: 'Removed by the host' } satisfies S2CMessages['kicked']);
            c.leave(CLOSE_CODES.kicked, 'Removed by the host');
          } catch {
            // already gone
          }
        }
        return;
      }
      case 'lobby:settings': {
        if (!m.isHost) return this.sendError(seat, { code: 'forbidden', message: 'Only the host can do that', for: type });
        if (!this.requireWaiting(seat, type)) return;
        const s = msg as C2SParsed<'lobby:settings'>;
        if (s.maxPlayers !== undefined) {
          const max = Math.min(s.maxPlayers, this.services.config.playerMaxPerLobby);
          if (max < this.playerSeats().length) {
            return this.sendError(seat, { code: 'invalid', message: 'More players are seated than that', for: type });
          }
          this.settings.maxPlayers = max;
        }
        if (s.name !== undefined) this.settings.name = s.name;
        if (s.description !== undefined) this.settings.description = s.description;
        this.lobbyDirty = true;
        return;
      }
      case 'lobby:start':
        return this.handleStart(seat);
      case 'lobby:leave': {
        seat.leaving = true;
        if (this.status === 'waiting') {
          const c = seat.client;
          this.removeMember(seat, 'left');
          try {
            c?.leave(4000);
          } catch {
            // ignore
          }
        }
        return;
      }
      case 'move':
        return this.world.handleMove(m.pid, msg as C2SParsed<'move'>);
      case 'world:useDoor':
        return this.world.handleUseDoor(m.pid, msg as C2SParsed<'world:useDoor'>);
      case 'chat:send':
        return this.handleChat(seat, (msg as C2SParsed<'chat:send'>).text);
      case 'game:nominate':
      case 'game:vote':
      case 'game:promptResponse':
      case 'game:slayerShot': {
        if (this.status !== 'in_game') return this.sendError(seat, { code: 'phase', message: 'No game in progress', for: type });
        if (m.role !== 'player') return this.sendError(seat, { code: 'forbidden', message: 'Players only', for: type });
        this.game.handlePlayer(m.pid, type, msg as C2SParsed<'game:vote'>);
        return;
      }
      case 'st:command': {
        if (!isSt) return this.sendError(seat, { code: 'forbidden', message: 'Storyteller only', for: type });
        // After the game ends the ST may still announce / move around; the rules module rejects
        // everything that would change the (final, already recorded) result.
        if (this.status === 'waiting') return this.sendError(seat, { code: 'phase', message: 'No game in progress', for: type });
        this.game.handleStoryteller(m.pid, msg as C2SParsed<'st:command'>);
        return;
      }
      case 'voice:status':
        return this.voice.handleStatus(m.pid, msg as C2SParsed<'voice:status'>);
      case 'voice:announce':
        return this.voice.handleAnnounce(m.pid, msg as C2SParsed<'voice:announce'>);
      case 'ping':
        return this.sendTo(seat, 'pong', { t: Date.now() });
    }
  }

  private requireWaiting(seat: Seat, type: string): boolean {
    if (this.status === 'waiting') return true;
    this.sendError(seat, { code: 'phase', message: 'Only possible while the lobby is waiting', for: type });
    return false;
  }

  private handleStart(seat: Seat) {
    const m = seat.member;
    if (this.status === 'finished') {
      // Rematch: back to the waiting room with the same members.
      if (!(m.role === 'storyteller' || m.isHost)) {
        return this.sendError(seat, { code: 'forbidden', message: 'Only the Storyteller or host can start a rematch', for: 'lobby:start' });
      }
      return this.resetForRematch();
    }
    if (m.role !== 'storyteller') return this.sendError(seat, { code: 'forbidden', message: 'Only the Storyteller can start', for: 'lobby:start' });
    const blockers = this.startBlockers();
    if (blockers.length) return this.sendError(seat, { code: 'phase', message: blockers.join('; '), for: 'lobby:start' });

    const st = this.storytellerSeat()!;
    const players = shuffle(this.playerSeats());
    const seats = players.map((s, i) => {
      s.member.seat = i;
      return { pid: s.member.pid, seat: i };
    });
    this.status = 'in_game';
    this.matchId = `m_${randomId(16)}`;
    this.matchStartedAt = Date.now();
    this.matchRecorded = false;
    this.matchRoster = new Map(players.map((s) => [s.member.pid, s.member.accountId]));
    this.matchStorytellerAccountId = st.member.accountId;
    for (const s of this.seats.values()) s.ready = false;

    this.host.emit({ type: 'game_started', seats, storytellerPid: st.member.pid });
    this.game.start(
      players.map((s) => ({ pid: s.member.pid, seat: s.member.seat!, name: this.label(s.member.pid) })),
      st.member.pid,
    );
    try {
      this.services.stats.recordMatchStarted({
        matchId: this.matchId,
        lobbyId: this.lobbyId,
        script: this.settings.script,
        startedAt: this.matchStartedAt,
        storytellerAccountId: st.member.accountId,
        players: players.map((s) => ({ accountId: s.member.accountId, seat: s.member.seat! })),
      });
    } catch (e) {
      this.log.error('recording match start failed', { err: errMsg(e) });
    }
    this.lobbyDirty = true;
    this.gameDirty = true;
    this.log.info('game started', { matchId: this.matchId, players: seats.length });
  }

  private resetForRematch() {
    this.status = 'waiting';
    this.matchId = null;
    this.matchRoster.clear();
    this.matchStorytellerAccountId = null;
    this.matchRecorded = false;
    this.lastGameView.clear();
    const oldVoice = this.voice;
    void oldVoice.dispose().catch((e) => this.log.warn('voice dispose failed', { err: errMsg(e) }));
    this.queue.length = 0;
    this.createModules();
    for (const s of this.seats.values()) {
      s.member.seat = null;
      s.ready = false;
      this.host.emit({ type: 'member_joined', pid: s.member.pid });
      if (s.member.role === 'storyteller') this.host.emit({ type: 'role_changed', pid: s.member.pid, role: 'storyteller' });
      if (!s.member.connected) this.startWaitingGrace(s);
    }
    this.lobbyDirty = true;
    this.gameDirty = true;
    this.log.info('rematch: lobby reset to waiting');
  }

  private startWaitingGrace(seat: Seat) {
    seat.graceTimer?.clear();
    seat.graceTimer = this.clock.setTimeout(() => {
      seat.graceTimer = null;
      if (this.status === 'waiting' && !seat.member.connected && this.seats.get(seat.member.pid) === seat) {
        this.removeMember(seat, 'grace_expired');
        this.afterHandler();
      }
    }, this.waitingGraceSec() * 1000);
  }

  private waitingGraceSec(): number {
    return this.services.options.waitingGraceSec ?? WAITING_GRACE_SEC;
  }

  private handleChat(seat: Seat, text: string) {
    const m = seat.member;
    const inGame = this.status === 'in_game';
    const msg: ChatMessage = {
      id: randomId(10),
      fromPid: m.pid,
      fromName: this.label(m.pid),
      text,
      scope: inGame ? (m.role === 'storyteller' ? 'storyteller' : 'zone') : 'lobby',
      at: Date.now(),
    };
    if (!inGame) {
      for (const s of this.seats.values()) this.sendTo(s, 'chat:message', msg);
      return;
    }
    // In game: exactly the voice audience (server-computed acoustic zone) plus the sender.
    const audience = new Set(this.voice.audienceOf(m.pid));
    audience.add(m.pid);
    for (const pid of audience) {
      const s = this.seats.get(pid);
      if (s) this.sendTo(s, 'chat:message', msg);
    }
  }

  // ------------------------------------------------------------------------------------
  // Events, ticks and fan-out

  private createModules() {
    // Factories must not call each other synchronously (host getters resolve lazily).
    const f = this.services.options.moduleFactories ?? {};
    this.game = (f.game ?? createGameModule)(this.host);
    this.world = (f.world ?? createWorldModule)(this.host);
    this.voice = (f.voice ?? createVoiceModule)(this.host);
  }

  private createHost(): RoomHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const room = this;
    return {
      get lobbyId() {
        return room.lobbyId;
      },
      env: this.services.config.env,
      log: this.log,
      now: () => Date.now(),
      members: () => [...room.seats.values()].map((s) => s.member),
      member: (pid) => room.seats.get(pid)?.member,
      storytellerPid: () => room.storytellerSeat()?.member.pid ?? null,
      send(pid, type, payload) {
        const s = room.seats.get(pid);
        if (s) room.sendTo(s, type, payload);
      },
      emit(event) {
        room.queue.push(event);
      },
      markGameDirty() {
        room.gameDirty = true;
      },
      markLobbyDirty() {
        room.lobbyDirty = true;
      },
      get game() {
        return room.game;
      },
      get world() {
        return room.world;
      },
      get voice() {
        return room.voice;
      },
    };
  }

  /** Dispatches queued RoomEvents to every module, then lets the room react. */
  private afterHandler() {
    if (this.draining) return;
    this.draining = true;
    try {
      let guard = 0;
      while (this.queue.length) {
        if (++guard > 5000) {
          this.log.error('room event storm; dropping queue', { pending: this.queue.length });
          this.queue.length = 0;
          break;
        }
        const e = this.queue.shift()!;
        for (const [name, mod] of [
          ['game', this.game],
          ['world', this.world],
          ['voice', this.voice],
        ] as const) {
          try {
            mod.onEvent(e);
          } catch (err) {
            this.log.error('module onEvent failed', { module: name, event: e.type, err: errMsg(err) });
          }
        }
        this.onRoomEvent(e);
      }
    } finally {
      this.draining = false;
    }
  }

  private onRoomEvent(e: RoomEvent) {
    switch (e.type) {
      case 'phase_changed':
      case 'alive_changed':
        this.lobbyDirty = true;
        this.gameDirty = true;
        return;
      case 'game_finished':
        this.finishGame();
        return;
    }
  }

  private finishGame() {
    if (this.status !== 'in_game') return;
    this.status = 'finished';
    this.lobbyDirty = true;
    this.gameDirty = true;
    this.recordOutcome();
  }

  private recordOutcome() {
    if (this.matchRecorded || !this.matchId) return;
    let outcome: ReturnType<GameModule['outcome']>;
    try {
      outcome = this.game.outcome();
    } catch (e) {
      this.log.error('game.outcome failed', { err: errMsg(e) });
      return;
    }
    if (!outcome) return;
    const players = outcome.players.flatMap((p) => {
      const accountId = this.matchRoster.get(p.pid);
      if (!accountId) return [];
      return [
        {
          accountId,
          seat: p.seat,
          startingCharacter: p.startingCharacter,
          finalCharacter: p.finalCharacter,
          alignment: p.finalAlignment,
          won: p.finalAlignment === outcome.winner,
          alive: p.alive,
          executed: p.executed,
          died: p.died,
          nominations: p.nominationsMade,
          ghostVoteUsed: p.ghostVoteUsed,
        },
      ];
    });
    try {
      const fresh = this.services.stats.recordMatchFinished({
        matchId: this.matchId,
        lobbyId: this.lobbyId,
        script: this.settings.script,
        startedAt: this.matchStartedAt || outcome.startedAt,
        endedAt: outcome.endedAt,
        winner: outcome.winner,
        reason: outcome.reason,
        storytellerAccountId: this.matchStorytellerAccountId,
        players,
      });
      this.matchRecorded = true;
      this.log.info('match recorded', { matchId: this.matchId, fresh, winner: outcome.winner });
    } catch (e) {
      this.log.error('recording match result failed', { err: errMsg(e) });
    }
  }

  private tick(dtMs: number) {
    const now = Date.now();
    for (const [name, fn] of [
      ['world', () => this.world.tick(dtMs)],
      ['game', () => this.game.tick(now)],
      ['voice', () => this.voice.tick(now)],
    ] as const) {
      try {
        fn();
      } catch (e) {
        this.log.error('module tick failed', { module: name, err: errMsg(e) });
      }
    }
    this.afterHandler();
    // Fallback in case the game module finished without emitting game_finished.
    if (this.status === 'in_game' && this.matchId && !this.matchRecorded) {
      let done = false;
      try {
        done = this.game.outcome() !== null;
      } catch {
        done = false;
      }
      if (done) this.finishGame();
    }

    this.snapshotAcc += dtMs;
    const snapEvery = 1000 / SNAPSHOT_HZ;
    if (this.snapshotAcc >= snapEvery) {
      this.snapshotAcc %= snapEvery;
      this.sendSnapshots();
    }
    this.flushViews();

    this.idleCheckAcc += dtMs;
    if (this.idleCheckAcc >= 1000) {
      this.idleCheckAcc = 0;
      this.checkIdle(now);
      this.checkFeeds(now);
    }
  }

  /** pid -> since when its seat's client looks unable to receive (for checkFeeds). */
  private feedStuckSince = new Map<string, number>();

  /**
   * Watchdog (B1: a player who refreshed mid-vote stopped receiving anything while still shown as
   * connected). A seat marked connected whose client is still JOINING, or whose socket is not OPEN,
   * gets nothing: every send is queued or lost. After FEED_STUCK_MS we log it (with the state, to
   * find the root cause) and close that client so the browser reconnects instead of hanging.
   */
  private checkFeeds(now: number) {
    for (const s of this.seats.values()) {
      const c = s.client;
      const pid = s.member.pid;
      if (!s.member.connected || !c) {
        this.feedStuckSince.delete(pid);
        continue;
      }
      const ws = (c as unknown as { ref?: { readyState?: number } }).ref;
      const stuck = c.state === ClientState.JOINING || (ws?.readyState !== undefined && ws.readyState !== 1);
      if (!stuck) {
        this.feedStuckSince.delete(pid);
        continue;
      }
      const since = this.feedStuckSince.get(pid) ?? now;
      this.feedStuckSince.set(pid, since);
      if (now - since < FEED_STUCK_MS) continue;
      this.feedStuckSince.delete(pid);
      this.log.warn('connected seat cannot receive: closing it so the client reconnects', {
        lobbyId: this.lobbyId,
        pid,
        clientState: c.state,
        readyState: ws?.readyState ?? null,
        reconnectionPending: !!s.reconnection,
      });
      if (ws?.readyState !== undefined && ws.readyState >= 2) {
        // The socket is already closing/closed but we never got onLeave: show the truth (a fresh
        // ticket or token restores the seat as usual).
        s.member.connected = false;
        this.host.emit({ type: 'member_connection', pid, connected: false });
        this.lobbyDirty = true;
        this.gameDirty = true;
        this.afterHandler();
        continue;
      }
      try {
        c.leave(1001); // not "consented": the seat is kept and the client reconnects by token
      } catch {
        // already gone
      }
    }
  }

  private sendSnapshots() {
    for (const s of this.connectedSeats()) {
      try {
        this.sendTo(s, 'world:snapshot', this.world.snapshotFor(s.member.pid));
      } catch (e) {
        // One viewer's failure must never starve everyone after it in the loop.
        this.log.error('snapshotFor failed', { pid: s.member.pid, err: errMsg(e) });
      }
    }
  }

  /** End-of-tick fan-out of dirty per-client views. Nothing here is ever broadcast. */
  private flushViews() {
    if (this.lobbyDirty) {
      this.lobbyDirty = false;
      const summary = this.summary();
      this.services.directory.update(summary);
      const blockers = this.startBlockers();
      const labels = this.labels();
      const members = [...this.seats.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((s) => memberView(s.member, s.ready, labels.get(s.member.pid)));
      for (const s of this.connectedSeats()) {
        const view: LobbyRoomView = {
          lobby: summary,
          members,
          youPid: s.member.pid,
          canStart: s.member.role === 'storyteller' && blockers.length === 0,
          startBlockers: blockers,
        };
        this.sendTo(s, 'lobby:view', view);
      }
    }
    if (this.gameDirty || this.forceGameView.size) {
      const all = this.gameDirty;
      this.gameDirty = false;
      for (const s of this.connectedSeats()) {
        const pid = s.member.pid;
        if (!all && !this.forceGameView.has(pid)) continue;
        let view: ReturnType<GameModule['viewFor']>;
        try {
          view = this.game.viewFor(pid);
        } catch (e) {
          this.log.error('viewFor failed', { err: errMsg(e) });
          continue;
        }
        if (!view) continue;
        const json = JSON.stringify(view);
        if (!this.forceGameView.has(pid) && this.lastGameView.get(pid) === json) continue;
        this.lastGameView.set(pid, json);
        this.sendTo(s, 'game:view', view);
      }
      this.forceGameView.clear();
    }
  }

  private checkIdle(now: number) {
    if (this.disposing) return;
    if (this.connectedSeats().length > 0) {
      this.idleSince = null;
      return;
    }
    this.idleSince ??= now;
    // SR-2: an empty lobby that is not mid-game (never joined, or everyone left) frees its slot
    // after 2 minutes; a running game keeps its seats for the full idle timeout.
    const limitSec = this.status === 'in_game' ? this.services.config.lobbyIdleTimeoutSec : Math.min(EMPTY_LOBBY_TIMEOUT_SEC, this.services.config.lobbyIdleTimeoutSec);
    if (now - this.idleSince >= limitSec * 1000) {
      this.disposing = true;
      this.log.info('idle timeout: disposing lobby');
      void this.disconnect(CLOSE_CODES.lobbyClosed);
    }
  }

  // ------------------------------------------------------------------------------------
  // Helpers

  private sendTo<T extends S2CType>(seat: Seat, type: T, payload: S2CMessages[T]) {
    if (!seat.member.connected || !seat.client) return;
    try {
      seat.client.send(type, payload);
    } catch (e) {
      this.log.warn('send failed', { type, err: errMsg(e) });
    }
  }

  private sendError(seat: Seat, err: ServerErrorMsg) {
    if (this.errorLimiter.take(seat.member.pid)) this.sendTo(seat, 'error', err);
  }

  private labels(): Map<string, string> {
    return displayLabels([...this.seats.values()].map((s) => ({ pid: s.member.pid, displayName: s.member.displayName, joinedAt: s.joinedAt })));
  }

  private label(pid: string): string {
    return this.labels().get(pid) ?? this.seats.get(pid)?.member.displayName ?? '';
  }

  private storytellerSeat(): Seat | null {
    for (const s of this.seats.values()) if (s.member.role === 'storyteller') return s;
    return null;
  }

  private playerSeats(): Seat[] {
    return [...this.seats.values()].filter((s) => s.member.role === 'player');
  }

  private connectedSeats(): Seat[] {
    return [...this.seats.values()].filter((s) => s.member.connected && s.client);
  }

  private isBanned(accountId: string): boolean {
    const until = this.bans.get(accountId);
    if (until === undefined) return false;
    if (until > Date.now()) return true;
    this.bans.delete(accountId);
    return false;
  }

  private startBlockers(): string[] {
    const st = this.storytellerSeat();
    return startBlockers({
      waiting: this.status === 'waiting',
      maxPlayers: this.settings.maxPlayers,
      storyteller: st ? { connected: st.member.connected } : null,
      players: this.playerSeats().map((s) => ({ connected: s.member.connected, ready: s.ready })),
    });
  }

  private directoryPhase(): DirectoryPhase {
    if (this.status === 'waiting') return 'waiting';
    try {
      const p = this.game.directoryPhase();
      if (this.status === 'finished') return 'finished';
      return p === 'waiting' ? 'starting' : p;
    } catch {
      return this.status === 'finished' ? 'finished' : 'starting';
    }
  }

  summary(): LobbySummary {
    const st = this.storytellerSeat();
    const players = this.playerSeats().length;
    const host = [...this.seats.values()].find((s) => s.member.isHost);
    return {
      id: this.lobbyId,
      name: this.settings.name,
      description: this.settings.description,
      script: this.settings.script,
      maxPlayers: this.settings.maxPlayers,
      playerCount: players,
      storytellerName: st ? this.label(st.member.pid) : null,
      storytellerSeatOpen: !st,
      phase: this.directoryPhase(),
      joinable: this.status === 'waiting' && players < this.settings.maxPlayers,
      hostName: host ? this.label(host.member.pid) : this.creatorName,
      createdAt: this.createdAt,
      updatedAt: Date.now(),
    };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
