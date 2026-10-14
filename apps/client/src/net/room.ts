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
import { api } from './api';
import { createStore, Emitter } from './store';

// LEAD-OWNED. Wraps the Colyseus room for one lobby. Every S2C message is re-emitted on
// `events`; low-frequency views are also mirrored into stores for Preact.

export function wsEndpoint(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

const RECONNECT_KEY = (lobbyId: string) => `ct.reconnect.${lobbyId}`;

export class RoomConnection {
  readonly events = new Emitter<S2CMessages & { closed: { code: number } }>();
  readonly lobbyView = createStore<LobbyRoomView | null>(null);
  readonly gameView = createStore<PlayerGameView | StorytellerGameView | null>(null);
  readonly chat = createStore<ChatMessage[]>([]);
  readonly status = createStore<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  private room: Room | null = null;
  private client = new Client(wsEndpoint());
  private closedByUser = false;

  constructor(readonly lobbyId: string) {}

  /** Join (or restore) this lobby. intent 'storyteller' claims the open ST seat. */
  async connect(intent: 'player' | 'storyteller' = 'player'): Promise<void> {
    const token = sessionStorage.getItem(RECONNECT_KEY(this.lobbyId));
    if (token) {
      try {
        this.attach(await this.client.reconnect(token));
        return;
      } catch {
        sessionStorage.removeItem(RECONNECT_KEY(this.lobbyId));
      }
    }
    const t = await api.ticket(this.lobbyId, { intent });
    this.attach(await this.client.joinById(t.roomId, { ticket: t.ticket }));
  }

  private attach(room: Room) {
    this.room = room;
    this.status.set('open');
    sessionStorage.setItem(RECONNECT_KEY(this.lobbyId), room.reconnectionToken);
    const types: S2CType[] = [
      'lobby:view',
      'game:view',
      'world:snapshot',
      'world:teleport',
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
        if (type === 'lobby:view') this.lobbyView.set(payload);
        else if (type === 'game:view') this.gameView.set(payload);
        else if (type === 'chat:message') this.chat.set((c) => [...c.slice(-199), payload]);
        this.events.emit(type, payload);
      });
    }
    room.onLeave((code) => {
      this.room = null;
      if (this.closedByUser || code === 4001 || code === 4002 || code === 4003 || code === 4004) {
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
    } catch {
      if (attempt >= 10) {
        this.status.set('closed');
        this.events.emit('closed', { code: 1006 });
        return;
      }
      setTimeout(() => void this.retry(attempt + 1), Math.min(8000, 500 * 2 ** attempt));
    }
  }

  send<T extends C2SType>(type: T, payload: C2SPayload<T>): void {
    this.room?.send(type, payload);
  }

  async leave(): Promise<void> {
    this.closedByUser = true;
    sessionStorage.removeItem(RECONNECT_KEY(this.lobbyId));
    this.room?.send('lobby:leave', {});
    await this.room?.leave(true).catch(() => undefined);
    this.status.set('closed');
  }
}
