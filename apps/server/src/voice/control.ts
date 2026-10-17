// OWNED BY voice (v2.3 sec-voice, VOICE-6). Process-wide voice kill switch.
//
// API for the admin console (sec-ops owns the endpoint + UI and the persisted flag):
//
//   configureVoiceFlagStore(store)  wire the persisted admin flag (e.g. ops_flags 'voice'); reads it now.
//                                   store.load(): true = disabled, false = enabled, throws = unreadable
//                                   -> voice is treated as DISABLED (safe default) until a successful
//                                   setVoiceDisabled(false).
//   setVoiceDisabled(disabled, {reason?, by?})   admin toggle: persists (store.save) and applies at once.
//   voiceKill(reason?) / voiceRestore()          shorthands for setVoiceDisabled(true/false).
//   voiceControlState()                          { disabled, disabledBy: 'env'|'admin'|'unknown'|null, ... }
//
// VOICE_DISABLED=1 in the environment wins over the admin flag (setVoiceDisabled(false) then returns
// the state with disabledBy 'env'). Disabling revokes every grant in every live lobby immediately
// (coordinators subscribe via onVoiceControlChange) and runs one LiveKit orphan sweep.

export type VoiceDisabledBy = 'env' | 'admin' | 'unknown' | null;

export interface VoiceControlState {
  disabled: boolean;
  disabledBy: VoiceDisabledBy;
  reason: string | null;
  /** ms epoch when voice was last disabled (null while enabled). */
  since: number | null;
}

export interface VoiceFlagStore {
  /** true = voice disabled, false = enabled (also when nothing is stored yet). Throw when unreadable. */
  load(): boolean;
  save(disabled: boolean): void;
}

type Listener = (s: VoiceControlState) => void;

let envDisabled = false;
let adminDisabled = false;
let unknown = false;
let reason: string | null = null;
let since: number | null = null;
let store: VoiceFlagStore | null = null;
const listeners = new Set<Listener>();

export function voiceControlState(): VoiceControlState {
  const disabled = envDisabled || adminDisabled || unknown;
  return {
    disabled,
    disabledBy: envDisabled ? 'env' : adminDisabled ? 'admin' : unknown ? 'unknown' : null,
    reason: disabled ? (envDisabled ? 'VOICE_DISABLED is set on the server' : unknown ? 'the stored voice setting could not be read' : reason) : null,
    since: disabled ? since : null,
  };
}

export function isVoiceDisabled(): boolean {
  return envDisabled || adminDisabled || unknown;
}

function emit(before: boolean) {
  if (isVoiceDisabled() && !before) since = Date.now();
  const st = voiceControlState();
  for (const l of listeners) {
    try {
      l(st);
    } catch {
      /* a listener must not break the switch */
    }
  }
}

/** Subscribe (coordinators, reconciler). Returns an unsubscribe function. */
export function onVoiceControlChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Called once at module setup with the parsed VOICE_DISABLED env flag. */
export function setVoiceEnvDisabled(on: boolean): void {
  const before = isVoiceDisabled();
  envDisabled = on;
  if (before !== isVoiceDisabled() || on) emit(before);
}

/** Wire the persisted admin flag; loads it immediately (unreadable -> disabled). */
export function configureVoiceFlagStore(s: VoiceFlagStore | null): VoiceControlState {
  const before = isVoiceDisabled();
  store = s;
  if (s) {
    try {
      adminDisabled = s.load() === true;
      unknown = false;
      if (adminDisabled) reason = reason ?? 'switched off by an administrator';
    } catch {
      unknown = true;
    }
  }
  if (before !== isVoiceDisabled()) emit(before);
  return voiceControlState();
}

/** Admin toggle. Persists through the configured store (a failed save still applies in memory). */
export function setVoiceDisabled(disabled: boolean, opts: { reason?: string } = {}): VoiceControlState & { persisted: boolean } {
  const before = isVoiceDisabled();
  let persisted = false;
  if (store) {
    try {
      store.save(disabled);
      persisted = true;
    } catch {
      persisted = false;
    }
  }
  adminDisabled = disabled;
  // An explicit "on" from an administrator clears the unreadable-setting safe default.
  if (!disabled) unknown = false;
  reason = disabled ? (opts.reason?.slice(0, 200) ?? 'switched off by an administrator') : null;
  if (disabled || before !== isVoiceDisabled()) emit(before);
  return { ...voiceControlState(), persisted };
}

export function voiceKill(reasonText?: string) {
  return setVoiceDisabled(true, reasonText ? { reason: reasonText } : {});
}

export function voiceRestore() {
  return setVoiceDisabled(false);
}

/** Tests only: reset all module state. */
export function resetVoiceControlForTests(): void {
  envDisabled = false;
  adminDisabled = false;
  unknown = false;
  reason = null;
  since = null;
  store = null;
  // listeners stay: the voice module registers one process-wide listener at import time.
}
