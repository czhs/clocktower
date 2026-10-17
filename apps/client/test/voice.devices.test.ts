// voice (device handling): pure microphone / speaker selection — system-default following
// (Chrome 'default' entry vs Safari first-device), removed devices, saved choice missing / back,
// output sink pinning, Bluetooth hint, dead-silent mic detector (apps/client/src/voice/devices.ts).
import { describe, expect, it } from 'vitest';
import {
  bluetoothMicHint,
  concreteDefault,
  decideMic,
  defaultSignature,
  outputSinkFor,
  pickerOptions,
  resolveChoice,
  SILENCE_AFTER_MS,
  SILENCE_INITIAL,
  silenceStep,
  type MediaDev,
  type SilenceState,
  type TrackInfo,
} from '../src/voice/devices';

const inp = (deviceId: string, groupId: string, label: string): MediaDev => ({ deviceId, groupId, label, kind: 'audioinput' });
const out = (deviceId: string, groupId: string, label: string): MediaDev => ({ deviceId, groupId, label, kind: 'audiooutput' });

const MAC_MIC = inp('mac-in', 'g-mac', 'MacBook Pro Microphone (Built-in)');
const PODS_MIC = inp('pods-in', 'g-pods', 'AirPods Pro');
const MAC_SPK = out('mac-out', 'g-mac-spk', 'MacBook Pro Speakers (Built-in)');
const PODS_SPK = out('pods-out', 'g-pods', 'AirPods Pro');

/** Chrome on macOS: virtual 'default' entries first, sharing the physical device's groupId. */
function chrome(defIn: MediaDev, ins: MediaDev[], defOut?: MediaDev, outs: MediaDev[] = []): MediaDev[] {
  const l: MediaDev[] = [inp('default', defIn.groupId, `Default - ${defIn.label}`), ...ins];
  if (defOut) l.push(out('default', defOut.groupId, `Default - ${defOut.label}`), ...outs);
  return l;
}

const track = (deviceId: string | undefined, groupId: string | undefined, label: string, live = true): TrackInfo => ({ deviceId, groupId, label, live });

describe('concreteDefault / defaultSignature', () => {
  it("Chrome: resolves the 'default' entry to the physical device by groupId", () => {
    expect(concreteDefault(chrome(PODS_MIC, [MAC_MIC, PODS_MIC]), 'audioinput')?.deviceId).toBe('pods-in');
    expect(concreteDefault(chrome(MAC_MIC, [MAC_MIC, PODS_MIC]), 'audioinput')?.deviceId).toBe('mac-in');
  });
  it('Safari / Firefox (no virtual entry): first device is the default', () => {
    expect(concreteDefault([PODS_MIC, MAC_MIC], 'audioinput')?.deviceId).toBe('pods-in');
  });
  it('no groupIds: falls back to the label after "Default - "', () => {
    const l = [inp('default', '', `Default - ${PODS_MIC.label}`), { ...MAC_MIC, groupId: '' }, { ...PODS_MIC, groupId: '' }];
    expect(concreteDefault(l, 'audioinput')?.deviceId).toBe('pods-in');
  });
  it('signature changes when the OS default moves, not on unrelated output changes', () => {
    const a = defaultSignature(chrome(MAC_MIC, [MAC_MIC, PODS_MIC]), 'audioinput');
    const b = defaultSignature(chrome(PODS_MIC, [MAC_MIC, PODS_MIC]), 'audioinput');
    expect(a).not.toBe(b);
    const c = defaultSignature(chrome(MAC_MIC, [MAC_MIC, PODS_MIC], MAC_SPK, [MAC_SPK, PODS_SPK]), 'audioinput');
    expect(c).toBe(a);
  });
  it('empty list -> null / empty signature', () => {
    expect(concreteDefault([], 'audioinput')).toBeNull();
    expect(defaultSignature([], 'audioinput')).toBe('');
  });
});

describe('resolveChoice (persisted choice)', () => {
  const l = chrome(MAC_MIC, [MAC_MIC, PODS_MIC]);
  it('no choice / "default" -> system default', () => {
    expect(resolveChoice(l, 'audioinput', null)).toEqual({ target: null, missing: false });
    expect(resolveChoice(l, 'audioinput', 'default')).toEqual({ target: null, missing: false });
  });
  it('saved device connected -> that device', () => {
    expect(resolveChoice(l, 'audioinput', 'pods-in')).toEqual({ target: 'pods-in', missing: false });
  });
  it('saved device not connected -> default, flagged missing (choice is not forgotten)', () => {
    expect(resolveChoice(chrome(MAC_MIC, [MAC_MIC]), 'audioinput', 'pods-in')).toEqual({ target: null, missing: true });
  });
  it('an output id never matches an input', () => {
    expect(resolveChoice(chrome(MAC_MIC, [MAC_MIC], MAC_SPK, [MAC_SPK]), 'audioinput', 'mac-out').missing).toBe(true);
  });
});

describe('decideMic', () => {
  it('following default: OS default moved to AirPods while we capture the MacBook mic -> restart on default', () => {
    // Chrome reports the virtual id for a track opened on the default device.
    const d = decideMic(chrome(PODS_MIC, [MAC_MIC, PODS_MIC]), null, track('default', 'g-mac', MAC_MIC.label));
    expect(d).toMatchObject({ restart: true, target: null, missing: false });
    expect(d.current?.deviceId).toBe('mac-in');
  });
  it('following default and already on it -> keep (also with a concrete id)', () => {
    expect(decideMic(chrome(PODS_MIC, [MAC_MIC, PODS_MIC]), null, track('default', 'g-pods', PODS_MIC.label)).restart).toBe(false);
    expect(decideMic(chrome(PODS_MIC, [MAC_MIC, PODS_MIC]), null, track('pods-in', 'g-pods', PODS_MIC.label)).restart).toBe(false);
  });
  it('device we capture from was removed -> restart', () => {
    expect(decideMic([MAC_MIC], null, track('usb-in', 'g-usb', 'USB Mic')).restart).toBe(true);
  });
  it('Safari: default = first device; AirPods connected and listed first -> restart', () => {
    expect(decideMic([PODS_MIC, MAC_MIC], null, track('mac-in', 'g-mac', MAC_MIC.label)).restart).toBe(true);
    expect(decideMic([PODS_MIC, MAC_MIC], null, track('pods-in', 'g-pods', PODS_MIC.label)).restart).toBe(false);
  });
  it('explicit choice present and in use -> keep even when the OS default differs', () => {
    expect(decideMic(chrome(MAC_MIC, [MAC_MIC, PODS_MIC]), 'pods-in', track('pods-in', 'g-pods', PODS_MIC.label)).restart).toBe(false);
  });
  it('explicit choice missing -> fall back to default (restart if not on it), missing flagged', () => {
    const d = decideMic(chrome(MAC_MIC, [MAC_MIC]), 'pods-in', track('pods-in', 'g-pods', PODS_MIC.label, false));
    expect(d).toMatchObject({ restart: true, target: null, missing: true });
    const onDefault = decideMic(chrome(MAC_MIC, [MAC_MIC]), 'pods-in', track('mac-in', 'g-mac', MAC_MIC.label));
    expect(onDefault).toMatchObject({ restart: false, target: null, missing: true });
  });
  it('explicit choice comes back -> switch back to it', () => {
    const d = decideMic(chrome(MAC_MIC, [MAC_MIC, PODS_MIC]), 'pods-in', track('mac-in', 'g-mac', MAC_MIC.label));
    expect(d).toMatchObject({ restart: true, target: 'pods-in', missing: false });
  });
  it('ended track -> restart whenever a device exists; nothing to open -> no restart', () => {
    expect(decideMic(chrome(MAC_MIC, [MAC_MIC]), null, track('mac-in', 'g-mac', MAC_MIC.label, false)).restart).toBe(true);
    expect(decideMic([], null, track('mac-in', 'g-mac', MAC_MIC.label, false)).restart).toBe(false);
  });
  it('unmatchable track on a virtual id (no groupId / labels before permission) -> keep (no restart loop)', () => {
    const l = [inp('default', '', ''), inp('x1', '', ''), inp('x2', '', '')];
    expect(decideMic(l, null, track('default', undefined, '')).restart).toBe(false);
  });
});

describe('outputSinkFor (AudioContext.setSinkId)', () => {
  const l = chrome(MAC_MIC, [MAC_MIC, PODS_MIC], PODS_SPK, [MAC_SPK, PODS_SPK]);
  it('default, nothing changed, sink default -> leave alone', () => {
    expect(outputSinkFor(l, null, '', false)).toBeUndefined();
  });
  it('default changed (AirPods / lid closed) -> pin the new concrete default', () => {
    expect(outputSinkFor(l, null, '', true)).toBe('pods-out');
    expect(outputSinkFor(l, null, 'pods-out', true)).toBeUndefined();
  });
  it('explicit choice -> that sink; already there -> nothing', () => {
    expect(outputSinkFor(l, 'mac-out', '', false)).toBe('mac-out');
    expect(outputSinkFor(l, 'mac-out', 'mac-out', true)).toBeUndefined();
  });
  it('explicit choice unplugged -> back to the default device', () => {
    const noPods = chrome(MAC_MIC, [MAC_MIC], MAC_SPK, [MAC_SPK]);
    expect(outputSinkFor(noPods, 'pods-out', 'pods-out', true)).toBe('mac-out');
    expect(outputSinkFor(noPods, 'pods-out', 'pods-out', false)).toBe('mac-out');
  });
  it('switched from explicit to default -> re-pin to the default', () => {
    expect(outputSinkFor(l, null, 'mac-out', false)).toBe('pods-out');
  });
  it('no listed outputs (Safari / no permission) -> browser default', () => {
    expect(outputSinkFor([], null, 'gone', false)).toBe('');
    expect(outputSinkFor([], null, '', true)).toBeUndefined();
  });
});

describe('pickerOptions / bluetoothMicHint', () => {
  it('drops virtual entries and labels unnamed devices', () => {
    const l = [inp('default', 'g', 'Default - X'), inp('communications', 'g', 'Communications - X'), inp('a', 'g', ''), inp('b', 'h', 'USB')];
    expect(pickerOptions(l, 'audioinput')).toEqual([
      { deviceId: 'a', label: 'Microphone 1' },
      { deviceId: 'b', label: 'USB' },
    ]);
  });
  it('hint only when the mic is Bluetooth AND a built-in mic exists', () => {
    const both = pickerOptions([MAC_MIC, PODS_MIC], 'audioinput');
    expect(bluetoothMicHint(both, PODS_MIC.label)).toBe(true);
    expect(bluetoothMicHint(both, MAC_MIC.label)).toBe(false);
    // Lid closed in clamshell: no built-in mic listed -> no point suggesting it.
    expect(bluetoothMicHint(pickerOptions([PODS_MIC], 'audioinput'), PODS_MIC.label)).toBe(false);
    expect(bluetoothMicHint(both, null)).toBe(false);
  });
});

describe('silenceStep (dead mic detector)', () => {
  const run = (samples: [number, number, boolean][], s: SilenceState = SILENCE_INITIAL) => {
    for (const [peak, dt, m] of samples) s = silenceStep(s, peak, dt, m);
    return s;
  };
  it('exact zeros for SILENCE_AFTER_MS -> silent; any signal resets', () => {
    const steps = Math.ceil(SILENCE_AFTER_MS / 50);
    const z = Array.from({ length: steps }, () => [0, 50, true] as [number, number, boolean]);
    expect(run(z).silent).toBe(true);
    expect(run(z.slice(1)).silent).toBe(false);
    expect(run([...z, [0.0001, 50, true]]).silent).toBe(false);
  });
  it('not measuring (AudioContext suspended / no live track) never flags and resets', () => {
    const steps = Math.ceil(SILENCE_AFTER_MS / 50) + 5;
    expect(run(Array.from({ length: steps }, () => [0, 50, false] as [number, number, boolean])).silent).toBe(false);
    const almost = run(Array.from({ length: steps - 10 }, () => [0, 50, true] as [number, number, boolean]));
    expect(silenceStep(almost, 0, 50, false)).toEqual(SILENCE_INITIAL);
  });
  it('returns the same object when nothing changes (no store churn)', () => {
    expect(silenceStep(SILENCE_INITIAL, 0.3, 50, true)).toBe(SILENCE_INITIAL);
  });
});
