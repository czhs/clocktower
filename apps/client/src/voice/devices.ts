// OWNED BY voice. Pure audio-device decisions (no livekit-client, no DOM): which microphone /
// speaker we should be using given the browser's device list, the player's saved choice and the
// device the live mic track is actually on. Used by VoiceEngine's DeviceWatch (lazy chunk) and by
// the voice panel's device picker (entry chunk — keep this module tiny and dependency-free).
//
// Browser facts this encodes:
// - Chrome/Edge list virtual entries 'default' (follows the OS default, label "Default - X") and
//   'communications' (Windows) next to the physical devices; the virtual entry shares the physical
//   device's groupId. A captured track does NOT move when the OS default changes.
// - Safari/Firefox have no virtual entry: the first device of a kind is the system default.
// - Labels (and often groupIds) are empty until microphone permission is granted.

export type DevKind = 'audioinput' | 'audiooutput';

export interface MediaDev {
  deviceId: string;
  groupId: string;
  label: string;
  kind: string;
}

export interface PickerOption {
  deviceId: string;
  label: string;
}

const VIRTUAL = new Set(['default', 'communications', '']);

export function isVirtualId(id: string | undefined | null): boolean {
  return id == null || VIRTUAL.has(id);
}

/** "Default - MacBook Pro Microphone (Built-in)" -> "MacBook Pro Microphone (Built-in)". */
export function stripDefaultPrefix(label: string): string {
  return label.replace(/^(Default|Communications)\s*-\s*/i, '');
}

/** Physical devices of a kind (virtual 'default' / 'communications' entries removed). */
export function physical(list: readonly MediaDev[], kind: DevKind): MediaDev[] {
  return list.filter((d) => d.kind === kind && !isVirtualId(d.deviceId));
}

/**
 * The physical device the system default currently points to: the device sharing the 'default'
 * entry's groupId (Chrome), else the first physical device (Safari / Firefox / no groupIds).
 */
export function concreteDefault(list: readonly MediaDev[], kind: DevKind): MediaDev | null {
  const phys = physical(list, kind);
  if (phys.length === 0) return null;
  const virt = list.find((d) => d.kind === kind && d.deviceId === 'default');
  if (virt) {
    if (virt.groupId) {
      const same = phys.filter((d) => d.groupId === virt.groupId);
      if (same.length === 1) return same[0]!;
      if (same.length > 1) {
        const byLabel = same.find((d) => d.label === stripDefaultPrefix(virt.label));
        return byLabel ?? same[0]!;
      }
    }
    const name = stripDefaultPrefix(virt.label);
    if (name) {
      const byLabel = phys.find((d) => d.label === name);
      if (byLabel) return byLabel;
    }
  }
  return phys[0]!;
}

/** Changes whenever the OS default device of `kind` changes (or devices come/go). */
export function defaultSignature(list: readonly MediaDev[], kind: DevKind): string {
  const d = concreteDefault(list, kind);
  return d ? `${d.deviceId}|${d.groupId}|${d.label}` : '';
}

/** The saved choice if it is connected; otherwise the system default (null) and `missing`. */
export function resolveChoice(list: readonly MediaDev[], kind: DevKind, preferred: string | null | undefined): { target: string | null; missing: boolean } {
  if (!preferred || isVirtualId(preferred)) return { target: null, missing: false };
  const present = physical(list, kind).some((d) => d.deviceId === preferred);
  return present ? { target: preferred, missing: false } : { target: null, missing: true };
}

export interface TrackInfo {
  /** getSettings().deviceId ('default' in Chrome when opened on the default device). */
  deviceId: string | undefined;
  groupId: string | undefined;
  /** MediaStreamTrack.label (the physical device name in Chrome / Safari). */
  label: string | undefined;
  live: boolean;
}

export interface MicDecision {
  /** Re-acquire the microphone (restartTrack keeps the publication, DTX/RED and mute state). */
  restart: boolean;
  /** Device to open; null = the system default. */
  target: string | null;
  /** The saved microphone is not connected: using the system default instead. */
  missing: boolean;
  /** Physical device the mic currently captures from (best guess; for labels / hints). */
  current: MediaDev | null;
}

/** Which physical device a track is on. */
export function deviceOfTrack(list: readonly MediaDev[], t: TrackInfo): MediaDev | null {
  const phys = physical(list, 'audioinput');
  if (t.deviceId && !isVirtualId(t.deviceId)) {
    const byId = phys.find((d) => d.deviceId === t.deviceId);
    if (byId) return byId;
    return null; // that device is gone
  }
  // Opened through the virtual 'default' entry: identify by groupId, then by label.
  if (t.groupId) {
    const same = phys.filter((d) => d.groupId === t.groupId);
    if (same.length === 1) return same[0]!;
    if (same.length > 1 && t.label) return same.find((d) => d.label === t.label) ?? same[0]!;
  }
  if (t.label) return phys.find((d) => d.label === stripDefaultPrefix(t.label!)) ?? null;
  return null;
}

/**
 * Should the live microphone move? Yes when the track has ended, when the saved device is
 * connected but we are elsewhere (e.g. it came back), or — when following the system default —
 * when the device we capture from vanished or is no longer the default (AirPods connected, lid
 * closed). When the track cannot be matched to any listed device and nothing else tells us it
 * moved, we keep it (no restart loops on browsers that hide ids/labels).
 */
export function decideMic(list: readonly MediaDev[], preferred: string | null | undefined, t: TrackInfo): MicDecision {
  const { target, missing } = resolveChoice(list, 'audioinput', preferred);
  const current = deviceOfTrack(list, t);
  const phys = physical(list, 'audioinput');
  if (phys.length === 0) return { restart: false, target, missing, current };
  if (!t.live) return { restart: true, target, missing, current };
  if (target) return { restart: current?.deviceId !== target, target, missing, current };
  const def = concreteDefault(list, 'audioinput');
  if (!def) return { restart: false, target, missing, current };
  if (current) return { restart: current.deviceId !== def.deviceId, target, missing, current };
  // Not matchable: a concrete id that is no longer listed means the device was removed.
  const gone = !!t.deviceId && !isVirtualId(t.deviceId);
  return { restart: gone, target, missing, current };
}

/**
 * New sinkId for the AudioContext that plays everyone's voice, or undefined to leave it alone.
 * '' = the browser's default output. When following the default we pin the concrete default
 * device after it changes (some browser versions keep playing on the old device otherwise).
 */
export function outputSinkFor(
  list: readonly MediaDev[],
  preferred: string | null | undefined,
  currentSink: string,
  defaultChanged: boolean,
): string | undefined {
  const { target } = resolveChoice(list, 'audiooutput', preferred);
  if (target) return currentSink === target ? undefined : target;
  const def = concreteDefault(list, 'audiooutput');
  if (defaultChanged) {
    const want = def?.deviceId ?? '';
    return want === currentSink ? undefined : want;
  }
  if (currentSink === '') return undefined;
  // Pinned to something that is not (or no longer) the default: back to the default.
  if (def && currentSink === def.deviceId) return undefined;
  return def?.deviceId ?? '';
}

/** Picker entries for a kind: physical devices only, labelled even before permission. */
export function pickerOptions(list: readonly MediaDev[], kind: DevKind): PickerOption[] {
  const noun = kind === 'audioinput' ? 'Microphone' : 'Speaker';
  return physical(list, kind).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${noun} ${i + 1}` }));
}

export function isBluetoothLabel(label: string | null | undefined): boolean {
  return !!label && /airpods|bluetooth|beats|buds|headset|hands-?free|\bhfp\b|wh-1000|bose|jabra/i.test(label);
}

export function isBuiltInLabel(label: string | null | undefined): boolean {
  return !!label && /built-?in|internal|macbook|imac|laptop/i.test(label);
}

/**
 * Show "using AirPods as mic lowers their sound quality — pick the laptop mic" only when the mic
 * in use is Bluetooth AND a built-in microphone is actually available to switch to.
 */
export function bluetoothMicHint(inputs: readonly PickerOption[], micLabel: string | null | undefined): boolean {
  return isBluetoothLabel(micLabel) && inputs.some((d) => isBuiltInLabel(d.label) && !isBluetoothLabel(d.label));
}

/**
 * Dead-microphone detector: a MacBook's built-in mic is hardware-disconnected while the lid is
 * closed but stays listed and keeps delivering exact digital silence. Counts consecutive ms of
 * all-zero input (only while the AudioContext runs — a suspended analyser also reads zeros).
 */
export interface SilenceState {
  zeroMs: number;
  silent: boolean;
}
export const SILENCE_INITIAL: SilenceState = { zeroMs: 0, silent: false };
export const SILENCE_AFTER_MS = 4000;

export function silenceStep(s: SilenceState, peak: number, dtMs: number, measuring: boolean): SilenceState {
  if (!measuring) return s.zeroMs === 0 && !s.silent ? s : SILENCE_INITIAL;
  if (peak > 0) return s.zeroMs === 0 && !s.silent ? s : SILENCE_INITIAL;
  const zeroMs = s.zeroMs + dtMs;
  const silent = zeroMs >= SILENCE_AFTER_MS;
  return { zeroMs, silent };
}
