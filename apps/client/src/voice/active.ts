// (v2.3 settings) The voice client of the lobby on screen, so the ⚙ Settings panel can show and change
// the same live voice preferences as the voice panel (talk mode, push-to-talk binding, busy-room
// mute, microphone / speaker) — one source of truth: the VoiceClient and its 'ct.voice.prefs'.
// Set by VoicePanel (ui/voice/index.tsx) while it is mounted. Type-only import: no LiveKit here.
import { createStore } from '../net/store';
import type { VoiceClient } from './VoiceClient';

export const activeVoiceClient = createStore<VoiceClient | null>(null);

/** Register `client` as the active one; returns the matching cleanup (only clears if still current). */
export function registerVoiceClient(client: VoiceClient): () => void {
  activeVoiceClient.set(client);
  return () => activeVoiceClient.set((c) => (c === client ? null : c));
}
