// OWNED BY voice (no-op stub from lead). Server-derived acoustic membership, LiveKit grants and
// revocation, quota accounting. Reads LiveKit config via getServices().config.livekit.
import type { RoomHost, VoiceModule } from '../rooms/modules.js';

export function createVoiceModule(_host: RoomHost): VoiceModule {
  return {
    onEvent: () => undefined,
    handleStatus: () => undefined,
    handleAnnounce: () => undefined,
    audienceOf: () => [],
    tick: () => undefined,
    dispose: async () => undefined,
  };
}
