import { Client, type Room } from 'colyseus.js';
import type {
  C2SPayload,
  C2SType,
  ChatMessage,
  LobbyRoomView,
  PlayerGameView,
  S2CMessages,
  S2CType,
  StorytellerGameView,
} from '@ct/protocol';
import { TERMINAL_CLOSE_CODES } from '@ct/protocol';
import { api, ApiFailure } from './api';
import { createStore, Emitter } from './store';

// LEAD-OWNED. Wraps the Colyseus room for one lobby. Every S2C message is re-emitted on
// `events`; low-frequency views are also mirrored into stores for Preact.

export function wsEndpoint(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

const RECONNECT_KEY = (lobbyId: string) => `ct.reconnect.${lobbyId}`;

/** Client-side close reasons (never sent by the server). */
export const CLIENT_CLOSE = {
  /** The lobby no longer exists (e.g. the server restarted and in-memory games were lost). */
  lobbyGone: 4190,
  /** Gave up reconnecting after repeated failures. */
  gaveUp: 4191,
} as const;

export class RoomConnection {
  readonly events = new Emitter<S2CMessages & { closed: { code: number } }>();
  readonly lobbyView = createStore<LobbyRoomView | null>(null);
  readonly gameView = createStore<PlayerGameView | StorytellerGameView | null>(null);
  readonly chat = createStore<ChatMessage[]>([]);
  readonly status = createStore<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  private room: Room | null = null;
  private client = new Client(wsEndpoint());
  private closedByUser = false;
  /** Last time anything from the world feed arrived (dead-feed watchdog). */
  private lastFeedAt = 0;
  private feedTimer: ReturnType<typeof setInterval> | null = null;
  /** Dead-feed threshold; backs off when the watchdog had to reconnect recently (no reconnect storms). */
  private feedLimitMs = 5000;
  private lastWatchdogAt = 0;
  private onVisible = () => {
    // A backgrounded tab (esp. iOS Safari) may be suspended; don't mistake that for a dead feed.
    if (document.visibilityState === 'visible') this.lastFeedAt = Date.now();
  };

  constructor(readonly lobbyId: string) {}

  /** In-flight join: connect() is single-flight (a retry or a re-mount never opens a second socket). */
  private connecting: Promise<void> | null = null;

  /** Join (or restore) this lobby. intent 'storyteller' claims the open ST seat. */
  connect(intent: 'player' | 'storyteller' = 'player'): Promise<void> {
    this.connecting ??= this.doConnect(intent).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async doConnect(intent: 'player' | 'storyteller'): Promise<void> {
    if (this.room) return; // already connected
    const token = sessionStorage.getItem(RECONNECT_KEY(this.lobbyId));
    if (token) {
      try {
        this.adopt(await this.client.reconnect(token));
        return;
      } catch {
        sessionStorage.removeItem(RECONNECT_KEY(this.lobbyId));
      }
    }
    if (this.closedByUser) return;
    const t = await api.ticket(this.lobbyId, { intent });
    if (this.closedByUser) return; // the user left while we were fetching the ticket: don't join at all
    this.adopt(await this.client.joinById(t.roomId, { ticket: t.ticket }));
  }

  /** Attach a freshly joined room, unless the user already left meanwhile (then leave it at once). */
  private adopt(room: Room): void {
    if (this.closedByUser) {
      try {
        room.send('lobby:leave', {});
      } catch {
        /* closing */
      }
      void room.leave(true).catch(() => undefined);
      return;
    }
    this.attach(room);
  }

  private attach(room: Room) {
    this.room = room;
    this.status.set('open');
    this.lastFeedAt = Date.now();
    // Dead feed: the server streams world:snapshot at 12 Hz to every connected seat in every phase.
    // Nothing for 5 s while "open" means this socket is silently dead: drop it and reconnect.
    if (!this.feedTimer) document.addEventListener('visibilitychange', this.onVisible);
    this.feedTimer ??= setInterval(() => {
      if (this.closedByUser) {
        clearInterval(this.feedTimer!);
        this.feedTimer = null;
        document.removeEventListener('visibilitychange', this.onVisible);
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if (this.status.get() !== 'open' || !this.room || Date.now() - this.lastFeedAt < this.feedLimitMs) return;
      const now = Date.now();
      this.feedLimitMs = now - this.lastWatchdogAt < 60_000 ? Math.min(this.feedLimitMs * 2, 40_000) : 5000;
      this.lastWatchdogAt = now;
      this.lastFeedAt = now;
      this.status.set('reconnecting');
      try {
        (this.room.connection as unknown as { close(): void }).close(); // -> onLeave (non-terminal) -> retry()
      } catch {
        /* already closing */
      }
    }, 1000);
    const queued = this.pending;
    this.pending = [];
    // Flush after the listeners below are registered (next tick) so replies aren't missed.
    if (queued.length) setTimeout(() => queued.forEach((m) => room.send(m.type, m.payload)), 0);
    sessionStorage.setItem(RECONNECT_KEY(this.lobbyId), room.reconnectionToken);
    const types: S2CType[] = [
      'lobby:view',
      'game:view',
      'world:snapshot',
      'world:teleport',
      'social:emote',
      'story:st',
      'story:pamphlet',
      'story:pamphlets',
      'notebook:data',
      'notebook:unavailable',
      'chat:message',
      'announcement',
      'sound',
      'voice:grant',
      'voice:revoke',
      'voice:unavailable',
      'error',
      'kicked',
      'pong',
    ];
    for (const type of types) {
      room.onMessage(type, (payload: never) => {
        if (type === 'world:snapshot') this.lastFeedAt = Date.now();
        if (type === 'lobby:view') {
          this.lobbyView.set(payload);
          // Rematch: the lobby returned to waiting, so drop the finished game's view.
          if ((payload as LobbyRoomView).lobby.phase === 'waiting' && this.gameView.get()?.phase === 'finished') this.gameView.set(null);
        }
        else if (type === 'game:view') this.gameView.set(payload);
        else if (type === 'chat:message') this.chat.set((c) => [...c.slice(-199), payload]);
        this.events.emit(type, payload);
      });
    }
    room.onLeave((code) => {
      this.room = null;
      if (this.closedByUser || TERMINAL_CLOSE_CODES.includes(code)) {
        sessionStorage.removeItem(RECONNECT_KEY(this.lobbyId));
        this.status.set('closed');
        this.events.emit('closed', { code });
        return;
      }
      // Unexpected drop: try to restore the same seat.
      this.status.set('reconnecting');
      void this.retry(1);
    });
  }

  private async retry(attempt: number): Promise<void> {
    if (this.closedByUser) return;
    try {
      await this.connect();
    } catch (e) {
      // 404 = the lobby is gone; 403/409 = we no longer hold a seat (lobby started without us,
      // kicked, …). Retrying cannot help, so stop and say so instead of spinning for a minute.
      const gone = e instanceof ApiFailure && [403, 404, 409].includes(e.status);
      if (gone || attempt >= 10) {
        sessionStorage.removeItem(RECONNECT_KEY(this.lobbyId));
        this.status.set('closed');
        this.events.emit('closed', { code: gone ? CLIENT_CLOSE.lobbyGone : CLIENT_CLOSE.gaveUp });
        return;
      }
      setTimeout(() => void this.retry(attempt + 1), Math.min(8000, 500 * 2 ** attempt));
    }
  }

  /** Messages sent while (re)connecting; flushed on attach. Movement is dropped (stale by then). */
  private pending: { type: C2SType; payload: unknown }[] = [];

  send<T extends C2SType>(type: T, payload: C2SPayload<T>): void {
    if (this.room) {
      this.room.send(type, payload);
      return;
    }
    if (type === 'move' || this.closedByUser) return;
    // Never silently lose a click (Ready, vote, nominate, ST command) during a brief reconnect.
    this.pending = [...this.pending.filter((m) => !(m.type === type && type === 'lobby:ready')), { type, payload }].slice(-20);
  }

  async leave(): Promise<void> {
    this.closedByUser = true;
    if (this.feedTimer) clearInterval(this.feedTimer);
    this.feedTimer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
    sessionStorage.removeItem(RECONNECT_KEY(this.lobbyId));
    this.room?.send('lobby:leave', {});
    await this.room?.leave(true).catch(() => undefined);
    this.status.set('closed');
  }
}
