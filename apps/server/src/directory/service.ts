import type { CreateLobbyRequest, DirectoryEvent, JoinTicketResponse, LobbySummary } from '@ct/protocol';
import type { AccountRecord } from '@ct/db';
import { randomId } from '../auth/crypto.js';
import type { Logger } from '../rooms/modules.js';
import type { JoinIntent, TicketService } from './tickets.js';

/** Per-account cap on simultaneously existing lobbies that the account created. */
/** Active lobbies one account may have created (SR-2: a few free accounts must not fill every slot). */
export const PER_ACCOUNT_LOBBY_LIMIT = 1;
/** Active lobbies created from one client IP (IPv6: per /64). Loopback (local dev/tests) is exempt. */
export const PER_IP_LOBBY_LIMIT = 2;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export const LOBBY_ID_LENGTH = 10;

export class DirectoryError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'not_found' | 'forbidden' | 'conflict' | 'lobby_full' | 'lobby_started' | 'lobby_limit' | 'internal',
    message: string,
  ) {
    super(message);
  }
}

/** What the GameRoom needs at onCreate (taken exactly once). */
export interface LobbyInit {
  lobbyId: string;
  name: string;
  description: string;
  script: CreateLobbyRequest['script'];
  maxPlayers: number;
  creatorAccountId: string;
  creatorName: string;
  creatorTakesStoryteller: boolean;
  createdAt: number;
}

/** Live view of a GameRoom used by the directory (same process; never serialised). */
export interface LobbyRoomHandle {
  roomId: string;
  isMember(accountId: string): boolean;
  isBanned(accountId: string): boolean;
  connectedCount(): number;
  summary(): LobbySummary;
  /** Admin action: disconnect everyone and dispose the room (the room then calls remove()). */
  close?(): void;
}

interface Entry {
  id: string;
  creatorAccountId: string;
  /** Rate-limit key of the creating client (null = loopback / unknown). */
  creatorIp: string | null;
  init: LobbyInit | null;
  roomId: string | null;
  handle: LobbyRoomHandle | null;
  summary: LobbySummary;
}

/** Tiny async mutex: serialises create() so count/limit checks + room creation are atomic. */
class Mutex {
  private tail: Promise<void> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export interface DirectoryDeps {
  log: Logger;
  tickets: TicketService;
  lobbyMaxCount: number;
  playerMaxPerLobby: number;
  /** matchMaker.createRoom('game', { lobbyId }) in production; injectable for tests. */
  createRoom: (lobbyId: string) => Promise<{ roomId: string }>;
  perAccountLimit?: number;
  perIpLimit?: number;
  now?: () => number;
}

/**
 * LobbyDirectoryService: authoritative in-memory index of the lobbies hosted by this process.
 * Each entry is backed by exactly one Colyseus GameRoom which pushes its public summary here;
 * the directory fans changes out to SSE subscribers as `upsert` / `remove` events.
 */
export class LobbyDirectory {
  private entries = new Map<string, Entry>();
  private subscribers = new Set<(e: DirectoryEvent) => void>();
  private mutex = new Mutex();
  private now: () => number;

  constructor(private deps: DirectoryDeps) {
    this.now = deps.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  async create(account: AccountRecord, req: CreateLobbyRequest, clientIp?: string): Promise<LobbySummary> {
    const ip = clientIp && !LOOPBACK.has(clientIp) ? clientIp : null;
    return this.mutex.run(async () => {
      if (this.entries.size >= this.deps.lobbyMaxCount) {
        throw new DirectoryError(409, 'lobby_limit', `This server already hosts the maximum of ${this.deps.lobbyMaxCount} lobbies`);
      }
      const limit = this.deps.perAccountLimit ?? PER_ACCOUNT_LOBBY_LIMIT;
      const mine = [...this.entries.values()].filter((e) => e.creatorAccountId === account.id).length;
      if (mine >= limit) {
        throw new DirectoryError(409, 'lobby_limit', `You can have at most ${limit} open ${limit === 1 ? 'lobby' : 'lobbies'} at a time`);
      }
      const ipLimit = this.deps.perIpLimit ?? PER_IP_LOBBY_LIMIT;
      if (ip && [...this.entries.values()].filter((e) => e.creatorIp === ip).length >= ipLimit) {
        throw new DirectoryError(409, 'lobby_limit', `At most ${ipLimit} open lobbies can be created from one network`);
      }
      let id = randomId(LOBBY_ID_LENGTH);
      while (this.entries.has(id)) id = randomId(LOBBY_ID_LENGTH);
      const t = this.now();
      const init: LobbyInit = {
        lobbyId: id,
        name: req.name,
        description: req.description,
        script: req.script,
        maxPlayers: Math.min(req.maxPlayers, this.deps.playerMaxPerLobby),
        creatorAccountId: account.id,
        creatorName: account.displayName,
        creatorTakesStoryteller: req.takeStoryteller,
        createdAt: t,
      };
      const entry: Entry = {
        id,
        creatorAccountId: account.id,
        creatorIp: ip,
        init,
        roomId: null,
        handle: null,
        summary: {
          id,
          name: init.name,
          description: init.description,
          script: init.script,
          maxPlayers: init.maxPlayers,
          playerCount: 0,
          storytellerName: null,
          storytellerSeatOpen: true,
          phase: 'waiting',
          joinable: true,
          hostName: account.displayName,
          createdAt: t,
          updatedAt: t,
        },
      };
      this.entries.set(id, entry);
      try {
        const room = await this.deps.createRoom(id);
        entry.roomId = room.roomId;
        entry.init = null;
      } catch (e) {
        this.entries.delete(id);
        this.deps.log.error('lobby room creation failed', { lobbyId: id, err: e instanceof Error ? e.message : String(e) });
        throw new DirectoryError(500, 'internal', 'Could not create the lobby');
      }
      if (entry.handle) entry.summary = entry.handle.summary();
      this.deps.log.info('lobby created', { lobbyId: id, accountId: account.id });
      this.publish({ type: 'upsert', lobby: entry.summary });
      return entry.summary;
    });
  }

  /** Called by GameRoom.onCreate. Returns the creation parameters once. */
  takeInit(lobbyId: string): LobbyInit | null {
    const e = this.entries.get(lobbyId);
    if (!e?.init) return null;
    const init = e.init;
    e.init = null;
    return init;
  }

  attachRoom(lobbyId: string, handle: LobbyRoomHandle): void {
    const e = this.entries.get(lobbyId);
    if (!e) return;
    e.handle = handle;
    e.roomId = handle.roomId;
  }

  /** GameRoom pushes its public summary; only real changes are published. */
  update(summary: LobbySummary): void {
    const e = this.entries.get(summary.id);
    if (!e) return;
    const { updatedAt: _a, ...prev } = e.summary;
    const { updatedAt: _b, ...next } = summary;
    if (JSON.stringify(prev) === JSON.stringify(next)) return;
    e.summary = summary;
    if (e.roomId) this.publish({ type: 'upsert', lobby: summary });
  }

  remove(lobbyId: string): void {
    if (!this.entries.delete(lobbyId)) return;
    this.deps.log.info('lobby removed', { lobbyId });
    this.publish({ type: 'remove', id: lobbyId });
  }

  /** All public lobbies (fully created ones), oldest first. Sorting/filtering is client-side. */
  list(): LobbySummary[] {
    return [...this.entries.values()].filter((e) => e.roomId).map((e) => e.summary).sort((a, b) => a.createdAt - b.createdAt);
  }

  get(lobbyId: string): LobbySummary | null {
    const e = this.entries.get(lobbyId);
    return e?.roomId ? e.summary : null;
  }

  subscribe(fn: (e: DirectoryEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Issues a join ticket after advisory checks (the room re-checks everything atomically in
   * onJoin). Existing members may always obtain a ticket — that is how a seat is restored.
   */
  issueTicket(account: AccountRecord, lobbyId: string, intent: JoinIntent): JoinTicketResponse {
    const e = this.entries.get(lobbyId);
    if (!e || !e.roomId) throw new DirectoryError(404, 'not_found', 'Lobby not found');
    const h = e.handle;
    if (h?.isBanned(account.id)) throw new DirectoryError(403, 'forbidden', 'You were removed from this lobby');
    const member = h?.isMember(account.id) ?? false;
    if (!member) {
      const s = e.summary;
      if (intent === 'reconnect') throw new DirectoryError(409, 'conflict', 'You have no seat to restore in this lobby');
      if (s.phase !== 'waiting') throw new DirectoryError(409, 'lobby_started', 'This game has already started');
      if (intent === 'storyteller' && !s.storytellerSeatOpen) throw new DirectoryError(409, 'conflict', 'The Storyteller seat is taken');
      if (intent === 'player' && s.playerCount >= s.maxPlayers) throw new DirectoryError(409, 'lobby_full', 'This lobby is full');
    }
    const t = this.deps.tickets.issue({ accountId: account.id, lobbyId, intent });
    return { lobbyId, roomId: e.roomId, ticket: t.ticket, expiresAt: t.expiresAt };
  }

  /** Admin: close a lobby (everyone is disconnected; the room disposes and removes itself). */
  close(lobbyId: string): boolean {
    const e = this.entries.get(lobbyId);
    if (!e) return false;
    this.deps.log.info('lobby closed by admin', { lobbyId });
    if (e.handle?.close) e.handle.close();
    else this.remove(lobbyId);
    return true;
  }

  /** For /api/admin/status. */
  adminView(): { id: string; name: string; phase: LobbySummary['phase']; players: number; connected: number }[] {
    return [...this.entries.values()].map((e) => ({
      id: e.id,
      name: e.summary.name,
      phase: e.summary.phase,
      players: e.summary.playerCount,
      connected: e.handle?.connectedCount() ?? 0,
    }));
  }

  private publish(ev: DirectoryEvent): void {
    for (const s of this.subscribers) {
      try {
        s(ev);
      } catch (err) {
        this.deps.log.warn('directory subscriber failed', { err: err instanceof Error ? err.message : String(err) });
      }
    }
  }
}
