// Public, stable audio API for the rest of the client (owned by the audio teammate).
// Implementation lives in ./sound/** — see docs/audio.md.
//
//   unlockAudio()              call from any user gesture (GameScreen already does)
//   playCue(cue)               server `sound` cues + 'door' (TownScene already does)
//   setAmbientVolume(v)        0..1, persisted in localStorage 'ct.ambientVolume' (default 0.25)
//   setSfxVolume(v)            0..1, persisted in localStorage 'ct.sfxVolume'     (default 0.7)
//   getAmbientVolume() / getSfxVolume()
//   attachSound(conn)          once per game screen: ambience, footsteps, cues, ducking, UI clicks
//   installUiSounds()          lobby/home screens: unlock on first gesture + primary-button clicks
//   setVoiceActivitySource(s)  voice client hands over { anyoneSpeaking, level } for ducking

import { attachSound, installUiSounds, playCue as playCueImpl, setVoiceActivitySource, soundEngine, type Cue } from './sound';

export type { Cue };
export type { AttachOptions, SoundConn, VoiceActivity, VoiceActivityStore } from './sound';
export { attachSound, installUiSounds, setVoiceActivitySource };

/** Create/resume the AudioContext. Must run inside a user gesture; safe to call repeatedly. */
export function unlockAudio(): void {
  soundEngine().unlock();
}

/** Play a world cue: 'bell' | 'dawn' | 'toll' | 'door' | 'visit'. Duplicates within 300 ms are dropped. */
export function playCue(cue: Cue): void {
  playCueImpl(cue);
}

/** Ambience volume 0..1 (its own slider; defaults low so it sits under voice). Persisted. */
export function setAmbientVolume(v: number): void {
  soundEngine().setAmbientVolume(v);
}
export function getAmbientVolume(): number {
  return soundEngine().getAmbientVolume();
}

/** Sound-effects volume 0..1 (footsteps, doors, bells, votes; UI clicks follow at 60%). Persisted. */
export function setSfxVolume(v: number): void {
  soundEngine().setSfxVolume(v);
}
export function getSfxVolume(): number {
  return soundEngine().getSfxVolume();
}
