// v3 WP7 (v3-qa). A server-less RoomConnection for the mock-world harness (modelled on game/dev/sandbox.tsx): the same
// stores and event emitter the real connection exposes, a recorder for every C2S send, and a tiny "server echo" so the
// own avatar behaves: accepted moves come back as the viewer's snapshot entity (ackSeq = last move seq), and
// 'world:useDoor' answers with a 'door' teleport into the room (interiorDoor) or back out (door tile).
import { tileCenterPx, type EntityState, type LobbyRoomView, type LocationId, type PlayerGameView, type StorytellerGameView, type TownLayout, type WorldTeleport } from '@ct/protocol';
import { createStore, Emitter } from '../../net/store';
import type { RoomConnection } from '../../net/room';

export interface FakeConn {
  conn: RoomConnection;
  /** Every C2S message the town sent (type + payload), in order. */
  sent: { type: string; payload: unknown; at: number }[];
  /** The viewer's entity as the fake server sees it (null before the first placement). */
  self(): EntityState | null;
  ackSeq(): number;
  /** Place the viewer (and emit the teleport). */
  teleport(x: number, y: number, location?: LocationId, reason?: WorldTeleport['reason']): void;
  /** Make the next `send` throw (crash-rule check). */
  failSends(on: boolean): void;
}

export function createFakeConn(opts: { lobbyView: LobbyRoomView; gameView?: PlayerGameView | StorytellerGameView | null; layout: () => TownLayout }): FakeConn {
  const events = new Emitter<Record<string, unknown>>();
  const lobbyView = createStore<LobbyRoomView | null>(opts.lobbyView);
  const gameView = createStore<PlayerGameView | StorytellerGameView | null>(opts.gameView ?? null);
  const sent: FakeConn['sent'] = [];
  let me: EntityState | null = null;
  let ack = 0;
  let fail = false;

  const teleport: FakeConn['teleport'] = (x, y, location = 'outdoors', reason = 'spawn') => {
    me = { id: opts.lobbyView.youPid, x, y, location, facing: me?.facing ?? 'down', moving: false };
    // async like a socket frame
    setTimeout(() => events.emit('world:teleport', { seq: ack, x, y, location, reason } satisfies WorldTeleport), 0);
  };

  const conn = {
    lobbyId: opts.lobbyView.lobby.id,
    events,
    lobbyView,
    gameView,
    chat: createStore([]),
    status: createStore('open'),
    send(type: string, payload: unknown) {
      if (fail) throw new Error('injected frame-loop throw');
      sent.push({ type, payload, at: performance.now() });
      if (sent.length > 5000) sent.splice(0, 1000);
      if (type === 'move') {
        const m = payload as { seq: number; x: number; y: number; facing: EntityState['facing']; moving: boolean };
        ack = Math.max(ack, m.seq);
        if (me) me = { ...me, x: m.x, y: m.y, facing: m.facing, moving: m.moving };
      } else if (type === 'world:useDoor') {
        const id = (payload as { buildingId?: string }).buildingId;
        const L = opts.layout();
        const b = L.buildings.find((x) => x.id === id);
        if (!b || !me) return;
        if (me.location === 'outdoors') {
          const p = tileCenterPx(L, b.interiorDoor);
          teleport(p.x, p.y, `bld:${b.id}`, 'door');
        } else {
          const p = tileCenterPx(L, b.door);
          teleport(p.x, p.y, 'outdoors', 'door');
        }
      }
    },
    leave: async () => undefined,
    connect: async () => undefined,
  } as unknown as RoomConnection;

  return {
    conn,
    sent,
    self: () => (me ? { ...me } : null),
    ackSeq: () => ack,
    teleport,
    failSends(on) {
      fail = on;
    },
  };
}
