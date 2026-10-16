// OWNED BY voice. Browser side of proximity/private voice — the small, always-loaded half.
//
// The server decides which LiveKit room we may join (voice:grant / voice:revoke); the client only
// follows those decisions. This module holds what the panel and the rest of the app need before
// voice is switched on (state store, grants received so far, prefs, the voiceActivity /
// voicePresence stores). Everything that needs `livekit-client` (~125 KiB br) lives in
// ./VoiceEngine, which is import()ed when the player presses "Enable voice" (or on a reload of a
// tab that had voice on). Client attenuation is NOT a privacy boundary — private rooms are
// separate LiveKit rooms.
import type { AcousticZoneId, VoiceGrant, VoiceMode, VoiceRevoke, VoiceUnavailable } from '@ct/protocol';
import type { RoomConnection } from '../net/room';
import { createStore, type Store } from '../net/store';
import type { VoiceEngine } from './VoiceEngine';

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
  /** Smoothed distance attenuation, rounded to 0.05 (1 outside street mode). */
  gain: number;
  /** User volume 0..1.5. */
  volume: number;
  micMuted: boolean;
  /** Heard through the announcement overlay. */
  announce: boolean;
}

export interface VoiceClientState {
  enabled: boolean;
  /** "Enable voice" pressed; the LiveKit part is still downloading. */
  loading: boolean;
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

export interface Prefs {
  inputMode: 'ptt' | 'open';
  pttKey: string;
  deviceId: string | null;
  volumes: Record<string, number>;
}

/** What the lazily loaded engine gets from the client. */
export interface VoiceHost {
  readonly conn: RoomConnection;
  readonly state: Store<VoiceClientState>;
  readonly prefs: Prefs;
  notify(text: string, kind?: 'info' | 'warn', ms?: number): void;
}

export interface VoiceDebugInfo {
  zone: AcousticZoneId | null;
  room: string | null;
  mode: VoiceMode | null;
  link: LinkState;
  zoneRoomState: string;
  announceRoom: string | null;
  announceState: string;
  tokenExpiresIn: number | null;
  micMuted: boolean | null;
  audioContext: string;
  quality: string;
  /** Uplink RED (redundant audio) on: switched on after measured packet loss. */
  red: boolean;
  gains: { pid: string; gain: number; applied: number; quality: string; culled: boolean }[];
}

const PREFS_KEY = 'ct.voice.prefs';
/** sessionStorage flag: voice was enabled in this tab, so a reload re-enables it automatically. */
const SESSION_ON_KEY = 'ct.voice.on';

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

export function savePrefs(p: Prefs) {
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

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/(Left|Right)$/, '');
}

/** The LiveKit half; a module-level promise so a second VoiceClient (lobby switch) reuses it. */
let engineModule: Promise<typeof import('./VoiceEngine')> | null = null;
function loadEngine(): Promise<typeof import('./VoiceEngine')> {
  engineModule ??= import('./VoiceEngine').catch((e: unknown) => {
    engineModule = null; // allow another attempt (e.g. back online)
    throw e;
  });
  return engineModule;
}

export class VoiceClient implements VoiceHost {
  readonly state: Store<VoiceClientState>;
  readonly prefs = loadPrefs();
  /** Grants received before the engine exists (handed over when it starts). */
  private zoneGrant: VoiceGrant | null = null;
  private announceGrant: VoiceGrant | null = null;
  private engine: VoiceEngine | null = null;
  private offs: (() => void)[] = [];
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(readonly conn: RoomConnection) {
    this.state = createStore<VoiceClientState>({
      enabled: false,
      loading: false,
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
      conn.events.on('voice:grant', (g) => this.onGrant(g)),
      conn.events.on('voice:revoke', (r) => this.onRevoke(r)),
      conn.events.on('voice:unavailable', (u) => this.onUnavailable(u)),
    );
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

  /** Call from a user gesture (click): unlocks audio, loads the LiveKit part and asks for the
   * microphone. Also called without a gesture after a reload (see sessionFlag); playback then
   * waits for the next gesture. */
  async enable(): Promise<void> {
    const s0 = this.state.get();
    if (s0.enabled || s0.loading || this.disposed) return;
    // AudioContext must be created synchronously inside the gesture (before any await).
    let ctx: AudioContext | null = null;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      try {
        ctx = new Ctx();
        void ctx.resume().catch(() => undefined);
      } catch {
        ctx = null;
      }
    }
    this.patch({ loading: true, lastError: null });
    let mod: typeof import('./VoiceEngine');
    try {
      mod = await loadEngine();
    } catch (e) {
      void ctx?.close().catch(() => undefined);
      sessionFlag(false);
      if (this.disposed) return;
      this.patch({ loading: false, lastError: `Voice could not be loaded: ${(e as Error)?.message ?? e}` });
      this.notify('Voice could not be loaded — check your internet connection and press Enable voice again (or reload the page).', 'warn', 10_000);
      return;
    }
    if (this.disposed) {
      void ctx?.close().catch(() => undefined);
      return;
    }
    sessionFlag(true);
    this.patch({ loading: false });
    const engine = new mod.VoiceEngine(this, ctx, { zone: this.zoneGrant, announce: this.announceGrant });
    this.engine = engine;
    this.zoneGrant = null;
    this.announceGrant = null;
    await engine.start();
  }

  async retryMic(): Promise<void> {
    if (!this.engine) return this.enable();
    await this.engine.retryMic();
  }

  /** Resume playback after the browser blocked autoplay (call from a click). */
  async allowAudio(): Promise<void> {
    await this.engine?.allowAudio();
  }

  setInputMode(mode: 'ptt' | 'open') {
    this.prefs.inputMode = mode;
    savePrefs(this.prefs);
    this.patch({ inputMode: mode });
    this.engine?.settingsChanged();
  }

  setPttKey(code: string) {
    if (!/^[A-Za-z0-9]{1,24}$/.test(code)) return;
    this.prefs.pttKey = code;
    savePrefs(this.prefs);
    this.patch({ pttKey: code, pttHeld: false });
    this.engine?.settingsChanged();
  }

  setMuted(muted: boolean) {
    this.patch({ muted });
    this.engine?.settingsChanged();
  }

  setDeafened(deafened: boolean) {
    this.patch({ deafened });
    this.engine?.settingsChanged(true);
  }

  setVolume(pid: string, volume: number) {
    const v = Math.max(0, Math.min(1.5, volume));
    this.prefs.volumes[pid] = v;
    savePrefs(this.prefs);
    this.engine?.volumeChanged(pid);
  }

  async setDevice(deviceId: string) {
    this.prefs.deviceId = deviceId || null;
    savePrefs(this.prefs);
    this.patch({ deviceId: deviceId || null });
    await this.engine?.deviceChanged(deviceId);
  }

  /** Manual reconnect button. */
  reconnect() {
    this.engine?.reconnect();
  }

  // ---------------------------------------------------------------------------------------
  // Server messages (recorded until the engine exists, then forwarded)

  private onGrant(g: VoiceGrant) {
    if (this.disposed) return;
    if (this.engine) return void this.engine.onGrant(g);
    this.patch({ availability: 'available', availabilityMessage: null });
    if (g.purpose === 'announce') {
      this.announceGrant = g;
      this.patch({ announce: { ...this.state.get().announce, room: g.room, canPublish: g.canPublish } });
    } else {
      this.zoneGrant = g;
      this.patch({ zone: g.zone, room: g.room, mode: g.mode, canPublish: g.canPublish });
    }
  }

  private onRevoke(r: VoiceRevoke) {
    if (this.disposed) return;
    if (this.engine) return void this.engine.onRevoke(r);
    if (r.purpose === 'announce') {
      if (this.announceGrant?.room !== r.room) return;
      this.announceGrant = null;
      this.patch({ announce: { room: null, canPublish: false, link: 'idle' } });
      return;
    }
    if (this.zoneGrant?.room !== r.room) return;
    this.zoneGrant = null;
    this.patch({ zone: null, room: null, mode: null, canPublish: false, link: 'idle' });
  }

  private onUnavailable(u: VoiceUnavailable) {
    this.patch({ availability: u.reason, availabilityMessage: u.message });
  }

  /** Debug overlay snapshot. */
  debugInfo(): VoiceDebugInfo {
    if (this.engine) return this.engine.debugInfo();
    const s = this.state.get();
    const g = this.zoneGrant;
    return {
      zone: s.zone,
      room: s.room,
      mode: s.mode,
      link: s.link,
      zoneRoomState: s.loading ? 'loading' : 'none',
      announceRoom: s.announce.room,
      announceState: 'none',
      tokenExpiresIn: g ? Math.round((g.expiresAt - Date.now()) / 1000) : null,
      micMuted: null,
      audioContext: 'none',
      quality: 'unknown',
      red: false,
      gains: [],
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs = [];
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    const engine = this.engine;
    this.engine = null;
    await engine?.dispose();
  }
}
