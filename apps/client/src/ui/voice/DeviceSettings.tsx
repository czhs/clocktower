// OWNED BY voice. Microphone + speaker pickers for the voice panel ("System default" first),
// with the device hints: saved device not connected, dead-silent mic (lid closed), and the
// Bluetooth headset-profile warning. Choices persist in ct.voice.prefs (VoiceClient).
// Static entry chunk: imports only the tiny pure ../../voice/devices module (no livekit-client).
import { bluetoothMicHint } from '../../voice/devices';
import type { VoiceClient, VoiceClientState } from '../../voice/VoiceClient';

export function DeviceSettings({ client, s }: { client: VoiceClient; s: VoiceClientState }) {
  const showMic = s.devices.length > 0;
  const showOut = s.outputSupported && s.outputs.length > 0;
  if (!showMic && !showOut && !s.micSilent) return null;
  // A saved device that is unplugged stays selected in the list (marked) so the choice survives.
  const micSaved = s.deviceId && !s.devices.some((d) => d.deviceId === s.deviceId) ? s.deviceId : null;
  const outSaved = s.outputId && !s.outputs.some((d) => d.deviceId === s.outputId) ? s.outputId : null;
  const btHint = bluetoothMicHint(s.devices, s.micLabel);
  return (
    <div class="ctv-devices">
      {showMic && (
        <label class="ctv-devrow">
          <span class="ctv-devlabel">Mic</span>
          <select class="ctv-device" value={s.deviceId ?? ''} onChange={(e) => void client.setDevice((e.currentTarget as HTMLSelectElement).value)} aria-label="Microphone">
            <option value="">System default{!s.deviceId && s.micLabel ? ` (${s.micLabel})` : ''}</option>
            {s.devices.map((d) => (
              <option value={d.deviceId}>{d.label}</option>
            ))}
            {micSaved && <option value={micSaved}>Saved microphone (not connected)</option>}
          </select>
        </label>
      )}
      {showOut && (
        <label class="ctv-devrow">
          <span class="ctv-devlabel">Speaker</span>
          <select class="ctv-device" value={s.outputId ?? ''} onChange={(e) => void client.setOutput((e.currentTarget as HTMLSelectElement).value)} aria-label="Speaker">
            <option value="">System default</option>
            {s.outputs.map((d) => (
              <option value={d.deviceId}>{d.label}</option>
            ))}
            {outSaved && <option value={outSaved}>Saved speaker (not connected)</option>}
          </select>
        </label>
      )}
      {s.micFallback && <p class="ctv-note ctv-warn">Your chosen microphone is not connected — using the system default until it is back.</p>}
      {s.outputMissing && <p class="ctv-note ctv-warn">Your chosen speaker is not connected — playing on the system default.</p>}
      {s.micSilent && s.mic === 'ready' && (
        <div class="ctv-note ctv-warn">
          Your microphone picks up nothing. A closed laptop lid switches the built-in mic off — choose another microphone.{' '}
          <button class="ctv-small" onClick={() => void client.retryMic()}>
            Retry mic
          </button>
        </div>
      )}
      {btHint && <p class="ctv-note">Bluetooth headset as mic: its sound quality drops while the mic is in use. For better sound, pick the laptop mic.</p>}
      {!s.outputSupported && s.enabled && <p class="ctv-note ctv-devhelp">Voices play on your system sound output — change it in your computer's sound settings.</p>}
    </div>
  );
}
