// LEAD-OWNED test helper: an in-memory RoomHost for unit-testing one module (or several wired
// together) without Colyseus. Captures every message sent per pid for secrecy assertions.
import type { S2CMessages, S2CType, ScriptId } from '@ct/protocol';
import { DEFAULT_COSMETICS } from '@ct/protocol';
import type { GameModule, Logger, RoomEvent, RoomHost, RoomMember, VoiceModule, WorldModule } from '../../src/rooms/modules.js';

export interface FakeHost extends RoomHost {
  sent: Map<string, { type: S2CType; payload: unknown }[]>;
  events: RoomEvent[];
  addMember(m: Partial<RoomMember> & { pid: string }): RoomMember;
  setModules(m: { game?: GameModule; world?: WorldModule; voice?: VoiceModule }): void;
  clock: { now: number };
  /** Mutable script holder: set `scriptRef.id` before starting a game to test another script. */
  scriptRef: { id: ScriptId };
  flush(): void;
}

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };

export function createFakeHost(lobbyId = 'lobbyA'): FakeHost {
  const members = new Map<string, RoomMember>();
  const sent = new Map<string, { type: S2CType; payload: unknown }[]>();
  const queue: RoomEvent[] = [];
  const events: RoomEvent[] = [];
  const clock = { now: 1_000_000 };
  // Tests may switch the script before starting a game: `host.script.id = 'bad-moon-rising'`.
  const script: { id: ScriptId } = { id: 'trouble-brewing' };
  let mods: { game?: GameModule; world?: WorldModule; voice?: VoiceModule } = {};
  let flushing = false;
  const host: FakeHost = {
    lobbyId,
    env: 'test',
    log: quiet,
    now: () => clock.now,
    script: () => script.id,
    clock,
    sent,
    events,
    scriptRef: script,
    members: () => [...members.values()],
    member: (pid) => members.get(pid),
    storytellerPid: () => [...members.values()].find((m) => m.role === 'storyteller')?.pid ?? null,
    send<T extends S2CType>(pid: string, type: T, payload: S2CMessages[T]) {
      if (!members.get(pid)?.connected) return;
      const list = sent.get(pid) ?? [];
      list.push({ type, payload: JSON.parse(JSON.stringify(payload)) });
      sent.set(pid, list);
    },
    emit(e) {
      queue.push(e);
      host.flush();
    },
    flush() {
      if (flushing) return;
      flushing = true;
      try {
        while (queue.length) {
          const e = queue.shift()!;
          events.push(e);
          mods.game?.onEvent(e);
          mods.world?.onEvent(e);
          mods.voice?.onEvent(e);
        }
      } finally {
        flushing = false;
      }
    },
    markGameDirty() {},
    markLobbyDirty() {},
    get game() {
      if (!mods.game) throw new Error('no game module');
      return mods.game;
    },
    get world() {
      if (!mods.world) throw new Error('no world module');
      return mods.world;
    },
    get voice() {
      if (!mods.voice) throw new Error('no voice module');
      return mods.voice;
    },
    addMember(m) {
      const full: RoomMember = {
        accountId: `acct-${m.pid}`,
        displayName: m.pid,
        role: 'player',
        seat: null,
        connected: true,
        cosmetics: DEFAULT_COSMETICS,
        isHost: false,
        ...m,
      };
      members.set(full.pid, full);
      return full;
    },
    setModules(m) {
      mods = { ...mods, ...m };
    },
  };
  return host;
}
