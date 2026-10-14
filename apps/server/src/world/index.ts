// OWNED BY world-art (no-op stub from lead). Authoritative positions, collision, doors,
// visibility filtering, bedtime/night relocation.
import type { RoomHost, WorldModule } from '../rooms/modules.js';

export function createWorldModule(_host: RoomHost): WorldModule {
  return {
    onEvent: () => undefined,
    handleMove: () => undefined,
    handleUseDoor: () => undefined,
    locationOf: () => null,
    positionOf: () => null,
    snapshotFor: () => ({ t: Date.now(), ackSeq: 0, entities: [] }),
    sendHome: () => undefined,
    teleportToBuilding: () => undefined,
    tick: () => undefined,
  };
}
