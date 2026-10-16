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
import { SNAP_CAPABILITY, SNAPSHOT_HZ, SnapshotDecoder, TERMINAL_CLOSE_CODES, type Snap2Frame, type WorldSnapshot } from '@ct/protocol';
import { api, ApiFailure } from './api';
import { createStore, Emitter } from './store';

// LEAD-OWNED. Wraps the Colyseus room for one lobby. Every S2C message is re-emitted on
// `events`; low-frequency views are also mirrored into stores for Preact.

export function wsEndpoint(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

const RECONNECT_KEY = (lobbyId: string) => `ct.reconnect.${lobbyId}`;

/** (v2.2, WP4) Server snapshot interval. */
const SNAP_PERIOD_MS = 1000 / SNAPSHOT_HZ;
/** Stop repeating the last world state if no frame at all arrived for this long (server keepalive: 2 Hz). */
const SNAP_HOLD_MAX_MS = 800;

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
  /** (v2.2, WP4) 'world:snap2' state of the current connection (null until the first frame). */
  private snapDecoder: SnapshotDecoder | null = null;
  private snapHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSnapFrameAt = 0;
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
    // (v2.2, WP4) `snap` = we decode compact 'world:snap2' frames (old servers ignore it).
    this.adopt(await this.client.joinById(t.roomId, { ticket: t.ticket, snap: SNAP_CAPABILITY }));
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
    // A new connection starts a new delta stream (the server's encoder is per connection too).
    this.snapDecoder = new SnapshotDecoder();
    this.stopSnapHold();
    this.status.set('open');
    this.lastFeedAt = Date.now();
    // Dead feed: the server streams world:snapshot at 12 Hz (world:snap2: changes at 12 Hz, else a
    // 2 Hz keepalive) to every connected seat in every phase.
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
      'report:ack', // (v2.3 OPS-6)
      'pong',
    ];
    room.onMessage('world:snap2', (frame: Snap2Frame) => {
      if (this.room !== room || !this.snapDecoder) return;
      this.lastFeedAt = Date.now();
      this.lastSnapFrameAt = performance.now();
      const snap = this.snapDecoder.decode(frame);
      if (snap) this.emitSnapshot(snap, SNAP_PERIOD_MS * 1.5);
    });
    for (const type of types) {
      room.onMessage(type, (payload: never) => {
        if (type === 'world:snapshot') this.lastFeedAt = Date.now();
        if (type === 'lobby:view') {
          const before = this.lobbyView.get()?.lobby.phase;
          this.lobbyView.set(payload);
          // Rematch / host abort (v2.1): the lobby returned to waiting, so drop the old game's view.
          const now = (payload as LobbyRoomView).lobby.phase;
          if (now === 'waiting' && (this.gameView.get()?.phase === 'finished' || (before !== undefined && before !== 'waiting'))) this.gameView.set(null);
        }
        else if (type === 'game:view') this.gameView.set(payload);
        else if (type === 'chat:message') this.chat.set((c) => [...c.slice(-199), payload]);
        this.events.emit(type, payload);
      });
    }
    room.onLeave((code) => {
      this.room = null;
      this.stopSnapHold();
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

  /**
   * (v2.2, WP4) Emit a decoded snapshot exactly like a 'world:snapshot'. The server skips frames
   * while nothing visible changes (2 Hz keepalive), but the town interpolates from per-arrival
   * samples: so while every visible entity stands still the last state is repeated locally at the
   * snapshot rate (offset half a period from the server's beat), and the first step of someone who
   * starts walking interpolates over ~one interval exactly as before, instead of over the idle gap.
   * Never while anyone moves (a late frame must not be preceded by a stale copy).
   */
  private emitSnapshot(snap: WorldSnapshot, holdInMs: number) {
    this.stopSnapHold();
    this.events.emit('world:snapshot', snap);
    if (snap.entities.some((e) => e.moving)) return;
    this.snapHoldTimer = setTimeout(() => {
      this.snapHoldTimer = null;
      const since = performance.now() - this.lastSnapFrameAt;
      if (!this.room || !this.snapDecoder || since > SNAP_HOLD_MAX_MS) return;
      const again = this.snapDecoder.current(this.snapDecoder.serverT + Math.round(since));
      if (again) this.emitSnapshot(again, SNAP_PERIOD_MS);
    }, holdInMs);
  }

  private stopSnapHold() {
    if (this.snapHoldTimer) clearTimeout(this.snapHoldTimer);
    this.snapHoldTimer = null;
  }

  private async retry(attempt: number): Promise<void> {
    if (this.closedByUser) return;
    this.retryTimer = null;
    this.retryAttempt = attempt;
    if (!this.wakeListening) {
      // Network back / tab back in front (phone woke up): retry now instead of after the backoff.
      this.wakeListening = true;
      window.addEventListener('online', this.retryNow);
      document.addEventListener('visibilitychange', this.retryNow);
    }
    try {
      await this.connect();
      this.stopWakeListening();
    } catch (e) {
      if (this.closedByUser) return;
      // 404 = the lobby is gone; 403/409 = we no longer hold a seat (lobby started without us,
      // kicked, …). Retrying cannot help, so stop and say so instead of spinning for a minute.
      const gone = e instanceof ApiFailure && [403, 404, 409].includes(e.status);
      // Offline (airplane mode, subway, network switch): failures don't count towards giving up;
      // the 'online' event retries at once.
      const offline = !gone && navigator.onLine === false;
      if (gone || (!offline && attempt >= 10)) {
        this.stopWakeListening();
        sessionStorage.removeItem(RECONNECT_KEY(this.lobbyId));
        this.status.set('closed');
        this.events.emit('closed', { code: gone ? CLIENT_CLOSE.lobbyGone : CLIENT_CLOSE.gaveUp });
        return;
      }
      const next = offline ? attempt : attempt + 1;
      this.retryTimer = setTimeout(() => void this.retry(next), offline ? 5000 : Math.min(8000, 500 * 2 ** attempt));
    }
  }

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 1;
  private wakeListening = false;
  /** Skip the backoff wait (only while one is pending: never starts a second retry chain). */
  private retryNow = () => {
    if (!this.retryTimer || this.closedByUser || document.visibilityState !== 'visible' || navigator.onLine === false) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void this.retry(this.retryAttempt);
  };
  private stopWakeListening() {
    if (!this.wakeListening) return;
    this.wakeListening = false;
    window.removeEventListener('online', this.retryNow);
    document.removeEventListener('visibilitychange', this.retryNow);
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
    this.stopSnapHold();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopWakeListening();
    if (this.feedTimer) clearInterval(this.feedTimer);
    this.feedTimer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
    sessionStorage.removeItem(RECONNECT_KEY(this.lobbyId));
    this.room?.send('lobby:leave', {});
    await this.room?.leave(true).catch(() => undefined);
    this.status.set('closed');
  }
}
