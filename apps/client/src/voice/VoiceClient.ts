// OWNED BY voice. Browser side of proximity/private voice.
//
// The server decides which LiveKit room we may join (voice:grant / voice:revoke); this class only
// follows those decisions: one zone room at a time (+ an optional listen-only announcement
// overlay), a single microphone track that survives room switches, push-to-talk / open mic,
// per-participant volume, deafen, and client-side distance attenuation in the 'street' room.
// Client attenuation is NOT a privacy boundary — private rooms are separate LiveKit rooms.
import {
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
  type RemoteTrack,
} from 'livekit-client';
import type { AcousticZoneId, VoiceGrant, VoiceMode, VoiceRevoke, VoiceUnavailable } from '@ct/protocol';
import { attenuationGain, distancePx, smoothGain, VOICE_DEFAULTS } from '@ct/voice/shared';
import { localPlayer, remoteEntities } from '../net/localPlayer';
import type { RoomConnection } from '../net/room';
import { createStore, type Store } from '../net/store';

export type MicState = 'off' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error';
/** Why the microphone is not available (drives the recovery instructions in the panel). */
export type MicFailure = 'denied' | 'notfound' | 'inuse' | 'insecure' | 'ended' | 'other';
export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other';

export function browserKind(ua = navigator.userAgent): BrowserKind {
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\/|Chromium\/|CriOS\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

/**
 * Voice activity for audio ducking (ambience). ~10 Hz. `level` (0..1) is the loudest thing the
 * local player currently hears (remote LiveKit audio level x street attenuation x user volume,
 * 0 when deafened) or their own mic while transmitting.
 */
export const voiceActivity = createStore<{ anyoneSpeaking: boolean; level: number }>({ anyoneSpeaking: false, level: 0 });

/**
 * Per-avatar voice state for in-world indicators (TownScene may draw a ring on speaking avatars and
 * a muted-mic icon over the local player). ~5 Hz, only changes are published.
 */
export const voicePresence = createStore<{ speaking: string[]; selfPid: string | null; selfMuted: boolean; selfTransmitting: boolean; heardBy: string[] }>({
  speaking: [],
  selfPid: null,
  selfMuted: false,
  selfTransmitting: false,
  heardBy: [],
});
export type LinkState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface VoiceParticipantView {
  pid: string;
  speaking: boolean;
  /** Smoothed distance attenuation (1 outside street mode). */
  gain: number;
  /** User volume 0..1.5. */
  volume: number;
  micMuted: boolean;
  /** Heard through the announcement overlay. */
  announce: boolean;
}

export interface VoiceClientState {
  enabled: boolean;
  availability: 'unknown' | 'available' | VoiceUnavailable['reason'];
  availabilityMessage: string | null;
  link: LinkState;
  zone: AcousticZoneId | null;
  room: string | null;
  mode: VoiceMode | null;
  canPublish: boolean;
  mic: MicState;
  micError: string | null;
  inputMode: 'ptt' | 'open';
  pttKey: string;
  pttHeld: boolean;
  muted: boolean;
  deafened: boolean;
  transmitting: boolean;
  localSpeaking: boolean;
  devices: { deviceId: string; label: string }[];
  deviceId: string | null;
  participants: VoiceParticipantView[];
  announce: { room: string | null; canPublish: boolean; link: LinkState };
  playbackBlocked: boolean;
  lastError: string | null;
  micFailure: MicFailure | null;
  /** pids that currently hear me (room members; in the street only those near enough). */
  heardBy: string[];
  /** Transient message for the player (toast). */
  notice: { id: number; text: string; kind: 'info' | 'warn' } | null;
}

interface Prefs {
  inputMode: 'ptt' | 'open';
  pttKey: string;
  deviceId: string | null;
  volumes: Record<string, number>;
}

const PREFS_KEY = 'ct.voice.prefs';
/** sessionStorage flag: voice was enabled in this tab, so a reload re-enables it automatically. */
const SESSION_ON_KEY = 'ct.voice.on';
const GAIN_TICK_MS = 50;
const UI_REFRESH_MS = 200;

function loadPrefs(): Prefs {
  const d: Prefs = { inputMode: 'ptt', pttKey: 'KeyV', deviceId: null, volumes: {} };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      inputMode: p.inputMode === 'open' ? 'open' : 'ptt',
      pttKey: typeof p.pttKey === 'string' && /^[A-Za-z0-9]{1,24}$/.test(p.pttKey) ? p.pttKey : d.pttKey,
      deviceId: typeof p.deviceId === 'string' ? p.deviceId : null,
      volumes: p.volumes && typeof p.volumes === 'object' ? p.volumes : {},
    };
  } catch {
    return d;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: prefs are a convenience only */
  }
}

function sessionFlag(set?: boolean): boolean {
  try {
    if (set === true) sessionStorage.setItem(SESSION_ON_KEY, '1');
    else if (set === false) sessionStorage.removeItem(SESSION_ON_KEY);
    return sessionStorage.getItem(SESSION_ON_KEY) === '1';
  } catch {
    return false;
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/(Left|Right)$/, '');
}

export class VoiceClient {
  readonly state: Store<VoiceClientState>;
  private prefs = loadPrefs();
  private zoneGrant: VoiceGrant | null = null;
  private announceGrant: VoiceGrant | null = null;
  private zoneRoom: Room | null = null;
  private announceRoom: Room | null = null;
  private zoneSeq = 0;
  private announceSeq = 0;
  private audioCtx: AudioContext | null = null;
  private mic: LocalAudioTrack | null = null;
  private announceTrack: MediaStreamTrack | null = null;
  private gains = new Map<string, number>();
  private applied = new Map<string, number>();
  private speakers = new Set<string>();
  /** LiveKit connection quality per identity ('' = local) — debug overlay only. */
  private quality = new Map<string, ConnectionQuality>();
  private container: HTMLDivElement | null = null;
  private offs: (() => void)[] = [];
  private gainTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
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
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityAt = 0;
  private lastPresenceKey = '';

  constructor(private readonly conn: RoomConnection) {
    this.state = createStore<VoiceClientState>({
      enabled: false,
      availability: 'unknown',
      availabilityMessage: null,
      link: 'idle',
      zone: null,
      room: null,
      mode: null,
      canPublish: false,
      mic: 'off',
      micError: null,
      inputMode: this.prefs.inputMode,
      pttKey: this.prefs.pttKey,
      pttHeld: false,
      muted: false,
      deafened: false,
      transmitting: false,
      localSpeaking: false,
      devices: [],
      deviceId: this.prefs.deviceId,
      participants: [],
      announce: { room: null, canPublish: false, link: 'idle' },
      playbackBlocked: false,
      lastError: null,
      micFailure: null,
      heardBy: [],
      notice: null,
    });
    this.offs.push(
      conn.events.on('voice:grant', (g) => void this.onGrant(g)),
      conn.events.on('voice:revoke', (r) => void this.onRevoke(r)),
      conn.events.on('voice:unavailable', (u) => this.onUnavailable(u)),
    );
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
    // A microphone plugged in / out: recover without a reload.
    const devchange = () => void this.onDeviceChange();
    navigator.mediaDevices?.addEventListener?.('devicechange', devchange);
    this.offs.push(() => navigator.mediaDevices?.removeEventListener?.('devicechange', devchange));
    this.offs.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', gesture, true);
      window.removeEventListener('keydown', gesture, true);
      window.removeEventListener('online', online);
    });
    // Voice was on before a reload of this tab: turn it back on (the mic permission is already
    // granted; audio playback starts now or on the next click/key press).
    if (sessionFlag()) queueMicrotask(() => void this.enable());
  }

  private patch(p: Partial<VoiceClientState>) {
    this.state.set((s) => ({ ...s, ...p }));
  }

  /** Show a short message to the player (auto-hides). */
  notify(text: string, kind: 'info' | 'warn' = 'info', ms = 6000) {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    const id = (this.state.get().notice?.id ?? 0) + 1;
    this.patch({ notice: { id, text, kind } });
    this.noticeTimer = setTimeout(() => {
      if (this.state.get().notice?.id === id) this.patch({ notice: null });
    }, ms);
  }

  dismissNotice() {
    this.patch({ notice: null });
  }

  // ---------------------------------------------------------------------------------------
  // User actions

  /** Call from a user gesture (click): unlocks audio and asks for the microphone. Also called
   * without a gesture after a reload (see sessionFlag); playback then waits for the next gesture. */
  async enable(): Promise<void> {
    if (this.state.get().enabled || this.disposed) return;
    sessionFlag(true);
    // AudioContext must be created synchronously inside the gesture.
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      try {
        const ctx = new Ctx();
        this.audioCtx = ctx;
        // Remote audio is mixed through this context: if it is not running (autoplay policy,
        // Safari, a reload without a gesture, no output device) nothing is audible — surface it.
        ctx.addEventListener('statechange', () => this.updatePlayback());
        void ctx.resume().catch(() => undefined).finally(() => this.updatePlayback());
      } catch {
        this.audioCtx = null;
      }
    }
    this.container = document.createElement('div');
    this.container.style.display = 'none';
    this.container.setAttribute('data-ct-voice-audio', '');
    document.body.appendChild(this.container);
    this.patch({ enabled: true });
    this.gainTimer = setInterval(() => this.tickGains(), GAIN_TICK_MS);
    this.heartbeatTimer = setInterval(() => this.sendStatus(true), VOICE_DEFAULTS.heartbeatMs);
    const micP = this.acquireMic();
    if (this.zoneGrant) void this.connectZone(this.zoneGrant);
    if (this.announceGrant) void this.connectAnnounce(this.announceGrant);
    await micP;
  }

  async retryMic(): Promise<void> {
    if (!this.state.get().enabled) return this.enable();
    await this.acquireMic();
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

  setInputMode(mode: 'ptt' | 'open') {
    this.prefs.inputMode = mode;
    savePrefs(this.prefs);
    this.patch({ inputMode: mode });
    void this.applyTransmit();
  }

  setPttKey(code: string) {
    if (!/^[A-Za-z0-9]{1,24}$/.test(code)) return;
    this.prefs.pttKey = code;
    savePrefs(this.prefs);
    this.patch({ pttKey: code, pttHeld: false });
    void this.applyTransmit();
  }

  setMuted(muted: boolean) {
    this.patch({ muted });
    void this.applyTransmit();
  }

  setDeafened(deafened: boolean) {
    this.patch({ deafened });
    this.applied.clear(); // force re-apply of every volume
    void this.applyTransmit();
  }

  setVolume(pid: string, volume: number) {
    const v = Math.max(0, Math.min(1.5, volume));
    this.prefs.volumes[pid] = v;
    savePrefs(this.prefs);
    this.applied.delete(pid);
    this.refreshParticipants(true);
  }

  async setDevice(deviceId: string) {
    this.prefs.deviceId = deviceId || null;
    savePrefs(this.prefs);
    this.patch({ deviceId: deviceId || null });
    if (!this.mic) {
      await this.acquireMic();
      return;
    }
    try {
      await this.mic.setDeviceId(deviceId);
      this.setupVad();
      await this.republishAnnounceTrack();
    } catch (e) {
      this.notify(`Could not switch to that microphone (${(e as Error)?.message ?? e}). Pick another one.`, 'warn');
    }
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
      await track.mute(); // applyTransmit decides
      this.patch({ mic: 'ready', micError: null, micFailure: null });
      this.setupVad();
      await this.refreshDevices();
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

  /** The microphone was unplugged / revoked while in use. */
  private onMicEnded(track: LocalAudioTrack) {
    if (this.mic !== track || this.disposed) return;
    this.teardownVad();
    for (const r of [this.zoneRoom]) if (r) void r.localParticipant.unpublishTrack(track, false).catch(() => undefined);
    this.mic = null;
    track.stop();
    this.patch({ mic: 'unavailable', micFailure: 'ended', micError: 'Your microphone was disconnected. Plug it back in or choose another one — you can still listen.', transmitting: false });
    this.notify('Microphone disconnected — others can no longer hear you.', 'warn', 8000);
    void this.onDeviceChange();
  }

  private async onDeviceChange() {
    if (!this.state.get().enabled || this.disposed) return;
    await this.refreshDevices();
    const s = this.state.get();
    if (!this.mic && (s.micFailure === 'notfound' || s.micFailure === 'ended') && s.devices.length > 0) {
      await this.acquireMic();
      if (this.mic) this.notify('Microphone found — voice is back on.');
      return;
    }
    // The chosen device vanished: fall back to the default one.
    if (this.mic && s.deviceId && !s.devices.some((d) => d.deviceId === s.deviceId) && s.devices.length > 0) {
      await this.setDevice('');
      this.notify('Your selected microphone was unplugged — switched to the default microphone.', 'warn');
    }
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
      return;
    }
    v.an.getFloatTimeDomainData(v.buf);
    let sum = 0;
    for (const x of v.buf) sum += x * x;
    const rms = Math.sqrt(sum / v.buf.length);
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

  private async refreshDevices() {
    try {
      const list = await Room.getLocalDevices('audioinput', false);
      this.patch({ devices: list.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` })) });
    } catch {
      /* ignore */
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

  private async publishMic(room: Room) {
    if (!this.mic || room.localParticipant.getTrackPublication(Track.Source.Microphone)) return;
    try {
      await room.localParticipant.publishTrack(this.mic, { source: Track.Source.Microphone, dtx: true, red: true });
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
      await room.localParticipant.publishTrack(clone, { source: Track.Source.Microphone, name: 'announce', dtx: true });
    } catch (e) {
      this.patch({ lastError: `Could not publish announcement: ${(e as Error)?.message ?? e}` });
    }
  }

  // ---------------------------------------------------------------------------------------
  // Server messages

  private async onGrant(g: VoiceGrant) {
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

  private async onRevoke(r: VoiceRevoke) {
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

  private onUnavailable(u: VoiceUnavailable) {
    this.patch({ availability: u.reason, availabilityMessage: u.message });
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
        // Start silent and let the gain loop fade in (no pop on room switch / arrival).
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
      .on(RoomEvent.MediaDevicesChanged, () => void this.refreshDevices())
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
  // Gains, participants, heartbeat

  private userVolume(pid: string) {
    return this.prefs.volumes[pid] ?? 1;
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
      for (const p of room.remoteParticipants.values()) {
        let target = 1;
        if (s.mode === 'proximity') {
          const e = remoteEntities.get(p.identity);
          target = e && e.location === 'outdoors' && me.location === 'outdoors' ? attenuationGain(distancePx(me, e)) : 0;
        }
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

  private refreshParticipants(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastUi < UI_REFRESH_MS) return;
    this.lastUi = now;
    const list: VoiceParticipantView[] = [];
    const seen = new Set<string>();
    const zone = this.zoneRoom;
    if (zone) {
      for (const p of zone.remoteParticipants.values()) {
        seen.add(p.identity);
        const pub = p.getTrackPublication(Track.Source.Microphone);
        list.push({
          pid: p.identity,
          speaking: this.speakers.has(p.identity),
          gain: this.state.get().mode === 'proximity' ? (this.gains.get(p.identity) ?? 0) : 1,
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
        const speaking = this.speakers.has(`a:${p.identity}`);
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
    const prevHeard = this.state.get().heardBy;
    const sameHeard = prevHeard.length === heardBy.length && prevHeard.every((x, i) => x === heardBy[i]);
    this.patch({ participants: list, ...(sameHeard ? {} : { heardBy }) });
    const s = this.state.get();
    const speaking = list.filter((x) => x.speaking && (s.mode !== 'proximity' || x.gain > 0.05)).map((x) => x.pid);
    const selfPid = this.zoneRoom?.localParticipant.identity || null;
    if (s.localSpeaking && selfPid) speaking.push(selfPid);
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
    this.conn.send('voice:status', { connected, publishing, ...(room ? { room } : {}) });
  }

  /** Debug overlay snapshot. */
  debugInfo() {
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
      gains: [...this.gains.entries()].map(([pid, g]) => ({
        pid,
        gain: Math.round(g * 100) / 100,
        applied: Math.round((this.applied.get(pid) ?? 0) * 100) / 100,
        quality: this.quality.get(pid) ?? 'unknown',
      })),
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    if (this.state.get().enabled) this.conn.send('voice:status', { connected: false, publishing: false });
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs = [];
    if (this.gainTimer) clearInterval(this.gainTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.clearReconnect();
    const rooms = [this.zoneRoom, this.announceRoom];
    this.zoneRoom = null;
    this.announceRoom = null;
    for (const r of rooms) if (r) await r.disconnect(true).catch(() => undefined);
    this.announceTrack?.stop();
    this.teardownVad();
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.mic?.stop();
    this.mic = null;
    this.container?.remove();
    await this.audioCtx?.close().catch(() => undefined);
  }
}
