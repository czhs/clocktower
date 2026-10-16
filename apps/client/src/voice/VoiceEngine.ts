// OWNED BY voice. The LiveKit half of the voice client, loaded on demand by VoiceClient.enable()
// (keeps `livekit-client` out of the entry chunk).
//
// Follows the server's decisions: one zone room at a time (+ an optional listen-only announcement
// overlay), a single microphone track that survives room switches, push-to-talk / open mic,
// per-participant volume, deafen, and client-side distance attenuation in the 'street' room.
// In the street, talkers far beyond the audible radius are unsubscribed (see policy.ts cullStep):
// that only ever DROPS subscriptions the server's token allows — we resubscribe only tracks we
// culled ourselves, never anything new. Private rooms are separate LiveKit rooms (not culled).
import {
  AudioPresets,
  ConnectionQuality,
  ConnectionState,
  createLocalAudioTrack,
  DisconnectReason,
  MediaDeviceFailure,
  Room,
  RoomEvent,
  Track,
  TrackEvent,
  type LocalAudioTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type TrackPublishOptions,
} from 'livekit-client';
import type { VoiceGrant, VoiceRevoke } from '@ct/protocol';
import { attenuationGain, distancePx, smoothGain, VOICE_DEFAULTS } from '@ct/voice/shared';
import { localPlayer, remoteEntities } from '../net/localPlayer';
import { CULL_INITIAL, cullStep, LOSS_WINDOW_EMPTY, lossStep, RED_LOSS_THRESHOLD, roundGain, sameParticipants, type CullState, type LossWindow, type SenderSample } from './policy';
import { SpeakingHold } from './speaking';
import { attachMousePtt } from './ptt';
import { DeviceWatch } from './deviceWatch';
import { keyLabel, voiceActivity, voicePresence, type LinkState, type VoiceClientState, type VoiceDebugInfo, type VoiceHost, type VoiceParticipantView } from './VoiceClient';

const GAIN_TICK_MS = 50;
const UI_REFRESH_MS = 200;
/** Uplink loss check cadence (sender stats) while publishing. */
const LOSS_CHECK_MS = 5000;

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export class VoiceEngine {
  private readonly state: VoiceHost['state'];
  private readonly prefs: VoiceHost['prefs'];
  private zoneGrant: VoiceGrant | null;
  private announceGrant: VoiceGrant | null;
  private zoneRoom: Room | null = null;
  private announceRoom: Room | null = null;
  private zoneSeq = 0;
  private announceSeq = 0;
  private mic: LocalAudioTrack | null = null;
  private announceTrack: MediaStreamTrack | null = null;
  private gains = new Map<string, number>();
  private applied = new Map<string, number>();
  private speakers = new Set<string>();
  /** `speakers` (+ '@self' from the local VAD) with a ~300 ms hang time: no flicker between words. */
  private speakingHold = new SpeakingHold();
  /** Street subscription culling per identity (zone room only). */
  private cull = new Map<string, CullState>();
  /** LiveKit connection quality per identity ('' = local) — debug overlay only. */
  private quality = new Map<string, ConnectionQuality>();
  private container: HTMLDivElement | null = null;
  private offs: (() => void)[] = [];
  private gainTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lossTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private lastTick = 0;
  private lastUi = 0;
  private lastStatusKey = '';
  private disposed = false;
  /** In-flight disconnect of a revoked zone room; a new zone connection waits for it. */
  private leaving: Promise<void> | null = null;
  /** Local voice-activity detector on a clone of the mic (works while muted). */
  private vad: { track: MediaStreamTrack; src: MediaStreamAudioSourceNode; an: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null = null;
  private vadLevel = 0;
  private vadVoicedMs = 0;
  private lastMutedHint = 0;
  private heard = new Set<string>();
  private lastActivityAt = 0;
  private lastPresenceKey = '';
  /** RED (redundant audio) on our publications: off until the uplink measurably loses packets. */
  private red = false;
  /** RED was switched on while talking: republish the mic at the next silent moment. */
  private redPending = false;
  private lossPrev: SenderSample | null = null;
  private lossWin: LossWindow = LOSS_WINDOW_EMPTY;
  /** Audio devices: follows default mic/speaker, recovers lost mics, wakes the AudioContext. */
  private readonly devices: DeviceWatch;

  constructor(
    private readonly host: VoiceHost,
    private audioCtx: AudioContext | null,
    grants: { zone: VoiceGrant | null; announce: VoiceGrant | null },
  ) {
    this.state = host.state;
    this.prefs = host.prefs;
    this.zoneGrant = grants.zone;
    this.announceGrant = grants.announce;
    const down = (e: KeyboardEvent) => this.onKey(e, true);
    const up = (e: KeyboardEvent) => this.onKey(e, false);
    const blur = () => this.setPtt(false);
    // Any later gesture unlocks audio that the browser refused to start without one (auto
    // re-enable after a reload, Safari, autoplay policies).
    const gesture = () => {
      if (!this.state.get().enabled) return;
      if (this.state.get().playbackBlocked || (this.audioCtx && this.audioCtx.state !== 'running')) void this.allowAudio();
    };
    // Network back: retry immediately instead of waiting for the backoff timer.
    const online = () => {
      const s = this.state.get();
      if (s.enabled && this.zoneGrant && s.link !== 'connected' && s.link !== 'connecting') this.reconnect();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('pointerdown', gesture, true);
    window.addEventListener('keydown', gesture, true);
    window.addEventListener('online', online);
    // Microphone / speaker plugged in or out, system default changed (AirPods, lid closed),
    // sleep/wake: handled by DeviceWatch (devicechange, visibility, AudioContext watchdog).
    this.devices = this.makeDeviceWatch();
    this.offs.push(() => this.devices.dispose());
    // Push-to-talk on a mouse button (middle / back / forward) + release on a hidden tab.
    this.offs.push(
      attachMousePtt({
        code: () => this.state.get().pttKey,
        active: () => this.state.get().inputMode === 'ptt',
        held: () => this.state.get().pttHeld,
        set: (held) => this.setPtt(held),
      }),
    );
    this.offs.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', gesture, true);
      window.removeEventListener('keydown', gesture, true);
      window.removeEventListener('online', online);
    });
    if (audioCtx) {
      // Remote audio is mixed through this context: if it is not running (autoplay policy,
      // Safari, a reload without a gesture, no output device) nothing is audible — surface it.
      audioCtx.addEventListener('statechange', () => this.updatePlayback());
    }
  }

  private patch(p: Partial<VoiceClientState>) {
    this.state.set((s) => ({ ...s, ...p }));
  }

  private notify(text: string, kind: 'info' | 'warn' = 'info', ms = 6000) {
    this.host.notify(text, kind, ms);
  }

  /** Second half of VoiceClient.enable(), once this module is loaded. */
  async start(): Promise<void> {
    if (this.state.get().enabled || this.disposed) return;
    void this.audioCtx
      ?.resume()
      .catch(() => undefined)
      .finally(() => this.updatePlayback());
    this.container = document.createElement('div');
    this.container.style.display = 'none';
    this.container.setAttribute('data-ct-voice-audio', '');
    document.body.appendChild(this.container);
    this.patch({ enabled: true });
    this.gainTimer = setInterval(() => this.tickGains(), GAIN_TICK_MS);
    this.heartbeatTimer = setInterval(() => this.sendStatus(true), VOICE_DEFAULTS.heartbeatMs);
    this.lossTimer = setInterval(() => void this.checkLoss(), LOSS_CHECK_MS);
    this.devices.start();
    const micP = this.acquireMic().then(() => this.devices.reconcile('start'));
    if (this.zoneGrant) void this.connectZone(this.zoneGrant);
    if (this.announceGrant) void this.connectAnnounce(this.announceGrant);
    await micP;
  }

  // ---------------------------------------------------------------------------------------
  // User actions (prefs / state already updated by VoiceClient)

  async retryMic(): Promise<void> {
    if (!this.mic) {
      await this.acquireMic();
      await this.devices.reconcile('retry');
      return;
    }
    await this.devices.userChanged(true); // re-open a dead / silent mic in place
  }

  /** Resume playback after the browser blocked autoplay (call from a click). */
  async allowAudio(): Promise<void> {
    const resumed = this.audioCtx?.resume().catch(() => undefined);
    for (const r of [this.zoneRoom, this.announceRoom]) await r?.startAudio().catch(() => undefined);
    await resumed;
    const was = this.state.get().playbackBlocked;
    this.updatePlayback();
    if (was && !this.state.get().playbackBlocked) this.notify('Voice audio is back on.');
  }

  /** playbackBlocked = the mixing AudioContext is not running, or LiveKit reports blocked playback. */
  private updatePlayback() {
    const ctxBlocked = !!this.audioCtx && this.audioCtx.state !== 'running';
    const room = this.zoneRoom;
    const roomBlocked = !!room && room.state === ConnectionState.Connected && !room.canPlaybackAudio;
    const blocked = this.state.get().enabled && (ctxBlocked || roomBlocked);
    if (this.state.get().playbackBlocked !== blocked) this.patch({ playbackBlocked: blocked });
  }

  /** Input mode / push-to-talk key / mute / deafen changed. */
  settingsChanged(volumes = false) {
    if (volumes) this.applied.clear(); // force re-apply of every volume
    void this.applyTransmit();
  }

  volumeChanged(pid: string) {
    this.applied.delete(pid);
    this.refreshParticipants(true);
  }

  /** Microphone picked in the panel (prefs.deviceId already saved; '' = system default). */
  async deviceChanged(_deviceId: string) {
    if (!this.mic) {
      await this.acquireMic();
      await this.devices.reconcile('user');
      return;
    }
    // restartTrack in place (DeviceWatch): keeps the publication, DTX/RED and mute / PTT state.
    await this.devices.userChanged();
  }

  /** Speaker picked in the panel (prefs.outputId already saved). */
  async outputChanged() {
    await this.devices.userChanged();
  }

  // ---------------------------------------------------------------------------------------
  // Microphone

  private async acquireMic(): Promise<void> {
    if (this.mic) return;
    this.patch({ mic: 'requesting', micError: null, micFailure: null });
    if (!navigator.mediaDevices?.getUserMedia) {
      this.patch({ mic: 'unavailable', micFailure: 'insecure', micError: 'This browser cannot use a microphone on this page (it needs a secure https address). You can still listen and play.' });
      return;
    }
    try {
      const track = await createLocalAudioTrack({
        ...(this.prefs.deviceId ? { deviceId: this.prefs.deviceId } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (this.disposed) {
        track.stop();
        return;
      }
      this.mic = track;
      track.on(TrackEvent.Ended, () => this.onMicEnded(track));
      // Re-opened on another device (DeviceWatch, or LiveKit itself on unmute / Safari default
      // switch): the VAD and announcement clones still point at the old capture.
      track.on(TrackEvent.Restarted, () => void this.onMicRestarted(track));
      await track.mute(); // applyTransmit decides
      this.patch({ mic: 'ready', micError: null, micFailure: null, micSilent: false, micLabel: track.mediaStreamTrack.label || null });
      this.setupVad();
      await this.devices.refresh(); // labels are readable now that permission is granted
      if (this.zoneRoom?.state === ConnectionState.Connected && this.zoneGrant?.canPublish) await this.publishMic(this.zoneRoom);
      if (this.announceRoom?.state === ConnectionState.Connected && this.announceGrant?.canPublish) await this.republishAnnounceTrack();
      await this.applyTransmit();
    } catch (e) {
      const f = MediaDeviceFailure.getFailure(e);
      if (f === MediaDeviceFailure.PermissionDenied) {
        this.patch({ mic: 'denied', micFailure: 'denied', micError: 'Your browser is blocking the microphone. You can still listen and play.' });
        this.watchPermission();
      } else if (f === MediaDeviceFailure.NotFound)
        this.patch({ mic: 'unavailable', micFailure: 'notfound', micError: 'No microphone found. Plug one in and voice turns on by itself — meanwhile you can listen and play.' });
      else if (f === MediaDeviceFailure.DeviceInUse)
        this.patch({ mic: 'error', micFailure: 'inuse', micError: 'Another app is using your microphone (a call or recorder?). Close it, then press Retry.' });
      else this.patch({ mic: 'error', micFailure: 'other', micError: `Your browser could not open the microphone (${(e as Error)?.message ?? 'unknown error'}). You can still listen; press Retry to try again.` });
    }
  }

  /** After a denial, retry by itself as soon as the user allows the mic in the browser UI. */
  private watchPermission() {
    const perms = navigator.permissions;
    if (!perms?.query) return;
    perms
      .query({ name: 'microphone' as PermissionName })
      .then((st) => {
        st.onchange = () => {
          if (st.state !== 'denied' && this.state.get().mic === 'denied' && !this.disposed) void this.acquireMic();
        };
      })
      .catch(() => undefined);
  }

  // -- audio devices (logic in ./deviceWatch.ts + ./devices.ts) -----------------------------

  private makeDeviceWatch(): DeviceWatch {
    const self = this;
    return new DeviceWatch({
      state: this.state,
      prefs: this.prefs,
      get audioCtx() {
        return self.audioCtx;
      },
      mic: () => this.mic,
      acquireMic: () => this.acquireMic(),
      dropMic: (t) => this.dropMic(t),
      updatePlayback: () => this.updatePlayback(),
      notify: (text, kind, ms) => this.notify(text, kind, ms),
    });
  }

  /** The microphone was unplugged / revoked / failed while in use: try another one in place first. */
  private onMicEnded(track: LocalAudioTrack) {
    if (this.mic !== track || this.disposed) return;
    this.teardownVad();
    void this.devices.micEnded(track);
  }

  /** No microphone could be re-opened: give it up (inline error + "Retry mic"; devicechange retries). */
  private dropMic(track: LocalAudioTrack) {
    if (this.mic !== track || this.disposed) return;
    this.teardownVad();
    for (const r of [this.zoneRoom]) if (r) void r.localParticipant.unpublishTrack(track, false).catch(() => undefined);
    if (this.announceTrack) {
      const old = this.announceTrack;
      this.announceTrack = null;
      void this.announceRoom?.localParticipant.unpublishTrack(old, true).catch(() => undefined);
      old.stop();
    }
    this.mic = null;
    track.stop();
    this.patch({ mic: 'unavailable', micFailure: 'ended', micError: 'Your microphone was disconnected. Plug it back in or choose another one — you can still listen.', transmitting: false, micLabel: null, micSilent: false });
    this.notify('Microphone disconnected — others can no longer hear you.', 'warn', 8000);
    this.devices.schedule('dropped');
  }

  /** The mic track now captures from another device (same publication, DTX/RED, mute state). */
  private async onMicRestarted(track: LocalAudioTrack) {
    if (this.mic !== track || this.disposed) return;
    this.setupVad();
    if (this.announceTrack) await this.republishAnnounceTrack();
    await this.applyTransmit();
  }

  // -- local voice-activity detection (talking-while-muted hint, own speaking ring, ducking) --
  private setupVad() {
    this.teardownVad();
    const ctx = this.audioCtx;
    if (!ctx || !this.mic) return;
    try {
      const track = this.mic.mediaStreamTrack.clone();
      track.enabled = true; // the clone keeps listening while the published track is muted
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an); // analysis only: never connected to the destination
      this.vad = { track, src, an, buf: new Float32Array(an.fftSize) };
    } catch {
      this.vad = null;
    }
  }

  private teardownVad() {
    if (!this.vad) return;
    try {
      this.vad.src.disconnect();
    } catch {
      /* ignore */
    }
    this.vad.track.stop();
    this.vad = null;
    this.vadLevel = 0;
  }

  private tickVad(dt: number) {
    const v = this.vad;
    if (!v || v.track.readyState !== 'live') {
      this.vadLevel = 0;
      this.devices.noteLevel(0, dt, false);
      return;
    }
    v.an.getFloatTimeDomainData(v.buf);
    let sum = 0;
    let peak = 0;
    for (const x of v.buf) {
      sum += x * x;
      const a = x < 0 ? -x : x;
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / v.buf.length);
    // Dead-input detector (exact digital silence, e.g. MacBook mic with the lid closed). Only
    // meaningful while the context runs (a suspended analyser reads zeros too).
    this.devices.noteLevel(peak, dt, this.audioCtx?.state === 'running' && this.mic?.mediaStreamTrack.readyState === 'live');
    this.vadLevel = rms;
    const voiced = rms > 0.02;
    this.vadVoicedMs = voiced ? Math.min(3000, this.vadVoicedMs + dt) : Math.max(0, this.vadVoicedMs - dt * 0.5);
    const s = this.state.get();
    const localSpeaking = s.transmitting && voiced;
    if (localSpeaking !== s.localSpeaking) this.patch({ localSpeaking });
    // Talking but nobody hears it: remind (muted: every 15 s; push-to-talk: at most once a minute).
    const canTalk = Boolean(this.zoneGrant?.canPublish) && s.link === 'connected';
    if (!s.transmitting && canTalk && this.vadVoicedMs > 800) {
      const now = performance.now();
      const ptt = !s.muted && s.inputMode === 'ptt';
      if (now - this.lastMutedHint > (ptt ? 60_000 : 15_000)) {
        this.lastMutedHint = now;
        this.notify(s.muted ? "You're muted — nobody can hear you. Press Unmute to talk." : s.deafened ? "You're deafened (and muted). Press Undeafen to talk." : `You're not transmitting — hold ${keyLabel(s.pttKey)} to talk, or switch to Open mic.`, 'warn', 5000);
      }
    }
  }

  private wantTransmit(): boolean {
    const s = this.state.get();
    const canTalk = Boolean(this.zoneGrant?.canPublish || this.announceGrant?.canPublish);
    return s.enabled && !!this.mic && canTalk && !s.muted && !s.deafened && (s.inputMode === 'open' || s.pttHeld);
  }

  private async applyTransmit() {
    const want = this.wantTransmit();
    if (this.state.get().transmitting !== want) this.patch({ transmitting: want });
    if (this.announceTrack) this.announceTrack.enabled = want;
    if (!this.mic) return;
    try {
      if (want && this.mic.isMuted) await this.mic.unmute();
      else if (!want && !this.mic.isMuted) await this.mic.mute();
    } catch {
      /* track ended (device unplugged) — MediaDevicesChanged will refresh */
    }
    this.sendStatus(false);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (e.code !== this.state.get().pttKey) return;
    if (down && (e.repeat || isTypingTarget(e.target))) return;
    this.setPtt(down);
  }

  /** On-screen hold-to-talk button (touch): same as holding the push-to-talk key. */
  holdPtt(held: boolean) {
    if (held && this.state.get().inputMode !== 'ptt') return;
    this.setPtt(held);
  }

  private setPtt(held: boolean) {
    if (this.state.get().pttHeld === held) return;
    this.patch({ pttHeld: held });
    void this.applyTransmit();
  }

  /** Synchronously stop transmitting (applyTransmit re-enables it once we may talk again). */
  private silenceMic() {
    if (!this.mic || this.mic.isMuted) return;
    this.mic.mediaStreamTrack.enabled = false;
    void this.mic.mute().catch(() => undefined);
  }

  /** Speech preset (24 kbps Opus) + DTX; RED only once the uplink measurably loses packets. */
  private publishOptions(): TrackPublishOptions {
    return { source: Track.Source.Microphone, audioPreset: AudioPresets.speech, dtx: true, red: this.red };
  }

  private async publishMic(room: Room) {
    if (!this.mic || room.localParticipant.getTrackPublication(Track.Source.Microphone)) return;
    this.redPending = false;
    this.lossPrev = null; // new sender: counters restart
    this.lossWin = LOSS_WINDOW_EMPTY;
    try {
      await room.localParticipant.publishTrack(this.mic, this.publishOptions());
    } catch (e) {
      this.patch({ lastError: `Could not publish microphone: ${(e as Error)?.message ?? e}` });
    }
  }

  private async republishAnnounceTrack() {
    const room = this.announceRoom;
    if (this.announceTrack) {
      const old = this.announceTrack;
      this.announceTrack = null;
      await room?.localParticipant.unpublishTrack(old, true).catch(() => undefined);
      old.stop();
    }
    if (!room || room.state !== ConnectionState.Connected || !this.announceGrant?.canPublish || !this.mic) return;
    const clone = this.mic.mediaStreamTrack.clone();
    clone.enabled = this.wantTransmit();
    this.announceTrack = clone;
    try {
      await room.localParticipant.publishTrack(clone, { ...this.publishOptions(), name: 'announce' });
    } catch (e) {
      this.patch({ lastError: `Could not publish announcement: ${(e as Error)?.message ?? e}` });
    }
  }

  /**
   * Uplink packet loss (RTCP receiver reports for our mic) -> RED. RED is negotiated per
   * publication and cannot be toggled on a live track, so once the loss exceeds the threshold the
   * mic is republished with RED at the next moment we are not transmitting (and every later room
   * switch publishes with RED). It stays on for the rest of the session (no flapping).
   */
  private async checkLoss() {
    const room = this.zoneRoom;
    const mic = this.mic;
    if (this.disposed || !room || !mic || room.state !== ConnectionState.Connected) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!pub || pub.track !== mic) return;
    if (!this.red) {
      let cur: SenderSample | undefined;
      try {
        cur = await mic.getSenderStats();
      } catch {
        return;
      }
      if (!cur || this.mic !== mic) return;
      const r = lossStep(this.lossWin, this.lossPrev, cur);
      this.lossPrev = cur;
      this.lossWin = r.win;
      if (r.loss === null || r.loss <= RED_LOSS_THRESHOLD) return;
      this.red = true;
      this.redPending = true;
    }
    if (!this.redPending || this.state.get().transmitting) return;
    this.redPending = false;
    await room.localParticipant.unpublishTrack(mic, false).catch(() => undefined);
    if (this.zoneRoom !== room || this.mic !== mic || room.state !== ConnectionState.Connected || !this.zoneGrant?.canPublish) return;
    await this.publishMic(room);
    await this.applyTransmit();
    if (this.announceTrack) await this.republishAnnounceTrack();
  }

  // ---------------------------------------------------------------------------------------
  // Server messages

  async onGrant(g: VoiceGrant) {
    if (this.disposed) return;
    this.patch({ availability: 'available', availabilityMessage: null });
    if (g.purpose === 'announce') {
      const same = this.announceRoom && this.announceGrant?.room === g.room;
      this.announceGrant = g;
      this.patch({ announce: { ...this.state.get().announce, room: g.room, canPublish: g.canPublish } });
      if (!this.state.get().enabled) return;
      if (same && this.announceRoom!.state !== ConnectionState.Disconnected) return; // token refresh
      await this.connectAnnounce(g);
      return;
    }
    const same = this.zoneRoom && this.zoneGrant?.room === g.room;
    const publishChanged = this.zoneGrant?.canPublish !== g.canPublish;
    this.zoneGrant = g;
    this.patch({ zone: g.zone, room: g.room, mode: g.mode, canPublish: g.canPublish });
    if (!this.state.get().enabled) return;
    if (same && this.zoneRoom!.state !== ConnectionState.Disconnected) {
      // Token refresh (or reconnect re-delivery) for the room we are already in.
      if (publishChanged && this.zoneRoom!.state === ConnectionState.Connected) {
        if (g.canPublish) await this.publishMic(this.zoneRoom!);
        else if (this.mic) await this.zoneRoom!.localParticipant.unpublishTrack(this.mic, false).catch(() => undefined);
      }
      void this.applyTransmit();
      return;
    }
    await this.connectZone(g);
  }

  async onRevoke(r: VoiceRevoke) {
    if (r.purpose === 'announce') {
      if (this.announceGrant?.room !== r.room) return;
      this.announceGrant = null;
      this.announceSeq++;
      const room = this.announceRoom;
      this.announceRoom = null;
      if (this.announceTrack) {
        this.announceTrack.stop();
        this.announceTrack = null;
      }
      this.patch({ announce: { room: null, canPublish: false, link: 'idle' } });
      if (room) await this.leaveRoom(room);
      this.refreshParticipants(true);
      void this.applyTransmit();
      return;
    }
    if (this.zoneGrant?.room !== r.room) return;
    this.zoneGrant = null;
    this.zoneSeq++;
    this.clearReconnect();
    // Stop sending into the old room right now (before the disconnect handshake completes).
    this.silenceMic();
    const room = this.zoneRoom;
    this.zoneRoom = null;
    this.patch({ zone: null, room: null, mode: null, canPublish: false, link: 'idle' });
    if (room) {
      const p = this.leaveRoom(room);
      this.leaving = p;
      await p;
      if (this.leaving === p) this.leaving = null;
    }
    this.refreshParticipants(true);
    void this.applyTransmit();
  }

  // ---------------------------------------------------------------------------------------
  // LiveKit rooms

  private makeRoom(kind: 'zone' | 'announce'): Room {
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      stopLocalTrackOnUnpublish: false,
      disconnectOnPageLeave: true,
      webAudioMix: this.audioCtx ? { audioContext: this.audioCtx } : false,
    });
    const isCurrent = () => (kind === 'zone' ? this.zoneRoom === room : this.announceRoom === room);
    const setLink = (link: LinkState) => {
      if (!isCurrent()) return;
      if (kind === 'zone') this.patch({ link });
      else this.patch({ announce: { ...this.state.get().announce, link } });
      this.sendStatus(false);
    };
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
        if (track.kind !== Track.Kind.Audio || !this.container) return;
        const el = track.attach();
        el.setAttribute('data-pid', participant.identity);
        this.container.appendChild(el);
        // Start silent and let the gain loop fade in (no pop on room switch / arrival / un-cull).
        if (kind === 'zone') {
          this.gains.set(participant.identity, 0);
          this.applied.delete(participant.identity);
          participant.setVolume(0);
        }
        this.refreshParticipants(true);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        for (const el of track.detach()) el.remove();
        this.refreshParticipants(true);
      })
      .on(RoomEvent.ParticipantConnected, () => this.refreshParticipants(true))
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        if (kind === 'zone') {
          this.gains.delete(p.identity);
          this.applied.delete(p.identity);
          this.quality.delete(p.identity);
          this.cull.delete(p.identity);
        }
        this.refreshParticipants(true);
      })
      .on(RoomEvent.TrackMuted, () => this.refreshParticipants(true))
      .on(RoomEvent.TrackUnmuted, () => this.refreshParticipants(true))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        if (!isCurrent()) return;
        const local = room.localParticipant.identity;
        if (kind === 'zone') {
          for (const id of [...this.speakers]) if (!id.startsWith('a:')) this.speakers.delete(id);
          for (const p of speakers) this.speakers.add(p.identity);
          if (!this.vad) this.patch({ localSpeaking: speakers.some((p) => p.identity === local) });
        } else {
          for (const id of [...this.speakers]) if (id.startsWith('a:')) this.speakers.delete(id);
          for (const p of speakers) this.speakers.add(`a:${p.identity}`);
        }
        this.refreshParticipants(true);
      })
      .on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p: Participant) => {
        if (kind === 'zone' && isCurrent()) this.quality.set(p.identity === room.localParticipant.identity ? '' : p.identity, q);
      })
      .on(RoomEvent.Reconnecting, () => setLink('reconnecting'))
      .on(RoomEvent.Reconnected, () => setLink('connected'))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (isCurrent()) this.updatePlayback();
      })
      .on(RoomEvent.MediaDevicesChanged, () => this.devices.schedule('devicechange'))
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (!isCurrent()) return;
        this.detachAll(room);
        this.refreshParticipants(true);
        if (reason === DisconnectReason.CLIENT_INITIATED) return;
        if (reason === DisconnectReason.PARTICIPANT_REMOVED || reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.DUPLICATE_IDENTITY) {
          // Server-side revocation (zone change / quota / another tab): wait for a new grant.
          setLink('disconnected');
          return;
        }
        setLink('reconnecting');
        if (kind === 'zone') this.scheduleReconnect();
        else if (this.announceGrant) setTimeout(() => this.announceGrant && void this.connectAnnounce(this.announceGrant), 2000);
      });
    return room;
  }

  private async connectZone(g: VoiceGrant) {
    const seq = ++this.zoneSeq;
    this.clearReconnect();
    const old = this.zoneRoom;
    this.zoneRoom = null;
    this.cull.clear(); // per room: a new connection auto-subscribes to everyone the token allows
    if (old) {
      if (old.name !== g.room) this.silenceMic();
      await this.leaveRoom(old);
    }
    // Never be connected to two zone rooms at once: finish leaving a just-revoked room first.
    if (this.leaving) await this.leaving.catch(() => undefined);
    if (seq !== this.zoneSeq || this.disposed) return;
    const room = this.makeRoom('zone');
    this.zoneRoom = room;
    this.patch({ link: 'connecting', lastError: null });
    try {
      await room.connect(g.url, g.token, { autoSubscribe: true });
      if (seq !== this.zoneSeq || this.disposed) {
        await room.disconnect(false).catch(() => undefined);
        return;
      }
      if (this.reconnectAttempt > 1) this.notify('Voice reconnected.');
      this.reconnectAttempt = 0;
      this.patch({ link: 'connected', lastError: null });
      this.updatePlayback();
      if (g.canPublish) await this.publishMic(room);
      await room.startAudio().catch(() => undefined);
      this.updatePlayback();
      await this.applyTransmit();
      this.refreshParticipants(true);
    } catch (e) {
      if (seq !== this.zoneSeq) return;
      this.patch({ link: 'error', lastError: `Voice connection failed: ${(e as Error)?.message ?? e}` });
      this.scheduleReconnect();
    }
    this.sendStatus(false);
  }

  private async connectAnnounce(g: VoiceGrant) {
    const seq = ++this.announceSeq;
    const old = this.announceRoom;
    this.announceRoom = null;
    if (old) await this.leaveRoom(old);
    if (seq !== this.announceSeq || this.disposed) return;
    const room = this.makeRoom('announce');
    this.announceRoom = room;
    this.patch({ announce: { room: g.room, canPublish: g.canPublish, link: 'connecting' } });
    try {
      await room.connect(g.url, g.token, { autoSubscribe: true });
      if (seq !== this.announceSeq || this.disposed) {
        await room.disconnect(true).catch(() => undefined);
        return;
      }
      this.patch({ announce: { room: g.room, canPublish: g.canPublish, link: 'connected' } });
      if (g.canPublish) await this.republishAnnounceTrack();
      await room.startAudio().catch(() => undefined);
      await this.applyTransmit();
    } catch {
      if (seq === this.announceSeq) this.patch({ announce: { room: g.room, canPublish: g.canPublish, link: 'error' } });
    }
  }

  private detachAll(room: Room) {
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        const t = pub.track;
        if (t && t.kind === Track.Kind.Audio) for (const el of t.detach()) el.remove();
      }
    }
  }

  private async leaveRoom(room: Room) {
    this.detachAll(room);
    // stopTracks=false: the shared microphone track survives room switches.
    await room.disconnect(false).catch(() => undefined);
    this.sendStatus(false);
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleReconnect() {
    if (this.disposed || !this.zoneGrant || this.reconnectTimer) return;
    // Never give up while we hold a grant (the server refreshes its token): back off to 15 s.
    const delay = Math.min(15_000, 1000 * 2 ** Math.min(4, this.reconnectAttempt++));
    this.patch({ link: 'reconnecting', ...(this.reconnectAttempt > 4 ? { lastError: 'Voice keeps dropping — check your internet connection. It reconnects by itself; no need to reload.' } : {}) });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.zoneGrant) void this.connectZone(this.zoneGrant);
    }, delay);
  }

  /** Manual reconnect button. */
  reconnect() {
    this.reconnectAttempt = 0;
    if (this.zoneGrant && this.state.get().enabled) void this.connectZone(this.zoneGrant);
  }

  // ---------------------------------------------------------------------------------------
  // Gains, subscription culling, participants, heartbeat

  private userVolume(pid: string) {
    return this.prefs.volumes[pid] ?? 1;
  }

  /**
   * Street rooms: stop receiving talkers far out of earshot, receive them again when they come
   * back within the audible radius. Only microphone publications we unsubscribed ourselves are
   * ever resubscribed; outside proximity mode everything we culled is restored.
   */
  private applyCull(p: RemoteParticipant, distPx: number, proximity: boolean, now: number) {
    const prev = this.cull.get(p.identity) ?? CULL_INITIAL;
    const next = proximity ? cullStep(prev, distPx, now) : CULL_INITIAL;
    if (next !== prev) this.cull.set(p.identity, next);
    if (!next.culled && !prev.culled) return;
    const pub = p.getTrackPublication(Track.Source.Microphone);
    if (!pub) return;
    // Culled: keep it dropped (also a track republished meanwhile, which auto-subscribes).
    if (next.culled) {
      if (pub.isDesired) pub.setSubscribed(false);
    } else if (!pub.isDesired) {
      pub.setSubscribed(true);
    }
  }

  private tickGains() {
    const now = performance.now();
    const dt = this.lastTick ? Math.min(250, now - this.lastTick) : GAIN_TICK_MS;
    this.lastTick = now;
    this.tickVad(dt);
    const s = this.state.get();
    const room = this.zoneRoom;
    if (room && room.state === ConnectionState.Connected) {
      const me = localPlayer.get();
      const proximity = s.mode === 'proximity';
      for (const p of room.remoteParticipants.values()) {
        let target = 1;
        let dist = Infinity;
        if (proximity) {
          const e = remoteEntities.get(p.identity);
          if (e && e.location === 'outdoors' && me.location === 'outdoors') dist = distancePx(me, e);
          target = attenuationGain(dist);
        }
        this.applyCull(p, dist, proximity, now);
        const g = smoothGain(this.gains.get(p.identity) ?? 0, target, dt);
        this.gains.set(p.identity, g);
        const vol = s.deafened ? 0 : g * this.userVolume(p.identity);
        const prev = this.applied.get(p.identity);
        if (prev === undefined || Math.abs(prev - vol) > 0.002) {
          p.setVolume(vol);
          this.applied.set(p.identity, vol);
        }
      }
    }
    const ann = this.announceRoom;
    if (ann && ann.state === ConnectionState.Connected) {
      for (const p of ann.remoteParticipants.values()) {
        const key = `a:${p.identity}`;
        const vol = s.deafened ? 0 : this.userVolume(p.identity);
        if (this.applied.get(key) !== vol) {
          p.setVolume(vol);
          this.applied.set(key, vol);
        }
      }
    }
    this.refreshParticipants(false);
    this.publishActivity(now);
  }

  /** voiceActivity store (~10 Hz): what the local player hears right now, or their own voice. */
  private publishActivity(now: number) {
    if (now - this.lastActivityAt < 100) return;
    this.lastActivityAt = now;
    const s = this.state.get();
    let level = 0;
    if (!s.deafened) {
      const room = this.zoneRoom;
      if (room && room.state === ConnectionState.Connected)
        for (const p of room.remoteParticipants.values()) {
          if (!p.isSpeaking && p.audioLevel <= 0) continue;
          const g = s.mode === 'proximity' ? (this.gains.get(p.identity) ?? 0) : 1;
          level = Math.max(level, Math.min(1, p.audioLevel * g * this.userVolume(p.identity)));
        }
      const ann = this.announceRoom;
      if (ann && ann.state === ConnectionState.Connected) for (const p of ann.remoteParticipants.values()) level = Math.max(level, Math.min(1, p.audioLevel * this.userVolume(p.identity)));
    }
    if (s.transmitting) level = Math.max(level, Math.min(1, this.vadLevel * 5));
    const anyoneSpeaking = level > 0.02;
    const r = Math.round(level * 100) / 100;
    const prev = voiceActivity.get();
    if (prev.anyoneSpeaking !== anyoneSpeaking || Math.abs(prev.level - r) >= 0.01) voiceActivity.set({ anyoneSpeaking, level: r });
  }

  /** Who hears me: everyone in my room; in the street only those near enough (with hysteresis). */
  private computeHeardBy(): string[] {
    const s = this.state.get();
    const out: string[] = [];
    const room = this.zoneRoom;
    if (room && room.state === ConnectionState.Connected) {
      for (const p of room.remoteParticipants.values()) {
        if (s.mode !== 'proximity') {
          out.push(p.identity);
          continue;
        }
        const g = this.gains.get(p.identity) ?? 0;
        const was = this.heard.has(p.identity);
        if (g >= 0.06 || (was && g >= 0.03)) out.push(p.identity);
      }
    }
    if (this.announceGrant?.canPublish && this.announceRoom) for (const p of this.announceRoom.remoteParticipants.values()) if (!out.includes(p.identity)) out.push(p.identity);
    this.heard = new Set(out);
    return out;
  }

  /** Debounced speaking ids (remote identities, 'a:'-prefixed announcers, '@self'). */
  private heldSpeakers(now: number): ReadonlySet<string> {
    const raw = this.state.get().localSpeaking ? [...this.speakers, '@self'] : this.speakers;
    return this.speakingHold.update(raw, now);
  }

  private refreshParticipants(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastUi < UI_REFRESH_MS) return;
    this.lastUi = now;
    const proximity = this.state.get().mode === 'proximity';
    const held = this.heldSpeakers(now);
    const list: VoiceParticipantView[] = [];
    /** Unrounded gains for the in-world speaking rings. */
    const rawGain = new Map<string, number>();
    const seen = new Set<string>();
    const zone = this.zoneRoom;
    if (zone) {
      for (const p of zone.remoteParticipants.values()) {
        seen.add(p.identity);
        const pub = p.getTrackPublication(Track.Source.Microphone);
        const gain = proximity ? (this.gains.get(p.identity) ?? 0) : 1;
        rawGain.set(p.identity, gain);
        list.push({
          pid: p.identity,
          speaking: held.has(p.identity),
          gain: roundGain(gain),
          volume: this.userVolume(p.identity),
          micMuted: !pub || pub.isMuted,
          announce: false,
        });
      }
    }
    const ann = this.announceRoom;
    if (ann) {
      for (const p of ann.remoteParticipants.values()) {
        if (p.trackPublications.size === 0) continue; // listeners
        const speaking = held.has(`a:${p.identity}`);
        const existing = list.find((x) => x.pid === p.identity);
        if (existing) {
          existing.announce = true;
          existing.speaking ||= speaking;
        } else if (!seen.has(p.identity)) {
          list.push({ pid: p.identity, speaking, gain: 1, volume: this.userVolume(p.identity), micMuted: false, announce: true });
        }
      }
    }
    const heardBy = this.computeHeardBy();
    const prev = this.state.get();
    const sameHeard = prev.heardBy.length === heardBy.length && prev.heardBy.every((x, i) => x === heardBy[i]);
    // Only publish a new state object when something the panel shows changed (it re-renders on
    // every patch; this ran 5x/s unconditionally).
    const sameList = sameParticipants(prev.participants, list);
    if (!sameList || !sameHeard) this.patch({ ...(sameList ? {} : { participants: list }), ...(sameHeard ? {} : { heardBy }) });
    const s = this.state.get();
    // In-world indicators: only people this client actually hears (not deafened, mic not muted, my
    // volume for them > 0, in the street loud enough — which also excludes culled talkers).
    const speaking = s.deafened ? [] : list.filter((x) => x.speaking && (x.announce || !x.micMuted) && x.volume > 0 && (!proximity || x.announce || (rawGain.get(x.pid) ?? 1) > 0.05)).map((x) => x.pid);
    const selfPid = this.zoneRoom?.localParticipant.identity || null;
    if (s.transmitting && held.has('@self') && selfPid) speaking.push(selfPid);
    const presence = { speaking, selfPid, selfMuted: s.enabled && (s.muted || s.deafened), selfTransmitting: s.transmitting, heardBy: s.heardBy };
    const key = JSON.stringify(presence);
    if (key !== this.lastPresenceKey) {
      this.lastPresenceKey = key;
      voicePresence.set(presence);
    }
  }

  private sendStatus(force: boolean) {
    if (this.disposed) return;
    const s = this.state.get();
    const connected = !!this.zoneRoom && this.zoneRoom.state === ConnectionState.Connected;
    const room = connected ? (this.zoneGrant?.room ?? undefined) : undefined;
    const publishing = connected && s.transmitting;
    const key = `${connected}|${publishing}|${room ?? ''}`;
    if (!s.enabled) return;
    if (!force && key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.host.conn.send('voice:status', { connected, publishing, ...(room ? { room } : {}) });
  }

  /** Debug overlay snapshot. */
  debugInfo(): VoiceDebugInfo {
    const s = this.state.get();
    return {
      zone: s.zone,
      room: s.room,
      mode: s.mode,
      link: s.link,
      zoneRoomState: this.zoneRoom?.state ?? 'none',
      announceRoom: s.announce.room,
      announceState: this.announceRoom?.state ?? 'none',
      tokenExpiresIn: this.zoneGrant ? Math.round((this.zoneGrant.expiresAt - Date.now()) / 1000) : null,
      micMuted: this.mic?.isMuted ?? null,
      audioContext: this.audioCtx?.state ?? 'none',
      quality: this.quality.get('') ?? 'unknown',
      red: this.red,
      gains: [...this.gains.entries()].map(([pid, g]) => ({
        pid,
        gain: Math.round(g * 100) / 100,
        applied: Math.round((this.applied.get(pid) ?? 0) * 100) / 100,
        quality: this.quality.get(pid) ?? 'unknown',
        culled: this.cull.get(pid)?.culled ?? false,
      })),
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    if (this.state.get().enabled) this.host.conn.send('voice:status', { connected: false, publishing: false });
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs = [];
    if (this.gainTimer) clearInterval(this.gainTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.lossTimer) clearInterval(this.lossTimer);
    this.clearReconnect();
    // No stale talking rings in town after voice goes away (lobby switch / leave).
    this.speakingHold.clear();
    voicePresence.set({ speaking: [], selfPid: null, selfMuted: false, selfTransmitting: false, heardBy: [] });
    this.lastPresenceKey = '';
    const rooms = [this.zoneRoom, this.announceRoom];
    this.zoneRoom = null;
    this.announceRoom = null;
    for (const r of rooms) if (r) await r.disconnect(true).catch(() => undefined);
    this.announceTrack?.stop();
    this.teardownVad();
    this.mic?.stop();
    this.mic = null;
    this.container?.remove();
    await this.audioCtx?.close().catch(() => undefined);
  }
}
