// OWNED BY voice. Audio DEVICE handling for the lazily loaded VoiceEngine: follows the system
// default microphone / speaker (or the player's saved choice) across devicechange, sleep/wake and
// lid close, and recovers a microphone that ended or went dead — without a reload.
//
// The mic is moved with LocalAudioTrack.restartTrack(): LiveKit swaps the sender's track with
// replaceTrack(), so the publication, its DTX/RED settings and the mute / push-to-talk state are
// all kept (VoiceEngine re-clones its VAD + announcement tracks on TrackEvent.Restarted).
// Remote voices are mixed through one AudioContext (LiveKit webAudioMix), so the speaker choice is
// AudioContext.setSinkId (Chrome/Edge 110+); browsers without it (Safari, Firefox) play on the
// system output and we only make sure the context is running again after a device change / wake.
//
// Only `import type` from livekit-client here; this module is reached from VoiceEngine only.
import type { AudioCaptureOptions, LocalAudioTrack } from 'livekit-client';
import type { Store } from '../net/store';
import {
  decideMic,
  defaultSignature,
  outputSinkFor,
  physical,
  pickerOptions,
  resolveChoice,
  SILENCE_INITIAL,
  silenceStep,
  type MediaDev,
  type SilenceState,
  type TrackInfo,
} from './devices';
import type { Prefs, VoiceClientState } from './VoiceClient';

const MIC_OPTS: AudioCaptureOptions = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
/** devicechange arrives in bursts (input + output of one headset) and before the list settles. */
const SETTLE_MS = 350;
/** Re-acquire attempts after the mic track ended (device removed, sleep). */
const ENDED_RETRY_MS = [300, 1200, 3500];
const WATCHDOG_MS = 3000;

export interface DeviceHost {
  readonly state: Store<VoiceClientState>;
  readonly prefs: Prefs;
  readonly audioCtx: AudioContext | null;
  mic(): LocalAudioTrack | null;
  /** Open a microphone when there is none (permission / not-found paths live in the engine). */
  acquireMic(): Promise<void>;
  /** Give the mic up: unpublish, show the inline error with "Retry mic". */
  dropMic(track: LocalAudioTrack): void;
  updatePlayback(): void;
  notify(text: string, kind?: 'info' | 'warn', ms?: number): void;
}

type SinkCtx = AudioContext & { sinkId?: unknown; setSinkId?: (id: string) => Promise<void> };

function trackInfo(t: MediaStreamTrack): TrackInfo {
  let s: MediaTrackSettings = {};
  try {
    s = t.getSettings();
  } catch {
    /* ignore */
  }
  return { deviceId: s.deviceId, groupId: s.groupId, label: t.label, live: t.readyState === 'live' };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function hasBeenActive(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

export class DeviceWatch {
  private list: MediaDev[] = [];
  private outSig = '';
  private running: Promise<void> | null = null;
  private rerun = false;
  private pendingReason = '';
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** target|default-signature of the last automatic restart: never restart twice for the same situation. */
  private lastRestartKey = '';
  private recovering = false;
  private silence: SilenceState = SILENCE_INITIAL;
  private offs: (() => void)[] = [];
  private disposed = false;

  constructor(private readonly host: DeviceHost) {}

  private patch(p: Partial<VoiceClientState>) {
    this.host.state.set((s) => ({ ...s, ...p }));
  }

  start() {
    const md = navigator.mediaDevices;
    const onChange = () => this.schedule('devicechange');
    md?.addEventListener?.('devicechange', onChange);
    // Wake from sleep / lid open / tab back: devices may have changed without an event reaching
    // us, and Safari leaves the AudioContext 'interrupted' / 'suspended'.
    const wake = () => {
      if (document.visibilityState === 'visible') this.schedule('wake');
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    this.offs.push(() => {
      md?.removeEventListener?.('devicechange', onChange);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
    });
    this.watchdog = setInterval(() => void this.kickAudio(), WATCHDOG_MS);
  }

  dispose() {
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs = [];
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.watchdog) clearInterval(this.watchdog);
  }

  /** Debounced reconcile (device events come in bursts). */
  schedule(reason: string, ms = SETTLE_MS) {
    if (this.disposed) return;
    this.pendingReason ||= reason;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      const r = this.pendingReason;
      this.pendingReason = '';
      void this.reconcile(r);
    }, ms);
  }

  /** Serialized: one pass at a time, a request during a pass runs one more pass afterwards. */
  reconcile(reason: string): Promise<void> {
    if (this.running) {
      this.rerun = true;
      this.pendingReason ||= reason;
      return this.running;
    }
    this.running = (async () => {
      let r = reason;
      do {
        this.rerun = false;
        await this.reconcileOnce(r).catch(() => undefined);
        r = this.pendingReason || r;
        this.pendingReason = '';
      } while (this.rerun && !this.disposed);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Re-read the device list and publish the picker entries. */
  async refresh(): Promise<boolean> {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return false;
    let all: MediaDeviceInfo[];
    try {
      all = await md.enumerateDevices();
    } catch {
      return false;
    }
    this.list = all
      .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, groupId: d.groupId, label: d.label, kind: d.kind }));
    const ctx = this.host.audioCtx as SinkCtx | null;
    const outputSupported = !!ctx && typeof ctx.setSinkId === 'function';
    const prefs = this.host.prefs;
    this.patch({
      devices: pickerOptions(this.list, 'audioinput'),
      outputs: outputSupported ? pickerOptions(this.list, 'audiooutput') : [],
      outputSupported,
      outputMissing: outputSupported && resolveChoice(this.list, 'audiooutput', prefs.outputId).missing,
    });
    return true;
  }

  private async reconcileOnce(reason: string) {
    if (this.disposed || !this.host.state.get().enabled) return;
    if (!(await this.refresh())) return;
    await this.reconcileMic(reason);
    await this.reconcileOutput(reason);
    await this.kickAudio();
  }

  // -- microphone ---------------------------------------------------------------------------

  private async reconcileMic(reason: string) {
    if (this.recovering) return;
    const host = this.host;
    const mic = host.mic();
    if (!mic) {
      const s = host.state.get();
      if ((s.micFailure === 'notfound' || s.micFailure === 'ended') && physical(this.list, 'audioinput').length > 0) {
        await host.acquireMic();
        if (host.mic()) host.notify('Microphone found — voice is back on.');
      }
      this.publishMicInfo();
      return;
    }
    const d = decideMic(this.list, host.prefs.deviceId, trackInfo(mic.mediaStreamTrack));
    const wasMissing = host.state.get().micFallback;
    if (d.restart) {
      const key = `${d.target ?? 'default'}|${defaultSignature(this.list, 'audioinput')}`;
      const forced = reason === 'user' || reason === 'retry' || mic.mediaStreamTrack.readyState !== 'live';
      if (forced || key !== this.lastRestartKey) {
        this.lastRestartKey = key;
        const ok = await this.restartMic(mic, d.target);
        if (!ok) {
          if (host.mic() === mic && mic.mediaStreamTrack.readyState !== 'live') host.dropMic(mic);
        } else if (reason !== 'user') {
          host.notify(`Microphone switched to ${this.micName(mic)}.`, 'info', 5000);
        }
      }
    }
    this.patch({ micFallback: d.missing });
    if (d.missing && !wasMissing) host.notify('Your chosen microphone is not connected — using the system default until it is back.', 'warn', 7000);
    this.publishMicInfo();
  }

  private micName(mic: LocalAudioTrack): string {
    return mic.mediaStreamTrack.label || 'the default microphone';
  }

  private publishMicInfo() {
    const mic = this.host.mic();
    const micLabel = mic && mic.mediaStreamTrack.readyState === 'live' ? mic.mediaStreamTrack.label || null : null;
    if (this.host.state.get().micLabel !== micLabel) this.patch({ micLabel });
  }

  /**
   * Re-open the mic on `target` (null = system default) in place. LiveKit stops the old capture
   * before getUserMedia (Safari needs that), so a failure leaves the track ended.
   */
  private async restartMic(mic: LocalAudioTrack, target: string | null): Promise<boolean> {
    try {
      await mic.restartTrack({ ...MIC_OPTS, ...(target ? { deviceId: { exact: target } } : {}) });
    } catch {
      if (!target) return false;
      try {
        await mic.restartTrack({ ...MIC_OPTS });
      } catch {
        return false;
      }
    }
    if (this.host.mic() !== mic || mic.mediaStreamTrack.readyState !== 'live') return false;
    this.silence = SILENCE_INITIAL;
    this.patch({ mic: 'ready', micError: null, micFailure: null, micSilent: false });
    this.publishMicInfo();
    return true;
  }

  /** Player picked a device, or pressed "Retry mic" while a (dead / silent) mic exists. */
  async userChanged(retry = false) {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    await this.reconcile(retry ? 'retry' : 'user');
    if (!retry) return;
    // Retry with a live track the rules consider fine: re-open it anyway (dead-silent mic).
    const mic = this.host.mic();
    if (!mic || this.recovering) return;
    if (mic.mediaStreamTrack.readyState === 'live' && !this.host.state.get().micSilent) return;
    const { target } = resolveChoice(this.list, 'audioinput', this.host.prefs.deviceId);
    if (!(await this.restartMic(mic, target)) && this.host.mic() === mic) this.host.dropMic(mic);
  }

  /** The mic track ended (unplugged, Bluetooth dropped, capture failure after sleep). */
  async micEnded(track: LocalAudioTrack) {
    if (this.recovering || this.disposed) return;
    this.recovering = true;
    const host = this.host;
    host.notify('Microphone disconnected — switching to another one…', 'warn', 5000);
    try {
      for (const wait of ENDED_RETRY_MS) {
        await sleep(wait);
        if (this.disposed || host.mic() !== track) return;
        // LiveKit itself re-opens an ended, published, UNmuted mic on 'default': done already.
        if (track.mediaStreamTrack.readyState === 'live') {
          host.notify(`Microphone switched to ${this.micName(track)}.`, 'info', 5000);
          return;
        }
        if (!(await this.refresh())) continue;
        if (physical(this.list, 'audioinput').length === 0) continue;
        const { target } = resolveChoice(this.list, 'audioinput', host.prefs.deviceId);
        if (await this.restartMic(track, target)) {
          host.notify(`Microphone switched to ${this.micName(track)}.`, 'info', 5000);
          return;
        }
      }
      if (host.mic() === track) host.dropMic(track);
    } finally {
      this.recovering = false;
      this.publishMicInfo();
      this.schedule('ended'); // re-check the saved choice / default once things settled
    }
  }

  /**
   * Fed ~20x/s from the engine's VAD (peak |sample| of the mic clone). Exact digital silence for
   * a few seconds = dead input (MacBook mic with the lid closed, Safari AirPods taken out).
   */
  noteLevel(peak: number, dtMs: number, measuring: boolean) {
    const prev = this.silence;
    const next = silenceStep(prev, peak, dtMs, measuring);
    this.silence = next;
    if (next.silent === prev.silent) return;
    this.patch({ micSilent: next.silent });
    if (!next.silent) return;
    // Maybe the default moved without a devicechange reaching us: check once (guarded by key).
    this.schedule('silent', 0);
    this.host.notify('Your microphone is picking up nothing at all. If your laptop lid is closed, its built-in mic is switched off — choose another microphone in the voice panel.', 'warn', 10_000);
  }

  // -- speakers / AudioContext ---------------------------------------------------------------

  private async reconcileOutput(reason: string) {
    const ctx = this.host.audioCtx as SinkCtx | null;
    const sig = defaultSignature(this.list, 'audiooutput');
    const changed = this.outSig !== '' && sig !== this.outSig;
    this.outSig = sig;
    if (!ctx || ctx.state === 'closed' || typeof ctx.setSinkId !== 'function') return;
    const cur = typeof ctx.sinkId === 'string' ? ctx.sinkId : '';
    const next = outputSinkFor(this.list, this.host.prefs.outputId, cur, changed);
    if (next === undefined) return;
    try {
      await ctx.setSinkId(next);
    } catch {
      try {
        if (next !== '') await ctx.setSinkId('');
      } catch {
        /* keep whatever plays */
      }
      if (reason === 'user') this.host.notify('Could not switch to that speaker — using the system default.', 'warn');
    }
    this.host.updatePlayback();
  }

  /** Get the mixing AudioContext running again (device change, wake, Safari 'interrupted'). */
  async kickAudio() {
    const ctx = this.host.audioCtx;
    if (this.disposed || !ctx || !this.host.state.get().enabled) return;
    const st = ctx.state as string;
    if (st === 'running' || st === 'closed') return;
    if (document.visibilityState !== 'visible' || !hasBeenActive()) return;
    await ctx.resume().catch(() => undefined);
    this.host.updatePlayback();
  }
}
