// OWNED BY rules-storyteller (no-op stub from lead). Wraps @ct/rules for one lobby.
import type { GameModule, RoomHost } from '../rooms/modules.js';

export function createGameModule(_host: RoomHost): GameModule {
  return {
    onEvent: () => undefined,
    start: () => undefined,
    handlePlayer: () => undefined,
    handleStoryteller: () => undefined,
    viewFor: () => null,
    phase: () => null,
    directoryPhase: () => 'waiting',
    isAlive: () => true,
    seatOf: () => null,
    tick: () => undefined,
    outcome: () => null,
  };
}
